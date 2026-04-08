# Dynamic Project Registration API

## TL;DR

> **Quick Summary**: Add a REST API to the ai-employee gateway (`POST/GET/PATCH/DELETE /admin/projects`) so any GitHub repo can be registered at runtime instead of hardcoded in `prisma/seed.ts`. Also unlock non-pnpm repos by making the install command configurable via `tooling_config.install` (implemented in TypeScript, not bash).
>
> **Deliverables**:
>
> - New authenticated admin endpoints: Create, List, Get, Update, Delete projects
> - Simple `X-Admin-Key` middleware using `crypto.timingSafeEqual`
> - Prisma migration: `@@unique([jira_project_key, tenant_id])` constraint on `projects`
> - Shared `src/lib/repo-url.ts` module (extracts and improves `parseRepoOwnerAndName`)
> - `ToolingConfig.install` field + default + worker integration (install moved from `entrypoint.sh` → `orchestrate.mts`)
> - Extended `cleanupTestData()` helper to handle admin-created projects
> - Full TDD test coverage + E2E regression test for existing webhook flow
> - Documentation updates in `README.md`, `AGENTS.md`, `.env.example`
>
> **Estimated Effort**: Medium (22 implementation tasks across 4 waves + final verification wave)
> **Parallel Execution**: YES — 4 waves with 5–7 tasks per wave
> **Critical Path**: T1 (migration) → T2 (shared repo-url) → T9 (admin route POST) → T20 (worker install integration) → T22 (E2E regression) → F1-F4

---

## Context

### Original Request

> "Can I use this AI employee system to work on any repository I want, or how does that part work?"

After clarification: user wants **dynamic multi-repo support** — register arbitrary repos at runtime via REST API, not hardcoded seed.

### Interview Summary

**Key Discussions**:

- **Interface**: REST API on the gateway (not CLI, not UI, not Supabase Studio). New admin routes under `/admin/projects`.
- **GitHub auth**: Keep single global `GITHUB_TOKEN`. Document the constraint that it must have access to every registered repo. No per-project tokens.
- **Toolchain override**: Accept `tooling_config` at registration, INCLUDING an `install` field. Worker must actually honor it for non-pnpm repos to work.
- **Admin auth**: `X-Admin-Key` header, timing-safe comparison. New `ADMIN_API_KEY` env var.
- **Registration validation**: Lightweight only — Zod + URL format parse. No network calls at registration time.
- **Test strategy**: TDD per task. Copy existing Vitest patterns from `tests/gateway/jira-webhook.test.ts`.
- **`jira_project_key` uniqueness**: Add `@@unique([jira_project_key, tenant_id])` via Prisma migration.
- **DELETE with active tasks**: Block with 409 Conflict if any task is in `Ready` / `Executing` / `Submitting`.

**Research Findings** (from parallel explore agents):

- Zero existing project CRUD endpoints. Only `jira.ts`, `github.ts`, `health.ts` routes exist.
- `tenant_id` is 100% hardcoded via `SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001'` (found in jira.ts:11 and task-creation.ts:5). No request-based tenant resolution anywhere in the codebase.
- `tooling_config` JSON field is **fully wired up** end-to-end: fetched in `src/workers/lib/project-config.ts:31`, resolved via `resolveToolingConfig()` in `src/workers/lib/task-context.ts:211-221`, used in `src/workers/lib/validation-pipeline.ts`. Defaults: `typescript: "pnpm tsc --noEmit"`, `lint: "pnpm lint"`, `unit: "pnpm test -- --run"`.
- BUT `pnpm install --frozen-lockfile` is hardcoded in `src/workers/entrypoint.sh:104` (bash), runs at boot step 4/8 BEFORE the worker fetches task context at step 6.
- Gateway has zero auth middleware. `JIRA_WEBHOOK_SECRET` validation at `src/gateway/server.ts:24-25` is the closest existing pattern.
- Fastify route convention: `export async function fooRoutes(app, opts): Promise<void>` with `opts.prisma ?? new PrismaClient()` fallback. Explicit registration in `src/gateway/server.ts:43-52`.
- Zod pattern: schemas in `src/gateway/validation/schemas.ts`, export `type Foo = z.infer<typeof FooSchema>` + `parseFoo(body)` helper.
- Test helpers: `createTestApp()`, `getPrisma()`, `cleanupTestData()`, `computeJiraSignature()` in `tests/setup.ts`.

### Metis Review

**Identified Critical Issues** (all addressed):

- **Install command architecture was wrong**: entrypoint.sh step 6 only fetches the TASK row, not the PROJECT row. Bash cannot access `tooling_config` without a second curl + JSON parsing. **Resolution**: move install OUT of entrypoint.sh entirely and INTO orchestrate.mts as a pre-validation step, where TypeScript already has the resolved `ToolingConfig`.
- **`parseRepoOwnerAndName` cross-boundary import**: function lives in `src/workers/lib/project-config.ts`, but the gateway needs to import it. **Resolution**: extract to new shared module `src/lib/repo-url.ts`; worker re-exports from lib for backward compatibility.
- **Test isolation**: `cleanupTestData()` in `tests/setup.ts` doesn't handle projects. New tests would leak. **Resolution**: extend helper to delete test-created projects by id-not-equal-to-seed pattern.
- **`ADMIN_API_KEY` missing behavior**: must fail-fast on startup, mirror `JIRA_WEBHOOK_SECRET` validation at `server.ts:24-25`.
- **`crypto.timingSafeEqual` length mismatch**: throws on unequal buffer lengths. Must length-check first.
- **`jira_project_key` unique constraint**: user approved migration path.
- **DELETE with active tasks**: user approved 409 block path.

---

## Work Objectives

### Core Objective

Enable operators to register, list, update, and delete any GitHub repository as a project in the ai-employee platform via an authenticated REST API, and make the Jira → PR pipeline actually work for non-pnpm repositories by propagating a configurable install command into the worker.

### Concrete Deliverables

1. `src/lib/repo-url.ts` — new shared module with `parseRepoOwnerAndName(url): {owner, repo}` and `normalizeRepoUrl(url): string` (strips trailing `.git`). Exported for both gateway and worker.
2. `src/workers/lib/project-config.ts` — updated to re-export from `src/lib/repo-url.ts` (backward compatible).
3. `prisma/migrations/XXXXX_unique_jira_project_key/migration.sql` — adds `@@unique([jira_project_key, tenant_id])` constraint on `projects` table. Regenerated Prisma client.
4. `src/gateway/validation/schemas.ts` — appended with `CreateProjectSchema`, `UpdateProjectSchema`, `ToolingConfigSchema` + matching parse helpers and types.
5. `src/gateway/middleware/admin-auth.ts` — new file. Exports `requireAdminKey` Fastify preHandler hook with length-safe timing-safe comparison.
6. `src/gateway/services/project-registry.ts` — new file. Pure functions: `createProject`, `listProjects`, `getProjectById`, `updateProject`, `deleteProject`. Each takes a `PrismaClient` parameter, mirroring `task-creation.ts` style.
7. `src/gateway/routes/admin-projects.ts` — new file. Registers `POST /admin/projects`, `GET /admin/projects`, `GET /admin/projects/:id`, `PATCH /admin/projects/:id`, `DELETE /admin/projects/:id` with auth preHandler.
8. `src/gateway/server.ts` — updated: (a) fail-fast startup check for `ADMIN_API_KEY`, (b) `app.register(adminProjectRoutes, { prisma })` added to the registration block.
9. `src/workers/lib/task-context.ts` — updated: `ToolingConfig.install?: string` field, `DEFAULT_TOOLING_CONFIG.install = "pnpm install --frozen-lockfile"`.
10. `src/workers/lib/install-runner.ts` — new file. Exports `runInstallCommand(command, workspaceDir): Promise<void>` using `execFileAsync` (same pattern as `validation-pipeline.ts`). 5-minute timeout.
11. `src/workers/orchestrate.mts` — updated: after `resolveToolingConfig()` call (line ~145), add a new step that invokes `runInstallCommand(toolingConfigResolved.install, '/workspace')`. Runs BEFORE OpenCode server starts.
12. `src/workers/entrypoint.sh` — updated: step 4 (`pnpm install --frozen-lockfile`) removed. Flag file `.install-done` no longer touched. Step numbering comment updated. Dependencies wait until orchestrate.mts.
13. `tests/setup.ts` — updated: `cleanupTestData()` deletes projects where `id != '00000000-0000-0000-0000-000000000003'` (preserve the seed project). `createTestApp()` gains optional `adminApiKey` parameter.
14. `tests/gateway/admin-projects-auth.test.ts` — new file. Tests auth middleware on every admin route.
15. `tests/gateway/admin-projects-create.test.ts` — new file. Tests `POST /admin/projects`.
16. `tests/gateway/admin-projects-read.test.ts` — new file. Tests `GET` list and by-id.
17. `tests/gateway/admin-projects-update.test.ts` — new file. Tests `PATCH`.
18. `tests/gateway/admin-projects-delete.test.ts` — new file. Tests `DELETE` including 409 active-task guard.
19. `tests/gateway/admin-projects-validation.test.ts` — new file. Tests Zod validation errors.
20. `tests/gateway/admin-projects-registry.test.ts` — new file. Tests the service module in isolation.
21. `tests/lib/repo-url.test.ts` — new file. Unit tests for `parseRepoOwnerAndName` and `normalizeRepoUrl`.
22. `tests/workers/install-runner.test.ts` — new file. Tests the install runner.
23. `tests/workers/tooling-config-install.test.ts` — new file. Tests `resolveToolingConfig` returns the `install` field and falls back to default.
24. `tests/gateway/jira-webhook-with-new-project.test.ts` — new file. Integration regression test: register project via API → send Jira webhook with matching key → task created and wired to the new project.
25. `.env.example` — updated: `ADMIN_API_KEY` entry with generation instructions (`openssl rand -hex 32`).
26. `README.md` — updated: new "Registering Projects" section + documented limitation that `GITHUB_TOKEN` must have access to every registered repo.
27. `AGENTS.md` — updated: bulletin on the admin API in the Commands table, mention of `ADMIN_API_KEY` in Environment Variables, and the loosened toolchain constraint.
28. `scripts/setup.ts` — updated: auto-generate `ADMIN_API_KEY` via `openssl rand -hex 32` if absent from `.env`, print once.

### Definition of Done

- [ ] `pnpm test -- --run` passes (zero regressions; 515+ existing tests still green)
- [ ] `pnpm lint` passes
- [ ] `pnpm build` compiles with zero errors
- [ ] `pnpm prisma migrate deploy` applies the new unique constraint cleanly
- [ ] Manual curl: `POST /admin/projects` with valid key + body returns 201 with project JSON
- [ ] Manual curl: `POST /admin/projects` without `X-Admin-Key` returns 401
- [ ] Manual curl: `POST /admin/projects` with duplicate `jira_project_key` returns 409
- [ ] Manual curl: `DELETE /admin/projects/:id` with active tasks returns 409 and lists offending task IDs
- [ ] E2E: register a new project via API → send a Jira webhook with the new `jira_project_key` → `pnpm trigger-task` completes successfully (or Docker-gated E2E confirms) against the new project
- [ ] Worker successfully runs install command from `tooling_config.install` for a project configured with `npm ci` (validated via unit test + tmux execution of mocked `orchestrate.mts`)
- [ ] Existing seeded test project (`jira_project_key: 'TEST'`) still works end-to-end with zero changes to its DB row
- [ ] `README.md` and `AGENTS.md` updated

### Must Have

- Authenticated admin REST API for project CRUD using `X-Admin-Key` header and `crypto.timingSafeEqual`
- Prisma migration adding `@@unique([jira_project_key, tenant_id])` on `projects`
- Shared `src/lib/repo-url.ts` module importable from both `src/gateway/` and `src/workers/`
- `ToolingConfig.install` field wired end-to-end from DB → worker execution
- Install command execution moved from `entrypoint.sh` to `orchestrate.mts`
- DELETE endpoint blocks with 409 if any tasks are in `Ready`/`Executing`/`Submitting` status
- Fail-fast startup if `ADMIN_API_KEY` is unset
- TDD coverage: unit tests for every new service/middleware/route + integration regression test
- Preservation of existing seeded project behavior (no changes to its data, no test regressions)
- Documentation updates: `README.md`, `AGENTS.md`, `.env.example`

### Must NOT Have (Guardrails)

- ❌ **Do NOT add a `tenant_id` request parameter or header.** `SYSTEM_TENANT_ID` constant only. No multi-tenant plumbing.
- ❌ **Do NOT add per-project `GITHUB_TOKEN` storage.** Keep global env var. Scope is explicitly out.
- ❌ **Do NOT add per-project `JIRA_WEBHOOK_SECRET` storage.** Keep global env var.
- ❌ **Do NOT add network calls (GitHub API, `git ls-remote`, DNS) inside registration-time validation.** Zod + URL format parse only.
- ❌ **Do NOT auto-detect package manager / lockfile in entrypoint.sh or orchestrate.mts.** Only use `tooling_config.install` (with pnpm fallback). User explicitly rejected auto-detection.
- ❌ **Do NOT modify `src/gateway/routes/jira.ts`, `src/gateway/routes/github.ts`, or `src/gateway/routes/health.ts`.** Zero diff to existing route files.
- ❌ **Do NOT modify `src/gateway/services/task-creation.ts` or `src/gateway/services/project-lookup.ts`.** These are untouched.
- ❌ **Do NOT modify the existing `prisma/seed.ts` upsert.** The seed remains the bootstrap path; admin API is additive.
- ❌ **Do NOT add soft-delete, versioning, `deleted_at`, `is_active`, or audit-log columns to the `projects` table.** Only the unique constraint.
- ❌ **Do NOT delete the seeded project in `cleanupTestData()`.** It must survive test runs (filter by `id != '00000000-0000-0000-0000-000000000003'`).
- ❌ **Do NOT cascade-cancel active tasks on DELETE.** Just return 409. Never touch the inngest lifecycle from the DELETE handler.
- ❌ **Do NOT introduce a new auth library** (no JWT, no OAuth, no passport). Only Node's built-in `crypto` module.
- ❌ **Do NOT introduce a new HTTP library or ORM.** Fastify + Prisma only, matching existing patterns.
- ❌ **Do NOT touch `src/inngest/*.ts`, `src/lib/github-client.ts`, or any file related to the worker fly.io dispatch path.** Out of scope.
- ❌ **Do NOT allow "Generated-by" / "Co-authored-by" / AI-reference lines in commit messages.** Per `AGENTS.md`.
- ❌ **Do NOT use `--no-verify` or skip any pre-commit hook.** Per `AGENTS.md`.
- ❌ **Do NOT use `as any`, `@ts-ignore`, `as unknown as Foo` casts, or empty `catch {}` blocks.** AI-slop pattern.
- ❌ **Do NOT add over-abstracted interfaces** ("BaseProjectServiceFactory", "AbstractProjectRepositoryInterface"). Use plain async functions matching `task-creation.ts` style.
- ❌ **Do NOT add verbose JSDoc to every function.** Match the existing codebase's sparse, purposeful comment style.
- ❌ **Do NOT add test coverage for existing routes "while you're at it".** Only test new code.
- ❌ **Do NOT log the `ADMIN_API_KEY` value.** Must be in the logger redaction pattern list.
- ❌ **Do NOT expose Prisma error details or stack traces in HTTP responses.** Error messages must be user-friendly, no DB internals.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests, `tests/setup.ts` helpers)
- **Automated tests**: TDD (RED → GREEN → REFACTOR per task)
- **Framework**: Vitest
- **TDD flow**: Each implementation task is preceded by a failing test task in the same wave (where possible) or at the start of the wave.

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Admin REST API**: Use `Bash (curl)` — send requests, assert status codes + JSON response fields against expected values.
- **Service/middleware/library units**: Use `Bash (bun test or vitest)` — run the specific test file, assert all pass.
- **Worker install command**: Use `Bash (bun/node REPL)` — import the install runner, invoke with a mock command, assert it runs + captures output.
- **E2E regression**: Use `Bash` — run the existing jira-webhook test suite, assert no regressions.

