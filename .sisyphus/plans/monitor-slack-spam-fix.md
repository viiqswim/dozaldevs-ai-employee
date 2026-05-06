# Monitor Slack Spam & Notification Fallthrough Fix

## TL;DR

> **Quick Summary**: Fix three compounding issues causing Slack channel flooding: (1) the `unresponded-message-monitor` cron triggers lifecycle notifications every 30 minutes via a `null` → tenant fallthrough bug in `resolveNotificationChannel` and a secondary `SUMMARY_TARGET_CHANNEL` fallback in the lifecycle, (2) monitor tasks accumulate across 30-min slots due to slot-based dedup, and (3) issue 3 (STEP 1 buttons) is user-accepted — no change needed.
>
> **Deliverables**:
>
> - `resolveNotificationChannel()` treats `null` as explicit suppress (not fallthrough)
> - Lifecycle `notify-received` step respects suppressed channel (no `SUMMARY_TARGET_CHANNEL` fallback leak)
> - Monitor trigger uses stable `externalId` (no slot-based rotation) to prevent task accumulation
> - Updated tests for all changed behaviors
> - Cleanup of accumulated stuck tasks
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (resolveNotificationChannel fix) → T3 (lifecycle fix) → T5 (seed + rebuild) → T6 (E2E verify) → F1-F4

---

## Context

### Original Request

User reported Slack channel `C0960S2Q8RL` being flooded with "Guest message task processed — no unresponded messages found" and "⏳ Task received — processing" messages. Investigation revealed the `unresponded-message-monitor` cron (every 30 min) was the primary source, compounded by task accumulation during gateway downtime that created a burst of 75+ tasks resolving simultaneously.

### Investigation Summary

**Key Findings**:

- `resolveNotificationChannel()` uses `??` (nullish coalescing): `null ?? 'C0960S2Q8RL'` = `'C0960S2Q8RL'` — treats `null` as "no value" instead of "explicitly no notification"
- Lifecycle `notify-received` (line 163-166) has a secondary fallback: `NOTIFICATION_CHANNEL ?? SUMMARY_TARGET_CHANNEL ?? ''` — even if `NOTIFICATION_CHANNEL` is suppressed, `SUMMARY_TARGET_CHANNEL` leaks through
- Monitor archetype has `notification_channel: null` but VLRE tenant config has both `notification_channel: 'C0960S2Q8RL'` and `summary.target_channel: 'C0960S2Q8RL'`
- Monitor dedup key `monitor-${tenantId}-${slotKey}` rotates every 30 min — tasks from different slots bypass dedup
- When 75+ tasks resolved simultaneously (backlog flush), each posted a Slack notification
- Existing test `notification-channel.test.ts:13-19` explicitly asserts the `null` fallthrough behavior — must be inverted
- PLAT-07/08 plan already executed — `resolveNotificationChannel` and `notification_channel` column exist. No conflict.

### Metis Review

**Identified Gaps** (addressed):

- `SUMMARY_TARGET_CHANNEL` fallback in lifecycle is a second notification leak path — must be fixed alongside `resolveNotificationChannel`
- `null` vs `undefined` distinction: `null` = explicit suppress, `undefined` = unset (fall through). Must use `=== null` check, not change `??` behavior globally
- Terminal state updates already guard with `if (notifyMsgRef?.ts && notifyMsgRef?.channel)` — safe when notification is suppressed
- Monitor trigger test (line 133-160) checks externalId format — will need update

---

## Work Objectives

### Core Objective

Stop the `unresponded-message-monitor` from posting Slack notifications every 30 minutes and prevent task accumulation across cron slots.

### Concrete Deliverables

- `src/gateway/services/notification-channel.ts` — `null` treated as explicit suppress
- `src/inngest/employee-lifecycle.ts` — `notify-received` step only uses `NOTIFICATION_CHANNEL` (no `SUMMARY_TARGET_CHANNEL` fallback)
- `src/inngest/triggers/monitor-trigger.ts` — stable externalId without slot rotation
- `tests/gateway/services/notification-channel.test.ts` — updated to assert `null` = suppress
- `tests/inngest/triggers/monitor-trigger.test.ts` — updated for new externalId format
- Accumulated stuck tasks cleaned up

