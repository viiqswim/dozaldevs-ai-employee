# Fix CI Deploy Pipeline — Auto-Deploy + Auto-Migrate on Merge to Main

## TL;DR

> **Quick Summary**: Make the GitHub Actions `Deploy` workflow go green and fully automate every merge to `main` — CI (build/unit/integration/lint/dashboard) → DB migrate → gateway deploy → Fly worker image rebuild — with safety guardrails around the production database.
>
> **Deliverables**:
>
> - pnpm version pinned so `pnpm/action-setup` stops failing (the #1 blocker)
> - 1 unit test fixed (RBAC drift) + 8 integration test files modernized to new `Bearer`/`SERVICE_TOKEN` auth → CI green
> - A gated `migrate` job running `prisma migrate deploy` against prod (new `PROD_DATABASE_URL_DIRECT` secret, port-5432 guard, PostgREST schema reload)
> - **GitHub Actions as the single control panel**: Render auto-deploy switched OFF; the workflow triggers + watches the gateway deploy to `live`/`failed` and pulls Render logs into the Actions run (single pane of glass) + Fly worker image auto-rebuild
> - GitHub secrets added; docs updated; live merge E2E proving all four behaviors
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Prod drift pre-flight → pnpm pin → test fixes → workflow rewrite → live E2E

---

## Context

### Original Request

"Re-verify the earlier CI research (the repo changed), then generate a plan to fix the CI pipeline so everything auto-deploys with migrations applied on every merge to `main`."

### Interview Summary

**Re-verified ground truth (2026-06-10, fresh `main`):**

- `deploy.yml` STILL fails every run at `Run pnpm/action-setup@v3` (~30s). Root cause unchanged: no pnpm version source (`package.json` has no `packageManager`; step has no `version:`). Latest failing run: `27295314540` (PR #13).
- Build ✅ · Lint ✅ · Dashboard tests ✅ (41/41).
- `pnpm test:unit`: **1 failed** / 1705 passed / 9 skipped. Failure: `tests/unit/gateway/routes/admin-members.test.ts` "returns 403 for a MEMBER role" expects 403 but route allows it (200). **Test is wrong** — `GET /admin/tenants/:tenantId/members` uses `requireTenantRole(VIEWER)`; MEMBER (rank 2) > VIEWER (rank 1) → 200 is correct.
- `pnpm test:integration`: **80 failed** / 380 passed / 18 skipped across 8 files. **Single root cause**: tests use OLD auth (`process.env.ADMIN_API_KEY` + `X-Admin-Key`, expect body `{ error: 'Unauthorized' }`) but `authMiddleware` now requires `Authorization: Bearer <SERVICE_TOKEN>` and returns `AUTHENTICATION_REQUIRED`.
- GitHub Actions secrets: **total_count = 0** → `RENDER_DEPLOY_HOOK_URL` and `FLY_API_TOKEN` MISSING.
- Render live service `srv-d8f1b2gg4nts738dj7jg`: `autoDeploy: yes` on `main`, `preDeployCommand: (NONE)` → gateway already auto-deploys on push; migrations never auto-run.
- Prod `DATABASE_URL_DIRECT` = `db.gjqrysxpvktmibpkwrvy.supabase.co:5432` (direct — correct for `migrate deploy`). Pooled = 6543 `?pgbouncer=true`.
- 59 migrations; some destructive (`drop_dead_tables`, `drop_feedback_and_learned_rules`, etc.) — all historical/applied, but reinforces the drift-check need.
- Worker `Dockerfile` (pushed to Fly) only uses `ARG TARGETARCH` — no build-args needed in CI.

**User decisions:**

1. Auto-migrate via a **GitHub Actions `migrate` job** (not Render preDeploy).
2. **Fix tests properly** + investigate the RBAC discrepancy (RESOLVED: test is wrong, code correct).
3. **Full scope**: green pipeline + auto-migrate + Fly worker rebuild + live verification.

### Metis Review (gaps addressed in this plan)

- **PostgREST schema-cache reload** after migrations (else silent `PGRST205` for workers). ADDED.
- **Prod migration-drift pre-flight** (manual, read-only `migrate status`) before enabling automation — manual applies + `_prisma_migrations` back-fills are documented. ADDED as Wave 0.
- **Render double-deploy race** (Render autoDeploy + GH curl hook). RESOLVED per user direction: switch Render autoDeploy OFF and make GitHub Actions the single trigger — it triggers, watches the deploy to `live`/`failed`, and pulls Render logs into the Actions run (single-pane-of-glass visibility). See Task 9.
- **Job ordering**: gateway must not boot pre-migration. ADDED `needs: [test, migrate]` (or equivalent given the double-deploy resolution).
- **Concurrency**: serialize migrate jobs (`cancel-in-progress: false`). ADDED.
- **Port-5432 guard** + **never echo secrets** + **prod backup before first migrate**. ADDED.

---

## Work Objectives

### Core Objective

Every merge to `main` automatically and safely: runs green CI, applies pending DB migrations to prod, deploys the gateway, and rebuilds+pushes the Fly worker image — with no manual steps.

### Concrete Deliverables

- `package.json`: `"packageManager": "pnpm@10.24.0"` (matches lockfileVersion 9.0 / local 10.24.0)
- `.github/workflows/deploy.yml`: pnpm `@v4`, new `migrate` job, job ordering, concurrency, port guard, PostgREST reload, double-deploy resolution
- `tests/unit/gateway/routes/admin-members.test.ts`: corrected expectation
- 8 modernized integration test files (Bearer/SERVICE_TOKEN + new error-body shape)
- GitHub secrets: `PROD_DATABASE_URL_DIRECT`, `FLY_API_TOKEN`, and (if kept) `RENDER_DEPLOY_HOOK_URL`
- Docs: AGENTS.md + production-debugging guide updates
- Evidence: prod `migrate status` reconciliation, prod backup, live-merge run capture

### Must Have

- `pnpm/action-setup` step succeeds; `pnpm install --frozen-lockfile` works
- `pnpm test:unit` → 0 failed; `pnpm test:integration` → 0 failed; build + lint + dashboard green
- A `migrate` job that runs `prisma migrate deploy` against prod **direct** URL, gated on `test`
- PostgREST schema reload after migrate
- Render auto-deploy switched OFF; GitHub Actions is the single trigger and **watches the gateway deploy to `live`/`failed` with Render logs surfaced in the Actions run**
- Exactly ONE gateway deploy per merge (no double-deploy)
- Fly worker `:latest` digest changes on merge
- Live merge proves all four behaviors

### Must NOT Have (Guardrails)

- Do NOT touch the 9 pre-existing `it.skip` tests (guest-delivery, installation-store, tenant-env-loader)
- Do NOT modify auth/authz middleware or route logic — only tests change
- Do NOT sweep the 380 passing integration tests into a "consistency" refactor
- Do NOT edit/squash/rename any migration `.sql` files; do NOT re-engineer RLS
- Do NOT change `db:migrate` (`prisma migrate dev`) — add a new script only
- Do NOT remove `ADMIN_API_KEY` from `render.yaml` (separate cleanup)
- Do NOT echo/log any secret or the prod DB URL
- Do NOT point the migrate job at port 6543 / `pgbouncer=true` (breaks Prisma prepared statements)
- Do NOT let the new `migrate` job inherit the test job's local-CI DB env
- Do NOT accept "verified from code" as proof — the live merge must be exercised
- Do NOT enable auto-migrate before the prod drift pre-flight (Wave 0) is clean

---

## Verification Strategy (MANDATORY)

> ZERO HUMAN INTERVENTION for code/test ACs (agent-run commands). The GitHub-secret creation and the live merge approval are the only human touchpoints, by nature of the task.

### Test Decision

- **Infrastructure exists**: YES (vitest split: unit/integration/dashboard; CI postgres service)
- **Automated tests**: Tests-after (fix existing tests to green)
- **Framework**: vitest
- **Local commands**: `pnpm build`, `pnpm test:unit`, `pnpm test:db:setup`, `pnpm test:integration`, `pnpm lint`, `pnpm test:dashboard`

### QA Policy

- CI assertions: `gh run list/view --json conclusion`
- Gateway: `curl https://ai-employees-laaa.onrender.com/health`
- Worker: `flyctl image show -a ai-employee-workers` (digest before/after)
- Prod DB: read-only `prisma migrate status` (NEVER write in QA)
- Evidence saved to `.sisyphus/evidence/ci-pipeline/`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (MANUAL pre-flight — MUST complete & be clean before Wave 2 automation):
└── Task 0: Prod migration-drift check (read-only) + prod DB backup

Wave 1 (Start immediately — independent fixes, MAX PARALLEL):
├── Task 1: pnpm version pin (package.json + deploy.yml action-setup@v4)
├── Task 2: Fix admin-members RBAC unit test
├── Task 3: Modernize integration auth — admin-projects (4 files)
├── Task 4: Modernize integration auth — admin-kb-crud + admin-property-locks
├── Task 5: Modernize integration auth — admin-tenants (mock-Prisma + error bodies)
└── Task 6: Modernize integration auth — jira-webhook-with-new-project

Wave 2 (After Wave 1 green + Wave 0 clean — workflow automation):
├── Task 7: Add gated `migrate` job (secret, port guard, PostgREST reload)
├── Task 8: Job ordering + workflow concurrency
└── Task 9: Render auto-deploy OFF; GH Actions triggers+watches+reports gateway deploy (with logs)

Wave 3 (After Wave 2 — secrets, docs, live proof):
├── Task 10: Add GitHub Actions secrets (PROD_DATABASE_URL_DIRECT, FLY_API_TOKEN, [RENDER_DEPLOY_HOOK_URL])
├── Task 11: Docs update (AGENTS.md + production-debugging guide)
└── Task 12: Live merge E2E — capture all AC evidence

Wave FINAL (4 parallel reviews → user okay):
├── F1: Plan compliance (oracle)
├── F2: Code/workflow quality + local CI green (unspecified-high)
├── F3: Live deploy QA — real merge proof (unspecified-high)
└── F4: Scope fidelity (deep)

Critical Path: Task 0 → Task 1 → (Tasks 3-6) → Task 7 → Task 8 → Task 9 → Task 10 → Task 12 → F1-F4 → user okay
```

### Dependency Matrix

- **0**: deps none — blocks 7,12 (automation gated on clean drift)
- **1**: deps none — blocks 7,8,9,12 (CI must pass pnpm step)
- **2**: deps none — blocks 12
- **3-6**: deps none — block 12 (CI green needed)
- **7**: deps 0,1 — blocks 8,9,12
- **8**: deps 7 — blocks 12
- **9**: deps 7 — blocks 12
- **10**: deps none (can run early) — blocks 12
- **11**: deps 7,8,9 — blocks 12
- **12**: deps 1-11 — blocks FINAL

### Agent Dispatch Summary

- **0**: `deep` (prod DB safety, read-only)
- **1**: `quick`
- **2**: `quick`
- **3-6**: `unspecified-high` (test modernization, 4 tasks)
- **7**: `deep` (prod migrate job, highest risk)
- **8-9**: `unspecified-high`
- **10**: `quick` (human-assisted secrets)
- **11**: `writing`
- **12**: `unspecified-high` (+ live verification)
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 0. **Prod migration-drift pre-flight + backup (READ-ONLY / safety)**

  **What to do**:
  - Take a prod DB backup FIRST (AGENTS.md mandate). Use the documented backup approach (pg_dump or psql JSON export) of at least `_prisma_migrations` + critical tables; record the path/timestamp.
  - Run READ-ONLY `prisma migrate status` against prod using `DATABASE_URL_DIRECT` (port 5432): `DATABASE_URL=<prod-direct> DATABASE_URL_DIRECT=<prod-direct> pnpm prisma migrate status`. Capture full output.
  - Reconcile any drift: if status reports "Database schema is up to date!" → clean, proceed. If it reports failed/modified/pending migrations, DOCUMENT each and STOP — surface to user before any automation lands (do NOT auto-resolve drift).
  - Grep the 59 migrations for unguarded destructive DDL already flagged (`drop_dead_tables`, `drop_feedback_and_learned_rules`, etc.) — confirm they are ALL in the "applied" set in `_prisma_migrations` (i.e., not pending). Record.

  **Must NOT do**: Do NOT run `migrate deploy` or any write. Do NOT auto-fix drift. READ-ONLY only.

  **Recommended Agent Profile**:
  - **Category**: `deep` — production DB safety, careful reconciliation.
  - **Skills**: [] — no skill overlap; prod creds from `.env`.

  **Parallelization**: Can Run In Parallel: YES (Wave 0). Blocks: 7, 12. Blocked By: None.

  **References**:
  - `.env` — `DATABASE_URL_DIRECT` (or pull from Render env via API as done in research).
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` — prior manual-apply + `_prisma_migrations` back-fill notes (drift origin).
  - AGENTS.md "Database Backup (MANDATORY...)" — backup procedure + `database-backups/` location.
  - `prisma/migrations/` — 59 dirs; the 6 destructive ones flagged in research.

  **Acceptance Criteria**:
  - [ ] Backup created; path recorded in notepad.
  - [ ] `prisma migrate status` output captured verbatim in `.sisyphus/evidence/ci-pipeline/task-0-migrate-status.txt`.
  - [ ] Verdict recorded: CLEAN (up to date) or DRIFT (with specifics) — if DRIFT, plan execution pauses for user.

  **QA Scenarios**:

  ```
  Scenario: Prod schema is in sync (happy path)
    Tool: Bash (psql + prisma)
    Steps:
      1. Run prisma migrate status against prod direct URL (5432).
      2. Assert output contains "Database schema is up to date".
    Expected Result: Clean status; automation may proceed.
    Evidence: .sisyphus/evidence/ci-pipeline/task-0-migrate-status.txt

  Scenario: Drift detected (failure path)
    Tool: Bash
    Steps:
      1. Status reports failed/pending/modified migration.
      2. Record each; DO NOT proceed to Wave 2; surface to user.
    Expected Result: Documented drift, execution paused.
    Evidence: .sisyphus/evidence/ci-pipeline/task-0-drift.txt
  ```

  **Commit**: NO (read-only/evidence only).

- [x] 1. **Pin pnpm version (the #1 CI blocker)**

  **What to do**:
  - Add `"packageManager": "pnpm@10.24.0"` to `package.json` (top-level, near `"engines"`). Version matches local pnpm 10.24.0 and lockfileVersion 9.0.
  - In `.github/workflows/deploy.yml`, change `- uses: pnpm/action-setup@v3` → `- uses: pnpm/action-setup@v4` (v4 reads `packageManager` reliably; no explicit `version:` needed once the field exists).
  - Verify `pnpm install --frozen-lockfile` still resolves with the pinned version (run locally).

  **Must NOT do**: Do NOT change `actions/setup-node@v4` `cache: 'pnpm'` ordering (pnpm setup must stay BEFORE setup-node). Do NOT alter the dashboard install steps' structure.

  **Recommended Agent Profile**: Category `quick` — two-line config change. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1). Blocks: 7,8,9,12. Blocked By: None.

  **References**:
  - `.github/workflows/deploy.yml:25` — the bare `pnpm/action-setup@v3`.
  - `package.json` — `engines` block placement; current pnpm via `pnpm --version` = 10.24.0.
  - `pnpm-lock.yaml:1` — `lockfileVersion: '9.0'` (confirms pnpm 9+/10).

  **Acceptance Criteria**:
  - [ ] `node -e "console.log(require('./package.json').packageManager)"` → `pnpm@10.24.0`.
  - [ ] `grep "pnpm/action-setup@v4" .github/workflows/deploy.yml` matches; no `@v3` remains.
  - [ ] `pnpm install --frozen-lockfile` exits 0 locally.

  **QA Scenarios**:

  ```
  Scenario: pnpm resolves in a clean install
    Tool: Bash
    Steps:
      1. Run `pnpm install --frozen-lockfile`.
      2. Assert exit 0, no "Cannot determine pnpm version" / no lockfile mismatch.
    Expected Result: Clean install.
    Evidence: .sisyphus/evidence/ci-pipeline/task-1-install.txt
  ```

  **Commit**: YES (Group A). Message: `ci: pin pnpm version so deploy workflow runs`. Files: `package.json`, `.github/workflows/deploy.yml`. Pre-commit: `pnpm install --frozen-lockfile`.

- [x] 2. **Fix admin-members RBAC unit test (test is wrong, code is correct)**

  **What to do**:
  - In `tests/unit/gateway/routes/admin-members.test.ts`, the case "returns 403 for a MEMBER role" (~line 140-147) wrongly expects 403. The route `GET /admin/tenants/:tenantId/members` uses `requireTenantRole(TenantRole.VIEWER)`, so MEMBER (rank 2 > VIEWER rank 1) is correctly allowed → 200.
  - Update the test: change expectation to `200` and assert the returned members body shape (matching what the route returns), OR convert it to a positive "MEMBER can list members" assertion. Keep any genuinely-403 cases (e.g., a VIEWER attempting a write, if present) intact.
  - Do NOT modify `src/gateway/routes/admin-members.ts` or authz.

  **Must NOT do**: Do NOT weaken other RBAC assertions in the file. Do NOT touch route/authz code.

  **Recommended Agent Profile**: Category `quick` — single test correction. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1). Blocks: 12. Blocked By: None.

  **References**:
  - `tests/unit/gateway/routes/admin-members.test.ts:~140` — the wrong 403 expectation.
  - `src/gateway/routes/admin-members.ts:65` — `requireTenantRole(TenantRole.VIEWER)` on GET (the source of truth).
  - `src/lib/auth/permissions.ts` (or authz.ts) — role rank order OWNER(4)>ADMIN(3)>MEMBER(2)>VIEWER(1).

  **Acceptance Criteria**:
  - [ ] `pnpm exec vitest run tests/unit/gateway/routes/admin-members.test.ts` → 0 failed.
  - [ ] `git diff src/gateway/routes/admin-members.ts` is EMPTY (no source change).

  **QA Scenarios**:

  ```
  Scenario: MEMBER can list members (corrected expectation)
    Tool: Bash (vitest)
    Steps:
      1. Run the single test file.
      2. Assert "Tests  0 failed" and the MEMBER case asserts 200 + body.
    Expected Result: File passes; source untouched.
    Evidence: .sisyphus/evidence/ci-pipeline/task-2-admin-members.txt
  ```

  **Commit**: YES (Group B). Message: `test: fix admin-members RBAC expectation (MEMBER may list members)`. Files: `tests/unit/gateway/routes/admin-members.test.ts`. Pre-commit: vitest on that file.

> **SHARED PATTERN for Tasks 3-6 (integration auth modernization)** — read before each:
> All 8 files fail because they authenticate the OLD way. The fix per file:
>
> 1. In `beforeEach`/`beforeAll`, set `process.env.SERVICE_TOKEN = '<test-token>'` (lazy-read by `SERVICE_TOKEN()` in `src/lib/config.ts` at call time — setting it per-test is valid).
> 2. Replace request auth: `.set('X-Admin-Key', ...)` / `process.env.ADMIN_API_KEY` usage → `.set('Authorization', 'Bearer ' + process.env.SERVICE_TOKEN)`.
> 3. Update unauthorized-case assertions: old `{ error: 'Unauthorized' }` (status 401) → new `sendError` shape with code `AUTHENTICATION_REQUIRED` (verify exact body via `src/gateway/lib/http-response.ts` `sendError`).
> 4. Keep each test's INTENT (the status codes 200/201/400/404/409 they assert for authorized requests) — only the AUTH layer changes.
> 5. Auth is wired INSIDE each route module (e.g. `src/gateway/routes/admin-kb.ts` mounts `authMiddleware`), so mounting the router enforces auth — tests don't add middleware.
>    Reference a now-passing integration test that already uses Bearer (search `tests/integration` for `Authorization', 'Bearer`) as the canonical example.

- [x] 3. **Modernize integration auth — admin-projects (4 files)**

  **What to do**: Apply the SHARED PATTERN to:
  - `tests/integration/gateway/admin-projects-create.test.ts` (6 failures)
  - `tests/integration/gateway/admin-projects-read.test.ts` (6)
  - `tests/integration/gateway/admin-projects-update.test.ts` (8)
  - `tests/integration/gateway/admin-projects-delete.test.ts` (7)

  **Must NOT do**: Don't change the route logic; don't alter the authorized-path status assertions; don't touch other integration files.

  **Recommended Agent Profile**: Category `unspecified-high` — multi-file test refactor with shared pattern. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1, with 2,4,5,6). Blocks: 12. Blocked By: None.

  **References**:
  - SHARED PATTERN above. `src/lib/config.ts` `SERVICE_TOKEN()` (lazy `requireEnv`). `src/gateway/middleware/auth.ts:26-58` (Bearer check + `AUTHENTICATION_REQUIRED`). `src/gateway/lib/http-response.ts` (`sendError` body shape). A passing `tests/integration/**` file using Bearer as the example.

  **Acceptance Criteria**:
  - [ ] `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gateway/admin-projects-*.test.ts` → 0 failed (requires DB env: `DATABASE_URL=...54322/ai_employee_test`).
  - [ ] No `X-Admin-Key` / `ADMIN_API_KEY` references remain in these 4 files.

  **QA Scenarios**:

  ```
  Scenario: admin-projects suite passes with Bearer auth
    Tool: Bash (vitest integration)
    Steps:
      1. pnpm test:db:setup
      2. Run the 4 files with integration config + DB env.
      3. Assert "Tests  0 failed".
    Evidence: .sisyphus/evidence/ci-pipeline/task-3-admin-projects.txt

  Scenario: unauthorized request still 401 with new code
    Tool: Bash
    Steps:
      1. A no-token case asserts 401 + AUTHENTICATION_REQUIRED.
    Expected Result: Negative path correct (not the old 'Unauthorized').
    Evidence: .sisyphus/evidence/ci-pipeline/task-3-negative.txt
  ```

  **Commit**: YES (Group B). Message: `test: modernize admin-projects integration tests to Bearer auth`. Files: the 4 files. Pre-commit: vitest integration on the 4 files.

