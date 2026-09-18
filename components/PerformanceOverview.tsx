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
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} className="filter-control tp-filter-trigger flex w-full items-center justify-between gap-2 text-left"> <span className="truncate">{selectedLabel}</span> <svg className={`h-4 w-4 shrink-0 text-[var(--tp-faint)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && ( <ul className="filter-menu absolute z-10 mt-1 max-h-60 w-full overflow-auto bg-white p-1">{options.map(option => <li key={option.value} onClick={() => { onChange(option.value); setIsOpen(false); }} className={`cursor-pointer rounded-[6px] px-3 py-2 text-[13px] font-medium text-[var(--tp-ink-2)] hover:bg-[var(--tp-surface-hover)] ${value === option.value ? 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent-ink)]' : ''}`}>{option.label}</li>)}</ul>)} </div> );
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
                                    className={`tp-keep-pill rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                                        compareType === type.id
                                        ? 'border-[var(--tp-accent)] bg-[var(--tp-accent)] text-white'
                                        : 'border-[var(--tp-rule-strong)] bg-white text-[var(--tp-muted)] hover:border-[var(--tp-accent-rule)] hover:bg-[var(--tp-accent-soft)] hover:text-[var(--tp-accent-ink)]'
                                    }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button onClick={onGetMetrics} disabled={loading} className="primary-btn h-10 shrink-0 rounded-[7px] bg-[var(--accent-color)] px-6 text-[13px] font-semibold text-white">{loading ? 'Loading…' : 'Get metrics'}</button> 
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

    const requestIdRef = useRef(0);

    useEffect(() => { const fetchInitialData = async () => { try { const { affiliates } = await fetchAffiliates(); setAllAffiliates(affiliates.sort((a,b) => a.name.localeCompare(b.name))); } catch { setError('Failed to fetch affiliate list.'); } }; fetchInitialData(); }, []);
    
    const handleGetMetrics = useCallback(async () => {
        const requestId = ++requestIdRef.current;
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

            if (requestId !== requestIdRef.current) return;
            setMerchantMetrics(merchantOverview);

        } catch (err: unknown) { 
            if (requestId !== requestIdRef.current) return;
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
            {error && (
                <div className="card flex items-start gap-2.5 p-4 text-[13px] font-medium text-[var(--tp-danger)]" role="alert">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tp-danger)]" />
                    <span>{error}</span>
                </div>
            )}
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
                        
                        <hr className="border-[#dde3d9]/30" />
                        <TopAffiliatesTable data={sortedTopAffiliates} requestSort={requestSort} sortConfig={sortConfig} showAll={showAllTopAffiliates} onToggleShowAll={() => setShowAllTopAffiliates(!showAllTopAffiliates)} />
                    </div>
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
    const metrics = [ { key: 'signups', label: 'Signups', value: data.signups, prev: data.signupsPrev, color: PALETTE.signups }, { key: 'clicks', label: 'Clicks', value: data.clicks, prev: data.clicksPrev, color: PALETTE.clicks }, { key: 'installs', label: 'Installs', value: data.installs, prev: data.installsPrev, color: PALETTE.installs }, { key: 'revenue', label: 'Revenue', value: data.revenue, prev: data.revenuePrev, color: PALETTE.revenue, isCurrency: true }, { key: 'payouts', label: 'Payouts', value: data.payouts, prev: data.payoutsPrev, color: PALETTE.payouts, isCurrency: true }, ];
    // A metric rail, not five centred hero tiles: labels and figures share one
    // left edge so the eye compares across the row in a single pass, and a
    // hairline between cells does the separating that boxes would otherwise do.
    return (
        <div>
            <div className="mb-4 flex items-baseline justify-between gap-4">
                <h3 className="text-[15px] font-semibold text-[var(--tp-ink)]">Overview</h3>
                <span className="text-[12px] font-medium text-[var(--tp-meta)]">{vsDateRangeText}</span>
            </div>

            <div className="grid grid-cols-1 gap-y-5 sm:grid-cols-2 lg:grid-cols-5 lg:gap-y-0">
                {metrics.map((metric, i) => (
                    <div
                        key={metric.key}
                        className={`flex flex-col px-0 sm:px-5 lg:first:pl-0 ${i > 0 ? 'sm:border-l sm:border-[var(--tp-rule)]' : ''}`}
                    >
                        <div className="flex-grow">
                            <p className="text-[12px] font-semibold text-[var(--tp-muted)]">{metric.label}</p>
                            <p className="my-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums" style={{ color: metric.color }}>
                                {metric.isCurrency ? formatCurrency(metric.value) : formatNumber(metric.value)}
                            </p>
                            <div className="h-5"><ChangeIndicator value={calculatePercentageChange(metric.value, metric.prev)} /></div>
                        </div>
                        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-96' : 'max-h-0'}`}>
                            <div className="mt-3 space-y-1.5 border-t border-[var(--tp-rule)] pt-3 text-left">
                                {Object.keys(data.byTier).map(tier => {
                                    const tierData = data.byTier[tier as keyof typeof data.byTier];
                                    if (!tierData) return null;
                                    const tierValue = tierData[metric.key as keyof ProcessedMetrics];
                                    const tierPrev = tierData.prev[metric.key as keyof ProcessedMetrics];
                                    return (
                                        <div key={tier} className="flex items-center justify-between gap-2 text-[12px]">
                                            <span className="truncate text-[var(--tp-meta)]">{tier}</span>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <span className="font-semibold tabular-nums text-[var(--tp-ink-2)]">{metric.isCurrency ? formatCurrency(tierValue) : formatNumber(tierValue)}</span>
                                                <ChangeIndicator value={calculatePercentageChange(tierValue, tierPrev)} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-5 border-t border-[var(--tp-rule)] pt-3">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    aria-expanded={isExpanded}
                    className="text-[12.5px] font-semibold text-[var(--tp-accent)] hover:underline"
                >
                    {isExpanded ? 'Hide breakdown by tier' : 'Show breakdown by tier'}
                </button>
            </div>
        </div>
    );
};

const PerformanceChart: React.FC<{ dailyData: DailyData[] }> = ({ dailyData }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    useEffect(() => { 
        if (!chartRef.current) return;
        const chart = echarts.init(chartRef.current);
        if (dailyData.length > 0) {
            const sortedDailyData = [...dailyData].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const option = { 
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: '#ffffff',
                    borderColor: '#dde3d9',
                    borderWidth: 1,
                    padding: [10, 12],
                    textStyle: { color: '#17211f', fontSize: 12 },
                    axisPointer: { lineStyle: { color: '#93a09c', type: 'dashed' } },
                    extraCssText: 'border-radius: 6px; box-shadow: none;'
                },
                legend: { data: ['Signups', 'Clicks', 'Installs', 'Revenue', 'Payouts'], top: 'bottom', itemWidth: 10, itemHeight: 10, textStyle: { color: '#5d6b67', fontSize: 12 } },
                grid: { left: '2%', right: '3%', bottom: '14%', top: '6%', containLabel: true },
                xAxis: { type: 'category', boundaryGap: true, data: sortedDailyData.map(d => formatDisplayDateGmt7(d.date)), axisLine: { lineStyle: { color: '#dde3d9' } }, axisTick: { show: false }, axisLabel: { color: '#5d6b67', fontSize: 11 } },
                yAxis: [{ type: 'value', name: 'Count', nameTextStyle: { color: '#5d6b67', fontSize: 11 }, axisLabel: { color: '#5d6b67', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#dde3d9', type: 'dashed' } } }, { type: 'value', name: 'Amount ($)', nameTextStyle: { color: '#5d6b67', fontSize: 11 }, axisLabel: { formatter: '${value}', color: '#5d6b67', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } }],
                series: [ 
                    { 
                        name: 'Signups', 
                        type: 'line', 
                        smooth: true, 
                        itemStyle: { color: PALETTE.signups }, 
                        lineStyle: { width: 2.5 },
                        showSymbol: false,
                        areaStyle: { color: hexToRgba(PALETTE.signups, 0.09) },
                        data: sortedDailyData.map(d => d.signups) 
                    }, 
                    { 
                        name: 'Installs', 
                        type: 'bar', 
                        stack: 'clicks_installs',
                        itemStyle: { color: PALETTE.installs, borderRadius: [3, 3, 0, 0] },
                        data: sortedDailyData.map(d => d.installs) 
                    }, 
                    { 
                        name: 'Clicks', 
                        type: 'bar', 
                        stack: 'clicks_installs',
                        itemStyle: { color: PALETTE.clicks, borderRadius: [3, 3, 0, 0] },
                        data: sortedDailyData.map(d => d.clicks) 
                    }, 
                    { 
                        name: 'Revenue', 
                        type: 'line', 
                        smooth: true, 
                        yAxisIndex: 1, 
                        itemStyle: { color: PALETTE.revenue }, 
                        lineStyle: { width: 2.5 },
                        showSymbol: false,
                        areaStyle: { color: hexToRgba(PALETTE.revenue, 0.07) },
                        data: sortedDailyData.map(d => d.revenue) 
                    }, 
                    { 
                        name: 'Payouts', 
                        type: 'line', 
                        smooth: true, 
                        yAxisIndex: 1, 
                        itemStyle: { color: PALETTE.payouts }, 
                        lineStyle: { width: 2.5 },
                        showSymbol: false,
                        areaStyle: { color: hexToRgba(PALETTE.payouts, 0.07) },
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
    return (<div><h3 className="text-lg font-semibold text-[var(--tp-ink)] mb-4">Daily Performance Trend</h3><div ref={chartRef} style={{ width: '100%', height: '360px' }}></div></div>);
};


const getTierColor = (tierName: string) => {
    const name = tierName.toLowerCase();
    if (name.startsWith('kol')) return 'tp-chip-accent';
    if (name.includes('standard')) return 'tp-chip-info';
    if (name.includes('nonkol')) return '';
    return '';
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
        <th scope="col" className={`cursor-pointer hover:text-[var(--tp-ink)] ${className}`} onClick={() => requestSort(sortKey)}>
            <div className={`flex items-center gap-1.5 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
                {label}
                <span className={isSorted ? 'text-[var(--tp-accent)]' : 'text-[var(--tp-faint)]'}>{icon}</span>
            </div>
        </th>
    );
};

const TopAffiliatesTable: React.FC<{ data: TopAffiliateData[]; requestSort: (key: keyof TopAffiliateData) => void; sortConfig: { key: keyof TopAffiliateData | null; direction: 'descending' | 'ascending' }; showAll: boolean; onToggleShowAll: () => void; }> = ({ data, requestSort, sortConfig, showAll, onToggleShowAll }) => {
    if (data.length === 0) return null;
    const displayedData = showAll ? data : data.slice(0, 10);

    return (
        <div>
            <h3 className="mb-4 text-[15px] font-semibold text-[var(--tp-ink)]">Active affiliate performance</h3>
            <div className="tp-table-scroll -mx-6">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr>
                            <th scope="col" className="pl-6">Affiliate</th>
                            <th scope="col">Tier</th>
                            <SortableHeader label="Clicks" sortKey="clicks" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
                            <th scope="col" className="text-center">Change</th>
                            <SortableHeader label="Installs" sortKey="installs" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
                            <th scope="col" className="text-center">Change</th>
                            <SortableHeader label="Revenue" sortKey="revenue" requestSort={requestSort} sortConfig={sortConfig} className="text-right" />
                            <th scope="col" className="text-center">Change</th>
                            <SortableHeader label="Payout" sortKey="payout" requestSort={requestSort} sortConfig={sortConfig} className="pr-6 text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {displayedData.map((row) => (
                            <tr key={row.affiliateId}>
                                <td className="whitespace-nowrap pl-6 font-semibold text-[var(--tp-ink)]">
                                    {row.affiliateName}
                                    <span className="ml-1.5 font-medium tabular-nums text-[var(--tp-meta)]">{row.affiliateId}</span>
                                </td>
                                <td><span className={`tp-chip ${getTierColor(row.tierName)}`}>{row.tierName}</span></td>
                                <td className="text-right tabular-nums">{formatNumber(row.clicks)}</td>
                                <td className="text-center"><ChangeIndicator value={calculatePercentageChange(row.clicks, row.clicksPrev)} /></td>
                                <td className="text-right tabular-nums">{formatNumber(row.installs)}</td>
                                <td className="text-center"><ChangeIndicator value={calculatePercentageChange(row.installs, row.installsPrev)} /></td>
                                <td className={`text-right font-semibold tabular-nums ${row.revenue > 0 ? 'text-[var(--tp-accent)]' : ''}`}>{formatCurrency(row.revenue)}</td>
                                <td className="text-center"><ChangeIndicator value={calculatePercentageChange(row.revenue, row.revenuePrev)} /></td>
                                <td className="pr-6 text-right tabular-nums">{formatCurrency(row.payout)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length > 10 && (
                <div className="mt-4">
                    <button onClick={onToggleShowAll} className="text-[12.5px] font-semibold text-[var(--tp-accent)] hover:underline">
                        {showAll ? 'Show fewer affiliates' : `Show all ${data.length} affiliates`}
                    </button>
                </div>
            )}
        </div>
    );
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

    const MetricBlock = ({ title, value, unit = '', changeText, description, colorClass = 'text-[var(--tp-ink)]', hoverTooltip }: any) => (
        <div className="card flex flex-col justify-between p-5">
            <div>
                <span className="mb-1 block text-[13px] font-semibold text-[var(--tp-muted)]">
                    {toSentenceCase(title)}
                </span>
                <h4 title={hoverTooltip} className={`my-1.5 text-[32px] font-semibold leading-none tracking-[-0.025em] tabular-nums ${colorClass} ${hoverTooltip ? 'inline-block cursor-help border-b border-dashed border-[var(--tp-rule-strong)] pb-0.5' : ''}`}>
                    {typeof value === 'number' ? formatNumber(value) : value}
                    {unit && <span className="ml-1 text-[15px] font-semibold text-[var(--tp-muted)]">{unit}</span>}
                </h4>
                <div className="flex h-6 items-center">
                    {changeText}
                </div>
            </div>
            {description && (
                <p className="mt-4 border-t border-[var(--tp-rule)] pt-3 text-[11.5px] leading-snug text-[var(--tp-meta)]">
                    {description}
                </p>
            )}
        </div>
    );

    const renderChange = (change: number) => {
        if (change === 0) return <span className="text-[12.5px] text-[var(--tp-meta)]">No change {vsDateRangeText}</span>;
        return (
            <span className={`flex items-center text-[12.5px] font-semibold tabular-nums ${change > 0 ? 'text-[var(--tp-positive)]' : 'text-[var(--tp-danger)]'}`}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}%
                <span className="ml-1.5 font-medium text-[var(--tp-meta)]">{vsDateRangeText}</span>
            </span>
        );
    };

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-[15px] font-semibold tracking-[-0.006em] text-[var(--tp-ink)]">Merchant detail</h3>

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
                    colorClass="text-[var(--tp-accent)]"
                    changeText={renderChange(payingChange)} 
                    description="Merchants with at least one valid payout." 
                />
                <MetricBlock 
                    title="Merchants with 1 Payout" 
                    value={metrics.payoutOneCount} 
                    colorClass="text-[var(--tp-info)]"
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
                    colorClass="text-[var(--tp-info)]"
                    changeText={<span className="text-[12.5px] text-[var(--tp-meta)]">— active average lifetime</span>} 
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
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: '#ffffff',
                    borderColor: '#dde3d9',
                    borderWidth: 1,
                    padding: [10, 12],
                    textStyle: { color: '#17211f', fontSize: 12 },
                    extraCssText: 'border-radius: 6px; box-shadow: none;',
                    axisPointer: {
                        type: 'cross',
                        crossStyle: {
                            color: '#93a09c'
                        }
                    }
                },
                legend: {
                    data: ['Revenue', 'Clicks', 'Installs'],
                    top: 0,
                    itemWidth: 10,
                    itemHeight: 10,
                    textStyle: { color: '#5d6b67', fontSize: 12 }
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    top: '14%',
                    bottom: '10%',
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
                            color: '#5d6b67',
                            fontSize: 11,
                            formatter: (value: string) => {
                                return value.length > 15 ? value.substring(0, 15) + '...' : value;
                            }
                        },
                        axisLine: { lineStyle: { color: '#dde3d9' } },
                        axisTick: { show: false }
                    }
                ],
                yAxis: [
                    {
                        type: 'value',
                        name: 'Clicks / Installs',
                        nameTextStyle: { color: '#5d6b67', fontSize: 11 },
                        axisLabel: {
                            formatter: '{value}',
                            color: '#5d6b67',
                            fontSize: 11
                        },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { lineStyle: { color: '#dde3d9', type: 'dashed' } }
                    },
                    {
                        type: 'value',
                        name: 'Revenue',
                        nameTextStyle: { color: '#5d6b67', fontSize: 11 },
                        axisLabel: {
                            formatter: '${value}',
                            color: '#5d6b67',
                            fontSize: 11
                        },
                        axisLine: { show: false },
                        axisTick: { show: false },
                        splitLine: { show: false }
                    }
                ],
                series: [
                    {
                        name: 'Revenue',
                        type: 'line',
                        smooth: true,
                        lineStyle: { width: 2.5 },
                        showSymbol: false,
                        areaStyle: { color: hexToRgba(PALETTE.revenue, 0.08) },
                        yAxisIndex: 1,
                        itemStyle: { color: PALETTE.revenue },
                        data: top10.map(d => d.revenue)
                    },
                    {
                        name: 'Installs',
                        type: 'bar',
                        yAxisIndex: 0,
                        stack: 'clicks_installs',
                        itemStyle: { color: PALETTE.installs, borderRadius: [3, 3, 0, 0] },
                        data: top10.map(d => d.installs)
                    },
                    {
                        name: 'Clicks',
                        type: 'bar',
                        yAxisIndex: 0,
                        stack: 'clicks_installs',
                        itemStyle: { color: PALETTE.clicks, borderRadius: [3, 3, 0, 0] },
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
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h3 className="text-[15px] font-semibold tracking-[-0.006em] text-[var(--tp-ink)]">Top performing affiliates</h3>
                <div
                    className="flex w-fit gap-0.5 rounded-[7px] border border-[var(--tp-rule)] bg-[var(--tp-surface-sunken)] p-0.5"
                    role="group"
                    aria-label="Rank affiliates by"
                >
                    {(['clicks', 'installs', 'revenue'] as const).map(metric => (
                        <button
                            key={metric}
                            onClick={() => setSortBy(metric)}
                            aria-pressed={sortBy === metric}
                            className={`rounded-[5px] px-3 py-1 text-[12px] font-semibold capitalize transition-all ${
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
            <div ref={chartRef} style={{ width: '100%', height: '400px' }}></div>
        </div>
    );
};

export default PerformanceOverview;
