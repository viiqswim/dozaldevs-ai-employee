# Fix Delivery Phase Confirmation Conflict

## TL;DR

> **Quick Summary**: Fix the ~40% delivery failure rate in `daily-real-estate-inspiration-2` caused by conflicting LLM instructions. The harness nudge correctly tells the LLM to use `submit-output.ts`, but the `delivery_instructions` incorrectly tell it to write `echo '{"delivered":true}'` directly. When the LLM follows the correct tool-based approach, the harness delivery check rejects the output because it expects `delivered: true` instead of the `submit-output.ts` format. Fix the harness check, fix the delivery_instructions, and document the convention in AGENTS.md.
>
> **Deliverables**:
>
> - Fixed harness delivery check to accept `submit-output.ts` output format
> - Added `--text-file` to `post-message.ts` (eliminates shell quoting failures)
> - Updated archetype `delivery_instructions` to use `submit-output.ts` (not `echo`)
> - Updated SQL script for reproducibility
> - Updated AGENTS.md with `/tmp/` file convention: tools only, never direct writes
> - Docker image rebuilt
> - 10 consecutive successful runs validated
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (harness check) → Task 4 (Docker rebuild) → Task 5 (10 runs)

---

## Context

### Original Request

The `daily-real-estate-inspiration-2` employee fails ~40% of runs during the delivery phase. Out of 5 triggered runs, 2 failed with "Delivery failed after 3 attempts". The execution phase succeeds consistently — only delivery fails.

### Investigation Summary

**Key Findings**:

- **Root cause: Conflicting instructions**. The harness passes `tsx /tools/platform/submit-output.ts --summary "..." --classification "NO_ACTION_NEEDED"` as `submitOutputCmd` (line 722 of `opencode-harness.mts`). This is the CORRECT approach — all `/tmp/` file writes must go through TypeScript tools. However, the `delivery_instructions` (set by the previous plan) tell the LLM to bypass the tool: `echo '{"delivered":true}' > /tmp/summary.txt`. The LLM non-deterministically follows one or the other.
- **Why it fails**: The harness delivery check at line 758 expects `deliverySummary.delivered === true`. But `submit-output.ts` writes `{"summary":"...","classification":"..."}` — no `delivered` key. When the LLM correctly uses the tool, the check incorrectly rejects it.
- **The real bug**: The harness delivery check expects a format that no tool produces. The `delivery_instructions` worked around this by telling the LLM to write directly — which is the wrong approach per platform convention.
- **Secondary issue**: `post-message.ts` has no `--text-file` option. The LLM must pass the full draft text via `--text "..."` on the command line, which fails with shell quoting on messages containing quotes, em-dashes, and markdown.
- **Evidence**: Delivery logs at `/tmp/employee-delivery-{taskId}.log` confirm: failed tasks used `submit-output.ts` (correct tool, rejected by check); successful tasks used `echo` (wrong approach, accepted by check).

**Failed task IDs**: `e0f841af-bf17-4c84-a3d7-607615b734ef`, `99fc9dd3-bfad-4c05-9eab-18bfa7017ec6`
**Successful task IDs**: `ea1e0692-3c75-41b2-af8e-bb351f832187`, `f9491e0a-219a-4015-958b-211d935af500`, `515761e6-053c-4890-912d-ea162a4cba60`

### Gap Analysis

**Self-review gaps addressed**:

- **Platform convention**: All `/tmp/` file writes (summary.txt, approval-message.json) must go through TypeScript tools — never direct `echo` or shell writes. This is a platform-wide rule.
- **Execution phase `/tmp/summary.txt`**: Not an issue — delivery runs in a separate Docker container with fresh `/tmp/`.
- **Model quality**: The model (`openai/gpt-oss-120b`) is fine — the fix eliminates conflicting instructions entirely.
- **AGENTS.md gap**: This convention is not documented anywhere, which is how the previous plan introduced the `echo` approach. Must be documented.

