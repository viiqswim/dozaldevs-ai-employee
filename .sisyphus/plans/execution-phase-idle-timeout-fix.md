# Execution Phase Idle Timeout Fix + 100-Run Revalidation

## TL;DR

> **Quick Summary**: Apply two surgical numeric changes to `opencode-harness.mts` — increase execution-phase idle timeout from 30s to 120s and nudge recovery window from 10s to 60s — then revalidate with 100 runs targeting ≥98/100 pass rate.
>
> **Deliverables**:
>
> - Two numeric changes in `src/workers/opencode-harness.mts`
> - Rebuilt Docker image with the fix
> - 100 tasks triggered, tracked, and verified with per-task evidence
> - Statistical report comparing pre-fix (95/100) vs post-fix pass rate
>
> **Estimated Effort**: Medium (~15 min code change + ~60 min validation)
> **Parallel Execution**: NO — sequential (code change → rebuild → validate)
> **Critical Path**: Fix → Rebuild → Pre-flight → Batches 1-10 → Report → Notify
> **Pass Threshold**: ≥98/100 = FIX CONFIRMED | 95-97 = escalate to 180s | <95 = REGRESSION, revert

---

## Context

### Original Request

The 100-run delivery validation showed 95/100 pass rate. All 5 failures were execution-phase idle timeout failures (not delivery failures — the delivery fix works perfectly). User wants to fix the execution-phase timeout and revalidate to achieve <5% failure rate.

### Interview Summary

**Key Discussions**:

- All 5 failures have identical root cause: execution phase uses `minElapsedMs: 30_000` (30s default), which fires prematurely while the LLM is still working
- The post-nudge recovery window is only 10s — too short for the model to respond
- The delivery phase fix (120s) is the proven pattern to follow
- Failure durations (46–152s) are all below the normal range (167–365s)

**Research Findings**:

- Exact code path mapped: `main()` → `runOpencodeSession()` → `monitorSession(minElapsedMs: 30s)` → idle fires → nudge → 10s wait → fail
- `minElapsedMs` is wall-clock elapsed from session start, NOT an inactivity timer
- Three idle timeout invocations: execution primary (30s), execution nudge (10s), delivery primary (120s)
- 4/5 failures clustered in batches 02–04; 1 in batch 09. No positional pattern. Stochastic LLM behavior.

### Metis Review

**Identified Gaps** (addressed):

- **Fix strategy must be explicit**: Use Strategy A (explicit arg at call site, line 931), NOT Strategy B (changing the default at line 357). This matches the delivery-phase pattern.
- **Nudge message text out of scope**: Current message says "posting to Slack" which is delivery-phase language. Changing it introduces a new variable. Exclude from this plan.
- **No refactoring**: Do NOT extract timeout to a named constant. Numeric literal only.
- **Decision tree required**: What happens at 96/100 or 97/100? Need explicit sub-threshold handling.
- **152s near-miss**: The longest failure was at 152s. With 120s minimum, the idle check won't fire until 120s — but the model could still pause after 120s. Acknowledged; if failures persist, escalate to 180s.
- **Stuck-session trade-off**: Old: stuck detected at 30s + 10s = 40s. New: 120s + 60s = 180s. Genuine stuck sessions waste 140s more. Acceptable trade-off for the reliability improvement.

---

## Work Objectives

### Core Objective

Eliminate the execution-phase idle timeout as a failure mode and demonstrate ≥98/100 reliability.

### Concrete Deliverables

- Modified `src/workers/opencode-harness.mts` with two numeric changes
- Rebuilt Docker image (`ai-employee-worker:latest`) containing the fix
- 100 validated task runs with per-batch evidence
- Statistical report with pass rate, CI, and comparison to 95/100 baseline

### Definition of Done

- [ ] Execution-phase `minElapsedMs` changed from 30s to 120s at the call site (line 931)
- [ ] Nudge recovery `minElapsedMs` changed from 10s to 60s (line 508)
- [ ] Docker image rebuilt and SHA verified different from pre-fix
- [ ] 100 runs completed and verified with three-part check
- [ ] ≥98/100 pass rate achieved
- [ ] Statistical report saved with comparison to pre-fix baseline

