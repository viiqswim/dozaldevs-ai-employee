---
name: e2e-testing
description: Use when running end-to-end tests on the AI employee platform. Covers prerequisites checklist, per-employee trigger methods (guest-messaging, summarizer, code-rotation), Playwright browser automation for Slack/Airbnb via CDP, state verification via task_status_log and pending_approvals, and the full scenario library (Slack UX scenarios A-F, Feedback Pipeline scenarios A-F). Load this skill before writing any E2E test plan or running manual E2E validation.
---

# AI Employee Platform — E2E Testing Guide

## The Golden Rule

Every E2E test run must produce **documented evidence**: task ID, state machine trace, Slack UI screenshots, and delivery confirmation. "The code ran" is not evidence. Document every checkpoint.

---

## Prerequisites Checklist (confirm ALL before any scenario)

```bash
# 1. Gateway health
curl -s http://localhost:7700/health
# Expected: {"status":"ok"}

# 2. Inngest health
curl -s http://localhost:8288/health
# Expected: {"status":200,"message":"OK"}

# 3. Socket Mode connected (check running dev log)
tail -20 /tmp/ai-dev.log | grep -i "socket mode"
# Expected: "Slack Bolt — Socket Mode connected"

# 4. Docker image current (required after any src/workers/ change)
docker build -t ai-employee-worker:latest .
# Or verify existing image is fresh:
docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
```

If any check fails, stop and fix before running scenarios. Socket Mode drop is transient — retry or restart gateway. Missing Docker image = stale harness = misleading failures.

---

## Per-Employee Trigger Methods

### Guest-Messaging (VLRE)

**Primary: send a real Airbnb message** (triggers real webhook from Hostfully)

```
URL: https://www.airbnb.com/guest/messages/2530903609
Action: Click "Write a message...", type message with [e2e-test-{epoch}] suffix, send
```

Generate epoch suffix: `date +%s`

**Secondary: simulate webhook directly** (use when real Airbnb message is impractical)

```bash
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-msg-'"$(date +%s)"'",
    "thread_uid": "dc2c8f5e-b83d-4078-b709-cc03bf47dd4a",
    "lead_uid":   "f83d431f-0985-457b-a535-60c2991b7c83",
    "property_uid": "51ec272e-8819-4c8e-b8a3-9a2286b3ed65"
  }'
```

`message_uid` MUST be unique per call (dedup key). A real unresponded guest message must exist in Hostfully for the model to return `NEEDS_APPROVAL`; otherwise it returns `NO_ACTION_NEEDED`.

**Fixed test resources (VLRE)**

| Resource               | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Airbnb thread URL      | `https://www.airbnb.com/guest/messages/2530903609` |
| Thread UID             | `dc2c8f5e-b83d-4078-b709-cc03bf47dd4a`             |
| Lead UID               | `f83d431f-0985-457b-a535-60c2991b7c83`             |
| Property UID           | `51ec272e-8819-4c8e-b8a3-9a2286b3ed65`             |
| Slack approval channel | `#cs-guest-communication` (`C0AMGJQN05S`)          |
| Slack notification ch  | `C0960S2Q8RL` (rule cards, synthesis cards)        |
| VLRE tenant ID         | `00000000-0000-0000-0000-000000000003`             |
| Guest-msg archetype ID | `00000000-0000-0000-0000-000000000015`             |

### Summarizer (DozalDevs)

```bash
curl -X POST \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" \
  -d '{}'
```

Approval card appears in `#victor-tests` (`C0AUBMXKVNU`). Published to `#project-lighthouse` (`C092BJ04HUG`) on approval.

### Code-Rotation (VLRE)

```bash
curl -X POST \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/code-rotation/trigger" \
  -d '{}'
```

No approval gate — `approval_required: false`. Task auto-completes to `Done`.

---

## Checking Pipeline State Without Polling DB

Read the Slack channel first — it's faster and always up to date:

- Top-level message in channel → "Task received — ⏳ processing" means `Executing`
- Approval card appears as a **thread reply** — click "1 reply" or "View thread" to find it
- Task ID is always in a `context` block at the bottom of every message: `Task \`{taskId}\``
- Terminal states update the top-level message: `✅ Done`, `❌ Failed`, `⏭️ Superseded`, `⏰ Expired`
- A task that transitions to `Done` in under 5 seconds = pre-check fired (last Hostfully message was from host — no reply needed)

---

## Playwright Browser Automation (CDP)

**ALWAYS connect via CDP to the user's real Chrome** — do NOT use headless. The Airbnb compose bar requires a real session.

