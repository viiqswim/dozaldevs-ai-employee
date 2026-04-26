# PLAT-04: Configurable AGENTS.md per AI Employee

## TL;DR

> **Quick Summary**: Add a nullable `agents_md` text column to the `archetypes` table and implement three-level fallback resolution in the OpenCode harness (`archetype.agents_md` → `tenant.config.default_agents_md` → static platform default), so different AI employees can have different behavioral boundaries without a Docker rebuild.
>
> **Deliverables**:
>
> - Prisma migration adding `agents_md` column to `archetypes`
> - Tenant config updated with `default_agents_md` in seed
> - `agents-md-resolver.mts` — pure, testable fallback resolver module
> - Harness wired to resolve and write `/app/AGENTS.md` at runtime
> - Automated tests: migration, seed data, resolver unit tests
> - API/PostgREST verification of seeded data
> - Story map items marked as complete
>
> **Estimated Effort**: Short (1-2 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 8 → Task 9

---

## Context

### Original Request

Implement PLAT-04 from `docs/2026-04-21-2202-phase1-story-map.md`. Add configurable AGENTS.md per AI Employee with three-level fallback resolution, test thoroughly with automated tests and API endpoint verification, and mark story map items as completed.

### Interview Summary

**Key Discussions**:

- PLAT-02 (static AGENTS.md) is fully complete — `src/workers/config/agents.md` copied to `/app/AGENTS.md` in Docker image
- The harness has NO existing dynamic AGENTS.md logic — this is net-new
- Both daily-summarizer archetypes should be seeded with the PLAT-02 static content
- Both tenants should have `default_agents_md` in their config (also PLAT-02 content)

**Research Findings**:

- Archetype model uses `String? @db.Text` for long text (consistent with `system_prompt`, `instructions`)
- Tenant `config` is `Json?` — no schema change needed for `default_agents_md`
- Harness loads archetype via PostgREST join at line 244: `db.get('tasks', 'id=eq.${TASK_ID}&select=*,archetypes(*)')`
- Harness does NOT query tenants table — needs a second PostgREST query for tenant config
- `ArchetypeRow` interface (lines 17-25) needs `agents_md` added
- Injection point: between `writeOpencodeAuth()` (step 5) and `runOpencodeSession()` (step 7)
- No dedicated harness test file exists — module-level side effects make it untestable directly
- Migration test pattern: live Prisma + `$queryRaw` against `information_schema.columns`
- PostgREST client tested via `vi.stubGlobal('fetch', mockFetch)` pattern

### Metis Review

**Identified Gaps** (addressed):

- **Null/empty guard**: MUST only write to `/app/AGENTS.md` when resolved content is a non-empty string — never overwrite with null/empty
- **Empty string fallthrough**: Treat `agents_md = ""` same as `null` — fall through to next level
- **Null `tenant_id`**: Skip tenant query if `task.tenant_id` is null — proceed to static fallback
- **PostgREST failure**: If tenant query returns null (error), fall through to static — don't crash
- **Testability**: Extract `resolveAgentsMd()` into `src/workers/lib/agents-md-resolver.mts` — pure function, testable without harness side effects
- **Seed content source**: Read `agents_md` content from `src/workers/config/agents.md` via `fs.readFileSync` at seed-time — prevents drift
- **`prisma generate`**: Must run after migration before TypeScript compilation
- **Existing test preservation**: `tests/workers/config/agents-md-content.test.ts` must NOT be modified

---

## Work Objectives

### Core Objective

Enable per-archetype AGENTS.md configuration with a three-level fallback (`archetype` → `tenant default` → `platform static file`), so different AI employees can have different behavioral boundaries.

### Concrete Deliverables

- `prisma/migrations/YYYYMMDDHHMMSS_add_agents_md_to_archetypes/migration.sql` — adds `agents_md TEXT` nullable column
- `prisma/schema.prisma` — `agents_md String? @db.Text` on Archetype model
- `src/workers/lib/agents-md-resolver.mts` — pure function: `resolveAgentsMd(archetype, tenantConfig) → string | null`
- `src/workers/opencode-harness.mts` — wired to call resolver and write `/app/AGENTS.md` before OpenCode start
- `prisma/seed.ts` — both archetypes seeded with `agents_md`, both tenants seeded with `config.default_agents_md`
- `tests/workers/lib/agents-md-resolver.test.ts` — unit tests for all fallback levels + edge cases
- `tests/gateway/migration-agents-md.test.ts` — column existence + type + seed data verification
- `docs/2026-04-21-2202-phase1-story-map.md` — PLAT-04 items marked `[x]`

### Definition of Done

- [ ] `pnpm prisma migrate dev --name add_agents_md_to_archetypes` succeeds
- [ ] `pnpm prisma db seed` runs without error
- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes (all new + existing tests)
- [ ] PostgREST query returns `agents_md` on archetype rows
- [ ] PostgREST query returns `default_agents_md` in tenant config
- [ ] PLAT-04 acceptance criteria in story map all marked `[x]`

### Must Have

- Nullable `agents_md` column on `archetypes` table (backward compatible)
- Three-level fallback: archetype → tenant config → static file
- Non-empty guard on `fs.writeFile` (never overwrite static with empty/null)
- Seed data for both existing archetypes and both tenants
- Automated tests covering all three fallback levels
- Empty string treated same as null (fall through)

### Must NOT Have (Guardrails)

- **NO Dockerfile changes** — static `/app/AGENTS.md` from PLAT-02 stays as-is
- **NO Admin API endpoint for `agents_md`** — out of scope for PLAT-04
- **NO validation of AGENTS.md markdown structure** — content is opaque text
- **NO caching of tenant config query** — premature optimization
- **NO modification of `tests/workers/config/agents-md-content.test.ts`** — existing static file test
- **NO direct import of `opencode-harness.mts` in any test file** — module-level IIFE crashes test runner
- **NO overwriting `/app/AGENTS.md` with empty or null content** — guard with non-empty check

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (already configured)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Migration/Schema**: Use Bash — `pnpm prisma migrate dev`, `pnpm prisma db seed`, Prisma `$queryRaw`
- **Module/Library**: Use Bash — `pnpm test -- --run <test-file>`
- **API/PostgREST**: Use Bash (curl) — query PostgREST, assert JSON fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, 2 parallel):
├── Task 1: Prisma schema + migration [quick]
└── Task 2: Create agents-md-resolver module [quick]

