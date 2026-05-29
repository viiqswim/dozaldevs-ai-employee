---
name: debugging-lifecycle
description: Use when debugging a stuck or failed AI employee task. Covers all 13 lifecycle states, auto-pass vs blocking states, stuck-state diagnostics, approval flow debugging, reviewing-watchdog behavior, task_status_log queries, and admin API commands for task status checking.
---

# AI Employee Lifecycle Debugger

## State Overview

The universal lifecycle (`employee/universal-lifecycle`) transitions every task through 13 states. Triggered by `employee/task.dispatched`.

### State Reference Table

| State         | Type        | Set by                         | Auto-passes? | Max dwell time            |
| ------------- | ----------- | ------------------------------ | ------------ | ------------------------- |
| Received      | Initial     | Gateway                        | No           | Until Inngest run starts  |
| Triaging      | Transient   | Lifecycle                      | ✅ Yes       | Milliseconds              |
| AwaitingInput | Transient   | Lifecycle                      | ✅ Yes       | Milliseconds              |
| Ready         | Active      | Lifecycle                      | No           | Until worker dispatches   |
| Executing     | Active      | Lifecycle                      | No           | Up to 30 min (120×15s)    |
| Validating    | Transient   | Lifecycle                      | ✅ Yes       | Milliseconds              |
| Submitting    | Active      | Lifecycle                      | No           | Until classification done |
| Reviewing     | Blocking    | Lifecycle                      | No           | Up to 24h (timeout_hours) |
| Approved      | Transient   | Lifecycle                      | No           | Milliseconds (inline)     |
| Delivering    | Active      | Lifecycle                      | No           | Up to 30 min (3 retries)  |
| Done          | Terminal ✅ | Lifecycle                      | —            | —                         |
| Failed        | Terminal ❌ | Lifecycle / Watchdog / Harness | —            | —                         |
| Cancelled     | Terminal 🚫 | Lifecycle                      | —            | —                         |

---

## Happy Path Sequence

```
Received
  → Triaging (auto-pass)
  → AwaitingInput (auto-pass)
  → Ready
  → Executing           ← Docker / Fly.io worker spawned here
  [worker runs, sets status=Submitting via PostgREST when done]
  → Validating (auto-pass)
  → Submitting
  → Reviewing           ← Slack approval card posted (approval_required=true only)
  → Approved            ← PM clicks "Approve & Send"
  → Delivering          ← Delivery machine spawned
  → Done
```

**Shortcircuit paths (approval_required=false):**

```
... → Submitting → Delivering → Done   (no Reviewing step)
```

**Pre-check shortcircuit (guest-messaging only):**

```
Received → Done   (<5s, last message from host — no worker spawned)
```

**NO_ACTION_NEEDED shortcircuit:**

```
... → Submitting → Done   (worker returned NO_ACTION_NEEDED classification)
```

---

## Service Health Checks (Run First)

Before diagnosing any task issue, confirm all services are up:

| Service        | Command                                                                   | Expected           |
| -------------- | ------------------------------------------------------------------------- | ------------------ |
| Gateway        | `curl -s http://localhost:7700/health \| jq .`                            | `{"status":"ok"}`  |
| Inngest        | `curl -s http://localhost:8288/health \| jq .`                            | `{"status":"ok"}`  |
| Dashboard      | `curl -s http://localhost:7701/dashboard/ -o /dev/null -w "%{http_code}"` | `200`              |
| Inngest Dev UI | Open `http://localhost:8288`                                              | Visual run history |

If gateway is down: `pnpm dev`. If Docker image is stale: `docker build -t ai-employee-worker:latest .`

---

## How the Lifecycle Polls for Worker Completion

After dispatching the worker, the lifecycle runs `poll-completion`:

- Polls task status every **15 seconds**, up to **120 iterations** (= 30 min max)
- Returns `Submitting` (success) or `Failed` (timeout)
- The **worker** (not the lifecycle) patches status to `Submitting` when it finishes
- If the poll loop exhausts all 120 iterations without seeing `Submitting`, the lifecycle marks the task `Failed`

---

## Stuck State Diagnostics

### State: Executing — no progress after 5+ min

**Possible causes:**

