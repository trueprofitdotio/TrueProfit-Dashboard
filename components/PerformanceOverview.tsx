import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAffiliateReport, fetchAffiliateDirectory } from '../services/affiliateReport';
import { Affiliate, SummaryData, ProcessedMetrics, DailyData, TopAffiliateData, DateRange, MerchantOverview } from '../types';
import { PALETTE, CHART_INK, CHART_FONT, ArrowUpIcon, ArrowDownIcon } from '../constants';
import DateRangePicker from './DateRangePicker';
import { 
    getPresetDateRange, 
    getBangkokDateParts, 
    createBangkokDate, 
    formatDisplayDateGmt7, 
    toGmt7EndOfDay,
    getGmt7DateString,
    calculatePercentageChange
} from '../utils/timeHelper';

declare const echarts: {
    init: (el: HTMLElement) => {
        setOption: (option: object) => void;
        resize: () => void;
        dispose: () => void;
        clear: () => void;
    };
};

const Loader: React.FC = () => ( <div className="flex justify-center items-center p-8"><div className="w-16 h-16 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div></div> );
const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
const formatCurrency = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);


const ChangeIndicator: React.FC<{ value: number }> = ({ value }) => {
    if (value === Infinity) return <span className="text-[12.5px] font-semibold text-[var(--tp-info)]">New</span>;
    if (value === 0 || isNaN(value) || !isFinite(value)) return null;
    const isPositive = value > 0;
    const color = isPositive ? 'text-[var(--tp-positive)]' : 'text-[var(--tp-danger)]';
    const Icon = isPositive ? ArrowUpIcon : ArrowDownIcon;
    return (
        <span className={`flex items-center justify-center gap-0.5 text-[12.5px] font-semibold tabular-nums ${color}`}>
            <Icon className="h-3 w-3 shrink-0" />
            <span>{Math.abs(value).toFixed(1)}%</span>
        </span>
    );
};

const CustomSelect: React.FC<{ options: {value: string, label: string}[], value: string, onChange: (value: string) => void }> = ({ options, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false); const dropdownRef = useRef<HTMLDivElement>(null); const selectedLabel = options.find(o => o.value === value)?.label;
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} className="filter-control tp-filter-trigger flex w-full items-center justify-between gap-2 text-left"> <span className="truncate">{selectedLabel}</span> <svg className={`h-4 w-4 shrink-0 text-[var(--tp-faint)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && ( <ul className="filter-menu absolute z-10 mt-1 max-h-60 w-full overflow-auto bg-white p-1">{options.map(option => <li key={option.value} onClick={() => { onChange(option.value); setIsOpen(false); }} className={`cursor-pointer rounded-[3px] px-3 py-2 text-[13px] font-medium text-[var(--tp-ink-2)] hover:bg-[var(--tp-surface-hover)] ${value === option.value ? 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent-ink)]' : ''}`}>{option.label}</li>)}</ul>)} </div> );
};

