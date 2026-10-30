# Issue #9 등록 확인 후 실제 일정 저장 구현 계획

> **For agentic workers:** 현재 세션에서 `feat/issue9-save-confirmation`에 계획을 순서대로 실행한다. 확인 가능한 단계마다 테스트를 먼저 추가하고 커밋한다.

**Goal:** AI가 만든 일정 제안을 사용자가 확인한 뒤, 소유권·유효성·현재 충돌을 다시 검사해 정확히 한 번 DB에 저장한다.

**Architecture:** 대화 요청 ID와 fingerprint를 가진 소유자별 `event_proposals`를 저장한다. `prepareEvent`는 기존 대화의 활성 후보 또는 직접 지정된 시간을 검증해 제안만 만들고, 확인·취소 API는 제안 ID만 받는다. DB RPC 하나가 제안 잠금, 만료·설정 버전·충돌 확인, 일정 삽입, 완료 결과 기록을 트랜잭션으로 처리한다.

**Tech Stack:** Next.js App Router Route Handlers, TypeScript, Supabase PostgreSQL RPC, TanStack Query, node:test.

**Spec:** `docs/spec.md` §§7.1–7.3, 8, 9.1 및 GitHub issue #9.

## Global Constraints

- 계정 소유자는 요청 body가 아닌 인증된 `auth.uid()`로 결정한다.
- `prepareEvent`는 일정 행을 생성하지 않는다. 명시적 확인 API만 저장한다.
- 서비스 시간대는 `Asia/Seoul`; 일정은 15분 단위, 당일, 15–240분이다.
- 후보 ID는 현재 대화의 활성 후보와 소유자·검색 범위에 묶는다.
- 확인 요청은 제안 ID만 받고 저장 payload를 클라이언트에서 다시 받지 않는다.
- 동일 제안 재확인·응답 유실 재시도는 저장 결과를 반환하고 재생성하지 않는다.
- 비밀값을 출력하거나 커밋하지 않는다. 원본 `main`의 사용자 변경은 보존한다.
- 원격 DB는 수정하지 않는다. 저장소에 Supabase 로컬 설정이 없으므로 DB 실행 검증은 별도 보고한다.

## Review Focus

- 다른 사용자 소유의 conversation, candidate, proposal ID를 추측해도 읽거나 저장할 수 없다.
- 후보 시각은 모델·브라우저 값 대신 서버 대화 문맥에 있는 후보 값만 쓴다.
- 활동 시간 설정 변경 및 제안 만료 후 확인은 저장되지 않는다.
- 두 탭이 동시에 확인하거나 응답을 잃고 재확인해도 일정은 하나만 생긴다.
- 다른 탭에서 같은 구간을 먼저 저장하면 충돌 상태가 보이고 확인 카드는 보존된다.

## Tasks

### 작업 1: 제안 생성 입력과 후보 검증 도메인

**Files:** Create `src/lib/event-proposals.ts` and `src/lib/event-proposals.test.mjs`; modify `src/lib/assistant-tools.ts`.

- [x] 테스트로 직접 지정 시간, 후보 ID binding, 제목·시간 유효성, 후보 없음·다른 검색·만료·설정 버전 변경을 정의한다.
- [x] `prepareEvent` tool argument parser와 제안 payload validator를 구현한다.
- [x] availability 결과에 서버 생성 search/candidate ID와 settings version을 붙이고 모델에는 선택 가능한 ID를 전달한다.

### 작업 2: 트랜잭션 저장용 DB 마이그레이션

**Files:** Create `supabase/migrations/202610300001_event_proposals.sql`.

- [x] owner RLS, 직접 table 권한 차단, request ID 유일성, fingerprint, pending/confirmed/cancelled/expired/conflict/stale 상태와 결과 필드를 정의한다.
- [x] 제안 생성 RPC는 현재 소유 대화·설정 버전·충돌을 확인하고 같은 request ID 재요청에는 같은 fingerprint 결과만 반환한다.
- [x] 확인 RPC는 proposal row lock, 설정 버전·만료 확인, 이벤트 insert, 완료 결과 기록을 하나의 transaction으로 수행한다.
- [x] 이벤트 시간 exclusion 위반은 저장 없이 conflict 결과로 변환하고 현재 겹치는 본인 일정을 반환한다.
- [x] 취소 RPC는 해당 proposal만 취소하고 완료·만료 요청의 결과를 안전하게 반환한다.

### 작업 3: AI 대화와 제안 생성 연결

**Files:** Modify `src/app/api/chat/route.ts`, `src/lib/assistant-tools.ts`, `src/lib/assistant-chat.ts` and tests.

