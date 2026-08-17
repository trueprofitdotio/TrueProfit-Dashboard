import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabaseClient } from '../services/supabaseClient';
import { X, Send, Loader2, Check, RefreshCw, AlertCircle, LogOut } from 'lucide-react';

interface DiscussionSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    proposalId: string | null;
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

const detectMessageIntent = (text: string): 'Approved' | 'Rejected' | 'Re-negotiate' | null => {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Approve intent patterns (English, Vietnamese, mixed)
    if (
        lower.includes('oke') || lower.includes('proceed') || lower.includes('approve') ||
        lower.includes('chốt') || lower.includes('duyệt') || lower.includes('đồng ý') ||
        lower.includes('agree') || lower.includes('ok em') || lower.includes('ok chị') ||
        lower.includes('ok nhe') || lower.includes('ok nhé') || lower.includes('tốt rồi')
    ) {
        return 'Approved';
    }

    // Reject intent patterns
    if (
        lower.includes('reject') || lower.includes('cancel') || lower.includes('từ chối') ||
        lower.includes('không duyệt') || lower.includes('hủy') || lower.includes('decline') ||
        lower.includes('too expensive') || lower.includes('bỏ qua') || lower.includes('không đồng ý')
    ) {
        return 'Rejected';
    }

    // Re-negotiate intent patterns
    if (
        lower.includes('negotiate') || lower.includes('thương lượng') || lower.includes('đàm phán') ||
        lower.includes('bớt') || lower.includes('re-negotiate') || lower.includes('discount') ||
        lower.includes('giảm giá') || lower.includes('discuss') || lower.includes('xem lại giá')
    ) {
        return 'Re-negotiate';
    }

    return null;
};

