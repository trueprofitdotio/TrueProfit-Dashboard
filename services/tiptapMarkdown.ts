/**
 * Serializes a Tiptap document to the same markdown subset that
 * services/messageMarkdown.tsx renders.
 *
 * The composer shows real formatting, but the wire format stays markdown text
 * in `body`. That keeps one storage shape for old and new messages, keeps the
 * column searchable, and keeps the notification email readable.
 */

interface Node {
    type?: string;
    text?: string;
    content?: Node[];
    marks?: Array<{ type: string }>;
    attrs?: Record<string, any>;
}

const MARK_DELIMITERS: Record<string, string> = {
    bold: '**',
    italic: '*',
    strike: '~~'
};

const serializeText = (node: Node): string => {
    const text = node.text ?? '';
    if (!text) return '';
    const marks = (node.marks || []).map(m => m.type);

    // Code is exclusive: markdown has no way to nest emphasis inside a code
    // span, and the renderer treats the span's contents as literal anyway.
    if (marks.includes('code')) return `\`${text}\``;

    // Whitespace must sit outside the delimiters or "**bold **" fails to parse.
    const leading = text.match(/^\s*/)?.[0] ?? '';
    const trailing = text.match(/\s*$/)?.[0] ?? '';
    const core = text.slice(leading.length, text.length - trailing.length);
    if (!core) return text;

    let out = core;
    for (const mark of ['bold', 'italic', 'strike']) {
        if (marks.includes(mark)) {
            const d = MARK_DELIMITERS[mark];
            out = `${d}${out}${d}`;
        }
    }
    return leading + out + trailing;
};

const serializeInline = (nodes: Node[] = []): string =>
    nodes
        .map(node => {
            if (node.type === 'text') return serializeText(node);
            if (node.type === 'hardBreak') return '\n';
            if (node.content) return serializeInline(node.content);
            return '';
        })
        .join('');

const prefixLines = (text: string, prefix: string): string =>
    text.split('\n').map(line => prefix + line).join('\n');

const serializeBlocks = (nodes: Node[] = []): string[] => {
    const out: string[] = [];

    for (const node of nodes) {
        switch (node.type) {
            case 'paragraph':
                out.push(serializeInline(node.content));
                break;

            case 'heading':
                // Headings are not in the render subset; keep the text.
                out.push(serializeInline(node.content));
                break;

            case 'bulletList':
                for (const item of node.content || []) {
                    const inner = serializeBlocks(item.content).join('\n');
                    out.push(prefixLines(inner, '- '));
                }
                break;

            case 'orderedList': {
                let n = Number(node.attrs?.start ?? 1);
                for (const item of node.content || []) {
                    const inner = serializeBlocks(item.content).join('\n');
                    out.push(prefixLines(inner, `${n}. `));
                    n++;
                }
                break;
            }

            case 'blockquote':
                out.push(prefixLines(serializeBlocks(node.content).join('\n'), '> '));
                break;

            case 'codeBlock':
                out.push('```\n' + serializeInline(node.content) + '\n```');
                break;

            default:
                if (node.content) out.push(...serializeBlocks(node.content));
                break;
        }
    }
    return out;
};

export const tiptapToMarkdown = (doc: Node | null | undefined): string => {
    if (!doc?.content) return '';
    // Single newline between blocks: the renderer keeps hard line breaks via
    // whitespace-pre-wrap, so a blank line would double the visible spacing.
    return serializeBlocks(doc.content).join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
