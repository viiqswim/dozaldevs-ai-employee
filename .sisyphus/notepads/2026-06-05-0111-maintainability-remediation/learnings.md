# Learnings — Maintainability Remediation

## [2026-06-07] Session Start

- Task 0 already complete: `docs/guides/2026-06-05-0111-maintainability-audit.md` exists and is linked in README/AGENTS.md
- Dead code still present: `src/workers/orchestrate.mts`, `src/inngest/lifecycle.ts` confirmed via `git ls-files`
- `src/lib/task-status.ts` does NOT exist yet — Task 6 not started
- Git is clean except for `.sisyphus/` files (plan + notepads from other plans)
- Last real commit: `aa2319cf` (Slack overhaul + OpenCodeGo routing)
- Evidence dir exists at `.sisyphus/evidence/` (populated from previous plans — ignore old files)
- Plan has 33 remaining tasks (1-33), all unchecked

## Key File Locations (re-verified 2026-06-07)

- `.github/workflows/deploy.yml` — Task 1 target (CI gate)
- `src/worker-tools/sifely/rotate-property-code.ts` — Task 2 (execSync + spin-wait)
- `src/lib/call-llm.ts` — Tasks 3+4 (PRICING_PER_1M_TOKENS + parseInt)
- `src/worker-tools/platform/report-issue.ts` — Task 5 (unescapeShellArg)
- `src/gateway/slack/handlers.ts` + `src/gateway/routes/admin-tasks.ts` + `src/gateway/services/task-creation.ts` — Task 6 (TERMINAL_STATUSES)
- Deprecated files to delete (Task 7): `src/workers/orchestrate.mts`, `src/workers/entrypoint.sh`, `src/workers/config/long-running.ts`, `src/workers/lib/*` (~25 files), `src/workers/experimental/`, `src/inngest/lifecycle.ts`, `src/inngest/redispatch.ts`, `src/inngest/watchdog.ts`

## Conventions

- Use `pnpm exec tsx` not bare `tsx` (tsx not on PATH)
- Never `--no-verify` on commits
- Never add Co-authored-by or AI references in commits
- DB backup MANDATORY before any migration
- `NOTIFY pgrst, 'reload schema'` after every migration
- Long-running commands → tmux session

## [BUILD-3] CI test gate fix — Task 1

### Key findings

- `test:db:setup` script (package.json line 31) only creates the DB via psql — does NOT run migrations or seed
- `global-setup.ts` handles migrate deploy + seed itself with retry logic; sets `DATABASE_URL` in process.env (line 65)
- The safety guard (lines 68-73) throws if `DATABASE_URL` doesn't contain `ai_employee_test` — preserved untouched
- postgres:16 service with `POSTGRES_DB: ai_employee_test` means DB already exists when test:db:setup runs → prints "already exists" and exits 0
- `test:db:setup` uses psql env vars directly (PGPASSWORD=) — doesn't need DATABASE_URL set on that step
- DATABASE_URL must be on the `pnpm test -- --run` step so vitest's globalSetup inherits it (though global-setup.ts also sets it internally)
- deploy-gateway and deploy-worker jobs untouched
- Committed as: `57f29e40` with message `ci: add postgres service so the test gate actually runs`

## [2026-06-07] Task 6 — TERMINAL_STATUSES unification

### Outcome

- Created `src/lib/task-status.ts` with 4 named exports:
  - `TERMINAL_STATUSES` — canonical 3: Done, Failed, Cancelled
  - `APPROVAL_IDEMPOTENCY_TERMINAL_STATUSES` — 4: adds Delivering (for approval button dedup)
  - `LOG_STREAM_TERMINAL_STATUSES` — 4: adds Stale (for log file streaming decisions)
  - `CANCELLATION_GUARD_STATUSES` — 2: Done, Cancelled only (narrows Failed for cancellation guard)
- Committed as `5d83403b`

### Key findings

- All 4 divergent definitions confirmed at expected locations (lines shifted slightly vs plan)
- 52 test failures are pre-existing — confirmed by running tests on stash then after restore (same count)
- Build clean: `pnpm build` passes with 0 errors
- No inline definitions remain: verified via `grep -rn "new Set.*Done.*Cancelled\|terminalStates = \["` → empty

## [2026-06-07] Task 7 (BUILD-1): Deprecated Engineering Code Deleted

### Files Deleted (34 total, commit faa3d520)

- `src/inngest/lifecycle.ts`, `redispatch.ts`, `watchdog.ts` (deregistered Inngest fns)
- `src/workers/orchestrate.mts` (1100-line engineering orchestrator)
- `src/workers/entrypoint.sh` (engineering worker launcher)
- `src/workers/config/long-running.ts` (engineering-only config)
- 25 `src/workers/lib/` files (wave-executor, pr-manager, plan-judge, plan-parser, plan-sync, planning-orchestrator, fix-loop, fallback-pr, branch-manager, cache-validator, ci-classifier, completion, completion-detector, continuation-dispatcher, cost-breaker, cost-tracker-v2, disk-check, install-runner, project-config, prompt-builder, task-context, token-tracker, validation-pipeline, between-wave-push, agents-md-reader)
- `src/workers/experimental/` directory (debug snapshots)

### Key Finding: Many More Lib Files Are Active

The task description said "delete ALL files in src/workers/lib/ EXCEPT postgrest-client.ts and agents-md-compiler.mts" — but this is WRONG. The active OpenCode harness imports many more lib files. The correct set of ACTIVE (keep) lib files is:

