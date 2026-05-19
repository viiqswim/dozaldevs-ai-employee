# Employee CRUD — Soft-Delete + Restore

## TL;DR

> **Quick Summary**: Add the missing Delete operation to employee (archetype) CRUD management — soft-delete via `deleted_at` column, with individual + bulk delete from the dashboard, restore capability with a "Show deleted" toggle, and safety guards against deleting employees with active tasks.
>
> **Deliverables**:
>
> - Prisma migration adding `deleted_at` column to `archetypes`
> - `DELETE /admin/tenants/:tenantId/archetypes/:archetypeId` API endpoint
> - `POST /admin/tenants/:tenantId/archetypes/:archetypeId/restore` API endpoint
> - Dashboard: individual delete button per employee row
> - Dashboard: checkbox multi-select with "Delete Selected" bulk action
> - Dashboard: "Show deleted" toggle to see and restore deleted employees
> - Vitest tests for new API endpoints
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (migration) → Task 3 (API endpoints) → Task 6 (dashboard delete UI)

---

## Context

### Original Request

User has ~19 archetype records in the VLRE tenant, of which ~15 are test pollution (`qa-patch-test`, `t6-active-test`, `standup-summarizer-50566958`, duplicates). There is no way to delete employees from the dashboard or API. A full CRUD audit revealed Create, Read, and Update are complete — only Delete is missing.

### Interview Summary

**Key Discussions**:

- **Delete UX**: Both individual (button per row) AND bulk (checkboxes + "Delete Selected")
- **Restore**: Yes — with "Show deleted" toggle in the dashboard, following the existing Tenant soft-delete + restore pattern
- **CRUD Audit**: C/R/U all exist with API + dashboard UI. Only D is missing.
- **Test strategy**: Vitest tests after implementation

**Research Findings**:

- `Archetype` model has NO `deleted_at` column. `Tenant` and `TenantIntegration` do — pattern exists at `src/gateway/services/tenant-repository.ts`
- 7 PostgREST query sites in the dashboard need `deleted_at=is.null` filtering
- No `AlertDialog` or `Checkbox` shadcn/ui components exist — need to add Checkbox, use existing `Dialog` for confirmation
- Routes registered via `app.use(adminArchetypesRoutes({ prisma }))` in `server.ts:178`
- Cascading: soft-delete means no FK cascade issues — `FeedbackEvent` and `EmployeeRule` have `onDelete: Cascade` but that only triggers on hard delete

### Metis Review

**Identified Gaps** (addressed):

- **Active-task guard scope**: Block deletion if ANY task has `status NOT IN ('Done', 'Failed', 'Cancelled')` — broader than the project pattern which only checked 3 states
- **Restore collision**: Must check for `(tenant_id, role_name)` uniqueness before restoring — return `409 CONFLICT` if active archetype with same role_name exists
- **Idempotent delete**: Deleting an already-deleted archetype returns `200` (not error) — matches Tenant pattern
- **No ArchetypeRepository exists**: Create one at `src/gateway/services/archetype-repository.ts` following Tenant pattern
- **7 PostgREST query sites**: All identified and must be patched — `TenantOverview.tsx` is highest risk (has no status filter at all)
- **Dashboard type update**: `Archetype` interface in `dashboard/src/lib/types.ts` needs `deleted_at: string | null`
- **No Checkbox UI component**: Must add shadcn/ui Checkbox for bulk select

---

## Work Objectives

### Core Objective

Add soft-delete and restore capability for employee archetypes — API endpoints, database migration, and full dashboard UI — so test employees can be cleaned up and recovered if needed.

### Concrete Deliverables

- `prisma/migrations/YYYYMMDDHHMMSS_add_deleted_at_to_archetypes/migration.sql`
- `src/gateway/services/archetype-repository.ts` (new file)
- Updated `src/gateway/routes/admin-archetypes.ts` with DELETE + restore routes
- `dashboard/src/components/ui/checkbox.tsx` (new shadcn/ui component)
- Updated `dashboard/src/panels/employees/EmployeeList.tsx` with delete, bulk delete, show-deleted toggle
- Updated 6 other PostgREST query sites with `deleted_at=is.null` filter
- `src/gateway/routes/__tests__/admin-archetypes-delete.test.ts` (new test file)

### Definition of Done

- [ ] `curl -X DELETE .../archetypes/:id` returns `200` with `{ id, deleted_at }`
- [ ] `curl -X DELETE .../archetypes/:id` returns `409` when active tasks exist
- [ ] `curl -X POST .../archetypes/:id/restore` returns `200` and clears `deleted_at`
- [ ] `curl -X POST .../archetypes/:id/restore` returns `409` on role_name collision
- [ ] Dashboard list hides deleted employees by default
- [ ] "Show deleted" toggle reveals deleted employees with visual indicator
- [ ] Bulk select + "Delete Selected" removes multiple employees
- [ ] `pnpm test -- --run` passes with no new failures

