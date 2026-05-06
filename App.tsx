import React, { useState, useEffect, useCallback } from 'react';
import PerformanceOverview from './components/PerformanceOverview';
import ConversionDetails from './components/ConversionDetails';
import InfluencerPerformance from './components/InfluencerPerformance';
import KpiRunrate from './components/KpiRunrate';
import { KpiTarget, VideoMetric } from './types';
import { supabaseClient } from './services/supabaseClient';
import { fetchAffiliates, fetchClickReport } from './services/trackdeskService';
import { getQuarterInfo, getQuarterDateRange } from './utils/timeHelper';

type Tab = 'affiliate' | 'conversion' | 'influencer' | 'kpi';

const calculateViewGrowth = (metrics: VideoMetric[], videoIds: string[], rangeStart: Date, rangeEnd: Date): number => {
    const metricsByVideo = new Map<string, VideoMetric[]>();
    metrics.forEach(m => {
        if (!metricsByVideo.has(m.video_id)) metricsByVideo.set(m.video_id, []);
        metricsByVideo.get(m.video_id)!.push(m);
    });

    let totalGrowth = 0;
    for (const videoId of videoIds) {
        const videoMetrics = metricsByVideo.get(videoId) || [];
        const findViewCount = (date: Date): number => {
            let latestMetricBeforeDate: VideoMetric | null = null;
            for (const metric of videoMetrics) {
                if (new Date(metric.recorded_at) <= date) latestMetricBeforeDate = metric;
                else break;
            }
            return latestMetricBeforeDate?.view_count || 0;
        };
        const startViews = findViewCount(rangeStart);
        const endViews = findViewCount(rangeEnd);
        if(endViews > startViews) totalGrowth += endViews - startViews;
    }
    return totalGrowth;
};

// --- App Component ---

const Header: React.FC = () => (
  <header className="text-center py-8">
    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-color)] to-teal-500">
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
      <div className="flex justify-center gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-8 py-2.5 text-sm font-bold transition-all duration-300 ease-in-out rounded-full focus:outline-none
              ${
                activeTab === tab.id
                  ? 'bg-[#BFFEDF] text-[#10714F] shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
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
      const { affiliates: nonKolAffiliates } = await fetchAffiliates({ tierName: 'NonKOL' });
      const nonKolPublicIds = nonKolAffiliates.map(aff => aff.publicId);
      
      const { data: kolVideos, error: kolVideosError } = await supabaseClient.from('videos').select('id').not('kol_id', 'is', null);
      if(kolVideosError) throw new Error(`Failed to fetch KOL videos: ${kolVideosError.message}`);
      const kolVideoIds = (kolVideos as { id: string }[]).map(v => v.id);

      const quartersToFetch = Array.from({ length: quarter }, (_, i) => (i + 1) as (1 | 2 | 3 | 4));
      const quarterPromises = quartersToFetch.map(async (q) => {
          const now = new Date();
          const { start, end } = getQuarterDateRange(year, q);
          const to = q === quarter ? now : end;
          const timeRange = { from: start.toISOString(), to: to.toISOString() };
          
          const signupFilters = { registeredFrom: timeRange.from, registeredTo: timeRange.to, tierName: 'NonKOL' };
          const clickFilters = { sourceId: nonKolPublicIds };

          const [signupsRes, clicksRes, videoMetricsRes] = await Promise.all([
              nonKolPublicIds.length > 0 ? fetchAffiliates(signupFilters) : Promise.resolve({ affiliates: [] }),
              nonKolPublicIds.length > 0 ? fetchClickReport(timeRange, clickFilters) : Promise.resolve({ rows: [] }),
              kolVideoIds.length > 0 ? supabaseClient.from('video_metrics').select('video_id, view_count, recorded_at').in('video_id', kolVideoIds).lte('recorded_at', timeRange.to).order('recorded_at') : Promise.resolve({ data: [], error: null }),
          ]);

          if(videoMetricsRes.error) throw new Error(`Failed to fetch video metrics: ${videoMetricsRes.error.message}`);
          
          const clicks = clicksRes.rows.length;
          const signups = signupsRes.affiliates.length;
          const viewcount = calculateViewGrowth((videoMetricsRes.data as VideoMetric[]) || [], kolVideoIds, start, to);
          
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


  const [isInfluencerSidebarOpen, setIsInfluencerSidebarOpen] = useState(false);

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
        return <InfluencerPerformance 
                 isSidebarOpen={isInfluencerSidebarOpen} 
                 onSidebarToggle={setIsInfluencerSidebarOpen} 
               />;
      case 'kpi':
        return <KpiRunrate loading={kpiLoading} error={kpiError} data={kpiData} onSave={loadKpiData} />;
      default:
        return <PerformanceOverview />;
    }
  };

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isInfluencerSidebarOpen ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
      <div className={`transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isInfluencerSidebarOpen ? 'w-[2504px]' : 'w-full'}`}>
        <div className={`px-4 md:px-8 lg:px-12 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isInfluencerSidebarOpen ? 'max-w-none w-[1800px] ml-12' : 'mx-auto max-w-[1800px]'}`}>
          <Header />
          <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
          <main>{renderContent()}</main>
        </div>
      </div>
    </div>
  );
};

export default App;
