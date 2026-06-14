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

### Key insight: _persistCall placement

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
