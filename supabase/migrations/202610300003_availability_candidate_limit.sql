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
    or jsonb_array_length(p_candidates) not between 1 and 12 then
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
