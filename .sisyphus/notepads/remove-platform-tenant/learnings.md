# Learnings — remove-platform-tenant

## [2026-04-20] Session Start: ses_2548bafbbffe01fOXqt9yD0G9Q

### Key Facts

- Platform tenant UUID: `00000000-0000-0000-0000-000000000001`
- Platform archetype UUID: `00000000-0000-0000-0000-000000000011`
- Operations dept UUID: `00000000-0000-0000-0000-000000000010`
- DozalDevs tenant UUID: `00000000-0000-0000-0000-000000000002`
- VLRE tenant UUID: `00000000-0000-0000-0000-000000000003`

### Prisma FK Behavior

- ALL tenant-scoped tables use `onDelete: Restrict`
- `TenantSecret` uses `onDelete: Cascade`
- Delete order: archetypes → departments → tenants (children before parent)
- Migration must explicitly DELETE child rows before tenant row

### task-creation.ts

- `SYSTEM_TENANT_ID` declared on line 5 but NEVER used — dead code, safe to delete

### Safe Files (no Platform references)

- `src/gateway/services/tenant-env-loader.ts` — throws if tenant not found, no fallback
- `src/gateway/slack/installation-store.ts` — resolves by Slack team ID, no fallback

### Test Infrastructure

- Pre-existing failures (do NOT fix): container-boot.test.ts, inngest-serve.test.ts, tests/inngest/integration.test.ts
- 515+ passing tests baseline

### DB Connection

- `postgresql://postgres:postgres@localhost:54322/ai_employee`

## [2026-04-20] Schema @default Removal + Migration

### What Was Done

- Removed 6 `@default("00000000-0000-0000-0000-000000000001")` annotations from `prisma/schema.prisma`
  - Tables: `tasks` (line 30), `projects` (line 129), `feedback` (line 153), `departments` (line 187), `archetypes` (line 209), `knowledge_bases` (line 236)
- Generated migration: `prisma/migrations/20260420204044_remove_platform_tenant_defaults/migration.sql`
- Appended DELETE statements in FK order: archetypes → departments → tenants

### Migration File Contents

- 6x `ALTER TABLE ... ALTER COLUMN "tenant_id" DROP DEFAULT`
- `DELETE FROM "archetypes" WHERE "id" = '00000000-0000-0000-0000-000000000011'`
- `DELETE FROM "departments" WHERE "id" = '00000000-0000-0000-0000-000000000010'`
- `DELETE FROM "tenants" WHERE "id" = '00000000-0000-0000-0000-000000000001'`

### Verification

- `grep '@default("00000000' prisma/schema.prisma` → 0 matches
- `prisma migrate dev` ran successfully (EXIT_CODE:0), also auto-ran `prisma generate`

## [2026-04-20] create-task-and-dispatch.ts Refactor

### What Was Done

- Added `tenantId: string` (required) to `CreateTaskAndDispatchParams` interface
- Removed hardcoded `const tenantId = '00000000-0000-0000-0000-000000000001'` (was line 25)
- Destructured `tenantId` from `params` — all 3 REST calls (archetype lookup, duplicate check, task creation) now use the param value
- `grep "00000000-0000-0000-0000-000000000001" src/inngest/lib/create-task-and-dispatch.ts` → 0 matches

### Downstream Impact

- Only caller: `src/inngest/triggers/summarizer-trigger.ts` — will have a TypeScript compile error (missing `tenantId`) until Task 7 fixes it. This is expected and intentional.

## [2026-04-20] SYSTEM_TENANT_ID Dead Code Removal (task-creation.ts)

### What Was Done

- Deleted `const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';` from line 5 of `src/gateway/services/task-creation.ts`
- Constant was declared but never referenced anywhere in the file

### Verification

- `grep "SYSTEM_TENANT_ID" src/gateway/services/task-creation.ts` → 0 matches
- `grep "00000000-0000-0000-0000-000000000001" src/gateway/services/task-creation.ts` → 0 matches
- `tsc --noEmit` shows no errors in `task-creation.ts` (pre-existing errors in other files are unrelated)

## [2026-04-20] seed.ts Platform Blocks Removed

### What Was Done

- Removed `platformTenant` upsert block (id `00000000-0000-0000-0000-000000000001`) and its `console.log`
- Removed `operationsDept` upsert block (id `00000000-0000-0000-0000-000000000010`) and its `console.log`
- Removed `dailySummarizerArchetype` upsert block (id `00000000-0000-0000-0000-000000000011`) and its `console.log`
- Updated final `console.log` to remove "Platform" from the tenants-seeded message

### Verification

- `grep "00000000-0000-0000-0000-000000000001" prisma/seed.ts` → 0 matches
- `grep "00000000-0000-0000-0000-000000000010" prisma/seed.ts` → 0 matches
- `grep "00000000-0000-0000-0000-000000000011" prisma/seed.ts` → 0 matches
- Remaining LSP errors are pre-existing (Prisma client type mismatch on `system_prompt`, `model` fields) — not caused by these changes
- DozalDevs (`...0002`, `...0012`, `...0020`) and VLRE (`...0003`, `...0013`, `...0021`) blocks untouched

## [2026-04-20] admin-projects.ts Tenant-Scoped Route Restructure

### What Was Done

- Removed `const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'` from `admin-projects.ts`
- Removed local `UUID_REGEX` (was line 18) — now uses `TenantIdParamSchema` / `TenantProjectParamSchema` from schemas.ts
- Added `TenantProjectParamSchema` (tenantId + id) export to `src/gateway/validation/schemas.ts`
- Moved all 5 routes from `/admin/projects*` → `/admin/tenants/:tenantId/projects*`
- Each handler validates `tenantId` (and `id` for item routes) via Zod schemas before service calls
- `server.ts` unchanged — `app.use(adminProjectRoutes({ prisma }))` still works since routes carry full paths
- Updated test files: `admin-projects-create.test.ts`, `admin-projects-read.test.ts`, `admin-projects-update.test.ts`, `admin-projects-delete.test.ts`, `jira-webhook-with-new-project.test.ts`
- All tests use `SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'` as the URL param (matches existing project seed data)
- Updated `README.md` API table and curl example
- Updated `scripts/register-project.ts` to prompt for `TENANT_ID` and use it in all URLs

### Key Pattern

Admin-tenants.ts pattern followed: `TenantIdParamSchema.safeParse(req.params)` for collection routes; `TenantProjectParamSchema.safeParse(req.params)` for item routes (validates both tenantId and id).

### Verification

- `pnpm build` → exit 0

## [2026-04-20] summarizer-trigger.ts Dynamic Tenant Discovery

### What Was Done

- Rewrote `src/inngest/triggers/summarizer-trigger.ts` from 23 lines to 54 lines
- Added `step.run('discover-archetypes', ...)` that queries Supabase: `GET /rest/v1/archetypes?role_name=eq.daily-summarizer&select=id,tenant_id`
- Uses `process.env.SUPABASE_URL` + `process.env.SUPABASE_SECRET_KEY` (same pattern as feedback-summarizer.ts)
- Iterates all discovered archetypes — calls `createTaskAndDispatch` with `tenantId: archetype.tenant_id` for each
- If no archetypes found, logs info and returns gracefully
- `externalId: summary-${today}` unchanged — dedup still works per-tenant via unique constraint `(external_id, source_system, tenant_id)`
- Inngest function ID `trigger/daily-summarizer` and cron `0 8 * * 1-5` unchanged

### Verification

- `pnpm build` → exit 0 (TypeScript compile error introduced by T3 is now fixed)
- Zero hardcoded tenant UUIDs in the file
