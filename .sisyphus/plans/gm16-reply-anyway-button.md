# GM-16: Reply Anyway Button for NO_ACTION_NEEDED Messages

## TL;DR

> **Quick Summary**: Add a "Reply Anyway" button to NO_ACTION_NEEDED Slack notifications so PMs can override the classification and trigger a full AI draft + approval flow for guest messages that were auto-dismissed.
>
> **Deliverables**:
>
> - New shell tool `post-no-action-notification.ts` posting a lightweight Block Kit card with "Reply Anyway" button
> - Lifecycle modification: 24h `waitForEvent` window before auto-completing NO_ACTION_NEEDED tasks
> - New Slack action handler `guest_reply_anyway` firing `employee/reply-anyway.requested`
> - Harness modification: `REPLY_ANYWAY_CONTEXT` env var injection for re-draft machines
> - Metrics tracking: `overridden_no_action: true` in `tasks.metadata` JSON
> - Comprehensive unit tests for all new code paths
> - Story map GM-16 checkboxes marked as completed
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (shell tool) → Task 4 (lifecycle) → Task 6 (verification)

---

## Context

### Original Request

Implement GM-16 from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). The feature adds a "Reply Anyway" button to NO_ACTION_NEEDED guest message notifications, allowing PMs to override the AI's classification and trigger a full draft + approval flow.

### Interview Summary

**Key Discussions**:

- User wants automated tests and API endpoint verification
- User wants story map items marked as completed after implementation
- Feature is proven in standalone MVP (`/Users/victordozal/repos/real-estate/vlre-employee`) — port with architectural adaptation

**Research Findings**:

- **Standalone MVP**: Uses `buildAcknowledgmentBlocks()` for the NO_ACTION_NEEDED card. MVP opens a blank modal (CS agent types reply manually). Platform version will re-draft via LLM per acceptance criteria.
- **Current NO_ACTION_NEEDED path**: Worker posts informational Slack message (no buttons) via `post-message.ts` → lifecycle `check-classification` detects NO_ACTION_NEEDED → task patched to `Done` → machine destroyed → return. No approval wait.
- **Lifecycle architecture**: `employee-lifecycle.ts` uses `step.waitForEvent` for approval flow. NO_ACTION_NEEDED exits before this. GM-16 adds a second `waitForEvent` for the 24h Reply Anyway window.
- **Harness pattern**: `FEEDBACK_CONTEXT` env var is prepended to system prompt at line 328-332 of `opencode-harness.mts`. `REPLY_ANYWAY_CONTEXT` follows the same pattern but prepended to instructions.

### Metis Review

**Identified Gaps (all resolved)**:

- **Task state during 24h wait**: Task stays in `Submitting` (technically correct — awaiting decision). Metadata includes `no_action_pending: true` to distinguish from normal Submitting.
- **Destroy-then-respawn**: Machine is destroyed immediately after notification; new machine spawned only if Reply Anyway clicked (avoids 24h idle cost).
- **Infinite loop guard**: Harness checks `REPLY_ANYWAY_CONTEXT` — if set and classification is still NO_ACTION_NEEDED, force-treats as NEEDS_APPROVAL.
- **Idempotency**: Inngest dedup ID `employee-reply-anyway-${taskId}` + handler checks task is not in terminal state.
- **`REPLY_ANYWAY_CONTEXT` content**: JSON with message context from original deliverable, prepended with override instructions to force NEEDS_APPROVAL classification.
- **Card `ts` storage**: New tool outputs `{ ts, channel }` JSON; lifecycle stores in deliverable metadata for card updates.

---

## Work Objectives

### Core Objective

Add a "Reply Anyway" override mechanism to NO_ACTION_NEEDED guest message notifications, enabling PMs to trigger AI-drafted responses for messages the system dismissed.

### Concrete Deliverables

- `src/worker-tools/slack/post-no-action-notification.ts` — shell tool
- Modified `src/inngest/employee-lifecycle.ts` — reply-anyway wait + re-draft branch
- Modified `src/workers/opencode-harness.mts` — REPLY_ANYWAY_CONTEXT injection
- Modified `src/gateway/slack/handlers.ts` — guest_reply_anyway action handler
- Modified `prisma/seed.ts` — archetype instructions update
- Test files covering all new paths
- Updated `docs/2026-04-21-2202-phase1-story-map.md` — GM-16 checkboxes

### Definition of Done

- [ ] `pnpm test -- --run` passes with ≥515 tests (no regressions)
- [ ] `pnpm build` exits 0
- [ ] All 6 GM-16 acceptance criteria in story map marked `[x]`
- [ ] `post-no-action-notification.ts --dry-run` outputs valid Block Kit JSON with `guest_reply_anyway` action_id

### Must Have

- Reply Anyway button on NO_ACTION_NEEDED notifications with guest name, property, message snippet, classification reason
- 24h timeout → auto-complete to Done (no reminder)
- Full re-draft + approval flow on Reply Anyway click (not blank modal)
- `overridden_no_action: true` tracked in task metadata
- Task ID context block on notification
- Infinite loop guard: REPLY_ANYWAY_CONTEXT forces NEEDS_APPROVAL

### Must NOT Have (Guardrails)

