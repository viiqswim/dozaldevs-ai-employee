# Fix Delivery Phase Nudge Timing

## TL;DR

> **Quick Summary**: Fix the 30% delivery failure rate for `daily-real-estate-inspiration-2` by increasing the delivery phase idle timeout from 30s to 120s and softening the recovery nudge message so it doesn't cause the LLM to skip Slack posting steps.
>
> **Deliverables**:
>
> - `runOpencodeSession` accepts configurable `minElapsedMs` parameter
> - Delivery phase uses 120s idle timeout (up from 30s)
> - Recovery nudge message instructs LLM to finish ALL remaining steps before submitting
> - Docker image rebuilt with fix
> - 10/10 consecutive runs verified with actual Slack message posting
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (code change) → Task 2 (Docker rebuild) → Task 3 (10-run validation) → Task 4 (execution regression check)

---

## Context

### Original Request

Fix the `daily-real-estate-inspiration-2` employee so it actually posts inspirational content to Slack on every run — not just reaches "Done" status. Currently 30% of runs complete as "Done" but never post to Slack.

### Interview Summary

**Key Discussions**:

- Previous plan (`fix-delivery-confirmation-conflict`) completed 11/11 tasks — fixed harness rejection of submit-output format
- User ran 10 consecutive tests post-fix: 7/10 posted to Slack, 3/10 did not. All 10 show "Done" status.
- Root cause: `runOpencodeSession` uses `minElapsedMs: 30000` (30s) for both execution AND delivery phases. Delivery is a multi-step flow (parse content → extract draft → write file → post to Slack → submit-output). When the LLM pauses >20s between steps, the 30s timer fires and the harness sends an aggressive nudge ("Run this command NOW"), causing the LLM to skip Slack posting.
- User chose: increase delivery timeout AND soften nudge message (defense in depth)

**Research Findings**:

- Delivery phase runs in a **separate Docker container** (`EMPLOYEE_PHASE=delivery`). Execution container is destroyed before delivery spawns. `/tmp/summary.txt` does NOT carry over — the nudge at line 503 DOES fire during delivery when the LLM pauses too long.
- Failed runs show: nudge fires at T+31s, 0 `post-message.ts` calls, 3 `submit-output` references
- Successful runs show: `post-message.ts` called at T+8s (fast LLM), nudge never fires
- The nudge message `"You forgot the mandatory final step. Run this command NOW:\n${submitOutputCmd}"` causes the LLM to immediately run `submit-output.ts`, skipping the Slack posting step entirely

### Metis Review

**Identified Gaps** (addressed):

- **A1 (CRITICAL)**: Confirmed `/tmp/summary.txt` does NOT persist between phases — delivery uses fresh container. Nudge fires in delivery phase. Fix target is correct.
- **Timeout value**: Metis suggested 120s over 90s for safety margin (5 steps × up to 20s each = 100s worst case). Using 120s.
- **Cross-employee impact**: Nudge softening affects ALL employees, not just `daily-real-estate-inspiration-2`. This is desirable — softer is better for all multi-step flows.
- **Execution regression**: Must verify execution phase still works with 30s default after adding the parameter. Plan includes regression check.
- **Post-nudge monitor**: `minElapsedMs: 10000` at line 507 must NOT be changed — it's the recovery window after nudge fires, and 10s is correct for a single "run this now" command.

---

## Work Objectives

### Core Objective

Make `daily-real-estate-inspiration-2` post an actual inspirational quote to Slack on every single run by preventing premature recovery nudge interruption during multi-step delivery.

### Concrete Deliverables

- Modified `src/workers/opencode-harness.mts` with configurable `minElapsedMs` and softened nudge
- Rebuilt Docker image containing the fix
- Evidence of 10/10 consecutive successful Slack postings

### Definition of Done

- [ ] `runOpencodeSession` accepts optional `minElapsedMs` parameter (default 30000)
- [ ] Delivery phase call passes `minElapsedMs: 120000`
- [ ] Nudge message instructs "finish ALL remaining steps" instead of "run this command NOW"
- [ ] 10/10 consecutive runs post actual content to Slack (not just "Done" status)
- [ ] Execution phase regression check passes (2 runs of `real-estate-motivation-bot-2`)

### Must Have

- Configurable `minElapsedMs` passed to delivery phase with 120s value
- Softened nudge message preserving `${submitOutputCmd}` interpolation
- 10/10 Slack posting verification with per-task evidence

