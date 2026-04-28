# GM-07: Multi-Property Knowledge Base Storage

## TL;DR

> **Quick Summary**: Build a full CRUD admin API for managing per-property knowledge base entries, enabling property managers to create/update KB content for any property without code deploys. The existing `knowledge_base_entries` table and shell tool already support multi-property routing — this story adds the API surface, tests, and verification.
>
> **Deliverables**:
>
> - Admin API: 5 endpoints for KB entry CRUD (`POST`, `GET` list, `GET` single, `PATCH`, `DELETE`)
> - Zod validation schemas for all KB entry operations
> - Service layer for KB business logic with tenant isolation
> - Gateway route registration
> - Comprehensive Vitest test suite (route + integration tests)
> - Additional seed entries for multi-property verification
> - Story map updated with GM-07 acceptance criteria marked complete
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 7 → Task 8

---

## Context

### Original Request

Implement GM-07 from the Phase 1 story map: Multi-Property Knowledge Base Storage. Build the API surface to manage per-property KB entries, test thoroughly via automated tests and API endpoint verification, then mark GM-07 as completed in the story map.

### Interview Summary

**Key Discussions**:

- **Schema approach**: User correctly identified that `knowledge_base_entries` already has `entity_type` + `entity_id` columns — no migration needed
- **Content format**: Plain text / Markdown — single content blob per entry
- **API scope**: Full CRUD now (create, read, update, delete)
- **Story map**: Must update `docs/2026-04-21-2202-phase1-story-map.md` to mark GM-07 acceptance criteria as completed

**Research Findings**:

- `knowledge_base_entries` table already supports multi-property storage via `entity_type='property'` + `entity_id='<hostfully-uid>'` + `scope` enum (`common`|`entity`)
- Unique constraint `(tenant_id, entity_type, entity_id, scope)` prevents duplicate entries — BUT PostgreSQL treats NULL != NULL, so multiple `common` entries could be inserted without application-level guard
- Shell tool `src/worker-tools/knowledge_base/search.ts` already handles multi-property routing, merges entity + common content, and handles missing properties gracefully
- Admin route pattern established in `admin-projects.ts`: factory function with injectable Prisma, `requireAdminKey` middleware, Zod validation, service delegation
- Test pattern: `TestApp` with supertest, `getPrisma()`, `cleanupTestData()`, `ADMIN_TEST_KEY`
- `cleanupTestData()` does NOT currently clean `knowledge_base_entries` — needs extending
- Seeded data: 2 KB entries for VLRE tenant (1 common `00000000-...0100`, 1 property `00000000-...0101`)
- Route registration in `src/gateway/server.ts` lines 155-161: `app.use(adminXxxRoutes({ prisma }))`

### Metis Review

**Identified Gaps** (addressed):

- **Null uniqueness problem**: PostgreSQL unique constraints treat NULL != NULL — multiple `(tenant_id, NULL, NULL, 'common')` rows can be inserted. Resolution: application-level `findFirst` check before insert for common-scope entries
- **Scope derivation**: Auto-derive from `entity_id` presence: if `entity_id` provided → `scope=entity`, else → `scope=common`. Simpler API, eliminates mismatch errors
- **Duplicate handling**: Return `409 Conflict` on duplicate, not upsert
- **Content size limit**: `z.string().min(1).max(100000)` — generous for Markdown KB content
- **PATCH semantics**: Content-only update. `entity_type`/`entity_id` are immutable after creation
- **Listing filters**: Basic `entity_type` and `entity_id` query params. No pagination in v1 (documented omission)
- **URL path**: `/admin/tenants/:tenantId/kb/entries` (flat, entity-type-agnostic)

---

## Work Objectives

### Core Objective

Build a full CRUD admin API for `knowledge_base_entries` that enables managing per-property KB content without code deploys, with comprehensive test coverage and tenant isolation guarantees.

### Concrete Deliverables

- `src/gateway/routes/admin-kb.ts` — Route handler with 5 endpoints
- `src/gateway/services/kb-repository.ts` — Service layer for KB operations
- Updated `src/gateway/validation/schemas.ts` — Zod schemas for KB entry operations
- Updated `src/gateway/server.ts` — Route registration
- `tests/gateway/admin-kb-crud.test.ts` — Comprehensive route tests
- Updated `tests/setup.ts` — `cleanupTestData()` extended for KB entries
- Updated `prisma/seed.ts` — Additional property KB entries for multi-property verification
- Updated `docs/2026-04-21-2202-phase1-story-map.md` — GM-07 acceptance criteria marked complete

### Definition of Done

