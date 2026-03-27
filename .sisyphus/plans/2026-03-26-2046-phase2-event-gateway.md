# Phase 2: Event Gateway — Work Plan

## TL;DR

> **Quick Summary**: Build the Fastify-based Event Gateway that receives Jira/GitHub webhooks, verifies signatures, validates payloads with Zod, writes task records to Supabase with idempotency and project filtering, logs status transitions, and sends events to Inngest. Every implementation task is paired with automated testing and QA tasks. A Phase 2 architecture doc is written at the end.
>
> **Deliverables**:
>
> - Fastify server with `/health`, `/webhooks/jira`, `/webhooks/github`, `/api/inngest` routes
> - HMAC signature verification (Jira + GitHub header validation)
> - Zod payload validation schemas
> - Project filtering against `projects` table (new `jira_project_key` column)
> - Task creation with idempotency (UNIQUE constraint, P2002 handling)
> - Status logging (`task_status_log` with actor: `gateway`)
> - Inngest client + `inngest.send()` with retry logic
> - Test fixtures (3 Jira webhook payloads)
> - Comprehensive automated tests (Vitest, `app.inject()`, live DB)
> - Manual QA curl verification with documented evidence
> - Phase 2 architecture doc (`docs/YYYY-MM-DD-HHMM-phase2-event-gateway.md`)
> - Updated `progress.json` with Phase 2 checkpoint statuses
>
> **Estimated Effort**: Medium (2-3 focused sessions)
> **Parallel Execution**: YES — 5 waves + final review
> **Critical Path**: Task 1 → Task 6 → Task 13 → Task 18 → Task 22 → Task 25 → F1-F4

---

## Context

### Original Request

Create a granular work plan for Phase 2 (Event Gateway) of the AI Employee Platform. Every meaningful implementation task must have corresponding automated testing, manual testing, and documentation tasks. Plan includes progress.json updates, a final review phase, and a Phase 2 architecture doc similar to the Phase 1 doc.

### Interview Summary

**Key Discussions**:

- Phase 1 is complete: 16-table Prisma schema, 3 migrations, seed data, 12 Vitest tests, all passing
- Phase 2 is exhaustively specified in architecture doc §8: webhook routing table, error handling contract, signature verification, Zod validation, project filtering, idempotency, status logging
- The Event Gateway is thin (~200 lines of Fastify code) per §8
- MVP bypasses triage — sets task status directly to `Ready`
- Inngest integration (`inngest.send()` after task creation) bridges Phase 2 to Phase 3
- Existing codebase: ESM (`type: module`), TypeScript ^5, Prisma ^6, Vitest ^2, pnpm

**Research Findings**:

- Empty `src/gateway/`, `src/inngest/`, `src/lib/`, `src/workers/` directories ready for code
- `package.json` has no `fastify`, `zod`, or `inngest` dependencies yet — must be installed
- `projects` table has `name` but no `jira_project_key` column — schema gap resolved by adding column
- Tests run against live `ai_employee` database on local Supabase (no mocking) — Phase 2 tests follow same pattern
- No `dev` or `start` scripts in `package.json` — must be added for Fastify server

### Metis Review

**Identified Gaps** (all resolved):

- **Project key matching**: `projects` table lacked a `jira_project_key` column → resolved by adding migration (Task 2)
- **Idempotency key source**: `webhookEvent` is event type, not delivery ID → resolved by using `issue.key` as `external_id`
- **GitHub stub definition**: undefined → resolved as 200 OK stub with no processing
- **`/api/inngest` scope**: unclear → resolved as in-scope for Phase 2 (infrastructure only, no function handlers)
- **`fastify-raw-body` requirement**: needed for HMAC verification → included in dependency install
- **Transaction atomicity**: task creation + status log must be atomic → resolved with Prisma `$transaction()`
- **P2002 error handling**: duplicate webhook must return 200 OK → explicit Prisma error code handling
- **Env var validation**: missing validation → resolved with startup validation + fast-fail
- **Inngest testing strategy**: mock `inngest.send()` in unit tests, live Inngest Dev Server for manual QA

---

## Work Objectives

### Core Objective

Build the Event Gateway — the first HTTP-serving component of the AI Employee Platform — that receives Jira webhooks, validates them, creates task records in Supabase with full audit trails, and sends events to Inngest for downstream processing.

### Concrete Deliverables

- `src/gateway/server.ts` — Fastify app factory + server entry point
- `src/gateway/routes/health.ts` — Health check endpoint
- `src/gateway/routes/jira.ts` — Jira webhook handler (full pipeline)
- `src/gateway/routes/github.ts` — GitHub webhook handler (stub)
- `src/gateway/validation/signature.ts` — HMAC signature verification utility
- `src/gateway/validation/schemas.ts` — Zod payload schemas (Jira + GitHub)
- `src/gateway/services/project-lookup.ts` — Project matching service
- `src/gateway/services/task-creation.ts` — Task creation + status log (transactional)
- `src/gateway/inngest/client.ts` — Inngest client configuration
- `src/gateway/inngest/send.ts` — Inngest send wrapper with retry
- `src/gateway/inngest/serve.ts` — `/api/inngest` endpoint registration
- `test-payloads/jira-issue-created.json` — Valid Jira webhook fixture
- `test-payloads/jira-issue-created-invalid.json` — Invalid payload fixture
- `test-payloads/jira-issue-created-unknown-project.json` — Unknown project fixture
- `tests/gateway/*.test.ts` — Comprehensive test suite (unit + integration)
- `docs/YYYY-MM-DD-HHMM-phase2-event-gateway.md` — Phase 2 architecture doc
- Updated `.sisyphus/progress.json` — Phase 2 checkpoints

### Definition of Done

- [ ] `pnpm test -- --run` passes all tests (Phase 1 + Phase 2)
- [ ] `pnpm build` (tsc --noEmit) passes
- [ ] `pnpm lint` passes
- [ ] Gateway starts: `pnpm dev` → server listening on port 3000
- [ ] `curl localhost:3000/health` → `{"status":"ok"}`
- [ ] Valid Jira webhook → task created with status `Ready`, status log entry, Inngest event sent
- [ ] Invalid signature → 401, no DB writes
- [ ] Invalid payload → 400, no DB writes
- [ ] Unknown project → 200, no task created
- [ ] Duplicate webhook → 200, no duplicate task
- [ ] All Phase 2 checkpoints in progress.json marked complete
- [ ] Phase 2 architecture doc written

### Must Have

- Jira HMAC signature verification using `crypto.timingSafeEqual()`
- Zod schema validation for all webhook payloads
- Project filtering against `projects.jira_project_key`
- Idempotent task creation (P2002 → 200 OK, no duplicate)
- Transactional task creation + status log write
- `inngest.send()` with 3-retry exponential backoff
- Structured JSON logging from day one
- `buildApp()` factory pattern (testable without starting server)
- Raw body access for signature verification (`fastify-raw-body`)
- Env var validation at startup (fail fast with clear error)

### Must NOT Have (Guardrails)

- **No Inngest function handlers** (`inngest.createFunction()` is Phase 3)
- **No full GitHub webhook processing** (stub only — active in M4)
- **No Slack interactions endpoint** (`/slack/interactions` is post-MVP)
- **No `dispatch-task.ts` CLI recovery script** (deferred to Phase 3+)
- **No `webhook_events` table** — use existing `tasks` UNIQUE constraint
- **No Prisma mocking in tests** — all tests hit live local Supabase
- **No triage agent logic** — MVP writes `Ready` directly
- **No dynamic tenant resolution** — hardcode system tenant UUID
- **No `@fastify/type-provider-zod`** — use Zod `.parse()` manually after signature verification
- **No over-abstraction** — keep it thin (~200 lines core logic per §8)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES (Vitest ^2 from Phase 1)
- **Automated tests**: YES (TDD — write tests alongside implementation)
- **Framework**: Vitest with `app.inject()` for HTTP tests, live Supabase for DB assertions
- **Pattern**: Follow `tests/schema.test.ts` structure — describe blocks, `afterEach` cleanup, `getPrisma()` singleton

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **HTTP endpoints**: Use `app.inject()` in Vitest — send request, assert status + body + DB state
- **Utilities**: Use Vitest unit tests — call function, assert output
- **Manual QA**: Use Bash (`curl`) — send webhook, query DB, capture output
- **Integration**: Use Bash — start server, send curl, verify Inngest Dev Server dashboard

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Each wave completes before the next begins.

