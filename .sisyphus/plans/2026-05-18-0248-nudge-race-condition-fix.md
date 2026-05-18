# Fix Nudge Broadcast Race Condition on Supersede

## TL;DR

> **Quick Summary**: Fix a race condition where nudge broadcasts persist in Slack after a task is superseded, by adding three defensive layers: pre-post status guard, post-post cleanup, and a re-read in the supersede handler. Also improve the "already been processed" message to differentiate between supersede and duplicate actions.
>
> **Deliverables**:
>
> - Nudge broadcast reliably cleaned up on supersede (no more orphaned ⏳ Reviewing messages)
> - "Already processed" Slack message differentiates supersede from duplicate action
> - All changes in shared lifecycle code (employee-agnostic)
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → F1-F4

---

## Context

### Original Request

User reported that after rejecting a draft in the guest-messaging approval flow, two problems appeared:

1. **"⚠️ This response has already been processed"** — appeared after modal submission, confusing because the user didn't know why
2. **Stale nudge broadcast** — a "⏳ guest-messaging — Reviewing" nudge message appeared 2 minutes later and was never cleaned up

### Root Cause Analysis

**The race condition** occurs between two Inngest steps in different function invocations:

```
Task A's track-pending-approval step    Task B's handle-supersede step
────────────────────────────────────    ──────────────────────────────
1. Posts nudge to Slack
2. (hasn't written nudge_ts to DB yet)
                                         3. Reads Task A's metadata → no nudge_ts
                                         4. Sends supersede event
5. Writes nudge_ts to deliverable        6. Task A's handle-approval-result starts
   metadata                                 Reads metadata → no nudge_ts yet
                                            Nudge deletion skipped
7. nudge_ts now in DB but nobody
   reads it again → ORPHANED NUDGE
```

**Why "already processed" appears**: The supersede flow changes the task status from `Reviewing` to `Cancelled`. When the user submits the reject modal, `isTaskAwaitingApproval()` finds `Cancelled` → returns `false` → shows generic "already processed" message. The message is technically correct but doesn't tell the user what happened.

### Gap Analysis (self-review in lieu of Metis — session at subagent limit)

**Identified gaps addressed in this plan:**

- Pre-check guard alone is insufficient — there's a window between "check status" and "post nudge" where supersede can occur
- `handle-approval-result` line 1450-1461 deletes nudge BEFORE action branching, but metadata may be stale from the race
- The `action === 'superseded'` branch (line 2000-2043) does NOT independently attempt nudge cleanup
- The "already processed" message is identical across supersede, duplicate action, and expired scenarios — poor UX
- **Edge case**: nudge posts successfully but metadata write fails → orphaned nudge with no DB reference (pre-existing issue, out of scope)

---

## Work Objectives

### Core Objective

Eliminate orphaned nudge broadcasts on task supersede through three defensive layers, and improve the "already processed" UX message to be context-specific.

### Concrete Deliverables

- `src/inngest/employee-lifecycle.ts` — status guard before/after nudge posting, nudge re-read in supersede branch
- `src/gateway/slack/handlers.ts` — status-specific "already processed" messages
- Updated tests for the new behavior

### Definition of Done

- [ ] `pnpm build` succeeds with no errors
- [ ] `pnpm test -- --run` passes (1333+, known pre-existing failures only)
- [ ] Nudge is not posted when task status is not `Reviewing`
- [ ] Nudge is deleted immediately if task status changes after posting
- [ ] Supersede branch in `handle-approval-result` re-reads and deletes nudge
- [ ] "Already processed" messages differentiate supersede from duplicate

### Must Have

- Pre-posting task status check before nudge (Layer 1)
- Post-posting task status re-check with immediate nudge deletion on mismatch (Layer 2)
- Nudge re-read + cleanup in the `action === 'superseded'` branch of `handle-approval-result` (Layer 3)
- Status-specific messages in Slack handlers when `isTaskAwaitingApproval` returns false

### Must NOT Have (Guardrails)

