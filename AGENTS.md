# Teumsae repository guidance

## Scope
- Follow `docs/spec.md` as the product reference. Separate confirmed requirements from proposals.
- The current setup task covers developer tooling and CI. Keep the existing uncommitted sample screen intact while its design is discussed.
- Keep real authentication, database persistence, AI, MCP and notes for later tasks. Never claim sample actions were saved to a database.
- Preserve existing files and Git changes. Discuss and approve detailed design before further feature implementation.
- Develop each future feature on its own branch and use a PR with passing CI for review. Do not add feature work directly to `main`.

## Code style
- Prefer established project conventions. Keep the structure and dependencies limited to the current task.
- Avoid unnecessary blank lines and trailing commas.
- Keep destructured function and component props parameters on one line when practical.
- Do not commit secrets or print environment variable values.

## Verification
- After setup, run the defined `typecheck`, `lint` and `build` scripts and report their actual results.
- Run the same checks in GitHub Actions. Distinguish checks not run from checks that passed.
- Verify the sample flow in desktop and mobile layouts: view schedules, inspect candidate slots, select one and confirm it into screen state.
