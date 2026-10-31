alter table public.events drop constraint events_duration;
alter table public.events
  add constraint events_duration check (
    extract(epoch from ends_at - starts_at) >= 900
    and mod(extract(epoch from ends_at - starts_at), 900) = 0
  );

alter table public.availability_candidates drop constraint availability_candidates_duration;
alter table public.availability_candidates
  add constraint availability_candidates_duration check (
    extract(epoch from ends_at - starts_at) >= 900
    and mod(extract(epoch from ends_at - starts_at), 900) = 0
  );

alter table public.event_proposals drop constraint event_proposals_duration;
alter table public.event_proposals
  add constraint event_proposals_duration check (
    extract(epoch from ends_at - starts_at) >= 900
    and mod(extract(epoch from ends_at - starts_at), 900) = 0
  );

-- 이미 배포된 RPC 계약과 권한은 유지하면서 함수 본문의 4시간 상한 조건만 제거한다.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.create_event(text, text, timestamp with time zone, timestamp with time zone)'::regprocedure,
    'public.update_event(uuid, integer, text, text, timestamp with time zone, timestamp with time zone)'::regprocedure,
    'public.create_event_proposal(uuid, uuid, text, text, text, date, timestamp with time zone, timestamp with time zone, integer, uuid, uuid)'::regprocedure,
    'public.create_event_change_proposal(uuid, uuid, text, text, uuid, integer, text, text, timestamp with time zone, timestamp with time zone)'::regprocedure
  ] loop
    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    v_updated := pg_catalog.replace(v_definition, 'not between 900 and 14400', '< 900');
    if v_updated = v_definition then
      raise exception 'Could not find the four-hour duration check in %', v_signature;
    end if;
    execute v_updated;
  end loop;
end;
$$;
