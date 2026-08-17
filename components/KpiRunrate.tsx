import React, { useEffect, useMemo, useRef, useState } from 'react';
import KpiSetupModal from './KpiSetupModal';
import { KpiData } from '../App';
import { KpiTarget } from '../types';
import { getQuarterInfo } from '../utils/timeHelper';
import { DEFAULT_KPI_METRIC_NAMES, KPI_METRICS, getKpiMetric } from '../utils/kpiMetrics';

declare const echarts: {
    init: (el: HTMLElement, theme?: string | object | null, opts?: { renderer?: 'canvas' | 'svg' }) => {
        setOption: (option: object) => void;
        resize: () => void;
        dispose: () => void;
    };
};

const Loader: React.FC = () => (
    <div className="flex items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--accent-color)] border-t-transparent"></div>
    </div>
);

const formatMetricValue = (num: number, format: 'number' | 'currency') => {
    if (format === 'currency') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
    }
    return new Intl.NumberFormat('en-US').format(num);
};

const getProgressColor = (progress: number) => {
    const p = progress * 100;
    if (p <= 25) return '#DC143C';
    if (p <= 79) return '#FA812F';
    return '#23C48C';
};

const getProgressGradient = (progress: number) => {
    const p = progress * 100;
    let topColor = '#3ce1a5';
    let bottomColor = '#1aa473';
    
    if (p <= 25) {
        topColor = '#ff4d6e';
        bottomColor = '#b3092b';
    } else if (p <= 79) {
        topColor = '#ffa05e';
        bottomColor = '#e06410';
    }
    
    return {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
            { offset: 0, color: topColor },
            { offset: 1, color: bottomColor },
        ],
    };
};

const quarterTargetKey = (quarter: number) => `q${quarter}_target` as keyof Pick<KpiTarget, 'q1_target' | 'q2_target' | 'q3_target' | 'q4_target'>;

interface KpiGaugeProps {
    title: string;
    color: string;
    format: 'number' | 'currency';
    progress: number;
    predicted?: number;
    kpi: number;
    achieved: number;
    isSmall?: boolean;
}