- **NO modifications** to `post-message.ts`, `post-guest-approval.ts`, or any existing shell tool
- **NO modifications** to `employee/approval.received` event schema or existing handler logic
- **NO new Inngest function** — all lifecycle logic stays in `employee-lifecycle.ts`
- **NO new DB migration** — use `tasks.metadata` JSON for metrics tracking
- **NO reminder notification** at 12h or any intermediate timeout
- **NO edit modal** on the Reply Anyway flow — PM gets the standard approval card (Approve/Edit/Reject)
- **NO dashboard** for override rates — tracking only
- **NO changes** to existing `approve`/`reject`/`guest_approve`/`guest_edit`/`guest_reject` handlers
- **NO over-abstraction** — new shell tool is single-purpose for NO_ACTION_NEEDED cards only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (tests-after — each task includes test cases)
- **Framework**: Vitest (matching existing project)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run with `--dry-run`, parse JSON output, assert fields
- **Slack handlers**: Unit test via `makeMockBoltApp()` pattern
- **Lifecycle**: Unit test via `InngestTestEngine` + `mockCtx`
- **API verification**: Use Bash (curl) against Inngest dev server

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, MAX PARALLEL):
├── Task 1: Shell tool — post-no-action-notification.ts + tests [quick]
├── Task 2: Harness — REPLY_ANYWAY_CONTEXT injection + infinite loop guard [quick]
└── Task 3: Archetype instructions — seed.ts update for NO_ACTION_NEEDED step [quick]

Wave 2 (After Wave 1 — integration):
├── Task 4: Lifecycle — Reply Anyway wait + re-draft branch + tests [deep]
└── Task 5: Slack handler — guest_reply_anyway action + tests [unspecified-high]

Wave 3 (After Wave 2 — verification + finalization):
├── Task 6: Full verification — regression tests, build, lint [unspecified-high]
├── Task 7: Story map update — mark GM-16 checkboxes [quick]
└── Task 8: Notify completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 3, 4, 5 | 1    |
| 2    | —          | 4       | 1    |
| 3    | 1          | 4       | 1    |
| 4    | 1, 2, 3    | 6       | 2    |
| 5    | 1          | 6       | 2    |
| 6    | 4, 5       | 7       | 3    |
| 7    | 6          | 8       | 3    |
| 8    | 7          | —       | 3    |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2 tasks** — T4 → `deep`, T5 → `unspecified-high`
- **Wave 3**: **3 tasks** — T6 → `unspecified-high`, T7 → `quick`, T8 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Shell Tool — `post-no-action-notification.ts` + Unit Tests

  **What to do**:
  - Create `src/worker-tools/slack/post-no-action-notification.ts` following the exact pattern of `src/worker-tools/slack/post-guest-approval.ts` (same CLI arg parsing, WebClient usage, `--dry-run` flag, JSON stdout output)
  - Export `buildNoActionBlocks(params)` function that produces a Slack Block Kit card with:
    - Header: `ℹ️ No Action Needed — {propertyName}`
    - Context section: `*Guest:* {guestName} | *Property:* {propertyName} | *Check-in:* {checkIn} | *Check-out:* {checkOut} | *Channel:* {bookingChannel}`
    - Divider
    - Section: `*Guest message:*\n>{originalMessage}` (first 300 chars, truncated with `...`)
    - Section: `*Summary:* {summary}`
    - Section: `_No response is needed. Classification: {category} (confidence: {confidence}%)_`
    - Divider
    - Actions block with single button: `{ text: "💬 Reply Anyway", action_id: "guest_reply_anyway", value: taskId }`
    - Context block: `Task \`{taskId}\`` (per platform Slack standards)
  - CLI args (all required except `--dry-run` and `--conversation-summary`): `--channel`, `--task-id`, `--guest-name`, `--property-name`, `--check-in`, `--check-out`, `--booking-channel`, `--original-message`, `--summary`, `--confidence`, `--category`, `--lead-uid`, `--thread-uid`, `--message-uid`, `[--conversation-summary]`, `[--dry-run]`
  - `--dry-run` outputs `{ "blocks": [...] }` JSON to stdout and exits without calling Slack API
  - Normal mode: posts via `WebClient.chat.postMessage()`, outputs `{ "ts": "...", "channel": "..." }` to stdout
  - `--help` flag outputs usage documentation
  - Create `tests/worker-tools/slack/post-no-action-notification.test.ts` with tests for:
    - `buildNoActionBlocks()` output structure (correct block types, action_id, text content)
    - Missing required args → exit 1 with stderr
    - `--dry-run` outputs valid JSON with blocks array
    - Original message truncation at 300 chars
    - Task ID context block present in output

  **Must NOT do**:
  - Do NOT modify `post-message.ts` or `post-guest-approval.ts`
  - Do NOT add `guest_reply_anyway` to `GUEST_BUTTON_BLOCKS` constant in handlers.ts
  - Do NOT over-abstract — this is a single-purpose tool for NO_ACTION_NEEDED cards only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small shell tool following an established, well-documented pattern
  - **Skills**: []
    - No specialized skills needed — direct file copy + adapt from existing tool

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/worker-tools/slack/post-guest-approval.ts` — **PRIMARY TEMPLATE**. Copy the entire file structure: `parseArgs()`, `buildGuestApprovalBlocks()`, `main()`, WebClient usage, error handling, `--dry-run`. The new tool follows this exact pattern but with different Block Kit content and fewer required args.
  - `src/worker-tools/slack/post-guest-approval.ts:120-218` — `buildGuestApprovalBlocks()` function showing how to construct Block Kit JSON with header, sections, actions, context blocks. Adapt the block structure for the lighter NO_ACTION_NEEDED card.
  - `src/worker-tools/slack/post-guest-approval.ts:220-284` — `main()` function showing the WebClient call, error handling, and JSON output pattern. Copy verbatim, changing only the function called and the `text` fallback.

  **Standalone MVP Reference** (the card design to port):
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/blocks.ts:487-558` — `buildAcknowledgmentBlocks()`. Shows the proven card layout. Adapt: replace `view_in_hostfully_ack` button with just `guest_reply_anyway`, simplify context fields to match platform conventions.

  **Test References**:
  - `tests/worker-tools/slack/post-guest-approval.test.ts` — Test structure and assertion patterns for Block Kit builders. Follow the same `describe/it` organization and assertion style.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dry-run produces valid Block Kit JSON
    Tool: Bash
    Preconditions: Shell tool file exists at src/worker-tools/slack/post-no-action-notification.ts
    Steps:
      1. Run: npx tsx src/worker-tools/slack/post-no-action-notification.ts --channel C123 --task-id test-uuid-123 --guest-name "John Smith" --property-name "Oceanview Villa" --check-in "2026-05-01" --check-out "2026-05-05" --booking-channel "Airbnb" --original-message "Ok got it" --summary "Guest acknowledged check-in instructions" --confidence 0.95 --category "acknowledgment" --lead-uid "lead-1" --thread-uid "thread-1" --message-uid "msg-1" --dry-run
      2. Parse stdout as JSON
      3. Assert: output has "blocks" array
      4. Assert: blocks contain element with action_id "guest_reply_anyway"
      5. Assert: blocks contain context element with text containing "test-uuid-123"
      6. Assert: blocks contain section with text containing "John Smith"
    Expected Result: Valid JSON with all required Block Kit elements present
    Failure Indicators: Non-zero exit code, JSON parse error, missing action_id or context block
    Evidence: .sisyphus/evidence/task-1-dry-run-output.json

  Scenario: Missing required arg exits with error
    Tool: Bash
    Preconditions: Shell tool file exists
    Steps:
      1. Run: npx tsx src/worker-tools/slack/post-no-action-notification.ts --channel C123 --dry-run (missing --task-id and other required args)
      2. Check exit code
      3. Check stderr output
    Expected Result: Exit code 1, stderr contains "Error: --task-id argument is required"
    Failure Indicators: Exit code 0, no stderr output
    Evidence: .sisyphus/evidence/task-1-missing-args-error.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-dry-run-output.json — Dry-run JSON output
  - [ ] task-1-missing-args-error.txt — Error output for missing args

  **Commit**: YES
  - Message: `feat(slack): add post-no-action-notification shell tool`
  - Files: `src/worker-tools/slack/post-no-action-notification.ts`, `tests/worker-tools/slack/post-no-action-notification.test.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run`

