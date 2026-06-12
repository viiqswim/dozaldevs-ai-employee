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

---

## [2026-06-12] USER REVISED DECISION — OVERRIDES ORIGINAL PLAN FOR T4/T5 (CRITICAL)

**Context**: During implementation, Composio was found to mask ALL tokens server-side (GitHub tokens return
`REDACTED`, Slack tokens return `REDACTED`). This made it impossible to re-source `internal-github-token.ts`
from Composio or populate `tenant_secrets.slack_bot_token` from Composio as originally planned.

**User's explicit decision** (confirmed in session, commit `535ef72b`):

- **KEEP `github-oauth.ts`** — GitHub App install flow intentionally preserved. The GitHub App flow
  (`generateInstallationToken()` + `github_installation_id` secret) continues to be the token source for
  `internal-github-token.ts`. This is NOT a violation — it is the user's deliberate choice.

- **KEEP `slack-oauth.ts`** — Slack OAuth flow intentionally preserved. `tenant_secrets.slack_bot_token`
  continues to be populated via the existing Slack OAuth flow, not from Composio.

- **GitHub + Slack appear as OAuth-redirect custom cards** on the integrations page (commit `535ef72b`).
  They are shown alongside Composio-native connections but use their own OAuth flows.

- **`github-token-manager.ts` KEPT** — still used by `internal-github-token.ts`.

**What T4/T5 actually delivered** (the revised implementation):

- T4: GitHub shown as a custom OAuth-redirect card on the integrations page (NOT re-sourced to Composio)
- T5: Slack shown as a custom OAuth-redirect card on the integrations page (NOT re-sourced to Composio)

**Implication for F1/F4 reviewers**: The presence of `github-oauth.ts` and `slack-oauth.ts` in the codebase
is CORRECT and INTENTIONAL. Any F-wave reviewer that rejects based on these files being present is comparing
against the original plan text, not the user's revised decision. The revised decision supersedes the original
plan text for T4 and T5.

**Evidence**: commit `535ef72b` — `feat(dashboard): add GitHub and Slack as OAuth-redirect integration cards`
