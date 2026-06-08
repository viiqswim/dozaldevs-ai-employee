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

- **PORT is encapsulated inside the \*\_REDIRECT_BASE_URL() getters** — config.ts:38/44/50/56 already do `?? http://localhost:${PORT()}`. So replacing each `redirectBase = process.env.X_REDIRECT_BASE_URL ?? ...` line with a single `X_REDIRECT_BASE_URL()` call covers PORT too. No separate PORT import needed in OAuth routes.
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

- get-reviews.ts agency-properties loop used the NON-canonical `&cursor=` param (every sibling tool + paginateCursor use `&_cursor=`). Migrating normalized it to `_cursor`, which also matches what the integration test server expects (get-reviews.test.ts line 112 reads searchParams.get('\_cursor')). Output unchanged.

### Per-property "warn and continue" preserved

- get-reviews portfolio mode must NOT abort if one property's reviews fetch fails — it logs a Warning and continues. paginateCursor THROWS on HTTP error, so I wrapped the per-property call in try/catch with `continue` (replacing the old fetchError flag). Behavior identical.

### EDITOR/WATCHER REVERTS DURING EDITS (important for parallel runs)

- A file watcher in this repo reverted my Edit-tool changes to get-properties.ts and get-reservations.ts mid-session (get-reviews.ts survived only because I re-applied last). Symptom: grep showed inline `X-HOSTFULLY-APIKEY` reappearing after a clean Edit.
- FIX: use the Write tool (atomic full-file replace) for the reverted files, then immediately verify + build before the watcher can re-trigger. Always re-grep `resolveHostfullyClient` presence right before building.

### Verification

- `pnpm test:unit` defaults to WATCH mode is NOT the issue — `pnpm test` (alias `vitest` no run) is watch; use `pnpm test:unit` (= `vitest run`) for one-shot. The first `pnpm test -- --run` got coerced back to watch by the repo file-watcher (RERUN lines) — corrupted run. Re-ran with `vitest run` directly = clean.
- Real verification = the 3 INTEGRATION tests (tests/integration/worker-tools/hostfully/get-\*.test.ts). They exec the migrated scripts via tsx against a local HTTP server and assert output shape + pagination. 30/30 PASS. No UNIT test imports these 3 files.
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

## Task 16 — override-handlers extraction

### Files

- `src/gateway/slack/handlers/override-handlers.ts` (NEW, 196 lines) — OVERRIDE_TAKE_ACTION, OVERRIDE_DISMISS, override_take_action_modal handlers
- `src/gateway/slack/handlers/shared.ts` — added `handleAlreadyProcessed(taskId, updateFn)` (11 lines)
- `src/gateway/slack/handlers/approval-handlers.ts` — reduced from 697 → 476 lines
- `src/gateway/slack/handlers/index.ts` — added `registerOverrideHandlers` import + call

### The 3 guard blocks were NOT identical — diff summary

- Occurrence 1 (APPROVE): `respond({replace_original: true, ...})` — uses respond, no channelId/messageTs check
- Occurrence 2 (edit_and_send_modal): `client.chat.update(...)` guarded by `if (channelId && messageTs)`
- Occurrence 3 (reject_modal): same as #2 but different log.warn suffix

### handleAlreadyProcessed design decision

Callback signature: `(statusMsg: string) => Promise<unknown>`. Using `unknown` (not `void`) is critical —
`client.chat.update` returns `Promise<ChatUpdateResponse>` which IS NOT assignable to `Promise<void>` in strict TS.
`unknown` is the correct widened type that accepts both void and any other return type without casts.

### TypeScript gotcha

`Promise<ChatUpdateResponse>` is not assignable to `Promise<void>`. Initial attempt used `Promise<void>` for the
callback which caused 2 TS2322 build errors. Fixed by widening to `Promise<unknown>`.

### Pre-existing test failures

`slack-trigger-handler.test.ts` — createSlackInputCollectorFunction (3 tests fail). Pre-existing from
parallel sibling task's incomplete export relocation. Not introduced by this task.

## Task 15 — sendSuccess oauth/internal route group 2 (2026-06-08)

### Scope migrated (3 files, 4 call sites)