- [ ] All 5 CRUD endpoints respond correctly (verified via automated tests)
- [ ] Tenant isolation: tenant A cannot access tenant B's KB entries (verified via test)
- [ ] Duplicate entry returns 409 Conflict (verified via test)
- [ ] Common-scope null uniqueness enforced at application level (verified via test)
- [ ] `pnpm test -- --run` passes with no new failures
- [ ] `pnpm build` succeeds with no type errors
- [ ] `pnpm lint` passes

### Must Have

- Full CRUD: POST (create), GET (list with filters), GET (single by ID), PATCH (update content), DELETE
- Tenant isolation on all operations (filter by `:tenantId` route param)
- Auto-derived `scope` from `entity_id` presence
- Application-level uniqueness guard for common-scope entries (NULL workaround)
- `409 Conflict` on duplicate `(tenant_id, entity_type, entity_id, scope)`
- Content size validation: `min(1)`, `max(100000)`
- Cross-tenant 404 for mismatched tenant/entry
- Automated test suite covering all endpoints + edge cases
- Story map update marking GM-07 acceptance criteria complete

### Must NOT Have (Guardrails)

- **DO NOT** touch `src/worker-tools/knowledge_base/search.ts` — shell tool already works, any "improvement" is scope creep
- **DO NOT** modify `prisma/schema.prisma` or create any new Prisma migration — existing schema is sufficient
- **DO NOT** modify existing seed data (IDs `00000000-...-0100` and `00000000-...-0101`) — only add new entries
- **DO NOT** add pagination or cursor-based listing in v1 — document as known omission
- **DO NOT** validate `entity_id` referential integrity (it's a free-form string referencing external systems like Hostfully)
- **DO NOT** touch any deprecated files (`src/inngest/lifecycle.ts`, `src/inngest/redispatch.ts`, etc.)
- **DO NOT** add PM dashboard UI
- **DO NOT** verify via Docker build or shell tool invocation — curl and Vitest only
- **DO NOT** restructure `cleanupTestData()` — only append a new `deleteMany` call

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest with supertest (via TestApp wrapper)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API endpoints**: Use Bash (curl) — Send requests to local gateway, assert status + response fields
- **Tests**: Use Bash (`pnpm test -- --run`) — Run test suite, assert pass counts
- **Build**: Use Bash (`pnpm build`) — Compile, assert no errors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — validation + service layer + test cleanup):
├── Task 1: Zod validation schemas for KB entry operations [quick]
├── Task 2: KB repository service layer [unspecified-high]
└── Task 3: Extend cleanupTestData() for KB entries [quick]

Wave 2 (After Wave 1 — routes + seed + tests):
├── Task 4: Admin KB route handler with 5 endpoints [unspecified-high]
├── Task 5: Register routes in gateway server [quick]
├── Task 6: Seed additional property KB entries [quick]
└── Task 7: Comprehensive route test suite [deep]

Wave 3 (After Wave 2 — verification + story map):
├── Task 8: Build, lint, and full test suite verification [quick]
└── Task 9: Update story map with GM-07 completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
└── Task N: Notify completion via Telegram

