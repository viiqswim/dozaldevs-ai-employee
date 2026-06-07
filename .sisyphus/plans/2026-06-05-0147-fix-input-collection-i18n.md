# Fix Input Collection — Multilingual Date Normalization

## TL;DR

> **Quick Summary**: Fix the Slack input collector so ALL single-input replies go through LLM extraction (same as multi-input already does), instead of storing raw text. This allows "Junio 5" (Spanish) to be normalized to "2026-06-05" before task creation. Also fixes a race condition in the pending input Map and adds a general multilingual instruction to the extraction prompt.
>
> **Deliverables**:
>
> - Single-input path always routes through `extractInputsFromText` (no more raw text bypass)
> - `PendingInputContext` interface includes `type` and `options` fields
> - General multilingual instruction in extraction system prompt
> - Race condition fix: Map entry set before Slack message posted
> - Tests for all changes
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (interface fix) → Task 4 (single-input logic) → Task 5 (tests)

---

## Context

### Original Request

Olivia sent "Junio 5" (Spanish for June 5th) as a reply to the cleaning-schedule bot's input prompt asking for a Checkout Date. The bot did not respond — the message was silently ignored. Olivia had to re-type "2025-06-05" for the task to trigger. The user wants the bot to accept dates in any language and normalize them automatically.

### Interview Summary

**Key Discussions**:

- DB evidence confirmed task `4dd074eb` was created with `date: "2025-06-05"` (from the second message), not "Junio 5"
- The cleaning-schedule archetype has exactly 1 required input: `date` (type: `date`)
- The single-input code path at `slack-trigger-handler.ts:323-325` assigns raw text directly — no LLM extraction
- The `PendingInputContext` TypeScript interface strips `type` and `options` fields that are available in the source (`handlers.ts` PendingInputCollection)
- Gateway logs for the 06:30-06:33 UTC timeframe were missing — either gateway restart or race condition dropped the "Junio 5" message

**Research Findings**:

- `handlers.ts` `PendingInputCollection` already includes `type?: string` and `options?: string[]` (lines 67-72)
- The `.map()` at lines 1591-1597 already preserves `type` and `options` from `input_schema`
- `extractInputsFromText` already accepts `type` and `options` in its `fields` parameter
- The multi-input path is ALSO affected — even with 2+ inputs, `pending.requiredInputs` goes through Inngest events typed as `PendingInputContext`, which strips `type`/`options`. Fixing the interface benefits both paths.
- Inngest serializes the full JS object — `type`/`options` likely exist at runtime despite the TypeScript interface gap, but relying on that is fragile

### Metis Review

**Identified Gaps** (addressed):

- **Fallback behavior for extraction failure**: When `extractInputsFromText` returns `{}` for a single input, fall back to raw text assignment with a warning log. This prevents task creation with an empty payload.
- **Always use LLM for single inputs**: Per user direction — no type allowlist, no bypassing. Every single-input reply goes through `extractInputsFromText`, same treatment as multi-input. The LLM adapts to whatever the human writes.
- **General multilingual instruction**: Per user direction — instead of adding language-specific examples (Spanish dates, etc.), add a single general instruction telling the LLM that users may communicate in any language. No enumeration of specific languages.
- **`select` silent-drop bug**: Adjacent issue where LLM returns invalid option → silently dropped → empty result. Explicitly excluded from this plan.
- **Ambiguous year resolution**: "Junio 5" in June 2026 → "2026-06-05" (past date). Current prompt says "use current year." This matches existing English behavior — no change needed.

---

## Work Objectives

### Core Objective

Make the Slack input collector always use LLM extraction for ALL single-input replies (same as multi-input already does), so the LLM adapts whatever the human writes to the employee's required input format — regardless of language, phrasing, or formatting.

### Concrete Deliverables

- Modified `src/inngest/slack-trigger-handler.ts` — interface fix + single-input logic change
- Modified `src/lib/extract-inputs.ts` — general multilingual instruction in system prompt
- Modified `src/gateway/slack/handlers.ts` — race condition fix (reorder Map set vs postMessage)
- New/extended test cases in `tests/inngest/slack-trigger-handler.test.ts` and `tests/lib/extract-inputs.test.ts`

### Definition of Done

- [ ] "Junio 5" sent as a Slack reply triggers task with `date: "2026-06-05"` in DB
- [ ] ALL single-input replies go through LLM extraction (no raw text bypass)
- [ ] `pendingInputCollections.set()` appears before `chat.postMessage()` in source
- [ ] All existing + new tests pass: `pnpm test -- --run`

