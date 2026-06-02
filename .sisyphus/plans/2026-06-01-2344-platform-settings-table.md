# Platform Settings Table — Replace Env Var Fallback Chains with DB-Managed Defaults

## TL;DR

> **Quick Summary**: Create a global `platform_settings` database table that replaces all environment variable fallback chains and hardcoded constants for platform-level behavior defaults. Every setting is DB-managed; missing settings throw errors instead of silently defaulting.
>
> **Deliverables**:
>
> - `platform_settings` Prisma model with `is_required` column + migration with RLS + seed data (in migration SQL for production)
> - `getPlatformSetting()` async helper that throws if key not found
> - `validateRequiredPlatformSettings()` startup check — fails `pnpm dev` if required settings are missing
> - Admin API: `GET /admin/platform-settings`, `PATCH /admin/platform-settings/:key`
> - Dashboard platform settings page at `/dashboard/settings` — view, edit, health status
> - 8 settings migrated from env vars / hardcoded constants
> - Deprecated env vars removed: `SUMMARIZER_VM_SIZE`, `FLY_SUMMARIZER_APP`
> - Updated tests, AGENTS.md, README.md, .env.example
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 4 → Task 13 → Task 9 → Task 17 → F1-F4

---

## Context

### Original Request

User discovered that env var fallback chains for VM size caused a production OOM — the cleaning-schedule archetype defaulted to `shared-cpu-1x`, which OOM-kills the OpenCode Go binary (~74GB virtual memory reservation). After fixing the immediate bug, user identified the root cause: platform behavior defaults should not be managed via environment variables or hardcoded constants. They should live in the database.

User's exact words: "If there is nothing at the database level, then we should throw an error, not default to a 'random' VM size."

### Interview Summary

**Key Discussions**:

- **Global scope**: One table for the entire platform, not tenant-scoped
- **No fallbacks**: Missing setting = thrown error, never a silent hardcoded default
- **Admin API**: GET (list all) and PATCH (update one) — no POST (new settings) or DELETE (settings are permanent)
- **8 settings identified**: VM size, cost limit, synthesis threshold, rules/knowledge char limits, bash timeout, two Slack channels
- **No dashboard UI**: Can be added later, out of scope for this plan
- **Test strategy**: Tests-after approach; vitest infrastructure exists

**Research Findings**:

- Env var audit identified 8 settings to migrate and 2 deprecated vars to remove entirely
- Codebase follows established patterns: UUID PK, soft delete, @@map, factory function routes, Zod validation
- Best route template: `admin-model-catalog.ts` (global table, similar CRUD pattern)
- PostgREST needs RLS + schema cache reload after migration
- `SYNTHESIS_THRESHOLD` is exported and imported in `src/gateway/slack/handlers.ts` — async ripple effect
- `MAX_EMPLOYEE_RULES_CHARS` is exported and imported in test files
- `build.test.ts` asserts `COST_LIMIT_USD_PER_DEPT_PER_DAY` exists in `.env.example` — will break
- `call-llm.test.ts` mocks `process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY` in 4 places — will break
- `resource-caps.ts` bash timeout is a compile-time constant set into child process env, not read at runtime

### Metis Review

**Identified Gaps** (addressed):

- `SYNTHESIS_THRESHOLD` async ripple to `handlers.ts` — included in plan
- `MAX_EMPLOYEE_RULES_CHARS` test import breakage — included in plan
- `build.test.ts` env var assertion — included in plan
- `call-llm.test.ts` env var mocks (4 places) — included in plan
- `admin-brain-preview.ts` references bash timeout — included in plan
- Production seeding must use migration SQL `INSERT ... ON CONFLICT DO NOTHING`, not just `prisma db seed`
- `lifecycle.ts` (deprecated) reads `COST_LIMIT_USD_PER_DEPT_PER_DAY` — explicitly excluded per AGENTS.md
- `resource-caps.ts` has 4 constants — only bash timeout migrates; other 3 excluded
- `README.md` references `WORKER_VM_SIZE` — must update
- `getPlatformSetting()` error messages must distinguish "key missing" vs "DB connection failure"
- Soft-deleted rows must return 404 on PATCH

---

## Work Objectives

### Core Objective

Replace all environment variable fallback chains and hardcoded constants for platform-level behavior defaults with a single `platform_settings` database table, ensuring no silent defaults — missing settings throw errors.

### Concrete Deliverables

- `PlatformSetting` Prisma model in `prisma/schema.prisma`
- Migration SQL with RLS policies and seed `INSERT` statements
- `src/lib/platform-settings.ts` — `getPlatformSetting()` async helper
- `src/gateway/routes/admin-platform-settings.ts` — GET/PATCH admin endpoints
- `validateRequiredPlatformSettings()` startup check in gateway — fails `pnpm dev` if required settings are missing
- Dashboard platform settings page at `/dashboard/settings` — view, edit, and health status
- Updated consumer files: `employee-lifecycle.ts`, `call-llm.ts`, `opencode-harness.mts`, `resource-caps.ts`, `handlers.ts`, `admin-brain-preview.ts`
- Updated test files: `build.test.ts`, `call-llm.test.ts`, `feedback-injection.test.ts`
- Cleaned `.env.example`, `README.md`, `AGENTS.md`

### Definition of Done

- [ ] `SELECT count(*) FROM platform_settings` returns 8 (all with `is_required = true`)
- [ ] PostgREST can read `platform_settings` (no schema cache error)
- [ ] `GET /admin/platform-settings` returns 8 settings with `is_required` field
- [ ] `PATCH /admin/platform-settings/cost_limit_usd_per_day` updates and returns new value
- [ ] Gateway startup validates required settings (deleting a required row → startup fails)
- [ ] Dashboard settings page loads at `/dashboard/settings` and shows all 8 settings with edit capability
- [ ] Real task (`real-estate-motivation-bot-2`) completes `Received → Done` end-to-end
- [ ] `pnpm test -- --run` passes with 0 failures
- [ ] `grep -rn 'SUMMARIZER_VM_SIZE' src/` returns no matches
- [ ] `grep -rn 'FLY_SUMMARIZER_APP' src/` returns no matches

### Must Have

- Global `platform_settings` table with key/value/description/is_required columns
- `is_required` boolean column to differentiate required vs optional settings (all 8 initial settings are required)
- `getPlatformSetting()` that throws on missing key (not silent default)
- `validateRequiredPlatformSettings()` startup check — queries all `is_required = true` settings, throws on any missing (called during gateway startup so `pnpm dev` fails immediately)
- Admin API: GET all, PATCH by key (with `requireAdminKey` middleware)
- Dashboard platform settings page — table view of all settings with edit capability and health status for required settings
- All 8 settings seeded in migration SQL (for production) AND in `prisma/seed.ts` (for local dev)
- RLS policy on the table
- PostgREST schema cache reload in migration
- All consumer files updated to read from DB
- All affected tests updated

### Must NOT Have (Guardrails)

- **No hardcoded fallbacks**: `getPlatformSetting()` must NEVER return a default value — it throws or returns the DB value
- **No tenant scoping**: Table is global, no `tenant_id` column
- **No POST endpoint**: Settings are defined by seed/migration only, not created at runtime
- **No DELETE endpoint**: Settings are permanent (soft delete available via DB but not API-exposed)
- **No typed overloads**: `getPlatformSetting()` returns `string`. Callers parse.
- **No caching layer**: Direct DB reads for now
- **Do NOT migrate**: `TURBO_CONCURRENCY`, `NEXUS_VITEST_MAX_WORKERS`, `NODE_OPTIONS` from `resource-caps.ts` — these are worker resource caps, not platform settings
- **Do NOT modify**: `src/inngest/lifecycle.ts` (deprecated) — leave its `COST_LIMIT_USD_PER_DEPT_PER_DAY` read as-is
- **Do NOT migrate**: `FLY_WORKER_APP`, `SLACK_BOT_TOKEN`, `FLY_API_TOKEN`, or any secret/infrastructure env var — those stay as env vars
- **Do NOT touch**: Any file not in the explicit file list in this plan

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Use Bash (bun/node REPL or vitest) — Import, call functions, compare output
- **Database**: Use Bash (psql) — Query rows, assert existence and values

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Prisma model + migration + RLS + seed SQL (with is_required column) [quick]
├── Task 2: getPlatformSetting() + validateRequiredPlatformSettings() helpers [quick]
└── Task 3: Admin API route (GET/PATCH) + route registration [quick]

Wave 2 (After Wave 1 — consumer migration, MAX PARALLEL):
├── Task 4: employee-lifecycle.ts — replace constants + vm_size chain [deep]
├── Task 5: call-llm.ts — replace cost limit + Slack channel reads [quick]
├── Task 6: opencode-harness.mts + resource-caps.ts — bash timeout migration [unspecified-high]
├── Task 7: handlers.ts — SYNTHESIS_THRESHOLD async migration [quick]
└── Task 8: admin-brain-preview.ts — verify and update bash timeout ref [quick]

Wave 3 (After Wave 2 — test updates + cleanup + validation):
├── Task 9: Update build.test.ts [quick]
├── Task 10: Update call-llm.test.ts [quick]
├── Task 11: Update feedback-injection.test.ts [quick]
├── Task 12: Seed — add platform_settings upserts [quick]
├── Task 13: .env.example cleanup + deprecated var removal from codebase [quick]
└── Task 14: Startup validation — call validateRequiredPlatformSettings() on gateway boot [quick]

