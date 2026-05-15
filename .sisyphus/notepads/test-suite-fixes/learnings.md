
## Task 1: Process listener leak fix (opencode-server.ts)

- Used a module-scope `WeakMap<ChildProcess, () => void>` (`exitListenerRegistry`) to store the `removeExitListeners` function per child process — avoids changing the public `OpencodeServerHandle` interface
- `removeExitListeners` calls `process.removeListener('exit', exitCleanup)` and `process.removeListener('SIGTERM', exitCleanup)`
- Called in two places: (1) child `'exit'` event handler, (2) `stopOpencodeServer()` via WeakMap lookup
- WeakMap is GC-friendly — entries auto-expire when the ChildProcess is collected
- Pre-existing test failures in this file: 3 tests that rely on stdout emitting 'listening' text but mock never emits it (pre-existing, not introduced by this fix)
- `stopOpencodeServer` tests all pass; no maxlisteners warnings

## Task 2: Fast Global Setup (2026-05-15)

### Migration skip check
- `pnpm prisma migrate status` outputs "Database schema is up to date!" when no pending migrations
- Non-zero exit code = pending migrations (execSync throws) → catch returns false → triggers deploy
- Pattern: `execSync(..., { stdio: 'pipe' }).toString().includes('Database schema is up to date!')`

### Seed skip check
- `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee_test -t -c "SELECT COUNT(*) FROM tenants"` returns row count
- Count > 0 = seed present → skip `db:seed`
- Shell command works reliably; no need for Prisma client in setup()

### Teardown disconnect
- `teardown()` must be `async` to use dynamic import + `$disconnect()`
- Dynamic import: `const { PrismaClient } = await import('@prisma/client')`
- Swallow disconnect errors — process is exiting anyway

### Result
- `tests/setup.test.ts` passes in ~1.1s (was 10-25s when migrations/seed ran)
- Skip messages logged: "✅ Migrations already up to date — skipping migrate deploy" / "✅ Seed data already present — skipping db:seed"

## Task 3: admin-property-locks.test.ts — where clause exact vs partial matching

**Pattern**: When a route handler uses `where: { id, tenant_id }` for multi-tenancy security, tests that assert `where: { id: LOCK_ID }` (exact object match) will fail because the actual object has extra keys.

**Fix**: Wrap the `where` value in `expect.objectContaining()`:
- Before: `expect.objectContaining({ where: { id: LOCK_ID } })`
- After: `expect.objectContaining({ where: expect.objectContaining({ id: LOCK_ID }) })`

**Affected tests**: Test 11 (PATCH update) and Test 13 (DELETE) in `admin-property-locks.test.ts`

**Rule**: Never use exact object matching for `where` clauses in multi-tenant routes — always use `expect.objectContaining()` to allow for `tenant_id` and other security fields.

**Evidence**: `.sisyphus/evidence/task-3-property-locks.txt` — 14 passed, 0 failed

## Task 4: multi-tenancy.test.ts — stale env var names (2026-05-15)

**Root cause**: `tenant-env-loader.ts` was refactored to rename env vars:
- `DAILY_SUMMARY_CHANNELS` → `SOURCE_CHANNELS`
- `SUMMARY_TARGET_CHANNEL` → `PUBLISH_CHANNEL`
- Config key `target_channel` → `publish_channel` (under `summary` object)

**Fix in `tests/integration/multi-tenancy.test.ts`**:
1. Config fixture: `target_channel: 'C_TARGET'` → `publish_channel: 'C_TARGET'`
2. Assertion: `env['DAILY_SUMMARY_CHANNELS']` → `env['SOURCE_CHANNELS']`
3. Assertion: `env['SUMMARY_TARGET_CHANNEL']` → `env['PUBLISH_CHANNEL']`

**Source behavior** (lines 60-76 of `tenant-env-loader.ts`):
- `SOURCE_CHANNELS` is set from `config.source_channels` (primary) or `config.summary.channel_ids` (legacy fallback)
- `PUBLISH_CHANNEL` is set from `config.summary.publish_channel`

**Note**: `tests/gateway/services/tenant-env-loader.test.ts` has additional tests expecting `DAILY_SUMMARY_CHANNELS` as a backward-compat alias — those are separate pre-existing failures not in scope for this task.

