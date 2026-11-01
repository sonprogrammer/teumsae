-- Resolve PL/pgSQL output-variable ambiguity in the delivery upsert.
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
  if coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
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
  on conflict on constraint event_reminder_deliveries_unique do update
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
