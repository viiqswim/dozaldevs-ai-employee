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

All tools live at `/tools/google/` in the worker container:

| Tool                    | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `validate-env.ts`       | Verify Google credentials are configured    |
| `list-emails.ts`        | List emails from Gmail                      |
| `get-email.ts`          | Get full content of a specific email        |
| `send-email.ts`         | Send an email via Gmail                     |
| `list-files.ts`         | List files in Google Drive                  |
| `get-file.ts`           | Get metadata or content of a Drive file     |
| `upload-file.ts`        | Upload a file to Google Drive               |
| `delete-file.ts`        | Delete a file from Google Drive             |
| `list-documents.ts`     | List Google Docs documents                  |
| `get-document.ts`       | Get content of a Google Doc                 |
| `create-document.ts`    | Create a new Google Doc                     |
| `list-spreadsheets.ts`  | List Google Sheets spreadsheets             |
| `get-sheet-data.ts`     | Read data from a Google Sheet               |
| `update-sheet-data.ts`  | Write data to a Google Sheet                |
| `list-presentations.ts` | List Google Slides presentations            |
| `get-presentation.ts`   | Get content of a Google Slides presentation |
| `list-events.ts`        | List Google Calendar events                 |
| `create-event.ts`       | Create a new calendar event                 |
| `update-event.ts`       | Update an existing calendar event           |

Run any tool with `--help` to see required flags and options.

## Required Tenant Secrets

Google OAuth credentials must be stored as tenant secrets before the employee can run:

| Secret Key             | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `google_client_id`     | OAuth 2.0 Client ID from Google Cloud Console    |
| `google_client_secret` | OAuth 2.0 Client Secret                          |
| `google_refresh_token` | Long-lived refresh token from OAuth consent flow |

Store via admin API:

```bash
curl -X PUT "http://localhost:7700/admin/tenants/$TENANT/secrets/google_client_id" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"<client_id>"}'

curl -X PUT "http://localhost:7700/admin/tenants/$TENANT/secrets/google_client_secret" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"<client_secret>"}'

curl -X PUT "http://localhost:7700/admin/tenants/$TENANT/secrets/google_refresh_token" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"<refresh_token>"}'
```

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

**GCP must be in Production mode**: All OAuth scopes used by this employee are Sensitive or Basic (none are Restricted). However, the GCP project must still be in Production mode — Testing mode causes refresh tokens to expire after 7 days, breaking the connection weekly.

**Testing mode 7-day token expiry**: In GCP Testing mode, refresh tokens expire after 7 days. If the `google_refresh_token` secret starts returning `invalid_grant` errors, re-run the OAuth consent flow to get a new refresh token and update the tenant secret.

**Token expiry during long tasks**: Google access tokens expire after 1 hour. Tools must handle automatic token refresh via the refresh token. If a task takes more than an hour (unusual), it may encounter 401 errors mid-execution. Retriggering with a fresh token should resolve this.

**Read-only vs write scopes**: Read-only operations (list files, get email) require minimal scopes. Write operations (send email, upload to Drive, create events) require broader scopes that must be explicitly approved in the OAuth consent screen. The `validate-env.ts` tool checks that the correct scopes are authorized.

**`vm_size` is mandatory**: Without `performance-1x`, the Fly.io machine defaults to `shared-cpu-1x` (256MB RAM). The OpenCode binary OOM-kills within 45 seconds. Always verify `vm_size` is set in the DB.
