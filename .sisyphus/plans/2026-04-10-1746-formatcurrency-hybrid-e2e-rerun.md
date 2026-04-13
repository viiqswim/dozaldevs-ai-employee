# formatCurrency Hybrid E2E Rerun — Full Pipeline Validation

## TL;DR

> **Quick Summary**: Fire a fresh Fly.io hybrid E2E run with the same `formatCurrency` ticket as PR #24, verify 12/12 on `pnpm verify:e2e`, and confirm the PR contains the correct implementation. Resolve any issues inline as they arise.
>
> **Deliverables**:
>
> - A new PR on `viiqswim/ai-employee-test-target` implementing `formatCurrency`
> - `pnpm verify:e2e --task-id <uuid>` showing 12/12 PASS
> - Evidence files saved to `.sisyphus/evidence/formatcurrency-rerun/`
>
> **Estimated Effort**: Short (45–90 min E2E run + monitoring)
> **Parallel Execution**: NO — sequential pipeline
> **Critical Path**: T1 → T2 → T3 → T4 → T5

---

## Context

### Original Request

Run the same `formatCurrency` task from PR #24 again on the Fly.io hybrid pipeline to confirm end-to-end correctness. Resolve any issues encountered inline.

### Task Being Replicated

**Ticket**: "Add formatCurrency utility function"
**Payload file**: `test-payloads/jira-realistic-task.json` (this IS the default `pnpm trigger-task` payload)
**Spec**:

- Add `formatCurrency(amount: number, currency?: string): string` to `src/index.ts`
- Formats `1234.5` → `'$1,234.50'` (default USD)
- Formats `1000000` → `'$1,000,000.00'`
- Handles negatives: `-99.99` → `'-$99.99'`
- Supports other currencies via second param (EUR → `€`, GBP → `£`, JPY → `¥`)
- Unit tests in `src/index.test.ts` (Vitest)
- TypeScript compiles cleanly

**PR #24 reference**: https://github.com/viiqswim/ai-employee-test-target/pull/24
(Contains the canonical correct implementation to compare against)

### Infrastructure State (as of plan creation)

