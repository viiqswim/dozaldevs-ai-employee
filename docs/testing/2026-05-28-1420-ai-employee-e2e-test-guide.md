# AI Employee — End-to-End Test Guide

> **Purpose**: A repeatable, step-by-step procedure to validate the full AI employee lifecycle from creation through Slack delivery. Run this any time you make changes to the generator, lifecycle, harness, or delivery pipeline to confirm nothing has regressed.

---

## What This Test Validates

- AI generation wizard produces working execution_steps (env var refs, submit-output, --draft-file, classification)
- Docker worker container executes the employee's instructions correctly
- Task progresses through the full lifecycle: Received → Executing → Submitting → Reviewing → Approved → Delivering → Done
- Approval card appears in Slack (or manual approval fallback works)
- Delivery container posts actual content (not a placeholder) to #victor-tests

---

## Recommended Employee Type

Use a **Slack channel summarizer** — it is the simplest employee that exercises the full approval path:

- Reads from `$SOURCE_CHANNELS` (env var already injected)
- Produces real content (a digest of messages)
- Requires approval → exercises the full Reviewing → Delivering → Done path
- Has no external API dependencies beyond Slack (no Hostfully, Sifely, Jira credentials needed)
- Fast: completes in ~2–3 minutes

**Description to use:**

```
An employee that reads messages from the last 24 hours in our Slack channel and posts a brief summary of the key topics discussed
```

---

## Prerequisites

Before starting, verify all services are running:

```bash
# Gateway
curl -s http://localhost:7700/health | jq .

# Inngest Dev Server
curl -s http://localhost:8288/health | jq .

# Dashboard
curl -s http://localhost:7701/dashboard/ -o /dev/null -w "%{http_code}"
# Expected: 200
```

If gateway is not running: `pnpm dev`  
If Docker worker image is stale (after any `src/workers/` changes): `docker build -t ai-employee-worker:latest .`

---

## Step 1 — Soft-Delete Any Previous Test Archetypes

Before each test run, clean up archetypes from previous runs to avoid slug collisions:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "UPDATE archetypes
      SET deleted_at = NOW()
      WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
        AND role_name NOT IN ('daily-summarizer', 'guest-messaging', 'code-rotation', 'real-estate-motivation-bot-2', 'daily-real-estate-inspiration-2-copy')
        AND deleted_at IS NULL
        AND id NOT IN (
          '00000000-0000-0000-0000-000000000012',
          '00000000-0000-0000-0000-000000000013',
          'ad5f02f0-f38d-4e00-abd0-4973cd93a7eb',
          '561439b9-7491-40de-a550-95906624fffc'
        );"
```

> **Why**: The wizard generates a `role_name` slug from the description. If a non-deleted archetype with the same slug already exists in the tenant, saving will fail or produce a duplicate.

---

## Step 2 — Generate the Employee via Wizard

1. Open: `http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`

2. In the **Describe** step, enter:

   ```
   An employee that reads messages from the last 24 hours in our Slack channel and posts a brief summary of the key topics discussed
   ```

3. Click **Generate** and wait (~10–30 seconds for the LLM to respond).

4. **DO NOT edit any AI-generated fields** (identity, execution_steps, delivery_steps, overview). The point of this test is to verify the generator produces working output out of the box.

5. Expand **Settings** and configure:
   - **Slack channel**: select `#victor-tests`
   - **Model**: change to `minimax/minimax-m2.7`

   > ⚠️ **Critical**: The wizard may recommend `openai/gpt-oss-120b`. That model produces text-only responses and never calls bash tools — the task will fail. Always use `minimax/minimax-m2.7`.

6. Click **Save as Draft**.

7. Note the archetype ID from the redirect URL:
   ```
   http://localhost:7701/dashboard/employees/<ARCHETYPE_ID>?tenant=...
   ```

---

## Step 3 — Verify Field Quality

Before triggering, confirm the generator produced the required patterns:

```bash
ARCHETYPE_ID="<paste archetype ID>"

PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT execution_steps, tool_registry::text FROM archetypes WHERE id = '$ARCHETYPE_ID';"
```

Check the output against these criteria:

