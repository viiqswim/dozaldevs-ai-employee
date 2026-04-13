# formatCurrency Clean Run 2 — Full Hybrid E2E Pipeline Validation

## TL;DR

> **Quick Summary**: Fire a fresh Fly.io hybrid E2E run with the `formatCurrency` ticket, monitor to completion resolving any issues inline, and confirm `pnpm verify:e2e` shows 12/12 PASS with a correct PR on GitHub.
>
> **Deliverables**:
>
> - A new PR on `viiqswim/ai-employee-test-target` implementing `formatCurrency`
> - `pnpm verify:e2e --task-id <uuid>` showing `ALL 12/12 CHECKS PASSED`
> - Evidence files saved to `.sisyphus/evidence/formatcurrency-clean-run-2/`
>
> **Estimated Effort**: Short (45–90 min E2E run + monitoring)
> **Parallel Execution**: NO — sequential pipeline
> **Critical Path**: T1 → T2 → T3 → T4 → T5

---

## Context

### Original Request

Perform another full clean E2E run of the `formatCurrency` ticket (same task as PR #24) on the Fly.io hybrid pipeline to confirm continued end-to-end correctness. Resolve any issues encountered inline without abandoning the run.

### Task Being Executed

**Ticket**: "Add formatCurrency utility function"
**Payload file**: `test-payloads/jira-realistic-task.json` (the default `pnpm trigger-task` payload)
**Spec** (from ticket description):

- Add `formatCurrency(amount: number, currency?: string): string` to `src/index.ts`
- Uses `Intl.NumberFormat("en-US", { style: "currency", currency })`
- Formats `1234.5` → `'$1,234.50'` (default USD)
- Formats `1000000` → `'$1,000,000.00'`
- Handles negatives: `-99.99` → `'-$99.99'`
- Supports other currencies: `EUR` → `€`, `GBP` → `£`, `JPY` → `¥` (no decimals)
- Unit tests in `src/index.test.ts` (Vitest) covering: USD default, whole dollar, decimal, large number, zero, negative, EUR, GBP, JPY
- TypeScript compiles cleanly with no errors

**Reference implementation**: https://github.com/viiqswim/ai-employee-test-target/pull/24/files
**Previous successful run**: task UUID `ea7b8606-7b6a-4613-a5ee-08cb4ec298e4`, PR #27

### Known Fixes Already Applied (do NOT re-apply)

All three bugs discovered during the first rerun have been fixed and deployed in commit `9b5b533`:

| File                                   | Fix                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/workers/lib/between-wave-push.ts` | `git push --force` (removed `--force-with-lease` + fetch — sole writer to branch)                       |
| `src/workers/lib/branch-manager.ts`    | `git fetch origin` (no args) before final push to refresh tracking refs                                 |
| `src/workers/lib/fallback-pr.ts`       | `createPR()` instead of non-existent `createPullRequest()`, removed unsupported `draft`/`labels` params |

The worker image on Fly.io already contains these fixes. **Only rebuild if a new `src/workers/` change is made during inline issue resolution.**

### Infrastructure State (at plan creation)

- **Gateway**: http://localhost:3000 → 200 ✅
- **Inngest Dev**: http://localhost:8288 → 200 ✅
- **Cloudflare Tunnel**: `https://captured-capture-daughters-dirt.trycloudflare.com` → 401 (alive) ✅
- **Fly machines**: 0 orphaned ✅
- **Worker image**: `registry.fly.io/ai-employee-workers:latest` — current (contains `9b5b533` fixes) ✅
- **`.env`**: `USE_FLY_HYBRID=1`, `TUNNEL_URL` set, `FLY_HYBRID_POLL_MAX=240` ✅

### Key Facts for the Executing Agent

- **ALWAYS use `--key TEST-$(date +%s)`** when firing `pnpm trigger-task` — the script finds and monitors an existing task if the key matches an existing DB row. A timestamp key guarantees uniqueness.
- Branch naming: `ai/{KEY}-{key-lowercase}` — fresh key → fresh branch, no collision with PR #24 or PR #27.
- Tunnel URL is read from `.env` at gateway startup; do not restart gateway unless tunnel is replaced.
- `FLY_HYBRID_POLL_MAX=240` = 120 min ceiling (30s × 240 polls).
- Worker E2E typically completes in 45–90 min.
- All long-running commands **MUST** use tmux (see AGENTS.md Long-Running Command Protocol).

---

## Work Objectives

### Core Objective

Prove the Fly.io hybrid pipeline consistently delivers a correct `formatCurrency` PR with zero manual intervention, after all known bugs have been fixed.

### Concrete Deliverables

- `pnpm verify:e2e --task-id <uuid>` → 12/12 PASS
- PR on `viiqswim/ai-employee-test-target` with `formatCurrency` implementation
- Evidence saved to `.sisyphus/evidence/formatcurrency-clean-run-2/`

### Definition of Done

- [ ] `pnpm verify:e2e --task-id <uuid>` shows `ALL 12/12 CHECKS PASSED`
- [ ] PR link accessible on GitHub, different from PR #24 and PR #27
- [ ] PR diff contains `formatCurrency` function using `Intl.NumberFormat` in `src/index.ts`
- [ ] PR diff contains Vitest tests in `src/index.test.ts`

### Must Have

- Fresh unique key (no branch collision)
- All 12 verify:e2e checks must pass — no partial credit
- PR must contain correct `formatCurrency` implementation
- All infrastructure issues resolved inline

### Must NOT Have

- Manual DB writes during the run (`psql UPDATE` etc.)
- `--no-verify` on any git commits
- Reuse of keys `TEST-1775855651`, `TEST-100`, `TEST-1775866864`, `TEST-1775869708`, `TEST-1775876158` (all used by previous runs)
- Declaring success without running `pnpm verify:e2e` against the new task UUID

---

## Verification Strategy

### QA Policy

Evidence saved to `.sisyphus/evidence/formatcurrency-clean-run-2/`. Every terminal state must be captured.

---

## Execution Strategy

```
T1 → T2 → T3 → T4 → T5

T1: Pre-flight checks
T2: Fire fresh hybrid E2E run
T3: Monitor to completion (resolve issues inline)
T4: Run verify:e2e + validate PR content
T5: Save evidence + final summary
```

---

## TODOs

---

- [x] 1. Pre-flight checks

  **What to do**:

  ### 1a. Verify infrastructure health

  ```bash
  # Gateway
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  # Expected: 200

  # Inngest Dev Server
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8288/health
  # Expected: 200

  # Tunnel liveness
  TUNNEL_URL=$(grep "^TUNNEL_URL=" /Users/victordozal/repos/dozal-devs/ai-employee/.env | cut -d= -f2)
  curl -s -o /dev/null -w "%{http_code}" "${TUNNEL_URL}/rest/v1/"
  # Expected: 200 or 401 (PostgREST responding = tunnel alive). 000 = tunnel dead.
  ```

  ### 1b. Verify no orphaned Fly machines

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length'
  # Expected: 0
  # If any: destroy them
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq -r '.[].id' | \
    xargs -I{} fly machines destroy {} --app ai-employee-workers --force
  ```

  ### 1c. Create evidence directory and save key

  ```bash
  mkdir -p /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-2
  NEW_KEY="TEST-$(date +%s)"
  echo "$NEW_KEY" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-2/planned-key.txt
  echo "Will use key: $NEW_KEY"
  ```

  ### ISSUE RESOLUTION: Tunnel Dead (curl returns 000)

  ```bash
  # 1. Kill old tunnel session
  tmux kill-session -t ai-tunnel 2>/dev/null || true

  # 2. Start fresh Cloudflare tunnel
  tmux new-session -d -s ai-tunnel -x 220 -y 50
  tmux send-keys -t ai-tunnel \
    "cloudflared tunnel --url http://localhost:54321 2>&1 | tee /tmp/ai-tunnel-new.log" \
    Enter
  sleep 20
  NEW_TUNNEL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/ai-tunnel-new.log | head -1)
  echo "New tunnel: $NEW_TUNNEL"

  # 3. Update .env
  sed -i '' "s|^TUNNEL_URL=.*|TUNNEL_URL=$NEW_TUNNEL|" \
    /Users/victordozal/repos/dozal-devs/ai-employee/.env

  # 4. Restart gateway (reads TUNNEL_URL at startup)
  tmux send-keys -t ai-gateway C-c
  sleep 2
  tmux send-keys -t ai-gateway \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev:start 2>&1 | tee /tmp/ai-gateway-new.log" \
    Enter
  sleep 5
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  # Must return 200 before proceeding
  ```

  ### ISSUE RESOLUTION: Gateway Down

  ```bash
  tmux capture-pane -t ai-gateway -p | tail -20   # diagnose first
  tmux send-keys -t ai-gateway C-c
  sleep 2
  tmux send-keys -t ai-gateway \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && node dist/gateway/server.js 2>&1 | tee /tmp/ai-gateway-restart.log" \
    Enter
  sleep 5
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  # Must return 200
  ```

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
      1. curl http://localhost:3000/health → 200
      2. curl http://localhost:8288/health → 200
      3. curl ${TUNNEL_URL}/rest/v1/ → 200 or 401 (NOT 000)
      4. fly machines list length → 0
    Expected Result: All 4 checks green
    Failure Indicator: Any check fails → apply ISSUE RESOLUTION above, re-verify before T2
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-2/preflight.txt
  ```

  **Commit**: NO

