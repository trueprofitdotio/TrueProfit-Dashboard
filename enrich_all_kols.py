import urllib.request
import urllib.parse
import json
import time
from supabase import create_client

SUPABASE_URL = "https://wpzigasfuizrabqqzxln.supabase.co"
SUPABASE_KEY = "sb_publishable_pmVTsi7Ja776fvYKBacBUA_0YwFIVv6"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
YT_KEY = "AIzaSyA30cT-T7yF6o-To4nAQzfg8mG750ihhgI"

def fetch_yt_channel(name):
    try:
        query = urllib.parse.quote(name)
        search_url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q={query}&key={YT_KEY}"
        req = urllib.request.urlopen(search_url)
        data = json.loads(req.read().decode('utf-8'))
        if data.get('items'):
            item = data['items'][0]
            c_id = item['snippet']['channelId']
            c_url = f"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={c_id}&key={YT_KEY}"
            c_req = urllib.request.urlopen(c_url)
            c_data = json.loads(c_req.read().decode('utf-8'))
            if c_data.get('items'):
                c_item = c_data['items'][0]
                snippet = c_item.get('snippet', {})
                stats = c_item.get('statistics', {})
                avatar = snippet.get('thumbnails', {}).get('high', {}).get('url') or snippet.get('thumbnails', {}).get('medium', {}).get('url') or snippet.get('thumbnails', {}).get('default', {}).get('url')
                handle = snippet.get('customUrl')
                link = f"https://www.youtube.com/{handle}" if handle else f"https://www.youtube.com/channel/{c_id}"
                subs = stats.get('subscriberCount', '0')
                country = snippet.get('country')
                return {
                    'title': snippet.get('title'),
                    'avatar_url': avatar,
                    'channel_link': link,
                    'subscriber_count': subs,
                    'country': country
                }
    except Exception as e:
        print(f"Error fetching YT for {name}: {e}")
    return None

def country_code_to_name(code):
    if not code: return None
    c = str(code).strip().upper()
    mapping = {
        'US': 'United States', 'USA': 'United States',
        'FR': 'France', 'DE': 'Germany', 'GB': 'United Kingdom', 'UK': 'United Kingdom',
        'CA': 'Canada', 'TR': 'Turkey', 'SG': 'Singapore', 'ES': 'Spain', 'VN': 'Vietnam'
    }
    return mapping.get(c, c)

print(">>> Starting KOL Data Enrichment...")
kols = supabase.table('kols').select('*').execute().data
print(f"[+] Loaded {len(kols)} KOL records from Supabase")

updated_count = 0
for k in kols:
    kol_id = k['id']
    name = k.get('name')
    if not name: continue

    current_avatar = k.get('avatar_url')
    current_link = k.get('channel_link')
    current_subs = k.get('subscriber_count')

    # If missing avatar, channel link, or subs, fetch from YouTube
    if not current_avatar or not current_link or not current_subs or current_subs == 'None' or current_subs == 0:
        print(f"[*] Enriching KOL: {name}...")
        info = fetch_yt_channel(name)
        if info:
            updates = {}
            if info.get('avatar_url'):
                updates['avatar_url'] = info['avatar_url']
            if info.get('channel_link'):
                updates['channel_link'] = info['channel_link']
            if info.get('subscriber_count') and info['subscriber_count'] != '0':
                updates['subscriber_count'] = str(info['subscriber_count'])
            if info.get('country'):
                updates['country'] = country_code_to_name(info['country'])
            elif not k.get('country'):
                updates['country'] = 'United States'

            if updates:
                supabase.table('kols').update(updates).eq('id', kol_id).execute()
                updated_count += 1
                print(f"   [OK] Updated {name}: {updates}")
        time.sleep(0.2)

print(f"\n>>> ENRICHMENT COMPLETE! Updated {updated_count} KOL profiles in Supabase backend.")
