# Judge Gate — Learnings

## Project Conventions

- Working directory: /Users/victordozal/repos/dozal-devs/ai-employee
- Test command: `pnpm test -- --run`
- Build command: `pnpm build`
- Node ≥20 in worker (native fetch available)
- Logger: import from `src/lib/logger.ts` — use `logger.warn(...)`, `logger.info(...)`

## Architecture Notes

- Injection point: `src/workers/lib/planning-orchestrator.ts` after `validatePlan()`, before `chmod 0o444`
- `OPENROUTER_MODEL` flows through 3 dispatch paths in `src/inngest/lifecycle.ts` — `PLAN_VERIFIER_MODEL` follows same pattern
- Judge verdict is ephemeral — do NOT write to Prisma `reviews` table
- `buildCorrectionPrompt` must be SYNC (matches PromptBuilder interface)
- Use `mockReturnValue` not `mockResolvedValue` for sync functions in tests
- `createMock*` factory with `overrides` spread in planning-orchestrator.test.ts

## Critical Constraints

- PLAN_VERIFIER_MODEL='' means DISABLED (not fallback to OPENROUTER_MODEL)
- Max 2 retries before PlanJudgeExhaustedError
- API failure → PASS + warn: "plan-judge: API unavailable, defaulting to PASS"
- chmod 0o444 ONLY after judge PASS (or gate disabled)

## T2 Learnings
- planVerifierModel added to LongRunningConfig — default '' (empty = disabled)
- .env.example location for PLAN_VERIFIER_MODEL: added in the "Execution (Worker Container)" section, directly after OPENROUTER_MODEL
- readConfigFromEnv() uses process.env['PLAN_VERIFIER_MODEL'] ?? '' (no parseInt — string field)
- Build passes (tsc -p tsconfig.build.json exits 0) after adding the field to all 3 locations: interface, default const, readConfigFromEnv return

## T1 Learnings
- Ticket type: imported from './planning-orchestrator.js'
- Logger: named export `createLogger` (no default export) — use `const log = createLogger('plan-judge')`
- Node fetch: native (no node-fetch needed)
- Import path: use `.js` extension for all local imports (ESM project)
- Logger import path from workers/lib: `../../lib/logger.js`
- Error handling: catch-all wraps entire fetch + parse block → returns PASS with warn log
- Exact warn message must be: `'plan-judge: API unavailable, defaulting to PASS'`
- Empty model → return PASS_RESULT immediately, no logging, no network
- `pnpm build` (tsconfig.build.json) and `pnpm tsc --noEmit` both exit 0 for the new file
