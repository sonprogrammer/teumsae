# Issue 10 Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable browser, database-concurrency, and real-model evaluation workflows for issue 10 without confusing their evidence.

**Architecture:** Keep deterministic UI/API tests in Playwright and the existing Node test suite. Make real authenticated DB checks and actual AI calls explicit opt-in commands that require isolated test credentials and write sanitized evidence only.

**Tech Stack:** Next.js App Router, TypeScript, Playwright, Node test runner, Supabase SQL/HTTP APIs.

**Spec:** `docs/spec.md` §7.3 and §9; design: `docs/superpowers/specs/2026-10-30-issue10-validation-design.md`.

## Global Constraints

- Keep production behavior and schema unchanged.
- Use dedicated test accounts and a test database for live checks.
- Do not print or commit secrets, browser storage states, event titles, notes, or raw user prompts.
- Report deterministic tests, live DB checks, live AI evaluation, and manual browser checks separately.

## Review Focus

- An absent auth state must fail with setup guidance before test data is touched.
- Two accounts must not observe each other's event data.
- Parallel conflicting writes must not produce overlapping events.
- Repeated proposal confirmation must not create a second event.
- AI cases must validate tool arguments and resulting cards/data, not prose alone.

---

### Task 1: Playwright setup and deterministic calendar-to-confirm E2E

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/sample-schedule.spec.ts`, `e2e/authenticated-flow.spec.ts`
- Modify: `package.json`, `pnpm-lock.yaml`

- [x] Add Playwright and test commands; add deterministic sample desktop/mobile E2E to CI.
- [x] Add a mocked authenticated schedule → availability candidate → selected candidate → pending confirmation → confirmed state test with refresh persistence.
- [x] Run sample E2E in desktop and mobile emulation; keep confirmation explicit.
- [x] Require an external auth state for authenticated E2E and document how to create it without writing session data into Git.
- [ ] Run authenticated E2E once a dedicated test account session is available.

### Task 2: Authenticated DB isolation and concurrency checks

**Files:**
- Create: `e2e/database-integrity.spec.ts`
- Create: `docs/issue-10-test-setup.md`

- [x] Implement two-user read isolation and concurrent conflicting-write scenarios using dedicated auth states.
- [x] Implement concurrent confirmation of one real-AI proposal and assert the same event result is reused.
- [x] Implement persisted event assertions through the authenticated UI/API and document test data cleanup.
- [ ] Run these checks against a dedicated test database and two test accounts.

### Task 3: Fixed AI evaluation set and sanitized report

**Files:**
- Create: `scripts/ai-evaluation.mjs`
- Create: `scripts/ai-evaluation-cases.mjs`
- Test: `scripts/ai-evaluation.test.mjs`
- Modify: `package.json`, `.gitignore`

- [x] Define exactly 15 cases: 3 event lookups, 4 availability queries, 4 proposal/context cases, and 4 ambiguity/unsupported/failure cases.
- [x] Test case schema and report sanitization before implementation.
- [x] Implement an explicit live-evaluation command for the authenticated chat endpoint; assert expected tools, arguments, cards, and proposal status without confirming a save.
- [x] Implement sanitized recording of model/prompt version, case ID, tool summaries, pass/fail, and failure reason without raw content or secrets.
- [ ] Run the 15-case evaluation against a dedicated test database and save its result.

### Task 4: Verification and handoff

**Files:**
- Modify: `.github/workflows/ci.yml` only if deterministic Playwright checks can run without test secrets.
- Create: `docs/issue-10-test-results.md` if any live checks are executed.

- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and deterministic Playwright checks.
- [ ] Run live DB/model checks only with dedicated configured test credentials and preserve sanitized evidence.
- [x] Record passed and not-run checks with their evidence source in `docs/issue-10-test-results.md`.
