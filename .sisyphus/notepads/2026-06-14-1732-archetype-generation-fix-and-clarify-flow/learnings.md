# Learnings

## [2026-06-14] Plan Initialized

### Key File Locations

- `src/gateway/services/archetype-generator.ts` — generate() at :622, refine() at :673, converse() at :786, callLLMWithJsonRetry() at :457, \_persistCall() at :448
- `src/lib/call-llm.ts` — empty-content throw at :300-306
- `src/gateway/routes/admin-archetype-generate.ts` — catch at :122-132
- `src/gateway/routes/admin-archetype-propose-edit.ts` — edit converse route (precedent)
- `src/repositories/ArchetypeGenerationCallRepository.ts` — trace persistence
- `dashboard/src/panels/employees/CreateEmployeePage.tsx` — error at :73, :258; navigate at :155
- `dashboard/src/panels/employees/EmployeeList.tsx` — New Employee nav at :94
- `dashboard/src/panels/employees/components/EmployeeListStates.tsx` — New Employee navs at :30, :78, :85
- `dashboard/src/panels/employees/use-chat-conversation.ts` — hardcoded converseEdit at :2, archetypeId required at :67, called at :101
- `dashboard/src/panels/employees/AssistantTab.tsx` — current consumer of useChatConversation
- `dashboard/src/lib/gateway.ts` — generateArchetype at :250, error throw at :90
- `dashboard/src/hooks/use-tenant.ts` — tenant resolution, searchParams first at :42

### Root Causes (code-verified)

1. generate() at :622 omits `responseFormat: { type: 'json_object' }` — refine() and converse() both set it
2. callLLMWithJsonRetry first callLLMFn() is OUTSIDE try/catch — zero retries on empty content
3. generate() catch rewraps empty-content error as "invalid JSON" — misleading
4. \_persistCall hardcodes retry_count:0, status:'success' BEFORE JSON validation — mislabels failures
5. Dashboard surfaces raw err.message — non-technical-user violation
6. URL convention violated at 5 sites — tenant not in URL for New Employee nav

### Test Files

- `tests/unit/gateway/archetype-generator-instrumentation.test.ts` — existing mock pattern (makeRoutingLLM)
- `tests/unit/gateway/services/archetype-generator-repair.test.ts` — existing repair tests
- `tests/unit/repositories/archetype-generation-call-repository.test.ts` — existing repo patterns

## [2026-06-14] Task 1 — JSON mode fix + regression guardrail

### Fix Applied

- `src/gateway/services/archetype-generator.ts` line 622: added `responseFormat: { type: 'json_object' as const }` to `generate()` llmOptions
- Now all 3 paths (generate, refine, converse) are symmetric

### Test Pattern Used

- `makeCaptureRoutingLLM(mainResponse)` — captures all non-estimator opts into `capturedOptions[]`
- Routes by `ESTIMATOR_SYSTEM_PREFIX` to avoid estimator calls polluting captured options
- New file: `tests/unit/gateway/services/archetype-generator-json-mode.test.ts`
- 3 tests: one per entry point, each asserts `responseFormat: { type: 'json_object' }`

### TDD Cycle

- RED: generate() test failed with `expected undefined to deeply equal { type: 'json_object' }`
- GREEN: after one-line fix, all 3 tests pass; full suite 168 files, 1932 passed, 9 skipped, 0 failures

### Gotcha

- The `callLLMWithJsonRetry` signature already accepts `responseFormat?: { type: 'json_object' }` — no type changes needed

## Task 2 — Empty-Content Retry in callLLMWithJsonRetry (2026-06-14)

### Bug

First `callLLMFn()` call at line 471 was OUTSIDE the try/catch in `callLLMWithJsonRetry`.
When `call-llm.ts:305` throws `Error('LLM returned empty content — possible reasoning-only response')`, it propagated uncaught with zero retries → immediate GENERATION_FAILED.

### Fix

Moved first call INSIDE a try/catch. On `err.message.includes('empty content')`, retry exactly once with nudge messages. After one failed retry, propagates naturally.

### Pattern Used

Mirrors the JSON-parse retry pattern (lines 508-552) but for throws not parse failures.
Used `let result` + `emptyContentRetried = false` flag pattern.
`emptyContentRetried` also used to set `retry_count: 1` in `_persistCall`.

### Test Strategy

`makeRoutingMock` in the repair test already handles thrown errors via `if (step instanceof Error) throw step`.
Updated existing test that documented OLD behavior (expected 1 call, GENERATION_FAILED).
New tests: `[guardError, VALID_REFINE_JSON]` → resolves + 2 calls; `[guardError, guardError]` → rejects + 2 calls.

### Key Type

`Awaited<ReturnType<typeof this.callLLMFn>>` is the correct type for `result` before the async call.

### Evidence

- `.sisyphus/evidence/task-2-recover.txt`
- `.sisyphus/evidence/task-2-bounded.txt`
- `✓ tests/unit/gateway/services/archetype-generator-repair.test.ts (14 tests)`

## T3: Error Classification Fix (2026-06-14)

### Problem

Both `generate()` and `refine()` catch blocks in `archetype-generator.ts` rewrapped ALL errors as "LLM returned invalid JSON" — even when the actual failure was empty/reasoning-only content from `call-llm.ts`.

### Root Cause

The catch blocks used a single `throw new Error(\`GENERATION_FAILED: LLM returned invalid JSON — ${String(err)}\`)` for all error types.

### Fix Pattern

Detect the error type by checking the message string:

```typescript
const errMsg = err instanceof Error ? err.message : String(err);
const isEmptyContent = errMsg.includes('LLM returned empty content');
if (isEmptyContent) {
  throw new Error(`GENERATION_FAILED: LLM returned no usable content — ${errMsg}`);
}
throw new Error(`GENERATION_FAILED: LLM returned invalid JSON — ${errMsg}`);
```

### Key Strings

- Empty-content error from `call-llm.ts:305`: `'LLM returned empty content — possible reasoning-only response'`
- Detection substring: `'LLM returned empty content'`
- New thrown message: `'GENERATION_FAILED: LLM returned no usable content — ...'`
- JSON-parse message: `'GENERATION_FAILED: LLM returned invalid JSON — ...'` (unchanged)

### TDD Approach

- Wrote RED tests first asserting `/no usable content/i` match and `/invalid JSON/i` non-match for empty-content case
- Wrote RED tests asserting `/invalid JSON/i` match for JSON-parse case
- Fixed both `generate()` and `refine()` catch blocks
- All 168 test files, 1937 tests GREEN

### Files Changed

