// ---------------------------------------------------------------------------
// td-sync — pulls Trackdesk into the materialised store.
//
// Runs in two modes against the same code path:
//
//   incremental (default) — picks up from the watermark in td_sync_state,
//     re-reading a short overlap window because Trackdesk back-dates revenue
//     and cost onto conversions after they are first created.
//
//   backfill (`{"full": true}`) — starts from BACKFILL_START and walks
//     forward. Edge functions get cut off well before years of clicks can be
//     read, so the walk is time-budgeted: it saves its cursor and returns
//     `done: false`, and the caller simply invokes it again until `done`.
//
// Either way the unit of work is a time window, not a page, so an invocation
// that dies mid-way only costs the current window.
// ---------------------------------------------------------------------------

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const TRACKDESK_BASE = "https://trueprofit.trackdesk.com";
const BACKFILL_START = "2023-01-01T00:00:00.000Z";

// How far back to re-read on every incremental run. Conversions are mutable
// for a while after creation, so a watermark alone would freeze stale numbers.
const OVERLAP_MINUTES = 180;

// Leave headroom under the platform's wall-clock limit to flush the last batch.
const TIME_BUDGET_MS = 110_000;

const PAGE_SIZE = 500;
const UPSERT_CHUNK = 1000;

type Resource = "affiliates" | "clicks" | "conversions";

const WINDOW_DAYS: Record<Resource, number> = {
  affiliates: 3650, // small table, one pass
  clicks: 7,
  conversions: 30,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Page<T> {
  rows?: T[];
  affiliates?: T[];
  pagination?: { hasMore?: boolean; totalCount?: number };
}

async function trackdesk<T>(endpoint: string, body: unknown): Promise<Page<T>> {
  const res = await fetch(`${TRACKDESK_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-tenant-id": "trueprofit",
      "x-api-key": Deno.env.get("TRACKDESK_API_KEY") ?? "",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Trackdesk ${endpoint} ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

/** Reads every page of one window, which is bounded enough to hold in memory. */
async function readWindow<T>(endpoint: string, filters: unknown): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const page = await trackdesk<T>(endpoint, {
      filters,
      pagination: { limit: PAGE_SIZE, offset },
    });
    const rows = page.rows ?? page.affiliates ?? [];
    out.push(...rows);
    if (!page.pagination?.hasMore || rows.length === 0) break;
    offset += PAGE_SIZE;
  }
  return out;
}

const num = (v: unknown): number => {
  const n = parseFloat(String((v as { value?: string } | null)?.value ?? v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

// Only the columns the dashboard reads. The rest of each Trackdesk row — user
// agents, landing-page URLs, fraud objects, normalised amounts — is what made
// the old response cache a gigabyte.
const map = {
  affiliates: (r: Record<string, any>) => ({
    public_id: r.publicId,
    account_id: r.accountId ?? null,
    name: r.name ?? null,
    email: r.email ?? null,
    tier_name: r.tierName ?? null,
    registered_at: r.registeredAt ?? null,
    updated_at: new Date().toISOString(),
  }),
  clicks: (r: Record<string, any>) => ({
    cid: r.cid,
    created_at: r.createdAt,
    affiliate_id: r.source?.publicId ?? null,
    country_code: r.countryCode ?? null,
  }),
  conversions: (r: Record<string, any>) => ({
    conversion_id: r.conversionId,
    created_at: r.createdAt,
    affiliate_id: r.source?.publicId ?? null,
    customer_id: r.customerId ?? null,
    type: (r.conversionType?.name ?? "").toLowerCase() || null,
    revenue: num(r.revenue),
    cost: num(r.cost),
    cid: r.cid ?? null,
    country_code: r.countryCode ?? null,
    status: r.conversionStatus ?? null,
  }),
} as const;

const TABLE: Record<Resource, string> = {
  affiliates: "td_affiliates",
  clicks: "td_clicks",
  conversions: "td_conversions",
};

const CONFLICT: Record<Resource, string> = {
  affiliates: "public_id",
  clicks: "cid",
  conversions: "conversion_id",
};

const ENDPOINT: Record<Resource, string> = {
  affiliates: "/api/node/affiliates/v1",
  clicks: "/api/reports/click-report/v1",
  conversions: "/api/reports/conversion-report/v1",
};

async function upsert(db: SupabaseClient, resource: Resource, rows: unknown[]) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await db
      .from(TABLE[resource])
      .upsert(chunk, { onConflict: CONFLICT[resource], ignoreDuplicates: false });
    if (error) throw new Error(`upsert ${resource}: ${error.message}`);
  }
}

async function syncResource(
  db: SupabaseClient,
  resource: Resource,
  opts: { full: boolean; startedAt: number },
) {
  const { data: state } = await db
    .from("td_sync_state")
    .select("last_synced_at")
    .eq("resource", resource)
    .maybeSingle();

  const now = new Date();
  let cursor = opts.full
    ? new Date(BACKFILL_START)
    : state?.last_synced_at
      ? new Date(new Date(state.last_synced_at).getTime() - OVERLAP_MINUTES * 60_000)
      : new Date(BACKFILL_START);

  let ingested = 0;
  let done = true;

  // Affiliates have no usable time filter on the list endpoint, so they are
  // read whole — a few hundred rows, cheap enough to refresh every run.
  if (resource === "affiliates") {
    const rows = await readWindow<Record<string, any>>(ENDPOINT.affiliates, {});
    const mapped = rows.filter((r) => r.publicId).map(map.affiliates);
    await upsert(db, resource, mapped);
    ingested = mapped.length;
    cursor = now;
  } else {
    const windowMs = WINDOW_DAYS[resource] * 864e5;
    while (cursor < now) {
      if (Date.now() - opts.startedAt > TIME_BUDGET_MS) {
        done = false;
        break;
      }
      const windowEnd = new Date(Math.min(cursor.getTime() + windowMs, now.getTime()));
      const rows = await readWindow<Record<string, any>>(ENDPOINT[resource], {
        timeRange: { from: cursor.toISOString(), to: windowEnd.toISOString() },
      });

      const key = CONFLICT[resource];
      const mapper = map[resource] as (r: Record<string, any>) => Record<string, unknown>;
      // Trackdesk can repeat a row across page boundaries; upsert would then
      // fail with "cannot affect row a second time" inside one statement.
      const deduped = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        const row = mapper(r);
        if (row[key]) deduped.set(String(row[key]), row);
      }

      await upsert(db, resource, [...deduped.values()]);
      ingested += deduped.size;
      cursor = windowEnd;
    }
  }

  await db.from("td_sync_state").upsert(
    {
      resource,
      last_synced_at: cursor.toISOString(),
      last_run_at: new Date().toISOString(),
      rows_ingested: ingested,
      status: done ? "ok" : "partial",
      message: done ? null : "time budget reached; call again to continue",
    },
    { onConflict: "resource" },
  );

  return { resource, ingested, done, cursor: cursor.toISOString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let body: { resource?: Resource | "all"; full?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // A cron ping with no body means "incremental, everything".
    }

    const requested = body.resource && body.resource !== "all"
      ? [body.resource]
      : (["affiliates", "conversions", "clicks"] as Resource[]);

    const results = [];
    for (const resource of requested) {
      results.push(await syncResource(db, resource, { full: !!body.full, startedAt }));
    }

    return new Response(
      JSON.stringify({ ok: true, tookMs: Date.now() - startedAt, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
