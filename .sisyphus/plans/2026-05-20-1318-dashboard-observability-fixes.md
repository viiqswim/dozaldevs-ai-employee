# Dashboard Observability Bug Fixes

## TL;DR

> **Quick Summary**: Fix 4 confirmed bugs in the dashboard observability panels — a broken PostgREST query (400 on every page load), missing auto-pass UX, silent error swallowing, and duration display for auto-completed tasks.
>
> **Deliverables**:
>
> - `feedback_events` query no longer 400s on every page load
> - Auto-completed tasks show an explanatory banner instead of empty panels
> - Fetch errors surfaced inline in the feedback events section
> - Duration display handles null timestamps for auto-pass tasks
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → F1-F4

---

## Context

### Original Request

User reported that two tasks in the dashboard show missing or incomplete observability data. Investigation revealed:

- Task `8debb23e` (team-motivation-messenger): Most data renders correctly, but `feedback_events` query returns HTTP 400 on every page load due to selecting a non-existent `actor_type` column.
- Task `3ed3d4c8` (guest-messaging): Auto-completed task (Received → Done in 0.7s, no worker ran). Dashboard shows empty panels with no explanation.

### Investigation Summary

**Browser DevTools confirmed**:

- PostgREST returns `{"code":"42703","message":"column feedback_events.actor_type does not exist"}` on every page load
- `usePoll` hook swallows the 400 error silently — components show "No feedback events" even when events exist
- Auto-pass tasks have 0 execution records, 0 deliverables, 1 status log entry, `started_at=NULL`, `completed_at=NULL`
- `StatusTimeline` gates duration on `task.started_at != null && task.completed_at != null` (not log count)

### Metis Review

**Identified Gaps** (all addressed):

- `actor_type` only appears in 2 files — confirmed safe to remove
- Auto-pass detection: `execution === null && task.status === 'Done'` is the reliable signal
- `showDeliverable` is `true` for Done tasks — deliverable section also needs auto-pass treatment
- Bug 3 scope locked to `useFeedbackEvents` only — not all 4 hooks
- Bug 4 root cause is null `started_at`/`completed_at`, not log count

---

## Work Objectives

### Core Objective

Fix 4 confirmed bugs in the dashboard observability panels so that all task types (normal execution, auto-pass, error states) display correctly.

### Concrete Deliverables

- Fixed `use-feedback-events.ts` — removes `actor_type` from select param
- Fixed `types.ts` — removes `actor_type` from `FeedbackEvent` interface
- Updated `TaskDetail.tsx` — auto-pass banner, feedback error surfacing
- Updated `StatusTimeline.tsx` — handles null timestamps for auto-pass tasks

### Definition of Done

- [ ] `pnpm test -- --run` passes (1486+ passing, 0 new failures)
- [ ] No PostgREST 400 errors in browser console on any task detail page
- [ ] Auto-pass tasks show explanatory banner instead of empty panels

### Must Have

- `feedback_events` query returns HTTP 200 (not 400)
- Auto-pass tasks display "Auto-completed" context
- Feedback events error state is visible when fetch fails

### Must NOT Have (Guardrails)

- Do NOT add `correction_content`, `original_content`, or `metadata` to the `feedback_events` select param — intentionally excluded
- Do NOT add error UI to `useExecution`, `useDeliverable`, or status log hooks — only `useFeedbackEvents`
- Do NOT modify `use-poll.ts` or `postgrestFetch` — shared utilities are out of scope
- Do NOT change `DELIVERABLE_STATUSES` set
- Do NOT add new test files — existing smoke test doesn't cover these components
- Do NOT add JSDoc, comments, or documentation beyond what already exists
- Do NOT refactor any shared utility (`usePoll`, `postgrestFetch`, etc.)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None for this fix (dashboard components have no unit tests beyond smoke)
- **Framework**: vitest (backend only)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, check network, screenshot
- **Build**: Use Bash — `pnpm test -- --run`, `cd dashboard && npx tsc --noEmit`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all 4 bugs are independent):
├── Task 1: Fix actor_type ghost column [quick]
├── Task 2: Add auto-pass detection and banner [quick]
├── Task 3: Surface feedback events fetch errors [quick]
└── Task 4: Fix duration display for null timestamps [quick]

