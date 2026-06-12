# Decisions — composio-auth-consolidation

## [2026-06-12] Architecture Decisions (Final)

### Credential Model

- Google/Jira/Notion → Composio-managed credentials (no own app needed)
- Slack/GitHub → Composio with OWN app credentials (GitHub: `repo` scope; Slack: user's own bot identity)
- Only `SLACK_APP_TOKEN` (`xapp-`) stays in `.env` — everything else through Composio

### Slack Token Strategy

- Keep populating `tenant_secrets.slack_bot_token` (minimal blast radius — all consumers unchanged)
- Source its value from `getComposioConnectionToken(tenantId, 'slack')` on Composio connect/callback
- NO cron/timer/background poll (hard user rule)
- `slack-oauth.ts` removable ONLY after Task 5 establishes `teamId → tenant` mapping via Composio

### GitHub Token Strategy

- `internal-github-token.ts` endpoint: swap lines 42-49 to call `getComposioConnectionToken(tenantId, 'github')`
- `get-token.ts` shell tool: UNCHANGED (only server-side token source changes)
- Remove entire GitHub App machinery: `github-oauth.ts`, `generateInstallationToken()`, GitHub App env vars

### Dashboard Strategy

- `/dashboard/integrations` → Composio marketplace page (canonical)
- Old custom page removed from routing; URL redirects (no 404)
- Slack = Composio-native connection (NOT a custom card)
- Hostfully/Sifely = credential-form cards (encrypted secrets API only)
