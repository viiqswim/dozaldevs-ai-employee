# Slack Terminal State Notification Enrichment

## TL;DR

> **Quick Summary**: Enrich the main channel Slack notification at two terminal states — add the employee name to "Done (no-approval)" and surface `failure_reason` on "Failed" — so end users can identify which employee completed or failed and why.
>
> **Deliverables**:
>
> - Done (no-approval) notification shows employee name: "✅ **Guest Messaging — Task complete**"
> - Failed notification surfaces `failure_reason` when available (graceful no-op when null)
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — 2 sequential tasks in 1 file + verification
> **Critical Path**: Task 1 → Task 2 → Task 3 (verify) → F1-F4

---

## Context

### Original Request

End users see "✅ Task complete" with a task ID and run ID when an AI employee finishes — no indication of which employee or what it did. The user asked to analyze all terminal states and identify which ones are missing useful context.

### Interview Summary

**Key Discussions**:

- Done (no-approval): Should show employee name only (not summary or full enrichment)
- Failed: Should show raw `failure_reason` as-is (full technical detail is acceptable)
- Rejected: Already shows "❌ Rejected by @person" — user wants to keep as-is
- Duration, dead code cleanup, approval card changes: explicitly out of scope

**Research Findings**:

- The "Done (no-approval)" path uses `notifyStateBlocks()` (simple builder) instead of `notifyBlocks()` (full builder) — a one-function-swap fix since `notifyBlocks` already supports `archetypeName`
- The "Failed" path ALREADY uses `notifyBlocks` with `archetypeName` — the employee name is already shown on failure. Only `failure_reason` surfacing is new.
- `failure_reason` is only populated in 2 delivery-path spots in the codebase (lines 1816 and 2037 of employee-lifecycle.ts), NOT when the worker crashes or times out. Adding it as `extraText` will be a graceful no-op for execution failures.

### Metis Review

**Identified Gaps** (addressed):

- `mark-failed` already uses `notifyBlocks` with `archetypeName` — employee name is already shown on failure. Corrected scope: only `failure_reason` surfacing needed.
- `failure_reason` is rarely populated (only delivery failures, not execution crashes) — addressed via null-safe `extraText: failureReason ?? undefined` pattern.
- Secondary inline block at lines 832-843 in `complete` step (stale approval card cleanup) — explicitly excluded from scope.
- `notifyBlocks` requires `archetypeName` as non-optional string — use existing pattern: `(archetype.role_name as string) ?? 'unknown'`.

---

## Work Objectives

### Core Objective

Enrich two terminal-state Slack notifications so end users know which employee completed/failed and why, without touching the already-rich approval card flow.

### Concrete Deliverables

- Modified `src/inngest/employee-lifecycle.ts`: `complete` step uses `notifyBlocks` instead of `notifyStateBlocks`
- Modified `src/inngest/employee-lifecycle.ts`: `mark-failed` step passes `failure_reason` as `extraText`

### Definition of Done

- [ ] Done (no-approval) Slack notification reads "✅ **[Employee Name] — Task complete**" (not just "✅ Task complete")
- [ ] Failed Slack notification includes `failure_reason` text when the field is populated
- [ ] Failed Slack notification still renders cleanly when `failure_reason` is null/undefined
- [ ] `pnpm test -- --run` passes (1490 passing, 0 failures)
- [ ] `pnpm build` compiles with 0 TypeScript errors

### Must Have

- Employee name (archetype `role_name`) displayed on Done (no-approval) notifications
- `failure_reason` surfaced on Failed notifications when available
- Null-safe handling: `failure_reason ?? undefined` (not raw null)

### Must NOT Have (Guardrails)