- [x] 클라이언트 요청 ID를 검증하고 같은 요청 재전송은 기존 proposal 결과를 사용해 새 모델 호출을 생략한다.
- [x] `prepareEvent`를 등록 제안 생성 RPC에 연결하고 대화 카드·저장 context에 proposal ID를 반환한다.
- [x] 명확화·도구 실패·AI 실패에서도 성공으로 오인하지 않고 이미 만들어진 확인 카드는 보존한다.

### 작업 4: 확인·취소 API와 UI

**Files:** Create `src/app/api/proposals/[id]/confirm/route.ts` and `cancel/route.ts`; modify `src/components/assistant-panel.tsx`, `src/components/real-schedule.tsx`, event query utilities and `src/app/globals.css` as needed.

- [x] 인증된 사용자만 proposal ID로 확인·취소할 수 있게 하고 JSON status를 HTTP 오류로 매핑한다.
- [x] confirmation card에 제목·날짜·요일·시간을 표시하고 확인·취소·처리 중·만료·충돌·저장 실패 상태를 구분한다.
- [x] 실제 확인 성공 응답 후 사용자 일정 query를 무효화한다. 실패하면 확인 카드를 유지한다.

### 작업 5: 최종 검증과 PR

- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`를 실행한다.
- [x] 마이그레이션의 권한·동시 요청·응답 유실·충돌 경로를 SQL 기준으로 리뷰한다.
- [ ] 브라우저와 Supabase 원격 SQL 실행은 손 대표님 확인으로 남기고, 미검증 상태를 보고한다.
- [ ] 한글 PR을 이슈 #9과 연결해 생성한다.

## Execution Ledger

- Baseline: 로컬 `main`은 merge commit `08c5e61`이고 `next-env.d.ts`에 사용자 변경이 있어 보존한다. 신규 worktree는 이 커밋에서 생성했다.
- Baseline tests: `pnpm test` 실패 — 새 worktree에 `node_modules`가 없어 `postcss`와 `@tanstack/react-query`를 찾지 못함. dependency 설치 후 재실행한다.
- Ruling: worktree 브랜치는 `feat/issue9-save-confirmation`, 경로는 기존 작업 패턴인 `../teumsae-worktrees/issue-9-save-confirmation`으로 정했다 — 기존 issue별 형제 worktree를 그대로 따름 — 경로가 틀렸다면 이후 개발이 별도 위치에 생긴다.
- Baseline: `pnpm install --frozen-lockfile` 완료(잠금파일 변경 없음), `pnpm test` 66/66 통과.
- Ruling: `docs/superpowers/specs/2026-10-29-scheduling-availability-design.md`에서 사용자가 확정한 “일정 가능 시간은 추천에만 적용하고 직접 등록은 허용”을 반영해 `docs/spec.md`의 상충한 이전 문구를 정리했다. 확인 시 실제 일정 충돌은 계속 차단한다.
- Implementation: 후보는 사용자·대화·검색·설정 버전에 묶어 DB에 저장하고, `prepareEvent`는 proposal만 생성한다. 확인 RPC는 잠금 아래 만료·설정 버전·현재 일정을 재검사하고 event insert와 결과 기록을 한 트랜잭션으로 처리한다. 확인 요청 재전송은 기존 proposal/event 결과를 돌려준다.
- Implementation: 채팅 클라이언트는 요청 UUID를 실패 재시도 동안 유지하고, 확인 카드에서 서버가 `confirmed`를 반환한 뒤에만 사용자 일정 쿼리를 무효화한다. 모바일 바텀시트와 데스크톱 플로팅 패널 양쪽에서 같은 카드 액션을 제공한다.
- Verification: Node 24.22.1 경로를 지정해 `pnpm test` 74/74, `pnpm exec tsc --noEmit --tsBuildInfoFile /private/tmp/teumsae-issue9.tsbuildinfo`, `pnpm lint`, `pnpm build`, `git diff --check`가 통과했다. 최초 일반 `pnpm build`는 형제 worktree의 `.next` 쓰기 권한 제한으로 실패했고, 쓰기 승인을 받은 동일 빌드는 통과했다.
- Limitation: Supabase 로컬 설정이 없어서 마이그레이션을 실제 DB에서 실행하지 않았다. 브라우저 검증도 아직 하지 않았다. 기본 셸 Node는 20.8.0으로 잘못 선택되어 있으므로 이 worktree 명령은 설치된 Node 24.22.1 경로를 지정했다.
- Review: 독립적인 보안 리뷰에서 제안 생성·확정 RPC 소유권 검사, 트랜잭션, 요청 재시도, 확인·취소 API 상태 처리를 검토했고 차단급 발견은 없었다. DB 실행 검증은 리뷰 범위 밖이다.
