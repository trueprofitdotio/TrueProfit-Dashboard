import React, { useState } from 'react';
import InfluencerPerformance from './InfluencerPerformance';
import InfluencerProgress from './InfluencerProgress';
import InfluencerProposal from './InfluencerProposal';

type SubTab = 'dashboard' | 'progress' | 'proposal';

const InfluencerWorkspace: React.FC = () => {
    const [activeTab, setActiveTab] = useState<SubTab>('dashboard');

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
        <div className="space-y-6">
            <div className="flex border-b border-[#bfdbfe]/50 mb-6 w-fit mx-auto">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
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
