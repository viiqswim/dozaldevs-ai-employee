# Output Variety: Platform-Level Entropy for Unique AI Employee Outputs

## TL;DR

> **Quick Summary**: Roll back domain-specific entropy hacks (channel dedup, category rotation) and replace with clean platform-level mechanisms: temperature 1.5 + date/epoch injection (already done). Then update the `daily-real-estate-inspiration-2` archetype instructions to include variety guidance at the correct layer.
>
> **Deliverables**:
>
> - Reverted commits `f197c6e` (category rotation) and `bb25d25` (channel dedup)
> - Temperature 1.5 injected into opencode.json for ALL employees
> - Archetype `daily-real-estate-inspiration-2` instructions updated with variety/anti-repetition guidance
> - 10 consecutive runs producing 10 unique quotes (verified)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (verify temp config) → Task 2 (revert) → Task 3 (temperature) → Task 5 (rebuild) → Task 6 (smoke) → Task 7 (10-run verification)

---

## Context

### Original Request

Fix output repetition in AI employees. 10 consecutive runs of `daily-real-estate-inspiration-2` must produce 10 completely unique quotes with zero overlap. Solution must be platform-level without injecting domain-specific behavioral instructions that break non-creative employees.

### Interview Summary

**Key Discussions**:

- Temperature 1.5 for ALL employees: user explicitly approved ("they're all going to be following those particular AI employees' instructions anyway")
- Domain-specific instructions (category rotation, channel dedup) belong in the archetype, NOT the harness
- The date+epoch injection (commit `2695071`) is platform-level and stays
- The `fetchRecentChannelContent()` function and category rotation are employee-specific and must be reverted from the harness
- Variety instructions should go directly into `daily-real-estate-inspiration-2`'s `instructions` field via `psql` UPDATE

**Research Findings**:

- OpenCode supports `temperature` via `agent.build.temperature` in opencode.json (found in AgentConfig type)
- OpenRouter supports temperature 0.0-2.0, defaults to 1.0
- The exact config key path needs verification against OpenCode 1.14.31 (Metis-identified risk)
- `promptAsync` does NOT accept per-call temperature — must be set in config

### Metis Review

**Identified Gaps** (addressed):

- Temperature config key verification: Added as explicit Task 1 (must confirm before implementing)
- Risk of temperature 1.5 causing incoherence in complex employees: Acceptable per user decision — instructions constrain behavior regardless of temperature
- Channel dedup losing dedup capability: Moved to archetype instructions instead (tell the model to vary output)
- No rollback plan if 10/10 fails: Will iterate with additional changes if needed (Task 8)

---

## Work Objectives

### Core Objective

Achieve 10 consecutive runs of `daily-real-estate-inspiration-2` with 10 unique quotes, using only platform-level mechanisms (temperature + date injection) plus archetype-level variety instructions.

### Concrete Deliverables

- Harness code: `fetchRecentChannelContent()` removed, category rotation removed, date+epoch kept
- OpenCode config: temperature 1.5 for all employees
- Archetype DB update: variety instructions in `daily-real-estate-inspiration-2`
- Evidence: 10 unique Slack posts from 10 consecutive runs

### Definition of Done

- [ ] `git log --oneline -5` shows revert commits for `f197c6e` and `bb25d25`
- [ ] Temperature 1.5 present in harness's `writeOpencodeAuth()` output
- [ ] `daily-real-estate-inspiration-2` instructions include variety/anti-repetition guidance
- [ ] 10 consecutive runs produce 10 unique quotes (verified via Slack channel)

### Must Have

- Platform-wide temperature 1.5 for all employees
- Date+epoch injection remains (commit `2695071`)
- Archetype-level variety instructions for the inspiration bot
- Clean revert of employee-specific hacks from harness

### Must NOT Have (Guardrails)

