import React, { useState, useEffect } from 'react';
import { supabaseClient } from '../services/supabaseClient';

interface Kol {
    id: string;
    name: string;
    email: string;
    country: string;
    subscriber_count: string;
}

interface Collaboration {
    id: string;
    kol_id: string;
    payment_status: string;
    progress_status: string;
    report_links: string;
    released_date: string;
    agreement_link: string;
    total_package: string;
    content_count: number;
    notes: string;
    kols?: Kol;
}

const InfluencerProgress: React.FC = () => {
    const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingCollab, setEditingCollab] = useState<Collaboration | null>(null);

    // Form states
    const [kolName, setKolName] = useState('');
    const [email, setEmail] = useState('');
    const [country, setCountry] = useState('');
    const [subCount, setSubCount] = useState('');
    
    const [paymentStatus, setPaymentStatus] = useState('');
    const [progressStatus, setProgressStatus] = useState('');
    const [reportLinks, setReportLinks] = useState('');
    const [releasedDate, setReleasedDate] = useState('');
    const [agreementLink, setAgreementLink] = useState('');
    const [totalPackage, setTotalPackage] = useState('');
    const [contentCount, setContentCount] = useState<number>(1);
    const [notes, setNotes] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabaseClient
                .from('collaborations')
                .select('*, kols(*)')
                .order('created_at', { ascending: false });
                
            if (error) throw error;
            setCollaborations(data as Collaboration[]);
        } catch (e) {
            console.error('Error fetching collaborations:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const openCreate = () => {
        setEditingCollab(null);
        setKolName('');
        setEmail('');
        setCountry('');
        setSubCount('');
        setPaymentStatus('');
        setProgressStatus('');
        setReportLinks('');
        setReleasedDate('');
        setAgreementLink('');
        setTotalPackage('');
        setContentCount(1);
        setNotes('');
        setShowModal(true);
    };

    const openEdit = (c: Collaboration) => {
        setEditingCollab(c);
        setKolName(c.kols?.name || '');
        setEmail(c.kols?.email || '');
        setCountry(c.kols?.country || '');
        setSubCount(c.kols?.subscriber_count || '');
        
        setPaymentStatus(c.payment_status || '');
        setProgressStatus(c.progress_status || '');
        setReportLinks(c.report_links || '');
        setReleasedDate(c.released_date || '');
        setAgreementLink(c.agreement_link || '');
        setTotalPackage(c.total_package || '');
        setContentCount(c.content_count || 1);
        setNotes(c.notes || '');
        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        try {
            // 1. Upsert KOL
            const { data: kolData, error: kolError } = await supabaseClient
                .from('kols')
                .upsert({ 
                    ...(editingCollab?.kol_id ? { id: editingCollab.kol_id } : {}),
                    name: kolName, 
                    email: email, 
                    country: country, 
                    subscriber_count: subCount 
                }, { onConflict: 'name' })
                .select()
                .single();
                
            if (kolError) throw kolError;
            
            // 2. Upsert Collaboration
            const collabPayload = {
                ...(editingCollab?.id ? { id: editingCollab.id } : {}),
                kol_id: kolData.id,
                payment_status: paymentStatus,
                progress_status: progressStatus,
                report_links: reportLinks,
                released_date: releasedDate || null,
                agreement_link: agreementLink,
                total_package: totalPackage,
                content_count: contentCount,
                notes: notes
            };
            
            const { error: collabError } = await supabaseClient
                .from('collaborations')
                .upsert(collabPayload);
                
            if (collabError) throw collabError;
            
            setShowModal(false);
            fetchData();
        } catch (e) {
            console.error('Error saving collaboration:', e);
            alert('Failed to save collaboration. Check console for details.');
        }
    };

    return (
        <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">KOL Progress</h2>
                    <p className="text-sm text-slate-500">Manage operational workflow and deal progress for influencers.</p>
                </div>
                <button 
                    onClick={openCreate}
                    className="bg-[var(--accent-color)] text-white px-5 py-2 rounded-full font-semibold hover:bg-emerald-600 transition-colors"
                >
                    + Add Record
                </button>
            </div>
            
            <div className="overflow-x-auto border border-[#bfdbfe]/50 rounded-xl">
                <table className="w-full text-sm text-left text-slate-600 whitespace-nowrap">
                    <thead className="text-xs text-[#2236ba] font-bold uppercase bg-slate-50 border-b border-[#bfdbfe]/50">
                        <tr>
                            <th className="px-4 py-3">KOL Name</th>
                            <th className="px-4 py-3">Followers</th>
                            <th className="px-4 py-3">Country</th>
                            <th className="px-4 py-3">Progress</th>
                            <th className="px-4 py-3">Payment</th>
                            <th className="px-4 py-3 text-right">Package</th>
                            <th className="px-4 py-3 text-center">Videos</th>
                            <th className="px-4 py-3">Release Date</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} className="text-center py-8">Loading...</td></tr>
                        ) : collaborations.length === 0 ? (
                            <tr><td colSpan={9} className="text-center py-8">No records found.</td></tr>
                        ) : (
                            collaborations.map(c => (
                                <tr key={c.id} className="border-b border-[#bfdbfe]/30 hover:bg-emerald-50/30 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-900">{c.kols?.name}</td>
                                    <td className="px-4 py-3">{c.kols?.subscriber_count}</td>
                                    <td className="px-4 py-3">{c.kols?.country}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold">
                                            {c.progress_status || 'Pending'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">{c.payment_status}</td>
                                    <td className="px-4 py-3 text-right font-medium">{c.total_package}</td>
                                    <td className="px-4 py-3 text-center">{c.content_count}</td>
                                    <td className="px-4 py-3">{c.released_date}</td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => openEdit(c)} className="text-[var(--accent-color)] font-semibold hover:underline mr-3">Edit</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Form Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h3 className="text-lg font-bold text-slate-800">{editingCollab ? 'Edit Record' : 'New Record'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* KOL Information */}
                                <div className="space-y-4">
                                    <h4 className="font-semibold text-slate-700 border-b pb-2">KOL Details</h4>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Name *</label>
                                        <input required type="text" value={kolName} onChange={e => setKolName(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email</label>
                                        <input type="text" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Location</label>
                                            <input type="text" value={country} onChange={e => setCountry(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Followers</label>
                                            <input type="text" value={subCount} onChange={e => setSubCount(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                        </div>
                                    </div>
                                </div>

                                {/* Deal Information */}
                                <div className="space-y-4">
                                    <h4 className="font-semibold text-slate-700 border-b pb-2">Deal Info</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Package</label>
                                            <input type="text" value={totalPackage} onChange={e => setTotalPackage(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" placeholder="$1000" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">No. of Content</label>
                                            <input type="number" min="0" value={contentCount} onChange={e => setContentCount(Number(e.target.value))} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Progress</label>
                                            <input type="text" value={progressStatus} onChange={e => setProgressStatus(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Payment Status</label>
                                            <input type="text" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Signed Agreement URL</label>
                                        <input type="text" value={agreementLink} onChange={e => setAgreementLink(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Outputs */}
                            <div className="space-y-4">
                                <h4 className="font-semibold text-slate-700 border-b pb-2">Outputs & Delivery</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Report Links (Comma separated)</label>
                                        <textarea value={reportLinks} onChange={e => setReportLinks(e.target.value)} rows={3} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none resize-none" placeholder="https://youtube.com/..."></textarea>
                                        <p className="text-xs text-slate-400 mt-1">The scraper will extract all valid URLs from this field.</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Released Date</label>
                                        <input type="date" value={releasedDate} onChange={e => setReleasedDate(e.target.value)} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Internal Notes</label>
                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full p-2.5 border border-[#bfdbfe]/50 rounded-lg focus:ring-1 focus:ring-[var(--accent-color)] outline-none resize-none"></textarea>
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-full font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                                <button type="submit" className="px-6 py-2.5 rounded-full font-semibold text-white bg-[var(--accent-color)] hover:bg-emerald-600 transition-colors shadow-sm">Save Record</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InfluencerProgress;
