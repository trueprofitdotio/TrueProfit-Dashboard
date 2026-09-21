import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchAffiliates, fetchClickReport, fetchConversionReport } from '../services/trackdeskService';
import { Affiliate } from '../types';

const Loader: React.FC = () => (
    <div className="flex justify-center items-center p-8">
        <div className="w-16 h-16 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div>
    </div>
);

interface PartnerData {
    clicks: number;
    installs: number;
    revenue: number;
    payout: number;
    daily: {
        date: string;
        clicks: number;
        installs: number;
    }[];
}

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);
const formatCurrency = (num: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);

const getGmt7DateString = (isoString: string): string => {
    const date = new Date(isoString);
    const gmt7Date = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return gmt7Date.toISOString().split('T')[0];
};

interface SearchableSelectProps {
    options: Affiliate[];
    value: string | null;
    onChange: (value: string | null) => void;
    placeholder?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder = "Select an option" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = useMemo(() => options.find(option => option.publicId === value), [options, value]);

    const filteredOptions = useMemo(() =>
        options.filter(option =>
            option.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            option.publicId.toLowerCase().includes(searchTerm.toLowerCase())
        ), [options, searchTerm]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionId: string | null) => {
        onChange(optionId);
        setIsOpen(false);
        setSearchTerm('');
    };
    