### Definition of Done

- [ ] Monitor cron fires without posting any Slack notification
- [ ] `resolveNotificationChannel(null, 'C_TENANT')` returns `''` (not `'C_TENANT'`)
- [ ] `resolveNotificationChannel(undefined, 'C_TENANT')` returns `'C_TENANT'` (undefined still falls through)
- [ ] No task accumulation across 30-min slots
- [ ] All existing tests pass (updated where behavior changed)

### Must Have

- `null` = explicit suppress in `resolveNotificationChannel`
- `undefined` = unset, falls through to tenant config (preserves existing behavior for other archetypes)
- No `SUMMARY_TARGET_CHANNEL` fallback leak in `notify-received`
- Stable externalId for monitor (no slot rotation)
- Updated tests reflecting new behavior

### Must NOT Have (Guardrails)

- DO NOT modify `createTaskAndDispatch` — it is shared infrastructure
- DO NOT change behavior for archetypes with explicit non-null `notification_channel`
- DO NOT change behavior for archetypes with `undefined` notification_channel
- DO NOT modify guest-messaging archetype, summarizer archetype, or their notification paths
- DO NOT add rate-limiting, logging, or other features beyond the two bug fixes
- DO NOT change the monitor's core behavior (querying stale approvals, posting reminders)
- DO NOT modify `send-message.ts`, `post-message.ts`, or shell tools

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after — update existing tests + add new ones)
- **Framework**: Vitest (`pnpm test`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit changes**: Use Bash — run specific Vitest tests
- **Lifecycle changes**: Use Bash — verify behavior via test suite
- **E2E**: Use Bash (curl) — trigger monitor manually, verify no Slack notification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — parallel fixes):
├── Task 1: Fix resolveNotificationChannel null semantics [quick]
├── Task 2: Fix monitor trigger dedup (stable externalId) [quick]
├── Task 3: Fix lifecycle notify-received SUMMARY_TARGET_CHANNEL fallback [quick]
└── Task 4: Clean up accumulated stuck tasks [quick]

Wave 2 (After Wave 1 — rebuild + verify):
├── Task 5: Docker rebuild + seed apply [quick]
└── Task 6: E2E verification — trigger monitor, verify no Slack notification [deep]

Wave FINAL (After ALL tasks):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
└── F4: Scope Fidelity Check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T3, T5 | 1    |
| T2   | —          | T5     | 1    |
| T3   | T1         | T5     | 1    |
| T4   | —          | T6     | 1    |
| T5   | T1, T2, T3 | T6     | 2    |
| T6   | T4, T5     | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `quick`, T2 `quick`, T3 `quick`, T4 `quick`
- **Wave 2**: 2 tasks — T5 `quick`, T6 `deep`
- **Final**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Fix `resolveNotificationChannel` null semantics

  **What to do**:
  - In `src/gateway/services/notification-channel.ts`, change the function to treat `null` as explicit suppress (return `''`), while `undefined` still falls through to tenant config
  - Current code: `return archetype.notification_channel ?? tenantConfig.notification_channel ?? '';`
  - New code: if `archetype.notification_channel === null`, return `''` immediately. If `archetype.notification_channel` is a non-empty string, return it. If `archetype.notification_channel` is `undefined`, fall through to `tenantConfig.notification_channel ?? ''`
  - Concrete implementation:
    ```typescript
    if (archetype.notification_channel === null) return '';
    return archetype.notification_channel ?? tenantConfig.notification_channel ?? '';
    ```
  - Update `tests/gateway/services/notification-channel.test.ts`:
    - **Invert test at line 13-19**: Change assertion from `expect(result).toBe('C_TENANT')` to `expect(result).toBe('')` — `null` now returns empty string
    - **Add new test**: `'returns tenant value when archetype notification_channel is undefined'` — `resolveNotificationChannel({ notification_channel: undefined }, { notification_channel: 'C_TENANT' })` should return `'C_TENANT'`
    - Keep all other existing tests unchanged

  **Must NOT do**:
  - Do NOT change the function signature
  - Do NOT add logging or error handling
  - Do NOT change behavior for non-null string values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/gateway/services/notification-channel.ts:6-11` — the function to modify (single line 10 is the return statement)
  - `tests/gateway/services/notification-channel.test.ts:13-19` — existing test to invert (currently asserts null falls through to tenant)
  - `tests/gateway/services/notification-channel.test.ts:21-24` — test for both null (keep, it still returns `''`)

  **WHY Each Reference Matters**:
  - Line 10 is the exact line to change — add a `=== null` early return before the `??` chain
  - Lines 13-19 test the exact behavior being changed — must update assertion from `'C_TENANT'` to `''`

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: null archetype channel returns empty string (no fallthrough)
    Tool: Bash
    Preconditions: notification-channel.ts modified
    Steps:
      1. Run: pnpm test -- --run tests/gateway/services/notification-channel.test.ts
      2. Assert all tests pass including the inverted null test
      3. Verify test output shows "returns empty string when archetype notification_channel is null" or similar
    Expected Result: All tests pass, null = suppress behavior verified
    Failure Indicators: Test still asserts null falls through to tenant
    Evidence: .sisyphus/evidence/task-1-null-suppress.txt

  Scenario: undefined archetype channel still falls through to tenant
    Tool: Bash (grep test file)
    Preconditions: notification-channel.test.ts updated
    Steps:
      1. Grep test file for "undefined" test case
      2. Verify it asserts result === 'C_TENANT' (fallthrough preserved)
    Expected Result: undefined falls through to tenant config
    Evidence: .sisyphus/evidence/task-1-undefined-fallthrough.txt
  ```

  **Commit**: YES (separate)
  - Message: `fix(notifications): treat null notification_channel as explicit suppress`
  - Files: `src/gateway/services/notification-channel.ts`, `tests/gateway/services/notification-channel.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/services/notification-channel.test.ts`

