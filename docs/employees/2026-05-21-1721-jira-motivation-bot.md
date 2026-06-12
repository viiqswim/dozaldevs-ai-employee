# Jira Motivation Bot Employee (VLRE) — Operational Details

> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.

## Jira Motivation Bot (VLRE)

- **Archetype ID**: `00000000-0000-0000-0000-000000000018`
- **Tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)
- **role_name**: `jira-motivation-bot` · **model**: `minimax/minimax-m2.7` · **approval_required**: false (fully automated)
- **Notification channel**: `C0960S2Q8RL` · **concurrency_limit**: not set (default)
- **Trigger**: Jira webhook — `POST /webhooks/jira/vlre/jira-motivation-bot`
- **Event filter**: `jira:issue_created` only — all other Jira events return 200 ignored

**What it does**: When a new Jira issue is created, the bot posts a motivational message to the VLRE Slack channel (`C0960S2Q8RL`) to encourage the team. The message references the issue key, summary, and assignee (if set). No approval gate — the lifecycle short-circuits from `Submitting` directly to `Done`.

**Inbound flow**:

```
Jira issue created
  → Jira fires webhook to POST /webhooks/jira/vlre/jira-motivation-bot
  → Gateway verifies HMAC (X-Hub-Signature: sha256=<hex>)
  → Resolves tenant by slug "vlre" → resolves archetype by role_name "jira-motivation-bot"
  → prisma.task.create → inngest.send('employee/task.dispatched')
  → Universal lifecycle: Received → Ready → Executing
  → Worker reads issue details from webhook payload (injected as TASK_INPUT)
  → Posts motivational Slack message to C0960S2Q8RL
  → submit-output.ts --classification NO_ACTION_NEEDED
  → Lifecycle: Submitting → Done (no approval gate)
```

## Jira Webhook Setup

The Jira webhook must be configured manually in Jira project settings. Steps:

1. Go to **Jira Settings** → **System** → **WebHooks** (or project-level: **Project Settings** → **Automation** → **Webhooks**)
2. Click **Create a WebHook**
3. Set the URL to your public gateway URL + `/webhooks/jira/vlre/jira-motivation-bot`
   - Local dev: use your Cloudflare tunnel URL, e.g. `https://local-ai-employee.dozaldevs.com/webhooks/jira/vlre/jira-motivation-bot`
   - Production: `https://<your-gateway-domain>/webhooks/jira/vlre/jira-motivation-bot`
4. Under **Events**, check **Issue** → **created**
5. Set the **Secret** to match `JIRA_WEBHOOK_SECRET` in your `.env` (default: `test-secret` for local dev)
6. Save

The gateway verifies the `X-Hub-Signature` header using HMAC-SHA256. If `JIRA_WEBHOOK_SECRET` is not set, verification is skipped (dev convenience only — always set it in production).

## Trigger Manually (Testing)

Fire a test webhook locally without a real Jira event:

```bash
PAYLOAD='{"webhookEvent":"jira:issue_created","issue":{"key":"TEST-1","fields":{"summary":"Fix the login bug","description":"Users cannot log in on mobile","priority":{"name":"High"},"assignee":{"displayName":"Victor Dozal"},"project":{"key":"TEST"}}}}'

SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "test-secret" | cut -d' ' -f2)

curl -X POST http://localhost:7700/webhooks/jira/vlre/jira-motivation-bot \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: sha256=$SIG" \
  -d "$PAYLOAD"
```

Expected response: `{"status":"task_created","taskId":"<uuid>"}`

## Checking Task Status

```bash
# Check task status in DB
docker exec shared-postgres psql -U postgres -d ai_employee \
  -c "SELECT id, status, archetype_id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000018' ORDER BY created_at DESC LIMIT 5;"

# Full lifecycle trace
docker exec shared-postgres psql -U postgres -d ai_employee \
  -c "SELECT state, created_at FROM task_status_log WHERE task_id = '<task_id>' ORDER BY created_at;"
```

## Mock Mode Testing (No Real Jira Credentials Needed)

The Jira motivation bot now uses Composio for Jira access (`tsx /tools/composio/execute.ts --toolkit jira --action <ACTION>`). The old `/tools/jira/` shell tools have been removed. For local testing without real Jira credentials, connect the Jira toolkit via the Composio OAuth flow:

```bash
curl -s "http://localhost:7700/admin/tenants/<tenantId>/composio/connect?toolkit=jira" \
  -H "Authorization: Bearer $SERVICE_TOKEN" | jq -r .url
# Open the returned URL to complete Jira OAuth
```

Then use `tsx /tools/composio/execute.ts --toolkit jira --action <ACTION_SLUG> --params '<json>'` to test Jira operations. Run `tsx /tools/composio/list-actions.ts --toolkit jira` to discover available action slugs.

## Verified E2E Flow (2026-05-21)

Full lifecycle confirmed working end-to-end:

| Step | State           | Notes                             |
| ---- | --------------- | --------------------------------- |
| 1    | `NULL`          | Webhook received, task created    |
| 2    | `Ready`         | Lifecycle started                 |
| 3    | `Triaging`      | Intent classification             |
| 4    | `AwaitingInput` | Transient                         |
| 5    | `Ready`         | Cleared for execution             |
| 6    | `Executing`     | Worker container running          |
| 7    | `Validating`    | Output validation                 |
| 8    | `Submitting`    | Output submitted                  |
| 9    | `Done`          | No approval gate — auto-completes |

Execution time: ~2 minutes. Slack notification posted to `C0960S2Q8RL`.

## Known Gotchas

**`JIRA_WEBHOOK_SECRET` must be set**: If unset, HMAC verification is skipped. Always set it in production. Default for local dev: `test-secret`.

**Webhook payload must include `issue.fields.project`**: The gateway validates that `issue.fields.project` is an object with a `key` string. Webhooks missing this field return 400.

**Jira tools removed — use Composio**: The `/tools/jira/` shell tools have been removed. The employee now calls Jira via `tsx /tools/composio/execute.ts --toolkit jira --action <ACTION_SLUG>`. The Jira toolkit must be connected via the Composio OAuth flow before the employee can run.

**Per-employee route vs legacy route**: Two Jira webhook routes exist:

- `POST /webhooks/jira/:tenantSlug/:employeeSlug` — new per-employee route (use this)
- `POST /webhooks/jira` — legacy route (fires `jira-motivation-bot` for DozalDevs tenant only)

Always use the per-employee route for new integrations.

**Jira OAuth vs Basic auth**: The shell tools use Basic auth (API token). OAuth is only for the dashboard "Connect Jira" flow. The motivation bot uses Basic auth via `JIRA_API_TOKEN`, `JIRA_USER_EMAIL`, `JIRA_BASE_URL` — stored as tenant secrets, not `.env` vars.

## Tenant Secrets (Jira Credentials)

Jira credentials are stored as tenant secrets, not `.env` variables:

```bash
# Store Jira API token for VLRE
curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/jira_api_token" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"<your-jira-api-token>"}'

# Store Jira user email for VLRE
curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/jira_user_email" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"<your-jira-email>"}'

# Store Jira base URL for VLRE
curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/jira_base_url" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"https://your-org.atlassian.net"}'
```

These are auto-injected into the worker container as `JIRA_API_TOKEN`, `JIRA_USER_EMAIL`, `JIRA_BASE_URL` by `tenant-env-loader.ts`.
