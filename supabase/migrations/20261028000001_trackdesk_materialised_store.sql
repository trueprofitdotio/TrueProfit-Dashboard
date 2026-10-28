-- ============================================================================
-- Trackdesk materialised store
--
-- Replaces `trackdesk_cache`, which kept whole paginated API responses as
-- jsonb keyed by a hash of the exact request body. Three things went wrong
-- with that shape:
--
--   1. The key included the date range and the pagination offset, so shifting
--      a range by one day missed every page and re-crawled the API.
--   2. Nothing ever deleted expired entries, so the table grew to ~1 GB, of
--      which 99.7% was past its TTL.
--   3. Even a hit cost one edge-function round trip per 500-row page, each
--      pulling back ~110 KB of jsonb the browser then had to re-aggregate.
--
-- Here the rows themselves are the cache. Every click, conversion and
-- affiliate lands exactly once, keyed by its own Trackdesk id, carrying only
-- the fields the dashboard reads. Aggregation happens in SQL, so a query
-- returns a few hundred numbers instead of half a million rows.
-- ============================================================================

-- --- Entity tables ---------------------------------------------------------

create table if not exists public.td_affiliates (
  public_id      text primary key,
  account_id     text,
  name           text,
  email          text,
  tier_name      text,
  registered_at  timestamptz,
  updated_at     timestamptz not null default now()
);

create index if not exists td_affiliates_registered_idx on public.td_affiliates (registered_at);
create index if not exists td_affiliates_tier_idx       on public.td_affiliates (tier_name);

create table if not exists public.td_clicks (
  cid           text primary key,
  created_at    timestamptz not null,
  affiliate_id  text,
  country_code  text
);

create index if not exists td_clicks_created_idx     on public.td_clicks (created_at);
create index if not exists td_clicks_aff_created_idx on public.td_clicks (affiliate_id, created_at);

create table if not exists public.td_conversions (
  conversion_id text primary key,
  created_at    timestamptz not null,
  affiliate_id  text,
  customer_id   text,
  type          text,
  revenue       numeric(16,4) not null default 0,
  cost          numeric(16,4) not null default 0,
  cid           text,
  country_code  text,
  status        text
);

create index if not exists td_conv_created_idx       on public.td_conversions (created_at);
create index if not exists td_conv_aff_created_idx   on public.td_conversions (affiliate_id, created_at);
create index if not exists td_conv_customer_idx      on public.td_conversions (customer_id, created_at);
create index if not exists td_conv_type_created_idx  on public.td_conversions (type, created_at);

-- One row per resource; the sync worker reads the watermark and writes it back.
create table if not exists public.td_sync_state (
  resource        text primary key,
  last_synced_at  timestamptz,
  last_run_at     timestamptz,
  rows_ingested   bigint not null default 0,
  status          text,
  message         text
);

insert into public.td_sync_state (resource, status)
values ('affiliates', 'pending'), ('clicks', 'pending'), ('conversions', 'pending')
on conflict (resource) do nothing;

-- --- Helpers ---------------------------------------------------------------

-- The dashboard only ever splits affiliates two ways. Keeping the mapping here
-- means the tier filter, the summary split and the breakdown table can never
-- drift from one another.
create or replace function public.td_tier(p_tier_name text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_tier_name, 'NonKOL') in ('KOL (Old Offer)', 'KOL (New Offer)', 'Standard')
      then 'KOL'
    else 'NonKOL'
  end;
$$;

-- Trackdesk timestamps are UTC; the dashboard reports days in GMT+7.
create or replace function public.td_day(p_at timestamptz)
returns date
language sql
immutable
as $$
  select (p_at at time zone 'Asia/Bangkok')::date;
$$;

-- --- The report ------------------------------------------------------------

