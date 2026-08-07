import { extractVideoId } from '../utils/timeHelper';

const YT_API_KEY = "AIzaSyA30cT-T7yF6o-To4nAQzfg8mG750ihhgI";

export interface YouTubeVideoInfo {
    title?: string;
    publishedAt?: string; // YYYY-MM-DD
    channelTitle?: string;
}

export interface YouTubeChannelInfo {
    channelId: string;
    title: string;
    description?: string;
    customUrl?: string;
    avatarUrl?: string;
    subscriberCount?: string;
    country?: string;
    channelLink?: string;
}

/**
 * Extract YouTube video ID from URL
 */
export const getYouTubeVideoId = (url: string): string | null => {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/(?:v=|\/|embed\/|youtu\.be\/)([\w-]{11})(?=&|\?|$)/);
    return match ? match[1] : null;
};

/**
 * Fetch video release date and title from YouTube Data API v3
 */
export const fetchYouTubeVideoDetails = async (videoUrl: string): Promise<YouTubeVideoInfo | null> => {
    const videoId = getYouTubeVideoId(videoUrl);
    if (!videoId) return null;

    try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
        const response = await fetch(apiUrl);
        if (!response.ok) return null;

        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const snippet = data.items[0].snippet;
            const publishedAt = snippet.publishedAt ? snippet.publishedAt.split('T')[0] : undefined;
            return {
                title: snippet.title,
                publishedAt: publishedAt,
                channelTitle: snippet.channelTitle
            };
        }
    } catch (e) {
        console.error('Failed to fetch YouTube video details:', e);
    }
    return null;
};

/**
 * Fetch YouTube Channel metadata (title, avatar, subscribers, country) from URL or Handle
 */
export const fetchYouTubeChannelDetails = async (urlOrHandle: string): Promise<YouTubeChannelInfo | null> => {
    if (!urlOrHandle || !urlOrHandle.trim()) return null;
    const input = urlOrHandle.trim();
    
    // Extract handle or channel ID
    const handleMatch = input.match(/@([\w.-]+)/);
    const channelIdMatch = input.match(/channel\/(UC[\w-]{22})/);
    
    try {
        let apiUrl = '';
        if (handleMatch) {
            const handle = handleMatch[1];
            apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}&key=${YT_API_KEY}`;
        } else if (channelIdMatch) {
            const channelId = channelIdMatch[1];
            apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YT_API_KEY}`;
        } else {
            const cleanQuery = input.replace(/^https?:\/\/(www\.)?youtube\.com\/(c\/|user\/)?/, '');
            apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(cleanQuery)}&key=${YT_API_KEY}`;
        }

        let res = await fetch(apiUrl);
        let data = await res.json();
        
        if (!data.items || data.items.length === 0) {
            const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(input)}&key=${YT_API_KEY}`;
            const sRes = await fetch(searchUrl);
            const sData = await sRes.json();
            if (sData.items && sData.items.length > 0) {
                const cId = sData.items[0].snippet.channelId;
                const cRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${cId}&key=${YT_API_KEY}`);
                data = await cRes.json();
            }
        }

        if (data.items && data.items.length > 0) {
            const item = data.items[0];
            const snippet = item.snippet || {};
            const stats = item.statistics || {};
            const avatarUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;
            const handle = snippet.customUrl || (handleMatch ? `@${handleMatch[1]}` : '');
            
            return {
                channelId: item.id,
                title: snippet.title || '',
                description: snippet.description || '',
                customUrl: handle,
                avatarUrl: avatarUrl,
                subscriberCount: stats.subscriberCount || '0',
                country: snippet.country || 'United States',
                channelLink: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${item.id}`
            };
        }
    } catch (e) {
        console.error('Failed to fetch channel details:', e);
    }
    return null;
};