- `src/gateway/services/archetype-generator.ts` — generate() catch (~line 661) and refine() catch (~line 716)
- `tests/unit/gateway/services/archetype-generator-repair.test.ts` — added 4 new tests in 2 new describe blocks

## Task 4 — Trace Accuracy Tests (2026-06-14)

### Verification of T2 and T3 fixes

**T2 fix confirmed correct** (lines 493-510 in callLLMWithJsonRetry):

- `retry_count: emptyContentRetried ? 1 : 0` — correctly reflects whether the empty-content retry path was taken
- `status: 'success'` — only reached when JSON parsing succeeds (after the `_persistCall` block)
- The `_persistCall` is called BEFORE `JSON.parse(raw)` but AFTER the LLM call succeeds — this is intentional: it records the LLM call result, not the JSON parse result. The JSON parse retry path has its own separate `_persistCall` at lines 541-557.

**T3 fix confirmed correct** (lines 668-677 in generate() catch):

- `status: 'failed'` with `error_message: errMsg` — correctly records failures
- `errMsg` distinguishes empty-content from JSON-parse errors via `isEmptyContent` check

### Test pattern used

Added `makeMultiStepRoutingLLM(genSteps: GenStep[])` to `archetype-generator-instrumentation.test.ts`:

- Supports a sequence of generation responses (string or Error)
- Estimator calls (detected by system prompt prefix) always return '15' and don't consume a step
- This pattern mirrors `makeRoutingMock` in `archetype-generator-repair.test.ts`

### Key insight: \_persistCall placement

The success-path `_persistCall` at lines 493-510 records the LLM call result (model, tokens, cost, latency) BEFORE JSON validation. This is correct because:

1. The LLM call itself succeeded (returned content)
2. The `retry_count` reflects empty-content retries, not JSON-parse retries
3. JSON-parse failures have their own separate `_persistCall` at lines 541-557 (with `retry_count: 1`)
4. If JSON parse ultimately fails, the generate() catch block records a `status:'failed'` row

### Evidence files

- `.sisyphus/evidence/task-4-trace-success.txt` — empty-then-success scenario
- `.sisyphus/evidence/task-4-trace-failed.txt` — both-empty scenario

## Task 5 — Friendly Generation Errors (2026-06-14)

### Three-layer change (single goal)

1. **Route** `src/gateway/routes/admin-archetype-generate.ts`: added exported const `GENERATION_FAILED_FRIENDLY_MESSAGE` and passed it as the `message` arg to `sendError(res, 422, 'GENERATION_FAILED', GENERATION_FAILED_FRIENDLY_MESSAGE, { details: message })`. `details` (technical) is preserved for debugging. `sendError` body shape = `{ error, message?, ...extra }`, so the friendly text lands in `body.message` and technical in `body.details`.
2. **gateway.ts** `generateArchetype`: stopped using shared `gatewayFetch` (which throws raw `Gateway error <status>: <text>`). Inlined a `fetch` + on `!ok` throws `friendlyGenerationError(response)` which parses the JSON body, extracts `body.message` if it's a string, else falls back to `GENERIC_GENERATION_ERROR`. `.json().catch(() => null)` guards non-JSON bodies (e.g. HTML 502).
3. **CreateEmployeePage.tsx**: added `friendlyGenerationMessage(err)` sanitizer used in the `handleGenerate` catch. Regex `/gateway error|\b\d{3}\b|[{}]|GENERATION_FAILED|invalid JSON|\bLLM\b|<[^>]+>/i` detects technical leakage and substitutes a generic friendly string. This is defense-in-depth: even if some other path throws a raw error, the UI never shows it.

### Why sanitize in BOTH gateway.ts and the component

The component test mocks `generateArchetype` to reject with a raw `Gateway error 422 ... {json}` directly, so the component cannot rely solely on gateway.ts producing clean errors. Belt-and-suspenders: gateway.ts produces friendly errors for the real path; the component sanitizes anything technical-looking regardless of source.

### Test approach

- Backend: supertest + mocked `ArchetypeGenerator.generate` rejecting with `GENERATION_FAILED: ...`. Asserted `body.message` is friendly (matches /try again/, NOT /GENERATION_FAILED|invalid JSON|LLM|SyntaxError/) AND `body.details` === technical string. Also a 500 non-generation case unchanged. Mock pattern mirrors `admin-archetype-propose-edit.test.ts` (auth/authz/composio/ArchetypeGenerationCallRepository all mocked).
- Dashboard gateway.ts: `vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify(body),{status}))`. Covered: friendly from body, no leakage, no-message fallback, non-JSON-body fallback.
- Dashboard component: mocked `@/lib/gateway`, `react-router-dom` (useNavigate only), all 3 hooks, `WizardEditStep`, `MarkdownPreview`. Drove describe→generate, asserted error step renders friendly text and NOT "Gateway error"/"422"/braces.

### Gotchas

- `vitest.config.ts` has a PRE-EXISTING LSP error (`coverage` not in UserConfigExport type) — not mine, do not touch.
- LSP `mcp_Lsp_diagnostics` unavailable in this env (no typescript-language-server version set) — used `cd dashboard && pnpm exec tsc -b` (exit 0) for dashboard typecheck instead; backend covered by full unit suite.
- Comment hook flagged 2 self-documenting test comments — removed them (assertions are self-explanatory).

### Results

- Backend route test: 3/3 pass. Full backend: 169 files, 1942 passed, 9 skipped, 0 fail.
- Dashboard: full suite 18 files, 105 passed; `tsc -b` exit 0.
- Evidence: `.sisyphus/evidence/task-5-friendly.txt`

## Task 6: Tenant URL Convention Fix (New Employee Navigation)

### Pattern

When state components (Loading, Empty, Error) need tenant context for navigation, add `useTenant()` directly inside the component rather than prop-drilling from the parent. This keeps components self-contained.

### Files Fixed

- `EmployeeList.tsx:94` — navigate to `/dashboard/employees/new?tenant=${tenantId}`
- `EmployeeListStates.tsx` — added `useTenant` import; fixed 3 navigate calls in `EmployeeListLoading` and `EmployeeListEmpty`
- `CreateEmployeePage.tsx:165` — back-nav now preserves `?tenant=${tenantId}`

### Key Insight

`useTenant()` reads `searchParams.get('tenant')` first (line 42 of use-tenant.ts), so adding `?tenant=` to the URL is sufficient — no other changes needed for the tenant to be correctly resolved on the destination page.

### Pre-existing LSP Error

`vitest.config.ts` has a pre-existing `coverage` type error — unrelated to these changes.

## Task 7: Live Generate E2E Verification (Wave 2 Gate) — PASSED

### Result