- **Gateway**: http://localhost:3000 → 200 ✅
- **Inngest Dev**: http://localhost:8288 → 200 ✅
- **Cloudflare Tunnel**: `https://captured-capture-daughters-dirt.trycloudflare.com` → 401 (alive) ✅
- **Fly machines**: 0 orphaned ✅
- **Worker image**: `registry.fly.io/ai-employee-workers:latest` (pushed, current) ✅
- **.env**: `USE_FLY_HYBRID=1`, `TUNNEL_URL` set, `FLY_HYBRID_POLL_MAX=240` ✅
- **Existing stale branch**: `ai/TEST-1775855651-test-1775855651` on GitHub (PR #24 open) — fresh key avoids collision

### Key Facts

- `pnpm trigger-task` with `--key TEST-$(date +%s)` creates a unique branch each run; no conflict with PR #24's branch
- Branch naming: `ai/{KEY}-{key-lowercase}` — fresh key → fresh branch
- Tunnel URL is read from `.env` at gateway startup; do NOT need to restart gateway if tunnel is already alive
- `FLY_HYBRID_POLL_MAX=240` = 120 min ceiling (30s × 240 polls)
- Worker E2E typically completes in 45–60 min

---

## Work Objectives

### Core Objective

Prove the Fly.io hybrid pipeline delivers a correct `formatCurrency` PR from a cold start with zero manual intervention.

### Concrete Deliverables

- `pnpm verify:e2e --task-id <uuid>` → 12/12 PASS
- PR on `viiqswim/ai-employee-test-target` with `formatCurrency` implementation
- Evidence saved to `.sisyphus/evidence/formatcurrency-rerun/`

### Definition of Done

- [ ] `pnpm verify:e2e --task-id <uuid>` shows `ALL 12/12 CHECKS PASSED`
- [ ] PR link returned and accessible on GitHub
- [ ] PR diff contains `formatCurrency` function in `src/index.ts`
- [ ] PR diff contains Vitest tests in `src/index.test.ts`

### Must Have

- Fresh unique key (no branch collision with PR #24)
- All 12 verify:e2e checks must pass — no partial credit
- PR must contain correct `formatCurrency` implementation (not just scaffolding)
- All infrastructure issues resolved inline — no abandonment

### Must NOT Have

- Manual DB writes during the run
- `--no-verify` on any git commits
- Reuse of the key `TEST-1775855651` or branch `ai/TEST-1775855651-*` (already used by PR #24)
- Declaring success without running `pnpm verify:e2e` against the new task UUID

---

## Verification Strategy

### Test Decision

- **Automated tests**: N/A for this plan (no code changes to the platform itself)
- **Agent-Executed QA**: YES — verify:e2e 12-point check is the primary verification

### QA Policy

Evidence saved to `.sisyphus/evidence/formatcurrency-rerun/`. Every terminal state must be captured.

---

## Execution Strategy

### Sequential Execution (inherently sequential — E2E pipeline)

```
T1 → T2 → T3 → T4 → T5

T1: Pre-flight checks + stale branch cleanup
T2: Fire fresh hybrid E2E run
T3: Monitor to completion (resolve issues inline)
T4: Run verify:e2e + validate PR content
T5: Save evidence + summary
```

---

## TODOs

---

- [x] 1. Pre-flight checks + stale branch cleanup

  **What to do**:

  ### 1a. Verify all infrastructure is healthy

  ```bash
  # Gateway
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  # Expected: 200. If not: check ai-gateway tmux session, restart if needed.

  # Inngest Dev Server
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8288/health
  # Expected: 200. If not: DO NOT kill ai-dev session. Check tmux capture-pane -t ai-dev -p.

  # Tunnel liveness
  TUNNEL_URL=$(grep "^TUNNEL_URL=" /Users/victordozal/repos/dozal-devs/ai-employee/.env | cut -d= -f2)
  curl -s -o /dev/null -w "%{http_code}" "${TUNNEL_URL}/rest/v1/"
  # Expected: 200 or 401 (PostgREST responding = tunnel alive).
  # If 000 (connection refused) = tunnel dead → see ISSUE: Tunnel Dead below.
  ```

  ### 1b. Verify no orphaned Fly machines

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length'
  # Expected: 0. If any machines exist:
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq -r '.[].id' | \
    xargs -I{} fly machines destroy {} --app ai-employee-workers --force
  ```

  ### 1c. Check for stale branches that could cause push-rejection

  The fresh timestamp key creates a new unique branch, so PR #24's branch (`ai/TEST-1775855651-*`) is NOT a problem. However, check if any recent run left a branch that matches the new key pattern (unlikely but defensive):

  ```bash
  NEW_KEY="TEST-$(date +%s)"
  echo "Will use key: $NEW_KEY"
  # Branch will be: ai/${NEW_KEY}-${NEW_KEY_LOWERCASE}
  # e.g. ai/TEST-1775855651-test-1775855651
  # Save the key for T2:
  echo "$NEW_KEY" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-rerun/planned-key.txt
  mkdir -p /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-rerun
  echo "$NEW_KEY" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-rerun/planned-key.txt
  ```

  ### ISSUE RESOLUTION: Tunnel Dead

  If tunnel returns `000` (connection refused):
  1. Kill old tunnel session: `tmux kill-session -t ai-tunnel 2>/dev/null`
  2. Start fresh tunnel:
     ```bash
     tmux new-session -d -s ai-tunnel -x 220 -y 50
     tmux send-keys -t ai-tunnel \
       "cloudflared tunnel --url http://localhost:54321 2>&1 | tee /tmp/ai-tunnel-new.log" \
       Enter
     sleep 20
     NEW_TUNNEL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/ai-tunnel-new.log | head -1)
     echo "New tunnel: $NEW_TUNNEL"
     ```
  3. Update `.env`:
     ```bash
     sed -i '' "s|^TUNNEL_URL=.*|TUNNEL_URL=$NEW_TUNNEL|" .env
     ```
  4. Restart gateway (it reads TUNNEL_URL at startup):
     ```bash
     tmux send-keys -t ai-gateway C-c
     sleep 2
     tmux send-keys -t ai-gateway "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev:start 2>&1 | tee /tmp/ai-gateway-new.log" Enter
     sleep 5
     curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
     # Expected: 200
     ```

  ### ISSUE RESOLUTION: Gateway Down

  If gateway returns non-200:

  ```bash
  tmux capture-pane -t ai-gateway -p | tail -20  # diagnose
  # Restart:
  tmux send-keys -t ai-gateway C-c
  sleep 2
  tmux send-keys -t ai-gateway "cd /Users/victordozal/repos/dozal-devs/ai-employee && node dist/gateway/server.js 2>&1 | tee /tmp/ai-gateway-restart.log" Enter
  sleep 5
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — must pass before T2
  - **Blocks**: T2
  - **Blocked By**: None (start immediately)

  **Acceptance Criteria**:
  - Gateway → 200 ✅
  - Inngest → 200 ✅
  - Tunnel → 200 or 401 (not 000) ✅
  - Fly machines count = 0 ✅
  - `planned-key.txt` saved ✅

  **QA Scenarios**:

  ```
  Scenario: All infrastructure healthy
    Tool: Bash
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health → 200
      2. curl -s -o /dev/null -w "%{http_code}" http://localhost:8288/health → 200
      3. curl on TUNNEL_URL/rest/v1/ → 200 or 401 (not 000)
      4. fly machines list length → 0
    Expected Result: All 4 checks green
    Failure Indicator: Any check fails → apply ISSUE RESOLUTION steps above before proceeding
    Evidence: .sisyphus/evidence/formatcurrency-rerun/preflight.txt
  ```

  **Commit**: NO

---

- [x] 2. Fire fresh hybrid E2E run

  **What to do**:

  ### 2a. Read the planned key

  ```bash
  NEW_KEY=$(cat /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-rerun/planned-key.txt)
  echo "Firing with key: $NEW_KEY"
  ```

  ### 2b. Launch trigger-task in tmux (MANDATORY — long-running command protocol)

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee

  # Kill any leftover session
  tmux kill-session -t ai-fc-e2e 2>/dev/null || true

  # Launch new session
  tmux new-session -d -s ai-fc-e2e -x 220 -y 50
  tmux send-keys -t ai-fc-e2e \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && USE_FLY_HYBRID=1 pnpm trigger-task -- --key $NEW_KEY 2>&1 | tee /tmp/ai-fc-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-fc-e2e.log" \
    Enter
  ```

  ### 2c. Wait 30s then capture task UUID

  ```bash
  sleep 30
  TASK_UUID=$(grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" /tmp/ai-fc-e2e.log | head -1)
  echo "Task UUID: $TASK_UUID"
  echo "$TASK_UUID" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-rerun/task-id.txt
  ```

  If UUID not yet in log after 30s, wait another 30s and try again (gateway processing can take up to 60s).

  **Must NOT do**:
  - Do NOT run `pnpm trigger-task` as a blocking shell call (must use tmux)
  - Do NOT reuse key `TEST-1775855651` (already on GitHub as PR #24)
  - Do NOT proceed to T3 until task UUID is captured

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after T1
  - **Blocks**: T3
  - **Blocked By**: T1

  **References**:
  - `scripts/trigger-task.ts` — what trigger-task does
  - `test-payloads/jira-realistic-task.json` — the formatCurrency payload being sent
  - AGENTS.md — Long-Running Command Protocol (tmux pattern)

  **Acceptance Criteria**:
  - tmux session `ai-fc-e2e` is running ✅
  - `task-id.txt` contains a valid UUID ✅
  - Log shows `HTTP 200` response from gateway ✅

  **QA Scenarios**:

  ```
  Scenario: Trigger fired and UUID captured
    Tool: Bash
    Steps:
      1. tmux list-sessions | grep ai-fc-e2e → session listed
      2. cat .sisyphus/evidence/formatcurrency-rerun/task-id.txt → valid UUID (36 chars)
      3. grep "HTTP 200" /tmp/ai-fc-e2e.log → gateway accepted webhook
    Expected Result: All 3 checks pass
    Failure Indicator: Session missing or UUID empty → check tmux pane, re-fire
    Evidence: .sisyphus/evidence/formatcurrency-rerun/task-id.txt
  ```

  **Commit**: NO

---

- [x] 3. Monitor to completion — resolve issues inline

  **What to do**:
  Poll `/tmp/ai-fc-e2e.log` every 60 seconds until a terminal state is reached. Handle every failure mode inline without abandoning the run.

  ### 3a. Polling loop (repeat every 60s, up to 90 minutes)

  ```bash
  tail -15 /tmp/ai-fc-e2e.log
  grep "EXIT_CODE:" /tmp/ai-fc-e2e.log && echo "DONE" || echo "STILL RUNNING"
  ```

  ### 3b. Success path

  Log shows:

  ```
  ✓ Task completed
  ✓ Pull Request (https://github.com/viiqswim/ai-employee-test-target/pull/XX)
  Task completed successfully!
  EXIT_CODE:0
  ```

  → Proceed to T4 immediately.

  ### 3c. Failure path — AwaitingInput

  If log shows `AwaitingInput` before Done:

  **Step 1: Get failure reason**

  ```bash
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-rerun/task-id.txt)
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT failure_reason, status FROM tasks WHERE id = '$TASK_UUID';"
  ```

  **Step 2: Get Fly machine logs**

  ```bash
  fly logs --app ai-employee-workers --no-tail 2>&1 | tail -60
  ```

  **Step 3: Diagnose from logs and apply fix**

  | Symptom                          | Root Cause                                                | Fix                                                                                                                                       |
  | -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
  | `POST validation_runs → 400`     | UUID default missing (DB schema issue)                    | Run migration: `psql ... -f prisma/migrations/20260410140640_add_uuid_defaults/migration.sql`                                             |
  | `fetch() 401 Authenticate`       | `FLY_API_TOKEN` not set or expired                        | Check `.env` for `FLY_API_TOKEN`; re-export and restart gateway                                                                           |
  | `git push rejected (stale info)` | Branch exists on GitHub from a previous run with same key | Delete branch: `gh api -X DELETE repos/viiqswim/ai-employee-test-target/git/refs/heads/ai/${KEY}-${KEY_LC}` then re-fire T2 with same key |
  | `EXECUTION_ID=null` in Fly logs  | Worker env not passing EXECUTION_ID                       | Check `src/inngest/lifecycle.ts` hybrid-spawn block; rebuild and push image                                                               |
  | `Polling timed out`              | Machine took >120 min                                     | Check fly machine logs for hang; destroy machine: `fly machines destroy <id> --force` then re-fire                                        |
  | Tunnel `000` during run          | Tunnel died mid-run                                       | Cannot recover current run; restart tunnel (see T1 ISSUE RESOLUTION), update .env, restart gateway, re-fire from T2                       |

  **Step 4: After fix, re-fire if needed**
  If a re-fire is required:

  ```bash
  # Generate a new unique key (don't reuse the failed key — branch may be partially created)
  NEW_KEY="TEST-$(date +%s)"
  echo "$NEW_KEY" > .sisyphus/evidence/formatcurrency-rerun/planned-key.txt
  # Then re-execute T2 steps
  ```

  ### 3d. Save terminal state evidence

  ```bash
  cp /tmp/ai-fc-e2e.log .sisyphus/evidence/formatcurrency-rerun/trigger-task-run.log
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-rerun/task-id.txt)
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT status, failure_reason FROM tasks WHERE id = '$TASK_UUID';" \
    > .sisyphus/evidence/formatcurrency-rerun/db-final-status.txt
  ```

  **Must NOT do**:
  - Do NOT manually write to the DB during the run (no psql UPDATE)
  - Do NOT kill the `ai-dev` session (Inngest Dev Server)
  - Do NOT kill the tunnel during the run
  - Do NOT declare Done until the log shows `Task completed successfully!` and `EXIT_CODE:0`
  - Cap at 90 minutes of waiting; after 90 min with no progress, apply the timeout fix above

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after T2
  - **Blocks**: T4
  - **Blocked By**: T2

  **References**:
  - `scripts/trigger-task.ts` — what terminal state looks like in logs
  - `scripts/verify-e2e.ts` — the 12 checks (understand what each checks so you can diagnose failures proactively)
  - `src/inngest/lifecycle.ts` — hybrid-spawn block (lines 97–169) for EXECUTION_ID issues
  - `src/workers/lib/validation-pipeline.ts` — try/catch around validation_runs write
  - `src/workers/orchestrate.mts` — AwaitingInput writes in failure paths
  - `.sisyphus/notepads/2026-04-09-2356-check6-fly-hybrid/learnings.md` — all bug fixes from previous session

  **Acceptance Criteria**:
  - `trigger-task-run.log` shows `EXIT_CODE:0` ✅
  - DB status = `Done` ✅
  - PR URL present in log ✅

  **QA Scenarios**:

  ```
  Scenario: Run completes successfully (Done)
    Tool: Bash
    Steps:
      1. grep "EXIT_CODE:0" /tmp/ai-fc-e2e.log → found
      2. psql query → status = 'Done'
      3. grep "Pull Request" /tmp/ai-fc-e2e.log → PR URL present
    Expected Result: All 3 pass
    Failure Indicator: EXIT_CODE:1 or status = AwaitingInput → apply inline fixes above
    Evidence: .sisyphus/evidence/formatcurrency-rerun/trigger-task-run.log
              .sisyphus/evidence/formatcurrency-rerun/db-final-status.txt

  Scenario: No manual DB writes occurred
    Tool: Bash
    Steps:
      1. psql "..." -c "SELECT actor FROM task_status_log WHERE task_id = '$TASK_UUID' ORDER BY created_at;"
    Expected Result: All actors = 'gateway', 'lifecycle_fn', or 'machine' — none = 'manual'
    Evidence: .sisyphus/evidence/formatcurrency-rerun/status-log-actors.txt
  ```

  **Commit**: NO

---

- [x] 4. Run verify:e2e + validate PR content

  **What to do**:

  ### 4a. Run the 12-point verification

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-rerun/task-id.txt)
  pnpm verify:e2e --task-id $TASK_UUID 2>&1 | tee .sisyphus/evidence/formatcurrency-rerun/verify-e2e.txt
  ```

  **Expected**: `✅  ALL 12/12 CHECKS PASSED — Phase 8 Done!`

  If any check fails, diagnose and fix inline — do NOT move to T5 with a failed verify.

  ### Common verify:e2e failure fixes

  | Check                                | Symptom                       | Fix                                                                 |
  | ------------------------------------ | ----------------------------- | ------------------------------------------------------------------- |
  | Check 5 (heartbeat)                  | `execution.heartbeat_at` null | Worker didn't start — check Fly logs; may need image rebuild        |
  | Check 6 (validation_runs)            | 0 validation run(s) recorded  | UUID defaults missing; run migration or re-fire after fix           |
  | Check 7 (PR)                         | PR not found                  | Git push may have failed; check Fly logs for `fatal: push rejected` |
  | Check 9 (audit trail)                | Missing status transitions    | Worker completion.ts failed — check Fly logs                        |
  | Check 10 (deliverable)               | No deliverable record         | PostgREST insert failed; check completion.ts + UUID defaults        |
  | Check 11 (execution fully populated) | Fields null                   | Worker crashed before writing tokens; check orchestrate.mts logs    |
  | Check 12 (cleanup)                   | Machine still running         | `fly machines destroy <id> --app ai-employee-workers --force`       |

  ### 4b. Validate PR content matches formatCurrency spec

  Extract the PR number from the log:

  ```bash
  PR_URL=$(grep -oE "https://github.com/viiqswim/ai-employee-test-target/pull/[0-9]+" /tmp/ai-fc-e2e.log | head -1)
  PR_NUM=$(echo $PR_URL | grep -oE "[0-9]+$")
  echo "PR: $PR_URL"

  # Get PR diff
  gh api repos/viiqswim/ai-employee-test-target/pulls/${PR_NUM}/files \
    --jq '.[] | {file: .filename, patch: .patch}' \
    > .sisyphus/evidence/formatcurrency-rerun/pr-diff.json

  # Verify formatCurrency function is present
  grep "formatCurrency" .sisyphus/evidence/formatcurrency-rerun/pr-diff.json
  ```

  **PR content must contain**:
  - `formatCurrency` function exported from `src/index.ts`
  - Uses `Intl.NumberFormat` with `style: 'currency'`
  - Unit tests in `src/index.test.ts` covering USD, EUR, GBP, JPY, negative values, zero

  If PR content is wrong (scaffolding only, or missing tests), document it in evidence but do NOT re-fire — this is an AI quality issue, not a pipeline issue.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after T3
  - **Blocks**: T5
  - **Blocked By**: T3

  **References**:
  - `scripts/verify-e2e.ts` — the 12 checks
  - PR #24 diff (https://github.com/viiqswim/ai-employee-test-target/pull/24/files) — canonical implementation to compare against

  **Acceptance Criteria**:
  - `verify-e2e.txt` shows `ALL 12/12 CHECKS PASSED` ✅
  - `pr-diff.json` contains `formatCurrency` function ✅
  - `pr-diff.json` contains Vitest tests ✅

  **QA Scenarios**:

  ```
  Scenario: 12/12 verify:e2e pass
    Tool: Bash
    Steps:
      1. grep "ALL 12/12 CHECKS PASSED" .sisyphus/evidence/formatcurrency-rerun/verify-e2e.txt
    Expected Result: Line found
    Failure Indicator: Not found → diagnose failing checks, fix, re-run verify:e2e
    Evidence: .sisyphus/evidence/formatcurrency-rerun/verify-e2e.txt

  Scenario: PR implements formatCurrency correctly
    Tool: Bash
    Steps:
      1. grep "formatCurrency" .sisyphus/evidence/formatcurrency-rerun/pr-diff.json → found in src/index.ts
      2. grep "Intl.NumberFormat" .sisyphus/evidence/formatcurrency-rerun/pr-diff.json → found
      3. grep "formatCurrency" .sisyphus/evidence/formatcurrency-rerun/pr-diff.json → found in src/index.test.ts
    Expected Result: All 3 greps return matches
    Failure Indicator: Any grep returns empty → document in pr-quality-note.txt
    Evidence: .sisyphus/evidence/formatcurrency-rerun/pr-diff.json
  ```

  **Commit**: NO

---

- [x] 5. Save evidence + final summary

  **What to do**:

  ### 5a. Collect final evidence snapshot

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-rerun/task-id.txt)

  # Final DB state
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "
    SELECT t.status, t.failure_reason,
           e.heartbeat_at, e.agent_version, e.tokens_in, e.tokens_out,
           (SELECT COUNT(*) FROM validation_runs WHERE execution_id = e.id) as validation_runs,
           (SELECT COUNT(*) FROM deliverables WHERE task_id = t.id) as deliverables
    FROM tasks t
    LEFT JOIN executions e ON e.task_id = t.id
    WHERE t.id = '$TASK_UUID';
  " > .sisyphus/evidence/formatcurrency-rerun/final-db-snapshot.txt

  # Status log actors
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "
    SELECT from_status, to_status, actor, created_at
    FROM task_status_log WHERE task_id = '$TASK_UUID' ORDER BY created_at;
  " >> .sisyphus/evidence/formatcurrency-rerun/final-db-snapshot.txt

  # Fly machines should be 0
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length' \
    > .sisyphus/evidence/formatcurrency-rerun/fly-machines-final.txt

  echo "Evidence collection complete"
  ls -la .sisyphus/evidence/formatcurrency-rerun/
  ```

  ### 5b. Write summary

  Print a concise summary:

  ```
  ✅ formatCurrency Hybrid E2E Rerun — COMPLETE
  Task ID:    <uuid>
  PR URL:     https://github.com/viiqswim/ai-employee-test-target/pull/<N>
  verify:e2e: 12/12 PASS
  Duration:   <X> minutes
  Fly region: dfw
  Issues encountered: <list any issues fixed inline, or "none">
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — final task
  - **Blocked By**: T4

  **Acceptance Criteria**:
  - All evidence files exist in `.sisyphus/evidence/formatcurrency-rerun/` ✅
  - Summary printed ✅
  - Fly machine count = 0 ✅

  **QA Scenarios**:

  ```
  Scenario: Evidence complete
    Tool: Bash
    Steps:
      1. ls .sisyphus/evidence/formatcurrency-rerun/ → lists: task-id.txt, verify-e2e.txt, pr-diff.json,
         trigger-task-run.log, db-final-status.txt, final-db-snapshot.txt
    Expected Result: All files present
    Evidence: .sisyphus/evidence/formatcurrency-rerun/ (directory listing)
  ```

  **Commit**: NO

---

## Success Criteria

### Verification Commands

```bash
# 12/12 pass
grep "ALL 12/12 CHECKS PASSED" .sisyphus/evidence/formatcurrency-rerun/verify-e2e.txt

# PR has formatCurrency
grep "formatCurrency" .sisyphus/evidence/formatcurrency-rerun/pr-diff.json

# No manual DB writes
grep "manual" .sisyphus/evidence/formatcurrency-rerun/status-log-actors.txt || echo "CLEAN"

# No orphaned Fly machines
cat .sisyphus/evidence/formatcurrency-rerun/fly-machines-final.txt  # Expected: 0
```

### Final Checklist

- [ ] `pnpm verify:e2e --task-id <uuid>` shows `ALL 12/12 CHECKS PASSED`
- [ ] New PR created on `viiqswim/ai-employee-test-target` (different from PR #24)
- [ ] PR contains `formatCurrency` function in `src/index.ts`
- [ ] PR contains Vitest tests in `src/index.test.ts`
- [ ] No manual DB intervention during run
- [ ] Fly machines = 0 after completion
- [ ] All evidence files saved to `.sisyphus/evidence/formatcurrency-rerun/`
