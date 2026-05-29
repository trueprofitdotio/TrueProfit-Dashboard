import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAffiliates, fetchConversionReport } from '../services/trackdeskService';
import { Affiliate, DateRange, ConversionReportRow, MerchantDetailsData, MerchantSummaryData } from '../types';
import DateRangePicker from './DateRangePicker';
import { 
    getPresetDateRange, 
    getBangkokDateParts, 
    createBangkokDate, 
    formatDisplayDateGmt7, 
    toGmt7EndOfDay,
    calculatePercentageChange,
    getOrdinalSuffix
} from '../utils/timeHelper';

const Loader: React.FC = () => ( <div className="flex justify-center items-center p-8"><div className="w-16 h-16 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div></div> );
const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
const formatCurrency = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

const ChangeIndicatorText: React.FC<{ value: number; vsDateRangeText: string }> = ({ value, vsDateRangeText }) => {
    if (value === 0 || isNaN(value) || !isFinite(value)) return <span className="text-sm text-slate-500">— vs previous period</span>;
    const isPositive = value > 0; const color = isPositive ? 'text-green-500' : 'text-red-500'; const sign = isPositive ? '+' : '';
    return <span className={`text-sm font-medium ${color}`}>{sign}{value.toFixed(1)}% <span className="text-slate-500 font-normal">{vsDateRangeText}</span></span>;
};

const AffiliateMultiSelect: React.FC<{ options: Affiliate[], selectedAccountIds: string[], onChange: (selected: string[]) => void }> = ({ options, selectedAccountIds, onChange }) => {
    const [isOpen, setIsOpen] = useState(false); const [searchTerm, setSearchTerm] = useState(''); const dropdownRef = useRef<HTMLDivElement>(null); const filteredOptions = useMemo(() => options.filter(o => o.name.toLowerCase().includes(searchTerm.toLowerCase()) || o.publicId.toLowerCase().includes(searchTerm.toLowerCase())), [options, searchTerm]); const toggleOption = (accountId: string) => onChange(selectedAccountIds.includes(accountId) ? selectedAccountIds.filter(id => id !== accountId) : [...selectedAccountIds, accountId]);
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
    return ( <div className="relative" ref={dropdownRef}> <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full bg-white text-left p-2.5 border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px]"> <span className={selectedAccountIds.length > 0 ? 'text-slate-800' : 'text-slate-400'}>{selectedAccountIds.length === 0 ? 'All Affiliates' : selectedAccountIds.length === 1 ? options.find(o => o.accountId === selectedAccountIds[0])?.name : `${selectedAccountIds.length} affiliates selected`}</span> <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg> </button> {isOpen && (<div className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200"><div className="p-2 border-b border-slate-200"><input type="text" placeholder="Search by name or ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border border-slate-300 focus:ring-1 focus:ring-[var(--accent-color)]"/></div><ul className="max-h-60 overflow-auto">{filteredOptions.map(option => (<li key={option.accountId} onClick={() => toggleOption(option.accountId)} className="px-4 py-2 text-sm text-slate-700 hover:bg-emerald-50 cursor-pointer flex items-center"><input type="checkbox" readOnly checked={selectedAccountIds.includes(option.accountId)} className="h-4 w-4 text-[var(--accent-color)] border-slate-300 mr-3 focus:ring-[var(--accent-color)]" /><div>{option.name}<span className="text-xs text-slate-400 ml-2">({option.publicId})</span></div></li>))}</ul></div>)} </div> );
};

// --- FILTERS COMPONENT ---
type CompareType = 'previous_period' | 'previous_month' | 'previous_year';

interface FiltersProps {
    dateRange: DateRange;
    setDateRange: (range: DateRange) => void;
    allAffiliates: Affiliate[];
    selectedAffiliates: string[];
    setSelectedAffiliates: (selected: string[]) => void;
    onFetch: () => void;
    loading: boolean;
    compareEnabled: boolean;
    setCompareEnabled: (enabled: boolean) => void;
    compareType: CompareType;
    setCompareType: (type: CompareType) => void;
}

