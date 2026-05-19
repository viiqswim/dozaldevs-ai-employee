# Issues

## 2026-05-19 Task: F3 — Real Manual QA

**BLOCKER: VLRE Slack bot token missing `channels:read` OAuth scope**

- The `GET /admin/tenants/:tenantId/slack/channels` endpoint calls Slack `conversations.list`
- This API requires the `channels:read` scope
- Current VLRE bot token scopes: `channels:history, groups:history, groups:read, chat:write, chat:write.public`
- Missing: `channels:read`
- Result: endpoint returns 500 → dashboard shows `<Input>` fallback instead of `<Select>` dropdown
- The fallback behavior itself is correct and works as designed
- This is a **pre-existing infrastructure issue** — the endpoint existed before our changes; `CreateEmployeePreview.tsx` also fell back to text input for the same reason

**Fix required (user action):**

1. api.slack.com/apps → VLRE app → OAuth & Permissions → Bot Token Scopes → Add `channels:read`
2. Reinstall App → new token auto-stored via OAuth callback

**Code verdict:** Code is correct. Fallback works. QA cannot fully pass until scope is added.
