import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Download, X, Loader2, AlertCircle, ImageOff, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
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
export const useSignedUrls = (attachments: DiscussionAttachment[]) => {
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

export interface LightboxItem { url: string; name: string }

export const Lightbox: React.FC<{
    items: LightboxItem[];
    index: number;
    onIndexChange: (next: number) => void;
    onClose: () => void;
}> = ({ items, index, onIndexChange, onClose }) => {
    const count = items.length;
    const current = items[index];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight' && count > 1) onIndexChange((index + 1) % count);
            if (e.key === 'ArrowLeft' && count > 1) onIndexChange((index - 1 + count) % count);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, onIndexChange, index, count]);

    if (!current) return null;

    const navClass = "absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25";

    return createPortal(
        <div
            className="fixed inset-0 z-[1000000] flex items-center justify-center bg-[#0d1211]/88 p-8 animate-in fade-in duration-150"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={current.name}
        >
            <button
                onClick={onClose}
                className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
                aria-label="Close image"
            >
                <X className="h-4 w-4" />
            </button>

            {count > 1 && (
                <>
                    <button
                        onClick={e => { e.stopPropagation(); onIndexChange((index - 1 + count) % count); }}
                        className={`${navClass} left-5`}
                        aria-label="Previous image"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onIndexChange((index + 1) % count); }}
                        className={`${navClass} right-5`}
                        aria-label="Next image"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </>
            )}

            <figure className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
                <img src={current.url} alt={current.name} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
                <figcaption className="flex items-center gap-3 text-xs text-white/75">
                    {count > 1 && <span className="tabular-nums text-white/55">{index + 1} / {count}</span>}
                    <span className="max-w-[400px] truncate">{current.name}</span>
                    <a
                        href={current.url}
                        download={current.name}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 font-medium text-white transition-colors hover:bg-white/25"
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

// A single image keeps its own proportion, but only within a range: a very tall
// screenshot would otherwise own the whole feed, and a panorama would collapse
// to a sliver. Multi-image albums use square tiles so every bubble in the
// column shares one silhouette regardless of what was attached.
const clampRatio = (att: DiscussionAttachment) => {
    const natural = att.width && att.height ? att.width / att.height : 4 / 3;
    return Math.min(Math.max(natural, 0.8), 1.78);
};

const MAX_TILES = 4;

