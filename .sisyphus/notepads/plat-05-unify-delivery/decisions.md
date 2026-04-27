# Decisions — plat-05-unify-delivery

## [2026-04-26] Session start

- Test strategy: Tests-after (implement first, comprehensive tests after)
- EMPLOYEE_PHASE=delivery env var chosen over passing instructions directly (avoids long env var strings)
- E2E verification: both automated tests AND admin API trigger-and-verify
- Approval message update stays in lifecycle (slackClient.updateMessage) — NOT in delivery machine
- Scope OUT: FLY_SUMMARIZER_APP cleanup, no-approval path changes, deprecated file modifications
- Scope OUT: docs/2026-04-14-0104-full-system-vision.md — only update 2026-04-24-1452-current-system-state.md
