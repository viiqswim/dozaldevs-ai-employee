# Guest Messaging Card Fix — Configurable Title + Tool Registry + Cron Disable

## TL;DR

> **Quick Summary**: Fix confusing Slack approval cards where guest-messaging errors display "Daily Summary" title with "Approve & Post" buttons by making the `post-message.ts` title configurable via `--title`, adding `post-guest-approval.ts` to the guest-messaging tool registry, and disabling the broken cron poller.
>
> **Deliverables**:
>
> - `post-message.ts` with `--title` flag (falls back to generic "Task Review — {date}")
> - Guest-messaging archetype `tool_registry` includes `post-guest-approval.ts`
> - Summarizer instructions explicitly pass `--title "Daily Summary"`
> - Guest-messaging error path passes `--title "Guest Message Error"`
> - `guestMessagePollTrigger` commented out from Inngest serve registration
> - Stuck task `86b0e86c` marked Done
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (title flag) → T4 (re-seed) → T5 (mark stuck task) → T6 (Docker rebuild) → T7 (tests) → F1-F4

---

## Context

### Original Request

User observed a guest-messaging task error displaying a Slack card with "Daily Summary" title and "Approve & Post" / "Reject" buttons — summarizer-specific UI that makes no sense for guest messaging. Investigation revealed 3 compounding bugs causing this.

### Interview Summary

**Key Discussions**:

- **Cron trigger**: User decided to fully disable (comment out registration, keep file) — adds no value and creates broken tasks
- **Title approach**: User wants `--title` flag so the model controls the card title; Papi Chulo passes `--title "Daily Summary"` explicitly; fallback is generic `"Task Review — {date}"`
- **Error path**: User confirmed adding `--title "Guest Message Error"` to the guest-messaging STEP 6 error path
- **Stuck task**: User confirmed marking task `86b0e86c` as Done
- **Tool registry**: `post-guest-approval.ts` must be added to the guest-messaging archetype's tool list

**Research Findings**:

- `read-channels.ts` line 54: `isSummaryPost()` filters by `block_id === 'papi-chulo-daily-summary'` — this `block_id` MUST NOT change
- 2 summarizer instruction strings (lines 254, 266) use `post-message.ts --task-id` — need `--title "Daily Summary"` added
- 1 guest-messaging error path (line 346) uses `post-message.ts --task-id` — needs `--title "Guest Message Error"`
- Delivery instructions (lines ~3200, ~3218, ~3244, ~3263) do NOT use `--task-id` — unaffected
- Docker rebuild IS required for `post-message.ts` changes to reach running workers
- `seed-guest-messaging.test.ts` uses `toContain` — adding new tools won't break it

### Metis Review

**Identified Gaps** (addressed):

- **block_id dependency**: `read-channels.ts:54` filters by `papi-chulo-daily-summary` — plan explicitly preserves this value, only display text changes
- **4 instruction strings**: 2 summarizer + 1 guest-messaging error + 1 delivery instruction — delivery instruction doesn't use `--task-id` so unaffected
- **Docker rebuild**: Required after `post-message.ts` changes — included as explicit task
- **inngest-serve.test.ts**: Pre-existing failure (expects 2 functions, gets 10) — commenting out poll function doesn't change failure mode; test is already broken

---

## Work Objectives

### Core Objective

Make Slack approval card titles configurable via `--title` flag on `post-message.ts`, add the correct guest-messaging approval tool to its registry, and disable the broken cron poller.

### Concrete Deliverables

- Modified `src/worker-tools/slack/post-message.ts` with `--title` flag
- Updated `prisma/seed.ts` with tool registry fix + instruction updates
- Commented-out cron registration in `src/gateway/inngest/serve.ts`
- Re-seeded database
- Task `86b0e86c` marked Done
- Rebuilt Docker image

### Definition of Done

- [ ] `post-message.ts --help` shows `--title` flag
- [ ] `post-message.ts --task-id X --title "Custom"` produces header with "Custom"
- [ ] `post-message.ts --task-id X` (no title) produces header with "Task Review — {date}"
- [ ] `block_id` remains `papi-chulo-daily-summary` in all cases
- [ ] Guest-messaging archetype `tool_registry` includes `post-guest-approval.ts`
- [ ] Summarizer instructions contain `--title "Daily Summary"`
- [ ] Guest-messaging STEP 6 contains `--title "Guest Message Error"`
- [ ] `guestMessagePollTrigger` is commented out in serve.ts
- [ ] Task `86b0e86c` status is `Done`
- [ ] Docker image rebuilt with new `post-message.ts`
- [ ] `pnpm test -- --run` passes (excluding pre-existing failures)

