# Test Suite Known Issues

> Created: 2026-05-14. These are known pre-existing or deferred test failures. Do NOT attempt to fix these without a dedicated investigation ticket.
>
> Updated: 2026-05-14 — All 8 issues resolved or deferred as part of `test-suite-fixes` plan (T1–T11).

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

**Status: RESOLVED** — Fixed process listener leak in `opencode-server.ts` (T1), optimized globalSetup with migration/seed skip checks (T2), rewrote opencode-server tests with fake timers (T6), reduced orchestrate.test.ts delays from 50ms to 1ms (T11).

---

## 2. `feedback-injection.test.ts` — 4 Tests Skipped (mockCreateMachine never called)

**File**: `tests/inngest/feedback-injection.test.ts`

**Root Cause**: Tests set `FLY_WORKER_APP = 'ai-employee-workers'` but do NOT set `WORKER_RUNTIME=fly`. The lifecycle's executing step checks `if (process.env.WORKER_RUNTIME !== 'fly')` first — so it takes the local Docker path (`runLocalDockerContainer`) instead of the Fly path (`createMachine`). The tests assert `mockCreateMachine` was called, but it never is.

**Skipped Tests**:

- `all confirmed employee_rules are included in EMPLOYEE_RULES`
- `empty employee_rules results in EMPLOYEE_RULES absent from machine env`
- `safety cap truncates EMPLOYEE_RULES when it exceeds MAX_EMPLOYEE_RULES_CHARS`
- `KB themes are injected into EMPLOYEE_KNOWLEDGE without a slice cap`

**Status: RESOLVED** — Added `WORKER_RUNTIME=fly` to `beforeEach`/`afterEach`, un-skipped all 4 tests (T7).

---

## 3. `learned-rules-injection.test.ts` — 5 Tests Failing (same root cause as #2)

**File**: `tests/inngest/learned-rules-injection.test.ts`

**Root Cause**: Same as issue #2 — tests expect `createMachine` to be called but lifecycle takes local Docker path.

**Status: RESOLVED** — Added `WORKER_RUNTIME=fly` to `beforeEach`/`afterEach` (T8).

---

## 4. `multi-tenancy.test.ts` — 1 Test Failing

**File**: `tests/integration/multi-tenancy.test.ts`

**Failing Test**: `9. Tenant env loader: config flattening > summary.channel_ids and target_channel are flattened into env`

**Error**: `expected undefined to be 'C001,C002'`

**Root Cause**: Test assertions used old env var names. The `tenant-env-loader.ts` uses `SOURCE_CHANNELS` and `PUBLISH_CHANNEL` (not `summary.channel_ids`/`target_channel`).

**Status: RESOLVED** — Updated test assertions to use `SOURCE_CHANNELS` and `PUBLISH_CHANNEL` (T4).

---

## 5. `opencode-harness-delivery.test.ts` — 9 Tests Failing

**File**: `tests/workers/opencode-harness-delivery.test.ts`

**Root Cause**: Mock archetype was missing `enrichment_adapter: 'hostfully'` field; `process.exit` mock was not throwing on first call, causing test flow issues.

**Status: RESOLVED** — Added `enrichment_adapter: 'hostfully'` to mock archetype, fixed `process.exit` mock to throw on first call (T9).

---

## 6. `employee-lifecycle-delivery.test.ts` — 3 Tests Failing

**File**: `tests/inngest/employee-lifecycle-delivery.test.ts`

**Root Cause**: Mock archetype was missing `NOTIFICATION_CHANNEL`; tests did not set `WORKER_RUNTIME=fly`.

**Status: RESOLVED** — Added `NOTIFICATION_CHANNEL` to mock and `WORKER_RUNTIME=fly` to `beforeEach` (T10).

---

## 7. `lifecycle-guest-delivery.test.ts` — 2 Tests Failing

**File**: `tests/inngest/lifecycle-guest-delivery.test.ts`

**Failing Tests**: TDD RED phase tests (intentionally failing — marked as future work)

**Root Cause**: These tests document desired behavior (delivery card Slack update) not yet implemented.

**Status: DEFERRED** — 2 TDD RED tests marked `.skip` with TODO comment; delivery card Slack update feature not yet implemented (T5). Will be un-skipped when the feature is built.

---

## 8. `admin-property-locks.test.ts` — 2 Tests Failing

**File**: `tests/gateway/routes/admin-property-locks.test.ts`

**Root Cause**: Test assertions used exact object matching for `where` clause, but the implementation uses a superset of fields.

**Status: RESOLVED** — Updated assertions to use `expect.objectContaining()` for `where` clause (T3).

---

## Summary Table

| File                                  | Was Failing | Resolution                                                                 | Status   |
| ------------------------------------- | ----------- | -------------------------------------------------------------------------- | -------- |
| `feedback-injection.test.ts`          | 4 (skipped) | Added `WORKER_RUNTIME=fly` to beforeEach/afterEach, un-skipped 4 tests     | RESOLVED |
| `learned-rules-injection.test.ts`     | 5           | Added `WORKER_RUNTIME=fly` to beforeEach/afterEach                         | RESOLVED |
| `multi-tenancy.test.ts`               | 1           | Updated assertions to use `SOURCE_CHANNELS` and `PUBLISH_CHANNEL`          | RESOLVED |
| `opencode-harness-delivery.test.ts`   | 9           | Added `enrichment_adapter`, fixed `process.exit` mock                      | RESOLVED |
| `employee-lifecycle-delivery.test.ts` | 3           | Added `NOTIFICATION_CHANNEL` + `WORKER_RUNTIME=fly` to beforeEach          | RESOLVED |
| `lifecycle-guest-delivery.test.ts`    | 2           | Marked `.skip` with TODO — feature not yet implemented                     | DEFERRED |
| `admin-property-locks.test.ts`        | 2           | Updated assertions to use `expect.objectContaining()`                      | RESOLVED |
| Full suite hangs                      | N/A         | Fixed process listener leak, fake timers, reduced delays in orchestrate.ts | RESOLVED |
