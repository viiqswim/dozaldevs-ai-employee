# Manual Employee Trigger API — Summarizer Only (Multi-Tenant URL)

## TL;DR

> **Quick Summary**: Build a tenant-scoped admin HTTP endpoint that manually dispatches the `daily-summarizer` AI employee for testing/debugging. Reuses the existing generic-harness pipeline so downstream behavior is identical to the cron-triggered path. Engineering support deferred to a future plan.
>
> **Deliverables**:
>
> - `POST /admin/tenants/:tenantId/employees/:slug/trigger` — fires a task, returns 202 + `{ task_id, status_url }`
> - `POST /admin/tenants/:tenantId/employees/:slug/trigger?dry_run=true` — validates without firing
> - `GET /admin/tenants/:tenantId/tasks/:id` — check task status
> - Prisma migration adding `@@unique([tenant_id, role_name])` on `archetypes`
> - New `source_system` value `'manual'` documented
> - Full Vitest coverage (unit + integration) + curl QA scenarios
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (migration) → T2 (schemas) → T3 (dispatcher) → T4 (trigger route) → T8 (wiring)

---

## Context

### Original Request

> Add a way to trigger all employees manually via an API endpoint. This includes AI employees that may be triggered via a webhook, a cron, etc. This is useful for testing and debugging purposes, as well as for triggering employees that may not have a specific trigger set up yet.

### Scope Revision (user decision)

User narrowed scope to **summarizer-only** mid-planning. Engineering trigger support is deferred. The design still reserves the multi-runtime routing path, so adding engineering later is a small diff (one new runtime branch in the dispatcher).

### Interview Summary

**Key Decisions**:

- **Generic endpoint shape**: One route handles all employee archetypes via `:slug` path param (today: only `daily-summarizer`)
- **Async response**: 202 + `{ task_id, status_url }` — matches Inngest's event-driven model; no HTTP timeout risk
- **Dry-run flag**: `?dry_run=true` query param — validates archetype/tenant without firing event or creating task row
- **Audit flag**: Extend `source_system` to include `'manual'` — no migration, just code/docs update
- **Multi-tenant URL**: Tenant in URL path (`/admin/tenants/:tenantId/...`) — explicit, RESTful, aligns with vision doc's mandatory multi-tenancy
- **Uniqueness**: Add `@@unique([tenant_id, role_name])` to archetypes table — prevents ambiguous slug lookups, enforces one archetype per role per tenant
- **Status endpoint**: `GET /admin/tenants/:tenantId/tasks/:id` — tenant-scoped; returns 404 if task doesn't belong to tenant
- **Test strategy**: TDD with Vitest (existing framework, 849+ passing tests baseline)
- **Admin auth**: Keep single global `ADMIN_API_KEY` — per-tenant keys deferred

**Research Findings** (from 3 parallel `explore` agents + Metis gap review):

- Stack is **Express**, not Fastify (vision doc is wrong)
- `createTaskAndDispatch()` (`src/inngest/lib/create-task-and-dispatch.ts`) wraps logic in `step.run()` — **cannot be called from HTTP handlers**. Dispatcher must inline Prisma/fetch logic and call `inngest.send()` directly.
- `employee/task-lifecycle` handler (`src/inngest/employee-lifecycle.ts`) consumes `{taskId, archetypeId}` from `employee/task.dispatched` events — identical payload for cron and manual triggers
- Only `daily-summarizer` archetype is seeded (`prisma/seed.ts`). Engineering has NO archetype row (special-cased through `engineering/task.received` event instead)
- `requireAdminKey` middleware in `src/gateway/middleware/admin-auth.ts` uses `crypto.timingSafeEqual`, header `X-Admin-Key`
- `SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'` hardcoded in 3+ files (canonical constant)
- **No `Tenant` model exists** — `tenant_id` is a bare UUID column with no FK. Tenant validation is format-only + "archetype exists for this tenant" as the implicit existence check.
- Existing task `@@unique([external_id, source_system, tenant_id])` — `manual-{uuid}` plus `source_system: 'manual'` gives natural idempotency

### Metis Review

**Gaps Addressed**:

- `createTaskAndDispatch()` unusable from HTTP → dispatcher inlines the Prisma transaction
- Manual triggers must NOT bypass Slack approval gate → event payload identical to cron, so lifecycle runs the full harness flow (including approval)
- No `Tenant` FK table → tenant validation uses UUID format check + archetype lookup (archetype not found = likely bad tenant OR bad slug; error message must disambiguate)
- Status endpoint needs tenant-scoped query → `findFirst({ where: { id, tenant_id } })`, returns 404 if mismatch
- `@@unique([tenant_id, role_name])` migration must include data check → seed currently has only 1 archetype per `role_name` per `tenant_id`, migration is safe today

---

## Work Objectives

### Core Objective

Provide a tenant-scoped admin HTTP endpoint that creates a `tasks` row and fires `employee/task.dispatched` for any seeded archetype (today: summarizer only), so engineers can manually fire employees for testing without waiting for cron or webhooks, and distinguish these runs from automated ones via `source_system = 'manual'`.

### Concrete Deliverables

- **Route**: `POST /admin/tenants/:tenantId/employees/:slug/trigger`
- **Route**: `GET /admin/tenants/:tenantId/tasks/:id`
- **Service**: `src/gateway/services/employee-dispatcher.ts` — runtime-aware dispatcher (today handles `generic-harness` only)
- **Schemas**: `TriggerEmployeeParamsSchema`, `TriggerEmployeeQuerySchema`, `GetTaskParamsSchema` in `src/gateway/validation/schemas.ts`
- **Prisma migration**: `@@unique([tenant_id, role_name])` on `archetypes`
- **Tests**: Unit tests for dispatcher, route handlers, schemas; integration test against real Prisma + in-memory Inngest
- **Docs**: Update `AGENTS.md` and `.env.example` with the new routes and `source_system: 'manual'` value

### Definition of Done

- [ ] `pnpm test -- --run` passes (849 existing + new tests, 0 regressions)
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] `pnpm prisma migrate dev` applies cleanly on a fresh database
- [ ] Manual QA: `curl` to trigger endpoint creates a task row with `source_system: 'manual'`, lifecycle runs to `AwaitingApproval` (the normal summarizer endpoint)
- [ ] Manual QA: `?dry_run=true` returns `{ valid: true, would_fire: {...} }` and creates NO task row
- [ ] Manual QA: Status endpoint returns 200 for tenant-owned task, 404 for cross-tenant access

### Must Have

- Tenant-scoped URL: `tenantId` in path, used in all DB lookups
- Async 202 response with `{ task_id, status_url }`
- Dry-run mode via `?dry_run=true` — validates archetype + tenant, returns `would_fire` preview, creates NO task, fires NO event
- Archetype lookup via unique `(tenant_id, role_name)`
- `source_system: 'manual'` on created tasks
- Manual triggers flow through the same Inngest event (`employee/task.dispatched`) as cron — zero divergence in lifecycle handling
- Slack approval gate preserved end-to-end (no bypass)
- Admin-key auth on both routes (`requireAdminKey` middleware)
- Status endpoint tenant-scoped (returns 404 for cross-tenant access, not the task data)
- TDD: tests written before implementation for each task
- Idempotency key: `external_id = manual-{crypto.randomUUID()}` (unique on each call)

### Must NOT Have (Guardrails)

