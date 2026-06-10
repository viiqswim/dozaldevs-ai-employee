# Code-Rotation Employee (VLRE) — Operational Details

> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.

## Code-Rotation Testing

Use these VLRE resources for all code-rotation testing. **ALL E2E and manual testing of code rotation MUST use ONLY this property and lock. No other properties or locks should be touched until the process is fully verified and working as expected.**

| Resource         | ID / URL                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Property         | `https://platform.hostfully.com/app/#/calendar?propertyUid=c960c8d2-9a51-49d8-bb48-355a7bfbe7e2` |
| Property UID     | `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                           |
| Sifely lock name | `5306-kin-Home Front (PERSONAL)`                                                                 |
| Sifely lock ID   | `24572672`                                                                                       |

**Trigger manually** (admin API):

```bash
curl -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/code-rotation/trigger" \
  -H "Content-Type: application/json" -d '{}'
```

## Code-Rotation Employee (VLRE)

- **Archetype ID**: `00000000-0000-0000-0000-000000000016`
- **Tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)
- **role_name**: `code-rotation` · **model**: `minimax/minimax-m2.7` · **approval_required**: false (fully automated)
- **Notification channel**: `C0960S2Q8RL` · **concurrency_limit**: 1
- **Trigger**: Manual only via admin API

**What it does**: Gets today's date, queries Hostfully for properties with a checkout today, then calls `rotate-property-code.ts` once per qualifying property. Each call generates a new memorable code, updates the Hostfully door_code, and rotates the matching Sifely passcode. Posts a Slack summary with per-property results when done. Properties with no checkout today are skipped entirely.

**Trigger manually** (admin API):

```bash
curl -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/code-rotation/trigger" \
  -H "Content-Type: application/json" -d '{}'
```

**No approval gate**: `approval_required: false` — the lifecycle short-circuits from `Submitting` directly to `Done`. No Slack approval card is posted; only a completion summary is sent to the notification channel.