| Check   | What to look for                                                 | Pass condition                                                               |
| ------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **AC1** | `$SOURCE_CHANNELS` or `$NOTIFICATION_CHANNEL` in execution_steps | At least one env var ref — no hardcoded channel IDs                          |
| **AC2** | `submit-output` in execution_steps                               | Must include `--draft-file /tmp/...` when classification is `NEEDS_APPROVAL` |
| **AC3** | `NEEDS_APPROVAL` or `NO_ACTION_NEEDED` in execution_steps        | Classification value present inline in a step                                |
| **AC4** | `/tools/platform/submit-output.ts` in tool_registry              | Present in the `tools` array                                                 |
| **AC5** | Boundary line at top                                             | `**IMPORTANT: Follow ONLY these steps...` present                            |
| **AC6** | STOP directive at end                                            | `**STOP. Do nothing else.**` present                                         |

If AC2 fails (submit-output missing `--draft-file`):

- The SYSTEM_PROMPT in `src/gateway/services/archetype-generator.ts` may have regressed
- Compare against the working patterns in the "Gold Standard Reference" section below
- Do NOT proceed to trigger — fix the generator first

---

## Step 4 — Activate and Trigger

```bash
source .env
ARCHETYPE_ID="<archetype ID>"

# 1. Get the slug
SLUG=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT role_name FROM archetypes WHERE id = '$ARCHETYPE_ID';" | tr -d ' \n')
echo "Slug: $SLUG"

# 2. Activate
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "UPDATE archetypes SET status = 'active' WHERE id = '$ARCHETYPE_ID';"

# 3. Trigger
TASK_ID=$(curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/$SLUG/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.task_id')
echo "Task ID: $TASK_ID"
```

Save the `TASK_ID` — you'll need it for all subsequent steps.

---

## Step 5 — Monitor Lifecycle Progress

Poll every 30 seconds until `Done` or `Failed` (typical total time: 3–5 minutes):

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"
```

Expected progression:

```
Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Reviewing
```

After approval (Step 6):

```
Reviewing → Approved → Delivering → Done
```

Check the full lifecycle trace at any point:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT from_status, to_status, created_at
      FROM task_status_log
      WHERE task_id = '$TASK_ID'
      ORDER BY created_at;"
```

If the task reaches `Failed`, check logs:

```
http://localhost:7701/dashboard/tasks/<TASK_ID>/logs?tenant=00000000-0000-0000-0000-000000000003
```

---

## Step 6 — Approve the Task

Wait until the task status is `Reviewing` before approving.

### Option A — Slack Button (when working)

Check #victor-tests in Slack for a card with **Approve / Reject / Edit & Send** buttons. Click **Approve**.

> ⚠️ **Known issue**: The approval card may not appear for generated employees. See the "Known Issues" section at the bottom. If the card doesn't appear within 1 minute of the task reaching `Reviewing`, use Option B.

### Option B — Manual Approval Fallback

```bash
source .env

# Get your Slack user ID (run once, reuse it)
SLACK_USER_ID=$(curl -s "https://slack.com/api/auth.test" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" | jq -r '.user_id')
echo "Your Slack user ID: $SLACK_USER_ID"

# Send the approval event
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"employee/approval.received\",
    \"data\": {
      \"taskId\": \"$TASK_ID\",
      \"action\": \"approve\",
      \"userId\": \"$SLACK_USER_ID\",
      \"userName\": \"Victor\"
    }
  }"
```

> Use your real `SLACK_USER_ID` so "Approved by @Victor" renders correctly in Slack.

---

## Step 7 — Verify Delivery

After approval, wait ~60–90 seconds for the delivery container to complete.

### Check task reached Done

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Done
```

### Find the Slack notification timestamp

```bash
NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')
echo "notify_slack_ts: $NOTIFY_TS"
```

### Check the thread in #victor-tests

```bash
source .env
curl -s "https://slack.com/api/conversations.replies" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
  -d "channel=C0960S2Q8RL&ts=$NOTIFY_TS&limit=20" \
  | jq '[.messages[] | {text: (.text | .[0:300]), ts: .ts}]'
```

**Expected thread replies** (in order):

1. The original "Reply sent" or "Task complete" message
2. A "✅ Delivered" confirmation
3. The actual digest content (150–300 words summarizing Slack activity)

**AC7 passes if**: Reply #3 contains real digest content — topics, discussions, action items — NOT just a short phrase like `"24-hour Slack digest created with key topics and action items"`.

**AC7 fails if**: Only the short `--summary` text appears. This means `--draft-file` was missing from the generated `submit-output` call — the generator has regressed.

---

## Step 8 — Cleanup (Optional)

Soft-delete the test archetype after the run to keep the DB clean:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "UPDATE archetypes SET deleted_at = NOW() WHERE id = '$ARCHETYPE_ID';"
```

