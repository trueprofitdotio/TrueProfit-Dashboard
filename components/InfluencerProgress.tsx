import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import { fetchYouTubeChannelDetails, getYouTubeVideoId, fetchYouTubeVideoDetails } from '../services/youtubeService';
import { 
    Calendar, Filter, Search, ArrowUpDown, Plus, Trash2, Edit2, Check,
    Play, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Youtube, FileText
} from 'lucide-react';

interface VideoRecord {
    id: string;
    video_url: string;
    title?: string | null;
    released_date?: string | null;
    current_views?: number | null;
}

interface CollaborationRow {
    id: string;
    kol_id: string;
    start_month?: string | null;
    payment_status?: string | null;
    progress_status?: string | null;
    report_links?: string | null;
    released_date?: string | null;
    agreement_link?: string | null;
    total_package?: string | null;
    content_count?: number | null;
    actual_spent?: number | null;
    notes?: string | null;
    kols?: KolData | null;
    videosList?: VideoRecord[];
}

const DEFAULT_PROGRESS_TAGS = [
    'All done',
    'Awaiting Content',
    'Need to check',
    'In Progress'
];

const COLOR_PALETTES = [
    'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold',
    'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
    'bg-amber-100 text-amber-800 border-amber-300 font-semibold',
    'bg-purple-100 text-purple-800 border-purple-300 font-semibold',
    'bg-sky-100 text-sky-800 border-sky-300 font-semibold',
    'bg-indigo-100 text-indigo-800 border-indigo-300 font-semibold',
    'bg-teal-100 text-teal-800 border-teal-300 font-semibold',
    'bg-pink-100 text-pink-800 border-pink-300 font-semibold',
    'bg-orange-100 text-orange-800 border-orange-300 font-semibold',
    'bg-blue-100 text-blue-800 border-blue-300 font-semibold'
];

const getProgressTagStyle = (status?: string | null) => {
    if (!status) return 'bg-slate-100 text-slate-700 border-slate-200 font-normal';
    const s = status.trim().toLowerCase();
    if (s === 'all done') return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
    if (s === 'pending/canceled' || s === 'canceled' || s === 'cancelled') return 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
    if (s.includes('1st payment') || s.includes('2nd payment')) return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
    if (s.includes('awaiting content') || s.includes('third content')) return 'bg-purple-100 text-purple-800 border-purple-300 font-semibold';
    if (s.includes('awaiting payment')) return 'bg-sky-100 text-sky-800 border-sky-300 font-semibold';
    
    // Hash fallback for custom unique tags
    let hash = 0;
    for (let i = 0; i < status.length; i++) {
        hash = status.charCodeAt(i) + ((hash << 5) - hash);
    }
    const paletteIdx = Math.abs(hash) % COLOR_PALETTES.length;
    return COLOR_PALETTES[paletteIdx];
};

const formatCurrencyUSD = (val?: string | number | null): string => {
    if (val === undefined || val === null || val === '') return '$0';
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.]/g, ''));
    if (isNaN(num)) return String(val);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
};

const parsePackageNumber = (val?: string | number | null): number => {
    if (!val) return 0;
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : num;
};

// Date Formatter: YYYY-MM-DD or text -> MMM DD, YYYY
const formatDateDisplay = (dateStr?: string | null): string => {
    if (!dateStr) return 'Select Date';
    try {
        const dt = new Date(dateStr);
        if (isNaN(dt.getTime())) return dateStr;
        return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
};

// Platform Icon Auto-Detector Helper
const renderPlatformIcon = (url: string) => {
    const u = (url || '').toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) {
        return (
            <svg className="w-3.5 h-3.5 text-red-500 shrink-0 fill-red-500" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
        );
    }
    if (u.includes('tiktok.com')) {
        return (
            <svg className="w-3.5 h-3.5 shrink-0 text-slate-900 fill-current" viewBox="0 0 24 24">
                <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 0 1 3.183-4.51v-3.5a6.329 6.329 0 0 0-5.394 2.13 6.333 6.333 0 0 0 4.148 10.458 6.333 6.333 0 0 0 6.709-6.319V8.2a8.214 8.214 0 0 0 4.77 1.526V6.28a4.8 4.8 0 0 1-1.205-.406z"/>
            </svg>
        );
    }
    if (u.includes('instagram.com')) {
        return (
            <svg className="w-3.5 h-3.5 shrink-0 text-pink-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
            </svg>
        );
    }
    if (u.includes('twitter.com') || u.includes('x.com')) {
        return (
            <svg className="w-3.5 h-3.5 shrink-0 text-slate-800 fill-current" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
        );
    }
    return <Play className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
};

// Custom Single Mini Calendar Picker Component
interface MiniCalendarPickerProps {
    initialDate?: string | null;
    onSelectDate: (formattedDate: string) => void;
    onClose: () => void;
}