Wave 2 (After Wave 1 — implementation + tests, 4 parallel):
├── Task 3: Update seed.ts (depends: 1) [quick]
├── Task 4: Wire resolver into harness (depends: 2) [unspecified-high]
├── Task 5: Resolver unit tests (depends: 2) [quick]
└── Task 6: Migration + schema tests (depends: 1) [quick]

Wave 3 (After Wave 2 — verification + closing, 3 parallel):
├── Task 7: Seed data verification tests (depends: 3, 6) [quick]
├── Task 8: Build + full test suite + API verification (depends: 3, 4, 5, 6) [unspecified-high]
└── Task 9: Mark story map items as complete (depends: 8) [quick]

Wave 4 (After Wave 3 — notification):
└── Task 10: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 8 → Task 9 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 2)
```

### Dependency Matrix

| Task | Depends On    | Blocks | Wave |
| ---- | ------------- | ------ | ---- |
| 1    | —             | 3, 6   | 1    |
| 2    | —             | 4, 5   | 1    |
| 3    | 1             | 7, 8   | 2    |
| 4    | 2             | 8      | 2    |
| 5    | 2             | 8      | 2    |
| 6    | 1             | 7, 8   | 2    |
| 7    | 3, 6          | 8      | 3    |
| 8    | 3, 4, 5, 6, 7 | 9      | 3    |
| 9    | 8             | 10     | 3    |
| 10   | 9             | F1-F4  | 4    |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **4** — T3 → `quick`, T4 → `unspecified-high`, T5 → `quick`, T6 → `quick`
- **Wave 3**: **3** — T7 → `quick`, T8 → `unspecified-high`, T9 → `quick`
- **Wave 4**: **1** — T10 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma Schema + Migration — Add `agents_md` Column

  **What to do**:
  - Add `agents_md String? @db.Text` to the `Archetype` model in `prisma/schema.prisma`, after the `instructions` field (line 213)
  - Run `pnpm prisma migrate dev --name add_agents_md_to_archetypes` to generate and apply the migration
  - Run `pnpm prisma generate` to regenerate the Prisma client with the new field
  - Verify the generated migration SQL is: `ALTER TABLE "archetypes" ADD COLUMN "agents_md" TEXT;`

  **Must NOT do**:
  - Do NOT modify any other model or table
  - Do NOT add any constraints (NOT NULL, DEFAULT, etc.) — the column must be nullable with no default
  - Do NOT touch the `Tenant` model — `config` is already `Json?` and needs no schema change

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single field addition to Prisma schema + standard migration command
  - **Skills**: []
    - No special skills needed — standard Prisma workflow

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:212-213` — existing `String? @db.Text` pattern for `system_prompt` and `instructions` — follow this exact syntax for `agents_md`
  - `prisma/migrations/20260422224712_add_system_events_table/` — latest migration, use as naming convention reference

  **API/Type References**:
  - `prisma/schema.prisma:199-228` — full Archetype model definition, add new field after line 213

  **WHY Each Reference Matters**:
  - `system_prompt` and `instructions` are the closest analogues — same data type, same nullable pattern, same use case (long text content per archetype)
  - Latest migration shows the naming convention: `YYYYMMDDHHMMSS_snake_case_description`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration creates agents_md column successfully
    Tool: Bash
    Preconditions: Database running on localhost:54322, prisma migrations applied
    Steps:
      1. Run `pnpm prisma migrate dev --name add_agents_md_to_archetypes`
      2. Run `pnpm prisma generate`
      3. Query: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='archetypes' AND column_name='agents_md'"`
    Expected Result: Column exists with `data_type = 'text'` and `is_nullable = 'YES'`
    Failure Indicators: Column not found, wrong data type, or NOT NULL constraint
    Evidence: .sisyphus/evidence/task-1-migration-column-exists.txt

  Scenario: Existing data is preserved (no data loss)
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Query: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, role_name, agents_md FROM archetypes"`
      2. Verify existing rows have `agents_md = NULL` (not empty string)
    Expected Result: All existing archetype rows preserved, `agents_md` is NULL for all
    Failure Indicators: Missing rows, non-NULL agents_md before seed
    Evidence: .sisyphus/evidence/task-1-existing-data-preserved.txt
  ```

  **Commit**: YES (group 1)
  - Message: `feat(schema): add agents_md column to archetypes table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/YYYYMMDDHHMMSS_add_agents_md_to_archetypes/migration.sql`
  - Pre-commit: `pnpm build`

---

- [x] 2. Create `agents-md-resolver` Module — Pure Fallback Function

  **What to do**:
  - Create `src/workers/lib/agents-md-resolver.mts` with a single exported pure function:
    ```typescript
    export function resolveAgentsMd(
      archetype: { agents_md?: string | null } | null,
      tenantConfig: Record<string, unknown> | null,
    ): string | null;
    ```
  - Resolution order:
    1. If `archetype?.agents_md` is a non-empty string (after `.trim()`), return it
    2. If `tenantConfig?.default_agents_md` is a non-empty string (after `.trim()`), return it
    3. Return `null` (caller will leave the static `/app/AGENTS.md` untouched)
  - Treat empty string (`""`) and whitespace-only the same as `null` — fall through
  - The function is pure: no I/O, no imports, no side effects — just string resolution logic
  - Add a brief JSDoc explaining the three-level fallback and that `null` means "use static file"

  **Must NOT do**:
  - Do NOT import `fs` or any I/O module — this is a pure function
  - Do NOT read from the filesystem — the harness handles file writing
  - Do NOT add validation of AGENTS.md content structure
  - Do NOT add logging — the harness handles logging

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single small module with one pure function, no dependencies
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/lib/postgrest-client.ts` — existing worker lib module pattern (factory export, TypeScript, .ts extension but used as .mts in harness imports)
  - `src/workers/opencode-harness.mts:17-25` — `ArchetypeRow` interface showing the data shape the resolver will receive

  **WHY Each Reference Matters**:
  - `postgrest-client.ts` shows the established module pattern for `src/workers/lib/` — follow its export style
  - `ArchetypeRow` shows what fields are available — the resolver should accept a partial type (just `agents_md`) for flexibility

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Module exports resolveAgentsMd function
    Tool: Bash
    Preconditions: File created at src/workers/lib/agents-md-resolver.mts
    Steps:
      1. Run `pnpm build` to verify TypeScript compilation
      2. Verify `dist/workers/lib/agents-md-resolver.mjs` exists
    Expected Result: Build succeeds, compiled output exists
    Failure Indicators: TypeScript compilation error, missing output
    Evidence: .sisyphus/evidence/task-2-module-compiles.txt

  Scenario: Function signature matches contract
    Tool: Bash
    Preconditions: File created
    Steps:
      1. Run `grep -n "export function resolveAgentsMd" src/workers/lib/agents-md-resolver.mts`
      2. Verify function is exported and takes two parameters
    Expected Result: Single exported function with archetype and tenantConfig params
    Failure Indicators: Function not exported, wrong parameter count/types
    Evidence: .sisyphus/evidence/task-2-function-signature.txt
  ```

  **Commit**: YES (group 2)
  - Message: `feat(workers): add agents-md-resolver with three-level fallback`
  - Files: `src/workers/lib/agents-md-resolver.mts`
  - Pre-commit: `pnpm build`

---

- [x] 3. Update Seed File — Add `agents_md` and `default_agents_md`

  **What to do**:
  - In `prisma/seed.ts`, at the top of the file (near other constants like `PAPI_CHULO_SYSTEM_PROMPT`), read the platform default AGENTS.md content:
    ```typescript
    const PLATFORM_AGENTS_MD = fs.readFileSync(
      path.join(__dirname, '../src/workers/config/agents.md'),
      'utf8',
    );
    ```
  - Add `agents_md: PLATFORM_AGENTS_MD` to BOTH archetype upserts (DozalDevs `...0012` and VLRE `...0013`) in both `create` and `update` blocks
  - Add `default_agents_md: PLATFORM_AGENTS_MD` to BOTH tenant upserts (DozalDevs `...0002` and VLRE `...0003`) inside the `config` object as a sibling to `summary`:
    ```typescript
    config: {
      summary: { /* existing */ },
      default_agents_md: PLATFORM_AGENTS_MD,
    },
    ```
  - Ensure `fs` and `path` are imported at the top of the seed file (may already be imported)
  - Run `pnpm prisma db seed` to verify it works
  - The `(prisma.archetype as any).upsert` cast already exists — no additional cast needed

  **Must NOT do**:
  - Do NOT hardcode the AGENTS.md content as an inline string — read from the canonical source file
  - Do NOT modify the `summary` sub-object structure — only add `default_agents_md` as a new sibling key
  - Do NOT change the tenant `slug` (immutable after creation)
  - Do NOT remove any existing seed data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding fields to existing upsert pattern, reading a file — straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 1 (migration must be applied first)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:190-220` — DozalDevs archetype upsert pattern with `(prisma.archetype as any).upsert` cast — add `agents_md` to both `create` and `update` blocks
  - `prisma/seed.ts:227-257` — VLRE archetype upsert — same pattern, same change
  - `prisma/seed.ts:29-55` — DozalDevs tenant upsert — add `default_agents_md` to `config` in both `create` and `update`
  - `prisma/seed.ts:58-85` — VLRE tenant upsert — same pattern

  **API/Type References**:
  - `src/workers/config/agents.md` — canonical AGENTS.md content to read via `fs.readFileSync` — this is the platform default from PLAT-02

  **WHY Each Reference Matters**:
  - The four upsert patterns show exactly where to insert the new fields and maintain the existing structure
  - `src/workers/config/agents.md` is the single source of truth — reading it at seed-time prevents content drift

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully with agents_md
    Tool: Bash
    Preconditions: Migration from Task 1 applied
    Steps:
      1. Run `pnpm prisma db seed`
      2. Query: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, role_name, LENGTH(agents_md) as agents_md_length FROM archetypes WHERE id IN ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000013')"`
    Expected Result: Both archetypes have non-null agents_md with length > 0
    Failure Indicators: Seed fails, agents_md is null, agents_md is empty
    Evidence: .sisyphus/evidence/task-3-seed-agents-md.txt

  Scenario: Tenant config includes default_agents_md
    Tool: Bash
    Preconditions: Seed applied
    Steps:
      1. Query: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, name, config->>'default_agents_md' IS NOT NULL as has_default FROM tenants WHERE id IN ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')"`
    Expected Result: Both tenants show `has_default = true`
    Failure Indicators: default_agents_md missing from config JSON
    Evidence: .sisyphus/evidence/task-3-tenant-default-agents-md.txt

  Scenario: Seed is idempotent (run twice without error)
    Tool: Bash
    Preconditions: Seed already applied once
    Steps:
      1. Run `pnpm prisma db seed` a second time
      2. Verify exit code is 0
    Expected Result: No errors, upserts succeed idempotently
    Failure Indicators: Unique constraint violation, non-zero exit
    Evidence: .sisyphus/evidence/task-3-seed-idempotent.txt
  ```

  **Commit**: YES (group 3)
  - Message: `feat(seed): seed agents_md for archetypes and default_agents_md for tenants`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm prisma db seed`

