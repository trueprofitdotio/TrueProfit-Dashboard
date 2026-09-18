import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import KOLCell, { KolData } from './KOLCell';
import DiscussionSidebar from './DiscussionSidebar';
import ActionMenu, { ActionMenuItem } from './ActionMenu';
import { Lightbox, LightboxItem } from './DiscussionAttachments';
import {
    DiscussionAttachment, parseAttachments, isImageAttachment, getSignedUrls
} from '../services/discussionAttachments';
import { fetchYouTubeChannelDetails } from '../services/youtubeService';
import {
    Plus, Check, Trash2, X, ArrowUpDown, Filter,
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

// A creator with no stored status is Active. Every status comparison in this
// module goes through here so the filter, the sort, and the chip agree.
const normalizeCreatorStatus = (status?: string | null): string => {
    const s = (status || '').trim();
    return s.length > 0 ? s : 'Active';
};

const isRejectedStatus = (status?: string | null): boolean => {
    const s = normalizeCreatorStatus(status).toLowerCase();
    return s === 'rejected' || s === 'not approved';
};

// Sort order for the filter menu; anything unrecognised falls to the end.
const STATUS_ORDER = ['active', 'approved', 're-negotiate', 'renegotiate', 'need to check', 'rejected', 'not approved'];
const statusRank = (status: string) => {
    const i = STATUS_ORDER.indexOf(status.toLowerCase());
    return i === -1 ? STATUS_ORDER.length : i;
};

const getCreatorStatusStyle = (status?: string | null) => {
    const s = normalizeCreatorStatus(status).toLowerCase();
    if (s === 'approved') return 'tp-chip-positive';
    if (s === 'rejected' || s === 'not approved') return 'tp-chip-danger';
    if (s === 're-negotiate' || s === 'renegotiate' || s === 'need to check') return 'tp-chip-warning';
    if (s === 'active') return 'tp-chip-accent';
    return 'tp-chip-info';
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
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--tp-accent)] underline font-semibold">$1</a>');

    return (
        <div
            className="text-xs text-[var(--tp-ink-2)] font-normal leading-relaxed whitespace-pre-line"
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
    const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);

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

    // Screenshots posted in a creator's discussion, surfaced in the Audience
    // insight column so the team does not have to open the thread to see what
    // was shared. Read-only here: the discussion owns them.
    const [discussionImages, setDiscussionImages] = useState<Record<string, DiscussionAttachment[]>>({});
    const [discussionImageUrls, setDiscussionImageUrls] = useState<Map<string, string>>(new Map());

    const fetchThreadActivities = useCallback(async () => {
        try {
            const { data: threads, error: tErr } = await supabaseClient
                .from('creator_discussion_threads')
                .select('id, kol_id');

            if (tErr || !threads || threads.length === 0) return;

            const threadIds = threads.map((t: any) => t.id);
            const { data: msgs, error: mErr } = await supabaseClient
                .from('creator_discussion_messages')
                .select('id, thread_id, actor, created_at, attachments')
                .in('thread_id', threadIds)
                .order('created_at', { ascending: true });

            if (mErr) return;

            // Collect every image shared per creator, de-duplicated by path.
            const imagesByKol: Record<string, DiscussionAttachment[]> = {};
            threads.forEach((t: any) => {
                const seen = new Set<string>();
                const images: DiscussionAttachment[] = [];
                (msgs || [])
                    .filter((m: any) => m.thread_id === t.id)
                    .forEach((m: any) => {
                        parseAttachments(m.attachments)
                            .filter(isImageAttachment)
                            .forEach(att => {
                                if (seen.has(att.path)) return;
                                seen.add(att.path);
                                images.push(att);
                            });
                    });
                if (images.length > 0) imagesByKol[t.kol_id] = images;
            });
            setDiscussionImages(imagesByKol);

            const allPaths = Object.values(imagesByKol).flat().map(a => a.path);
            if (allPaths.length > 0) {
                getSignedUrls(allPaths).then(setDiscussionImageUrls).catch(() => {});
            }

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

    // `null` means "the default view": everything except rejected creators.
    // Touching the filter materialises an explicit set of statuses.
    const [statusFilter, setStatusFilter] = useState<Set<string> | null>(null);
    // The menu is portaled and positioned from this rect: its trigger lives in a
    // table header inside a horizontally scrolling container, which would
    // otherwise clip an absolutely positioned dropdown.
    const [statusFilterAnchor, setStatusFilterAnchor] = useState<DOMRect | null>(null);
    const statusFilterOpen = statusFilterAnchor !== null;
    const statusFilterBtnRef = useRef<HTMLButtonElement>(null);
    const statusFilterMenuRef = useRef<HTMLDivElement>(null);

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
                valA = normalizeCreatorStatus(a.status).toLowerCase();
                valB = normalizeCreatorStatus(b.status).toLowerCase();
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

    // --- Status filter ----------------------------------------------------
    // Every status actually present in the data, plus the counts the menu shows,
    // so the filter never offers a status that would return nothing.
    const statusOptions = useMemo(() => {
        const counts = new Map<string, number>();
        (creators || []).forEach(c => {
            const s = normalizeCreatorStatus(c.status);
            counts.set(s, (counts.get(s) || 0) + 1);
        });
        return [...counts.entries()]
            .map(([status, count]) => ({ status, count, rejected: isRejectedStatus(status) }))
            .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.status.localeCompare(b.status));
    }, [creators]);

    const isStatusSelected = useCallback(
        (status: string) => (statusFilter ? statusFilter.has(status) : !isRejectedStatus(status)),
        [statusFilter]
    );

    const toggleStatus = (status: string) => {
        setStatusFilter(prev => {
            // Materialise the default rule before applying the first toggle.
            const base = prev ?? new Set(statusOptions.filter(o => !o.rejected).map(o => o.status));
            const next = new Set(base);
            if (next.has(status)) next.delete(status); else next.add(status);
            return next;
        });
    };

    const visibleCreators = useMemo(
        () => sortedCreators.filter(c => isStatusSelected(normalizeCreatorStatus(c.status))),
        [sortedCreators, isStatusSelected]
    );

    const hiddenCount = sortedCreators.length - visibleCreators.length;
    const isDefaultFilter = statusFilter === null;
    const activeStatusCount = statusOptions.filter(o => isStatusSelected(o.status)).length;

    const statusFilterLabel = isDefaultFilter
        ? 'Active & approved'
        : activeStatusCount === statusOptions.length
            ? 'All statuses'
            : activeStatusCount === 1
                ? statusOptions.find(o => isStatusSelected(o.status))?.status || '1 status'
                : `${activeStatusCount} statuses`;

    useEffect(() => {
        if (!statusFilterOpen) return;
        const close = () => setStatusFilterAnchor(null);
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (statusFilterBtnRef.current?.contains(t)) return;
            if (statusFilterMenuRef.current?.contains(t)) return;
            close();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        // The anchor rect goes stale the moment anything moves under it.
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [statusFilterOpen]);

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
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">

                {/* Header */}
                <div className="workspace-heading">
                    <div className="flex items-baseline gap-3">
                        <h2>Creators</h2>
                        <span className="text-[13px] font-medium tabular-nums text-[var(--tp-meta)]">
                            {loading ? 'Loading…' : `${visibleCreators.length} shown${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}`}
                        </span>
                    </div>

                    <button
                        onClick={handleCopyShareableLink}
                        className="tp-btn-quiet"
                        title="Copy shareable URL link for internal team members"
                    >
                        {copiedLink ? (
                            <>
                                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--tp-positive)]" />
                                <span className="text-[var(--tp-positive)]">Link copied</span>
                            </>
                        ) : (
                            <>
                                <LinkIcon className="h-3.5 w-3.5 shrink-0 text-[var(--tp-faint)]" />
                                <span>Share this page</span>
                            </>
                        )}
                    </button>
                </div>

                {/* CREATORS TABLE */}
                <div className="card tp-sheet-flush">
                    <div className="tp-table-scroll">
                    <table className="w-full text-left text-sm">
                        <thead className="select-none">
                            <tr>
                                <th onClick={() => handleCreatorSort('name')} className="min-w-[210px] cursor-pointer hover:text-[var(--tp-ink)]">
                                    <div className="flex items-center gap-1.5">
                                        <span>KOL channel</span>
                                        <ArrowUpDown className={`h-3 w-3 ${creatorSortField === 'name' ? 'text-[var(--tp-accent)]' : 'text-[var(--tp-faint)]'}`} />
                                    </div>
                                </th>

                                {/* Status carries both a sort and a filter. */}
                                <th className="min-w-[132px]">
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleCreatorSort('status')}
                                            className="flex items-center gap-1.5 hover:text-[var(--tp-ink)]"
                                        >
                                            <span>Status</span>
                                            <ArrowUpDown className={`h-3 w-3 ${creatorSortField === 'status' ? 'text-[var(--tp-accent)]' : 'text-[var(--tp-faint)]'}`} />
                                        </button>

                                        <button
                                            ref={statusFilterBtnRef}
                                            type="button"
                                            onClick={e => {
                                                // Read the rect now: currentTarget is cleared
                                                // before the functional updater runs.
                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setStatusFilterAnchor(prev => (prev ? null : rect));
                                            }}
                                            aria-expanded={statusFilterOpen}
                                            aria-label={`Filter by status — showing ${statusFilterLabel}`}
                                            title={`Showing ${statusFilterLabel}`}
                                            className={`flex h-6 w-6 items-center justify-center rounded-[5px] border transition-colors ${
                                                isDefaultFilter && !statusFilterOpen
                                                    ? 'border-transparent text-[var(--tp-faint)] hover:border-[var(--tp-rule-strong)] hover:bg-[var(--tp-surface)] hover:text-[var(--tp-ink)]'
                                                    : 'border-[var(--tp-accent-rule)] bg-[var(--tp-accent-soft)] text-[var(--tp-accent)]'
                                            }`}
                                        >
                                            <Filter className="h-3 w-3" strokeWidth={2.4} />
                                        </button>
                                    </div>
                                </th>

                                <th className="min-w-[250px]">Audience insight</th>
                                <th onClick={() => handleCreatorSort('est_rate')} className="min-w-[130px] cursor-pointer text-right hover:text-[var(--tp-ink)]">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <span>Est. rate (USD)</span>
                                        <ArrowUpDown className={`h-3 w-3 ${creatorSortField === 'est_rate' ? 'text-[var(--tp-accent)]' : 'text-[var(--tp-faint)]'}`} />
                                    </div>
                                </th>
                                <th className="min-w-[220px]">Deliverables</th>
                                <th className="min-w-[200px]">Terms &amp; conditions</th>
                                <th className="min-w-[140px]">Contract link</th>
                                <th className="min-w-[150px]">Discussion</th>
                                <th onClick={() => handleCreatorSort('log')} className="min-w-[150px] cursor-pointer hover:text-[var(--tp-ink)]">
                                    <div className="flex items-center gap-1.5">
                                        <span>Log</span>
                                        <ArrowUpDown className={`h-3 w-3 ${creatorSortField === 'log' ? 'text-[var(--tp-accent)]' : 'text-[var(--tp-faint)]'}`} />
                                    </div>
                                </th>
                                <th className="min-w-[70px] text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                [0, 1, 2].map(i => (
                                    <tr key={`skeleton-${i}`}>
                                        <td colSpan={10}>
                                            <div className="flex items-center gap-3">
                                                <span className="tp-skeleton h-9 w-9 rounded-full" />
                                                <span className="tp-skeleton h-3.5 w-40" />
                                                <span className="tp-skeleton ml-auto h-3.5 w-24" />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : sortedCreators.length === 0 ? (
                                <tr>
                                    <td colSpan={10}>
                                        <div className="tp-empty">
                                            <p className="tp-empty-title">No creators yet</p>
                                            <p className="tp-empty-body">Add a creator from a YouTube channel URL to start tracking rates, deliverables, and the deal discussion.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : visibleCreators.length === 0 ? (
                                <tr>
                                    <td colSpan={10}>
                                        <div className="tp-empty">
                                            <p className="tp-empty-title">No creators match this status filter</p>
                                            <p className="tp-empty-body">{hiddenCount} creator{hiddenCount === 1 ? ' is' : 's are'} hidden. Adjust the status filter in the column header to see them.</p>
                                            <button type="button" onClick={() => setStatusFilter(null)} className="tp-btn-quiet">Reset filter</button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                visibleCreators.map((deal, idx) => {
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

                                    // The column shows two sources as one set: screenshots
                                    // uploaded here (removable) and screenshots shared in
                                    // the discussion (read-only — the thread owns those).
                                    //
                                    // The discussion bucket is private and only signs for a
                                    // signed-in internal user, so on a shared link the thumbs
                                    // cannot resolve. Rather than drop them silently we count
                                    // them and point at the discussion.
                                    const kolDiscussionImages = discussionImages[deal.kol_id] || [];
                                    const threadImages = kolDiscussionImages
                                        .map(att => ({ att, url: discussionImageUrls.get(att.path) }))
                                        .filter((i): i is { att: DiscussionAttachment; url: string } => Boolean(i.url));
                                    const lockedImageCount = kolDiscussionImages.length - threadImages.length;

                                    const insightTiles: {
                                        url: string;
                                        name: string;
                                        source: 'upload' | 'discussion';
                                        uploadIndex?: number;
                                    }[] = [
                                        ...screenshotsList.map((url, i) => ({
                                            url, name: `Audience insight ${i + 1}`, source: 'upload' as const, uploadIndex: i
                                        })),
                                        ...threadImages.map(({ att, url }) => ({
                                            url, name: att.name, source: 'discussion' as const
                                        }))
                                    ];

                                    const activity = threadActivities[deal.kol_id];
                                    const hasUnread = Boolean(activity && activity.unreadCount > 0);

                                    return (
                                        <tr key={deal.kol_id || idx} className={hasUnread ? 'bg-[var(--tp-accent-soft)]/50' : ''}>

                                            {/* 1. KOL Channel Cell */}
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {hasUnread && (
                                                        <span
                                                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--tp-accent)]"
                                                            title="Unread messages in this discussion"
                                                        />
                                                    )}
                                                    <KOLCell kol={kol} />
                                                </div>
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={e => {
                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                        setActiveActionMenu({ kolId: deal.kol_id, anchorRect: rect });
                                                    }}
                                                    className={`tp-chip ${getCreatorStatusStyle(deal.status)}`}
                                                    title="Click to change creator status"
                                                >
                                                    <span className="tp-chip-dot" aria-hidden="true" />
                                                    <span>{normalizeCreatorStatus(deal.status)}</span>
                                                </button>
                                            </td>

                                            {/* 3. Audience Insight Attachment — capped at one row of
                                                 thumbs so a creator with many screenshots does not
                                                 stretch the row taller than its neighbours. */}
                                            <td>
                                                <div className="flex items-center gap-1.5">
                                                    {insightTiles.length > 0 && (
                                                        <div className="flex shrink-0 items-center gap-1.5">
                                                            {insightTiles.slice(0, 3).map((tile, i) => (
                                                                <div key={`${tile.source}-${tile.url}`} className="group/img relative shrink-0">
                                                                    <img
                                                                        src={tile.url}
                                                                        alt={tile.name}
                                                                        onClick={() => setLightbox({ items: insightTiles.map(t => ({ url: t.url, name: t.name })), index: i })}
                                                                        className={`h-8 w-8 cursor-zoom-in rounded-[5px] border object-cover transition-opacity hover:opacity-85 ${
                                                                            tile.source === 'discussion'
                                                                                ? 'border-[var(--tp-accent-rule)]'
                                                                                : 'border-[var(--tp-rule-panel)]'
                                                                        }`}
                                                                        title={tile.source === 'discussion' ? `${tile.name} — shared in the discussion` : tile.name}
                                                                    />
                                                                    {tile.source === 'discussion' ? (
                                                                        <span
                                                                            className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-[var(--tp-accent)] text-white"
                                                                            title="Shared in the discussion"
                                                                        >
                                                                            <MessageCircle className="h-2 w-2" strokeWidth={3} />
                                                                        </span>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleRemoveScreenshot(deal.kol_id, tile.uploadIndex!)}
                                                                            className="absolute -right-1 -top-1 rounded-full bg-[var(--tp-danger)] p-0.5 text-white opacity-0 transition-opacity group-hover/img:opacity-100"
                                                                            title="Delete screenshot"
                                                                        >
                                                                            <X className="h-2.5 w-2.5" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            {insightTiles.length > 3 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLightbox({ items: insightTiles.map(t => ({ url: t.url, name: t.name })), index: 3 })}
                                                                    className="flex h-8 shrink-0 items-center rounded-[5px] border border-[var(--tp-rule-panel)] bg-[var(--tp-surface-sunken)] px-2 text-[11.5px] font-semibold tabular-nums text-[var(--tp-muted)] transition-colors hover:border-[var(--tp-accent-rule)] hover:bg-[var(--tp-accent-soft)] hover:text-[var(--tp-accent)]"
                                                                    title={`${insightTiles.length - 3} more screenshot${insightTiles.length - 3 === 1 ? '' : 's'}`}
                                                                >
                                                                    +{insightTiles.length - 3}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}

                                                    {lockedImageCount > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveDiscussion({
                                                                kolId: deal.kol_id,
                                                                kolName: kol?.name || 'Creator'
                                                            })}
                                                            className="flex h-8 shrink-0 items-center gap-1 rounded-[5px] border border-[var(--tp-accent-rule)] bg-[var(--tp-accent-soft)] px-2 text-[12px] font-medium tabular-nums text-[var(--tp-accent-ink)] transition-colors hover:border-[var(--tp-accent)]"
                                                            title={`${lockedImageCount} screenshot${lockedImageCount === 1 ? '' : 's'} shared in the discussion — sign in there to view`}
                                                        >
                                                            <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                                                            <span>{lockedImageCount}</span>
                                                        </button>
                                                    )}

                                                    <label className="flex h-8 cursor-pointer items-center gap-1 rounded-[5px] border border-[var(--tp-rule-strong)] border-dashed px-2.5 text-[12px] font-medium text-[var(--tp-muted)] transition-colors hover:border-[var(--tp-accent)] hover:bg-[var(--tp-accent-soft)] hover:text-[var(--tp-accent)]">
                                                        <Upload className="h-3.5 w-3.5" />
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
                                            <td className="text-right">
                                                <button
                                                    onClick={e => openCellPopover(e, deal.kol_id, 'rate', deal)}
                                                    className="inline-flex items-center rounded-[5px] border border-transparent px-2 py-1 text-[13px] font-semibold tabular-nums text-[var(--tp-ink)] transition-colors hover:border-[var(--tp-rule-strong)] hover:bg-[var(--tp-surface-hover)]"
                                                    title="Click to edit estimated rate"
                                                >
                                                    {deal.est_rate !== undefined && deal.est_rate !== null && deal.est_rate !== 0
                                                        ? formatCurrencyUSD(deal.est_rate)
                                                        : <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--tp-meta)]"><Plus className="h-3.5 w-3.5" /><span>Add</span></span>}
                                                </button>
                                            </td>

                                            {/* 5. Deliverables */}
                                            <td>
                                                <div
                                                    onClick={e => openCellPopover(e, deal.kol_id, 'deliverables', deal)}
                                                    className="flex cursor-pointer items-center rounded-[6px] border border-transparent p-1.5 transition-colors hover:border-[var(--tp-rule-strong)] hover:bg-[var(--tp-surface-hover)]"
                                                    title={deal.deliverables || 'Click to edit deliverables'}
                                                >
                                                    {deal.deliverables && deal.deliverables.trim() ? (
                                                        <div className="tp-clamp-3 whitespace-pre-line text-[12.5px] font-medium leading-relaxed text-[var(--tp-ink-2)]">
                                                            {deal.deliverables}
                                                        </div>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--tp-meta)]">
                                                            <Plus className="h-3.5 w-3.5" />
                                                            <span>Add</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 6. Terms & Conditions */}
                                            <td>
                                                <div
                                                    onClick={e => openCellPopover(e, deal.kol_id, 'terms', deal)}
                                                    className="flex cursor-pointer items-center rounded-[6px] border border-transparent p-1.5 transition-colors hover:border-[var(--tp-rule-strong)] hover:bg-[var(--tp-surface-hover)]"
                                                    title={deal.terms || 'Click to edit terms'}
                                                >
                                                    {deal.terms && deal.terms.trim() ? (
                                                        <div className="tp-clamp-3">{renderRichText(deal.terms)}</div>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--tp-meta)]">
                                                            <Plus className="h-3.5 w-3.5" />
                                                            <span>Add</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 7. Contract Link */}
                                            <td>
                                                <div
                                                    onClick={e => openCellPopover(e, deal.kol_id, 'contract', deal)}
                                                    className="flex cursor-pointer items-center rounded-[6px] border border-transparent p-1.5 transition-colors hover:border-[var(--tp-rule-strong)] hover:bg-[var(--tp-surface-hover)]"
                                                    title="Click to manage draft contract link"
                                                >
                                                    {deal.contract_link && deal.contract_link.trim() ? (
                                                        <a
                                                            href={deal.contract_link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={e => e.stopPropagation()}
                                                            className="flex max-w-[150px] items-center gap-1.5 truncate text-[12.5px] font-semibold text-[var(--tp-accent)] hover:underline"
                                                        >
                                                            <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--tp-faint)]" />
                                                            <span>Draft contract</span>
                                                        </a>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--tp-meta)]">
                                                            <Plus className="h-3.5 w-3.5" />
                                                            <span>Add</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 8. Discussion Column */}
                                            <td>
                                                <button
                                                    onClick={() => setActiveDiscussion({
                                                        kolId: deal.kol_id,
                                                        kolName: kol?.name || 'Creator'
                                                    })}
                                                    className="tp-btn-quiet whitespace-nowrap"
                                                >
                                                    <MessageCircle className="h-3.5 w-3.5 text-[var(--tp-faint)]" />
                                                    <span>See discussion</span>
                                                    {hasUnread && (
                                                        <span className="ml-0.5 rounded-full bg-[var(--tp-accent)] px-1.5 text-[11px] font-semibold tabular-nums text-white">
                                                            {activity?.unreadCount}
                                                        </span>
                                                    )}
                                                </button>
                                            </td>

                                            {/* 9. Log Column */}
                                            <td>
                                                {activity?.lastMessageAt ? (
                                                    <div className="text-[11.5px] leading-snug">
                                                        <div className="max-w-[150px] truncate text-[var(--tp-muted)]">
                                                            <span className="font-semibold text-[var(--tp-ink-2)]">{activity.lastMessageBy || 'Unknown'}</span>
                                                        </div>
                                                        <div className="whitespace-nowrap tabular-nums text-[var(--tp-meta)]">
                                                            {(() => {
                                                                const dt = new Date(activity.lastMessageAt);
                                                                const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                                                                const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                                return `${date} · ${time}`;
                                                            })()}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11.5px] text-[var(--tp-meta)]">No activity yet</span>
                                                )}
                                            </td>

                                            {/* 10. Actions Column */}
                                            <td className="text-center">
                                                <button
                                                    onClick={e => {
                                                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                        setActiveActionMenu({ kolId: deal.kol_id, anchorRect: rect });
                                                    }}
                                                    className={`rounded-[5px] p-1.5 transition-colors ${activeActionMenu?.kolId === deal.kol_id ? 'bg-[var(--tp-surface-active)] text-[var(--tp-ink)]' : 'text-[var(--tp-faint)] hover:bg-[var(--tp-surface-hover)] hover:text-[var(--tp-ink)]'}`}
                                                    title="More actions"
                                                    aria-label="More actions"
                                                >
                                                    <MoreVertical className="h-4 w-4" />
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

                {/* PRIMARY ADD CREATOR BUTTON */}
                <div className="flex justify-center">
                    <button
                        onClick={() => setShowAddCreatorModal(true)}
                        className="primary-btn inline-flex items-center gap-2 rounded-[7px] bg-[var(--accent-color)] px-5 py-2.5 text-[13px] font-semibold text-white"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Add creator via YouTube URL</span>
                    </button>
                </div>
            </div>

            {/* STATUS COLUMN FILTER MENU — portaled because its trigger sits in a
                table header inside a horizontally scrolling sheet. */}
            {statusFilterAnchor && createPortal(
                <div
                    ref={statusFilterMenuRef}
                    style={calcPopoverPosition(statusFilterAnchor, 256, 220)}
                    className="tp-filter-menu w-64 p-1.5 text-left font-sans"
                >
                    <div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-[var(--tp-muted)]">Show statuses</span>
                        <button
                            type="button"
                            onClick={() => setStatusFilter(null)}
                            disabled={isDefaultFilter}
                            className="text-[11px] font-semibold text-[var(--tp-accent)] hover:underline disabled:cursor-default disabled:text-[var(--tp-faint)] disabled:no-underline"
                        >
                            Reset
                        </button>
                    </div>

                    {statusOptions.length === 0 ? (
                        <p className="px-2 py-2 text-[12px] text-[var(--tp-meta)]">No creators to filter yet.</p>
                    ) : statusOptions.map(option => (
                        <label
                            key={option.status}
                            className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-[var(--tp-surface-hover)]"
                        >
                            <input
                                type="checkbox"
                                checked={isStatusSelected(option.status)}
                                onChange={() => toggleStatus(option.status)}
                                className="h-3.5 w-3.5 shrink-0 accent-[var(--tp-accent)]"
                            />
                            <span className={`tp-chip ${getCreatorStatusStyle(option.status)}`}>
                                {option.status}
                            </span>
                            <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-[var(--tp-meta)]">
                                {option.count}
                            </span>
                        </label>
                    ))}

                    {isDefaultFilter && statusOptions.some(o => o.rejected) && (
                        <p className="mt-1 border-t border-[var(--tp-rule)] px-2 pb-1 pt-2 text-[11px] leading-snug text-[var(--tp-meta)]">
                            Rejected creators are hidden by default. Tick one to bring it back.
                        </p>
                    )}
                </div>,
                document.body
            )}

            {/* STICKY CREATOR CELL EDITING POPOVER (Rate / Deliverables / Terms / Contract) */}
            {activeCellPopover && activeCellPopover.anchorRect && createPortal(
                <div
                    ref={cellPopoverRef}
                    onClick={e => e.stopPropagation()}
                    style={calcPopoverPosition(activeCellPopover.anchorRect, 320, 360)}
                    className="app-popover bg-white rounded-2xl border border-[#dde3d9]/80 shadow-lg p-4 w-80 font-sans"
                >
                    {/* 1. Rate Popover */}
                    {activeCellPopover.type === 'rate' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-[var(--tp-rule)]">
                                <span className="font-semibold text-xs text-[var(--tp-ink)]">Estimated Rate ($ USD)</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-[var(--tp-meta)] hover:text-[var(--tp-muted)]"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-xs font-semibold text-[var(--tp-meta)]">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    autoFocus
                                    value={cellRateVal}
                                    onChange={e => setCellRateVal(e.target.value)}
                                    placeholder="5000"
                                    className="w-full pl-7 pr-3 py-2 border border-[var(--tp-rule-strong)] rounded-xl text-sm font-semibold text-[var(--tp-ink)] outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            updateCreatorDealField(activeCellPopover.kolId, 'est_rate', parseFloat(cellRateVal) || 0);
                                        }
                                    }}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--tp-rule)]">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-[var(--tp-muted)] hover:bg-[var(--tp-surface-hover)] rounded-lg">Cancel</button>
                                <button
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'est_rate', parseFloat(cellRateVal) || 0)}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl"
                                >
                                    Save Rate
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 2. Deliverables Popover */}
                    {activeCellPopover.type === 'deliverables' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-[var(--tp-rule)]">
                                <span className="font-semibold text-xs text-[var(--tp-ink)]">Deliverables</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-[var(--tp-meta)] hover:text-[var(--tp-muted)]"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Preset Options with Quantity Selectors */}
                            <div className="space-y-2 bg-[var(--tp-surface-sunken)] p-2.5 rounded-xl border border-[var(--tp-rule)]">
                                <span className="text-[11px] font-semibold text-[var(--tp-muted)] block mb-1">Set Option Quantities:</span>

                                {/* Option 1: 90s integration */}
                                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-[var(--tp-rule)] text-xs">
                                    <span className="font-medium text-[var(--tp-ink)]">90s integration</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => updatePresetQuantity('90s', -1)}
                                            className="w-6 h-6 rounded-md bg-[var(--tp-surface-hover)] hover:bg-[var(--tp-surface-active)] text-[var(--tp-ink-2)] font-semibold flex items-center justify-center text-sm transition-colors"
                                        >-</button>
                                        <span className="w-5 text-center font-semibold text-[var(--tp-ink)]">{qty90s}</span>
                                        <button
                                            type="button"
                                            onClick={() => updatePresetQuantity('90s', 1)}
                                            className="w-6 h-6 rounded-md bg-[var(--accent-color)]/10 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] font-semibold flex items-center justify-center text-sm transition-colors"
                                        >+</button>
                                    </div>
                                </div>

                                {/* Option 2: TikTok video */}
                                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-[var(--tp-rule)] text-xs">
                                    <span className="font-medium text-[var(--tp-ink)]">TikTok video</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => updatePresetQuantity('tiktok', -1)}
                                            className="w-6 h-6 rounded-md bg-[var(--tp-surface-hover)] hover:bg-[var(--tp-surface-active)] text-[var(--tp-ink-2)] font-semibold flex items-center justify-center text-sm transition-colors"
                                        >-</button>
                                        <span className="w-5 text-center font-semibold text-[var(--tp-ink)]">{qtyTiktok}</span>
                                        <button
                                            type="button"
                                            onClick={() => updatePresetQuantity('tiktok', 1)}
                                            className="w-6 h-6 rounded-md bg-[var(--accent-color)]/10 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] font-semibold flex items-center justify-center text-sm transition-colors"
                                        >+</button>
                                    </div>
                                </div>

                                {/* Option 3: Post on X */}
                                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-[var(--tp-rule)] text-xs">
                                    <span className="font-medium text-[var(--tp-ink)]">Post on X</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => updatePresetQuantity('postX', -1)}
                                            className="w-6 h-6 rounded-md bg-[var(--tp-surface-hover)] hover:bg-[var(--tp-surface-active)] text-[var(--tp-ink-2)] font-semibold flex items-center justify-center text-sm transition-colors"
                                        >-</button>
                                        <span className="w-5 text-center font-semibold text-[var(--tp-ink)]">{qtyPostX}</span>
                                        <button
                                            type="button"
                                            onClick={() => updatePresetQuantity('postX', 1)}
                                            className="w-6 h-6 rounded-md bg-[var(--accent-color)]/10 hover:bg-[var(--accent-color)]/20 text-[var(--accent-color)] font-semibold flex items-center justify-center text-sm transition-colors"
                                        >+</button>
                                    </div>
                                </div>
                            </div>

                            {/* Generated / Editable Textarea */}
                            <div>
                                <label className="text-[11px] font-semibold text-[var(--tp-muted)] block mb-1">Deliverables Text Summary:</label>
                                <textarea
                                    rows={3}
                                    value={cellDeliverablesVal}
                                    onChange={e => setCellDeliverablesVal(e.target.value)}
                                    placeholder="• 1x 90s integration&#10;• 2x TikTok video..."
                                    className="w-full p-2.5 border border-[var(--tp-rule-strong)] rounded-xl text-xs font-normal text-[var(--tp-ink)] outline-none focus:ring-2 focus:ring-[var(--accent-color)] leading-relaxed resize-none"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--tp-rule)]">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-[var(--tp-muted)] hover:bg-[var(--tp-surface-hover)] rounded-lg">Cancel</button>
                                <button
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'deliverables', cellDeliverablesVal)}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl"
                                >
                                    Save Deliverables
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 3. Terms Popover */}
                    {activeCellPopover.type === 'terms' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-[var(--tp-rule)]">
                                <span className="font-semibold text-xs text-[var(--tp-ink)]">Terms & Conditions</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-[var(--tp-meta)] hover:text-[var(--tp-muted)]"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Formatting Options Bar */}
                            <div className="flex items-center gap-1 bg-[var(--tp-surface-sunken)] p-1 rounded-xl border border-[var(--tp-rule)] text-xs font-semibold text-[var(--tp-muted)] select-none">
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' **bold**')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors font-semibold" title="Bold">B</button>
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' *italic*')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors italic" title="Italic">I</button>
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' <u>underline</u>')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors underline" title="Underline">U</button>
                                <button type="button" onClick={() => setCellTermsVal(prev => prev + ' [link label](https://)')} className="px-2 py-1 hover:bg-white rounded-lg transition-colors text-[var(--tp-info)]" title="Hyperlink">🔗 Link</button>
                            </div>

                            <textarea
                                rows={4}
                                autoFocus
                                value={cellTermsVal}
                                onChange={e => setCellTermsVal(e.target.value)}
                                placeholder="30-day usage rights, 60-day exclusivity, payment on pub date..."
                                className="w-full p-2.5 border border-[var(--tp-rule-strong)] rounded-xl text-xs font-normal text-[var(--tp-ink)] outline-none focus:ring-2 focus:ring-[var(--accent-color)] leading-relaxed resize-none whitespace-pre-line"
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--tp-rule)]">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-[var(--tp-muted)] hover:bg-[var(--tp-surface-hover)] rounded-lg">Cancel</button>
                                <button
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'terms', cellTermsVal)}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl"
                                >
                                    Save Terms
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 4. Contract Link Popover */}
                    {activeCellPopover.type === 'contract' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-[var(--tp-rule)]">
                                <span className="font-semibold text-xs text-[var(--tp-ink)]">Draft Contract Link</span>
                                <button onClick={() => setActiveCellPopover(null)} className="text-[var(--tp-meta)] hover:text-[var(--tp-muted)]"><X className="w-4 h-4" /></button>
                            </div>
                            <input
                                type="text"
                                autoFocus
                                value={cellContractVal}
                                onChange={e => setCellContractVal(e.target.value)}
                                placeholder="https://docs.google.com/..."
                                className="w-full p-2 border border-[var(--tp-rule-strong)] rounded-xl text-xs font-normal text-[var(--tp-ink)] outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        updateCreatorDealField(activeCellPopover.kolId, 'contract_link', cellContractVal.trim());
                                    }
                                }}
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--tp-rule)]">
                                <button onClick={() => setActiveCellPopover(null)} className="px-3 py-1.5 text-xs text-[var(--tp-muted)] hover:bg-[var(--tp-surface-hover)] rounded-lg">Cancel</button>
                                <button
                                    onClick={() => updateCreatorDealField(activeCellPopover.kolId, 'contract_link', cellContractVal.trim())}
                                    className="px-4 py-1.5 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl"
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
                        icon: <Check className="w-4 h-4 text-[var(--tp-accent)]" />,
                        activeWhen: menuDeal.status === 'Approved',
                        onClick: () => updateCreatorStatus(activeActionMenu.kolId, 'Approved', true)
                    },
                    {
                        key: 'reject',
                        label: 'Reject',
                        icon: <X className="w-4 h-4 text-[var(--tp-danger)]" />,
                        activeWhen: menuDeal.status === 'Rejected',
                        onClick: () => updateCreatorStatus(activeActionMenu.kolId, 'Rejected', true)
                    },
                    {
                        key: 'reset',
                        label: 'Reset to Active',
                        icon: <RotateCcw className="w-4 h-4 text-[var(--tp-info)]" />,
                        onClick: () => updateCreatorStatus(activeActionMenu.kolId, 'Active', false)
                    },
                    {
                        key: 'remove',
                        label: 'Remove creator',
                        icon: <Trash2 className="w-4 h-4 text-[var(--tp-danger)]" />,
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
                        <div className="p-5 border-b border-[var(--tp-rule)] flex justify-between items-center bg-[var(--tp-surface-sunken)]/80">
                            <h3 className="text-base font-semibold text-[var(--tp-ink)] flex items-center gap-2">
                                <Youtube className="w-5 h-5 text-[var(--tp-danger)] fill-red-500" />
                                <span>Add Creator via YouTube URL</span>
                            </h3>
                            <button onClick={() => setShowAddCreatorModal(false)} className="text-[var(--tp-meta)] hover:text-[var(--tp-muted)]"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-[var(--tp-ink-2)] mb-1">
                                    YouTube Channel URL / Handle
                                </label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={ytChannelInput}
                                    onChange={e => setYtChannelInput(e.target.value)}
                                    placeholder="https://www.youtube.com/@taysthetic"
                                    className="w-full p-2.5 border border-[var(--tp-rule-strong)] rounded-xl focus:ring-2 focus:ring-[var(--accent-color)] outline-none text-xs font-normal"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAddCreatorByYouTube(); }}
                                />
                                <p className="text-[11px] text-[var(--tp-meta)] mt-1">
                                    Uses YouTube Data API v3 to automatically fetch avatar, channel title, subscriber count, and country.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--tp-rule)]">
                                <button
                                    onClick={() => setShowAddCreatorModal(false)}
                                    className="px-4 py-2 text-xs font-medium text-[var(--tp-muted)] hover:bg-[var(--tp-surface-hover)] rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddCreatorByYouTube}
                                    disabled={fetchingYt || !ytChannelInput.trim()}
                                    className="px-5 py-2 text-xs font-medium text-white bg-[var(--accent-color)] hover:bg-emerald-600 rounded-xl disabled:opacity-50 flex items-center gap-1.5"
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

            {/* AUDIENCE INSIGHT LIGHTBOX — the shared one, so arrow keys walk the
                creator's whole set rather than stranding you on one image. */}
            {lightbox && (
                <Lightbox
                    items={lightbox.items}
                    index={Math.min(lightbox.index, lightbox.items.length - 1)}
                    onIndexChange={i => setLightbox(prev => (prev ? { ...prev, index: i } : prev))}
                    onClose={() => setLightbox(null)}
                />
            )}

            {/* DISCUSSION SIDEBAR DRAWER */}
            <DiscussionSidebar
                isOpen={activeDiscussion !== null}
                onClose={() => {
                    setActiveDiscussion(null);
                    // Realtime normally carries new screenshots into the Audience
                    // insight column; this covers a dropped subscription.
                    fetchThreadActivities();
                }}
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