- NO domain-specific behavioral instructions in the harness (no "quote category", no "DO NOT repeat")
- NO modifications to `agents-md-resolver.mts`, `archetype-generator.ts`, `submit-output.ts`, or `output-schema.mts`
- NO `--no-verify` on any git commit
- NO `Co-authored-by` lines in commits
- NO AI/claude references in commit messages
- NO unit test runs (known timeout issue)
- NO changes to existing employees other than `daily-real-estate-inspiration-2`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO (known timeout issues — user explicitly said skip unit tests)
- **Framework**: N/A — skip all unit tests

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — trigger tasks, verify DB state
- **Config verification**: Use Bash — read generated files, grep for expected content

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — verify + revert + implement):
├── Task 1: Verify OpenCode temperature config key [quick]
├── Task 2: Revert category rotation + channel dedup [quick]
├── Task 3: Add temperature 1.5 to opencode.json [quick]
├── Task 4: Update archetype instructions in DB [quick]

Wave 2 (Verification — sequential):
├── Task 5: Rebuild Docker image (depends: 2, 3) [quick]
├── Task 6: Smoke test single run (depends: 4, 5) [quick]
├── Task 7: 10-run verification (depends: 6) [deep]
├── Task 8: Iterate if not 10/10 unique (depends: 7, conditional) [deep]
├── Task 9: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — verify Slack channel (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On      | Blocks |
| ---- | --------------- | ------ |
| 1    | -               | 3      |
| 2    | -               | 5      |
| 3    | 1               | 5      |
| 4    | -               | 6      |
| 5    | 2, 3            | 6      |
| 6    | 4, 5            | 7      |
| 7    | 6               | 8, 9   |
| 8    | 7 (conditional) | 9      |
| 9    | 7 or 8          | -      |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: 5 tasks — T5 → `quick`, T6 → `deep`, T7 → `deep`, T8 → `deep` (conditional), T9 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Verify OpenCode temperature config key for v1.14.31

  **What to do**:
  - Read the OpenCode source (installed at `node_modules/.pnpm/opencode@1.14.31/node_modules/opencode/` or wherever the binary resolves) to confirm the exact JSON path for temperature configuration
  - Specifically verify: does `agent.build.temperature` work, or is it `agent.default.temperature`, or some other path?
  - Check the OpenCode config schema/types for the `AgentConfig` type definition
  - If the binary is compiled and source isn't readable, check the OpenCode GitHub repo at tag v1.14.31 for the config schema
  - If neither works, create a minimal test: write an opencode.json with `{ "agent": { "build": { "temperature": 1.5 } } }` and check if OpenCode logs/applies it
  - Document the EXACT config key path that works

  **Must NOT do**:
  - Do not modify any source files
  - Do not upgrade OpenCode version

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure investigation — read files and docs, no implementation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:312-355` — `writeOpencodeAuth()` where opencode.json is written (lines 327-335 specifically)
  - `src/workers/config/opencode.json` — Static config reference

  **API/Type References**:
  - Previous explore session found `AgentConfig` type with `temperature` and `top_p` fields in OpenCode SDK
  - OpenCode is pinned to 1.14.31 — check `package.json` for exact resolution

  **External References**:
  - OpenCode GitHub: https://github.com/nicepkg/opencode (check config schema)
  - OpenRouter API: temperature range 0.0-2.0

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Confirm temperature config key is valid
    Tool: Bash
    Preconditions: OpenCode 1.14.31 installed in project
    Steps:
      1. Search for AgentConfig or temperature in OpenCode source/types
      2. Find the exact JSON path that maps to LLM temperature
      3. Document the path (e.g., "agent.build.temperature" or "agent.default.temperature")
    Expected Result: A verified config key path string that OpenCode will read and pass to the LLM provider
    Failure Indicators: No temperature config found in OpenCode schema, or multiple conflicting paths
    Evidence: .sisyphus/evidence/task-1-temperature-config-key.md
  ```

  **Commit**: NO (investigation only)

- [x] 2. Revert category rotation and channel dedup from harness

  **What to do**:
  - Revert commit `f197c6e` (category rotation) — use `git revert f197c6e --no-edit`
  - Revert commit `bb25d25` (channel dedup) — use `git revert bb25d25 --no-edit`
  - Revert in newest-first order: `f197c6e` first, then `bb25d25`
  - After both reverts, verify `src/workers/opencode-harness.mts` no longer contains:
    - `fetchRecentChannelContent` function (lines 246-310)
    - `categories` array (lines 1018-1039)
    - `QUOTE CATEGORY` text
    - `dedupBlock` variable
    - `recentContent` variable
  - The date+epoch injection (lines 993-1013 area) MUST remain intact — do NOT revert commit `2695071`
  - If revert creates merge conflicts (unlikely since commits are sequential), resolve by manually removing the employee-specific code while keeping date+epoch

  **Must NOT do**:
  - Do NOT revert commit `2695071` (date+epoch injection)
  - Do NOT use `--no-verify`
  - Do NOT modify any other files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple git reverts — mechanical, no judgment needed
  - **Skills**: [`git-master`]
    - `git-master`: Git revert operations
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 1 and Task 4)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:246-310` — `fetchRecentChannelContent()` function to be removed
  - `src/workers/opencode-harness.mts:1015-1058` — Category rotation + dedup block to be removed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify employee-specific code fully removed
    Tool: Bash
    Preconditions: Both reverts applied
    Steps:
      1. grep -c "fetchRecentChannelContent" src/workers/opencode-harness.mts
      2. grep -c "QUOTE CATEGORY" src/workers/opencode-harness.mts
      3. grep -c "dedupBlock" src/workers/opencode-harness.mts
      4. grep -c "categories" src/workers/opencode-harness.mts (should be 0 matches for the array)
    Expected Result: All grep counts return 0 — none of these strings exist in the file
    Failure Indicators: Any grep count > 0
    Evidence: .sisyphus/evidence/task-2-revert-verification.txt

  Scenario: Verify date+epoch injection preserved
    Tool: Bash
    Preconditions: Both reverts applied
    Steps:
      1. grep -c "EPOCH_MS" src/workers/opencode-harness.mts
      2. grep -c "dateStr" src/workers/opencode-harness.mts
    Expected Result: Both return > 0 — date+epoch code is still present
    Failure Indicators: Either returns 0
    Evidence: .sisyphus/evidence/task-2-date-epoch-preserved.txt
  ```

  **Commit**: YES (two revert commits created by `git revert`)

