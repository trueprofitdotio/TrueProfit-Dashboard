import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Download, X, Loader2, AlertCircle, ImageOff } from 'lucide-react';
import {
    DiscussionAttachment,
    getSignedUrls,
    isImageAttachment,
    formatFileSize
} from '../services/discussionAttachments';

/**
 * Resolves signed URLs for a set of attachments in one batched request and
 * re-signs when they approach expiry. The bucket is private, so nothing renders
 * until a URL comes back.
 */
const useSignedUrls = (attachments: DiscussionAttachment[]) => {
    const [urls, setUrls] = useState<Map<string, string>>(new Map());
    const [failed, setFailed] = useState(false);

    const pathKey = useMemo(
        () => attachments.map(a => a.path).sort().join('|'),
        [attachments]
    );

    useEffect(() => {
        let active = true;
        if (attachments.length === 0) return;

        getSignedUrls(attachments.map(a => a.path))
            .then(map => {
                if (!active) return;
                setUrls(map);
                setFailed(map.size < attachments.length);
            })
            .catch(() => active && setFailed(true));

        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathKey]);

    return { urls, failed };
};

// --------------------------------------------------------------------------
// Lightbox
// --------------------------------------------------------------------------

const Lightbox: React.FC<{ url: string; name: string; onClose: () => void }> = ({
    url, name, onClose
}) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <div
            className="fixed inset-0 z-[1000000] flex items-center justify-center bg-black/80 p-8 animate-in fade-in duration-150"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="Close image"
            >
                <X className="h-4 w-4" />
            </button>
            <figure className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
                <img src={url} alt={name} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl" />
                <figcaption className="flex items-center gap-3 text-xs text-white/70">
                    <span className="truncate max-w-[400px]">{name}</span>
                    <a
                        href={url}
                        download={name}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 font-medium text-white transition-colors hover:bg-white/20"
                    >
                        <Download className="h-3 w-3" />
                        <span>Download</span>
                    </a>
                </figcaption>
            </figure>
        </div>,
        document.body
    );
};

// --------------------------------------------------------------------------
// Message bubble attachments
// --------------------------------------------------------------------------

export const AttachmentGrid: React.FC<{
    attachments: DiscussionAttachment[];
    isUser: boolean;
}> = ({ attachments, isUser }) => {
    const { urls, failed } = useSignedUrls(attachments);
    const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

    if (attachments.length === 0) return null;

    const images = attachments.filter(isImageAttachment);
    const files = attachments.filter(a => !isImageAttachment(a));

    return (
        <div className="mt-2 space-y-1.5">
            {images.length > 0 && (
                <div className={`grid gap-1.5 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {images.map(att => {
                        const url = urls.get(att.path);
                        // Reserve the real aspect ratio so the feed does not
                        // reflow when the image finally paints.
                        const ratio = att.width && att.height ? att.width / att.height : 4 / 3;
                        return (
                            <button
                                key={att.path}
                                type="button"
                                onClick={() => url && setLightbox({ url, name: att.name })}
                                disabled={!url}
                                style={{ aspectRatio: String(ratio) }}
                                className={`group relative w-full overflow-hidden rounded-lg border transition-all ${
                                    isUser ? 'border-emerald-500/30 bg-emerald-950/30' : 'border-[#d2e3dc] bg-white'
                                } ${url ? 'cursor-zoom-in hover:opacity-90' : 'cursor-default'}`}
                                title={url ? `${att.name} — click to enlarge` : att.name}
                            >
                                {url ? (
                                    <img src={url} alt={att.name} loading="lazy" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center">
                                        {failed
                                            ? <ImageOff className="h-5 w-5 text-slate-400" />
                                            : <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {files.map(att => {
                const url = urls.get(att.path);
                return (
                    <a
                        key={att.path}
                        href={url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => { e.stopPropagation(); if (!url) e.preventDefault(); }}
                        className={`flex items-center gap-2.5 rounded-lg border p-2 transition-colors ${
                            isUser
                                ? 'border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-950/60'
                                : 'border-[#d2e3dc] bg-white hover:bg-slate-50'
                        } ${url ? '' : 'pointer-events-none opacity-60'}`}
                    >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isUser ? 'bg-emerald-800/60 text-emerald-100' : 'bg-slate-100 text-slate-500'
                        }`}>
                            <FileText className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[11px] font-semibold ${isUser ? 'text-white' : 'text-slate-800'}`}>
                                {att.name}
                            </span>
                            <span className={`block text-[10px] ${isUser ? 'text-emerald-200' : 'text-slate-400'}`}>
                                {formatFileSize(att.size)}
                            </span>
                        </span>
                        <Download className={`h-3.5 w-3.5 shrink-0 ${isUser ? 'text-emerald-200' : 'text-slate-400'}`} />
                    </a>
                );
            })}

            {failed && (
                <p className={`flex items-center gap-1 text-[10px] ${isUser ? 'text-emerald-200' : 'text-slate-400'}`}>
                    <AlertCircle className="h-3 w-3" />
                    <span>Some attachments could not be loaded.</span>
                </p>
            )}

            {lightbox && (
                <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />
            )}
        </div>
    );
};

// --------------------------------------------------------------------------
// Composer staging area
// --------------------------------------------------------------------------

export interface PendingAttachment {
    localId: string;
    file: File;
    previewUrl: string | null;
    status: 'uploading' | 'done' | 'error';
    error?: string;
    uploaded?: DiscussionAttachment;
}

export const PendingAttachmentStrip: React.FC<{
    pending: PendingAttachment[];
    onRemove: (localId: string) => void;
}> = ({ pending, onRemove }) => {
    if (pending.length === 0) return null;

    return (
        <div className="mb-2 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
            {pending.map(item => (
                <div
                    key={item.localId}
                    className={`relative flex items-center gap-2 rounded-lg border bg-white p-1.5 pr-7 shadow-2xs ${
                        item.status === 'error' ? 'border-rose-300' : 'border-slate-200'
                    }`}
                    title={item.error || item.file.name}
                >
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
                        {item.previewUrl
                            ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                            : <FileText className="h-4 w-4 text-slate-400" />}
                        {item.status === 'uploading' && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />
                            </span>
                        )}
                    </span>
                    <span className="min-w-0 max-w-[140px]">
                        <span className="block truncate text-[11px] font-semibold text-slate-700">
                            {item.file.name}
                        </span>
                        <span className={`block text-[10px] ${item.status === 'error' ? 'text-rose-600' : 'text-slate-400'}`}>
                            {item.status === 'error'
                                ? 'Failed'
                                : item.status === 'uploading'
                                    ? 'Uploading…'
                                    : formatFileSize(item.file.size)}
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={() => onRemove(item.localId)}
                        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-600 transition-colors hover:bg-rose-500 hover:text-white"
                        aria-label={`Remove ${item.file.name}`}
                    >
                        <X className="h-2.5 w-2.5" />
                    </button>
                </div>
            ))}
        </div>
    );
};
