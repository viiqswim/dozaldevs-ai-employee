# Issues — employee-creation-ux-polish

## [2026-05-18] Session Start

### Confirmed Bugs

- Slack case mismatch: OAuth writes `slack_bot_token` (lowercase), channels endpoint reads `SLACK_BOT_TOKEN` (uppercase) → `TenantSecretRepository.get()` returns null → "SLACK_NOT_CONFIGURED" false positive
- Zero existing uppercase rows in `tenant_secrets` — no migration needed
- Tools display: `pathSegments[2]` extracts service name → duplicate badges when multiple tools from same service

## QA Run — 2026-05-18

### Item 2 FAIL: "Slack not configured for this tenant" still showing
- **Observed**: `Slack not configured for this tenant. Enter a channel ID manually.` shown in the Notification Channel section
- **Expected**: Either a channel dropdown OR absence of this specific text
- **Tenant tested**: VLRE (00000000-0000-0000-0000-000000000003)
- **Hypothesis**: The fix using lowercase `'slack_bot_token'` key may not have taken effect (gateway may not be running the latest code, or the VLRE tenant doesn't have a Slack bot token registered in the DB at all)
- **Evidence**: `.sisyphus/evidence/task-5-item2-slack.png`

### Note on Item 5 textarea vs contenteditable
- The MarkdownEditorField uses `div[role="textbox"]` (contenteditable) rather than native `<textarea>`. This is expected for a CodeMirror-style editor. The accessibility tree reports it as `textbox` which is correct. There are 3 such elements (Employee Brain, Trigger Instructions, Delivery Instructions), all with `aria-label="Expand editor"` buttons.

## Item 2 Re-test — with admin key in localStorage (2026-05-18)

- API key was correctly sent (`x-admin-key` header confirmed in network request)
- Backend returned `{"error":"INTERNAL_ERROR"}` (HTTP 500) — NOT `SLACK_NOT_CONFIGURED`
  - This confirms the backend fix (lowercase `'slack_bot_token'` key) IS working
- **Root cause of FAIL**: The frontend error handler maps ALL error responses (including `INTERNAL_ERROR`) to the same "Slack not configured for this tenant. Enter a channel ID manually." message
- The frontend needs to distinguish `SLACK_NOT_CONFIGURED` from `INTERNAL_ERROR` and show a different message (e.g., "Could not load channels — enter ID manually") for INTERNAL_ERROR
- Network request: GET /admin/tenants/00000000-0000-0000-0000-000000000003/slack/channels → 500 {"error":"INTERNAL_ERROR"}
