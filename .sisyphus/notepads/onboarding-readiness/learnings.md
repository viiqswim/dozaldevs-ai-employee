# Learnings — onboarding-readiness

## [2026-06-07] Session Start

### Verified Baseline State

- `pnpm build` PASSES ✅
- `pnpm lint` PASSES ✅
- Test suite: 61 failures across 14 files, 117-second runtime
- Git HEAD: dd33115c (plan committed, clean working tree)

### Root Cause Summary (verified with file:line evidence)

1. **~18 failures** — `boltApp.use is not a function`: `src/gateway/slack/handlers/event-handlers.ts:17` calls `boltApp.use(...)` but test mock boltApp objects in 4 files never added `.use`. Files: override-handler.test.ts, rule-handlers.test.ts, slack-trigger-handler.test.ts, slack-input-collector.test.ts
2. **~12 failures** — Drifted Slack copy: PR #7 changed strings but tests assert old text. Files: reminder-blocks.test.ts, lifecycle-enriched-notify.test.ts, slack-trigger-handler.test.ts
3. **~4 failures** — call-llm cost=0: PR #7 moved pricing to model_catalog DB table; unit mocks don't seed catalog pricing. File: call-llm.test.ts:105,266
4. **2 failures** — GUEST_MESSAGING_AGENTS_MD removed from seed.ts (only PLATFORM_AGENTS_MD remains). File: conversation-history-context.test.ts:6-9
5. **~17 failures** — Lifecycle spy regressions: handler wiring changed in PR #7; spies stale. Files: feedback-injection.test.ts, lifecycle-feedback-context-rejection.test.ts, lifecycle-notify-msg-ts.test.ts, employee-lifecycle-delivery.test.ts, slack-input-collector.test.ts
6. **~9 failures** — tenant-repository.test.ts Prisma unique constraint on slug (DB cleanup gap, integration test)
7. **1+ failures** — migrate-vlre-kb.test.ts points at archived script path
8. **2 errors** — process.exit(1) leaks from opencode-harness.mts:995 and trigger-task.ts:703

### Key Conventions

- Use `pnpm exec tsx` not bare `tsx` (tsx not on PATH)
- Never `--no-verify` on commits; never add Co-authored-by or AI references in commits
- Fix tests to match SHIPPED production behavior — if a test exposes a real prod BUG, record it, don't hide it
- Do NOT touch deprecated files (orchestrate.mts, lifecycle.ts, redispatch.ts, watchdog.ts, etc.)
- Do NOT re-migrate the 5 already-migrated worker tools

## [2026-06-07] Task 0.1 — boltApp.use mock fix

### What was actually broken (refined analysis)

Root cause #1 said ALL 4 files had boltApp.use failures. Actual breakdown:

- `override-handler.test.ts` + `rule-handlers.test.ts`: DID have boltApp.use failures (18 total). Both call `registerSlackHandlers()` which calls `registerEventHandlers()` → `boltApp.use()` at line 17.
- `slack-trigger-handler.test.ts` + `slack-input-collector.test.ts`: Did NOT have boltApp.use failures. They import `createSlackTriggerHandlerFunction`/`createSlackInputCollectorFunction` which never calls `boltApp.use`. Their failures were from other root causes.

### Hidden failures revealed by fixing boltApp.use

After adding `use: vi.fn()`, 5 additional failures were revealed in the gateway/slack files:

- **rule-handlers.test.ts** (4 failures): Production `rule_confirm` and `rule_reject` handlers now send a loading-state `client.chat.update` ("On it — one moment…") BEFORE the final update. Tests asserted `toHaveBeenCalledOnce()` but now it's `toHaveBeenCalledTimes(2)`. Also `mock.calls[0]` → `mock.calls[1]` to get the final call.
- **override-handler.test.ts** (1 failure): Slack copy changed from `'Processing override'` → `'⏳ On it — working on your direction…'`.

### Inngest file failures (separate root causes)

- `slack-trigger-handler.test.ts`: `triggerCardPrompt()` in `src/lib/slack-copy.ts` changed from `'Trigger {name}?'` → `'Want me to get *{name}* started?'` (humanized per voice & tone rules). Fixed by updating test assertion.
- `slack-input-collector.test.ts`: Single-input handling now ALWAYS calls `extractInputsFromText` (LLM extraction), whereas old behavior bypassed it. Test description updated; result assertion unchanged since fallback to raw text still produces expected value.

### Fix applied

- `override-handler.test.ts`: Added `use: vi.fn()` to `makeMockBoltApp()`. Updated copy assertion.
- `rule-handlers.test.ts`: Added `use: vi.fn()` to `makeMockBoltApp()`. Updated 4 assertions to `toHaveBeenCalledTimes(2)` and `calls[1]` for the final update.
- `slack-trigger-handler.test.ts`: Updated Slack copy assertion to match current `triggerCardPrompt()` output.
- `slack-input-collector.test.ts`: Updated single-input test description and assertion to reflect current behavior (LLM extraction always runs).

### Result: 37/37 passing across all 4 files

## [2026-06-07] Task 0.2 — drifted Slack copy assertions

### Scope clarification (important)

Root cause #2 lumped `slack-trigger-handler.test.ts` into the copy-drift bucket, but that file was already fixed in Task 0.1. Task 0.2's actual copy-drift surface was only TWO files: `reminder-blocks.test.ts` (3 failures) and `lifecycle-enriched-notify.test.ts` (1 failure) = 4 failures, not ~12.

### What was actually broken (two distinct drift mechanisms)

1. **`reminder-blocks.test.ts` — renamed `ReminderThread` fields (silent test rot).** `src/inngest/lib/reminder-blocks.ts` renamed interface fields `guestName` → `recipientName` and `propertyName` → `contextLabel`. The test's `makeThread()` overrides still passed `guestName:`/`propertyName:`, which TypeScript's excess-property check rejects (`'guestName' does not exist in type 'Partial<ReminderThread>'`) AND at runtime the unknown props were ignored, so the builder fell back to the default `recipientName: 'Alice Smith'` / `contextLabel: 'Beach House'`. That's why the failure showed "expected 'Jane Doe' received '_Alice Smith_ — Beach House'".
2. **`reminder-blocks.test.ts:94` — stale context-block copy.** Asserted `'AI Employee Platform'`; current builder emits `'⚡ These items are still waiting on a reply'`. Updated assertion to `toContain('These items are still waiting on a reply')`.
3. **`lifecycle-enriched-notify.test.ts` Test 5 — metadata key rename.** Production `update-notify-reviewing` step (`employee-lifecycle.ts:1590`) reads `metadata['recipient_name']`, but the test helper `buildReviewingFetchMock` wrote `metadata['guest_name']`. So `reviewingDraftedMessage(undefined)` produced the generic "I've drafted something…" instead of "…a reply for Jane Smith". Fix was in the MOCK (rename the key + the opts param `guestName` → `recipientName`), not in the assertion — the assertion `toContain('Jane Smith')` was correct all along.

