import React, { useState, useEffect } from 'react';
import { supabaseClient } from '../services/supabaseClient';

interface Kol {
    id: string;
    name: string;
}

interface ProposalKol {
    kol_id: string;
    kols: Kol;
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
    proposal_kols?: ProposalKol[];
}

const InfluencerProposal: React.FC = () => {
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [allKols, setAllKols] = useState<Kol[]>([]);
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

    const fetchData = async () => {
        setLoading(true);
        try {
            const [proposalsRes, kolsRes] = await Promise.all([
                supabaseClient
                    .from('proposals')
                    .select('*, proposal_kols(kol_id, kols(id, name))')
                    .order('created_at', { ascending: false }),
                supabaseClient
                    .from('kols')
                    .select('id, name')
                    .order('name')
            ]);
                
            if (proposalsRes.error) throw proposalsRes.error;
            if (kolsRes.error) throw kolsRes.error;
            
            setProposals(proposalsRes.data as unknown as Proposal[]);
            setAllKols(kolsRes.data as Kol[]);
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
        setSelectedKolIds(kols);
        
        setShowModal(true);
    };

    const toggleKol = (kolId: string) => {
        setSelectedKolIds(prev => 
            prev.includes(kolId) ? prev.filter(id => id !== kolId) : [...prev, kolId]
        );
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
                description
            };
            
            const { data: savedProposal, error: proposalError } = await supabaseClient
                .from('proposals')
                .upsert(proposalPayload)
                .select()
                .single();
                
            if (proposalError) throw proposalError;
            
            // Manage proposal_kols relationships
            if (editingProposal?.id) {
                // Delete existing ones
                await supabaseClient.from('proposal_kols').delete().eq('proposal_id', savedProposal.id);
            }
            
            if (selectedKolIds.length > 0) {
                const pkPayloads = selectedKolIds.map(kolId => ({
                    proposal_id: savedProposal.id,
                    kol_id: kolId
                }));
                await supabaseClient.from('proposal_kols').insert(pkPayloads);
            }
            
            setShowModal(false);
            fetchData();
        } catch (e) {
            console.error('Error saving proposal:', e);
            alert('Failed to save proposal. Check console for details.');
        }
    };

    const getStatusColor = (s: string) => {
        const status = s.toLowerCase();
        if (status === 'approved') return 'bg-green-100 text-green-800';
        if (status === 'rejected') return 'bg-red-100 text-red-800';
        if (status === 'in progress') return 'bg-blue-100 text-blue-800';
        return 'bg-slate-100 text-slate-800';
    };

    return (
        <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Proposals</h2>
                    <p className="text-sm text-slate-500">Plan and pitch new campaigns, budgets, and targeted influencers.</p>
                </div>
                <button 
                    onClick={openCreate}
                    className="bg-[var(--accent-color)] text-white px-5 py-2 rounded-full font-semibold hover:bg-emerald-600 transition-colors"
                >
                    + New Proposal
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full text-center py-8">Loading proposals...</div>
                ) : proposals.length === 0 ? (
                    <div className="col-span-full text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <p className="text-slate-500">No proposals found. Create one to get started.</p>
                    </div>
                ) : (
                    proposals.map(p => (
                        <div key={p.id} className="border border-[#bfdbfe]/50 rounded-xl p-5 hover:shadow-md transition-shadow bg-white flex flex-col h-full cursor-pointer" onClick={() => openEdit(p)}>
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-bold text-slate-800 text-lg leading-tight line-clamp-2">{p.title}</h3>
                                <span className={`px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap ml-3 ${getStatusColor(p.status)}`}>
                                    {p.status}
                                </span>
                            </div>
                            
                            <p className="text-sm text-slate-500 line-clamp-3 mb-4 flex-grow">
                                {p.description || 'No description provided.'}
                            </p>
                            
                            <div className="space-y-2 text-sm mt-auto pt-4 border-t border-slate-100">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Objective</span>
                                    <span className="font-medium text-slate-700 truncate ml-2">{p.objective || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Budget</span>
                                    <span className="font-medium text-slate-700">{p.budget || '—'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Target KOLs</span>
                                    <span className="font-medium text-slate-700">{p.proposal_kols?.length || 0} selected</span>
                                </div>
                                <div className="flex justify-between pt-1">
                                    <span className="text-slate-500 text-xs">Timeline</span>
                                    <span className="font-medium text-slate-600 text-xs">
                                        {p.start_date || '?'} to {p.end_date || '?'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Form Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingProposal ? 'Edit Proposal' : 'New Proposal'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <form onSubmit={handleSave} className="flex flex-col overflow-hidden h-full">
                            <div className="p-6 overflow-y-auto space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Basics */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Proposal Title *</label>
                                            <input required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status</label>
                                                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none bg-white">
                                                    <option value="Draft">Draft</option>
                                                    <option value="In Progress">In Progress</option>
                                                    <option value="Approved">Approved</option>
                                                    <option value="Rejected">Rejected</option>
                                                    <option value="Completed">Completed</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Budget</label>
                                                <input type="text" value={budget} onChange={e => setBudget(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" placeholder="$5,000" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Objective</label>
                                            <input type="text" value={objective} onChange={e => setObjective(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" placeholder="e.g. Brand Awareness, Q3 Sales" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Target Audience</label>
                                            <input type="text" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" placeholder="e.g. US, Dropshippers, 18-35" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Start Date</label>
                                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">End Date</label>
                                                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Description & Target KOLs */}
                                    <div className="space-y-4 flex flex-col">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Proposal Details / Pitch</label>
                                            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={6} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none resize-none" placeholder="Campaign strategy, core message, requirements..."></textarea>
                                        </div>
                                        
                                        <div className="flex-grow flex flex-col mt-2">
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Target KOLs</label>
                                            <div className="border border-[#bfdbfe]/50 rounded-lg p-2 h-48 overflow-y-auto bg-slate-50">
                                                {allKols.length === 0 ? (
                                                    <div className="text-sm text-slate-500 p-2">No KOLs found.</div>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {allKols.map(kol => (
                                                            <label key={kol.id} className="flex items-center p-2 hover:bg-white rounded cursor-pointer">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={selectedKolIds.includes(kol.id)}
                                                                    onChange={() => toggleKol(kol.id)}
                                                                    className="h-4 w-4 text-[var(--accent-color)] border-slate-300 rounded focus:ring-[var(--accent-color)] mr-3"
                                                                />
                                                                <span className="text-sm text-slate-700">{kol.name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2 text-right">{selectedKolIds.length} KOL(s) selected</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-3 p-6 border-t border-slate-100 shrink-0">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-full font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                                <button type="submit" className="px-6 py-2.5 rounded-full font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 transition-colors shadow-sm">Save Proposal</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InfluencerProposal;