### Must Have

- `--title` flag on `post-message.ts` with generic fallback
- `block_id: 'papi-chulo-daily-summary'` unchanged (preserves `read-channels.ts` filter)
- `post-guest-approval.ts` in guest-messaging tool_registry (both `create` and `update` blocks)
- Summarizer instructions explicitly pass `--title "Daily Summary"`
- Guest-messaging error path passes `--title "Guest Message Error"`
- Cron registration commented out (not deleted)

### Must NOT Have (Guardrails)

- DO NOT change `block_id` value in `buildApprovalBlocks` — `read-channels.ts` depends on it
- DO NOT modify `read-channels.ts`
- DO NOT modify `createTaskAndDispatch` or `employee-lifecycle.ts`
- DO NOT modify `src/gateway/routes/hostfully.ts`
- DO NOT delete `guest-message-poll.ts` file — only comment out registration
- DO NOT modify delivery instructions in seed.ts (they don't use `--task-id`)
- DO NOT fix pre-existing test failures (`inngest-serve.test.ts`, `container-boot.test.ts`)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (Tests-after) — add tests for `--title` flag in `post-message.ts`
- **Framework**: Vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run the tool directly, assert output fields
- **Database**: Use Bash (psql) — query and verify seeded data
- **Build**: Use Bash — `pnpm test -- --run`, `pnpm build`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent changes):
├── Task 1: Add --title flag to post-message.ts [quick]
├── Task 2: Update seed.ts — tool registry + instruction strings [quick]
└── Task 3: Comment out guestMessagePollTrigger in serve.ts [quick]