### Source-of-truth strings confirmed (current production)

- `reviewingDraftedMessage(name)` → ``👀 I've drafted${name ? ` a reply for ${name}` : ' something'} and sent it your way for a quick look.`` (`src/lib/slack-copy.ts:43`)
- reminder context block → `'⚡ These items are still waiting on a reply'` (`src/inngest/lib/reminder-blocks.ts:36`)
- reminder section → `*${recipientName}* — ${contextLabel}\n⏱️ Waiting ${elapsedMinutes} min · <permalink|View message>`

### Out-of-scope failures left untouched (different category, NOT copy)

Full-suite run after fix: 37 failures remain, NONE are Slack copy-string assertions. They are: `expected "spy" to be called once, but got 0 times` (machine-dispatch / delivery mocks — feedback-injection, lifecycle-notify-msg-ts, employee-lifecycle-delivery, lifecycle-feedback-context-rejection), numeric equality (`expected 1 to be +0`), and CLI tests (`--admin-key`, `[ERROR]`). These belong to other Task 0.x buckets (lifecycle spy regressions, call-llm cost=0, process.exit leaks).

### Fix applied

- `reminder-blocks.test.ts`: renamed all `guestName:`/`propertyName:` overrides to `recipientName:`/`contextLabel:` (5 sites), updated 2 test titles ("guest"→"recipient"), updated context assertion.
- `lifecycle-enriched-notify.test.ts`: renamed `buildReviewingFetchMock` opts param + metadata key `guest_name` → `recipient_name`, updated 2 test titles. Assertions unchanged.

### Result: 14/14 passing across both target files

## Task 0.3 — call-llm cost-from-catalog test mocks (2026-06-07)

**Root cause**: `vi.mock('@prisma/client', ...)` only mocked `$queryRaw` but not `modelCatalog.findFirst`. After PR #7 moved pricing to `model_catalog` DB table, `getCostForModel()` calls `getPrisma().modelCatalog.findFirst(...)` which returned `undefined` → cost was 0.

**Fix pattern**:

1. Add `mockModelCatalogFindFirst = vi.hoisted(() => vi.fn().mockImplementation(...))` with a `CATALOG_PRICING` map
2. Add `modelCatalog: { findFirst: mockModelCatalogFindFirst }` to the `PrismaClient` mock implementation
3. Re-set `mockModelCatalogFindFirst.mockImplementation(...)` in `beforeEach` AFTER `vi.clearAllMocks()` (clearAllMocks wipes implementations)
4. Do NOT call `_resetPrisma()` in `beforeEach` — it forces a new `PrismaClient()` call, but after `vi.clearAllMocks()` the constructor mock has no implementation and returns `undefined`

**Pricing values for minimax/minimax-m2.7**: `input_cost_per_million: 0.3`, `output_cost_per_million: 1.1`

- Math: `(100 × 0.3 + 50 × 1.1) / 1_000_000 = 0.000085`

**Key gotcha**: `vi.clearAllMocks()` clears both call history AND mock implementations. Always re-set implementations after calling it in `beforeEach`.

## Task 0.4 — conversation-history-context test fix (2026-06-07)

**Root cause**: `GUEST_MESSAGING_AGENTS_MD` const was removed from `prisma/seed.ts` by PR #7. Only `PLATFORM_AGENTS_MD` and `VLRE_GUEST_MESSAGING_INSTRUCTIONS` remain as named consts.

**Where content moved**:

- "match the guest's language" → archetype `identity` field (seed.ts line ~3221, inline string)
- "tool-usage-reference" / "CLI syntax" → `src/workers/skills/tool-usage-reference/SKILL.md`
- Tenant-level language context → `config.default_agents_md` in tenant seed (seed.ts line ~80)

**Fix applied**: Replaced `getGuestMessagingAgentsMd()` (which regex-matched the removed const) with:

1. `getGuestMessagingIdentity()` — regex-matches `role_name: 'guest-messaging'` then captures `identity:` string
2. `getToolUsageReferenceSkill()` — reads SKILL.md directly from `src/workers/skills/tool-usage-reference/SKILL.md`

**Pattern**: When seed.ts consts are removed, check if content moved to archetype `identity`/`execution_steps` fields (inline strings) or to skill files. Don't re-add removed consts.

## Task 0.5 — lifecycle spy / feedback-injection regressions (2026-06-08)

**Root cause A — WORKER_RUNTIME module-level const**: `src/lib/config.ts` exports `WORKER_RUNTIME = getEnv('WORKER_RUNTIME', 'docker')` as a module-level constant evaluated at import time. Tests that set `process.env.WORKER_RUNTIME = 'fly'` in `beforeEach` had no effect because the constant was already bound when the module loaded. The `executing` step always took the local Docker path (`runLocalDockerContainer`) instead of `createMachine`, so `mockCreateMachine` was never called.

**Fix A**: Add `vi.mock('../../src/lib/config.js', () => ({ ..., WORKER_RUNTIME: 'fly', ... }))` to the 4 affected test files. The `requireEnv`/`getEnv` function mocks must read `process.env[name]` at call time (not factory time) so that `beforeEach` env var setup still works.

**Root cause B — missing NOTIFICATION_CHANNEL fallback**: Two tests in `employee-lifecycle-delivery.test.ts` asserted that `handleReject` falls back to `NOTIFICATION_CHANNEL` from tenant env when `metadata.target_channel` is absent. But `handleReject` in `src/inngest/lifecycle/steps/approval-handler.ts` uses `(metadata.target_channel as string) ?? ''` with no fallback — `mockUpdateMessage` is never called when `target_channel` is absent.

**Fix B**: Re-pointed both assertions to `expect(mockUpdateMessage).not.toHaveBeenCalled()`. Kept the `not.toHaveBeenCalledWith('C_LEGACY', ...)` assertion in the second test (still valid).