Wave 4 (After Wave 3 — dashboard UI + docs + E2E):
├── Task 15: Dashboard platform settings page [visual-engineering]
├── Task 16: AGENTS.md + README.md documentation updates [quick]
├── Task 17: E2E smoke test — trigger real-estate-motivation-bot-2 [unspecified-high]
└── Task 18: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks                  | Wave  |
| ----- | ---------- | ----------------------- | ----- |
| 1     | —          | 2, 3, 4, 5, 6, 7, 8, 12 | 1     |
| 2     | 1          | 4, 5, 6, 7, 8, 14       | 1     |
| 3     | 1, 2       | 15, 16                  | 1     |
| 4     | 1, 2       | 9, 11, 17               | 2     |
| 5     | 1, 2       | 10, 17                  | 2     |
| 6     | 1, 2       | 17                      | 2     |
| 7     | 1, 2       | 17                      | 2     |
| 8     | 1          | 17                      | 2     |
| 9     | 4, 13      | 17                      | 3     |
| 10    | 5          | 17                      | 3     |
| 11    | 4          | 17                      | 3     |
| 12    | 1          | 17                      | 3     |
| 13    | 4, 5, 6    | 9, 16, 17               | 3     |
| 14    | 2          | 17                      | 3     |
| 15    | 3          | 17                      | 4     |
| 16    | 3, 13, 14  | 17                      | 4     |
| 17    | ALL 1-16   | F1-F4                   | 4     |
| 18    | 17         | —                       | 4     |
| F1-F4 | ALL        | —                       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **5** — T4 → `deep`, T5 → `quick`, T6 → `unspecified-high`, T7 → `quick`, T8 → `quick`
- **Wave 3**: **6** — T9-T11 → `quick`, T12 → `quick`, T13 → `quick`, T14 → `quick`
- **Wave 4**: **4** — T15 → `visual-engineering`, T16 → `quick`, T17 → `unspecified-high`, T18 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Prisma Model + Migration + RLS + Seed SQL

  **What to do**:
  - Add `PlatformSetting` model to `prisma/schema.prisma` with fields: `id` (UUID PK, `@default(uuid()) @db.Uuid`), `key` (String, unique), `value` (String), `description` (String, optional), `is_required` (Boolean, `@default(true)`), `created_at` (DateTime, `@default(now())`), `updated_at` (DateTime, `@updatedAt`), `deleted_at` (DateTime, optional). Use `@@map("platform_settings")`.
  - Run `pnpm prisma migrate dev --name add_platform_settings` to generate migration.
  - Edit the generated migration SQL to add:
    - `ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;`
    - `CREATE POLICY "anon_select" ON platform_settings FOR SELECT TO anon USING (deleted_at IS NULL);`
    - `INSERT INTO platform_settings (id, key, value, description, is_required) VALUES` with all 8 seed rows using `ON CONFLICT (key) DO NOTHING`. All 8 are `is_required = true`:
      1. `default_worker_vm_size` = `performance-1x` — "Default Fly.io VM size for worker machines. OpenCode requires performance-1x minimum (2GB RAM)."
      2. `cost_limit_usd_per_day` = `50` — "Maximum LLM spend per day in USD. Circuit breaker triggers at this threshold."
      3. `synthesis_threshold` = `5` — "Number of confirmed rules before rule synthesis is triggered."
      4. `max_employee_rules_chars` = `8000` — "Maximum character length for employee learned rules."
      5. `max_employee_knowledge_chars` = `32000` — "Maximum character length for employee knowledge base entries."
      6. `worker_bash_timeout_ms` = `1200000` — "Default bash command timeout in worker containers (milliseconds)."
      7. `issues_slack_channel` = `` (empty string) — "Slack channel for employee-reported issues. Empty = disabled."
      8. `cost_alert_slack_channel` = `#alerts` — "Slack channel for cost circuit breaker alerts."
  - After migration, run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"`

  **Must NOT do**:
  - Do NOT add a `tenant_id` column — this is a global table
  - Do NOT add POST or DELETE RLS policies — admin API handles writes
  - Do NOT use `prisma db seed` as the production seeding mechanism — the `INSERT` statements in the migration SQL ARE the production seed

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file Prisma schema change + migration generation + SQL edits. Well-defined, small scope.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not a shell tool task
    - `creating-archetypes`: Not an archetype task

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete first — everything depends on this)
  - **Parallel Group**: Wave 1 (sequential within wave — T2 and T3 depend on T1)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8, 12
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `prisma/schema.prisma` — Follow existing model patterns: UUID PK with `@default(uuid()) @db.Uuid`, `@@map("snake_case")`, soft delete with `deleted_at DateTime?`
  - `prisma/migrations/20260522002458_add_model_catalog/migration.sql` — Migration SQL style reference (CREATE TABLE, column types)
  - `prisma/migrations/20260601214116_add_rls_policies/migration.sql` — RLS policy pattern: `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY`

  **WHY Each Reference Matters**:
  - `schema.prisma`: Copy the exact pattern for UUID PK and soft delete — Prisma generates different SQL depending on `@db.Uuid` presence
  - Model catalog migration: Shows how to write the `CREATE TABLE` with proper PostgreSQL types
  - RLS migration: Shows the exact `CREATE POLICY` syntax needed for PostgREST to read the table

  **Acceptance Criteria**:
  - [ ] Migration applies cleanly: `pnpm prisma migrate deploy` exits 0
  - [ ] Table exists: `psql ... -c "SELECT count(*) FROM platform_settings;"` returns 8
  - [ ] RLS enabled: `psql ... -c "SELECT rowsecurity FROM pg_tables WHERE tablename = 'platform_settings';"` returns `t`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration creates table with 8 seed rows
    Tool: Bash (psql)
    Preconditions: Local database running on port 54322
    Steps:
      1. Run: pnpm prisma migrate deploy
      2. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT key, value FROM platform_settings WHERE deleted_at IS NULL ORDER BY key;"
      3. Assert: 8 rows returned with keys: cost_alert_slack_channel, cost_limit_usd_per_day, default_worker_vm_size, issues_slack_channel, max_employee_knowledge_chars, max_employee_rules_chars, synthesis_threshold, worker_bash_timeout_ms
    Expected Result: All 8 rows present with correct default values
    Failure Indicators: Table doesn't exist, fewer than 8 rows, wrong values
    Evidence: .sisyphus/evidence/task-1-migration-seed.txt

  Scenario: PostgREST can read the table after schema cache reload
    Tool: Bash (curl)
    Preconditions: PostgREST running on port 54331, migration applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
      2. Run: source .env && curl -s "http://localhost:54331/rest/v1/platform_settings?limit=10" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
      3. Assert: Response is a JSON array with 8 objects, NOT a PGRST205 error
    Expected Result: JSON array of 8 platform setting objects
    Failure Indicators: PGRST205 "schema cache" error, empty array, HTTP 400/500
    Evidence: .sisyphus/evidence/task-1-postgrest-read.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(platform): add platform_settings table, helper, and admin API`
  - Files: `prisma/schema.prisma`, `prisma/migrations/XXXX_add_platform_settings/migration.sql`
  - Pre-commit: `pnpm prisma migrate deploy`

- [x] 2. getPlatformSetting() + validateRequiredPlatformSettings() Helpers

  **What to do**:
  - Create `src/lib/platform-settings.ts` with two exported functions:

    **Function 1: `getPlatformSetting()`**

    ```typescript
    import { PrismaClient } from '@prisma/client';

    // Module-level prisma instance (same pattern as other lib files)
    const prisma = new PrismaClient();

    /**
     * Reads a platform setting from the database.
     * Throws if the key does not exist or is soft-deleted.
     * Returns the raw string value — callers are responsible for parsing.
     */
    export async function getPlatformSetting(key: string): Promise<string> {
      const setting = await prisma.platformSetting.findFirst({
        where: { key, deleted_at: null },
      });

      if (!setting) {
        throw new Error(
          `Platform setting '${key}' not found. Ensure the database is seeded with all required platform settings.`,
        );
      }

      return setting.value;
    }
    ```

    **Function 2: `validateRequiredPlatformSettings()`**

    ```typescript
    /**
     * Validates that all required platform settings exist in the database.
     * Call during gateway startup to fail fast if any are missing.
     * Throws with a list of missing keys if any required settings are absent.
     */
    export async function validateRequiredPlatformSettings(): Promise<void> {
      const requiredSettings = await prisma.platformSetting.findMany({
        where: { is_required: true, deleted_at: null },
        select: { key: true },
      });

      // Get all keys that SHOULD be required (from the DB's own is_required flag)
      // If no required settings exist at all, that's a critical failure
      if (requiredSettings.length === 0) {
        throw new Error(
          'No required platform settings found in database. Run database migrations and seed to populate platform_settings table.',
        );
      }

      // Verify each required setting has a non-null value by fetching them
      const missingKeys: string[] = [];
      for (const { key } of requiredSettings) {
        const setting = await prisma.platformSetting.findFirst({
          where: { key, deleted_at: null },
        });
        if (!setting || !setting.value) {
          missingKeys.push(key);
        }
      }

      if (missingKeys.length > 0) {
        throw new Error(
          `Missing required platform settings: ${missingKeys.join(', ')}. Run database migrations and seed to populate platform_settings table.`,
        );
      }
    }
    ```

  - `getPlatformSetting()` signature: `async function getPlatformSetting(key: string): Promise<string>` — no overloads, no generics, no defaults.
  - `validateRequiredPlatformSettings()` signature: `async function validateRequiredPlatformSettings(): Promise<void>` — throws if any required settings are missing.
  - Error messages must include key names and guidance about seeding/migrations.
  - Note on PrismaClient instantiation: Check if the codebase has a shared Prisma singleton pattern (e.g. `src/lib/prisma.ts`). If so, import from there instead of creating a new `PrismaClient()`. If not, the module-level instance is fine.

  **Must NOT do**:
  - Do NOT add caching
  - Do NOT add typed overloads (`getPlatformSettingAsNumber()`, etc.)
  - Do NOT add a fallback/default parameter
  - Do NOT add tenant scoping

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single new file, ~20 lines, clear contract.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3, after Task 1)
  - **Parallel Group**: Wave 1 (with Task 3)
  - **Blocks**: Tasks 4, 5, 6, 7, 8, 14
  - **Blocked By**: Task 1 (needs PlatformSetting model in schema)

  **References**:

  **Pattern References**:
  - `src/lib/call-llm.ts` — Shows how other lib files import and use PrismaClient or shared DB access
  - `src/lib/encryption.ts` — Example of a single-purpose utility module in `src/lib/`

  **WHY Each Reference Matters**:
  - `call-llm.ts`: Check how it gets its Prisma/DB access — the helper should follow the same pattern
  - `encryption.ts`: Shows the module structure convention (exports, error handling style)

  **Acceptance Criteria**:
  - [ ] File exists at `src/lib/platform-settings.ts`
  - [ ] `getPlatformSetting()` is async and returns `Promise<string>`
  - [ ] `getPlatformSetting()` throws on missing key with message containing the key name
  - [ ] `getPlatformSetting()` filters out soft-deleted rows (`deleted_at: null`)
  - [ ] `validateRequiredPlatformSettings()` is async and returns `Promise<void>`
  - [ ] `validateRequiredPlatformSettings()` throws if any `is_required = true` settings are missing

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Helper reads existing setting from DB
    Tool: Bash (tsx)
    Preconditions: Migration applied with seed data, gateway NOT required
    Steps:
      1. Run: cd /Users/victordozal/repos/dozal-devs/ai-employee && npx tsx -e "import { getPlatformSetting } from './src/lib/platform-settings'; (async () => { const v = await getPlatformSetting('default_worker_vm_size'); console.log('VALUE:', v); process.exit(0); })()"
      2. Assert: stdout contains "VALUE: performance-1x"
    Expected Result: Returns "performance-1x"
    Failure Indicators: Throws error, returns wrong value, hangs
    Evidence: .sisyphus/evidence/task-2-helper-read.txt

  Scenario: Helper throws on nonexistent key
    Tool: Bash (tsx)
    Preconditions: Migration applied with seed data
    Steps:
      1. Run: cd /Users/victordozal/repos/dozal-devs/ai-employee && npx tsx -e "import { getPlatformSetting } from './src/lib/platform-settings'; (async () => { try { await getPlatformSetting('nonexistent_key'); console.log('ERROR: did not throw'); process.exit(1); } catch (e) { console.log('THREW:', e.message); process.exit(0); } })()"
      2. Assert: stdout contains "THREW:" and message contains "nonexistent_key" and "not found"
    Expected Result: Throws Error with message "Platform setting 'nonexistent_key' not found..."
    Failure Indicators: Does not throw, throws wrong message, returns undefined
    Evidence: .sisyphus/evidence/task-2-helper-throw.txt

  Scenario: Validation passes when all required settings exist
    Tool: Bash (tsx)
    Preconditions: Migration applied with seed data (all 8 required settings present)
    Steps:
      1. Run: cd /Users/victordozal/repos/dozal-devs/ai-employee && npx tsx -e "import { validateRequiredPlatformSettings } from './src/lib/platform-settings'; (async () => { await validateRequiredPlatformSettings(); console.log('VALIDATION: passed'); process.exit(0); })()"
      2. Assert: stdout contains "VALIDATION: passed"
    Expected Result: No error thrown, validation passes
    Failure Indicators: Throws error when all settings exist
    Evidence: .sisyphus/evidence/task-2-validation-pass.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `feat(platform): add platform_settings table, helper, and admin API`
  - Files: `src/lib/platform-settings.ts`

- [x] 3. Admin API Route (GET/PATCH) + Route Registration

  **What to do**:
  - Create `src/gateway/routes/admin-platform-settings.ts` following the `admin-model-catalog.ts` pattern:
    - Factory function: `export function adminPlatformSettingsRoutes({ prisma }: { prisma: PrismaClient })`
    - `GET /admin/platform-settings` — returns all settings where `deleted_at IS NULL`, ordered by `key`
    - `PATCH /admin/platform-settings/:key` — updates `value` for a given key. Zod body: `{ value: z.string() }`. Returns 404 if key not found OR soft-deleted. Returns updated setting.
    - Both routes use `requireAdminKey` middleware
    - Error handling: 400 for invalid body, 404 for unknown/deleted key, 500 for DB errors
  - Register route in `src/gateway/server.ts`:
    - Import the factory function
    - Add `app.use(adminPlatformSettingsRoutes({ prisma }))` after the existing route registrations (around line 196)

  **Must NOT do**:
  - Do NOT add POST endpoint (settings are seed-only)
  - Do NOT add DELETE endpoint (settings are permanent)
  - Do NOT add tenant scoping or tenant_id parameter
  - Do NOT add pagination (8 rows, unnecessary)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Follows existing pattern closely. Two endpoints, standard CRUD.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2, after Task 1)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 15, 16
  - **Blocked By**: Task 1 (needs PlatformSetting model), Task 2 (conceptually, but route doesn't use helper)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-model-catalog.ts` — **PRIMARY TEMPLATE**. Global table, factory function pattern, Zod validation, requireAdminKey middleware. Copy structure directly.
  - `src/gateway/server.ts:190-200` — Route registration point. Add new route import and `app.use()` call here.
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey` middleware import path

  **WHY Each Reference Matters**:
  - `admin-model-catalog.ts`: This IS the template — same global-table pattern, same middleware, same error handling. Copy and adapt.
  - `server.ts`: Must register in the right location among other admin routes
  - `admin-auth.ts`: Correct import path for the middleware

  **Acceptance Criteria**:
  - [ ] `GET /admin/platform-settings` returns 200 with array of 8 settings
  - [ ] `PATCH /admin/platform-settings/cost_limit_usd_per_day` with `{"value":"100"}` returns 200 with updated value
  - [ ] `PATCH /admin/platform-settings/nonexistent_key` returns 404
  - [ ] Both endpoints require `X-Admin-Key` header (401 without)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GET returns all platform settings
    Tool: Bash (curl)
    Preconditions: Gateway running on port 7700, migration applied
    Steps:
      1. Run: source .env && curl -s -w "\nHTTP_CODE:%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/platform-settings"
      2. Assert: HTTP_CODE is 200
      3. Assert: Response body is JSON array with 8 objects
      4. Assert: Each object has keys: id, key, value, description, created_at, updated_at
    Expected Result: 200 with 8 settings
    Failure Indicators: 404, 500, empty array, missing fields
    Evidence: .sisyphus/evidence/task-3-get-all.txt

  Scenario: PATCH updates a setting value
    Tool: Bash (curl)
    Preconditions: Gateway running, settings seeded
    Steps:
      1. Run: source .env && curl -s -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"value":"999"}' "http://localhost:7700/admin/platform-settings/cost_limit_usd_per_day"
      2. Assert: Response contains "value":"999"
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT value FROM platform_settings WHERE key = 'cost_limit_usd_per_day';"
      4. Assert: DB value is "999"
      5. Restore: curl -s -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"value":"50"}' "http://localhost:7700/admin/platform-settings/cost_limit_usd_per_day"
    Expected Result: Value updated to "999" and visible in both API response and DB
    Failure Indicators: 500, value not updated, old value persists
    Evidence: .sisyphus/evidence/task-3-patch-update.txt

  Scenario: PATCH with unknown key returns 404
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Run: source .env && curl -s -o /dev/null -w "%{http_code}" -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"value":"foo"}' "http://localhost:7700/admin/platform-settings/nonexistent_key"
      2. Assert: HTTP status is 404
    Expected Result: 404 Not Found
    Failure Indicators: 200, 500, creates new row
    Evidence: .sisyphus/evidence/task-3-patch-404.txt

  Scenario: Endpoints reject unauthenticated requests
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/admin/platform-settings"
      2. Assert: HTTP status is 401
    Expected Result: 401 Unauthorized
    Failure Indicators: 200, 403, 500
    Evidence: .sisyphus/evidence/task-3-auth-required.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `feat(platform): add platform_settings table, helper, and admin API`
  - Files: `src/gateway/routes/admin-platform-settings.ts`, `src/gateway/server.ts`

- [x] 4. employee-lifecycle.ts — Replace Constants + VM Size Chain

  **What to do**:
  - **Remove hardcoded constants** at lines 35-37:
    ```typescript
    // REMOVE these three lines:
    export const SYNTHESIS_THRESHOLD = 5;
    export const MAX_EMPLOYEE_RULES_CHARS = 8_000;
    export const MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32_000;
    ```
  - **Replace all usages** of these constants in the file with `await getPlatformSetting('synthesis_threshold')` (parse to number), `await getPlatformSetting('max_employee_rules_chars')` (parse to number), `await getPlatformSetting('max_employee_knowledge_chars')` (parse to number).
  - **Replace the VM size fallback chain** (around lines 395-400):
    ```typescript
    // BEFORE (remove):
    const vmSize =
      archetype.vm_size ??
      process.env['WORKER_VM_SIZE'] ??
      process.env['SUMMARIZER_VM_SIZE'] ??
      'shared-cpu-1x';
    // AFTER:
    const defaultVmSize = await getPlatformSetting('default_worker_vm_size');
    const vmSize = archetype.vm_size ?? defaultVmSize;
    ```
  - **Replace ALL other occurrences** of `WORKER_VM_SIZE` in this file (use `lsp_find_references` or grep to find all 3 locations: lines ~397, ~1099, ~2462).
  - **Replace `ISSUES_SLACK_CHANNEL`** in the `flyWorkerEnv` construction (around lines 583-601):
    ```typescript
    // BEFORE:
    ...(process.env['ISSUES_SLACK_CHANNEL'] ? { ISSUES_SLACK_CHANNEL: process.env['ISSUES_SLACK_CHANNEL'] } : {}),
    // AFTER:
    ...(await (async () => { const ch = await getPlatformSetting('issues_slack_channel'); return ch ? { ISSUES_SLACK_CHANNEL: ch } : {}; })()),
    ```
    Or refactor to a cleaner pattern — fetch the value into a variable before the object literal.
  - Import `getPlatformSetting` from `../lib/platform-settings` at the top of the file.

  **Must NOT do**:
  - Do NOT modify `src/inngest/lifecycle.ts` (deprecated file) — leave its env var reads as-is
  - Do NOT add try/catch around `getPlatformSetting()` calls — if settings are missing, the error should propagate
  - Do NOT add fallback values after `getPlatformSetting()` — the whole point is no fallbacks

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex file (~2500 lines), multiple replacement points across different Inngest steps, async ripple effects. Must be careful not to break the lifecycle state machine.
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Needed to understand the lifecycle state machine and ensure changes don't break step transitions

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 11, 17
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:35-37` — The three hardcoded constants to remove: `SYNTHESIS_THRESHOLD`, `MAX_EMPLOYEE_RULES_CHARS`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS`
  - `src/inngest/employee-lifecycle.ts:395-400` — The VM size fallback chain to replace: `archetype.vm_size ?? process.env['WORKER_VM_SIZE'] ?? process.env['SUMMARIZER_VM_SIZE'] ?? 'shared-cpu-1x'`
  - `src/inngest/employee-lifecycle.ts:583-633` — The `flyWorkerEnv` construction containing `ISSUES_SLACK_CHANNEL` and `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS` env var reads

  **API/Type References**:
  - `src/lib/platform-settings.ts` — `getPlatformSetting(key: string): Promise<string>` — the helper created in Task 2

  **WHY Each Reference Matters**:
  - Lines 35-37: These ARE the constants being removed. Must find all their usages within the file.
  - Lines 395-400: This IS the fallback chain that caused the production OOM. Critical replacement.
  - Lines 583-633: Contains the env var injection for worker containers — must update `ISSUES_SLACK_CHANNEL` source.

  **Acceptance Criteria**:
  - [ ] `grep -n 'SYNTHESIS_THRESHOLD' src/inngest/employee-lifecycle.ts` returns 0 matches (constant removed)
  - [ ] `grep -n 'MAX_EMPLOYEE_RULES_CHARS' src/inngest/employee-lifecycle.ts` returns 0 matches
  - [ ] `grep -n 'MAX_EMPLOYEE_KNOWLEDGE_CHARS' src/inngest/employee-lifecycle.ts` returns 0 matches
  - [ ] `grep -n 'WORKER_VM_SIZE' src/inngest/employee-lifecycle.ts` returns 0 matches
  - [ ] `grep -n 'SUMMARIZER_VM_SIZE' src/inngest/employee-lifecycle.ts` returns 0 matches
  - [ ] `grep -n "getPlatformSetting" src/inngest/employee-lifecycle.ts` returns multiple matches (new reads)
  - [ ] `pnpm build` succeeds (TypeScript compiles)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No hardcoded constants or env var reads remain
    Tool: Bash (grep)
    Preconditions: Task 4 changes applied
    Steps:
      1. Run: grep -cn 'SYNTHESIS_THRESHOLD\|MAX_EMPLOYEE_RULES_CHARS\|MAX_EMPLOYEE_KNOWLEDGE_CHARS\|WORKER_VM_SIZE\|SUMMARIZER_VM_SIZE' src/inngest/employee-lifecycle.ts
      2. Assert: Output is 0
      3. Run: grep -c 'getPlatformSetting' src/inngest/employee-lifecycle.ts
      4. Assert: Output is > 0 (multiple reads from DB)
    Expected Result: Zero legacy references, multiple getPlatformSetting calls
    Failure Indicators: Any non-zero count for legacy references
    Evidence: .sisyphus/evidence/task-4-grep-verification.txt

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: All Wave 1 tasks complete
    Steps:
      1. Run: pnpm build
      2. Assert: Exit code 0, no type errors related to employee-lifecycle.ts
    Expected Result: Clean build
    Failure Indicators: Type errors about missing exports, wrong async signatures
    Evidence: .sisyphus/evidence/task-4-build-check.txt
  ```

  **Commit**: YES (groups with Tasks 5-8)
  - Message: `refactor(platform): migrate env vars and constants to platform_settings`
  - Files: `src/inngest/employee-lifecycle.ts`