**Evidence**: `.sisyphus/evidence/task-4-multi-tenancy.txt` — 18 tests passed, 0 failed

## Task 5: lifecycle-guest-delivery.test.ts — TDD RED skip (2026-05-15)

**What was done**: Marked 2 TDD RED tests as `it.skip(` with TODO comment pointing to known-issues doc Issue #7.

**Pre-existing failure discovered**: `edited response sent correctly` was already failing before Task 5 changes (Inngest API Error: 200 []). This is in Task 10 scope (NOTIFICATION_CHANNEL fix). The original state had 24 total failures across 8 test files.

**Result**: 4 tests | 1 passed | 2 skipped | 1 failed (pre-existing, Task 10 scope)

**Pattern**: When task spec says "check if they pass first" — run the tests before deciding. If a test is already failing (pre-existing), document it as out-of-scope rather than silently skipping it.

## Task 7: feedback-injection.test.ts — WORKER_RUNTIME=fly required (2026-05-15)

**Root cause**: The lifecycle checks `process.env.WORKER_RUNTIME` to decide Fly vs local Docker path. Without `WORKER_RUNTIME=fly`, `createMachine` is never called, so all assertions on `mockCreateMachine` fail.

**Fix**:
1. Added `process.env.WORKER_RUNTIME = 'fly';` to `beforeEach` (after `FLY_WORKER_APP`)
2. Added `delete process.env.WORKER_RUNTIME;` to `afterEach` (after `FLY_WORKER_APP` delete)
3. Changed all 4 `it.skip(` → `it(` in the "feedback injection" describe block

**Tests un-skipped**:
- `all confirmed employee_rules are included in EMPLOYEE_RULES`
- `empty employee_rules results in EMPLOYEE_RULES absent from machine env`
- `safety cap truncates EMPLOYEE_RULES when it exceeds MAX_EMPLOYEE_RULES_CHARS`
- `KB themes are injected into EMPLOYEE_KNOWLEDGE without a slice cap`

**Result**: 5 tests | 5 passed | 0 failed | 0 skipped

**Evidence**: `.sisyphus/evidence/task-7-feedback-injection.txt`

**Pattern**: Same root cause as T8 (learned-rules-injection.test.ts). Any test that asserts on `mockCreateMachine` calls needs `WORKER_RUNTIME=fly` in beforeEach.

## Task 6: opencode-server.test.ts fixes (2026-05-14)

### Spawn arg assertions with spread env
When source spreads `process.env` in spawn options, use `expect.objectContaining()` for the third arg:
```typescript
expect(mockSpawn).toHaveBeenCalledWith(
  'opencode',
  ['serve', '--port', '4096', '--hostname', '0.0.0.0', '--print-logs'],
  expect.objectContaining({ env: expect.objectContaining({ OPENCODE_IDLE_TIMEOUT: expect.any(String) }) }),
);
```

### stdout-based server detection (not HTTP polling)
Source detects server readiness via `childProcess.stdout?.on('data', chunk => text.includes('listening'))`.
To trigger in tests: `(mockProc.stdout as EventEmitter).emit('data', Buffer.from('listening on port 4096'))`.
After emitting, advance fake timers by 201ms (source has 200ms delay before resolveOnce).

### net mock needed for keepalive tests
When 'listening' is detected, source calls `startTcpKeepalive()` → `net.createConnection()`. Mock net to prevent real TCP:
```typescript
vi.mock('net', () => ({
  default: { createConnection: vi.fn(() => ({ destroyed: false, destroy: vi.fn(), on: vi.fn() })) },
}));
```

### SIGKILL timeout pattern (5s)
stopOpencodeServer has `setTimeout(..., 5000)` for SIGKILL. Replace real waits with:
```typescript
vi.useFakeTimers();
const promise = stopOpencodeServer(handle);
vi.advanceTimersByTime(5001);
await promise;
vi.useRealTimers();
```

### 200ms resolve delay in startOpencodeServer
After detecting 'listening', source does `setTimeout(() => resolveOnce(handle), 200)`.
Must advance timers by ≥201ms before awaiting the promise.

## Task 11 — orchestrate.test.ts setTimeout reduction