---

- [x] 2. Harness — `REPLY_ANYWAY_CONTEXT` Injection + Infinite Loop Guard

  **What to do**:
  - In `src/workers/opencode-harness.mts`, after the `FEEDBACK_CONTEXT` handling (line 328-332), add `REPLY_ANYWAY_CONTEXT` handling:
    ```typescript
    const replyAnywayContext = process.env.REPLY_ANYWAY_CONTEXT ?? '';
    const instructions = replyAnywayContext
      ? `OVERRIDE — REPLY ANYWAY TASK:\nA PM clicked "Reply Anyway" on a NO_ACTION_NEEDED notification. Process the message below as NEEDS_APPROVAL. Skip Step 1 (fetching messages) — use the provided context. In Step 3, classify as NEEDS_APPROVAL and draft a response. Continue with Step 5.\n\nMessage context:\n${replyAnywayContext}\n\n---\nOriginal instructions (for reference, start from Step 3):\n${archetype.instructions ?? ''}`
      : (archetype.instructions ?? '');
    ```
  - Add infinite loop guard in the same section: after the LLM classification check in `check-classification` step of the lifecycle, if `REPLY_ANYWAY_CONTEXT` is set, force-treat the classification as NEEDS_APPROVAL regardless of LLM output. This prevents: Reply Anyway → machine classifies as NO_ACTION_NEEDED again → Reply Anyway card again → infinite loop.
  - **NOTE**: The infinite loop guard is actually in the lifecycle (`employee-lifecycle.ts`), not the harness. The harness injects the override instructions. The lifecycle's `check-classification` step adds the guard: if the task metadata has `reply_anyway: true`, skip the NO_ACTION_NEEDED branch entirely (force `skipApproval = false`).

  **Must NOT do**:
  - Do NOT modify `FEEDBACK_CONTEXT` handling
  - Do NOT change the delivery phase logic (`EMPLOYEE_PHASE === 'delivery'`)
  - Do NOT modify the system prompt injection — `REPLY_ANYWAY_CONTEXT` goes into instructions, not system prompt

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small surgical change following an established pattern (FEEDBACK_CONTEXT)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:328-332` — `FEEDBACK_CONTEXT` injection pattern. Shows how env vars are read and prepended to prompt content. Follow this exact pattern for `REPLY_ANYWAY_CONTEXT` but prepend to instructions instead of system prompt.
  - `src/workers/opencode-harness.mts:322-326` — `EMPLOYEE_PHASE` check. Shows the early-return pattern for phase-specific behavior. `REPLY_ANYWAY_CONTEXT` does NOT use an early return — it modifies the instructions string inline.
  - `src/workers/opencode-harness.mts:333` — `const instructions = archetype.instructions ?? ''`. This is the line to replace with the conditional that checks `REPLY_ANYWAY_CONTEXT`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: REPLY_ANYWAY_CONTEXT modifies instructions
    Tool: Bash
    Preconditions: Harness code is modified
    Steps:
      1. Read the modified harness source
      2. Assert: code checks process.env.REPLY_ANYWAY_CONTEXT
      3. Assert: when set, instructions string starts with "OVERRIDE — REPLY ANYWAY TASK:"
      4. Assert: original archetype instructions are included after the override
      5. Assert: when NOT set, instructions string equals archetype.instructions unchanged
    Expected Result: Conditional instruction override correctly implemented
    Failure Indicators: Override text not found, original instructions lost
    Evidence: .sisyphus/evidence/task-2-harness-diff.txt

  Scenario: Build succeeds with harness changes
    Tool: Bash
    Preconditions: Harness modified
    Steps:
      1. Run: pnpm build
      2. Check exit code
    Expected Result: Exit code 0, no TypeScript errors
    Evidence: .sisyphus/evidence/task-2-build-output.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-harness-diff.txt — Git diff of harness changes
  - [ ] task-2-build-output.txt — Build output

  **Commit**: YES
  - Message: `feat(harness): add REPLY_ANYWAY_CONTEXT injection and infinite loop guard`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 3. Archetype Instructions — Update `seed.ts` for NO_ACTION_NEEDED Step

  **What to do**:
  - In `prisma/seed.ts`, update `VLRE_GUEST_MESSAGING_INSTRUCTIONS` Step 4 (the NO_ACTION_NEEDED branch, currently at line 244). Replace the `post-message.ts` call with the new `post-no-action-notification.ts` tool.
  - **Current** (line 244):
    ```
    'If classification is NO_ACTION_NEEDED: write the classification JSON to /tmp/summary.txt. Then post an informational message (no approve/reject buttons): NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "ℹ️ No action needed — <guest name> at <property name>: <summary from classification JSON>" --task-id $TASK_ID > /tmp/approval-message.json\n'
    ```
  - **Replace with**:
    ```
    'If classification is NO_ACTION_NEEDED: write the classification JSON to /tmp/summary.txt. Then post a NO_ACTION_NEEDED notification card with Reply Anyway button:\n' +
    'NODE_NO_WARNINGS=1 tsx /tools/slack/post-no-action-notification.ts \\\n' +
    '  --channel "$NOTIFICATION_CHANNEL" \\\n' +
    '  --task-id "$TASK_ID" \\\n' +
    '  --guest-name "<guestName>" \\\n' +
    '  --property-name "<propertyName>" \\\n' +
    '  --check-in "<checkIn>" \\\n' +
    '  --check-out "<checkOut>" \\\n' +
    '  --booking-channel "<bookingChannel>" \\\n' +
    '  --original-message "<originalMessage>" \\\n' +
    '  --summary "<summary from classification JSON>" \\\n' +
    '  --confidence <confidence> \\\n' +
    '  --category "<category>" \\\n' +
    '  --lead-uid "<leadUid>" \\\n' +
    '  --thread-uid "<threadUid>" \\\n' +
    '  --message-uid "<messageUid>" \\\n' +
    '  > /tmp/approval-message.json\n'
    ```
  - Also add the `conversationRef` append step (same as Step 5 has): `node -e "const f='/tmp/approval-message.json'; const d=JSON.parse(require('fs').readFileSync(f,'utf8')); d.conversationRef='<threadUid>'; require('fs').writeFileSync(f,JSON.stringify(d))"`
  - Ensure `pnpm prisma db seed` still runs successfully (the seed file must be syntactically correct)
  - Run `pnpm build` to verify TypeScript compilation

  **Must NOT do**:
  - Do NOT change any other part of the archetype instructions (Steps 1, 2, 3, 5, 6)
  - Do NOT change the NEEDS_APPROVAL path in Step 4
  - Do NOT modify the system prompt
  - Do NOT change the DozalDevs tenant archetype (only VLRE)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single string replacement in seed file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1 (the shell tool must exist before instructions reference it)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:244` — The current NO_ACTION_NEEDED instruction line to replace
  - `prisma/seed.ts:251-269` — The NEEDS_APPROVAL `post-guest-approval.ts` invocation pattern. The new NO_ACTION_NEEDED invocation mirrors this format (multi-line `\\\n` continuation, same arg flags).
  - `prisma/seed.ts:268` — The `conversationRef` append step to copy for the NO_ACTION_NEEDED path

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed file contains new tool reference
    Tool: Bash
    Preconditions: seed.ts is modified
    Steps:
      1. Run: grep "post-no-action-notification.ts" prisma/seed.ts
      2. Assert: match found in VLRE_GUEST_MESSAGING_INSTRUCTIONS
      3. Run: grep "post-message.ts.*No action needed" prisma/seed.ts
      4. Assert: NO match found (old pattern removed)
    Expected Result: New tool reference present, old pattern removed
    Evidence: .sisyphus/evidence/task-3-seed-grep.txt

  Scenario: Build succeeds after seed change
    Tool: Bash
    Preconditions: seed.ts modified
    Steps:
      1. Run: pnpm build
      2. Check exit code
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-seed-grep.txt — Grep verification of new tool reference
  - [ ] task-3-build.txt — Build output

  **Commit**: YES
  - Message: `feat(seed): update archetype instructions to use post-no-action-notification tool`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

