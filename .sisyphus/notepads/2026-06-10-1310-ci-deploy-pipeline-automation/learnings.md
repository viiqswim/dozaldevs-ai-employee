# Learnings — CI Deploy Pipeline Automation

## [2026-06-10] Session Start

### Key Facts (verified ground truth)

- `deploy.yml` fails at `pnpm/action-setup@v3` — no `packageManager` field in `package.json`, no `version:` in step
- Local pnpm version: 10.24.0; lockfileVersion: 9.0
- `pnpm test:unit`: 1 failed (admin-members RBAC — test wrong, code correct)
- `pnpm test:integration`: 80 failed across 8 files — all due to old `X-Admin-Key` auth
- New auth: `Authorization: Bearer <SERVICE_TOKEN>` — `SERVICE_TOKEN()` is lazy-read in `src/lib/config.ts`
- New error shape: `sendError()` with code `AUTHENTICATION_REQUIRED` (not `{ error: 'Unauthorized' }`)
- Render service: `srv-d8f1b2gg4nts738dj7jg`, `autoDeploy: yes` (to be switched OFF)
- Prod DB direct URL: port 5432 (NOT 6543, no pgbouncer)
- GitHub Actions secrets: total_count = 0 (all missing)

### Auth Fix Pattern (Tasks 3-6)

```typescript
// In beforeEach:
process.env.SERVICE_TOKEN = 'test-service-token';

// In request:
.set('Authorization', `Bearer ${process.env.SERVICE_TOKEN}`)

// For unauthorized assertions:
expect(res.body.code).toBe('AUTHENTICATION_REQUIRED')
// or check res.status === 401 + res.body.code
```

### sendError() shape

- Check `src/gateway/lib/http-response.ts` for exact body shape
- Returns `{ code: 'AUTHENTICATION_REQUIRED', message: '...' }` (not `{ error: 'Unauthorized' }`)

### deploy.yml structure (67 lines)

- `test` job: lines 8-46 (postgres service, pnpm, build, unit, integration, lint, dashboard)
- `deploy-gateway` job: lines 48-53 (needs: test, fire-and-forget curl)
- `deploy-worker` job: lines 55-67 (needs: test, fly buildx push)

## [2026-06-10 15:56] Task 0: Prod Migration Drift Pre-flight

- Backup path: /Users/victordozal/repos/dozal-devs/ai-employee/database-backups/2026-06-10-1556
- Backup contents: full-dump.sql (127M) + \_prisma_migrations.sql, archetypes.sql, employee_rules.sql, knowledge_base_entries.sql, tenant_secrets.sql
- Verdict: CLEAN (59/59 migrations applied, 0 pending) — LOCAL DATABASE
- Migrate status output: see .sisyphus/evidence/ci-pipeline/task-0-migrate-status.txt
- Destructive migrations: ALL APPLIED
  - 20260417175738_drop_slack_team_id_and_steps ✓
  - 20260512054756_drop_feedback_and_learned_rules ✓
  - 20260527233704_drop_deprecated_archetype_fields ✓
  - 202606080425250_drop_dead_tables ✓

⚠️ ENVIRONMENT DISCREPANCY — BLOCKER FOR TRUE PROD PRE-FLIGHT:
DATABASE*URL_DIRECT in .env = localhost:54322 (LOCAL Docker dev, NOT Supabase Cloud)
SUPABASE_ANON_KEY = eyJ... (local HS256 JWT profile, NOT cloud sb* key)
The local .env does NOT contain a production Supabase Cloud direct URL (port 5432).
Migrate status was run against LOCAL database — result is for local env only.
To run a true production pre-flight, obtain the prod Supabase direct URL from: - Render environment variables for the gateway service - Supabase Cloud dashboard → Project Settings → Database → Connection string (direct/port 5432)
Row counts at backup time: employee_rules=76, archetypes=19, tasks=2665, \_prisma_migrations=59

