import pandas as pd
import math
import os
import re
from datetime import datetime
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://wpzigasfuizrabqqzxln.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_pmVTsi7Ja776fvYKBacBUA_0YwFIVv6")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def clean_val(val):
    if pd.isna(val) or val == 'nan':
        return None
    if isinstance(val, str):
        return val.strip()
    return val

def run_migration():
    print("Reading Excel file...")
    df = pd.read_excel('NEW KOL MASTER SHEET.xlsx', sheet_name='KOL PROGRESS')
    
    kols_map = {}
    
    for index, row in df.iterrows():
        kol_name = clean_val(row.get('Name'))
        if not kol_name:
            continue
            
        print(f"Processing KOL: {kol_name}")
        
        # Upsert KOL
        if kol_name not in kols_map:
            sub_count = clean_val(row.get('Subscriber/Follower'))
            if sub_count is not None:
                sub_count = str(sub_count)
            kol_data = {
                'name': kol_name,
                'email': clean_val(row.get('Email')),
                'country': clean_val(row.get('Location')),
                'subscriber_count': sub_count
            }
            
            try:
                res = supabase.table('kols').upsert(kol_data, on_conflict='name').execute()
                if res.data:
                    kols_map[kol_name] = res.data[0]['id']
                else:
                    data = supabase.table('kols').select('id').eq('name', kol_name).execute().data
                    if data:
                        kols_map[kol_name] = data[0]['id']
            except Exception as e:
                print(f"Error upserting KOL {kol_name}: {e}")
                continue
                
        kol_id = kols_map.get(kol_name)
        if not kol_id:
            continue
            
        # Parse collaboration fields
        payment_status = clean_val(row.get('Payment Status'))
        progress_status = clean_val(row.get('PROGRESS'))
        report_links = clean_val(row.get('Report Link'))
        
        # Parse Released Date (handle pandas timestamp or string)
        released_date_raw = clean_val(row.get('Released Date'))
        released_date = None
        if isinstance(released_date_raw, datetime):
            released_date = released_date_raw.strftime('%Y-%m-%d')
        elif isinstance(released_date_raw, str):
            try:
                released_date = pd.to_datetime(released_date_raw).strftime('%Y-%m-%d')
            except:
                pass
                
        agreement_link = clean_val(row.get('Signed Agreement'))
        total_package = clean_val(row.get('Total Package'))
        if total_package is not None:
            total_package = str(total_package)
            
        content_count_raw = clean_val(row.get('No. Of Content'))
        content_count = 0
        try:
            if content_count_raw is not None:
                content_count = int(str(content_count_raw).replace(',', '').strip())
        except:
            pass
            
        notes = clean_val(row.get('NOTE'))
        
        collab_data = {
            'kol_id': kol_id,
            'payment_status': payment_status,
            'progress_status': progress_status,
            'report_links': report_links,
            'released_date': released_date,
            'agreement_link': agreement_link,
            'total_package': total_package,
            'content_count': content_count,
            'notes': notes
        }
        
        try:
            supabase.table('collaborations').insert(collab_data).execute()
        except Exception as e:
            print(f"Error inserting collaboration for {kol_name}: {e}")
            
    print("Migration complete!")

if __name__ == '__main__':
    run_migration()
