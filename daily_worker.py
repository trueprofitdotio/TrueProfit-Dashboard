import os
import re
import requests
import yt_dlp
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

# --- ENVIRONMENT & CONFIGURATION ---
DEFAULT_SUPABASE_URL = "https://wpzigasfuizrabqqzxln.supabase.co"
DEFAULT_SUPABASE_KEY = "sb_publishable_pmVTsi7Ja776fvYKBacBUA_0YwFIVv6"

raw_url = (os.environ.get("SUPABASE_URL") or "").strip()
SUPABASE_URL = raw_url if raw_url else DEFAULT_SUPABASE_URL

raw_key = (os.environ.get("SUPABASE_KEY") or "").strip()
SUPABASE_KEY = raw_key if raw_key else DEFAULT_SUPABASE_KEY

# YouTube API Key pool - auto-rotates on 403 quota limits
YOUTUBE_API_KEYS = [
    "AIzaSyA30cT-T7yF6o-To4nAQzfg8mG750ihhgI",
    os.environ.get("YOUTUBE_API_KEY", "AIzaSyChr_rRRYlsH9_wfY8JB1UJ30fPDMBtp0c"),
    "AIzaSyAHFSLQGngrIVVMw2ERmyuOhCuJLhtM5jc",
    "AIzaSyDiyxt3nc4qdSx7OtsOIkKCU7S94_uWiUc",
]
_yt_key_index = 0

def get_yt_api_key() -> str:
    """Returns current active YouTube API Key."""
    return YOUTUBE_API_KEYS[_yt_key_index % len(YOUTUBE_API_KEYS)]

def rotate_yt_api_key() -> str:
    """Rotates to next API key upon encountering 403 quota error."""
    global _yt_key_index
    _yt_key_index += 1
    new_key = get_yt_api_key()
    print(f"   🔄 Rotated to YouTube API key #{(_yt_key_index % len(YOUTUBE_API_KEYS)) + 1}")
    return new_key

def get_hanoi_time():
    """Returns current datetime in Hanoi / GMT+7 timezone."""
    tz_vn = timezone(timedelta(hours=7))
    return datetime.now(tz_vn)

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Tracking failed video IDs during API calls
failsafe_video_ids: set = set()

# --- HELPER FUNCTIONS ---
def extract_video_id(url: str) -> str | None:
    """Extracts 11-char YouTube Video ID from various URL formats."""
    if not isinstance(url, str): return None
    match = re.search(r'(?:v=|/|embed/|shorts/|youtu\.be/)([\w-]{11})(?=&|\?|$)', url)
    return match.group(1) if match else None

def extract_canonical_id(url: str) -> str | None:
    """Extracts canonical platform-native ID (e.g. yt_video_id)."""
    if not isinstance(url, str): return None
    
    yt_id = extract_video_id(url)
    if yt_id: return f"yt_{yt_id}"
    
    tt_match = re.search(r'tiktok\.com/.*video/(\d+)', url)
    if tt_match: return f"tt_{tt_match.group(1)}"
    
    x_match = re.search(r'(?:twitter\.com|x\.com)/.*/status/(\d+)', url)
    if x_match: return f"x_{x_match.group(1)}"
    
    ig_match = re.search(r'instagram\.com/(?:reels?|p|reel)/([^/?#&]+)', url)
    if ig_match: return f"ig_{ig_match.group(1)}"
    
    return None