- [x] 2. Fix monitor trigger dedup — stable externalId

  **What to do**:
  - In `src/inngest/triggers/monitor-trigger.ts`, change the `externalId` from slot-based to stable
  - Current code (line 50): `externalId: \`monitor-${archetype.tenant_id}-${slotKey}\``
  - New code: `externalId: \`monitor-${archetype.tenant_id}\``
  - Remove the `slotKey` calculation (line 44): `const slotKey = Math.floor(Date.now() / (30 * 60 * 1000));` — no longer needed
  - This means: only ONE active monitor task per tenant can exist at any time. The `createTaskAndDispatch` dedup query checks `status=not.in.(Done,Failed,Cancelled)` — so a completed task unblocks the next cron fire, and an in-flight task blocks duplicate creation
  - Update `tests/inngest/triggers/monitor-trigger.test.ts`:
    - **Update test at line 133-160**: Change assertion from `expect.stringMatching(/^monitor-tenant-xyz-/)` to `expect.stringMatching(/^monitor-tenant-xyz$/)` (no trailing slot key)

  **Must NOT do**:
  - Do NOT modify `createTaskAndDispatch` — it is shared infrastructure
  - Do NOT change the cron schedule (`*/30 * * * *`)
  - Do NOT change the archetype discovery logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `src/inngest/triggers/monitor-trigger.ts:44-52` — the externalId generation and createTaskAndDispatch call
  - `src/inngest/lib/create-task-and-dispatch.ts:44-51` — the dedup query (DO NOT MODIFY — reference only)
  - `tests/inngest/triggers/monitor-trigger.test.ts:133-160` — the externalId format test

  **WHY Each Reference Matters**:
  - Lines 44-52 are the exact lines to change — remove slotKey, use stable externalId
  - Lines 44-51 of create-task-and-dispatch show the dedup query that already handles the stable key correctly
  - Test lines 133-160 assert the externalId format — must match new pattern

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Monitor uses stable externalId without slot key
    Tool: Bash
    Preconditions: monitor-trigger.ts modified
    Steps:
      1. Grep for "slotKey" in monitor-trigger.ts — should return 0 matches
      2. Grep for "externalId" in monitor-trigger.ts — should show stable format without Math.floor
      3. Run: pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts
      4. Assert all tests pass
    Expected Result: No slotKey calculation, stable externalId, all tests pass
    Failure Indicators: slotKey still present, or test expects slot-based format
    Evidence: .sisyphus/evidence/task-2-stable-dedup.txt

  Scenario: Dedup prevents duplicate tasks across cron fires
    Tool: Bash (code review)
    Preconditions: monitor-trigger.ts modified
    Steps:
      1. Read the externalId line — confirm format is `monitor-${tenantId}` (no variable suffix)
      2. Verify createTaskAndDispatch's dedup query (read-only) filters on this exact externalId
    Expected Result: Same externalId across cron fires = dedup blocks duplicate
    Evidence: .sisyphus/evidence/task-2-dedup-logic.txt
  ```

  **Commit**: YES (separate)
  - Message: `fix(monitor): use stable externalId to prevent task accumulation`
  - Files: `src/inngest/triggers/monitor-trigger.ts`, `tests/inngest/triggers/monitor-trigger.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts`

- [x] 3. Fix lifecycle `notify-received` SUMMARY_TARGET_CHANNEL fallback

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the `notify-received` step (line 150-192)
  - Lines 163-166 currently read:
    ```typescript
    const channel =
      tenantEnvForNotify['NOTIFICATION_CHANNEL'] ??
      tenantEnvForNotify['SUMMARY_TARGET_CHANNEL'] ??
      '';
    ```
  - Change to use ONLY `NOTIFICATION_CHANNEL`:
    ```typescript
    const channel = tenantEnvForNotify['NOTIFICATION_CHANNEL'] ?? '';
    ```
  - **Why**: `SUMMARY_TARGET_CHANNEL` is for the summarizer employee's approval flow. It should NOT be used as a fallback for generic task notifications. When `resolveNotificationChannel` returns `''` (suppressed), `loadTenantEnv` does NOT set `NOTIFICATION_CHANNEL` in the env — but `SUMMARY_TARGET_CHANNEL` is still injected from tenant config `summary.target_channel`. This creates a leak path where suppressed notifications still fire.
  - The guard at line 167 (`if (!botToken || !channel) return { ts: null, channel: null }`) already handles the empty channel case — returning `{ts: null, channel: null}` means no notification.
  - All terminal state update steps already guard with `if (notifyMsgRef?.ts && notifyMsgRef?.channel)` — safe when `ts` is null.

  **Must NOT do**:
  - Do NOT modify any other step in the lifecycle
  - Do NOT add employee-specific language to the lifecycle (shared file)
  - Do NOT change the `mark-failed`, `complete-no-action-timeout`, or any other terminal state update steps
  - Do NOT remove `SUMMARY_TARGET_CHANNEL` from `loadTenantEnv` — it's used elsewhere

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (but logically depends on T1 for the semantic change to be meaningful)
  - **Parallel Group**: Wave 1 — start after T1 completes
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:163-166` — the exact lines to change (channel resolution in notify-received)
  - `src/inngest/employee-lifecycle.ts:167` — the guard that handles empty channel (already correct)
  - `src/inngest/employee-lifecycle.ts:620-628` — terminal state update example showing `if (notifyMsgRef?.ts && notifyMsgRef?.channel)` guard (safe)

  **WHY Each Reference Matters**:
  - Lines 163-166 are the exact code change — remove `SUMMARY_TARGET_CHANNEL` fallback
  - Line 167 confirms empty channel is handled correctly (no notification posted)
  - Lines 620-628 confirm terminal updates won't crash when `ts: null`

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: notify-received uses only NOTIFICATION_CHANNEL
    Tool: Bash (grep)
    Preconditions: employee-lifecycle.ts modified
    Steps:
      1. Grep for "SUMMARY_TARGET_CHANNEL" in the notify-received step area (lines 150-192)
      2. Should return 0 matches in that area
      3. Grep for "NOTIFICATION_CHANNEL" in the same area — should return 1 match
    Expected Result: Only NOTIFICATION_CHANNEL used, no SUMMARY_TARGET_CHANNEL fallback
    Failure Indicators: SUMMARY_TARGET_CHANNEL still referenced in notify-received
    Evidence: .sisyphus/evidence/task-3-no-summary-fallback.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: employee-lifecycle.ts modified
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0 (excluding known pre-existing failures)
    Expected Result: All tests pass — no regressions from removing fallback
    Failure Indicators: New test failures related to channel resolution
    Evidence: .sisyphus/evidence/task-3-test-suite.txt
  ```

  **Commit**: YES (separate)
  - Message: `fix(lifecycle): remove SUMMARY_TARGET_CHANNEL fallback in notify-received`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Clean up accumulated stuck monitor tasks

  **What to do**:
  - Query for all `unresponded-message-monitor` tasks in non-terminal states via PostgREST:
    ```
    curl -s "http://localhost:54321/rest/v1/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000016&status=not.in.(Done,Failed,Cancelled)&select=id,status,created_at" \
      -H "apikey: <service_role_key>" -H "Authorization: Bearer <service_role_key>"
    ```
  - Patch ALL of them to `Done` status in a single PATCH:
    ```
    curl -X PATCH "http://localhost:54321/rest/v1/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000016&status=not.in.(Done,Failed,Cancelled)" \
      -H "apikey: <service_role_key>" -H "Authorization: Bearer <service_role_key>" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" \
      -d '{"status":"Done"}'
    ```
  - Use the service role JWT from AGENTS.md: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hmuj5FMNJSzOAzI4c`
  - Use PostgREST port 54321 (Kong proxy) — NOT 54331 which may require different auth
  - Also clean up any stuck `guest-messaging` tasks that were part of the burst

  **Must NOT do**:
  - Do NOT delete tasks — only patch status to Done
  - Do NOT modify any code files
  - Do NOT clean up tasks from other archetypes (summarizer, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - AGENTS.md § "PostgREST URL" — auth headers and JWT
  - Monitor archetype ID: `00000000-0000-0000-0000-000000000016`
  - Guest-messaging archetype ID: `00000000-0000-0000-0000-000000000015`

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stuck monitor tasks remain
    Tool: Bash (curl)
    Preconditions: Patch command executed
    Steps:
      1. Query tasks: curl GET with archetype_id=00000000-0000-0000-0000-000000000016&status=not.in.(Done,Failed,Cancelled)
      2. Assert response is empty array []
    Expected Result: Zero non-terminal monitor tasks
    Failure Indicators: Any tasks still in Received, Ready, Executing, Submitting, Reviewing
    Evidence: .sisyphus/evidence/task-4-cleanup.txt
  ```

  **Commit**: NO (no code changes — DB cleanup only)

- [x] 5. Docker image rebuild + seed apply

  **What to do**:
  - The `resolveNotificationChannel` change (T1) and lifecycle change (T3) are gateway/inngest code — they do NOT require a Docker rebuild (they run in the gateway process, not inside the worker container)
  - The monitor trigger change (T2) also runs in the gateway process
  - However, run `pnpm build` to verify TypeScript compilation succeeds
  - Restart the gateway to pick up the changes (the gateway runs the Inngest functions including the lifecycle and monitor trigger)
  - Verify the changes are active by checking gateway logs

  **Must NOT do**:
  - Do NOT rebuild Docker image unless worker-tool changes were made (none in this plan)
  - Do NOT run `pnpm prisma migrate` (no schema changes)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - AGENTS.md § "Commands" — `pnpm build`
  - AGENTS.md § "CRITICAL — Rebuild after every worker change" — confirms gateway code does NOT need Docker rebuild

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript build succeeds
    Tool: Bash
    Preconditions: T1, T2, T3 complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Build succeeds with no errors
    Failure Indicators: TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: Gateway restarts successfully
    Tool: Bash (tmux)
    Preconditions: Build succeeds
    Steps:
      1. Restart gateway (kill existing, start new via pnpm dev or equivalent)
      2. Verify gateway logs show "Slack Bolt — Socket Mode connected"
      3. Verify Inngest functions are registered
    Expected Result: Gateway running with updated code
    Evidence: .sisyphus/evidence/task-5-gateway-restart.txt
  ```

  **Commit**: NO (build/deploy step)

- [x] 6. E2E verification — trigger monitor, verify no Slack notification

  **What to do**:
  - Trigger the unresponded-message-monitor manually via admin API:
    ```
    curl -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/unresponded-message-monitor/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
    ```
  - Capture the returned `task_id`
  - Monitor the task through its lifecycle — it should go `Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Done` WITHOUT posting any Slack notification
  - Verify: check Slack channel `C0960S2Q8RL` — there should be NO new "⏳ Task received — processing (unresponded-message-monitor)" message
  - Verify: the stable externalId dedup works — trigger a SECOND manual run while the first is still in-flight. The second should return `{ duplicate: true }` or silently skip
  - Also verify guest-messaging notifications STILL work — the summarizer and guest-messaging archetypes have explicit `notification_channel` set, so their notifications should be unaffected

  **Must NOT do**:
  - Do NOT approve or reject any tasks
  - Do NOT modify any code during this task

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T5)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5

  **References**:
  - AGENTS.md § "Admin API" — trigger endpoint
  - AGENTS.md § "VLRE tenant" — tenant ID `00000000-0000-0000-0000-000000000003`
  - Monitor archetype slug: `unresponded-message-monitor`

  **Acceptance Criteria**:
  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Monitor task completes without Slack notification
    Tool: Bash (curl)
    Preconditions: Gateway restarted with new code, accumulated tasks cleaned
    Steps:
      1. Note current time
      2. Trigger monitor: curl POST admin trigger endpoint
      3. Capture task_id from response
      4. Poll task status every 10s until Done (timeout 3 min)
      5. Check gateway logs for "notify-received" step — should show ts: null, channel: null
      6. Verify no new "⏳ Task received" message in C0960S2Q8RL after the noted time
    Expected Result: Task completes as Done, no Slack notification posted
    Failure Indicators: "⏳ Task received — processing" message appears in Slack
    Evidence: .sisyphus/evidence/task-6-no-notification.txt

  Scenario: Dedup blocks duplicate monitor task
    Tool: Bash (curl)
    Preconditions: First monitor task still in-flight or recently completed
    Steps:
      1. Trigger monitor again: same curl POST
      2. Check response or gateway logs — should show "Skipping — active task exists" or similar dedup message
    Expected Result: No new task created (dedup blocks it)
    Failure Indicators: Second task created with new task_id
    Evidence: .sisyphus/evidence/task-6-dedup-verified.txt
  ```

  **Commit**: NO (verification only)

- [x] 7. Notify completion — Send Telegram notification: plan `monitor-slack-spam-fix` complete, all tasks done, come back to review results.

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ monitor-slack-spam-fix complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Blocked By**: F1-F4 (Final Wave)

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run the tsx command above
      2. Assert exit code 0
    Expected Result: Notification sent
    Evidence: .sisyphus/evidence/task-7-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group | Message                                                                     | Files                                                                                                 | Pre-commit                                                               |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| T1    | `fix(notifications): treat null notification_channel as explicit suppress`  | `src/gateway/services/notification-channel.ts`, `tests/gateway/services/notification-channel.test.ts` | `pnpm test -- --run tests/gateway/services/notification-channel.test.ts` |
| T2    | `fix(monitor): use stable externalId to prevent task accumulation`          | `src/inngest/triggers/monitor-trigger.ts`, `tests/inngest/triggers/monitor-trigger.test.ts`           | `pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts`      |
| T3    | `fix(lifecycle): remove SUMMARY_TARGET_CHANNEL fallback in notify-received` | `src/inngest/employee-lifecycle.ts`                                                                   | `pnpm test -- --run`                                                     |

---

## Success Criteria

### Verification Commands

```bash
# notification-channel tests pass with new null semantics
pnpm test -- --run tests/gateway/services/notification-channel.test.ts

# monitor trigger tests pass with stable externalId
pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts

# full test suite passes
pnpm test -- --run
```

### Final Checklist

- [ ] `resolveNotificationChannel(null, 'C_TENANT')` returns `''`
- [ ] `resolveNotificationChannel(undefined, 'C_TENANT')` returns `'C_TENANT'`
- [ ] Lifecycle `notify-received` does NOT fall back to `SUMMARY_TARGET_CHANNEL`
- [ ] Monitor uses stable externalId `monitor-${tenantId}` (no slot key)
- [ ] No accumulated stuck monitor tasks in DB
- [ ] Manual trigger of monitor produces NO Slack notification in `C0960S2Q8RL`
- [ ] No modifications to shared infrastructure (`createTaskAndDispatch`)
- [ ] No modifications to guest-messaging or summarizer archetypes
