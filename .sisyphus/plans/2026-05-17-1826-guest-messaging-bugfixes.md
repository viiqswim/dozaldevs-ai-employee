# Guest Messaging — 5 Bug Fixes (Slack UX & Lifecycle)

## TL;DR

> **Quick Summary**: Fix 5 production bugs discovered from real Slack messages in the guest-messaging AI employee — ghost workers posting after cancellation, delivery interruption, newline formatting, inconsistent approval cards, and unthreaded approval messages.
>
> **Deliverables**:
>
> - Ghost workers stop immediately when their task is superseded (no stale URGENT alerts)
> - In-progress deliveries can't be interrupted by new webhooks
> - Approved message notifications display proper line breaks
> - Approval cards always use the rich structured format and appear as thread replies
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 tasks in Wave 1, 2 in Wave 2
> **Critical Path**: All Wave 1 tasks → Reseed + Rebuild → Tests + Notify

---

## Context

### Original Request

User found 5 distinct issues while reviewing recent Slack activity from the guest-messaging AI employee (Papi Chulo). All bugs are from real production messages — real guests, real properties, real conversations.

### Interview Summary

**Key Discussions**:

- Bug 1 (Ghost Worker): Superseded task `9cf480e3` (Paola Zaanoni) posted an URGENT alert after being marked superseded. The old worker kept running because the lifecycle's poll loop ignores `Cancelled` status.
- Bug 2 (Delivery Interruption): Tasks in `Delivering` or `Approved` state can be cancelled by a new webhook, potentially interrupting mid-flight approved replies.
- Bug 3 (Literal `\n`): Approved notification for Rafael Jimenez showed `Hi Rafael\n\n` with literal backslash-n instead of real line breaks.
- Bug 4 (Inconsistent Cards): Two different approval card formats appear in Slack — the rich structured card (Format B) and a simpler generic fallback (Format A) — depending on which code path the agent hits.
- Bug 5 (Unthreaded Cards): Approval cards post as new top-level messages instead of thread replies under the task's notification. The `NOTIFY_MSG_TS` env var is available but never passed.

**Research Findings**:

- The inline poll loop in `employee-lifecycle.ts` only exits on `Submitting` or `Failed` — `Cancelled` is ignored (confirmed by explore agent)
- The separate `lib/poll-completion.ts` already handles `Cancelled` correctly — the bug is in the INLINE loop only
- `hostfully.ts` hard-blocks only `Executing` and `Validating` — `Delivering` and `Approved` are missing
- `slack-blocks.ts` `buildEnrichedTerminalBlocks` has no `\n` normalization on `sentSnippet`
- `post-guest-approval.ts` normalizes `originalMessage` (line 235) but NOT `draftResponse`
- `tryAutoPostApprovalCard` in `opencode-harness.mts` calls `postApprovalCard` without `threadTs`
- `postApprovalCard` in `approval-card-poster.mts` already accepts and uses `threadTs` — just never called with it
- `NOTIFY_MSG_TS` is injected as env var by the lifecycle (lines 505, 534)

### Metis Review

**Identified Gaps** (addressed):

- Metis caught that Bug 1 fix MUST target the inline poll loop (~line 570), NOT `lib/poll-completion.ts` (already correct)
- Metis identified that after `poll-completion` returns `Cancelled`, explicit handling is needed — without it, the code falls through to `Failed` handling, creating a new failure mode
- Metis flagged that `NOTIFY_MSG_TS` can be empty string — must guard with `|| undefined` to prevent Slack API error
- Metis noted that `prisma/seed.ts` changes only affect fresh DB setups — existing deployments need the seed re-run
- Metis confirmed `Delivering` hard-block is correct: the window is seconds long, and subsequent guest messages will generate their own webhooks

---

## Work Objectives

### Core Objective

Fix 5 production bugs in the guest-messaging Slack integration so that superseded workers stop immediately, approved deliveries can't be interrupted, message formatting is clean, approval cards are consistent, and approval cards appear as thread replies.

### Concrete Deliverables

