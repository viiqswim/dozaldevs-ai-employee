# Fix and Test GitHub Code Engineer Employees

## TL;DR

> **Quick Summary**: Fix 4 bugs blocking the GitHub Code Engineer employees (trigger_payload harness bug, DozalDevs hardcoded PAT, VLRE missing delivery_steps, doc mismatch), rebuild Docker, then trigger a trivial test task ("add a comment to README") on both archetypes to verify end-to-end PR creation.
>
> **Deliverables**:
>
> - Fixed harness prompt injection (trigger_payload → raw_event.inputs)
> - DozalDevs `engineer` archetype using GitHub App tokens instead of hardcoded PAT
> - VLRE `github-code-engineer` archetype with delivery_steps added
> - Corrected engineer employee documentation
> - Successful PR submitted from at least one archetype
>
> **Estimated Effort**: Medium (3-5 hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (harness fix) → T5 (Docker rebuild) → T6 (E2E test DozalDevs) → T7 (E2E test VLRE)

---

## Context

### Original Request

User wants to test the GitHub Code Engineer employee. Both DozalDevs and VLRE tenants have engineer archetypes, but neither works due to multiple bugs. The model was changed to `xiaomi/mimo-v2.5-pro` — user wants to keep it despite AGENTS.md warning about tool-calling reliability.

### Interview Summary

**Key Discussions**:

- Both archetypes have different problems: DozalDevs uses a hardcoded PAT and missing `get-token.ts`, VLRE missing `delivery_steps`
- Critical harness bug: `task.trigger_payload` reads a non-existent DB column — should be `task.raw_event`
- The `raw_event` structure is `{ inputs: { prompt: "..." } }` but `injectAssignmentSection` expects `{ prompt: "..." }` — need to unwrap the `inputs` envelope
- User chose to keep Mimo v2.5 Pro model and test both archetypes
- Test task: "Add a one-line comment to the top of README.md"

**Research Findings**:

- `injectAssignmentSection(instructions, triggerPayload)` calls `extractTriggerPrompt(triggerPayload)` which looks for `.prompt` at the top level
- Stored `raw_event` for triggered tasks: `{ inputs: { prompt: "..." } }` — `.prompt` is nested under `.inputs`
- The lifecycle separately injects `INPUT_PROMPT` env var — but this is independent of the `## Your Assignment` prompt injection path
- DozalDevs execution_steps have a PAT (`ghp_nbGTEq...`) hardcoded inline — also hardcoded branch name `ai/engineer-task` (not per-task)
- VLRE execution_steps are well-written: uses `get-token.ts`, per-task branches with `$TASK_ID`
- VLRE has `delivery_instructions` (274 chars) but no `delivery_steps` — delivery container will fire but won't have task-specific steps in compiled AGENTS.md

### Metis Review

**Identified Gaps** (addressed):

- The harness fix needs TWO layers: (1) `trigger_payload` → `raw_event`, (2) unwrap `inputs` envelope so `extractTriggerPrompt` finds `.prompt` — addressed in T1 with correct unwrapping
- The trigger API body format discrepancy (doc says `{ prompt }`, schema says `{ inputs: { prompt } }`) — addressed in T4 (doc fix)
- VLRE `delivery_instructions` IS present (274 chars) — confirmed, delivery will fire — only `delivery_steps` needs adding (T3)
- DozalDevs execution_steps have hardcoded PAT AND hardcoded branch name — both need fixing (T2)
- Docker rebuild is required after harness code change — explicit task (T5)
- Mimo model risk acknowledged — user chose to keep it; if task fails with 0 tokens, the model is the likely culprit

---

## Work Objectives

### Core Objective

Fix all bugs preventing the GitHub Code Engineer from working, then verify end-to-end by triggering both archetypes with a trivial task and confirming a PR is created.

### Concrete Deliverables

- `src/workers/opencode-harness.mts` — fixed trigger payload injection
- DozalDevs `engineer` archetype — updated tool_registry + execution_steps + worker_env (DB update)
- VLRE `github-code-engineer` archetype — delivery_steps added (DB update)
- `docs/employees/2026-06-02-1230-engineer.md` — corrected trigger format
- At least one successful PR on a test repo

### Definition of Done

- [ ] Harness correctly injects `## Your Assignment` section from trigger prompt
- [ ] DozalDevs `engineer` uses GitHub App token (not hardcoded PAT)
- [ ] DozalDevs `engineer` creates per-task branches (not hardcoded `ai/engineer-task`)
- [ ] VLRE `github-code-engineer` has delivery_steps
- [ ] Engineer employee doc shows correct trigger format
- [ ] Docker image rebuilt with harness fix
- [ ] At least one archetype completes a test task and creates a PR

### Must Have

- Harness reads `task.raw_event?.inputs` (not `task.trigger_payload`)
- `extractTriggerPrompt` receives unwrapped payload with `.prompt` at top level
- DozalDevs tool_registry includes `/tools/github/get-token.ts`
- DozalDevs worker_env does NOT contain hardcoded PAT
- DozalDevs execution_steps use `get-token.ts` pattern (like VLRE)
- DozalDevs execution_steps use per-task branches with `$TASK_ID`
- VLRE delivery_steps is non-null

### Must NOT Have (Guardrails)

- NO changes to `extractTriggerPrompt` or `injectAssignmentSection` function signatures — only change what's passed to them
- NO model changes — keep `xiaomi/mimo-v2.5-pro` on both archetypes
- NO changes to the trigger route Zod schema (the `inputs` wrapper is the correct pattern)
- NO changes to the lifecycle INPUT\_\* env var injection (that path works fine independently)
- NO removal of the hardcoded PAT from `.env` or environment — only from the archetype's `worker_env` and `execution_steps` fields
- NO modifications to `src/workers/lib/trigger-payload.mts` — the functions are correct, only the caller needs fixing

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests after — update existing harness prompt tests)
- **Framework**: Vitest

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Harness code**: Run existing tests + add new test for `raw_event.inputs` unwrapping
- **DB updates**: psql queries to verify archetype state
- **E2E**: curl trigger → monitor container → verify PR created on GitHub

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all fixes in parallel):
├── Task 1: Fix harness trigger_payload → raw_event.inputs [quick]
├── Task 2: Fix DozalDevs engineer archetype (DB: tool_registry, worker_env, execution_steps) [unspecified-high]
├── Task 3: Fix VLRE engineer archetype (DB: add delivery_steps) [quick]
└── Task 4: Fix engineer employee documentation [quick]