```
Wave 1 (Start Immediately — setup + scaffolding, 5 tasks):
├── Task 1: Install runtime dependencies + update scripts [quick]
├── Task 2: Add jira_project_key migration + seed update [quick]
├── Task 3: Create Jira webhook test fixtures [quick]
├── Task 4: Implement test helpers (HMAC compute, Inngest mock, cleanup extension) [quick]
├── Task 5: Tests: verify migration + seed + test fixtures [quick]

Wave 2 (After Wave 1 — app factory + core utilities, 8 tasks):
├── Task 6: Implement Fastify app factory + /health endpoint (depends: 1) [quick]
├── Task 7: Tests: /health endpoint (depends: 6) [quick]
├── Task 8: Implement HMAC signature verification utility (depends: 1, 4) [quick]
├── Task 9: Tests: HMAC signature verification (depends: 8) [quick]
├── Task 10: Implement Zod payload schemas (depends: 1) [quick]
├── Task 11: Tests: Zod schema validation (depends: 10, 3) [quick]
├── Task 12: Implement project lookup service (depends: 2) [quick]
├── Task 13: Tests: project lookup service (depends: 12) [quick]

Wave 3 (After Wave 2 — services + Inngest, 6 tasks):
├── Task 14: Implement task creation service (depends: 12, 4) [unspecified-high]
├── Task 15: Tests: task creation service (depends: 14) [unspecified-high]
├── Task 16: Implement Inngest client + send wrapper with retry (depends: 1) [quick]
├── Task 17: Tests: Inngest send wrapper (depends: 16, 4) [quick]
├── Task 18: Wire /webhooks/jira route — full pipeline (depends: 6, 8, 10, 12, 14, 16) [unspecified-high]
├── Task 19: Tests: /webhooks/jira integration tests (depends: 18, 3, 4) [unspecified-high]

Wave 4 (After Wave 3 — stubs + Inngest serve, 4 tasks):
├── Task 20: Implement /webhooks/github stub (depends: 6) [quick]
├── Task 21: Tests: /webhooks/github stub (depends: 20) [quick]
├── Task 22: Register /api/inngest serve endpoint (depends: 6, 16) [quick]
├── Task 23: Tests: /api/inngest endpoint (depends: 22) [quick]

Wave 5 (After Wave 4 — QA + docs + progress, 4 tasks):
├── Task 24: Manual QA: curl-based verification of all endpoints [unspecified-high]
├── Task 25: Documentation: write Phase 2 architecture doc [writing]
├── Task 26: Update progress.json Phase 2 checkpoints [quick]
├── Task 27: Commit all Phase 2 work [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Full QA verification (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

```
Critical Path: Task 1 → Task 6 → Task 18 → Task 19 → Task 24 → Task 25 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1), 8 (Wave 2)
```

### Dependency Matrix

| Task | Depends On           | Blocks                  | Wave |
| ---- | -------------------- | ----------------------- | ---- |
| 1    | —                    | 6, 8, 10, 16            | 1    |
| 2    | —                    | 5, 12                   | 1    |
| 3    | —                    | 5, 11, 19               | 1    |
| 4    | —                    | 5, 8, 9, 14, 15, 17, 19 | 1    |
| 5    | 2, 3, 4              | —                       | 1    |
| 6    | 1                    | 7, 18, 20, 22           | 2    |
| 7    | 6                    | —                       | 2    |
| 8    | 1, 4                 | 9, 18                   | 2    |
| 9    | 8                    | —                       | 2    |
| 10   | 1                    | 11, 18                  | 2    |
| 11   | 10, 3                | —                       | 2    |
| 12   | 2                    | 13, 14, 18              | 2    |
| 13   | 12                   | —                       | 2    |
| 14   | 12, 4                | 15, 18                  | 3    |
| 15   | 14                   | —                       | 3    |
| 16   | 1                    | 17, 18, 22              | 3    |
| 17   | 16, 4                | —                       | 3    |
| 18   | 6, 8, 10, 12, 14, 16 | 19, 24                  | 3    |
| 19   | 18, 3, 4             | 24                      | 3    |
| 20   | 6                    | 21                      | 4    |
| 21   | 20                   | —                       | 4    |
| 22   | 6, 16                | 23                      | 4    |
| 23   | 22                   | —                       | 4    |
| 24   | 19, 21, 23           | 25                      | 5    |
| 25   | 24                   | 26                      | 5    |
| 26   | 25                   | 27                      | 5    |
| 27   | 26                   | F1-F4                   | 5    |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1-T5 → `quick`
- **Wave 2**: **8** — T6-T7 → `quick`, T8-T9 → `quick`, T10-T11 → `quick`, T12-T13 → `quick`
- **Wave 3**: **6** — T14-T15 → `unspecified-high`, T16-T17 → `quick`, T18-T19 → `unspecified-high`
- **Wave 4**: **4** — T20-T23 → `quick`
- **Wave 5**: **4** — T24 → `unspecified-high`, T25 → `writing`, T26-T27 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Install Runtime Dependencies + Update Scripts

  **What to do**:
  - Run `pnpm add fastify fastify-raw-body zod inngest`
  - Run `pnpm add -D @types/node` (verify already present or update)
  - Add to `package.json` scripts:
    - `"dev": "tsx src/gateway/server.ts"`
    - `"start": "node dist/gateway/server.js"`
  - Update `.env.example` with new required vars:
    - `JIRA_WEBHOOK_SECRET=`
    - `GITHUB_WEBHOOK_SECRET=`
    - `INNGEST_EVENT_KEY=`
    - `INNGEST_SIGNING_KEY=`
    - `INNGEST_DEV=` (for local development)
  - Update `.env` with working local values (use `test-secret` for webhook secrets in dev)
  - Verify `pnpm build` still passes after adding deps

  **Must NOT do**:
  - Do not install `@fastify/type-provider-zod` — Zod is used manually
  - Do not install test-only dependencies as runtime deps
  - Do not modify `tsconfig.json`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 6, 8, 10, 16
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `package.json:1-39` — Current deps and scripts structure. Add new deps to `dependencies`, new scripts alongside existing ones.
  - `.env.example` (if exists) or `.env` — Current env var template. Add new vars without removing existing DATABASE_URL vars.

  **API/Type References**:
  - Architecture doc §8 — Lists required env vars: `JIRA_WEBHOOK_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
  - Architecture doc §22 — LLM Gateway references `OPENROUTER_API_KEY` (already in .env from Phase 1 planning)

  **External References**:
  - Fastify: `https://fastify.dev/docs/latest/` — ESM import pattern for Fastify v5
  - Inngest: `https://www.inngest.com/docs/reference/client/create` — Client configuration

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes (tsc --noEmit)
  - [ ] `pnpm list fastify zod inngest fastify-raw-body` shows all 4 installed
  - [ ] `pnpm dev` command exists in package.json (may fail to start since server.ts doesn't exist yet — that's expected)
  - [ ] `.env.example` contains all new env vars

  **QA Scenarios**:

  ```
  Scenario: Runtime dependencies installed correctly
    Tool: Bash
    Preconditions: pnpm-lock.yaml exists
    Steps:
      1. Run `pnpm list fastify` — expect version listed
      2. Run `pnpm list zod` — expect version listed
      3. Run `pnpm list inngest` — expect version listed
      4. Run `pnpm list fastify-raw-body` — expect version listed
      5. Run `pnpm build` — expect exit code 0
    Expected Result: All 4 deps listed, build passes
    Failure Indicators: Any dep not found, or build fails
    Evidence: .sisyphus/evidence/task-1-deps-installed.txt

  Scenario: Scripts added to package.json
    Tool: Bash
    Preconditions: package.json exists
    Steps:
      1. Run `node -e "const p = require('./package.json'); console.log(p.scripts.dev);"` — expect `tsx src/gateway/server.ts`
      2. Run `node -e "const p = require('./package.json'); console.log(p.scripts.start);"` — expect `node dist/gateway/server.js`
    Expected Result: Both scripts present with correct values
    Failure Indicators: undefined or wrong command
    Evidence: .sisyphus/evidence/task-1-scripts.txt
  ```

  **Commit**: YES (solo)
  - Message: `chore(deps): add fastify, zod, inngest, fastify-raw-body runtime deps`
  - Files: `package.json`, `pnpm-lock.yaml`, `.env.example`
  - Pre-commit: `pnpm build`

---

- [x] 2. Add `jira_project_key` Column to Projects Table

  **What to do**:
  - Add `jira_project_key String?` column to the `Project` model in `prisma/schema.prisma`
  - Run `pnpm prisma migrate dev --name add_jira_project_key` to create migration
  - Update `prisma/seed.ts`: add `jira_project_key: 'TEST'` to the test project upsert (both create and update blocks)
  - Run `pnpm db:seed` to apply updated seed
  - Verify the column exists and seed data is correct

  **Must NOT do**:
  - Do not modify any other table's schema
  - Do not remove existing columns or constraints
  - Do not add CHECK constraints (simple nullable text column is fine)
  - Do not make the column non-nullable (existing projects have no value)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Tasks 5, 12
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:109-126` — Current `Project` model structure. Add new column alongside `tooling_config`.
  - `prisma/seed.ts:28-43` — Current project upsert. Add `jira_project_key` to both `create` and `update` blocks.
  - `prisma/migrations/` — Existing 3 migrations. New migration follows same naming pattern.

  **API/Type References**:
  - Architecture doc §8 — "match `issue.fields.project.key` against the registered projects" — this column enables that match

  **WHY Each Reference Matters**:
  - `schema.prisma` Project model: shows exact placement and naming convention for new column
  - `seed.ts`: shows upsert pattern to maintain — both `create` and `update` must include new field
  - Existing migrations: confirms we follow Prisma's migration workflow

  **Acceptance Criteria**:
  - [ ] `pnpm prisma migrate status` shows all migrations applied (no pending)
  - [ ] `pnpm prisma generate` succeeds
  - [ ] Query `SELECT jira_project_key FROM projects WHERE name = 'test-project';` returns `'TEST'`

  **QA Scenarios**:

  ```
  Scenario: Migration applied and column exists
    Tool: Bash
    Preconditions: Local Supabase running, ai_employee database exists
    Steps:
      1. Run `pnpm prisma migrate status` — expect "Database schema is up to date"
      2. Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'jira_project_key';"` — expect 1 row
    Expected Result: Migration applied, column exists
    Failure Indicators: Pending migration or column not found
    Evidence: .sisyphus/evidence/task-2-migration.txt

  Scenario: Seed data updated with jira_project_key
    Tool: Bash
    Preconditions: Migration applied, seed run
    Steps:
      1. Run `pnpm db:seed` — expect success
      2. Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT name, jira_project_key FROM projects WHERE id = '00000000-0000-0000-0000-000000000003';"` — expect name=test-project, jira_project_key=TEST
    Expected Result: Seed row has jira_project_key = 'TEST'
    Failure Indicators: NULL or missing column
    Evidence: .sisyphus/evidence/task-2-seed.txt
  ```

  **Commit**: YES (solo)
  - Message: `feat(schema): add jira_project_key column to projects table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`, `prisma/seed.ts`
  - Pre-commit: `pnpm prisma generate && pnpm build`

---

- [x] 3. Create Jira Webhook Test Fixtures

  **What to do**:
  - Create directory `test-payloads/`
  - Create `test-payloads/jira-issue-created.json` — realistic valid Jira `jira:issue_created` webhook payload:
    - `webhookEvent`: `"jira:issue_created"`
    - `issue.id`: `"10001"`
    - `issue.key`: `"TEST-1"`
    - `issue.fields.summary`: `"Add utility function for date formatting"`
    - `issue.fields.description`: `"Create a utility function that formats dates as ISO strings. Include unit tests."`
    - `issue.fields.project.key`: `"TEST"` (matches seed project's `jira_project_key`)
    - `issue.fields.priority.name`: `"Medium"`
    - `issue.fields.labels`: `["enhancement"]`
    - `issue.fields.status.name`: `"To Do"`
    - `issue.fields.issuetype.name`: `"Task"`
    - `issue.fields.reporter.displayName`: `"Test Developer"`
  - Create `test-payloads/jira-issue-created-invalid.json` — missing `issue.key` and `issue.fields.summary` (Zod should reject)
  - Create `test-payloads/jira-issue-created-unknown-project.json` — valid structure but `issue.fields.project.key`: `"UNKNOWN"` (not registered)
  - Create `test-payloads/jira-issue-deleted.json` — `webhookEvent`: `"jira:issue_deleted"` with `issue.key`: `"TEST-1"`
  - All fixtures must be valid JSON, parseable by `JSON.parse()`

  **Must NOT do**:
  - Do not include real Jira credentials or secrets in fixtures
  - Do not create GitHub webhook fixtures (GitHub is stub-only in Phase 2)
  - Do not create more than 4 fixtures — keep it minimal

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Tasks 5, 11, 19
  - **Blocked By**: None (can start immediately)

  **References**:

  **External References**:
  - Jira webhook payload docs: `https://developer.atlassian.com/cloud/jira/platform/webhooks/` — actual Jira payload structure
  - Architecture doc §8 Webhook Event Routing table — defines which `webhookEvent` values to handle and how
  - Architecture doc §8 Payload Validation — required fields: `webhookEvent`, `issue.id`, `issue.key`, `issue.fields.summary`, `issue.fields.project.key`

  **WHY Each Reference Matters**:
  - Jira docs: ensures fixtures match real Jira payload shapes so tests are realistic
  - §8 routing table: defines which webhookEvent types are handled (jira:issue_created, jira:issue_deleted)
  - §8 validation: defines required fields — invalid fixture must be missing exactly these

  **Acceptance Criteria**:
  - [ ] `test-payloads/jira-issue-created.json` is valid JSON with all required fields
  - [ ] `test-payloads/jira-issue-created-invalid.json` is valid JSON but missing required fields
  - [ ] `test-payloads/jira-issue-created-unknown-project.json` is valid JSON with `project.key = "UNKNOWN"`
  - [ ] `test-payloads/jira-issue-deleted.json` is valid JSON with `webhookEvent = "jira:issue_deleted"`

  **QA Scenarios**:

  ```
  Scenario: All fixtures are parseable JSON
    Tool: Bash
    Preconditions: test-payloads/ directory exists
    Steps:
      1. Run `node -e "JSON.parse(require('fs').readFileSync('test-payloads/jira-issue-created.json', 'utf8'))"` — expect no error
      2. Run `node -e "JSON.parse(require('fs').readFileSync('test-payloads/jira-issue-created-invalid.json', 'utf8'))"` — expect no error
      3. Run `node -e "JSON.parse(require('fs').readFileSync('test-payloads/jira-issue-created-unknown-project.json', 'utf8'))"` — expect no error
      4. Run `node -e "JSON.parse(require('fs').readFileSync('test-payloads/jira-issue-deleted.json', 'utf8'))"` — expect no error
    Expected Result: All 4 files parse without error
    Failure Indicators: JSON.parse throws SyntaxError
    Evidence: .sisyphus/evidence/task-3-fixtures-valid.txt

  Scenario: Valid fixture has all required fields
    Tool: Bash
    Preconditions: jira-issue-created.json exists
    Steps:
      1. Run `node -e "const p = JSON.parse(require('fs').readFileSync('test-payloads/jira-issue-created.json', 'utf8')); console.log(p.webhookEvent, p.issue.key, p.issue.fields.summary, p.issue.fields.project.key);"` — expect "jira:issue_created TEST-1 Add utility... TEST"
    Expected Result: All 4 required fields present and non-empty
    Failure Indicators: Any field is undefined or empty
    Evidence: .sisyphus/evidence/task-3-fixture-fields.txt
  ```

  **Commit**: NO (groups with Tasks 4, 5)