```javascript
// Connect to existing Chrome with remote debugging
const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

// Navigate
await page.goto('https://www.airbnb.com/guest/messages/2530903609');
await page.goto('https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S');
```

Check CDP is available: `curl -s http://localhost:9222/json/version && echo "CDP ready" || echo "Need Chrome with --remote-debugging-port=9222"`

**Key browser targets:**

| Target            | URL                                                    |
| ----------------- | ------------------------------------------------------ |
| Airbnb thread     | `https://www.airbnb.com/guest/messages/2530903609`     |
| Slack approval    | `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S` |
| Slack rules/notif | `https://app.slack.com/client/T06KFDGLHS6/C0960S2Q8RL` |
| Inngest dashboard | `http://localhost:8288`                                |

**Airbnb — send message:**

```javascript
await page.getByRole('textbox', { name: 'Write a message...' }).click();
await page
  .getByRole('textbox', { name: 'Write a message...' })
  .fill('Your message [e2e-test-' + Date.now() + ']');
await page.getByRole('button', { name: 'Send' }).click();
```

**Slack — approve task:**

```javascript
// Click "View thread" first to find the approval card in the thread
await page.getByText('View thread').first().click();
await page.getByRole('button', { name: /Approve & Send/i }).click();
```

---

## State Verification Queries

### Task status machine trace

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT from_status, to_status, actor, created_at
   FROM task_status_log
   WHERE task_id = '<TASK_ID>'
   ORDER BY created_at;"
```

**Expected happy path**: `NULL→Received`, `Received→Ready`, `Ready→Executing`, `Executing→Submitting`, `Submitting→Reviewing`, `Reviewing→Approved`, `Approved→Delivering`, `Delivering→Done`

### Find latest task for a thread

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, status, created_at, metadata->>'guest_name' AS guest
   FROM tasks
   WHERE raw_event->>'thread_uid' = 'dc2c8f5e-b83d-4078-b709-cc03bf47dd4a'
   ORDER BY created_at DESC LIMIT 3;"
```

### Pending approvals check

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT task_id, slack_ts, guest_name, property_name, created_at
   FROM pending_approvals
   WHERE task_id = '<TASK_ID>';"
```

Expected: row exists while in `Reviewing`; count = 0 after approval/rejection (row deleted).

### Confirm task metadata keys

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT metadata->>'guest_name', metadata->>'property_name',
          metadata->>'draft_response', metadata->>'original_message',
          metadata->>'thread_uid', metadata->>'lead_uid',
          metadata->>'confidence', metadata->>'category'
   FROM tasks WHERE id = '<TASK_ID>';"
```

All fields must be non-null for the full Slack context reply to render correctly.

### Simulate approval expiry (for Scenario E)

```bash
TASK_ID="<task-id-in-reviewing>"
curl -X POST http://localhost:8288/e/local \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"employee/approval.timeout\",\"data\":{\"taskId\":\"${TASK_ID}\"}}"
```

### Force failure via SIGTERM (for Scenario F)

```bash
# Find the container name (format: employee-{first8charsOfTaskId})
docker ps --filter name=employee- --format "{{.Names}}\t{{.Status}}"
docker stop employee-<taskIdPrefix>
```

### Manual approval fallback (when button click fails)

```bash
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"<SLACK_USER_ID>","userName":"Victor"}}'
```

---

## Scenario Coverage Table

**Minimum for any guest-messaging change: Scenario A (Slack UX guide)**

| Change area                                         | Run these scenarios                                |
| --------------------------------------------------- | -------------------------------------------------- |
| Approval card content or action buttons             | Slack UX: A, B, C                                  |
| Terminal state message blocks (Done/Failed/Expired) | Slack UX: A, E, F                                  |
| Context thread reply content                        | Slack UX: A (approve), B (reject), C (edit & send) |
| Supersede logic                                     | Slack UX: D                                        |
| `get-messages.ts` or guest name resolution          | Slack UX: A (verify guest name in card header)     |
| Feedback capture / `feedback_events` writes         | Feedback Pipeline: A, B, C                         |
| Rule extraction or `employee_rules` lifecycle       | Feedback Pipeline: A or B, then E                  |
| Rule injection (`EMPLOYEE_RULES` env var)           | Feedback Pipeline: Injection Verification section  |
| Feedback consolidation or synthesis trigger         | Feedback Pipeline: F                               |
| `interaction-handler` / thread reply capture        | Feedback Pipeline: D                               |
| `awaiting_input` rule path (reject w/o reason)      | Feedback Pipeline: C                               |

---

## Slack UX Scenarios — Quick Reference

