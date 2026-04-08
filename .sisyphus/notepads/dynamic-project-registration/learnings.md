# Learnings — dynamic-project-registration

## [2026-04-08] Session Start

### Codebase Patterns

- Fastify route convention: `export async function fooRoutes(app, opts): Promise<void>` — explicit registration in `src/gateway/server.ts:43-52`
- SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001' — hardcoded in jira.ts:11 and task-creation.ts:5
- Seed project ID: '00000000-0000-0000-0000-000000000003' — must NEVER be deleted by cleanupTestData
- Zod pattern: schemas in `src/gateway/validation/schemas.ts`, export `type Foo = z.infer<typeof FooSchema>` + `parseFoo(body)` helper
- Service pattern: pure async functions, take `{ params, prisma }`, mirror `task-creation.ts`
- Logger redaction: check `src/lib/logger.ts` ~line 15 for the redaction array (GITHUB_TOKEN exists there)
- tooling_config is a JSON field on projects — already fully wired in workers via resolveToolingConfig()
- `pnpm install --frozen-lockfile` is HARDCODED at src/workers/entrypoint.sh:104 — to be removed in T20

### Prisma

- DB: postgresql://postgres:postgres@localhost:54322/ai_employee
- Existing @@unique example: Task model line 47: `@@unique([external_id, source_system, tenant_id])`
- Project model: lines 109-127 in prisma/schema.prisma
- ON DELETE SET NULL on tasks.project_id — completed tasks get project_id=NULL after project delete

### Tests

- Framework: Vitest, 515+ tests passing
- Known pre-existing failures: container-boot.test.ts, inngest-serve.test.ts — do NOT count as regressions
- Test helpers: createTestApp(), getPrisma(), cleanupTestData(), computeJiraSignature() in tests/setup.ts
- Canonical test pattern: tests/gateway/jira-webhook.test.ts:27-150

### Key Files

- src/gateway/server.ts:24-25 — JIRA_WEBHOOK_SECRET fail-fast pattern to mirror for ADMIN_API_KEY
- src/gateway/validation/signature.ts — HMAC verification pattern (timing-safe compare reference)
- src/workers/lib/task-context.ts:10-16 — ToolingConfig interface
- src/workers/lib/task-context.ts:22-27 — DEFAULT_TOOLING_CONFIG
- src/workers/lib/task-context.ts:211-221 — resolveToolingConfig merge logic
- src/workers/lib/project-config.ts:56-68 — parseRepoOwnerAndName to extract to src/lib/repo-url.ts

## [2026-04-08] Task 1: Unique Constraint on Projects

### Prisma Migration Pattern

- Use `prisma migrate deploy` to apply migrations (not `prisma migrate dev` in non-interactive environments)
- Manual migration creation: `mkdir prisma/migrations/{timestamp}_{name}` + write `migration.sql` directly
- Migration SQL for unique index: `CREATE UNIQUE INDEX "table_column_key" ON "table"("col1", "col2");`
- Prisma schema syntax: `@@unique([col1, col2])` inside model block, after fields, before closing `}`
- Always run `pnpm prisma generate` after applying migrations to regenerate Prisma Client

### Constraint Testing

- P2002 error code = unique constraint violation (Prisma standard)
- Test script pattern: create valid row, attempt duplicate (expect P2002), verify different keys allowed
- Cleanup: `deleteMany` with `where: { field: { in: [...] } }` for test isolation

### Test Suite Results

- 562 tests passed (vs 515+ baseline) — no regressions
- Pre-existing failures: 6 Fly hybrid tests (401 auth), 1 inngest-serve (function count), 1 container-boot (heartbeat)
- All failures are environment-related, not schema-related

### Commit Message Convention

- Format: `feat(db): add unique index on projects.jira_project_key per tenant`
- No AI/Claude references
- Describes the "why" (per-tenant uniqueness) not just "what" (added index)