## [2026-06-10 16:04] Task 4: admin-kb + property-locks auth modernization — DONE

### ⚠️ CORRECTION to earlier note (line 27, 34): sendError body field is `error`, NOT `code`

Verified in `src/gateway/middleware/auth.ts` + actual passing tests:

- Body shape is `{ error: 'AUTHENTICATION_REQUIRED', message: '...' }`
- Assertion that PASSES: `expect(JSON.parse(res.body).error).toBe('AUTHENTICATION_REQUIRED')`
- The earlier `res.body.code` guidance in this notepad (lines 27, 34) would FAIL. Tasks 3/5/6 should use `.error` not `.code`.

### Fix applied (both files)

- `process.env.ADMIN_API_KEY = ADMIN_TEST_KEY` → `process.env.SERVICE_TOKEN = ADMIN_TEST_KEY` (in beforeEach)
- `'x-admin-key': ADMIN_TEST_KEY` → `'Authorization': \`Bearer ${ADMIN_TEST_KEY}\`` (replaceAll — 23 occurrences in kb, 9 in property-locks)
- kb test #8: assertion `'Unauthorized'` → `'AUTHENTICATION_REQUIRED'` + renamed desc "missing X-Admin-Key" → "missing Authorization"
- property-locks had NO unauthorized-case test, so only the 2 mechanical swaps needed there.

### Result

- 31/31 pass (kb 27 + property-locks 4), 0 failures, 2.18s
- Committed: 5eb6103c "test: modernize admin-kb + property-locks integration tests to Bearer auth" (2 files, +60/-54)

### Gotchas for remaining auth-fix tasks (3,5,6)

- LSP (typescript-language-server) is unavailable in this env (.tool-versions / asdf node mismatch). Verify via `vitest run` instead — tsx compiles on the fly.
- auth is already wired INSIDE each route module (`authMiddleware` + `requireAuth` from middleware/auth.ts + authz.ts) — tests must NOT add middleware manually.
- pre-commit hook (lint-staged + eslint --max-warnings 0) runs and PASSES on these test files — no --no-verify needed.
- git status shows unrelated parallel-work changes (admin-invitations.ts, jira-webhook test) — leave them; scope commits with explicit file paths.

## [2026-06-10 16:07] Task 3: admin-projects auth modernization (4 files) — DONE

### Result

- 27/27 pass (create 6 + read 6 + update 8 + delete 7), 0 failures, 2.12s
- Committed: 5d78c530 "test: modernize admin-projects integration tests to Bearer auth" (4 files, +65/-41)
- Confirmed `.error` (not `.code`) is correct — matches Task 4 correction at line 65-69.

### ⚠️ KEY NUANCE for "wrong key value" unauthorized tests (Tasks 5/6 take note)

The create.test.ts had a "wrong X-Admin-Key value → 401" test. You CANNOT just swap it to
`Authorization: Bearer totally-wrong-key` and assert AUTHENTICATION_REQUIRED, because:

- authMiddleware (src/gateway/middleware/auth.ts) flow: if header starts with "Bearer ",
  it compares against SERVICE_TOKEN; on mismatch it FALLS THROUGH to verifySupabaseJwt(),
  which throws → returns `INVALID_TOKEN` (401), NOT `AUTHENTICATION_REQUIRED`.
- Only a NON-Bearer / missing header short-circuits to `AUTHENTICATION_REQUIRED` at line 58.
- FIX: changed that test to send a malformed header `authorization: 'totally-wrong-key'`
  (no "Bearer " prefix) and renamed it "malformed Authorization header → 401".
  This both passes AND asserts AUTHENTICATION_REQUIRED per the task's outcome contract.
- Alternative if you want to keep a Bearer-with-wrong-value case: assert `INVALID_TOKEN` instead.

### Mechanical swaps applied (all 4 files)