---

## Full Verification Checklist

| #   | Check                            | Command/Method                                                            | Pass                                                         |
| --- | -------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| AC1 | execution_steps has env var refs | psql: `SELECT execution_steps FROM archetypes WHERE id = '$ARCHETYPE_ID'` | `$SOURCE_CHANNELS` or `$NOTIFICATION_CHANNEL` present        |
| AC2 | submit-output has --draft-file   | same                                                                      | `--draft-file /tmp/...` present when NEEDS_APPROVAL          |
| AC3 | classification value present     | same                                                                      | `NEEDS_APPROVAL` or `NO_ACTION_NEEDED` inline in step        |
| AC4 | submit-output in tool_registry   | psql: `SELECT tool_registry FROM archetypes WHERE id = '$ARCHETYPE_ID'`   | `/tools/platform/submit-output.ts` in tools array            |
| AC5 | Task reached Done                | psql: `SELECT status FROM tasks WHERE id = '$TASK_ID'`                    | `Done`                                                       |
| AC6 | Lifecycle sequence correct       | psql: task_status_log query                                               | Submitting → Reviewing → Approved → Delivering → Done        |
| AC7 | Real content in Slack thread     | Slack API conversations.replies                                           | Actual digest/content (not placeholder)                      |
| AC8 | Zero edits to generated fields   | Visual inspection during wizard                                           | No manual changes to identity/execution_steps/delivery_steps |

---

## Gold Standard Reference

If the generated employee fails AC1–AC6, compare its `execution_steps` against this proven working employee:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT execution_steps, delivery_steps
      FROM archetypes
      WHERE id = 'ad5f02f0-f38d-4e00-abd0-4973cd93a7eb';"
```

The SYSTEM_PROMPT in `src/gateway/services/archetype-generator.ts` must teach the generator to produce patterns that match this employee.

---

## Tenant Reference (VLRE)

| Field                   | Value                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Tenant ID               | `00000000-0000-0000-0000-000000000003`                                                             |
| Tenant slug             | `vlre`                                                                                             |
| Test channel            | `C0960S2Q8RL` (#victor-tests)                                                                      |
| Source channels         | `C0AMGJQN05S`, `C0ANH9J91NC`, `C0960S2Q8RL`                                                        |
| Slack bot token env var | `$VLRE_SLACK_BOT_TOKEN`                                                                            |
| Admin API key env var   | `$ADMIN_API_KEY`                                                                                   |
| Wizard URL              | `http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`        |
| Task logs URL           | `http://localhost:7701/dashboard/tasks/<TASK_ID>/logs?tenant=00000000-0000-0000-0000-000000000003` |

---

## Known Issues

### Approval card not appearing in Slack

**Symptom**: Task reaches `Reviewing`, but no card with Approve/Reject buttons appears in #victor-tests.

**Root cause**: The `track-pending-approval` lifecycle step requires `approval_message_ts`, `target_channel`, and `threadUidForTracking` to all be set in the deliverable metadata. For generated employees (non-guest-messaging), `threadUidForTracking` is always null (no Hostfully `thread_uid` in `raw_event`), so the guard fires and no `pending_approvals` row is created.

**Workaround**: Use the manual approval curl command (Step 6, Option B). Use your real Slack user ID to ensure "Approved by @Victor" renders correctly.

**Status**: Known bug, not yet fixed.

### "Approved by" shows blank in Slack

**Symptom**: Delivered message shows "Approved by [blank]" with "Private user info" tooltip on hover.

**Cause**: The manual approval fallback was used with a placeholder or incorrect `userId`. Slack renders `<@unknown-id>` as blank.

**Fix**: Always use your real Slack user ID in the manual approval curl (see Step 6, Option B).

### Task fails immediately (model doesn't call tools)

**Symptom**: Task reaches `Failed` within 30–60 seconds of `Executing`.

**Cause**: The wizard recommended `openai/gpt-oss-120b`, which produces text-only responses and never calls bash tools. The harness detects no `/tmp/summary.txt` output and fails the task.

**Fix**: Always change the model to `minimax/minimax-m2.7` in Settings before saving (Step 2, item 5).

### Slug collision on save

**Symptom**: Wizard save fails or creates a duplicate.

**Fix**: Run the soft-delete query in Step 1 before each test run.