- [x] 4. **Modernize integration auth — admin-kb-crud + admin-property-locks**

  **What to do**: Apply the SHARED PATTERN to:
  - `tests/integration/gateway/admin-kb-crud.test.ts` (27 failures — largest)
  - `tests/integration/gateway/admin-property-locks-integration.test.ts` (4)

  **Must NOT do**: No route/source changes; keep authorized-path assertions; don't touch other files.

  **Recommended Agent Profile**: Category `unspecified-high` — large file (27 cases) needs care. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1). Blocks: 12. Blocked By: None.

  **References**: SHARED PATTERN. `src/gateway/routes/admin-kb.ts` (auth wired inside). Same auth refs as Task 3.

  **Acceptance Criteria**:
  - [ ] `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gateway/admin-kb-crud.test.ts tests/integration/gateway/admin-property-locks-integration.test.ts` → 0 failed.
  - [ ] No old-auth references remain.

  **QA Scenarios**:

  ```
  Scenario: admin-kb + property-locks pass with Bearer
    Tool: Bash (vitest integration)
    Steps:
      1. pnpm test:db:setup; run both files with DB env.
      2. Assert "Tests  0 failed" (27+4 cases now pass).
    Evidence: .sisyphus/evidence/ci-pipeline/task-4-kb-locks.txt
  ```

  **Commit**: YES (Group B). Message: `test: modernize admin-kb + property-locks integration tests to Bearer auth`. Files: the 2 files. Pre-commit: vitest integration on the 2 files.