- internal-github-token.ts:53 — `res.status(200).json({token,expires_at})` → `sendSuccess(res, 200, {...})`
- internal-google-token.ts:47 — `res.status(200).json({token,expires_at,granted_scopes})` → `sendSuccess(res, 200, {...})`
- jira.ts:127 — `res.status(202).json({status:'task_created',taskId})` → `sendSuccess(res, 202, {...})`
- jira.ts:311 — `res.status(202).json({received,action:'queued_without_inngest',taskId})` → `sendSuccess(res, 202, {...})`
- All 3 files ALREADY imported `sendError` from `../lib/http-response.js` → just widened to `{ sendError, sendSuccess }`.

### OAuth files — confirmed redirects-only (NO migration)

- slack/google/jira/notion-oauth.ts grep for `.json(` matched ONLY `await tokenRes.json()` / `await resourcesRes.json()` — these parse the INBOUND OAuth-provider fetch Response, they are NOT Express `res.json()` response-sends. Inventory was correct: success paths are all `res.redirect(302, ...)`. Zero JSON 2xx to migrate. Left untouched.

### jira.ts — critical scoping discipline

- jira.ts has MANY bare `res.json({received:true, action:...})` webhook acks (lines 53,111,132,155,161,235,244,255,295,316). These have NO explicit status (default 200) and are OUT OF SCOPE per inventory note #6 (webhook ack pattern). ONLY the two `res.status(202).json(...)` Inngest-failure recovery branches were in scope. Do NOT touch the bare-res.json acks.

### Verification

- grep `res\.status\(2\d\d\)` across the 3 files → No matches (clean migration).
- pnpm build: EXIT_CODE 0.
- pnpm test:unit: 125 files / 1425 pass / 9 skip / 0 fail. The src/repositories relocation pre-existing failures (noted at lines 74, 160, 210 for earlier tasks) are now RESOLVED — full suite green.

### Tier A

- real-estate-motivation-bot-2 → Done (task 846d9455-1e64-4ea6-bb29-f69df12979e5)
- Trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done
- Timing gotcha: task sits at `Submitting` for ~3min between exec-harness firing `employee/task.completed` (08:58:43) and Inngest picking it up / delivery container completing (09:02:45). NORMAL motivation-bot cadence (delivery container spawn + opencode-go session), NOT a stall. Don't panic at a frozen `updated_at` during Submitting — check the delivery log (`/tmp/employee-delivery-<id8>.log`) for "Delivery confirmed via summary.txt".
- Evidence: .sisyphus/evidence/task-15-tierA.txt

## Task 17 — harness helpers extraction + rebuild

### What was extracted

- `markFailed`, `fireCompletionEvent`, `tryAutoPostApprovalCard`, `writeOpencodeAuth` → `src/workers/lib/harness-helpers.mts`
- opencode-harness.mts trimmed from 998 → ~790 lines (-222 lines)

### Key design decision: explicit params vs module-scope closure

- Each helper takes `taskId` (and `db` where needed) as explicit first params
- This breaks the module-level singleton dependency, making helpers independently testable
- `onNeedsApproval` callback in `outputOptions` changed to bound lambda: `(out) => tryAutoPostApprovalCard(TASK_ID, out)`
- `tryAutoPostApprovalCard` original signature `(parsedOutput)` → new `(taskId, parsedOutput)` — 8 `markFailed` call sites updated

### opencodeRunPid

- Already absent from codebase — no dead branch existed to remove
- grep confirmed zero matches before any changes

### Import cleanup

- Removed from harness: `postApprovalCard`, `type StandardOutput`, `INNGEST_EVENT_KEY`, `INNGEST_BASE_URL`, `updateSlackNotificationToFailed`
- Added: `import { markFailed, fireCompletionEvent, tryAutoPostApprovalCard, writeOpencodeAuth } from './lib/harness-helpers.mjs'`

### Tier A: PASS

- Docker build: EXIT_CODE 0, image sha256:b6b8761d32ba62bd93a9c601ab70509dd5fdf9a051fa7c408ae39eba2b2abdad
- Task a0a16ad0 → Done, work_minutes=15
- Full trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done
- Evidence: .sisyphus/evidence/task-17-rebuild-run.txt