Full step-by-step: `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`

| Scenario | Name              | What it verifies                                                                                      |
| -------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| **A**    | Approve → Done    | Property name, lead status, Hostfully button, REPLY_BROADCAST, rich Done blocks, context thread reply |
| **B**    | Reject → Done     | Rich Rejected blocks, "not sent" context reply (🤖 AI draft), no 📤 section                           |
| **C**    | Edit & Send       | Context reply shows 🤖 original AND ✏️ edited sections                                                |
| **D**    | Supersede         | First card updates to ⏭️ Superseded with correct (old) task ID in context block                       |
| **E**    | Expiry (simulate) | `employee/approval.timeout` event → `⏰ Expired — no action taken` blocks                             |
| **F**    | Failure (SIGTERM) | `docker stop` → `❌ Task failed · GuestName` with property name and Hostfully link                    |

### Scenario A — Full evidence checklist

After running Scenario A, collect:

- [ ] Task ID from Slack context block
- [ ] `task_status_log` shows all 8 state transitions in correct order
- [ ] `pending_approvals` count = 0 after approval
- [ ] Approval card updated to `✅ Approved by @ActorName · GuestName` with localized timestamp
- [ ] Context thread reply posted with 📋, guest message, sent response, Hostfully link
- [ ] Airbnb thread shows reply from "Leo" matching `draft_response`
- [ ] Task status = `Done` in DB

---

## Feedback Pipeline Scenarios — Quick Reference

Full step-by-step: `docs/testing/2026-05-12-0202-feedback-pipeline-v2-e2e-test-guide.md`

| Scenario | Name                             | Key tables checked                                                                              |
| -------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A**    | Edit & Send → rule extraction    | `feedback_events.event_type='edit_diff'`; `employee_rules.status='proposed'` → `'confirmed'`    |
| **B**    | Reject w/ reason → rule          | `feedback_events.event_type='rejection_reason'`; `employee_rules.source='rejection'`            |
| **C**    | Reject w/o reason → awaiting     | `employee_rules.status='awaiting_input'` → thread reply → PM replies → `'proposed'`             |
| **D**    | @mention / thread reply          | `feedback_events.event_type` in `('teaching','thread_reply')`; rule card in `C0960S2Q8RL`       |
| **E**    | Rule confirm / reject / rephrase | All three rule action buttons; `employee/rule.confirmed` event in Inngest                       |
| **F**    | Synthesis on 5th confirmation    | `employee/rule.synthesize-requested`; `employee_rules.source='synthesis'`; parents `'archived'` |

### Injection Verification (after any feedback pipeline work)

Trigger new task while it's `Executing`, then inspect container:

```bash
CONTAINER=$(docker ps -q --filter name=employee- --format "{{.Names}}" | head -1)
docker inspect $CONTAINER | python3 -c "
import json, sys
data = json.load(sys.stdin)
env = data[0].get('Config', {}).get('Env', [])
for e in env:
    if 'EMPLOYEE_RULES' in e or 'EMPLOYEE_KNOWLEDGE' in e:
        print(e[:500])
"
```

Also check: `tail -30 /tmp/ai-dev.log | grep "Employee rules assembled"` — must show `ruleCount > 0`.

---

## Tmux Session Management (Long-Running Commands)

`docker build` and `pnpm trigger-task` MUST run in tmux.

```bash
# Pre-flight: count active sessions
echo "Active tmux sessions: $(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')"

# Launch (kill existing first to avoid accumulation)
tmux kill-session -t ai-e2e 2>/dev/null
tmux new-session -d -s ai-e2e -x 220 -y 50
tmux send-keys -t ai-e2e \
  "cd /Users/victordozal/repos/dozal-devs/ai-employee && COMMAND 2>&1 | tee /tmp/ai-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-e2e.log" \
  Enter

# Poll
tail -30 /tmp/ai-e2e.log
grep "EXIT_CODE:" /tmp/ai-e2e.log && echo "DONE" || echo "RUNNING"

# Kill when done (MANDATORY)
tmux kill-session -t ai-e2e
```

Stale sessions exhaust macOS vnodes (`ENFILE: file table overflow`). Kill sessions as soon as commands complete.

---

## What Every E2E Verification Step Must Document

Per AGENTS.md plan requirement, each scenario run must record:

1. **Trigger used** — exact message text with `[e2e-test-{epoch}]` suffix, or curl command used
2. **Task ID** — UUID from DB or Slack context block
3. **State machine trace** — `task_status_log` output showing full `from→to` sequence
4. **DB state** — relevant table assertions (`tasks`, `pending_approvals`, `employee_rules`, `feedback_events`)
5. **Slack UI** — describe or screenshot key blocks (terminal state, context reply, rule card)
6. **Delivery** — final action confirmed (Airbnb reply visible, rule confirmed in DB, etc.)