const KpiGauge: React.FC<KpiGaugeProps> = ({ title, color: metricColor, format, progress, predicted, kpi, achieved, isSmall = false }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const progressColor = getProgressColor(progress);

    useEffect(() => {
        if (!chartRef.current) return;

        const chart = echarts.init(chartRef.current, null, { renderer: 'canvas' });
        const gradient = getProgressGradient(progress);
        chart.setOption({
            series: [{
                type: 'liquidFill',
                data: [Math.min(progress, 1)],
                radius: '80%',
                color: [gradient],
                backgroundStyle: {
                    color: '#F0FDF4',
                    shadowBlur: 0,
                },
                itemStyle: {
                    shadowBlur: 0,
                },
                outline: { show: false },
                label: {
                    formatter: `${(progress * 100).toFixed(1)}%`,
                    fontSize: isSmall ? 24 : 40,
                    fontWeight: 'bold',
                    color: '#004D40',
                },
            }],
        });
        
        const handleResize = () => chart.resize();
        window.addEventListener('resize', handleResize);
        
        return () => {
            window.removeEventListener('resize', handleResize);
            chart.dispose();
        };
    }, [progress, isSmall]);

    return (
        <div className="kpi-gauge relative p-6 text-center">
            <div className={`font-semibold text-slate-800 ${isSmall ? 'text-base' : 'text-lg'}`}>
                <span>{title}</span>
                <span className="ml-2 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: metricColor }} />
            </div>
            <div ref={chartRef} className="relative mx-auto" style={{ width: '100%', height: isSmall ? '150px' : '250px' }}></div>
            <div className="mt-2 space-y-1 text-sm text-slate-500">
                {predicted !== undefined && <p>Predicted: <span className="font-bold" style={{ color: progressColor }}>{predicted.toFixed(0)}%</span></p>}
                <p>KPI: <span className="font-bold text-slate-700">{formatMetricValue(kpi, format)}</span></p>
                <p>Achieved: <span className="font-bold text-slate-700">{formatMetricValue(achieved, format)}</span></p>
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

const KpiRunrate: React.FC<KpiRunrateProps> = ({ loading, error, data, onSave }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showPastQuarters, setShowPastQuarters] = useState(false);
    const { quarter, year, timePassedPercent } = getQuarterInfo();

    const currentYearTargets = useMemo(() => {
        const rows = data?.allKpiTargets?.filter(target => target.year === year && KPI_METRICS.some(metric => metric.kpiName === target.kpi_name)) || [];
        const targets = rows.length > 0
            ? rows
            : DEFAULT_KPI_METRIC_NAMES.map(kpiName => ({
                kpi_name: kpiName,
                year,
                q1_target: 0,
                q2_target: 0,
                q3_target: 0,
                q4_target: 0,
            } as KpiTarget));

        return [...targets].sort((a, b) => {
            const aIndex = KPI_METRICS.findIndex(metric => metric.kpiName === a.kpi_name);
            const bIndex = KPI_METRICS.findIndex(metric => metric.kpiName === b.kpi_name);
            return aIndex - bIndex;
        });
    }, [data, year]);

    const safeData = data || {
        allKpiTargets: [],
        currentQuarterProgress: {},
        pastQuartersProgress: {},
    };
    const { currentQuarterProgress, pastQuartersProgress, allKpiTargets } = safeData;
    const currentQuarterTargetKey = quarterTargetKey(quarter);

    const buildGaugeProps = (target: KpiTarget, achieved: number, includePrediction: boolean) => {
        const metric = getKpiMetric(target.kpi_name);
        const kpi = Number(target[currentQuarterTargetKey] || 0);
        const progress = kpi > 0 ? achieved / kpi : 0;
        const predicted = includePrediction && timePassedPercent > 0.001 ? (progress / timePassedPercent) * 100 : undefined;

        return {
            title: metric.label,
            color: metric.color,
            format: metric.format,
            progress,
            predicted,
            kpi,
            achieved,
        };
    };

    return (
        <div className="workspace-page kpi-runrate">
            <div className="workspace-heading">
                <h2 className="text-2xl font-bold text-slate-800">Q{quarter} {year} KPI Runrate</h2>
                <button onClick={() => setIsModalOpen(true)} className="rounded-md bg-[var(--accent-color)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1ea072]">Setup KPIs</button>
            </div>
            {loading ? <Loader /> : error ? <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-red-700">{error}</div> : (
                <>
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
                        {currentYearTargets.map(target => (
                            <KpiGauge
                                key={target.kpi_name}
                                {...buildGaugeProps(target, currentQuarterProgress[target.kpi_name] || 0, true)}
                            />
                        ))}
                    </div>
                    {Object.keys(pastQuartersProgress).length > 0 && (
                        <div>
                            <button onClick={() => setShowPastQuarters(!showPastQuarters)} className="group mb-4 flex w-full items-center justify-between py-2 text-left" aria-expanded={showPastQuarters}>
                                <h2 className="text-2xl font-bold text-slate-800 transition-colors group-hover:text-[var(--accent-color)]">{year} Previous Quarters</h2>
                                <svg className={`h-6 w-6 text-slate-600 transition-transform group-hover:text-[var(--accent-color)] ${showPastQuarters ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showPastQuarters && (
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                                    {Object.keys(pastQuartersProgress).sort().flatMap(qKey => {
                                        const pastQuarterNumber = parseInt(qKey.replace('q', ''), 10);
                                        const pastQuarterTargetKey = quarterTargetKey(pastQuarterNumber);
                                        return currentYearTargets.map(target => {
                                            const metric = getKpiMetric(target.kpi_name);
                                            const pastTarget = Number(target[pastQuarterTargetKey] || 0);
                                            const achieved = pastQuartersProgress[qKey][target.kpi_name] || 0;
                                            const progress = pastTarget > 0 ? achieved / pastTarget : 0;

                                            return (
                                                <KpiGauge
                                                    key={`${qKey}-${target.kpi_name}`}
                                                    title={`Q${pastQuarterNumber} ${metric.label}`}
                                                    color={metric.color}
                                                    format={metric.format}
                                                    progress={progress}
                                                    kpi={pastTarget}
                                                    achieved={achieved}
                                                    isSmall
                                                />
                                            );
                                        });
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