## Task 14 — sendSuccess admin route group 1 (2026-06-08)

### Scope: 18 admin-\*.ts files, 57 calls migrated (54 json + 3... actually 52 json + 5 send per inventory, real total 57)

All 18 files shared the IDENTICAL import line `import { sendError } from '../lib/http-response.js';`
→ one Edit per file to add sendSuccess: `import { sendError, sendSuccess } from '../lib/http-response.js';`
Then per-call `res.status(NNN).json(body)` → `sendSuccess(res, NNN, body)`; `res.status(204).send()` → `sendSuccess(res, 204)`.

### CRITICAL — Task-5 inventory UNDER-COUNTED admin-model-catalog.ts

The inventory was built from a SINGLE-LINE grep of `res.status(2xx).json`. It listed only 3
calls for admin-model-catalog.ts (lines 158, 199, 234). But the file has TWO MULTI-LINE calls
the grep missed:

- lines 108-112: `res\n  .status(200)\n  .json(models.map(...))` (GET list)
- lines 138-140: `res\n  .status(200)\n  .json({ ...model, ... })` (GET single)
  The EXPECTED OUTCOME requires ZERO raw res.status(2xx).json( — so these MUST be caught.
  LESSON: never trust a single-line grep inventory for `res.status(...).json(...)`. Always
  re-read each file and grep with a multi-line-aware pattern. admin-tenants.ts:37 and
  admin-employee-trigger.ts:98/106 and admin-brain-preview.ts:308 are also multi-line objects
  (but those WERE in the inventory because the inventory captured the opening `res.status(NNN).json({` line).
  The model-catalog ones were missed because they split `res` / `.status` / `.json` across 3 lines.

### Chained-call rewrite pattern for `res\n.status(200)\n.json(X)`

```
res
  .status(200)
  .json(
    models.map((m) => ({ ...m, supported_gateways: computeSupportedGateways(m.model_id) })),
  );
```

→

```
sendSuccess(
  res,
  200,
  models.map((m) => ({ ...m, supported_gateways: computeSupportedGateways(m.model_id) })),
);
```

Output byte-identical (sendSuccess does `res.status(status).json(body)` when body !== undefined).

### Edit "multiple matches" — admin-projects.ts and admin-property-locks.ts

Both files have TWO identical `res.status(200).json(project|propertyLock);` lines (GET-single + PATCH).
Since both convert to the SAME sendSuccess call, used `replaceAll: true` after the first attempt errored.
Safe because the transformation is identical for both occurrences.

### sendError preserved everywhere

ZERO error-path changes. All 18 files still import + use sendError. Grep confirms every file
retains its sendError calls. The degraded-success in admin-slack-channels.ts:39
(`{ channels: [], error: 'SLACK_NOT_CONFIGURED' }`, returned at HTTP 200) was migrated to
sendSuccess preserving the error field in the body — it is NOT an error response.

### admin-tasks.ts SSE — left fully untouched

Only line 53 `res.status(200).json(task)` migrated. The SSE block (res.setHeader / flushHeaders /
write / end, lines 98-206) is not JSON — left as-is.

### Verification

- pnpm build: BUILD_EXIT:0 (tsc clean, full repo type-check)
- tests/unit/gateway: 29 files, 293 pass, 6 skip, 0 fail
- tests/unit/gateway/routes: 9 files, 91 pass, 0 fail (incl http-response.test.ts 5/5)
- Pre-existing ~68 failures from sibling src/repositories/ relocation — NOT my regression (notepad line 74/160/210). My changes isolated to gateway/routes; all route tests green.
- `${PIPESTATUS[0]}` does NOT expand in zsh tmux send-keys — got empty EXIT_CODE. Use direct `pnpm build > log 2>&1; echo $?` instead of relying on PIPESTATUS in piped tmux commands.
- SIBLING COLLISION: my first `ai-build` tmux session + `/tmp/ai-build.log` were hijacked by a parallel agent running a Docker build (log showed `[builder 9/10] RUN pnpm build`). Used a task-unique session name `ai-build-t14` + `/tmp/ai-build-t14.log` to isolate. LESSON: in this shared worktree, ALWAYS suffix tmux session + log names with your task number.

### Tier A

- real-estate-motivation-bot-2 → Done (task 4d8f1c56-a333-4cd5-a48a-a395b50192c4)
- Triggered via the MIGRATED admin-employee-trigger.ts route — directly exercises sendSuccess(res, 202, {...}). Response body identical to old: { task_id, status_url }.
- Trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done
- Evidence: .sisyphus/evidence/task-14-tierA.txt

## Task 18 — slack-input-collector + interaction early-exits

### Files created

- `src/inngest/slack-input-collector.ts` — `createSlackInputCollectorFunction` extracted from `slack-trigger-handler.ts` (lines 342-489 → new file)
- `src/inngest/lib/interaction-helpers.ts` — `runPreClassificationShortCircuits()` containing all 4 pre-classification steps extracted from `interaction-handler.ts` (lines 70-287 → new file)

### Key findings

1. **Two test files needed updating**: `slack-input-collector.test.ts` imported from `slack-trigger-handler.js` (old location); `slack-trigger-handler.test.ts` had `createSlackInputCollectorFunction` bundled in the same import. Both fixed to point to new locations.
2. **`prettifyRoleName` import**: `slack-input-collector.ts` imports `prettifyRoleName` from `slack-trigger-handler.ts` (pure function, no side effects). Circular-looking but fine — handler depends on collector, not the other way round.
3. **`interaction-helpers.ts` design**: Single `runPreClassificationShortCircuits(step, params)` function returning `'handled' | 'continue'`. Same logger name `'interaction-handler'` preserved for operational continuity. `supabaseUrl`/`supabaseKey` declared at module level via `requireEnv` (same pattern as the original file).
4. **`capture-rejection-feedback` calls `step.sendEvent` inside `step.run`**: This is existing behavior — Inngest treats it as regular code within the step. Preserved exactly.
5. **Resulting line counts**: `interaction-handler.ts` = 361 lines (was 570; −209). Both new files ≈165-215 lines.

### Verification

- pnpm build: EXIT_CODE 0
- pnpm test:unit: 125 files, 1425 passed, 9 skipped, 0 failures
- pnpm test:integration: 47 files passed, 1 pre-existing failure (opencode-harness-metrics)
- Tier A: e192cdeb-7146-4080-ba8f-0ac12e86c2fa → Done
  Trace: Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Delivering→Done

## Task 19+20 — DB backup + schema cleanup

### Backup

- Full dump: `database-backups/2026-06-08-0422/full-dump.sql` (23224 lines)
- Data-only dumps for all 5 tables also in that directory
- All 5 tables had 0 rows — safe to drop

### Reference Audit

- grep-based audit across entire `src/` — 0 active references to ValidationRun, AuditLog, CrossDeptTrigger, Clarification
- `get-reviews.ts` references `j.reviews` which is the Hostfully API JSON field, NOT the DB `reviews` table
- Prisma LSP unavailable (asdf toolchain restriction) — grep audit is sufficient

### Migration Approach

- `prisma migrate dev` fails with shadow DB error (P3006/P1014) in this Docker Compose setup
- The shadow DB setup tries to replay all migrations from scratch but `add_rls_policies` fails
- Workaround: `prisma migrate diff --from-url ... --to-schema-datamodel --script` generates clean SQL
- Then `prisma db execute --url ... --file migration.sql` applies it
- Then `prisma migrate resolve --applied <name>` registers it in `_prisma_migrations`
- This is safe and produces the same result — verified by Tier A smoke test

### Migration SQL

- NO CASCADE — 7 DropForeignKey + 5 DropTable statements (plain)
- Note from diff output: minor `AlterTable` for `platform_settings` and `task_metrics` (column type normalization) — excluded from migration file as they were already applied by previous migrations

### Schema Changes

Models removed: ValidationRun, CrossDeptTrigger, Clarification, Review, AuditLog
Back-relations removed: Task.clarifications, Task.crossDeptTriggers, Task.auditLogs, Execution.validationRuns, Deliverable.reviews, AgentVersion.reviews, AgentVersion.auditLogs

### Verification

- All 5 tables return PGRST205 via PostgREST (confirmed dropped)
- tasks survivor table resolves fine
- `pnpm build` clean (0 errors)
- Tier A: task 07fa8b62 → Done

### Commit

`chore(db): drop 5 dead forward-compat tables (orchestrate.mts remnants)` — 2 files, 38 insertions, 96 deletions

## Task 23 — useSlackChannels hook

- **Pattern extracted**: identical `useEffect` + 3-state pattern (`channels`, `loading`, `error`) was duplicated verbatim in `CreateEmployeePage.tsx` (lines 43-88) and `CompactSettingsGrid.tsx` (lines 88-111)
- **Hook created**: `dashboard/src/hooks/use-slack-channels.ts` — accepts `tenantId: string`, returns `{ channels: SlackChannel[], loading: boolean, error: string | undefined }`
- **Key detail**: SLACK_NOT_CONFIGURED error branch preserved as-is — the hook's `.catch()` sets `error = 'SLACK_NOT_CONFIGURED'` (same behavior as original)
- **Import cleanup**: `SlackChannel` type removed from `CreateEmployeePage.tsx` imports (no longer directly referenced after state removal); `fetchSlackChannels` removed from both consumers
- **Build**: `pnpm dashboard:build` → EXIT_CODE:0, 2181 modules, no new warnings
- **Screenshots**: `.sisyphus/evidence/task-23-create.png` and `task-23-settings.png` — zero application errors on both pages
- **Task 28 readiness**: hook is exported cleanly as `useSlackChannels` from `@/hooks/use-slack-channels` — Task 28 (CompactSettingsGrid decomposition) can import it directly

## Task 27 — CreateEmployeePage decomposition

### Files created/modified

- `dashboard/src/panels/employees/components/WizardEditStep.tsx` (332 lines) — full edit-step JSX extracted; exports `EditedFields` interface for use in parent
- `dashboard/src/hooks/use-wizard-data.ts` (92 lines) — 3 data-fetching effects + state (githubConnected, repos, repoUrl, reposLoading, reposError + URL-sync effect)
- `dashboard/src/panels/employees/CreateEmployeePage.tsx` trimmed from 593 → 269 lines (-55%)

### Key design decisions

1. **`EditedFields` exported from `WizardEditStep.tsx`** — avoids a separate shared-types file; parent imports `type EditedFields` directly from the component. This is idiomatic React — co-locate types with the component that owns them.
2. **`useSearchParams` moved to `use-wizard-data`** — the only consumer of `searchParams`/`setSearchParams` was the `repoUrl` URL-sync effect; no orphan import in parent.
3. **`setEditedFields` prop typed as `Dispatch<SetStateAction<EditedFields>>`** — required because the edit step uses functional updaters `(f) => ({ ...f, field: value })`. Plain `(fields: EditedFields) => void` would not accept functional updates.
4. **`slackError` prop typed as `string | undefined`** (not `string | null`) — matches `useSlackChannels` return type exactly; WizardEditStep already handled `undefined` as falsy.
5. **Task 23 already landed** before this task ran — `useSlackChannels` was already imported and used in the file. No duplication.

### Gotcha: parallel agent file writes

- A parallel agent was modifying `CreateEmployeePage.tsx` concurrently — file modification timestamp updated 3x during the write attempt. Workaround: read immediately before writing (last-read check).

### Verification

- `wc -l dashboard/src/panels/employees/CreateEmployeePage.tsx` → 269 lines (< 300 ✓)
- `pnpm dashboard:build` → EXIT_CODE:0, 2187 modules, no new errors
- Pre-existing error: `dashboard/src/components/InputSchemaEditor.tsx` (dead duplicate) — not introduced
- Pre-existing console error: `/api/config.js 404` — not introduced
- Screenshot: `.sisyphus/evidence/task-27-wizard.png` — wizard loads at describe step, 0 application errors

## Task 24 — ModelCatalogPage decomposition

### Files created

- `dashboard/src/lib/model-badge-utils.ts` (40 lines) — `computeQualityTierLabel` + 4 badge class maps (`COST_TIER_CLASS`, `GATEWAY_LABEL`, `GATEWAY_CLASS`, `QUALITY_TIER_CLASS`)
- `dashboard/src/pages/model-catalog-form.ts` (123 lines) — `ModelForm` interface + `EMPTY_FORM` + `entryToForm` + `parseOptionalFloat` + `formToPayload`
- `dashboard/src/pages/ModelFormDialog.tsx` (349 lines) — `FormField`, `SwitchField`, `ModelFormDialog`
- `dashboard/src/pages/model-catalog-params.ts` (76 lines) — `useModelCatalogParams` hook encapsulating all URL state (modal/editing/removing/q/provider params)
- `dashboard/src/pages/ModelTableRow.tsx` (87 lines) — `ModelTableRow` component rendering a single catalog row

### Key design decisions

1. **3 specified extractions weren't enough for < 300 target** — badge utils + form layer + form dialog reduced page from 910 → 424 lines. Two additional extractions were needed: URL state hook + table row component → final 296 lines.
2. **`useModelCatalogParams` hook** — natural boundary: all `useSearchParams` logic lives together; page just destructures the returned values. Same pattern used in Task 27 (`use-wizard-data` encapsulating URL-sync logic).
3. **`ModelTableRow`** — props: `{ model, onEdit, onRemove, onToggleActive }`. The row owns all badge/tier computation; page only passes handlers. Removed Badge, Switch, Pencil, Trash2, computeCostTierLabel, all tier class maps from the page's imports.

### Build state

- Zero TS errors in my new files (confirmed via `grep "error TS" | grep -v EmployeeList|CreateEmployeePage|EmployeeDetail|TriggerPanel` → 0 results)
- Build fails due to pre-existing errors in parallel-wave files (`EmployeeList.tsx` + `EmployeeDetail.tsx` modified by tasks 21/22/25/26) — NOT introduced by this task
- `pnpm dashboard:build` was green in task 23 before parallel wave started modifying those files

### Playwright verification

- `http://localhost:7700/dashboard/models` — table renders with real data (14 catalog models), 0 application errors (only pre-existing `/api/config.js 404`)
- `?modal=add` — `ModelFormDialog` renders all sections: Identity, Pricing, Capabilities, Performance metrics, Usage Guidance, Status
- Screenshot: `.sisyphus/evidence/task-24-modelcatalog.png`

## Task 22 — fireHostfullyWebhook centralization

### Changes made
- Added `fireHostfullyWebhook(messageUid: string): Promise<void>` to `dashboard/src/lib/gateway.ts` (line 414)
  - Added `WEBHOOK_FIXTURES` to the `constants` import in gateway.ts
  - Function POSTs to `/webhooks/hostfully` with `...WEBHOOK_FIXTURES, event_type: 'NEW_INBOX_MESSAGE', message_uid: messageUid`
  - No auth required (endpoint is public) — uses raw `fetch` like `fireApprovalEvent` does for Inngest

### Panel state at task completion

Parallel Wave 5 tasks refactored EmployeeDetail and EmployeeList into sub-components CONCURRENTLY:
- `EmployeeDetail.tsx` → refactored, webhook moved to `EmployeeActionBar.tsx` (which imports `fireHostfullyWebhook` from gateway)
- `EmployeeList.tsx` → refactored, webhook moved to `EmployeeRowActions.tsx` (which imports `fireHostfullyWebhook` from gateway)
- `TriggerPanel.tsx` → direct replacement: raw fetch replaced with `await fireHostfullyWebhook(messageUid)` ✅

### Final state
- `grep -rn "fetch.*webhooks/hostfully" dashboard/src/panels` → 0 results
- `grep -rn "fireHostfullyWebhook" dashboard/src/` → 4 hits: gateway.ts (definition), TriggerPanel.tsx, EmployeeActionBar.tsx, EmployeeRowActions.tsx (all usages)
- `TriggerPanel.tsx`: removed local `WEBHOOK_FIXTURES` const, imports from `@/lib/constants` instead
- Build: EXIT_CODE:0 (verified twice — before and after parallel task modifications)

### Key pattern learned
When `GATEWAY_URL` is only used for the webhook endpoint, it can be fully removed from panel imports. When it's used for OTHER endpoints (e.g., jira webhook URL display), it stays.

### Evidence
- `.sisyphus/evidence/task-22-network.txt` — curl verification of endpoint + full code audit
