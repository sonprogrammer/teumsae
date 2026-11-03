# AI Request Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep ordinary schedule queries visible, show only a confirmation card for a uniquely resolved update/delete, and enforce transparent per-user and shared Groq request limits.

**Architecture:** Resolve a mutation target with an owner-scoped server query using its date range and optional title filter; create a version-checked proposal only when exactly one event matches. Keep user prompt throttling in `consume_ai_request()` and add atomic project-scoped Groq request reservations immediately before every provider call. Show concise quota guidance in the authenticated assistant composer.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL RPC, Groq Chat Completions, Node test runner.

**Spec:** `docs/spec.md` sections 7.1–7.4 and 8; approved scope in GitHub issue #70.

## Global Constraints

- Preserve owner checks, event version checks, collision checks, and user confirmation before mutation.
- Normal `listEvents` requests continue to show schedule cards.
- Never choose among multiple matching events without asking the user.
- User prompt allowance is 10 requests per minute; Groq shared request allowance is 30 requests per minute and 1,000 per day for the public Free Plan baseline.
- Groq organization-specific limits and token quotas remain authoritative; do not claim the app can account for requests made outside this service.
- Do not expose API keys, prompts, schedule titles, or notes in usage logs.
- Use no trailing commas and avoid reserved SQL aliases, especially `window`.

## Review Focus

- Mutation lookup spans multiple dates or matches multiple events → add tests proving it asks for clarification and creates no proposal.
- A selected event changed after lookup → preserve expected-version validation and add regression coverage.
- Concurrent model calls reach the shared limit together → test the SQL RPC reservation logic or its migration contract.
- A later model call within one chat request reaches the daily/minute cap → return the provider-limit message with retry guidance, without another fetch.
- Ordinary event queries and voice transcription limits regress → retain their existing cards and distinct counters.

---

### Task 1: Mutation targeting and card behavior

**Files:** `src/lib/assistant-chat.ts`, `src/lib/assistant-tools.ts`, `src/app/api/chat/route.ts`, focused `src/lib/*.test.mjs` tests.

- [x] Add tests for selector validation, unique match resolution, ambiguous matches, unchanged query cards, and retry delays.
- [x] Run the focused tests and confirm the new cases fail before the implementation helpers are added.
- [x] Add date-range plus optional title selector fields to update/delete tools; resolve candidates on the server using `owner_id = userId`.
- [x] Create a mutation proposal only for one match, using the fetched event ID/version; ask for clarification for zero or multiple matches.
- [x] Ensure successful mutation responses contain the proposal card only, and return a concise server summary without another model response.
- [x] Return ordinary event lookup cards and use a server summary for direct, non-analytical schedule queries to avoid an extra model response.
- [x] Run focused tests and then the full test suite.

### Task 2: Per-user and shared Groq request limits

**Files:** new `supabase/migrations/*_ai_model_request_limits.sql`, `src/app/api/chat/route.ts`, focused tests.

- [x] Add tests for provider `429` retry delay parsing, shared quota responses, and per-user 10/min behavior.
- [x] Run the focused tests and confirm they fail before implementation helpers are added.
- [x] Update `consume_ai_request()` to permit 10 authenticated user prompts per minute.
- [x] Add atomic project request reservation scopes and a restricted RPC for 30/min and 1,000/day shared calls; reserve once immediately before each Groq fetch.
- [x] Honor Groq `retry-after` on provider `429` responses and expose a safe wait message; distinguish local shared-cap denial from provider 429.
- [x] Run SQL alias scan, unit tests, typecheck, and lint. Remote SQL application remains a user action.

### Task 3: User-facing quota guidance

**Files:** `src/components/assistant-panel.tsx`, `src/app/globals.css`, focused component/source tests if available.

- [x] Add a concise helper near the composer explaining the 10 user prompts/minute cap and shared Groq Free limits.
- [x] Keep voice transcription's separate limit and avoid implying that the AI limit is per-device.
- [ ] Check the updated composer in desktop and mobile Preview; leave direct visual verification to the user.
- [x] Run typecheck, lint, tests, and production build.

### Task 4: Final review and handoff

- [x] Review `git diff` for scope, data isolation, safe copy, migration compatibility, and unchanged existing user work.
- [x] Run all configured local checks and report the exact outputs.
- [x] Open PR #71 against `main` with `Closes #70`; do not merge or apply remote SQL.