Wave 2 (After Wave 1 — integration verification):
├── Task 5: Full Playwright QA + build verification [unspecified-high]
└── Task 6: Telegram notification [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [deep]
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks   | Wave |
| ---- | ---------- | -------- | ---- |
| 1    | —          | 5, F1-F4 | 1    |
| 2    | —          | 5, F1-F4 | 1    |
| 3    | —          | 5, F1-F4 | 1    |
| 4    | —          | 5, F1-F4 | 1    |
| 5    | 1, 2, 3, 4 | F1-F4    | 2    |
| 6    | 5          | —        | 2    |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **2 tasks** — T5 → `unspecified-high`, T6 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix `actor_type` ghost column in feedback events query

  **What to do**:
  - In `dashboard/src/hooks/use-feedback-events.ts` line 10: remove `actor_type` from the `select` string. Change from `'id,task_id,event_type,actor_id,actor_type,created_at'` to `'id,task_id,event_type,actor_id,created_at'`
  - In `dashboard/src/lib/types.ts`: remove `actor_type: string | null` from the `FeedbackEvent` interface (around line 158)
  - Verify no other file references `FeedbackEvent.actor_type` (confirmed: only these 2 files)

  **Must NOT do**:
  - Do NOT add `correction_content`, `original_content`, or `metadata` to the select param — these fields exist in the DB but are intentionally excluded from this query
  - Do NOT modify any other hook or type

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2-line change across 2 files, no logic complexity
  - **Skills**: `[]`
    - No domain-specific skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5 (integration QA)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `dashboard/src/hooks/use-feedback-events.ts:10` — the `select` string containing the offending `actor_type` field
  - `dashboard/src/lib/types.ts:158` — the `FeedbackEvent` interface with the `actor_type` field to remove

  **API/Type References**:
  - PostgREST error: `{"code":"42703","message":"column feedback_events.actor_type does not exist"}` — this is the exact error returned by the current query

  **WHY Each Reference Matters**:
  - `use-feedback-events.ts:10` — the single line that constructs the broken PostgREST select. Removing `actor_type` from this string fixes the 400 error.
  - `types.ts:158` — the TypeScript type must match what the query actually returns. Removing the field prevents future confusion.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback events query returns 200 instead of 400
    Tool: Playwright
    Preconditions: Dashboard dev server running at http://localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/8debb23e-bb75-470d-8bb7-7fbd0c6d2253?tenant=00000000-0000-0000-0000-000000000003
      2. Wait 3 seconds for polling requests to fire
      3. Check network requests: filter for `feedback_events`
      4. Assert: all `feedback_events` requests return HTTP 200 (not 400)
      5. Check browser console: assert no error messages containing "42703" or "actor_type"
    Expected Result: All feedback_events requests return 200. Console has 0 errors about actor_type.
    Failure Indicators: Any request to feedback_events returns 400. Console shows "column feedback_events.actor_type does not exist"
    Evidence: .sisyphus/evidence/task-1-feedback-events-200.png

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: cd /Users/victordozal/repos/dozal-devs/ai-employee/dashboard && npx tsc --noEmit
      2. Assert: exit code 0, no output
    Expected Result: Clean TypeScript compilation
    Failure Indicators: Non-zero exit code or any error output
    Evidence: .sisyphus/evidence/task-1-tsc-clean.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3, 4)
  - Message: `fix(dashboard): fix observability panel bugs — actor_type query, auto-pass UX, error display, duration`
  - Files: `dashboard/src/hooks/use-feedback-events.ts`, `dashboard/src/lib/types.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Add auto-pass detection and banner for tasks that skip execution

  **What to do**:
  - In `dashboard/src/panels/tasks/TaskDetail.tsx`: detect auto-pass tasks using condition: `execution === null && task.status === 'Done'` (where `execution` comes from `useExecution` hook and `task` is the current task)
  - When auto-pass detected:
    - Replace "No execution data" text (line ~521) in the Execution Metrics section with a banner: a styled div with a ⚡ icon and text "Auto-completed — no worker execution. This task was resolved during triage without spawning a worker."
    - Replace "No deliverable yet" text (line ~561) in the Deliverable section with: "No deliverable — task auto-completed during triage"
    - Disable the "View Transcript" button and show: "No execution record — transcript unavailable" (this already works correctly)
  - Style the banner using the existing Tailwind classes from the component (use a `bg-zinc-800/50 border border-zinc-700 rounded-lg p-4` pattern, consistent with existing card styles)

  **Must NOT do**:
  - Do NOT add a new top-level card or section for the banner — modify existing cards only
  - Do NOT change `DELIVERABLE_STATUSES` set
  - Do NOT modify auto-pass detection to depend on `logs.length` — use `execution === null && task.status === 'Done'`
  - Do NOT touch any hook — only modify the JSX rendering in `TaskDetail.tsx`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Conditional rendering change in a single file, no new components
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5 (integration QA)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/TaskDetail.tsx:521` — "No execution data" text that needs conditional replacement
  - `dashboard/src/panels/tasks/TaskDetail.tsx:561` — "No deliverable yet" text that needs conditional replacement
  - `dashboard/src/panels/tasks/TaskDetail.tsx:328` — `useExecution` hook call that provides the `execution` object
  - `dashboard/src/panels/tasks/TaskDetail.tsx:22` — `DELIVERABLE_STATUSES` set definition

  **WHY Each Reference Matters**:
  - Lines 521/561 are the exact locations where empty states render. The auto-pass condition wraps these.
  - Line 328 provides the `execution` variable used in the detection condition.
  - Line 22 shows `DELIVERABLE_STATUSES` includes `Done` — confirming that auto-pass tasks DO show the deliverable section, which is why we need to handle it.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auto-pass task shows explanatory banner
    Tool: Playwright
    Preconditions: Dashboard dev server running at http://localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/3ed3d4c8-8562-4635-9c7e-b5581037c3ab?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for page to load (2 seconds)
      3. Assert: text "Auto-completed" is visible on the page
      4. Assert: text "No execution data" is NOT visible on the page
      5. Assert: text "No deliverable yet" is NOT visible on the page
      6. Assert: text matching "triage" is visible (in the banner explanation)
    Expected Result: Auto-pass task shows contextual banner explaining why there's no execution data.
    Failure Indicators: "No execution data" or "No deliverable yet" still visible. No "Auto-completed" text.
    Evidence: .sisyphus/evidence/task-2-auto-pass-banner.png

  Scenario: Normal task is unaffected by auto-pass logic
    Tool: Playwright
    Preconditions: Dashboard dev server running
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/8debb23e-bb75-470d-8bb7-7fbd0c6d2253?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for page to load (2 seconds)
      3. Assert: text "Auto-completed" is NOT visible
      4. Assert: Execution Metrics section shows real data (tokens, cost, duration)
      5. Assert: Deliverable section shows content
    Expected Result: Normal tasks render as before — no auto-pass banner.
    Failure Indicators: "Auto-completed" banner appears on a task that has execution data.
    Evidence: .sisyphus/evidence/task-2-normal-task-unaffected.png
  ```

  **Commit**: YES (groups with Tasks 1, 3, 4)
  - Message: `fix(dashboard): fix observability panel bugs — actor_type query, auto-pass UX, error display, duration`
  - Files: `dashboard/src/panels/tasks/TaskDetail.tsx`

- [x] 3. Surface feedback events fetch errors inline

  **What to do**:
  - In `dashboard/src/panels/tasks/TaskDetail.tsx`: destructure `error` from the `useFeedbackEvents` hook call (currently at line ~330, only destructures `events`)
  - In the Feedback Events section rendering: when `error` is truthy, show an inline error message instead of "No feedback events". Use pattern: `<p className="text-sm text-red-400">Unable to load feedback events</p>` — similar to how `taskError` is rendered at lines 365-386 but scoped to just this section.
  - When `error` is falsy and `events.length === 0`: continue showing "No feedback events" as before.

  **Must NOT do**:
  - Do NOT add error UI to `useExecution`, `useDeliverable`, or status log sections — only `useFeedbackEvents`
  - Do NOT modify `use-poll.ts` or `postgrestFetch`
  - Do NOT add toast notifications or global error handling
  - Do NOT add retry buttons (keep it simple — just show the error text)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single conditional in one file, trivial JSX change
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5 (integration QA)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/TaskDetail.tsx:330` — `useFeedbackEvents` hook call. Currently: `const { events: feedbackEvents } = useFeedbackEvents(taskId ?? '')`. Change to also destructure `error`: `const { events: feedbackEvents, error: feedbackError } = useFeedbackEvents(taskId ?? '')`
  - `dashboard/src/panels/tasks/TaskDetail.tsx:365-386` — existing `taskError` rendering pattern. Follow this style for the inline error but scoped to the feedback events card.
  - `dashboard/src/hooks/use-feedback-events.ts:16` — the hook already returns `error` from `usePoll`. No hook changes needed.

  **WHY Each Reference Matters**:
  - Line 330 is the exact destructuring that needs to also pull `error`. One change.
  - Lines 365-386 show the styling pattern for error display — red text with error message. Copy this pattern.
  - Line 16 of the hook confirms `error` is already returned — no hook modification needed.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback events shows error when fetch fails (pre-fix for Bug 1)
    Tool: Playwright (network interception)
    Preconditions: Dashboard dev server running. Note: After Bug 1 is fixed, the 400 no longer occurs naturally. To test error display, use Playwright route interception to force a 500 on the feedback_events endpoint.
    Steps:
      1. Intercept requests matching `**/feedback_events**` and respond with status 500, body `{"message":"test error"}`
      2. Navigate to http://localhost:7701/dashboard/tasks/8debb23e-bb75-470d-8bb7-7fbd0c6d2253?tenant=00000000-0000-0000-0000-000000000003
      3. Wait 3 seconds for polling
      4. Assert: text "Unable to load feedback events" is visible in the Feedback Events section
      5. Assert: text "No feedback events" is NOT visible
    Expected Result: Error message displays instead of the default empty state.
    Failure Indicators: "No feedback events" still shows. Error is swallowed silently.
    Evidence: .sisyphus/evidence/task-3-feedback-error-display.png

  Scenario: Feedback events shows normal empty state when no error
    Tool: Playwright
    Preconditions: Dashboard dev server running, Bug 1 already fixed
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/8debb23e-bb75-470d-8bb7-7fbd0c6d2253?tenant=00000000-0000-0000-0000-000000000003
      2. Wait 3 seconds
      3. Assert: text "No feedback events" is visible (task has 0 events, query succeeds)
      4. Assert: text "Unable to load" is NOT visible
    Expected Result: Normal empty state renders when query succeeds but returns no results.
    Evidence: .sisyphus/evidence/task-3-normal-empty-state.png
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)
  - Message: `fix(dashboard): fix observability panel bugs — actor_type query, auto-pass UX, error display, duration`
  - Files: `dashboard/src/panels/tasks/TaskDetail.tsx`

