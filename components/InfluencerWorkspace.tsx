import React, { useState, useEffect } from 'react';
import InfluencerPerformance from './InfluencerPerformance';
import InfluencerProgress from './InfluencerProgress';
import InfluencerProposal from './InfluencerProposal';

type SubTab = 'dashboard' | 'progress' | 'proposal';

const parseSubTabFromUrl = (): SubTab => {
    try {
        const savedKolId = localStorage.getItem('tp_oauth_return_kol_id') || sessionStorage.getItem('tp_oauth_return_kol_id');
        if (savedKolId) return 'proposal';

        const path = window.location.pathname;
        const parts = path.split('/').filter(Boolean);
        if (parts[0] === 'influencer') {
            const sub = parts[1] as SubTab;
            if (['dashboard', 'progress', 'proposal'].includes(sub)) {
                return sub;
            }
        }
        const params = new URLSearchParams(window.location.search);
        if (params.get('kolId')) return 'proposal';
    } catch (e) {}
    return 'dashboard';
};

const InfluencerWorkspace: React.FC = () => {
    const [activeTab, setActiveTabState] = useState<SubTab>(parseSubTabFromUrl);

    const updateUrlSubtab = (subtab: SubTab) => {
        try {
            window.history.pushState({}, '', `/influencer/${subtab}`);
        } catch (e) {}
    };

    const handleSelectTab = (tabId: SubTab) => {
        setActiveTabState(tabId);
        updateUrlSubtab(tabId);
    };

    useEffect(() => {
        const handlePopState = () => {
            setActiveTabState(parseSubTabFromUrl());
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const tabs: { id: SubTab; label: string }[] = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'progress', label: 'Progress' },
        { id: 'proposal', label: 'Proposal' },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <InfluencerPerformance />;
            case 'progress':
                return <InfluencerProgress />;
            case 'proposal':
                return <InfluencerProposal />;
            default:
                return <InfluencerPerformance />;
        }
    };

    return (
        <div className="workspace-page influencer-workspace">
            <div className="workspace-tabs mb-6" role="tablist" aria-label="Influencer views">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleSelectTab(tab.id)}
                        className={`workspace-tab ${
                            activeTab === tab.id
                                ? 'is-active'
                                : ''
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="workspace-view">
                {renderContent()}
            </div>
        </div>
    );
};

export default InfluencerWorkspace;
