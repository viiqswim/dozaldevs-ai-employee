# Learnings — dead-code-cleanup

## [2026-05-20] Session Start

- Plan: dead-code-cleanup
- Session: ses_1ba703723ffewuO4eMYe2ELQfO
- Key constraint: deprecated files (lifecycle.ts, redispatch.ts, watchdog.ts, orchestrate.mts, entrypoint.sh, workers/lib/\*) must NOT be removed — suppress in knip config only
- Worker tools (src/worker-tools/\*\*) are shell-invoked via tsx, not imported — must be in knip entry[], NOT removed
- Dynamic import: src/lib/enrichment-adapters/hostfully.ts only reachable via await import() — must be in knip entry[]
- Docker build is a HARD acceptance criterion (not just pnpm build + pnpm test)
- Each removal wave needs its own commit for easy rollback

## [2026-05-20] Task 1 — Baseline Investigation

### Build

- `pnpm build` (tsc -p tsconfig.build.json): EXIT_CODE=0, no errors

### Tests

- Full suite takes >90s in this environment (singleFork mode, testTimeout=30000)
- README states expected: 1490 passing, 27 skipped, 0 failures
- All observed test files passed during partial run
- ELIFECYCLE error is from shell timeout killing pnpm, NOT a test failure

### tsconfig

- NO `paths` aliases in tsconfig.json or tsconfig.build.json
- Module: NodeNext, ModuleResolution: NodeNext
- tsconfig.json has noEmit:true; tsconfig.build.json overrides to noEmit:false

### dist/

- IS gitignored (git check-ignore dist/ → "dist/")

### Dynamic imports — local files requiring knip whitelist

1. `src/lib/enrichment-adapters/hostfully.ts` — ONLY entry via await import() in employee-lifecycle.ts:249
2. `src/lib/encryption.ts` — dynamically imported in interaction-handler.ts:213 (verify static imports too)

### tsx invocations

- NOT found in: Dockerfile, docker/docker-compose.yml, .github/, entrypoint.sh
- Worker tools are bind-mounted and invoked by OpenCode at runtime

### Pre-existing LSP errors in opencode-harness.mts (confirmed via LSP)

- Line 64: Property 'stop' does not exist on type 'never'
- Line 429: Missing sessionId, transcript, tokenUsage properties
- Line 451: Same as 429
- Line 543: Same as 429
- These are pre-existing, do NOT fix during dead-code-cleanup

## [2026-05-20] Task 2 — Knip Installation & Config

### Knip version

- knip 6.14.1 installed as devDependency

### Config notes

- `src/workers/entrypoint.sh` in ignore[] triggers a knip hint "Remove from ignore" — it's a .sh file, knip doesn't analyze it, but keeping it in ignore[] is harmless and intentional
- `tsx` in ignoreDependencies[] triggers a knip hint "Remove from ignoreDependencies" — kept for safety
- `prisma/seed.ts` in entry[] triggers "Remove redundant entry pattern" (covered by scripts/\*_/_.ts) — harmless, kept for explicitness
- These 3 hints are informational only, not errors

### Suppression verification

- CLEAN: lifecycle.ts, redispatch.ts, watchdog.ts, orchestrate.mts, worker-tools/ — none appear in knip output
- Deprecated files suppressed via ignore[]
- Worker tools suppressed via entry[] (knip treats them as entry points, not unused)

### Actual findings (for Task 3 triage)

Unused files (4):

- src/inngest/types/feedback.ts
- src/workers/config/long-running.ts
- src/workers/lib/delivery-adapters/guest-messaging.mts
- src/workers/lib/delivery-adapters/index.mts

Unused devDependencies (1): @types/pino
Unlisted dependencies (1): vite/client (dashboard/src/vite-env.d.ts)
Unlisted binaries (13): psql, supabase, which, cloudflared, gh, pg_isready (system tools — expected)
Unused exports (7+): parseToolFile, HostfullyWebhookPayloadSchema, MAX_EMPLOYEE_KNOWLEDGE_CHARS, etc.

## [2026-05-20] Task 4 — dist/ cleanup

- Before: 174 .js files, 9 .mjs files, 732 total files in dist/
- After: 139 .js files, 7 .mjs files, 584 total files in dist/
- Stale artifacts confirmed gone: YES
  - dist/workers/tools/ → No such file or directory
  - dist/workers/generic-harness.mjs → No such file or directory
