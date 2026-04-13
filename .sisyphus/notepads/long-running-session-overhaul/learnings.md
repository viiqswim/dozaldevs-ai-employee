# Task 16: Disk Space Pre-Check Helper — Learnings

## Implementation Summary

Created `src/workers/lib/disk-check.ts` with two exported functions:

### `checkDiskSpace(path: string, minBytes: number = 2GB): Promise<DiskCheckResult>`
- **Strategy**: Two-tier approach
  1. Try `fs.promises.statfs()` (Node ≥19) — calculates `bfree * bsize`
  2. Fall back to `df -k` command and parse 4th column (available KB) × 1024
- **No-throw contract**: All errors caught, returns `{ ok: false, freeBytes: 0, reason: "..." }`
- **Default threshold**: 2,147,483,648 bytes (2 GB)

### `checkDiskSpaceOrWarn(path: string, minBytes: number, logger: Logger): Promise<boolean>`
- Convenience wrapper that calls `checkDiskSpace()` and logs warning if insufficient
- Returns boolean for caller convenience

## Key Design Decisions

1. **Dynamic import of fs/promises**: Used `await import('node:fs/promises')` inside the function to allow graceful fallback if statfs is unavailable. This is necessary because statfs may not exist on all Node versions despite Node ≥20 requirement.

2. **df parsing**: Splits output by whitespace and extracts 4th column (Available KB). Multiplies by 1024 to get bytes.

3. **Error handling**: All errors caught at top level and returned as result objects. No exceptions thrown to caller.

## Test Coverage

Created 8 tests in `tests/workers/lib/disk-check.test.ts`:
1. Sufficient space via statfs (real system call)
2. Insufficient space via statfs (real system call with MAX_SAFE_INTEGER)
3. Falls back to df when statfs throws
4. Returns insufficient when df shows low space
5. Never throws on unexpected error
6. Uses default 2GB threshold
7. checkDiskSpaceOrWarn returns true and doesn't log when sufficient
8. checkDiskSpaceOrWarn returns false and logs when insufficient

## Patterns Followed

- All imports use `.js` extension (ESM)
- Follows sibling helper style from `cache-validator.ts` and `install-runner.ts`
- Uses `vi.mock('node:child_process')` for testing
- Result object pattern (no exceptions) consistent with codebase conventions
- Docstrings explain complex fallback logic and no-throw contract

# Wave 5 Implementation — Learnings

## Task 36-38: Inngest/Watchdog Timeouts
- `waitForEvent` timeout changed to `"8h30m"` (string format for Inngest)
- Watchdog machine cleanup uses `nineHoursAgo` variable name (not inlined)
- Stale heartbeat threshold is in ms: `20 * 60 * 1000`
- Lifecycle test failures are all DB-related (pre-existing when DB not running)

## Task 39: Redispatch Wave-Aware
- `TOTAL_BUDGET_MS = 8 * 60 * 60 * 1000` as module-level const
- Wave number read via `prisma.execution.findFirst` with `orderBy: { created_at: 'desc' }`
- Prisma field: `waveNumber` (maps to `wave_number` in DB)
- Passed as `resumeFromWave` in event data, lifecycle reads and passes as `RESUME_FROM_WAVE` env var
- Old tests used 7h ago — updated to 9h ago (to exceed 8h budget)

## Task 40: buildSuccessPrBody
- Added to `src/workers/lib/pr-manager.ts` (not github-client.ts)
- `SuccessPrBodyOpts` interface exported alongside function
- All 6 section headers present: Summary, Ticket, Changes, Waves Completed, Testing, How to Verify, Commit Log

## Task 41: CI Classifier
- `src/workers/lib/ci-classifier.ts` created
- IMPORTANT: Check infra patterns BEFORE substantive — 'docker build' would match `build` (substantive) before `docker` (infra) if order reversed
- Test file goes in `tests/workers/lib/` not `src/workers/lib/` (vitest only includes `tests/**/*.test.ts`)

## Task 42: Escalation Enrichment
- Added `engineering/task.escalated` event in lifecycle.ts escalation path
- Queries `prisma.execution.findFirst` for latest execution's `waveNumber`
- Queries `prisma.execution.findMany` for all executions with non-null `waveNumber` → `completed_waves`
- `total_waves: 0` (unknown without plan context)
- CRITICAL: Supabase write happens BEFORE Inngest event send (maintained ordering)

## F3 QA: Compressed Simulation Approach (2026-04-09)

- All 8 behavioral properties verified via source grep at exact line numbers
- 39/39 module tests pass (wave-executor:13, continuation-dispatcher:6, completion-detector:8, planning-orchestrator:7, cost-breaker:5)
- Stale heartbeat gap during wave transitions: max ~100s << 1200s (20min threshold) — safe margin
- Cost breaker guard `wave.number > 1` in orchestrate.mts:565 enforces between-waves-only contract
- Heartbeat uses `updateStage()` inside wave loop, `stop()` only at terminal paths — never kills mid-execution
- Watchdog timeline: `planning 30min` → `orchestrate 4h` → `waitForEvent 8h30m` < `watchdog kill 9h`
- `pnpm vitest run <specific-test-file>` is the reliable pattern (vs `pnpm test -- --run`)