---

- [x] 2. Fire fresh hybrid E2E run

  **What to do**:

  ### 2a. Read the planned key

  ```bash
  NEW_KEY=$(cat /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-2/planned-key.txt)
  echo "Firing with key: $NEW_KEY"
  ```

  ### 2b. Launch trigger-task in tmux (MANDATORY — never run blocking)

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee

  # Kill any leftover session
  tmux kill-session -t ai-fc2-e2e 2>/dev/null || true

  # Launch
  tmux new-session -d -s ai-fc2-e2e -x 220 -y 50
  tmux send-keys -t ai-fc2-e2e \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && USE_FLY_HYBRID=1 pnpm trigger-task -- --key $NEW_KEY 2>&1 | tee /tmp/ai-fc2-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-fc2-e2e.log" \
    Enter
  ```

  ### 2c. Wait 30s then capture task UUID

  ```bash
  sleep 30
  TASK_UUID=$(grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" /tmp/ai-fc2-e2e.log | head -1)
  echo "Task UUID: $TASK_UUID"
  echo "$TASK_UUID" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt
  ```

  If UUID not yet in log after 30s, wait another 30s and try again (gateway processing can take up to 60s). Do NOT proceed to T3 until a valid UUID is captured.

  **Must NOT do**:
  - Do NOT run `pnpm trigger-task` as a blocking shell call
  - Do NOT reuse any previously used key (see list in Must NOT Have above)
  - Do NOT proceed to T3 until UUID is captured

  **References**:
  - `scripts/trigger-task.ts` — what trigger-task does and what terminal output looks like
  - `test-payloads/jira-realistic-task.json` — the formatCurrency payload being sent
  - AGENTS.md § Long-Running Command Protocol — mandatory tmux pattern

  **Acceptance Criteria**:
  - tmux session `ai-fc2-e2e` is running ✅
  - `task-id.txt` contains a valid UUID (36 chars) ✅
  - Log shows gateway accepted the webhook (HTTP 200 in trigger-task output) ✅

  **QA Scenarios**:

  ```
  Scenario: Trigger fired and UUID captured
    Tool: Bash
    Steps:
      1. tmux list-sessions | grep ai-fc2-e2e → session listed
      2. cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt → valid UUID (36 chars)
      3. grep "HTTP 200\|Task created\|task_id" /tmp/ai-fc2-e2e.log → gateway accepted request
    Expected Result: All 3 pass
    Failure Indicator: Session missing or UUID empty → check tmux pane, re-fire
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt
  ```

  **Commit**: NO

---

- [x] 3. Monitor to completion — resolve issues inline

  **What to do**:

  Poll `/tmp/ai-fc2-e2e.log` every 60 seconds until a terminal state is reached. Handle every failure mode inline without abandoning the run.

  ### 3a. Polling command (repeat every 60s)

  ```bash
  tail -15 /tmp/ai-fc2-e2e.log
  grep "EXIT_CODE:" /tmp/ai-fc2-e2e.log && echo "DONE" || echo "STILL RUNNING"
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

  **Step 1: Identify the failure reason**

  ```bash
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt)
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT status, failure_reason FROM tasks WHERE id = '$TASK_UUID';"
  ```

  **Step 2: Get Fly machine logs**

  ```bash
  fly logs --app ai-employee-workers --no-tail 2>&1 | tail -60
  ```

  **Step 3: Diagnose and fix inline**

  | Symptom                               | Root Cause                                    | Fix                                                                                                                                                                                                                                               |
  | ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `git push rejected (stale info)`      | Tracking ref stale — between-wave-push.ts bug | Should be fixed. If still happening, check image tag: `fly machines list --app ai-employee-workers --json \| jq '.[].config.image'` — must be `latest`, not a stale hash. Rebuild + push image if stale: see ISSUE RESOLUTION: Stale Image below. |
  | `POST validation_runs → 400`          | UUID DEFAULT missing in DB (id column)        | Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -f prisma/migrations/20260410140640_add_uuid_defaults/migration.sql`                                                                                                        |
  | `fetch() 401` / `Unauthorized`        | `FLY_API_TOKEN` not set or expired            | Check `.env` for `FLY_API_TOKEN`; if expired, renew: `fly auth token` and update `.env`, restart gateway                                                                                                                                          |
  | `createPullRequest is not a function` | fallback-pr.ts bug — should be fixed          | Rebuild + push image (see ISSUE RESOLUTION: Stale Image)                                                                                                                                                                                          |
  | `EXECUTION_ID=null` in Fly logs       | Worker env not passing EXECUTION_ID           | Check `src/inngest/lifecycle.ts` hybrid-spawn block (env: section, lines ~149-158); rebuild + push if missing                                                                                                                                     |
  | `Polling timed out`                   | Machine took >120 min                         | Destroy machine: `fly machines destroy <id> --app ai-employee-workers --force`; re-fire from T2 with new key                                                                                                                                      |
  | Tunnel `000` mid-run                  | Tunnel died during run                        | Cannot recover current run; apply T1 ISSUE RESOLUTION: Tunnel Dead, then re-fire from T2 with new key                                                                                                                                             |

  ### ISSUE RESOLUTION: Stale Image on Fly

  If the image on the Fly machine is not `latest` or the fixes are missing, rebuild and push:

  ```bash
  # Kill old build session if any
  tmux kill-session -t ai-fc2-build 2>/dev/null || true

  # Launch build + push in tmux
  tmux new-session -d -s ai-fc2-build -x 220 -y 50
  tmux send-keys -t ai-fc2-build \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-fc2-build.log && pnpm fly:image 2>&1 | tee -a /tmp/ai-fc2-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-fc2-build.log" \
    Enter

  # Poll every 60s
  tail -20 /tmp/ai-fc2-build.log
  grep "EXIT_CODE:" /tmp/ai-fc2-build.log && echo "BUILD DONE" || echo "BUILDING"
  # Expected: EXIT_CODE:0 (takes 5-15 min)
  ```

  After image is pushed, re-fire with a new key (see T2).

  ### 3d. Re-fire protocol

  If a re-fire is needed after a fix:

  ```bash
  NEW_KEY="TEST-$(date +%s)"
  echo "$NEW_KEY" > .sisyphus/evidence/formatcurrency-clean-run-2/planned-key.txt
  # Then re-execute T2 steps (kill old tmux session, launch new one, capture UUID)
  # Append new UUID to evidence:
  echo "$NEW_TASK_UUID" >> .sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt
  # (Keep all UUIDs for traceability; final UUID goes in task-id-final.txt)
  echo "$NEW_TASK_UUID" > .sisyphus/evidence/formatcurrency-clean-run-2/task-id-final.txt
  ```

  ### 3e. Save terminal state evidence

  ```bash
  cp /tmp/ai-fc2-e2e.log .sisyphus/evidence/formatcurrency-clean-run-2/trigger-task-run.log

  # Use final task UUID (task-id-final.txt if re-fired, else task-id.txt)
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id-final.txt 2>/dev/null || \
              cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt)

  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT status, failure_reason FROM tasks WHERE id = '$TASK_UUID';" \
    > .sisyphus/evidence/formatcurrency-clean-run-2/db-final-status.txt

  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT from_status, to_status, actor, created_at FROM task_status_log WHERE task_id = '$TASK_UUID' ORDER BY created_at;" \
    >> .sisyphus/evidence/formatcurrency-clean-run-2/db-final-status.txt
  ```

  **Must NOT do**:
  - Do NOT manually write to the DB during the run (`psql UPDATE` etc.)
  - Do NOT kill the `ai-dev` tmux session (Inngest Dev Server)
  - Do NOT kill the tunnel during the run
  - Do NOT declare Done until log shows `Task completed successfully!` and `EXIT_CODE:0`
  - Cap at 90 min of waiting with no log progress; after 90 min stalled, apply timeout fix above

  **References**:
  - `scripts/trigger-task.ts` — what terminal success state looks like
  - `scripts/verify-e2e.ts` — understand the 12 checks to proactively diagnose failures
  - `src/inngest/lifecycle.ts` lines 97–169 — hybrid-spawn block (EXECUTION_ID, env vars)
  - `src/workers/lib/between-wave-push.ts` — between-wave push logic
  - `src/workers/lib/branch-manager.ts` — final push logic
  - `src/workers/lib/fallback-pr.ts` — fallback PR creation
  - `.sisyphus/notepads/formatcurrency-rerun/learnings.md` — full bug history from previous runs

  **Acceptance Criteria**:
  - `trigger-task-run.log` shows `EXIT_CODE:0` ✅
  - DB status = `Done` ✅
  - PR URL present in log ✅
  - No manual actors in `task_status_log` ✅

  **QA Scenarios**:

  ```
  Scenario: Run completes successfully (Done path)
    Tool: Bash
    Steps:
      1. grep "EXIT_CODE:0" /tmp/ai-fc2-e2e.log → found
      2. psql query on tasks → status = 'Done'
      3. grep "Pull Request" /tmp/ai-fc2-e2e.log → PR URL present
    Expected Result: All 3 pass
    Failure Indicator: EXIT_CODE:1 or status = AwaitingInput → apply inline fixes above
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-2/trigger-task-run.log
              .sisyphus/evidence/formatcurrency-clean-run-2/db-final-status.txt

  Scenario: No manual DB writes occurred
    Tool: Bash
    Steps:
      1. psql: SELECT actor FROM task_status_log WHERE task_id = '$TASK_UUID' ORDER BY created_at
      2. Verify all actors are: 'gateway', 'lifecycle_fn', or 'machine'
    Expected Result: No actor = 'manual'
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-2/db-final-status.txt
  ```

  **Commit**: NO

---

- [x] 4. Run verify:e2e + validate PR content

  **What to do**:

  ### 4a. Determine the final task UUID

  ```bash
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id-final.txt 2>/dev/null || \
              cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt)
  echo "Verifying task: $TASK_UUID"
  ```

  ### 4b. Run the 12-point verification

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  pnpm verify:e2e --task-id $TASK_UUID 2>&1 | tee .sisyphus/evidence/formatcurrency-clean-run-2/verify-e2e.txt
  ```

  **Expected**: `✅  ALL 12/12 CHECKS PASSED — Phase 8 Done!`

  If any check fails, diagnose and fix inline before moving to T5:

  | Check                          | Symptom               | Fix                                                                                   |
  | ------------------------------ | --------------------- | ------------------------------------------------------------------------------------- |
  | Check 5 (heartbeat)            | `heartbeat_at` null   | Worker didn't start — check Fly logs; may need image rebuild                          |
  | Check 6 (validation_runs)      | 0 runs recorded       | UUID defaults missing; run migration `20260410140640_add_uuid_defaults/migration.sql` |
  | Check 7 (PR)                   | PR not found          | Git push failed; check Fly logs for `fatal: push rejected`                            |
  | Check 9 (audit trail)          | Missing transitions   | Worker completion.ts failed — check Fly logs                                          |
  | Check 10 (deliverable)         | No deliverable record | PostgREST insert failed; check completion.ts + UUID defaults                          |
  | Check 11 (execution populated) | Fields null           | Worker crashed before writing tokens; check `orchestrate.mts`                         |
  | Check 12 (cleanup)             | Machine still running | `fly machines destroy <id> --app ai-employee-workers --force`                         |

  ### 4c. Validate PR content matches spec

  ```bash
  # Extract PR number from log
  PR_URL=$(grep -oE "https://github.com/viiqswim/ai-employee-test-target/pull/[0-9]+" /tmp/ai-fc2-e2e.log | head -1)
  PR_NUM=$(echo $PR_URL | grep -oE "[0-9]+$")
  echo "PR: $PR_URL"
  echo "$PR_URL" > .sisyphus/evidence/formatcurrency-clean-run-2/pr-url.txt

  # Fetch PR diff
  gh api repos/viiqswim/ai-employee-test-target/pulls/${PR_NUM}/files \
    > .sisyphus/evidence/formatcurrency-clean-run-2/pr-diff.json

  # Spot-check key content
  grep "formatCurrency" .sisyphus/evidence/formatcurrency-clean-run-2/pr-diff.json
  grep "Intl.NumberFormat" .sisyphus/evidence/formatcurrency-clean-run-2/pr-diff.json
  ```

  **PR must contain**:
  - `formatCurrency` exported from `src/index.ts`
  - `Intl.NumberFormat` with `style: 'currency'`
  - Unit tests in `src/index.test.ts` covering USD, EUR, GBP, JPY, negative values, zero

  If PR content is wrong (scaffolding only, missing tests) — document in `pr-quality-note.txt` but do NOT re-fire; this is an AI quality issue, not a pipeline issue.

  **References**:
  - `scripts/verify-e2e.ts` — the 12 checks in detail
  - PR #24 diff: https://github.com/viiqswim/ai-employee-test-target/pull/24/files — canonical implementation

  **Acceptance Criteria**:
  - `verify-e2e.txt` shows `ALL 12/12 CHECKS PASSED` ✅
  - `pr-diff.json` contains `formatCurrency` function ✅
  - `pr-diff.json` contains Vitest tests ✅

  **QA Scenarios**:

  ```
  Scenario: 12/12 verify:e2e pass
    Tool: Bash
    Steps:
      1. grep "ALL 12/12 CHECKS PASSED" .sisyphus/evidence/formatcurrency-clean-run-2/verify-e2e.txt
    Expected Result: Line found
    Failure Indicator: Not found → diagnose failing check numbers, fix inline, re-run verify:e2e
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-2/verify-e2e.txt

  Scenario: PR implements formatCurrency correctly
    Tool: Bash
    Steps:
      1. grep "formatCurrency" pr-diff.json → found in src/index.ts patch
      2. grep "Intl.NumberFormat" pr-diff.json → found
      3. grep "formatCurrency" pr-diff.json → found in src/index.test.ts patch
    Expected Result: All 3 greps match
    Failure Indicator: Any grep empty → document in pr-quality-note.txt
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-2/pr-diff.json
  ```

  **Commit**: NO

