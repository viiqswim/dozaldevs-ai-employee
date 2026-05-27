# 100-Run Delivery Reliability Validation

## TL;DR

> **Quick Summary**: Run 100 consecutive `daily-real-estate-inspiration-2` triggers in 10 batches of 10 to statistically validate the delivery fix (minElapsedMs: 120_000 + softened nudge). Collect per-run evidence, compile a comprehensive statistical report.
>
> **Deliverables**:
>
> - 100 tasks triggered, tracked, and verified with per-task evidence
> - Statistical report: pass rate, failure breakdown, p50/p95 durations
> - Evidence files in `.sisyphus/evidence/100-run/`
>
> **Estimated Effort**: Medium (~60 min execution + analysis)
> **Parallel Execution**: NO — batches are sequential by design
> **Critical Path**: Pre-flight → Batches 1-10 → Report → Notify
> **Pass Threshold**: ≥98/100 runs must post to Slack (allows ≤2 infra-related failures)

---

## Context

### Original Request

Run 100 consecutive tests of `daily-real-estate-inspiration-2` to validate the delivery fix at scale. The fix (commit `51c2eb1`) increased the delivery phase idle timeout from 30s to 120s and softened the recovery nudge message to prevent the LLM from skipping Slack posting steps.

### Interview Summary

**Key Discussions**:

- Previous fix passed 20/20 across two rounds (T3: 10/10, revalidation: 10/10)
- 3 intermediate failures occurred — all were OpenRouter HTTP 402 (credit exhaustion), not code bugs
- User wants statistical confidence: 100 runs provides ~[96%, 100%] CI vs 20 runs' ~[83%, 100%]
- Agreed approach: 10 batches of 10, health checks between batches, stop on non-credit failures

**Research Findings**:

- Employee model: `openai/gpt-oss-120b` (from archetypes table)
- OpenRouter daily limit: $4.00/day; each run costs ~$0.005 → 100 runs ≈ $0.50
- Run duration: 168–258s (p50 ~3 min, p95 ~4.5 min)
- Docker image: `ai-employee-worker:latest` (sha256:2961ea8894cf) contains the fix

### Metis Review

**Identified Gaps** (addressed):

- **Credit pre-check**: Must verify `limit_remaining > 0.50` via OpenRouter auth/key API before each batch — not just between batches
- **Slack rate limiting**: 10 parallel deliveries to same channel risks HTTP 429 from Slack — check delivery logs for 429 errors
- **Docker resource health**: After 100 container launches, check for zombie containers every 20 runs
- **Batch wait time**: Use 300s (not 180s) to accommodate worst-case run durations
- **Pass criteria must be three-part**: Done status + delivery log exists + `post-message` grep match
- **Runs >300s flagged**: Even if Done, flag for review
- **Image SHA check**: Verify at start AND end that the Docker image hasn't changed
- **Don't use Inngest UI**: Only DB queries and log files are valid evidence (AGENTS.md documented contamination issue)

---

## Work Objectives

### Core Objective

Statistically validate that `daily-real-estate-inspiration-2` reliably posts to Slack on every run by executing 100 consecutive tests with per-task verification.

### Concrete Deliverables

- 100 task records in DB, each verified for Done + delivery log + post-message
- Per-batch health check records (credits, Docker state)
- Statistical report with pass rate, failure taxonomy, duration distribution
- All evidence in `.sisyphus/evidence/100-run/`

### Definition of Done

- [ ] 100 tasks triggered and reached terminal status
- [ ] ≥98/100 pass the three-part verification (Done + log exists + post-message ≥ 1)
- [ ] Any failures classified by root cause (credit/Slack 429/code bug/unknown)
- [ ] Statistical report saved with p50/p95 durations and pass rate confidence interval
- [ ] Docker image SHA matches at start and end (no mid-test rebuilds)

### Must Have

- Pre-flight validation before first batch
- Credit check before EACH batch (not just between)
- Three-part pass criteria per run: Done + delivery log exists + post-message grep
- Docker health check every 20 runs
- Runs >300s flagged even if Done
- Statistical summary with duration percentiles

