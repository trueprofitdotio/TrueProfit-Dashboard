import { supabaseClient } from './supabaseClient';

export const DISCUSSION_BUCKET = 'discussion-attachments';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // keep in sync with the bucket's file_size_limit
export const ACCEPTED_MIME_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf'
];

/**
 * Stored on the message row, not in storage. `path` is the object key -- never
 * a URL, because the bucket is private and every URL we hand out expires.
 */
export interface DiscussionAttachment {
    path: string;
    name: string;
    mime: string;
    size: number;
    width?: number;
    height?: number;
}

export const isImageAttachment = (a: DiscussionAttachment): boolean =>
    typeof a.mime === 'string' && a.mime.startsWith('image/');

const extensionFor = (file: File): string => {
    const fromName = file.name.includes('.') ? file.name.split('.').pop() : '';
    if (fromName && fromName.length <= 5) return fromName.toLowerCase();
    const fromMime = file.type.split('/')[1];
    return (fromMime || 'bin').toLowerCase();
};

/**
 * Clipboard screenshots arrive as a blob named "image.png" (or nothing at all),
 * which is useless in a file list. Give them something a human can scan.
 */
export const displayNameFor = (file: File): string => {
    const generic = !file.name || file.name === 'image.png' || file.name === 'blob';
    if (!generic) return file.name;
    const stamp = new Date().toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return `Screenshot ${stamp}.${extensionFor(file)}`;
};

export const validateAttachment = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        return `${file.name || 'File'}: ${file.type || 'unknown type'} is not supported. Allowed: PNG, JPEG, GIF, WebP, PDF.`;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        return `${file.name || 'File'} is ${mb} MB, over the 10 MB limit.`;
    }
    return null;
};

/**
 * Read intrinsic dimensions so the message bubble can reserve the right amount
 * of space before the signed URL resolves. Without this the feed jumps as each
 * image loads.
 */
const probeImageSize = (file: File): Promise<{ width?: number; height?: number }> =>
    new Promise(resolve => {
        if (!file.type.startsWith('image/')) return resolve({});
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve({});
        };
        img.src = objectUrl;
    });

const randomId = (): string => {
    const c: any = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Uploads one file and returns the descriptor to store on the message.
 * Throws with a readable message -- the caller surfaces it in the composer.
 */
export const uploadDiscussionAttachment = async (
    file: File,
    threadId: string
): Promise<DiscussionAttachment> => {
    const validationError = validateAttachment(file);
    if (validationError) throw new Error(validationError);

    const dimensions = await probeImageSize(file);
    const path = `${threadId}/${randomId()}.${extensionFor(file)}`;

    const { error } = await supabaseClient.storage
        .from(DISCUSSION_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
        throw new Error(`Upload failed for ${file.name || 'file'}: ${error.message}`);
    }

    return {
        path,
        name: displayNameFor(file),
        mime: file.type,
        size: file.size,
        ...dimensions
    };
};

export const removeDiscussionAttachment = async (path: string): Promise<void> => {
    const { error } = await supabaseClient.storage.from(DISCUSSION_BUCKET).remove([path]);
    if (error) console.error('Failed to remove attachment', path, error);
};

// --------------------------------------------------------------------------
// Signed URL cache
// --------------------------------------------------------------------------

const SIGNED_URL_TTL_SECONDS = 60 * 60;
// Re-sign a few minutes early so a URL never expires mid-view.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Signs a batch of paths in one request. Batching matters: a thread with twenty
 * screenshots would otherwise fire twenty round trips on open.
 */
export const getSignedUrls = async (paths: string[]): Promise<Map<string, string>> => {
    const now = Date.now();
    const result = new Map<string, string>();
    const needed: string[] = [];

    for (const path of Array.from(new Set(paths))) {
        const cached = signedUrlCache.get(path);
        if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now) {
            result.set(path, cached.url);
        } else {
            needed.push(path);
        }
    }

    if (needed.length === 0) return result;

    const { data, error } = await supabaseClient.storage
        .from(DISCUSSION_BUCKET)
        .createSignedUrls(needed, SIGNED_URL_TTL_SECONDS);

    if (error) {
        console.error('Failed to sign attachment URLs', error);
        return result;
    }

    for (const entry of data || []) {
        if (entry?.signedUrl && entry?.path) {
            signedUrlCache.set(entry.path, {
                url: entry.signedUrl,
                expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000
            });
            result.set(entry.path, entry.signedUrl);
        }
    }
    return result;
};

/** Single-path variant that de-duplicates concurrent requests for the same key. */
export const getSignedUrl = async (path: string): Promise<string | null> => {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) return cached.url;

    const existing = inFlight.get(path);
    if (existing) return existing;

    const request = getSignedUrls([path])
        .then(map => map.get(path) ?? null)
        .finally(() => inFlight.delete(path));

    inFlight.set(path, request);
    return request;
};

export const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Normalizes the jsonb column, which may arrive as an array, a JSON string, or null. */
export const parseAttachments = (raw: unknown): DiscussionAttachment[] => {
    if (!raw) return [];
    let value = raw;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(value)) return [];
    return value.filter(
        (a: any): a is DiscussionAttachment => a && typeof a.path === 'string'
    );
};
