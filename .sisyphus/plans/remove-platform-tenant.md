# Remove Platform Tenant — Enforce Real Organization Model

## TL;DR

> **Quick Summary**: Remove the "Platform" system tenant (`00000000-0000-0000-0000-000000000001`) and enforce that every entity belongs to a real organization (DozalDevs or VLRE). Eliminates hidden fallbacks, dead defaults, and phantom tenant references.
>
> **Deliverables**:
>
> - Platform tenant, its archetype, and Operations department deleted from seed + DB
> - Schema defaults removed (force explicit tenant_id on all inserts)
> - Admin projects route moved to `/admin/tenants/:tenantId/projects`
> - Summarizer cron triggers per-tenant (iterates all tenants with daily-summarizer archetype)
> - All fallback-to-Platform patterns replaced with hard failures
> - All tests, scripts, and docs updated
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 6 → Task 8 → Task 11 → F1-F4

---

## Context

### Original Request

Remove the useless "Platform" tenant and enforce a clean tenant model where everything belongs to a real organization.

### Interview Summary

**Key Discussions**:

- Platform tenant is used as a system-level default/fallback across 6 source files, 6 Prisma schema defaults, ~17 test files, and 7+ docs
- Projects route moves to tenant-scoped URL
- Cron trigger iterates all tenants
- All fallbacks become hard failures
- Tests switch to DozalDevs UUID

**Research Findings**:

- 126 references across 49 files
- Prisma FKs use `onDelete: Restrict` — must delete children before tenant row
- `task-creation.ts` has an unused SYSTEM_TENANT_ID (dead code)
- `tenant-env-loader.ts` and `installation-store.ts` are SAFE (no Platform references)
- Platform archetype is indirectly referenced by cron trigger via slug lookup

---

## Work Objectives

### Core Objective

Eliminate the Platform tenant and enforce that every database entity belongs to a real organization (DozalDevs or VLRE).

### Concrete Deliverables

- New Prisma migration: drops tenant_id defaults + deletes Platform rows
- `prisma/seed.ts` without Platform tenant/dept/archetype
- `admin-projects.ts` serving at `/admin/tenants/:tenantId/projects`
- `summarizer-trigger.ts` iterating all tenants
- 5 files with fallbacks replaced by hard failures
- ~17 test files updated to DozalDevs UUID
- 3 scripts updated
- AGENTS.md + 5 doc files updated

### Definition of Done

- [ ] `pnpm test -- --run` passes (515+ tests)
- [ ] `pnpm build` succeeds with no errors
- [ ] `pnpm lint` passes
- [ ] Platform tenant UUID grep returns 0 results in `src/` and `prisma/seed.ts`
- [ ] `prisma migrate deploy` runs clean on fresh DB

### Must Have

- Every entity (task, project, archetype, feedback) belongs to DozalDevs or VLRE
- No code path silently falls back to a phantom tenant
- Admin projects API is tenant-scoped
- Cron summarizer fires for all real tenants

### Must NOT Have (Guardrails)

- Do NOT modify historical migration files (they are immutable records)
- Do NOT introduce a new "system" or "default" tenant concept
- Do NOT change Inngest event names
- Do NOT touch VLRE archetype (`...000003`) or DozalDevs archetype (`...000002`) behavior
- Do NOT change the `worker-tools/` (post-message.ts, read-channels.ts) source
- Do NOT over-abstract — no "tenant resolver middleware" or complex DI; keep patterns simple

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: Tests-after (update existing tests to reflect new behavior)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code changes**: Use Bash — `pnpm test -- --run`, `pnpm build`, `pnpm lint`
- **Migration**: Use Bash — `npx prisma migrate deploy`, then query DB to verify no Platform rows
- **Grep verification**: Use Bash — `grep -r "00000000-0000-0000-0000-000000000001" src/ prisma/seed.ts` returns 0 matches

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all quick, independent):
├── Task 1: Prisma migration — drop defaults + delete Platform rows [quick]
├── Task 2: Seed data — remove Platform tenant/dept/archetype [quick]
├── Task 3: create-task-and-dispatch.ts — add required tenantId param [quick]
├── Task 4: Remove dead code — unused SYSTEM_TENANT_ID in task-creation.ts [quick]
└── Task 5: Remove all fallbacks — 5 files, make tenant_id mandatory [quick]

Wave 2 (Major refactors — depends on Wave 1):
├── Task 6: admin-projects.ts — move to /admin/tenants/:tenantId/projects [unspecified-high]
└── Task 7: summarizer-trigger.ts — multi-tenant cron iteration [deep]

