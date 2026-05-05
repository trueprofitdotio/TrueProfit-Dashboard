import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabaseClient } from '../services/supabaseClient';
import { DateRange, Video, VideoPerformanceData, TrendlineData, Kol, OverviewStats } from '../types';
import DateRangePicker from './DateRangePicker';
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
    // 1. Ưu tiên dùng field status từ database (Healthy, Stalled, Possibly Unlisted)
    const dbStatus = video.status;
    if (dbStatus && dbStatus !== 'Active') {
        switch (dbStatus) {
            case 'Healthy': return { label: 'Healthy', color: 'bg-emerald-100 text-emerald-700' };
            case 'Stalled': return { label: 'Stalled', color: 'bg-amber-100 text-amber-700' };
            case 'Possibly Unlisted': return { label: 'Possibly Unlisted', color: 'bg-red-100 text-red-700' };
            default: break; 
        }
    }

    // 2. Fallback logic tính toán (giữ lại logic cũ phòng hờ status chưa sync)
    if (!video.video_url || video.video_url.trim() === '') {
        return { label: 'Possibly Unlisted', color: 'bg-red-100 text-red-700' };
    }

    if (video.video_url.includes('youtube.com') || video.video_url.includes('youtu.be')) {
        const id = extractYoutubeId(video.video_url);
        if (!id) return { label: 'Possibly Unlisted', color: 'bg-red-100 text-red-700' };
    } else if (!video.video_url.includes('tiktok.com') && !video.video_url.includes('x.com') && !video.video_url.includes('instagram.com') && !video.video_url.includes('twitter.com')) {
        if (!video.video_url.startsWith('http')) return { label: 'Possibly Unlisted', color: 'bg-red-100 text-red-700' };
    }

    if (video.viewGrowth > 0) return { label: 'Healthy', color: 'bg-emerald-100 text-emerald-700' };
    if (video.viewGrowth === 0) return { label: 'Stalled', color: 'bg-amber-100 text-amber-700' };
    return { label: 'Healthy', color: 'bg-emerald-100 text-emerald-700' };
};