const Filters: React.FC<FiltersProps> = ({
    dateRange,
    setDateRange,
    allAffiliates,
    selectedAffiliates,
    setSelectedAffiliates,
    onFetch,
    loading,
    compareEnabled,
    setCompareEnabled,
    compareType,
    setCompareType
}) => {
    const handlePresetSelect = (preset: string) => setDateRange(getPresetDateRange(preset));
    const handleRangeChange = (range: { from: Date; to: Date }) => setDateRange({ from: range.from, to: range.to });

    return (
        <div className="card p-6 mb-8 bg-white rounded-xl shadow-sm border border-slate-100">
            <div className="flex flex-col space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Time Range</label>
                        <DateRangePicker value={dateRange} onChange={handleRangeChange} onPresetSelect={handlePresetSelect} />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Affiliates</label>
                        <AffiliateMultiSelect options={allAffiliates} selectedAccountIds={selectedAffiliates} onChange={setSelectedAffiliates} />
                    </div>
                </div>

                <div className="flex flex-col space-y-2 pt-2 border-t border-slate-100">
                    <label className="flex items-center space-x-2 cursor-pointer group w-fit">
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
                <button onClick={onFetch} disabled={loading} className="px-8 py-2.5 text-white font-semibold shadow-sm primary-btn bg-[var(--accent-color)] focus:outline-none focus:ring-1 focus:ring-offset-2 focus:ring-[var(--accent-color)] disabled:bg-slate-400 disabled:cursor-not-allowed">
                    {loading ? 'Loading...' : 'Get Metrics'}
                </button>
            </div>
        </div>
    );
};



