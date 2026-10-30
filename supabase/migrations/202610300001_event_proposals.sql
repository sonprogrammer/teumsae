create table public.availability_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  search_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  settings_version integer not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint availability_candidates_time_order check (starts_at < ends_at),
  constraint availability_candidates_duration check (extract(epoch from ends_at - starts_at) between 900 and 14400 and mod(extract(epoch from ends_at - starts_at), 900) = 0),
  constraint availability_candidates_same_korea_date check ((starts_at at time zone 'Asia/Seoul')::date = (ends_at at time zone 'Asia/Seoul')::date),
  constraint availability_candidates_settings_version check (settings_version > 0)
);

create index availability_candidates_owner_expiry_idx on public.availability_candidates (owner_id, expires_at);
create index availability_candidates_lookup_idx on public.availability_candidates (owner_id, conversation_id, search_id, id);

alter table public.availability_candidates enable row level security;
revoke all on table public.availability_candidates from public, anon, authenticated;

create table public.event_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  request_id uuid not null,
  request_fingerprint text not null,
  input_fingerprint text not null,
  candidate_id uuid,
  search_id uuid,
  title text not null,
  note text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  settings_version integer not null,
  state text not null default 'pending',
  expires_at timestamptz not null default now() + interval '10 minutes',
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_proposals_request_unique unique (owner_id, request_id),
  constraint event_proposals_title_length check (char_length(btrim(title)) between 1 and 100),
  constraint event_proposals_note_length check (note is null or char_length(btrim(note)) <= 500),
  constraint event_proposals_time_order check (starts_at < ends_at),
  constraint event_proposals_duration check (extract(epoch from ends_at - starts_at) between 900 and 14400 and mod(extract(epoch from ends_at - starts_at), 900) = 0),
  constraint event_proposals_quarter_hour check (mod(extract(epoch from starts_at), 900) = 0 and mod(extract(epoch from ends_at), 900) = 0),
  constraint event_proposals_same_korea_date check ((starts_at at time zone 'Asia/Seoul')::date = (ends_at at time zone 'Asia/Seoul')::date),
  constraint event_proposals_settings_version check (settings_version > 0),
  constraint event_proposals_state check (state in ('pending', 'confirmed', 'cancelled', 'expired', 'conflict', 'stale')),
  constraint event_proposals_payload_fingerprint check (input_fingerprint ~ '^[0-9a-f]{32}$'),
  constraint event_proposals_request_fingerprint check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

create index event_proposals_owner_expiry_idx on public.event_proposals (owner_id, expires_at);

alter table public.event_proposals enable row level security;
revoke all on table public.event_proposals from public, anon, authenticated;