---

## Troubleshooting

| Symptom                                   | Cause                                                 | Fix                                                                                              |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Task → `Done` in <5s, no approval card    | Pre-check: last Hostfully msg was from host           | Expected — host already replied; send a new guest message first                                  |
| No approval card after webhook            | Worker returned `NO_ACTION_NEEDED`                    | Ensure a real unresponded guest message exists in Hostfully for this lead                        |
| Button click does nothing                 | Transient Socket Mode WebSocket drop                  | Retry click; or use manual approval curl fallback                                                |
| Approval card not at channel level        | `REPLY_BROADCAST` not set                             | Check lifecycle: `rawEvent['thread_uid']` must be truthy to set `REPLY_BROADCAST=true`           |
| Context thread reply missing              | `metadata['original_message']` null                   | Check DB metadata; worker must write all fields to `/tmp/approval-message.json`                  |
| Rule card not appearing in `C0960S2Q8RL`  | `notification_channel` not set on archetype           | `SELECT notification_channel FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015';` |
| Synthesis not triggered after 5th confirm | Count not at multiple of 5, or idempotency key reused | Check confirmed rule count — must be exactly divisible by `SYNTHESIS_THRESHOLD` (5)              |
| `EMPLOYEE_RULES` empty in container       | No confirmed rules exist                              | Confirm at least one rule (Feedback Pipeline Scenario A), then trigger a new task                |
| `channel_not_found` from Slack API        | Wrong bot token for workspace                         | Re-run OAuth for the affected tenant                                                             |

---

## Model Selection for E2E Testing

Choosing the wrong model causes silent bash-tool failures that look like task logic bugs. Pick the right model before triggering any test.

**Recommended model**: `deepseek/deepseek-v4-flash` — confirmed reliable for tool calling in all E2E scenarios.

**Models that may NOT reliably call bash tools** (causes immediate task failure):

- `xiaomi/mimo-v2.5` — unreliable bash tool calling; avoid for E2E
- `minimax/minimax-m2.7` — fails bash tool calling via OpenCodeGo (E2E verified 2026-06-03)

**Models verified to reliably call bash tools**:

- `xiaomi/mimo-v2.5-pro` (distinct from `xiaomi/mimo-v2.5`) — verified reliable in engineer employee context (E2E verified 2026-06-03)
- `deepseek/deepseek-v4-flash` — recommended default for all E2E testing

**When testing wizard-generated employees**: override the model to `deepseek/deepseek-v4-flash` via DB before triggering:

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '<archetype_id>';"
```

Restore the original model after testing if needed.

---

## Gateway Pre-Flight Check

Run this before any Slack trigger workflow test. A stale or duplicate gateway silently drops ~50% of events.

```bash
# 1. Confirm single stable gateway (must be ≤2: tsx watch + one gateway process)
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l

# 2. Confirm exactly ONE listener on port 7700
lsof -i :7700 -sTCP:LISTEN

# 3. Confirm Socket Mode is connected and recent
grep "Socket Mode connected" /tmp/ai-dev.log | tail -1
```

If `pgrep` returns more than 2, kill the zombie processes before testing. If Socket Mode line is stale (older than a few minutes), restart the gateway.

**Confirm gateway stability** (must be stable for at least 30 seconds before triggering):

```bash
GATEWAY_PID=$(lsof -ti :7700 -sTCP:LISTEN)
echo "Gateway PID: $GATEWAY_PID — started at:"
ps -o lstart= -p $GATEWAY_PID
grep "Socket Mode connected" /tmp/ai-dev.log | tail -1
```

**Watch logs live during a test:**

```bash
# Start tail in background
tail -f /tmp/ai-dev.log | grep -E "(app_mention|interaction|trigger|confirmation|card|error)" &

# After test, verify confirmation card appeared within ~10 seconds
grep "confirmation card" /tmp/ai-dev.log | tail -3

# Kill the tail when done
kill %1
```

---

## Reference Documents

| Guide                                                                 | Scenarios covered                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`             | A–F (Slack UX — approval paths, terminal states)      |
| `docs/testing/2026-05-12-0202-feedback-pipeline-v2-e2e-test-guide.md` | A–F (Feedback Pipeline — rules, injection, synthesis) |
| `docs/testing/2026-05-04-2023-local-e2e-testing.md`                   | Local E2E without real external APIs                  |