### Must Have

- Soft-delete via `deleted_at` column (never hard delete)
- Active-task safety guard (409 if non-terminal tasks exist)
- Restore with role_name collision check
- Confirmation dialog before delete (single and bulk)
- All 7 PostgREST query sites patched

### Must NOT Have (Guardrails)

- No `deleted_at` added to any table other than `archetypes`
- No modifications to `employee-lifecycle.ts` — lifecycle does not need to know about archetype soft-deletion
- No new `/deleted-employees` route — use toggle in existing `EmployeeList.tsx`
- No bulk-delete API endpoint — implement as N sequential frontend `DELETE` calls
- No "recycle bin" page — "Show deleted" toggle is sufficient
- No optimistic UI updates — use existing `refresh()` pattern from `usePoll`
- No undo toast — restore endpoint + "Show deleted" toggle covers recovery
- No PostgREST RLS policies — app-level filtering is sufficient since dashboard is the only PostgREST consumer

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests after implementation)
- **Framework**: Vitest (bun test compatible via `pnpm test`)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot
- **Database**: Use Bash (psql) — verify schema changes

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Prisma migration (add deleted_at to archetypes) [quick]
├── Task 2: ArchetypeRepository class [quick]
├── Task 3: Checkbox UI component [quick]
└── Task 4: Dashboard type + gateway client updates [quick]

Wave 2 (After Wave 1 — API + core UI):
├── Task 5: DELETE + restore API routes [unspecified-high]
├── Task 6: Patch all 7 PostgREST query sites [quick]
└── Task 7: Individual delete button + confirmation dialog [visual-engineering]

