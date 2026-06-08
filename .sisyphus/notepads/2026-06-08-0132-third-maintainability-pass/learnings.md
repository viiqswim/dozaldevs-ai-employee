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
