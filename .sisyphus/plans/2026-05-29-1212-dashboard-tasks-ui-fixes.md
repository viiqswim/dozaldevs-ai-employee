# Dashboard Tasks UI Fixes

## TL;DR

> **Quick Summary**: Fix 4 dashboard issues — broken timestamps showing "just now" for all tasks (UTC parsing bug), add execution/delivery cost breakdown columns, stop wasteful polling on terminal task states, and simplify the employee activity tab to a link to the tasks page.
>
> **Deliverables**:
>
> - Fixed `formatRelativeTime` with UTC-safe date parsing
> - Cost breakdown columns (Exec Cost, Delivery Cost, Total) on tasks list and task detail pages
> - `usePoll` hook with `enabled` parameter to stop polling on terminal states
> - Activity tab navigates directly to filtered tasks page (ActivitySection deleted)
> - Unit tests for `formatRelativeTime` and `usePoll`
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves + final
> **Critical Path**: Task 1 (usePoll) → Task 3 (stop polling in TaskDetail) → Task 5 (cost on TaskDetail)

---

## Context

### Original Request

User reported 4 issues on the dashboard:

1. Tasks list page shows "just now" for all task timestamps, even for tasks created hours ago
2. Cost column shows a single total — no breakdown by execution vs delivery phase
3. Task detail page keeps polling (heartbeat, logs, executions, etc.) even when task is Done/Failed/Cancelled
4. Employee activity tab (`?tab=activity`) uses a completely different UI than the tasks page — card layout vs table

### Interview Summary

**Key Discussions**:

- Cost breakdown: User wants extra table columns (Exec Cost, Delivery Cost) alongside existing Total — confirmed for both tasks list page and task detail page
- Activity tab: User chose "just link to tasks page" — remove the card layout, keep stats, add a filtered link
- Test strategy: Unit tests after implementation for `formatRelativeTime` and `usePoll`

**Research Findings**:

- **Timestamp root cause confirmed**: PostgREST returns `created_at` as `"2026-05-29T17:01:45.604"` (no `Z` suffix). JS `new Date()` parses this as local time (MDT = UTC-5), producing a future timestamp. `diffSec` becomes negative → falls through to `< 60` check → returns "just now" for everything. Proof: `new Date("2026-05-29T17:01:45.604")` → `2026-05-29T22:01:45.604Z` (shifted 5 hours into future).
- **Cost data available**: `executions` table has `phase` field ("execution" | "delivery") + `estimated_cost_usd`. Current query only selects `estimated_cost_usd` — just need to add `phase` to the select.
- **Polling is unconditional**: `usePoll` in `use-poll.ts` fires `setInterval(5s)` forever. TaskDetail has 6 concurrent polls. `TERMINAL_STATUSES` constant already exists.
- **Employee filter already works**: TaskFeed reads `?employee=<archetypeId>` from URL params and filters by `archetype_id`. No new filter logic needed.
- **8 call sites** for `formatRelativeTime` across the dashboard — all pass PostgREST timestamps (same timezone-less format). Existing test uses `.toISOString()` which has `Z`.

### Metis Review

**Identified Gaps** (addressed):

- `formatRelativeTime` fix must guard against double-appending `Z` for timestamps that already have a timezone indicator — addressed with `if (!dateStr.endsWith('Z') && !dateStr.includes('+'))` guard
- `usePoll` `enabled` parameter must be applied selectively to TaskDetail's 6 polls — only polls that fetch data which won't change after terminal state should stop
- `Decimal` from PostgREST is returned as string — per-phase cost split must handle string-to-number coercion (same pattern as existing reduce)
- ActivitySection stats (Hours of Work Done) must be preserved when simplifying the component
- Edge case: tasks with zero executions, or only delivery executions — cost columns must show `—` not crash

---

## Work Objectives

### Core Objective

Fix 4 dashboard UX issues to improve data accuracy (timestamps, cost breakdown), reduce client-side resource waste (polling), and simplify the UI (activity tab unification).

### Concrete Deliverables

