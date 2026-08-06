import os
import re
import requests
import pandas as pd
from datetime import datetime
from supabase import create_client, Client

# --- SUPABASE CONFIG ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wpzigasfuizrabqqzxln.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_pmVTsi7Ja776fvYKBacBUA_0YwFIVv6")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- YOUTUBE API CONFIG ---
YT_API_KEY = "AIzaSyA30cT-T7yF6o-To4nAQzfg8mG750ihhgI"

def fetch_yt_channel_data(channel_link_cell, name_cell, report_links_cell):
    """
    Resolves YouTube Channel Title, Avatar URL, Channel Link, and Subscriber Count using YouTube API v3.
    """
    handle = None
    channel_id = None

    # 1. Try to extract handle or channel ID from channel_link_cell
    if isinstance(channel_link_cell, str) and channel_link_cell.strip():
        match_handle = re.search(r'@([\w.-]+)', channel_link_cell)
        if match_handle:
            handle = match_handle.group(1)
        match_cid = re.search(r'channel/([\w-]+)', channel_link_cell)
        if match_cid:
            channel_id = match_cid.group(1)
        match_c = re.search(r'/c/([\w-]+)', channel_link_cell)
        if match_c and not handle:
            handle = match_c.group(1)

    # 2. Query YouTube Data API
    yt_data = None
    if handle:
        url = f"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle={handle}&key={YT_API_KEY}"
        res = requests.get(url).json()
        if 'items' in res and len(res['items']) > 0:
            yt_data = res['items'][0]
    
    if not yt_data and channel_id:
        url = f"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={channel_id}&key={YT_API_KEY}"
        res = requests.get(url).json()
        if 'items' in res and len(res['items']) > 0:
            yt_data = res['items'][0]

    # 3. Fallback search by Name if not found
    if not yt_data and name_cell:
        clean_name = str(name_cell).strip()
        search_url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q={clean_name}&key={YT_API_KEY}"
        sres = requests.get(search_url).json()
        if 'items' in sres and len(sres['items']) > 0:
            found_cid = sres['items'][0]['id']['channelId']
            curl = f"https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={found_cid}&key={YT_API_KEY}"
            cres = requests.get(curl).json()
            if 'items' in cres and len(cres['items']) > 0:
                yt_data = cres['items'][0]

    if yt_data:
        snippet = yt_data.get('snippet', {})
        stats = yt_data.get('statistics', {})
        custom_url = snippet.get('customUrl', '')
        ch_url = f"https://www.youtube.com/{custom_url}" if custom_url else f"https://www.youtube.com/channel/{yt_data['id']}"
        thumb = snippet.get('thumbnails', {}).get('high', {}).get('url') or snippet.get('thumbnails', {}).get('default', {}).get('url')
        
        return {
            'name': snippet.get('title') or name_cell,
            'avatar_url': thumb,
            'channel_link': ch_url,
            'subscriber_count': stats.get('subscriberCount')
        }

    # Default fallback if YT API fails to find channel
    clean_link = str(channel_link_cell).strip() if isinstance(channel_link_cell, str) else ''
    if clean_link and not clean_link.startswith('http'):
        clean_link = f"https://{clean_link}"
    return {
        'name': str(name_cell).strip(),
        'avatar_url': None,
        'channel_link': clean_link,
        'subscriber_count': None
    }


