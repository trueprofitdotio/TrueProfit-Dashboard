-- ============================================================================
-- Daily installs, attributed
--
-- The daily series told the dashboard how many installs landed on a day but
-- not who produced them, so the one question a partnerships lead asks of a
-- spike — "which affiliate was that?" — could only be answered by changing the
-- filter and reloading.
--
-- Each daily row now carries the per-affiliate split of its installs: the top
-- six by volume, plus the remainder rolled into one figure so a busy day in a
-- large programme cannot blow the payload up. Everything else in the report is
-- unchanged; this is `td_affiliate_report` re-declared with the daily block
-- extended.
-- ============================================================================

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

  -- Who produced each day's installs. ---------------------------------------
  -- Ranked per day so the tooltip can name the ones that matter and count the
  -- rest, rather than carrying a row per affiliate per day across the range.

  inst_by_aff as (
    select public.td_day(v.created_at) as day,
           v.affiliate_id              as aff,
           count(*)                    as installs
    from public.td_conversions v
    join scope s on s.public_id = v.affiliate_id
    where v.type = 'install'
      and v.created_at between p_from and p_to
    group by 1, 2
  ),

  inst_ranked as (
    select day, aff, installs,
           row_number() over (partition by day order by installs desc, aff) as rn
    from inst_by_aff
  ),

  inst_daily as (
    select r.day,
           coalesce(
             jsonb_agg(jsonb_build_object(
               'affiliateId',   r.aff,
               'affiliateName', coalesce(a.name, 'Unknown'),
               'installs',      r.installs
             ) order by r.installs desc, r.aff) filter (where r.rn <= 6),
             '[]'::jsonb
           )                                                      as top,
           coalesce(sum(r.installs) filter (where r.rn > 6), 0) as rest_installs,
           count(*) filter (where r.rn > 6)                     as rest_affiliates
    from inst_ranked r
    left join public.td_affiliates a on a.public_id = r.aff
    group by r.day
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
           count(*) filter (where paying.ok)                                         as paying,
           count(*) filter (where coalesce(pc.install_in_period, false) or paying.ok) as referred,
           coalesce(avg(round(extract(epoch from (pc.latest_payout_at - pc.installed_at)) / 86400))
             filter (where paying.ok and pc.installed_at is not null
                       and pc.latest_payout_at >= pc.installed_at), 0)                as avg_lifetime,
           -- The raw tenure of every paying merchant, not three pre-made
           -- buckets. A payout count is a number of months subscribed, so the
           -- dashboard reads it as a retention curve; bucketing it here would
           -- throw away exactly the shape that curve is made of.
           coalesce(array_agg(pc.payout_count) filter (where paying.ok), '{}')        as payout_counts
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
        'date',           to_char(d.day, 'YYYY-MM-DD'),
        'signups',        d.signups,
        'clicks',         d.clicks,
        'installs',       d.installs,
        'revenue',        d.revenue,
        'payouts',        d.payouts,
        'installsBy',     coalesce(i.top, '[]'::jsonb),
        'installsByRest', jsonb_build_object(
          'affiliates', coalesce(i.rest_affiliates, 0),
          'installs',   coalesce(i.rest_installs, 0)
        )
      ) order by d.day), '[]'::jsonb)
      from daily d
      left join inst_daily i on i.day = d.day
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
      'totalReferredMerchants',     coalesce((select referred     from merch where k = 'cur'), 0),
      'totalPayingMerchants',       coalesce((select paying       from merch where k = 'cur'), 0),
      'avgLifetime',                coalesce((select avg_lifetime from merch where k = 'cur'), 0),
      'totalReferredMerchantsPrev', coalesce((select referred     from merch where k = 'prev'), 0),
      'totalPayingMerchantsPrev',   coalesce((select paying       from merch where k = 'prev'), 0),
      'payoutCounts',     to_jsonb(coalesce((select payout_counts from merch where k = 'cur'),  '{}'::bigint[])),
      'payoutCountsPrev', to_jsonb(coalesce((select payout_counts from merch where k = 'prev'), '{}'::bigint[]))
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.td_affiliate_report(timestamptz, timestamptz, timestamptz, timestamptz, text, text[]) to anon, authenticated;
