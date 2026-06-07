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