## [2026-04-08] Task 6: ADMIN_API_KEY Environment Variable

### Implementation Summary

Added `ADMIN_API_KEY` environment variable with auto-generation in setup:

1. **`.env.example`** — Added `ADMIN_API_KEY=""` with comment near `JIRA_WEBHOOK_SECRET`
2. **`scripts/setup.ts`** — Added Step 8 that:
   - Reads `.env` file
   - Checks if `ADMIN_API_KEY` is missing or empty
   - Generates 64-char hex key using `crypto.randomBytes(32).toString('hex')`
   - Appends to `.env` (never overwrites)
   - Logs confirmation message (no key value in logs)
3. **`src/lib/logger.ts`** — Added `'*.ADMIN_API_KEY'` to redaction paths array

### Key Decisions

- Used Node.js built-in `crypto.randomBytes` (no external dependency, no shell exec)
- Append-only file operations (`appendFileSync`) — preserves existing content
- Idempotent: running setup multiple times preserves the same key
- Redaction pattern matches existing `GITHUB_TOKEN` style (dot-path with wildcard)

### Testing

- Auto-generation test: generates 64-char hex when missing ✓
- Preservation test: skips generation when key already set ✓
- Build: `pnpm build` passes with no errors ✓
- Lint: pre-existing warnings only (no new issues) ✓

### Commit

- `feat(env): introduce ADMIN_API_KEY with setup auto-generation`
- Files: `.env.example`, `scripts/setup.ts`, `src/lib/logger.ts`
- No AI/Claude references in message ✓

## [2026-04-08] Task 7: Add install field to ToolingConfig

### Implementation
- Added `install?: string` to ToolingConfig interface (line 11)
- Added `install: 'pnpm install --frozen-lockfile'` to DEFAULT_TOOLING_CONFIG (line 24)
- Created comprehensive TDD test suite with 5 test cases in tests/workers/tooling-config-install.test.ts
- All tests pass (6 tests in 1ms)
- pnpm build succeeds with no errors
- resolveToolingConfig() works without code changes (object spread merge handles new field automatically)

### Key Insights
- The field name MUST be `install` (not `install_command`) to match what T12 (install-runner) and T19 (orchestrate.mts) will consume
- Keeping `install: "pnpm install --frozen-lockfile"` as default ensures seeded projects (tooling_config: null) continue working unchanged
- No changes needed to validation-pipeline.ts or fix-loop.ts — install is NOT a validation stage
- TDD approach: write tests first, then implementation — all tests passed on first run

### Commit
- feat(gateway): add requireAdminKey middleware with timing-safe compare (includes T7 changes)
- Changes: src/workers/lib/task-context.ts, tests/workers/tooling-config-install.test.ts

## [2026-04-08] Task 2: Extract parseRepoOwnerAndName to src/lib/repo-url.ts

### Implementation Pattern

- TDD approach: write tests first in `tests/lib/repo-url.test.ts` (10 test cases total)
- Created `src/lib/repo-url.ts` with two functions:
  - `normalizeRepoUrl(url: string): string` — strips `.git` suffix and whitespace
  - `parseRepoOwnerAndName(url: string): { owner: string; repo: string }` — regex-based parser
- Updated `src/workers/lib/project-config.ts` to re-export both functions
- Removed local `parseRepoOwnerAndName` implementation from project-config.ts

### Test Coverage

- 8 parseRepoOwnerAndName cases: happy path (with/without .git), error cases (http, SSH, GitLab, empty, missing repo)
- 2 normalizeRepoUrl cases: strips .git and whitespace
- All 10 tests passing

### Key Learnings

- ESM imports use `.js` extension: `import { ... } from '../../lib/repo-url.js'`
- Shared lib modules in `src/lib/` follow simple pattern (see logger.ts)
- JSDoc docstrings are necessary for public API documentation
- Regex pattern: `^https:\/\/github\.com\/([^/]+)\/([^/]+)$` (after normalization)
- Re-export pattern: `export { func1, func2 }` at module top for convenience