Wave 3 (After Wave 2 — bulk UI + tests):
├── Task 8: Bulk delete (checkboxes + toolbar) [visual-engineering]
├── Task 9: "Show deleted" toggle + restore button [visual-engineering]
└── Task 10: Vitest tests for DELETE + restore endpoints [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
└── Task 11: Notify completion via Telegram

Critical Path: Task 1 → Task 5 → Task 7 → Task 8 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks               | Wave |
| ---- | ---------- | -------------------- | ---- |
| 1    | —          | 2, 5, 6, 7, 8, 9, 10 | 1    |
| 2    | —          | 5                    | 1    |
| 3    | —          | 8                    | 1    |
| 4    | —          | 5, 6, 7, 8, 9        | 1    |
| 5    | 1, 2       | 7, 8, 9, 10          | 2    |
| 6    | 1, 4       | 9                    | 2    |
| 7    | 4, 5       | 8                    | 2    |
| 8    | 3, 7       | —                    | 3    |
| 9    | 5, 6       | —                    | 3    |
| 10   | 5          | —                    | 3    |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 `quick`, T2 `quick`, T3 `quick`, T4 `quick`
- **Wave 2**: **3** — T5 `unspecified-high`, T6 `quick`, T7 `visual-engineering`
- **Wave 3**: **3** — T8 `visual-engineering`, T9 `visual-engineering`, T10 `unspecified-high`
- **FINAL**: **5** — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`, T11 `quick`

---

## TODOs

- [x] 1. Prisma Migration — Add `deleted_at` to Archetypes

  **What to do**:
  - Add `deleted_at DateTime?` field to the `Archetype` model in `prisma/schema.prisma` (after `parent_draft_id`)
  - Run `npx prisma migrate dev --name add_deleted_at_to_archetypes` to generate and apply the migration
  - Verify the column exists in the database

  **Must NOT do**:
  - Do NOT add `deleted_at` to any other table
  - Do NOT modify any existing columns or indexes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 2, 5, 6, 7, 8, 9, 10
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:179-220` — Current Archetype model definition
  - `prisma/schema.prisma:373` — Existing `deleted_at` pattern on Tenant model
  - `prisma/schema.prisma:401` — Existing `deleted_at` pattern on TenantIntegration model

  **Acceptance Criteria**:

  ```
  Scenario: Migration creates deleted_at column
    Tool: Bash (psql)
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes" | grep deleted_at
      2. Assert output contains: deleted_at | timestamp without time zone |
    Expected Result: Column exists and is nullable
    Evidence: .sisyphus/evidence/task-1-migration-applied.txt

  Scenario: Existing archetypes have null deleted_at
    Tool: Bash (psql)
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT COUNT(*) FROM archetypes WHERE deleted_at IS NOT NULL"
      2. Assert count is 0
    Expected Result: All existing archetypes have deleted_at = NULL
    Evidence: .sisyphus/evidence/task-1-null-check.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add deleted_at column to archetypes for soft-delete`
  - Files: `prisma/schema.prisma`, `prisma/migrations/...`
  - Pre-commit: `pnpm build`

- [x] 2. ArchetypeRepository — Soft-Delete + Restore Logic

  **What to do**:
  - Create `src/gateway/services/archetype-repository.ts` following `src/gateway/services/tenant-repository.ts` as the exact pattern
  - Implement `softDelete(id: string, tenantId: string)`:
    - Find archetype by `id` AND `tenant_id` (tenant-scoped)
    - If not found → throw `"not found"` error
    - If already deleted (deleted_at is not null) → return existing (idempotent)
    - Check for active tasks: query `tasks` table for `archetype_id = id` AND `status NOT IN ('Done', 'Failed', 'Cancelled')` — if any found, throw error with `activeTaskCount`
    - Set `deleted_at = new Date()` and return updated record
  - Implement `restore(id: string, tenantId: string)`:
    - Find archetype by `id` (include deleted — no `deleted_at` filter)
    - Verify `tenant_id` matches
    - If not found → throw `"not found"` error
    - If not deleted (deleted_at is null) → return existing (idempotent)
    - Check for role_name collision: query `archetypes` for same `tenant_id`, same `role_name`, `deleted_at = null`, `id != this.id` — if found, throw collision error
    - Set `deleted_at = null` and return updated record

  **Must NOT do**:
  - Do NOT add CRUD operations beyond softDelete and restore — the existing route file handles create/update inline
  - Do NOT add a `findById` or `list` method — PostgREST handles reads

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately — but migration must apply before testing)

  **References**:
  - `src/gateway/services/tenant-repository.ts` — **Exact pattern to follow**: `softDelete()` (lines 56-68), `restore()` (lines 70-87) with collision check
  - `prisma/schema.prisma:179-220` — Archetype model with relations (Task, FeedbackEvent, EmployeeRule)
  - `prisma/schema.prisma:20-55` — Task model (for active-task guard query — check `status` field, `archetype_id` FK)

  **Acceptance Criteria**:

  ```
  Scenario: Repository file created with correct exports
    Tool: Bash
    Steps:
      1. Run: grep -c "export class ArchetypeRepository" src/gateway/services/archetype-repository.ts
      2. Assert output is 1
      3. Run: grep -c "async softDelete" src/gateway/services/archetype-repository.ts
      4. Assert output is 1
      5. Run: grep -c "async restore" src/gateway/services/archetype-repository.ts
      6. Assert output is 1
    Expected Result: Class exists with both methods
    Evidence: .sisyphus/evidence/task-2-repo-structure.txt

  Scenario: Build succeeds with new repository
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: TypeScript compiles without errors
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES
  - Message: `feat(gateway): add ArchetypeRepository with soft-delete and restore`
  - Files: `src/gateway/services/archetype-repository.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Add Checkbox UI Component

  **What to do**:
  - Add `dashboard/src/components/ui/checkbox.tsx` — the standard shadcn/ui Checkbox component built on `@radix-ui/react-checkbox`
  - Install `@radix-ui/react-checkbox` dependency if not already present
  - Follow the same pattern as existing shadcn/ui components in `dashboard/src/components/ui/` (forwardRef, cn utility, variant styling)

  **Must NOT do**:
  - Do NOT install any other component library
  - Do NOT create a custom checkbox — use the standard shadcn/ui pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `dashboard/src/components/ui/switch.tsx` — Existing Radix UI component pattern to follow (forwardRef, cn, Radix primitive)
  - `dashboard/package.json` — Check if `@radix-ui/react-checkbox` is already installed
  - shadcn/ui Checkbox docs: https://ui.shadcn.com/docs/components/checkbox

  **Acceptance Criteria**:

  ```
  Scenario: Checkbox component renders
    Tool: Bash
    Steps:
      1. Run: grep "export.*Checkbox" dashboard/src/components/ui/checkbox.tsx
      2. Assert output contains Checkbox export
      3. Run: cd dashboard && npx tsc --noEmit
      4. Assert exit code 0
    Expected Result: Component exists and compiles
    Evidence: .sisyphus/evidence/task-3-checkbox.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(dashboard): add Checkbox component and archetype delete types`

