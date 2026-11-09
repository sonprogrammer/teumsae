# 일정 제안 충돌 사전 검사 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Follow this plan task-by-task using the native execution workflow.

**Goal:** 일정 생성·수정 확인 카드를 만들기 전에 기존 일정과의 시간 충돌을 알려준다.

**Architecture:** 생성은 기존 제안 RPC의 사전 검사 동작을 유지하고 회귀 테스트로 고정한다. 수정은 `create_event_change_proposal` RPC에서 대상 일정을 제외한 충돌을 검사하고, 충돌이면 proposal 행을 만들지 않고 `conflict` 결과를 반환한다. 사용자가 확인할 때의 DB 충돌·버전 검사는 동시 변경에 대비해 유지한다.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL RPC, Node test runner.

**Spec:** `docs/spec.md` §§7.3, 8, 9.

## Global Constraints

- 본인 일정만 검사하고, DB가 충돌 및 저장의 최종 판단을 한다.
- 충돌이 있으면 확인 카드를 만들지 않는다.
- 확인 단계에서 최신 일정 버전과 시간 충돌을 다시 검사한다.
- SQL 별칭 `window`를 사용하지 않는다.
- 원격 Supabase 마이그레이션은 실행하지 않는다.

## Review Focus

- 수정 일정이 자기 자신과 겹친다고 오판하지 않도록 대상 일정 ID를 제외한다.
- 인접한 일정은 충돌로 보지 않고 실제 겹치는 구간만 차단한다.
- 사전 검사와 최종 확인 사이에 새 충돌이 생겨도 기존 최종 검사가 차단한다.
- 중복 요청의 기존 proposal 반환 동작을 보존한다.
- 생성 사전 충돌 검사를 변경하지 않고 회귀 테스트로 보존한다.

---

### Task 1: 수정 제안 충돌 검사

**Files:** 새 SQL migration, `src/lib/assistant-tools.ts`, `src/lib/voice-mutation.test.mjs`.

- [x] 테스트로 최신 `create_event_change_proposal` 함수가 proposal insert 전에 대상 일정 외 겹침을 검사하고 conflict를 반환하는지 확인한다.
- [x] 테스트로 update tool이 conflict 결과에서 proposal 카드를 만들지 않고 충돌 결과를 반환하는지 확인한다.
- [x] 테스트를 먼저 실행해 사전 검사 누락으로 실패하는지 확인한다.
- [x] 새 migration에서 수정 제안 RPC가 겹치는 일정이 있으면 proposal을 만들지 않고 conflict를 반환하게 한다.
- [x] `assistant-tools.ts`에서 conflict 결과를 명확한 사용자 안내가 가능한 nonfatal 도구 오류로 매핑한다.
- [x] 확인 RPC의 버전·충돌 재검사를 보존하고 관련 테스트를 다시 실행한다.

### Task 2: 생성 사전 검사 회귀 검증과 전체 검사

**Files:** `src/lib/voice-mutation.test.mjs`.

- [x] 생성 제안 RPC의 기존 충돌 검사와, conflict 응답에서 확인 카드 생성이 중단되는 동작을 테스트한다.
- [x] 전체 자동 테스트, 타입 검사, 린트, 프로덕션 빌드를 실행한다.
- [x] 마이그레이션 별칭 검사에서 SQL `window` 사용이 없는지 확인한다.
- [x] 실제 DB 마이그레이션 적용과 브라우저 시나리오는 별도로 미실행으로 보고한다.

검증은 Node 24.22.1로 수행했다. Node 실행 환경의 PATH가 Node 20.8.0을 가리켜 `pnpm test` 하위 프로세스가 잘못된 Node를 사용했으므로, 전체 테스트는 Node 24.22.1로 직접 실행했다. 타입 검사는 worktree 파일 권한 제한 때문에 `--incremental false`를 추가했다. DB와 브라우저 검증은 수행하지 않았다.