### Build & Tests

- `pnpm build` passes (TypeScript compile clean)
- `tests/lib/repo-url.test.ts` all 10 tests pass
- No regressions in worker tests (verified via earlier runs)

## [2026-04-08] Task 3: Validation Schemas for Admin Project CRUD

### Implementation Summary

Added three Zod schemas to `src/gateway/validation/schemas.ts` for admin project CRUD operations:

1. **ToolingConfigSchema** — strict object with optional fields: `install`, `typescript`, `lint`, `unit`, `integration`, `e2e`
2. **CreateProjectSchema** — extends ProjectFieldsSchema with defaults for `default_branch` ('main') and `concurrency_limit` (3)
3. **UpdateProjectSchema** — partial ProjectFieldsSchema with validation that at least one field is required

### Key Design Decisions

- **ProjectFieldsSchema** — internal schema without defaults, used as base for both Create and Update
- **CreateProjectSchema** — extends ProjectFieldsSchema with `.extend()` to add defaults only for creation
- **UpdateProjectSchema** — uses `.partial()` on ProjectFieldsSchema (no defaults) + `.superRefine()` to validate non-empty object
- **repo_url validation** — uses `.refine()` with `parseRepoOwnerAndName()` to validate HTTPS GitHub URLs
- **ToolingConfigSchema** — uses `.strict()` to reject unknown keys (not `.passthrough()`)

### Test Coverage

Created `tests/gateway/admin-projects-validation.test.ts` with 20 test cases:
- ToolingConfigSchema: 5 tests (valid, empty, partial, unknown keys, single field)
- CreateProjectSchema: 10 tests (valid, with tooling_config, missing fields, invalid URLs, SSH rejection, unknown keys, custom defaults)
- UpdateProjectSchema: 5 tests (partial updates, empty rejection, invalid URLs, multiple fields, partial tooling_config)

All 20 tests pass.

### Build & Verification

- `pnpm build` — TypeScript compile succeeds with no errors
- `git diff src/gateway/validation/schemas.ts` — shows only additions (69 lines), no modifications to existing schemas
- Commit: `feat(gateway): add Zod schemas for admin project CRUD requests`
- Evidence: `.sisyphus/evidence/task-3-validation-tests.log` (20 tests passed)

### Import Path Pattern

- ESM imports use `.js` extension: `import { parseRepoOwnerAndName } from '../../lib/repo-url.js'`
- Relative path from `src/gateway/validation/schemas.ts` to `src/lib/repo-url.ts` is `../../lib/repo-url.js`

## [2026-04-08] Task 8: createProject Service with TDD

### Implementation Summary

Created `src/gateway/services/project-registry.ts` with the `createProject` function:

1. **Function signature**: `createProject({ input, tenantId, prisma }): Promise<Project>`
2. **Input type**: `CreateProjectInput` with fields: name, repo_url, jira_project_key, default_branch?, concurrency_limit?, tooling_config?
3. **Normalization**: Calls `normalizeRepoUrl()` to strip `.git` suffix before insert
4. **Error handling**: Catches Prisma P2002 (unique constraint) and re-throws as `ProjectRegistryConflictError`
5. **Tenant isolation**: Always uses provided `tenantId` (caller responsibility to pass SYSTEM_TENANT_ID)

### Error Class

Added `ProjectRegistryConflictError` to `src/lib/errors.ts`:
- Extends Error with `code = 'CONFLICT'` readonly property
- Stores `field` (e.g., 'jira_project_key') for debugging
- Message format: `Conflict: {field} already exists`

### TDD Test Suite

Created `tests/gateway/admin-projects-registry.test.ts` with 5 test cases:

1. **Happy path**: Creates project with all required fields, returns with generated id
2. **Optional tooling_config**: Persists JSON correctly to DB
3. **Repo URL normalization**: Strips trailing `.git` before storage
4. **Duplicate jira_project_key**: Throws ProjectRegistryConflictError with code='CONFLICT'
5. **Tenant isolation**: Created project has correct tenant_id (SYSTEM_TENANT_ID)