- `dashboard/src/lib/utils.ts` — fixed `formatRelativeTime` with UTC-safe parsing
- `dashboard/src/hooks/use-poll.ts` — `enabled` parameter added
- `dashboard/src/panels/tasks/TaskFeed.tsx` — cost breakdown columns (Exec Cost, Delivery Cost, Total)
- `dashboard/src/panels/tasks/TaskDetail.tsx` — cost breakdown display + stopped polling on terminal states
- `dashboard/src/panels/employees/sections/ActivitySection.tsx` — DELETED (no longer needed)
- `dashboard/src/panels/employees/EmployeeDetail.tsx` — Activity tab changed to direct navigation
- `dashboard/src/lib/types.ts` — updated `Task` type to include `phase` in executions join
- `dashboard/src/tests/` — unit tests for `formatRelativeTime` and `usePoll`

### Definition of Done

- [ ] No task on the tasks page shows "just now" when it was created > 60 seconds ago
- [ ] Tasks page shows 3 cost columns: Exec Cost, Delivery Cost, Total
- [ ] Task detail page shows cost breakdown (execution vs delivery)
- [ ] Task detail page stops all polling within 10s of reaching Done/Failed/Cancelled
- [ ] Employee Activity tab click navigates directly to tasks page filtered by employee
- [ ] Unit tests pass for `formatRelativeTime` and `usePoll`
- [ ] `pnpm build` succeeds with zero new errors

### Must Have

- UTC-safe date parsing in `formatRelativeTime` (append `Z` if missing timezone indicator)
- `enabled` parameter on `usePoll` that prevents `setInterval` from firing when `false`
- Per-phase cost split using `executions.phase` field
- Activity tab click navigates to `/dashboard/tasks?employee=<archetypeId>&tenant=<tenantId>` — no intermediate panel
- `ActivitySection.tsx` deleted entirely (no dead code)

### Must NOT Have (Guardrails)

- **No backend changes** — no PostgREST schema changes, no Prisma migrations, no gateway changes
- **No `usePoll` refactoring** beyond adding `enabled` — no backoff, no retry logic, no error handling changes
- **No new filtering UI** on the tasks page — the `?employee=` param already works
- **No cost columns on ActivitySection** — it's being replaced entirely
- **No changes to polling interval** — keep `POLL_INTERVAL_MS = 5000`
- **Do not double-append `Z`** — guard against timestamps that already have timezone info
- **Do not touch PostgREST configuration** to add timezone suffixes server-side

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after
- **Framework**: Vitest + React Testing Library (for `usePoll` hook test)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot
- **Library/Module**: Use Bash (node REPL or vitest) — import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.

```
Wave 1 (Start Immediately — independent fixes, MAX PARALLEL):
├── Task 1: Add `enabled` param to usePoll hook [quick]
├── Task 2: Fix formatRelativeTime UTC parsing [quick]
├── Task 4: Simplify ActivitySection to stats + link [quick]
├── Task 6: Unit tests for formatRelativeTime [quick]
└── Task 7: Unit tests for usePoll [quick]

Wave 2 (After Wave 1 — depends on usePoll fix):
├── Task 3: Stop polling on terminal states in TaskDetail [quick]
├── Task 5: Add cost breakdown columns to TaskFeed + TaskDetail [visual-engineering]
└── Task 8: Dashboard build verification [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 3, 7   | 1    |
| 2    | —          | 6      | 1    |
| 3    | 1          | —      | 2    |
| 4    | —          | —      | 1    |
| 5    | —          | —      | 2    |
| 6    | 2          | —      | 1    |
| 7    | 1          | —      | 1    |
| 8    | 1-7        | —      | 2    |

### Agent Dispatch Summary

- **Wave 1**: **5 tasks** — T1 `quick`, T2 `quick`, T4 `quick`, T6 `quick`, T7 `quick`
- **Wave 2**: **3 tasks** — T3 `quick`, T5 `visual-engineering`, T8 `quick`
- **FINAL**: **4 tasks** — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Add `enabled` parameter to `usePoll` hook

  **What to do**:
  - Edit `dashboard/src/hooks/use-poll.ts`
  - Add an optional `enabled` parameter (default `true`) to the `usePoll` function signature: `usePoll<T>(fetchFn, intervalMs, enabled = true)`
  - When `enabled` is `false`: do NOT call `execute()` on mount, do NOT set up `setInterval`, return stale `data` (keep whatever was last fetched)
  - When `enabled` flips from `true` → `false`: the `useEffect` cleanup clears the interval (standard React pattern — the effect depends on `enabled`)
  - When `enabled` flips from `false` → `true`: re-execute immediately and restart the interval
  - Update the `useEffect` dependency array to include `enabled`
  - Update the `UsePollResult` interface if needed (no new fields required)

  **Must NOT do**:
  - Do NOT add backoff, retry, or error handling logic
  - Do NOT change the polling interval
  - Do NOT rename existing parameters
  - Do NOT add loading state changes when `enabled` flips

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4, 6, 7)
  - **Blocks**: Tasks 3, 7
  - **Blocked By**: None

  **References**:
  - `dashboard/src/hooks/use-poll.ts` (entire file, 48 lines) — the hook to modify. Lines 11-14: signature. Lines 41-45: the `useEffect` with `setInterval` that needs the `enabled` guard.
  - `dashboard/src/lib/constants.ts` — `POLL_INTERVAL_MS = 5000`, `TERMINAL_STATUSES` — these constants already exist, no need to create new ones.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: usePoll with enabled=true fires callback
    Tool: Bash (node/vitest)
    Steps:
      1. Import usePoll in a test, pass a mock fetchFn and enabled=true
      2. Wait 100ms
      3. Assert fetchFn was called at least once
    Expected Result: fetchFn called on mount
    Evidence: .sisyphus/evidence/task-1-enabled-true.txt

  Scenario: usePoll with enabled=false does NOT fire callback
    Tool: Bash (node/vitest)
    Steps:
      1. Import usePoll in a test, pass a mock fetchFn and enabled=false
      2. Wait 200ms
      3. Assert fetchFn was never called
    Expected Result: fetchFn not called
    Evidence: .sisyphus/evidence/task-1-enabled-false.txt
  ```

  **Commit**: YES
  - Message: `fix(dashboard): add enabled param to usePoll hook`
  - Files: `dashboard/src/hooks/use-poll.ts`

