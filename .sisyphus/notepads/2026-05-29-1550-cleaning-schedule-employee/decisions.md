# Decisions — cleaning-schedule-employee

## [2026-05-29] Architecture Decisions

- **Auth approach**: Full OAuth 2.0 following Jira pattern, dual-mode (OAuth preferred + API key fallback)
- **SDK**: Raw `fetch` — NOT `@notionhq/client` (consistency with Jira/Hostfully)
- **Write tools**: Build `append-blocks.ts` + `update-block.ts` for dev-time restructuring; employee itself read-only
- **Trigger**: Manual only (no cron) — user provides date via `input_schema`
- **Approval**: `approval_required: false` — schedule is a report, not a guest action
- **Slack posting**: Employee posts directly via `post-message.ts --channel C0B71QSMZKQ` during execution
- **Property matching**: Hostfully Internal Property Name prefix match to Notion code (e.g., `271-GIN-HOME` → `271-GIN`)
- **Unassigned handling**: Flag with ⚠️ UNASSIGNED, PM handles manually
- **Token refresh**: Store `notion_refresh_token` (tokens expire) — implementation deferred, storage only