Every task must capture a concrete test-run log + the exact commands run.

---

## Execution Strategy

### Parallel Execution Waves

> Target 5–8 tasks per wave. Max concurrency ≈ 7. Split by module/concern: migrations and shared libs first, then independent vertical slices (service, middleware, validation, route per endpoint), then integration.

```
Wave 1 (foundation — start immediately, all independent):
├── Task 1: Prisma migration + regenerate client [quick]
├── Task 2: Shared repo-url module + worker re-export [quick]
├── Task 3: Zod schemas for admin-projects [quick]
├── Task 4: Admin auth middleware [quick]
├── Task 5: Extend cleanupTestData + createTestApp [quick]
├── Task 6: ADMIN_API_KEY env var + setup.ts auto-gen [quick]
└── Task 7: ToolingConfig.install field + default [quick]

Wave 2 (services and route stubs — all depend only on Wave 1):
├── Task  8: project-registry.createProject service [unspecified-low]
├── Task  9: project-registry.listProjects + getProjectById services [unspecified-low]
├── Task 10: project-registry.updateProject service [unspecified-low]
├── Task 11: project-registry.deleteProject service (with active-task guard) [unspecified-high]
├── Task 12: Install runner module (src/workers/lib/install-runner.ts) [unspecified-low]
└── Task 13: Server.ts startup validation for ADMIN_API_KEY [quick]

Wave 3 (routes + integration — depend on Wave 2):
├── Task 14: POST /admin/projects route [unspecified-low]
├── Task 15: GET /admin/projects + GET /admin/projects/:id routes [unspecified-low]
├── Task 16: PATCH /admin/projects/:id route [unspecified-low]
├── Task 17: DELETE /admin/projects/:id route [unspecified-low]
├── Task 18: Register adminProjectRoutes in server.ts [quick]
├── Task 19: Orchestrate.mts integration (call install-runner after resolveToolingConfig) [unspecified-high]
└── Task 20: Remove install step from entrypoint.sh [quick]

Wave 4 (docs + regression + rebuild — depend on Wave 3):
├── Task 21: Documentation updates (README, AGENTS.md, .env.example) [quick]
├── Task 22: E2E regression test (register project → webhook → task created) [unspecified-high]
└── Task 23: Rebuild Docker worker image + smoke test [quick]

Wave FINAL (after all tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T3/T4/T7 → T8 → T14 → T18 → T19 → T22 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

- **T1** (migration): depends on — ; blocks T8, T9, T10, T11, T14-T17
- **T2** (repo-url lib): depends on — ; blocks T3, T8, T14
- **T3** (Zod schemas): depends on T2 ; blocks T14-T17
- **T4** (auth middleware): depends on — ; blocks T14-T17
- **T5** (test helpers): depends on — ; blocks every test-writing task (T8-T17, T22)
- **T6** (env var + setup): depends on — ; blocks T13, T14-T17 (tests need key)
- **T7** (ToolingConfig field): depends on — ; blocks T12, T19
- **T8** (createProject): depends on T1, T2, T3, T5 ; blocks T14
- **T9** (list + get): depends on T1, T3, T5 ; blocks T15
- **T10** (updateProject): depends on T1, T3, T5 ; blocks T16
- **T11** (deleteProject): depends on T1, T3, T5 ; blocks T17
- **T12** (install runner): depends on T7 ; blocks T19
- **T13** (server.ts startup): depends on T6 ; blocks T18
- **T14** (POST route): depends on T4, T8, T13 ; blocks T18
- **T15** (GET routes): depends on T4, T9 ; blocks T18
- **T16** (PATCH route): depends on T4, T10 ; blocks T18
- **T17** (DELETE route): depends on T4, T11 ; blocks T18
- **T18** (register routes): depends on T14, T15, T16, T17 ; blocks T22
- **T19** (orchestrate integration): depends on T7, T12 ; blocks T20, T23
- **T20** (entrypoint.sh clean): depends on T19 ; blocks T23
- **T21** (docs): depends on T18, T20 ; blocks nothing
- **T22** (E2E regression): depends on T18, T20 ; blocks F3
- **T23** (Docker rebuild): depends on T20 ; blocks F3
- **F1-F4** (final verification): depends on T21, T22, T23 ; blocks user okay

### Agent Dispatch Summary

- **Wave 1**: 7 tasks → 6 × `quick`, 1 × `quick` (all simple, file-scoped)
- **Wave 2**: 6 tasks → 4 × `unspecified-low`, 1 × `unspecified-high` (T11: transaction + guard logic), 1 × `quick`
- **Wave 3**: 7 tasks → 4 × `unspecified-low`, 1 × `unspecified-high` (T19: orchestrate.mts restructure), 2 × `quick`
- **Wave 4**: 3 tasks → 1 × `quick`, 1 × `unspecified-high` (T22: integration test), 1 × `quick`
- **Final**: 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> Wave 1 (T1–T7) can start immediately and run in parallel.

- [x] 1. **Prisma migration: unique `(jira_project_key, tenant_id)` on projects**

  **What to do**:
  - Add `@@unique([jira_project_key, tenant_id])` to the `Project` model in `prisma/schema.prisma` (after line 127, inside the model block).
  - Run `pnpm prisma migrate dev --name unique_jira_project_key_per_tenant` to generate the migration SQL.
  - Verify the generated SQL in `prisma/migrations/{timestamp}_unique_jira_project_key_per_tenant/migration.sql` creates a `CREATE UNIQUE INDEX` (not a `CREATE TABLE`).
  - Run `pnpm prisma generate` to regenerate the client with the updated type.
  - Run existing test suite (`pnpm test -- --run`) to confirm no regressions from the schema change (the seed project has a unique key already, so this should be safe).

  **Must NOT do**:
  - Do NOT add any other columns or modify any other table.
  - Do NOT delete or modify existing migrations.
  - Do NOT add indexes to unrelated tables.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: single schema edit + migration generation + client regen. No logic work.
  - **Skills**: none
    - No skills needed — standard Prisma workflow.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2–T7)
  - **Blocks**: T8, T9, T10, T11, T14, T15, T16, T17 (all need the regenerated Prisma client)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:109-127` — `Project` model definition, where to add the `@@unique` directive
  - `prisma/schema.prisma:47` — example of existing `@@unique([external_id, source_system, tenant_id])` on the Task model — follow the same multi-column unique pattern

  **API/Type References**:
  - `prisma/schema.prisma:118` — current `tenant_id` default value — do not change this
  - `prisma/seed.ts:28-45` — seeded project uses `jira_project_key: 'TEST'` and `tenant_id` defaults — will not conflict with the unique constraint

  **External References**:
  - Prisma docs: `@@unique` attribute — https://www.prisma.io/docs/orm/reference/prisma-schema-reference#unique-1

  **WHY Each Reference Matters**:
  - The existing `@@unique` on Task (line 47) is the canonical pattern to mirror exactly — same Prisma syntax, same rationale (per-tenant uniqueness).
  - Don't touch `tenant_id` defaults because they're how single-tenant behavior is preserved.

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` contains `@@unique([jira_project_key, tenant_id])` in the `Project` model
  - [ ] New migration file exists in `prisma/migrations/` with name matching `*_unique_jira_project_key_per_tenant`
  - [ ] Migration SQL contains `CREATE UNIQUE INDEX` (verify by reading the file)
  - [ ] `pnpm prisma generate` completes without errors
  - [ ] `pnpm prisma migrate deploy` applies the migration cleanly against a fresh database
  - [ ] `pnpm test -- --run` passes with zero new failures

  **QA Scenarios**:

  ```
  Scenario: Migration applies cleanly to fresh DB
    Tool: Bash
    Preconditions: Docker Compose running with fresh ai_employee database
    Steps:
      1. Run: pnpm prisma migrate reset --force --skip-seed
      2. Run: pnpm prisma migrate deploy
      3. Assert exit code: 0
      4. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d+ projects" | grep "jira_project_key_tenant_id_key"
      5. Assert the unique index exists on the projects table
    Expected Result: Migration applies, unique index exists, exit code 0.
    Failure Indicators: Migration error, missing index, or "relation projects does not exist".
    Evidence: .sisyphus/evidence/task-1-migration-apply.log

  Scenario: Duplicate insert via Prisma raises P2002
    Tool: Bash (bun/node REPL)
    Preconditions: Migration applied; seed project exists
    Steps:
      1. Create a temporary test script that uses PrismaClient to insert a second project with `jira_project_key: 'TEST'` (same as seed)
      2. Run the script
      3. Assert the insert throws a Prisma error with `code === 'P2002'` and `meta.target` includes both `jira_project_key` and `tenant_id`
    Expected Result: Prisma throws P2002 unique constraint error.
    Failure Indicators: Insert succeeds (means no constraint), or throws a different error code.
    Evidence: .sisyphus/evidence/task-1-duplicate-error.log
  ```

  **Evidence to Capture**:
  - [ ] Migration file content dump
  - [ ] `psql` output showing the unique index
  - [ ] Duplicate-insert error log

  **Commit**: YES
  - Message: `feat(db): add unique index on projects.jira_project_key per tenant`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*_unique_jira_project_key_per_tenant/migration.sql`
  - Pre-commit: `pnpm lint && pnpm prisma validate`

- [x] 2. **Extract `parseRepoOwnerAndName` into shared `src/lib/repo-url.ts`**

  **What to do**:
  - Create `src/lib/repo-url.ts` with two exported functions:
    - `normalizeRepoUrl(url: string): string` — strips trailing `.git`, trims whitespace, returns normalized form.
    - `parseRepoOwnerAndName(url: string): { owner: string; repo: string }` — accepts HTTPS GitHub URLs (with or without `.git`), throws `Error` with a clear message on malformed input. Internally calls `normalizeRepoUrl`.
  - Regex must match: `^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$` (same as existing, but verify the non-greedy `?` behavior on `.git` suffix).
  - Write unit tests first (TDD) in `tests/lib/repo-url.test.ts`:
    - Parses `https://github.com/owner/repo`
    - Parses `https://github.com/owner/repo.git`
    - Normalizes trailing whitespace
    - Throws on `http://` (not https)
    - Throws on `git@github.com:owner/repo.git` (SSH, not supported)
    - Throws on `https://gitlab.com/owner/repo`
    - Throws on empty string
    - Throws on `https://github.com/owner` (missing repo)
  - Update `src/workers/lib/project-config.ts` to re-export from the new shared module: `export { parseRepoOwnerAndName, normalizeRepoUrl } from '../../lib/repo-url.js';` and REMOVE the local implementation (lines 56-68). Keep the existing `ProjectConfig` interface and `fetchProjectConfig` function untouched.

  **Must NOT do**:
  - Do NOT add SSH URL support, GitLab support, or Bitbucket support.
  - Do NOT add a synchronous network call to validate the URL resolves.
  - Do NOT rename `parseRepoOwnerAndName` — other files may import it.
  - Do NOT modify `fetchProjectConfig` or other exports in `project-config.ts` beyond the re-export.
  - Do NOT add any new dependencies.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure refactor, small file move, unit tests trivial.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3–T7)
  - **Blocks**: T3 (Zod schemas import this), T8 (createProject service uses it), T14 (POST route uses it)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/project-config.ts:56-68` — the current implementation of `parseRepoOwnerAndName` to extract verbatim (plus `.git` normalization improvement)
  - `src/lib/logger.ts` — example of a simple shared `src/lib/` module (function exports, minimal dependencies)
  - `src/lib/errors.ts` — pattern for throwing domain errors

  **Test References**:
  - `tests/workers/` — existing worker test patterns (Vitest, plain function imports)
  - `tests/gateway/jira-webhook.test.ts:27-41` — `beforeEach/afterEach` structure (not needed here since this is a pure unit test, but useful reference)

  **External References**:
  - Node.js `URL` class (WHATWG URL) — https://nodejs.org/api/url.html — could be used as an alternative to regex, but the existing regex approach is simpler and matches the existing convention

  **WHY Each Reference Matters**:
  - The existing regex at `project-config.ts:58` is the source of truth — copy it exactly, only add the whitespace trim and make `.git` stripping explicit.
  - `src/lib/logger.ts` shows the project's pattern for tiny shared modules: a `createLogger` factory exported by name.

  **Acceptance Criteria**:
  - [ ] `src/lib/repo-url.ts` exists with `parseRepoOwnerAndName` and `normalizeRepoUrl` exports
  - [ ] `tests/lib/repo-url.test.ts` exists with at least 8 test cases (listed above)
  - [ ] All tests pass via `pnpm test -- --run tests/lib/repo-url.test.ts`
  - [ ] `src/workers/lib/project-config.ts` re-exports from the new module and does NOT contain a local `parseRepoOwnerAndName` implementation
  - [ ] `pnpm build` succeeds (verifies no existing imports break)
  - [ ] `pnpm test -- --run` passes with zero regressions

  **QA Scenarios**:

  ```
  Scenario: Happy path parse
    Tool: Bash
    Preconditions: Module implemented
    Steps:
      1. Run: pnpm test -- --run tests/lib/repo-url.test.ts
      2. Assert all 8+ tests pass
      3. Capture output
    Expected Result: All tests PASS, exit code 0.
    Failure Indicators: Any FAIL, or exit code != 0.
    Evidence: .sisyphus/evidence/task-2-repo-url-tests.log

  Scenario: Re-export does not break worker imports
    Tool: Bash
    Preconditions: project-config.ts updated
    Steps:
      1. Run: pnpm tsc --noEmit
      2. Assert exit code 0
      3. Run: pnpm test -- --run tests/workers/
      4. Assert no new failures
    Expected Result: Build clean, worker tests still pass.
    Failure Indicators: TypeScript errors, missing exports, worker test regressions.
    Evidence: .sisyphus/evidence/task-2-build-and-worker-tests.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log showing all cases passing
  - [ ] `tsc --noEmit` clean output

  **Commit**: YES
  - Message: `refactor(lib): extract repo-url parsing into src/lib for gateway reuse`
  - Files: `src/lib/repo-url.ts`, `tests/lib/repo-url.test.ts`, `src/workers/lib/project-config.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/lib/repo-url.test.ts`