- [x] 2. Fix `formatRelativeTime` UTC timezone parsing

  **What to do**:
  - Edit `dashboard/src/lib/utils.ts`, function `formatRelativeTime` (lines 8-22)
  - Before `const date = new Date(dateStr)`, add a UTC normalization step:
    - If `dateStr` does NOT end with `Z` AND does NOT contain `+` or a timezone offset pattern, append `Z` to force UTC interpretation
    - Guard: `const normalized = /[Z+\-]\d{0,4}$/.test(dateStr) ? dateStr : dateStr + 'Z';`
    - Then: `const date = new Date(normalized);`
  - Also handle edge case: if `dateStr` is null/undefined/empty, return `'—'` immediately (defensive guard)
  - Also handle edge case: if `diffSec < 0` (future timestamp due to clock skew), treat as `'just now'` rather than showing negative times
  - Do NOT change any other function in `utils.ts`

  **Must NOT do**:
  - Do NOT double-append `Z` to timestamps that already have timezone info
  - Do NOT change the function signature
  - Do NOT change the return strings for any time range other than the negative/zero case
  - Do NOT touch `formatDuration`, `formatWorkMinutes`, or `formatCostUsd`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 4, 6, 7)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `dashboard/src/lib/utils.ts:8-22` — the function to fix. Line 9: `new Date(dateStr)` is where the bug manifests. The fix goes before this line.
  - PostgREST returns: `"2026-05-29T17:01:45.604"` (no `Z`). JS parses this as local time → future timestamp → negative diff → "just now".
  - Existing test: `dashboard/src/tests/smoke.test.tsx:20-22` — passes `new Date().toISOString()` which HAS `Z`. The fix must not break this existing test.
  - All 8 call sites in the dashboard pass PostgREST timestamps (no `Z`): `TaskFeed.tsx:351`, `StatusTimeline.tsx:144`, `ActivitySection.tsx:135`, `TenantOverview.tsx:166,319`, `TrainingTab.tsx:274`, `RulesPanel.tsx:437,619`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Timestamp without Z is parsed correctly
    Tool: Bash (node)
    Steps:
      1. Call formatRelativeTime("2026-05-29T12:00:00") — a past UTC time
      2. Assert result is NOT "just now" (should be hours/days ago)
    Expected Result: Returns a relative time like "Xh ago" or "Xd ago", NOT "just now"
    Evidence: .sisyphus/evidence/task-2-no-z-parsing.txt

  Scenario: Timestamp with Z still works
    Tool: Bash (node)
    Steps:
      1. Call formatRelativeTime(new Date(Date.now() - 120000).toISOString()) — 2 minutes ago with Z
      2. Assert result is "2m ago"
    Expected Result: "2m ago"
    Evidence: .sisyphus/evidence/task-2-with-z-parsing.txt

  Scenario: Null/empty input returns dash
    Tool: Bash (node)
    Steps:
      1. Call formatRelativeTime("") and formatRelativeTime(null as any)
      2. Assert both return "—"
    Expected Result: "—" for invalid inputs
    Evidence: .sisyphus/evidence/task-2-null-guard.txt
  ```

  **Commit**: YES
  - Message: `fix(dashboard): fix UTC timezone parsing in formatRelativeTime`
  - Files: `dashboard/src/lib/utils.ts`

- [x] 3. Stop polling on terminal task states in TaskDetail

  **What to do**:
  - Edit `dashboard/src/panels/tasks/TaskDetail.tsx`
  - Derive an `isTerminal` boolean: `const isTerminal = task ? TERMINAL_STATUSES.includes(task.status as any) : false;`
  - Pass `enabled={!isTerminal}` to EACH of the following `usePoll` calls:
    - Line 274: `usePoll(fetchTask)` → `usePoll(fetchTask, POLL_INTERVAL_MS, !isTerminal)` — **EXCEPTION**: This one should KEEP polling until the task reaches terminal state, so it needs special handling. It should always be enabled, OR use its own `enabled` that only stops AFTER it has fetched a terminal status. Simplest: keep this one always enabled — once it fetches a terminal task, the other 5 polls will stop on the next render via `isTerminal` flipping to `true`.
    - Line 276: `usePoll(fetchLogs)` → `usePoll(fetchLogs, POLL_INTERVAL_MS, !isTerminal)`
    - Line 285: `usePoll(fetchApprovals)` → `usePoll(fetchApprovals, POLL_INTERVAL_MS, !isTerminal)`
  - Edit `dashboard/src/hooks/use-execution.ts` — add `enabled` parameter, pass through to inner `usePoll` call. Update the hook signature: `useExecution(taskId: string, enabled?: boolean)`
  - Edit `dashboard/src/hooks/use-deliverable.ts` — same pattern: add `enabled` parameter, pass through to inner `usePoll`
  - Edit `dashboard/src/hooks/use-feedback-events.ts` — same pattern: add `enabled` parameter, pass through to inner `usePoll`
  - Back in `TaskDetail.tsx`, pass `enabled={!isTerminal}` to: `useExecution(taskId, !isTerminal)`, `useDeliverable(taskId, !isTerminal)`, `useFeedbackEvents(taskId, !isTerminal)`
  - Import `POLL_INTERVAL_MS` if not already imported

  **Must NOT do**:
  - Do NOT stop the main `fetchTask` poll — it needs to detect terminal state transitions
  - Do NOT change any hook logic beyond passing through the `enabled` parameter
  - Do NOT add loading indicators or state changes when polling stops

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 8)
  - **Blocks**: None
  - **Blocked By**: Task 1 (usePoll `enabled` param must exist first)

  **References**:
  - `dashboard/src/panels/tasks/TaskDetail.tsx:270-292` — the 6 `usePoll` call sites to update. Line 274 is the main task poll (keep enabled). Lines 276, 285 are direct `usePoll` calls. Lines 287-289 are hooks wrapping `usePoll`.
  - `dashboard/src/hooks/use-execution.ts` — wraps `usePoll` internally. Add `enabled` as pass-through param.
  - `dashboard/src/hooks/use-deliverable.ts` — wraps `usePoll` internally. Same pattern.
  - `dashboard/src/hooks/use-feedback-events.ts` — wraps `usePoll` internally. Same pattern.
  - `dashboard/src/lib/constants.ts` — `TERMINAL_STATUSES = ['Done', 'Failed', 'Cancelled']` and `POLL_INTERVAL_MS = 5000`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Done task stops polling after page load
    Tool: Playwright
    Preconditions: A task in Done state exists (use any recent Done task from VLRE tenant)
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/<done-task-id>?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for page to load (task status shows "Done")
      3. Open browser Network tab monitoring (or use page.waitForRequest)
      4. Wait 15 seconds
      5. Count PostgREST requests after initial load
    Expected Result: After the initial data load, at most 1 polling request occurs (the main fetchTask poll). The 5 subsidiary polls (logs, approvals, execution, deliverable, feedback) should NOT fire.
    Failure Indicators: More than 2 PostgREST requests in the 15s window after initial load
    Evidence: .sisyphus/evidence/task-3-polling-stopped.txt

  Scenario: Active task continues polling normally
    Tool: Playwright
    Preconditions: A task in Executing or Reviewing state
    Steps:
      1. Navigate to the task detail page
      2. Wait 15 seconds
      3. Count PostgREST requests
    Expected Result: Multiple polling requests fire (at least 3 cycles of 5s = at least 3 requests)
    Evidence: .sisyphus/evidence/task-3-polling-active.txt
  ```

  **Commit**: YES
  - Message: `fix(dashboard): stop polling on terminal task states`
  - Files: `dashboard/src/panels/tasks/TaskDetail.tsx`, `dashboard/src/hooks/use-execution.ts`, `dashboard/src/hooks/use-deliverable.ts`, `dashboard/src/hooks/use-feedback-events.ts`

