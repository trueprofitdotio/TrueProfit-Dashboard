import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import { 
    Calendar, Filter, Search, ArrowUpDown, Plus, Trash2, Edit2, Check,
    ExternalLink, Play, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight 
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
    'Pending/Canceled',
    '1st Payment Done',
    '2nd Payment Done',
    'Awaiting Content',
    'Third content aired',
    'Awaiting Payment'
];

const getProgressTagStyle = (status?: string | null) => {
    if (!status) return 'bg-slate-100 text-slate-700 border-slate-200';
    const s = status.trim().toLowerCase();
    if (s === 'all done') return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
    if (s === 'pending/canceled' || s === 'canceled' || s === 'cancelled') return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
    if (s.includes('1st payment') || s.includes('2nd payment')) return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
    if (s.includes('awaiting content') || s.includes('third content')) return 'bg-purple-100 text-purple-800 border-purple-300 font-bold';
    if (s.includes('awaiting payment')) return 'bg-sky-100 text-sky-800 border-sky-300 font-bold';
    return 'bg-slate-100 text-slate-800 border-slate-300 font-medium';
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
    return <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
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
                <span className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[var(--accent-color)]" />
                    <span>Collab Started Date</span>
                </span>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>

            {/* Navigation Header */}
            <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-xl border border-slate-200 select-none">
                <div className="flex items-center gap-0.5">
                    <button onClick={handlePrevYear} title="Previous Year" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button onClick={handlePrevMonth} title="Previous Month" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>
                <span className="text-xs font-bold text-slate-800">
                    {monthNames[viewMonth]} {viewYear}
                </span>
                <div className="flex items-center gap-0.5">
                    <button onClick={handleNextMonth} title="Next Month" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <button onClick={handleNextYear} title="Next Year" className="p-1 hover:bg-slate-200/80 rounded-lg text-slate-600 transition-colors">
                        <ChevronsRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Days Grid */}
            <div>
                <div className="grid grid-cols-7 gap-1 text-center mb-1 select-none">
                    {dayHeaders.map(dh => (
                        <div key={dh} className="text-[10px] font-bold text-slate-400 uppercase py-0.5">{dh}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                    {daysGrid.map((day, idx) => {
                        if (day === null) {
                            return <div key={idx} className="h-7" />;
                        }
                        return (
                            <button
                                key={idx}
                                onClick={() => handleSelectDay(day)}
                                className="h-7 w-7 mx-auto flex items-center justify-center rounded-lg text-xs font-semibold text-slate-700 hover:bg-[var(--accent-color)] hover:text-white transition-colors"
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

    // Custom Tag Options list
    const [tagOptions, setTagOptions] = useState<string[]>(DEFAULT_PROGRESS_TAGS);
    const [newCustomTagInput, setNewCustomTagInput] = useState('');
    const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
    const [editingTagVal, setEditingTagVal] = useState('');

    // Video editing state
    const [editingUrlIdx, setEditingUrlIdx] = useState<number | null>(null);
    const [editingUrlVal, setEditingUrlVal] = useState('');

    // Filters & Sorting state
    const [searchQuery, setSearchQuery] = useState('');
    const [filterTag, setFilterTag] = useState<string>('All');
    const [filterCountry, setFilterCountry] = useState<string>('All');
    const [sortField, setSortField] = useState<keyof CollaborationRow | 'kol_name' | 'payment_percent'>('start_month');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Sticky Popover states: anchored to specific row and cell type
    const [activePopover, setActivePopover] = useState<{
        rowId: string;
        type: 'date' | 'progress' | 'payment' | 'videos' | 'package' | 'count';
        anchorRect?: DOMRect;
    } | null>(null);

    // Popover input values
    const [spentInputVal, setSpentInputVal] = useState<string>('0');
    const [pkgInputVal, setPkgInputVal] = useState<string>('');
    const [countInputVal, setCountInputVal] = useState<number>(1);
    const [videoUrlsList, setVideoUrlsList] = useState<string[]>([]);
    const [newVideoUrlInput, setNewVideoUrlInput] = useState('');

    // Modal state for adding new record
    const [showAddModal, setShowAddModal] = useState(false);
    const [newKolId, setNewKolId] = useState('');
    const [newKolName, setNewKolName] = useState('');
    const [newStartMonth, setNewStartMonth] = useState('');
    const [newPackage, setNewPackage] = useState('');

    const popoverRef = useRef<HTMLDivElement>(null);
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
                    const found = videosData.find(v => v.video_url === url || (v.video_url && url.includes(v.video_url)));
                    return {
                        id: found?.id || url,
                        video_url: url,
                        title: found?.title || null,
                        released_date: found?.released_date || null,
                        current_views: found?.current_views || null
                    };
                });

                const latestRelDate = matchedVids.map(v => v.released_date).filter(Boolean)[0] || c.released_date;

                return {
                    ...c,
                    released_date: latestRelDate,
                    videosList: matchedVids
                };
            });

            setCollaborations(collabsWithVideos);
            setAllKols(kolsRes.data as KolData[]);
        } catch (e) {
            console.error('Error fetching progress data:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Close popovers on click outside or scroll
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setActivePopover(null);
            }
        };
        const handleScroll = () => {
            setActivePopover(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, []);

    // Update cell value in local state & Supabase
    const updateCollaborationField = async (rowId: string, field: keyof CollaborationRow, value: any) => {
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

    // Open Sticky Cell Popover
    const openPopover = (
        e: React.MouseEvent, 
        row: CollaborationRow, 
        type: 'date' | 'progress' | 'payment' | 'videos' | 'package' | 'count'
    ) => {
        e.stopPropagation();
        const targetElement = e.currentTarget as HTMLElement;
        const rect = targetElement.getBoundingClientRect();

        setEditingTagIdx(null);
        setEditingUrlIdx(null);

        if (type === 'payment') {
            setSpentInputVal(String(row.actual_spent || 0));
        } else if (type === 'videos') {
            const urls = (row.report_links || '').match(/(https?:\/\/[^\s,]+)/g) || [];
            setVideoUrlsList(urls);
            setNewVideoUrlInput('');
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

    // Add new custom progress tag
    const handleAddCustomTag = () => {
        if (!newCustomTagInput.trim()) return;
        const tag = newCustomTagInput.trim();
        if (!tagOptions.includes(tag)) {
            setTagOptions(prev => [...prev, tag]);
        }
        if (activePopover?.rowId) {
            updateCollaborationField(activePopover.rowId, 'progress_status', tag);
        }
        setNewCustomTagInput('');
    };

    // Save edited tag option name
    const handleSaveEditTag = (idx: number) => {
        if (!editingTagVal.trim()) return;
        const oldTag = tagOptions[idx];
        const newTag = editingTagVal.trim();
        setTagOptions(prev => prev.map((t, i) => i === idx ? newTag : t));
        
        // Update active row if it was using old tag name
        if (activePopover?.rowId) {
            const currentCollab = collaborations.find(c => c.id === activePopover.rowId);
            if (currentCollab?.progress_status === oldTag) {
                updateCollaborationField(activePopover.rowId, 'progress_status', newTag);
            }
        }
        setEditingTagIdx(null);
    };

    // Delete tag option
    const handleDeleteTag = (idx: number) => {
        const tagToDelete = tagOptions[idx];
        setTagOptions(prev => prev.filter((_, i) => i !== idx));
        if (activePopover?.rowId) {
            const currentCollab = collaborations.find(c => c.id === activePopover.rowId);
            if (currentCollab?.progress_status === tagToDelete) {
                updateCollaborationField(activePopover.rowId, 'progress_status', null);
            }
        }
    };

    // Create New Collaboration Record
    const handleCreateCollaboration = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let kolIdToUse = newKolId;
            if (!kolIdToUse && newKolName.trim()) {
                const { data: newKol, error: kolErr } = await supabaseClient
                    .from('kols')
                    .insert({ name: newKolName.trim(), country: 'United States' })
                    .select()
                    .single();
                if (kolErr) throw kolErr;
                kolIdToUse = newKol.id;
            }

            if (!kolIdToUse) {
                alert('Please select or enter a KOL name.');
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
            setNewKolName('');
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
            const country = c.kols?.country || '';
            const tag = c.progress_status || '';

            const matchesSearch = !searchQuery || kolName.includes(searchQuery.toLowerCase());
            const matchesTag = filterTag === 'All' || tag === filterTag;
            const matchesCountry = filterCountry === 'All' || country === filterCountry;

            return matchesSearch && matchesTag && matchesCountry;
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

    const availableCountries = Array.from(new Set(allKols.map(k => k.country).filter(Boolean)));

    return (
        <div className="card p-6 space-y-6">
            {/* Header & Main Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <span>Influencer Progress Workspace</span>
                        <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Live System
                        </span>
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Track partnership deals, inline progress statuses, actual budget spent, and social media videos.
                    </p>
                </div>
                <button 
                    onClick={() => setShowAddModal(true)}
                    className="bg-[var(--accent-color)] text-white px-5 py-2.5 rounded-full font-semibold hover:bg-emerald-600 transition-colors shadow-xs text-sm flex items-center justify-center gap-1.5 w-fit shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add New Deal</span>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-[#bfdbfe]/50">
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input 
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search KOL name..."
                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                    <select 
                        value={filterTag}
                        onChange={e => setFilterTag(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                    >
                        <option value="All">All Statuses</option>
                        {tagOptions.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <select 
                        value={filterCountry}
                        onChange={e => setFilterCountry(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[var(--accent-color)] outline-none"
                    >
                        <option value="All">All Countries</option>
                        {availableCountries.map(c => (
                            <option key={c} value={c!}>{c}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table Area */}
            <div ref={tableContainerRef} className="overflow-x-auto border border-[#bfdbfe]/50 rounded-2xl shadow-xs bg-white relative">
                <table className="w-full text-sm text-left text-slate-600 border-collapse">
                    <thead className="text-xs text-[#2236ba] font-bold uppercase bg-slate-50/80 border-b border-[#bfdbfe]/50 select-none">
                        <tr>
                            <th onClick={() => handleSort('start_month')} className="px-4 py-3.5 whitespace-nowrap min-w-[130px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                <div className="flex items-center gap-1">
                                    <span>Collab Started</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('kol_name')} className="px-4 py-3.5 min-w-[220px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                <div className="flex items-center gap-1">
                                    <span>KOL</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('progress_status')} className="px-4 py-3.5 min-w-[160px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                <div className="flex items-center gap-1">
                                    <span>Status</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('payment_percent')} className="px-4 py-3.5 min-w-[160px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                <div className="flex items-center gap-1">
                                    <span>Payment Progress</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                </div>
                            </th>
                            <th onClick={() => handleSort('total_package')} className="px-4 py-3.5 text-right min-w-[110px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                <div className="flex items-center justify-end gap-1">
                                    <span>Package ($)</span>
                                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                </div>
                            </th>
                            <th className="px-4 py-3.5 text-center min-w-[80px]">Content</th>
                            <th className="px-4 py-3.5 min-w-[240px]">Reported Videos</th>
                            <th className="px-4 py-3.5 min-w-[120px]">Released Date</th>
                            <th className="px-4 py-3.5 min-w-[100px]">Agreement</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#bfdbfe]/30">
                        {loading ? (
                            <tr><td colSpan={9} className="text-center py-12 text-slate-400">Loading progress workspace...</td></tr>
                        ) : processedCollaborations.length === 0 ? (
                            <tr><td colSpan={9} className="text-center py-12 text-slate-400">No matching deals found.</td></tr>
                        ) : (
                            processedCollaborations.map(c => {
                                const totalPkgNum = parsePackageNumber(c.total_package);
                                const actualSpent = c.actual_spent || 0;
                                const paymentPercent = totalPkgNum > 0 ? Math.min(100, Math.round((actualSpent / totalPkgNum) * 100)) : 0;

                                return (
                                    <tr key={c.id} className="hover:bg-emerald-50/20 transition-colors group">
                                        
                                        {/* 1. Collab Started (Single Mini Calendar Picker) */}
                                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                                            <button 
                                                onClick={e => openPopover(e, c, 'date')}
                                                className="hover:bg-slate-100 px-2.5 py-1 rounded-lg text-slate-700 font-medium transition-colors flex items-center gap-1.5 border border-transparent hover:border-slate-200"
                                                title="Click to select partnership start date"
                                            >
                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                <span>{c.start_month || 'Select Date'}</span>
                                            </button>
                                        </td>

                                        {/* 2. KOL Universal Visual Identity */}
                                        <td className="px-4 py-3">
                                            <KOLCell kol={c.kols} />
                                        </td>

                                        {/* 3. Status Tag Column */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                onClick={e => openPopover(e, c, 'progress')}
                                                className={`px-3 py-1 rounded-full text-xs border transition-transform hover:scale-105 inline-block shadow-2xs ${getProgressTagStyle(c.progress_status)}`}
                                                title="Click to change status tag"
                                            >
                                                <span>{c.progress_status || 'Select Status'}</span>
                                            </button>
                                        </td>

                                        {/* 4. Payment Progress Column */}
                                        <td className="px-4 py-3">
                                            <div 
                                                onClick={e => openPopover(e, c, 'payment')}
                                                className="cursor-pointer group/bar p-1.5 rounded-lg hover:bg-slate-100/80 transition-colors border border-transparent hover:border-slate-200"
                                                title="Click to update Actual Budget Spent"
                                            >
                                                <div className="flex justify-between items-center text-xs mb-1 font-semibold">
                                                    <span className="text-slate-500 text-[11px]">
                                                        Spent: <strong className="text-slate-700">{formatCurrencyUSD(actualSpent)}</strong>
                                                    </span>
                                                    <span className={`${paymentPercent === 100 ? 'text-emerald-600' : 'text-blue-600'} font-bold`}>
                                                        {paymentPercent}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
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

                                        {/* 5. Package Column */}
                                        <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                                            <button 
                                                onClick={e => openPopover(e, c, 'package')}
                                                className="hover:bg-slate-100 px-2 py-1 rounded transition-colors text-right inline-block text-slate-800 font-semibold border border-transparent hover:border-slate-200"
                                                title="Click to edit package amount"
                                            >
                                                {formatCurrencyUSD(c.total_package)}
                                            </button>
                                        </td>

                                        {/* 6. Content Count Column */}
                                        <td className="px-4 py-3 text-center whitespace-nowrap">
                                            <button 
                                                onClick={e => openPopover(e, c, 'count')}
                                                className="hover:bg-slate-100 px-2.5 py-1 rounded font-bold text-slate-800 transition-colors border border-transparent hover:border-slate-200"
                                                title="Click to edit content count"
                                            >
                                                {c.content_count || 1}
                                            </button>
                                        </td>

                                        {/* 7. Reported Videos (Auto-Detected Platform Icons) */}
                                        <td className="px-4 py-3 max-w-[260px]">
                                            <div 
                                                onClick={e => openPopover(e, c, 'videos')}
                                                className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[42px] flex flex-col justify-center"
                                                title="Click to manage videos & links"
                                            >
                                                {c.videosList && c.videosList.length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {c.videosList.map((vid, idx) => {
                                                            const displayTitle = vid.title || (vid.video_url ? vid.video_url.replace(/^https?:\/\/(www\.)?/, '') : `Video #${idx + 1}`);
                                                            return (
                                                                <div key={idx} className="text-xs">
                                                                    <a 
                                                                        href={vid.video_url} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer" 
                                                                        onClick={e => e.stopPropagation()}
                                                                        className="font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1.5 truncate max-w-[240px] py-0.5"
                                                                        title={vid.video_url}
                                                                    >
                                                                        {renderPlatformIcon(vid.video_url)}
                                                                        <span className="truncate">{displayTitle}</span>
                                                                        <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                                                                    </a>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic flex items-center gap-1">
                                                        <Plus className="w-3.5 h-3.5" />
                                                        <span>Add Video Links</span>
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 8. Released Date Column */}
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700 font-medium">
                                            {c.videosList && c.videosList.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    {c.videosList.map((vid, idx) => (
                                                        <div key={idx} className="py-0.5 truncate text-slate-700">
                                                            {vid.released_date ? formatDateDisplay(vid.released_date) : '—'}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span>{c.released_date ? formatDateDisplay(c.released_date) : '—'}</span>
                                            )}
                                        </td>

                                        {/* 9. Agreement Link Column */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {c.agreement_link ? (
                                                <a 
                                                    href={c.agreement_link} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="text-xs font-semibold text-slate-600 hover:text-[var(--accent-color)] hover:underline inline-flex items-center gap-1"
                                                >
                                                    <span>View Contract</span>
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
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
                                <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Status Tag</span>
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
                                                    className="w-full text-xs p-1 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white"
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
                                    className="w-full p-1.5 border border-slate-300 rounded-xl text-xs outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddCustomTag(); }}
                                />
                                <button 
                                    onClick={handleAddCustomTag}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl shrink-0"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 3. Payment Actual Spent Sticky Popover */}
                    {activePopover.type === 'payment' && (
                        <div className="space-y-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Actual Spent Budget</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                                    Actual Budget Spent ($ USD)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                                    <input 
                                        type="number"
                                        min="0"
                                        step="any"
                                        autoFocus
                                        value={spentInputVal}
                                        onChange={e => setSpentInputVal(e.target.value)}
                                        className="w-full pl-7 pr-3 py-1.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateCollaborationField(activePopover.rowId, 'actual_spent', parseFloat(spentInputVal) || 0)} 
                                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
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
                                <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Contract Package</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                                    Package Amount ($ USD)
                                </label>
                                <input 
                                    type="text"
                                    autoFocus
                                    value={pkgInputVal}
                                    onChange={e => setPkgInputVal(e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                    placeholder="$5,000"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateCollaborationField(activePopover.rowId, 'total_package', pkgInputVal)} 
                                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
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
                                <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Content Count</span>
                                <button onClick={() => setActivePopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                                    Number of Contents
                                </label>
                                <input 
                                    type="number"
                                    min="0"
                                    autoFocus
                                    value={countInputVal}
                                    onChange={e => setCountInputVal(parseInt(e.target.value) || 0)}
                                    className="w-full p-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateCollaborationField(activePopover.rowId, 'content_count', countInputVal)} 
                                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
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
                                <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Manage Video Links</span>
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
                                                    className="w-full text-xs p-1 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white"
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
                                                <span className="text-[11px] font-medium text-slate-700 truncate">{url}</span>
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
                                <label className="block text-[11px] font-bold text-slate-600 uppercase">Add New Video URL</label>
                                <input 
                                    type="text" 
                                    value={newVideoUrlInput} 
                                    onChange={e => setNewVideoUrlInput(e.target.value)} 
                                    placeholder="https://..."
                                    className="w-full p-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveVideosPopover(activePopover.rowId); }}
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button onClick={() => setActivePopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => handleSaveVideosPopover(activePopover.rowId)} 
                                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Video Links
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* Modal: Add New Deal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <h3 className="text-lg font-bold text-slate-800">Add New Influencer Deal</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
                        </div>

                        <form onSubmit={handleCreateCollaboration} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Select Existing KOL
                                </label>
                                <select 
                                    value={newKolId}
                                    onChange={e => { setNewKolId(e.target.value); setNewKolName(''); }}
                                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none bg-white text-sm"
                                >
                                    <option value="">-- Select from list --</option>
                                    {allKols.map(k => (
                                        <option key={k.id} value={k.id}>{k.name} ({k.country || 'United States'})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="text-center text-xs font-semibold text-slate-400 uppercase">OR</div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                    Create New KOL Name
                                </label>
                                <input 
                                    type="text" 
                                    value={newKolName}
                                    onChange={e => { setNewKolName(e.target.value); setNewKolId(''); }}
                                    placeholder="e.g. Marques Brownlee"
                                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Collab Started Date
                                    </label>
                                    <input 
                                        type="text" 
                                        value={newStartMonth}
                                        onChange={e => setNewStartMonth(e.target.value)}
                                        placeholder="e.g. Feb 01, 2026"
                                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                        Contract Package ($)
                                    </label>
                                    <input 
                                        type="text" 
                                        value={newPackage}
                                        onChange={e => setNewPackage(e.target.value)}
                                        placeholder="$5,000"
                                        className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-sm"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button" 
                                    onClick={() => setShowAddModal(false)} 
                                    className="px-5 py-2.5 rounded-full font-semibold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-6 py-2.5 rounded-full font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 transition-colors shadow-xs text-sm"
                                >
                                    Create Deal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InfluencerProgress;