create or replace function public.store_availability_candidates(
  p_conversation_id uuid,
  p_search_id uuid,
  p_settings_version integer,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_settings_version integer;
  v_candidate jsonb;
  v_date date;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_candidate_id uuid;
  v_expires_at timestamptz := pg_catalog.clock_timestamp() + interval '10 minutes';
  v_result jsonb := '[]'::jsonb;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_conversation_id is null or p_search_id is null or p_settings_version is null or p_settings_version < 1
    or coalesce(jsonb_typeof(p_candidates), '') <> 'array'
    or jsonb_array_length(p_candidates) not between 1 and 3 then
    raise exception using errcode = '22023', message = 'invalid_candidates';
  end if;
  if not exists (
    select 1 from public.conversations as conversation
    where conversation.id = p_conversation_id and conversation.owner_id = v_owner_id
      and conversation.expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception using errcode = 'P0002', message = 'conversation_not_found';
  end if;

  perform public.initialize_user_availability(v_owner_id);
  select settings.version into v_settings_version
  from public.user_availability as settings
  where settings.owner_id = v_owner_id
  for share;
  if v_settings_version <> p_settings_version then
    raise exception using errcode = '40001', message = 'stale_availability';
  end if;

  delete from public.availability_candidates
  where owner_id = v_owner_id and expires_at <= pg_catalog.clock_timestamp();

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    if coalesce(jsonb_typeof(v_candidate), '') <> 'object'
      or coalesce(v_candidate->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(v_candidate->>'startsAt', '') = ''
      or coalesce(v_candidate->>'endsAt', '') = '' then
      raise exception using errcode = '22023', message = 'invalid_candidate';
    end if;
    begin
      v_date := (v_candidate->>'date')::date;
      v_starts_at := (v_candidate->>'startsAt')::timestamptz;
      v_ends_at := (v_candidate->>'endsAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'invalid_candidate';
    end;

    if (v_starts_at at time zone 'Asia/Seoul')::date <> v_date
      or (v_ends_at at time zone 'Asia/Seoul')::date <> v_date
      or v_starts_at < pg_catalog.clock_timestamp()
      or exists (
        select 1 from public.availability_exceptions as exception
        where exception.owner_id = v_owner_id and exception.start_date <= v_date and exception.end_date >= v_date
      )
      or not exists (
        select 1 from public.weekly_availability_windows as availability_window
        where availability_window.owner_id = v_owner_id
          and availability_window.weekday = extract(isodow from v_date)::integer
          and availability_window.starts_at <= (v_starts_at at time zone 'Asia/Seoul')::time
          and availability_window.ends_at >= (v_ends_at at time zone 'Asia/Seoul')::time
      ) then
      raise exception using errcode = '22023', message = 'invalid_candidate_window';
    end if;
    if exists (
      select 1 from public.events as event
      where event.owner_id = v_owner_id and event.starts_at < v_ends_at and event.ends_at > v_starts_at
    ) then
      raise exception using errcode = '23P01', message = 'candidate_conflict';
    end if;

    insert into public.availability_candidates (owner_id, conversation_id, search_id, starts_at, ends_at, settings_version, expires_at)
    values (v_owner_id, p_conversation_id, p_search_id, v_starts_at, v_ends_at, v_settings_version, v_expires_at)
    returning id into v_candidate_id;
    v_result := v_result || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_candidate_id,
      'searchId', p_search_id,
      'date', v_date,
      'start', pg_catalog.to_char(v_starts_at at time zone 'Asia/Seoul', 'HH24:MI'),
      'end', pg_catalog.to_char(v_ends_at at time zone 'Asia/Seoul', 'HH24:MI'),
      'expiresAt', v_expires_at,
      'settingsVersion', v_settings_version
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function public.create_event_proposal(
  p_conversation_id uuid,
  p_request_id uuid,
  p_request_fingerprint text,
  p_title text,
  p_note text,
  p_date date,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_settings_version integer,
  p_search_id uuid,
  p_candidate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_settings_version integer;
  v_candidate public.availability_candidates%rowtype;
  v_proposal public.event_proposals%rowtype;
  v_starts_at timestamptz := p_starts_at;
  v_ends_at timestamptz := p_ends_at;
  v_payload_fingerprint text;
  v_conflicts jsonb;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_conversation_id is null or p_request_id is null or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$'
    or p_settings_version is null or p_settings_version < 1
    or p_title is null or char_length(btrim(p_title)) not between 1 and 100
    or (p_note is not null and char_length(btrim(p_note)) > 500) then
    raise exception using errcode = '22023', message = 'invalid_proposal';
  end if;
  if not exists (
    select 1 from public.conversations as conversation
    where conversation.id = p_conversation_id and conversation.owner_id = v_owner_id
      and conversation.expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception using errcode = 'P0002', message = 'conversation_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner_id::text || ':proposal:' || p_request_id::text, 0));
  select proposal.* into v_proposal
  from public.event_proposals as proposal
  where proposal.owner_id = v_owner_id and proposal.request_id = p_request_id
  for update;
  if found then
    if v_proposal.request_fingerprint <> p_request_fingerprint then
      return pg_catalog.jsonb_build_object('status', 'request_conflict');
    end if;
    if v_proposal.state = 'pending' and v_proposal.expires_at <= pg_catalog.clock_timestamp() then
      update public.event_proposals set state = 'expired', updated_at = pg_catalog.clock_timestamp()
      where id = v_proposal.id returning * into v_proposal;
    end if;
    return pg_catalog.jsonb_build_object(
      'status', v_proposal.state,
      'proposal', pg_catalog.jsonb_build_object('id', v_proposal.id, 'conversationId', v_proposal.conversation_id, 'searchId', v_proposal.search_id, 'candidateId', v_proposal.candidate_id, 'title', v_proposal.title, 'note', v_proposal.note, 'startsAt', v_proposal.starts_at, 'endsAt', v_proposal.ends_at, 'settingsVersion', v_proposal.settings_version, 'state', v_proposal.state, 'expiresAt', v_proposal.expires_at),
      'result', v_proposal.result
    );
  end if;

  perform public.initialize_user_availability(v_owner_id);
  select settings.version into v_settings_version
  from public.user_availability as settings
  where settings.owner_id = v_owner_id
  for share;
  if v_settings_version <> p_settings_version then
    return pg_catalog.jsonb_build_object('status', 'stale');
  end if;

  if p_candidate_id is not null or p_search_id is not null then
    if p_candidate_id is null or p_search_id is null or p_date is not null or p_starts_at is not null or p_ends_at is not null then
      raise exception using errcode = '22023', message = 'invalid_candidate';
    end if;
    select candidate.* into v_candidate
    from public.availability_candidates as candidate
    where candidate.id = p_candidate_id and candidate.search_id = p_search_id
      and candidate.conversation_id = p_conversation_id and candidate.owner_id = v_owner_id
    for update;
    if not found then
      return pg_catalog.jsonb_build_object('status', 'candidate_not_found');
    end if;
    if v_candidate.expires_at <= pg_catalog.clock_timestamp() then
      return pg_catalog.jsonb_build_object('status', 'expired');
    end if;
    if v_candidate.settings_version <> v_settings_version then
      return pg_catalog.jsonb_build_object('status', 'stale');
    end if;
    v_starts_at := v_candidate.starts_at;
    v_ends_at := v_candidate.ends_at;
  elsif p_date is null or v_starts_at is null or v_ends_at is null
    or (v_starts_at at time zone 'Asia/Seoul')::date <> p_date
    or (v_ends_at at time zone 'Asia/Seoul')::date <> p_date then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;

  if v_starts_at < pg_catalog.clock_timestamp()
    or v_starts_at >= v_ends_at
    or extract(epoch from v_ends_at - v_starts_at) not between 900 and 14400
    or mod(extract(epoch from v_ends_at - v_starts_at), 900) <> 0
    or mod(extract(epoch from v_starts_at), 900) <> 0
    or mod(extract(epoch from v_ends_at), 900) <> 0
    or (v_starts_at at time zone 'Asia/Seoul')::date <> (v_ends_at at time zone 'Asia/Seoul')::date then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', event.title, 'startsAt', event.starts_at, 'endsAt', event.ends_at) order by event.starts_at), '[]'::jsonb)
  into v_conflicts
  from public.events as event
  where event.owner_id = v_owner_id and event.starts_at < v_ends_at and event.ends_at > v_starts_at;
  if pg_catalog.jsonb_array_length(v_conflicts) > 0 then
    return pg_catalog.jsonb_build_object('status', 'conflict', 'conflicts', v_conflicts);
  end if;

  v_payload_fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', btrim(p_title), nullif(btrim(p_note), ''), v_starts_at::text, v_ends_at::text, v_settings_version::text));
  insert into public.event_proposals (owner_id, conversation_id, request_id, request_fingerprint, input_fingerprint, candidate_id, search_id, title, note, starts_at, ends_at, settings_version)
  values (v_owner_id, p_conversation_id, p_request_id, p_request_fingerprint, v_payload_fingerprint, p_candidate_id, p_search_id, btrim(p_title), nullif(btrim(p_note), ''), v_starts_at, v_ends_at, v_settings_version)
  returning * into v_proposal;
  return pg_catalog.jsonb_build_object(
    'status', 'pending',
    'proposal', pg_catalog.jsonb_build_object('id', v_proposal.id, 'conversationId', v_proposal.conversation_id, 'searchId', v_proposal.search_id, 'candidateId', v_proposal.candidate_id, 'title', v_proposal.title, 'note', v_proposal.note, 'startsAt', v_proposal.starts_at, 'endsAt', v_proposal.ends_at, 'settingsVersion', v_proposal.settings_version, 'state', v_proposal.state, 'expiresAt', v_proposal.expires_at)
  );
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
  select proposal.* into v_proposal
  from public.event_proposals as proposal
  where proposal.owner_id = v_owner_id and proposal.request_id = p_request_id;
  if not found then
    return null;
  end if;
  if v_proposal.request_fingerprint <> p_request_fingerprint then
    return pg_catalog.jsonb_build_object('status', 'request_conflict');
  end if;
  if v_proposal.state = 'pending' and v_proposal.expires_at <= pg_catalog.clock_timestamp() then
    update public.event_proposals set state = 'expired', updated_at = pg_catalog.clock_timestamp()
    where id = v_proposal.id returning * into v_proposal;
  end if;
  return pg_catalog.jsonb_build_object(
    'status', v_proposal.state,
    'proposal', pg_catalog.jsonb_build_object('id', v_proposal.id, 'conversationId', v_proposal.conversation_id, 'searchId', v_proposal.search_id, 'candidateId', v_proposal.candidate_id, 'title', v_proposal.title, 'note', v_proposal.note, 'startsAt', v_proposal.starts_at, 'endsAt', v_proposal.ends_at, 'settingsVersion', v_proposal.settings_version, 'state', v_proposal.state, 'expiresAt', v_proposal.expires_at),
    'result', v_proposal.result
  );
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
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_proposal_id is null then
    raise exception using errcode = '22023', message = 'invalid_proposal';
  end if;
  select proposal.* into v_proposal
  from public.event_proposals as proposal
  where proposal.id = p_proposal_id and proposal.owner_id = v_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'proposal_not_found';
  end if;
  if v_proposal.state = 'confirmed' then
    return pg_catalog.jsonb_build_object('status', 'confirmed', 'proposalId', v_proposal.id, 'event', v_proposal.result);
  end if;
  if v_proposal.state <> 'pending' then
    return pg_catalog.jsonb_build_object('status', v_proposal.state, 'proposalId', v_proposal.id, 'result', v_proposal.result);
  end if;
  if v_proposal.expires_at <= pg_catalog.clock_timestamp() then
    update public.event_proposals set state = 'expired', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'expired', 'proposalId', v_proposal.id);
  end if;

  select settings.version into v_settings_version
  from public.user_availability as settings
  where settings.owner_id = v_owner_id
  for share;
  if not found or v_settings_version <> v_proposal.settings_version then
    update public.event_proposals set state = 'stale', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'stale', 'proposalId', v_proposal.id);
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', event.title, 'startsAt', event.starts_at, 'endsAt', event.ends_at) order by event.starts_at), '[]'::jsonb)
  into v_conflicts
  from public.events as event
  where event.owner_id = v_owner_id and event.starts_at < v_proposal.ends_at and event.ends_at > v_proposal.starts_at;
  if pg_catalog.jsonb_array_length(v_conflicts) > 0 then
    update public.event_proposals set state = 'conflict', result = v_conflicts, updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'conflict', 'proposalId', v_proposal.id, 'conflicts', v_conflicts);
  end if;

  begin
    insert into public.events (owner_id, title, note, starts_at, ends_at)
    values (v_owner_id, v_proposal.title, v_proposal.note, v_proposal.starts_at, v_proposal.ends_at)
    returning * into v_event;
  exception when exclusion_violation then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('title', event.title, 'startsAt', event.starts_at, 'endsAt', event.ends_at) order by event.starts_at), '[]'::jsonb)
    into v_conflicts
    from public.events as event
    where event.owner_id = v_owner_id and event.starts_at < v_proposal.ends_at and event.ends_at > v_proposal.starts_at;
    update public.event_proposals set state = 'conflict', result = v_conflicts, updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'conflict', 'proposalId', v_proposal.id, 'conflicts', v_conflicts);
  end;

  update public.event_proposals
  set state = 'confirmed', result = pg_catalog.to_jsonb(v_event), updated_at = pg_catalog.clock_timestamp()
  where id = v_proposal.id;
  return pg_catalog.jsonb_build_object('status', 'confirmed', 'proposalId', v_proposal.id, 'event', pg_catalog.to_jsonb(v_event));