### Test Results

- All 5 tests pass ✓
- No lint errors in new files
- Evidence: `.sisyphus/evidence/task-8-create-tests.log`

### Commit

- `feat(gateway): implement createProject registry service with TDD`
- Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`, `src/lib/errors.ts`
- No AI/Claude references ✓

### Key Decisions

- Used interim `CreateProjectInput` type (not importing from Zod schemas yet, as T3 may still be running)
- Followed `task-creation.ts` pattern for service function signature
- Reused `normalizeRepoUrl` from `src/lib/repo-url.ts` (already extracted in T2)
- Prisma P2002 detection for unique constraint violations (standard Prisma error code)

## [2026-04-08] Task 12: install-runner Module

### Implementation Summary

Created `src/workers/lib/install-runner.ts` with `runInstallCommand` function for executing configurable install commands:

1. **Module**: `src/workers/lib/install-runner.ts`
   - Exports `RunInstallOptions` interface with fields: `installCommand`, `cwd`, `timeoutMs?`
   - Exports `runInstallCommand(opts): Promise<void>` function
   - Uses `execFile` + `promisify` pattern (same as validation-pipeline.ts)
   - Default timeout: 5 minutes (5 * 60 * 1000 ms)
   - Max buffer: 10 MB for stdout/stderr
   - Command splitting: `"pnpm install --frozen-lockfile".split(' ')` → `['pnpm', 'install', '--frozen-lockfile']`

2. **Tests**: `tests/workers/install-runner.test.ts`
   - 6 test cases (exceeds 5 minimum requirement)
   - Happy path: `echo ok` resolves without error
   - Error handling: failing command (exit 1) rejects with error
   - Working directory: verifies `cwd` passed correctly
   - Timeout: command exceeding timeout rejects
   - Arguments: handles multi-arg commands like `echo hello world test`
   - Default timeout: verifies 5-minute default applied
   - All tests pass in 125ms

3. **Key Design Decisions**
   - No error catching inside function — errors propagate to caller (orchestrate.mts T19)
   - Simple string split for command parsing (works for these use cases)
   - Follows validation-pipeline.ts pattern exactly for consistency
   - Interface field name is `install` (not `install_command`) to match T7 ToolingConfig

4. **Build & Verification**
   - `pnpm test -- --run tests/workers/install-runner.test.ts` → 6 tests pass
   - `pnpm build` → TypeScript compile clean
   - No regressions in other test suites
   - Commit: `feat(worker): add install-runner module for configurable install commands`

### Integration Points

- Called from orchestrate.mts (T19) with `toolingConfig.install` command
- Receives install command from `resolveToolingConfig()` (T7)
- Default: `"pnpm install --frozen-lockfile"` from DEFAULT_TOOLING_CONFIG
- Errors propagate naturally — caller handles retry/failure logic

### TDD Approach

- Tests written first in `tests/workers/install-runner.test.ts`
- Implementation followed immediately after
- All tests passed on first run (no iteration needed)
- Demonstrates clean API design and proper error handling


## [2026-04-08] Task 13: Fail-Fast Startup Check for ADMIN_API_KEY

### Implementation

Added fail-fast startup validation for `ADMIN_API_KEY` environment variable:

1. **`src/gateway/server.ts`** — Added check after JIRA_WEBHOOK_SECRET (lines 27-29):
   ```typescript
   if (!process.env.ADMIN_API_KEY) {
     throw new Error('Missing required environment variable: ADMIN_API_KEY');
   }
   ```

2. **`tests/gateway/server-startup.test.ts`** — New test file with 3 test cases:
   - Throws if JIRA_WEBHOOK_SECRET is missing
   - Throws if ADMIN_API_KEY is missing
   - Succeeds when both env vars are set
   - Uses `beforeEach`/`afterEach` to save/restore env vars

3. **`tests/setup.ts`** — Updated `createTestApp()` (line 74):
   - Changed from conditional to default: `process.env.ADMIN_API_KEY = opts?.adminApiKey ?? ADMIN_TEST_KEY`
   - Ensures all tests using createTestApp() have ADMIN_API_KEY set
   - Prevents cascading test failures from missing env var

### Test Results

- ✓ tests/gateway/server-startup.test.ts (3 tests) 12ms
- ✓ pnpm build (no TypeScript errors)
- ✓ All 3 startup validation tests pass

### Key Learnings

- Fail-fast pattern: check env vars at buildApp() entry, before any async operations
- Test isolation: save/restore env vars in afterEach to prevent test pollution
- Test setup: createTestApp() must provide defaults for all required env vars
- Commit: `feat(gateway): fail-fast startup if ADMIN_API_KEY is unset`


## [2026-04-08] Task 9: listProjects and getProjectById Services

### Implementation Summary

Created two query services in `src/gateway/services/project-registry.ts`:

1. **`listProjects(params: { tenantId, prisma, limit?, offset? }): Promise<Project[]>`**
   - Returns projects filtered by tenant_id, ordered by `created_at DESC`
   - Default limit: 50, default offset: 0
   - Silently clamps limit to max 200 (if limit > 200, use 200)
   - Uses Prisma `findMany` with `take` and `skip` for pagination

2. **`getProjectById(params: { id, tenantId, prisma }): Promise<Project | null>`**
   - Returns single project or null if not found
   - Scoped by tenant_id for isolation
   - Uses Prisma `findFirst` with compound WHERE clause

### TDD Test Suite

Created 8 new test cases in `tests/gateway/admin-projects-registry.test.ts`:

1. ✓ `listProjects()` returns array containing seed project (id: '00000000-0000-0000-0000-000000000003')
2. ✓ `listProjects()` returns projects in `created_at DESC` order (create 2, verify order)
3. ✓ `listProjects({ limit: 2 })` respects limit (create 3, verify only 2 returned)
4. ✓ `listProjects({ limit: 500 })` clamps to 200 (verify take: 200 is used)
5. ✓ `listProjects({ offset: 1 })` respects offset (skip first, verify order)
6. ✓ `getProjectById({ id: seed })` returns seed project
7. ✓ `getProjectById({ id: nonexistent })` returns null
8. ✓ `getProjectById` with wrong tenantId returns null (tenant isolation)

### Test Results

- All 13 tests pass (5 existing + 8 new) in 96ms
- No lint errors
- `pnpm build` succeeds with no TypeScript errors

### Key Design Decisions

- **Limit clamping**: `Math.min(limit, 200)` silently clamps without throwing
- **Ordering**: `created_at DESC` ensures newest projects appear first
- **Tenant isolation**: Both functions filter by tenant_id in WHERE clause
- **Null handling**: `getProjectById` returns null (not throwing) for missing records
- **Pagination**: Offset-based (not cursor-based) per requirements

### Commit

- `feat(gateway): implement listProjects and getProjectById services with TDD`
- Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`
- No AI/Claude references ✓

