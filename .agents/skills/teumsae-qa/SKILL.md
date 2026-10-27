---
name: teumsae-qa
description: Use when planning Teumsae feature tests, reviewing a PR, checking a release candidate, or reporting verification of schedule, authentication, database, or AI flows.
---

# Teumsae QA

Judge the changed behavior against its approved scope and `docs/spec.md` §9. Build a small feature-specific matrix of user action, expected result, evidence and environment. Do not turn every PR into a full release test.

## Evidence by change

| Change | Check beyond code style |
| --- | --- |
| Calendar or AI panel | Desktop and mobile path through schedule view, candidate, confirmation and resulting state; keyboard access and distinct empty/error states. |
| Auth or personal data | Two real accounts, anonymous access, cross-account denial, session restore and logout followed by direct URL access. |
| Time or writes | Boundary times, adjacent versus overlapping events, stale candidate, duplicate submission, concurrent writes and retry after lost response. |
| AI integration | Fixed-response tests for repeatability and separate real-model evaluation of the claimed tasks. |

For each claim, identify whether evidence came from unit tests, browser observation, a real DB/service, or CI. A mock cannot prove RLS or email delivery. A passed build cannot prove a mobile flow.

Example: a PR says “saving is complete.” Verify a confirmed event appears after reload in the correct account and a repeated confirmation does not create another row. If the DB was unavailable, report those checks as unrun and keep the claim narrower.

Report actionable failures with steps, expected and actual results. Preserve failing evidence; do not weaken checks to make a PR green.