- [x] 4. Make Activity tab navigate directly to filtered tasks page

  **What to do**:
  - Edit `dashboard/src/panels/employees/EmployeeDetail.tsx` — this is where the tabs are defined and rendered
  - Find the Activity tab definition (the tab trigger for `?tab=activity`)
  - Instead of rendering `<ActivitySection>` when the activity tab is selected, make the Activity tab a direct navigation link to `/dashboard/tasks?employee=${archetype.id}&tenant=${tenantId}`
  - Implementation approach: intercept the tab click for "activity" and use React Router's `navigate()` to go to the tasks page. OR render the tab trigger as a `<Link>` instead of a tab panel trigger.
  - The key behavior: clicking "Activity" on the employee page should immediately take you to the tasks page filtered to that employee — no intermediate panel, no extra clicks
  - **Delete** `dashboard/src/panels/employees/sections/ActivitySection.tsx` entirely — it is no longer used
  - Remove the `ActivitySection` import from `EmployeeDetail.tsx`
  - Clean up any other imports or references to `ActivitySection` across the codebase

  **Must NOT do**:
  - Do NOT keep ActivitySection as a component (delete it)
  - Do NOT render any content panel for the Activity tab — it's a navigation action, not a tab panel
  - Do NOT change other tabs (Overview, Training, Knowledge Base, etc.)
  - Do NOT change the TaskFeed component — it already supports `?employee=` filtering

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 6, 7)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx` — parent component with the tabs. Find where `<ActivitySection>` is rendered (around line 461-465) and where the tab triggers are defined. This is the main file to modify.
  - `dashboard/src/panels/employees/sections/ActivitySection.tsx` (entire file, 191 lines) — DELETE this file entirely.
  - `dashboard/src/panels/tasks/TaskFeed.tsx:57` — confirms `?employee=` is the URL param that TaskFeed reads for employee filtering. The Activity tab link should use this param.
  - Check for other imports of `ActivitySection` via grep before deleting — ensure no other file references it.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Activity tab navigates to filtered tasks page
    Tool: Playwright
    Preconditions: pnpm dev running, VLRE tenant has tasks
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/94b1e64c-2c2a-4391-a6e3-f3ef61044cb5?tenant=00000000-0000-0000-0000-000000000003
      2. Find the "Activity" tab
      3. Click it
      4. Assert the browser URL is now /dashboard/tasks with employee=94b1e64c-2c2a-4391-a6e3-f3ef61044cb5 and tenant= query params
      5. Assert the tasks table is visible and filtered to this employee
    Expected Result: Clicking Activity tab immediately navigates to the tasks page filtered to this employee
    Failure Indicators: An intermediate panel renders, or URL doesn't contain employee= param, or card-per-task layout appears
    Evidence: .sisyphus/evidence/task-4-activity-navigates.png

  Scenario: ActivitySection.tsx is deleted
    Tool: Bash
    Steps:
      1. ls dashboard/src/panels/employees/sections/ActivitySection.tsx
      2. Assert file does NOT exist (exit code 2 / "No such file")
      3. grep -r "ActivitySection" dashboard/src/ — assert zero matches
    Expected Result: File deleted, no references remain
    Evidence: .sisyphus/evidence/task-4-file-deleted.txt
  ```

  **Commit**: YES
  - Message: `refactor(dashboard): make Activity tab navigate to filtered tasks page`
  - Files: `dashboard/src/panels/employees/EmployeeDetail.tsx`, `dashboard/src/panels/employees/sections/ActivitySection.tsx` (deleted)

