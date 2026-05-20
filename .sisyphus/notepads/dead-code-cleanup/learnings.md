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