const AffiliateMultiSelect: React.FC<{ options: Affiliate[], selectedAccountIds: string[], onChange: (selected: string[]) => void }> = ({ options, selectedAccountIds, onChange }) => {
    const [isOpen, setIsOpen] = useState(false); const [searchTerm, setSearchTerm] = useState(''); const dropdownRef = useRef<HTMLDivElement>(null); const filteredOptions = useMemo(() => options.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]); const toggleOption = (accountId: string) => onChange(selectedAccountIds.includes(accountId) ? selectedAccountIds.filter(id => id !== accountId) : [...selectedAccountIds, accountId]);
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} className="filter-control tp-filter-trigger flex w-full items-center justify-between gap-2 text-left"> <span className={`truncate ${selectedAccountIds.length > 0 ? '' : 'text-[var(--tp-meta)]'}`}>{selectedAccountIds.length === 0 ? 'All Affiliates' : selectedAccountIds.length === 1 ? options.find(o => o.accountId === selectedAccountIds[0])?.name : `${selectedAccountIds.length} affiliates selected`}</span> <svg className={`h-4 w-4 shrink-0 text-[var(--tp-faint)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && ( <div className="filter-menu absolute z-10 mt-1 w-full overflow-hidden bg-white"><div className="border-b border-[var(--tp-rule)] p-1.5"><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-3 py-2 text-[13px]"/></div><ul className="max-h-60 overflow-auto">{filteredOptions.map(option => ( <li key={option.accountId} onClick={() => toggleOption(option.accountId)} className="flex cursor-pointer items-center px-3 py-2 text-[13px] font-medium text-[var(--tp-ink-2)] hover:bg-[var(--tp-surface-hover)]"><input type="checkbox" readOnly checked={selectedAccountIds.includes(option.accountId)} className="mr-2.5 h-3.5 w-3.5 shrink-0 accent-[var(--tp-accent)]" />{option.name}</li>))}</ul></div>)} </div> );
};

// --- FILTERS COMPONENT ---
type CompareType = 'previous_period' | 'previous_month' | 'previous_year';

interface FiltersProps {
    dateRange: DateRange;
    setDateRange: (range: DateRange) => void;
    tier: string;
    setTier: (tier: string) => void;
    allAffiliates: Affiliate[];
    selectedAffiliates: string[];
    setSelectedAffiliates: (selected: string[]) => void;
    onGetMetrics: () => void;
    loading: boolean;
    compareEnabled: boolean;
    setCompareEnabled: (enabled: boolean) => void;
    compareType: CompareType;
    setCompareType: (type: CompareType) => void;
}

const Filters: React.FC<FiltersProps> = ({ 
    dateRange, 
    setDateRange, 
    tier, 
    setTier, 
    allAffiliates, 
    selectedAffiliates, 
    setSelectedAffiliates, 
    onGetMetrics, 
    loading,
    compareEnabled,
    setCompareEnabled,
    compareType,
    setCompareType
}) => {
    const handlePresetSelect = (preset: string) => setDateRange(getPresetDateRange(preset));
    return ( 
        <div className="affiliate-filters card p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6"> 
                <div className="col-span-1 md:col-span-2"><label className="tp-field-label">Time range</label><DateRangePicker value={dateRange} onChange={setDateRange} onPresetSelect={handlePresetSelect} /></div> 
                <div className="col-span-1"><label htmlFor="tier" className="tp-field-label">Affiliate tier</label><CustomSelect options={[{value: 'All', label: 'All'}, {value: 'KOL', label: 'KOL'}, {value: 'NonKOL', label: 'NonKOL'}]} value={tier} onChange={setTier} /></div> 
                <div className="col-span-1"><label className="tp-field-label">Affiliates</label><AffiliateMultiSelect options={allAffiliates} selectedAccountIds={selectedAffiliates} onChange={setSelectedAffiliates} /></div> 
            </div> 
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-4">
                    <label className="flex items-center gap-2 cursor-pointer group w-fit">
                        <div className="relative flex items-center">
                            <input 
                                type="checkbox" 
                                checked={compareEnabled}
                                onChange={(e) => setCompareEnabled(e.target.checked)}
                                className="peer sr-only"
                            />
                            <div className="h-[18px] w-[18px] rounded-[4px] border border-[var(--tp-rule-strong)] transition-all peer-checked:border-[var(--accent-color)] peer-checked:bg-[var(--accent-color)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--tp-accent-soft)]"></div>
                            <svg className="absolute left-[2px] h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <span className="text-[13px] font-semibold text-[var(--tp-ink-2)] transition-colors group-hover:text-[var(--tp-ink)]">Compare with an earlier period</span>
                    </label>

                    {compareEnabled && (
                        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            {[
                                { id: 'previous_period', label: 'Previous period' },
                                { id: 'previous_month', label: 'Previous month' },
                                { id: 'previous_year', label: 'Previous year' }
                            ].map((type) => (
                                <button
                                    key={type.id}
                                    onClick={() => setCompareType(type.id as CompareType)}
                                    className={`rounded-[3px] border px-3 py-1 text-[12px] font-medium transition-all ${
                                        compareType === type.id
                                        ? 'border-[var(--tp-pen)] bg-[var(--tp-pen)] text-[var(--tp-on-pen)]'
                                        : 'border-[var(--tp-rule-strong)] bg-white text-[var(--tp-muted)] hover:border-[var(--tp-pen-rule)] hover:bg-[var(--tp-pen-wash)] hover:text-[var(--tp-pen)]'
                                    }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button onClick={onGetMetrics} disabled={loading} className="primary-btn h-10 shrink-0 rounded-[3px] bg-[var(--accent-color)] px-6 text-[13px] font-semibold text-[var(--tp-on-accent)]">{loading ? 'Loading…' : 'Get metrics'}</button> 
            </div> 
        </div> 
    );
};