- pnpm build exits 0 (stable, confirmed on two consecutive runs)
- dist/ is gitignored — safe to delete and rebuild at any time

## [2026-05-20] Task 7 — Remove unused dependencies

- Removed: @types/pino (pino v10 bundles its own types)
- Build: exit 0 after removal
- CLI tools (tsx, vitest, eslint) still functional
- Evidence dir (.sisyphus/evidence/) is gitignored — evidence files stay local only

## [2026-05-20] Task 5 — Remove unused source files

- Removed: src/inngest/types/feedback.ts, src/workers/lib/delivery-adapters/guest-messaging.mts, src/workers/lib/delivery-adapters/index.mts
- delivery-adapters/ directory removed (was empty after file removal)
- Build: exit 0 after removals

## [2026-05-20] Task 8 — Dead script audit

- Investigated 17 candidate scripts (not in package.json)
- Removed (5): cleanup-monitor-archetype.sql, dev-start.sh, generate-final-lock-map.mjs, merge-lock-map.mjs, long-running-sim/ (directory)
- Kept (12): benchmark-classifier.ts, generate-jwt-keys.sh, migrate-vlre-kb.ts, preflight-guest-messaging.ts, resolve-hostfully-uids.ts, verify-container-boot.sh, verify-docker.sh, verify-e2e.sh, verify-phase1.sh, verify-supabase.ts, vlre-uid-mapping.json, telegram-notify.ts
- Key signal: April 29 snapshot is most authoritative — scripts absent there are truly dead
- vlre-uid-mapping.json is a data dependency of migrate-vlre-kb.ts and resolve-hostfully-uids.ts — keep always
- .sisyphus/evidence/ is gitignored — evidence files stay local only
- Build: exit 0 after removals

## [2026-05-20] Task 6 — Remove unused exports

- Removed 6 value exports and 39 type exports across 11 files
- Build: exit 0 after all removals
- Changes were purely subtractive (19 insertions / 55 deletions in final commit)
- Key insight: interfaces used internally can only lose `export` keyword, not entire block
  - ToolFlag, ToolEnvVar (tool-parser.ts) — used in ToolMetadata, extractFlags
  - Message (call-llm.ts) — used in CallLLMOptions.messages
  - CreatePRParams, ListPRsParams, GetPRParams (github-client.ts) — used in GitHubClient interface
  - JiraIssue (jira-client.ts) — used in JiraClient interface
  - SlackMessageParams, SlackMessageResult (slack-client.ts) — used in SlackClient interface
  - EscalateOptions (heartbeat.ts) — used in escalate() parameter
  - SessionMonitorResult, MonitorOptions (session-manager.ts) — used in SessionManager interface
  - CreatePropertyLock (schemas.ts) — used as return type of parseCreatePropertyLock
- Type aliases not used internally: safely removed entire line
- FailureCode (failure-codes.ts) — NOT used internally, removed entire line
- .sisyphus/evidence/ is gitignored — evidence files stay local only

## [2026-05-20] Task 9 — Full verification suite

- Build: EXIT_CODE:0 (tsc -p tsconfig.build.json — clean)
- Tests: 1490 passing, 27 skipped, 0 failures (matches baseline exactly)
- Lint: EXIT_CODE:1 — PRE-EXISTING condition, not a Wave 2 regression. Verified by git stash + re-run on baseline commit. 3742 problems (3651 errors, 91 warnings) — all pre-existing no-undef/no-require-imports in test fixtures and dashboard scripts.
- Docker: EXIT_CODE:0 (image sha256:78329f6171f6421e78e10e94708a3f7651ce5bd17bb3c7beeb7c46148b8f0e55)
- Knip: EXIT_CODE:0 (zero dead code findings, 3 informational hints only — matches expected baseline)
- Evidence saved to .sisyphus/evidence/task-9-full-verification.txt and .sisyphus/evidence/task-9-knip-clean.txt

## [2026-05-20] Task 10 — Final validation and docs audit

- knip: EXIT_CODE:0 (confirmed clean — same 3 informational hints, zero dead code findings)
- AGENTS.md: no changes needed — grep found zero dangling references to any removed file, script, or dep
- README.md: no changes needed — grep found zero dangling references to any removed file, script, or dep
- No commit needed (no doc changes)
- Summary created at .sisyphus/evidence/task-10-summary.md
- Plan complete: all 10 tasks done across 2 waves
