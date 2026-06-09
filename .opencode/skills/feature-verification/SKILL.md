---
name: feature-verification
description: 'Use when verifying a completed feature end-to-end. Covers the PostgREST-vs-psql distinction, the zero-rows-is-failure rule, dashboard real-data verification, the real-world verification matrix, and the recommended smoke-test employee (real-estate-motivation-bot-2).'
---

## Feature Verification Checklist (MANDATORY — applies to every plan)

After implementing any feature, the Final Verification Wave **must** include real-world verification that exercises the actual production code path — not just unit tests or schema checks. The following rules are non-negotiable.

### PostgREST ≠ psql (CRITICAL)

`psql` connects directly to PostgreSQL and bypasses PostgREST entirely. Worker containers and the lifecycle write data through PostgREST (`http://localhost:54331`). **Any new table must be verified via PostgREST curl, not just psql.**

After every Prisma migration that creates a new table, run:

```bash
# 1. Reload PostgREST schema cache (required after every migration that adds tables)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"

# 2. Confirm PostgREST can see the new table (use anon key from .env)
source .env
curl -s "http://localhost:54331/rest/v1/<new_table>?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Expected: [] (empty array), NOT a PGRST205 "schema cache" error
```

If you get `"Could not find the table in the schema cache"` — the migration ran but PostgREST doesn't know about it. Nothing that goes through the lifecycle or workers will work until the cache is reloaded.

### Zero Rows Is Never "Expected" for a Write Path

If a feature is supposed to write DB records (metrics, logs, audit rows), **zero rows after a completed test action is a failure — not an acceptable baseline.** The verification must:

1. Trigger the actual action (call the API, send a webhook, trigger an employee)
2. Wait for it to complete
3. Verify the row actually exists in the DB via psql AND via PostgREST

Example for a lifecycle metric step:

```bash
# Trigger a task, wait for Done, then verify:
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT * FROM task_metrics WHERE task_id = '<task_id>';"
# Expected: 1 row with work_minutes > 0 — NOT 0 rows
```

### Dashboard UI Must Show Real Data

For any feature that displays data in the dashboard, load the actual page and verify with real data — not just that the component renders or that the PostgREST query is syntactically correct.

```bash
# Use the Playwright MCP to open the relevant dashboard page and confirm:
# 1. The stat/value is non-zero (not "—" or "0" when data exists)
# 2. No console errors
# 3. The data matches what's in the DB
```

A feature is NOT verified if the dashboard page shows "—" or "0" and you haven't confirmed whether that's correct or a bug.

### Real-World Verification Matrix

Apply every row that matches your feature:

| Feature type             | Required verification                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ |
| New DB table             | PostgREST curl confirms table visible; write via PostgREST succeeds (not just psql)  |
| New lifecycle step       | Trigger a real task end-to-end; confirm the step's DB output row exists              |
| New dashboard stat/card  | Load the page in a browser; confirm the value is non-zero with real data             |
| New API endpoint         | curl the endpoint with real payloads; verify response body matches spec              |
| New gateway route        | Hit it with curl; check gateway logs for the expected structured log entries         |
| New PostgREST write path | curl PostgREST directly (not via gateway); confirm HTTP 201, not a schema/auth error |

### What "Verified" Means

Verification is complete only when ALL of these are true:

- [ ] The actual code path was exercised (not a mock, not a unit test alone)
- [ ] The DB row exists and has the correct values (checked via psql after the action)
- [ ] PostgREST can read and write the table (checked via curl to `localhost:54331`)
- [ ] The dashboard page shows the correct non-placeholder value (checked via browser or Playwright)
- [ ] Gateway/Inngest logs show the expected structured log entries (no silent errors)

### Recommended Test Employee: `real-estate-motivation-bot-2`

Use **`real-estate-motivation-bot-2`** (VLRE tenant) as the default smoke-test employee for any plan that touches the lifecycle, task metrics, or dashboard. It is the simplest employee in the system:

- `approval_required: false` → goes straight to Done, no Slack approval card needed
- Completes in ~1 minute
- Tenant: `00000000-0000-0000-0000-000000000003` (VLRE)
- Archetype ID: `561439b9-7491-40de-a550-95906624fffc`
- Override estimate: 15 min (pre-set)

**Trigger it with curl (faster than the dashboard button):**

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '{task_id: .task_id, status_url: .status_url}'
```

**Then verify end-to-end:**

```bash
# 1. Wait ~60s, then check task reached Done
TASK_ID=<task_id from above>
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Done

# 2. Confirm task_metrics row was written
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT work_minutes FROM task_metrics WHERE task_id = '$TASK_ID';"
# Expected: 1 row, work_minutes = 15

# 3. Load the dashboard and confirm "Hours of Work Done" is non-zero
# http://localhost:7700/dashboard/tasks?tenant=00000000-0000-0000-0000-000000000003
```

**For full approval path testing** (wizard → execution → Reviewing → Approved → Delivering → Done): Use the wizard to generate a motivational message employee per the [AI Employee E2E Test Guide](docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md). Override the model to `deepseek/deepseek-v4-flash` via DB after saving. This exercises the full approval flow that `real-estate-motivation-bot-2` (which has `approval_required: false`) skips.
