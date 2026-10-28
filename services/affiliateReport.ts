import { supabaseClient } from './supabaseClient';
import { fetchAffiliates, fetchClickReport, fetchConversionReport } from './trackdeskService';
import {
    Affiliate,
    AffiliateReport,
    ClickReportRow,
    ConversionReportRow,
    DailyData,
    DateRange,
    MerchantOverview,
    ProcessedMetrics,
    SummaryData,
    TopAffiliateData,
} from '../types';
import { getGmt7DateString, toGmt7EndOfDay } from '../utils/timeHelper';

// ---------------------------------------------------------------------------
// One report, two backends.
//
// The fast path asks Postgres for numbers that are already aggregated, so a
// year-long range comes back as a few hundred rows instead of half a million.
// The slow path is the original behaviour — crawl the Trackdesk API and add it
// up in the browser — kept so the dashboard keeps working on a database where
// the materialised store has not been created or filled yet.
//
// Both produce the same shape, so nothing above this line has to know which
// one answered.
// ---------------------------------------------------------------------------

const KOL_TIERS = new Set(['KOL (Old Offer)', 'KOL (New Offer)', 'Standard']);

export const normalizeTier = (tierName?: string): 'KOL' | 'NonKOL' =>
    KOL_TIERS.has(tierName || 'NonKOL') ? 'KOL' : 'NonKOL';

const emptyMetrics = (): ProcessedMetrics => ({ signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 });

const emptyMerchants = (): MerchantOverview => ({
    totalReferredMerchants: 0,
    totalPayingMerchants: 0,
    avgLifetime: 0,
    totalReferredMerchantsPrev: 0,
    totalPayingMerchantsPrev: 0,
    payoutCounts: [],
    payoutCountsPrev: [],
});

export interface ReportParams {
    dateRange: DateRange;
    prevDateRange: DateRange;
    tier: string;
    /** Trackdesk accountIds as chosen in the filter bar. */
    selectedAccountIds: string[];
    allAffiliates: Affiliate[];
}

/** Resolves the filter bar's selection down to the publicIds the data is keyed by. */
const resolveScope = ({ tier, selectedAccountIds, allAffiliates }: ReportParams): string[] | null => {
    if (selectedAccountIds.length > 0) {
        return allAffiliates.filter(a => selectedAccountIds.includes(a.accountId)).map(a => a.publicId);
    }
    if (tier !== 'All') {
        return allAffiliates.filter(a => normalizeTier(a.tierName) === tier).map(a => a.publicId);
    }
    return null;
};

/* Is the store actually filled?

   A missing RPC throws and falls through on its own, but a store that exists
   and has not been backfilled yet is worse: the RPC answers successfully with
   zeroes, which are indistinguishable from a genuinely quiet range. So the
   sync watermarks are checked once per session, and anything short of a
   completed affiliates-and-conversions sync keeps the whole app on the API. */
let storeReadyPromise: Promise<boolean> | null = null;

function isStoreReady(): Promise<boolean> {
    storeReadyPromise ??= (async () => {
        try {
            const { data, error } = await supabaseClient
                .from('td_sync_state')
                .select('resource, last_synced_at');
            if (error || !data) return false;
            const synced = new Set(
                (data as { resource: string; last_synced_at: string | null }[])
                    .filter(row => row.last_synced_at)
                    .map(row => row.resource),
            );
            return synced.has('affiliates') && synced.has('conversions');
        } catch {
            return false;
        }
    })();
    return storeReadyPromise;
}

// --- Affiliate directory ---------------------------------------------------

/**
 * The filter bar needs every affiliate up front. Reading them from the local
 * table avoids paging the Trackdesk API on first paint.
 */