### Must NOT Have (Guardrails)

- DO NOT change `minElapsedMs: 30000` at line 356 (execution phase monitor)
- DO NOT change `minElapsedMs: 10000` at line 507 (post-nudge recovery monitor)
- DO NOT change `submitOutputCmd` at line 722 (delivery submit command)
- DO NOT modify `src/inngest/employee-lifecycle.ts`
- DO NOT modify `src/workers/lib/session-manager.ts` (already supports `minElapsedMs` as option)
- DO NOT touch any other archetype's `instructions` or `delivery_instructions`
- DO NOT run unit tests (known timeout issues)
- DO NOT use `--no-verify` on commits
- DO NOT add `Co-authored-by` lines to commits
- DO NOT reference AI tools in commit messages

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO (user explicitly said "DO NOT run unit tests — known timeout issues")
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code changes**: Verified via grep/read of modified file
- **Docker rebuild**: Verified via `docker images` timestamp
- **Delivery validation**: Verified via delivery logs (`/tmp/employee-delivery-*.log`) checking for `post-message` tool calls
- **Execution regression**: Verified via DB status check on `real-estate-motivation-bot-2` runs

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — code change + Docker rebuild):
├── Task 1: Code change in opencode-harness.mts [quick]
│   (add minElapsedMs param, pass 120s for delivery, soften nudge)
└── Task 2: Docker image rebuild [quick] (depends: Task 1)

