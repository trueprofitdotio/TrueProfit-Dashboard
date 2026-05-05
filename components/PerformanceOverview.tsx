import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAffiliates, fetchClickReport, fetchConversionReport } from '../services/trackdeskService';
import { Affiliate, SummaryData, ProcessedMetrics, DailyData, TopAffiliateData, DateRange, ConversionReportRow, ClickReportRow } from '../types';
import { PALETTE, ArrowUpIcon, ArrowDownIcon } from '../constants';
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
    };
};

const Loader: React.FC = () => ( <div className="flex justify-center items-center p-8"><div className="w-16 h-16 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div></div> );
const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
const formatCurrency = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

const ChangeIndicator: React.FC<{ value: number }> = ({ value }) => {
    if (value === Infinity) return <span className="text-blue-500 font-medium">(new)</span>;
    if (value === 0 || isNaN(value) || !isFinite(value)) return null;
    const isPositive = value > 0; const color = isPositive ? 'text-green-500' : 'text-red-500'; const Icon = isPositive ? ArrowUpIcon : ArrowDownIcon;
    return ( <span className={`flex items-center justify-center text-sm font-medium ${color}`}><Icon className="w-3 h-3 mr-1" /><span>{value.toFixed(1)}%</span></span> );
};

const CustomSelect: React.FC<{ options: {value: string, label: string}[], value: string, onChange: (value: string) => void }> = ({ options, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false); const dropdownRef = useRef<HTMLDivElement>(null); const selectedLabel = options.find(o => o.value === value)?.label;
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-white text-left p-2.5 border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px]"> <span className="text-slate-800">{selectedLabel}</span> <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && ( <ul className="absolute z-10 mt-1 w-full bg-white max-h-60 overflow-auto shadow-lg border border-slate-200">{options.map(option => <li key={option.value} onClick={() => { onChange(option.value); setIsOpen(false); }} className={`px-4 py-2 text-sm text-slate-700 hover:bg-emerald-50 cursor-pointer ${value === option.value ? 'bg-emerald-50' : ''}`}>{option.label}</li>)}</ul>)} </div> );
};

