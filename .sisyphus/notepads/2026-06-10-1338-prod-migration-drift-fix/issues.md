# Issues — prod-migration-drift-fix

## [2026-06-10] Plan initialized — no issues yet

## [2026-06-10] Task 4 — grep false-negative (resolved, not a blocker)
- Suggested verification grep `"deleted_at does not exist"` is WRONG: Prisma error text is `` The column `tasks.deleted_at` does not exist `` — a backtick sits between the column and `does`. Bare substring grep => 0 matches even when errors are present (false clean).
- Mitigation used: server-side `startTime` filter on the Render logs API to bound the fresh window (0 errors in-window is the real gate), cross-checked with a backtick-aware grep on historical logs (found the pre-window P2022s, confirming the pattern works).
- No service-restart action was required — endpoints already returned 200 with `deleted_at` in the body, proving Prisma sees the migrated schema.
