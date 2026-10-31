# 이슈 49 일정 화면 UI/UX 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정 재조회 상태를 분명히 보여주고 수동 일정 등록·수정·삭제 조작을 선택일 화면에서 더 쉽게 찾게 한다.

**Architecture:** `RealSchedule`의 TanStack Query 상태로 최초 로딩과 백그라운드 갱신 표시를 구분한다. 기존 선택일 패널 안의 등록 폼은 유지하면서 헤더 동작, 카드 hover/focus, 아이콘 조작을 다듬는다.

**Tech Stack:** Next.js App Router, TypeScript, React, TanStack Query, 기존 CSS, Lucide React, Node.js 24.22.1, pnpm 10.22.0.

**Spec:** `docs/superpowers/specs/2026-10-31-issue49-schedule-ui-design.md`, `docs/spec.md` §4~6.

## Global Constraints

- Node.js는 `.nvmrc`의 24.22.1을 사용하고 패키지 명령은 pnpm으로 실행한다.
- 서버 데이터와 요청 상태는 TanStack Query가 소유하며 기존 사용자별 캐시 키와 CRUD 흐름을 유지한다.
- 기존 일정은 다시 가져오는 동안 지우지 않고, 최초 로딩과 재조회 상태를 구분한다.
- 기존 저장 규칙, 확인 다이얼로그, 오류 상태를 유지하고 새 의존성을 추가하지 않는다.
- 기존 코드 스타일을 따르고 trailing comma와 불필요한 빈 줄을 추가하지 않는다.

## Review Focus

- 첫 조회에서 데이터가 없으면 캘린더·선택일 패널이 스켈레톤을 보인다. (Task 1, 2)
- 데이터가 있는 상태에서 refetch하면 기존 카드가 유지되고 갱신 표시만 나온다. (Task 1, 2)
- refetch가 실패하면 기존 데이터와 오류 안내·재시도 동작이 함께 유지된다. (Task 1, 2)
- 일정이 없는 날에는 빈 상태와 일정 추가 동작이 유지되고, 등록 폼이 열리면 중복 추가 버튼이 숨는다. (Task 1, 3)
- 수정·삭제 아이콘은 키보드 포커스와 보조기기 이름을 제공하고 모바일에서도 누르기 쉽다. (Task 1, 3)
- `prefers-reduced-motion`에서는 진행 표시와 폼 전환 효과가 줄어든다. (Task 1, 3)

---

### Task 1: 일정 UI 상태 회귀 테스트 추가

**Files:**
- Modify: `src/lib/responsive-event-form.test.mjs`
- Test: `src/lib/responsive-event-form.test.mjs`

**Interfaces:**
- Consumes: 현재 `RealSchedule`의 이벤트 쿼리, 등록 폼, 카드 마크업과 `globals.css` 선택자.
- Produces: 로딩/갱신 표시, 등록 버튼 전환, 카드 포커스 강조, 아이콘 접근성, 모션 감소 규칙을 고정하는 회귀 검증.

- [x] **Step 1: 회귀 테스트 추가**

  첫 조회는 기존 `.real-agenda-skeleton`과 `.real-calendar-skeleton`을 사용하고, 기존 데이터가 있는 refetch는 `isFetching` 표시를 사용한다는 소스·CSS 계약 테스트를 추가한다. 일정 데이터는 재조회 상태에서도 렌더 경로에 남아 있어야 한다. 등록 중 추가 버튼 숨김, 아이콘 버튼의 `aria-label`, 카드 `:focus-within`, 모션 감소 선언에 대한 테스트도 추가한다.

- [x] **Step 2: 실패 확인**

  Run: `pnpm exec node --test src/lib/responsive-event-form.test.mjs`

  Expected: 아직 존재하지 않는 갱신 표시와 전체 카드/아이콘 상태 계약 테스트가 실패한다.

### Task 2: 첫 로딩과 백그라운드 갱신 표시 구현

**Files:**
- Modify: `src/components/real-schedule.tsx`
- Modify: `src/app/globals.css`
- Test: `src/lib/responsive-event-form.test.mjs`

**Interfaces:**
- Consumes: `eventsQuery.isPending`, `eventsQuery.isFetching`, `eventsQuery.data`.
- Produces: 첫 요청의 기존 스켈레톤과 기존 데이터를 유지하는 재조회 진행 표시.

- [x] **Step 1: 갱신 표시 추가**

  달력과 선택일 패널에 공통으로 알 수 있는 `role="status"` 진행 표시를 추가한다. 새 데이터가 아직 없을 때는 기존 스켈레톤만 보이고, `eventsQuery.data`가 있는 상태에서 `isFetching`이면 얇은 진행 막대를 표시한다. 데이터가 남아 있는 경우 일정 카드와 배열은 다시 빈 상태로 바꾸지 않는다.