| Symptom                        | Cause                                     | Check                                                         | Fix                                                 |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Task stays `Executing` > 5 min | Worker OOM                                | `fly logs -a ai-employee-workers` for `Out of memory: Killed` | Increase `WORKER_VM_SIZE` or `vm_size` on archetype |
| Task stays `Executing` > 5 min | OpenCode session bootstrap failure        | Worker logs: `session bootstrap failure`                      | Pin to OpenCode 1.14.31 — never use 1.14.33+        |
| Task stays `Executing` > 5 min | Worker can't reach PostgREST              | Worker logs: `Task not found` or PostgREST 5xx                | Check `TUNNEL_URL` or PostgREST connectivity        |
| Task goes `Failed` < 30 min    | Worker SIGTERM (Fly.io machine preempted) | `task_status_log` actor = `opencode_harness` with `→ Failed`  | Retry — preemptions are transient                   |
| Task auto-fails at 30 min      | Poll loop exhausted                       | `task_status_log`: `Executing` then `Failed`, no `Submitting` | Worker never completed — check container logs       |

**Check worker logs:**

```bash
# Fly.io (all workers)
fly logs -a ai-employee-workers

# Local Docker
docker logs employee-<first-8-chars-of-taskId>
# e.g. for task id abc12345-...: docker logs employee-abc12345
```

**Harness log file** (persists after container exits — more complete than `docker logs`):

```bash
# Full log (often 1–5 MB)
cat /tmp/employee-${TASK_ID:0:8}.log

# Harness events only (skip OpenCode server noise)
grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30

# Errors and warnings only (level 40 = warn, level 50 = error)
grep '"level":[45][0-9]' /tmp/employee-${TASK_ID:0:8}.log

# Dashboard viewer (noise-filtered, recommended for human reading)
# http://localhost:7701/dashboard/tasks/<TASK_ID>/logs?tenant=<TENANT_ID>
```

---

### State: Reviewing — stuck or zombie

A task stuck in `Reviewing` with **no `pending_approvals` row** is a zombie. The `reviewing-watchdog` cron fires every 15 min and marks it `Failed` after **30+ min** in this state.

**Zombie criteria (ALL must be true):**

1. `status = 'Reviewing'`
2. `updated_at < NOW() - 30 min`
3. No row in `pending_approvals` for that `task_id`

**Check for zombie:**

```sql
-- PostgREST: check pending_approvals
GET /rest/v1/pending_approvals?task_id=eq.<taskId>&select=id

-- If empty array returned → zombie (worker posted error, not approval card)
```

**If task has a valid approval card but button click isn't working:**

- Verify gateway shows `"Slack Bolt — Socket Mode connected"` in logs
- Check `slack_bolt_authorization_error` in logs → re-run OAuth for that tenant
- Retry by clicking again — transient WebSocket drops recover automatically
- Use the manual approval fallback (see below)

**Manual approval fallback:**

```bash
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"<SLACK_USER_ID>","userName":"Victor"}}'
```

---

### State: Submitting — no transition after worker completes

Worker wrote `/tmp/summary.txt` but lifecycle isn't moving forward.

**Possible causes:**

| Symptom                                          | Cause                                    | Check                                                                                   |
| ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `Submitting` for >5 min after Executing          | Deliverable not written to DB            | Query `deliverables?external_ref=eq.<taskId>` — if empty, worker crashed before writing |
| `Submitting` for >2 min (approval_required=true) | Slack bot token missing from machine env | Check lifecycle logs for `SLACK_BOT_TOKEN` warning                                      |
| NO_ACTION_NEEDED path stuck                      | Override card posting failed             | Check `deliverables` metadata for `override_card_ts`                                    |

---

### State: Delivering — task approved but not completing

Delivery machine spawned but task doesn't reach `Done`.

**Check:**

```bash
fly logs -a ai-employee-workers
# look for employee-delivery-<first-8-chars>
```

**Local Docker mode:**

```bash
# Find delivery container
docker ps --filter name=employee-delivery-${TASK_ID:0:8}

# Tail delivery logs
docker logs -f employee-delivery-${TASK_ID:0:8}
```

**Possible causes:**

- Archetype missing `delivery_instructions` → lifecycle marks `Failed` with reason `Archetype missing delivery_instructions`
- Delivery machine can't reach external API (Hostfully, Slack)
- Up to 3 retries — check logs for retry attempts

---

### Pre-check: Task goes Done in < 5 seconds

