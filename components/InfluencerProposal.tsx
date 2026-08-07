import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import { fetchYouTubeChannelDetails } from '../services/youtubeService';
import { 
    Plus, Search, Edit2, Trash2, X, Calendar, DollarSign, Filter, ArrowUpDown, Check, 
    Users, FileText, ArrowLeft, Upload, Image as ImageIcon, ExternalLink, Loader2, Youtube, Eye, ChevronRight
} from 'lucide-react';

interface ProposalKol {
    proposal_id: string;
    kol_id: string;
    est_rate?: number | string | null;
    deliverables?: string | null;
    terms?: string | null;
    audience_screenshots?: string | string[] | null;
    kols: KolData;
}

interface Proposal {
    id: string;
    title: string;
    status: string;
    budget: string;
    target_audience: string;
    objective: string;
    start_date: string;
    end_date: string;
    description: string;
    created_at?: string;
    updated_at?: string;
    proposal_kols?: ProposalKol[];
}

interface InfluencerProposalProps {
    onSelectProposalTitle?: (title: string | null) => void;
}

const DEFAULT_PROPOSAL_TAGS = [
    'Need to check',
    'Approved',
    'Rejected'
];

const COLOR_PALETTES = [
    'bg-amber-100 text-amber-800 border-amber-300 font-semibold',
    'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold',
    'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
    'bg-purple-100 text-purple-800 border-purple-300 font-semibold',
    'bg-sky-100 text-sky-800 border-sky-300 font-semibold',
    'bg-indigo-100 text-indigo-800 border-indigo-300 font-semibold',
    'bg-teal-100 text-teal-800 border-teal-300 font-semibold'
];

const getProposalTagStyle = (status?: string | null) => {
    if (!status) return 'bg-slate-100 text-slate-700 border-slate-200 font-normal';
    const s = status.trim().toLowerCase();
    if (s === 'need to check') return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
    if (s === 'approved') return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
    if (s === 'rejected') return 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
    if (s === 'in progress') return 'bg-blue-100 text-blue-800 border-blue-300 font-semibold';
    if (s === 'completed') return 'bg-purple-100 text-purple-800 border-purple-300 font-semibold';
    
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

const formatTimestampDetailed = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    try {
        const dt = new Date(dateStr);
        if (isNaN(dt.getTime())) return dateStr;
        return dt.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        }) + ' ' + dt.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch {
        return dateStr;
    }
};