- [x] 3. **Zod schemas for admin project CRUD**

  **What to do**:
  - Append to `src/gateway/validation/schemas.ts` (do NOT modify existing schemas):
    - `ToolingConfigSchema` — Zod object with optional string fields: `install`, `typescript`, `lint`, `unit`, `integration`, `e2e`. All optional. `.strict()` mode to reject unknown keys.
    - `CreateProjectSchema` — required `name` (non-empty string), required `repo_url` (string, `.refine()` using `parseRepoOwnerAndName` from `src/lib/repo-url.js` to validate format), required `jira_project_key` (non-empty string), optional `default_branch` (string, default `"main"`), optional `concurrency_limit` (int, default `3`), optional `tooling_config` (`ToolingConfigSchema`).
    - `UpdateProjectSchema` — same as `CreateProjectSchema` but ALL fields optional (partial update semantics for PATCH). `repo_url` still refined when present.
  - Export matching types: `type CreateProjectInput = z.infer<typeof CreateProjectSchema>`, `type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>`, `type ToolingConfigInput = z.infer<typeof ToolingConfigSchema>`.
  - Export parse helpers: `parseCreateProject(body: unknown): CreateProjectInput`, `parseUpdateProject(body: unknown): UpdateProjectInput`.
  - Write unit tests FIRST (TDD) in `tests/gateway/admin-projects-validation.test.ts`: valid create, valid update (partial), missing required fields, invalid URL format, unknown `tooling_config` keys rejected, empty strings rejected for required fields.

  **Must NOT do**:
  - Do NOT modify or rename existing Jira/GitHub schemas.
  - Do NOT add `tenant_id` as a request field (it's hardcoded server-side).
  - Do NOT add `id` as a request field (Prisma generates it).
  - Do NOT add `created_at`, `updated_at` as request fields (Prisma manages them).
  - Do NOT do network calls in `.refine()` — only sync format parsing via the new `parseRepoOwnerAndName`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition matching an existing pattern — mostly copy-paste + small parse helper. TDD tests are standard Zod assertions.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4–T7)
  - **Blocks**: T14–T17 (routes import these schemas)
  - **Blocked By**: T2 (needs `parseRepoOwnerAndName` from the new shared module)

  **References**:

  **Pattern References**:
  - `src/gateway/validation/schemas.ts:42-96` — canonical Zod schema + type + parse helper pattern (JiraWebhookSchema / parseJiraWebhook). Match this exactly.
  - `src/gateway/validation/schemas.ts` — existing `.passthrough()` and `.strict()` usage

  **API/Type References**:
  - `prisma/schema.prisma:109-127` — Project model, source of truth for all field names and types
  - `src/workers/lib/task-context.ts:10-16` — existing `ToolingConfig` interface in the worker — schema field names must match exactly (`install`, `typescript`, `lint`, `unit`, `integration`, `e2e`)

  **Test References**:
  - `tests/gateway/jira-webhook.test.ts` — Vitest test pattern for schema validation (request → parse → assert either success or ZodError)

  **External References**:
  - Zod docs: `.refine()` with custom error messages — https://zod.dev/?id=refine

  **WHY Each Reference Matters**:
  - Matching `ToolingConfig` field names ensures the schema is the same shape the worker already consumes — no translation layer needed.
  - Following the `parseJiraWebhook` pattern (line 94-96) gives a uniform error surface across all route handlers.

  **Acceptance Criteria**:
  - [ ] `src/gateway/validation/schemas.ts` contains `CreateProjectSchema`, `UpdateProjectSchema`, `ToolingConfigSchema` and their type exports and parse helpers
  - [ ] `tests/gateway/admin-projects-validation.test.ts` exists with at least 10 test cases
  - [ ] All new tests pass via `pnpm test -- --run tests/gateway/admin-projects-validation.test.ts`
  - [ ] `pnpm build` succeeds
  - [ ] No modifications to existing schemas (verified via `git diff` on `schemas.ts` — only additions)

  **QA Scenarios**:

  ```
  Scenario: Valid payload parses cleanly
    Tool: Bash
    Preconditions: Schemas implemented
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-projects-validation.test.ts
      2. Assert all tests pass
    Expected Result: All tests PASS.
    Failure Indicators: Any FAIL.
    Evidence: .sisyphus/evidence/task-3-validation-tests.log

  Scenario: Invalid URL rejected
    Tool: Bash (bun/node REPL)
    Preconditions: Schemas exported
    Steps:
      1. Create inline script: const { parseCreateProject } = await import('./src/gateway/validation/schemas.js'); try { parseCreateProject({ name: 'x', repo_url: 'not-a-url', jira_project_key: 'X' }); } catch (e) { console.log(e.issues); }
      2. Run via `pnpm tsx -e "..."` or inline test
      3. Assert a ZodError with issue path `['repo_url']`
    Expected Result: ZodError thrown with specific repo_url issue.
    Failure Indicators: No error thrown, or error on wrong field.
    Evidence: .sisyphus/evidence/task-3-invalid-url.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log
  - [ ] Inline script error output

  **Commit**: YES
  - Message: `feat(gateway): add Zod schemas for admin project CRUD requests`
  - Files: `src/gateway/validation/schemas.ts`, `tests/gateway/admin-projects-validation.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-validation.test.ts`

- [x] 4. **Admin auth middleware: `requireAdminKey`**

  **What to do**:
  - Create `src/gateway/middleware/admin-auth.ts`.
  - Export `requireAdminKey: preHandlerHookHandler` — a Fastify `preHandler` hook that:
    1. Reads `request.headers['x-admin-key']` as string (if not string → reject 401).
    2. Reads `process.env.ADMIN_API_KEY` — if missing throw startup error (but startup validation in T13 will prevent this; this is belt-and-suspenders).
    3. Converts both to `Buffer.from(value, 'utf8')`.
    4. LENGTH CHECK FIRST — if `provided.length !== expected.length`, reply 401 and return (do NOT call `timingSafeEqual`, which throws on unequal lengths).
    5. Call `crypto.timingSafeEqual(provided, expected)` — if false, reply 401 and return.
    6. If valid, do not modify the request — just `return` to let the handler proceed.
  - 401 response body: `{ error: 'Unauthorized' }`. Do NOT disclose whether the key was missing, wrong length, or wrong value.
  - Log auth failures with `request.log.warn({ url: request.url }, 'Admin auth failed')`. Never log the provided key or the expected key.
  - Write tests FIRST (TDD) in `tests/gateway/admin-projects-auth.test.ts`:
    - Missing header → 401
    - Header present but wrong value → 401
    - Header present but wrong length → 401 (does NOT throw)
    - Correct header → preHandler allows the request to proceed (use a dummy route to verify)
    - Array header (multiple values) → 401
    - Empty string header → 401

  **Must NOT do**:
  - Do NOT use `string === string` comparison for the key (timing attack).
  - Do NOT log the provided key or expected key in any log statement.
  - Do NOT throw from inside the hook — always use `reply.status(401).send(...)`.
  - Do NOT attach auth metadata to the request object (no `request.isAdmin = true` — handler doesn't need it).
  - Do NOT read `ADMIN_API_KEY` on every request via `process.env` repeatedly — cache it once at module load into a local `const EXPECTED_KEY = Buffer.from(process.env.ADMIN_API_KEY ?? '', 'utf8')`. But re-read if you detect test/isolation issues — check what tests need.
  - Do NOT introduce a new auth library (no `fastify-bearer-auth`, `passport`, `jose`).

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function, well-known Node crypto API, clear TDD path.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1–T3, T5–T7)
  - **Blocks**: T14, T15, T16, T17 (all admin routes use this hook)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/validation/signature.ts` — existing HMAC verification pattern for the Jira webhook; good reference for security-sensitive comparison idioms and how to handle header string extraction
  - `src/gateway/routes/jira.ts:23-31` — example of reading a header and rejecting with 401 inline (pre-hook pattern will wrap this)

  **API/Type References**:
  - Node.js `crypto.timingSafeEqual` — https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b — note the length mismatch throw
  - Fastify `preHandler` hook types — https://fastify.dev/docs/latest/Reference/Hooks/#prehandler

  **Test References**:
  - `tests/gateway/jira-webhook.test.ts:27-41` — Fastify test app pattern
  - `tests/setup.ts:62-75` — `createTestApp()` factory that will need an `adminApiKey` option (added in T5)

  **External References**:
  - OWASP: Timing-safe string comparison in Node — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

  **WHY Each Reference Matters**:
  - The existing HMAC validator at `signature.ts` already handles the "read header, compare securely, reject 401" flow — study its exact idioms and mirror them.
  - Fastify's hook types are strict — must return the correct `Promise<void>` shape to avoid TypeScript errors.

  **Acceptance Criteria**:
  - [ ] `src/gateway/middleware/admin-auth.ts` exists and exports `requireAdminKey`
  - [ ] `tests/gateway/admin-projects-auth.test.ts` has at least 6 test cases (listed above)
  - [ ] All tests pass via `pnpm test -- --run tests/gateway/admin-projects-auth.test.ts`
  - [ ] No log statements anywhere in `admin-auth.ts` reference the actual key values
  - [ ] Length-mismatch test explicitly verifies no throw occurs
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: Correct key allows request through
    Tool: Bash
    Preconditions: Middleware implemented, test route wired in test app
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-projects-auth.test.ts
      2. Assert all tests PASS
    Expected Result: All tests pass including the "correct key" case.
    Evidence: .sisyphus/evidence/task-4-auth-tests.log

  Scenario: Length mismatch does not throw
    Tool: Bash (bun/node REPL)
    Preconditions: Middleware exported
    Steps:
      1. Create inline script that invokes the hook with a fake request whose header is a shorter or longer string than ADMIN_API_KEY
      2. Assert no exception propagates; reply.status(401) was called
    Expected Result: 401 returned cleanly, no ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH thrown.
    Failure Indicators: Unhandled exception or different status code.
    Evidence: .sisyphus/evidence/task-4-length-mismatch.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log
  - [ ] Length mismatch evidence script output

  **Commit**: YES
  - Message: `feat(gateway): add requireAdminKey middleware with timing-safe compare`
  - Files: `src/gateway/middleware/admin-auth.ts`, `tests/gateway/admin-projects-auth.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-auth.test.ts`

