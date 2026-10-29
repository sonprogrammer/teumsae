# 일정 가능 시간 구현 계획

> **For agentic workers:** Implement inline on `feat/activity-hours`; follow this plan task by task and keep the existing PR open.

**Goal:** Let each user set editable weekly recommendation windows and full-day vacation exceptions.

**Architecture:** Persist normalized weekday windows and date-range exceptions per owner. A shared domain helper computes the usable windows; an authenticated settings API and detail page manage the rules. Manual events remain recordable at any time; only future availability recommendations use these rules.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL RPC, TanStack Query, node:test.

**Spec:** `docs/superpowers/specs/2026-10-29-scheduling-availability-design.md`; `docs/spec.md` sections 4, 5.1, 5.3, 6 (F05), and 8.1.

## Global Constraints

- Service timezone is `Asia/Seoul`; event timestamps remain UTC.
- Default availability is 09:00–21:00 on all seven weekdays and is editable.
- Availability windows use 15-minute boundaries, start before end, and remain within one day.
- Date exceptions are inclusive, full-day unavailable ranges and override weekday availability.
- Manual event create/update is not blocked by availability; actual event conflicts remain blocked.
- Availability changes never mutate existing events. Increment settings version for future candidate invalidation.
- Preserve migration history: add a forward migration that removes the old single-range enforcement.
- Do not print or commit environment values. Do not claim an AI search is connected; it is not implemented yet.

## Review Focus

- Reversed, overlapping, malformed, and off-grid windows are rejected at API and database boundaries.
- Empty weekday windows produce no recommendation windows while manual events remain recordable.
- Inclusive multi-day exceptions override weekly availability, including weekends.
- Repeated settings updates use expected version and do not overwrite a newer value.
- Rules and exceptions cannot cross user ownership; existing events remain untouched.

## Tasks

### 작업 1: 일정 가능 시간 도메인 모델

**Files:** Create `src/lib/availability.ts` and `src/lib/availability.test.mjs`.

- [x] `AvailabilityWindow`, `WeekdayAvailability`, `AvailabilityException`, `ScheduleAvailability`를 정의한다.
- [x] 7일 기본값, 15분 단위, 복수 구간, 겹침 거부, 날짜 예외를 검사한다.
- [x] 순수 검증 함수와 날짜별 추천 가능 시간 조회 함수를 구현한다.
- [x] `pnpm test`를 실행한다.

### 작업 2: 데이터베이스 순방향 마이그레이션

**Files:** Create `supabase/migrations/202610290002_weekly_schedule_availability.sql`.

- [x] 사용자별 요일 시간대·날짜 예외 테이블, 인덱스, RLS와 읽기 정책을 정의한다.
- [x] `auth.uid()` 기반 조회·저장 RPC와 입력 검증, 버전 잠금을 추가한다.
- [x] 신규 사용자는 7일 모두 09:00–21:00으로 초기화하고 기존 공통 시간 설정은 7일 규칙으로 변환한다.
- [x] 직접 일정 등록을 막던 이전 시간 제한 트리거를 제거한다.
- [x] SQL을 검토한다. 로컬 Supabase 설정이 없어 DB 실행 검증은 하지 않았다.

### 작업 3: 인증 설정 API와 캐시

**Files:** Replace `src/app/api/settings/route.ts`; add `src/lib/availability-query.ts`.

- [x] GET/PATCH는 검증된 사용자 클레임을 쓰고 요청에서 사용자 ID를 받지 않는다.
- [x] 도메인 검증과 버전 충돌·입력 오류 처리를 추가한다.
- [x] 사용자별 TanStack Query 캐시를 사용하고 저장 후 캐시를 갱신한다.

### 작업 4: 일정 가능 시간 설정 화면

**Files:** Create `src/app/schedule/settings/page.tsx` and UI component(s); modify `src/components/real-schedule.tsx` and `src/app/globals.css`.

- [x] 일정 화면에서 설정 페이지로 이동할 수 있게 한다.
- [x] 요일별 토글·시간 수정·시간대 추가/삭제와 휴가 날짜 구간 목록을 제공한다.
- [x] 로딩, 저장, 유효성 오류, 버전 충돌, 조회 실패 상태를 제공한다.
- [x] AI 추천에만 적용되고 직접 일정 등록은 계속 가능하다고 안내한다.

### 작업 5: 검사와 PR 갱신

- [x] `pnpm test`, `pnpm lint`, TypeScript 검사, `pnpm build`, `git diff --check`를 실행한다.
- [x] 사용자 권한, 시간대, 직접 일정 등록, 마이그레이션 순서를 검토한다.
- [ ] 브라우저 확인과 Supabase SQL 실행은 사용자 확인으로 남긴다. PR #28은 한글로 갱신하고 실제 AI 검색이 공통 함수를 사용할 때까지 이슈 #6을 열어 둔다.