- [x] 5. **Modernize integration auth — admin-tenants (mock-Prisma + error bodies)**

  **What to do**: Apply the SHARED PATTERN to `tests/integration/gateway/routes/admin-tenants.test.ts` (21 failures). NOTE: this file is a MOCK-Prisma test (not real-DB) and ALSO asserts the OLD error body `{ error: 'Unauthorized' }` (~line 57) — update those to the new `AUTHENTICATION_REQUIRED` `sendError` shape in addition to the header swap.

  **Must NOT do**: No source changes; don't convert it to a real-DB test; keep the mock structure.

  **Recommended Agent Profile**: Category `unspecified-high` — 21 cases + error-body nuance. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1). Blocks: 12. Blocked By: None.

  **References**: SHARED PATTERN. `tests/integration/gateway/routes/admin-tenants.test.ts:57` (old error body). `src/gateway/lib/http-response.ts` (`sendError`). `src/gateway/middleware/auth.ts:58`.

  **Acceptance Criteria**:
  - [ ] `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gateway/routes/admin-tenants.test.ts` → 0 failed.
  - [ ] No `{ error: 'Unauthorized' }` assertions or `X-Admin-Key` remain.

  **QA Scenarios**:

  ```
  Scenario: admin-tenants passes with Bearer + new error body
    Tool: Bash (vitest)
    Steps:
      1. Run the file with integration config.
      2. Assert "Tests  0 failed"; negative cases assert AUTHENTICATION_REQUIRED.
    Evidence: .sisyphus/evidence/ci-pipeline/task-5-admin-tenants.txt
  ```

  **Commit**: YES (Group B). Message: `test: modernize admin-tenants tests to Bearer auth + new error shape`. Files: the 1 file. Pre-commit: vitest on the file.