- [x] 5. **Extend `cleanupTestData()` and `createTestApp()` for admin tests**

  **What to do**:
  - Update `tests/setup.ts`:
    - `cleanupTestData()`: add `await prisma.project.deleteMany({ where: { id: { not: '00000000-0000-0000-0000-000000000003' } } });` AS THE LAST deletion (after tasks, so FK constraints don't block).
    - `createTestApp({ inngest, adminApiKey })`: add a new optional `adminApiKey` option (type: `string | undefined`). When provided, set `process.env.ADMIN_API_KEY = adminApiKey` BEFORE calling `buildApp`. Restore the previous value in `afterEach` via the caller's responsibility (document this).
    - Export a new helper: `ADMIN_TEST_KEY` constant (e.g., `'test-admin-key-do-not-use-in-prod'`) for consistent use across admin tests.
  - Ensure the deletion order in `cleanupTestData()` respects FK dependencies: `task_status_log` → `clarifications` → `cross_dept_triggers` → `audit_log` → `feedback` → `reviews` → `deliverables` → `validation_runs` → `executions` → `tasks` → `projects` (projects last).
  - Do NOT add project cleanup if the existing cleanup already handles tasks referencing projects — verify the sequence is safe.
  - Write a quick unit test in `tests/setup.test.ts` (or inline in an existing test file) that creates 2 projects (one with the seed ID, one with a new ID), runs `cleanupTestData()`, and asserts only the seed project survives.

  **Must NOT do**:
  - Do NOT delete the seed project (`id: '00000000-0000-0000-0000-000000000003'`). Existing tests depend on it.
  - Do NOT change the existing deletion order for task-related tables.
  - Do NOT add cleanup for other tables we don't own in this scope.
  - Do NOT mutate `process.env` without a mechanism to restore it (document caller responsibility).

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test helper tweak with a clear assertion.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8, T9, T10, T11, T14–T17, T22 (every test-writing task needs the updated helper)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tests/setup.ts:15-28` — current `cleanupTestData` implementation
  - `tests/setup.ts:62-75` — current `createTestApp` factory
  - `tests/setup.ts:7-12` — Prisma singleton pattern

  **API/Type References**:
  - `prisma/seed.ts:28-45` — shows the seed project ID literal to preserve

  **Test References**:
  - `tests/gateway/jira-webhook.test.ts:27-41` — example of beforeEach/afterEach using `createTestApp` + `cleanupTestData`

  **WHY Each Reference Matters**:
  - The cleanup order in the existing helper is carefully sequenced to avoid FK violations — the new project delete must be appended without disturbing that order.

  **Acceptance Criteria**:
  - [ ] `tests/setup.ts` has the project cleanup filtered by ID
  - [ ] `createTestApp()` accepts an optional `adminApiKey` parameter
  - [ ] An assertion test verifies only the seed project survives cleanup
  - [ ] All 515+ existing tests still pass (`pnpm test -- --run`)
  - [ ] `ADMIN_TEST_KEY` constant exported from setup.ts

  **QA Scenarios**:

  ```
  Scenario: Test cleanup preserves seed project
    Tool: Bash
    Preconditions: Setup helper updated
    Steps:
      1. Run: pnpm test -- --run tests/setup.test.ts
      2. Assert test "preserves seed project on cleanup" passes
    Expected Result: PASS.
    Evidence: .sisyphus/evidence/task-5-cleanup-test.log

  Scenario: All existing tests still pass
    Tool: Bash
    Preconditions: Setup helper updated, Docker Compose running
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/task-5-full-suite.log
      2. Count passes/failures in the output
    Expected Result: Zero new failures, at least 515 passing (existing known failures like container-boot.test.ts may still fail — do NOT count those as regressions).
    Failure Indicators: Any new failure that was passing before.
    Evidence: .sisyphus/evidence/task-5-full-suite.log
  ```

  **Evidence to Capture**:
  - [ ] Cleanup assertion test log
  - [ ] Full-suite test log with pass/fail counts

  **Commit**: YES
  - Message: `test(setup): extend cleanupTestData to handle admin-created projects`
  - Files: `tests/setup.ts`, `tests/setup.test.ts` (if new)
  - Pre-commit: `pnpm lint && pnpm test -- --run`

- [x] 6. **Add `ADMIN_API_KEY` env var and auto-generate in setup.ts**

  **What to do**:
  - Update `.env.example`:
    ```
    # Admin API key for /admin/projects endpoints (generate with: openssl rand -hex 32)
    ADMIN_API_KEY=
    ```
    Place it near `JIRA_WEBHOOK_SECRET` for logical grouping.
  - Update `scripts/setup.ts` (the `pnpm setup` entrypoint):
    - After the Docker Compose start step, add a step that:
      1. Reads `.env` file (if it exists).
      2. If `ADMIN_API_KEY` is missing OR empty, generate one via `openssl rand -hex 32` (use `child_process.execFileSync`).
      3. Append `ADMIN_API_KEY=<value>` to `.env` (do NOT rewrite existing content).
      4. `console.log` a clear message: `ADMIN_API_KEY generated and written to .env. This key is required for admin endpoint access.`
    - If `ADMIN_API_KEY` already exists and is non-empty, skip silently.
  - Update `src/lib/logger.ts` to add `ADMIN_API_KEY` and `*.ADMIN_API_KEY` to the redaction pattern list (check lines around 15 where `GITHUB_TOKEN` is redacted).

  **Must NOT do**:
  - Do NOT write the generated key to stdout more than once (security: reduce log exposure).
  - Do NOT commit a real `ADMIN_API_KEY` value anywhere in the repo.
  - Do NOT overwrite an existing `ADMIN_API_KEY` in `.env`, even if empty string (let operator fill it in) — actually, DO overwrite if empty, per spec above. Reconfirm: empty string counts as missing and is auto-generated. Populated counts as set.
  - Do NOT require `openssl` binary without a fallback — if `openssl` isn't available, use Node's `crypto.randomBytes(32).toString('hex')` instead. Implement the `crypto` fallback.
  - Do NOT mutate `.env` during test runs.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file-append script + logger redaction list addition.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T13 (startup validation needs the env var), T14–T17 (tests need a valid key)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.env.example` — existing env var declaration style
  - `scripts/setup.ts` — existing setup steps (Docker start, Prisma migrate, seed) — append to the end, follow the same logging style
  - `src/lib/logger.ts` — redaction pattern list (search for `GITHUB_TOKEN` to find the array)
  - `scripts/trigger-task.ts` or any other `scripts/*.ts` for the `tsx` + `execFileSync` pattern

  **API/Type References**:
  - Node `crypto.randomBytes(32).toString('hex')` — 64-character hex string

  **WHY Each Reference Matters**:
  - Matching the existing `.env.example` comment style (comment above each var) keeps docs consistent.
  - The logger redaction prevents the key from ever appearing in error logs or diagnostic dumps.

  **Acceptance Criteria**:
  - [ ] `.env.example` contains `ADMIN_API_KEY=` with comment
  - [ ] `scripts/setup.ts` has a step that auto-generates the key if missing/empty
  - [ ] Setup step uses `crypto.randomBytes` fallback if `openssl` is not on PATH
  - [ ] `src/lib/logger.ts` redaction list includes `ADMIN_API_KEY` and `*.ADMIN_API_KEY`
  - [ ] Running `pnpm setup` against a fresh clone without `ADMIN_API_KEY` in `.env` adds it

  **QA Scenarios**:

  ```
  Scenario: Auto-generation on fresh clone
    Tool: Bash
    Preconditions: `.env` exists without ADMIN_API_KEY (backup the real .env first!)
    Steps:
      1. cp .env .env.backup
      2. sed -i '' '/^ADMIN_API_KEY=/d' .env || true
      3. Run: pnpm tsx scripts/setup.ts (or the specific function that generates the key)
      4. Assert: grep -q "^ADMIN_API_KEY=[a-f0-9]\\{64\\}$" .env
      5. Restore: mv .env.backup .env
    Expected Result: 64-char hex key present.
    Failure Indicators: Empty value, wrong length, or no line added.
    Evidence: .sisyphus/evidence/task-6-auto-gen.log

  Scenario: Preserves existing key
    Tool: Bash
    Preconditions: `.env` already has a real ADMIN_API_KEY
    Steps:
      1. Note current value: CURRENT=$(grep '^ADMIN_API_KEY=' .env)
      2. Run: pnpm tsx scripts/setup.ts
      3. Assert: grep -q "^$CURRENT$" .env
    Expected Result: Existing key unchanged.
    Failure Indicators: Key was rewritten.
    Evidence: .sisyphus/evidence/task-6-preserve.log
  ```

  **Evidence to Capture**:
  - [ ] Generation log
  - [ ] Preservation log

  **Commit**: YES
  - Message: `feat(env): introduce ADMIN_API_KEY with setup auto-generation`
  - Files: `.env.example`, `scripts/setup.ts`, `src/lib/logger.ts`
  - Pre-commit: `pnpm lint && pnpm build`

- [x] 7. **Add `install` field to `ToolingConfig` interface and `DEFAULT_TOOLING_CONFIG`**

  **What to do**:
  - Update `src/workers/lib/task-context.ts`:
    - Extend the `ToolingConfig` interface (lines 10-16) with `install?: string;` as an optional field.
    - Extend `DEFAULT_TOOLING_CONFIG` (lines 22-27) with `install: "pnpm install --frozen-lockfile"` to preserve current behavior.
    - Verify `resolveToolingConfig()` (lines 211-221) already merges correctly (spread-based merge should pass through the new field — no changes needed, but add a test to confirm).
  - Write tests FIRST (TDD) in `tests/workers/tooling-config-install.test.ts`:
    - `resolveToolingConfig({tooling_config: null})` returns `install: "pnpm install --frozen-lockfile"`
    - `resolveToolingConfig({tooling_config: {}})` returns `install: "pnpm install --frozen-lockfile"` (empty object = all defaults)
    - `resolveToolingConfig({tooling_config: {install: "npm ci"}})` returns `install: "npm ci"`
    - `resolveToolingConfig({tooling_config: {install: "bun install --frozen-lockfile"}})` returns `install: "bun install --frozen-lockfile"`
    - Other default fields (`typescript`, `lint`, `unit`) are preserved when install is overridden
    - Unknown fields in the JSON are dropped (not leaked into the resolved config) — or are passed through depending on current behavior; read the existing implementation and document the behavior.

  **Must NOT do**:
  - Do NOT modify `validation-pipeline.ts` or `fix-loop.ts` — `install` is handled by the new runner in T12 and called from orchestrate.mts in T19. NOT part of the validation pipeline.
  - Do NOT add `install` to `STAGE_ORDER` in `validation-pipeline.ts:71` — it's not a validation stage.
  - Do NOT change the signature of `resolveToolingConfig`.
  - Do NOT rename `DEFAULT_TOOLING_CONFIG`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Tiny interface + default tweak, TDD tests trivial.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T12 (install runner references the field), T19 (orchestrate reads it)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/task-context.ts:10-16` — `ToolingConfig` interface definition
  - `src/workers/lib/task-context.ts:22-27` — `DEFAULT_TOOLING_CONFIG` constant
  - `src/workers/lib/task-context.ts:211-221` — `resolveToolingConfig` merge logic (to verify it handles the new field without code changes)

  **API/Type References**:
  - `src/workers/entrypoint.sh:104` — the current hardcoded `pnpm install --frozen-lockfile` that this field will eventually replace (in T20)

  **Test References**:
  - `tests/workers/` — existing worker unit test patterns (Vitest, plain Prisma-free tests where possible)

  **WHY Each Reference Matters**:
  - The field name MUST match what the orchestrate.mts integration (T19) and install-runner (T12) will consume — don't rename to `install_command` or similar.
  - Keeping `install: "pnpm install --frozen-lockfile"` as the default ensures the seeded project (which has `tooling_config: null`) continues to work unchanged.

  **Acceptance Criteria**:
  - [ ] `ToolingConfig` interface has `install?: string`
  - [ ] `DEFAULT_TOOLING_CONFIG.install === "pnpm install --frozen-lockfile"`
  - [ ] Test file with 5+ cases passes
  - [ ] No changes to `validation-pipeline.ts` or `fix-loop.ts`
  - [ ] `pnpm build` succeeds

  **QA Scenarios**:

  ```
  Scenario: Default install fallback
    Tool: Bash
    Preconditions: Interface updated, test file exists
    Steps:
      1. Run: pnpm test -- --run tests/workers/tooling-config-install.test.ts
      2. Assert all cases pass
    Expected Result: All PASS.
    Evidence: .sisyphus/evidence/task-7-tooling-install.log

  Scenario: Override precedence
    Tool: Bash (bun/node REPL)
    Preconditions: Module importable
    Steps:
      1. Inline script: const { resolveToolingConfig } = await import('./dist/workers/lib/task-context.js'); console.log(resolveToolingConfig({ tooling_config: { install: "npm ci" }}).install);
      2. Assert output: "npm ci"
    Expected Result: "npm ci" printed.
    Evidence: .sisyphus/evidence/task-7-override.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log
  - [ ] Override confirmation log

  **Commit**: YES
  - Message: `feat(worker): add install field to ToolingConfig interface and default`
  - Files: `src/workers/lib/task-context.ts`, `tests/workers/tooling-config-install.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/workers/tooling-config-install.test.ts`

- [x] 8. **`project-registry.createProject` service**

  **What to do**:
  - Create `src/gateway/services/project-registry.ts` with a first exported function `createProject(params: { input: CreateProjectInput; tenantId: string; prisma: PrismaClient; }): Promise<Project>`.
  - Function contract:
    1. Normalize `repo_url` via `normalizeRepoUrl` from `src/lib/repo-url.js` (strips `.git`, trims).
    2. Call `prisma.project.create({ data: { ...input, repo_url: normalized, tenant_id: tenantId } })`.
    3. Catch Prisma `P2002` unique constraint violation → re-throw as a typed application error `ProjectRegistryConflictError` with field `'jira_project_key'`. Define this error class locally in the same file (extends `Error`, has a `code: 'CONFLICT'` property) OR use `src/lib/errors.ts` if a conflict class already exists there (check first).
    4. Return the created `Project` row.
  - Write tests FIRST (TDD) in `tests/gateway/admin-projects-registry.test.ts`:
    - Create with all required fields → returns Project with generated id
    - Create with optional `tooling_config` → persists JSON correctly
    - Create with trailing `.git` in `repo_url` → stored without `.git`
    - Create with duplicate `jira_project_key` (seed project) → throws `ProjectRegistryConflictError` with field `'jira_project_key'`
    - Create with missing required field in the service layer (bypassing Zod) → Prisma throws, do NOT catch this (propagates naturally)
  - Tests use real Prisma against the local DB + `cleanupTestData` afterEach.

  **Must NOT do**:
  - Do NOT parse the repo_url in the service — that's Zod's job (T3). Only normalize.
  - Do NOT accept `tenant_id` from user input. The service param is explicit; callers pass `SYSTEM_TENANT_ID`.
  - Do NOT call `prisma.project.findFirst` before insert as a duplicate check — let the DB constraint do it (race-safe).
  - Do NOT emit Inngest events (no lifecycle trigger on project create).
  - Do NOT log the full input body at info level (may contain semi-sensitive repo URLs). Log at `debug` with `{ jira_project_key, name }` only.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Standard service function mirroring `task-creation.ts` style. TDD tests are Prisma-heavy but patterns exist.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with T9, T10, T11, T12, T13)
  - **Blocks**: T14 (POST route)
  - **Blocked By**: T1 (Prisma client regen), T2 (repo-url import), T3 (type), T5 (test helpers)

  **References**:

  **Pattern References**:
  - `src/gateway/services/task-creation.ts:47-90` — canonical service module pattern: exported async function, takes `{ params, prisma }`, uses `prisma.*.create()` / `prisma.*.findFirst()`
  - `src/gateway/services/task-creation.ts:17` — how `SYSTEM_TENANT_ID` is imported/used in services
  - `src/lib/errors.ts` — check if a ConflictError class already exists before creating a new one

  **API/Type References**:
  - `src/gateway/validation/schemas.ts` — `CreateProjectInput` type (from T3)
  - `prisma/schema.prisma:109-127` — Project model, exact field names
  - Prisma error codes: https://www.prisma.io/docs/orm/reference/error-reference#p2002

  **Test References**:
  - `tests/gateway/jira-webhook.test.ts:27-41` — beforeEach/afterEach pattern
  - `tests/setup.ts` — `getPrisma()` singleton, `cleanupTestData()`

  **WHY Each Reference Matters**:
  - `task-creation.ts` is the exact right template: same style of pure function, same Prisma usage, same SYSTEM_TENANT_ID pattern.
  - Catching `P2002` at the service layer (not the route layer) keeps the route handler generic and testable.

  **Acceptance Criteria**:
  - [ ] `src/gateway/services/project-registry.ts` exists with `createProject` exported
  - [ ] `ProjectRegistryConflictError` class is defined (or reused from `src/lib/errors.ts`)
  - [ ] `tests/gateway/admin-projects-registry.test.ts` has at least 5 test cases for createProject
  - [ ] Tests pass: `pnpm test -- --run tests/gateway/admin-projects-registry.test.ts`
  - [ ] Duplicate `jira_project_key` test passes (validates T1 migration + conflict handling)

  **QA Scenarios**:

  ```
  Scenario: Happy path create
    Tool: Bash
    Preconditions: Migration applied, test helpers ready
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-projects-registry.test.ts -t "createProject"
      2. Assert all createProject tests pass
    Expected Result: PASS.
    Evidence: .sisyphus/evidence/task-8-create-tests.log

  Scenario: Duplicate key rejected
    Tool: Bash (inline test)
    Preconditions: Seed project exists with jira_project_key='TEST'
    Steps:
      1. Inline script creates a new project with jira_project_key='TEST'
      2. Assert throws ProjectRegistryConflictError
      3. Assert error.code === 'CONFLICT' and error.field === 'jira_project_key'
    Expected Result: Error thrown with correct shape.
    Failure Indicators: No error, or wrong error type.
    Evidence: .sisyphus/evidence/task-8-duplicate.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log
  - [ ] Duplicate-rejection log

  **Commit**: YES
  - Message: `feat(gateway): implement createProject registry service with TDD`
  - Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`, possibly `src/lib/errors.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-registry.test.ts`

- [x] 9. **`project-registry.listProjects` and `getProjectById` services**

  **What to do**:
  - Append to `src/gateway/services/project-registry.ts`:
    - `listProjects(params: { tenantId: string; prisma: PrismaClient; limit?: number; offset?: number; }): Promise<Project[]>` — returns projects filtered by tenant, ordered by `created_at DESC`. Default `limit: 50`, `offset: 0`. Enforce `limit <= 200` (clamp silently).
    - `getProjectById(params: { id: string; tenantId: string; prisma: PrismaClient; }): Promise<Project | null>` — returns the project or null if not found (scoped by tenant).
  - Append test cases to `tests/gateway/admin-projects-registry.test.ts`:
    - `listProjects()` returns empty array on empty DB (after cleanup, seed project should appear)
    - `listProjects()` returns projects in `created_at DESC` order
    - `listProjects({limit: 2})` respects limit
    - `listProjects({limit: 500})` clamps to 200
    - `getProjectById({id: '<seed>'})` returns the seed project
    - `getProjectById({id: '<non-existent>'})` returns null
    - `getProjectById` with wrong tenantId returns null (even if the id exists under the system tenant)

  **Must NOT do**:
  - Do NOT support arbitrary filtering (no `WHERE name LIKE ...` or tag filtering).
  - Do NOT return tenant_id or internal fields selectively — return the full Project row.
  - Do NOT paginate via cursor (offset-based is sufficient for admin UI).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Two simple read queries. TDD tests are straightforward.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T15 (GET routes)
  - **Blocked By**: T1 (Prisma client), T3 (types), T5 (test helpers)

  **References**:

  **Pattern References**:
  - `src/gateway/services/project-lookup.ts:7-17` — existing `lookupProjectByJiraKey` as a reference for single-record reads by tenant
  - `src/gateway/services/task-creation.ts` — for how the `tenantId` parameter is threaded through

  **API/Type References**:
  - `prisma/schema.prisma:109-127` — Project model

  **WHY Each Reference Matters**:
  - `project-lookup.ts` is the nearest existing service — match its style.

  **Acceptance Criteria**:
  - [ ] `listProjects` and `getProjectById` exported
  - [ ] All 7 test cases pass
  - [ ] `pnpm test -- --run tests/gateway/admin-projects-registry.test.ts` green
  - [ ] Limit clamp verified in a test

  **QA Scenarios**:

  ```
  Scenario: List and get
    Tool: Bash
    Preconditions: Migration applied, seed project present
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-projects-registry.test.ts -t "listProjects|getProjectById"
      2. Assert all relevant cases pass
    Expected Result: PASS.
    Evidence: .sisyphus/evidence/task-9-read-tests.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log

  **Commit**: YES
  - Message: `feat(gateway): implement listProjects and getProjectById services with TDD`
  - Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-registry.test.ts`

