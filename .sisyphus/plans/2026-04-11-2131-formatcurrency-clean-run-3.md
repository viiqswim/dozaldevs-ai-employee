# formatCurrency Clean Run 3 — Full Hybrid E2E Pipeline Validation

## TL;DR

> **Quick Summary**: Fire a fresh Fly.io hybrid E2E run with the `formatCurrency` ticket, pass a rigorous 8-gate pre-flight check, monitor to completion resolving any issues inline, and confirm `pnpm verify:e2e` shows 12/12 PASS with a correct, open PR on GitHub.
>
> **Deliverables**:
>
> - A new OPEN PR on `viiqswim/ai-employee-test-target` implementing `formatCurrency`
> - `pnpm verify:e2e --task-id <uuid>` showing `ALL 12/12 CHECKS PASSED`
> - PR diff verified: `Intl.NumberFormat` in `src/index.ts`, test assertions in `src/index.test.ts`
> - Evidence saved to `.sisyphus/evidence/formatcurrency-clean-run-3/`
>
> **Estimated Effort**: Short (45–90 min E2E run + monitoring)
> **Parallel Execution**: NO — sequential pipeline
> **Critical Path**: T1 → T2 → T3 → T4 → T5

---

## Context

### Original Request

Run another full clean E2E pipeline cycle replicating the task from PR #24 (formatCurrency), to verify the pipeline is consistently working. Resolve any issues encountered inline without abandoning the run.

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

### Run History

| Run          | Key              | Task UUID  | PR  | Result              |
| ------------ | ---------------- | ---------- | --- | ------------------- |
| Original     | TEST-1775855651  | 28c259e9-… | #24 | ✅ 12/12            |
| Rerun 5      | TEST-1775876158  | ea7b8606-… | #27 | ✅ 12/12            |
| Clean Run 2  | TEST-1775951346  | b7343dfa-… | #29 | ✅ 12/12            |
| **This run** | TEST-$(date +%s) | TBD        | TBD | 🎯 Target: ✅ 12/12 |

### All Fixes Applied (do NOT re-apply unless new src/workers/ change is made)

All three bugs discovered during the first rerun are fixed in commit `9b5b533`:

| File                                   | Fix                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/workers/lib/between-wave-push.ts` | `git push --force` (removed `--force-with-lease` + fetch)                                               |
| `src/workers/lib/branch-manager.ts`    | `git fetch origin` (no args) before final push                                                          |
| `src/workers/lib/fallback-pr.ts`       | `createPR()` instead of non-existent `createPullRequest()`; removed unsupported `draft`/`labels` params |

### Key Facts for the Executing Agent

- **ALWAYS use `--key TEST-$(date +%s)`** when firing `pnpm trigger-task` — captures at start and writes to evidence dir BEFORE firing
- **NEVER reuse blocked keys**: `TEST-1775855651`, `TEST-100`, `TEST-1775866864`, `TEST-1775869708`, `TEST-1775876158`, `TEST-1775950556`, `TEST-1775951346`, `TEST-1775575685`, `TEST-1775759811`, `TEST-1775763304`, `TEST-1775777138`, `TEST-1775781776`, `TEST-1775838657`, `TEST-1775842363`, `TEST-1775862389`
- Tunnel URL is read from `.env` at gateway startup; do NOT restart gateway unless tunnel is replaced
- `FLY_HYBRID_POLL_MAX=240` = 120 min ceiling (30s × 240 polls)
- Worker E2E typically completes in 45–90 min
- All long-running commands **MUST** use tmux (see AGENTS.md Long-Running Command Protocol)

---

## Work Objectives

### Core Objective

Prove the Fly.io hybrid pipeline consistently delivers a correct `formatCurrency` PR with zero manual intervention after all known bugs have been fixed.

### Concrete Deliverables

- `pnpm verify:e2e --task-id <uuid>` → 12/12 PASS
- PR on `viiqswim/ai-employee-test-target` in OPEN state with correct `formatCurrency` implementation
- Evidence saved to `.sisyphus/evidence/formatcurrency-clean-run-3/`

### Definition of Done

- [ ] `pnpm verify:e2e --task-id <uuid>` shows `ALL 12/12 CHECKS PASSED`
- [ ] PR link accessible on GitHub, in OPEN state (not draft, not merged)
- [ ] PR diff contains `Intl.NumberFormat` in `src/index.ts` patch
- [ ] PR diff contains Vitest test assertions in `src/index.test.ts` patch (≥3 occurrences of `formatCurrency`)
- [ ] PR branch name matches `ai/TEST-{key}-*` pattern

### Must Have

- Fresh unique key (no branch collision with any previous run)
- All 8 pre-flight gates pass before firing
- All 12 verify:e2e checks pass — no partial credit
- PR must be OPEN with correct `formatCurrency` implementation

### Must NOT Have

- Manual DB writes during the run (`psql UPDATE` etc.)
- `--no-verify` on any git commits
- Reuse of any blocked key (see list above)
- Declaring success without running `pnpm verify:e2e` against the new task UUID
- Merging the PR (stop at PR creation)
- Direct modifications to `viiqswim/ai-employee-test-target` (all changes must come through the pipeline)
- Fixing code unrelated to the current E2E failure (no opportunistic cleanup)
- More than 2 `verify:e2e` attempts before escalating

---

## Verification Strategy

### QA Policy

Evidence saved to `.sisyphus/evidence/formatcurrency-clean-run-3/`. Every terminal state must be captured.

---

## Execution Strategy

```
T1 → T2 → T3 → T4 → T5