Wave 2 (After Wave 1 — rebuild + test):
├── Task 5: Rebuild Docker image [quick]
├── Task 6: E2E test DozalDevs engineer (trigger → PR) [unspecified-high]
├── Task 7: E2E test VLRE engineer (trigger → PR) [unspecified-high]
├── Task 8: Update AGENTS.md with findings [quick]
└── Task 9: Notify completion [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks  |
| ---- | ---------- | ------- |
| 1    | —          | 5, 6, 7 |
| 2    | —          | 5, 6    |
| 3    | —          | 5, 7    |
| 4    | —          | 8       |
| 5    | 1, 2, 3    | 6, 7    |
| 6    | 5          | 8       |
| 7    | 5          | 8       |
| 8    | 6, 7       | F1-F4   |
| 9    | F1-F4      | —       |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **5 tasks** — T5 → `quick`, T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `quick`, T9 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix harness trigger_payload → raw_event.inputs unwrapping

  **What to do**:
  - In `src/workers/opencode-harness.mts` at line 990, change:
    ```typescript
    const finalInstructions = injectAssignmentSection(resolvedInstructions, task.trigger_payload);
    ```
    to:
    ```typescript
    const rawEvent = task.raw_event as Record<string, unknown> | null | undefined;
    const triggerPayload =
      rawEvent && typeof rawEvent === 'object' && 'inputs' in rawEvent ? rawEvent.inputs : rawEvent;
    const finalInstructions = injectAssignmentSection(resolvedInstructions, triggerPayload);
    ```
  - This unwraps the `inputs` envelope so `extractTriggerPrompt` finds `.prompt` at the top level
  - The fallback to `rawEvent` handles legacy tasks where `raw_event` IS the payload directly (e.g. webhook events with `property_uid`, `lead_uid`)
  - Update the log message at line 994 to say `raw_event.inputs.prompt` instead of `trigger_payload.prompt`
  - Add a new test in `src/workers/__tests__/opencode-harness-prompt.test.ts`:
    - Test: `extractTriggerPrompt` with `{ inputs: { prompt: "test" } }` → should NOT return "test" (function itself is unchanged — this validates the harness unwrapping is needed)
    - Test: `extractTriggerPrompt` with `{ prompt: "test" }` → returns "test" (confirms the unwrapping produces the right shape)

  **Must NOT do**:
  - Do NOT modify `src/workers/lib/trigger-payload.mts` — the functions are correct
  - Do NOT change the `TaskRow` interface — `raw_event` is already defined as `unknown`
  - Do NOT change the trigger route Zod schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file code change (~5 lines) + one test addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5 (Docker rebuild)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:990` — Current line reading `task.trigger_payload` — this is the line to change
  - `src/workers/lib/trigger-payload.mts:1-16` — `extractTriggerPrompt` and `injectAssignmentSection` functions — DO NOT MODIFY, just understand they expect `{ prompt: "..." }` at top level
  - `src/workers/lib/task-context.ts:45` — `raw_event?: unknown` in `TaskRow` interface — confirms `raw_event` exists on the type

  **Test References**:
  - `src/workers/__tests__/opencode-harness-prompt.test.ts` — Existing tests for `extractTriggerPrompt` and `injectAssignmentSection` — add new tests here

  **WHY Each Reference Matters**:
  - Line 990 is the exact bug site — the only code change happens here
  - `trigger-payload.mts` shows what shape the function expects (top-level `.prompt`)
  - `task-context.ts` confirms the type definition already has `raw_event`

  **Acceptance Criteria**:
  - [ ] `task.trigger_payload` no longer appears in opencode-harness.mts
  - [ ] Harness reads `task.raw_event` and unwraps `.inputs` if present
  - [ ] Legacy `raw_event` without `inputs` wrapper still works (webhook events)
  - [ ] Log message updated to reference `raw_event.inputs.prompt`
  - [ ] New test(s) added and passing
  - [ ] `pnpm test -- --run src/workers/__tests__/opencode-harness-prompt.test.ts` passes
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Harness prompt injection works with inputs wrapper
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run src/workers/__tests__/opencode-harness-prompt.test.ts`
      2. Verify all tests pass including new test for inputs unwrapping
    Expected Result: All tests pass, 0 failures
    Evidence: .sisyphus/evidence/task-1-harness-tests.txt

  Scenario: Build succeeds
    Tool: Bash
    Steps:
      1. Run `pnpm build`
    Expected Result: Exit code 0, no TypeScript errors
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES
  - Message: `fix(harness): read trigger prompt from raw_event.inputs instead of trigger_payload`
  - Files: `src/workers/opencode-harness.mts`, `src/workers/__tests__/opencode-harness-prompt.test.ts`

- [x] 2. Fix DozalDevs `engineer` archetype (DB update)

  **What to do**:
  - Update the DozalDevs `engineer` archetype (ID: `ad3531f5-080d-4fd3-a201-5f1c50c67f81`) via psql:
    1. **tool_registry**: Add `/tools/github/get-token.ts` to the tools array. New value: `{"tools": ["/tools/platform/submit-output.ts", "/tools/slack/post-message.ts", "/tools/github/get-token.ts"]}`
    2. **worker_env**: Remove the hardcoded PAT keys (`GH_TOKEN`, `GITHUB_TOKEN`). Keep only `GITHUB_REPO_URL`. New value: `{"GITHUB_REPO_URL": "https://github.com/viiqswim/dozaldevs-ai-employee"}`
    3. **execution_steps**: Replace the current hardcoded-PAT execution steps with a version modeled after the VLRE archetype's steps (which correctly uses `get-token.ts`, per-task branches, etc.). Adapt for the DozalDevs repo URL and pnpm toolchain.

  The new execution_steps should be:

  ```
  **IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<delivery-instructions>` — that section is for a separate container. STOP after step 12.**

  1. Get the GitHub token: `tsx /tools/github/get-token.ts` (writes token to /tmp/github-token).
  2. Set git config:
     git config --global user.email "ai-employee@dozaldevs.com"
     git config --global user.name "AI Employee"
  3. Clone the repo: `git clone --depth=1 "https://x-access-token:$(cat /tmp/github-token)@github.com/viiqswim/dozaldevs-ai-employee.git" /tmp/workspace/repo`.
  4. Navigate to the repo and create a per-task branch: `cd /tmp/workspace/repo && git checkout -b "ai/$(echo $TASK_ID | cut -c1-8)-engineer"`.
  5. Read the "## Your Assignment" section in the initial prompt to understand what to implement.
  6. Implement the required changes in /tmp/workspace/repo.
  7. Install dependencies: `cd /tmp/workspace/repo && pnpm install --ignore-scripts && npx prisma generate`
  8. Build: `cd /tmp/workspace/repo && pnpm build`
  9. Run tests: `cd /tmp/workspace/repo && pnpm test -- --run 2>&1 | tail -20`
     (4 pre-existing failures expected: get-properties.test.ts x1, notion/get-page.test.ts x3)
  10. Commit: `cd /tmp/workspace/repo && git add -A && git commit -m "feat: implement assigned task"`
  11. Push: `cd /tmp/workspace/repo && git push origin HEAD`
  12. Create PR and submit:
      cd /tmp/workspace/repo
      GH_TOKEN=$(cat /tmp/github-token) gh pr create --title "AI Task: $(echo $TASK_ID | cut -c1-8)" --body "Implements assigned task. Task ID: $TASK_ID" 2>&1
      Save the PR URL from the output.
      echo "<PR_URL>" > /tmp/summary.txt
      tsx /tools/platform/submit-output.ts --summary "PR created: <PR_URL>" --classification "NEEDS_APPROVAL" --draft-file /tmp/summary.txt

  **STOP. Do nothing else. Your job is done.**
  ```

  - Execute the UPDATE statement via psql

  **Must NOT do**:
  - Do NOT change the model (keep `xiaomi/mimo-v2.5-pro`)
  - Do NOT modify any source code files — this is DB-only
  - Do NOT delete the archetype row

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex DB update with multi-field JSON — needs careful SQL escaping and verification
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers archetype schema fields, tool_registry format, execution_steps best practices

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5 (Docker rebuild), Task 6 (E2E test)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - VLRE execution_steps (query: `SELECT execution_steps FROM archetypes WHERE id = 'db2974dc-ab37-4034-9ce2-1c7b91e424b5'`) — The gold standard for engineer execution_steps. Uses `get-token.ts`, per-task branches, proper structure.
  - `docs/employees/2026-06-02-1230-engineer.md:1-4` — Shows the expected execution flow including `get-token.ts` → clone → branch → implement → test → PR

  **Acceptance Criteria**:
  - [ ] tool_registry includes `/tools/github/get-token.ts`
  - [ ] worker_env does NOT contain `GH_TOKEN` or `GITHUB_TOKEN` keys
  - [ ] worker_env still contains `GITHUB_REPO_URL`
  - [ ] execution_steps use `tsx /tools/github/get-token.ts` (not hardcoded PAT)
  - [ ] execution_steps use per-task branch naming with `$TASK_ID`
  - [ ] Model unchanged (`xiaomi/mimo-v2.5-pro`)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Archetype fields are correct after update
    Tool: Bash (psql)
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT tool_registry, worker_env, model, execution_steps LIKE '%get-token%' as uses_get_token, execution_steps LIKE '%ghp_%' as has_pat, execution_steps LIKE '%TASK_ID%' as uses_task_id FROM archetypes WHERE id = 'ad3531f5-080d-4fd3-a201-5f1c50c67f81';"
    Expected Result: uses_get_token=t, has_pat=f, uses_task_id=t, model=xiaomi/mimo-v2.5-pro
    Evidence: .sisyphus/evidence/task-2-archetype-verify.txt
  ```

  **Commit**: NO (DB-only change, no source files)

- [x] 3. Fix VLRE `github-code-engineer` archetype (DB: add delivery_steps)

  **What to do**:
  - Update the VLRE `github-code-engineer` archetype (ID: `db2974dc-ab37-4034-9ce2-1c7b91e424b5`) via psql:
    1. **delivery_steps**: Set to `'Post the pull request URL and summary to Slack.'` (same as DozalDevs engineer)
  - Execute:
    ```sql
    UPDATE archetypes SET delivery_steps = 'Post the pull request URL and summary to Slack.'
    WHERE id = 'db2974dc-ab37-4034-9ce2-1c7b91e424b5';
    ```
  - Verify the VLRE archetype also has `/tools/slack/post-message.ts` in tool_registry — the delivery_instructions reference Slack posting but the tool may not be available. If missing, add it.

  **Must NOT do**:
  - Do NOT change the model
  - Do NOT modify execution_steps (they're already correct)
  - Do NOT modify delivery_instructions (already correct at 274 chars)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL UPDATE statement
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5, Task 7
  - **Blocked By**: None

  **References**:
  - DozalDevs delivery_steps: `'Post the pull request URL and summary to Slack.'`
  - VLRE delivery_instructions: references Slack posting with `tsx /tools/slack/post-message.ts`

  **Acceptance Criteria**:
  - [ ] VLRE delivery_steps is NOT NULL
  - [ ] delivery_steps text matches expected value

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: VLRE archetype has delivery_steps
    Tool: Bash (psql)
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT delivery_steps, delivery_instructions IS NOT NULL as has_instr FROM archetypes WHERE id = 'db2974dc-ab37-4034-9ce2-1c7b91e424b5';"
    Expected Result: delivery_steps = 'Post the pull request URL and summary to Slack.', has_instr = t
    Evidence: .sisyphus/evidence/task-3-vlre-delivery.txt
  ```

  **Commit**: NO (DB-only change)

- [x] 4. Fix engineer employee documentation

  **What to do**:
  - Update `docs/employees/2026-06-02-1230-engineer.md`:
    1. Line 12: Change `{ "prompt": "..." }` to `{ "inputs": { "prompt": "..." } }` in the trigger description
    2. Lines 87-92: Fix the curl example to use `{ "inputs": { "prompt": "..." } }` format:
       ```bash
       -d '{"inputs": {"prompt": "Add a health check endpoint at GET /ping that returns {\"status\": \"ok\"}"}}'
       ```
    3. Line 95: Update the description to say "The `inputs.prompt` field is forwarded..." instead of "The `prompt` field is forwarded..."
    4. Line 20: Update inbound flow to show `raw_event.inputs.prompt` instead of `trigger_payload.prompt`
    5. Line 23: Update to say "Worker reads prompt from raw_event.inputs (injected via trigger-payload.mts)" instead of "TASK_INPUT"
    6. Line 42: Fix dashboard URL from `localhost:7701` to `localhost:7700` (gateway proxy)
    7. Line 51: Fix dashboard URL from `localhost:7701` to `localhost:7700`

  **Must NOT do**:
  - Do NOT change the overall document structure
  - Do NOT add new sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation-only text edits
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `docs/employees/2026-06-02-1230-engineer.md` — The file to edit
  - `src/gateway/routes/admin-employee-trigger.ts:17-18` — Zod schema showing `{ inputs: z.record(z.string(), z.string()).optional() }` — the correct format

  **Acceptance Criteria**:
  - [ ] Trigger format shows `{ "inputs": { "prompt": "..." } }` not `{ "prompt": "..." }`
  - [ ] Curl example uses correct format
  - [ ] Inbound flow description matches actual code path
  - [ ] Dashboard URLs use port 7700 (not 7701)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Doc is accurate
    Tool: Bash (grep)
    Steps:
      1. grep -n "inputs" docs/employees/2026-06-02-1230-engineer.md | head -10
      2. grep -n "7701" docs/employees/2026-06-02-1230-engineer.md (should return nothing)
    Expected Result: "inputs" appears in trigger examples, "7701" does not appear
    Evidence: .sisyphus/evidence/task-4-doc-verify.txt
  ```

  **Commit**: YES (groups with T8)
  - Message: `docs(engineer): fix trigger format and document GitHub App token flow`
  - Files: `docs/employees/2026-06-02-1230-engineer.md`

- [x] 5. Rebuild Docker image

  **What to do**:
  - Run `docker build -t ai-employee-worker:latest .` from the project root
  - This is required because Task 1 modified `src/workers/opencode-harness.mts` which is compiled into the Docker image
  - Use tmux for the build (it takes 30+ seconds):
    ```bash
    tmux kill-session -t ai-build 2>/dev/null
    tmux new-session -d -s ai-build -x 220 -y 50
    tmux send-keys -t ai-build "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" Enter
    ```
  - Poll until complete, then kill the tmux session

  **Must NOT do**:
  - Do NOT skip this step — the harness fix won't take effect without a rebuild
  - Do NOT run this before Tasks 1-3 are complete

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution with monitoring
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — must wait for Wave 1)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2, 3

  **Acceptance Criteria**:
  - [ ] Docker build exits with code 0
  - [ ] Image `ai-employee-worker:latest` exists and is recent

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker image built successfully
    Tool: Bash
    Steps:
      1. docker images ai-employee-worker:latest --format "{{.Repository}}:{{.Tag}} {{.CreatedAt}}"
    Expected Result: Image exists with recent timestamp
    Evidence: .sisyphus/evidence/task-5-docker-build.txt
  ```

  **Commit**: NO (build artifact)

- [x] 6. E2E test DozalDevs engineer

  **What to do**:
  - Verify services are running: `curl -s http://localhost:7700/health`
  - Trigger the DozalDevs engineer with a trivial task:
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/engineer/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"inputs": {"prompt": "Add a one-line comment to the top of README.md that says: # This project is a test target for the AI Employee platform."}}' \
      | jq '{task_id: .task_id}'
    ```
  - Monitor the task through its lifecycle:
    1. Check status every 30 seconds: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"`
    2. Watch container logs: `docker logs -f employee-${TASK_ID:0:8}` (during Executing)
    3. Check harness log for prompt injection: `grep "Your Assignment" /tmp/employee-${TASK_ID:0:8}.log`
  - If the task reaches `Submitting` → `Reviewing`:
    1. Check for a Slack approval card
    2. Approve manually if needed: `curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U0601SP5VKW","userName":"Victor"}}'`
  - If the task fails:
    1. Check `failure_reason`: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT failure_reason FROM tasks WHERE id = '$TASK_ID';"`
    2. Check container logs for model-specific failures (0 tokens = Mimo can't call tools)
    3. Record the failure mode in evidence
  - Document the full lifecycle trace in evidence

  **Must NOT do**:
  - Do NOT change the model if it fails — document the failure for user decision
  - Do NOT modify any code — this is a test-only task

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step E2E with monitoring, approval, and troubleshooting
  - **Skills**: [`debugging-lifecycle`]
    - `debugging-lifecycle`: Covers all 13 lifecycle states, stuck-state diagnostics, task_status_log queries

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs Docker rebuild first)
  - **Parallel Group**: Wave 2 (sequential after T5)
  - **Blocks**: Task 8
  - **Blocked By**: Task 5

  **References**:
  - `docs/employees/2026-06-02-1230-engineer.md` — Trigger command and status checking
  - AGENTS.md Task Debugging Quick Reference — Container logs, status queries

  **Acceptance Criteria**:
  - [ ] Task created successfully (202 response with task_id)
  - [ ] Task progresses through lifecycle (visible in task_status_log)
  - [ ] `## Your Assignment` section visible in harness log (proves T1 fix works)
  - [ ] Either: PR created on GitHub (success) OR failure documented with root cause

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: DozalDevs engineer creates PR or documents failure
    Tool: Bash (curl + psql + docker logs)
    Preconditions: Docker image rebuilt (T5), DozalDevs archetype fixed (T2), gateway running
    Steps:
      1. Trigger task with trivial prompt
      2. Monitor lifecycle progression every 30s
      3. If reaches Reviewing: approve via manual fallback
      4. If reaches Done: verify PR exists on GitHub
      5. If fails: document failure_reason and container logs
    Expected Result: Task reaches at least Executing state. Ideally reaches Done with PR.
    Failure Indicators: Task stays at Ready (container didn't start), 0 tokens (Mimo can't call tools), Failed with "no output files"
    Evidence: .sisyphus/evidence/task-6-dozaldevs-e2e.txt
  ```

  **Commit**: NO (test only)

- [x] 7. E2E test VLRE engineer

  **What to do**:
  - Same flow as Task 6 but for VLRE tenant:
    ```bash
    source .env
    curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/github-code-engineer/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"inputs": {"prompt": "Add a one-line comment to the top of README.md that says: # This project is a test target for the AI Employee platform."}}' \
      | jq '{task_id: .task_id}'
    ```
  - Monitor lifecycle, approve if needed, document results
  - Note: VLRE targets `viiqswim/ai-employee-test-target` (different repo than DozalDevs)

  **Must NOT do**:
  - Do NOT change the model
  - Do NOT run before T5 (Docker rebuild) and T3 (VLRE delivery_steps fix)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Same as T6 — multi-step E2E monitoring
  - **Skills**: [`debugging-lifecycle`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6 if both are ready)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 5

  **Acceptance Criteria**:
  - [ ] Task created successfully
  - [ ] Either: PR created on GitHub OR failure documented

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: VLRE engineer creates PR or documents failure
    Tool: Bash (curl + psql + docker logs)
    Steps: Same as T6 but for VLRE tenant and viiqswim/ai-employee-test-target repo
    Evidence: .sisyphus/evidence/task-7-vlre-e2e.txt
  ```

  **Commit**: NO (test only)

