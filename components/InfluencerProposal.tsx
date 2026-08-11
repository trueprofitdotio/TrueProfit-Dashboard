import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import DiscussionSidebar from './DiscussionSidebar';
import { fetchYouTubeChannelDetails } from '../services/youtubeService';
import { 
    Plus, Search, Edit2, Trash2, X, Calendar, DollarSign, Filter, ArrowUpDown, Check, 
    Users, FileText, ArrowLeft, Upload, Image as ImageIcon, ExternalLink, Loader2, Youtube, Eye, ChevronRight, MessageCircle, RefreshCw, RotateCcw
} from 'lucide-react';

interface ProposalKol {
    proposal_id: string;
    kol_id: string;
    est_rate?: number | string | null;
    deliverables?: string | null;
    terms?: string | null;
    contract_link?: string | null;
    audience_screenshots?: string | string[] | null;
    status?: string | null;
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
    resetViewSignal?: number;
}

const CREATOR_STATUS_OPTIONS = [
    'Approved',
    'Not Approved',
    'Re-negotiate'
] as const;

const getCreatorStatusStyle = (status?: string | null) => {
    if (!status) return 'bg-slate-100 text-slate-500 border-slate-200 font-normal';
    const s = status.trim().toLowerCase();
    if (s === 'approved') return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
    if (s === 'not approved' || s === 'rejected') return 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
    if (s === 're-negotiate' || s === 'renegotiate' || s === 'need to check') return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
    return 'bg-blue-100 text-blue-800 border-blue-300 font-semibold';
};

const DEFAULT_PROPOSAL_TAGS = [
    'Active',
    'Archived'
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
    if (!status) return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
    const s = status.trim().toLowerCase();
    if (s === 'archived') return 'bg-slate-100 text-slate-600 border-slate-300 font-semibold';
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
};

const formatCurrencyUSD = (val?: string | number | null): string => {
    if (val === undefined || val === null || val === '') return '$0';
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.]/g, ''));
    if (isNaN(num)) return '$0';
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

