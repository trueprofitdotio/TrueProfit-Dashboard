-- Remove the "proposal" grouping concept entirely. Creators become the
-- top-level entity. Aug 2026 was the only proposal (1 row, 4 linked
-- creators), so this is a straight structural collapse with zero data
-- loss for the 4 active creators (Ac Hampton, Joshua Mayo, Grant Zuco,
-- Perry Xie). Creators with discussion history but no proposal_kols row
-- (Tara Michelle, Killyan Examy, Expedicion Vital, Sanky) keep their
-- thread/messages untouched -- they just have no creator_deals row, so
-- they stay out of the UI until re-added.

-- 1) proposal_kols -> creator_deals (per-creator deal terms, one row per kol_id)
ALTER TABLE public.proposal_kols RENAME TO creator_deals;
ALTER TABLE public.creator_deals DROP CONSTRAINT proposal_kols_pkey;
ALTER TABLE public.creator_deals DROP CONSTRAINT proposal_kols_proposal_id_fkey;
ALTER TABLE public.creator_deals DROP COLUMN proposal_id;
ALTER TABLE public.creator_deals ADD PRIMARY KEY (kol_id);

-- 2) proposal_discussion_threads -> creator_discussion_threads (one thread per creator)
ALTER TABLE public.proposal_discussion_threads RENAME TO creator_discussion_threads;
ALTER TABLE public.creator_discussion_threads DROP CONSTRAINT proposal_discussion_threads_proposal_id_kol_id_key;
ALTER TABLE public.creator_discussion_threads DROP CONSTRAINT proposal_discussion_threads_proposal_id_fkey;
ALTER TABLE public.creator_discussion_threads DROP COLUMN proposal_id;
ALTER TABLE public.creator_discussion_threads ADD CONSTRAINT creator_discussion_threads_kol_id_key UNIQUE (kol_id);

-- 3) proposal_discussion_messages -> creator_discussion_messages (pure rename; thread_id FK untouched)
ALTER TABLE public.proposal_discussion_messages RENAME TO creator_discussion_messages;

-- 4) proposal_creator_status_events -> creator_status_events (status-change audit log)
ALTER TABLE public.proposal_creator_status_events RENAME TO creator_status_events;
ALTER TABLE public.creator_status_events DROP CONSTRAINT proposal_creator_status_events_proposal_id_fkey;
ALTER TABLE public.creator_status_events DROP COLUMN proposal_id;

-- 5) Drop the proposals table itself and dead backup artifacts (0 rows, unused)
DROP TABLE public.proposals;
DROP TABLE public.proposal_kols_note_backup;
DROP TABLE public.proposal_kols_status_backup;

-- 6) Replace the status-update RPC (was proposal_id+kol_id keyed, now kol_id only)
DROP FUNCTION IF EXISTS public.update_proposal_kol_status(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.update_creator_status(
    p_kol_id uuid,
    p_new_status text,
    p_actor text,
    p_source text DEFAULT 'Dashboard'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_status TEXT;
    v_thread_id UUID;
    v_msg_body TEXT;
BEGIN
    SELECT status INTO v_old_status
    FROM public.creator_deals
    WHERE kol_id = p_kol_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Record not found';
    END IF;

    IF v_old_status IS DISTINCT FROM p_new_status THEN
        UPDATE public.creator_deals
        SET status = p_new_status
        WHERE kol_id = p_kol_id;

        INSERT INTO public.creator_status_events(kol_id, previous_status, next_status, actor, source)
        VALUES (p_kol_id, COALESCE(v_old_status, 'Active'), p_new_status, p_actor, p_source);

        IF p_source NOT LIKE '%No Msg%' AND p_source NOT LIKE '%Reset%' THEN
            INSERT INTO public.creator_discussion_threads(kol_id)
            VALUES (p_kol_id)
            ON CONFLICT (kol_id) DO UPDATE SET kol_id = EXCLUDED.kol_id
            RETURNING id INTO v_thread_id;

            v_msg_body := p_actor || ' updated status to ' || p_new_status;
            INSERT INTO public.creator_discussion_messages(thread_id, type, body, actor)
            VALUES (v_thread_id, 'system', v_msg_body, p_actor);
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'status', p_new_status);
END;
$function$;
