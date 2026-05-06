# Fix Duplicate Slack Approval Cards for Guest-Messaging

## TL;DR

> **Quick Summary**: The OpenCode model executes TWO `post-guest-approval.ts` command blocks from the archetype instructions instead of choosing one, posting duplicate identical Slack cards. Fix with an idempotency guard in the tool (hard defense) and collapsed instruction blocks in seed.ts (soft defense).
>
> **Deliverables**:
>
> - `post-guest-approval.ts` with `/tmp/approval-message.json` idempotency guard
> - `prisma/seed.ts` with single collapsed command block for Step 5
> - New unit test for the idempotency path
> - DB reseeded + Docker image rebuilt
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 1 wave (2 parallel tasks) + verification
> **Critical Path**: T1 + T2 (parallel) → F1-F4

---

## Context

### Original Request

User observed two identical Slack approval cards (same proposed response, same task ID `10fed178-ec0b-4fca-8c58-56ec937c0784`) posted by Papi chulo for the same guest message from Beatrice.

### Investigation Summary

**Root Cause**: `prisma/seed.ts` Step 5 instructions (lines 339-374) contain TWO separate `post-guest-approval.ts` command blocks presented as if/else for the `--diagnosis` flag. The model executes BOTH sequentially instead of choosing one. Each call independently invokes `client.chat.postMessage()` — Slack has no deduplication.

**Key Findings**:

- The approval card is posted ONLY by `post-guest-approval.ts` (called by the OpenCode model)
- The harness (`opencode-harness.mts`) reads `/tmp/approval-message.json` but never posts to Slack
- The lifecycle (`employee-lifecycle.ts`) only calls `updateMessage` on existing cards, never `postMessage` for new approval cards
- The webhook endpoint deduplicates on `external_id: hostfully-msg-{message_uid}` — so only one task exists
- No idempotency guard exists in `post-guest-approval.ts` — it always calls `chat.postMessage` unconditionally

### Metis Review

**Identified Gaps** (addressed):

- Guard must validate `ts` is a non-empty string, not just check field existence
- Guard must wrap `JSON.parse` in try/catch — treat parse failure as "not posted"
- Guard stdout contract must match `PostResult` shape (`{ ts, channel }`) exactly
- `conversationRef` double-append edge case flagged as follow-up (out of scope)
- Docker rebuild + DB reseed are mandatory post-change steps

---

## Work Objectives

### Core Objective

Prevent duplicate Slack approval cards from being posted for guest-messaging tasks by adding a deterministic idempotency guard (hard defense) and restructuring seed instructions (soft defense).

### Concrete Deliverables

- `src/worker-tools/slack/post-guest-approval.ts` — with idempotency guard at top of `main()`
- `tests/worker-tools/slack/post-guest-approval.test.ts` — with new idempotency test
- `prisma/seed.ts` — collapsed Step 5 command blocks into single block

### Definition of Done

- [ ] `pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts` passes (existing + new tests)
- [ ] `pnpm test -- --run` passes (515+ tests, no new failures)
- [ ] `pnpm build` passes clean
- [ ] Only ONE `post-guest-approval.ts` invocation exists in seed instructions (was 2)

### Must Have

- Idempotency guard that checks `/tmp/approval-message.json` before calling `chat.postMessage`
- Guard outputs existing `PostResult` JSON to stdout and exits 0 when file exists (no Slack API call)
- Guard validates `ts` is a non-empty string before treating file as valid
- Guard wraps `JSON.parse` in try/catch — parse failure = treat as not-posted, proceed normally
- Seed instructions collapsed from two command blocks to one with inline conditional for `--diagnosis`
- Explicit "Run this command EXACTLY ONCE" language in instructions
- Unit test for the idempotency guard path
- stderr warning when guard fires (for observability in container logs)

### Must NOT Have (Guardrails)

