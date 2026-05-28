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

## Step 1 — Hard-Delete Any Previous Test Archetypes

Before each test run, permanently remove archetypes from previous runs to avoid slug collisions and keep the local DB clean.

> ⚠️ **LOCAL ONLY** — Hard deletes conflict with the platform's production soft-delete convention (`deleted_at`). Run this only against your local dev database (`localhost:54322`). Never run against a production or shared environment.

```bash
# Hard-delete all test archetypes and their associated data for the VLRE tenant,
# excluding the permanent seed employees.
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee << 'EOF'
DO $$
DECLARE
  arch_ids uuid[];
  task_ids uuid[];
BEGIN
  -- Collect test archetype IDs (exclude permanent seed employees)
  SELECT array_agg(id) INTO arch_ids
  FROM archetypes
  WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
    AND id NOT IN (
      '00000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000013',
      '00000000-0000-0000-0000-000000000015',
      '00000000-0000-0000-0000-000000000016',
      '00000000-0000-0000-0000-000000000018',
      'ad5f02f0-f38d-4e00-abd0-4973cd93a7eb',
      '561439b9-7491-40de-a550-95906624fffc'
    );

  IF arch_ids IS NULL THEN
    RAISE NOTICE 'No test archetypes found — nothing to clean up.';
    RETURN;
  END IF;

  -- Collect task IDs for those archetypes
  SELECT array_agg(id) INTO task_ids
  FROM tasks WHERE archetype_id = ANY(arch_ids);

  -- Delete in FK-safe order
  IF task_ids IS NOT NULL THEN
    DELETE FROM reviews         WHERE deliverable_id IN (SELECT id FROM deliverables WHERE external_ref = ANY(task_ids::text[]));
    DELETE FROM deliverables    WHERE external_ref = ANY(task_ids::text[]);
    DELETE FROM task_status_log WHERE task_id = ANY(task_ids);
    DELETE FROM task_metrics    WHERE task_id = ANY(task_ids);
    DELETE FROM executions      WHERE task_id = ANY(task_ids);
    DELETE FROM audit_log       WHERE task_id = ANY(task_ids);
    DELETE FROM clarifications  WHERE task_id = ANY(task_ids);
    DELETE FROM cross_dept_triggers WHERE source_task_id = ANY(task_ids);
    DELETE FROM feedback_events WHERE task_id = ANY(task_ids);
    DELETE FROM tasks           WHERE id = ANY(task_ids);
  END IF;

  -- Delete archetype-level dependents, then the archetypes themselves
  DELETE FROM task_metrics    WHERE archetype_id = ANY(arch_ids);
  DELETE FROM knowledge_bases WHERE archetype_id = ANY(arch_ids);
  DELETE FROM risk_models     WHERE archetype_id = ANY(arch_ids);
  DELETE FROM agent_versions  WHERE archetype_id = ANY(arch_ids);
  -- feedback_events and employee_rules cascade automatically on archetype delete
  DELETE FROM archetypes WHERE id = ANY(arch_ids);

  RAISE NOTICE 'Deleted % test archetype(s) and all associated records.', array_length(arch_ids, 1);
END $$;
EOF
```

> **Why**: The wizard generates a `role_name` slug from the description. If an archetype with the same slug already exists in the tenant, saving will fail or produce a duplicate.

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
   - Leave the model as-is — the wizard displays the AI-recommended model as **read-only text**, not an editable field. You will override it after saving.

6. Click **Save as Draft**.

7. Note the archetype ID from the redirect URL:

   ```
   http://localhost:7701/dashboard/employees/<ARCHETYPE_ID>?tenant=...
   ```

8. **Override the model to `deepseek/deepseek-v4-flash`** via DB (required — the wizard Settings section does not expose a model selector):

   ```bash
   ARCHETYPE_ID="<paste archetype ID>"
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
     -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '$ARCHETYPE_ID';"
   ```

   > ⚠️ **Critical**: The wizard may recommend a model that doesn't reliably call bash tools (e.g. `xiaomi/mimo-v2.5`, `openai/gpt-oss-120b`). Always override to `deepseek/deepseek-v4-flash` before triggering.

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

Hard-delete the test archetype and all its associated data after the run:

> ⚠️ **LOCAL ONLY** — Hard deletes conflict with the platform's production soft-delete convention. Run this only against your local dev database (`localhost:54322`).

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee << EOF
DO \$\$
DECLARE task_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO task_ids FROM tasks WHERE archetype_id = '$ARCHETYPE_ID';
  IF task_ids IS NOT NULL THEN
    DELETE FROM reviews             WHERE deliverable_id IN (SELECT id FROM deliverables WHERE external_ref = ANY(task_ids::text[]));
    DELETE FROM deliverables        WHERE external_ref = ANY(task_ids::text[]);
    DELETE FROM task_status_log     WHERE task_id = ANY(task_ids);
    DELETE FROM task_metrics        WHERE task_id = ANY(task_ids);
    DELETE FROM executions          WHERE task_id = ANY(task_ids);
    DELETE FROM audit_log           WHERE task_id = ANY(task_ids);
    DELETE FROM clarifications      WHERE task_id = ANY(task_ids);
    DELETE FROM cross_dept_triggers WHERE source_task_id = ANY(task_ids);
    DELETE FROM feedback_events     WHERE task_id = ANY(task_ids);
    DELETE FROM tasks               WHERE id = ANY(task_ids);
  END IF;
  DELETE FROM task_metrics    WHERE archetype_id = '$ARCHETYPE_ID';
  DELETE FROM knowledge_bases WHERE archetype_id = '$ARCHETYPE_ID';
  DELETE FROM risk_models     WHERE archetype_id = '$ARCHETYPE_ID';
  DELETE FROM agent_versions  WHERE archetype_id = '$ARCHETYPE_ID';
  DELETE FROM archetypes      WHERE id = '$ARCHETYPE_ID';
END \$\$;
EOF
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

### Task fails immediately (model doesn't call tools)

**Symptom**: Task reaches `Failed` within 30–60 seconds of `Executing`.

**Cause**: The wizard recommended a model that produces text-only responses and never calls bash tools. The harness detects no `/tmp/summary.txt` output and fails the task.

**Fix**: Always override the model to `deepseek/deepseek-v4-flash` via DB after saving (Step 2, item 8).

### "Approved by" shows blank in Slack

**Symptom**: Delivered message shows "Approved by [blank]" with "Private user info" tooltip on hover.

**Cause**: The manual approval fallback was used with a placeholder or incorrect `userId`. Slack renders `<@unknown-id>` as blank.

**Fix**: Always use your real Slack user ID in the manual approval curl (see Step 6, Option B).

### Slug collision on save

**Symptom**: Wizard save fails or creates a duplicate.

**Fix**: Run the hard-delete query in Step 1 before each test run.
