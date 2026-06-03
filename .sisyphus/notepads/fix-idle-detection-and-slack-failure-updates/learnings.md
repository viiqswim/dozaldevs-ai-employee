# Learnings

## [2026-06-03] Session Init

### opencode-harness.mts Key Locations

- Line ~95-128: `markFailed()` function — async, properly awaited, correct insertion point for Slack update
- Line ~359-362: Where `options.minElapsedMs` is consumed with `?? 30_000` default
- Line ~512: Recovery nudge `minElapsedMs: 10_000` — intentionally short, DO NOT CHANGE
- Line ~760-764: Delivery `runOpencodeSession` call — `minElapsedMs: 10_000` → change to 30_000
- Line ~1010-1012: Main execution `runOpencodeSession` call — `minElapsedMs: 10_000` → change to 60_000
- Line ~170-200: Existing Slack usage for approval cards — pattern reference

### Env Vars Available in Harness Container

- `NOTIFY_MSG_TS` — Slack message timestamp (for chat.update)
- `NOTIFICATION_CHANNEL` — Archetype notification channel (NOT `NOTIFY_MSG_CHANNEL` which does NOT exist)
- `SLACK_BOT_TOKEN` — Tenant Slack bot token
- `EMPLOYEE_ROLE_NAME` — Role name for display

### Dashboard Task Detail Page

- Component: `dashboard/src/panels/tasks/TaskDetail.tsx` (~706 lines)
- Data fetched via PostgREST: `archetypes(role_name,model)` — need to add `input_schema` for re-run
- `raw_event` already fetched via `select: '*'` — available in component
- `RawEventViewer` component already exists (lines 78-135) — renders collapsible JSON labeled "Trigger Payload" at bottom
- `triggerEmployee(tenantId, slug, dryRun?, inputs?, prompt?)` already exists in `dashboard/src/lib/gateway.ts`

### Re-run Data Flow

- `raw_event` stored as `{ inputs: { prompt: "...", key1: "val1" } }` — inputs nested under `inputs` key
- To re-trigger: POST `{ inputs: raw_event.inputs }` to `/admin/tenants/:tenantId/employees/:slug/trigger`
- `task.archetypes.role_name` is the slug for the trigger endpoint
- Only show re-run for `source_system === 'manual'` and terminal states (Done/Failed/Cancelled)

### Test Resources

- Failed engineer task: `197a00dc-dd35-4ee7-9f12-abbb5eedf053` (DozalDevs tenant, has raw_event with prompt)
- Regression test employee: `real-estate-motivation-bot-2` (VLRE tenant, fast model, approval_required: false)
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- DozalDevs tenant ID: `00000000-0000-0000-0000-000000000002`
