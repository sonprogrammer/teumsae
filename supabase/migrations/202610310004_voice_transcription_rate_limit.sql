alter table public.ai_usage drop constraint if exists ai_usage_scope_check;
alter table public.ai_usage add constraint ai_usage_scope_check check (scope in ('user_minute', 'user_speech_minute'));

create or replace function public.consume_speech_request()
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

  perform pg_advisory_xact_lock(hashtextextended('teumsae:speech-minute:' || current_user_id::text || ':' || minute_bucket::text, 0));

  select request_count into minute_count
  from public.ai_usage
  where scope = 'user_speech_minute' and owner_id = current_user_id and bucket_start = minute_bucket;

  if coalesce(minute_count, 0) >= 3 then
    return false;
  end if;

  insert into public.ai_usage as usage (scope, owner_id, bucket_start, request_count)
  values ('user_speech_minute', current_user_id, minute_bucket, 1)
  on conflict (scope, owner_id, bucket_start) do update set request_count = usage.request_count + 1;

  delete from public.ai_usage where bucket_start < request_timestamp - interval '2 days';
  return true;
end;
$$;

revoke all on function public.consume_speech_request() from public, anon;
grant execute on function public.consume_speech_request() to authenticated;