- **No Fastify code** — stack is Express; use `Router()`
- **No `step.run()` outside Inngest handlers** — dispatcher inlines Prisma logic directly
- **No engineering trigger support** — deferred; dispatcher returns `UNSUPPORTED_RUNTIME` for any non-generic-harness archetype
- **No `project_id` in request body** — engineering-specific fields stay out of scope
- **No cron/webhook bypass** — manual trigger uses the same lifecycle as cron; do NOT shortcut the approval gate
- **No per-tenant admin keys** — single `ADMIN_API_KEY` guards all tenants today
- **No `as any` / `@ts-ignore` / `@ts-expect-error`** — strict typing throughout
- **No `console.log`** — use `pino` logger (same as `admin-projects.ts`)
- **No route-in-handler creation of `PrismaClient`** — accept via options for testability (match `AdminProjectRouteOptions` pattern)
- **No hardcoded `SYSTEM_TENANT_ID` in routes** — tenantId comes from URL params; use constant only as seed default
- **No direct PostgREST fetches from HTTP handlers** — use Prisma (match admin-projects pattern, not create-task-and-dispatch pattern)
- **No emojis in code, docs, or commit messages**
- **No AI / claude / opencode references in commit messages**
- **No `--no-verify` when committing**

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No "user manually tests" criteria permitted.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 849 passing tests)
- **Automated tests**: YES (TDD — RED → GREEN → REFACTOR per task)
- **Framework**: `vitest` (already in `package.json`)
- **Run command**: `pnpm test -- --run`
- **Integration test pattern**: spin up Prisma against local Postgres (`DATABASE_URL` from `.env`), mock `inngestClient.send` via a spy

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/HTTP routes**: `Bash (curl)` — send request, parse JSON response, assert status + body fields
- **Service modules**: `Bash (node -e / tsx)` — import, invoke, assert return values
- **DB state**: `Bash (psql)` — query tasks/archetypes after trigger, assert rows match expectations
- **Inngest dispatch**: Inspect spy calls in integration tests; in manual QA, tail Inngest dev server logs

---

## Execution Strategy

### Parallel Execution Waves

> Target: 5-8 tasks per wave. Foundation tasks in Wave 1, core modules in Wave 2, integration in Wave 3.