### Must Have

- Explicit `{ minElapsedMs: 120_000 }` arg at the execution-phase call site (Strategy A)
- Nudge recovery window increased to 60s
- Docker image rebuild with SHA verification
- 100-run revalidation with identical methodology to previous test
- Decision tree for sub-threshold outcomes
- Statistical report with Wilson CI and baseline comparison

### Must NOT Have (Guardrails)

- DO NOT change the delivery-phase `minElapsedMs: 120_000` at line 724 — it is already correct
- DO NOT change the default at line 357 (`?? 30_000`) — override at call site only
- DO NOT change the nudge message text — out of scope
- DO NOT extract timeout values to named constants — no refactoring
- DO NOT add logging, comments, or any other changes beyond the two numeric values
- DO NOT count HTTP 402 (credit exhaustion) failures toward pass rate
- DO NOT use the Inngest Dev Server UI as evidence
- DO NOT run unit tests (known timeout issues)
- DO NOT fix anything discovered during the 100 runs — document and continue

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest) — but NOT used for this validation
- **Automated tests**: NO — this is a live system validation
- **Framework**: N/A

### QA Policy

Evidence saved to `.sisyphus/evidence/execution-fix-100-run/`.

- **Code change verification**: Read the modified file and confirm exact two-line diff
- **Docker verification**: SHA comparison (pre-fix vs post-fix)
- **Per-run verification**: DB query (status=Done) + delivery log exists + `post-message` grep
- **Per-batch verification**: Credit balance check + Docker health check
- **Final verification**: Statistical analysis + comparison to 95/100 baseline

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Code fix + rebuild):
├── Task 1: Apply timeout fix (2 numeric changes) [quick]
├── Task 2: Rebuild Docker image and verify SHA [quick]
│   (depends: Task 1)

Wave 2 (Pre-flight):
├── Task 3: Pre-flight validation [quick]
│   (depends: Task 2)

Wave 3 (Batches 1-5):
├── Task 4: Execute batches 1-5 (50 runs) [deep]
│   (depends: Task 3)

Wave 4 (Batches 6-10):
├── Task 5: Execute batches 6-10 (50 runs) [deep]
│   (depends: Task 4)

Wave 5 (Analysis + notification):
├── Task 6: Compile statistical report [quick]
│   (depends: Task 5)
├── Task 7: Notify completion via Telegram [quick]
│   (depends: Task 6)

Wave FINAL (User review):
└── Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2      | 1    |
| 2    | 1          | 3      | 1    |
| 3    | 2          | 4      | 2    |
| 4    | 3          | 5      | 3    |
| 5    | 4          | 6, 7   | 4    |
| 6    | 5          | 7      | 5    |
| 7    | 6          | —      | 5    |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **1** — T3 → `quick`
- **Wave 3**: **1** — T4 → `deep`
- **Wave 4**: **1** — T5 → `deep`
- **Wave 5**: **2** — T6 → `quick`, T7 → `quick`

---

## TODOs

> ALL tasks are sequential (no parallelism — code change must precede validation).
> Every task MUST have: Recommended Agent Profile + QA Scenarios.

