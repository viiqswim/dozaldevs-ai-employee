# Learnings — slack-ux-remediation

## [2026-06-05] Session Start

- Plan: `.sisyphus/plans/2026-06-05-1418-slack-ux-remediation.md` (756 lines, 12 tasks + F1-F5)
- Zero implementation done — starting from scratch
- Commit a9e611a5 already fixed: task received/failed/complete, "Processing…", "AI skipped this task" in slack-blocks, passive triggered-by, reminder footer
- Dashboard files (ModelCatalogPage.tsx, EmployeeList.tsx, IntegrationsPage.tsx) are OUT OF SCOPE — do NOT stage
- USER-APPROVED copy strings are verbatim in Task 1 spec — use EXACTLY as written
- Wave 0 (T1) must complete before Wave 1 (T2, T3, T8, T9) can start
- Wave 1 must complete before Wave 2 (T5, T6, T7) can start
- Wave 2 must complete before Wave 3 (T4, T10, T11) can start

## Task 2 — pre-extract-inputs step (2026-06-05)

### Pattern: `handlers.ts` is canonical for `requiredInputs` derivation
The exact filter for required inputs lives in `src/gateway/slack/handlers.ts` lines 1576-1600:
- `item.required === true && (item.frequency === 'every_run' || item.frequency === undefined)`
- Map to `{key, label, description, type, options}` — matches `extractInputsFromText` field shape

### `triggerCardPrompt` already exists in `slack-copy.ts`
Returns `Want me to get *${employeeName}* started?` — used for BOTH the mrkdwn block header and the fallback `text` field.

### Size guard: 1800 bytes (not 2000)
Slack button `value` max is 2000 chars but we guard at 1800 to leave headroom for encoding variance. Use `Buffer.byteLength(str, 'utf8')` not `.length` (multibyte chars).

### Step return type annotation
`async (): Promise<Record<string, string>>` required to avoid TypeScript implicit `any` return type inferred from multiple `return {}` branches.

### `.sisyphus/evidence/` is gitignored
Evidence files land outside git. The step produces build artifacts in `dist/` — do not try to commit them.

### `extractInputsFromText` error contract
The function has an outer try/catch that always returns `{}` on hard errors — but the task requires an additional catch at the call site for defensive layering. Both layers return `{}`.

## Task 3 — TRIGGER_CONFIRM handler (2026-06-05)

### Changes made
- Added `extractedInputs?: Record<string, string>` to ctx type — reads pre-extracted inputs from button value JSON
- Added `await new Promise<void>((r) => setImmediate(r))` after `ack()` for socket buffer flush before any async work
- Loading respond now uses `loadingMessage('your request')` (no role name available before DB fetch)
- Removed 25-line cosmetic `callLLM` block — was generating a "confirmation sentence" with 1-2s latency
- allFound path: in-thread `chat.postMessage` uses `loadingMessage(role_name)`; respond uses `successMessage(role_name, userId)`
- someFound path: `chat.postMessage` uses `missingInfoMessage(role_name, inputList)`; respond uses `loadingMessage(role_name)`
- Default path (no inputs): respond uses `successMessage(role_name, userId)`
- Catch block: respond uses `failureMessage()`

### Test file updates
- Test 1: `toContain('Working on it')` → `toContain('One moment')` (matches `loadingMessage` output)
- Test 4 (was pre-existing FAIL): `'Failed to trigger' || '⚠️'` → `'ran into a problem' || 'trying again'` (matches `failureMessage()` output)

### Gotcha: pre-existing test failure
Test 4 was ALREADY failing before this task — handler said "Hmm, something went wrong..." but test checked for 'Failed to trigger' or '⚠️'. Fixed as part of this task.

### Pattern confirmed: setImmediate for socket flush
Node.js event loop processes microtasks (Promises) before macrotasks (I/O callbacks). Adding `setImmediate` after `ack()` ensures the ack response is flushed to the Slack socket before the handler proceeds to async DB work.

## [2026-06-05 16:15] Task 9 — remaining-string replacement notes

- All 9 enumerated robotic strings replaced with `slack-copy.ts` constants across 5 files:
  - `employee-lifecycle.ts`: 11 call sites (supersededMessage ×4, completedNoApprovalMessage ×2, noActionSkippedMessage, reviewingDraftedMessage, needsReviewMessage, expiredMessage ×2).
    - `noActionSkippedMessage(roleName, reasoning || undefined)` — `roleName` (decl ~1429) + `reasoning` (~1427) both in scope at 1463.
    - `reviewingDraftedMessage(reviewingGuestName)` — collapsed the old ternary; the fn handles the name? branch internally.
    - `needsReviewMessage(...)` — passed combined `guestName · propertyName` as the optional name arg; fn prepends "Hey — ".
  - `rule-extractor.ts`: ruleProposedMessage(ruleText) ×2 (block + fallback text).
  - `rule-synthesizer.ts`: ruleMergedMessage(merge.merged_text, originalsText) ×2, ruleContradictionMessage(contradiction.description, conflictRules) ×1.
  - `interaction-handler.ts`: ruleProposedMessage(text) ×2, questionNoAnswerFallback() ×1.
  - `slack-blocks.ts`: line 341 `expired` branch mainText now `${expiredMessage()}${guestSuffix}${propertyLine}` — preserves enrichment suffix + ⏰ emoji (test only asserts `⏰`). Compact badges at 394/412/415 ("Awaiting approval"/"No action needed"/"Superseded") left untouched — one/two-word badges, do NOT match the forbidden grep.
