-- Storage bucket for discussion screenshots and file attachments.
--
-- The bucket is PRIVATE. Objects are reached through short-lived signed URLs
-- created by the client, never through a public URL. A public bucket would put
-- every internal screenshot behind a guessable, permanent, unauthenticated
-- link -- these are internal deal discussions, so that is not acceptable.

-- --------------------------------------------------------------------------
-- Bucket
-- --------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'discussion-attachments',
    'discussion-attachments',
    false,
    10485760,  -- 10 MB; pasted screenshots are typically well under 2 MB
    array[
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp',
        'application/pdf'
    ]
)
on conflict (id) do update
set file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public             = excluded.public;

-- --------------------------------------------------------------------------
-- Identity helper
-- --------------------------------------------------------------------------

create schema if not exists private;

-- Mirrors the client-side gate in DiscussionSidebar.tsx, which only accepts
-- sessions whose email ends in @firegroup.io. Reading the JWT claim needs no
-- table access, so this is deliberately NOT security definer.
create or replace function private.is_internal_user()
returns boolean
language sql
stable
set search_path = ''
as $$
    select split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2) = 'firegroup.io';
$$;

revoke execute on function private.is_internal_user() from public, anon;
grant  execute on function private.is_internal_user() to authenticated;

-- --------------------------------------------------------------------------
-- Object policies
-- --------------------------------------------------------------------------

drop policy if exists "discussion attachments readable by internal users"   on storage.objects;
drop policy if exists "discussion attachments writable by internal users"   on storage.objects;
drop policy if exists "discussion attachments updatable by internal users"  on storage.objects;
drop policy if exists "discussion attachments deletable by internal users"  on storage.objects;

create policy "discussion attachments readable by internal users"
on storage.objects for select to authenticated
using (
    bucket_id = 'discussion-attachments'
    and (select private.is_internal_user())
);

create policy "discussion attachments writable by internal users"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'discussion-attachments'
    and (select private.is_internal_user())
);

create policy "discussion attachments updatable by internal users"
on storage.objects for update to authenticated
using (
    bucket_id = 'discussion-attachments'
    and (select private.is_internal_user())
    and owner_id = (select auth.uid())::text
)
with check (
    bucket_id = 'discussion-attachments'
    and (select private.is_internal_user())
);

-- Deletion is restricted to the uploader. Anyone can read a colleague's
-- screenshot; nobody should be able to delete it out from under them.
create policy "discussion attachments deletable by internal users"
on storage.objects for delete to authenticated
using (
    bucket_id = 'discussion-attachments'
    and (select private.is_internal_user())
    and owner_id = (select auth.uid())::text
);
