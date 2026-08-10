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
        clear: () => void;
    };
};

const Loader: React.FC = () => ( <div className="flex justify-center items-center p-8"><div className="w-16 h-16 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div></div> );
const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
const formatCurrency = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const ChangeIndicator: React.FC<{ value: number }> = ({ value }) => {
    if (value === Infinity) return <span className="text-blue-500 font-medium">(new)</span>;
    if (value === 0 || isNaN(value) || !isFinite(value)) return null;
    const isPositive = value > 0; const color = isPositive ? 'text-green-500' : 'text-red-500'; const Icon = isPositive ? ArrowUpIcon : ArrowDownIcon;
    return ( <span className={`flex items-center justify-center text-sm font-medium ${color}`}><Icon className="w-3 h-3 mr-1" /><span>{value.toFixed(1)}%</span></span> );
};

const CustomSelect: React.FC<{ options: {value: string, label: string}[], value: string, onChange: (value: string) => void }> = ({ options, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false); const dropdownRef = useRef<HTMLDivElement>(null); const selectedLabel = options.find(o => o.value === value)?.label;
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-white text-left p-2.5 border border-[#bfdbfe]/50 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px] rounded-full px-5"> <span className="text-slate-800">{selectedLabel}</span> <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && ( <ul className="absolute z-10 mt-1 w-full bg-white max-h-60 overflow-auto border border-[#bfdbfe]/50 rounded-2xl overflow-hidden">{options.map(option => <li key={option.value} onClick={() => { onChange(option.value); setIsOpen(false); }} className={`px-4 py-2 text-sm text-slate-700 hover:bg-emerald-50 cursor-pointer ${value === option.value ? 'bg-emerald-50' : ''}`}>{option.label}</li>)}</ul>)} </div> );
};

const AffiliateMultiSelect: React.FC<{ options: Affiliate[], selectedAccountIds: string[], onChange: (selected: string[]) => void }> = ({ options, selectedAccountIds, onChange }) => {
    const [isOpen, setIsOpen] = useState(false); const [searchTerm, setSearchTerm] = useState(''); const dropdownRef = useRef<HTMLDivElement>(null); const filteredOptions = useMemo(() => options.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]); const toggleOption = (accountId: string) => onChange(selectedAccountIds.includes(accountId) ? selectedAccountIds.filter(id => id !== accountId) : [...selectedAccountIds, accountId]);
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-white text-left p-2.5 border border-[#bfdbfe]/50 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px] rounded-full px-5"> <span className={selectedAccountIds.length > 0 ? 'text-slate-800' : 'text-slate-400'}>{selectedAccountIds.length === 0 ? 'All Affiliates' : selectedAccountIds.length === 1 ? options.find(o => o.accountId === selectedAccountIds[0])?.name : `${selectedAccountIds.length} affiliates selected`}</span> <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && ( <div className="absolute z-10 mt-1 w-full bg-white rounded-2xl border border-[#bfdbfe]/50 overflow-hidden"><div className="p-2 border-b border-[#bfdbfe]/30"><input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border border-[#bfdbfe]/50 focus:ring-1 focus:ring-[var(--accent-color)] rounded-full px-4"/></div><ul className="max-h-60 overflow-auto">{filteredOptions.map(option => ( <li key={option.accountId} onClick={() => toggleOption(option.accountId)} className="px-4 py-2 text-sm text-slate-700 hover:bg-emerald-50 cursor-pointer flex items-center"><input type="checkbox" readOnly checked={selectedAccountIds.includes(option.accountId)} className="h-4 w-4 text-[var(--accent-color)] border-[#bfdbfe]/80 mr-3 focus:ring-[var(--accent-color)] rounded" />{option.name}</li>))}</ul></div>)} </div> );
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6"> 
                <div className="col-span-1 md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Time Range</label><DateRangePicker value={dateRange} onChange={setDateRange} onPresetSelect={handlePresetSelect} /></div> 
                <div className="col-span-1"><label htmlFor="tier" className="block text-sm font-medium text-slate-700 mb-1">Affiliate Tier</label><CustomSelect options={[{value: 'All', label: 'All'}, {value: 'KOL', label: 'KOL'}, {value: 'NonKOL', label: 'NonKOL'}]} value={tier} onChange={setTier} /></div> 
                <div className="col-span-1"><label className="block text-sm font-medium text-slate-700 mb-1">Affiliates</label><AffiliateMultiSelect options={allAffiliates} selectedAccountIds={selectedAffiliates} onChange={setSelectedAffiliates} /></div> 
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
                            <div className="w-5 h-5 border-2 border-[#bfdbfe]/80 rounded peer-checked:border-[var(--accent-color)] peer-checked:bg-[var(--accent-color)] transition-all"></div>
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
                                        ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)] shadow-none' 
                                        : 'bg-white text-slate-600 border-[#bfdbfe]/50 hover:bg-emerald-50/50'
                                    }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button onClick={onGetMetrics} disabled={loading} className="px-8 py-2.5 text-white font-semibold rounded-full primary-btn bg-[var(--accent-color)] focus:outline-none disabled:bg-slate-400 disabled:cursor-not-allowed h-[42px] border-none shadow-none">{loading ? 'Loading...' : 'Get Metrics'}</button> 
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
    const [sortConfig, setSortConfig] = useState<{ key: keyof TopAffiliateData | null; direction: 'descending' | 'ascending' }>({ key: 'clicks', direction: 'descending' });
    const [showAllTopAffiliates, setShowAllTopAffiliates] = useState(false);
    const [merchantMetrics, setMerchantMetrics] = useState<any | null>(null);


     useEffect(() => { const fetchInitialData = async () => { try { const { affiliates } = await fetchAffiliates(); setAllAffiliates(affiliates.sort((a,b) => a.name.localeCompare(b.name))); } catch { setError('Failed to fetch affiliate list.'); } }; fetchInitialData(); }, []);
    
    const handleGetMetrics = useCallback(async () => {
        setLoading(true); setError(null); setMerchantMetrics(null);
        try {
            let currentAffiliates = allAffiliates;
            if (currentAffiliates.length === 0) {
                try {
                    const { affiliates } = await fetchAffiliates();
                    currentAffiliates = affiliates.sort((a, b) => a.name.localeCompare(b.name));
                    setAllAffiliates(currentAffiliates);
                } catch (e) {
                    console.error('Failed to fetch affiliates on demand', e);
                    setError('Failed to fetch affiliate list.');
                    setLoading(false);
                    return;
                }
            }
            if (currentAffiliates.length === 0) {
                setLoading(false);
                return;
            }

            const affiliateMap = new Map<string, { name: string; tierName: string; normalizedTier: string; accountId: string; registeredAt?: string }>();
            currentAffiliates.forEach(aff => { const rawTier = aff.tierName || 'NonKOL'; let normalizedTier = 'NonKOL'; if (rawTier === 'KOL (Old Offer)' || rawTier === 'KOL (New Offer)' || rawTier === 'Standard') normalizedTier = 'KOL'; affiliateMap.set(aff.publicId, { name: aff.name, tierName: rawTier, normalizedTier, accountId: aff.accountId, registeredAt: aff.registeredAt }); });
            let filteredPublicIds: string[] | undefined = undefined;
            if (selectedAffiliates.length > 0) filteredPublicIds = currentAffiliates.filter(a => selectedAffiliates.includes(a.accountId)).map(a => a.publicId);
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

            const reportFilters: Record<string, unknown> = {}; if (filteredPublicIds) reportFilters.sourceId = filteredPublicIds;

            const [currentClicks, prevClicks, currentConversions, prevConversions] = await Promise.all([
                fetchClickReport(currentRangeISO, reportFilters),
                fetchClickReport(prevRangeISO, reportFilters),
                fetchConversionReport(currentRangeISO, reportFilters),
                fetchConversionReport(prevRangeISO, reportFilters),
            ]);
            
            // Manual filtering to ensure the affiliate filter works even if the API filter fails
            const validPublicIds = filteredPublicIds ? new Set(filteredPublicIds) : null;
            let currentConversionsRows = currentConversions.rows;
            let prevConversionsRows = prevConversions.rows;
            if (validPublicIds) {
                currentConversionsRows = currentConversionsRows.filter(c => c.source?.publicId && validPublicIds.has(c.source.publicId));
                prevConversionsRows = prevConversionsRows.filter(c => c.source?.publicId && validPublicIds.has(c.source.publicId));
            }

            const currentSignupsList = currentAffiliates.filter(aff => {
                if (validPublicIds && !validPublicIds.has(aff.publicId)) return false;
                if (!aff.registeredAt) return false;
                const time = new Date(aff.registeredAt).getTime();
                return time >= new Date(currentRangeISO.from).getTime() && time <= new Date(currentRangeISO.to).getTime();
            });

            const prevSignupsList = currentAffiliates.filter(aff => {
                if (validPublicIds && !validPublicIds.has(aff.publicId)) return false;
                if (!aff.registeredAt) return false;
                const time = new Date(aff.registeredAt).getTime();
                return time >= new Date(prevRangeISO.from).getTime() && time <= new Date(prevRangeISO.to).getTime();
            });

            const processPeriodData = (signups: Affiliate[], clicks: ClickReportRow[], conversions: ConversionReportRow[]): { byAffiliate: Map<string, ProcessedMetrics>, daily: Map<string, ProcessedMetrics> } => {
                const byAffiliate = new Map<string, ProcessedMetrics>(); 
                const daily = new Map<string, ProcessedMetrics>();
                const initialMetrics = (): ProcessedMetrics => ({ signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 });
                const ensureAffiliate = (id: string) => { if (!byAffiliate.has(id)) byAffiliate.set(id, initialMetrics()); return byAffiliate.get(id)!; };
                const ensureDaily = (date: string) => { if (!daily.has(date)) daily.set(date, initialMetrics()); return daily.get(date)!; };
                signups.forEach(signup => { 
                    if (validAffiliateIds && !validAffiliateIds.has(signup.publicId)) return; 
                    ensureAffiliate(signup.publicId).signups++; 
                    if (signup.registeredAt) ensureDaily(getGmt7DateString(signup.registeredAt)).signups++;
                });
                clicks.forEach(click => { 
                    const publicId = click.source?.publicId; 
                    if (!publicId || (validAffiliateIds && !validAffiliateIds.has(publicId))) return; 
                    ensureAffiliate(publicId).clicks++; 
                    if (click.createdAt) ensureDaily(getGmt7DateString(click.createdAt)).clicks++;
                });
                conversions.forEach(conv => { 
                    const publicId = conv.source?.publicId; 
                    if (!publicId || (validAffiliateIds && !validAffiliateIds.has(publicId))) return; 
                    const affiliateData = ensureAffiliate(publicId); 
                    const isInstall = conv.conversionType.name.toLowerCase() === 'install';
                    const revVal = parseFloat(conv.revenue.value || '0');
                    const costVal = parseFloat(conv.cost.value || '0');
                    if (isInstall) affiliateData.installs++; 
                    affiliateData.revenue += revVal; 
                    affiliateData.payouts += costVal;
                    if (conv.createdAt) {
                        const dObj = ensureDaily(getGmt7DateString(conv.createdAt));
                        if (isInstall) dObj.installs++;
                        dObj.revenue += revVal;
                        dObj.payouts += costVal;
                    }
                });
                return { byAffiliate, daily };
            };
            const currentProcessed = processPeriodData(currentSignupsList, currentClicks.rows, currentConversionsRows);
            const prevProcessed = processPeriodData(prevSignupsList, prevClicks.rows, prevConversionsRows);
            
            const dailyList: DailyData[] = Array.from(currentProcessed.daily.entries())
                .map(([date, metrics]) => ({ date, ...metrics }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setDailyData(dailyList);
            
            const finalMetrics: SummaryData = { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0, signupsPrev: 0, clicksPrev: 0, installsPrev: 0, revenuePrev: 0, payoutsPrev: 0, vsDateRange: prevDateRange, byTier: { KOL: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0, prev: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 } }, NonKOL: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0, prev: { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 } } } };
            currentProcessed.byAffiliate.forEach((data, publicId) => { finalMetrics.signups += data.signups; finalMetrics.clicks += data.clicks; finalMetrics.installs += data.installs; finalMetrics.revenue += data.revenue; finalMetrics.payouts += data.payouts; const tierName = affiliateMap.get(publicId)?.normalizedTier as 'KOL' | 'NonKOL' | undefined; if (tierName && finalMetrics.byTier[tierName]) { (Object.keys(data) as (keyof ProcessedMetrics)[]).forEach(key => finalMetrics.byTier[tierName][key] += data[key]); } });
            prevProcessed.byAffiliate.forEach((data, publicId) => { finalMetrics.signupsPrev += data.signups; finalMetrics.clicksPrev += data.clicks; finalMetrics.installsPrev += data.installs; finalMetrics.revenuePrev += data.revenue; finalMetrics.payoutsPrev += data.payouts; const tierName = affiliateMap.get(publicId)?.normalizedTier as 'KOL' | 'NonKOL' | undefined; if (tierName && finalMetrics.byTier[tierName]) { (Object.keys(data) as (keyof ProcessedMetrics)[]).forEach(key => finalMetrics.byTier[tierName].prev[key] += data[key]); } });
            setSummaryData(finalMetrics);
            const topAffiliateData = Array.from(currentProcessed.byAffiliate.entries()).map(([publicId, current]) => { const affDetails = affiliateMap.get(publicId); const prev = prevProcessed.byAffiliate.get(publicId) || { signups: 0, clicks: 0, installs: 0, revenue: 0, payouts: 0 }; return { affiliateId: publicId, affiliateName: affDetails?.name || 'Unknown', tierName: affDetails?.tierName || 'N/A', clicks: current.clicks, clicksPrev: prev.clicks, installs: current.installs, installsPrev: prev.installs, revenue: current.revenue, revenuePrev: prev.revenue, payout: current.payouts, registeredAt: affDetails?.registeredAt, }; }).filter(d => d.clicks >= 1 || d.installs >=1 || d.revenue > 0);
            setTopAffiliates(topAffiliateData);

            // --- Merchant Details Logic (Moved from ConversionDetails) ---
            const customerIdsInPeriod = [...new Set(currentConversionsRows.map(c => c.customerId).filter(Boolean))];
            const prevCustomerIds = [...new Set(prevConversionsRows.map(c => c.customerId).filter(Boolean))];
            const allCustomerIds = [...new Set([...customerIdsInPeriod, ...prevCustomerIds])];

            let merchantOverview = {
                totalReferredMerchants: 0,
                totalPayingMerchants: 0,
                payoutOneCount: 0,
                payoutLeThreeCount: 0,
                payoutGtThreeCount: 0,
                avgLifetime: 0,
                totalReferredMerchantsPrev: 0,
                totalPayingMerchantsPrev: 0,
                payoutOneCountPrev: 0,
                payoutLeThreeCountPrev: 0,
                payoutGtThreeCountPrev: 0
            };

            if (allCustomerIds.length > 0) {
                const lifetimeTimeRange = { from: '2020-01-01T00:00:00.000Z', to: new Date().toISOString() };
                const lifetimeConversionsRes = await fetchConversionReport(lifetimeTimeRange, { customerId: allCustomerIds });
                const lifetimeConversions = lifetimeConversionsRes.rows;
                
                const conversionsByCustomer = new Map<string, ConversionReportRow[]>();
                lifetimeConversions.forEach(conv => {
                    if (!conv.customerId) return;
                    if (!conversionsByCustomer.has(conv.customerId)) {
                        conversionsByCustomer.set(conv.customerId, []);
                    }
                    conversionsByCustomer.get(conv.customerId)!.push(conv);
                });

                // Sort all customer conversions once
                for (const conversions of conversionsByCustomer.values()) {
                    conversions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                }

                const currentFrom = dateRange.from.getTime();
                const currentTo = toGmt7EndOfDay(dateRange.to).getTime();
                const prevFrom = prevDateRange.from.getTime();
                const prevTo = toGmt7EndOfDay(prevDateRange.to).getTime();

                const calculateMerchantMetricsForPeriod = (
                    fromTime: number,
                    toTime: number
                ) => {
                    let payingCount = 0;
                    let payoutOne = 0;
                    let payoutLeThree = 0;
                    let payoutGtThree = 0;
                    let totalLifetimeDays = 0;
                    let lifetimeDaysCount = 0;

                    const referredCustomerIds = new Set<string>();

                    for (const [customerId, conversions] of conversionsByCustomer.entries()) {
                        if (conversions.length === 0) continue;
                        
                        let installedDate: string | null = null;
                        let hasInstallInPeriod = false;
                        const payoutConversions: ConversionReportRow[] = [];

                        conversions.forEach(conv => {
                            const convTime = new Date(conv.createdAt).getTime();
                            if (convTime <= toTime) {
                                if (conv.conversionType.name.toLowerCase() === 'install') {
                                    if (!installedDate) {
                                        installedDate = conv.createdAt;
                                    }
                                    if (convTime >= fromTime) {
                                        hasInstallInPeriod = true;
                                    }
                                }
                                if (conv.conversionType.name.toLowerCase() === 'payout') {
                                    payoutConversions.push(conv);
                                }
                            }
                        });

                        let hasLatestPayoutInPeriod = false;

                        if (payoutConversions.length > 0) {
                            const latestPayout = payoutConversions[payoutConversions.length - 1];
                            const latestPayoutTime = new Date(latestPayout.createdAt).getTime();
                            const payoutCount = payoutConversions.length;

                            if (latestPayoutTime >= fromTime && latestPayoutTime <= toTime) {
                                hasLatestPayoutInPeriod = true;
                                payingCount++;
                                if (payoutCount === 1) payoutOne++;
                                else if (payoutCount <= 3) payoutLeThree++;
                                else if (payoutCount > 3) payoutGtThree++;

                                if (installedDate) {
                                    const lifetimeInMs = latestPayoutTime - new Date(installedDate).getTime();
                                    if (lifetimeInMs >= 0) {
                                        totalLifetimeDays += Math.round(lifetimeInMs / 864e5);
                                        lifetimeDaysCount++;
                                    }
                                }
                            }
                        }

                        // Unique referred merchant: either has install in the period OR has their latest payout in the period
                        if (hasInstallInPeriod || hasLatestPayoutInPeriod) {
                            referredCustomerIds.add(customerId);
                        }
                    }

                    return {
                        totalPayingMerchants: payingCount,
                        payoutOneCount: payoutOne,
                        payoutLeThreeCount: payoutLeThree,
                        payoutGtThreeCount: payoutGtThree,
                        avgLifetime: lifetimeDaysCount > 0 ? (totalLifetimeDays / lifetimeDaysCount) : 0,
                        totalReferredMerchants: referredCustomerIds.size
                    };
                };

                const currentMetrics = calculateMerchantMetricsForPeriod(currentFrom, currentTo);
                const prevMetrics = calculateMerchantMetricsForPeriod(prevFrom, prevTo);

                merchantOverview.totalPayingMerchants = currentMetrics.totalPayingMerchants;
                merchantOverview.payoutOneCount = currentMetrics.payoutOneCount;
                merchantOverview.payoutLeThreeCount = currentMetrics.payoutLeThreeCount;
                merchantOverview.payoutGtThreeCount = currentMetrics.payoutGtThreeCount;
                merchantOverview.avgLifetime = currentMetrics.avgLifetime;
                merchantOverview.totalReferredMerchants = currentMetrics.totalReferredMerchants;

                merchantOverview.totalPayingMerchantsPrev = prevMetrics.totalPayingMerchants;
                merchantOverview.totalReferredMerchantsPrev = prevMetrics.totalReferredMerchants;
                merchantOverview.payoutOneCountPrev = prevMetrics.payoutOneCount;
                merchantOverview.payoutLeThreeCountPrev = prevMetrics.payoutLeThreeCount;
                merchantOverview.payoutGtThreeCountPrev = prevMetrics.payoutGtThreeCount;
            }

            setMerchantMetrics(merchantOverview);

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
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg" role="alert">{error}</div>}
            {!loading && !error && summaryData && (
                <div className="space-y-8">
                    {/* Primary summary grid */}
                    <div className="card p-6">
                        <SummaryOverview data={summaryData} isExpanded={breakdownExpanded} setIsExpanded={setBreakdownExpanded} vsDateRangeText={vsDateRangeText} />
                    </div>

                    {/* Daily Performance Chart - Top Section */}
                    {dailyData.length > 0 && (
                        <div className="card p-6">
                            <PerformanceChart dailyData={dailyData} />
                        </div>
                    )}

                    {/* Section: Merchants Details - Placed immediately under Overview */}
                    {merchantMetrics && (
                        <MerchantsDetailsSection metrics={merchantMetrics} vsDateRangeText={vsDateRangeText} />
                    )}

                    {/* Charts & Tables Section */}
                    <div className="card p-6 space-y-8">
                        {/* Section: Top Performing Affiliate Mixed Chart */}
                        <TopPerformingAffiliatesChart data={topAffiliates} />
                        
                        <hr className="border-[#bfdbfe]/30" />
                        <TopAffiliatesTable data={sortedTopAffiliates} requestSort={requestSort} sortConfig={sortConfig} showAll={showAllTopAffiliates} onToggleShowAll={() => setShowAllTopAffiliates(!showAllTopAffiliates)} />
                    </div>
                </div>
            )}
            {!loading && !error && !summaryData && (
                <div className="text-center py-16 card transition-shadow duration-300">
                    <h3 className="text-xl font-bold text-slate-700">Welcome to Affiliate Performance</h3>
                    <p className="text-slate-500 mt-2">Select your filters and click "Get Metrics" to load your analytics dashboard.</p>
                </div>
            )}
        </div>
    );
};

