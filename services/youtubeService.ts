import { extractVideoId } from '../utils/timeHelper';

const YT_API_KEY = "AIzaSyA30cT-T7yF6o-To4nAQzfg8mG750ihhgI";

export interface YouTubeVideoInfo {
    title?: string;
    publishedAt?: string; // YYYY-MM-DD
    channelTitle?: string;
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
