# Test Database Isolation — Separate Test DB from Dev DB

## TL;DR

> **Quick Summary**: Separate test and development databases so running `pnpm test` never touches dev data. Create `ai_employee_test` on the same Postgres container, configure Vitest to auto-redirect all tests there, and add a safety guard preventing accidental dev DB wipes.
>
> **Deliverables**:
>
> - `ai_employee_test` database with automated provisioning
> - Vitest globalSetup with safety guard + schema sync + seed
> - All 15 DB-touching test files redirected to test DB (zero test logic changes)
> - `test:db:setup` npm script for one-time DB creation
> - Fix for the `tenant-repository.test.ts` afterEach that wipes VLRE's slack_bot_token
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (globalSetup) → Task 2 (vitest config) → Tasks 3-5 (parallel fixes) → F1-F4 (verification)

---

## Context

### Original Request

Tests and dev share the `ai_employee` database on `localhost:54322`. Running `pnpm test` wipes application data — specifically, `cleanupTestData()` runs `deleteMany({})` on 8 tables with no row filter, and `tenant-repository.test.ts` deletes all tenant secrets not matching seeded IDs. This destroys VLRE's `slack_bot_token` and all task history.

### Interview Summary

**Key Discussions**:

- **Seed data**: User confirmed globalSetup should run `prisma migrate deploy` + `prisma db seed` on the test DB
- **Schema sync**: `prisma migrate deploy` (not `db push`) — faithful to production migration files
- **Test placement**: All tests run on test DB, including seed verification tests — no exceptions
- **Reference pattern**: Nexus stack at `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack`

**Research Findings**:

- 15 test files hit the real DB; 10+ are fully mocked (safe, no changes needed)
- `cleanupTestData()` in `tests/setup.ts` runs `deleteMany({})` on 8 tables — most dangerous function
- 2 files create their own `new PrismaClient()` bypassing `getPrisma()`: `manual-trigger.integration.test.ts:11` and `seed-guest-messaging.test.ts:152`
- `tests/setup.ts:117-119` calls `getPrisma().$connect()` at module load — connects before env can be overridden by test config (but Vitest `test.env` sets env BEFORE module loading, so this is safe)
- Nexus stack pattern: `vitest.config.ts` test.env → `globalSetup.ts` (safety guard + db push) → `test-client.ts` (singleton) → `test-setup.ts` (connect/disconnect)

### Metis Review

**Identified Gaps** (addressed):

- **Prisma seed env override**: `prisma db seed` loads `.env` via dotenv independently. Must explicitly pass `DATABASE_URL` in child process env when shelling out from globalSetup — otherwise seed writes to dev DB
- **`test:db:setup` idempotency**: Script must handle "database already exists" gracefully (use `CREATE DATABASE IF NOT EXISTS` pattern via psql)
- **Direct PrismaClient instantiation**: 2 files bypass `getPrisma()` — need refactoring to use the shared singleton
- **Module-level `$connect()` ordering**: `tests/setup.ts:117` calls `getPrisma().$connect()` at import time — Vitest's `test.env` sets env before module loading, so this is safe (validated)

---

## Work Objectives

### Core Objective

Isolate all test database operations to `ai_employee_test` so that `pnpm test` never reads from or writes to the `ai_employee` development database.

### Concrete Deliverables

- `ai_employee_test` database on `localhost:54322`
- `tests/helpers/global-setup.ts` — safety guard + migrate + seed
- Updated `vitest.config.ts` — `test.env.DATABASE_URL` pointing to test DB
- `test:db:setup` script in `package.json`
- Refactored `manual-trigger.integration.test.ts` and `seed-guest-messaging.test.ts` to use `getPrisma()`

### Definition of Done

- [ ] `pnpm test -- --run` passes with test DB (all existing tests pass, no regressions)
- [ ] Dev DB `ai_employee` is untouched after running full test suite
- [ ] `psql -c "SELECT count(*) FROM tenant_secrets" ai_employee` shows same count before/after tests

### Must Have

- Safety guard in globalSetup that throws if `DATABASE_URL` doesn't contain `ai_employee_test`
- `prisma migrate deploy` (not `db push`) for schema sync
- `prisma db seed` runs with explicit `DATABASE_URL` override (not from `.env`)
- All 15 DB-touching test files use test DB via env override
- `test:db:setup` is idempotent (safe to run multiple times)

### Must NOT Have (Guardrails)

