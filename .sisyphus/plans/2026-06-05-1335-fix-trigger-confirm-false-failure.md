# Fix Trigger-Confirm False-Failure — `allFound` Fall-Through Double-Dispatch

## TL;DR

> **Quick Summary**: When a user clicks "Confirm" on a Slack trigger-confirmation card for an employee that has required inputs (e.g. cleaning-schedule's `date`), the task IS dispatched successfully — but the card is then overwritten with "⚠️ Failed to trigger employee. Please try again." The real cause: the `if (allFound)` branch in the `trigger_confirm` handler has **no `return`**, so after dispatching it falls through and tries to create a SECOND task with the same `external_id`. PostgREST rejects the duplicate (unique constraint), the handler throws `"Task creation returned empty response"`, and that throw lands in the shared catch block that posts the false failure. Fix = add the missing `return`, plus a `dispatched` flag and isolated success-respond try/catch as defense-in-depth, plus a guard against empty LLM `confirmText` causing a Slack `invalid_blocks` error.
>
> **Deliverables**:
>
> - `src/gateway/slack/handlers.ts` `TRIGGER_CONFIRM` handler: add `return;` after the `allFound` block (kills fall-through double-dispatch); add a `dispatched` flag gating the catch-block failure message; isolate the two post-dispatch `respond({✅...})` calls in their own non-rethrowing try/catch; harden `confirmText` so an empty/undefined LLM response always falls back to a non-empty string before `chat.postMessage`.
> - New unit tests in `tests/gateway/slack/handlers-trigger-confirm.test.ts` covering: allFound dispatches exactly once (no double-dispatch), respond-throws-after-dispatch shows no failure, empty/undefined confirmText falls back, and the existing legitimate-failure test preserved.
> - Live Slack E2E: real @mention cleaning-schedule → Confirm → ✅ appears, NO ⚠️, exactly one task row, task progresses past `Ready`.
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single source file; sequential (impl → tests → QA)
> **Critical Path**: Task 1 (impl) → Task 2 (tests) → Final Verification Wave

---

## Context

### Original Request

User: "When I ask the system to generate a cleaning schedule for a date, it shows the confirm/deny message. When I click Confirm, it correctly launches the AI employee. But in the original Slack thread, I see a 'failed to trigger the employee' message when it did actually trigger." Screenshot showed both "⚠️ Failed to trigger employee" AND "Just to confirm... with Checkout Date: 2026-06-08. Working on it!" in the same thread.

### Investigation Summary

**Root cause confirmed THREE ways: static analysis, explore agent (`ses_166f161faffeH2LnyZec4VfvIh`), and live gateway logs.**

The `trigger_confirm` action handler (`src/gateway/slack/handlers.ts:1501-1859`) dispatches the task, then a follow-up operation throws, and the throw lands in the SAME outer try block (1554-1831) as the catch (line 1832) that posts "⚠️ Failed to trigger employee."

**Three failure modes, all rooted in the shared try block:**

1. **PRIMARY — `allFound` fall-through double-dispatch (deterministic, this is the user's case)** — Found by Metis (`ses_166ee3bafffeDpToAk5Nqm1gzS`), confirmed by direct read. The `if (allFound) { ... }` block (1609-1707) has **NO `return`**. After it dispatches (`inngest.send` at 1680) and posts ✅ (1691), control **falls through** to line 1784, which creates a SECOND task with the same `external_id`. PostgREST returns `[]` (unique constraint `@@unique([external_id, source_system, tenant_id])` at `schema.prisma:58`), line 1799 throws `"Task creation returned empty response"`, which lands in the catch → false ⚠️. **cleaning-schedule has a required `date` input → it ALWAYS hits `allFound` → this fires every time.**
   - **Log proof** (`/tmp/ai-dev.log`): 4× `"Task creation returned empty response"` errors with `archetypeId: 00000000-0000-0000-0000-000000000019` (cleaning-schedule) at lines 261519, 262588, 262846, 263081.

2. **SECONDARY — post-dispatch `respond({✅...})` throws** (1691, 1815) — expired Slack `response_url` or Socket Mode WebSocket drop. Task is already dispatched; the throw still hits the catch → false ⚠️. Defense-in-depth needed for the default path.

3. **TERTIARY — empty/undefined `confirmText` → Slack `invalid_blocks`** — `confirmResult.content.trim()` (1631) can be empty from the deepseek reasoning model. If it reaches `chat.postMessage` (1640, no inner try/catch), Slack rejects with `invalid_blocks` ("must be more than 0 characters"). Also: if `content` is `undefined`, `.trim()` throws a TypeError before the `!confirmText` guard.
   - **Log proof**: 1× `invalid_blocks` error at `handlers.ts:1609` in `/tmp/ai-dev.log` (line 260576).

### Metis Review (`ses_166ee3bafffeDpToAk5Nqm1gzS`)

**Critical finding**: The missing `return` in the `allFound` path is the deterministic primary cause — NOT the respond() throw I originally hypothesized. The Inngest `id` dedup (`employee-dispatch-${externalId}`) and PostgREST unique constraint mask the double-dispatch, but the second task-creation's empty response surfaces as the thrown error.

**Key directives incorporated**:

- Primary fix = `return;` after the `allFound` block (line 1707). The `dispatched` flag alone is insufficient — it would suppress the message but leave the double-task-creation churn and duplicate `chat.postMessage`.
- `dispatched` flag must be declared OUTSIDE the try and set strictly AFTER `await inngest.send()` resolves (so a throwing `send()` correctly still shows the failure).
- `confirmText` guard must use optional chaining (`content?.trim()`) — `undefined.trim()` would throw a TypeError.
- Do NOT refactor the whole handler into multiple try blocks — over-engineering; raises regression risk against the 6 existing tests.
- Do NOT touch TRIGGER_CANCEL or APPROVE/REJECT handlers — note as follow-up only.
- Capture isolated-file test baseline BEFORE editing.

---

## Work Objectives

### Core Objective

Make the `trigger_confirm` handler post a "⚠️ Failed to trigger" message ONLY when the task genuinely failed to dispatch — never after a successful dispatch. The deterministic cause (allFound fall-through double-dispatch) is fixed at the structural root with a `return`, backed by a `dispatched` flag and isolated respond error handling for the remaining post-dispatch throw scenarios.

### Concrete Deliverables

- Modified `src/gateway/slack/handlers.ts` (TRIGGER_CONFIRM handler only): `return` after allFound block, `dispatched` flag gating the catch, two isolated success-respond try/catches, `confirmText` optional-chaining fallback guard.
- New unit tests in `tests/gateway/slack/handlers-trigger-confirm.test.ts`.

### Definition of Done

- [ ] Live Slack E2E: @mention cleaning-schedule with a date → Confirm → ✅ message appears, NO ⚠️ "Failed to trigger" message appears.
- [ ] Exactly ONE task row exists for the trigger (no double-creation): `SELECT count(*) FROM tasks WHERE external_id='slack-trigger-<threadTs>-<archetypeId>'` = `1`.
- [ ] `inngest.send` dispatched exactly once in the allFound path (unit test asserts `toHaveBeenCalledTimes(1)`).
- [ ] `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts` → ≥ baseline pass count, zero new failures.
- [ ] No changes outside `src/gateway/slack/handlers.ts` and `tests/gateway/slack/handlers-trigger-confirm.test.ts`.

### Must Have

- `return;` immediately after the `allFound` block closes (after line 1707) — eliminates fall-through double-dispatch.
- `let dispatched = false;` declared OUTSIDE the main try; set `dispatched = true;` on the line immediately AFTER each `await inngest.send(...)` resolves.
- Catch block (1832) gates the "⚠️ Failed to trigger" respond on `if (!dispatched)`; if dispatched, `log.warn` only.
- Each post-dispatch success respond ✅ (1691, 1815) wrapped in its own try/catch that `log.warn`s and does NOT re-throw (mirror the isolated pattern at 1535-1552).
- `confirmText` derived so an `undefined` or whitespace-only LLM `content` always falls back to the non-empty default string before reaching `chat.postMessage` — use optional chaining.

### Must NOT Have (Guardrails)

- Do NOT modify the `TRIGGER_CANCEL` handler (1861+).
- Do NOT modify APPROVE/REJECT handlers or any other `respond()` / `chat.update` call site in the file — note as follow-up only.
- Do NOT change the `extractInputsFromText` call, the input-collection `else if` branch (1708-1782), or the PostgREST task-creation payloads/shape.
- Do NOT refactor the large try block into multiple separate try blocks beyond the minimal `dispatched` flag + targeted respond try/catches. No whole-handler rewrite.
- Do NOT set `dispatched = true` before or independent of `inngest.send()` resolving (a throwing `send()` must still show the failure).
- Do NOT touch `extract-inputs.ts`, `call-llm.ts`, `slack-trigger-handler.ts`, or `interaction-handler.ts`.
- Do NOT rely on the Inngest Dev Server UI for verification (AGENTS.md Known Issue #3) — use DB + gateway logs as ground truth.
- Do NOT remove or weaken the existing test at line 259 ("extraction throws → posts failure") — it is the legitimate-failure case.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest; dedicated `handlers-trigger-confirm.test.ts` with full mock harness)
- **Automated tests**: YES (Tests-after — extend the existing file)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA. Evidence saved to `.sisyphus/evidence/`.

- **Handler logic**: Bash (Vitest) — run the isolated test file, assert pass counts and mock call counts
- **Slack E2E**: real @mention via the platform + DB assertions (per AGENTS.md mandatory E2E wave)
- **Ground truth**: DB (`tasks`, `task_status_log`) + gateway logs (`/tmp/ai-dev.log`), NOT the Inngest UI

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (implementation — single file, sequential):
└── Task 1: return + dispatched flag + isolated respond + confirmText guard [quick]

Wave 2 (tests — after impl):
└── Task 2: Add 5 unit tests + preserve existing failure test [quick]

Wave FINAL (after impl + tests):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — baseline + unit suite + live Slack E2E (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → F1-F4 → user okay
Note: Single-file change — intentionally sequential, no parallelism benefit.
```

### Dependency Matrix

| Task       | Depends On | Blocks | Wave |
| ---------- | ---------- | ------ | ---- |
| 1          | —          | 2      | 1    |
| 2          | 1          | F1-F4  | 2    |
| 3 (notify) | F1-F4      | —      | post |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`
- **Wave 2**: T2 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = the unit of work. EVERY task has Recommended Agent Profile + QA Scenarios.

- [x] 1. Add `return` after allFound, `dispatched` flag, isolated success-respond, and `confirmText` guard

  **What to do** (all edits inside the `TRIGGER_CONFIRM` handler in `src/gateway/slack/handlers.ts`, lines 1501-1859):
  1. **Declare the flag OUTSIDE the main try block**: just before the main `try {` at line 1554 (i.e. after the inner "⏳ Triggering employee..." respond try/catch closes at 1552), add `let dispatched = false;`. It MUST be in scope in the catch at line 1832.

  2. **`allFound` path — set the flag and add the missing `return`**:
     - After `await inngest.send({...})` resolves at line 1684, add `dispatched = true;`.
     - Wrap the success respond ✅ at lines 1691-1707 in its own try/catch: on throw, `log.warn({ taskId, err }, 'trigger_confirm: success respond failed after dispatch (allFound)')` and do NOT re-throw. Mirror the existing isolated pattern at lines 1535-1552.
     - **CRITICAL**: Add `return;` immediately after the success respond try/catch closes (after line 1707, before the `} else if` at 1708). This eliminates the fall-through into the default dispatch block (1784) that causes the duplicate task creation. **This is the primary deterministic fix.**

  3. **Default path (no required inputs) — set the flag and isolate the respond**:
     - After `await inngest.send({...})` resolves at line 1808, add `dispatched = true;`.
     - Wrap the success respond ✅ at lines 1815-1831 in its own try/catch: on throw, `log.warn({ taskId, err }, 'trigger_confirm: success respond failed after dispatch (default)')` and do NOT re-throw.

  4. **Catch block (line 1832) — gate the failure message on `!dispatched`**:
     - Change the catch so the "⚠️ Failed to trigger employee" respond (1838-1854) only runs `if (!dispatched)`.
     - If `dispatched === true`, call `log.warn({ archetypeId: ctx.archetypeId, err }, 'trigger_confirm: post-dispatch error after successful dispatch (suppressed false-failure message)')` and do NOT post the ⚠️ message.
     - Keep the inner try/catch around the failure respond (1837-1857) intact.

  5. **`confirmText` guard (lines 1613-1638) — prevent empty/undefined from reaching Slack**:
     - Change `confirmText = confirmResult.content.trim();` to use optional chaining: `confirmText = confirmResult.content?.trim() ?? '';`.
     - The existing `if (!confirmText) { confirmText = <fallback> }` guard at 1632-1634 then catches both empty-string and (now-safe) undefined cases. Verify the fallback string is always non-empty (it interpolates `archetype.role_name` and `summaryParts`, which are always present in the allFound path).

  **Must NOT do**:
  - Do NOT modify the TRIGGER_CANCEL handler (1861+) or APPROVE/REJECT handlers.
  - Do NOT change the `extractInputsFromText` call, the `else if` input-collection branch (1708-1782), or the PostgREST payloads.
  - Do NOT set `dispatched = true` anywhere except immediately after an `await inngest.send()` resolves.
  - Do NOT refactor the handler beyond the flag + two isolated respond try/catches + the `return` + the confirmText guard.
  - Do NOT touch any other file.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Four surgical, well-specified edits in one handler; no new dependencies.
  - **Skills**: []
    - Skills Evaluated but Omitted: `debugging-lifecycle` (not debugging a stuck task), `e2e-testing` (that's F3's job).

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:1535-1552` — the correctly-isolated "⏳ Triggering employee..." respond try/catch (log-and-continue). The two success-respond try/catches must mirror this exact shape.
  - `src/gateway/slack/handlers.ts:1609-1707` — the `allFound` block (no `return` today). Add `dispatched=true` after `send()` at 1684; isolate respond 1691-1707; add `return;` after.
  - `src/gateway/slack/handlers.ts:1784-1831` — the default-path dispatch (only reached when `requiredInputs.length === 0` after the fix). Add `dispatched=true` after `send()` at 1808; isolate respond 1815-1831.
  - `src/gateway/slack/handlers.ts:1832-1858` — the catch block to gate on `!dispatched`.
  - `src/gateway/slack/handlers.ts:1613-1638` — the `confirmText` derivation to harden with optional chaining.

  **API/Type References**:
  - `src/lib/call-llm.ts` — `CallLLMResult.content` type (confirm whether `string` or `string | undefined`; the optional-chaining guard is safe either way).
  - `prisma/schema.prisma:58` — `@@unique([external_id, source_system, tenant_id])` on `tasks` — the constraint that rejects the duplicate task on fall-through. This is WHY the `return` is needed.

  **WHY Each Reference Matters**:
  - The `@@unique` constraint is the mechanism: the fall-through creates a second `tasks` POST with the same `external_id`, PostgREST returns `[]`, and `if (!tasks.length) throw` fires. The `return` stops the fall-through at the source.
  - The isolated-respond pattern at 1535-1552 already exists in this exact handler — the fix is to apply the same pattern consistently to the success responds, not invent a new approach.

  **Acceptance Criteria**:

  ```
  Scenario: All handler tests pass (via Task 2)
    Tool: Bash (Vitest)
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts 2>&1 | tail -10
      2. Assert: 0 failures
    Expected Result: Green suite
    Evidence: .sisyphus/evidence/task-1-tests.txt

  Scenario: `return` present after allFound block, dispatched flag set after send only
    Tool: Bash (grep)
    Steps:
      1. Run: grep -nE "let dispatched|dispatched = true|return;" src/gateway/slack/handlers.ts | head -20
      2. Assert: `let dispatched = false` appears once before the main try; `dispatched = true` appears exactly twice (after each send); a `return;` exists between the allFound block and the else-if
    Expected Result: Correct flag + return placement
    Evidence: .sisyphus/evidence/task-1-structure.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -5
      2. Assert: exit 0, no TS errors
    Expected Result: Clean compile
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): stop false trigger-failure from allFound fall-through double-dispatch`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts`

- [x] 2. Add unit tests: single-dispatch, post-dispatch respond throw, empty/undefined confirmText

  **What to do** (extend `tests/gateway/slack/handlers-trigger-confirm.test.ts` — it already has `makeMockBoltApp`, `makeRespond`, `makeClient`, `makeMockInngest`, `makeActionBody`, `makeArchetypeResponse`, `makeTaskCreationResponse`, and the `mockCallLLM`/`mockExtractInputsFromText` hoisted mocks):
  1. **BASELINE FIRST**: Before writing any new test, run `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts 2>&1 | tail -5` and record the exact pass/fail count (currently 6 tests) to `.sisyphus/evidence/task-2-baseline.txt`. This is the regression baseline.

  2. Add these 5 test cases:

     a. **`allFound` dispatches exactly once (no double-dispatch)** — default mock setup (required `date` input, `mockExtractInputsFromText` returns `{ date: '2026-06-05' }`). Run the handler. Assert: `expect(inngest.send).toHaveBeenCalledTimes(1)` AND `expect(client.chat.postMessage).toHaveBeenCalledTimes(1)`. This is the regression guard for the missing-`return` fix — pre-fix this would be 2.

     b. **Post-dispatch respond throws (allFound) → no failure message** — required input fully extracted; make `respond` reject on the ✅ call: `const respond = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('expired_url'));` (first call is the "⏳" respond, second is the ✅). Run handler. Assert: `inngest.send` called exactly once; NO respond call's text contains `'Failed to trigger'` or `'⚠️'`; handler does not throw.

     c. **Empty confirmText → non-empty fallback to postMessage** — `mockCallLLM.mockResolvedValue({ content: '', model:'test', promptTokens:0, completionTokens:0, estimatedCostUsd:0, latencyMs:0 })`. Run handler. Assert: `client.chat.postMessage` called with `text` of length > 0; handler does not throw; `inngest.send` called once.

     d. **Undefined confirmText content → no TypeError, fallback used** — `mockCallLLM.mockResolvedValue({ content: undefined as unknown as string, ... })`. Run handler. Assert: no throw (proves optional chaining); `client.chat.postMessage` text length > 0; `inngest.send` called once.

     e. **Default path (no required inputs) post-dispatch respond throws → no failure message** — mock archetype with empty `input_schema` (`makeArchetypeResponse([])`), `respond` rejects on the ✅ call (same `mockResolvedValueOnce/mockRejectedValueOnce` pattern). Assert: `inngest.send` called once; NO `'Failed to trigger'`/`'⚠️'` respond; no throw.

  3. **Preserve the existing test at line 259** ("extraction throws → handler does not crash, posts failure respond") verbatim — it is the legitimate-failure case (throw BEFORE dispatch, `dispatched` stays false). Re-run to confirm it stays green.

  **Must NOT do**:
  - Do NOT modify or break the 6 existing tests.
  - Do NOT add integration tests requiring a live LLM or live Slack (that is F3's job).
  - Do NOT place the test file anywhere but `tests/gateway/slack/handlers-trigger-confirm.test.ts`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding well-specified test cases on an established mock harness.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo, after Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:163-194` — the "all inputs extracted → posts confirmation, dispatches" test (the basis for test a; extend with `toHaveBeenCalledTimes`).
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:259-278` — the existing "extraction throws → posts failure" test (preserve verbatim; it's the legitimate-failure guard).
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:51-63` — `makeRespond()` and `makeClient()` helpers (use `vi.fn().mockResolvedValueOnce(...).mockRejectedValueOnce(...)` for the throw-on-second-respond tests).
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:280-310` — the "no required inputs → dispatches immediately" test (the basis for test e).

  **API/Type References**:
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:145-152` — the `mockCallLLM` result shape (replicate exactly for the empty/undefined content tests).

  **WHY Each Reference Matters**:
  - Test a directly encodes Metis's double-dispatch finding — it is the guard against the missing-`return` regression. `toHaveBeenCalledTimes(1)` is the assertion that would have caught this bug.
  - The `mockResolvedValueOnce/mockRejectedValueOnce` chain is how you simulate "⏳ respond succeeds, ✅ respond fails" — the exact post-dispatch failure mode.

  **Acceptance Criteria**:

  ```
  Scenario: Baseline captured then all tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts 2>&1 | tail -10
      2. Assert: 0 failures; test count >= 11 (6 existing + 5 new)
    Expected Result: Green suite, no regressions
    Evidence: .sisyphus/evidence/task-2-tests.txt

  Scenario: Single-dispatch regression guard
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts -t "exactly once"
      2. Assert: pass; asserts inngest.send called exactly once in allFound path
    Expected Result: No double-dispatch
    Evidence: .sisyphus/evidence/task-2-single-dispatch.txt

  Scenario: Full suite no new regressions
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -15
      2. Assert: no NEW failures vs. the documented ~28 pre-existing tests/gateway/slack/ failures
    Expected Result: Zero new regressions
    Evidence: .sisyphus/evidence/task-2-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(slack): cover trigger-confirm single-dispatch, post-dispatch respond, empty confirmText`
  - Files: `tests/gateway/slack/handlers-trigger-confirm.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts`

- [x] 3. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**:
  - After F1-F4 pass and user approves, run: `npx tsx scripts/telegram-notify.ts "✅ fix-trigger-confirm-false-failure complete — allFound fall-through fixed, no more false ⚠️ on Confirm. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: npx tsx scripts/telegram-notify.ts "✅ fix-trigger-confirm-false-failure complete ..."
      2. Assert: exit 0, stdout "[telegram] Notification sent."
    Expected Result: Delivered
    Evidence: .sisyphus/evidence/task-3-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read `handlers.ts` TRIGGER_CONFIRM handler — confirm `return` after allFound block, `dispatched` flag declared outside try and set after each `inngest.send`, catch gated on `!dispatched`, two isolated success-respond try/catches, `confirmText` optional-chaining guard). For each "Must NOT Have": grep for violations (no TRIGGER_CANCEL/APPROVE/REJECT edits, no whole-handler rewrite, no edits to other files, no `dispatched=true` before `send()`). Check evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts` + `pnpm exec eslint src/gateway/slack/handlers.ts tests/gateway/slack/handlers-trigger-confirm.test.ts` + `pnpm build`. Review for: `as any`/`@ts-ignore`, empty catches that swallow real errors, off-by-one, generic names, the `dispatched` flag placed correctly (after `send()` resolves). Confirm the existing 6 tests still pass.
      Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Build [PASS/FAIL] | VERDICT`

- [x] F3. **Real QA — baseline + unit suite + live Slack E2E** — `unspecified-high`
      (a) BASELINE FIRST (before reading the diff): `git stash` is NOT needed since impl is committed — instead checkout the parent commit of the impl in a scratch worktree OR simply record that baseline was captured during Task 2. Run `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts` on current HEAD → record pass/fail counts.
      (b) Live Slack E2E (AGENTS.md mandatory): confirm services live (`curl localhost:7700/health`, Inngest, Socket Mode in `/tmp/ai-dev.log`). @mention the cleaning-schedule employee (tenant `00000000-0000-0000-0000-000000000003`, archetype `00000000-0000-0000-0000-000000000019`) with a Spanish date message → click Confirm → assert (1) a ✅ message appears, (2) NO ⚠️ "Failed to trigger" message appears, (3) exactly ONE task row: `SELECT count(*) FROM tasks WHERE external_id='slack-trigger-<threadTs>-00000000-0000-0000-0000-000000000019'` = `1`, (4) `task_status_log` shows progression past `Ready`.
      Output: `Unit [N/N pass] | Slack ✅ [Y/N] | Slack ⚠️ absent [Y/N] | Task rows [N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      `git diff` — confirm ONLY `src/gateway/slack/handlers.ts` and `tests/gateway/slack/handlers-trigger-confirm.test.ts` changed. Verify 1:1 with spec: `return` added after allFound, `dispatched` flag set after `send()` only, catch gated on `!dispatched`, two isolated respond try/catches, `confirmText` guard. Confirm NO edits to TRIGGER_CANCEL, APPROVE/REJECT, other call sites, or other files.
      Output: `Files [N/N in scope] | Contamination [CLEAN/N] | Spec match [Y/N] | VERDICT`

- [x] F5. **Tmux/scratch cleanup** — kill any tmux sessions created during E2E; delete any temp scripts. `git status` must be clean (only intended files). Commit the plan and any notepads per git cleanup rules.

---

## Commit Strategy

| Commit | Message                                                                                        | Files                                                  | Pre-commit                                                                |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| 1      | `fix(slack): stop false trigger-failure from allFound fall-through double-dispatch`            | `src/gateway/slack/handlers.ts`                        | `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts` |
| 2      | `test(slack): cover trigger-confirm single-dispatch, post-dispatch respond, empty confirmText` | `tests/gateway/slack/handlers-trigger-confirm.test.ts` | `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts` |

---

## Success Criteria

### Verification Commands

```bash
# Handler tests pass (existing 6 + new 5)
pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts
# Expected: 0 failures

# return present after allFound block
# (manual read confirms `return;` exists between the allFound block close and the `else if`)

# Only 2 files changed
git diff --name-only
# Expected: ONLY src/gateway/slack/handlers.ts and tests/gateway/slack/handlers-trigger-confirm.test.ts

# Exactly one task row per trigger (live E2E)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT count(*) FROM tasks WHERE external_id LIKE 'slack-trigger-%-00000000-0000-0000-0000-000000000019';"
# Expected: count increments by exactly 1 per Confirm click
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Live Slack E2E: ✅ shows, ⚠️ absent
- [ ] Exactly one task row per trigger
- [ ] allFound dispatches exactly once (unit)
- [ ] All tests pass; only 2 files changed
