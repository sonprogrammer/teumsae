begin;

select plan(15);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '78000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'issue-78@example.test', '', pg_catalog.now(), pg_catalog.now(), pg_catalog.now(), '{"provider":"email","providers":["email"]}', '{}');

insert into public.conversations (id, owner_id)
values ('78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000001');

insert into public.events (id, owner_id, title, starts_at, ends_at)
select fixture.event_id, '78000000-0000-4000-8000-000000000001', fixture.title,
  (date.current_date + fixture.start_time) at time zone 'Asia/Seoul',
  (date.current_date + fixture.end_time) at time zone 'Asia/Seoul'
from (select (pg_catalog.now() at time zone 'Asia/Seoul')::date + 2 as current_date) as date
cross join (values
  ('78000000-0000-4000-8000-000000000011'::uuid, '생성 충돌 기준 일정', time '09:00', time '10:00'),
  ('78000000-0000-4000-8000-000000000012'::uuid, '수정 대상 일정', time '11:00', time '12:00'),
  ('78000000-0000-4000-8000-000000000013'::uuid, '수정 충돌 기준 일정', time '13:00', time '14:00'),
  ('78000000-0000-4000-8000-000000000014'::uuid, '동시 수정 대상 일정', time '17:00', time '18:00'),
  ('78000000-0000-4000-8000-000000000015'::uuid, '연속 일정 기준', time '20:00', time '21:00')
) as fixture(event_id, title, start_time, end_time);

select pg_catalog.set_config('request.jwt.claim.sub', '78000000-0000-4000-8000-000000000001', true);
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is((public.create_event_proposal(
  '78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000101', repeat('a', 64),
  '겹치는 새 일정', null, (pg_catalog.now() at time zone 'Asia/Seoul')::date + 2,
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '09:30') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '10:30') at time zone 'Asia/Seoul',
  1, null, null
)->>'status'), 'conflict', '겹치는 일정 생성 제안은 충돌로 거절한다');

reset role;
select is((select count(*)::integer from public.event_proposals where request_id = '78000000-0000-4000-8000-000000000101'), 0, '충돌한 생성 제안은 확인 카드 레코드를 만들지 않는다');
set local role authenticated;

select is((public.create_event_change_proposal(
  '78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000102', repeat('b', 64),
  'update', '78000000-0000-4000-8000-000000000012', 1, '겹치는 수정 일정', null,
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '13:30') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '14:30') at time zone 'Asia/Seoul'
)->>'status'), 'conflict', '다른 일정과 겹치는 수정 제안은 충돌로 거절한다');

reset role;
select is((select count(*)::integer from public.event_proposals where request_id = '78000000-0000-4000-8000-000000000102'), 0, '충돌한 수정 제안은 확인 카드 레코드를 만들지 않는다');
set local role authenticated;

select is((public.create_event_change_proposal(
  '78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000103', repeat('c', 64),
  'update', '78000000-0000-4000-8000-000000000012', 1, '자기 일정 수정', null,
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '11:00') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '12:00') at time zone 'Asia/Seoul'
)->>'status'), 'pending', '수정 대상 일정은 자기 충돌로 처리하지 않는다');

select is((public.create_event_proposal(
  '78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000104', repeat('d', 64),
  '연속 일정', null, (pg_catalog.now() at time zone 'Asia/Seoul')::date + 2,
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '21:00') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '22:00') at time zone 'Asia/Seoul',
  1, null, null
)->>'status'), 'pending', '끝과 시작이 맞닿은 일정은 충돌로 처리하지 않는다');

select is((public.create_event_proposal(
  '78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000105', repeat('e', 64),
  '등록 직전 충돌 일정', null, (pg_catalog.now() at time zone 'Asia/Seoul')::date + 2,
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '15:00') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '16:00') at time zone 'Asia/Seoul',
  1, null, null
)->>'status'), 'pending', '충돌이 없는 생성 요청은 확인 대기 상태를 만든다');

reset role;
select pg_catalog.set_config('teumsae_test.create_proposal_id', (select id::text from public.event_proposals where request_id = '78000000-0000-4000-8000-000000000105'), true);
insert into public.events (owner_id, title, starts_at, ends_at)
select '78000000-0000-4000-8000-000000000001', '제안 이후 추가된 생성 충돌 일정',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '15:00') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '16:00') at time zone 'Asia/Seoul';
set local role authenticated;

select is((public.confirm_event_proposal(pg_catalog.current_setting('teumsae_test.create_proposal_id')::uuid)->>'status'), 'conflict', '생성 확인 직전에 생긴 충돌을 다시 검사한다');

reset role;
select is((select state from public.event_proposals where id = pg_catalog.current_setting('teumsae_test.create_proposal_id')::uuid), 'conflict', '충돌한 생성 제안 상태를 conflict로 기록한다');
select is((select count(*)::integer from public.events where title = '등록 직전 충돌 일정'), 0, '충돌한 생성 제안은 일정을 저장하지 않는다');
set local role authenticated;

select pg_catalog.set_config('teumsae_test.update_proposal_id', (public.create_event_change_proposal(
  '78000000-0000-4000-8000-000000000002', '78000000-0000-4000-8000-000000000106', repeat('f', 64),
  'update', '78000000-0000-4000-8000-000000000014', 1, '수정 제안 대기', null,
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '18:00') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '19:00') at time zone 'Asia/Seoul'
)->'proposal'->>'id'), true);
select is((public.get_event_proposal_for_request('78000000-0000-4000-8000-000000000106', repeat('f', 64))->>'status'), 'pending', '충돌이 없는 수정 요청은 확인 대기 상태를 만든다');

reset role;
insert into public.events (owner_id, title, starts_at, ends_at)
select '78000000-0000-4000-8000-000000000001', '제안 이후 추가된 수정 충돌 일정',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '18:00') at time zone 'Asia/Seoul',
  (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '19:00') at time zone 'Asia/Seoul';
set local role authenticated;

select is((public.confirm_event_proposal(pg_catalog.current_setting('teumsae_test.update_proposal_id')::uuid)->>'status'), 'conflict', '수정 확인 직전에 생긴 충돌을 다시 검사한다');

reset role;
select is((select state from public.event_proposals where id = pg_catalog.current_setting('teumsae_test.update_proposal_id')::uuid), 'conflict', '충돌한 수정 제안 상태를 conflict로 기록한다');
select is((select version from public.events where id = '78000000-0000-4000-8000-000000000014'), 1, '충돌한 수정은 원본 일정 버전을 바꾸지 않는다');
select is((select starts_at from public.events where id = '78000000-0000-4000-8000-000000000014'), (((pg_catalog.now() at time zone 'Asia/Seoul')::date + 2) + time '17:00') at time zone 'Asia/Seoul', '충돌한 수정은 원본 시작 시각을 유지한다');

select * from finish();
rollback;