Wave 2 (After Wave 1 — depends on seed + code changes):
├── Task 4: Re-seed database [quick]
├── Task 5: Mark stuck task 86b0e86c as Done [quick]
├── Task 6: Docker rebuild [quick]
└── Task 7: Tests — add --title test + run full suite [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| T1    | —          | T6, T7 | 1     |
| T2    | —          | T4, T7 | 1     |
| T3    | —          | T7     | 1     |
| T4    | T2         | T5     | 2     |
| T5    | T4         | F1-F4  | 2     |
| T6    | T1         | F1-F4  | 2     |
| T7    | T1,T2,T3   | F1-F4  | 2     |
| F1-F4 | T4-T7      | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **4 tasks** — T4 → `quick`, T5 → `quick`, T6 → `quick`, T7 → `unspecified-high`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `--title` flag to `post-message.ts`

  **What to do**:
  - Add `title?: string` to `parseArgs` return type and parse `--title` from argv
  - Update `--help` output to document the new flag
  - Modify `buildApprovalBlocks` signature to accept an optional `title` parameter
  - When `--title` is provided: use that value as the header text
  - When `--title` is NOT provided: use `"Task Review — ${date}"` as generic fallback
  - **CRITICAL**: Keep `block_id: 'papi-chulo-daily-summary'` UNCHANGED — only the display text in `text.text` changes
  - Update the call site in `main()` (line 118) to pass `title` to `buildApprovalBlocks`
  - Export `buildApprovalBlocks` so tests can import it

  **Must NOT do**:
  - DO NOT change `block_id` value — `read-channels.ts:54` depends on exact match `'papi-chulo-daily-summary'`
  - DO NOT change button text (`Approve & Post`, `Reject`) — those are separate from the title
  - DO NOT modify any other files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file modification with clear, mechanical changes to argument parsing and string values
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — simple single-file change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: T6 (Docker rebuild), T7 (tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-message.ts:9-49` — `parseArgs` function: add `--title` handling following the exact same pattern as `--task-id` and `--conversation-ref`
  - `src/worker-tools/slack/post-message.ts:52-88` — `buildApprovalBlocks` function: modify signature to accept `title?: string`, use it in the header block's `text.text` field (line 57), keep `block_id` on line 56 unchanged

  **Critical Dependency References**:
  - `src/worker-tools/slack/read-channels.ts:50-56` — `isSummaryPost()` filters by `block_id === 'papi-chulo-daily-summary'` — this is WHY `block_id` must not change

  **Acceptance Criteria**:
  - [ ] `parseArgs` accepts `--title` flag and returns it
  - [ ] `buildApprovalBlocks` accepts optional `title` parameter
  - [ ] With `--title "Custom"`: header text is `"Custom"`
  - [ ] Without `--title`: header text is `"Task Review — {date}"` (NOT "Daily Summary")
  - [ ] `block_id` is still `'papi-chulo-daily-summary'` in the output
  - [ ] `--help` output includes `--title` documentation
  - [ ] `buildApprovalBlocks` is exported

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Custom title via --title flag
    Tool: Bash
    Preconditions: post-message.ts has been modified
    Steps:
      1. Run: node -e "const m = require('./src/worker-tools/slack/post-message.js'); const blocks = m.buildApprovalBlocks('test body', 'task-123', 'Wed, May 7, 2026', 'My Custom Title'); console.log(JSON.stringify(blocks, null, 2))"
      2. Assert: blocks[0].text.text === "My Custom Title"
      3. Assert: blocks[0].block_id === "papi-chulo-daily-summary"
    Expected Result: Header shows custom title, block_id unchanged
    Failure Indicators: Header still shows "Daily Summary" or block_id changed
    Evidence: .sisyphus/evidence/task-1-custom-title.txt

  Scenario: Generic fallback when no title provided
    Tool: Bash
    Preconditions: post-message.ts has been modified
    Steps:
      1. Run: node -e "const m = require('./src/worker-tools/slack/post-message.js'); const blocks = m.buildApprovalBlocks('test body', 'task-123', 'Wed, May 7, 2026'); console.log(JSON.stringify(blocks, null, 2))"
      2. Assert: blocks[0].text.text starts with "Task Review —"
      3. Assert: blocks[0].block_id === "papi-chulo-daily-summary"
    Expected Result: Header shows "Task Review — Wed, May 7, 2026", block_id unchanged
    Failure Indicators: Header shows "Daily Summary" or any hardcoded employee-specific text
    Evidence: .sisyphus/evidence/task-1-generic-fallback.txt

  Scenario: Help output includes --title
    Tool: Bash
    Preconditions: post-message.ts has been modified
    Steps:
      1. Run: SLACK_BOT_TOKEN=fake tsx src/worker-tools/slack/post-message.ts --help 2>&1 || true
      2. Assert: output contains "--title"
    Expected Result: Help text documents the --title flag
    Failure Indicators: --title not mentioned in help output
    Evidence: .sisyphus/evidence/task-1-help-output.txt
  ```

  **Commit**: YES
  - Message: `feat(slack): add --title flag to post-message.ts for configurable approval card titles`
  - Files: `src/worker-tools/slack/post-message.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Update `seed.ts` — tool registry + instruction strings

  **What to do**:
  - **Part A — Tool registry**: Add `'/tools/slack/post-guest-approval.ts'` to the guest-messaging archetype's `tool_registry.tools` array in BOTH the `create` block (line ~3284) AND the `update` block (line ~3314)
  - **Part B — Summarizer instructions**: Add `--title "Daily Summary"` to the `post-message.ts` command in:
    - `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` (line 254): change `--task-id <TASK_ID from end of prompt>` to `--title "Daily Summary" --task-id <TASK_ID from end of prompt>`
    - `VLRE_SUMMARIZER_INSTRUCTIONS` (line 266): same change
  - **Part C — Guest-messaging error path**: Add `--title "Guest Message Error"` to the `post-message.ts` command in STEP 6 (line 346): change `--text "Error processing guest message:` to include `--title "Guest Message Error"` before `--text`

  **Must NOT do**:
  - DO NOT modify delivery instructions (they don't use `--task-id` so no approval blocks are generated)
  - DO NOT change any other archetype fields
  - DO NOT modify summarizer tool_registry entries (lines 3193, 3211, 3238, 3256)
  - DO NOT change the guest-messaging system prompt or main instructions (only STEP 6 error path)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical string edits in a single file — add one tool path, insert `--title` flags into 3 instruction strings
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — single file, clear edits

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: T4 (re-seed), T7 (tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3283-3295` — Guest-messaging `create` block `tool_registry`: add `'/tools/slack/post-guest-approval.ts'` to the tools array alongside existing entries
  - `prisma/seed.ts:3313-3325` — Guest-messaging `update` block `tool_registry`: same addition (MUST mirror create block exactly)

  **Instruction String References**:
  - `prisma/seed.ts:254` — DozalDevs summarizer instruction: the `post-message.ts` command — insert `--title "Daily Summary"` before `--text`
  - `prisma/seed.ts:266` — VLRE summarizer instruction: same pattern as line 254
  - `prisma/seed.ts:346` — Guest-messaging STEP 6 error path: insert `--title "Guest Message Error"` before `--text`

  **Test References**:
  - `tests/gateway/seed-guest-messaging.test.ts:127-132` — uses `toContain` assertions on tool_registry — additive changes are safe
  - `tests/gateway/seed-property-kb.test.ts:56-63` — similar `toContain` pattern — unaffected

  **Acceptance Criteria**:
  - [ ] Guest-messaging `tool_registry` (create block) includes `'/tools/slack/post-guest-approval.ts'`
  - [ ] Guest-messaging `tool_registry` (update block) includes `'/tools/slack/post-guest-approval.ts'`
  - [ ] DozalDevs summarizer instructions contain `--title "Daily Summary"`
  - [ ] VLRE summarizer instructions contain `--title "Daily Summary"`
  - [ ] Guest-messaging STEP 6 contains `--title "Guest Message Error"`
  - [ ] Delivery instructions are unchanged

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Tool registry includes post-guest-approval.ts
    Tool: Bash (grep)
    Preconditions: seed.ts has been modified
    Steps:
      1. Run: grep -c "post-guest-approval.ts" prisma/seed.ts
      2. Assert: count >= 2 (one in create, one in update block)
    Expected Result: post-guest-approval.ts appears in both tool_registry blocks
    Failure Indicators: count is 0 or 1
    Evidence: .sisyphus/evidence/task-2-tool-registry-grep.txt

  Scenario: Summarizer instructions have --title "Daily Summary"
    Tool: Bash (grep)
    Preconditions: seed.ts has been modified
    Steps:
      1. Run: grep -n 'title "Daily Summary"' prisma/seed.ts
      2. Assert: matches on 2 lines (around 254 and 266)
    Expected Result: Both summarizer instruction strings include --title "Daily Summary"
    Failure Indicators: fewer than 2 matches or wrong lines
    Evidence: .sisyphus/evidence/task-2-summarizer-title-grep.txt

  Scenario: Error path has --title "Guest Message Error"
    Tool: Bash (grep)
    Preconditions: seed.ts has been modified
    Steps:
      1. Run: grep -n 'title "Guest Message Error"' prisma/seed.ts
      2. Assert: at least 1 match (around line 346)
    Expected Result: STEP 6 error path includes --title "Guest Message Error"
    Failure Indicators: no matches
    Evidence: .sisyphus/evidence/task-2-error-title-grep.txt

  Scenario: Delivery instructions are NOT modified
    Tool: Bash (grep)
    Preconditions: seed.ts has been modified
    Steps:
      1. Run: grep -n 'delivery_instructions' prisma/seed.ts | head -20
      2. Assert: no delivery instruction lines contain "--title"
    Expected Result: Delivery instructions are unchanged — no --title flag
    Failure Indicators: any delivery_instructions line contains --title
    Evidence: .sisyphus/evidence/task-2-delivery-unchanged.txt
  ```

  **Commit**: YES
  - Message: `fix(seed): add post-guest-approval to guest-messaging tool registry and explicit --title flags`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Comment out `guestMessagePollTrigger` in `serve.ts`

  **What to do**:
  - Comment out the import of `createGuestMessagePollTrigger` (line 14)
  - Comment out the instantiation `const guestMessagePollFn = createGuestMessagePollTrigger(inngest)` (line 38)
  - Comment out `guestMessagePollFn` from the `functions` array (line 52)
  - Add a brief comment explaining why: `// Disabled: cron-triggered tasks have incomplete raw_event data, causing broken approval cards`
  - Keep the file `src/inngest/triggers/guest-message-poll.ts` intact — do NOT delete it

  **Must NOT do**:
  - DO NOT delete the `guest-message-poll.ts` file
  - DO NOT modify any other function registrations
  - DO NOT remove the import of other triggers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 lines to comment out in a single file — trivial mechanical change
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: T7 (tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts:14` — import line: `import { createGuestMessagePollTrigger } from '../../inngest/triggers/guest-message-poll.js';`
  - `src/gateway/inngest/serve.ts:38` — instantiation: `const guestMessagePollFn = createGuestMessagePollTrigger(inngest);`
  - `src/gateway/inngest/serve.ts:52` — registration in functions array: `guestMessagePollFn,`

  **Acceptance Criteria**:
  - [ ] Line 14 import is commented out
  - [ ] Line 38 instantiation is commented out
  - [ ] Line 52 registration is commented out
  - [ ] Explanatory comment is present
  - [ ] File `src/inngest/triggers/guest-message-poll.ts` still exists
  - [ ] All other Inngest functions still register correctly

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: guestMessagePollFn is commented out
    Tool: Bash (grep)
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: grep -n 'guestMessagePoll' src/gateway/inngest/serve.ts
      2. Assert: all matches are inside comments (prefixed with //)
    Expected Result: No active (uncommented) references to guestMessagePoll
    Failure Indicators: any line without // prefix references guestMessagePoll
    Evidence: .sisyphus/evidence/task-3-cron-disabled.txt

  Scenario: Other functions still registered
    Tool: Bash (grep)
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: grep -c '^\s\+[a-z].*Fn,' src/gateway/inngest/serve.ts
      2. Assert: count is 9 (was 10, minus 1 for commented-out guestMessagePollFn)
    Expected Result: 9 functions remain registered
    Failure Indicators: count is not 9
    Evidence: .sisyphus/evidence/task-3-function-count.txt

  Scenario: guest-message-poll.ts file still exists
    Tool: Bash (ls)
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: ls -la src/inngest/triggers/guest-message-poll.ts
      2. Assert: file exists
    Expected Result: File is present, not deleted
    Failure Indicators: "No such file or directory"
    Evidence: .sisyphus/evidence/task-3-file-exists.txt
  ```

  **Commit**: YES
  - Message: `chore(inngest): disable guest-message-poll cron trigger`
  - Files: `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Re-seed database

  **What to do**:
  - Run `pnpm prisma db seed` to apply the seed.ts changes (tool registry + instruction updates) to the local database
  - Verify the seeded data by querying the database

  **Must NOT do**:
  - DO NOT run `prisma migrate reset` — only re-seed
  - DO NOT modify any files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution + verification query
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: T5 (stuck task uses DB)
  - **Blocked By**: T2 (seed.ts changes must be committed first)

  **References**:
  - `prisma/seed.ts` — the seed script that was just modified in T2
  - DB connection: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee`

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` exits with code 0
  - [ ] Guest-messaging archetype tool_registry includes `post-guest-approval.ts`
  - [ ] Summarizer instructions contain `--title "Daily Summary"`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Guest-messaging tool_registry includes post-guest-approval.ts after seed
    Tool: Bash (psql)
    Preconditions: pnpm prisma db seed has been run
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT tool_registry::text FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'::uuid"
      2. Assert: output contains "post-guest-approval.ts"
    Expected Result: post-guest-approval.ts is in the tool_registry JSON
    Failure Indicators: tool not found in output
    Evidence: .sisyphus/evidence/task-4-tool-registry-db.txt

  Scenario: Summarizer instructions contain --title "Daily Summary" after seed
    Tool: Bash (psql)
    Preconditions: pnpm prisma db seed has been run
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT instructions FROM archetypes WHERE role_name = 'daily-summarizer'" | grep -c 'title'
      2. Assert: count >= 1 (at least one match per summarizer archetype)
    Expected Result: Instructions contain --title flag
    Failure Indicators: count is 0
    Evidence: .sisyphus/evidence/task-4-summarizer-instructions-db.txt
  ```

  **Commit**: NO (database state change, no code)

- [x] 5. Mark stuck task `86b0e86c` as Done

  **What to do**:
  - Run SQL to update task `86b0e86c-b6cc-4f97-805a-fce0d7d2086a` status to `Done`
  - Command: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE tasks SET status = 'Done', updated_at = NOW() WHERE id = '86b0e86c-b6cc-4f97-805a-fce0d7d2086a'::uuid AND status = 'Reviewing';"`
  - Verify the update

  **Must NOT do**:
  - DO NOT delete the task row
  - DO NOT modify any other tasks

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL command
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T4 (re-seed should complete first to avoid race conditions)

  **References**:
  - Task ID: `86b0e86c-b6cc-4f97-805a-fce0d7d2086a`
  - Current status: `Reviewing` (stuck — cron-triggered, error in deliverable)
  - DB connection: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee`

  **Acceptance Criteria**:
  - [ ] Task status is `Done`
  - [ ] `updated_at` is recent (within last few minutes)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Task 86b0e86c is marked Done
    Tool: Bash (psql)
    Preconditions: UPDATE has been run
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT status, updated_at FROM tasks WHERE id = '86b0e86c-b6cc-4f97-805a-fce0d7d2086a'::uuid"
      2. Assert: status = "Done"
      3. Assert: updated_at is recent
    Expected Result: Task shows status Done with recent timestamp
    Failure Indicators: status is still Reviewing, or task not found
    Evidence: .sisyphus/evidence/task-5-stuck-task-done.txt
  ```

  **Commit**: NO (database state change, no code)

- [x] 6. Docker rebuild

  **What to do**:
  - Rebuild the Docker image so the updated `post-message.ts` (with `--title` flag) is available inside worker containers
  - Command: `docker build -t ai-employee-worker:latest .`
  - Verify the build succeeds

  **Must NOT do**:
  - DO NOT modify the Dockerfile
  - DO NOT push the image to any registry

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single Docker build command
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T5, T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: T1 (post-message.ts changes must be committed first)

  **References**:
  - `Dockerfile` — builds the worker image with all shell tools baked in
  - `src/worker-tools/slack/post-message.ts` — the file that was modified in T1

  **Acceptance Criteria**:
  - [ ] `docker build` exits with code 0
  - [ ] Image `ai-employee-worker:latest` exists

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker image builds successfully
    Tool: Bash (tmux — long-running)
    Preconditions: T1 changes committed
    Steps:
      1. Run in tmux: docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/docker-build-card-fix.log; echo "EXIT_CODE:$?" >> /tmp/docker-build-card-fix.log
      2. Poll: grep "EXIT_CODE:" /tmp/docker-build-card-fix.log
      3. Assert: EXIT_CODE:0
    Expected Result: Docker build completes successfully
    Failure Indicators: non-zero exit code, build errors in log
    Evidence: .sisyphus/evidence/task-6-docker-build.txt

  Scenario: Built image contains updated post-message.ts
    Tool: Bash
    Preconditions: Docker build completed
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest cat /tools/slack/post-message.ts | grep -c 'title'
      2. Assert: count >= 2 (parseArgs title handling + buildApprovalBlocks parameter)
    Expected Result: The --title flag code is present in the baked-in file
    Failure Indicators: count is 0 (old version without --title)
    Evidence: .sisyphus/evidence/task-6-image-verify.txt
  ```

  **Commit**: NO (infrastructure operation, no code)

- [x] 7. Tests — add `--title` test + run full suite

  **What to do**:
  - Add test cases to `tests/worker-tools/slack/post-message.test.ts` for the `--title` flag:
    - Test: `buildApprovalBlocks` with custom title produces correct header text
    - Test: `buildApprovalBlocks` without title falls back to generic "Task Review — {date}"
    - Test: `block_id` remains `'papi-chulo-daily-summary'` regardless of title
    - Test: `parseArgs` correctly parses `--title` flag
  - Run the full test suite: `pnpm test -- --run`
  - Verify all tests pass (excluding pre-existing failures in `inngest-serve.test.ts` and `container-boot.test.ts`)

  **Must NOT do**:
  - DO NOT fix pre-existing test failures
  - DO NOT modify any source files (only test files)
  - DO NOT add tests for `post-guest-approval.ts` (it already has its own test file)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs to write meaningful test cases and run the full suite, interpreting results
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO — must run after T1, T2, T3
  - **Parallel Group**: Wave 2 (can parallel with T4, T5, T6 but depends on code changes from T1-T3)
  - **Blocks**: F1-F4
  - **Blocked By**: T1 (post-message.ts changes), T2 (seed.ts changes), T3 (serve.ts changes)

  **References**:

  **Pattern References**:
  - `tests/worker-tools/slack/post-message.test.ts` — existing test file (if it exists); follow existing test patterns
  - `tests/worker-tools/slack/post-guest-approval.test.ts` — reference for test structure and mocking patterns for Slack tools

  **API References**:
  - `src/worker-tools/slack/post-message.ts:buildApprovalBlocks` — the exported function to test (after T1 changes)

  **Acceptance Criteria**:
  - [ ] Test file includes tests for custom title, generic fallback, and block_id preservation
  - [ ] `pnpm test -- --run` passes (515+ tests, excluding pre-existing failures)
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm lint` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: New title tests pass
    Tool: Bash
    Preconditions: Test file has been created/modified, T1 changes in place
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/slack/post-message.test.ts 2>&1
      2. Assert: all tests pass (0 failures)
    Expected Result: All post-message tests pass including new --title tests
    Failure Indicators: any test failure
    Evidence: .sisyphus/evidence/task-7-title-tests.txt

  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All code changes from T1-T3 in place
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert: 515+ tests pass
      3. Note: inngest-serve.test.ts and container-boot.test.ts failures are pre-existing — ignore
    Expected Result: All tests pass except pre-existing failures
    Failure Indicators: new test failures introduced by our changes
    Evidence: .sisyphus/evidence/task-7-full-suite.txt

  Scenario: Build and lint pass
    Tool: Bash
    Preconditions: All code changes in place
    Steps:
      1. Run: pnpm build 2>&1
      2. Assert: exit code 0
      3. Run: pnpm lint 2>&1
      4. Assert: exit code 0
    Expected Result: No build or lint errors
    Failure Indicators: non-zero exit codes
    Evidence: .sisyphus/evidence/task-7-build-lint.txt
  ```

  **Commit**: YES
  - Message: `test(slack): add post-message --title flag tests`
  - Files: `tests/worker-tools/slack/post-message.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, query DB, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code (except intentional cron disable), unused imports. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Verify: (a) `post-message.ts --title "Custom" --task-id test` produces correct header, (b) DB query shows `post-guest-approval.ts` in tool_registry, (c) DB query shows `--title "Daily Summary"` in summarizer instructions, (d) `guestMessagePollTrigger` is commented out in serve.ts, (e) task `86b0e86c` is Done. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: `block_id` unchanged, `read-channels.ts` unmodified, `hostfully.ts` unmodified, `employee-lifecycle.ts` unmodified. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                          | Files                                           | Pre-commit           |
| ------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------------- |
| 1      | `feat(slack): add --title flag to post-message.ts for configurable approval card titles`         | `src/worker-tools/slack/post-message.ts`        | `pnpm build`         |
| 2      | `fix(seed): add post-guest-approval to guest-messaging tool registry and explicit --title flags` | `prisma/seed.ts`                                | `pnpm build`         |
| 3      | `chore(inngest): disable guest-message-poll cron trigger`                                        | `src/gateway/inngest/serve.ts`                  | `pnpm build`         |
| 4      | `test(slack): add post-message --title flag tests`                                               | `tests/worker-tools/slack/post-message.test.ts` | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Title flag works
node -e "const {buildApprovalBlocks} = require('./src/worker-tools/slack/post-message.js'); console.log(JSON.stringify(buildApprovalBlocks('test', 'id', 'Mon', 'Custom Title')))"
# Expected: header text = "Custom Title"

# block_id unchanged
grep -n 'papi-chulo-daily-summary' src/worker-tools/slack/post-message.ts
# Expected: still present in buildApprovalBlocks

# Tool registry updated
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT tool_registry FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'::uuid"
# Expected: includes post-guest-approval.ts

# Cron disabled
grep -n 'guestMessagePollFn' src/gateway/inngest/serve.ts
# Expected: commented out lines

# Stuck task resolved
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '86b0e86c-b6cc-4f97-805a-fce0d7d2086a'::uuid"
# Expected: Done

# Tests pass
pnpm test -- --run
# Expected: 515+ passing (excluding pre-existing failures)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image rebuilt
- [ ] Database re-seeded

---

## Notify Completion

- [x] **8. Notify completion** — Send Telegram notification: plan `guest-messaging-card-fix` complete, all tasks done, come back to review results.
  ```bash
  tsx scripts/telegram-notify.ts "✅ guest-messaging-card-fix complete — All tasks done. Come back to review results."
  ```
