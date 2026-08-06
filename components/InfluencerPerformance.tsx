import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabaseClient } from '../services/supabaseClient';
import { DateRange, Video, VideoPerformanceData, TrendlineData, Kol, OverviewStats } from '../types';
import DateRangePicker from './DateRangePicker';
import KOLCell from './KOLCell';
import { 
    getPresetDateRange, 
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
    graphic: {
        LinearGradient: new (x: number, y: number, x2: number, y2: number, stops: {offset: number, color: string}[]) => any;
    };
};

interface KolPerformanceData {
    kolId: string;
    kolName: string;
    kolData?: Kol;
    startViews: number;
    endViews: number;
    viewGrowth: number;
    growthPercentage: number;
    videos: VideoPerformanceData[];
}

// --- UTILITY & HELPER COMPONENTS ---
const Loader: React.FC<{ text?: string }> = ({ text }) => (
    <div className="flex flex-col justify-center items-center p-8 space-y-4">
        <div className="w-16 h-16 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div>
        {text && <p className="text-[var(--accent-color)] animate-pulse">{text}</p>}
    </div>
);

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

const getPlatformTag = (url: string) => {
    if (!url) return { label: 'Unknown', color: 'bg-slate-100 text-slate-600' };
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return { label: 'Youtube', color: 'bg-red-100 text-red-600' };
    if (lowerUrl.includes('tiktok.com')) return { label: 'TikTok', color: 'bg-slate-900 text-white' };
    if (lowerUrl.includes('x.com') || lowerUrl.includes('twitter.com')) return { label: 'X', color: 'bg-slate-200 text-slate-800' };
    if (lowerUrl.includes('instagram.com')) return { label: 'Instagram', color: 'bg-pink-100 text-pink-600' };
    return { label: 'Social', color: 'bg-blue-100 text-blue-600' };
};

const extractYoutubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

const getVideoStatus = (video: VideoPerformanceData) => {
    const dbStatus = video.status;

    // Standardize mapping to 2 tags as requested
    const isHealthy = ['Healthy', 'HEALTHY', 'Active', 'ACTIVE'].includes(dbStatus);
    const isUnlisted = ['Unlisted/Removed', 'UNLISTED/REMOVED', 'POSSIBLY UNLISTED'].includes(dbStatus);

    if (isUnlisted) {
        return { label: 'UNLISTED/REMOVED', color: 'bg-red-100 text-red-700' };
    }

    // Default to HEALTHY for all other cases (Active, Healthy, etc.)
    return { label: 'HEALTHY', color: 'bg-emerald-100 text-emerald-700' };
};

const utcInputStringToDate = (dateString: string | null | undefined): Date | null => {
    if (!dateString) return null;
    try {
        const d = new Date(`${dateString}T00:00:00.000Z`);
        return isNaN(d.getTime()) ? null : d;
    } catch {
        return null;
    }
};

const ChangeIndicatorText: React.FC<{ value: number; vsDateRange: DateRange }> = ({ value, vsDateRange }) => {
    if (value === 0 || isNaN(value) || !isFinite(value)) return <span className="text-sm text-slate-500">— vs previous period</span>;
    const isPositive = value > 0;
    const color = isPositive ? 'text-green-500' : 'text-red-500';
    const sign = isPositive ? '+' : '';
    const formattedDateRange = `vs ${formatDisplayDateGmt7(vsDateRange.from)} to ${formatDisplayDateGmt7(vsDateRange.to)}`;
    return <span className={`text-sm font-medium ${color}`}>{sign}{value.toFixed(1)}% <span className="text-slate-500 font-normal">{formattedDateRange}</span></span>;
};

// --- SORTING LOGIC ---
type SortDirection = 'asc' | 'desc';
interface SortConfig { key: string; direction: SortDirection; }