const InfluencerProposal: React.FC<InfluencerProposalProps> = ({ onSelectProposalTitle, resetViewSignal }) => {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [allKols, setAllKols] = useState<KolData[]>([]);
    const [loading, setLoading] = useState(true);

    // Active View state: 'list' (Main Table) or 'workspace' (Detailed Creators Workspace)
    const [activeView, setActiveView] = useState<'list' | 'workspace'>('list');
    const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

    // Handle breadcrumb back-navigation to list view
    useEffect(() => {
        if (resetViewSignal && resetViewSignal > 0) {
            setActiveView('list');
            setSelectedProposalId(null);
        }
    }, [resetViewSignal]);

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

    // Creator Cell Editing Popover State (For Est Rate, Deliverables, Terms, Contract Link)
    const [activeCellPopover, setActiveCellPopover] = useState<{
        proposalId: string;
        kolId: string;
        type: 'rate' | 'deliverables' | 'terms' | 'contract';
        anchorRect?: DOMRect;
    } | null>(null);

    // Discussion Sidebar state
    const [activeDiscussion, setActiveDiscussion] = useState<{
        proposalId: string;
        kolId: string;
        kolName: string;
    } | null>(null);

    // Popover input temporary values
    const [cellRateVal, setCellRateVal] = useState('');
    const [cellDeliverablesVal, setCellDeliverablesVal] = useState('');
    const [cellTermsVal, setCellTermsVal] = useState('');
    const [cellContractVal, setCellContractVal] = useState('');

    // Deliverables preset quantity states
    const [qty90s, setQty90s] = useState(0);
    const [qtyTiktok, setQtyTiktok] = useState(0);
    const [qtyPostX, setQtyPostX] = useState(0);

    // Filter & Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortField, setSortField] = useState<'created_at' | 'title' | 'budget' | 'creators'>('created_at');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const statusPopoverRef = useRef<HTMLDivElement>(null);
    const cellPopoverRef = useRef<HTMLDivElement>(null);

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

            // Check for initial proposalId in URL path or query params
            try {
                const path = window.location.pathname;
                const parts = path.split('/').filter(Boolean);
                let urlPropId = parts[0] === 'influencer' && parts[1] === 'proposal' ? parts[2] : null;
                if (!urlPropId) {
                    const params = new URLSearchParams(window.location.search);
                    urlPropId = params.get('proposalId');
                }
                if (urlPropId && rawProps.some(p => p.id === urlPropId)) {
                    setSelectedProposalId(urlPropId);
                    setActiveView('workspace');
                }
            } catch (e) {}

        } catch (e) {
            console.error('Error fetching proposals:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Close popovers on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (statusPopoverRef.current && !statusPopoverRef.current.contains(e.target as Node)) {
                setActiveStatusPopover(null);
            }
            if (cellPopoverRef.current && !cellPopoverRef.current.contains(e.target as Node)) {
                setActiveCellPopover(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const selectedProposal = proposals.find(p => p.id === selectedProposalId);

    // Notify parent workspace of current selected proposal title for Breadcrumbs & sync URL path
    useEffect(() => {
        if (onSelectProposalTitle) {
            if (activeView === 'workspace' && selectedProposal) {
                onSelectProposalTitle(selectedProposal.title);
            } else {
                onSelectProposalTitle(null);
            }
        }
        try {
            let newPath = '/influencer/proposal';
            if (activeView === 'workspace' && selectedProposalId) {
                newPath = `/influencer/proposal/${selectedProposalId}`;
            }
            window.history.pushState({}, '', newPath);
        } catch (e) {}
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

    // Delete Status Tag (Bulk updates proposals to Need to check so tag never resurrects)
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
                deliverables: ''
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

    // Open Creator Cell Popover
    const openCellPopover = (
        e: React.MouseEvent,
        proposalId: string,
        kolId: string,
        type: 'rate' | 'deliverables' | 'terms' | 'contract',
        currentPk?: ProposalKol
    ) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        
        if (type === 'rate') setCellRateVal(String(currentPk?.est_rate || ''));
        if (type === 'deliverables') {
            const text = currentPk?.deliverables || '';
            setCellDeliverablesVal(text);
            const m90s = text.match(/(\d+)\s*x?\s*90s/i);
            setQty90s(m90s ? parseInt(m90s[1], 10) : 0);
            const mTiktok = text.match(/(\d+)\s*x?\s*tiktok/i);
            setQtyTiktok(mTiktok ? parseInt(mTiktok[1], 10) : 0);
            const mPostX = text.match(/(\d+)\s*x?\s*(post on x|x post)/i);
            setQtyPostX(mPostX ? parseInt(mPostX[1], 10) : 0);
        }
        if (type === 'terms') setCellTermsVal(currentPk?.terms || '');
        if (type === 'contract') setCellContractVal(currentPk?.contract_link || '');

        setActiveCellPopover({ proposalId, kolId, type, anchorRect: rect });
    };

    const updateCreatorStatus = async (proposalId: string, kolId: string, newStatus: string, triggerSystemMsg = true) => {
        setProposals(prev => prev.map(p => {
            if (p.id !== proposalId) return p;
            const updatedPks = (p.proposal_kols || []).map(pk => {
                if (pk.kol_id !== kolId) return pk;
                return { ...pk, status: newStatus };
            });
            return { ...p, proposal_kols: updatedPks };
        }));

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            const actorName = user?.user_metadata?.full_name || user?.email || 'Team Member';

            const { error } = await supabaseClient.rpc('update_proposal_kol_status', {
                p_proposal_id: proposalId,
                p_kol_id: kolId,
                p_new_status: newStatus,
                p_actor: actorName,
                p_source: triggerSystemMsg ? 'Action Column' : 'Reset Action (No Msg)'
            });
            if (error) throw error;
        } catch (err) {
            console.error('Failed to update creator status via RPC:', err);
            fetchData();
        }
    };

    const updatePresetQuantity = (preset: '90s' | 'tiktok' | 'postX', delta: number) => {
        let new90s = qty90s;
        let newTiktok = qtyTiktok;
        let newPostX = qtyPostX;

        if (preset === '90s') { new90s = Math.max(0, qty90s + delta); setQty90s(new90s); }
        if (preset === 'tiktok') { newTiktok = Math.max(0, qtyTiktok + delta); setQtyTiktok(newTiktok); }
        if (preset === 'postX') { newPostX = Math.max(0, qtyPostX + delta); setQtyPostX(newPostX); }

        const presetLines: string[] = [];
        if (new90s > 0) presetLines.push(`• ${new90s}x 90s integration`);
        if (newTiktok > 0) presetLines.push(`• ${newTiktok}x TikTok video`);
        if (newPostX > 0) presetLines.push(`• ${newPostX}x Post on X`);

        const customLines = cellDeliverablesVal
            .split('\n')
            .filter(line => {
                const l = line.toLowerCase();
                return !l.includes('90s integration') && !l.includes('tiktok video') && !l.includes('post on x');
            })
            .filter(line => line.trim().length > 0);

        const merged = [...presetLines, ...customLines].join('\n');
        setCellDeliverablesVal(merged);
    };

    // Update Creator row details in local state & Supabase
    const updateProposalKolField = async (proposalId: string, kolId: string, field: string, value: any) => {
        setProposals(prev => prev.map(p => {
            if (p.id !== proposalId) return p;
            const updatedPks = (p.proposal_kols || []).map(pk => {
                if (pk.kol_id !== kolId) return pk;
                return { ...pk, [field]: value };
            });
            return { ...p, proposal_kols: updatedPks };
        }));
        setActiveCellPopover(null);

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
                <div className="space-y-5 transition-all duration-200 ease-in-out">
                    {/* Filter Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
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

                                                {/* 2. Proposal Name (Click name opens workspace; click pen renames) */}
                                                <td className="px-4 py-3 max-w-[240px]">
                                                    {editingTitleId === p.id ? (
                                                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
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
                                                        <div className="font-medium text-slate-900 text-sm hover:text-[var(--accent-color)] transition-colors truncate flex items-center gap-1.5 group/t">
                                                            <span className="truncate">{p.title}</span>
                                                            <button
                                                                type="button"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    setEditingTitleId(p.id);
                                                                    setEditingTitleVal(p.title);
                                                                }}
                                                                className="opacity-0 group-hover/t:opacity-100 p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-opacity"
                                                                title="Rename proposal"
                                                            >
                                                                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* 3. Creators Info (No background container around count number) */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-xs font-semibold text-slate-700 shrink-0">
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
                                                                                    referrerPolicy="no-referrer"
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
                                                                                        <img src={k.avatar_url} alt={k.name} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full object-cover" />
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

                    {/* Centered Primary Add Proposal Button */}
                    <div className="flex justify-center pt-2">
                        <button 
                            onClick={handleAddProposalDirectly}
                            className="bg-[var(--accent-color)] text-white px-6 py-2.5 rounded-full font-medium hover:bg-emerald-600 transition-all shadow-xs text-sm flex items-center justify-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add New Proposal</span>
                        </button>
                    </div>
                </div>
            )}

            {/* VIEW 2: DETAILED CREATORS PROPOSAL WORKSPACE VIEW */}
            {activeView === 'workspace' && selectedProposal && (
                <div className={`space-y-6 animate-in fade-in duration-200 transition-all ${activeDiscussion ? 'mr-[460px]' : ''}`}>
                    
                    {/* Workspace Header: Clean Title & Back Button */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                            <button 
                                onClick={() => {
                                    setActiveView('list');
                                    setSelectedProposalId(null);
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-1.5"
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
                        </div>
                    </div>

                    {/* DETAILED CREATORS TABLE */}
                    <div className="overflow-x-auto border border-[#bfdbfe]/50 rounded-2xl shadow-xs bg-white">
                        <table className="w-full text-sm text-left text-slate-600 border-collapse">
                            <thead className="text-xs text-slate-500 font-normal uppercase bg-slate-50/80 border-b border-[#bfdbfe]/50 select-none">
                                <tr>
                                    <th className="px-4 py-3.5 min-w-[200px] font-normal">KOL Channel</th>
                                    <th className="px-4 py-3.5 min-w-[110px] font-normal">Status</th>
                                    <th className="px-4 py-3.5 min-w-[220px] font-normal">Audience Insight Attachments</th>
                                    <th className="px-4 py-3.5 text-right min-w-[130px] font-normal">Est. Rate ($ USD)</th>
                                    <th className="px-4 py-3.5 min-w-[220px] font-normal">Deliverables</th>
                                    <th className="px-4 py-3.5 min-w-[200px] font-normal">Terms & Conditions</th>
                                    <th className="px-4 py-3.5 min-w-[140px] font-normal">Contract Link</th>
                                    <th className="px-4 py-3.5 min-w-[150px] font-normal">Discussion</th>
                                    <th className="px-4 py-3.5 text-center min-w-[160px] font-normal">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#bfdbfe]/30">
                                {(!selectedProposal.proposal_kols || selectedProposal.proposal_kols.length === 0) ? (
                                    <tr>
                                        <td colSpan={9} className="text-center py-12 text-slate-400">
                                            No creators added to this proposal yet. Use the button below to add your first creator!
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
                                            <tr key={pk.kol_id || idx} className="hover:bg-slate-50/40 transition-colors align-middle">
                                                
                                                {/* 1. KOL Channel Cell */}
                                                <td className="px-4 py-3 align-middle">
                                                    <KOLCell kol={kol} />
                                                </td>

                                                {/* 2. Read-Only Status Cell */}
                                                <td className="px-4 py-3 align-middle">
                                                    <div className="flex items-center h-8">
                                                        <span
                                                            className={`px-3 py-1 rounded-full text-xs border inline-block shadow-2xs ${getCreatorStatusStyle(pk.status)}`}
                                                        >
                                                            {pk.status || 'Active'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* 3. Audience Insight Attachment */}
                                                <td className="px-4 py-3 align-middle">
                                                    <div className="flex items-center gap-1.5 min-h-[36px]">
                                                        {screenshotsList.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {screenshotsList.map((imgUrl, i) => (
                                                                    <div key={i} className="relative group/img shrink-0">
                                                                        <img 
                                                                            src={imgUrl} 
                                                                            alt="Audience Insight" 
                                                                            onClick={() => setLightboxImage(imgUrl)}
                                                                            className="w-9 h-9 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
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

                                                        <label className="border border-dashed border-slate-300 hover:border-[var(--accent-color)] hover:bg-slate-50 px-2.5 py-1.5 rounded-xl flex items-center justify-center gap-1 cursor-pointer text-xs text-slate-500 transition-colors h-8">
                                                            <Upload className="w-3.5 h-3.5 text-slate-400" />
                                                            <span>Add</span>
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

                                                {/* 4. Est. Rate ($ USD) */}
                                                <td className="px-4 py-3 text-right align-middle">
                                                    <div className="flex items-center justify-end h-8">
                                                        <button
                                                            onClick={e => openCellPopover(e, selectedProposal.id, pk.kol_id, 'rate', pk)}
                                                            className="hover:bg-slate-100 px-2.5 py-1 rounded-lg text-slate-800 font-semibold text-xs transition-colors border border-transparent hover:border-slate-200 inline-flex items-center"
                                                            title="Click to edit estimated rate"
                                                        >
                                                            {pk.est_rate !== undefined && pk.est_rate !== null && pk.est_rate !== 0 
                                                                ? formatCurrencyUSD(pk.est_rate) 
                                                                : <span className="text-slate-400 font-medium text-xs">Add</span>}
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* 5. Deliverables */}
                                                <td className="px-4 py-3 align-middle">
                                                    <div 
                                                        onClick={e => openCellPopover(e, selectedProposal.id, pk.kol_id, 'deliverables', pk)}
                                                        className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[36px] flex items-center"
                                                        title="Click to edit deliverables"
                                                    >
                                                        {pk.deliverables && pk.deliverables.trim() ? (
                                                            <div className="text-xs text-slate-800 whitespace-pre-line font-medium leading-relaxed">
                                                                {pk.deliverables}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 hover:text-slate-600">
                                                                <Plus className="w-3.5 h-3.5" />
                                                                <span>Add</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* 6. Terms & Conditions */}
                                                <td className="px-4 py-3 align-middle">
                                                    <div 
                                                        onClick={e => openCellPopover(e, selectedProposal.id, pk.kol_id, 'terms', pk)}
                                                        className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[36px] flex items-center"
                                                        title="Click to edit terms"
                                                    >
                                                        {pk.terms && pk.terms.trim() ? (
                                                            renderRichText(pk.terms)
                                                        ) : (
                                                            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 hover:text-slate-600">
                                                                <Plus className="w-3.5 h-3.5" />
                                                                <span>Add</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* 7. Contract Link */}
                                                <td className="px-4 py-3 align-middle">
                                                    <div 
                                                        onClick={e => openCellPopover(e, selectedProposal.id, pk.kol_id, 'contract', pk)}
                                                        className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[36px] flex items-center"
                                                        title="Click to manage draft contract link"
                                                    >
                                                        {pk.contract_link && pk.contract_link.trim() ? (
                                                            <a 
                                                                href={pk.contract_link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={e => e.stopPropagation()}
                                                                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 truncate max-w-[150px]"
                                                            >
                                                                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                                <span>Draft Contract</span>
                                                            </a>
                                                        ) : (
                                                            <span className="text-xs text-slate-400 font-medium flex items-center gap-1 hover:text-slate-600">
                                                                <Plus className="w-3.5 h-3.5" />
                                                                <span>Add</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* 8. Discussion Column */}
                                                <td className="px-4 py-3 align-middle">
                                                    <button
                                                        onClick={() => setActiveDiscussion({
                                                            proposalId: selectedProposal.id,
                                                            kolId: pk.kol_id,
                                                            kolName: kol?.name || 'Creator'
                                                        })}
                                                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                                                    >
                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                        <span>See discussion</span>
                                                    </button>
                                                </td>

                                                {/* 9. Actions Column (Approve, Reject, Re-negotiate, Reset, Remove) */}
                                                <td className="px-4 py-3 text-center align-middle">
                                                    <div className="flex items-center justify-center gap-0.5">
                                                        <button
                                                            onClick={() => updateCreatorStatus(selectedProposal.id, pk.kol_id, 'Approved', true)}
                                                            className={`p-1.5 rounded-lg transition-colors ${pk.status === 'Approved' ? 'bg-emerald-100 text-emerald-700 font-semibold' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                                            title="Approve this creator"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => updateCreatorStatus(selectedProposal.id, pk.kol_id, 'Rejected', true)}
                                                            className={`p-1.5 rounded-lg transition-colors ${pk.status === 'Rejected' ? 'bg-rose-100 text-rose-700 font-semibold' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                                                            title="Reject this creator"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => updateCreatorStatus(selectedProposal.id, pk.kol_id, 'Re-negotiate', true)}
                                                            className={`p-1.5 rounded-lg transition-colors ${pk.status === 'Re-negotiate' ? 'bg-amber-100 text-amber-700 font-semibold' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                                            title="Rediscuss deal"
                                                        >
                                                            <RefreshCw className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => updateCreatorStatus(selectedProposal.id, pk.kol_id, 'Active', false)}
                                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Reset status to Active"
                                                        >
                                                            <RotateCcw className="w-4 h-4" />
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRemoveCreatorFromProposal(selectedProposal.id, pk.kol_id)}
                                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                            title="Remove creator from proposal"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* PRIMARY ADD CREATOR BUTTON — ALWAYS PROMINENT AT MID-BOTTOM OF TABLE */}
                    <div className="flex justify-center pt-2">
                        <button 
                            onClick={() => setShowAddCreatorModal(true)}
                            className="bg-[var(--accent-color)] text-white px-6 py-3 rounded-2xl font-medium hover:bg-emerald-600 transition-colors shadow-sm text-xs flex items-center justify-center gap-2"
                        >
                            <span>+ Add Creator via YouTube URL</span>
                        </button>
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

            {/* STICKY CREATOR CELL EDITING POPOVER (Rate / Deliverables / Terms / Contract) */}
            {activeCellPopover && activeCellPopover.anchorRect && createPortal(
                <div 
                    ref={cellPopoverRef}
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: `${Math.min(window.innerHeight - 300, activeCellPopover.anchorRect.bottom + 4)}px`,
                        left: `${Math.min(window.innerWidth - 320, Math.max(16, activeCellPopover.anchorRect.left))}px`,
                        zIndex: 99999
                    }}
                    className="bg-white rounded-2xl border border-[#bfdbfe]/80 shadow-lg p-4 w-80 font-sans"
                >
                    {/* 1. Rate Popover */}
                    {activeCellPopover.type === 'rate' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Estimated Rate ($ USD)</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">$</span>
                                <input 
                                    type="number"
                                    min="0"
                                    step="any"
                                    autoFocus
                                    value={cellRateVal}
                                    onChange={e => setCellRateVal(e.target.value)}
                                    placeholder="5000"
                                    className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            updateProposalKolField(activeCellPopover.proposalId, activeCellPopover.kolId, 'est_rate', parseFloat(cellRateVal) || 0);
                                        }
                                    }}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateProposalKolField(activeCellPopover.proposalId, activeCellPopover.kolId, 'est_rate', parseFloat(cellRateVal) || 0)}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Rate
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 2. Deliverables Popover */}
                    {activeCellPopover.type === 'deliverables' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Deliverables</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Preset Options with Quantity Selectors */}
                            <div className="space-y-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Set Option Quantities:</span>
                                
                                {/* Option 1: 90s integration */}
                                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
                                    <span className="font-medium text-slate-800">90s integration</span>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => updatePresetQuantity('90s', -1)} 
                                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-sm transition-colors"
                                        >-</button>
                                        <span className="w-5 text-center font-bold text-slate-900">{qty90s}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => updatePresetQuantity('90s', 1)} 
                                            className="w-6 h-6 rounded-md bg-[var(--accent-color)]/10 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] font-bold flex items-center justify-center text-sm transition-colors"
                                        >+</button>
                                    </div>
                                </div>

                                {/* Option 2: TikTok video */}
                                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
                                    <span className="font-medium text-slate-800">TikTok video</span>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => updatePresetQuantity('tiktok', -1)} 
                                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-sm transition-colors"
                                        >-</button>
                                        <span className="w-5 text-center font-bold text-slate-900">{qtyTiktok}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => updatePresetQuantity('tiktok', 1)} 
                                            className="w-6 h-6 rounded-md bg-[var(--accent-color)]/10 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] font-bold flex items-center justify-center text-sm transition-colors"
                                        >+</button>
                                    </div>
                                </div>

                                {/* Option 3: Post on X */}
                                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
                                    <span className="font-medium text-slate-800">Post on X</span>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            type="button" 
                                            onClick={() => updatePresetQuantity('postX', -1)} 
                                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-sm transition-colors"
                                        >-</button>
                                        <span className="w-5 text-center font-bold text-slate-900">{qtyPostX}</span>
                                        <button 
                                            type="button" 
                                            onClick={() => updatePresetQuantity('postX', 1)} 
                                            className="w-6 h-6 rounded-md bg-[var(--accent-color)]/10 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] font-bold flex items-center justify-center text-sm transition-colors"
                                        >+</button>
                                    </div>
                                </div>
                            </div>

                            {/* Generated / Editable Textarea */}
                            <div>
                                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Deliverables Text Summary:</label>
                                <textarea 
                                    rows={3}
                                    value={cellDeliverablesVal}
                                    onChange={e => setCellDeliverablesVal(e.target.value)}
                                    placeholder="• 1x 90s integration&#10;• 2x TikTok video..."
                                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-normal text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)] leading-relaxed resize-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateProposalKolField(activeCellPopover.proposalId, activeCellPopover.kolId, 'deliverables', cellDeliverablesVal)}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Deliverables
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 3. Terms Popover */}
                    {activeCellPopover.type === 'terms' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Terms & Conditions</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Formatting Options Bar */}
                            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 select-none">
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' **bold**')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors font-bold" title="Bold">B</button>
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' *italic*')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors italic" title="Italic">I</button>
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' <u>underline</u>')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors underline" title="Underline">U</button>
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' [link label](https://)')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors text-blue-600" title="Hyperlink">🔗 Link</button>
                            </div>

                            <textarea 
                                rows={4}
                                autoFocus
                                value={cellTermsVal}
                                onChange={e => setCellTermsVal(e.target.value)}
                                placeholder="30-day usage rights, 60-day exclusivity, payment on pub date..."
                                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-normal text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)] leading-relaxed resize-none whitespace-pre-line"
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateProposalKolField(activeCellPopover.proposalId, activeCellPopover.kolId, 'terms', cellTermsVal)}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Terms
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 4. Contract Link Popover */}
                    {activeCellPopover.type === 'contract' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-semibold text-xs text-slate-800 uppercase tracking-wider">Draft Contract Link</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                            </div>
                            <input 
                                type="text"
                                autoFocus
                                value={cellContractVal}
                                onChange={e => setCellContractVal(e.target.value)}
                                placeholder="https://docs.google.com/..."
                                className="w-full p-2 border border-slate-300 rounded-xl text-xs font-normal text-slate-800 outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        updateProposalKolField(activeCellPopover.proposalId, activeCellPopover.kolId, 'contract_link', cellContractVal.trim());
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button 
                                    onClick={() => updateProposalKolField(activeCellPopover.proposalId, activeCellPopover.kolId, 'contract_link', cellContractVal.trim())}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl shadow-xs"
                                >
                                    Save Link
                                </button>
                            </div>
                        </div>
                    )}
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

            {/* DISCUSSION SIDEBAR DRAWER */}
            <DiscussionSidebar
                isOpen={activeDiscussion !== null}
                onClose={() => setActiveDiscussion(null)}
                proposalId={activeDiscussion?.proposalId || null}
                kolId={activeDiscussion?.kolId || null}
                kolName={activeDiscussion?.kolName || ''}
                onStatusChange={(pId, kId, newStatus) => {
                    setProposals(prev => prev.map(p => {
                        if (p.id !== pId) return p;
                        const updatedPks = (p.proposal_kols || []).map(pk => {
                            if (pk.kol_id !== kId) return pk;
                            return { ...pk, status: newStatus };
                        });
                        return { ...p, proposal_kols: updatedPks };
                    }));
                }}
            />

        </div>
    );
};

export default InfluencerProposal;