- **Change**: 44 × `setTimeout(resolve, 50)` → `setTimeout(resolve, 1)` in `tests/workers/orchestrate.test.ts`
- **Savings**: ~2.1s (44 × 49ms)
- **Result**: All 44 tests still pass; total suite time ~39s
- **Observation**: The dominant cost per test (~1s each) comes from other mock delays in test setup, not the 50ms ones. The 50ms delays were just async cleanup settlers — 1ms is sufficient.
- **Pattern**: For deprecated test files with real `setTimeout` delays used as async settlers, reducing to 1ms is safe and saves meaningful time without changing behavior.

## T8: learned-rules-injection.test.ts (2026-05-15)

**Fix**: Added `process.env.WORKER_RUNTIME = 'fly'` to `beforeEach` and `delete process.env.WORKER_RUNTIME` to `afterEach`.

**Root cause**: Identical to T7 (feedback-injection.test.ts). The lifecycle checks `WORKER_RUNTIME` to decide Fly vs local Docker path. Without `WORKER_RUNTIME=fly`, `createMachine` is never called, so all assertions on `mockCreateMachine` fail.

**Result**: 7/7 tests pass.

**Pattern**: Any test that asserts on `mockCreateMachine` calls must set `WORKER_RUNTIME=fly` in `beforeEach`.

## T10: employee-lifecycle-delivery.test.ts (2026-05-15)

**Fix**: Two changes to `beforeEach`/`afterEach`:
1. Added `NOTIFICATION_CHANNEL: 'C-FALLBACK'` to `mockLoadTenantEnv` return (keeps `SUMMARY_TARGET_CHANNEL` too for backward compat)
2. Added `process.env.WORKER_RUNTIME = 'fly'` to `beforeEach` and `delete process.env.WORKER_RUNTIME` to `afterEach`

**Root cause**: 
- Without `WORKER_RUNTIME=fly`: lifecycle took `runLocalDockerContainer()` branch (uses `execSync`) instead of `createMachine()`. Tests 1-3 asserted `mockCreateMachine` was called but it never was.
- Source at line 1355-1359 uses fallback chain: `metadata.target_channel ?? NOTIFICATION_CHANNEL ?? SUMMARY_TARGET_CHANNEL ?? ''`
- Adding NOTIFICATION_CHANNEL ensures the priority chain is reflected in the default mock

**Result**: 9/9 tests pass (was 3 failing)

**Pattern**: Same root cause as T7 and T8. Any delivery test asserting `mockCreateMachine` must set `WORKER_RUNTIME=fly` in `beforeEach`.

**Note on test runner**: `pnpm test -- --run <file>` does NOT filter correctly in this project (singleFork mode). Use `pnpm exec vitest run <file>` instead.

## T9: opencode-harness-delivery.test.ts (2026-05-15)

**Root cause 1 — process.exit no-op allows fallthrough**:
- The delivery success path ends with `process.exit(0)` (line 535 of harness).
- Original mock: `vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)` — a no-op.
- After the delivery branch "exited", code fell through into the non-delivery execution path.
- Non-delivery path posted to `/executions`, `/deliverables`, then patched task to `Submitting`.
- Tests checking `patchCalls.at(-1).status === 'Done'` saw `Submitting` instead.
- Fix: mock throws on **first** call (stopping main() via rejected promise).
  Second call (from `main().catch()` handler) is no-op to avoid unhandled rejection.
  ```typescript
  let exitCallCount = 0;
  vi.spyOn(process, 'exit').mockImplementation((_code) => {
    if (++exitCallCount === 1) throw new Error('process.exit called');
    return undefined as never;
  });
  ```

**Root cause 2 — missing enrichment_adapter in mock archetype**:
- Harness checks `archetype.enrichment_adapter` (line 459) to decide whether to call the Hostfully delivery adapter.
- The adapter is registered under key `'hostfully'` (NOT `'guest-messaging'`).
- Without `enrichment_adapter` in the mock, adapter was never loaded/called.
- Guest-messaging tests asserting `promptArg.includes('pre-parsed')` would fail.
- Fix: add `enrichment_adapter` to `buildMockFetch` mock archetype, derived from `roleName`:
  ```typescript
  enrichment_adapter: roleName === 'guest-messaging' ? 'hostfully' : null,
  ```

