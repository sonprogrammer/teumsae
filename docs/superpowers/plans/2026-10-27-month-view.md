# Month View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a week/month toggle to the existing sample calendar while preserving date selection and sample booking.

**Architecture:** Keep one selected ISO date as the source of truth. Derive the visible week or month from it. A small pure date helper creates the Monday-first month grid; the existing component renders the grid and preserves its day-list and AI candidate logic.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Node test runner

**Spec:** `docs/superpowers/specs/2026-10-27-month-view-design.md`

## Global Constraints
- Sample actions stay in screen state only; never claim DB persistence or AI connection.
- Week starts Monday; date keys are `YYYY-MM-DD`.
- No new calendar dependency.
- Preserve existing code style: no trailing commas or unnecessary blank lines.
- Feature branch and PR; do not merge into `main`.

## Review Focus
- February starting Monday can occupy exactly four rows; no dates may disappear.
- December to January navigation must select the correct year.
- Clicking an adjacent-month date must show the correct month and list.
- Switching views must keep the selected date and avoid stale candidate registration.
- Small mobile cells must remain tappable and must not obscure the AI bar.

---

### Task 1: Pure month grid
**Files:**
- Create: `src/lib/calendar-grid.mjs`
- Test: `src/lib/calendar-grid.test.mjs`

**Interfaces:**
- Produces: `monthGrid(iso: string): string[]`, Monday-first full weeks including adjacent-month dates.
- Produces: `shiftMonth(iso: string, offset: number): string`, ISO date for day 1 of shifted month.

- [ ] Write tests with literal dates for 2021-02 (28 days, 4 rows), 2026-10 (35 cells), and 2026-12 → 2027-01.
- [ ] Run `pnpm test` and verify the new tests fail because functions are missing.
- [ ] Implement the two pure functions.
- [ ] Run `pnpm test` and verify all tests pass.
- [ ] Commit the date helper and tests.

### Task 2: Week/month calendar UI
**Files:**
- Modify: `src/components/schedule-demo.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `monthGrid` and `shiftMonth` from Task 1.
- Adds `CalendarView = 'week' | 'month'` state and view-specific navigation.

- [ ] Write a browser behavior check for toggle, month navigation, day selection, sample registration, and mobile access; capture initial failure on absent month toggle.
- [ ] Add two view buttons with pressed state; derive week from selected date and month cells from `monthGrid`.
- [ ] Render desktop month cells with up to two event titles and a remaining count; render compact mobile cells with event dots/count. Add full date labels and candidate-date marker.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; fix any errors.
- [ ] Re-run browser behavior check at desktop and mobile widths.
- [ ] Commit UI changes.

### Task 3: Review and PR
**Files:** No new product files.

- [ ] Review diff against design and issue #18, including sample-only copy.
- [ ] Push `feat/month-view` and open a PR based on `feat/sample-schedule-foundation`; note that PR #1 must land first.
- [ ] Confirm CI status and report browser preview route, worktree, branch, and test results.