- Do NOT add employee-specific language to `employee-lifecycle.ts` or `handlers.ts` — both are shared infrastructure
- Do NOT change the supersede flow's core logic (detection, event routing, card updates) — only add cleanup
- Do NOT add blocking waits or `setTimeout` delays to the supersede step — use re-reads with bounded retries only in `handle-approval-result`
- Do NOT change `isTaskAwaitingApproval` return type to avoid breaking all 5 callers — check status separately in handlers
- Do NOT add `unfurl_links` changes or other unrelated improvements in this plan
- Do NOT modify `src/inngest/lib/poll-completion.ts` or `src/inngest/lib/pending-approvals.ts`
- Do NOT change the approval card builder (`post-guest-approval.ts`)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (verify existing tests pass + add new test cases for the race guard)
- **Framework**: vitest via `pnpm test -- --run`

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Lifecycle**: Use Bash — grep for guard patterns, run build, run tests
- **Slack Handlers**: Use Bash — grep for updated message text, verify handler logic

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent changes):
├── Task 1: Add pre/post status guard to nudge posting in track-pending-approval [quick]
├── Task 2: Add nudge re-read + cleanup to supersede branch in handle-approval-result [quick]
└── Task 3: Differentiate "already processed" messages in Slack handlers [quick]

Wave 2 (After Wave 1 — verification):
├── Task 4: Build, test, Docker rebuild [quick]
└── Task 5: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks   |
| ---- | ---------- | -------- |
| 1    | —          | 4        |
| 2    | —          | 4        |
| 3    | —          | 4        |
| 4    | 1, 2, 3    | 5, F1-F4 |
| 5    | 4          | —        |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks → T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 2 tasks → T4 `quick`, T5 `quick`
- **FINAL**: 4 tasks → F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Add pre/post status guard to nudge posting in `track-pending-approval`

  **What to do**:

  In `src/inngest/employee-lifecycle.ts`, modify the nudge posting block inside `track-pending-approval` step (lines 1343-1402). Add two defensive checks:

  **Layer 1 — Pre-posting guard** (before posting the nudge, ~line 1356, after getting `botTokenForNudge`):

  ```typescript
  // Before posting nudge, verify task is still in Reviewing state
  const statusCheckRes = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`, {
    headers,
  });
  const statusCheckRows = (await statusCheckRes.json()) as Array<{ status: string }>;
  const currentStatus = statusCheckRows[0]?.status;
  if (currentStatus !== 'Reviewing') {
    log.info(
      { taskId, currentStatus },
      'Task no longer Reviewing before nudge — skipping nudge broadcast',
    );
    return; // Skip nudge entirely (but trackPendingApproval already ran — that's fine)
  }
  ```

  This goes right after the `if (botTokenForNudge)` check and before the nudge text construction.

  **Layer 2 — Post-posting guard** (after nudge metadata is written, ~line 1396, after the metadata PATCH):

  ```typescript
  // Re-check task status after posting nudge — if superseded during posting, delete immediately
  const postNudgeStatusRes = await fetch(
    `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`,
    { headers },
  );
  const postNudgeStatusRows = (await postNudgeStatusRes.json()) as Array<{ status: string }>;
  const postNudgeStatus = postNudgeStatusRows[0]?.status;
  if (postNudgeStatus !== 'Reviewing') {
    log.warn(
      { taskId, postNudgeStatus, nudgeTs: nudgeResult.ts },
      'Task superseded during nudge posting — deleting nudge immediately',
    );
    try {
      await web.chat.delete({ channel: notifyMsgRef.channel, ts: nudgeResult.ts });
      log.info({ taskId, nudgeTs: nudgeResult.ts }, 'Orphaned nudge deleted after post-check');
    } catch (delErr) {
      log.warn({ taskId, delErr }, 'Failed to delete orphaned nudge (non-fatal)');
    }
  }
  ```

  This goes right after the existing `log.info({ taskId, nudgeTs: nudgeResult.ts }, 'Nudge broadcast posted')` line.

  Note: The `web` (WebClient instance) and `headers` variables are already in scope. `supabaseUrl` is also available from the outer closure.

  **Must NOT do**:
  - Do NOT move the `trackPendingApproval()` call — it must still run regardless of the guard
  - Do NOT add `setTimeout` or artificial delays — just DB queries
  - Do NOT use `return` from the outer step — only skip the nudge posting block
  - Do NOT change the nudge content, format, or channel logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1343-1402` — The `track-pending-approval` step. Lines 1356-1396 are the nudge posting block inside `if (botTokenForNudge)`.
  - `src/inngest/employee-lifecycle.ts:1450-1461` — Existing nudge deletion pattern in `handle-approval-result` (use same `chat.delete` call pattern)
  - `src/inngest/employee-lifecycle.ts:1249-1253` — `set-reviewing` step that patches task status to `Reviewing` — the guard checks this status

  **API/Type References**:
  - `supabaseUrl`, `supabaseKey`, `headers` are all available from the outer `employee/universal-lifecycle` function scope
  - `web` is a `WebClient` instance created at line 1363-1364

  **Acceptance Criteria**:
  - [ ] Pre-posting status check exists before nudge `postMessage`
  - [ ] Post-posting status re-check exists after metadata PATCH
  - [ ] Post-check deletes nudge immediately if task is no longer `Reviewing`
  - [ ] Both checks use existing `headers` and `supabaseUrl` (no new DB connections)
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify pre-posting guard exists
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "Task no longer Reviewing before nudge" src/inngest/employee-lifecycle.ts
      2. Assert: 1 match found
    Expected Result: Pre-posting guard log message present
    Evidence: .sisyphus/evidence/task-1-pre-guard-verify.txt

  Scenario: Verify post-posting guard exists
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "Task superseded during nudge posting" src/inngest/employee-lifecycle.ts
      2. Assert: 1 match found
      3. Run: grep -n "Orphaned nudge deleted after post-check" src/inngest/employee-lifecycle.ts
      4. Assert: 1 match found
    Expected Result: Post-posting guard with immediate deletion present
    Evidence: .sisyphus/evidence/task-1-post-guard-verify.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: clean exit
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `fix(lifecycle): guard nudge posting against supersede race and clean up orphaned nudge on supersede`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Add nudge re-read + cleanup to supersede branch in `handle-approval-result`

  **What to do**:

  In `src/inngest/employee-lifecycle.ts`, modify the `action === 'superseded'` branch (lines 2000-2043) to add a nudge cleanup attempt. Currently this branch updates the approval card and notify message, patches status to `Cancelled`, and clears pending approval — but does NOT delete the nudge.

  The nudge deletion at line 1450-1461 (which runs before the action branch) may have missed the nudge due to the race condition (metadata not yet written). The supersede branch should re-read and retry.

  After the `clearPendingApprovalByTaskId` call at line 2043, add:

  ```typescript
  // Defensive nudge cleanup — re-read deliverable metadata in case
  // nudge_ts was written by track-pending-approval after the initial read
  try {
    const nudgeRetryRes = await fetch(
      `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
      { headers },
    );
    const nudgeRetryRows = (await nudgeRetryRes.json()) as Array<{
      metadata: Record<string, unknown> | null;
    }>;
    const nudgeRetryMeta = (nudgeRetryRows[0]?.metadata as Record<string, unknown>) ?? {};
    const retryNudgeTs = nudgeRetryMeta.nudge_ts as string | undefined;
    const retryNudgeChannel = nudgeRetryMeta.nudge_channel as string | undefined;
    if (retryNudgeTs && retryNudgeChannel) {
      const { WebClient } = await import('@slack/web-api');
      const web = new WebClient(botToken);
      await web.chat.delete({ channel: retryNudgeChannel, ts: retryNudgeTs });
      log.info({ taskId, retryNudgeTs }, 'Supersede branch: orphaned nudge deleted on re-read');
    }
  } catch (err) {
    log.warn({ taskId, err }, 'Supersede branch: failed to clean up nudge on re-read (non-fatal)');
  }
  ```

  **Why re-read works here**: By the time `handle-approval-result` reaches the supersede branch, it has already executed card updates, notify updates, status patch, and pending approval cleanup. All of this takes several seconds. By now, `track-pending-approval` has very likely completed and written `nudge_ts` to metadata. This is the final safety net.

  **Must NOT do**:
  - Do NOT add `setTimeout` delays — the natural execution time is sufficient
  - Do NOT move or duplicate the existing nudge deletion at line 1450-1461 — this is an additive retry
  - Do NOT change any existing logic in the supersede branch — only append cleanup after line 2043
  - Do NOT add employee-specific language

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:2000-2043` — The `action === 'superseded'` branch. New cleanup code goes after line 2043 (`await clearPendingApprovalByTaskId(...)`)
  - `src/inngest/employee-lifecycle.ts:1450-1461` — Existing nudge deletion pattern (same DB query + WebClient `chat.delete` pattern to follow)
  - `src/inngest/employee-lifecycle.ts:1207-1233` — Nudge deletion in `handle-supersede` step (another reference for the pattern)

  **API/Type References**:
  - `botToken` is in scope from line 1420
  - `supabaseUrl`, `headers` are in scope from the outer function
  - `@slack/web-api` `WebClient` is dynamically imported (follow existing pattern)

  **Acceptance Criteria**:
  - [ ] Supersede branch contains a re-read of deliverable metadata for nudge_ts
  - [ ] If nudge_ts found on re-read, it's deleted via `chat.delete`
  - [ ] Wrapped in try/catch (non-fatal)
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify supersede branch nudge cleanup exists
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "Supersede branch: orphaned nudge deleted" src/inngest/employee-lifecycle.ts
      2. Assert: 1 match found
      3. Run: grep -n "nudge_ts.*nudge_channel" src/inngest/employee-lifecycle.ts | wc -l
      4. Assert: at least 4 occurrences (original + handle-approval + handle-supersede + supersede branch)
    Expected Result: Supersede branch has its own nudge cleanup
    Evidence: .sisyphus/evidence/task-2-supersede-nudge-verify.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: clean exit
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `fix(lifecycle): guard nudge posting against supersede race and clean up orphaned nudge on supersede`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Differentiate "already processed" messages in Slack handlers

  **What to do**:

  In `src/gateway/slack/handlers.ts`, improve the "already been processed" messages to be status-specific. Currently, all 5 handlers show the same generic message when `isTaskAwaitingApproval` returns false.

  **Step 1 — Create a helper function** (after the existing `isTaskAwaitingOverride` function, around line 120):

  ```typescript
  async function getTaskStatusMessage(taskId: string): Promise<string> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) return '⚠️ This task has already been processed.';
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      const rows = (await res.json()) as Array<{ status: string }>;
      const status = rows[0]?.status;
      if (status === 'Done') return '✅ This task has already been approved and delivered.';
      if (status === 'Cancelled')
        return '⏭️ This task is no longer active — it may have been superseded by a newer message.';
      if (status === 'Failed') return '❌ This task has failed.';
      return '⚠️ This task has already been processed.';
    } catch {
      return '⚠️ This task has already been processed.';
    }
  }
  ```

  **Step 2 — Update all 5 handler blocks** that show the "already processed" message. In each handler, replace the hardcoded message text with a call to `getTaskStatusMessage(taskId)`.

  The 5 locations (identified by `isTaskAwaitingApproval` calls):
  1. **`approve` action** (line 295-316) — `'⚠️ This task has already been processed.'`
  2. **`reject` action** (line 375-396) — `'⚠️ This task has already been processed.'`
  3. **`guest_approve` action** (line 455-476) — `'⚠️ This task has already been processed.'`
  4. **`guest_edit_modal` view** (line 606-645) — `'⚠️ This task has already been processed.'`
  5. **`guest_reject_modal` view** (line 911-938) — `'⚠️ This response has already been processed.'`

  For each, change the pattern from:

  ```typescript
  text: '⚠️ This task has already been processed.',
  blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '⚠️ This task has already been processed.' } }, ...]
  ```

  To:

  ```typescript
  const statusMsg = await getTaskStatusMessage(taskId);
  // Then use statusMsg in both text: and blocks:
  ```

  **Must NOT do**:
  - Do NOT change `isTaskAwaitingApproval` return type or signature — too many callers
  - Do NOT add employee-specific language to the messages
  - Do NOT change the logic flow (still return early after showing the message)
  - Do NOT change the `BUTTON_BLOCKS` fallback in error cases — only the "already processed" messages

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:55-96` — `isTaskAwaitingApproval` function (reads task status — same pattern for new helper)
  - `src/gateway/slack/handlers.ts:295-316` — First "already processed" block (approve handler)
  - `src/gateway/slack/handlers.ts:375-396` — Second "already processed" block (reject handler)
  - `src/gateway/slack/handlers.ts:455-476` — Third "already processed" block (guest_approve handler)
  - `src/gateway/slack/handlers.ts:606-645` — Fourth "already processed" block (guest_edit_modal handler)
  - `src/gateway/slack/handlers.ts:911-938` — Fifth "already processed" block (guest_reject_modal handler)

  **Acceptance Criteria**:
  - [ ] `getTaskStatusMessage` helper exists and returns status-specific messages
  - [ ] All 5 handlers use the helper instead of hardcoded messages
  - [ ] Messages differentiate Done, Cancelled, Failed, and generic
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify helper function exists
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "getTaskStatusMessage" src/gateway/slack/handlers.ts
      2. Assert: at least 6 matches (1 definition + 5 call sites)
    Expected Result: Helper exists and is used in all handlers
    Evidence: .sisyphus/evidence/task-3-helper-verify.txt

  Scenario: Verify status-specific messages
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "superseded by a newer message" src/gateway/slack/handlers.ts
      2. Assert: 1 match (the Cancelled status message in the helper)
      3. Run: grep -n "already been approved and delivered" src/gateway/slack/handlers.ts
      4. Assert: 1 match (the Done status message in the helper)
    Expected Result: Differentiated messages present
    Evidence: .sisyphus/evidence/task-3-messages-verify.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: clean exit
    Expected Result: No type errors
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES (separate commit)
  - Message: `fix(slack): differentiate "already processed" messages by task status`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Build, test, reseed DB, rebuild Docker image

  **What to do**:
  - Run `pnpm build` — must succeed with 0 errors
  - Run `pnpm test -- --run` — must pass 1333+ tests (known pre-existing failures: `migration-agents-md.test.ts`)
  - Run `pnpm prisma db seed` — reseed DB
  - Run `docker build -t ai-employee-worker:latest .` in tmux — rebuild Docker image with updated lifecycle code

  **Must NOT do**:
  - Do NOT skip the Docker rebuild — lifecycle changes run inside the Docker container
  - Do NOT attempt to fix pre-existing test failures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after all implementation)
  - **Blocks**: Task 5, F1-F4
  - **Blocked By**: Tasks 1-3

  **Acceptance Criteria**:
  - [ ] `pnpm build` — 0 errors
  - [ ] `pnpm test -- --run` — 1333+ passing
  - [ ] `pnpm prisma db seed` — completes
  - [ ] `docker build` — completes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full build and test
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -3
      2. Assert: clean exit
      3. Run: pnpm test -- --run 2>&1 | tail -10
      4. Assert: 1333+ tests pass
    Expected Result: Build clean, tests green
    Evidence: .sisyphus/evidence/task-4-build-test.txt

  Scenario: Docker rebuild
    Tool: Bash (tmux)
    Steps:
      1. Launch: docker build -t ai-employee-worker:latest . in tmux ai-build
      2. Poll until EXIT_CODE detected
      3. Assert: exit code 0
    Expected Result: Docker image built
    Evidence: .sisyphus/evidence/task-4-docker-build.txt
  ```

  **Commit**: NO (no code changes in this task)

