# Issues — onboarding-readiness

## [2026-06-07] Known Issues

- tenant-repository.test.ts has DB cleanup gap (Prisma unique constraint on slug) — this is an integration test, will be fixed by moving to tests/integration/ with proper isolation in Task 0.7
- process.exit leaks from opencode-harness.mts:995 and trigger-task.ts:703 — fix in Task 0.6
