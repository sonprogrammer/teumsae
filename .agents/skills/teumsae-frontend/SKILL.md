---
name: teumsae-frontend
description: Use when changing Teumsae's calendar, schedule list, event forms, availability cards, confirmation cards, or mobile AI panel.
---

# Teumsae frontend

Build the user flow around a visible source of truth. Before editing, read the approved issue or design and the relevant parts of `docs/spec.md` (§4–6). The spec labels some details as proposals; do not silently treat them as confirmed decisions.

## UI decisions

- Trace the transition from schedule view → availability search → dated candidate → registration confirmation → saved result. A candidate selection alone does not create an event.
- Show the full date, weekday and time on candidate and confirmation cards. Keep the selected candidate recognizable when the panel opens, closes or the viewport changes.
- Label sample data and local-only actions. Show DB success only after the server reports a saved event, then refresh both calendar and selected-day list.
- Give loading, empty schedule, no available slot, lookup failure and save failure distinct messages. On save failure, retain the input and confirmation context.
- For changed controls, check keyboard access, labels, focus and disabled/busy states on desktop and mobile. The mobile flow must allow schedule review, candidate selection and confirmation without a desktop-only control.

Example: selecting the second slot opens a card with its actual date and time; pressing Confirm shows pending, then updates calendar and list only from the successful save response. A sample-only implementation updates local state and says so.

Verify the affected flow at desktop and mobile sizes. Record what was actually observed separately from code checks.
