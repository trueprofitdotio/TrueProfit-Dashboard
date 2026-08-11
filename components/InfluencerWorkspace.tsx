import React, { useState, useEffect } from 'react';
import InfluencerPerformance from './InfluencerPerformance';
import InfluencerProgress from './InfluencerProgress';
import InfluencerProposal from './InfluencerProposal';

type SubTab = 'dashboard' | 'progress' | 'proposal';

const parseSubTabFromUrl = (): { subtab: SubTab; proposalId?: string } => {
    try {
        const path = window.location.pathname;
        const parts = path.split('/').filter(Boolean);
        if (parts[0] === 'influencer') {
            const sub = parts[1] as SubTab;
            if (['dashboard', 'progress', 'proposal'].includes(sub)) {
                return { subtab: sub, proposalId: parts[2] };
            }
        }
    } catch (e) {}
    return { subtab: 'dashboard' };
};

const InfluencerWorkspace: React.FC = () => {
    const initialRoute = parseSubTabFromUrl();
    const [activeTab, setActiveTabState] = useState<SubTab>(initialRoute.subtab);
    const [selectedProposalTitle, setSelectedProposalTitle] = useState<string | null>(null);
    const [proposalResetSignal, setProposalResetSignal] = useState(0);
    const [copiedLink, setCopiedLink] = useState(false);

    const updateUrlSubtab = (subtab: SubTab, proposalId?: string | null) => {
        try {
            let newPath = `/influencer/${subtab}`;
            if (subtab === 'proposal' && proposalId) {
                newPath = `/influencer/proposal/${proposalId}`;
            }
            window.history.pushState({}, '', newPath);
        } catch (e) {}
    };

    const handleSelectTab = (tabId: SubTab) => {
        setActiveTabState(tabId);
        updateUrlSubtab(tabId);
        if (tabId !== 'proposal') {
            setSelectedProposalTitle(null);
        }
    };

    const handleProposalBreadcrumbClick = () => {
        setActiveTabState('proposal');
        updateUrlSubtab('proposal');
        if (selectedProposalTitle) {
            setSelectedProposalTitle(null);
        }
        setProposalResetSignal(prev => prev + 1);
    };

    useEffect(() => {
        const handlePopState = () => {
            const { subtab } = parseSubTabFromUrl();
            setActiveTabState(subtab);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const handleCopyShareableLink = () => {
        try {
            const currentUrl = window.location.href;
            navigator.clipboard.writeText(currentUrl);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2500);
        } catch (e) {
            console.error('Failed to copy link', e);
        }
    };

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
                return (
                    <InfluencerProposal 
                        onSelectProposalTitle={(title) => setSelectedProposalTitle(title)} 
                        resetViewSignal={proposalResetSignal}
                    />
                );
            default:
                return <InfluencerPerformance />;
        }
    };

    return (
        <div className="workspace-page influencer-workspace">
            <div className="workspace-context select-none">
                <div className="workspace-crumbs">
                    <button 
                        onClick={() => handleSelectTab('dashboard')} 
                        className="workspace-root-link"
                    >
                        <span>Influencer</span>
                    </button>
                    <span className="workspace-slash">/</span>
                    <button 
                        onClick={handleProposalBreadcrumbClick} 
                        className={`workspace-current-link ${
                            !selectedProposalTitle ? 'is-current' : ''
                        }`}
                    >
                        {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'progress' ? 'Progress' : 'Proposal'}
                    </button>

                    {activeTab === 'proposal' && selectedProposalTitle && (
                        <>
                            <span className="workspace-slash">/</span>
                            <span className="workspace-current-title">
                                {selectedProposalTitle}
                            </span>
                        </>
                    )}
                </div>
            </div>

            <div className="workspace-tabs" role="tablist" aria-label="Influencer views">
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