- [x] 5. Add cost breakdown columns to TaskFeed and TaskDetail

  **What to do**:

  **Part A: Update types** (`dashboard/src/lib/types.ts`)
  - Find the `Task` type's `executions` field (line ~46). Currently: `executions?: { estimated_cost_usd: number | null }[] | null`
  - Add `phase`: `executions?: { estimated_cost_usd: number | null; phase: string | null }[] | null`

  **Part B: Update TaskFeed** (`dashboard/src/panels/tasks/TaskFeed.tsx`)
  - Update PostgREST select queries to include `phase`:
    - Line 131: `select: '*,archetypes(role_name,model),executions(estimated_cost_usd,phase)'`
    - Line 155 (cost stats query): `select: 'created_at,executions(estimated_cost_usd,phase)'`
  - Add two new table header columns before the existing "Cost" header (which becomes "Total"):
    - `<TableHead className="text-right">Exec Cost</TableHead>`
    - `<TableHead className="text-right">Delivery Cost</TableHead>`
    - Rename existing "Cost" to "Total"
  - Add cost calculation helper (above the return, or inline):
    ```
    const execCost = task.executions?.filter(e => e.phase === 'execution').reduce((s, e) => s + parseFloat(String(e.estimated_cost_usd ?? 0)), 0) ?? 0;
    const deliveryCost = task.executions?.filter(e => e.phase === 'delivery').reduce((s, e) => s + parseFloat(String(e.estimated_cost_usd ?? 0)), 0) ?? 0;
    const totalCost = execCost + deliveryCost;
    ```
  - Render the three cost cells using `formatCostUsd` (already imported at line 18):
    - `<TableCell className="text-right">{formatCostUsd(execCost)}</TableCell>`
    - `<TableCell className="text-right">{formatCostUsd(deliveryCost)}</TableCell>`
    - `<TableCell className="text-right">{formatCostUsd(totalCost)}</TableCell>`
  - Update the stat cards "Total Employee Cost" calculation to use the same sum pattern
  - Update the `SkeletonRow` to render 8 cells instead of 6 (adding 2 more for cost columns)

  **Part C: Update TaskDetail** (`dashboard/src/panels/tasks/TaskDetail.tsx`)
  - Find where cost is displayed in the task detail view
  - Add execution cost vs delivery cost breakdown. If cost is shown as a single value, split it into: "Execution: $X.XXXX | Delivery: $X.XXXX | Total: $X.XXXX"
  - The `useExecution` hook already fetches `estimated_cost_usd` per execution row. Check if it also fetches `phase` — if not, add `phase` to its PostgREST select
  - If the task detail shows a single execution's cost, update to show the aggregated breakdown across all execution rows for this task

  **Must NOT do**:
  - Do NOT change the PostgREST schema or Prisma model
  - Do NOT add cost breakdown to ActivitySection (it's being simplified)
  - Do NOT change the `formatCostUsd` function
  - Do NOT use inline `toFixed(4)` — use `formatCostUsd` consistently

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 8)
  - **Blocks**: None
  - **Blocked By**: None (independent of usePoll changes)

  **References**:
  - `dashboard/src/lib/types.ts:46` — `Task` type `executions` field to update with `phase`
  - `dashboard/src/panels/tasks/TaskFeed.tsx:128-139` — PostgREST query to update (add `phase` to select). Lines 331-365: table headers and row rendering to add columns.
  - `dashboard/src/panels/tasks/TaskFeed.tsx:357-361` — current cost rendering (inline IIFE with `toFixed(4)`). Replace with `formatCostUsd` and split by phase.
  - `dashboard/src/panels/tasks/TaskDetail.tsx` — find cost display section and add breakdown
  - `dashboard/src/hooks/use-execution.ts` — check if it fetches `phase` from PostgREST. If not, add to select.
  - `dashboard/src/lib/utils.ts:43-47` — `formatCostUsd` function to use for consistent formatting
  - `prisma/schema.prisma:62-90` — `Execution` model confirms `phase` field exists: `phase String @default("execution")`
  - **PostgREST Decimal note**: `estimated_cost_usd` is `Decimal(10,4)` in Prisma. PostgREST returns it as a string (e.g. `"0.0023"`). Must use `parseFloat(String(...))` for arithmetic.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tasks list shows 3 cost columns
    Tool: Playwright
    Preconditions: pnpm dev running, VLRE tenant has tasks with executions
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks?from=2026-04-29&to=2026-05-29&tenant=00000000-0000-0000-0000-000000000003
      2. Assert table headers include "Exec Cost", "Delivery Cost", "Total"
      3. Find a row where Total is non-zero
      4. Assert Exec Cost + Delivery Cost = Total (within $0.0001 tolerance)
    Expected Result: Three cost columns visible, values are consistent
    Failure Indicators: Only one "Cost" column, or values don't sum correctly
    Evidence: .sisyphus/evidence/task-5-cost-columns.png

  Scenario: Task with only execution cost shows zero delivery
    Tool: Playwright
    Steps:
      1. Find a task that has execution rows but no delivery rows (e.g. a Failed task that never reached delivery)
      2. Assert Exec Cost > $0, Delivery Cost = "—" or $0.0000, Total = Exec Cost
    Expected Result: Delivery cost shows — or $0, total matches exec cost
    Evidence: .sisyphus/evidence/task-5-no-delivery-cost.png

  Scenario: Task detail page shows cost breakdown
    Tool: Playwright
    Steps:
      1. Navigate to a specific task detail page
      2. Assert cost section shows Execution, Delivery, and Total values
    Expected Result: Cost breakdown visible on task detail
    Evidence: .sisyphus/evidence/task-5-detail-cost.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add cost breakdown columns to tasks list and detail`
  - Files: `dashboard/src/panels/tasks/TaskFeed.tsx`, `dashboard/src/panels/tasks/TaskDetail.tsx`, `dashboard/src/lib/types.ts`, `dashboard/src/hooks/use-execution.ts`

- [x] 6. Unit tests for `formatRelativeTime`

  **What to do**:
  - Create or update test file: `dashboard/src/tests/format-relative-time.test.ts`
  - Test cases:
    1. **UTC string without Z** (PostgREST format): `formatRelativeTime("2020-01-01T12:00:00")` → should NOT return "just now" (it's years ago)
    2. **UTC string with Z** (ISO format): `formatRelativeTime(new Date(Date.now() - 120000).toISOString())` → should return "2m ago"
    3. **Recent timestamp (< 60s)**: `formatRelativeTime(new Date(Date.now() - 30000).toISOString())` → should return "just now"
    4. **Hours ago**: `formatRelativeTime(new Date(Date.now() - 3600000 * 3).toISOString())` → should return "3h ago"
    5. **Days ago**: `formatRelativeTime(new Date(Date.now() - 86400000 * 2).toISOString())` → should return "2d ago"
    6. **Null/empty guard**: `formatRelativeTime("")` → should return "—"
    7. **Existing smoke test still passes**: verify `smoke.test.tsx` doesn't break

  **Must NOT do**:
  - Do NOT modify the `formatRelativeTime` function (that's Task 2)
  - Do NOT add Playwright or integration tests here (unit only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 7) — but should run AFTER Task 2 completes
  - **Blocks**: None
  - **Blocked By**: Task 2 (the function fix must be in place)

  **References**:
  - `dashboard/src/lib/utils.ts:8-22` — the function under test
  - `dashboard/src/tests/smoke.test.tsx:20-22` — existing test to verify still passes
  - `dashboard/vitest.config.ts` or `dashboard/package.json` — test runner config

  **Acceptance Criteria**:
  - [ ] All 7 test cases pass
  - [ ] Existing `smoke.test.tsx` still passes
  - [ ] `cd dashboard && pnpm test -- --run` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Run format-relative-time tests
    Tool: Bash
    Steps:
      1. cd dashboard && pnpm test -- --run src/tests/format-relative-time.test.ts
      2. Assert exit code 0
      3. Assert all 7 tests pass
    Expected Result: 7 tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-6-unit-tests.txt
  ```

  **Commit**: YES (groups with Task 7)
  - Message: `test(dashboard): add unit tests for formatRelativeTime and usePoll`
  - Files: `dashboard/src/tests/format-relative-time.test.ts`, `dashboard/src/tests/use-poll.test.ts`

