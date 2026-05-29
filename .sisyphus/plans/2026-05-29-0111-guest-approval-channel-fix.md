# Fix Guest Approval Card Channel Routing & Thread Orphan

## TL;DR

> **Quick Summary**: Fix two Slack bugs in the guest-messaging employee — approval card posting to wrong channel (LLM hallucinated `C0960S2Q8RL` instead of using `$NOTIFICATION_CHANNEL`) and orphaned "See thread for full details" text (no thread exists because the card was in the wrong channel). The fix refactors `post-guest-approval.ts` to: (1) use `$NOTIFICATION_CHANNEL` env var instead of `--channel` CLI flag, (2) default threading to `$NOTIFY_MSG_TS`, and (3) internally call `submit-output.ts` for contract file consistency.
>
> **Deliverables**:
>
> - Refactored `post-guest-approval.ts` — channel from env var, threading from env var, wraps `submit-output.ts`
> - Updated `tool-usage-reference/SKILL.md` — remove `C0960S2Q8RL` hallucination magnets, update `post-guest-approval.ts` documentation
> - Updated archetype `execution_steps` in live DB — remove step 8 (redundant `submit-output.ts` call since the tool now handles it)
> - Updated `archetype-generator.ts` — approval pattern docs mention channel comes from env var
> - Updated tests for `post-guest-approval.ts`
> - Full E2E verification: Airbnb message → webhook → lifecycle → approval card in correct channel → approve → delivery → Done
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → Task 6 → Task 7 → F1-F4

---

## Context

### Original Request

After the successful recreation of the guest-messaging AI employee via the wizard (plan `2026-05-28-2035-guest-messaging-recreation`), the full E2E test revealed two Slack bugs:

