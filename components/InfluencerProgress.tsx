import React, { useState, useEffect, useRef } from 'react';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import { fetchYouTubeVideoDetails } from '../services/youtubeService';

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
}

// Predefined status tags
const PROGRESS_TAG_OPTIONS = [
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

const InfluencerProgress: React.FC = () => {
    const [collaborations, setCollaborations] = useState<CollaborationRow[]>([]);
    const [allKols, setAllKols] = useState<KolData[]>([]);
    const [loading, setLoading] = useState(true);

    // Active inline editing state: { rowId, field }
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);

    // Modal state for Payment & Actual Budget Spent
    const [paymentModalRow, setPaymentModalRow] = useState<CollaborationRow | null>(null);
    const [actualSpentInput, setActualSpentInput] = useState<string>('0');
    const [paymentStatusInput, setPaymentStatusInput] = useState<string>('');

    // Modal state for adding a new record
    const [showAddModal, setShowAddModal] = useState(false);
    const [newKolId, setNewKolId] = useState('');
    const [newKolName, setNewKolName] = useState('');
    const [newStartMonth, setNewStartMonth] = useState('');
    const [newPackage, setNewPackage] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [collabRes, kolsRes] = await Promise.all([
                supabaseClient
                    .from('collaborations')
                    .select('*, kols(*)')
                    .order('created_at', { ascending: false }),
                supabaseClient
                    .from('kols')
                    .select('*')
                    .order('name')
            ]);
            
            if (collabRes.error) throw collabRes.error;
            if (kolsRes.error) throw kolsRes.error;

            setCollaborations(collabRes.data as unknown as CollaborationRow[]);
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

    // Helper to update field in state and Supabase directly
    const updateField = async (rowId: string, field: keyof CollaborationRow, value: any) => {
        // Update local state immediately for fast feedback
        setCollaborations(prev => prev.map(c => c.id === rowId ? { ...c, [field]: value } : c));
        setEditingCell(null);

        try {
            const { error } = await supabaseClient
                .from('collaborations')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('id', rowId);

            if (error) throw error;
        } catch (e) {
            console.error(`Failed to update ${field}:`, e);
            fetchData(); // Rollback on error
        }
    };

    // Auto release date fetcher when report links change
    const handleReportLinksChange = async (rowId: string, newLinksText: string) => {
        await updateField(rowId, 'report_links', newLinksText);

        // Check if there are YouTube links in newLinksText
        const urls = newLinksText.match(/(https?:\/\/[^\s,]+)/g) || [];
        for (const url of urls) {
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                const details = await fetchYouTubeVideoDetails(url);
                if (details && details.publishedAt) {
                    await updateField(rowId, 'released_date', details.publishedAt);
                    break;
                }
            }
        }
    };

    // Payment progress bar click handler -> opens Actual Spent modal
    const openPaymentModal = (row: CollaborationRow) => {
        setPaymentModalRow(row);
        setActualSpentInput(String(row.actual_spent || 0));
        setPaymentStatusInput(row.payment_status || 'All Payment Done');
    };

    const handleSavePaymentModal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentModalRow) return;

        const spentNum = parseFloat(actualSpentInput) || 0;

        try {
            await supabaseClient
                .from('collaborations')
                .update({ 
                    actual_spent: spentNum, 
                    payment_status: paymentStatusInput,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', paymentModalRow.id);

            setCollaborations(prev => prev.map(c => 
                c.id === paymentModalRow.id 
                    ? { ...c, actual_spent: spentNum, payment_status: paymentStatusInput } 
                    : c
            ));
            setPaymentModalRow(null);
        } catch (e) {
            console.error('Failed to save payment details:', e);
            alert('Failed to update payment details.');
        }
    };

    // Add new collaboration
    const handleCreateCollaboration = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let kolIdToUse = newKolId;

            // If user typed a new KOL name instead of selecting existing
            if (!kolIdToUse && newKolName.strip()) {
                const { data: newKol, error: kolErr } = await supabaseClient
                    .from('kols')
                    .insert({ name: newKolName.strip(), country: 'US' })
                    .select()
                    .single();
                if (kolErr) throw kolErr;
                kolIdToUse = newKol.id;
            }

            if (!kolIdToUse) {
                alert('Please select or type a KOL name.');
                return;
            }

            const { error } = await supabaseClient
                .from('collaborations')
                .insert({
                    kol_id: kolIdToUse,
                    start_month: newStartMonth || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
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
            console.error('Error creating record:', e);
            alert('Failed to create record.');
        }
    };

    return (
        <div className="card p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <span>Influencer Deal Progress</span>
                        <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Live Source of Truth
                        </span>
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Directly edit deal statuses, packages, video report links, and actual budget spent.
                    </p>
                </div>
                <button 
                    onClick={() => setShowAddModal(true)}
                    className="bg-[var(--accent-color)] text-white px-5 py-2.5 rounded-full font-semibold hover:bg-emerald-600 transition-colors shadow-sm text-sm flex items-center justify-center gap-1.5 w-fit"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    <span>Add New Deal</span>
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-[#bfdbfe]/50 rounded-2xl shadow-xs bg-white">
                <table className="w-full text-sm text-left text-slate-600 border-collapse">
                    <thead className="text-xs text-[#2236ba] font-bold uppercase bg-slate-50/80 border-b border-[#bfdbfe]/50">
                        <tr>
                            <th className="px-4 py-3.5 whitespace-nowrap min-w-[120px]">Date / Month</th>
                            <th className="px-4 py-3.5 min-w-[220px]">KOL</th>
                            <th className="px-4 py-3.5 min-w-[150px]">Progress Tag</th>
                            <th className="px-4 py-3.5 min-w-[170px]">Payment Progress</th>
                            <th className="px-4 py-3.5 text-right min-w-[110px]">Package ($)</th>
                            <th className="px-4 py-3.5 text-center min-w-[80px]">Videos</th>
                            <th className="px-4 py-3.5 min-w-[200px]">Report Links</th>
                            <th className="px-4 py-3.5 min-w-[120px]">Released Date</th>
                            <th className="px-4 py-3.5 min-w-[100px]">Agreement</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#bfdbfe]/30">
                        {loading ? (
                            <tr><td colSpan={9} className="text-center py-12 text-slate-400">Loading deal records...</td></tr>
                        ) : collaborations.length === 0 ? (
                            <tr><td colSpan={9} className="text-center py-12 text-slate-400">No records found. Click "+ Add New Deal" to create one.</td></tr>
                        ) : (
                            collaborations.map(c => {
                                const totalPkgNum = parsePackageNumber(c.total_package);
                                const actualSpent = c.actual_spent || 0;
                                const paymentPercent = totalPkgNum > 0 ? Math.min(100, Math.round((actualSpent / totalPkgNum) * 100)) : (c.payment_status === 'All Payment Done' ? 100 : 0);

                                return (
                                    <tr key={c.id} className="hover:bg-emerald-50/20 transition-colors group">
                                        
                                        {/* 1. Leftmost Date / Month Column */}
                                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                                            {editingCell?.id === c.id && editingCell?.field === 'start_month' ? (
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    defaultValue={c.start_month || ''}
                                                    onBlur={e => updateField(c.id, 'start_month', e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && updateField(c.id, 'start_month', (e.target as HTMLInputElement).value)}
                                                    className="w-full p-1 border border-[var(--accent-color)] rounded outline-none text-xs bg-white shadow-xs"
                                                />
                                            ) : (
                                                <div 
                                                    onClick={() => setEditingCell({ id: c.id, field: 'start_month' })}
                                                    className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded text-slate-700 transition-colors inline-block w-full"
                                                    title="Click to edit date"
                                                >
                                                    {c.start_month || 'MMM YYYY'}
                                                </div>
                                            )}
                                        </td>

                                        {/* 2. KOL Universal Column */}
                                        <td className="px-4 py-3">
                                            <KOLCell kol={c.kols} />
                                        </td>

                                        {/* 3. Progress Tag Column ("Hili Tag") */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {editingCell?.id === c.id && editingCell?.field === 'progress_status' ? (
                                                <div className="relative">
                                                    <select
                                                        autoFocus
                                                        defaultValue={c.progress_status || ''}
                                                        onChange={e => updateField(c.id, 'progress_status', e.target.value)}
                                                        onBlur={() => setEditingCell(null)}
                                                        className="p-1.5 border border-[var(--accent-color)] rounded-lg text-xs bg-white outline-none w-full shadow-xs"
                                                    >
                                                        {PROGRESS_TAG_OPTIONS.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setEditingCell({ id: c.id, field: 'progress_status' })}
                                                    className={`px-3 py-1 rounded-full text-xs border transition-transform hover:scale-105 inline-flex items-center gap-1 ${getProgressTagStyle(c.progress_status)}`}
                                                    title="Click to change progress status"
                                                >
                                                    <span>{c.progress_status || 'Select Status'}</span>
                                                    <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                                </button>
                                            )}
                                        </td>

                                        {/* 4. Payment Progress Bar Column (Click -> Modal) */}
                                        <td className="px-4 py-3">
                                            <div 
                                                onClick={() => openPaymentModal(c)}
                                                className="cursor-pointer group/bar p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                                title="Click to update Actual Budget Spent & Payment Status"
                                            >
                                                <div className="flex justify-between items-center text-xs mb-1 font-semibold">
                                                    <span className="text-slate-600 truncate max-w-[100px]">
                                                        {c.payment_status || 'Payment'}
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
                                                <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                                                    <span>Spent: {formatCurrencyUSD(actualSpent)}</span>
                                                    <span>Pkg: {formatCurrencyUSD(totalPkgNum)}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* 5. Package Column ($ USD) */}
                                        <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                                            {editingCell?.id === c.id && editingCell?.field === 'total_package' ? (
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    defaultValue={c.total_package || ''}
                                                    onBlur={e => updateField(c.id, 'total_package', e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && updateField(c.id, 'total_package', (e.target as HTMLInputElement).value)}
                                                    className="w-24 p-1 border border-[var(--accent-color)] rounded outline-none text-xs text-right bg-white shadow-xs"
                                                />
                                            ) : (
                                                <div 
                                                    onClick={() => setEditingCell({ id: c.id, field: 'total_package' })}
                                                    className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded transition-colors inline-block"
                                                    title="Click to edit package"
                                                >
                                                    {formatCurrencyUSD(c.total_package)}
                                                </div>
                                            )}
                                        </td>

                                        {/* 6. Dedicated Content Count Column */}
                                        <td className="px-4 py-3 text-center whitespace-nowrap">
                                            {editingCell?.id === c.id && editingCell?.field === 'content_count' ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    autoFocus
                                                    defaultValue={c.content_count || 1}
                                                    onBlur={e => updateField(c.id, 'content_count', parseInt(e.target.value) || 0)}
                                                    onKeyDown={e => e.key === 'Enter' && updateField(c.id, 'content_count', parseInt((e.target as HTMLInputElement).value) || 0)}
                                                    className="w-14 p-1 border border-[var(--accent-color)] rounded outline-none text-xs text-center bg-white shadow-xs"
                                                />
                                            ) : (
                                                <span 
                                                    onClick={() => setEditingCell({ id: c.id, field: 'content_count' })}
                                                    className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded text-slate-700 font-bold transition-colors inline-block"
                                                    title="Click to edit content count"
                                                >
                                                    {c.content_count || 1}
                                                </span>
                                            )}
                                        </td>

                                        {/* 7. Videos / Report Links Column (Clickable URLs) */}
                                        <td className="px-4 py-3 max-w-[240px]">
                                            {editingCell?.id === c.id && editingCell?.field === 'report_links' ? (
                                                <textarea
                                                    autoFocus
                                                    rows={3}
                                                    defaultValue={c.report_links || ''}
                                                    onBlur={e => handleReportLinksChange(c.id, e.target.value)}
                                                    className="w-full p-2 border border-[var(--accent-color)] rounded-lg text-xs bg-white outline-none resize-none shadow-xs"
                                                    placeholder="Paste video URLs..."
                                                />
                                            ) : (
                                                <div 
                                                    onClick={() => setEditingCell({ id: c.id, field: 'report_links' })}
                                                    className="cursor-pointer hover:bg-slate-100/80 p-1.5 rounded-lg transition-colors min-h-[36px] flex flex-col justify-center"
                                                    title="Click to edit report video links"
                                                >
                                                    {c.report_links ? (
                                                        <div className="space-y-1">
                                                            {(c.report_links.match(/(https?:\/\/[^\s,]+)/g) || [c.report_links]).map((link, idx) => (
                                                                <a 
                                                                    key={idx}
                                                                    href={link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 truncate max-w-[200px]"
                                                                >
                                                                    <svg className="w-3.5 h-3.5 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                                                    <span className="truncate">{link.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">+ Add Video Links</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* 8. Released Date Column */}
                                        <td className="px-4 py-3 whitespace-nowrap text-xs">
                                            {editingCell?.id === c.id && editingCell?.field === 'released_date' ? (
                                                <input
                                                    type="date"
                                                    autoFocus
                                                    defaultValue={c.released_date || ''}
                                                    onBlur={e => updateField(c.id, 'released_date', e.target.value)}
                                                    onChange={e => updateField(c.id, 'released_date', e.target.value)}
                                                    className="p-1 border border-[var(--accent-color)] rounded outline-none text-xs bg-white shadow-xs"
                                                />
                                            ) : (
                                                <div 
                                                    onClick={() => setEditingCell({ id: c.id, field: 'released_date' })}
                                                    className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded text-slate-700 font-medium transition-colors"
                                                    title="Click to edit release date"
                                                >
                                                    {c.released_date ? new Date(c.released_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—'}
                                                </div>
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
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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

            {/* Modal: Actual Budget Spent & Payment Status */}
            {paymentModalRow && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Payment & Budget Details</h3>
                                <p className="text-xs text-slate-500 mt-0.5">KOL: <strong className="text-slate-700">{paymentModalRow.kols?.name}</strong></p>
                            </div>
                            <button onClick={() => setPaymentModalRow(null)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSavePaymentModal} className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Total Contract Package
                                </label>
                                <div className="p-3 bg-slate-100 rounded-xl font-extrabold text-slate-800 text-lg border border-slate-200">
                                    {formatCurrencyUSD(paymentModalRow.total_package)}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Actual Budget Spent ($ USD) *
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold">$</span>
                                    <input 
                                        type="number" 
                                        min="0"
                                        step="any"
                                        required
                                        value={actualSpentInput}
                                        onChange={e => setActualSpentInput(e.target.value)}
                                        className="w-full pl-8 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent outline-none font-bold text-slate-800 text-lg shadow-xs"
                                        placeholder="0"
                                    />
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    Progress percentage: <strong className="text-slate-700">{parsePackageNumber(paymentModalRow.total_package) > 0 ? Math.min(100, Math.round(((parseFloat(actualSpentInput) || 0) / parsePackageNumber(paymentModalRow.total_package)) * 100)) : 0}%</strong>
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                                    Payment Status Note
                                </label>
                                <select 
                                    value={paymentStatusInput}
                                    onChange={e => setPaymentStatusInput(e.target.value)}
                                    className="w-full p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none bg-white font-medium text-slate-700 text-sm shadow-xs"
                                >
                                    <option value="All Payment Done">All Payment Done (100%)</option>
                                    <option value="1st Payment Done">1st Payment Done</option>
                                    <option value="2nd Payment Done">2nd Payment Done</option>
                                    <option value="Awaiting Payment">Awaiting Payment</option>
                                    <option value="Free of charge">Free of charge</option>
                                </select>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button 
                                    type="button" 
                                    onClick={() => setPaymentModalRow(null)} 
                                    className="px-5 py-2.5 rounded-full font-semibold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-6 py-2.5 rounded-full font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 transition-colors shadow-sm text-sm"
                                >
                                    Save Budget Update
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Add New Deal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <h3 className="text-lg font-bold text-slate-800">Add New Influencer Deal</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
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
                                        <option key={k.id} value={k.id}>{k.name} ({k.country || 'US'})</option>
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
                                        Date / Month
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
                                    className="px-6 py-2.5 rounded-full font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 transition-colors shadow-sm text-sm"
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
