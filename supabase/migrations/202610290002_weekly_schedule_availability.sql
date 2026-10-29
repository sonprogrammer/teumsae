create extension if not exists btree_gist;

create table public.user_availability (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1,
  timezone text not null default 'Asia/Seoul',
  updated_at timestamptz not null default now(),
  constraint user_availability_timezone check (timezone = 'Asia/Seoul'),
  constraint user_availability_version_positive check (version > 0)
);

create table public.weekly_availability_windows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null,
  starts_at time without time zone not null,
  ends_at time without time zone not null,
  constraint weekly_availability_weekday check (weekday between 1 and 7),
  constraint weekly_availability_time_order check (starts_at < ends_at and ends_at < time '24:00'),
  constraint weekly_availability_quarter_hour check (
    mod(extract(epoch from starts_at), 900) = 0
    and mod(extract(epoch from ends_at), 900) = 0
  ),
  constraint weekly_availability_no_overlap exclude using gist (
    owner_id with =,
    weekday with =,
    pg_catalog.tsrange(date '2000-01-01' + starts_at, date '2000-01-01' + ends_at, '[)') with &&
  )
);

create index weekly_availability_owner_weekday_idx on public.weekly_availability_windows (owner_id, weekday, starts_at);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  label text,
  constraint availability_exception_date_order check (start_date <= end_date),
  constraint availability_exception_label_length check (label is null or char_length(btrim(label)) <= 100),
  constraint availability_exception_no_overlap exclude using gist (
    owner_id with =,
    pg_catalog.daterange(start_date, end_date, '[]') with &&
  )
);

create index availability_exceptions_owner_dates_idx on public.availability_exceptions (owner_id, start_date, end_date);

alter table public.user_availability enable row level security;
alter table public.weekly_availability_windows enable row level security;
alter table public.availability_exceptions enable row level security;

revoke all on table public.user_availability from anon, authenticated;
revoke all on table public.weekly_availability_windows from anon, authenticated;
revoke all on table public.availability_exceptions from anon, authenticated;
grant select on table public.user_availability to authenticated;
grant select on table public.weekly_availability_windows to authenticated;
grant select on table public.availability_exceptions to authenticated;

create policy "Users can read their availability settings"
on public.user_availability for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can read their weekly availability"
on public.weekly_availability_windows for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can read their availability exceptions"
on public.availability_exceptions for select to authenticated
using ((select auth.uid()) = owner_id);

create or replace function public.initialize_user_availability(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created boolean := false;
  v_starts_at time without time zone := time '09:00';
  v_ends_at time without time zone := time '21:00';
  v_weekday integer;
begin
  insert into public.user_availability (owner_id)
  values (p_owner_id)
  on conflict (owner_id) do nothing
  returning true into v_created;
  if not coalesce(v_created, false) then
    return;
  end if;

  select settings.day_start, settings.day_end
  into v_starts_at, v_ends_at
  from public.user_settings as settings
  where settings.owner_id = p_owner_id;
  if not found then
    v_starts_at := time '09:00';
    v_ends_at := time '21:00';
  end if;

  for v_weekday in 1..7 loop
    insert into public.weekly_availability_windows (owner_id, weekday, starts_at, ends_at)
    values (p_owner_id, v_weekday, v_starts_at, v_ends_at);
  end loop;
end;
$$;

create or replace function public.get_schedule_availability()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_availability jsonb;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  perform public.initialize_user_availability(v_owner_id);

  select jsonb_build_object(
    'timezone', settings.timezone,
    'version', settings.version,
    'weekly', (
      select jsonb_agg(jsonb_build_object(
        'weekday', days.weekday,
        'windows', coalesce((
          select jsonb_agg(jsonb_build_object(
            'start', to_char(windows.starts_at, 'HH24:MI'),
            'end', to_char(windows.ends_at, 'HH24:MI')
          ) order by windows.starts_at)
          from public.weekly_availability_windows as windows
          where windows.owner_id = settings.owner_id and windows.weekday = days.weekday
        ), '[]'::jsonb)
      ) order by days.weekday)
      from generate_series(1, 7) as days(weekday)
    ),
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', exceptions.id,
        'startDate', exceptions.start_date,
        'endDate', exceptions.end_date,
        'label', exceptions.label
      ) order by exceptions.start_date)
      from public.availability_exceptions as exceptions
      where exceptions.owner_id = settings.owner_id
    ), '[]'::jsonb)
  ) into v_availability
  from public.user_availability as settings
  where settings.owner_id = v_owner_id;
  return v_availability;
end;
$$;