- [x] 5. call-llm.ts — Replace Cost Limit + Slack Channel Reads

  **What to do**:
  - Replace `process.env['COST_LIMIT_USD_PER_DEPT_PER_DAY']` read with `await getPlatformSetting('cost_limit_usd_per_day')`. The current code has a `parseInt()` with default `50` — remove the default, parse the DB value.
  - Replace `process.env['SLACK_DEFAULT_CHANNEL'] || '#alerts'` with `await getPlatformSetting('cost_alert_slack_channel')`.
  - Import `getPlatformSetting` from `./platform-settings`.
  - **IMPORTANT**: The file has a guard `if (!process.env.DATABASE_URL) return;` at the top of the cost check function. This guard must remain (or be adapted) so that tests without a DB don't crash on the `getPlatformSetting()` call. The `getPlatformSetting()` call must be AFTER this guard.
  - Do NOT change `SLACK_BOT_TOKEN` reads — that's a secret, not a platform setting.

  **Must NOT do**:
  - Do NOT add fallback values after `getPlatformSetting()`
  - Do NOT modify the deprecated `src/inngest/lifecycle.ts` which also reads `COST_LIMIT_USD_PER_DEPT_PER_DAY`
  - Do NOT change the circuit breaker logic — only change WHERE the values come from

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two targeted replacements in a single file. Clear before/after.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 10, 17
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/lib/call-llm.ts` — The file to modify. Find `COST_LIMIT_USD_PER_DEPT_PER_DAY` and `SLACK_DEFAULT_CHANNEL` reads. Note the `DATABASE_URL` guard.

  **WHY Each Reference Matters**:
  - The `DATABASE_URL` guard is critical — without it, `getPlatformSetting()` would throw in tests that don't have a DB connection. Must preserve this guard.

  **Acceptance Criteria**:
  - [ ] `grep -n 'COST_LIMIT_USD_PER_DEPT_PER_DAY' src/lib/call-llm.ts` returns 0 matches
  - [ ] `grep -n 'SLACK_DEFAULT_CHANNEL' src/lib/call-llm.ts` returns 0 matches
  - [ ] `grep -n 'getPlatformSetting' src/lib/call-llm.ts` returns 2+ matches
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No env var reads remain in call-llm.ts
    Tool: Bash (grep)
    Preconditions: Task 5 changes applied
    Steps:
      1. Run: grep -c 'COST_LIMIT_USD_PER_DEPT_PER_DAY\|SLACK_DEFAULT_CHANNEL' src/lib/call-llm.ts
      2. Assert: Output is 0
    Expected Result: Zero legacy env var references
    Failure Indicators: Any non-zero count
    Evidence: .sisyphus/evidence/task-5-grep-verification.txt

  Scenario: DATABASE_URL guard still protects against missing DB
    Tool: Bash (grep)
    Preconditions: Task 5 changes applied
    Steps:
      1. Run: grep -n 'DATABASE_URL' src/lib/call-llm.ts
      2. Assert: Guard still present before getPlatformSetting calls
    Expected Result: DATABASE_URL check exists before DB reads
    Failure Indicators: Guard removed, getPlatformSetting called unconditionally
    Evidence: .sisyphus/evidence/task-5-guard-check.txt
  ```

  **Commit**: YES (groups with Tasks 4, 6-8)
  - Message: `refactor(platform): migrate env vars and constants to platform_settings`
  - Files: `src/lib/call-llm.ts`

