import React, { useImperativeHandle, useState, forwardRef, useMemo, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
    Send, Loader2, AtSign, Paperclip,
    Bold, Italic, Code, List, ListOrdered, Strikethrough, Quote
} from 'lucide-react';
import { tiptapToMarkdown } from '../services/tiptapMarkdown';

export interface ComposerMember {
    name: string;
    email: string;
}

export interface DiscussionComposerHandle {
    focus: () => void;
    clear: () => void;
    /** Snapshot for restoring a draft when a send fails. */
    getJSON: () => any;
    setJSON: (json: any) => void;
}

interface Props {
    members: ComposerMember[];
    isSending: boolean;
    /** True when attachments alone would make the message sendable. */
    hasAttachments: boolean;
    onMarkdownChange: (markdown: string) => void;
    onSend: () => void;
    onFiles: (files: File[]) => void;
    onAttachClick: () => void;
}

const DiscussionComposer = forwardRef<DiscussionComposerHandle, Props>(({
    members,
    isSending,
    hasAttachments,
    onMarkdownChange,
    onSend,
    onFiles,
    onAttachClick
}, ref) => {
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [isEmpty, setIsEmpty] = useState(true);

    const filteredMembers = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.toLowerCase();
        return members.filter(m =>
            m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
        );
    }, [mentionQuery, members]);

    // Kept in refs-by-closure via the editor's own handlers below; the popover
    // state has to be readable from handleKeyDown, which Tiptap binds once.
    const stateRef = React.useRef({ filteredMembers, mentionIndex, mentionQuery });
    stateRef.current = { filteredMembers, mentionIndex, mentionQuery };

    const sendRef = React.useRef(onSend);
    sendRef.current = onSend;

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                // Not part of the render subset -- excluding them keeps what the
                // composer shows and what the bubble shows identical.
                heading: false,
                horizontalRule: false
            }),
            Placeholder.configure({
                placeholder: 'Type a note or message (@ to mention)…'
            })
        ],
        editorProps: {
            attributes: {
                class: 'discussion-editor-content'
            },
            handleKeyDown: (_view, event) => {
                const { filteredMembers: list, mentionIndex: idx, mentionQuery: query } =
                    stateRef.current;

                if (query !== null && list.length > 0) {
                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setMentionIndex((idx + 1) % list.length);
                        return true;
                    }
                    if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setMentionIndex((idx - 1 + list.length) % list.length);
                        return true;
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                        event.preventDefault();
                        insertMention(list[idx]);
                        return true;
                    }
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        setMentionQuery(null);
                        return true;
                    }
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendRef.current();
                    return true;
                }
                return false;
            },
            handlePaste: (_view, event) => {
                const files = event.clipboardData ? Array.from(event.clipboardData.files) : [];
                if (files.length > 0) {
                    event.preventDefault();
                    onFiles(files);
                    return true;
                }
                return false;
            }
        },
        onUpdate: ({ editor: ed }) => {
            onMarkdownChange(tiptapToMarkdown(ed.getJSON() as any));
            setIsEmpty(ed.isEmpty);

            // Detect an in-progress @token immediately before the caret.
            const { from } = ed.state.selection;
            const textBefore = ed.state.doc.textBetween(Math.max(0, from - 60), from, '\n', '\n');
            const match = textBefore.match(/@([\w\p{L}]*)$/u);
            if (match) {
                setMentionQuery(match[1]);
                setMentionIndex(0);
            } else {
                setMentionQuery(null);
            }
        }
    });

    const insertMention = (member: ComposerMember) => {
        if (!editor || !member) return;
        const { from } = editor.state.selection;
        const textBefore = editor.state.doc.textBetween(Math.max(0, from - 60), from, '\n', '\n');
        const match = textBefore.match(/@([\w\p{L}]*)$/u);
        const tokenLength = match ? match[0].length : 0;

        editor
            .chain()
            .focus()
            .deleteRange({ from: from - tokenLength, to: from })
            // Plain text, not a mark: the stored body stays "@Name" so the
            // bubble renderer and the email function both keep working.
            .insertContent(`@${member.name} `)
            .run();
        setMentionQuery(null);
    };

    useImperativeHandle(ref, () => ({
        focus: () => editor?.commands.focus(),
        clear: () => {
            editor?.commands.clearContent(true);
            setIsEmpty(true);
            setMentionQuery(null);
        },
        getJSON: () => editor?.getJSON(),
        setJSON: (json: any) => {
            editor?.commands.setContent(json);
            setIsEmpty(editor?.isEmpty ?? true);
        }
    }), [editor]);

    // Placeholder text only renders once the editor is mounted.
    useEffect(() => {
        if (editor) setIsEmpty(editor.isEmpty);
    }, [editor]);

    const canSend = !isSending && (!isEmpty || hasAttachments);

    const toolbarButtons = editor
        ? [
            { icon: Bold, label: 'Bold (Ctrl+B)', active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
            { icon: Italic, label: 'Italic (Ctrl+I)', active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
            { icon: Strikethrough, label: 'Strikethrough', active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
            { icon: Code, label: 'Inline code (Ctrl+E)', active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
            { icon: List, label: 'Bullet list', active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
            { icon: ListOrdered, label: 'Numbered list', active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
            { icon: Quote, label: 'Quote', active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() }
        ]
        : [];

    return (
        <>
            {mentionQuery !== null && filteredMembers.length > 0 && (
                <div className="absolute bottom-full left-5 right-5 mb-2 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        <AtSign className="h-3 w-3 text-[var(--accent-color)]" />
                        <span>Mention Team Member</span>
                    </div>
                    <div className="max-h-48 space-y-0.5 overflow-y-auto p-1">
                        {filteredMembers.map((member, idx) => (
                            <button
                                key={member.email}
                                type="button"
                                onClick={() => insertMention(member)}
                                onMouseEnter={() => setMentionIndex(idx)}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                                    mentionIndex === idx
                                        ? 'bg-emerald-50 font-semibold text-emerald-900'
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-color)] text-[10px] font-bold text-white">
                                        {member.name.charAt(0)}
                                    </span>
                                    <span className="truncate">
                                        <span className="block truncate font-semibold text-slate-800">{member.name}</span>
                                        <span className="block truncate text-[10px] text-slate-400">{member.email}</span>
                                    </span>
                                </span>
                                <span className="rounded-md bg-emerald-100/60 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                                    @{member.name.split(' ')[0]}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="mb-1.5 flex items-center gap-0.5">
                {toolbarButtons.map(({ icon: Icon, label, active, run }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={run}
                        title={label}
                        aria-label={label}
                        aria-pressed={active}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                            active
                                ? 'bg-emerald-100 text-[var(--accent-color)]'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                    </button>
                ))}

                <span className="mx-1 h-4 w-px bg-slate-200" />

                <button
                    type="button"
                    onClick={onAttachClick}
                    title="Attach a screenshot or file"
                    aria-label="Attach a screenshot or file"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                >
                    <Paperclip className="h-3.5 w-3.5" />
                </button>

                <span className="ml-auto text-[10px] text-slate-400">
                    Paste or drop a screenshot
                </span>
            </div>

            <div className="flex items-end gap-2">
                <div className="discussion-editor-shell max-h-[180px] min-h-[44px] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs transition-all focus-within:border-[var(--accent-color)] focus-within:ring-2 focus-within:ring-[var(--accent-color)]/20">
                    <EditorContent editor={editor} />
                </div>
                <button
                    onClick={onSend}
                    disabled={!canSend}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-color)] text-white shadow-2xs transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send message"
                    title="Send message (Enter)"
                >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </div>
        </>
    );
});

DiscussionComposer.displayName = 'DiscussionComposer';
export default DiscussionComposer;