---

- [x] 4. Implement Test Helpers

  **What to do**:
  - Extend `tests/setup.ts`:
    - Update `cleanupTestData()` to delete from `task_status_log` → `tasks` in FK-safe order (add `task_status_log` deletion before `tasks` if not already there)
    - Export a `computeJiraSignature(body: string, secret: string): string` helper that computes `sha256=${hmac}` for Jira webhook signature verification in tests
    - Export an `inngestMock` object that provides a mock for `inngest.send()` (returns `Promise.resolve({ ids: ['mock-event-id'] })`) — this will be injected into the app factory
    - Export a `createTestApp()` helper that calls `buildApp()` with mock Inngest and test env vars, returning a ready-to-inject Fastify instance
  - Create `tests/gateway/` directory for Phase 2 test files

  **Must NOT do**:
  - Do not modify existing Phase 1 tests in `tests/schema.test.ts`
  - Do not mock Prisma — all DB operations hit live Supabase
  - Do not create actual Inngest client in test helpers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Tasks 5, 8, 9, 14, 15, 17, 19
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `tests/setup.ts` (exists from Phase 1) — Current test setup with `getPrisma()`, `cleanupTestData()`, `disconnectPrisma()`. Extend these, don't replace.
  - `tests/schema.test.ts:1-12` — Import pattern: `import { getPrisma, cleanupTestData, disconnectPrisma } from './setup.js'`

  **API/Type References**:
  - Node.js `crypto` module — `crypto.createHmac('sha256', secret).update(body).digest('hex')` for HMAC computation
  - Fastify `app.inject()` — Used in tests to send HTTP requests without starting a real server

  **WHY Each Reference Matters**:
  - `tests/setup.ts`: Must extend (not replace) to maintain backward compatibility with Phase 1 tests
  - Phase 1 import pattern: All Phase 2 tests will follow same import structure

  **Acceptance Criteria**:
  - [ ] `cleanupTestData()` deletes `task_status_log` before `tasks` (FK order)
  - [ ] `computeJiraSignature('body', 'secret')` returns a string starting with `sha256=`
  - [ ] `inngestMock.send()` returns a resolved promise
  - [ ] `tests/gateway/` directory exists
  - [ ] Existing Phase 1 tests still pass: `pnpm test -- --run tests/schema.test.ts`

  **QA Scenarios**:

  ```
  Scenario: HMAC helper computes correct signature
    Tool: Bash
    Preconditions: tests/setup.ts updated
    Steps:
      1. Run `node -e "import('crypto').then(c => console.log('sha256=' + c.createHmac('sha256', 'test-secret').update('hello').digest('hex')))"` — capture expected value
      2. In a test, call `computeJiraSignature('hello', 'test-secret')` — expect same value
    Expected Result: Both produce identical sha256= prefixed hash
    Failure Indicators: Hashes don't match
    Evidence: .sisyphus/evidence/task-4-hmac-helper.txt

  Scenario: Phase 1 tests still pass after setup extension
    Tool: Bash
    Preconditions: tests/setup.ts modified
    Steps:
      1. Run `pnpm test -- --run tests/schema.test.ts` — expect all 12 tests pass
    Expected Result: 12 tests pass, 0 failures
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-4-phase1-compat.txt
  ```

  **Commit**: NO (groups with Tasks 3, 5)

---

- [x] 5. Tests: Verify Migration, Seed Data, and Test Fixtures

  **What to do**:
  - Create `tests/gateway/migration.test.ts`:
    - Test: `jira_project_key` column exists on `projects` table (query `information_schema.columns`)
    - Test: seed project has `jira_project_key = 'TEST'`
    - Test: `jira_project_key` is nullable (insert project without it — should succeed)
  - Create `tests/gateway/fixtures.test.ts`:
    - Test: all 4 test fixture files exist and are parseable JSON
    - Test: `jira-issue-created.json` has required fields (`webhookEvent`, `issue.key`, `issue.fields.summary`, `issue.fields.project.key`)
    - Test: `jira-issue-created-invalid.json` is missing at least one required field
    - Test: `jira-issue-created-unknown-project.json` has `project.key` that doesn't match seed data
  - Run full test suite to verify no regressions

  **Must NOT do**:
  - Do not modify Phase 1 tests
  - Do not skip the fixture validation tests (fixtures are a dependency for later tasks)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Tasks 2, 3, 4 completing
  - **Parallel Group**: Wave 1 (final task in wave)
  - **Blocks**: None directly (but validates Wave 1 completeness)
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `tests/schema.test.ts:17-48` — Table existence test pattern using `information_schema.columns` query
  - `tests/schema.test.ts:182-209` — Seed data verification pattern using `prisma.project.findFirst()`

  **WHY Each Reference Matters**:
  - Table existence pattern: reuse exact query pattern for column existence check
  - Seed verification: reuse `findFirst` + assertion pattern for new column

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/migration.test.ts` — all tests pass
  - [ ] `pnpm test -- --run tests/gateway/fixtures.test.ts` — all tests pass
  - [ ] `pnpm test -- --run` — ALL tests pass (Phase 1 + Phase 2 together)

  **QA Scenarios**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: Tasks 2, 3, 4 complete
    Steps:
      1. Run `pnpm test -- --run` — expect all tests pass
    Expected Result: 0 failures across all test files
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-full-suite.txt
  ```

  **Commit**: YES (with Tasks 3, 4)
  - Message: `test(gateway): add webhook fixtures, test helpers, and migration verification`
  - Files: `test-payloads/*`, `tests/setup.ts`, `tests/gateway/migration.test.ts`, `tests/gateway/fixtures.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Implement Fastify App Factory + /health Endpoint

  **What to do**:
  - Create `src/gateway/server.ts`:
    - Export `buildApp(options?: { inngestClient?: InngestLike })` factory function that creates a Fastify instance
    - Register `fastify-raw-body` plugin with `{ runFirst: true, global: false }` (per-route opt-in)
    - Register structured JSON logger (Fastify's built-in pino logger with `{ level: 'info' }`)
    - Validate required env vars at startup: `JIRA_WEBHOOK_SECRET`. If missing, throw with clear message.
    - Register `/health` route (from separate module)
    - At bottom of file: if `import.meta.url === ...` (ESM main module check), call `buildApp()` then `app.listen({ port: 3000, host: '0.0.0.0' })`
  - Create `src/gateway/routes/health.ts`:
    - Export function that registers `GET /health` → returns `200 { status: "ok" }`
    - No authentication required
  - Verify `pnpm dev` starts the server and `/health` responds

  **Must NOT do**:
  - Do not add any business logic routes yet (webhook routes come in later tasks)
  - Do not configure Inngest serve middleware here (Task 22)
  - Do not add CORS, rate limiting, or other middleware (keep minimal)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, parallel with Tasks 8, 10, 12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 7, 18, 20, 22
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `package.json:9-18` — Existing scripts. `dev` script will run `tsx src/gateway/server.ts`.
  - `tsconfig.json` — ESM configuration (`"module": "NodeNext"`, `"moduleResolution": "NodeNext"`). All imports must use `.js` extension.

  **External References**:
  - Fastify ESM docs: `https://fastify.dev/docs/latest/Guides/Getting-Started/` — ESM import pattern
  - fastify-raw-body: `https://github.com/Eomm/fastify-raw-body` — Plugin registration with `runFirst` option

  **WHY Each Reference Matters**:
  - ESM imports: Fastify v5 + ESM requires `import Fastify from 'fastify'` pattern. Must use `.js` extensions in relative imports.
  - fastify-raw-body: MUST be registered with `runFirst: true` so raw body is captured before JSON parsing (needed for HMAC verification)

  **Acceptance Criteria**:
  - [ ] `buildApp()` returns a Fastify instance
  - [ ] `GET /health` returns `200 { "status": "ok" }`
  - [ ] Server starts on port 3000 with `pnpm dev`
  - [ ] Missing `JIRA_WEBHOOK_SECRET` env var causes startup error with clear message

  **QA Scenarios**:

  ```
  Scenario: Health endpoint returns 200 OK
    Tool: Vitest (app.inject)
    Preconditions: buildApp() available
    Steps:
      1. Call `const app = buildApp({ inngestClient: inngestMock })`
      2. `const res = await app.inject({ method: 'GET', url: '/health' })`
      3. Assert `res.statusCode === 200`
      4. Assert `JSON.parse(res.body).status === 'ok'`
    Expected Result: 200 with { status: "ok" }
    Failure Indicators: Non-200 status or wrong body
    Evidence: .sisyphus/evidence/task-6-health.txt

  Scenario: Missing env var causes startup failure
    Tool: Vitest
    Preconditions: JIRA_WEBHOOK_SECRET not set
    Steps:
      1. Unset JIRA_WEBHOOK_SECRET
      2. Call `buildApp()` — expect throw
      3. Assert error message contains "JIRA_WEBHOOK_SECRET"
    Expected Result: Error thrown with descriptive message
    Failure Indicators: Silent startup or wrong error
    Evidence: .sisyphus/evidence/task-6-env-validation.txt
  ```

  **Commit**: NO (groups with Task 7)

---

