import React, { useState } from 'react';
import InfluencerPerformance from './InfluencerPerformance';
import InfluencerProgress from './InfluencerProgress';
import InfluencerProposal from './InfluencerProposal';
import { ChevronRight, Home } from 'lucide-react';

type SubTab = 'dashboard' | 'progress' | 'proposal';

const InfluencerWorkspace: React.FC = () => {
    const [activeTab, setActiveTab] = useState<SubTab>('dashboard');
    const [selectedProposalTitle, setSelectedProposalTitle] = useState<string | null>(null);

    const tabs: { id: SubTab; label: string }[] = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'progress', label: 'Progress' },
        { id: 'proposal', label: 'Proposal' },
    ];

    const handleSelectTab = (tabId: SubTab) => {
        setActiveTab(tabId);
        if (tabId !== 'proposal') {
            setSelectedProposalTitle(null);
        }
    };

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
                    />
                );
            default:
                return <InfluencerPerformance />;
        }
    };

    return (
        <div className="space-y-4 font-sans">
            {/* Interactive Breadcrumb Path Showcase */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium px-1 select-none">
                <button 
                    onClick={() => handleSelectTab('dashboard')} 
                    className="hover:text-[var(--accent-color)] hover:underline transition-colors flex items-center gap-1"
                >
                    <Home className="w-3.5 h-3.5 text-slate-400" />
                    <span>Influencer</span>
                </button>

                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                <button 
                    onClick={() => handleSelectTab(activeTab)} 
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
