# Teumsae repository guidance

## Scope
- Follow `docs/spec.md` as the product reference. Separate confirmed requirements from proposals.
- The `chore/setup` task covers the development environment, CI and a clearly labeled sample schedule screen only.
- Keep real authentication, database persistence, AI, MCP and notes for later tasks. Never claim sample actions were saved to a database.
- Preserve existing files and Git changes. Use the requested sibling worktree for implementation after the initial `main` commit.

## Code style
- Prefer established project conventions. Keep the structure and dependencies limited to the current task.
- Avoid unnecessary blank lines and trailing commas.
- Keep destructured function and component props parameters on one line when practical.
- Do not commit secrets or print environment variable values.

## Verification
- After setup, run the defined `typecheck`, `lint` and `build` scripts and report their actual results.
- Run the same checks in GitHub Actions. Distinguish checks not run from checks that passed.
- Verify the sample flow in desktop and mobile layouts: view schedules, inspect candidate slots, select one and confirm it into screen state.