- [x] 6. opencode-harness.mts + resource-caps.ts — Bash Timeout Migration

  **What to do**:
  - In `src/workers/opencode-harness.mts` (around line 628): **BEFORE** calling `applyResourceCaps()`, fetch the bash timeout from DB and set it into `process.env`:
    ```typescript
    // Fetch from DB and set into env BEFORE applyResourceCaps()
    const bashTimeout = await getPlatformSetting('worker_bash_timeout_ms');
    process.env['OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS'] = bashTimeout;
    // Then applyResourceCaps() will see it already set and NOT override it
    ```
  - This works because `applyResourceCaps()` in `resource-caps.ts` uses `if (!env[key])` — it respects already-set values.
  - In `src/workers/lib/resource-caps.ts`: The `RESOURCE_CAPS` object still hardcodes `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: '1200000'`. This now serves as a **fallback for non-harness contexts** (e.g., if `applyResourceCaps` is called without the harness having set the env var first). Leave the constant but add a comment: `// Fallback if not set by harness from platform_settings DB`.
  - Import `getPlatformSetting` in `opencode-harness.mts`.

  **Must NOT do**:
  - Do NOT migrate `TURBO_CONCURRENCY`, `NEXUS_VITEST_MAX_WORKERS`, or `NODE_OPTIONS` from `resource-caps.ts`
  - Do NOT remove the hardcoded value from `resource-caps.ts` — it serves as a fallback for direct CLI usage
  - Do NOT change the `applyResourceCaps()` function logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two files, nuanced interaction between harness env injection and resource-caps fallback. Must understand the execution order.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:620-640` — The area where `applyResourceCaps()` is called. The DB fetch must happen BEFORE this call.
  - `src/workers/lib/resource-caps.ts` — The `RESOURCE_CAPS` constant and `applyResourceCaps()` function. Note the `if (!env[key])` guard.

  **WHY Each Reference Matters**:
  - `opencode-harness.mts`: Must insert the DB read at the right position — before `applyResourceCaps()` but after DB connection is available
  - `resource-caps.ts`: Must understand that `applyResourceCaps()` respects already-set env vars — this is what makes the pattern work

  **Acceptance Criteria**:
  - [ ] `grep -n 'getPlatformSetting' src/workers/opencode-harness.mts` returns 1+ matches
  - [ ] `resource-caps.ts` still has `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS` (as fallback)
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness fetches bash timeout from DB before applyResourceCaps
    Tool: Bash (grep)
    Preconditions: Task 6 changes applied
    Steps:
      1. Run: grep -n 'getPlatformSetting\|applyResourceCaps' src/workers/opencode-harness.mts
      2. Assert: getPlatformSetting('worker_bash_timeout_ms') appears BEFORE applyResourceCaps() call
    Expected Result: DB fetch precedes resource caps application
    Failure Indicators: DB fetch after applyResourceCaps, or missing entirely
    Evidence: .sisyphus/evidence/task-6-order-check.txt

  Scenario: resource-caps.ts retains fallback constant
    Tool: Bash (grep)
    Preconditions: Task 6 changes applied
    Steps:
      1. Run: grep 'OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS' src/workers/lib/resource-caps.ts
      2. Assert: Still present as a constant value (fallback)
    Expected Result: Constant retained with comment about fallback role
    Failure Indicators: Constant removed entirely
    Evidence: .sisyphus/evidence/task-6-fallback-retained.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 7, 8)
  - Message: `refactor(platform): migrate env vars and constants to platform_settings`
  - Files: `src/workers/opencode-harness.mts`, `src/workers/lib/resource-caps.ts`

- [x] 7. handlers.ts — SYNTHESIS_THRESHOLD Async Migration

  **What to do**:
  - In `src/gateway/slack/handlers.ts`: Find where `SYNTHESIS_THRESHOLD` is imported from `../../inngest/employee-lifecycle`.
  - Replace the import with `import { getPlatformSetting } from '../../lib/platform-settings'`.
  - Replace the usage of `SYNTHESIS_THRESHOLD` with `parseInt(await getPlatformSetting('synthesis_threshold'), 10)`.
  - The usage site MUST already be in an async context (Slack handlers are typically async). Verify this with `lsp_find_references` on `SYNTHESIS_THRESHOLD` before making changes. If the context is not async, make the enclosing function async.

  **Must NOT do**:
  - Do NOT refactor the handler beyond the SYNTHESIS_THRESHOLD change
  - Do NOT add caching of the threshold value

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single import change + one usage replacement. But must verify async context first.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 6, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts` — Find `SYNTHESIS_THRESHOLD` import and usage. Check if the usage is inside an async function.
  - `src/inngest/employee-lifecycle.ts:35` — The constant being removed (by Task 4). This task must update the import source.

  **WHY Each Reference Matters**:
  - `handlers.ts`: The file to modify. Must verify async context at usage site.
  - `employee-lifecycle.ts`: Task 4 removes the export — this task must update the import before or alongside Task 4.

  **Acceptance Criteria**:
  - [ ] `grep -n 'SYNTHESIS_THRESHOLD' src/gateway/slack/handlers.ts` returns 0 matches
  - [ ] `grep -n 'getPlatformSetting' src/gateway/slack/handlers.ts` returns 1+ matches
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SYNTHESIS_THRESHOLD import replaced with getPlatformSetting
    Tool: Bash (grep)
    Preconditions: Task 7 changes applied
    Steps:
      1. Run: grep -c 'SYNTHESIS_THRESHOLD' src/gateway/slack/handlers.ts
      2. Assert: 0
      3. Run: grep -c 'getPlatformSetting' src/gateway/slack/handlers.ts
      4. Assert: >= 1
    Expected Result: Legacy import gone, DB read present
    Failure Indicators: SYNTHESIS_THRESHOLD still referenced
    Evidence: .sisyphus/evidence/task-7-handler-migration.txt
  ```

  **Commit**: YES (groups with Tasks 4-6, 8)
  - Message: `refactor(platform): migrate env vars and constants to platform_settings`
  - Files: `src/gateway/slack/handlers.ts`

- [x] 8. admin-brain-preview.ts — Verify and Update Bash Timeout Reference

  **What to do**:
  - Check `src/gateway/routes/admin-brain-preview.ts` around line 255 for `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS`.
  - Determine if it's:
    - (a) A string literal used as a label/display → Leave as-is (it's just showing the env var name)
    - (b) Reading `process.env['OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS']` → Replace with `await getPlatformSetting('worker_bash_timeout_ms')`
    - (c) Importing from `resource-caps.ts` → Update import or replace with `getPlatformSetting`
  - Make the minimal change necessary. If it's just a label string, no code change needed — just document in evidence.

  **Must NOT do**:
  - Do NOT refactor the brain preview feature beyond this one reference
  - Do NOT add new functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Investigation + possible one-line fix. Smallest task in the plan.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4-7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 17
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-brain-preview.ts:255` — The line referencing `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS`. Read the surrounding context to determine the nature of the reference.

  **WHY Each Reference Matters**:
  - Must understand what the reference IS before deciding what to do. Could be string literal, env read, or import.

  **Acceptance Criteria**:
  - [ ] Evidence file documents what the reference is and what was done (or why no change was needed)
  - [ ] If changed: `pnpm build` succeeds

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Brain preview reference identified and handled
    Tool: Bash (grep)
    Preconditions: Task 8 investigation complete
    Steps:
      1. Run: grep -n 'OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS' src/gateway/routes/admin-brain-preview.ts
      2. Document: What the reference is (string label, env read, or import)
      3. If changed: Run pnpm build and assert exit 0
    Expected Result: Reference documented; if code changed, build passes
    Failure Indicators: Build failure after change
    Evidence: .sisyphus/evidence/task-8-brain-preview-check.txt
  ```

  **Commit**: YES (groups with Tasks 4-7, if changed)
  - Message: `refactor(platform): migrate env vars and constants to platform_settings`
  - Files: `src/gateway/routes/admin-brain-preview.ts` (if changed)

- [x] 9. Update build.test.ts

  **What to do**:
  - In `tests/lib/build.test.ts` around lines 51-55: Remove the assertion that checks for `COST_LIMIT_USD_PER_DEPT_PER_DAY` in `.env.example`. This env var is being removed from the active section.
  - If the test checks for other env vars that are still active, leave those assertions intact.
  - If the test has a list of "required env vars" that it validates exist in `.env.example`, remove `COST_LIMIT_USD_PER_DEPT_PER_DAY` from that list.
  - Also check if `WORKER_VM_SIZE` or `SUMMARIZER_VM_SIZE` are in the assertion list — remove those too.

  **Must NOT do**:
  - Do NOT restructure the test file
  - Do NOT add new test cases

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Removing 1-3 items from an assertion list. Trivial.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 4, 13

  **References**:

  **Pattern References**:
  - `tests/lib/build.test.ts:51-55` — The assertion checking for env vars in `.env.example`

  **WHY Each Reference Matters**:
  - This test WILL break when the env vars are removed from `.env.example`. Must update it first (or alongside).

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/lib/build.test.ts` passes
  - [ ] Test no longer asserts `COST_LIMIT_USD_PER_DEPT_PER_DAY` exists in `.env.example`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: build.test.ts passes after env var removal
    Tool: Bash
    Preconditions: .env.example updated (Task 13), test updated (this task)
    Steps:
      1. Run: pnpm test -- --run tests/lib/build.test.ts
      2. Assert: All tests pass, 0 failures
    Expected Result: Test suite passes
    Failure Indicators: Assertion failure mentioning COST_LIMIT_USD_PER_DEPT_PER_DAY
    Evidence: .sisyphus/evidence/task-9-build-test.txt
  ```

  **Commit**: YES (groups with Tasks 10-13)
  - Message: `fix(tests): update tests for platform_settings migration and clean up deprecated env vars`
  - Files: `tests/lib/build.test.ts`

- [x] 10. Update call-llm.test.ts

  **What to do**:
  - In `tests/lib/call-llm.test.ts`: Find all 4 locations where `process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY` is set/mocked.
  - Replace these with mocks for `getPlatformSetting`. Use vitest's `vi.mock()` to mock `../lib/platform-settings` (or the correct relative path from the test file):
    ```typescript
    vi.mock('../../src/lib/platform-settings', () => ({
      getPlatformSetting: vi.fn(async (key: string) => {
        const defaults: Record<string, string> = {
          cost_limit_usd_per_day: '50',
          cost_alert_slack_channel: '#test-alerts',
        };
        return (
          defaults[key] ??
          (() => {
            throw new Error(`Unknown key: ${key}`);
          })()
        );
      }),
    }));
    ```
  - Adjust the mock values to match what each test expects. Some tests may set the cost limit to specific values — use `vi.mocked(getPlatformSetting).mockResolvedValueOnce('999')` for those.
  - Remove any `process.env.COST_LIMIT_USD_PER_DEPT_PER_DAY` assignments.
  - Also handle `SLACK_DEFAULT_CHANNEL` if mocked.

  **Must NOT do**:
  - Do NOT restructure the test file
  - Do NOT add new test cases beyond what's needed for the migration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 4 targeted replacements of env var mocks with vi.mock. Straightforward.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `tests/lib/call-llm.test.ts` — Find all `COST_LIMIT_USD_PER_DEPT_PER_DAY` references. Check test structure to understand how env vars are mocked.

  **WHY Each Reference Matters**:
  - These tests WILL break when `call-llm.ts` stops reading from `process.env`. Must mock the new DB source.

  **Acceptance Criteria**:
  - [ ] `grep -n 'COST_LIMIT_USD_PER_DEPT_PER_DAY' tests/lib/call-llm.test.ts` returns 0 matches
  - [ ] `pnpm test -- --run tests/lib/call-llm.test.ts` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: call-llm tests pass with DB mocks
    Tool: Bash
    Preconditions: call-llm.ts updated (Task 5), test updated (this task)
    Steps:
      1. Run: pnpm test -- --run tests/lib/call-llm.test.ts
      2. Assert: All tests pass, 0 failures
    Expected Result: Tests pass with getPlatformSetting mocks
    Failure Indicators: Import errors, mock not intercepting, assertion failures
    Evidence: .sisyphus/evidence/task-10-call-llm-test.txt
  ```

  **Commit**: YES (groups with Tasks 9, 11-13)
  - Message: `fix(tests): update tests for platform_settings migration and clean up deprecated env vars`
  - Files: `tests/lib/call-llm.test.ts`

