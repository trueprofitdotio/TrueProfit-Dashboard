import pandas as pd
import re
import os
import requests
import yt_dlp
from datetime import datetime, timedelta, timezone
from supabase import create_client, Client

# --- CẤU HÌNH ---
# Lấy từ biến môi trường (Github) hoặc hardcode (Local)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wpzigasfuizrabqqzxln.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_pmVTsi7Ja776fvYKBacBUA_0YwFIVv6")

# YouTube API Key pool - rotate khi bị quota limit (403)
YOUTUBE_API_KEYS = [
    "AIzaSyA30cT-T7yF6o-To4nAQzfg8mG750ihhgI",
    os.environ.get("YOUTUBE_API_KEY",  "AIzaSyChr_rRRYlsH9_wfY8JB1UJ30fPDMBtp0c"),
    "AIzaSyAHFSLQGngrIVVMw2ERmyuOhCuJLhtM5jc",
    "AIzaSyDiyxt3nc4qdSx7OtsOIkKCU7S94_uWiUc",
]
_yt_key_index = 0  # con trỏ key hiện tại


# --- MÚI GIỜ HÀ NỘI (GMT+7) ---
def get_hanoi_time():
    tz_vn = timezone(timedelta(hours=7))
    return datetime.now(tz_vn)

# Init Clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Set lưu video_id của những video bị fail-safe (API không trả về khi track views)
failsafe_video_ids: set = set()

def get_yt_api_key() -> str:
    """Trả về API key hiện tại."""
    return YOUTUBE_API_KEYS[_yt_key_index % len(YOUTUBE_API_KEYS)]

def rotate_yt_api_key() -> str:
    """Rotate sang key tiếp theo khi bị quota (403)."""
    global _yt_key_index
    _yt_key_index += 1
    new_key = get_yt_api_key()
    print(f"   🔄 Rotated to YouTube API key #{_yt_key_index % len(YOUTUBE_API_KEYS) + 1}")
    return new_key


# --- HELPER ---
def extract_video_id(url):
    """Trích xuất Video ID từ link Youtube"""
    if not isinstance(url, str): return None
    match = re.search(r'(?:v=|/|embed/|youtu\.be/)([\w-]{11})(?=&|\?|$)', url)
    return match.group(1) if match else None

def extract_canonical_id(url):
    """
    Trích xuất canonical platform-native ID từ URL.
    Format trả về: yt_<id>, tt_<id>, x_<id>, ig_<id>
    """
    if not isinstance(url, str): return None
    
    # YouTube
    yt_id = extract_video_id(url)
    if yt_id: return f"yt_{yt_id}"
    
    # TikTok
    tt_match = re.search(r'tiktok\.com/.*video/(\d+)', url)
    if tt_match: return f"tt_{tt_match.group(1)}"
    
    # X/Twitter
    x_match = re.search(r'(?:twitter\.com|x\.com)/.*/status/(\d+)', url)
    if x_match: return f"x_{x_match.group(1)}"
    
    # Instagram
    ig_match = re.search(r'instagram\.com/(?:reels?|p|reel)/([^/?#&]+)', url)
    if ig_match: return f"ig_{ig_match.group(1)}"
    
    return None

def upsert_metrics_with_comparison(metrics_list):
    """
    Upsert metrics vào Supabase, giữ lại view_count lớn nhất nếu xảy ra xung đột (cùng video, cùng ngày).
    """
    if not metrics_list: return
    
    today_str = get_hanoi_time().strftime('%Y-%m-%d')
    
    try:
        # Lấy danh sách video_id để kiểm tra record hiện có trong ngày
        vids = [m['video_id'] for m in metrics_list]
        res = supabase.table('video_metrics').select('video_id, view_count').eq('recorded_at', today_str).in_('video_id', vids).execute()
        existing_map = {m['video_id']: m['view_count'] for m in res.data}
    except:
        existing_map = {}

    to_upsert = []
    for m in metrics_list:
        vid_id = m['video_id']
        new_views = m['view_count']
        if vid_id in existing_map:
            # Chỉ cập nhật nếu số view mới lớn hơn số view đã lưu
            if new_views > existing_map[vid_id]:
                to_upsert.append(m)
        else:
            to_upsert.append(m)
            
    if to_upsert:
        try:
            supabase.table('video_metrics').upsert(to_upsert, on_conflict='video_id,recorded_at').execute()
        except Exception as e:
            print(f"   [!] Lỗi upsert video_metrics: {repr(e)}")