def fetch_youtube_video_details_batch(yt_ids: list[str]) -> dict:
    """
    Batch fetches YouTube video metadata (snippet & statistics) for up to 50 IDs.
    Returns dict mapping yt_id -> video_info dict.
    """
    if not yt_ids: return {}
    ids_str = ",".join(yt_ids[:50])
    
    tried_keys = 0
    while tried_keys < len(YOUTUBE_API_KEYS):
        api_key = get_yt_api_key()
        try:
            url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,status&id={ids_str}&key={api_key}"
            resp = requests.get(url, timeout=15)
            if resp.status_code == 403:
                rotate_yt_api_key()
                tried_keys += 1
                continue
            if resp.status_code == 200:
                data = resp.json()
                result = {}
                for item in data.get('items', []):
                    vid = item['id']
                    snippet = item.get('snippet', {})
                    stats = item.get('statistics', {})
                    status_obj = item.get('status', {})
                    result[vid] = {
                        'title': snippet.get('title', ''),
                        'publishedAt': snippet.get('publishedAt', '').split('T')[0],
                        'channelId': snippet.get('channelId', ''),
                        'channelTitle': snippet.get('channelTitle', ''),
                        'viewCount': int(stats.get('viewCount', 0)),
                        'likeCount': int(stats.get('likeCount', 0)),
                        'commentCount': int(stats.get('commentCount', 0)),
                        'privacyStatus': status_obj.get('privacyStatus', 'public')
                    }
                return result
            else:
                print(f"   [!] YouTube API Error HTTP {resp.status_code}")
                break
        except Exception as e:
            print(f"   [!] YouTube API Request Exception: {e}")
            break
            
    return {}

def fetch_youtube_channel_info(channel_id: str) -> dict | None:
    """Fetches high-resolution channel details (avatar, subscribers, country)."""
    if not channel_id: return None
    tried_keys = 0
    while tried_keys < len(YOUTUBE_API_KEYS):
        api_key = get_yt_api_key()
        try:
            url = f"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={channel_id}&key={api_key}"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 403:
                rotate_yt_api_key()
                tried_keys += 1
                continue
            if resp.status_code == 200:
                items = resp.json().get('items', [])
                if items:
                    c = items[0]
                    snip = c.get('snippet', {})
                    stats = c.get('statistics', {})
                    thumbs = snip.get('thumbnails', {})
                    avatar = thumbs.get('high', {}).get('url') or thumbs.get('default', {}).get('url')
                    return {
                        'avatar_url': avatar,
                        'subscriber_count': stats.get('subscriberCount'),
                        'country': snip.get('country') or 'United States',
                        'channel_link': f"https://www.youtube.com/channel/{channel_id}"
                    }
            break
        except Exception:
            break
    return None

def upsert_metrics_with_comparison(metrics_list: list[dict]):
    """
    Upserts daily view metrics into Supabase `video_metrics` table.
    Keeps the highest view_count if multiple records occur on the same day.
    """
    if not metrics_list: return
    
    today_str = get_hanoi_time().strftime('%Y-%m-%d')
    
    try:
        vids = [m['video_id'] for m in metrics_list]
        res = supabase.table('video_metrics').select('video_id, view_count').eq('recorded_at', today_str).in_('video_id', vids).execute()
        existing_map = {m['video_id']: m['view_count'] for m in res.data}
    except Exception:
        existing_map = {}

    to_upsert = []
    for m in metrics_list:
        vid_id = m['video_id']
        new_views = m['view_count']
        if vid_id in existing_map:
            if new_views > existing_map[vid_id]:
                to_upsert.append(m)
        else:
            to_upsert.append(m)
            
    if to_upsert:
        try:
            supabase.table('video_metrics').upsert(to_upsert, on_conflict='video_id,recorded_at').execute()
        except Exception as e:
            print(f"   [!] Error upserting video_metrics: {repr(e)}")