Wave 2 (After Wave 1 — validation):
├── Task 3: 10 consecutive delivery runs with Slack verification [deep]
│   (depends: Task 2)
├── Task 4: Execution regression check — 2 runs of motivation-bot [quick]
│   (depends: Task 2)
└── Task 5: Commit and telegram notification [quick]
    (depends: Task 3, Task 4)

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 2      | 1     |
| 2     | 1          | 3, 4   | 1     |
| 3     | 2          | 5      | 2     |
| 4     | 2          | 5      | 2     |
| 5     | 3, 4       | F1-F4  | 2     |
| F1-F4 | 5          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **3** — T3 → `deep`, T4 → `quick`, T5 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add configurable `minElapsedMs` to `runOpencodeSession` and soften recovery nudge

  **What to do**:
  1. Open `src/workers/opencode-harness.mts`
  2. At line 294, change the function signature from:
     ```typescript
     async function runOpencodeSession(
       instructions: string,
       model: string,
       submitOutputCmd: string,
     ): Promise<{...}>
     ```
     to:
     ```typescript
     async function runOpencodeSession(
       instructions: string,
       model: string,
       submitOutputCmd: string,
       options?: { minElapsedMs?: number },
     ): Promise<{...}>
     ```
  3. At line 356, change `minElapsedMs: 30000` to `minElapsedMs: options?.minElapsedMs ?? 30_000` — this makes the execution phase keep its 30s default while allowing delivery to override.
  4. At line 503, change the nudge message from:
     ```typescript
     const nudgeMessage = `You forgot the mandatory final step. Run this command NOW:\n${submitOutputCmd}`;
     ```
     to:
     ```typescript
     const nudgeMessage = `You may still have remaining delivery steps to complete (e.g. posting to Slack). Finish ALL your remaining steps first, then run this as the very last thing:\n${submitOutputCmd}`;
     ```
  5. At line 719, change the delivery call from:
     ```typescript
     await runOpencodeSession(
       deliveryPrompt,
       archetype.model ?? 'minimax/minimax-m2.7',
       'tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "NO_ACTION_NEEDED"',
     );
     ```
     to:
     ```typescript
     await runOpencodeSession(
       deliveryPrompt,
       archetype.model ?? 'minimax/minimax-m2.7',
       'tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "NO_ACTION_NEEDED"',
       { minElapsedMs: 120_000 },
     );
     ```
  6. At line 929, the execution call stays UNCHANGED — verify it still reads:
     ```typescript
     const result = await runOpencodeSession(instructionsWithSubmitOutput, model, submitOutputCmd);
     ```
     No 4th argument = uses default 30000ms. Do NOT add a 4th argument here.

  **Must NOT do**:
  - DO NOT change `minElapsedMs: 10000` at line 507 (post-nudge recovery monitor)
  - DO NOT change `submitOutputCmd` at line 722
  - DO NOT modify any other file
  - DO NOT change the execution call at line 929
  - DO NOT change `timeoutMs` values anywhere

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file, surgical edit — 4 precise line changes in one file
  - **Skills**: []
    - No skills needed — this is a straightforward TypeScript edit
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not relevant — modifying harness, not adding a shell tool

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential — Task 2 depends on this)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/workers/opencode-harness.mts:294-304` — Current `runOpencodeSession` function signature. Add `options?: { minElapsedMs?: number }` as 4th parameter.
  - `src/workers/opencode-harness.mts:354-357` — Current `monitorSession` call with hardcoded `minElapsedMs: 30000`. Change to use `options?.minElapsedMs ?? 30_000`.
  - `src/workers/opencode-harness.mts:498-508` — Current recovery nudge block. The nudge message at line 503 needs softening. The `minElapsedMs: 10000` at line 507 must NOT be changed.
  - `src/workers/opencode-harness.mts:717-723` — Current delivery phase call to `runOpencodeSession`. Add `{ minElapsedMs: 120_000 }` as 4th argument.
  - `src/workers/opencode-harness.mts:929` — Execution phase call. Must remain UNCHANGED (no 4th argument = uses default 30000).

  **API/Type References**:
  - `src/workers/lib/session-manager.ts:318` — `monitorSession` already accepts `minElapsedMs` as an option. No changes needed to session-manager.

  **External References**:
  - None needed

  **WHY Each Reference Matters**:
  - Lines 294-304: This is where you add the parameter — must match existing TypeScript conventions (optional param with default)
  - Lines 354-357: This is the idle detection line that causes premature nudge — must use the new parameter
  - Lines 498-508: The nudge message that causes LLMs to skip Slack posting — must be softened but preserve `${submitOutputCmd}`
  - Lines 717-723: The delivery call site — must pass 120s to prevent premature nudge
  - Line 929: The execution call site — must verify it stays unchanged for regression safety

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — parameter added and delivery call uses 120s
    Tool: Bash (grep)
    Preconditions: Code changes applied to src/workers/opencode-harness.mts
    Steps:
      1. Run: grep -n "minElapsedMs" src/workers/opencode-harness.mts
      2. Assert output contains: "options?.minElapsedMs ?? 30_000" (default in monitorSession call)
      3. Assert output contains: "minElapsedMs: 120_000" (delivery call)
      4. Assert output contains: "minElapsedMs: 10000" (post-nudge recovery — UNCHANGED)
      5. Assert output does NOT contain a standalone "minElapsedMs: 30000" (old hardcoded value replaced by options-based)
    Expected Result: 3 distinct minElapsedMs references: options-based default, 120000 delivery, 10000 post-nudge
    Failure Indicators: Missing 120_000, or line 507 changed from 10000, or old hardcoded 30000 still present
    Evidence: .sisyphus/evidence/task-1-grep-minelapsed.txt

  Scenario: Nudge message softened — no longer says "NOW"
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -n "nudgeMessage" src/workers/opencode-harness.mts
      2. Assert the nudge message contains "remaining" or "finish ALL"
      3. Assert the nudge message does NOT contain "NOW" or "forgot"
      4. Assert the nudge message still contains "${submitOutputCmd}" interpolation
    Expected Result: Softened nudge message preserving command interpolation
    Failure Indicators: "NOW" still present, or submitOutputCmd interpolation missing
    Evidence: .sisyphus/evidence/task-1-nudge-message.txt

  Scenario: Execution call unchanged — no 4th argument
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -A2 "await runOpencodeSession(instructionsWithSubmitOutput" src/workers/opencode-harness.mts
      2. Assert the call has exactly 3 arguments: instructionsWithSubmitOutput, model, submitOutputCmd
      3. Assert NO 4th argument (no minElapsedMs or options object)
    Expected Result: Execution call unchanged with 3 arguments only
    Failure Indicators: 4th argument present, or call modified in any way
    Evidence: .sisyphus/evidence/task-1-execution-call.txt

  Scenario: Function signature has optional 4th parameter
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -A5 "async function runOpencodeSession" src/workers/opencode-harness.mts
      2. Assert signature includes "options?: { minElapsedMs?: number }"
    Expected Result: Optional options parameter with minElapsedMs field
    Failure Indicators: Parameter missing or not optional
    Evidence: .sisyphus/evidence/task-1-function-signature.txt

  Scenario: Lint passes
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run: pnpm lint
    Expected Result: No lint errors
    Failure Indicators: Lint errors in opencode-harness.mts
    Evidence: .sisyphus/evidence/task-1-lint.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-grep-minelapsed.txt — all minElapsedMs references
  - [ ] task-1-nudge-message.txt — nudge message content
  - [ ] task-1-execution-call.txt — execution call unchanged
  - [ ] task-1-function-signature.txt — function signature with options param
  - [ ] task-1-lint.txt — lint output

  **Commit**: YES
  - Message: `fix(harness): increase delivery idle timeout and soften recovery nudge`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm lint`