- [x] 4. Dashboard Type + Gateway Client Updates

  **What to do**:
  - Add `deleted_at: string | null;` to the `Archetype` interface in `dashboard/src/lib/types.ts` (after `updated_at`)
  - Add `deleteArchetype(tenantId: string, archetypeId: string): Promise<{ id: string; deleted_at: string }>` to `dashboard/src/lib/gateway.ts` — calls `DELETE /admin/tenants/:tenantId/archetypes/:archetypeId` via `gatewayFetch`
  - Add `restoreArchetype(tenantId: string, archetypeId: string): Promise<Archetype>` to `dashboard/src/lib/gateway.ts` — calls `POST /admin/tenants/:tenantId/archetypes/:archetypeId/restore` via `gatewayFetch`

  **Must NOT do**:
  - Do NOT modify existing gateway client functions
  - Do NOT add `deleted_at` to any other type interface

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5, 6, 7, 8, 9
  - **Blocked By**: None

  **References**:
  - `dashboard/src/lib/types.ts:73-105` — Current `Archetype` interface (no `deleted_at` field)
  - `dashboard/src/lib/types.ts:107-116` — `Tenant` interface showing existing `deleted_at: string | null` pattern
  - `dashboard/src/lib/gateway.ts:231-256` — Existing `deleteRule()` function as pattern for DELETE calls
  - `dashboard/src/lib/gateway.ts:88-117` — Existing `patchArchetype()` as pattern for archetype-scoped calls

  **Acceptance Criteria**:

  ```
  Scenario: Types and gateway client compile
    Tool: Bash
    Steps:
      1. Run: grep "deleted_at" dashboard/src/lib/types.ts | head -3
      2. Assert output contains "deleted_at: string | null" in Archetype interface
      3. Run: grep "deleteArchetype\|restoreArchetype" dashboard/src/lib/gateway.ts
      4. Assert both functions are present
      5. Run: cd dashboard && npx tsc --noEmit
      6. Assert exit code 0
    Expected Result: Types updated and client functions added
    Evidence: .sisyphus/evidence/task-4-types-gateway.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(dashboard): add Checkbox component and archetype delete types`
  - Files: `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts`

