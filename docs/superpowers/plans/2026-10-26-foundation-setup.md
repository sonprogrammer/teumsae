# Foundation Setup Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Make the existing project folder runnable with Next.js App Router, TypeScript and Tailwind CSS before Git and worktree setup.

**Architecture:** Use package scripts for the same checks that CI will run. The original repository now contains the labeled interactive sample schedule, following the user's updated direction to defer worktree use until branch isolation is needed.

**Tech Stack:** Node.js 24 LTS, pnpm, Next.js, React, TypeScript, Tailwind CSS, ESLint.

**Build choice:** Use Next.js's supported Webpack build because Turbopack's CSS worker cannot bind a local port in this execution environment.

**Spec:** `docs/spec.md` and the approved setup scope in the conversation.

## Global Constraints
- Preserve `docs/spec.md`, `AGENTS.md` and `.gitignore`.
- Do not imply authentication, database persistence or AI are connected.
- Avoid trailing commas and unnecessary blank lines.
- Keep secrets out of source, command output and commits.
- Git initialization and the first commit were completed by the user. The existing sibling `chore/setup` worktree remains unused for this sample UI task.

## Review Focus
- A fresh install must use the recorded pnpm lockfile and Node 24.
- The first page must clearly identify itself as a sample.
- CI must run the same typecheck, lint and build commands defined locally.

---

### Task 1: Runtime and framework

**Files:** `.nvmrc`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next-env.d.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`.

**Interfaces:** `pnpm dev` serves the page; `pnpm run typecheck`, `pnpm run lint` and `pnpm run build` verify it.

- [x] Create the minimal Next.js App Router, TypeScript and Tailwind configuration for Node 24.
- [x] Install dependencies and generate a lockfile without overwriting existing project files.
- [ ] Run the app and check that the sample label is visible.
- [x] Run typecheck, lint and build; fix actual failures.

### Task 2: CI

**Files:** `.github/workflows/ci.yml`.

**Interfaces:** CI installs with `pnpm install --frozen-lockfile` on Node 24 and runs the three verification scripts.

- [x] Add the GitHub Actions workflow.
- [x] Verify its commands match `package.json`; remote CI has not been run for the current uncommitted changes.
