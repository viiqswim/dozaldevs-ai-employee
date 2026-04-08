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