- [x] 4. Wire Resolver into OpenCode Harness

  **What to do**:
  - In `src/workers/opencode-harness.mts`:
    1. Add `agents_md?: string | null` to the `ArchetypeRow` interface (lines 17-25)
    2. Import the resolver: `import { resolveAgentsMd } from './lib/agents-md-resolver.mjs';`
    3. After the archetype data extraction block (around line 267) and before `runOpencodeSession()` call (line 321), add the AGENTS.md resolution and write logic:
       - Query tenant config via PostgREST: `const tenantRows = await db.get('tenants', \`id=eq.${task.tenant_id}&select=config\`);`— only if`task.tenant_id` is non-null
       - Extract tenant config: `const tenantConfig = tenantRows?.[0]?.config ?? null;`
       - Call resolver: `const agentsMdContent = resolveAgentsMd(archetype, tenantConfig);`
       - If `agentsMdContent` is non-null and non-empty, write to `/app/AGENTS.md`:
         ```typescript
         if (agentsMdContent && agentsMdContent.trim().length > 0) {
           const { writeFile } = await import('node:fs/promises');
           await writeFile('/app/AGENTS.md', agentsMdContent, 'utf8');
           logger.info(
             'Wrote dynamic AGENTS.md from %s',
             archetype.agents_md ? 'archetype' : 'tenant default',
           );
         } else {
           logger.info('Using static platform AGENTS.md (no dynamic override configured)');
         }
         ```
    4. Handle errors gracefully: if the tenant query fails or the resolver throws, log a warning and proceed with the static file — do NOT crash the harness

  **Must NOT do**:
  - Do NOT modify `writeOpencodeAuth()` or `runOpencodeSession()` functions
  - Do NOT change the existing archetype loading query at line 244 — add a separate tenant query
  - Do NOT add any new command-line arguments or environment variables
  - Do NOT add caching of the tenant config query
  - Do NOT write to `/app/AGENTS.md` if the resolved content is null/empty — leave the static file

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifying a critical runtime file (harness) with I/O operations, error handling, and PostgREST integration requires careful attention
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 2 (resolver module must exist)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:244-267` — existing PostgREST query pattern for task+archetype — follow the same null-check and error handling pattern for the tenant query
  - `src/workers/opencode-harness.mts:112-131` — `writeOpencodeAuth()` function — shows the `await import('node:fs/promises')` dynamic import pattern to follow for `writeFile`
  - `src/workers/opencode-harness.mts:17-25` — `ArchetypeRow` interface — add `agents_md` field here
  - `src/workers/opencode-harness.mts:315-321` — injection point: after `writeOpencodeAuth()` call, before `runOpencodeSession()` call

  **API/Type References**:
  - `src/workers/lib/agents-md-resolver.mts` — the resolver function signature (from Task 2)
  - `src/workers/lib/postgrest-client.ts` — `PostgRESTClient.get()` API: returns `unknown[] | null`

  **WHY Each Reference Matters**:
  - Line 244 query pattern ensures consistent error handling with the rest of the harness
  - `writeOpencodeAuth` uses dynamic `import('node:fs/promises')` — the AGENTS.md write must use the same pattern (not top-level import) for consistency and to avoid module-level side effects
  - `ArchetypeRow` must be updated so TypeScript doesn't complain when accessing `archetype.agents_md`
  - Lines 315-321 are the exact injection point — AGENTS.md must be written between auth setup and OpenCode start

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness compiles with resolver wired in
    Tool: Bash
    Preconditions: Tasks 1 and 2 complete (migration applied, resolver module exists)
    Steps:
      1. Run `pnpm build`
      2. Verify `dist/workers/opencode-harness.mjs` exists and is newer than source
      3. Run `grep -c "resolveAgentsMd" dist/workers/opencode-harness.mjs`
    Expected Result: Build succeeds, compiled output contains resolveAgentsMd reference
    Failure Indicators: TypeScript compilation error, missing import
    Evidence: .sisyphus/evidence/task-4-harness-compiles.txt

  Scenario: ArchetypeRow interface includes agents_md
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run `grep -A2 "agents_md" src/workers/opencode-harness.mts`
      2. Verify the field is in the ArchetypeRow interface as optional nullable
    Expected Result: `agents_md?: string | null` present in interface
    Failure Indicators: Field missing or wrong type
    Evidence: .sisyphus/evidence/task-4-archetype-row-interface.txt

  Scenario: Non-empty guard prevents null overwrite
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run `grep -n "trim().length" src/workers/opencode-harness.mts`
      2. Verify the guard condition exists before writeFile call
    Expected Result: Non-empty check guards the writeFile call
    Failure Indicators: Missing guard, writeFile called unconditionally
    Evidence: .sisyphus/evidence/task-4-non-empty-guard.txt
  ```

  **Commit**: YES (group 4)
  - Message: `feat(harness): wire agents-md-resolver into opencode-harness`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