- **Issue 2**: Approval card posted to `C0960S2Q8RL` (#victor-tests) instead of `C0AMGJQN05S` (#cs-guest-communication). Root cause: the LLM hallucinated the channel ID from `tool-usage-reference/SKILL.md` examples because `post-guest-approval.ts` requires `--channel` and the `execution_steps` don't specify it.
- **Issue 3**: The Done-state notify message shows "See thread for full details" but no thread exists in the notify channel. Root cause: the context thread reply was posted to the approval card's channel (wrong one), not the notify channel.

### Interview Summary

**Key Discussions**:

- User decided NOT to eliminate `post-guest-approval.ts` but to refactor it as a composition: it wraps `submit-output.ts` internally
- `post-guest-approval.ts` should use `$NOTIFICATION_CHANNEL` env var (not CLI `--channel`) to eliminate hallucination
- Approval card should thread under the notify message using `$NOTIFY_MSG_TS`
- Archetype `execution_steps` should be updated to remove `--channel` and the now-redundant separate `submit-output.ts` call (step 8)
- Full E2E retest required: Airbnb → Hostfully webhook → lifecycle → approval → delivery → Done

**Research Findings**:

- The harness already has `tryAutoPostApprovalCard()` that correctly uses `NOTIFICATION_CHANNEL` env var — confirms the env var is available in the container
- `C0960S2Q8RL` appears in SKILL.md lines 63, 107, 114 — primary hallucination source
- Current execution_steps step 7 already includes `--thread-ts "$NOTIFY_MSG_TS"` but is missing many required flags (`--channel`, `--task-id`, `--guest-name`, etc.) — the LLM discovers them via `--help`
- Step 7 also has malformed flags: `--confidence high` should be a float, `--draft-response /tmp/draft.txt` should be text not a file path
- Step 8 calls `submit-output.ts` separately — if the tool wraps it internally, step 8 becomes redundant

### Metis Review

**Identified Gaps** (addressed):

- **Channel flag approach**: Metis recommended removing `--channel` entirely (not just defaulting it) to eliminate the hallucination vector. Adopted: `--channel` will be removed from the CLI, replaced by `$NOTIFICATION_CHANNEL` env var read internally.
- **Thread default**: `--thread-ts` should auto-read `$NOTIFY_MSG_TS` from env when not provided (matching `post-message.ts` behavior). Adopted.
- **Write order**: `/tmp/summary.txt` should be written BEFORE posting to Slack, so the contract file exists even if Slack fails. Adopted.
- **Idempotency guard interaction**: If idempotency guard fires (skips Slack), the tool should still ensure `/tmp/summary.txt` exists. Adopted.
- **DB vs seed**: Live DB archetype must be updated via targeted SQL, not just seed. Adopted.
- **Docker rebuild**: Mandatory after tool changes. Included as explicit task.
- **`/tmp/approval-message.json` schema unchanged**: Lifecycle reads specific fields — no schema changes. Adopted as guardrail.

---

## Work Objectives

### Core Objective

Fix the guest-messaging approval card channel routing by refactoring `post-guest-approval.ts` to use `$NOTIFICATION_CHANNEL` env var (eliminating LLM channel hallucination) and default threading to `$NOTIFY_MSG_TS` (ensuring the approval card threads under the notify message, fixing the orphaned "See thread" text).

### Concrete Deliverables

- Modified `src/worker-tools/slack/post-guest-approval.ts` — env var channel, env var threading, wraps `submit-output.ts`
- Modified `src/workers/skills/tool-usage-reference/SKILL.md` — updated docs for both tools, replaced `C0960S2Q8RL` examples
- Modified archetype `execution_steps` in live DB (archetype ID `94b1e64c-2c2a-4391-a6e3-f3ef61044cb5`)
- Modified `src/gateway/services/archetype-generator.ts` — approval pattern note about env var channel
- Modified/added tests for the refactored tool
- Rebuilt Docker image with the fixes

### Definition of Done

- [ ] Approval card posts to `C0AMGJQN05S` (#cs-guest-communication) — verified via `deliverables.metadata->>'target_channel'`
- [ ] Approval card threads under the notify message — verified via Slack API `conversations.replies`
- [ ] Done-state notify message "See thread for full details" points to a real thread
- [ ] `grep -c "C0960S2Q8RL" src/workers/skills/tool-usage-reference/SKILL.md` returns `0`
- [ ] `post-guest-approval.ts --help` does NOT list `--channel` as a flag
- [ ] Full E2E task reaches Done state with correct Slack behavior

### Must Have

- Channel sourced from `$NOTIFICATION_CHANNEL` env var (not CLI flag)
- Threading defaults to `$NOTIFY_MSG_TS` env var
- `post-guest-approval.ts` writes `/tmp/summary.txt` via internal `submit-output.ts` call
- Rich guest-specific Block Kit card preserved (header, guest fields, original message, draft response, buttons)
- `/tmp/approval-message.json` schema unchanged
- Idempotency guard preserved
- Full E2E retest passing

### Must NOT Have (Guardrails)

- **DO NOT modify `src/inngest/employee-lifecycle.ts`** — `threadHint: true` is correct behavior; Issue 3 resolves when Issue 2 is fixed
- **DO NOT modify `src/workers/lib/approval-card-poster.mts`** — generic card builder, serves all employees
- **DO NOT modify `src/worker-tools/platform/submit-output.ts`** — call it, don't change it
- **DO NOT change `/tmp/approval-message.json` schema** — lifecycle reads specific fields
- **DO NOT touch `C0960S2Q8RL` occurrences outside SKILL.md** — test fixtures, seed data, other files are fine
- **DO NOT update archetype via wizard** — use targeted SQL UPDATE on live DB
- **DO NOT add `--channel` back to execution_steps** — channel is now from env var only
- **DO NOT create new tools** — composition within existing tools only

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests-after) — update existing `tests/worker-tools/slack/post-guest-approval.test.ts`
- **Framework**: vitest (via `pnpm test`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run tool with `--dry-run` and assert output
- **E2E lifecycle**: Use Bash (curl + psql) — trigger webhook, poll task status, verify DB
- **Slack verification**: Use Bash (curl Slack API) — verify channel, thread replies
- **Build verification**: Use Bash — `pnpm test -- --run`, `pnpm build`, `pnpm lint`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — parallel code changes):
├── Task 1: Refactor post-guest-approval.ts (channel, threading, submit-output wrapping) [deep]
├── Task 2: Update tool-usage-reference/SKILL.md (remove C0960S2Q8RL, update docs) [quick]
└── Task 3: Update archetype-generator.ts (approval pattern env var note) [quick]

Wave 2 (After Wave 1 — DB update, tests, Docker rebuild):
├── Task 4: Update live DB archetype execution_steps [quick]
├── Task 5: Update post-guest-approval tests [unspecified-high]
└── Task 6: Docker image rebuild [quick]

Wave 3 (After Wave 2 — E2E verification):
└── Task 7: Full E2E retest (Airbnb → webhook → lifecycle → approval → delivery → Done) [deep]

Wave FINAL (After Task 7 — 4 parallel reviews + user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
└── Task 8: Notify completion via Telegram [quick]
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 6 → Task 7 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task  | Depends On | Blocks  | Wave  |
| ----- | ---------- | ------- | ----- |
| 1     | —          | 4, 5, 6 | 1     |
| 2     | —          | 6       | 1     |
| 3     | —          | —       | 1     |
| 4     | 1          | 7       | 2     |
| 5     | 1          | 7       | 2     |
| 6     | 1, 2       | 7       | 2     |
| 7     | 4, 5, 6    | F1-F4   | 3     |
| F1-F4 | 7          | 8       | FINAL |
| 8     | F1-F4      | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `deep`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **3** — T4 → `quick`, T5 → `unspecified-high`, T6 → `quick`
- **Wave 3**: **1** — T7 → `deep`
- **FINAL**: **5** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`, T8 → `quick`

---

## TODOs

- [x] 1. Refactor `post-guest-approval.ts` — env var channel, env var threading, wrap `submit-output.ts`

  **What to do**:
  - Remove `--channel` from the CLI argument parser entirely (delete the `--channel` case in `parseArgs` and the `channel` field from the interface). The tool should read `process.env.NOTIFICATION_CHANNEL` directly and hard-fail with a clear error if it's missing: `"Error: NOTIFICATION_CHANNEL environment variable is required"`.
  - Make `--thread-ts` default to `process.env.NOTIFY_MSG_TS` when not provided (matching `post-message.ts` behavior at line 75-78). Keep `--thread-ts` as an optional override.
  - After the Slack post succeeds and `/tmp/approval-message.json` is written, call `submit-output.ts` as a subprocess to write `/tmp/summary.txt`. Use `execFileSync('tsx', ['/tools/platform/submit-output.ts', '--summary', <summary>, '--classification', 'NEEDS_APPROVAL', '--draft-file', '/tmp/draft.txt', '--metadata', JSON.stringify({...})])`. Pass guest_name, property_name, thread_uid, lead_uid, message_uid, property_uid in the metadata JSON.
  - **Write order**: Write `/tmp/summary.txt` BEFORE posting to Slack (call `submit-output.ts` subprocess first). This ensures the contract file exists even if the Slack post fails. The idempotency guard for `/tmp/approval-message.json` is separate and still checked first.
  - **Idempotency guard interaction**: When the idempotency guard fires (existing `/tmp/approval-message.json` with valid ts), the tool should STILL call `submit-output.ts` if `/tmp/summary.txt` doesn't exist — ensuring both contract files are present even on model retries.
  - Update `--help` output to reflect: no `--channel` flag, `--thread-ts` defaults to `$NOTIFY_MSG_TS`, note about automatic `submit-output.ts` integration.
  - Remove `--channel` from the `requiredStrings` validation array (line 333).
  - Replace `params.channel` with the env var value in `postMessageArgs.channel`.
  - **Preserve the `--dry-run` flag**: In dry-run mode, still call `submit-output.ts` (write `/tmp/summary.txt`) but skip the Slack post. This allows testing the full contract file flow without Slack.

  **Must NOT do**:
  - Do NOT change the `/tmp/approval-message.json` schema — same fields, same types
  - Do NOT modify `submit-output.ts` — call it as a subprocess only
  - Do NOT modify the `buildGuestApprovalBlocks` function (Block Kit construction) — keep the rich card layout
  - Do NOT add a fallback channel or accept `--channel` as an optional override — env var only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Involves careful refactoring with subprocess integration, idempotency guard interaction, and write-order logic that requires deep understanding of the tool contract
  - **Skills**: []
    - No specialized skills needed — this is a TypeScript refactor of a single file

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/worker-tools/slack/post-guest-approval.ts` — Full file (434 lines). The file being refactored. Key areas: `parseArgs` (lines 35-138), `buildGuestApprovalBlocks` (lines 153-303), `main` (lines 305-429), idempotency guard (lines 307-328), required strings validation (lines 332-353), channel usage in `postMessageArgs` (line 385).
  - `src/worker-tools/slack/post-message.ts:75-78` — Pattern for defaulting `--thread-ts` to `process.env.NOTIFY_MSG_TS`. Copy this exact pattern.

  **API/Type References**:
  - `src/worker-tools/platform/submit-output.ts` — Full file (180 lines). The tool to call as subprocess. CLI flags: `--summary`, `--classification`, `--draft-file`, `--metadata`, `--confidence`, `--urgency`. Writes `/tmp/summary.txt`.

  **Test References**:
  - `tests/worker-tools/slack/post-guest-approval.test.ts` — Existing test file. Must be updated in Task 5.

  **External References**:
  - Node.js `child_process.execFileSync` — for subprocess call to `submit-output.ts`

  **WHY Each Reference Matters**:
  - `post-guest-approval.ts` is the file being modified — executor must understand every section
  - `post-message.ts:75-78` shows the exact pattern for env var threading default
  - `submit-output.ts` is the subprocess target — executor must know its CLI interface
  - Tests will need updating but are handled in Task 5

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Channel from env var (happy path)
    Tool: Bash
    Preconditions: NOTIFICATION_CHANNEL=C_TEST_CHANNEL is set in env, NOTIFY_MSG_TS=1234.5678 is set
    Steps:
      1. Run: NOTIFICATION_CHANNEL=C_TEST_CHANNEL NOTIFY_MSG_TS=1234.5678 tsx src/worker-tools/slack/post-guest-approval.ts --dry-run --task-id "test-123" --guest-name "Jane" --property-name "Ocean View" --check-in "2026-06-01" --check-out "2026-06-05" --booking-channel "AIRBNB" --original-message "What time is check-in?" --draft-response "Check-in is 3 PM" --confidence 0.92 --category "check-in-info" --lead-uid "lead-001" --thread-uid "thread-001" --message-uid "msg-001"
      2. Parse stdout JSON
      3. Check /tmp/summary.txt exists and contains valid JSON with classification: NEEDS_APPROVAL
    Expected Result: stdout contains blocks JSON (dry-run output). /tmp/summary.txt contains StandardOutput JSON.
    Failure Indicators: Error about missing --channel flag, or /tmp/summary.txt not written
    Evidence: .sisyphus/evidence/task-1-channel-env-var.txt

  Scenario: Missing NOTIFICATION_CHANNEL env var (error case)
    Tool: Bash
    Preconditions: NOTIFICATION_CHANNEL is NOT set
    Steps:
      1. Run: unset NOTIFICATION_CHANNEL && tsx src/worker-tools/slack/post-guest-approval.ts --task-id "test-123" --guest-name "Jane" --property-name "Ocean View" --check-in "2026-06-01" --check-out "2026-06-05" --booking-channel "AIRBNB" --original-message "msg" --draft-response "reply" --confidence 0.92 --category "info" --lead-uid "a" --thread-uid "b" --message-uid "c"
      2. Check exit code
      3. Check stderr for error message
    Expected Result: Exit code 1. stderr contains "NOTIFICATION_CHANNEL environment variable is required"
    Failure Indicators: Tool succeeds without NOTIFICATION_CHANNEL, or generic error without clear message
    Evidence: .sisyphus/evidence/task-1-missing-channel-env.txt

  Scenario: --help does not list --channel
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: tsx src/worker-tools/slack/post-guest-approval.ts --help 2>&1
      2. Check output does NOT contain "--channel"
      3. Check output DOES contain "NOTIFICATION_CHANNEL"
    Expected Result: No --channel flag in help. NOTIFICATION_CHANNEL env var mentioned.
    Evidence: .sisyphus/evidence/task-1-help-output.txt

  Scenario: Thread defaults to NOTIFY_MSG_TS
    Tool: Bash
    Preconditions: NOTIFICATION_CHANNEL=C_TEST NOTIFY_MSG_TS=9999.1234
    Steps:
      1. Run with --dry-run (same flags as happy path, no --thread-ts explicitly)
      2. The internal logic should use NOTIFY_MSG_TS as threadTs default
    Expected Result: Tool succeeds. When a real Slack post would happen, it would use thread_ts=9999.1234.
    Evidence: .sisyphus/evidence/task-1-thread-default.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): use env var channel and threading in post-guest-approval, wrap submit-output`
  - Files: `src/worker-tools/slack/post-guest-approval.ts`
  - Pre-commit: `pnpm lint`

---

- [x] 2. Update `tool-usage-reference/SKILL.md` — remove `C0960S2Q8RL`, update docs

  **What to do**:
  - Replace ALL occurrences of `C0960S2Q8RL` in SKILL.md with `$NOTIFICATION_CHANNEL`. Specific locations:
    - Line 63: `--channel <id>` example — change `C0960S2Q8RL` to `$NOTIFICATION_CHANNEL`
    - Line 107: `--channel "C0960S2Q8RL"` in post-message.ts example — change to `--channel "$NOTIFICATION_CHANNEL"`
    - Line 114: `--channel "C0960S2Q8RL"` in second post-message.ts example — change to `--channel "$NOTIFICATION_CHANNEL"`
  - Update the `post-guest-approval.ts` section (around lines 195-260):
    - Remove `--channel` from the synopsis/usage block
    - Remove `--channel` from the "Required flags" list
    - Add a note: `**Channel:** Always uses $NOTIFICATION_CHANNEL env var (injected by the lifecycle). No --channel flag.`
    - Update the `--thread-ts` documentation to note it defaults to `$NOTIFY_MSG_TS` when not provided
    - Add a note about the automatic `submit-output.ts` integration: `**Auto-output:** Automatically writes /tmp/summary.txt via submit-output.ts. Do NOT call submit-output.ts separately after this tool.`
  - Update the submit-output.ts section (around line 1068) to note the same: if using `post-guest-approval.ts`, do NOT call `submit-output.ts` separately — it's handled automatically.

  **Must NOT do**:
  - Do NOT change `C0960S2Q8RL` occurrences in any file other than SKILL.md
  - Do NOT modify the `post-message.ts` tool behavior — only its documentation examples
  - Do NOT add new sections — update existing ones

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward text replacements and documentation updates in a single file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/skills/tool-usage-reference/SKILL.md:50-118` — post-message.ts section with the C0960S2Q8RL examples
  - `src/workers/skills/tool-usage-reference/SKILL.md:195-260` — post-guest-approval.ts section to update
  - `src/workers/skills/tool-usage-reference/SKILL.md:1060-1110` — submit-output.ts section

  **WHY Each Reference Matters**:
  - Lines 50-118 contain the channel ID hallucination magnets — primary fix target
  - Lines 195-260 are the post-guest-approval.ts docs that must reflect the refactored CLI
  - Lines 1060-1110 are the submit-output.ts docs that need the "don't call separately" note

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No C0960S2Q8RL in SKILL.md
    Tool: Bash
    Preconditions: Task 2 changes applied
    Steps:
      1. Run: grep -c "C0960S2Q8RL" src/workers/skills/tool-usage-reference/SKILL.md
    Expected Result: 0 (no occurrences)
    Evidence: .sisyphus/evidence/task-2-no-hallucination-magnets.txt

  Scenario: --channel not in post-guest-approval.ts docs
    Tool: Bash
    Preconditions: Task 2 changes applied
    Steps:
      1. Run: grep -A 20 "post-guest-approval.ts" src/workers/skills/tool-usage-reference/SKILL.md | grep -c "\-\-channel"
    Expected Result: 0 (no --channel in the post-guest-approval section)
    Evidence: .sisyphus/evidence/task-2-no-channel-flag-docs.txt

  Scenario: NOTIFICATION_CHANNEL mentioned in post-guest-approval docs
    Tool: Bash
    Preconditions: Task 2 changes applied
    Steps:
      1. Run: grep -c "NOTIFICATION_CHANNEL" src/workers/skills/tool-usage-reference/SKILL.md
    Expected Result: >= 3 (in post-message examples + post-guest-approval docs)
    Evidence: .sisyphus/evidence/task-2-env-var-mentioned.txt
  ```

  **Commit**: YES
  - Message: `docs(skills): remove C0960S2Q8RL hallucination magnets, update post-guest-approval docs`
  - Files: `src/workers/skills/tool-usage-reference/SKILL.md`
  - Pre-commit: —

---

- [x] 3. Update `archetype-generator.ts` — approval pattern env var note

  **What to do**:
  - In the "Approval Flow Pattern" section (lines 168-173), add a note that specialized approval tools get their channel from the `$NOTIFICATION_CHANNEL` environment variable automatically — the LLM should NOT pass a `--channel` flag.
  - Update line 171 to include: `The approval tool uses $NOTIFICATION_CHANNEL automatically — do NOT pass --channel.`

  **Must NOT do**:
  - Do NOT modify any other section of the generator prompt
  - Do NOT change the tool catalog injection logic
  - Do NOT change the delivery_steps pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line addition to a documented section
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts:168-173` — Approval Flow Pattern section. The exact lines to update.

  **WHY Each Reference Matters**:
  - This is the generator prompt that creates `execution_steps` for new archetypes. If it still mentions `--channel`, new archetypes generated via the wizard will have the same hallucination problem.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Generator prompt mentions NOTIFICATION_CHANNEL in approval pattern
    Tool: Bash
    Preconditions: Task 3 changes applied
    Steps:
      1. Run: grep -A 5 "Approval Flow Pattern" src/gateway/services/archetype-generator.ts | grep -c "NOTIFICATION_CHANNEL"
    Expected Result: >= 1
    Evidence: .sisyphus/evidence/task-3-generator-updated.txt

  Scenario: Generator prompt does NOT mention --channel for approval tools
    Tool: Bash
    Preconditions: Task 3 changes applied
    Steps:
      1. Run: grep -A 5 "specialized approval tool" src/gateway/services/archetype-generator.ts | grep -c "\-\-channel"
    Expected Result: 0
    Evidence: .sisyphus/evidence/task-3-no-channel-in-generator.txt
  ```

  **Commit**: YES
  - Message: `fix(archetype-generator): note env var channel in approval pattern docs`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm lint`

- [x] 4. Update live DB archetype `execution_steps` — remove redundant `submit-output.ts` call

  **What to do**:
  - The live archetype (ID `94b1e64c-2c2a-4391-a6e3-f3ef61044cb5`) has 8 steps in `execution_steps`. Step 7 calls `post-guest-approval.ts` and step 8 calls `submit-output.ts` separately. Since Task 1 makes `post-guest-approval.ts` internally call `submit-output.ts`, step 8 is now redundant and would cause a double-write to `/tmp/summary.txt`.
  - Run a targeted SQL UPDATE to remove step 8 from `execution_steps`:
    ```sql
    UPDATE archetypes
    SET execution_steps = regexp_replace(
      execution_steps,
      '\n\n 8\. Submit the draft.*\*\*STOP\.',
      '\n\n**STOP.',
      'gs'
    )
    WHERE id = '94b1e64c-2c2a-4391-a6e3-f3ef61044cb5';
    ```
  - Also fix step 7's malformed flags:
    - `--confidence high` → remove (the tool gets confidence from its analysis, not a hardcoded string; and `high` is not a valid float)
    - `--draft-response /tmp/draft.txt` → this is wrong, the flag expects text not a file path. But since the draft is in `/tmp/draft.txt` and the tool refactor will handle this, just ensure the step references the draft correctly.
  - **Verify after update**: Read back the execution_steps and confirm steps 1-7 + STOP, no step 8.
  - **Do NOT touch `prisma/seed.ts`** — the seed is for fresh DB setup and uses different archetype IDs.

  **Must NOT do**:
  - Do NOT use the wizard to regenerate the archetype
  - Do NOT modify any other archetypes
  - Do NOT modify `prisma/seed.ts`
  - Do NOT add `--channel` to step 7

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL UPDATE command against the live database
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (must have the tool refactored before removing the separate submit-output call)

  **References**:

  **Pattern References**:
  - Live DB archetype `94b1e64c-2c2a-4391-a6e3-f3ef61044cb5` — the `execution_steps` column to update. Current step 7 calls `post-guest-approval.ts`, step 8 calls `submit-output.ts`.

  **WHY Each Reference Matters**:
  - The executor must read the current execution_steps to understand what step 8 looks like before removing it.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Step 8 removed from execution_steps
    Tool: Bash
    Preconditions: SQL UPDATE applied
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT execution_steps FROM archetypes WHERE id = '94b1e64c-2c2a-4391-a6e3-f3ef61044cb5';"
      2. Check output does NOT contain "8. Submit the draft"
      3. Check output contains "STOP" after step 7
    Expected Result: Steps 1-7 present, no step 8, "STOP" at end
    Evidence: .sisyphus/evidence/task-4-execution-steps-updated.txt

  Scenario: Archetype still active and valid
    Tool: Bash
    Preconditions: SQL UPDATE applied
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status, role_name FROM archetypes WHERE id = '94b1e64c-2c2a-4391-a6e3-f3ef61044cb5';"
    Expected Result: status = 'active', role_name = 'guest-messaging'
    Evidence: .sisyphus/evidence/task-4-archetype-valid.txt
  ```

  **Commit**: NO (DB change only, no code files)

---

- [x] 5. Update `post-guest-approval.test.ts` — tests for env var channel and `submit-output` wrapping

  **What to do**:
  - Update existing tests in `tests/worker-tools/slack/post-guest-approval.test.ts` to reflect the refactored tool:
    - Remove/update tests that pass `--channel` as a CLI flag — replace with `process.env.NOTIFICATION_CHANNEL` setup
    - Add test: tool fails with clear error when `NOTIFICATION_CHANNEL` is not set
    - Add test: tool uses `NOTIFICATION_CHANNEL` env var as the Slack channel
    - Add test: tool defaults `threadTs` to `process.env.NOTIFY_MSG_TS` when `--thread-ts` is not provided
    - Add test: tool calls `submit-output.ts` subprocess and writes `/tmp/summary.txt`
    - Add test: idempotency guard still calls `submit-output.ts` when `/tmp/approval-message.json` exists but `/tmp/summary.txt` doesn't
    - Add test: `--dry-run` mode still writes `/tmp/summary.txt`
    - Update the `--help` output test to assert no `--channel` flag
  - Mock `child_process.execFileSync` for the `submit-output.ts` subprocess call.
  - Run `pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts` to confirm all pass.

  **Must NOT do**:
  - Do NOT modify tests for other tools
  - Do NOT change the test framework or configuration

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding the existing test patterns and adding multiple new test cases that cover subprocess mocking
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (tests must match the refactored tool behavior)

  **References**:

  **Pattern References**:
  - `tests/worker-tools/slack/post-guest-approval.test.ts` — Full existing test file. Key areas: mock setup patterns, `parseArgs` call simulation, `writeFileSync` mocking (line 567), idempotency guard tests (line 247).
  - `src/worker-tools/slack/post-guest-approval.ts` — The refactored tool (after Task 1 changes).

  **Test References**:
  - `tests/worker-tools/slack/post-guest-approval.test.ts` — Follow the existing test structure and vitest patterns.

  **WHY Each Reference Matters**:
  - The existing test file has established patterns for mocking `@slack/web-api`, `writeFileSync`, and the CLI argument parser — the executor must follow these patterns, not reinvent.

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts` → PASS (all tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: Tasks 1 and 5 both complete
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/slack/post-guest-approval.test.ts
      2. Check output for pass count and failure count
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure, missing mock, unresolved type errors
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: Tasks 1 and 5 both complete
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
    Expected Result: All tests pass (expected ~1490 passing, 0 failures)
    Evidence: .sisyphus/evidence/task-5-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(slack): update post-guest-approval tests for env var channel and submit-output wrapping`
  - Files: `tests/worker-tools/slack/post-guest-approval.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 6. Docker image rebuild

  **What to do**:
  - Rebuild the Docker image to include the refactored `post-guest-approval.ts` and updated `SKILL.md`:
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
  - This is required because `src/worker-tools/` is only bind-mounted in local Docker mode. The Docker image bakes tools and skills into the image at build time. Without a rebuild, the container would use the old `post-guest-approval.ts`.
  - Run in a tmux session (long-running command):
    ```bash
    tmux kill-session -t ai-build 2>/dev/null
    tmux new-session -d -s ai-build -x 220 -y 50
    tmux send-keys -t ai-build "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" Enter
    ```
  - Poll until complete. Kill tmux session after.

  **Must NOT do**:
  - Do NOT skip the rebuild — E2E will fail without it
  - Do NOT leave the tmux session running after build completes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution with polling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2 (must have refactored tool and updated SKILL.md before building)

  **References**: None needed — standard Docker build command.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker build succeeds
    Tool: Bash
    Preconditions: Tasks 1, 2 complete
    Steps:
      1. Run: grep "EXIT_CODE:" /tmp/ai-build.log
    Expected Result: EXIT_CODE:0
    Evidence: .sisyphus/evidence/task-6-docker-build.txt

  Scenario: Tmux session cleaned up
    Tool: Bash
    Preconditions: Build complete
    Steps:
      1. Run: tmux kill-session -t ai-build 2>/dev/null; echo "cleaned"
    Expected Result: Session killed or already gone
    Evidence: .sisyphus/evidence/task-6-tmux-cleanup.txt
  ```

  **Commit**: NO (Docker build, no code files)

---

- [x] 7. Full E2E retest — Airbnb message → webhook → lifecycle → approval → delivery → Done

  **What to do**:
  - This is the critical verification that both bugs are fixed end-to-end.
  - **Pre-flight checks**:
    1. Confirm services running: `curl -s http://localhost:7700/health`, `curl -s http://localhost:8288/health`
    2. Confirm Docker image is rebuilt (Task 6 complete)
    3. Confirm archetype updated (Task 4 complete)
  - **Step 1: Send Airbnb test message**
    - Go to `https://www.airbnb.com/guest/messages/2525238359` (Olivia's test account)
    - Send a new message (e.g., "What time is check-in for this weekend?")
    - Wait ~30 seconds for Hostfully to sync
  - **Step 2: Trigger via webhook**
    - Fire the Hostfully webhook:
      ```bash
      curl -X POST http://localhost:7700/webhooks/hostfully \
        -H "Content-Type: application/json" \
        -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"e2e-test-'$(date +%s)'","thread_uid":"aef3d0cf-bc61-4f05-a3ce-1a4199ca336d","lead_uid":"29a64abd-d02c-44bc-8d5c-47df58a7ab14","property_uid":"562695df-6a4f-40d6-990d-56fe043aa9e8"}'
      ```
    - Capture the `task_id` from the response
  - **Step 3: Monitor task lifecycle**
    - Poll task status until `Reviewing` (or `Submitting` → `Reviewing`):
      ```bash
      PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
        -c "SELECT status FROM tasks WHERE id = '<task_id>';"
      ```
  - **Step 4: Verify approval card is in CORRECT channel**
    - Check `deliverables.metadata`:
      ```bash
      PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
        -c "SELECT metadata->>'target_channel' FROM deliverables WHERE task_id = '<task_id>';"
      ```
    - Expected: `C0AMGJQN05S` (NOT `C0960S2Q8RL`)
    - Visually confirm in Slack: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`
  - **Step 5: Verify approval card threads under notify message**
    - Get notify message ts:
      ```bash
      NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
        -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '<task_id>';" | tr -d ' \n')
      ```
    - Check thread replies:
      ```bash
      source .env
      curl -s "https://slack.com/api/conversations.replies" \
        -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
        -d "channel=C0AMGJQN05S&ts=$NOTIFY_TS&limit=10" | jq '.messages | length'
      ```
    - Expected: >= 2 (parent message + approval card thread reply)
  - **Step 6: Approve the task**
    - Click "Approve & Send" in Slack, OR use the manual approval fallback:
      ```bash
      curl -X POST "http://localhost:8288/e/local" \
        -H "Content-Type: application/json" \
        -d '{"name":"employee/approval.received","data":{"taskId":"<task_id>","action":"approve","userId":"U06L7NUFHFM","userName":"Victor"}}'
      ```
  - **Step 7: Wait for Done state**
    - Poll until `Done`:
      ```bash
      PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
        -c "SELECT status FROM tasks WHERE id = '<task_id>';"
      ```
  - **Step 8: Verify Done-state Slack behavior**
    - Check that the notify message in `C0AMGJQN05S` shows "✅ Done" state
    - If "See thread for full details" text is present, verify the thread actually exists (Step 5 already confirmed this)
    - Check the approval card in `C0AMGJQN05S` is updated to "✅ Delivered"
  - **Step 9: Verify full lifecycle trace**
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT from_status, to_status, created_at FROM task_status_log WHERE task_id = '<task_id>' ORDER BY created_at;"
    ```
    Expected: Received → Triaging → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done

  **Must NOT do**:
  - Do NOT skip the Airbnb message step — use a real message
  - Do NOT accept "task reached Done" as sufficient — must verify Slack channel explicitly
  - Do NOT leave the task in a non-terminal state

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-step E2E test requiring database queries, Slack API calls, webhook triggers, and lifecycle monitoring
  - **Skills**: [`e2e-testing`]
    - `e2e-testing`: Provides the prerequisites checklist, trigger methods, state verification patterns via `task_status_log`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — E2E test guide with lifecycle verification steps
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Slack UX Scenario A (approve happy path)
  - `docs/employees/guest-messaging.md` — Guest messaging employee details, test resources

  **External References**:
  - Airbnb test thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack channel: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`

  **WHY Each Reference Matters**:
  - E2E test guide provides the exact verification steps and expected lifecycle trace
  - Slack UX guide provides the approval happy path steps
  - Guest messaging doc has the Hostfully test UUIDs needed for the webhook payload

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Approval card in correct channel (Issue 2 fix)
    Tool: Bash (psql)
    Preconditions: Task triggered and reached Reviewing
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT metadata->>'target_channel' FROM deliverables WHERE task_id = '<task_id>';"
      2. Assert result = C0AMGJQN05S
    Expected Result: C0AMGJQN05S
    Failure Indicators: C0960S2Q8RL or any other channel ID
    Evidence: .sisyphus/evidence/task-7-correct-channel.txt

  Scenario: Thread exists under notify message (Issue 3 fix)
    Tool: Bash (curl)
    Preconditions: Task triggered, approval card posted
    Steps:
      1. Get notify_slack_ts from tasks metadata
      2. Call conversations.replies for C0AMGJQN05S with that ts
      3. Assert message count >= 2
    Expected Result: Thread has parent + at least one reply (the approval card)
    Failure Indicators: messages array length = 1 (no thread replies)
    Evidence: .sisyphus/evidence/task-7-thread-exists.txt

  Scenario: Full lifecycle trace
    Tool: Bash (psql)
    Preconditions: Task reached Done
    Steps:
      1. Query task_status_log for the task_id
      2. Verify trace: Received → Triaging → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done
    Expected Result: Complete lifecycle trace with all expected states
    Evidence: .sisyphus/evidence/task-7-lifecycle-trace.txt

  Scenario: Done-state notify message correct
    Tool: Bash (curl Slack API)
    Preconditions: Task reached Done
    Steps:
      1. Get the notify message from Slack
      2. Verify it shows Done/delivered state
      3. If "See thread" text present, verify thread has content
    Expected Result: Notify message reflects Done state. Any thread hint points to a real thread.
    Evidence: .sisyphus/evidence/task-7-done-notify.txt
  ```

  **Commit**: NO (E2E test only, no code changes)

---

- [x] 8. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**:
  - After all F1-F4 reviews pass and user gives explicit okay:
    ```bash
    tsx scripts/telegram-notify.ts "✅ guest-approval-channel-fix complete — Both Slack bugs fixed (correct channel + thread). All tasks done. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4 and user okay

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                        | Files                                                  | Pre-commit           |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------- |
| 1      | `fix(slack): use env var channel and threading in post-guest-approval, wrap submit-output`     | `src/worker-tools/slack/post-guest-approval.ts`        | `pnpm lint`          |
| 2      | `docs(skills): remove C0960S2Q8RL hallucination magnets, update post-guest-approval docs`      | `src/workers/skills/tool-usage-reference/SKILL.md`     | —                    |
| 3      | `fix(archetype-generator): note env var channel in approval pattern docs`                      | `src/gateway/services/archetype-generator.ts`          | `pnpm lint`          |
| 4      | `test(slack): update post-guest-approval tests for env var channel and submit-output wrapping` | `tests/worker-tools/slack/post-guest-approval.test.ts` | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Approval card in correct channel
TASK_ID=<task_id>
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT metadata->>'target_channel' FROM deliverables WHERE task_id = '$TASK_ID';"
# Expected: C0AMGJQN05S

# Thread exists under notify message
source .env
NOTIFY_TS=$(psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')
curl -s "https://slack.com/api/conversations.replies" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
  -d "channel=C0AMGJQN05S&ts=$NOTIFY_TS&limit=5" | jq '.messages | length'
# Expected: >= 2

# No C0960S2Q8RL in SKILL.md
grep -c "C0960S2Q8RL" src/workers/skills/tool-usage-reference/SKILL.md
# Expected: 0

# Build passes
pnpm build && pnpm lint && pnpm test -- --run
# Expected: all pass
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image rebuilt
- [ ] E2E task reached Done with correct Slack behavior
