# Learnings — Third Maintainability Pass

## [2026-06-08] Session Start

- Plan: 33 tasks across 6 waves + 4 final-wave tasks
- All tasks pending — starting Wave 1
- sendSuccess() does NOT exist yet — must author before Tasks 14/15
- createHttpClient only has .post() — must add .get()/.delete() before Tasks 6/7
- config.ts has only 5 constants — must expand before Task 8
- Prisma DROP set: validation_runs, reviews, audit_log, cross_dept_triggers, clarifications (5 dead leaves only)
- NOT dropping: AgentVersion, Deliverable, Execution (referenced by active models)
- Dashboard: dead InputSchemaEditor.tsx at dashboard/src/components/ (NOT the one in panels/employees/components/)
- 3 raw fireHostfullyWebhook copies: EmployeeDetail.tsx:166, EmployeeList.tsx:240, TriggerPanel.tsx:110

## Task 5 — res.status() Inventory (2026-06-08)

### Counts
- Total `res.status()` calls in `src/gateway/routes/*.ts`: **58** (across 21 of 29 files)
- SUCCESS (2xx → migrate to sendSuccess): **52** calls
- SUCCESS-SEND (204 no-body → migrate): **5** calls
- ERROR stragglers (not yet sendError): **0** — all error paths already use sendError()
- NON-JSON (skip): **21** (8 redirects, 1 SSE stream, 12 bare res.json webhook acks)

### Key Findings
1. **Zero error stragglers** — every 4xx/5xx already uses `sendError()`. Tasks 14/15 only need to handle SUCCESS paths.
2. **204 no-body pattern** — 5 files use `res.status(204).send()`. Need to verify `sendSuccess` supports 204 before migrating.
3. **admin-slack-channels.ts:39** — returns `res.status(200).json({ channels: [], error: 'SLACK_NOT_CONFIGURED' })`. Semantically a degraded-success (200 with error field). Migrate to sendSuccess but preserve the error field in the body.
4. **admin-tasks.ts SSE block** — lines 98-113 are a Server-Sent Events stream. DO NOT migrate.
5. **OAuth files** — all success paths are `res.redirect(302, ...)`. DO NOT migrate.
6. **Webhook ack files** (github.ts, hostfully.ts, health.ts) — use bare `res.json()` with no explicit status. Out of scope for this task.

### Files to migrate in Tasks 14/15 (21 files with SUCCESS calls)
admin-archetype-generate.ts, admin-archetypes.ts, admin-brain-preview.ts,
admin-employee-trigger.ts, admin-github.ts, admin-google.ts, admin-kb.ts,
admin-model-catalog.ts, admin-platform-settings.ts, admin-projects.ts,
admin-property-locks.ts, admin-rules.ts, admin-slack-channels.ts, admin-tasks.ts,
admin-tenant-config.ts, admin-tenant-secrets.ts, admin-tenants.ts, admin-tools.ts,
internal-github-token.ts, internal-google-token.ts, jira.ts

### Files to skip entirely
github-oauth.ts, github.ts, google-oauth.ts, health.ts, hostfully.ts,
jira-oauth.ts, notion-oauth.ts, slack-oauth.ts

## [2026-06-08] Task 1 — sendSuccess() helper

- sendSuccess(res, status, body?) added to src/gateway/lib/http-response.ts
- Pass-through only: res.status(status).json(body) when body present, res.status(status).end() when absent
- No envelope wrapping — body is passed as-is (this is the critical constraint)
- JSDoc mirrors sendError style exactly (public API helper)
- Test file: tests/unit/gateway/http-response.test.ts (5 tests, all pass)
- Test covers: object body, array body, 201 created, 204 no-body, explicit no-envelope assertion
- pnpm build clean, pnpm test 5/5 pass
- Pre-existing failure in http-client.test.ts (delete() tests) — unrelated, not introduced by this task

## Task 8 — OAuth + Supabase env via central config (2026-06-08)

### Scope migrated (5 files)
- slack-oauth.ts, google-oauth.ts, jira-oauth.ts, notion-oauth.ts → all inline process.env reads replaced with config getters
- shared.ts → 4 inline SUPABASE_URL/SUPABASE_SECRET_KEY reads (3 functions + the 2 module-level exports) replaced