- [x] 3. Add temperature 1.5 to opencode.json config for all employees

  **What to do**:
  - Using the verified config key from Task 1, modify `writeOpencodeAuth()` in `src/workers/opencode-harness.mts`
  - In the workspace config write (lines 327-335), add temperature to the JSON object
  - The expected change is something like:
    ```typescript
    const configJson = JSON.stringify(
      {
        agent: { build: { temperature: 1.5 } }, // or whatever key Task 1 found
        permission: { '*': 'allow', question: 'deny' },
        autoupdate: false,
      },
      null,
      2,
    );
    ```
  - If Task 1 found that the key is different (e.g., `provider.temperature`), use that instead
  - Add a log line: `log.info('[opencode-harness] Temperature set to 1.5 for all employees');`
  - Do NOT modify the global config write (lines 339-343) — temperature only needs to be in workspace config

  **Must NOT do**:
  - Do not set temperature per-call in `promptAsync` (not supported)
  - Do not modify global config at `~/.config/opencode/opencode.json`
  - Do not use `--no-verify`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file edit, ~5 lines changed
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 for config key)
  - **Parallel Group**: Wave 1 (after Task 1 completes)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:327-335` — Workspace opencode.json write location (the EXACT code to modify)

  **API/Type References**:
  - Task 1 evidence file for verified config key path

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify temperature in config write
    Tool: Bash
    Preconditions: Task 3 code changes applied
    Steps:
      1. grep -n "temperature" src/workers/opencode-harness.mts
      2. grep -n "1.5" src/workers/opencode-harness.mts
    Expected Result: At least one line showing temperature: 1.5 in the configJson construction
    Failure Indicators: No match for temperature or 1.5
    Evidence: .sisyphus/evidence/task-3-temperature-in-source.txt

  Scenario: Verify TypeScript compiles
    Tool: Bash
    Preconditions: Changes applied
    Steps:
      1. npx tsc --noEmit --pretty 2>&1 | head -20
    Expected Result: No errors related to opencode-harness.mts
    Failure Indicators: TypeScript compilation errors in the modified file
    Evidence: .sisyphus/evidence/task-3-tsc-check.txt
  ```

  **Commit**: YES
  - Message: `feat(harness): set platform-wide temperature 1.5 for all employees`
  - Files: `src/workers/opencode-harness.mts`