### Must Have

- LLM extraction for ALL single-input replies (no type-based bypass)
- `PendingInputContext.requiredInputs` includes `type` and `options`
- General multilingual instruction in extraction prompt ("The user may write in any language")
- Race condition fix: Map entry set before Slack message posted
- Fallback to raw text if LLM extraction returns `{}` (with warning log)

### Must NOT Have (Guardrails)

- Do NOT add DB persistence for `pendingInputCollections` in-memory Map
- Do NOT fix the `select` silent-drop behavior (LLM returns invalid option → `{}`) — separate bug
- Do NOT refactor the structure of `createSlackInputCollectorFunction` — surgical changes only
- Do NOT add language-specific examples to the prompt (no Spanish examples, no enumerated languages — keep the instruction general)
- Do NOT add TypeScript-level date validation/post-processing — trust the LLM normalization
- Do NOT add comprehensive test coverage for the entire collector — exactly the specified new test cases

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (Tests-after — extend existing test files)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend logic**: Use Bash (Vitest) — Run tests, assert pass counts
- **Code structure**: Use Bash (grep) — Verify source ordering and patterns

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Fix PendingInputContext interface [quick]
├── Task 2: Add general multilingual instruction to extraction prompt [quick]
├── Task 3: Fix race condition — reorder Map set vs postMessage [quick]

Wave 2 (After Wave 1 — depends on interface fix):
├── Task 4: Change single-input path to always use LLM extraction [quick]
├── Task 5: Add tests for all changes [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — trigger cleaning-schedule with "Junio 5" (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 5 → F1-F4 → user okay
Parallel Speedup: Wave 1 has 3 independent tasks
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 4, 5   | 1    |
| 2    | —          | 5      | 1    |
| 3    | —          | 5      | 1    |
| 4    | 1          | 5      | 2    |
| 5    | 1, 2, 3, 4 | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 2 tasks — T4 → `quick`, T5 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix `PendingInputContext` interface to include `type` and `options`

  **What to do**:
  - In `src/inngest/slack-trigger-handler.ts`, update the `PendingInputContext` interface (line 21) from:
    ```typescript
    requiredInputs: Array<{ key: string; label: string; description?: string }>;
    ```
    to:
    ```typescript
    requiredInputs: Array<{
      key: string;
      label: string;
      description?: string;
      type?: string;
      options?: string[];
    }>;
    ```
  - This matches the already-correct `PendingInputCollection` type in `src/gateway/slack/handlers.ts` (lines 67-72) which already carries these fields through Inngest events
  - Run `lsp_find_references` on `PendingInputContext` first to confirm no other consumers are affected

  **Must NOT do**:
  - Do not change the `PendingInputCollection` type in `handlers.ts` — it already has `type` and `options`
  - Do not rename any fields or change the structure beyond adding `type` and `options`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line interface change in one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/slack-trigger-handler.ts:14-23` — Current `PendingInputContext` interface definition (missing `type` and `options`)
  - `src/gateway/slack/handlers.ts:60-75` — `PendingInputCollection` interface (already has `type` and `options` — this is the target to match)
  - `src/gateway/slack/handlers.ts:1591-1597` — `.map()` that already preserves `type` and `options` from `input_schema` when building `requiredInputs`

  **Acceptance Criteria**:

  ```
  Scenario: Interface includes type and options
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A5 "requiredInputs:" src/inngest/slack-trigger-handler.ts | head -3
      2. Assert output contains "type?: string" and "options?: string[]"
    Expected Result: Both fields present in the interface definition
    Evidence: .sisyphus/evidence/task-1-interface-check.txt

  Scenario: No TypeScript errors introduced
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/slack-trigger-handler.test.ts 2>&1 | tail -5
      2. Assert: 0 failures
    Expected Result: All existing tests still pass
    Evidence: .sisyphus/evidence/task-1-tests-pass.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3, 4)
  - Message: `fix(input-collector): always use LLM extraction for single inputs`
  - Files: `src/inngest/slack-trigger-handler.ts`

- [x] 2. Add general multilingual instruction to extraction prompt

  **What to do**:
  - In `src/lib/extract-inputs.ts`, update the system prompt (lines 28-35) to add a general multilingual instruction
  - Add this sentence to the system prompt (before the `<user_message>` tags instruction):
    ```
    'The user may write in any language. Extract and normalize values regardless of the language used. '
    ```
  - Do NOT add language-specific examples. Do NOT enumerate languages. The instruction is general — the LLM handles the rest.
  - The existing English date examples ("June 10th", "next Monday", etc.) stay as-is — they illustrate the concept of natural-language dates, not the language to expect

  **Must NOT do**:
  - Do not add language-specific examples (no "Junio 5", no "5 de junio" — keep it general)
  - Do not enumerate languages in the prompt
  - Do not add TypeScript-level date validation or post-processing
  - Do not restructure the existing prompt — just append the one new instruction

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single sentence addition to one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/extract-inputs.ts:28-35` — Current system prompt (the string to add the multilingual instruction to)

  **Acceptance Criteria**:

  ```
  Scenario: General multilingual instruction present in prompt
    Tool: Bash (grep)
    Steps:
      1. Run: grep "any language" src/lib/extract-inputs.ts
      2. Assert output contains "any language"
    Expected Result: General multilingual instruction visible in system prompt
    Evidence: .sisyphus/evidence/task-2-multilingual-instruction.txt

  Scenario: No language-specific examples added
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "junio\|juin\|Juni\|junho" src/lib/extract-inputs.ts
      2. Assert: NO matches (exit code 1)
    Expected Result: No language-specific date examples were added
    Evidence: .sisyphus/evidence/task-2-no-language-specific.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3, 4)
  - Message: `fix(input-collector): always use LLM extraction for single inputs`
  - Files: `src/lib/extract-inputs.ts`