- [x] 10. **`project-registry.updateProject` service**

  **What to do**:
  - Append to `src/gateway/services/project-registry.ts`:
    - `updateProject(params: { id: string; input: UpdateProjectInput; tenantId: string; prisma: PrismaClient; }): Promise<Project | null>` — partial update. Returns updated project, or null if not found.
    - Steps: (1) verify project exists via `prisma.project.findFirst({ where: { id, tenant_id } })` — return null if not found. (2) If `input.repo_url` provided, normalize via `normalizeRepoUrl`. (3) Call `prisma.project.update({ where: { id }, data: {...only-provided-fields...} })`. (4) Catch `P2002` on `jira_project_key` → throw `ProjectRegistryConflictError`. (5) Return updated row.
    - `tooling_config` merge semantics: a PATCH with `tooling_config: { install: "npm ci" }` REPLACES the entire tooling_config JSON (NOT deep-merged). Document this in a code comment. If user wants to keep other fields, they must include them in the PATCH body.
  - Append test cases to `tests/gateway/admin-projects-registry.test.ts`:
    - `updateProject` with partial `name` only → other fields unchanged
    - `updateProject` with `repo_url: "https://github.com/new/one.git"` → stored without `.git`
    - `updateProject` with non-existent id → returns null
    - `updateProject` changing `jira_project_key` to an existing one → throws conflict
    - `updateProject` with `tooling_config: { install: "bun install" }` → full tooling_config is `{ install: "bun install" }` (NOT merged with previous)
    - `updateProject` with wrong tenantId → returns null

  **Must NOT do**:
  - Do NOT deep-merge `tooling_config`. Replacement semantics only.
  - Do NOT allow `id`, `tenant_id`, `created_at`, `updated_at` in the input type (Zod already blocks this; service trusts the type).
  - Do NOT emit events or side effects.
  - Do NOT allow `repo_url: null` to clear the URL (it's required on the table).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Partial-update logic is slightly more nuanced than create but still a single-function service.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T16 (PATCH route)
  - **Blocked By**: T1, T3, T5

  **References**:

  **Pattern References**:
  - `src/gateway/services/task-creation.ts:91-115` — `cancelTaskByExternalId` shows the "findFirst → update → return" pattern
  - `src/gateway/services/project-registry.ts:createProject` (from T8) — for conflict handling consistency

  **WHY Each Reference Matters**:
  - Reusing the null-on-not-found pattern keeps the service boundary consistent with existing code.

  **Acceptance Criteria**:
  - [ ] `updateProject` exported
  - [ ] All 6 test cases pass
  - [ ] `tooling_config` replacement semantics documented in code comment

  **QA Scenarios**:

  ```
  Scenario: Partial update
    Tool: Bash
    Preconditions: Create a test project first
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-projects-registry.test.ts -t "updateProject"
      2. Assert tests pass
    Expected Result: PASS.
    Evidence: .sisyphus/evidence/task-10-update-tests.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log

  **Commit**: YES
  - Message: `feat(gateway): implement updateProject service with TDD`
  - Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-registry.test.ts`

- [x] 11. **`project-registry.deleteProject` service with active-task guard**

  **What to do**:
  - Append to `src/gateway/services/project-registry.ts`:
    - `deleteProject(params: { id: string; tenantId: string; prisma: PrismaClient; }): Promise<{ deleted: true } | { deleted: false; reason: 'not_found' | 'active_tasks'; activeTaskIds?: string[] }>`.
    - Steps:
      1. `findFirst` by id + tenantId → if null, return `{ deleted: false, reason: 'not_found' }`.
      2. Query active tasks: `prisma.task.findMany({ where: { project_id: id, status: { in: ['Ready', 'Executing', 'Submitting'] } }, select: { id: true } })`.
      3. If active tasks exist, return `{ deleted: false, reason: 'active_tasks', activeTaskIds: [...] }`.
      4. Otherwise, `prisma.project.delete({ where: { id } })` and return `{ deleted: true }`.
    - Wrap steps 2-4 in a Prisma transaction to prevent TOCTOU: use `prisma.$transaction(async (tx) => { ... })`. Inside the transaction, use `tx.task.findMany` and `tx.project.delete`.
  - Append test cases to `tests/gateway/admin-projects-registry.test.ts`:
    - Delete existing project with no tasks → `{ deleted: true }` and DB row is gone
    - Delete with one Ready task → `{ deleted: false, reason: 'active_tasks', activeTaskIds: [id] }`
    - Delete with one Executing task → same
    - Delete with one Submitting task → same
    - Delete with only completed tasks (`Done`) → succeeds (completed tasks are not active)
    - Delete with only cancelled tasks → succeeds
    - Delete non-existent id → `{ deleted: false, reason: 'not_found' }`
    - Delete with wrong tenantId → `{ deleted: false, reason: 'not_found' }`
  - Verify FK behavior: after a successful delete, any tasks referencing the project should have `project_id = NULL` (per existing `ON DELETE SET NULL` rule). Add an explicit assertion for this in one of the "completed tasks present" cases.

  **Must NOT do**:
  - Do NOT cancel, update, or modify the referencing tasks as part of DELETE.
  - Do NOT emit events or call Inngest.
  - Do NOT soft-delete.
  - Do NOT call `prisma.task.deleteMany` — we never delete tasks as part of project deletion.
  - Do NOT throw on not-found — return the structured result.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Transaction semantics + edge case coverage (6 task statuses) + FK verification. Nuanced but bounded.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T17 (DELETE route)
  - **Blocked By**: T1, T3, T5

  **References**:

  **Pattern References**:
  - Prisma `$transaction` docs: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
  - `prisma/schema.prisma:19-49` — Task model, status field, `project_id` relation with SET NULL behavior (verify by reading the actual FK rule)
  - `src/gateway/services/task-creation.ts:91-115` — existing service that reads and updates tasks safely

  **API/Type References**:
  - Existing task status values: `"Received"`, `"Ready"`, `"Executing"`, `"Submitting"`, `"Done"`, `"Cancelled"` (from README / task-creation.ts / docs). ACTIVE = `{Ready, Executing, Submitting}`.

  **WHY Each Reference Matters**:
  - Active task set definition is load-bearing — getting the list wrong will either block too eagerly or allow unsafe deletes.
  - Transaction is required to avoid a race where a task transitions to Ready between our check and the delete.

  **Acceptance Criteria**:
  - [ ] `deleteProject` exported with the structured result type
  - [ ] Transaction wraps the check-and-delete
  - [ ] All 8 test cases pass
  - [ ] FK verification (orphaned task has project_id = NULL after delete with completed tasks) is asserted in a test

  **QA Scenarios**:

  ```
  Scenario: Delete blocked by active task
    Tool: Bash
    Preconditions: Create test project + task in Executing status
    Steps:
      1. Run: pnpm test -- --run tests/gateway/admin-projects-registry.test.ts -t "deleteProject"
      2. Assert every case passes
    Expected Result: PASS on all 8 cases including active-task block.
    Evidence: .sisyphus/evidence/task-11-delete-tests.log

  Scenario: Delete with completed tasks orphans them
    Tool: Bash (inline)
    Preconditions: Test project with a Done task
    Steps:
      1. Call deleteProject
      2. Query the task: SELECT project_id FROM tasks WHERE id = ?
      3. Assert project_id IS NULL
    Expected Result: NULL.
    Evidence: .sisyphus/evidence/task-11-orphan.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log
  - [ ] FK orphan assertion log

  **Commit**: YES
  - Message: `feat(gateway): implement deleteProject with active-task guard (TDD)`
  - Files: `src/gateway/services/project-registry.ts`, `tests/gateway/admin-projects-registry.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-registry.test.ts`

- [x] 12. **Install runner module: `src/workers/lib/install-runner.ts`**

  **What to do**:
  - Create `src/workers/lib/install-runner.ts` with one exported function:
    - `runInstallCommand(command: string, workspaceDir: string, logger?: Logger): Promise<{ durationMs: number; stdout: string; stderr: string }>`
  - Implementation:
    1. Use `execFileAsync` from `util.promisify(child_process.execFile)` (same pattern as `validation-pipeline.ts:41-69`).
    2. Parse the command string by splitting on whitespace: `const [executable, ...args] = command.trim().split(/\s+/);`.
    3. Validate: if `executable` is empty → throw `Error('install command is empty')`.
    4. Execute with `{ cwd: workspaceDir, timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }`.
    5. Log start/complete with logger (log level info; use the `createLogger` factory from `src/lib/logger.ts`).
    6. Return `{ durationMs, stdout, stderr }`.
    7. On execution failure, re-throw the original error with a wrapping message: `new Error(`install command failed: ${command} (exit ${error.code}): ${error.stderr ?? error.message}`, { cause: error })`.
  - Write tests FIRST (TDD) in `tests/workers/install-runner.test.ts`:
    - Success case: `runInstallCommand("echo hello", "/tmp")` → stdout contains "hello", durationMs > 0
    - Empty command: `runInstallCommand("", "/tmp")` → throws with "empty"
    - Failure case: `runInstallCommand("false", "/tmp")` → throws with "install command failed"
    - Timeout case: `runInstallCommand("sleep 1000", "/tmp")` with a short timeout override (see below) → throws (may need to make timeout injectable for testability — add optional `timeoutMs?: number` param)
  - Make `timeoutMs` an optional 4th parameter for test injection (default 300_000).

  **Must NOT do**:
  - Do NOT use `exec` (string-based shell) — use `execFile` to avoid shell injection.
  - Do NOT use `spawn` — the streaming complexity is unnecessary for a single install step.
  - Do NOT swallow errors.
  - Do NOT log stdout/stderr content in the info log (may contain tokens) — only durations.
  - Do NOT pipe this through the validation-pipeline's `runSingleStage` — that function is scoped to `ValidationStage` type and install is NOT a validation stage.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Small module, clear patterns from existing code, tests are straightforward.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T19 (orchestrate integration)
  - **Blocked By**: T7 (ToolingConfig.install field)

  **References**:

  **Pattern References**:
  - `src/workers/lib/validation-pipeline.ts:41-69` — `runSingleStage` implementation — the canonical pattern for `execFileAsync` with timeout + error wrapping
  - `src/lib/logger.ts` — `createLogger` factory

  **API/Type References**:
  - Node `child_process.execFile` — https://nodejs.org/api/child_process.html#child_processexecfilefile-args-options-callback
  - `util.promisify` — standard Node promisification

  **Test References**:
  - Existing worker tests for timing assertions

  **WHY Each Reference Matters**:
  - Copying the execFileAsync pattern ensures the install runner handles timeouts, buffers, and exit codes identically to validation stages.

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/install-runner.ts` exists with `runInstallCommand` exported
  - [ ] Unit tests cover success, empty, failure, timeout (4+ cases)
  - [ ] Uses `execFileAsync`, not `exec`
  - [ ] Default 5-minute timeout matches validation-pipeline.ts
  - [ ] No stdout/stderr in log statements

  **QA Scenarios**:

  ```
  Scenario: Successful echo
    Tool: Bash
    Preconditions: Module implemented
    Steps:
      1. Run: pnpm test -- --run tests/workers/install-runner.test.ts
      2. Assert all cases pass including timeout
    Expected Result: PASS.
    Evidence: .sisyphus/evidence/task-12-install-runner.log

  Scenario: Timeout triggers
    Tool: Bash (inline)
    Preconditions: Module exported
    Steps:
      1. Inline: await runInstallCommand("sleep 10", "/tmp", undefined, 500)
      2. Assert throws with timeout indication
    Expected Result: Throws within ~500ms.
    Evidence: .sisyphus/evidence/task-12-timeout.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log
  - [ ] Timeout evidence

  **Commit**: YES
  - Message: `feat(worker): add install-runner module for configurable install commands`
  - Files: `src/workers/lib/install-runner.ts`, `tests/workers/install-runner.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/workers/install-runner.test.ts`

- [x] 13. **Gateway server.ts: fail-fast startup check for `ADMIN_API_KEY`**

  **What to do**:
  - Update `src/gateway/server.ts` — add a startup validation block alongside the existing `JIRA_WEBHOOK_SECRET` check at lines 24-25. Example insertion:
    ```typescript
    if (!process.env.JIRA_WEBHOOK_SECRET) {
      throw new Error('JIRA_WEBHOOK_SECRET is required');
    }
    if (!process.env.ADMIN_API_KEY) {
      throw new Error('ADMIN_API_KEY is required. Generate with: openssl rand -hex 32');
    }
    if (process.env.ADMIN_API_KEY.length < 16) {
      throw new Error(
        'ADMIN_API_KEY is too short (min 16 characters). Regenerate with: openssl rand -hex 32',
      );
    }
    ```
  - Place the checks in the same location as the existing one (inside `buildApp` before any route registration OR at module load — match existing style).
  - Write tests FIRST (TDD) extending `tests/gateway/server-startup.test.ts` (create if missing):
    - `buildApp()` throws with the correct error message when `ADMIN_API_KEY` is unset
    - `buildApp()` throws when `ADMIN_API_KEY` is empty string
    - `buildApp()` throws when `ADMIN_API_KEY` is `"short"`
    - `buildApp()` succeeds when `ADMIN_API_KEY` is a 64-char hex string
  - Tests must restore `process.env.ADMIN_API_KEY` after each case.

  **Must NOT do**:
  - Do NOT change the existing `JIRA_WEBHOOK_SECRET` validation.
  - Do NOT add other validations to this task (auth middleware owns per-request validation).
  - Do NOT make the check runtime-togglable via a flag. It's always on.
  - Do NOT log the key value.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3-line change mirroring an existing pattern.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T18 (route registration happens in server.ts)
  - **Blocked By**: T6 (needs the env var to exist in `.env.example`)

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:24-25` — existing `JIRA_WEBHOOK_SECRET` check — copy the exact idiom

  **Test References**:
  - Any existing test that sets `process.env` before calling `buildApp` — mimics the startup flow

  **WHY Each Reference Matters**:
  - Consistency with existing startup validation ensures operators see the same error shape across missing env vars.

  **Acceptance Criteria**:
  - [ ] `server.ts` throws on missing/empty/short `ADMIN_API_KEY`
  - [ ] 4 test cases pass
  - [ ] Existing JIRA check unchanged

  **QA Scenarios**:

  ```
  Scenario: Server refuses to start without key
    Tool: Bash
    Preconditions: Test runner
    Steps:
      1. Run: pnpm test -- --run tests/gateway/server-startup.test.ts
      2. Assert all cases pass
    Expected Result: PASS.
    Evidence: .sisyphus/evidence/task-13-startup-tests.log

  Scenario: Live check via CLI
    Tool: Bash
    Preconditions: Local env
    Steps:
      1. Run: ADMIN_API_KEY= pnpm tsx -e "import { buildApp } from './src/gateway/server.js'; buildApp({}).catch(e => { console.log('ERR:', e.message); process.exit(0); })"
      2. Assert output contains "ADMIN_API_KEY is required"
    Expected Result: Error message present, clean exit.
    Evidence: .sisyphus/evidence/task-13-live-check.log
  ```

  **Evidence to Capture**:
  - [ ] Test-run log
  - [ ] Live check log

  **Commit**: YES
  - Message: `feat(gateway): fail-fast startup if ADMIN_API_KEY is unset`
  - Files: `src/gateway/server.ts`, `tests/gateway/server-startup.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/server-startup.test.ts`

- [x] 14. **`POST /admin/projects` route — create project**

  **What to do**:
  - Create `src/gateway/routes/admin-projects.ts`
  - Export `adminProjectRoutes: FastifyPluginAsync`
  - Register `requireAdminKey` as `preHandler` for ALL routes in this plugin (use `fastify.addHook('preHandler', requireAdminKey)`)
  - Route: `fastify.post('/admin/projects', async (req, reply) => { ... })`
  - Handler logic:
    1. `const parsed = CreateProjectSchema.safeParse(req.body)` — return 400 with `{ error: 'INVALID_REQUEST', issues: parsed.error.issues }` if invalid
    2. `try { const project = await projectRegistry.createProject(parsed.data); return reply.code(201).send(project) } catch (err) { ... }`
    3. Map errors: `ConflictError` → 409 `{ error: 'CONFLICT', message }`, generic → 500
  - Use `req.log` for structured logging (mirror `src/gateway/routes/jira.ts:55-95`)
  - Tests in `tests/gateway/admin-projects-create.test.ts`:
    - **RED**: Missing `X-Admin-Key` → 401
    - **RED**: Wrong key → 401
    - **RED**: Valid key + invalid body (no `repo_url`) → 400 with Zod issues
    - **RED**: Valid key + valid body → 201 with project payload (id, jira_project_key, repo_url, tooling_config)
    - **RED**: Duplicate jira_project_key → 409
    - **RED**: Persisted in DB (re-fetch via Prisma to verify)
  - **GREEN**: Wire route, add error mapping, run tests

  **Must NOT do**:
  - Do NOT bypass `requireAdminKey` with route-level skips
  - Do NOT swallow errors with `catch {}` — always log + map
  - Do NOT return raw Prisma errors (sanitize to `error` + `message`)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-file route + integration test wiring; non-trivial Fastify plumbing
  - **Skills**: `[]`
    - No specialized skills needed; standard Fastify + Vitest patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T15, T16, T17, T19, T20)
  - **Blocks**: T18 (route registration in server.ts)
  - **Blocked By**: T3 (Zod schemas), T4 (admin auth middleware), T8 (createProject service)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/gateway/routes/jira.ts:1-99` - Canonical Fastify route plugin pattern (default async export, `fastify.post`, structured logging via `req.log`, error try/catch with HTTP status mapping)
  - `src/gateway/routes/jira.ts:55-95` - Error handling pattern: `try { ... } catch (err) { req.log.error(...); return reply.code(...).send(...) }`
  - `src/gateway/routes/health.ts` - Minimal route plugin shape (for reference on `FastifyPluginAsync` typing)

  **API/Type References**:
  - `src/gateway/validation/schemas.ts` (after T3) - `CreateProjectSchema` Zod parse
  - `src/gateway/services/project-registry.ts` (after T8) - `createProject(input): Promise<Project>`
  - `src/gateway/middleware/admin-auth.ts` (after T4) - `requireAdminKey` preHandler

  **Test References**:
  - `tests/gateway/jira-webhook.test.ts:27-150` - Integration test pattern: `createTestApp()`, `app.inject({ method, url, headers, payload })`, `expect(res.statusCode).toBe(...)`, `expect(JSON.parse(res.body)).toMatchObject(...)`
  - `tests/setup.ts:62-75` - `createTestApp` factory for inject-style tests

  **WHY Each Reference Matters**:
  - `jira.ts` is the closest analogue: it's a POST endpoint that validates input, calls a service, handles errors, and returns structured JSON. Mirror its shape exactly.
  - `jira-webhook.test.ts` shows the canonical inject() pattern with `app.close()` in `afterEach` — copy this for clean test isolation.

  **Acceptance Criteria**:
  - [ ] File `src/gateway/routes/admin-projects.ts` exists and exports `adminProjectRoutes`
  - [ ] Test file `tests/gateway/admin-projects-create.test.ts` exists with ≥6 test cases
  - [ ] `bun test tests/gateway/admin-projects-create.test.ts` → all PASS
  - [ ] `pnpm tsc --noEmit` → 0 errors
  - [ ] `pnpm lint` → 0 errors

  **QA Scenarios**:

  ```
  Scenario: Create project happy path via curl
    Tool: Bash (curl)
    Preconditions:
      - Gateway running on :3000 with ADMIN_API_KEY=test-admin-key in env
      - Database migrated and seeded (test project exists)
    Steps:
      1. curl -s -X POST http://localhost:3000/admin/projects \
           -H "Content-Type: application/json" \
           -H "X-Admin-Key: test-admin-key" \
           -d '{"jira_project_key":"NEWPROJ","repo_url":"https://github.com/acme/widgets","tooling_config":{"package_manager":"npm","install":"npm ci","build":"npm run build","test":"npm test","lint":"npm run lint"}}' \
           -o /tmp/qa-t14-create.json -w '%{http_code}'
      2. Assert HTTP status code == 201
      3. Assert response body contains: id (uuid), jira_project_key="NEWPROJ", repo_url="https://github.com/acme/widgets"
      4. Re-query: psql -d ai_employee -c "SELECT id, jira_project_key, repo_url FROM projects WHERE jira_project_key='NEWPROJ';"
      5. Assert row exists with matching values
    Expected Result: 201 + persisted row + tooling_config jsonb stored
    Failure Indicators: Non-201, missing row, missing fields in response
    Evidence: .sisyphus/evidence/task-14-create-happy.json (response body + HTTP code)

  Scenario: Reject missing X-Admin-Key with 401
    Tool: Bash (curl)
    Preconditions: Same as above
    Steps:
      1. curl -s -X POST http://localhost:3000/admin/projects \
           -H "Content-Type: application/json" \
           -d '{"jira_project_key":"NOAUTH","repo_url":"https://github.com/acme/x"}' \
           -o /tmp/qa-t14-noauth.json -w '%{http_code}'
      2. Assert HTTP status == 401
      3. Assert response body contains error: "UNAUTHORIZED"
      4. psql query — confirm NO row created with jira_project_key='NOAUTH'
    Expected Result: 401, no DB insert
    Evidence: .sisyphus/evidence/task-14-create-noauth.json

  Scenario: Reject duplicate jira_project_key with 409
    Tool: Bash (curl)
    Preconditions: A project with jira_project_key='DUP' already exists (insert via prior call)
    Steps:
      1. POST same payload twice with key 'DUP'
      2. Assert second response HTTP status == 409
      3. Assert response body contains error: "CONFLICT"
    Expected Result: 409 on second attempt
    Evidence: .sisyphus/evidence/task-14-create-conflict.json
  ```

  **Evidence to Capture**:
  - [ ] task-14-create-happy.json (response + status code)
  - [ ] task-14-create-noauth.json (401 response)
  - [ ] task-14-create-conflict.json (409 response)

  **Commit**: YES
  - Message: `feat(gateway): add POST /admin/projects route for project registration`
  - Files: `src/gateway/routes/admin-projects.ts`, `tests/gateway/admin-projects-create.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-create.test.ts`

- [x] 15. **`GET /admin/projects` (list) and `GET /admin/projects/:id` (read) routes**

  **What to do**:
  - Edit `src/gateway/routes/admin-projects.ts` (created in T14) — add two routes
  - Route 1: `fastify.get('/admin/projects', async (req, reply) => { const projects = await projectRegistry.listProjects(); return reply.send({ projects }); })`
  - Route 2: `fastify.get('/admin/projects/:id', async (req, reply) => { ... })`
    - Validate `id` param is UUID format (use Zod or simple regex)
    - Call `projectRegistry.getProjectById(id)`
    - If not found → 404 `{ error: 'NOT_FOUND' }`
    - If found → 200 with project payload
  - Tests in `tests/gateway/admin-projects-read.test.ts`:
    - **RED**: GET list without admin key → 401
    - **RED**: GET list with valid key → 200 + array
    - **RED**: GET list returns at least the seed project
    - **RED**: GET by id (existing) → 200 + project
    - **RED**: GET by id (non-existent uuid) → 404
    - **RED**: GET by id (malformed id) → 400
  - **GREEN**: Wire routes, run tests

  **Must NOT do**:
  - Do NOT add pagination yet (out of scope — can add later)
  - Do NOT expose internal Prisma error messages
  - Do NOT include `tasks` relation in list response (over-fetch — keep slim)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two simple read endpoints, mostly mirroring T14 patterns
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with T14, T16, T17, T19, T20)
  - **Blocks**: T18
  - **Blocked By**: T3, T4, T9

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-projects.ts` (after T14) - Plugin file to extend
  - `src/gateway/routes/health.ts` - Simple GET route shape

  **API/Type References**:
  - `src/gateway/services/project-registry.ts` (after T9) - `listProjects()`, `getProjectById(id)`

  **Test References**:
  - `tests/gateway/admin-projects-create.test.ts` (after T14) - Reuse helpers and setup

  **WHY Each Reference Matters**:
  - T14 already establishes the file, plugin shape, and auth wiring — this task just adds two more route handlers in the same file.

  **Acceptance Criteria**:
  - [ ] `tests/gateway/admin-projects-read.test.ts` exists with ≥6 test cases
  - [ ] `bun test tests/gateway/admin-projects-read.test.ts` → all PASS
  - [ ] `pnpm tsc --noEmit` → 0 errors

  **QA Scenarios**:

  ```
  Scenario: List projects returns array
    Tool: Bash (curl)
    Preconditions: Gateway running, ≥1 project in DB
    Steps:
      1. curl -s http://localhost:3000/admin/projects \
           -H "X-Admin-Key: test-admin-key" \
           -o /tmp/qa-t15-list.json -w '%{http_code}'
      2. Assert HTTP status == 200
      3. Assert response body has key "projects" with array value
      4. Assert array length >= 1
      5. Assert first item has keys: id, jira_project_key, repo_url
    Expected Result: 200 + non-empty projects array
    Evidence: .sisyphus/evidence/task-15-list.json

  Scenario: GET by id — not found returns 404
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s http://localhost:3000/admin/projects/00000000-0000-0000-0000-999999999999 \
           -H "X-Admin-Key: test-admin-key" \
           -o /tmp/qa-t15-404.json -w '%{http_code}'
      2. Assert HTTP status == 404
      3. Assert response body error == "NOT_FOUND"
    Expected Result: 404
    Evidence: .sisyphus/evidence/task-15-not-found.json
  ```

  **Evidence to Capture**:
  - [ ] task-15-list.json
  - [ ] task-15-not-found.json

  **Commit**: YES
  - Message: `feat(gateway): add GET /admin/projects list and read routes`
  - Files: `src/gateway/routes/admin-projects.ts`, `tests/gateway/admin-projects-read.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-read.test.ts`