---

## Work Objectives

### Core Objective

Fix the harness delivery check to accept `submit-output.ts` output format, update `delivery_instructions` to use the tool (not `echo`), add `--text-file` to `post-message.ts` to prevent shell quoting failures, and document the `/tmp/` file convention in AGENTS.md.

### Concrete Deliverables

- `src/workers/opencode-harness.mts` — fixed delivery check to accept `submit-output.ts` format
- `src/worker-tools/slack/post-message.ts` — added `--text-file` option
- Archetype `delivery_instructions` updated in DB to use `submit-output.ts`
- `scripts/2026-05-25-update-archetype-delivery.sql` — updated for reproducibility
- `AGENTS.md` — new convention: `/tmp/` files must only be written via TypeScript tools
- Docker image rebuilt
- 10 consecutive successful runs documented

### Definition of Done

- [ ] `daily-real-estate-inspiration-2` reaches `Done` on 10 consecutive runs
- [ ] No delivery failures in any of the 10 runs
- [ ] Each run posts actual inspirational content to Slack (not meta-descriptions)
- [ ] No double-posting in any run
- [ ] AGENTS.md documents the `/tmp/` file convention

### Must Have

- Harness delivery check changed to accept `submit-output.ts` format (`summary` field) instead of requiring `delivered: true`
- `post-message.ts` `--text-file` option
- Updated `delivery_instructions` using `submit-output.ts` (not `echo`)
- AGENTS.md convention: `/tmp/` files must only be written via TypeScript tools in `/tools/`
- 10 consecutive successful runs validated

### Must NOT Have (Guardrails)

- DO NOT modify `src/inngest/employee-lifecycle.ts` — lifecycle is not broken
- DO NOT modify `src/inngest/lifecycle.ts` (deprecated)
- DO NOT touch any other archetype's `instructions` or `delivery_instructions`
- DO NOT run unit tests (known timeout issues)
- DO NOT use `--no-verify` on git commits
- DO NOT add `Co-authored-by` lines to commits
- DO NOT reference AI tools in commit messages
- DO NOT change the execution phase — it works correctly
- DO NOT change the harness `submitOutputCmd` at line 722 — it is already correct
- DO NOT write to `/tmp/summary.txt` or any `/tmp/` contract file directly via `echo` or shell commands — always use TypeScript tools

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — user explicitly said skip due to timeout issues
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run command, assert output
- **Delivery**: Use Bash (psql + curl) — trigger task, poll status, verify DB rows

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all code changes, MAX PARALLEL):
├── Task 1: Fix harness delivery check to accept submit-output.ts format [quick]
├── Task 2: Add --text-file support to post-message.ts [quick]
├── Task 3: Update SQL script + DB with corrected delivery_instructions [quick]
└── Task 4: Document /tmp/ file convention in AGENTS.md [quick]