const SummaryOverview: React.FC<{ data: SummaryData; isExpanded: boolean; setIsExpanded: (expanded: boolean) => void; vsDateRangeText: string; }> = ({ data, isExpanded, setIsExpanded, vsDateRangeText }) => {
    const metrics = [ { key: 'signups', label: 'Signups', value: data.signups, prev: data.signupsPrev, color: PALETTE.signups }, { key: 'clicks', label: 'Clicks', value: data.clicks, prev: data.clicksPrev, color: PALETTE.clicks }, { key: 'installs', label: 'Installs', value: data.installs, prev: data.installsPrev, color: PALETTE.installs }, { key: 'revenue', label: 'Revenue', value: data.revenue, prev: data.revenuePrev, color: PALETTE.revenue, isCurrency: true }, { key: 'payouts', label: 'Payouts', value: data.payouts, prev: data.payoutsPrev, color: PALETTE.payouts, isCurrency: true }, ];
    return ( <div> <h3 className="text-lg font-semibold text-slate-800 mb-4">Overview</h3> <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6"> {metrics.map(metric => ( <div key={metric.key} className="p-4 text-center flex flex-col"> <div className="flex-grow"> <p className="text-sm text-slate-500 font-semibold">{metric.label}</p> <p className="text-3xl font-bold my-2" style={{ color: metric.color }}>{metric.isCurrency ? formatCurrency(metric.value) : formatNumber(metric.value)}</p> <div className="h-5"><ChangeIndicator value={calculatePercentageChange(metric.value, metric.prev)} /></div> <p className="text-xs text-slate-400 mt-1 h-8 flex items-center justify-center">{vsDateRangeText}</p> </div> <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-96' : 'max-h-0'}`}> <div className="mt-4 pt-4 border-t border-[#bfdbfe]/30 text-left space-y-2"> {Object.keys(data.byTier).map(tier => { const tierData = data.byTier[tier as keyof typeof data.byTier]; if (!tierData) return null; const tierValue = tierData[metric.key as keyof ProcessedMetrics]; const tierPrev = tierData.prev[metric.key as keyof ProcessedMetrics]; return (<div key={tier} className="flex justify-between items-center text-sm"><span className="text-slate-500">{tier}:</span><div className="flex items-center space-x-2"><span className="font-semibold text-slate-700">{metric.isCurrency ? formatCurrency(tierValue) : formatNumber(tierValue)}</span><ChangeIndicator value={calculatePercentageChange(tierValue, tierPrev)} /></div></div>); })} </div> </div> </div> ))} </div> <div className="text-center mt-4"> <button onClick={() => setIsExpanded(!isExpanded)} className="text-sm text-slate-500 hover:text-slate-800 font-medium py-1 px-3">{isExpanded ? 'Hide' : 'Show'} Breakdown by Tier</button> </div> </div> );
};

const PerformanceChart: React.FC<{ dailyData: DailyData[] }> = ({ dailyData }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    useEffect(() => { 
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        if (dailyData.length > 0) {
            const sortedDailyData = [...dailyData].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const option = { 
                tooltip: { trigger: 'axis' }, 
                legend: { data: ['Signups', 'Clicks', 'Installs', 'Revenue', 'Payouts'], top: 'bottom' }, 
                grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true }, 
                xAxis: { type: 'category', boundaryGap: true, data: sortedDailyData.map(d => formatDisplayDateGmt7(d.date)) }, 
                yAxis: [{ type: 'value', name: 'Count' }, { type: 'value', name: 'Amount ($)', axisLabel: { formatter: '${value}' } }], 
                series: [ 
                    { 
                        name: 'Signups', 
                        type: 'line', 
                        smooth: true, 
                        itemStyle: { color: PALETTE.signups }, 
                        areaStyle: { 
                            color: {
                                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: hexToRgba(PALETTE.signups, 1.0) },
                                    { offset: 1, color: hexToRgba(PALETTE.signups, 0.3) }
                                ]
                            }
                        }, 
                        data: sortedDailyData.map(d => d.signups) 
                    }, 
                    { 
                        name: 'Installs', 
                        type: 'bar', 
                        stack: 'clicks_installs',
                        itemStyle: { color: PALETTE.installs, borderColor: '#be123c', borderWidth: 1 }, 
                        data: sortedDailyData.map(d => d.installs) 
                    }, 
                    { 
                        name: 'Clicks', 
                        type: 'bar', 
                        stack: 'clicks_installs',
                        itemStyle: { 
                            color: {
                                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: hexToRgba(PALETTE.clicks, 1.0) },
                                    { offset: 1, color: hexToRgba(PALETTE.clicks, 0.6) }
                                ]
                            },
                            borderColor: '#10714f', borderWidth: 1
                        }, 
                        data: sortedDailyData.map(d => d.clicks) 
                    }, 
                    { 
                        name: 'Revenue', 
                        type: 'line', 
                        smooth: true, 
                        yAxisIndex: 1, 
                        itemStyle: { color: PALETTE.revenue }, 
                        areaStyle: { 
                            color: {
                                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: hexToRgba(PALETTE.revenue, 1.0) },
                                    { offset: 1, color: hexToRgba(PALETTE.revenue, 0.3) }
                                ]
                            }
                        }, 
                        data: sortedDailyData.map(d => d.revenue) 
                    }, 
                    { 
                        name: 'Payouts', 
                        type: 'line', 
                        smooth: true, 
                        yAxisIndex: 1, 
                        itemStyle: { color: PALETTE.payouts }, 
                        areaStyle: { 
                            color: {
                                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: hexToRgba(PALETTE.payouts, 1.0) },
                                    { offset: 1, color: hexToRgba(PALETTE.payouts, 0.3) }
                                ]
                            }
                        }, 
                        data: sortedDailyData.map(d => d.payouts) 
                    }
                ] 
            }; 
            chart.setOption(option);
        } else {
            chart.clear();
        }
        const resizeHandler = () => chart?.resize(); window.addEventListener('resize', resizeHandler); return () => { chart.dispose(); window.removeEventListener('resize', resizeHandler); }; 
    }, [dailyData]);
    return (<div><h3 className="text-lg font-semibold text-slate-800 mb-4">Daily Performance Trend</h3><div ref={chartRef} style={{ width: '100%', height: '360px' }}></div></div>);
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

    return ( <div> <h3 className="text-lg font-semibold text-slate-800 mb-4">Affiliate Performances (Active)</h3> <div className="overflow-x-auto"><table className="w-full text-sm text-left text-slate-500"><thead className="text-xs text-[#2236ba] font-bold uppercase"><tr><th scope="col" className="px-6 py-3">Affiliate</th><th scope="col" className="px-6 py-3">Tier</th><SortableHeader label="Clicks" sortKey="clicks" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /><th scope="col" className="px-6 py-3 text-center">% Change</th><SortableHeader label="Installs" sortKey="installs" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /><th scope="col" className="px-6 py-3 text-center">% Change</th><SortableHeader label="Revenue" sortKey="revenue" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /><th scope="col" className="px-6 py-3 text-center">% Change</th><SortableHeader label="Payout" sortKey="payout" requestSort={requestSort} sortConfig={sortConfig} className="text-right" /></tr></thead><tbody>{displayedData.map((row) => ( <tr key={row.affiliateId} className="bg-white border-b border-[#bfdbfe]/30 last:border-b-0 hover:bg-[#F8F9FA]/50"><td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{row.affiliateName} ({row.affiliateId})</td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTierColor(row.tierName)}`}>{row.tierName}</span></td><td className="px-6 py-4 text-right">{formatNumber(row.clicks)}</td><td className="px-6 py-4 text-center"><ChangeIndicator value={calculatePercentageChange(row.clicks, row.clicksPrev)} /></td><td className="px-6 py-4 text-right">{formatNumber(row.installs)}</td><td className="px-6 py-4 text-center"><ChangeIndicator value={calculatePercentageChange(row.installs, row.installsPrev)} /></td><td className={`px-6 py-4 text-right ${row.revenue > 0 ? 'text-[#2236ba]' : ''}`}>{formatCurrency(row.revenue)}</td><td className="px-6 py-4 text-center"><ChangeIndicator value={calculatePercentageChange(row.revenue, row.revenuePrev)} /></td><td className="px-6 py-4 text-right">{formatCurrency(row.payout)}</td></tr> ))}</tbody></table></div> {data.length > 10 && (<div className="text-center mt-4"><button onClick={onToggleShowAll} className="text-sm text-slate-500 hover:text-slate-800 font-medium py-1 px-3">{showAll ? 'Show Less' : 'Show More'}</button></div>)} </div> );
};



const MerchantsDetailsSection: React.FC<{ metrics: any; vsDateRangeText: string }> = ({ metrics, vsDateRangeText }) => {
    if (!metrics) return null;

    const referredChange = calculatePercentageChange(metrics.totalReferredMerchants, metrics.totalReferredMerchantsPrev);
    const payingChange = calculatePercentageChange(metrics.totalPayingMerchants, metrics.totalPayingMerchantsPrev);
    const payoutOneChange = calculatePercentageChange(metrics.payoutOneCount, metrics.payoutOneCountPrev);
    const payoutLeThreeChange = calculatePercentageChange(metrics.payoutLeThreeCount, metrics.payoutLeThreeCountPrev);
    const payoutGtThreeChange = calculatePercentageChange(metrics.payoutGtThreeCount, metrics.payoutGtThreeCountPrev);

    const totalPaying = metrics.totalPayingMerchants || 1;
    const pctOne = Math.round((metrics.payoutOneCount / totalPaying) * 100);
    const pctLeThree = Math.round((metrics.payoutLeThreeCount / totalPaying) * 100);
    const pctGtThree = Math.round((metrics.payoutGtThreeCount / totalPaying) * 100);

    const toSentenceCase = (str: string) => {
        if (!str) return '';
        const lower = str.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
    };

    const MetricBlock = ({ title, value, unit = '', changeText, description, colorClass = 'text-slate-800', hoverTooltip }: any) => (
        <div className="bg-white p-6 rounded-xl border border-[#bfdbfe]/50 flex flex-col justify-between transition-all duration-300">
            <div>
                <span style={{ fontSize: '14px', color: 'rgb(30, 41, 59)', fontWeight: 600, textTransform: 'none' }} className="block mb-1">
                    {toSentenceCase(title)}
                </span>
                <h4 title={hoverTooltip} className={`text-4xl font-extrabold ${colorClass} tracking-tight my-2 ${hoverTooltip ? 'cursor-help border-b border-dashed border-[#bfdbfe]/50 inline-block pb-0.5' : ''}`}>
                    {typeof value === 'number' ? formatNumber(value) : value} {unit && <span className="text-lg font-semibold text-slate-500 font-normal">{unit}</span>}
                </h4>
                <div className="h-6 flex items-center">
                    {changeText}
                </div>
            </div>
            {description && (
                <div style={{ color: 'rgb(148, 163, 184)' }} className="mt-4 pt-4 border-t border-[#bfdbfe]/30 text-xs flex items-start">
                    <svg style={{ color: 'rgb(148, 163, 184)' }} className="w-4 h-4 mr-1.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{description}</span>
                </div>
            )}
        </div>
    );

    const renderChange = (change: number) => {
        if (change === 0) return <span style={{ color: 'rgb(148, 163, 184)' }} className="text-sm">— {vsDateRangeText}</span>;
        return (
            <span className={`text-sm font-semibold flex items-center ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}% 
                <span style={{ color: 'rgb(148, 163, 184)' }} className="font-normal ml-1.5">{vsDateRangeText}</span>
            </span>
        );
    };

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center">
                <svg className="w-5 h-5 mr-2 text-[var(--accent-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Merchants Details
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <MetricBlock 
                    title="Total Referred Merchants" 
                    value={metrics.totalReferredMerchants} 
                    changeText={renderChange(referredChange)} 
                    description="Merchants referred by your affiliates in the selected range." 
                    hoverTooltip="Total Referred Merchants = Total Install + Total Paying Merchants"
                />
                <MetricBlock 
                    title="Total Paying Merchants" 
                    value={metrics.totalPayingMerchants} 
                    colorClass="text-emerald-600"
                    changeText={renderChange(payingChange)} 
                    description="Merchants with at least one valid payout." 
                />
                <MetricBlock 
                    title="Merchants with 1 Payout" 
                    value={metrics.payoutOneCount} 
                    colorClass="text-blue-500"
                    changeText={renderChange(payoutOneChange)} 
                    description={`${pctOne}% of total paying merchants`} 
                />
                <MetricBlock 
                    title="Merchants with 2-3 Payouts" 
                    value={metrics.payoutLeThreeCount} 
                    colorClass="text-emerald-500"
                    changeText={renderChange(payoutLeThreeChange)} 
                    description={`${pctLeThree}% of total paying merchants`} 
                />
                <MetricBlock 
                    title="Merchants with > 3 Payouts" 
                    value={metrics.payoutGtThreeCount} 
                    colorClass="text-orange-500"
                    changeText={renderChange(payoutGtThreeChange)} 
                    description={`${pctGtThree}% of total paying merchants`} 
                />
                <MetricBlock 
                    title="Average Merchant Lifetime" 
                    value={metrics.avgLifetime.toFixed(1)} 
                    unit="days"
                    colorClass="text-blue-700"
                    changeText={<span style={{ color: 'rgb(148, 163, 184)' }} className="text-sm">— active average lifetime</span>} 
                    description="Average active days between merchant install and latest payout." 
                />
            </div>
        </div>
    );
};