- [x] 7. Tests: /health Endpoint

  **What to do**:
  - Create `tests/gateway/health.test.ts`:
    - Test: `GET /health` returns 200 with `{ status: "ok" }`
    - Test: `GET /health` requires no authentication headers
    - Test: `GET /nonexistent` returns 404
    - Test: `buildApp()` factory creates isolated instances (two calls produce different instances)
  - Use `createTestApp()` helper from Task 4 to create app instances
  - Use `app.inject()` for all HTTP assertions — no `curl`, no real server

  **Must NOT do**:
  - Do not start a real HTTP server in tests
  - Do not test webhook routes here (separate test files)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 6
  - **Parallel Group**: Wave 2 (sequential after Task 6)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `tests/schema.test.ts:1-12` — Import pattern and test structure
  - Fastify `app.inject()` docs: standard pattern for testing Fastify routes without HTTP

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/health.test.ts` — all tests pass
  - [ ] Tests use `app.inject()`, not `curl` or real HTTP

  **QA Scenarios**:

  ```
  Scenario: Health tests pass
    Tool: Bash
    Preconditions: Task 6 complete
    Steps:
      1. Run `pnpm test -- --run tests/gateway/health.test.ts`
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-health-tests.txt
  ```

  **Commit**: YES (with Task 6)
  - Message: `feat(gateway): implement Fastify app factory and /health endpoint`
  - Files: `src/gateway/server.ts`, `src/gateway/routes/health.ts`, `tests/gateway/health.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

