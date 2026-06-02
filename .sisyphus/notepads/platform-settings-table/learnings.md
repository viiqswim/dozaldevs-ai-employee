# Learnings — platform-settings-table

## Key Patterns

- Prisma schema: UUID PK with `@default(uuid()) @db.Uuid`, `@@map("snake_case")`, soft delete `deleted_at DateTime?`
- Admin routes: factory function `export function adminXxxRoutes({ prisma })`, Zod validation, `requireAdminKey` middleware
- Best template: `src/gateway/routes/admin-model-catalog.ts` (global table, GET list + PATCH by key)
- Route registration: `src/gateway/server.ts` around line 196
- PostgREST: needs `NOTIFY pgrst, 'reload schema'` after every new table migration
- RLS: `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "anon_select" ... FOR SELECT TO anon USING (deleted_at IS NULL)`
- Seed: loop upsert with `update: {}` for idempotency, `console.log('✅ ...')` prefix

## Critical Constraints

- `src/inngest/lifecycle.ts` is DEPRECATED — do NOT modify
- `TURBO_CONCURRENCY`, `NEXUS_VITEST_MAX_WORKERS`, `NODE_OPTIONS` in resource-caps.ts are NOT platform settings — do NOT migrate
- `getPlatformSetting()` must NEVER return a default — throws on missing key
- `SYNTHESIS_THRESHOLD` export in employee-lifecycle.ts is imported by handlers.ts → must update handlers.ts import too
- `MAX_EMPLOYEE_RULES_CHARS` is imported by feedback-injection.test.ts → must update test
- `build.test.ts` asserts `COST_LIMIT_USD_PER_DEPT_PER_DAY` exists in .env.example → will break, must update
- `call-llm.test.ts` mocks `process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY` in 4 places → replace with DB mocks
- `resource-caps.ts` bash timeout: DB value must be set BEFORE `applyResourceCaps()` is called — harness sets env var first
- Deprecated env vars: DELETE entirely from .env.example (no deprecated section, no comments — gone)
- Production seed: INSERT rows must be in migration SQL with ON CONFLICT DO NOTHING (not just prisma db seed)

## T4 — employee-lifecycle.ts migration

- Grep exit 1 = 0 matches (correct - no legacy constants remain)
- All 3 constant export declarations removed from lines 35-37
- `getPlatformSetting` import added after `pending-approvals.js` import
- 7 `getPlatformSetting` call sites added:
  1. `default_worker_vm_size` → vmSize in `executing` step
  2. `max_employee_rules_chars` → rules truncation in `executing` step
  3. `max_employee_knowledge_chars` → knowledge truncation in `executing` step
  4. `issues_slack_channel` → used in localWorkerEnv + flyWorkerEnv (single fetch, used twice)
  5. `default_worker_vm_size` → deliveryVmSize in `run-delivery-no-approval` step
  6. `default_worker_vm_size` → deliveryVmSize in approval-path delivery step
  (import counts as 1, total unique call sites = 6, distinct invocations = 7)
- ISSUES_SLACK_CHANNEL uses spread pattern `...(val ? { KEY: val } : {})` (not `?? ''`)
- All fetches inside existing `step.run(async () => {})` callbacks — `await` is valid
- Build: `tsc -p tsconfig.build.json` exits 0