- [x] 2. Docker image rebuild

  **What to do**:
  1. Rebuild the Docker image: `docker build -t ai-employee-worker:latest .`
  2. Verify the image was built successfully and has a recent timestamp

  **Must NOT do**:
  - DO NOT modify any source files
  - DO NOT push the image to any registry

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command — Docker build
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `Dockerfile` — Standard project Dockerfile. Build command: `docker build -t ai-employee-worker:latest .`
  - `AGENTS.md` § "CRITICAL — Rebuild after every worker change" — confirms rebuild required after `src/workers/` changes

  **WHY Each Reference Matters**:
  - Dockerfile: The build target. Must use `ai-employee-worker:latest` tag.
  - AGENTS.md: Confirms this step is mandatory — worker changes require Docker rebuild.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image rebuilt successfully
    Tool: Bash
    Preconditions: Task 1 code changes committed
    Steps:
      1. Run: docker build -t ai-employee-worker:latest .
      2. Run: docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
      3. Assert timestamp is within the last 10 minutes
    Expected Result: Image built successfully with recent timestamp
    Failure Indicators: Build failure, or image timestamp older than 10 minutes
    Evidence: .sisyphus/evidence/task-2-docker-build.txt

  Scenario: Image contains updated harness
    Tool: Bash
    Preconditions: Docker image built
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest grep -c "minElapsedMs: 120_000" /app/dist/workers/opencode-harness.mjs || docker run --rm ai-employee-worker:latest grep -c "120000" /app/dist/workers/opencode-harness.mjs
      2. Assert count >= 1
    Expected Result: Compiled harness in image contains the 120000 timeout value
    Failure Indicators: Count is 0 — image has stale code
    Evidence: .sisyphus/evidence/task-2-image-verify.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-docker-build.txt — build output + timestamp
  - [ ] task-2-image-verify.txt — grep for 120000 in compiled image

  **Commit**: NO (Docker image is a build artifact, not committed)