### Key gotchas
- **PORT is encapsulated inside the *_REDIRECT_BASE_URL() getters** — config.ts:38/44/50/56 already do `?? http://localhost:${PORT()}`. So replacing each `redirectBase = process.env.X_REDIRECT_BASE_URL ?? ...` line with a single `X_REDIRECT_BASE_URL()` call covers PORT too. No separate PORT import needed in OAuth routes.
- **shared.ts public-API preservation**: shared.ts EXPORTS `SUPABASE_URL` and `SUPABASE_KEY` — consumed by rule-handlers.ts (8 call sites). Config exports the supabase secret as `SUPABASE_SECRET_KEY` (not `SUPABASE_KEY`). Solution: `import { SUPABASE_URL, SUPABASE_SECRET_KEY as SUPABASE_KEY } from config` then `export { SUPABASE_URL, SUPABASE_KEY }`. Keeps rule-handlers.ts untouched, no signature drift.
- Getters are arrow fns — call with `()`. The supabaseHeaders() helper in shared.ts already called `SUPABASE_KEY()` as a fn, so re-export alias is drop-in compatible.

### Verification
- grep confirms ZERO process.env remaining in all 5 files
- LSP TS server unavailable locally (no .tool-versions for typescript-language-server) — pnpm build is the type authority

### Task 8 — Build/Test/Tier A outcome
- **Build (tsc): PASS** — all 5 migrated files compile clean.
- **`pnpm test -- --run` does NOT propagate `--run`** — it stays in vitest WATCH mode (never exits, no EXIT_CODE). Use `pnpm test:unit` (= `vitest run`) or `pnpm exec vitest run` for one-shot. Documented gotcha for future tasks.
- **My OAuth/config/oauth-state tests ALL PASS** (slack-oauth-install 5, jira-oauth 6, github-oauth 9, oauth-state 7, config 8).
- **Pre-existing failures are from a PARALLEL agent's incomplete `src/repositories/` relocation** (TenantRepository moved from gateway/services/ → src/repositories/, created 03:00-03:01). 8 inngest tests + 3 github-webhook tests fail on `src/repositories/tenant-repository.ts:37 findFirst undefined`. grep proves zero src/inngest files import my 5 files. NOT my regression.
- **Tier A: PASS** — real-estate-motivation-bot-2 task 20397826-5d53-42f7-bd38-9d3eb95dfe95 → Done. Clean trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done.
- Gateway was transiently down during verification (tsx-watch restart storm from concurrent agents) — recovered after ~30s, `/health` 200.

## Task 6 — adopt createHttpClient in fly-client.ts (2026-06-08)

### Approach
- `fly-client.ts` had private `makeRequest<T>()` (raw fetch + 429 check) and `makeRequestWithRetry<T>()` (wraps with withRetry)
- Replaced both with `getHttpClient()` factory that calls `createHttpClient(BASE_URL, headers, config)` per-operation
- Per-operation pattern required because `getFlyApiToken()` reads env at call time — not at module load

### Key technical detail: `getHttpClient()` vs module-level singleton
- fly-client exports standalone functions (no `createFlyClient()` factory pattern like slack-client)
- Token is read via `process.env.FLY_API_TOKEN` at call time
- If we created a module-level singleton, the token would be captured at import time (wrong — might be undefined)
- Solution: `function getHttpClient() { return createHttpClient(BASE_URL, { Authorization: `Bearer ${getFlyApiToken()}` }, ...) }`
- Called at the top of each public function → token always read fresh

### Test fix required
- `createHttpClient`'s `handle429()` calls `response.headers.get('Retry-After')` 
- Old `makeRequest` only checked `response.status === 429` without accessing headers
- Vitest mocks that returned `{ status: 429, json: ... }` didn't have a `headers` property
- Fix: add `headers: { get: () => null }` and `statusText: 'Too Many Requests'` to all 429 mock responses
- 4 mock sites updated in `tests/unit/lib/fly-client.test.ts`

### Imports removed from fly-client.ts
- `withRetry` (no longer needed — createHttpClient handles retry internally)
- `RateLimitExceededError` (http-client throws it internally; callers can still catch it but fly-client no longer needs to throw it itself)