create or replace function public.update_schedule_availability(
  p_expected_version integer,
  p_weekly jsonb,
  p_exceptions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_version integer;
  v_day jsonb;
  v_window jsonb;
  v_exception jsonb;
  v_weekday integer;
  v_weekdays integer[] := array[]::integer[];
  v_windows jsonb;
  v_start_text text;
  v_end_text text;
  v_start_time time without time zone;
  v_end_time time without time zone;
  v_start_date date;
  v_end_date date;
  v_label text;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_expected_version is null or p_expected_version < 1
    or coalesce(jsonb_typeof(p_weekly), '') <> 'array'
    or coalesce(jsonb_typeof(p_exceptions), '') <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_availability';
  end if;
  if jsonb_array_length(p_weekly) <> 7 then
    raise exception using errcode = '22023', message = 'invalid_availability';
  end if;

  perform public.initialize_user_availability(v_owner_id);
  select settings.version into v_version
  from public.user_availability as settings
  where settings.owner_id = v_owner_id
  for update;
  if v_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale_availability';
  end if;

  for v_day in select value from jsonb_array_elements(p_weekly)
  loop
    if coalesce(jsonb_typeof(v_day), '') <> 'object'
      or coalesce(v_day->>'weekday', '') !~ '^[1-7]$'
      or coalesce(jsonb_typeof(v_day->'windows'), '') <> 'array' then
      raise exception using errcode = '22023', message = 'invalid_weekday_availability';
    end if;
    v_weekday := (v_day->>'weekday')::integer;
    if v_weekday = any(v_weekdays) then
      raise exception using errcode = '22023', message = 'duplicate_weekday_availability';
    end if;
    v_weekdays := array_append(v_weekdays, v_weekday);

    for v_window in select value from jsonb_array_elements(v_day->'windows')
    loop
      if coalesce(jsonb_typeof(v_window), '') <> 'object' then
        raise exception using errcode = '22023', message = 'invalid_availability_window';
      end if;
      v_start_text := v_window->>'start';
      v_end_text := v_window->>'end';
      if coalesce(v_start_text, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(v_end_text, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception using errcode = '22023', message = 'invalid_availability_window';
      end if;
      v_start_time := v_start_text::time;
      v_end_time := v_end_text::time;
      if v_start_time >= v_end_time
        or mod(extract(epoch from v_start_time), 900) <> 0
        or mod(extract(epoch from v_end_time), 900) <> 0 then
        raise exception using errcode = '22023', message = 'invalid_availability_window';
      end if;
    end loop;
  end loop;
  if cardinality(v_weekdays) <> 7 then
    raise exception using errcode = '22023', message = 'missing_weekday_availability';
  end if;

  for v_exception in select value from jsonb_array_elements(p_exceptions)
  loop
    if coalesce(jsonb_typeof(v_exception), '') <> 'object'
      or coalesce(v_exception->>'startDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(v_exception->>'endDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(jsonb_typeof(v_exception->'label'), 'null') not in ('null', 'string') then
      raise exception using errcode = '22023', message = 'invalid_availability_exception';
    end if;
    begin
      v_start_date := (v_exception->>'startDate')::date;
      v_end_date := (v_exception->>'endDate')::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'invalid_availability_exception';
    end;
    v_label := nullif(btrim(v_exception->>'label'), '');
    if v_start_date > v_end_date or char_length(coalesce(v_label, '')) > 100 then
      raise exception using errcode = '22023', message = 'invalid_availability_exception';
    end if;
  end loop;

  delete from public.weekly_availability_windows where owner_id = v_owner_id;
  delete from public.availability_exceptions where owner_id = v_owner_id;

  insert into public.weekly_availability_windows (owner_id, weekday, starts_at, ends_at)
  select v_owner_id,
         (day.value->>'weekday')::smallint,
         (availability_window.value->>'start')::time,
         (availability_window.value->>'end')::time
  from jsonb_array_elements(p_weekly) as day(value)
  cross join lateral jsonb_array_elements(day.value->'windows') as availability_window(value);

  insert into public.availability_exceptions (owner_id, start_date, end_date, label)
  select v_owner_id,
         (availability_exception.value->>'startDate')::date,
         (availability_exception.value->>'endDate')::date,
         nullif(btrim(availability_exception.value->>'label'), '')
  from jsonb_array_elements(p_exceptions) as availability_exception(value);

  update public.user_availability as settings
  set version = settings.version + 1,
      updated_at = pg_catalog.clock_timestamp()
  where settings.owner_id = v_owner_id;

  return public.get_schedule_availability();
end;
$$;

revoke all on function public.initialize_user_availability(uuid) from public, anon, authenticated;
revoke all on function public.get_schedule_availability() from public, anon, authenticated;
revoke all on function public.update_schedule_availability(integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.get_schedule_availability() to authenticated;
grant execute on function public.update_schedule_availability(integer, jsonb, jsonb) to authenticated;

drop trigger if exists events_enforce_activity_hours on public.events;
drop function if exists public.enforce_event_activity_hours();
