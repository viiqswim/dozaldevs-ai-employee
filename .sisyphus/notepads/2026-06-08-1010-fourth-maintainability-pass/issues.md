# Issues — Fourth Maintainability Pass

## [2026-06-08] Pre-existing LSP false alarms (DO NOT FIX)

- `vitest.config.ts:25` — coverage key error: vite type-version artifact, not real (confirmed in prior plans)
- `dashboard/src/components/InputSchemaEditor.tsx` — import errors: file correctly deleted in prior plan, stale LSP cache
- These are NOT regressions from this plan's work

## [2026-06-08] F2 Code Quality Review — TWO REGRESSIONS FOUND (REJECT)

### REGRESSION 1 — Lint fails (3 unused imports)

`src/workers/opencode-harness.mts` — leftovers from Task 16 harness decomposition (usage moved into execution-phase.mts / delivery-phase.mts):

- line 5: `startHeartbeat` (HeartbeatHandle type IS still used — only the value import is dead)
- line 10: `markFailed` and `writeOpencodeAuth` (`tryAutoPostApprovalCard` on same line IS still used)
  ESLint: `✖ 3 problems (3 errors, 0 warnings)` → `pnpm lint` exits 1.
  Fix: drop `startHeartbeat` from the line-5 import (keep `type HeartbeatHandle`); drop `markFailed` + `writeOpencodeAuth` from line-10 import (keep `tryAutoPostApprovalCard`). Verify none are still referenced elsewhere in the harness before removing.

### REGRESSION 2 — Integration suite exits 1 on BOTH runs (deterministic)

Unhandled Rejection: `Error: process.exit unexpectedly called with "1"` → `runExecutionPhase src/workers/lib/execution-phase.mts:251` (`process.exit(1)` in the catch block after markFailed).

- All 450 integration tests "passed" but suite exits 1 both times (NOT a cleanup/flake issue — reproducible).
- Vitest blames `tests/integration/worker-tools/sifely/diagnose-access.test.ts` as "last running" — that file is NOT the cause; it was untouched this pass. Real trigger: the modified `tests/integration/workers/opencode-harness-metrics.test.ts` fires `void runExecutionPhase(...)` fire-and-forget (line 196). The `exitSpy` (process.exit mock) is restored in `afterEach` via `vi.restoreAllMocks()`; a leaked async continuation of runExecutionPhase then calls the REAL process.exit(1) after the test file completes, surfacing as an unhandled rejection attributed to whatever file is running next.
- Pre-decomposition, this test imported the harness module directly and the same exit path existed but was contained; the extraction + `void` fire-and-forget invocation changed the timing so the exit now leaks past afterEach.
  Fix options (for executor, not F2): await the runExecutionPhase promise in loadHarness OR ensure exitSpy stays active until the leaked promise settles OR have the test catch the process.exit. New tests must assert CURRENT behavior — but here the test itself leaks. This is a test-infra regression introduced by Task 16's decomposition + the metrics-test rewrite.

### PASSING gates

- Build (tsc): PASS (exit 0, clean)
- Unit: 138 files, 1595 passed, 9 skipped, 0 failed — matches expectation exactly
- Dashboard build: PASS (vite built in 425ms; 500kB chunk warning is pre-existing/cosmetic)
- No new `as any`/`@ts-ignore`, no empty catches, no console.\* in prod, no commented-out code, no TODO/FIXME added

### VERDICT: REJECT (Lint F, Integration×2 F)