### Must NOT Have (Guardrails)

- DO NOT modify any source code during the validation
- DO NOT fix anything discovered during the 100 runs — document and continue (or stop if code bug)
- DO NOT count 402 (credit exhaustion) failures toward the pass rate — pause, top up, resume
- DO NOT use the Inngest Dev Server UI as evidence (documented contamination issue)
- DO NOT validate other employees (`daily-real-estate-inspiration`, `-3`, etc.)
- DO NOT trigger runs faster than 5s apart within a batch (rate limiting)
- DO NOT run unit tests
- DO NOT rebuild the Docker image during the test

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest) — but NOT used for this validation
- **Automated tests**: NO — this is a live system validation, not unit testing
- **Framework**: N/A

### QA Policy

Evidence saved to `.sisyphus/evidence/100-run/`.

- **Per-run verification**: DB query (status) + file existence check (delivery log) + grep (post-message)
- **Per-batch verification**: Credit balance check + Docker health check
- **Final verification**: Statistical analysis + image SHA comparison

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Pre-flight — all checks before first trigger):
├── Task 1: Pre-flight validation [quick]

Wave 2 (Batches 1-5 — runs 1-50, sequential batches):
├── Task 2: Execute batches 1-5 (50 runs) [deep]

Wave 3 (Batches 6-10 — runs 51-100, sequential batches):
├── Task 3: Execute batches 6-10 (50 runs) [deep]
│   (depends: Task 2)

Wave 4 (Analysis + notification):
├── Task 4: Compile statistical report [quick]
│   (depends: Task 3)
├── Task 5: Notify completion via Telegram [quick]
│   (depends: Task 4)

Wave FINAL (User review):
└── Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2      | 1    |
| 2    | 1          | 3      | 2    |
| 3    | 2          | 4, 5   | 3    |
| 4    | 3          | 5      | 4    |
| 5    | 4          | —      | 4    |

### Agent Dispatch Summary

- **Wave 1**: **1** — T1 → `quick`
- **Wave 2**: **1** — T2 → `deep`
- **Wave 3**: **1** — T3 → `deep`
- **Wave 4**: **2** — T4 → `quick`, T5 → `quick`

---

## TODOs

