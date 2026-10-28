import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabaseClient } from '../services/supabaseClient';
import { DateRange, Video, VideoPerformanceData, TrendlineData, Kol, OverviewStats } from '../types';
import DateRangePicker from './DateRangePicker';
import KOLCell from './KOLCell';
import { PALETTE, CHART_INK, CHART_FONT } from '../constants';
import { 
    getPresetDateRange, 
    formatDisplayDateGmt7, 
    toGmt7EndOfDay,
    getGmt7DateString,
    calculatePercentageChange
} from '../utils/timeHelper';

declare const echarts: {
    init: (el: HTMLElement) => {
        setOption: (option: object, notMerge?: boolean) => void;
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
    /** The same measure over the period immediately before this one. */
    prevViewGrowth?: number;
    growthPercentage: number;
    videos: VideoPerformanceData[];
}

// --- UTILITY & HELPER COMPONENTS ---
const Loader: React.FC<{ text?: string }> = ({ text }) => (
    <div className="flex flex-col justify-center items-center p-8 space-y-4">
        <div className="w-16 h-16 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div>
        {text && <p className="text-[var(--tp-accent-ink)] animate-pulse">{text}</p>}
    </div>
);

const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

const getPlatformTag = (url: string) => {
    if (!url) return { label: 'Unknown', color: 'bg-[var(--tp-surface-sunken)] text-[var(--tp-muted)]' };
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return { label: 'YouTube', color: 'tp-chip' };
    if (lowerUrl.includes('tiktok.com')) return { label: 'TikTok', color: 'bg-[var(--tp-ink)] text-white' };
    if (lowerUrl.includes('x.com') || lowerUrl.includes('twitter.com')) return { label: 'X', color: 'bg-[var(--tp-surface-hover)] text-[var(--tp-ink)]' };
    if (lowerUrl.includes('instagram.com')) return { label: 'Instagram', color: 'bg-[var(--tp-accent-soft)] text-[var(--tp-accent-ink)]' };
    return { label: 'Social', color: 'bg-[var(--tp-info-soft)] text-[var(--tp-info)]' };
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
        return { label: 'Unlisted', color: 'bg-[var(--tp-danger-soft)] text-[var(--tp-danger)]' };
    }

    // Default to HEALTHY for all other cases (Active, Healthy, etc.)
    return { label: 'Healthy', color: 'bg-[var(--tp-accent-field)] text-[var(--tp-accent-ink)]' };
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

/* The period-over-period change on a single growth figure.

   Deliberately quiet: it rides beside the number it qualifies, never
   replaces it, and it carries an arrow so the direction does not depend on
   anyone seeing the colour. A video with no measured previous period reads
   "new" rather than "+100%", which would be arithmetic on nothing. */
export const GrowthDelta: React.FC<{ current: number; previous: number; className?: string }> = ({ current, previous, className = '' }) => {
    if (!previous) {
        if (!current) return null;
        return <span className={`text-[10.5px] font-medium text-[var(--tp-pen)] ${className}`}>new</span>;
    }
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    if (!isFinite(pct) || Math.round(pct * 10) === 0) {
        return <span className={`text-[10.5px] text-[var(--tp-meta)] ${className}`}>0%</span>;
    }
    const up = pct > 0;
    const Icon = up ? ArrowUp : ArrowDown;
    return (
        <span
            className={`inline-flex items-center gap-0.5 text-[10.5px] font-medium ${up ? 'text-[var(--tp-positive)]' : 'text-[var(--tp-danger)]'} ${className}`}
            title={`${formatNumber(current)} this period vs ${formatNumber(previous)} in the period before`}
        >
            <Icon className="h-2.5 w-2.5 shrink-0" strokeWidth={3} aria-hidden="true" />
            {Math.abs(pct).toFixed(0)}%
        </span>
    );
};

const ChangeIndicatorText: React.FC<{ value: number; vsDateRange: DateRange }> = ({ value, vsDateRange }) => {
    if (value === 0 || isNaN(value) || !isFinite(value)) return <span className="text-sm text-[var(--tp-muted)]">— vs previous period</span>;
    const isPositive = value > 0;
    const color = isPositive ? 'text-[var(--tp-positive)]' : 'text-[var(--tp-danger)]';
    const sign = isPositive ? '+' : '';
    const formattedDateRange = `vs ${formatDisplayDateGmt7(vsDateRange.from)} to ${formatDisplayDateGmt7(vsDateRange.to)}`;
    const Icon = isPositive ? ArrowUp : ArrowDown;
    // The arrow is not decoration: direction may never be carried by colour
    // alone. Its affiliate twin has always had one; this one did not.
    return (
        <span className={`inline-flex items-baseline gap-1 text-[11.5px] font-medium ${color}`}>
            <Icon className="h-3 w-3 shrink-0 self-center" strokeWidth={2.5} aria-hidden="true" />
            <span className="tp-num">{sign}{value.toFixed(1)}%</span>
            <span className="font-normal text-[var(--tp-meta)]">{formattedDateRange}</span>
        </span>
    );
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
            className={`px-4 py-3 cursor-pointer hover:bg-[var(--tp-surface-hover)] transition-colors group ${className} text-${align}`}
            onClick={() => onSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
                {label}
                <span className="text-[var(--tp-meta)]">
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
                    <h4 className="text-md font-semibold text-[var(--tp-ink-2)]">{title}</h4>
                </div>
                <p className="text-center text-[var(--tp-muted)] py-4">No videos found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h4 className="text-md font-semibold text-[var(--tp-ink-2)]">{title}</h4>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-[var(--tp-muted)] table-fixed">
                    <thead className="text-xs text-[var(--header-blue)] font-semibold bg-[var(--tp-surface-sunken)]">
                        <tr>
                            <SortableHeader label="Video title" sortKey="title" currentSort={sortConfig} onSort={requestSort} className="w-[20%]" />
                            <SortableHeader label="Channel" sortKey="video_url" currentSort={sortConfig} onSort={requestSort} className="w-[8%]" />
                            <SortableHeader label="KOL" sortKey="kols.name" currentSort={sortConfig} onSort={requestSort} className="w-[11%]" />
                            <SortableHeader label="Released" sortKey="released_date" currentSort={sortConfig} onSort={requestSort} className="w-[9%]" />
                            <SortableHeader label={`Views ${formatDisplayDateGmt7(dateRange.from, { month: 'short', day: 'numeric' })}`} sortKey="startViews" currentSort={sortConfig} onSort={requestSort} align="right" className="w-[11%]" />
                            <SortableHeader label={`Views ${formatDisplayDateGmt7(dateRange.to, { month: 'short', day: 'numeric' })}`} sortKey="endViews" currentSort={sortConfig} onSort={requestSort} align="right" className="w-[11%]" />
                            <SortableHeader label="View growth" sortKey="viewGrowth" currentSort={sortConfig} onSort={requestSort} align="right" className="w-[10%]" />
                            {showStatus && <th className="px-4 py-3 text-center w-[10%]">Status</th>}
                            <th className="px-4 py-3 text-center w-[10%]">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayedVideos.map(v => (
                            <tr key={v.id} className="border-b border-[var(--tp-rule)] hover:bg-[var(--tp-surface-sunken)]">
                                <td className="px-4 py-3 font-medium truncate" title={v.title || v.video_url}>
                                    <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--tp-accent-ink)]">
                                        {v.title && typeof v.title === 'string' && v.title.trim() !== "" ? v.title : v.video_url}
                                    </a>
                                </td>
                                <td className="px-4 py-3">
                                    {(() => {
                                        const platform = getPlatformTag(v.video_url);
                                        return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${platform.color}`}>{platform.label}</span>;
                                    })()}
                                </td>
                                <td className="px-4 py-3 truncate" title={v.kols?.name || 'Unknown'}>{v.kols?.name || 'Unknown'}</td>
                                <td className="px-4 py-3">{formatDisplayDateGmt7(utcInputStringToDate(v.released_date))}</td>
                                <td className="px-4 py-3 text-right">{formatNumber(v.startViews)}</td>
                                <td className="px-4 py-3 text-right">{formatNumber(v.endViews)}</td>
                                <td className="px-4 py-3 text-right">
                                    <span className="inline-flex items-baseline justify-end gap-1.5">
                                        <span className="tp-num font-semibold text-[var(--tp-ink)]">{formatNumber(v.viewGrowth)}</span>
                                        <GrowthDelta current={v.viewGrowth} previous={v.prevViewGrowth ?? 0} />
                                    </span>
                                </td>
                                {showStatus && (
                                    <td className="px-4 py-3 text-center">
                                        {(() => {
                                            const status = getVideoStatus(v);
                                            return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${status.color}`}>{status.label}</span>;
                                        })()}
                                    </td>
                                )}
                                <td className="px-4 py-3 text-center">
                                    <button onClick={() => onSeeTrendline(v)} className="text-[var(--tp-accent-ink)] font-semibold hover:underline text-xs">
                                        See trendline
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {totalLabel && (
                        <tfoot>
                            <tr className="bg-[var(--tp-surface-sunken)] font-semibold text-[var(--tp-ink-2)]">
                                <td colSpan={showStatus ? 7 : 6} className="px-4 py-3 text-right">{totalLabel}</td>
                                <td className="px-4 py-3 text-right text-[var(--tp-ink)]">{formatNumber(totalValue || 0)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
                {initialLimit && videos.length > initialLimit && (
                    <div className="flex justify-center mt-4">
                        <button 
                            onClick={() => setShowAll(!showAll)}
                            className="text-sm font-semibold text-[var(--tp-accent-ink)] hover:underline flex items-center gap-1"
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
        <div className="influencer-filters card p-6 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="md:col-span-2 lg:col-span-2">
                    <label className="tp-field-label">Time range</label>
                    <DateRangePicker value={dateRange} onChange={handleRangeChange} onPresetSelect={handlePresetSelect} />
                </div>
                <div>
                    <label className="tp-field-label">KOL</label>
                    <div className="relative">
                        <select
                            value={selectedKolId}
                            onChange={(e) => setSelectedKolId(e.target.value)}
                            data-filter-select
                            className="filter-select tp-filter-trigger w-full appearance-none pr-9 text-[13px]"
                        >
                            <option value="">All KOLs</option>
                            {kolsList.map((kol) => (
                                <option key={kol.id} value={kol.id}>
                                    {kol.name}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[var(--tp-faint)]">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                </div>
                <div className="self-end">
                     <button onClick={onFetch} disabled={loading} className="primary-btn h-10 w-full rounded-[3px] bg-[var(--accent-color)] px-6 text-[13px] font-semibold text-[var(--tp-on-accent)]">
                        {loading ? 'Loading…' : 'Get performance'}
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
                        <div className="h-[18px] w-[18px] rounded-[4px] border border-[var(--tp-rule-strong)] transition-all peer-checked:border-[var(--accent-color)] peer-checked:bg-[var(--accent-color)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--tp-accent-soft)]"></div>
                        <svg className="absolute left-[2px] h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-[var(--tp-ink-2)] group-hover:text-[var(--tp-ink)] transition-colors">Compare with specific period</span>
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
                                    ? 'bg-[var(--accent-color)] text-[var(--tp-on-accent)] border-[var(--accent-color)]' 
                                    : 'bg-white text-[var(--tp-muted)] border-[var(--tp-rule-panel)]/50 hover:bg-[var(--tp-surface-sunken)]'
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


/* Growth between the first and last reading inside a window. Reading the
   edges rather than summing deltas means a gap in the recording schedule
   cannot invent or swallow views. */
const growthWithin = (history: { at: Date; views: number }[], from?: Date, to?: Date) => {
    const inWindow = from && to
        ? history.filter(pt => pt.at >= from && pt.at <= to)
        : history;
    if (inWindow.length < 2) return inWindow.length === 1 ? 0 : 0;
    return inWindow[inWindow.length - 1].views - inWindow[0].views;
};

/** Monday of the GMT+7 week a moment falls in. */
const weekStart = (d: Date) => {
    const local = new Date(d.getTime() + 7 * 3600_000);
    const day = (local.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day));
    return new Date(monday.getTime() - 7 * 3600_000);
};

/* Week-by-week growth across the whole tracked life of a video.

   Deliberately independent of the dashboard's date filter: this answers
   "how has this video behaved since we started watching it", which is a
   different question from "what did it do in the range I selected", and
   folding the filter into it would make the two impossible to tell apart. */
const weeklyGrowth = (history: { at: Date; views: number }[]) => {
    if (history.length < 2) return [];
    const byWeek = new Map<number, { start: Date; first: number; last: number }>();
    history.forEach(pt => {
        const ws = weekStart(pt.at);
        const key = ws.getTime();
        const bucket = byWeek.get(key);
        if (!bucket) byWeek.set(key, { start: ws, first: pt.views, last: pt.views });
        else bucket.last = pt.views;
    });

    const weeks = Array.from(byWeek.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
    // A week's growth is measured against the previous week's close, so views
    // added between two recordings are never dropped on the boundary.
    return weeks.map((w, i) => ({
        start: w.start,
        views: w.last,
        growth: i === 0 ? w.last - w.first : w.last - weeks[i - 1].last,
    }));
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
    <div className="card tp-sheet-flush w-full">
        <div className="tp-sheet-head"><h3>{title}</h3></div>
        <div className="tp-table-scroll">
        <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--header-blue)] font-semibold">
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
                        <tr onClick={() => toggleKol(kol.kolId)} className="border-b border-[var(--tp-rule)] hover:bg-[var(--tp-surface-sunken)]/50 cursor-pointer">
                            <td className="px-4 py-3">
                                <KOLCell kol={kol.kolData} fallbackName={kol.kolName} />
                            </td>
                            <td className="px-4 py-3 text-right">{formatNumber(kol.startViews)}</td>
                            <td className="px-4 py-3 text-right">{formatNumber(kol.endViews)}</td>
                            <td className="px-4 py-3 text-right">
                                <span className="inline-flex items-baseline justify-end gap-1.5">
                                    <span className="tp-num font-semibold text-[var(--tp-ink)]">{formatNumber(kol.viewGrowth)}</span>
                                    <GrowthDelta current={kol.viewGrowth} previous={kol.prevViewGrowth ?? 0} />
                                </span>
                            </td>
                            <td className="px-4 py-3 text-right">{kol.growthPercentage === Infinity ? 'New' : `${kol.growthPercentage.toFixed(1)}%`}</td>
                        </tr>
                        {expandedKolId === kol.kolId && (
                             <tr>
                                <td colSpan={5} className="p-0 bg-[#f7f8fe]">
                                    <div className="p-4">
                                         <table className="w-full text-xs"><thead className="border-b border-[var(--tp-accent-rule)]">
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
                                                    <tr key={video.id} className="border-b border-[var(--tp-rule)] last:border-b-0">
                                                        <td className="px-2 py-2 font-medium text-[var(--tp-ink)] max-w-xs truncate">
                                                             <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--tp-accent-ink)]" title={video.title || video.video_url}>
                                                                {video.title && typeof video.title === 'string' && video.title.trim() !== "" ? video.title : video.video_url}
                                                             </a>
                                                        </td>
                                                        <td className="px-2 py-2">{formatDisplayDateGmt7(utcInputStringToDate(video.released_date))}</td>
                                                        <td className="px-2 py-2 text-right">{formatNumber(video.startViews)}</td>
                                                        <td className="px-2 py-2 text-right">{formatNumber(video.endViews)}</td>
                                                        <td className="px-2 py-2 text-right">
                                                            <span className="inline-flex items-baseline justify-end gap-1.5">
                                                                <span className="tp-num font-semibold text-[var(--tp-ink)]">{formatNumber(video.viewGrowth)}</span>
                                                                <GrowthDelta current={video.viewGrowth} previous={video.prevViewGrowth ?? 0} />
                                                            </span>
                                                        </td>
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
        </div>
        {data.length > 10 && (
            <div className="border-t border-[var(--tp-rule)] px-5 py-3">
                <button onClick={onToggleShowAll} className="text-[12.5px] font-semibold text-[var(--tp-accent-ink)] hover:underline">
                    {showAll ? 'Show fewer KOLs' : `Show all ${data.length} KOLs`}
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
    <div className="card tp-sheet-flush w-full">
        <div className="tp-sheet-head"><h3>{title}</h3></div>
        <div className="tp-table-scroll">
        <table className="w-full text-left text-sm">
            <thead className="text-xs text-[var(--header-blue)] font-semibold">
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
                    <tr key={video.id} className="border-b border-[var(--tp-rule)] hover:bg-[var(--tp-surface-sunken)]/50">
                        <td className="px-4 py-3 font-medium text-[var(--tp-ink)] max-w-xs">
                           <div className="flex items-center gap-2">
                               <div className="marquee-container">
                                   <div className="marquee-content">
                                       <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--tp-accent-ink)]">
                                           {video.title && typeof video.title === 'string' && video.title.trim() !== "" ? video.title : video.video_url}
                                       </a>
                                   </div>
                               </div>
                               {isNew(video.released_date) && (
                                   <span className="px-1.5 py-0.5 text-[11px] font-semibold bg-[var(--tp-accent-field)] text-[var(--tp-accent-ink)] rounded shrink-0">New</span>
                               )}
                           </div>
                        </td>
                        <td className="px-4 py-3">{formatDisplayDateGmt7(utcInputStringToDate(video.released_date))}</td><td className="px-4 py-3">{video.kols?.name || 'N/A'}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(video.startViews)}</td><td className="px-4 py-3 text-right">{formatNumber(video.endViews)}</td>
                        <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-baseline justify-end gap-1.5">
                                <span className="tp-num font-semibold text-[var(--tp-ink)]">{formatNumber(video.viewGrowth)}</span>
                                <GrowthDelta current={video.viewGrowth} previous={video.prevViewGrowth ?? 0} />
                            </span>
                        </td>
                        <td className="px-4 py-3 text-right">{video.growthPercentage === Infinity ? 'New' : `${video.growthPercentage.toFixed(1)}%`}</td>
                        <td className="px-4 py-3 text-center"><button onClick={() => onSeeTrendline(video)} className="text-[var(--tp-accent-ink)] font-semibold hover:underline">See trendline</button></td>
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
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
            <div className="bg-[#ffffff] rounded-[4px] w-full max-w-[1600px] max-h-[90vh] overflow-hidden flex flex-col border border-[var(--tp-rule-panel)]/50">
                <div className="p-6 border-b border-[var(--tp-rule-panel)]/30 flex justify-between items-center bg-[var(--tp-surface-sunken)]/50">
                    <div>
                        <h2 className="text-2xl font-semibold text-[var(--tp-ink)]">{title}</h2>
                        <p className="text-[var(--tp-muted)] text-sm">Detailed view growth from release date</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-[var(--tp-surface-active)] rounded-full transition-colors">
                        <X size={24} className="text-[var(--tp-muted)]" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 bg-[var(--tp-surface-sunken)]/30">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <Loader text="Generating detailed charts..." />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {allTrendlines.map(td => (
                                <div key={td.videoId} className="tp-section">
                                    <div className="tp-section-head">
                                        <h3 className="truncate" title={td.videoTitle}>{td.videoTitle}</h3>
                                    </div>
                                    <TrendlineChart
                                        points={td.points.map(pt => ({ at: utcInputStringToDate(pt.date), views: pt.views }))}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TrendlineChart: React.FC<{ points: { at: Date; views: number }[] }> = ({ points }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<any>(null);

    useEffect(() => {
        if (!chartRef.current) return;
        if (!chartInstance.current) chartInstance.current = echarts.init(chartRef.current);
        const chart = chartInstance.current;

        if (points.length === 0) {
            chart.clear();
            return;
        }

        chart.setOption({
            animationDuration: 200,
            tooltip: {
                trigger: 'axis',
                backgroundColor: CHART_INK.surface,
                borderColor: CHART_INK.axis,
                borderWidth: 1,
                padding: [8, 10],
                textStyle: { color: CHART_INK.text, fontSize: 12, fontFamily: CHART_FONT.ui },
                formatter: (params: any[]) => {
                    const p = params[0];
                    return `<div style="font-size:11px;color:${CHART_INK.label};margin-bottom:2px">${p.axisValueLabel}</div>`
                         + `<div style="font-weight:600;font-size:13px;color:${CHART_INK.text}">${formatNumber(p.value)} views</div>`;
                },
            },
            grid: { left: 4, right: 10, top: 12, bottom: 4, containLabel: true },
            xAxis: {
                type: 'category',
                data: points.map(p => formatDisplayDateGmt7(p.at, { month: 'short', day: 'numeric' })),
                boundaryGap: false,
                axisLine: { lineStyle: { color: CHART_INK.axis } },
                axisTick: { show: false },
                axisLabel: { color: CHART_INK.label, fontSize: 10.5, hideOverlap: true, fontFamily: CHART_FONT.mono },
            },
            yAxis: {
                type: 'value',
                scale: true,
                splitNumber: 3,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    color: CHART_INK.label,
                    fontSize: 10.5,
                    fontFamily: CHART_FONT.mono,
                    formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`),
                },
                splitLine: { lineStyle: { color: CHART_INK.grid, type: 'solid' } },
            },
            series: [{
                type: 'line',
                data: points.map(p => p.views),
                smooth: 0.35,
                smoothMonotone: 'x',
                showSymbol: points.length <= 2,
                symbol: 'circle',
                symbolSize: 7,
                lineStyle: { width: 2, color: PALETTE.revenue, cap: 'round', join: 'round' },
                itemStyle: { color: PALETTE.revenue, borderColor: CHART_INK.surface, borderWidth: 2 },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(73, 84, 188, 0.22)' },
                            { offset: 1, color: 'rgba(73, 84, 188, 0.01)' },
                        ],
                    },
                },
            }],
        }, true);

        const handleResize = () => chart.resize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [points]);

    if (points.length === 0) {
        return (
            <div className="tp-plot flex h-[200px] items-center justify-center text-[12px] text-[var(--tp-meta)]">
                No readings in this range
            </div>
        );
    }

    return <div ref={chartRef} className="tp-plot" style={{ width: '100%', height: '200px' }} />;
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
    const [videoHistory, setVideoHistory] = useState<{ at: Date; views: number }[]>([]);
    const [historyScope, setHistoryScope] = useState<'period' | 'full'>('period');
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

    // A panel that covers the page needs the key everyone already reaches for.
    useEffect(() => {
        if (!isSidebarOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarState(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isSidebarOpen]);

    /* Opening a video pulls its ENTIRE measurement history in one query, and
       every figure in the panel is derived from that one array.

       It used to re-query per view: once for the selected range, and again
       for "full history" — which is why the growth figure kept showing the
       range's growth while the chart showed the whole life of the video. One
       dataset makes that disagreement impossible, and a video carries only a
       few hundred readings, so there is nothing to save by slicing it server
       side. */
    const handleSeeTrendline = useCallback(async (video: VideoPerformanceData) => {
        setSelectedVideo(video);
        setSidebarState(true);
        setHistoryScope('period');
        setIsTrendlineLoading(true);
        setVideoHistory([]);

        try {
            const { data, error } = await supabaseClient
                .from('video_metrics')
                .select('recorded_at, view_count')
                .eq('video_id', video.id)
                .order('recorded_at');

            if (error) throw new Error(error.message);

            setVideoHistory((data || []).map(d => ({
                at: new Date(d.recorded_at),
                views: Number(d.view_count) || 0,
            })));
        } catch (err) {
            console.error(err);
            setError('Failed to fetch trendline data.');
        } finally {
            setIsTrendlineLoading(false);
        }
    }, []);

    const handleFetchData = useCallback(async () => {
        setLoading(true); setError(null); setVideoHistory([]); setRawCurrentData([]); setRawPreviousData([]); setPrevDateRange(null);
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

            const { data: videos, error: videosError } = await supabaseClient.from('videos').select('*, kols(*)');
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
        
        const previousFiltered = selectedKolId
            ? rawPreviousData.filter(v => v.kol_id === selectedKolId)
            : rawPreviousData;

        // A growth figure on its own says nothing about whether a video is
        // speeding up or dying. Every video carries the same measure from the
        // period before, so each table can print the change beside it.
        const prevGrowthByVideo = new Map(previousFiltered.map(v => [v.id, v.viewGrowth]));

        const currentFiltered = (selectedKolId
            ? rawCurrentData.filter(v => v.kol_id === selectedKolId)
            : rawCurrentData
        ).map(v => ({ ...v, prevViewGrowth: prevGrowthByVideo.get(v.id) ?? 0 }));
            
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
                prevViewGrowth: prevGrowth,
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
        <div className="workspace-page influencer-performance">
            {/* Main Content Wrapper - Motion is controlled by App.tsx */}
            <div className="w-full">
                <div className="space-y-10 max-w-full mx-auto">
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
                    {error && <div className="card flex items-start gap-2.5 p-4 text-[13px] font-medium text-[var(--tp-danger)] animate-in fade-in duration-300" role="alert"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tp-danger)]" /><span>{error}</span></div>}
                    {!loading && !error && overviewStats && (
                        <>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--tp-ink)]">Performance overview</h3>
                                    <span className="tp-chip tp-chip-accent"><span className="tp-chip-dot" aria-hidden="true" />Live</span>
                                </div>
                                <div className="tp-readout-strip">
                                    <div className="tp-readout">
                                        <p className="tp-readout-label">Total view growth</p>
                                        <p className="tp-readout-value">{formatNumber(overviewStats.current.totalGrowth)}</p>
                                        <div className="tp-readout-foot"><ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.totalGrowth, overviewStats.previous.totalGrowth)} vsDateRange={overviewStats.vsDateRange} /></div>
                                    </div>
                                    <div className="tp-readout">
                                        <p className="tp-readout-label">New video views</p>
                                        <p className="tp-readout-value">{formatNumber(overviewStats.current.newVideoGrowth)}</p>
                                        <div className="tp-readout-foot"><ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.newVideoGrowth, overviewStats.previous.newVideoGrowth)} vsDateRange={overviewStats.vsDateRange} /></div>
                                    </div>
                                    <div className="tp-readout">
                                        <p className="tp-readout-label">Old video views</p>
                                        <p className="tp-readout-value">{formatNumber(overviewStats.current.oldVideoGrowth)}</p>
                                        <div className="tp-readout-foot"><ChangeIndicatorText value={calculatePercentageChange(overviewStats.current.oldVideoGrowth, overviewStats.previous.oldVideoGrowth)} vsDateRange={overviewStats.vsDateRange} /></div>
                                    </div>
                                </div>
                                <div className="card space-y-6 p-4">
                                    <VideoTable 
                                        title="New videos released in period"
                                        videos={overviewStats.current.newVideos}
                                        dateRange={dateRange}
                                        totalLabel="Total"
                                        totalValue={overviewStats.current.newVideoGrowth}
                                        onSeeTrendline={handleSeeTrendline}
                                    />

                                    <VideoTable 
                                        title="Old video contribution"
                                        videos={overviewStats.current.legacyVideos}
                                        dateRange={dateRange}
                                        totalLabel="Total"
                                        totalValue={overviewStats.current.oldVideoGrowth}
                                        onSeeTrendline={handleSeeTrendline}
                                        initialLimit={7}
                                        showStatus={true}
                                    />
                                </div>
                            </div>
                            <TopKolTable title="Top views by KOL" data={kolPerformance} dateRange={dateRange} showAll={showAllKols} onToggleShowAll={() => setShowAllKols(!showAllKols)} />
                            <PerformanceTable title="Most recent videos" data={recentVideos} dateRange={dateRange} onSeeTrendline={handleSeeTrendline} />
                            <PerformanceTable title="Top performing videos" data={topPerformingVideos} dateRange={dateRange} onSeeTrendline={handleSeeTrendline} />
                            
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
                        <div className="card">
                            <div className="tp-empty">
                                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tp-rule)] bg-[var(--tp-surface-sunken)]">
                                    <ArrowUpDown className="text-[var(--tp-faint)]" size={20} />
                                </span>
                                <p className="tp-empty-title">Nothing loaded yet</p>
                                <p className="tp-empty-body">Pick a date range and a KOL above, then choose Get performance to see view growth across their videos.</p>
                            </div>
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
                        className={`trendline-backdrop fixed inset-0 bg-[rgba(15,21,36,0.1)] z-[99] transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    />

                    {/* Sidebar panel */}
                    <div className={`trendline-sidebar fixed top-0 right-0 h-full w-[560px] max-w-full bg-[var(--tp-paper)] z-[100] flex flex-col border-l border-[var(--tp-rule-panel)] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                        {(() => {
                            const history = videoHistory;
                            const hasHistory = history.length > 0;
                            const rangeFrom = dateRange.from;
                            const rangeTo = toGmt7EndOfDay(dateRange.to);

                            // The headline growth follows the scope the reader
                            // chose. On "full" it is the whole life of the
                            // video — last reading minus first — which is the
                            // figure the old panel kept getting wrong by
                            // leaving the selected period's number in place.
                            const periodGrowth = growthWithin(history, rangeFrom, rangeTo);
                            const lifetimeGrowth = growthWithin(history);
                            const shownGrowth = historyScope === 'full' ? lifetimeGrowth : periodGrowth;

                            const prevFrom = prevDateRange?.from;
                            const prevTo = prevDateRange ? toGmt7EndOfDay(prevDateRange.to) : undefined;
                            const prevGrowth = prevFrom && prevTo ? growthWithin(history, prevFrom, prevTo) : 0;

                            const latestViews = hasHistory ? history[history.length - 1].views : 0;
                            const firstSeen = hasHistory ? history[0].at : null;
                            const lastSeen = hasHistory ? history[history.length - 1].at : null;
                            const daysTracked = firstSeen && lastSeen
                                ? Math.max(1, Math.round((lastSeen.getTime() - firstSeen.getTime()) / 864e5))
                                : 0;

                            const points = (historyScope === 'full'
                                ? history
                                : history.filter(pt => pt.at >= rangeFrom && pt.at <= rangeTo));

                            const weeks = weeklyGrowth(history);
                            const peakWeek = weeks.reduce((m, w) => Math.max(m, w.growth), 0);
                            const platform = selectedVideo ? getPlatformTag(selectedVideo.video_url) : null;

                            return (
                                <>
                                    {/* ── Identity: what this video is ── */}
                                    <header className="flex-none border-b border-[var(--tp-rule-panel)] bg-[var(--tp-surface)] px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <h2 className="min-w-0 text-[14px] font-semibold leading-snug text-[var(--tp-ink)] line-clamp-2">
                                                {selectedVideo?.title || 'Loading…'}
                                            </h2>
                                            <button
                                                onClick={() => setSidebarState(false)}
                                                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] text-[var(--tp-meta)] transition-colors hover:bg-[var(--tp-surface-hover)] hover:text-[var(--tp-ink)]"
                                                aria-label="Close"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>

                                        {selectedVideo && (
                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[var(--tp-meta)]">
                                                {platform && <span className={`tp-chip ${platform.color} !h-[20px] !text-[11px]`}>{platform.label}</span>}
                                                <span className="text-[var(--tp-ink-2)]">{selectedVideo.kols?.name || 'Unknown creator'}</span>
                                                <span>Released {formatDisplayDateGmt7(utcInputStringToDate(selectedVideo.released_date))}</span>
                                                <a
                                                    href={selectedVideo.video_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium text-[var(--tp-pen)] hover:underline"
                                                >
                                                    Open video ↗
                                                </a>
                                            </div>
                                        )}
                                    </header>

                                    <div className="flex-1 space-y-4 overflow-y-auto p-4">
                                        {isTrendlineLoading ? (
                                            <div className="flex h-56 flex-col items-center justify-center gap-3">
                                                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--tp-pen)] border-t-transparent" />
                                                <p className="text-[12px] text-[var(--tp-meta)]">Loading history…</p>
                                            </div>
                                        ) : !hasHistory ? (
                                            <div className="tp-empty">
                                                <p className="tp-empty-title">No readings yet</p>
                                                <p className="tp-empty-body">This video has not been picked up by the view-count worker.</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* ── Performance: the numbers, together ── */}
                                                <section className="tp-section">
                                                    <div className="tp-section-head">
                                                        <h3>Performance</h3>
                                                        <span className="tp-section-head-meta">
                                                            {historyScope === 'full' ? 'Whole tracked life' : 'Selected period'}
                                                        </span>
                                                    </div>
                                                    <div className="tp-readout-strip">
                                                        <div className="tp-readout">
                                                            <p className="tp-readout-label">Views now</p>
                                                            <p className="tp-readout-value">{formatNumber(latestViews)}</p>
                                                            <div className="tp-readout-foot">
                                                                <span className="text-[11.5px] text-[var(--tp-meta)]">
                                                                    {lastSeen ? `as of ${formatDisplayDateGmt7(lastSeen)}` : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="tp-readout">
                                                            <p className="tp-readout-label">View growth</p>
                                                            <p className="tp-readout-value">{formatNumber(shownGrowth)}</p>
                                                            <div className="tp-readout-foot">
                                                                {historyScope === 'full'
                                                                    ? <span className="text-[11.5px] text-[var(--tp-meta)]">over {formatNumber(daysTracked)} days</span>
                                                                    : <GrowthDelta current={periodGrowth} previous={prevGrowth} className="!text-[11.5px]" />}
                                                            </div>
                                                        </div>
                                                        <div className="tp-readout">
                                                            <p className="tp-readout-label">Average per day</p>
                                                            <p className="tp-readout-value">
                                                                {formatNumber(Math.round(lifetimeGrowth / Math.max(daysTracked, 1)))}
                                                            </p>
                                                            <div className="tp-readout-foot">
                                                                <span className="text-[11.5px] text-[var(--tp-meta)]">since tracking began</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {historyScope === 'period' && prevDateRange && (
                                                        <p className="text-[11.5px] text-[var(--tp-meta)]">
                                                            Compared with {formatDisplayDateGmt7(prevDateRange.from)} – {formatDisplayDateGmt7(prevDateRange.to)}, which grew {formatNumber(prevGrowth)}.
                                                        </p>
                                                    )}
                                                </section>

                                                {/* ── The curve ── */}
                                                <section className="tp-section">
                                                    <div className="tp-section-head">
                                                        <h3>View count over time</h3>
                                                        <div className="flex gap-0.5 rounded-[3px] border border-[var(--tp-rule)] bg-[var(--tp-surface-sunken)] p-0.5">
                                                            {(['period', 'full'] as const).map(scope => (
                                                                <button
                                                                    key={scope}
                                                                    onClick={() => setHistoryScope(scope)}
                                                                    aria-pressed={historyScope === scope}
                                                                    className={`rounded-[3px] px-2 py-0.5 text-[11px] font-medium transition-all ${
                                                                        historyScope === scope
                                                                            ? 'bg-[var(--tp-surface)] text-[var(--tp-ink)] shadow-[var(--tp-elev-1)]'
                                                                            : 'text-[var(--tp-muted)] hover:text-[var(--tp-ink)]'
                                                                    }`}
                                                                >
                                                                    {scope === 'period' ? 'Selected period' : 'Full history'}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <TrendlineChart points={points} />
                                                </section>

                                                {/* ── Week by week, whole life ── */}
                                                <section className="tp-section">
                                                    <div className="tp-section-head">
                                                        <h3>View growth by week</h3>
                                                        <span className="tp-section-head-meta">Every tracked week · not filtered</span>
                                                    </div>
                                                    <div className="card max-h-[260px] overflow-y-auto p-3">
                                                        {weeks.length === 0 ? (
                                                            <p className="text-[12px] text-[var(--tp-meta)]">Not enough readings yet.</p>
                                                        ) : (
                                                            <ol className="space-y-1.5">
                                                                {[...weeks].reverse().map(w => (
                                                                    <li key={w.start.getTime()} className="flex items-center gap-2">
                                                                        <span className="w-[66px] shrink-0 text-[11px] text-[var(--tp-muted)]">
                                                                            {formatDisplayDateGmt7(w.start, { month: 'short', day: 'numeric' })}
                                                                        </span>
                                                                        <span className="relative h-3 flex-1 overflow-hidden rounded-[2px] bg-[var(--tp-surface-sunken)]">
                                                                            <span
                                                                                className="absolute inset-y-0 left-0 rounded-[2px]"
                                                                                style={{
                                                                                    width: `${peakWeek > 0 ? Math.max(0, (w.growth / peakWeek) * 100) : 0}%`,
                                                                                    backgroundImage: 'linear-gradient(90deg, var(--tp-pen-deep), var(--tp-pen))',
                                                                                }}
                                                                            />
                                                                        </span>
                                                                        <span className="tp-num w-[58px] shrink-0 text-right text-[11.5px] font-medium text-[var(--tp-ink)]">
                                                                            {w.growth >= 0 ? '+' : ''}{formatNumber(w.growth)}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ol>
                                                        )}
                                                    </div>
                                                </section>
                                            </>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
            </>
            , document.body) }
        </div>
    );
};

export default InfluencerPerformance;
