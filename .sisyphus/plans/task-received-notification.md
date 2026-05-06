# Task Received Slack Notification

## TL;DR

> **Quick Summary**: Add a non-fatal Slack notification at the start of the employee lifecycle so users see "Task received — processing" immediately, eliminating the silent gap between webhook arrival and eventual approval card.
>
> **Deliverables**:
>
> - New `notify-received` step in `src/inngest/employee-lifecycle.ts` (after `triaging`, before `awaiting-input`)
> - Slack message posted to the tenant's notification channel with task ID context block
> - Works universally for ALL employees
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — 2 sequential tasks + final wave
> **Critical Path**: Task 1 (implement) → Task 2 (E2E verify) → Final Wave

---

## Context

### Original Request

"As soon as the AI employee starts processing a task, we should post something to Slack so that the users know that a task is being processed. For example, when a message is received from Hostfully, we don't currently post anything on Slack. We just process things in the background."

### Interview Summary

**Key Discussions**:

- **Timing**: Notification fires at Received state — fastest user feedback
- **Channel**: Same channel where approval cards appear (per-tenant notification channel)
- **Scope**: Universal for ALL employees, not configurable per archetype
- **Standalone**: No update when task completes — just the initial "received" signal

**Research Findings**:

- `load-task` step provides `taskId`, `tenantId`, `archetype.role_name`, `archetype.notification_channel`
- `loadTenantEnv()` resolves channel via `notification-channel.ts`: archetype > tenant config > ''
- Existing non-fatal pattern at lines 656–676 (supersede logic): inline PrismaClient, try/catch, `log.warn`
- Channel fallback: `NOTIFICATION_CHANNEL ?? SUMMARY_TARGET_CHANNEL ?? ''`
- DozalDevs posts to `C0AUBMXKVNU`, VLRE posts to `C0960S2Q8RL`

### Metis Review

**Identified Gaps** (addressed):

- Step placement: Recommended AFTER `triaging` (not before) so DB state is consistent with notification → adopted
- Message format: Locked to minimal (section + context block only, no header/divider/actions) → adopted
- Retry behavior: Inngest memoizes completed steps; try/catch prevents throw → non-issue
- Future `ts` storage: Premature — user explicitly said no update → excluded
- Test coverage: Agent QA only; no unit test for this 30-line addition → adopted

---

## Work Objectives

### Core Objective

Post a Slack notification to the tenant's notification channel when the employee lifecycle begins processing a task, giving users immediate visibility.

### Concrete Deliverables

- Modified `src/inngest/employee-lifecycle.ts` with new `notify-received` step (~30 lines)
- Slack notification appears in tenant channel within seconds of task creation

### Definition of Done

- [ ] `pnpm lint` passes with no new errors
- [ ] `pnpm test -- --run` passes with no new failures
- [ ] Triggering DozalDevs summarizer → notification in `C0AUBMXKVNU`
- [ ] Triggering VLRE guest-messaging → notification in `C0960S2Q8RL`
- [ ] Task proceeds to Executing even if notification fails (non-fatal)

### Must Have

- Task ID context block on every notification (AGENTS.md standard)
- Employee-agnostic language only (shared file constraint)
- Non-fatal error handling (try/catch + log.warn, never blocks lifecycle)
- Channel resolution via existing `loadTenantEnv()` mechanism

### Must NOT Have (Guardrails)

