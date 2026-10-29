create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_messages_array check (jsonb_typeof(messages) = 'array'),
  constraint conversations_context_object check (jsonb_typeof(context) = 'object'),
  constraint conversations_version_positive check (version > 0)
);

create index conversations_owner_expiry_idx on public.conversations (owner_id, expires_at);

alter table public.conversations enable row level security;
revoke all on table public.conversations from anon;
grant select, insert, update, delete on table public.conversations to authenticated;

create policy "Users can read their conversations"
on public.conversations for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "Users can create their conversations"
on public.conversations for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Users can update their conversations"
on public.conversations for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "Users can delete their conversations"
on public.conversations for delete to authenticated
using ((select auth.uid()) = owner_id);

create table public.ai_usage (
  scope text not null check (scope in ('user_minute', 'user_day', 'project_day')),
  owner_id uuid not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  constraint ai_usage_scope_owner check (
    (scope = 'project_day' and owner_id = '00000000-0000-0000-0000-000000000000'::uuid)
    or (scope <> 'project_day' and owner_id <> '00000000-0000-0000-0000-000000000000'::uuid)
  ),
  primary key (scope, owner_id, bucket_start)
);

alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;

create function public.consume_ai_request()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  request_timestamp timestamptz := now();
  minute_bucket timestamptz := date_trunc('minute', now());
  user_day_bucket timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  project_id constant uuid := '00000000-0000-0000-0000-000000000000';
  minute_count integer;
  user_day_count integer;
  project_day_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teumsae:project:' || user_day_bucket::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('teumsae:user-day:' || current_user_id::text || ':' || user_day_bucket::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('teumsae:user-minute:' || current_user_id::text || ':' || minute_bucket::text, 0));

  select request_count into project_day_count from public.ai_usage where scope = 'project_day' and owner_id = project_id and bucket_start = user_day_bucket;
  select request_count into user_day_count from public.ai_usage where scope = 'user_day' and owner_id = current_user_id and bucket_start = user_day_bucket;
  select request_count into minute_count from public.ai_usage where scope = 'user_minute' and owner_id = current_user_id and bucket_start = minute_bucket;

  if coalesce(project_day_count, 0) >= 100 or coalesce(user_day_count, 0) >= 15 or coalesce(minute_count, 0) >= 3 then
    return false;
  end if;

  insert into public.ai_usage as usage (scope, owner_id, bucket_start, request_count)
  values ('project_day', project_id, user_day_bucket, 1), ('user_day', current_user_id, user_day_bucket, 1), ('user_minute', current_user_id, minute_bucket, 1)
  on conflict (scope, owner_id, bucket_start) do update set request_count = usage.request_count + 1;

  delete from public.ai_usage where bucket_start < request_timestamp - interval '2 days';
  return true;
end;
$$;

revoke all on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;
