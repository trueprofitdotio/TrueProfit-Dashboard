-- Discussion sidebar: attachments, rich text, and persisted mentions.
--
-- Additive and backward compatible. Existing rows keep rendering exactly as
-- before because body_format defaults to 'plaintext' -- only messages written
-- by the new composer are tagged 'markdown' and run through the markdown
-- renderer. That matters: old message bodies contain literal * and _ characters
-- that would otherwise start rendering as emphasis.

-- --------------------------------------------------------------------------
-- Columns
-- --------------------------------------------------------------------------

alter table public.proposal_discussion_messages
    add column if not exists attachments jsonb   not null default '[]'::jsonb,
    add column if not exists mentions    jsonb   not null default '[]'::jsonb,
    add column if not exists body_format text    not null default 'plaintext';

comment on column public.proposal_discussion_messages.attachments is
    'Array of attachment objects: {path, name, mime, size, width, height}. '
    '"path" is the object key inside the discussion-attachments storage bucket, '
    'not a URL -- URLs are signed at read time and expire.';

comment on column public.proposal_discussion_messages.mentions is
    'Array of resolved mentions: {name, email}. Previously the sender parsed '
    '@names at send time and passed them to the email function without storing '
    'them, so mentions could not be queried after the fact.';

comment on column public.proposal_discussion_messages.body_format is
    'plaintext = legacy body, rendered literally. markdown = restricted '
    'markdown subset (bold, italic, strike, inline code, code fence, lists, '
    'blockquote, links).';

-- --------------------------------------------------------------------------
-- Constraints
-- --------------------------------------------------------------------------

-- Postgres has no "add constraint if not exists", hence the guards.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'proposal_discussion_messages_body_format_check'
    ) then
        alter table public.proposal_discussion_messages
            add constraint proposal_discussion_messages_body_format_check
            check (body_format in ('plaintext', 'markdown'));
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'proposal_discussion_messages_attachments_is_array'
    ) then
        alter table public.proposal_discussion_messages
            add constraint proposal_discussion_messages_attachments_is_array
            check (jsonb_typeof(attachments) = 'array');
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'proposal_discussion_messages_mentions_is_array'
    ) then
        alter table public.proposal_discussion_messages
            add constraint proposal_discussion_messages_mentions_is_array
            check (jsonb_typeof(mentions) = 'array');
    end if;
end
$$;

-- An attachment-only message (screenshot with no caption) must still be
-- allowed, but a message with neither body nor attachment is a bug.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'proposal_discussion_messages_not_empty'
    ) then
        alter table public.proposal_discussion_messages
            add constraint proposal_discussion_messages_not_empty
            check (
                coalesce(btrim(body), '') <> ''
                or jsonb_array_length(attachments) > 0
            )
            not valid;  -- not valid: do not fail the migration on pre-existing
                        -- empty rows; new writes are still checked.
    end if;
end
$$;

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- fetchMessages() filters on thread_id and orders by created_at. A composite
-- index serves both the filter and the sort, so the ordering step disappears
-- from the plan.
create index if not exists proposal_discussion_messages_thread_created_idx
    on public.proposal_discussion_messages (thread_id, created_at);

-- Supports "messages that mention me" lookups via the containment operator:
--   where mentions @> '[{"email": "someone@firegroup.io"}]'
create index if not exists proposal_discussion_messages_mentions_gin_idx
    on public.proposal_discussion_messages using gin (mentions jsonb_path_ops);