---

- [x] 5. Save evidence + final summary

  **What to do**:

  ### 5a. Collect final evidence snapshot

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id-final.txt 2>/dev/null || \
              cat .sisyphus/evidence/formatcurrency-clean-run-2/task-id.txt)

  # Final DB state (correct column names — agent_version_id, prompt_tokens, completion_tokens)
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "
    SELECT t.status, t.failure_reason,
           e.heartbeat_at, e.agent_version_id, e.prompt_tokens, e.completion_tokens,
           (SELECT COUNT(*) FROM validation_runs WHERE execution_id = e.id) AS validation_runs,
           (SELECT COUNT(*) FROM deliverables WHERE task_id = t.id) AS deliverables
    FROM tasks t
    LEFT JOIN executions e ON e.task_id = t.id
    WHERE t.id = '$TASK_UUID';
  " > .sisyphus/evidence/formatcurrency-clean-run-2/final-db-snapshot.txt

  # Status log actors
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "
    SELECT from_status, to_status, actor, created_at
    FROM task_status_log WHERE task_id = '$TASK_UUID' ORDER BY created_at;
  " >> .sisyphus/evidence/formatcurrency-clean-run-2/final-db-snapshot.txt

  # Fly machines should be 0
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length' \
    > .sisyphus/evidence/formatcurrency-clean-run-2/fly-machines-final.txt

  echo "Evidence collection complete"
  ls -la .sisyphus/evidence/formatcurrency-clean-run-2/
  ```

  ### 5b. Print summary

  ```
  ✅ formatCurrency Clean Run 2 — COMPLETE
  Task ID:    <uuid>
  PR URL:     https://github.com/viiqswim/ai-employee-test-target/pull/<N>
  verify:e2e: 12/12 PASS
  Duration:   <X> minutes
  Issues encountered: <list any issues fixed inline, or "none">
  ```

  **Acceptance Criteria**:
  - `final-db-snapshot.txt` populated (non-empty, correct columns) ✅
  - `fly-machines-final.txt` = 0 ✅
  - `pr-url.txt` contains a GitHub PR URL ✅
  - `verify-e2e.txt` present and shows 12/12 ✅
  - Summary printed ✅

  **QA Scenarios**:

  ```
  Scenario: Evidence complete
    Tool: Bash
    Steps:
      1. ls .sisyphus/evidence/formatcurrency-clean-run-2/ → contains:
         task-id.txt, verify-e2e.txt, pr-diff.json, pr-url.txt,
         trigger-task-run.log, db-final-status.txt, final-db-snapshot.txt,
         fly-machines-final.txt, preflight.txt
    Expected Result: All files present (non-empty)
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-2/ (directory listing)
  ```

  **Commit**: NO

---

## Success Criteria

### Verification Commands

```bash
# 12/12 pass
grep "ALL 12/12 CHECKS PASSED" .sisyphus/evidence/formatcurrency-clean-run-2/verify-e2e.txt

# PR has correct implementation
grep "Intl.NumberFormat" .sisyphus/evidence/formatcurrency-clean-run-2/pr-diff.json

# No manual DB writes
grep "manual" .sisyphus/evidence/formatcurrency-clean-run-2/db-final-status.txt || echo "CLEAN"

# No orphaned Fly machines
cat .sisyphus/evidence/formatcurrency-clean-run-2/fly-machines-final.txt  # Expected: 0
```

### Final Checklist

- [ ] `pnpm verify:e2e --task-id <uuid>` shows `ALL 12/12 CHECKS PASSED`
- [ ] New PR created (different from PR #24 and PR #27)
- [ ] PR contains `formatCurrency` function using `Intl.NumberFormat` in `src/index.ts`
- [ ] PR contains Vitest tests in `src/index.test.ts`
- [ ] No manual DB intervention during run
- [ ] Fly machines = 0 after completion
- [ ] All evidence files saved to `.sisyphus/evidence/formatcurrency-clean-run-2/`