The Wave 1 fix works end-to-end against the real default LLM. The previously-failing prompt now succeeds.

- **Prompt tested**: `"reads all of our Slack channels and provides an executive summary"`
- **HTTP status**: 200
- **identity**: non-empty (171 chars) — e.g. role `slack-executive-summarizer`
- **execution_steps**: non-empty (807 chars)
- **execution model selected**: `minimax/minimax-m2.7` (default catalog model — real, not mocked)
- **DB trace** (`archetype_generation_calls`, tenant VLRE, call_type=generate): `status=success`, `retry_count=0`, `error_message=NULL`, `model_actual=deepseek-v4-flash`

### Key Insight: two distinct models in one generate call

The `model` field in the response (`minimax/minimax-m2.7`) is the **execution model** the recommendation engine picked for the future employee. The `model_actual` in the `archetype_generation_calls` trace (`deepseek-v4-flash`) is the **gateway/judge model** that actually generated the archetype fields. These are different things and both appearing is correct — do not confuse them when reading traces.

### `retry_count=0` confirms the JSON-mode fix

A `retry_count=0` success means JSON mode returned valid non-empty content on the first attempt — the bounded retry was never needed. This is the healthiest possible outcome for the Wave 1 fix (JSON mode + bounded retry on empty content).

### Gotcha: `.env` cannot be `source`d in zsh

`source .env` fails with `parse error near '\n'` (line 96 has an escaped newline that zsh chokes on — pre-existing, unrelated to this plan). Workaround for scripts/curl: read the single var directly instead of sourcing the whole file, e.g. grep `^SERVICE_TOKEN=` and assign inline.

### Gotcha: `python3` is intercepted by asdf

`python3 -c ...` fails with "No version is set for command python3" in this repo (asdf shim, no `.tool-versions` python pin). Use `jq` for JSON assertions in evidence scripts instead of inline python.

### Evidence

- `.sisyphus/evidence/task-7-generate.json` (full 5319-byte response body)
- `.sisyphus/evidence/task-7-trace.txt` (DB trace row)

## T8: converse-create route (2026-06-15)

### What was built

- `POST /admin/tenants/:tenantId/archetypes/converse-create` — creation-mode clarify-then-act
- Route: `src/gateway/routes/admin-archetype-converse-create.ts`
- Tests: `tests/unit/gateway/routes/admin-archetype-converse-create.test.ts` (13 tests, all green)
- Registered in `src/gateway/server.ts`

### Key design decisions

1. **Empty baseline**: `buildEmptyBaseline()` constructs a `GenerateArchetypeResponse` with all string fields empty, tools=[], manual trigger. This makes `converse()` treat the entire proposal as new.
2. **Wider allowlist**: `applyCreateAllowlist()` includes `role_name`, `model`, `runtime` (which the edit allowlist strips). These are needed when the UI calls `POST /archetypes` to actually create.
3. **Shared converse()**: Route calls `generator.converse(transcript, baseline, catalog, composioContext)` — the exact same method as `propose-edit`. No second implementation.
4. **validateProposalFields reuse**: Works correctly with empty baseline — the "blanking non-empty field" check uses `baselineNonEmpty && proposedEmpty`, so with empty baseline, this guard never fires.
5. **generationCallRepo.record with archetype_id: null**: Correct since no archetype exists yet.
6. **no_change detection**: Works naturally — with empty baseline, any meaningful proposal has non-empty changedFields, so no_change only triggers if proposal is also empty.

### Test patterns

- `vi.mock` the `ArchetypeGenerator` module with `mockConverse` spy
- `makePrisma()` only needs `modelCatalog.findMany` (no archetype.findFirst since no DB lookup)
- ArchetypeGenerationCallRepository fails silently (try/catch in route) — no mock needed
- Pre-existing test failures: `admin-members.test.ts` (1 fail), `admin-slack-channels.test.ts` (1 fail) — not regressions

### Evidence files

- `.sisyphus/evidence/task-8-question.txt` — ambiguous→question test proof
- `.sisyphus/evidence/task-8-proposal.txt` — sufficient→proposal test proof
- `.sisyphus/evidence/task-8-shared-converse.txt` — spy test proof of shared converse()

---

## [2026-06-15] Task 9 — Generalized hook + wizard chat escalation

### Hook generalization pattern

- `useChatConversation(converseFn)` — single arg, no archetypeId, no gateway import
- Caller closes over whatever IDs it needs: `useChatConversation((t) => converseEdit(tenantId, archetype.id, t))`
- Both AssistantTab (edit) and CreateEmployeePage (create) use the same hook file — no duplication
- Test pattern: pass `vi.fn().mockResolvedValue(response)` directly — no `vi.mock('@/lib/gateway')` needed

### CreateEmployeePage chat escalation pattern

- `inChatMode = chatHook.messages.length > 0 || chatHook.isLoading` — drives which UI to show
- `useEffect` watches `chatHook.messages` for a `kind:'proposal'` message while `step === 'describe'`
- On proposal detected: merge `{ ...baseline, ...proposal }`, populate editedFields, call `setStep('edit')`
- proposal immediately → edit step (no chat shown); question → chat UI appears
- `chatHook.startFresh()` resets all state when user clicks "Start over"

### converseCreate response shape

- Returns same `ConverseResponse` type as `converseEdit`
- `baseline` in proposal is `applyCreateAllowlist(buildEmptyBaseline())` — empty strings, not a full archetype
- Merge `{ ...baseline, ...proposal }` then cast as `GenerateArchetypeResponse` for `setConfig`

### Test patterns for CreateEmployeePage

- Mock `converseCreate: vi.fn()` in gateway mock (alongside `generateArchetype` which is still mocked but unused)
- `MINIMAL_PROPOSAL` fixture: baseline with empty strings + proposal with real values
- `describeAndGenerate()` helper: fill textarea + click Generate button
- Chat reply: fill `placeholder=/reply/i` textarea + click `name=/send/i` button
- `waitFor(() => screen.getByTestId('wizard-edit-step'))` — confirms edit step reached

### Evidence

- `.sisyphus/evidence/task-9-verification.txt` — tsc clean + 170 files / 1955 tests passed

## Task 10 — Backstop + ambiguity tests for CREATE clarify-then-act flow (2026-06-15)

### CRITICAL spec correction (real backstop behavior)