- [x] 4. Fix duration display for auto-pass tasks with null timestamps

  **What to do**:
  - In `dashboard/src/panels/tasks/StatusTimeline.tsx` line 73: the condition `const showTotalDuration = task?.started_at != null && task?.completed_at != null` hides the duration block entirely for auto-pass tasks (both are NULL).
  - Change the logic: when `task.status` is in a terminal state (`Done`, `Failed`, `Cancelled`) AND `started_at` or `completed_at` is null, show "Total duration: < 1s" as a fallback.
  - Implementation: keep existing `showTotalDuration` logic, but add a second condition: `const isTerminalWithNullTimestamps = TERMINAL_STATUSES.has(task?.status ?? '') && (task?.started_at == null || task?.completed_at == null)`. Show the duration block when either `showTotalDuration` or `isTerminalWithNullTimestamps` is true. When `isTerminalWithNullTimestamps`, display `< 1s` as the duration text.
  - `TERMINAL_STATUSES` is already imported/defined in the dashboard — check `dashboard/src/lib/constants.ts` or define inline as `new Set(['Done', 'Failed', 'Cancelled'])`.

  **Must NOT do**:
  - Do NOT change `formatTransitionDuration` — it already handles `< 1s` correctly
  - Do NOT modify the harness to write `started_at`/`completed_at` for auto-pass tasks — that's a backend change, out of scope
  - Do NOT touch StatusTimeline rendering for tasks that HAVE timestamps — only add the fallback

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small conditional logic addition in one file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5 (integration QA)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/StatusTimeline.tsx:73` — the `showTotalDuration` condition that needs a fallback
  - `dashboard/src/panels/tasks/StatusTimeline.tsx:12` — `formatTransitionDuration` function (returns `'< 1s'` for ms === 0)
  - `dashboard/src/lib/constants.ts` — check for `TERMINAL_STATUSES` definition. If not present, define inline.

  **WHY Each Reference Matters**:
  - Line 73 is the exact condition to extend. The current logic excludes auto-pass tasks entirely.
  - Line 12 shows the formatting function already handles the `< 1s` case — no changes needed there.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auto-pass task shows duration "< 1s"
    Tool: Playwright
    Preconditions: Dashboard dev server running
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/3ed3d4c8-8562-4635-9c7e-b5581037c3ab?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for page to load
      3. Assert: text "Total duration" is visible in the Status Timeline section
      4. Assert: text "< 1s" is visible near "Total duration"
    Expected Result: Auto-pass task shows "Total duration: < 1s" instead of hiding the duration entirely.
    Failure Indicators: "Total duration" text is not present. Duration section is hidden.
    Evidence: .sisyphus/evidence/task-4-auto-pass-duration.png

  Scenario: Normal task duration is unaffected
    Tool: Playwright
    Preconditions: Dashboard dev server running
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/8debb23e-bb75-470d-8bb7-7fbd0c6d2253?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for page to load
      3. Assert: text "Total duration: 1m 13s" is visible (this task has real timestamps)
    Expected Result: Normal task still shows accurate duration.
    Failure Indicators: Duration changed from the original value, or "< 1s" shows for a task with real timestamps.
    Evidence: .sisyphus/evidence/task-4-normal-duration-unchanged.png
  ```

  **Commit**: YES (groups with Tasks 1, 2, 3)
  - Message: `fix(dashboard): fix observability panel bugs — actor_type query, auto-pass UX, error display, duration`
  - Files: `dashboard/src/panels/tasks/StatusTimeline.tsx`

