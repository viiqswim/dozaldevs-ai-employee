# Global Model Catalog Migration + Slash Command

## TL;DR

> **Quick Summary**: Make the model catalog global (remove per-tenant scoping), move API routes to `/admin/model-catalog`, and create a slash command to add models from OpenRouter URLs.
>
> **Deliverables**:
>
> - Prisma migration: drop `tenant_id` from `model_catalog`, deduplicate rows, new unique on `model_id`
> - API routes moved from `/admin/tenants/:tenantId/model-catalog` to `/admin/model-catalog`
> - Dashboard updated to use global (non-tenant-scoped) catalog
> - `.opencode/command/v-add-openrouter-model.md` slash command
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 5 → Task 7

---

## Context

### Original Request

User wanted to recreate a lost slash command for adding OpenRouter models to the catalog. During planning, user identified that the model catalog being per-tenant makes no sense — model specs (pricing, speed, quality) are universal facts. Decision: fix the architecture first (global catalog), then build the command against the clean API.

### Interview Summary

**Key Discussions**:

- **Global catalog**: Fully global, no per-tenant overrides. One table, one set of routes, everyone sees everything.
- **Clean URL**: Move from `/admin/tenants/:tenantId/model-catalog` to `/admin/model-catalog`. No backward compat concern — only caller is our dashboard.
- **recommend-model**: Stays at `/admin/tenants/:tenantId/archetypes/recommend-model` (archetypes router). Only the DB query changes — it now searches the global catalog.
- **Slash command**: Project-level at `.opencode/command/v-add-openrouter-model.md`, scrapes 3 sources (API, perf page, AA leaderboard), single POST to `/admin/model-catalog`.
- **Deduplication**: Current DB has 6 rows (3 models × 2 tenants). Migration must deduplicate before adding new unique constraint.

**Research Findings**:

- Model selection engine (`matcher.ts`) already tenant-agnostic — zero changes needed
- Workers/PostgREST never query model_catalog — zero impact
- 7 files touch tenant_id in model-catalog context: 3 route files, 4 dashboard files, 1 test file, schema, seed
- OpenRouter API at `https://openrouter.ai/api/v1/models` (no auth, full model list)
- Performance page at `https://openrouter.ai/{org}/{model}/performance` (per-provider metrics)
- AA leaderboard at `https://artificialanalysis.ai/leaderboards/models` (Intelligence Index)

### Metis Review

**Identified Gaps** (addressed):

- DB backup mandatory before migration (AGENTS.md protocol)
- Tenant model back-relation `modelCatalog ModelCatalog[]` must also be removed from schema
- AGENTS.md + README.md admin API route tables need updating
- Old tenant-scoped URLs should 404 after migration
- `recommend-model` silent behavior change is intentional (global pool)
- Cross-tenant isolation test must be explicitly deleted (not left as false positive)

---

## Work Objectives

### Core Objective

Make the model catalog a global, tenant-free resource and create a slash command to add models from OpenRouter.

### Concrete Deliverables

- Prisma migration dropping `tenant_id` from `model_catalog`
- Updated seed data (3 rows instead of 6)
- 5 global API routes at `/admin/model-catalog`
- Updated dashboard (types, gateway client, pages)
- Rewritten tests (tenant isolation tests removed)
- `.opencode/command/v-add-openrouter-model.md` slash command
- Updated AGENTS.md + README.md

### Definition of Done

- [ ] `pnpm test -- --run` passes (1490+ tests, 0 failures)
- [ ] `pnpm build` succeeds with 0 TypeScript errors
- [ ] `pnpm lint` passes
- [ ] `curl /admin/model-catalog` returns global model list (no tenant_id in response)
- [ ] `curl /admin/tenants/:id/model-catalog` returns 404 (old routes gone)
- [ ] Dashboard model catalog page loads without errors using new URL
- [ ] Slash command dry-run succeeds against a known model
- [ ] AGENTS.md reflects new route paths

### Must Have

- Migration deduplicates rows BEFORE dropping column
- DB backup BEFORE migration (per AGENTS.md)
- All 5 CRUD routes at `/admin/model-catalog` (no tenant_id param)
- `recommend-model` and `archetype-generate` queries use global catalog
- Dashboard types, gateway, and pages updated
- Model-catalog tests rewritten (tenant isolation test removed)
- Slash command with 3 data sources + forbidden model check
- AGENTS.md + README.md route table updates

### Must NOT Have (Guardrails)

- No per-tenant model overrides or restrictions
- No changes to model selection engine (`matcher.ts`) — already tenant-agnostic
- No changes to `recommend-model` or `archetype-generate` route URLs (only query changes)
- No touching deprecated files
- No PATCH of existing catalog entries from the slash command (add-only)
- No abort on AA scraping failure (graceful degradation)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (update existing tests to match new schema/routes)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot
- **Schema**: Use Bash (psql) — verify table structure, row counts, constraints

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — schema foundation):
└── Task 1: DB backup + Prisma schema + migration + seed update [deep]

Wave 2 (After Wave 1 — route + dashboard changes, MAX PARALLEL):
├── Task 2: Model-catalog routes → /admin/model-catalog + tests [unspecified-high]
├── Task 3: Archetype routes — remove tenant_id from catalog queries [quick]
└── Task 4: Dashboard — types, gateway, pages [visual-engineering]

Wave 3 (After Wave 2 — command + docs, PARALLEL):
├── Task 5: AGENTS.md + README.md documentation updates [quick]
└── Task 6: Create slash command file [deep]

Wave 4 (After Wave 3):
└── Task 7: Dry-run command + edge case testing + notification [unspecified-high]