- ❌ Employee-specific language anywhere in new code (no "summary", "guest", "digest", "message", "Hostfully")
- ❌ New imports — all dependencies already imported in the file
- ❌ Block Kit header, divider, or action blocks — minimal format only
- ❌ Modifications to any existing step (insert only, never reorder)
- ❌ Notifications for other state transitions (Executing, Done, Failed) — out of scope
- ❌ Configuration changes or new env vars — use existing channel resolution
- ❌ Documentation changes unless explicitly requested
- ❌ Unit tests — agent QA via real E2E triggers is the verification strategy

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None for this change — too shallow for unit tests, E2E QA is more valuable
- **Framework**: bun test / vitest (existing)
- **Approach**: Agent-executed QA scenarios with real Slack message verification

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lifecycle change**: Use Bash (curl) — trigger tasks, poll status, check Inngest logs
- **Slack verification**: Use Bash (curl Slack API or check gateway logs) — confirm message posted

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — implementation then verification):
├── Task 1: Add notify-received step to lifecycle [quick]
└── Task 2: E2E verification with both tenants [quick] (depends: 1)

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks   |
| ----- | ---------- | -------- |
| 1     | —          | 2, F1-F4 |
| 2     | 1          | F1-F4    |
| F1-F4 | 1, 2       | —        |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `notify-received` step to employee lifecycle

  **What to do**:
  - Open `src/inngest/employee-lifecycle.ts`
  - Insert a new `step.run('notify-received', ...)` block AFTER the `triaging` step (after line ~137) and BEFORE the `awaiting-input` step (before line ~141)
  - Inside the step:
    1. Instantiate `PrismaClient` inline (same pattern as supersede at lines 656–676)
    2. Call `loadTenantEnv(tenantId, { tenantRepo: new TenantRepository(prisma), secretRepo: new TenantSecretRepository(prisma) }, (archetype.notification_channel as string | null) ?? null)`
    3. Disconnect Prisma
    4. Extract `botToken = tenantEnv['SLACK_BOT_TOKEN'] ?? ''`
    5. Resolve channel: `tenantEnv['NOTIFICATION_CHANNEL'] ?? tenantEnv['SUMMARY_TARGET_CHANNEL'] ?? ''`
    6. Guard: `if (!botToken || !channel) return;` (silent skip when not configured)
    7. Create Slack client: `createSlackClient({ botToken, defaultChannel: channel })`
    8. Post message with this exact structure:
       ```json
       {
         "channel": channel,
         "text": "⏳ Task received — processing ({role_name})",
         "blocks": [
           {
             "type": "section",
             "text": { "type": "mrkdwn", "text": "⏳ *Task received* — processing\n_Employee: {role_name}_" }
           },
           {
             "type": "context",
             "elements": [{ "type": "mrkdwn", "text": "Task `{taskId}`" }]
           }
         ]
       }
       ```
       Where `role_name` = `(archetype.role_name as string) ?? 'unknown'` and `taskId` from function scope
  - Wrap the ENTIRE step body in try/catch: `catch (err) { log.warn('Failed to send received notification', { taskId, error: err }); }`
  - Verify `pnpm lint` passes
  - Verify `pnpm test -- --run` passes (no new failures)

  **Must NOT do**:
  - Use employee-specific terms ("summary", "guest", "digest", "Hostfully") anywhere
  - Add new imports (all needed imports already exist: `loadTenantEnv`, `createSlackClient`, `PrismaClient`, `TenantRepository`, `TenantSecretRepository`)
  - Add Block Kit header/divider/action blocks
  - Modify any existing step
  - Add new env vars or config fields

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change, ~30 lines, following an established pattern with clear references
  - **Skills**: `[]`
    - No special skills needed — straightforward TypeScript insertion
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — simple single-file commit

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential)
  - **Blocks**: Task 2, F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/inngest/employee-lifecycle.ts:656-676` — Supersede non-fatal pattern: inline PrismaClient, try/catch, log.warn on failure. COPY THIS EXACT STRUCTURE.
  - `src/inngest/employee-lifecycle.ts:169-176` — `loadTenantEnv()` call with archetype channel as third arg. Copy the call signature.
  - `src/inngest/employee-lifecycle.ts:758-762` — Channel fallback chain: `NOTIFICATION_CHANNEL ?? SUMMARY_TARGET_CHANNEL ?? ''`
  - `src/inngest/employee-lifecycle.ts:133-141` — The `triaging` and `awaiting-input` steps. Insert your new step BETWEEN these two.

  **API/Type References** (contracts to implement against):
  - `src/lib/slack-client.ts` — `createSlackClient({ botToken, defaultChannel })` → `.postMessage({ channel, text, blocks })`
  - `src/gateway/services/notification-channel.ts` — Channel resolution logic (archetype > tenant config > '')
  - `src/gateway/services/tenant-env-loader.ts` — `loadTenantEnv(tenantId, deps, archetypeChannel?)` signature

  **WHY Each Reference Matters**:
  - Lines 656-676: This is the EXACT pattern to follow — it shows how to do a non-fatal Slack-related operation inside an Inngest step with inline Prisma
  - Lines 169-176: Shows the correct `loadTenantEnv` call with the archetype channel override (third param)
  - Lines 758-762: Shows the channel resolution fallback order used elsewhere in the file
  - Lines 133-141: Shows WHERE to insert (between triaging patch and awaiting-input)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lint and tests pass after modification
    Tool: Bash
    Preconditions: File modified with new step
    Steps:
      1. Run `pnpm lint` from repo root
      2. Run `pnpm test -- --run` from repo root
    Expected Result: Both commands exit 0 with no new failures
    Failure Indicators: TypeScript errors, lint violations, test regressions
    Evidence: .sisyphus/evidence/task-1-lint-test.txt

  Scenario: Code follows non-fatal pattern (static check)
    Tool: Bash (grep)
    Preconditions: File modified
    Steps:
      1. Search for `step.run('notify-received'` in the file — confirm it exists
      2. Search for `catch` within 40 lines of `notify-received` — confirm try/catch wraps it
      3. Search for `log.warn` within the catch block — confirm warning is logged
      4. Search for employee-specific terms (summary|guest|digest|hostfully) in the new code block — confirm NONE found
    Expected Result: Step exists, wrapped in try/catch, log.warn on error, no employee-specific language
    Failure Indicators: Missing try/catch, missing log.warn, employee-specific terms present
    Evidence: .sisyphus/evidence/task-1-static-check.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): add task-received Slack notification for processing visibility`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run`

---

- [x] 2. E2E verification — trigger both tenants and confirm Slack notifications

  **What to do**:
  - Restart the gateway to pick up the lifecycle change (the dev stack in tmux `ai-dev` auto-reloads on file change — verify this, or manually restart)
  - **Test 1 — DozalDevs summarizer**:
    1. Trigger: `curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'`
    2. Capture the returned `task_id`
    3. Wait 15 seconds
    4. Check gateway logs for `notify-received` step execution (should show success or the log.warn)
    5. Check Inngest dashboard (http://localhost:8288) for the function run — verify `notify-received` step completed
    6. Poll task status to confirm it progresses beyond triaging: `curl -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/tasks/{task_id}"`
  - **Test 2 — VLRE guest-messaging** (via webhook simulation):
    1. Trigger: `curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-notify-e2e-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'`
    2. Capture returned task_id
    3. Wait 15 seconds
    4. Check gateway logs for `notify-received` success
    5. Poll task status to confirm progression
  - **Test 3 — Non-fatal verification**:
    1. Confirm from Test 1 and Test 2 that tasks reach `Executing` state (or beyond) — the notification did NOT block the lifecycle
  - Report: Log all curl responses and gateway log excerpts to evidence

  **Must NOT do**:
  - Modify any code — this task is verification only
  - Skip either tenant — both must be tested
  - Mark task complete if either test shows the lifecycle was blocked by the notification

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: No code changes — just curl commands and log inspection
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no UI interaction, all via curl/logs

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential, after Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `scripts/trigger-task.ts` — How the trigger endpoint works; returns `{ task_id, status_url }`
  - `src/gateway/routes/hostfully.ts` — Webhook handler; dedup by `message_uid`

  **External References**:
  - Admin API auth: `X-Admin-Key: $ADMIN_API_KEY` header
  - Inngest dashboard: `http://localhost:8288` — shows function run timeline with step status

  **WHY Each Reference Matters**:
  - `trigger-task.ts`: Confirms the expected response format from the trigger endpoint
  - `hostfully.ts`: Confirms `message_uid` must be unique (dedup key) — use a unique value per test run

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DozalDevs summarizer receives Slack notification
    Tool: Bash (curl)
    Preconditions: Gateway running with updated lifecycle, DozalDevs tenant has valid Slack token
    Steps:
      1. curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
      2. Capture task_id from response JSON
      3. Wait 15s
      4. Check gateway logs (tail /tmp/ai-dev.log) for "notify-received" or "Failed to send received notification"
      5. curl -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/tasks/{task_id}" — check status
    Expected Result: Gateway logs show notify-received step executed. Task status is "Executing" or beyond (never "Failed" from notification). Slack channel C0AUBMXKVNU has a new "⏳ Task received" message.
    Failure Indicators: Task stuck at "Triaging", lifecycle error mentioning notify-received, no log entry for the step
    Evidence: .sisyphus/evidence/task-2-dozaldevs-trigger.txt

  Scenario: VLRE guest-messaging receives Slack notification
    Tool: Bash (curl)
    Preconditions: Gateway running, VLRE tenant has valid Slack token, unique message_uid
    Steps:
      1. curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-notify-e2e-002","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
      2. Capture task_id from response
      3. Wait 15s
      4. Check gateway logs for "notify-received" execution
      5. Poll task status — confirm progresses past triaging
    Expected Result: Notification posted to C0960S2Q8RL. Task reaches "Executing" or beyond.
    Failure Indicators: Task status "Failed", no log of notify-received step, lifecycle blocked
    Evidence: .sisyphus/evidence/task-2-vlre-trigger.txt

  Scenario: Non-fatal — lifecycle continues even if channel is empty
    Tool: Bash (curl + log inspection)
    Preconditions: Both tests above completed
    Steps:
      1. Check evidence from above two scenarios
      2. Verify neither task has status "Failed" with an error related to notify-received
      3. If either task failed, check if failure was from the notification step (it should NOT be — try/catch should prevent this)
    Expected Result: Both tasks progressed past the notification step regardless of Slack success/failure
    Failure Indicators: Task status "Failed" with notify-received in error stack
    Evidence: .sisyphus/evidence/task-2-non-fatal-check.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm lint` + `pnpm test -- --run`. Review the modified file (`src/inngest/employee-lifecycle.ts`) for: `as any`/`@ts-ignore`, empty catches, console.log in prod, employee-specific language in the new step. Check that the new step follows the exact supersede pattern (lines 656-676). Verify no Block Kit header/divider blocks.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Pattern Match [YES/NO] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Trigger BOTH tenants (DozalDevs summarizer + VLRE guest-messaging). Confirm Slack notifications appear in the correct channels (C0AUBMXKVNU and C0960S2Q8RL). Verify message contains: ⏳ emoji, "Task received", role name, task ID context block. Verify tasks progress to Executing (non-fatal confirmation). Save screenshots/log output.
      Output: `Scenarios [N/N pass] | Channels correct [YES/NO] | Message format [YES/NO] | Non-fatal [YES/NO] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Read the git diff since before Task 1. Verify: ONLY `src/inngest/employee-lifecycle.ts` was modified. No other files touched. The diff adds ~30 lines (one new step). No employee-specific language in added lines. No imports added. No existing lines modified (insertion only). Flag any unexpected changes.
      Output: `Files changed [N] | Lines added [N] | Scope creep [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                    | Files                               | Pre-commit                        |
| ---- | --------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------- |
| 1    | `feat(lifecycle): add task-received Slack notification for processing visibility` | `src/inngest/employee-lifecycle.ts` | `pnpm lint && pnpm test -- --run` |
| 2    | — (no commit, verification only)                                                  | —                                   | —                                 |

---

## Success Criteria

### Verification Commands

```bash
pnpm lint                    # Expected: 0 errors
pnpm test -- --run           # Expected: all existing tests pass, no new failures
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
                             # Expected: 202 response, notification in C0AUBMXKVNU within 30s
```

### Final Checklist

- [ ] All "Must Have" present (task ID context block, employee-agnostic, non-fatal, channel resolution)
- [ ] All "Must NOT Have" absent (no employee-specific language, no new imports, no header/divider blocks, no other files modified)
- [ ] Lint and tests pass
- [ ] Both tenants receive notifications
- [ ] Lifecycle not blocked by notification failures
