---
name: teumsae-backend
description: Use when changing Teumsae authentication, database schema or RLS, schedule APIs, time calculation, availability search, or event confirmation.
---

# Teumsae backend

Keep ownership, time and persistence decisions on the server and in the database. Read the approved issue or design plus `docs/spec.md` §5, §7.3 and §8 before changing the relevant path. Distinguish confirmed requirements from the spec's proposed defaults.

## Review the data path

| Operation | Server responsibility |
| --- | --- |
| Read | Resolve the owner from verified auth, apply owner-scoped queries and RLS, avoid shared caching of personal responses. |
| Calculate | Interpret dates in Asia/Seoul; use the agreed activity window, duration and half-open overlap rules. Return concrete times from deterministic code. |
| Prepare | Treat AI output and client candidate IDs as untrusted. Validate the current search, owner, expiry and settings version; create a proposal without an event. |
| Confirm or mutate | Recheck ownership, current time rules and conflicts in the actual write path. Make retries and concurrent requests safe before reporting saved success. |

Example: two confirmation requests for one proposal arrive together. The database transaction must produce one event and a repeatable result; a disabled button alone cannot guarantee this.

When schema, grants or privileged clients change, verify anonymous and cross-account denial with an actual database before claiming isolation. Keep secret keys server-side and out of logs, commits and client bundles. Report a missing live DB check as unverified rather than passed.