Wave 2 (After Wave 1 — build + validate):
├── Task 5: Docker rebuild + single validation run [quick]
├── Task 6: 10 consecutive validation runs [deep]
└── Task 7: Notify completion [quick]

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
| 1    | —          | 5      | 1    |
| 2    | —          | 5      | 1    |
| 3    | —          | 5      | 1    |
| 4    | —          | 5      | 1    |
| 5    | 1, 2, 3, 4 | 6      | 2    |
| 6    | 5          | 7      | 2    |
| 7    | 6          | F1-F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: 3 tasks — T5 → `quick`, T6 → `deep`, T7 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix harness delivery check to accept submit-output.ts format

  **What to do**:
  - In `src/workers/opencode-harness.mts`, find the delivery confirmation check around line ~758. Currently it requires `deliverySummary.delivered === true`, which rejects the `submit-output.ts` output format `{"summary":"...","classification":"..."}`.
  - Change the check to accept the `submit-output.ts` format. Replace:
    ```typescript
    if (deliverySummary.delivered !== true) {
      await markFailed(
        'Delivery not confirmed — send-message.ts may not have succeeded',
        ...
      );
      return;
    }
    ```
    with:
    ```typescript
    if (deliverySummary.delivered !== true && !deliverySummary.summary) {
      await markFailed(
        'Delivery not confirmed — summary.txt missing both delivered:true and summary field',
        ...
      );
      return;
    }
    ```
  - This accepts EITHER `{"delivered": true}` (legacy) OR `{"summary":"...","classification":"..."}` (submit-output.ts format). Both indicate the LLM completed its work.
  - DO NOT change the `submitOutputCmd` at line ~722 — it is already correct (`submit-output.ts`).
  - DO NOT change the execution-phase `submitOutputCmd` at line ~924.

  **Must NOT do**:
  - DO NOT change `submitOutputCmd` — it's already correct
  - DO NOT modify `employee-lifecycle.ts`
  - DO NOT write to `/tmp/summary.txt` directly — use `submit-output.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:746-766` — delivery confirmation check that reads `/tmp/summary.txt` and checks for `delivered: true`
  - `src/workers/opencode-harness.mts:718-729` — delivery phase `runOpencodeSession` call (DO NOT CHANGE — `submitOutputCmd` is already correct here)
  - `src/workers/opencode-harness.mts:488-522` — recovery nudge logic that sends `submitOutputCmd` to LLM when summary.txt is missing

  **WHY Each Reference Matters**:
  - Lines 746-766: The exact check to fix — must accept `submit-output.ts` format
  - Lines 718-729: Context — confirms `submitOutputCmd` already uses `submit-output.ts` (no change needed)
  - Lines 488-522: Context — the nudge correctly tells the LLM to use `submit-output.ts`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify delivery check accepts submit-output.ts format
    Tool: Bash (grep)
    Steps:
      1. grep -A3 "deliverySummary.delivered" src/workers/opencode-harness.mts
      2. Assert the check includes fallback for `deliverySummary.summary` (accepts submit-output.ts format)
      3. Assert the check no longer rejects based solely on `delivered !== true`
    Expected Result: Check accepts either delivered:true OR summary field
    Evidence: .sisyphus/evidence/task-1-delivery-check-fixed.txt

  Scenario: Verify submitOutputCmd NOT changed
    Tool: Bash (grep)
    Steps:
      1. grep -n "submit-output.ts" src/workers/opencode-harness.mts | head -5
      2. Assert submit-output.ts still appears in the delivery-phase runOpencodeSession call (~line 722)
    Expected Result: submitOutputCmd unchanged — still uses submit-output.ts
    Evidence: .sisyphus/evidence/task-1-submitoutputcmd-unchanged.txt
  ```

  **Commit**: YES
  - Message: `fix(harness): accept submit-output.ts format in delivery confirmation check`
  - Files: `src/workers/opencode-harness.mts`

- [x] 2. Add --text-file support to post-message.ts

  **What to do**:
  - In `src/worker-tools/slack/post-message.ts`, add a `--text-file` CLI option. Follow the exact same pattern used in `submit-output.ts` for `--draft-file`:
    - Add `textFile: string | null` to the args interface and parseArgs return type
    - In `parseArgs`, handle `--text-file` flag: `else if (args[i] === '--text-file' && args[i + 1]) { textFile = args[++i]; }`
    - After parsing args (after `parseArgs` returns, before using `text`), if `textFile` is set and `text` is empty, read the file content: `text = fs.readFileSync(textFile, 'utf8').trim();`
    - Update the `--help` output to document the new flag
  - The behavior: `--text-file /tmp/delivery-draft.txt` reads the file content and uses it as the `--text` value. If both `--text` and `--text-file` are provided, `--text` takes priority.
  - Add `import fs from 'fs';` at the top if not already present.

  **Must NOT do**:
  - DO NOT change any existing behavior of post-message.ts
  - DO NOT add auto-discovery (no "check /tmp/ if no flags" — keep it explicit)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/platform/submit-output.ts:53-54` — `--draft-file` flag handling pattern to follow exactly
  - `src/worker-tools/platform/submit-output.ts:100-115` — file reading logic for `--draft-file` that reads file content and assigns to `draft`
  - `src/worker-tools/slack/post-message.ts:9-70` — existing `parseArgs` function to extend with `--text-file`

  **WHY Each Reference Matters**:
  - submit-output.ts lines 53-54 and 100-115: The exact pattern to copy — handles flag parsing, file reading, and fallback
  - post-message.ts lines 9-70: The function to modify — add `--text-file` parsing alongside existing `--text`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify --text-file option exists in parseArgs
    Tool: Bash (grep)
    Steps:
      1. grep -n "text-file" src/worker-tools/slack/post-message.ts
      2. Assert --text-file is handled in parseArgs
      3. Assert help text includes --text-file description
    Expected Result: --text-file option implemented and documented
    Evidence: .sisyphus/evidence/task-2-text-file-option.txt

  Scenario: Verify file reading logic exists
    Tool: Bash (grep)
    Steps:
      1. grep -n "readFileSync\|readFile" src/worker-tools/slack/post-message.ts
      2. Assert file reading is present for the text-file path
    Expected Result: File content is read when --text-file is provided
    Evidence: .sisyphus/evidence/task-2-file-reading.txt
  ```

  **Commit**: YES
  - Message: `feat(slack): add --text-file support to post-message.ts`
  - Files: `src/worker-tools/slack/post-message.ts`

- [x] 3. Update SQL script + DB with corrected delivery_instructions

  **What to do**:
  - Update `scripts/2026-05-25-update-archetype-delivery.sql` to set the new `delivery_instructions` for archetype `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`.
  - The new delivery_instructions should be:

    ```
    The approved content below contains JSON. Parse it and extract the "draft" field — that is the actual inspirational message to post.

    Steps:
    1. Read the content after "--- APPROVED CONTENT ---" and parse it as JSON
    2. Extract the value of the "draft" key — this is the full inspirational message
    3. Use your Write tool to save the draft text to /tmp/delivery-draft.txt
    4. Post it to Slack: tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text-file /tmp/delivery-draft.txt
    5. Confirm delivery by running: tsx /tools/platform/submit-output.ts --summary "Posted inspirational message to Slack" --classification "NO_ACTION_NEEDED"

    IMPORTANT: Do NOT add --thread flag to post-message.ts — threading is handled automatically via NOTIFY_MSG_TS.
    IMPORTANT: Do NOT pass the message text directly via --text "..." — always use --text-file to avoid shell quoting issues.
    IMPORTANT: Do NOT write to /tmp/summary.txt directly via echo or shell commands — always use submit-output.ts.
    ```

  - After updating the SQL file, also run the SQL against the local database to apply immediately.

  **Must NOT do**:
  - DO NOT change any other archetype's instructions
  - DO NOT change the execution-phase `instructions` column
  - DO NOT write to `/tmp/summary.txt` via `echo` — use `submit-output.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/2026-05-25-update-archetype-delivery.sql` — existing SQL script to update
  - Current `delivery_instructions` in DB — the text that incorrectly uses `echo` (to be replaced)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify delivery_instructions updated in DB
    Tool: Bash (psql)
    Steps:
      1. psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT delivery_instructions FROM archetypes WHERE id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f';" -t
      2. Assert output contains "submit-output.ts"
      3. Assert output contains "--text-file /tmp/delivery-draft.txt"
      4. Assert output does NOT contain "echo" or "delivered.*true"
    Expected Result: delivery_instructions use submit-output.ts and --text-file patterns
    Evidence: .sisyphus/evidence/task-3-delivery-instructions-updated.txt

  Scenario: Verify SQL script matches DB
    Tool: Bash
    Steps:
      1. grep "submit-output.ts" scripts/2026-05-25-update-archetype-delivery.sql
      2. Assert match found
      3. grep -c "echo.*delivered" scripts/2026-05-25-update-archetype-delivery.sql
      4. Assert count is 0 (no direct echo writes)
    Expected Result: SQL script uses submit-output.ts, not echo
    Evidence: .sisyphus/evidence/task-3-sql-script-updated.txt
  ```

  **Commit**: YES
  - Message: `fix(archetype): update inspiration-2 delivery_instructions to use submit-output.ts`
  - Files: `scripts/2026-05-25-update-archetype-delivery.sql`