### Integration Points

- `listProjects` will be called by admin GET /api/projects endpoint (future T10)
- `getProjectById` will be called by admin GET /api/projects/:id endpoint (future T10)
- Both follow the service pattern established by `createProject` (T8)
- Both use SYSTEM_TENANT_ID constant (hardcoded, never from request)


## [2026-04-08] Task 10: updateProject Service with TDD

### Implementation Summary

Created `updateProject` function in `src/gateway/services/project-registry.ts`:

1. **Function signature**: `updateProject({ id, input, tenantId, prisma }): Promise<Project | null>`
2. **Input type**: `UpdateProjectInput` (imported from `src/gateway/validation/schemas.js`)
3. **Behavior**:
   - Checks if project exists with `findFirst({ id, tenant_id })`
   - Returns null if not found (not found or wrong tenant)
   - Builds update data from ONLY provided fields (partial update)
   - Normalizes `repo_url` via `normalizeRepoUrl()` if provided
   - Calls `prisma.project.update()` with only the provided fields
   - Catches P2002 (unique constraint) and re-throws as `ProjectRegistryConflictError`
   - Returns updated project row

### Key Design Decisions

- **Partial updates**: Only fields present in `input` are included in update data (using `if (input.field !== undefined)` checks)
- **Replacement semantics for tooling_config**: PATCH with `tooling_config: { install: "bun install" }` replaces the entire JSON, not merged
- **Tenant isolation**: Both findFirst and update scoped by tenant_id
- **Null return on not found**: Consistent with getProjectById pattern (not throwing)
- **Normalization**: repo_url normalized before update (same as createProject)

