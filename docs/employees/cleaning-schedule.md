# Cleaning Schedule Employee (VLRE) — Operational Details

> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.

## Overview

- **Archetype ID**: `00000000-0000-0000-0000-000000000019`
- **Tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)
- **role_name**: `cleaning-schedule`
- **Slack channel**: `C0B71QSMZKQ` (`#ops-cleaning-schedule`)
- **approval_required**: false
- **Trigger**: Manual — admin API with a `date` input

## Trigger Command

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"date":"YYYY-MM-DD"}}' | jq '{task_id: .task_id, status_url: .status_url}'
```

Replace `YYYY-MM-DD` with the target date (e.g. `2026-06-01`).

## Notion Pages

| Page Name            | Page ID                            | Fixture Name           |
| -------------------- | ---------------------------------- | ---------------------- |
| Directorio Operativo | `370d540b4380809a8ea0c11074f92abb` | `directorio-operativo` |
| Manual de Personal   | `370d540b438080969a72c16c20defc70` | `manual-personal`      |
| Reporte Financiero   | `370d540b438080ca8676e61856488960` | `reporte-financiero`   |

## Setup Checklist

1. **Notion via Composio** — connect the Notion toolkit for the VLRE tenant via the Composio OAuth flow:
   ```bash
   curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/composio/connect?toolkit=notion" \
     -H "Authorization: Bearer $SERVICE_TOKEN" | jq -r .url
   # Open the returned URL in a browser to complete the Notion OAuth consent
   ```
   Verify the connection is active:
   ```bash
   curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/composio/connections" \
     -H "Authorization: Bearer $SERVICE_TOKEN" | jq '.[] | select(.toolkit == "notion")'
   # Expected: a row with status "active"
   ```
   The employee reads Notion pages via `tsx /tools/composio/execute.ts --toolkit notion --action NOTION_GET_PAGE_MARKDOWN`. No `notion_access_token` tenant secret is required — Composio manages the credential.
2. **Hostfully credentials** — `hostfully_api_key` and `hostfully_agency_uid` must be set as tenant secrets (same as guest-messaging employee).
3. **Slack channel** — bot must be invited to `#ops-cleaning-schedule` (`C0B71QSMZKQ`).
4. **Model override for E2E testing** — override model to `deepseek/deepseek-v4-flash` before triggering:
   ```bash
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
     -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '00000000-0000-0000-0000-000000000019';"
   ```

## What It Does

Given a target date, the employee:

1. Fetches all confirmed checkouts from Hostfully for that date
2. Looks up cleaning times per property from the Reporte Financiero (Notion)
3. Reads cleaner assignments by ZIP zone from the Manual de Personal (Notion)
4. Reads trash schedules for every property from the Directorio Operativo (Notion)
5. Assigns each checkout property to the right cleaner by ZIP zone; routes overflow to backup if a cleaner exceeds 7 hours
6. Adds a trash reminder to any checkout property whose trash take-out day matches the target date
7. Scans ALL properties (not just checkouts) for ones that only need trash taken out that day — assigns those to the right cleaner as 15-minute visits in a separate 🗑️ Basura section
8. Calculates total time per cleaner (cleaning + trash minutes combined) using the calculate tool
9. Posts the completed schedule to Slack (`#ops-cleaning-schedule`) — no approval required, posts straight through

## CRITICAL Gotchas

### Hostfully `--from`/`--to` filters CHECK-IN date, not checkout

`get-reservations.ts --from YYYY-MM-DD --to YYYY-MM-DD` filters by **check-in date**. To find guests checking out on a given day (who need the unit cleaned), you must fetch a wider date range and filter `checkOut` in your logic. Do not pass the target date directly as `--from`/`--to` expecting checkout results.

### Notion content is in Spanish

The trash schedule and cleaning zones pages are written in Spanish. The employee must read and interpret Spanish content correctly. Do not translate or rewrite the Notion pages — the PM reads them in Spanish.

### Property code matching (271-GIN-HOME → 271-GIN)

Hostfully property names use a full code format (e.g. `271-GIN-HOME`). The Notion cleaning zones page uses a shortened format (e.g. `271-GIN`). When matching properties to zones, strip the `-HOME` suffix from the Hostfully name before looking up in Notion.

### Notion page access requires Composio connection

The employee reads Notion pages via `tsx /tools/composio/execute.ts --toolkit notion --action NOTION_GET_PAGE_MARKDOWN --params '{"page_id":"<id>"}'`. If Composio returns a 400 or "not connected" error, the Notion toolkit is not connected for this tenant. Re-run the Composio OAuth flow (see Setup Checklist step 1).

## E2E Testing

1. Ensure services are running: `curl localhost:7700/health`
2. Override model to `deepseek/deepseek-v4-flash` (see Setup Checklist above)
3. Trigger with a date that has real VLRE reservations checking in:
   ```bash
   source .env
   curl -s -X POST \
     "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
     -H "Authorization: Bearer $SERVICE_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"inputs":{"date":"2026-06-01"}}' | jq .
   ```
4. Monitor task status:
   ```bash
   TASK_ID=<task_id from above>
   PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
     -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"
   ```
5. Verify task reaches `Done` (no approval card — `approval_required: false`)
6. Check `#ops-cleaning-schedule` in Slack for the posted schedule

## Business Rules

### Check-In Billing Rule (replaces Golden Rule)

Cost and cleaning time are determined by what's **checking IN**, not what's checking out:

- Home checks out + Rooms check in → charge Room rates
- Rooms check out + Home checks in → charge Home rate
- Checkout with no check-in → prepare as Rooms (not Home)
- Home + Loft (407 S Gevers) are separate physical units — charge both individually

### Team Assignment by ZIP

- ZIPs 78744 / 78722 / 78640 (Austin/Kyle): Yessica (weekday primary for Austin), Diana (primary for ALL Kyle properties every day, backup for Austin)
- ZIPs 78203 / 78109 (San Antonio/Converse): Zenaida (primary), backup team

### Route Priority

- 3420 Hovenweep Ave gets first slot when it has a checkout (10AM checkout priority)

### Travel Overhead (45 min)

- Only applies to ZIPs 78744/78640 on trash-only days (no cleanings scheduled)
- Represents round-trip travel time from cleaner's home
- 271 Gina Dr is NOT an exception

### Trash Skip

- 5306 King Charles Dr: owners handle trash — skip trash tasks
- 219 Paul St: bin always on street — skip trash tasks

### Backup Threshold

- 7 hours (420 min) — if total work exceeds this, assign backup team

## Tenant Secrets Required

| Secret key             | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `hostfully_api_key`    | Hostfully API key (shared with guest-messaging)    |
| `hostfully_agency_uid` | Hostfully agency UID (shared with guest-messaging) |
| `slack_bot_token`      | Slack bot token (shared with other employees)      |

**Notion access** is managed via the Composio connection (not a tenant secret). Connect via `GET /admin/tenants/:tenantId/composio/connect?toolkit=notion`.