- `src/inngest/employee-lifecycle.ts` — inline poll loop exits on `Cancelled`, explicit handling branch
- `src/gateway/routes/hostfully.ts` — `Delivering` + `Approved` added to hard-block list
- `src/lib/slack-blocks.ts` — `\n` normalization on `sentSnippet`
- `src/worker-tools/slack/post-guest-approval.ts` — `\n` normalization on `draftResponse`
- `src/workers/opencode-harness.mts` — `threadTs` passed to `postApprovalCard`
- `src/workers/skills/tool-usage-reference/SKILL.md` — `--thread-ts "$NOTIFY_MSG_TS"` documented as required
- `prisma/seed.ts` — archetype instructions updated to require `--thread-ts` and always use `post-guest-approval.ts`

### Definition of Done

- [ ] `pnpm test -- --run` passes with no new failures beyond the 2 known pre-existing ones
- [ ] Docker image rebuilt with worker-side changes
- [ ] DB reseeded with updated archetype instructions

### Must Have

- Ghost workers exit cleanly when `Cancelled` — no Slack posts after supersede
- `Delivering` and `Approved` tasks hard-blocked from supersede
- Literal `\n` replaced with real newlines in both `sentSnippet` and `draftResponse`
- Approval cards always threaded under notification message (both auto-post and agent-called paths)
- Archetype instructions require `post-guest-approval.ts` with `--thread-ts "$NOTIFY_MSG_TS"`

### Must NOT Have (Guardrails)

- Do NOT modify `src/inngest/lib/poll-completion.ts` — it already handles `Cancelled` correctly
- Do NOT add guest-specific fields (guest name, property) to the generic `approval-card-poster.mts` — it is employee-agnostic per AGENTS.md
- Do NOT add `Reviewing` or `Submitting` to the hard-block list in `hostfully.ts` — those should still supersede
- Do NOT normalize `originalMessage` again in `post-guest-approval.ts` — already done at line 235
- Do NOT rewrite the entire archetype instructions block — surgical additions only
- Do NOT change the `postApprovalCard` function signature in `approval-card-poster.mts`
- Do NOT refactor the inline poll loop into the library — they serve different contexts

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (run existing suite to verify no regressions)
- **Framework**: Vitest via `pnpm test -- --run`

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend lifecycle changes**: Use Bash (curl against PostgREST) to verify DB state
- **Slack formatting**: Use Bash (grep/read) to verify code changes produce correct output
- **Worker changes**: Verify via code inspection + Docker build success

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all 4 tasks in parallel):
├── Task 1: Bug 1 — Ghost Worker fix (employee-lifecycle.ts) [deep]
├── Task 2: Bug 2 — Hard-block Delivering/Approved (hostfully.ts) [quick]
├── Task 3: Bug 3 — \n normalization (slack-blocks.ts + post-guest-approval.ts) [quick]
└── Task 4: Bugs 4+5 — Approval card threading + consistency (harness + skill + seed) [unspecified-high]