- No changes to test assertions or test logic — only infrastructure changes
- No new test files or test cases
- No changes to `prisma/schema.prisma`
- No changes to `prisma/seed.ts`
- No changes to `.env` or `.env.example` (test DB URL lives only in `vitest.config.ts`)
- No `prisma db push` — use `migrate deploy` only
- No `TRUNCATE CASCADE` — keep existing `deleteMany` cleanup patterns
- No changes to mocked test files (they don't touch the DB)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Existing tests serve as the verification suite — no new tests needed
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Database**: Use Bash (psql) — query both DBs, compare row counts
- **Test suite**: Use Bash (`pnpm test -- --run`) — verify all tests pass
- **Safety guard**: Use Bash — verify globalSetup rejects wrong DATABASE_URL

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Create globalSetup + test DB provisioning script [quick]
├── Task 2: Update vitest.config.ts with test.env + globalSetup [quick]
└── Task 3: Refactor direct PrismaClient instantiations [quick]

Wave 2 (After Wave 1 — verification):
├── Task 4: Full test suite run + dev DB integrity check [quick]
└── Task 5: Update AGENTS.md with test DB documentation [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 2, 4   | 1     |
| 2     | 1          | 4      | 1     |
| 3     | —          | 4      | 1     |
| 4     | 1, 2, 3    | F1-F4  | 2     |
| 5     | —          | F1-F4  | 2     |
| F1-F4 | 4, 5       | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2 tasks** — T4 → `quick`, T5 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create globalSetup + test DB provisioning script ✓

  **What to do**:
  - Create `tests/helpers/global-setup.ts` following the Nexus stack pattern:
    1. Set `process.env.DATABASE_URL` to `postgresql://postgres:postgres@localhost:54322/ai_employee_test`
    2. Add safety guard: `if (!process.env.DATABASE_URL.includes('ai_employee_test')) throw new Error(...)`
    3. Run `prisma migrate deploy` via `execSync` with `env: { ...process.env }` (critical — passes the overridden DATABASE_URL to the child process, preventing Prisma from loading `.env`)
    4. Run `prisma db seed` via `execSync` with `env: { ...process.env }` (critical — same env override; without this, `prisma db seed` loads `.env` via dotenv and would seed the dev DB instead)
    5. Export `setup()` and `teardown()` (teardown is empty, matching Nexus pattern)
  - Add `test:db:setup` script to `package.json`:
    ```
    "test:db:setup": "PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -tc \"SELECT 1 FROM pg_database WHERE datname='ai_employee_test'\" | grep -q 1 || PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -c 'CREATE DATABASE ai_employee_test' && DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee_test pnpm prisma migrate deploy && DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee_test pnpm db:seed"
    ```
    This is idempotent: checks if DB exists first, only creates if missing, then migrates and seeds.

  **Must NOT do**:
  - Do not use `prisma db push` — use `prisma migrate deploy` only
  - Do not modify `.env` or `.env.example`
  - Do not modify `prisma/seed.ts`
  - Do not create a `.env.test` file (env override lives in vitest config)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small file creation + single package.json edit. Clear spec, no ambiguity.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — straightforward file creation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: [Task 2, Task 4]
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/packages/database/src/testing/global-setup.ts` — Complete reference implementation. Copy the structure: env override → safety guard → execSync schema push. Adapt: use `prisma migrate deploy` instead of `db push`, add seed step.
  - `tests/setup.ts:117-119` — Shows module-level `getPrisma().$connect()`. This runs after Vitest sets `test.env`, so no conflict. Do not modify this.

  **API/Type References** (contracts to implement against):
  - `package.json:35-37` — Prisma seed config: `"seed": "tsx prisma/seed.ts"`. The `prisma db seed` command reads this.
  - `prisma/schema.prisma` line containing `env("DATABASE_URL")` — Prisma reads DATABASE_URL from env. In globalSetup child processes, we MUST pass it explicitly via `execSync` env option.

  **External References**:
  - Vitest globalSetup docs: `https://vitest.dev/config/#globalsetup` — exports `setup()` and `teardown()` functions, runs once before all test files

  **WHY Each Reference Matters**:
  - Nexus globalSetup is the canonical pattern — copy structure, adapt for migrate deploy + seed
  - `tests/setup.ts` module-level connect shows the PrismaClient initializes at import time — Vitest `test.env` sets DATABASE_URL before imports, so this is safe
  - `package.json` prisma.seed config is needed to understand how `prisma db seed` resolves the seed command

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: globalSetup creates and migrates test database
    Tool: Bash
    Preconditions: ai_employee_test database may or may not exist
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -c "DROP DATABASE IF EXISTS ai_employee_test"
      2. Run: pnpm test:db:setup
      3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -c "\l" | grep ai_employee_test
      4. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee_test -c "SELECT count(*) FROM tenants"
    Expected Result: Step 3 shows ai_employee_test in database list. Step 4 returns count >= 2 (DozalDevs + VLRE seeded).
    Failure Indicators: psql returns "database does not exist" or tenant count is 0
    Evidence: .sisyphus/evidence/task-1-test-db-creation.txt

  Scenario: globalSetup safety guard rejects wrong DATABASE_URL
    Tool: Bash
    Preconditions: test database exists
    Steps:
      1. Create a temp test file that imports global-setup and calls setup() with DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee (dev DB)
      2. Run it and capture stderr
    Expected Result: Throws error containing "MUST use ai_employee_test database"
    Failure Indicators: No error thrown, or error message is vague
    Evidence: .sisyphus/evidence/task-1-safety-guard-rejection.txt

  Scenario: test:db:setup is idempotent
    Tool: Bash
    Preconditions: ai_employee_test already exists from previous scenario
    Steps:
      1. Run: pnpm test:db:setup (second time)
      2. Verify no error output
      3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee_test -c "SELECT count(*) FROM tenants"
    Expected Result: No errors. Tenant count still >= 2.
    Failure Indicators: "database already exists" error, or exit code != 0
    Evidence: .sisyphus/evidence/task-1-idempotent-setup.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-test-db-creation.txt
  - [ ] task-1-safety-guard-rejection.txt
  - [ ] task-1-idempotent-setup.txt

  **Commit**: YES (groups with Task 2, 3)
  - Message: `test(infra): add test database isolation with globalSetup and safety guard`
  - Files: `tests/helpers/global-setup.ts`, `package.json`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 2. Update vitest.config.ts with test.env + globalSetup ✓

  **What to do**:
  - Edit `vitest.config.ts` to add three properties inside the `test` block:
    1. `env: { DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/ai_employee_test' }` — hardcodes the test DB URL for all test processes
    2. `globalSetup: './tests/helpers/global-setup.ts'` — runs once before all tests (schema sync + seed)
    3. `setupFiles: []` — leave empty for now (no per-file setup needed; existing `tests/setup.ts` handles connect/disconnect via module-level code)
  - Keep all existing config: `include`, `pool`, `poolOptions`, `testTimeout`

  **Must NOT do**:
  - Do not remove existing config options
  - Do not add `fileParallelism: false` or `maxWorkers: 1` — existing `singleFork: true` already handles sequential execution
  - Do not create a `.env.test` file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, 3 lines added to existing config. No ambiguity.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 1 (globalSetup file must exist)
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: [Task 4]
  - **Blocked By**: [Task 1]

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `vitest.config.ts` (current, 14 lines) — The file to edit. Currently has: `include`, `pool: 'forks'`, `poolOptions.forks.singleFork: true`, `testTimeout: 30000`. Add `env`, `globalSetup` inside the `test` block.
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/packages/database/vitest.config.ts` — Reference config showing `test.env`, `globalSetup`, and `setupFiles` usage together. Note: Nexus also adds `maxWorkers: 1` and `fileParallelism: false` — we do NOT need these because `singleFork: true` already serializes.

  **External References**:
  - Vitest config docs: `https://vitest.dev/config/#env` — `test.env` sets environment variables before test files are loaded (including before module-level imports like `tests/setup.ts:117`)

  **WHY Each Reference Matters**:
  - Current vitest config shows exactly where to insert new properties
  - Nexus config is the reference pattern — but we skip redundant serialization options
  - Vitest docs confirm `test.env` is set BEFORE module loading (validates safety of `tests/setup.ts:117` module-level connect)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Vitest uses test database URL
    Tool: Bash
    Preconditions: ai_employee_test database exists and is seeded (from Task 1)
    Steps:
      1. Run: pnpm test -- --run tests/setup.test.ts 2>&1
      2. Check exit code
    Expected Result: Test passes with exit code 0. The test connects to ai_employee_test (via env override) and runs cleanupTestData() there.
    Failure Indicators: Connection error, test failure, or any reference to ai_employee (dev) in output
    Evidence: .sisyphus/evidence/task-2-vitest-env-override.txt

  Scenario: Dev database is not touched during test run
    Tool: Bash
    Preconditions: Both databases exist. Dev DB has known tenant_secrets count.
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee -c "SELECT count(*) FROM tenant_secrets" > /tmp/before-count.txt
      2. Run: pnpm test -- --run tests/setup.test.ts
      3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee -c "SELECT count(*) FROM tenant_secrets" > /tmp/after-count.txt
      4. diff /tmp/before-count.txt /tmp/after-count.txt
    Expected Result: diff shows no difference — dev DB tenant_secrets count is unchanged
    Failure Indicators: Count differs, or diff shows changes
    Evidence: .sisyphus/evidence/task-2-dev-db-untouched.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-vitest-env-override.txt
  - [ ] task-2-dev-db-untouched.txt

  **Commit**: YES (groups with Task 1, 3)
  - Message: `test(infra): add test database isolation with globalSetup and safety guard`
  - Files: `vitest.config.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Refactor direct PrismaClient instantiations to use getPrisma() ✓

  **What to do**:
  - **`tests/gateway/integration/manual-trigger.integration.test.ts`**:
    1. Replace `import { PrismaClient } from '@prisma/client'` with `import { getPrisma, disconnectPrisma } from '../../setup.js'`
    2. Remove `let prisma: PrismaClient;` (line 8)
    3. Replace `beforeAll` (lines 10-20): remove `prisma = new PrismaClient();`, instead use `const prisma = getPrisma();` directly where needed. Keep the archetype existence check but use `getPrisma()` instead of the local variable.
    4. Replace `afterAll` (lines 22-24): change `prisma.$disconnect()` to `disconnectPrisma()`
    5. Update `beforeEach` (lines 26-30): change `prisma.task.deleteMany(...)` to `getPrisma().task.deleteMany(...)`
    6. Update all test bodies that reference `prisma` to use `getPrisma()` instead
  - **`tests/gateway/seed-guest-messaging.test.ts`**:
    1. Remove `import { PrismaClient } from '@prisma/client'` (line 2) — file already imports `getPrisma, disconnectPrisma` from `../setup.js` on line 3
    2. Remove `let integrationPrisma: PrismaClient;` (line 145)
    3. Replace `beforeAll` (lines 151-159): remove `integrationPrisma = new PrismaClient();`, use `getPrisma()` for the archetype check instead
    4. Replace `afterAll` (lines 161-163): remove `integrationPrisma.$disconnect()` — the existing `afterAll` on lines 10-12 already calls `disconnectPrisma()`
    5. Update `beforeEach` (lines 166-174): change `integrationPrisma.task.deleteMany(...)` to `getPrisma().task.deleteMany(...)`
    6. Update all remaining test bodies that reference `integrationPrisma` to use `getPrisma()` instead

  **Must NOT do**:
  - Do not change test assertions or logic
  - Do not change what data is being created/deleted — only change HOW the PrismaClient is obtained
  - Do not add new imports beyond `getPrisma` and `disconnectPrisma` from `tests/setup.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical refactor — replace variable references with function calls. No logic changes.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: [Task 4]
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `tests/setup.ts:11-16` — `getPrisma()` singleton implementation. Returns a shared PrismaClient that reads DATABASE_URL from env (which will now point to ai_employee_test via vitest config)
  - `tests/setup.ts:35-40` — `disconnectPrisma()` — proper cleanup that also resets the singleton
  - `tests/gateway/services/tenant-repository.test.ts:2,12` — Example of a test that already correctly uses `getPrisma()` from setup. Follow this pattern for the refactored files.
  - `tests/gateway/integration/manual-trigger.integration.test.ts` — Full file (160 lines). Lines 2, 8, 10-11 need refactoring. Lines 22-24 need refactoring. Lines 26-30 need refactoring. All `prisma.` references in test bodies need changing to `getPrisma().`
  - `tests/gateway/seed-guest-messaging.test.ts` — Full file (251 lines). Lines 2, 145, 151-152, 161-163, 166-174 need refactoring. All `integrationPrisma.` references need changing to `getPrisma().`

  **WHY Each Reference Matters**:
  - `getPrisma()` is the single point where DATABASE_URL is consumed — by using it everywhere, the vitest env override covers all test files automatically
  - `tenant-repository.test.ts` shows the canonical "correct" pattern to follow
  - The two files being refactored need to be read in full to find every `prisma.` / `integrationPrisma.` reference

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: manual-trigger.integration.test.ts uses getPrisma()
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. Run: grep -c "new PrismaClient" tests/gateway/integration/manual-trigger.integration.test.ts
      2. Run: grep -c "getPrisma" tests/gateway/integration/manual-trigger.integration.test.ts
    Expected Result: Step 1 returns 0 (no direct instantiation). Step 2 returns >= 1 (uses shared singleton).
    Failure Indicators: Step 1 returns > 0, or step 2 returns 0
    Evidence: .sisyphus/evidence/task-3-manual-trigger-refactor.txt

  Scenario: seed-guest-messaging.test.ts uses getPrisma()
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. Run: grep -c "new PrismaClient" tests/gateway/seed-guest-messaging.test.ts
      2. Run: grep -c "integrationPrisma" tests/gateway/seed-guest-messaging.test.ts
      3. Run: grep -c "getPrisma" tests/gateway/seed-guest-messaging.test.ts
    Expected Result: Step 1 returns 0. Step 2 returns 0 (variable removed). Step 3 returns >= 3.
    Failure Indicators: Steps 1 or 2 return > 0
    Evidence: .sisyphus/evidence/task-3-seed-guest-refactor.txt

  Scenario: No remaining direct PrismaClient instantiations in test files
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. Run: grep -rn "new PrismaClient" tests/ --include="*.ts" | grep -v "setup.ts"
    Expected Result: No output — only tests/setup.ts should instantiate PrismaClient directly
    Failure Indicators: Any file other than tests/setup.ts has "new PrismaClient"
    Evidence: .sisyphus/evidence/task-3-no-direct-prisma.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-manual-trigger-refactor.txt
  - [ ] task-3-seed-guest-refactor.txt
  - [ ] task-3-no-direct-prisma.txt

  **Commit**: YES (groups with Task 1, 2)
  - Message: `test(infra): add test database isolation with globalSetup and safety guard`
  - Files: `tests/gateway/integration/manual-trigger.integration.test.ts`, `tests/gateway/seed-guest-messaging.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 4. Full test suite run + dev DB integrity verification ✓

  **What to do**:
  - Run the full test suite (`pnpm test -- --run`) and verify all tests pass
  - Before running tests, snapshot dev DB state: count rows in `tenant_secrets`, `tasks`, `tenants`, `archetypes`
  - After tests complete, verify dev DB state is unchanged
  - Verify test DB was used: check `ai_employee_test` has tables and seeded data

  **Must NOT do**:
  - Do not modify any files in this task — this is verification only
  - Do not skip pre-existing test failures (container-boot, inngest-serve) — they should still fail as before

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure verification task — run commands, compare output. No code changes.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: [F1-F4]
  - **Blocked By**: [Tasks 1, 2, 3]

  **References**:

  **Pattern References**:
  - `AGENTS.md` "Pre-existing Test Failures" section — `container-boot.test.ts` and `inngest-serve.test.ts` are expected failures. Do not count these as regressions.
  - `AGENTS.md` "Commands" section — `pnpm test -- --run` is the test command

  **WHY Each Reference Matters**:
  - Pre-existing failures must not be confused with regressions from this change
  - Correct test command must be used

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes (minus pre-existing failures)
    Tool: Bash
    Preconditions: Tasks 1-3 complete. ai_employee_test exists.
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/test-output.txt
      2. Check exit code and test summary line
      3. Verify only pre-existing failures appear (container-boot, inngest-serve)
    Expected Result: 515+ tests pass. Only container-boot.test.ts and inngest-serve.test.ts fail (pre-existing).
    Failure Indicators: New test failures, connection errors, or "database does not exist" errors
    Evidence: .sisyphus/evidence/task-4-full-suite.txt

  Scenario: Dev database integrity preserved
    Tool: Bash
    Preconditions: Dev DB has existing data
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee -c "SELECT count(*) as cnt FROM tenant_secrets; SELECT count(*) as cnt FROM tasks; SELECT count(*) as cnt FROM tenants; SELECT count(*) as cnt FROM archetypes;"
      2. Compare with expected: tenants >= 2, archetypes >= 2, tenant_secrets count matches pre-test snapshot
    Expected Result: All counts unchanged from before test run
    Failure Indicators: Any count decreased, or tenant_secrets shows 0
    Evidence: .sisyphus/evidence/task-4-dev-db-integrity.txt

  Scenario: Test database has correct state
    Tool: Bash
    Preconditions: Test suite has completed
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee_test -c "\dt" | head -30
      2. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres ai_employee_test -c "SELECT count(*) FROM tenants; SELECT count(*) FROM archetypes;"
    Expected Result: Step 1 shows all expected tables (tenants, tasks, archetypes, etc.). Step 2 shows tenants >= 2, archetypes >= 2 (from seed).
    Failure Indicators: No tables, or count is 0
    Evidence: .sisyphus/evidence/task-4-test-db-state.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-full-suite.txt
  - [ ] task-4-dev-db-integrity.txt
  - [ ] task-4-test-db-state.txt

  **Commit**: NO

---

- [x] 5. Update AGENTS.md with test DB documentation ✓

  **What to do**:
  - Add a new section to `AGENTS.md` under the "Commands" table (or nearby relevant section) documenting:
    1. Test DB name: `ai_employee_test` on `localhost:54322`
    2. Setup command: `pnpm test:db:setup` (one-time, idempotent)
    3. How it works: Vitest config overrides `DATABASE_URL` → globalSetup runs migrate + seed → all tests use test DB
    4. Safety guard: globalSetup throws if DATABASE_URL doesn't contain `ai_employee_test`
    5. After DB reset: run `pnpm test:db:setup` to recreate the test database
  - Keep the section concise (5-10 lines max) — AGENTS.md is loaded into every LLM call

  **Must NOT do**:
  - Do not add verbose explanations — AGENTS.md must stay concise
  - Do not modify any other section of AGENTS.md
  - Do not duplicate information already in AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 5-10 lines of documentation added to existing file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: [F1-F4]
  - **Blocked By**: None (documentation can be written independently)

  **References**:

  **Pattern References**:
  - `AGENTS.md` "Commands" table — Add `test:db:setup` row to this table
  - `AGENTS.md` "Database" section — Nearby section where test DB info fits naturally

  **WHY Each Reference Matters**:
  - Commands table is where developers look for available scripts
  - Database section establishes the pattern for documenting DB configuration

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md contains test DB documentation
    Tool: Bash
    Preconditions: Documentation added
    Steps:
      1. Run: grep -c "ai_employee_test" AGENTS.md
      2. Run: grep -c "test:db:setup" AGENTS.md
    Expected Result: Step 1 returns >= 1. Step 2 returns >= 1.
    Failure Indicators: Either grep returns 0
    Evidence: .sisyphus/evidence/task-5-agents-md-docs.txt

  Scenario: AGENTS.md is valid and not bloated
    Tool: Bash
    Preconditions: Documentation added
    Steps:
      1. Run: wc -l AGENTS.md
      2. Compare with previous line count (should be within +15 lines)
    Expected Result: Line count increased by no more than 15 lines
    Failure Indicators: Line count increased by > 20 lines (over-documentation)
    Evidence: .sisyphus/evidence/task-5-agents-md-size.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-agents-md-docs.txt
  - [ ] task-5-agents-md-size.txt

  **Commit**: YES
  - Message: `docs: document test database setup in AGENTS.md`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm lint`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle` ✓ APPROVE
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high` ✓ APPROVE
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` ✓ APPROVE
      Start from clean state. Run `pnpm test:db:setup` to create test DB. Run full test suite `pnpm test -- --run`. Then verify dev DB integrity: `psql -p 54322 -U postgres ai_employee -c "SELECT count(*) FROM tenant_secrets"` should show same count as before tests ran. Check that `ai_employee_test` database exists and has tables.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep` ✓ APPROVE
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                      | Files                                                                                                                                                                             | Pre-commit Check     |
| ------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1      | `test(infra): add test database isolation with globalSetup and safety guard` | `tests/helpers/global-setup.ts`, `vitest.config.ts`, `package.json`, `tests/gateway/integration/manual-trigger.integration.test.ts`, `tests/gateway/seed-guest-messaging.test.ts` | `pnpm test -- --run` |
| 2      | `docs: document test database setup in AGENTS.md`                            | `AGENTS.md`                                                                                                                                                                       | `pnpm lint`          |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                    # Expected: all tests pass (515+)
psql -p 54322 -U postgres -c "\l"    # Expected: both ai_employee and ai_employee_test listed
psql -p 54322 -U postgres ai_employee -c "SELECT count(*) FROM tenant_secrets"  # Expected: unchanged after tests
psql -p 54322 -U postgres ai_employee_test -c "SELECT count(*) FROM tenants"    # Expected: seeded tenants exist
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Dev DB untouched after test run
- [ ] Safety guard prevents accidental dev DB use

---

## N. Notify completion

Send Telegram notification: plan `2026-04-24-1522-test-db-isolation` complete, all tasks done, come back to review results.

```bash
tsx scripts/telegram-notify.ts "✅ 2026-04-24-1522-test-db-isolation complete — All tasks done. Come back to review results."
```