- [x] 11. Update feedback-injection.test.ts

  **What to do**:
  - In `tests/inngest/feedback-injection.test.ts`: Find where `MAX_EMPLOYEE_RULES_CHARS` is imported from `../../src/inngest/employee-lifecycle`.
  - Replace the import with either:
    - (a) A hardcoded constant within the test file: `const MAX_EMPLOYEE_RULES_CHARS = 8000;` (simplest)
    - (b) A mock of `getPlatformSetting` that returns `'8000'`
  - Option (a) is preferred for test simplicity — the test just needs the value, not the DB interaction.
  - Remove the import from `employee-lifecycle`.

  **Must NOT do**:
  - Do NOT restructure the test file
  - Do NOT change what the test is testing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single import replacement. Trivial change.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `tests/inngest/feedback-injection.test.ts` — Find the `MAX_EMPLOYEE_RULES_CHARS` import

  **WHY Each Reference Matters**:
  - Task 4 removes the export from `employee-lifecycle.ts`. This import will fail unless updated.

  **Acceptance Criteria**:
  - [ ] `grep -n 'from.*employee-lifecycle.*MAX_EMPLOYEE_RULES_CHARS' tests/inngest/feedback-injection.test.ts` returns 0 matches
  - [ ] `pnpm test -- --run tests/inngest/feedback-injection.test.ts` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: feedback-injection test passes without lifecycle import
    Tool: Bash
    Preconditions: employee-lifecycle.ts updated (Task 4), test updated (this task)
    Steps:
      1. Run: pnpm test -- --run tests/inngest/feedback-injection.test.ts
      2. Assert: All tests pass, 0 failures
    Expected Result: Tests pass with local constant or mock
    Failure Indicators: Import error, assertion failure
    Evidence: .sisyphus/evidence/task-11-feedback-test.txt
  ```

  **Commit**: YES (groups with Tasks 9, 10, 12, 13)
  - Message: `fix(tests): update tests for platform_settings migration and clean up deprecated env vars`
  - Files: `tests/inngest/feedback-injection.test.ts`

- [x] 12. Seed — Add Platform Settings Upserts

  **What to do**:
  - In `prisma/seed.ts`: Add a new section for platform settings upserts using `prisma.platformSetting.upsert()` for each of the 8 settings. Use `where: { key }` for idempotency. Include `is_required: true` for all 8:
    ```typescript
    const platformSettings = [
      {
        key: 'default_worker_vm_size',
        value: 'performance-1x',
        description: '...',
        is_required: true,
      },
      // ... all 8
    ];
    for (const setting of platformSettings) {
      await prisma.platformSetting.upsert({
        where: { key: setting.key },
        update: {}, // Don't overwrite existing values on re-seed
        create: setting,
      });
    }
    console.log('✅ Platform settings seeded');
    ```
  - Follow the existing seed file's patterns: `console.log('✅ ...')` prefix, loop upsert for global tables.
  - Do NOT backfill archetype `vm_size` — archetypes with `vm_size = null` correctly fall through to `default_worker_vm_size` from the platform settings table.

  **Must NOT do**:
  - Do NOT use `create` instead of `upsert` — re-running seed would fail
  - Do NOT overwrite existing values on re-seed (use `update: {}`)
  - Do NOT modify other seed sections
  - Do NOT backfill archetype vm_size — the platform default handles null values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding an upsert loop to the seed file. Follows existing pattern.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 11, 13, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Follow the existing upsert loop pattern (see model_catalog seeding section for a global table example)

  **WHY Each Reference Matters**:
  - Seed file has established conventions for console output, upsert patterns, and ordering. Must match.

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` succeeds
  - [ ] `psql ... -c "SELECT count(*) FROM platform_settings;"` returns 8

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed is idempotent (can run twice)
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: Output contains "✅ Platform settings seeded"
      3. Run: pnpm prisma db seed (again)
      4. Assert: No errors, output still contains "✅ Platform settings seeded"
      5. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM platform_settings WHERE deleted_at IS NULL;"
      6. Assert: Count is exactly 8 (no duplicates)
    Expected Result: Seed runs twice without errors, exactly 8 rows
    Failure Indicators: Unique constraint violation, duplicate rows
    Evidence: .sisyphus/evidence/task-12-seed-idempotent.txt
  ```

  **Commit**: YES (groups with Tasks 9-11, 13)
  - Message: `fix(tests): update tests for platform_settings migration and clean up deprecated env vars`
  - Files: `prisma/seed.ts`

- [x] 13. .env.example Cleanup + Deprecated Var Removal from Codebase

  **What to do**:
  - In `.env.example`:
    - **Delete** `COST_LIMIT_USD_PER_DEPT_PER_DAY` entirely (now in `platform_settings` table)
    - **Delete** `WORKER_VM_SIZE` entirely (now in `platform_settings` table)
    - **Delete** `SUMMARIZER_VM_SIZE` entirely (superseded and now in DB)
    - **Delete** `FLY_SUMMARIZER_APP` entirely (superseded by `FLY_WORKER_APP`)
    - **Delete** `SLACK_DEFAULT_CHANNEL` if present (now in `platform_settings` table)
    - If any of these appear in the DEPRECATED section at the bottom, remove them from there too — no trace should remain
  - In `src/` codebase: Search for any remaining references to `SUMMARIZER_VM_SIZE` and `FLY_SUMMARIZER_APP` in active (non-deprecated, non-test) source files. Remove them.
    - Use `grep -rn 'SUMMARIZER_VM_SIZE\|FLY_SUMMARIZER_APP' src/ --include='*.ts' --include='*.mts'` to find all references
    - Do NOT modify `src/inngest/lifecycle.ts` (deprecated)
  - In `.env`: Remove `WORKER_VM_SIZE`, `SUMMARIZER_VM_SIZE`, `FLY_SUMMARIZER_APP`, `COST_LIMIT_USD_PER_DEPT_PER_DAY`, `SLACK_DEFAULT_CHANNEL` if present.

  **Must NOT do**:
  - Do NOT modify `src/inngest/lifecycle.ts` (deprecated)
  - Do NOT keep these vars in a "DEPRECATED" section — delete them entirely. Git history is the audit trail.
  - Do NOT change the section ordering in `.env.example`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File editing + grep + cleanup. Well-defined scope.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 11, 12, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 9, 16, 17
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `.env.example` — See the existing DEPRECATED section at the bottom for the comment format
  - README.md "Environment File Conventions" section — Rules for .env.example organization

  **WHY Each Reference Matters**:
  - Must follow the established DEPRECATED section format with explanatory comments
  - README conventions dictate section ordering

  **Acceptance Criteria**:
  - [ ] `grep -n 'COST_LIMIT_USD_PER_DEPT_PER_DAY' .env.example` returns 0 (completely gone)
  - [ ] `grep -n 'WORKER_VM_SIZE' .env.example` returns 0 (completely gone)
  - [ ] `grep -n 'SUMMARIZER_VM_SIZE' .env.example` returns 0 (completely gone)
  - [ ] `grep -n 'FLY_SUMMARIZER_APP' .env.example` returns 0 (completely gone)
  - [ ] `grep -rn 'SUMMARIZER_VM_SIZE' src/ --include='*.ts' --include='*.mts' | grep -v lifecycle.ts` returns 0
  - [ ] `grep -rn 'FLY_SUMMARIZER_APP' src/ --include='*.ts' --include='*.mts' | grep -v lifecycle.ts` returns 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migrated env vars completely removed from .env.example
    Tool: Bash (grep)
    Preconditions: .env.example updated
    Steps:
      1. Run: grep -c 'COST_LIMIT_USD_PER_DEPT_PER_DAY\|WORKER_VM_SIZE\|SUMMARIZER_VM_SIZE\|FLY_SUMMARIZER_APP\|SLACK_DEFAULT_CHANNEL' .env.example
      2. Assert: 0 matches — no trace of these vars anywhere in the file
    Expected Result: Vars completely deleted from .env.example (not moved to DEPRECATED, not commented out — gone)
    Failure Indicators: Any matches at all
    Evidence: .sisyphus/evidence/task-13-env-example-clean.txt

  Scenario: Deprecated vars removed from active codebase
    Tool: Bash (grep)
    Preconditions: All Wave 2 tasks complete
    Steps:
      1. Run: grep -rn 'SUMMARIZER_VM_SIZE' src/ --include='*.ts' --include='*.mts' | grep -v lifecycle.ts | grep -v node_modules
      2. Assert: 0 matches
      3. Run: grep -rn 'FLY_SUMMARIZER_APP' src/ --include='*.ts' --include='*.mts' | grep -v lifecycle.ts | grep -v node_modules
      4. Assert: 0 matches
    Expected Result: Zero references to deprecated vars in active source files
    Failure Indicators: Any matches in non-deprecated files
    Evidence: .sisyphus/evidence/task-13-deprecated-removal.txt
  ```

  **Commit**: YES (groups with Tasks 9-12)
  - Message: `fix(tests): update tests for platform_settings migration and clean up deprecated env vars`
  - Files: `.env.example`, `.env`, any `src/` files with deprecated var references