    return (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                className="w-full bg-white text-left p-2.5 border border-[#e1e7e5]/50 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] flex justify-between items-center h-[42px] rounded-full px-5"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={selectedOption ? 'text-[var(--tp-ink)]' : 'text-[var(--tp-meta)]'}>
                    {selectedOption ? `${selectedOption.name} (${selectedOption.publicId})` : placeholder}
                </span>
                 <svg className="w-5 h-5 text-[var(--tp-meta)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l-7 7-7-7" /></svg>
            </button>

            {isOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white max-h-60 overflow-hidden rounded-2xl border border-[#e1e7e5]/50">
                    <div className="p-2 border-b border-[#e1e7e5]/30">
                        <input
                            type="text"
                            placeholder="Search affiliates..."
                            className="w-full px-4 py-2 border border-[#e1e7e5]/50 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] rounded-full"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <ul className="overflow-auto max-h-48">
                        {filteredOptions.map(option => (
                            <li
                                key={option.publicId}
                                className={`px-4 py-2 text-sm text-[var(--tp-ink-2)] hover:bg-[var(--tp-accent-soft)] cursor-pointer ${value === option.publicId ? 'bg-[var(--tp-accent-soft)]' : ''}`}
                                onClick={() => handleSelect(option.publicId)}
                            >
                                {option.name} ({option.publicId})
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};


const PartnerAnalysis: React.FC = () => {
    const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
    const [selectedAffiliate, setSelectedAffiliate] = useState<string | null>(null);
    const [allAffiliates, setAllAffiliates] = useState<Affiliate[]>([]);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<PartnerData | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const { affiliates } = await fetchAffiliates();
                const sortedAffiliates = affiliates.sort((a, b) => a.name.localeCompare(b.name));
                setAllAffiliates(sortedAffiliates);
                if (sortedAffiliates.length > 0) {
                    setSelectedAffiliate(sortedAffiliates[0].publicId);
                }
            } catch {
                setError('Failed to fetch affiliate list.');
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const handleGetMetric = useCallback(async () => {
        if (!selectedAffiliate) {
            setError('Please select an affiliate.');
            return;
        }

        setLoading(true);
        setError(null);
        setData(null);

        const [year, monthNum] = month.split('-').map(Number);
        const from = new Date(Date.UTC(year, monthNum - 1, 1));
        const to = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));

        const timeRange = { from: from.toISOString(), to: to.toISOString() };
        const affiliateFilters = { sourceId: [selectedAffiliate] };

        try {
            const [clicksRes, conversionsRes] = await Promise.all([
                fetchClickReport(timeRange, affiliateFilters),
                fetchConversionReport(timeRange, affiliateFilters),
            ]);

            const dailyMap: Map<string, { clicks: number; installs: number }> = new Map();

            clicksRes.rows.forEach(row => {
                const date = getGmt7DateString(row.createdAt);
                if (!dailyMap.has(date)) dailyMap.set(date, { clicks: 0, installs: 0 });
                dailyMap.get(date)!.clicks++;
            });

            conversionsRes.rows.forEach(row => {
                if (row.conversionType.name.toLowerCase().includes('install')) {
                    const date = getGmt7DateString(row.createdAt);
                    if (!dailyMap.has(date)) dailyMap.set(date, { clicks: 0, installs: 0 });
                    dailyMap.get(date)!.installs++;
                }
            });

            let totalClicks = 0;
            let totalInstalls = 0;
            let totalRevenue = 0;
            let totalPayout = 0;

            clicksRes.rows.forEach(() => totalClicks++);
            conversionsRes.rows.forEach(row => {
                totalRevenue += parseFloat(row.revenue.value || '0');
                totalPayout += parseFloat(row.cost.value || '0');
                if (row.conversionType.name.toLowerCase().includes('install')) {
                    totalInstalls++;
                }
            });

            const dailyData = Array.from(dailyMap.entries())
                .map(([date, metrics]) => ({ date, ...metrics }))
                .sort((a, b) => a.date.localeCompare(b.date));

            setData({
                clicks: totalClicks,
                installs: totalInstalls,
                revenue: totalRevenue,
                payout: totalPayout,
                daily: dailyData,
            });

        } catch {
            setError('An unexpected error occurred.');
        } finally {
            setLoading(false);
        }

    }, [month, selectedAffiliate]);
    
    const sortedAffiliates = useMemo(() => [...allAffiliates].sort((a, b) => a.name.localeCompare(b.name)), [allAffiliates]);

    return (
        <div className="space-y-8">
            <div className="card p-6 flex flex-col md:flex-row items-end gap-6 mb-8">
                <div className="w-full md:w-auto">
                    <label htmlFor="month" className="block text-sm font-semibold text-[var(--tp-ink-2)] mb-1">Month</label>
                    <input
                        type="month"
                        id="month"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="p-2.5 border border-[#e1e7e5]/50 focus:ring-1 focus:ring-[var(--accent-color)] focus:outline-none h-[42px] rounded-full px-5 w-full md:w-auto bg-white text-[var(--tp-ink)] text-sm"
                    />
                </div>
                <div className="w-full md:w-1/3">
                    <label htmlFor="affiliate" className="block text-sm font-semibold text-[var(--tp-ink-2)] mb-1">Affiliate</label>
                     <SearchableSelect
                        options={sortedAffiliates}
                        value={selectedAffiliate}
                        onChange={setSelectedAffiliate}
                        placeholder="Select an Affiliate"
                    />
                </div>
                <div className="w-full md:w-auto">
                    <button onClick={handleGetMetric} disabled={loading || !selectedAffiliate} className="w-full px-8 py-2.5 text-[var(--tp-on-accent)] font-semibold rounded-full primary-btn bg-[var(--accent-color)] focus:outline-none disabled:bg-[var(--tp-rule-strong)] disabled:cursor-not-allowed disabled:transform-none h-[42px] border-none">
                        {loading ? 'Loading...' : 'Get Metrics'}
                    </button>
                </div>
            </div>

            {loading && <Loader />}
            {error && <div className="card flex items-start gap-2.5 p-4 text-[13px] font-medium text-[var(--tp-danger)]" role="alert"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tp-danger)]" /><span>{error}</span></div>}
            {data && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="card p-6"><p className="text-sm text-[var(--tp-muted)] font-semibold mb-1">Total Clicks</p><p className="text-3xl font-semibold text-[var(--tp-ink)]">{formatNumber(data.clicks)}</p></div>
                        <div className="card p-6"><p className="text-sm text-[var(--tp-muted)] font-semibold mb-1">Total Installs</p><p className="text-3xl font-semibold text-[var(--tp-ink)]">{formatNumber(data.installs)}</p></div>
                        <div className="card p-6"><p className="text-sm text-[var(--tp-muted)] font-semibold mb-1">Total Revenue</p><p className="text-3xl font-semibold text-[var(--tp-ink)]">{formatCurrency(data.revenue)}</p></div>
                        <div className="card p-6"><p className="text-sm text-[var(--tp-muted)] font-semibold mb-1">Total Payout</p><p className="text-3xl font-semibold text-[var(--tp-ink)]">{formatCurrency(data.payout)}</p></div>
                    </div>
                    
                    <div className="card p-6 overflow-x-auto">
                        <h3 className="text-lg font-semibold text-[var(--tp-ink)] mb-4">Daily Breakdown</h3>
                        {data.daily.length > 0 ? (
                            <table className="w-full text-sm text-left text-[var(--tp-muted)]">
                                <thead className="text-xs text-[var(--tp-accent-ink)] font-semibold bg-transparent">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">Date</th>
                                        <th scope="col" className="px-6 py-3 text-right">Clicks</th>
                                        <th scope="col" className="px-6 py-3 text-right">Installs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.daily.map(row => (
                                        <tr key={row.date} className="bg-white border-b border-[#e1e7e5]/30 hover:bg-[var(--tp-surface-sunken)]/50">
                                            <td className="px-6 py-4 font-medium text-[var(--tp-ink)]">{row.date}</td>
                                            <td className="px-6 py-4 text-right text-[var(--tp-muted)]">{formatNumber(row.clicks)}</td>
                                            <td className="px-6 py-4 text-right text-[var(--tp-muted)]">{formatNumber(row.installs)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-[var(--tp-muted)] text-center py-4">No daily data available for this period.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default PartnerAnalysis;