> ALL tasks are sequential (no parallelism — this is a validation exercise).
> Every task MUST have: Recommended Agent Profile + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [x] 1. Pre-flight Validation

  **What to do**:
  1. Source `.env` and verify required env vars exist: `ADMIN_API_KEY`, `OPENROUTER_API_KEY`
  2. Verify gateway is healthy: `curl -sf http://localhost:7700/health`
  3. Verify Inngest dev server is healthy: `curl -sf http://localhost:8288/health`
  4. Check OpenRouter credit balance:
     ```bash
     source .env
     CREDITS=$(curl -s https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq -r '.data.limit_remaining')
     echo "Credits remaining: $CREDITS"
     # Must be > 0.50 (100 runs × ~$0.005 = $0.50)
     ```
  5. Record Docker image SHA:
     ```bash
     docker inspect ai-employee-worker:latest --format '{{.Id}}'
     # Expected: sha256:2961ea8894cf...
     ```
  6. Verify the employee slug resolves:
     ```bash
     source .env
     curl -sf -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger?dry_run=true" \
       -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
     ```
  7. Create evidence directory: `mkdir -p .sisyphus/evidence/100-run`
  8. Save all pre-flight results to `.sisyphus/evidence/100-run/preflight.txt`

  **Must NOT do**:
  - DO NOT trigger any real tasks (use `?dry_run=true` only)
  - DO NOT modify any source code or Docker image
  - DO NOT proceed if credits < 0.50

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple sequential checks with no code changes — just curl + jq + file writes
  - **Skills**: []
    - No domain-specific skills needed — all commands are in the plan
  - **Skills Evaluated but Omitted**:
    - `debugging-lifecycle`: Not debugging — just verifying services are up

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/10-run-revalidation.txt` — Previous 10-run evidence format to follow for consistency

  **API/Type References**:
  - OpenRouter auth/key endpoint: `https://openrouter.ai/api/v1/auth/key` — Returns `{ data: { limit_remaining: number } }`
  - Admin trigger (dry_run): `POST /admin/tenants/:tenantId/employees/:slug/trigger?dry_run=true` — validates without creating

  **External References**:
  - AGENTS.md § Admin API — endpoint docs and auth header format

  **WHY Each Reference Matters**:
  - The 10-run evidence file shows the exact format (task ID table, pass/fail column) so Task 2/3 evidence is consistent
  - The dry_run endpoint confirms the entire trigger path works without creating a real task

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All services healthy and credits sufficient
    Tool: Bash
    Preconditions: `pnpm dev` running, Docker image built
    Steps:
      1. curl -sf http://localhost:7700/health → HTTP 200
      2. curl -sf http://localhost:8288/health → HTTP 200
      3. curl -s https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq -r '.data.limit_remaining' → number > 0.50
      4. docker inspect ai-employee-worker:latest --format '{{.Id}}' → sha256:2961ea8894cf (starts with this prefix)
      5. Dry-run trigger returns HTTP 200 or 202
      6. cat .sisyphus/evidence/100-run/preflight.txt → contains all 5 check results
    Expected Result: All 6 checks pass; preflight.txt exists with full results
    Failure Indicators: Any curl returns non-zero exit code; credits < 0.50; Docker image SHA doesn't match
    Evidence: .sisyphus/evidence/100-run/preflight.txt

  Scenario: Insufficient credits blocks progression
    Tool: Bash
    Preconditions: Credits hypothetically < 0.50
    Steps:
      1. Read credit balance from OpenRouter API
      2. If < 0.50: print "BLOCKED: Insufficient credits ($CREDITS remaining, need > 0.50)" and exit with error
    Expected Result: Task fails with clear message about insufficient credits — does NOT proceed to Task 2
    Failure Indicators: Task proceeds despite low credits
    Evidence: .sisyphus/evidence/100-run/preflight.txt (will contain the BLOCKED message)
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/100-run/preflight.txt` — all check results with timestamps

  **Commit**: NO (evidence only — committed with final report)

- [x] 2. Execute Batches 1–5 (Runs 1–50)

  **What to do**:

  For each batch (1 through 5), execute this exact sequence:

  **A. Pre-batch credit check:**

  ```bash
  source .env
  CREDITS=$(curl -s https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq -r '.data.limit_remaining')
  echo "Batch N — Credits remaining: $CREDITS"
  # If credits < 0.10: STOP. Print "PAUSED: Credits low ($CREDITS). Top up and re-run." Save state and exit.
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

  **C. Wait 300 seconds for all runs to complete:**

  ```bash
  echo "Waiting 300s for batch N to complete..."
  sleep 300
  ```

  **D. Verify each task (three-part check):**
  For each `TASK_ID` in the batch:

  ```bash
  # 1. Status check
  STATUS=$(psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -A -c "SELECT status FROM tasks WHERE id = '$TASK_ID';")

  # 2. Delivery log existence
  SHORT_ID=$(echo "$TASK_ID" | cut -c1-8)
  DELIVERY_LOG="/tmp/employee-delivery-${SHORT_ID}.log"
  LOG_EXISTS=$([ -f "$DELIVERY_LOG" ] && echo "YES" || echo "NO")

  # 3. post-message grep (case-insensitive)
  if [ -f "$DELIVERY_LOG" ]; then
    POST_MSG_COUNT=$(grep -ci "post-message" "$DELIVERY_LOG" || echo "0")
  else
    POST_MSG_COUNT="0"
  fi

  # 4. Duration (from task timestamps)
  DURATION=$(psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -A -c \
    "SELECT EXTRACT(EPOCH FROM (updated_at - created_at))::int FROM tasks WHERE id = '$TASK_ID';")

  # 5. Determine PASS/FAIL
  if [ "$STATUS" = "Done" ] && [ "$LOG_EXISTS" = "YES" ] && [ "$POST_MSG_COUNT" -ge 1 ]; then
    RESULT="PASS"
  else
    RESULT="FAIL"
  fi

  # 6. Flag slow runs
  SLOW_FLAG=""
  if [ "$DURATION" -gt 300 ]; then
    SLOW_FLAG=" [SLOW]"
  fi

  echo "$TASK_ID | $STATUS | $LOG_EXISTS | $POST_MSG_COUNT | ${DURATION}s | ${RESULT}${SLOW_FLAG}"
  ```

  **E. Docker health check every 20 runs (after batches 2 and 4):**

  ```bash
  EXITED=$(docker ps --filter status=exited --format '{{.Names}}' | wc -l | tr -d ' ')
  echo "Docker exited containers: $EXITED"
  docker inspect ai-employee-worker:latest --format '{{.Id}}'
  ```

  **F. Save batch results:**
  Append results table to `.sisyphus/evidence/100-run/batch-NN.txt` (zero-padded: batch-01.txt through batch-05.txt).

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
  Docker health: N exited containers
  ```

  **G. If any run has status `Failed` with a non-402 error:**
  - Check the execution log: `cat /tmp/employee-${SHORT_ID}.log | tail -50`
  - Check the delivery log if it exists: `cat /tmp/employee-delivery-${SHORT_ID}.log | tail -50`
  - Record the failure reason in the batch file
  - **Continue to next batch** (do NOT stop — document and continue per guardrails)
  - EXCEPTION: If 3+ consecutive runs fail with the same non-credit error, STOP and report

  **H. If any run fails with HTTP 402 (credit exhaustion):**
  - STOP the current batch
  - Print: "PAUSED at Batch N, Run M: Credit exhaustion detected. Top up credits and re-run this task."
  - Save partial batch results
  - Exit cleanly — the orchestrator will re-run this task after credits are topped up
  - 402 runs do NOT count toward the 100-run total

  **Must NOT do**:
  - DO NOT modify any source code or rebuild Docker image
  - DO NOT trigger runs faster than 5s apart
  - DO NOT fix anything discovered during runs
  - DO NOT use the Inngest Dev Server UI as evidence
  - DO NOT count HTTP 402 failures toward pass rate
  - DO NOT continue if 3+ consecutive non-credit failures occur

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Long-running task (~30 min for 5 batches × 300s wait), requires careful state tracking across 50 runs, conditional logic for credit checks and failure handling
  - **Skills**: []
    - No domain-specific skills needed — all commands are explicit in the plan
  - **Skills Evaluated but Omitted**:
    - `debugging-lifecycle`: Would be loaded only if investigating a code bug — not expected here

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/10-run-revalidation.txt` — Previous 10-run evidence format (task ID table with pass/fail)
  - `.sisyphus/evidence/100-run/preflight.txt` — Docker image SHA and credit baseline from Task 1

  **API/Type References**:
  - Admin trigger: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger` — Returns `{ task_id, status_url }`
  - OpenRouter auth/key: `https://openrouter.ai/api/v1/auth/key` — Returns `{ data: { limit_remaining } }`
  - Tasks table: `tasks.id`, `tasks.status`, `tasks.created_at`, `tasks.updated_at`

  **External References**:
  - AGENTS.md § Admin API — trigger endpoint, auth header
  - AGENTS.md § Known Issues § Inngest Dev Server — why NOT to use Inngest UI as evidence

  **WHY Each Reference Matters**:
  - The 10-run evidence format ensures consistency across all evidence files
  - The preflight SHA is the baseline to compare against in Docker health checks
  - The tasks table schema shows which columns to query for status and duration

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — all 50 runs pass
    Tool: Bash
    Preconditions: Services healthy (Task 1 passed), credits > $0.50
    Steps:
      1. Execute batches 1-5 following the exact sequence above
      2. For each batch: verify pre-batch credit check logged
      3. For each run: verify three-part check (Done + log + post-message)
      4. After batches 2 and 4: verify Docker health check logged
      5. Verify all 5 batch files exist: ls .sisyphus/evidence/100-run/batch-0{1..5}.txt
      6. Count total PASS across all batch files: grep -c "PASS" .sisyphus/evidence/100-run/batch-0*.txt
    Expected Result: 50/50 PASS across batch-01.txt through batch-05.txt; 2 Docker health checks logged
    Failure Indicators: Any batch file missing; PASS count < 50; Docker SHA mismatch
    Evidence: .sisyphus/evidence/100-run/batch-01.txt through batch-05.txt

  Scenario: Credit exhaustion mid-batch
    Tool: Bash
    Preconditions: Credits drop below threshold during a batch
    Steps:
      1. Pre-batch credit check returns < 0.10
      2. Task prints "PAUSED" message with current credit balance
      3. Partial batch results saved to evidence file
      4. Task exits cleanly without triggering more runs
    Expected Result: Clean pause with saved state; no runs lost; clear message about credit top-up needed
    Failure Indicators: Task crashes; partial results lost; continues triggering despite low credits
    Evidence: .sisyphus/evidence/100-run/batch-NN.txt (partial, with PAUSED notation)

  Scenario: Non-credit failure detected
    Tool: Bash
    Preconditions: A run reaches Failed status for non-402 reason
    Steps:
      1. Three-part check detects status != Done
      2. Execution and delivery logs are inspected (tail -50)
      3. Failure reason recorded in batch evidence file
      4. Batch continues to next run (unless 3+ consecutive same-type failures)
    Expected Result: Failure documented; batch continues; failure counted in summary
    Failure Indicators: Batch stops on first non-credit failure (should continue); failure not documented
    Evidence: .sisyphus/evidence/100-run/batch-NN.txt (with failure details)
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/100-run/batch-01.txt` through `batch-05.txt` — per-batch results with timestamps
  - [ ] Docker health snapshots embedded in batch-02.txt and batch-04.txt

  **Commit**: NO (evidence only — committed with final report)

- [x] 3. Execute Batches 6–10 (Runs 51–100)

  **What to do**:

  Identical procedure to Task 2, but for batches 6 through 10. The ONLY differences:
  1. Batch numbering: 6–10 (evidence files: `batch-06.txt` through `batch-10.txt`)
  2. Run numbering: 51–100
  3. Docker health checks: after batches 7 and 9 (every 20 runs, continuing the count from Task 2)
  4. **Before starting**: Read Task 2's final batch file (`batch-05.txt`) to confirm it completed. If batch-05 is missing or incomplete, STOP and report.

  All steps A–H from Task 2 apply identically. Refer to Task 2 for the full procedure.

  **Additional end-of-task step:**
  After batch 10 completes, compile the consolidated results table:

  ```bash
  echo "CONSOLIDATED RESULTS — 100 Runs" > .sisyphus/evidence/100-run/results-table.txt
  echo "================================" >> .sisyphus/evidence/100-run/results-table.txt
  for f in .sisyphus/evidence/100-run/batch-*.txt; do
    grep -E "^[0-9a-f]{8}-" "$f" >> .sisyphus/evidence/100-run/results-table.txt
  done
  echo "================================" >> .sisyphus/evidence/100-run/results-table.txt
  TOTAL_PASS=$(grep -c "PASS" .sisyphus/evidence/100-run/results-table.txt)
  TOTAL_FAIL=$(grep -c "FAIL" .sisyphus/evidence/100-run/results-table.txt || echo "0")
  echo "TOTAL: $TOTAL_PASS PASS / $TOTAL_FAIL FAIL out of $((TOTAL_PASS + TOTAL_FAIL)) runs" >> .sisyphus/evidence/100-run/results-table.txt
  ```

  Also verify Docker image SHA hasn't changed:

  ```bash
  CURRENT_SHA=$(docker inspect ai-employee-worker:latest --format '{{.Id}}')
  ORIGINAL_SHA=$(grep "Docker image SHA" .sisyphus/evidence/100-run/preflight.txt | awk '{print $NF}')
  if [ "$CURRENT_SHA" = "$ORIGINAL_SHA" ]; then
    echo "Docker image SHA: MATCH ($CURRENT_SHA)"
  else
    echo "WARNING: Docker image SHA CHANGED! Original: $ORIGINAL_SHA Current: $CURRENT_SHA"
  fi
  ```

  **Must NOT do**:
  - Same guardrails as Task 2
  - DO NOT re-run batches 1-5 (those are Task 2's responsibility)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Same as Task 2 — long-running (~30 min), careful state tracking across 50 runs
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `debugging-lifecycle`: Same as Task 2

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - Task 2 (this plan) — Full procedure for steps A–H; follow identically
  - `.sisyphus/evidence/100-run/batch-05.txt` — Must exist and show batch 5 completed before starting
  - `.sisyphus/evidence/100-run/preflight.txt` — Original Docker image SHA for end-of-task comparison

  **API/Type References**:
  - Same as Task 2

  **External References**:
  - Same as Task 2

  **WHY Each Reference Matters**:
  - Task 2 defines the canonical procedure — Task 3 must not deviate
  - batch-05.txt proves the first 50 runs completed before starting the next 50
  - preflight.txt SHA is the baseline for the end-of-run Docker integrity check

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — all 50 runs (51-100) pass
    Tool: Bash
    Preconditions: Task 2 completed (batch-05.txt exists with results)
    Steps:
      1. Verify batch-05.txt exists and shows batch 5 completed
      2. Execute batches 6-10 following Task 2's exact procedure
      3. Verify all 5 batch files exist: ls .sisyphus/evidence/100-run/batch-{06..10}.txt
      4. Verify results-table.txt exists with all 100 runs
      5. grep -c "PASS" .sisyphus/evidence/100-run/results-table.txt → ≥98
      6. Docker SHA comparison shows MATCH
    Expected Result: 50/50 PASS for runs 51-100; results-table.txt has 100 rows; Docker SHA unchanged
    Failure Indicators: batch-05 missing; any batch-06 through batch-10 file missing; SHA mismatch
    Evidence: .sisyphus/evidence/100-run/batch-06.txt through batch-10.txt, results-table.txt

  Scenario: Credit exhaustion mid-batch (same as Task 2)
    Tool: Bash
    Preconditions: Credits drop below threshold
    Steps: Same as Task 2 Scenario 2
    Expected Result: Clean pause with saved state
    Evidence: .sisyphus/evidence/100-run/batch-NN.txt (partial)
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/100-run/batch-06.txt` through `batch-10.txt`
  - [ ] `.sisyphus/evidence/100-run/results-table.txt` — consolidated 100-run table
  - [ ] `.sisyphus/evidence/100-run/docker-health.txt` — final Docker SHA comparison

  **Commit**: NO (evidence only — committed with final report)