end;
$$;

create or replace function public.cancel_event_proposal(p_proposal_id uuid)
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
  if p_proposal_id is null then
    raise exception using errcode = '22023', message = 'invalid_proposal';
  end if;
  select proposal.* into v_proposal
  from public.event_proposals as proposal
  where proposal.id = p_proposal_id and proposal.owner_id = v_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'proposal_not_found';
  end if;
  if v_proposal.state = 'pending' and v_proposal.expires_at <= pg_catalog.clock_timestamp() then
    update public.event_proposals set state = 'expired', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'expired', 'proposalId', v_proposal.id);
  end if;
  if v_proposal.state = 'pending' then
    update public.event_proposals set state = 'cancelled', updated_at = pg_catalog.clock_timestamp() where id = v_proposal.id;
    return pg_catalog.jsonb_build_object('status', 'cancelled', 'proposalId', v_proposal.id);
  end if;
  return pg_catalog.jsonb_build_object('status', v_proposal.state, 'proposalId', v_proposal.id, 'result', v_proposal.result);
end;
$$;

revoke all on function public.store_availability_candidates(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.create_event_proposal(uuid, uuid, text, text, text, date, timestamptz, timestamptz, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_event_proposal_for_request(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_event_proposal(uuid) from public, anon, authenticated;
revoke all on function public.cancel_event_proposal(uuid) from public, anon, authenticated;
grant execute on function public.store_availability_candidates(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.create_event_proposal(uuid, uuid, text, text, text, date, timestamptz, timestamptz, integer, uuid, uuid) to authenticated;
grant execute on function public.get_event_proposal_for_request(uuid, text) to authenticated;
grant execute on function public.confirm_event_proposal(uuid) to authenticated;
grant execute on function public.cancel_event_proposal(uuid) to authenticated;

create or replace function public.enforce_event_activity_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'not_event_owner';
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception using errcode = '42501', message = 'not_event_owner';
  end if;
  return new;
end;
$$;