- [x] 8. Update AGENTS.md and documentation with E2E findings

  **What to do**:
  - After T6 and T7 complete, update documentation:
    1. If Mimo v2.5 Pro failed: Update AGENTS.md warning to explicitly include `xiaomi/mimo-v2.5-pro` alongside the existing `xiaomi/mimo-v2.5` warning
    2. If successful: Update the engineer employee doc's "Verified E2E Flow" section (line 169-183) with actual task IDs and timing
    3. Update AGENTS.md if any new gotchas were discovered
    4. Fill in the archetype IDs in the engineer doc (line 7: currently says "TBD")

  **Must NOT do**:
  - Do NOT fabricate results — only document what actually happened

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation updates based on test results
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T6, T7)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 6, 7

  **Acceptance Criteria**:
  - [ ] AGENTS.md updated if model warning needed
  - [ ] Engineer doc archetype IDs filled in
  - [ ] E2E flow section updated with real data

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Documentation reflects reality
    Tool: Bash (grep + read)
    Steps:
      1. Check AGENTS.md for model warning update if applicable
      2. Check engineer doc for filled archetype IDs
    Expected Result: Documentation matches actual test results
    Evidence: .sisyphus/evidence/task-8-docs-verify.txt
  ```

  **Commit**: YES
  - Message: `docs(engineer): update with E2E verification results`
  - Files: `docs/employees/2026-06-02-1230-engineer.md`, `AGENTS.md` (if updated)

- [x] 9. Notify completion

  **What to do**:
  - Send Telegram: `npx tsx scripts/telegram-notify.ts "✅ engineer-employee-fix-and-test complete — All tasks done. Come back to review results."`

  **Must NOT do**:
  - Do NOT send until F1-F4 all APPROVE

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:
  - [ ] Telegram notification sent

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review changed `.ts`/`.mts` files for: `as any`, `@ts-ignore`, empty catches. Verify tests cover the harness fix.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Verify at least one test task completed and a PR was created on GitHub. Check the PR exists via `gh pr list` or GitHub API. Verify the PR contains the expected README change.
      Output: `PRs Created [N] | Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify no files outside scope were modified. No model changes. No trigger schema changes. No trigger-payload.mts changes.
      Output: `Files Changed [N] | Scope [CLEAN/VIOLATION] | VERDICT`