- [x] 3. Fix race condition — reorder Map set vs postMessage

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, move the `pendingInputCollections.set()` call (currently at line 1734) to BEFORE the `client.chat.postMessage()` call (currently at line 1717)
  - The challenge: when `ctx.threadTs` is null, the pending key comes from `inputMsgResult.ts` (the return value of `postMessage`), so we can't set the Map entry before posting in that case
  - Solution: Only reorder when `ctx.threadTs` is available (which is always the case for @mention-triggered flows — the @mention creates the thread). When `ctx.threadTs` is null (edge case), keep the current order.
  - Specifically:
    1. Before the `chat.postMessage` call, add: `if (ctx.threadTs) { pendingInputCollections.set(ctx.threadTs, { ... }); }`
    2. After `chat.postMessage`, only set the Map for the fallback case: `if (!ctx.threadTs) { const pendingKey = inputMsgResult.ts; pendingInputCollections.set(pendingKey, { ... }); }`
  - Extract the pending data object to a const to avoid duplication

  **Must NOT do**:
  - Do not add DB persistence for `pendingInputCollections`
  - Do not restructure the entire TRIGGER_CONFIRM handler
  - Do not change the behavior of the Map (keys, values, deletion logic)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small reorder of existing code in one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:1717-1743` — Current code: `chat.postMessage()` at 1717, then `pendingInputCollections.set()` at 1734. The race window is between these two lines.
  - `src/gateway/slack/handlers.ts:1732` — `const pendingKey = ctx.threadTs ?? (inputMsgResult.ts as string | undefined);` — shows the two key sources
  - `src/gateway/slack/handlers.ts:76` — `const pendingInputCollections = new Map<string, PendingInputCollection>();` — the Map declaration

  **Acceptance Criteria**:

  ```
  Scenario: Map entry set before postMessage when threadTs available
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "pendingInputCollections.set\|chat.postMessage" src/gateway/slack/handlers.ts
      2. Find the first occurrence of pendingInputCollections.set in the TRIGGER_CONFIRM block
      3. Assert its line number is LESS than the chat.postMessage line number
    Expected Result: set() appears before postMessage() in the threadTs-available path
    Evidence: .sisyphus/evidence/task-3-race-condition-order.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/ 2>&1 | tail -10
      2. Assert: 0 failures
    Expected Result: No regressions in handler tests
    Evidence: .sisyphus/evidence/task-3-tests-pass.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)
  - Message: `fix(input-collector): always use LLM extraction for single inputs`
  - Files: `src/gateway/slack/handlers.ts`