Wave 2 (After Wave 1 — sequential):
├── Task 5: Reseed DB + rebuild Docker + run tests [quick]
└── Task 6: Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks    |
| ----- | ---------- | --------- |
| 1     | None       | 5         |
| 2     | None       | 5         |
| 3     | None       | 5         |
| 4     | None       | 5         |
| 5     | 1, 2, 3, 4 | 6, F1-F4  |
| 6     | 5          | None      |
| F1-F4 | 5          | User okay |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `deep`, T2 → `quick`, T3 → `quick`, T4 → `unspecified-high`
- **Wave 2**: **2 tasks** — T5 → `quick`, T6 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Bug 1 — Ghost Worker: Make Cancelled Tasks Stop Immediately

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the INLINE poll loop (around line 570) inside the `step.run('poll-completion', ...)` block. This loop currently only exits when the task status is `Submitting` or `Failed`. Add `Cancelled` as a third exit condition.
  - IMPORTANT: Do NOT touch `src/inngest/lib/poll-completion.ts` — that library file already handles `Cancelled` correctly. The bug is ONLY in the inline loop inside the lifecycle file.
  - After the poll loop returns, there's a branch: `if (finalStatus === 'Failed') { ... }`. Add a NEW branch: `if (finalStatus === 'Cancelled') { ... }` that:
    1. Updates the task's Slack notification message (`notifyMsgRef`) to show "⏭️ Superseded" state (follow the pattern used by `mark-failed` for updating the notify message, but use `buildSupersededBlocks` or `buildNotifyBlocks` with superseded state)
    2. Destroys the worker machine (same as `mark-failed` does)
    3. Returns early — does NOT proceed to validation, approval card posting, or delivery
  - The `Cancelled` branch must be placed BEFORE the existing `Failed` branch to prevent fall-through.

  **Must NOT do**:
  - Do NOT modify `src/inngest/lib/poll-completion.ts` — it is already correct
  - Do NOT refactor the inline poll loop to use the library — they serve different contexts
  - Do NOT add any new Inngest steps — handle within the existing `poll-completion` step and the code after it

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: State machine changes in a critical lifecycle function require careful understanding of branching logic and side effects
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Covers all 13 lifecycle states, state transitions, and the reviewing-watchdog — essential context for modifying the poll loop

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5 (reseed + rebuild + tests)
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/inngest/employee-lifecycle.ts` — `mark-failed` step: follow this exact pattern for updating the Slack notification and destroying the worker machine when `Cancelled` is detected. Look at how it calls `slackClient.updateMessage()` with `notifyMsgRef.ts` and `buildNotifyBlocks()`.
  - `src/inngest/employee-lifecycle.ts` — `handle-approval-result` step (around line 1910): this is where `action === 'superseded'` is already handled for the approval card update. Look at how it calls `buildSupersededBlocks()` for reference on what the superseded notification should look like.

  **API/Type References**:
  - `src/lib/slack-blocks.ts` — `buildSupersededBlocks()` (line 5): builds the "⏭️ Superseded" block layout. Use this or `buildNotifyBlocks` with appropriate state parameter for the notification update.
  - `src/lib/slack-blocks.ts` — `buildNotifyBlocks()` (line 389): the generic notify block builder — check what `state` param produces a "superseded" appearance.

  **WHY Each Reference Matters**:
  - The `mark-failed` step shows the exact Slack API calls, error handling, and machine destruction sequence needed
  - The `handle-approval-result` superseded branch shows what "superseded" UI should look like in Slack
  - `buildSupersededBlocks` provides the pre-built block layout for superseded state

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cancelled status exits the poll loop (code verification)
    Tool: Bash (grep)
    Preconditions: Task 1 changes applied to employee-lifecycle.ts
    Steps:
      1. Read the inline poll loop section of employee-lifecycle.ts
      2. Verify that the loop exit condition includes 'Cancelled' alongside 'Submitting' and 'Failed'
      3. Verify that a `finalStatus === 'Cancelled'` branch exists BEFORE the `finalStatus === 'Failed'` branch
      4. Verify the Cancelled branch calls machine destruction (same pattern as mark-failed)
      5. Verify the Cancelled branch updates the Slack notification message
      6. Verify the Cancelled branch returns early — does NOT proceed to validation/delivery steps
    Expected Result: All 6 checks pass — the code has Cancelled handling that exits cleanly
    Failure Indicators: Missing Cancelled exit condition, missing branch, falls through to Failed
    Evidence: .sisyphus/evidence/task-1-cancelled-poll-exit.txt

  Scenario: Cancelled branch does NOT touch poll-completion library
    Tool: Bash (git diff)
    Preconditions: Task 1 changes applied
    Steps:
      1. Run `git diff src/inngest/lib/poll-completion.ts`
      2. Verify output is empty (no changes to library file)
    Expected Result: Empty diff — library file untouched
    Failure Indicators: Any diff output means the wrong file was modified
    Evidence: .sisyphus/evidence/task-1-poll-lib-untouched.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3, 4)
  - Message: `fix(guest-messaging): stop ghost workers, protect delivery, fix formatting and card threading`
  - Files: `src/inngest/employee-lifecycle.ts`

- [x] 2. Bug 2 — Hard-Block Delivering and Approved States from Supersede

  **What to do**:
  - In `src/gateway/routes/hostfully.ts`, find the hard-block status array (around line 109) that currently contains `['Executing', 'Validating']`.
  - Add `'Delivering'` and `'Approved'` to this array so it becomes `['Executing', 'Validating', 'Delivering', 'Approved']`.
  - Update the comment block above it (around lines 86–91) that describes the dedup strategy to reflect the expanded hard-block states.
  - Add a log line when a webhook is hard-blocked during `Delivering` or `Approved` state so these events are visible for debugging (follow the existing log pattern for the `Executing`/`Validating` block).

  **Must NOT do**:
  - Do NOT add `Reviewing` or `Submitting` to the hard-block list — those should still trigger supersede behavior
  - Do NOT change the supersede logic itself — only expand the hard-block list
  - Do NOT add any new webhook retry or queueing mechanism — that's scope creep

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single array addition + comment update in one file — straightforward 5-line change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5 (reseed + rebuild + tests)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/hostfully.ts:86-140` — The entire dedup block: comment describing strategy (lines 86-91), the hard-block status check (line 109), the supersede path (lines 113-138), and the task creation (lines 141+). Read this entire block to understand the flow before changing line 109.

  **WHY Each Reference Matters**:
  - Understanding the full dedup block prevents accidentally breaking the supersede path while expanding the hard-block list

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Delivering and Approved are in the hard-block list
    Tool: Bash (grep)
    Preconditions: Task 2 changes applied to hostfully.ts
    Steps:
      1. grep for the hard-block array in src/gateway/routes/hostfully.ts
      2. Verify the array contains 'Delivering' and 'Approved' alongside 'Executing' and 'Validating'
      3. Verify the comment block above describes all 4 hard-blocked states
    Expected Result: Array contains all 4 states, comment is updated
    Failure Indicators: Missing states, outdated comment
    Evidence: .sisyphus/evidence/task-2-hard-block-states.txt

  Scenario: Reviewing and Submitting are NOT hard-blocked
    Tool: Bash (grep)
    Preconditions: Task 2 changes applied
    Steps:
      1. grep for the hard-block array
      2. Verify 'Reviewing' and 'Submitting' are NOT in the hard-block array
    Expected Result: Neither state appears in the hard-block array
    Failure Indicators: Either state found in the array
    Evidence: .sisyphus/evidence/task-2-no-reviewing-block.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3, 4)
  - Message: `fix(guest-messaging): stop ghost workers, protect delivery, fix formatting and card threading`
  - Files: `src/gateway/routes/hostfully.ts`

