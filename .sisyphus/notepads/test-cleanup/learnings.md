# Learnings — test-cleanup

## [2026-05-30] Session start

- 22 failing test files confirmed from full test run (22 files failed, 63 tests failed, 13 unhandled rejections)
- 1,639 tests pass — healthy baseline to protect
- 4 protected files must NEVER be deleted: container-boot.test.ts, inngest-serve.test.ts, trigger-task.test.ts, setup.test.ts
- AGENTS.md "Pre-existing Test Failures" has stale inngest-serve.test.ts entry (it passes, 1 intentional skip)
- User wants ALL hardcoded test counts removed from docs (not replaced with new counts — removed entirely)
- Task 3 (docs cleanup) is independent of Task 2 (test run) — can run in parallel