The plan's expected-outcome said ">5 assistant turns coerces question → PROPOSAL". That is NOT what the
code does. Verified in `archetype-generator.ts`:
- Threshold: `assistantTurns >= 5` (line 813) — note `>=`, so exactly 5 turns activates it.
- When active, two mechanisms:
  1. PROMPT injection (lines 822-824): prepends "IMPORTANT: You have asked enough clarifying
     questions. You MUST now produce a proposal ... Do NOT ask another question." — this is how it
     FORCES a proposal from a cooperative LLM.
  2. SAFETY coercion (lines 856-859): if the LLM disobeys and still returns `kind:'question'`,
     the result is coerced to `kind:'no_change'` (NOT proposal). Code log: "backstop active but
     model returned question — coercing to no_change".
- Net guarantee: once backstop is active, converse() NEVER returns `kind:'question'`. It returns
  `proposal` (LLM cooperated) or `no_change` (LLM disobeyed). No infinite questioning. Tests assert
  this true guarantee, not the spec's incorrect "→proposal" claim.

### Pre-existing coverage (do NOT duplicate)

`tests/unit/gateway/services/archetype-generator-converse.test.ts` ALREADY had:
- backstop question→no_change coercion test
- too_long token-budget guard test (huge message, asserts fn NOT called)
These cover the SHARED converse() used by both edit and create paths. The create route
(converse-create) calls the identical method, so backend backstop is covered at the unit level here —
no need to re-test through the HTTP route.

### What Task 10 ADDED (4 backend + 1 dashboard)

Backend (`archetype-generator-converse.test.ts`, now 8 tests):
1. forces a proposal once 5 assistant turns exist + LLM cooperates (positive path)
2. injects "you MUST now produce a proposal" / "do not ask another question" directive into prompt
   when backstop active (asserts via captured `messages[1].content`)
3. does NOT inject the directive below threshold (4 assistant turns) — boundary test
4. never returns question once active, at 6 and 10 turns (robustness)

Dashboard (`CreateEmployeePage.test.tsx`, now 5 tests):
5. converseCreate→{kind:'too_long'} renders friendly "too long"/"start a new session" chat bubble,
   NOT the error step (asserts `Generation Failed` absent, `wizard-edit-step` absent)

### Test helper patterns added

- `makeCapturingConverseMock(response)` returns `{ fn, converseUserContents }` — pushes
  `opts.messages[1].content` (the user prompt) for every non-estimator call so the test can assert
  prompt injection. Estimator calls (system prefix "You estimate manual task duration") return '5'
  and are skipped.
- `makeTranscript(assistantTurns)` builds a transcript with exactly N assistant turns (user,
  [assistant,user]xN). Use N=5 to activate backstop, N=4 to stay below threshold.
- `PROPOSAL_RESPONSE` = stringified `{kind:'proposal', config:{...makeConfig(), identity:'...'}}` —
  feeds the cooperative-LLM path.

### too_long in the wizard UI (confirmed wiring)

`CreateEmployeePage` uses `useChatConversation` which handles `kind:'too_long'` by appending a text
bubble "The conversation is getting too long. Please start a new session to continue making changes."
and setting `mustStartFresh=true`. The wizard renders this as a normal assistant chat bubble inside
the `inChatMode` view — there is NO dedicated too_long UI and it never reaches the `step:'error'`
branch. The test asserts on the bubble text, which is the correct user-visible behavior.

### Comment hook

The 2 helper-function comments I initially wrote were flagged unnecessary and removed — helper names
are self-explanatory, matching the existing file's no-comment style.

### Results

- Backend: 170 files, 1959 passed, 9 skipped, 0 failures (baseline 1955 → +4)
- Dashboard: 18 files, 111 passed, 0 failures (baseline 110 → +1); `tsc -b` exit 0
- Evidence: `.sisyphus/evidence/task-10-backstop.txt`

## Task 11 — Live Clarify-Flow E2E (2026-06-15) — PARTIAL PASS + 1 BLOCKER

Tested commit `94a2aac3` (clarify-then-act creation flow). Real LLM, no mocks. Browser via Playwright MCP (headed, authenticated session — CDP-to-existing-Chrome was unavailable because the user's Chrome was not launched with `--remote-debugging-port=9222`; the Playwright MCP's own headed browser is equivalent for dashboard testing).

### VERIFIED PASS

1. **T6 URL convention** — "+ New Employee" navigates to `/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`; the `?tenant=` param survives a direct re-navigation/refresh (page renders the create form, no redirect to tenant picker). Outcome #1 ✅.
2. **T9 clarify escalation (UI mechanics)** — Ambiguous prompt `"summarize all my Slack channels"` → "Generate" → `inChatMode` activates → assistant returns `kind:'question'`: *"Which Slack channels would you like to summarize? I need the channel names or IDs..."*. Chat bubble + "Reply…" box + "Start over" render correctly. Reply accepted, sent as a second turn. Evidence: `task-11-clarify-flow.png`.
3. **Conditional chat (no premature chat)** — Clear prompt `"Every weekday at 9am, read the #support Slack channel and post a summary..."` produced **NO clarifying question** — the server went straight to a proposal attempt (correct: `converse()` prefers acting over asking when the request is specific). The chat container only appeared because of the failure below, not because a question was asked. Evidence: `task-11-direct-no-chat.png`.
4. **"Start over"** correctly resets `chatHook` back to the describe step (empty textarea, disabled Generate).
5. **Friendly error surfacing (T5)** — The 422 surfaced to the user as *"I couldn't turn that into a change just now — the request may have been too complex..."* — no raw error/status/JSON leaked. T5 sanitizer holds even on the converse path.

### BLOCKER — converse-create proposal always fails `PROPOSAL_INVALID` with the live LLM

Both scenarios reached a server-generated proposal but the route returned **HTTP 422 `PROPOSAL_INVALID`**, so the wizard NEVER reached the edit step and NO draft archetype was created (`task-11-draft.txt` shows newest archetype is `daily-motivation` from 2026-06-14 04:08 — pre-dates this test).

**Exact 422 bodies:**
- Scenario A (ambiguous): rejected tools `slack/read-channels`, `slack/post-message`, `platform/submit-output` — "not in the platform's tool library" + `trigger_sources: "Invalid input"`.
- Scenario B (clear): rejected tools serialize as `[object Object]` (the LLM emitted tool entries as OBJECTS, not strings) + same `trigger_sources` invalid.

