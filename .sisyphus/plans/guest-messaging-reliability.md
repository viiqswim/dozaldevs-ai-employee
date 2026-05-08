# Guest-Messaging Reliability: Metadata Validation, Tool Self-Write, and Cron Dedup

## TL;DR

> **Quick Summary**: Fix a model reliability bug where MiniMax M2.7 sometimes writes placeholder metadata instead of calling Slack tools, causing the approval card to silently fail. Make tools self-write output files, add harness validation, and fix cron/webhook dedup.
>
> **Deliverables**:
>
> - `post-guest-approval.ts` writes `/tmp/approval-message.json` directly (no stdout piping)
> - Harness validates metadata before creating deliverable — rejects placeholders
> - Lifecycle `track-pending-approval` logs error instead of silently returning
> - Cron dedup checks for active tasks across both webhook and poll namespaces
> - Updated archetype instructions removing fragile pipe/enrichment patterns
> - Tests for all changes
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 7 → Task 8 → F1-F4

---

## Context

### Original Request

Fix guest-messaging AI employee reliability — task `03322964` failed because the model wrote placeholder metadata in `/tmp/approval-message.json` instead of calling the Slack tool. The approval card never appeared, the lifecycle hung forever at `wait-for-approval`.

### Interview Summary

**Key Discussions**:

- **Root cause confirmed**: MiniMax M2.7 non-deterministically skips the `post-guest-approval.ts` tool call and writes placeholders directly. The successful task `42a82723` called the tool correctly; the failed task `03322964` wrote the file directly with fake values in ~6 seconds.
- **Solution**: Have the tool write the output file directly (not rely on stdout piping), validate in harness, and fail immediately on bad metadata.
- **Cron dedup**: Both unified external_id check AND active-task check across namespaces.

**Research Findings**:

- `/tmp/employee-03322964.log` confirms local Docker container `6d53c467c032`, NOT Fly.io
- `post-guest-approval.ts` already exists with idempotency guard, rich approval blocks, and proper Slack API integration
- The tool outputs `{"ts":"...","channel":"..."}` to stdout; the model must pipe this to the file AND separately enrich with `conversationRef` via `node -e`
- `post-no-action-notification.ts` referenced in archetype instructions does NOT exist — separate bug, out of scope
- Cron uses `hostfully-poll-{leadUid}-{date}` while webhook uses `hostfully-msg-{messageUid}` — no cross-namespace dedup

### Metis Review

**Identified Gaps** (addressed):

- **phantom Task 2**: `post-no-action-notification.ts` does not exist — dropped from plan
- **conversationRef flag**: Tool needs new `--conversation-ref` CLI flag to replace `node -e` enrichment
- **seed test line 93**: `toContain('/tmp/approval-message.json')` assertion still passes since instructions still reference the file
- **cross-namespace dedup**: Cron must check by `lead_uid` across ALL external_id prefixes, not just `hostfully-poll-*`
- **lifecycle constraint**: `track-pending-approval` change is a minimal guardrail (log.warn), not a structural lifecycle change

---

## Work Objectives

### Core Objective

Eliminate the fragile stdout-piping pattern that causes silent failures when the model hallucinates, and add validation at harness and lifecycle layers.

### Concrete Deliverables

- Modified `src/worker-tools/slack/post-guest-approval.ts` — writes `/tmp/approval-message.json` directly
- Modified `src/workers/opencode-harness.mts` — validates metadata, rejects placeholders
- Modified `src/inngest/employee-lifecycle.ts` — `track-pending-approval` logs warning instead of silent return
- Modified `src/inngest/triggers/guest-message-poll.ts` — cross-namespace active-task check
- Updated `prisma/seed.ts` — archetype instructions (guest-messaging)
- New tests for validation and dedup

### Definition of Done

- [ ] `pnpm test -- --run` passes (zero new failures)
- [ ] `pnpm build` passes
- [ ] Docker image rebuilt successfully
- [ ] E2E test: Airbnb message → worker → approval card in Slack → approve → reply delivered

### Must Have

- Tool writes `/tmp/approval-message.json` directly with validated data
- Tool includes `conversationRef` in the written file
- Harness rejects placeholder patterns (`PLACEHOLDER` in values)
- Harness rejects missing `ts` or `channel` fields
- Task fails immediately on invalid metadata (not silent skip, not retry)
- Cron checks for active tasks across all external_id patterns for same lead
- Updated archetype instructions (no `>` redirect, no `node -e` enrichment)

