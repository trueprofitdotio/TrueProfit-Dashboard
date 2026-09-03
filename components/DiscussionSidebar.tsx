import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import { fetchYouTubeVideoDetails, fetchYouTubeChannelDetails, getYouTubeVideoId, YouTubeVideoInfo, YouTubeChannelInfo } from '../services/youtubeService';
import { sendDiscussionEmailNotification } from '../services/notificationService';
import { renderMarkdown, renderPlaintext, extractUrls, extractMentions } from '../services/messageMarkdown';
import {
    DiscussionAttachment, parseAttachments, uploadDiscussionAttachment,
    removeDiscussionAttachment, validateAttachment, displayNameFor, ACCEPTED_MIME_TYPES
} from '../services/discussionAttachments';
import { AttachmentGrid, PendingAttachmentStrip, PendingAttachment } from './DiscussionAttachments';
import type { DiscussionComposerHandle } from './DiscussionComposer';
// The editor pulls in ProseMirror (~400 kB). Loading it only when a discussion
// is actually opened keeps it out of the dashboard's initial bundle.
const DiscussionComposer = lazy(() => import('./DiscussionComposer'));
import {
    X, Loader2, Check, RefreshCw, AlertCircle, LogOut,
    Youtube, Play, CheckCheck, Users, ImagePlus, ChevronDown
} from 'lucide-react';

interface DiscussionSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    proposalId: string | null;
    proposalTitle?: string | null;
    kolId: string | null;
    kolName: string;
    onStatusChange?: (proposalId: string, kolId: string, newStatus: string) => void;
}

interface Message {
    id: string;
    thread_id: string;
    body: string;
    actor: string;
    type: 'user' | 'system' | 'advisor';
    created_at: string;
    attachments?: DiscussionAttachment[] | string | null;
    mentions?: Array<{ name: string; email: string }> | string | null;
    /** Absent on rows written before the markdown composer shipped. */
    body_format?: 'plaintext' | 'markdown' | null;
}

interface ReadReceipt {
    user_email: string;
    user_name: string;
    last_read_at: string;
}

interface TeamMember {
    name: string;
    email: string;
    avatar?: string;
}

const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
    { name: 'Quan Tran Hoang', email: 'partners@trueprofit.io' },
    { name: 'Hương Lê Ngọc Thùy', email: 'huong.le@firegroup.io' },
    { name: 'Ly', email: 'ly@firegroup.io' },
    { name: 'FireGroup Team', email: 'team@firegroup.io' }
];

const detectMessageIntent = (text: string): 'Approved' | 'Rejected' | 'Re-negotiate' | null => {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (
        lower.includes('oke') || lower.includes('proceed') || lower.includes('approve') ||
        lower.includes('chốt') || lower.includes('duyệt') || lower.includes('đồng ý') ||
        lower.includes('agree') || lower.includes('ok em') || lower.includes('ok chị') ||
        lower.includes('ok nhe') || lower.includes('ok nhé') || lower.includes('tốt rồi')
    ) return 'Approved';
    if (
        lower.includes('reject') || lower.includes('cancel') || lower.includes('từ chối') ||
        lower.includes('không duyệt') || lower.includes('hủy') || lower.includes('decline') ||
        lower.includes('too expensive') || lower.includes('bỏ qua') || lower.includes('không đồng ý')
    ) return 'Rejected';
    if (
        lower.includes('negotiate') || lower.includes('thương lượng') || lower.includes('đàm phán') ||
        lower.includes('bớt') || lower.includes('re-negotiate') || lower.includes('discount') ||
        lower.includes('giảm giá') || lower.includes('discuss') || lower.includes('xem lại giá')
    ) return 'Re-negotiate';
    return null;
};