export const AttachmentGrid: React.FC<{
    attachments: DiscussionAttachment[];
    isUser: boolean;
}> = ({ attachments, isUser }) => {
    const { urls, failed } = useSignedUrls(attachments);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    if (attachments.length === 0) return null;

    const images = attachments.filter(isImageAttachment);
    const files = attachments.filter(a => !isImageAttachment(a));

    // The lightbox always walks the full set, including tiles folded behind "+N".
    const lightboxItems = images
        .map(att => ({ url: urls.get(att.path), name: att.name }))
        .filter((i): i is LightboxItem => Boolean(i.url));

    const visible = images.slice(0, MAX_TILES);
    const hidden = images.length - visible.length;

    return (
        <div className="mt-2 space-y-1.5">
            {images.length > 0 && (
                <div className={`tp-album tp-album-${Math.min(images.length, MAX_TILES)}`}>
                    {visible.map((att, i) => {
                        const url = urls.get(att.path);
                        const isLast = i === visible.length - 1;
                        const showMore = hidden > 0 && isLast;
                        // Square tiles for an album; a lone image keeps a
                        // bounded version of its own proportion.
                        const aspectRatio = images.length === 1 ? String(clampRatio(att)) : '1';

                        return (
                            <button
                                key={att.path}
                                type="button"
                                onClick={() => {
                                    if (!url) return;
                                    const idx = lightboxItems.findIndex(item => item.url === url);
                                    setLightboxIndex(idx >= 0 ? idx : 0);
                                }}
                                disabled={!url}
                                data-interactive={url ? 'true' : 'false'}
                                style={{ aspectRatio }}
                                className={`tp-album-tile ${isUser ? 'tp-album-tile-on-accent' : ''}`}
                                title={url ? `${att.name} — click to enlarge` : att.name}
                            >
                                {url ? (
                                    <img src={url} alt={att.name} loading="lazy" />
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center">
                                        {failed
                                            ? <ImageOff className={`h-5 w-5 ${isUser ? "" : "text-[var(--tp-faint)]"}`} />
                                            : <Loader2 className={`h-4 w-4 animate-spin ${isUser ? "" : "text-[var(--tp-faint)]"}`} />}
                                    </span>
                                )}
                                {showMore && <span className="tp-album-tile-more">+{hidden}</span>}
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
                        className={`flex items-center gap-2.5 rounded-[7px] border p-2 transition-colors ${
                            isUser
                                ? 'border-white/20 bg-white/10 hover:bg-white/20'
                                : 'border-[var(--tp-rule)] bg-[var(--tp-surface-sunken)] hover:bg-[var(--tp-surface-hover)]'
                        } ${url ? '' : 'pointer-events-none opacity-60'}`}
                    >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] ${
                            isUser ? 'bg-white/15 text-white' : 'bg-[var(--tp-surface)] text-[var(--tp-muted)] border border-[var(--tp-rule)]'
                        }`}>
                            <FileText className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[11.5px] font-semibold ${isUser ? 'text-white' : 'text-[var(--tp-ink)]'}`}>
                                {att.name}
                            </span>
                            <span className={`block text-[11px] tabular-nums ${isUser ? 'text-white/70' : 'text-[var(--tp-meta)]'}`}>
                                {formatFileSize(att.size)}
                            </span>
                        </span>
                        <Download className={`h-3.5 w-3.5 shrink-0 ${isUser ? 'text-white/70' : 'text-[var(--tp-faint)]'}`} />
                    </a>
                );
            })}

            {failed && (
                <p className={`flex items-center gap-1 text-[11px] ${isUser ? 'text-white/75' : 'text-[var(--tp-meta)]'}`}>
                    <AlertCircle className="h-3 w-3" />
                    <span>Some attachments could not be loaded.</span>
                </p>
            )}

            {lightboxIndex !== null && lightboxItems.length > 0 && (
                <Lightbox
                    items={lightboxItems}
                    index={Math.min(lightboxIndex, lightboxItems.length - 1)}
                    onIndexChange={setLightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </div>
    );
};

// --------------------------------------------------------------------------
// Thread screenshot rail
// --------------------------------------------------------------------------

/**
 * Every image in the thread, collected into one strip pinned above the
 * composer. Scrolling back through the feed to find a screenshot someone
 * posted twenty messages ago is the thing this removes.
 *
 * Keyboard: the rail is a single tab stop with roving focus — Left/Right move
 * between thumbs, Enter or Space opens the lightbox, which then continues to
 * take Left/Right for the rest of the set.
 */
export const ThreadImageRail: React.FC<{
    attachments: DiscussionAttachment[];
}> = ({ attachments }) => {
    const images = useMemo(() => attachments.filter(isImageAttachment), [attachments]);
    const { urls, failed } = useSignedUrls(images);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [focusIndex, setFocusIndex] = useState(0);
    const railRef = useRef<HTMLDivElement>(null);

    // Only images whose URL has resolved can be opened, so the rail and the
    // lightbox must walk the same list or the indexes drift apart.
    const openable = useMemo(
        () => images
            .map(att => ({ url: urls.get(att.path), name: att.name }))
            .filter((i): i is LightboxItem => Boolean(i.url)),
        [images, urls]
    );

    useEffect(() => {
        if (focusIndex > images.length - 1) setFocusIndex(Math.max(0, images.length - 1));
    }, [images.length, focusIndex]);

    if (images.length === 0) return null;

    // The bucket only signs for an internal account. When nothing resolves,
    // say so once instead of parking a row of spinners that never land.
    if (failed && openable.length === 0) {
        return (
            <div className="tp-rail" role="group" aria-label="Screenshots in this discussion">
                <span className="tp-rail-label">
                    <ImageIcon className="h-3 w-3 shrink-0" strokeWidth={2} />
                    <span>Screenshots</span>
                    <span className="tp-rail-count tabular-nums">{images.length}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--tp-meta)]">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate">Sign in with a @firegroup.io account to view these.</span>
                </span>
            </div>
        );
    }

    const open = (i: number) => {
        const url = urls.get(images[i]?.path);
        if (!url) return;
        const idx = openable.findIndex(item => item.url === url);
        setLightboxIndex(idx >= 0 ? idx : 0);
    };

    const moveFocus = (next: number) => {
        const clamped = (next + images.length) % images.length;
        setFocusIndex(clamped);
        const el = railRef.current?.querySelectorAll<HTMLButtonElement>('[data-rail-thumb]')[clamped];
        el?.focus();
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); moveFocus(focusIndex + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(focusIndex - 1); }
        if (e.key === 'Home') { e.preventDefault(); moveFocus(0); }
        if (e.key === 'End') { e.preventDefault(); moveFocus(images.length - 1); }
    };

    return (
        <div className="tp-rail" role="group" aria-label={`${images.length} screenshots in this discussion`}>
            <span className="tp-rail-label">
                <ImageIcon className="h-3 w-3 shrink-0" strokeWidth={2} />
                <span>Screenshots</span>
                <span className="tp-rail-count tabular-nums">{images.length}</span>
            </span>

            <div className="tp-rail-track" ref={railRef} onKeyDown={onKeyDown}>
                {images.map((att, i) => {
                    const url = urls.get(att.path);
                    return (
                        <button
                            key={att.path}
                            type="button"
                            data-rail-thumb
                            tabIndex={i === focusIndex ? 0 : -1}
                            onFocus={() => setFocusIndex(i)}
                            onClick={() => open(i)}
                            disabled={!url}
                            className="tp-rail-thumb"
                            title={url ? `${att.name} — click to enlarge` : att.name}
                            aria-label={`Open ${att.name}`}
                        >
                            {url
                                ? <img src={url} alt="" loading="lazy" />
                                : <Loader2 className="h-3 w-3 animate-spin text-[var(--tp-faint)]" />}
                        </button>
                    );
                })}
            </div>

            {lightboxIndex !== null && openable.length > 0 && (
                <Lightbox
                    items={openable}
                    index={Math.min(lightboxIndex, openable.length - 1)}
                    onIndexChange={setLightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
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
        <div className="mb-2 flex flex-wrap gap-2 rounded-[9px] border border-[var(--tp-rule)] bg-[var(--tp-surface-sunken)] p-2">
            {pending.map(item => (
                <div
                    key={item.localId}
                    className={`relative flex items-center gap-2 rounded-[7px] border bg-[var(--tp-surface)] p-1.5 pr-7 ${
                        item.status === 'error' ? 'border-[var(--tp-danger-rule)]' : 'border-[var(--tp-rule-strong)]'
                    }`}
                    title={item.error || item.file.name}
                >
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-[var(--tp-surface-sunken)]">
                        {item.previewUrl
                            ? <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                            : <FileText className="h-4 w-4 text-[var(--tp-faint)]" />}
                        {item.status === 'uploading' && (
                            <span className="absolute inset-0 flex items-center justify-center bg-white/75">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--tp-muted)]" />
                            </span>
                        )}
                    </span>
                    <span className="min-w-0 max-w-[140px]">
                        <span className="block truncate text-[11.5px] font-semibold text-[var(--tp-ink)]">
                            {item.file.name}
                        </span>
                        <span className={`block text-[11px] tabular-nums ${item.status === 'error' ? 'text-[var(--tp-danger)]' : 'text-[var(--tp-meta)]'}`}>
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
                        className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--tp-surface-hover)] text-[var(--tp-muted)] transition-colors hover:bg-[var(--tp-danger)] hover:text-white"
                        aria-label={`Remove ${item.file.name}`}
                    >
                        <X className="h-2.5 w-2.5" />
                    </button>
                </div>
            ))}
        </div>
    );
};