- beforeEach: `process.env.ADMIN_API_KEY = ADMIN_TEST_KEY` → `process.env.SERVICE_TOKEN = ADMIN_TEST_KEY`
- headers: `'x-admin-key': ADMIN_TEST_KEY` → `authorization: \`Bearer ${ADMIN_TEST_KEY}\`` (replaceAll)
- delete.test.ts used `{ 'x-admin-key': ADMIN_TEST_KEY }` (no content-type) — same replaceAll caught it
- unauthorized asserts: `.toBe('Unauthorized')` → `.toBe('AUTHENTICATION_REQUIRED')`
- renamed test descriptions containing "X-Admin-Key" → "Authorization" (outcome requires NO X-Admin-Key refs remain)

### Confirms prior gotchas

- LSP still unavailable (typescript-language-server / node version mismatch) — vitest run is the verification.
- pre-commit hook (lint-staged + eslint) PASSES on these files, no --no-verify.
- Scoped commit with explicit paths; left parallel-work files (admin-invitations.ts, jira-webhook test, admin-tenants test) untouched.

## [2026-06-10 16:08] Task 5: admin-tenants auth modernization (1 file) — DONE

### Result

- 27/27 pass (POST 6 + GET-list 3 + GET-one 5 + PATCH 4 + DELETE 5 + restore 4... actually 27 total), 0 failures, 1.60s
- Committed: 6deae5aa "test: modernize admin-tenants tests to Bearer auth + new error shape" (1 file, +35/-25)
- File location nuance: this one is at tests/integration/gateway/ROUTES/admin-tenants.test.ts (note `routes/` subdir, unlike kb/property-locks which are directly under gateway/)

### Two subtle assertion fixes (beyond mechanical swaps)

1. The "missing header" test used `expect(res.body).toEqual({ error: 'Unauthorized' })` — a STRICT/exact match.
   Real body is `{ error: 'AUTHENTICATION_REQUIRED', message: 'Authentication required' }` (has a `message` field).
   So `toEqual` would FAIL even with the right error code (extra `message` key). FIX: switched to
   `expect(res.body.error).toBe('AUTHENTICATION_REQUIRED')` (field check, ignores `message`).
2. The "wrong key" test (`Bearer wrong-key`) only asserts `res.status).toBe(401)` — no error-code assertion.
   Per the auth flow (Task 3 note lines 97-100), Bearer-with-wrong-value → falls through → INVALID_TOKEN (401).
   Since the test only checks status 401, `Bearer wrong-key` is SAFE here — no change needed beyond the header swap.
   (Different from admin-projects create.test.ts which DID assert the code on its wrong-key test.)

### Mechanical swaps applied

- makeApp(): `process.env.ADMIN_API_KEY = ADMIN_KEY` → `process.env.SERVICE_TOKEN = ADMIN_KEY` (this file uses a local
  `const ADMIN_KEY = 'test-admin-key'`, NOT the shared ADMIN_TEST_KEY import — left that local const as-is, just changed the env var name)
- headers: `.set('X-Admin-Key', ADMIN_KEY)` → `.set('Authorization', \`Bearer ${ADMIN_KEY}\`)`(two whitespace variants — needed 2 replaceAll passes: indented multi-line form + inline`.get(...).set(...)` form)
- wrong-key header: `.set('X-Admin-Key', 'wrong-key')` → `.set('Authorization', 'Bearer wrong-key')`
- renamed 2 test descriptions: "401 when X-Admin-Key header missing" → "...Authorization header missing"; "401 when X-Admin-Key is wrong" → "...Authorization token is wrong"

### Confirms prior gotchas (all still true)

- `.error` (not `.code`) is the sendError body field — confirmed again.
- LSP unavailable (typescript-language-server / asdf node) — vitest run is the verification.
- pre-commit hook (lint-staged + eslint --max-warnings 0) PASSES on this file, no --no-verify.
- Scoped commit with explicit path; left parallel-work files (admin-invitations.ts, jira-webhook test, email-setup.md) untouched.