- [x] 5. DELETE + Restore API Routes

  **What to do**:
  - Import `ArchetypeRepository` in `src/gateway/routes/admin-archetypes.ts`
  - Instantiate `new ArchetypeRepository(prisma)` alongside existing logger/prisma
  - Add `router.delete('/admin/tenants/:tenantId/archetypes/:archetypeId', requireAdminKey, ...)`:
    - Validate params with `ArchetypeParamSchema`
    - Call `repo.softDelete(archetypeId, tenantId)`
    - On success: return `200` with `{ id, deleted_at }`
    - On "not found": return `404`
    - On "active tasks": return `409` with `{ error: 'ACTIVE_TASKS', message: 'Cannot delete: N active task(s)', activeTaskCount: N }`
  - Add `router.post('/admin/tenants/:tenantId/archetypes/:archetypeId/restore', requireAdminKey, ...)`:
    - Validate params with `ArchetypeParamSchema`
    - Call `repo.restore(archetypeId, tenantId)`
    - On success: return `200` with full archetype
    - On "not found": return `404`
    - On collision: return `409` with `{ error: 'CONFLICT', message: '...' }`
  - Follow the exact pattern from `src/gateway/routes/admin-tenants.ts` lines 116-157

  **Must NOT do**:
  - Do NOT add a bulk delete endpoint
  - Do NOT modify existing POST (create) or PATCH (update) routes
  - Do NOT add `deleted_at` filtering to existing routes — that's handled by PostgREST queries in the dashboard

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Tasks 7, 8, 9, 10
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/gateway/routes/admin-tenants.ts:116-157` — **Exact pattern**: DELETE (lines 116-134) and restore (lines 136-157) route handlers
  - `src/gateway/routes/admin-archetypes.ts:20-22` — `ArchetypeParamSchema` (already exists for PATCH route — reuse for DELETE and restore)
  - `src/gateway/routes/admin-archetypes.ts:104-107` — Router factory pattern: `adminArchetypesRoutes(opts)` with PrismaClient injection
  - `src/gateway/server.ts:178` — Where routes are registered: `app.use(adminArchetypesRoutes({ prisma }))`
  - `src/gateway/services/archetype-repository.ts` — New repository from Task 2

  **Acceptance Criteria**:

  ```
  Scenario: Delete an archetype (happy path)
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700, test archetype exists
    Steps:
      1. Find a test archetype: curl -s "http://localhost:54331/archetypes?tenant_id=eq.00000000-0000-0000-0000-000000000003&role_name=eq.qa-patch-test&limit=1" | jq -r '.[0].id'
      2. DELETE it: curl -s -w "\n%{http_code}" -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/$ID"
      3. Assert HTTP status is 200
      4. Assert response body contains "deleted_at" with non-null ISO timestamp
    Expected Result: 200 with { id: "...", deleted_at: "2026-..." }
    Evidence: .sisyphus/evidence/task-5-delete-happy.txt

  Scenario: Delete archetype with active tasks returns 409
    Tool: Bash (curl + psql)
    Preconditions: Gateway running, archetype with non-terminal task exists
    Steps:
      1. Find an archetype with active tasks, or create a test task in "Executing" state via psql
      2. Attempt DELETE: curl -s -w "\n%{http_code}" -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/archetypes/$ID"
      3. Assert HTTP status is 409
      4. Assert response contains "ACTIVE_TASKS"
    Expected Result: 409 with { error: "ACTIVE_TASKS", activeTaskCount: N }
    Evidence: .sisyphus/evidence/task-5-delete-active-guard.txt

  Scenario: Restore a deleted archetype
    Tool: Bash (curl)
    Steps:
      1. Use the archetype deleted in the happy path scenario
      2. POST restore: curl -s -w "\n%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/archetypes/$ID/restore"
      3. Assert HTTP status is 200
      4. Assert response body has "deleted_at": null
    Expected Result: 200 with full archetype, deleted_at is null
    Evidence: .sisyphus/evidence/task-5-restore-happy.txt

  Scenario: Restore with role_name collision returns 409
    Tool: Bash (curl + psql)
    Steps:
      1. Create two archetypes with the same role_name (one active, one soft-deleted via psql)
      2. Attempt restore on the deleted one: POST .../restore
      3. Assert HTTP status is 409
      4. Assert response contains "CONFLICT"
    Expected Result: 409 with { error: "CONFLICT" }
    Evidence: .sisyphus/evidence/task-5-restore-conflict.txt
  ```

  **Commit**: YES
  - Message: `feat(gateway): add DELETE and restore endpoints for archetypes`
  - Files: `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Patch All 7 PostgREST Query Sites

  **What to do**:
  Add `deleted_at: 'is.null'` to the query params in ALL 7 PostgREST fetch calls for archetypes:
  1. `dashboard/src/panels/employees/EmployeeList.tsx` line ~101 — add `deleted_at: 'is.null'` to the `postgrestFetch` params (this one will later be conditionally removed by the "show deleted" toggle in Task 9)
  2. `dashboard/src/panels/employees/EditEmployeePage.tsx` line ~33
  3. `dashboard/src/panels/employees/EmployeeDetail.tsx` line ~695
  4. `dashboard/src/panels/employees/TriggerEmployeePage.tsx` line ~94
  5. `dashboard/src/panels/trigger/TriggerPanel.tsx` line ~57
  6. `dashboard/src/panels/rules/RulesPanel.tsx` line ~724
  7. `dashboard/src/panels/tenants/TenantOverview.tsx` line ~165 — this is highest risk because it currently has NO status filter at all

  **Must NOT do**:
  - Do NOT change query structure beyond adding the `deleted_at` filter
  - Do NOT add `deleted_at` filtering to task queries or any non-archetype queries

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 4

  **References**:
  - `dashboard/src/panels/employees/EmployeeList.tsx:98-106` — Primary fetch with `status: 'neq.superseded'` — add `deleted_at: 'is.null'` alongside
  - `dashboard/src/panels/tenants/TenantOverview.tsx:165` — `postgrestFetch<Archetype>('archetypes', { tenant_id: ... })` — no existing filters, add `deleted_at: 'is.null'`
  - `dashboard/src/lib/postgrest.ts` — `postgrestFetch` helper accepts flat params object — `deleted_at: 'is.null'` follows the same pattern as `status: 'neq.superseded'`

  **Acceptance Criteria**:

  ```
  Scenario: All 7 query sites have deleted_at filter
    Tool: Bash (grep)
    Steps:
      1. Run: grep -rn "deleted_at.*is\.null" dashboard/src/panels/ | wc -l
      2. Assert count is >= 7
    Expected Result: All 7 files contain the deleted_at filter
    Evidence: .sisyphus/evidence/task-6-query-sites.txt

  Scenario: Dashboard hides soft-deleted archetype
    Tool: Bash (curl + psql)
    Steps:
      1. Soft-delete a test archetype via psql: UPDATE archetypes SET deleted_at = NOW() WHERE role_name = 'qa-patch-test' AND tenant_id = '00000000-0000-0000-0000-000000000003' LIMIT 1
      2. Query PostgREST with filter: curl -s "http://localhost:54331/archetypes?tenant_id=eq.00000000-0000-0000-0000-000000000003&deleted_at=is.null" | jq '[.[] | .role_name]'
      3. Assert 'qa-patch-test' is NOT in the list
    Expected Result: Deleted archetype excluded from filtered query
    Evidence: .sisyphus/evidence/task-6-filter-works.txt
  ```

  **Commit**: YES (groups with Task 7)
  - Message: `feat(dashboard): add delete button and filter deleted archetypes`