- [x] 7. Unit tests for `usePoll` hook

  **What to do**:
  - Create test file: `dashboard/src/tests/use-poll.test.ts`
  - Use `@testing-library/react` `renderHook` to test the hook
  - Test cases:
    1. **enabled=true (default)**: Hook calls fetchFn on mount and on interval
    2. **enabled=false**: Hook does NOT call fetchFn at all
    3. **enabled flips true→false**: Interval clears, no more calls
    4. **enabled flips false→true**: fetchFn is called immediately, interval restarts
    5. **document.hidden skip**: When tab is hidden, fetchFn is not called on interval tick
  - Use `vi.useFakeTimers()` to control `setInterval` timing
  - Use `vi.fn()` for the fetchFn mock

  **Must NOT do**:
  - Do NOT modify the `usePoll` hook (that's Task 1)
  - Do NOT add Playwright tests here

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 6) — but should run AFTER Task 1 completes
  - **Blocks**: None
  - **Blocked By**: Task 1 (the hook must have `enabled` param)

  **References**:
  - `dashboard/src/hooks/use-poll.ts` (entire file, 48 lines) — the hook under test
  - `dashboard/src/lib/constants.ts` — `POLL_INTERVAL_MS = 5000`
  - Check if `@testing-library/react` is already a devDependency in `dashboard/package.json`. If not, it needs to be added.

  **Acceptance Criteria**:
  - [ ] All 5 test cases pass
  - [ ] `cd dashboard && pnpm test -- --run` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Run use-poll tests
    Tool: Bash
    Steps:
      1. cd dashboard && pnpm test -- --run src/tests/use-poll.test.ts
      2. Assert exit code 0
      3. Assert all 5 tests pass
    Expected Result: 5 tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-7-unit-tests.txt
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `test(dashboard): add unit tests for formatRelativeTime and usePoll`
  - Files: `dashboard/src/tests/use-poll.test.ts`