- [x] 8. Implement HMAC Signature Verification Utility

  **What to do**:
  - Create `src/gateway/validation/signature.ts`:
    - Export `verifyJiraSignature(rawBody: string, signatureHeader: string, secret: string): boolean`
      - Parse `signatureHeader` — expects format `sha256=<hex>` (Jira's `X-Hub-Signature` header)
      - Compute expected HMAC: `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')`
      - Compare using `crypto.timingSafeEqual()` to prevent timing attacks
      - Return `true` if match, `false` if mismatch
      - Handle edge cases: missing header, malformed header (no `sha256=` prefix), empty body
    - Export `verifyGitHubSignature(rawBody: string, signatureHeader: string, secret: string): boolean`
      - Same logic but expects `X-Hub-Signature-256` header format: `sha256=<hex>`
      - Same `crypto.timingSafeEqual()` comparison
    - Both functions must NEVER throw — return `false` on any error (malformed input, missing prefix, etc.)

  **Must NOT do**:
  - Do not use `===` for HMAC comparison (timing attack vulnerability)
  - Do not throw exceptions — return boolean only
  - Do not import Fastify types (this is a pure utility, framework-agnostic)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, parallel with Tasks 6, 10, 12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 18
  - **Blocked By**: Tasks 1, 4

  **References**:

  **API/Type References**:
  - Node.js `crypto` module — `createHmac`, `timingSafeEqual`
  - Architecture doc §8 — "Jira: HMAC signature verification", "GitHub: X-Hub-Signature-256 header verification"

  **External References**:
  - Jira webhook signature: Jira sends `X-Hub-Signature` header with `sha256=<hmac>` format
  - GitHub webhook signature: GitHub sends `X-Hub-Signature-256` header with `sha256=<hmac>` format

  **Acceptance Criteria**:
  - [ ] `verifyJiraSignature(body, validSig, secret)` returns `true`
  - [ ] `verifyJiraSignature(body, invalidSig, secret)` returns `false`
  - [ ] `verifyJiraSignature(body, '', secret)` returns `false` (empty header)
  - [ ] `verifyJiraSignature(body, 'no-prefix', secret)` returns `false` (missing sha256= prefix)
  - [ ] Uses `crypto.timingSafeEqual()` (grep for it)

  **QA Scenarios**:

  ```
  Scenario: Valid signature accepted
    Tool: Vitest
    Steps:
      1. Compute: `const body = '{"test":true}'; const secret = 'test-secret'; const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');`
      2. Call `verifyJiraSignature(body, sig, secret)` — expect `true`
    Expected Result: Returns true
    Evidence: .sisyphus/evidence/task-8-valid-sig.txt

  Scenario: Tampered body rejected
    Tool: Vitest
    Steps:
      1. Compute signature for `body1 = '{"a":1}'`
      2. Call `verifyJiraSignature('{"a":2}', sig, secret)` — expect `false`
    Expected Result: Returns false
    Evidence: .sisyphus/evidence/task-8-tampered.txt

  Scenario: Malformed header returns false (no throw)
    Tool: Vitest
    Steps:
      1. Call `verifyJiraSignature('body', 'not-a-valid-header', 'secret')` — expect `false`
      2. Call `verifyJiraSignature('body', '', 'secret')` — expect `false`
      3. Call `verifyJiraSignature('body', 'md5=abc', 'secret')` — expect `false`
    Expected Result: All return false, no exceptions thrown
    Evidence: .sisyphus/evidence/task-8-malformed.txt
  ```

  **Commit**: NO (groups with Task 9)

---

- [x] 9. Tests: HMAC Signature Verification

  **What to do**:
  - Create `tests/gateway/signature.test.ts`:
    - Test: valid Jira signature returns `true`
    - Test: invalid Jira signature (tampered body) returns `false`
    - Test: missing `sha256=` prefix returns `false`
    - Test: empty signature header returns `false`
    - Test: wrong secret returns `false`
    - Test: valid GitHub signature returns `true`
    - Test: uses `timingSafeEqual` (verify by checking crypto import — or test that equal-length but different strings both take similar time)
  - Use `computeJiraSignature()` helper from Task 4 to generate valid signatures in tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 8
  - **Parallel Group**: Wave 2 (sequential after Task 8)
  - **Blocks**: None
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `tests/schema.test.ts:54-124` — describe/it pattern for constraint tests

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/signature.test.ts` — all tests pass (7+ tests)

  **QA Scenarios**:

  ```
  Scenario: Signature tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/signature.test.ts`
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-9-sig-tests.txt
  ```

  **Commit**: YES (with Task 8)
  - Message: `feat(gateway): implement HMAC signature verification with tests`
  - Files: `src/gateway/validation/signature.ts`, `tests/gateway/signature.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

- [x] 10. Implement Zod Payload Validation Schemas

  **What to do**:
  - Create `src/gateway/validation/schemas.ts`:
    - Export `JiraWebhookSchema` — Zod schema for Jira webhook payloads:
      - Required: `webhookEvent: z.string()`, `issue: z.object({ id: z.string(), key: z.string(), fields: z.object({ summary: z.string(), project: z.object({ key: z.string() }), ... }) })`
      - Optional fields (present but not required for validation): `description`, `priority`, `labels`, `status`, `issuetype`, `reporter`
      - Use `z.object().passthrough()` for the top level to allow extra Jira fields, but `.strict()` on required subfields
    - Export `JiraIssueDeletedSchema` — Zod schema for `jira:issue_deleted`:
      - Required: `webhookEvent: z.string()`, `issue: z.object({ key: z.string() })`
    - Export `GitHubPRWebhookSchema` — Zod schema for GitHub PR webhooks (stub, for future M4):
      - Required: `action: z.string()`, `pull_request: z.object({ number: z.number() })`, `repository: z.object({ full_name: z.string() })`
    - Export type inferences: `type JiraWebhookPayload = z.infer<typeof JiraWebhookSchema>`
    - Export `parseJiraWebhook(body: unknown): JiraWebhookPayload` — calls `.parse()`, throws `ZodError` on failure
    - Export `parseJiraIssueDeletion(body: unknown)` — same pattern for deletion

  **Must NOT do**:
  - Do not use `@fastify/type-provider-zod` — manual `.parse()` only
  - Do not make every Jira field required — be lenient on optional fields
  - Do not validate field values (e.g., don't CHECK status values in Zod — that's the DB's job)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, parallel with Tasks 6, 8, 12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 11, 18
  - **Blocked By**: Task 1

  **References**:

  **API/Type References**:
  - Architecture doc §8 Payload Validation — Required fields for Jira: `webhookEvent`, `issue.id`, `issue.key`, `issue.fields.summary`, `issue.fields.project.key`
  - Architecture doc §8 Payload Validation — Required fields for GitHub PR: `action`, `pull_request.number`, `repository.full_name`

  **External References**:
  - Zod docs: `https://zod.dev/?id=basic-usage` — `.object()`, `.string()`, `.parse()`, `.passthrough()`

  **Acceptance Criteria**:
  - [ ] Valid Jira payload passes `JiraWebhookSchema.parse()`
  - [ ] Payload missing `issue.key` throws `ZodError`
  - [ ] Payload missing `issue.fields.summary` throws `ZodError`
  - [ ] Extra fields on top-level object are preserved (passthrough)
  - [ ] TypeScript type `JiraWebhookPayload` is exported

  **QA Scenarios**:

  ```
  Scenario: Valid fixture passes schema
    Tool: Vitest
    Steps:
      1. Load `test-payloads/jira-issue-created.json`
      2. Call `parseJiraWebhook(fixture)` — expect no throw
      3. Assert result has `issue.key === 'TEST-1'`
    Expected Result: Parsed successfully with correct fields
    Evidence: .sisyphus/evidence/task-10-valid-parse.txt

  Scenario: Invalid fixture fails schema
    Tool: Vitest
    Steps:
      1. Load `test-payloads/jira-issue-created-invalid.json`
      2. Call `parseJiraWebhook(fixture)` — expect `ZodError`
    Expected Result: ZodError thrown
    Evidence: .sisyphus/evidence/task-10-invalid-parse.txt
  ```

  **Commit**: NO (groups with Task 11)

---

- [x] 11. Tests: Zod Schema Validation

  **What to do**:
  - Create `tests/gateway/schemas.test.ts`:
    - Test: valid `jira-issue-created.json` fixture passes `JiraWebhookSchema`
    - Test: `jira-issue-created-invalid.json` fixture throws `ZodError`
    - Test: payload missing only `issue.key` throws `ZodError` with path `['issue', 'key']`
    - Test: payload missing only `issue.fields.project.key` throws `ZodError`
    - Test: extra fields are preserved in parsed output (passthrough behavior)
    - Test: `JiraIssueDeletedSchema` accepts deletion fixture
    - Test: `GitHubPRWebhookSchema` accepts valid GitHub PR payload
    - Test: `parseJiraWebhook()` returns correct TypeScript type

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Tasks 10, 3
  - **Parallel Group**: Wave 2 (sequential after Task 10)
  - **Blocks**: None
  - **Blocked By**: Tasks 10, 3

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/schemas.test.ts` — all tests pass (8+ tests)

  **QA Scenarios**:

  ```
  Scenario: Schema tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/schemas.test.ts`
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-11-schema-tests.txt
  ```

  **Commit**: YES (with Task 10)
  - Message: `feat(gateway): implement Zod payload schemas with tests`
  - Files: `src/gateway/validation/schemas.ts`, `tests/gateway/schemas.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

- [x] 12. Implement Project Lookup Service

  **What to do**:
  - Create `src/gateway/services/project-lookup.ts`:
    - Export `lookupProjectByJiraKey(jiraProjectKey: string, tenantId: string): Promise<Project | null>`
    - Query: `prisma.project.findFirst({ where: { jira_project_key: jiraProjectKey, tenant_id: tenantId } })`
    - Returns the matched `Project` record or `null` if not found
    - Accept `PrismaClient` as a parameter (dependency injection for testability)
  - Keep it simple — single function, no caching, no complex logic

  **Must NOT do**:
  - Do not cache project lookups (premature optimization for MVP)
  - Do not match on `name` field — match on `jira_project_key` only
  - Do not query multiple tables

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, parallel with Tasks 6, 8, 10)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13, 14, 18
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:109-126` — Project model with new `jira_project_key` column
  - `prisma/seed.ts:28-43` — Seed project has `jira_project_key: 'TEST'`

  **API/Type References**:
  - Architecture doc §8 — "match `issue.fields.project.key` against the registered projects"

  **Acceptance Criteria**:
  - [ ] `lookupProjectByJiraKey('TEST', tenantId)` returns the seed project
  - [ ] `lookupProjectByJiraKey('UNKNOWN', tenantId)` returns `null`
  - [ ] Function accepts `PrismaClient` as parameter

  **QA Scenarios**:

  ```
  Scenario: Known project found
    Tool: Vitest (live DB)
    Steps:
      1. Call `lookupProjectByJiraKey('TEST', '00000000-0000-0000-0000-000000000001')` with real Prisma client
      2. Assert result is not null
      3. Assert `result.name === 'test-project'`
    Expected Result: Project returned with correct data
    Evidence: .sisyphus/evidence/task-12-project-found.txt

  Scenario: Unknown project returns null
    Tool: Vitest (live DB)
    Steps:
      1. Call `lookupProjectByJiraKey('UNKNOWN', '00000000-0000-0000-0000-000000000001')`
      2. Assert result is `null`
    Expected Result: null returned, no error
    Evidence: .sisyphus/evidence/task-12-project-unknown.txt
  ```

  **Commit**: NO (groups with Task 13)

---

- [x] 13. Tests: Project Lookup Service

  **What to do**:
  - Create `tests/gateway/project-lookup.test.ts`:
    - Test: returns project when `jira_project_key` matches seed data (`'TEST'`)
    - Test: returns `null` when `jira_project_key` is `'UNKNOWN'`
    - Test: returns `null` when `jira_project_key` matches but `tenant_id` differs
    - Test: returns `null` for empty string key
  - All tests use live Supabase (no mocking)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 12
  - **Parallel Group**: Wave 2 (sequential after Task 12)
  - **Blocks**: None
  - **Blocked By**: Task 12

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/project-lookup.test.ts` — all tests pass (4 tests)

  **QA Scenarios**:

  ```
  Scenario: Project lookup tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/project-lookup.test.ts`
    Expected Result: All 4 tests pass
    Evidence: .sisyphus/evidence/task-13-project-tests.txt
  ```

  **Commit**: YES (with Task 12)
  - Message: `feat(gateway): implement project lookup service with tests`
  - Files: `src/gateway/services/project-lookup.ts`, `tests/gateway/project-lookup.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

- [x] 14. Implement Task Creation Service

  **What to do**:
  - Create `src/gateway/services/task-creation.ts`:
    - Export `createTaskFromJiraWebhook(params: { payload: JiraWebhookPayload, projectId: string, tenantId: string, prisma: PrismaClient }): Promise<{ task: Task, created: boolean }>`
    - Inside a `prisma.$transaction()`:
      1. Create `tasks` record with:
         - `external_id`: `payload.issue.key` (e.g., `"TEST-1"`)
         - `source_system`: `"jira"`
         - `status`: `"Ready"` (MVP bypasses triage)
         - `project_id`: from parameter
         - `tenant_id`: from parameter
         - `raw_event`: full payload as JSONB
         - `triage_result`: structured object with: `{ ticket_id: issue.key, title: issue.fields.summary, description: issue.fields.description || null, labels: issue.fields.labels || [], priority: issue.fields.priority?.name || null, raw_ticket: payload.issue }`
      2. Create `task_status_log` entry with: `task_id`, `from_status: null`, `to_status: "Ready"`, `actor: "gateway"`
    - Handle UNIQUE constraint violation (`PrismaClientKnownRequestError` code `P2002`):
      - Catch the error, return `{ task: existingTask, created: false }` — do NOT throw
      - Look up existing task by `external_id` + `source_system` + `tenant_id`
    - Return `{ task, created: true }` on successful creation
    - Export `cancelTaskByExternalId(params: { externalId: string, sourceSystem: string, tenantId: string, prisma: PrismaClient }): Promise<boolean>`
      - Find task by `external_id`, `source_system`, `tenant_id`
      - If found and status is not `Done`/`Cancelled`: update to `Cancelled`, create status log entry, return `true`
      - If not found or already terminal: return `false`

  **Must NOT do**:
  - Do not call `inngest.send()` here — that's the route handler's job
  - Do not validate the payload (Zod already did that in the route)
  - Do not implement full cancellation lifecycle (just DB update)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Transaction logic with error handling requires careful implementation
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 16, 18 needs this but runs after)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 15, 18
  - **Blocked By**: Tasks 12, 4

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:19-49` — Task model: all fields, UNIQUE constraint, status default
  - `prisma/schema.prisma:147-159` — TaskStatusLog model: required fields, actor constraint
  - `prisma/seed.ts:9-44` — Transaction pattern using `prisma.$transaction()`

  **API/Type References**:
  - Architecture doc §8 — Task creation: "Write to tasks table with status Ready", "Store full normalized payload in raw_event JSONB"
  - Architecture doc §8 — "triage_result with raw Jira webhook payload" — structured interface
  - Architecture doc §8 — Error handling: "UNIQUE violation → return 200 OK (idempotent)"
  - Architecture doc §8 — "Write task_status_log entry on every status transition (actor: gateway)"
  - Prisma error codes: `P2002` = unique constraint violation

  **WHY Each Reference Matters**:
  - Task model: defines exact column names and types for the INSERT
  - TaskStatusLog: defines required fields — `actor` has a CHECK constraint (must be 'gateway')
  - Transaction pattern: task + status_log must be atomic to prevent orphaned records
  - P2002 handling: the architecture explicitly defines this as idempotent (200 OK, not error)

  **Acceptance Criteria**:
  - [ ] `createTaskFromJiraWebhook()` creates task with status `"Ready"` and populated `triage_result`
  - [ ] Task and status log are created in a single transaction
  - [ ] Duplicate call returns `{ created: false }` without throwing
  - [ ] `triage_result` contains `ticket_id`, `title`, `description`, `labels`, `priority`, `raw_ticket`
  - [ ] `raw_event` contains the full webhook payload
  - [ ] `cancelTaskByExternalId()` sets status to `Cancelled` with status log

  **QA Scenarios**:

  ```
  Scenario: Task creation happy path
    Tool: Vitest (live DB)
    Steps:
      1. Load `jira-issue-created.json`, parse with Zod
      2. Call `createTaskFromJiraWebhook({ payload, projectId: seedProjectId, tenantId: TENANT_ID, prisma })`
      3. Assert `result.created === true`
      4. Assert `result.task.status === 'Ready'`
      5. Assert `result.task.external_id === 'TEST-1'`
      6. Query `task_status_log` for this task — assert 1 row with `from_status: null, to_status: 'Ready', actor: 'gateway'`
      7. Assert `result.task.triage_result` has `ticket_id`, `title` fields
    Expected Result: Task + status log created, all fields correct
    Evidence: .sisyphus/evidence/task-14-creation-happy.txt

  Scenario: Duplicate webhook returns created=false
    Tool: Vitest (live DB)
    Steps:
      1. Create task (same as happy path)
      2. Call `createTaskFromJiraWebhook()` again with same payload
      3. Assert `result.created === false`
      4. Assert `result.task.id` matches first call's task ID
      5. Query `SELECT COUNT(*) FROM tasks WHERE external_id = 'TEST-1'` — assert 1
      6. Query `SELECT COUNT(*) FROM task_status_log WHERE task_id = result.task.id` — assert 1 (not 2)
    Expected Result: No duplicate, no extra log entry
    Evidence: .sisyphus/evidence/task-14-duplicate.txt

  Scenario: Cancellation updates status
    Tool: Vitest (live DB)
    Steps:
      1. Create a task first
      2. Call `cancelTaskByExternalId({ externalId: 'TEST-1', sourceSystem: 'jira', tenantId: TENANT_ID, prisma })`
      3. Assert returns `true`
      4. Query task — assert status is `Cancelled`
      5. Query `task_status_log` — assert entry with `to_status: 'Cancelled', actor: 'gateway'`
    Expected Result: Task cancelled with audit trail
    Evidence: .sisyphus/evidence/task-14-cancel.txt
  ```

  **Commit**: NO (groups with Task 15)

---

- [x] 15. Tests: Task Creation Service

  **What to do**:
  - Create `tests/gateway/task-creation.test.ts`:
    - Test: happy path — task created with all expected fields
    - Test: `triage_result` has all 6 required fields (`ticket_id`, `title`, `description`, `labels`, `priority`, `raw_ticket`)
    - Test: `raw_event` is the full webhook payload (not null, contains `webhookEvent`)
    - Test: `task_status_log` entry created with correct `from_status`, `to_status`, `actor`
    - Test: duplicate creation returns `{ created: false }` (P2002 handled)
    - Test: duplicate does NOT create extra `task_status_log` entry
    - Test: cancellation updates status to `Cancelled`
    - Test: cancellation of non-existent task returns `false`
    - Test: cancellation of already-`Done` task returns `false`
    - Test: transaction rollback — if status log creation fails, task is not created (simulate by passing invalid actor)
  - All tests use live Supabase, cleanup after each test

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Tests need careful DB state management and edge case coverage
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 14
  - **Parallel Group**: Wave 3 (sequential after Task 14)
  - **Blocks**: None
  - **Blocked By**: Task 14

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/task-creation.test.ts` — all tests pass (10 tests)

  **QA Scenarios**:

  ```
  Scenario: Task creation tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/task-creation.test.ts`
    Expected Result: All 10 tests pass
    Evidence: .sisyphus/evidence/task-15-creation-tests.txt
  ```

  **Commit**: YES (with Task 14)
  - Message: `feat(gateway): implement task creation service with tests`
  - Files: `src/gateway/services/task-creation.ts`, `tests/gateway/task-creation.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

- [x] 16. Implement Inngest Client + Send Wrapper with Retry

  **What to do**:
  - Create `src/gateway/inngest/client.ts`:
    - Export `createInngestClient()` — creates and returns an Inngest client instance
    - Configuration: `{ id: 'ai-employee', isDev: process.env.INNGEST_DEV === '1' }`
    - Export `InngestLike` interface — minimal type for dependency injection: `{ send(event: { name: string; data: Record<string, unknown>; id?: string }): Promise<{ ids: string[] }> }`
  - Create `src/gateway/inngest/send.ts`:
    - Export `sendTaskReceivedEvent(params: { inngest: InngestLike, taskId: string, projectId: string, eventId?: string }): Promise<{ success: boolean; error?: string }>`
    - Builds event: `{ name: 'engineering/task.received', data: { taskId, projectId }, id: eventId }`
    - Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s delay between attempts)
    - On success: return `{ success: true }`
    - On failure after 3 retries: return `{ success: false, error: errorMessage }` — do NOT throw
    - Log each retry attempt

  **Must NOT do**:
  - Do not create Inngest functions (`inngest.createFunction()`) — that's Phase 3
  - Do not make retry logic configurable (hardcode 3 attempts, 1s/2s/4s)
  - Do not import Fastify types

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 14, in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 17, 18, 22
  - **Blocked By**: Task 1

  **References**:

  **API/Type References**:
  - Architecture doc §8 — "inngest.send() called after Supabase task creation", "Event ID set to webhook delivery ID (deduplication)", "Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)"
  - Architecture doc §8 — Event name: `engineering/task.received`, data: `{ taskId, projectId }`

  **External References**:
  - Inngest SDK: `https://www.inngest.com/docs/reference/client/send` — `inngest.send()` API

  **Acceptance Criteria**:
  - [ ] `sendTaskReceivedEvent()` sends event with correct name and data
  - [ ] On success: returns `{ success: true }`
  - [ ] On failure after 3 retries: returns `{ success: false, error: '...' }`
  - [ ] `InngestLike` interface is exported for dependency injection

  **QA Scenarios**:

  ```
  Scenario: Successful send
    Tool: Vitest (mock)
    Steps:
      1. Create mock: `{ send: vi.fn().mockResolvedValue({ ids: ['test-id'] }) }`
      2. Call `sendTaskReceivedEvent({ inngest: mock, taskId: 'abc', projectId: 'def' })`
      3. Assert result `{ success: true }`
      4. Assert mock.send called once with correct event shape
    Expected Result: Event sent, success returned
    Evidence: .sisyphus/evidence/task-16-send-success.txt

  Scenario: Retry on failure then succeed
    Tool: Vitest (mock)
    Steps:
      1. Create mock that fails twice then succeeds: `vi.fn().mockRejectedValueOnce(new Error('fail')).mockRejectedValueOnce(new Error('fail')).mockResolvedValue({ ids: ['id'] })`
      2. Call `sendTaskReceivedEvent({ inngest: mock, taskId: 'abc', projectId: 'def' })`
      3. Assert result `{ success: true }`
      4. Assert mock.send called 3 times
    Expected Result: Success after 2 retries
    Evidence: .sisyphus/evidence/task-16-retry.txt

  Scenario: All retries exhausted
    Tool: Vitest (mock)
    Steps:
      1. Create mock that always fails: `vi.fn().mockRejectedValue(new Error('permanent fail'))`
      2. Call `sendTaskReceivedEvent({ inngest: mock, taskId: 'abc', projectId: 'def' })`
      3. Assert result `{ success: false, error: expect.stringContaining('permanent fail') }`
      4. Assert mock.send called 3 times
    Expected Result: Failure returned (no throw), 3 attempts made
    Evidence: .sisyphus/evidence/task-16-exhausted.txt
  ```

  **Commit**: NO (groups with Task 17)

---

- [x] 17. Tests: Inngest Send Wrapper

  **What to do**:
  - Create `tests/gateway/inngest-send.test.ts`:
    - Test: successful send returns `{ success: true }`
    - Test: event has correct name `engineering/task.received` and data shape `{ taskId, projectId }`
    - Test: event `id` is set when `eventId` parameter provided
    - Test: retry on first failure, succeed on second — returns `{ success: true }`, 2 calls total
    - Test: retry on first two failures, succeed on third — returns `{ success: true }`, 3 calls total
    - Test: all 3 retries fail — returns `{ success: false, error: '...' }`, 3 calls total, no throw
    - Test: exponential backoff timing (mock `setTimeout` or check total elapsed time is ≥7s for 3 retries)
  - Use mock Inngest (`vi.fn()`) — no live Inngest Dev Server needed

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 16
  - **Parallel Group**: Wave 3 (sequential after Task 16)
  - **Blocks**: None
  - **Blocked By**: Tasks 16, 4

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/inngest-send.test.ts` — all tests pass (7 tests)

  **QA Scenarios**:

  ```
  Scenario: Inngest send tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/inngest-send.test.ts`
    Expected Result: All 7 tests pass
    Evidence: .sisyphus/evidence/task-17-inngest-tests.txt
  ```

  **Commit**: YES (with Task 16)
  - Message: `feat(gateway): implement Inngest client and send wrapper with tests`
  - Files: `src/gateway/inngest/client.ts`, `src/gateway/inngest/send.ts`, `tests/gateway/inngest-send.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

- [x] 18. Wire /webhooks/jira Route — Full Pipeline

  **What to do**:
  - Create `src/gateway/routes/jira.ts`:
    - Export function that registers `POST /webhooks/jira` on the Fastify instance
    - Enable `rawBody` on this route: `{ config: { rawBody: true } }`
    - Route handler pipeline (in order):
      1. **Signature verification**: Extract `X-Hub-Signature` header. Call `verifyJiraSignature(request.rawBody, header, JIRA_WEBHOOK_SECRET)`. If `false` → return `401 { error: "Invalid signature" }`.
      2. **Payload validation**: Call `parseJiraWebhook(request.body)`. Catch `ZodError` → return `400 { error: "Invalid payload", details: zodError.issues }`.
      3. **Event routing** (per §8 table):
         - `jira:issue_created` → proceed to task creation
         - `jira:issue_deleted` → proceed to cancellation
         - `jira:issue_updated` → return `200 { received: true, action: "ignored" }` (per §4.2)
         - Unknown → return `200 { received: true, action: "ignored" }`, log the event type
      4. **For `jira:issue_created`**:
         a. **Project filtering**: Call `lookupProjectByJiraKey(payload.issue.fields.project.key, tenantId)`. If `null` → return `200 { received: true, action: "project_not_registered" }`, log.
         b. **Task creation**: Call `createTaskFromJiraWebhook()`. If `created: false` (duplicate) → return `200 { received: true, action: "duplicate" }`.
         c. **Inngest send**: Call `sendTaskReceivedEvent({ inngest, taskId: task.id, projectId: project.id, eventId: determineEventId(payload) })`. If `success: false` → return `202 { received: true, action: "queued_without_inngest" }`, log warning.
         d. **Success**: return `200 { received: true, action: "task_created", taskId: task.id }`
      5. **For `jira:issue_deleted`**:
         a. Call `cancelTaskByExternalId()`. Return `200 { received: true, action: "cancelled" | "not_found" }`.
    - Helper: `determineEventId(payload)` — use a deterministic ID for Inngest deduplication (e.g., `jira-${payload.issue.key}-${Date.now()}` or extract from Jira headers if available)
    - All responses include `received: true` for webhook acknowledgment

  **Must NOT do**:
  - Do not add business logic beyond the pipeline above
  - Do not call Inngest send for duplicates or ignored events
  - Do not block on Inngest send failure — return 202 and let recovery handle it
  - Do not process `jira:issue_updated` (explicitly ignored per §4.2)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: This is the central route wiring all components — requires careful error handling and status code logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on all Wave 2 and Wave 3 services
  - **Parallel Group**: Wave 3 (final task, after 14 and 16 complete)
  - **Blocks**: Tasks 19, 24
  - **Blocked By**: Tasks 6, 8, 10, 12, 14, 16

  **References**:

  **Pattern References**:
  - `src/gateway/routes/health.ts` — Route registration pattern (from Task 6)
  - `src/gateway/validation/signature.ts` — Signature verification (Task 8)
  - `src/gateway/validation/schemas.ts` — Zod schemas (Task 10)
  - `src/gateway/services/project-lookup.ts` — Project matching (Task 12)
  - `src/gateway/services/task-creation.ts` — Task creation + idempotency (Task 14)
  - `src/gateway/inngest/send.ts` — Inngest send with retry (Task 16)

  **API/Type References**:
  - Architecture doc §8 Webhook Event Routing table — exact routing rules per webhookEvent type
  - Architecture doc §8 Error Handling Contract — exact HTTP status codes per failure mode
  - Architecture doc §8 — "Event ID set to webhook delivery ID (deduplication per §8)"
  - Architecture doc §8 — "If inngest.send() fails after 3 retries → return 202"

  **WHY Each Reference Matters**:
  - Each service module is composed here — this route is the integration point
  - §8 routing table is the source of truth for which events trigger which actions
  - §8 error contract is the source of truth for HTTP response codes

  **Acceptance Criteria**:
  - [ ] Valid Jira webhook → 200 with `action: "task_created"` and `taskId`
  - [ ] Invalid signature → 401 with `error: "Invalid signature"`
  - [ ] Invalid payload → 400 with `error: "Invalid payload"`
  - [ ] Unknown project → 200 with `action: "project_not_registered"`
  - [ ] Duplicate webhook → 200 with `action: "duplicate"`
  - [ ] Inngest send failure → 202 with `action: "queued_without_inngest"`
  - [ ] `jira:issue_deleted` → 200 with `action: "cancelled"` or `"not_found"`
  - [ ] `jira:issue_updated` → 200 with `action: "ignored"`

  **QA Scenarios**:

  ```
  Scenario: Full happy path — webhook to task
    Tool: Vitest (app.inject)
    Steps:
      1. Build app with mock Inngest
      2. Compute valid HMAC for jira-issue-created.json body
      3. `app.inject({ method: 'POST', url: '/webhooks/jira', headers: { 'X-Hub-Signature': sig, 'Content-Type': 'application/json' }, payload: fixture })`
      4. Assert statusCode === 200
      5. Assert body.action === 'task_created'
      6. Assert body.taskId is a UUID
      7. Query DB: task exists with status 'Ready', correct external_id, triage_result populated
      8. Query DB: task_status_log has entry with actor 'gateway'
      9. Assert inngestMock.send called once
    Expected Result: Full pipeline executes, task created, Inngest event sent
    Evidence: .sisyphus/evidence/task-18-happy-path.txt

  Scenario: Invalid signature → 401
    Tool: Vitest (app.inject)
    Steps:
      1. Send webhook with header `X-Hub-Signature: sha256=invalid`
      2. Assert statusCode === 401
      3. Query DB: no new tasks created
    Expected Result: 401, no DB writes
    Evidence: .sisyphus/evidence/task-18-invalid-sig.txt

  Scenario: Inngest failure → 202
    Tool: Vitest (app.inject)
    Steps:
      1. Build app with Inngest mock that always rejects
      2. Send valid webhook
      3. Assert statusCode === 202
      4. Assert body.action === 'queued_without_inngest'
      5. Query DB: task IS created (Supabase-first pattern)
    Expected Result: 202, task exists in DB for manual recovery
    Evidence: .sisyphus/evidence/task-18-inngest-fail.txt
  ```

  **Commit**: NO (groups with Task 19)

---

- [x] 19. Tests: /webhooks/jira Integration Tests

  **What to do**:
  - Create `tests/gateway/jira-webhook.test.ts`:
    - Test: happy path — valid webhook → 200, task created, status log, Inngest called
    - Test: invalid signature → 401, no DB writes, no Inngest call
    - Test: invalid payload (missing required fields) → 400, no DB writes
    - Test: unknown project → 200 with `action: "project_not_registered"`, no task, no Inngest call
    - Test: duplicate webhook → 200 with `action: "duplicate"`, no extra task, no extra status log, no extra Inngest call
    - Test: Inngest send failure → 202, task still in DB, status log exists
    - Test: `jira:issue_deleted` → 200 with `action: "cancelled"`, existing task status updated
    - Test: `jira:issue_deleted` for non-existent task → 200 with `action: "not_found"`
    - Test: `jira:issue_updated` → 200 with `action: "ignored"`, no DB changes
    - Test: unknown webhookEvent type → 200 with `action: "ignored"`
    - Test: `triage_result` contains all 6 required fields after creation
    - Test: `raw_event` contains full payload after creation
  - Use `createTestApp()` helper, `computeJiraSignature()`, `inngestMock` from setup
  - Use `app.inject()` for all HTTP calls
  - Each test cleans up via `afterEach` → `cleanupTestData()`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 12 integration tests covering all scenarios — complex DB state assertions
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 18
  - **Parallel Group**: Wave 3 (sequential after Task 18)
  - **Blocks**: Task 24
  - **Blocked By**: Tasks 18, 3, 4

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/jira-webhook.test.ts` — all 12 tests pass
  - [ ] Tests cover every row in §8 Webhook Event Routing table
  - [ ] Tests cover every row in §8 Error Handling Contract table

  **QA Scenarios**:

  ```
  Scenario: Jira webhook integration tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/jira-webhook.test.ts`
    Expected Result: All 12 tests pass
    Evidence: .sisyphus/evidence/task-19-jira-integration.txt
  ```

  **Commit**: YES (with Task 18)
  - Message: `feat(gateway): wire /webhooks/jira route with integration tests`
  - Files: `src/gateway/routes/jira.ts`, `tests/gateway/jira-webhook.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

- [x] 20. Implement /webhooks/github Stub

  **What to do**:
  - Create `src/gateway/routes/github.ts`:
    - Export function that registers `POST /webhooks/github` on the Fastify instance
    - Handler: return `200 { received: true, stub: true, message: "GitHub webhook processing is not active in MVP. Active in M4." }`
    - Log the received event type for observability: `request.log.info({ event: 'github_webhook_received_stub' })`
    - Do NOT verify signatures, do NOT parse payload, do NOT write to DB
  - Register this route in `buildApp()` (in `src/gateway/server.ts`)

  **Must NOT do**:
  - Do not implement signature verification for GitHub (deferred to M4)
  - Do not parse the payload
  - Do not create task records
  - Do not send Inngest events

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 22)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 21
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `src/gateway/routes/health.ts` — Route registration pattern
  - Architecture doc §8 — "GitHub webhook handler (stub for now — active in M4)"

  **Acceptance Criteria**:
  - [ ] `POST /webhooks/github` returns 200 with `stub: true`
  - [ ] No database writes occur
  - [ ] No Inngest events sent
  - [ ] Event logged for observability

  **QA Scenarios**:

  ```
  Scenario: GitHub stub returns 200 with stub flag
    Tool: Vitest (app.inject)
    Steps:
      1. `app.inject({ method: 'POST', url: '/webhooks/github', payload: { action: 'opened' } })`
      2. Assert statusCode === 200
      3. Assert body.stub === true
      4. Assert body.received === true
    Expected Result: 200 with stub response
    Evidence: .sisyphus/evidence/task-20-github-stub.txt
  ```

  **Commit**: NO (groups with Task 21)

---

- [x] 21. Tests: /webhooks/github Stub

  **What to do**:
  - Create `tests/gateway/github-stub.test.ts`:
    - Test: `POST /webhooks/github` with any body → 200 with `{ received: true, stub: true }`
    - Test: no tasks created in DB after request
    - Test: Inngest mock `.send()` not called
    - Test: empty body → still 200 (stub accepts anything)
  - Use `createTestApp()` helper

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 20
  - **Parallel Group**: Wave 4 (sequential after Task 20)
  - **Blocks**: None
  - **Blocked By**: Task 20

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/github-stub.test.ts` — all 4 tests pass

  **QA Scenarios**:

  ```
  Scenario: GitHub stub tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/github-stub.test.ts`
    Expected Result: All 4 tests pass
    Evidence: .sisyphus/evidence/task-21-github-tests.txt
  ```

  **Commit**: YES (with Task 20)
  - Message: `feat(gateway): add /webhooks/github stub with tests`
  - Files: `src/gateway/routes/github.ts`, `tests/gateway/github-stub.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

- [x] 22. Register /api/inngest Serve Endpoint

  **What to do**:
  - Create `src/gateway/inngest/serve.ts`:
    - Export function that registers the Inngest serve handler on the Fastify instance
    - Use Inngest's `serve()` adapter for Fastify/h3/generic handler
    - Register at path `/api/inngest`
    - Pass an empty functions array `[]` — function handlers are added in Phase 3
    - Configuration: `{ client: inngestClient, functions: [] }`
  - Register this in `buildApp()` — call after route registration
  - Verify the Inngest Dev Server can discover the app via this endpoint

  **Must NOT do**:
  - Do not create any Inngest function handlers (`inngest.createFunction()`)
  - Do not implement the engineering lifecycle function
  - Do not implement the re-dispatch handler

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 20)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 6, 16

  **References**:

  **API/Type References**:
  - Architecture doc §8 — "The Event Gateway Fastify application serves dual duty: webhook receiver AND Inngest function host"
  - Architecture doc §8 — "/api/inngest endpoint for Inngest function hosting"

  **External References**:
  - Inngest serve docs: `https://www.inngest.com/docs/reference/serve` — `serve({ client, functions })` adapter

  **Acceptance Criteria**:
  - [ ] `GET /api/inngest` responds (Inngest discovery endpoint)
  - [ ] `PUT /api/inngest` responds (Inngest registration endpoint)
  - [ ] No Inngest functions registered (empty array)
  - [ ] Inngest Dev Server can discover the app when running

  **QA Scenarios**:

  ```
  Scenario: Inngest serve endpoint responds
    Tool: Vitest (app.inject)
    Steps:
      1. Build app with real Inngest client (not mock)
      2. `app.inject({ method: 'GET', url: '/api/inngest' })` — expect 200 or Inngest-specific response
    Expected Result: Endpoint exists and responds
    Evidence: .sisyphus/evidence/task-22-inngest-serve.txt
  ```

  **Commit**: NO (groups with Task 23)

---

- [x] 23. Tests: /api/inngest Endpoint

  **What to do**:
  - Create `tests/gateway/inngest-serve.test.ts`:
    - Test: `GET /api/inngest` returns a response (Inngest introspection endpoint)
    - Test: `PUT /api/inngest` returns a response (Inngest registration endpoint)
    - Test: response indicates 0 functions registered
  - Note: Inngest serve handler tests are lightweight since the SDK handles most logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 22
  - **Parallel Group**: Wave 4 (sequential after Task 22)
  - **Blocks**: None
  - **Blocked By**: Task 22

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/inngest-serve.test.ts` — all tests pass

  **QA Scenarios**:

  ```
  Scenario: Inngest serve tests pass
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run tests/gateway/inngest-serve.test.ts`
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-23-inngest-serve-tests.txt
  ```

  **Commit**: YES (with Task 22)
  - Message: `feat(gateway): register /api/inngest serve endpoint with tests`
  - Files: `src/gateway/inngest/serve.ts`, `tests/gateway/inngest-serve.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

---

- [x] 24. Manual QA: Curl-Based Verification of All Endpoints

  **What to do**:
  - Start the Event Gateway: `JIRA_WEBHOOK_SECRET=test-secret INNGEST_DEV=1 pnpm dev`
  - Execute all verification scenarios from the architecture doc §8 using `curl`:
    1. `curl -s http://localhost:3000/health` → verify `{"status":"ok"}`
    2. Compute valid HMAC for `test-payloads/jira-issue-created.json` body with secret `test-secret`
    3. `curl -s -X POST http://localhost:3000/webhooks/jira -H "Content-Type: application/json" -H "X-Hub-Signature: sha256=<computed>" -d @test-payloads/jira-issue-created.json` → verify 200, task_created
    4. Verify in DB: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, external_id, status, source_system FROM tasks;"` → 1 row, status=Ready
    5. Verify status log: `psql ... -c "SELECT from_status, to_status, actor FROM task_status_log;"` → NULL→Ready, gateway
    6. Verify triage_result: `psql ... -c "SELECT triage_result->>'ticket_id', triage_result->>'title' FROM tasks;"` → TEST-1, correct title
    7. Send same webhook again → verify 200, action=duplicate, task count unchanged
    8. Send with invalid signature → verify 401
    9. Send invalid payload → verify 400
    10. Send unknown project → verify 200, action=project_not_registered
    11. `curl -s -X POST http://localhost:3000/webhooks/github -d '{}'` → verify 200, stub=true
  - Capture ALL outputs to evidence files
  - Clean up test data after verification

  **Must NOT do**:
  - Do not modify any source code during manual QA
  - Do not skip any scenario

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires running server, computing HMAC, executing multiple curl commands, querying DB
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — needs all routes implemented
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 25
  - **Blocked By**: Tasks 19, 21, 23

  **References**:

  **Pattern References**:
  - Architecture doc §8 Error Handling Contract — expected HTTP status codes
  - `docs/2026-03-25-1901-mvp-implementation-phases.md` Phase 2 Verification Criteria — exact curl commands and expected outputs

  **Acceptance Criteria**:
  - [ ] All 11 curl scenarios executed with correct responses
  - [ ] Evidence files captured for every scenario
  - [ ] DB state is correct after each scenario
  - [ ] No unexpected errors in server logs

  **QA Scenarios**:

  ```
  Scenario: Full manual verification pass
    Tool: Bash (curl + psql)
    Preconditions: Gateway running on port 3000, local Supabase running
    Steps:
      1. Execute all 11 curl scenarios above
      2. Capture each output to .sisyphus/evidence/task-24-scenario-{N}.txt
      3. Verify each response matches expected status code and body
    Expected Result: All 11 scenarios pass
    Failure Indicators: Any unexpected status code, missing DB records, or error responses
    Evidence: .sisyphus/evidence/task-24-manual-qa-summary.txt
  ```

  **Commit**: YES (solo)
  - Message: `test(gateway): manual QA verification evidence`
  - Files: `.sisyphus/evidence/task-24-*`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 25. Documentation: Write Phase 2 Architecture Doc

  **What to do**:
  - Get current timestamp: `date "+%Y-%m-%d-%H%M"`
  - Create `docs/{timestamp}-phase2-event-gateway.md` following the exact structure and style of `docs/2026-03-26-1511-phase1-foundation.md`
  - Document:
    - **What This Document Is**: Phase 2 covers the Event Gateway — first HTTP-serving component
    - **What Was Built**: Mermaid diagram showing Gateway components and data flow
    - **Project Structure**: Updated tree showing new files in `src/gateway/`, `tests/gateway/`, `test-payloads/`
    - **Toolchain Updates**: New deps (Fastify, Zod, Inngest, fastify-raw-body)
    - **Gateway Architecture**:
      - Request pipeline: signature → Zod → project lookup → task creation → Inngest send
      - Webhook Event Routing table (from §8)
      - Error Handling Contract table (from §8)
    - **Signature Verification**: How HMAC works, timing-safe comparison
    - **Payload Validation**: Zod schemas, required vs optional fields
    - **Project Filtering**: `jira_project_key` column, lookup logic
    - **Task Creation**: Transaction pattern, idempotency via P2002, status logging
    - **Inngest Integration**: Client setup, send with retry, `/api/inngest` serve
    - **Test Suite**: Summary of all new tests (count, coverage areas)
    - **Key Design Decisions**:
      - Why `buildApp()` factory pattern
      - Why manual Zod (not type provider)
      - Why `jira_project_key` column (not matching on `name`)
      - Why 202 on Inngest failure (not 500)
      - Why transaction for task + status log
    - **What Phase 3 Builds On Top**: Inngest lifecycle function, function handlers
  - Include at least 2 Mermaid diagrams (request pipeline + component structure)
  - Follow the markdown naming convention from AGENTS.md

  **Must NOT do**:
  - Do not copy the architecture doc verbatim — summarize and reference
  - Do not include implementation code in the doc (reference file paths instead)
  - Do not add emojis

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation requiring clear prose and diagrams
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — needs all implementation complete
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 26
  - **Blocked By**: Task 24

  **References**:

  **Pattern References**:
  - `docs/2026-03-26-1511-phase1-foundation.md` — EXACT template to follow: structure, Mermaid style, table format, level of detail
  - Architecture doc §8 — Source material for Gateway architecture section

  **WHY Each Reference Matters**:
  - Phase 1 doc: the user explicitly asked for a "similar" document — match structure exactly
  - §8: authoritative source for all Gateway design decisions

  **Acceptance Criteria**:
  - [ ] Doc follows same structure as Phase 1 doc
  - [ ] Contains at least 2 Mermaid diagrams
  - [ ] Documents all Key Design Decisions
  - [ ] References correct file paths for all components
  - [ ] Describes what Phase 3 builds on top

  **QA Scenarios**:

  ```
  Scenario: Doc structure matches Phase 1 pattern
    Tool: Bash (grep)
    Steps:
      1. Check doc has "## What This Document Is" section
      2. Check doc has "## What Was Built" section with Mermaid
      3. Check doc has "## Project Structure" section
      4. Check doc has "## Key Design Decisions" section
      5. Check doc has "## What Phase 3 Builds On Top" section
    Expected Result: All 5 sections present
    Evidence: .sisyphus/evidence/task-25-doc-structure.txt
  ```

  **Commit**: YES (solo)
  - Message: `docs: write Phase 2 Event Gateway architecture documentation`
  - Files: `docs/{timestamp}-phase2-event-gateway.md`
  - Pre-commit: `pnpm build`

---

- [ ] 26. Update progress.json Phase 2 Checkpoints

  **What to do**:
  - Read current `.sisyphus/progress.json`
  - Update Phase 2 entry:
    - Set `status`: `"complete"`
    - Set `plan_file`: `".sisyphus/plans/2026-03-26-2046-phase2-event-gateway.md"`
    - Set `doc_file`: `"docs/{timestamp}-phase2-event-gateway.md"` (use actual filename from Task 25)
    - Set `started_at`: ISO timestamp of when Phase 2 work began
    - Set `completed_at`: ISO timestamp of completion
    - Update `last_updated` at the top level
    - Update `last_session_id` with current session ID
    - Add `doc_file` reference to `source_docs` section: `"phase2_detail": "docs/{timestamp}-phase2-event-gateway.md"`
  - Update ALL checkpoint statuses to `"complete"` with `verified_at` timestamps:
    - `fastify_server`, `signature_verification`, `payload_validation`, `webhook_routing`, `project_filtering`, `task_creation`, `status_logging`, `test_fixtures`, `tests_written`, `tests_passing`, `committed`, `documented`
  - Update Phase 2 `resume_hint`: `"Phase 2 is complete. Proceed to Phase 3."`

  **Must NOT do**:
  - Do not modify Phase 1 entries
  - Do not modify Phase 3+ entries (they remain `not_started`)
  - Do not change the JSON structure — only update values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — needs docs complete
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 27
  - **Blocked By**: Task 25

  **References**:

  **Pattern References**:
  - `.sisyphus/progress.json:12-80` — Phase 1 entry structure: exact format for `status`, `checkpoints`, `verified_at`, `resume_hint`

  **Acceptance Criteria**:
  - [ ] Phase 2 `status` is `"complete"`
  - [ ] All 12 checkpoints are `"complete"` with `verified_at`
  - [ ] `plan_file` and `doc_file` reference correct paths
  - [ ] `source_docs.phase2_detail` added
  - [ ] `last_updated` is current timestamp
  - [ ] JSON is valid (`node -e "JSON.parse(require('fs').readFileSync('.sisyphus/progress.json'))"`)

  **QA Scenarios**:

  ```
  Scenario: progress.json is valid and complete
    Tool: Bash
    Steps:
      1. Run `node -e "const p = JSON.parse(require('fs').readFileSync('.sisyphus/progress.json')); const ph2 = p.phases.find(p => p.id === 2); console.log(ph2.status, Object.values(ph2.checkpoints).every(c => c.status === 'complete'));"` — expect "complete true"
    Expected Result: Phase 2 complete with all checkpoints
    Evidence: .sisyphus/evidence/task-26-progress.txt
  ```

  **Commit**: YES (solo)
  - Message: `chore: update progress.json Phase 2 checkpoints`
  - Files: `.sisyphus/progress.json`
  - Pre-commit: `pnpm build`

---

- [ ] 27. Final Commit: All Phase 2 Work

  **What to do**:
  - Run `pnpm build && pnpm lint && pnpm test -- --run` — verify all pass
  - Run `git status` — verify no uncommitted changes
  - If any uncommitted changes remain from previous tasks, commit them now
  - Verify git log shows all Phase 2 commits in order
  - Run the full verification suite one final time:
    - `pnpm build` → passes
    - `pnpm lint` → passes
    - `pnpm test -- --run` → all tests pass (Phase 1 + Phase 2)
  - Capture final test output as evidence

  **Must NOT do**:
  - Do not push to remote (wait for user decision)
  - Do not amend previous commits

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — final step
  - **Parallel Group**: Wave 5 (last)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 26

  **References**:

  **Pattern References**:
  - `.sisyphus/progress.json` Phase 1 entry — committed checkpoint pattern

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] `pnpm lint` passes
  - [ ] `pnpm test -- --run` passes all tests
  - [ ] `git status` shows clean working tree
  - [ ] All Phase 2 commits present in git log

  **QA Scenarios**:

  ```
  Scenario: Clean build and test pass
    Tool: Bash
    Steps:
      1. Run `pnpm build && pnpm lint && pnpm test -- --run`
      2. Run `git status`
    Expected Result: All pass, working tree clean
    Evidence: .sisyphus/evidence/task-27-final-verification.txt
  ```

  **Commit**: YES (only if uncommitted changes exist)
  - Message: `chore(gateway): Phase 2 final verification pass`
  - Pre-commit: `pnpm build && pnpm lint && pnpm test -- --run`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/2026-03-26-2046-phase2-event-gateway.md` end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && pnpm lint && pnpm test -- --run`. Review all changed files in `src/gateway/` and `tests/gateway/` for: `as any`/`@ts-ignore`, empty catches, console.log in prod code, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction beyond ~200 lines core, generic variable names. Verify all Zod schemas are strict (no `.passthrough()`).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start the Event Gateway (`pnpm dev`). Execute EVERY curl scenario from Task 24's evidence. Verify DB state after each curl. Test cross-task integration: send valid webhook → verify task + status log + raw_event + triage_result. Test edge cases: empty body, huge payload, concurrent duplicates. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual code written. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no Inngest function handlers, no full GitHub processing, no Slack interactions, no dispatch-task CLI. Detect files outside `src/gateway/`, `tests/gateway/`, `test-payloads/` that were modified (except `package.json`, `progress.json`, `docs/`). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Guardrails [N/N clean] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Commits follow atomic, self-contained units. Each commit must pass `pnpm build && pnpm test -- --run`.

