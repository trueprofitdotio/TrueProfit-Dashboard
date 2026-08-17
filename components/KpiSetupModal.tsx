import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { KpiTarget } from '../types';
import { supabaseClient } from '../services/supabaseClient';
import { getBangkokDateParts } from '../utils/timeHelper';
import { DEFAULT_KPI_METRIC_NAMES, KPI_METRIC_NAMES, KPI_METRICS, getKpiMetric } from '../utils/kpiMetrics';

interface KpiSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    initialTargets: KpiTarget[];
}

type QuarterKey = 'q1' | 'q2' | 'q3' | 'q4';
type QuarterTargets = Record<QuarterKey, number>;

const QUARTERS: { key: QuarterKey; label: string }[] = [
    { key: 'q1', label: 'Q1' },
    { key: 'q2', label: 'Q2' },
    { key: 'q3', label: 'Q3' },
    { key: 'q4', label: 'Q4' },
];

const emptyTargets = (): QuarterTargets => ({ q1: 0, q2: 0, q3: 0, q4: 0 });

const targetToQuarterTargets = (target?: KpiTarget): QuarterTargets => ({
    q1: target?.q1_target || 0,
    q2: target?.q2_target || 0,
    q3: target?.q3_target || 0,
    q4: target?.q4_target || 0,
});