## [2026-06-10 16:08] Task 6: jira-webhook-with-new-project auth modernization (1 file) — DONE

### Result

- 2 passed, 1 skipped, 0 failed
- Committed: bad3fdbf "test: modernize jira-webhook-with-new-project admin auth to Bearer" (1 file, +2/-1)
- Only 1 admin API call in this file (POST .../projects in the happy-path test). Other 2 tests are webhook-only (HMAC x-hub-signature) — left UNTOUCHED.

### Mechanical swaps applied

- adminHeaders(): `'x-admin-key': ADMIN_TEST_KEY` → `Authorization: \`Bearer ${ADMIN_TEST_KEY}\``
- beforeEach: added `process.env.SERVICE_TOKEN = ADMIN_TEST_KEY;` (file had NO ADMIN_API_KEY line to swap — it relied on createTestApp's default; added SERVICE_TOKEN explicitly)
- No unauthorized-case test in this file → no `.error`/AUTHENTICATION_REQUIRED assertion changes needed.
- webhookHeaders()/computeJiraSignature/x-hub-signature = HMAC path, untouched per task constraint.

### ⚠️⚠️ CRITICAL ENVIRONMENTAL GOTCHA (affects ALL integration tests that call buildApp while `pnpm dev` is running)

SYMPTOM: tests fail with `process.exit unexpectedly called with "1"` at `buildApp src/gateway/server.ts:145` + `Cannot read properties of undefined (reading 'close')` in afterEach.
ROOT CAUSE: server.ts:139-146 acquireSocketModeLock() — a live `pnpm dev` gateway child holds the lock file (os.tmpdir()/ai-employee-gateway-socketmode.lock). buildApp calls process.exit(1) when it can't acquire. This kills `app` before assignment → afterEach `app.close()` also throws.

- This is NOT related to the auth fix. EVERY test in the file (even webhook-only, no admin auth) fails identically.
- buildApp only starts Socket Mode when ALL of SLACK_SIGNING_SECRET + SLACK_CLIENT_ID + SLACK_CLIENT_SECRET + SLACK_APP_TOKEN are set. These LEAK IN from .env (vitest integration config has no dotenv loader, but prisma.config.ts / process env inheritance pulls them in via the dev shell... actually they come from the parent process env at runtime).
  FIX (do NOT kill the user's dev server): prepend the vitest command with empty Slack vars to skip Socket Mode entirely (matches CI, where these secrets are absent):

```
SLACK_SIGNING_SECRET= SLACK_CLIENT_ID= SLACK_CLIENT_SECRET= SLACK_APP_TOKEN= \
  DATABASE_URL=...ai_employee_test DATABASE_URL_DIRECT=...ai_employee_test \
  pnpm exec vitest run --config vitest.integration.config.ts <file>
```

- With Slack vars empty, log shows "Slack not configured — ... required" and tests pass cleanly.
- In CI these secrets won't exist, so the real pipeline is unaffected. This is purely a local-dev concurrency artifact.

### Confirms prior gotchas

- `.error` (not `.code`) confirmed again.
- LSP still unavailable — vitest run is the verification.
- pre-commit hook PASSES, no --no-verify.
- Scoped commit by explicit path; left .sisyphus/\* untracked files alone.

## [2026-06-10] Task 0 FINAL: Prod pre-flight CLEAN + critical IPv6 discovery

- Prod migration state (read via IPv4 pooler): 59 applied, 0 unfinished, 0 rolled-back; names match local 1:1. VERDICT: CLEAN.
- CRITICAL: Supabase DIRECT host (db.gjqrysxpvktmibpkwrvy.supabase.co:5432) is IPv6-ONLY.
  GitHub Actions runners are IPv4-only => direct URL fails with P1001 in CI.
- SOLUTION: Use the SESSION-MODE POOLER for the migrate job:
  aws-1-us-west-2.pooler.supabase.com:5432 (IPv4, supports DDL-in-transaction, serves same DB).
  `prisma migrate status` confirmed working through it: "Database schema is up to date!"
- => PROD_DATABASE_URL_DIRECT secret (Task 10) = session-pooler URL on port 5432 (NOT the txn pooler :6543, NOT the IPv6 direct host).
- Render API contract verified for Task 9:
  - ownerId = tea-d1uscc3uibrs738pu040 ; serviceId = srv-d8f1b2gg4nts738dj7jg
  - GET /v1/services/{id}/deploys?limit=1 -> [{ deploy: { id, status }, cursor }] (status 'live' when done)
  - GET /v1/logs?ownerId=...&resource={serviceId}&startTime=...&endTime=...&limit=N&direction=backward
    -> { logs: [{ id, labels, message, timestamp }], hasMore, nextStartTime, nextEndTime }
    (param is `resource=` NOT `resource[]=`)
  - PATCH /v1/services/{id} with { autoDeploy: "no" } to disable Render auto-deploy

## [2026-06-10] Tasks 7+8+9: Final deploy.yml job graph

### Job graph (final)

```
test
 ├─▶ migrate          (needs: test)
 │     └─▶ deploy-gateway  (needs: [test, migrate])
 └─▶ deploy-worker    (needs: test)
```

- `test` and `deploy-worker` remain parallel/independent (worker image build does not touch prod schema).
- `migrate` and `deploy-worker` run in parallel AFTER test passes.
- `deploy-gateway` blocks on BOTH test AND migrate — ensures schema is migrated before new gateway code goes live.
- Workflow concurrency: `cancel-in-progress: false` — overlapping pushes are serialized, not cancelled mid-migrate.

### migrate job key facts

- Target: Supabase SESSION-MODE POOLER, port 5432, IPv4 (aws-1-us-west-2.pooler.supabase.com:5432)
- Secret name: `PROD_DATABASE_URL_DIRECT`
- Guard: rejects `:6543` (transaction pooler) and `pgbouncer` param — session pooler URL passes cleanly.
- PostgREST cache reload: `NOTIFY pgrst, 'reload schema';` via psql after migrate deploy.

### deploy-gateway job key facts

- Trigger: fires deploy hook, waits 10s, fetches newest deploy ID from Render API.
- Poll: 80 × 15s = up to 20 min watch window.
- Logs: fetched from Render logs API after terminal status (non-fatal if unavailable).
- Terminal statuses watched: `live` (success) vs `build_failed|update_failed|canceled|deactivated|pre_deploy_failed` (failure).
- Render service IDs hardcoded as job env (non-secret): `srv-d8f1b2gg4nts738dj7jg` / `tea-d1uscc3uibrs738pu040`.

### render.yaml

- Added `autoDeploy: false` under `plan: starter` in the service block to match Blueprint state.
- Render API PATCH to actually disable it in the live service is a separate step (Task 10).

## [2026-06-10] Task 9b: deploy-gateway trigger switched to Render API POST /deploys

- deploy-gateway now triggers via Render API POST /deploys (returns deploy id directly); RENDER_DEPLOY_HOOK_URL secret no longer needed.

## [2026-06-10] Task 11: @prisma/client specifier mismatch fixed

- The earlier prisma-generate fix accidentally pinned @prisma/client to exact 6.19.2 in package.json without updating the lockfile (which still records specifier ^6.0.0) → ERR_PNPM_OUTDATED_LOCKFILE in CI; reverted to ^6.0.0 to match the lockfile.

## [2026-06-10] Task 12: harness-metrics test leaks process.exit/SIGTERM into shared fork

### Root cause

`tests/integration/workers/opencode-harness-metrics.test.ts` is the ONLY integration test that:

1. Spies on `process.exit` via `vi.spyOn`
2. Imports `src/workers/opencode-harness.mts`, which registers a `process.on('SIGTERM', ...)` handler at module level on import
3. Uses `vi.resetModules()` in `beforeEach` and re-imports the harness each test — so each of the 7 tests registers a NEW SIGTERM handler, accumulating listeners on the shared single-fork process

The last test ("SIGTERM handler patches tasks with failure_code worker_terminated"):

- Emits `process.emit('SIGTERM')` → fires the handler
- The handler calls `process.exit(1)` asynchronously via `.finally()` after the DB PATCH resolves
- The test only awaited `waitForPatchWithBody` (the DB PATCH call being made), NOT `waitForProcessExit` — so the test ended before `.finally()` ran
- `afterEach` tore down the spy; vitest teardown removed the re-stub; then `.finally(() => process.exit(1))` fired for real
- This called the REAL `process.exit(1)` during the next test file (`diagnose-access.test.ts`), where vitest's own spy machinery threw "process.exit unexpectedly called with 1" as an unhandled rejection → suite exit 1 despite all 460 tests passing

The symptom (attribution to `diagnose-access`) was completely misleading — the error originated from harness-metrics.

### Fix applied (test-only, no production code changes)

Two changes to `opencode-harness-metrics.test.ts`:

1. **Added `afterAll`** — calls `process.removeAllListeners('SIGTERM')` and `process.removeAllListeners('SIGINT')` plus `vi.restoreAllMocks()` to drain accumulated signal handlers before the file tears down

2. **Added `await waitForProcessExit(exitSpy)` at the end of the SIGTERM test** — ensures the handler's deferred `process.exit(1)` fires while the spy is active (captured + no-op), not after teardown

Both changes are required: `afterAll` handles the case where the spy is removed by vitest's global teardown between tests, and the SIGTERM test fix ensures the fire-and-forget async handler is drained before the spy window closes.

## [2026-06-10] Task: guest lifecycle unit tests spawned real docker (CI fix)

### Root cause

`tests/unit/inngest/lifecycle-guest-approval.test.ts` (2 failing) and `lifecycle-guest-delivery.test.ts` (1 failing) exercise the lifecycle DELIVERY path via the Inngest test engine. The `handle-approval-result` step mock calls `fn()` (the real step function), which ultimately calls `runLocalDockerContainer()` from `src/inngest/lib/lifecycle-helpers.ts`. That function executes a real `docker run -d ... ai-employee-worker:latest ...` via `child_process.execSync`. CI's `test` job never builds the worker Docker image → `docker run` fails → tests fail. Locally they passed because the dev machine had `ai-employee-worker:latest` built.

This was a latent issue: prior CI runs never reached `pnpm test:unit` (the `test` job was blocked earlier), so these tests never ran in CI before.

### Fix

Used the `importActual` spread mock pattern (same pattern as `delivery-retry.test.ts`) to override ONLY the two docker functions while keeping all other real exports from `lifecycle-helpers`:

```typescript
const mockRunLocalDockerContainer = vi.hoisted(() =>
  vi.fn().mockReturnValue({ id: 'mock-delivery-container' }),
);
const mockStopLocalDockerContainer = vi.hoisted(() => vi.fn());

vi.mock('../../../src/inngest/lib/lifecycle-helpers.js', async (importActual) => {
  const actual =
    await importActual<typeof import('../../../src/inngest/lib/lifecycle-helpers.js')>();
  return {
    ...actual,
    runLocalDockerContainer: mockRunLocalDockerContainer,
    stopLocalDockerContainer: mockStopLocalDockerContainer,
  };
});
```

The path uses `../../../` (3 levels up) because the files are at `tests/unit/inngest/` — one level shallower than `delivery-retry.test.ts` at `tests/unit/inngest/lifecycle-steps/` (which uses `../../../../`).

Proof: ran tests with `PATH="/tmp/nodocker:$PATH"` where `/tmp/nodocker/docker` exits 1 with "docker called - MOCK LEAK" — no leak output, tests pass clean.

### Committed

`test: mock local-docker delivery spawn in guest lifecycle unit tests (fixes CI without worker image)` — 2 files, +32 insertions