This is **expected behavior**, not a bug. Applies to `guest-messaging` archetype only.

If the last message in the Hostfully thread was sent by the host (`senderType=AGENCY`), the lifecycle skips the worker entirely:

```
Received → Done  (logged: from_status=Received, to_status=Done, actor=lifecycle_fn)
```

**To verify this is what happened:**

```bash
# Check task_status_log
GET /rest/v1/task_status_log?task_id=eq.<taskId>&order=created_at.asc
# If only one row: from_status=Received, to_status=Done → pre-check fired
```

---

## Reading task_status_log

Every state transition is logged with `from_status`, `to_status`, `actor`, and `updated_at`.

**Actor values:**
| Actor | Who set it |
| --- | --- |
| `lifecycle_fn` | Universal lifecycle Inngest function |
| `opencode_harness` | Worker container (harness) |
| `reviewing-watchdog` | Watchdog cron (zombie cleanup) |

**Full happy-path log sequence:**

```
Received → Triaging         (lifecycle_fn)
Triaging → AwaitingInput    (lifecycle_fn)
AwaitingInput → Ready       (lifecycle_fn)
Ready → Executing           (lifecycle_fn)
[worker runs — harness may log Executing → Submitting]
Submitting → Validating     (lifecycle_fn)
Validating → Submitting     (lifecycle_fn)
Submitting → Reviewing      (lifecycle_fn)
Reviewing → Approved        (lifecycle_fn)
Approved → Delivering       (lifecycle_fn)
Delivering → Done           (opencode_harness)
```

**Query task_status_log via PostgREST:**

```bash
curl "http://localhost:54331/rest/v1/task_status_log?task_id=eq.<taskId>&order=created_at.asc" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
```

---

## Execution Metrics (Token Usage & Cost)

Spot runaway LLM loops or unexpectedly expensive runs:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT prompt_tokens, completion_tokens, estimated_cost_usd FROM executions WHERE task_id = '$TASK_ID';"
```

**Red flags**: `completion_tokens > 50000` (model looping), `estimated_cost_usd > 0.50` (expensive run for a simple employee).

---

## Admin API Commands

### Check task status

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/<tenantId>/tasks/<taskId>"
```

Returns current `status`, `failure_reason`, `metadata`, and `updated_at`.

### Trigger an employee (for testing)

```bash
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/<tenantId>/employees/<slug>/trigger" \
  -H "Content-Type: application/json" -d '{}'
```

### Dry-run trigger (validates without creating task)

```bash
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/<tenantId>/employees/<slug>/trigger?dry_run=true" \
  -H "Content-Type: application/json" -d '{}'
```

---

## Reviewing Watchdog Details

**Inngest function id:** `trigger/reviewing-watchdog`  
**Schedule:** `*/15 * * * *` (every 15 minutes)  
**Zombie threshold:** `ZOMBIE_THRESHOLD_MINUTES = 30`

**Logic:**

1. Fetches all tasks with `status=Reviewing` AND `updated_at < (NOW - 30min)`
2. For each task, checks if a `pending_approvals` row exists
3. If NO pending approval row → marks task `Failed` with reason: _"Task stuck in Reviewing with no approval card for >30 minutes. Worker likely posted an error instead of an approval card."_
4. Logs `Reviewing → Failed` with `actor=reviewing-watchdog`

**Note:** Tasks with valid `pending_approvals` rows are left alone — the PM may still click Approve/Reject at any point up to `timeoutHours` (default 24h).

---

## Cancellation Causes

A task reaches `Cancelled` through three paths:

| Path             | Trigger                                                                       | Log entry               |
| ---------------- | ----------------------------------------------------------------------------- | ----------------------- |
| PM rejects       | PM clicks "Reject" button → `employee/approval.received` with `action=reject` | `Reviewing → Cancelled` |
| Approval timeout | `step.waitForEvent` times out after `timeoutHours` (default 24h)              | `Reviewing → Cancelled` |
| Superseded       | New task arrives for same thread → old task gets `action=superseded` event    | `Reviewing → Cancelled` |

Cancelled is a valid terminal state — not an error. Re-check the Slack card to see which path fired.

---

## Failure Causes

A task reaches `Failed` through four paths:

