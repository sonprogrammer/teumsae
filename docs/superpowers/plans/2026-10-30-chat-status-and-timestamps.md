# AI Chat Status and Timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chat registration status authoritative and recoverable, and show message timestamps and day separators.

**Architecture:** An authenticated RPC reconciles stored proposal cards against proposal rows. A server endpoint recreates only the proposal from its owner-scoped transcript entry after revalidating availability, and idempotency keys prevent duplicate proposals. Transcript timestamps drive Korean-local message times and date separators.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL RPC, React, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-30-chat-status-and-timestamps-design.md`

## Global Constraints
- Store a proposal before a user explicitly confirms it.
- Keep conversations owner-scoped and private; do not call AI to restore or recreate a proposal.
- Keep recent conversation restoration at 24 hours and visible transcript at 50 messages.
- Use Asia/Seoul for dates and times.
- Do not add dependencies or expose secret environment values.

## Review Focus
- A confirmed proposal must never reappear as an actionable registration — test authoritative status reconciliation.
- An expired, cancelled, stale, conflict, or past proposal must not be mistaken as saved — test each normalized state and expiry.
- Repeated retries must not create duplicate proposals — test stable idempotency request IDs and transcript updates.
- A re-proposal must respect current availability windows and event conflicts — test rejection before proposal creation.
- Date boundaries must follow Seoul calendar days — test timestamp formatting across UTC midnight.

---

### Task 1: Proposal status reconciliation

**Files:** Create `supabase/migrations/202610300005_chat_proposal_status.sql`; modify `src/lib/assistant-transcript.ts`, `src/lib/assistant-transcript.test.mjs`, `src/app/api/chat/route.ts`, `src/lib/sql-migration.test.mjs`.

**Interfaces:** Add `reconcileProposalStates(messages, rows, now)`; add authenticated `get_event_proposal_states(uuid[])` RPC that returns only the caller's proposal IDs, states, expiry and event ID; GET `/api/chat` calls it only for transcript proposal IDs.

- [x] Add tests proving DB states override stale transcript states and pending cards expire at the supplied time.
- [x] Run focused tests and observe failure.
- [x] Implement the helper, RPC and authenticated GET reconciliation.
- [x] Run transcript and migration tests.

### Task 2: Idempotent re-proposal endpoint

**Files:** Create `src/app/api/proposals/recreate/route.ts`; modify `src/lib/availability.ts`, transcript helper/tests, proposal card component and panel; add endpoint regression tests.

**Interfaces:** `POST /api/proposals/recreate` accepts `{ proposalId, requestId }`; server loads card and conversation by authenticated owner, validates terminal unregistered state, current availability window, future time, and proposal conflicts, then creates a new pending proposal via existing RPC. Persist a new assistant card in the same conversation transcript. Reuse request ID on retries.

- [x] Add tests for endpoint contract, owner scoping, no AI call, revalidation and retry key.
- [x] Run focused tests and observe failure.
- [x] Implement the route and render `이 내용으로 다시 제안` only for recoverable unregistered cards.
- [x] Run focused tests and typecheck.

### Task 3: Message time and date dividers

**Files:** Modify `src/lib/assistant-transcript.ts`, tests, `src/components/assistant-panel.tsx`, and `src/app/globals.css`.

**Interfaces:** Persist independent user and assistant timestamps; render `오전/오후 h:mm` on each message and a centered Korean weekday/date divider when the Seoul date changes.

- [x] Add tests for independent timestamps and Seoul date grouping.
- [x] Run focused tests and observe failure.
- [x] Implement timestamps, dividers, and accessible styling.
- [x] Run UI source and helper tests.

### Task 4: Product contract and verification

**Files:** Modify `docs/spec.md` and this plan.

- [x] Document confirmed/pending/unregistered/reproposal semantics.
- [x] Run `pnpm test`, `pnpm exec tsc --noEmit --incremental false`, `pnpm lint`, `pnpm build`, and `git diff --check`.
- [x] Browser control is unavailable in this session; report desktop/mobile browser verification as pending for the user.