- [x] 14. Startup Validation — Call validateRequiredPlatformSettings() on Gateway Boot

  **What to do**:
  - In `src/gateway/server.ts` (or the gateway startup sequence): After the Prisma client is initialized and before the server starts listening, call `validateRequiredPlatformSettings()`.
  - This ensures that `pnpm dev` fails immediately with a clear error if any required platform settings are missing from the database.
  - Import `validateRequiredPlatformSettings` from `../lib/platform-settings`.
  - Wrap the call in a try/catch that logs the error and exits the process with a non-zero exit code:
    ```typescript
    try {
      await validateRequiredPlatformSettings();
      logger.info('Platform settings validated');
    } catch (error) {
      logger.error({ error }, 'FATAL: Platform settings validation failed');
      process.exit(1);
    }
    ```
  - Place this BEFORE the server starts listening (before `app.listen()`) so the gateway never accepts traffic without valid settings.

  **Must NOT do**:
  - Do NOT catch the error silently — the whole point is to fail loudly
  - Do NOT add validation to worker containers — they read individual settings via `getPlatformSetting()` which already throws
  - Do NOT validate in a background timer — must be synchronous at startup

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding ~10 lines to server.ts startup sequence. Well-defined, single file.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9-13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts` — Gateway startup sequence. Find where the server begins listening and add validation before that point.
  - `src/lib/platform-settings.ts` — The `validateRequiredPlatformSettings()` function created in Task 2.

  **WHY Each Reference Matters**:
  - `server.ts`: Must insert at the right point in the startup flow — after DB is available, before server accepts requests
  - `platform-settings.ts`: The function being called — must match the exported signature

  **Acceptance Criteria**:
  - [ ] Gateway startup calls `validateRequiredPlatformSettings()` before listening
  - [ ] Missing required setting → gateway fails to start with clear error message
  - [ ] All settings present → gateway starts normally with "Platform settings validated" log

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Gateway starts successfully when all settings exist
    Tool: Bash (curl)
    Preconditions: Migration applied with all 8 seed rows, gateway running
    Steps:
      1. Start gateway (or verify it's running after restart)
      2. Run: curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/health
      3. Assert: HTTP 200
      4. Check logs for: grep 'Platform settings validated' /tmp/ai-dev.log
    Expected Result: Gateway running, health check passes, validation log present
    Failure Indicators: Gateway crashes, health check fails
    Evidence: .sisyphus/evidence/task-14-startup-success.txt

  Scenario: Gateway fails to start when a required setting is deleted
    Tool: Bash (psql + gateway restart)
    Preconditions: Gateway stopped, all settings exist
    Steps:
      1. Soft-delete a required setting: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "UPDATE platform_settings SET deleted_at = NOW() WHERE key = 'default_worker_vm_size';"
      2. Attempt to start gateway
      3. Assert: Gateway fails with error message containing "default_worker_vm_size" or "required platform settings"
      4. Restore: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "UPDATE platform_settings SET deleted_at = NULL WHERE key = 'default_worker_vm_size';"
    Expected Result: Gateway refuses to start with clear error about missing setting
    Failure Indicators: Gateway starts without the required setting
    Evidence: .sisyphus/evidence/task-14-startup-failure.txt
  ```

  **Commit**: YES (groups with Tasks 9-13)
  - Message: `fix(tests): update tests for platform_settings migration and clean up deprecated env vars`
  - Files: `src/gateway/server.ts`