| Path                     | Who sets it   | Reason                                                 |
| ------------------------ | ------------- | ------------------------------------------------------ |
| poll-completion timeout  | Lifecycle     | Worker didn't set Submitting within 30min              |
| Delivery machine failure | Lifecycle     | Missing `delivery_instructions` or 3 retries exhausted |
| Reviewing watchdog       | Watchdog cron | Zombie: no `pending_approvals` row after 30min         |
| SIGTERM / preemption     | Harness       | Fly.io machine killed mid-run                          |

Check `tasks.failure_reason` field for the specific message.

---

## Quick Diagnostic Decision Tree

```
Task is stuck / unexpected state?
│
├─ Status = Done in < 5s?
│    └─ Pre-check fired (last message from host). EXPECTED. Check task_status_log.
│
├─ Status = Executing, >5min?
│    ├─ Check fly logs / docker logs for worker container
│    ├─ OOM? → increase WORKER_VM_SIZE
│    ├─ Bootstrap failure? → OpenCode version issue
│    └─ No logs? → PostgREST unreachable from worker
│
├─ Status = Submitting, >5min?
│    ├─ No deliverable row? → Worker crashed before writing
│    └─ Deliverable exists? → Check Slack bot token and channel config
│
├─ Status = Reviewing, >30min?
│    ├─ Check pending_approvals for this task_id
│    ├─ Empty? → Zombie (watchdog will fix in ≤15min) OR fire manual approval
│    └─ Has row? → Slack button issue — try manual approval fallback
│
├─ Status = Delivering, >5min?
│    ├─ Check fly logs for delivery container
│    └─ failure_reason = "Archetype missing delivery_instructions"? → Fix archetype seed
│
├─ Status = Failed?
│    ├─ Check tasks.failure_reason for specific message
│    ├─ actor = reviewing-watchdog? → Was zombie in Reviewing
│    ├─ actor = opencode_harness? → SIGTERM / preemption — retrigger
│    └─ No status_log entry? → Poll timeout — check worker logs
│
└─ Status = Cancelled?
     ├─ PM rejected? → Check Slack card / feedback_events
     ├─ Timed out (24h)? → task_status_log shows gap of 24h in Reviewing
     └─ Superseded? → A newer task for same thread took over
```

---

## Key Constants (from employee-lifecycle.ts)

```typescript
SYNTHESIS_THRESHOLD = 5          // confirmed rules before synthesis fires
MAX_EMPLOYEE_RULES_CHARS = 8000  // cap on EMPLOYEE_RULES env var
MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000  // cap on EMPLOYEE_KNOWLEDGE env var
ZOMBIE_THRESHOLD_MINUTES = 30    // reviewing-watchdog threshold
poll_interval = 15_000ms         // poll-completion interval
max_polls = 120                  // = 30 min max execution window
```

---

## Slack Message Updates by State

Every state change updates the "Task received" Slack notification message (if `notify_slack_ts` is stored in `task.metadata`):

| State               | Slack update                          |
| ------------------- | ------------------------------------- |
| Received            | ⏳ Task received — processing         |
| Reviewing           | ⏳ Awaiting approval — reply drafted  |
| Approved            | ✅ Approved by @User — delivering now |
| Done (no approval)  | ✅ Task complete                      |
| Failed              | ❌ Task failed                        |
| Cancelled / Expired | ⏰ Expired — no action taken          |

If the notification message isn't updating, check `task.metadata.notify_slack_ts` is set (logged as `notify_slack_ts stored in task metadata` in lifecycle logs).

---

## Slack Thread Inspection

Check what was actually posted to the notification thread:

```bash
source .env
CHANNEL=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT metadata->>'notify_slack_channel' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')
NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')

curl -s "https://slack.com/api/conversations.replies" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
  -d "channel=$CHANNEL&ts=$NOTIFY_TS&limit=20" \
  | jq '[.messages[] | {ts: .ts, text: (.text | .[0:200])}]'
```

**Expected thread structure (approval path):**

| Position | Content                                                             |
| -------- | ------------------------------------------------------------------- |
| MSG 0    | Original notify-received message (updated to ✅ Done at completion) |
| MSG 1    | Approval card (ts also stored in `pending_approvals.slack_ts`)      |
| MSG 2    | Delivery message with actual content                                |

Get channel and ts from `tasks.metadata` if not already set in your shell:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT metadata->>'notify_slack_channel', metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';"
```
