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

## Rollout — DONE (2026-10-29)

All of it is live on the project. What is in place:

| Piece | State |
|---|---|
| Tables, indexes, RLS | created; RLS on, SELECT-only policy for `anon`/`authenticated`, so only the service role writes |
| `td_tier`, `td_day` | created |
| `td_affiliate_report`, `td_merchant_details` | created, execute granted to `anon`/`authenticated` |
| `td-sync` | deployed, `verify_jwt: true` |
| `TRACKDESK_API_KEY` | set as an Edge Function secret |
| Backfill | complete: 1,169 affiliates, 1,955 conversions, 33,477 clicks |
| Incremental sync | `cron.job` 1, `td-sync-incremental`, every 10 minutes via `pg_net` |
| `td-webhook` | written, NOT deployed — see below |

Measured after the backfill: a one-month report runs in 92 ms and a
three-year one in 118 ms, against a store of 11.4 MB. The old cache is 989 MB
and is still sitting there; see the last section.

### A bug the first backfill ran into

The first backfill run looked like it was working and was not. `td-sync` read

```ts
let cursor = opts.full ? new Date(BACKFILL_START) : ...
```

so `{"full": true}` restarted the walk at 2023-01-01 on *every* call. Each
invocation re-read the same early windows, spent its whole 110-second budget
upserting rows it already had, and wrote a cursor that the next call then
ignored. Sixteen calls — about thirty minutes — advanced exactly as far as the
first one.

`full` now resumes from the saved cursor and only falls back to
`BACKFILL_START` when there is no watermark; `{"restart": true}` is the
explicit way to walk the whole range again. With that fixed, the remaining
four months of clicks took one 48-second call.

The symptom to watch for, if this ever recurs: the `cursor` in the response
moving backwards between calls.

### Still to do

`td-webhook` is written but not deployed. It only shortens the lag between a
conversion happening and the dashboard showing it — the cron'd sync is what
guarantees completeness — and it needs the Trackdesk side configured too:

```bash
supabase functions deploy td-webhook --no-verify-jwt
supabase secrets set TD_WEBHOOK_SECRET=<a long random string you generate>
```

Then point Trackdesk at
`https://<project-ref>.supabase.co/functions/v1/td-webhook?token=<TD_WEBHOOK_SECRET>`.
It needs `--no-verify-jwt` because Trackdesk cannot mint a Supabase JWT; the
shared secret guards it instead, and the function refuses every request while
no secret is configured.

### The old cache — DROPPED (2026-10-29)

`trackdesk_cache` and the `trackdesk-proxy` function are both gone. The
database went from **1026 MB to 38 MB**, comfortably back under the 500 MB
free-tier limit, with the store holding more than the cache ever did: the
complete history, deduplicated, instead of overlapping slices of it.

The client-side fallback that called `trackdesk-proxy` went with them, and so
did the Trackdesk API key that had to be hardcoded in `constants.tsx` for it —
the browser bundle no longer contains a Trackdesk credential of any kind.
**Rotate that key in Trackdesk**: it shipped to every browser that opened the
dashboard for as long as it lived in that file. Rotating it now means changing
one Edge Function secret and nothing else.

`components/PartnerAnalysis.tsx` was deleted in the same pass. It had not been
imported by anything for some time and was the only other consumer of the
removed service.

There is no API fallback any more. If the store is not synced the dashboard
says so and names `td_sync_state`, rather than quietly showing zeroes.

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
