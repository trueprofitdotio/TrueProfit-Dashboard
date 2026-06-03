import React, { useState, useEffect, useCallback } from 'react';
import PerformanceOverview from './components/PerformanceOverview';
import ConversionDetails from './components/ConversionDetails';
import InfluencerPerformance from './components/InfluencerPerformance';
import KpiRunrate from './components/KpiRunrate';
import { KpiTarget } from './types';
import { supabaseClient } from './services/supabaseClient';
import { fetchAffiliates, fetchClickReport } from './services/trackdeskService';
import { getQuarterInfo, getQuarterDateRange } from './utils/timeHelper';

type Tab = 'affiliate' | 'conversion' | 'influencer' | 'kpi';

// --- App Component ---

const Header: React.FC = () => (
  <header className="text-center py-10">
    <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest block mb-2">Internal Workspace</span>
    <h1 className="text-4xl font-extrabold text-[#05339C] tracking-tight">
      TrueProfit Affiliate Dashboard
    </h1>
  </header>
);

const Tabs: React.FC<{ activeTab: Tab; setActiveTab: (tab: Tab) => void }> = ({ activeTab, setActiveTab }) => {
  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'affiliate', label: 'Affiliate Performance' },
    { id: 'conversion', label: 'Merchants Details' },
    { id: 'influencer', label: 'Influencer Performance' },
    { id: 'kpi', label: 'KPI Runrate' },
  ];

  return (
    <nav className="mb-12">
      <div className="flex justify-center gap-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-6 py-2 text-sm font-semibold transition-all duration-200 rounded-full focus:outline-none border
              ${
                activeTab === tab.id
                  ? 'bg-[#e8f8f2] text-[#10714F] border-[#23C48C]/40'
                  : 'bg-white text-slate-500 border-[#bfdbfe]/50 hover:text-slate-800 hover:bg-slate-50'
              }
              ${tab.disabled ? 'cursor-not-allowed opacity-50' : ''}
            `}
          >
            {tab.label}
            {tab.disabled && <span className="text-[10px] ml-1 opacity-60"> (Coming Soon)</span>}
          </button>
        ))}
      </div>
    </nav>
  );
};

export interface KpiData {
    allKpiTargets: KpiTarget[];
    currentQuarterProgress: { signups: number; clicks: number; viewcount: number; };
    pastQuartersProgress: Record<string, { signups: number; clicks: number; viewcount: number; }>;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('affiliate');
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);

  const fetchKpiTargets = useCallback(async () => {
    const { data, error } = await supabaseClient.from('kpi_targets').select('*');
    if (error) {
        throw new Error(`Failed to fetch targets: ${error.message}`);
    }
    return data as KpiTarget[];
  }, []);

  const fetchKpiProgressData = useCallback(async () => {
      const { year, quarter } = getQuarterInfo();
      // Fetch all affiliates to partition KOL vs NonKOL in memory (Trackdesk API does not filter tierName reliably)
      const { affiliates: allAffiliates } = await fetchAffiliates();
      const nonKolAffiliates = allAffiliates.filter(aff => {
          const rawTier = aff.tierName || 'NonKOL';
          return !(rawTier === 'KOL (Old Offer)' || rawTier === 'KOL (New Offer)' || rawTier === 'Standard');
      });
      const nonKolPublicIds = nonKolAffiliates.map(aff => aff.publicId);
      const nonKolPublicIdsSet = new Set(nonKolPublicIds);
      
      const { data: kolVideos, error: kolVideosError } = await supabaseClient.from('videos').select('id').not('kol_id', 'is', null);
      if(kolVideosError) throw new Error(`Failed to fetch KOL videos: ${kolVideosError.message}`);
      const kolVideoIds = (kolVideos as { id: string }[]).map(v => v.id);

      const quartersToFetch = Array.from({ length: quarter }, (_, i) => (i + 1) as (1 | 2 | 3 | 4));
      const quarterPromises = quartersToFetch.map(async (q) => {
          const now = new Date();
          const { start, end } = getQuarterDateRange(year, q);
          const to = q === quarter ? now : end;
          const timeRange = { from: start.toISOString(), to: to.toISOString() };
          
          const signupFilters = { registeredFrom: timeRange.from, registeredTo: timeRange.to };
          const clickFilters = { sourceId: nonKolPublicIds };

          const [signupsRes, clicksRes, videoPerformanceRes] = await Promise.all([
              fetchAffiliates(signupFilters),
              nonKolPublicIds.length > 0 ? fetchClickReport(timeRange, clickFilters) : Promise.resolve({ rows: [] }),
              // Use get_video_performance RPC to bypass Supabase 1000 row truncation limit
              kolVideoIds.length > 0 ? supabaseClient.rpc('get_video_performance', {
                  p_video_ids: kolVideoIds,
                  p_start_date: timeRange.from,
                  p_end_date: timeRange.to
              }) : Promise.resolve({ data: [], error: null }),
          ]);

          if(videoPerformanceRes.error) throw new Error(`Failed to fetch video metrics: ${videoPerformanceRes.error.message}`);
          
          // Perform in-memory filtering to ensure count accuracy
          const clicks = clicksRes.rows.filter(click => {
              const publicId = click.source?.publicId;
              return publicId && nonKolPublicIdsSet.has(publicId);
          }).length;

          const signups = signupsRes.affiliates.filter(aff => {
              const rawTier = aff.tierName || 'NonKOL';
              return !(rawTier === 'KOL (Old Offer)' || rawTier === 'KOL (New Offer)' || rawTier === 'Standard');
          }).length;

          let viewcount = 0;
          if (videoPerformanceRes.data) {
              videoPerformanceRes.data.forEach((m: { start_views: number, end_views: number }) => {
                  const growth = m.end_views - m.start_views;
                  if (growth > 0) viewcount += growth;
              });
          }
          
          return { quarter: `q${q}`, progress: { signups, clicks, viewcount } };
      });

      const results = await Promise.all(quarterPromises);
      const pastQuartersProgress: Record<string, { signups: number; clicks: number; viewcount: number; }> = {};
      let currentQuarterProgress = { signups: 0, clicks: 0, viewcount: 0 };
      
      results.forEach((r: { quarter: string; progress: { signups: number; clicks: number; viewcount: number; } }) => {
          if (r.quarter !== `q${quarter}`) {
              pastQuartersProgress[r.quarter] = r.progress;
          } else {
              currentQuarterProgress = r.progress;
          }
      });
      return { currentQuarterProgress, pastQuartersProgress };
  }, []);


  const loadKpiData = useCallback(async () => {
    setKpiLoading(true);
    setKpiError(null);
    try {
        const [targets, progressData] = await Promise.all([
            fetchKpiTargets(),
            fetchKpiProgressData()
        ]);
        setKpiData({
            allKpiTargets: targets,
            ...progressData
        });
    } catch {
        setKpiError('Failed to load KPI data.');
    } finally {
        setKpiLoading(false);
    }
  }, [fetchKpiTargets, fetchKpiProgressData]);
  
  useEffect(() => {
    loadKpiData();
  }, [loadKpiData]);



  const renderContent = () => {
    switch (activeTab) {
      case 'affiliate':
        return <PerformanceOverview />;
      case 'conversion':
        return <ConversionDetails />;
      case 'influencer':
        return <InfluencerPerformance />;
      case 'kpi':
        return <KpiRunrate loading={kpiLoading} error={kpiError} data={kpiData} onSave={loadKpiData} />;
      default:
        return <PerformanceOverview />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-800 overflow-x-hidden">
      <div className="max-w-[1800px] mx-auto px-4 md:px-8 lg:px-12">
        <Header />
        <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
        <main key={activeTab} className="tab-content-active">{renderContent()}</main>
      </div>
    </div>
  );
};

export default App;