- Do NOT touch the stale approval card cleanup block (lines 832-843 in `complete` step)
- Do NOT modify `src/lib/slack-blocks.ts` — `buildNotifyBlocks` already supports all required parameters
- Do NOT touch `notifyStateBlocks` calls at lines 1065 and 1108 (no-action and other paths)
- Do NOT change the Rejected, Expired, or Superseded notification flows
- Do NOT modify approval card content (`buildEnrichedTerminalBlocks`)
- Do NOT add summary, duration, or other metadata beyond what was agreed
- Do NOT remove or refactor `buildCompactNotifyBlocks` (dead code cleanup is out of scope)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after — verify build + existing tests pass (no new unit tests for a block-builder swap)
- **Framework**: Vitest via `pnpm test -- --run`

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend verification**: Use Bash (build, test commands)
- **Code verification**: Use grep/read to verify exact block structures

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — both changes in same file):
├── Task 1: Enrich Done (no-approval) notification [quick]
├── Task 2: Surface failure_reason on Failed notification [quick]

Wave 2 (Verification):
├── Task 3: Build + test verification [quick]

Wave 3 (Notify):
├── Task 4: Send Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks   |
| ---- | ---------- | -------- |
| 1    | —          | 2, 3     |
| 2    | 1          | 3        |
| 3    | 2          | 4, F1-F4 |
| 4    | 3          | —        |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 `quick`, T2 `quick` (sequential, same file)
- **Wave 2**: 1 task — T3 `quick`
- **Wave 3**: 1 task — T4 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Enrich Done (no-approval) notification with employee name

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, locate the `complete` step (~line 786)
  - Replace the `notifyStateBlocks({ emoji: '✅', text: 'Task complete' })` call with a `notifyBlocks()` call
  - Follow the exact pattern used in the Superseded path (~line 641):
    ```typescript
    notifyBlocks({
      state: 'Task complete',
      archetypeName: (archetype.role_name as string) ?? 'unknown',
      enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
      emoji: '✅',
    });
    ```
  - The `notifyBlocks` closure is already in scope (created at line 134 via `createTaskNotifyBuilders`)
  - The `archetype` object is already in scope from the `load-task` step
  - The `notifyMsgRef.enrichment` is already captured at the `notify-received` step

  **Must NOT do**:
  - Do NOT touch the stale approval card cleanup block at lines 832-843
  - Do NOT touch `notifyStateBlocks` calls at lines 1065 and 1108
  - Do NOT add `sentSnippet`, `threadHint`, or `extraText` — employee name only
  - Do NOT modify `src/lib/slack-blocks.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line replacement in one file, clear pattern to follow
  - **Skills**: []
    - No domain-specific skills needed — this is a straightforward code swap
  - **Skills Evaluated but Omitted**:
    - `debugging-lifecycle`: Not debugging — just modifying a notification call

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential with Task 2)
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/inngest/employee-lifecycle.ts:641-646` — Superseded path uses `notifyBlocks()` with `archetypeName` and `enrichment` — copy this exact pattern
  - `src/inngest/employee-lifecycle.ts:704-709` — `mark-failed` path uses the same pattern — confirms the approach works

  **API/Type References** (contracts to implement against):
  - `src/inngest/employee-lifecycle.ts:134` — `createTaskNotifyBuilders` creates the `notifyBlocks` and `notifyStateBlocks` closures — confirms both are in scope
  - `src/lib/slack-blocks.ts:395-484` — `buildNotifyBlocks` function signature — confirms `archetypeName` is required (non-optional string), `enrichment` is optional
  - `src/lib/types/notification-enrichment.ts` — `NotificationEnrichment` type definition — needed for the `as NotificationEnrichment | null` cast

  **WHY Each Reference Matters**:
  - Lines 641-646: This IS the pattern to copy — same function, same parameters, same context. The executor should replicate it almost verbatim.
  - Lines 704-709: Proves the pattern works for terminal states — gives confidence the change is correct.
  - Line 134: Confirms `notifyBlocks` is in scope — the executor doesn't need to import anything new.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Done (no-approval) notification includes employee name
    Tool: Bash (grep)
    Preconditions: Change has been applied to employee-lifecycle.ts
    Steps:
      1. Read the `complete` step in employee-lifecycle.ts (search for the block that calls updateMessage after marking task Done with no approval required)
      2. Verify the old `notifyStateBlocks({ emoji: '✅', text: 'Task complete' })` call is GONE
      3. Verify the new `notifyBlocks({ state: 'Task complete', archetypeName:` pattern is PRESENT
      4. Verify `enrichment: notifyMsgRef.enrichment` is passed in the new call
    Expected Result: Old simple builder replaced with full builder including archetypeName and enrichment
    Failure Indicators: `notifyStateBlocks` still present in the complete step, or `notifyBlocks` call missing `archetypeName`
    Evidence: .sisyphus/evidence/task-1-done-notification-code.txt

  Scenario: Stale approval cleanup block is untouched
    Tool: Bash (grep)
    Preconditions: Change has been applied
    Steps:
      1. Read lines 832-843 of employee-lifecycle.ts (the try/catch block that cleans up stale approval cards)
      2. Verify the hardcoded '✅ Completed — no approval required' string is still present
      3. Verify the inline blocks structure is unchanged
    Expected Result: Stale approval cleanup block is identical to before the change
    Failure Indicators: Any modification to lines 832-843 or the '✅ Completed — no approval required' string
    Evidence: .sisyphus/evidence/task-1-stale-cleanup-untouched.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): show employee name on done notification for no-approval tasks`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Surface failure_reason on Failed notification

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, locate the `mark-failed` step (~line 682)
  - The step already calls `notifyBlocks()` with `archetypeName` — do NOT replace the call
  - Add `failure_reason` to the existing `notifyBlocks()` call as `extraText`
  - Read the task's `failure_reason` field — it's available via `taskData.failure_reason` or may need to be fetched from the DB
  - **CRITICAL**: `failure_reason` is only populated for delivery failures (lines 1816, 2037), NOT for execution crashes. Use null-safe pattern: `extraText: (taskData.failure_reason as string) ?? undefined`
  - When `failure_reason` is undefined, `notifyBlocks` will simply not render the extra text section — graceful no-op

  **Must NOT do**:
  - Do NOT replace the existing `notifyBlocks` call — only add the `extraText` parameter
  - Do NOT modify `src/lib/slack-blocks.ts`
  - Do NOT try to capture execution crash reasons (out of scope — would require worker changes)
  - Do NOT touch any other terminal state notifications

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding one parameter to an existing function call
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `debugging-lifecycle`: Not debugging — modifying a notification parameter

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1 — same file)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/inngest/employee-lifecycle.ts:704-709` — Current `mark-failed` `notifyBlocks()` call — this is where to add the `extraText` parameter
  - `src/inngest/employee-lifecycle.ts:2364` — Rejection notification uses `extraText: 'Rejected by <@${actorUserId}>'` — pattern for how `extraText` is passed to `notifyBlocks`

  **API/Type References**:
  - `src/lib/slack-blocks.ts:395-484` — `buildNotifyBlocks` accepts optional `extraText?: string` — when present, renders as an additional section block below the header
  - `prisma/schema.prisma` — `tasks` model has `failure_reason String?` field — nullable string

  **Data Flow References**:
  - `src/inngest/employee-lifecycle.ts:1816` — First place `failure_reason` is set (delivery timeout)
  - `src/inngest/employee-lifecycle.ts:2037` — Second place `failure_reason` is set (delivery error)
  - These are the ONLY two places — for execution failures, the field is null

  **WHY Each Reference Matters**:
  - Lines 704-709: The exact location to modify — executor needs to see the current call shape to add `extraText` correctly
  - Line 2364: Shows the established pattern for passing `extraText` — executor should follow same style
  - Lines 1816 and 2037: Context for why `failure_reason` is often null — executor must use null-safe pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: failure_reason passed as extraText in mark-failed
    Tool: Bash (grep/read)
    Preconditions: Change has been applied to employee-lifecycle.ts
    Steps:
      1. Read the `mark-failed` step's `notifyBlocks()` call
      2. Verify `extraText` parameter is present in the call
      3. Verify null-safe pattern is used (e.g. `?? undefined` or conditional)
      4. Verify the existing parameters (state, archetypeName, enrichment, emoji) are unchanged
    Expected Result: `notifyBlocks` call includes `extraText` with null-safe failure_reason, all other params intact
    Failure Indicators: Missing null guard, other params modified, or extraText hardcoded to a string
    Evidence: .sisyphus/evidence/task-2-failed-notification-code.txt

  Scenario: notifyBlocks renders cleanly when extraText is undefined
    Tool: Bash (read)
    Preconditions: Change applied
    Steps:
      1. Read `buildNotifyBlocks` in `src/lib/slack-blocks.ts`
      2. Verify that when `extraText` is undefined/not provided, no extra section block is added
      3. Confirm no runtime error would occur with undefined extraText
    Expected Result: buildNotifyBlocks gracefully handles undefined extraText (no extra block rendered)
    Failure Indicators: extraText rendered as "undefined" string, or function throws on undefined
    Evidence: .sisyphus/evidence/task-2-null-safety-verified.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `fix(lifecycle): surface failure_reason in failed notification when available`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Build and test verification

  **What to do**:
  - Run `pnpm build` and verify 0 TypeScript errors
  - Run `pnpm test -- --run` and verify 1490 passing, 0 failures
  - Run `pnpm lint` and verify 0 errors

  **Must NOT do**:
  - Do NOT modify any code to make tests pass — if tests fail, it's a regression from Tasks 1-2
  - Do NOT skip pre-existing test failures (they're documented in AGENTS.md)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running standard verification commands
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Tasks 1-2)
  - **Blocks**: Task 4, F1-F4
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `AGENTS.md` § Commands — `pnpm build`, `pnpm test -- --run`, `pnpm lint`
  - `AGENTS.md` § Pre-existing Test Failures — `container-boot.test.ts` and `inngest-serve.test.ts` are known failures, do not count as regressions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds
    Tool: Bash
    Preconditions: Tasks 1-2 complete
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Build completes with 0 errors
    Failure Indicators: Any TypeScript error mentioning notifyBlocks, archetypeName, or extraText
    Evidence: .sisyphus/evidence/task-3-build-output.txt

  Scenario: Test suite passes
    Tool: Bash
    Preconditions: Tasks 1-2 complete
    Steps:
      1. Run `pnpm test -- --run`
      2. Verify test results: expect ~1490 passing, 0 failures
      3. Known skips (container-boot, inngest-serve) are acceptable
    Expected Result: All tests pass except known pre-existing skips
    Failure Indicators: Any new test failure not in the pre-existing list
    Evidence: .sisyphus/evidence/task-3-test-output.txt
  ```

  **Commit**: NO (verification only)

- [x] 4. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ slack-notification-enrichment complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 3

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for patterns). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review the changed lines in `src/inngest/employee-lifecycle.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Read the modified `complete` step and `mark-failed` step. Verify: (1) `notifyBlocks` call in `complete` step matches the Superseded path pattern, (2) `extraText` in `mark-failed` uses null-safe pattern, (3) no unintended changes to adjacent code, (4) stale approval cleanup block (lines 832-843) is untouched. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Message                                                                           | Files                               | Pre-commit   |
| ---- | --------------------------------------------------------------------------------- | ----------------------------------- | ------------ |
| 1+2  | `fix(lifecycle): show employee name and failure reason in terminal notifications` | `src/inngest/employee-lifecycle.ts` | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build       # Expected: 0 errors
pnpm test -- --run  # Expected: ~1490 passing, 0 failures
pnpm lint        # Expected: 0 errors
```

### Final Checklist

- [ ] Done (no-approval) notification shows employee name
- [ ] Failed notification surfaces failure_reason when populated
- [ ] Failed notification renders cleanly when failure_reason is null
- [ ] All existing tests pass
- [ ] No changes to slack-blocks.ts
- [ ] No changes to approval card flows
- [ ] Stale approval cleanup block untouched