- [x] 8. Dashboard build verification

  **What to do**:
  - Run `cd dashboard && pnpm build` and verify zero new errors
  - Run `cd dashboard && pnpm test -- --run` and verify all tests pass (including new ones from Tasks 6, 7)
  - If either fails, identify and fix the issue (likely a type error or import issue from the preceding tasks)

  **Must NOT do**:
  - Do NOT make functional changes — this is verification only
  - Do NOT skip fixing build errors if they exist

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (runs after all Wave 1 tasks)
  - **Blocks**: Final Wave
  - **Blocked By**: Tasks 1-7

  **References**:
  - `dashboard/package.json` — build and test scripts
  - `dashboard/tsconfig.json` — TypeScript config

  **Acceptance Criteria**:
  - [ ] `cd dashboard && pnpm build` exits 0
  - [ ] `cd dashboard && pnpm test -- --run` exits 0, all tests pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard builds cleanly
    Tool: Bash
    Steps:
      1. cd dashboard && pnpm build
      2. Assert exit code 0
      3. No TypeScript errors in output
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-8-build.txt

  Scenario: All dashboard tests pass
    Tool: Bash
    Steps:
      1. cd dashboard && pnpm test -- --run
      2. Assert exit code 0
      3. Assert new tests (format-relative-time, use-poll) are included
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-8-tests.txt
  ```

  **Commit**: NO (verification only, no code changes expected)

- [x] 9. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**:
  - After all F1-F4 reviews pass and user gives explicit okay:
  - Run: `tsx scripts/telegram-notify.ts "✅ dashboard-tasks-ui-fixes complete — All 4 dashboard issues fixed. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` (dashboard) + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration: timestamps correct AND cost columns visible AND polling stopped AND activity tab simplified — all on the same page load. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                  | Files                                                                                | Pre-commit           |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------- |
| 1      | `fix(dashboard): add enabled param to usePoll hook`                      | `use-poll.ts`                                                                        | `pnpm build`         |
| 2      | `fix(dashboard): fix UTC timezone parsing in formatRelativeTime`         | `utils.ts`                                                                           | `pnpm build`         |
| 3      | `fix(dashboard): stop polling on terminal task states`                   | `TaskDetail.tsx`, `use-execution.ts`, `use-deliverable.ts`, `use-feedback-events.ts` | `pnpm build`         |
| 4      | `refactor(dashboard): make Activity tab navigate to filtered tasks page` | `EmployeeDetail.tsx`, `ActivitySection.tsx` (deleted)                                | `pnpm build`         |
| 5      | `feat(dashboard): add cost breakdown columns to tasks list and detail`   | `TaskFeed.tsx`, `TaskDetail.tsx`, `types.ts`                                         | `pnpm build`         |
| 6      | `test(dashboard): add unit tests for formatRelativeTime and usePoll`     | test files                                                                           | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
cd dashboard && pnpm build   # Expected: Build succeeds with zero new errors
pnpm test -- --run            # Expected: All tests pass including new ones
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Dashboard builds successfully
- [ ] All unit tests pass
- [ ] Playwright QA verifies all 4 fixes
