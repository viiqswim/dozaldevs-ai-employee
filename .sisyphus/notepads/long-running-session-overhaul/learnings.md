# Learnings — long-running-session-overhaul

## [2026-04-08] Session Start — Codebase Survey

### Directory Structure

- `src/workers/lib/` — existing lib modules (no config/ subdir yet)
- `src/workers/config/` — does NOT exist yet, must be created (Task 1)
- `src/lib/logger.ts` — 37 lines, pino-based, exports `createLogger(component)` + `taskLogger(component, taskId)` + `Logger` type
- `src/workers/lib/token-tracker.ts` — 47 lines, class-based `TokenTracker` with `addUsage/getAccumulated/reset` — NOTE: has `estimatedCostUsd` which we do NOT want in cost-tracker-v2 (token counts only)
- `src/workers/orchestrate.mts` — 370 lines, single-phase, imports 12 modules
- `src/workers/entrypoint.sh` — 202 lines, 7-step boot with flag files at /tmp/.boot-flags/

### Test Pattern

- Tests live in `tests/` dir mirroring `src/` (e.g., `tests/lib/logger.test.ts` for `src/lib/logger.ts`)
- EXCEPTION: worker lib tests are in `tests/workers/lib/`
- Vitest with `describe/it/expect` — no special mocking beyond vitest
- Imports use `.js` extension (ESM)
- Logger tests use pino directly with Writable stream to capture output

### Key Existing Files (Wave 1 relevant)

- `src/lib/logger.ts`: pino, `createLogger(component)`, `taskLogger(component, taskId)` — add 4 new helpers WITHOUT breaking existing API
- `src/lib/retry.ts`: Self-contained utility with type exports + defaults — follow this pattern for Task 1
- `src/workers/lib/project-config.ts`: Import pattern `from '../../lib/logger.js'` — use same in new worker modules

### Critical Constraints (from plan)

- Token counts ONLY in new cost tracker — no `estimatedCostUsd` in cost-tracker-v2
- Test files in `tests/workers/lib/` for `src/workers/lib/` modules
- `src/workers/config/` directory must be created for Task 1
- No `console.log` anywhere — always use pino logger
- Import paths must use `.js` extension (ESM)
- Plan grammar (Task 5 parser must detect): `^## Wave (\d+)` + `^- \[([ x])\] (\d+)\. (.+?)$`

### COORDINATION NOTE — Field naming

- Task 1 exports `costBreakerUsdCentsPerTask` in `LongRunningConfig` (internal name, but value is integer cents)
- Task 14 (cost-breaker.ts) must import this exact field name
- DO NOT name it `costBreakerTokenCap` — it's `costBreakerUsdCentsPerTask`