---

- [x] 5. Resolver Unit Tests — All Fallback Levels + Edge Cases

  **What to do**:
  - Create `tests/workers/lib/agents-md-resolver.test.ts` with the following test cases:
    1. **Level 1 — archetype has agents_md**: When `archetype.agents_md` is a non-empty string, return it
    2. **Level 2 — archetype null, tenant has default**: When `archetype.agents_md` is null but `tenantConfig.default_agents_md` is set, return tenant value
    3. **Level 3 — both null**: When both archetype and tenant are null/missing, return `null`
    4. **Empty string fallthrough**: When `archetype.agents_md = ""`, treat as null and check tenant level
    5. **Whitespace-only fallthrough**: When `archetype.agents_md = "  "`, treat as null and check tenant level
    6. **Null archetype object**: When archetype itself is null, fall through to tenant level
    7. **Null tenantConfig**: When tenantConfig is null, fall through to return null
    8. **Tenant empty string**: When tenant `default_agents_md = ""`, return null (don't use empty)
    9. **Priority**: When both archetype and tenant have content, archetype wins
  - Follow the test conventions: `import { describe, it, expect } from 'vitest'`, no mocking needed (pure function)

  **Must NOT do**:
  - Do NOT import `opencode-harness.mts` — module-level IIFE will crash the test runner
  - Do NOT modify `tests/workers/config/agents-md-content.test.ts` — that tests the static file
  - Do NOT add file system or network mocking — the resolver is a pure function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Unit tests for a pure function — no mocking, no I/O, straightforward assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6)
  - **Blocks**: Task 8
  - **Blocked By**: Task 2 (resolver module must exist to import)

  **References**:

  **Pattern References**:
  - `tests/workers/lib/postgrest-client.test.ts` — existing test in same directory, shows import path pattern and Vitest conventions
  - `src/workers/lib/agents-md-resolver.mts` — the module under test (from Task 2)

  **WHY Each Reference Matters**:
  - `postgrest-client.test.ts` is the closest analogue test — same directory, same Vitest conventions, shows how to import from `src/workers/lib/`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All resolver unit tests pass
    Tool: Bash
    Preconditions: Task 2 complete (resolver module exists)
    Steps:
      1. Run `pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts`
      2. Verify all 9 test cases pass
    Expected Result: 9 tests pass, 0 failures
    Failure Indicators: Any test failure, import error, missing test case
    Evidence: .sisyphus/evidence/task-5-resolver-tests-pass.txt

  Scenario: Tests cover edge cases (empty string, null, whitespace)
    Tool: Bash
    Preconditions: Test file exists
    Steps:
      1. Run `grep -c "it(" tests/workers/lib/agents-md-resolver.test.ts`
      2. Verify at least 9 test cases exist
    Expected Result: 9+ test cases covering all edge cases
    Failure Indicators: Fewer than 9 tests, missing edge cases
    Evidence: .sisyphus/evidence/task-5-test-count.txt
  ```

  **Commit**: YES (group 5, with Tasks 6 and 7)
  - Message: `test: add agents-md-resolver, migration, and seed verification tests`
  - Files: `tests/workers/lib/agents-md-resolver.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/agents-md-resolver.test.ts`

---

- [x] 6. Migration + Schema Tests — Column Existence and Type Verification

  **What to do**:
  - Create `tests/gateway/migration-agents-md.test.ts` following the pattern from `tests/gateway/migration.test.ts`
  - Test cases:
    1. **Column exists**: `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='archetypes' AND column_name='agents_md'` — assert 1 row
    2. **Column type is text**: Same query with `data_type` — assert `data_type = 'text'`
    3. **Column is nullable**: Same query with `is_nullable` — assert `is_nullable = 'YES'`
    4. **No default value**: Verify `column_default IS NULL`
  - Use `getPrisma()` from `tests/setup.ts` and `$queryRaw` pattern
  - Add `afterAll(() => disconnectPrisma())` cleanup

  **Must NOT do**:
  - Do NOT modify `tests/gateway/migration.test.ts` — create a new file
  - Do NOT modify `tests/schema.test.ts` — the table count assertion (19 tables) is unaffected by a column addition

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small test file following an established pattern — copy and adapt
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 1 (migration must be applied)

  **References**:

  **Pattern References**:
  - `tests/gateway/migration.test.ts` — canonical migration test pattern — copy structure exactly: imports, `getPrisma()`, `$queryRaw`, `information_schema.columns` query, `afterAll(disconnectPrisma)`
  - `tests/setup.ts` — shared test infrastructure: `getPrisma()`, `disconnectPrisma()`

  **WHY Each Reference Matters**:
  - `migration.test.ts` is the exact pattern to follow — same `$queryRaw` against `information_schema.columns`, same setup/teardown
  - `tests/setup.ts` provides the Prisma singleton — don't create a new connection

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration tests pass
    Tool: Bash
    Preconditions: Task 1 complete (migration applied)
    Steps:
      1. Run `pnpm test -- --run tests/gateway/migration-agents-md.test.ts`
      2. Verify all 4 test cases pass
    Expected Result: 4 tests pass, 0 failures
    Failure Indicators: Column not found, wrong type, wrong nullability
    Evidence: .sisyphus/evidence/task-6-migration-tests-pass.txt
  ```

  **Commit**: YES (group 5, with Tasks 5 and 7)
  - Message: `test: add agents-md-resolver, migration, and seed verification tests`
  - Files: `tests/gateway/migration-agents-md.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/migration-agents-md.test.ts`

