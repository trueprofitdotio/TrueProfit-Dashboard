import React, { useState, useEffect, useRef, useMemo } from 'react';
import KpiSetupModal from './KpiSetupModal';
import { PALETTE } from '../constants';
import { KpiData } from '../App';
import { getQuarterInfo } from '../utils/timeHelper';

declare const echarts: {
    init: (el: HTMLElement) => {
        setOption: (option: object) => void;
        resize: () => void;
        dispose: () => void;
    };
};

const Loader: React.FC = () => (
    <div className="flex justify-center items-center p-8">
        <div className="w-10 h-10 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

const getProgressColor = (progress: number) => {
    const p = progress * 100;
    if (p <= 25) return '#DC143C'; if (p <= 79) return '#FA812F'; return '#23C48C';
};

interface KpiGaugeProps { title: React.ReactNode; progress: number; predicted?: number; kpi: number; achieved: number; isSmall?: boolean; }
const KpiGauge: React.FC<KpiGaugeProps> = ({ title, progress, predicted, kpi, achieved, isSmall = false }) => {
    const chartRef = useRef<HTMLDivElement>(null); const color = getProgressColor(progress);
    useEffect(() => {
        if (chartRef.current) {
            const chart = echarts.init(chartRef.current);
            const option = { series: [{ type: 'liquidFill', data: [Math.min(progress, 1)], radius: '80%', color: [color], backgroundStyle: { color: '#F0FDF4' }, outline: { show: false }, label: { formatter: `${(progress * 100).toFixed(1)}%`, fontSize: isSmall ? 24 : 40, fontWeight: 'bold', color: '#004D40' } }] };
            chart.setOption(option); return () => chart.dispose();
        }
    }, [progress, color, isSmall]);

    return (
        <div className="card p-6 text-center">
            <div className={`font-semibold text-slate-800 ${isSmall ? 'text-base' : 'text-lg'}`}>{title}</div>
            <div ref={chartRef} style={{ width: '100%', height: isSmall ? '150px' : '250px' }}></div>
            <div className="text-slate-500 text-sm mt-2 space-y-1">
                {predicted !== undefined && <p>Predicted: <span className="font-bold text-slate-700">{predicted.toFixed(0)}%</span></p>}
                <p>KPI: <span className="font-bold text-slate-700">{formatNumber(kpi)}</span></p>
                <p>Achieved: <span className="font-bold text-slate-700">{formatNumber(achieved)}</span></p>
            </div>
        </div>
    );
};

interface KpiRunrateProps {
    loading: boolean;
    error: string | null;
    data: KpiData | null;
    onSave: () => void;
}

interface KpiTargets {
    year: number;
    signups: { q1: number; q2: number; q3: number; q4: number; };
    clicks: { q1: number; q2: number; q3: number; q4: number; };
    viewcounts: { q1: number; q2: number; q3: number; q4: number; };
}

const KpiRunrate: React.FC<KpiRunrateProps> = ({ loading, error, data, onSave }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showPastQuarters, setShowPastQuarters] = useState(false);
    const { quarter, year, timePassedPercent } = getQuarterInfo();

    const kpiTargets = useMemo<KpiTargets>(() => {
        const defaultTargets = { q1: 0, q2: 0, q3: 0, q4: 0 };
        if (!data?.allKpiTargets) {
            return { year, signups: defaultTargets, clicks: defaultTargets, viewcounts: defaultTargets };
        }
        const signupsTarget = data.allKpiTargets.find(t => t.kpi_name === 'NonKOL Signups' && t.year === year);
        const clicksTarget = data.allKpiTargets.find(t => t.kpi_name === 'NonKOL Clicks' && t.year === year);
        const viewcountsTarget = data.allKpiTargets.find(t => t.kpi_name === 'KOL Viewcount' && t.year === year);
        return {
            year: year,
            signups: { q1: signupsTarget?.q1_target || 0, q2: signupsTarget?.q2_target || 0, q3: signupsTarget?.q3_target || 0, q4: signupsTarget?.q4_target || 0 },
            clicks: { q1: clicksTarget?.q1_target || 0, q2: clicksTarget?.q2_target || 0, q3: clicksTarget?.q3_target || 0, q4: clicksTarget?.q4_target || 0 },
            viewcounts: { q1: viewcountsTarget?.q1_target || 0, q2: viewcountsTarget?.q2_target || 0, q3: viewcountsTarget?.q3_target || 0, q4: viewcountsTarget?.q4_target || 0 },
        };
    }, [data, year]);

    if (!data) {
        return loading ? <Loader /> : null;
    }
    
    const { currentQuarterProgress, pastQuartersProgress, allKpiTargets } = data;

    const quarterKey = `q${quarter}` as keyof typeof kpiTargets.signups;
    const signupTarget = kpiTargets.signups[quarterKey];
    const clickTarget = kpiTargets.clicks[quarterKey];
    const viewcountTarget = kpiTargets.viewcounts[quarterKey];
    
    const signupProgress = signupTarget > 0 ? currentQuarterProgress.signups / signupTarget : 0;
    const clickProgress = clickTarget > 0 ? currentQuarterProgress.clicks / clickTarget : 0;
    const viewcountProgress = viewcountTarget > 0 ? currentQuarterProgress.viewcount / viewcountTarget : 0;

    const signupPredicted = timePassedPercent > 0.001 ? (signupProgress / timePassedPercent) * 100 : 0;
    const clickPredicted = timePassedPercent > 0.001 ? (clickProgress / timePassedPercent) * 100 : 0;
    const viewcountPredicted = timePassedPercent > 0.001 ? (viewcountProgress / timePassedPercent) * 100 : 0;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">Q{quarter} {year} KPI Runrate</h2>
                <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-[var(--accent-color)] text-white font-semibold primary-btn">Setup KPIs</button>
            </div>
             {loading ? <Loader /> : error ? <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md">{error}</div> : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <KpiGauge title={<>NonKOL <span style={{color: PALETTE.signups}}>Signups</span></>} progress={signupProgress} predicted={signupPredicted} kpi={signupTarget} achieved={currentQuarterProgress.signups} />
                        <KpiGauge title={<>NonKOL <span style={{color: PALETTE.clicks}}>Clicks</span></>} progress={clickProgress} predicted={clickPredicted} kpi={clickTarget} achieved={currentQuarterProgress.clicks} />
                        <KpiGauge title={<>KOL <span style={{color: PALETTE.revenue}}>Viewcount</span></>} progress={viewcountProgress} predicted={viewcountPredicted} kpi={viewcountTarget} achieved={currentQuarterProgress.viewcount} />
                    </div>
                    {Object.keys(pastQuartersProgress).length > 0 && (
                        <div>
                             <button onClick={() => setShowPastQuarters(!showPastQuarters)} className="w-full text-left flex justify-between items-center py-2 mb-4 group" aria-expanded={showPastQuarters}>
                                <h2 className="text-2xl font-bold text-slate-800 group-hover:text-[var(--accent-color)] transition-colors">{year} Previous Quarters</h2>
                                <svg className={`w-6 h-6 text-slate-600 transition-transform group-hover:text-[var(--accent-color)] ${showPastQuarters ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showPastQuarters && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {Object.keys(pastQuartersProgress).sort().map(qKey => {
                                        const q = qKey as keyof KpiTargets['signups'];
                                        const pastSignupTarget = kpiTargets.signups[q];
                                        const pastClickTarget = kpiTargets.clicks[q];
                                        const pastViewcountTarget = kpiTargets.viewcounts[q];
                                        const pastSignupAchieved = pastQuartersProgress[q].signups;
                                        const pastClickAchieved = pastQuartersProgress[q].clicks;
                                        const pastViewcountAchieved = pastQuartersProgress[q].viewcount;
                                        const pastSignupProgress = pastSignupTarget > 0 ? pastSignupAchieved / pastSignupTarget : 0;
                                        const pastClickProgress = pastClickTarget > 0 ? pastClickAchieved / pastClickTarget : 0;
                                        const pastViewcountProgress = pastViewcountTarget > 0 ? pastViewcountAchieved / pastViewcountTarget : 0;
                                        return (
                                            <React.Fragment key={q}>
                                                <KpiGauge title={<>Q{q.substring(1)} NonKOL <span style={{color: PALETTE.signups}}>Signups</span></>} progress={pastSignupProgress} kpi={pastSignupTarget} achieved={pastSignupAchieved} isSmall />
                                                <KpiGauge title={<>Q{q.substring(1)} NonKOL <span style={{color: PALETTE.clicks}}>Clicks</span></>} progress={pastClickProgress} kpi={pastClickTarget} achieved={pastClickAchieved} isSmall />
                                                <KpiGauge title={<>Q{q.substring(1)} KOL <span style={{color: PALETTE.revenue}}>Viewcount</span></>} progress={pastViewcountProgress} kpi={pastViewcountTarget} achieved={pastViewcountAchieved} isSmall />
                                            </React.Fragment>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
             )}
            <KpiSetupModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={onSave} initialTargets={allKpiTargets} />
        </div>
    );
};

export default KpiRunrate;
