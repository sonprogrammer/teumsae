create extension if not exists btree_gist;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  note text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_length check (char_length(btrim(title)) between 1 and 100),
  constraint events_note_length check (note is null or char_length(note) <= 500),
  constraint events_time_order check (starts_at < ends_at),
  constraint events_duration check (
    extract(epoch from ends_at - starts_at) between 900 and 14400
    and mod(extract(epoch from ends_at - starts_at), 900) = 0
  ),
  constraint events_quarter_hour check (
    mod(extract(epoch from starts_at), 900) = 0
    and mod(extract(epoch from ends_at), 900) = 0
  ),
  constraint events_same_korea_date check (
    (starts_at at time zone 'Asia/Seoul')::date = (ends_at at time zone 'Asia/Seoul')::date
  ),
  constraint events_version_positive check (version > 0),
  constraint events_owner_time_exclusion exclude using gist (
    owner_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
);

create index events_owner_starts_at_idx on public.events (owner_id, starts_at);

create table public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  day_start time without time zone not null default '09:00',
  day_end time without time zone not null default '21:00',
  timezone text not null default 'Asia/Seoul',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_settings_day_order check (day_start < day_end),
  constraint user_settings_quarter_hour check (
    mod(extract(epoch from day_start), 900) = 0
    and mod(extract(epoch from day_end), 900) = 0
  ),
  constraint user_settings_timezone check (timezone = 'Asia/Seoul'),
  constraint user_settings_version_positive check (version > 0)
);

alter table public.events enable row level security;
alter table public.user_settings enable row level security;

revoke all on table public.events from anon, authenticated;
revoke all on table public.user_settings from anon, authenticated;
grant select on table public.events to authenticated;
grant select on table public.user_settings to authenticated;

create policy "Users can read their events"
on public.events for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can read their settings"
on public.user_settings for select to authenticated
using ((select auth.uid()) = owner_id);
