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
- dashboard/** (not TypeScript source)
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
