# Issues — onboarding-readiness

## [2026-06-07] Known Issues

- tenant-repository.test.ts has DB cleanup gap (Prisma unique constraint on slug) — this is an integration test, will be fixed by moving to tests/integration/ with proper isolation in Task 0.7
- process.exit leaks from opencode-harness.mts:995 and trigger-task.ts:703 — fix in Task 0.6

## F2 Code Quality Review — Integration Test Findings (2026-06-07)

### Two integration test files failed in the full `pnpm test:integration` run — BOTH confirmed environmental/pre-existing, NOT plan regressions:

**1. `tests/integration/gateway/services/tenant-repository.test.ts` (13/13 failed)**
- Root cause: DIRTY TEST DB. 51 orphaned `tenants` rows + 1 orphaned `tenant_integrations` row accumulated from prior runs.
- Symptom: `Unique constraint failed on the fields: (slug)` on create; `afterEach` cleanup fails with `Foreign key constraint violated: tenant_integrations_tenant_id_fkey` (the test's afterEach deletes `tenant`+`tenantSecret` but NOT `tenant_integrations`).
- PROOF it's environmental: After `DELETE`ing the 51 orphan rows from `ai_employee_test`, re-ran the file in isolation → **13/13 PASS (67ms)**.
- Plan did NOT touch this file or `tenant-repository.ts` (last touched by commit b70e32e1, pre-plan).
- NOTE: test has a latent cleanup-ordering bug (doesn't clean tenant_integrations) but that is pre-existing and out of F2 scope.

**2. `tests/integration/workers/opencode-harness-metrics.test.ts` (7/8 failed, 84s)**
- Root cause: PRE-EXISTING FLAKY/SLOW TEST. 7 `vi.waitFor({timeout:12000})` assertions on `process.exit` spy that never fire → each times out → 84s wall time, 7 failures.
- Fully mocked (child_process, fs, opencode-server, session-manager, heartbeat, logger, global fetch) — no real infra dependency, yet fails deterministically even in TRUE isolation.
- DECISIVE PROOF it's pre-existing: created a git worktree at the pre-plan PARENT commit `be4fc395` (before ANY plan commit) and ran the test at its OLD path `tests/workers/` with the OLD `vitest.config.ts` → **identical 7/8 fail, 84203ms**.
- The plan's first commit `5be3b770` only RELOCATED this file (`tests/workers/` → `tests/integration/workers/`) with a pure import-path depth change (`../../` → `../../../`); test logic byte-identical.
- Prior `observability-strategy` notepad claimed 8/8 PASS, but that does not reproduce at the pre-plan commit — the test was already broken before this plan started.

### Verdict: APPROVE. Build/Lint/Unit all clean. Integration failures are 100% environmental (dirty DB) + pre-existing (flaky harness-metrics), neither caused by the onboarding-readiness plan.

### Code quality scan results (all changed files):
- `eslint-disable no-explicit-any`: ZERO in non-deprecated files
- `as any`: ZERO across all non-deprecated src
- `@ts-ignore` / `@ts-nocheck`: ZERO
- empty catch blocks: ZERO in changed files
- commented-out code / TODO / FIXME: ZERO in changed files
- `console.log`: only in `src/worker-tools/hostfully/register-webhook.ts` (pre-existing, commit 6f4b6328, a one-time CLI registration utility — NOT in plan scope; CLI tools legitimately print to stdout)
- New helper files (require-env, get-arg, unescape-args, postgrest-types, prisma-helpers, events.ts, lifecycle-mocks, lifecycle/steps/*): all exemplary — full JSDoc, `unknown` not `any`, typed interfaces, clean try/finally