**Root cause (code-verified):**
- The validator `validateTools()` in `src/gateway/lib/archetype-edit-helpers.ts:84` builds its allowed set from `ALL_TOOL_DESCRIPTORS.map((d) => toolInvocationPath(d).replace(/^tsx /, ''))` → canonical paths like `/tools/slack/post-message.ts`. It does an exact `Set.has(tool)` match — no normalization.
- The live `converse()` LLM emits tools in the WRONG shape: bare `slack/post-message` (no `/tools/` prefix, no `.ts`) OR objects (`[object Object]`). `postProcess()` (archetype-generator.ts:358) does NOT normalize tool entries to canonical form — it only force-adds `/tools/github/get-token.ts` for code employees.
- **Why `generate` (T7) passed but `converse-create` fails:** the `generate` route does NOT call `validateProposalFields` (confirmed: grep returns nothing). The `converse-create` route (and `propose-edit`) DO call it strictly (route lines 205-217). So the validation gate is unique to the converse path — generate never had to produce canonical tool shapes.
- **Likely prompt cause:** `CONVERSE_SYSTEM_PROMPT_PRE` (prompts file:331-367) output contract says `{"kind":"proposal","config":{...full archetype configuration...}}` but, unlike `SYSTEM_PROMPT_*` (generate, line 270-271), it does NOT include a concrete `tool_registry` JSON-shape example (`"tool_registry": { "tools": ["/tools/platform/submit-output.ts"] }`). The catalog section (`formatToolCatalog`) lists `### /tools/...` headers but the converse output-contract block never pins the `tools: string[]` array-of-canonical-paths shape, so the model guesses (bare strings / objects).

**Reproducibility:** 2/2 attempts failed identically (not transient). The `archetype_generation_calls` trace recorded `call_type=propose_edit, status=success` because the route records success at line 190 BEFORE `validateProposalFields` runs — the trace is misleading for this failure mode (validation rejections leave a `success` trace row and never hit the catch that would write `status=failed`).

### Suggested fix direction (for the orchestrator — NOT implemented here)
Either (a) add a concrete `tool_registry` shape example + "tools MUST be full `/tools/{service}/{tool}.ts` strings, never objects" rule to `CONVERSE_SYSTEM_PROMPT_PRE`, and/or (b) add tool-path normalization to `postProcess()` (map bare `service/tool` and `{path|name}` objects → canonical `/tools/service/tool.ts`) so both generate and converse paths self-heal before validation. Option (b) is more robust since it also protects `propose-edit`.

### Evidence files
- `.sisyphus/evidence/task-11-clarify-flow.png` — chat question step (Scenario A)
- `.sisyphus/evidence/task-11-direct-no-chat.png` — clear prompt, no question asked (Scenario B); shows friendly-error bubble (the PROPOSAL_INVALID surfacing)
- `.sisyphus/evidence/task-11-draft.txt` — psql archetypes (confirms NO new draft created — proves the blocker)

### Gotchas confirmed
- `source .env` still breaks zsh (escaped newline) — extract single vars via grep.
- `python3` unavailable (asdf shim, no pin) — use `jq`/psql for assertions.
- CDP-to-existing-Chrome requires Chrome launched with `--remote-debugging-port=9222`; a normally-opened Chrome has no CDP port. Playwright MCP's own headed browser is the practical fallback for authenticated dashboard testing.

## T12 — postProcess() tool_registry normalization (2026-06-15)

**Root cause confirmed**: LLM emits bare `service/tool` strings (e.g. `slack/post-message`) or arrays of objects instead of the canonical `/tools/service/tool.ts` format that `validateTools` in `archetype-edit-helpers.ts` checks against.

**Fix location**: `src/gateway/services/archetype-generator.ts`, `postProcess()` function (lines ~386-398 after the `input_schema` block, before `role_name`). This fixes ALL three paths: `generate()`, `refine()`, and `converse()` since they all call `postProcess()`.

**Normalization logic**:
1. Filter out non-string entries (object serialization like `[object Object]`)
2. Leave `/tools/...` prefixed strings unchanged (already canonical)
3. Convert bare 2-segment paths `service/tool` → `/tools/service/tool.ts`
4. Pass through unknown formats unchanged (validateTools will reject them)

**Test approach**: `postProcess()` is not exported, so tests go through `generate()` using the `makeRoutingMock` pattern from `archetype-generator-repair.test.ts`. Added 4 tests in a new `describe('postProcess() — tool_registry normalization (via generate())')` block. The `makeRoutingMock` automatically handles the TimeEstimator LLM call (routes it via system-prompt prefix detection).

**Test count**: 1963 passed (was 1959), 9 skipped, 0 failures.

**Key gotcha**: `generate()` also calls `applyModelAndEstimate()` → `TimeEstimator` (LLM call). Without `catalog` param, only the estimator runs. `makeRoutingMock` routes estimator calls (prefix: `'You estimate manual task duration'`) to return `'5'` — so you only need to provide one JSON string in `genSteps` for `generate()`.

## Task 11 RE-RUN after tool-path fix bb5025d3 (2026-06-15) — TOOL FIX WORKS, NEW BLOCKER: trigger_sources