- [x] 16. **`PATCH /admin/projects/:id` route — update project**

  **What to do**:
  - Edit `src/gateway/routes/admin-projects.ts` — add PATCH route
  - Handler logic:
    1. Validate `id` param is UUID
    2. `const parsed = UpdateProjectSchema.safeParse(req.body)` — 400 on failure
    3. Call `projectRegistry.updateProject(id, parsed.data)`
    4. Map errors: `NotFoundError` → 404, `ConflictError` → 409, generic → 500
    5. Return 200 with updated project
  - Tests in `tests/gateway/admin-projects-update.test.ts`:
    - **RED**: PATCH without auth → 401
    - **RED**: PATCH non-existent id → 404
    - **RED**: PATCH with empty body → 400 (UpdateProjectSchema requires ≥1 field)
    - **RED**: PATCH valid update → 200 + updated payload
    - **RED**: PATCH partial update (only `repo_url`) → other fields untouched
    - **RED**: PATCH `tooling_config` (partial) → merges with existing, doesn't replace
    - **RED**: PATCH duplicate `jira_project_key` → 409
    - **RED**: Persisted in DB
  - **GREEN**: Wire route, run tests

  **Must NOT do**:
  - Do NOT allow updates to `id`, `created_at`, `tenant_id` (UpdateProjectSchema must omit these)
  - Do NOT silently drop unknown fields — Zod `.strict()` should reject

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Partial update logic + tooling_config merge semantics need care
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T18
  - **Blocked By**: T3, T4, T10

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-projects.ts` (after T14, T15) - Plugin file to extend
  - `src/gateway/routes/jira.ts:55-95` - Error mapping pattern

  **API/Type References**:
  - `src/gateway/validation/schemas.ts` (after T3) - `UpdateProjectSchema`
  - `src/gateway/services/project-registry.ts` (after T10) - `updateProject(id, patch)`

  **Test References**:
  - `tests/gateway/admin-projects-create.test.ts` (after T14) - Setup pattern

  **WHY Each Reference Matters**:
  - PATCH with partial body needs the UpdateProjectSchema (defined in T3) to be `.partial()` and `.refine(obj => Object.keys(obj).length > 0, 'at least one field required')`. The service layer (T10) handles the actual merge logic.

  **Acceptance Criteria**:
  - [ ] `tests/gateway/admin-projects-update.test.ts` with ≥8 test cases
  - [ ] All tests PASS
  - [ ] `pnpm tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: Partial update — only repo_url changes
    Tool: Bash (curl)
    Preconditions: Project 'PATCH-TEST' exists with repo_url='https://github.com/old/repo'
    Steps:
      1. curl -s -X PATCH http://localhost:3000/admin/projects/<id> \
           -H "Content-Type: application/json" \
           -H "X-Admin-Key: test-admin-key" \
           -d '{"repo_url":"https://github.com/new/repo"}' \
           -o /tmp/qa-t16-patch.json -w '%{http_code}'
      2. Assert HTTP status == 200
      3. Assert response.repo_url == "https://github.com/new/repo"
      4. Assert response.jira_project_key == "PATCH-TEST" (untouched)
      5. psql verify DB row
    Expected Result: 200 + only repo_url changed
    Evidence: .sisyphus/evidence/task-16-patch.json

  Scenario: Empty body rejected with 400
    Tool: Bash (curl)
    Preconditions: A project exists
    Steps:
      1. PATCH with body '{}'
      2. Assert HTTP status == 400
      3. Assert error message mentions "at least one field"
    Expected Result: 400
    Evidence: .sisyphus/evidence/task-16-empty.json
  ```

  **Evidence to Capture**:
  - [ ] task-16-patch.json
  - [ ] task-16-empty.json

  **Commit**: YES
  - Message: `feat(gateway): add PATCH /admin/projects/:id route`
  - Files: `src/gateway/routes/admin-projects.ts`, `tests/gateway/admin-projects-update.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-update.test.ts`

- [x] 17. **`DELETE /admin/projects/:id` route with active-task guard**

  **What to do**:
  - Edit `src/gateway/routes/admin-projects.ts` — add DELETE route
  - Handler logic:
    1. Validate `id` param is UUID
    2. Call `projectRegistry.deleteProject(id)`
    3. Map errors:
       - `NotFoundError` → 404 `{ error: 'NOT_FOUND' }`
       - `ConflictError` (active tasks present) → 409 `{ error: 'CONFLICT', message: 'Project has active tasks (Ready/Executing/Submitting). Wait for them to complete or cancel them first.', activeTaskCount: N }`
    4. Success → 204 No Content
  - Tests in `tests/gateway/admin-projects-delete.test.ts`:
    - **RED**: DELETE without auth → 401
    - **RED**: DELETE non-existent id → 404
    - **RED**: DELETE project with active task (status=Executing) → 409
    - **RED**: DELETE project with no tasks → 204 + DB row gone
    - **RED**: DELETE project with only Done tasks → 204 + DB row gone, Done tasks have project_id=NULL (existing FK behavior)
    - **RED**: After 409, project still exists in DB
  - **GREEN**: Wire route, run tests

  **Must NOT do**:
  - Do NOT cascade-delete tasks (existing FK is `ON DELETE SET NULL` — keep it)
  - Do NOT allow deletion when ANY task is in `Ready`, `Executing`, or `Submitting`
  - Do NOT use raw Prisma calls — must go through `projectRegistry.deleteProject` which uses a transaction

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Race-condition-sensitive (transaction for check-then-delete), error mapping
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T18
  - **Blocked By**: T3, T4, T11

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-projects.ts` (after T14-T16) - Plugin file
  - `src/gateway/routes/jira.ts:55-95` - Error mapping

  **API/Type References**:
  - `src/gateway/services/project-registry.ts` (after T11) - `deleteProject(id)` with transaction guard
  - `prisma/schema.prisma:19-49` - Task model `status` enum + `project_id` FK with `ON DELETE SET NULL`

  **Test References**:
  - `tests/setup.ts:15-28` - `cleanupTestData` (must be extended in T5 to also clean projects/tasks)

  **WHY Each Reference Matters**:
  - The active-task check MUST happen inside a transaction in T11 to prevent race conditions where a task is created between the check and the delete. The route here is just the HTTP layer — all logic lives in the service.

  **Acceptance Criteria**:
  - [ ] `tests/gateway/admin-projects-delete.test.ts` with ≥6 test cases
  - [ ] All tests PASS
  - [ ] `pnpm tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: Delete project with no tasks succeeds
    Tool: Bash (curl)
    Preconditions: Project 'DEL-TEST' exists, zero tasks reference it
    Steps:
      1. curl -s -X DELETE http://localhost:3000/admin/projects/<id> \
           -H "X-Admin-Key: test-admin-key" \
           -o /tmp/qa-t17-del.txt -w '%{http_code}'
      2. Assert HTTP status == 204
      3. Assert response body is empty
      4. psql -c "SELECT COUNT(*) FROM projects WHERE id='<id>';" → 0
    Expected Result: 204 + row gone
    Evidence: .sisyphus/evidence/task-17-delete-success.txt

  Scenario: Block delete when active task exists
    Tool: Bash (curl)
    Preconditions:
      - Project 'BUSY-TEST' exists
      - One task with project_id=<id> and status='Executing' inserted via psql
    Steps:
      1. curl -s -X DELETE http://localhost:3000/admin/projects/<id> \
           -H "X-Admin-Key: test-admin-key" \
           -o /tmp/qa-t17-busy.json -w '%{http_code}'
      2. Assert HTTP status == 409
      3. Assert response.error == "CONFLICT"
      4. Assert response.activeTaskCount >= 1
      5. psql verify project STILL exists
    Expected Result: 409 + project preserved
    Evidence: .sisyphus/evidence/task-17-delete-blocked.json
  ```

  **Evidence to Capture**:
  - [ ] task-17-delete-success.txt
  - [ ] task-17-delete-blocked.json

  **Commit**: YES
  - Message: `feat(gateway): add DELETE /admin/projects/:id with active-task guard`
  - Files: `src/gateway/routes/admin-projects.ts`, `tests/gateway/admin-projects-delete.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/admin-projects-delete.test.ts`