- [x] 5. Full integration QA + build verification

  **What to do**:
  - Run `pnpm test -- --run` and verify all tests pass (1486+ passing, 0 new failures)
  - Run `cd dashboard && npx tsc --noEmit` and verify 0 errors
  - Open Playwright and navigate to both test tasks:
    - Task `3ed3d4c8-8562-4635-9c7e-b5581037c3ab` (auto-pass): verify banner, duration, no empty panels
    - Task `8debb23e-bb75-470d-8bb7-7fbd0c6d2253` (normal): verify all sections render, no 400 errors
  - Check browser console for 0 errors (excluding favicon 404)
  - Check network tab: all PostgREST requests return 200
  - Take screenshots of both tasks
  - Commit all changes from Tasks 1-4 as a single commit

  **Must NOT do**:
  - Do NOT make any code changes — this task is verification only (plus the commit)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires Playwright browser automation, build verification, and careful visual inspection
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 6, F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - Task `3ed3d4c8-8562-4635-9c7e-b5581037c3ab` with tenant `00000000-0000-0000-0000-000000000003` — auto-pass test task
  - Task `8debb23e-bb75-470d-8bb7-7fbd0c6d2253` with tenant `00000000-0000-0000-0000-000000000003` — normal execution test task

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: output contains "passed" and no lines with "FAIL" for new test failures
      3. Run: cd /Users/victordozal/repos/dozal-devs/ai-employee/dashboard && npx tsc --noEmit
      4. Assert: exit code 0
    Expected Result: All tests pass, TypeScript compiles cleanly.
    Evidence: .sisyphus/evidence/task-5-build-verification.txt

  Scenario: Both task types render correctly with no errors
    Tool: Playwright
    Steps:
      1. Navigate to auto-pass task: http://localhost:7701/dashboard/tasks/3ed3d4c8-8562-4635-9c7e-b5581037c3ab?tenant=00000000-0000-0000-0000-000000000003
      2. Screenshot full page
      3. Assert: "Auto-completed" banner visible, "Total duration: < 1s" visible, no "No execution data" text
      4. Check console: 0 errors (except favicon 404)
      5. Navigate to normal task: http://localhost:7701/dashboard/tasks/8debb23e-bb75-470d-8bb7-7fbd0c6d2253?tenant=00000000-0000-0000-0000-000000000003
      6. Screenshot full page
      7. Assert: Execution Metrics shows data, Deliverable shows content, no 400 errors in network
      8. Check console: 0 errors about actor_type
    Expected Result: Both task types render correctly with appropriate UX.
    Evidence: .sisyphus/evidence/task-5-auto-pass-final.png, .sisyphus/evidence/task-5-normal-final.png
  ```

  **Commit**: YES
  - Message: `fix(dashboard): fix observability panel bugs — actor_type query, auto-pass UX, error display, duration`
  - Files: `dashboard/src/hooks/use-feedback-events.ts`, `dashboard/src/lib/types.ts`, `dashboard/src/panels/tasks/TaskDetail.tsx`, `dashboard/src/panels/tasks/StatusTimeline.tsx`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Telegram notification

  **What to do**:
  - Send Telegram notification: `npx tsx scripts/telegram-notify.ts "🔧 Dashboard observability fixes complete — actor_type query, auto-pass UX, error display, duration. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 5)
  - **Blocks**: —
  - **Blocked By**: Task 5

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `cd dashboard && npx tsc --noEmit` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
      Start from clean state. Open dashboard at `http://localhost:7701/dashboard/`. Navigate to task `3ed3d4c8-8562-4635-9c7e-b5581037c3ab?tenant=00000000-0000-0000-0000-000000000003` (auto-pass task) — verify banner shows, no empty panels. Navigate to task `8debb23e-bb75-470d-8bb7-7fbd0c6d2253?tenant=00000000-0000-0000-0000-000000000003` (normal task) — verify all sections render, no 400 errors in network tab. Save screenshots to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Group      | Message                                                                                                  | Files                                                                                                                                                                    | Pre-commit           |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| All 4 bugs | `fix(dashboard): fix observability panel bugs — actor_type query, auto-pass UX, error display, duration` | `dashboard/src/hooks/use-feedback-events.ts`, `dashboard/src/lib/types.ts`, `dashboard/src/panels/tasks/TaskDetail.tsx`, `dashboard/src/panels/tasks/StatusTimeline.tsx` | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run  # Expected: 1486+ passed, 0 new failures
cd dashboard && npx tsc --noEmit  # Expected: 0 errors
```

### Final Checklist

- [ ] No PostgREST 400 errors in browser console
- [ ] Auto-pass tasks show explanatory banner
- [ ] Feedback events section shows error state on fetch failure
- [ ] Duration display handles null timestamps
- [ ] All "Must NOT Have" guardrails respected