**Why failed tests NOT delivery-failure tests**:
- All delivery failure paths use `return` (not `process.exit`) → `main()` exits cleanly, no fallthrough.
- Only the success path used `process.exit(0)` → affected all 9 "should reach Done" tests.

**Dynamic import of adapter after vi.resetModules()**:
- `vi.resetModules()` clears instance cache but NOT mock factories.
- Static `import { getDeliveryAdapter } from './lib/delivery-adapters/index.mjs'` → creates fresh `adapters = {}`.
- Dynamic `import('./lib/delivery-adapters/guest-messaging.mjs')` inside `main()` → loads same cached `index.mjs` instance → `registerDeliveryAdapter('hostfully', fn)` populates it correctly.
- `getDeliveryAdapter('hostfully')` finds the registered adapter. ✓

**Result**: 15/15 tests pass (was 9 failing)

**Evidence**: `.sisyphus/evidence/task-9-harness-delivery.txt`

## Task 12: Full Suite Verification Run (2026-05-15)

### Run Summary
- **Command**: `time pnpm test -- --run 2>&1 | tee /tmp/test-suite-full.log`
- **Duration**: 124.91s — OVER 60s threshold
- **Test Files**: 15 failed | 151 passed | 3 skipped (169 total)
- **Tests**: 40 failed | 1770 passed | 16 skipped (1826 total)
- **MaxListenersExceededWarning**: NOT FOUND ✅
- **Pass count**: 1770 ≥ 515 ✅

### Criteria Verdict
| Criterion | Target | Actual | Pass? |
|-----------|--------|--------|-------|
| 0 failures | 0 | 40 | ❌ |
| Wall-clock < 60s | <60s | 124.91s | ❌ |
| No MaxListenersExceededWarning | none | none | ✅ |
| Pass count ≥ 515 | ≥515 | 1770 | ✅ |

### Failed Test Files (13 files, 40 failures)

**Pre-existing known failures (expected, do NOT fix):**
- `tests/gateway/inngest-serve.test.ts` (1) — stale function count `2` vs actual `9`

**Unexpected failures needing Atlas attention:**

| File | Failures | Sample failure |
|------|----------|----------------|
| `tests/gateway/services/tenant-repository.test.ts` | 13 | All TenantRepository CRUD tests |
| `tests/workers/lib/fallback-pr.test.ts` | 11 | All createFallbackPr() tests |
| `tests/gateway/services/tenant-env-loader.test.ts` | 5 | DAILY_SUMMARY_CHANNELS, SUMMARY_TARGET_CHANNEL mapping |
| `tests/inngest/lifecycle-notify-msg-ts.test.ts` | 2 | NOTIFY_MSG_TS injection |
| `tests/inngest/lifecycle-guest-delivery.test.ts` | 1 | "edited response sent correctly" (TDD RED phase test not `.skip`ed) |
| `tests/inngest/lifecycle-feedback-context-rejection.test.ts` | 1 | EMPLOYEE_RULES injection |
| `tests/gateway/services/employee-dispatcher.test.ts` | 1 | unsupported runtime |
| `tests/gateway/slack/installation-store.test.ts` | 1 | deleteInstallation |
| `tests/workers/lib/between-wave-push.test.ts` | 1 | --force-with-lease flag |
| `tests/workers/lib/branch-manager.test.ts` | 1 | commitAndPush() returns { pushed: false, error } |
| `tests/schema.test.ts` | 1 | Table count: expected 23, got 24 (extra table in DB) |
| `tests/gateway/jira-webhook-with-new-project.test.ts` | 1 | unknown project key → 200 project_not_registered |

### Performance Issue
- Duration 124.91s is 2x over the 60s threshold
- Likely bottleneck: shell tool tests using `tsx` subprocess spawns (e.g. knowledge_base/search.test.ts took 4897ms for 12 tests)
- `singleFork: true` in vitest.config.ts — all tests share one process, so no parallelism benefits apply across files

### Unhandled Error (does not count as test failure)
- `tests/scripts/trigger-task.test.ts` emitted `process.exit unexpectedly called with "1"` as an unhandled rejection
- All 17 tests in that file PASSED — the error originates from a code path after test completion