- Do NOT modify `buildGuestApprovalBlocks` — it is correct and well-tested
- Do NOT change the `--dry-run` behavior or its stdout shape
- Do NOT modify `opencode-harness.mts` or `employee-lifecycle.ts` (shared files)
- Do NOT add idempotency to other shell tools — scope is `post-guest-approval.ts` only
- Do NOT fix the `conversationRef` double-append edge case in this plan — it is a known follow-up
- Do NOT add a new CLI flag for idempotency — the guard must be internal/automatic
- Do NOT restructure Step 3, 3.5, 4, or 6 instructions in seed.ts — only Step 5

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (Tests-after — add idempotency test)
- **Framework**: Vitest

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run tool with pre-existing file, verify stdout and no Slack call
- **Seed data**: Use Bash — query DB for instruction content after reseed

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both tasks are independent):
├── Task 1: Add idempotency guard to post-guest-approval.ts + test [quick]
└── Task 2: Collapse seed instruction blocks in prisma/seed.ts [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | F1-F4  | 1    |
| T2   | —          | F1-F4  | 1    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick` (parallel)
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add idempotency guard to `post-guest-approval.ts` + unit test

  **What to do**:
  - In `src/worker-tools/slack/post-guest-approval.ts`, add an idempotency check at the **top of `main()`**, before argument parsing. The guard:
    1. Checks if `/tmp/approval-message.json` exists using `fs.existsSync`
    2. If exists: reads the file, parses JSON (wrapped in try/catch)
    3. If parse succeeds AND `ts` is a non-empty string: write the existing JSON to stdout, write a warning to stderr (`"Idempotency guard: /tmp/approval-message.json already exists with ts=<ts> — skipping Slack post\n"`), exit 0
    4. If parse fails OR `ts` is missing/empty: proceed normally (treat as not-posted)
    5. If file doesn't exist: proceed normally (current behavior)
  - The guard goes BEFORE `parseArgs` and BEFORE the `--dry-run` check — but AFTER imports
  - Import `existsSync` and `readFileSync` from `node:fs` at the top of the file
  - Add one unit test in `tests/worker-tools/slack/post-guest-approval.test.ts`:
    - Test name: `'skips Slack post when /tmp/approval-message.json already exists'`
    - Mock `fs.existsSync` to return `true` for `/tmp/approval-message.json`
    - Mock `fs.readFileSync` to return `'{"ts":"1234567890.123456","channel":"C0960S2Q8RL"}'`
    - Verify: `chat.postMessage` is NOT called, stdout contains the existing JSON

  **Must NOT do**:
  - Do NOT modify `buildGuestApprovalBlocks`
  - Do NOT change `--dry-run` behavior
  - Do NOT add a CLI flag for the guard — it is fully internal
  - Do NOT modify the `PostResult` interface or output shape

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, surgical change — ~15 lines of guard code + ~20 lines of test
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts:252-311` — current `main()` function. The guard goes at the very top, before line 253 (`const params = parseArgs(...)`)
  - `src/worker-tools/slack/post-guest-approval.ts:298` — the `client.chat.postMessage` call that the guard prevents on second invocation
  - `src/worker-tools/slack/post-guest-approval.ts:309` — the `PostResult` stdout output shape (`{ ts, channel }`) that the guard must match

  **Test References**:
  - `tests/worker-tools/slack/post-guest-approval.test.ts:1-47` — existing test setup pattern: `vi.hoisted` for process.argv, `vi.mock` for `@slack/web-api`, imported `buildGuestApprovalBlocks`
  - `tests/worker-tools/slack/post-guest-approval.test.ts:49-110` — `baseParams` and existing test patterns

  **WHY Each Reference Matters**:
  - The guard must be placed at the exact right location in `main()` — before `parseArgs` but after imports
  - The guard's stdout must exactly match the existing `PostResult` shape so the harness reads it correctly
  - The new test must follow existing vitest patterns (vi.mock, vi.hoisted)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Idempotency guard skips Slack post when file already exists
    Tool: Bash
    Preconditions: /tmp/approval-message.json does NOT exist
    Steps:
      1. Write test file: echo '{"ts":"1234567890.123456","channel":"C0960S2Q8RL"}' > /tmp/approval-message.json
      2. Run: SLACK_BOT_TOKEN=xoxb-fake tsx src/worker-tools/slack/post-guest-approval.ts --channel C0960S2Q8RL --task-id test-001 --guest-name "Test" --property-name "Test Prop" --check-in 2026-01-01 --check-out 2026-01-05 --booking-channel AIRBNB --original-message "Hello" --draft-response "Hi" --confidence 0.9 --category test --lead-uid lead1 --thread-uid thread1 --message-uid msg1 2>/tmp/guard-stderr.txt
      3. Capture stdout
      4. Check stdout contains "ts":"1234567890.123456"
      5. Check stderr contains "Idempotency guard"
      6. Clean up: rm /tmp/approval-message.json /tmp/guard-stderr.txt
    Expected Result: stdout = existing JSON, stderr has guard warning, NO Slack API call made
    Failure Indicators: New Slack message posted, or stdout missing ts field, or non-zero exit
    Evidence: .sisyphus/evidence/task-1-idempotency-guard.txt

  Scenario: Normal path works when file does not exist (dry-run)
    Tool: Bash
    Preconditions: /tmp/approval-message.json does NOT exist
    Steps:
      1. Ensure /tmp/approval-message.json does not exist: rm -f /tmp/approval-message.json
      2. Run: tsx src/worker-tools/slack/post-guest-approval.ts --channel C0960S2Q8RL --task-id test-001 --guest-name "Test" --property-name "Test Prop" --check-in 2026-01-01 --check-out 2026-01-05 --booking-channel AIRBNB --original-message "Hello" --draft-response "Hi" --confidence 0.9 --category test --lead-uid lead1 --thread-uid thread1 --message-uid msg1 --dry-run
      3. Check exit code is 0
      4. Check stdout contains "blocks"
    Expected Result: exits 0, stdout contains blocks JSON (dry-run behavior unchanged)
    Failure Indicators: Guard fires incorrectly, or dry-run output changes
    Evidence: .sisyphus/evidence/task-1-normal-path.txt

  Scenario: Guard handles malformed JSON gracefully
    Tool: Bash
    Preconditions: none
    Steps:
      1. Write malformed file: echo 'not-json' > /tmp/approval-message.json
      2. Run: tsx src/worker-tools/slack/post-guest-approval.ts --channel C0960S2Q8RL --task-id test-001 --guest-name "Test" --property-name "Test Prop" --check-in 2026-01-01 --check-out 2026-01-05 --booking-channel AIRBNB --original-message "Hello" --draft-response "Hi" --confidence 0.9 --category test --lead-uid lead1 --thread-uid thread1 --message-uid msg1 --dry-run
      3. Check exit code is 0
      4. Check stdout contains "blocks" (proceeded normally past guard)
      5. Clean up: rm /tmp/approval-message.json
    Expected Result: Guard treats malformed file as not-posted, proceeds to normal path
    Failure Indicators: Crash, non-zero exit, or guard fires incorrectly
    Evidence: .sisyphus/evidence/task-1-malformed-json.txt

  Scenario: Unit tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts
      2. Check exit code is 0
      3. Check output shows all tests passing including new idempotency test
    Expected Result: All tests pass (existing + new)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-1-unit-tests.txt
  ```

  **Commit**: YES
  - Message: `fix(worker-tools): add idempotency guard to prevent duplicate Slack approval cards`
  - Files: `src/worker-tools/slack/post-guest-approval.ts`, `tests/worker-tools/slack/post-guest-approval.test.ts`
  - Pre-commit: `pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts`

- [x] 2. Collapse seed instruction blocks for Step 5

  **What to do**:
  - In `prisma/seed.ts`, find the Step 5 instructions (lines 339-374) where two separate `post-guest-approval.ts` command blocks exist
  - Replace the two-block if/else pattern with a SINGLE command block and clear "EXACTLY ONCE" language:

    The new instruction text should read (conceptually):

    ```
    Post the rich approval card for PM review. Run this command EXACTLY ONCE — do NOT run it twice:
    NODE_NO_WARNINGS=1 tsx /tools/slack/post-guest-approval.ts \
      --channel "$NOTIFICATION_CHANNEL" \
      --task-id "$TASK_ID" \
      --guest-name "<guestName>" \
      --property-name "<propertyName>" \
      --check-in "<checkIn>" \
      --check-out "<checkOut>" \
      --booking-channel "<bookingChannel>" \
      --original-message "<originalMessage>" \
      --draft-response "<draftResponse>" \
      --confidence <confidence> \
      --category "<category>" \
      --lead-uid "<leadUid>" \
      --thread-uid "<threadUid>" \
      --message-uid "<messageUid>" \
      > /tmp/approval-message.json

    If Step 3.5 was run, add the --diagnosis flag before the > redirect:
      --diagnosis '<full diagnosis JSON from Step 3.5>'
    ```

  - Keep the `conversationRef` append instruction (line 375) unchanged
  - Keep the "CRITICAL: Both /tmp/summary.txt and /tmp/approval-message.json MUST exist" instruction (line 377) unchanged
  - After editing seed.ts, run `pnpm prisma db seed` to apply the changes to the database

  **Must NOT do**:
  - Do NOT restructure any other Steps (3, 3.5, 4, 6) in the instructions
  - Do NOT modify the VLRE common knowledge base or any other archetype's instructions
  - Do NOT change the `post-no-action-notification.ts` command block in Step 4
  - Do NOT modify the `conversationRef` append logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text replacement in a string literal — mechanical edit
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `prisma/seed.ts:339-374` — the TWO command blocks to collapse. Lines 340-357 are the "with --diagnosis" variant; lines 358-374 are the "without --diagnosis" variant
  - `prisma/seed.ts:375-376` — the `conversationRef` append logic that must stay UNCHANGED
  - `prisma/seed.ts:377` — the "CRITICAL: Both files MUST exist" instruction that must stay UNCHANGED

  **WHY Each Reference Matters**:
  - The exact lines to replace are 339-374 — everything between "Post the rich approval card" and the `conversationRef` append
  - The `conversationRef` and CRITICAL instructions after the command must not be touched

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed instructions contain exactly ONE post-guest-approval.ts invocation
    Tool: Bash
    Preconditions: prisma/seed.ts edited
    Steps:
      1. Run: grep -c "post-guest-approval.ts" prisma/seed.ts
      2. Check count is exactly 1 (was 2 before the fix)
    Expected Result: Count = 1
    Failure Indicators: Count is 0 (removed both) or 2+ (still duplicated)
    Evidence: .sisyphus/evidence/task-2-invocation-count.txt

  Scenario: Instructions contain "EXACTLY ONCE" language
    Tool: Bash
    Steps:
      1. Run: grep -i "EXACTLY ONCE" prisma/seed.ts
      2. Check output is non-empty
    Expected Result: At least one match
    Evidence: .sisyphus/evidence/task-2-exactly-once.txt

  Scenario: Instructions still mention --diagnosis as conditional
    Tool: Bash
    Steps:
      1. Run: grep "diagnosis" prisma/seed.ts | head -5
      2. Check output mentions --diagnosis flag in context of Step 3.5
    Expected Result: --diagnosis is still referenced as an optional conditional flag
    Failure Indicators: --diagnosis completely removed from instructions
    Evidence: .sisyphus/evidence/task-2-diagnosis-mention.txt

  Scenario: DB reseed succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm prisma db seed
      2. Check exit code is 0
    Expected Result: Seed completes without errors
    Evidence: .sisyphus/evidence/task-2-reseed.txt

  Scenario: Build passes after seed change
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Check exit code is 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES
  - Message: `fix(seed): collapse dual post-guest-approval command blocks to prevent model double-posting`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read modified files, check guard logic). For each "Must NOT Have": search codebase for forbidden patterns (modified harness, modified lifecycle, changed --dry-run behavior). Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review `post-guest-approval.ts` guard for: proper try/catch, no `as any`, stderr warning for observability, correct `PostResult` output shape. Check seed.ts for: single command block, "EXACTLY ONCE" language, `--diagnosis` still mentioned conditionally.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute every QA scenario from every task — follow exact steps. Test idempotency guard with pre-existing file, with malformed file, and with no file (normal path). Run grep to verify single invocation in seed. Run reseed.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no changes to `buildGuestApprovalBlocks`, no changes to harness/lifecycle, no `--dry-run` behavior change. Detect cross-task contamination.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

- [x] N. **Notify completion** — Send Telegram notification: plan `fix-duplicate-approval-cards` complete, all tasks done, come back to review results.

---

## Commit Strategy

| Group | Message                                                                                       | Files                                                                                                   | Pre-commit                                                                |
| ----- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| T1    | `fix(worker-tools): add idempotency guard to prevent duplicate Slack approval cards`          | `src/worker-tools/slack/post-guest-approval.ts`, `tests/worker-tools/slack/post-guest-approval.test.ts` | `pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts` |
| T2    | `fix(seed): collapse dual post-guest-approval command blocks to prevent model double-posting` | `prisma/seed.ts`                                                                                        | `pnpm build`                                                              |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts  # Expected: all pass
pnpm test -- --run                                                        # Expected: 515+ pass, 0 new failures
pnpm build                                                                # Expected: exit 0
grep -c "post-guest-approval.ts" prisma/seed.ts                          # Expected: 1 (was 2)
grep -i "EXACTLY ONCE" prisma/seed.ts                                    # Expected: match found
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Single command block in seed instructions
- [ ] Idempotency guard handles: existing valid file, malformed file, missing file

### Known Follow-Up Issues (Out of Scope)

- **`conversationRef` double-append**: If the guard fires on a second invocation after the `node -e` append has already run, the re-output JSON includes `conversationRef`. The second `node -e` would append it again. Low risk — the field is just overwritten with the same value. Track separately.
- **Root cause validation**: The diagnosis is based on symptom analysis (identical duplicate cards). Confirm via OpenCode session logs when available — look for two `post-guest-approval.ts` invocations in a single session.
