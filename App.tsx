import React, { useState, useEffect, useCallback } from 'react';
import PerformanceOverview from './components/PerformanceOverview';
import InfluencerWorkspace from './components/InfluencerWorkspace';
import KpiRunrate from './components/KpiRunrate';
import { KpiTarget } from './types';
import { supabaseClient } from './services/supabaseClient';
import { fetchAffiliates, fetchClickReport } from './services/trackdeskService';
import { getQuarterInfo, getQuarterDateRange } from './utils/timeHelper';

type Tab = 'affiliate' | 'conversion' | 'influencer' | 'kpi';

// --- App Component ---

const Header: React.FC = () => (
  <header className="app-header">
    <div className="app-header-brand">
      <h1>TrueProfit Dashboard</h1>
      <p>Affiliate &amp; Influencer Channels</p>
    </div>
  </header>
);

const Tabs: React.FC<{ activeTab: Tab; setActiveTab: (tab: Tab) => void }> = ({ activeTab, setActiveTab }) => {
    const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
        { id: 'affiliate', label: 'Affiliate' },
        { id: 'influencer', label: 'Influencer' },
        { id: 'kpi', label: 'KPI Runrate' },
    ];

  return (
    <nav className="app-navigation" aria-label="Workspace sections">
      <div className="app-navigation-list">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`app-navigation-item
              ${
                activeTab === tab.id
                  ? 'is-active'
                  : ''
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

const getInitialTab = (): Tab => {
    try {
        const returnTab = sessionStorage.getItem('tp_oauth_return_tab') as Tab;
        if (returnTab && ['affiliate', 'influencer', 'kpi'].includes(returnTab)) {
            return returnTab;
        }
        const path = window.location.pathname;
        if (path.startsWith('/influencer')) return 'influencer';
        if (path.startsWith('/kpi')) return 'kpi';
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') as Tab;
        if (tab && ['affiliate', 'influencer', 'kpi'].includes(tab)) return tab;
    } catch (e) {}
    return 'affiliate';
};

const App: React.FC = () => {
  const [activeTab, setActiveTabState] = useState<Tab>(getInitialTab);

  const handleSetActiveTab = (tab: Tab) => {
      setActiveTabState(tab);
      try {
          let newPath = `/${tab}`;
          if (tab === 'influencer') {
              newPath = '/influencer/dashboard';
          }
          window.history.pushState({}, '', newPath);
      } catch (e) {}
  };

  useEffect(() => {
      const handlePopState = () => {
          const path = window.location.pathname;
          if (path.startsWith('/influencer')) {
              setActiveTabState('influencer');
          } else if (path.startsWith('/kpi')) {
              setActiveTabState('kpi');
          } else {
              setActiveTabState('affiliate');
          }
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
      case 'influencer':
        return <InfluencerWorkspace />;
      case 'kpi':
        return <KpiRunrate loading={kpiLoading} error={kpiError} data={kpiData} onSave={loadKpiData} />;
      default:
        return <PerformanceOverview />;
    }
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
        <Header />
        <Tabs activeTab={activeTab} setActiveTab={handleSetActiveTab} />
        <main key={activeTab} className="tab-content-active">{renderContent()}</main>
      </div>
    </div>
  );
};

export default App;