- [x] 5. Notify completion via Telegram

  **What to do**:
  - Run: `npx tsx scripts/telegram-notify.ts "📋 nudge-race-condition-fix complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 4)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **Acceptance Criteria**:
  - [ ] Telegram notification sent

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Send notification
    Tool: Bash
    Steps:
      1. Run: npx tsx scripts/telegram-notify.ts "📋 nudge-race-condition-fix complete"
      2. Assert: exit code 0
    Expected Result: Message delivered
    Evidence: .sisyphus/evidence/task-5-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for type errors, unused imports, `as any` casts, console.log in prod.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Grep for the status guard pattern, verify the supersede branch has nudge cleanup, verify handler messages are differentiated.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: verify 1:1 match between spec and diff. Check no files outside scope were touched. Verify lifecycle changes are employee-agnostic.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                               | Files                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1      | `fix(lifecycle): guard nudge posting against supersede race and clean up orphaned nudge on supersede` | `src/inngest/employee-lifecycle.ts`, `tests/inngest/lifecycle-*.test.ts`                      |
| 2      | `fix(slack): differentiate "already processed" messages by task status`                               | `src/gateway/slack/handlers.ts`, `tests/gateway/slack/guest-handlers.test.ts` (if applicable) |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: clean exit, no errors
pnpm test -- --run  # Expected: 1333+ passing, known pre-existing failures only
```

### Final Checklist

- [x] Pre-posting status guard present in `track-pending-approval`
- [x] Post-posting re-check + immediate nudge deletion on status mismatch
- [x] Supersede branch in `handle-approval-result` re-reads metadata and deletes nudge
- [x] "Already processed" messages differentiate supersede from duplicate
- [x] All changes are employee-agnostic
- [x] All tests pass
- [x] Docker image rebuilt