const InfluencerProposal: React.FC<InfluencerProposalProps> = ({ onSelectProposalTitle }) => {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [allKols, setAllKols] = useState<KolData[]>([]);
    const [loading, setLoading] = useState(true);

    // Active View state: 'list' (Main Table) or 'workspace' (Detailed Creators Workspace)
    const [activeView, setActiveView] = useState<'list' | 'workspace'>('list');
    const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

    // Proposal Status Tags persisted in localStorage
    const [proposalTags, setProposalTags] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('tp_proposal_status_tags');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            console.error('Failed to load proposalTags:', e);
        }
        return DEFAULT_PROPOSAL_TAGS;
    });

    const updateProposalTagsState = (newTags: string[]) => {
        setProposalTags(newTags);
        try {
            localStorage.setItem('tp_proposal_status_tags', JSON.stringify(newTags));
        } catch (e) {}
    };

    // Tag Popover & Editing states
    const [newCustomTagInput, setNewCustomTagInput] = useState('');
    const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null);
    const [editingTagVal, setEditingTagVal] = useState('');

    // Inline Proposal Title editing state
    const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
    const [editingTitleVal, setEditingTitleVal] = useState('');

    // Delete Confirmation Modal state
    const [deleteConfirmProposal, setDeleteConfirmProposal] = useState<Proposal | null>(null);

    // Add Creator Modal state
    const [showAddCreatorModal, setShowAddCreatorModal] = useState(false);
    const [ytChannelInput, setYtChannelInput] = useState('');
    const [fetchingYt, setFetchingYt] = useState(false);

    // Lightbox image state
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    // Status Popover Anchor state
    const [activeStatusPopover, setActiveStatusPopover] = useState<{
        proposalId: string;
        anchorRect?: DOMRect;
    } | null>(null);

    // Filter & Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortField, setSortField] = useState<'created_at' | 'title' | 'budget' | 'creators'>('created_at');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const statusPopoverRef = useRef<HTMLDivElement>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [proposalsRes, kolsRes] = await Promise.all([
                supabaseClient
                    .from('proposals')
                    .select('*, proposal_kols(*, kols(*))')
                    .order('created_at', { ascending: false }),
                supabaseClient
                    .from('kols')
                    .select('*')
                    .order('name')
            ]);
                
            if (proposalsRes.error) throw proposalsRes.error;
            if (kolsRes.error) throw kolsRes.error;
            
            const rawProps = proposalsRes.data as unknown as Proposal[];
            setProposals(rawProps);
            setAllKols(kolsRes.data as KolData[]);

            // Sync db statuses into proposalTags if not explicitly saved
            const dbStatuses = rawProps.map(p => p.status).filter(Boolean) as string[];
            setProposalTags(prev => {
                const saved = localStorage.getItem('tp_proposal_status_tags');
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) return parsed;
                    } catch {}
                }
                const merged = Array.from(new Set([...prev, ...dbStatuses]));
                try {
                    localStorage.setItem('tp_proposal_status_tags', JSON.stringify(merged));
                } catch (e) {}
                return merged;
            });

        } catch (e) {
            console.error('Error fetching proposals:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Close status popover on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (statusPopoverRef.current && !statusPopoverRef.current.contains(e.target as Node)) {
                setActiveStatusPopover(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const selectedProposal = proposals.find(p => p.id === selectedProposalId);

    // Notify parent workspace of current selected proposal title for Breadcrumbs
    useEffect(() => {
        if (onSelectProposalTitle) {
            if (activeView === 'workspace' && selectedProposal) {
                onSelectProposalTitle(selectedProposal.title);
            } else {
                onSelectProposalTitle(null);
            }
        }
    }, [activeView, selectedProposalId, selectedProposal, onSelectProposalTitle]);

    // DIRECT PROPOSAL CREATION (No Popup Modal!)
    const handleAddProposalDirectly = async () => {
        const now = new Date();
        const monthDay = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        const defaultTitle = `Proposal ${monthDay}`;

        try {
            const { data: newProp, error } = await supabaseClient
                .from('proposals')
                .insert({
                    title: defaultTitle,
                    status: 'Need to check',
                    budget: '$0',
                    created_at: now.toISOString(),
                    updated_at: now.toISOString()
                })
                .select('*, proposal_kols(*, kols(*))')
                .single();

            if (error) throw error;
            
            const newProposalObj = {
                ...(newProp as unknown as Proposal),
                proposal_kols: []
            };

            setProposals(prev => [newProposalObj, ...prev]);

            // Start inline editing title immediately
            setEditingTitleId(newProposalObj.id);
            setEditingTitleVal(defaultTitle);
        } catch (err) {
            console.error('Failed to create proposal directly:', err);
            alert('Failed to create new proposal.');
        }
    };

    // Save inline edited title
    const handleSaveInlineTitle = async (proposalId: string) => {
        if (!editingTitleVal.trim()) return;
        const newTitle = editingTitleVal.trim();
        setEditingTitleId(null);

        setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, title: newTitle } : p));

        try {
            await supabaseClient
                .from('proposals')
                .update({ title: newTitle, updated_at: new Date().toISOString() })
                .eq('id', proposalId);
        } catch (err) {
            console.error('Failed to update title:', err);
        }
    };

    // Update Proposal Status
    const updateProposalStatus = async (proposalId: string, newStatus: string) => {
        setProposals(prev => prev.map(p => p.id === proposalId ? { ...p, status: newStatus } : p));
        setActiveStatusPopover(null);

        try {
            await supabaseClient
                .from('proposals')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', proposalId);
        } catch (err) {
            console.error('Failed to update status:', err);
        }
    };

    // Add Custom Status Tag
    const handleAddCustomTag = () => {
        if (!newCustomTagInput.trim()) return;
        const tag = newCustomTagInput.trim();
        if (!proposalTags.includes(tag)) {
            const nextTags = [...proposalTags, tag];
            updateProposalTagsState(nextTags);
        }
        if (activeStatusPopover?.proposalId) {
            updateProposalStatus(activeStatusPopover.proposalId, tag);
        }
        setNewCustomTagInput('');
    };

    // Rename Status Tag (Bulk updates proposals)
    const handleSaveEditTag = async (idx: number) => {
        if (!editingTagVal.trim()) return;
        const oldTag = proposalTags[idx];
        const newTag = editingTagVal.trim();

        const nextTags = proposalTags.map((t, i) => i === idx ? newTag : t);
        updateProposalTagsState(nextTags);
        setEditingTagIdx(null);

        try {
            await supabaseClient
                .from('proposals')
                .update({ status: newTag, updated_at: new Date().toISOString() })
                .eq('status', oldTag);

            setProposals(prev => prev.map(p => p.status === oldTag ? { ...p, status: newTag } : p));
        } catch (err) {
            console.error('Failed to bulk update status tag:', err);
        }
    };

    // Delete Status Tag (Bulk updates proposals to null so tag never resurrects)
    const handleDeleteTag = async (idx: number) => {
        const tagToDelete = proposalTags[idx];
        const nextTags = proposalTags.filter((_, i) => i !== idx);
        updateProposalTagsState(nextTags);

        setProposals(prev => prev.map(p => p.status === tagToDelete ? { ...p, status: 'Need to check' } : p));

        try {
            await supabaseClient
                .from('proposals')
                .update({ status: 'Need to check', updated_at: new Date().toISOString() })
                .eq('status', tagToDelete);
        } catch (err) {
            console.error('Failed to bulk delete status tag:', err);
        }
    };

    // Confirmed Delete Proposal
    const handleConfirmDeleteProposal = async () => {
        if (!deleteConfirmProposal) return;
        const pId = deleteConfirmProposal.id;
        
        try {
            await supabaseClient.from('proposal_kols').delete().eq('proposal_id', pId);
            await supabaseClient.from('proposals').delete().eq('id', pId);
            
            setProposals(prev => prev.filter(p => p.id !== pId));
            if (selectedProposalId === pId) {
                setActiveView('list');
                setSelectedProposalId(null);
            }
        } catch (err) {
            console.error('Error deleting proposal:', err);
        } finally {
            setDeleteConfirmProposal(null);
        }
    };

    // Add Creator via YouTube Channel URL / Handle
    const handleAddCreatorByYouTube = async () => {
        if (!ytChannelInput.trim() || !selectedProposalId) return;
        setFetchingYt(true);
        try {
            const info = await fetchYouTubeChannelDetails(ytChannelInput.trim());
            if (!info) {
                alert('Could not fetch YouTube channel details. Please check the URL or handle.');
                return;
            }

            // Upsert KOL into Supabase
            const { data: newKol, error: kolErr } = await supabaseClient
                .from('kols')
                .upsert({
                    name: info.title,
                    avatar_url: info.avatarUrl,
                    subscriber_count: info.subscriberCount,
                    country: info.country || 'United States',
                    channel_link: info.channelLink
                }, { onConflict: 'name' })
                .select()
                .single();

            if (kolErr) throw kolErr;

            // Link KOL to selected proposal
            await supabaseClient.from('proposal_kols').upsert({
                proposal_id: selectedProposalId,
                kol_id: newKol.id,
                deliverables: '• 1x YouTube Video'
            }, { onConflict: 'proposal_id,kol_id' });

            setYtChannelInput('');
            setShowAddCreatorModal(false);
            fetchData();
        } catch (err) {
            console.error('Error adding creator:', err);
            alert('Failed to add creator to proposal.');
        } finally {
            setFetchingYt(false);
        }
    };

    // Update Creator row details (Est Rate, Deliverables, Terms) inside Detailed Creators Workspace
    const updateProposalKolField = async (proposalId: string, kolId: string, field: string, value: any) => {
        setProposals(prev => prev.map(p => {
            if (p.id !== proposalId) return p;
            const updatedPks = (p.proposal_kols || []).map(pk => {
                if (pk.kol_id !== kolId) return pk;
                return { ...pk, [field]: value };
            });
            return { ...p, proposal_kols: updatedPks };
        }));

        try {
            await supabaseClient
                .from('proposal_kols')
                .update({ [field]: value })
                .eq('proposal_id', proposalId)
                .eq('kol_id', kolId);
        } catch (err) {
            console.error(`Failed to update proposal_kols.${field}:`, err);
            fetchData();
        }
    };

    // Remove Creator from Proposal
    const handleRemoveCreatorFromProposal = async (proposalId: string, kolId: string) => {
        setProposals(prev => prev.map(p => {
            if (p.id !== proposalId) return p;
            return {
                ...p,
                proposal_kols: (p.proposal_kols || []).filter(pk => pk.kol_id !== kolId)
            };
        }));

        try {
            await supabaseClient
                .from('proposal_kols')
                .delete()
                .eq('proposal_id', proposalId)
                .eq('kol_id', kolId);
        } catch (err) {
            console.error('Failed to remove creator from proposal:', err);
            fetchData();
        }
    };

    // Image screenshot upload / paste handler for Audience Insights
    const handleAddScreenshotToCreator = (proposalId: string, kolId: string, fileOrUrl: File | string) => {
        const targetPk = selectedProposal?.proposal_kols?.find(pk => pk.kol_id === kolId);
        let currentScreenshots: string[] = [];
        if (targetPk?.audience_screenshots) {
            if (Array.isArray(targetPk.audience_screenshots)) {
                currentScreenshots = [...targetPk.audience_screenshots];
            } else {
                try {
                    const parsed = JSON.parse(targetPk.audience_screenshots as string);
                    currentScreenshots = Array.isArray(parsed) ? parsed : [targetPk.audience_screenshots as string];
                } catch {
                    currentScreenshots = [targetPk.audience_screenshots as string];
                }
            }
        }

        if (typeof fileOrUrl === 'string') {
            const updated = [...currentScreenshots, fileOrUrl];
            updateProposalKolField(proposalId, kolId, 'audience_screenshots', updated);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target?.result as string;
                if (base64) {
                    const updated = [...currentScreenshots, base64];
                    updateProposalKolField(proposalId, kolId, 'audience_screenshots', updated);
                }
            };
            reader.readAsDataURL(fileOrUrl);
        }
    };

    const handleRemoveScreenshot = (proposalId: string, kolId: string, imgIdx: number) => {
        const targetPk = selectedProposal?.proposal_kols?.find(pk => pk.kol_id === kolId);
        let currentScreenshots: string[] = [];
        if (targetPk?.audience_screenshots) {
            if (Array.isArray(targetPk.audience_screenshots)) {
                currentScreenshots = [...targetPk.audience_screenshots];
            } else {
                try {
                    const parsed = JSON.parse(targetPk.audience_screenshots as string);
                    currentScreenshots = Array.isArray(parsed) ? parsed : [targetPk.audience_screenshots as string];
                } catch {
                    currentScreenshots = [targetPk.audience_screenshots as string];
                }
            }
        }
        const updated = currentScreenshots.filter((_, i) => i !== imgIdx);
        updateProposalKolField(proposalId, kolId, 'audience_screenshots', updated);
    };

    const handleSort = (field: 'created_at' | 'title' | 'budget' | 'creators') => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Filter & Sort proposals
    const processedProposals = proposals
        .filter(p => {
            const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = filterStatus === 'All' || p.status === filterStatus;
            return matchesSearch && matchesStatus;
        })
        .sort((a, b) => {
            let valA: any = a[sortField];
            let valB: any = b[sortField];

            if (sortField === 'created_at') {
                valA = a.created_at ? Date.parse(a.created_at) || 0 : 0;
                valB = b.created_at ? Date.parse(b.created_at) || 0 : 0;
            } else if (sortField === 'title') {
                valA = (a.title || '').toLowerCase();
                valB = (b.title || '').toLowerCase();
            } else if (sortField === 'budget') {
                const creatorsA = a.proposal_kols || [];
                const ratesSumA = creatorsA.reduce((sum, pk) => sum + (parseFloat(String(pk.est_rate || '0')) || 0), 0);
                valA = ratesSumA > 0 ? ratesSumA : parseFloat(String(a.budget || '0').replace(/[^\d.]/g, '')) || 0;

                const creatorsB = b.proposal_kols || [];
                const ratesSumB = creatorsB.reduce((sum, pk) => sum + (parseFloat(String(pk.est_rate || '0')) || 0), 0);
                valB = ratesSumB > 0 ? ratesSumB : parseFloat(String(b.budget || '0').replace(/[^\d.]/g, '')) || 0;
            } else if (sortField === 'creators') {
                valA = a.proposal_kols?.length || 0;
                valB = b.proposal_kols?.length || 0;
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

    return (
        <div className="card p-6 space-y-6 font-sans">
            
            {/* VIEW 1: MAIN PROPOSALS TABLE LIST VIEW */}
            {activeView === 'list' && (
                <>
                    {/* Header Toolbar */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-800 tracking-tight flex items-center gap-2">
                                <span>Campaign Proposals</span>
                                <span className="text-xs bg-emerald-100 text-emerald-800 font-medium px-2.5 py-0.5 rounded-full border border-emerald-200">
                                    Pitch Workspace
                                </span>
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                Plan, pitch, and track influencer campaign budgets and targeted creator proposals.
                            </p>
                        </div>
                        
                        {/* DIRECT ADD PROPOSAL BUTTON (NO POPUP MODAL!) */}
                        <button 
                            onClick={handleAddProposalDirectly}
                            className="bg-[var(--accent-color)] text-white px-5 py-2.5 rounded-full font-medium hover:bg-emerald-600 transition-colors shadow-xs text-sm flex items-center justify-center gap-1.5 w-fit shrink-0"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add New Proposal</span>
                        </button>
                    </div>

                    {/* Filter Toolbar */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative min-w-[240px]">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search proposal name..."
                                className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[var(--accent-color)] outline-none font-normal"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <select 
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[var(--accent-color)] outline-none font-medium text-slate-700"
                            >
                                <option value="All">All Statuses</option>
                                {proposalTags.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Main Table Layout */}
                    <div className="overflow-x-auto border border-[#bfdbfe]/50 rounded-2xl shadow-xs bg-white">
                        <table className="w-full text-sm text-left text-slate-600 border-collapse">
                            <thead className="text-xs text-[#2236ba] font-semibold uppercase bg-slate-50/80 border-b border-[#bfdbfe]/50 select-none">
                                <tr>
                                    <th onClick={() => handleSort('created_at')} className="px-4 py-3.5 min-w-[190px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                        <div className="flex items-center gap-1">
                                            <span>Timestamp</span>
                                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('title')} className="px-4 py-3.5 min-w-[220px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                        <div className="flex items-center gap-1">
                                            <span>Proposal Name</span>
                                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('creators')} className="px-4 py-3.5 min-w-[240px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                        <div className="flex items-center gap-1">
                                            <span>Creators Info</span>
                                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('budget')} className="px-4 py-3.5 text-right min-w-[140px] cursor-pointer hover:bg-slate-100/80 transition-colors">
                                        <div className="flex items-center justify-end gap-1">
                                            <span>Total Est. Rate</span>
                                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                                        </div>
                                    </th>
                                    <th className="px-4 py-3.5 min-w-[150px]">Status</th>
                                    <th className="px-4 py-3.5 text-center min-w-[100px]">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#bfdbfe]/30">
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-12 text-slate-400">Loading proposals...</td></tr>
                                ) : processedProposals.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-12 text-slate-400">No proposals found. Click "+ Add New Proposal" to create one directly.</td></tr>
                                ) : (
                                    processedProposals.map(p => {
                                        const creators = p.proposal_kols || [];
                                        
                                        // Auto calculate total estimated rate from detailed creator rates
                                        const ratesSum = creators.reduce((sum, pk) => sum + (parseFloat(String(pk.est_rate || '0')) || 0), 0);
                                        const totalEstRateNum = ratesSum > 0 ? ratesSum : (parseFloat(String(p.budget || '0').replace(/[^\d.]/g, '')) || 0);

                                        return (
                                            <tr 
                                                key={p.id} 
                                                onClick={() => {
                                                    setSelectedProposalId(p.id);
                                                    setActiveView('workspace');
                                                }}
                                                className="hover:bg-emerald-50/20 transition-colors group cursor-pointer"
                                            >
                                                {/* 1. Timestamp (Not editable, light small font) */}
                                                <td className="px-4 py-3 whitespace-nowrap text-xs font-normal text-slate-500">
                                                    {formatTimestampDetailed(p.created_at)}
                                                </td>

                                                {/* 2. Proposal Name (Inline Editable) */}
                                                <td className="px-4 py-3 max-w-[240px]" onClick={e => e.stopPropagation()}>
                                                    {editingTitleId === p.id ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <input 
                                                                type="text" 
                                                                autoFocus
                                                                value={editingTitleVal}
                                                                onChange={e => setEditingTitleVal(e.target.value)}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleSaveInlineTitle(p.id); }}
                                                                className="w-full text-sm font-medium p-1 border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white"
                                                            />
                                                            <button 
                                                                onClick={() => handleSaveInlineTitle(p.id)}
                                                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg shrink-0"
                                                                title="Save name"
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div 
                                                            onClick={() => { setEditingTitleId(p.id); setEditingTitleVal(p.title); }}
                                                            className="font-medium text-slate-900 text-sm hover:text-[var(--accent-color)] transition-colors truncate flex items-center gap-1.5 group/t"
                                                            title="Click to rename proposal"
                                                        >
                                                            <span className="truncate">{p.title}</span>
                                                            <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover/t:opacity-100 transition-opacity shrink-0" />
                                                        </div>
                                                    )}
                                                </td>

                                                {/* 3. Creators Info (Total Count Badge + Overlapped Avatars Stack with Rich Hover Tooltip) */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5" onClick={e => e.stopPropagation()}>
                                                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                                                            {creators.length}
                                                        </span>
                                                        {creators.length > 0 ? (
                                                            <div className="flex items-center -space-x-2.5 overflow-visible">
                                                                {creators.slice(0, 5).map((pk, idx) => {
                                                                    const k = pk.kols;
                                                                    if (!k) return null;
                                                                    const initials = (k.name || 'K').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

                                                                    return (
                                                                        <div 
                                                                            key={k.id || idx} 
                                                                            className="relative group/avatar cursor-pointer"
                                                                            style={{ zIndex: 10 - idx }}
                                                                        >
                                                                            {k.avatar_url ? (
                                                                                <img 
                                                                                    src={k.avatar_url} 
                                                                                    alt={k.name} 
                                                                                    className="w-8 h-8 rounded-full object-cover ring-2 ring-white shadow-xs"
                                                                                />
                                                                            ) : (
                                                                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-semibold text-[10px] flex items-center justify-center ring-2 ring-white shadow-xs">
                                                                                    {initials}
                                                                                </div>
                                                                            )}

                                                                            {/* Hover Rich Creator Card Tooltip */}
                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/avatar:flex flex-col gap-1 p-2.5 bg-slate-900 text-white rounded-xl shadow-xl z-50 min-w-[180px] pointer-events-none animate-in fade-in zoom-in-95">
                                                                                <div className="flex items-center gap-2">
                                                                                    {k.avatar_url ? (
                                                                                        <img src={k.avatar_url} alt={k.name} className="w-6 h-6 rounded-full object-cover" />
                                                                                    ) : (
                                                                                        <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                                                                                            {initials}
                                                                                        </div>
                                                                                    )}
                                                                                    <span className="font-semibold text-xs text-white truncate">{k.name}</span>
                                                                                </div>
                                                                                <div className="text-[10px] text-slate-300 flex items-center justify-between pt-1 border-t border-slate-700">
                                                                                    <span>{k.country || 'United States'}</span>
                                                                                    <span className="text-emerald-400 font-semibold">
                                                                                        {k.subscriber_count ? `${parseInt(String(k.subscriber_count)).toLocaleString()} subs` : '—'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                                {creators.length > 5 && (
                                                                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold text-[10px] flex items-center justify-center ring-2 ring-white shadow-xs">
                                                                        +{creators.length - 5}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 italic">No creators added</span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* 4. Total Est. Rate / Budget (Not auto filled, synced from creators rates) */}
                                                <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                                                    {formatCurrencyUSD(totalEstRateNum)}
                                                </td>

                                                {/* 5. Status Badge & Popover */}
                                                <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={e => {
                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                            setEditingTagIdx(null);
                                                            setActiveStatusPopover({ proposalId: p.id, anchorRect: rect });
                                                        }}
                                                        className={`px-3 py-1 rounded-full text-xs border transition-transform hover:scale-105 inline-block shadow-2xs ${getProposalTagStyle(p.status)}`}
                                                        title="Click to update status tag"
                                                    >
                                                        <span>{p.status || 'Need to check'}</span>
                                                    </button>
                                                </td>

                                                {/* 6. Action Button (Trash Icon -> Confirmation Modal) */}
                                                <td className="px-4 py-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                                    <button 
                                                        onClick={() => setDeleteConfirmProposal(p)} 
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-70 hover:opacity-100"
                                                        title="Delete Proposal"
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
                </>
            )}

            {/* VIEW 2: DETAILED CREATORS PROPOSAL WORKSPACE VIEW */}
            {activeView === 'workspace' && selectedProposal && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    
                    {/* Workspace Navigation & Title Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                        <div>
                            <button 
                                onClick={() => {
                                    setActiveView('list');
                                    setSelectedProposalId(null);
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>Back to Proposals List</span>
                            </button>

                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                                    {selectedProposal.title}
                                </h2>
                                <span className={`px-3 py-0.5 rounded-full text-xs border ${getProposalTagStyle(selectedProposal.status)}`}>
                                    {selectedProposal.status}
                                </span>
                            </div>

                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                                <span>Created: <strong>{formatTimestampDetailed(selectedProposal.created_at)}</strong></span>
                                <span>•</span>
                                <span>Objective: <strong>{selectedProposal.objective || 'N/A'}</strong></span>
                            </p>
                        </div>

                        {/* Top Actions: Add Creator & Total Budget Summary */}
                        <div className="flex items-center gap-3">
                            <div className="text-right px-4 py-2 bg-slate-50 rounded-xl border border-slate-200">
                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Proposal Est. Rate</div>
                                <div className="text-base font-semibold text-slate-900">
                                    {formatCurrencyUSD(
                                        (selectedProposal.proposal_kols || []).reduce((sum, pk) => sum + (parseFloat(String(pk.est_rate || '0')) || 0), 0)
                                    )}
                                </div>
                            </div>

                            <button 
                                onClick={() => setShowAddCreatorModal(true)}
                                className="bg-[var(--accent-color)] text-white px-4 py-2.5 rounded-xl font-medium hover:bg-emerald-600 transition-colors shadow-xs text-xs flex items-center justify-center gap-1.5"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Add Creator to Proposal</span>
                            </button>
                        </div>
                    </div>

                    {/* DETAILED CREATORS TABLE */}
                    <div className="overflow-x-auto border border-[#bfdbfe]/50 rounded-2xl shadow-xs bg-white">
                        <table className="w-full text-sm text-left text-slate-600 border-collapse">
                            <thead className="text-xs text-[#2236ba] font-semibold uppercase bg-slate-50/80 border-b border-[#bfdbfe]/50 select-none">
                                <tr>
                                    <th className="px-4 py-3.5 min-w-[220px]">KOL Channel</th>
                                    <th className="px-4 py-3.5 min-w-[240px]">Audience Insight Attachments</th>
                                    <th className="px-4 py-3.5 text-right min-w-[140px]">Est. Rate ($ USD)</th>
                                    <th className="px-4 py-3.5 min-w-[260px]">Deliverables</th>
                                    <th className="px-4 py-3.5 min-w-[220px]">Terms & Conditions</th>
                                    <th className="px-4 py-3.5 text-center min-w-[90px]">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#bfdbfe]/30">
                                {(!selectedProposal.proposal_kols || selectedProposal.proposal_kols.length === 0) ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-12">
                                            <div className="space-y-3">
                                                <p className="text-sm text-slate-400">No creators added to this proposal yet.</p>
                                                <button 
                                                    onClick={() => setShowAddCreatorModal(true)}
                                                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-medium inline-flex items-center gap-1.5"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    <span>Add Creator via YouTube URL</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    selectedProposal.proposal_kols.map((pk, idx) => {
                                        const kol = pk.kols;

                                        let screenshotsList: string[] = [];
                                        if (pk.audience_screenshots) {
                                            if (Array.isArray(pk.audience_screenshots)) {
                                                screenshotsList = pk.audience_screenshots;
                                            } else {
                                                try {
                                                    const parsed = JSON.parse(pk.audience_screenshots as string);
                                                    screenshotsList = Array.isArray(parsed) ? parsed : [pk.audience_screenshots as string];
                                                } catch {
                                                    screenshotsList = [pk.audience_screenshots as string];
                                                }
                                            }
                                        }

                                        return (
                                            <tr key={pk.kol_id || idx} className="hover:bg-slate-50/40 transition-colors align-top">
                                                
                                                {/* 1. KOL Channel Cell */}
                                                <td className="px-4 py-3">
                                                    <KOLCell kol={kol} />
                                                </td>

                                                {/* 2. Audience Insight Attachment */}
                                                <td className="px-4 py-3">
                                                    <div className="space-y-2">
                                                        {screenshotsList.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                                                                {screenshotsList.map((imgUrl, i) => (
                                                                    <div key={i} className="relative group/img shrink-0">
                                                                        <img 
                                                                            src={imgUrl} 
                                                                            alt="Audience Insight" 
                                                                            onClick={() => setLightboxImage(imgUrl)}
                                                                            className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                                                                        />
                                                                        <button 
                                                                            onClick={() => handleRemoveScreenshot(selectedProposal.id, pk.kol_id, i)}
                                                                            className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity shadow-xs"
                                                                            title="Delete screenshot"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        <label className="border border-dashed border-slate-300 hover:border-[var(--accent-color)] hover:bg-slate-50 p-2 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer text-xs text-slate-500 transition-colors">
                                                            <Upload className="w-3.5 h-3.5 text-slate-400" />
                                                            <span>Upload / Paste Screenshot</span>
                                                            <input 
                                                                type="file" 
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={e => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) handleAddScreenshotToCreator(selectedProposal.id, pk.kol_id, file);
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                </td>

                                                {/* 3. Est. Rate ($ USD) */}
                                                <td className="px-4 py-3 text-right">
                                                    <div className="relative">
                                                        <span className="absolute left-2.5 top-2 text-xs font-semibold text-slate-400">$</span>
                                                        <input 
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            value={pk.est_rate !== undefined && pk.est_rate !== null ? pk.est_rate : ''}
                                                            onChange={e => updateProposalKolField(selectedProposal.id, pk.kol_id, 'est_rate', parseFloat(e.target.value) || 0)}
                                                            placeholder="0"
                                                            className="w-full pl-6 pr-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 text-right outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white"
                                                        />
                                                    </div>
                                                </td>

                                                {/* 4. Deliverables (Bullet-formatted text) */}
                                                <td className="px-4 py-3">
                                                    <div className="space-y-1.5">
                                                        <textarea 
                                                            rows={3}
                                                            value={pk.deliverables || ''}
                                                            onChange={e => updateProposalKolField(selectedProposal.id, pk.kol_id, 'deliverables', e.target.value)}
                                                            placeholder="• 1x YouTube Video&#10;• 2x YouTube Shorts"
                                                            className="w-full p-2 border border-slate-200 rounded-xl text-xs font-normal text-slate-800 outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white leading-relaxed resize-none"
                                                        />
                                                        <div className="flex gap-1">
                                                            <button 
                                                                type="button" 
                                                                onClick={() => {
                                                                    const current = pk.deliverables || '';
                                                                    const next = current ? `${current}\n• 1x Dedicated Video` : '• 1x Dedicated Video';
                                                                    updateProposalKolField(selectedProposal.id, pk.kol_id, 'deliverables', next);
                                                                }}
                                                                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                                                            >
                                                                + Dedicated
                                                            </button>
                                                            <button 
                                                                type="button" 
                                                                onClick={() => {
                                                                    const current = pk.deliverables || '';
                                                                    const next = current ? `${current}\n• 2x Shorts` : '• 2x Shorts';
                                                                    updateProposalKolField(selectedProposal.id, pk.kol_id, 'deliverables', next);
                                                                }}
                                                                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                                                            >
                                                                + Shorts
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 5. Terms (Long-text format) */}
                                                <td className="px-4 py-3">
                                                    <textarea 
                                                        rows={3}
                                                        value={pk.terms || ''}
                                                        onChange={e => updateProposalKolField(selectedProposal.id, pk.kol_id, 'terms', e.target.value)}
                                                        placeholder="30-day usage rights, payment on pub date..."
                                                        className="w-full p-2 border border-slate-200 rounded-xl text-xs font-normal text-slate-800 outline-none focus:ring-1 focus:ring-[var(--accent-color)] bg-white leading-relaxed resize-none"
                                                    />
                                                </td>

                                                {/* 6. Actions */}
                                                <td className="px-4 py-3 text-center">
                                                    <button 
                                                        onClick={() => handleRemoveCreatorFromProposal(selectedProposal.id, pk.kol_id)}
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="Remove creator from proposal"
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
                </div>
            )}

            {/* STICKY STATUS TAG POPOVER */}
            {activeStatusPopover && activeStatusPopover.anchorRect && createPortal(
                <div 
                    ref={statusPopoverRef}
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: `${Math.min(window.innerHeight - 320, activeStatusPopover.anchorRect.bottom + 4)}px`,
                        left: `${Math.min(window.innerWidth - 300, Math.max(16, activeStatusPopover.anchorRect.left))}px`,
                        zIndex: 99999
                    }}
                    className="bg-white rounded-2xl border border-[#bfdbfe]/80 shadow-lg p-4 w-72 font-sans"
                >
                    <div className="space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Proposal Status Tag</span>
                            <button onClick={() => setActiveStatusPopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                        </div>

                        {/* Tag Options List */}
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {proposalTags.map((t, idx) => {
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
                                            onClick={() => updateProposalStatus(activeStatusPopover.proposalId, t)}
                                            className={`flex-1 text-left px-3 py-1.5 rounded-lg text-xs border transition-colors ${getProposalTagStyle(t)}`}
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
                    </div>
                </div>,
                document.body
            )}

            {/* PORTAL MODAL 1: DELETE CONFIRMATION POPUP MODAL */}
            {deleteConfirmProposal && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[999999] flex items-center justify-center p-4 overflow-y-auto font-sans">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
                        <div className="p-5 text-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                                <Trash2 className="w-6 h-6" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-900">Delete Proposal</h3>
                            <p className="text-xs text-slate-500">
                                Are you sure you want to delete <strong className="text-slate-800">"{deleteConfirmProposal.title}"</strong>? This action cannot be undone.
                            </p>
                        </div>
                        <div className="flex border-t border-slate-100 divide-x divide-slate-100 bg-slate-50">
                            <button 
                                onClick={() => setDeleteConfirmProposal(null)} 
                                className="flex-1 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleConfirmDeleteProposal} 
                                className="flex-1 py-3 text-xs font-semibold text-rose-600 hover:bg-rose-100/50 transition-colors"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* PORTAL MODAL 2: ADD CREATOR VIA YOUTUBE URL MODAL */}
            {showAddCreatorModal && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[99999] flex items-center justify-center p-4 overflow-y-auto font-sans">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                                <Youtube className="w-5 h-5 text-red-500 fill-red-500" />
                                <span>Add Creator via YouTube URL</span>
                            </h3>
                            <button onClick={() => setShowAddCreatorModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                    YouTube Channel URL / Handle
                                </label>
                                <input 
                                    type="text" 
                                    autoFocus
                                    value={ytChannelInput}
                                    onChange={e => setYtChannelInput(e.target.value)}
                                    placeholder="https://www.youtube.com/@taysthetic"
                                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-normal"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddCreatorByYouTube(); }}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Uses YouTube Data API v3 to automatically fetch avatar, channel title, subscriber count, and country.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                                <button 
                                    onClick={() => setShowAddCreatorModal(false)} 
                                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleAddCreatorByYouTube}
                                    disabled={fetchingYt || !ytChannelInput.trim()}
                                    className="px-5 py-2 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {fetchingYt ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Fetching...</span>
                                        </>
                                    ) : (
                                        <span>Add Creator</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* PORTAL MODAL 3: AUDIENCE INSIGHT IMAGE LIGHTBOX */}
            {lightboxImage && createPortal(
                <div 
                    className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[999999] flex items-center justify-center p-4"
                    onClick={() => setLightboxImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
                        <button 
                            onClick={() => setLightboxImage(null)}
                            className="absolute top-3 right-3 bg-slate-900/80 text-white rounded-full p-2 hover:bg-slate-900 transition-colors shadow-lg"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <img src={lightboxImage} alt="Audience Insight Fullview" className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" />
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
};

export default InfluencerProposal;