### TDD Test Suite

Created 6 new test cases in `tests/gateway/admin-projects-registry.test.ts`:

1. ✓ Updates project with partial `name` only — other fields unchanged
2. ✓ Updates `repo_url` and normalizes by removing `.git` suffix
3. ✓ Returns null when project id does not exist
4. ✓ Throws ProjectRegistryConflictError when changing jira_project_key to existing one
5. ✓ Replaces tooling_config entirely (not merged) when provided
6. ✓ Returns null when project exists but tenant_id does not match

### Test Results

- All 19 tests pass (13 existing + 6 new) in 214ms
- No lint errors
- `pnpm build` succeeds with no TypeScript errors

### Code Comments

Added critical comment on line 58:
```typescript
// tooling_config uses replacement semantics — the entire JSON is replaced, not merged
```

This documents the non-obvious PATCH semantics required by the spec.

### Commit

- `feat(gateway): implement updateProject service with TDD`
- Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`
- No AI/Claude references ✓

### Integration Points

- `updateProject` will be called by admin PATCH /api/projects/:id endpoint (future T11)
- Follows the service pattern established by createProject (T8), listProjects (T9), getProjectById (T9)
- Uses SYSTEM_TENANT_ID constant (hardcoded, never from request)
- Reuses normalizeRepoUrl from src/lib/repo-url.ts (extracted in T2)

## [2026-04-08] Task 11: deleteProject with active-task guard

### Implementation Summary

Appended `deleteProject` to `src/gateway/services/project-registry.ts`:

1. **`DeleteProjectResult` type** — 3-member discriminated union (cleaner than the 2-member spec):
   - `{ deleted: true }`
   - `{ deleted: false; reason: 'not_found' }`
   - `{ deleted: false; reason: 'active_tasks'; activeTaskIds: string[] }`

2. **`deleteProject({ id, tenantId, prisma }): Promise<DeleteProjectResult>`**
   - Wraps all DB ops in `prisma.$transaction<DeleteProjectResult>(async (tx) => { ... })`
   - Step 1: `tx.project.findFirst({ where: { id, tenant_id: tenantId } })` → not_found guard
   - Step 2: `tx.task.findMany({ where: { project_id: id, status: { in: ['Ready', 'Executing', 'Submitting'] } }, select: { id: true } })` → active_tasks guard
   - Step 3: `tx.project.delete({ where: { id } })` → `{ deleted: true }`

### Key Design Decisions

- **Discriminated union**: Used 3-member union instead of spec's 2-member with `activeTaskIds?` — better type safety, separates not_found from active_tasks
- **Type parameter on $transaction**: `prisma.$transaction<DeleteProjectResult>` ensures TypeScript verifies each branch returns the correct union member
- **Active statuses**: `['Ready', 'Executing', 'Submitting']` — NOT Done, Cancelled, Received
- **FK behavior**: `project_id` FK is optional (`String?`) in Prisma schema, so default `onDelete` is SetNull — verified by test 9 (BONUS)

### Test Results

- All 28 tests pass (19 existing + 9 new): `✓ tests/gateway/admin-projects-registry.test.ts (28 tests) 191ms`
- `pnpm build` exits 0 (no TypeScript errors)
- Pre-existing lifecycle.test.ts failures (6 Fly hybrid tests) are NOT regressions

### Test Task Creation Pattern

```typescript
await prisma.task.create({
  data: {
    external_id: 'DEL-READY-001',
    source_system: 'jira',
    tenant_id: SYSTEM_TENANT_ID,
    project_id: project.id,
    status: 'Ready',
  },
});
```
Note: Task model has no `title`, `description`, or `raw_payload` fields — the task spec was incorrect. Only `external_id`, `source_system`, `tenant_id`, `project_id`, `status` are needed (rest have defaults or are optional).

### Gotchas

- The task description listed non-existent Task fields (`title`, `description`, `raw_payload`). The actual Task schema only has: `id`, `archetype_id`, `project_id`, `external_id`, `source_system`, `status`, `requirements`, `scope_estimate`, `affected_resources`, `tenant_id`, `raw_event`, `dispatch_attempts`, `failure_reason`, `triage_result`
- Cleanup: `cleanupTestData()` already does `prisma.task.deleteMany({})` (no where clause) — deletes ALL tasks including test ones
- FK SET NULL is verified via test 9: after `tx.project.delete()`, tasks with `project_id = project.id` get `project_id = null` automatically (Prisma default for optional FK)

### Commit

- `feat(gateway): implement deleteProject with active-task guard (TDD)`
- Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`

