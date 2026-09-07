import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import DiscussionSidebar from './DiscussionSidebar';
import ActionMenu, { ActionMenuItem } from './ActionMenu';
import { fetchYouTubeChannelDetails } from '../services/youtubeService';
import {
    Plus, Check, Trash2, X, ArrowUpDown,
    FileText, Upload, Loader2, Youtube, MessageCircle, RotateCcw, Link as LinkIcon,
    MoreVertical
} from 'lucide-react';

interface CreatorDeal {
    kol_id: string;
    est_rate?: number | string | null;
    deliverables?: string | null;
    terms?: string | null;
    contract_link?: string | null;
    audience_screenshots?: string | string[] | null;
    status?: string | null;
    kols: KolData;
}

const getCreatorStatusStyle = (status?: string | null) => {
    if (!status) return 'bg-slate-100 text-slate-500 border-slate-200 font-normal';
    const s = status.trim().toLowerCase();
    if (s === 'approved') return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
    if (s === 'not approved' || s === 'rejected') return 'bg-rose-100 text-rose-800 border-rose-300 font-semibold';
    if (s === 're-negotiate' || s === 'renegotiate' || s === 'need to check') return 'bg-amber-100 text-amber-800 border-amber-300 font-semibold';
    return 'bg-blue-100 text-blue-800 border-blue-300 font-semibold';
};

const formatCurrencyUSD = (val?: string | number | null): string => {
    if (val === undefined || val === null || val === '') return '$0';
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.]/g, ''));
    if (isNaN(num)) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
};

const renderRichText = (text?: string | null) => {
    if (!text || !text.trim()) return null;

    const formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline font-medium">$1</a>');

    return (
        <div
            className="text-xs text-slate-700 font-normal leading-relaxed whitespace-pre-line"
            dangerouslySetInnerHTML={{ __html: formatted }}
        />
    );
};

const calcPopoverPosition = (
    anchorRect?: DOMRect | null,
    width = 300,
    height = 320,
    margin = 12
): React.CSSProperties => {
    if (!anchorRect) return { position: 'fixed', zIndex: 99999 };
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;

    const spaceBelow = vh - anchorRect.bottom;
    const spaceAbove = anchorRect.top;

    const openUpward = spaceBelow < height && spaceAbove > spaceBelow;

    let top: number;
    if (openUpward) {
        top = Math.max(margin, anchorRect.top - height - 6);
    } else {
        top = Math.min(vh - height - margin, anchorRect.bottom + 6);
    }
    top = Math.max(margin, top);

    let left = anchorRect.left;
    if (left + width > vw - margin) {
        left = Math.max(margin, vw - width - margin);
    }
    left = Math.max(margin, left);

    return {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        maxHeight: `${Math.min(height, vh - 2 * margin)}px`,
        zIndex: 99999,
    };
};

