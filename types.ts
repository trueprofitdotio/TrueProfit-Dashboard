
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
  totalLifetimeRevenue: number;
  totalLifetimePayout: number;
  allConversions: ConversionReportRow[];
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
}

export interface TrendlineData {
  videoId: string;
  videoTitle: string;
  points: { date: string; views: number }[];
}


// --- KPI Types ---
export interface KpiTarget {
  id?: string; // from database
  kpi_name: string;
  year: number;
  q1_target: number;
  q2_target: number;
  q3_target: number;
  q4_target: number;
}