T1: Pre-flight checks (8 blocking gates)
T2: Fire fresh hybrid E2E run
T3: Monitor to completion (resolve issues inline)
T4: Run verify:e2e + validate PR content
T5: Save evidence + final summary
```

---

## TODOs

- [x] 1. Pre-flight checks — 8 blocking gates

  **What to do**:

  Run all 8 checks in order. Every check is a BLOCKING GATE — if it fails, apply the named ISSUE RESOLUTION before proceeding. Do NOT fire trigger-task until all 8 gates pass.

  Create evidence dir first:

  ```bash
  mkdir -p /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-3
  ```

  ### Gate 1: Test repo — `formatCurrency` NOT already on main

  This is the highest-risk check. If a previous run's PR was merged, the worker will create an empty or conflicting PR.

  ```bash
  curl -sf "https://raw.githubusercontent.com/viiqswim/ai-employee-test-target/main/src/index.ts" | grep "formatCurrency"
  # Expected: NO OUTPUT (grep finds nothing = function not yet on main)
  # If output IS found: formatCurrency is already merged → see ISSUE: Function Already Merged below
  ```

  ### ISSUE RESOLUTION: formatCurrency Already on main

  If `formatCurrency` is already on main, the worker will attempt to implement a different function or will produce a trivial diff. Two options:

  **Option A (preferred)**: Accept this run proves something different (worker correctly handles "already-implemented" tickets). Monitor to Done, validate PR is OPEN with zero harmful changes. Document result in evidence noting the pre-condition.

  **Option B**: Use a different Jira ticket description in the payload. This requires editing `test-payloads/jira-realistic-task.json` to request a different function (e.g., `formatBytes`). Update `test-payloads/jira-realistic-task.json` accordingly and proceed.

  If you choose Option A, update this note in evidence:

  ```bash
  echo "formatCurrency already on main — Option A chosen" > .sisyphus/evidence/formatcurrency-clean-run-3/preflight-note.txt
  ```

  ***

  ### Gate 2: Gateway health

  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  # Expected: 200
  ```

  ### ISSUE RESOLUTION: Gateway Down

  ```bash
  tmux capture-pane -t ai-gateway -p | tail -20   # diagnose first
  tmux send-keys -t ai-gateway C-c
  sleep 2
  tmux send-keys -t ai-gateway \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev:start 2>&1 | tee /tmp/ai-gateway-restart.log" Enter
  sleep 10
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  # Must return 200 before continuing
  ```

  ***

  ### Gate 3: Inngest Dev Server health + function registration

  ```bash
  # Health
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8288/health
  # Expected: 200

  # Verify lifecycle function is registered
  curl -s "http://localhost:8288/v0/fns" | jq '.fns[].id' 2>/dev/null | grep "task-lifecycle"
  # Expected: line containing "task-lifecycle"
  # If empty: see ISSUE: Inngest function not registered
  ```

  ### ISSUE RESOLUTION: Inngest Function Not Registered

  The gateway registers Inngest functions at startup via `POST /api/inngest` sync endpoint. If missing:

  ```bash
  # Force re-sync
  curl -s -X PUT http://localhost:8288/fn/register \
    -H "Content-Type: application/json" \
    -d '{"url":"http://localhost:3000/api/inngest"}'
  sleep 3
  curl -s "http://localhost:8288/v0/fns" | jq '.fns[].id'
  # task-lifecycle must appear
  ```

  If still missing, restart the gateway (see Gate 2 ISSUE RESOLUTION) — gateway registers functions on startup.

  ***

  ### Gate 4: Tunnel externally reachable (NOT just locally running)

  ```bash
  TUNNEL_URL=$(grep "^TUNNEL_URL=" /Users/victordozal/repos/dozal-devs/ai-employee/.env | cut -d= -f2-)
  echo "Testing tunnel: $TUNNEL_URL"

  # Must be externally reachable — not just locally running
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TUNNEL_URL}/rest/v1/tasks?select=id&limit=1")
  echo "Tunnel HTTP: $HTTP_CODE"
  # Expected: 200 or 401 (PostgREST responding = tunnel alive). 000 = tunnel dead.
  ```

  ### ISSUE RESOLUTION: Tunnel Dead (returns 000 or 502)

  ```bash
  # 1. Kill old tunnel session
  tmux kill-session -t ai-tunnel 2>/dev/null || true

  # 2. Start fresh Cloudflare tunnel
  tmux new-session -d -s ai-tunnel -x 220 -y 50
  tmux send-keys -t ai-tunnel \
    "cloudflared tunnel --url http://localhost:54321 2>&1 | tee /tmp/ai-tunnel-new.log" Enter
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
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev:start 2>&1 | tee /tmp/ai-gateway-new.log" Enter
  sleep 10
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
  # Must return 200. Then re-run Gate 4.
  ```

  ***

  ### Gate 5: No orphaned Fly machines

  ```bash
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length'
  # Expected: 0
  # If any exist:
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq -r '.[].id' | \
    xargs -I{} fly machines destroy {} --app ai-employee-workers --force
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length'
  # Must be 0 before continuing
  ```

  ***

  ### Gate 6: No concurrent tasks Executing or Submitting

  ```bash
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT id, external_id, status FROM tasks WHERE status IN ('Executing','Submitting') ORDER BY created_at DESC LIMIT 5;"
  # Expected: 0 rows
  # If rows found: either wait for those tasks to finish, or verify they are stale orphans:
  #   - Check if their Fly machines exist: fly machines list --app ai-employee-workers
  #   - If no machine + stuck Executing for >120 min: these are orphaned; safe to ignore for a new run
  ```

  ***

  ### Gate 7: SUPABASE_SECRET_KEY matches docker/.env SERVICE_ROLE_KEY

  ```bash
  ROOT_KEY=$(grep "^SUPABASE_SECRET_KEY=" /Users/victordozal/repos/dozal-devs/ai-employee/.env | cut -d= -f2-)
  DOCKER_KEY=$(grep "^SERVICE_ROLE_KEY=" /Users/victordozal/repos/dozal-devs/ai-employee/docker/.env | cut -d= -f2-)

  if [ "$ROOT_KEY" = "$DOCKER_KEY" ]; then
    echo "✅ Keys match"
  else
    echo "❌ MISMATCH — update SUPABASE_SECRET_KEY in .env to match docker/.env SERVICE_ROLE_KEY"
    echo "ROOT_KEY: ${ROOT_KEY:0:20}..."
    echo "DOCKER_KEY: ${DOCKER_KEY:0:20}..."
  fi
  # Must print "✅ Keys match"
  ```

  ### ISSUE RESOLUTION: Key Mismatch

  ```bash
  # Copy correct key from docker/.env to root .env:
  DOCKER_KEY=$(grep "^SERVICE_ROLE_KEY=" /Users/victordozal/repos/dozal-devs/ai-employee/docker/.env | cut -d= -f2-)
  sed -i '' "s|^SUPABASE_SECRET_KEY=.*|SUPABASE_SECRET_KEY=$DOCKER_KEY|" \
    /Users/victordozal/repos/dozal-devs/ai-employee/.env
  # Then restart gateway (it reads the key at startup)
  # Re-run Gate 7 to confirm
  ```

  ***

  ### Gate 8: Worker image is current (contains commit 9b5b533 fixes)

  ```bash
  # Check if src/workers/ has any commit newer than 9b5b533
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  LATEST_WORKERS_COMMIT=$(git log --oneline src/workers/ | head -1 | cut -d' ' -f1)
  echo "Latest src/workers/ commit: $LATEST_WORKERS_COMMIT"

  # If LATEST_WORKERS_COMMIT == 9b5b533 (or a prefix of it), image is current
  # If different (newer commit), rebuild and push before proceeding
  # Also verify the Fly registry image is non-empty:
  fly image show --app ai-employee-workers 2>&1 | head -5
  # Expected: shows a digest/reference (not "no image")
  ```

  ### ISSUE RESOLUTION: Worker Image Stale or New src/workers/ Changes

  ```bash
  # Kill old build session if any
  tmux kill-session -t ai-fc3-build 2>/dev/null || true

  # Build + push in tmux (takes 5–15 min)
  tmux new-session -d -s ai-fc3-build -x 220 -y 50
  tmux send-keys -t ai-fc3-build \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-fc3-build.log && pnpm fly:image 2>&1 | tee -a /tmp/ai-fc3-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-fc3-build.log" \
    Enter

  # Poll every 60s until done
  tail -20 /tmp/ai-fc3-build.log
  grep "EXIT_CODE:" /tmp/ai-fc3-build.log && echo "BUILD DONE" || echo "BUILDING"
  # Expected: EXIT_CODE:0
  ```

  ***

  ### 1-final: Generate key, save to evidence

  Run this LAST in T1, right before proceeding to T2:

  ```bash
  TASK_KEY="TEST-$(date +%s)"
  echo "Using key: $TASK_KEY"
  echo "$TASK_KEY" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-3/task-key.txt

  # Also save tunnel URL to evidence
  TUNNEL_URL=$(grep "^TUNNEL_URL=" /Users/victordozal/repos/dozal-devs/ai-employee/.env | cut -d= -f2-)
  echo "$TUNNEL_URL" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-3/tunnel-url.txt

  # Save pre-flight pass timestamp
  date > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-3/preflight.txt
  echo "All 8 gates PASSED" >> /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-3/preflight.txt
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — all 8 gates must pass before T2
  - **Blocks**: T2
  - **Blocked By**: None (start immediately)

  **References**:
  - `docker/.env` — contains `SERVICE_ROLE_KEY` (must match `SUPABASE_SECRET_KEY` in root `.env`)
  - `.env` — contains `TUNNEL_URL`, `USE_FLY_HYBRID`, `SUPABASE_SECRET_KEY`
  - `src/workers/lib/between-wave-push.ts` — contains the `git push --force` fix
  - `src/workers/lib/branch-manager.ts` — contains the `git fetch origin` fix
  - `src/workers/lib/fallback-pr.ts` — contains the `createPR()` fix
  - `https://github.com/viiqswim/ai-employee-test-target/blob/main/src/index.ts` — check if formatCurrency exists

  **Acceptance Criteria**:
  - formatCurrency NOT on `ai-employee-test-target` main (or Option A documented in evidence) ✅
  - Gateway → 200 ✅
  - Inngest → 200 and `task-lifecycle` function registered ✅
  - Tunnel → 200 or 401 (NOT 000 or 502) ✅
  - Fly machines count = 0 ✅
  - No Executing/Submitting tasks (or confirmed stale orphans) ✅
  - SUPABASE_SECRET_KEY = SERVICE_ROLE_KEY ✅
  - Worker image on Fly registry is current (no newer src/workers/ commits, or rebuilt) ✅
  - `task-key.txt`, `tunnel-url.txt`, `preflight.txt` saved to evidence dir ✅

  **QA Scenarios**:

  ```
  Scenario: All 8 gates pass
    Tool: Bash
    Steps:
      1. curl raw github for formatCurrency → no output (or Option A doc'd)
      2. curl http://localhost:3000/health → 200
      3. curl http://localhost:8288/health → 200 + jq shows task-lifecycle
      4. curl ${TUNNEL_URL}/rest/v1/tasks?select=id&limit=1 → 200 or 401
      5. fly machines list length → 0
      6. psql SELECT status IN (Executing,Submitting) → 0 rows
      7. SUPABASE_SECRET_KEY == SERVICE_ROLE_KEY → "Keys match"
      8. git log src/workers/ head commit == 9b5b533 (or image rebuilt)
    Expected Result: All 8 checks green, evidence files saved
    Failure Indicator: Any gate red → apply ISSUE RESOLUTION above, re-verify gate before T2
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-3/preflight.txt
  ```

  **Commit**: NO

