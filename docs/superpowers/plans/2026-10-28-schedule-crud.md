# Schedule CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated real schedule read, create, update and delete flows for issue #5.

**Architecture:** Server Components read with the cookie-bound Supabase client and existing RLS. Server Actions authenticate and validate mutations, then call narrowly scoped authenticated PostgreSQL functions; table-level write privileges stay revoked.

**Tech Stack:** Next.js App Router Server Components and Server Actions, TypeScript, Supabase SSR, PostgreSQL functions and constraints.

**Spec:** `docs/superpowers/specs/2026-10-28-schedule-crud-design.md`, issue #5, `docs/spec.md` F02–F04 and §§5.1, 7.3, 8.

## Global Constraints
- Use Node 24.22.1 and pnpm.
- Derive owner identity from verified session claims; never accept client owner IDs.
- Keep `events` and `user_settings` direct table writes denied to `authenticated`.
- Do not expose service role keys, secrets, or private environment values.
- Keep sample UI labeled and separate from actual account schedule data.
- Preserve existing style; avoid trailing commas and unnecessary dependencies.

## Review Focus
- Invalid dates, timezone offsets, malformed titles, unsupported duration and past starts are rejected.
- Adjacent `[start, end)` events succeed while partial and exact overlap fail.
- User A cannot read or mutate User B's event through a Server Action or DB function.
- Stale update/delete versions cannot overwrite or delete a changed event.
- Database errors do not lose form values or appear as false success.

---

### Task 1: Pure validation and action result contract
**Files:** Create `src/lib/events.ts`, `src/lib/events.test.mjs`.
**Interfaces:** Export event input parsing and validation result types used by Server Actions.
- [ ] Add failing tests for title trimming/length, ISO date parsing, same Korea date, 15-minute boundaries and duration limits.
- [ ] Run the focused test and confirm the expected failures.
- [ ] Implement parsing and safe error codes without accepting an owner ID.
- [ ] Run focused and full tests.

### Task 2: Database mutation functions
**Files:** Create a new `supabase/migrations/<timestamp>_event_mutations.sql`.
**Interfaces:** Authenticated RPCs for create, update with expected version, and delete with expected version.
- [ ] Define functions with fixed `search_path`, derive owner from `auth.uid()`, validate payload, and return safe result codes.
- [ ] Ensure execute grants are limited to authenticated users and table write grants remain revoked.
- [ ] Reuse title/time/overlap constraints and return conflicts for exclusion/version failures.
- [ ] Inspect migration for grants, ownership checks, and transaction behavior.

### Task 3: Server Action mutation path
**Files:** Create `src/app/schedule/actions.ts`; modify Supabase event service files as needed.
**Interfaces:** Authenticated create/update/delete actions accept form data and return typed success or field/conflict errors.
- [ ] Test validation and result mapping before implementing actions.
- [ ] Verify claims per call, derive owner identity from claims, call the matching RPC, and never report an error as success.
- [ ] Add stale-version and unauthorized outcomes.
- [ ] Run typecheck, lint, and tests.

### Task 4: Real schedule read and UI
**Files:** Create focused real schedule client/form components; modify `src/app/schedule/page.tsx` and `src/app/globals.css`.
**Interfaces:** Server page reads bounded event ranges; client handles week/month navigation, selected-day list, and create/edit/delete forms.
- [ ] Add interaction tests for selection, navigation, validation messages and delete confirmation.
- [ ] Read only authenticated user's events for visible calendar range.
- [ ] Add empty state and distinguish loading/read/write failures.
- [ ] Connect Server Actions; preserve inputs after errors and refresh actual schedule after success.
- [ ] Verify desktop and mobile schedule flows in browser.

### Task 5: Migration and acceptance verification
**Files:** Update setup/verification documentation only if needed.
- [ ] Apply the migration to a test database or record why unavailable; never apply to production silently.
- [ ] Verify direct table INSERT/UPDATE/DELETE remain denied and authenticated RPC paths enforce owner, conflict and version rules.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- [ ] Review the diff, push the branch and open a PR for issue #5.