- [x] 4. Update `daily-real-estate-inspiration-2` archetype instructions in DB

  **What to do**:
  - Run a `psql` UPDATE to replace the `instructions` field for archetype `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
  - New instructions should include variety/anti-repetition guidance AT THE ARCHETYPE LEVEL:
    - Rotate through diverse categories (ancient philosophy, sports, science, arts, military strategy, etc.)
    - Prefer obscure, lesser-known quotes over famous ones
    - Never repeat a quote you've used before — always choose something fresh
    - Vary the structure and tone of the message each time
  - Keep the existing core instructions intact (select inspirational quote, personalize for real estate, post to Slack)
  - Keep the submit-output instruction at the end
  - The exact SQL:
    ```sql
    UPDATE archetypes SET instructions = '...' WHERE id = '3b07ec63-207f-4f2b-a8c3-c17f08bc508f';
    ```
  - Verify with a SELECT after the UPDATE

  **Must NOT do**:
  - Do not modify `prisma/seed.ts` (this archetype is NOT in seed)
  - Do not modify any code files for this task
  - Do not add instructions that reference platform internals (EPOCH_MS, temperature, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL statement
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Not creating a new archetype, just updating instructions

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Tasks 1, 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - Current instructions: `"Each day, select an inspirational business quote and personalize it for the real estate investment and short-term rental community. Relate the quote to themes like property renovation, entrepreneurship, resilience, or growth in real estate. Compose an encouraging message that ties the quote directly to the team's current efforts in the real estate space. Include at least one specific, actionable insight about how the quote applies to real estate professionals today. Post the complete personalized message to Slack. After posting, you MUST call: tsx /tools/platform/submit-output.ts --summary \"Posted daily inspiration to Slack\" --classification \"NO_ACTION_NEEDED\""`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify instructions updated in DB
    Tool: Bash
    Preconditions: UPDATE statement executed
    Steps:
      1. docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT instructions FROM archetypes WHERE id = '3b07ec63-207f-4f2b-a8c3-c17f08bc508f';"
      2. Check output contains variety-related keywords: "obscure", "category", "never repeat"
    Expected Result: Instructions include variety guidance AND original core instructions AND submit-output command
    Failure Indicators: Instructions missing variety guidance or missing submit-output command
    Evidence: .sisyphus/evidence/task-4-archetype-instructions.txt

  Scenario: Verify submit-output instruction preserved
    Tool: Bash
    Preconditions: UPDATE executed
    Steps:
      1. docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT instructions FROM archetypes WHERE id = '3b07ec63-207f-4f2b-a8c3-c17f08bc508f';" | grep -c "submit-output"
    Expected Result: Count ≥ 1 — submit-output instruction is present
    Failure Indicators: Count = 0
    Evidence: .sisyphus/evidence/task-4-submit-output-preserved.txt
  ```

  **Commit**: NO (DB-only change, no code)