- [x] 3. Bug 3 — Fix Literal \n in Slack Messages

  **What to do**:
  - In `src/lib/slack-blocks.ts`, find `buildEnrichedTerminalBlocks` (around line 208) where `sentSnippet` is rendered. Add `.replace(/\\n/g, '\n')` to `sentSnippet` BEFORE the truncation logic (`sentSnippet.length > 150`). This ensures the "✅ Approved" notification shows proper line breaks.
  - In `src/worker-tools/slack/post-guest-approval.ts`, find where `draftResponse` is used (around line 253). Add `.replace(/\\n/g, '\n')` to normalize it, matching the existing normalization already applied to `originalMessage` at line 235.
  - Do NOT double-normalize `originalMessage` — it already has `.replace(/\\n/g, '\n')` at line 235.

  **Must NOT do**:
  - Do NOT normalize `originalMessage` again — already done at line 235
  - Do NOT add normalization to the generic `buildApprovalBlocks` function in `approval-card-poster.mts` — that function is employee-agnostic
  - Do NOT change any other string fields — only `sentSnippet` and `draftResponse`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two one-liner `.replace()` additions in two files — minimal change, clear pattern to follow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5 (reseed + rebuild + tests)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts:235` — The existing `originalMessage.replace(/\\n/g, '\n')` normalization. Copy this exact pattern for `draftResponse`.
  - `src/lib/slack-blocks.ts:208` — The `sentSnippet` rendering in `buildEnrichedTerminalBlocks`. This is where the literal `\n` appears in the "✅ Approved" card.

  **WHY Each Reference Matters**:
  - Line 235 shows the exact `.replace()` pattern to copy — ensures consistency
  - Line 208 shows where `sentSnippet` is used and where the normalization must be applied (before truncation)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: sentSnippet is normalized in slack-blocks.ts
    Tool: Bash (grep)
    Preconditions: Task 3 changes applied
    Steps:
      1. Read the buildEnrichedTerminalBlocks function in src/lib/slack-blocks.ts
      2. Find where sentSnippet is assigned or used for rendering
      3. Verify .replace(/\\n/g, '\n') is applied to sentSnippet BEFORE truncation
    Expected Result: Normalization present before the `length > 150` check
    Failure Indicators: Missing normalization, or applied after truncation
    Evidence: .sisyphus/evidence/task-3-sentsnippet-normalize.txt

  Scenario: draftResponse is normalized in post-guest-approval.ts
    Tool: Bash (grep)
    Preconditions: Task 3 changes applied
    Steps:
      1. Read src/worker-tools/slack/post-guest-approval.ts
      2. Verify draftResponse has .replace(/\\n/g, '\n') normalization (near line 253)
      3. Verify originalMessage normalization at line 235 is UNCHANGED
    Expected Result: Both originalMessage (existing) and draftResponse (new) are normalized
    Failure Indicators: draftResponse missing normalization, or originalMessage changed
    Evidence: .sisyphus/evidence/task-3-draftresponse-normalize.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)
  - Message: `fix(guest-messaging): stop ghost workers, protect delivery, fix formatting and card threading`
  - Files: `src/lib/slack-blocks.ts`, `src/worker-tools/slack/post-guest-approval.ts`

- [x] 4. Bugs 4+5 — Approval Card Threading + Consistent Format

  **What to do**:

  **Part A — Harness auto-post path (Bug 5 fix)**:
  - In `src/workers/opencode-harness.mts`, find `tryAutoPostApprovalCard` (around line 165) where it calls `postApprovalCard({ data, taskId, channel, token })`.
  - Add `threadTs: process.env.NOTIFY_MSG_TS || undefined` to the params object. This makes the harness auto-post path thread the approval card under the task's notification message.
  - CRITICAL: Guard with `|| undefined` — if `NOTIFY_MSG_TS` is empty string (no notification channel configured), passing `threadTs: ''` to Slack API causes an error. `undefined` makes `postApprovalCard` omit `thread_ts` entirely, and the card posts as top-level (graceful degradation).

  **Part B — Agent-called path instructions (Bug 4+5 fix)**:
  - In `src/workers/skills/tool-usage-reference/SKILL.md`, find the `post-guest-approval.ts` section. Update the example invocation to INCLUDE `--thread-ts "$NOTIFY_MSG_TS"`. Add a note marking this flag as **ALWAYS REQUIRED** for guest-messaging, explaining that `NOTIFY_MSG_TS` is an env var injected by the lifecycle.
  - In `prisma/seed.ts`, find the guest-messaging archetype instructions (archetype ID `00000000-0000-0000-0000-000000000015`). There should be both a `create` block and an `upsert`/`update` block. In BOTH:
    1. Add explicit instruction that the agent MUST ALWAYS call `post-guest-approval.ts` (not just write `summary.txt`)
    2. Add explicit instruction to ALWAYS pass `--thread-ts "$NOTIFY_MSG_TS"` when calling the tool
    3. Keep changes surgical — do NOT rewrite the entire instructions block

  **Must NOT do**:
  - Do NOT add guest-specific fields to `approval-card-poster.mts` — it is employee-agnostic
  - Do NOT change the `postApprovalCard` function signature in `approval-card-poster.mts` — it already supports `threadTs`
  - Do NOT rewrite the entire archetype instructions — surgical additions only
  - Do NOT use employee-specific language in shared files (`opencode-harness.mts` is shared, but `process.env.NOTIFY_MSG_TS || undefined` is generic enough)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches 3 files across worker code, skill docs, and seed data — requires understanding the full approval card posting pipeline
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers shell tool conventions and SKILL.md documentation patterns — useful for updating `tool-usage-reference` correctly

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5 (reseed + rebuild + tests)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts` — `tryAutoPostApprovalCard` (around line 165): the call site that needs `threadTs` added
  - `src/workers/lib/approval-card-poster.mts:19` — `postApprovalCard` interface showing `threadTs?: string` is already supported
  - `src/workers/lib/approval-card-poster.mts:126` — where `thread_ts: threadTs` is passed to Slack API — confirms the function already uses it

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:505,534` — where `NOTIFY_MSG_TS: notifyMsgRef?.ts ?? ''` is injected into worker container env — confirms the env var name and that it can be empty string

  **External References**:
  - `src/workers/skills/tool-usage-reference/SKILL.md` — the SKILL.md section for `post-guest-approval.ts` that needs the `--thread-ts` update. Find the example invocation and the flags list.
  - `prisma/seed.ts` — the guest-messaging archetype `instructions` field for archetype ID `00000000-0000-0000-0000-000000000015`. Both the `create` and `upsert`/`update` blocks must be updated.

  **WHY Each Reference Matters**:
  - `approval-card-poster.mts` confirms the function already supports threading — we just need to pass the param
  - `employee-lifecycle.ts` lines 505/534 confirm the env var name and its empty-string behavior
  - The SKILL.md example invocation is what the agent copies — if `--thread-ts` isn't in the example, the agent won't use it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness auto-post passes threadTs
    Tool: Bash (grep)
    Preconditions: Task 4 changes applied to opencode-harness.mts
    Steps:
      1. Read tryAutoPostApprovalCard in src/workers/opencode-harness.mts
      2. Find the postApprovalCard call
      3. Verify threadTs param is present with value `process.env.NOTIFY_MSG_TS || undefined`
    Expected Result: threadTs is passed with empty-string guard
    Failure Indicators: Missing threadTs, or using `process.env.NOTIFY_MSG_TS` without `|| undefined` guard
    Evidence: .sisyphus/evidence/task-4-harness-threadts.txt

  Scenario: SKILL.md documents --thread-ts as required
    Tool: Bash (grep)
    Preconditions: Task 4 changes applied to tool-usage-reference SKILL.md
    Steps:
      1. Read the post-guest-approval.ts section in src/workers/skills/tool-usage-reference/SKILL.md
      2. Find the example invocation
      3. Verify --thread-ts "$NOTIFY_MSG_TS" is present in the example
      4. Verify there's a note marking this flag as always required for guest-messaging
    Expected Result: Flag present in example + documented as required
    Failure Indicators: Missing from example, or documented as optional
    Evidence: .sisyphus/evidence/task-4-skill-threadts.txt

  Scenario: Seed.ts archetype instructions require post-guest-approval.ts
    Tool: Bash (grep)
    Preconditions: Task 4 changes applied to prisma/seed.ts
    Steps:
      1. Read the guest-messaging archetype instructions in prisma/seed.ts
      2. Verify instructions mention MUST use post-guest-approval.ts
      3. Verify instructions mention --thread-ts "$NOTIFY_MSG_TS"
      4. Verify BOTH create and upsert/update blocks are updated
    Expected Result: Both blocks contain the threading and tool requirements
    Failure Indicators: Only one block updated, or missing threading instruction
    Evidence: .sisyphus/evidence/task-4-seed-instructions.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 3)
  - Message: `fix(guest-messaging): stop ghost workers, protect delivery, fix formatting and card threading`
  - Files: `src/workers/opencode-harness.mts`, `src/workers/skills/tool-usage-reference/SKILL.md`, `prisma/seed.ts`

- [x] 5. Reseed DB + Rebuild Docker + Run Tests

  **What to do**:
  - Run `pnpm prisma db seed` to apply the updated archetype instructions from Task 4's `seed.ts` changes.
  - Rebuild the Docker image: `docker build -t ai-employee-worker:latest .` — this picks up changes to `opencode-harness.mts` (Task 4) and `tool-usage-reference/SKILL.md` (Task 4). Use tmux for this long-running command.
  - Run the full test suite: `pnpm test -- --run` — verify 515+ tests pass with no new failures beyond the 2 known pre-existing ones (`container-boot.test.ts` and `inngest-serve.test.ts`).
  - Run `pnpm build` to verify no TypeScript errors.
  - Kill the tmux session used for Docker build after completion.

  **Must NOT do**:
  - Do NOT run `prisma migrate` — no schema changes, only seed data
  - Do NOT push the Docker image anywhere — local only
  - Do NOT skip the test run — it's the primary regression check

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running 3 standard commands sequentially — no creative decisions needed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 6, F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - AGENTS.md "Commands" section — `pnpm test -- --run`, `pnpm build`
  - AGENTS.md "Infrastructure" section — `docker build -t ai-employee-worker:latest .`
  - AGENTS.md "Long-Running Commands" and "Tmux Session Cleanup" — use tmux for Docker build, kill session after

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DB reseeded successfully
    Tool: Bash (curl against PostgREST)
    Preconditions: Seed command completed
    Steps:
      1. Query the archetype instructions: curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions" -H "apikey: $SUPABASE_ANON_KEY"
      2. Verify the instructions contain "thread-ts" and "post-guest-approval"
    Expected Result: Archetype instructions include threading and tool requirements
    Failure Indicators: Old instructions without thread-ts mention
    Evidence: .sisyphus/evidence/task-5-reseed-verify.txt

  Scenario: Docker image rebuilt
    Tool: Bash
    Preconditions: Docker build completed
    Steps:
      1. Run `docker images ai-employee-worker:latest --format '{{.CreatedAt}}'`
      2. Verify timestamp is within the last 10 minutes
    Expected Result: Image was built recently
    Failure Indicators: Old timestamp
    Evidence: .sisyphus/evidence/task-5-docker-rebuild.txt

  Scenario: Tests pass with no new failures
    Tool: Bash
    Preconditions: All Wave 1 tasks applied
    Steps:
      1. Run `pnpm test -- --run 2>&1 | tail -20`
      2. Verify test count is 515+ passing
      3. Verify no new FAIL lines beyond container-boot.test.ts and inngest-serve.test.ts
      4. Run `pnpm build` and verify clean exit
    Expected Result: 515+ passing, 0 new failures, clean build
    Failure Indicators: New FAIL lines, build errors, type errors
    Evidence: .sisyphus/evidence/task-5-test-results.txt
  ```

  **Commit**: YES
  - Message: `fix(guest-messaging): stop ghost workers, protect delivery, fix formatting and card threading`
  - Files: All files from Tasks 1-4
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Notify Completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "📋 guest-messaging-bugfixes complete — All 5 bugs fixed. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 5)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run tsx scripts/telegram-notify.ts with the completion message
      2. Verify exit code 0
    Expected Result: Notification sent successfully
    Evidence: .sisyphus/evidence/task-6-telegram.txt
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

| Commit | Scope             | Files                                                                                                                                      | Pre-commit check     |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1      | Tasks 1-4 grouped | employee-lifecycle.ts, hostfully.ts, slack-blocks.ts, post-guest-approval.ts, opencode-harness.mts, tool-usage-reference SKILL.md, seed.ts | `pnpm test -- --run` |

Message: `fix(guest-messaging): stop ghost workers, protect delivery, fix formatting and card threading`

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run  # Expected: 515+ passing, 0 new failures
pnpm build          # Expected: clean build, no type errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image rebuilt
- [ ] DB reseeded