- [x] 15. Dashboard Platform Settings Page

  **What to do**:
  - Create a new page at `/dashboard/settings` (or `/dashboard/platform-settings`) that displays all platform settings in a table with:
    - **Columns**: Key, Value, Description, Required (badge/icon), Last Updated
    - **Edit capability**: Click to edit a setting's value inline or via a modal. PATCH to `/admin/platform-settings/:key` on save.
    - **Health indicator**: Show a green checkmark or red warning icon for each required setting based on whether it has a valid (non-empty) value.
    - **Overall health banner**: At the top, show "All N required settings configured" (green) or "M of N required settings missing" (red) based on the `is_required` flags.
  - Add navigation link to the dashboard sidebar/header.
  - Use existing dashboard component patterns (cards with `rounded-lg border bg-card`, `SearchableSelect` if dropdowns are needed, etc.).
  - Fetch data via: `GET /admin/platform-settings` with `X-Admin-Key` header.
  - Update data via: `PATCH /admin/platform-settings/:key` with `X-Admin-Key` header.
  - **URL state**: The settings page is a single view, no tabs needed. But if filtering is added, encode it in URL params per convention.

  **Must NOT do**:
  - Do NOT add the ability to create new settings (POST) — settings are seed-only
  - Do NOT add the ability to delete settings
  - Do NOT add tenant scoping to the page
  - Do NOT over-engineer — simple table with inline edit is sufficient

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI page with table, edit functionality, health indicators. Frontend work.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 16)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 17
  - **Blocked By**: Task 3 (needs admin API route to exist)

  **References**:

  **Pattern References**:
  - `dashboard/src/` — Existing dashboard pages for layout, routing, and component patterns
  - `src/gateway/routes/admin-platform-settings.ts` — The API endpoints this page consumes (GET all, PATCH by key)
  - Dashboard conventions in AGENTS.md — Cards with `rounded-lg border bg-card`, `SearchableSelect` for dropdowns, URL-encoded state

  **WHY Each Reference Matters**:
  - Existing dashboard pages: Must match styling, routing, and data-fetching patterns
  - API route: Must know the exact response shape for the GET/PATCH endpoints
  - AGENTS.md conventions: Mandatory UI patterns (cards, searchable selects, URL state)

  **Acceptance Criteria**:
  - [ ] Page loads at `/dashboard/settings` (or `/dashboard/platform-settings`)
  - [ ] Shows all 8 settings with key, value, description, required status
  - [ ] Editing a value and saving successfully updates the DB
  - [ ] Health indicator shows green when all required settings exist
  - [ ] Navigation link exists in dashboard sidebar/header

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Settings page loads and displays all settings
    Tool: Playwright
    Preconditions: Gateway running, dashboard dev server running at localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/settings
      2. Assert: Page title or heading contains "Settings" or "Platform Settings"
      3. Assert: Table/list shows 8 rows
      4. Assert: Each row shows key, value, description
      5. Assert: Health indicator shows green/checkmark (all settings present)
    Expected Result: All 8 settings visible with health indicator
    Failure Indicators: 404, empty page, missing rows, console errors
    Evidence: .sisyphus/evidence/task-15-settings-page.png

  Scenario: Editing a setting value persists to DB
    Tool: Playwright
    Preconditions: Settings page loaded
    Steps:
      1. Find the row for "cost_limit_usd_per_day"
      2. Click edit button/icon
      3. Change value to "999"
      4. Save
      5. Assert: Row now shows "999"
      6. Verify in DB: psql ... -c "SELECT value FROM platform_settings WHERE key = 'cost_limit_usd_per_day';"
      7. Assert: DB value is "999"
      8. Restore: Edit back to "50" and save
    Expected Result: Value updated in UI and DB
    Failure Indicators: Save fails, value doesn't persist, console errors
    Evidence: .sisyphus/evidence/task-15-settings-edit.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add platform settings management page`
  - Files: `dashboard/src/pages/PlatformSettingsPage.tsx` (or similar), dashboard routing files

- [x] 16. AGENTS.md + README.md Documentation Updates

  **What to do**:
  - **AGENTS.md**:
    - Add `platform_settings` table to the Database section: describe table purpose, schema, and the `getPlatformSetting()` helper
    - Add `GET /admin/platform-settings` and `PATCH /admin/platform-settings/:key` to the Admin API section
    - Update the "Key Conventions" or create a new section: "Platform settings are managed via the `platform_settings` DB table, not env vars. Use `getPlatformSetting(key)` to read. Never hardcode fallback values — missing settings throw errors."
    - Remove `SUMMARIZER_VM_SIZE` from any active references (should already be noted as deprecated)
    - Update the env var section to note that `WORKER_VM_SIZE`, `COST_LIMIT_USD_PER_DEPT_PER_DAY` are now in `platform_settings`
    - Add platform_settings seed entries to any relevant reference lists
  - **README.md**:
    - Remove `WORKER_VM_SIZE` and `SUMMARIZER_VM_SIZE` from the Environment Variables section (or move to deprecated note)
    - Remove `COST_LIMIT_USD_PER_DEPT_PER_DAY` from the Environment Variables section
    - Add a brief note about `platform_settings` table under the Database or Admin API section
    - Add `GET /admin/platform-settings` and `PATCH /admin/platform-settings/:key` to the admin API table

  **Must NOT do**:
  - Do NOT rewrite entire sections — surgical updates only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation edits. Multiple files but small, targeted changes.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 15)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 3, 13, 14

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Current Admin API section, Database section, Key Conventions section
  - `README.md` — Current admin API table, Environment Variables section

  **WHY Each Reference Matters**:
  - Must match existing documentation style and section structure

  **Acceptance Criteria**:
  - [ ] AGENTS.md mentions `platform_settings` table with `is_required` column and startup validation
  - [ ] AGENTS.md has `GET /admin/platform-settings` and `PATCH /admin/platform-settings/:key`
  - [ ] README.md admin API table includes platform-settings endpoints
  - [ ] No active references to `WORKER_VM_SIZE` as a current env var
  - [ ] Dashboard settings page documented

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Documentation is consistent with implementation
    Tool: Bash (grep)
    Preconditions: All implementation tasks complete
    Steps:
      1. Run: grep -c 'platform_settings\|platform-settings\|getPlatformSetting' AGENTS.md
      2. Assert: >= 3 (table name, API endpoints, helper function mentioned)
      3. Run: grep -c 'platform-settings' README.md
      4. Assert: >= 2 (API endpoints mentioned)
    Expected Result: Both docs reference the new feature
    Failure Indicators: Zero mentions, stale env var references
    Evidence: .sisyphus/evidence/task-16-docs-check.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md and README.md for platform_settings`
  - Files: `AGENTS.md`, `README.md`