Critical Path: Task 1 → Task 2 → Task 6 → Task 7
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 2, 3, 4 | 1    |
| 2    | 1          | 5, 6    | 2    |
| 3    | 1          | 5       | 2    |
| 4    | 1          | 5       | 2    |
| 5    | 2, 3, 4    | 7       | 3    |
| 6    | 2          | 7       | 3    |
| 7    | 5, 6       | —       | 4    |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `deep`
- **Wave 2**: **3 tasks** — T2 → `unspecified-high`, T3 → `quick`, T4 → `visual-engineering`
- **Wave 3**: **2 tasks** — T5 → `quick`, T6 → `deep`
- **Wave 4**: **1 task** — T7 → `unspecified-high`

---

## TODOs

- [x] 1. DB Backup + Prisma Schema Migration + Seed Update

  **What to do**:

  **Step 1 — Database backup** (MANDATORY per AGENTS.md):

  ```bash
  TS=$(date "+%Y-%m-%d-%H%M")
  BACKUP_DIR="database-backups/$TS"
  mkdir -p "$BACKUP_DIR"
  docker exec shared-postgres pg_dump -U postgres -d ai_employee --format=plain > "$BACKUP_DIR/full-dump.sql"
  docker exec shared-postgres pg_dump -U postgres -d ai_employee -t model_catalog --data-only --inserts > "$BACKUP_DIR/model_catalog.sql"
  psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM model_catalog;"
  echo "Backup complete: $BACKUP_DIR"
  ```

  **Step 2 — Update Prisma schema** (`prisma/schema.prisma`):
  - In the `ModelCatalog` model (lines 541-575):
    - Remove `tenant_id String @db.Uuid` field (line 543)
    - Remove `tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Restrict)` (line 570)
    - Change `@@unique([tenant_id, model_id])` to `@@unique([model_id])` (line 572)
    - Remove `@@index([tenant_id])` (line 573)
  - In the `Tenant` model (around line 397):
    - Remove the `modelCatalog ModelCatalog[]` back-relation field

  **Step 3 — Create migration**:
  Run `pnpm prisma migrate dev --name make_model_catalog_global` — this generates the migration SQL automatically from the schema diff. Verify the generated SQL contains:
  1. Drop the FK constraint (`model_catalog_tenant_id_fkey`)
  2. Drop the tenant_id index (`model_catalog_tenant_id_idx`)
  3. Drop the composite unique index (`model_catalog_tenant_id_model_id_key`)
  4. Drop the `tenant_id` column
  5. Create new unique index on `model_id` alone

  **CRITICAL**: Before Prisma can drop the column and add the new unique constraint, duplicate `model_id` rows must be removed. The auto-generated migration will fail because 2 rows share the same `model_id` (one per tenant). You MUST manually add a deduplication step at the TOP of the generated migration SQL:

  ```sql
  -- Deduplicate: keep one row per model_id, delete the rest
  DELETE FROM "model_catalog" a USING "model_catalog" b
  WHERE a.ctid < b.ctid AND a.model_id = b.model_id;
  ```

  Add this BEFORE the auto-generated `ALTER TABLE ... DROP COLUMN "tenant_id"` line. Then re-run the migration: `pnpm prisma migrate dev`.

  **Step 4 — Update seed data** (`prisma/seed.ts`, around lines 4188-4295):
  - Remove the `TENANT_IDS` array or stop using it for the model catalog loop
  - Remove the outer `for (const tenantId of TENANT_IDS)` loop — seed each model ONCE, not once per tenant
  - Change the upsert `where` from `{ tenant_id_model_id: { tenant_id, model_id } }` to `{ model_id: entry.model_id }`
  - Remove `tenant_id: tenantId` from the `create` and `update` data
  - Update the log message from "3 models × 2 tenants" to "3 models (global)"

  **Step 5 — Verify**:

  ```bash
  # Confirm schema is clean
  psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d model_catalog" | grep tenant_id
  # Expected: no output

  # Confirm 3 rows (not 6)
  psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT model_id, display_name FROM model_catalog;"
  # Expected: 3 rows

  # Confirm unique constraint on model_id alone
  psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\di model_catalog*"
  # Expected: model_catalog_model_id_key (unique)

  # Confirm seed still works
  pnpm prisma db seed
  # Expected: success, "3 models (global)"
  ```

  **Must NOT do**:
  - Do not touch any route files — schema and seed only in this task
  - Do not modify matcher.ts or any model-selection files
  - Do not delete the backup after verifying — keep it permanently

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Schema migration with deduplication requires careful SQL ordering and verification
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Touches archetypes but this task is schema-only

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/migrations/20260522002458_add_model_catalog/migration.sql` — original migration that created the table with tenant_id (reference for understanding current constraints)
  - `prisma/seed.ts:4188-4295` — current seed loop that creates 3 models × 2 tenants

  **API/Type References**:
  - `prisma/schema.prisma:541-575` — ModelCatalog model with tenant_id, FK, unique, index
  - `prisma/schema.prisma:~397` — Tenant model with `modelCatalog ModelCatalog[]` back-relation

  **WHY Each Reference Matters**:
  - The original migration shows exact constraint names needed for the deduplication step
  - The seed file shows the double-loop pattern that must collapse to a single loop
  - The schema is the source of truth for what fields/relations to remove

  **Acceptance Criteria**:
  - [ ] Database backed up to `database-backups/` before any schema changes
  - [ ] `model_catalog` table has no `tenant_id` column
  - [ ] 3 rows in `model_catalog` (not 6)
  - [ ] Unique constraint exists on `model_id` alone
  - [ ] No FK to `tenants` table
  - [ ] `pnpm prisma db seed` succeeds with updated seed code
  - [ ] Tenant model has no `modelCatalog` back-relation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema migration verification
    Tool: Bash (psql)
    Preconditions: Migration has been run
    Steps:
      1. `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d model_catalog"` — verify no tenant_id column in output
      2. `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM model_catalog;"` — assert count = 3
      3. `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\di model_catalog*"` — assert unique index on model_id exists
      4. `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT model_id FROM model_catalog ORDER BY model_id;"` — assert 3 distinct model_ids
    Expected Result: Table has no tenant_id, 3 rows, unique on model_id
    Failure Indicators: tenant_id column still present, count != 3, missing unique index
    Evidence: .sisyphus/evidence/task-1-schema-verification.txt

  Scenario: Seed idempotency after migration
    Tool: Bash
    Preconditions: Migration complete
    Steps:
      1. `pnpm prisma db seed` — assert exits 0
      2. `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM model_catalog;"` — assert still 3 (not duplicated)
    Expected Result: Seed runs cleanly and maintains 3 rows
    Failure Indicators: Non-zero exit, row count changes, upsert key error
    Evidence: .sisyphus/evidence/task-1-seed-idempotency.txt
  ```

  **Commit**: YES
  - Message: `refactor(db): make model_catalog global — drop tenant_id`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`, `prisma/seed.ts`
  - Pre-commit: `pnpm prisma db seed`