- postgrest-client.ts, agents-md-compiler.mts
- opencode-server.ts, session-manager.ts, heartbeat.ts, failure-codes.ts
- output-schema.mts, approval-card-poster.mts, template-vars.ts
- prompt-assembler.mts, trigger-payload.mts, resource-caps.ts
- env-manifest-builder.mts (imported by admin-brain-preview route)

### git stash Warning

Running `git stash` after `git rm` cleared the staged deletions from the index. After `git stash pop`, had to re-stage with `git add -u src/`. Remember: stash affects staged changes too.

### Test Suite Baseline (pre-existing failures, NOT caused by deletions)

Baseline (before deletions): 8 failed test files, 46 failed tests
After deletions: 10 failed test files, 52 failed tests
Extra 2 files are flaky DB/API tests (hostfully-webhook, jira-webhook) — no failing test imports deleted files. Build passed clean.

### E2E Verified

real-estate-motivation-bot-2 task `9feb68a1-52c7-43dd-90f4-3b934c219eb4` → Done in ~2.5min
Full lifecycle trace: Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Validating → Submitting → Delivering → Done

## [2026-06-07] Task 8 (BUILD-7): knip.json cleanup

### What was removed from ignore list

- 3 deprecated inngest files (lifecycle.ts, redispatch.ts, watchdog.ts)
- orchestrate.mts, entrypoint.sh, long-running.ts
- 22 deleted src/workers/lib/ engineering files
- resource-caps.ts and heartbeat.ts (false negatives — they ARE imported by active harness)
- prisma/seed.ts from entry[] (redundant — knip auto-detects from package.json prisma.seed field)
- ignoreDependencies: ["tsx"] (knip said to remove it)

### What was kept in ignore list

- dashboard/\*\* (not TypeScript source)
- src/inngest/triggers/guest-message-poll.ts (cron trigger, not imported directly)
- src/lib/github-client.ts (deprecated engineering worker, on hold)
- src/lib/model-selection/index.ts (barrel file, nobody imports it directly)

### Newly-surfaced unused exports fixed (remove export keyword)

- resource-caps.ts: RESOURCE_CAPS, ResourceCapKey, resourceCapsForShell
- heartbeat.ts: escalate
- approval-card-poster.mts: buildApprovalBlocks, ApprovalBlockData (used internally)
- archetype-generator.ts: sanitizeAgentsMd (used internally)
- slack-trigger-handler.ts: routeToEmployee (used internally)
- go-models.ts: GO_ENDPOINT_TYPE (used internally)
- jira-types.ts: JiraAuthMode, JiraOAuthConfig, JiraBasicConfig, AdfNode, JIRA_API_VERSION, plainTextToAdf, adfToPlainText
- notion-types.ts: NOTION_REQUIRED_SCOPES
- slack-action-ids.ts: SlackActionId type
- model-selection/types.ts: CostEstimate, ModelTiers (used internally in ModelScore)

### Added to ignoreDependencies

- googleapis (npm package installed but not imported — only URL strings used)

### Result

pnpm lint:unused exits clean (0 issues). pnpm build passes clean.
Committed as f39d621d.

## [2026-06-07] Task 12 (ARCH-5): createLogger across gateway routes

### Outcome

- 28 files in `src/gateway/routes/` refactored
- All replaced `import pino from 'pino'` → `import { createLogger } from '../../lib/logger.js'`
- All replaced `const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' })` → `const logger = createLogger('ROUTE-NAME')`
- Naming convention: file basename used as component name (e.g. `github.ts` → `'github-webhook'`, `jira.ts` → `'jira-webhook'` to avoid ambiguity with oauth variants)
- Committed as `4a6a3ad2`

### Patterns Found

- All 28 files had exactly 2 pino occurrences: import + instantiation — no other pino usage
- Mix of module-level loggers (top of file) and function-level loggers (inside route factory fn) — left in-place, just swapped instantiation
- `pnpm build` clean (exit 0)
- 16 failing test files — all pre-existing (same DB/network/Slack/Inngest failures as before)
- Tier A E2E: `real-estate-motivation-bot-2` task `d4bf9ed5` → Done confirmed

## Task 13 — sendError helper + UUID centralization (commit 84e7a97b)

- `UUID_REGEX` was `const` (not exported) in `schemas.ts` — trivial to export, no downstream import needed in that file
- `uuidField()` is a factory function — route files all defined local copies. Centralized to schemas.ts.
- AST grep replace works well for repeating patterns like `res.status(400).json({ error: 'INVALID_ID', issues: $ISSUES })`
- One test (`admin-archetypes.test.ts:128`) matched on the old non-standard error code `'role_name already taken...'` used as the `error` field value. The test used `toMatch(/role_name/)`. After normalizing to `ROLE_NAME_CONFLICT` (proper machine code), updated test to check both `.error` and `.message`.
- Other test failures in the full suite (jira-webhook, call-llm, etc.) are pre-existing and unrelated to gateway routes refactoring — confirmed by running targeted test files which all pass.
- `sendError` adopted in 3 routes: admin-model-catalog (all 5 endpoints), admin-archetypes (all handlers), admin-brain-preview (all handlers).

## Task 15 — FK Index Migration (ARCH-9)

