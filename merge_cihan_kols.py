import json
from supabase import create_client

SUPABASE_URL = "https://wpzigasfuizrabqqzxln.supabase.co"
SUPABASE_KEY = "sb_publishable_pmVTsi7Ja776fvYKBacBUA_0YwFIVv6"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CANONICAL_ID = "a0916047-61ed-4bd1-a27a-11cc364c229d" # Ahmet Cihan Erden -> Cihan Erden
DUPLICATE_IDS = [
    "1c002b29-aaf5-4285-889c-78d6b483688e", # Cihan Erden (no email/country)
    "2421c9c0-8899-4ba3-87f8-ced2faec2348"  # Cihan Erdan
]

print(">>> Starting Cihan Erden KOL data merge...")

# 1. Gather all video links from videos belonging to duplicate IDs
all_links_to_add = []

for dup_id in DUPLICATE_IDS:
    # Reassign videos to canonical ID
    vids = supabase.table("videos").select("id, video_url").eq("kol_id", dup_id).execute().data
    for v in vids:
        url = v.get("video_url")
        if url:
            all_links_to_add.append(url)
        supabase.table("videos").update({"kol_id": CANONICAL_ID}).eq("id", v["id"]).execute()
    print(f"[+] Reassigned {len(vids)} videos from duplicate KOL {dup_id} to canonical KOL")

    # Reassign any collaborations to canonical ID
    collabs = supabase.table("collaborations").select("id").eq("kol_id", dup_id).execute().data
    for c in collabs:
        supabase.table("collaborations").update({"kol_id": CANONICAL_ID}).eq("id", c["id"]).execute()
    if collabs:
        print(f"[+] Reassigned {len(collabs)} collaborations from duplicate KOL {dup_id} to canonical KOL")

# 2. Consolidate all video URLs into the main collaboration report_links for Cihan Erden
main_collab_res = supabase.table("collaborations").select("*").eq("kol_id", CANONICAL_ID).execute().data
if main_collab_res:
    main_collab = main_collab_res[0]
    existing_links = (main_collab.get("report_links") or "").split("\n")
    existing_links = [l.strip() for l in existing_links if l.strip()]
    
    # Add new links while avoiding duplicates
    for l in all_links_to_add:
        if l not in existing_links:
            existing_links.append(l)
            
    updated_report_links = "\n".join(existing_links)
    supabase.table("collaborations").update({
        "report_links": updated_report_links
    }).eq("id", main_collab["id"]).execute()
    print(f"[+] Consolidated all {len(existing_links)} video links into collaboration record {main_collab['id']}")

# 3. Delete duplicate KOL records first to release name unique constraint
for dup_id in DUPLICATE_IDS:
    res = supabase.table("kols").delete().eq("id", dup_id).execute()
    print(f"[+] Deleted duplicate KOL record {dup_id}")

# 4. Update canonical KOL record name to 'Cihan Erden' and country to 'Turkey'
supabase.table("kols").update({
    "name": "Cihan Erden",
    "country": "Turkey",
    "email": "cihanerden33@gmail.com"
}).eq("id", CANONICAL_ID).execute()
print("[+] Updated canonical KOL record (id:", CANONICAL_ID, ") name to 'Cihan Erden'")

print("[+] MERGE COMPLETED SUCCESSFULLY!")
