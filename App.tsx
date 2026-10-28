import React, { useState, useEffect } from 'react';
import PerformanceOverview from './components/PerformanceOverview';
import InfluencerWorkspace from './components/InfluencerWorkspace';

type Tab = 'affiliate' | 'influencer';

// --- App Component ---

// The top bar carries product identity on the left and the workspace
// routes in a segmented capsule on the bar's centre line, so the canvas below
// is reserved entirely for work sheets. The capsule is a switcher, not a link
// rail: one workspace is on at a time, and the raised white segment says so.
const AppBar: React.FC<{ activeTab: Tab; setActiveTab: (tab: Tab) => void }> = ({ activeTab, setActiveTab }) => {
    const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
        { id: 'affiliate', label: 'Affiliate' },
        { id: 'influencer', label: 'Influencer' },
    ];

  return (
    <header className="app-bar">
      <div className="app-bar-inner">
        <div className="app-brand">
          <h1>TrueProfit Dashboard</h1>
          <span className="app-brand-sep" aria-hidden="true">/</span>
          <p>Affiliate &amp; Influencer channels</p>
        </div>

        <nav className="app-navigation" aria-label="Workspace sections">
          <div className="app-navigation-list" role="tablist">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                aria-selected={activeTab === tab.id}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`app-navigation-item ${activeTab === tab.id ? 'is-active' : ''} ${tab.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {tab.label}
                {tab.disabled && <span className="text-[11px] ml-1 opacity-60"> (Coming Soon)</span>}
              </button>
            ))}
          </div>
        </nav>

        {/* Balances the brand so the capsule lands on the bar's centre line. */}
        <div className="app-bar-trailing" aria-hidden="true" />
      </div>
    </header>
  );
};

const getInitialTab = (): Tab => {
    try {
        const returnTab = (localStorage.getItem('tp_oauth_return_tab') || sessionStorage.getItem('tp_oauth_return_tab')) as Tab;
        if (returnTab && ['affiliate', 'influencer'].includes(returnTab)) {
            return returnTab;
        }
        const returnUrl = localStorage.getItem('tp_oauth_return_url') || sessionStorage.getItem('tp_oauth_return_url');
        if (returnUrl) {
            try {
                const parsedUrl = new URL(returnUrl, window.location.origin);
                if (parsedUrl.pathname.startsWith('/influencer')) return 'influencer';
            } catch (e) {}
        }
        const path = window.location.pathname;
        if (path.startsWith('/influencer')) return 'influencer';
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') as Tab;
        if (tab && ['affiliate', 'influencer'].includes(tab)) return tab;
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
      // Check for OAuth return URL restoration
      try {
          const savedUrl = localStorage.getItem('tp_oauth_return_url') || sessionStorage.getItem('tp_oauth_return_url');
          const savedKolId = localStorage.getItem('tp_oauth_return_kol_id') || sessionStorage.getItem('tp_oauth_return_kol_id');

          if (savedUrl) {
              const urlObj = new URL(savedUrl, window.location.origin);
              if (urlObj.origin === window.location.origin && window.location.pathname === '/') {
                  const targetPath = urlObj.pathname + urlObj.search + window.location.hash;
                  window.history.replaceState({}, '', targetPath);
                  if (urlObj.pathname.startsWith('/influencer')) {
                      setActiveTabState('influencer');
                  }
              }
          } else if (savedKolId && window.location.pathname === '/') {
              const targetPath = `/influencer/proposal?kolId=${savedKolId}` + window.location.hash;
              window.history.replaceState({}, '', targetPath);
              setActiveTabState('influencer');
          }
      } catch (e) {}

      const handlePopState = () => {
          const path = window.location.pathname;
          setActiveTabState(path.startsWith('/influencer') ? 'influencer' : 'affiliate');
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <div className="app-shell">
      <AppBar activeTab={activeTab} setActiveTab={handleSetActiveTab} />
      <div className="app-frame">
        <main key={activeTab} className="tab-content-active">
          {activeTab === 'influencer' ? <InfluencerWorkspace /> : <PerformanceOverview />}
        </main>
      </div>
    </div>
  );
};

export default App;