const MerchantsDetails: React.FC = () => {
    const [dateRange, setDateRange] = useState<DateRange>(getPresetDateRange('Yesterday'));
    const [selectedAffiliates, setSelectedAffiliates] = useState<string[]>([]); const [allAffiliates, setAllAffiliates] = useState<Affiliate[]>([]);
    const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
    const [compareEnabled, setCompareEnabled] = useState(false);
    const [compareType, setCompareType] = useState<CompareType>('previous_period');
    const [merchantsData, setMerchantsData] = useState<MerchantDetailsData[]>([]); const [summaryData, setSummaryData] = useState<MerchantSummaryData | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof MerchantDetailsData | null; direction: 'ascending' | 'descending' }>({ key: 'revenueInPeriod', direction: 'descending' });
    const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const { affiliates } = await fetchAffiliates();
                const sorted = affiliates.sort((a, b) => a.name.localeCompare(b.name));
                setAllAffiliates(sorted);
            } catch {
                setError('Failed to fetch affiliate list.');
            }
        };
        fetchInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGetMetrics = useCallback(async () => {
        setLoading(true); setError(null); setMerchantsData([]); setSummaryData(null); setExpandedCustomerId(null);
        try {
            let currentAffiliates = allAffiliates;
            if (currentAffiliates.length === 0) {
                try {
                    const { affiliates } = await fetchAffiliates();
                    currentAffiliates = affiliates.sort((a, b) => a.name.localeCompare(b.name));
                    setAllAffiliates(currentAffiliates);
                } catch (e) {
                    console.error('Failed to fetch affiliates on demand', e);
                }
            }
            const affiliateNameMap = new Map<string, string>(); currentAffiliates.forEach(aff => affiliateNameMap.set(aff.publicId, aff.name));
            const filteredPublicIds = selectedAffiliates.length > 0 ? currentAffiliates.filter(a => selectedAffiliates.includes(a.accountId)).map(a => a.publicId) : undefined;
            
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reportFilters: Record<string, any> = {}; if (filteredPublicIds) reportFilters.sourceId = filteredPublicIds;
            const [primaryConversions, prevConversions] = await Promise.all([
                fetchConversionReport({ from: dateRange.from.toISOString(), to: toGmt7EndOfDay(dateRange.to).toISOString() }, reportFilters),
                fetchConversionReport({ from: prevDateRange.from.toISOString(), to: toGmt7EndOfDay(prevDateRange.to).toISOString() }, reportFilters)
            ]);

            // Manual filtering to ensure the affiliate filter works even if the API filter fails
            const validPublicIds = filteredPublicIds ? new Set(filteredPublicIds) : null;
            if (validPublicIds) {
                primaryConversions.rows = primaryConversions.rows.filter(c => c.source?.publicId && validPublicIds.has(c.source.publicId));
                prevConversions.rows = prevConversions.rows.filter(c => c.source?.publicId && validPublicIds.has(c.source.publicId));
            }

            const customerIdsInPeriod = [...new Set(primaryConversions.rows.map(c => c.customerId).filter(Boolean))];
            if (customerIdsInPeriod.length === 0) { setLoading(false); return; }
            const lifetimeTimeRange = { from: '2020-01-01T00:00:00.000Z', to: new Date().toISOString() };
            const { rows: lifetimeConversions } = await fetchConversionReport(lifetimeTimeRange, { customerId: customerIdsInPeriod });
            type TempMerchantData = Partial<Omit<MerchantDetailsData, 'status'>>; const merchantsMap = new Map<string, TempMerchantData>();
            const conversionsByCustomer = new Map<string, ConversionReportRow[]>(); lifetimeConversions.forEach(conv => { if (!conv.customerId) return; if (!conversionsByCustomer.has(conv.customerId)) conversionsByCustomer.set(conv.customerId, []); conversionsByCustomer.get(conv.customerId)!.push(conv); });
            for (const [customerId, conversions] of conversionsByCustomer.entries()) {
                if (conversions.length === 0) continue; 
                conversions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); 
                const payoutCount = conversions.filter(c => c.conversionType.name.toLowerCase() === 'payout').length;
                const merchant: TempMerchantData = { customerId, allConversions: conversions, totalLifetimeRevenue: 0, totalLifetimePayout: 0, installedDate: null, lastPayoutDate: null, affiliateId: conversions[0].source?.publicId || 'N/A', payoutCount };
                for (const conv of conversions) { merchant.totalLifetimeRevenue = (merchant.totalLifetimeRevenue || 0) + parseFloat(conv.revenue.value || '0'); merchant.totalLifetimePayout = (merchant.totalLifetimePayout || 0) + parseFloat(conv.cost.value || '0'); if (conv.conversionType.name.toLowerCase() === 'install' && !merchant.installedDate) merchant.installedDate = conv.createdAt; if (conv.conversionType.name.toLowerCase() === 'payout') merchant.lastPayoutDate = conv.createdAt; }
                merchantsMap.set(customerId, merchant);
            }
            primaryConversions.rows.forEach(conv => { if (!conv.customerId || !merchantsMap.has(conv.customerId)) return; const merchant = merchantsMap.get(conv.customerId)!; merchant.revenueInPeriod = (merchant.revenueInPeriod || 0) + parseFloat(conv.revenue.value || '0'); merchant.payoutInPeriod = (merchant.payoutInPeriod || 0) + parseFloat(conv.cost.value || '0'); });
            const finalData: MerchantDetailsData[] = customerIdsInPeriod.map(customerId => { 
                const merchant = merchantsMap.get(customerId)!; 
                let merchantLifetime: string | null = null; 
                let merchantLifetimeDays: number | null = null;
                const affiliateId = merchant.affiliateId!; 
                if (merchant.installedDate && merchant.lastPayoutDate) { 
                    const lifetimeInMs = new Date(merchant.lastPayoutDate).getTime() - new Date(merchant.installedDate).getTime(); 
                    if (lifetimeInMs >= 0) {
                        merchantLifetimeDays = Math.round(lifetimeInMs / 864e5);
                        merchantLifetime = `${merchantLifetimeDays} days`; 
                    }
                } 
                const totalRevenue = merchant.totalLifetimeRevenue || 0; 
                return { customerId, affiliateId, affiliateName: affiliateNameMap.get(affiliateId) || 'Unknown', revenueInPeriod: merchant.revenueInPeriod || 0, payoutInPeriod: merchant.payoutInPeriod || 0, status: totalRevenue > 0 ? 'Paying' : 'Install', installedDate: merchant.installedDate || null, lastPayoutDate: merchant.lastPayoutDate || null, merchantLifetime: merchantLifetime, merchantLifetimeDays: merchantLifetimeDays, totalLifetimeRevenue: totalRevenue, totalLifetimePayout: merchant.totalLifetimePayout || 0, allConversions: merchant.allConversions || [], payoutCount: merchant.payoutCount || 0 }; 
            });
            const currentSummary = { totalMerchants: finalData.length, payingMerchants: finalData.filter(m => m.status === 'Paying').length, totalRevenue: finalData.reduce((sum, m) => sum + m.revenueInPeriod, 0), totalPayout: finalData.reduce((sum, m) => sum + m.payoutInPeriod, 0), };
            // Note: 'paying' for previous period is an approximation based on revenue in that period, as lifetime data isn't fetched for those customers.
            const prevCustomerIds = new Set(prevConversions.rows.map(c => c.customerId).filter(Boolean)); const prevConversionsByCustomer = new Map<string, number>(); prevConversions.rows.forEach(c => { if(c.customerId) { const currentRev = prevConversionsByCustomer.get(c.customerId) || 0; prevConversionsByCustomer.set(c.customerId, currentRev + parseFloat(c.revenue.value || '0')); } }); const prevPayingCustomerCount = Array.from(prevConversionsByCustomer.values()).filter(rev => rev > 0).length;
            const previousSummary = { totalMerchants: prevCustomerIds.size, payingMerchants: prevPayingCustomerCount, totalRevenue: prevConversions.rows.reduce((sum, c) => sum + parseFloat(c.revenue.value || '0'), 0), totalPayout: prevConversions.rows.reduce((sum, c) => sum + parseFloat(c.cost.value || '0'), 0), };
            setSummaryData({ current: currentSummary, previous: previousSummary, vsDateRange: prevDateRange });
            setMerchantsData(finalData);
        } catch { setError('An unexpected error occurred.'); } finally { setLoading(false); }
    }, [dateRange, selectedAffiliates, allAffiliates, compareEnabled, compareType]);

    const requestSort = (key: keyof MerchantDetailsData) => { let direction: 'ascending' | 'descending' = 'ascending'; if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending'; setSortConfig({ key, direction }); };
    const sortedMerchantsData = useMemo(() => { 
        const sortableItems = [...merchantsData]; 
        if (sortConfig.key !== null) { 
            sortableItems.sort((a, b) => { 
                let aValue = a[sortConfig.key!]; 
                let bValue = b[sortConfig.key!]; 
                if (sortConfig.key === 'merchantLifetime') {
                    aValue = a.merchantLifetimeDays;
                    bValue = b.merchantLifetimeDays;
                }
                if (aValue === null || aValue === undefined) return 1; 
                if (bValue === null || bValue === undefined) return -1; 
                if (typeof aValue === 'number' && typeof bValue === 'number') { 
                    return sortConfig.direction === 'ascending' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number); 
                } else { 
                    const strA = String(aValue).toLowerCase(); 
                    const strB = String(bValue).toLowerCase(); 
                    if (strA < strB) return sortConfig.direction === 'ascending' ? -1 : 1; 
                    if (strA > strB) return sortConfig.direction === 'ascending' ? 1 : -1; 
                    return 0; 
                } 
            }); 
        } 
        return sortableItems; 
    }, [merchantsData, sortConfig]);
    const getSortIndicator = (key: keyof MerchantDetailsData) => { if (sortConfig.key !== key) return '↕'; return sortConfig.direction === 'ascending' ? '↑' : '↓'; };
    
    const overviewMetrics = useMemo(() => {
        const payingMerchants = merchantsData.filter(m => m.status === 'Paying');
        const payoutOneCount = payingMerchants.filter(m => m.payoutCount === 1).length;
        const payoutLeThreeCount = payingMerchants.filter(m => m.payoutCount <= 3).length;
        const payoutGtThreeCount = payingMerchants.filter(m => m.payoutCount > 3).length;
        const payingWithLifetime = payingMerchants.filter(m => m.merchantLifetimeDays !== null);
        const avgLifetime = payingWithLifetime.length > 0
            ? payingWithLifetime.reduce((sum, m) => sum + m.merchantLifetimeDays!, 0) / payingWithLifetime.length
            : 0;
        return { payoutOneCount, payoutLeThreeCount, payoutGtThreeCount, avgLifetime };
    }, [merchantsData]);

    const prevPeriodVsText = summaryData ? `vs ${formatDisplayDateGmt7(summaryData.vsDateRange.from)} to ${formatDisplayDateGmt7(summaryData.vsDateRange.to)}` : 'vs previous period';
    const periodRevenueHeader = `Revenue (${formatDisplayDateGmt7(dateRange.from)} - ${formatDisplayDateGmt7(dateRange.to)})`;
    const periodPayoutHeader = `Payout (${formatDisplayDateGmt7(dateRange.from)} - ${formatDisplayDateGmt7(dateRange.to)})`;
    const headers = [{key: 'customerId', label: 'Customer ID'}, {key: 'affiliateName', label: 'Affiliate'}, {key: 'revenueInPeriod', label: periodRevenueHeader}, {key: 'payoutInPeriod', label: periodPayoutHeader}, {key: 'status', label: 'Status'}, {key: 'installedDate', label: 'Installed Date'}, {key: 'lastPayoutDate', label: 'Last Payout Date'}, {key: 'merchantLifetime', label: 'Merchant Lifetime'}, {key: 'totalLifetimeRevenue', label: 'Lifetime Revenue'}, {key: 'totalLifetimePayout', label: 'Total Payout'}];

    return ( <div className="space-y-8"> <Filters dateRange={dateRange} setDateRange={setDateRange} allAffiliates={allAffiliates} selectedAffiliates={selectedAffiliates} setSelectedAffiliates={setSelectedAffiliates} onFetch={handleGetMetrics} loading={loading} compareEnabled={compareEnabled} setCompareEnabled={setCompareEnabled} compareType={compareType} setCompareType={setCompareType} /> {loading && <Loader />} {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3" role="alert">{error}</div>} {!loading && !error && summaryData && ( <div className="card p-6">
 <div className="mb-6"> <h3 className="text-lg font-semibold text-slate-800 mb-2">Overview</h3> <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center mb-6"> <div><p className="text-sm text-slate-500">Total Referred Merchants</p><p className="text-3xl font-bold text-slate-800">{formatNumber(summaryData.current.totalMerchants)}</p><ChangeIndicatorText value={calculatePercentageChange(summaryData.current.totalMerchants, summaryData.previous.totalMerchants)} vsDateRangeText={prevPeriodVsText} /></div> <div><p className="text-sm text-slate-500">Total Paying Merchants</p><p className="text-3xl font-bold text-emerald-600">{formatNumber(summaryData.current.payingMerchants)}</p><ChangeIndicatorText value={calculatePercentageChange(summaryData.current.payingMerchants, summaryData.previous.payingMerchants)} vsDateRangeText={prevPeriodVsText} /></div> <div><p className="text-sm text-slate-500">Total Revenue (period)</p><p className="text-3xl font-bold text-blue-700">{formatCurrency(summaryData.current.totalRevenue)}</p><ChangeIndicatorText value={calculatePercentageChange(summaryData.current.totalRevenue, summaryData.previous.totalRevenue)} vsDateRangeText={prevPeriodVsText} /></div> <div><p className="text-sm text-slate-500">Total Payout (period)</p><p className="text-3xl font-bold text-orange-600">{formatCurrency(summaryData.current.totalPayout)}</p><ChangeIndicatorText value={calculatePercentageChange(summaryData.current.totalPayout, summaryData.previous.totalPayout)} vsDateRangeText={prevPeriodVsText} /></div> </div> <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-center"> <div><p className="text-sm text-slate-500">Merchants with Payout = 1</p><p className="text-3xl font-bold text-slate-800">{formatNumber(overviewMetrics.payoutOneCount)}</p><span className="text-sm text-slate-500">— paying with 1 payout</span></div> <div><p className="text-sm text-slate-500">Merchants with Payout ≤ 3</p><p className="text-3xl font-bold text-slate-800">{formatNumber(overviewMetrics.payoutLeThreeCount)}</p><span className="text-sm text-slate-500">— paying with ≤ 3 payouts</span></div> <div><p className="text-sm text-slate-500">Merchants with Payout &gt; 3</p><p className="text-3xl font-bold text-slate-800">{formatNumber(overviewMetrics.payoutGtThreeCount)}</p><span className="text-sm text-slate-500">— paying with &gt; 3 payouts</span></div> <div><p className="text-sm text-slate-500">Average Merchant Lifetime</p><p className="text-3xl font-bold text-emerald-600">{overviewMetrics.avgLifetime.toFixed(1)} days</p><span className="text-sm text-slate-500">— active average lifetime</span></div> </div> </div> <hr className="my-6 border-slate-100" /> <div className="overflow-x-auto"> <h3 className="text-lg font-semibold text-slate-800 mb-4">Merchants Details</h3> {sortedMerchantsData.length > 0 ? ( <table className="w-full text-sm text-left text-slate-500"><thead className="text-xs text-[#2236ba] font-bold uppercase"><tr>{headers.map(h => (<th scope="col" key={h.key} className="px-4 py-3 cursor-pointer hover:text-blue-800" onClick={() => requestSort(h.key as keyof MerchantDetailsData)}>{h.label} <span className="text-slate-400">{getSortIndicator(h.key as keyof MerchantDetailsData)}</span></th>))}</tr></thead><tbody>{sortedMerchantsData.map((row) => (<React.Fragment key={row.customerId}> <tr onClick={() => setExpandedCustomerId(expandedCustomerId === row.customerId ? null : row.customerId)} className="bg-white border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"> <td className="px-4 py-3 font-medium text-slate-900">{row.customerId}</td> <td className="px-4 py-3 text-slate-600">{row.affiliateName} <span className="text-slate-400 text-xs">({row.affiliateId})</span></td> <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(row.revenueInPeriod)}</td><td className="px-4 py-3 text-right text-slate-800">{formatCurrency(row.payoutInPeriod)}</td> <td className="px-4 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${row.status === 'Paying' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{row.status}</span></td> <td className="px-4 py-3">{formatDisplayDateGmt7(row.installedDate)}</td><td className="px-4 py-3">{formatDisplayDateGmt7(row.lastPayoutDate)}</td> <td className="px-4 py-3">{row.merchantLifetime || 'N/A'}</td><td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(row.totalLifetimeRevenue)}</td> <td className="px-4 py-3 text-right text-orange-600">{formatCurrency(row.totalLifetimePayout)}</td> </tr> {expandedCustomerId === row.customerId && (<tr><td colSpan={10} className="p-4 bg-slate-50"><div className="max-h-60 overflow-y-auto pr-2"><h4 className="font-semibold text-slate-700 text-xs mb-2">Payout History</h4><table className="w-full text-xs"><thead className="text-slate-600"><tr><th className="px-4 py-2 text-left">Payout</th><th className="px-4 py-2 text-left">Time</th><th className="px-4 py-2 text-right">Revenue</th><th className="px-4 py-2 text-right">Payout</th></tr></thead><tbody>{row.allConversions.filter(c => c.conversionType.name.toLowerCase() === 'payout').sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((conv, index, arr) => { const payoutNum = arr.length - index; return (<tr key={conv.createdAt + index} className="border-b border-slate-200 last:border-b-0"><td className="px-4 py-2">{`${payoutNum}${getOrdinalSuffix(payoutNum)} Payout`}</td><td className="px-4 py-2">{formatDisplayDateGmt7(conv.createdAt)}</td><td className="px-4 py-2 text-right">{formatCurrency(parseFloat(conv.revenue.value||'0'))}</td><td className="px-4 py-2 text-right">{formatCurrency(parseFloat(conv.cost.value||'0'))}</td></tr>);})}</tbody></table></div></td></tr>)} </React.Fragment>))}</tbody></table> ) : (<div className="text-center py-16"><p className="text-slate-500 mt-2">No merchant data found for the selected filters. Please adjust your criteria and try again.</p></div>)} </div> </div> )} </div> );
};

export default MerchantsDetails;