- [x] 6. **Modernize integration auth — jira-webhook-with-new-project**

  **What to do**: Apply the SHARED PATTERN to `tests/integration/gateway/jira-webhook-with-new-project.test.ts` (1 failure). This one may mix webhook-signature auth with admin auth — only change the ADMIN-auth path that's failing on 401; leave Jira HMAC signature logic alone.

  **Must NOT do**: Don't touch Jira HMAC/webhook signature verification; no source changes.

  **Recommended Agent Profile**: Category `unspecified-high` — needs to distinguish webhook vs admin auth. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1). Blocks: 12. Blocked By: None.

  **References**: SHARED PATTERN. `tests/integration/gateway/jira-webhook-with-new-project.test.ts`. `src/gateway/validation/` (HMAC sig — DO NOT change).

  **Acceptance Criteria**:
  - [ ] `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/gateway/jira-webhook-with-new-project.test.ts` → 0 failed.

  **QA Scenarios**:

  ```
  Scenario: jira-webhook-with-new-project passes
    Tool: Bash (vitest)
    Steps:
      1. Run the file with integration config + DB env.
      2. Assert "Tests  0 failed"; HMAC path untouched.
    Evidence: .sisyphus/evidence/ci-pipeline/task-6-jira-webhook.txt
  ```

  **Commit**: YES (Group B). Message: `test: modernize jira-webhook-with-new-project admin auth to Bearer`. Files: the 1 file. Pre-commit: vitest on the file.

