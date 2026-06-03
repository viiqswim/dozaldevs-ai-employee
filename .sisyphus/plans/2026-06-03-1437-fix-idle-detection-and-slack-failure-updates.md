# Fix Premature Idle Detection, Slack Failure Notifications & Task Re-run

## TL;DR

> **Quick Summary**: Fix two bugs (premature idle detection kills tasks, Slack stays on "Received" after failure), improve task input visibility on the dashboard, and add a "Re-run with editable inputs" button so failed tasks can be re-triggered with the same (or tweaked) inputs.
>
> **Deliverables**:
>
> - Increased `minElapsedMs` from 10s to 60s for main execution sessions
> - Increased `minElapsedMs` from 10s to 30s for delivery sessions
> - Slack notification update in `markFailed()` so failures are visible in Slack
> - Trigger Payload section moved higher on task detail page
> - Re-run button with editable inputs modal on task detail page (manual triggers only)
> - Docker image rebuild + end-to-end verification
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves (5 parallel tasks in Wave 1)
> **Critical Path**: Tasks 1-3 (parallel) → Task 6 (rebuild + verify)

---

## Context

### Original Request

Engineer AI employee task `197a00dc` failed after only 33 seconds. Investigation revealed the session-manager's idle detection fired before the model (`xiaomi/mimo-v2.5-pro`) produced its first token (TTFT ~23s). Additionally, the Slack notification remained stuck on "Received" because the lifecycle's `mark-failed` step never ran (Inngest Dev Server restarted mid-execution).

### Interview Summary

**Key Discussions**:

- Root cause: `minElapsedMs: 10_000` in `opencode-harness.mts` line 1011 is too aggressive for slow models
- The session-manager detects "idle" before the model responds, declares session "completed" prematurely
- The harness's `markFailed()` function doesn't update Slack — only the lifecycle does, but it depends on Inngest polling
- User wants both issues fixed

**Research Findings**:

- `NOTIFY_MSG_CHANNEL` does NOT exist as an env var in the harness — must use `NOTIFICATION_CHANNEL` instead
- `markFailed()` is async and properly awaited — best insertion point for Slack update
- The SIGTERM handler is fire-and-forget — Slack update there is risky, accept that SIGTERM kills rely on lifecycle polling
- Delivery containers also use `minElapsedMs: 10_000` — should be increased for safety

### Metis Review

**Identified Gaps** (addressed):

- `NOTIFY_MSG_CHANNEL` env var doesn't exist → use `NOTIFICATION_CHANNEL` instead
- Delivery `minElapsedMs` also needs increasing → set to 30_000
- Double Slack update possible (harness + lifecycle) → accepted as benign (idempotent)
- SIGTERM handler can't reliably await Slack → add to `markFailed()` only, not SIGTERM handler
- 60s minElapsedMs may add latency for fast models → accepted tradeoff (safety > speed)

---

## Work Objectives

### Core Objective

Fix the premature idle detection that kills tasks before slow models respond, and ensure Slack notifications update to show failure state.

### Concrete Deliverables

- `src/workers/opencode-harness.mts` — three changes: main session minElapsedMs, delivery minElapsedMs, markFailed() Slack update
- `dashboard/src/panels/tasks/TaskDetail.tsx` — move Trigger Payload section higher, add Re-run button with editable inputs modal
- `dashboard/src/lib/types.ts` — add `input_schema` to Task archetypes type
- Rebuilt Docker image with fixes

### Definition of Done

- [ ] Engineer task completes (reaches Submitting/Reviewing) without premature idle kill
- [ ] Slack notification shows ❌ Failed when a task fails (via markFailed path)
- [ ] Motivation bot regression test passes (fast model still completes normally)
- [ ] Trigger Payload is visible near the top of task detail page (after failure banner, before status timeline)
- [ ] Re-run button appears on Failed/Done/Cancelled tasks with `source_system: 'manual'`
- [ ] Re-run modal pre-fills with original inputs and allows editing before re-triggering

### Must Have