const DiscussionSidebar: React.FC<DiscussionSidebarProps> = ({
    isOpen,
    onClose,
    proposalId,
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
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // 1. Google OAuth Auth Check & @firegroup.io Domain Enforcement
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
                        // Reject unauthorized domain
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
            const redirectUrl = typeof window !== 'undefined' ? window.location.href : undefined;
            const { error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: {
                        hd: 'firegroup.io' // Prompt Google to prioritize @firegroup.io domain accounts
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
            email: 'test.team@firegroup.io',
            user_metadata: {
                full_name: 'FireGroup Dev Team'
            }
        };
        setUser(devUser);
        setAuthError(null);
    };

    const handleSignOut = async () => {
        await supabaseClient.auth.signOut();
        setUser(null);
    };

    // 2. Load Thread & Messages when Auth Passed & Open
    useEffect(() => {
        if (!isOpen || !proposalId || !kolId || !user) return;

        const initializeThread = async () => {
            setLoading(true);
            try {
                // Fetch or Create Thread
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

    // 3. Real-time Subscription
    useEffect(() => {
        if (!threadId) return;

        const channel = supabaseClient.channel(`messages_for_${threadId}`)
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
                }
            )
            .subscribe();

        return () => {
            supabaseClient.removeChannel(channel);
        };
    }, [threadId]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !threadId || !user) return;

        const msgText = newMessage.trim();
        setNewMessage('');

        const actorName = user.user_metadata?.full_name || user.email || 'Team Member';

        const tempId = `temp_${Date.now()}`;
        const tempMsg: Message = {
            id: tempId,
            thread_id: threadId,
            body: msgText,
            actor: actorName,
            type: 'user',
            created_at: new Date().toISOString()
        };

        // Optimistic UI update: immediately render message in local state
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
            fetchMessages(threadId);
        } catch (err) {
            console.error('Error sending message:', err);
            setMessages(prev => prev.filter(m => m.id !== tempId));
            setNewMessage(msgText);
        }
    };

    // 4. Action Execution from Discussion (Approve, Reject, Re-negotiate)
    const handleExecuteActionFromChat = async (action: 'Approved' | 'Rejected' | 'Re-negotiate') => {
        if (!proposalId || !kolId || !user) return;
        const actorName = user.user_metadata?.full_name || user.email || 'Team Member';

        try {
            // Call RPC to update creator proposal status atomically
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

    if (!isOpen) return null;

    return createPortal(
        <div className="discussion-sidebar fixed top-0 right-0 z-[999999] flex h-screen w-[450px] max-w-[90vw] animate-in flex-col border-l border-[var(--tp-rule)] bg-white font-sans pointer-events-auto slide-in-from-right duration-200">
            
            {/* Header */}
            <div className="discussion-sidebar-header flex items-start justify-between px-6 pb-4 pt-6">
                <div className="flex flex-col">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <span>Deal Discussion</span>
                    </h2>
                    <span className="mt-1 text-sm text-slate-500">Creator: <strong className="font-semibold text-slate-800">{kolName}</strong></span>
                </div>
                
                <div className="flex items-center gap-2">
                    {user && (
                        <button
                            onClick={handleSignOut}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                            title={`Logged in as ${user.email}. Click to Sign Out`}
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    )}
                    <button 
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close discussion"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Auth Gate Guard */}
            {authLoading ? (
                <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : !user ? (
                <div className="discussion-auth flex flex-1 flex-col items-center justify-center space-y-5 px-8 text-center">
                    <div className="space-y-1.5">
                        <h3 className="text-base font-semibold text-slate-900">Sign in to join discussion</h3>
                        <p className="mx-auto max-w-[300px] text-sm leading-6 text-slate-500">
                            Access is strictly restricted to internal team members with an <strong className="text-slate-800">@firegroup.io</strong> Google account.
                        </p>
                    </div>

                    {authError && (
                        <div className="flex max-w-[320px] items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-left text-sm font-medium text-rose-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                            <span>{authError}</span>
                        </div>
                    )}

                    <div className="w-full max-w-[320px] space-y-2">
                        <button
                            onClick={handleGoogleLogin}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
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
                                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--tp-rule)] bg-white py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                            >
                                <span>Dev test sign-in</span>
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    {/* Messages Feed */}
                    <div className="discussion-message-feed flex-1 space-y-5 overflow-y-auto px-6 py-4">
                        {loading ? (
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                            </div>
                        ) : messages.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center space-y-2 text-center">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-700">No messages yet</p>
                                        <p className="mx-auto mt-1 max-w-[240px] text-sm leading-6 text-slate-500">Start the internal discussion for this creator deal.</p>
                                    </div>
                                </div>
                            ) : (
                                messages.map((msg, idx) => {
                                    const isUser = msg.type === 'user';
                                    const isSystem = msg.type === 'system';

                                    return (
                                        <div key={msg.id || idx}>
                                            {isSystem ? (
                                                <div className="my-2 text-center text-xs font-medium italic text-slate-400">
                                                    <span>{msg.body}</span>
                                                </div>
                                            ) : (
                                                <div className={`mb-3 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                                                    <div className={`max-w-[88%] rounded-md px-4 py-2.5 text-sm ${
                                                        isUser 
                                                            ? 'bg-[var(--accent-color)] text-white' 
                                                            : 'text-slate-800'
                                                    }`}>
                                                        {isUser && (
                                                            <div className="mb-1 flex items-center justify-end gap-1 text-xs font-semibold text-emerald-100">
                                                                <span>{msg.actor || 'You'}</span>
                                                            </div>
                                                        )}

                                                        <div className="whitespace-pre-wrap leading-relaxed">
                                                            {msg.body}
                                                        </div>

                                                        <div className={`mt-1.5 text-xs font-medium ${isUser ? 'text-right text-emerald-100' : 'text-slate-400'}`}>
                                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>

                                                    {/* Dynamic Gemini Intent Action Button */}
                                                    {isUser && (() => {
                                                        const intent = detectMessageIntent(msg.body);
                                                        if (!intent) return null;
                                                        return (
                                                            <div className="mt-2 flex animate-in items-center gap-1.5 fade-in duration-200">
                                                                {intent === 'Approved' && (
                                                                    <button
                                                                        onClick={() => handleExecuteActionFromChat('Approved')}
                                                                        className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                                                                    >
                                                                        <Check className="h-3.5 w-3.5" />
                                                                        <span>Approve deal</span>
                                                                    </button>
                                                                )}
                                                                {intent === 'Rejected' && (
                                                                    <button
                                                                        onClick={() => handleExecuteActionFromChat('Rejected')}
                                                                        className="flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                                                                    >
                                                                        <X className="h-3.5 w-3.5" />
                                                                        <span>Reject deal</span>
                                                                    </button>
                                                                )}
                                                                {intent === 'Re-negotiate' && (
                                                                    <button
                                                                        onClick={() => handleExecuteActionFromChat('Re-negotiate')}
                                                                        className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50"
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
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Input & Action Bar */}
                        <div className="discussion-composer px-6 pb-5 pt-3">
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Type a note or message..."
                                    className="max-h-32 min-h-[44px] w-full resize-none rounded-md border border-[var(--tp-rule)] bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--accent-color)]"
                                    rows={1}
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!newMessage.trim()}
                                    className="shrink-0 rounded-md bg-[var(--accent-color)] p-3 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Send message"
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