- [x] 17. E2E Smoke Test — Trigger real-estate-motivation-bot-2

  **What to do**:
  - Ensure all services are running: gateway (`curl localhost:7700/health`), Inngest (`curl localhost:8288/health`), Docker.
  - Trigger `real-estate-motivation-bot-2` via admin API:
    ```bash
    source .env
    TASK=$(curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{}' | jq -r '.task_id')
    echo "Task ID: $TASK"
    ```
  - Wait ~90 seconds, then verify:
    - Task reached `Done`: `SELECT status FROM tasks WHERE id = '$TASK';`
    - Lifecycle trace shows full progression: `SELECT from_status, to_status FROM task_status_log WHERE task_id = '$TASK' ORDER BY created_at;`
  - This validates that the lifecycle still works end-to-end after all the `getPlatformSetting()` migrations.
  - Run `pnpm test -- --run` one final time to confirm all tests pass.

  **Must NOT do**:
  - Do NOT modify any code in this task — it's verification only
  - Do NOT skip this test

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: End-to-end verification requiring multiple tools (curl, psql, test runner). Must wait for async task completion.
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Needed if task gets stuck — provides diagnostics for each lifecycle state

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after ALL implementation tasks)
  - **Parallel Group**: Wave 4 (sequential after Tasks 1-16)
  - **Blocks**: F1-F4
  - **Blocked By**: ALL Tasks 1-16

  **References**:

  **Pattern References**:
  - AGENTS.md "Recommended Test Employee" section — `real-estate-motivation-bot-2` trigger command, expected behavior, verification steps

  **WHY Each Reference Matters**:
  - Contains the exact curl command, tenant ID, and verification queries

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` status
  - [ ] `pnpm test -- --run` passes with 0 failures
  - [ ] No errors in gateway logs related to `getPlatformSetting`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Real task completes end-to-end with platform_settings
    Tool: Bash (curl + psql)
    Preconditions: All implementation tasks complete, services running
    Steps:
      1. Trigger: source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id'
      2. Wait 90 seconds
      3. Check status: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status FROM tasks WHERE id = '<TASK_ID>';"
      4. Assert: status = 'Done'
      5. Check lifecycle: psql ... -c "SELECT from_status, to_status FROM task_status_log WHERE task_id = '<TASK_ID>' ORDER BY created_at;"
      6. Assert: Full progression Received → ... → Done
    Expected Result: Task completes successfully with all settings read from DB
    Failure Indicators: Task stuck at Executing, getPlatformSetting errors in logs, OOM
    Evidence: .sisyphus/evidence/task-17-e2e-smoke.txt

  Scenario: All tests pass after full migration
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: 0 failures (container-boot.test.ts skips are acceptable)
    Expected Result: Full test suite passes
    Failure Indicators: Any test failures
    Evidence: .sisyphus/evidence/task-17-test-suite.txt
  ```

  **Commit**: NO (verification only)

- [x] 18. Notify Completion via Telegram

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ platform-settings-table complete — All tasks done. Come back to review results."`

  **Must NOT do**:
  - Do NOT skip this notification

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 17)
  - **Blocks**: —
  - **Blocked By**: Task 17

  **References**: None needed.

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: Task 17 complete
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ platform-settings-table complete — All tasks done. Come back to review results."
      2. Assert: Exit code 0
    Expected Result: Notification delivered
    Failure Indicators: Exit code non-zero, network error
    Evidence: .sisyphus/evidence/task-18-telegram.txt
  ```

  **Commit**: NO (notification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Tasks | Commit Message                                                              | Files                                                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-3         | `feat(platform): add platform_settings table, helper, and admin API`        | prisma/schema.prisma, migration, src/lib/platform-settings.ts, src/gateway/routes/admin-platform-settings.ts, src/gateway/server.ts                                                                  |
| 4-8         | `refactor(platform): migrate env vars and constants to platform_settings`   | src/inngest/employee-lifecycle.ts, src/lib/call-llm.ts, src/workers/opencode-harness.mts, src/workers/lib/resource-caps.ts, src/gateway/slack/handlers.ts, src/gateway/routes/admin-brain-preview.ts |
| 9-14        | `fix(tests): update tests and add startup validation for platform_settings` | tests/lib/build.test.ts, tests/lib/call-llm.test.ts, tests/inngest/feedback-injection.test.ts, prisma/seed.ts, .env.example, src/gateway/server.ts, src/ (deprecated var removal)                    |
| 15          | `feat(dashboard): add platform settings management page`                    | dashboard/src/pages/PlatformSettingsPage.tsx, dashboard routing files                                                                                                                                |
| 16          | `docs: update AGENTS.md and README.md for platform_settings`                | AGENTS.md, README.md                                                                                                                                                                                 |

---

## Success Criteria

### Verification Commands

```bash
# 8 settings in DB
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT key, value FROM platform_settings WHERE deleted_at IS NULL ORDER BY key;"
# Expected: 8 rows

# PostgREST works
source .env && curl -s "http://localhost:54331/rest/v1/platform_settings?limit=10" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Expected: JSON array with 8 objects

# Admin API GET
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/platform-settings" | jq 'length'
# Expected: 8

# Admin API PATCH
curl -s -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"100"}' "http://localhost:7700/admin/platform-settings/cost_limit_usd_per_day" | jq '.value'
# Expected: "100"

# Tests pass
pnpm test -- --run
# Expected: 0 failures

# Deprecated vars gone
grep -rn 'SUMMARIZER_VM_SIZE' src/ .env.example
# Expected: no matches in active code

# E2E task completes
source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
# Expected: task reaches Done status
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] E2E smoke test passes
- [ ] Documentation updated