const KpiSetupModal: React.FC<KpiSetupModalProps> = ({ isOpen, onClose, onSave, initialTargets }) => {
    const [year, setYear] = useState(getBangkokDateParts(new Date()).year);
    const [selectedMetricNames, setSelectedMetricNames] = useState<string[]>(DEFAULT_KPI_METRIC_NAMES);
    const [targetsByMetric, setTargetsByMetric] = useState<Record<string, QuarterTargets>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const yearTargets = initialTargets.filter(target => target.year === year && KPI_METRIC_NAMES.includes(target.kpi_name));
        const selectedNames = yearTargets.length > 0
            ? yearTargets.map(target => target.kpi_name)
            : DEFAULT_KPI_METRIC_NAMES;

        const nextTargets = KPI_METRICS.reduce<Record<string, QuarterTargets>>((acc, metric) => {
            acc[metric.kpiName] = targetToQuarterTargets(yearTargets.find(target => target.kpi_name === metric.kpiName));
            return acc;
        }, {});

        setSelectedMetricNames(selectedNames);
        setTargetsByMetric(nextTargets);
    }, [initialTargets, year]);

    const currentYear = getBangkokDateParts(new Date()).year;
    const yearOptions = useMemo(() => Array.from({ length: 10 }, (_, i) => currentYear - 5 + i), [currentYear]);
    const selectedMetrics = selectedMetricNames.map(getKpiMetric);

    if (!isOpen) return null;

    const toggleMetric = (kpiName: string) => {
        setSelectedMetricNames(prev => {
            if (prev.includes(kpiName)) {
                return prev.length === 1 ? prev : prev.filter(name => name !== kpiName);
            }
            return [...prev, kpiName];
        });
    };

    const handleInputChange = (metricName: string, quarter: QuarterKey, value: string) => {
        const numValue = Math.max(0, parseInt(value, 10) || 0);
        setTargetsByMetric(prev => ({
            ...prev,
            [metricName]: {
                ...(prev[metricName] || emptyTargets()),
                [quarter]: numValue,
            },
        }));
    };

    const handleSave = async () => {
        setLoading(true);
        setError(null);

        try {
            const upsertData: Omit<KpiTarget, 'id'>[] = selectedMetricNames.map(metricName => {
                const targets = targetsByMetric[metricName] || emptyTargets();
                return {
                    kpi_name: metricName,
                    year,
                    q1_target: targets.q1,
                    q2_target: targets.q2,
                    q3_target: targets.q3,
                    q4_target: targets.q4,
                };
            });

            const deselectedMetricNames = KPI_METRIC_NAMES.filter(metricName => !selectedMetricNames.includes(metricName));
            if (deselectedMetricNames.length > 0) {
                const { error: deleteError } = await supabaseClient
                    .from('kpi_targets')
                    .delete()
                    .eq('year', year)
                    .in('kpi_name', deselectedMetricNames);

                if (deleteError) throw deleteError;
            }

            const { error: upsertError } = await supabaseClient
                .from('kpi_targets')
                .upsert(upsertData, { onConflict: 'kpi_name,year' });

            if (upsertError) throw upsertError;

            onSave();
            onClose();
        } catch {
            setError('KPI setup could not be saved. Check table permissions and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(251,251,248,0.88)] p-4">
            <div className="app-dialog flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden border border-[var(--tp-rule)] bg-white">
                <div className="flex items-start justify-between gap-6 px-6 pb-4 pt-6">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">Setup KPIs</h2>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                            Select runrate metrics across affiliate, influencer, and merchant dashboards, then set quarterly targets.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            id="year"
                            value={year}
                            onChange={e => setYear(parseInt(e.target.value, 10))}
                            className="h-9 rounded-md border border-[var(--tp-rule)] bg-white px-3 text-sm font-medium text-slate-800 outline-none transition-colors focus:border-[var(--accent-color)]"
                        >
                            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                            aria-label="Close KPI setup"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 gap-8 overflow-hidden px-6 pb-5 lg:grid-cols-[300px_1fr]">
                    <div className="min-h-0 overflow-y-auto pr-1">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Metrics</div>
                        <div className="space-y-1.5">
                            {KPI_METRICS.map(metric => {
                                const isSelected = selectedMetricNames.includes(metric.kpiName);
                                return (
                                    <button
                                        key={metric.kpiName}
                                        type="button"
                                        onClick={() => toggleMetric(metric.kpiName)}
                                        className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                                            isSelected
                                                ? 'bg-slate-900 text-white'
                                                : 'text-slate-700 hover:bg-slate-100'
                                        }`}
                                    >
                                        <span className="flex items-center justify-between gap-3">
                                            <span>
                                                <span className="block text-sm font-semibold">{metric.label}</span>
                                                <span className={`mt-0.5 block text-xs ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                                    {metric.group}
                                                </span>
                                            </span>
                                            {isSelected && <Check className="h-4 w-4 shrink-0" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="min-h-0 overflow-auto">
                        <div className="grid min-w-[620px] grid-cols-[minmax(170px,1fr)_repeat(4,minmax(84px,112px))] gap-3 px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            <span>Target</span>
                            {QUARTERS.map(quarter => <span key={quarter.key}>{quarter.label}</span>)}
                        </div>

                        <div className="space-y-2">
                            {selectedMetrics.map(metric => {
                                const targets = targetsByMetric[metric.kpiName] || emptyTargets();
                                return (
                                    <div
                                        key={metric.kpiName}
                                        className="grid min-w-[620px] grid-cols-[minmax(170px,1fr)_repeat(4,minmax(84px,112px))] items-center gap-3 px-1 py-2"
                                    >
                                        <div>
                                            <div className="text-sm font-semibold text-slate-900">{metric.label}</div>
                                            <div className="mt-0.5 text-xs leading-5 text-slate-500">{metric.description}</div>
                                        </div>
                                        {QUARTERS.map(quarter => (
                                            <input
                                                key={quarter.key}
                                                type="number"
                                                min={0}
                                                placeholder="0"
                                                value={targets[quarter.key] || ''}
                                                onChange={e => handleInputChange(metric.kpiName, quarter.key, e.target.value)}
                                                className="h-10 rounded-md border border-[var(--tp-rule)] bg-white px-3 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-[var(--accent-color)]"
                                            />
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-4 px-6 pb-6 pt-1">
                    <div className="min-h-[20px] text-sm text-rose-600">
                        {error}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="flex min-w-[118px] items-center justify-center gap-2 rounded-md bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1ea072] disabled:bg-slate-400"
                        >
                            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                            <span>{loading ? 'Saving' : 'Save KPIs'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KpiSetupModal;
