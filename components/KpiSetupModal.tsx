import React, { useState, useEffect } from 'react';
import { KpiTarget } from '../types';
import { supabaseClient } from '../services/supabaseClient';
import { getBangkokDateParts } from '../utils/timeHelper';

interface KpiSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    initialTargets: KpiTarget[];
}

const KpiSetupModal: React.FC<KpiSetupModalProps> = ({ isOpen, onClose, onSave, initialTargets }) => {
    const [year, setYear] = useState(getBangkokDateParts(new Date()).year);
    const [signupTargets, setSignupTargets] = useState({ q1: 0, q2: 0, q3: 0, q4: 0 });
    const [clickTargets, setClickTargets] = useState({ q1: 0, q2: 0, q3: 0, q4: 0 });
    const [viewcountTargets, setViewcountTargets] = useState({ q1: 0, q2: 0, q3: 0, q4: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const signups = initialTargets.find(t => t.kpi_name === 'NonKOL Signups' && t.year === year);
        const clicks = initialTargets.find(t => t.kpi_name === 'NonKOL Clicks' && t.year === year);
        const viewcounts = initialTargets.find(t => t.kpi_name === 'KOL Viewcount' && t.year === year);
        
        setSignupTargets({
            q1: signups?.q1_target || 0,
            q2: signups?.q2_target || 0,
            q3: signups?.q3_target || 0,
            q4: signups?.q4_target || 0,
        });
        setClickTargets({
            q1: clicks?.q1_target || 0,
            q2: clicks?.q2_target || 0,
            q3: clicks?.q3_target || 0,
            q4: clicks?.q4_target || 0,
        });
        setViewcountTargets({
            q1: viewcounts?.q1_target || 0,
            q2: viewcounts?.q2_target || 0,
            q3: viewcounts?.q3_target || 0,
            q4: viewcounts?.q4_target || 0,
        });
    }, [initialTargets, year]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        try {
            const upsertData: Omit<KpiTarget, 'id'>[] = [
                {
                    kpi_name: 'NonKOL Signups',
                    year: year,
                    q1_target: signupTargets.q1,
                    q2_target: signupTargets.q2,
                    q3_target: signupTargets.q3,
                    q4_target: signupTargets.q4,
                },
                {
                    kpi_name: 'NonKOL Clicks',
                    year: year,
                    q1_target: clickTargets.q1,
                    q2_target: clickTargets.q2,
                    q3_target: clickTargets.q3,
                    q4_target: clickTargets.q4,
                },
                {
                    kpi_name: 'KOL Viewcount',
                    year: year,
                    q1_target: viewcountTargets.q1,
                    q2_target: viewcountTargets.q2,
                    q3_target: viewcountTargets.q3,
                    q4_target: viewcountTargets.q4,
                }
            ];

            const { error } = await supabaseClient
                .from('kpi_targets')
                .upsert(upsertData, { onConflict: 'kpi_name,year' });

            if (error) throw error;
            
            onSave();
            onClose();
        } catch {
            setError('Failed to save targets.');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (
        metric: 'signups' | 'clicks' | 'viewcount',
        quarter: 'q1' | 'q2' | 'q3' | 'q4',
        value: string
    ) => {
        const numValue = parseInt(value, 10) || 0;
        const setter = metric === 'signups' ? setSignupTargets : metric === 'clicks' ? setClickTargets : setViewcountTargets;
        setter(prev => ({ ...prev, [quarter]: numValue }));
    };

    const currentYear = getBangkokDateParts(new Date()).year;
    const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white card p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
                <h2 className="text-xl font-bold text-slate-800 mb-4">Set Quarterly KPIs</h2>
                
                <div className="mb-6">
                    <label htmlFor="year" className="block text-sm font-medium text-slate-700">Year</label>
                    <select id="year" value={year} onChange={e => setYear(parseInt(e.target.value))} className="mt-1 block w-full p-2 text-base bg-white border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] sm:text-sm">
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                    <div className="p-4 border border-slate-200 rounded-md">
                         <h3 className="font-semibold text-slate-700 mb-2">NonKOL Signups</h3>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <input type="number" placeholder="Q1" value={signupTargets.q1 || ''} onChange={e => handleInputChange('signups', 'q1', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q2" value={signupTargets.q2 || ''} onChange={e => handleInputChange('signups', 'q2', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q3" value={signupTargets.q3 || ''} onChange={e => handleInputChange('signups', 'q3', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q4" value={signupTargets.q4 || ''} onChange={e => handleInputChange('signups', 'q4', e.target.value)} className="w-full p-2 border border-slate-300" />
                         </div>
                    </div>
                     <div className="p-4 border border-slate-200 rounded-md">
                         <h3 className="font-semibold text-slate-700 mb-2">NonKOL Clicks</h3>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <input type="number" placeholder="Q1" value={clickTargets.q1 || ''} onChange={e => handleInputChange('clicks', 'q1', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q2" value={clickTargets.q2 || ''} onChange={e => handleInputChange('clicks', 'q2', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q3" value={clickTargets.q3 || ''} onChange={e => handleInputChange('clicks', 'q3', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q4" value={clickTargets.q4 || ''} onChange={e => handleInputChange('clicks', 'q4', e.target.value)} className="w-full p-2 border border-slate-300" />
                         </div>
                    </div>
                     <div className="p-4 border border-slate-200 rounded-md">
                         <h3 className="font-semibold text-slate-700 mb-2">KOL Viewcount</h3>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <input type="number" placeholder="Q1" value={viewcountTargets.q1 || ''} onChange={e => handleInputChange('viewcount', 'q1', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q2" value={viewcountTargets.q2 || ''} onChange={e => handleInputChange('viewcount', 'q2', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q3" value={viewcountTargets.q3 || ''} onChange={e => handleInputChange('viewcount', 'q3', e.target.value)} className="w-full p-2 border border-slate-300" />
                            <input type="number" placeholder="Q4" value={viewcountTargets.q4 || ''} onChange={e => handleInputChange('viewcount', 'q4', e.target.value)} className="w-full p-2 border border-slate-300" />
                         </div>
                    </div>
                </div>
                
                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}

                <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end space-x-4">
                    <button onClick={onClose} disabled={loading} className="px-4 py-2 bg-white text-slate-800 border border-slate-300 disabled:opacity-50">Cancel</button>
                    <button onClick={handleSave} disabled={loading} className="px-4 py-2 bg-[var(--accent-color)] text-white primary-btn disabled:bg-slate-400">
                        {loading ? 'Saving...' : 'Save Targets'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default KpiSetupModal;