- [x] 2. Move Model-Catalog Routes to /admin/model-catalog + Update Tests

  **What to do**:

  **Step 1 — Update route URLs** (`src/gateway/routes/admin-model-catalog.ts`):
  - Change all 5 route definitions from `/admin/tenants/:tenantId/model-catalog` to `/admin/model-catalog`:
    - `GET /admin/model-catalog` — list all models (line ~88)
    - `GET /admin/model-catalog/:id` — get single model (line ~120)
    - `POST /admin/model-catalog` — create model (line ~146)
    - `PATCH /admin/model-catalog/:id` — update model (line ~182)
    - `DELETE /admin/model-catalog/:id` — soft-delete model (line ~226)
  - Remove all `const tenantId = req.params.tenantId` or equivalent tenant extraction
  - Remove `tenant_id: tenantId` from ALL `where` clauses in `findMany`, `findFirst`
  - Remove `tenant_id: tenantId` from the `create` data object in the POST handler
  - Update the 409 conflict message (line ~173) from "A model with this model_id already exists for this tenant" to "A model with this model_id already exists"
  - Remove `tenantId` from any `select` or response filtering

  **Step 2 — Update server mount** (`src/gateway/server.ts`):
  - Verify the router is still correctly mounted. The mount point may need adjustment if routes were previously under a tenant-scoped prefix.

  **Step 3 — Update tests** (`src/gateway/routes/__tests__/admin-model-catalog.test.ts`):
  - Remove the `OTHER_TENANT_ID` constant (no longer needed)
  - Remove `tenant_id: TENANT_ID` from the `makeModelRow()` fixture
  - Update all test URLs from `/admin/tenants/${TENANT_ID}/model-catalog` to `/admin/model-catalog`
  - Update `where` clause assertions: remove `tenant_id: TENANT_ID` from expected `findMany`/`findFirst` args
  - Update `create` data assertions: remove `tenant_id: TENANT_ID` from expected `create` args
  - **DELETE** the cross-tenant isolation test entirely (the one testing OTHER_TENANT_ID → 404) — this concept no longer exists
  - Update the 409 conflict message assertion to match the new message

  **Step 4 — Verify**:

  ```bash
  pnpm test -- --run --reporter=verbose src/gateway/routes/__tests__/admin-model-catalog.test.ts
  # Expected: all tests pass

  # If gateway is running, verify routes respond:
  source .env
  curl -s "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq 'length'
  # Expected: 3
  ```

  **Must NOT do**:
  - Do not change the `recommend-model` or `archetype-generate` routes (those are Task 3)
  - Do not modify dashboard code
  - Do not add new test cases beyond updating existing ones

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Route refactoring with test rewriting requires careful attention to URL patterns and assertion updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-model-catalog.ts:88-255` — all 5 CRUD handlers with tenant_id usage
  - `src/gateway/routes/__tests__/admin-model-catalog.test.ts` — full test suite (306 lines, 18 tests)

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts:27-49` — `CreateModelCatalogBodySchema` (no tenant_id in body — it was injected server-side)
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey` middleware (still needed on new routes)

  **WHY Each Reference Matters**:
  - The route file is the primary artifact to modify — need exact line numbers for each handler
  - The test file must mirror route changes exactly or tests will fail
  - The Zod schema doesn't change (tenant_id was never in the request body) — confirms no body validation changes needed

  **Acceptance Criteria**:
  - [ ] All 5 routes respond at `/admin/model-catalog` (no `:tenantId` in URL)
  - [ ] No reference to `tenant_id` or `tenantId` in any model-catalog route handler
  - [ ] 409 conflict message does not mention "tenant"
  - [ ] All model-catalog tests pass
  - [ ] Cross-tenant isolation test is deleted (not just updated)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Global CRUD routes work
    Tool: Bash (curl)
    Preconditions: Gateway running, migration complete (Task 1)
    Steps:
      1. `source .env && curl -s -w "\n%{http_code}" "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY"` — assert 200, JSON array
      2. `source .env && curl -s -X POST "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"model_id":"test/global-model","display_name":"Test Global","provider":"test","context_window":4096,"input_cost_per_million":0.1,"output_cost_per_million":0.2,"supports_tools":false,"supports_structured_output":false}'` — assert 201
      3. Repeat same POST — assert 409, message does NOT contain "tenant"
      4. `curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY"` — assert 404 (old route gone)
    Expected Result: New routes work, old routes 404
    Failure Indicators: 404 on new routes, 200 on old routes, tenant in error message
    Evidence: .sisyphus/evidence/task-2-global-crud.txt

  Scenario: Tests pass after route changes
    Tool: Bash
    Preconditions: Route changes complete
    Steps:
      1. `pnpm test -- --run src/gateway/routes/__tests__/admin-model-catalog.test.ts` — assert 0 failures
      2. Verify no test references `OTHER_TENANT_ID` or "tenant isolation"
    Expected Result: All tests pass, no stale tenant isolation tests
    Failure Indicators: Test failures, grep finds tenant isolation references
    Evidence: .sisyphus/evidence/task-2-tests.txt
  ```

  **Commit**: YES
  - Message: `refactor(api): move model-catalog routes to /admin/model-catalog`
  - Files: `src/gateway/routes/admin-model-catalog.ts`, `src/gateway/server.ts`, `src/gateway/routes/__tests__/admin-model-catalog.test.ts`
  - Pre-commit: `pnpm test -- --run src/gateway/routes/__tests__/admin-model-catalog.test.ts`

- [x] 3. Remove tenant_id from Catalog Queries in Archetype Routes

  **What to do**:

  **Step 1 — Update admin-archetypes.ts** (`src/gateway/routes/admin-archetypes.ts`, line ~275-276):
  - In the `recommend-model` handler, change:
    ```ts
    // Before:
    const catalog = await prisma.modelCatalog.findMany({
      where: { tenant_id: tenantId, deleted_at: null, is_active: true },
    });
    // After:
    const catalog = await prisma.modelCatalog.findMany({
      where: { deleted_at: null, is_active: true },
    });
    ```
  - Do NOT change the route URL — it stays at `/admin/tenants/:tenantId/archetypes/recommend-model`

  **Step 2 — Update admin-archetype-generate.ts** (`src/gateway/routes/admin-archetype-generate.ts`, line ~44-46):
  - Same pattern — remove `tenant_id: tenantId` from the `findMany` where clause
  - Do NOT change the route URL

  **Step 3 — Verify**:

  ```bash
  # Confirm no tenant_id references remain in catalog queries
  grep -n "tenant_id.*modelCatalog\|modelCatalog.*tenant_id" src/gateway/routes/admin-archetypes.ts src/gateway/routes/admin-archetype-generate.ts
  # Expected: no output

  # Run related tests
  pnpm test -- --run src/gateway/routes/__tests__/admin-archetypes.test.ts
  ```

  **Must NOT do**:
  - Do not change route URLs for recommend-model or archetype-generate
  - Do not modify the model selection engine (matcher.ts, profiler.ts, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line change in each file — remove tenant_id from where clauses
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-archetypes.ts:275-276` — recommend-model catalog query
  - `src/gateway/routes/admin-archetype-generate.ts:44-46` — generate catalog query

  **WHY Each Reference Matters**:
  - These are the exact lines to modify — two surgical changes

  **Acceptance Criteria**:
  - [ ] `admin-archetypes.ts` catalog query has no `tenant_id` in where clause
  - [ ] `admin-archetype-generate.ts` catalog query has no `tenant_id` in where clause
  - [ ] Route URLs unchanged (still under `/admin/tenants/:tenantId/archetypes/...`)
  - [ ] Related tests pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Catalog queries are global
    Tool: Bash
    Preconditions: Task 1 complete (schema migration)
    Steps:
      1. `grep -n "tenant_id" src/gateway/routes/admin-archetypes.ts | grep -i "catalog\|model"` — assert no matches
      2. `grep -n "tenant_id" src/gateway/routes/admin-archetype-generate.ts | grep -i "catalog\|model"` — assert no matches
      3. `pnpm test -- --run src/gateway/routes/__tests__/admin-archetypes.test.ts` — assert 0 failures
    Expected Result: No tenant_id in catalog queries, tests pass
    Failure Indicators: grep finds tenant_id in catalog context, test failures
    Evidence: .sisyphus/evidence/task-3-archetype-routes.txt
  ```

  **Commit**: YES
  - Message: `refactor(api): remove tenant_id from catalog queries in archetype routes`
  - Files: `src/gateway/routes/admin-archetypes.ts`, `src/gateway/routes/admin-archetype-generate.ts`
  - Pre-commit: `pnpm test -- --run src/gateway/routes/__tests__/admin-archetypes.test.ts`

- [x] 4. Dashboard — Update Types, Gateway Client, and Pages

  **What to do**:

  **Step 1 — Update types** (`dashboard/src/lib/types.ts`):
  - Remove `tenant_id: string` from the `ModelCatalogEntry` interface (line ~369)
  - This will cause TypeScript errors in every file that references `tenant_id` on this type — use those errors to find all remaining references

  **Step 2 — Update gateway client** (`dashboard/src/lib/gateway.ts`, lines 326-358):
  - `listModelCatalog`: Remove `tenantId` parameter, change URL from `/admin/tenants/${tenantId}/model-catalog` to `/admin/model-catalog`
  - `createModelCatalogEntry`: Remove `tenantId` parameter, change URL, update `Omit<>` type to remove `'tenant_id'`
  - `updateModelCatalogEntry`: Remove `tenantId` parameter, change URL, update `Omit<>` type
  - `deleteModelCatalogEntry`: Remove `tenantId` parameter, change URL

  **Step 3 — Update ModelCatalogPage** (`dashboard/src/pages/ModelCatalogPage.tsx`):
  - Remove `tenantId` argument from all calls to the 4 gateway functions (~6 call sites)
  - Update `Omit<ModelCatalogEntry, ...>` type (line ~163) — remove `'tenant_id'` from the exclusion list
  - Check if `useTenant()` or `tenantId` is still used anywhere else on this page — if not, remove the import and call

  **Step 4 — Update EmployeeDetail** (`dashboard/src/panels/employees/EmployeeDetail.tsx`):
  - Remove `tenantId` argument from `listModelCatalog()` call (line ~85)

  **Step 5 — Verify**:

  ```bash
  # TypeScript compilation
  cd dashboard && npx tsc --noEmit
  # Expected: 0 errors

  # Full project build
  pnpm build
  # Expected: success
  ```

  **Must NOT do**:
  - Do not change any other dashboard pages or components
  - Do not refactor ModelCatalogPage component structure
  - Do not modify API route files (those are Tasks 2 and 3)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard/UI file changes requiring TypeScript type awareness
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/gateway.ts:326-358` — all 4 model-catalog gateway functions with tenantId params
  - `dashboard/src/pages/ModelCatalogPage.tsx` — 6 call sites passing tenantId

  **API/Type References**:
  - `dashboard/src/lib/types.ts:347-372` — `ModelCatalogEntry` interface with `tenant_id: string`
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:85` — `listModelCatalog(tenantId)` call

  **WHY Each Reference Matters**:
  - Removing `tenant_id` from the type interface first surfaces all downstream breakages via TypeScript errors
  - Gateway functions are the API boundary — their signatures changing cascades to all callers
  - EmployeeDetail is an easy-to-miss caller that also needs updating

  **Acceptance Criteria**:
  - [ ] `ModelCatalogEntry` interface has no `tenant_id` field
  - [ ] All 4 gateway functions take no `tenantId` parameter
  - [ ] All gateway function URLs point to `/admin/model-catalog`
  - [ ] `ModelCatalogPage.tsx` passes no `tenantId` to any gateway call
  - [ ] `EmployeeDetail.tsx` passes no `tenantId` to `listModelCatalog`
  - [ ] `pnpm build` succeeds with 0 TypeScript errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard compiles cleanly
    Tool: Bash
    Preconditions: Tasks 2, 3 complete (routes updated)
    Steps:
      1. `pnpm build` — assert exit 0
      2. `grep -rn "tenantId.*model-catalog\|model-catalog.*tenantId" dashboard/src/` — assert no matches
      3. `grep -rn "tenant_id" dashboard/src/lib/types.ts | grep -i model` — assert no matches
    Expected Result: Clean build, no stale tenant references in model-catalog context
    Failure Indicators: Build errors, grep finds tenant references
    Evidence: .sisyphus/evidence/task-4-dashboard-build.txt

  Scenario: Dashboard model catalog page loads
    Tool: Playwright
    Preconditions: Gateway running with new routes, dashboard dev server running
    Steps:
      1. Navigate to `http://localhost:7701/dashboard/models`
      2. Wait for model list to render
      3. Assert at least 3 rows visible in the model table
      4. Check browser console — assert 0 errors
      5. Check network tab — assert no requests to `/admin/tenants/*/model-catalog` (old URL pattern)
    Expected Result: Page loads models from global endpoint, no errors
    Failure Indicators: Empty table, console errors, requests to old tenant-scoped URL
    Evidence: .sisyphus/evidence/task-4-dashboard-page.png
  ```

  **Commit**: YES
  - Message: `refactor(dashboard): update model catalog to use global API`
  - Files: `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts`, `dashboard/src/pages/ModelCatalogPage.tsx`, `dashboard/src/panels/employees/EmployeeDetail.tsx`
  - Pre-commit: `pnpm build`

- [x] 5. Update AGENTS.md + README.md Documentation

  **What to do**:

  **Step 1 — Update AGENTS.md**:
  - **Admin API section**: Replace all model-catalog route entries:
    - `GET /admin/tenants/:tenantId/model-catalog` → `GET /admin/model-catalog`
    - `POST /admin/tenants/:tenantId/model-catalog` → `POST /admin/model-catalog`
    - `PATCH /admin/tenants/:tenantId/model-catalog/:id` → `PATCH /admin/model-catalog/:id`
    - `DELETE /admin/tenants/:tenantId/model-catalog/:id` → `DELETE /admin/model-catalog/:id`
  - **"Seeded catalog models" note**: Update to clarify the catalog is now global (not "both tenants")
  - **Model selection section**: If it mentions per-tenant catalog, update to say global catalog
  - **curl examples**: Update any model-catalog curl examples to use the new URL pattern (no tenantId)

  **Step 2 — Update README.md**:
  - Update any model-catalog API endpoint references in route tables
  - Update any curl examples that use the old tenant-scoped URL

  **Must NOT do**:
  - Do not update any other AGENTS.md sections unrelated to model-catalog
  - Do not add documentation about the slash command (that's just a command file, not a feature to document)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Find-and-replace in 2 documentation files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Admin API section, model catalog references
  - `README.md` — API endpoint tables

  **Acceptance Criteria**:
  - [ ] No references to `/admin/tenants/:tenantId/model-catalog` in AGENTS.md
  - [ ] No references to `/admin/tenants/:tenantId/model-catalog` in README.md
  - [ ] New `/admin/model-catalog` endpoints documented
  - [ ] Seeded catalog description says "global" not "per-tenant" or "both tenants"

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Documentation accuracy
    Tool: Bash
    Preconditions: Tasks 2-4 complete
    Steps:
      1. `grep -c "tenants/:tenantId/model-catalog\|tenants/\$TENANT.*/model-catalog" AGENTS.md` — assert 0
      2. `grep -c "tenants/:tenantId/model-catalog" README.md` — assert 0
      3. `grep -c "/admin/model-catalog" AGENTS.md` — assert ≥ 1
    Expected Result: No stale tenant-scoped URLs, new global URLs present
    Failure Indicators: Stale URLs found, new URLs missing
    Evidence: .sisyphus/evidence/task-5-docs.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md and README.md for global model catalog routes`
  - Files: `AGENTS.md`, `README.md`
  - Pre-commit: N/A