- [x] 7. Seed Data Verification Tests — `agents_md` and `default_agents_md`

  **What to do**:
  - Add to the existing `tests/gateway/migration-agents-md.test.ts` file (from Task 6) a new `describe` block for seed data verification:
    1. **Archetype agents_md is seeded (DozalDevs)**: Query archetype `00000000-0000-0000-0000-000000000012`, assert `agents_md` is non-null and contains `"AI Employee Worker"` (from the static file header)
    2. **Archetype agents_md is seeded (VLRE)**: Same for `00000000-0000-0000-0000-000000000013`
    3. **Archetype agents_md matches static file**: Verify both archetypes' `agents_md` content equals the content of `src/workers/config/agents.md` (read via `fs.readFileSync`)
    4. **Tenant config default_agents_md is seeded (DozalDevs)**: Query tenant `00000000-0000-0000-0000-000000000002`, assert `config->>'default_agents_md'` is non-null
    5. **Tenant config default_agents_md is seeded (VLRE)**: Same for `00000000-0000-0000-0000-000000000003`
    6. **Tenant default matches static file**: Verify tenant `default_agents_md` equals static file content
  - Use `getPrisma()` and `$queryRaw` pattern for all queries

  **Must NOT do**:
  - Do NOT modify `tests/schema.test.ts` — keep new tests in the migration-agents-md file
  - Do NOT hardcode expected AGENTS.md content in tests — read from `src/workers/config/agents.md`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Extending an existing test file with additional describe block — simple queries and assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 3 (seed must be updated), 6 (test file must exist)

  **References**:

  **Pattern References**:
  - `tests/gateway/migration-agents-md.test.ts` — the file from Task 6, add a new `describe('Seed data verification')` block
  - `tests/schema.test.ts` — Group 4 "Seed data verification" shows the pattern for querying seed data by known UUID

  **API/Type References**:
  - DozalDevs archetype ID: `00000000-0000-0000-0000-000000000012`
  - VLRE archetype ID: `00000000-0000-0000-0000-000000000013`
  - DozalDevs tenant ID: `00000000-0000-0000-0000-000000000002`
  - VLRE tenant ID: `00000000-0000-0000-0000-000000000003`

  **WHY Each Reference Matters**:
  - Using the same test file from Task 6 keeps all PLAT-04 tests in one place
  - Known UUIDs from seed ensure deterministic queries

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed data tests pass
    Tool: Bash
    Preconditions: Tasks 3 and 6 complete (seed applied, test file exists)
    Steps:
      1. Run `pnpm prisma db seed` (ensure latest seed is applied)
      2. Run `pnpm test -- --run tests/gateway/migration-agents-md.test.ts`
      3. Verify all tests pass (migration + seed data)
    Expected Result: All tests pass (4 migration + 6 seed = 10 total)
    Failure Indicators: Seed data not found, content mismatch, null values
    Evidence: .sisyphus/evidence/task-7-seed-tests-pass.txt
  ```

  **Commit**: YES (group 5, with Tasks 5 and 6)
  - Message: `test: add agents-md-resolver, migration, and seed verification tests`
  - Files: `tests/gateway/migration-agents-md.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/migration-agents-md.test.ts`

---

- [x] 8. Build + Full Test Suite + API Verification

  **What to do**:
  - Run the complete verification sequence:
    1. `pnpm build` — verify TypeScript compilation succeeds (exit 0)
    2. `pnpm prisma db seed` — verify seed runs without error (exit 0)
    3. `pnpm test -- --run` — verify ALL tests pass (new + existing)
    4. PostgREST verification — query the local PostgREST (Kong at port 54331) to verify the data is accessible via REST API:

       ```bash
       # Verify archetype agents_md via PostgREST
       curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000012&select=id,role_name,agents_md" \
         -H "apikey: ${SUPABASE_ANON_KEY}" \
         -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}"
       # Assert: agents_md is non-null, contains "AI Employee Worker"

       # Verify tenant config via PostgREST
       curl -s "http://localhost:54331/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000002&select=id,name,config" \
         -H "apikey: ${SUPABASE_ANON_KEY}" \
         -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}"
       # Assert: config.default_agents_md is non-null
       ```

    5. Verify that the trigger dry-run endpoint still works (no regression):
       ```bash
       curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-summarizer/trigger?dry_run=true" \
         -H "X-Admin-Key: ${ADMIN_API_KEY}" \
         -H "Content-Type: application/json" -d '{}'
       # Assert: 200 OK with archetype info
       ```

  - Fix any failures before marking complete

  **Must NOT do**:
  - Do NOT skip any verification step
  - Do NOT ignore pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`) — these are known and expected
  - Do NOT modify test files to make them pass — fix the source code instead

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full verification sweep across build, tests, seed, and API — needs careful analysis of results
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Tasks 3, 4, 5, 6, 7 complete)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `AGENTS.md` (project root) — PostgREST port is 54331 (Kong), see "Port Assignments" section
  - `AGENTS.md` — Admin API: `POST /admin/tenants/:tenantId/employees/:slug/trigger?dry_run=true` requires `X-Admin-Key` header

  **External References**:
  - SUPABASE_ANON_KEY and SUPABASE_SECRET_KEY are in `.env` — load them before running curl commands
  - ADMIN_API_KEY is in `.env` — needed for trigger dry-run

  **WHY Each Reference Matters**:
  - PostgREST port (54331) is Kong proxy, not direct PostgREST — use the correct port
  - The trigger dry-run verifies the full archetype loading path hasn't regressed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `pnpm build`
      2. Verify exit code 0
    Expected Result: TypeScript compilation succeeds with no errors
    Failure Indicators: Non-zero exit code, TypeScript errors
    Evidence: .sisyphus/evidence/task-8-build-success.txt

  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: Build succeeds, seed applied
    Steps:
      1. Run `pnpm test -- --run`
      2. Count passing/failing tests
    Expected Result: All tests pass (except known pre-existing failures: container-boot, inngest-serve)
    Failure Indicators: New test failures (not in pre-existing list)
    Evidence: .sisyphus/evidence/task-8-test-suite.txt

  Scenario: PostgREST returns agents_md on archetype
    Tool: Bash (curl)
    Preconditions: Seed applied, Docker Compose running (Kong on 54331)
    Steps:
      1. Load env vars from .env
      2. curl GET archetypes with id filter and agents_md select
      3. Parse JSON response, check agents_md field
    Expected Result: JSON array with one object, agents_md is a non-null string containing "AI Employee Worker"
    Failure Indicators: agents_md is null, empty, or missing from response
    Evidence: .sisyphus/evidence/task-8-postgrest-archetype.json

  Scenario: PostgREST returns default_agents_md in tenant config
    Tool: Bash (curl)
    Preconditions: Same as above
    Steps:
      1. curl GET tenants with id filter and config select
      2. Parse JSON, navigate config.default_agents_md
    Expected Result: config object contains default_agents_md as non-null string
    Failure Indicators: default_agents_md missing from config JSON
    Evidence: .sisyphus/evidence/task-8-postgrest-tenant.json

  Scenario: Trigger dry-run still works (no regression)
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. POST to trigger dry-run endpoint for daily-summarizer on VLRE tenant
      2. Verify 200 response with archetype info
    Expected Result: 200 OK, response includes archetype data
    Failure Indicators: Non-200 status, error response
    Evidence: .sisyphus/evidence/task-8-trigger-dryrun.json
  ```

  **Commit**: NO (verification only — no code changes)

---

- [x] 9. Mark Story Map Items as Complete

  **What to do**:
  - In `docs/2026-04-21-2202-phase1-story-map.md`, find the PLAT-04 acceptance criteria section (lines 345-351) and change all `[ ]` to `[x]`:
    ```markdown
    - [x] Prisma migration adds nullable `agents_md` (text) column to `archetypes` table
    - [x] `tenants.config` JSON schema updated to support `default_agents_md` (string, nullable)
    - [x] Harness resolves and writes `/app/AGENTS.md` using the three-level fallback before starting OpenCode
    - [x] Existing archetypes (`daily-summarizer` for both tenants) seeded with appropriate `agents_md` content in `prisma/seed.ts`
    - [x] `pnpm prisma db seed` runs without error and upserts `agents_md` correctly
    - [x] `pnpm build` exits 0, `pnpm test -- --run` passes
    - [x] AGENTS.md content for at least VLRE tenant is documented and reviewed by `[vlre-ops]`
    ```
  - Only mark items as complete — do NOT modify any other part of the story map

  **Must NOT do**:
  - Do NOT modify any other story's acceptance criteria
  - Do NOT change the story description or attributes
  - Do NOT mark items from other stories (HF-05, HF-06, GM-01, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple text replacement in a markdown file — find and replace `[ ]` with `[x]`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 8)
  - **Blocks**: Task 10
  - **Blocked By**: Task 8 (must verify everything passes before marking complete)

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:345-351` — the exact lines containing PLAT-04 acceptance criteria to update

  **WHY Each Reference Matters**:
  - These are the exact lines that need `[ ]` → `[x]` replacement — no ambiguity about what to change

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All PLAT-04 items marked complete
    Tool: Bash
    Preconditions: Task 8 verified everything passes
    Steps:
      1. Run `grep -c "\- \[x\]" docs/2026-04-21-2202-phase1-story-map.md` near PLAT-04 section
      2. Run `grep -A10 "PLAT-04" docs/2026-04-21-2202-phase1-story-map.md | grep -c "\- \[ \]"`
    Expected Result: 7 items marked [x] in PLAT-04 section, 0 items still [ ]
    Failure Indicators: Any item still unchecked, wrong items modified
    Evidence: .sisyphus/evidence/task-9-story-map-marked.txt

  Scenario: No other stories modified
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run `git diff docs/2026-04-21-2202-phase1-story-map.md`
      2. Verify only PLAT-04 section has changes
    Expected Result: Diff shows only PLAT-04 acceptance criteria changed
    Failure Indicators: Changes outside PLAT-04 section
    Evidence: .sisyphus/evidence/task-9-diff-scope.txt
  ```

  **Commit**: YES (group 6)
  - Message: `docs: mark PLAT-04 acceptance criteria as complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

