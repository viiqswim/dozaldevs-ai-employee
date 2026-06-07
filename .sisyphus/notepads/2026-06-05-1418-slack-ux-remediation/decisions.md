# Decisions — slack-ux-remediation

## [2026-06-05] Architecture Decisions

- ONE shared `src/lib/slack-copy.ts` — all conversational copy, no LLM, no randomized pools, employee-agnostic
- Handlers.ts B-tasks split into 3 region-disjoint groups (B1/B2/B3) to avoid merge conflicts
- Watchdog: DB-Failed BEFORE Slack update; per-task try/catch; null-ts → skip+log, never throw
- Pre-extract step is ISOLATED from send-confirmation (Metis recommendation)
- Size guard: 1800 bytes per button value (Slack limit is 2000, 200 byte safety margin)