- [x] **Step 2: 상태 스타일과 모션 감소 지원**

  기존 색상과 간격을 사용해 얇은 진행 막대를 만들고, `prefers-reduced-motion: reduce`에서는 애니메이션을 멈추거나 정적 상태로 바꾼다.

- [x] **Step 3: 관련 테스트 실행**

  Run: `pnpm exec node --test src/lib/responsive-event-form.test.mjs`

  Expected: 로딩과 갱신 상태 테스트가 통과한다.

### Task 3: 수동 일정 카드와 폼 조작 개선

**Files:**
- Modify: `src/components/real-schedule.tsx`
- Modify: `src/app/globals.css`
- Test: `src/lib/responsive-event-form.test.mjs`

**Interfaces:**
- Consumes: 현재 `creating`, `EventForm`, `EventCard`, `DeleteEventButton` 상태.
- Produces: 선택일 패널에서 추가 버튼과 폼이 겹치지 않는 등록 상태, 전체 카드 강조, 접근 가능한 수정·삭제 아이콘 버튼.

- [x] **Step 1: 중복 등록 동작 정리**

  `creating`이면 일정 패널 헤더의 `일정` 버튼을 숨기고, 폼 내부 닫기·취소 동작을 남긴다. 폼은 선택일 패널 안에서 짧은 전환 효과와 함께 나타나고 닫힌다. 저장 중과 오류 시 현재 입력·저장 상태를 그대로 유지한다.

- [x] **Step 2: 전체 카드 hover/focus 강조 및 아이콘 적용**

  `.real-event-card`의 `:hover`와 `:focus-within`에 테두리·배경 강조를 적용한다. 기존 제목 상세 보기의 동작은 유지한다. 수정은 Lucide `Pencil`, 삭제는 `Trash2` 아이콘 버튼으로 바꾸고 각 버튼에 분명한 `aria-label`과 title을 준다. 삭제 확인 다이얼로그는 현재 흐름을 유지한다.

- [x] **Step 3: 반응형 및 reduced-motion 스타일 추가**

  모바일에서도 버튼의 터치 영역과 카드 레이아웃을 유지한다. 모션 감소 설정에서는 폼 전환을 줄인다.

- [x] **Step 4: 회귀 테스트 통과 확인**

  Run: `pnpm exec node --test src/lib/responsive-event-form.test.mjs`

  Expected: 추가된 모든 UI 계약 테스트가 통과한다.

### Task 4: 전체 검사와 브라우저 확인

**Files:**
- Review: `src/components/real-schedule.tsx`, `src/app/globals.css`, `src/lib/responsive-event-form.test.mjs`

- [x] **Step 1: 전체 자동 검사**

  Run 순서: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

  Expected: 각 명령이 종료 코드 0으로 끝난다.

- [ ] **Step 2: 화면 수동 확인**

  `pnpm dev` 실행 후 데스크톱과 모바일에서 첫 조회 스켈레톤, refetch 진행 표시와 기존 일정 유지, 빈 날짜 등록, 등록 취소·저장, 카드 hover/focus, 수정·삭제 아이콘과 확인 흐름을 확인한다. 실제 브라우저를 확인하지 않았다면 결과를 통과로 보고하지 않는다.

- [x] **Step 3: 변경 내용 검토**

  Run: `git diff --check` 및 `git status --short`.

  Expected: 공백 오류가 없고 이슈 49 범위 파일만 변경된다.

## Execution Ledger

- Task 1: `responsive-event-form.test.mjs`에서 새 UI 계약 5개가 먼저 실패하는 것을 확인했다. 이후 Task 2 구현으로 갱신 상태 테스트가 통과하고, Task 3 구현 후 전체 관련 테스트 21/21 통과했다.
- Task 2: 최초 로딩은 기존 스켈레톤을 유지하고, 기존 데이터가 있는 재조회에만 진행 표시를 보이도록 했다. 일정은 기존 `eventsQuery.data` 렌더 경로에서 유지된다.
- Task 3: 폼 열림 중 상단 추가 버튼을 숨기고 카드 전체 hover/focus, 40px Lucide 아이콘 버튼, reduced-motion 규칙을 추가했다.
- Task 4 자동 검사: 전체 단위 테스트 151/151, lint, typecheck, production build 모두 통과했다. `git diff --check` 통과. 브라우저에서 인증 일정 화면을 직접 확인하는 작업은 아직 남았다.
- Final review: self-review (no subagent tool). 변경 범위와 기존 오류·저장 동작을 확인했고 Critical/Important 코드는 찾지 못했다. 실제 브라우저 확인은 손 대표님이 PR preview에서 이어서 확인한다.