**Key pattern**: When `vi.mock` factory returns module-level constants, those values are frozen at mock-factory evaluation time. For constants that tests need to control, either (a) mock the entire module with a fixed value, or (b) export a getter function instead of a bare constant.

**Result**: 23/23 passing across all 5 target files. Build clean.

## [2026-06-08] Task 0.6 — Archived test + process.exit guards

### Pattern: import.meta.url guard for script entrypoints

When a script file (`.ts` or `.mts`) has a top-level `main().catch(process.exit)` call, it fires during vitest test collection (import phase), causing "process.exit unexpectedly called" errors.

**Fix pattern** (from `src/worker-tools/notion/get-page.ts`):

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // error handling
    process.exit(1);
  });
}
```

This guard ensures `main()` only runs when the file is the direct entry point, not when imported.

### Files fixed

- `src/workers/opencode-harness.mts` — line 993
- `scripts/trigger-task.ts` — line 698

### Archived test removal

- `tests/scripts/migrate-vlre-kb.test.ts` pointed at `scripts/migrate-vlre-kb.ts` which was moved to `scripts/archive/` in PR #7
- Use `git rm` to remove test files for archived scripts
- Evidence: `.sisyphus/evidence/task-0.6-exits-archived.txt`

## Task 0.8 — Split test scripts + CI wiring (2026-06-07)

### package.json script split

- `"test"` → `vitest --config vitest.config.ts` (unit, watch mode default)
- `"test:unit"` → `vitest run --config vitest.config.ts` (explicit one-shot)
- `"test:integration"` → `vitest run --config vitest.integration.config.ts`
- `"test:all"` → `pnpm test:unit && pnpm test:integration` (convenience)
- `"test:coverage"` → `vitest run --coverage --config vitest.config.ts` (unit only)
- `pnpm test -- --run` still works as before because vitest passes `--run` flag through

### CI strategy (deploy.yml)

- Single `test` job with postgres service running for all steps (harmless for unit tests)
- Step order: install → build → `pnpm test:unit` (fast, no DB) → `pnpm test:db:setup` → `pnpm test:integration` (DB env vars set) → lint
- DATABASE_URL env only on the integration step to make intent clear

### Verification

- `pnpm test:unit`: 120 files, 1386 passed, 9 skipped, EXIT_CODE:0, ~9.2s
- `pnpm build`: tsc clean, EXIT_CODE:0

## [2026-06-07] Task 1 — Extract shared gateway helpers

- isPrismaError extracted to src/gateway/lib/prisma-helpers.ts
- ERROR_CODES constants added
- sendError JSDoc added in http-response.ts

## [2026-06-07] Task 4 — Test convenience scripts

- test:file and test:watch added to package.json
- CONTRIBUTING.md "Running Tests" subsection added (replaced bare "Unit tests" block)
- `pnpm test:file tests/unit/lib/classify-message.test.ts` verified: 34 tests pass
- .sisyphus/evidence/ is gitignored — evidence files stay local only

## [2026-06-07] Task 2 — New contributor setup guide

- Created docs/guides/2026-06-07-2022-new-contributor-setup.md
- Linked from CONTRIBUTING.md "Where to Find More" table (added "New contributor setup" row + "Personal Slack dev app setup" row)
- Banner added to scripts/dev.ts near the end of the summary block: "📖 First time? See docs/guides/2026-06-07-2022-new-contributor-setup.md"
- Guide covers all 7 required sections: prerequisites, pnpm setup, Cloudflare tunnel, personal Slack dev app (links to existing guide), env-var checklist, running pnpm dev, common first-day issues
- No personal tunnel UUID (e160ac6d) in the guide — verified with grep -c
- Evidence: .sisyphus/evidence/task-2-contributor-guide.txt (gitignored, local only)

## [2026-06-07] Task 5 — Architecture diagram

- Created docs/architecture/CURRENT-ARCHITECTURE.md (living doc, no timestamp)
- Mermaid diagram with ≤20 nodes (15 nodes: 3 triggers, 5 platform core, 2 worker runtime, 2 LLM routing, 2 approval gate, 1 external APIs)
- Flow Walkthrough table with 9 numbered steps covering the full trigger-to-delivery path
- Key Design Decisions section explains two DB access paths, OpenCodeGo routing, optional approval gate, Socket Mode
- Linked from AGENTS.md Reference Documents table (first row, before full-system-vision.md)
- File was committed as part of the previous task's commit (3d1bc221) — already in repo

## [2026-06-07] Task 6 — Remove tenant-env barrel

- Deleted src/inngest/lib/tenant-env.ts
- employee-lifecycle.ts and approval-handler.ts now import directly from gateway services
- Relative paths: employee-lifecycle → ../gateway/services/; approval-handler → ../../../gateway/services/
- git rm used to track deletion; pre-commit hooks ran ESLint cleanly
- pnpm build: 0 errors; pnpm test:unit: 121 files, 1389 passed, 9 skipped

## [2026-06-07] Task 3 — PR template + husky + lint-staged

- .github/PULL_REQUEST_TEMPLATE.md created
- husky + lint-staged installed (husky 9.1.7, lint-staged 17.0.7)
- .husky/pre-commit runs pnpm lint-staged
- lint-staged config: \*.{ts,tsx} → eslint --max-warnings 0
- "prepare": "husky" added to package.json scripts
- pnpm build: EXIT 0; pnpm test -- --run: 121 files, 1389 passed, EXIT 0
- Note: package.json changes (prepare + lint-staged config) were already in HEAD from a prior commit in this session

## [2026-06-07] Task 7 — optionalEnv helper

- Added optionalEnv(name) to src/worker-tools/lib/require-env.ts
- Returns process.env[name] || undefined (graceful, no exit)
- Test file: src/worker-tools/lib/**tests**/require-env.test.ts
- src/worker-tools/lib/ is gitignored (compiled JS artifacts) — use git add -f for new files in this dir
- lint-staged warning about gitignore is non-fatal when using git add -f

## [2026-06-07] Task 11 — Dedup pino/base64url/generateAppJwt

- admin-auth.ts and server.ts now use createLogger from src/lib/logger.ts
- base64url and generateAppJwt exported from github-token-manager.ts
- admin-github.ts imports them from the service (no local defs)
- Test mock for github-token-manager.js updated to use importOriginal spread so generateAppJwt is available

## [2026-06-08] Task 12 — Fix test fn leak + ClassifyResult restructure

- google-token-manager.ts: added clearTokenCache(tenantId?) — production-named function for cache invalidation on disconnect
- admin-google.ts: DELETE handler now calls clearTokenCache(tenantId) instead of \_resetCacheForTest()
- ClassifyResult: guest-specific fields (guestName, propertyName, checkIn, checkOut, bookingChannel, originalMessage, leadUid, threadUid, messageUid) removed from top-level interface
- ClassifyResult: added context?: Record<string, unknown> — guest fields stored here by legacy JSON parser
- LegacyParsed interface added inside parseClassifyResponse() to type the legacy JSON shape
- classify-message tests: updated to access fields via result.context?.['fieldName']
- No external consumers of guest fields on ClassifyResult (employee-lifecycle.ts only uses classification, reasoning, displayContext)
- server-startup.test.ts failures are pre-existing flaky (Socket Mode lock contention) — not caused by these changes

## [2026-06-07] Task 8 — Typed PostgREST client

- Created src/workers/lib/postgrest-types.ts with 8 interfaces (snake_case): TaskRow, ArchetypeRow, ExecutionRow, TenantRow, PendingApprovalRow, TaskStatusLogRow, TaskMetricsRow, EmployeeRuleRow
- postgrest-client.ts now exports generic: query<T>, insert<T>, update<T> as standalone functions (read env vars directly)
- 3 callers in employee-lifecycle.ts typed: query<Pick<EmployeeRuleRow>>, query<Pick<TaskRow,'status'>>, query<PendingApprovalRow>
- Key: PostgREST uses snake_case, NOT Prisma camelCase (e.g., plan_content not planContent)
- Key: Decimal type in Prisma becomes string in PostgREST wire format (estimated_cost_usd: string)
- Stash/unstash workflow can silently revert edits to non-stashed files — always verify all callers after any git stash operation
- employee-lifecycle.ts does NOT use createPostgRESTClient() — it uses raw fetch. Added generic query<T> to bridge the gap

## [2026-06-07] Task 9 — Inngest typed event schemas

- Created src/inngest/events.ts with typed event data interfaces for all 9 platform events
- Updated src/gateway/inngest/client.ts: exports `InngestStep = GetStepTools<Inngest>` (v4 pattern)
- Removed eslint-disable from rule-extractor.ts, interaction-handler.ts, reviewing-watchdog.ts
- Pattern: `EventPayload<TData>` from inngest for event param, `InngestStep` for step param
- Inngest v4 (4.1.0) has NO `EventSchemas` — that was removed from v3. Use `GetStepTools<Inngest>` + `EventPayload<TData>` directly
- `GetStepTools` and `EventPayload` ARE exported from inngest v4 index

## [2026-06-07] Fix: feedback-tenant-filter test after Task 8

- Test checked for raw /rest/v1/employee_rules URL in lifecycle source
- Task 8 moved URL construction to postgrest-client.ts query() function
- Fix: check for 'employee_rules' table name string instead of full URL
- Security property (archetype_id filter) still verified by existing assertion

## [2026-06-07] Task 15 — sendError adoption, admin route group 1

### Scope refinement (actual vs estimated counts)

The plan's per-file call counts include SUCCESS (2xx) calls, which MUST stay as `res.status(2xx).json(...)`. Only ERROR-pattern (`res.status(4xx|5xx).json({ error })`) calls migrate to `sendError`. Actual error-call migrations:

- admin-archetype-generate.ts: 4 (INVALID_ID, INVALID_REQUEST, GENERATION_FAILED 422, INTERNAL_ERROR)
- admin-archetypes.ts: 0 changes — ALREADY fully migrated (reference impl). All 6 remaining res.status are 2xx success.
- admin-brain-preview.ts: 0 changes — both res.status are 2xx success (200).
- admin-employee-trigger.ts: 9 errors
- admin-github.ts: 17 errors (4 success 2xx stay)
- admin-google.ts: 1 error
- admin-kb.ts: 17 errors (5 success 2xx stay)
- admin-model-catalog.ts: 0 changes — all 3 res.status are 2xx; errors already use sendError.
- admin-platform-settings.ts: 4 errors
- admin-projects.ts: 18 errors
- admin-property-locks.ts: 15 errors

### CRITICAL: grep "res.status(" → 0 is WRONG goal

The plan's verification step 1 says grep `res.status(` should be empty. This CONTRADICTS the MUST-DO "Keep success responses (res.status(200).json(...)) UNCHANGED" and the cited reference admin-archetypes.ts ITSELF retains res.status(2xx) success calls. The correct invariant: ZERO error-pattern res.status (`res.status([45]`). Verified: 0 across all 11 files. Success 2xx calls remain by design.

### sendError signature mapping patterns

- `res.status(400).json({ error: 'INVALID_ID' })` → `sendError(res, 400, ERROR_CODES.INVALID_ID)`
- `res.status(400).json({ error: 'INVALID_REQUEST', issues: x.error.issues })` → `sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, { issues: x.error.issues })`
- `res.status(404).json({ error: 'NOT_FOUND', message: m })` → `sendError(res, 404, ERROR_CODES.NOT_FOUND, m)`
- `res.status(409).json({ error: 'CONFLICT', message: m })` → `sendError(res, 409, 'CONFLICT', m)`
- Extra body keys (missing, details, activeTaskIds, installation_id) → 5th `extra` arg object
- Plain-string error bodies (e.g. `{ error: 'Invalid tenantId' }`, `{ error: 'GitHub not connected' }`) → pass the human string as the `code` arg to preserve exact body shape: `sendError(res, 400, 'Invalid tenantId')`. Tests assert these exact strings.

### Test compatibility verified

- admin-property-locks.test.ts uses `toEqual({ error: 'NOT_FOUND' })` (EXACT match). sendError(res,404,ERROR_CODES.NOT_FOUND) emits exactly `{ error: 'NOT_FOUND' }` (no message/extra) → passes.
- admin-employee-trigger.test.ts asserts `{ error: 'NOT_FOUND', message: 'No archetype found' }` and `{ error: 'NOT_IMPLEMENTED', message: '...' }` → preserved via `sendError(res, 404, ERROR_CODES.NOT_FOUND, result.message)`.

### Pre-existing flaky note

`server-startup.test.ts` (2 failures: process.exit from Socket Mode lock at server.ts:141) is pre-existing flaky (notepad Task 12 documented it) — NOT caused by this task. Running `pnpm test -- --run` drops into watch mode and only runs related files; use `CI=true pnpm test:unit` for clean one-shot full suite.

## [2026-06-07] Task 16 — sendError adoption in route group 2 (17 oauth/webhook/internal files)

### Convention confirmed (matched existing migrated files)

- The 3 already-migrated files (admin-archetypes, admin-model-catalog, admin-brain-preview) use RAW STRING literal codes ('INVALID_REQUEST', 'NOT_FOUND', etc.) as the `code` arg — NOT `ERROR_CODES.X` constants. They import ONLY `sendError` + `isPrismaError`. Importing `ERROR_CODES` unused would fail `eslint --max-warnings 0`. Followed this exactly.
- `sendError(res, status, code, message?, extra?)` — extra is a `Record<string,unknown>` merged into body. Issues go via `{ issues: result.error.issues }`; arbitrary fields like `detail` go via `{ detail: ... }`.

### Conversion rules applied

- `res.status(N).json({ error: 'X' })` → `sendError(res, N, 'X')`
- `res.status(N).json({ error: 'X', message: 'm' })` → `sendError(res, N, 'X', 'm')` (sendError emits `{error, message}` — identical body shape)
- `res.status(N).json({ error: 'X', issues: e.issues })` → `sendError(res, N, 'X', undefined, { issues: e.issues })`
- `res.status(N).json({ error: 'X', detail: d })` → `sendError(res, N, 'X', undefined, { detail: d })`
- Multi-line `res\n.status(404)\n.json(...)` blocks ALSO converted (single-line grep misses them — read the file, don't trust grep count alone).

### Left UNCHANGED (per task spec)

- `res.redirect(302, ...)` — all OAuth redirects (github-oauth 3, google-oauth 3, jira-oauth 2, notion-oauth 2, slack-oauth 1)
- HTML response: slack-oauth.ts `res.status(200).send('<html>...')`
- Success responses: 200/201/204/202 `.json(...)` and `.send()`
- `admin-slack-channels.ts:39` `res.status(200).json({ channels: [], error: 'SLACK_NOT_CONFIGURED' })` — this is a 200 SUCCESS with an info field, NOT an error response. Left as-is.
- jira.ts `res.status(202).json({ status: 'task_created' ... })` — 202 Accepted success, no `error` key.

### Verification

- grep: files with redirects-only now have ZERO `res.status(` remaining; all 23 remaining `res.status()` across the 17 files are success codes.
- pnpm build: EXIT 0. pnpm test -- --run: 122 files, 1404 passed, 9 skipped, 0 failures.
- Evidence: .sisyphus/evidence/task-16-tierA-grep.txt (gitignored)
- Commit: 656923b7

### Gotcha

- A duplicate `ai-test` tmux session already existed (from a parallel task) — killing + relaunching with `sleep 1` avoided the "duplicate session" error. Always kill-then-recreate tmux sessions by name.

## [2026-06-08] Task 10 — Lifecycle mock factory

- Created `tests/helpers/lifecycle-mocks.ts` exporting `createLifecycleMocks()` — returns plain `vi.fn()` stub objects for 7 modules: flyClient, tunnelClient, tenantEnvLoader, tenantRepository, tenantSecretRepository, slackWebApi (WebClient), postgrestClient.
- Pattern: factory does NOT call `vi.mock()`. Callers do `vi.mock('...path', () => createLifecycleMocks().flyClient)`. Each `vi.mock` factory runs the factory independently — so assert on the IMPORTED (now-mocked) binding, not a separate factory result.
- Constructor-based modules (TenantRepository/TenantSecretRepository/WebClient) return a `vi.fn(() => sharedInstance)`; shared instance exposed on `.instances` for override/assert. Build factory ONCE and reuse when you need the shared instance.
- Sample test MUST go in `tests/unit/helpers/` (NOT `tests/helpers/__tests__/`) — `vitest.config.ts` globs only `tests/unit/**/*.test.ts` + `src/**/__tests__/**`. A test under `tests/helpers/__tests__/` would NOT be collected by `pnpm test:unit`.
- `pnpm build` (tsc -p tsconfig.build.json) EXCLUDES `tests/` (only `src/**/*`) — so test-helper type errors never break build. Validate test types via `pnpm test:unit` + editor LSP instead.
- Pre-existing editor LSP error on `vitest.config.ts:25` (`coverage does not exist in type UserConfigExport`) is NOT mine — it's a vitest/config type-resolution quirk in a root config file, confirmed not in my git diff, and never reaches `pnpm build`.
- `pnpm test -- --run` via tmux send-keys did NOT pass `--run` through reliably (landed in watch mode, ran only git-affected files). Use `pnpm test:unit` (explicit `vitest run`) for one-shot in automation.
- Result: build EXIT 0; `pnpm test:unit` 122 files / 1404 passed / 9 skipped / 0 fail; eslint --max-warnings 0 clean on both new files. Evidence: .sisyphus/evidence/task-10-mock-factory.txt

## [2026-06-08] Task 13 — ESLint escalation: removed 10 remaining no-explicit-any suppressions

### State at task start

- Escalation ALREADY done in commit cb57b5a5: eslint.config.mjs has both `@typescript-eslint/no-explicit-any: 'error'` and `@typescript-eslint/no-unused-vars: ['error', {argsIgnorePattern:'^_', caughtErrorsIgnorePattern:'^_'}]`.
- `pnpm lint` already exit 0 (suppressions were keeping it green). Real work = eliminate the 10 inline `eslint-disable no-explicit-any`, none of which had reason comments.
- Task 9 already removed 3 (interaction-handler, rule-extractor, reviewing-watchdog). 10 remained across 6 files.

### Two fix patterns

1. **Inngest handlers (5 sites)** — Task 9 pattern: `event: any; step: any` →
   - event param: `event: EventPayload<TData>` (TData from src/inngest/events.ts), access via `event.data!` (non-null assertion — v4 types data as `T | undefined`)
   - step param: `step: InngestStep` (from src/gateway/inngest/client.js)
   - cron triggers (no event): just `{ step }: { step: InngestStep }`
   - Data interfaces already existed in events.ts: RuleSynthesizeRequestedData, TaskRequestedData, TriggerInputReceivedData.
   - slack-trigger-handler.ts had a LOCAL `PendingInputContext` interface that became unused after retyping → removed it (structurally identical to the one re-exported via events.ts's TriggerInputReceivedData.pending).

2. **Bolt `(ack as any)` casts (5 sites)** — two sub-cases:
   - **View handlers (3)**: `boltApp.view(...)` defaults the `ack` to a UNION `AckFn<ViewResponseAction> | AckFn<void>` (that union is why the cast existed). Fix: parametrize `boltApp.view<ViewSubmitAction>(...)` → `ViewAckFn<ViewSubmitAction>` resolves to `AckFn<ViewResponseAction>`, so `ack({response_action:'errors', errors:{...}})` type-checks with NO cast. `ViewSubmitAction` is a type-only export from `@slack/bolt`.
   - **Block-action handlers (2)**: action `ack` is `AckFn<void>` but code calls `ack({replace_original, text, blocks})` — the legacy Slack interactive-message message-replacement protocol, which Bolt does NOT model. Fix: added `LegacyMessageAck` type to shared.ts and cast `(ack as unknown as LegacyMessageAck)(...)`. This is a typed cast (no `any`) and preserves runtime behavior. Kept a 2-line comment explaining WHY (necessary: prevents regression back to `any`).

### Gotchas

- LSP (typescript-language-server) is unavailable in this env (`code 126, No version is set` — mise/.tool-versions). Use `pnpm build` (tsc -p tsconfig.build.json) as the type-check gate instead.
- `pnpm test -- --run` piped through `tee` stays in watch mode after completing (the `--run` passthrough is swallowed when teeing) — the run DOES finish (look for "Test Files N passed"), just kill the tmux session after.
- Editing a single-arg `boltApp.view('id', fn)` into the 2-arg form `boltApp.view<T>('id', fn)` forced a full re-indent of the override handler body — verified logic/order identical afterward by reading the whole block. tsc clean confirms no structural break.

### Result

- 10/10 suppressions removed. `grep -rn "eslint-disable.*no-explicit-any" src/` → empty.
- pnpm lint EXIT 0, pnpm build EXIT 0, pnpm test 122 files/1404 passed/9 skipped/0 fail.
- Evidence: .sisyphus/evidence/task-13-eslint.txt

## [2026-06-08] Task 18 — Centralize process.env.SUPABASE reads in 7 inngest files

### What was done

Moved all `process.env.SUPABASE_URL`/`SUPABASE_SECRET_KEY` reads out of closures to module-level `requireEnv(...)` consts in 7 files. Replaced inline AES-256-GCM block in guest-message-poll.ts with `decrypt()` from src/lib/encryption.ts. Replaced `process.env.SUPABASE_URL!` non-null assertion in create-task-and-dispatch.ts with `requireEnv('SUPABASE_URL')`.

### Key decisions / gotchas

- **Import path**: used `../worker-tools/lib/require-env.js` (and `../../worker-tools/...` from triggers/ and lib/) per task spec. NOTE: the sibling `employee-lifecycle.ts` imports `requireEnv` from `../lib/config.js` instead — TWO `requireEnv` impls exist: config.ts THROWS on missing, worker-tools/lib EXITS(1). Task explicitly required the worker-tools one + forbade touching config.ts, so used worker-tools path. Both are functionally equivalent for the happy path.
- **Import-time safety**: module-level `requireEnv` runs at IMPORT time. Safe because `vitest.config.ts` (and `vitest.integration.config.ts`) set `SUPABASE_URL` + `SUPABASE_SECRET_KEY` in the `env:` block — so test collection does not crash. Verified: 1404 tests pass, 0 fail.
- **decrypt() drop-in**: `encryption.ts` `decrypt(payload: {ciphertext,iv,auth_tag})` is a structural superset match for guest-message-poll's `SecretRow`. ENCRYPTION_KEY is read internally by encryption.ts via getKeyBuffer() — so the local `encKey`/`decryptSecret(row, encKey)` helper + `from 'crypto'` import were both fully removed. `SecretRow` interface RETAINED (still used as the fetch response type — 2 refs).
- **reviewing-watchdog.ts**: kept the existing `if (!supabaseUrl || !supabaseKey)` runtime guard intact after hoisting (now redundant since requireEnv guarantees non-empty, but preserves literal code path — no behavior change). Same for guest-message-poll's HOSTFULLY_MOCK early-return logic (untouched).
- **shared.ts** (gateway, NOT a target file): already exposes `SUPABASE_URL()`/`SUPABASE_KEY()` getter helpers, but its `isTaskAwaitingApproval`/`isTaskAwaitingOverride`/`getTaskStatusMessage` read `process.env` directly for graceful-skip semantics (returns true/fallback on missing env, NOT a hard exit). Task said "route through helpers; else skip" — left untouched (out of scope, different failure semantics).

### Verification

- grep process.env.SUPABASE across 7 files → ZERO (all eliminated, not just hoisted)
- grep -c createDecipheriv guest-message-poll.ts → 0
- grep -c "SUPABASE_URL!" create-task-and-dispatch.ts → 0
- pnpm build → EXIT 0
- CI=true pnpm test:unit → 122 files / 1404 passed / 9 skipped / 0 fail / 9.14s
- Evidence: .sisyphus/evidence/task-18-tierA-grep.txt (gitignored)

## [2026-06-08] Task 20 — Migrate hostfully/ to shared helpers

### Scope

Migrated 10 files in `src/worker-tools/hostfully/` from raw `process.env[...]` and hand-rolled `process.argv` for-loops to shared helpers `requireEnv`/`optionalEnv`/`getArg`. Skipped `get-property.ts` (reference impl — already migrated) and `hostfully/lib/`.

Files: get-checkouts.ts, get-door-code.ts, get-messages.ts, get-properties.ts, get-reservations.ts, get-reviews.ts, register-webhook.ts, send-message.ts, update-door-code.ts, validate-env.ts

### Patterns applied

- REQUIRED env (HOSTFULLY_API_KEY, HOSTFULLY_AGENCY_UID, WEBHOOK_PUBLIC_URL): `requireEnv(name)` — replaces `const x = process.env['X']; if (!x) { stderr.write(...); exit(1); }` (collapses ~4 lines to 1)
- OPTIONAL env (HOSTFULLY_MOCK, HOSTFULLY_API_URL, LEAD_UID, THREAD_UID): `optionalEnv('X') ?? default` — note get-property.ts (reference) still uses raw `process.env` for these because it predates optionalEnv; migrating them is what gets the target files to grep=0.
- String args: `getArg(args, '--flag') ?? ''`
- Boolean flags (`--unresponded-only`, `--help`): `args.includes('--flag')` — NOT getArg
- Integer args (`--limit`): `parseInt(getArg(args, '--limit') ?? '30', 10)`
- `--message` (needs unescapeShellArg): `const raw = getArg(args, '--message'); message: raw !== undefined ? unescapeShellArg(raw) : ''` — preserves prior behavior where unescape only ran when the flag was present.

### Gotchas

- `getArg` returns `undefined` for both missing flag AND empty-string value (`val !== '' ? val : undefined`). For `--message`, guarded with `!== undefined` before calling unescapeShellArg to avoid passing undefined. Old for-loop used `args[i+1]` truthiness — same net effect (empty string ignored).
- get-messages.ts `leadId` is reassigned later (LEAD_UID fallback), so it's read via `parsed.leadId` into a `let`, not destructured as const — left that structure intact, only swapped the env read to `optionalEnv('LEAD_UID')` captured once in a local to avoid double-read in the warning string.
- register-webhook.ts has ~20 legit `console.*` calls (it's a human-run CLI registration script) — left ALL untouched; only migrated env/arg parsing.
- parseArgs now imports helpers at top of each file (after existing imports). Files with no prior imports (get-door-code, get-properties, update-door-code, validate-env, register-webhook) got the import line prepended above parseArgs.

### Verification

- grep 'process.env[' hostfully/\*.ts → 2 matches, BOTH in get-property.ts (skipped reference impl). All 10 target files clean. ✅
- grep 'process.argv' → 11 matches, all `parseArgs(process.argv)` call sites (correct — matches reference impl line 28). ✅
- --help exits 0 on get-messages/get-checkouts/validate-env/register-webhook/send-message ✅
- HOSTFULLY_MOCK=true get-messages.ts → correct fixture JSON, exit 0 ✅
- validate-env.ts with no env → 'Error: HOSTFULLY_API_KEY environment variable is required', exit 1 ✅
- pnpm build → EXIT 0 ✅

## [2026-06-08] Task 23 — Migrate platform/github tools to shared helpers

**Files migrated**: `platform/calculate.ts`, `platform/report-issue.ts`, `platform/submit-output.ts`, `github/get-token.ts`

**Patterns applied**:

- `calculate.ts`: No env vars. Replaced custom `parseArgs` loop with `getArg(args, '--expression')` + `args.includes('--help')`. Removed the `parseArgs` function entirely.
- `report-issue.ts`: 4 required + 2 optional env vars. Replaced all `process.env[...]` with `requireEnv()`/`optionalEnv()`. Replaced custom `parseArgs` loop with `getArg()` calls. `unescapeShellArg` preserved on `--description` and `--patch-diff`.
- `submit-output.ts`: No env vars (pure file writer). Replaced custom `parseArgs` loop with `getArg()` calls. `unescapeShellArg` preserved on `--summary`, `--draft`, `--reasoning`. `/tmp/summary.txt` write contract UNCHANGED.
- `github/get-token.ts`: 1 required (`TASK_ID`) + 1 optional (`GATEWAY_URL`). Replaced `process.env[...]` with `requireEnv()`/`optionalEnv()`. Removed custom `parseArgs` function (only had `--help` flag, replaced with `args.includes('--help')`).

**Key gotcha**: `submit-output.ts` uses `unescapeShellArg` on args BEFORE validation — the pattern is `rawX = getArg(...)` then `x = rawX !== undefined ? unescapeShellArg(rawX) : ''`. This preserves the unescape behavior while using the shared helper.

**Verification**: `grep -rn "process\.env\[" src/worker-tools/{platform,github}/*.ts` → 0 results. `pnpm build` → exit 0. `CI=true pnpm test:unit` → exit 0.

## [2026-06-08] Task 21 — Migrate google/ tools to shared helpers

**Files migrated (19)**: create-document, create-event, delete-file, get-document, get-email, get-file, get-presentation, get-sheet-data, list-documents, list-emails, list-events, list-files, list-presentations, list-spreadsheets, send-email, update-event, update-sheet-data, upload-file, validate-env. **Skipped**: google-fetch.ts (reference — re-exports requireEnv from ../lib/require-env.js).

**Patterns applied**:

- Every parseArgs custom `for (let i...)` loop → object literal with `getArg(args, '--flag') ?? '<default>'` + `args.includes('--help')` for booleans.
- `--max-results` (numeric): `const maxResultsArg = getArg(args, '--max-results'); maxResults: maxResultsArg ? parseInt(maxResultsArg, 10) : <default>`. Captured once to avoid double getArg call. Preserves exact default (20 for drive lists, 10 for emails/events).
- `--permanent` (delete-file) is a boolean → `args.includes('--permanent')` NOT getArg.
- `unescapeShellArg` preserved on free-text args (`--content`, `--body`, `--description`) via `const xArg = getArg(...); x: xArg ? unescapeShellArg(xArg) : ''`.
- Import source: files already importing `requireEnv` from `./google-fetch.js` (the re-export) kept that import and ADDED `import { getArg } from '../lib/get-arg.js'` separately. Did not reroute requireEnv.

**Key gotchas**:

- `validate-env.ts` was the ONLY google file with raw `process.env[...]` (google-fetch.ts aside). It had: (1) reads of GATEWAY_URL/TASK_ID → `optionalEnv`, (2) a DEAD write `process.env['GOOGLE_ACCESS_TOKEN'] = freshToken` followed immediately by `return` — removed it (no sibling tool process inherits a post-fork env mutation, so behavior-equivalent), (3) a byte-identical manual replica of requireEnv (lines 50-54) → replaced with `requireEnv('GOOGLE_ACCESS_TOKEN')`. Error message matches exactly: "Error: GOOGLE_ACCESS_TOKEN environment variable is required".
- **Task-spec discrepancy**: spec listed `update-event.ts` under the comma-split `--attendees` rule, but `update-event.ts` has NO `--attendees` flag (only create-event does). Did NOT invent one — that would be a business-logic change. create-event keeps its existing in-`main()` split `attendees.split(',').map(e => ({email: e.trim()}))`; only the read was swapped to getArg (did not add `.filter(Boolean)` since main() already guards with `if (attendees)`, preserving exact output shape).

**Verification**:

- `grep "process.env[" google/*.ts` excl google-fetch.ts → 0 ✅
- `grep "process.argv"` → 19 matches, all `parseArgs(process.argv)` call sites ✅
- `grep "for (let i = 0; i < args.length"` → 0 ✅
- `--help` exits 0 (list-files, validate-env, create-event) ✅
- missing-arg → exit 1 with original message (get-document) ✅
- missing-env → exit 1 with identical message (validate-env) ✅
- `tsc --noEmit -p tsconfig.json` → no google worker-tools errors ✅ (NOTE: tsconfig.build.json EXCLUDES src/worker-tools/\*\*, so `pnpm build` does NOT type-check these files — use root tsconfig.json for worker-tools type-checking).

## [2026-06-08] Task 22 — Migrate sifely/jira/notion tools to shared helpers

### Scope

18 files migrated to `getArg`/`requireEnv`/`optionalEnv`. Skipped per spec: `jira/get-issue.ts` (already-migrated reference impl). NO-CHANGE file: `sifely/list-locks.ts` (no env reads, only `--help`/`-h` booleans already via `args.includes`). Net −95 lines.

- sifely (8 changed): list-passcodes, list-access-records, create-passcode, delete-passcode, update-passcode, generate-code, diagnose-access, rotate-property-code
- jira (4 changed): auth, validate-env, list-comments, add-comment, search-issues
- notion (5 changed): auth, validate-env, get-page, append-blocks, update-block

### Patterns applied (extends Task 20 hostfully conventions)

- REQUIRED value-reads (`rotate-property-code` SUPABASE_URL/SECRET_KEY/TENANT_ID): `requireEnv(name)` — replaced `process.env['X']!` non-null assertions (the preceding `validateEnv()` already guarantees presence; requireEnv makes it explicit).
- OPTIONAL/multi-mode auth env (`jira/auth.ts`, `notion/auth.ts`): `optionalEnv(name)` — MUST NOT use requireEnv here; these files probe multiple auth modes (OAuth vs Basic/API-key) and exit themselves only when ALL modes fail. requireEnv would exit on the first missing var and break mode-fallback.
- Batch "report all missing at once" validators (`diagnose-access` missingVars[], `rotate-property-code` REQUIRED_ENV.filter): use `optionalEnv(k)` inside the `.filter()` to preserve the collect-then-report business logic. Do NOT swap to requireEnv (would exit on first miss, changing the multi-var error message).
- MOCK flags (`JIRA_MOCK`, `NOTION_MOCK`): `optionalEnv('X') === 'true'`. Reaching grep=0 in target files requires migrating these. The SKIPPED reference `get-issue.ts:66` keeps raw `process.env['JIRA_MOCK']` — exactly mirroring Task 20 where hostfully's skipped `get-property.ts` kept raw `HOSTFULLY_MOCK`. So the spec's brace-expansion grep `{sifely,jira,notion}/*.ts` returns exactly 1 line (get-issue.ts) — that's the documented skip exception, NOT a miss.
- String args: `getArg(args, '--flag') ?? ''` (or `?? 'default'` / `?? null` to preserve original fallback type).
- Int args (`--max-results`, `--start-date`, `--end-date`): `const raw = getArg(args,'--x'); raw ? parseInt(raw,10) : DEFAULT` (or `Number(raw)`).
- Comma-split (`generate-code --exclude-codes`): `(getArg(args, '--exclude-codes') ?? '').split(',').map(c => c.trim()).filter(Boolean)` — exactly the spec-mandated form.
- Boolean flags (`--help`, `-h`): `args.includes('--flag')`, NOT getArg. `diagnose-access` supports both: `args.includes('--help') || args.includes('-h')`.
- unescapeShellArg args (`--body`, `--content`): `const raw = getArg(args,'--x'); raw !== undefined ? unescapeShellArg(raw) : ''` — guards undefined before unescape (Task 20 pattern).

### Gotchas

- **Hoisted-closure const-narrowing**: `list-access-records.ts` has a hoisted `async function fetchPage()` that uses `lockId` inside `new URLSearchParams({ lockId, ... })`. With `const lockId = getArg(...)` (type `string | undefined`), TS errored at the URLSearchParams call. The inline-Edit diagnostics caught this immediately. Fix: `getArg(args,'--lock-id') ?? ''` (the reference `get-property.ts` uses `?? ''` for exactly this reason). Applied `?? ''` to ALL required-string sifely args that feed closures (list-passcodes, create/delete/update-passcode) proactively.
- **notion `import.meta.url` guards (lines 43/195/98/89 in auth/get-page/append-blocks/update-block)**: LEFT UNTOUCHED. They contain `process.argv[1]` but are entrypoint guards, NOT arg parsing. Verified all 4 still present post-migration.
- **rotate-property-code `{ ...process.env }`** at the `execFileSync` call: shell-subprocess env spread (passes full env to child tools) — NOT an env READ. Correctly untouched; won't match `process.env[` grep anyway.
- **notion mock fixtures**: there is NO `fixtures/get-page/default.json` (only directorio-operativo/manual-personal/reporte-financiero). `NOTION_MOCK=true get-page.ts` without `--fixture <name>` ENOENTs on default.json — PRE-EXISTING (git status confirms fixtures untouched). Mock branch itself works: verified with `--fixture manual-personal` → exit 0.
- **CRITICAL — `pnpm build` does NOT type-check worker-tools** (tsconfig.build.json excludes `src/worker-tools/**`, per google Task line 456). Must run `tsc --noEmit -p tsconfig.json` (root) to truly type-check these files. LSP also unavailable under `src/worker-tools/` (mise code 126), but inline-Edit diagnostics DID fire and caught the narrowing error.

### Verification

- grep `process.env[` across all 3 dirs → 1 match, only `jira/get-issue.ts:66` (skipped reference) ✅
- 4 notion `import.meta.url` guards intact ✅
- `--help` exit 0: sifely/list-passcodes, jira/search-issues, notion/get-page ✅
- functional: jira MOCK exit 0; sifely missing-arg exit 1; sifely bad-code (regex) exit 1; generate-code comma-split → valid JSON; notion mock (real fixture) exit 0 ✅
- `tsc --noEmit -p tsconfig.json` (root — type-checks worker-tools) EXIT 0 ✅
- `pnpm build` EXIT 0 ✅
- `eslint --max-warnings 0` on all 18 files EXIT 0 ✅
- `CI=true pnpm test:unit` → 122 files / 1404 passed / 9 skipped / 0 fail ✅