- [x] 4. Compile Statistical Report

  **What to do**:

  Read `results-table.txt` and all batch files to compile a comprehensive statistical report:
  1. **Pass rate calculation:**

     ```bash
     TOTAL_PASS=$(grep -c "PASS" .sisyphus/evidence/100-run/results-table.txt)
     TOTAL_FAIL=$(grep -c "FAIL" .sisyphus/evidence/100-run/results-table.txt || echo "0")
     TOTAL=$((TOTAL_PASS + TOTAL_FAIL))
     PASS_RATE=$(echo "scale=1; $TOTAL_PASS * 100 / $TOTAL" | bc)
     echo "Pass Rate: $TOTAL_PASS/$TOTAL ($PASS_RATE%)"
     ```

  2. **Failure breakdown by type** (if any failures):
     For each FAIL row, classify:
     - `CREDIT_402`: HTTP 402 in logs (excluded from pass rate per guardrails)
     - `SLACK_429`: Slack rate limit in delivery log
     - `NO_DELIVERY_LOG`: Done but no delivery log file
     - `NO_POST_MESSAGE`: Delivery log exists but no post-message call
     - `EXECUTION_FAILED`: Status != Done
     - `UNKNOWN`: None of the above

  3. **Duration statistics:**
     Extract all durations from results-table.txt and calculate:

     ```bash
     # Extract durations, sort, calculate percentiles
     DURATIONS=$(grep "PASS\|FAIL" .sisyphus/evidence/100-run/results-table.txt | awk -F'|' '{print $5}' | tr -d 's ' | sort -n)
     COUNT=$(echo "$DURATIONS" | wc -l | tr -d ' ')
     P50_IDX=$((COUNT / 2))
     P95_IDX=$((COUNT * 95 / 100))
     MIN=$(echo "$DURATIONS" | head -1)
     MAX=$(echo "$DURATIONS" | tail -1)
     P50=$(echo "$DURATIONS" | sed -n "${P50_IDX}p")
     P95=$(echo "$DURATIONS" | sed -n "${P95_IDX}p")
     MEAN=$(echo "$DURATIONS" | awk '{sum+=$1} END {printf "%.0f", sum/NR}')
     echo "Duration: min=${MIN}s p50=${P50}s p95=${P95}s max=${MAX}s mean=${MEAN}s"
     ```

  4. **Slow run analysis** (any run >300s):
     List all runs flagged as SLOW with their task IDs and durations.

  5. **Confidence interval** (Wilson score interval for binomial proportion):
     For pass rate p with n trials:

     ```
     z = 1.96 (95% CI)
     center = (p + z²/2n) / (1 + z²/n)
     margin = z * sqrt(p*(1-p)/n + z²/4n²) / (1 + z²/n)
     CI = [center - margin, center + margin]
     ```

     For 98/100: CI ≈ [93.0%, 99.5%]
     For 100/100: CI ≈ [96.3%, 100%]

  6. **Batch-over-batch trend:**
     Show pass rate per batch to detect degradation:

     ```
     Batch 1: 10/10 (100%)
     Batch 2: 10/10 (100%)
     ...
     Batch 10: 10/10 (100%)
     ```

  7. **Credit consumption:**
     Record starting and ending credit balance (from preflight and final batch).

  8. **Docker integrity:**
     Confirm image SHA unchanged from preflight to end.

  9. **Verdict:**
     - ≥98/100: `VERDICT: FIX CONFIRMED — Delivery reliability meets production threshold`
     - 95-97/100: `VERDICT: FIX LIKELY WORKS — Investigate failure patterns before production confidence`
     - <95/100: `VERDICT: FIX INSUFFICIENT — Further investigation required`

  Save the full report to `.sisyphus/evidence/100-run/statistical-report.txt`.

  **Must NOT do**:
  - DO NOT modify results-table.txt or batch files (read-only analysis)
  - DO NOT re-run any failed tasks
  - DO NOT manually adjust pass/fail counts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure data analysis — reading evidence files and computing statistics. No long-running operations, no external API calls.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - No skills are relevant for statistical analysis of text files

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/100-run/results-table.txt` — Source data for all statistics (created by Task 3)
  - `.sisyphus/evidence/100-run/batch-*.txt` — Per-batch details including credit checks and Docker health
  - `.sisyphus/evidence/100-run/preflight.txt` — Starting credit balance and Docker SHA baseline

  **WHY Each Reference Matters**:
  - results-table.txt is the single source of truth for pass/fail counts and durations
  - Batch files contain credit snapshots and Docker health checks needed for the full report
  - preflight.txt provides the "before" values for credit consumption and Docker integrity sections

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Statistical report is complete and accurate
    Tool: Bash
    Preconditions: results-table.txt exists with 100 rows (from Task 3)
    Steps:
      1. cat .sisyphus/evidence/100-run/statistical-report.txt
      2. Verify report contains ALL sections:
         - "Pass Rate" with N/100 and percentage
         - "Failure Breakdown" (present even if 0 failures: "No failures")
         - "Duration Statistics" with min, p50, p95, max, mean
         - "Slow Runs" section (present even if 0: "No runs exceeded 300s")
         - "Confidence Interval" with lower and upper bounds
         - "Batch Trend" with 10 rows
         - "Credit Consumption" with start and end balances
         - "Docker Integrity" with SHA comparison result
         - "VERDICT" line matching one of the three verdict templates
      3. Verify PASS count in report matches: grep -c "PASS" .sisyphus/evidence/100-run/results-table.txt
      4. Verify duration stats are numeric and reasonable (60s < p50 < 400s)
    Expected Result: Report file exists, contains all 9 sections, numbers match source data
    Failure Indicators: Missing section; PASS count mismatch; duration stats outside reasonable range; no VERDICT line
    Evidence: .sisyphus/evidence/100-run/statistical-report.txt

  Scenario: Report handles edge case of 0 failures
    Tool: Bash
    Preconditions: All 100 runs passed
    Steps:
      1. Failure Breakdown section shows "No failures detected"
      2. Verdict shows "FIX CONFIRMED"
      3. Confidence interval is calculated for p=1.0
    Expected Result: Clean report with no error handling artifacts
    Evidence: .sisyphus/evidence/100-run/statistical-report.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/100-run/statistical-report.txt` — complete report with all 9 sections

  **Commit**: YES
  - Message: `chore(validation): add 100-run delivery reliability report and evidence`
  - Files: `.sisyphus/evidence/100-run/*`, `.sisyphus/plans/100-run-delivery-validation.md`
  - Pre-commit: — (no tests to run)