- [x] 1. Apply Execution-Phase Timeout Fix

  **What to do**:
  1. Read `src/workers/opencode-harness.mts` to confirm current state at lines 931 and 508
  2. Apply Change 1 — execution-phase call site (line 931):

     ```typescript
     // BEFORE:
     const result = await runOpencodeSession(instructionsWithSubmitOutput, model, submitOutputCmd);

     // AFTER:
     const result = await runOpencodeSession(instructionsWithSubmitOutput, model, submitOutputCmd, {
       minElapsedMs: 120_000,
     });
     ```

  3. Apply Change 2 — nudge recovery window (line 508):

     ```typescript
     // BEFORE:
     minElapsedMs: 10000,

     // AFTER:
     minElapsedMs: 60_000,
     ```

  4. Verify the diff shows EXACTLY two changes, nothing else:
     ```bash
     git diff src/workers/opencode-harness.mts
     ```
  5. Verify no TypeScript errors:
     ```bash
     npx tsc --noEmit --pretty 2>&1 | head -20
     ```

  **Must NOT do**:
  - DO NOT change line 724 (`{ minElapsedMs: 120_000 }`) — delivery phase is already correct
  - DO NOT change line 357 (`?? 30_000`) — the default stays; we override at call site
  - DO NOT change the nudge message text at line 504
  - DO NOT extract values to constants or add comments
  - DO NOT touch any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two literal number changes in one file — trivial edit
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:720-724` — Delivery phase call with explicit `{ minElapsedMs: 120_000 }`. The execution-phase fix must follow this exact pattern.
  - `src/workers/opencode-harness.mts:294-298` — `runOpencodeSession` function signature showing `options?: { minElapsedMs?: number }` as 4th parameter.

  **API/Type References**:
  - `src/workers/opencode-harness.mts:355-357` — Where `options?.minElapsedMs ?? 30_000` resolves the value. Confirms the 4th arg override works.

  **WHY Each Reference Matters**:
  - The delivery-phase call (line 720-724) is the exact pattern to copy — same function, same arg shape, same value
  - The function signature (line 294-298) proves the 4th parameter exists and accepts `{ minElapsedMs?: number }`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Two numeric changes applied correctly
    Tool: Bash
    Preconditions: Repository checked out on current branch
    Steps:
      1. git diff src/workers/opencode-harness.mts → shows exactly 2 hunks
      2. grep "minElapsedMs: 120_000" src/workers/opencode-harness.mts → 2 matches (line 724 + new line 931)
      3. grep "minElapsedMs: 60_000" src/workers/opencode-harness.mts → 1 match (line 508 area)
      4. grep "minElapsedMs: 10000" src/workers/opencode-harness.mts → 0 matches (old value gone)
      5. npx tsc --noEmit → exit code 0 (no type errors)
    Expected Result: Exactly 2 hunks in diff; grep counts match; tsc passes
    Failure Indicators: More than 2 hunks (touched something else); grep counts wrong; tsc fails
    Evidence: .sisyphus/evidence/execution-fix-100-run/code-change-verification.txt

  Scenario: Delivery phase untouched
    Tool: Bash
    Preconditions: Change applied
    Steps:
      1. Read line 724 of src/workers/opencode-harness.mts
      2. Confirm it still reads: { minElapsedMs: 120_000 }
      3. Read line 357 — confirm it still reads: options?.minElapsedMs ?? 30_000
    Expected Result: Both lines unchanged from their current values
    Failure Indicators: Either line modified
    Evidence: .sisyphus/evidence/execution-fix-100-run/code-change-verification.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/execution-fix-100-run/code-change-verification.txt` — git diff output + grep results

  **Commit**: YES
  - Message: `fix(harness): increase execution-phase idle timeout from 30s to 120s`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 2. Rebuild Docker Image and Verify SHA

  **What to do**:
  1. Record pre-fix Docker image SHA:
     ```bash
     docker inspect ai-employee-worker:latest --format '{{.Id}}' > /tmp/pre-fix-sha.txt
     cat /tmp/pre-fix-sha.txt
     ```
  2. Rebuild the Docker image:
     ```bash
     docker build -t ai-employee-worker:latest .
     ```
     This is a long-running command — use tmux:
     ```bash
     tmux kill-session -t ai-build 2>/dev/null; tmux new-session -d -s ai-build -x 220 -y 50
     tmux send-keys -t ai-build "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" Enter
     ```
     Poll until complete:
     ```bash
     grep "EXIT_CODE:" /tmp/ai-build.log && echo "DONE" || echo "RUNNING"
     ```
  3. Verify new SHA differs from pre-fix:
     ```bash
     NEW_SHA=$(docker inspect ai-employee-worker:latest --format '{{.Id}}')
     OLD_SHA=$(cat /tmp/pre-fix-sha.txt)
     echo "Old: $OLD_SHA"
     echo "New: $NEW_SHA"
     if [ "$NEW_SHA" != "$OLD_SHA" ]; then echo "SHA CHANGED ✅"; else echo "SHA UNCHANGED ❌ — build may have used cache"; fi
     ```
  4. Kill the tmux session:
     ```bash
     tmux kill-session -t ai-build
     ```
  5. Save evidence:
     ```bash
     mkdir -p .sisyphus/evidence/execution-fix-100-run
     echo "Pre-fix SHA: $OLD_SHA" > .sisyphus/evidence/execution-fix-100-run/docker-rebuild.txt
     echo "Post-fix SHA: $NEW_SHA" >> .sisyphus/evidence/execution-fix-100-run/docker-rebuild.txt
     echo "Result: SHA CHANGED" >> .sisyphus/evidence/execution-fix-100-run/docker-rebuild.txt
     ```

  **Must NOT do**:
  - DO NOT proceed to Task 3 if SHA is unchanged (build cached the old code)
  - DO NOT leave the tmux session running after build completes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single docker build command + SHA comparison. Long-running but mechanically simple.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - AGENTS.md § Long-Running Commands — tmux pattern for docker build
  - AGENTS.md § Tmux Session Cleanup — kill session after completion

  **WHY Each Reference Matters**:
  - Docker build takes >30s and MUST use tmux per AGENTS.md rules
  - Tmux session must be killed to prevent vnode exhaustion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image rebuilt with new SHA
    Tool: Bash
    Preconditions: Task 1 committed
    Steps:
      1. docker inspect ai-employee-worker:latest --format '{{.Id}}' → different from pre-fix SHA
      2. cat .sisyphus/evidence/execution-fix-100-run/docker-rebuild.txt → contains "SHA CHANGED"
      3. tmux list-sessions | grep ai-build → no match (session cleaned up)
    Expected Result: New SHA differs from old; evidence file exists; tmux session killed
    Failure Indicators: SHA unchanged; build failed; tmux session still running
    Evidence: .sisyphus/evidence/execution-fix-100-run/docker-rebuild.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/execution-fix-100-run/docker-rebuild.txt` — pre/post SHA comparison

  **Commit**: NO (Docker image, not source code)

- [x] 3. Pre-flight Validation

  **What to do**:
  1. Source `.env` and verify required env vars: `ADMIN_API_KEY`, `OPENROUTER_API_KEY`
  2. Verify gateway healthy: `curl -sf http://localhost:7700/health`
  3. Verify Inngest healthy: `curl -sf http://localhost:8288/health`
  4. Check OpenRouter credit balance (must be > 0.50):
     ```bash
     source .env
     curl -s https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq -r '.data.limit_remaining'
     ```
  5. Record new Docker image SHA:
     ```bash
     docker inspect ai-employee-worker:latest --format '{{.Id}}'
     ```
  6. Verify employee slug resolves (dry run):
     ```bash
     source .env
     curl -sf -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger?dry_run=true" \
       -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
     ```
  7. Create evidence directory: `mkdir -p .sisyphus/evidence/execution-fix-100-run`
  8. Save all results to `.sisyphus/evidence/execution-fix-100-run/preflight.txt`

  **Must NOT do**:
  - DO NOT trigger real tasks (dry_run only)
  - DO NOT proceed if credits < 0.50

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple sequential health checks — curl + jq + file writes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/100-run/preflight.txt` — Previous pre-flight format (follow same structure for consistency)

  **API/Type References**:
  - OpenRouter auth/key: `https://openrouter.ai/api/v1/auth/key` — Returns `{ data: { limit_remaining: number } }`
  - Admin trigger dry_run: `POST /admin/tenants/:tenantId/employees/:slug/trigger?dry_run=true`

  **WHY Each Reference Matters**:
  - Previous preflight format ensures evidence is consistent across both 100-run tests
  - Dry run confirms the entire trigger path without creating a task

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All services healthy and credits sufficient
    Tool: Bash
    Preconditions: pnpm dev running, Docker image rebuilt (Task 2)
    Steps:
      1. curl -sf http://localhost:7700/health → HTTP 200
      2. curl -sf http://localhost:8288/health → HTTP 200
      3. Credit balance > 0.50
      4. Docker image SHA matches Task 2's post-fix SHA
      5. Dry-run trigger returns HTTP 200/202
      6. preflight.txt contains all check results
    Expected Result: All 6 checks pass
    Failure Indicators: Any curl fails; credits < 0.50; SHA mismatch
    Evidence: .sisyphus/evidence/execution-fix-100-run/preflight.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/execution-fix-100-run/preflight.txt`

  **Commit**: NO

- [x] 4. Execute Batches 1–5 (Runs 1–50)

  **What to do**:

  For each batch (1 through 5), execute this exact sequence:

  **A. Pre-batch credit check:**

  ```bash
  source .env
  CREDITS=$(curl -s https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq -r '.data.limit_remaining')
  echo "Batch N — Credits remaining: $CREDITS"
  # If credits < 0.10: STOP. Save state and exit.
  ```

  **B. Trigger 10 runs with 5s spacing:**

  ```bash
  source .env
  BATCH_TASKS=()
  for i in $(seq 1 10); do
    TASK_ID=$(curl -s -X POST \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id')
    echo "Batch N, Run $i: $TASK_ID"
    BATCH_TASKS+=("$TASK_ID")
    sleep 5
  done
  ```

  **C. Wait 300 seconds:**

  ```bash
  sleep 300
  ```

  **D. Verify each task (three-part check):**
  For each TASK_ID:

  ```bash
  # 1. Status
  STATUS=$(psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -A -c "SELECT status FROM tasks WHERE id = '$TASK_ID';")
  # 2. Delivery log
  SHORT_ID=$(echo "$TASK_ID" | cut -c1-8)
  DELIVERY_LOG="/tmp/employee-delivery-${SHORT_ID}.log"
  LOG_EXISTS=$([ -f "$DELIVERY_LOG" ] && echo "YES" || echo "NO")
  # 3. post-message grep
  if [ -f "$DELIVERY_LOG" ]; then
    POST_MSG_COUNT=$(grep -ci "post-message" "$DELIVERY_LOG" || echo "0")
  else
    POST_MSG_COUNT="0"
  fi
  # 4. Duration
  DURATION=$(psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -A -c \
    "SELECT EXTRACT(EPOCH FROM (updated_at - created_at))::int FROM tasks WHERE id = '$TASK_ID';")
  # 5. PASS/FAIL
  if [ "$STATUS" = "Done" ] && [ "$LOG_EXISTS" = "YES" ] && [ "$POST_MSG_COUNT" -ge 1 ]; then
    RESULT="PASS"
  else
    RESULT="FAIL"
  fi
  # 6. Slow flag
  SLOW_FLAG=""
  if [ "$DURATION" -gt 300 ]; then SLOW_FLAG=" [SLOW]"; fi
  echo "$TASK_ID | $STATUS | $LOG_EXISTS | $POST_MSG_COUNT | ${DURATION}s | ${RESULT}${SLOW_FLAG}"
  ```

  **E. Docker health check after batches 2 and 4:**

  ```bash
  EXITED=$(docker ps --filter status=exited --format '{{.Names}}' | wc -l | tr -d ' ')
  docker inspect ai-employee-worker:latest --format '{{.Id}}'
  ```

  **F. Save batch results** to `.sisyphus/evidence/execution-fix-100-run/batch-NN.txt` (batch-01 through batch-05).

  Format per batch file:

  ```
  Batch N — Started: <timestamp> — Credits before: $X.XX
  ============================================================
  TASK_ID                              | STATUS | LOG | POST_MSG | DURATION | RESULT
  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | Done   | YES | 2        | 185s     | PASS
  ...
  ============================================================
  Batch N Summary: X/10 PASS, Y/10 FAIL
  Credits after: $X.XX
  ```

  **G. For non-402 failures:** Check execution log (`/tmp/employee-${SHORT_ID}.log | tail -50`), record reason, continue to next batch. STOP only if 3+ consecutive same-type failures.

  **H. For HTTP 402 failures:** STOP, print PAUSED, save partial results, exit. 402 runs don't count toward total.

  **Must NOT do**:
  - DO NOT modify source code or rebuild Docker
  - DO NOT trigger faster than 5s apart
  - DO NOT use Inngest UI as evidence
  - DO NOT count 402 failures toward pass rate
  - DO NOT continue if 3+ consecutive non-credit failures

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: ~30 min execution, careful state tracking across 50 runs
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/100-run/batch-01.txt` — Previous batch format (follow for consistency)
  - `.sisyphus/plans/100-run-delivery-validation.md` Task 2 — Full procedure description

  **API/Type References**:
  - Admin trigger: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger`
  - OpenRouter auth/key: `https://openrouter.ai/api/v1/auth/key`

  **WHY Each Reference Matters**:
  - Previous batch format ensures evidence consistency across both validation rounds
  - The previous plan's Task 2 defines the canonical procedure

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 50 runs pass
    Tool: Bash
    Preconditions: Services healthy (Task 3 passed), credits > $0.50
    Steps:
      1. Execute batches 1-5 per procedure
      2. Verify 5 batch files exist: ls .sisyphus/evidence/execution-fix-100-run/batch-0{1..5}.txt
      3. Count PASS across all files
    Expected Result: 50/50 PASS; 2 Docker health checks logged
    Failure Indicators: Any batch file missing; PASS count < 48
    Evidence: .sisyphus/evidence/execution-fix-100-run/batch-01.txt through batch-05.txt

  Scenario: Non-credit failure detected
    Tool: Bash
    Preconditions: A run reaches Failed status
    Steps:
      1. Check execution log tail -50
      2. Record failure reason in batch file
      3. Continue unless 3+ consecutive same-type failures
    Expected Result: Failure documented; batch continues
    Evidence: .sisyphus/evidence/execution-fix-100-run/batch-NN.txt (with failure details)
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/execution-fix-100-run/batch-01.txt` through `batch-05.txt`

  **Commit**: NO

- [x] 5. Execute Batches 6–10 (Runs 51–100)

  **What to do**:

  Identical procedure to Task 4, but for batches 6 through 10:
  1. Evidence files: `batch-06.txt` through `batch-10.txt`
  2. Run numbering: 51–100
  3. Docker health checks: after batches 7 and 9
  4. **Before starting**: Verify `batch-05.txt` exists and is complete

  **Additional end-of-task step:** Compile consolidated results:

  ```bash
  echo "CONSOLIDATED RESULTS — 100 Runs (Post-Fix)" > .sisyphus/evidence/execution-fix-100-run/results-table.txt
  echo "============================================" >> .sisyphus/evidence/execution-fix-100-run/results-table.txt
  for f in .sisyphus/evidence/execution-fix-100-run/batch-*.txt; do
    grep -E "^[0-9a-f]{8}-" "$f" >> .sisyphus/evidence/execution-fix-100-run/results-table.txt
  done
  echo "============================================" >> .sisyphus/evidence/execution-fix-100-run/results-table.txt
  TOTAL_PASS=$(grep -c "PASS" .sisyphus/evidence/execution-fix-100-run/results-table.txt)
  TOTAL_FAIL=$(grep -c "FAIL" .sisyphus/evidence/execution-fix-100-run/results-table.txt || echo "0")
  echo "TOTAL: $TOTAL_PASS PASS / $TOTAL_FAIL FAIL out of $((TOTAL_PASS + TOTAL_FAIL)) runs" >> .sisyphus/evidence/execution-fix-100-run/results-table.txt
  ```

  Also verify Docker image SHA unchanged:

  ```bash
  CURRENT_SHA=$(docker inspect ai-employee-worker:latest --format '{{.Id}}')
  # Compare against Task 2's post-fix SHA from docker-rebuild.txt
  ```

  **Must NOT do**: Same guardrails as Task 4. DO NOT re-run batches 1-5.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Same as Task 4
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 6, Task 7
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - Task 4 (this plan) — Full procedure; follow identically
  - `.sisyphus/evidence/execution-fix-100-run/batch-05.txt` — Must exist before starting
  - `.sisyphus/evidence/execution-fix-100-run/docker-rebuild.txt` — Post-fix SHA for comparison

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 50 runs (51-100) pass
    Tool: Bash
    Preconditions: Task 4 completed (batch-05.txt exists)
    Steps:
      1. Verify batch-05.txt exists
      2. Execute batches 6-10 per Task 4 procedure
      3. Verify batch-06 through batch-10 exist
      4. Verify results-table.txt has all 100 runs
      5. Docker SHA comparison shows MATCH
    Expected Result: 50/50 PASS; results-table.txt complete; SHA unchanged
    Evidence: .sisyphus/evidence/execution-fix-100-run/batch-06.txt through batch-10.txt, results-table.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/execution-fix-100-run/batch-06.txt` through `batch-10.txt`
  - [ ] `.sisyphus/evidence/execution-fix-100-run/results-table.txt`
  - [ ] `.sisyphus/evidence/execution-fix-100-run/docker-health.txt`

  **Commit**: NO

- [x] 6. Compile Statistical Report

  **What to do**:

  Read `results-table.txt` and all batch files to compile a statistical report. Include ALL sections from the previous report PLUS a baseline comparison:
  1. **Pass rate**: N/100 with percentage
  2. **Failure breakdown** by type (if any): EXECUTION_FAILED, CREDIT_402, SLACK_429, NO_DELIVERY_LOG, NO_POST_MESSAGE, UNKNOWN
  3. **Duration statistics**: min, p50, p95, max, mean (all runs and PASS-only)
  4. **Slow run analysis** (>300s)
  5. **Wilson confidence interval** (95% CI)
  6. **Batch trend**: pass rate per batch
  7. **Credit consumption**: start and end balances
  8. **Docker integrity**: SHA comparison
  9. **Baseline comparison** (NEW — compare to previous 100-run):
     ```
     Pre-fix:  95/100 (95.0%), CI [88.82%, 97.85%]
     Post-fix: NN/100 (NN.N%), CI [XX.XX%, YY.YY%]
     Improvement: +N runs, CI improvement: [delta]
     ```
  10. **Verdict** using the decision tree:
      - ≥98/100: `VERDICT: FIX CONFIRMED — Execution-phase idle timeout eliminated as failure mode`
      - 95-97/100: `VERDICT: PARTIAL IMPROVEMENT — Escalate minElapsedMs to 180_000`
      - <95/100: `VERDICT: REGRESSION — Revert change immediately`

  Save to `.sisyphus/evidence/execution-fix-100-run/statistical-report.txt`.

  **Must NOT do**:
  - DO NOT modify results-table.txt or batch files
  - DO NOT re-run any failed tasks
  - DO NOT manually adjust counts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure data analysis — reading files and computing statistics
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/100-run/statistical-report.txt` — Previous report format (follow for consistency, add baseline comparison section)
  - `.sisyphus/evidence/execution-fix-100-run/results-table.txt` — Source data

  **WHY Each Reference Matters**:
  - Previous report is the template — follow same section structure plus the new baseline comparison section
  - results-table.txt is the single source of truth for counts and durations

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Report is complete and accurate
    Tool: Bash
    Preconditions: results-table.txt exists with 100 rows
    Steps:
      1. cat statistical-report.txt → contains all 10 sections
      2. PASS count matches source data
      3. Baseline comparison section includes pre-fix 95/100 reference
      4. VERDICT line matches one of the three templates
    Expected Result: All 10 sections present; numbers match; verdict correct
    Evidence: .sisyphus/evidence/execution-fix-100-run/statistical-report.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/execution-fix-100-run/statistical-report.txt`

  **Commit**: NO

- [x] 7. Notify Completion via Telegram

  **What to do**:
  1. Read verdict and pass rate from the statistical report
  2. Send Telegram notification:

     ```bash
     source .env
     VERDICT=$(grep "VERDICT:" .sisyphus/evidence/execution-fix-100-run/statistical-report.txt)
     PASS_RATE=$(grep "Pass Rate:" .sisyphus/evidence/execution-fix-100-run/statistical-report.txt | head -1)
     npx tsx scripts/telegram-notify.ts "📊 Execution-Phase Fix — 100-Run Revalidation Complete

     $PASS_RATE
     $VERDICT

     Baseline: 95/100 (pre-fix)
     Evidence: .sisyphus/evidence/execution-fix-100-run/
     Come back to review the full report."
     ```

  **Must NOT do**:
  - DO NOT send if statistical report doesn't exist
  - DO NOT modify evidence files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command — read file, send message
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (after Task 6)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `scripts/telegram-notify.ts` — Telegram notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Notification sent with correct content
    Tool: Bash
    Preconditions: statistical-report.txt exists
    Steps:
      1. npx tsx scripts/telegram-notify.ts "..." → exit code 0
      2. Message contains pass rate and verdict
    Expected Result: Exit code 0
    Evidence: Terminal output
  ```

  **Evidence to Capture:**
  - [ ] Terminal output confirming send

  **Commit**: NO

---

## Final Verification Wave

> No automated F1-F4 reviewers for this plan — it is a validation exercise with a single code change.
> The user reviews the statistical report and makes the final call.
>
> **Present the statistical report to the user and wait for explicit "okay" before declaring the validation complete.**
>
> **Decision Tree for Sub-Threshold Outcomes:**
>
> - **≥98/100**: FIX CONFIRMED. Plan complete. Commit the code change.
> - **95-97/100**: Inspect failure logs. If all failures are still idle timeouts → escalate `minElapsedMs` to `180_000` and re-run 100. If failures are a new type → stop and report.
> - **<95/100**: REGRESSION. Revert the code change immediately (`git checkout src/workers/opencode-harness.mts`). Investigate.

---

## Commit Strategy

| Commit | Message                                                                | Files                              | Pre-commit |
| ------ | ---------------------------------------------------------------------- | ---------------------------------- | ---------- |
| 1      | `fix(harness): increase execution-phase idle timeout from 30s to 120s` | `src/workers/opencode-harness.mts` | —          |

---

## Success Criteria

### Pass Threshold

- **≥98/100**: Fix confirmed — execution-phase idle timeout eliminated as a failure mode
- **95-97/100**: Escalate to 180s timeout
- **<95/100**: Regression — revert

### Verification Commands

```bash
# Confirm fix applied
grep "minElapsedMs: 120_000" src/workers/opencode-harness.mts | wc -l
# Expected: 2 (execution phase + delivery phase)

grep "minElapsedMs: 60_000" src/workers/opencode-harness.mts | wc -l
# Expected: 1 (nudge recovery)

# Count pass/fail from evidence
grep -c "PASS" .sisyphus/evidence/execution-fix-100-run/results-table.txt
grep -c "FAIL" .sisyphus/evidence/execution-fix-100-run/results-table.txt
```

### Final Checklist

- [ ] Two numeric changes applied (120_000 at call site, 60_000 at nudge)
- [ ] Docker image rebuilt with different SHA
- [ ] 100 tasks triggered
- [ ] ≥98 passed three-part verification
- [ ] All failures classified
- [ ] Statistical report complete with baseline comparison
- [ ] User reviewed and approved