const InfluencerProposal: React.FC = () => {
    const [creators, setCreators] = useState<CreatorDeal[]>([]);
    const [loading, setLoading] = useState(true);

    const [copiedLink, setCopiedLink] = useState(false);

    const handleCopyShareableLink = () => {
        try {
            const currentUrl = window.location.href;
            navigator.clipboard.writeText(currentUrl);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2500);
        } catch (e) {
            console.error('Failed to copy link', e);
        }
    };

    // Add Creator Modal state
    const [showAddCreatorModal, setShowAddCreatorModal] = useState(false);
    const [ytChannelInput, setYtChannelInput] = useState('');
    const [fetchingYt, setFetchingYt] = useState(false);

    // Lightbox image state
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    // Creator Cell Editing Popover State (For Est Rate, Deliverables, Terms, Contract Link)
    const [activeCellPopover, setActiveCellPopover] = useState<{
        kolId: string;
        type: 'rate' | 'deliverables' | 'terms' | 'contract';
        anchorRect?: DOMRect;
    } | null>(null);

    // Discussion unread activities state
    const [threadActivities, setThreadActivities] = useState<Record<string, {
        threadId: string;
        kolId: string;
        lastMessageAt: string;
        lastMessageBy: string;
        unreadCount: number;
    }>>({});

    const fetchThreadActivities = useCallback(async () => {
        try {
            const { data: threads, error: tErr } = await supabaseClient
                .from('creator_discussion_threads')
                .select('id, kol_id');

            if (tErr || !threads || threads.length === 0) return;

            const threadIds = threads.map((t: any) => t.id);
            const { data: msgs, error: mErr } = await supabaseClient
                .from('creator_discussion_messages')
                .select('id, thread_id, actor, created_at')
                .in('thread_id', threadIds)
                .order('created_at', { ascending: true });

            if (mErr) return;

            const { data: { user } } = await supabaseClient.auth.getUser();
            const userEmail = (user?.email || '').toLowerCase();
            const userName = (user?.user_metadata?.full_name || '').toLowerCase();

            const activities: Record<string, {
                threadId: string;
                kolId: string;
                lastMessageAt: string;
                lastMessageBy: string;
                unreadCount: number;
            }> = {};

            threads.forEach((t: any) => {
                const threadMsgs = (msgs || []).filter((m: any) => m.thread_id === t.id);
                if (threadMsgs.length === 0) return;

                const lastMsg = threadMsgs[threadMsgs.length - 1];
                const localReadTime = localStorage.getItem(`tp_thread_read_${t.id}_${userEmail}`) || '1970-01-01T00:00:00Z';
                const readTimestamp = new Date(localReadTime).getTime();

                const unreads = threadMsgs.filter((m: any) => {
                    const isOwn = (m.actor || '').toLowerCase() === userName || (m.actor || '').toLowerCase() === userEmail;
                    return !isOwn && new Date(m.created_at).getTime() > readTimestamp;
                });

                activities[t.kol_id] = {
                    threadId: t.id,
                    kolId: t.kol_id,
                    lastMessageAt: lastMsg.created_at,
                    lastMessageBy: lastMsg.actor,
                    unreadCount: unreads.length
                };
            });

            setThreadActivities(activities);
        } catch (e) {
            console.error('Error fetching thread activities:', e);
        }
    }, []);

    // Discussion Sidebar state
    const [activeDiscussion, setActiveDiscussion] = useState<{
        kolId: string;
        kolName: string;
    } | null>(null);

    // Creator Row Action Dropdown Menu state
    const [activeActionMenu, setActiveActionMenu] = useState<{
        kolId: string;
        anchorRect: DOMRect;
    } | null>(null);

    // Creators Table Sort state
    const [creatorSortField, setCreatorSortField] = useState<'name' | 'status' | 'est_rate' | 'log' | null>('log');
    const [creatorSortDirection, setCreatorSortDirection] = useState<'asc' | 'desc'>('desc');

    // Popover input temporary values
    const [cellRateVal, setCellRateVal] = useState('');
    const [cellDeliverablesVal, setCellDeliverablesVal] = useState('');
    const [cellTermsVal, setCellTermsVal] = useState('');
    const [cellContractVal, setCellContractVal] = useState('');

    // Deliverables preset quantity states
    const [qty90s, setQty90s] = useState(0);
    const [qtyTiktok, setQtyTiktok] = useState(0);
    const [qtyPostX, setQtyPostX] = useState(0);

    const cellPopoverRef = useRef<HTMLDivElement>(null);
    const actionMenuRef = useRef<HTMLDivElement>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabaseClient
                .from('creator_deals')
                .select('*, kols(*)');

            if (error) throw error;

            setCreators((data || []) as unknown as CreatorDeal[]);

            // Check for OAuth return state (re-open a specific creator's discussion)
            try {
                const savedKolId = localStorage.getItem('tp_oauth_return_kol_id') || sessionStorage.getItem('tp_oauth_return_kol_id');
                const savedKolName = localStorage.getItem('tp_oauth_return_kol_name') || sessionStorage.getItem('tp_oauth_return_kol_name') || 'Creator';

                if (savedKolId) {
                    setActiveDiscussion({ kolId: savedKolId, kolName: savedKolName });
                    localStorage.removeItem('tp_oauth_return_url');
                    localStorage.removeItem('tp_oauth_return_tab');
                    localStorage.removeItem('tp_oauth_return_kol_id');
                    localStorage.removeItem('tp_oauth_return_kol_name');
                    sessionStorage.removeItem('tp_oauth_return_url');
                    sessionStorage.removeItem('tp_oauth_return_tab');
                    sessionStorage.removeItem('tp_oauth_return_kol_id');
                    sessionStorage.removeItem('tp_oauth_return_kol_name');
                } else {
                    const params = new URLSearchParams(window.location.search);
                    const qKolId = params.get('kolId');
                    if (qKolId && (data || []).some((c: any) => c.kol_id === qKolId)) {
                        const match = (data || []).find((c: any) => c.kol_id === qKolId) as any;
                        setActiveDiscussion({ kolId: qKolId, kolName: match?.kols?.name || 'Creator' });
                    }
                }
            } catch (e) {}

        } catch (e) {
            console.error('Error fetching creators:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        fetchThreadActivities();

        const channel = supabaseClient.channel('creator_discussion_messages_all')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'creator_discussion_messages' },
                () => {
                    fetchThreadActivities();
                }
            )
            .subscribe();

        return () => {
            supabaseClient.removeChannel(channel);
        };
    }, [fetchThreadActivities]);

    // Close popovers on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (cellPopoverRef.current && !cellPopoverRef.current.contains(e.target as Node)) {
                setActiveCellPopover(null);
            }
            if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
                setActiveActionMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Sort creators
    const handleCreatorSort = (field: 'name' | 'status' | 'est_rate' | 'log') => {
        if (creatorSortField === field) {
            setCreatorSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setCreatorSortField(field);
            setCreatorSortDirection('asc');
        }
    };

    const sortedCreators = useMemo(() => {
        const list = creators || [];
        if (!creatorSortField) return list;

        return [...list].sort((a, b) => {
            let valA: any;
            let valB: any;

            if (creatorSortField === 'name') {
                valA = (a.kols?.name || '').toLowerCase();
                valB = (b.kols?.name || '').toLowerCase();
            } else if (creatorSortField === 'status') {
                valA = (a.status || 'Active').toLowerCase();
                valB = (b.status || 'Active').toLowerCase();
            } else if (creatorSortField === 'log') {
                const actA = threadActivities[a.kol_id];
                const actB = threadActivities[b.kol_id];
                valA = actA?.lastMessageAt ? new Date(actA.lastMessageAt).getTime() : 0;
                valB = actB?.lastMessageAt ? new Date(actB.lastMessageAt).getTime() : 0;
            } else {
                valA = parseFloat(String(a.est_rate || '0')) || 0;
                valB = parseFloat(String(b.est_rate || '0')) || 0;
            }

            if (valA < valB) return creatorSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return creatorSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }, [creators, creatorSortField, creatorSortDirection, threadActivities]);

    // Add Creator via YouTube Channel URL / Handle
    const handleAddCreatorByYouTube = async () => {
        if (!ytChannelInput.trim()) return;
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

            // Add creator to the dashboard (re-adding a previously-removed creator
            // reuses their existing row/thread instead of creating a duplicate)
            await supabaseClient.from('creator_deals').upsert({
                kol_id: newKol.id,
                deliverables: ''
            }, { onConflict: 'kol_id' });

            setYtChannelInput('');
            setShowAddCreatorModal(false);
            fetchData();
        } catch (err) {
            console.error('Error adding creator:', err);
            alert('Failed to add creator.');
        } finally {
            setFetchingYt(false);
        }
    };

    // Open Creator Cell Popover
    const openCellPopover = (
        e: React.MouseEvent,
        kolId: string,
        type: 'rate' | 'deliverables' | 'terms' | 'contract',
        currentDeal?: CreatorDeal
    ) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

        if (type === 'rate') setCellRateVal(String(currentDeal?.est_rate || ''));
        if (type === 'deliverables') {
            const text = currentDeal?.deliverables || '';
            setCellDeliverablesVal(text);
            const m90s = text.match(/(\d+)\s*x?\s*90s/i);
            setQty90s(m90s ? parseInt(m90s[1], 10) : 0);
            const mTiktok = text.match(/(\d+)\s*x?\s*tiktok/i);
            setQtyTiktok(mTiktok ? parseInt(mTiktok[1], 10) : 0);
            const mPostX = text.match(/(\d+)\s*x?\s*(post on x|x post)/i);
            setQtyPostX(mPostX ? parseInt(mPostX[1], 10) : 0);
        }
        if (type === 'terms') setCellTermsVal(currentDeal?.terms || '');
        if (type === 'contract') setCellContractVal(currentDeal?.contract_link || '');

        setActiveCellPopover({ kolId, type, anchorRect: rect });
    };

    const updateCreatorStatus = async (kolId: string, newStatus: string, triggerSystemMsg = true) => {
        setCreators(prev => prev.map(c => c.kol_id === kolId ? { ...c, status: newStatus } : c));

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            const actorName = user?.user_metadata?.full_name || user?.email || 'Team Member';

            const { error } = await supabaseClient.rpc('update_creator_status', {
                p_kol_id: kolId,
                p_new_status: newStatus,
                p_actor: actorName,
                p_source: triggerSystemMsg ? 'Action Column' : 'Reset Action (No Msg)'
            });
            if (error) throw error;

            // When creator status is switched to Approved -> sync/create deal in Influencer Progress (collaborations table)
            if (newStatus.trim().toLowerCase() === 'approved') {
                try {
                    const targetDeal = creators.find(c => c.kol_id === kolId);

                    const formattedPkg = targetDeal?.est_rate !== undefined && targetDeal?.est_rate !== null && targetDeal?.est_rate !== ''
                        ? (typeof targetDeal.est_rate === 'number' ? `$${targetDeal.est_rate.toLocaleString()}` : String(targetDeal.est_rate))
                        : null;
                    const contractLink = targetDeal?.contract_link || null;
                    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

                    const { data: existingCollab } = await supabaseClient
                        .from('collaborations')
                        .select('id')
                        .eq('kol_id', kolId)
                        .maybeSingle();

                    if (existingCollab) {
                        await supabaseClient
                            .from('collaborations')
                            .update({
                                total_package: formattedPkg,
                                agreement_link: contractLink,
                                progress_status: 'Not Started',
                                custom_status: 'Not Started',
                                is_custom_status: true,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', existingCollab.id);
                    } else {
                        await supabaseClient
                            .from('collaborations')
                            .insert({
                                kol_id: kolId,
                                start_month: todayStr,
                                total_package: formattedPkg,
                                agreement_link: contractLink,
                                progress_status: 'Not Started',
                                custom_status: 'Not Started',
                                is_custom_status: true,
                                payment_status: '0%',
                                content_count: 1,
                                actual_spent: 0
                            });
                    }
                } catch (syncErr) {
                    console.error('Failed to sync approved creator to collaborations table:', syncErr);
                }
            }
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

    // Update Creator deal fields in local state & Supabase
    const updateCreatorDealField = async (kolId: string, field: string, value: any) => {
        setCreators(prev => prev.map(c => c.kol_id === kolId ? { ...c, [field]: value } : c));
        setActiveCellPopover(null);

        try {
            await supabaseClient
                .from('creator_deals')
                .update({ [field]: value })
                .eq('kol_id', kolId);
        } catch (err) {
            console.error(`Failed to update creator_deals.${field}:`, err);
            fetchData();
        }
    };

    // Remove Creator from the dashboard. This only unlists the creator (deletes
    // their creator_deals row) -- discussion threads/messages are intentionally
    // left untouched so the conversation history is never lost, and the creator
    // can be re-added later via "+ Add Creator" without losing prior context.
    const handleRemoveCreator = async (kolId: string) => {
        setCreators(prev => prev.filter(c => c.kol_id !== kolId));

        if (activeDiscussion?.kolId === kolId) {
            setActiveDiscussion(null);
        }

        try {
            await supabaseClient
                .from('creator_deals')
                .delete()
                .eq('kol_id', kolId);
        } catch (err) {
            console.error('Failed to remove creator:', err);
            fetchData();
        }
    };

    // Image screenshot upload / paste handler for Audience Insights
    const handleAddScreenshotToCreator = (kolId: string, fileOrUrl: File | string) => {
        const targetDeal = creators.find(c => c.kol_id === kolId);
        let currentScreenshots: string[] = [];
        if (targetDeal?.audience_screenshots) {
            if (Array.isArray(targetDeal.audience_screenshots)) {
                currentScreenshots = [...targetDeal.audience_screenshots];
            } else {
                try {
                    const parsed = JSON.parse(targetDeal.audience_screenshots as string);
                    currentScreenshots = Array.isArray(parsed) ? parsed : [targetDeal.audience_screenshots as string];
                } catch {
                    currentScreenshots = [targetDeal.audience_screenshots as string];
                }
            }
        }

        if (typeof fileOrUrl === 'string') {
            const updated = [...currentScreenshots, fileOrUrl];
            updateCreatorDealField(kolId, 'audience_screenshots', updated);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target?.result as string;
                if (base64) {
                    const updated = [...currentScreenshots, base64];
                    updateCreatorDealField(kolId, 'audience_screenshots', updated);
                }
            };
            reader.readAsDataURL(fileOrUrl);
        }
    };

    const handleRemoveScreenshot = (kolId: string, imgIdx: number) => {
        const targetDeal = creators.find(c => c.kol_id === kolId);
        let currentScreenshots: string[] = [];
        if (targetDeal?.audience_screenshots) {
            if (Array.isArray(targetDeal.audience_screenshots)) {
                currentScreenshots = [...targetDeal.audience_screenshots];
            } else {
                try {
                    const parsed = JSON.parse(targetDeal.audience_screenshots as string);
                    currentScreenshots = Array.isArray(parsed) ? parsed : [targetDeal.audience_screenshots as string];
                } catch {
                    currentScreenshots = [targetDeal.audience_screenshots as string];
                }
            }
        }
        const updated = currentScreenshots.filter((_, i) => i !== imgIdx);
        updateCreatorDealField(kolId, 'audience_screenshots', updated);
    };

    return (
        <div className="workspace-page influencer-proposal font-sans">
            <div className="space-y-6 animate-in fade-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
                            Creators
                        </h2>

                        <button
                            onClick={handleCopyShareableLink}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-[#bfdbfe]/60 bg-white text-slate-700 hover:bg-emerald-50/60 hover:border-[var(--accent-color)]/50 transition-all shadow-2xs group ml-2"
                            title="Copy shareable URL link for internal team members"
                        >
                            {copiedLink ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span className="text-emerald-700 font-bold">Link Copied!</span>
                                </>
                            ) : (
                                <>
                                    <LinkIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-[var(--accent-color)] transition-colors shrink-0" />
                                    <span>Share this page</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* CREATORS TABLE */}
                <div className="overflow-x-auto border border-[#bfdbfe]/50 rounded-2xl shadow-xs bg-white">
                    <table className="w-full text-sm text-left text-slate-600 border-collapse">
                        <thead className="text-xs text-slate-500 font-normal uppercase bg-slate-50/80 border-b border-[#bfdbfe]/50 select-none">
                            <tr>
                                <th onClick={() => handleCreatorSort('name')} className="px-4 py-3.5 min-w-[200px] font-normal cursor-pointer hover:bg-slate-100/80 transition-colors">
                                    <div className="flex items-center gap-1">
                                        <span>KOL Channel</span>
                                        <ArrowUpDown className={`w-3 h-3 ${creatorSortField === 'name' ? 'text-slate-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                                <th onClick={() => handleCreatorSort('status')} className="px-4 py-3.5 min-w-[110px] font-normal cursor-pointer hover:bg-slate-100/80 transition-colors">
                                    <div className="flex items-center gap-1">
                                        <span>Status</span>
                                        <ArrowUpDown className={`w-3 h-3 ${creatorSortField === 'status' ? 'text-slate-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                                <th className="px-4 py-3.5 min-w-[220px] font-normal">Audience Insight Attachments</th>
                                <th onClick={() => handleCreatorSort('est_rate')} className="px-4 py-3.5 text-right min-w-[130px] font-normal cursor-pointer hover:bg-slate-100/80 transition-colors">
                                    <div className="flex items-center justify-end gap-1">
                                        <span>Est. Rate ($ USD)</span>
                                        <ArrowUpDown className={`w-3 h-3 ${creatorSortField === 'est_rate' ? 'text-slate-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                                <th className="px-4 py-3.5 min-w-[220px] font-normal">Deliverables</th>
                                <th className="px-4 py-3.5 min-w-[200px] font-normal">Terms & Conditions</th>
                                <th className="px-4 py-3.5 min-w-[140px] font-normal">Contract Link</th>
                                <th className="px-4 py-3.5 min-w-[150px] font-normal border-l border-[#bfdbfe]/50">Discussion</th>
                                <th onClick={() => handleCreatorSort('log')} className="px-4 py-3.5 min-w-[150px] font-normal cursor-pointer hover:bg-slate-100/80 transition-colors">
                                    <div className="flex items-center gap-1">
                                        <span>Log</span>
                                        <ArrowUpDown className={`w-3 h-3 ${creatorSortField === 'log' ? 'text-slate-600' : 'text-slate-400'}`} />
                                    </div>
                                </th>
                                <th className="px-4 py-3.5 text-center min-w-[70px] font-normal">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#bfdbfe]/30">
                            {loading ? (
                                <tr><td colSpan={10} className="text-center py-12 text-slate-400">Loading creators...</td></tr>
                            ) : sortedCreators.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12 text-slate-400">
                                        No creators added yet. Use the button below to add your first creator!
                                    </td>
                                </tr>
                            ) : (
                                sortedCreators.map((deal, idx) => {
                                    const kol = deal.kols;

                                    let screenshotsList: string[] = [];
                                    if (deal.audience_screenshots) {
                                        if (Array.isArray(deal.audience_screenshots)) {
                                            screenshotsList = deal.audience_screenshots;
                                        } else {
                                            try {
                                                const parsed = JSON.parse(deal.audience_screenshots as string);
                                                screenshotsList = Array.isArray(parsed) ? parsed : [deal.audience_screenshots as string];
                                            } catch {
                                                screenshotsList = [deal.audience_screenshots as string];
                                            }
                                        }
                                    }

                                    const activity = threadActivities[deal.kol_id];
                                    const hasUnread = Boolean(activity && activity.unreadCount > 0);

                                    return (
                                        <tr key={deal.kol_id || idx} className={`transition-colors align-middle ${hasUnread ? 'bg-emerald-50/40 hover:bg-emerald-50/70 border-l-2 border-emerald-500' : 'hover:bg-slate-50/40'}`}>

                                            {/* 1. KOL Channel Cell */}
                                            <td className="px-4 py-3 align-middle">
                                                <KOLCell kol={kol} />
                                            </td>
                                            <td className="px-4 py-3 align-middle" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center min-h-[36px]">
                                                    <button
                                                        onClick={e => {
                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                            setActiveActionMenu({ kolId: deal.kol_id, anchorRect: rect });
                                                        }}
                                                        className={`px-3 py-1 rounded-full text-xs border whitespace-nowrap shrink-0 inline-flex items-center gap-1 shadow-2xs hover:scale-105 transition-transform ${getCreatorStatusStyle(deal.status)}`}
                                                        title="Click to change creator status"
                                                    >
                                                        <span className="whitespace-nowrap">{deal.status || 'Active'}</span>
                                                    </button>
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
                                                                        onClick={() => handleRemoveScreenshot(deal.kol_id, i)}
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
                                                                if (file) handleAddScreenshotToCreator(deal.kol_id, file);
                                                            }}
                                                        />
                                                    </label>
                                                </div>
                                            </td>

                                            {/* 4. Est. Rate ($ USD) */}
                                            <td className="px-4 py-3 text-right align-middle">
                                                <div className="flex items-center justify-end min-h-[36px]">
                                                    <button
                                                        onClick={e => openCellPopover(e, deal.kol_id, 'rate', deal)}
                                                        className="hover:bg-slate-100 px-2.5 py-1 rounded-lg text-slate-800 font-semibold text-xs transition-colors border border-transparent hover:border-slate-200 inline-flex items-center"
                                                        title="Click to edit estimated rate"
                                                    >
                                                        {deal.est_rate !== undefined && deal.est_rate !== null && deal.est_rate !== 0
                                                            ? formatCurrencyUSD(deal.est_rate)
                                                            : <span className="text-slate-400 font-medium text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" /><span>Add</span></span>}
                                                    </button>
                                                </div>
                                            </td>

                                            {/* 5. Deliverables */}
                                            <td className="px-4 py-3 align-middle">
                                                <div
                                                    onClick={e => openCellPopover(e, deal.kol_id, 'deliverables', deal)}
                                                    className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[36px] flex items-center"
                                                    title="Click to edit deliverables"
                                                >
                                                    {deal.deliverables && deal.deliverables.trim() ? (
                                                        <div className="text-xs text-slate-800 whitespace-pre-line font-medium leading-relaxed">
                                                            {deal.deliverables}
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
                                                    onClick={e => openCellPopover(e, deal.kol_id, 'terms', deal)}
                                                    className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[36px] flex items-center"
                                                    title="Click to edit terms"
                                                >
                                                    {deal.terms && deal.terms.trim() ? (
                                                        renderRichText(deal.terms)
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
                                                    onClick={e => openCellPopover(e, deal.kol_id, 'contract', deal)}
                                                    className="cursor-pointer hover:bg-slate-100/80 p-2 rounded-xl border border-transparent hover:border-slate-200 transition-all min-h-[36px] flex items-center"
                                                    title="Click to manage draft contract link"
                                                >
                                                    {deal.contract_link && deal.contract_link.trim() ? (
                                                        <a
                                                            href={deal.contract_link}
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
                                            <td className="px-4 py-3 align-middle border-l border-slate-100">
                                                <button
                                                    onClick={() => setActiveDiscussion({
                                                        kolId: deal.kol_id,
                                                        kolName: kol?.name || 'Creator'
                                                    })}
                                                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    <span>See discussion</span>
                                                </button>
                                            </td>

                                            {/* 9. Log Column */}
                                            <td className="px-4 py-3 align-middle">
                                                {activity?.lastMessageAt ? (
                                                    <div className="text-[11px] leading-snug">
                                                        <div className="text-slate-500 whitespace-nowrap truncate max-w-[150px]">
                                                            Last message from <span className="font-semibold text-slate-700">{activity.lastMessageBy || 'Unknown'}</span>
                                                        </div>
                                                        <div className="text-slate-400 whitespace-nowrap">
                                                            {(() => {
                                                                const dt = new Date(activity.lastMessageAt);
                                                                const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                                                                const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                                return `${date} · ${time}`;
                                                            })()}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-slate-400 italic">No activity yet</span>
                                                )}
                                            </td>

                                            {/* 10. Actions Column */}
                                            <td className="px-2 py-3 text-center align-middle">
                                                <div className="flex items-center justify-center min-h-[36px]">
                                                    <button
                                                        onClick={e => {
                                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                            setActiveActionMenu({ kolId: deal.kol_id, anchorRect: rect });
                                                        }}
                                                        className={`p-1.5 rounded-lg transition-colors ${activeActionMenu?.kolId === deal.kol_id ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                                                        title="More actions"
                                                    >
                                                        <MoreVertical className="w-4 h-4" />
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

                {/* PRIMARY ADD CREATOR BUTTON */}
                <div className="flex justify-center pt-2">
                    <button
                        onClick={() => setShowAddCreatorModal(true)}
                        className="bg-[var(--accent-color)] text-white px-6 py-3 rounded-2xl font-medium hover:bg-emerald-600 transition-colors shadow-sm text-xs flex items-center justify-center gap-2"
                    >
                        <span>+ Add Creator via YouTube URL</span>
                    </button>
                </div>
            </div>

            {/* STICKY CREATOR CELL EDITING POPOVER (Rate / Deliverables / Terms / Contract) */}
            {activeCellPopover && activeCellPopover.anchorRect && createPortal(
                <div
                    ref={cellPopoverRef}
                    onClick={e => e.stopPropagation()}
                    style={calcPopoverPosition(activeCellPopover.anchorRect, 320, 360)}
                    className="app-popover bg-white rounded-2xl border border-[#bfdbfe]/80 shadow-lg p-4 w-80 font-sans"
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
                                            updateCreatorDealField(activeCellPopover.kolId, 'est_rate', parseFloat(cellRateVal) || 0);
                                        }
                                    }}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'est_rate', parseFloat(cellRateVal) || 0)}
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
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'deliverables', cellDeliverablesVal)}
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
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'terms', cellTermsVal)}
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
                                        updateCreatorDealField(activeCellPopover.kolId, 'contract_link', cellContractVal.trim());
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                                <button
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'contract_link', cellContractVal.trim())}
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

            {/* CREATOR ROW ACTION DROPDOWN MENU (Approve / Reject / Reset / Remove) */}
            {activeActionMenu && (() => {
                const menuDeal = creators.find(c => c.kol_id === activeActionMenu.kolId);
                if (!menuDeal) return null;

                const items: ActionMenuItem[] = [
                    {
                        key: 'approve',
                        label: 'Approve',
                        icon: <Check className="w-4 h-4 text-emerald-600" />,
                        activeWhen: menuDeal.status === 'Approved',
                        onClick: () => updateCreatorStatus(activeActionMenu.kolId, 'Approved', true)
                    },
                    {
                        key: 'reject',
                        label: 'Reject',
                        icon: <X className="w-4 h-4 text-rose-600" />,
                        activeWhen: menuDeal.status === 'Rejected',
                        onClick: () => updateCreatorStatus(activeActionMenu.kolId, 'Rejected', true)
                    },
                    {
                        key: 'reset',
                        label: 'Reset to Active',
                        icon: <RotateCcw className="w-4 h-4 text-blue-600" />,
                        onClick: () => updateCreatorStatus(activeActionMenu.kolId, 'Active', false)
                    },
                    {
                        key: 'remove',
                        label: 'Remove creator',
                        icon: <Trash2 className="w-4 h-4 text-rose-600" />,
                        destructive: true,
                        separatorBefore: true,
                        onClick: () => handleRemoveCreator(activeActionMenu.kolId)
                    }
                ];

                return (
                    <ActionMenu
                        anchorRect={activeActionMenu.anchorRect}
                        items={items}
                        onRequestClose={() => setActiveActionMenu(null)}
                        menuRef={actionMenuRef}
                    />
                );
            })()}

            {/* PORTAL MODAL: ADD CREATOR VIA YOUTUBE URL MODAL */}
            {showAddCreatorModal && createPortal(
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[99999] flex items-center justify-center p-4 overflow-y-auto font-sans">
                    <div className="app-dialog bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
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

            {/* PORTAL MODAL: AUDIENCE INSIGHT IMAGE LIGHTBOX */}
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
                kolId={activeDiscussion?.kolId || null}
                kolName={activeDiscussion?.kolName || ''}
                onStatusChange={(kId, newStatus) => {
                    setCreators(prev => prev.map(c => c.kol_id === kId ? { ...c, status: newStatus } : c));
                }}
            />

        </div>
    );
};

export default InfluencerProposal;