Critical Path: Task 1 → Task 4 → Task 5 → Task 8 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 1 has 3, Wave 2 has 4)
```

### Dependency Matrix

| Task  | Depends On    | Blocks  | Wave  |
| ----- | ------------- | ------- | ----- |
| 1     | —             | 4, 7    | 1     |
| 2     | —             | 4, 7    | 1     |
| 3     | —             | 7       | 1     |
| 4     | 1, 2          | 5, 7, 8 | 2     |
| 5     | 4             | 8       | 2     |
| 6     | —             | 7       | 2     |
| 7     | 1, 2, 3, 4, 6 | 8       | 2     |
| 8     | 5, 7          | F1-F4   | 3     |
| 9     | 8             | —       | 3     |
| F1-F4 | 8, 9          | N       | FINAL |
| N     | F1-F4         | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`
- **Wave 2**: 4 tasks — T4 → `unspecified-high`, T5 → `quick`, T6 → `quick`, T7 → `deep`
- **Wave 3**: 2 tasks — T8 → `quick`, T9 → `quick`
- **FINAL**: 5 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`, N → `quick`

---

## TODOs

- [x] 1. Zod Validation Schemas for KB Entry Operations

  **What to do**:
  - Add Zod schemas to `src/gateway/validation/schemas.ts` for KB entry CRUD:
    - `CreateKbEntrySchema`: `{ entity_type: z.string().min(1).max(100).optional(), entity_id: z.string().min(1).max(500).optional(), content: z.string().min(1).max(100000) }`. Refine: if `entity_id` is provided, `entity_type` is required (use `.refine()`). `scope` is NOT in the schema — it is auto-derived in the service layer.
    - `UpdateKbEntrySchema`: `{ content: z.string().min(1).max(100000) }` — only content is mutable.
    - `ListKbEntriesQuerySchema`: `{ entity_type: z.string().optional(), entity_id: z.string().optional() }` — for query param filtering.
    - `KbEntryIdParamSchema`: `{ tenantId: uuidField(), entryId: uuidField() }` — route params for single-entry operations.
    - `KbEntryTenantParamSchema`: `{ tenantId: uuidField() }` — route params for list/create.
  - All UUID fields use `uuidField()` (loose `UUID_REGEX`), NOT `z.string().uuid()`
  - Export all schemas from the file

  **Must NOT do**:
  - Do NOT create a separate validation file — add to existing `schemas.ts`
  - Do NOT use `z.string().uuid()` for UUID fields — use `uuidField()` from the same file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file addition of well-defined Zod schemas following existing patterns
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None needed — Zod is standard, patterns exist in file

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/gateway/validation/schemas.ts` — The file to modify. Contains `uuidField()` (lines 168-170), `UUID_REGEX` (line 3), `CreateProjectSchema` (example Zod object schema with validation), `TenantIdParamSchema` (param validation pattern)

  **API/Type References** (contracts to implement against):
  - `prisma/schema.prisma:250-266` — `KnowledgeBaseEntry` model: `entity_type TEXT?`, `entity_id TEXT?`, `scope TEXT NOT NULL`, `content TEXT NOT NULL` — the DB columns the Zod schemas must align with

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Valid create schema with entity_id
    Tool: Bash (node REPL)
    Preconditions: schemas.ts compiled successfully via pnpm build
    Steps:
      1. Run: pnpm build
      2. Verify no TypeScript errors in schemas.ts
      3. Import CreateKbEntrySchema in a test or REPL
      4. Parse { entity_type: "property", entity_id: "c960c8d2", content: "Check-in at 3pm" } → expect success
      5. Parse { entity_id: "c960c8d2", content: "test" } (missing entity_type) → expect failure (refinement)
      6. Parse { content: "" } → expect failure (min(1))
      7. Parse { content: "x".repeat(100001) } → expect failure (max)
    Expected Result: All parse results match expectations
    Evidence: .sisyphus/evidence/task-1-zod-validation.txt

  Scenario: Valid create schema for common entry (no entity_id)
    Tool: Bash (node REPL)
    Steps:
      1. Parse { content: "Common policies..." } → expect success (entity_type and entity_id omitted)
      2. Parse { entity_type: "property", content: "test" } → expect success (entity_type without entity_id is allowed — means "all entities of this type")
    Expected Result: Both parse successfully
    Evidence: .sisyphus/evidence/task-1-zod-common-entry.txt
  ```

  **Commit**: YES
  - Message: `feat(kb): add Zod validation schemas for KB entry CRUD`
  - Files: `src/gateway/validation/schemas.ts`
  - Pre-commit: `pnpm build`

- [x] 2. KB Repository Service Layer

  **What to do**:
  - Create `src/gateway/services/kb-repository.ts` with a class or set of functions:
    - `createKbEntry({ tenantId, entityType?, entityId?, content, prisma })`: Auto-derives `scope` (`entity_id` present → `'entity'`, else → `'common'`). Before insert, check for null uniqueness: if `scope === 'common'`, do `prisma.knowledgeBaseEntry.findFirst({ where: { tenantId, entityType: entityType ?? null, entityId: null, scope: 'common' } })` — if found, throw a `KbEntryConflictError`. Use `prisma.knowledgeBaseEntry.create()` for insert. Wrap Prisma `P2002` (unique violation) in a `KbEntryConflictError`.
    - `listKbEntries({ tenantId, entityType?, entityId?, prisma })`: `prisma.knowledgeBaseEntry.findMany({ where: { tenantId, ...(entityType && { entityType }), ...(entityId && { entityId }) }, orderBy: { createdAt: 'desc' } })`
    - `getKbEntry({ tenantId, entryId, prisma })`: `prisma.knowledgeBaseEntry.findFirst({ where: { id: entryId, tenantId } })` — returns null if not found or wrong tenant (tenant isolation)
    - `updateKbEntry({ tenantId, entryId, content, prisma })`: `prisma.knowledgeBaseEntry.updateMany({ where: { id: entryId, tenantId }, data: { content } })` — returns count. If count === 0, entry not found or wrong tenant.
    - `deleteKbEntry({ tenantId, entryId, prisma })`: `prisma.knowledgeBaseEntry.deleteMany({ where: { id: entryId, tenantId } })` — returns count. If count === 0, entry not found or wrong tenant.
  - Export a `KbEntryConflictError` class extending `Error` for the route handler to catch
  - All functions accept `prisma` as a parameter for test injection (following `admin-projects.ts` pattern)

  **Must NOT do**:
  - Do NOT use `findUnique` for tenant-isolated lookups — use `findFirst` with `tenantId` in where clause
  - Do NOT import or modify PostgREST client — this service uses Prisma directly (gateway-side, not worker-side)
  - Do NOT add logging beyond error cases

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple functions with business logic (null uniqueness guard, scope derivation, error wrapping)
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/services/project-registry.ts` — Reference service pattern: error classes, Prisma usage, tenant-scoped queries. Follow this structure.
  - `src/gateway/routes/admin-projects.ts:60-78` — How the route handler catches service errors and maps to HTTP status codes

  **API/Type References**:
  - `prisma/schema.prisma:250-266` — `KnowledgeBaseEntry` model definition with all columns and constraints
  - `prisma/migrations/20260424020323_add_knowledge_base_entries/migration.sql` — The CHECK constraint (`scope IN ('common', 'entity')`) and unique constraint `(tenant_id, entity_type, entity_id, scope)` that the service must respect

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Service layer compiles successfully
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Verify no TypeScript errors in kb-repository.ts
    Expected Result: Build succeeds, 0 errors
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: Null uniqueness guard prevents duplicate common entries
    Tool: Bash (pnpm test)
    Steps:
      1. (Covered by Task 7 test suite — this task ensures the logic exists)
      2. Verify createKbEntry throws KbEntryConflictError when a common entry already exists for the same tenant+entity_type
    Expected Result: Error thrown with descriptive message
    Evidence: .sisyphus/evidence/task-2-null-uniqueness.txt
  ```

  **Commit**: YES
  - Message: `feat(kb): add KB repository service layer`
  - Files: `src/gateway/services/kb-repository.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Extend cleanupTestData() for KB Entries

  **What to do**:
  - Edit `tests/setup.ts` to add KB entry cleanup in `cleanupTestData()` function
  - Append ONE new line to the cleanup function: `await prisma.knowledgeBaseEntry.deleteMany({ where: { id: { notIn: ['00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000101'] } } })`
  - This preserves the 2 seeded entries (common + property c960c8d2) while cleaning up test-created entries
  - Place the new deleteMany BEFORE any existing deleteMany calls that might cascade (check for FK dependencies)

  **Must NOT do**:
  - Do NOT restructure or refactor `cleanupTestData()` — only append one line
  - Do NOT change the function signature
  - Do NOT remove or modify any existing cleanup logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line addition to existing function
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `tests/setup.ts:19-33` — Existing `cleanupTestData()` function with current deleteMany calls. The new line follows the same pattern.

  **API/Type References**:
  - `prisma/seed.ts:1285-1316` — The 2 seeded KB entry IDs that must be preserved: `00000000-0000-0000-0000-000000000100` (common) and `00000000-0000-0000-0000-000000000101` (property)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cleanup function compiles and preserves seed data
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Verify no TypeScript errors in tests/setup.ts
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-3-build.txt

  Scenario: Seed data not deleted by cleanup
    Tool: Bash (pnpm test)
    Steps:
      1. Run existing seed-property-kb.test.ts: pnpm test -- --run tests/gateway/seed-property-kb.test.ts
      2. Verify seed KB entries are still present after test run
    Expected Result: Test passes, seed entries preserved
    Evidence: .sisyphus/evidence/task-3-seed-preserved.txt
  ```

  **Commit**: YES
  - Message: `chore(test): extend cleanupTestData for KB entries`
  - Files: `tests/setup.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Admin KB Route Handler with 5 Endpoints

  **What to do**:
  - Create `src/gateway/routes/admin-kb.ts` with a factory function `adminKbRoutes({ prisma? }): Router`
  - Implement 5 endpoints:

  **POST `/admin/tenants/:tenantId/kb/entries`** — Create KB entry
  1. Validate params with `KbEntryTenantParamSchema`
  2. Validate body with `CreateKbEntrySchema`
  3. Call `createKbEntry()` from service layer
  4. Return `201` with created entry
  5. Catch `KbEntryConflictError` → return `409 { error: 'CONFLICT', message: '...' }`

  **GET `/admin/tenants/:tenantId/kb/entries`** — List KB entries
  1. Validate params with `KbEntryTenantParamSchema`
  2. Validate query with `ListKbEntriesQuerySchema` (optional `entity_type`, `entity_id` filters)
  3. Call `listKbEntries()` from service layer
  4. Return `200` with array of entries

  **GET `/admin/tenants/:tenantId/kb/entries/:entryId`** — Get single KB entry
  1. Validate params with `KbEntryIdParamSchema`
  2. Call `getKbEntry()` from service layer
  3. If null → return `404 { error: 'NOT_FOUND' }`
  4. Return `200` with entry

  **PATCH `/admin/tenants/:tenantId/kb/entries/:entryId`** — Update KB entry content
  1. Validate params with `KbEntryIdParamSchema`
  2. Validate body with `UpdateKbEntrySchema`
  3. Call `updateKbEntry()` from service layer
  4. If count === 0 → return `404 { error: 'NOT_FOUND' }`
  5. Return `200` with updated entry (re-fetch after update)

  **DELETE `/admin/tenants/:tenantId/kb/entries/:entryId`** — Delete KB entry
  1. Validate params with `KbEntryIdParamSchema`
  2. Call `deleteKbEntry()` from service layer
  3. If count === 0 → return `404 { error: 'NOT_FOUND' }`
  4. Return `204` (no body)
  - All routes use `requireAdminKey` middleware
  - All error handlers follow the pattern: `INVALID_ID` (400), `INVALID_REQUEST` (400), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500)

  **Must NOT do**:
  - Do NOT add pagination parameters
  - Do NOT add any endpoint beyond the 5 listed
  - Do NOT add custom middleware beyond `requireAdminKey`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple route handlers with validation, error mapping, and service delegation
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — depends on Tasks 1, 2)
  - **Blocks**: Tasks 5, 7, 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-projects.ts` — **THE** reference file. Copy the factory function structure, `requireAdminKey` import, error handling patterns, Prisma injection, and response format exactly.
  - `src/gateway/routes/admin-tenants.ts` — Second reference: soft-delete pattern (for DELETE endpoint), PATCH pattern

  **API/Type References**:
  - `src/gateway/validation/schemas.ts` — Import `CreateKbEntrySchema`, `UpdateKbEntrySchema`, `ListKbEntriesQuerySchema`, `KbEntryIdParamSchema`, `KbEntryTenantParamSchema` (created in Task 1)
  - `src/gateway/services/kb-repository.ts` — Import `createKbEntry`, `listKbEntries`, `getKbEntry`, `updateKbEntry`, `deleteKbEntry`, `KbEntryConflictError` (created in Task 2)
  - `src/gateway/middleware/admin-auth.ts` — Import `requireAdminKey`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Route file compiles and exports factory function
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Verify no TypeScript errors in admin-kb.ts
      3. Verify the exported function name matches adminKbRoutes
    Expected Result: Build succeeds, export is correct
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: All 5 HTTP methods are registered
    Tool: Bash (grep)
    Steps:
      1. Grep admin-kb.ts for router.post, router.get (x2), router.patch, router.delete
      2. Verify all 5 are present
    Expected Result: 5 route registrations found (1 POST, 2 GET, 1 PATCH, 1 DELETE)
    Evidence: .sisyphus/evidence/task-4-routes-registered.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(kb): add admin CRUD routes for knowledge base entries`
  - Files: `src/gateway/routes/admin-kb.ts`, `src/gateway/server.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Register Routes in Gateway Server

  **What to do**:
  - Edit `src/gateway/server.ts`:
    - Add import: `import { adminKbRoutes } from './routes/admin-kb.js';`
    - Add route registration: `app.use(adminKbRoutes({ prisma }));` — place after line 160 (after `adminTenantConfigRoutes`)
  - That's it — two lines.

  **Must NOT do**:
  - Do NOT modify any other route registrations
  - Do NOT change the server startup logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-line edit to existing file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 4)
  - **Blocks**: Task 8
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:9` — Import pattern: `import { adminProjectRoutes } from './routes/admin-projects.js';`
  - `src/gateway/server.ts:155-161` — Route registration block: `app.use(adminXxxRoutes({ prisma }));`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Gateway compiles with new route
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Verify no TypeScript errors
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: Route is accessible (not 404)
    Tool: Bash (curl)
    Preconditions: Gateway is running on localhost:7700 (or use TestApp in task 7)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/kb/entries
      2. Assert response is NOT 404 (should be 200 or 401 depending on auth)
    Expected Result: HTTP status != 404 (route is registered)
    Evidence: .sisyphus/evidence/task-5-route-accessible.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(kb): add admin CRUD routes for knowledge base entries`
  - Files: `src/gateway/routes/admin-kb.ts`, `src/gateway/server.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Seed Additional Property KB Entries

  **What to do**:
  - Edit `prisma/seed.ts` to add 2 more `KnowledgeBaseEntry` upsert calls for the VLRE tenant, after the existing entries (after line ~1316):
    - Entry `00000000-0000-0000-0000-000000000102`: `tenant_id=VLRE`, `entity_type='property'`, `entity_id='test-property-alpha'`, `scope='entity'`, `content='# Test Property Alpha\n\nThis is a test property for multi-property verification.\n\n## Check-in\nCheck-in time: 4:00 PM\nSelf check-in with smart lock code.\n\n## WiFi\nNetwork: AlphaGuest\nPassword: alpha2024'`
    - Entry `00000000-0000-0000-0000-000000000103`: `tenant_id=VLRE`, `entity_type='property'`, `entity_id='test-property-beta'`, `scope='entity'`, `content='# Test Property Beta\n\nSecond test property for multi-property verification.\n\n## Check-in\nCheck-in time: 3:00 PM\nMeet host at front door.\n\n## WiFi\nNetwork: BetaWifi\nPassword: beta2024'`
  - Use the same upsert pattern as existing entries (lines 1285-1316)
  - Use VLRE tenant ID: `00000000-0000-0000-0000-000000000003`

  **Must NOT do**:
  - Do NOT modify existing seed entries (IDs `...0100` and `...0101`)
  - Do NOT add entries for DozalDevs tenant
  - Do NOT use random UUIDs — use deterministic ones

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Copy-paste of existing seed pattern with different data
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (independent, but Task 7 needs seed data)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:1285-1316` — Existing KB entry upsert pattern. Copy this exactly for new entries.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs without errors
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Verify no TypeScript errors in seed.ts
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-6-build.txt

  Scenario: New entries are seeded in test DB
    Tool: Bash
    Steps:
      1. Run: DATABASE_URL="postgresql://postgres:postgres@localhost:54322/ai_employee_test" npx prisma db seed
      2. Verify no errors
    Expected Result: Seed completes successfully
    Evidence: .sisyphus/evidence/task-6-seed.txt
  ```

  **Commit**: YES
  - Message: `chore(seed): add multi-property KB test fixtures`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 7. Comprehensive Route Test Suite

  **What to do**:
  - Create `tests/gateway/admin-kb-crud.test.ts` with comprehensive tests for all 5 endpoints
  - Follow the exact test pattern from `tests/gateway/admin-projects-create.test.ts`: `beforeEach` creates TestApp with injected Prisma, `afterEach` calls `cleanupTestData()`, `afterAll` calls `disconnectPrisma()`
  - Use `express()` app with `adminKbRoutes({ prisma: getPrisma() })` mounted

  **Test cases to cover (minimum)**:

  **POST /admin/tenants/:tenantId/kb/entries**:
  1. ✅ Create entity-scoped entry with `entity_type` + `entity_id` + `content` → 201, response has `scope: 'entity'`
  2. ✅ Create common-scoped entry with only `content` → 201, response has `scope: 'common'`, `entity_type: null`, `entity_id: null`
  3. ❌ Create with empty content → 400 `INVALID_REQUEST`
  4. ❌ Create with `entity_id` but missing `entity_type` → 400 `INVALID_REQUEST`
  5. ❌ Create duplicate `(tenant_id, entity_type, entity_id, scope)` → 409 `CONFLICT`
  6. ❌ Create with invalid tenant UUID → 400 `INVALID_ID`
  7. ❌ Create without auth header → 401

  **GET /admin/tenants/:tenantId/kb/entries**: 8. ✅ List all entries for VLRE tenant → 200, returns array with seeded entries 9. ✅ List with `?entity_type=property` filter → 200, returns only property entries 10. ✅ List with `?entity_type=property&entity_id=c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` → 200, returns 1 entry 11. ✅ List for tenant with no entries → 200, returns `[]`

  **GET /admin/tenants/:tenantId/kb/entries/:entryId**: 12. ✅ Get existing entry by ID → 200, returns full entry 13. ❌ Get non-existent entry → 404 `NOT_FOUND` 14. ❌ **Cross-tenant isolation**: Get entry that belongs to VLRE using DozalDevs tenant ID → 404 `NOT_FOUND` 15. ❌ Get with invalid UUID → 400 `INVALID_ID`

  **PATCH /admin/tenants/:tenantId/kb/entries/:entryId**: 16. ✅ Update content of existing entry → 200, response has new content 17. ❌ Update non-existent entry → 404 `NOT_FOUND` 18. ❌ Update with empty content → 400 `INVALID_REQUEST` 19. ❌ **Cross-tenant isolation**: Update entry that belongs to VLRE using DozalDevs tenant ID → 404 `NOT_FOUND`

  **DELETE /admin/tenants/:tenantId/kb/entries/:entryId**: 20. ✅ Delete existing entry → 204 (no body) 21. ✅ Verify deleted entry is gone: GET after DELETE → 404 22. ❌ Delete non-existent entry → 404 `NOT_FOUND` 23. ❌ **Cross-tenant isolation**: Delete entry that belongs to VLRE using DozalDevs tenant ID → 404 `NOT_FOUND`

  **Integration flow**: 24. ✅ Full CRUD cycle: POST → GET → PATCH → GET (verify update) → DELETE → GET (verify gone) 25. ✅ Multi-property: Create 3 entries for different properties, list with filter, verify correct counts
  - Use VLRE tenant ID `00000000-0000-0000-0000-000000000003` and DozalDevs tenant ID `00000000-0000-0000-0000-000000000002` for cross-tenant tests
  - Create test entries with unique UUIDs using `crypto.randomUUID()` — `cleanupTestData()` will clean them up
  - DO NOT use seeded entry IDs (`...0100`, `...0101`) for mutation tests (update/delete) — create fresh entries

  **Must NOT do**:
  - Do NOT test the shell tool (search.ts) — that's out of scope
  - Do NOT test PostgREST access patterns — that's worker-side
  - Do NOT add snapshot tests
  - Do NOT test Prisma internals — only HTTP layer

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 25+ test cases covering all endpoints, edge cases, and integration flows. Requires careful setup/teardown and understanding of tenant isolation.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (depends on Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 3, 4, 6

  **References**:

  **Pattern References**:
  - `tests/gateway/admin-projects-create.test.ts` — **THE** reference test file. Copy the entire structure: imports, beforeEach/afterEach/afterAll hooks, TestApp setup, supertest injection, assertion patterns.
  - `tests/gateway/seed-property-kb.test.ts` — Reference for KB-specific assertions: how to query `knowledge_base_entries` directly via `$queryRaw`, tenant isolation test pattern
  - `tests/setup.ts` — Import `TestApp`, `getPrisma`, `cleanupTestData`, `disconnectPrisma`, `ADMIN_TEST_KEY`

  **API/Type References**:
  - `src/gateway/routes/admin-kb.ts` — The route handler being tested (created in Task 4)
  - `src/gateway/validation/schemas.ts` — The Zod schemas defining valid/invalid inputs (created in Task 1)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-kb-crud.test.ts
      2. Verify all test cases pass
      3. Count total tests: expect >= 25
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure, TypeScript compilation error, or fewer than 25 tests
    Evidence: .sisyphus/evidence/task-7-tests.txt

  Scenario: Cross-tenant isolation verified
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-kb-crud.test.ts -t "cross-tenant"
      2. Verify all cross-tenant tests pass (GET, PATCH, DELETE all return 404)
    Expected Result: Cross-tenant access returns 404, not the entry
    Evidence: .sisyphus/evidence/task-7-tenant-isolation.txt
  ```

  **Commit**: YES
  - Message: `test(kb): add comprehensive route tests for KB entry CRUD`
  - Files: `tests/gateway/admin-kb-crud.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/admin-kb-crud.test.ts`

- [x] 8. Build, Lint, and Full Test Suite Verification

  **What to do**:
  - Run the full verification suite to ensure nothing is broken:
    1. `pnpm build` — must succeed with 0 errors
    2. `pnpm lint` — must succeed
    3. `pnpm test -- --run` — all tests must pass (including new KB tests)
  - If any failures, fix them (only if caused by GM-07 changes — pre-existing failures are excluded per AGENTS.md)
  - Capture evidence of all 3 passing

  **Must NOT do**:
  - Do NOT fix pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`)
  - Do NOT modify code unrelated to GM-07

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running 3 commands and capturing output
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after all implementation)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 7

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Pre-existing test failures section: `container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts` — these are expected failures, ignore them

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Verify exit code 0
    Expected Result: Build completes with no errors
    Evidence: .sisyphus/evidence/task-8-build.txt

  Scenario: Full lint passes
    Tool: Bash
    Steps:
      1. Run: pnpm lint
      2. Verify exit code 0
    Expected Result: No lint errors
    Evidence: .sisyphus/evidence/task-8-lint.txt

  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Verify no NEW test failures (pre-existing failures excluded)
    Expected Result: All tests pass except known pre-existing failures
    Evidence: .sisyphus/evidence/task-8-tests.txt
  ```

  **Commit**: NO (verification only)

- [x] 9. Update Story Map with GM-07 Completion

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the GM-07 acceptance criteria section (approximately lines 709-715)
  - Change each `- [ ]` to `- [x]` for all 6 acceptance criteria:
    - `- [x] KB storage supports N properties per tenant, each with its own content`
    - `- [x] Common (tenant-wide) KB content is merged with property-specific content on every query`
    - `- [x] KB query tool resolves property ID → correct KB content automatically`
    - `- [x] Adding a new property's KB does not require redeploying any code`
    - `- [x] KB content is editable via API (future: via PM dashboard)`
    - `- [x] Tenant isolation: tenant A cannot query tenant B's property KBs`
  - This is a targeted find-and-replace — do NOT reformat or modify any other part of the document

  **Must NOT do**:
  - Do NOT modify any other story in the story map
  - Do NOT reformat the document
  - Do NOT change the GM-07 description or attributes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple find-and-replace of 6 checkboxes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:709-715` — The exact lines to modify (GM-07 acceptance criteria checkboxes)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 6 checkboxes are marked
    Tool: Bash (grep)
    Steps:
      1. Grep the story map for GM-07 acceptance criteria lines
      2. Count occurrences of "- [x]" in GM-07 section
      3. Verify count == 6
      4. Verify 0 occurrences of "- [ ]" remain in GM-07 section
    Expected Result: 6 checked boxes, 0 unchecked
    Evidence: .sisyphus/evidence/task-9-story-map.txt

  Scenario: No other stories modified
    Tool: Bash (git diff)
    Steps:
      1. Run: git diff docs/2026-04-21-2202-phase1-story-map.md
      2. Verify changes are ONLY in the GM-07 acceptance criteria section
      3. No other lines modified
    Expected Result: Diff shows only 6 checkbox changes in GM-07 section
    Evidence: .sisyphus/evidence/task-9-diff.txt
  ```

  **Commit**: YES
  - Message: `docs: mark GM-07 acceptance criteria complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

- [x] 10. Notify Completion

  **What to do**:
  - Send Telegram notification that plan `gm07-multi-property-kb` is complete, all tasks done
  - Run: `tsx scripts/telegram-notify.ts "✅ gm07-multi-property-kb complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After FINAL wave
  - **Blocks**: None
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ gm07-multi-property-kb complete — All tasks done. Come back to review results."
      2. Verify exit code 0
    Expected Result: Notification sent successfully
    Evidence: .sisyphus/evidence/task-10-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start the gateway (`pnpm dev:start` or use running instance). Execute EVERY QA scenario from EVERY task — follow exact curl commands, capture evidence. Test cross-task integration (create + list + get + update + delete in sequence). Test edge cases: empty content, invalid UUIDs, cross-tenant access. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: search.ts untouched, no schema.prisma changes, no migration files added. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task(s) | Commit Message                                               | Files                                                     | Pre-commit           |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------- | -------------------- |