- [x] 7. Individual Delete Button + Confirmation Dialog

  **What to do**:
  - Add a "Delete" button in the Actions column of each row in `EmployeeList.tsx` — red/destructive variant, positioned after existing Trigger/Dry Run buttons
  - Use the existing `Dialog` component (`dashboard/src/components/ui/dialog.tsx`) for delete confirmation
  - Confirmation dialog text: "Delete {role_name}?" with description "This employee will be soft-deleted. You can restore it later from the 'Show deleted' view." and two buttons: "Cancel" (secondary) and "Delete" (destructive)
  - On confirm: call `deleteArchetype(tenantId, archetype.id)` from `gateway.ts`
  - Handle loading state (disable button, show "Deleting..." text) and error toast
  - On success: `toast.success('Employee deleted')` and `refresh()` the list
  - Show delete button for BOTH active and draft archetypes (not just active)
  - The delete button should also appear on the `EmployeeDetail.tsx` page header (next to Trigger/Dry Run buttons) — use the same Dialog pattern

  **Must NOT do**:
  - Do NOT install a new AlertDialog component — use existing `Dialog`
  - Do NOT add optimistic UI — rely on `refresh()` from `usePoll`
  - Do NOT add undo toast — restore capability covers recovery

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 4, 5

  **References**:
  - `dashboard/src/panels/employees/EmployeeList.tsx:341-371` — Existing Actions column with Trigger/Dry Run buttons
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:840-877` — Detail page header with Trigger/Dry Run/Webhook buttons
  - `dashboard/src/components/ui/dialog.tsx` — Dialog component (DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter)
  - `dashboard/src/lib/gateway.ts` — New `deleteArchetype()` function from Task 4
  - `dashboard/src/panels/employees/EmployeeList.tsx:111-131` — Existing `handleTrigger` pattern for async action with loading state and toast

  **Acceptance Criteria**:

  ```
  Scenario: Delete button appears and opens confirmation dialog
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees?tenant=00000000-0000-0000-0000-000000000003
      2. Enter admin API key if prompted
      3. Locate a test employee row (e.g., "qa-patch-test")
      4. Click the "Delete" button in its Actions column
      5. Assert a Dialog appears with text containing "Delete qa-patch-test?"
      6. Assert "Cancel" and "Delete" buttons are visible in the dialog
    Expected Result: Confirmation dialog opens with correct text and buttons
    Evidence: .sisyphus/evidence/task-7-delete-dialog.png

  Scenario: Confirming delete removes employee from list
    Tool: Playwright
    Preconditions: API endpoint from Task 5 is deployed and running
    Steps:
      1. Open delete confirmation dialog for "qa-patch-test" (from previous scenario)
      2. Click the "Delete" button in the dialog
      3. Wait for toast "Employee deleted" to appear
      4. Assert "qa-patch-test" no longer appears in the table
    Expected Result: Employee disappears from list after deletion
    Evidence: .sisyphus/evidence/task-7-delete-confirmed.png

  Scenario: Cancel does not delete
    Tool: Playwright
    Steps:
      1. Open delete confirmation dialog for any employee
      2. Click "Cancel"
      3. Assert employee still appears in the list
    Expected Result: No deletion occurs
    Evidence: .sisyphus/evidence/task-7-delete-cancelled.png
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `feat(dashboard): add delete button and filter deleted archetypes`
  - Files: `dashboard/src/panels/employees/EmployeeList.tsx`, `dashboard/src/panels/employees/EmployeeDetail.tsx`

- [x] 8. Bulk Delete — Checkboxes + "Delete Selected" Toolbar

  **What to do**:
  - Add a Checkbox (from Task 3) in a new first column of the `EmployeeList` table — one per row + a "select all" checkbox in the header
  - Track selected archetype IDs in state: `const [selected, setSelected] = useState<Set<string>>(new Set())`
  - When any checkboxes are checked, show a floating toolbar/banner above the table: "{N} selected" + "Delete Selected" button (destructive variant) + "Clear selection" link
  - "Delete Selected" opens a confirmation Dialog: "Delete {N} employees?" with list of role_names, "Cancel" and "Delete All" buttons
  - On confirm: call `deleteArchetype()` sequentially for each selected ID (NOT a bulk API call). Show progress: "Deleting 3 of 5..."
  - On completion: `toast.success('{N} employees deleted')`, clear selection, `refresh()`
  - If any individual delete fails (e.g., active tasks), show error toast for that specific employee but continue with the rest
  - "Select all" checkbox should only select visible/filtered employees, not all employees

  **Must NOT do**:
  - Do NOT create a bulk delete API endpoint
  - Do NOT use optimistic UI — wait for all deletes to complete, then refresh
  - Do NOT allow selecting the "select all" checkbox to select employees across pages (if pagination exists)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 7

  **References**:
  - `dashboard/src/components/ui/checkbox.tsx` — New Checkbox component from Task 3
  - `dashboard/src/panels/employees/EmployeeList.tsx:272-378` — Current table structure where checkbox column needs to be added
  - `dashboard/src/panels/employees/EmployeeList.tsx:239-243` — `filteredArchetypes` array — "select all" should use this, not raw `archetypes`
  - `dashboard/src/components/ui/dialog.tsx` — Confirmation dialog (same as Task 7)
  - `dashboard/src/lib/gateway.ts` — `deleteArchetype()` function for sequential calls

  **Acceptance Criteria**:

  ```
  Scenario: Checkboxes appear and selection works
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees?tenant=00000000-0000-0000-0000-000000000003
      2. Assert checkbox exists in each table row
      3. Click checkboxes for 2 different employees
      4. Assert toolbar appears with "2 selected" text
      5. Assert "Delete Selected" button is visible
    Expected Result: Selection UI works correctly
    Evidence: .sisyphus/evidence/task-8-bulk-select.png

  Scenario: Bulk delete removes selected employees
    Tool: Playwright
    Preconditions: At least 2 test employees exist (e.g., qa-patch-test-conflict, qa-t6-no-status)
    Steps:
      1. Select 2 test employees via checkboxes
      2. Click "Delete Selected"
      3. Assert confirmation dialog shows "Delete 2 employees?"
      4. Click "Delete All" in the dialog
      5. Wait for success toast
      6. Assert both employees no longer appear in the table
    Expected Result: All selected employees deleted
    Evidence: .sisyphus/evidence/task-8-bulk-delete-done.png

  Scenario: Select all selects only filtered employees
    Tool: Playwright
    Steps:
      1. Type "qa" in the search box (filters to only qa-* employees)
      2. Click the "select all" header checkbox
      3. Assert only the visible qa-* employees are selected (not hidden ones)
    Expected Result: Select all respects current filter
    Evidence: .sisyphus/evidence/task-8-select-all-filtered.png
  ```

  **Commit**: YES (groups with Task 9)
  - Message: `feat(dashboard): add bulk delete and show-deleted toggle with restore`