- Main execution `minElapsedMs` increased to 60_000 (line 1011)
- Delivery `minElapsedMs` increased to 30_000 (line 764)
- Slack update in `markFailed()` using `NOTIFY_MSG_TS` + `NOTIFICATION_CHANNEL` + `SLACK_BOT_TOKEN`

### Must NOT Have (Guardrails)

- Do NOT change the recovery nudge `minElapsedMs: 10_000` (line 512) — intentionally short
- Do NOT modify `session-manager.ts` — fix is entirely in harness
- Do NOT modify `employee-lifecycle.ts` — lifecycle's `mark-failed` step is correct
- Do NOT add employee-specific language to `markFailed()` — it's shared across all employees
- Do NOT add new env vars to the lifecycle's worker env injection
- Do NOT add retry logic to the Slack update
- Do NOT refactor `markFailed()` signature — keep existing API
- Do NOT show Re-run button for webhook-triggered tasks (`source_system` !== `'manual'`) — webhook payloads have different shapes
- Do NOT create new API endpoints — the existing trigger endpoint handles re-runs as-is
- Do NOT use `<Select>` from Radix — use `SearchableSelect` for any dropdowns per project conventions

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — this is a config change + simple feature addition; verification via E2E trigger
- **Agent-Executed QA**: ALWAYS

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend**: Use Bash (curl/psql) — trigger tasks, check DB status, verify Slack API
- **Logs**: Use Bash (grep) — verify harness log entries

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — harness fixes + dashboard improvements, ALL parallel):
├── Task 1: Increase main execution minElapsedMs [quick]
├── Task 2: Increase delivery minElapsedMs [quick]
├── Task 3: Add Slack failure notification to markFailed() [quick]
├── Task 4: Move Trigger Payload section higher on task detail page [visual-engineering]
└── Task 5: Add Re-run button with editable inputs modal [visual-engineering]