const utcInputStringToDate = (dateString: string): Date => new Date(`${dateString}T00:00:00.000Z`);

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
                                        {v.title && v.title.trim() !== "" ? v.title : v.video_url}
                                    </a>
                                </td>
                                <td className="px-4 py-3">
                                    {(() => {
                                        const platform = getPlatformTag(v.video_url);
                                        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${platform.color}`}>{platform.label}</span>;
                                    })()}
                                </td>
                                <td className="px-4 py-3 truncate" title={v.kols.name}>{v.kols.name}</td>
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
}

const Filters: React.FC<FiltersProps> = ({ 
    dateRange, 
    setDateRange, 
    onFetch, 
    loading,
    compareEnabled,
    setCompareEnabled,
    compareType,
    setCompareType
}) => {
    const handlePresetSelect = (preset: string) => setDateRange(getPresetDateRange(preset));
    const handleRangeChange = (range: { from: Date; to: Date }) => setDateRange({ from: range.from, to: range.to});

    return (
        <div className="card p-6 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Time Range</label>
                    <DateRangePicker value={dateRange} onChange={handleRangeChange} onPresetSelect={handlePresetSelect} />
                </div>
                <div className="self-end">
                     <button onClick={onFetch} disabled={loading} className="w-full h-[42px] px-8 py-2.5 text-white font-semibold shadow-sm primary-btn bg-[var(--accent-color)] focus:outline-none focus:ring-1 focus:ring-offset-2 focus:ring-[var(--accent-color)] disabled:bg-slate-400 disabled:cursor-not-allowed">
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

    const metricsMap = new Map(metrics.map((m: { video_id: string; [key: string]: unknown }) => [m.video_id, m]));

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
                            <td className="px-4 py-3 font-medium text-slate-900">{kol.kolName}</td>
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
                                                             <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-color)]" title={video.title}>{video.title}</a>
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
                               <div className="marquee-container"><div className="marquee-content"><a href={video.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-color)]">{video.title}</a></div></div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-[1600px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
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
                title: { 
                    text: data.videoTitle, 
                    left: 'center', 
                    textStyle: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
                    padding: [0, 0, 20, 0]
                },
                tooltip: { 
                    trigger: 'axis',
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    textStyle: { color: '#475569' },
                    formatter: (params: any[]) => {
                        const point = params[0];
                        return `<div className="p-1">
                            <div className="text-xs text-slate-500 mb-1">${point.axisValueLabel}</div>
                            <div className="font-bold text-slate-800">Views: ${formatNumber(point.value)}</div>
                        </div>`;
                    }
                },
                xAxis: { 
                    type: 'category', 
                    data: data.points.map(p => formatDisplayDateGmt7(utcInputStringToDate(p.date))),
                    axisLine: { lineStyle: { color: '#e2e8f0' } },
                    axisLabel: { color: '#64748b', fontSize: 10 }
                },
                yAxis: { 
                    type: 'value', 
                    name: 'View Count',
                    axisLabel: { color: '#64748b', fontSize: 10 },
                    splitLine: { lineStyle: { color: '#f1f5f9' } }
                },
                series: [{ 
                    name: 'Views',
                    data: data.points.map(p => p.views), 
                    type: 'line', 
                    smooth: true, 
                    showSymbol: false,
                    lineStyle: { width: 3, color: '#10b981' },
                    areaStyle: { 
                        opacity: 0.1,
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: '#10b981' },
                            { offset: 1, color: '#ffffff' }
                        ])
                    },
                    emphasis: { disabled: true }
                }],
                grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
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
        <div className="card p-6 min-h-[500px] flex flex-col">
            <div ref={chartRef} style={{ width: '100%', height: '400px' }} className="flex-1"></div>
            <div className="flex justify-center mt-6">
                {!isFull && onSeeFull && (
                    <button 
                        onClick={onSeeFull}
                        disabled={loadingFull}
                        className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-6 py-2.5 rounded-full font-bold transition-all flex items-center gap-2 border border-emerald-100 shadow-sm"
                    >
                        {loadingFull ? (
                            <>
                                <Loader text="" />
                                <span>Fetching full history...</span>
                            </>
                        ) : (
                            'See full video\'s view trendline'
                        )}
                    </button>
                )}
                {isFull && (
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-bold uppercase tracking-widest border border-slate-200">Viewing Full Trendline</span>
                        <p className="text-[10px] text-slate-400 font-medium">All data from release date to current time</p>
                    </div>
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
    const [allVideos, setAllVideos] = useState<VideoPerformanceData[]>([]);
    const [kolPerformance, setKolPerformance] = useState<KolPerformanceData[]>([]);
    const [trendlineData, setTrendlineData] = useState<TrendlineData | null>(null);
    const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
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
    const [selectedVideo, setSelectedVideo] = useState<VideoPerformanceData | null>(null);
    const [isFullTrendline, setIsFullTrendline] = useState(false);
    const [loadingFullTrendline, setLoadingFullTrendline] = useState(false);

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
        setIsSidebarOpen(true);

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
        setLoading(true); setError(null); setTrendlineData(null); setAllVideos([]); setOverviewStats(null); setKolPerformance([]);
        try {
            let prevDateRange: DateRange;
            
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
                        
                        prevDateRange = { from, to };
                        break;
                    }
                    case 'previous_year': {
                        const from = new Date(dateRange.from);
                        from.setFullYear(from.getFullYear() - 1);
                        
                        const to = new Date(dateRange.to);
                        to.setFullYear(to.getFullYear() - 1);
                        
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

            const { data: videos, error: videosError } = await supabaseClient.from('videos').select('*, kols(id, name)');
            if (videosError) throw new Error(`Failed to fetch videos: ${videosError.message}`);
            
            const typedVideos = videos as (Video & { kols: Kol })[];

            const [currentPeriodResult, previousPeriodResult] = await Promise.all([processVideoData(typedVideos, dateRange), processVideoData(typedVideos, prevDateRange)]);
            setAllVideos(currentPeriodResult.performanceData);
            
            // --- Previous Period KOL Growth Aggregation ---
            const prevGrowthByKol = new Map<string, number>();
            previousPeriodResult.performanceData.forEach(video => {
                const kolId = video.kols?.id;
                if (!kolId) return;
                const currentGrowth = prevGrowthByKol.get(kolId) || 0;
                prevGrowthByKol.set(kolId, currentGrowth + video.viewGrowth);
            });

            // --- Current Period KOL Aggregation Logic ---
            const performanceByKol = new Map<string, KolPerformanceData>();
            currentPeriodResult.performanceData.forEach(video => {
                const kolId = video.kols?.id;
                const kolName = video.kols?.name || 'Unknown KOL';
                if (!kolId) return;

                if (!performanceByKol.has(kolId)) {
                    performanceByKol.set(kolId, {
                        kolId, kolName, startViews: 0, endViews: 0, viewGrowth: 0, growthPercentage: 0, videos: []
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

            setKolPerformance(aggregatedKolData);
            
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
            const currentStats = calculateStats(currentPeriodResult.performanceData, dateRange); const prevStats = calculateStats(previousPeriodResult.performanceData, prevDateRange);
            setOverviewStats({ current: currentStats, previous: prevStats, vsDateRange: prevDateRange });
        } catch { setError('Failed to fetch data.'); } finally { setLoading(false); }
    }, [dateRange, compareEnabled, compareType]);
    
    // handleFetchData removed from here as it's modified below
    
    // RE-INSERT handleFetchData because I overwrote it in my thought process or need to ensure it's there
    // Actually I'll just use one large replacement for the return block and sidebar

    const { recentVideos, topPerformingVideos } = React.useMemo(() => {
        const recentVids = [...allVideos].sort((a, b) => new Date(b.released_date).getTime() - new Date(a.released_date).getTime()).slice(0, 10);
        const topVids = [...allVideos].sort((a, b) => b.viewGrowth - a.viewGrowth).slice(0, 10);
        return { recentVideos: recentVids, topPerformingVideos: topVids };
    }, [allVideos]);

    return (
        <div className="relative min-h-screen bg-slate-50/50">
            {/* Main Content Wrapper - This is what slides */}
            <div className={`transition-transform duration-500 ease-in-out ${isSidebarOpen ? '-translate-x-[640px]' : 'translate-x-0'}`}>
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
                    />
                    {loading && <Loader />}
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl shadow-sm animate-in fade-in duration-300" role="alert">{error}</div>}
                    {!loading && !error && overviewStats && (
                        <>
                            <div className="card p-8 space-y-8 shadow-sm border-slate-100">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-slate-800">Performance Overview</h3>
                                    <div className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Metrics</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
                                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Total View Growth</p>
                                        <p className="text-4xl font-black text-emerald-700 mb-1">{formatNumber(overviewStats.current.totalGrowth)}</p>
                                        <ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.totalGrowth, overviewStats.previous.totalGrowth)} vsDateRange={overviewStats.vsDateRange} />
                                    </div>
                                    <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Video Views</p>
                                        <p className="text-4xl font-black text-slate-800 mb-1">{formatNumber(overviewStats.current.newVideoGrowth)}</p>
                                        <ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.newVideoGrowth, overviewStats.previous.newVideoGrowth)} vsDateRange={overviewStats.vsDateRange} />
                                    </div>
                                    <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
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
                        <div className="text-center py-24 card border-dashed border-2 border-slate-200 bg-white/50">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <ArrowUpDown className="text-slate-400" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700">No Data Selected</h3>
                            <p className="text-slate-500 mt-2 max-w-xs mx-auto">Select a date range and click "Get Performance" to view influencer data.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Sidebar for Trendline - Fixed and outside the sliding wrapper */}
            <div 
                className={`fixed top-0 right-0 h-full w-[640px] bg-white shadow-[-20px_0_40px_rgba(0,0,0,0.1)] border-l border-slate-100 z-[100] transform transition-transform duration-500 ease-in-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <div className="h-full flex flex-col">
                    <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                        <div className="flex flex-col">
                            <h3 className="text-xl font-bold text-slate-800">Video Trendline</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Performance Analytics</p>
                        </div>
                        <button 
                            onClick={() => setIsSidebarOpen(false)}
                            className="p-2.5 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-slate-800 hover:rotate-90"
                        >
                            <X size={24} />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {isTrendlineLoading && !trendlineData ? (
                            <div className="h-full flex flex-col items-center justify-center">
                                <Loader text="Analyzing trends..." />
                            </div>
                        ) : trendlineData ? (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <TrendlineChart 
                                    data={trendlineData} 
                                    onSeeFull={() => selectedVideo && handleSeeTrendline(selectedVideo, true)}
                                    isFull={isFullTrendline}
                                    loadingFull={loadingFullTrendline}
                                />
                                {selectedVideo && (
                                    <div className="mt-6 p-6 rounded-2xl bg-slate-50 border border-slate-100">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Video Details</h4>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-slate-500">Platform</span>
                                                {(() => {
                                                    const platform = getPlatformTag(selectedVideo.video_url);
                                                    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${platform.color}`}>{platform.label}</span>;
                                                })()}
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-slate-500">KOL</span>
                                                <span className="text-sm font-bold text-slate-700">{selectedVideo.kols?.name}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-slate-500">Released</span>
                                                <span className="text-sm font-bold text-slate-700">{formatDisplayDateGmt7(utcInputStringToDate(selectedVideo.released_date))}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                                                <span className="text-sm text-slate-500">View Growth</span>
                                                <span className="text-sm font-black text-emerald-600">+{formatNumber(selectedVideo.viewGrowth)}</span>
                                            </div>
                                        </div>
                                        <div className="mt-6">
                                            <a 
                                                href={selectedVideo.video_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                                            >
                                                Open Video
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center px-12">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100">
                                        <ArrowUp className="text-slate-300" size={24} />
                                    </div>
                                </div>
                                <h4 className="text-lg font-bold text-slate-800 mb-2">No Video Selected</h4>
                                <p className="text-sm text-slate-500 leading-relaxed">
                                    Click on "See trendline" in any table to visualize the view count growth over time.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InfluencerPerformance;