const AffiliateMultiSelect: React.FC<{ options: Affiliate[], selectedAccountIds: string[], onChange: (selected: string[]) => void }> = ({ options, selectedAccountIds, onChange }) => {
    const [isOpen, setIsOpen] = useState(false); const [searchTerm, setSearchTerm] = useState(''); const dropdownRef = useRef<HTMLDivElement>(null); const filteredOptions = useMemo(() => options.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]); const toggleOption = (accountId: string) => onChange(selectedAccountIds.includes(accountId) ? selectedAccountIds.filter(id => id !== accountId) : [...selectedAccountIds, accountId]);
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-white text-left p-2.5 border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px]"> <span className={selectedAccountIds.length > 0 ? 'text-slate-800' : 'text-slate-400'}>{selectedAccountIds.length === 0 ? 'All Affiliates' : selectedAccountIds.length === 1 ? options.find(o => o.accountId === selectedAccountIds[0])?.name : `${selectedAccountIds.length} affiliates selected`}</span> <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && ( <div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200"><div className="p-2 border-b border-slate-200"><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border border-slate-300 focus:ring-1 focus:ring-[var(--accent-color)]"/></div><ul className="max-h-60 overflow-auto">{filteredOptions.map(option => ( <li key={option.accountId} onClick={() => toggleOption(option.accountId)} className="px-4 py-2 text-sm text-slate-700 hover:bg-emerald-50 cursor-pointer flex items-center"><input type="checkbox" readOnly checked={selectedAccountIds.includes(option.accountId)} className="h-4 w-4 text-[var(--accent-color)] border-slate-300 mr-3 focus:ring-[var(--accent-color)]" />{option.name}</li>))}</ul></div>)} </div> );
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
        <div className="card p-6 space-y-6"> 
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6"> 
                <div className="lg:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Time Range</label><DateRangePicker value={dateRange} onChange={setDateRange} onPresetSelect={handlePresetSelect} /></div> 
                <div><label htmlFor="tier" className="block text-sm font-medium text-slate-700 mb-1">Affiliate Tier</label><CustomSelect options={[{value: 'All', label: 'All'}, {value: 'KOL', label: 'KOL'}, {value: 'NonKOL', label: 'NonKOL'}]} value={tier} onChange={setTier} /></div> 
                <div className="lg:col-span-1"><label className="block text-sm font-medium text-slate-700 mb-1">Affiliates</label><AffiliateMultiSelect options={allAffiliates} selectedAccountIds={selectedAffiliates} onChange={setSelectedAffiliates} /></div> 
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
                            <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:border-[var(--accent-color)] peer-checked:bg-[var(--accent-color)] transition-all"></div>
                            <svg className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity left-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Compare with specific period</span>
                    </label>

                    {compareEnabled && (
                        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            {[
                                { id: 'previous_period', label: 'Previous Period' },
                                { id: 'previous_month', label: 'Previous Month' },
                                { id: 'previous_year', label: 'Previous Year' }
                            ].map((type) => (
                                <button
                                    key={type.id}
                                    onClick={() => setCompareType(type.id as CompareType)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                                        compareType === type.id 
                                        ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)] shadow-sm' 
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button onClick={onGetMetrics} disabled={loading} className="px-8 py-2.5 text-white font-semibold shadow-sm primary-btn bg-[var(--accent-color)] focus:outline-none focus:ring-1 focus:ring-offset-2 focus:ring-[var(--accent-color)] disabled:bg-slate-400 disabled:cursor-not-allowed">{loading ? 'Loading...' : 'Get Metrics'}</button> 
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
    const [dailyData, setDailyData] = useState<DailyData[] | null>(null);
    const [topAffiliates, setTopAffiliates] = useState<TopAffiliateData[]>([]);
    const [breakdownExpanded, setBreakdownExpanded] = useState(false);
    const [showDailyTable, setShowDailyTable] = useState(false);
    const [vsDateRangeText, setVsDateRangeText] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof TopAffiliateData | null; direction: 'descending' | 'ascending' }>({ key: 'clicks', direction: 'descending' });
    const [showAllTopAffiliates, setShowAllTopAffiliates] = useState(false);


     useEffect(() => { const fetchInitialData = async () => { try { const { affiliates } = await fetchAffiliates(); setAllAffiliates(affiliates.sort((a,b) => a.name.localeCompare(b.name))); } catch { setError('Failed to fetch affiliate list.'); } }; fetchInitialData(); }, []);
    
    const handleGetMetrics = useCallback(async () => {
        if (allAffiliates.length === 0) return; setLoading(true); setError(null); setDailyData(null); setShowDailyTable(false);
        try {
            const affiliateMap = new Map<string, { name: string; tierName: string; normalizedTier: string; accountId: string; registeredAt?: string }>();
            allAffiliates.forEach(aff => { const rawTier = aff.tierName || 'NonKOL'; let normalizedTier = 'NonKOL'; if (rawTier === 'KOL (Old Offer)' || rawTier === 'KOL (New Offer)' || rawTier === 'Standard') normalizedTier = 'KOL'; affiliateMap.set(aff.publicId, { name: aff.name, tierName: rawTier, normalizedTier, accountId: aff.accountId, registeredAt: aff.registeredAt }); });
            let filteredPublicIds: string[] | undefined = undefined;
            if (selectedAffiliates.length > 0) filteredPublicIds = allAffiliates.filter(a => selectedAffiliates.includes(a.accountId)).map(a => a.publicId);
            else if (tier !== 'All') filteredPublicIds = Array.from(affiliateMap.entries()).filter(([, details]) => details.normalizedTier === tier).map(([publicId]) => publicId);
            const validAffiliateIds = filteredPublicIds ? new Set(filteredPublicIds) : null;
            
            let prevDateRange: DateRange;
            if (compareEnabled) {
                switch (compareType) {
                    case 'previous_month': {
                        const parts = getBangkokDateParts(dateRange.from);
                        const from = createBangkokDate(parts.year, parts.month - 1, 1);
                        const to = createBangkokDate(parts.year, parts.month, 0);
                        prevDateRange = { from, to };
                        break;
                    }
                    case 'previous_year': {
                        const fromParts = getBangkokDateParts(dateRange.from);
                        const toParts = getBangkokDateParts(dateRange.to);
                        const from = createBangkokDate(fromParts.year - 1, fromParts.month, fromParts.day);
                        const to = createBangkokDate(toParts.year - 1, toParts.month, toParts.day);
                        prevDateRange = { from, to };
                        break;
                    }
                    default: { // previous_period
                        const duration = dateRange.to.getTime() - dateRange.from.getTime();
                        const to = new Date(dateRange.from.getTime() - 864e5);
                        const from = new Date(to.getTime() - duration);
                        prevDateRange = { from, to };
                    }
                }
            } else {
                const duration = dateRange.to.getTime() - dateRange.from.getTime();
                const to = new Date(dateRange.from.getTime() - 864e5);
                const from = new Date(to.getTime() - duration);
                prevDateRange = { from, to };
            }
            
            setVsDateRangeText(`vs ${formatDisplayDateGmt7(prevDateRange.from)} to ${formatDisplayDateGmt7(prevDateRange.to)}`);

            const currentRangeISO = { from: dateRange.from.toISOString(), to: toGmt7EndOfDay(dateRange.to).toISOString() };
            const prevRangeISO = { from: prevDateRange.from.toISOString(), to: toGmt7EndOfDay(prevDateRange.to).toISOString() };

            const signupFilters: Record<string, unknown> = { registeredFrom: currentRangeISO.from, registeredTo: currentRangeISO.to }; if (filteredPublicIds) signupFilters.publicId = filteredPublicIds;
            const signupPrevFilters: Record<string, unknown> = { registeredFrom: prevRangeISO.from, registeredTo: prevRangeISO.to }; if (filteredPublicIds) signupPrevFilters.publicId = filteredPublicIds;
            const reportFilters: Record<string, unknown> = {}; if (filteredPublicIds) reportFilters.sourceId = filteredPublicIds;

            const [currentSignups, prevSignups, currentClicks, prevClicks, currentConversions, prevConversions] = await Promise.all([ fetchAffiliates(signupFilters), fetchAffiliates(signupPrevFilters), fetchClickReport(currentRangeISO, reportFilters), fetchClickReport(prevRangeISO, reportFilters), fetchConversionReport(currentRangeISO, reportFilters), fetchConversionReport(prevRangeISO, reportFilters), ]);
            
            const processPeriodData = (signups: Affiliate[], clicks: ClickReportRow[], conversions: ConversionReportRow[]): { byAffiliate: Map<string, ProcessedMetrics>, daily: Map<string, ProcessedMetrics> } => {
                const byAffiliate = new Map<string, ProcessedMetrics>(); const daily = new Map<string, ProcessedMetrics>();
                const initialMetrics = (): ProcessedMetrics => ({ signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 });
                const ensureAffiliate = (id: string) => { if (!byAffiliate.has(id)) byAffiliate.set(id, initialMetrics()); return byAffiliate.get(id)!; };
                const ensureDaily = (date: string) => { if (!daily.has(date)) daily.set(date, initialMetrics()); return daily.get(date)!; };
                signups.forEach(signup => { if (validAffiliateIds && !validAffiliateIds.has(signup.publicId)) return; const date = getGmt7DateString(signup.registeredAt!); ensureAffiliate(signup.publicId).signups++; ensureDaily(date).signups++; });
                clicks.forEach(click => { const publicId = click.source?.publicId; if (!publicId || (validAffiliateIds && !validAffiliateIds.has(publicId))) return; const date = getGmt7DateString(click.createdAt); ensureAffiliate(publicId).clicks++; ensureDaily(date).clicks++; });
                conversions.forEach(conv => { const publicId = conv.source?.publicId; if (!publicId || (validAffiliateIds && !validAffiliateIds.has(publicId))) return; const date = getGmt7DateString(conv.createdAt); const affiliateData = ensureAffiliate(publicId); const dailyData = ensureDaily(date); if (conv.conversionType.name.toLowerCase() === 'install') { affiliateData.installs++; dailyData.installs++; } affiliateData.revenue += parseFloat(conv.revenue.value || '0'); dailyData.revenue += parseFloat(conv.revenue.value || '0'); affiliateData.payouts += parseFloat(conv.cost.value || '0'); dailyData.payouts += parseFloat(conv.cost.value || '0'); });
                return { byAffiliate, daily };
            };
            const currentProcessed = processPeriodData(currentSignups.affiliates, currentClicks.rows, currentConversions.rows);
            const prevProcessed = processPeriodData(prevSignups.affiliates, prevClicks.rows, prevConversions.rows);
            const fullDailyData: DailyData[] = []; let currentDate = new Date(dateRange.from.getTime()); const endDate = new Date(dateRange.to.getTime());
            while (currentDate <= endDate) { const dateStr = currentDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); fullDailyData.push({ date: dateStr, ...(currentProcessed.daily.get(dateStr) || { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 }) }); currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000); }
            setDailyData(fullDailyData);
            const finalMetrics: SummaryData = { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0, signupsPrev: 0, clicksPrev: 0, installsPrev: 0, revenuePrev: 0, payoutsPrev: 0, vsDateRange: prevDateRange, byTier: { KOL: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0, prev: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 } }, NonKOL: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0, prev: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 } } } };
            currentProcessed.byAffiliate.forEach((data, publicId) => { finalMetrics.signups += data.signups; finalMetrics.clicks += data.clicks; finalMetrics.installs += data.installs; finalMetrics.revenue += data.revenue; finalMetrics.payouts += data.payouts; const tierName = affiliateMap.get(publicId)?.normalizedTier as 'KOL' | 'NonKOL' | undefined; if (tierName && finalMetrics.byTier[tierName]) { (Object.keys(data) as (keyof ProcessedMetrics)[]).forEach(key => finalMetrics.byTier[tierName][key] += data[key]); } });
            prevProcessed.byAffiliate.forEach((data, publicId) => { finalMetrics.signupsPrev += data.signups; finalMetrics.clicksPrev += data.clicks; finalMetrics.installsPrev += data.installs; finalMetrics.revenuePrev += data.revenue; finalMetrics.payoutsPrev += data.payouts; const tierName = affiliateMap.get(publicId)?.normalizedTier as 'KOL' | 'NonKOL' | undefined; if (tierName && finalMetrics.byTier[tierName]) { (Object.keys(data) as (keyof ProcessedMetrics)[]).forEach(key => finalMetrics.byTier[tierName].prev[key] += data[key]); } });
            setSummaryData(finalMetrics);
            const topAffiliateData = Array.from(currentProcessed.byAffiliate.entries()).map(([publicId, current]) => { const affDetails = affiliateMap.get(publicId); const prev = prevProcessed.byAffiliate.get(publicId) || { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 }; return { affiliateId: publicId, affiliateName: affDetails?.name || 'Unknown', tierName: affDetails?.tierName || 'N/A', clicks: current.clicks, clicksPrev: prev.clicks, installs: current.installs, installsPrev: prev.installs, revenue: current.revenue, revenuePrev: prev.revenue, payout: current.payouts, registeredAt: affDetails?.registeredAt, }; }).filter(d => d.clicks >= 1 || d.installs >=1 || d.revenue > 0);
            setTopAffiliates(topAffiliateData);
        } catch (err: unknown) { 
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError('An unexpected error occurred.');
            }
        } finally { setLoading(false); }
    }, [dateRange, tier, selectedAffiliates, allAffiliates, compareEnabled, compareType]);
    
    const requestSort = (key: keyof TopAffiliateData) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const sortedTopAffiliates = useMemo(() => {
        const sortableItems = [...topAffiliates];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key!];
                const bVal = b[sortConfig.key!];
                if (aVal === undefined || bVal === undefined) return 0;
                if (aVal < bVal) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [topAffiliates, sortConfig]);

    return ( <div className="space-y-8"> <Filters dateRange={dateRange} setDateRange={setDateRange} tier={tier} setTier={setTier} allAffiliates={allAffiliates} selectedAffiliates={selectedAffiliates} setSelectedAffiliates={setSelectedAffiliates} onGetMetrics={handleGetMetrics} loading={loading} compareEnabled={compareEnabled} setCompareEnabled={setCompareEnabled} compareType={compareType} setCompareType={setCompareType} /> {loading && <Loader />} {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3" role="alert">{error}</div>} {!loading && !error && summaryData && ( <div className="card p-6 space-y-6"> <SummaryOverview data={summaryData} isExpanded={breakdownExpanded} setIsExpanded={setBreakdownExpanded} vsDateRangeText={vsDateRangeText} /> <hr className="border-slate-100" /> <PerformanceChart dailyData={dailyData || []} /> <hr className="border-slate-100" /> <TopAffiliatesTable data={sortedTopAffiliates} requestSort={requestSort} sortConfig={sortConfig} showAll={showAllTopAffiliates} onToggleShowAll={() => setShowAllTopAffiliates(!showAllTopAffiliates)} /> <hr className="border-slate-100" /> <DailyPerformanceTable data={dailyData} isVisible={showDailyTable} onShowReport={() => setShowDailyTable(true)} /> </div> )} {!loading && !error && !summaryData && (<div className="text-center py-16 card"><h3 className="text-xl font-semibold text-slate-700">Welcome!</h3><p className="text-slate-500 mt-2">Select filters and click "Get Metrics" to view performance.</p></div>)} </div> );
};

const SummaryOverview: React.FC<{ data: SummaryData; isExpanded: boolean; setIsExpanded: (expanded: boolean) => void; vsDateRangeText: string; }> = ({ data, isExpanded, setIsExpanded, vsDateRangeText }) => {
    const metrics = [ { key: 'signups', label: 'Signups', value: data.signups, prev: data.signupsPrev, color: PALETTE.signups }, { key: 'clicks', label: 'Clicks', value: data.clicks, prev: data.clicksPrev, color: PALETTE.clicks }, { key: 'installs', label: 'Installs', value: data.installs, prev: data.installsPrev, color: PALETTE.installs }, { key: 'revenue', label: 'Revenue', value: data.revenue, prev: data.revenuePrev, color: PALETTE.revenue, isCurrency: true }, { key: 'payouts', label: 'Payouts', value: data.payouts, prev: data.payoutsPrev, color: PALETTE.payouts, isCurrency: true }, ];
    return ( <div> <h3 className="text-lg font-semibold text-slate-800 mb-4">Overview</h3> <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6"> {metrics.map(metric => ( <div key={metric.key} className="p-4 text-center flex flex-col"> <div className="flex-grow"> <p className="text-sm text-slate-500 font-semibold">{metric.label}</p> <p className="text-3xl font-bold my-2" style={{ color: metric.color }}>{metric.isCurrency ? formatCurrency(metric.value) : formatNumber(metric.value)}</p> <div className="h-5"><ChangeIndicator value={calculatePercentageChange(metric.value, metric.prev)} /></div> <p className="text-xs text-slate-400 mt-1 h-8 flex items-center justify-center">{vsDateRangeText}</p> </div> <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-96' : 'max-h-0'}`}> <div className="mt-4 pt-4 border-t border-slate-100 text-left space-y-2"> {Object.keys(data.byTier).map(tier => { const tierData = data.byTier[tier as keyof typeof data.byTier]; if (!tierData) return null; const tierValue = tierData[metric.key as keyof ProcessedMetrics]; const tierPrev = tierData.prev[metric.key as keyof ProcessedMetrics]; return (<div key={tier} className="flex justify-between items-center text-sm"><span className="text-slate-500">{tier}:</span><div className="flex items-center space-x-2"><span className="font-semibold text-slate-700">{metric.isCurrency ? formatCurrency(tierValue) : formatNumber(tierValue)}</span><ChangeIndicator value={calculatePercentageChange(tierValue, tierPrev)} /></div></div>); })} </div> </div> </div> ))} </div> <div className="text-center mt-4"> <button onClick={() => setIsExpanded(!isExpanded)} className="text-sm text-slate-500 hover:text-slate-800 font-medium py-1 px-3">{isExpanded ? 'Hide' : 'Show'} Breakdown by Tier</button> </div> </div> );
};

const PerformanceChart: React.FC<{ dailyData: DailyData[] }> = ({ dailyData }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    useEffect(() => { 
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        if (dailyData.length > 0) {
            const sortedDailyData = [...dailyData].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const option = { tooltip: { trigger: 'axis' }, legend: { data: ['Signups', 'Clicks', 'Installs', 'Revenue', 'Payouts'], top: 'bottom' }, grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true }, xAxis: { type: 'category', boundaryGap: false, data: sortedDailyData.map(d => formatDisplayDateGmt7(d.date)) }, yAxis: [{ type: 'value', name: 'Count' }, { type: 'value', name: 'Amount ($)', axisLabel: { formatter: '${value}' } }], series: [ { name: 'Signups', type: 'line', smooth: true, itemStyle: { color: PALETTE.signups }, areaStyle: { opacity: 0.1 }, data: sortedDailyData.map(d => d.signups) }, { name: 'Clicks', type: 'line', smooth: true, itemStyle: { color: PALETTE.clicks }, areaStyle: { opacity: 0.1 }, data: sortedDailyData.map(d => d.clicks) }, { name: 'Installs', type: 'line', smooth: true, itemStyle: { color: PALETTE.installs }, areaStyle: { opacity: 0.1 }, data: sortedDailyData.map(d => d.installs) }, { name: 'Revenue', type: 'line', smooth: true, yAxisIndex: 1, itemStyle: { color: PALETTE.revenue }, areaStyle: { opacity: 0.1 }, data: sortedDailyData.map(d => d.revenue) }, { name: 'Payouts', type: 'line', smooth: true, yAxisIndex: 1, itemStyle: { color: PALETTE.payouts }, areaStyle: { opacity: 0.1 }, data: sortedDailyData.map(d => d.payouts) }] }; 
            chart.setOption(option);
        } else {
            chart.clear();
        }
        const resizeHandler = () => chart?.resize(); window.addEventListener('resize', resizeHandler); return () => { chart.dispose(); window.removeEventListener('resize', resizeHandler); }; 
    }, [dailyData]);
    return (<div><h3 className="text-lg font-semibold text-slate-800 mb-4">Performance Trend</h3><div ref={chartRef} style={{ width: '100%', height: '400px' }}></div></div>);
};

const getTierColor = (tierName: string) => {
    const name = tierName.toLowerCase();
    if (name.startsWith('kol')) return 'bg-green-100 text-green-800';
    if (name.includes('standard')) return 'bg-purple-100 text-purple-800';
    if (name.includes('nonkol')) return 'bg-blue-100 text-blue-800';
    return 'bg-slate-100 text-slate-800';
};

const SortableHeader: React.FC<{
    label: string;
    sortKey: keyof TopAffiliateData;
    requestSort: (key: keyof TopAffiliateData) => void;
    sortConfig: { key: keyof TopAffiliateData | null; direction: string; };
    className?: string;
}> = ({ label, sortKey, requestSort, sortConfig, className }) => {
    const isSorted = sortConfig.key === sortKey;
    const icon = isSorted ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '↕';
    return (
        <th scope="col" className={`px-6 py-3 cursor-pointer ${className}`} onClick={() => requestSort(sortKey)}>
            <div className={`flex items-center ${className?.includes('text-right') ? 'justify-end' : ''}`}>
                {label} <span className="ml-2 text-slate-400">{icon}</span>
            </div>
        </th>
    );
};

const TopAffiliatesTable: React.FC<{ data: TopAffiliateData[]; requestSort: (key: keyof TopAffiliateData) => void; sortConfig: { key: keyof TopAffiliateData | null; direction: 'descending' | 'ascending' }; showAll: boolean; onToggleShowAll: () => void; }> = ({ data, requestSort, sortConfig, showAll, onToggleShowAll }) => {
    if (data.length === 0) return null;
    const displayedData = showAll ? data : data.slice(0, 10);

    return ( <div> <h3 className="text-lg font-semibold text-slate-800 mb-4">Affiliate Performances (Active)</h3> <div className="overflow-x-auto"><table className="w-full text-sm text-left text-slate-500"><thead className="text-xs text-[#2236ba] font-bold uppercase"><tr><th scope="col" className="px-6 py-3">Affiliate</th><th scope="col" className="px-6 py-3">Tier</th><SortableHeader label="Clicks" sortKey="clicks" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /><th scope="col" className="px-6 py-3 text-center">% Change</th><SortableHeader label="Installs" sortKey="installs" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /><th scope="col" className="px-6 py-3 text-center">% Change</th><SortableHeader label="Revenue" sortKey="revenue" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /><th scope="col" className="px-6 py-3 text-center">% Change</th><SortableHeader label="Payout" sortKey="payout" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /></tr></thead><tbody>{displayedData.map((row) => ( <tr key={row.affiliateId} className="bg-white border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"><td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{row.affiliateName} ({row.affiliateId})</td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTierColor(row.tierName)}`}>{row.tierName}</span></td><td className="px-6 py-4 text-right">{formatNumber(row.clicks)}</td><td className="px-6 py-4 text-center"><ChangeIndicator value={calculatePercentageChange(row.clicks, row.clicksPrev)} /></td><td className="px-6 py-4 text-right">{formatNumber(row.installs)}</td><td className="px-6 py-4 text-center"><ChangeIndicator value={calculatePercentageChange(row.installs, row.installsPrev)} /></td><td className={`px-6 py-4 text-right ${row.revenue > 0 ? 'text-[#2236ba]' : ''}`}>{formatCurrency(row.revenue)}</td><td className="px-6 py-4 text-center"><ChangeIndicator value={calculatePercentageChange(row.revenue, row.revenuePrev)} /></td><td className="px-6 py-4 text-right">{formatCurrency(row.payout)}</td></tr> ))}</tbody></table></div> {data.length > 10 && (<div className="text-center mt-4"><button onClick={onToggleShowAll} className="text-sm text-slate-500 hover:text-slate-800 font-medium py-1 px-3">{showAll ? 'Show Less' : 'Show More'}</button></div>)} </div> );
};

const DailyPerformanceTable: React.FC<{ data: DailyData[] | null; isVisible: boolean; onShowReport: () => void; }> = ({ data, isVisible, onShowReport }) => {
    return (<div><h3 className="text-lg font-semibold text-slate-800 mb-4">Daily Performance</h3> {isVisible && data ? ( <div className="overflow-x-auto"><table className="w-full text-sm text-left text-slate-500"><thead className="text-xs text-[#2236ba] font-bold uppercase"><tr><th scope="col" className="px-6 py-3">Date</th><th scope="col" className="px-6 py-3 text-right">Signups</th><th scope="col" className="px-6 py-3 text-right">Clicks</th><th scope="col" className="px-6 py-3 text-right">Installs</th><th scope="col" className="px-6 py-3 text-right">Revenue</th><th scope="col" className="px-6 py-3 text-right">Payout</th></tr></thead><tbody>{data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((row) => (<tr key={row.date} className="bg-white border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"><td className="px-6 py-4 font-medium text-slate-900">{formatDisplayDateGmt7(row.date)}</td><td className="px-6 py-4 text-right">{formatNumber(row.signups)}</td><td className="px-6 py-4 text-right">{formatNumber(row.clicks)}</td><td className="px-6 py-4 text-right">{formatNumber(row.installs)}</td><td className={`px-6 py-4 text-right ${row.revenue > 0 ? 'text-[#2236ba]' : ''}`}>{formatCurrency(row.revenue)}</td><td className="px-6 py-4 text-right">{formatCurrency(row.payouts)}</td></tr>))}</tbody></table></div> ) : ( <div className="text-center"><button onClick={onShowReport} className="px-4 py-2 text-sm text-[var(--accent-color)] font-semibold border border-current rounded-md hover:bg-emerald-50">Show Report</button></div> )} </div> );
};

export default PerformanceOverview;
