alter table public.event_proposals
  add column action text not null default 'create',
  add column target_event_id uuid,
  add column expected_event_version integer;

alter table public.event_proposals
  add constraint event_proposals_action check (action in ('create', 'update', 'delete')),
  add constraint event_proposals_target check ((action = 'create' and target_event_id is null and expected_event_version is null) or (action in ('update', 'delete') and target_event_id is not null and expected_event_version is not null and expected_event_version > 0));

create or replace function public.create_event_change_proposal(
  p_conversation_id uuid,
  p_request_id uuid,
  p_request_fingerprint text,
  p_action text,
  p_event_id uuid,
  p_expected_version integer,
  p_title text,
  p_note text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_proposal public.event_proposals%rowtype;
  v_title text;
  v_note text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_settings_version integer;
  v_seconds numeric;
  v_previous jsonb;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_action is null or p_action not in ('update', 'delete') or p_event_id is null or p_expected_version is null or p_expected_version < 1 or p_conversation_id is null or p_request_id is null or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_change_proposal';
  end if;

  select proposal.* into v_proposal
  from public.event_proposals as proposal
  where proposal.owner_id = v_owner_id and proposal.request_id = p_request_id;
  if found then
    if v_proposal.request_fingerprint <> p_request_fingerprint then
      return pg_catalog.jsonb_build_object('status', 'request_conflict');
    end if;
    return pg_catalog.jsonb_build_object('status', v_proposal.state, 'proposal', pg_catalog.jsonb_build_object('id', v_proposal.id, 'title', v_proposal.title, 'note', v_proposal.note, 'startsAt', v_proposal.starts_at, 'endsAt', v_proposal.ends_at, 'settingsVersion', v_proposal.settings_version, 'expiresAt', v_proposal.expires_at, 'state', v_proposal.state, 'action', v_proposal.action, 'eventId', v_proposal.target_event_id), 'previousEvent', v_proposal.result);
  end if;

  select event.* into v_event
  from public.events as event
  where event.id = p_event_id and event.owner_id = v_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;
  if v_event.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale_event';
  end if;
  v_previous := pg_catalog.jsonb_build_object('title', v_event.title, 'note', v_event.note, 'startsAt', v_event.starts_at, 'endsAt', v_event.ends_at, 'version', v_event.version);
  v_title := case when p_action = 'delete' then v_event.title else p_title end;
  v_note := case when p_action = 'delete' then v_event.note else nullif(btrim(p_note), '') end;
  v_starts_at := case when p_action = 'delete' then v_event.starts_at else p_starts_at end;
  v_ends_at := case when p_action = 'delete' then v_event.ends_at else p_ends_at end;
  if p_action = 'update' then
    if v_title is null or char_length(btrim(v_title)) not between 1 and 100 or (p_note is not null and char_length(btrim(p_note)) > 500) or v_starts_at is null or v_ends_at is null then
      raise exception using errcode = '22023', message = 'invalid_event_change';
    end if;
    v_seconds := extract(epoch from v_ends_at - v_starts_at);
    if v_starts_at < pg_catalog.clock_timestamp() or v_starts_at >= v_ends_at or v_seconds not between 900 and 14400 or mod(v_seconds, 900) <> 0 or mod(extract(epoch from v_starts_at), 900) <> 0 or mod(extract(epoch from v_ends_at), 900) <> 0 or (v_starts_at at time zone 'Asia/Seoul')::date <> (v_ends_at at time zone 'Asia/Seoul')::date then
      raise exception using errcode = '22023', message = 'invalid_event_change';
    end if;
  end if;
  select settings.version into v_settings_version
  from public.user_availability as settings
  where settings.owner_id = v_owner_id;

  insert into public.event_proposals (owner_id, conversation_id, request_id, request_fingerprint, input_fingerprint, title, note, starts_at, ends_at, settings_version, action, target_event_id, expected_event_version, result)
  values (v_owner_id, p_conversation_id, p_request_id, p_request_fingerprint, pg_catalog.md5(pg_catalog.concat_ws('|', p_action, p_event_id, p_expected_version, v_title, v_note, v_starts_at, v_ends_at)), v_title, v_note, v_starts_at, v_ends_at, coalesce(v_settings_version, 1), p_action, p_event_id, p_expected_version, v_previous)
  returning * into v_proposal;
  return pg_catalog.jsonb_build_object('status', 'pending', 'proposal', pg_catalog.jsonb_build_object('id', v_proposal.id, 'title', v_proposal.title, 'note', v_proposal.note, 'startsAt', v_proposal.starts_at, 'endsAt', v_proposal.ends_at, 'settingsVersion', v_proposal.settings_version, 'expiresAt', v_proposal.expires_at, 'state', v_proposal.state, 'action', v_proposal.action, 'eventId', v_proposal.target_event_id), 'previousEvent', v_previous);
end;
$$;

create or replace function public.get_event_proposal_for_request(p_request_id uuid, p_request_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_proposal public.event_proposals%rowtype;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  select proposal.* into v_proposal from public.event_proposals as proposal where proposal.owner_id = v_owner_id and proposal.request_id = p_request_id;
  if not found then return null; end if;
  if v_proposal.request_fingerprint <> p_request_fingerprint then return pg_catalog.jsonb_build_object('status', 'request_conflict'); end if;
  if v_proposal.state = 'pending' and v_proposal.expires_at <= pg_catalog.clock_timestamp() then
    update public.event_proposals set state = 'expired', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id returning * into v_proposal;
  end if;
  return pg_catalog.jsonb_build_object('status', v_proposal.state, 'proposal', pg_catalog.jsonb_build_object('id', v_proposal.id, 'conversationId', v_proposal.conversation_id, 'searchId', v_proposal.search_id, 'candidateId', v_proposal.candidate_id, 'title', v_proposal.title, 'note', v_proposal.note, 'startsAt', v_proposal.starts_at, 'endsAt', v_proposal.ends_at, 'settingsVersion', v_proposal.settings_version, 'state', v_proposal.state, 'expiresAt', v_proposal.expires_at, 'action', v_proposal.action, 'eventId', v_proposal.target_event_id), 'result', v_proposal.result);
end;
$$;

create or replace function public.confirm_event_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_proposal public.event_proposals%rowtype;
  v_settings_version integer;
  v_event public.events%rowtype;
  v_conflicts jsonb;
begin
  if v_owner_id is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  if p_proposal_id is null then raise exception using errcode = '22023', message = 'invalid_proposal'; end if;
  select proposal.* into v_proposal from public.event_proposals as proposal where proposal.id = p_proposal_id and proposal.owner_id = v_owner_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'proposal_not_found'; end if;
  if v_proposal.state = 'confirmed' then return pg_catalog.jsonb_build_object('status', 'confirmed', 'proposalId', v_proposal.id, 'event', v_proposal.result, 'action', v_proposal.action); end if;
  if v_proposal.state <> 'pending' then return pg_catalog.jsonb_build_object('status', v_proposal.state, 'proposalId', v_proposal.id, 'result', v_proposal.result, 'action', v_proposal.action); end if;
  if v_proposal.expires_at <= pg_catalog.clock_timestamp() then
    update public.event_proposals set state = 'expired', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'expired', 'proposalId', v_proposal.id, 'action', v_proposal.action);
  end if;

  if v_proposal.action in ('update', 'delete') then
    select event.* into v_event from public.events as event where event.id = v_proposal.target_event_id and event.owner_id = v_owner_id for update;
    if not found or v_event.version <> v_proposal.expected_event_version then
      update public.event_proposals set state = 'stale', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
      return pg_catalog.jsonb_build_object('status', 'stale', 'proposalId', v_proposal.id, 'action', v_proposal.action);
    end if;
    if v_proposal.action = 'update' then
      select settings.version into v_settings_version from public.user_availability as settings where settings.owner_id = v_owner_id for share;
      if not found or v_settings_version <> v_proposal.settings_version then
        update public.event_proposals set state = 'stale', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
        return pg_catalog.jsonb_build_object('status', 'stale', 'proposalId', v_proposal.id, 'action', v_proposal.action);
      end if;
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', event.title, 'startsAt', event.starts_at, 'endsAt', event.ends_at) order by event.starts_at), '[]'::jsonb) into v_conflicts
      from public.events as event where event.owner_id = v_owner_id and event.id <> v_proposal.target_event_id and event.starts_at < v_proposal.ends_at and event.ends_at > v_proposal.starts_at;
      if pg_catalog.jsonb_array_length(v_conflicts) > 0 then
        update public.event_proposals set state = 'conflict', result = v_conflicts, updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
        return pg_catalog.jsonb_build_object('status', 'conflict', 'proposalId', v_proposal.id, 'conflicts', v_conflicts, 'action', v_proposal.action);
      end if;
      begin
        update public.events set title = v_proposal.title, note = v_proposal.note, starts_at = v_proposal.starts_at, ends_at = v_proposal.ends_at, version = version + 1, updated_at = pg_catalog.clock_timestamp()
        where id = v_proposal.target_event_id and owner_id = v_owner_id returning * into v_event;
      exception when exclusion_violation then
        update public.event_proposals set state = 'conflict', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
        return pg_catalog.jsonb_build_object('status', 'conflict', 'proposalId', v_proposal.id, 'action', v_proposal.action);
      end;
    else
      delete from public.events where id = v_proposal.target_event_id and owner_id = v_owner_id returning * into v_event;
    end if;
    update public.event_proposals set state = 'confirmed', result = pg_catalog.to_jsonb(v_event), updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'confirmed', 'proposalId', v_proposal.id, 'event', pg_catalog.to_jsonb(v_event), 'action', v_proposal.action);
  end if;

  select settings.version into v_settings_version from public.user_availability as settings where settings.owner_id = v_owner_id for share;
  if not found or v_settings_version <> v_proposal.settings_version then
    update public.event_proposals set state = 'stale', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'stale', 'proposalId', v_proposal.id, 'action', v_proposal.action);
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', event.title, 'startsAt', event.starts_at, 'endsAt', event.ends_at) order by event.starts_at), '[]'::jsonb) into v_conflicts
  from public.events as event where event.owner_id = v_owner_id and event.starts_at < v_proposal.ends_at and event.ends_at > v_proposal.starts_at;
  if pg_catalog.jsonb_array_length(v_conflicts) > 0 then
    update public.event_proposals set state = 'conflict', result = v_conflicts, updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'conflict', 'proposalId', v_proposal.id, 'conflicts', v_conflicts, 'action', v_proposal.action);
  end if;
  begin
    insert into public.events (owner_id, title, note, starts_at, ends_at) values (v_owner_id, v_proposal.title, v_proposal.note, v_proposal.starts_at, v_proposal.ends_at) returning * into v_event;
  exception when exclusion_violation then
    update public.event_proposals set state = 'conflict', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'conflict', 'proposalId', v_proposal.id, 'action', v_proposal.action);
  end;
  update public.event_proposals set state = 'confirmed', result = pg_catalog.to_jsonb(v_event), updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
  return pg_catalog.jsonb_build_object('status', 'confirmed', 'proposalId', v_proposal.id, 'event', pg_catalog.to_jsonb(v_event), 'action', v_proposal.action);
end;
$$;

revoke all on function public.create_event_change_proposal(uuid, uuid, text, text, uuid, integer, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_event_change_proposal(uuid, uuid, text, text, uuid, integer, text, text, timestamptz, timestamptz) to authenticated;
