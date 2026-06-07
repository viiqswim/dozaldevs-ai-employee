# Decisions — slack-per-dev-app-architecture

## [2026-06-06] Plan initialized

### Architecture Decision: Per-dev Slack apps via Slack CLI v3 `slack run`

- Each engineer gets their own Slack Developer Sandbox workspace + dev app
- `pnpm dev` orchestrates `slack run` as a managed child process
- Per-dev `SLACK_APP_TOKEN` flows to gateway via env injection
- Prod app stays Slack-UI-managed (NOT migrated to CLI manifest)

### Prod Fix Decision: Dashboard-only for Inngest keys

- NEVER use Render `PUT /env-vars` (replaces ALL vars, wipes dashboard-set secrets)
- Set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` via Render dashboard only
- Must snapshot full env-var key set before/after to prove no var lost

### Tenant Registration Decision (TBD — SPIKE will confirm)

- Option A: Reuse existing OAuth flow (`src/gateway/routes/slack-oauth.ts`)
- Option B: New seed script `scripts/register-dev-slack-tenant.ts`
- Must use existing `TenantIntegrationRepository` + `TenantSecretRepository`
- Must NOT alter `tenant_secrets` schema or redesign `TenantInstallationStore`