---

- [x] 2. Fire fresh hybrid E2E run

  **What to do**:

  ### 2a. Read the task key (captured in T1)

  ```bash
  TASK_KEY=$(cat /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-3/task-key.txt)
  echo "Firing with key: $TASK_KEY"
  ```

  ### 2b. Launch trigger-task in tmux (MANDATORY — long-running command protocol)

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee

  # Kill any leftover session
  tmux kill-session -t ai-fc3-e2e 2>/dev/null || true

  # Launch new session
  tmux new-session -d -s ai-fc3-e2e -x 220 -y 50
  tmux send-keys -t ai-fc3-e2e \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && USE_FLY_HYBRID=1 pnpm trigger-task -- --key $TASK_KEY 2>&1 | tee /tmp/ai-fc3-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-fc3-e2e.log" \
    Enter
  ```

  ### 2c. Wait 30s then capture task UUID

  ```bash
  sleep 30
  TASK_UUID=$(grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" /tmp/ai-fc3-e2e.log | head -1)
  echo "Task UUID: $TASK_UUID"

  if [ -n "$TASK_UUID" ]; then
    echo "$TASK_UUID" > /Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt
    echo "✅ UUID captured"
  else
    echo "⏳ UUID not yet in log — wait 30s more and retry grep"
  fi
  ```

  If UUID not in log after 60s total, check:

  ```bash
  tail -20 /tmp/ai-fc3-e2e.log
  # Look for: HTTP 200 (webhook accepted) vs HTTP 4xx (gateway error)
  # If HTTP 4xx: check tmux pane for gateway error, then troubleshoot
  ```

  Do NOT proceed to T3 until a valid UUID is captured.

  ### 2d. Verify Inngest received the event

  ```bash
  # Check Inngest Dev Server for the event (optional but useful)
  curl -s "http://localhost:8288/v0/events?event=engineering%2Ftask.received" | jq '.data | length'
  # Expected: ≥1
  ```

  **Must NOT do**:
  - Do NOT run `pnpm trigger-task` as a blocking shell call
  - Do NOT use `USE_LOCAL_DOCKER=1` — this run uses Fly hybrid
  - Do NOT reuse any key from the blocked-keys list in the Context section
  - Do NOT proceed to T3 until UUID is captured

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after T1
  - **Blocks**: T3
  - **Blocked By**: T1

  **References**:
  - `scripts/trigger-task.ts` — what trigger-task does, flag syntax, what output looks like
  - `test-payloads/jira-realistic-task.json` — the formatCurrency payload being sent
  - AGENTS.md § Long-Running Command Protocol — mandatory tmux pattern

  **Acceptance Criteria**:
  - tmux session `ai-fc3-e2e` is running ✅
  - `task-id.txt` contains a valid UUID (36 chars: 8-4-4-4-12) ✅
  - `/tmp/ai-fc3-e2e.log` shows HTTP 200 response from gateway ✅

  **QA Scenarios**:

  ```
  Scenario: Trigger fired and UUID captured
    Tool: Bash
    Steps:
      1. tmux list-sessions | grep ai-fc3-e2e → session listed
      2. cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt → valid UUID (36 chars)
      3. grep "200\|created\|task_id" /tmp/ai-fc3-e2e.log → gateway accepted webhook
    Expected Result: All 3 pass
    Failure Indicator: Session missing → restart tmux session; UUID empty → wait 30s and re-grep
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt
  ```

  **Commit**: NO

- [x] 3. Monitor to completion — resolve issues inline

  **What to do**:

  Poll `/tmp/ai-fc3-e2e.log` every 60 seconds until a terminal state is reached. Handle every failure mode inline without abandoning the run.

  ### 3a. Polling loop (repeat every 60s)

  ```bash
  tail -15 /tmp/ai-fc3-e2e.log
  grep "EXIT_CODE:" /tmp/ai-fc3-e2e.log && echo "DONE" || echo "STILL RUNNING"
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

  ### 3c. Failure path — task stuck in AwaitingInput

  **Step 1: Get failure reason from DB**

  ```bash
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt)
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT status, failure_reason FROM tasks WHERE id = '$TASK_UUID';"
  ```

  **Step 2: Get Fly machine logs**

  ```bash
  fly logs --app ai-employee-workers --no-tail 2>&1 | tail -80 \
    > .sisyphus/evidence/formatcurrency-clean-run-3/fly-logs-failure.txt
  cat .sisyphus/evidence/formatcurrency-clean-run-3/fly-logs-failure.txt
  ```

  **Step 3: Diagnose and fix inline**

  | Symptom                                                      | Root Cause                              | Fix                                                                                                                                                |
  | ------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `git push rejected (stale info)`                             | between-wave-push bug — should be fixed | Check image commit: `fly image show --app ai-employee-workers`; if stale, apply ISSUE: Stale Image                                                 |
  | `createPullRequest is not a function`                        | fallback-pr.ts bug — should be fixed    | Apply ISSUE: Stale Image                                                                                                                           |
  | `POST validation_runs → 400`                                 | UUID DEFAULT missing in DB              | Run: `psql ... -f prisma/migrations/20260410140640_add_uuid_defaults/migration.sql`                                                                |
  | `fetch() 401 Unauthorized`                                   | `FLY_API_TOKEN` not set or expired      | Check `.env` `FLY_API_TOKEN`; renew: `fly auth token` → update `.env` → restart gateway                                                            |
  | `EXECUTION_ID=null` in Fly logs                              | Worker env missing EXECUTION_ID         | Check `src/inngest/lifecycle.ts` hybrid-spawn block (env: section lines ~149-158); rebuild + push                                                  |
  | `Polling timed out`                                          | Machine ran >120 min                    | Destroy machine: `fly machines destroy <id> --app ai-employee-workers --force`; re-fire from T2                                                    |
  | Tunnel `000` mid-run                                         | Tunnel died during run                  | Cannot recover current run; apply T1 Gate 4 ISSUE RESOLUTION, update .env, restart gateway, re-fire T2                                             |
  | `SUPABASE_SECRET_KEY` mismatch (401 on PostgREST)            | Keys diverged after gateway restart     | Apply T1 Gate 7 ISSUE RESOLUTION; rebuild image if worker hardcoded old key                                                                        |
  | Cost gate hit                                                | Daily spend ≥ $50                       | Check `SELECT SUM(cost_usd_cents) / 100.0 FROM tasks WHERE DATE(created_at) = CURRENT_DATE`; if over, wait until midnight or raise limit in `.env` |
  | `formatCurrency` already on main — worker creates trivial PR | Base branch already has function        | Document as Option A in evidence; proceed to T4 (verify still checks PR state + diff)                                                              |
  | Inngest `task.received` event never consumed                 | Lifecycle not registered                | Apply T1 Gate 3 ISSUE RESOLUTION (force re-sync), verify function fires in Inngest UI                                                              |

  ### ISSUE RESOLUTION: Stale Image on Fly

  ```bash
  # Kill old build session if any
  tmux kill-session -t ai-fc3-build 2>/dev/null || true

  # Build + push in tmux
  tmux new-session -d -s ai-fc3-build -x 220 -y 50
  tmux send-keys -t ai-fc3-build \
    "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-fc3-build.log && pnpm fly:image 2>&1 | tee -a /tmp/ai-fc3-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-fc3-build.log" \
    Enter

  # Poll every 60s
  tail -20 /tmp/ai-fc3-build.log
  grep "EXIT_CODE:" /tmp/ai-fc3-build.log && echo "BUILD DONE" || echo "BUILDING"
  # EXIT_CODE:0 expected (5–15 min)
  # After push succeeds, re-fire from T2 with a new key
  ```

  ### 3d. Re-fire protocol (if a re-fire is needed after a fix)

  ```bash
  NEW_KEY="TEST-$(date +%s)"
  echo "$NEW_KEY" > .sisyphus/evidence/formatcurrency-clean-run-3/task-key.txt
  # Re-execute T2 steps (kill old tmux session, launch new one, capture new UUID)
  # Append new UUID to evidence for traceability
  echo "$NEW_TASK_UUID" >> .sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt
  # Write final UUID to separate file (T4 uses this)
  echo "$NEW_TASK_UUID" > .sisyphus/evidence/formatcurrency-clean-run-3/task-id-final.txt
  ```

  ### 3e. Save terminal state evidence

  ```bash
  cp /tmp/ai-fc3-e2e.log .sisyphus/evidence/formatcurrency-clean-run-3/trigger-task-run.log

  # Use final UUID (task-id-final.txt if re-fired, else task-id.txt)
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id-final.txt 2>/dev/null || \
              cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt)

  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT status, failure_reason FROM tasks WHERE id = '$TASK_UUID';" \
    > .sisyphus/evidence/formatcurrency-clean-run-3/db-final-status.txt

  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" \
    -c "SELECT from_status, to_status, actor, created_at FROM task_status_log WHERE task_id = '$TASK_UUID' ORDER BY created_at;" \
    >> .sisyphus/evidence/formatcurrency-clean-run-3/db-final-status.txt

  # Save Fly logs
  fly logs --app ai-employee-workers --no-tail 2>&1 | tail -100 \
    > .sisyphus/evidence/formatcurrency-clean-run-3/fly-logs.txt
  ```

  **Must NOT do**:
  - Do NOT manually write to the DB during the run (`psql UPDATE` etc.)
  - Do NOT kill the `ai-dev` tmux session (Inngest Dev Server)
  - Do NOT kill the tunnel during the run
  - Do NOT declare Done until the log shows `Task completed successfully!` and `EXIT_CODE:0`
  - Cap at 90 min of waiting with no log progress; after 90 min stalled, apply the Polling Timed Out fix above
  - Do NOT fix code unrelated to the current E2E failure (no opportunistic cleanup)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - Reason: Requires adaptive decision-making, reading logs, diagnosing failures from a lookup table, and potentially rebuilding + redeploying the Docker image — higher cognitive load than `quick`

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after T2
  - **Blocks**: T4
  - **Blocked By**: T2

  **References**:
  - `scripts/trigger-task.ts` — what terminal success state looks like in logs
  - `scripts/verify-e2e.ts` — understand the 12 checks to proactively diagnose failures
  - `src/inngest/lifecycle.ts` lines 97–169 — hybrid-spawn block (EXECUTION_ID, env vars)
  - `src/workers/lib/between-wave-push.ts` — between-wave push (--force fix)
  - `src/workers/lib/branch-manager.ts` — final push (fetch origin fix)
  - `src/workers/lib/fallback-pr.ts` — fallback PR creation (createPR fix)
  - `.sisyphus/notepads/formatcurrency-rerun/learnings.md` — full bug history from all previous runs

  **Acceptance Criteria**:
  - `trigger-task-run.log` shows `EXIT_CODE:0` ✅
  - DB `tasks.status` = `Done` ✅
  - PR URL present in log ✅
  - No `actor = 'manual'` in `task_status_log` ✅

  **QA Scenarios**:

  ```
  Scenario: Run completes successfully (Done path)
    Tool: Bash
    Steps:
      1. grep "EXIT_CODE:0" /tmp/ai-fc3-e2e.log → found
      2. psql: SELECT status FROM tasks WHERE id = '$TASK_UUID' → 'Done'
      3. grep "Pull Request" /tmp/ai-fc3-e2e.log → PR URL present
    Expected Result: All 3 pass
    Failure Indicator: EXIT_CODE:1 or status = AwaitingInput → diagnose via failure table above
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-3/trigger-task-run.log
              .sisyphus/evidence/formatcurrency-clean-run-3/db-final-status.txt

  Scenario: Audit trail has no manual actors
    Tool: Bash
    Steps:
      1. psql: SELECT actor FROM task_status_log WHERE task_id = '$TASK_UUID'
      2. Verify all actors ∈ {'gateway', 'lifecycle_fn', 'machine'}
    Expected Result: No actor = 'manual'
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-3/db-final-status.txt
  ```

  **Commit**: NO

---

- [x] 4. Run verify:e2e + validate PR content

  **What to do**:

  ### 4a. Determine the final task UUID

  ```bash
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id-final.txt 2>/dev/null || \
              cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt)
  echo "Verifying task: $TASK_UUID"
  ```

  ### 4b. Run the 12-point verification

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  pnpm verify:e2e --task-id $TASK_UUID 2>&1 | tee .sisyphus/evidence/formatcurrency-clean-run-3/verify-e2e.txt
  echo "verify:e2e exit code: $?"
  ```

  **Expected**: `✅  ALL 12/12 CHECKS PASSED — Phase 8 Done!`

  If any check fails, diagnose and fix inline. **Maximum 2 verify:e2e attempts.** If still failing on second attempt, escalate (save all evidence and report which checks failed with full output).

  | Check                          | Symptom                    | Fix                                                                                                   |
  | ------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------- |
  | Check 5 (heartbeat)            | `heartbeat_at` null        | Worker didn't start — check Fly logs; rebuild + push image                                            |
  | Check 6 (validation_runs)      | 0 validation runs          | UUID defaults missing: `psql ... -f prisma/migrations/20260410140640_add_uuid_defaults/migration.sql` |
  | Check 7 (PR)                   | PR not found               | Git push failed; check `fly-logs.txt` for `fatal: push rejected`                                      |
  | Check 9 (audit trail)          | Missing status transitions | Worker completion.ts failed — check Fly logs                                                          |
  | Check 10 (deliverable)         | No deliverable record      | PostgREST insert failed; check completion.ts + UUID defaults                                          |
  | Check 11 (execution populated) | Fields null                | Worker crashed before writing tokens; check `orchestrate.mts` in Fly logs                             |
  | Check 12 (cleanup)             | Machine still running      | `fly machines destroy <id> --app ai-employee-workers --force`                                         |

  ### 4c. Validate PR content matches spec

  ```bash
  # Extract PR number from log
  PR_URL=$(grep -oE "https://github.com/viiqswim/ai-employee-test-target/pull/[0-9]+" /tmp/ai-fc3-e2e.log | head -1)
  PR_NUM=$(echo $PR_URL | grep -oE "[0-9]+$")
  echo "PR: $PR_URL"
  echo "$PR_URL" > .sisyphus/evidence/formatcurrency-clean-run-3/pr-url.txt

  # Validate PR state, branch, and files
  gh pr view $PR_NUM --repo viiqswim/ai-employee-test-target --json state,headRefName,files \
    > .sisyphus/evidence/formatcurrency-clean-run-3/pr-meta.json
  cat .sisyphus/evidence/formatcurrency-clean-run-3/pr-meta.json | jq '{state, headRefName, files: [.files[].path]}'
  # state must be "OPEN", headRefName must match "ai/TEST-*", files must include src/index.ts and src/index.test.ts

  # Get PR diff and verify quality
  gh pr diff $PR_NUM --repo viiqswim/ai-employee-test-target \
    > .sisyphus/evidence/formatcurrency-clean-run-3/pr-diff.txt

  # Check Intl.NumberFormat in src/index.ts patch
  grep "Intl.NumberFormat" .sisyphus/evidence/formatcurrency-clean-run-3/pr-diff.txt
  # Must find ≥1 match

  # Check formatCurrency appears ≥3 times (function def + test cases)
  grep -c "formatCurrency" .sisyphus/evidence/formatcurrency-clean-run-3/pr-diff.txt
  # Must be ≥3

  # Also save JSON version for programmatic checks
  gh api repos/viiqswim/ai-employee-test-target/pulls/${PR_NUM}/files \
    > .sisyphus/evidence/formatcurrency-clean-run-3/pr-diff.json
  ```

  **PR must contain**:
  - `formatCurrency` exported from `src/index.ts` using `Intl.NumberFormat`
  - Unit tests in `src/index.test.ts` covering USD, EUR, GBP, JPY, negative values, zero
  - PR state = OPEN (not draft, not merged)
  - Branch name = `ai/TEST-{key}-{key-lowercase}`

  If PR content is missing tests or has wrong implementation: document in `pr-quality-note.txt` but do NOT re-fire — this is an AI output quality issue, not a pipeline infrastructure issue.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential after T3
  - **Blocks**: T5
  - **Blocked By**: T3

  **References**:
  - `scripts/verify-e2e.ts` — the 12 checks in detail
  - PR #24 diff: https://github.com/viiqswim/ai-employee-test-target/pull/24/files — canonical correct implementation

  **Acceptance Criteria**:
  - `verify-e2e.txt` shows `ALL 12/12 CHECKS PASSED` (exit code 0) ✅
  - `pr-meta.json` shows `state = "OPEN"` ✅
  - `pr-meta.json` shows `headRefName` matches `ai/TEST-*` ✅
  - `pr-diff.txt` contains `Intl.NumberFormat` ✅
  - `grep -c formatCurrency pr-diff.txt` ≥ 3 ✅
  - `pr-diff.json` includes `src/index.ts` and `src/index.test.ts` in changed files ✅

  **QA Scenarios**:

  ```
  Scenario: 12/12 verify:e2e pass
    Tool: Bash
    Steps:
      1. grep "ALL 12/12 CHECKS PASSED" .sisyphus/evidence/formatcurrency-clean-run-3/verify-e2e.txt → found
      2. echo "exit code: $?" → 0
    Expected Result: Both pass
    Failure Indicator: Pattern not found → diagnose failing check numbers, apply fix table above, re-run (max 2 attempts)
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-3/verify-e2e.txt

  Scenario: PR implements formatCurrency correctly and is OPEN
    Tool: Bash
    Steps:
      1. cat pr-meta.json | jq '.state' → "OPEN"
      2. cat pr-meta.json | jq '.headRefName' → matches "ai/TEST-..."
      3. grep "Intl.NumberFormat" pr-diff.txt → found
      4. grep -c "formatCurrency" pr-diff.txt → ≥3
      5. cat pr-diff.json | jq '[.[].filename]' → contains "src/index.ts" and "src/index.test.ts"
    Expected Result: All 5 assertions pass
    Failure Indicator: state = CLOSED or MERGED → pipeline may have auto-merged (check PR settings); quality failures → document in pr-quality-note.txt
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-3/pr-meta.json
              .sisyphus/evidence/formatcurrency-clean-run-3/pr-diff.txt
  ```

  **Commit**: NO

---

- [x] 5. Save evidence + final summary

  **What to do**:

  ### 5a. Collect final evidence snapshot

  ```bash
  cd /Users/victordozal/repos/dozal-devs/ai-employee
  TASK_UUID=$(cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id-final.txt 2>/dev/null || \
              cat .sisyphus/evidence/formatcurrency-clean-run-3/task-id.txt)

  # Final DB state (use correct column names from clean-run-2 evidence)
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "
    SELECT t.status, t.failure_reason,
           e.heartbeat_at, e.agent_version_id, e.prompt_tokens, e.completion_tokens,
           (SELECT COUNT(*) FROM validation_runs WHERE execution_id = e.id) AS validation_runs,
           (SELECT COUNT(*) FROM deliverables WHERE task_id = t.id) AS deliverables
    FROM tasks t
    LEFT JOIN executions e ON e.task_id = t.id
    WHERE t.id = '$TASK_UUID';
  " > .sisyphus/evidence/formatcurrency-clean-run-3/final-db-snapshot.txt

  # Status log actors
  psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "
    SELECT from_status, to_status, actor, created_at
    FROM task_status_log WHERE task_id = '$TASK_UUID' ORDER BY created_at;
  " >> .sisyphus/evidence/formatcurrency-clean-run-3/final-db-snapshot.txt

  # Fly machines should be 0
  fly machines list --app ai-employee-workers --json 2>/dev/null | jq 'length' \
    > .sisyphus/evidence/formatcurrency-clean-run-3/fly-machines-final.txt

  echo "Evidence collection complete"
  ls -la .sisyphus/evidence/formatcurrency-clean-run-3/
  ```

  ### 5b. Print final summary

  ```
  ✅ formatCurrency Clean Run 3 — COMPLETE
  Task ID:       <uuid>
  PR URL:        https://github.com/viiqswim/ai-employee-test-target/pull/<N>
  PR State:      OPEN
  verify:e2e:    12/12 PASS
  Duration:      ~XX minutes (start to EXIT_CODE:0)
  Fly machines:  0 (cleaned up)
  Issues encountered: <list any issues fixed inline, or "none">
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — final task
  - **Blocked By**: T4

  **Acceptance Criteria**:
  - `final-db-snapshot.txt` populated (correct columns from executions table) ✅
  - `fly-machines-final.txt` = 0 ✅
  - `pr-url.txt` contains a GitHub PR URL ✅
  - `verify-e2e.txt` shows 12/12 ✅
  - Summary printed ✅

  **QA Scenarios**:

  ```
  Scenario: Evidence directory is complete
    Tool: Bash
    Steps:
      1. ls .sisyphus/evidence/formatcurrency-clean-run-3/ → contains:
         task-key.txt, task-id.txt, tunnel-url.txt, preflight.txt,
         trigger-task-run.log, db-final-status.txt, fly-logs.txt,
         verify-e2e.txt, pr-url.txt, pr-meta.json, pr-diff.txt, pr-diff.json,
         final-db-snapshot.txt, fly-machines-final.txt
      2. cat fly-machines-final.txt → 0
    Expected Result: All files present and non-empty
    Evidence: .sisyphus/evidence/formatcurrency-clean-run-3/ (directory listing)
  ```

  **Commit**: NO

---

## Final Verification Wave

> This is a pipeline execution plan — no separate final verification wave. T4 and T5 together constitute verification.

---

## Commit Strategy

- No commits to the `ai-employee` repo during this plan.
- The only expected commit is by the worker agent on `viiqswim/ai-employee-test-target`.

---

## Success Criteria

### Verification Commands

```bash
# 12/12 pass
grep "ALL 12/12 CHECKS PASSED" .sisyphus/evidence/formatcurrency-clean-run-3/verify-e2e.txt

# PR has Intl.NumberFormat
grep "Intl.NumberFormat" .sisyphus/evidence/formatcurrency-clean-run-3/pr-diff.json

# formatCurrency appears ≥3 times in diff (function def + tests)
grep -c "formatCurrency" .sisyphus/evidence/formatcurrency-clean-run-3/pr-diff.json  # ≥3

# No manual DB writes
grep "manual" .sisyphus/evidence/formatcurrency-clean-run-3/db-final-status.txt || echo "CLEAN"

# No orphaned Fly machines
cat .sisyphus/evidence/formatcurrency-clean-run-3/fly-machines-final.txt  # Expected: 0
```

### Final Checklist

- [ ] `pnpm verify:e2e --task-id <uuid>` shows `ALL 12/12 CHECKS PASSED`
- [ ] New PR created (different from PR #24, #27, #29)
- [ ] PR state = OPEN (not draft, not closed)
- [ ] PR branch name = `ai/TEST-{key}-{key-lowercase}`
- [ ] PR diff contains `Intl.NumberFormat` in `src/index.ts`
- [ ] PR diff contains Vitest tests in `src/index.test.ts`
- [ ] No manual DB intervention during run
- [ ] Fly machines = 0 after completion
- [ ] All evidence files saved to `.sisyphus/evidence/formatcurrency-clean-run-3/`
