# Decisions — guest-messaging-webhook-driven

## [2026-05-04] Session ses_21be61a1affeAdr90LV02GNbHN — Plan Start

### Architecture Decisions

- Each Hostfully webhook = one task = one message = one reply (1:1 mapping)
- Model still fetches from Hostfully API but scoped to specific lead (NOT polling all unresponded)
- `--lead-id` and `--property-id` are mutually exclusive in get-messages.ts
- Missing `lead_uid` on NEW_INBOX_MESSAGE returns 400 (route-level validation, Zod schema unchanged)
- `HOSTFULLY_MOCK=true` used for E2E without real Hostfully data
- Slack tools NOT mocked — we want real Slack approval cards in E2E
- Sifely/lock tools NOT mocked — out of scope
- No changes to: send-message.ts, post-guest-approval.ts, employee-lifecycle.ts, opencode-harness.mts
- Shell tool checklist doc created at `docs/2026-05-04-1645-adding-a-shell-tool.md`
- AGENTS.md gets: (1) link in "Adding a new employee" step 2, (2) row in Reference Documents table