export async function fetchAffiliateDirectory(): Promise<Affiliate[]> {
    try {
        if (!(await isStoreReady())) throw new Error('store not ready');
        const { data, error } = await supabaseClient
            .from('td_affiliates')
            .select('public_id, account_id, name, email, tier_name, registered_at')
            .order('name');

        if (!error && data && data.length > 0) {
            return (data as Record<string, string>[]).map(row => ({
                accountId: row.account_id,
                publicId: row.public_id,
                name: row.name,
                email: row.email,
                tierName: row.tier_name,
                registeredAt: row.registered_at,
            }));
        }
    } catch {
        // Store not ready — fall through to the API.
    }

    const { affiliates } = await fetchAffiliates();
    return affiliates.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Fast path -------------------------------------------------------------

async function reportFromStore(params: ReportParams): Promise<AffiliateReport | null> {
    const { dateRange, prevDateRange } = params;
    const scope = resolveScope(params);

    const { data, error } = await supabaseClient.rpc('td_affiliate_report', {
        p_from: dateRange.from.toISOString(),
        p_to: toGmt7EndOfDay(dateRange.to).toISOString(),
        p_prev_from: prevDateRange.from.toISOString(),
        p_prev_to: toGmt7EndOfDay(prevDateRange.to).toISOString(),
        p_tier: params.selectedAccountIds.length > 0 ? 'All' : params.tier,
        p_affiliate_ids: scope,
    });

    // A missing function or an empty store both mean "not migrated yet".
    if (error || !data) return null;

    const summaryRaw = data.summary ?? {};
    const byTierRaw = data.byTier ?? {};
    const tierOf = (key: 'KOL' | 'NonKOL') => {
        const t = byTierRaw[key] ?? {};
        return {
            ...emptyMetrics(),
            signups: Number(t.signups ?? 0),
            clicks: Number(t.clicks ?? 0),
            installs: Number(t.installs ?? 0),
            revenue: Number(t.revenue ?? 0),
            payouts: Number(t.payouts ?? 0),
            prev: {
                signups: Number(t.prev?.signups ?? 0),
                clicks: Number(t.prev?.clicks ?? 0),
                installs: Number(t.prev?.installs ?? 0),
                revenue: Number(t.prev?.revenue ?? 0),
                payouts: Number(t.prev?.payouts ?? 0),
            },
        };
    };

    const summary: SummaryData = {
        signups: Number(summaryRaw.signups ?? 0),
        clicks: Number(summaryRaw.clicks ?? 0),
        installs: Number(summaryRaw.installs ?? 0),
        revenue: Number(summaryRaw.revenue ?? 0),
        payouts: Number(summaryRaw.payouts ?? 0),
        signupsPrev: Number(summaryRaw.signupsPrev ?? 0),
        clicksPrev: Number(summaryRaw.clicksPrev ?? 0),
        installsPrev: Number(summaryRaw.installsPrev ?? 0),
        revenuePrev: Number(summaryRaw.revenuePrev ?? 0),
        payoutsPrev: Number(summaryRaw.payoutsPrev ?? 0),
        vsDateRange: prevDateRange,
        byTier: { KOL: tierOf('KOL'), NonKOL: tierOf('NonKOL') },
    };

    const daily: DailyData[] = (data.daily ?? []).map((d: Record<string, unknown>) => ({
        date: String(d.date),
        signups: Number(d.signups ?? 0),
        clicks: Number(d.clicks ?? 0),
        installs: Number(d.installs ?? 0),
        revenue: Number(d.revenue ?? 0),
        payouts: Number(d.payouts ?? 0),
    }));

    const affiliates: TopAffiliateData[] = (data.affiliates ?? []).map((a: Record<string, unknown>) => ({
        affiliateId: String(a.affiliateId),
        affiliateName: String(a.affiliateName),
        tierName: String(a.tierName),
        clicks: Number(a.clicks ?? 0),
        clicksPrev: Number(a.clicksPrev ?? 0),
        installs: Number(a.installs ?? 0),
        installsPrev: Number(a.installsPrev ?? 0),
        revenue: Number(a.revenue ?? 0),
        revenuePrev: Number(a.revenuePrev ?? 0),
        payout: Number(a.payout ?? 0),
        registeredAt: a.registeredAt ? String(a.registeredAt) : undefined,
    }));

    const m = data.merchants ?? {};
    const merchants: MerchantOverview = {
        totalReferredMerchants: Number(m.totalReferredMerchants ?? 0),
        totalPayingMerchants: Number(m.totalPayingMerchants ?? 0),

        avgLifetime: Number(m.avgLifetime ?? 0),
        totalReferredMerchantsPrev: Number(m.totalReferredMerchantsPrev ?? 0),
        totalPayingMerchantsPrev: Number(m.totalPayingMerchantsPrev ?? 0),
        payoutCounts: (m.payoutCounts ?? []).map(Number),
        payoutCountsPrev: (m.payoutCountsPrev ?? []).map(Number),
    };

    return { summary, daily, affiliates, merchants, source: 'store' };
}

// --- Slow path (original behaviour) ----------------------------------------

async function reportFromApi(params: ReportParams): Promise<AffiliateReport> {
    const { dateRange, prevDateRange, allAffiliates } = params;
    const scope = resolveScope(params);
    const inScope = scope ? new Set(scope) : null;

    const currentRangeISO = { from: dateRange.from.toISOString(), to: toGmt7EndOfDay(dateRange.to).toISOString() };
    const prevRangeISO = { from: prevDateRange.from.toISOString(), to: toGmt7EndOfDay(prevDateRange.to).toISOString() };

    const reportFilters: Record<string, unknown> = {};
    if (scope) reportFilters.sourceId = scope;

    const [currentClicks, prevClicks, currentConversions, prevConversions] = await Promise.all([
        fetchClickReport(currentRangeISO, reportFilters),
        fetchClickReport(prevRangeISO, reportFilters),
        fetchConversionReport(currentRangeISO, reportFilters),
        fetchConversionReport(prevRangeISO, reportFilters),
    ]);

    const keep = (publicId?: string) => !!publicId && (!inScope || inScope.has(publicId));

    const currentConversionsRows = currentConversions.rows.filter(c => keep(c.source?.publicId));
    const prevConversionsRows = prevConversions.rows.filter(c => keep(c.source?.publicId));

    const signupsIn = (range: { from: string; to: string }) => allAffiliates.filter(aff => {
        if (!keep(aff.publicId) || !aff.registeredAt) return false;
        const time = new Date(aff.registeredAt).getTime();
        return time >= new Date(range.from).getTime() && time <= new Date(range.to).getTime();
    });

    const processPeriod = (signups: Affiliate[], clicks: ClickReportRow[], conversions: ConversionReportRow[]) => {
        const byAffiliate = new Map<string, ProcessedMetrics>();
        const daily = new Map<string, ProcessedMetrics>();
        const ensure = (map: Map<string, ProcessedMetrics>, key: string) => {
            if (!map.has(key)) map.set(key, emptyMetrics());
            return map.get(key)!;
        };

        signups.forEach(signup => {
            ensure(byAffiliate, signup.publicId).signups++;
            if (signup.registeredAt) ensure(daily, getGmt7DateString(signup.registeredAt)).signups++;
        });

        clicks.forEach(click => {
            const publicId = click.source?.publicId;
            if (!keep(publicId)) return;
            ensure(byAffiliate, publicId!).clicks++;
            if (click.createdAt) ensure(daily, getGmt7DateString(click.createdAt)).clicks++;
        });

        conversions.forEach(conv => {
            const publicId = conv.source?.publicId;
            if (!keep(publicId)) return;
            const isInstall = conv.conversionType.name.toLowerCase() === 'install';
            const revenue = parseFloat(conv.revenue.value || '0') || 0;
            const payout = parseFloat(conv.cost.value || '0') || 0;

            const aff = ensure(byAffiliate, publicId!);
            if (isInstall) aff.installs++;
            aff.revenue += revenue;
            aff.payouts += payout;

            if (conv.createdAt) {
                const day = ensure(daily, getGmt7DateString(conv.createdAt));
                if (isInstall) day.installs++;
                day.revenue += revenue;
                day.payouts += payout;
            }
        });

        return { byAffiliate, daily };
    };

    const current = processPeriod(signupsIn(currentRangeISO), currentClicks.rows, currentConversionsRows);
    const previous = processPeriod(signupsIn(prevRangeISO), prevClicks.rows, prevConversionsRows);

    const detailsOf = new Map(allAffiliates.map(a => [a.publicId, a]));

    const summary: SummaryData = {
        ...emptyMetrics(),
        signupsPrev: 0, clicksPrev: 0, installsPrev: 0, revenuePrev: 0, payoutsPrev: 0,
        vsDateRange: prevDateRange,
        byTier: {
            KOL: { ...emptyMetrics(), prev: emptyMetrics() },
            NonKOL: { ...emptyMetrics(), prev: emptyMetrics() },
        },
    };

    current.byAffiliate.forEach((data, publicId) => {
        summary.signups += data.signups;
        summary.clicks += data.clicks;
        summary.installs += data.installs;
        summary.revenue += data.revenue;
        summary.payouts += data.payouts;
        const tier = normalizeTier(detailsOf.get(publicId)?.tierName);
        (Object.keys(data) as (keyof ProcessedMetrics)[]).forEach(key => { summary.byTier[tier][key] += data[key]; });
    });

    previous.byAffiliate.forEach((data, publicId) => {
        summary.signupsPrev += data.signups;
        summary.clicksPrev += data.clicks;
        summary.installsPrev += data.installs;
        summary.revenuePrev += data.revenue;
        summary.payoutsPrev += data.payouts;
        const tier = normalizeTier(detailsOf.get(publicId)?.tierName);
        (Object.keys(data) as (keyof ProcessedMetrics)[]).forEach(key => { summary.byTier[tier].prev[key] += data[key]; });
    });

    const daily: DailyData[] = Array.from(current.daily.entries())
        .map(([date, metrics]) => ({ date, ...metrics }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const affiliates: TopAffiliateData[] = Array.from(current.byAffiliate.entries())
        .map(([publicId, metrics]) => {
            const details = detailsOf.get(publicId);
            const prev = previous.byAffiliate.get(publicId) || emptyMetrics();
            return {
                affiliateId: publicId,
                affiliateName: details?.name || 'Unknown',
                tierName: details?.tierName || 'N/A',
                clicks: metrics.clicks,
                clicksPrev: prev.clicks,
                installs: metrics.installs,
                installsPrev: prev.installs,
                revenue: metrics.revenue,
                revenuePrev: prev.revenue,
                payout: metrics.payouts,
                registeredAt: details?.registeredAt,
            };
        })
        .filter(d => d.clicks >= 1 || d.installs >= 1 || d.revenue > 0);

    const merchants = await merchantOverviewFromApi(
        currentConversionsRows,
        prevConversionsRows,
        dateRange,
        prevDateRange,
    );

    return { summary, daily, affiliates, merchants, source: 'api' };
}

async function merchantOverviewFromApi(
    currentRows: ConversionReportRow[],
    prevRows: ConversionReportRow[],
    dateRange: DateRange,
    prevDateRange: DateRange,
): Promise<MerchantOverview> {
    const customerIds = [...new Set([...currentRows, ...prevRows].map(c => c.customerId).filter(Boolean))];
    const overview = emptyMerchants();
    if (customerIds.length === 0) return overview;

    const lifetime = await fetchConversionReport(
        { from: '2020-01-01T00:00:00.000Z', to: new Date().toISOString() },
        { customerId: customerIds },
    );

    const byCustomer = new Map<string, ConversionReportRow[]>();
    lifetime.rows.forEach(conv => {
        if (!conv.customerId) return;
        if (!byCustomer.has(conv.customerId)) byCustomer.set(conv.customerId, []);
        byCustomer.get(conv.customerId)!.push(conv);
    });
    byCustomer.forEach(rows => rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));

    const forPeriod = (fromTime: number, toTime: number) => {
        let paying = 0;
        const tenures: number[] = [];
        let lifetimeDays = 0, lifetimeCount = 0;
        const referred = new Set<string>();

        byCustomer.forEach((conversions, customerId) => {
            let installedAt: string | null = null;
            let installInPeriod = false;
            const payouts: ConversionReportRow[] = [];

            conversions.forEach(conv => {
                const time = new Date(conv.createdAt).getTime();
                if (time > toTime) return;
                const type = conv.conversionType.name.toLowerCase();
                if (type === 'install') {
                    if (!installedAt) installedAt = conv.createdAt;
                    if (time >= fromTime) installInPeriod = true;
                }
                if (type === 'payout') payouts.push(conv);
            });

            let latestPayoutInPeriod = false;
            if (payouts.length > 0) {
                const latest = new Date(payouts[payouts.length - 1].createdAt).getTime();
                if (latest >= fromTime && latest <= toTime) {
                    latestPayoutInPeriod = true;
                    paying++;
                    tenures.push(payouts.length);

                    if (installedAt) {
                        const span = latest - new Date(installedAt).getTime();
                        if (span >= 0) { lifetimeDays += Math.round(span / 864e5); lifetimeCount++; }
                    }
                }
            }

            if (installInPeriod || latestPayoutInPeriod) referred.add(customerId);
        });

        return {
            paying, tenures,
            referred: referred.size,
            avgLifetime: lifetimeCount > 0 ? lifetimeDays / lifetimeCount : 0,
        };
    };

    const cur = forPeriod(dateRange.from.getTime(), toGmt7EndOfDay(dateRange.to).getTime());
    const prev = forPeriod(prevDateRange.from.getTime(), toGmt7EndOfDay(prevDateRange.to).getTime());

    return {
        totalReferredMerchants: cur.referred,
        totalPayingMerchants: cur.paying,

        avgLifetime: cur.avgLifetime,
        totalReferredMerchantsPrev: prev.referred,
        totalPayingMerchantsPrev: prev.paying,
        payoutCounts: cur.tenures,
        payoutCountsPrev: prev.tenures,
    };
}

// --- Entry point -----------------------------------------------------------

export async function fetchAffiliateReport(params: ReportParams): Promise<AffiliateReport> {
    try {
        if (await isStoreReady()) {
            const fromStore = await reportFromStore(params);
            if (fromStore) return fromStore;
        }
    } catch (error) {
        console.warn('Materialised store unavailable, falling back to the Trackdesk API:', error);
    }
    return reportFromApi(params);
}
