// ---------------------------------------------------------------------------
// td-webhook — Trackdesk pushes conversion events here.
//
// The cron'd td-sync run is what guarantees completeness; this only shortens
// the lag between a conversion happening and the dashboard showing it, from
// "next sync" to "a second or two". Both write the same rows keyed by
// conversion_id, so a duplicate delivery or an overlap with the sync window is
// an upsert, not a double count.
//
// Deployed with verify_jwt = false (Trackdesk cannot mint a Supabase JWT), so
// the shared secret below is the only thing standing in front of it.
//
// Point Trackdesk at:
//   https://<project-ref>.supabase.co/functions/v1/td-webhook?token=<TD_WEBHOOK_SECRET>
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const num = (v: unknown): number => {
  const n = parseFloat(String((v as { value?: string } | null)?.value ?? v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

/** Trackdesk nests the conversion differently per event type; accept either. */
function extract(payload: Record<string, any>): Record<string, any> | null {
  const c = payload.conversion ?? payload.data?.conversion ?? payload.data ?? payload;
  return c && (c.conversionId || c.id) ? c : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("TD_WEBHOOK_SECRET") ?? "";
  const presented = new URL(req.url).searchParams.get("token")
    ?? req.headers.get("x-webhook-token")
    ?? "";

  // Without a configured secret the endpoint would be an open write path.
  if (!secret || presented !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const c = extract(payload);
    if (!c) {
      // Nothing recognisable to store, but a non-2xx would make Trackdesk
      // retry a payload that will never parse.
      return new Response(JSON.stringify({ ok: true, skipped: "no conversion in payload" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await db.from("td_conversions").upsert({
      conversion_id: c.conversionId ?? c.id,
      created_at: c.createdAt ?? new Date().toISOString(),
      affiliate_id: c.source?.publicId ?? c.affiliate?.publicId ?? null,
      customer_id: c.customerId ?? null,
      type: (c.conversionType?.name ?? c.type ?? "").toLowerCase() || null,
      revenue: num(c.revenue),
      cost: num(c.cost),
      cid: c.cid ?? null,
      country_code: c.countryCode ?? null,
      status: c.conversionStatus ?? null,
    }, { onConflict: "conversion_id" });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