### Must NOT Have (Guardrails)

- Do NOT modify `src/gateway/routes/hostfully.ts` (webhook route handler)
- Do NOT change stdout output format of `post-guest-approval.ts` (idempotency guard reads it)
- Do NOT create `post-no-action-notification.ts` (not needed, would be scope creep)
- Do NOT change the lifecycle state machine structure (only add logging in `track-pending-approval`)
- Do NOT change the AI model or OpenCode configuration
- Do NOT add automatic retry for failed metadata validation

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests after implementation)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run tool, assert exit code + output format
- **Harness/lifecycle**: Use Bash — trigger task, poll DB, assert status
- **Cron**: Use Bash — create test data, trigger cron step, assert no duplicate

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — tool + harness + lifecycle changes):
├── Task 1: post-guest-approval.ts self-write + --conversation-ref [unspecified-high]
├── Task 2: Harness placeholder validation [unspecified-high]
├── Task 3: track-pending-approval guardrail [quick]
└── Task 4: Cron cross-namespace dedup [unspecified-high]

Wave 2 (After Wave 1 — instructions + tests):
├── Task 5: Update archetype instructions in seed.ts [unspecified-high]
└── Task 6: Tests for all changes [unspecified-high]

Wave 3 (After Wave 2 — rebuild + E2E):
├── Task 7: Docker image rebuild + lint/build/test [quick]
└── Task 8: E2E test via Playwright browser [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 7 → Task 8 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 5, 6   |
| 2    | —          | 6, 7   |
| 3    | —          | 6, 7   |
| 4    | —          | 6, 7   |
| 5    | 1          | 7      |
| 6    | 1, 2, 3, 4 | 7      |
| 7    | 5, 6       | 8      |
| 8    | 7          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 `unspecified-high`, T2 `unspecified-high`, T3 `quick`, T4 `unspecified-high`
- **Wave 2**: 2 tasks — T5 `unspecified-high`, T6 `unspecified-high`
- **Wave 3**: 2 tasks — T7 `quick`, T8 `deep`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Enhance `post-guest-approval.ts` to self-write `/tmp/approval-message.json`

  **What to do**:
  - Add `--conversation-ref <string>` CLI flag to `parseArgs()` in `src/worker-tools/slack/post-guest-approval.ts`
  - After the Slack `chat.postMessage` call succeeds (line 325-335), write the output file directly using `writeFileSync`:
    ```typescript
    import { writeFileSync } from 'node:fs';
    // After successful Slack post:
    const approvalOutput = {
      ts: result.ts,
      channel: result.channel,
      conversationRef: params.conversationRef ?? params.threadUid,
      approval_message_ts: result.ts,
      target_channel: result.channel,
      conversation_ref: params.conversationRef ?? params.threadUid,
      // Include classification metadata for lifecycle
      task_id: params.taskId,
      guest_name: params.guestName,
      property_name: params.propertyName,
      category: params.category,
      confidence: params.confidence,
      lead_uid: params.leadUid,
      thread_uid: params.threadUid,
      message_uid: params.messageUid,
      original_message: params.originalMessage,
      draft_response: params.draftResponse,
      check_in: params.checkIn,
      check_out: params.checkOut,
      booking_channel: params.bookingChannel,
      urgency: params.urgency,
    };
    writeFileSync('/tmp/approval-message.json', JSON.stringify(approvalOutput));
    ```
  - Keep the existing stdout output (`process.stdout.write(JSON.stringify(output))`) for backward compatibility
  - Update the idempotency guard (lines 261-278) to also check that the existing file has non-placeholder `ts` value (not just truthy)
  - Add idempotency guard validation: if `existing.ts` contains "PLACEHOLDER", treat as not-yet-posted and proceed normally

  **Must NOT do**:
  - Do NOT remove stdout output (idempotency guard and tests depend on it)
  - Do NOT change the `PostResult` interface shape
  - Do NOT create a new file — modify the existing tool only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts:259-339` — Current `main()` function: idempotency guard, parseArgs, Slack post, stdout output. This is the file to modify.
  - `src/worker-tools/slack/post-guest-approval.ts:261-278` — Existing idempotency guard reads `/tmp/approval-message.json` and checks `existing.ts`. Must enhance to also reject PLACEHOLDER values.

  **API/Type References**:
  - `src/worker-tools/slack/post-guest-approval.ts:5-25` — `GuestApprovalParams` interface: all fields the tool accepts. Add `conversationRef?: string` here.
  - `src/worker-tools/slack/post-guest-approval.ts:27-30` — `PostResult` interface: stdout output shape `{ts, channel}`. Do NOT change.
  - `src/workers/opencode-harness.mts:239-256` — Harness reads the file and maps `ts` → `approval_message_ts`, `channel` → `target_channel`, `conversationRef` → `conversation_ref`. The file content must match this mapping.

  **Test References**:
  - `tests/worker-tools/slack/post-guest-approval.test.ts` — Existing tests. New tests for self-write behavior should follow this file's patterns.

  **WHY Each Reference Matters**:
  - The harness mapping (line 241-248) is the contract: the file MUST have `ts`, `channel`, and `conversationRef` fields for the lifecycle to track the pending approval
  - The idempotency guard (line 262-278) prevents double-posting if the model calls the tool twice — it must also reject PLACEHOLDER values

  **Acceptance Criteria**:
  - [ ] `post-guest-approval.ts` accepts `--conversation-ref` flag
  - [ ] After successful Slack post, `/tmp/approval-message.json` exists with `ts`, `channel`, `conversationRef`, `approval_message_ts`, `target_channel`, `conversation_ref` fields
  - [ ] Idempotency guard rejects files with PLACEHOLDER in `ts` field
  - [ ] Stdout still outputs `{"ts":"...","channel":"..."}`
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tool writes /tmp/approval-message.json with valid data
    Tool: Bash
    Preconditions: SLACK_BOT_TOKEN set, clean /tmp (no existing approval-message.json)
    Steps:
      1. Run: NODE_NO_WARNINGS=1 tsx src/worker-tools/slack/post-guest-approval.ts --channel "C0AMGJQN05S" --task-id "test-task-001" --guest-name "Test Guest" --property-name "Test Property" --check-in "2026-06-01" --check-out "2026-06-05" --booking-channel "Airbnb" --original-message "Test message" --draft-response "Test response" --confidence 0.9 --category "general" --lead-uid "test-lead-001" --thread-uid "test-thread-001" --message-uid "test-msg-001" --conversation-ref "test-thread-001" --dry-run
      2. For non-dry-run: Check /tmp/approval-message.json exists
      3. Parse JSON: node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/approval-message.json','utf8')); console.log(d.ts, d.channel, d.conversationRef); process.exit(d.ts && d.channel && d.conversationRef ? 0 : 1)"
    Expected Result: Exit code 0. File contains real ts, channel, conversationRef values.
    Failure Indicators: File missing, ts/channel/conversationRef missing or contain "PLACEHOLDER"
    Evidence: .sisyphus/evidence/task-1-self-write-valid.txt

  Scenario: Idempotency guard rejects PLACEHOLDER values
    Tool: Bash
    Preconditions: Write a placeholder file to /tmp/approval-message.json
    Steps:
      1. echo '{"ts":"CHANNEL_ID_PLACEHOLDER","channel":"C123"}' > /tmp/approval-message.json
      2. Run the tool (it should NOT skip due to idempotency — PLACEHOLDER ts should be rejected)
      3. Check stderr for "Idempotency guard" message should NOT appear (since PLACEHOLDER is not valid)
    Expected Result: Tool proceeds past idempotency guard and attempts Slack post
    Evidence: .sisyphus/evidence/task-1-idempotency-placeholder.txt
  ```

  **Commit**: YES
  - Message: `fix(guest-messaging): tool self-writes /tmp/approval-message.json with validated data`
  - Files: `src/worker-tools/slack/post-guest-approval.ts`

- [x] 2. Add harness-level metadata validation in `opencode-harness.mts`

  **What to do**:
  - In `checkOutputFiles()` function (lines 225-257 of `src/workers/opencode-harness.mts`), after parsing `/tmp/approval-message.json`, add validation:
    ```typescript
    // After line 240: const approvalData = JSON.parse(approvalJson)
    // Validate: reject placeholder patterns
    const PLACEHOLDER_PATTERN = /PLACEHOLDER/i;
    const tsVal = String(approvalData.ts ?? '');
    const channelVal = String(approvalData.channel ?? '');
    if (
      !tsVal ||
      !channelVal ||
      PLACEHOLDER_PATTERN.test(tsVal) ||
      PLACEHOLDER_PATTERN.test(channelVal)
    ) {
      const msg = `[opencode-harness] Invalid approval metadata detected — ts="${tsVal}", channel="${channelVal}". The model likely wrote placeholders instead of calling post-guest-approval.ts. Failing task.`;
      log.error({ taskId: TASK_ID }, msg);
      throw new Error(msg);
    }
    ```
  - This causes the harness to throw, which means the deliverable is NOT created, and the task transitions to `Failed` via the SIGTERM handler or poll-completion timeout

  **Must NOT do**:
  - Do NOT catch or retry the error — let it propagate and fail the task
  - Do NOT modify the stdout output contract
  - Do NOT change how `/tmp/summary.txt` is read

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:225-257` — `checkOutputFiles()` function. This is the exact location to add validation. Currently reads the file and maps fields with zero validation.
  - `src/workers/opencode-harness.mts:343-345` — Existing "no output" error message. Follow this pattern for the new placeholder error message.

  **API/Type References**:
  - The deliverable metadata contract: `{ ts, channel, conversationRef }` mapped to `{ approval_message_ts, target_channel, conversation_ref }`
  - Task lifecycle: if harness throws before creating deliverable, the task goes to `Failed` via poll-completion timeout

  **WHY Each Reference Matters**:
  - `checkOutputFiles` is called in two paths (line 264 and line 321) — both must benefit from validation
  - The error must be clear enough for debugging: include the actual placeholder values in the message

  **Acceptance Criteria**:
  - [ ] Harness throws when `ts` or `channel` contain "PLACEHOLDER"
  - [ ] Harness throws when `ts` or `channel` are empty
  - [ ] Error message includes the actual values for debugging
  - [ ] Valid metadata passes through unchanged

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness rejects placeholder metadata (unit-level test)
    Tool: Bash
    Preconditions: Build the harness code
    Steps:
      1. Create a mock /tmp/approval-message.json with placeholder: echo '{"ts":"PLACEHOLDER_TS","channel":"CHANNEL_ID_PLACEHOLDER"}' > /tmp/test-placeholder.json
      2. Run pnpm build to compile the harness
      3. Verify the validation logic exists in the built output: grep -q "PLACEHOLDER" dist/workers/opencode-harness.mjs
    Expected Result: grep finds the PLACEHOLDER pattern check in compiled code
    Failure Indicators: Pattern not found in compiled output
    Evidence: .sisyphus/evidence/task-2-harness-validation.txt
  ```

  **Commit**: YES (groups with 1, 3)
  - Message: `fix(guest-messaging): harness rejects placeholder metadata in approval file`
  - Files: `src/workers/opencode-harness.mts`

- [x] 3. Add lifecycle guardrail to `track-pending-approval`

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, modify the `track-pending-approval` step (lines 975-1003)
  - Change the silent `return` on missing metadata to a `log.warn` call:
    ```typescript
    // Replace line 988-990:
    if (!conversationRef || !approvalMsgTs || !targetChannel) {
      log.warn(
        { taskId, conversationRef, approvalMsgTs, targetChannel },
        'track-pending-approval: Missing required metadata — approval card may not have been posted. Task will proceed to wait-for-approval but may timeout.',
      );
      return;
    }
    ```
  - Do NOT throw or change the flow — just add observability. The 24h timeout on `wait-for-approval` will handle it.

  **Must NOT do**:
  - Do NOT throw an error (this would change lifecycle behavior)
  - Do NOT change the lifecycle state transitions
  - Do NOT modify any other step in the lifecycle

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:975-1003` — The `track-pending-approval` step. Lines 988-990 are the silent return to change to log.warn.
  - `src/inngest/employee-lifecycle.ts:378` — Example of existing `log.warn` pattern in the same file

  **WHY Each Reference Matters**:
  - The silent return at line 989 is why the task hangs — there's zero observability when metadata is missing
  - Using `log.warn` (not `log.error`) because this is a known possible state (model may classify as NO_ACTION_NEEDED with different metadata shape)

  **Acceptance Criteria**:
  - [ ] `track-pending-approval` logs a warning when metadata is missing
  - [ ] Warning includes taskId, conversationRef, approvalMsgTs, targetChannel values
  - [ ] Flow continues unchanged (still returns, does not throw)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lifecycle logs warning when metadata is missing
    Tool: Bash
    Preconditions: pnpm build passes
    Steps:
      1. Run pnpm build
      2. grep for log.warn in the modified lifecycle code: grep -A2 "track-pending-approval.*Missing" src/inngest/employee-lifecycle.ts
    Expected Result: grep finds the warning message with correct context fields
    Failure Indicators: No match found, or warning doesn't include taskId/metadata fields
    Evidence: .sisyphus/evidence/task-3-lifecycle-guardrail.txt
  ```

  **Commit**: YES (groups with 1, 2)
  - Message: `fix(guest-messaging): log warning on missing approval metadata instead of silent skip`
  - Files: `src/inngest/employee-lifecycle.ts`

- [x] 4. Fix cron cross-namespace dedup in `guest-message-poll.ts`

  **What to do**:
  - In `src/inngest/triggers/guest-message-poll.ts`, before creating a new task (lines 209-233), add a cross-namespace check:
    ```typescript
    // After the existing external_id dedup check (lines 199-207), add:
    // Cross-namespace check: also skip if a webhook-created task is active for this lead
    const activeTaskRes = await fetch(
      `${supabaseUrl}/rest/v1/tasks?archetype_id=eq.${archetype.id}&status=not.in.(Done,Failed,Cancelled)&tenant_id=eq.${archetype.tenant_id}&raw_event->>lead_uid=eq.${leadUid}&select=id,external_id`,
      { headers },
    );
    const activeTasks = (await activeTaskRes.json()) as Array<{ id: string; external_id: string }>;
    if (activeTasks.length > 0) {
      log.info(
        {
          leadUid,
          existingTaskId: activeTasks[0].id,
          existingExternalId: activeTasks[0].external_id,
        },
        'Active task already exists for lead (cross-namespace check) — skipping',
      );
      return null;
    }
    ```
  - Note: The `raw_event` field stores the webhook payload. For webhook-triggered tasks, it contains `lead_uid`. For cron-triggered tasks, it may not have `raw_event`. The PostgREST query `raw_event->>lead_uid=eq.${leadUid}` handles this correctly (won't match tasks without raw_event).
  - However, the cron creates tasks WITHOUT `raw_event` (line 209-219). We need to also store `lead_uid` in the cron task's raw_event so future checks can find it:
    ```typescript
    body: JSON.stringify({
      archetype_id: archetype.id,
      external_id: externalId,
      source_system: 'cron',
      status: 'Ready',
      tenant_id: archetype.tenant_id,
      raw_event: { lead_uid: leadUid, source: 'poll' }, // Add this
    }),
    ```

  **Must NOT do**:
  - Do NOT modify `src/gateway/routes/hostfully.ts`
  - Do NOT change the webhook dedup logic (it already works)
  - Do NOT change the cron schedule

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/triggers/guest-message-poll.ts:199-207` — Existing same-namespace dedup check. Follow this pattern for the cross-namespace check.
  - `src/inngest/triggers/guest-message-poll.ts:209-219` — Task creation POST body. Add `raw_event` field here.
  - `src/gateway/routes/hostfully.ts:88-113` — Webhook's thread-level active-task check (DO NOT MODIFY, but reference for the pattern)

  **API/Type References**:
  - PostgREST JSON column query syntax: `raw_event->>lead_uid=eq.${value}` — queries the `lead_uid` field inside the JSONB `raw_event` column
  - `tasks` table: `raw_event` column is JSONB, stores webhook payload for webhook-triggered tasks

  **WHY Each Reference Matters**:
  - The existing dedup (line 199-207) only checks `external_id` pattern `hostfully-poll-*` — misses `hostfully-msg-*` tasks from webhooks
  - Storing `raw_event` with `lead_uid` on cron tasks enables future cross-namespace checks in both directions

  **Acceptance Criteria**:
  - [ ] Cron skips creating task when a webhook-created task is active for the same lead
  - [ ] Cron task creation includes `raw_event: { lead_uid, source: 'poll' }`
  - [ ] Existing same-namespace dedup still works
  - [ ] Log message includes lead_uid and existing task details

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cron skips lead with active webhook task
    Tool: Bash
    Preconditions: Test DB available
    Steps:
      1. Create a task in DB with status='Executing', archetype_id='00000000-0000-0000-0000-000000000015', raw_event='{"lead_uid":"test-lead-dedup"}', tenant_id='00000000-0000-0000-0000-000000000003'
      2. Run the cross-namespace query directly: curl -s "http://localhost:54331/rest/v1/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000015&status=not.in.(Done,Failed,Cancelled)&raw_event->>lead_uid=eq.test-lead-dedup&select=id" -H "apikey: $SUPABASE_SECRET_KEY"
      3. Assert the query returns the created task
      4. Clean up test data
    Expected Result: Query returns the active task, proving the dedup check will find it
    Failure Indicators: Empty result from PostgREST query
    Evidence: .sisyphus/evidence/task-4-cron-dedup.txt
  ```

  **Commit**: YES
  - Message: `fix(guest-messaging): cross-namespace cron dedup checks for active webhook tasks`
  - Files: `src/inngest/triggers/guest-message-poll.ts`

- [x] 5. Update archetype instructions in `prisma/seed.ts`

  **What to do**:
  - In `prisma/seed.ts`, find the guest-messaging archetype instructions (the long `instructions` string for archetype ID `00000000-0000-0000-0000-000000000015`)
  - Remove the fragile `> /tmp/approval-message.json` redirect pattern from the `post-guest-approval.ts` invocation in STEP 5
  - Remove the `node -e` enrichment step that adds `conversationRef`
  - Add `--conversation-ref` flag to the `post-guest-approval.ts` invocation
  - Update the instructions to explain that the tool writes `/tmp/approval-message.json` directly (no piping needed)
  - Similarly update STEP 4 (NO_ACTION_NEEDED path) if it uses the same pattern for `post-no-action-notification.ts` — NOTE: `post-no-action-notification.ts` does NOT exist, so the instructions referencing it are already broken. Replace with `post-message.ts` for the NO_ACTION notification, and use a separate `write` tool call or `node -e` to write `/tmp/approval-message.json` for the NO_ACTION case.
  - Run `pnpm prisma db seed` to apply the updated instructions

  **Must NOT do**:
  - Do NOT change the system_prompt (separate field)
  - Do NOT change model, runtime, or risk_model
  - Do NOT remove the `/tmp/approval-message.json` filename from instructions entirely (seed test line 93 checks for it)
  - Do NOT add new tools to tool_registry unless they're already in the Docker image

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (needs the `--conversation-ref` flag to exist)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Search for `00000000-0000-0000-0000-000000000015` to find the guest-messaging archetype. The `instructions` field is a long template string.
  - The current instructions (fetched from DB earlier in this session) — STEP 5 has the `> /tmp/approval-message.json` redirect and `node -e` enrichment

  **API/Type References**:
  - `tests/gateway/seed-guest-messaging.test.ts:90-96` — Seed test assertions about instructions content. Line 93 checks `toContain('/tmp/approval-message.json')` — this will still pass since instructions will still mention the file.

  **WHY Each Reference Matters**:
  - The instructions are the "prompt" that tells the AI model what to do — this is the PRIMARY fix that eliminates the fragile pattern
  - The seed test ensures the instructions don't regress

  **Acceptance Criteria**:
  - [ ] Instructions no longer contain `> /tmp/approval-message.json` (stdout redirect)
  - [ ] Instructions no longer contain `node -e "const f='/tmp/approval-message.json'` (enrichment hack)
  - [ ] Instructions include `--conversation-ref` flag in `post-guest-approval.ts` invocation
  - [ ] Instructions explain that the tool writes `/tmp/approval-message.json` directly
  - [ ] `pnpm prisma db seed` runs successfully
  - [ ] `pnpm test -- --run` passes (seed test assertions still hold)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Updated instructions contain correct tool invocation
    Tool: Bash
    Preconditions: Seed has been run
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT instructions FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'" | grep -c '> /tmp/approval-message.json'
      2. Assert count is 0 (no stdout redirect pattern)
      3. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT instructions FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'" | grep -c 'conversation-ref'
      4. Assert count is greater than 0 (new flag is mentioned)
    Expected Result: No stdout redirect pattern, conversation-ref flag present
    Failure Indicators: Redirect pattern still present, or conversation-ref missing
    Evidence: .sisyphus/evidence/task-5-instructions-update.txt
  ```

  **Commit**: YES
  - Message: `fix(guest-messaging): update archetype instructions to use tool self-write pattern`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Add tests for metadata validation, tool self-write, and cron dedup

  **What to do**:
  - Add tests in `tests/worker-tools/slack/post-guest-approval.test.ts`:
    - Test that `--conversation-ref` flag is parsed correctly
    - Test that the tool writes `/tmp/approval-message.json` with the correct structure (mock Slack API)
    - Test that idempotency guard rejects PLACEHOLDER values
  - Add tests in a new file `tests/workers/harness-validation.test.ts` (or add to existing harness test file if one exists):
    - Test that PLACEHOLDER pattern detection works
    - Test that empty ts/channel is rejected
    - Test that valid metadata passes through
  - Add tests in `tests/inngest/triggers/guest-message-poll.test.ts` (or add to existing):
    - Test that cross-namespace dedup query finds webhook-created tasks for the same lead
    - Test that raw_event with lead_uid is stored on cron tasks
  - Run `pnpm test -- --run` to verify all tests pass

  **Must NOT do**:
  - Do NOT modify pre-existing tests unrelated to these changes
  - Do NOT skip test assertions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2, 3, 4 (need implementation to test against)

  **References**:

  **Pattern References**:
  - `tests/worker-tools/slack/post-guest-approval.test.ts` — Existing tests for the tool. Follow patterns for mocking WebClient, asserting stdout output.
  - `tests/gateway/seed-guest-messaging.test.ts` — Example of DB-backed integration tests
  - `tests/setup.ts` — Test setup helpers (getPrisma, etc.)

  **Acceptance Criteria**:
  - [ ] All new tests pass
  - [ ] Test coverage includes: self-write, conversation-ref flag, placeholder rejection, cross-namespace dedup
  - [ ] `pnpm test -- --run` passes with zero new failures

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert output shows all tests passing
    Expected Result: 0 failed tests (excluding pre-existing failures)
    Evidence: .sisyphus/evidence/task-6-tests.txt
  ```

  **Commit**: YES
  - Message: `test(guest-messaging): metadata validation, tool self-write, cron dedup`
  - Files: test files

- [x] 7. Docker image rebuild + lint/build/test verification

  **What to do**:
  - Run `pnpm lint` — fix any lint errors
  - Run `pnpm build` — fix any build errors
  - Run `pnpm test -- --run` — verify all tests pass
  - Run `docker build -t ai-employee-worker:latest .` — rebuild Docker image with all changes
  - Verify the image contains updated tool: `docker run --rm ai-employee-worker:latest cat /tools/slack/post-guest-approval.ts | grep -q 'conversation-ref'`

  **Must NOT do**:
  - Do NOT push Docker image to registry
  - Do NOT modify source code in this task (only rebuild)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 5, 6

  **References**:
  - AGENTS.md — "CRITICAL — Rebuild after every worker change"
  - `Dockerfile` — Docker build context

  **Acceptance Criteria**:
  - [ ] `pnpm lint` passes
  - [ ] `pnpm build` passes
  - [ ] `pnpm test -- --run` passes
  - [ ] Docker image builds successfully
  - [ ] Docker image contains updated tool code

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image built and contains updated tool
    Tool: Bash
    Steps:
      1. docker build -t ai-employee-worker:latest .
      2. docker run --rm ai-employee-worker:latest grep -c 'conversation-ref' /tools/slack/post-guest-approval.ts
    Expected Result: Build succeeds, grep returns count > 0
    Evidence: .sisyphus/evidence/task-7-docker-build.txt
  ```

  **Commit**: NO (rebuild only, no code changes)

- [x] 8. E2E test via Airbnb message flow

  **What to do**:
  - Send a test message from the Airbnb test account (thread URL: `https://www.airbnb.com/guest/messages/2525238359`)
  - Wait for webhook to fire and task to be created
  - Monitor task status via DB: `SELECT status FROM tasks WHERE tenant_id = '00000000-0000-0000-0000-000000000003' ORDER BY created_at DESC LIMIT 1`
  - Verify the approval card appears in Slack channel `#cs-guest-communication` (`C0AMGJQN05S`)
  - Verify the deliverable metadata has real values (not placeholders)
  - Approve the message via Slack
  - Verify the reply appears in Airbnb
  - Verify task reaches `Done` status

  **Must NOT do**:
  - Do NOT use fake/manual webhook triggers for E2E (use real Airbnb message)
  - Do NOT skip checking deliverable metadata

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:
  - AGENTS.md § "E2E Testing with Playwright Browser" — Airbnb and Slack URLs, step-by-step flow
  - AGENTS.md § "Verified E2E flow" — 12-step table
  - Airbnb test thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack channel: `#cs-guest-communication` — `C0AMGJQN05S`

  **Acceptance Criteria**:
  - [ ] Test message sent from Airbnb
  - [ ] Task created and reaches `Reviewing` status
  - [ ] Approval card visible in Slack `#cs-guest-communication`
  - [ ] Deliverable metadata has real `ts`, `channel`, `conversationRef` (not placeholders)
  - [ ] After approval, task reaches `Done`
  - [ ] Reply visible in Airbnb thread

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E — Airbnb message to delivered reply
    Tool: Playwright / Bash
    Preconditions: Services running (pnpm dev), Docker image rebuilt, Airbnb and Slack tabs open
    Steps:
      1. Navigate to https://www.airbnb.com/guest/messages/2525238359
      2. Type "What time is check-in?" in the textbox "Write a message..."
      3. Click Send
      4. Wait up to 5 minutes for task to appear: poll DB every 30s
      5. Check task status reaches 'Reviewing': PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT id, status FROM tasks WHERE tenant_id = '00000000-0000-0000-0000-000000000003' ORDER BY created_at DESC LIMIT 1"
      6. Check deliverable metadata: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT d.metadata FROM deliverables d JOIN executions e ON d.execution_id = e.id WHERE e.task_id = '<task_id>' ORDER BY d.created_at DESC LIMIT 1"
      7. Assert metadata does NOT contain 'PLACEHOLDER'
      8. Navigate to Slack https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S
      9. Find approval card in thread, click "Approve & Send"
      10. Wait 30s, check task status = 'Done'
    Expected Result: Task goes through full lifecycle: Received → Executing → Reviewing → Done
    Failure Indicators: Task stuck in any state > 5 min, metadata contains PLACEHOLDER, approval card missing
    Evidence: .sisyphus/evidence/task-8-e2e-full.png (screenshot) + .sisyphus/evidence/task-8-e2e-metadata.txt

  Scenario: Deliverable metadata validation — no placeholders
    Tool: Bash
    Steps:
      1. After task reaches Submitting/Reviewing, query: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -A -c "SELECT d.metadata::text FROM deliverables d JOIN executions e ON d.execution_id = e.id WHERE e.task_id = '<task_id>'"
      2. Assert output does NOT contain 'PLACEHOLDER'
      3. Assert output contains valid Slack ts (e.g. matches pattern [0-9]+\.[0-9]+)
    Expected Result: Real metadata values
    Evidence: .sisyphus/evidence/task-8-metadata-check.txt
  ```

  **Commit**: NO (verification only)

- [x] 9. **Notify completion** — Send Telegram notification: plan `guest-messaging-reliability` complete, all tasks done, come back to review results.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1-3**: `fix(guest-messaging): tool self-write, harness validation, lifecycle guardrail` — post-guest-approval.ts, opencode-harness.mts, employee-lifecycle.ts
- **4**: `fix(guest-messaging): cross-namespace cron dedup` — guest-message-poll.ts
- **5**: `fix(guest-messaging): update archetype instructions to remove fragile piping` — seed.ts
- **6**: `test(guest-messaging): add tests for metadata validation and cron dedup` — test files
- **7-8**: No separate commit (rebuild + E2E verification only)

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: no errors
pnpm lint           # Expected: no errors
pnpm test -- --run  # Expected: all pass (pre-existing failures excluded)
```

### Final Checklist

- [ ] `post-guest-approval.ts` writes `/tmp/approval-message.json` directly
- [ ] Harness rejects placeholder metadata
- [ ] `track-pending-approval` logs warning on missing metadata
- [ ] Cron checks active tasks across all external_id namespaces
- [ ] Archetype instructions updated (no piping, no node -e enrichment)
- [ ] All tests pass
- [ ] Docker image rebuilt
- [ ] E2E test passes end-to-end