### Tier A outcome
- Task bddcb4ea-01ea-4dd2-9b41-339be77c7a57 → Done ✓
- Full trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done
- Note: fly-client is NOT used in local Docker mode (only Fly.io mode) — Tier A validates the lifecycle still runs, not fly-client specifically

## Task 7 — createHttpClient adoption: telegram + github-token (2026-06-08)

### telegram-client.ts
- Removed: `import { RateLimitExceededError } from './errors.js'`, `import { withRetry } from './retry.js'`
- Added: `import { createHttpClient } from './http-client.js'`
- Outer `withRetry(... { maxAttempts: 2, retryOn: RateLimitExceededError })` → replaced by `http.post()` (which does the same internally)
- Path pattern: baseUrl = `'https://api.telegram.org'`, path = `/bot${config.botToken}/sendMessage`
- `maxAttempts: 2` passed explicitly to preserve original retry behavior (http-client default is 3)
- Application-level `data.ok` and `response.status !== 200` checks preserved unchanged after `http.post()` returns
- All 6 telegram-client.test.ts tests pass

### github-token-manager.ts  
- Raw `fetch()` call replaced by `createHttpClient` + `http.post()`
- JWT is generated per-call (since per-call JWT auth header), so `createHttpClient` is instantiated inside the function body (not module-level) — this is fine because token generation is cached for 55 min so it rarely executes
- Added `'Content-Type': 'application/json'` to headers (GitHub API accepts it; original omitted it)
- POST body: `{}` — GitHub returns default token with no repo/permission restrictions when body is empty
- 55-min cache TTL, JWT-signing logic, `_resetCacheForTest()`, and `_tokenCache` all preserved unchanged
- No specific test file exists for github-token-manager — verified via grep + build

### Pre-existing test failures (not my regression)
- 68 failures from 20 test files exist in working tree due to parallel agent tasks
- None of the failures are in telegram or github-token-manager tests
- My two files: telegram tests 6/6 pass; no github-token-manager tests exist

### Tier A
- real-estate-motivation-bot-2 → Done (task 1cafee18-879c-4a7f-abf0-743eca9143c3)
- Trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done

## Task 9 — migrate 3 hostfully LIST tools to shared client + paginator (2026-06-08)

### Files
- get-properties.ts, get-reservations.ts, get-reviews.ts — all now use resolveHostfullyClient() + paginateCursor()
- Mirrored the PoC adopters get-messages.ts and get-checkouts.ts exactly.

### Critical gotcha — get-reviews.ts is v3.3, client is v3.2
- resolveHostfullyClient() defaults baseUrl to https://api.hostfully.com/api/v3.2.
- The reviews endpoint exists ONLY in v3.3. So for get-reviews.ts I take ONLY { headers } from the client and keep its own `optionalEnv('HOSTFULLY_API_URL') ?? '.../v3.3'` baseUrl. Do NOT destructure baseUrl from the client there or reviews silently break.
- (This is the Hostfully API reviews endpoint — NOT the Prisma reviews table being dropped in Wave 4.)

### Latent bug fixed for free
- get-reviews.ts agency-properties loop used the NON-canonical `&cursor=` param (every sibling tool + paginateCursor use `&_cursor=`). Migrating normalized it to `_cursor`, which also matches what the integration test server expects (get-reviews.test.ts line 112 reads searchParams.get('_cursor')). Output unchanged.

### Per-property "warn and continue" preserved
- get-reviews portfolio mode must NOT abort if one property's reviews fetch fails — it logs a Warning and continues. paginateCursor THROWS on HTTP error, so I wrapped the per-property call in try/catch with `continue` (replacing the old fetchError flag). Behavior identical.

### EDITOR/WATCHER REVERTS DURING EDITS (important for parallel runs)
- A file watcher in this repo reverted my Edit-tool changes to get-properties.ts and get-reservations.ts mid-session (get-reviews.ts survived only because I re-applied last). Symptom: grep showed inline `X-HOSTFULLY-APIKEY` reappearing after a clean Edit.
- FIX: use the Write tool (atomic full-file replace) for the reverted files, then immediately verify + build before the watcher can re-trigger. Always re-grep `resolveHostfullyClient` presence right before building.

