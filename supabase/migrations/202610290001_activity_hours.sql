create or replace function public.get_activity_hours()
returns table (
  day_start text,
  day_end text,
  timezone text,
  version integer,
  updated_at timestamptz
)
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

  insert into public.user_settings (owner_id)
  values (v_owner_id)
  on conflict (owner_id) do nothing;

  return query
  select to_char(settings.day_start, 'HH24:MI'),
         to_char(settings.day_end, 'HH24:MI'),
         settings.timezone,
         settings.version,
         settings.updated_at
  from public.user_settings as settings
  where settings.owner_id = v_owner_id;
end;
$$;

create or replace function public.update_activity_hours(
  p_day_start time without time zone,
  p_day_end time without time zone,
  p_expected_version integer
)
returns table (
  day_start text,
  day_end text,
  timezone text,
  version integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_version integer;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_day_start is null or p_day_end is null
    or p_day_start >= p_day_end
    or p_day_end >= time '24:00'
    or mod(extract(epoch from p_day_start), 900) <> 0
    or mod(extract(epoch from p_day_end), 900) <> 0
    or p_expected_version is null
    or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_activity_hours';
  end if;

  insert into public.user_settings (owner_id)
  values (v_owner_id)
  on conflict (owner_id) do nothing;

  select settings.version into v_version
  from public.user_settings as settings
  where settings.owner_id = v_owner_id
  for update;
  if v_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'stale_settings';
  end if;

  update public.user_settings as settings
  set day_start = p_day_start,
      day_end = p_day_end,
      version = settings.version + 1,
      updated_at = pg_catalog.clock_timestamp()
  where settings.owner_id = v_owner_id;

  return query
  select to_char(settings.day_start, 'HH24:MI'),
         to_char(settings.day_end, 'HH24:MI'),
         settings.timezone,
         settings.version,
         settings.updated_at
  from public.user_settings as settings
  where settings.owner_id = v_owner_id;
end;
$$;

create or replace function public.enforce_event_activity_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start time without time zone;
  v_day_end time without time zone;
begin
  if new.owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'not_event_owner';
  end if;
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception using errcode = '42501', message = 'not_event_owner';
  end if;
  if tg_op = 'UPDATE'
    and new.starts_at is not distinct from old.starts_at
    and new.ends_at is not distinct from old.ends_at then
    return new;
  end if;

  select settings.day_start, settings.day_end
  into v_day_start, v_day_end
  from public.user_settings as settings
  where settings.owner_id = new.owner_id
  for share;
  if not found then
    v_day_start := time '09:00';
    v_day_end := time '21:00';
  end if;

  if (new.starts_at at time zone 'Asia/Seoul')::time < v_day_start
    or (new.ends_at at time zone 'Asia/Seoul')::time > v_day_end then
    raise exception using errcode = '22023', message = 'outside_activity_hours';
  end if;
  return new;
end;
$$;

revoke all on function public.get_activity_hours() from public, anon, authenticated;
revoke all on function public.update_activity_hours(time without time zone, time without time zone, integer) from public, anon, authenticated;
revoke all on function public.enforce_event_activity_hours() from public, anon, authenticated;
grant execute on function public.get_activity_hours() to authenticated;
grant execute on function public.update_activity_hours(time without time zone, time without time zone, integer) to authenticated;

drop trigger if exists events_enforce_activity_hours on public.events;
create trigger events_enforce_activity_hours
before insert or update of starts_at, ends_at, owner_id on public.events
for each row execute function public.enforce_event_activity_hours();
