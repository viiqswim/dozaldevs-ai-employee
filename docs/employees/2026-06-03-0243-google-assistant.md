# Google Workspace Assistant — Operational Details

> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.

## Google Workspace Assistant

- **Archetype ID**: `00000000-0000-0000-0001-000000000001`
- **Tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)
- **role_name**: `google-workspace-assistant`
- **model**: `minimax/minimax-m2.7`
- **approval_required**: `true` (can send emails and modify Drive files — needs human review)
- **vm_size**: `performance-1x` (required — OpenCode binary reserves ~74GB virtual memory)
- **concurrency_limit**: 1
- **Trigger**: Manual — admin API with `{ "inputs": { "prompt": "..." } }` body

**What it does**: Accepts per-task instructions via the trigger prompt and uses the Google Workspace tools to complete the requested work. Supports Gmail (read/send), Google Drive (list/get/upload/delete), Google Docs (list/get/create), Google Sheets (list/get/update), Google Slides (list/get), and Google Calendar (list/create/update events). Results are submitted for human approval before being posted to Slack.

**Lifecycle**: `Executing → Submitting → Reviewing → Approved → Delivering → Done`

## Triggering

### Admin API

```bash
source .env
TENANT=00000000-0000-0000-0000-000000000003

curl -s -X POST \
  "http://localhost:7700/admin/tenants/$TENANT/employees/google-workspace-assistant/trigger" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"prompt": "List the 5 most recent emails in the inbox and summarize their subjects"}}' \
  | jq '{task_id: .task_id, status_url: .status_url}'
```

The `inputs.prompt` field is injected into the worker as the `## Your Assignment` section of the initial OpenCode message.

### Dashboard

1. Go to the employee detail page
2. Click **Trigger**
3. Enter the task instructions in the text area
4. Click **Send**

## Available Google Tools

All Google Workspace operations run through the Composio execute tool at `/tools/composio/execute.ts`:

```bash
tsx /tools/composio/execute.ts --toolkit <toolkit> --action <ACTION_SLUG> --params '<json>'
```

Map the requested work to the correct Composio toolkit:

| Toolkit slug     | Covers                                     |
| ---------------- | ------------------------------------------ |
| `gmail`          | Read, send, search, label, and manage mail |
| `googledrive`    | List, get, upload, and delete Drive files  |
| `googledocs`     | List, get, and create Google Docs          |
| `googlesheets`   | List, read, and update Google Sheets       |
| `googleslides`   | List and get Google Slides presentations   |
| `googlecalendar` | List, create, and update calendar events   |

Available action slugs and their parameter schemas are documented in the Composio skills loaded
into the worker session (`composio-gmail`, `composio-googledrive`, `composio-googledocs`,
`composio-googlesheets`, `composio-googleslides`, `composio-googlecalendar`). The employee
consults these skills at runtime to discover the right action for the assignment.

Examples:

```bash
tsx /tools/composio/execute.ts --toolkit gmail --action GMAIL_FETCH_EMAILS --params '{"max_results": 10}'
tsx /tools/composio/execute.ts --toolkit googledrive --action GOOGLEDRIVE_LIST_FILES --params '{"page_size": 10}'
```

## Authentication (Composio)

Google access is authorized through Composio's OAuth connect flow, not via tenant secrets. Connect
each required Google toolkit for the tenant before the employee can run:

```bash
# Returns { url } — open it in a browser to complete the Google OAuth consent
curl -s "http://localhost:7700/admin/tenants/$TENANT/composio/connect?toolkit=gmail" \
  -H "Authorization: Bearer $SERVICE_TOKEN" | jq -r .url
```

Repeat for each toolkit the employee needs: `gmail`, `googledrive`, `googledocs`, `googlesheets`,
`googleslides`, `googlecalendar`. Verify active connections via
`GET /admin/tenants/$TENANT/composio/connections`. The worker authenticates per-tenant via the
`tenant_${TENANT}` Composio namespace — no `google_*` secrets are required.

## Checking Task Status

```bash
TASK_ID=<task_id>

psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"

psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT from_status, to_status, created_at FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"

docker logs -f employee-${TASK_ID:0:8}
```

## Known Gotchas

**Toolkit must be connected in Composio**: A Google operation fails with an HTTP 400 from Composio if the tenant has not connected the relevant toolkit (e.g. calling a `gmail` action without a `gmail` connection). Connect the toolkit via the OAuth flow above before triggering.

**Composio skills are filtered at boot**: The harness deletes `composio-*` skill folders for toolkits the tenant has NOT connected. If the employee can't find an action slug for a toolkit, confirm that toolkit is connected — its skill is only loaded when connected.

**Read-only vs write actions**: Read-only actions (list files, fetch emails) are low-risk. Write actions (send email, upload to Drive, create events) make real changes — this is why `approval_required` is `true`. The PM reviews every change before it is delivered.

**`vm_size` is mandatory**: Without `performance-1x`, the Fly.io machine defaults to `shared-cpu-1x` (256MB RAM). The OpenCode binary OOM-kills within 45 seconds. Always verify `vm_size` is set in the DB.