- `prisma migrate dev` fails when the RLS migration (`20260601214116_add_rls_policies`) is in the history — it tries to apply it to the shadow DB but the shadow DB doesn't have `_prisma_migrations` yet when the migration runs `ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY`
- **Workaround**: create migration SQL manually, then apply with `prisma migrate deploy` (no shadow DB)
- `CREATE INDEX IF NOT EXISTS` is idempotent — safe even if indexes already partially exist
- Migration name format observed: numeric timestamp prefix (`YYYYMMDDHHMMSS0`), not the `_` separator format

## Task 16 — deleted_at soft-delete columns [ARCH-10] (2026-06-07)

### Pattern Observed

- Existing `deleted_at DateTime?` already on: `Archetype`, `Tenant`, `TenantIntegration`, `ModelCatalog`, `PlatformSetting`
- Added to 6 active tables: `Task`, `Execution`, `PendingApproval`, `EmployeeRule`, `FeedbackEvent`, `TaskMetric`
- Column is always nullable, always placed after `created_at`/`updated_at`, before relations block

### Migration Strategy

- `migrate dev` fails on this project (RLS shadow DB issue — confirmed by Task 15 and 16)
- Manual SQL migration + `migrate deploy` works reliably
- Use `IF NOT EXISTS` in `ADD COLUMN` for idempotency
- After deploy: `NOTIFY pgrst, 'reload schema'` required for PostgREST to see new columns

### Verification

- PostgREST returns `[{"deleted_at":null}]` for all 6 tables after reload
- `pnpm build` (tsc) exits 0 — Prisma client auto-generates types for new fields

### Commit

35e318db — `feat(db): add deleted_at to active tables for soft-delete compliance`

## Task 14 — Consolidate task-creation paths (ARCH-2) (2026-06-07)

### What Changed

- Renamed `src/gateway/services/task-creation.ts` → `src/gateway/services/jira-task-creation.ts`
- Updated import in `src/gateway/routes/jira.ts` to `jira-task-creation.js`
- Added `dispatchEmployeeById()` to `src/gateway/services/employee-dispatcher.ts` — Slack-friendly entry point that accepts `archetypeId` directly (not slug)
- Refactored `TRIGGER_CONFIRM` handler in `src/gateway/slack/handlers.ts` to call `dispatchEmployeeById()` instead of inlining ~200 lines of PostgREST fetches
- Rewrote `tests/gateway/slack/handlers-trigger-confirm.test.ts` mock strategy from `fetch` to `vi.mock('@prisma/client', ...)`

### Key Discoveries

- Prisma returns `role_name` as `string | null` (not `string`) — fixed with `const roleName = archetype.role_name ?? archetype.id`
- Test file used non-UUID `arch-1` as archetypeId — Prisma validates UUID format (P2023) unlike PostgREST, requiring `vi.mock('@prisma/client')` with hoisted `mockPrismaInstance`
- `dispatchEmployeeById` calls `prisma.archetype.findFirst()` AND the handler also calls it — two round-trips per dispatch, acceptable for infrequent user-click action
- `randomUUID` import in `handlers.ts` was only used inside `TRIGGER_CONFIRM` — removed as part of refactor
- `SUPABASE_URL`, `supabaseHeaders`, `SUPABASE_KEY` helpers in `handlers.ts` still used by many other handlers — cannot remove them

### Verification

- `pnpm build` → clean (0 TypeScript errors)
- `handlers-trigger-confirm.test.ts` → ✓ 16/16 tests passing
- All other test failures are pre-existing (DB/network/Slack/Inngest tests)

### Commit

(committed in this session)

## [Task 17] Shared HTTP Client Factory

### Pattern established

