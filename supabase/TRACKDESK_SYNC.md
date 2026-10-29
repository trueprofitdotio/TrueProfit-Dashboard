# Trackdesk store — rollout

## What was wrong

`trackdesk_cache` held whole paginated API responses as `jsonb`, keyed by a
SHA-256 of the exact request body. Three things followed from that shape:

1. **The key included the date range and the pagination offset.** Shifting a
   range by one day missed every page and re-crawled the whole API.
2. **Nothing ever deleted expired entries.** At the time of the rewrite the
   table held 9,038 rows, **9,015 of them (99.7%) already past their TTL**,
   totalling 989 MB against a 500 MB free-tier budget.
3. **Even a hit cost a round trip per 500-row page** — one edge-function call
   pulling back ~110 KB of jsonb that the browser then re-aggregated in JS.

The rows themselves were also ~15× larger than they needed to be: a single
conversion carried landing-page URLs, user agents, fraud objects, offer names
and normalised amounts, of which the dashboard reads six fields.

## What replaces it

Normalised rows, keyed by their own Trackdesk ids, holding only the columns the
dashboard reads — and aggregation done in SQL so a query returns a few hundred
numbers instead of half a million rows.

| Object | Role |
|---|---|
| `td_affiliates`, `td_clicks`, `td_conversions` | the store; one row per entity, ever |
| `td_sync_state` | one watermark row per resource |
| `td_affiliate_report(...)` | the whole affiliate workspace in one call |
| `td_merchant_details(...)` | the merchant drill-down |
| `td-sync` edge function | incremental pull + time-budgeted backfill |
| `td-webhook` edge function | near-realtime conversions |

The frontend reads through `services/affiliateReport.ts`, which tries the SQL
path first and **falls back to the original Trackdesk API crawl** if the store
is missing or empty. So the app keeps working at every step below, and gets
faster when step 3 finishes.

## Rollout

**1. Apply the migration — DONE (2026-10-29)**

The tables, indexes, RLS policies, helpers and both RPCs are live. RLS is on
with a SELECT-only policy for `anon`/`authenticated`, so the dashboard can read
and only the service role can write. To recreate elsewhere, run
`supabase db push`, or paste
`migrations/20261028000001_trackdesk_materialised_store.sql` into the SQL
editor. It is additive — it creates tables and functions and drops nothing.

**2. Deploy the functions — td-sync DONE (2026-10-29)**

`td-sync` is deployed with `verify_jwt: true` and answers 401 without a token,
as it should. Still to do:

```bash
supabase secrets set TRACKDESK_API_KEY=<the Trackdesk key>
```

`td-sync` cannot reach Trackdesk until that is set.

`td-webhook` is written but not deployed; it is only a latency optimisation,
so it can wait until you are ready to configure the webhook on the Trackdesk
side:

```bash
supabase functions deploy td-webhook --no-verify-jwt
supabase secrets set TD_WEBHOOK_SECRET=<a long random string you generate>
```

It needs `--no-verify-jwt` because Trackdesk cannot mint a Supabase JWT; the
shared secret is what guards it instead, and the function refuses every request
when no secret is configured.

**3. Backfill**

`td-sync` stops at a ~110s budget and saves its cursor, so call it repeatedly
until every resource reports `done: true`:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/td-sync" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "content-type: application/json" \
  -d '{"full": true}'
```

Watch progress with `select * from td_sync_state;`.

**4. Schedule the incremental run**

Every 10 minutes, via `pg_cron` + `pg_net`, or any external scheduler:

```sql
select cron.schedule('td-sync', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/td-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <service-role-key>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

Each run re-reads the last 3 hours on top of the watermark, because Trackdesk
back-dates revenue and cost onto conversions after they are first created. A
watermark alone would freeze those numbers at whatever they were when first
seen.

**5. Point Trackdesk's webhook at**

```
https://<project-ref>.supabase.co/functions/v1/td-webhook?token=<TD_WEBHOOK_SECRET>
```

This is a latency optimisation, not a correctness mechanism: the cron'd sync is
what guarantees completeness. Both write the same rows keyed by
`conversion_id`, so a duplicate delivery or an overlap with the sync window is
an upsert, never a double count. Clicks stay on the polling path — they are too
high-volume to be worth a webhook each.

**6. Drop the old cache, once step 3 has finished and the dashboard is reading
from the store**

Confirm the fast path is live first — `td_sync_state` shows `ok` for all three
resources, and the affiliate workspace returns in well under a second. Then:

```sql
drop table public.trackdesk_cache;
```

That is the 989 MB. Nothing reads the table after this migration: the old
`trackdesk-proxy` edge function still writes to it, so either leave the proxy
deployed and let the writes fail harmlessly, or delete the function at the same
time. The fallback path in `affiliateReport.ts` calls the proxy, so keep the
function if you want that safety net — just recreate the table, or edit the
proxy to skip its caching block.

## Expected size

Narrow rows run roughly 80–120 bytes against ~1.2 KB of jsonb per entity, and
the old table stored the same click once per overlapping range it appeared in.
Between the field reduction and the de-duplication the store should land well
inside the free tier. Check after the backfill:

```sql
select relname, pg_size_pretty(pg_total_relation_size(c.oid))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and relname like 'td_%'
order by pg_total_relation_size(c.oid) desc;
```
