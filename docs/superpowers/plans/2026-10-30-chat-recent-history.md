# 최근 AI 대화 복원 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자별 최근 AI 대화를 24시간 동안 DB에 보관하고 새로고침 뒤 복원한다.

**Architecture:** 기존 conversations 행에 화면 transcript JSONB를 추가하고 인증된 GET /api/chat으로 최근 대화를 가져온다. TanStack Query가 서버 응답을 캐시하고, React 상태는 패널 입력·열림 상태를 담당한다. 브라우저 저장소와 장기 대화 목록은 추가하지 않는다.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL/RLS, TanStack Query, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-30-chat-recent-history-design.md`

## Global Constraints
- 사용자 소유권은 인증된 서버 세션과 RLS로 검증한다.
- API 응답은 `Cache-Control: private, no-store`를 사용한다.
- 대화는 24시간 후 만료하며 일반 로그에 본문을 기록하지 않는다.
- Node는 `.nvmrc`의 24.22.1, 패키지 명령은 pnpm을 사용한다.
- 비밀 환경변수 값을 출력하거나 커밋하지 않는다.

## Review Focus
- 인증되지 않은 요청은 최근 대화를 읽지 못해야 한다.
- 다른 계정의 대화 ID를 지정해도 읽거나 이어 쓸 수 없어야 한다.
- 만료된 대화와 잘못된 JSON transcript는 복원하지 않아야 한다.
- 확인·취소된 등록 카드는 새로고침 뒤에도 실제 상태를 보여야 한다.
- 복원은 AI 호출이나 사용량 카운터를 증가시키지 않아야 한다.

---

### Task 1: 화면 transcript 형식과 스키마

**Files:**
- Create: `src/lib/assistant-transcript.ts`
- Create: `src/lib/assistant-transcript.test.mjs`
- Create: `supabase/migrations/202610300004_chat_display_transcript.sql`
- Modify: `src/lib/sql-migration.test.mjs`

**Interfaces:**
- Produces `parseAssistantTranscript(value: unknown)`, `appendAssistantTurn(...)`, `updateProposalState(...)`.
- Transcript entries contain role, content, optional answer source, cards, error state and timestamp; cap persisted entries at 50.

- [x] **Step 1: Write tests** for valid transcript parsing, malformed entries, 50-entry cap, and proposal state updates.
- [x] **Step 2: Run tests and verify the new cases fail.**
- [x] **Step 3: Implement the transcript helpers and JSONB-array migration.**
- [x] **Step 4: Run focused tests and migration alias regression.**

### Task 2: Authenticated recent-conversation API

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/assistant-transcript.test.mjs`

**Interfaces:**
- `GET /api/chat` returns `{ conversation: null }` or `{ conversation: { id, version, messages } }` for the authenticated user's newest unexpired row.
- Successful `POST /api/chat` appends the request and response transcript to the same owner-scoped conversation update.

- [x] **Step 1: Add tests** for expired-row filtering, empty transcript handling and private no-store response contract.
- [x] **Step 2: Verify the new tests fail.**
- [x] **Step 3: Implement authenticated GET and transcript persistence on successful POST.**
- [x] **Step 4: Run focused tests and typecheck.**

### Task 3: Restore and cache recent conversation in the AI panel

**Files:**
- Modify: `src/components/assistant-panel.tsx`
- Modify: `src/lib/responsive-event-form.test.mjs`
- Modify: `src/app/api/proposals/[id]/confirm/route.ts`
- Modify: `src/app/api/proposals/[id]/cancel/route.ts`
- Create: `src/lib/assistant-transcript-store.ts`

**Interfaces:**
- Use a user-scoped TanStack Query key to fetch the recent conversation.
- Restore messages and conversation id/version without calling the AI endpoint.
- Update persisted proposal card states after server-confirmed mutation results.

- [x] **Step 1: Add UI regression assertions** for recent-chat query, restoration, retry/error state and proposal update.
- [x] **Step 2: Verify the new assertions fail.**
- [x] **Step 3: Implement restoration, loading/error handling and proposal status persistence.**
- [ ] **Step 4: Run focused tests and inspect desktop/mobile flows.** Browser check is pending for the user.

### Task 4: Product contract and final verification

**Files:**
- Modify: `docs/spec.md`

- [x] **Step 1: Update the conversation retention rule to describe the 24-hour recent-chat restore and defer archives.**
- [x] **Step 2: Run `pnpm test`, `pnpm exec tsc --noEmit --incremental false`, `pnpm lint`, `pnpm build`, and `git diff --check`.**
- [x] **Step 3: Inspect migration and branch diff; keep unrelated `next-env.d.ts` changes unstaged.**