- [ ] 9. "Show Deleted" Toggle + Restore Button

  **What to do**:
  - Add a "Show deleted" option to the existing status filter dropdown in `EmployeeList.tsx` — add a new `SelectItem` value `'deleted'` that when selected, changes the PostgREST query to include `deleted_at: 'not.is.null'` (showing ONLY deleted) instead of `deleted_at: 'is.null'`
  - Alternatively, add a simpler approach: a toggle/checkbox "Include deleted" that when enabled, removes the `deleted_at: 'is.null'` filter and also adds `deleted_at: 'not.is.null'` as an OR condition. **Recommended approach**: Add `'deleted'` as a fourth option in the status dropdown (`All | Active | Draft | Deleted`) — this is simpler and consistent with the existing filter UX
  - When viewing deleted employees:
    - Rows should have a visual indicator — muted/dimmed row with a `Badge` showing "Deleted" (use gray/red styling)
    - Show the `deleted_at` timestamp in a tooltip or secondary text
    - Replace the "Delete" action button with a "Restore" button (green/success variant)
    - Hide Trigger/Dry Run buttons for deleted employees
  - "Restore" button: call `restoreArchetype(tenantId, archetype.id)` from `gateway.ts`
  - On success: `toast.success('Employee restored')` and `refresh()`
  - On 409 collision: `toast.error('Cannot restore: role name already taken by an active employee')`

  **Must NOT do**:
  - Do NOT create a separate `/deleted-employees` page
  - Do NOT add a "recycle bin" concept — this is just a filter view
  - Do NOT show deleted employees in the default "All" view — they only appear when "Deleted" is selected

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 10)
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 6

  **References**:
  - `dashboard/src/panels/employees/EmployeeList.tsx:257-270` — Existing status filter dropdown (Select with All/Active/Draft)
  - `dashboard/src/panels/employees/EmployeeList.tsx:98-106` — `fetchArchetypes` callback with PostgREST params — modify to conditionally include/exclude `deleted_at` filter based on status selection
  - `dashboard/src/panels/employees/EmployeeList.tsx:54-81` — `StatusBadge` component — add a "Deleted" variant
  - `dashboard/src/lib/gateway.ts` — New `restoreArchetype()` function from Task 4

  **Acceptance Criteria**:

  ```
  Scenario: "Deleted" option appears in status filter
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees?tenant=00000000-0000-0000-0000-000000000003
      2. Click the status filter dropdown
      3. Assert options include: All, Active, Draft, Deleted
    Expected Result: Four filter options available
    Evidence: .sisyphus/evidence/task-9-filter-options.png

  Scenario: Selecting "Deleted" shows soft-deleted employees
    Tool: Playwright
    Preconditions: At least one archetype is soft-deleted (from previous tasks)
    Steps:
      1. Select "Deleted" from the status filter
      2. Assert the table shows only deleted employees
      3. Assert each row has a "Deleted" badge
      4. Assert "Restore" button appears instead of "Trigger"/"Dry Run"
    Expected Result: Deleted employees visible with restore action
    Evidence: .sisyphus/evidence/task-9-deleted-view.png

  Scenario: Restore brings employee back
    Tool: Playwright
    Steps:
      1. With "Deleted" filter active, find a deleted employee
      2. Click "Restore" button
      3. Wait for toast "Employee restored"
      4. Switch filter to "All"
      5. Assert the restored employee appears in the active list
    Expected Result: Employee restored and visible in default view
    Evidence: .sisyphus/evidence/task-9-restore-success.png
  ```

  **Commit**: YES (groups with Task 8)
  - Message: `feat(dashboard): add bulk delete and show-deleted toggle with restore`
  - Files: `dashboard/src/panels/employees/EmployeeList.tsx`