- [x] 7. **Add gated `migrate` job (prod migrate deploy + port guard + PostgREST reload)**

  **What to do**: In `.github/workflows/deploy.yml`, add a new `migrate` job:
  - `needs: test` (only runs if CI green).
  - Steps: checkout → `pnpm/action-setup@v4` → `setup-node@v4` (cache pnpm) → `pnpm install --frozen-lockfile`.
  - **Port-5432 guard step** (fail fast): if `PROD_DATABASE_URL_DIRECT` contains `:6543` or `pgbouncer`, exit 1 with a clear message (do NOT echo the URL — test with a masked check, e.g. grep on the value via a shell `case`/`[[ ]]` without printing it).
  - **Migrate step**: `pnpm prisma migrate deploy` with `env: DATABASE_URL: ${{ secrets.PROD_DATABASE_URL_DIRECT }}` and `DATABASE_URL_DIRECT: ${{ secrets.PROD_DATABASE_URL_DIRECT }}` (both set to the direct 5432 URL; never inherit the test job's local DB env).
  - **PostgREST schema-cache reload step** AFTER migrate: `psql "$PROD_DATABASE_URL_DIRECT" -c "NOTIFY pgrst, 'reload schema';"` (or the documented reload mechanism from the cloud guide). Needed so new tables are visible to workers (else `PGRST205`).
  - Never `echo`/print the secret; rely on GH masking; pass only via step `env:`.

  **Must NOT do**: Do NOT use the pooled 6543 URL. Do NOT run `migrate dev`/`reset`. Do NOT let this job inherit the `test` job env. Do NOT echo secrets.

  **Recommended Agent Profile**: Category `deep` — production migration job, highest blast radius. Skills: [].

  **Parallelization**: Can Run In Parallel: NO (Wave 2 start). Blocks: 8,9,12. Blocked By: 0 (clean drift), 1 (pnpm).

  **References**:
  - `.github/workflows/deploy.yml` — current job structure (lines 7-67).
  - `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` + `docs/guides/2026-06-01-2246-production-debugging-guide.md` — PostgREST reload (`NOTIFY pgrst, 'reload schema'`), port 5432-vs-6543 rule, IPv6 direct-host note.
  - `prisma/schema.prisma` — `directUrl = env("DATABASE_URL_DIRECT")`.
  - Task 0 evidence — confirms prod is in sync before this runs.

  **Acceptance Criteria**:
  - [ ] `migrate` job exists with `needs: test`; uses `secrets.PROD_DATABASE_URL_DIRECT`.
  - [ ] Port guard present (fails on 6543/pgbouncer) and does NOT print the URL.
  - [ ] PostgREST reload step present after migrate.
  - [ ] YAML valid (`gh workflow view` or actionlint).

  **QA Scenarios**:

  ```
  Scenario: migrate job steady-state (no pending migrations)
    Tool: Bash (live, via the real merge in Task 12)
    Steps:
      1. After a merge, open the migrate job log.
      2. Assert it connected and printed "No pending migrations to apply." (prod already in sync from Task 0).
      3. Assert PostgREST reload step exited 0.
    Expected Result: migrate ran, nothing destructive, reload ok.
    Evidence: .sisyphus/evidence/ci-pipeline/task-7-migrate-log.txt

  Scenario: port guard rejects pooled URL (failure path)
    Tool: Bash (scratch branch)
    Steps:
      1. Temporarily set a scratch secret/value containing :6543.
      2. Assert the guard step fails fast WITHOUT printing the URL.
      3. Revert.
    Expected Result: Guard blocks 6543; no secret leak.
    Evidence: .sisyphus/evidence/ci-pipeline/task-7-guard.txt
  ```

  **Commit**: YES (Group C). Message: `ci: add gated prod migrate job with port guard and PostgREST reload`. Files: `.github/workflows/deploy.yml`. Pre-commit: actionlint/YAML check.

- [x] 8. **Job ordering + workflow concurrency**

  **What to do**:
  - Add workflow-level `concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: false }` so overlapping merges SERIALIZE migrate jobs (never cancel a mid-flight migrate).
  - Ensure deploy ordering so the gateway does not boot against an un-migrated schema: the gateway deploy path must depend on `migrate` (see Task 9 for the exact gateway path chosen). The Fly `deploy-worker` job: gate `needs: test` (or `needs: [test, migrate]` if it reads new schema at build — default `needs: test` is fine since the image is built, not run).

  **Must NOT do**: Do NOT set `cancel-in-progress: true` (would abort a running migrate). Do NOT remove `--platform linux/amd64` from the worker build.

  **Recommended Agent Profile**: Category `unspecified-high` — workflow graph correctness. Skills: [].

  **Parallelization**: Can Run In Parallel: NO (after 7). Blocks: 12. Blocked By: 7.

  **References**:
  - `.github/workflows/deploy.yml` — `jobs` graph; `deploy-gateway`/`deploy-worker` `needs:`.
  - GitHub Actions `concurrency` + `needs` semantics.
  - Metis EC1 (concurrent deploys) + EC4 (worker platform).

  **Acceptance Criteria**:
  - [ ] Workflow has `concurrency` with `cancel-in-progress: false`.
  - [ ] Gateway deploy path `needs` includes `migrate` (per Task 9 resolution).
  - [ ] `deploy-worker` retains `--platform linux/amd64`.

  **QA Scenarios**:

  ```
  Scenario: job graph orders migrate before gateway
    Tool: Bash (gh run view on the Task 12 merge)
    Steps:
      1. Inspect the run's job dependency graph.
      2. Assert gateway-deploy started only AFTER migrate concluded.
    Evidence: .sisyphus/evidence/ci-pipeline/task-8-ordering.txt
  ```

  **Commit**: YES (Group C). Message: `ci: serialize deploys via concurrency and order gateway after migrate`. Files: `.github/workflows/deploy.yml`. Pre-commit: YAML check.

- [x] 9. **Single gateway deploy path — GitHub Actions triggers, watches, and reports the Render deploy (with logs)** (workflow code done + render.yaml; live Render autoDeploy=no PATCH performed just before Task 12)

  **What to do**: Make GitHub Actions the SINGLE source of truth and control panel for the gateway deploy, so the whole story (tests → migrate → deploy triggered → deploy live/failed + logs) is visible in ONE Actions run. Today there are TWO independent triggers (Render `autoDeploy: yes` on push + the GH `deploy-gateway` curl) → double deploy and split visibility. Implement:
  - **Switch OFF Render auto-deploy** so Render no longer reacts to pushes on its own: `PATCH` the live service `srv-d8f1b2gg4nts738dj7jg` setting `autoDeploy: "no"` via the Render API (also reflect `autoDeploy: false` in `render.yaml` so the Blueprint matches reality). This is a settings toggle — nothing is deleted; GitHub Actions becomes the only trigger.
  - **Upgrade the `deploy-gateway` job from "fire-and-forget" to "trigger + watch + report"** (gated `needs: [test, migrate]`):
    1. Trigger the deploy via `secrets.RENDER_DEPLOY_HOOK_URL` AND capture the returned deploy id (the hook response, or immediately query `GET /services/{id}/deploys?limit=1` for the new deploy id).
    2. **Poll** `GET /services/{id}/deploys/{deployId}` (using `secrets.RENDER_API_KEY`) every ~15-30s until a terminal status (`live` / `build_failed` / `update_failed` / `canceled`). Mirror the proven poll loop used during the session.
    3. **Pull Render's deploy logs into the Actions run output** (`GET /v1/logs?...&resource=srv-...`) so the build/boot logs appear in the GitHub Actions log — single pane of glass.
    4. **Fail the job** (non-zero exit) if the terminal status is anything other than `live`, so a bad deploy turns the Actions run red.
  - This needs a NEW secret `RENDER_API_KEY` (for polling + logs) in addition to `RENDER_DEPLOY_HOOK_URL` — see Task 10.
  - Never print secrets; query the API with the key passed via step `env:` only.
  - **Note (out of scope, document as a future option)**: the gateway image BUILD still physically runs on Render's machines — Actions triggers/watches/reports it but does not execute the build. Moving the build itself into GitHub Actions (like the Fly worker already is) is a larger separate effort; record it as a future enhancement, do NOT attempt it here.

  **Must NOT do**: Do NOT leave Render `autoDeploy` ON (would double-deploy). Do NOT delete the Render service or its env. Do NOT make the deploy "fire-and-forget" (must watch + report). Do NOT print the API key or hook URL. Do NOT migrate the gateway build off Render in this plan.

  **Recommended Agent Profile**: Category `unspecified-high` — Render API orchestration + workflow scripting + poll/report logic. Skills: [].

  **Parallelization**: Can Run In Parallel: NO (after 7). Blocks: 12. Blocked By: 7.

  **References**:
  - `render.yaml` (Blueprint — set `autoDeploy: false`) + live service `srv-d8f1b2gg4nts738dj7jg` (Render API `PATCH /services/{id}` `autoDeploy`).
  - `.github/workflows/deploy.yml:48-53` (`deploy-gateway` curl → upgrade to trigger+watch+report).
  - Render API: `POST` deploy hook; `GET /v1/services/{id}/deploys` + `/deploys/{deployId}`; `GET /v1/logs?ownerId=...&resource=srv-...` (proven during this session).
  - Metis R3/Q4 (double-deploy resolution + single trigger path).

  **Acceptance Criteria**:
  - [ ] Render `autoDeploy` is `no` on the live service AND `render.yaml` shows `autoDeploy: false`.
  - [ ] `deploy-gateway` job: gated `needs: [test, migrate]`, triggers the deploy, polls to a terminal status, prints Render logs into the Actions output, and FAILS the job unless status is `live`.
  - [ ] Exactly ONE Render deploy occurs per merge (no double-deploy).
  - [ ] The whole deploy outcome (live/failed + logs) is visible inside the single GitHub Actions run.

  **QA Scenarios**:

  ```
  Scenario: one deploy, watched to "live", logs visible in Actions (happy path)
    Tool: Bash (gh run view + Render API, via the Task 12 merge)
    Steps:
      1. After merge, open the deploy-gateway job log in the Actions run.
      2. Assert it shows the deploy id, polled status transitions, ending in "live".
      3. Assert Render build/boot log lines appear inside the Actions output.
      4. List Render deploys for the commit → assert exactly ONE.
    Expected Result: Single deploy, fully observable from GitHub Actions.
    Evidence: .sisyphus/evidence/ci-pipeline/task-9-watch-report.txt

  Scenario: Render auto-deploy no longer fires on push (isolation proof)
    Tool: Bash (Render API)
    Steps:
      1. Confirm service autoDeploy == "no".
      2. Around the merge, assert no SECOND deploy appears that wasn't triggered by the Actions hook.
    Expected Result: GitHub Actions is the sole trigger.
    Evidence: .sisyphus/evidence/ci-pipeline/task-9-autodeploy-off.txt
  ```

  **Commit**: YES (Group C). Message: `ci: GitHub Actions triggers+watches+reports gateway deploy; disable Render auto-deploy`. Files: `.github/workflows/deploy.yml`, `render.yaml` (+ live Render setting via API, documented). Pre-commit: YAML check.

- [x] 10. **Add GitHub Actions secrets** (PROD_DATABASE_URL_DIRECT=session-pooler:5432, FLY_API_TOKEN, RENDER_API_KEY set; RENDER_DEPLOY_HOOK_URL eliminated by switching gateway trigger to Render API)

  **What to do**: The repo has ZERO Actions secrets. Add (via `gh secret set` or the GitHub UI — REQUIRES the user, as the agent must not invent secret values):
  - `PROD_DATABASE_URL_DIRECT` = prod direct URL on port **5432** (`postgresql://postgres:<pw>@db.gjqrysxpvktmibpkwrvy.supabase.co:5432/postgres`). NOT 6543, no `pgbouncer`.
  - `FLY_API_TOKEN` = the Fly token used by `deploy-worker` (from `.env` `FLY_API_TOKEN` or a fresh `fly tokens create`).
  - `RENDER_DEPLOY_HOOK_URL` = the Render deploy hook (from Render dashboard → service → Settings → Deploy Hook) — triggers the gateway deploy (Task 9).
  - `RENDER_API_KEY` = a Render API key (from `.env` `RENDER_API_KEY` or Render dashboard → Account → API Keys) — needed by Task 9 to POLL the deploy status to a terminal state and PULL Render logs into the Actions run.
  - Verify with `gh api repos/<owner>/<repo>/actions/secrets` → names reflect the added secrets (names only; values never printed).

  **Must NOT do**: Do NOT hardcode secret values in any file. Do NOT print secret values. Do NOT commit secrets.

  **Recommended Agent Profile**: Category `quick` — orchestrates `gh secret set` with user-provided values. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (can start early, independent). Blocks: 12. Blocked By: None (but values come from user).

  **References**:
  - `gh secret set <NAME> --repo viiqswim/dozaldevs-ai-employee` (reads value from stdin/env).
  - `.env` — `FLY_API_TOKEN`, `RENDER_API_KEY`. Render dashboard for the deploy hook. Prod direct URL (Render env `DATABASE_URL_DIRECT`).
  - Metis R6 (no secret in logs), EC3 (port 5432).

  **Acceptance Criteria**:
  - [ ] `gh api repos/viiqswim/dozaldevs-ai-employee/actions/secrets --jq '.secrets[].name'` lists `PROD_DATABASE_URL_DIRECT`, `FLY_API_TOKEN`, `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_KEY`.
  - [ ] No secret value appears in any command output/log.

  **QA Scenarios**:

  ```
  Scenario: secrets present (names only)
    Tool: Bash (gh api)
    Steps:
      1. List actions secrets names.
      2. Assert the 4 names present; values never shown.
    Evidence: .sisyphus/evidence/ci-pipeline/task-10-secrets.txt
  ```

  **Commit**: NO (secrets live in GitHub, not the repo).

- [x] 11. **Docs update — pipeline behavior + gotchas**

  **What to do**:
  - AGENTS.md: document that merge-to-`main` now auto-runs CI → migrate (prod, gated) → gateway deploy → Fly worker rebuild; note the `migrate` job uses `PROD_DATABASE_URL_DIRECT` (5432) and runs a PostgREST reload; note the single-deploy decision (Render autoDeploy `no` + gated hook).
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md`: add a "CI auto-deploy/auto-migrate" section — how to read the Deploy run, the port-5432 requirement, the PostgREST reload, concurrency serialization, and how to recover if migrate fails mid-run (restore from the Task 0 backup).
  - Update any stale "CI is broken / deploys manual" notes (e.g., earlier research docs / AGENTS.md Render section).

  **Must NOT do**: Don't restate volatile counts; describe patterns/invariants. Don't rewrite unrelated sections.

  **Recommended Agent Profile**: Category `writing`. Skills: [].

  **Parallelization**: Can Run In Parallel: NO (after 7,8,9 land). Blocks: 12. Blocked By: 7,8,9.

  **References**: AGENTS.md "Render API (Production Gateway)" + "Documentation Freshness". `docs/guides/2026-06-01-2246-production-debugging-guide.md`. `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md`.

  **Acceptance Criteria**:
  - [ ] AGENTS.md describes the auto-deploy+auto-migrate flow + single-deploy decision.
  - [ ] Production-debugging guide has a CI-pipeline section incl. migrate-failure recovery.
  - [ ] No stale "deploys are manual / CI broken" claims remain.

  **QA Scenarios**:

  ```
  Scenario: docs reflect the new pipeline
    Tool: Bash (grep)
    Steps:
      1. grep AGENTS.md for "migrate deploy" + "PostgREST reload" + auto-deploy note.
      2. grep the guide for the new CI section.
    Evidence: .sisyphus/evidence/ci-pipeline/task-11-docs.txt
  ```

  **Commit**: YES (Group D). Message: `docs: document auto-deploy + auto-migrate CI pipeline`. Files: AGENTS.md, the guide. Pre-commit: none.

- [ ] 12. **Live merge E2E — prove all four behaviors** (IN PROGRESS: merged #14+#16; CI exposed 2 pre-existing latent failures now that the test job finally runs — (a) missing prisma generate [FIXED #16], (b) @prisma/client lockfile pin [FIXED ad7ed30a], (c) process.exit leak from opencode-harness-metrics.test.ts [fixing])

  **What to do**:
  - Ensure Wave 0 is CLEAN and a fresh prod backup exists. Open a TRIVIAL PR (one-line README touch) on branch `ci/verify-deploy-2026-06-10`, get CI green on the PR, merge to `main`.
  - Capture: the Deploy run URL; conclusions of `test`, `migrate`, `deploy-gateway`, `deploy-worker`; that `migrate` ran BEFORE gateway; PostgREST reload exited 0; that `deploy-gateway` WATCHED the deploy to `live` and Render logs are visible INSIDE the Actions run; exactly ONE Render deploy for the commit (and Render autoDeploy is OFF); `/health` 200; Fly `:latest` digest BEFORE vs AFTER (changed); and `grep` the run logs prove NO secret/DB-host string leaked.
  - Run read-only `prisma migrate status` against prod post-merge → "up to date".

  **Must NOT do**: Don't fabricate results; don't accept "from code"; don't skip the digest before/after capture.

  **Recommended Agent Profile**: Category `unspecified-high` (+ live verification). Skills: [].

  **Parallelization**: Can Run In Parallel: NO (final). Blocks: FINAL. Blocked By: 1-11.

  **References**: `gh run list/view`, `flyctl image show -a ai-employee-workers`, Render API deploys, `curl /health`. Metis AC1-AC13.

  **Acceptance Criteria** (all agent-run):
  - [ ] `gh run list --workflow=Deploy --branch=main --limit=1 --json conclusion` → `success`.
  - [ ] `migrate`, `deploy-gateway`, `deploy-worker` all `success` in that run.
  - [ ] Gateway: `curl -s https://ai-employees-laaa.onrender.com/health` → `{"status":"ok"}`; exactly ONE Render deploy for the commit.
  - [ ] Worker: Fly `:latest` digest changed (record both).
  - [ ] No secret/DB-host string in run logs.
  - [ ] Post-merge `prisma migrate status` → up to date.

  **QA Scenarios**:

  ```
  Scenario: merge → green CI → migrate → single gateway deploy → worker rebuild
    Tool: Bash (gh + flyctl + curl + render API)
    Steps:
      1. Record Fly digest BEFORE. Merge the trivial PR.
      2. Poll the Deploy run to completion; assert all jobs success.
      3. Assert migrate ordered before gateway; reload ok.
      4. curl /health = 200; exactly one Render deploy for the commit.
      5. Record Fly digest AFTER; assert changed.
      6. grep logs: zero secret/DB-host leaks.
    Expected Result: All four behaviors proven.
    Evidence: .sisyphus/evidence/ci-pipeline/task-12-live-merge.txt
  ```

  **Commit**: NO (the trivial README PR is its own merge; evidence only).

- [ ] **13. Notify completion** — Send Telegram: plan complete, all tasks done, come back to review. Run: `tsx scripts/telegram-notify.ts "✅ CI deploy pipeline automation complete — green CI + auto-migrate + auto-deploy verified on a live merge. Come back to review."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1-F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Verify each "Must Have" (pnpm step passes, unit 0-fail, integration 0-fail, migrate job gated + direct URL, PostgREST reload, single gateway deploy, worker digest changes, live merge proof). Verify each "Must NOT Have" (9 skips untouched, auth code untouched, no migration edits, db:migrate unchanged, no secrets logged, no 6543 in migrate). Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Workflow + Code Quality + Local CI Green** — `unspecified-high`
      Run `pnpm build`, `pnpm test:unit`, `pnpm test:db:setup`+`pnpm test:integration`, `pnpm lint`, `pnpm test:dashboard` — all must be 0-fail. Lint the YAML (job graph, concurrency, needs). Confirm no `as any`/secret-echo in test changes.
      Output: `Build | Unit [N/N] | Integration [N/N] | Lint | Dashboard | Workflow-valid | VERDICT`

- [ ] F3. **Live Deploy QA — real merge** — `unspecified-high`
      Exercise the live merge (Task 12 evidence): the Deploy run is `success`; `migrate` ran before gateway; PostgREST reload ran; `deploy-gateway` watched the deploy to `live` with Render logs surfaced in the Actions run; Render autoDeploy is OFF and exactly one deploy occurred; `/health` 200; Fly digest changed; no secret in logs. Re-capture if stale.
      Output: `Run success | migrate-ordered | reload | deploy-watched+logs | autodeploy-off | single-deploy | health | worker-digest-changed | secrets-clean | VERDICT`

- [ ] F4. **Scope Fidelity** — `deep`
      `git diff --name-only origin/main` — confirm only in-scope files (package.json, deploy.yml, 1 unit test, 8 integration tests, docs). No migration files touched, no auth code, no 9-skip changes, no 380-test churn. No secrets committed.
      Output: `Files [N/N in scope] | Protected intact | No secrets | VERDICT`

---

## Commit Strategy

- Group A (Task 1): `ci: pin pnpm version so deploy workflow runs`
- Group B (Tasks 2-6): `test: modernize admin route tests to Bearer/SERVICE_TOKEN auth`
- Group C (Tasks 7-9): `ci: add gated prod migrate job + serialize deploys + GH-Actions-controlled gateway deploy (Render autoDeploy off, watch+report)`
- Group D (Task 11): `docs: document auto-deploy + auto-migrate CI pipeline`

## Success Criteria

### Verification Commands

```bash
pnpm test:unit        # Tests  0 failed
pnpm test:integration # Tests  0 failed   (DATABASE_URL=...54322/ai_employee_test)
pnpm build && pnpm lint && pnpm test:dashboard  # all exit 0
gh run list --workflow=Deploy --branch=main --limit=1 --json conclusion  # success
curl -s https://ai-employees-laaa.onrender.com/health  # {"status":"ok"}
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Prod drift reconciled + backup recorded (Wave 0)
- [ ] Live merge proved deploy + migrate + worker-push
- [ ] Notify completion (Telegram)
