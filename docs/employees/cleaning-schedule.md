# Cleaning Schedule Employee (VLRE) — Operational Details

> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.

## Overview

- **Archetype ID**: `00000000-0000-0000-0000-000000000019`
- **Tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)
- **role_name**: `cleaning-schedule`
- **Slack channel**: `C0B71QSMZKQ` (`#ops-cleaning-schedule`)
- **approval_required**: true
- **Trigger**: Manual — admin API with a `date` input

## Trigger Command

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"date":"YYYY-MM-DD"}}' | jq '{task_id: .task_id, status_url: .status_url}'
```

Replace `YYYY-MM-DD` with the target date (e.g. `2026-06-01`).

## Notion Pages

| Page           | ID                                 | URL                                                      |
| -------------- | ---------------------------------- | -------------------------------------------------------- |
| Trash schedule | `36fd540b4380809ca373ca83e90216a3` | `https://www.notion.so/36fd540b4380809ca373ca83e90216a3` |
| Cleaning zones | `36fd540b438080b2be9cf4b4218d657b` | `https://www.notion.so/36fd540b438080b2be9cf4b4218d657b` |

## Setup Checklist

1. **Notion OAuth** — connect via `GET /auth/notion/connect?tenantId=00000000-0000-0000-0000-000000000003`. During the Notion page picker, **select BOTH cleaning pages** (trash schedule and cleaning zones). If only one is selected, the employee can only read that page.
2. **Verify secrets** — after OAuth, confirm `notion_access_token` is set:
   ```bash
   curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets" \
     -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[] | select(.key == "notion_access_token") | .is_set'
   # Expected: true
   ```
3. **Hostfully credentials** — `hostfully_api_key` and `hostfully_agency_uid` must be set as tenant secrets (same as guest-messaging employee).
4. **Slack channel** — bot must be invited to `#ops-cleaning-schedule` (`C0B71QSMZKQ`).
5. **Model override for E2E testing** — override model to `deepseek/deepseek-v4-flash` before triggering:
   ```bash
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
     -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '00000000-0000-0000-0000-000000000019';"
   ```

## What It Does

Given a target date, the employee:

1. Fetches reservations from Hostfully for all VLRE properties checking in on that date
2. Reads the trash schedule and cleaning zones from Notion
3. Generates a cleaning schedule matching properties to zones and trash pickup days
4. Posts the schedule to Slack (`#ops-cleaning-schedule`) for PM approval
5. On approval, appends the finalized schedule to the Notion cleaning zones page

## CRITICAL Gotchas

### Hostfully `--from`/`--to` filters CHECK-IN date, not checkout

`get-reservations.ts --from YYYY-MM-DD --to YYYY-MM-DD` filters by **check-in date**. To find guests checking out on a given day (who need the unit cleaned), you must fetch a wider date range and filter `checkOut` in your logic. Do not pass the target date directly as `--from`/`--to` expecting checkout results.

### Notion content is in Spanish

The trash schedule and cleaning zones pages are written in Spanish. The employee must read and interpret Spanish content correctly. Do not translate or rewrite the Notion pages — the PM reads them in Spanish.

### Property code matching (271-GIN-HOME → 271-GIN)

Hostfully property names use a full code format (e.g. `271-GIN-HOME`). The Notion cleaning zones page uses a shortened format (e.g. `271-GIN`). When matching properties to zones, strip the `-HOME` suffix from the Hostfully name before looking up in Notion.

### Notion page access requires OAuth page picker selection

The Notion integration only has access to pages explicitly selected during OAuth. If `get-page.ts` returns a 404 or "object not found" error, the page was not selected during OAuth setup. Re-run the OAuth flow and select the missing page.

## E2E Testing

1. Ensure services are running: `curl localhost:7700/health`
2. Override model to `deepseek/deepseek-v4-flash` (see Setup Checklist above)
3. Trigger with a date that has real VLRE reservations checking in:
   ```bash
   source .env
   curl -s -X POST \
     "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
     -H "X-Admin-Key: $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"inputs":{"date":"2026-06-01"}}' | jq .
   ```
4. Monitor task status:
   ```bash
   TASK_ID=<task_id from above>
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
     -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"
   ```
5. Approve the Slack card in `#ops-cleaning-schedule` when it appears
6. Verify task reaches `Done` and the Notion page was updated

## Tenant Secrets Required

| Secret key             | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `notion_access_token`  | Notion OAuth token (set via OAuth flow)            |
| `hostfully_api_key`    | Hostfully API key (shared with guest-messaging)    |
| `hostfully_agency_uid` | Hostfully agency UID (shared with guest-messaging) |
| `slack_bot_token`      | Slack bot token (shared with other employees)      |
