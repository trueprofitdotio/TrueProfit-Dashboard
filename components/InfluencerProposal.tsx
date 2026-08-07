import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import { 
    Plus, Search, Edit2, Trash2, X, Calendar, DollarSign, Filter, ArrowUpDown, Check, Users, FileText
} from 'lucide-react';

interface ProposalKol {
    kol_id: string;
    est_rate?: number | string | null;
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

const InfluencerProposal: React.FC = () => {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [allKols, setAllKols] = useState<KolData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);

    // Form states
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState('Draft');
    const [budget, setBudget] = useState('');
    const [targetAudience, setTargetAudience] = useState('');
    const [objective, setObjective] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [description, setDescription] = useState('');
    const [selectedKolIds, setSelectedKolIds] = useState<string[]>([]);
    const [kolEstRates, setKolEstRates] = useState<Record<string, string>>({});

    // Filter & Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortField, setSortField] = useState<'created_at' | 'title' | 'budget' | 'creators'>('created_at');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [proposalsRes, kolsRes] = await Promise.all([
                supabaseClient
                    .from('proposals')
                    .select('*, proposal_kols(kol_id, est_rate, kols(*))')
                    .order('created_at', { ascending: false }),
                supabaseClient
                    .from('kols')
                    .select('*')
                    .order('name')
            ]);
                
            if (proposalsRes.error) throw proposalsRes.error;
            if (kolsRes.error) throw kolsRes.error;
            
            setProposals(proposalsRes.data as unknown as Proposal[]);
            setAllKols(kolsRes.data as KolData[]);
        } catch (e) {
            console.error('Error fetching proposals:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const openCreate = () => {
        setEditingProposal(null);
        setTitle('');
        setStatus('Draft');
        setBudget('');
        setTargetAudience('');
        setObjective('');
        setStartDate('');
        setEndDate('');
        setDescription('');
        setSelectedKolIds([]);
        setKolEstRates({});
        setShowModal(true);
    };

    const openEdit = (p: Proposal) => {
        setEditingProposal(p);
        setTitle(p.title || '');
        setStatus(p.status || 'Draft');
        setBudget(p.budget || '');
        setTargetAudience(p.target_audience || '');
        setObjective(p.objective || '');
        setStartDate(p.start_date || '');
        setEndDate(p.end_date || '');
        setDescription(p.description || '');
        
        const kols = p.proposal_kols?.map(pk => pk.kol_id) || [];
        const rates: Record<string, string> = {};
        p.proposal_kols?.forEach(pk => {
            if (pk.est_rate) rates[pk.kol_id] = String(pk.est_rate);
        });

        setSelectedKolIds(kols);
        setKolEstRates(rates);
        setShowModal(true);
    };

    const toggleKol = (kolId: string) => {
        setSelectedKolIds(prev => 
            prev.includes(kolId) ? prev.filter(id => id !== kolId) : [...prev, kolId]
        );
    };

    const handleDelete = async (proposalId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this proposal?')) return;
        try {
            await supabaseClient.from('proposal_kols').delete().eq('proposal_id', proposalId);
            await supabaseClient.from('proposals').delete().eq('id', proposalId);
            fetchData();
        } catch (err) {
            console.error('Error deleting proposal:', err);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const proposalPayload = {
                ...(editingProposal?.id ? { id: editingProposal.id } : {}),
                title,
                status,
                budget,
                target_audience: targetAudience,
                objective,
                start_date: startDate || null,
                end_date: endDate || null,
                description,
                updated_at: new Date().toISOString()
            };
            
            const { data: savedProposal, error: proposalError } = await supabaseClient
                .from('proposals')
                .upsert(proposalPayload)
                .select()
                .single();
                
            if (proposalError) throw proposalError;
            
            // Manage proposal_kols relationships
            if (editingProposal?.id) {
                await supabaseClient.from('proposal_kols').delete().eq('proposal_id', savedProposal.id);
            }
            
            if (selectedKolIds.length > 0) {
                const pkPayloads = selectedKolIds.map(kolId => ({
                    proposal_id: savedProposal.id,
                    kol_id: kolId,
                    est_rate: kolEstRates[kolId] ? parseFloat(kolEstRates[kolId]) || 0 : null
                }));
                await supabaseClient.from('proposal_kols').insert(pkPayloads);
            }
            
            setShowModal(false);
            fetchData();
        } catch (e) {
            console.error('Error saving proposal:', e);
            alert('Failed to save proposal.');
        }
    };

    const getStatusStyle = (s: string) => {
        const status = (s || '').toLowerCase();
        if (status === 'approved') return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
        if (status === 'rejected') return 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
        if (status === 'in progress') return 'bg-blue-100 text-blue-800 border-blue-300 font-semibold';
        if (status === 'completed') return 'bg-purple-100 text-purple-800 border-purple-300 font-semibold';
        return 'bg-slate-100 text-slate-700 border-slate-200 font-normal';
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
                valA = parseFloat(String(a.budget || '0').replace(/[^\d.]/g, '')) || 0;
                valB = parseFloat(String(b.budget || '0').replace(/[^\d.]/g, '')) || 0;
            } else if (sortField === 'creators') {
                valA = a.proposal_kols?.length || 0;
                valB = b.proposal_kols?.length || 0;
            }

            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

    return (
        <div className="card p-6 space-y-6">
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
                <button 
                    onClick={openCreate}
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
                        <option value="Draft">Draft</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                        <option value="Completed">Completed</option>
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
                            <th className="px-4 py-3.5 min-w-[120px]">Status</th>
                            <th className="px-4 py-3.5 text-center min-w-[110px]">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#bfdbfe]/30">
                        {loading ? (
                            <tr><td colSpan={6} className="text-center py-12 text-slate-400">Loading proposals...</td></tr>
                        ) : processedProposals.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-12 text-slate-400">No proposals found. Click "+ Add New Proposal" to create one.</td></tr>
                        ) : (
                            processedProposals.map(p => {
                                const creators = p.proposal_kols || [];
                                
                                // Auto calculate total estimated rate / budget
                                let totalEstRateNum = parseFloat(String(p.budget || '0').replace(/[^\d.]/g, '')) || 0;
                                const ratesSum = creators.reduce((sum, pk) => sum + (parseFloat(String(pk.est_rate || '0')) || 0), 0);
                                if (ratesSum > 0) totalEstRateNum = ratesSum;

                                return (
                                    <tr 
                                        key={p.id} 
                                        onClick={() => openEdit(p)}
                                        className="hover:bg-emerald-50/20 transition-colors group cursor-pointer"
                                    >
                                        {/* 1. Timestamp (Not editable, light small font) */}
                                        <td className="px-4 py-3 whitespace-nowrap text-xs font-normal text-slate-500">
                                            {formatTimestampDetailed(p.created_at)}
                                        </td>

                                        {/* 2. Proposal Name */}
                                        <td className="px-4 py-3 max-w-[240px]">
                                            <div className="font-medium text-slate-900 text-sm group-hover:text-[var(--accent-color)] transition-colors truncate" title={p.title}>
                                                {p.title}
                                            </div>
                                            {p.objective && (
                                                <div className="text-[11px] font-normal text-slate-400 truncate mt-0.5">
                                                    Obj: {p.objective}
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

                                        {/* 4. Total Est. Rate / Budget */}
                                        <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                                            {formatCurrencyUSD(totalEstRateNum)}
                                        </td>

                                        {/* 5. Status Badge */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`px-3 py-1 rounded-full text-xs border inline-block ${getStatusStyle(p.status)}`}>
                                                {p.status || 'Draft'}
                                            </span>
                                        </td>

                                        {/* 6. Action Buttons */}
                                        <td className="px-4 py-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1">
                                                <button 
                                                    onClick={() => openEdit(p)} 
                                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                                    title="Edit Proposal"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={e => handleDelete(p.id, e)} 
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="Delete Proposal"
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

            {/* Portal-Centered Create / Edit Proposal Modal */}
            {showModal && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[99999] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                                <Plus className="w-5 h-5 text-[var(--accent-color)]" />
                                <span>{editingProposal ? 'Edit Campaign Proposal' : 'Create Campaign Proposal'}</span>
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Left Column: Basic Info */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                            Proposal Title *
                                        </label>
                                        <input 
                                            required 
                                            type="text" 
                                            value={title} 
                                            onChange={e => setTitle(e.target.value)} 
                                            placeholder="e.g. Q4 Black Friday Influencer Campaign"
                                            className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-medium" 
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Status</label>
                                            <select 
                                                value={status} 
                                                onChange={e => setStatus(e.target.value)} 
                                                className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none bg-white text-xs font-medium"
                                            >
                                                <option value="Draft">Draft</option>
                                                <option value="In Progress">In Progress</option>
                                                <option value="Approved">Approved</option>
                                                <option value="Rejected">Rejected</option>
                                                <option value="Completed">Completed</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Total Est. Budget ($)</label>
                                            <input 
                                                type="text" 
                                                value={budget} 
                                                onChange={e => setBudget(e.target.value)} 
                                                placeholder="$10,000"
                                                className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-medium" 
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Objective</label>
                                        <input 
                                            type="text" 
                                            value={objective} 
                                            onChange={e => setObjective(e.target.value)} 
                                            placeholder="e.g. Brand Awareness, 50k Sales"
                                            className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-normal" 
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Target Audience</label>
                                        <input 
                                            type="text" 
                                            value={targetAudience} 
                                            onChange={e => setTargetAudience(e.target.value)} 
                                            placeholder="e.g. US, Dropshippers, 18-35"
                                            className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-normal" 
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Start Date</label>
                                            <input 
                                                type="date" 
                                                value={startDate} 
                                                onChange={e => setStartDate(e.target.value)} 
                                                className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-medium" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">End Date</label>
                                            <input 
                                                type="date" 
                                                value={endDate} 
                                                onChange={e => setEndDate(e.target.value)} 
                                                className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-medium" 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Description & Target Creators */}
                                <div className="space-y-4 flex flex-col">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Campaign Details / Pitch</label>
                                        <textarea 
                                            value={description} 
                                            onChange={e => setDescription(e.target.value)} 
                                            rows={4} 
                                            placeholder="Campaign strategy, core pitch message, deliverables..."
                                            className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-normal resize-none"
                                        />
                                    </div>

                                    <div className="flex-1 flex flex-col">
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                                            Select Creators ({selectedKolIds.length} chosen)
                                        </label>
                                        <div className="border border-slate-200 rounded-2xl p-2 h-48 overflow-y-auto bg-slate-50/50 space-y-1">
                                            {allKols.length === 0 ? (
                                                <div className="text-xs text-slate-400 p-2">No creators found.</div>
                                            ) : (
                                                allKols.map(kol => {
                                                    const isChecked = selectedKolIds.includes(kol.id!);
                                                    return (
                                                        <label key={kol.id} className="flex items-center justify-between p-2 hover:bg-white rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                                                            <div className="flex items-center gap-2">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={isChecked}
                                                                    onChange={() => toggleKol(kol.id!)}
                                                                    className="h-4 w-4 text-[var(--accent-color)] border-slate-300 rounded focus:ring-[var(--accent-color)] shrink-0"
                                                                />
                                                                <KOLCell kol={kol} />
                                                            </div>
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Action Buttons */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)} 
                                    className="px-5 py-2.5 rounded-full font-medium text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-6 py-2.5 rounded-full font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 transition-colors shadow-xs text-sm"
                                >
                                    Save Proposal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default InfluencerProposal;