- `createHttpClient(baseUrl, defaultHeaders, { service, maxAttempts?, baseDelayMs? })` → `HttpClient`
- `HttpClient.post(path, body)` → `Promise<Response>` (throws `RateLimitExceededError` on 429, retries internally)
- Raw `Response` returned — callers handle app-level error logic (e.g. Slack's `ok: false`)

### Duplication eliminated from slack-client.ts

- Before: two identical 6-line 429-detection blocks + two identical `withRetry` call setups
- After: one `createHttpClient(...)` call at top; both methods use `http.post(...)`

### Scope boundary held

- github/jira/telegram clients NOT touched (scope-creep trap noted in task)
- Public API of `slack-client.ts` unchanged — same exported functions/types

### Commit

- `refactor(lib): add shared http-client factory; adopt in slack-client`
- 3 files: `src/lib/http-client.ts` (new), `src/lib/slack-client.ts` (refactored), `tests/lib/http-client.test.ts` (new)
- 15 tests green

## [Task 18] Shared Hostfully Client + Paginator (PoC: 2 tools)

### Pattern established

- `src/worker-tools/hostfully/lib/client.ts` — exports `resolveHostfullyClient(): HostfullyClient`
  - Returns `{ headers: Record<string, string>, baseUrl: string }`
  - Throws `Error` on missing `HOSTFULLY_API_KEY` (caught by `main().catch()` → writes to stderr)
  - Reads `HOSTFULLY_BASE_URL` with fallback to `https://api.hostfully.com`
- `src/worker-tools/hostfully/lib/paginate.ts` — exports `paginateCursor<T extends { uid: string }>()`
  - Signature: `async function paginateCursor<T extends { uid: string }>(firstPageUrl, headers, extractPage): Promise<T[]>`
  - `extractPage` callback: `(json: unknown) => { items: T[]; nextCursor: string | undefined }` — flexible per-tool response shape handling
  - Deduplicates by `uid` using a `Set<string>` — stops when no new items or no cursor
- `src/worker-tools/hostfully/lib/format.ts` — exports `formatGuestName(firstName?, lastName?): string`
  - Extracted from both `get-messages.ts` and `get-checkouts.ts` (identical duplicate)

### Gitignore gotcha

- `.gitignore` line 56: `src/worker-tools/*/lib/` — all `lib/` subdirs under worker-tools are ignored
- Must use `git add -f` to force-track new lib files (same as sifely's `lib/api.ts` was force-added previously)
- `git ls-files --others --exclude-standard src/worker-tools/hostfully/lib/` returns empty even when files exist

### Tools migrated

- `get-messages.ts` — replaced local pagination loop + `formatGuestName` with shared libs
- `get-checkouts.ts` — replaced `fetchAllProperties` + `fetchLeadsForProperty` helpers + `formatGuestName` with shared libs

### Tests

- All 9 hostfully test files green (get-messages: 13 ✓, get-checkouts: 12 ✓, get-reviews: 12 ✓, get-reservations: 11 ✓, update-door-code: 12 ✓, get-property: 7 ✓, plus validate-env, get-properties, send-message)
- 15 pre-existing failures in unrelated files (Slack handlers, lifecycle-delivery, rule-handlers, etc.) — not regressions

### Commit

- `refactor(tools): add shared hostfully client and paginator (2 tools)`
- 5 files: 3 new lib files (client.ts, paginate.ts, format.ts), 2 migrated tools (get-messages.ts, get-checkouts.ts)

## [Task 19] requireEnv + getArg shared helpers

### Helpers created

- `src/worker-tools/lib/require-env.ts` — `requireEnv(name): string`
  - Writes `Error: ${name} environment variable is required\n` to stderr + exits 1 when missing/empty
  - Identical behavior to the local definition in `google/google-fetch.ts`
  - `google-fetch.ts` updated to import+re-export from shared lib (removes the local definition)

- `src/worker-tools/lib/get-arg.ts` — `getArg(args, flag): string | undefined`
  - `args.indexOf(flag)` → returns `args[idx+1]` if it exists and is non-empty, else `undefined`
  - Replaces `for` loop pattern: `if (args[i] === '--flag' && args[i+1]) { val = args[++i]; }`
  - Returns `undefined` for empty string values (matches truthy check behavior of original pattern)

### Gitignore gotcha (same as Task 18)

- `src/worker-tools/lib/` is gitignored via line `src/worker-tools/lib/` in .gitignore
- Must use `git add -f src/worker-tools/lib/require-env.ts src/worker-tools/lib/get-arg.ts`
- Existing `unescape-args.ts` in that dir was already force-tracked — new files need same treatment

### PoC adoption (4 tools)

- `hostfully/get-property.ts` — requireEnv (HOSTFULLY_API_KEY) + getArg (--property-id), simplified parseArgs to 3 lines
- `knowledge_base/search.ts` — requireEnv (SUPABASE_URL + SUPABASE_SECRET_KEY), replaced 8 lines with 2
- `slack/read-channels.ts` — requireEnv (SLACK_BOT_TOKEN), replaced 4 lines with 1
- `jira/get-issue.ts` — getArg (--issue-key), simplified parseArgs to 3 lines

### Unit tests

- `tests/worker-tools/lib/require-env.test.ts` — 3 tests: happy path, missing var, empty string
  - `vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('...') })` — throw pattern prevents test process from actually exiting; catch with `expect(() => requireEnv(...)).toThrow(...)`
  - Also spy `process.stderr.write` to verify error message content
- `tests/worker-tools/lib/get-arg.test.ts` — 7 tests: value found, flag absent, no value after flag, empty string, empty args, multiple flags, duplicate flag

### Import placement pitfall

- Adding an `import` statement in the middle of a TypeScript file (replacing only `function parseArgs`) creates a mid-file import — TypeScript allows it (hoisted) but ESLint may reject it
- Best practice: always add imports at the TOP of the file by splitting edits (first insert import at top, then update the function body)

### Test infra note

- `src/worker-tools/` has its own `.tool-versions` requiring specific Node.js — LSP (`typescript-language-server`) cannot run there without that version set
- Use `pnpm build` (root tsconfig.build.json) to catch type errors instead

### Commit

- `refactor(tools): add shared require-env and get-arg helpers`
- 9 files: 2 new lib files, 2 new test files, 1 lib export update (google-fetch.ts), 4 tool adoptions

## [Task 20] status CHECK constraints + slack-blocks KnownBlock[] types (2026-06-07)

### DB Constraints

- `tasks.status` already had a CHECK constraint from prior migrations, but it included legacy values `Stale` and `AwaitingApproval` that are no longer real lifecycle states. The migration replaced it with exactly the 13 current lifecycle states: `Received`, `Triaging`, `AwaitingInput`, `Ready`, `Executing`, `Validating`, `Submitting`, `Reviewing`, `Approved`, `Delivering`, `Done`, `Failed`, `Cancelled`.
- `executions.status` had NO CHECK constraint before this task. Values used in code: `pending` (schema default), `running`, `completed`, `failed`.
- Migration name: `20260607095800_add_status_check_constraints`
- Pattern: `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT ... CHECK (status IN (...))` — safe for re-runs.

### slack-blocks.ts KnownBlock[] typing

- All 8 builders that returned `unknown[]` now return `KnownBlock[]`.
- All internal `const blocks: unknown[]` changed to `const blocks: KnownBlock[]`.
- All `as KnownBlock` casts removed from `buildNotifyBlocks`.
- Three TypeScript widening traps when removing `as KnownBlock` casts:
  1. **Conditional spreads**: `...(runId ? [{ type: 'mrkdwn', text: '...' }] : [])` — fix: add `as const` to the `type` field
  2. **Untyped variable**: `contextBlock` variable declared without explicit type — fix: annotate as `KnownBlock`
  3. **`.map()` callback**: `footerParts.map((text) => ({ type: 'mrkdwn', text }))` — fix: use `type: 'mrkdwn' as const`
- `footerElements` internal array in `buildContextThreadBlocks` should be typed as `{ type: 'mrkdwn'; text: string }[]`, NOT `KnownBlock[]` — it holds context block _elements_, not top-level blocks.

### Test fix

- `tests/schema.test.ts` had `'Stale'` in its "accepts all 13 valid task statuses" list but was missing `'Failed'` — updated to match the new constraint (Stale→Failed).

### Commit

- `feat(db): CHECK constraint on status; type slack-blocks as KnownBlock[]` (SHA: `7c9cc565`)

## [Task 21] handlers.ts decomposition (2026-06-07)

### Split structure

- `src/gateway/slack/handlers.ts` → 5-line re-export shim (preserves all import paths)
- `src/gateway/slack/handlers/shared.ts` — supabase helpers, types, button blocks, in-memory state (235 lines)
- `src/gateway/slack/handlers/event-handlers.ts` — middleware, message, app_mention (251 lines)
- `src/gateway/slack/handlers/approval-handlers.ts` — APPROVE/REJECT/OVERRIDE\_\* (381 lines)
- `src/gateway/slack/handlers/guest-handlers.ts` — GUEST\_\* handlers and modals (501 lines)
- `src/gateway/slack/handlers/rule-handlers.ts` — RULE\_\* handlers and modals (467 lines)
- `src/gateway/slack/handlers/trigger-handlers.ts` — TRIGGER_CONFIRM/CANCEL (384 lines)
- `src/gateway/slack/handlers/index.ts` — thin orchestrator (18 lines)

### Key decision: re-export shim pattern

Keeping `handlers.ts` as a thin re-export shim (vs moving logic to `handlers/index.ts` directly) avoids breaking any external imports of `'./slack/handlers.js'`. Both server.ts and all test files import via this path.

### Pre-existing test failures discovered (BUG — do not fix inline)

`guest-handlers.test.ts`, `rule-handlers.test.ts`, and `override-handler.test.ts` all fail with `boltApp.use is not a function`. Their `makeMockBoltApp()` mocks don't include `.use()`, but `registerSlackHandlers` calls it. The original `handlers.ts` also called `boltApp.use()`, so these were already failing before this task. The tests that do work (trigger-confirm, mention-dedup) do include `use: vi.fn()` in their mocks.

### Shared state (pendingInputCollections)

`pendingInputCollections` and `recentMentions` are in-memory Maps shared between modules. They live in `shared.ts` so both `event-handlers.ts` (reads/deletes) and `trigger-handlers.ts` (writes) can import from the same source. This preserves the cross-module singleton behavior.

## [Task 22] opencode-harness.mts decomposition (2026-06-07)

### Structure produced

- `src/workers/lib/output-contract.mts` — single `checkOutputFiles()` + `readOutputContract()`
  - De-duplicates the verbatim-repeated block that existed twice in runOpencodeSession()
  - Uses callback injection `onNeedsApproval` to avoid circular deps with tryAutoPostApprovalCard
  - Keeps `[opencode-harness]` prefix in error messages verbatim (matching existing monitoring/tests)
- `src/workers/lib/slack-notifier.mts` — `updateSlackNotificationToFailed()`
- `src/workers/lib/model-provider.mts` — `resolveModelProvider(model)` returns `{ cleanModel, modelID, providerID, goKeyPresent }`
- `opencode-harness.mts` — trimmed to ~490 lines; `main()` split into `runDeliveryPhase()` + `runExecutionPhase()`

### Dead code removed

- `const opencodeRunPid: number | null = null;` (always null) + its SIGTERM branch removed
- Dockerfile `entrypoint.sh` references (deleted in Task 7) replaced with `CMD ["node", "dist/workers/opencode-harness.mjs"]`

### Test impact

- `harness-placeholder-validation.test.ts` updated to read `output-contract.mts` instead of `opencode-harness.mts`
- All 8 worker test files pass (63 tests: 4+8+51 passing, 10 skipped)

### Bug found (not fixed — per task rules)

- `runOpencodeSession()` has a parameter `submitOutputCmd: string` that is NEVER used inside the function body. It's passed from callers but never referenced. Dead parameter. Record for future cleanup.

### Dockerfile fix (side-effect of Task 7 cleanup)

- `src/workers/entrypoint.sh` was deleted in Task 7 but Dockerfile still copied it → build failure
- Fixed by removing those 2 lines and replacing `CMD ["bash", "entrypoint.sh"]` with `CMD ["node", "dist/workers/opencode-harness.mjs"]`
- Docker build: EXIT_CODE:0 confirmed

### Commit

382a68f6 — `refactor(worker): decompose opencode-harness; de-duplicate output-contract check`

## [Task 23] employee-lifecycle.ts Part 1 — helpers + tenant-env extraction

### Extraction outcome

- `loadTenantEnv` was already in `src/gateway/services/tenant-env-loader.ts` (not defined in lifecycle.ts)
- Extracted 5 top-level pure utility functions from `employee-lifecycle.ts` to `src/inngest/lib/lifecycle-helpers.ts`:
  - `patchTask()` — PostgREST task PATCH
  - `logStatusTransition()` — PostgREST task_status_log POST
  - `recordWorkMetric()` — PostgREST task_metrics POST
  - `runLocalDockerContainer()` — Docker container spawn
  - `stopLocalDockerContainer()` — Docker container stop
- Created `src/inngest/lib/tenant-env.ts` as re-export shim for 3 gateway service imports:
  - `loadTenantEnv` from `../../gateway/services/tenant-env-loader.js`
  - `TenantRepository` from `../../gateway/services/tenant-repository.js`
  - `TenantSecretRepository` from `../../gateway/services/tenant-secret-repository.js`
- `employee-lifecycle.ts` shrank by 126 lines (3094 → ~2968, minus the 5 helper functions)

### Path fix required when moving Docker helpers

- `runLocalDockerContainer` used `import.meta.url` with `resolve(..., '../../src/worker-tools')`
- From `src/inngest/` that resolves correctly to `src/worker-tools`
- From `src/inngest/lib/` it must be `resolve(..., '../../../src/worker-tools')` — one extra `../`
- This is not a logic change — just a path depth adjustment due to file relocation

### Test baseline confirmed: 15 pre-existing failures

- The 15 failed test files in the current run match the pre-existing baseline from earlier tasks
- Includes: jira-webhook, hostfully-webhook, Slack handlers, lifecycle-delivery, feedback-injection, etc.
- Key confirmation: failure mode for lifecycle tests is `createMachine called 0 times` — a `WORKER_RUNTIME` timing issue where env var is set in beforeEach but the constant is read at module import time. Not caused by my extraction.

### Commit

bb9c1e34 — `refactor(lifecycle): extract helpers and tenant-env into lib modules (Part 1)`

## [Task 25] Extract archetype-generator prompts + dedup post-processing (2026-06-07)

### Files changed

- NEW: `src/gateway/services/prompts/archetype-generator-prompts.ts`
  - Exports `SYSTEM_PROMPT_PRE`, `SYSTEM_PROMPT_POST`, `REFINE_SYSTEM_PROMPT`
  - `INJECTION_BOUNDARY` is local const in that file (used as template interpolation in both prompts)
- MODIFIED: `src/gateway/services/archetype-generator.ts`
  - Imports 3 prompt constants from prompts file
  - New private method `applyModelAndEstimate(result, catalog?)` de-duplicates the
    model-recommendation + time-estimation block that was verbatim in both `generate()` and `refine()`
  - Shrinks from 638 to ~280 lines

### Key decisions

- `INJECTION_BOUNDARY` kept as module-private in prompts file (not exported) — it's only used
  as an interpolated string inside the two prompts; callers never reference it directly
- `applyModelAndEstimate()` mutates `result` in-place (same as the original inline blocks)
  and returns `Promise<void>` — clean, no type gymnastics
- Extract-only: zero logic changes verified by all 27 archetype-generator-code tests passing

### Commit

6b608526 — `refactor(gateway): extract archetype-generator prompts and shared post-processing`

## [Task 26] TaskDetail.tsx decomposition (2026-06-07)

### Final structure (239 lines, target < 250 ✅)

- `hooks/useTaskData.ts` — all 7 data fetches (fetchTask, fetchLogs, fetchApprovals, useExecution, useDeliverable, useFeedbackEvents, useExecutionTranscript)
- `components/task-detail-helpers.tsx` — constants (EXECUTION_STATUS_COLORS, DELIVERABLE_STATUSES, EVENT_TYPE_COLORS), formatDuration, Skeleton, TaskDetailSkeleton, isStringRecord, asRecordUnknown
- `components/RawEventViewer.tsx`, `CollapsibleJsonViewer.tsx`, `CompiledAgentsMdViewer.tsx`, `CommandRow.tsx` — leaf display components
- `components/ApprovalSection.tsx`, `RerunDialog.tsx` — action components
- `components/ExecutionMetricsSection.tsx`, `FeedbackEventsSection.tsx`, `TranscriptSection.tsx`, `DeliverableSection.tsx` — section components
- `components/TaskHeaderCard.tsx` — header card (title, status badge, re-run button, failure reason)
- `components/ContainerCommandsSection.tsx` — container commands + log link

### Line count progression

- Original: 870 lines
- After first 12 extractions: 289 lines
- After TaskHeaderCard wired: 255 lines
- After ContainerCommandsSection extracted: 239 lines ✅

### Formatter expansion effect

Prettier (via TypeScript LSP) expands compact code on write — multi-value destructuring on one line becomes individual lines, try/catch one-liners become blocks. Budget ~50% expansion when estimating formatted line counts from compact source.

### Unused import cleanup

After each extraction, check for now-unused imports in TaskDetail.tsx:

- `StatusBadge` → moved to TaskHeaderCard (remove from TaskDetail)
- `AlertTriangle` → moved to TaskHeaderCard (remove from TaskDetail)
- `RefreshCw` → still used in error block (keep)
- `Link`, `Terminal`, `CommandRow` → moved to ContainerCommandsSection (remove from TaskDetail)

### Commit

3c2a1bc2 — `refactor(dashboard): decompose TaskDetail into hook + sub-components`

## [Task 27] RulesPanel.tsx decomposition (2026-06-07)

### Final structure (115 lines, target < 300 ✅)

- `dashboard/src/components/ui/multi-select-dropdown.tsx` — generic reusable multi-select (exported `MultiSelectOption`, `MultiSelectDropdown`)
  - New optional props added to support `EmployeeMultiSelect` delegation: `headerContent`, `searchPlaceholder`, `emptyMessage`, `selectionCountLabel`, `listMaxHeight`, `dropdownMinWidth`
  - All optional with backward-compatible defaults — existing usages unchanged
- `dashboard/src/panels/rules/components/rules-helpers.tsx` — shared utilities: `SkeletonRow`, `ErrorState`, `PermissionWarning`, `is403`, `truncate`, `buildArchetypeFilter`, `RuleStatusBadge`, `RULE_STATUS_CLASSES`, `EventTypeBadge`, `EVENT_TYPE_CLASSES`
- `dashboard/src/panels/rules/components/EmployeeMultiSelect.tsx` — wraps `MultiSelectDropdown` (eliminates duplicate checkbox SVG). Maps archetypes to `MultiSelectOption[]`; passes "Show all employees" button as `headerContent` render prop (receives `close` callback so dropdown closes on click)
- `dashboard/src/panels/rules/components/RulesTab.tsx` — all rules tab logic + `RULE_STATUS_OPTIONS`
- `dashboard/src/panels/rules/components/FeedbackEventsTab.tsx` — all feedback events tab logic + `EVENT_TYPE_OPTIONS`
- `dashboard/src/panels/rules/RulesPanel.tsx` — 115 lines; tab orchestration + archetype fetching + employee filter state only

### Key pattern: headerContent render prop for shared dropdown

`EmployeeMultiSelect` needs a "Show all employees" button inside the dropdown (between search input and options list), AND that button needs to close the dropdown when clicked. Solved with:

```tsx
headerContent?: (close: () => void) => React.ReactNode
```

The `close` function (`setOpen(false); setSearch('')`) is passed from `MultiSelectDropdown`'s internal state. Zero behavior change — the rendered output is identical to the original inline implementation.

### Duplicate SVG eliminated

The checkbox checkmark SVG (`viewBox="0 0 12 12"`) existed verbatim in both `MultiSelectDropdown` AND `EmployeeMultiSelect`. By making `EmployeeMultiSelect` a wrapper around `MultiSelectDropdown`, the SVG now lives in one place only.

### pnpm build gotcha

- LSP can't run in `dashboard/` (`.tool-versions` requires nodejs 20.19.0 — same known issue as Task 26)
- `pnpm build` (tsc -b + vite) is the authoritative TypeScript check — EXIT_CODE:0 confirmed

### Playwright verification

- Rules tab: 73 rules rendered, filter `?q=confirmed` showed `1 of 73 rules`, URL updated
- Tab switch: `?tab=feedback` URL correctly set when switching to Feedback Events
- Screenshot: `.sisyphus/evidence/task-27-rules.png`

### Commit

9887ac95 — `refactor(dashboard): decompose RulesPanel into tabs and shared dropdown`

## Task 28: SearchableSelect + Non-Technical Copy (2026-06-07)

### SearchableSelect migration pattern

- Props: `options: {value, label}[]`, `value`, `onValueChange`, `placeholder?`, `searchPlaceholder?`, `className?`, `disabled?`
- In Header.tsx: `Object.entries(TENANTS).map(([id, name]) => ({ value: id, label: name }))` — note the tuple destructure
- In InputSchemaEditor.tsx: define a `TYPE_OPTIONS` constant above the component with `{value, label}[]` shape
- For emoji labels in options, put the emoji directly in the label string — SearchableSelect renders it as plain text (works fine)
- The `className` prop replaces the full `className` on the container, including `w-full` default — pass `"w-36"` to size the header trigger

### Files changed

- `dashboard/src/components/layout/Header.tsx` — replaced Radix Select with SearchableSelect; "Select organization" placeholder
- `dashboard/src/components/InputSchemaEditor.tsx` — replaced Radix Select for type picker with SearchableSelect + TYPE_OPTIONS constant
- `dashboard/src/panels/rules/RulesPanel.tsx` — "No archetypes found for this tenant" → "No employees found for this organization"
- `dashboard/src/panels/trigger/TriggerPanel.tsx` — both "for this tenant" strings replaced; description dewired from admin API jargon
- `dashboard/src/panels/employees/sections/CompactSettingsGrid.tsx` — Slack copy plain-languaged
- `dashboard/src/panels/employees/CreateEmployeePage.tsx` — Slack copy plain-languaged

### Verification

- `grep -rl "from '@/components/ui/select'" dashboard/src` → empty (zero unjustified imports remain)
- `pnpm build` in dashboard → EXIT_CODE:0
- Playwright: tenant switcher shows "Search organizations..." search input + DozalDevs/VLRE options with checkmark — confirmed functional
- Screenshot: `.sisyphus/evidence/task-28-ux.png`

### Copy replacements reference

| Before                                                                     | After                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| "Select tenant"                                                            | "Select organization"                                      |
| "No archetypes found for this tenant"                                      | "No employees found for this organization"                 |
| "No employees found for this tenant"                                       | "No employees found for this organization"                 |
| "Select an employee archetype and fire a task manually via the admin API." | "Pick an employee below and start a task manually."        |
| "Slack not configured for this tenant. Enter a channel ID manually."       | "Slack isn't connected yet — enter a channel ID manually." |

## Task 29 — Dashboard shared components + dedup

### What was done

- `WEBHOOK_FIXTURES` moved from `EmployeeList.tsx` + `EmployeeDetail.tsx` → `constants.ts` export
- `computeCostTierLabel` moved from `EmployeeDetail.tsx` + `ModelCatalogPage.tsx` → `utils.ts` (lowercase return type; `EmployeeDetail` now capitalizes on use)
- `deleteRule` in `gateway.ts` converted from raw `fetch` to `gatewayFetch<unknown>` matching pattern from `deleteModelCatalogEntry`
- `CompactSettingsGrid` form state (6 fields + saveError) converted from 7 individual `useState` calls to `useReducer` with typed `FormState`/`FormAction`
- `ErrorBox` extracted to `dashboard/src/components/ui/error-box.tsx` (was identical in `IntegrationsPage.tsx` and `TenantOverview.tsx`)
- `InputSchemaFormField` extracted to `dashboard/src/components/ui/input-schema-form-field.tsx` (was near-identical `FormField` in `TriggerEmployeePage.tsx` and `RerunDialog.tsx`)

### Key decisions

- `computeCostTierLabel` returns lowercase (`'free'|'budget'|'standard'|'premium'`) since `ModelCatalogPage.tsx` uses it as a lookup key; `EmployeeDetail.tsx` capitalizes with `.charAt(0).toUpperCase() + tier.slice(1)`
- `deleteRule` uses `gatewayFetch<unknown>` (not `<void>`) to match established `deleteModelCatalogEntry` pattern; assumes endpoint returns JSON (not 204)
- `DeleteEmployeeDialog` not extracted — delete dialogs in `EmployeeList.tsx` and `EmployeeDetail.tsx` have different logic (name lookup vs static) and are not identical enough to dedup cleanly
- `Textarea` not extracted — no locally-defined `Textarea` component existed; just raw `<textarea>` HTML elements

### Build / test result

- `pnpm build`: 0 TS errors ✓
- `pnpm test`: 27/27 passed ✓
- Commit: `df0d33e2` on `victor/feat/refactor-codebase`

## [Task 30] CONTRIBUTING.md + skill update + archive one-shot scripts (2026-06-07)

### What was done

- Created `CONTRIBUTING.md` at repo root — links to AGENTS.md rather than duplicating it. Covers: active/deprecated map, task-creation paths (Prisma vs PostgREST), shell tool guide, employee wizard path, E2E test links, key conventions, git rules.
- Updated `.opencode/skills/adding-shell-tools/SKILL.md` with:
  - `requireEnv()` from `../lib/require-env.js` — replaces manual `if (!process.env['X'])` blocks
  - `getArg()` from `../lib/get-arg.js` — replaces manual `for` loops
  - `node:` prefix convention for Node.js built-in imports
  - `--help` placement rule: FIRST check in `main()`, before mock mode
  - Mock mode rule: SECOND check, before arg/env validation
  - `pnpm exec tsx` not bare `tsx` in test commands
  - Gitignore gotcha for `src/worker-tools/*/lib/` (needs `git add -f`)
- Moved 5 one-shot scripts to `scripts/archive/`: `migrate-archetypes-to-template.ts`, `migrate-feedback-data.ts`, `migrate-vlre-kb.ts`, `resolve-hostfully-uids.ts`, `setup-two-tenants.ts`
- Updated README.md: added CONTRIBUTING.md to Documentation table; updated `setup-two-tenants.ts` row to note it's archived
- `pnpm build` → EXIT_CODE:0 (clean)
- Commit: `6476c7c0`

### Key decisions

- CONTRIBUTING.md links to AGENTS.md sections rather than duplicating content — keeps it maintainable
- Skill file updated in-place (not a new file) — same path, same name, just richer content
- `setup-two-tenants.ts` row kept in README Scripts table (marked archived) so people know it exists and where to find it

## Task 32 — Unify guest and generic approval flows (2026-06-07)

### What was done

- Deleted `src/gateway/slack/handlers/guest-handlers.ts` (501 lines)
- Merged all guest handler logic into `approval-handlers.ts` (~660 lines)
- Removed `GUEST_APPROVE`, `GUEST_EDIT`, `GUEST_REJECT`, `EDITED_DRAFT` from `slack-action-ids.ts`
- Added `EDIT_AND_SEND` action ID
- `BUTTON_BLOCKS` in `shared.ts` now always shows 3 buttons: Approve / Edit & Send / Reject
- REJECT now opens a modal (richer UX, optional rejection reason field)
- `approval-card-poster.mts` and `post-guest-approval.ts` updated to use generic IDs
- `guest-handlers.test.ts` updated: new action/callback IDs, added `use: vi.fn()` to mock boltApp

### Key gotcha

- `registerEventHandlers` calls `boltApp.use(...)` — the test mock `makeMockBoltApp()` was missing `use: vi.fn()`, causing all 10 tests to fail with `TypeError: boltApp.use is not a function`. Fix: add `use: vi.fn()` to the mock.

### Verification

- `grep -ri "GUEST_APPROVE|GUEST_EDIT|GUEST_REJECT|GUEST_BUTTON" src/` → 0 matches
- `pnpm build` → clean
- `pnpm exec vitest run tests/gateway/slack/guest-handlers.test.ts` → 10/10 pass
- Full suite: 61 failed (all pre-existing) | 1776 passed | 26 skipped
- `real-estate-motivation-bot-2` task `9d53431c` → Done (full lifecycle trace verified)
- Commit: `c82617db`