Wave 3 (Tests + Scripts — depends on Wave 2):
├── Task 8: Update admin-projects tests (3 files, heavy refactor) [unspecified-high]
├── Task 9: Update all other test files (~14 files, UUID swap) [quick]
└── Task 10: Update scripts (verify-multi-tenancy, verify-container-boot, verify-phase1) [quick]

Wave 4 (Documentation — parallel with Wave 3):
└── Task 11: Update AGENTS.md + all docs [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| 1    | —          | 5, 6, 7, 8 | 1    |
| 2    | —          | 7          | 1    |
| 3    | —          | 7          | 1    |
| 4    | —          | —          | 1    |
| 5    | —          | 9          | 1    |
| 6    | 1          | 8          | 2    |
| 7    | 1, 2, 3    | 9          | 2    |
| 8    | 6          | F1-F4      | 3    |
| 9    | 5, 7       | F1-F4      | 3    |
| 10   | 1, 2       | F1-F4      | 3    |
| 11   | —          | F1-F4      | 4    |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1-T5 → `quick`
- **Wave 2**: 2 tasks — T6 → `unspecified-high`, T7 → `deep`
- **Wave 3**: 3 tasks — T8 → `unspecified-high`, T9 → `quick`, T10 → `quick`
- **Wave 4**: 1 task — T11 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma Migration — Drop Defaults + Delete Platform Rows

  **What to do**:
  - Remove `@default("00000000-0000-0000-0000-000000000001")` from all 6 `tenant_id` columns in `prisma/schema.prisma`
  - Run `npx prisma migrate dev --name remove_platform_tenant_defaults` to generate migration
  - Manually append to the generated migration SQL:
    ```sql
    DELETE FROM "archetypes" WHERE "id" = '00000000-0000-0000-0000-000000000011';
    DELETE FROM "departments" WHERE "id" = '00000000-0000-0000-0000-000000000010';
    DELETE FROM "tenants" WHERE "id" = '00000000-0000-0000-0000-000000000001';
    ```
  - Run `npx prisma migrate deploy` to verify it applies cleanly

  **Must NOT do**:
  - Do NOT modify any existing migration files
  - Do NOT add a new default pointing to another tenant
  - Do NOT add CASCADE — we want explicit deletion order

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 5, 6, 7, 8
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:30,129,153,187,209,236` — The 6 lines with `@default("00000000-0000-0000-0000-000000000001")` to remove
  - `prisma/migrations/20260417175738_drop_slack_team_id_and_steps/migration.sql` — Example of most recent migration format/style to follow
  - `prisma/seed.ts:29-39,125-135,177-206` — The 3 entities being deleted (Platform tenant, Operations dept, Platform archetype)

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` has no `@default("00000000-0000-0000-0000-000000000001")` on any field
  - [ ] New migration file exists in `prisma/migrations/` with DROP DEFAULT + DELETE statements
  - [ ] `npx prisma migrate deploy` runs clean (exit 0)

  **QA Scenarios**:

  ```
  Scenario: Migration applies cleanly on fresh DB
    Tool: Bash
    Preconditions: Docker Compose running, DB accessible at localhost:54322
    Steps:
      1. Run: npx prisma migrate reset --force
      2. Run: SELECT count(*) FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001'
      3. Assert: count = 0
      4. Run: SELECT count(*) FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000011'
      5. Assert: count = 0
    Expected Result: Platform tenant and archetype do not exist after migration
    Evidence: .sisyphus/evidence/task-1-migration-clean.txt

  Scenario: Insert without tenant_id fails (no default)
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: psql -c "INSERT INTO tasks (id, status) VALUES (gen_random_uuid(), 'Ready')" postgresql://postgres:postgres@localhost:54322/ai_employee
      2. Assert: ERROR — null value in column "tenant_id" violates not-null constraint
    Expected Result: DB rejects insert without explicit tenant_id
    Evidence: .sisyphus/evidence/task-1-no-default-enforced.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(schema): drop Platform tenant defaults and delete Platform rows`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `npx prisma migrate deploy`

- [x] 2. Seed Data — Remove Platform Tenant, Department, and Archetype

  **What to do**:
  - In `prisma/seed.ts`, remove:
    - The Platform tenant upsert block (lines 29-39, variable `platformTenant`)
    - The Operations department upsert block (lines 125-135, variable `operationsDept`)
    - The Platform archetype upsert block (lines 177-206, the one with id `...0011`)
    - Any `console.log` referencing `platformTenant`
  - Ensure remaining DozalDevs and VLRE tenant/archetype upserts still work
  - The DozalDevs archetype (`...0012`) and VLRE archetype (`...0013`) do NOT reference the Operations department — verify this before deleting

  **Must NOT do**:
  - Do NOT touch DozalDevs or VLRE upsert blocks
  - Do NOT change the archetype instructions or system prompts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `prisma/seed.ts:29-39` — Platform tenant upsert (id `...0001`, slug `platform`)
  - `prisma/seed.ts:125-135` — Operations department (id `...0010`, `tenant_id: ...0001`)
  - `prisma/seed.ts:177-206` — Platform archetype (id `...0011`, `tenant_id: ...0001`, `department_id: ...0010`)
  - `prisma/seed.ts:40-68` — DozalDevs tenant upsert (KEEP)
  - `prisma/seed.ts:69-96` — VLRE tenant upsert (KEEP)

  **Acceptance Criteria**:
  - [ ] `prisma/seed.ts` has no reference to `00000000-0000-0000-0000-000000000001`
  - [ ] `prisma/seed.ts` has no reference to `00000000-0000-0000-0000-000000000010`
  - [ ] `prisma/seed.ts` has no reference to `00000000-0000-0000-0000-000000000011`
  - [ ] `npx prisma db seed` runs without error

  **QA Scenarios**:

  ```
  Scenario: Seed runs successfully with only 2 tenants
    Tool: Bash
    Preconditions: Fresh DB after prisma migrate reset
    Steps:
      1. Run: npx prisma db seed
      2. Run: psql -c "SELECT id, slug FROM tenants ORDER BY slug" postgresql://postgres:postgres@localhost:54322/ai_employee
      3. Assert: Exactly 2 rows — dozaldevs and vlre
      4. Run: psql -c "SELECT id, tenant_id, role_name FROM archetypes ORDER BY id" postgresql://postgres:postgres@localhost:54322/ai_employee
      5. Assert: Exactly 2 rows — archetype ...0012 (DozalDevs) and ...0013 (VLRE)
    Expected Result: Only real tenants and their archetypes exist
    Evidence: .sisyphus/evidence/task-2-seed-clean.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `refactor(seed): remove Platform tenant, department, and archetype`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Refactor `create-task-and-dispatch.ts` — Add Required tenantId Parameter

  **What to do**:
  - Add `tenantId: string` to the `CreateTaskAndDispatchParams` interface
  - Remove the hardcoded `const tenantId = '00000000-0000-0000-0000-000000000001'` (line 25)
  - Use `params.tenantId` in all 3 Supabase REST calls (archetype lookup, duplicate check, task creation)
  - This change will cause a compile error in `summarizer-trigger.ts` — that's intentional and will be fixed in Task 7

  **Must NOT do**:
  - Do NOT make tenantId optional — it must be required
  - Do NOT change the function's external behavior beyond adding the parameter

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `src/inngest/lib/create-task-and-dispatch.ts:1-75` — Full file (small, 75 lines)
  - `src/inngest/triggers/summarizer-trigger.ts:14` — Only caller (will be updated in Task 7)

  **Acceptance Criteria**:
  - [ ] `CreateTaskAndDispatchParams` interface includes `tenantId: string`
  - [ ] No hardcoded UUID in the file
  - [ ] `grep "00000000-0000-0000-0000-000000000001" src/inngest/lib/create-task-and-dispatch.ts` returns 0 matches
  - [ ] TypeScript compiles the file without errors (ignoring downstream caller errors)

  **QA Scenarios**:

  ```
  Scenario: File compiles and has no Platform UUID
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: grep "00000000-0000-0000-0000-000000000001" src/inngest/lib/create-task-and-dispatch.ts
      2. Assert: exit code 1 (no matches)
      3. Run: npx tsc --noEmit src/inngest/lib/create-task-and-dispatch.ts 2>&1 || true
      4. Assert: No errors in THIS file (caller errors in summarizer-trigger expected until Task 7)
    Expected Result: File is clean of Platform UUID
    Evidence: .sisyphus/evidence/task-3-no-platform-uuid.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Files: `src/inngest/lib/create-task-and-dispatch.ts`

- [x] 4. Remove Dead Code — Unused SYSTEM_TENANT_ID in task-creation.ts

  **What to do**:
  - Delete `const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';` from `src/gateway/services/task-creation.ts` (line 5)
  - This constant is declared but never used in any function (confirmed by analysis)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/gateway/services/task-creation.ts:5` — The unused constant to delete

  **Acceptance Criteria**:
  - [ ] `grep "SYSTEM_TENANT_ID" src/gateway/services/task-creation.ts` returns 0 matches
  - [ ] File compiles without error

  **QA Scenarios**:

  ```
  Scenario: Dead code removed, file compiles
    Tool: Bash
    Steps:
      1. Run: grep "SYSTEM_TENANT_ID" src/gateway/services/task-creation.ts
      2. Assert: exit code 1 (no matches)
      3. Run: npx tsc --noEmit src/gateway/services/task-creation.ts
      4. Assert: exit code 0
    Expected Result: Constant removed, no compile errors
    Evidence: .sisyphus/evidence/task-4-dead-code-removed.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Files: `src/gateway/services/task-creation.ts`

- [x] 5. Remove All Fallbacks — Make tenant_id a Hard Requirement

  **What to do**:
  - **`src/gateway/services/mention-handler.ts`**: Remove `SYSTEM_TENANT_ID` constant (line 23). At line 53, replace `const resolvedTenantId = tenantId ?? SYSTEM_TENANT_ID` with a check: if `tenantId` is null, log an error and return early (skip the feedback write). Mentions from unknown workspaces should not silently create feedback under a phantom tenant.
  - **`src/inngest/feedback-handler.ts`**: Remove `SYSTEM_TENANT_ID` constant (line 9). At line 31, if the task lookup fails to resolve `tenant_id`, throw an error instead of falling back. The task MUST have a tenant_id — if it doesn't, something is already broken.
  - **`src/inngest/feedback-responder.ts`**: Same pattern — remove fallback at line 30, throw if tenant unresolvable.
  - **`src/inngest/employee-lifecycle.ts`**: At line 82, replace `taskData.tenant_id ?? '...'` with a hard check: if `tenant_id` is missing from the task, throw `Error('Task missing tenant_id — cannot proceed')`.
  - **`src/gateway/routes/jira.ts`**: At line 133, replace `tenantId ?? '...'` with a hard check: if `tenantId` is null, log a warning and return `{ received: true, action: 'tenant_not_resolved' }` (skip the cancellation attempt).

  **Must NOT do**:
  - Do NOT introduce a new fallback UUID
  - Do NOT change function signatures (these are internal changes only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `src/gateway/services/mention-handler.ts:23,53` — SYSTEM_TENANT_ID constant and fallback usage
  - `src/inngest/feedback-handler.ts:9,31` — SYSTEM_TENANT_ID constant and fallback usage
  - `src/inngest/feedback-responder.ts:30` — Inline fallback to Platform UUID
  - `src/inngest/employee-lifecycle.ts:82` — Inline fallback `taskData.tenant_id ?? '...'`
  - `src/gateway/routes/jira.ts:133` — Inline fallback `tenantId ?? '...'`

  **Acceptance Criteria**:
  - [ ] `grep -r "00000000-0000-0000-0000-000000000001" src/gateway/services/mention-handler.ts src/inngest/feedback-handler.ts src/inngest/feedback-responder.ts src/inngest/employee-lifecycle.ts src/gateway/routes/jira.ts` returns 0 matches
  - [ ] No `SYSTEM_TENANT_ID` constant in any of these files
  - [ ] All 5 files compile without error

  **QA Scenarios**:

  ```
  Scenario: No Platform UUID in any fallback file
    Tool: Bash
    Steps:
      1. Run: grep -r "00000000-0000-0000-0000-000000000001" src/gateway/services/mention-handler.ts src/inngest/feedback-handler.ts src/inngest/feedback-responder.ts src/inngest/employee-lifecycle.ts src/gateway/routes/jira.ts
      2. Assert: exit code 1 (no matches)
    Expected Result: Zero references to Platform UUID in fallback files
    Evidence: .sisyphus/evidence/task-5-fallbacks-removed.txt

  Scenario: All 5 files compile
    Tool: Bash
    Steps:
      1. Run: npx tsc --noEmit src/gateway/services/mention-handler.ts src/inngest/feedback-handler.ts src/inngest/feedback-responder.ts src/inngest/employee-lifecycle.ts src/gateway/routes/jira.ts
      2. Assert: exit code 0
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-5-compiles.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Files: all 5 files listed above

- [x] 6. Refactor Admin Projects — Move to Tenant-Scoped URL

  **What to do**:
  - Restructure `src/gateway/routes/admin-projects.ts`:
    - Remove `SYSTEM_TENANT_ID` constant
    - Change all 5 route handlers from `/admin/projects*` to `/admin/tenants/:tenantId/projects*`
    - Extract `tenantId` from `req.params.tenantId` (validated as UUID)
    - Pass the extracted tenantId to all `createProject`, `listProjects`, `getProjectById`, `updateProject`, `deleteProject` calls
  - Update route registration in `src/gateway/server.ts` (if routes are registered there)
  - Add UUID validation for the `:tenantId` param (use existing `UUID_REGEX` pattern from the file)
  - Update the `README.md` API table if it references `/admin/projects`

  **Must NOT do**:
  - Do NOT change the project-registry service internals (`src/gateway/services/project-registry.ts`) — it already accepts `tenantId` as a parameter
  - Do NOT change the validation schemas for project creation/update
  - Do NOT break existing tenant routes (`/admin/tenants/:id` CRUD)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (migration removes default, so new code must provide explicit tenantId)

  **References**:
  - `src/gateway/routes/admin-projects.ts:1-167` — Full route file to restructure
  - `src/gateway/routes/admin-tenants.ts` — Example of tenant-scoped routes (`:tenantId` pattern) — use as style reference
  - `src/gateway/services/project-registry.ts` — Service already accepts `tenantId` param — confirm interface
  - `src/gateway/validation/schemas.ts:167` — `UUID_REGEX` for loose UUID validation
  - `src/gateway/server.ts` — Route registration (find where admin-projects is mounted)
  - `README.md` — API table references `/admin/projects`

  **Acceptance Criteria**:
  - [ ] `curl -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/projects` returns 200
  - [ ] Old URL `curl http://localhost:3000/admin/projects` returns 404
  - [ ] `grep "SYSTEM_TENANT_ID" src/gateway/routes/admin-projects.ts` returns 0 matches
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: New tenant-scoped URL works
    Tool: Bash
    Preconditions: Gateway running on :3000, DB seeded
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/projects
      2. Assert: HTTP 200
      3. Run: curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:3000/admin/projects
      4. Assert: HTTP 404
    Expected Result: Routes moved to tenant-scoped URL
    Evidence: .sisyphus/evidence/task-6-routes-moved.txt

  Scenario: Invalid tenant UUID returns 400
    Tool: Bash
    Steps:
      1. Run: curl -s -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:3000/admin/tenants/not-a-uuid/projects
      2. Assert: HTTP 400 with validation error
    Expected Result: UUID validation rejects invalid tenant param
    Evidence: .sisyphus/evidence/task-6-uuid-validation.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(routes): move projects to /admin/tenants/:tenantId/projects`
  - Files: `src/gateway/routes/admin-projects.ts`, `src/gateway/server.ts`, `README.md`
  - Pre-commit: `pnpm build`

- [x] 7. Refactor Summarizer Trigger — Multi-Tenant Cron Iteration

  **What to do**:
  - Update `src/inngest/triggers/summarizer-trigger.ts`:
    - Add a step that queries Supabase for all tenants with a `daily-summarizer` archetype:
      `GET /rest/v1/archetypes?role_name=eq.daily-summarizer&select=id,tenant_id`
    - For each archetype found, call `createTaskAndDispatch` with that archetype's `tenantId`
    - Handle the case where no archetypes are found (log info, return early)
  - The `createTaskAndDispatch` function (modified in Task 3) now accepts `tenantId` — pass it
  - Deduplication is already handled by `external_id` + `tenant_id` unique constraint (same `summary-${YYYY-MM-DD}` with different tenants are distinct rows)

  **Must NOT do**:
  - Do NOT change the cron schedule (`0 8 * * 1-5`)
  - Do NOT change the Inngest function ID (`trigger/daily-summarizer`)
  - Do NOT hardcode specific tenant IDs — discover them dynamically

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/inngest/triggers/summarizer-trigger.ts:1-23` — Current trigger (simple, 23 lines)
  - `src/inngest/lib/create-task-and-dispatch.ts` — Updated interface with `tenantId` (from Task 3)
  - `prisma/seed.ts` — DozalDevs archetype `...0012` and VLRE archetype `...0013` both have `role_name: 'daily-summarizer'`
  - `src/inngest/triggers/feedback-summarizer.ts` — Example of another trigger function using step.run pattern

  **Acceptance Criteria**:
  - [ ] `grep "00000000-0000-0000-0000-000000000001" src/inngest/triggers/summarizer-trigger.ts` returns 0 matches
  - [ ] Function queries archetypes table to discover tenants dynamically
  - [ ] Function calls `createTaskAndDispatch` once per tenant (not once globally)
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: Trigger creates tasks for both real tenants
    Tool: Bash
    Preconditions: DB seeded with DozalDevs and VLRE archetypes, Inngest running
    Steps:
      1. Fire the trigger manually: curl -X POST http://localhost:8288/e/local -H "Content-Type: application/json" -d '{"name":"inngest/scheduled.timer","data":{"cron":"trigger/daily-summarizer"}}'
      2. Wait 5s for Inngest to process
      3. Query: psql -c "SELECT tenant_id, external_id FROM tasks WHERE source_system = 'cron' AND external_id LIKE 'summary-%' ORDER BY created_at DESC LIMIT 2" postgresql://postgres:postgres@localhost:54322/ai_employee
      4. Assert: 2 rows — one with tenant_id = ...0002, one with ...0003
    Expected Result: Both DozalDevs and VLRE get a summarizer task
    Evidence: .sisyphus/evidence/task-7-multi-tenant-cron.txt

  Scenario: No tasks created if no archetypes exist
    Tool: Bash
    Steps:
      1. Temporarily delete all archetypes: psql -c "DELETE FROM archetypes WHERE role_name = 'daily-summarizer'"
      2. Fire trigger (same curl as above)
      3. Assert: No new tasks created, function returns gracefully
      4. Restore archetypes: npx prisma db seed
    Expected Result: Graceful handling when no archetypes found
    Evidence: .sisyphus/evidence/task-7-no-archetypes.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `refactor(trigger): make daily-summarizer iterate all tenants dynamically`
  - Files: `src/inngest/triggers/summarizer-trigger.ts`
  - Pre-commit: `pnpm build`

- [ ] 8. Update Admin Projects Tests — Tenant-Scoped URL

  **What to do**:
  - Update 3 test files to use new `/admin/tenants/:tenantId/projects` URL pattern:
    - `tests/gateway/admin-projects-registry.test.ts` (~60+ references to `SYSTEM_TENANT_ID`)
    - `tests/gateway/admin-projects-update.test.ts` (~10+ references)
    - `tests/gateway/admin-projects-delete.test.ts` (~10+ references)
  - Replace `SYSTEM_TENANT_ID` constant with `DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002'`
  - Update all API call paths from `/admin/projects` to `/admin/tenants/${DOZALDEVS_TENANT_ID}/projects`
  - Update assertions that check `tenant_id` in responses
  - Also update `tests/gateway/integration/manual-trigger.integration.test.ts` — change `SYSTEM_TENANT_ID` to DozalDevs UUID, update archetype lookup to query DozalDevs tenant

  **Must NOT do**:
  - Do NOT change test logic/assertions (only fixture values and URLs)
  - Do NOT skip or delete tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:
  - `tests/gateway/admin-projects-registry.test.ts:13` — `SYSTEM_TENANT_ID` constant (60+ usages)
  - `tests/gateway/admin-projects-update.test.ts:7` — `SYSTEM_TENANT_ID` constant
  - `tests/gateway/admin-projects-delete.test.ts:7` — `SYSTEM_TENANT_ID` constant
  - `tests/gateway/integration/manual-trigger.integration.test.ts:6,12-19` — SYSTEM_TENANT_ID + archetype lookup
  - `src/gateway/routes/admin-projects.ts` — New URL pattern (from Task 6) to match in tests

  **Acceptance Criteria**:
  - [ ] `grep -r "00000000-0000-0000-0000-000000000001" tests/gateway/admin-projects*.test.ts tests/gateway/integration/manual-trigger*.test.ts` returns 0 matches
  - [ ] `pnpm test -- --run tests/gateway/admin-projects-registry.test.ts tests/gateway/admin-projects-update.test.ts tests/gateway/admin-projects-delete.test.ts tests/gateway/integration/manual-trigger.integration.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Admin projects tests pass with new URL pattern
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-projects-registry.test.ts tests/gateway/admin-projects-update.test.ts tests/gateway/admin-projects-delete.test.ts
      2. Assert: All tests pass
    Expected Result: Tests updated and passing
    Evidence: .sisyphus/evidence/task-8-admin-tests-pass.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test: update admin-projects tests for tenant-scoped URL pattern`
  - Files: `tests/gateway/admin-projects-*.test.ts`, `tests/gateway/integration/manual-trigger.integration.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [ ] 9. Update All Other Test Files — DozalDevs UUID

  **What to do**:
  - Replace `'00000000-0000-0000-0000-000000000001'` with `'00000000-0000-0000-0000-000000000002'` in these files:
    - `tests/inngest/lifecycle.test.ts` (line 23: `SEED_TENANT_ID`)
    - `tests/inngest/redispatch.test.ts` (line 9: `SEED_TENANT_ID`)
    - `tests/schema.test.ts` (line 4: `TENANT_ID`)
    - `tests/setup.test.ts` (line 21)
    - `tests/gateway/services/mention-handler.test.ts` (line 144: assertion value)
    - `tests/gateway/services/feedback-service.test.ts` (lines 28, 50)
    - `tests/gateway/services/employee-dispatcher.test.ts` (line 11: `TENANT_ID`)
    - `tests/gateway/services/tenant-repository.test.ts` (line 5: `SYSTEM_TENANT_ID`, lines 15-16: cleanup filter)
    - `tests/gateway/services/tenant-secret-repository.test.ts` (line 9: `SYSTEM_TENANT`)
    - `tests/gateway/task-creation.test.ts` (line 11: `TENANT_ID`)
    - `tests/gateway/project-lookup.test.ts` (line 5: `TENANT_ID`)
    - `tests/gateway/schemas.test.ts` (lines 173, 186, 195, 220, 229)
    - `tests/lib/agent-version.test.ts` (lines 105, 183)
  - Rename constants from `SYSTEM_TENANT_ID` / `SEED_TENANT_ID` to `DOZALDEVS_TENANT_ID` or `TEST_TENANT_ID` where appropriate

  **Must NOT do**:
  - Do NOT change test logic or assertions beyond the UUID value
  - Do NOT delete any tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 7

  **References**:
  - All 13 test files listed above with exact line numbers

  **Acceptance Criteria**:
  - [ ] `grep -r "00000000-0000-0000-0000-000000000001" tests/` returns 0 matches
  - [ ] `pnpm test -- --run` passes (full suite)

  **QA Scenarios**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert: All tests pass (515+), 0 failures (excluding known pre-existing failures)
    Expected Result: Test suite green
    Evidence: .sisyphus/evidence/task-9-all-tests-pass.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test: replace Platform UUID with DozalDevs across all test fixtures`
  - Files: all 13 test files
  - Pre-commit: `pnpm test -- --run`

- [ ] 10. Update Scripts — Remove Platform References

  **What to do**:
  - **`scripts/verify-multi-tenancy.ts`**:
    - Remove `PLATFORM_ID` constant (line 11)
    - Remove the Platform tenant existence check (lines 83-93)
    - Update encryption probe to use DozalDevs tenant ID instead (lines 99-117)
    - Update expected tenant count from 3 to 2
  - **`scripts/verify-container-boot.sh`**:
    - Replace `'00000000-0000-0000-0000-000000000001'` with `'00000000-0000-0000-0000-000000000002'` in test SQL inserts (lines 91, 101, 162)
  - **`scripts/verify-phase1.sh`**:
    - Replace UUID in test SQL insert (line 89)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `scripts/verify-multi-tenancy.ts:11,83-93,99-117` — Platform checks and encryption probe
  - `scripts/verify-container-boot.sh:91,101,162` — Test SQL inserts
  - `scripts/verify-phase1.sh:89` — Test SQL insert

  **Acceptance Criteria**:
  - [ ] `grep -r "00000000-0000-0000-0000-000000000001" scripts/` returns 0 matches

  **QA Scenarios**:

  ```
  Scenario: No Platform UUID in scripts
    Tool: Bash
    Steps:
      1. Run: grep -r "00000000-0000-0000-0000-000000000001" scripts/
      2. Assert: exit code 1 (no matches)
    Expected Result: Scripts clean of Platform references
    Evidence: .sisyphus/evidence/task-10-scripts-clean.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `chore(scripts): replace Platform tenant with DozalDevs in verification scripts`
  - Files: `scripts/verify-multi-tenancy.ts`, `scripts/verify-container-boot.sh`, `scripts/verify-phase1.sh`

- [ ] 11. Update Documentation — Remove Platform Tenant References

  **What to do**:
  - **`AGENTS.md`**:
    - Remove Platform row from the Tenants table (line 77)
    - Change the `TENANT=` example (line 182) to use DozalDevs UUID
    - Remove or update the Zod UUID validation note (line 253) — the note about `...000001` being rejected by `z.string().uuid()` is no longer relevant if that UUID doesn't exist in the system. Keep the general note about `UUID_REGEX` but remove the specific Platform UUID reference.
  - **`docs/2026-04-20-1314-current-system-state.md`**:
    - Update tenant table to show only 2 tenants
    - Update curl examples to use DozalDevs or VLRE UUID
    - Update project structure/routes section if affected by Task 6
  - **`docs/2026-04-16-0310-manual-employee-trigger.md`**:
    - Change `TENANT=00000000-0000-0000-0000-000000000001` to DozalDevs UUID (line 34)
  - **`docs/2026-04-14-0104-full-system-vision.md`**:
    - Update line 25 about system tenant default — note this is now removed
  - **`docs/2026-03-22-2317-ai-employee-architecture.md`** and **`docs/2026-03-25-1901-mvp-implementation-phases.md`** and **`docs/2026-03-26-1511-phase1-foundation.md`**:
    - These are historical docs. Add a brief note at the relevant sections: `> **Note (April 2026)**: The Platform tenant has been removed. All entities now belong to real organization tenants.`

  **Must NOT do**:
  - Do NOT rewrite historical docs — just add brief notes where Platform is mentioned
  - Do NOT delete sections from historical docs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Wave 3)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: None (docs can be updated anytime)

  **References**:
  - `AGENTS.md:77,182,253` — Platform tenant table, curl example, Zod note
  - `docs/2026-04-20-1314-current-system-state.md:162,166` — Curl examples
  - `docs/2026-04-16-0310-manual-employee-trigger.md:34` — TENANT= example
  - `docs/2026-04-14-0104-full-system-vision.md:25` — System tenant description
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1761` — MVP default description
  - `docs/2026-03-25-1901-mvp-implementation-phases.md:104,138,488` — Platform references
  - `docs/2026-03-26-1511-phase1-foundation.md:363` — System tenant description

  **Acceptance Criteria**:
  - [ ] `grep -r "00000000-0000-0000-0000-000000000001" AGENTS.md docs/2026-04-20-1314-current-system-state.md docs/2026-04-16-0310-manual-employee-trigger.md` returns 0 matches
  - [ ] Historical docs have deprecation notes added (not deleted)
  - [ ] AGENTS.md tenant table shows only DozalDevs and VLRE

  **QA Scenarios**:

  ```
  Scenario: Active docs clean of Platform UUID
    Tool: Bash
    Steps:
      1. Run: grep "00000000-0000-0000-0000-000000000001" AGENTS.md docs/2026-04-20-1314-current-system-state.md docs/2026-04-16-0310-manual-employee-trigger.md
      2. Assert: exit code 1 (no matches)
    Expected Result: Active documentation is clean
    Evidence: .sisyphus/evidence/task-11-docs-clean.txt
  ```

  **Commit**: YES (Wave 4)
  - Message: `docs: remove Platform tenant references, update to real-org model`
  - Files: `AGENTS.md`, `docs/2026-04-20-1314-current-system-state.md`, `docs/2026-04-16-0310-manual-employee-trigger.md`, `docs/2026-04-14-0104-full-system-vision.md`, `docs/2026-03-22-2317-ai-employee-architecture.md`, `docs/2026-03-25-1901-mvp-implementation-phases.md`, `docs/2026-03-26-1511-phase1-foundation.md`
  - Pre-commit: —

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check `grep -r "00000000-0000-0000-0000-000000000001" src/ prisma/seed.ts` returns 0. Verify migration file exists and contains DROP DEFAULT + DELETE statements.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && pnpm lint && pnpm test -- --run`. Review all changed files for: leftover SYSTEM_TENANT_ID references, any new fallback patterns, type errors. Check no test uses Platform UUID.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start fresh: `npx prisma migrate reset --force`. Verify: Platform tenant NOT in DB (`SELECT * FROM tenants WHERE id = '...0001'` → 0 rows). Verify DozalDevs and VLRE tenants exist. Verify admin projects API responds at new URL. Verify seed creates only 2 tenants.
      Output: `DB clean [YES/NO] | API works [YES/NO] | Seed correct [YES/NO] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: verify the actual changes match the spec (nothing missing, nothing extra). Check no historical migration files were modified. Verify the new migration is the only schema change. Check tests pass without the Platform tenant existing.
      Output: `Tasks [N/N compliant] | Migrations untouched [YES/NO] | VERDICT`

---

## Commit Strategy

| Wave | Message                                                                          | Files                                                                                                                                                                                                                                                                                                                      | Pre-commit           |
| ---- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1    | `refactor(schema): drop Platform tenant defaults and delete Platform rows`       | prisma/schema.prisma, prisma/migrations/\*, prisma/seed.ts, src/inngest/lib/create-task-and-dispatch.ts, src/gateway/services/task-creation.ts, src/gateway/services/mention-handler.ts, src/inngest/feedback-handler.ts, src/inngest/feedback-responder.ts, src/inngest/employee-lifecycle.ts, src/gateway/routes/jira.ts | `pnpm build`         |
| 2    | `refactor(routes): move projects to tenant-scoped URL and add multi-tenant cron` | src/gateway/routes/admin-projects.ts, src/gateway/server.ts, src/inngest/triggers/summarizer-trigger.ts                                                                                                                                                                                                                    | `pnpm build`         |
| 3    | `test: update all fixtures from Platform to DozalDevs tenant UUID`               | tests/**, scripts/**                                                                                                                                                                                                                                                                                                       | `pnpm test -- --run` |
| 4    | `docs: remove Platform tenant references from all documentation`                 | AGENTS.md, docs/\*\*                                                                                                                                                                                                                                                                                                       | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: success, 0 errors
pnpm lint                     # Expected: 0 errors
pnpm test -- --run            # Expected: 515+ passing
grep -r "00000000-0000-0000-0000-000000000001" src/ prisma/seed.ts  # Expected: 0 matches
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] No Platform tenant in DB after fresh `prisma migrate reset`