| 1       | `feat(kb): add Zod validation schemas for KB entry CRUD`     | `src/gateway/validation/schemas.ts`                       | `pnpm build`         |
| 2       | `feat(kb): add KB repository service layer`                  | `src/gateway/services/kb-repository.ts`                   | `pnpm build`         |
| 3       | `chore(test): extend cleanupTestData for KB entries`         | `tests/setup.ts`                                          | `pnpm build`         |
| 4, 5    | `feat(kb): add admin CRUD routes for knowledge base entries` | `src/gateway/routes/admin-kb.ts`, `src/gateway/server.ts` | `pnpm build`         |
| 6       | `chore(seed): add multi-property KB test fixtures`           | `prisma/seed.ts`                                          | `pnpm build`         |
| 7       | `test(kb): add comprehensive route tests for KB entry CRUD`  | `tests/gateway/admin-kb-crud.test.ts`                     | `pnpm test -- --run` |
| 9       | `docs: mark GM-07 acceptance criteria complete in story map` | `docs/2026-04-21-2202-phase1-story-map.md`                | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: no errors
pnpm lint           # Expected: no errors
pnpm test -- --run  # Expected: all tests pass, including new KB tests
```

### Final Checklist

- [ ] All 5 CRUD endpoints work (POST, GET list, GET single, PATCH, DELETE)
- [ ] Tenant isolation verified (cross-tenant access returns 404)
- [ ] Duplicate entry returns 409 Conflict
- [ ] Common-scope uniqueness enforced (application-level)
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test -- --run` passes (no new failures)
- [ ] Story map GM-07 acceptance criteria marked complete
- [ ] `search.ts` shell tool is UNTOUCHED
- [ ] `prisma/schema.prisma` is UNTOUCHED
- [ ] No new migration files created
