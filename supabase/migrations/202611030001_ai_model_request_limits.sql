alter table public.ai_usage add column if not exists token_count bigint not null default 0 check (token_count >= 0);

alter table public.ai_usage drop constraint if exists ai_usage_scope_check;
alter table public.ai_usage add constraint ai_usage_scope_check check (scope in ('user_minute', 'user_speech_minute', 'groq_project_minute', 'groq_project_day'));

alter table public.ai_usage drop constraint if exists ai_usage_scope_owner;
alter table public.ai_usage add constraint ai_usage_scope_owner check (
  (scope in ('groq_project_minute', 'groq_project_day') and owner_id = '00000000-0000-0000-0000-000000000000'::uuid)
  or (scope not in ('groq_project_minute', 'groq_project_day') and owner_id <> '00000000-0000-0000-0000-000000000000'::uuid)
);

create or replace function public.consume_ai_request()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  request_timestamp timestamptz := now();
  minute_bucket timestamptz := date_trunc('minute', now());
  minute_count integer;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('teumsae:user-minute:' || current_user_id::text || ':' || minute_bucket::text, 0));

  select request_count into minute_count
  from public.ai_usage
  where scope = 'user_minute' and owner_id = current_user_id and bucket_start = minute_bucket;

  if coalesce(minute_count, 0) >= 10 then
    return false;
  end if;

  insert into public.ai_usage as usage (scope, owner_id, bucket_start, request_count)
  values ('user_minute', current_user_id, minute_bucket, 1)
  on conflict (scope, owner_id, bucket_start) do update set request_count = usage.request_count + 1;

  delete from public.ai_usage where bucket_start < request_timestamp - interval '2 days';
  return true;
end;
$$;

revoke all on function public.consume_ai_request() from public, anon;
grant execute on function public.consume_ai_request() to authenticated;

create or replace function public.consume_groq_model_request()
returns table (allowed boolean, limit_scope text, retry_after_seconds integer, usage_minute_bucket timestamptz, usage_day_bucket timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  project_id constant uuid := '00000000-0000-0000-0000-000000000000';
  request_timestamp timestamptz := now();
  minute_bucket timestamptz := date_trunc('minute', now());
  day_bucket timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  minute_count integer;
  day_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('teumsae:groq-minute:' || minute_bucket::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('teumsae:groq-day:' || day_bucket::text, 0));

  select request_count into minute_count
  from public.ai_usage
  where scope = 'groq_project_minute' and owner_id = project_id and bucket_start = minute_bucket;

  select request_count into day_count
  from public.ai_usage
  where scope = 'groq_project_day' and owner_id = project_id and bucket_start = day_bucket;

  if coalesce(minute_count, 0) >= 30 then
    return query select false, 'groq_minute'::text, greatest(1, ceil(extract(epoch from (minute_bucket + interval '1 minute' - request_timestamp)))::integer), minute_bucket, day_bucket;
    return;
  end if;

  if coalesce(day_count, 0) >= 1000 then
    return query select false, 'groq_day'::text, greatest(1, ceil(extract(epoch from (day_bucket + interval '1 day' - request_timestamp)))::integer), minute_bucket, day_bucket;
    return;
  end if;

  insert into public.ai_usage as usage (scope, owner_id, bucket_start, request_count)
  values
    ('groq_project_minute', project_id, minute_bucket, 1),
    ('groq_project_day', project_id, day_bucket, 1)
  on conflict (scope, owner_id, bucket_start) do update set request_count = usage.request_count + 1;

  delete from public.ai_usage where scope in ('groq_project_minute', 'groq_project_day') and bucket_start < request_timestamp - interval '2 days';
  return query select true, null::text, 0, minute_bucket, day_bucket;
end;
$$;

create or replace function public.record_groq_model_usage(p_token_count integer, p_minute_bucket timestamptz, p_day_bucket timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_id constant uuid := '00000000-0000-0000-0000-000000000000';
  minute_rows integer;
  day_rows integer;
begin
  if p_token_count is null or p_token_count < 0 or p_token_count > 200000 then
    raise exception 'invalid token usage' using errcode = '22023';
  end if;

  update public.ai_usage
  set token_count = token_count + p_token_count
  where owner_id = project_id and scope = 'groq_project_minute' and bucket_start = p_minute_bucket;

  get diagnostics minute_rows = row_count;

  update public.ai_usage
  set token_count = token_count + p_token_count
  where owner_id = project_id and scope = 'groq_project_day' and bucket_start = p_day_bucket;

  get diagnostics day_rows = row_count;

  if minute_rows + day_rows <> 2 then
    raise exception 'model request reservation missing' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.consume_groq_model_request() from public, anon, authenticated;
revoke all on function public.record_groq_model_usage(integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_groq_model_request() to service_role;
grant execute on function public.record_groq_model_usage(integer, timestamptz, timestamptz) to service_role;