def fetch_non_yt_data(url):
    """Dùng yt-dlp cào data các nền tảng khác (TikTok, IG,...)"""
    ydl_opts = {
        'quiet': True,
        'skip_download': True,
        'extract_flat': False,
        'no_warnings': True,
        'socket_timeout': 15,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get('view_count'), info.get('title')
    except Exception as e:
        print(f"   [!] yt-dlp failed on {url}")
        return None, None

def check_youtube_video_status(video_id: str) -> str:
    """
    Dùng YouTube Data API v3 (videos.list) để kiểm tra privacy status của video.
    """
    tried_keys = 0
    while tried_keys < len(YOUTUBE_API_KEYS):
        api_key = get_yt_api_key()
        try:
            url = (
                f"https://www.googleapis.com/youtube/v3/videos"
                f"?part=status,snippet,statistics"
                f"&id={video_id}"
                f"&key={api_key}"
            )
            res = requests.get(url, timeout=15)

            if res.status_code == 403:
                rotate_yt_api_key()
                tried_keys += 1
                continue

            if res.status_code != 200:
                return "Unknown"

            data = res.json()
            items = data.get('items', [])

            if not items:
                return "UNLISTED/REMOVED"

            privacy = items[0].get('status', {}).get('privacyStatus', '').lower()
            return "HEALTHY" if privacy == 'public' else "UNLISTED/REMOVED"

        except Exception as e:
            return "Unknown"

    return "Unknown"


def check_non_yt_status(url: str) -> str:
    """
    Kiểm tra video TikTok/IG/Twitter bằng yt-dlp.
    """
    ydl_opts = {
        'quiet': True,
        'skip_download': True,
        'extract_flat': False,
        'no_warnings': True,
        'socket_timeout': 15,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            view_count = info.get('view_count')
            if view_count is not None and isinstance(view_count, int):
                return "HEALTHY"
            else:
                return "UNLISTED/REMOVED"
    except Exception as e:
        err_str = str(e).lower()
        BLOCKED_KEYWORDS = ["block", "429", "rate limit", "login required", "cookies"]
        if any(kw in err_str for kw in BLOCKED_KEYWORDS):
            return "Blocked"
        return "UNLISTED/REMOVED"


# --- TASK 1: SYNC TỪ COLLABORATIONS -> SUPABASE VIDEOS ---
def sync_progress_to_db():
    print("\n>>> TASK 1: Syncing Metadata (Collaborations -> DB)...")
    try:
        # Fetch from the new application source of truth instead of Google Sheets
        res = supabase.table('collaborations').select('*').execute()
        records = res.data
    except Exception as e:
        print(f"❌ Lỗi đọc Supabase collaborations: {repr(e)}")
        return

    # Load existing videos by new_id to check status
    existing_videos = {} # new_id -> status
    try:
        db_res = supabase.table('videos').select('new_id, status').execute().data
        for item in db_res:
            if item.get('new_id'):
                existing_videos[item['new_id']] = item.get('status')
        print(f"[+] Loaded {len(db_res)} videos from DB.")
    except Exception as e:
        print(f"[!] Could not load existing videos list: {repr(e)}")

    for row in records:
        kol_id = row.get('kol_id')
        if not kol_id: continue

        raw_report_link_cell = str(row.get('report_links', '') or '')
        found_links = re.findall(r'(https?://[^\s,]+)', raw_report_link_cell)
        
        agreement = row.get('agreement_link', '') or ''
        package = str(row.get('total_package', '') or '')
        content_count = row.get('content_count', 0) or 0

        for raw_link in found_links:
            new_id = extract_canonical_id(raw_link)
            if not new_id: continue

            # Chuẩn hóa URL cho Youtube
            yt_id = extract_video_id(raw_link)
            final_url = f"https://www.youtube.com/watch?v={yt_id}" if yt_id else raw_link

            video_data = {
                'new_id': new_id,
                'kol_id': kol_id,
                'video_url': final_url, 
                'agreement_link': agreement,
                'total_package': package,
                'content_count': content_count
            }
            # Chỉ set status mặc định là HEALTHY nếu chưa tồn tại
            if new_id not in existing_videos:
                video_data['status'] = 'HEALTHY'

            try:
                # Upsert dựa trên new_id thay vì video_url
                supabase.table('videos').upsert(video_data, on_conflict='new_id').execute()
            except Exception as e:
                print(f"   [!] Error upserting video {new_id}: {repr(e)}")

    print("[+] Metadata sync complete.")


# --- TASK 2: TRACK VIEW ---
def track_youtube_views():
    print("\n>>> TASK 2: Tracking Views...")
    try:
        # Lấy danh sách video đang hoạt động (không phải UNLISTED/REMOVED)
        videos = supabase.table('videos').select('*').neq('status', 'UNLISTED/REMOVED').execute().data
    except Exception as e:
        print(f"❌ Lỗi Supabase: {repr(e)}")
        return
    
    youtube_videos = []
    other_videos = [] 
    for v in videos:
        # Dùng extract_video_id để phân loại Youtube vs nền tảng khác
        yt_id = extract_video_id(v['video_url'])
        if yt_id:
            v['yt_id'] = yt_id
            youtube_videos.append(v)
        else:
            other_videos.append(v)
    
    now_vn = get_hanoi_time()
    today_str = now_vn.strftime('%Y-%m-%d') 
    updated_count = 0

    # Xử lý Non-YouTube
    non_yt_metrics = []
    for ov in other_videos:
        scraped_view, scraped_title = fetch_non_yt_data(ov['video_url'])
        # Dự phòng nếu lỗi scrap: lấy views hiện tại
        final_view = scraped_view if scraped_view is not None else (ov.get('current_views', 0) or 0)
        
        if scraped_view is not None:
            try:
                supabase.table('videos').update({
                    'title': scraped_title or ov.get('video_url'), 
                    'current_views': final_view
                }).eq('id', ov['id']).execute()
            except: pass
        
        non_yt_metrics.append({'video_id': ov['id'], 'view_count': final_view, 'recorded_at': today_str})
    
    if non_yt_metrics:
        upsert_metrics_with_comparison(non_yt_metrics)
        updated_count += len(non_yt_metrics)

    # Xử lý YouTube
    if youtube_videos:
        chunk_size = 50
        for i in range(0, len(youtube_videos), chunk_size):
            chunk = youtube_videos[i:i+chunk_size]
            ids_string = ",".join([v['yt_id'] for v in chunk])
            metrics_insert = []
            returned_ids = set()

            tried_keys = 0
            res_json = None
            while tried_keys < len(YOUTUBE_API_KEYS):
                api_key = get_yt_api_key()
                try:
                    url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id={ids_string}&key={api_key}"
                    resp = requests.get(url, timeout=15)
                    if resp.status_code == 403:
                        rotate_yt_api_key()
                        tried_keys += 1
                        continue
                    if resp.status_code == 200:
                        res_json = resp.json()
                        break
                    else: break
                except: break

            if res_json:
                for item in res_json.get('items', []):
                    yt_id = item['id']
                    returned_ids.add(yt_id)
                    view_count = int(item['statistics'].get('viewCount', 0))
                    title = item['snippet'].get('title', '')
                    pub_date = item['snippet'].get('publishedAt', '').split('T')[0]
                    
                    db_v = next(v for v in chunk if v['yt_id'] == yt_id)
                    metrics_insert.append({'video_id': db_v['id'], 'view_count': view_count, 'recorded_at': today_str})
                    try:
                        supabase.table('videos').update({
                            'title': title, 
                            'released_date': pub_date, 
                            'current_views': view_count
                        }).eq('id', db_v['id']).execute()
                        
                        if pub_date and db_v.get('kol_id'):
                            supabase.table('collaborations').update({
                                'released_date': pub_date
                            }).eq('kol_id', db_v['kol_id']).execute()
                    except: pass
            
            # Xử lý fail-safe cho các video không trả về kết quả từ API (bị xóa/unlisted)
            for v in chunk:
                if v['yt_id'] not in returned_ids:
                    view = v.get('current_views', 0) or 0
                    metrics_insert.append({'video_id': v['id'], 'view_count': view, 'recorded_at': today_str})
                    failsafe_video_ids.add(v['id'])
            
            if metrics_insert:
                upsert_metrics_with_comparison(metrics_insert)
                updated_count += len(metrics_insert)

    print(f"[+] Updated {updated_count} records.")


# --- TASK 2.5: UPDATE VIDEO STATUSES ---
def update_video_statuses():
    print("\n>>> TASK 2.5: Updating Video Statuses...")
    try:
        videos = supabase.table('videos').select('id, video_url, status').execute().data
    except: return

    for v in videos:
        vid_id, url, current = v['id'], v['video_url'], v.get('status', 'HEALTHY')
        yt_id = extract_video_id(url)

        if yt_id:
            if vid_id in failsafe_video_ids: continue
            new_status = check_youtube_video_status(yt_id)
        else:
            new_status = check_non_yt_status(url)
            if new_status == "Blocked": continue

        if new_status != "Unknown" and new_status != current:
            try:
                supabase.table('videos').update({'status': new_status}).eq('id', vid_id).execute()
                print(f"   [+] {url[:50]}: {current} -> {new_status}")
            except: pass


if __name__ == "__main__":
    try:
        sync_progress_to_db()
        track_youtube_views()
        update_video_statuses()
        print("\n[+] ALL TASKS COMPLETED!")
    except Exception as e:
        print(f"\n[!] FATAL ERROR: {repr(e)}")