- [x] 3. 10 consecutive delivery runs with Slack verification

  **What to do**:
  1. Ensure `pnpm dev` is running (gateway at localhost:7700, Inngest at localhost:8288)
  2. Trigger 10 consecutive runs of `daily-real-estate-inspiration-2`:
     ```bash
     source .env
     for i in $(seq 1 10); do
       RESULT=$(curl -s -X POST \
         "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" \
         -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}')
       TASK_ID=$(echo $RESULT | jq -r '.task_id')
       echo "Run $i: Task ID = $TASK_ID"
       sleep 5
     done
     ```
  3. Wait for all 10 tasks to reach `Done` status (poll DB every 30s, typical completion ~2-3 min each)
  4. For EACH of the 10 tasks, verify:
     a. Status is `Done`: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status FROM tasks WHERE id = '<task_id>';"`
     b. Delivery log contains `post-message` tool call: `grep -i "post-message" /tmp/employee-delivery-<first8chars>.log`
     c. Delivery log does NOT show premature nudge (optional — nudge may still fire at 120s but that's acceptable)
  5. Record results in a table: Task ID | Status | post-message in log? | Nudge fired?
  6. Pass criteria: **10/10 must show `post-message` in delivery logs**. If any run fails, investigate before declaring done.

  **Must NOT do**:
  - DO NOT accept "Done" status alone as proof of Slack posting — must verify `post-message` in delivery logs
  - DO NOT modify any source code
  - DO NOT trigger runs faster than 5s apart (rate limiting)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Long-running validation requiring patience, log analysis, and systematic evidence collection across 10 runs
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `e2e-testing`: Not relevant — this is a targeted delivery validation, not a full E2E scenario

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Recommended Test Employee" — trigger command and verification pattern
  - `AGENTS.md` § "Long-Running Commands" — use tmux for commands >30s. This validation will take 20-30 minutes total.
  - `AGENTS.md` § "Admin API" — trigger endpoint: `POST /admin/tenants/:tenantId/employees/:slug/trigger`

  **API/Type References**:
  - Trigger endpoint: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger`
  - Tenant: `00000000-0000-0000-0000-000000000003` (VLRE)
  - Archetype: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`

  **WHY Each Reference Matters**:
  - AGENTS.md trigger pattern: Exact curl command format needed
  - Long-running commands: Must use tmux for the polling loop — total time is 20-30 min
  - Admin API: Auth header `X-Admin-Key: $ADMIN_API_KEY` required

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 10 runs reach Done status
    Tool: Bash (psql)
    Preconditions: 10 tasks triggered and waited ~3 min each
    Steps:
      1. For each task ID, run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, status FROM tasks WHERE id = '<task_id>';"
      2. Assert all 10 show status = 'Done'
    Expected Result: 10/10 Done
    Failure Indicators: Any task shows Failed, Executing, or other non-Done status
    Evidence: .sisyphus/evidence/task-3-status-check.txt

  Scenario: All 10 runs called post-message in delivery phase
    Tool: Bash (grep)
    Preconditions: All 10 tasks completed
    Steps:
      1. For each task ID (first 8 chars), run: grep -ci "post-message" /tmp/employee-delivery-<first8>.log
      2. Assert count >= 1 for ALL 10 tasks
      3. If any task shows 0, check full log and report the failure
    Expected Result: 10/10 have post-message calls in delivery logs
    Failure Indicators: Any task with 0 post-message calls
    Evidence: .sisyphus/evidence/task-3-post-message-check.txt

  Scenario: Summary table with per-task results
    Tool: Bash
    Preconditions: All checks completed
    Steps:
      1. Generate a markdown table: Task ID | Status | post-message count | Nudge fired?
      2. Save to evidence file
    Expected Result: Clean table showing 10/10 pass
    Failure Indicators: Any row showing failure
    Evidence: .sisyphus/evidence/task-3-results-table.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-status-check.txt — DB status for all 10 tasks
  - [ ] task-3-post-message-check.txt — post-message grep results for all 10 delivery logs
  - [ ] task-3-results-table.txt — summary table with all results

  **Commit**: NO (validation only — no code changes)

- [x] 4. Execution phase regression check

  **What to do**:
  1. Trigger 2 runs of `real-estate-motivation-bot-2` (simplest employee, no delivery phase, `approval_required: false`):
     ```bash
     source .env
     curl -s -X POST \
       "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
       -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq .task_id
     ```
  2. Wait ~60s for each, then verify status is `Done`
  3. This confirms the `options?.minElapsedMs ?? 30_000` default works correctly for the execution phase (no regression from adding the parameter)

  **Must NOT do**:
  - DO NOT modify any code
  - DO NOT trigger delivery-phase employees for this check

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple trigger + status check — 2 runs of a fast employee
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Recommended Test Employee: real-estate-motivation-bot-2" — exact trigger command and expected behavior

  **API/Type References**:
  - Trigger: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger`
  - Expected: completes in ~60s, status = Done

  **WHY Each Reference Matters**:
  - This employee is the simplest in the system — `approval_required: false`, completes in ~1 min. Perfect for regression checking.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Both motivation-bot runs reach Done
    Tool: Bash (curl + psql)
    Preconditions: Docker image rebuilt with fix, pnpm dev running
    Steps:
      1. Trigger run 1: curl POST trigger endpoint, capture task_id
      2. Wait 90s
      3. Check: psql -c "SELECT status FROM tasks WHERE id = '<task_id_1>';"
      4. Assert: status = 'Done'
      5. Trigger run 2: same command, capture task_id
      6. Wait 90s
      7. Check: psql -c "SELECT status FROM tasks WHERE id = '<task_id_2>';"
      8. Assert: status = 'Done'
    Expected Result: Both runs complete with Done status — execution phase not regressed
    Failure Indicators: Either run shows Failed or times out
    Evidence: .sisyphus/evidence/task-4-regression-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-regression-check.txt — both task IDs and their final status

  **Commit**: NO (validation only)

- [x] 5. Commit sisyphus artifacts and send telegram notification

  **What to do**:
  1. Run `git status` to check for any uncommitted changes
  2. Stage and commit sisyphus plan/notepad files:
     ```bash
     git add .sisyphus/plans/fix-delivery-nudge-timing.md .sisyphus/notepads/
     git commit -m "chore(sisyphus): add plans and notepads for fix-delivery-nudge-timing"
     ```
  3. Send telegram notification:
     ```bash
     tsx scripts/telegram-notify.ts "✅ fix-delivery-nudge-timing complete — All tasks done. Come back to review results."
     ```

  **Must NOT do**:
  - DO NOT use `--no-verify`
  - DO NOT add `Co-authored-by` lines
  - DO NOT reference AI tools in commit message
  - DO NOT push to remote unless user asks

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple git commit + notification command
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Overkill for a simple commit

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — after Tasks 3 & 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 3, Task 4

  **References**:

  **Pattern References**:
  - `AGENTS.md` § "Telegram Notifications" — `tsx scripts/telegram-notify.ts "message"`
  - `AGENTS.md` § "Git Cleanup on Plan Completion" — commit all `.sisyphus/` artifacts

  **WHY Each Reference Matters**:
  - Telegram: mandatory notification per AGENTS.md rule
  - Git cleanup: ensures no untracked sisyphus files remain

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Git clean after commit
    Tool: Bash
    Preconditions: All previous tasks complete
    Steps:
      1. Run: git status --short
      2. Assert: no untracked .sisyphus/ files
    Expected Result: Git working tree clean (or only gitignored files)
    Failure Indicators: Untracked .sisyphus/ files
    Evidence: .sisyphus/evidence/task-5-git-status.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: All validation passed
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ fix-delivery-nudge-timing complete — All tasks done. Come back to review results."
      2. Assert: exit code 0
    Expected Result: Notification sent successfully
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-5-telegram.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-git-status.txt — git status output
  - [ ] task-5-telegram.txt — telegram send output

  **Commit**: YES
  - Message: `chore(sisyphus): add plans and notepads for fix-delivery-nudge-timing`
  - Files: `.sisyphus/plans/fix-delivery-nudge-timing.md`, `.sisyphus/notepads/`
  - Pre-commit: none

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/fix-delivery-nudge-timing.md` end-to-end. For each "Must Have": verify implementation exists (read `src/workers/opencode-harness.mts`, check evidence files). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Review `src/workers/opencode-harness.mts` changes for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify the parameter default is correct (30000). Verify nudge message still includes `${submitOutputCmd}` interpolation.
      Output: `Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Trigger 1 additional `daily-real-estate-inspiration-2` run. Wait for completion. Check delivery log for `post-message` tool call. Verify Slack channel has the posted message. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Run `git diff HEAD~1` (or appropriate range). Verify changes are ONLY in `src/workers/opencode-harness.mts`. Verify no other files were modified. Check "Must NOT do" compliance: no changes to lines 356, 507, 722, no changes to `session-manager.ts` or `employee-lifecycle.ts`. Flag any unaccounted changes.
      Output: `Files changed [N] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                  | Files                                                                 | Pre-commit  |
| ------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------- |
| 1      | `fix(harness): increase delivery idle timeout and soften recovery nudge` | `src/workers/opencode-harness.mts`                                    | `pnpm lint` |
| 2      | `chore(sisyphus): add plans and notepads for fix-delivery-nudge-timing`  | `.sisyphus/plans/fix-delivery-nudge-timing.md`, `.sisyphus/notepads/` | —           |

---

## Success Criteria

### Verification Commands

```bash
# Verify code change
grep -n "minElapsedMs" src/workers/opencode-harness.mts
# Expected: parameter in function signature, 30000 default, 120000 at delivery call, 30000 at execution, 10000 at post-nudge

# Verify nudge message softened
grep -n "remaining" src/workers/opencode-harness.mts
# Expected: nudge message contains "remaining" or "finish" language, not "NOW"

# Verify Docker image rebuilt
docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
# Expected: timestamp after code change

# Verify 10/10 runs posted to Slack
ls .sisyphus/evidence/task-3-*.txt
# Expected: 10 evidence files, each showing post-message tool call in delivery logs
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] 10/10 consecutive runs posted to Slack
- [ ] Execution regression check passed (2 runs of motivation-bot)
- [ ] Docker image rebuilt
- [ ] Git clean — no untracked files