- [x] 5. Rebuild Docker image

  **What to do**:
  - Run `docker build -t ai-employee-worker:latest .` in a tmux session (long-running)
  - Wait for build to complete successfully
  - Kill the tmux session after build completes

  **Must NOT do**:
  - Do not skip the build — worker changes require rebuild
  - Do not leave the tmux session alive after completion

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command, wait for completion
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `Dockerfile` — Build context
  - AGENTS.md § "CRITICAL — Rebuild after every worker change"

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux)
    Preconditions: Tasks 2 and 3 committed
    Steps:
      1. tmux new-session -d -s ai-build -x 220 -y 50
      2. tmux send-keys -t ai-build "docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo EXIT_CODE:$? >> /tmp/ai-build.log" Enter
      3. Poll: grep "EXIT_CODE:" /tmp/ai-build.log
      4. Verify EXIT_CODE:0
      5. tmux kill-session -t ai-build
    Expected Result: Build completes with EXIT_CODE:0
    Failure Indicators: Non-zero exit code, TypeScript compilation errors in build output
    Evidence: .sisyphus/evidence/task-5-docker-build.txt (last 30 lines of build log)
  ```

  **Commit**: NO (build artifact, not source)

- [x] 6. Smoke test — single run

  **What to do**:
  - Ensure `pnpm dev` is running (gateway + Inngest + Docker)
  - Trigger a single task for `daily-real-estate-inspiration-2`:
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{}' | jq '{task_id: .task_id}'
    ```
  - Wait ~90 seconds for completion
  - Verify task reached `Done` status
  - Verify a Slack message was posted to channel `C0960S2Q8RL`
  - This confirms the reverts + temperature change didn't break anything

  **Must NOT do**:
  - Do not proceed to 10-run test if smoke test fails
  - Do not modify code during this task

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Needs to trigger, wait, poll status, verify Slack output — multi-step
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - AGENTS.md § "Recommended Test Employee" — trigger pattern (adapt for `daily-real-estate-inspiration-2`)
  - AGENTS.md § Admin API — `POST /admin/tenants/:tenantId/employees/:slug/trigger`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Single run completes successfully
    Tool: Bash (curl + psql)
    Preconditions: Docker image rebuilt, dev services running, archetype instructions updated
    Steps:
      1. Trigger task via curl (see command above)
      2. Capture task_id from response
      3. Wait 90 seconds
      4. Check task status: docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '<task_id>';"
      5. Expected: status = 'Done'
    Expected Result: Task reaches Done status within 90 seconds
    Failure Indicators: Task stuck in Executing, Failed, or any non-Done state
    Evidence: .sisyphus/evidence/task-6-smoke-test.txt

  Scenario: Slack message posted
    Tool: Bash (curl Slack API)
    Preconditions: Task completed
    Steps:
      1. Fetch recent messages from channel C0960S2Q8RL using Slack API
      2. Verify a new message was posted within the last 2 minutes
    Expected Result: At least one new message in the channel
    Failure Indicators: No new messages, or message is an error/status update rather than content
    Evidence: .sisyphus/evidence/task-6-slack-message.txt
  ```

  **Commit**: NO (verification only)

- [x] 7. 10-run verification — trigger 10 consecutive tasks

  **What to do**:
  - Trigger 10 consecutive tasks for `daily-real-estate-inspiration-2`, waiting for each to complete before triggering the next
  - For each run:
    1. Trigger via curl
    2. Wait for `Done` status (poll every 15 seconds, timeout 120 seconds)
    3. Record the task_id and the first line of the Slack post
  - After all 10 complete, compare all first lines for uniqueness
  - A "unique" quote means: no two first lines share the same quote text (minor formatting differences are OK)
  - Record results in a summary table: run #, task_id, first line of quote, unique? (Y/N)
  - If ALL 10 are unique → Task passes
  - If ANY duplicates → Task fails, proceed to Task 8

  **Must NOT do**:
  - Do not trigger runs in parallel (sequential only — we're testing consecutive uniqueness)
  - Do not modify code during this task
  - Do not mark as passed if fewer than 10/10 are unique

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Long-running, multi-step, needs judgment to compare quotes for uniqueness
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after Task 6)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - Task 6 trigger command (reuse for all 10 runs)
  - Slack API: `conversations.history` + `conversations.replies` to read posted content

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 10 consecutive runs produce 10 unique quotes
    Tool: Bash (curl + psql + Slack API)
    Preconditions: Smoke test passed (Task 6)
    Steps:
      1. For i in 1..10:
         a. curl trigger → capture task_id
         b. Poll status every 15s until Done (timeout 120s)
         c. Fetch Slack thread reply → extract first line (the quote)
         d. Record: run#, task_id, quote first line
      2. Compare all 10 first lines for duplicates
      3. Build summary table
    Expected Result: 10/10 unique quotes, zero duplicates
    Failure Indicators: Any two runs share the same quote text
    Evidence: .sisyphus/evidence/task-7-10-run-results.md (table with all 10 results)

  Scenario: All 10 tasks reach Done status
    Tool: Bash (psql)
    Steps:
      1. For each of the 10 task_ids, verify status = 'Done'
    Expected Result: All 10 tasks have status 'Done'
    Failure Indicators: Any task in Failed or stuck state
    Evidence: .sisyphus/evidence/task-7-all-tasks-done.txt
  ```

  **Commit**: NO (verification only)

