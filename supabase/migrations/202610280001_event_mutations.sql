create or replace function public.create_event(
  p_title text,
  p_note text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_event public.events;
  v_duration_seconds numeric;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_title';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception using errcode = '22023', message = 'invalid_note';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at < pg_catalog.clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;

  v_duration_seconds := extract(epoch from p_ends_at - p_starts_at);
  if p_starts_at >= p_ends_at
    or v_duration_seconds not between 900 and 14400
    or mod(v_duration_seconds, 900) <> 0
    or mod(extract(epoch from p_starts_at), 900) <> 0
    or mod(extract(epoch from p_ends_at), 900) <> 0
    or (p_starts_at at time zone 'Asia/Seoul')::date <> (p_ends_at at time zone 'Asia/Seoul')::date then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;

  insert into public.events (owner_id, title, note, starts_at, ends_at)
  values (v_owner_id, btrim(p_title), nullif(btrim(p_note), ''), p_starts_at, p_ends_at)
  returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.update_event(
  p_event_id uuid,
  p_expected_version integer,
  p_title text,
  p_note text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_event public.events;
  v_current_version integer;
  v_current_starts_at timestamptz;
  v_duration_seconds numeric;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_event_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_event_version';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_title';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 500 then
    raise exception using errcode = '22023', message = 'invalid_note';
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;

  v_duration_seconds := extract(epoch from p_ends_at - p_starts_at);
  if p_starts_at >= p_ends_at
    or v_duration_seconds not between 900 and 14400
    or mod(v_duration_seconds, 900) <> 0
    or mod(extract(epoch from p_starts_at), 900) <> 0
    or mod(extract(epoch from p_ends_at), 900) <> 0
    or (p_starts_at at time zone 'Asia/Seoul')::date <> (p_ends_at at time zone 'Asia/Seoul')::date then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;

  select version, starts_at into v_current_version, v_current_starts_at
  from public.events
  where id = p_event_id and owner_id = v_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;
  if v_current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale_event';
  end if;
  if v_current_starts_at >= pg_catalog.clock_timestamp() and p_starts_at < pg_catalog.clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid_event_time';
  end if;

  update public.events
  set title = btrim(p_title),
      note = nullif(btrim(p_note), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      version = version + 1,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id and owner_id = v_owner_id
  returning * into v_event;
  return v_event;
end;
$$;

create or replace function public.delete_event(p_event_id uuid, p_expected_version integer)
returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_current_version integer;
  v_event public.events;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_event_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_event_version';
  end if;

  select version into v_current_version
  from public.events
  where id = p_event_id and owner_id = v_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;
  if v_current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale_event';
  end if;

  delete from public.events
  where id = p_event_id and owner_id = v_owner_id
  returning * into v_event;
  return v_event;
end;
$$;

revoke all on function public.create_event(text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.update_event(uuid, integer, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.delete_event(uuid, integer) from public, anon, authenticated;

grant execute on function public.create_event(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.update_event(uuid, integer, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_event(uuid, integer) to authenticated;