-- Everything the affiliate workspace renders, for both the selected period and
-- its comparison period, in one round trip.
create or replace function public.td_affiliate_report(
  p_from          timestamptz,
  p_to            timestamptz,
  p_prev_from     timestamptz,
  p_prev_to       timestamptz,
  p_tier          text default 'All',
  p_affiliate_ids text[] default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_scope  text[];
  v_result jsonb;
begin
  -- Resolve the affiliate scope once. An explicit selection wins over the tier
  -- filter, matching the order the filter bar applies them.
  if p_affiliate_ids is not null and cardinality(p_affiliate_ids) > 0 then
    v_scope := p_affiliate_ids;
  elsif p_tier is not null and p_tier <> 'All' then
    select array_agg(public_id) into v_scope
    from public.td_affiliates
    where public.td_tier(tier_name) = p_tier;
    v_scope := coalesce(v_scope, array[]::text[]);
  else
    v_scope := null;
  end if;

  with scope as (
    select a.public_id,
           a.account_id,
           a.name,
           coalesce(a.tier_name, 'NonKOL') as tier_name,
           public.td_tier(a.tier_name)     as tier,
           a.registered_at
    from public.td_affiliates a
    where v_scope is null or a.public_id = any(v_scope)
  ),

  -- Per-affiliate aggregates, both periods in one pass over each table. -----

  sig as (
    select s.public_id as aff,
           count(*) filter (where s.registered_at >= p_from      and s.registered_at <= p_to)      as cur,
           count(*) filter (where s.registered_at >= p_prev_from and s.registered_at <= p_prev_to) as prev
    from scope s
    where s.registered_at is not null
    group by s.public_id
  ),

  clk as (
    select c.affiliate_id as aff,
           count(*) filter (where c.created_at >= p_from      and c.created_at <= p_to)      as cur,
           count(*) filter (where c.created_at >= p_prev_from and c.created_at <= p_prev_to) as prev
    from public.td_clicks c
    join scope s on s.public_id = c.affiliate_id
    where c.created_at >= least(p_from, p_prev_from)
      and c.created_at <= greatest(p_to, p_prev_to)
    group by c.affiliate_id
  ),

  cnv as (
    select v.affiliate_id as aff,
           count(*) filter (where v.type = 'install' and v.created_at >= p_from and v.created_at <= p_to)                as installs_cur,
           count(*) filter (where v.type = 'install' and v.created_at >= p_prev_from and v.created_at <= p_prev_to)      as installs_prev,
           coalesce(sum(v.revenue) filter (where v.created_at >= p_from and v.created_at <= p_to), 0)                    as revenue_cur,
           coalesce(sum(v.revenue) filter (where v.created_at >= p_prev_from and v.created_at <= p_prev_to), 0)          as revenue_prev,
           coalesce(sum(v.cost)    filter (where v.created_at >= p_from and v.created_at <= p_to), 0)                    as payouts_cur,
           coalesce(sum(v.cost)    filter (where v.created_at >= p_prev_from and v.created_at <= p_prev_to), 0)          as payouts_prev
    from public.td_conversions v
    join scope s on s.public_id = v.affiliate_id
    where v.created_at >= least(p_from, p_prev_from)
      and v.created_at <= greatest(p_to, p_prev_to)
    group by v.affiliate_id
  ),

  by_aff as (
    select s.public_id,
           s.name,
           s.tier_name,
           s.tier,
           s.registered_at,
           coalesce(sig.cur, 0)           as signups,
           coalesce(sig.prev, 0)          as signups_prev,
           coalesce(clk.cur, 0)           as clicks,
           coalesce(clk.prev, 0)          as clicks_prev,
           coalesce(cnv.installs_cur, 0)  as installs,
           coalesce(cnv.installs_prev, 0) as installs_prev,
           coalesce(cnv.revenue_cur, 0)   as revenue,
           coalesce(cnv.revenue_prev, 0)  as revenue_prev,
           coalesce(cnv.payouts_cur, 0)   as payouts,
           coalesce(cnv.payouts_prev, 0)  as payouts_prev
    from scope s
    left join sig on sig.aff = s.public_id
    left join clk on clk.aff = s.public_id
    left join cnv on cnv.aff = s.public_id
  ),

  -- Daily series for the selected period, bucketed in GMT+7. ----------------

  daily_parts as (
    select public.td_day(s.registered_at) as day, 1 as signups, 0 as clicks, 0 as installs,
           0::numeric as revenue, 0::numeric as payouts
    from scope s
    where s.registered_at between p_from and p_to
    union all
    select public.td_day(c.created_at), 0, 1, 0, 0, 0
    from public.td_clicks c
    join scope s on s.public_id = c.affiliate_id
    where c.created_at between p_from and p_to
    union all
    select public.td_day(v.created_at), 0, 0,
           case when v.type = 'install' then 1 else 0 end,
           v.revenue, v.cost
    from public.td_conversions v
    join scope s on s.public_id = v.affiliate_id
    where v.created_at between p_from and p_to
  ),

  daily as (
    select day,
           sum(signups)::bigint  as signups,
           sum(clicks)::bigint   as clicks,
           sum(installs)::bigint as installs,
           sum(revenue)          as revenue,
           sum(payouts)          as payouts
    from daily_parts
    group by day
  ),

  -- Merchant lifetime stats. --------------------------------------------------
  -- History is deliberately not scoped to the affiliate filter: a merchant's
  -- install and payout history counts in full, whoever referred each event.

  touched as (
    select distinct v.customer_id
    from public.td_conversions v
    join scope s on s.public_id = v.affiliate_id
    where v.customer_id is not null
      and ((v.created_at between p_from and p_to) or (v.created_at between p_prev_from and p_prev_to))
  ),

  hist as (
    select v.customer_id, v.created_at, v.type
    from public.td_conversions v
    join touched t on t.customer_id = v.customer_id
  ),

  periods as (
    select 'cur'::text as k, p_from as f, p_to as t
    union all
    select 'prev', p_prev_from, p_prev_to
  ),

  per_cust as (
    select p.k,
           h.customer_id,
           min(h.created_at) filter (where h.type = 'install')                      as installed_at,
           bool_or(h.created_at >= p.f) filter (where h.type = 'install')           as install_in_period,
           max(h.created_at) filter (where h.type = 'payout')                       as latest_payout_at,
           count(*) filter (where h.type = 'payout')                                as payout_count
    from periods p
    join hist h on h.created_at <= p.t
    group by p.k, h.customer_id
  ),

  merch as (
    select pc.k,
           count(*) filter (where paying.ok)                             as paying,
           count(*) filter (where paying.ok and pc.payout_count = 1)     as payout_one,
           count(*) filter (where paying.ok and pc.payout_count between 2 and 3) as payout_le_three,
           count(*) filter (where paying.ok and pc.payout_count > 3)     as payout_gt_three,
           count(*) filter (where coalesce(pc.install_in_period, false) or paying.ok) as referred,
           coalesce(avg(round(extract(epoch from (pc.latest_payout_at - pc.installed_at)) / 86400))
             filter (where paying.ok and pc.installed_at is not null
                       and pc.latest_payout_at >= pc.installed_at), 0)   as avg_lifetime
    from per_cust pc
    join periods p on p.k = pc.k
    cross join lateral (select pc.latest_payout_at is not null and pc.latest_payout_at >= p.f as ok) paying
    group by pc.k
  )

  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'signups',      coalesce(sum(signups), 0),
        'clicks',       coalesce(sum(clicks), 0),
        'installs',     coalesce(sum(installs), 0),
        'revenue',      coalesce(sum(revenue), 0),
        'payouts',      coalesce(sum(payouts), 0),
        'signupsPrev',  coalesce(sum(signups_prev), 0),
        'clicksPrev',   coalesce(sum(clicks_prev), 0),
        'installsPrev', coalesce(sum(installs_prev), 0),
        'revenuePrev',  coalesce(sum(revenue_prev), 0),
        'payoutsPrev',  coalesce(sum(payouts_prev), 0)
      )
      from by_aff
    ),
    'byTier', (
      select coalesce(jsonb_object_agg(tier, metrics), '{}'::jsonb)
      from (
        select tier,
               jsonb_build_object(
                 'signups',  coalesce(sum(signups), 0),
                 'clicks',   coalesce(sum(clicks), 0),
                 'installs', coalesce(sum(installs), 0),
                 'revenue',  coalesce(sum(revenue), 0),
                 'payouts',  coalesce(sum(payouts), 0),
                 'prev', jsonb_build_object(
                   'signups',  coalesce(sum(signups_prev), 0),
                   'clicks',   coalesce(sum(clicks_prev), 0),
                   'installs', coalesce(sum(installs_prev), 0),
                   'revenue',  coalesce(sum(revenue_prev), 0),
                   'payouts',  coalesce(sum(payouts_prev), 0)
                 )
               ) as metrics
        from by_aff
        group by tier
      ) t
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date',     to_char(day, 'YYYY-MM-DD'),
        'signups',  signups,
        'clicks',   clicks,
        'installs', installs,
        'revenue',  revenue,
        'payouts',  payouts
      ) order by day), '[]'::jsonb)
      from daily
    ),
    'affiliates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'affiliateId',   public_id,
        'affiliateName', coalesce(name, 'Unknown'),
        'tierName',      tier_name,
        'clicks',        clicks,
        'clicksPrev',    clicks_prev,
        'installs',      installs,
        'installsPrev',  installs_prev,
        'revenue',       revenue,
        'revenuePrev',   revenue_prev,
        'payout',        payouts,
        'registeredAt',  registered_at
      )), '[]'::jsonb)
      from by_aff
      where clicks >= 1 or installs >= 1 or revenue > 0
    ),
    'merchants', jsonb_build_object(
      'totalReferredMerchants',     coalesce((select referred        from merch where k = 'cur'), 0),
      'totalPayingMerchants',       coalesce((select paying          from merch where k = 'cur'), 0),
      'payoutOneCount',             coalesce((select payout_one      from merch where k = 'cur'), 0),
      'payoutLeThreeCount',         coalesce((select payout_le_three from merch where k = 'cur'), 0),
      'payoutGtThreeCount',         coalesce((select payout_gt_three from merch where k = 'cur'), 0),
      'avgLifetime',                coalesce((select avg_lifetime    from merch where k = 'cur'), 0),
      'totalReferredMerchantsPrev', coalesce((select referred        from merch where k = 'prev'), 0),
      'totalPayingMerchantsPrev',   coalesce((select paying          from merch where k = 'prev'), 0),
      'payoutOneCountPrev',         coalesce((select payout_one      from merch where k = 'prev'), 0),
      'payoutLeThreeCountPrev',     coalesce((select payout_le_three from merch where k = 'prev'), 0),
      'payoutGtThreeCountPrev',     coalesce((select payout_gt_three from merch where k = 'prev'), 0)
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Per-merchant detail rows for the drill-down table.
create or replace function public.td_merchant_details(
  p_from          timestamptz,
  p_to            timestamptz,
  p_affiliate_ids text[] default null
)
returns jsonb
language sql
stable
as $$
  with touched as (
    select distinct v.customer_id, v.affiliate_id
    from public.td_conversions v
    where v.customer_id is not null
      and v.created_at between p_from and p_to
      and (p_affiliate_ids is null or cardinality(p_affiliate_ids) = 0 or v.affiliate_id = any(p_affiliate_ids))
  ),
  agg as (
    select t.customer_id,
           min(t.affiliate_id)                                                   as affiliate_id,
           min(v.created_at) filter (where v.type = 'install')                   as installed_at,
           max(v.created_at) filter (where v.type = 'payout')                    as last_payout_at,
           count(*) filter (where v.type = 'payout')                             as payout_count,
           coalesce(sum(v.revenue), 0)                                           as lifetime_revenue,
           coalesce(sum(v.cost), 0)                                              as lifetime_payout,
           coalesce(sum(v.revenue) filter (where v.created_at between p_from and p_to), 0) as revenue_in_period,
           coalesce(sum(v.cost)    filter (where v.created_at between p_from and p_to), 0) as payout_in_period
    from touched t
    join public.td_conversions v on v.customer_id = t.customer_id
    group by t.customer_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'customerId',          a.customer_id,
    'affiliateId',         a.affiliate_id,
    'affiliateName',       coalesce(af.name, 'Unknown'),
    'revenueInPeriod',     a.revenue_in_period,
    'payoutInPeriod',      a.payout_in_period,
    'status',              case when a.payout_count > 0 then 'Paying' else 'Install' end,
    'installedDate',       a.installed_at,
    'lastPayoutDate',      a.last_payout_at,
    'merchantLifetimeDays', case
                              when a.installed_at is not null and a.last_payout_at >= a.installed_at
                                then round(extract(epoch from (a.last_payout_at - a.installed_at)) / 86400)
                              else null
                            end,
    'totalLifetimeRevenue', a.lifetime_revenue,
    'totalLifetimePayout',  a.lifetime_payout,
    'payoutCount',          a.payout_count
  )), '[]'::jsonb)
  from agg a
  left join public.td_affiliates af on af.public_id = a.affiliate_id;
$$;

-- --- Access ----------------------------------------------------------------
-- The dashboard reads with the publishable key; only the sync worker (service
-- role, which bypasses RLS) ever writes.

alter table public.td_affiliates  enable row level security;
alter table public.td_clicks      enable row level security;
alter table public.td_conversions enable row level security;
alter table public.td_sync_state  enable row level security;

drop policy if exists td_affiliates_read  on public.td_affiliates;
drop policy if exists td_clicks_read      on public.td_clicks;
drop policy if exists td_conversions_read on public.td_conversions;
drop policy if exists td_sync_state_read  on public.td_sync_state;

create policy td_affiliates_read  on public.td_affiliates  for select to anon, authenticated using (true);
create policy td_clicks_read      on public.td_clicks      for select to anon, authenticated using (true);
create policy td_conversions_read on public.td_conversions for select to anon, authenticated using (true);
create policy td_sync_state_read  on public.td_sync_state  for select to anon, authenticated using (true);

grant execute on function public.td_affiliate_report(timestamptz, timestamptz, timestamptz, timestamptz, text, text[]) to anon, authenticated;
grant execute on function public.td_merchant_details(timestamptz, timestamptz, text[]) to anon, authenticated;