- [ ] 10. Vitest Tests for DELETE + Restore Endpoints

  **What to do**:
  - Create `src/gateway/routes/__tests__/admin-archetypes-delete.test.ts`
  - Follow the existing test pattern in `admin-archetypes.test.ts` — Express app setup with `adminArchetypesRoutes({ prisma })`, `supertest` for HTTP calls
  - Test cases:
    1. **DELETE happy path**: Create archetype → DELETE → assert 200, `deleted_at` is not null
    2. **DELETE not found**: DELETE non-existent UUID → assert 404
    3. **DELETE idempotent**: DELETE same archetype twice → both return 200
    4. **DELETE active-task guard**: Create archetype + task in "Executing" → DELETE → assert 409, `error: 'ACTIVE_TASKS'`
    5. **DELETE with terminal tasks only**: Create archetype + task in "Done" → DELETE → assert 200 (terminal tasks don't block)
    6. **Restore happy path**: DELETE archetype → POST restore → assert 200, `deleted_at` is null
    7. **Restore not found**: POST restore on non-existent UUID → assert 404
    8. **Restore idempotent**: POST restore on non-deleted archetype → assert 200
    9. **Restore collision**: Create two archetypes with same role_name, delete one, POST restore → assert 409

  **Must NOT do**:
  - Do NOT modify existing test files
  - Do NOT add tests for Create or Update endpoints (those already have tests)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/gateway/routes/__tests__/admin-archetypes.test.ts` — **Exact test setup pattern**: Express app, Prisma mock/real, `makeArchetype` helper, supertest assertions
  - `src/gateway/routes/__tests__/admin-archetypes-create.test.ts` — Additional test patterns for archetype routes
  - `src/gateway/services/archetype-repository.ts` — Repository being tested (from Task 2)

  **Acceptance Criteria**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/gateway/routes/__tests__/admin-archetypes-delete.test.ts
      2. Assert all 9 test cases pass
      3. Assert 0 failures
    Expected Result: 9 tests, 9 pass, 0 fail
    Evidence: .sisyphus/evidence/task-10-test-results.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert no new failures beyond pre-existing ones (container-boot.test.ts, inngest-serve.test.ts)
    Expected Result: No regressions
    Evidence: .sisyphus/evidence/task-10-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(gateway): add tests for archetype delete and restore endpoints`
  - Files: `src/gateway/routes/__tests__/admin-archetypes-delete.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [ ] 11. Notify Completion via Telegram

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "employee-crud-delete complete — All tasks done. Come back to review results."`
  - Kill any tmux sessions created during execution

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Final Verification Wave)
  - **Blocks**: None
  - **Blocked By**: F1, F2, F3, F4

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for UI)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (delete from list, show deleted, restore, bulk delete). Test edge cases: delete already-deleted, restore collision, delete with active tasks. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task(s) | Commit Message                                                          | Files                                                                                                                                                                                   | Pre-commit           |
| ------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1       | `feat(db): add deleted_at column to archetypes for soft-delete`         | `prisma/schema.prisma`, `prisma/migrations/...`                                                                                                                                         | `pnpm build`         |
| 2       | `feat(gateway): add ArchetypeRepository with soft-delete and restore`   | `src/gateway/services/archetype-repository.ts`                                                                                                                                          | `pnpm build`         |
| 3, 4    | `feat(dashboard): add Checkbox component and archetype delete types`    | `dashboard/src/components/ui/checkbox.tsx`, `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts`                                                                                | `pnpm build`         |
| 5       | `feat(gateway): add DELETE and restore endpoints for archetypes`        | `src/gateway/routes/admin-archetypes.ts`                                                                                                                                                | `pnpm build`         |
| 6, 7    | `feat(dashboard): add delete button and filter deleted archetypes`      | `dashboard/src/panels/employees/*.tsx`, `dashboard/src/panels/rules/RulesPanel.tsx`, `dashboard/src/panels/tenants/TenantOverview.tsx`, `dashboard/src/panels/trigger/TriggerPanel.tsx` | `pnpm build`         |
| 8, 9    | `feat(dashboard): add bulk delete and show-deleted toggle with restore` | `dashboard/src/panels/employees/EmployeeList.tsx`                                                                                                                                       | `pnpm build`         |
| 10      | `test(gateway): add tests for archetype delete and restore endpoints`   | `src/gateway/routes/__tests__/admin-archetypes-delete.test.ts`                                                                                                                          | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Schema has deleted_at
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetypes" | grep deleted_at

# Delete endpoint works
curl -s -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/$TENANT/archetypes/$ID | jq .deleted_at

# Restore endpoint works
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/$TENANT/archetypes/$ID/restore | jq .deleted_at

# Tests pass
pnpm test -- --run
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] All 7 PostgREST query sites patched
- [ ] Dashboard shows delete button, bulk delete, show-deleted toggle
