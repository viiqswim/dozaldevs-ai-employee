# Fix Premature Idle Detection & Slack Failure Notifications

## TL;DR

> **Quick Summary**: Fix two bugs — the session-manager's idle detection kills tasks before slow models respond (10s threshold vs 23s TTFT), and the harness doesn't update Slack notifications when tasks fail.
>
> **Deliverables**:
>
> - Increased `minElapsedMs` from 10s to 60s for main execution sessions
> - Increased `minElapsedMs` from 10s to 30s for delivery sessions
> - Slack notification update in `markFailed()` so failures are visible in Slack
> - Docker image rebuild + end-to-end verification
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Tasks 1-3 (parallel) → Task 4 (rebuild + verify)

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
- Rebuilt Docker image with fixes

### Definition of Done

- [ ] Engineer task completes (reaches Submitting/Reviewing) without premature idle kill
- [ ] Slack notification shows ❌ Failed when a task fails (via markFailed path)
- [ ] Motivation bot regression test passes (fast model still completes normally)

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
Wave 1 (Start Immediately — all changes in opencode-harness.mts):
├── Task 1: Increase main execution minElapsedMs [quick]
├── Task 2: Increase delivery minElapsedMs [quick]
└── Task 3: Add Slack failure notification to markFailed() [quick]

Wave 2 (After Wave 1 — rebuild + verify):
└── Task 4: Rebuild Docker image + E2E verification [unspecified-high]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | None       | 4      |
| 2    | None       | 4      |
| 3    | None       | 4      |
| 4    | 1, 2, 3    | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **1** — T4 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Increase main execution session `minElapsedMs` from 10_000 to 60_000

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

- [ ] 2. Increase delivery session `minElapsedMs` from 10_000 to 30_000

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

- [ ] 3. Add Slack failure notification to `markFailed()` function

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

- [ ] 4. Rebuild Docker image and run E2E verification

  **What to do**:
  - Rebuild the Docker image: `docker build -t ai-employee-worker:latest .`
  - Run regression test: Trigger `real-estate-motivation-bot-2` (VLRE tenant, fast model) and verify it reaches Done
  - Run primary test: Re-trigger the engineer task with a simple prompt and verify it survives past 60s
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
  - **Blocked By**: Tasks 1, 2, 3

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
    Evidence: .sisyphus/evidence/task-4-docker-build.txt

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
    Evidence: .sisyphus/evidence/task-4-regression-motivation.txt

  Scenario: Engineer task survives past idle threshold
    Tool: Bash (curl + psql)
    Preconditions: Docker image rebuilt, services running
    Steps:
      1. Trigger: curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/engineer/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"inputs": {"prompt": "Add a comment to the README explaining what this repo does"}}'
      2. Wait 90 seconds
      3. Check status: psql -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
      4. Assert: status is NOT 'Failed' (should be 'Executing', 'Submitting', or 'Reviewing')
      5. Check harness log: grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | grep 'idle'
      6. Assert: no premature idle detection within first 60s
    Expected Result: Task survives past 60s, model actively working
    Failure Indicators: status = 'Failed' with failure_code = 'output_contract_missing'
    Evidence: .sisyphus/evidence/task-4-engineer-test.txt

  Scenario: Slack notification shows failure state (if task fails)
    Tool: Bash (curl)
    Preconditions: A task has reached Failed state (through markFailed path)
    Steps:
      1. If engineer task completed successfully, simulate failure: docker kill --signal=SIGTERM employee-${TASK_ID:0:8}
      2. Wait 10 seconds
      3. Check Slack: verify the notification message shows "❌" not "⏳"
      4. Alternative: check task metadata for notify_slack_ts and use Slack API to read the message
    Expected Result: Slack message updated to show failure
    Evidence: .sisyphus/evidence/task-4-slack-failure-check.txt
  ```

  **Commit**: NO (code already committed in Wave 1)

- [ ] 5. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for changes). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build`. Review all changed files in `src/workers/opencode-harness.mts` for: empty catches, console.log in prod, unused imports. Check that the Slack update follows existing patterns (try/catch, non-fatal logging). Verify no employee-specific language in shared code.
      Output: `Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Trigger `real-estate-motivation-bot-2` (fast model regression test). Verify it reaches Done within 2 minutes. Check harness logs show no premature idle detection. Check Slack notification shows final status. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      Read the git diff. Verify changes are ONLY in `src/workers/opencode-harness.mts`. Verify exactly 3 changes: line 1011 (10_000→60_000), line 764 (10_000→30_000), and markFailed() Slack addition. No unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `fix(harness): increase idle detection threshold and add Slack failure notifications` — `src/workers/opencode-harness.mts`

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