---

- [x] 4. Lifecycle — Reply Anyway Wait + Re-Draft Branch + Tests

  **What to do**:
  This is the most complex task. Modify `src/inngest/employee-lifecycle.ts` to add a 24h Reply Anyway window for NO_ACTION_NEEDED tasks, and add a re-draft flow when the button is clicked.

  **Step-by-step changes in `employee-lifecycle.ts`**:
  1. **Modify the `check-classification` step** (lines 304-324): Add a check for `reply_anyway: true` in task metadata. If present (meaning this is a re-draft run triggered by Reply Anyway), force `skipApproval = false` regardless of classification. This is the infinite loop guard.

     ```typescript
     // Inside check-classification step, after reading deliverable:
     // Check if this is a reply-anyway re-draft — force approval
     const taskMetaRes = await fetch(
       `${supabaseUrlInner}/rest/v1/tasks?id=eq.${taskId}&select=metadata`,
       { headers },
     );
     const taskMetaRows = (await taskMetaRes.json()) as Array<{
       metadata: Record<string, unknown> | null;
     }>;
     const taskMeta = taskMetaRows[0]?.metadata ?? {};
     if (taskMeta.reply_anyway === true) {
       return { skipApproval: false }; // Force approval flow for reply-anyway re-drafts
     }
     // ... existing classification check follows
     ```

  2. **Replace the `complete-no-action` + `cleanup-no-action` block** (lines 326-342): Instead of immediately completing to Done, add a Reply Anyway wait window:

     ```typescript
     if (classificationCheck.skipApproval) {
       // Destroy the work machine (it already posted the notification card)
       await step.run('cleanup-no-action', async () => {
         try {
           const flyApp =
             process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
           await destroyMachine(flyApp, machineId as string);
         } catch (err) {
           log.warn({ machineId, err }, 'Failed to destroy machine');
         }
       });

       // Wait for Reply Anyway click (24h timeout)
       const replyAnywayEvent = await step.waitForEvent('wait-for-reply-anyway', {
         event: 'employee/reply-anyway.requested',
         match: 'data.taskId',
         timeout: `${timeoutHours}h`,
       });

       if (!replyAnywayEvent) {
         // Timeout — auto-complete to Done (no reminder)
         await step.run('complete-no-action-timeout', async () => {
           await patchTask(supabaseUrl, headers, taskId, { status: 'Done' });
           await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
           log.info({ taskId }, 'State: Done (NO_ACTION_NEEDED — 24h timeout, no Reply Anyway)');
         });
         return;
       }

       // Reply Anyway clicked! Mark override and re-draft
       await step.run('mark-reply-anyway-override', async () => {
         // Track override in task metadata for classification accuracy analysis
         await patchTask(supabaseUrl, headers, taskId, {
           status: 'Executing',
           metadata: {
             overridden_no_action: true,
             reply_anyway: true,
             reply_anyway_by: replyAnywayEvent.data.userId,
             reply_anyway_at: new Date().toISOString(),
           },
         });
         await logStatusTransition(supabaseUrl, headers, taskId, 'Executing', 'Submitting');
         log.info(
           { taskId, userId: replyAnywayEvent.data.userId },
           'Reply Anyway override — spawning re-draft machine',
         );

         // Update the NO_ACTION_NEEDED Slack card to show processing state
         // Read approval_message_ts and target_channel from deliverable metadata
         const delivRes = await fetch(
           `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
           { headers },
         );
         const delivRows = (await delivRes.json()) as Array<{
           metadata: Record<string, unknown> | null;
         }>;
         const delivMeta = delivRows[0]?.metadata ?? {};
         const approvalTs = delivMeta.approval_message_ts as string | undefined;
         const targetChannel = delivMeta.target_channel as string | undefined;

         if (approvalTs && targetChannel) {
           const slackToken = tenantEnv.SLACK_BOT_TOKEN;
           if (slackToken) {
             const { WebClient } = await import('@slack/web-api');
             const slack = new WebClient(slackToken);
             await slack.chat.update({
               channel: targetChannel,
               ts: approvalTs,
               text: '⏳ Drafting response (Reply Anyway)...',
               blocks: [
                 {
                   type: 'section',
                   text: {
                     type: 'mrkdwn',
                     text: `⏳ Drafting response (Reply Anyway by <@${replyAnywayEvent.data.userId}>)...`,
                   },
                 },
                 { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
               ],
             });
           }
         }
       });

       // Read the original deliverable to get message context for the re-draft machine
       const replyContext = await step.run('build-reply-context', async () => {
         const delivRes = await fetch(
           `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=content&order=created_at.desc&limit=1`,
           { headers },
         );
         const delivRows = (await delivRes.json()) as Array<{ content: string }>;
         const content = delivRows[0]?.content ?? '';
         const parsed = parseClassifyResponse(content);
         return JSON.stringify({
           guestName: parsed.guestName ?? 'Unknown',
           propertyName: parsed.propertyName ?? 'Unknown',
           checkIn: parsed.checkIn ?? '',
           checkOut: parsed.checkOut ?? '',
           bookingChannel: parsed.bookingChannel ?? '',
           originalMessage: parsed.originalMessage ?? '',
           summary: parsed.summary,
           leadUid: parsed.leadUid ?? '',
           threadUid: parsed.threadUid ?? '',
           messageUid: parsed.messageUid ?? '',
           conversationSummary: parsed.conversationSummary ?? '',
         });
       });

       // Spawn re-draft machine with REPLY_ANYWAY_CONTEXT
       const replyMachineId = await step.run('reply-anyway-execute', async () => {
         // Same pattern as the original 'executing' step (lines 215-230)
         const vmSize = process.env.SUMMARIZER_VM_SIZE ?? 'shared-cpu-1x';
         const image = process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
         const flyApp =
           process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
         const effectiveSupabaseUrl =
           process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl;

         const machine = await createMachine(flyApp, {
           image,
           vm_size: vmSize,
           auto_destroy: true,
           kill_timeout: 1800,
           cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
           env: {
             ...tenantEnv,
             TASK_ID: taskId,
             TENANT_ID: tenantId,
             ISSUES_SLACK_CHANNEL: process.env['ISSUES_SLACK_CHANNEL'] ?? '',
             SUPABASE_URL: effectiveSupabaseUrl,
             SUPABASE_SECRET_KEY: supabaseKey,
             REPLY_ANYWAY_CONTEXT: replyContext,
           },
         });
         log.info({ taskId, machineId: machine.id }, 'Reply Anyway re-draft machine spawned');
         return machine.id;
       });

       // Poll re-draft machine for completion
       await step.run('reply-anyway-poll', async () => {
         // Same polling pattern as 'poll-completion' (lines 236-270)
         const maxPolls = 60;
         const intervalMs = 15_000;
         for (let i = 0; i < maxPolls; i++) {
           await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
           const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`, {
             headers,
           });
           const rows = (await res.json()) as Array<{ status: string }>;
           const status = rows[0]?.status ?? '';
           if (status === 'Submitting' || status === 'Failed') {
             if (status === 'Failed') {
               log.error({ taskId }, 'Reply Anyway re-draft machine failed');
               return;
             }
             break;
           }
         }
       });

       // Re-draft machine wrote a new deliverable — fall through to normal approval flow
       // The code below (check-supersede, set-reviewing, waitForEvent, handle-approval-result)
       // handles the rest identically to a NEEDS_APPROVAL task
     }
     ```

  3. **Remove the early `return`** from the skipApproval block so the code falls through to the existing approval flow (check-supersede → set-reviewing → waitForEvent → handle-approval-result).

  4. **Create `tests/inngest/lifecycle-reply-anyway.test.ts`** with tests for:
     - **Reply Anyway timeout path**: `waitForEvent` returns `null` → task patched to Done, no machine spawned
     - **Reply Anyway click path**: `waitForEvent` returns event → machine spawned with `REPLY_ANYWAY_CONTEXT`, task goes to Reviewing
     - **Infinite loop guard**: Task with `reply_anyway: true` in metadata → `check-classification` forces `skipApproval = false`
     - **Existing NO_ACTION path untouched**: Regression test — existing `employee-lifecycle-classification.test.ts` tests still pass

  **Must NOT do**:
  - Do NOT modify the approval flow code (check-supersede, set-reviewing, waitForEvent, handle-approval-result)
  - Do NOT add a new Inngest function — everything stays in `employee-lifecycle.ts`
  - Do NOT add a new task state to the database — use existing states (`Submitting`, `Executing`, `Reviewing`)
  - Do NOT modify `isTaskAwaitingApproval()` function
  - Do NOT change `employee/approval.received` event handling
  - Do NOT add a 12h reminder or any intermediate timeout notification

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex lifecycle modification requiring careful understanding of Inngest step functions, waitForEvent semantics, and control flow. Needs to avoid breaking the existing approval path.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Task 5, but Task 4 is the critical path)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:304-342` — **THE CODE TO MODIFY**. The current `check-classification` step and `complete-no-action`/`cleanup-no-action` blocks. Read this entire section carefully before making changes.
  - `src/inngest/employee-lifecycle.ts:215-230` — Machine spawn pattern (`createMachine` call with env vars). Copy this pattern for the Reply Anyway re-draft machine, adding `REPLY_ANYWAY_CONTEXT`.
  - `src/inngest/employee-lifecycle.ts:236-270` — Polling pattern (`poll-completion`). Copy this for `reply-anyway-poll`.
  - `src/inngest/employee-lifecycle.ts:344-476` — The approval flow code (check-supersede → set-reviewing → track-pending-approval → waitForEvent). This code must execute AFTER the Reply Anyway branch when the button is clicked. Do NOT modify it — just ensure the Reply Anyway branch falls through to it.
  - `src/inngest/employee-lifecycle.ts:476-797` — `handle-approval-result` step. The re-drafted response flows through this existing code. No modifications needed.
  - `src/inngest/employee-lifecycle.ts:625-648` — Delivery machine spawn pattern (with retry). The Reply Anyway re-draft machine does NOT use retry — single attempt only.

  **Test References**:
  - `tests/inngest/employee-lifecycle-classification.test.ts` — Existing lifecycle classification tests. **MUST CONTINUE TO PASS.** Shows the `InngestTestEngine` + `mockCtx` pattern with per-step-ID switching. Follow this pattern for new tests.
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — Shows how to mock `createMachine`, `destroyMachine`, `loadTenantEnv`, and Slack client. Copy mock setup.

  **API/Type References**:
  - `src/lib/classify-message.ts:1-19` — `ClassifyResult` interface with all fields. The `build-reply-context` step extracts these fields for `REPLY_ANYWAY_CONTEXT`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Reply Anyway timeout — task auto-completes to Done
    Tool: Bash (run test file)
    Preconditions: tests/inngest/lifecycle-reply-anyway.test.ts exists
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-reply-anyway.test.ts
      2. Check test "Reply Anyway timeout — task patched to Done" passes
      3. Assert: mockCreateMachine NOT called for re-draft (only called for original work machine)
      4. Assert: PATCH body contains { status: 'Done' }
    Expected Result: Test passes, task reaches Done without re-draft
    Evidence: .sisyphus/evidence/task-4-timeout-test.txt

  Scenario: Reply Anyway click — re-draft machine spawned
    Tool: Bash (run test file)
    Preconditions: tests/inngest/lifecycle-reply-anyway.test.ts exists
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-reply-anyway.test.ts
      2. Check test "Reply Anyway clicked — re-draft machine spawned with REPLY_ANYWAY_CONTEXT" passes
      3. Assert: mockCreateMachine called with env containing REPLY_ANYWAY_CONTEXT
      4. Assert: task transitions through Executing → Submitting → Reviewing
    Expected Result: Test passes, machine spawned with correct env
    Evidence: .sisyphus/evidence/task-4-click-test.txt

  Scenario: Infinite loop guard — reply_anyway metadata forces approval
    Tool: Bash (run test file)
    Preconditions: tests/inngest/lifecycle-reply-anyway.test.ts exists
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle-reply-anyway.test.ts
      2. Check test "Infinite loop guard — reply_anyway in metadata forces skipApproval = false" passes
      3. Assert: check-classification returns { skipApproval: false } when metadata has reply_anyway: true
    Expected Result: Test passes, infinite loop prevented
    Evidence: .sisyphus/evidence/task-4-loop-guard-test.txt

  Scenario: Existing classification tests still pass (regression)
    Tool: Bash
    Preconditions: Lifecycle modified
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-classification.test.ts
      2. Assert: all existing tests pass
    Expected Result: Zero regressions
    Evidence: .sisyphus/evidence/task-4-regression-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-timeout-test.txt — Timeout path test output
  - [ ] task-4-click-test.txt — Reply Anyway click path test output
  - [ ] task-4-loop-guard-test.txt — Infinite loop guard test output
  - [ ] task-4-regression-test.txt — Regression test output

  **Commit**: YES
  - Message: `feat(lifecycle): add Reply Anyway wait and re-draft branch for NO_ACTION_NEEDED`
  - Files: `src/inngest/employee-lifecycle.ts`, `tests/inngest/lifecycle-reply-anyway.test.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run`

- [x] 5. Slack Handler — `guest_reply_anyway` Action + Tests

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, add a new action handler for `guest_reply_anyway` following the exact pattern of `guest_approve` (lines 358-439):
    1. Parse `taskId` from `actionBody.actions[0]?.value`
    2. Ack with processing state: `⏳ Processing Reply Anyway...`
    3. Idempotency check: create `isTaskPendingReplyAnyway(taskId)` function that checks task status is NOT in a terminal state (`Done`, `Failed`, `Cancelled`). If terminal, update card to "⚠️ This notification has already been resolved." and return.
    4. Fire event: `inngest.send({ name: 'employee/reply-anyway.requested', data: { taskId, userId: user.id, userName: user.name }, id: \`employee-reply-anyway-${taskId}\` })`
    5. Log: `'Reply Anyway event sent — lifecycle will spawn re-draft machine'`
    6. Error handling: on failure, restore the Reply Anyway button using a new `NO_ACTION_BUTTON_BLOCKS` constant
  - Add `NO_ACTION_BUTTON_BLOCKS` constant (similar to `GUEST_BUTTON_BLOCKS` at line 69) with the single Reply Anyway button for error-state restoration
  - Add `isTaskPendingReplyAnyway(taskId)` helper function that checks `status NOT IN ('Done', 'Failed', 'Cancelled')` via PostgREST
  - Create `tests/gateway/slack/reply-anyway-handler.test.ts` with tests for:
    - Handler sends correct event to Inngest with correct data shape
    - Ack called with processing state blocks
    - Task in terminal state → event NOT sent, card updated to "already resolved"
    - Missing taskId → early return with ack
    - Handler failure → buttons restored
    - Inngest dedup ID format matches `employee-reply-anyway-{taskId}`

  **Must NOT do**:
  - Do NOT modify `isTaskAwaitingApproval()` function
  - Do NOT modify existing handlers (`guest_approve`, `guest_edit`, `guest_reject`, `approve`, `reject`)
  - Do NOT add `guest_reply_anyway` to `GUEST_BUTTON_BLOCKS` constant
  - Do NOT change `employee/approval.received` event handling

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Follows an established pattern but requires careful handling of idempotency, error states, and correct event naming
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (needs `guest_reply_anyway` action_id to match the shell tool's button)

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:358-439` — **PRIMARY TEMPLATE**. The `guest_approve` handler. Copy this entire structure: ack with processing state, idempotency check, inngest.send, error handling with button restoration. Change: event name to `employee/reply-anyway.requested`, dedup ID to `employee-reply-anyway-${taskId}`, ack text to "Processing Reply Anyway...", error restore to `NO_ACTION_BUTTON_BLOCKS`.
  - `src/gateway/slack/handlers.ts:42-67` — `isTaskAwaitingApproval()` function. Do NOT modify this. Create a separate `isTaskPendingReplyAnyway()` with similar structure but checking for non-terminal states.
  - `src/gateway/slack/handlers.ts:69-95` — `GUEST_BUTTON_BLOCKS` constant. Use as template for `NO_ACTION_BUTTON_BLOCKS` with only the Reply Anyway button.
  - `src/gateway/slack/handlers.ts:119` — `registerSlackHandlers()` function entry point. Add the new `boltApp.action('guest_reply_anyway', ...)` inside this function.

  **Test References**:
  - `tests/gateway/slack/guest-handlers.test.ts` — **PRIMARY TEST TEMPLATE**. Shows `makeMockBoltApp()` pattern, mock ack/body/respond/client, and assertions on `inngest.send` calls. Follow this exact test structure.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Reply Anyway handler sends correct event
    Tool: Bash (run test file)
    Preconditions: tests/gateway/slack/reply-anyway-handler.test.ts exists
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/reply-anyway-handler.test.ts
      2. Check test "guest_reply_anyway sends employee/reply-anyway.requested event" passes
      3. Assert: inngest.send called with { name: 'employee/reply-anyway.requested', data: { taskId: 'test-task-id', userId: 'U123', userName: 'testuser' }, id: 'employee-reply-anyway-test-task-id' }
    Expected Result: Test passes with correct event shape
    Evidence: .sisyphus/evidence/task-5-handler-test.txt

  Scenario: Idempotency — terminal task state blocks event
    Tool: Bash (run test file)
    Preconditions: tests/gateway/slack/reply-anyway-handler.test.ts exists
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/reply-anyway-handler.test.ts
      2. Check test "task in Done state → event not sent" passes
      3. Assert: inngest.send NOT called
      4. Assert: respond called with "already been resolved" text
    Expected Result: Test passes, duplicate prevention works
    Evidence: .sisyphus/evidence/task-5-idempotency-test.txt

  Scenario: Existing handlers unaffected (regression)
    Tool: Bash
    Preconditions: handlers.ts modified
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/guest-handlers.test.ts
      2. Assert: all existing tests pass
    Expected Result: Zero regressions on existing handlers
    Evidence: .sisyphus/evidence/task-5-regression-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-handler-test.txt — Handler test output
  - [ ] task-5-idempotency-test.txt — Idempotency test output
  - [ ] task-5-regression-test.txt — Existing handler regression test

  **Commit**: YES
  - Message: `feat(slack): add guest_reply_anyway action handler`
  - Files: `src/gateway/slack/handlers.ts`, `tests/gateway/slack/reply-anyway-handler.test.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run`

---

- [x] 6. Full Verification — Regression Tests, Build, Lint

  **What to do**:
  - Run the complete test suite: `pnpm test -- --run`
  - Run the build: `pnpm build`
  - Run the linter: `pnpm lint`
  - Verify ≥515 tests pass (no regressions from pre-existing count)
  - Specifically verify these existing test files pass without modification:
    - `tests/inngest/employee-lifecycle-classification.test.ts`
    - `tests/inngest/employee-lifecycle-delivery.test.ts`
    - `tests/inngest/lifecycle-guest-approval.test.ts`
    - `tests/gateway/slack/guest-handlers.test.ts`
    - `tests/worker-tools/slack/post-guest-approval.test.ts`
    - `tests/lib/classify-message.test.ts`
  - If any test fails: diagnose whether it's a regression from GM-16 changes or a pre-existing failure. Fix only GM-16 regressions.

  **Must NOT do**:
  - Do NOT fix pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`, etc.)
  - Do NOT modify existing test files to make them pass — fix the source code instead

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs to run full suite, diagnose failures, and fix regressions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — must verify before updating story map)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `package.json` — `test`, `build`, `lint` script definitions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All Tasks 1-5 committed
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -30
      2. Assert: "Tests" line shows ≥515 passed
      3. Assert: 0 unexpected failures (pre-existing failures excluded)
    Expected Result: ≥515 tests pass, 0 new failures
    Evidence: .sisyphus/evidence/task-6-test-suite.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Check exit code
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-6-build.txt

  Scenario: Lint passes
    Tool: Bash
    Steps:
      1. Run: pnpm lint
      2. Check exit code
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-6-lint.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-test-suite.txt — Full test suite output
  - [ ] task-6-build.txt — Build output
  - [ ] task-6-lint.txt — Lint output

  **Commit**: NO (verification only, no code changes)

---

- [x] 7. Story Map Update — Mark GM-16 Checkboxes as Completed

  **What to do**:
  - Open `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the GM-16 section (line 848)
  - Change all 6 acceptance criteria checkboxes from `- [ ]` to `- [x]`:
    - `[x] NO_ACTION_NEEDED messages post a lightweight Slack notification with: guest name, property, message snippet, classification reason`
    - `[x] "Reply Anyway" button present on the notification`
    - `[x] Clicking "Reply Anyway" triggers the full draft + approval flow (same as NEEDS_APPROVAL)`
    - `[x] Task ID context block present on the notification`
    - `[x] If no one clicks "Reply Anyway" within 24 hours, the notification is considered resolved (no reminder)`
    - `[x] Override is tracked in metrics as \`overridden_no_action\` for classification accuracy analysis`

  **Must NOT do**:
  - Do NOT modify any other story's checkboxes (only GM-16)
  - Do NOT update the Release Overview, Epic Summary, or any other section
  - Do NOT change the story text, porting notes, or complexity

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 6 checkbox changes in a single file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:861-866` — The 6 GM-16 acceptance criteria checkboxes to mark as `[x]`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All GM-16 checkboxes marked
    Tool: Bash
    Preconditions: Story map updated
    Steps:
      1. Run: grep -A6 "GM-16.*Acceptance Criteria" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[ \]"
      2. Assert: NO unchecked boxes found (empty output)
      3. Run: grep -A6 "GM-16.*Acceptance Criteria" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[x\]" | wc -l
      4. Assert: count is 6
    Expected Result: All 6 checkboxes marked, 0 unchecked
    Evidence: .sisyphus/evidence/task-7-story-map-verify.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-story-map-verify.txt — Checkbox verification output

  **Commit**: YES
  - Message: `docs: mark GM-16 acceptance criteria as completed in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`

---

- [x] 8. Notify Completion

  **What to do**:
  - Send a Telegram notification that plan `gm16-reply-anyway-button` is complete, all tasks done, come back to review results.
  - Run: `tsx scripts/telegram-notify.ts "✅ gm16-reply-anyway-button complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (last task)
  - **Blocks**: None
  - **Blocked By**: Task 7

  **References**:
  - `scripts/telegram-notify.ts` — Telegram notification script

  **Acceptance Criteria**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ gm16-reply-anyway-button complete — All tasks done. Come back to review results."
      2. Check exit code
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-8-notification.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                      | Files                                                                                                                   | Pre-commit Check                   |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1    | `feat(slack): add post-no-action-notification shell tool`                           | `src/worker-tools/slack/post-no-action-notification.ts`, `tests/worker-tools/slack/post-no-action-notification.test.ts` | `pnpm build && pnpm test -- --run` |
| 2    | `feat(harness): add REPLY_ANYWAY_CONTEXT injection and infinite loop guard`         | `src/workers/opencode-harness.mts`                                                                                      | `pnpm build`                       |
| 3    | `feat(seed): update archetype instructions to use post-no-action-notification tool` | `prisma/seed.ts`                                                                                                        | `pnpm build`                       |
| 4    | `feat(lifecycle): add Reply Anyway wait and re-draft branch for NO_ACTION_NEEDED`   | `src/inngest/employee-lifecycle.ts`, `tests/inngest/lifecycle-reply-anyway.test.ts`                                     | `pnpm build && pnpm test -- --run` |
| 5    | `feat(slack): add guest_reply_anyway action handler`                                | `src/gateway/slack/handlers.ts`, `tests/gateway/slack/reply-anyway-handler.test.ts`                                     | `pnpm build && pnpm test -- --run` |
| 6    | `test: verify full suite passes with GM-16 changes`                                 | — (no code changes, verification only)                                                                                  | `pnpm test -- --run`               |
| 7    | `docs: mark GM-16 acceptance criteria as completed in story map`                    | `docs/2026-04-21-2202-phase1-story-map.md`                                                                              | —                                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm build              # Expected: exit 0
pnpm test -- --run      # Expected: ≥515 tests pass, 0 failures (excluding known pre-existing)
pnpm lint               # Expected: exit 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] GM-16 story map checkboxes all marked `[x]`
