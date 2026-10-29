# Activity Hours Implementation Plan

> **For agentic workers:** Implement inline under the approved issue scope. Keep the work on `feat/activity-hours` and verify with the repository commands.

**Goal:** Let each signed-in user configure daily activity hours and enforce them for new or rescheduled events.

**Architecture:** Store settings per authenticated owner in `user_settings`. A server route reads and updates settings through narrowly scoped Supabase RPCs; event mutation RPCs enforce the same stored range. The schedule page exposes an accessible settings panel and invalidates server-state cache after save. Existing events remain intact when settings change.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL RPC, TanStack Query, node:test.

**Spec:** `docs/spec.md` sections 4, 5.1, 5.3, 6 (F05), and 8.1.

## Global Constraints

- Use `Asia/Seoul`; store persisted event timestamps in UTC.
- Activity start and end must be on the same day, start before end, and on 15-minute boundaries.
- Default activity hours are 09:00–21:00, subject to the accepted issue #6.
- Changing activity hours does not delete or rewrite existing events.
- Enforce ownership and input policy on the server and database, not only in the browser.
- Do not claim AI availability integration: AI lookup is not implemented yet; provide settings version/data contract for that follow-up.
- Preserve existing uncommitted root `next-env.d.ts` change and do not inspect or print secret values.

## Review Focus

- A forged request cannot read or change another user's settings; test authenticated ownership in RPC/route design review, while local DB verification may be unavailable.
- Invalid times, reversed ranges, and non-quarter-hour values are rejected by both route validation and database constraints.
- Event creation and moving an event outside the configured hours fail; changing only the details of a pre-existing out-of-range event remains possible.
- Narrowing activity hours leaves existing events unchanged.
- Concurrent or repeated settings updates do not silently overwrite a newer version.

## Tasks

### Task 1: Activity time domain rules

**Files:** Modify `src/lib/events.ts`; create `src/lib/activity-hours.test.mjs`; modify `src/lib/events.test.mjs`.

- [ ] Test valid 00:00–23:45 quarter-hour ranges, default 09:00–21:00, reversed/equal ranges, malformed values, and event interval containment.
- [ ] Implement shared parsers and interval policy, including a distinct out-of-activity-hours error.
- [ ] Verify targeted tests then `pnpm test`.

### Task 2: Settings persistence and event enforcement

**Files:** Create `supabase/migrations/202610290001_activity_hours.sql`; add SQL contract tests if repository supports them.

- [ ] Add owner-scoped get/update RPCs that create the default row on first access, validate 15-minute same-day ranges, and increment settings version.
- [ ] Update create/update event RPCs to enforce current settings atomically; allow unchanged times on existing events after a settings reduction.
- [ ] Keep settings writes inaccessible directly to browser roles; grant only authenticated RPC execution.
- [ ] Inspect migration and run available local SQL validation; do not touch remote Supabase.

### Task 3: Authenticated settings API and query cache

**Files:** Create `src/app/api/settings/route.ts`, `src/lib/activity-hours-query.ts` and tests; update query keys if needed.

- [ ] GET/PATCH routes derive owner from verified claims and return settings/version without accepting owner IDs.
- [ ] Validate requests before RPC and map failures to safe Korean messages.
- [ ] Add per-user TanStack Query keys and invalidate after update.
- [ ] Verify route/domain tests and typecheck.

### Task 4: Schedule settings UI

**Files:** Modify `src/components/real-schedule.tsx`, `src/app/globals.css`.

- [ ] Add a compact, keyboard-accessible activity-hours disclosure/panel with start/end time inputs, current saved range, pending, success, validation, and failure states.
- [ ] Keep panel usable at desktop and mobile widths and explain that existing events remain unchanged.
- [ ] Use server response to confirm saves and refresh the settings query; never imply AI is connected.

### Task 5: Full verification and PR

- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and `git diff --check`.
- [ ] Review the final diff for authorization, settings boundaries, and preserved user changes; browser verification remains with the user.
- [ ] Commit and open a Korean PR referencing issue #6 without claiming missing AI lookup integration is complete.
