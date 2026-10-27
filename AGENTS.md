# Teumsae repository guidance

## Scope
- Follow `docs/spec.md` as the product reference. Separate confirmed requirements from proposals.
- Keep each task within its approved issue or PR scope. Preserve existing files and Git changes.
- Develop each feature on its own branch and review it through a PR with passing CI. Do not add feature work directly to `main`.
- Distinguish sample screen state from authenticated database data. Never claim sample actions were saved to a database.
- Keep AI, MCP and notes out of a task unless its scope explicitly includes them.

## Project skills
- Use `.agents/skills/teumsae-frontend/SKILL.md` for schedule UI, calendar, forms and AI panel work.
- Use `.agents/skills/teumsae-backend/SKILL.md` for authentication, database, time calculation and API work.
- Use `.agents/skills/teumsae-qa/SKILL.md` when planning or performing feature verification and PR review.
- Read only the relevant skill for the task; the product rules remain in `docs/spec.md`.

## Code style
- Prefer established project conventions. Keep the structure and dependencies limited to the current task.
- Avoid unnecessary blank lines and trailing commas.
- Keep destructured function and component props parameters on one line when practical.
- Do not commit secrets or print environment variable values.

## Verification
- Run the checks relevant to the change, including the defined `test`, `typecheck`, `lint` and `build` scripts when applicable, and report their actual results.
- Distinguish local checks, GitHub Actions checks and live service checks. Distinguish checks not run from checks that passed.
- Verify affected user flows in desktop and mobile layouts when changing the interface.
