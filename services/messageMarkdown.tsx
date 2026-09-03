import React from 'react';

/**
 * A deliberately small markdown subset for chat messages.
 *
 * Everything here renders to React elements -- never to an HTML string via
 * dangerouslySetInnerHTML. Message bodies are written by one user and rendered
 * in every other user's browser, so an HTML sink would be a stored-XSS hole.
 * Building nodes means unmatched syntax degrades to literal text instead.
 *
 * Supported: **bold**  *italic*  _italic_  ~~strike~~  `code`
 *            ```fenced blocks```  > quotes  - bullets  1. numbers
 *            bare URLs, @mentions
 */

export interface MarkdownRenderOptions {
    /** Known team member names, used to match multi-word mentions exactly. */
    mentionNames?: string[];
    /** Flips colours for the sender's own (dark green) bubble. */
    isUser: boolean;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// --------------------------------------------------------------------------
// Inline
// --------------------------------------------------------------------------

/**
 * Mentions are matched against the real member list, longest name first.
 *
 * The previous heuristic -- `@[\w\p{L}\s.-]+?` with lookahead terminators --
 * let a name run through following prose, so "@Ly can you check" highlighted
 * "@Ly can you check" instead of "@Ly". Matching known names first fixes that;
 * the fallback only ever takes a single word.
 */
const buildMentionRegex = (mentionNames: string[]): RegExp => {
    const known = [...mentionNames]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .map(escapeRegex);
    const alternatives = [...known, '[\\p{L}\\w][\\p{L}\\w.\\-]*'];
    return new RegExp(`@(${alternatives.join('|')})`, 'u');
};

interface InlineMatch {
    index: number;
    length: number;
    node: (key: string) => React.ReactNode;
}

const findFirstInlineMatch = (
    text: string,
    mentionRegex: RegExp,
    opts: MarkdownRenderOptions
): InlineMatch | null => {
    // Order matters. Code spans win outright so `**x**` inside backticks stays
    // literal; bold is tried before italic so ** is not consumed as two *.
    const rules: Array<{
        regex: RegExp;
        node: (m: RegExpMatchArray, key: string) => React.ReactNode;
    }> = [
        {
            regex: /`([^`\n]+)`/,
            node: (m, key) => (
                <code
                    key={key}
                    className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] ${
                        opts.isUser
                            ? 'bg-emerald-950/50 text-emerald-100'
                            : 'bg-slate-200/70 text-slate-800'
                    }`}
                >
                    {m[1]}
                </code>
            )
        },
        {
            regex: /\*\*([^\n]+?)\*\*/,
            node: (m, key) => (
                <strong key={key} className="font-bold">
                    {renderInline(m[1], mentionRegex, opts)}
                </strong>
            )
        },
        {
            regex: /~~([^\n]+?)~~/,
            node: (m, key) => (
                <span key={key} className="line-through opacity-80">
                    {renderInline(m[1], mentionRegex, opts)}
                </span>
            )
        },
        {
            // Underscore form requires word boundaries so snake_case_names and
            // storage paths are not mangled into italics.
            regex: /(?:\*([^*\n]+?)\*|\b_([^_\n]+?)_\b)/,
            node: (m, key) => (
                <em key={key} className="italic">
                    {renderInline(m[1] ?? m[2] ?? '', mentionRegex, opts)}
                </em>
            )
        },
        {
            regex: /https?:\/\/[^\s,)<>]+/,
            node: (m, key) => (
                <a
                    key={key}
                    href={m[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className={`underline font-medium hover:opacity-80 transition-opacity break-all ${
                        opts.isUser ? 'text-emerald-100' : 'text-blue-600'
                    }`}
                >
                    {m[0]}
                </a>
            )
        },
        {
            regex: mentionRegex,
            node: (m, key) => (
                <span
                    key={key}
                    className={`inline-block font-semibold px-1.5 py-0.5 rounded-md text-[11px] transition-colors ${
                        opts.isUser
                            ? 'bg-emerald-700/80 text-emerald-100 border border-emerald-500/40'
                            : 'bg-[#176b5e]/15 text-[#176b5e] border border-[#176b5e]/30'
                    }`}
                >
                    {m[0]}
                </span>
            )
        }
    ];

    let best: InlineMatch | null = null;
    for (const rule of rules) {
        const m = text.match(rule.regex);
        if (m && m.index !== undefined) {
            if (!best || m.index < best.index) {
                best = {
                    index: m.index,
                    length: m[0].length,
                    node: (key: string) => rule.node(m, key)
                };
            }
        }
    }
    return best;
};

const renderInline = (
    text: string,
    mentionRegex: RegExp,
    opts: MarkdownRenderOptions
): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let rest = text;
    let cursor = 0;

    while (rest.length > 0) {
        const match = findFirstInlineMatch(rest, mentionRegex, opts);
        if (!match) {
            out.push(rest);
            break;
        }
        if (match.index > 0) out.push(rest.slice(0, match.index));
        out.push(match.node(`i-${cursor + match.index}`));
        cursor += match.index + match.length;
        rest = rest.slice(match.index + match.length);
    }
    return out;
};