## [2026-04-08] Task 14: POST /admin/projects route

### Implementation Summary

Created `src/gateway/routes/admin-projects.ts` with `adminProjectRoutes: FastifyPluginAsync<AdminProjectRouteOptions>`:

1. **Plugin structure**: `FastifyPluginAsync<AdminProjectRouteOptions>` where `AdminProjectRouteOptions extends FastifyPluginOptions { prisma?: PrismaClient }`
2. **Auth**: `fastify.addHook('preHandler', requireAdminKey)` — applied to all routes in plugin scope
3. **Handler flow**: `CreateProjectSchema.safeParse(req.body)` → 400 on invalid, `createProject()` → 201 on success, `ProjectRegistryConflictError` → 409, generic → 500
4. **SYSTEM_TENANT_ID**: Defined locally as `const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'` (NOT exported from project-registry.ts)

### Type Mismatch Gotcha

`CreateProjectSchema` (Zod) infers `tooling_config?: ToolingConfigInput` where values are `string | undefined`. The service's `CreateProjectInput` expects `tooling_config?: Record<string, string>`. These are NOT directly assignable in TypeScript because optional keys (`{ install?: string }`) are not compatible with index signatures (`{ [key: string]: string }`). Solution: explicit cast in the spread: `tooling_config: result.data.tooling_config as Record<string, string> | undefined`.

### Test Architecture Decision

`createTestApp()` calls `buildApp()` + `ready()`. Since admin routes are NOT in `server.ts` yet (T18), using `createTestApp()` would mean routes aren't registered. Solution: create a fresh Fastify instance in the test with only `adminProjectRoutes` registered. Uses all helper constants from `tests/setup.ts` (ADMIN_TEST_KEY, getPrisma, cleanupTestData, disconnectPrisma) but NOT `createTestApp()`.

Key insight: fresh Fastify instance for route-specific tests is clean, fast, and avoids plugin registration ordering issues.

### Test Results

- All 6 tests pass in 57ms
- `pnpm build` exits 0 (no TypeScript errors)
- Commit: `feat(gateway): add POST /admin/projects route for project registration`

### Fastify Plugin Encapsulation Note

`fastify.addHook('preHandler', requireAdminKey)` inside a plugin scope applies ONLY to routes in that same plugin scope — does NOT affect `/webhooks/jira`, `/health`, etc. This is the correct behavior for route-level auth.