- [x] 4. Document /tmp/ file convention in AGENTS.md

  **What to do**:
  - Add a new convention entry to the "Key Conventions" section of `AGENTS.md`.
  - The convention should state:
    - **All `/tmp/` contract files** (`/tmp/summary.txt`, `/tmp/approval-message.json`) **must be written exclusively via TypeScript tools** in `/tools/` (e.g., `submit-output.ts`).
    - **Never write to these files directly** via `echo`, shell redirects, or any non-tool method.
    - The harness reads these files after the OpenCode session completes. If a tool writes them in the correct format, the harness accepts the output. If written directly, the format may be wrong and the task will fail.
    - This applies to BOTH the execution phase and the delivery phase.
  - Place this convention alongside the existing bullet points in "Key Conventions" — it should be prominent since it affects all employees.

  **Must NOT do**:
  - DO NOT rewrite existing AGENTS.md content
  - DO NOT add employee-specific language to AGENTS.md (keep it employee-agnostic)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `AGENTS.md` "Key Conventions" section — where to add the new bullet point
  - `AGENTS.md` "OpenCode Worker" section — mentions `/tmp/summary.txt` and `/tmp/approval-message.json` as the output contract

  **WHY Each Reference Matters**:
  - Key Conventions: The section format to follow — each convention is a bold title followed by explanation
  - OpenCode Worker: Context for the output contract files that this convention protects

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify AGENTS.md documents /tmp/ file convention
    Tool: Bash (grep)
    Steps:
      1. grep -i "tmp.*tool\|tool.*tmp\|never write.*directly\|submit-output" AGENTS.md
      2. Assert at least one match referencing the convention
      3. grep -i "echo.*summary\|echo.*delivered" AGENTS.md
      4. Assert NO matches suggesting direct echo writes as valid
    Expected Result: AGENTS.md clearly documents tools-only convention for /tmp/ files
    Evidence: .sisyphus/evidence/task-4-agents-md-convention.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): document /tmp/ file convention — tools only, no direct writes`
  - Files: `AGENTS.md`

- [x] 5. Docker rebuild + single validation run

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Verify the image built successfully
  - Trigger one test run of `daily-real-estate-inspiration-2` to verify the fix works before the 10-run validation
  - Verify: task reaches Done, `task_status_log` has Delivering→Done, delivery log shows `submit-output.ts` used (not echo)

  **Must NOT do**:
  - DO NOT proceed to 10-run validation if the single test run fails

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - Previous plan's Task 5 pattern — same Docker rebuild + single validation approach

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Single validation run succeeds
    Tool: Bash (curl + psql)
    Steps:
      1. source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
      2. Capture task_id from response
      3. Poll task status every 15s until not Executing (max 5 min)
      4. Assert status = 'Done'
      5. Query task_status_log: assert Delivering→Done with actor='machine'
      6. Query deliverables: assert draft field is non-empty
    Expected Result: Task reaches Done with correct content
    Evidence: .sisyphus/evidence/task-5-single-validation.txt

  Scenario: Delivery log shows submit-output.ts used
    Tool: Bash
    Steps:
      1. Check delivery log: grep "submit-output" /tmp/employee-delivery-{taskId_prefix}.log
      2. Assert submit-output.ts was used for confirmation
      3. grep -c "echo.*delivered" /tmp/employee-delivery-{taskId_prefix}.log
      4. Assert count is 0 (no direct echo writes)
    Expected Result: LLM used submit-output.ts, not echo
    Evidence: .sisyphus/evidence/task-5-delivery-log-check.txt
  ```

  **Commit**: NO (build + validation only)

