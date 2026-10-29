import { supabaseClient } from './supabaseClient';
import {
    Affiliate,
    AffiliateReport,
    DailyData,
    DateRange,
    MerchantOverview,
    ProcessedMetrics,
    SummaryData,
    TopAffiliateData,
} from '../types';
import { toGmt7EndOfDay } from '../utils/timeHelper';

// ---------------------------------------------------------------------------
// The affiliate report, read from the materialised Trackdesk store.
//
// Postgres returns numbers that are already aggregated, so a year-long range
// comes back as a few hundred rows rather than half a million.
//
// This used to carry a second backend as well: crawl the Trackdesk API from
// the browser and add it up in JS. That existed to keep the dashboard working
// while the store was being built, and it is gone now that the store is the
// only source — along with the edge-function proxy it called and the API key
// that had to ship to the browser for it.
// ---------------------------------------------------------------------------

/* Named once so the message is the same wherever the store is not ready, and
   so it points at the thing to go and look at. */
const STORE_NOT_SYNCED =
    'The Trackdesk store has not finished syncing. Check td_sync_state in Supabase, and that the td-sync schedule is running.';

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

   An unsynced store is worse than a missing one: the RPC answers successfully
   with zeroes, and zeroes are indistinguishable from a genuinely quiet range.
   The sync watermarks are checked once per session so that state surfaces as
   an error naming the cause, rather than as a dashboard full of noughts. */
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
/* The directory is ~1200 rows and two callers want it at once: the mount
   effect and, if that has not landed yet, the first Get-metrics click. Both
   used to issue their own request, so the slowest part of a cold load ran
   twice. One in-flight promise is shared instead. */
let directoryPromise: Promise<Affiliate[]> | null = null;

export function fetchAffiliateDirectory(): Promise<Affiliate[]> {
    directoryPromise ??= loadAffiliateDirectory().catch(err => {
        // A failure must not be cached, or the app can never recover from it.
        directoryPromise = null;
        throw err;
    });
    return directoryPromise;
}

async function loadAffiliateDirectory(): Promise<Affiliate[]> {
    if (!(await isStoreReady())) throw new Error(STORE_NOT_SYNCED);

    const { data, error } = await supabaseClient
        .from('td_affiliates')
        .select('public_id, account_id, name, email, tier_name, registered_at')
        .order('name');

    if (error) throw new Error(`Could not read the affiliate list: ${error.message}`);

    return (data as Record<string, string>[] ?? []).map(row => ({
        accountId: row.account_id,
        publicId: row.public_id,
        name: row.name,
        email: row.email,
        tierName: row.tier_name,
        registeredAt: row.registered_at,
    }));
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

    if (error) throw new Error(`The affiliate report query failed: ${error.message}`);
    if (!data) return null;

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

// --- Entry point -----------------------------------------------------------

export async function fetchAffiliateReport(params: ReportParams): Promise<AffiliateReport> {
    if (!(await isStoreReady())) throw new Error(STORE_NOT_SYNCED);

    const report = await reportFromStore(params);
    if (!report) throw new Error(STORE_NOT_SYNCED);
    return report;
}