def sync_all():
    print("[+] Starting One-Time YouTube API v3 Data Sync...")
    excel_path = "NEW KOL MASTER SHEET.xlsx"
    df = pd.read_excel(excel_path, sheet_name="KOL PROGRESS")

    kols_cache = {} # name -> kol_id

    for i, row in df.iterrows():
        raw_name = str(row.get('Name', '')).strip()
        if not raw_name or raw_name == 'nan':
            continue

        raw_link = row.get('Channel Link', '')
        raw_report = row.get('Report Link', '')
        
        print(f"\n[{i+1}/{len(df)}] Processing KOL: '{raw_name}'...")
        
        # 1. Fetch channel data from YT API
        yt_info = fetch_yt_channel_data(raw_link, raw_name, raw_report)
        print(f"   -> YT Channel Title: '{yt_info['name']}'")
        print(f"   -> Avatar URL: {yt_info['avatar_url']}")
        print(f"   -> Subs: {yt_info['subscriber_count']}")

        # Determine country & subs fallback
        country = str(row.get('Location', '')).strip() if pd.notna(row.get('Location')) else 'US'
        sub_fallback = str(row.get('Subscriber/Follower', '')).strip() if pd.notna(row.get('Subscriber/Follower')) else ''
        subs_val = str(yt_info['subscriber_count']) if yt_info['subscriber_count'] else sub_fallback
        email_val = str(row.get('Email', '')).strip() if pd.notna(row.get('Email')) else None

        kol_payload = {
            'name': yt_info['name'],
            'email': email_val if email_val != 'nan' else None,
            'country': country if country != 'nan' else 'US',
            'subscriber_count': subs_val,
            'channel_link': yt_info['channel_link'],
            'avatar_url': yt_info['avatar_url']
        }

        # Upsert KOL into Supabase
        try:
            # Check if KOL exists by name or original name
            existing = supabase.table('kols').select('id').or_(f"name.eq.\"{yt_info['name']}\",name.eq.\"{raw_name}\"").execute().data
            if existing:
                kol_id = existing[0]['id']
                supabase.table('kols').update(kol_payload).eq('id', kol_id).execute()
            else:
                res = supabase.table('kols').insert(kol_payload).execute()
                kol_id = res.data[0]['id']
        except Exception as e:
            print(f"   [!] Error upserting KOL {yt_info['name']}: {e}")
            continue

        # Format start_month date (No column)
        raw_date = row.get('No')
        date_str = ""
        if pd.notna(raw_date):
            try:
                dt = pd.to_datetime(raw_date)
                date_str = dt.strftime('%b %d, %Y')
            except:
                date_str = str(raw_date)

        # Build collaboration payload
        content_cnt = 0
        try:
            if pd.notna(row.get('No. Of Content')):
                content_cnt = int(str(row.get('No. Of Content')).replace(',', '').strip())
        except: pass

        pkg_val = str(row.get('Total Package', '')) if pd.notna(row.get('Total Package')) else ''
        pay_status = str(row.get('Payment Status', '')) if pd.notna(row.get('Payment Status')) else ''
        prog_status = str(row.get('PROGRESS', '')) if pd.notna(row.get('PROGRESS')) else ''
        agreement = str(row.get('Signed Agreement', '')) if pd.notna(row.get('Signed Agreement')) else ''
        report_l = str(row.get('Report Link', '')) if pd.notna(row.get('Report Link')) else ''
        rel_date = None
        if pd.notna(row.get('Released Date')):
            try:
                rel_date = pd.to_datetime(row.get('Released Date')).strftime('%Y-%m-%d')
            except: pass
        notes_val = str(row.get('NOTE', '')) if pd.notna(row.get('NOTE')) else ''

        collab_payload = {
            'kol_id': kol_id,
            'start_month': date_str,
            'total_package': pkg_val,
            'payment_status': pay_status,
            'progress_status': prog_status,
            'agreement_link': agreement,
            'report_links': report_l,
            'content_count': content_cnt,
            'released_date': rel_date,
            'notes': notes_val
        }

        # Check existing collaboration
        try:
            ex_collab = supabase.table('collaborations').select('id').eq('kol_id', kol_id).execute().data
            if ex_collab:
                supabase.table('collaborations').update(collab_payload).eq('id', ex_collab[0]['id']).execute()
            else:
                supabase.table('collaborations').insert(collab_payload).execute()
        except Exception as e:
            print(f"   [!] Error upserting collaboration for {yt_info['name']}: {e}")

    print("\n[+] YouTube Sync & Collaboration update completed successfully!")

if __name__ == "__main__":
    sync_all()
