# Learnings

## 2026-05-19 Plan: slack-channel-ux-fix

### Architecture

- `notification_channel` = the single Slack channel field on `archetypes` table
- Injected as `NOTIFICATION_CHANNEL` env var via `tenant-env-loader.ts`
- LLM-generated `input_schema` items with slack channel keys → injected as `INPUT_SLACK_CHANNEL` — redundant
- `resolveNotificationChannel()` in `notification-channel.ts` — do NOT touch, works correctly

### Files

- `dashboard/src/panels/employees/CreateEmployeePage.tsx` — local state `notificationChannel`, label line 98, Generate button line 108-113
- `dashboard/src/panels/employees/EditEmployeePage.tsx` — archetype state, label line 247, Create Employee button lines 403-412
- `src/gateway/services/archetype-generator.ts` — SYSTEM_PROMPT line 44, Input Detection section line 55, REFINE_SYSTEM_PROMPT line 177, postProcess() line 209
- `src/gateway/routes/admin-archetypes.ts` — CreateArchetypeBodySchema line 72, notification_channel on line 91: `z.string().max(50).nullable().default(null)` → change to `z.string().min(1).max(50)`

### Key Constraints

- DB column stays `notification_channel` — label change ONLY
- Do NOT change PatchArchetypeBodySchema (notification_channel stays optional on patch)
- Do NOT modify InputSchemaEditor or resolveNotificationChannel