const PerformanceOverview: React.FC = () => {
    const [dateRange, setDateRange] = useState<DateRange>(getPresetDateRange('Yesterday'));
    const [tier, setTier] = useState('All'); const [selectedAffiliates, setSelectedAffiliates] = useState<string[]>([]);
    const [allAffiliates, setAllAffiliates] = useState<Affiliate[]>([]);
    const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
    const [compareEnabled, setCompareEnabled] = useState(false);
    const [compareType, setCompareType] = useState<CompareType>('previous_period');
    const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
    const [topAffiliates, setTopAffiliates] = useState<TopAffiliateData[]>([]);
    const [breakdownExpanded, setBreakdownExpanded] = useState(false);
    const [vsDateRangeText, setVsDateRangeText] = useState('');
    const [dailyData, setDailyData] = useState<DailyData[]>([]);
    const [merchantMetrics, setMerchantMetrics] = useState<MerchantOverview | null>(null);

    const requestIdRef = useRef(0);

    useEffect(() => { const fetchInitialData = async () => { try { setAllAffiliates(await fetchAffiliateDirectory()); } catch { setError('Failed to fetch affiliate list.'); } }; fetchInitialData(); }, []);
    
    // The comparison window is a presentation choice, so it is resolved here and
    // handed to the report rather than inferred down in the data layer.
    const resolvePrevRange = useCallback((): DateRange => {
        if (compareEnabled && compareType === 'previous_month') {
            const parts = getBangkokDateParts(dateRange.from);
            return {
                from: createBangkokDate(parts.year, parts.month - 1, 1),
                to: createBangkokDate(parts.year, parts.month, 0),
            };
        }
        if (compareEnabled && compareType === 'previous_year') {
            const fromParts = getBangkokDateParts(dateRange.from);
            const toParts = getBangkokDateParts(dateRange.to);
            return {
                from: createBangkokDate(fromParts.year - 1, fromParts.month, fromParts.day),
                to: createBangkokDate(toParts.year - 1, toParts.month, toParts.day),
            };
        }
        const duration = dateRange.to.getTime() - dateRange.from.getTime();
        const to = new Date(dateRange.from.getTime() - 864e5);
        return { from: new Date(to.getTime() - duration), to };
    }, [dateRange, compareEnabled, compareType]);

    const handleGetMetrics = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true); setError(null); setMerchantMetrics(null);
        try {
            let currentAffiliates = allAffiliates;
            if (currentAffiliates.length === 0) {
                try {
                    currentAffiliates = await fetchAffiliateDirectory();
                    setAllAffiliates(currentAffiliates);
                } catch (e) {
                    console.error('Failed to fetch affiliates on demand', e);
                    setError('Failed to fetch affiliate list.');
                    setLoading(false);
                    return;
                }
            }
            if (currentAffiliates.length === 0) { setLoading(false); return; }

            const prevDateRange = resolvePrevRange();
            setVsDateRangeText(`vs ${formatDisplayDateGmt7(prevDateRange.from)} to ${formatDisplayDateGmt7(prevDateRange.to)}`);

            const report = await fetchAffiliateReport({
                dateRange,
                prevDateRange,
                tier,
                selectedAccountIds: selectedAffiliates,
                allAffiliates: currentAffiliates,
            });

            if (requestId !== requestIdRef.current) return;

            setSummaryData(report.summary);
            setDailyData(report.daily);
            setTopAffiliates(report.affiliates);
            setMerchantMetrics(report.merchants);
        } catch (err: unknown) {
            if (requestId !== requestIdRef.current) return;
            setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        } finally { setLoading(false); }
    }, [dateRange, tier, selectedAffiliates, allAffiliates, resolvePrevRange]);
    


    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <Filters 
                dateRange={dateRange} 
                setDateRange={setDateRange} 
                tier={tier} 
                setTier={setTier} 
                allAffiliates={allAffiliates} 
                selectedAffiliates={selectedAffiliates} 
                setSelectedAffiliates={setSelectedAffiliates} 
                onGetMetrics={handleGetMetrics} 
                loading={loading} 
                compareEnabled={compareEnabled} 
                setCompareEnabled={setCompareEnabled} 
                compareType={compareType} 
                setCompareType={setCompareType} 
            />
            {loading && <Loader />}
            {error && (
                <div className="card flex items-start gap-2.5 p-4 text-[13px] font-medium text-[var(--tp-danger)]" role="alert">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tp-danger)]" />
                    <span>{error}</span>
                </div>
            )}
            {!loading && !error && summaryData && (
                <div className="flex flex-col gap-4">
                    {/* The strip and the plot are already surfaces with their
                        own edge; wrapping either in a `card` would put a
                        bordered box inside a bordered box. */}
                    <SummaryOverview data={summaryData} isExpanded={breakdownExpanded} setIsExpanded={setBreakdownExpanded} vsDateRangeText={vsDateRangeText} />

                    {dailyData.length > 0 && <PerformanceChart dailyData={dailyData} />}

                    {/* Section: Merchants Details - Placed immediately under Overview */}
                    {merchantMetrics && (
                        <MerchantsDetailsSection metrics={merchantMetrics} vsDateRangeText={vsDateRangeText} />
                    )}

                    <TopPerformingAffiliatesChart data={topAffiliates} />
                </div>
            )}
            {!loading && !error && !summaryData && (
                <div className="card">
                    <div className="tp-empty">
                        <p className="tp-empty-title">Nothing loaded yet</p>
                        <p className="tp-empty-body">Pick a date range and tier above, then choose Get Metrics to pull signups, clicks, installs, revenue, and payouts from Trackdesk.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const SummaryOverview: React.FC<{ data: SummaryData; isExpanded: boolean; setIsExpanded: (expanded: boolean) => void; vsDateRangeText: string; }> = ({ data, isExpanded, setIsExpanded, vsDateRangeText }) => {
    const metrics = [
        { key: 'signups',  label: 'Signups',  value: data.signups,  prev: data.signupsPrev,  color: PALETTE.signups },
        { key: 'clicks',   label: 'Clicks',   value: data.clicks,   prev: data.clicksPrev,   color: PALETTE.clicks },
        { key: 'installs', label: 'Installs', value: data.installs, prev: data.installsPrev, color: PALETTE.installs },
        { key: 'revenue',  label: 'Revenue',  value: data.revenue,  prev: data.revenuePrev,  color: PALETTE.revenue,  isCurrency: true },
        { key: 'payouts',  label: 'Payouts',  value: data.payouts,  prev: data.payoutsPrev,  color: PALETTE.payouts,  isCurrency: true },
    ];

    // One instrument divided by hairlines, not five cards in a grid. These
    // five numbers exist to be compared, and a card would put two borders and
    // two shadows between every pair of them. The measure's series colour
    // rides on a short rule beside its name so the figure itself can stay in
    // ink — a number tinted with its own series colour is harder to read and
    // tells you nothing the label did not.
    return (
        <section>
            <div className="mb-3 flex items-baseline justify-between gap-4">
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--tp-ink)]">Overview</h3>
                <span className="text-[11.5px] text-[var(--tp-meta)]">{vsDateRangeText}</span>
            </div>

            <div className="tp-readout-strip">
                {metrics.map(metric => (
                    <div key={metric.key} className="tp-readout">
                        <p className="tp-readout-label">
                            <span className="tp-readout-key" style={{ background: metric.color }} aria-hidden="true" />
                            {metric.label}
                        </p>
                        <p className="tp-readout-value">
                            {metric.isCurrency ? formatCurrency(metric.value) : formatNumber(metric.value)}
                        </p>
                        <div className="tp-readout-foot">
                            <ChangeIndicator value={calculatePercentageChange(metric.value, metric.prev)} />
                        </div>

                        {isExpanded && (
                            <div className="mt-1 space-y-1 border-t border-[var(--tp-rule)] pt-2">
                                {Object.keys(data.byTier).map(tier => {
                                    const tierData = data.byTier[tier as keyof typeof data.byTier];
                                    if (!tierData) return null;
                                    const tierValue = tierData[metric.key as keyof ProcessedMetrics];
                                    const tierPrev = tierData.prev[metric.key as keyof ProcessedMetrics];
                                    return (
                                        <div key={tier} className="flex items-center justify-between gap-2 text-[11.5px]">
                                            <span className="truncate text-[var(--tp-meta)]">{tier}</span>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <span className="tp-num text-[12px] text-[var(--tp-ink-2)]">{metric.isCurrency ? formatCurrency(tierValue) : formatNumber(tierValue)}</span>
                                                <ChangeIndicator value={calculatePercentageChange(tierValue, tierPrev)} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-2.5">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-expanded={isExpanded}
                    className="text-[12px] font-medium text-[var(--tp-pen)] hover:underline"
                >
                    {isExpanded ? 'Hide breakdown by tier' : 'Show breakdown by tier'}
                </button>
            </div>
        </section>
    );
};

const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const formatAxisCount = (value: number) =>
    Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1)}k` : `${value}`;
const formatAxisMoney = (value: number) =>
    Math.abs(value) >= 1000 ? `$${(value / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1)}k` : `$${value}`;

/* One channel per measure, in reading order: what reached us, who signed up,
   what it produced, what it earned, what it cost. */
const TREND_SERIES = [
    { key: 'signups',  label: 'Signups',  color: PALETTE.signups,  isMoney: false },
    { key: 'clicks',   label: 'Clicks',   color: PALETTE.clicks,   isMoney: false },
    { key: 'installs', label: 'Installs', color: PALETTE.installs, isMoney: false },
    { key: 'revenue',  label: 'Revenue',  color: PALETTE.revenue,  isMoney: true  },
    { key: 'payouts',  label: 'Payouts',  color: PALETTE.payouts,  isMoney: true  },
] as const;

const CHANNEL_H = 58;    // one channel's plot band
// Room above each channel for its own label. The top gridline's value sits
// astride the band's top edge, so the label needs clearance for half of it.
const CHANNEL_TOP = 26;
const AXIS_H = 26;       // the shared date axis under the last channel

/* The daily trend as a strip chart: one pen per measure, every trace drawn
   against one shared time axis on the same paper.

   It replaced a single plot carrying all five measures on two y-scales,
   counts left and dollars right. Where those two scales are pinned against
   each other is arbitrary, so every crossing the eye read as a relationship
   was an artefact of that choice. Giving each measure its own band keeps all
   five visible and all five comparable along time — the comparison that
   actually exists — and costs only vertical room. */
const PerformanceChart: React.FC<{ dailyData: DailyData[] }> = ({ dailyData }) => {
    const chartRef = useRef<HTMLDivElement>(null);

    const sorted = useMemo(
        () => [...dailyData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
        [dailyData]
    );

    useEffect(() => {
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);

        if (sorted.length > 0) {
            const valueOf = (d: DailyData, key: string) => Number((d as unknown as Record<string, unknown>)[key]) || 0;
            const dates = sorted.map(d => formatDisplayDateGmt7(d.date, { month: 'short', day: 'numeric' }));
            const top = (i: number) => CHANNEL_TOP + i * (CHANNEL_H + CHANNEL_TOP);

            const option = {
                animationDuration: 200,
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: CHART_INK.surface,
                    borderColor: CHART_INK.axis,
                    borderWidth: 1,
                    padding: [9, 11],
                    textStyle: { color: CHART_INK.text, fontSize: 12, fontFamily: CHART_FONT.ui },
                    // One cursor down the whole stack, so hovering a day reads
                    // every channel at that day at once — the recorder's rule.
                    axisPointer: { type: 'line', lineStyle: { color: CHART_INK.axis, width: 1 }, link: [{ xAxisIndex: 'all' }] },
                },
                // A title per channel rather than a shared legend: with one
                // series in each band the name belongs beside its own trace,
                // and a legend would imply the bands share a scale.
                title: TREND_SERIES.map((s, i) => ({
                    text: s.isMoney ? `${s.label} (US$)` : s.label,
                    left: 0,
                    top: top(i) - 20,
                    textStyle: {
                        color: CHART_INK.label,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: CHART_FONT.narrow,
                    },
                })),
                grid: TREND_SERIES.map((_, i) => ({
                    left: 4, right: 8, top: top(i), height: CHANNEL_H, containLabel: true,
                })),
                xAxis: TREND_SERIES.map((_, i) => ({
                    type: 'category',
                    gridIndex: i,
                    data: dates,
                    boundaryGap: false,
                    axisLine: { lineStyle: { color: CHART_INK.axis } },
                    axisTick: { show: false },
                    // Only the bottom channel prints the dates; the rest
                    // inherit them by sitting on the same verticals.
                    axisLabel: i === TREND_SERIES.length - 1
                        ? { color: CHART_INK.label, fontSize: 11, hideOverlap: true, fontFamily: CHART_FONT.mono }
                        : { show: false },
                })),
                yAxis: TREND_SERIES.map((s, i) => ({
                    type: 'value',
                    gridIndex: i,
                    min: 0,
                    splitNumber: 2,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: {
                        color: CHART_INK.label,
                        fontSize: 10.5,
                        fontFamily: CHART_FONT.mono,
                        formatter: s.isMoney ? formatAxisMoney : formatAxisCount,
                    },
                    splitLine: { lineStyle: { color: CHART_INK.grid, type: 'solid' } },
                })),
                series: TREND_SERIES.map((s, i) => ({
                    name: s.isMoney ? `${s.label} (US$)` : s.label,
                    type: 'line',
                    xAxisIndex: i,
                    yAxisIndex: i,
                    // Smoothed at the user's request. The readings themselves are
                    // unchanged and the tooltip still reports each day exactly;
                    // only the line between two days is drawn as a curve.
                    smooth: 0.35,
                    smoothMonotone: 'x',
                    showSymbol: sorted.length <= 2,
                    symbol: 'circle',
                    symbolSize: 8,
                    lineStyle: { width: 2, cap: 'round', join: 'round', color: s.color },
                    itemStyle: { color: s.color, borderColor: CHART_INK.surface, borderWidth: 2 },
                    areaStyle: {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: hexToRgba(s.color, 0.22) },
                                { offset: 1, color: hexToRgba(s.color, 0.01) },
                            ],
                        },
                    },
                    data: sorted.map(d => valueOf(d, s.key)),
                })),
            };
            chart.setOption(option);
        } else {
            chart.clear();
        }

        const resizeHandler = () => chart?.resize();
        window.addEventListener('resize', resizeHandler);
        return () => { chart.dispose(); window.removeEventListener('resize', resizeHandler); };
    }, [sorted]);

    const height = CHANNEL_TOP + TREND_SERIES.length * (CHANNEL_H + CHANNEL_TOP) + AXIS_H;

    return (
        <section>
            <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--tp-ink)]">Daily performance trend</h3>
                <span className="text-[11.5px] text-[var(--tp-meta)]">Each channel on its own scale · hover a day to read all five</span>
            </div>
            <div ref={chartRef} className="tp-plot" style={{ width: '100%', height: `${height}px` }}></div>
        </section>
    );
};


const getTierColor = (tierName: string) => {
    const name = tierName.toLowerCase();
    if (name.startsWith('kol')) return 'tp-chip-accent';
    if (name.includes('standard')) return 'tp-chip-info';
    if (name.includes('nonkol')) return '';
    return '';
};

/* Merchant detail.

   The payout count on a merchant is not a category — it is a duration. A
   merchant with four payouts is one that has stayed subscribed four months
   and has not cancelled. The previous version split that into three slices
   (1 / 2-3 / >3) of a parts-of-whole bar, which asked the reader to compare
   three groups that are not alternatives to each other: every merchant in
   the ">3" slice also lived through months 1, 2 and 3.

   Read as duration it is a retention curve: of the merchants that paid at
   all, how many were still paying in month two, month three, and so on. The
   bars only ever descend, the gap between two bars is the churn in that
   month, and the last bar is the cohort that is still running. */

const RETENTION_CAP = 12;

const retentionCurve = (tenures: number[]) => {
    const cohort = tenures.length;
    if (cohort === 0) return [];
    const longest = Math.min(Math.max(...tenures), RETENTION_CAP);
    return Array.from({ length: longest }, (_, i) => {
        const month = i + 1;
        const stillPaying = tenures.filter(t => t >= month).length;
        return {
            month,
            isCap: month === RETENTION_CAP && Math.max(...tenures) > RETENTION_CAP,
            merchants: stillPaying,
            share: (stillPaying / cohort) * 100,
            churned: tenures.filter(t => t === month - 1).length,
        };
    });
};

const MerchantsDetailsSection: React.FC<{ metrics: MerchantOverview; vsDateRangeText: string }> = ({ metrics, vsDateRangeText }) => {
    if (!metrics) return null;

    const curve = retentionCurve(metrics.payoutCounts);
    const cohort = metrics.payoutCounts.length;

    // "Past the first month" is the number worth watching: a merchant that
    // pays once and leaves cost as much to acquire as one that stays a year.
    const retainedPastFirst = metrics.payoutCounts.filter(t => t >= 2).length;
    const retainedPastFirstPrev = metrics.payoutCountsPrev.filter(t => t >= 2).length;
    const retentionRate = cohort > 0 ? (retainedPastFirst / cohort) * 100 : 0;
    const prevCohort = metrics.payoutCountsPrev.length;
    const retentionRatePrev = prevCohort > 0 ? (retainedPastFirstPrev / prevCohort) * 100 : 0;

    const medianTenure = (() => {
        if (cohort === 0) return 0;
        const sorted = [...metrics.payoutCounts].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    })();

    const headline = [
        {
            label: 'Referred merchants',
            value: formatNumber(metrics.totalReferredMerchants),
            change: calculatePercentageChange(metrics.totalReferredMerchants, metrics.totalReferredMerchantsPrev),
            note: 'Installed or paid through an affiliate in this range.',
        },
        {
            label: 'Paying merchants',
            value: formatNumber(metrics.totalPayingMerchants),
            change: calculatePercentageChange(metrics.totalPayingMerchants, metrics.totalPayingMerchantsPrev),
            note: 'At least one monthly payout landed in this range.',
        },
        {
            label: 'Past the first month',
            value: `${retentionRate.toFixed(0)}%`,
            change: calculatePercentageChange(retentionRate, retentionRatePrev),
            note: `${formatNumber(retainedPastFirst)} of ${formatNumber(cohort)} merchants paid a second month.`,
        },
        {
            label: 'Median tenure',
            value: `${medianTenure}`,
            unit: medianTenure === 1 ? 'month' : 'months',
            note: 'Half the paying merchants stay at least this long.',
        },
    ];

    return (
        <section className="tp-section">
            <div className="tp-section-head">
                <h3>Merchant retention</h3>
                <span className="tp-section-head-meta">{vsDateRangeText}</span>
            </div>

            <div className="tp-readout-strip">
                {headline.map(item => (
                    <div key={item.label} className="tp-readout">
                        <p className="tp-readout-label">{item.label}</p>
                        <p className="tp-readout-value">
                            {item.value}
                            {item.unit && <span className="ml-1.5 text-[14px] font-medium text-[var(--tp-muted)]">{item.unit}</span>}
                        </p>
                        <div className="tp-readout-foot">
                            {item.change !== undefined
                                ? <ChangeIndicator value={item.change} />
                                : <span className="text-[11.5px] text-[var(--tp-meta)]">Across the selected range</span>}
                        </div>
                        <p className="mt-1 text-[11.5px] leading-snug text-[var(--tp-meta)]">{item.note}</p>
                    </div>
                ))}
            </div>

            <div className="card p-4">
                <div className="flex items-baseline justify-between gap-4">
                    <h4 className="text-[13px] font-semibold text-[var(--tp-ink)]">How long paying merchants stay</h4>
                    <span className="tp-num text-[11.5px] text-[var(--tp-meta)]">{formatNumber(cohort)} merchants</span>
                </div>

                {cohort === 0 ? (
                    <p className="mt-2 text-[12px] text-[var(--tp-meta)]">No merchant took a payout in this range.</p>
                ) : (
                    <>
                        <p className="mt-1 text-[11.5px] leading-snug text-[var(--tp-meta)]">
                            Each month counts the merchants still subscribed that month. The drop between two bars is that month&rsquo;s churn.
                        </p>
                        <ol className="mt-4 space-y-2">
                            {curve.map(step => (
                                <li key={step.month} className="flex items-center gap-3">
                                    <span className="w-[62px] shrink-0 text-[11.5px] text-[var(--tp-muted)]">
                                        {step.isCap ? `Month ${step.month}+` : `Month ${step.month}`}
                                    </span>
                                    <span className="relative h-4 flex-1 overflow-hidden rounded-[2px] bg-[var(--tp-surface-sunken)]">
                                        <span
                                            className="absolute inset-y-0 left-0 rounded-[2px]"
                                            style={{
                                                width: `${step.share}%`,
                                                backgroundImage: 'linear-gradient(90deg, var(--tp-pen-deep), var(--tp-pen))',
                                            }}
                                        />
                                    </span>
                                    <span className="tp-num w-[44px] shrink-0 text-right text-[12.5px] font-medium text-[var(--tp-ink)]">
                                        {formatNumber(step.merchants)}
                                    </span>
                                    <span className="tp-num w-[42px] shrink-0 text-right text-[11.5px] text-[var(--tp-meta)]">
                                        {step.share.toFixed(0)}%
                                    </span>
                                    <span className="tp-num w-[72px] shrink-0 text-right text-[11.5px] text-[var(--tp-danger)]">
                                        {step.churned > 0 ? `−${formatNumber(step.churned)} left` : ''}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </>
                )}
            </div>
        </section>
    );
};

/* Three panels, one measure each, sharing one row order. The previous single
   plot stacked clicks and installs as bars against a left axis while revenue
   rode a second right-hand axis — so a revenue line crossing a bar top meant
   nothing at all. Small multiples give each measure the axis it deserves and
   let the eye compare rows across panels, which is the actual question:
   is the affiliate that drives the most clicks also the one that earns? */
const AFFILIATE_PANELS = [
    { key: 'clicks',   label: 'Clicks',   color: PALETTE.clicks,   isMoney: false },
    { key: 'installs', label: 'Installs', color: PALETTE.installs, isMoney: false },
    { key: 'revenue',  label: 'Revenue',  color: PALETTE.revenue,  isMoney: true  },
] as const;

// Tip labels sit in the gutter beside each panel, so they are compacted. The
// full precision stays in the tooltip and in the table below.
const formatCompact = (value: number, isMoney: boolean) => {
    const prefix = isMoney ? '$' : '';
    if (Math.abs(value) >= 1000) {
        const k = value / 1000;
        return prefix + (Math.abs(value) >= 10000 ? Math.round(k).toString() : k.toFixed(1)) + 'k';
    }
    return prefix + (isMoney ? value.toFixed(0) : formatNumber(value));
};

// Each panel occupies a quarter of the width; the band to the left of the
// first one carries the affiliate names for all three.
const PANEL_LEFT = ['17%', '44%', '71%'];
const PANEL_WIDTH = '21%';
const ROW_HEIGHT = 30;

const TopPerformingAffiliatesChart: React.FC<{ data: TopAffiliateData[] }> = ({ data }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    // Installs lead: it is the outcome the programme is run for, and ranking
    // by it answers "who is actually producing" before "who is loudest".
    const [sortBy, setSortBy] = useState<'clicks' | 'installs' | 'revenue'>('installs');

    // Every affiliate, not a top ten. A cut-off hides exactly the long tail a
    // partnerships team is looking for, and the panel scrolls inside the
    // sheet rather than pushing the page down.
    const ranked = useMemo(() => {
        return [...data].sort((a, b) => {
            if (sortBy === 'clicks') return b.clicks - a.clicks;
            if (sortBy === 'installs') return b.installs - a.installs;
            return b.revenue - a.revenue;
        });
    }, [data, sortBy]);

    const chartHeight = 44 + Math.max(ranked.length, 1) * ROW_HEIGHT;

    useEffect(() => {
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        if (ranked.length > 0) {
            const names = ranked.map(d => d.affiliateName);
            const option = {
                tooltip: {
                    trigger: 'item',
                    backgroundColor: '#ffffff',
                    borderColor: 'var(--tp-rule-panel)',
                    borderWidth: 1,
                    padding: [10, 12],
                    textStyle: { color: 'var(--tp-ink)', fontSize: 12 },
                    extraCssText: 'border-radius: 4px; box-shadow: 0 2px 4px -1px rgba(21,23,31,.07), 0 14px 32px -10px rgba(21,23,31,.16);',
                    // Hovering any panel reports all three measures, so the
                    // panels stay one reading rather than three separate ones.
                    formatter: (param: { dataIndex: number }) => {
                        const row = ranked[param.dataIndex];
                        if (!row) return '';
                        const head = '<div style="font-weight:600;color:var(--tp-ink);margin-bottom:7px">' + row.affiliateName + '</div>';
                        const rows = AFFILIATE_PANELS.map(panel => {
                            const value = row[panel.key] as number;
                            const shown = panel.isMoney ? formatCurrency(value) : formatNumber(value);
                            return '<div style="display:flex;align-items:center;gap:10px;line-height:1.8">'
                                + '<span style="width:8px;height:8px;border-radius:999px;flex:none;background:' + panel.color + '"></span>'
                                + '<span style="flex:1;color:var(--tp-muted)">' + panel.label + '</span>'
                                + '<span style="color:var(--tp-ink);font-weight:600;font-variant-numeric:tabular-nums">' + shown + '</span>'
                                + '</div>';
                        }).join('');
                        return head + rows;
                    },
                },
                // One series per panel, so each panel names itself and no
                // legend box is needed.
                title: AFFILIATE_PANELS.map((panel, i) => ({
                    text: panel.label,
                    left: PANEL_LEFT[i],
                    top: 0,
                    textStyle: { color: 'var(--tp-muted)', fontSize: 11.5, fontWeight: 600, letterSpacing: 0.14 },
                })),
                grid: AFFILIATE_PANELS.map((_, i) => ({
                    left: PANEL_LEFT[i],
                    width: PANEL_WIDTH,
                    top: 30,
                    bottom: 8,
                    containLabel: false,
                })),
                xAxis: AFFILIATE_PANELS.map((_, i) => ({
                    type: 'value',
                    gridIndex: i,
                    show: false,
                    // Headroom so the longest bar's tip label stays inside the gutter.
                    max: (value: { max: number }) => value.max * 1.02,
                })),
                yAxis: AFFILIATE_PANELS.map((_, i) => ({
                    type: 'category',
                    gridIndex: i,
                    data: names,
                    inverse: true,
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: i === 0
                        ? {
                            color: 'var(--tp-ink-2)',
                            fontSize: 12,
                            margin: 14,
                            width: 150,
                            overflow: 'truncate',
                            ellipsis: '…',
                        }
                        : { show: false },
                })),
                series: AFFILIATE_PANELS.map((panel, i) => ({
                    name: panel.label,
                    type: 'bar',
                    xAxisIndex: i,
                    yAxisIndex: i,
                    // ECharts honours a callback on label.formatter but not on
                    // label.color — passing one there silently falls back to a
                    // default tint. Per-item label style is the way in.
                    data: ranked.map(d => {
                        const value = d[panel.key] as number;
                        return {
                            value,
                            // A zero has no bar to anchor it, so a column of them
                            // reads as clutter at the axis. They stay — an empty
                            // row would be ambiguous between "none" and "not
                            // measured" — but recede to the divider tint.
                            label: { color: value > 0 ? 'var(--tp-meta)' : 'var(--tp-faint)' },
                        };
                    }),
                    // Capped well under the band height, so the leftover is air.
                    barWidth: 13,
                    // Rounded data-end, square at the baseline.
                    itemStyle: { color: panel.color, borderRadius: [0, 4, 4, 0] },
                    label: {
                        show: true,
                        position: 'right',
                        distance: 7,
                        fontSize: 11,
                        color: 'var(--tp-meta)',
                        formatter: (p: { value: number }) => formatCompact(p.value, panel.isMoney),
                    },
                    emphasis: { itemStyle: { color: panel.color } },
                })),
            };
            chart.setOption(option);
        } else {
            chart.clear();
        }
        const resizeHandler = () => chart?.resize();
        window.addEventListener('resize', resizeHandler);
        return () => {
            chart.dispose();
            window.removeEventListener('resize', resizeHandler);
        };
    }, [ranked]);

    if (ranked.length === 0) return null;

    return (
        <div className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                    <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--tp-ink)]">Top performing affiliates</h3>
                    <p className="mt-1 max-w-[56ch] text-[12.5px] leading-snug text-[var(--tp-meta)]">
                        Three measures, one row per affiliate, ranked by the measure you choose. Each panel has its own scale, so
                        compare across a row rather than between panels.
                    </p>
                </div>
                <div
                    className="flex w-fit shrink-0 gap-0.5 rounded-[3px] border border-[var(--tp-rule)] bg-[var(--tp-surface-sunken)] p-0.5"
                    role="group"
                    aria-label="Rank affiliates by"
                >
                    {(['clicks', 'installs', 'revenue'] as const).map(metric => (
                        <button
                            key={metric}
                            onClick={() => setSortBy(metric)}
                            aria-pressed={sortBy === metric}
                            className={`rounded-[3px] px-3 py-1 text-[12px] font-semibold capitalize transition-all ${
                                sortBy === metric
                                ? 'bg-[var(--tp-surface)] text-[var(--tp-ink)] shadow-[var(--tp-elev-1)]'
                                : 'text-[var(--tp-muted)] hover:text-[var(--tp-ink)]'
                            }`}
                        >
                            {metric}
                        </button>
                    ))}
                </div>
            </div>
            {/* Uncapped, so the panel can outgrow the viewport. It scrolls
                inside its own frame rather than pushing everything below it
                off the page. */}
            <div className="tp-plot max-h-[520px] overflow-y-auto">
                <div ref={chartRef} style={{ width: '100%', height: `${chartHeight}px` }}></div>
            </div>
        </div>
    );
};

export default PerformanceOverview;
