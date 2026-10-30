alter table public.event_proposals
  add column replaced_by_id uuid references public.event_proposals(id) on delete cascade;

create or replace function public.recreate_event_proposal(p_source_proposal_id uuid, p_request_id uuid, p_request_fingerprint text, p_settings_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_source public.event_proposals%rowtype;
  v_replacement public.event_proposals%rowtype;
  v_result jsonb;
  v_proposal_id uuid;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_source_proposal_id is null or p_request_id is null or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' or p_settings_version is null or p_settings_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_proposal';
  end if;

  select proposal.* into v_source
  from public.event_proposals as proposal
  where proposal.id = p_source_proposal_id and proposal.owner_id = v_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'proposal_not_found';
  end if;
  if v_source.replaced_by_id is not null then
    select proposal.* into v_replacement
    from public.event_proposals as proposal
    where proposal.id = v_source.replaced_by_id and proposal.owner_id = v_owner_id;
    if found then
      if v_replacement.state = 'pending' and v_replacement.expires_at <= pg_catalog.clock_timestamp() then
        update public.event_proposals as proposal set state = 'expired', updated_at = pg_catalog.clock_timestamp()
        where proposal.id = v_replacement.id returning * into v_replacement;
      end if;
      return pg_catalog.jsonb_build_object(
        'status', v_replacement.state,
        'proposal', pg_catalog.jsonb_build_object('id', v_replacement.id, 'conversationId', v_replacement.conversation_id, 'title', v_replacement.title, 'note', v_replacement.note, 'startsAt', v_replacement.starts_at, 'endsAt', v_replacement.ends_at, 'settingsVersion', v_replacement.settings_version, 'state', v_replacement.state, 'expiresAt', v_replacement.expires_at),
        'event', v_replacement.result
      );
    end if;
    raise exception using errcode = 'P0002', message = 'replacement_not_found';
  end if;
  if v_source.state = 'pending' and v_source.expires_at <= pg_catalog.clock_timestamp() then
    update public.event_proposals as proposal set state = 'expired', updated_at = pg_catalog.clock_timestamp()
    where proposal.id = v_source.id returning * into v_source;
  end if;
  if v_source.state not in ('cancelled', 'expired', 'conflict', 'stale') then
    return pg_catalog.jsonb_build_object('status', v_source.state);
  end if;

  v_result := public.create_event_proposal(
    v_source.conversation_id,
    p_request_id,
    p_request_fingerprint,
    v_source.title,
    v_source.note,
    (v_source.starts_at at time zone 'Asia/Seoul')::date,
    v_source.starts_at,
    v_source.ends_at,
    p_settings_version,
    null,
    null
  );
  if v_result->>'status' not in ('pending', 'confirmed') then
    return v_result;
  end if;
  v_proposal_id := (v_result->'proposal'->>'id')::uuid;
  update public.event_proposals as proposal set replaced_by_id = v_proposal_id, updated_at = pg_catalog.clock_timestamp()
  where proposal.id = v_source.id and proposal.owner_id = v_owner_id;
  return v_result;
end;
$$;

revoke all on function public.recreate_event_proposal(uuid, uuid, text, integer) from public, anon;
grant execute on function public.recreate_event_proposal(uuid, uuid, text, integer) to authenticated;

create or replace function public.get_event_proposal_states(p_proposal_ids uuid[])
returns table(proposal_id uuid, state text, expires_at timestamptz, event_id uuid, replacement_id uuid, title text, note text, starts_at timestamptz, ends_at timestamptz, settings_version integer, replacement_title text, replacement_note text, replacement_starts_at timestamptz, replacement_ends_at timestamptz, replacement_settings_version integer, replacement_expires_at timestamptz, replacement_state text, replacement_event_id uuid, replacement_created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_proposal_ids is null or pg_catalog.cardinality(p_proposal_ids) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_proposal_ids';
  end if;
  if pg_catalog.cardinality(p_proposal_ids) = 0 then
    return;
  end if;

  update public.event_proposals as proposal
  set state = 'expired', updated_at = pg_catalog.clock_timestamp()
  where proposal.owner_id = v_owner_id
    and proposal.id = any(p_proposal_ids)
    and proposal.state = 'pending'
    and proposal.expires_at <= pg_catalog.clock_timestamp();

  update public.event_proposals as replacement
  set state = 'expired', updated_at = pg_catalog.clock_timestamp()
  from public.event_proposals as source
  where source.owner_id = v_owner_id
    and source.id = any(p_proposal_ids)
    and replacement.id = source.replaced_by_id
    and replacement.owner_id = v_owner_id
    and replacement.state = 'pending'
    and replacement.expires_at <= pg_catalog.clock_timestamp();

  return query
  select proposal.id, proposal.state, proposal.expires_at,
    case when proposal.state = 'confirmed' then nullif(proposal.result->>'id', '')::uuid else null end,
    proposal.replaced_by_id, proposal.title, proposal.note, proposal.starts_at, proposal.ends_at, proposal.settings_version,
    replacement.title, replacement.note, replacement.starts_at, replacement.ends_at, replacement.settings_version, replacement.expires_at, replacement.state,
    case when replacement.state = 'confirmed' then nullif(replacement.result->>'id', '')::uuid else null end,
    replacement.created_at
  from public.event_proposals as proposal
  left join public.event_proposals as replacement on replacement.id = proposal.replaced_by_id and replacement.owner_id = v_owner_id
  where proposal.owner_id = v_owner_id and proposal.id = any(p_proposal_ids);
end;
$$;

revoke all on function public.get_event_proposal_states(uuid[]) from public, anon;
grant execute on function public.get_event_proposal_states(uuid[]) to authenticated;