---

## Commit Strategy

- **1**: `fix(harness): read trigger prompt from raw_event.inputs instead of trigger_payload` — `opencode-harness.mts`, harness prompt tests
- **2**: `docs(engineer): fix trigger format and document GitHub App token flow` — `docs/employees/2026-06-02-1230-engineer.md`, `AGENTS.md`

---

## Success Criteria

### Verification Commands

```bash
# Verify harness fix works (existing + new tests)
pnpm test -- --run src/workers/__tests__/opencode-harness-prompt.test.ts
# Expected: all pass, including new test for raw_event.inputs unwrapping

# Verify DozalDevs archetype is correct
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT tool_registry, worker_env->>'GITHUB_TOKEN' as has_pat FROM archetypes WHERE id = 'ad3531f5-080d-4fd3-a201-5f1c50c67f81';"
# Expected: tool_registry includes get-token.ts, has_pat is NULL

# Verify VLRE archetype has delivery_steps
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT delivery_steps IS NOT NULL as has_delivery FROM archetypes WHERE id = 'db2974dc-ab37-4034-9ce2-1c7b91e424b5';"
# Expected: has_delivery = t

# Verify PR was created (after E2E test)
# Check viiqswim/dozaldevs-ai-employee or viiqswim/ai-employee-test-target for new PR
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] At least one PR created on GitHub test repo