const useSortableData = <T,>(items: T[], config: SortConfig | null = null) => {
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(config);

    const sortedItems = React.useMemo(() => {
        let sortableItems = [...items];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const getVal = (obj: any, path: string) => {
                    return path.split('.').reduce((o, i) => (o ? o[i] : null), obj);
                };
                
                let aValue = getVal(a, sortConfig.key);
                let bValue = getVal(b, sortConfig.key);

                if (typeof aValue === 'string') aValue = aValue.toLowerCase();
                if (typeof bValue === 'string') bValue = bValue.toLowerCase();

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    return { items: sortedItems, requestSort, sortConfig };
};

const SortableHeader: React.FC<{ 
    label: string; 
    sortKey: string; 
    currentSort: SortConfig | null; 
    onSort: (key: string) => void; 
    className?: string;
    align?: 'left' | 'right' | 'center';
}> = ({ label, sortKey, currentSort, onSort, className = "", align = 'left' }) => {
    const isActive = currentSort?.key === sortKey;
    return (
        <th 
            className={`px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors group ${className} text-${align}`}
            onClick={() => onSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
                {label}
                <span className="text-slate-400">
                    {isActive ? (
                        currentSort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                        <ArrowUpDown size={14} className="opacity-0 group-hover:opacity-50" />
                    )}
                </span>
            </div>
        </th>
    );
};

const VideoTable: React.FC<{
    title: string;
    videos: VideoPerformanceData[];
    dateRange: DateRange;
    totalLabel?: string;
    totalValue?: number;
    onSeeTrendline: (video: VideoPerformanceData) => void;
    initialLimit?: number;
    showStatus?: boolean;
}> = ({ title, videos, dateRange, totalLabel, totalValue, onSeeTrendline, initialLimit, showStatus = false }) => {
    const { items: sortedVideos, requestSort, sortConfig } = useSortableData(videos);
    const [showAll, setShowAll] = useState(false);

    const displayedVideos = initialLimit && !showAll ? sortedVideos.slice(0, initialLimit) : sortedVideos;

    if (videos.length === 0) {
        return (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="text-md font-semibold text-slate-700">{title}</h4>
                </div>
                <p className="text-center text-slate-500 py-4">No videos found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h4 className="text-md font-semibold text-slate-700">{title}</h4>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-500 table-fixed">
                    <thead className="text-xs text-[var(--header-blue)] font-bold uppercase bg-slate-50">
                        <tr>
                            <SortableHeader label="Video Title" sortKey="title" currentSort={sortConfig} onSort={requestSort} className="w-[22%]" />
                            <SortableHeader label="Channel" sortKey="video_url" currentSort={sortConfig} onSort={requestSort} className="w-[10%]" />
                            <SortableHeader label="KOL Name" sortKey="kols.name" currentSort={sortConfig} onSort={requestSort} className="w-[12%]" />
                            <SortableHeader label="Released" sortKey="released_date" currentSort={sortConfig} onSort={requestSort} className="w-[9%]" />
                            <SortableHeader label={`Views from ${formatDisplayDateGmt7(dateRange.from)}`} sortKey="startViews" currentSort={sortConfig} onSort={requestSort} align="right" className="w-[9%]" />
                            <SortableHeader label={`Views from ${formatDisplayDateGmt7(dateRange.to)}`} sortKey="endViews" currentSort={sortConfig} onSort={requestSort} align="right" className="w-[9%]" />
                            <SortableHeader label="View Growth" sortKey="viewGrowth" currentSort={sortConfig} onSort={requestSort} align="right" className="w-[9%]" />
                            {showStatus && <th className="px-4 py-3 text-center w-[10%]">Status</th>}
                            <th className="px-4 py-3 text-center w-[10%]">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedVideos.map(v => (
                            <tr key={v.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium truncate" title={v.title || v.video_url}>
                                    <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-color)]">
                                        {v.title && typeof v.title === 'string' && v.title.trim() !== "" ? v.title : v.video_url}
                                    </a>
                                </td>
                                <td className="px-4 py-3">
                                    {(() => {
                                        const platform = getPlatformTag(v.video_url);
                                        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${platform.color}`}>{platform.label}</span>;
                                    })()}
                                </td>
                                <td className="px-4 py-3 truncate" title={v.kols?.name || 'Unknown'}>{v.kols?.name || 'Unknown'}</td>
                                <td className="px-4 py-3">{formatDisplayDateGmt7(utcInputStringToDate(v.released_date))}</td>
                                <td className="px-4 py-3 text-right">{formatNumber(v.startViews)}</td>
                                <td className="px-4 py-3 text-right">{formatNumber(v.endViews)}</td>
                                <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatNumber(v.viewGrowth)}</td>
                                {showStatus && (
                                    <td className="px-4 py-3 text-center">
                                        {(() => {
                                            const status = getVideoStatus(v);
                                            return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${status.color}`}>{status.label}</span>;
                                        })()}
                                    </td>
                                )}
                                <td className="px-4 py-3 text-center">
                                    <button onClick={() => onSeeTrendline(v)} className="text-[var(--accent-color)] font-semibold hover:underline text-xs">
                                        See trendline
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {totalLabel && (
                        <tfoot>
                            <tr className="bg-slate-50 font-bold text-slate-700">
                                <td colSpan={showStatus ? 7 : 6} className="px-4 py-3 text-right">{totalLabel}</td>
                                <td className="px-4 py-3 text-right text-slate-900">{formatNumber(totalValue || 0)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                {initialLimit && videos.length > initialLimit && (
                    <div className="flex justify-center mt-4">
                        <button 
                            onClick={() => setShowAll(!showAll)}
                            className="text-sm font-semibold text-[var(--accent-color)] hover:underline flex items-center gap-1"
                        >
                            {showAll ? 'Show less' : `Show more (${videos.length - initialLimit} more)`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- DATE & FILTER LOGIC ---
// Removed local getPresetDateRange in favor of utils/timeHelper
// --- FILTERS COMPONENT ---
type CompareType = 'previous_period' | 'previous_month' | 'previous_year';

interface FiltersProps { 
    dateRange: DateRange; 
    setDateRange: (range: DateRange) => void; 
    onFetch: () => void; 
    loading: boolean;
    compareEnabled: boolean;
    setCompareEnabled: (enabled: boolean) => void;
    compareType: CompareType;
    setCompareType: (type: CompareType) => void;
    kolsList: Kol[];
    selectedKolId: string;
    setSelectedKolId: (id: string) => void;
}

const Filters: React.FC<FiltersProps> = ({ 
    dateRange, 
    setDateRange, 
    onFetch, 
    loading,
    compareEnabled,
    setCompareEnabled,
    compareType,
    setCompareType,
    kolsList,
    selectedKolId,
    setSelectedKolId
}) => {
    const handlePresetSelect = (preset: string) => setDateRange(getPresetDateRange(preset));
    const handleRangeChange = (range: { from: Date; to: Date }) => setDateRange({ from: range.from, to: range.to});

    return (
        <div className="card p-6 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="md:col-span-2 lg:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Time Range</label>
                    <DateRangePicker value={dateRange} onChange={handleRangeChange} onPresetSelect={handlePresetSelect} />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">KOL Name</label>
                    <div className="relative">
                        <select
                            value={selectedKolId}
                            onChange={(e) => setSelectedKolId(e.target.value)}
                            className="w-full h-[42px] px-5 py-2 bg-white border border-[#bfdbfe]/50 rounded-full text-sm font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] transition-all appearance-none"
                        >
                            <option value="">All KOLs</option>
                            {kolsList.map((kol) => (
                                <option key={kol.id} value={kol.id}>
                                    {kol.name}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                </div>
                <div className="self-end">
                     <button onClick={onFetch} disabled={loading} className="w-full h-[42px] px-8 py-2 text-white font-semibold rounded-full hover:bg-[#1ea072] transition-all duration-200 bg-[var(--accent-color)] focus:outline-none focus:ring-1 focus:ring-offset-2 focus:ring-[var(--accent-color)] disabled:bg-slate-400 disabled:cursor-not-allowed text-sm">
                        {loading ? 'Loading...' : 'Get Performance'}
                    </button>
                </div>
            </div>

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
                                    ? 'bg-[var(--accent-color)] text-white border-[var(--accent-color)]' 
                                    : 'bg-white text-slate-600 border-[#bfdbfe]/50 hover:bg-slate-50'
                                }`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- DATA PROCESSING LOGIC ---
// --- DATA PROCESSING LOGIC ---
const processVideoData = async (videos: Video[], dateRange: DateRange): Promise<{ performanceData: VideoPerformanceData[] }> => {
    const videoIds = videos.map(v => v.id);
    if (videoIds.length === 0) return { performanceData: [] };

    // Use GMT+7 start and end of day
    const startStr = dateRange.from.toISOString();
    const endStr = toGmt7EndOfDay(dateRange.to).toISOString();

    const { data: metrics, error } = await supabaseClient.rpc('get_video_performance', {
        p_video_ids: videoIds,
        p_start_date: startStr,
        p_end_date: endStr
    });

    if (error) {
        console.error("RPC Error:", error);
        throw new Error(`Lỗi kéo data từ RPC: ${error.message}`);
    }

    const metricsMap = new Map<string, any>((metrics || []).map((m: any) => [m.video_id, m]));

    const performanceData = videos.map(video => {
        const metric = metricsMap.get(video.id) || { start_views: 0, end_views: 0 };
        const startViews = Number(metric.start_views);
        const endViews = Number(metric.end_views);
        const viewGrowth = endViews - startViews;
        const growthPercentage = startViews > 0 ? (viewGrowth / startViews) * 100 : (endViews > 0 ? Infinity : 0);

        return { ...video, startViews, endViews, viewGrowth, growthPercentage };
    });

    return { performanceData };
};
// --- UI COMPONENTS ---

const TopKolTable: React.FC<{ title: string; data: KolPerformanceData[]; dateRange: DateRange; showAll: boolean; onToggleShowAll: () => void; }> = ({ title, data, dateRange, showAll, onToggleShowAll }) => {
    const [expandedKolId, setExpandedKolId] = useState<string | null>(null);
    const { items: sortedData, requestSort, sortConfig } = useSortableData(data);

    const toggleKol = (kolId: string) => {
        setExpandedKolId(current => (current === kolId ? null : kolId));
    };

    if (data.length === 0) return null;
    const displayedData = showAll ? sortedData : sortedData.slice(0, 10);

    return (
    <div className="card p-6 overflow-x-auto w-full">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">{title}</h3>
        <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-[var(--header-blue)] font-bold uppercase">
                <tr>
                    <SortableHeader label="KOL" sortKey="kolName" currentSort={sortConfig} onSort={requestSort} />
                    <SortableHeader label={`Views (${formatDisplayDateGmt7(dateRange.from)})`} sortKey="startViews" currentSort={sortConfig} onSort={requestSort} align="right" />
                    <SortableHeader label={`Views (${formatDisplayDateGmt7(dateRange.to)})`} sortKey="endViews" currentSort={sortConfig} onSort={requestSort} align="right" />
                    <SortableHeader label="View Growth" sortKey="viewGrowth" currentSort={sortConfig} onSort={requestSort} align="right" />
                    <SortableHeader label="% Growth" sortKey="growthPercentage" currentSort={sortConfig} onSort={requestSort} align="right" />
                </tr>
            </thead>
            <tbody>
                {displayedData.map(kol => (
                    <React.Fragment key={kol.kolId}>
                        <tr onClick={() => toggleKol(kol.kolId)} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer">
                            <td className="px-4 py-3">
                                <KOLCell kol={kol.kolData} fallbackName={kol.kolName} />
                            </td>
                            <td className="px-4 py-3 text-right">{formatNumber(kol.startViews)}</td>
                            <td className="px-4 py-3 text-right">{formatNumber(kol.endViews)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatNumber(kol.viewGrowth)}</td>
                            <td className="px-4 py-3 text-right">{kol.growthPercentage === Infinity ? 'New' : `${kol.growthPercentage.toFixed(1)}%`}</td>
                        </tr>
                        {expandedKolId === kol.kolId && (
                             <tr>
                                <td colSpan={5} className="p-0 bg-emerald-50/30">
                                    <div className="p-4">
                                         <table className="w-full text-xs"><thead className="border-b border-emerald-200">
                                                 <tr>
                                                    <th className="px-2 py-2 text-left font-semibold">Video Title</th>
                                                    <th className="px-2 py-2 text-left font-semibold">Released</th>
                                                    <th className="px-2 py-2 text-right font-semibold">Views ({formatDisplayDateGmt7(dateRange.from)})</th>
                                                    <th className="px-2 py-2 text-right font-semibold">Views ({formatDisplayDateGmt7(dateRange.to)})</th>
                                                    <th className="px-2 py-2 text-right font-semibold">View Growth</th>
                                                    <th className="px-2 py-2 text-right font-semibold">% Growth</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {kol.videos.map(video => (
                                                    <tr key={video.id} className="border-b border-emerald-100 last:border-b-0">
                                                        <td className="px-2 py-2 font-medium text-slate-800 max-w-xs truncate">
                                                             <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-color)]" title={video.title || video.video_url}>
                                                                {video.title && typeof video.title === 'string' && video.title.trim() !== "" ? video.title : video.video_url}
                                                             </a>
                                                        </td>
                                                        <td className="px-2 py-2">{formatDisplayDateGmt7(utcInputStringToDate(video.released_date))}</td>
                                                        <td className="px-2 py-2 text-right">{formatNumber(video.startViews)}</td>
                                                        <td className="px-2 py-2 text-right">{formatNumber(video.endViews)}</td>
                                                        <td className="px-2 py-2 text-right font-semibold text-emerald-600">{formatNumber(video.viewGrowth)}</td>
                                                        <td className="px-2 py-2 text-right">{video.growthPercentage === Infinity ? 'New' : `${video.growthPercentage.toFixed(1)}%`}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                         </table>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </React.Fragment>
                ))}
            </tbody>
        </table>
        {data.length > 10 && (
            <div className="text-center mt-4">
                <button onClick={onToggleShowAll} className="text-sm text-slate-500 hover:text-slate-800 font-medium py-1 px-3">
                    {showAll ? 'Show Less' : 'Show More'}
                </button>
            </div>
        )}
    </div>
    )
};


const PerformanceTable: React.FC<{ title: string; data: VideoPerformanceData[]; dateRange: DateRange; onSeeTrendline: (video: Video) => void }> = ({ title, data, dateRange, onSeeTrendline }) => {
    const { items: sortedData, requestSort, sortConfig } = useSortableData(data);

    const isNew = (releasedDate: string) => {
        const startStr = getGmt7DateString(dateRange.from);
        const endStr = getGmt7DateString(dateRange.to);
        return releasedDate >= startStr && releasedDate <= endStr;
    };

    return (
    <div className="card p-6 overflow-x-auto w-full">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">{title}</h3>
        <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-[var(--header-blue)] font-bold uppercase">
                <tr>
                    <SortableHeader label="Video Title" sortKey="title" currentSort={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Released" sortKey="released_date" currentSort={sortConfig} onSort={requestSort} />
                    <SortableHeader label="KOL" sortKey="kols.name" currentSort={sortConfig} onSort={requestSort} />
                    <SortableHeader label={`Views (${formatDisplayDateGmt7(dateRange.from)})`} sortKey="startViews" currentSort={sortConfig} onSort={requestSort} align="right" />
                    <SortableHeader label={`Views (${formatDisplayDateGmt7(dateRange.to)})`} sortKey="endViews" currentSort={sortConfig} onSort={requestSort} align="right" />
                    <SortableHeader label="View Growth" sortKey="viewGrowth" currentSort={sortConfig} onSort={requestSort} align="right" />
                    <SortableHeader label="% Growth" sortKey="growthPercentage" currentSort={sortConfig} onSort={requestSort} align="right" />
                    <th scope="col" className="px-4 py-3 text-center">Action</th>
                </tr>
            </thead>
            <tbody>
                {sortedData.map(video => (
                    <tr key={video.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-900 max-w-xs">
                           <div className="flex items-center gap-2">
                               <div className="marquee-container">
                                   <div className="marquee-content">
                                       <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-color)]">
                                           {video.title && typeof video.title === 'string' && video.title.trim() !== "" ? video.title : video.video_url}
                                       </a>
                                   </div>
                               </div>
                               {isNew(video.released_date) && (
                                   <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded uppercase tracking-wider shrink-0">New</span>
                               )}
                           </div>
                        </td>
                        <td className="px-4 py-3">{formatDisplayDateGmt7(utcInputStringToDate(video.released_date))}</td><td className="px-4 py-3">{video.kols?.name || 'N/A'}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(video.startViews)}</td><td className="px-4 py-3 text-right">{formatNumber(video.endViews)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatNumber(video.viewGrowth)}</td>
                        <td className="px-4 py-3 text-right">{video.growthPercentage === Infinity ? 'New' : `${video.growthPercentage.toFixed(1)}%`}</td>
                        <td className="px-4 py-3 text-center"><button onClick={() => onSeeTrendline(video)} className="text-[var(--accent-color)] font-semibold hover:underline">See trendline</button></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
    );
};

const DetailedPerformanceModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    videos: VideoPerformanceData[];
    dateRange: DateRange;
}> = ({ isOpen, onClose, title, videos, dateRange }) => {
    const [loading, setLoading] = useState(false);
    const [allTrendlines, setAllTrendlines] = useState<TrendlineData[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const videoIds = videos.map(v => v.id);
            const minReleasedDate = videos.reduce((min, v) => v.released_date < min ? v.released_date : min, videos[0].released_date);
            
            const { data, error } = await supabaseClient
                .from('video_metrics')
                .select('video_id, recorded_at, view_count')
                .in('video_id', videoIds)
                .gte('recorded_at', `${minReleasedDate}T00:00:00Z`)
                .lte('recorded_at', toGmt7EndOfDay(dateRange.to).toISOString())
                .order('recorded_at');

            if (error) throw error;

            const grouped = videos.map(v => {
                const points = data
                    .filter(d => d.video_id === v.id && getGmt7DateString(d.recorded_at) >= v.released_date)
                    .map(d => ({
                        date: getGmt7DateString(d.recorded_at),
                        views: d.view_count
                    }));
                return {
                    videoId: v.id,
                    videoTitle: v.title,
                    points
                };
            });

            setAllTrendlines(grouped);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [videos, dateRange]);

    useEffect(() => {
        if (isOpen && videos.length > 0) {
            fetchData();
        }
    }, [isOpen, videos, fetchData]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-[#fcfcfc] rounded-2xl w-full max-w-[1600px] max-h-[90vh] overflow-hidden flex flex-col border border-[#bfdbfe]/50">
                <div className="p-6 border-b border-[#bfdbfe]/30 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
                        <p className="text-slate-500 text-sm">Detailed view growth from release date</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={24} className="text-slate-600" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader text="Generating detailed charts..." />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {allTrendlines.map(td => (
                                <TrendlineChart key={td.videoId} data={td} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TrendlineChart: React.FC<{ data: TrendlineData; onSeeFull?: () => void; isFull?: boolean; loadingFull?: boolean }> = ({ data, onSeeFull, isFull, loadingFull }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<any>(null);
    
    useEffect(() => {
        if (chartRef.current && data.points.length > 0) {
            if (!chartInstance.current) {
                chartInstance.current = echarts.init(chartRef.current);
            }
            const chart = chartInstance.current;
            const option = {
                tooltip: { 
                    trigger: 'axis',
                    backgroundColor: '#0f172a',
                    borderColor: 'transparent',
                    borderWidth: 0,
                    padding: [10, 14],
                    textStyle: { color: '#f1f5f9', fontSize: 12 },
                    formatter: (params: any[]) => {
                        const point = params[0];
                        return `<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${point.axisValueLabel}</div><div style="font-weight:700;font-size:14px;color:#fff">${formatNumber(point.value)} views</div>`;
                    }
                },
                xAxis: { 
                    type: 'category', 
                    data: data.points.map(p => formatDisplayDateGmt7(utcInputStringToDate(p.date))),
                    axisLine: { show: false },
                    axisTick: { show: false },
                    axisLabel: { color: '#94a3b8', fontSize: 10, interval: 'auto' },
                    boundaryGap: false,
                },
                yAxis: { 
                    type: 'value',
                    axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}` },
                    splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
                    axisLine: { show: false },
                    axisTick: { show: false },
                },
                series: [{ 
                    name: 'Views',
                    data: data.points.map(p => p.views), 
                    type: 'line', 
                    smooth: true, 
                    showSymbol: false,
                    lineStyle: { width: 2.5, color: '#10b981' },
                    areaStyle: { 
                        opacity: 0.12,
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#10b981' },
                            { offset: 1, color: '#ffffff' }
                        ])
                    },
                    emphasis: { disabled: true }
                }],
                grid: { left: 8, right: 16, bottom: 8, top: 8, containLabel: true },
            };
            chart.setOption(option); 
            
            const handleResize = () => chart.resize();
            window.addEventListener('resize', handleResize);
            return () => {
                window.removeEventListener('resize', handleResize);
            };
        }
    }, [data]);
    
    return (
        <div className="w-full">
            {data.points.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-slate-400 text-sm">No data points available</div>
            ) : (
                <div ref={chartRef} style={{ width: '100%', height: '220px' }} />
            )}
            <div className="mt-4 flex justify-center">
                {!isFull && onSeeFull && (
                    <button 
                        onClick={onSeeFull}
                        disabled={loadingFull}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-full transition-all disabled:opacity-60"
                    >
                        {loadingFull ? 'Loading history…' : 'See full history from release date'}
                    </button>
                )}
                {isFull && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-4 py-2 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                        Showing full history from release date
                    </span>
                )}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const InfluencerPerformance: React.FC = () => {
    const [dateRange, setDateRange] = useState<DateRange>(getPresetDateRange('This Month'));
    const [loading, setLoading] = useState(false);
    const [isTrendlineLoading, setIsTrendlineLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [kolsList, setKolsList] = useState<Kol[]>([]);
    const [selectedKolId, setSelectedKolId] = useState<string>('');
    const [rawCurrentData, setRawCurrentData] = useState<VideoPerformanceData[]>([]);
    const [rawPreviousData, setRawPreviousData] = useState<VideoPerformanceData[]>([]);
    const [prevDateRange, setPrevDateRange] = useState<DateRange | null>(null);
    const [trendlineData, setTrendlineData] = useState<TrendlineData | null>(null);
    const [showAllKols, setShowAllKols] = useState(false);
    const [compareEnabled, setCompareEnabled] = useState(false);
    const [compareType, setCompareType] = useState<CompareType>('previous_period');
    const [detailedModal, setDetailedModal] = useState<{ isOpen: boolean; title: string; videos: VideoPerformanceData[] }>({
        isOpen: false,
        title: '',
        videos: []
    });
    const [showMoreLegacy, setShowMoreLegacy] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [sidebarMounted, setSidebarMounted] = useState(false);
    const [selectedVideo, setSelectedVideo] = useState<VideoPerformanceData | null>(null);
    const [isFullTrendline, setIsFullTrendline] = useState(false);
    const [loadingFullTrendline, setLoadingFullTrendline] = useState(false);

    useEffect(() => {
        const fetchKols = async () => {
            const { data, error } = await supabaseClient
                .from('kols')
                .select('id, name')
                .order('name');
            if (!error && data) {
                setKolsList(data);
            }
        };
        fetchKols();
    }, []);

    const setSidebarState = (open: boolean) => {
        if (open) {
            // Mount first, then animate in on next frame
            setSidebarMounted(true);
            requestAnimationFrame(() => setIsSidebarOpen(true));
        } else {
            // Animate out, then unmount after transition completes
            setIsSidebarOpen(false);
            setTimeout(() => setSidebarMounted(false), 520);
        }
    };

    const handleSeeTrendline = useCallback(async (video: VideoPerformanceData, showFull = false) => {
        setIsTrendlineLoading(true); 
        if (!showFull) {
            setTrendlineData(null);
            setIsFullTrendline(false);
        } else {
            setLoadingFullTrendline(true);
            setIsFullTrendline(true);
        }
        
        setSelectedVideo(video);
        setSidebarState(true);

        try {
            let start = dateRange.from.toISOString();
            let end = toGmt7EndOfDay(dateRange.to).toISOString();

            if (showFull) {
                // If full, start from released_date to current time
                start = `${video.released_date}T00:00:00Z`;
                end = new Date().toISOString();
            }

            const { data, error } = await supabaseClient
                .from('video_metrics')
                .select('recorded_at, view_count')
                .eq('video_id', video.id)
                .gte('recorded_at', start)
                .lte('recorded_at', end)
                .order('recorded_at');

            if (error) throw new Error(`Failed to fetch trendline data: ${error.message}`);
            
            setTrendlineData({ 
                videoId: video.id, 
                videoTitle: video.title, 
                points: data.map(d => ({ date: getGmt7DateString(d.recorded_at), views: d.view_count })) 
            });
        } catch (err) { 
            console.error(err);
            setError('Failed to fetch trendline data.'); 
        } finally { 
            setIsTrendlineLoading(false); 
            setLoadingFullTrendline(false);
        }
    }, [dateRange]);

    const handleFetchData = useCallback(async () => {
        setLoading(true); setError(null); setTrendlineData(null); setRawCurrentData([]); setRawPreviousData([]); setPrevDateRange(null);
        try {
            let prevDateRangeVal: DateRange;
            
            if (compareEnabled) {
                switch (compareType) {
                    case 'previous_month': {
                        // Use GMT+7 based calculation
                        const from = new Date(dateRange.from);
                        from.setMonth(from.getMonth() - 1);
                        from.setDate(1);
                        
                        const to = new Date(from);
                        to.setMonth(to.getMonth() + 1);
                        to.setDate(0);
                        
                        prevDateRangeVal = { from, to };
                        break;
                    }
                    case 'previous_year': {
                        const from = new Date(dateRange.from);
                        from.setFullYear(from.getFullYear() - 1);
                        
                        const to = new Date(dateRange.to);
                        to.setFullYear(to.getFullYear() - 1);
                        
                        prevDateRangeVal = { from, to };
                        break;
                    }
                    default: { // previous_period
                        const duration = dateRange.to.getTime() - dateRange.from.getTime();
                        const to = new Date(dateRange.from.getTime() - 864e5);
                        const from = new Date(to.getTime() - duration);
                        prevDateRangeVal = { from, to };
                    }
                }
            } else {
                const duration = dateRange.to.getTime() - dateRange.from.getTime();
                const to = new Date(dateRange.from.getTime() - 864e5);
                const from = new Date(to.getTime() - duration);
                prevDateRangeVal = { from, to };
            }

            const { data: videos, error: videosError } = await supabaseClient.from('videos').select('*, kols(id, name)');
            if (videosError) throw new Error(`Failed to fetch videos: ${videosError.message}`);
            
            const typedVideos = videos as (Video & { kols: Kol })[];

            const [currentPeriodResult, previousPeriodResult] = await Promise.all([processVideoData(typedVideos, dateRange), processVideoData(typedVideos, prevDateRangeVal)]);
            setRawCurrentData(currentPeriodResult.performanceData);
            setRawPreviousData(previousPeriodResult.performanceData);
            setPrevDateRange(prevDateRangeVal);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch data.');
        } finally {
            setLoading(false);
        }
    }, [dateRange, compareEnabled, compareType]);

    const { filteredVideos, kolPerformance, overviewStats } = React.useMemo(() => {
        if (rawCurrentData.length === 0) {
            return { filteredVideos: [], kolPerformance: [], overviewStats: null };
        }
        
        const currentFiltered = selectedKolId 
            ? rawCurrentData.filter(v => v.kol_id === selectedKolId)
            : rawCurrentData;
            
        const previousFiltered = selectedKolId
            ? rawPreviousData.filter(v => v.kol_id === selectedKolId)
            : rawPreviousData;
            
        // --- Previous Period KOL Growth Aggregation ---
        const prevGrowthByKol = new Map<string, number>();
        previousFiltered.forEach(video => {
            const kolId = video.kols?.id;
            if (!kolId) return;
            const currentGrowth = prevGrowthByKol.get(kolId) || 0;
            prevGrowthByKol.set(kolId, currentGrowth + video.viewGrowth);
        });

        // --- Current Period KOL Aggregation Logic ---
        const performanceByKol = new Map<string, KolPerformanceData>();
        currentFiltered.forEach(video => {
            const kolId = video.kols?.id;
            const kolName = video.kols?.name || 'Unknown KOL';
            if (!kolId) return;

            if (!performanceByKol.has(kolId)) {
                performanceByKol.set(kolId, {
                    kolId, kolName, kolData: video.kols, startViews: 0, endViews: 0, viewGrowth: 0, growthPercentage: 0, videos: []
                });
            }
            const kolData = performanceByKol.get(kolId)!;
            kolData.startViews += video.startViews;
            kolData.endViews += video.endViews;
            kolData.viewGrowth += video.viewGrowth;
            kolData.videos.push(video);
        });

        const aggregatedKolData = Array.from(performanceByKol.values()).map(kol => {
            const prevGrowth = prevGrowthByKol.get(kol.kolId) || 0;
            return {
                ...kol,
                growthPercentage: calculatePercentageChange(kol.viewGrowth, prevGrowth),
                videos: kol.videos.sort((a, b) => b.viewGrowth - a.viewGrowth)
            };
        }).sort((a, b) => b.viewGrowth - a.viewGrowth);

        const calculateStats = (data: VideoPerformanceData[], range: DateRange) => {
            const startDateStr = getGmt7DateString(range.from);
            const endDateStr = getGmt7DateString(range.to);
            
            const newVids = data
                .filter(v => {
                    const releaseDateStr = getGmt7DateString(v.released_date);
                    return releaseDateStr >= startDateStr && releaseDateStr <= endDateStr;
                })
                .sort((a, b) => new Date(b.released_date).getTime() - new Date(a.released_date).getTime()); 
                
            const legacyVids = data
                .filter(v => {
                    const releaseDateStr = getGmt7DateString(v.released_date);
                    return releaseDateStr < startDateStr;
                })
                .sort((a, b) => b.viewGrowth - a.viewGrowth);
                
            const newVideoGrowth = newVids.reduce((sum, v) => sum + v.viewGrowth, 0); 
            const oldVideoGrowth = legacyVids.reduce((sum, v) => sum + v.viewGrowth, 0);
            return { 
                newVideos: newVids, 
                legacyVideos: legacyVids,
                totalGrowth: newVideoGrowth + oldVideoGrowth, 
                newVideoGrowth, 
                oldVideoGrowth 
            };
        };

        // Determine current prevDateRange
        let currentPrevDateRange = prevDateRange;
        if (!currentPrevDateRange) {
            const duration = dateRange.to.getTime() - dateRange.from.getTime();
            const to = new Date(dateRange.from.getTime() - 864e5);
            const from = new Date(to.getTime() - duration);
            currentPrevDateRange = { from, to };
        }

        const currentStats = calculateStats(currentFiltered, dateRange);
        const prevStats = calculateStats(previousFiltered, currentPrevDateRange);
        
        return {
            filteredVideos: currentFiltered,
            kolPerformance: aggregatedKolData,
            overviewStats: { current: currentStats, previous: prevStats, vsDateRange: currentPrevDateRange }
        };
    }, [rawCurrentData, rawPreviousData, selectedKolId, dateRange, prevDateRange]);

    const { recentVideos, topPerformingVideos } = React.useMemo(() => {
        const recentVids = [...filteredVideos].sort((a, b) => new Date(b.released_date).getTime() - new Date(a.released_date).getTime()).slice(0, 10);
        const topVids = [...filteredVideos].sort((a, b) => b.viewGrowth - a.viewGrowth).slice(0, 10);
        return { recentVideos: recentVids, topPerformingVideos: topVids };
    }, [filteredVideos]);

    return (
        <div className="relative min-h-screen bg-[#F8F9FA]">
            {/* Main Content Wrapper - Motion is controlled by App.tsx */}
            <div className="w-full">
                <div className="p-8 space-y-8 max-w-full mx-auto">
                    <Filters 
                        dateRange={dateRange} 
                        setDateRange={setDateRange} 
                        onFetch={handleFetchData} 
                        loading={loading}
                        compareEnabled={compareEnabled}
                        setCompareEnabled={setCompareEnabled}
                        compareType={compareType}
                        setCompareType={setCompareType}
                        kolsList={kolsList}
                        selectedKolId={selectedKolId}
                        setSelectedKolId={setSelectedKolId}
                    />
                    {loading && <Loader />}
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm animate-in fade-in duration-300" role="alert">{error}</div>}
                    {!loading && !error && overviewStats && (
                        <>
                            <div className="card p-8 space-y-8">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-slate-800">Performance Overview</h3>
                                    <div className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest border border-[#bfdbfe]/30">Live Metrics</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100/30">
                                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Total View Growth</p>
                                        <p className="text-4xl font-black text-emerald-700 mb-1">{formatNumber(overviewStats.current.totalGrowth)}</p>
                                        <ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.totalGrowth, overviewStats.previous.totalGrowth)} vsDateRange={overviewStats.vsDateRange} />
                                    </div>
                                    <div className="p-6 bg-white rounded-2xl border border-[#bfdbfe]/50">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Video Views</p>
                                        <p className="text-4xl font-black text-slate-800 mb-1">{formatNumber(overviewStats.current.newVideoGrowth)}</p>
                                        <ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.newVideoGrowth, overviewStats.previous.newVideoGrowth)} vsDateRange={overviewStats.vsDateRange} />
                                    </div>
                                    <div className="p-6 bg-white rounded-2xl border border-[#bfdbfe]/50">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Old Video Views</p>
                                        <p className="text-4xl font-black text-slate-800 mb-1">{formatNumber(overviewStats.current.oldVideoGrowth)}</p>
                                        <ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.oldVideoGrowth, overviewStats.previous.oldVideoGrowth)} vsDateRange={overviewStats.vsDateRange} />
                                    </div>
                                </div>
                                <div className="space-y-12 pt-4">
                                    <VideoTable 
                                        title="New Videos Released In Period"
                                        videos={overviewStats.current.newVideos}
                                        dateRange={dateRange}
                                        totalLabel="Line Total:"
                                        totalValue={overviewStats.current.newVideoGrowth}
                                        onSeeTrendline={handleSeeTrendline}
                                    />

                                    <VideoTable 
                                        title="Old videos Contribution"
                                        videos={overviewStats.current.legacyVideos}
                                        dateRange={dateRange}
                                        totalLabel="Line Total:"
                                        totalValue={overviewStats.current.oldVideoGrowth}
                                        onSeeTrendline={handleSeeTrendline}
                                        initialLimit={7}
                                        showStatus={true}
                                    />
                                </div>
                            </div>
                            <TopKolTable title="Top View by KOL" data={kolPerformance} dateRange={dateRange} showAll={showAllKols} onToggleShowAll={() => setShowAllKols(!showAllKols)} />
                            <PerformanceTable title="Top 10 Recent Videos" data={recentVideos} dateRange={dateRange} onSeeTrendline={handleSeeTrendline} />
                            <PerformanceTable title="Top 10 Performing Videos" data={topPerformingVideos} dateRange={dateRange} onSeeTrendline={handleSeeTrendline} />
                            
                            <DetailedPerformanceModal 
                                isOpen={detailedModal.isOpen}
                                onClose={() => setDetailedModal(prev => ({ ...prev, isOpen: false }))}
                                title={detailedModal.title}
                                videos={detailedModal.videos}
                                dateRange={dateRange}
                            />
                        </>
                    )}
                    {!loading && !error && !overviewStats && (
                        <div className="text-center py-24 card border-dashed border border-[#bfdbfe]/80 bg-white/50">
                            <div className="w-16 h-16 bg-[#F8F9FA] border border-[#bfdbfe]/40 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ArrowUpDown className="text-slate-400" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">No Data Selected</h3>
                            <p className="text-slate-500 mt-2 max-w-xs mx-auto">Select a date range and click "Get Performance" to view influencer data.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Premium Trendline Sidebar ─── */}
            {sidebarMounted && createPortal(
                <>
                    {/* Backdrop overlay */}
                    <div
                        onClick={() => setSidebarState(false)}
                        className={`fixed inset-0 bg-transparent backdrop-blur-[2px] z-[99] transition-opacity duration-500 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    />

                    {/* Sidebar panel */}
                    <div className={`fixed top-0 right-0 h-full w-[520px] bg-white z-[100] flex flex-col border-l border-[#bfdbfe]/50 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>

                        {/* ── Header ── */}
                        <div className="flex-none bg-slate-900 px-6 py-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Video Trendline</p>
                                    <h2 className="text-base font-bold text-white leading-snug line-clamp-2">
                                        {selectedVideo?.title || 'Loading…'}
                                    </h2>
                                    {selectedVideo && (
                                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                            {(() => {
                                                const platform = getPlatformTag(selectedVideo.video_url);
                                                return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${platform.color}`}>{platform.label}</span>;
                                            })()}
                                            <span className="text-[11px] text-slate-400">·</span>
                                            <span className="text-[11px] text-slate-400">{selectedVideo.kols?.name}</span>
                                            <span className="text-[11px] text-slate-400">·</span>
                                            <span className="text-[11px] text-slate-400">{formatDisplayDateGmt7(utcInputStringToDate(selectedVideo.released_date))}</span>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => setSidebarState(false)}
                                    className="flex-none mt-0.5 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* ── View Growth Badge ── */}
                        {selectedVideo && (
                            <div className="flex-none px-6 py-3 border-b border-[#bfdbfe]/30 bg-slate-50/50 flex items-center justify-between">
                                <span className="text-xs text-slate-500 font-medium">View Growth (selected period)</span>
                                <span className="text-sm font-black text-emerald-600">+{formatNumber(selectedVideo.viewGrowth)}</span>
                            </div>
                        )}

                        {/* ── Scrollable Body ── */}
                        <div className="flex-1 overflow-y-auto">

                            {/* Chart section */}
                            <div className="px-6 pt-5 pb-2">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">View Count Over Time</p>
                                </div>

                                {isTrendlineLoading ? (
                                    <div className="h-56 flex flex-col items-center justify-center gap-3">
                                        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                        <p className="text-xs text-slate-400 font-medium">Analyzing trends…</p>
                                    </div>
                                ) : trendlineData ? (
                                    <TrendlineChart
                                        data={trendlineData}
                                        onSeeFull={() => selectedVideo && handleSeeTrendline(selectedVideo, true)}
                                        isFull={isFullTrendline}
                                        loadingFull={loadingFullTrendline}
                                    />
                                ) : (
                                    <div className="h-56 flex flex-col items-center justify-center gap-2 text-center">
                                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                                            <ArrowUp className="text-slate-300" size={20} />
                                        </div>
                                        <p className="text-sm font-semibold text-slate-600">No chart data</p>
                                        <p className="text-xs text-slate-400">Could not load trendline data.</p>
                                    </div>
                                )}
                                                    {/* Divider */}
                            <div className="mx-6 my-3 border-t border-[#bfdbfe]/30" />

                            {/* Video details */}
                            {selectedVideo && (
                                <div className="px-6 pb-6 space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Video Details</p>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-[#F8F9FA] rounded-xl p-3.5 border border-[#bfdbfe]/40">
                                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Platform</p>
                                            {(() => {
                                                const platform = getPlatformTag(selectedVideo.video_url);
                                                return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${platform.color}`}>{platform.label}</span>;
                                            })()}
                                        </div>
                                        <div className="bg-[#F8F9FA] rounded-xl p-3.5 border border-[#bfdbfe]/40">
                                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">KOL</p>
                                            <p className="text-sm font-bold text-slate-800 truncate">{selectedVideo.kols?.name || '—'}</p>
                                        </div>
                                        <div className="bg-[#F8F9FA] rounded-xl p-3.5 border border-[#bfdbfe]/40">
                                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Released</p>
                                            <p className="text-sm font-bold text-slate-800">{formatDisplayDateGmt7(utcInputStringToDate(selectedVideo.released_date))}</p>
                                        </div>
                                        <div className="bg-emerald-50 rounded-xl p-3.5 border border-emerald-100/50">
                                            <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">View Growth</p>
                                            <p className="text-sm font-black text-emerald-700">+{formatNumber(selectedVideo.viewGrowth)}</p>
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <a
                                            href={selectedVideo.video_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex w-full items-center justify-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-full transition-all border border-[#bfdbfe]/30"
                                        >
                                            Open Video ↗
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </>
            , document.body) }
        </div>
    );
};

export default InfluencerPerformance;
