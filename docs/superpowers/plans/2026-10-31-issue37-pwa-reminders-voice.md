# Issue 37 PWA, reminders, and voice implementation plan

> **For agentic workers:** This plan is executed inline with TDD and a final self-review because this harness does not authorize subagents.

**Goal:** Make Teumsae installable as a PWA, provide user-configured event reminders, and allow in-app voice interaction for schedule CRUD with explicit confirmation.

**Architecture:** Next.js serves the PWA and authenticated API. Supabase stores per-user notification subscriptions, reminder preferences, and idempotent delivery state; Supabase Cron invokes a protected Next.js dispatch endpoint once per minute because Vercel Hobby Cron is daily-only. In-app audio is recorded in the foreground, transcribed server-side through the existing Groq API key, submitted to the existing assistant workflow, and spoken through device speech synthesis.

**Tech Stack:** Next.js App Router 16.4.3, TypeScript, Supabase PostgreSQL/Auth/Cron, Web Push, Groq Whisper, browser MediaRecorder and SpeechSynthesis, TanStack Query persistence.

**Spec:** `docs/spec.md` plus the approved Issue #37 comment “구현 기능 상세 설계”. MCP is follow-up Issue #12.

## Global Constraints

- Keep personal schedule data scoped to the authenticated owner; do not expose service credentials to the browser.
- Never treat model text or voice recognition as approval for a schedule mutation; show a review card and require explicit confirmation.
- Offline mode is read-only for the most recently cached schedule data; mutation queue/conflict resolution is out of scope.
- Foreground microphone capture only; no always-listening background audio.
- Clear user-scoped persisted cache on logout and never cache AI transcripts or secrets.
- Follow repository Korean copy, TypeScript style, SQL migration conventions, and `window`-free SQL aliases.

## Review Focus

- A user cannot read another account's cached schedule after account switching; test cache partition and logout clearing.
- Duplicate cron invocations do not send duplicate reminders; test idempotency/lease handling.
- Revoked or expired push endpoints are disabled without blocking other recipients; test per-endpoint failure handling.
- Voice transcription rejects unauthenticated, oversized, unsupported, and empty audio; test validation and quota behavior.
- Concurrent schedule edits/deletes invalidate stale voice proposals; test confirmation revalidation.

---

### Task 1: PWA shell and offline read-only schedule cache

**Files:** `src/app/manifest.ts`, `src/app/layout.tsx`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `public/sw.js`, a focused service-worker registration component, query persistence helpers, `src/app/providers.tsx`, schedule query integration, tests.

- [ ] Add manifest metadata and app icons using the existing Teumsae logo and mint brand background.
- [ ] Register a same-origin service worker and cache the application shell with network-first navigation fallback.
- [ ] Persist only the authenticated user's schedule query data, scoped by user ID; clear it on logout and expose an offline/read-only status.
- [ ] Add tests for cache key partitioning, cache expiry, logout clearing, and offline fallback.
- [ ] Run the focused tests, typecheck, and lint.

### Task 2: Scheduled push reminders

**Files:** `supabase/migrations/<timestamp>_push_reminders.sql`, `src/app/api/push-subscriptions/route.ts`, `src/app/api/cron/event-reminders/route.ts`, server push/reminder modules and tests, `vercel.json` only if needed for route settings, `docs/issue-37-push-setup.md`.

- [ ] Add owner-scoped reminder preferences, push subscriptions, and idempotent delivery records with RLS and narrow RPC grants.
- [ ] Add authenticated subscription create/delete and reminder preference APIs; validate endpoint/key shapes and ownership.
- [ ] Add a protected Node runtime dispatch route using server-only Supabase service credentials and VAPID secrets. Claim due events safely, send Web Push, retry transient failures, disable expired endpoints, and prevent duplicate delivery.
- [ ] Document Supabase Vault + `pg_cron`/`pg_net` setup without including secret values. Run every minute and invoke the protected dispatch route.
- [ ] Add browser settings UI for permission, lead time, enable/disable, unsupported browsers, and failures.
- [ ] Test schedule calculations, duplicate invocation, authorization, and delivery outcomes; then run typecheck, lint, and build.

### Task 3: In-app voice schedule assistant

**Files:** `src/app/api/speech-transcribe/route.ts`, focused audio validation/transcription modules, `src/components/assistant-panel.tsx`, assistant tool/proposal code, a new migration for update/delete proposals if required, tests.

- [x] Add authenticated foreground recording controls using MediaRecorder with MIME fallback, recording/processing/error states, and a 60-second maximum recording duration.
- [x] Transcribe Korean audio on the server with Groq `whisper-large-v3-turbo`; validate auth, size, MIME, empty transcript, and the existing AI request quota before calling Groq.
- [x] Submit recognized text through the existing conversation/tool-calling flow and use browser SpeechSynthesis for AI response playback with stop control and reduced-motion/accessibility-friendly state.
- [x] Extend assistant tools for schedule update/delete by creating server-stored, owner-scoped mutation proposals. Require explicit confirmation, revalidate current event version/conflicts, and make retries idempotent. Keep direct schedule forms working.
- [x] Test transcription validation, mutation revalidation and account ownership guards; typecheck, lint, test, and build passed. Device-level recording-state checks remain manual.

### Task 4: Platform verification and handoff

- [ ] Verify installation, offline cached read-only schedule, notification permission/subscription, and voice add/update/delete on iOS Safari Home Screen and Android Chrome PWA.
- [x] Confirm expected browser/OS limitations and manual Supabase/Vercel secrets/setup in docs.
- [x] Run all available repository checks and review the full branch diff against this plan and `docs/spec.md`.
- [x] Report local implementation checks separately from user-run SQL/deployment/device checks.