- [x] 10. Notify Completion via Telegram

  **What to do**:
  - Send a Telegram notification that PLAT-04 is complete:
    ```bash
    tsx scripts/telegram-notify.ts "PLAT-04 (Configurable AGENTS.md per AI Employee) complete — all tasks done, tests passing, story map updated. Come back to review results."
    ```

  **Must NOT do**:
  - Do NOT send the notification before all tasks are verified (Task 8 must pass)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 9)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `scripts/telegram-notify.ts` — existing notification script
  - `AGENTS.md` (project root) — "Prometheus Planning — Telegram Notifications" section defines the notification rules

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "PLAT-04 complete..."`
      2. Verify exit code 0
    Expected Result: Script exits 0, notification sent
    Failure Indicators: Non-zero exit, network error
    Evidence: .sisyphus/evidence/task-10-telegram-sent.txt
  ```

  **Commit**: NO (no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/plat-04-configurable-agents-md.md` end-to-end. For each "Must Have": verify implementation exists (read file, query DB, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore` (except the existing seed cast), empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `pnpm prisma migrate dev --name add_agents_md_to_archetypes` (if not applied), `pnpm prisma db seed`. Query PostgREST for archetype `agents_md` and tenant `config.default_agents_md`. Run full test suite. Verify all PLAT-04 acceptance criteria are met.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no Dockerfile changes, no admin API endpoint, no `agents-md-content.test.ts` modification.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Tasks   | Message                                                                       | Pre-commit            |
| ------ | ------- | ----------------------------------------------------------------------------- | --------------------- |
| 1      | 1       | `feat(schema): add agents_md column to archetypes table`                      | `pnpm build`          |
| 2      | 2       | `feat(workers): add agents-md-resolver with three-level fallback`             | `pnpm build`          |
| 3      | 3       | `feat(seed): seed agents_md for archetypes and default_agents_md for tenants` | `pnpm prisma db seed` |
| 4      | 4       | `feat(harness): wire agents-md-resolver into opencode-harness`                | `pnpm build`          |
| 5      | 5, 6, 7 | `test: add agents-md-resolver, migration, and seed verification tests`        | `pnpm test -- --run`  |
| 6      | 9       | `docs: mark PLAT-04 acceptance criteria as complete in story map`             | —                     |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exits 0
pnpm test -- --run            # Expected: all tests pass
pnpm prisma db seed           # Expected: exits 0, no errors
# PostgREST verification:
curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000012&select=agents_md" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  # Expected: agents_md is non-null string containing "AI Employee Worker"
curl -s "http://localhost:54331/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000002&select=config" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  # Expected: config.default_agents_md is non-null string
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] PLAT-04 acceptance criteria in story map all marked `[x]`