// YouTube Video / Channel Preview Card Component
const YouTubeCardPreview: React.FC<{ url: string; isUser: boolean }> = ({ url, isUser }) => {
    const videoId = getYouTubeVideoId(url);
    const isChannel = !videoId && /(?:youtube\.com\/(?:@|channel\/|c\/|user\/)|youtu\.be\/)/i.test(url);
    const [videoInfo, setVideoInfo] = useState<YouTubeVideoInfo | null>(null);
    const [channelInfo, setChannelInfo] = useState<YouTubeChannelInfo | null>(null);

    useEffect(() => {
        let isMounted = true;
        if (videoId) {
            fetchYouTubeVideoDetails(url).then(info => {
                if (isMounted && info) setVideoInfo(info);
            });
        } else if (isChannel) {
            fetchYouTubeChannelDetails(url).then(info => {
                if (isMounted && info) setChannelInfo(info);
            });
        }
        return () => { isMounted = false; };
    }, [url, videoId, isChannel]);

    if (videoId) {
        const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return (
            <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`mt-2.5 flex flex-col sm:flex-row gap-2.5 p-2 rounded-xl border transition-all hover:scale-[1.01] block overflow-hidden ${
                    isUser 
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-white hover:bg-emerald-950/60' 
                        : 'bg-white border-[#d2e3dc] text-slate-800 hover:bg-slate-50 shadow-2xs'
                }`}
            >
                <div className="relative w-full sm:w-28 h-20 bg-slate-900 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                    <img src={thumbUrl} alt="Video thumbnail" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-xs">
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                        </div>
                    </div>
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-0.5">
                        <Youtube className="w-3 h-3 fill-current" />
                        <span>YouTube Video</span>
                    </div>
                    <div className={`text-xs font-semibold line-clamp-2 leading-tight ${isUser ? 'text-white' : 'text-slate-900'}`}>
                        {videoInfo?.title || 'Watch on YouTube'}
                    </div>
                    {videoInfo?.channelTitle && (
                        <div className={`text-[11px] mt-1 truncate ${isUser ? 'text-emerald-200' : 'text-slate-500'}`}>
                            {videoInfo.channelTitle}
                        </div>
                    )}
                </div>
            </a>
        );
    }

    if (isChannel) {
        return (
            <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className={`mt-2.5 flex items-center gap-3 p-2.5 rounded-xl border transition-all hover:scale-[1.01] block ${
                    isUser 
                        ? 'bg-emerald-950/40 border-emerald-500/30 text-white hover:bg-emerald-950/60' 
                        : 'bg-white border-[#d2e3dc] text-slate-800 hover:bg-slate-50 shadow-2xs'
                }`}
            >
                {channelInfo?.avatarUrl ? (
                    <img src={channelInfo.avatarUrl} alt="Channel avatar" className="w-10 h-10 rounded-full object-cover border border-white/20 shrink-0" />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 font-bold text-xs">
                        <Youtube className="w-5 h-5 fill-current" />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-0.5">
                        <Youtube className="w-3 h-3 fill-current" />
                        <span>YouTube Creator</span>
                    </div>
                    <div className={`text-xs font-semibold truncate ${isUser ? 'text-white' : 'text-slate-900'}`}>
                        {channelInfo?.title || 'YouTube Channel'}
                    </div>
                    {channelInfo?.subscriberCount && (
                        <div className={`text-[11px] font-medium ${isUser ? 'text-emerald-200' : 'text-slate-500'}`}>
                            {channelInfo.subscriberCount} subscribers
                        </div>
                    )}
                </div>
            </a>
        );
    }

    return null;
};

// Renders a message body: markdown subset for new messages, links-and-mentions
// only for legacy rows, plus YouTube cards for any URLs found.
const RichMessageBody: React.FC<{
    body: string;
    isUser: boolean;
    format?: 'plaintext' | 'markdown' | null;
    mentionNames?: string[];
}> = ({ body, isUser, format, mentionNames }) => {
    const urlMatches = useMemo(() => extractUrls(body), [body]);

    // Rows written before this feature have no body_format and contain raw *
    // and _ that were never intended as syntax, so they stay literal.
    const content = useMemo(
        () =>
            format === 'markdown'
                ? renderMarkdown(body, { isUser, mentionNames })
                : renderPlaintext(body, { isUser, mentionNames }),
        [body, isUser, format, mentionNames]
    );

    return (
        <div>
            {content}
            {urlMatches.map((url, idx) => (
                <YouTubeCardPreview key={idx} url={url} isUser={isUser} />
            ))}
        </div>
    );
};

const DiscussionSidebar: React.FC<DiscussionSidebarProps> = ({
    isOpen,
    onClose,
    proposalId,
    proposalTitle,
    kolId,
    kolName,
    onStatusChange
}) => {
    const [user, setUser] = useState<any | null>(null);
    const [authError, setAuthError] = useState<string | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [threadId, setThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
    
    const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [showAllSystemMessages, setShowAllSystemMessages] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<DiscussionComposerHandle>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Drag events fire per child element; a counter avoids the highlight
    // flickering off every time the pointer crosses an inner node.
    const dragDepthRef = useRef(0);

    const teamMembersList: TeamMember[] = useMemo(() => {
        const map = new Map<string, TeamMember>();
        DEFAULT_TEAM_MEMBERS.forEach(m => map.set(m.name.toLowerCase(), m));
        messages.forEach(m => {
            if (m.actor && !map.has(m.actor.toLowerCase())) {
                map.set(m.actor.toLowerCase(), {
                    name: m.actor,
                    email: `${m.actor.toLowerCase().replace(/\s+/g, '.')}@firegroup.io`
                });
            }
        });
        if (user) {
            const userName = user.user_metadata?.full_name || user.email || 'You';
            map.set(userName.toLowerCase(), { name: userName, email: user.email });
        }
        return Array.from(map.values());
    }, [messages, user]);

    // Passed to the renderer so multi-word names highlight as one mention
    // instead of running into the following words.
    const mentionNames = useMemo(
        () => teamMembersList.map(m => m.name),
        [teamMembersList]
    );

    useEffect(() => {
        if (!isOpen || authLoading || !user) return;
        const t = setTimeout(() => composerRef.current?.focus(), 220);
        return () => clearTimeout(t);
    }, [isOpen, kolId, user, authLoading]);

    useEffect(() => {
        const checkUserAuth = async () => {
            setAuthLoading(true);
            setAuthError(null);
            try {
                const { data: { user: currentUser } } = await supabaseClient.auth.getUser();
                if (currentUser) {
                    const email = currentUser.email || '';
                    if (email.endsWith('@firegroup.io')) {
                        setUser(currentUser);
                    } else {
                        await supabaseClient.auth.signOut();
                        setUser(null);
                        setAuthError(`Access Restricted: ${email} is not authorized. Only @firegroup.io email accounts can join discussions.`);
                    }
                } else {
                    setUser(null);
                }
            } catch (err) {
                console.error('Auth check error:', err);
            } finally {
                setAuthLoading(false);
            }
        };
        checkUserAuth();
        const { data: authListener } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                const email = session.user.email || '';
                if (email.endsWith('@firegroup.io')) {
                    setUser(session.user);
                    setAuthError(null);
                } else {
                    await supabaseClient.auth.signOut();
                    setUser(null);
                    setAuthError(`Access Restricted: ${email} is not authorized. Only @firegroup.io email accounts can join discussions.`);
                }
            } else {
                setUser(null);
            }
        });
        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    const isDevEnvironment = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1'
    );

    const handleGoogleLogin = async () => {
        setAuthError(null);
        try {
            const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
            const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
            let exactReturnUrl = currentUrl;
            if (proposalId && typeof window !== 'undefined') {
                try {
                    const urlObj = new URL(currentUrl || `${currentOrigin}/influencer/proposal/${proposalId}`);
                    urlObj.pathname = `/influencer/proposal/${proposalId}`;
                    if (kolId) urlObj.searchParams.set('kolId', kolId);
                    exactReturnUrl = urlObj.toString();
                } catch (e) {}
            }
            try {
                if (exactReturnUrl) {
                    localStorage.setItem('tp_oauth_return_url', exactReturnUrl);
                    sessionStorage.setItem('tp_oauth_return_url', exactReturnUrl);
                }
                localStorage.setItem('tp_oauth_return_tab', 'influencer');
                sessionStorage.setItem('tp_oauth_return_tab', 'influencer');
                if (proposalId) {
                    localStorage.setItem('tp_oauth_return_proposal_id', proposalId);
                    sessionStorage.setItem('tp_oauth_return_proposal_id', proposalId);
                }
                if (kolId) {
                    localStorage.setItem('tp_oauth_return_kol_id', kolId);
                    sessionStorage.setItem('tp_oauth_return_kol_id', kolId);
                }
                if (kolName) {
                    localStorage.setItem('tp_oauth_return_kol_name', kolName);
                    sessionStorage.setItem('tp_oauth_return_kol_name', kolName);
                }
            } catch (e) {}
            const redirectUrl = exactReturnUrl || (typeof window !== 'undefined' ? window.location.href : undefined);
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: {
                        hd: 'firegroup.io'
                    }
                }
            });
            if (error) throw error;
        } catch (err: any) {
            console.error('Login error:', err);
            if (err.message && (err.message.includes('Unsupported provider') || err.message.includes('not enabled'))) {
                setAuthError(`Google OAuth provider is not enabled in your Supabase Dashboard yet. Use the Dev Test Sign-In below for local testing (${window.location.host}).`);
            } else {
                setAuthError(err.message || 'Failed to initiate Google login.');
            }
        }
    };

    const handleDevLogin = () => {
        const devUser = {
            id: 'dev-firegroup-user-123',
            email: 'partners@trueprofit.io',
            user_metadata: { full_name: 'Quan Tran Hoang' }
        };
        setUser(devUser);
        setAuthError(null);
    };

    const handleSignOut = async () => {
        await supabaseClient.auth.signOut();
        setUser(null);
    };

    const recordReadReceipt = async (tId: string) => {
        if (!user || !tId) return;
        const currentEmail = user.email || 'user@firegroup.io';
        const currentName = user.user_metadata?.full_name || currentEmail.split('@')[0] || 'Team Member';
        const nowIso = new Date().toISOString();
        try {
            localStorage.setItem(`tp_thread_read_${tId}_${currentEmail}`, nowIso);
            await supabaseClient
                .from('proposal_discussion_reads')
                .upsert({
                    thread_id: tId,
                    user_email: currentEmail,
                    user_name: currentName,
                    last_read_at: nowIso
                }, { onConflict: 'thread_id,user_email' });
        } catch (e) {}
    };

    const fetchReadReceipts = async (tId: string) => {
        try {
            const { data } = await supabaseClient
                .from('proposal_discussion_reads')
                .select('*')
                .eq('thread_id', tId);
            if (data) {
                setReadReceipts(data as ReadReceipt[]);
            }
        } catch (e) {}
    };

    useEffect(() => {
        if (!isOpen || !proposalId || !kolId || !user) return;
        const initializeThread = async () => {
            setLoading(true);
            try {
                // 1. Try to find the exact thread for this proposal and creator
                let { data: thread, error: fetchError } = await supabaseClient
                    .from('proposal_discussion_threads')
                    .select('id')
                    .eq('proposal_id', proposalId)
                    .eq('kol_id', kolId)
                    .maybeSingle();

                if (fetchError) {
                    console.error('Fetch thread error:', fetchError);
                }

                // 2. If no thread exists for this (proposal, creator), check if this creator has a thread
                // migrated or created under a different proposal ID
                if (!thread) {
                    const { data: existingKolThread } = await supabaseClient
                        .from('proposal_discussion_threads')
                        .select('id')
                        .eq('kol_id', kolId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (existingKolThread) {
                        // Automatically re-point the thread to the active proposal so all prior messages follow the creator
                        await supabaseClient
                            .from('proposal_discussion_threads')
                            .update({ proposal_id: proposalId })
                            .eq('id', existingKolThread.id);
                        thread = existingKolThread;
                    } else {
                        // 3. Create a new thread only if the creator has no previous thread
                        const { data: newThread, error: insertError } = await supabaseClient
                            .from('proposal_discussion_threads')
                            .insert({ proposal_id: proposalId, kol_id: kolId })
                            .select('id')
                            .single();
                        if (insertError) throw insertError;
                        thread = newThread;
                    }
                }
                if (thread) {
                    setThreadId(thread.id);
                    await fetchMessages(thread.id);
                    await recordReadReceipt(thread.id);
                    await fetchReadReceipts(thread.id);
                }
            } catch (err) {
                console.error('Error initializing discussion thread:', err);
            } finally {
                setLoading(false);
            }
        };
        initializeThread();
    }, [isOpen, proposalId, kolId, user]);

    const fetchMessages = async (tId: string) => {
        try {
            const { data, error } = await supabaseClient
                .from('proposal_discussion_messages')
                .select('*')
                .eq('thread_id', tId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            setMessages(data as Message[]);
            scrollToBottom();
        } catch (err) {
            console.error('Error fetching messages:', err);
        }
    };

    useEffect(() => {
        if (!threadId) return;
        const msgChannel = supabaseClient.channel(`messages_for_${threadId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'proposal_discussion_messages', filter: `thread_id=eq.${threadId}` },
                (payload) => {
                    setMessages((prev) => {
                        const newMsg = payload.new as Message;
                        if (prev.find(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    scrollToBottom();
                    if (user) recordReadReceipt(threadId);
                }
            )
            .subscribe();
        const readChannel = supabaseClient.channel(`reads_for_${threadId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'proposal_discussion_reads', filter: `thread_id=eq.${threadId}` },
                () => {
                    fetchReadReceipts(threadId);
                }
            )
            .subscribe();
        return () => {
            supabaseClient.removeChannel(msgChannel);
            supabaseClient.removeChannel(readChannel);
        };
    }, [threadId, user]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    // ---- Attachments -----------------------------------------------------

    const stageFiles = async (files: File[]) => {
        if (files.length === 0) return;
        if (!threadId) {
            setAttachmentError('Discussion is still loading. Try again in a moment.');
            return;
        }
        setAttachmentError(null);

        const accepted: PendingAttachment[] = [];
        const rejected: string[] = [];

        for (const file of files) {
            const problem = validateAttachment(file);
            if (problem) {
                rejected.push(problem);
                continue;
            }
            // Rename here so the staging strip and the stored name match; a
            // pasted screenshot otherwise arrives as the useless "image.png".
            const named = new File([file], displayNameFor(file), { type: file.type });
            accepted.push({
                localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                file: named,
                previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
                status: 'uploading'
            });
        }

        if (rejected.length > 0) setAttachmentError(rejected.join(' '));
        if (accepted.length === 0) return;

        setPendingAttachments(prev => [...prev, ...accepted]);

        // Upload immediately rather than on send, so the wait happens while the
        // user is still typing the caption.
        await Promise.all(
            accepted.map(async item => {
                try {
                    const uploaded = await uploadDiscussionAttachment(item.file, threadId);
                    setPendingAttachments(prev =>
                        prev.map(p => (p.localId === item.localId ? { ...p, status: 'done', uploaded } : p))
                    );
                } catch (err: any) {
                    const message = err?.message || 'Upload failed.';
                    setPendingAttachments(prev =>
                        prev.map(p => (p.localId === item.localId ? { ...p, status: 'error', error: message } : p))
                    );
                    setAttachmentError(message);
                }
            })
        );
    };

    const handleRemovePending = (localId: string) => {
        setPendingAttachments(prev => {
            const item = prev.find(p => p.localId === localId);
            if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
            // Already uploaded, so drop the object too rather than leaving
            // orphaned files in the bucket.
            if (item?.uploaded) removeDiscussionAttachment(item.uploaded.path);
            return prev.filter(p => p.localId !== localId);
        });
        setAttachmentError(null);
    };

    const handleDragEnter = (e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDraggingFile(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDraggingFile(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingFile(false);
        stageFiles(e.dataTransfer ? Array.from(e.dataTransfer.files) : []);
    };

    const handleFilePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
        stageFiles(e.target.files ? Array.from(e.target.files) : []);
        e.target.value = ''; // allow re-picking the same file
    };

    // Release preview blobs when the sidebar closes or switches creator.
    useEffect(() => {
        return () => {
            pendingAttachments.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId]);

    // Composing, mention autocomplete and formatting now live in
    // DiscussionComposer, which keeps this component holding only the markdown
    // it will send.

    const handleSendMessage = async () => {
        if (!threadId || !user || isSending) return;

        const uploadsInFlight = pendingAttachments.some(p => p.status === 'uploading');
        if (uploadsInFlight) {
            setAttachmentError('Waiting for uploads to finish…');
            return;
        }

        const readyAttachments = pendingAttachments
            .filter(p => p.status === 'done' && p.uploaded)
            .map(p => p.uploaded as DiscussionAttachment);

        const msgText = newMessage.trim();
        // A screenshot with no caption is a legitimate message.
        if (!msgText && readyAttachments.length === 0) return;

        setIsSending(true);
        // Snapshot the editor state before clearing so a failed send can put
        // the exact formatted draft back, not a re-parsed approximation.
        const draftSnapshot = composerRef.current?.getJSON();
        setNewMessage('');
        composerRef.current?.clear();
        setAttachmentError(null);
        const sentAttachments = pendingAttachments;
        setPendingAttachments([]);

        const actorName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Team Member';
        const senderEmail = user.email || 'user@firegroup.io';
        // Resolved against the real member list, so a mention only counts when
        // it names someone we can actually notify.
        const resolvedMentions = extractMentions(msgText, teamMembersList);
        const taggedUsers = resolvedMentions.map(m => m.name);

        const tempId = `temp_${Date.now()}`;
        const tempMsg: Message = {
            id: tempId,
            thread_id: threadId,
            body: msgText,
            actor: actorName,
            type: 'user',
            created_at: new Date().toISOString(),
            attachments: readyAttachments,
            mentions: resolvedMentions,
            body_format: 'markdown'
        };
        setMessages(prev => [...prev, tempMsg]);
        scrollToBottom();
        try {
            const { data, error } = await supabaseClient
                .from('proposal_discussion_messages')
                .insert({
                    thread_id: threadId,
                    body: msgText,
                    actor: actorName,
                    type: 'user',
                    attachments: readyAttachments,
                    mentions: resolvedMentions,
                    body_format: 'markdown'
                })
                .select()
                .single();
            if (error) throw error;
            if (data) {
                setMessages(prev => prev.map(m => m.id === tempId ? (data as Message) : m));
            }
            sentAttachments.forEach(p => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
            recordReadReceipt(threadId);
            fetchMessages(threadId);
            const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
            const deepLinkUrl = `${currentOrigin}/influencer/proposal/${proposalId || ''}?kolId=${kolId || ''}`;
            sendDiscussionEmailNotification({
                threadId,
                proposalId: proposalId || '',
                proposalTitle: proposalTitle || 'Campaign Proposal',
                kolId: kolId || '',
                kolName,
                senderName: actorName,
                senderEmail,
                messageBody: msgText,
                taggedUsers,
                deepLinkUrl
            });
        } catch (err) {
            console.error('Error sending message:', err);
            setMessages(prev => prev.filter(m => m.id !== tempId));
            // Put the draft and its uploads back so nothing is silently lost.
            setNewMessage(msgText);
            if (draftSnapshot) composerRef.current?.setJSON(draftSnapshot);
            setPendingAttachments(sentAttachments);
            setAttachmentError('Could not send. Your message and attachments were restored.');
        } finally {
            setIsSending(false);
        }
    };

    const handleExecuteActionFromChat = async (action: 'Approved' | 'Rejected' | 'Re-negotiate') => {
        if (!proposalId || !kolId || !user) return;
        const actorName = user.user_metadata?.full_name || user.email || 'Team Member';
        try {
            const { error } = await supabaseClient.rpc('update_proposal_kol_status', {
                p_proposal_id: proposalId,
                p_kol_id: kolId,
                p_new_status: action,
                p_actor: actorName,
                p_source: 'Chat Sidebar'
            });
            if (error) throw error;
            if (onStatusChange) {
                onStatusChange(proposalId, kolId, action);
            }
            if (threadId) {
                fetchMessages(threadId);
            }
        } catch (err) {
            console.error('Error updating creator status from discussion:', err);
        }
    };

    /**
     * System notices ("status changed to…", migration notes) pile up and push
     * the actual conversation out of view. Consecutive runs collapse to the 3
     * most recent, with the rest available behind a toggle -- capped, not
     * discarded, so nothing is silently lost.
     */
    const MAX_VISIBLE_SYSTEM_MESSAGES = 3;

    type FeedItem =
        | { kind: 'message'; msg: Message }
        | { kind: 'systemGroup'; msgs: Message[] };

    const feedItems: FeedItem[] = useMemo(() => {
        const items: FeedItem[] = [];
        for (const msg of messages) {
            if (msg.type === 'system') {
                const last = items[items.length - 1];
                if (last && last.kind === 'systemGroup') last.msgs.push(msg);
                else items.push({ kind: 'systemGroup', msgs: [msg] });
            } else {
                items.push({ kind: 'message', msg });
            }
        }
        return items;
    }, [messages]);

    const latestMessage = messages[messages.length - 1];
    const otherReaders = useMemo(() => {
        if (!latestMessage || !user) return [];
        const currentUserEmail = user.email || '';
        return readReceipts.filter(r => 
            r.user_email !== currentUserEmail && 
            new Date(r.last_read_at).getTime() >= new Date(latestMessage.created_at).getTime() - 10000
        );
    }, [readReceipts, latestMessage, user]);

    // The composer owns the text side of "can I send?"; this covers the
    // attachment side, so a screenshot with no caption still enables Send.
    const hasReadyAttachment = pendingAttachments.some(p => p.status === 'done');

    if (!isOpen) return null;

    return createPortal(
        <div
            className="discussion-sidebar fixed top-0 right-0 z-[999999] flex h-screen w-[540px] max-w-[95vw] animate-in flex-col border-l border-[var(--tp-rule)] bg-white font-sans pointer-events-auto slide-in-from-right duration-200 shadow-2xl"
            onDragEnter={handleDragEnter}
            onDragOver={e => { if (isDraggingFile) e.preventDefault(); }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDraggingFile && user && (
                <div className="pointer-events-none absolute inset-3 z-50 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--accent-color)] bg-emerald-50/95 text-[var(--accent-color)]">
                    <ImagePlus className="h-7 w-7 stroke-[1.5]" />
                    <p className="text-xs font-semibold">Drop to attach</p>
                    <p className="text-[11px] text-emerald-700">PNG, JPEG, GIF, WebP or PDF — up to 10 MB</p>
                </div>
            )}
            <div className="discussion-sidebar-header flex items-start justify-between px-6 pb-4 pt-6 border-b border-slate-100">
                <div className="flex flex-col">
                    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <span>Deal Discussion</span>
                    </h2>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span>Creator: <strong className="font-semibold text-slate-800">{kolName}</strong></span>
                        {proposalTitle && (
                            <>
                                <span className="text-slate-300">•</span>
                                <span className="truncate max-w-[200px]" title={proposalTitle}>{proposalTitle}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {user && (
                        <button
                            onClick={handleSignOut}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            title={`Logged in as ${user.email}. Click to Sign Out`}
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close discussion"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {authLoading ? (
                <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : !user ? (
                <div className="discussion-auth flex flex-1 flex-col items-center justify-center space-y-5 px-8 text-center">
                    <div className="space-y-1.5">
                        <h3 className="text-base font-semibold text-slate-900">Sign in to join discussion</h3>
                        <p className="mx-auto max-w-[300px] text-xs leading-5 text-slate-500">
                            Access is strictly restricted to internal team members with an <strong className="text-slate-800">@firegroup.io</strong> Google account.
                        </p>
                    </div>
                    {authError && (
                        <div className="flex max-w-[320px] items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-left text-xs font-medium text-rose-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                            <span>{authError}</span>
                        </div>
                    )}
                    <div className="w-full max-w-[320px] space-y-2">
                        <button
                            onClick={handleGoogleLogin}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 shadow-xs"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                            </svg>
                            <span>Sign in with Google (@firegroup.io)</span>
                        </button>
                        {isDevEnvironment && (
                            <button
                                onClick={handleDevLogin}
                                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                                <span>Dev test sign-in (Quan Tran Hoang)</span>
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    <div className="discussion-message-feed flex-1 space-y-4 overflow-y-auto px-6 py-4 bg-slate-50/40">
                        {loading ? (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center space-y-2 text-center text-slate-400">
                                <Users className="w-8 h-8 stroke-1 text-slate-300" />
                                <div>
                                    <p className="text-xs font-semibold text-slate-700">No messages yet</p>
                                    <p className="mx-auto mt-1 max-w-[240px] text-xs text-slate-400">Start the internal discussion or tag team members using @</p>
                                </div>
                            </div>
                        ) : (
                            feedItems.map((item, idx) => {
                                if (item.kind === 'systemGroup') {
                                    const hidden = item.msgs.length - MAX_VISIBLE_SYSTEM_MESSAGES;
                                    const visible = showAllSystemMessages || hidden <= 0
                                        ? item.msgs
                                        : item.msgs.slice(-MAX_VISIBLE_SYSTEM_MESSAGES);
                                    return (
                                        <div key={`sys-${item.msgs[0].id || idx}`} className="space-y-1">
                                            {hidden > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllSystemMessages(v => !v)}
                                                    className="mx-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                                >
                                                    <ChevronDown
                                                        className={`h-3 w-3 transition-transform ${showAllSystemMessages ? 'rotate-180' : ''}`}
                                                    />
                                                    <span>
                                                        {showAllSystemMessages
                                                            ? 'Hide earlier updates'
                                                            : `Show ${hidden} earlier update${hidden === 1 ? '' : 's'}`}
                                                    </span>
                                                </button>
                                            )}
                                            {visible.map((sysMsg, sysIdx) => (
                                                <div
                                                    key={sysMsg.id || `${idx}-${sysIdx}`}
                                                    className="my-2 text-center text-[11px] font-medium italic text-slate-400"
                                                >
                                                    <span>{sysMsg.body}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                }

                                const msg = item.msg;
                                const currentUserEmail = (user?.email || '').toLowerCase();
                                const currentUserName = (user?.user_metadata?.full_name || '').toLowerCase();
                                const actorName = (msg.actor || '').toLowerCase();
                                const isUser = msg.type === 'user' && (
                                    actorName === currentUserName ||
                                    actorName === currentUserEmail ||
                                    (actorName.includes('quan') && currentUserName.includes('quan'))
                                );

                                return (
                                    <div key={msg.id || idx}>
                                        {(
                                            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                                                {!isUser && (
                                                    <span className="text-[11px] font-bold text-[#176b5e] mb-1 pl-1 flex items-center gap-1">
                                                        <span>{msg.actor || 'Team Member'}</span>
                                                    </span>
                                                )}
                                                <div className={`max-w-[85%] px-4 py-3 text-xs leading-relaxed shadow-2xs ${
                                                    isUser 
                                                        ? 'bg-[#176b5e] text-white rounded-2xl rounded-tr-xs' 
                                                        : 'bg-[#ecf4f1] text-[#1c2826] border border-[#d2e3dc] rounded-2xl rounded-tl-xs'
                                                }`}>
                                                    {msg.body && (
                                                        <RichMessageBody
                                                            body={msg.body}
                                                            isUser={isUser}
                                                            format={msg.body_format}
                                                            mentionNames={mentionNames}
                                                        />
                                                    )}
                                                    <AttachmentGrid
                                                        attachments={parseAttachments(msg.attachments)}
                                                        isUser={isUser}
                                                    />
                                                    <div className={`mt-1.5 text-[10px] font-medium flex items-center justify-end gap-1 ${
                                                        isUser ? 'text-emerald-100/80' : 'text-slate-400'
                                                    }`}>
                                                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                                {isUser && (() => {
                                                    const intent = detectMessageIntent(msg.body);
                                                    if (!intent) return null;
                                                    return (
                                                        <div className="mt-1.5 flex items-center gap-1.5">
                                                            {intent === 'Approved' && (
                                                                <button
                                                                    onClick={() => handleExecuteActionFromChat('Approved')}
                                                                    className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs"
                                                                >
                                                                    <Check className="h-3.5 w-3.5" />
                                                                    <span>Approve deal</span>
                                                                </button>
                                                            )}
                                                            {intent === 'Rejected' && (
                                                                <button
                                                                    onClick={() => handleExecuteActionFromChat('Rejected')}
                                                                    className="flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100 transition-colors shadow-2xs"
                                                                >
                                                                    <X className="h-3.5 w-3.5" />
                                                                    <span>Reject deal</span>
                                                                </button>
                                                            )}
                                                            {intent === 'Re-negotiate' && (
                                                                <button
                                                                    onClick={() => handleExecuteActionFromChat('Re-negotiate')}
                                                                    className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors shadow-2xs"
                                                                >
                                                                    <RefreshCw className="h-3.5 w-3.5" />
                                                                    <span>Re-negotiate deal</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                        {otherReaders.length > 0 && (
                            <div className="pt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-400 font-medium select-none">
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>
                                    Seen by {otherReaders.map(r => r.user_name).join(', ')} at {new Date(otherReaders[0].last_read_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="discussion-composer px-5 pb-5 pt-3 border-t border-slate-100 bg-white relative">
                        <PendingAttachmentStrip
                            pending={pendingAttachments}
                            onRemove={handleRemovePending}
                        />

                        {attachmentError && (
                            <div className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
                                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                                <span className="flex-1">{attachmentError}</span>
                                <button
                                    type="button"
                                    onClick={() => setAttachmentError(null)}
                                    className="shrink-0 rounded p-0.5 transition-colors hover:bg-amber-200"
                                    aria-label="Dismiss"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ACCEPTED_MIME_TYPES.join(',')}
                            onChange={handleFilePicker}
                            className="hidden"
                        />

                        <Suspense
                            fallback={
                                <div className="flex h-[76px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
                                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                </div>
                            }
                        >
                            <DiscussionComposer
                                ref={composerRef}
                                members={teamMembersList}
                                isSending={isSending}
                                hasAttachments={hasReadyAttachment}
                                onMarkdownChange={setNewMessage}
                                onSend={handleSendMessage}
                                onFiles={stageFiles}
                                onAttachClick={() => fileInputRef.current?.click()}
                            />
                        </Suspense>
                    </div>
                </>
            )}
        </div>,
        document.body
    );
};

export default DiscussionSidebar;