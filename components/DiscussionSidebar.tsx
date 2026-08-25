import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import { fetchYouTubeVideoDetails, fetchYouTubeChannelDetails, getYouTubeVideoId, YouTubeVideoInfo, YouTubeChannelInfo } from '../services/youtubeService';
import { sendDiscussionEmailNotification } from '../services/notificationService';
import { 
    X, Send, Loader2, Check, RefreshCw, AlertCircle, LogOut, 
    AtSign, ExternalLink, Youtube, Play, CheckCheck, Users
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

// Render Rich Message Body with Clickable Links & Styled @Mentions
const RichMessageBody: React.FC<{ body: string; isUser: boolean }> = ({ body, isUser }) => {
    const urlMatches = useMemo(() => {
        const matches = body.match(/(https?:\/\/[^\s,]+)/g) || [];
        return Array.from(new Set(matches));
    }, [body]);

    const renderFormattedText = () => {
        const tokenRegex = /(@[\w\p{L}\s.-]+?(?=\s@|\shttps?:\/\/|$|\n|[.,!?](\s|$)))|(https?:\/\/[^\s,]+)/gu;
        const elements: React.ReactNode[] = [];
        let lastIdx = 0;
        let match: RegExpExecArray | null;

        while ((match = tokenRegex.exec(body)) !== null) {
            if (match.index > lastIdx) {
                elements.push(body.slice(lastIdx, match.index));
            }
            const token = match[0];
            if (token.startsWith('@')) {
                elements.push(
                    <span 
                        key={match.index}
                        className={`inline-block font-semibold px-1.5 py-0.5 rounded-md text-xs font-mono select-all transition-colors ${
                            isUser 
                                ? 'bg-emerald-700/80 text-emerald-100 border border-emerald-500/40' 
                                : 'bg-[#176b5e]/15 text-[#176b5e] border border-[#176b5e]/30'
                        }`}
                    >
                        {token}
                    </span>
                );
            } else if (token.startsWith('http')) {
                elements.push(
                    <a
                        key={match.index}
                        href={token}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className={`inline-flex items-center gap-1 underline font-medium hover:opacity-80 transition-opacity break-all ${
                            isUser ? 'text-emerald-100' : 'text-blue-600'
                        }`}
                    >
                        <span>{token}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                    </a>
                );
            }
            lastIdx = tokenRegex.lastIndex;
        }
        if (lastIdx < body.length) {
            elements.push(body.slice(lastIdx));
        }
        return elements.length > 0 ? elements : body;
    };

    return (
        <div>
            <div className="whitespace-pre-wrap leading-relaxed">
                {renderFormattedText()}
            </div>
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
    
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState<number>(0);
    const [mentionCursorPos, setMentionCursorPos] = useState<number>(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLTextAreaElement>(null);

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

    const filteredMentionMembers = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        return teamMembersList.filter(m => 
            m.name.toLowerCase().includes(q) || 
            m.email.toLowerCase().includes(q)
        );
    }, [mentionQuery, teamMembersList]);

    const adjustTextareaHeight = () => {
        if (messageInputRef.current) {
            messageInputRef.current.style.height = 'auto';
            const newHeight = Math.min(Math.max(messageInputRef.current.scrollHeight, 44), 180);
            messageInputRef.current.style.height = `${newHeight}px`;
        }
    };

    useEffect(() => {
        if (!isOpen || authLoading || !user) return;
        const t = setTimeout(() => {
            messageInputRef.current?.focus();
            adjustTextareaHeight();
        }, 220);
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
                let { data: thread, error: fetchError } = await supabaseClient
                    .from('proposal_discussion_threads')
                    .select('id')
                    .eq('proposal_id', proposalId)
                    .eq('kol_id', kolId)
                    .single();
                if (fetchError && fetchError.code === 'PGRST116') {
                    const { data: newThread, error: insertError } = await supabaseClient
                        .from('proposal_discussion_threads')
                        .insert({ proposal_id: proposalId, kol_id: kolId })
                        .select('id')
                        .single();
                    if (insertError) throw insertError;
                    thread = newThread;
                } else if (fetchError) {
                    throw fetchError;
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

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart;
        setNewMessage(val);
        adjustTextareaHeight();
        const textBeforeCursor = val.slice(0, cursor);
        const atMatch = textBeforeCursor.match(/@([\w\p{L}]*)$/u);
        if (atMatch) {
            setMentionQuery(atMatch[1]);
            setMentionIndex(0);
            setMentionCursorPos(cursor);
        } else {
            setMentionQuery(null);
        }
    };

    const handleSelectMention = (member: TeamMember) => {
        if (!messageInputRef.current) return;
        const cursor = mentionCursorPos;
        const textBefore = newMessage.slice(0, cursor);
        const textAfter = newMessage.slice(cursor);
        const newBefore = textBefore.replace(/@[\w\p{L}]*$/u, `@${member.name} `);
        const updated = newBefore + textAfter;
        setNewMessage(updated);
        setMentionQuery(null);
        setTimeout(() => {
            if (messageInputRef.current) {
                messageInputRef.current.focus();
                const nextPos = newBefore.length;
                messageInputRef.current.setSelectionRange(nextPos, nextPos);
                adjustTextareaHeight();
            }
        }, 50);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionQuery !== null && filteredMentionMembers.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex(prev => (prev + 1) % filteredMentionMembers.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex(prev => (prev - 1 + filteredMentionMembers.length) % filteredMentionMembers.length);
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                handleSelectMention(filteredMentionMembers[mentionIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !threadId || !user) return;
        const msgText = newMessage.trim();
        setNewMessage('');
        setMentionQuery(null);
        if (messageInputRef.current) {
            messageInputRef.current.style.height = '44px';
        }
        const actorName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Team Member';
        const senderEmail = user.email || 'user@firegroup.io';
        const taggedUsers = Array.from(msgText.match(/@([\w\p{L}\s.-]+?)(?=\s@|\shttps?:\/\/|$|\n|[.,!?](\s|$))/gu) || [])
            .map((t: string) => t.replace(/^@/, '').trim());
        const tempId = `temp_${Date.now()}`;
        const tempMsg: Message = {
            id: tempId,
            thread_id: threadId,
            body: msgText,
            actor: actorName,
            type: 'user',
            created_at: new Date().toISOString()
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
                    type: 'user'
                })
                .select()
                .single();
            if (error) throw error;
            if (data) {
                setMessages(prev => prev.map(m => m.id === tempId ? (data as Message) : m));
            }
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
            setNewMessage(msgText);
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

    const latestMessage = messages[messages.length - 1];
    const otherReaders = useMemo(() => {
        if (!latestMessage || !user) return [];
        const currentUserEmail = user.email || '';
        return readReceipts.filter(r => 
            r.user_email !== currentUserEmail && 
            new Date(r.last_read_at).getTime() >= new Date(latestMessage.created_at).getTime() - 10000
        );
    }, [readReceipts, latestMessage, user]);

    if (!isOpen) return null;

    return createPortal(
        <div className="discussion-sidebar fixed top-0 right-0 z-[999999] flex h-screen w-[540px] max-w-[95vw] animate-in flex-col border-l border-[var(--tp-rule)] bg-white font-sans pointer-events-auto slide-in-from-right duration-200 shadow-2xl">
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
                            messages.map((msg, idx) => {
                                const currentUserEmail = (user?.email || '').toLowerCase();
                                const currentUserName = (user?.user_metadata?.full_name || '').toLowerCase();
                                const actorName = (msg.actor || '').toLowerCase();
                                const isUser = msg.type === 'user' && (
                                    actorName === currentUserName || 
                                    actorName === currentUserEmail ||
                                    (actorName.includes('quan') && currentUserName.includes('quan'))
                                );
                                const isSystem = msg.type === 'system';

                                return (
                                    <div key={msg.id || idx}>
                                        {isSystem ? (
                                            <div className="my-2 text-center text-[11px] font-medium italic text-slate-400">
                                                <span>{msg.body}</span>
                                            </div>
                                        ) : (
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
                                                    <RichMessageBody body={msg.body} isUser={isUser} />
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
                        {mentionQuery !== null && filteredMentionMembers.length > 0 && (
                            <div className="absolute bottom-full left-5 right-5 mb-2 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                    <AtSign className="w-3 h-3 text-[var(--accent-color)]" />
                                    <span>Mention Team Member</span>
                                </div>
                                <div className="max-h-48 overflow-y-auto p-1 space-y-0.5">
                                    {filteredMentionMembers.map((member, idx) => (
                                        <button
                                            key={member.email}
                                            type="button"
                                            onClick={() => handleSelectMention(member)}
                                            onMouseEnter={() => setMentionIndex(idx)}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors ${
                                                mentionIndex === idx 
                                                    ? 'bg-emerald-50 text-emerald-900 font-semibold' 
                                                    : 'text-slate-700 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-6 h-6 rounded-full bg-[var(--accent-color)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                                                    {member.name.charAt(0)}
                                                </div>
                                                <div className="truncate">
                                                    <div className="font-semibold text-slate-800 truncate">{member.name}</div>
                                                    <div className="text-[10px] text-slate-400 truncate">{member.email}</div>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-mono text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded-md">
                                                @{member.name.split(' ')[0]}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex items-end gap-2">
                            <textarea
                                ref={messageInputRef}
                                value={newMessage}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder="Type a note or message (use @ to mention)..."
                                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs outline-none transition-all focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/20 leading-relaxed max-h-[180px] min-h-[44px]"
                                rows={1}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!newMessage.trim()}
                                className="shrink-0 h-11 w-11 rounded-2xl bg-[var(--accent-color)] text-white flex items-center justify-center transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 shadow-2xs"
                                aria-label="Send message"
                                title="Send message (Enter)"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>,
        document.body
    );
};

export default DiscussionSidebar;