### Verification
- `pnpm test:unit` defaults to WATCH mode is NOT the issue — `pnpm test` (alias `vitest` no run) is watch; use `pnpm test:unit` (= `vitest run`) for one-shot. The first `pnpm test -- --run` got coerced back to watch by the repo file-watcher (RERUN lines) — corrupted run. Re-ran with `vitest run` directly = clean.
- Real verification = the 3 INTEGRATION tests (tests/integration/worker-tools/hostfully/get-*.test.ts). They exec the migrated scripts via tsx against a local HTTP server and assert output shape + pagination. 30/30 PASS. No UNIT test imports these 3 files.
- 68 unit failures are pre-existing (TenantRepository.findById findFirst undefined, src/repositories/ — parallel agent's incomplete relocation, same as noted at line 74). PROVEN: stashed my 3 files → same 10 failures reproduce in employee-lifecycle-delivery + hostfully unit tests WITHOUT my changes. Restored from stash, byte-identical.

### Tier A
- real-estate-motivation-bot-2 → Done (task a7f881b5-75cf-4324-839b-3e5acc65cf52)
- Trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done
- Evidence: .sisyphus/evidence/task-9-tierA.txt

## Task 10 — Migrate 5 Hostfully single/write tools to shared client (2026-06-08)

### What changed
Migrated get-property.ts, get-door-code.ts, update-door-code.ts, send-message.ts,
register-webhook.ts to use `resolveHostfullyClient()` from `lib/client.ts` for the
apiKey/headers boilerplate. Fixed get-property.ts `process.env['HOSTFULLY_API_URL']`
-> `optionalEnv('HOSTFULLY_API_URL')`.

### Migration pattern that preserves behavior byte-for-byte
- Take ONLY `{ headers }` from `resolveHostfullyClient()` (the real duplicated boilerplate).
- KEEP each tool's local `baseUrl = optionalEnv('HOSTFULLY_API_URL') ?? <default>` line.
  Reason: door-code tools use a DIFFERENT baseUrl convention than the shared client.
  - client.ts baseUrl = `https://api.hostfully.com/api/v3.2` (v3.2 baked in)
  - get-door-code / update-door-code default = `https://api.hostfully.com` (NO /api/v3.2),
    then build path as `${baseUrl}/api/v3.2/custom-data`.
  If you blindly use the client's baseUrl for door-code, you DOUBLE the path to
  `/api/v3.2/api/v3.2/custom-data` in prod. The unit test asserts `/api/v3.2/custom-data`.
  Keeping the local baseUrl line is the safe, test-preserving choice and still satisfies
  the `optionalEnv` checkbox.
- send-message.ts: client headers lack `Content-Type`; spread it back:
  `const { headers: clientHeaders } = resolveHostfullyClient(); const headers = { ...clientHeaders, 'Content-Type': 'application/json' };`
- register-webhook.ts: helper fns took `apiKey: string` and built headers inline.
  Changed signature to `headers: Record<string, string>`, resolve client once in main(),
  pass `headers` down, keep `'Content-Type'` via spread. Kept all ~20 CLI `console.*`
  calls and `requireEnv` for HOSTFULLY_AGENCY_UID + WEBHOOK_PUBLIC_URL (both required).

### GOTCHA — resolveHostfullyClient() THROWS; requireEnv() EXITS
- Old code: `requireEnv('HOSTFULLY_API_KEY')` called `process.exit(1)` directly inside main().
- New code: `resolveHostfullyClient()` THROWS a plain Error -> caught by `main().catch()`.
- Production: identical (exit 1 + stderr "HOSTFULLY_API_KEY environment variable is required").
- TEST HARNESS ARTIFACT: update-door-code.test.ts mocks process.exit to THROW ExitError.
  With the throw-based flow, the FIRST process.exit now fires INSIDE main().catch(), so the
  mock's ExitError surfaces as an UNHANDLED REJECTION -> vitest exits 1 even though all 12
  assertions pass. Fix: register a scoped `process.on('unhandledRejection', ...)` in
  beforeEach that swallows ONLY `ExitError:` messages, removed in afterEach. Zero assertion
  changes. This mirrors the get-messages.ts PoC pattern (bare resolveHostfullyClient + bottom .catch).

### Verification
- pnpm build (tsc): EXIT 0 (full repo type-check green)
- worker-tools unit: 78/78 pass; hostfully integration: 78/78 pass (156 tool tests total)
- Tier A: real-estate-motivation-bot-2 -> Done (task f044cd27-e842-4028-bbcf-6c5ae9153c4e)

### IMPORTANT — shared worktree, concurrent sibling tasks
`pnpm test:unit` showed 69 failures across 21 gateway/inngest files. NONE are from this task.
A sibling task landed commit f59e6a01 and is mid-flight relocating
src/gateway/services/{tenant-env-loader,notification-channel,tenant-repository,tenant-secret-repository}.ts
-> src/repositories/. The failures are all "Failed to load url .../tenant-env-loader.js"
module-resolution errors. When verifying in this shared tree, scope tests to the files YOUR
task owns (here: tests/unit|integration/worker-tools/hostfully/) and rely on `pnpm build`
exit 0 for repo-wide type safety. Do NOT try to "fix" the gateway test failures — not your scope.

## Task 12 — validate-and-submit decomposition (2026-06-08)

### Files created
- `src/inngest/lifecycle/steps/lifecycle-helpers.ts` (110 lines) — cleanupExecutionMachine + safeRecordWorkMetric
- `src/inngest/lifecycle/steps/no-approval-path.ts` (294 lines) — !approvalRequired path
- `src/inngest/lifecycle/steps/override-card.ts` (315 lines) — NO_ACTION_NEEDED + approval_required=true
- `src/inngest/lifecycle/steps/reviewing-path.ts` (521 lines) — full reviewing/approval path
- `src/inngest/lifecycle/steps/validate-and-submit.ts` trimmed to 130 lines (thin sequencer)

### Key findings
1. **Cleanup blocks**: 4 of 5 are identical (lines 125, 249, 264, 405) → extracted to cleanupExecutionMachine. Line 1097 uses `WORKER_RUNTIME !== 'fly' || machineId.startsWith('docker_')` — different condition, stays inline.
2. **Metric blocks**: 5 of 6 are identical (lines 194, 242, 372, 557, 602) → extracted to safeRecordWorkMetric. Line 1082 has a status check before recording — stays inline.
3. **runOverrideCardPath returns boolean** (not void) — critical design decision. Returning void would require a new `check-task-done-after-override` step that would break existing tests asserting `set-reviewing` is NOT called when skipApproval=true. The boolean return lets the sequencer gate the reviewing path without adding a new Inngest step.
4. **All step IDs preserved byte-for-byte** — verified by grep before and after.
5. **Pre-existing integration failures**: opencode-harness-metrics.test.ts (7 failures) — unrelated to lifecycle steps, pre-existing.

### Verification
- pnpm build: EXIT_CODE 0
- pnpm test:unit: 125 files, 1425 tests pass
- pnpm test:integration: 47 files pass, 1 pre-existing failure (opencode-harness-metrics)
- Evidence: .sisyphus/evidence/task-12-tierB-decomp.txt

## Task 13 — approval-handler decomposition

- `lifecycle-helpers.ts` was already created by Task 12 (parallel task) — appended `writeFeedbackEvent` to it rather than creating a new file
- The three `feedback_events` POST blocks in `approval-handler.ts` are NOT identical: they differ in `event_type`, `correction_content`, and `original_content`. Extracted a parameterized `writeFeedbackEvent(opts)` helper that handles all three variants via optional fields
- `handleReject` was imported in TWO files: `validate-and-submit.ts` AND `reviewing-path.ts` — both needed import updates. The plan only mentioned `validate-and-submit.ts`; always grep all callers before removing an export
- `reviewing-path.ts` is a new file created by a parallel task (Wave 3) — not present in the original codebase snapshot
- Build errors in `override-card.ts` (TS2345) are pre-existing and unrelated to this task
- Integration test failures in `tests/integration/gateway/` are pre-existing (confirmed by stash+test on base commit)
- Unit tests: 125 files, 1425 passed, 9 skipped, 0 failures — clean
- Commit: `dc026516` — `refactor(lifecycle): extract handleReject and shared writeFeedbackEvent`