- [x] 6. Run 10 consecutive validation runs

  **What to do**:
  - Trigger `daily-real-estate-inspiration-2` 10 times sequentially (not in parallel — wait for each to complete before triggering the next)
  - For each run: trigger → poll until Done or Failed (max 5 min) → record task_id and status
  - After all 10: query all 10 tasks' statuses, task_status_log entries, and deliverable content
  - All 10 MUST reach `Done` with correct content and Delivering→Done log entries
  - If any run fails, investigate the delivery log, fix the root cause, rebuild Docker, and restart the 10-run validation from scratch

  **Must NOT do**:
  - DO NOT accept partial success (e.g., 9/10)
  - DO NOT run tasks in parallel — each must complete before the next starts

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - Previous plan's Task 6 — same 10-run validation approach

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 10 consecutive successful runs
    Tool: Bash (curl + psql)
    Steps:
      1. For i in 1..10:
         a. Trigger the employee, capture task_id
         b. Poll until status != 'Executing' (max 5 min)
         c. Assert status = 'Done'
         d. Query task_status_log: assert Delivering→Done with actor='machine'
         e. Query deliverables: assert draft field non-empty with actual content
         f. Record task_id and result
      2. Final query: SELECT id, status, failure_reason FROM tasks WHERE archetype_id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f' ORDER BY created_at DESC LIMIT 10;
      3. Assert all 10 have status='Done'
    Expected Result: 10/10 runs successful
    Evidence: .sisyphus/evidence/task-6-ten-runs-validation.txt
  ```

  **Commit**: NO (validation only)

- [x] 7. Notify completion

  **What to do**:
  - Send Telegram notification: `npx tsx scripts/telegram-notify.ts "✅ fix-delivery-confirmation-conflict complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 6

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Trigger `daily-real-estate-inspiration-2` once. Verify: (1) task reaches Done, (2) `task_status_log` has Delivering→Done entry with `actor='machine'`, (3) deliverables.content JSON has non-empty `draft` field, (4) Slack channel has ONE message with actual inspirational content. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Tasks | Message                                                                              | Files                                              |
| ------ | ----- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1      | T1    | `fix(harness): accept submit-output.ts format in delivery confirmation check`        | `src/workers/opencode-harness.mts`                 |
| 2      | T2    | `feat(slack): add --text-file support to post-message.ts`                            | `src/worker-tools/slack/post-message.ts`           |
| 3      | T3    | `fix(archetype): update inspiration-2 delivery_instructions to use submit-output.ts` | `scripts/2026-05-25-update-archetype-delivery.sql` |
| 4      | T4    | `docs(agents): document /tmp/ file convention — tools only, no direct writes`        | `AGENTS.md`                                        |

---

## Success Criteria

### Verification Commands

```bash
# Verify 10 consecutive runs all Done
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT id, status, failure_reason FROM tasks WHERE archetype_id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f' ORDER BY created_at DESC LIMIT 10;"
# Expected: All 10 rows with status='Done'

# Verify task_status_log for a given task
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT from_status, to_status, actor FROM task_status_log WHERE task_id='<TASK_ID>' AND to_status='Done';"
# Expected: Delivering→Done with actor='machine'

# Verify deliverables have real content
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT content FROM deliverables WHERE external_ref='<TASK_ID>';"
# Expected: JSON with non-empty 'draft' field containing actual inspirational content
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] 10 consecutive runs all Done with correct content
- [ ] No delivery failures in any of the 10 runs
- [ ] AGENTS.md convention documented