def fetch_non_yt_data(url: str):
    """Fallback scrap for non-YouTube platforms via yt-dlp."""
    ydl_opts = {
        'quiet': True,
        'skip_download': True,
        'extract_flat': False,
        'no_warnings': True,
        'socket_timeout': 10,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get('view_count'), info.get('title')
    except Exception:
        return None, None

# --- WORKER TASK 1: DISCOVER NEW VIDEOS & SYNC METADATA ---
def sync_progress_to_db():
    print("\n>>> TASK 1: Scanning Progress Tab (Collaborations -> Supabase Videos & KOLs)...")
    try:
        res = supabase.table('collaborations').select('*').execute()
        collaborations = res.data
    except Exception as e:
        print(f"   [ERROR] Error fetching collaborations: {repr(e)}")
        return

    # Load existing videos by new_id
    existing_videos = {} # new_id -> video_row
    try:
        db_vids = supabase.table('videos').select('*').execute().data
        for item in db_vids:
            if item.get('new_id'):
                existing_videos[item['new_id']] = item
        print(f"   [+] Loaded {len(existing_videos)} existing video records from Supabase.")
    except Exception as e:
        print(f"   [!] Error loading videos: {repr(e)}")

    # Load existing KOLs by id
    existing_kols = {}
    try:
        db_kols = supabase.table('kols').select('*').execute().data
        for k in db_kols:
            existing_kols[k['id']] = k
    except Exception as e:
        print(f"   [!] Error loading KOLs: {repr(e)}")

    new_video_count = 0
    updated_video_count = 0

    for row in collaborations:
        kol_id = row.get('kol_id')
        if not kol_id: continue

        raw_links = str(row.get('report_links', '') or '')
        found_links = re.findall(r'(https?://[^\s,]+)', raw_links)
        
        agreement = row.get('agreement_link', '') or ''
        package = str(row.get('total_package', '') or '')
        
        for raw_link in found_links:
            new_id = extract_canonical_id(raw_link)
            if not new_id: continue

            yt_id = extract_video_id(raw_link)
            final_url = f"https://www.youtube.com/watch?v={yt_id}" if yt_id else raw_link

            # If new video or missing title
            is_new = new_id not in existing_videos
            is_incomplete = not is_new and (not existing_videos[new_id].get('title') or not existing_videos[new_id].get('released_date'))

            if is_new or is_incomplete:
                video_payload = {
                    'new_id': new_id,
                    'kol_id': kol_id,
                    'video_url': final_url,
                    'agreement_link': agreement,
                    'total_package': package,
                    'status': 'HEALTHY'
                }

                # Fetch YouTube metadata directly for new video
                if yt_id:
                    details = fetch_youtube_video_details_batch([yt_id])
                    if yt_id in details:
                        info = details[yt_id]
                        video_payload['title'] = info['title']
                        video_payload['released_date'] = info['publishedAt']
                        video_payload['current_views'] = info['viewCount']

                        # Check if KOL info (avatar / sub count) is missing
                        current_kol = existing_kols.get(kol_id)
                        if current_kol and info.get('channelId') and (not current_kol.get('avatar_url') or not current_kol.get('subscriber_count')):
                            channel_info = fetch_youtube_channel_info(info['channelId'])
                            if channel_info:
                                try:
                                    supabase.table('kols').update(channel_info).eq('id', kol_id).execute()
                                    print(f"   [KOL] Enriched KOL metadata for {current_kol.get('name')}")
                                except Exception as err:
                                    print(f"   [!] Failed to enrich KOL: {err}")

                try:
                    supabase.table('videos').upsert(video_payload, on_conflict='new_id').execute()
                    if is_new:
                        new_video_count += 1
                        print(f"   [NEW VIDEO] Discovered & added: {new_id} ({final_url})")
                    else:
                        updated_video_count += 1
                except Exception as e:
                    print(f"   [!] Error upserting video {new_id}: {repr(e)}")

    print(f"   [+] Task 1 Complete: {new_video_count} new videos added, {updated_video_count} updated.")

# --- WORKER TASK 2: TRACK DAILY VIEWS & RECORD METRICS ---
def track_youtube_views():
    print("\n>>> TASK 2: Tracking Daily Video Views & Recording Metrics...")
    try:
        videos = supabase.table('videos').select('*').neq('status', 'UNLISTED/REMOVED').execute().data
    except Exception as e:
        print(f"   [ERROR] Error fetching videos from Supabase: {repr(e)}")
        return
    
    youtube_videos = []
    other_videos = [] 
    for v in videos:
        yt_id = extract_video_id(v['video_url'])
        if yt_id:
            v['yt_id'] = yt_id
            youtube_videos.append(v)
        else:
            other_videos.append(v)
    
    today_str = get_hanoi_time().strftime('%Y-%m-%d') 
    metrics_to_upsert = []

    # Process YouTube Videos in 50-item batches
    if youtube_videos:
        chunk_size = 50
        for i in range(0, len(youtube_videos), chunk_size):
            chunk = youtube_videos[i:i+chunk_size]
            chunk_yt_ids = [v['yt_id'] for v in chunk]
            
            details_map = fetch_youtube_video_details_batch(chunk_yt_ids)
            
            for v in chunk:
                yt_id = v['yt_id']
                db_id = v['id']
                
                if yt_id in details_map:
                    info = details_map[yt_id]
                    view_count = info['viewCount']
                    title = info['title']
                    pub_date = info['publishedAt']
                    
                    metrics_to_upsert.append({
                        'video_id': db_id, 
                        'view_count': view_count, 
                        'recorded_at': today_str
                    })

                    # Update video table in Supabase
                    try:
                        supabase.table('videos').update({
                            'title': title,
                            'released_date': pub_date,
                            'current_views': view_count
                        }).eq('id', db_id).execute()

                        # Sync released_date to collaboration record if needed
                        if pub_date and v.get('kol_id'):
                            supabase.table('collaborations').update({
                                'released_date': pub_date
                            }).eq('kol_id', v['kol_id']).execute()
                    except Exception as err:
                        print(f"   [!] Failed updating video record {db_id}: {err}")
                else:
                    # Fail-safe: use previous known view count if API returns empty item
                    failsafe_views = v.get('current_views', 0) or 0
                    metrics_to_upsert.append({
                        'video_id': db_id,
                        'view_count': failsafe_views,
                        'recorded_at': today_str
                    })
                    failsafe_video_ids.add(db_id)

    # Process Non-YouTube Videos (TikTok/IG)
    for ov in other_videos:
        scraped_view, scraped_title = fetch_non_yt_data(ov['video_url'])
        final_view = scraped_view if scraped_view is not None else (ov.get('current_views', 0) or 0)
        
        if scraped_view is not None:
            try:
                supabase.table('videos').update({
                    'title': scraped_title or ov.get('video_url'), 
                    'current_views': final_view
                }).eq('id', ov['id']).execute()
            except Exception: pass
        
        metrics_to_upsert.append({
            'video_id': ov['id'], 
            'view_count': final_view, 
            'recorded_at': today_str
        })

    # Bulk Upsert Metrics into Supabase `video_metrics` table
    if metrics_to_upsert:
        upsert_metrics_with_comparison(metrics_to_upsert)
        print(f"   [+] Task 2 Complete: Recorded daily view metrics for {len(metrics_to_upsert)} videos.")

# --- WORKER TASK 3: UPDATE VIDEO HEALTH STATUSES ---
def update_video_statuses():
    print("\n>>> TASK 3: Checking Video Health Statuses...")
    try:
        videos = supabase.table('videos').select('id, video_url, status').execute().data
    except Exception: return

    updated_status_count = 0
    for v in videos:
        vid_id, url, current_status = v['id'], v['video_url'], v.get('status', 'HEALTHY')
        yt_id = extract_video_id(url)

        if yt_id:
            if vid_id in failsafe_video_ids: continue
            details = fetch_youtube_video_details_batch([yt_id])
            if yt_id in details:
                privacy = details[yt_id]['privacyStatus'].lower()
                new_status = 'HEALTHY' if privacy == 'public' else 'UNLISTED/REMOVED'
            else:
                new_status = 'UNLISTED/REMOVED'
        else:
            continue

        if new_status and new_status != current_status:
            try:
                supabase.table('videos').update({'status': new_status}).eq('id', vid_id).execute()
                updated_status_count += 1
                print(f"   [STATUS] Status change for {url[:45]}: {current_status} -> {new_status}")
            except Exception: pass

    print(f"   [+] Task 3 Complete: Updated health status for {updated_status_count} videos.")

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    print(f"[START] Starting Daily Worker Sync (Time: {get_hanoi_time().strftime('%Y-%m-%d %H:%M:%S GMT+7')})...\n")
    try:
        sync_progress_to_db()
        track_youtube_views()
        update_video_statuses()
        print("\n[SUCCESS] ALL TASKS COMPLETED SUCCESSFULLY! Influencer Dashboard metrics are fully updated.")
    except Exception as e:
        print(f"\n[FATAL ERROR] IN DAILY WORKER: {repr(e)}")