- [x] 4. Change single-input path to always use LLM extraction

  **What to do**:
  - In `src/inngest/slack-trigger-handler.ts`, replace the single-input bypass at lines 323-325:
    ```typescript
    if (pending.requiredInputs.length === 1) {
      // Single input — assign directly, no LLM needed
      collectedInputs[pending.requiredInputs[0].key] = text;
    }
    ```
    with LLM extraction (same approach as multi-input):
    ```typescript
    if (pending.requiredInputs.length === 1) {
      const input = pending.requiredInputs[0];
      const extracted = await extractInputsFromText(text, [input], callLLM);
      if (extracted[input.key]) {
        collectedInputs[input.key] = extracted[input.key];
      } else {
        // LLM extraction failed — fall back to raw text with warning
        log.warn(
          { key: input.key, type: input.type, text },
          'LLM extraction returned empty for single input — falling back to raw text',
        );
        collectedInputs[input.key] = text;
      }
    }
    ```
  - Key design decisions:
    - **Always use LLM** — no type check, no bypass. The LLM adapts whatever the user wrote to the employee's required input format. This is the same treatment multi-input already gets.
    - **Fallback to raw text** when `extractInputsFromText` returns `{}` — prevents task creation with empty payload
    - **Warning log** on fallback — enables debugging without failing the flow
  - NOTE: `extractInputsFromText` is already imported at line 12. `callLLM` is already imported at line 11. `log` is already defined at line 25. No new imports needed.

  **Must NOT do**:
  - Do not change the multi-input path (lines 326-342) — it already works correctly once the interface fix (Task 1) is done
  - Do not add type-based conditions (no `if type === 'date'` etc.) — always use LLM extraction
  - Do not refactor the overall function structure
  - Do not add TypeScript-level date validation after LLM extraction

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small logic change in one function, all pieces already imported
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5 if Task 1 is done, but safer to run before Task 5)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (needs `type` in interface)

  **References**:

  **Pattern References**:
  - `src/inngest/slack-trigger-handler.ts:321-343` — Current single-input bypass and multi-input extraction logic (the code to replace)
  - `src/inngest/slack-trigger-handler.ts:11-12` — `callLLM` and `extractInputsFromText` imports (already present)
  - `src/inngest/slack-trigger-handler.ts:25` — `const log = createLogger('slack-trigger-handler')` (already available for warning log)

  **API/Type References**:
  - `src/lib/extract-inputs.ts:13-23` — `extractInputsFromText` signature: `(text: string, fields: Array<{key, label, type?, description?, options?}>, callLLMFn) → Promise<Record<string, string>>`
  - Return value: `{}` on failure, `{key: value}` on success

  **Acceptance Criteria**:

  ```
  Scenario: Single input always routed through LLM extraction
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A8 "pending.requiredInputs.length === 1" src/inngest/slack-trigger-handler.ts
      2. Assert output contains "extractInputsFromText" and does NOT contain "type === 'date'" or any type check
    Expected Result: The single-input path unconditionally calls extractInputsFromText (no type-based branching)
    Evidence: .sisyphus/evidence/task-4-always-llm-extraction.txt

  Scenario: Fallback to raw text on extraction failure
    Tool: Bash (grep)
    Steps:
      1. Run: grep "falling back to raw text" src/inngest/slack-trigger-handler.ts
      2. Assert output contains the warning log message
    Expected Result: Fallback with warning log exists for extraction failure
    Evidence: .sisyphus/evidence/task-4-fallback-exists.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 3)
  - Message: `fix(input-collector): always use LLM extraction for single inputs`
  - Files: `src/inngest/slack-trigger-handler.ts`

- [x] 5. Add tests for all changes

  **What to do**:
  - **In `tests/inngest/slack-trigger-handler.test.ts`**, add 3 new test cases inside a new `describe('createSlackInputCollectorFunction', ...)` block (the current file only tests `createSlackTriggerHandlerFunction`):
    1. **Single-input uses LLM extraction (happy path)**: Mock `extractInputsFromText` to return `{ date: '2026-06-05' }`. Fire the collector with `pending.requiredInputs = [{ key: 'date', label: 'Checkout Date', type: 'date' }]` and `text = 'Junio 5'`. Assert: `extractInputsFromText` was called, and the task creation fetch body contains `inputs.date === '2026-06-05'` (not raw "Junio 5").
    2. **Single-input text field also uses LLM extraction**: Mock `extractInputsFromText` to return `{ prompt: 'do the thing' }`. Fire the collector with `pending.requiredInputs = [{ key: 'prompt', label: 'Prompt', type: 'text' }]` and `text = 'do the thing'`. Assert: `extractInputsFromText` IS called (no bypass for text type). Task creation fetch body contains `inputs.prompt === 'do the thing'`.
    3. **Extraction failure falls back to raw text**: Mock `extractInputsFromText` to return `{}`. Fire with a date input and `text = 'Junio 5'`. Assert: task creation fetch body contains `inputs.date === 'Junio 5'` (raw fallback).

  - **In `tests/lib/extract-inputs.test.ts`**, add 1 new test case: 4. **System prompt includes multilingual instruction**: Mock the LLM, call `extractInputsFromText('Junio 5', [{key: 'date', label: 'Checkout Date', type: 'date'}], mockLLM)`, then assert the system prompt passed to `mockLLM` contains "any language" (verify the general multilingual instruction was added).

  - Follow existing test patterns:
    - `vi.hoisted()` for module mocks
    - `makeCallLLM(content)` helper for LLM mocks in `extract-inputs.test.ts`
    - `step.run` as `vi.fn().mockImplementation(async (_name, fn) => fn())`
  - To test the collector function, you'll need to mock `extractInputsFromText` at the module level (it's imported in `slack-trigger-handler.ts`). Add it to the `vi.hoisted()` block.

  **Must NOT do**:
  - Do not add comprehensive test coverage for the entire collector — exactly the 4 specified test cases
  - Do not restructure existing tests
  - Do not add integration tests that require a running Slack instance

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding specific test cases following established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4 (all implementation must be done first)

  **References**:

  **Pattern References**:
  - `tests/inngest/slack-trigger-handler.test.ts:1-174` — Existing test file with mock patterns: `vi.hoisted()` at line 8, `makeStep()` at line 53, `makeEvent()` at line 60, `invokeHandler()` at line 75
  - `tests/lib/extract-inputs.test.ts:1-143` — Existing extraction tests with `makeCallLLM()` helper at line 5, date field test at line 27

  **Test References**:
  - `tests/inngest/slack-trigger-handler.test.ts:106-174` — `describe('createSlackTriggerHandlerFunction')` block — the trigger handler tests. The collector function tests should be in a separate `describe('createSlackInputCollectorFunction')` block.
  - `tests/lib/extract-inputs.test.ts:26-90` — Various extraction scenarios showing the mock pattern

  **Acceptance Criteria**:

  ```
  Scenario: All new and existing tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/slack-trigger-handler.test.ts tests/lib/extract-inputs.test.ts 2>&1
      2. Count total tests: grep for "Tests" line
      3. Assert: 0 failures, at least 4 new tests (total should be 7+ for trigger handler, 10+ for extract-inputs)
    Expected Result: All tests pass with zero failures
    Failure Indicators: Any test marked as "FAIL" or non-zero exit code
    Evidence: .sisyphus/evidence/task-5-all-tests.txt

  Scenario: Full test suite passes (no regressions)
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert: 0 failures in the full suite
    Expected Result: Zero test regressions across entire codebase
    Evidence: .sisyphus/evidence/task-5-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(input-collector): add tests for single-input LLM extraction and race condition`
  - Files: `tests/inngest/slack-trigger-handler.test.ts`, `tests/lib/extract-inputs.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Send Telegram notification

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ fix-input-collection-i18n complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After F1-F4
  - **Blocked By**: F1-F4 (all final verification must pass)

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ fix-input-collection-i18n complete — All tasks done. Come back to review results."
      2. Assert: exit code 0
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-6-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for pattern). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real QA — "Junio 5" end-to-end** — `unspecified-high`
      **Prerequisites**: `pnpm dev` running, Docker worker image built, cleaning-schedule archetype active.
  1. @mention Papi Chulo in #ops-cleaning-schedule: "puedes generar el itinerario de limpieza?"
  2. Click Confirm on the confirmation card
  3. When prompted for date, reply: "Junio 5"
  4. Verify task created: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT id, status, metadata->'inputs' as inputs FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000019' ORDER BY created_at DESC LIMIT 1;"`
  5. Expected: `inputs` contains `"date": "2026-06-05"` (current year normalized)
     Output: `Task ID | Date Value | Status | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                               | Files                                                                                                | Pre-commit           |
| ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| 1      | `fix(input-collector): always use LLM extraction for single inputs`                   | `src/inngest/slack-trigger-handler.ts`, `src/lib/extract-inputs.ts`, `src/gateway/slack/handlers.ts` | `pnpm test -- --run` |
| 2      | `test(input-collector): add tests for single-input LLM extraction and race condition` | `tests/inngest/slack-trigger-handler.test.ts`, `tests/lib/extract-inputs.test.ts`                    | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# All tests pass
pnpm test -- --run
# Expected: 0 failures

# Race condition fix verified
grep -n "pendingInputCollections.set\|chat.postMessage" src/gateway/slack/handlers.ts
# Expected: set() line number < postMessage() line number

# Interface includes type and options
grep -A5 "requiredInputs:" src/inngest/slack-trigger-handler.ts | grep "type"
# Expected: type?: string visible in interface

# General multilingual instruction in prompt
grep "any language" src/lib/extract-inputs.ts
# Expected: multilingual instruction present
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] "Junio 5" E2E verified via Slack trigger
