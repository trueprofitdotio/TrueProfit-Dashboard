import React, { useState, useEffect } from 'react';
import InfluencerPerformance from './InfluencerPerformance';
import InfluencerProgress from './InfluencerProgress';
import InfluencerProposal from './InfluencerProposal';
import { ChevronRight, Home, Link as LinkIcon, Check } from 'lucide-react';

type SubTab = 'dashboard' | 'progress' | 'proposal';

const getInitialSubTab = (): SubTab => {
    try {
        const params = new URLSearchParams(window.location.search);
        const subtab = params.get('subtab') as SubTab;
        if (subtab && ['dashboard', 'progress', 'proposal'].includes(subtab)) return subtab;
    } catch (e) {}
    return 'dashboard';
};

const InfluencerWorkspace: React.FC = () => {
    const [activeTab, setActiveTabState] = useState<SubTab>(getInitialSubTab);
    const [selectedProposalTitle, setSelectedProposalTitle] = useState<string | null>(null);
    const [proposalResetSignal, setProposalResetSignal] = useState(0);
    const [copiedLink, setCopiedLink] = useState(false);

    const updateUrlSubtab = (subtab: SubTab) => {
        try {
            const params = new URLSearchParams(window.location.search);
            params.set('tab', 'influencer');
            params.set('subtab', subtab);
            if (subtab !== 'proposal') {
                params.delete('proposalId');
            }
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState({}, '', newUrl);
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
            const params = new URLSearchParams(window.location.search);
            const subtab = params.get('subtab') as SubTab;
            if (subtab && ['dashboard', 'progress', 'proposal'].includes(subtab)) {
                setActiveTabState(subtab);
            }
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
            {/* Interactive Breadcrumb Path & Shareable Link Button Showcase */}
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

                {/* Shareable Link Button */}
                <button
                    onClick={handleCopyShareableLink}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-[#bfdbfe]/60 bg-white text-slate-700 hover:bg-emerald-50/60 hover:border-[var(--accent-color)]/50 transition-all shadow-2xs group"
                    title="Copy shareable URL link for internal team members"
                >
                    {copiedLink ? (
                        <>
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-emerald-700 font-bold">Link Copied!</span>
                        </>
                    ) : (
                        <>
                            <LinkIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-[var(--accent-color)] transition-colors shrink-0" />
                            <span>Share Dashboard Link</span>
                        </>
                    )}
                </button>
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