const TopPerformingAffiliatesChart: React.FC<{ data: TopAffiliateData[] }> = ({ data }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const [sortBy, setSortBy] = useState<'clicks' | 'installs' | 'revenue'>('clicks');

    const top10 = useMemo(() => {
        return [...data]
            .sort((a, b) => {
                if (sortBy === 'clicks') return b.clicks - a.clicks;
                if (sortBy === 'installs') return b.installs - a.installs;
                return b.revenue - a.revenue;
            })
            .slice(0, 10);
    }, [data, sortBy]);

    useEffect(() => {
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        if (top10.length > 0) {
            const option = {
                title: {
                    text: 'Top 10 Performing Affiliates',
                    left: 'center',
                    textStyle: {
                        fontSize: 16,
                        fontWeight: '600',
                        color: '#1e293b'
                    }
                },
                tooltip: {
                    trigger: 'axis',
                    axisPointer: {
                        type: 'cross',
                        crossStyle: {
                            color: '#94a3b8'
                        }
                    }
                },
                legend: {
                    data: ['Revenue', 'Clicks', 'Installs'],
                    top: 'bottom'
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '12%',
                    containLabel: true
                },
                xAxis: [
                    {
                        type: 'category',
                        data: top10.map(d => d.affiliateName),
                        axisPointer: {
                            type: 'shadow'
                        },
                        axisLabel: {
                            interval: 0,
                            rotate: 15,
                            formatter: (value: string) => {
                                return value.length > 15 ? value.substring(0, 15) + '...' : value;
                            }
                        }
                    }
                ],
                yAxis: [
                    {
                        type: 'value',
                        name: 'Clicks / Installs',
                        axisLabel: {
                            formatter: '{value}'
                        }
                    },
                    {
                        type: 'value',
                        name: 'Revenue',
                        axisLabel: {
                            formatter: '${value}'
                        }
                    }
                ],
                series: [
                    {
                        name: 'Revenue',
                        type: 'line',
                        smooth: true,
                        areaStyle: {
                            opacity: 0.15
                        },
                        yAxisIndex: 1,
                        itemStyle: { color: PALETTE.revenue },
                        data: top10.map(d => d.revenue)
                    },
                    {
                        name: 'Installs',
                        type: 'bar',
                        yAxisIndex: 0,
                        stack: 'clicks_installs',
                        itemStyle: { 
                            color: PALETTE.installs,
                            borderColor: '#be123c',
                            borderWidth: 1
                        },
                        data: top10.map(d => d.installs)
                    },
                    {
                        name: 'Clicks',
                        type: 'bar',
                        yAxisIndex: 0,
                        stack: 'clicks_installs',
                        itemStyle: {
                            color: {
                                type: 'linear',
                                x: 0,
                                y: 0,
                                x2: 0,
                                y2: 1,
                                colorStops: [
                                    { offset: 0, color: hexToRgba(PALETTE.clicks, 1.0) },
                                    { offset: 1, color: hexToRgba(PALETTE.clicks, 0.6) }
                                ]
                            },
                            borderColor: '#10714f',
                            borderWidth: 1
                        },
                        data: top10.map(d => d.clicks)
                    }
                ]
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
    }, [top10]);

    if (top10.length === 0) return null;

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center">
                    <svg className="w-5 h-5 mr-2 text-[var(--accent-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    Top Performing Affiliates
                </h3>
                <div className="flex bg-slate-100 p-1 rounded-full w-fit">
                    {(['clicks', 'installs', 'revenue'] as const).map(metric => (
                        <button
                            key={metric}
                            onClick={() => setSortBy(metric)}
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all ${
                                sortBy === metric
                                ? 'bg-[var(--accent-color)] text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-800'
                            }`}
                        >
                            {metric}
                        </button>
                    ))}
                </div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-[#bfdbfe]/50">
                <div ref={chartRef} style={{ width: '100%', height: '400px' }}></div>
            </div>
        </div>
    );
};

export default PerformanceOverview;
