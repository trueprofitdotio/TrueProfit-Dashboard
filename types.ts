
export interface Affiliate {
  accountId: string;
  publicId: string;
  name: string;
  email: string;
  tierName: string;
  registeredAt?: string;
}

export interface ClickReportRow {
  createdAt: string;
  cid: string;
  source: {
    id: string;
    publicId: string;
  };
}

export interface ConversionReportRow {
  createdAt: string;
  customerId: string;
  conversionType: {
    id: string;
    name: string;
  };
  revenue: {
    value: string;
  };
  cost: {
    value: string;
  };
  source: {
    id: string;
    publicId: string;
  }
  cid?: string;
}

export interface AffiliateTier {
  id: string;
  name: string;
}

export interface ProcessedMetrics {
  signups: number;
  clicks: number;
  installs: number;
  revenue: number;
  payouts: number;
}

export interface SummaryData extends ProcessedMetrics {
  signupsPrev: number;
  clicksPrev: number;
  installsPrev: number;
  revenuePrev: number;
  payoutsPrev: number;
  byTier: {
    [key: string]: ProcessedMetrics & { prev: ProcessedMetrics };
  };
  vsDateRange?: DateRange;
}

export interface DailyData {
    date: string;
    signups: number;
    clicks: number;
    installs: number;
    revenue: number;
    payouts: number;
}

export interface TopAffiliateData {
    affiliateId: string;
    affiliateName: string;
    tierName: string;
    clicks: number;
    clicksPrev: number;
    installs: number;
    installsPrev: number;
    revenue: number;
    revenuePrev: number;
    payout: number;
    registeredAt?: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface OverviewStats {
    current: {
        newVideos: VideoPerformanceData[];
        legacyVideos: VideoPerformanceData[];
        totalGrowth: number;
        newVideoGrowth: number;
        oldVideoGrowth: number;
    };
    previous: {
        newVideos: VideoPerformanceData[];
        legacyVideos: VideoPerformanceData[];
        totalGrowth: number;
        newVideoGrowth: number;
        oldVideoGrowth: number;
    };
    vsDateRange: DateRange;
}

export interface MerchantSummaryData {
    current: {
        totalMerchants: number;
        payingMerchants: number;
        totalRevenue: number;
        totalPayout: number;
    };
    previous: {
        totalMerchants: number;
        payingMerchants: number;
        totalRevenue: number;
        totalPayout: number;
    };
    vsDateRange: DateRange;
}

// --- Merchants Details Types ---
export interface MerchantDetailsData {
  customerId: string;
  affiliateId: string;
  affiliateName: string;
  revenueInPeriod: number;
  payoutInPeriod: number;
  status: 'Paying' | 'Install';
  installedDate: string | null;
  lastPayoutDate: string | null;
  merchantLifetime: string | null;
  merchantLifetimeDays: number | null;
  totalLifetimeRevenue: number;
  totalLifetimePayout: number;
  allConversions: ConversionReportRow[];
  payoutCount: number;
}


// --- Supabase Types ---

export interface Kol {
  id: string;
  name: string;
}

export interface Video {
  id: string;
  title: string;
  video_url: string;
  released_date: string;
  kol_id: string;
  status?: string;
  kols: Kol; // For joined data
}

export interface VideoMetric {
  video_id: string;
  view_count: number;
  recorded_at: string;
}

export interface VideoPerformanceData extends Video {
  startViews: number;
  endViews: number;
  viewGrowth: number;
  growthPercentage: number;
  /** The same growth measured over the period immediately before this one,
   *  so a figure can be read as speeding up or slowing down. */
  prevViewGrowth?: number;
}

export interface TrendlineData {
  videoId: string;
  videoTitle: string;
  points: { date: string; views: number }[];
}

// --- Affiliate report ------------------------------------------------------

export interface MerchantOverview {
  totalReferredMerchants: number;
  totalPayingMerchants: number;
  avgLifetime: number;
  totalReferredMerchantsPrev: number;
  totalPayingMerchantsPrev: number;
  /** One entry per paying merchant: how many monthly payouts it has made,
   *  which is how many months it has stayed subscribed. Kept raw rather than
   *  pre-bucketed so retention can be read as a curve instead of as three
   *  slices that hide where merchants actually drop off. */
  payoutCounts: number[];
  payoutCountsPrev: number[];
}

/** Everything the affiliate workspace renders for one period, from either backend. */
export interface AffiliateReport {
  summary: SummaryData;
  daily: DailyData[];
  affiliates: TopAffiliateData[];
  merchants: MerchantOverview;
  /** Which backend answered — 'store' is the aggregated SQL path. */
  source: 'store' | 'api';
}
