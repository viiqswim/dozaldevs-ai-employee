# Learnings

## [2026-06-13] Session Init

- Plan: AI Assistant confirm-understanding step + fix invalid-JSON failure
- Root cause (pre-diagnosed): model emits raw unescaped newlines inside JSON string values → `SyntaxError: Unterminated string in JSON`
- Secondary mode: empty `content` (reasoning-only response from OpenCodeGo endpoint)
- `maxTokens: 6000` in refine() is artificially low
- Test employee: db2974dc-ab37-4034-9ce2-1c7b91e424b5, tenant: 00000000-0000-0000-0000-000000000003

## [T1 — 2026-06-13] DIAGNOSE-REFINE Results

### Confirmed failure modes (ordered by frequency):

**Mode (b) — empty content / reasoning-only** [PRIMARY ~60%]

- `completionTokens = 6000 = maxTokens` but `content = ""`
- OpenCodeGo model exhausts ALL tokens on internal reasoning, zero visible output
- `JSON.parse("")` → `Unexpected end of JSON input`
- Retry path works ~50% of the time

**Mode (c) — truncation mid-string** [SECONDARY ~30%]

- Model starts writing JSON but truncates mid execution_steps string value
- All "Unterminated string" GENERATION_FAILED events are on "line 6" of JSON (= execution_steps)
- Retry path ALSO fails with unterminated string → hard 500 error to user
- Positions 2032–6846 all inside the execution_steps string value
- 5 confirmed GENERATION_FAILED events in today's session log

**Mode (a) — raw newlines in JSON string** [TERTIARY ~10%]

- Model emits literal `\n` bytes inside execution_steps JSON string
- Short column numbers (6, 93) at late positions confirm newline at step boundaries
- Often masked by truncation mode (c)

### Key facts for fix:

- `maxTokens: 6000` in `refine()` is the single biggest lever — raising to 16000 fixes mode (b) and reduces (c)
- `execution_steps` is the problematic field: multi-line markdown with newlines
- Full refine JSON output is ~7318 chars = ~1829 tokens minimum content
- 4003 prompt tokens + 1829 content = 5832 needed, vs 6000 max → essentially no budget for reasoning
- The retry nudge works when the model has a clean second chance with no reasoning budget exhausted
- `jsonrepair` library would handle truncation and newline cases in post-processing

## T6: interpret-request endpoint (2026-06-13)

### Pattern: plain-text LLM calls avoid JSON parse failures

- `interpretRequest()` in `ArchetypeGenerator` calls `this.callLLMFn` directly — no `callLLMWithJsonRetry`, no `JSON.parse`
- Returns `result.content.trim()` — immune to the JSON parse bug that affects `refine()`
- Use `taskType: 'review'`, `temperature: 0.3`, `maxTokens: 500` for short prose restatements

### Route pattern for interpret-request

- Auth: `requireTenantRole(TenantRole.MEMBER)` — read-only intent so lower role than propose-edit (which uses ADMIN)
- No Composio or tool catalog needed — endpoint is read-only, persists nothing
- `mapArchetypeRowToConfig()` was duplicated from propose-edit (same pattern, no shared helper exists yet)
- Response: `sendSuccess(res, 200, { understanding: result })` — `understanding` is plain prose string

### Evidence

- Curl output: `{"understanding":"The user wants the AI to always include a simple summary of what was changed, along with two diagrams that show how the system looked before and after the changes."}`
- Archetype `updated_at` remained `2026-06-03 03:47:31.042` — confirmed no mutation

### .sisyphus/evidence is gitignored

- Save curl evidence to notepad or a non-ignored path next time

## T2: Harden refine LLM call (2026-06-13)

### Changes made

**`src/lib/call-llm.ts`**:

- Added `responseFormat?: { type: 'json_object' }` field to `CallLLMOptions` interface — opt-in, undefined by default so no existing callers are affected
- Added `response_format` to request body assembly (spread when set, omitted when undefined)
- Added empty-content guard after reading `data.choices[0]?.message.content`: when `content === ''` but `choices[0]` exists (i.e. the API call succeeded but returned no text), throws `Error('LLM returned empty content — possible reasoning-only response')` — this makes `callLLMWithJsonRetry` catch it and trigger the retry path instead of falling through to `JSON.parse('')`

**`src/gateway/services/archetype-generator.ts`**:

- Extended `callLLMWithJsonRetry` `options` type to include `responseFormat?: { type: 'json_object' }`; threads through to `this.callLLMFn`
- Changed `refine()` `llmOptions.maxTokens` from `6000` to `16000` — primary fix for mode (b): 6000 was being fully consumed by reasoning tokens before content was emitted
- Added `responseFormat: { type: 'json_object' }` to `refine()` options — may or may not be honored by OpenCodeGo; forces JSON-mode on providers that support it

### Design decisions

- `responseFormat` is purely opt-in — `refine()` uses it, `generate()` does not (left unchanged as it wasn't failing)
- Empty-content guard throws rather than returning empty — ensures `callLLMWithJsonRetry` retry loop fires instead of silent `JSON.parse('')` crash
- `generate()` still uses `maxTokens: 6000` — T1 diagnosis only confirmed exhaustion in `refine()` which takes the full previous config as input; generate's prompts are shorter

### What this fixes

- Mode (b) [60%]: `maxTokens: 16000` gives model room to output ~1829 content tokens even after using reasoning budget; previously 6000 was entirely consumed
- Mode (b) retry path: empty-content guard triggers clean retry instead of `JSON.parse('')` crash; the retry gets a fresh budget
- Modes (c) [30%] and (a) [10%]: not addressed in T2 — T3 (robust JSON repair with `jsonrepair`) handles those

## [T3 — 2026-06-13] repairJsonStrings Implementation

### What was built

- `export function repairJsonStrings(raw: string): string` in `archetype-generator.ts`
- State machine walks char-by-char; tracks `inString` boolean
- Handles escape sequences: when `ch === '\\'`, copies both `\\` and next char and skips `i += 2`
- Replaces `\n` (code 10), `\r` (code 13), `\t` (code 9) with `\\n`, `\\r`, `\\t` inside strings
- Returns original string unchanged if empty (`raw.length === 0`)

### Wiring in callLLMWithJsonRetry

- **Path 1 (before LLM retry)**: after first JSON.parse fails, if raw.length > 0 → attempt repairJsonStrings → JSON.parse(repaired). If success, return repaired (no LLM call). If fails, fall through.
- **Path 2 (after LLM retry)**: retryRaw parsed inline; if fails, attempt repairJsonStrings on retryRaw → JSON.parse(repairedRetry). Final JSON.parse throws propagate as GENERATION_FAILED.
- Empty-string guard: `if (raw.length > 0)` before repair — mode (b) (empty content) cannot be fixed by repair and should go straight to retry

### Key design decisions

- No third-party deps (jsonrepair, json5) — pure state machine
- Export at module level so T5 unit tests can import directly
- Empty catch on repair failure = intentional fallthrough (not swallowed error)
- Final throw preserved — genuinely invalid output still surfaces GENERATION_FAILED

### Build result

- `pnpm build` clean, 0 errors
- Pre-commit lint passed (eslint --max-warnings 0)
- Commit: aa1d53a8

## [T7 — 2026-06-13] Confirm-understanding flow in AssistantTab

### Changes made

**`dashboard/src/panels/employees/AssistantTab.tsx`**:

- Added `'restatement'` to `MessageKind` union type
- Added `understanding?: string` and `pendingRequestText?: string` to `ChatMessage` interface (stores interpret result and original request text for Confirm handler)
- Added `pendingRestatementId: string | null` state (mirrors `pendingProposalId` pattern)
- Extended `useUnsavedChangesGuard` to cover `hasPendingRestatement || isLoading` — guards navigation when a restatement awaits Confirm
- Added `runInterpret(text)` helper: calls `interpretRequest`, appends a `restatement` message, sets `pendingRestatementId`
- Updated `handleSubmit`: if `pendingRestatementId` is set (correction path), marks old restatement as acted, clears it, then re-runs `runInterpret` with new text. Otherwise, appends user message and calls `runInterpret`.
- Added `handleConfirm(msgId, requestText)`: marks restatement as acted, clears `pendingRestatementId`, calls `proposeEdit`, then follows same success/failure path as old `handleSubmit`
- Render: `restatement` kind renders as an assistant bubble with card styling (`rounded-2xl rounded-tl-sm border bg-card`), shows `understanding` text, a note ("Here's what I understood — click Confirm to proceed, or type a correction below."), and a Confirm button disabled when `proposalActed === true || isLoading`
- `handleRefine`, `handleApprove`, `handleDeny`, diff card rendering — all unchanged

### Key patterns

- `proposalActed: true` is reused for restatements (dim/disable acted-on messages) — no new field needed
- `runInterpret` is a private helper, not exported — keeps the API surface minimal
- `getProposalErrorMessage` is applied to `interpretRequest` failures too (same friendly copy)
- Correction path: re-interpret is triggered by the user simply sending a new message (no special button); old restatement is auto-dismissed

### Build result

- `pnpm build` and `pnpm dashboard:build` both clean, 0 errors
- ESLint passed (pre-commit hook)
- Commit: b1a0c024

## [T5 — 2026-06-13] Unit tests for repair / empty-content / interpret

### File

- `tests/unit/gateway/services/archetype-generator-repair.test.ts` — 13 tests, all green

### Test strategy that worked

- `repairJsonStrings` is exported → tested directly as a pure function (7 cases: newline/tab/CR repair, already-valid passthrough, escaped-quote handling, structural-break still-throws, empty-string passthrough)
- `callLLMWithJsonRetry` is PRIVATE → exercised through public `refine()` (cannot test directly)
- `interpretRequest` is public → tested directly

### CRITICAL gotcha — refine() fires TWO LLM calls

- `refine()` → `applyModelAndEstimate()` → `new TimeEstimator(this.callLLMFn).estimate()` makes a SECOND `callLLMFn` call
- A naive `callLLMFn` mock that returns a fixed sequence by call-count breaks because the estimator call is interleaved
- Solution: routing mock keyed on `messages[0].content` system-prompt prefix. TimeEstimator's prompt starts with `'You estimate manual task duration'` → intercept and return `'5'`, do NOT count it as a generation attempt. Only generation/refine calls increment `generationCalls`.

### CRITICAL gotcha — empty content has TWO distinct behaviors

- The empty-content GUARD lives in `call-llm.ts` (T2), NOT in `callLLMWithJsonRetry`. So in unit tests of the generator you simulate it two ways:
  1. Mock RETURNS empty string `''` → first `JSON.parse('')` fails INSIDE the try/catch → repair skipped (raw.length 0) → nudged retry fires → if retry returns valid JSON, success. `generationCalls === 2`.
  2. Mock THROWS `Error('LLM returned empty content...')` → the FIRST generation call sits OUTSIDE `callLLMWithJsonRetry`'s try/catch (it's `const result = await this.callLLMFn(...)` before the try) → throw propagates straight to `refine()`'s catch → `GENERATION_FAILED`, NO retry. `generationCalls === 1`.
