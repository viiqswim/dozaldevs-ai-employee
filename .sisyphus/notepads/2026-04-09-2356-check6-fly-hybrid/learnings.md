# Learnings — check6-fly-hybrid

## 2026-04-10 Session Start

### Codebase Conventions

- PostgREST client: `postgrestClient.post()` / `postgrestClient.patch()` (not fetch directly in workers)
- Logger: `log.warn(...)` for non-fatal errors, `log.info(...)` for progress
- Prisma is used in lifecycle.ts (gateway/inngest), PostgREST client in workers (no direct DB)
- `patchExecution()` helper exists in orchestrate.mts for updating execution rows via PostgREST

### lifecycle.ts Hybrid-Spawn Key Facts

- Lines 97-169: `step.run('hybrid-spawn', async () => { ... })` — the entire hybrid machine creation
- Line 127: STALE TAG `bd34f83` → must change to `latest`
- Lines 136-162: `fetch()` call that creates the Fly machine (execution.create must go BEFORE this)
- Lines 149-158: `env:` block in machine config (add EXECUTION_ID here)
- Line 168: `return flyMachine` (a `{ id, state }` object) — must extend to include executionId
- Line 190: `destroyMachine(flyWorkerApp, hybridMachine.id)` — this uses `.id`, will still work after extending return type
- Lines 247-253: LOCAL DOCKER PATH — execution.create() pattern to mirror (DO NOT TOUCH)
- Lines 257: local Docker adds `EXECUTION_ID` to env args — same pattern needed for hybrid

### validation-pipeline.ts

- Line 98-111: `if (executionId) { await postgrestClient.post('validation_runs', {...}) }` — needs try/catch wrapping
- Already has `else` branch with `log.warn` for null executionId

### orchestrate.mts

- Lines 968-981: `else` branch of `if (fixResult.success)` — needs AwaitingInput write before heartbeat.stop()
- `patchExecution()` helper at ~line 930 already exists for PostgREST execution updates
- PostgREST `patch()` pattern: `postgrestClient.patch('tasks', 'id=eq.${task.id}', { ... })`
- PostgREST `post()` pattern: `postgrestClient.post('task_status_log', { ... })`

### CRITICAL GUARDRAILS

- DO NOT touch lifecycle.ts lines 232-286 (local Docker path)
- DO NOT add try/catch to any PostgREST calls except validation_runs in validation-pipeline.ts
- DO NOT add AwaitingInput writes to any process.exit(1) OTHER than the fix-loop failure branch
- DO NOT commit .env

## 2026-04-10 UUID Default Fix

### Root Cause
`validation_runs`, `deliverables`, `task_status_log` had `id uuid NOT NULL` with no DB-level default.
Prisma's `@default(uuid())` generates UUIDs client-side (Prisma client). PostgREST bypasses Prisma
and sends INSERT without `id`, triggering NOT NULL constraint violation (HTTP 400).

### Fix Applied
- `prisma/schema.prisma`: Changed `@default(uuid())` → `@default(dbgenerated("gen_random_uuid()"))` on id fields for the three tables
- Migration `20260410140640_add_uuid_defaults`: `ALTER TABLE ... ALTER COLUMN "id" SET DEFAULT gen_random_uuid()` for each table
- Applied via: `psql ... -f migration.sql` + `prisma migrate resolve --applied <name>`

### Verification
`curl -X POST http://localhost:54321/rest/v1/validation_runs ... -d '{"execution_id":...,"status":"pass",...}'`
→ HTTP 201, row returned with auto-generated UUID

### Pattern for Future Tables
If a table needs PostgREST inserts without providing `id`, use `@default(dbgenerated("gen_random_uuid()"))` not `@default(uuid())` in schema.prisma.
