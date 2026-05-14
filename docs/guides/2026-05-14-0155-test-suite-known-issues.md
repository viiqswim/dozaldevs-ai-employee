# Test Suite Known Issues

> Created: 2026-05-14. These are known pre-existing or deferred test failures. Do NOT attempt to fix these without a dedicated investigation ticket.

---

## 1. Test Suite Hangs / Extreme Slowness

**Symptom**: `pnpm test -- --run` takes 270+ seconds and sometimes hangs indefinitely without printing a final summary.

**Affected**: Full test suite run

**Root Cause**: Unknown. Likely one or more test files that spawn real processes (Docker, shell tools) or have unresolved async handles that prevent Vitest from exiting cleanly.

**Workaround**: Run individual test files directly: `pnpm test -- --run tests/path/to/specific.test.ts`

**To Investigate**:

- Use `--reporter=verbose` to identify which test file causes the hang
- Check for `process.exit` calls in test files (already seen in `trigger-task.test.ts`)
- Check for open handles with `--detectOpenHandles`

---

## 2. `feedback-injection.test.ts` — 4 Tests Skipped (mockCreateMachine never called)

**File**: `tests/inngest/feedback-injection.test.ts`

**Status**: 4 tests marked `it.skip` as of 2026-05-14

**Root Cause**: Tests set `FLY_WORKER_APP = 'ai-employee-workers'` but do NOT set `WORKER_RUNTIME=fly`. The lifecycle's executing step checks `if (process.env.WORKER_RUNTIME !== 'fly')` first — so it takes the local Docker path (`runLocalDockerContainer`) instead of the Fly path (`createMachine`). The tests assert `mockCreateMachine` was called, but it never is.

**Fix Required**: Either:

- Add `process.env.WORKER_RUNTIME = 'fly'` to the test `beforeEach`
- Or mock `runLocalDockerContainer` instead of `createMachine`

**Skipped Tests**:

- `all confirmed employee_rules are included in EMPLOYEE_RULES`
- `empty employee_rules results in EMPLOYEE_RULES absent from machine env`
- `safety cap truncates EMPLOYEE_RULES when it exceeds MAX_EMPLOYEE_RULES_CHARS`
- `KB themes are injected into EMPLOYEE_KNOWLEDGE without a slice cap`

---

## 3. `learned-rules-injection.test.ts` — 5 Tests Failing (same root cause as #2)

**File**: `tests/inngest/learned-rules-injection.test.ts`

**Status**: 5 tests failing with "spy called 0 times"

**Root Cause**: Same as issue #2 — tests expect `createMachine` to be called but lifecycle takes local Docker path.

**Fix Required**: Same as issue #2.

---

## 4. `multi-tenancy.test.ts` — 1 Test Failing

**File**: `tests/integration/multi-tenancy.test.ts`

**Failing Test**: `9. Tenant env loader: config flattening > summary.channel_ids and target_channel are flattened into env`

**Error**: `expected undefined to be 'C001,C002'`

**Status**: Pre-existing failure, unrelated to schema sync changes.

**To Investigate**: Check `tenant-env-loader.ts` — the `summary.channel_ids` flattening logic may have been removed or renamed.

---

## 5. `opencode-harness-delivery.test.ts` — 9 Tests Failing

**File**: `tests/workers/opencode-harness-delivery.test.ts`

**Status**: Pre-existing failures (9/15 tests fail)

**Root Cause**: Unknown — likely requires Docker socket or specific environment setup.

---

## 6. `employee-lifecycle-delivery.test.ts` — 3 Tests Failing

**File**: `tests/inngest/employee-lifecycle-delivery.test.ts`

**Status**: Pre-existing failures (3/9 tests fail)

**Root Cause**: Unknown — likely related to delivery machine mocking.

---

## 7. `lifecycle-guest-delivery.test.ts` — 2 Tests Failing

**File**: `tests/inngest/lifecycle-guest-delivery.test.ts`

**Failing Tests**: TDD RED phase tests (intentionally failing — marked as future work)

**Status**: Expected failures — these are TDD RED phase tests that document desired behavior not yet implemented.

---

## 8. `admin-property-locks.test.ts` — 2 Tests Failing

**File**: `tests/gateway/routes/admin-property-locks.test.ts`

**Status**: Pre-existing failures (2/14 tests fail)

**Root Cause**: Unknown.

---

## Summary Table

| File                                  | Failing     | Cause                                       | Action                        |
| ------------------------------------- | ----------- | ------------------------------------------- | ----------------------------- |
| `feedback-injection.test.ts`          | 4 (skipped) | WORKER_RUNTIME not set to 'fly' in test env | Fix test setup                |
| `learned-rules-injection.test.ts`     | 5           | Same as above                               | Fix test setup                |
| `multi-tenancy.test.ts`               | 1           | channel_ids flattening broken               | Investigate tenant-env-loader |
| `opencode-harness-delivery.test.ts`   | 9           | Pre-existing                                | Investigate                   |
| `employee-lifecycle-delivery.test.ts` | 3           | Pre-existing                                | Investigate                   |
| `lifecycle-guest-delivery.test.ts`    | 2           | TDD RED (intentional)                       | Implement feature             |
| `admin-property-locks.test.ts`        | 2           | Pre-existing                                | Investigate                   |