const MiniCalendarPicker: React.FC<MiniCalendarPickerProps> = ({ initialDate, onSelectDate, onClose }) => {
    const initialDt = initialDate ? new Date(initialDate) : new Date();
    const validDt = isNaN(initialDt.getTime()) ? new Date() : initialDt;

    const [viewYear, setViewYear] = useState<number>(validDt.getFullYear());
    const [viewMonth, setViewMonth] = useState<number>(validDt.getMonth());

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const handlePrevYear = () => setViewYear(prev => prev - 1);
    const handleNextYear = () => setViewYear(prev => prev + 1);
    const handlePrevMonth = () => {
        if (viewMonth === 0) {
            setViewMonth(11);
            setViewYear(prev => prev - 1);
        } else {
            setViewMonth(prev => prev - 1);
        }
    };
    const handleNextMonth = () => {
        if (viewMonth === 11) {
            setViewMonth(0);
            setViewYear(prev => prev + 1);
        } else {
            setViewMonth(prev => prev + 1);
        }
    };

    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const daysGrid: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
        daysGrid.push(null);
    }
    for (let d = 1; d <= totalDaysInMonth; d++) {
        daysGrid.push(d);
    }

    const handleSelectDay = (day: number) => {
        const selectedDt = new Date(viewYear, viewMonth, day);
        const formatted = selectedDt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
        onSelectDate(formatted);
    };

    return (
        <div className="space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[var(--accent-color)]" />
                    <span>Collab Started Date</span>
                </span>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>

            {/* Navigation Header */}
            <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-xl border border-slate-200 select-none">
                <div className="flex items-center gap-0.5">
                    <button type="button" onClick={handlePrevYear} title="Previous Year" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={handlePrevMonth} title="Previous Month" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>
                <span className="text-xs font-semibold text-slate-800">
                    {monthNames[viewMonth]} {viewYear}
                </span>
                <div className="flex items-center gap-0.5">
                    <button type="button" onClick={handleNextMonth} title="Next Month" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={handleNextYear} title="Next Year" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronsRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Days Grid */}
            <div>
                <div className="grid grid-cols-7 gap-1 text-center mb-1 select-none">
                    {dayHeaders.map(dh => (
                        <div key={dh} className="text-[10px] font-semibold text-slate-400 uppercase py-0.5">{dh}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                    {daysGrid.map((day, idx) => {
                        if (day === null) {
                            return <div key={idx} className="h-7" />;
                        }
                        return (
                            <button
                                type="button"
                                key={idx}
                                onClick={() => handleSelectDay(day)}
                                className="h-7 w-7 mx-auto flex items-center justify-center rounded-lg text-xs font-medium text-slate-700 hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const InfluencerProgress: React.FC = () => {
    const [collaborations, setCollaborations] = useState<CollaborationRow[]>([]);
    const [allKols, setAllKols] = useState<KolData[]>([]);
    const [loading, setLoading] = useState(true);

    // Custom Tag Options list persisted in localStorage
    const [tagOptions, setTagOptions] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('tp_custom_progress_tags');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            console.error('Failed to load tagOptions from localStorage:', e);
        }
        return DEFAULT_PROGRESS_TAGS;
    });

    const updateTagOptionsState = (newTags: string[]) => {
        setTagOptions(newTags);
        try {
            localStorage.setItem('tp_custom_progress_tags', JSON.stringify(newTags));
        } catch (e) {
            console.error('Failed to save tagOptions to localStorage:', e);
        }
    };
    const [newCustomTagInput, setNewCustomTagInput] = useState('');
    const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
    const [editingTagVal, setEditingTagVal] = useState('');

    // Video editing & collapse state
    const [editingUrlIdx, setEditingUrlIdx] = useState<number | null>(null);
    const [editingUrlVal, setEditingUrlVal] = useState('');
    const [expandedVideoRows, setExpandedVideoRows] = useState<Record<string, boolean>>({});

    // Agreement Documents editing state
    const [agreementUrlsList, setAgreementUrlsList] = useState<string[]>([]);
    const [newAgreementUrlInput, setNewAgreementUrlInput] = useState('');
    const [editingAgreementIdx, setEditingAgreementIdx] = useState<number | null>(null);
    const [editingAgreementVal, setEditingAgreementVal] = useState('');

    // Filter & Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
    const [showStatusFilterPopover, setShowStatusFilterPopover] = useState(false);
    const [sortField, setSortField] = useState<'start_month' | 'kol_name' | 'progress_status' | 'total_package' | 'payment_percent'>('start_month');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Delete deal confirmation modal state
    const [deleteConfirmCollab, setDeleteConfirmCollab] = useState<CollaborationRow | null>(null);

    // Sticky Popover states: anchored to specific row and cell type
    const [activePopover, setActivePopover] = useState<{
        rowId: string;
        type: 'date' | 'progress' | 'payment' | 'videos' | 'package' | 'count' | 'agreement';
        anchorRect?: DOMRect;
    } | null>(null);

    // Popover input values
    const [spentInputVal, setSpentInputVal] = useState<string>('0');
    const [pkgInputVal, setPkgInputVal] = useState<string>('');
    const [countInputVal, setCountInputVal] = useState<number>(1);
    const [videoUrlsList, setVideoUrlsList] = useState<string[]>([]);
    const [newVideoUrlInput, setNewVideoUrlInput] = useState('');

    // Modal state for adding new deal
    const [showAddModal, setShowAddModal] = useState(false);
    const [kolSourceMode, setKolSourceMode] = useState<'existing' | 'new_yt'>('existing');
    const [newKolId, setNewKolId] = useState('');
    const [ytChannelUrlInput, setYtChannelUrlInput] = useState('');
    const [fetchingYt, setFetchingYt] = useState(false);
    const [fetchedKolData, setFetchedKolData] = useState<KolData | null>(null);

    const [newStartMonth, setNewStartMonth] = useState('');
    const [newPackage, setNewPackage] = useState('');
    const [showModalCalendar, setShowModalCalendar] = useState(false);

    const popoverRef = useRef<HTMLDivElement>(null);
    const statusFilterRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [collabRes, kolsRes, videosRes] = await Promise.all([
                supabaseClient
                    .from('collaborations')
                    .select('*, kols(*)')
                    .order('created_at', { ascending: false }),
                supabaseClient
                    .from('kols')
                    .select('*')
                    .order('name'),
                supabaseClient
                    .from('videos')
                    .select('id, kol_id, video_url, title, released_date, current_views')
            ]);
            
            if (collabRes.error) throw collabRes.error;
            if (kolsRes.error) throw kolsRes.error;
            
            const rawCollabs = collabRes.data as unknown as CollaborationRow[];
            const videosData = (videosRes.data || []) as VideoRecord[];

            // Map videos to collaborations by report_links / kol_id
            const collabsWithVideos = rawCollabs.map(c => {
                const reportLinks = c.report_links || '';
                const foundUrls = reportLinks.match(/(https?:\/\/[^\s,]+)/g) || [];
                
                const matchedVids: VideoRecord[] = foundUrls.map(url => {
                    const ytId = getYouTubeVideoId(url);
                    const found = videosData.find(v => {
                        if (v.video_url === url) return true;
                        if (ytId && v.video_url && getYouTubeVideoId(v.video_url) === ytId) return true;
                        if (ytId && v.id === `yt_${ytId}`) return true;
                        return false;
                    });
                    return {
                        id: found?.id || url,
                        video_url: url,
                        title: found?.title || null,
                        released_date: found?.released_date || null,
                        current_views: found?.current_views || null
                    };
                });

                // AUTO-SORT REPORTED VIDEOS OLDEST (TOP) TO NEWEST (BOTTOM)
                matchedVids.sort((a, b) => {
                    const timeA = a.released_date ? (Date.parse(a.released_date) || 0) : 0;
                    const timeB = b.released_date ? (Date.parse(b.released_date) || 0) : 0;
                    return timeA - timeB;
                });

                const latestRelDate = matchedVids.map(v => v.released_date).filter(Boolean)[0] || c.released_date;

                // Auto-evaluate system-defined status tags
                const totalPkgNum = parsePackageNumber(c.total_package);
                const actualSpent = c.actual_spent || 0;
                const paymentPercent = totalPkgNum > 0 ? Math.min(100, Math.round((actualSpent / totalPkgNum) * 100)) : 0;
                const agreedCount = c.content_count || 1;
                const recordedCount = matchedVids.length;
                const contentPercent = Math.min(100, Math.round((recordedCount / agreedCount) * 100));

                let systemStatus = 'Awaiting Content';
                if (paymentPercent === 100 && contentPercent === 100) {
                    systemStatus = 'All done';
                } else if (paymentPercent > 0 || contentPercent > 0) {
                    systemStatus = 'In Progress';
                }

                // Respect user-applied custom status over system status
                const displayStatus = (c.is_custom_status && (c.custom_status || c.progress_status)) 
                    ? (c.custom_status || c.progress_status) 
                    : systemStatus;

                return {
                    ...c,
                    system_status: systemStatus,
                    progress_status: displayStatus,
                    released_date: latestRelDate,
                    videosList: matchedVids
                };
            });

            setCollaborations(collabsWithVideos);
            setAllKols(kolsRes.data as KolData[]);

            // Async background title fetcher for missing YouTube titles (e.g. youtu.be links)
            const missingTitleVids = collabsWithVideos.flatMap(c => c.videosList || []).filter(v => !v.title && getYouTubeVideoId(v.video_url));
            if (missingTitleVids.length > 0) {
                (async () => {
                    for (const vid of missingTitleVids) {
                        const ytId = getYouTubeVideoId(vid.video_url);
                        if (!ytId) continue;
                        try {
                            const details = await fetchYouTubeVideoDetails(vid.video_url);
                            if (details && details.title) {
                                setCollaborations(prev => prev.map(c => ({
                                    ...c,
                                    videosList: (c.videosList || []).map(v => {
                                        if (v.video_url === vid.video_url || getYouTubeVideoId(v.video_url) === ytId) {
                                            return { ...v, title: details.title, released_date: v.released_date || details.publishedAt };
                                        }
                                        return v;
                                    })
                                })));
                                await supabaseClient.from('videos').upsert({
                                    new_id: `yt_${ytId}`,
                                    video_url: vid.video_url,
                                    title: details.title,
                                    released_date: details.publishedAt || null,
                                    status: 'HEALTHY'
                                }, { onConflict: 'new_id' });
                            }
                        } catch (e) {
                            console.error('Error fetching YouTube video details:', e);
                        }
                    }
                })();
            }

            setTagOptions(prev => {
                const saved = localStorage.getItem('tp_custom_progress_tags');
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                    } catch {}
                }
                return prev;
            });

        } catch (e) {
            console.error('Error fetching progress data:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Close popovers ONLY on explicit click outside container
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setActivePopover(null);
            }
            if (statusFilterRef.current && !statusFilterRef.current.contains(e.target as Node)) {
                setShowStatusFilterPopover(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Update cell value in local state & Supabase
    const updateCollaborationField = async (rowId: string, field: keyof CollaborationRow, value: any) => {
        if (field === 'progress_status') {
            setCollaborations(prev => prev.map(c => c.id === rowId ? { 
                ...c, 
                progress_status: value, 
                is_custom_status: true, 
                custom_status: value 
            } : c));
            setActivePopover(null);

            try {
                const { error } = await supabaseClient
                    .from('collaborations')
                    .update({ 
                        progress_status: value, 
                        is_custom_status: true, 
                        custom_status: value, 
                        updated_at: new Date().toISOString() 
                    })
                    .eq('id', rowId);
                if (error) throw error;
            } catch (e) {
                console.error(`Failed to update progress_status:`, e);
                fetchData();
            }
            return;
        }

        setCollaborations(prev => prev.map(c => c.id === rowId ? { ...c, [field]: value } : c));
        setActivePopover(null);

        try {
            const { error } = await supabaseClient
                .from('collaborations')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('id', rowId);
            if (error) throw error;
        } catch (e) {
            console.error(`Failed to update ${field}:`, e);
            fetchData();
        }
    };

    const handleResetToAutoStatus = async (rowId: string, sysStatus?: string) => {
        const resetStatus = sysStatus || 'Awaiting Content';
        setCollaborations(prev => prev.map(c => c.id === rowId ? { 
            ...c, 
            progress_status: resetStatus, 
            is_custom_status: false, 
            custom_status: null 
        } : c));
        setActivePopover(null);

        try {
            const { error } = await supabaseClient
                .from('collaborations')
                .update({ 
                    progress_status: resetStatus, 
                    is_custom_status: false, 
                    custom_status: null, 
                    updated_at: new Date().toISOString() 
                })
                .eq('id', rowId);
            if (error) throw error;
        } catch (e) {
            console.error(`Failed to reset status to automatic:`, e);
            fetchData();
        }
    };

    // Open Sticky Cell Popover
    const openPopover = (
        e: React.MouseEvent, 
        row: CollaborationRow, 
        type: 'date' | 'progress' | 'payment' | 'videos' | 'package' | 'count' | 'agreement'
    ) => {
        e.stopPropagation();
        const targetElement = e.currentTarget as HTMLElement;
        const rect = targetElement.getBoundingClientRect();

        setEditingTagIdx(null);
        setEditingUrlIdx(null);
        setEditingAgreementIdx(null);

        if (type === 'payment') {
            setSpentInputVal(String(row.actual_spent || 0));
        } else if (type === 'videos') {
            const urls = (row.report_links || '').match(/(https?:\/\/[^\s,]+)/g) || [];
            setVideoUrlsList(urls);
            setNewVideoUrlInput('');
        } else if (type === 'agreement') {
            const urls = (row.agreement_link || '').match(/(https?:\/\/[^\s,]+)/g) || [];
            setAgreementUrlsList(urls.length > 0 ? urls : (row.agreement_link ? [row.agreement_link] : []));
            setNewAgreementUrlInput('');
        } else if (type === 'package') {
            setPkgInputVal(row.total_package || '');
        } else if (type === 'count') {
            setCountInputVal(row.content_count || 1);
        }

        setActivePopover({
            rowId: row.id,
            type,
            anchorRect: rect
        });
    };

    // Video manager: Add / Edit / Remove link
    const handleSaveVideosPopover = async (rowId: string) => {
        let finalUrls = [...videoUrlsList];
        if (newVideoUrlInput.trim()) {
            finalUrls.push(newVideoUrlInput.trim());
        }
        const updatedLinksText = finalUrls.join('\n');
        await updateCollaborationField(rowId, 'report_links', updatedLinksText);

        const targetCollab = collaborations.find(c => c.id === rowId);
        if (targetCollab && targetCollab.kol_id) {
            for (const url of finalUrls) {
                const matchId = url.match(/(?:v=|\/|embed\/|youtu\.be\/)([\w-]{11})(?=&|\?|$)/);
                if (matchId) {
                    const ytId = matchId[1];
                    const newId = `yt_${ytId}`;
                    await supabaseClient.from('videos').upsert({
                        new_id: newId,
                        kol_id: targetCollab.kol_id,
                        video_url: url,
                        status: 'HEALTHY'
                    }, { onConflict: 'new_id' });
                }
            }
        }

        setActivePopover(null);
        fetchData();
    };

    // Agreement Documents manager: Add / Edit / Remove document URL
    const handleSaveAgreementPopover = async (rowId: string) => {
        let finalUrls = [...agreementUrlsList];
        if (newAgreementUrlInput.trim()) {
            finalUrls.push(newAgreementUrlInput.trim());
        }
        const updatedLinksText = finalUrls.join('\n');
        await updateCollaborationField(rowId, 'agreement_link', updatedLinksText);
        setActivePopover(null);
    };

    // Add new custom progress tag
    const handleAddCustomTag = () => {
        if (!newCustomTagInput.trim()) return;
        const tag = newCustomTagInput.trim();
        if (!tagOptions.includes(tag)) {
            const nextTags = [...tagOptions, tag];
            updateTagOptionsState(nextTags);
        }
        if (activePopover?.rowId) {
            updateCollaborationField(activePopover.rowId, 'progress_status', tag);
        }
        setNewCustomTagInput('');
    };

    // Save edited tag option name & BULK UPDATE database records
    const handleSaveEditTag = async (idx: number) => {
        if (!editingTagVal.trim()) return;
        const oldTag = tagOptions[idx];
        const newTag = editingTagVal.trim();
        
        const nextTags = tagOptions.map((t, i) => i === idx ? newTag : t);
        updateTagOptionsState(nextTags);
        setEditingTagIdx(null);

        setSelectedStatuses(prev => prev.map(s => s === oldTag ? newTag : s));

        try {
            await supabaseClient
                .from('collaborations')
                .update({ progress_status: newTag, updated_at: new Date().toISOString() })
                .eq('progress_status', oldTag);

            setCollaborations(prev => prev.map(c => c.progress_status === oldTag ? { ...c, progress_status: newTag } : c));
        } catch (err) {
            console.error('Failed to bulk update tag name:', err);
        }
    };

    // Delete tag option & BULK UPDATE database records to null so it never resurrects
    const handleDeleteTag = async (idx: number) => {
        const tagToDelete = tagOptions[idx];
        const nextTags = tagOptions.filter((_, i) => i !== idx);
        updateTagOptionsState(nextTags);

        // Update local state immediately for all rows having this tag
        setCollaborations(prev => prev.map(c => c.progress_status === tagToDelete ? { ...c, progress_status: null } : c));
        setSelectedStatuses(prev => prev.filter(s => s !== tagToDelete));

        // Bulk update database to clear this tag from all collaborations in Supabase
        try {
            await supabaseClient
                .from('collaborations')
                .update({ progress_status: null, updated_at: new Date().toISOString() })
                .eq('progress_status', tagToDelete);
        } catch (err) {
            console.error('Failed to bulk delete status tag in DB:', err);
        }
    };

    const handleDeleteCollaboration = async (collabId: string) => {
        setCollaborations(prev => prev.filter(c => c.id !== collabId));
        setDeleteConfirmCollab(null);

        try {
            const { error } = await supabaseClient
                .from('collaborations')
                .delete()
                .eq('id', collabId);
            if (error) throw error;
        } catch (err) {
            console.error('Failed to delete deal record:', err);
            fetchData();
        }
    };

    // Fetch YouTube Channel Details for Add Modal
    const handleFetchYtChannel = async () => {
        if (!ytChannelUrlInput.trim()) return;
        setFetchingYt(true);
        try {
            const info = await fetchYouTubeChannelDetails(ytChannelUrlInput.trim());
            if (info) {
                setFetchedKolData({
                    name: info.title,
                    avatar_url: info.avatarUrl,
                    subscriber_count: info.subscriberCount,
                    country: info.country || 'United States',
                    channel_link: info.channelLink
                });
            } else {
                alert('Could not fetch YouTube channel. Please check the URL/handle.');
            }
        } catch (e) {
            console.error('Error fetching channel:', e);
        } finally {
            setFetchingYt(false);
        }
    };

    // Create New Collaboration Record
    const handleCreateCollaboration = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let kolIdToUse = '';

            if (kolSourceMode === 'existing') {
                kolIdToUse = newKolId;
            } else {
                if (!fetchedKolData || !fetchedKolData.name) {
                    alert('Please fetch or enter a YouTube channel URL first.');
                    return;
                }

                // Upsert new fetched KOL into Supabase
                const { data: newKol, error: kolErr } = await supabaseClient
                    .from('kols')
                    .upsert({
                        name: fetchedKolData.name,
                        avatar_url: fetchedKolData.avatar_url,
                        subscriber_count: fetchedKolData.subscriber_count,
                        country: fetchedKolData.country || 'United States',
                        channel_link: fetchedKolData.channel_link
                    }, { onConflict: 'name' })
                    .select()
                    .single();
                
                if (kolErr) throw kolErr;
                kolIdToUse = newKol.id;
            }

            if (!kolIdToUse) {
                alert('Please select or fetch a valid KOL.');
                return;
            }

            const { error } = await supabaseClient
                .from('collaborations')
                .insert({
                    kol_id: kolIdToUse,
                    start_month: newStartMonth || formatDateDisplay(new Date().toISOString()),
                    total_package: newPackage,
                    progress_status: 'Awaiting Content',
                    payment_status: 'Awaiting Payment',
                    content_count: 1,
                    actual_spent: 0
                });

            if (error) throw error;
            setShowAddModal(false);
            setNewKolId('');
            setYtChannelUrlInput('');
            setFetchedKolData(null);
            setNewStartMonth('');
            setNewPackage('');
            fetchData();
        } catch (e) {
            console.error('Error creating deal:', e);
            alert('Failed to create deal.');
        }
    };

    // Sort Handler
    const handleSort = (field: keyof CollaborationRow | 'kol_name' | 'payment_percent') => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Filter & Chronological Sort Logic
    const processedCollaborations = collaborations
        .filter(c => {
            const kolName = (c.kols?.name || '').toLowerCase();
            const tag = c.progress_status || '';

            const matchesSearch = !searchQuery || kolName.includes(searchQuery.toLowerCase());
            const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes('All') || selectedStatuses.includes(tag);

            return matchesSearch && matchesStatus;
        })
        .sort((a, b) => {
            let valA: any = a[sortField as keyof CollaborationRow];
            let valB: any = b[sortField as keyof CollaborationRow];

            if (sortField === 'start_month') {
                valA = a.start_month ? (Date.parse(a.start_month) || 0) : 0;
                valB = b.start_month ? (Date.parse(b.start_month) || 0) : 0;
            } else if (sortField === 'kol_name') {
                valA = a.kols?.name || '';
                valB = b.kols?.name || '';
            } else if (sortField === 'payment_percent') {
                const pkgA = parsePackageNumber(a.total_package);
                const pkgB = parsePackageNumber(b.total_package);
                valA = pkgA > 0 ? ((a.actual_spent || 0) / pkgA) * 100 : 0;
                valB = pkgB > 0 ? ((b.actual_spent || 0) / pkgB) * 100 : 0;
            } else if (sortField === 'total_package') {
                valA = parsePackageNumber(a.total_package);
                valB = parsePackageNumber(b.total_package);
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

    // Selected KOL object for modal preview
    const selectedExistingKol = allKols.find(k => k.id === newKolId);

    return (
        <div className="card p-6 space-y-6">
            {/* Top Toolbar (Search, Filter & Add Deal) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[240px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input 
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search KOL name..."
                            className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[var(--accent-color)] outline-none font-normal"
                        />
                    </div>

                    {/* Multi-Select Status Filter Button & Dropdown */}
                    {(() => {
                        const allActiveStatuses = tagOptions;
                        const isAllOrNone = selectedStatuses.length === 0 || selectedStatuses.length === allActiveStatuses.length;
                        const statusBtnLabel = isAllOrNone 
                            ? 'All Statuses' 
                            : selectedStatuses.length === 1 
                            ? `Status: ${selectedStatuses[0]}` 
                            : `Status (${selectedStatuses.length} selected)`;

                        return (
                            <div className="relative" ref={statusFilterRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowStatusFilterPopover(!showStatusFilterPopover)}
                                    className="flex items-center gap-2 px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors"
                                >
                                    <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{statusBtnLabel}</span>
                                    <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showStatusFilterPopover ? 'rotate-90' : ''}`} />
                                </button>

                                {showStatusFilterPopover && (
                                    <div className="absolute top-full left-0 mt-1.5 bg-white rounded-2xl border border-[#bfdbfe]/80 shadow-lg p-3 w-64 z-50 space-y-2">
                                        <div className="flex justify-between items-center pb-2 border-b border-slate-100 text-xs font-semibold text-slate-800">
                                            <span>Filter by Status</span>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedStatuses([...allActiveStatuses])} 
                                                    className="text-[11px] font-medium text-emerald-600 hover:underline"
                                                >
                                                    Check all
                                                </button>
                                                <span className="text-slate-300">|</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedStatuses([])} 
                                                    className="text-[11px] font-medium text-slate-500 hover:underline"
                                                >
                                                    Reset all
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                            {allActiveStatuses.map(t => (
                                                <label key={t} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs font-medium text-slate-700">
                                                    <input 
                                                        type="checkbox"
                                                        checked={selectedStatuses.includes(t)}
                                                        onChange={() => {
                                                            if (selectedStatuses.includes(t)) {
                                                                setSelectedStatuses(selectedStatuses.filter(s => s !== t));
                                                            } else {
                                                                setSelectedStatuses([...selectedStatuses, t]);
                                                            }
                                                        }}
                                                        className="rounded text-[var(--accent-color)] focus:ring-[var(--accent-color)] h-3.5 w-3.5"
                                                    />
                                                    <span>{t}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>

                <button 
                    onClick={() => {
                        setShowAddModal(true);
                        setNewStartMonth(formatDateDisplay(new Date().toISOString()));
                    }}
                    className="bg-[var(--accent-color)] text-white px-5 py-2 rounded-full font-medium hover:bg-emerald-600 transition-colors shadow-xs text-xs flex items-center justify-center gap-1.5 w-fit shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add New Deal</span>
                </button>
            </div>

            {/* Table Layout */}
            <div ref={tableContainerRef} className="overflow-x-auto border border-[#bfdbfe]/50 rounded-2xl shadow-xs bg-white">
                <table className="w-full text-sm text-left text-slate-600 border-collapse">
                    <thead className="text-xs text-slate-500 font-normal uppercase bg-slate-50/80 border-b border-[#bfdbfe]/50 select-none">
                        <tr>
                            <th onClick={() => handleSort('start_month')} className="px-4 py-3.5 min-w-[140px] cursor-pointer hover:bg-slate-100/80 transition-colors font-normal group">
                                <div className="flex items-center gap-1">
                                    <span>Collab Started</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('kol_name')} className="px-4 py-3.5 min-w-[200px] cursor-pointer hover:bg-slate-100/80 transition-colors font-normal group">
                                <div className="flex items-center gap-1">
                                    <span>KOL</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('progress_status')} className="px-4 py-3.5 min-w-[160px] cursor-pointer hover:bg-slate-100/80 transition-colors font-normal group">
                                <div className="flex items-center gap-1">
                                    <span>Status</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('total_package')} className="px-4 py-3.5 text-right min-w-[110px] cursor-pointer hover:bg-slate-100/80 transition-colors font-normal group">
                                <div className="flex items-center justify-end gap-1">
                                    <span>Package ($)</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('payment_percent')} className="px-4 py-3.5 min-w-[180px] cursor-pointer hover:bg-slate-100/80 transition-colors font-normal group">
                                <div className="flex items-center gap-1">
                                    <span>Payment Progress</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                            </th>
                            <th className="px-4 py-3.5 min-w-[130px] font-normal">Content Progress</th>
                            <th className="px-4 py-3.5 min-w-[240px] font-normal">Reported Videos</th>
                            <th className="px-4 py-3.5 min-w-[120px] font-normal">Released Date</th>
                            <th className="px-4 py-3.5 min-w-[140px] font-normal">Contract</th>
                            <th className="px-4 py-3.5 min-w-[80px] text-center font-normal">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#bfdbfe]/30">
                        {loading ? (
                            <tr><td colSpan={10} className="text-center py-12 text-slate-400">Loading progress workspace...</td></tr>
                        ) : processedCollaborations.length === 0 ? (
                            <tr><td colSpan={10} className="text-center py-12 text-slate-400">No matching deals found.</td></tr>
                        ) : (
                            processedCollaborations.map(c => {
                                const totalPkgNum = parsePackageNumber(c.total_package);
                                const actualSpent = c.actual_spent || 0;
                                const paymentPercent = totalPkgNum > 0 ? Math.min(100, Math.round((actualSpent / totalPkgNum) * 100)) : 0;

                                const isExpanded = !!expandedVideoRows[c.id];
                                const allVids = c.videosList || [];
                                const displayedVids = isExpanded ? allVids : allVids.slice(0, 4);

                                return (
                                    <tr key={c.id} className="hover:bg-slate-50/40 transition-colors align-top">
                                        {/* 1. Collab Started */}
                                        <td className="px-4 py-3 whitespace-nowrap text-xs font-normal text-slate-700">
                                            <button 
                                                onClick={e => openPopover(e, c, 'date')}
                                                className="hover:bg-slate-100 px-2 py-1 rounded transition-colors text-left inline-block border border-transparent hover:border-slate-200"
                                                title="Click to edit Collab Started date"
                                            >
                                                <span>{formatDateDisplay(c.start_month)}</span>
                                            </button>
                                        </td>

                                        {/* 2. KOL Column */}
                                        <td className="px-4 py-3">
                                            <KOLCell kol={c.kols} />
                                        </td>

                                        {/* 3. Progress Status Column */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                onClick={e => openPopover(e, c, 'progress')}
                                                className={`px-3 py-1 rounded-full text-xs border transition-transform hover:scale-105 inline-block shadow-2xs ${getProgressTagStyle(c.progress_status)}`}
                                                title="Click to change status tag"
                                            >
                                                <span>{c.progress_status || 'Select Status'}</span>
                                            </button>
                                        </td>

                                        {/* 4. Package Column (Moved to LEFT of Payment Progress) */}
                                        <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                                            <button 
                                                onClick={e => openPopover(e, c, 'package')}
                                                className="hover:bg-slate-100 px-2 py-1 rounded transition-colors text-right inline-block text-slate-800 font-medium border border-transparent hover:border-slate-200"
                                                title="Click to edit package amount"
                                            >
                                                {formatCurrencyUSD(c.total_package)}
                                            </button>
                                        </td>

                                        {/* 5. Payment Progress Column ($AA/$BBB Paid) */}
                                        <td className="px-4 py-3 min-w-[180px]">
                                            <div 
                                                onClick={e => openPopover(e, c, 'payment')}
                                                className="cursor-pointer group/bar p-1.5 rounded-lg hover:bg-slate-100/80 transition-colors border border-transparent hover:border-slate-200"
                                                title="Click to update Actual Budget Spent"
                                            >
                                                <div className="flex justify-between items-center text-xs mb-1 font-medium">
                                                    <span className="text-slate-700 text-[11px] font-medium">
                                                        {formatCurrencyUSD(actualSpent)}/{formatCurrencyUSD(c.total_package)} Paid
                                                    </span>
                                                    <span className={`${paymentPercent === 100 ? 'text-emerald-600' : 'text-blue-600'} font-semibold`}>
                                                        {paymentPercent}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                                    <div 
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            paymentPercent === 100 
                                                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                                                                : paymentPercent > 0 
                                                                ? 'bg-gradient-to-r from-blue-500 to-amber-400' 
                                                                : 'bg-slate-300'
                                                        }`}
                                                        style={{ width: `${paymentPercent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>

                                        {/* 6. Content Progress Column */}
                                        <td className="px-4 py-3 min-w-[130px]">
                                            {(() => {
                                                const recordedCount = c.videosList?.length || 0;
                                                const agreedCount = c.content_count || 1;
                                                const percent = Math.min(100, Math.round((recordedCount / agreedCount) * 100));

                                                return (
                                                    <div 
                                                        onClick={e => openPopover(e, c, 'count')}
                                                        className="cursor-pointer group/cnt p-1.5 rounded-lg hover:bg-slate-100/80 transition-colors border border-transparent hover:border-slate-200"
                                                        title="Click to edit agreed content count"
                                                    >
                                                        <div className="flex justify-between items-center text-xs mb-1 font-medium">
                                                            <span className="text-slate-700 font-semibold text-[11px]">
                                                                {recordedCount} / {agreedCount} <span className="text-[10px] font-normal text-slate-500">vids</span>
                                                            </span>
                                                            <span className={`${percent === 100 ? 'text-emerald-600' : 'text-blue-600'} font-semibold text-[11px]`}>
                                                                {percent}%
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    percent === 100 
                                                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                                                                        : percent > 0 
                                                                        ? 'bg-gradient-to-r from-blue-500 to-indigo-400' 
                                                                        : 'bg-slate-300'
                                                                }`}
                                                                style={{ width: `${percent}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* 7. Reported Videos Column (Shrink to 4 links max + "+XX more ▼" toggle) */}
                                        <td className="px-4 py-3 max-w-[260px]">
                                            <div 
                                                onClick={e => openPopover(e, c, 'videos')}
                                                className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[42px]"
                                                title="Click to manage videos & links"
                                            >
                                                {allVids.length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {displayedVids.map((vid, idx) => {
                                                            const displayTitle = vid.title || (vid.video_url ? vid.video_url.replace(/^https?:\/\/(www\.)?/, '') : `Video #${idx + 1}`);
                                                            return (
                                                                <div key={idx} className="h-6 flex items-center text-xs">
                                                                    <a 
                                                                        href={vid.video_url} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        onClick={e => e.stopPropagation()}
                                                                        className="font-medium text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1.5 truncate max-w-[240px]"
                                                                        title={vid.video_url}
                                                                    >
                                                                        {renderPlatformIcon(vid.video_url)}
                                                                        <span className="truncate">{displayTitle}</span>
                                                                    </a>
                                                                </div>
                                                            );
                                                        })}
                                                        {allVids.length > 4 && (
                                                            <button
                                                                type="button"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    setExpandedVideoRows(prev => ({ ...prev, [c.id]: !prev[c.id] }));
                                                                }}
                                                                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 pt-1 border-t border-slate-100"
                                                            >
                                                                <span>{isExpanded ? 'Show less' : `+${allVids.length - 4} more`}</span>
                                                                <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? '-rotate-90' : 'rotate-90'}`} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1 hover:text-slate-600">
                                                        <Plus className="w-3.5 h-3.5" />
                                                        <span>Add</span>
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 8. Released Date Column (Exact 1:1 Horizontal Alignment with Reported Videos) */}
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700 font-normal">
                                            <div className="p-2 border border-transparent min-h-[42px] flex flex-col justify-center">
                                                {allVids.length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {displayedVids.map((vid, idx) => (
                                                            <div key={idx} className="h-6 flex items-center truncate text-slate-700">
                                                                {vid.released_date ? formatDateDisplay(vid.released_date) : '—'}
                                                            </div>
                                                        ))}
                                                        {allVids.length > 4 && (
                                                            <div className="text-[11px] font-semibold text-transparent mt-1 pt-1 border-t border-transparent select-none">
                                                                &nbsp;
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="h-6 flex items-center">{c.released_date ? formatDateDisplay(c.released_date) : '—'}</div>
                                                )}
                                            </div>
                                        </td>

                                        {/* 9. Contract Column (No FileText icon) */}
                                        <td className="px-4 py-3 max-w-[200px]">
                                            <div 
                                                onClick={e => openPopover(e, c, 'agreement')}
                                                className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[42px] flex flex-col justify-center"
                                                title="Click to manage contract documents & links"
                                            >
                                                {(() => {
                                                    const docUrls = (c.agreement_link || '').match(/(https?:\/\/[^\s,]+)/g) || [];
                                                    if (docUrls.length > 0) {
                                                        return (
                                                            <div className="space-y-1">
                                                                {docUrls.map((url, idx) => {
                                                                    const title = docUrls.length > 1 ? `Contract #${idx + 1}` : 'View Contract';
                                                                    return (
                                                                        <div key={idx} className="text-xs">
                                                                            <a 
                                                                                href={url} 
                                                                                target="_blank" 
                                                                                rel="noopener noreferrer" 
                                                                                onClick={e => e.stopPropagation()}
                                                                                className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1.5 truncate max-w-[180px] py-0.5"
                                                                                title={url}
                                                                            >
                                                                                <span className="truncate">{title}</span>
                                                                            </a>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    } else if (c.agreement_link && c.agreement_link.trim()) {
                                                        return (
                                                            <a 
                                                                href={c.agreement_link} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer" 
                                                                onClick={e => e.stopPropagation()}
                                                                className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1.5 truncate max-w-[180px] text-xs py-0.5"
                                                            >
                                                                <span className="truncate">View Contract</span>
                                                            </a>
                                                        );
                                                    }
                                                    return (
                                                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1 hover:text-slate-600">
                                                            <Plus className="w-3.5 h-3.5" />
                                                            <span>Add</span>
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </td>

                                        {/* 10. Action Column (Delete deal record) */}
                                        <td className="px-4 py-3 text-center whitespace-nowrap align-middle">
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setDeleteConfirmCollab(c);
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center justify-center"
                                                title="Remove deal record"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* STICKY CELL-ANCHORED POPOVERS — Clean theme, no heavy shadows */}
            {activePopover && activePopover.anchorRect && createPortal(
                <div 
                    ref={popoverRef}
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: `${Math.min(window.innerHeight - 320, activePopover.anchorRect.bottom + 4)}px`,
                        left: `${Math.min(window.innerWidth - 340, Math.max(16, activePopover.anchorRect.left))}px`,
                        zIndex: 99999
                    }}
                    className="bg-white rounded-2xl border border-[#bfdbfe]/80 shadow-xs p-4 w-80 font-sans"
                >
                    {/* 1. Date Single Mini Calendar Popover */}
                    {activePopover.type === 'date' && (
                        <MiniCalendarPicker 
                            initialDate={collaborations.find(c => c.id === activePopover.rowId)?.start_month}
                            onSelectDate={(formattedDate) => updateCollaborationField(activePopover.rowId, 'start_month', formattedDate)}
                            onClose={() => setActivePopover(null)}
                        />
                    )}

                    {/* 2. Status Tag Popover (With Hover Edit/Delete Action Icons) */}
                    {activePopover.type === 'progress' && (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Status Tag</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Tag Options List */}
                            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                {tagOptions.map((t, idx) => {
                                    if (editingTagIdx === idx) {
                                        return (
                                            <div key={idx} className="flex items-center gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-300">
                                                <input 
                                                    type="text" 
                                                    autoFocus 
                                                    value={editingTagVal}
                                                    onChange={e => setEditingTagVal(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleSaveEditTag(idx);
                                                    }}
                                                    className="w-full text-xs p-1 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white font-medium"
                                                />
                                                <button 
                                                    onClick={() => handleSaveEditTag(idx)} 
                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg shrink-0"
                                                    title="Save name"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={t} className="group/tag flex items-center justify-between p-1 rounded-xl hover:bg-slate-50 transition-colors">
                                            <button
                                                onClick={() => updateCollaborationField(activePopover.rowId, 'progress_status', t)}
                                                className={`flex-1 text-left px-3 py-1.5 rounded-lg text-xs border transition-colors ${getProgressTagStyle(t)}`}
                                            >
                                                <span>{t}</span>
                                            </button>
                                            <div className="opacity-0 group-hover/tag:opacity-100 flex items-center gap-0.5 ml-1 transition-opacity">
                                                <button 
                                                    onClick={e => { e.stopPropagation(); setEditingTagIdx(idx); setEditingTagVal(t); }} 
                                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded-md"
                                                    title="Rename tag"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={e => { e.stopPropagation(); handleDeleteTag(idx); }} 
                                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                                                    title="Delete tag option"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add Custom Tag Form */}
                            <div className="pt-2 border-t border-slate-100 flex gap-1.5">
                                <input 
                                    type="text" 
                                    value={newCustomTagInput} 
                                    onChange={e => setNewCustomTagInput(e.target.value)} 
                                    placeholder="Add custom status tag..." 
                                    className="w-full p-1.5 border border-slate-300 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent-color)] font-normal"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddCustomTag(); }}
                                />
                                <button 
                                    onClick={handleAddCustomTag}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-xl shrink-0"
                                >
                                    Add
                                </button>
                            </div>

                            {/* Reset to Automatic Status */}
                            <div className="pt-2 border-t border-slate-100">
                                <button
                                    onClick={() => {
                                        const row = collaborations.find(c => c.id === activePopover.rowId);
                                        handleResetToAutoStatus(activePopover.rowId, row?.system_status);
                                    }}
                                    className="w-full text-center py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Reset to automatic status</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 3. Payment Actual Spent Sticky Popover */}
                    {activePopover.type === 'payment' && (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Actual Spent Budget</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                                    Actual Budget Spent ($ USD)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-slate-400 font-semibold">$</span>
                                    <input 
                                        type="number"
                                        min="0"
                                        step="any"
                                        autoFocus
                                        value={spentInputVal}
                                        onChange={e => setSpentInputVal(e.target.value)}
                                        className="w-full pl-7 pr-3 py-1.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateCollaborationField(activePopover.rowId, 'actual_spent', parseFloat(spentInputVal) || 0)} 
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Spent
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 4. Package Amount Sticky Popover */}
                    {activePopover.type === 'package' && (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Contract Package</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                                    Package Amount ($ USD)
                                </label>
                                <input 
                                    type="text"
                                    autoFocus
                                    value={pkgInputVal}
                                    onChange={e => setPkgInputVal(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                    placeholder="$5,000"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateCollaborationField(activePopover.rowId, 'total_package', pkgInputVal)} 
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Package
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 5. Content Count Sticky Popover */}
                    {activePopover.type === 'count' && (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Agreed Content Count</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                                    Target Number of Contents
                                </label>
                                <input 
                                    type="number"
                                    min="1"
                                    autoFocus
                                    value={countInputVal}
                                    onChange={e => setCountInputVal(parseInt(e.target.value) || 1)}
                                    className="w-full p-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateCollaborationField(activePopover.rowId, 'content_count', countInputVal)} 
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Count
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 6. Video Links Manager Popover (With Platform Icons & Link Editing) */}
                    {activePopover.type === 'videos' && (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Manage Video Links</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Existing Video Links List */}
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {videoUrlsList.map((url, idx) => {
                                    if (editingUrlIdx === idx) {
                                        return (
                                            <div key={idx} className="flex items-center gap-1.5 p-1.5 bg-slate-50 rounded-xl border border-slate-300">
                                                <input 
                                                    type="text" 
                                                    autoFocus 
                                                    value={editingUrlVal} 
                                                    onChange={e => setEditingUrlVal(e.target.value)}
                                                    className="w-full text-xs p-1 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white font-normal"
                                                />
                                                <button 
                                                    onClick={() => {
                                                        const copy = [...videoUrlsList];
                                                        copy[idx] = editingUrlVal.trim();
                                                        setVideoUrlsList(copy);
                                                        setEditingUrlIdx(null);
                                                    }} 
                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg shrink-0"
                                                    title="Save URL link"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={idx} className="flex items-center justify-between gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-200 group/vlink">
                                            <div className="flex items-center gap-1.5 truncate max-w-[190px]">
                                                {renderPlatformIcon(url)}
                                                <span className="text-[11px] font-normal text-slate-700 truncate">{url}</span>
                                            </div>
                                            <div className="flex items-center gap-0.5">
                                                <button 
                                                    onClick={() => { setEditingUrlIdx(idx); setEditingUrlVal(url); }}
                                                    className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
                                                    title="Edit video URL"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => setVideoUrlsList(prev => prev.filter((_, i) => i !== idx))} 
                                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md"
                                                    title="Delete video link"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add New Video Link Input */}
                            <div className="pt-2 border-t border-slate-100 space-y-2">
                                <label className="block text-[11px] font-semibold text-slate-600 uppercase">Add New Video URL</label>
                                <input 
                                    type="text" 
                                    value={newVideoUrlInput} 
                                    onChange={e => setNewVideoUrlInput(e.target.value)} 
                                    placeholder="https://..."
                                    className="w-full p-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[var(--accent-color)] font-normal"
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveVideosPopover(activePopover.rowId); }}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => handleSaveVideosPopover(activePopover.rowId)} 
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Video Links
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 7. Agreement Links Manager Popover */}
                    {activePopover.type === 'agreement' && (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Manage Contract Documents</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Existing Document Links List */}
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {agreementUrlsList.map((url, idx) => {
                                    if (editingAgreementIdx === idx) {
                                        return (
                                            <div key={idx} className="flex items-center gap-1.5 p-1.5 bg-slate-50 rounded-xl border border-slate-300">
                                                <input 
                                                    type="text" 
                                                    autoFocus 
                                                    value={editingAgreementVal} 
                                                    onChange={e => setEditingAgreementVal(e.target.value)}
                                                    className="w-full text-xs p-1 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white font-normal"
                                                />
                                                <button 
                                                    onClick={() => {
                                                        const copy = [...agreementUrlsList];
                                                        copy[idx] = editingAgreementVal.trim();
                                                        setAgreementUrlsList(copy);
                                                        setEditingAgreementIdx(null);
                                                    }} 
                                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg shrink-0"
                                                    title="Save URL link"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={idx} className="flex items-center justify-between gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-200 group/alink">
                                            <div className="flex items-center gap-1.5 truncate max-w-[190px]">
                                                <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                                <span className="text-[11px] font-normal text-slate-700 truncate">{url}</span>
                                            </div>
                                            <div className="flex items-center gap-0.5">
                                                <button 
                                                    onClick={() => { setEditingAgreementIdx(idx); setEditingAgreementVal(url); }}
                                                    className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
                                                    title="Edit document URL"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => setAgreementUrlsList(prev => prev.filter((_, i) => i !== idx))} 
                                                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md"
                                                    title="Delete document link"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add New Document Link Input */}
                            <div className="pt-2 border-t border-slate-100 space-y-2">
                                <label className="block text-[11px] font-semibold text-slate-600 uppercase">Add New Document URL</label>
                                <input 
                                    type="text" 
                                    value={newAgreementUrlInput} 
                                    onChange={e => setNewAgreementUrlInput(e.target.value)} 
                                    placeholder="https://..."
                                    className="w-full p-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[var(--accent-color)] font-normal"
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveAgreementPopover(activePopover.rowId); }}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => handleSaveAgreementPopover(activePopover.rowId)} 
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Documents
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* ENHANCED ADD NEW DEAL MODAL — Rendered via Portal to escape parent container scroll */}
            {showAddModal && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[99999] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                                <Plus className="w-5 h-5 text-[var(--accent-color)]" />
                                <span>Add New Influencer Deal</span>
                            </h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>

                        <form onSubmit={handleCreateCollaboration} className="p-6 space-y-5">
                            
                            {/* Mode Tabs: Select Existing vs Add New YouTube Channel */}
                            <div className="flex rounded-xl bg-slate-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setKolSourceMode('existing')}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                        kolSourceMode === 'existing'
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    Existing KOL List
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setKolSourceMode('new_yt')}
                                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                        kolSourceMode === 'new_yt'
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    <Youtube className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                                    <span>New YouTube Channel</span>
                                </button>
                            </div>

                            {/* Mode 1: Select Existing KOL */}
                            {kolSourceMode === 'existing' && (
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Select Creator
                                    </label>
                                    <select 
                                        value={newKolId}
                                        onChange={e => setNewKolId(e.target.value)}
                                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none bg-white text-sm font-medium"
                                    >
                                        <option value="">-- Choose from existing KOLs --</option>
                                        {allKols.map(k => (
                                            <option key={k.id} value={k.id}>{k.name} ({k.country || 'United States'})</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Mode 2: Fetch New YouTube Channel URL */}
                            {kolSourceMode === 'new_yt' && (
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        YouTube Channel URL / Handle
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Youtube className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                            <input 
                                                type="text" 
                                                value={ytChannelUrlInput}
                                                onChange={e => setYtChannelUrlInput(e.target.value)}
                                                placeholder="https://www.youtube.com/@Taysthetic"
                                                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-normal"
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleFetchYtChannel(); } }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleFetchYtChannel}
                                            disabled={fetchingYt || !ytChannelUrlInput.trim()}
                                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                        >
                                            {fetchingYt ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    <span>Fetching...</span>
                                                </>
                                            ) : (
                                                <span>Fetch Details</span>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* LIVE KOL PREVIEW CARD */}
                            {((kolSourceMode === 'existing' && selectedExistingKol) || (kolSourceMode === 'new_yt' && fetchedKolData)) && (
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                                        Creator Live Preview
                                    </div>
                                    <KOLCell 
                                        kol={kolSourceMode === 'existing' ? selectedExistingKol : fetchedKolData} 
                                    />
                                </div>
                            )}

                            {/* Collab Started Date & Package Amount Inputs */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5 relative">
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Collab Started Date
                                    </label>
                                    <button 
                                        type="button"
                                        onClick={() => setShowModalCalendar(!showModalCalendar)}
                                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none bg-white text-xs text-left font-medium flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-1.5 text-slate-800">
                                            <Calendar className="w-4 h-4 text-slate-400" />
                                            <span>{newStartMonth || 'Select Date'}</span>
                                        </div>
                                    </button>

                                    {/* Modal Single Calendar Picker Popover */}
                                    {showModalCalendar && (
                                        <div className="absolute top-full left-0 mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 w-72 z-50">
                                            <MiniCalendarPicker 
                                                initialDate={newStartMonth}
                                                onSelectDate={(dt) => {
                                                    setNewStartMonth(dt);
                                                    setShowModalCalendar(false);
                                                }}
                                                onClose={() => setShowModalCalendar(false)}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Contract Package ($)
                                    </label>
                                    <input 
                                        type="text" 
                                        value={newPackage}
                                        onChange={e => setNewPackage(e.target.value)}
                                        placeholder="$5,000"
                                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-medium"
                                    />
                                </div>
                            </div>

                            {/* Modal Action Buttons */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button" 
                                    onClick={() => setShowAddModal(false)} 
                                    className="px-5 py-2.5 rounded-full font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-6 py-2.5 rounded-full font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 transition-colors shadow-xs text-sm"
                                >
                                    Create Deal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
            {/* DELETE DEAL CONFIRMATION MODAL */}
            {deleteConfirmCollab && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center gap-3 text-amber-600">
                            <div className="p-3 bg-amber-50 rounded-2xl">
                                <Trash2 className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">Remove Deal Record</h3>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Are you sure you want to remove this deal record for <strong className="text-slate-900">{deleteConfirmCollab.kols?.name || 'this influencer'}</strong>? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setDeleteConfirmCollab(null)}
                                className="px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteCollaboration(deleteConfirmCollab.id)}
                                className="px-5 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm"
                            >
                                Yes, Remove Deal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InfluencerProgress;
