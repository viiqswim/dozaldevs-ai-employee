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

## T4 Learnings

- lifecycle.ts has 3 dispatch paths: hybrid Fly (env object in JSON), local Docker (envArgs string array), native Fly (flyEnv Record object)
- Path 2 (Docker) uses string template literals `-e KEY="VALUE"` format — different from the other two
- PLAN_VERIFIER_MODEL added adjacent to OPENROUTER_MODEL in all 3 paths

## T3 Learnings

- buildCorrectionPrompt: SYNC (no async), returns complete replacement prompt
- TicketInfo used locally (same shape as Ticket from planning-orchestrator.ts)
- No projectMeta/repoRoot needed — simpler than buildPlanningPrompt

## T5 Learnings

- planContent changed from const to let to allow retry reassignment
- PlanJudgeExhaustedError added to planning-orchestrator.ts (alongside PlanValidationError)
- buildCorrectionPrompt imported directly (no interface extension needed — called by orchestrator, not via PromptBuilder interface)
- Gate condition: planJudge != null && config.planVerifierModel !== ''
- Retry creates a new session (createSession) with correction prompt
- After retry: re-reads file, re-validates with planParser
- planContent updated to corrected content after gate passes
- MOCK_CONFIG in tests updated with planVerifierModel: ''

## T6 Learnings

- plan-judge tests: use vi.spyOn(globalThis, 'fetch') for mocking native fetch
- planning-orchestrator judge tests: mock monitorSession with mockImplementationOnce to write plan file during async execution
- MOCK_CONFIG_WITH_JUDGE uses spread: { ...MOCK_CONFIG, planVerifierModel: 'anthropic/claude-haiku-4-5' }
- PlanJudgeExhaustedError imported and tested with .rejects.toThrow(PlanJudgeExhaustedError)
- After REJECT exhaustion: chmod 444 is NOT called — verify by checking file mode != 0o444
- 816 tests passing after T6 (806 baseline + 5 plan-judge + 5 planning-orchestrator judge integration)

## T7 Learnings — Correction Prompt Strengthening

- Root cause: MiniMax wrote only 214 bytes in correction session (stub response)
- Fix: Strengthened `buildCorrectionPrompt()` in `src/workers/lib/prompt-builder.ts`
- Key additions:
  1. DO NOT / DO section upfront — "Do not explore before writing", "Write immediately"
  2. Explicit size enforcement message: "The file MUST be at least 500 bytes. This is enforced programmatically"
  3. Full concrete example with `formatCurrency` ticket showing valid plan (~800+ bytes in output)
  4. Task descriptions include `— detailed description` suffix pattern to encourage verbose output
  5. "Write the plan file to `{planPath}` NOW" directive at the end
- Chose Option A (prompt strengthening) over Option B (session continuation) because:
  - Test at line 333 of planning-orchestrator.test.ts expects `createSession` called 2 times
  - Option B would require test modification
  - Prompt alone is the lightest-touch fix
- Test baseline maintained: 50 failed | 816 passed | 10 skipped (876) — no new failures
- Build: `pnpm build` exits 0 (tsc -p tsconfig.build.json clean)