- [x] 6. Create the Slash Command File

  **What to do**:
  Write `.opencode/command/v-add-openrouter-model.md` — a project-level OpenCode slash command. Create the `.opencode/command/` directory if it doesn't exist.

  The command instructs the executing agent to perform these steps when invoked with an OpenRouter URL:

  **Step 1 — Parse the URL**:
  - Accept argument like `https://openrouter.ai/openai/gpt-oss-120b/performance`
  - Extract `{org}/{model}` (e.g., `openai/gpt-oss-120b`) by stripping the domain and optional trailing path segments (`/performance`, `/benchmarks`)
  - Construct `model_id` = `{org}/{model}`

  **Step 2 — Forbidden model check**:
  - Check if model_id matches forbidden patterns from AGENTS.md:
    - `anthropic/claude-sonnet-*`
    - `anthropic/claude-opus-*`
    - `openai/gpt-4o` (exact)
    - `openai/gpt-4o-mini` (exact)
  - If match → abort with clear error message

  **Step 3 — Preflight checks**:
  - `curl -sf http://localhost:7700/health` — verify gateway is running
  - `source .env && [ -n "$ADMIN_API_KEY" ]` — verify API key is set

  **Step 4 — Fetch OpenRouter API data**:
  - `curl -s https://openrouter.ai/api/v1/models` — no auth required
  - Filter JSON array for entry where `id` matches the extracted `model_id`
  - If not found → abort with "Model not found in OpenRouter API"
  - Extract and transform fields:

  | API field                                              | Catalog field                | Transform               |
  | ------------------------------------------------------ | ---------------------------- | ----------------------- |
  | `id`                                                   | `model_id`                   | direct                  |
  | `name`                                                 | `display_name`               | direct                  |
  | `id.split('/')[0]`                                     | `provider`                   | extract org before `/`  |
  | `description`                                          | `description`                | truncate to 500 chars   |
  | `context_length`                                       | `context_window`             | direct                  |
  | `pricing.prompt`                                       | `input_cost_per_million`     | parse float × 1,000,000 |
  | `pricing.completion`                                   | `output_cost_per_million`    | parse float × 1,000,000 |
  | `supported_parameters` includes `"tools"`              | `supports_tools`             | boolean                 |
  | `supported_parameters` includes `"structured_outputs"` | `supports_structured_output` | boolean                 |
  | `pricing.prompt === "0"`                               | `is_free`                    | boolean                 |

  **Step 5 — Scrape OpenRouter performance page** (Playwright):
  - Navigate to `https://openrouter.ai/{org}/{model}/performance`
  - Extract per-provider metrics, use BEST values:
    - **Throughput**: highest tok/s across all providers
    - **Latency**: lowest seconds across all providers
    - **Tool Call Error Rate**: lowest % → divide by 100 for decimal
    - **Structured Output Error Rate**: lowest % → divide by 100 for decimal
  - If page fails → set all 4 fields to null, log warning, continue

  **Step 6 — Scrape Artificial Analysis leaderboard** (Playwright):
  - Navigate to `https://artificialanalysis.ai/leaderboards/models`
  - Find filter input: `input[placeholder="Filter, e.g. GPT, Meta"]`
  - Type model name, wait for table to filter
  - Extract **Intelligence Index** → `quality_index`
  - If no results or page fails → set `quality_index` to null, log warning, continue
  - **CRITICAL**: This step must NEVER abort the command. AA is best-effort.

  **Step 7 — Build the POST body**:
  - Combine all gathered data into JSON matching `CreateModelCatalogBodySchema`
  - Omit any field that is null (don't send null values)
  - Add `notes: "Added via /v-add-openrouter-model on YYYY-MM-DD"`

  **Step 8 — POST to global catalog**:

  ```bash
  source .env
  curl -s -X POST "http://localhost:7700/admin/model-catalog" \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    -d '<JSON body>'
  ```

  - 201 → success. 409 → "already exists" (not an error). Other → log error.

  **Step 9 — Summary output**:
  - Print table showing: model ID, display name, all fields (populated vs null), POST result (✅ Created / ⚠️ Already Exists / ❌ Failed)

  **Command file structure**:
  - Markdown header with command description
  - `<argument>` tag for the OpenRouter URL
  - Steps 1-9 as clear agent instructions
  - Field mapping table embedded
  - All forbidden model patterns listed
  - All Playwright selectors documented

  **Must NOT do**:
  - Do not create TypeScript scripts — the command uses Bash (curl) and Playwright MCP directly
  - Do not hardcode tenant IDs — the catalog is now global, single POST
  - Do not modify any source code

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-step instruction design with API references, Playwright selectors, and field transformations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2 (needs to know the final route URL)

  **References**:

  **Pattern References**:
  - `/Users/victordozal/.config/opencode/command/v-code-commit.md` — existing slash command structure (header, argument tag, instructions)
  - `/Users/victordozal/.config/opencode/command/v-ticket-analyze.md` — another command example showing argument handling

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts:27-49` — `CreateModelCatalogBodySchema` (required + optional fields)
  - `src/gateway/routes/admin-model-catalog.ts` — POST handler at `/admin/model-catalog` (after Task 2)

  **External References**:
  - OpenRouter API: `https://openrouter.ai/api/v1/models`
  - Performance page: `https://openrouter.ai/{org}/{model}/performance`
  - AA leaderboard: `https://artificialanalysis.ai/leaderboards/models` (filter: `input[placeholder="Filter, e.g. GPT, Meta"]`)

  **WHY Each Reference Matters**:
  - Existing commands show the markdown structure OpenCode expects
  - The Zod schema defines exact field names/types the POST body must match
  - External URLs are the scraping targets with known selectors

  **Acceptance Criteria**:
  - [ ] File exists at `.opencode/command/v-add-openrouter-model.md`
  - [ ] Proper OpenCode command structure (header, argument tag, instructions)
  - [ ] All 9 steps documented
  - [ ] Field mapping table embedded
  - [ ] Forbidden model patterns listed
  - [ ] AA scraping documented as gracefully degradable
  - [ ] Uses `/admin/model-catalog` (global endpoint, no tenant ID)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Command file structure validation
    Tool: Bash
    Preconditions: Task 6 complete
    Steps:
      1. `ls -la .opencode/command/v-add-openrouter-model.md` — assert file exists
      2. `grep -c "anthropic/claude-sonnet" .opencode/command/v-add-openrouter-model.md` — assert ≥ 1
      3. `grep -c "anthropic/claude-opus" .opencode/command/v-add-openrouter-model.md` — assert ≥ 1
      4. `grep -c "/admin/model-catalog" .opencode/command/v-add-openrouter-model.md` — assert ≥ 1
      5. `grep -c "artificialanalysis.ai" .opencode/command/v-add-openrouter-model.md` — assert ≥ 1
      6. `grep -c "quality_index" .opencode/command/v-add-openrouter-model.md` — assert ≥ 1
      7. Verify NO reference to `/admin/tenants/` in the command file
    Expected Result: File exists with all required content, no tenant-scoped URLs
    Failure Indicators: File missing, forbidden patterns missing, old URL present
    Evidence: .sisyphus/evidence/task-6-structure.txt

  Scenario: Field mapping completeness
    Tool: Bash
    Preconditions: Task 6 complete
    Steps:
      1. For each required field (`model_id`, `display_name`, `provider`, `context_window`, `input_cost_per_million`, `output_cost_per_million`, `supports_tools`, `supports_structured_output`), grep the command file
      2. For each enrichment field (`throughput_tokens_per_sec`, `latency_seconds`, `tool_call_error_rate`, `structured_output_error_rate`, `quality_index`), grep the command file
    Expected Result: All 13 fields appear in the command file
    Failure Indicators: Any field missing
    Evidence: .sisyphus/evidence/task-6-fields.txt
  ```

  **Commit**: YES
  - Message: `feat(dx): add /v-add-openrouter-model slash command for model catalog`
  - Files: `.opencode/command/v-add-openrouter-model.md`
  - Pre-commit: N/A

- [x] 7. Dry-Run Command + Edge Case Testing + Notification

  **What to do**:

  **Step 1 — Dry-run against known model**:
  Execute the command end-to-end against `https://openrouter.ai/openai/gpt-oss-120b/performance`:
  1. Parse URL → extract `openai/gpt-oss-120b`
  2. Forbidden check → should pass
  3. Preflight → verify gateway is running
  4. Fetch API data → find model in results
  5. Scrape performance page → extract metrics
  6. Scrape AA leaderboard → extract Intelligence Index
  7. Build POST body
  8. POST to `/admin/model-catalog`
  9. Print summary

  Verify the model exists in the catalog:

  ```bash
  source .env
  curl -s "http://localhost:7700/admin/model-catalog" \
    -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[] | select(.model_id == "openai/gpt-oss-120b") | {model_id, display_name, quality_index, throughput_tokens_per_sec}'
  ```

  **Step 2 — Edge case tests**:
  1. **Forbidden model**: Trace with `https://openrouter.ai/anthropic/claude-sonnet-4/performance` → should abort before any API calls
  2. **Non-existent model**: Try `https://openrouter.ai/fake-org/nonexistent-model` → should abort with "Model not found"
  3. **URL format variants**: Verify instructions handle all 3 formats (base, /performance, /benchmarks)
  4. **Duplicate model (409)**: Run the command again for the same model → should report "Already Exists" not error

  **Step 3 — Fix any issues**:
  If edge cases reveal unclear or incorrect instructions, update `.opencode/command/v-add-openrouter-model.md`

  **Step 4 — Run full test suite**:

  ```bash
  pnpm test -- --run
  # Expected: 1490+ passing, 0 failures
  ```

  **Step 5 — Completion notification**:

  ```bash
  tsx scripts/telegram-notify.ts "✅ global-model-catalog-and-command complete — All tasks done. Come back to review results."
  ```

  **Must NOT do**:
  - Do not modify source code files
  - Do not add new data sources

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step verification workflow with Bash + Playwright
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Needed for Playwright scraping steps in the dry-run

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - `.opencode/command/v-add-openrouter-model.md` — the command file to test (follow its instructions exactly)

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts` — POST handler at `/admin/model-catalog` (201/409 responses)

  **External References**:
  - `https://openrouter.ai/api/v1/models`, `https://openrouter.ai/openai/gpt-oss-120b/performance`, `https://artificialanalysis.ai/leaderboards/models`

  **Acceptance Criteria**:
  - [ ] Dry-run successfully fetches data from all 3 sources
  - [ ] POST returned 201 (or 409 if model already existed)
  - [ ] Catalog shows model with populated fields
  - [ ] Forbidden model edge case verified
  - [ ] Non-existent model edge case verified
  - [ ] Full test suite passes
  - [ ] Telegram notification sent

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — full end-to-end
    Tool: Bash + Playwright
    Preconditions: Gateway running, command file exists, .env has ADMIN_API_KEY
    Steps:
      1. Follow the command instructions for `https://openrouter.ai/openai/gpt-oss-120b/performance`
      2. Verify API data fetched (model found in OpenRouter API)
      3. Verify performance page scraped (at least throughput value > 0)
      4. Verify AA leaderboard scraped (quality_index is numeric or null with warning)
      5. Verify POST to `/admin/model-catalog` returns 201 or 409
      6. `source .env && curl -s "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[] | select(.model_id == "openai/gpt-oss-120b")'` — assert model exists with populated fields
    Expected Result: Model added to global catalog with API data + performance metrics
    Failure Indicators: 400/500 on POST, model not found in catalog after POST
    Evidence: .sisyphus/evidence/task-7-happy-path.txt

  Scenario: Forbidden model rejection
    Tool: Bash
    Preconditions: Command file exists
    Steps:
      1. Trace the command with `https://openrouter.ai/anthropic/claude-sonnet-4/performance`
      2. Verify instructions would extract `anthropic/claude-sonnet-4`
      3. Verify forbidden check pattern `anthropic/claude-sonnet-*` would match
      4. Verify abort with clear error message before any API/scraping work
    Expected Result: Command aborts at forbidden check step
    Failure Indicators: Command proceeds to API fetch or POST
    Evidence: .sisyphus/evidence/task-7-forbidden.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: All tasks complete
    Steps:
      1. `pnpm test -- --run` — assert 0 failures
      2. `pnpm build` — assert exit 0
      3. `pnpm lint` — assert exit 0
    Expected Result: All checks pass with no regressions
    Failure Indicators: Any test failure, build error, or lint error
    Evidence: .sisyphus/evidence/task-7-full-suite.txt
  ```

  **Commit**: YES (if command file was updated with fixes)
  - Message: `fix(dx): address edge cases in /v-add-openrouter-model command`
  - Files: `.opencode/command/v-add-openrouter-model.md`
  - Pre-commit: `pnpm test -- --run`

---

## Final Verification Wave

> After ALL implementation tasks, 4 review agents run in PARALLEL. ALL must APPROVE.
> Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. `curl /admin/model-catalog` returns models without tenant_id. `curl /admin/tenants/:id/model-catalog` returns 404. `psql` confirms model_catalog has no tenant_id column. Verify `.opencode/command/v-add-openrouter-model.md` exists and references `/admin/model-catalog`. Check AGENTS.md route table is updated.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && pnpm lint && pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check that no file still references `tenant_id` in model-catalog context (grep for `tenant_id` in changed files). Verify no stale `tenantId` params in dashboard gateway functions.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Stale refs [CLEAN/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `dev-browser` skill)
      Start from clean state. (1) Verify global catalog via curl: list, create, get, update, delete at `/admin/model-catalog`. (2) Verify old routes 404. (3) Load dashboard model catalog page in browser — models render, no console errors, no tenant-scoped API calls in network tab. (4) Load employee detail page — model dropdown populated from global catalog. (5) Execute slash command against a real model URL. Save evidence screenshots.
      Output: `API [N/N pass] | Dashboard [N/N pass] | Command [pass/fail] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Specifically verify: matcher.ts was NOT modified, recommend-model URL was NOT changed, no deprecated files were touched. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1**: `refactor(db): make model_catalog global — drop tenant_id` — `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`, `prisma/seed.ts`
- **Task 2**: `refactor(api): move model-catalog routes to /admin/model-catalog` — `src/gateway/routes/admin-model-catalog.ts`, `src/gateway/server.ts`, `src/gateway/routes/__tests__/admin-model-catalog.test.ts`
- **Task 3**: `refactor(api): remove tenant_id from catalog queries in archetype routes` — `src/gateway/routes/admin-archetypes.ts`, `src/gateway/routes/admin-archetype-generate.ts`
- **Task 4**: `refactor(dashboard): update model catalog to use global API` — `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts`, `dashboard/src/pages/ModelCatalogPage.tsx`, `dashboard/src/panels/employees/EmployeeDetail.tsx`
- **Task 5**: `docs: update AGENTS.md and README.md for global model catalog routes` — `AGENTS.md`, `README.md`
- **Task 6**: `feat(dx): add /v-add-openrouter-model slash command` — `.opencode/command/v-add-openrouter-model.md`

---

## Success Criteria

### Verification Commands

```bash
# Schema: no tenant_id column
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "\d model_catalog" | grep tenant_id
# Expected: no output (column gone)

# Row count: 3 (not 6)
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT count(*) FROM model_catalog;"
# Expected: 3

# Global route works
source .env
curl -s "http://localhost:7700/admin/model-catalog" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq 'length'
# Expected: 3

# Old tenant route is gone
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/model-catalog" \
  -H "X-Admin-Key: $ADMIN_API_KEY"
# Expected: 404

# Tests pass
pnpm test -- --run
# Expected: 1490+ passing, 0 failures

# Slash command exists
ls .opencode/command/v-add-openrouter-model.md
# Expected: file exists
```

### Final Checklist

- [ ] model_catalog table has no tenant_id column
- [ ] 3 rows in model_catalog (deduplicated from 6)
- [ ] `/admin/model-catalog` routes work (list, create, get, update, delete)
- [ ] `/admin/tenants/:id/model-catalog` returns 404
- [ ] `recommend-model` and `archetype-generate` query global catalog
- [ ] Dashboard loads model catalog without tenant scoping
- [ ] All tests pass
- [ ] Slash command file exists at `.opencode/command/v-add-openrouter-model.md`
- [ ] AGENTS.md + README.md updated with new route paths