- [x] 8. Iterate if not 10/10 unique (CONDITIONAL — only if Task 7 fails)

  **What to do**:
  - This task only executes if Task 7 found duplicates
  - Analyze the duplicate patterns:
    - Are duplicates from adjacent runs (prompt caching)?
    - Are duplicates the same famous quote (low entropy)?
    - Are duplicates from runs that happened very close in time (epoch collision)?
  - Based on analysis, apply additional fixes:
    - If model is too deterministic even at 1.5: try temperature 2.0
    - If quotes are all from the same "famous" pool: strengthen archetype instructions to demand obscure sources
    - If dedup is needed: add lightweight per-run random seed to preamble (e.g., `RUN_SEED: ${Math.random().toString(36).substring(7)}`)
  - After fixes, rebuild Docker image and re-run 10-run test
  - Continue iterating until 10/10 unique

  **Must NOT do**:
  - Do not add employee-specific instructions to the harness
  - Do not add `fetchRecentChannelContent()` back
  - Keep any changes platform-level (temperature, random seed) or archetype-level (instructions)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires analysis, judgment, and iterative problem-solving
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, conditional)
  - **Blocks**: Task 9
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - Task 7 evidence file (duplicate analysis)
  - `src/workers/opencode-harness.mts:327-335` — temperature config location
  - `src/workers/opencode-harness.mts:993-1013` — date+epoch injection (can add random seed nearby)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Re-run 10 consecutive tasks after fix
    Tool: Bash (same as Task 7)
    Preconditions: Iterative fix applied, Docker rebuilt
    Steps:
      1. Same as Task 7 — trigger 10 runs, capture quotes, compare
    Expected Result: 10/10 unique quotes
    Failure Indicators: Still seeing duplicates — continue iterating
    Evidence: .sisyphus/evidence/task-8-iteration-results.md
  ```

  **Commit**: YES (if code changes were needed)
  - Message: depends on what fix was applied

- [x] 9. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ output-variety-entropy complete — 10/10 unique quotes achieved. Come back to review results."`

  **Must NOT do**:
  - Do not skip this step

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (final task)
  - **Blocks**: None
  - **Blocked By**: Task 7 (or Task 8 if it ran)

  **References**:

  **Pattern References**:
  - AGENTS.md § "Prometheus Planning — Telegram Notifications"
  - `scripts/telegram-notify.ts`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "✅ output-variety-entropy complete — 10/10 unique quotes achieved. Come back to review results."
      2. Verify exit code 0
    Expected Result: Message sent successfully
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-9-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter (no tests — known timeout). Review all changed files for: `as any`, empty catches, console.log in prod, commented-out code. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real QA — Slack Channel Verification** — `unspecified-high`
      Read the last 10 posts in Slack channel `C0960S2Q8RL` (VLRE). Verify all 10 are unique quotes with zero overlap. Compare first lines of each post for duplicate detection.
      Output: `Unique Posts [N/10] | Duplicates Found [list or NONE] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", verify actual implementation matches. Check that NO employee-specific instructions leaked into `opencode-harness.mts`. Verify `fetchRecentChannelContent()` is fully removed. Verify category rotation is fully removed.
      Output: `Tasks [N/N compliant] | Harness Clean [YES/NO] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                    | Files                              |
| ---- | --------------------------------------------------------------------------------- | ---------------------------------- |
| 2    | `revert(harness): remove channel dedup and category rotation (employee-specific)` | `src/workers/opencode-harness.mts` |
| 3    | `feat(harness): set platform-wide temperature 1.5 for all employees`              | `src/workers/opencode-harness.mts` |
| 4    | N/A (DB update, no code commit)                                                   | -                                  |

---

## Success Criteria

### Verification Commands

```bash
# Temperature in config
docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT 1;"  # DB accessible
grep -n "temperature" src/workers/opencode-harness.mts  # Expected: temperature: 1.5

# Archetype instructions updated
docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT instructions FROM archetypes WHERE id = '3b07ec63-207f-4f2b-a8c3-c17f08bc508f';"

# 10 unique posts in Slack channel (manual verification via Slack API)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] 10/10 unique quotes achieved
- [ ] `git status` clean
- [ ] Docker image rebuilt with all changes
