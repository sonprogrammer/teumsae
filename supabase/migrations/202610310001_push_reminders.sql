create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 1 and 2048),
  constraint push_subscriptions_p256dh_length check (char_length(p256dh) between 8 and 256),
  constraint push_subscriptions_auth_key_length check (char_length(auth_key) between 8 and 256)
);

create index push_subscriptions_owner_active_idx on public.push_subscriptions (owner_id) where disabled_at is null;

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create policy "Users manage their own push subscriptions"
on public.push_subscriptions for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create table public.event_reminder_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  minutes_before smallint not null default 15,
  updated_at timestamptz not null default now(),
  constraint event_reminder_preferences_lead_time check (minutes_before in (5, 10, 15, 30, 60))
);

alter table public.event_reminder_preferences enable row level security;
revoke all on table public.event_reminder_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.event_reminder_preferences to authenticated;

create policy "Users manage their own reminder preferences"
on public.event_reminder_preferences for all to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create table public.event_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_version integer not null,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  reminder_at timestamptz not null,
  status text not null default 'pending',
  attempt_count smallint not null default 0,
  retry_after timestamptz not null default now(),
  lease_until timestamptz,
  sent_at timestamptz,
  last_status_code integer,
  last_error_code text,
  created_at timestamptz not null default now(),
  constraint event_reminder_deliveries_event_version check (event_version > 0),
  constraint event_reminder_deliveries_attempt_count check (attempt_count between 0 and 3),
  constraint event_reminder_deliveries_status check (status in ('pending', 'processing', 'sent', 'failed')),
  constraint event_reminder_deliveries_unique unique (event_id, subscription_id, reminder_at)
);

create index event_reminder_deliveries_claim_idx on public.event_reminder_deliveries (retry_after, reminder_at) where status in ('pending', 'processing');
alter table public.event_reminder_deliveries enable row level security;
revoke all on table public.event_reminder_deliveries from public, anon, authenticated;
grant all on table public.event_reminder_deliveries to service_role;

create or replace function public.claim_event_reminder_deliveries(p_now timestamptz default pg_catalog.clock_timestamp())
returns table (
  delivery_id uuid,
  event_id uuid,
  subscription_id uuid,
  owner_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  starts_at timestamptz,
  minutes_before smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  insert into public.event_reminder_deliveries (owner_id, event_id, event_version, subscription_id, reminder_at)
  select event_row.owner_id, event_row.id, event_row.version, subscription.id,
    event_row.starts_at - (preference.minutes_before * interval '1 minute')
  from public.events as event_row
  join public.event_reminder_preferences as preference on preference.owner_id = event_row.owner_id and preference.enabled
  join public.push_subscriptions as subscription on subscription.owner_id = event_row.owner_id and subscription.disabled_at is null
  where event_row.starts_at > p_now
    and event_row.starts_at - (preference.minutes_before * interval '1 minute') <= p_now
    and event_row.starts_at - (preference.minutes_before * interval '1 minute') > p_now - interval '10 minutes'
  on conflict (event_id, subscription_id, reminder_at) do update
  set event_version = excluded.event_version,
      status = 'pending',
      attempt_count = 0,
      retry_after = p_now,
      lease_until = null
  where public.event_reminder_deliveries.status in ('pending', 'failed')
    and public.event_reminder_deliveries.event_version <> excluded.event_version;

  return query
  with candidates as (
    select delivery.id
    from public.event_reminder_deliveries as delivery
    join public.events as event_row on event_row.id = delivery.event_id and event_row.owner_id = delivery.owner_id and event_row.version = delivery.event_version
    join public.push_subscriptions as subscription on subscription.id = delivery.subscription_id and subscription.owner_id = delivery.owner_id and subscription.disabled_at is null
    join public.event_reminder_preferences as preference on preference.owner_id = delivery.owner_id and preference.enabled
    where delivery.attempt_count < 3
      and ((delivery.status = 'pending' and delivery.retry_after <= p_now) or (delivery.status = 'processing' and delivery.lease_until <= p_now))
    order by delivery.reminder_at, delivery.id
    limit 100
    for update of delivery skip locked
  ), claimed as (
    update public.event_reminder_deliveries as delivery
    set status = 'processing', attempt_count = delivery.attempt_count + 1, lease_until = p_now + interval '2 minutes', retry_after = p_now
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.event_id, delivery.subscription_id, delivery.owner_id
  )
  select claimed.id, event_row.id, subscription.id, claimed.owner_id, subscription.endpoint, subscription.p256dh, subscription.auth_key, event_row.starts_at, preference.minutes_before
  from claimed
  join public.events as event_row on event_row.id = claimed.event_id and event_row.owner_id = claimed.owner_id
  join public.push_subscriptions as subscription on subscription.id = claimed.subscription_id and subscription.owner_id = claimed.owner_id
  join public.event_reminder_preferences as preference on preference.owner_id = claimed.owner_id;
end;
$$;

create or replace function public.complete_event_reminder_delivery(p_delivery_id uuid, p_success boolean, p_status_code integer, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.event_reminder_deliveries%rowtype;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  update public.event_reminder_deliveries as delivery
  set status = case when p_success then 'sent' when p_status_code in (404, 410) or delivery.attempt_count >= 3 then 'failed' else 'pending' end,
    sent_at = case when p_success then pg_catalog.clock_timestamp() else null end,
    retry_after = case when not p_success and p_status_code not in (404, 410) and delivery.attempt_count < 3 then pg_catalog.clock_timestamp() + interval '1 minute' else delivery.retry_after end,
    lease_until = null,
    last_status_code = p_status_code,
    last_error_code = case when p_success then null else left(coalesce(p_error_code, 'push_failed'), 64) end
  where delivery.id = p_delivery_id and delivery.status = 'processing'
  returning * into v_delivery;

  if not found then return; end if;
  if not p_success and p_status_code in (404, 410) then
    update public.push_subscriptions as subscription
    set disabled_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    where subscription.id = v_delivery.subscription_id;
  end if;
end;
$$;

revoke all on function public.claim_event_reminder_deliveries(timestamptz) from public, anon, authenticated;
revoke all on function public.complete_event_reminder_delivery(uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.claim_event_reminder_deliveries(timestamptz) to service_role;
grant execute on function public.complete_event_reminder_delivery(uuid, boolean, integer, text) to service_role;

create or replace function public.invoke_event_reminder_dispatch_job()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select secret.decrypted_secret into v_url from vault.decrypted_secrets as secret where secret.name = 'teumsae-event-reminder-url' limit 1;
  select secret.decrypted_secret into v_token from vault.decrypted_secrets as secret where secret.name = 'teumsae-event-reminder-token' limit 1;
  if coalesce(v_url, '') = '' or coalesce(v_token, '') = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := pg_catalog.jsonb_build_object('Authorization', 'Bearer ' || v_token, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function public.invoke_event_reminder_dispatch_job() from public, anon, authenticated;
select cron.schedule('teumsae-event-reminders', '* * * * *', 'select public.invoke_event_reminder_dispatch_job()');