Re-ran both live E2E scenarios against HEAD `bb5025d3` ("normalize bare tool paths in postProcess before validation"). Real LLM, no mocks. Gateway stable (PID 38571, tsx-watch reloaded). Playwright MCP headed authenticated browser (CDP-to-existing-Chrome still unavailable — user's Chrome not launched with --remote-debugging-port=9222; MCP browser is the equivalent fallback).

### The tool-path fix (bb5025d3) WORKS — confirmed
- The fix added tool-path normalization to `postProcess()` (archetype-generator.ts ~line 387): filters non-string entries and maps bare `service/tool` → `/tools/service/tool.ts`. Applies to generate/refine/converse.
- BOTH scenarios' 422 bodies now contain ZERO tool errors (previously: `slack/read-channels`, `slack/post-message`, `platform/submit-output`, `[object Object]`). The `[object Object]` and bare-path rejections are GONE.

### NEW (residual) BLOCKER — trigger_sources still 422s; draft still never created
Both scenarios still return HTTP 422 `PROPOSAL_INVALID`, now with a SINGLE error:
`{"field":"trigger_sources","reason":"The proposed trigger configuration is invalid: Invalid input"}`
DB confirms NO new draft archetype (newest = daily-motivation 2026-06-14 04:08, pre-test). So the clarify-then-act flow STILL cannot complete a save.

### Root cause (definitively isolated via isolated Zod repro + explore agent bg_10577a9d)
There is a THREE-WAY trigger_sources shape discrepancy:
- **Strict validator** `TriggerSourceSchema` (z.union) — IDENTICAL copies in `src/gateway/lib/archetype-edit-helpers.ts:7` AND `src/gateway/routes/admin-archetypes.ts:28`. Accepts ONLY: `{type:'manual'}` | `{type:'scheduled',cron:string,timezone?}` | `{type:'webhook',event_type?}`.
- **LLM generate prompt** (prompts file:291-294) tells the model: manual | scheduled(+cron,+timezone) | webhook(+event_type). MATCHES the validator.
- **Seed/DB canonical data** (prisma/seed.ts) uses DIVERGENT shapes the validator REJECTS: `{type:'cron', expression:'0 8 * * 1-5', timezone}` (×4) and `{type:'cron_and_webhook', cron_expression:'*/5 * * * *'}` (×2). Types `'cron'`/`'cron_and_webhook'` and field names `expression`/`cron_expression` exist NOWHERE in either Zod schema. → **Seed data is the odd one out.**
- **CONVERSE prompt** (`CONVERSE_SYSTEM_PROMPT_PRE`, prompts file:331-367) shows the LLM NO trigger_sources shape example at all (REFINE prompt also shows none). So the converse LLM guesses the shape — and guesses one outside the strict union.

Isolated Zod repro (ran `npx tsx` with the exact union) PROVED the exact accept/reject set:
- `{type:'scheduled',cron:'0 9 * * *',timezone:'America/New_York'}` → OK
- `{type:'scheduled',cron:'0 9 * * *'}` → OK
- `{type:'manual'}` → OK
- `{type:'cron',expression:'0 9 * * *',timezone}` → FAIL "Invalid input"  ← matches the 422 exactly
- `{type:'scheduled',schedule:'0 9 * * *'}` (missing required `cron`) → FAIL "Invalid input"
- extra fields on a valid shape → OK (objects are non-strict; extras don't fail)

The error string in the 422 (`Invalid input`, empty path) is the union-discriminator failure message — exactly what the repro produces for the two FAIL cases. So the converse LLM emitted either `type:'cron'`/`expression` OR a `scheduled` object missing the required `cron` field.

Note: when I called the `generate` endpoint with the SAME "daily at 9am" description, the LLM produced a VALID `{type:'scheduled',cron:'0 9 * * *',timezone:'America/New_York'}` — but `generate` does NOT validate trigger_sources (only converse-create/propose-edit do), so generate never trips. This is the SAME generate-vs-converse validation asymmetry as the tool-path bug: the converse path is the only one that strictly validates, and the LLM's converse output isn't guaranteed to match the strict union (the converse prompt never pins the shape).

### Trace gap discovered
The `archetype_generation_calls` row for the converse `propose_edit` call has an EMPTY `response` column (len 1) — converse-create's `generationCallRepo.record()` (route line 190) only stores `model_actual`/`status`, not the response body. So the exact failing trigger_sources shape can't be recovered from the DB trace. (Improvement opportunity: persist the response on converse-create like generate does.)

### Suggested fix direction (NOT implemented here — analysis only)
Most robust = combination:
1. **Normalize trigger_sources in `postProcess()`** (mirror the tool-path fix): map `{type:'cron',expression}` → `{type:'scheduled',cron}`, `{type:'cron_and_webhook',cron_expression}` → an accepted shape, and coerce a `scheduled` object missing `cron` to a sensible default or `manual`. This self-heals all three paths AND the seed-echo case.
2. **Add a trigger_sources shape example to `CONVERSE_SYSTEM_PROMPT_PRE`** (and REFINE) — the same concrete example the generate prompt has — so the LLM stops guessing.
3. (Optional) Reconcile seed data + both Zod schemas to ONE canonical shape so DB-echo never fails.

### Evidence files (overwritten this run)
- `.sisyphus/evidence/task-11-clarify-flow.png` — Scenario A clarify question step (question DID appear: "Which specific Slack channels would you like summarized?...")
- `.sisyphus/evidence/task-11-direct-no-chat.png` — Scenario B clear prompt, NO question asked, shows the friendly-error bubble (the trigger_sources PROPOSAL_INVALID surfacing)
- `.sisyphus/evidence/task-11-draft.txt` — psql archetypes proving NO new draft created (blocker persists)

### Net status of T11
- ✅ URL convention, clarify escalation UI, conditional chat (clear prompt asks no question), friendly errors, Start-over — ALL still work.
- ✅ Tool-path PROPOSAL_INVALID (the bb5025d3 target) — FIXED.
- ❌ trigger_sources PROPOSAL_INVALID — NEW residual blocker; clarify-then-act still cannot save a draft. Same generate-vs-converse strict-validation asymmetry; converse prompt lacks a trigger_sources shape example; seed/validator shapes diverge.

## T13 — trigger_sources normalization in postProcess() (2026-06-15)

### Fix location

`src/gateway/services/archetype-generator.ts`, `postProcess()` function, inserted AFTER the `tool_registry` normalization block (line ~400) and BEFORE the `role_name` normalization.

### Normalization logic (5 branches)

1. `type === 'cron'` or `type === 'cron_and_webhook'` → `{type:'scheduled', cron: expression ?? cron_expression ?? cron}` or `{type:'manual'}` if no cron expr found
2. `type === 'scheduled'` but missing `cron` field → `{type:'manual'}` fallback; if `cron` present, reconstruct with optional `timezone`
3. `type !== 'manual' && type !== 'webhook'` (unknown type) → `{type:'manual'}` fallback
4. `type === 'manual'` or `type === 'webhook'` → pass through unchanged

### Why this fixes the blocker

`TriggerSourceSchema` (z.union in `archetype-edit-helpers.ts`) only accepts `manual | scheduled(+cron) | webhook`. The LLM emits `{type:'cron', expression:'...'}` or `{type:'scheduled'}` (missing required `cron`). Both fail the union discriminator with "Invalid input". `postProcess()` now coerces these to valid shapes before `validateProposalFields` sees them.

### Test count

1968 passed (was 1963 → +5 new tests), 9 skipped, 0 failures.

### New tests added

`tests/unit/gateway/services/archetype-generator-repair.test.ts` — new `describe('postProcess() — trigger_sources normalization (via generate())')` block with 5 tests:
1. `{type:'cron', expression:'0 9 * * 1-5'}` → `{type:'scheduled', cron:'0 9 * * 1-5'}`
2. `{type:'cron_and_webhook', cron_expression:'0 8 * * *'}` → `{type:'scheduled', cron:'0 8 * * *'}`
3. `{type:'scheduled'}` (missing cron) → `{type:'manual'}`
4. `{type:'manual'}` → unchanged
5. `{type:'unknown_type'}` → `{type:'manual'}`

### Gotcha: stale edit artifact

First edit attempt left duplicate code (lines 425-431) due to two sequential edits on the same region. Required a targeted cleanup edit to remove the stale fragment. Always verify the file state after edits to complex regions.

## Task 11 FINAL RE-RUN after BOTH proposal fixes (2026-06-15) — PROPOSALS NOW VALID; new 3rd blocker at SAVE step

Re-ran both live E2E scenarios at HEAD with BOTH fixes committed:
- `bb5025d3` — tool-path normalization in postProcess (bare `slack/post-message` → `/tools/slack/post-message.ts`)
- `9a3c8404` — trigger_sources normalization in postProcess (`cron`/`cron_and_webhook` → `scheduled`; `scheduled`-missing-cron → `manual`; unknown → `manual`)

Gateway stable (PID 58708, tsx-watch reloaded both). Test start 2026-06-14 20:20:09. Playwright MCP headed authenticated browser (CDP-to-existing-Chrome unavailable as before).

### BOTH proposal-validation fixes CONFIRMED WORKING — the wizard now REACHES the edit step
This is the big win vs. the prior two runs (which 422'd at converse-create on tools, then on trigger_sources). Now:
- **Scenario A** (ambiguous "summarize all my Slack channels"): this run the LLM chose to produce a proposal DIRECTLY (no clarifying question — converse prefers acting; LLM non-determinism, and the spec explicitly allows direct proposal as valid). `converse-create` → HTTP 200. Wizard rendered the "Review & Edit" step with non-empty identity ("You are a Slack Channel Summarizer...") + execution_steps with normalized tool paths. `compile-preview` → 200, full AGENTS.md rendered.
- **Scenario B** (clear "weekday 9am #support → #support-digest"): NO clarifying question (correct conditional). Edit step reached directly. Overview shows Trigger = "Scheduled - Weekdays at 9:00 AM" — i.e. a SCHEDULED trigger that the 9a3c8404 fix kept valid (this exact case 422'd last run). Tools normalized.
- Zero tool errors and zero trigger_sources errors in BOTH scenarios' network traffic. Both prior blockers are GONE.

### NEW (3rd) BLOCKER — final POST /archetypes save fails 400 on risk_model.timeout_hours
After reaching Preview AGENTS.md and clicking "Save as Draft", BOTH scenarios fail identically:
`Gateway error 400 ... {"error":"INVALID_REQUEST","issues":[{"expected":"number","code":"invalid_type","path":["risk_model","timeout_hours"],"message":"Invalid input: expected number, received undefined"}]}`
DB confirms NO new draft (newest = daily-motivation 2026-06-14 04:08, pre-test; zero `t11-*` rows). Network sequence proves it: `converse-create` 200 → `compile-preview` 200 → `POST /archetypes` 400.

### Root cause (explore bg_31611f74 + my direct read — file:line confirmed)
A two-step drop-then-require chain, plus a Zod partial-object-default pitfall:
1. **Allowlist drops timeout_hours**: `applyCreateAllowlist()` in `src/gateway/routes/admin-archetype-converse-create.ts` (~line 86-88) sets `risk_model: { approval_required: raw.risk_model.approval_required }` — DROPS `timeout_hours`. (The LLM/baseline always include it: baseline default at converse-create line 56 is `{approval_required:false, timeout_hours:24}`; `GenerateArchetypeResponse.risk_model.timeout_hours:number` is required.)
2. **Client echoes the gap**: `CreateEmployeePage.tsx` handleSaveDraft (~line 146-149) sends `timeout_hours: config.risk_model.timeout_hours` — which is `undefined` because `config` came from the stripped proposal. Captured POST body confirmed: `"risk_model":{"approval_required":false}` (no timeout_hours).
3. **Zod .default() does NOT save it**: POST schema `src/gateway/routes/admin-archetypes.ts:90-95`:
   `risk_model: z.object({ approval_required: z.boolean(), timeout_hours: z.number().positive() }).default({approval_required:false, timeout_hours:2})`.
   The object-level `.default()` fires ONLY when `risk_model` is ENTIRELY ABSENT. When the key is present-but-partial, Zod parses the object and fails on the required `timeout_hours` (no inner field default). Classic Zod gotcha.
- postProcess() does NOT default timeout_hours (only flips approval_required for code employees, line ~459); PostProcessedArchetypeSchema doesn't validate risk_model at all. So no layer fills the gap.

### Cleanest fix (recommended by explore, NOT implemented here)
PRIMARY: in `applyCreateAllowlist()` (admin-archetype-converse-create.ts ~line 87) pass through `timeout_hours` alongside `approval_required`:
`risk_model: raw.risk_model ? { approval_required: raw.risk_model.approval_required, timeout_hours: raw.risk_model.timeout_hours } : undefined`.
DEFENSE-IN-DEPTH (optional): make the inner field tolerant in admin-archetypes.ts:93 → `timeout_hours: z.number().positive().optional().default(2)`. No client change needed (client already reads config.risk_model.timeout_hours correctly). No postProcess change needed.

### Net status of T11
- ✅ URL convention, conditional chat (Scenario B asked no question; Scenario A this run went direct — both valid), friendly errors.
- ✅ Tool-path PROPOSAL_INVALID (bb5025d3) — FIXED, confirmed in both scenarios.
- ✅ trigger_sources PROPOSAL_INVALID (9a3c8404) — FIXED, confirmed (Scenario B scheduled trigger now valid).
- ✅ Wizard now REACHES edit step + Preview AGENTS.md in both scenarios (was impossible before).
- ❌ NEW: final Save (POST /archetypes) 400s on risk_model.timeout_hours — clarify-then-act STILL cannot persist a draft. This is a distinct downstream save-payload bug, not a proposal/clarify bug. Same root pattern as the prior two: a field the converse allowlist strips that a strict validator then requires.

### Evidence files (overwritten this run)
- `.sisyphus/evidence/task-11-clarify-flow.png` — Scenario A; shows the "Generation Failed" save-error (risk_model.timeout_hours) AFTER the proposal+preview succeeded.
- `.sisyphus/evidence/task-11-direct-no-chat.png` — Scenario B edit step with non-empty identity (Support Digest Agent, scheduled trigger) — the success state for B's assertions, captured before the save attempt.
- `.sisyphus/evidence/task-11-draft.txt` — psql proving NO new draft created (save blocker persists).

### Reusable gotcha
Zod `z.object({...required...}).default({...})` only applies the default when the WHOLE object key is missing. A present-but-partial object bypasses the default and fails on the required inner fields. When a client may send a partial object, put `.default()` / `.optional()` on the INNER fields, not (only) the outer object.

## Task 11 PASS (4th re-run, all 4 fixes committed) — 2026-06-15 — BOTH SCENARIOS SAVE A DRAFT END-TO-END ✅

Re-ran both live E2E scenarios at HEAD `d6dc375e` with all four fixes committed:
- bb5025d3 — tool-path normalization (bare → /tools/..)
- 9a3c8404 — trigger_sources normalization (cron/cron_and_webhook → scheduled; etc.)
- d6dc375e — applyCreateAllowlist now passes `timeout_hours: raw.risk_model.timeout_hours ?? 2`

Real LLM, no mocks. Gateway PID 76388. Test start 2026-06-14 20:29:43 local (UTC ~01:29). Playwright MCP headed authenticated browser.

### RESULT: BOTH SCENARIOS PASS — 2 new draft archetypes created
DB confirms two NEW drafts (created_at after test start):
- `3c1331f0-3b36-4e06-be31-e2c711cf12e0` — t11-slack-summarizer-final (draft) — Scenario A
- `ba8f064d-72df-40ad-9c3b-d6443da4d6dd` — t11-support-digest-final (draft) — Scenario B
The d6dc375e timeout_hours fix is PROVEN end-to-end: detail page Settings → "Maximum Duration" = 24 (the timeout_hours that was passed through). Both saves navigated to the employee detail page (`/dashboard/employees/<id>?tenant=...`).

### Scenario B — clean FULL PASS first try
Clear prompt → NO clarifying question (correct conditional) → "Review & Edit" with non-empty identity (Support Digest Agent) + scheduled trigger ("every weekday at 9am", proving 9a3c8404 works) → Preview AGENTS.md → Save as Draft → detail page ba8f064d. converse-create 200, POST /archetypes 200.

### Scenario A — clarify worked; intermittent tsx-prefix tool bug on attempt 1; clean PASS on retry
- Attempt 1: clarify question DID appear ("Which Slack channels would you like to summarize?..."), answered "#general and #announcements daily at 9am → #digests", Send → converse-create 422 PROPOSAL_INVALID. The ONLY errors were tool paths emitted WITH a `tsx ` prefix: `tsx /tools/slack/read-channels.ts`, `tsx /tools/slack/post-message.ts`, `tsx /tools/platform/submit-output.ts`. NOT a regression of the committed fixes — a NEW intermittent gap (see below).
- Retry: same ambiguous prompt → LLM chose a DIRECT proposal this time (no question — valid per spec) → edit step (non-empty identity, tool_registry in bare /tools/.. form so it passed) → Preview → Save as Draft → detail page 3c1331f0. PASS.

### IMPORTANT — newly discovered INTERMITTENT gap: tsx-prefix in tool_registry.tools (NOT yet fixed)
bb5025d3's normalization in postProcess() (archetype-generator.ts:387-400) handles only TWO shapes: already-correct `/tools/..` (passthrough) and bare 2-part `service/tool` → `/tools/service/tool.ts`. It does NOT strip a leading `tsx ` prefix.
- For input `"tsx /tools/slack/read-channels.ts"`: line 392 `startsWith('/tools/')` is false (starts with "tsx "); `split('/')` yields 4 parts (not 2); falls through to `return t` UNCHANGED.
- validateTools() (archetype-edit-helpers.ts:91-93) builds its allowed Set as `ALL_TOOL_DESCRIPTORS.map(d => toolInvocationPath(d).replace(/^tsx /, ''))` → set contains `/tools/slack/read-channels.ts` (tsx stripped). So `tsx /tools/..` is NOT in the set → rejected → 422.
- WHY the LLM does it: the prompt's tool examples + the Available Tools list are rendered via `toolInvocationPath()` which returns `tsx /tools/..` (WITH tsx). The LLM sometimes copies the invocation form verbatim into tool_registry.tools. INTERMITTENT — depends on the LLM run (Scenario B and Scenario A-retry did NOT emit the prefix; Scenario A-attempt-1 did).
- Confirmed by explore bg_2c20ddf8 + my direct read of lines 387-400.

CLEANEST FIX (not implemented — analysis only): in postProcess() tool .map() (archetype-generator.ts ~line 391-392), strip a leading `tsx ` before the `/tools/` check:
```
.map((t) => {
  const normalized = t.replace(/^tsx\s+/, '');
  if (normalized.startsWith('/tools/')) return normalized;
  const parts = normalized.split('/');
  if (parts.length === 2) { const [service, tool] = parts; return `/tools/${service}/${tool}.ts`; }
  return normalized;
})
```
Do NOT change validateTools() — its tsx-strip on the Set is correct; the DB should store bare /tools/.. paths. This is the SAME recurring class as the prior 3 blockers: LLM tool/field-shape variance the normalizer doesn't fully cover, against a strict converse-only validator.

### Success criteria — ALL MET
- [x] Scenario A: reached edit step, draft saved (detail page 3c1331f0). (Attempt 1 hit the intermittent tsx bug; retry passed.)
- [x] Scenario B: no chat question, direct edit step, draft saved (detail page ba8f064d).
- [x] DB: 2 new draft rows created after test start.
- [x] Screenshots updated.

### Recommendation for orchestrator
The clarify-then-act creation wizard now WORKS end-to-end (drafts persist). One residual reliability issue remains: the intermittent tsx-prefix tool-path bug can still 422 a converse-create proposal ~1/3 of runs. Recommend a 4th one-line normalization fix (strip `^tsx\s+`) to make it robust, then a final confirmation run. Until then, the flow is functional but not 100% reliable on the first attempt for some LLM outputs.

### Evidence files (overwritten this run)
- `.sisyphus/evidence/task-11-clarify-flow.png` — Scenario A detail page (t11-slack-summarizer-final saved)
- `.sisyphus/evidence/task-11-direct-no-chat.png` — Scenario B detail page (t11-support-digest-final saved)
- `.sisyphus/evidence/task-11-draft.txt` — psql showing BOTH new draft rows + the t11-* query

## F3 Final QA (2026-06-15)

- All 6 scenarios PASS. Live LLM calls (Scenarios 1,4,5) used deepseek-v4-flash gateway / minimax execution.
- The Playwright MCP browser (not CDP-to-real-Chrome) works fine for localhost dashboard QA — dashboard was already authenticated as Platform Admin/VLRE.
- Clarify vs direct distinction is observable in the UI end-state: ambiguous prompt halts at an ENABLED "Reply…" box with a question bubble; clear prompt passes through a transient "Thinking…" loader straight to "Review & Edit" (no reply ever required).
- Stale task hint: the friendly-error function `friendlyGenerationMessage` does NOT exist in CreateEmployeePage.tsx. Logic was generalized into `use-chat-conversation.ts` (`getProposalErrorMessage` + `PROPOSAL_ERROR_FALLBACK`) during T11. CreateEmployeePage:46 consumes the hook via `converseCreate`. Feature present + unit-tested; only the name is outdated.
- Trace table confirms generate rows status='success', retry_count=0 — JSON-mode + retry fix is healthy.