// --------------------------------------------------------------------------
// Blocks
// --------------------------------------------------------------------------

type Block =
    | { type: 'code'; content: string }
    | { type: 'quote'; lines: string[] }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'p'; lines: string[] };

const parseBlocks = (body: string): Block[] => {
    const lines = body.split('\n');
    const blocks: Block[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trimStart().startsWith('```')) {
            const content: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
                content.push(lines[i]);
                i++;
            }
            i++; // consume the closing fence (absent at end of message is fine)
            blocks.push({ type: 'code', content: content.join('\n') });
            continue;
        }

        if (/^\s*>\s?/.test(line)) {
            const quoted: string[] = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                quoted.push(lines[i].replace(/^\s*>\s?/, ''));
                i++;
            }
            blocks.push({ type: 'quote', lines: quoted });
            continue;
        }

        if (/^\s*[-*+]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ul', items });
            continue;
        }

        if (/^\s*\d+[.)]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ol', items });
            continue;
        }

        const paragraph: string[] = [];
        while (
            i < lines.length &&
            !lines[i].trimStart().startsWith('```') &&
            !/^\s*>\s?/.test(lines[i]) &&
            !/^\s*[-*+]\s+/.test(lines[i]) &&
            !/^\s*\d+[.)]\s+/.test(lines[i])
        ) {
            paragraph.push(lines[i]);
            i++;
        }
        if (paragraph.length > 0) blocks.push({ type: 'p', lines: paragraph });
    }
    return blocks;
};

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

export const renderMarkdown = (
    body: string,
    opts: MarkdownRenderOptions
): React.ReactNode => {
    const mentionRegex = buildMentionRegex(opts.mentionNames || []);
    const blocks = parseBlocks(body);
    const inline = (text: string) => renderInline(text, mentionRegex, opts);

    return blocks.map((block, idx) => {
        switch (block.type) {
            case 'code':
                return (
                    <pre
                        key={idx}
                        className={`my-1.5 overflow-x-auto rounded-lg p-2.5 font-mono text-[11px] leading-relaxed ${
                            opts.isUser
                                ? 'bg-emerald-950/50 text-emerald-50'
                                : 'bg-slate-800 text-slate-100'
                        }`}
                    >
                        <code>{block.content}</code>
                    </pre>
                );
            case 'quote':
                return (
                    <blockquote
                        key={idx}
                        className={`my-1.5 border-l-2 pl-2.5 italic ${
                            opts.isUser
                                ? 'border-emerald-400/60 text-emerald-50/90'
                                : 'border-slate-300 text-slate-600'
                        }`}
                    >
                        {block.lines.map((l, li) => (
                            <div key={li}>{inline(l)}</div>
                        ))}
                    </blockquote>
                );
            case 'ul':
                return (
                    <ul key={idx} className="my-1.5 list-disc space-y-0.5 pl-4">
                        {block.items.map((item, li) => (
                            <li key={li}>{inline(item)}</li>
                        ))}
                    </ul>
                );
            case 'ol':
                return (
                    <ol key={idx} className="my-1.5 list-decimal space-y-0.5 pl-4">
                        {block.items.map((item, li) => (
                            <li key={li}>{inline(item)}</li>
                        ))}
                    </ol>
                );
            case 'p':
            default:
                return (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                        {inline(block.lines.join('\n'))}
                    </div>
                );
        }
    });
};

/**
 * Legacy bodies predate the markdown composer and contain raw * and _ that were
 * never meant as syntax. They get links and mentions only.
 */
export const renderPlaintext = (
    body: string,
    opts: MarkdownRenderOptions
): React.ReactNode => {
    const mentionRegex = buildMentionRegex(opts.mentionNames || []);
    return (
        <div className="whitespace-pre-wrap leading-relaxed">
            {renderInline(body, mentionRegex, opts)}
        </div>
    );
};

/** Extracts URLs for link-preview cards, deduplicated, in first-seen order. */
export const extractUrls = (body: string): string[] => {
    const withoutCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    const matches = withoutCode.match(/https?:\/\/[^\s,)<>]+/g) || [];
    return Array.from(new Set(matches));
};

/** Resolves @tokens against the known member list for persistence and email. */
export const extractMentions = (
    body: string,
    members: Array<{ name: string; email: string }>
): Array<{ name: string; email: string }> => {
    const mentionRegex = new RegExp(buildMentionRegex(members.map(m => m.name)).source, 'gu');
    const found = new Map<string, { name: string; email: string }>();
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(body)) !== null) {
        const token = match[1];
        const member = members.find(m => m.name.toLowerCase() === token.toLowerCase());
        if (member) found.set(member.email, { name: member.name, email: member.email });
    }
    return Array.from(found.values());
};