- Test fixups: `tests/inngest/lifecycle-enriched-notify.test.ts` Test 5/6 asserted old `'Awaiting approval — reply drafted'`. Changed find-predicate to `.includes("I've drafted")` and exact assert to `reviewingDraftedMessage()` (imported). slack-blocks.test.ts needed NO change (expired test only checks `⏰` + taskId).
- Build exit 0; slack-blocks.test.ts 70 passed; lifecycle-enriched-notify.test.ts 6 passed.
- LSP (typescript-language-server) unavailable in this env (`code 126, no version set`) — relied on `tsc -p tsconfig.build.json` as the type-check authority.

## Task 6 (B2) — Guest + Override handler reordering

- Pattern: for action handlers that open modals, call `chat.update` (no buttons) BEFORE `views.open`
- Pattern: for view handlers with polling/DB work, call `chat.update` (loading state) BEFORE the slow work
- Loading text: "On it — one moment…" for modal-opening action handlers; "⏳ Got it — working on…" for view handlers
- Block structure: just `section` + `context` with taskId — NO `actions` block = buttons removed
- Reference pattern: `guest_reject_modal` view handler already had `chat.update` before the inngest.send
- Pre-existing test failures: 28 in tests/gateway/slack/ — not caused by B2 changes

## Task 7 — B3 Rule Handler Reordering

**Pattern**: All 4 handlers followed same template — add `chat.update` (buttons removed, loading state) immediately after `ack()` and guard checks, before any async DB/API work. 

**Private metadata threading**: When an action opens a modal, pass `channelId` and `messageTs` in private_metadata so the view submission handler can do its own early button-removal update without needing a DB lookup for the channel/ts.

**ruleProposedMessage import**: `ruleProposedMessage` was in `slack-copy.ts` but not imported in handlers.ts. Simply added to the existing import destructure.

**Pre-existing test failures**: `tests/gateway/slack/rule-handlers.test.ts` has 8 pre-existing failures due to `boltApp.use is not a function` in the test mock — unrelated to handler logic, not a regression.

**Commit**: `579c97d5` — `perf(slack): remove buttons before heavy work in approval/rule/modal handlers`

## Task 10 — pre-extract-inputs test harness (2026-06-05)

### Pattern: invoking Inngest functions in tests
- Access the inner function via `(fn as any).fn({ event, step })` — same pattern as slack-input-collector.test.ts
- `step.run` mock: `vi.fn().mockImplementation(async (_name, fn) => fn())` — executes the callback directly

### Pattern: testing size-guard logic
- The size-guard checks `Buffer.byteLength(valueWithExtracted, 'utf8') <= 1800`
- To trigger it: return 20 fields × 100 chars each from `extractInputsFromText` — produces ~2442 bytes
- Assert `cardValue?.extractedInputs` is undefined AND the raw button value is ≤1800 bytes

### Pattern: verifying separate fetch for input_schema
- `resolveArchetypeFromChannel` is mocked at module level — returns `{ id, role_name }` only
- The pre-extract step makes its own `fetch` to `/rest/v1/archetypes?...&select=input_schema`
- Assert: `archetypeFetches[0][0]` contains `select=input_schema`

### Pattern: failure-isolation test
- Mock `extractInputsFromText` to reject with `CostCircuitBreakerError`
- Assert `resolves.not.toThrow()` — the step catches internally and returns `{}`
- Assert Slack postMessage was still called (card still posts)

### Mock setup gotcha
- `mockFetch` must handle both `/rest/v1/archetypes` (returns input_schema) and `slack.com/api/chat.postMessage` (returns `{ ok: true }`)
- For test b (no required inputs), override `mockFetch` inside the test to return `input_schema: []`

## Task 11 — Watchdog test harness (2026-06-05)

- `createReviewingWatchdogTrigger` exports a function that returns an Inngest function; invoke via `(fn as any).fn({ step })` — same pattern as other trigger tests
- `step.run` mock: `vi.fn().mockImplementation(async (_name, fn) => fn())` — executes the callback inline
- `PrismaClient` must be mocked (used inside the watchdog for `loadTenantEnv` deps)
- `loadTenantEnv`, `createSlackClient`, and `updateMessage` all need hoisted mocks via `vi.hoisted()`
- `setupFetch` helper pattern: route by URL substring + HTTP method to return correct mock responses for tasks, pending_approvals, PATCH, and task_status_log
- `.sisyphus/evidence/` is gitignored — evidence files can't be committed; save them locally only
- Call order verification: check `mockFetch.mock.calls` index for PATCH before checking `mockUpdateMessage` was called — both happen in the same `step.run` callback
- `watchdogFailureMessage()` returns: `"❌ This one timed out before it could finish — I didn't get what I needed in time. Mind kicking it off again?"`