- [x] 5. Notify Completion via Telegram

  **What to do**:
  1. Read the verdict from the statistical report:

     ```bash
     VERDICT=$(grep "VERDICT:" .sisyphus/evidence/100-run/statistical-report.txt)
     PASS_RATE=$(grep "Pass Rate:" .sisyphus/evidence/100-run/statistical-report.txt | head -1)
     ```

  2. Send Telegram notification:

     ```bash
     tsx scripts/telegram-notify.ts "📊 100-Run Delivery Validation Complete

     $PASS_RATE
     $VERDICT

     Evidence: .sisyphus/evidence/100-run/
     Come back to review the full report."
     ```

  **Must NOT do**:
  - DO NOT send notification if statistical report doesn't exist
  - DO NOT modify any evidence files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command — read a file and send a Telegram message
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 4)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `scripts/telegram-notify.ts` — Telegram notification script (takes message string as argument)
  - `.sisyphus/evidence/100-run/statistical-report.txt` — Source for verdict and pass rate

  **WHY Each Reference Matters**:
  - The notification script is the only approved way to send Telegram messages (per AGENTS.md)
  - The report is the source of truth for the notification content

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent with correct content
    Tool: Bash
    Preconditions: statistical-report.txt exists with VERDICT line
    Steps:
      1. tsx scripts/telegram-notify.ts "..." → exit code 0
      2. Message contains pass rate and verdict from report
    Expected Result: Notification sent successfully (exit code 0)
    Failure Indicators: Non-zero exit code; missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env vars
    Evidence: Terminal output showing successful send
  ```

  **Evidence to Capture:**
  - [ ] Terminal output confirming Telegram message sent

  **Commit**: NO (notification only)

---

## Final Verification Wave

> No automated F1-F4 reviewers for this plan — it is a validation exercise, not a code change.
> The user reviews the statistical report and makes the final call.
>
> **Present the statistical report to the user and wait for explicit "okay" before declaring the validation complete.**

---

## Commit Strategy

| Commit | Message                                                              | Files                                                                           | Pre-commit |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 1      | `chore(sisyphus): add 100-run delivery validation plan and evidence` | `.sisyphus/plans/100-run-delivery-validation.md`, `.sisyphus/evidence/100-run/` | —          |

---

## Success Criteria

### Pass Threshold

- **≥98/100**: Fix confirmed — residual failures are infra-related, not code bugs
- **95-97/100**: Fix likely works but investigate failure patterns
- **<95/100**: Fix insufficient — new investigation needed

### Verification Commands

```bash
# Count pass/fail from evidence
grep -c "PASS" .sisyphus/evidence/100-run/results-table.txt
grep -c "FAIL" .sisyphus/evidence/100-run/results-table.txt

# Check Docker image unchanged
docker inspect ai-employee-worker:latest --format '{{.Id}}'
# Expected: sha256:2961ea8894cf...
```

### Final Checklist

- [ ] 100 tasks triggered
- [ ] ≥98 passed three-part verification
- [ ] All failures classified
- [ ] Statistical report complete
- [ ] Docker image SHA unchanged
- [ ] User reviewed and approved