- Both behaviors are correct and both are now locked in. Do not "simplify" them to one test — they assert opposite retry counts on purpose.

### Repair-path assertion

- Mock returns JSON-with-raw-newlines on call 1 → `callLLMWithJsonRetry` repairs locally → `generationCalls === 1` (NO second LLM call). This is the key win: repair avoids a token-spending retry.
- Genuinely broken JSON (missing brace) on BOTH calls → `rejects.toThrow('GENERATION_FAILED')`, `generationCalls === 2`.

### interpretRequest assertion

- Returns `result.content.trim()` — assert trimmed output
- Verify NO `JSON.parse`: feed it non-JSON text (`'... {not valid json'`) and assert it returns trimmed without throwing. If the method ever regressed to parsing, this test would throw.

### Test-writing notes

- Mock result shape MUST be the full `CallLLMResult`: `{ content, model, promptTokens, completionTokens, estimatedCostUsd, latencyMs }` — TimeEstimator/refine read several of these.
- Source-string raw newlines: write `'...identity":"Line one\nLine two"...'` with REAL `\n` bytes (a literal newline in the source string literal). Do NOT escape to `\\n` or the invalid-until-repaired precondition vanishes and the test silently becomes a no-op.
- Cast injected mock as `fn as unknown as typeof callLLM` to satisfy the constructor signature.
- Comment-hook minimalism: only 3 comment blocks kept (routing-mock rationale, real-newline warning, empty-content dual-behavior) — all priority-3 necessary; section dividers removed.

### Result

- `pnpm test:unit -- --run`: 163 files, 1891 passed, 9 skipped, 0 failures (was 1878 → +13 new)
- ESLint `--max-warnings 0`: clean