Wave 2 (After Wave 1 — rebuild + verify):
└── Task 6: Rebuild Docker image + E2E verification (includes testing re-run button) [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On    | Blocks |
| ---- | ------------- | ------ |
| 1    | None          | 6      |
| 2    | None          | 6      |
| 3    | None          | 6      |
| 4    | None          | 6      |
| 5    | None          | 6      |
| 6    | 1, 2, 3, 4, 5 | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `visual-engineering`, T5 → `visual-engineering`
- **Wave 2**: **1** — T6 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Increase main execution session `minElapsedMs` from 10_000 to 60_000

  **What to do**:
  - In `src/workers/opencode-harness.mts`, find the `runOpencodeSession` call in `main()` (line ~1011)
  - Change `minElapsedMs: 10_000` to `minElapsedMs: 60_000`
  - This is the primary fix for Bug 1 — gives slow models (like `xiaomi/mimo-v2.5-pro` with 23s TTFT) enough time before the session-manager declares the session "completed"

  **Must NOT do**:
  - Do NOT change `minElapsedMs: 10_000` at line ~512 (recovery nudge — intentionally short for re-prompted sessions)
  - Do NOT change the default in `session-manager.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/workers/opencode-harness.mts:1010-1012` — The call site: `const result = await runOpencodeSession(taskPrompt, model, submitOutputCmd, { minElapsedMs: 10_000 });`
  - `src/workers/opencode-harness.mts:359-362` — Where `options.minElapsedMs` is consumed: `minElapsedMs: options?.minElapsedMs ?? 30_000`
  - `src/workers/lib/session-manager.ts:318` — Default is 30_000, the 10_000 was an explicit override that was too aggressive

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify minElapsedMs changed to 60_000
    Tool: Bash (grep)
    Preconditions: File saved
    Steps:
      1. Run: grep -n 'minElapsedMs.*10_000\|minElapsedMs.*60_000' src/workers/opencode-harness.mts
      2. Assert: line ~1011 shows `minElapsedMs: 60_000` (not 10_000)
      3. Assert: line ~512 still shows `minElapsedMs: 10_000` (recovery nudge unchanged)
    Expected Result: Exactly one line changed (1011), recovery nudge line untouched
    Evidence: .sisyphus/evidence/task-1-minelapsed-check.txt

  Scenario: Build succeeds after change
    Tool: Bash
    Preconditions: Change applied
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: TypeScript compilation succeeds
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES (group with Tasks 2, 3)
  - Message: `fix(harness): increase idle detection threshold and add Slack failure notifications`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 2. Increase delivery session `minElapsedMs` from 10_000 to 30_000

  **What to do**:
  - In `src/workers/opencode-harness.mts`, find the delivery `runOpencodeSession` call (line ~764)
  - Change `minElapsedMs: 10_000` to `minElapsedMs: 30_000`
  - Delivery uses the same slow models but with simpler prompts — 30s is adequate headroom

  **Must NOT do**:
  - Do NOT change the recovery nudge timeout at line ~512

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/workers/opencode-harness.mts:760-764` — The delivery call: `deliveryResult = await runOpencodeSession(..., { minElapsedMs: 10_000 });`
  - Metis finding: delivery container uses same slow models, same TTFT problem applies

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify delivery minElapsedMs changed to 30_000
    Tool: Bash (grep)
    Preconditions: File saved
    Steps:
      1. Run: grep -n 'minElapsedMs' src/workers/opencode-harness.mts
      2. Assert: delivery call (line ~764) shows `minElapsedMs: 30_000`
    Expected Result: Delivery threshold is 30_000, not 10_000
    Evidence: .sisyphus/evidence/task-2-delivery-minelapsed.txt
  ```

  **Commit**: YES (group with Tasks 1, 3)
  - Message: (same commit as Task 1)

- [x] 3. Add Slack failure notification to `markFailed()` function

  **What to do**:
  - In `src/workers/opencode-harness.mts`, modify the `markFailed()` function (starts at line ~95)
  - After the existing `db.patch('tasks', ...)` call, add a Slack `chat.update` call to update the "Received" notification to show failure
  - Use env vars: `process.env['NOTIFY_MSG_TS']` (message timestamp), `process.env['NOTIFICATION_CHANNEL']` (channel), `process.env['SLACK_BOT_TOKEN']` (auth token)
  - Use a direct `fetch` to `https://slack.com/api/chat.update` — no new dependencies needed
  - Wrap in try/catch and log as non-fatal (same pattern as lifecycle's mark-failed step)
  - Use employee-agnostic language only (the `EMPLOYEE_ROLE_NAME` env var provides the role name for display)
  - The message should show: `❌ {role_name} — Failed` with the task ID in a context block

  **Must NOT do**:
  - Do NOT add employee-specific language (no "guest", "summary", "engineer" hardcoded)
  - Do NOT change `markFailed()`'s function signature (keep existing `reason, executionId, fromStatus, failureCode?` params)
  - Do NOT add retry logic — single attempt, fail silently
  - Do NOT add new npm dependencies
  - Do NOT modify the SIGTERM handler — `markFailed()` is called from the catch block in `main()`, not from the SIGTERM handler

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/inngest/employee-lifecycle.ts:724-768` — The lifecycle's `mark-failed` step showing the Slack update pattern: load token, create blocks, call `updateMessage`. Follow the same try/catch + non-fatal logging pattern.
  - `src/workers/opencode-harness.mts:170-200` — The harness's existing Slack usage for approval cards. Shows how `SLACK_BOT_TOKEN`, `NOTIFICATION_CHANNEL`, and `NOTIFY_MSG_TS` env vars are accessed.
  - `src/workers/opencode-harness.mts:95-128` — The current `markFailed()` function to be modified.

  **API Reference** (Slack chat.update):
  - `https://api.slack.com/methods/chat.update` — POST with `{ channel, ts, text, blocks }`. Auth via `Bearer` token in `Authorization` header.
  - The `blocks` array should include a section block with failure text + a context block with the task ID (matching the existing notification format)

  **Critical env var note from Metis**:
  - `NOTIFY_MSG_CHANNEL` does NOT exist — use `NOTIFICATION_CHANNEL` instead
  - Guard with `if (token && ts && channel)` — all three must be present

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify markFailed includes Slack update code
    Tool: Bash (grep)
    Preconditions: File saved
    Steps:
      1. Run: grep -A5 'chat.update\|NOTIFY_MSG_TS\|NOTIFICATION_CHANNEL' src/workers/opencode-harness.mts
      2. Assert: markFailed() function contains a fetch call to slack.com/api/chat.update
      3. Assert: uses NOTIFY_MSG_TS and NOTIFICATION_CHANNEL env vars
      4. Assert: wrapped in try/catch
    Expected Result: Slack update code present in markFailed()
    Evidence: .sisyphus/evidence/task-3-slack-update-code.txt

  Scenario: Build succeeds with Slack update addition
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: No type errors, compilation succeeds
    Evidence: .sisyphus/evidence/task-3-build.txt

  Scenario: Verify no employee-specific language
    Tool: Bash (grep)
    Preconditions: Changes applied
    Steps:
      1. Run: grep -n '"guest"\|"summary"\|"engineer"\|"motivation"' src/workers/opencode-harness.mts | grep -v '//' | grep -v 'test'
      2. Assert: no new employee-specific hardcoded strings in markFailed()
    Expected Result: Zero matches in markFailed() function
    Evidence: .sisyphus/evidence/task-3-no-employee-specific.txt
  ```

  **Commit**: YES (group with Tasks 1, 2)
  - Message: (same commit as Task 1)

- [x] 4. Move Trigger Payload section higher on task detail page

  **What to do**:
  - In `dashboard/src/panels/tasks/TaskDetail.tsx`, move the `<RawEventViewer>` component (currently at lines 78–135, rendered at the bottom of the page) to render immediately after the failure reason banner and before the Status Timeline card
  - Rename the section header from "Trigger Payload" to "Task Input" for clarity
  - Keep the existing collapsible JSON behavior — just reposition it
  - If `raw_event` is null, the component already shows "This task was not triggered by a webhook, so no payload was captured" — this is fine, keep it

  **Must NOT do**:
  - Do NOT change the `RawEventViewer` component logic — only move where it's rendered in the JSX
  - Do NOT remove the component from its current position without adding it in the new position

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI repositioning task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/TaskDetail.tsx:78-135` — The `RawEventViewer` component definition (inline in file). Shows collapsible JSON with truncation, handles null `raw_event`.
  - `dashboard/src/panels/tasks/TaskDetail.tsx` — Full component render order. The failure reason banner is near the top (after header card). Move `RawEventViewer` to render after it, before `StatusTimeline`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Trigger Payload visible near top of task detail page
    Tool: Playwright
    Preconditions: Services running, at least one task exists with raw_event data (e.g. task 197a00dc)
    Steps:
      1. Navigate to http://localhost:7700/dashboard/tasks/197a00dc-dd35-4ee7-9f12-abbb5eedf053?tenant=00000000-0000-0000-0000-000000000002
      2. Assert: "Task Input" section is visible without scrolling past the status timeline
      3. Assert: The section contains the JSON payload with "inputs" key
      4. Click the expand/collapse toggle — assert it expands to show full JSON
    Expected Result: Task Input section appears early on the page, before status timeline
    Failure Indicators: Section not found, or appears after execution metrics/container commands
    Evidence: .sisyphus/evidence/task-4-trigger-payload-position.png

  Scenario: Task with no raw_event shows appropriate message
    Tool: Playwright
    Preconditions: A task exists with null raw_event
    Steps:
      1. Navigate to that task's detail page
      2. Assert: "Task Input" section shows "This task was not triggered by a webhook" message
    Expected Result: Graceful handling of null raw_event
    Evidence: .sisyphus/evidence/task-4-null-payload.png
  ```

  **Commit**: YES (group with Task 5)
  - Message: `feat(dashboard): move task input section higher and add re-run with editable inputs`
  - Files: `dashboard/src/panels/tasks/TaskDetail.tsx`

- [x] 5. Add Re-run button with editable inputs modal to task detail page

  **What to do**:
  - In `dashboard/src/panels/tasks/TaskDetail.tsx`, add a "Re-run" button in the header card, next to the status badge. Only visible when:
    - Task status is terminal (`Failed`, `Done`, or `Cancelled`)
    - AND `task.source_system === 'manual'`
  - Clicking the button opens a modal/dialog with:
    - A form pre-filled with the original inputs from `task.raw_event?.inputs`
    - If the archetype has `input_schema`, render proper form fields using the same `FormField` pattern from `TriggerEmployeePage.tsx` (text inputs, textareas for long values)
    - If no `input_schema`, show a single "Prompt" textarea pre-filled with `raw_event?.inputs?.prompt`
    - A "Re-run" submit button and a "Cancel" button
  - On submit: call `triggerEmployee(task.tenant_id, task.archetypes.role_name, false, editedInputs)`
  - On success: navigate to the new task's detail page (the response includes `task_id`)
  - On error: show toast/error message in the modal
  - Update the PostgREST select in `fetchTask` to include `input_schema`: change `archetypes(role_name,model)` to `archetypes(role_name,model,input_schema)`
  - Update the `Task` type in `dashboard/src/lib/types.ts` to include `input_schema` in the archetypes nested type

  **Must NOT do**:
  - Do NOT show Re-run for webhook-triggered tasks (Hostfully, Jira) — their `raw_event` shape doesn't map to the trigger API's `inputs` format
  - Do NOT create new API endpoints — use existing `triggerEmployee()` from `dashboard/src/lib/gateway.ts`
  - Do NOT add new npm dependencies — use existing UI components (Dialog from shadcn, existing form patterns)
  - Do NOT use `<Select>` from Radix — use `SearchableSelect` if any dropdown is needed

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI feature with form, modal, and navigation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/TriggerEmployeePage.tsx` — The existing trigger page with input form. Has `FormField` rendering for `input_schema` fields, `triggerEmployee()` call pattern, success/error handling. Copy the form field rendering pattern.
  - `dashboard/src/panels/employees/TriggerEmployeePage.tsx:229` — "Run Again" button pattern (post-success reset) — similar UX concept
  - `dashboard/src/panels/tasks/TaskDetail.tsx:170-200` — Existing approval buttons in the header card — similar placement pattern for the Re-run button
  - `dashboard/src/lib/gateway.ts` — `triggerEmployee(tenantId, slug, dryRun?, inputs?, prompt?)` — the client function to call

  **API/Type References**:
  - `dashboard/src/lib/types.ts` — `Task` type with `archetypes: { role_name, model }` — add `input_schema` here
  - `dashboard/src/lib/types.ts` — `InputSchema` type if it exists, or define inline based on `src/gateway/validation/schemas.ts:375` (`InputSchemaSchema`)
  - `src/gateway/routes/admin-employee-trigger.ts:17-22` — Request body schema: `{ inputs?: Record<string, string>, prompt?: string }`

  **Data Flow for Re-run**:
  - Read: `task.raw_event?.inputs` (pre-fill form)
  - Read: `task.archetypes.input_schema` (render form fields — may be null for archetypes without schema)
  - Write: `triggerEmployee(task.tenant_id, task.archetypes.role_name, false, editedInputs)` → returns `{ task_id }`
  - Navigate: `/dashboard/tasks/${newTaskId}?tenant=${task.tenant_id}`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Re-run button visible on failed manual task
    Tool: Playwright
    Preconditions: Task 197a00dc (failed engineer task, source_system='manual') exists
    Steps:
      1. Navigate to http://localhost:7700/dashboard/tasks/197a00dc-dd35-4ee7-9f12-abbb5eedf053?tenant=00000000-0000-0000-0000-000000000002
      2. Assert: "Re-run" button is visible in the header card area
      3. Assert: Button has recognizable icon/label (e.g. "Re-run" or replay icon)
    Expected Result: Re-run button present on failed manual task
    Failure Indicators: Button missing, or appears on non-terminal tasks
    Evidence: .sisyphus/evidence/task-5-rerun-button-visible.png

  Scenario: Re-run button NOT visible on webhook-triggered task
    Tool: Playwright
    Preconditions: A webhook-triggered task exists (source_system='hostfully' or 'jira')
    Steps:
      1. Navigate to that task's detail page
      2. Assert: No "Re-run" button is visible
    Expected Result: Re-run button hidden for webhook tasks
    Evidence: .sisyphus/evidence/task-5-rerun-hidden-webhook.png

  Scenario: Re-run modal opens with pre-filled inputs
    Tool: Playwright
    Preconditions: Task 197a00dc exists with raw_event.inputs.prompt
    Steps:
      1. Navigate to task detail page
      2. Click "Re-run" button
      3. Assert: Modal/dialog opens
      4. Assert: Prompt textarea is pre-filled with the original prompt text (contains "Whenever the AI employees post to Slack")
      5. Assert: "Re-run" submit button is visible
      6. Assert: "Cancel" button is visible
    Expected Result: Modal shows with pre-filled inputs from original task
    Failure Indicators: Modal doesn't open, inputs empty, or wrong data
    Evidence: .sisyphus/evidence/task-5-rerun-modal-prefilled.png

  Scenario: Re-run with edited inputs creates new task
    Tool: Playwright + Bash (psql)
    Preconditions: Services running, task 197a00dc exists
    Steps:
      1. Navigate to task detail page, click "Re-run"
      2. Edit the prompt text to append " (re-run test)"
      3. Click "Re-run" submit button
      4. Assert: Page navigates to a new task detail page (different task ID in URL)
      5. Run: psql to verify new task exists with status 'Ready' or later
      6. Assert: New task's raw_event.inputs.prompt contains " (re-run test)"
    Expected Result: New task created with edited inputs, navigated to new task page
    Failure Indicators: Error toast, no navigation, or new task has wrong inputs
    Evidence: .sisyphus/evidence/task-5-rerun-creates-task.png

  Scenario: Re-run button hidden on in-progress task
    Tool: Playwright
    Preconditions: A task in Executing or Reviewing state
    Steps:
      1. Navigate to that task's detail page
      2. Assert: No "Re-run" button visible
    Expected Result: Re-run only on terminal states
    Evidence: .sisyphus/evidence/task-5-rerun-hidden-active.png
  ```

  **Commit**: YES (group with Task 4)
  - Message: (same commit as Task 4)

- [x] 6. Rebuild Docker image and run E2E verification

  **What to do**:
  - Rebuild the Docker image: `docker build -t ai-employee-worker:latest .`
  - Run regression test: Trigger `real-estate-motivation-bot-2` (VLRE tenant, fast model) and verify it reaches Done
  - Run primary test: Use the Re-run button on the dashboard to re-trigger the original engineer task (197a00dc) with the same inputs — this tests both the idle detection fix AND the new re-run feature
  - Check harness logs for both tasks to confirm no premature idle detection
  - Check Slack for correct notification states

  **Must NOT do**:
  - Do NOT skip the Docker rebuild — changes to `src/workers/` require it
  - Do NOT use `--no-cache` unless build fails (save time)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4, 5

  **References**:
  - AGENTS.md — "CRITICAL — Rebuild after every worker change" and recommended test employee `real-estate-motivation-bot-2`
  - AGENTS.md — Trigger commands for both employees (motivation-bot and engineer)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully
    Tool: Bash (tmux — long-running)
    Preconditions: All code changes committed
    Steps:
      1. Run in tmux: docker build -t ai-employee-worker:latest .
      2. Wait for completion (check log for EXIT_CODE)
      3. Assert: exit code 0
    Expected Result: Docker image built successfully
    Evidence: .sisyphus/evidence/task-6-docker-build.txt

  Scenario: Regression — motivation bot completes normally
    Tool: Bash (curl + psql)
    Preconditions: Docker image rebuilt, services running
    Steps:
      1. Trigger: curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
      2. Wait 120 seconds
      3. Check status: psql -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
      4. Assert: status = 'Done'
      5. Check harness log: grep 'idle' /tmp/employee-${TASK_ID:0:8}.log | head -5
    Expected Result: Task reaches Done, no premature idle in logs
    Failure Indicators: status = 'Failed', idle detection log within first 60s
    Evidence: .sisyphus/evidence/task-6-regression-motivation.txt

  Scenario: Re-run engineer task via dashboard Re-run button
    Tool: Playwright + Bash (psql)
    Preconditions: Docker image rebuilt, services running, dashboard accessible
    Steps:
      1. Navigate to http://localhost:7700/dashboard/tasks/197a00dc-dd35-4ee7-9f12-abbb5eedf053?tenant=00000000-0000-0000-0000-000000000002
      2. Click "Re-run" button
      3. Verify modal opens with pre-filled prompt
      4. Click "Re-run" submit button (no edits — use original inputs)
      5. Assert: Page navigates to new task detail page
      6. Wait 90 seconds
      7. Check status: psql -c "SELECT status FROM tasks WHERE id = '$NEW_TASK_ID';"
      8. Assert: status is NOT 'Failed' (should be 'Executing', 'Submitting', or 'Reviewing')
      9. Check harness log: grep '"component":"opencode-harness"' /tmp/employee-${NEW_TASK_ID:0:8}.log | grep 'idle'
      10. Assert: no premature idle detection within first 60s
    Expected Result: Re-run creates new task, engineer task survives past 60s
    Failure Indicators: Modal doesn't open, trigger fails, or new task dies with output_contract_missing
    Evidence: .sisyphus/evidence/task-6-rerun-engineer.png

  Scenario: Slack notification shows failure state (if task fails)
    Tool: Bash (curl)
    Preconditions: A task has reached Failed state (through markFailed path)
    Steps:
      1. If engineer task completed successfully, simulate failure: docker kill --signal=SIGTERM employee-${TASK_ID:0:8}
      2. Wait 10 seconds
      3. Check Slack: verify the notification message shows "❌" not "⏳"
      4. Alternative: check task metadata for notify_slack_ts and use Slack API to read the message
    Expected Result: Slack message updated to show failure
    Evidence: .sisyphus/evidence/task-6-slack-failure-check.txt
  ```

  **Commit**: NO (code already committed in Wave 1)

- [x] 7. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for changes). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan. Verify re-run button only appears for manual + terminal tasks.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build`. Review all changed files (`src/workers/opencode-harness.mts`, `dashboard/src/panels/tasks/TaskDetail.tsx`, `dashboard/src/lib/types.ts`) for: empty catches, console.log in prod, unused imports. Check Slack update follows existing patterns (try/catch, non-fatal). Verify no employee-specific language in shared code. Check dashboard code follows project conventions (card boundaries, SearchableSelect, URL-encoded state).
      Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for dashboard) 1. Trigger `real-estate-motivation-bot-2` (fast model regression). Verify Done within 2 min. Check logs for no premature idle. 2. Open task detail page for task 197a00dc. Verify "Task Input" section is near top. Verify "Re-run" button is visible. 3. Click Re-run. Verify modal opens with pre-filled prompt. Click Re-run submit. Verify new task created. 4. Check Slack notification shows final status for any completed/failed task.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Read the git diff. Verify changes are ONLY in: `src/workers/opencode-harness.mts` (3 changes: minElapsedMs ×2, markFailed Slack), `dashboard/src/panels/tasks/TaskDetail.tsx` (moved section, re-run button+modal), `dashboard/src/lib/types.ts` (input_schema type). No unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `fix(harness): increase idle detection threshold and add Slack failure notifications` — `src/workers/opencode-harness.mts`
- **2**: `feat(dashboard): move task input section higher and add re-run with editable inputs` — `dashboard/src/panels/tasks/TaskDetail.tsx`, `dashboard/src/lib/types.ts`

---

## Success Criteria

### Verification Commands

```bash
# Engineer task reaches Executing and stays alive past 10s
grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | grep -c 'idle'
# Expected: 0 idle detections within first 60s

# Task reaches Submitting or Done (not Failed)
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Submitting, Reviewing, or Done

# Motivation bot regression — still completes normally
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$REGRESSION_TASK_ID';"
# Expected: Done
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm build` succeeds
- [ ] Docker image rebuilt
- [ ] Engineer task survives past 60s
- [ ] Motivation bot regression passes
- [ ] Task Input section visible near top of task detail page
- [ ] Re-run button works on failed manual tasks (opens modal, pre-fills inputs, creates new task)
- [ ] Re-run button hidden on webhook tasks and non-terminal tasks
