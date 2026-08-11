import React, { useState, useEffect } from 'react';
import InfluencerPerformance from './InfluencerPerformance';
import InfluencerProgress from './InfluencerProgress';
import InfluencerProposal from './InfluencerProposal';
import { ChevronRight, Home, Link as LinkIcon, Check } from 'lucide-react';

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
        <div className="space-y-4 font-sans">
            {/* Interactive Breadcrumb Path */}
            <div className="flex items-center justify-between px-1 select-none flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                    <button 
                        onClick={() => handleSelectTab('dashboard')} 
                        className="hover:text-[var(--accent-color)] hover:underline transition-colors flex items-center gap-1"
                    >
                        <Home className="w-3.5 h-3.5 text-slate-400" />
                        <span>Influencer</span>
                    </button>

                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                    <button 
                        onClick={handleProposalBreadcrumbClick} 
                        className={`hover:text-[var(--accent-color)] transition-colors capitalize ${
                            !selectedProposalTitle ? 'font-semibold text-slate-900' : 'hover:underline'
                        }`}
                    >
                        {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'progress' ? 'Progress' : 'Proposal'}
                    </button>

                    {activeTab === 'proposal' && selectedProposalTitle && (
                        <>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-900 truncate max-w-[200px]">
                                {selectedProposalTitle}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Subtabs Selection Header */}
            <div className="flex border-b border-[#bfdbfe]/50 mb-6 w-fit mx-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleSelectTab(tab.id)}
                        className={`px-6 py-3 font-semibold text-sm transition-all relative ${
                            activeTab === tab.id
                                ? 'text-[var(--accent-color)]'
                                : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        {tab.label}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--accent-color)]" />
                        )}
                    </button>
                ))}
            </div>
            
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {renderContent()}
            </div>
        </div>
    );
};

export default InfluencerWorkspace;