- [x] 18. **Register `adminProjectRoutes` in gateway server.ts**

  **What to do**:
  - Edit `src/gateway/server.ts`
  - Add import: `import { adminProjectRoutes } from './routes/admin-projects.js'`
  - In the `buildServer` function, after existing route registrations (around lines 43-52), add: `await fastify.register(adminProjectRoutes)`
  - No additional changes — the plugin already self-registers `requireAdminKey` as `preHandler`
  - Tests in `tests/gateway/server-routes.test.ts` (new or extend existing):
    - **RED**: After buildServer, route `POST /admin/projects` is registered
    - **RED**: After buildServer, route `GET /admin/projects` is registered
    - **RED**: After buildServer, route `GET /admin/projects/:id` is registered
    - **RED**: After buildServer, route `PATCH /admin/projects/:id` is registered
    - **RED**: After buildServer, route `DELETE /admin/projects/:id` is registered
    - Use `fastify.printRoutes()` or check via `fastify.inject({ method: 'OPTIONS', url })`
  - **GREEN**: Add register call

  **Must NOT do**:
  - Do NOT add a route prefix (paths are already absolute `/admin/projects`)
  - Do NOT register before health/jira routes (order doesn't matter functionally, but keep consistent grouping)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single import + single line of registration
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential within wave — must run after T14-T17)
  - **Blocks**: T22 (E2E regression test)
  - **Blocked By**: T14, T15, T16, T17

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:43-52` - Existing route registration block (`fastify.register(jiraRoutes)`, etc.)

  **API/Type References**:
  - `src/gateway/routes/admin-projects.ts` (after T14-T17) - Default export `adminProjectRoutes`

  **Test References**:
  - `tests/gateway/inngest-serve.test.ts` - Pattern for asserting routes exist via `printRoutes()`
  - `tests/gateway/jira-webhook.test.ts:27-50` - `createTestApp()` use

  **WHY Each Reference Matters**:
  - server.ts registers all top-level Fastify plugins. Adding admin routes here makes them reachable via the running gateway. No prefix needed because admin-projects.ts uses absolute paths.

  **Acceptance Criteria**:
  - [ ] `src/gateway/server.ts` imports and registers `adminProjectRoutes`
  - [ ] `pnpm tsc --noEmit` clean
  - [ ] `pnpm test -- --run tests/gateway/server-routes.test.ts` PASS
  - [ ] All 5 admin routes appear in `fastify.printRoutes()` output

  **QA Scenarios**:

  ```
  Scenario: All admin routes are registered after buildServer
    Tool: Bash (bun test)
    Preconditions: T14-T17 complete, no compile errors
    Steps:
      1. Run: bun test tests/gateway/server-routes.test.ts
      2. Test creates app via buildServer(), calls fastify.printRoutes()
      3. Asserts output contains "POST    /admin/projects"
      4. Asserts output contains "GET     /admin/projects"
      5. Asserts output contains "GET     /admin/projects/:id"
      6. Asserts output contains "PATCH   /admin/projects/:id"
      7. Asserts output contains "DELETE  /admin/projects/:id"
    Expected Result: All 5 routes present, tests PASS
    Evidence: .sisyphus/evidence/task-18-routes.txt (printRoutes output)

  Scenario: Curl smoke — list endpoint reachable on running gateway
    Tool: Bash (curl)
    Preconditions: pnpm dev:start running, ADMIN_API_KEY set
    Steps:
      1. curl -sI http://localhost:3000/admin/projects -H "X-Admin-Key: $ADMIN_API_KEY" | head -1
      2. Assert response includes "HTTP/1.1 200"
    Expected Result: 200 (route reachable, not 404)
    Evidence: .sisyphus/evidence/task-18-smoke.txt
  ```

  **Evidence to Capture**:
  - [ ] task-18-routes.txt (printRoutes output)
  - [ ] task-18-smoke.txt (curl headers)

  **Commit**: YES
  - Message: `feat(gateway): register admin project routes in server`
  - Files: `src/gateway/server.ts`, `tests/gateway/server-routes.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/server-routes.test.ts`

- [x] 19. **Worker `orchestrate.mts` integration: invoke install-runner after resolveToolingConfig**

  **What to do**:
  - Edit `src/workers/orchestrate.mts`
  - Locate the section where `resolveToolingConfig` is called (around lines 144-145)
  - Locate where the worker `cd`s into the cloned repo (this happens in `entrypoint.sh` BEFORE `orchestrate.mts` runs — so when orchestrate.mts starts, CWD is already inside the clone)
  - Import: `import { runInstall } from './lib/install-runner.js'`
  - After `resolveToolingConfig` completes, BEFORE the OpenCode invocation (around line 241), call:
    ```ts
    await runInstall({
      installCommand: toolingConfig.install,
      cwd: process.cwd(),
      logger,
      timeoutMs: 10 * 60 * 1000, // 10 min
    });
    ```
  - Wrap in try/catch — on failure, mark task as `AwaitingInput` with reason `install_failed` (mirror existing failure handling pattern)
  - Tests in `tests/workers/orchestrate-install.test.ts`:
    - **RED**: orchestrate calls runInstall with resolved install command
    - **RED**: install failure → task marked AwaitingInput
    - **RED**: install success → continues to OpenCode step
    - Use vi.mock for runInstall to avoid actually shelling out
  - **GREEN**: Wire integration, run tests

  **Must NOT do**:
  - Do NOT call runInstall BEFORE resolveToolingConfig (need the resolved command)
  - Do NOT skip the try/catch — install failure must produce structured AwaitingInput, not crash the worker
  - Do NOT hardcode the timeout — use the constant from install-runner

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Touches the critical worker orchestration path; integration with existing failure flow needs care
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T20 (entrypoint.sh cleanup), T22 (E2E)
  - **Blocked By**: T7 (ToolingConfig.install field), T12 (install-runner module)

  **References**:

  **Pattern References**:
  - `src/workers/orchestrate.mts:144-145` - `resolveToolingConfig` call site
  - `src/workers/orchestrate.mts:241` - OpenCode invocation site (install must run BEFORE this)
  - `src/workers/orchestrate.mts` (search for `AwaitingInput`) - Existing failure-handling pattern to mirror

  **API/Type References**:
  - `src/workers/lib/task-context.ts:10-16` - `ToolingConfig.install` (added in T7)
  - `src/workers/lib/install-runner.ts` (after T12) - `runInstall(opts): Promise<void>`

  **Test References**:
  - `tests/workers/orchestrate.test.ts` (if exists) - Existing orchestrate tests for setup pattern
  - `src/workers/lib/validation-pipeline.ts:41-69` - `execFileAsync` pattern reference

  **WHY Each Reference Matters**:
  - The install step MUST happen between repo clone (entrypoint.sh) and OpenCode invocation (orchestrate.mts:241). It MUST happen AFTER resolveToolingConfig (so we have the project-specific install command).

  **Acceptance Criteria**:
  - [ ] `src/workers/orchestrate.mts` imports and calls `runInstall`
  - [ ] Call placement: AFTER resolveToolingConfig, BEFORE OpenCode invocation
  - [ ] try/catch wraps the call; failure → AwaitingInput with `install_failed` reason
  - [ ] `tests/workers/orchestrate-install.test.ts` ≥3 tests PASS
  - [ ] `pnpm tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: orchestrate.mts executes install before OpenCode (mocked)
    Tool: Bash (bun test)
    Preconditions: T7, T12 complete; vitest can run worker tests
    Steps:
      1. Run: bun test tests/workers/orchestrate-install.test.ts -t "install before opencode"
      2. Test mocks runInstall and openCodeRunner
      3. Asserts call order: resolveToolingConfig → runInstall → opencode
      4. Asserts runInstall called with toolingConfig.install
    Expected Result: Test PASS
    Evidence: .sisyphus/evidence/task-19-order.txt

  Scenario: Install failure transitions task to AwaitingInput
    Tool: Bash (bun test)
    Preconditions: Same
    Steps:
      1. Mock runInstall to throw
      2. Run orchestrate
      3. Assert task status updated to AwaitingInput
      4. Assert reason field == "install_failed"
      5. Assert OpenCode runner was NOT called
    Expected Result: Test PASS
    Evidence: .sisyphus/evidence/task-19-failure.txt
  ```

  **Evidence to Capture**:
  - [ ] task-19-order.txt
  - [ ] task-19-failure.txt

  **Commit**: YES
  - Message: `feat(workers): wire install-runner into orchestrate flow`
  - Files: `src/workers/orchestrate.mts`, `tests/workers/orchestrate-install.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/workers/orchestrate-install.test.ts`

- [x] 20. **Remove hardcoded install step from `src/workers/entrypoint.sh`**

  **What to do**:
  - Edit `src/workers/entrypoint.sh`
  - Locate the hardcoded `pnpm install --frozen-lockfile` line (around line 104)
  - Delete that line and its surrounding log/comment
  - Replace with a comment: `# Install handled by orchestrate.mts via tooling_config.install`
  - The entrypoint.sh now does: clone → checkout → exec orchestrate.mts (no more install)
  - Tests in `tests/workers/entrypoint-install.test.ts` (new):
    - **RED**: grep -c "pnpm install" src/workers/entrypoint.sh → 0
    - **RED**: shellcheck src/workers/entrypoint.sh → 0 errors
  - **GREEN**: Apply edit, run tests

  **Must NOT do**:
  - Do NOT remove the clone or checkout steps
  - Do NOT remove `set -euo pipefail`
  - Do NOT add a fallback install — the install command MUST come from orchestrate.mts (which uses resolved tooling_config)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line removal in shell script
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run AFTER T19 — otherwise install is skipped entirely between commits)
  - **Parallel Group**: Wave 3 (after T19)
  - **Blocks**: T22 (E2E), T23 (Docker rebuild)
  - **Blocked By**: T19

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh:104` - Line to remove

  **API/Type References**:
  - `src/workers/orchestrate.mts` (after T19) - Now owns the install step

  **Test References**:
  - `tests/workers/container-boot.test.ts` - Existing entrypoint test (note: pre-existing failure unrelated to this change)

  **WHY Each Reference Matters**:
  - Removing the hardcoded install in entrypoint.sh prevents the worker from running `pnpm install` regardless of project. After this commit, the install command comes from project.tooling_config.install (e.g. `npm ci`, `bun install`, etc.).

  **Acceptance Criteria**:
  - [ ] `src/workers/entrypoint.sh` no longer contains `pnpm install`
  - [ ] `shellcheck src/workers/entrypoint.sh` → 0 errors
  - [ ] `tests/workers/entrypoint-install.test.ts` PASS

  **QA Scenarios**:

  ```
  Scenario: entrypoint.sh has no install line
    Tool: Bash (grep + shellcheck)
    Preconditions: T19 complete
    Steps:
      1. Run: grep -c "pnpm install" src/workers/entrypoint.sh
      2. Assert output == "0"
      3. Run: shellcheck src/workers/entrypoint.sh
      4. Assert exit code == 0
    Expected Result: 0 install lines, 0 shellcheck errors
    Evidence: .sisyphus/evidence/task-20-grep.txt, task-20-shellcheck.txt
  ```

  **Evidence to Capture**:
  - [ ] task-20-grep.txt
  - [ ] task-20-shellcheck.txt

  **Commit**: YES
  - Message: `refactor(workers): remove hardcoded install from entrypoint.sh`
  - Files: `src/workers/entrypoint.sh`, `tests/workers/entrypoint-install.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/workers/entrypoint-install.test.ts`

- [x] 21. **Documentation updates: README.md, AGENTS.md, .env.example**

  **What to do**:
  - Edit `README.md`:
    - Add new section "## Registering Projects" after "## Test Repo" section
    - Document: prerequisites (`ADMIN_API_KEY` env var), curl examples for POST/GET/PATCH/DELETE
    - Show full request/response payloads
    - Note: 1 global `GITHUB_TOKEN` shared across all projects (MVP limitation)
    - Note: install/build/test/lint commands come from `tooling_config` per project
  - Edit `AGENTS.md`:
    - Update "Environment Variables" section to add `ADMIN_API_KEY` (mark as required for admin endpoints)
    - Add new section "## Registering Projects via Admin API" with curl examples
    - Update "Project Structure" section if needed (mention `src/gateway/routes/admin-projects.ts`)
    - Update "Key Conventions" — note that toolchain is now per-project, not hardcoded
  - Edit `.env.example` (already touched in T6 — verify presence):
    - Confirm `ADMIN_API_KEY=` line with comment explaining purpose
    - Add note: "Generated automatically by `pnpm setup` if missing"
  - No tests (docs change), but verify:
    - `markdownlint README.md AGENTS.md` clean (if installed) OR manual review
    - All curl examples use `localhost:3000` and `X-Admin-Key: $ADMIN_API_KEY` for consistency

  **Must NOT do**:
  - Do NOT delete existing sections — only add
  - Do NOT reference `claude`, `AI`, or `Co-authored-by` anywhere
  - Do NOT add timestamped filenames (these are existing files, not new ones)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Pure documentation; needs clear, accurate prose
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with T22, T23)
  - **Blocks**: None (final wave)
  - **Blocked By**: T14-T20 (must reflect actual implementation)

  **References**:

  **Pattern References**:
  - `README.md` - Existing section structure (## headings, fenced code blocks)
  - `AGENTS.md` - "Environment Variables" section to extend
  - `docs/2026-04-01-1726-system-overview.md` - Architecture doc style for reference

  **API/Type References**:
  - `src/gateway/routes/admin-projects.ts` (after T14-T17) - Source of truth for endpoint shapes
  - `src/gateway/validation/schemas.ts` (after T3) - Source of truth for request bodies

  **Test References**:
  - N/A

  **WHY Each Reference Matters**:
  - Documentation must match the implemented API exactly. Cross-reference the route handlers and Zod schemas to ensure curl examples have correct field names.

  **Acceptance Criteria**:
  - [ ] `README.md` contains "## Registering Projects" section with ≥4 curl examples (POST, GET list, PATCH, DELETE)
  - [ ] `AGENTS.md` contains `ADMIN_API_KEY` in env vars section
  - [ ] `AGENTS.md` contains "## Registering Projects via Admin API" section
  - [ ] `.env.example` contains `ADMIN_API_KEY=` line
  - [ ] Manual review: examples are copy-pasteable and accurate

  **QA Scenarios**:

  ```
  Scenario: Doc curl examples actually work
    Tool: Bash (curl)
    Preconditions: Gateway running, ADMIN_API_KEY set, T14-T20 complete
    Steps:
      1. Copy each curl example from README.md "Registering Projects" section
      2. Execute each one against running gateway
      3. Assert each returns the documented HTTP status
      4. Assert response shape matches documented example
    Expected Result: All examples work as documented
    Evidence: .sisyphus/evidence/task-21-doc-examples.log

  Scenario: ADMIN_API_KEY documented in all 3 files
    Tool: Bash (grep)
    Steps:
      1. grep -l "ADMIN_API_KEY" README.md AGENTS.md .env.example
      2. Assert all 3 files match
    Expected Result: 3 file matches
    Evidence: .sisyphus/evidence/task-21-grep.txt
  ```

  **Evidence to Capture**:
  - [ ] task-21-doc-examples.log
  - [ ] task-21-grep.txt

  **Commit**: YES
  - Message: `docs: document admin API for project registration`
  - Files: `README.md`, `AGENTS.md`, `.env.example`
  - Pre-commit: `pnpm lint` (markdown not linted, but lint catches accidental code edits)

- [ ] 22. **E2E regression test: register a new project via API and run a task against it**

  **What to do**:
  - Create `tests/gateway/jira-webhook-with-new-project.test.ts` (integration test, NOT a full E2E with Docker)
  - Test scenario:
    1. Use `createTestApp()` to spin up gateway
    2. POST `/admin/projects` to register a new project with `jira_project_key='REGTEST'`
    3. Send a Jira webhook for issue `REGTEST-1` to `/webhooks/jira`
    4. Assert: task row created in DB with `project_id` matching the newly registered project
    5. Assert: task `repo_url` matches the registered project's repo_url
    6. Assert: task `tooling_config` matches the registered project's tooling_config
  - Cleanup: delete the test project + task in `afterEach` via extended `cleanupTestData` (T5)
  - Optional: also add a test that PATCH-updating the project's `repo_url` AFTER task creation does NOT affect the existing task (snapshot semantics)

  **Must NOT do**:
  - Do NOT actually invoke a Docker worker (this is integration, not full E2E)
  - Do NOT skip cleanup — must be isolated from other tests
  - Do NOT depend on the seed project — create fresh project in each test

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step integration test touching gateway + DB + multiple services
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T14-T20 (needs full admin API + DB schema)

  **References**:

  **Pattern References**:
  - `tests/gateway/jira-webhook.test.ts:27-150` - Webhook test pattern (sign payload, inject, assert DB row)
  - `tests/gateway/admin-projects-create.test.ts` (after T14) - Admin API test pattern

  **API/Type References**:
  - `src/gateway/services/task-creation.ts` - Snapshots project fields onto task at creation time
  - `src/gateway/services/project-lookup.ts` - Resolves jira_project_key → project_id

  **Test References**:
  - `tests/setup.ts:15-28` - `cleanupTestData` (extended in T5)
  - `tests/setup.ts:62-75` - `createTestApp`

  **WHY Each Reference Matters**:
  - This test proves the END-TO-END behavior of the new feature: a runtime-registered project actually gets used by the existing webhook flow. It catches integration bugs that unit tests would miss (e.g., missing tenant_id, wrong field name in lookup).

  **Acceptance Criteria**:
  - [ ] `tests/gateway/jira-webhook-with-new-project.test.ts` exists with ≥2 test cases
  - [ ] Test PASSES against the running test DB
  - [ ] Cleanup removes test project + task (no leakage)
  - [ ] `pnpm tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: Webhook for runtime-registered project creates task with correct snapshot
    Tool: Bash (bun test)
    Preconditions: T1-T20 complete; test DB ready
    Steps:
      1. Run: bun test tests/gateway/jira-webhook-with-new-project.test.ts -t "runtime-registered project"
      2. Test registers project 'REGTEST' via POST /admin/projects
      3. Test sends signed webhook for REGTEST-1
      4. Test queries DB for the new task
      5. Asserts task.project_id == registered project id
      6. Asserts task.repo_url == registered project repo_url
      7. Asserts task.tooling_config == registered project tooling_config
    Expected Result: Test PASS
    Evidence: .sisyphus/evidence/task-22-regression.txt

  Scenario: Cleanup removes test data
    Tool: Bash (psql)
    Preconditions: After test run completes
    Steps:
      1. psql -c "SELECT COUNT(*) FROM projects WHERE jira_project_key='REGTEST';"
      2. Assert count == 0
      3. psql -c "SELECT COUNT(*) FROM tasks WHERE jira_issue_key='REGTEST-1';"
      4. Assert count == 0
    Expected Result: 0 leakage
    Evidence: .sisyphus/evidence/task-22-cleanup.txt
  ```

  **Evidence to Capture**:
  - [ ] task-22-regression.txt
  - [ ] task-22-cleanup.txt

  **Commit**: YES
  - Message: `test(gateway): regression test for runtime-registered projects`
  - Files: `tests/gateway/jira-webhook-with-new-project.test.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run tests/gateway/jira-webhook-with-new-project.test.ts`

- [x] 22. **E2E regression test: register project → webhook → task created**

  _(Completed — see commit c91ea7c)_

- [x] 23. **Rebuild Docker worker image with updated entrypoint.sh and orchestrate.mts**

  **What to do**:
  - From repo root, run: `docker build -t ai-employee-worker:latest .`
  - Verify build succeeds (exit code 0)
  - Verify image contains the updated files:
    - `docker run --rm ai-employee-worker:latest cat /app/src/workers/entrypoint.sh | grep -c "pnpm install"` → should be 0
    - `docker run --rm ai-employee-worker:latest test -f /app/src/workers/lib/install-runner.js && echo OK` → should print OK
  - Optional: also push to Fly registry via `pnpm fly:image` for hybrid mode
  - This task is REQUIRED per AGENTS.md: "Any modification to files under `src/workers/` requires rebuilding the image before the fix takes effect in E2E runs"

  **Must NOT do**:
  - Do NOT use a tag other than `latest` for the local image (the gateway expects this exact tag)
  - Do NOT skip this step before claiming the task is done — without the rebuild, E2E will run the OLD worker image
  - Do NOT push to Fly registry unless hybrid mode is configured (skip silently if `FLY_API_TOKEN` not set)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command + verification
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (must be the FINAL implementation task — needs all worker changes complete)
  - **Parallel Group**: Wave 4 (sequential within wave — runs LAST)
  - **Blocks**: None (last task before Final Verification Wave)
  - **Blocked By**: T7, T12, T19, T20 (all worker changes must be in)

  **References**:

  **Pattern References**:
  - `Dockerfile` - Worker image build definition
  - `AGENTS.md` (Long-Running Command Protocol section) - Run via tmux if build > 30s

  **API/Type References**:
  - N/A

  **Test References**:
  - N/A

  **WHY Each Reference Matters**:
  - Docker builds for this image take ~3-5 min on first build, ~30s with cache. If running fresh, MUST use the tmux pattern from AGENTS.md "Long-Running Command Protocol" section.

  **Acceptance Criteria**:
  - [ ] `docker build -t ai-employee-worker:latest .` exits 0
  - [ ] Image contains `install-runner.js`
  - [ ] Image's entrypoint.sh has 0 hardcoded `pnpm install` lines
  - [ ] `docker images ai-employee-worker:latest` shows recent timestamp

  **QA Scenarios**:

  ```
  Scenario: Image built and verified
    Tool: Bash (docker)
    Preconditions: T7, T12, T19, T20 complete; Docker daemon running
    Steps:
      1. Launch via tmux (since build may take 5min):
         tmux new-session -d -s ai-build -x 220 -y 50
         tmux send-keys -t ai-build "cd $REPO && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" Enter
      2. Poll: tail -30 /tmp/ai-build.log; grep "EXIT_CODE:0" /tmp/ai-build.log
      3. Verify: docker run --rm ai-employee-worker:latest sh -c "test -f /app/src/workers/lib/install-runner.js && grep -c 'pnpm install' /app/src/workers/entrypoint.sh"
      4. Assert: install-runner.js exists, grep returns 0
    Expected Result: Build succeeds, image contains updated files
    Evidence: .sisyphus/evidence/task-23-build.log, task-23-verify.txt

  Scenario: Image timestamp is recent
    Tool: Bash (docker)
    Steps:
      1. docker images --format "{{.Repository}}:{{.Tag}} {{.CreatedSince}}" ai-employee-worker:latest
      2. Assert "CreatedSince" is < 1 hour ago
    Expected Result: Recent build
    Evidence: .sisyphus/evidence/task-23-timestamp.txt
  ```

  **Evidence to Capture**:
  - [ ] task-23-build.log (full build output)
  - [ ] task-23-verify.txt (file presence checks)
  - [ ] task-23-timestamp.txt

  **Commit**: NO
  - Reason: Building a Docker image is an artifact, not a source change. No files modified.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`

  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Verify: no `tenant_id` request parameters introduced; no per-project `GITHUB_TOKEN` code; no network calls in registration validation; no changes to `jira.ts`/`github.ts`/`health.ts`/`task-creation.ts`/`project-lookup.ts`/`prisma/seed.ts`; no new schema columns beyond the unique index; `cleanupTestData()` does NOT delete seed project; no cascade-cancel in DELETE; no JWT/OAuth/passport imports; no `as any` / `@ts-ignore` / empty catch blocks; no `ADMIN_API_KEY` in logs (check logger redaction list). Check every evidence file exists in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`

  Run `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports, over-abstraction (e.g., factory classes where plain functions suffice), generic names (`data`, `result`, `item`, `temp`), excessive JSDoc. Check AI slop patterns. Verify all new code matches existing codebase style (function exports, Prisma injection pattern, Zod schema naming).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`

  Start from clean state (`pnpm setup` if needed). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Specifically:
  1. Start gateway (`pnpm dev:start`), confirm it refuses to start if `ADMIN_API_KEY` is unset (test this by unsetting temporarily).
  2. `curl` all five endpoints end-to-end with valid key → verify 200/201 responses.
  3. `curl` without key → verify 401.
  4. `curl` with wrong key → verify 401.
  5. `curl` with duplicate `jira_project_key` → verify 409.
  6. `curl` DELETE on a project with a manually-created active task → verify 409.
  7. Register a brand-new project pointing at the existing test target with a distinct `jira_project_key` (e.g., `TEST2`), then mock a Jira webhook for that key → verify task is created with the new project_id.
  8. Run the existing test suite (`pnpm test -- --run`) and confirm zero regressions.
  9. Rebuild the Docker worker image (`docker build -t ai-employee-worker:latest .`), run `pnpm trigger-task` end-to-end against a registered project that uses `tooling_config: {"install": "pnpm install --frozen-lockfile"}` (same as default) — verify PR creation.
     Save all outputs to `.sisyphus/evidence/final-qa/`.
     Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`

  For each task: read "What to do", read actual diff (`git log/diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Specifically verify: the gateway does not touch worker-internal files beyond the shared `src/lib/repo-url.ts`; worker changes do not touch gateway files; no new columns in `projects` table beyond the unique index migration; no modifications to any file NOT listed in "Concrete Deliverables".
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Atomic commits per task (24 total, using Conventional Commits). Examples:

- **T1**: `feat(db): add unique index on projects.jira_project_key per tenant`
- **T2**: `refactor(lib): extract repo-url parsing into src/lib for gateway reuse`
- **T3**: `feat(gateway): add Zod schemas for admin project CRUD requests`
- **T4**: `feat(gateway): add requireAdminKey middleware with timing-safe compare`
- **T5**: `test(setup): extend cleanupTestData to handle admin-created projects`
- **T6**: `feat(env): introduce ADMIN_API_KEY with setup auto-generation`
- **T7**: `feat(worker): add install field to ToolingConfig interface and default`
- **T8**: `feat(gateway): implement createProject registry service with TDD`
- **T9**: `feat(gateway): implement listProjects and getProjectById services with TDD`
- **T10**: `feat(gateway): implement updateProject service with TDD`
- **T11**: `feat(gateway): implement deleteProject with active-task guard (TDD)`
- **T12**: `feat(worker): add install-runner module for configurable install commands`
- **T13**: `feat(gateway): fail-fast startup if ADMIN_API_KEY is unset`
- **T14**: `feat(gateway): POST /admin/projects endpoint with full TDD coverage`
- **T15**: `feat(gateway): GET /admin/projects and GET /admin/projects/:id with TDD`
- **T16**: `feat(gateway): PATCH /admin/projects/:id with TDD`
- **T17**: `feat(gateway): DELETE /admin/projects/:id with 409-on-active-tasks TDD`
- **T18**: `feat(gateway): register adminProjectRoutes in server`
- **T19**: `feat(worker): invoke install-runner from orchestrate.mts post tooling_config resolve`
- **T20**: `refactor(worker): remove hardcoded pnpm install from entrypoint.sh`
- **T21**: `docs: document admin project registration API and loosened toolchain`
- **T22**: `test(integration): E2E regression — register new project and route webhook`
- **T23**: `chore(docker): rebuild worker image post entrypoint.sh restructure`

All commits must pass pre-commit hooks. No `--no-verify`. No AI references in messages. No `Co-authored-by`.

---

## Success Criteria

### Verification Commands

```bash
# Build + lint + test all pass
pnpm build                           # Expected: zero TypeScript errors
pnpm lint                            # Expected: zero lint errors
pnpm test -- --run                   # Expected: 515+ tests pass, zero new failures

# Migration applies cleanly
pnpm prisma migrate deploy           # Expected: migration applied, no errors

# Gateway fails fast if ADMIN_API_KEY is unset
ADMIN_API_KEY= pnpm dev:start        # Expected: throws at startup with clear error

# Gateway starts normally with key present
pnpm dev:start                       # Expected: listening on :3000

# POST happy path
curl -X POST http://localhost:3000/admin/projects \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-new-repo","repo_url":"https://github.com/me/new-repo","jira_project_key":"NEW"}'
# Expected: HTTP 201, body contains {"id":"...", "name":"my-new-repo", ...}

# 401 on missing key
curl -o /dev/null -s -w "%{http_code}" -X POST http://localhost:3000/admin/projects \
  -H "Content-Type: application/json" -d '{}'
# Expected: 401

# 409 on duplicate jira_project_key
curl -X POST http://localhost:3000/admin/projects \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"dupe","repo_url":"https://github.com/me/other","jira_project_key":"NEW"}'
# Expected: HTTP 409, body {"error":"...","conflictField":"jira_project_key"}

# DELETE happy path
curl -X DELETE http://localhost:3000/admin/projects/<id> \
  -H "X-Admin-Key: $ADMIN_API_KEY"
# Expected: HTTP 204

# 409 on DELETE with active tasks
# (after creating a task in Executing state for the project)
# Expected: HTTP 409 with active-task count in body

# Worker install command resolution (unit test)
pnpm test -- --run tests/workers/tooling-config-install.test.ts
# Expected: passes; asserts install field resolved from project config with pnpm fallback

# Existing webhook still works
pnpm test -- --run tests/gateway/jira-webhook.test.ts
# Expected: all pre-existing webhook tests still pass
```

### Final Checklist

- [ ] All "Must Have" present and verified via command or test
- [ ] All "Must NOT Have" absent (grep-verified in F1)
- [ ] All new tests pass; all 515+ existing tests still pass
- [ ] Manual curl verification of all 5 endpoints succeeds
- [ ] E2E regression test (register → webhook → task) passes
- [ ] Docker worker image rebuilt; `pnpm trigger-task` succeeds against a registered project
- [ ] `README.md`, `AGENTS.md`, `.env.example` updated
- [ ] Zero AI-slop patterns (F2 verdict APPROVE)
- [ ] Zero scope contamination (F4 verdict APPROVE)
- [ ] User explicitly approved final verification wave results