| After Task(s) | Commit Message                                                                  | Files                                                                                                |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1             | `chore(deps): add fastify, zod, inngest, fastify-raw-body runtime deps`         | `package.json`, `pnpm-lock.yaml`                                                                     |
| 2             | `feat(schema): add jira_project_key column to projects table`                   | `prisma/schema.prisma`, `prisma/migrations/*`, `prisma/seed.ts`                                      |
| 3, 4, 5       | `test(gateway): add webhook fixtures, test helpers, and migration verification` | `test-payloads/*`, `tests/setup.ts`, `tests/gateway/migration.test.ts`                               |
| 6, 7          | `feat(gateway): implement Fastify app factory and /health endpoint`             | `src/gateway/server.ts`, `src/gateway/routes/health.ts`, `tests/gateway/health.test.ts`              |
| 8, 9          | `feat(gateway): implement HMAC signature verification with tests`               | `src/gateway/validation/signature.ts`, `tests/gateway/signature.test.ts`                             |
| 10, 11        | `feat(gateway): implement Zod payload schemas with tests`                       | `src/gateway/validation/schemas.ts`, `tests/gateway/schemas.test.ts`                                 |
| 12, 13        | `feat(gateway): implement project lookup service with tests`                    | `src/gateway/services/project-lookup.ts`, `tests/gateway/project-lookup.test.ts`                     |
| 14, 15        | `feat(gateway): implement task creation service with tests`                     | `src/gateway/services/task-creation.ts`, `tests/gateway/task-creation.test.ts`                       |
| 16, 17        | `feat(gateway): implement Inngest client and send wrapper with tests`           | `src/gateway/inngest/client.ts`, `src/gateway/inngest/send.ts`, `tests/gateway/inngest-send.test.ts` |
| 18, 19        | `feat(gateway): wire /webhooks/jira route with integration tests`               | `src/gateway/routes/jira.ts`, `tests/gateway/jira-webhook.test.ts`                                   |
| 20, 21        | `feat(gateway): add /webhooks/github stub with tests`                           | `src/gateway/routes/github.ts`, `tests/gateway/github-stub.test.ts`                                  |
| 22, 23        | `feat(gateway): register /api/inngest serve endpoint with tests`                | `src/gateway/inngest/serve.ts`, `tests/gateway/inngest-serve.test.ts`                                |
| 24            | `test(gateway): manual QA verification evidence`                                | `.sisyphus/evidence/*`                                                                               |
| 25            | `docs: write Phase 2 Event Gateway architecture documentation`                  | `docs/YYYY-MM-DD-HHMM-phase2-event-gateway.md`                                                       |
| 26            | `chore: update progress.json Phase 2 checkpoints`                               | `.sisyphus/progress.json`                                                                            |

---

## Success Criteria

### Verification Commands

```bash
pnpm build            # Expected: no TypeScript errors
pnpm lint             # Expected: no lint errors
pnpm test -- --run    # Expected: all tests pass (Phase 1 + Phase 2)
pnpm dev              # Expected: "Server listening on port 3000"
curl -s localhost:3000/health  # Expected: {"status":"ok"}
```

### Final Checklist

- [ ] All "Must Have" present and verified
- [ ] All "Must NOT Have" absent (searched codebase)
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] TypeScript compiles (`pnpm build`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Manual QA evidence captured in `.sisyphus/evidence/`
- [ ] Phase 2 architecture doc written
- [ ] `progress.json` Phase 2 checkpoints all marked complete
- [ ] All code committed to git