```
Wave 1 (Start Immediately — foundation, max parallel):
├── T1: Prisma migration: @@unique([tenant_id, role_name]) on archetypes [quick]
├── T2: Zod schemas for trigger params/query + task-status params [quick]
├── T3: Documentation — source_system: 'manual' in AGENTS.md + env docs [writing]

Wave 2 (After Wave 1 — core modules, parallel):
├── T4: Employee dispatcher service (generic-harness only) [deep] (depends: T1, T2)
├── T5: POST /admin/tenants/:tenantId/employees/:slug/trigger route [unspecified-high] (depends: T2, T4)
├── T6: GET /admin/tenants/:tenantId/tasks/:id status route [quick] (depends: T2)

Wave 3 (After Wave 2 — integration + wiring):
├── T7: Integration test — end-to-end dispatch (Prisma + Inngest spy) [deep] (depends: T4, T5)
├── T8: Wire routes in server.ts + update AGENTS.md usage examples [quick] (depends: T5, T6)

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 -> T4 -> T5 -> T7 -> F1-F4 -> user okay
Parallel Speedup: ~50% faster than sequential (8 tasks, 3 waves)
Max Concurrent: 3 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Blocked By | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| T1   | —          | T4, T7     | 1    |
| T2   | —          | T4, T5, T6 | 1    |
| T3   | —          | T8         | 1    |
| T4   | T1, T2     | T5, T7     | 2    |
| T5   | T2, T4     | T7, T8     | 2    |
| T6   | T2         | T8         | 2    |
| T7   | T4, T5     | F3         | 3    |
| T8   | T5, T6, T3 | F1, F3     | 3    |

### Agent Dispatch Summary

| Wave  | Count | Assignments                                                                  |
| ----- | ----- | ---------------------------------------------------------------------------- |
| 1     | 3     | T1 → `quick`, T2 → `quick`, T3 → `writing`                                   |
| 2     | 3     | T4 → `deep`, T5 → `unspecified-high`, T6 → `quick`                           |
| 3     | 2     | T7 → `deep`, T8 → `quick`                                                    |
| FINAL | 4     | F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep` |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Prisma migration — add `@@unique([tenant_id, role_name])` on `archetypes`

  **What to do**:
  - Edit `prisma/schema.prisma`: add `@@unique([tenant_id, role_name])` to the `Archetype` model (alongside the existing `@@map("archetypes")` line)
  - Run `pnpm prisma migrate dev --name add_archetype_unique_tenant_role_name`
  - Verify the generated SQL in `prisma/migrations/<timestamp>_add_archetype_unique_tenant_role_name/migration.sql` creates the correct unique index (expected: `CREATE UNIQUE INDEX "archetypes_tenant_id_role_name_key" ON "archetypes"("tenant_id", "role_name");`)
  - Verify `@prisma/client` generated types include `tenant_id_role_name` as a compound unique selector for `findUnique`
  - Write a DB-level test: `tests/prisma/archetype-uniqueness.test.ts` — attempt to create two archetypes with same `(tenant_id, role_name)`, assert the 2nd throws `P2002`

  **Must NOT do**:
  - No data migration logic (we've confirmed only 1 archetype exists today: `daily-summarizer` in system tenant)
  - No changes to other models in `schema.prisma`
  - No `@@index` in addition to `@@unique` (unique constraint auto-creates an index)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, well-scoped schema change with one migration and one test file. No architectural decisions.
  - **Skills**: `[]`
    - No specialized skills needed; standard Prisma workflow.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T4 (dispatcher needs `findUnique` by `tenant_id_role_name`), T7 (integration test relies on migration)
  - **Blocked By**: None — can start immediately

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:190-216` — Archetype model where the new constraint goes. Note other models already use `@@unique` patterns: `prisma/schema.prisma:51` (tasks), `prisma/schema.prisma:134` (projects).

  **Test References**:
  - `tests/prisma/` directory — existing Prisma-level tests for pattern consistency. Expected pattern: import `PrismaClient` from `@prisma/client`, use `beforeEach` to wipe and reseed, assert `P2002` via `expect(...).rejects.toThrow()` catching `PrismaClientKnownRequestError` with `code: 'P2002'`

  **External References**:
  - Prisma docs on compound unique constraints: https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes#unique
  - Prisma error codes: https://www.prisma.io/docs/orm/reference/error-reference#p2002

  **WHY Each Reference Matters**:
  - `schema.prisma:190-216`: Exact location where `@@unique` goes. Must be inside the model block, not outside.
  - `schema.prisma:51`: Shows the existing `@@unique([external_id, source_system, tenant_id])` pattern so you can mimic formatting.

  **Acceptance Criteria**:

  **TDD (RED → GREEN → REFACTOR)**:
  - [ ] RED: `tests/prisma/archetype-uniqueness.test.ts` exists and fails with a clear error (constraint not yet applied)
  - [ ] GREEN: After adding `@@unique` and running migration, test passes
  - [ ] REFACTOR: Remove any test helpers that duplicate existing `tests/prisma/` utilities

  **Verification**:
  - [ ] `pnpm prisma migrate dev --name add_archetype_unique_tenant_role_name` completes without error
  - [ ] Generated migration SQL contains `CREATE UNIQUE INDEX "archetypes_tenant_id_role_name_key"`
  - [ ] `pnpm prisma generate` produces a `TenantIdRoleNameCompoundUniqueInput` (or similarly-named) type in `@prisma/client`
  - [ ] `pnpm test -- --run tests/prisma/archetype-uniqueness.test.ts` passes
  - [ ] `pnpm test -- --run` total test count is 850+ (baseline 849 + new test)

  **QA Scenarios**:

  ```
  Scenario: Duplicate archetype insertion fails with P2002
    Tool: Bash (tsx -e script)
    Preconditions: Migration applied, seed run (daily-summarizer exists)
    Steps:
      1. Run tsx -e "(async () => { const { PrismaClient } = await import('@prisma/client'); const p = new PrismaClient(); try { await p.archetype.create({ data: { role_name: 'daily-summarizer', tenant_id: '00000000-0000-0000-0000-000000000001', runtime: 'generic-harness' } }); console.log('FAIL-NO-ERROR'); } catch (e) { console.log('CODE:' + e.code); } })()"
      2. Capture stdout
      3. Assert output contains "CODE:P2002"
    Expected Result: Output contains "CODE:P2002"
    Failure Indicators: Output is "FAIL-NO-ERROR" (constraint missing) OR any other error code
    Evidence: .sisyphus/evidence/task-1-duplicate-insert.txt

  Scenario: Different tenant, same role_name succeeds
    Tool: Bash (tsx -e script)
    Preconditions: Migration applied
    Steps:
      1. Run tsx -e script that creates an archetype with role_name='daily-summarizer', tenant_id='22222222-2222-2222-2222-222222222222'
      2. Assert no error thrown
      3. Query and confirm 2 rows exist with role_name='daily-summarizer' across different tenants
      4. Clean up: delete the second archetype
    Expected Result: Second archetype created successfully; no uniqueness violation across different tenants
    Evidence: .sisyphus/evidence/task-1-different-tenant.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-duplicate-insert.txt`
  - [ ] `.sisyphus/evidence/task-1-different-tenant.txt`
  - [ ] `.sisyphus/evidence/task-1-migration-sql.txt` (copy of generated migration SQL)

  **Commit**: YES (standalone)
  - Message: `feat(db): add unique constraint on archetype (tenant_id, role_name)`
  - Files: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_add_archetype_unique_tenant_role_name/migration.sql`, `tests/prisma/archetype-uniqueness.test.ts`
  - Pre-commit: `pnpm test -- --run tests/prisma/archetype-uniqueness.test.ts && pnpm lint`

- [x] 2. Zod schemas for trigger + task-status endpoints

  **What to do**:
  - Add three schemas to `src/gateway/validation/schemas.ts`:
    - `TriggerEmployeeParamsSchema` — `{ tenantId: z.string().uuid(), slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/) }`
    - `TriggerEmployeeQuerySchema` — `{ dry_run: z.enum(['true', 'false']).optional().transform(v => v === 'true') }`
    - `GetTaskParamsSchema` — `{ tenantId: z.string().uuid(), id: z.string().uuid() }`
  - Body schema is NOT needed for the trigger endpoint (body is `{}` today; user deferred per-archetype payloads to out-of-scope)
  - Export TypeScript types: `TriggerEmployeeParams`, `TriggerEmployeeQuery`, `GetTaskParams` (via `z.infer`)
  - Unit tests: `tests/gateway/validation/manual-trigger-schemas.test.ts` — test valid inputs accepted, invalid UUIDs rejected, slugs with uppercase/spaces rejected, `dry_run` coerced to boolean

  **Must NOT do**:
  - No `project_id` in any schema (engineering-specific, out of scope)
  - No body schema for trigger endpoint (unnecessary; body is `{}`)
  - No `z.any()` anywhere — all fields strictly typed
  - No custom regex without comment explaining intent

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure validation layer — type-safe, self-contained, no I/O.
  - **Skills**: `[]`
    - No specialized skills; standard Zod patterns.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T4 (dispatcher signature uses these types), T5 (route parses with these schemas), T6 (status route uses `GetTaskParamsSchema`)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/validation/schemas.ts` — existing Zod schemas (`CreateProjectSchema`, `UpdateProjectSchema`). Match naming convention (`*Schema`) and export style.

  **API/Type References**:
  - `src/gateway/routes/admin-projects.ts:12` — how schemas are imported and used: `import { CreateProjectSchema, UpdateProjectSchema } from '../validation/schemas.js'`
  - `src/gateway/routes/admin-projects.ts:29-33` — canonical `.safeParse` + 400 response pattern

  **Test References**:
  - `tests/gateway/validation/` — existing schema test patterns (if any); otherwise follow Vitest convention: `describe('TriggerEmployeeParamsSchema', () => { it('accepts valid UUIDs', ...) })`

  **WHY Each Reference Matters**:
  - `schemas.ts` existing schemas: shows whether to use `z.object(...)` directly or via helper builders.
  - `admin-projects.ts:29`: the `safeParse` pattern we'll mirror in T5/T6 — keeps error shapes consistent across admin endpoints.

  **Acceptance Criteria**:

  **TDD (RED → GREEN → REFACTOR)**:
  - [ ] RED: Schema test file exists with failing tests (schemas not yet defined)
  - [ ] GREEN: Add schemas to `schemas.ts`, all tests pass
  - [ ] REFACTOR: Extract common UUID regex or string validators if duplicated across schemas

  **Verification**:
  - [ ] `pnpm test -- --run tests/gateway/validation/manual-trigger-schemas.test.ts` passes (at least 6 test cases: valid UUID, invalid UUID, valid slug, invalid slug uppercase, invalid slug with spaces, dry_run='true' coerces to true)
  - [ ] `pnpm build` succeeds — types exported cleanly
  - [ ] `pnpm lint` succeeds — no unused imports

  **QA Scenarios**:

  ```
  Scenario: Schemas reject malformed input via tsx
    Tool: Bash (tsx -e script)
    Preconditions: Schemas implemented
    Steps:
      1. Run tsx -e "(async () => { const { TriggerEmployeeParamsSchema } = await import('./src/gateway/validation/schemas.js'); console.log(JSON.stringify(TriggerEmployeeParamsSchema.safeParse({ tenantId: 'not-uuid', slug: 'daily-summarizer' }))); })()"
      2. Assert output contains "success":false and references "tenantId"
    Expected Result: Zod reports failure on tenantId field
    Evidence: .sisyphus/evidence/task-2-invalid-uuid.txt

  Scenario: dry_run query param correctly coerced
    Tool: Bash (tsx -e script)
    Steps:
      1. Parse { dry_run: 'true' } → expect { dry_run: true }
      2. Parse { dry_run: 'false' } → expect { dry_run: false }
      3. Parse {} → expect { dry_run: undefined }
    Expected Result: All three assertions pass
    Evidence: .sisyphus/evidence/task-2-dry-run-coercion.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-invalid-uuid.txt`
  - [ ] `.sisyphus/evidence/task-2-dry-run-coercion.txt`

  **Commit**: YES (standalone)
  - Message: `feat(gateway): add zod schemas for employee trigger + task status`
  - Files: `src/gateway/validation/schemas.ts`, `tests/gateway/validation/manual-trigger-schemas.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/validation/manual-trigger-schemas.test.ts && pnpm lint`

- [x] 3. Documentation — manual source_system in AGENTS.md + env docs

  **What to do**:
  - Edit `AGENTS.md` (the project one, `/Users/victordozal/repos/dozal-devs/ai-employee/AGENTS.md`): add a short subsection under "Current Implementation" or "Generic Worker Harness" documenting:
    - New admin endpoints: `POST /admin/tenants/:tenantId/employees/:slug/trigger` and `GET /admin/tenants/:tenantId/tasks/:id`
    - Purpose: manual/test/debug triggering of summarizer employee
    - `source_system` value `'manual'` (existing values: `'jira'`, `'cron'`)
    - One curl example for triggering + one for dry-run
  - Edit `.env.example`: no new env vars needed (reuses `ADMIN_API_KEY`). Just verify `ADMIN_API_KEY` is documented with a comment mentioning it now also gates the manual trigger.
  - Edit `README.md`: add one row to the admin endpoints table listing the new `POST /admin/tenants/:tenantId/employees/:slug/trigger` and `GET /admin/tenants/:tenantId/tasks/:id` routes
  - Keep wording terse — AGENTS.md "every token costs tokens on every turn" (per repo AGENTS.md file)

  **Must NOT do**:
  - No emojis in any markdown
  - No "AI-generated" style padding ("This revolutionary new endpoint...")
  - No duplication of what's in the plan file — docs give minimum context, plan has full detail
  - No engineering trigger docs (deferred)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Pure prose edits to 3 markdown files; no logic or code.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: T8 (wiring task references these docs for smoke-test commands)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `AGENTS.md:20-42` — "Current Implementation" and "Generic Worker Harness" sections where the new docs fit
  - `README.md:29-38` — admin endpoints table format to mimic

  **WHY Each Reference Matters**:
  - The AGENTS.md structure is terse and functional — match that voice; don't verbose it up
  - README.md table format is uniform — new rows should match column widths and style

  **Acceptance Criteria**:

  **Verification** (no TDD for docs):
  - [ ] `AGENTS.md` mentions the two new routes and `source_system: 'manual'`
  - [ ] `README.md` admin-endpoints table has new rows for the new routes
  - [ ] `.env.example` comment on `ADMIN_API_KEY` mentions the trigger endpoints (or unchanged if already generic)
  - [ ] No emojis introduced
  - [ ] No AI-slop filler text
  - [ ] Line count delta in AGENTS.md ≤ 20 lines

  **QA Scenarios**:

  ```
  Scenario: Docs reference all new routes correctly
    Tool: Bash (grep)
    Steps:
      1. grep -c "/admin/tenants/:tenantId/employees/:slug/trigger" AGENTS.md README.md
      2. Assert both files match at least once
      3. grep "source_system" AGENTS.md | grep "manual"
      4. Assert at least 1 match
    Expected Result: All assertions pass
    Evidence: .sisyphus/evidence/task-3-docs-grep.txt

  Scenario: Docs contain no emojis
    Tool: Bash (grep with unicode)
    Steps:
      1. Run python3 -c "import sys,re; [sys.exit(1) for f in ['AGENTS.md','README.md'] for line in open(f) if re.search(r'[\U0001F300-\U0001FAFF\u2600-\u26FF\u2700-\u27BF]', line)]"
      2. Assert exit code 0
    Expected Result: Exit code 0 (no emojis found)
    Evidence: .sisyphus/evidence/task-3-no-emojis.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-docs-grep.txt`
  - [ ] `.sisyphus/evidence/task-3-no-emojis.txt`

  **Commit**: YES (standalone)
  - Message: `docs: document manual source_system value`
  - Files: `AGENTS.md`, `README.md`, `.env.example`
  - Pre-commit: `pnpm lint` (confirms markdown doesn't break any linter configs)

- [x] 4. Employee dispatcher service (generic-harness only)

  **What to do**:
  - Create `src/gateway/services/employee-dispatcher.ts` exporting:
    - `interface DispatchEmployeeParams { tenantId: string; slug: string; dryRun: boolean; prisma: PrismaClient; inngest: InngestLike; }`
    - `type DispatchEmployeeResult` — discriminated union: `{ kind: 'dispatched'; taskId: string; archetypeId: string }` | `{ kind: 'dry_run'; archetypeId: string; wouldFire: { eventName: string; data: Record<string, unknown>; externalId: string } }` | `{ kind: 'error'; code: 'ARCHETYPE_NOT_FOUND' | 'UNSUPPORTED_RUNTIME' | 'INVALID_ARCHETYPE_CONFIG'; message: string }`
    - `async function dispatchEmployee(params: DispatchEmployeeParams): Promise<DispatchEmployeeResult>`
  - Implementation:
    1. Look up archetype via `prisma.archetype.findUnique({ where: { tenant_id_role_name: { tenant_id: tenantId, role_name: slug } } })`
    2. If not found: return `{ kind: 'error', code: 'ARCHETYPE_NOT_FOUND', message: 'No archetype found for tenant <uuid> with role_name <slug>' }`
    3. If `archetype.runtime !== 'generic-harness'`: return `{ kind: 'error', code: 'UNSUPPORTED_RUNTIME', message: 'Manual trigger for runtime <x> is not yet supported' }` (engineering opencode runtime deferred)
    4. Generate `externalId = 'manual-' + crypto.randomUUID()`
    5. Build `wouldFire = { eventName: 'employee/task.dispatched', data: { taskId: '<will-be-assigned>', archetypeId: archetype.id }, externalId }`
    6. If `dryRun`: return `{ kind: 'dry_run', archetypeId: archetype.id, wouldFire }` — NO task created, NO event sent
    7. Otherwise: create task in Prisma transaction — `{ archetype_id, external_id: externalId, source_system: 'manual', status: 'Ready', tenant_id: tenantId }`, capture `task.id`
    8. Call `await inngest.send({ name: 'employee/task.dispatched', data: { taskId: task.id, archetypeId: archetype.id }, id: 'manual-dispatch-' + externalId })`
    9. Return `{ kind: 'dispatched', taskId: task.id, archetypeId: archetype.id }`
  - Use existing `InngestLike` interface from `src/gateway/inngest/send.ts` for dependency injection
  - Unit tests: `tests/gateway/services/employee-dispatcher.test.ts` — cover all 3 error cases, dry_run, happy path; mock Prisma + Inngest

  **Must NOT do**:
  - **No `step.run()`** — this is NOT an Inngest function; call Prisma and `inngest.send` directly
  - No PostgREST `fetch` calls (use Prisma — canonical admin API pattern)
  - No engineering-specific branches (no `opencode` runtime handling — return `UNSUPPORTED_RUNTIME`)
  - No `project_id` handling
  - No `as any` — use proper Prisma types (`Archetype` from `@prisma/client`)
  - No logger side-effects in dry-run path (keeps dry-run pure/side-effect-free)
  - No side effects before validation (don't create task then check runtime — check runtime first)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core business-logic module with multi-path output, transactional DB write + event dispatch, strict type safety, must preserve idempotency semantics.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: Partially (after T1 + T2)
  - **Parallel Group**: Wave 2 (with T5, T6)
  - **Blocks**: T5 (route calls this), T7 (integration test exercises this end-to-end)
  - **Blocked By**: T1 (needs unique constraint for `findUnique` by compound key), T2 (uses `TriggerEmployeeParams` type)

  **References**:

  **Pattern References**:
  - `src/gateway/services/project-registry.ts` — canonical gateway service module structure: interface params, typed return, accepts `prisma` via options, no internal state
  - `src/gateway/services/task-creation.ts` — Prisma transaction pattern for creating a task + related rows atomically (mirror the transaction shape)
  - `src/inngest/lib/create-task-and-dispatch.ts:17-74` — reference implementation of the "create task + send event" flow. **DO NOT reuse as-is** (wrapped in `step.run`) but DO copy the field values: `archetype_id`, `external_id`, `source_system`, `status: 'Ready'`, `tenant_id`.

  **API/Type References**:
  - `src/gateway/inngest/send.ts:1-30` — `InngestLike` interface (the injection point for `inngest.send`)
  - `prisma/schema.prisma:43-84` — Task model fields (verify `status`, `archetype_id`, `external_id`, `source_system`, `tenant_id` shapes)

  **Test References**:
  - `tests/gateway/services/project-registry.test.ts` (if exists) — mocking Prisma pattern
  - Otherwise use Vitest `vi.fn()` + manual mock object shaped like `PrismaClient`

  **External References**:
  - Prisma `findUnique` with compound key: https://www.prisma.io/docs/orm/reference/prisma-client-reference#findunique

  **WHY Each Reference Matters**:
  - `project-registry.ts`: proves the codebase convention for service modules — one exported factory-like async function per operation, typed params, typed result
  - `create-task-and-dispatch.ts`: provides the EXACT field values needed. DO NOT REINVENT these — just skip the `step.run` wrapper and use Prisma instead of fetch.
  - `send.ts`: shows that `inngest.send` is invoked as `await inngest.send({ name, data, id })`. Match exactly.

  **Acceptance Criteria**:

  **TDD (RED → GREEN → REFACTOR)**:
  - [ ] RED: Test file exists, all tests fail because `employee-dispatcher.ts` doesn't exist
  - [ ] GREEN: Implementation makes all tests pass
  - [ ] REFACTOR: Extract common error constants if duplicated with T5

  **Verification**:
  - [ ] `pnpm test -- --run tests/gateway/services/employee-dispatcher.test.ts` passes
  - [ ] Coverage: ≥ 90% line coverage on `employee-dispatcher.ts`
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm lint` succeeds — no `any`, no unused imports

  **Test Cases (MUST include)**:
  - Happy path: archetype found, runtime is `generic-harness`, dry_run=false → returns `kind: 'dispatched'` with task_id, calls `inngest.send` exactly once with correct payload, Prisma `task.create` called with `source_system: 'manual'` and `status: 'Ready'`
  - Dry-run: same as above but dry_run=true → returns `kind: 'dry_run'`, `inngest.send` NOT called, Prisma `task.create` NOT called
  - Archetype not found: `findUnique` returns null → returns `kind: 'error', code: 'ARCHETYPE_NOT_FOUND'`, no side effects
  - Unsupported runtime: archetype has `runtime: 'opencode'` → returns `kind: 'error', code: 'UNSUPPORTED_RUNTIME'`, no side effects
  - External ID is unique per call: two invocations produce different `externalId` values

  **QA Scenarios**:

  ```
  Scenario: Dispatcher returns dispatched for valid summarizer request
    Tool: Bash (tsx script)
    Preconditions: Migration applied, seed run (daily-summarizer archetype exists), PostgreSQL reachable, services running from pnpm dev:start
    Steps:
      1. tsx -e "(async () => { const { dispatchEmployee } = await import('./src/gateway/services/employee-dispatcher.js'); const { PrismaClient } = await import('@prisma/client'); const prisma = new PrismaClient(); const spy = { send: (args) => { console.log('SENT:' + JSON.stringify(args)); return Promise.resolve({ids:['x']}); } }; const r = await dispatchEmployee({ tenantId: '00000000-0000-0000-0000-000000000001', slug: 'daily-summarizer', dryRun: false, prisma, inngest: spy }); console.log('RESULT:' + JSON.stringify(r)); })()"
      2. Capture output
      3. Assert contains "RESULT:{\"kind\":\"dispatched\""
      4. Assert contains "SENT:{" with name=employee/task.dispatched
      5. Query DB: psql $DATABASE_URL -c "SELECT id, source_system, status FROM tasks WHERE id = '<captured task_id>'"
      6. Assert row has source_system='manual' and status='Ready'
    Expected Result: task row exists with source_system='manual', Inngest spy captured event
    Evidence: .sisyphus/evidence/task-4-dispatch-happy.txt

  Scenario: Dispatcher dry-run creates no task row
    Tool: Bash (tsx script)
    Steps:
      1. Count existing tasks: N_BEFORE = SELECT COUNT(*) FROM tasks
      2. Call dispatchEmployee with dryRun: true
      3. Assert result.kind === 'dry_run'
      4. Count tasks again: N_AFTER = SELECT COUNT(*) FROM tasks
      5. Assert N_BEFORE === N_AFTER
      6. Assert spy.send was NOT called (log-tail empty)
    Expected Result: zero side effects in dry_run mode
    Evidence: .sisyphus/evidence/task-4-dry-run.txt

  Scenario: Unknown tenant returns ARCHETYPE_NOT_FOUND
    Tool: Bash (tsx script)
    Steps:
      1. Call dispatchEmployee with tenantId='99999999-9999-9999-9999-999999999999'
      2. Assert result.kind === 'error' && result.code === 'ARCHETYPE_NOT_FOUND'
    Evidence: .sisyphus/evidence/task-4-unknown-tenant.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-dispatch-happy.txt`
  - [ ] `.sisyphus/evidence/task-4-dry-run.txt`
  - [ ] `.sisyphus/evidence/task-4-unknown-tenant.txt`

  **Commit**: YES (standalone)
  - Message: `feat(gateway): add employee dispatcher service (generic-harness)`
  - Files: `src/gateway/services/employee-dispatcher.ts`, `tests/gateway/services/employee-dispatcher.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/services/employee-dispatcher.test.ts && pnpm lint`

- [x] 5. POST /admin/tenants/:tenantId/employees/:slug/trigger route handler

  **What to do**:
  - Create `src/gateway/routes/admin-employee-trigger.ts`:
    - Export `adminEmployeeTriggerRoutes(opts: { prisma?: PrismaClient; inngest?: InngestLike }): Router`
    - Factory pattern: accept `prisma` and `inngest` via options; default to real instances if not provided (match `admin-projects.ts` pattern)
    - Route: `router.post('/admin/tenants/:tenantId/employees/:slug/trigger', requireAdminKey, async (req, res) => { ... })`
    - Parse params via `TriggerEmployeeParamsSchema.safeParse({ tenantId: req.params.tenantId, slug: req.params.slug })`
    - Parse query via `TriggerEmployeeQuerySchema.safeParse(req.query)`
    - On validation failure: `res.status(400).json({ error: 'INVALID_REQUEST', issues: zodIssues })`
    - Call `dispatchEmployee({ tenantId, slug, dryRun, prisma, inngest })`
    - Map result to response:
      - `kind: 'dispatched'` → 202 `{ task_id, status_url: '/admin/tenants/${tenantId}/tasks/${task_id}' }`
      - `kind: 'dry_run'` → 200 `{ valid: true, would_fire: { event_name, data, external_id }, archetype_id }`
      - `kind: 'error', code: 'ARCHETYPE_NOT_FOUND'` → 404 `{ error: 'NOT_FOUND', message }`
      - `kind: 'error', code: 'UNSUPPORTED_RUNTIME'` → 501 `{ error: 'NOT_IMPLEMENTED', message }` (indicates future feature)
      - `kind: 'error', code: 'INVALID_ARCHETYPE_CONFIG'` → 500 `{ error: 'INTERNAL_ERROR' }`
    - Wrap in try/catch; log via `pino` on unexpected errors; respond with 500 `{ error: 'INTERNAL_ERROR' }`
  - Unit tests: `tests/gateway/routes/admin-employee-trigger.test.ts` — use `supertest` (check if already installed: `grep supertest package.json`; if not, use Express mock req/res) to test all HTTP paths

  **Must NOT do**:
  - No `PrismaClient` instantiation inside the handler (accept via options)
  - No inline `dispatchEmployee` logic (delegate fully to service)
  - No `res.send()` after `res.json()` (would double-send)
  - No missing `return` after response — ensure handler exits after each send
  - No `console.log` — use `pino` logger
  - No leaking internal Prisma errors to response body (map to `INTERNAL_ERROR`)
  - No hardcoded `SYSTEM_TENANT_ID` — tenantId comes from URL

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: HTTP route with branch-heavy response mapping, error handling, and auth wiring. Several response codes and edge cases need verification.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: Partially (after T2 + T4)
  - **Parallel Group**: Wave 2 (with T4, T6)
  - **Blocks**: T7 (integration test hits this route), T8 (server wires it in)
  - **Blocked By**: T2 (schemas), T4 (dispatcher service)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-projects.ts:24-50` — canonical factory pattern with opts, route registration, `requireAdminKey`, safeParse + 400, try/catch with logger + 500
  - `src/gateway/routes/admin-projects.ts:28-50` — the `createProject` POST route is the closest structural sibling (creates resource, returns 201; we return 202 instead)

  **API/Type References**:
  - `src/gateway/middleware/admin-auth.ts:7` — `requireAdminKey` signature and header expectation
  - `src/gateway/validation/schemas.ts` (after T2) — import `TriggerEmployeeParamsSchema`, `TriggerEmployeeQuerySchema`
  - `src/gateway/services/employee-dispatcher.ts` (after T4) — `DispatchEmployeeResult` union

  **Test References**:
  - `tests/gateway/routes/admin-projects.test.ts` (if exists) — pattern for testing Express routes
  - `package.json` — check if `supertest` is installed; if yes, use; if no, use plain Express request mocking

  **WHY Each Reference Matters**:
  - `admin-projects.ts`: THE canonical template. Copy its factory structure 1:1. Only substitutions: schema names, service call, response codes.
  - The consistency of admin routes matters — Momus will reject if this file diverges in style from the others.

  **Acceptance Criteria**:

  **TDD (RED → GREEN → REFACTOR)**:
  - [ ] RED: Route test file exists, tests fail (route not yet mounted)
  - [ ] GREEN: Implementation passes all tests
  - [ ] REFACTOR: Extract HTTP-level constants (status codes, error codes) if duplicated with T6

  **Verification**:
  - [ ] `pnpm test -- --run tests/gateway/routes/admin-employee-trigger.test.ts` passes
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm lint` succeeds

  **Test Cases (MUST include)**:
  - 401 when `X-Admin-Key` header missing
  - 401 when header present but wrong value
  - 400 when `tenantId` is not a UUID
  - 400 when `slug` contains uppercase
  - 202 + `{ task_id, status_url }` on successful dispatch (mock dispatcher returns `dispatched`)
  - 200 + `{ valid: true, would_fire }` when `?dry_run=true`
  - 404 when dispatcher returns `ARCHETYPE_NOT_FOUND`
  - 501 when dispatcher returns `UNSUPPORTED_RUNTIME`
  - 500 when dispatcher throws unexpected error

  **QA Scenarios**:

  ```
  Scenario: Real HTTP trigger with valid admin key returns 202
    Tool: Bash (curl)
    Preconditions: pnpm dev:start running, migration + seed applied
    Steps:
      1. TENANT=00000000-0000-0000-0000-000000000001
      2. RESPONSE=$(curl -s -w "%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger" -d '{}')
      3. Assert status code 202
      4. Assert body is JSON with task_id (UUID) and status_url containing that task_id
      5. Save full response to evidence file
    Expected Result: HTTP 202, body contains task_id and status_url
    Evidence: .sisyphus/evidence/task-5-curl-real.txt

  Scenario: Dry-run returns 200 with preview and creates no task
    Tool: Bash (curl + psql)
    Steps:
      1. N_BEFORE=$(psql $DATABASE_URL -tAc "SELECT COUNT(*) FROM tasks WHERE source_system='manual'")
      2. curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger?dry_run=true" -H "Content-Type: application/json" -d '{}'
      3. Assert status 200, body { valid: true, would_fire: {...} }
      4. N_AFTER=$(psql $DATABASE_URL -tAc "SELECT COUNT(*) FROM tasks WHERE source_system='manual'")
      5. Assert N_AFTER === N_BEFORE
    Expected Result: 200 with dry-run body, no new manual-source tasks in DB
    Evidence: .sisyphus/evidence/task-5-curl-dry-run.txt

  Scenario: Missing admin key returns 401
    Tool: Bash (curl)
    Steps:
      1. curl -s -w "%{http_code}" -X POST "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger" -d '{}'
      2. Assert status 401
      3. Assert body { error: "Unauthorized" }
    Evidence: .sisyphus/evidence/task-5-curl-unauthorized.txt

  Scenario: Unknown slug returns 404 (not 500)
    Tool: Bash (curl)
    Steps:
      1. curl -s -w "%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/$TENANT/employees/does-not-exist/trigger" -H "Content-Type: application/json" -d '{}'
      2. Assert status 404
      3. Assert body.error === "NOT_FOUND"
    Evidence: .sisyphus/evidence/task-5-curl-unknown-slug.txt

  Scenario: Bad tenant UUID returns 400
    Tool: Bash (curl)
    Steps:
      1. curl -s -w "%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/not-a-uuid/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
      2. Assert status 400
      3. Assert body.error === "INVALID_REQUEST"
    Evidence: .sisyphus/evidence/task-5-curl-bad-tenant.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-curl-real.txt`
  - [ ] `.sisyphus/evidence/task-5-curl-dry-run.txt`
  - [ ] `.sisyphus/evidence/task-5-curl-unauthorized.txt`
  - [ ] `.sisyphus/evidence/task-5-curl-unknown-slug.txt`
  - [ ] `.sisyphus/evidence/task-5-curl-bad-tenant.txt`

  **Commit**: YES (standalone)
  - Message: `feat(gateway): add POST /admin/tenants/:tenantId/employees/:slug/trigger`
  - Files: `src/gateway/routes/admin-employee-trigger.ts`, `tests/gateway/routes/admin-employee-trigger.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/routes/admin-employee-trigger.test.ts && pnpm lint`

- [x] 6. GET /admin/tenants/:tenantId/tasks/:id status endpoint

  **What to do**:
  - Create `src/gateway/routes/admin-tasks.ts`:
    - Export `adminTasksRoutes(opts: { prisma?: PrismaClient }): Router`
    - Route: `router.get('/admin/tenants/:tenantId/tasks/:id', requireAdminKey, async (req, res) => { ... })`
    - Parse params via `GetTaskParamsSchema.safeParse({ tenantId, id })`
    - On validation failure → 400 `{ error: 'INVALID_REQUEST', issues }`
    - Query: `await prisma.task.findFirst({ where: { id, tenant_id: tenantId }, select: { id, status, source_system, external_id, archetype_id, created_at, updated_at, deliverable_content: true } })`
    - If `null`: return 404 `{ error: 'NOT_FOUND' }` (important: same 404 for both "task doesn't exist" and "task belongs to different tenant" — do NOT leak which)
    - If found: return 200 with task object
    - Log on unexpected errors via `pino`; respond 500 `{ error: 'INTERNAL_ERROR' }`
  - Unit tests: `tests/gateway/routes/admin-tasks.test.ts`

  **Must NOT do**:
  - No `findUnique({ where: { id } })` — use `findFirst` with tenant_id to enforce scope
  - No distinct 404 vs 403 — ALWAYS 404 on cross-tenant access (prevents tenant enumeration)
  - No `select: { *: true }` — explicit field selection (keeps response body minimal and predictable)
  - No returning internal Prisma timestamps raw if they need shaping — but for now, ISO strings via `.toISOString()` or direct pass-through if already Date→JSON handles it
  - No `console.log`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple read-only endpoint with tenant-scoped query. Low branching complexity.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (only needs T2)
  - **Parallel Group**: Wave 2 (with T4, T5)
  - **Blocks**: T8 (server wires it in), F3 (QA needs this to verify status after trigger)
  - **Blocked By**: T2 (schemas)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-projects.ts:65-90` — the `GET /admin/projects/:id` route is the near-perfect template (single-resource lookup with UUID validation, 404 on not-found). Our version adds tenant scoping.

  **API/Type References**:
  - `prisma/schema.prisma:43-84` — Task model; decide which fields to include in response (rule of thumb: include enough for a debug dashboard, exclude sensitive fields like full `deliverable_content` if large — but for MVP include it)

  **WHY Each Reference Matters**:
  - `admin-projects.ts:65-90`: literal template. Copy structure, swap resource name and lookup.

  **Acceptance Criteria**:

  **TDD (RED → GREEN → REFACTOR)**:
  - [ ] RED: Route test exists, fails
  - [ ] GREEN: Implementation passes
  - [ ] REFACTOR: If response shaping duplicates anywhere, extract a `serializeTask()` helper (optional)

  **Verification**:
  - [ ] `pnpm test -- --run tests/gateway/routes/admin-tasks.test.ts` passes
  - [ ] `pnpm build` and `pnpm lint` succeed

  **Test Cases (MUST include)**:
  - 401 without admin key
  - 400 on non-UUID `tenantId`
  - 400 on non-UUID `id`
  - 404 when task does not exist
  - 404 when task exists but belongs to DIFFERENT tenant (cross-tenant access blocked)
  - 200 + task object when task exists for correct tenant
  - Response object shape: `{ id, status, source_system, external_id, archetype_id, created_at, updated_at }`

  **QA Scenarios**:

  ```
  Scenario: Status endpoint returns task for correct tenant
    Tool: Bash (curl)
    Preconditions: pnpm dev:start running; a task with known id and known tenant_id exists (insert one via psql if needed)
    Steps:
      1. TASK_ID=$(psql $DATABASE_URL -tAc "SELECT id FROM tasks WHERE tenant_id='00000000-0000-0000-0000-000000000001' LIMIT 1")
      2. curl -s -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000001/tasks/$TASK_ID"
      3. Assert status 200
      4. Assert response JSON has id, status, source_system, external_id
      5. Save to evidence
    Expected Result: 200 + task body
    Evidence: .sisyphus/evidence/task-6-status-happy.txt

  Scenario: Cross-tenant access returns 404 (NOT task data)
    Tool: Bash (curl)
    Steps:
      1. Use TASK_ID from above
      2. curl -s -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/99999999-9999-9999-9999-999999999999/tasks/$TASK_ID"
      3. Assert status 404
      4. Assert body === {"error":"NOT_FOUND"} — verify NO task fields leaked
    Expected Result: 404 with only the NOT_FOUND error; no task data in body
    Evidence: .sisyphus/evidence/task-6-cross-tenant.txt

  Scenario: Missing admin key returns 401
    Tool: Bash (curl)
    Steps:
      1. curl -s -w "%{http_code}" "http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000001/tasks/$TASK_ID"
      2. Assert status 401
    Evidence: .sisyphus/evidence/task-6-unauthorized.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-6-status-happy.txt`
  - [ ] `.sisyphus/evidence/task-6-cross-tenant.txt`
  - [ ] `.sisyphus/evidence/task-6-unauthorized.txt`

  **Commit**: YES (standalone)
  - Message: `feat(gateway): add GET /admin/tenants/:tenantId/tasks/:id`
  - Files: `src/gateway/routes/admin-tasks.ts`, `tests/gateway/routes/admin-tasks.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/routes/admin-tasks.test.ts && pnpm lint`

- [x] 7. Integration test — end-to-end manual trigger against real Prisma + Inngest spy

  **What to do**:
  - Create `tests/gateway/integration/manual-trigger.integration.test.ts`
  - Scope: full HTTP → dispatcher → Prisma → Inngest spy chain (no mocks below the Inngest boundary)
  - Setup:
    - Use real `PrismaClient` against the local test DB (use `DATABASE_URL`)
    - In `beforeEach`: truncate `tasks` table with `WHERE source_system = 'manual'` (don't wipe cron-created rows; keeps it safe)
    - Seed/verify `daily-summarizer` archetype exists (the seed runs in `pnpm setup`, so just assert it's there at test start; throw a clear error if missing)
    - Replace `inngest.send` with a `vi.fn()` spy that captures the call
    - Build an Express app via a small helper: `createTestApp({ prisma, inngest: spy })` that mounts `adminEmployeeTriggerRoutes` and `adminTasksRoutes`
    - Use `supertest` if already installed; otherwise use `http.createServer` + `fetch` to hit the app on an ephemeral port
  - Tests:
    1. End-to-end trigger creates DB row and dispatches event: POST to trigger endpoint → assert 202 → query Prisma to verify task exists with `source_system='manual'`, `status='Ready'`, `archetype_id` matches daily-summarizer → assert spy received exactly one `employee/task.dispatched` call with matching `taskId`
    2. Dry-run creates no row and dispatches no event: POST with `?dry_run=true` → assert 200 → assert Prisma count unchanged → assert spy not called
    3. Two rapid triggers create two distinct tasks with distinct `external_id`s: call endpoint twice → assert two rows exist with different `external_id`s matching `^manual-[0-9a-f-]+$`
    4. Status endpoint returns the created task: trigger, extract `task_id` from response, GET status → assert 200 with task body containing expected fields
    5. Cross-tenant status returns 404: create task in system tenant, GET with `other-tenant-id` → assert 404
  - Cleanup: `afterAll`: disconnect Prisma

  **Must NOT do**:
  - No `pnpm dev:start` needed — mount Express app in-process
  - No real Inngest server (spy is sufficient at the dispatch boundary)
  - No test-only code in production files (keep test helpers in the test file or a `tests/helpers/` module)
  - No hardcoded `ADMIN_API_KEY` in tests (read from `process.env` — tests/setup should set it)
  - No parallelized tests that share DB state — use `.serial` or `test.concurrent(false)` if Vitest defaults change

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cross-layer integration with real Prisma + HTTP + spy — lots of setup, lots of assertions, easy to get wrong.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: Partially (after T4 + T5)
  - **Parallel Group**: Wave 3 (with T8)
  - **Blocks**: F3 (QA wave consumes this test's results)
  - **Blocked By**: T4 (dispatcher), T5 (trigger route), indirectly T6 (status route — test 4 uses it)

  **References**:

  **Pattern References**:
  - Any existing file under `tests/gateway/integration/` — integration test conventions. If none, create the directory.
  - `tests/setup.ts` or `vitest.config.ts` — DB setup hooks; ensure our integration test doesn't conflict with existing setup

  **API/Type References**:
  - `src/gateway/server.ts` — how `app.use()` wires routes; replicate minimally in `createTestApp()` helper
  - `src/gateway/inngest/send.ts:InngestLike` — spy shape to implement

  **Test References**:
  - `tests/gateway/` for established test utilities
  - Check `package.json` devDependencies for `supertest` presence

  **WHY Each Reference Matters**:
  - We need a mini-server harness. `server.ts` shows the wiring; we'll copy the 3-line essential: `app.use(express.json()); app.use(adminEmployeeTriggerRoutes({ prisma, inngest: spy })); app.use(adminTasksRoutes({ prisma }))`

  **Acceptance Criteria**:

  **Verification**:
  - [ ] `pnpm test -- --run tests/gateway/integration/manual-trigger.integration.test.ts` passes
  - [ ] Test runs in < 30 seconds (integration, not unit)
  - [ ] No open Prisma connections after test completes (no warnings about connection leaks)
  - [ ] Total test count grows by ≥ 5 (5 integration cases)

  **QA Scenarios**:

  ```
  Scenario: Integration test suite passes with verbose output
    Tool: Bash
    Preconditions: DB running, migration + seed applied, ADMIN_API_KEY set
    Steps:
      1. Run pnpm test -- --run tests/gateway/integration/manual-trigger.integration.test.ts --reporter=verbose 2>&1 | tee .sisyphus/evidence/task-7-integration-output.txt
      2. Assert log contains "5 passed" or equivalent
      3. Assert no "unhandled rejection" or "connection leaked" warnings
    Expected Result: All 5 integration tests pass, no warnings
    Evidence: .sisyphus/evidence/task-7-integration-output.txt

  Scenario: DB state inspection after suite confirms no orphan tasks
    Tool: Bash (psql)
    Steps:
      1. Run psql $DATABASE_URL -c "SELECT COUNT(*) FROM tasks WHERE source_system='manual' AND external_id LIKE 'manual-%'"
      2. Assert count matches expected residual (0 if afterEach truncates, small N if not)
    Evidence: .sisyphus/evidence/task-7-db-count.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-7-integration-output.txt`
  - [ ] `.sisyphus/evidence/task-7-db-count.txt`

  **Commit**: YES (standalone)
  - Message: `test(gateway): add integration test for manual employee trigger`
  - Files: `tests/gateway/integration/manual-trigger.integration.test.ts` (plus any helper files)
  - Pre-commit: `pnpm test -- --run tests/gateway/integration/manual-trigger.integration.test.ts && pnpm lint`

- [x] 8. Wire routes into server.ts + verify full stack + update README/AGENTS examples

  **What to do**:
  - Edit `src/gateway/server.ts`:
    - Import `adminEmployeeTriggerRoutes` and `adminTasksRoutes`
    - After existing `app.use(adminProjectRoutes(...))`, add: `app.use(adminEmployeeTriggerRoutes({ prisma, inngest }))` and `app.use(adminTasksRoutes({ prisma }))`
    - If `prisma` and `inngest` are already shared across routes (inspect current server.ts), reuse the same instances
  - Manual smoke-test:
    - `pnpm build` → succeeds
    - `pnpm dev:start` → gateway boots without errors
    - Hit both routes with curl; verify 202 / 200 / 404 as appropriate
  - Update AGENTS.md (the project one) with the curl command block from the Success Criteria section (trimmed)
  - Update README.md:
    - Add row(s) to the admin endpoints table for the new routes
    - Optionally add a "Manual Trigger" section under "Registering Projects" with 3 curl examples (trigger, dry-run, status)
  - Run full test suite: `pnpm test -- --run` — must pass with no regressions (≥ 849 + N new tests)

  **Must NOT do**:
  - No changes to the Inngest function registration (`serve` handler) — new route doesn't need Inngest function registration, only `inngest.send`
  - No new env vars
  - No edits to the engineering-related routes/handlers (`/webhooks/jira`, engineering lifecycle)
  - No emojis in docs

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, mechanical wire-up + doc edits.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: Partially (depends on T3, T5, T6)
  - **Parallel Group**: Wave 3 (with T7)
  - **Blocks**: F1 (plan compliance), F3 (full-stack QA needs the server wired)
  - **Blocked By**: T3 (docs written), T5 (trigger route exists), T6 (status route exists)

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts` — look for existing `app.use(adminProjectRoutes(...))` line; add the two new `app.use` calls directly after it
  - `AGENTS.md:50-64` — the "Commands" section; consider adding a new "Manual Trigger" subsection after it
  - `README.md:29-38` — admin endpoints table

  **API/Type References**:
  - Both new route factories accept `{ prisma?, inngest? }` — default to real instances for production, test injects mocks/spies

  **WHY Each Reference Matters**:
  - `server.ts`: single insertion point. One line per route. If you over-refactor here, you'll create churn Momus will flag.

  **Acceptance Criteria**:

  **Verification**:
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm lint` succeeds
  - [ ] `pnpm test -- --run` → ALL tests pass (target: baseline + new tests)
  - [ ] `pnpm dev:start` boots without errors and serves both new routes (verified by hitting `curl` on both)
  - [ ] `grep -r "adminEmployeeTriggerRoutes\|adminTasksRoutes" src/gateway/server.ts` returns both import and usage lines
  - [ ] README admin-endpoints table contains new rows
  - [ ] AGENTS.md mentions the new endpoints (added in T3, re-verified here)

  **QA Scenarios**:

  ```
  Scenario: Full stack end-to-end via curl after wiring
    Tool: Bash (curl + psql)
    Preconditions: pnpm dev:start running, migration + seed applied, ADMIN_API_KEY set, daily-summarizer archetype exists
    Steps:
      1. TENANT=00000000-0000-0000-0000-000000000001
      2. Dry-run first: curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger?dry_run=true" -d '{}' -H "Content-Type: application/json" | jq
         - Assert body.valid === true
      3. Real fire: RESP=$(curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger" -d '{}' -H "Content-Type: application/json")
         - Extract task_id: TASK_ID=$(echo $RESP | jq -r .task_id)
         - Assert task_id matches UUID regex
      4. Status check: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/tenants/$TENANT/tasks/$TASK_ID" | jq
         - Assert body.id === $TASK_ID, body.source_system === 'manual'
      5. DB check: psql $DATABASE_URL -c "SELECT id, source_system, status FROM tasks WHERE id = '$TASK_ID'"
         - Assert 1 row with source_system='manual'
      6. Inngest check (optional but recommended): curl http://localhost:8288/v1/events | grep employee/task.dispatched
         - Assert the event shows up in Inngest dev server history
    Expected Result: Full flow works; task created, event dispatched, status retrievable
    Evidence: .sisyphus/evidence/task-8-full-stack.txt

  Scenario: Regression — existing /admin/projects still works
    Tool: Bash (curl)
    Steps:
      1. curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:3000/admin/projects" | jq
      2. Assert status 200, body is { projects: [...] }
    Expected Result: Existing admin routes unchanged
    Evidence: .sisyphus/evidence/task-8-regression.txt

  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. pnpm test -- --run 2>&1 | tee .sisyphus/evidence/task-8-full-test-run.txt | tail -50
      2. Assert "Test Files" and "Tests" lines show 0 failures
    Evidence: .sisyphus/evidence/task-8-full-test-run.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-8-full-stack.txt`
  - [ ] `.sisyphus/evidence/task-8-regression.txt`
  - [ ] `.sisyphus/evidence/task-8-full-test-run.txt`

  **Commit**: YES (standalone)
  - Message: `feat(gateway): wire manual trigger routes into server`
  - Files: `src/gateway/server.ts`, `README.md`, `AGENTS.md` (if further edits beyond T3)
  - Pre-commit: `pnpm test -- --run && pnpm lint && pnpm build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run curl, query DB). For each "Must NOT Have": search codebase for forbidden patterns (grep for `Fastify`, `step.run` in route files, `as any`, `console.log` in new files, `project_id` in trigger schema) — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Confirm engineering scope truly deferred (no opencode dispatch branch present).
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [8/8] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log`, commented-out code, unused imports, generic variable names (data/result/item/temp). Check that route handlers use `pino` logger (not console). Verify service modules accept dependencies via options (no `new PrismaClient()` inside handlers). Audit for AI slop: excessive JSDoc, over-abstraction, leaky internal types in public API.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state (`pnpm setup` or equivalent). Run `pnpm dev:start`. Execute EVERY QA scenario from EVERY task — real curl, real DB, real Inngest dev server. Test cross-task integration: dry-run first, then real trigger, then status check, then verify Slack approval message posted. Test edge cases: missing admin key (401), bad UUID tenant (400), unknown tenant/slug combo (404), wrong tenant on status endpoint (404 not data leak), duplicate `external_id` (unique constraint enforces 409 or handled via fresh UUID each time). Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`, `git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance per task. Detect cross-task contamination: T4 changes shouldn't touch T6 files. Flag unaccounted changes. Specifically verify: no engineering opencode dispatch branch, no project_id handling, no webhook-style wiring, no `step.run` in HTTP handlers.
      Output: `Tasks [8/8 compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Small, atomic commits per task. Run `pnpm test -- --run && pnpm lint` before each commit.

| Task | Message                                                                    |
| ---- | -------------------------------------------------------------------------- |
| T1   | `feat(db): add unique constraint on archetype (tenant_id, role_name)`      |
| T2   | `feat(gateway): add zod schemas for employee trigger + task status`        |
| T3   | `docs: document manual source_system value`                                |
| T4   | `feat(gateway): add employee dispatcher service (generic-harness)`         |
| T5   | `feat(gateway): add POST /admin/tenants/:tenantId/employees/:slug/trigger` |
| T6   | `feat(gateway): add GET /admin/tenants/:tenantId/tasks/:id`                |
| T7   | `test(gateway): add integration test for manual employee trigger`          |
| T8   | `feat(gateway): wire manual trigger routes into server`                    |

---

## Success Criteria

### Verification Commands

```bash
# Unit + integration tests (must pass)
pnpm test -- --run

# Lint (must pass)
pnpm lint

# Build (must pass)
pnpm build

# Migration (must apply cleanly)
pnpm prisma migrate deploy

# Manual QA: dry-run (expect 200 + valid:true, NO task row created)
TENANT=00000000-0000-0000-0000-000000000001
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger?dry_run=true" \
  -H "Content-Type: application/json" -d '{}' | jq
# Expect: { "valid": true, "would_fire": { "event_name": "employee/task.dispatched", "archetype_id": "..." } }

# Manual QA: real trigger (expect 202 + task_id + status_url)
curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger" \
  -H "Content-Type: application/json" -d '{}' | jq

# Manual QA: status check (expect 200 + task row)
TASK_ID=<from previous call>
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:3000/admin/tenants/$TENANT/tasks/$TASK_ID" | jq

# Manual QA: cross-tenant access (expect 404, NOT data)
OTHER=11111111-1111-1111-1111-111111111111
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:3000/admin/tenants/$OTHER/tasks/$TASK_ID" | jq
# Expect: { "error": "NOT_FOUND" }

# Manual QA: unauthorized (expect 401)
curl -s -X POST "http://localhost:3000/admin/tenants/$TENANT/employees/daily-summarizer/trigger" \
  -H "Content-Type: application/json" -d '{}'
# Expect: { "error": "Unauthorized" }
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (audit by F1/F4)
- [ ] All new tests pass
- [ ] All existing tests pass (0 regressions)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` succeeds
- [ ] Prisma migration is safe (applies to dev DB without data loss)
- [ ] Manual trigger creates task with `source_system: 'manual'`
- [ ] Manual trigger fires `employee/task.dispatched` event
- [ ] Downstream summarizer flow runs identically to cron-triggered path
- [ ] Slack approval gate still fires (not bypassed)
- [ ] Dry-run creates NO task row and fires NO event
- [ ] Status endpoint respects tenant scoping (no cross-tenant data leak)
- [ ] Zero human-intervention acceptance criteria
