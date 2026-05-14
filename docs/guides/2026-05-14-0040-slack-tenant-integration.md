# Slack Per-Tenant Integration Guide

> This document is loaded on-demand when working on Slack OAuth or tenant token issues. For Slack message standards and Socket Mode, see AGENTS.md.

## Slack OAuth — Per-Tenant Installation

Tokens are stored per-tenant: `tenant_secrets` (key: `slack_bot_token`) + `tenant_integrations` (provider: `slack`, external_id: Slack team ID). The `TenantInstallationStore` (`src/gateway/slack/installation-store.ts`) looks them up by team ID for Bolt authorization.

**⚠️ DB wipe/reset destroys OAuth connections.** `pnpm prisma db seed` restores tenants and archetypes but NOT OAuth tokens — those only come from completing the OAuth flow. After any DB reset, both DozalDevs and VLRE must re-authorize.

### Re-connecting a tenant's Slack workspace

1. Confirm gateway is running and Cloudflare tunnel is alive (`curl $SLACK_REDIRECT_BASE_URL/health` → 200)
2. Open in browser: `http://localhost:7700/slack/install?tenant=<tenantId>`
3. Complete OAuth — select the correct workspace
4. Callback stores encrypted token in `tenant_secrets` + upserts `tenant_integrations`
5. Verify: `SELECT tenant_id, key FROM tenant_secrets; SELECT tenant_id, provider, external_id FROM tenant_integrations;`

| Tenant    | Install URL                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| DozalDevs | `http://localhost:7700/slack/install?tenant=00000000-0000-0000-0000-000000000002` |
| VLRE      | `http://localhost:7700/slack/install?tenant=00000000-0000-0000-0000-000000000003` |

VLRE alternative: run the Slack OAuth flow for VLRE (see install URL above).

## Per-Tenant Slack Token Architecture

`loadTenantEnv()` (`src/gateway/services/tenant-env-loader.ts`) builds the Fly.io machine environment:

- `tenant_secrets.slack_bot_token` → `SLACK_BOT_TOKEN` in machine env
- `tenant.config.summary.channel_ids` → `SOURCE_CHANNELS`
- `tenant.config.summary.publish_channel` → `PUBLISH_CHANNEL`
- `archetype.notification_channel` (or `tenant.config.notification_channel`) → `NOTIFICATION_CHANNEL`

**Fly.io app-level secrets are NOT inherited by spawned machines.** Only what `loadTenantEnv` returns (+ explicit `TASK_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) reaches the worker.

### Summarizer failure diagnostic

| Symptom                                                 | Cause                                                       | Fix                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Task → Reviewing in <30s, deliverable content empty     | `SLACK_BOT_TOKEN` missing from machine env                  | Re-run OAuth for that tenant                                  |
| `No installation for team: T...` in gateway logs        | `tenant_integrations` row missing for that Slack workspace  | Re-run OAuth for that tenant                                  |
| `Out of memory: Killed process (.opencode)` in Fly logs | OpenCode OOM on small VM                                    | Increase `WORKER_VM_SIZE` (or set `vm_size` on the archetype) |
| `channel_not_found` from Slack API                      | Bot token belongs to a different workspace than the channel | Wrong token stored — re-run OAuth for correct workspace       |

Fly.io worker logs: `fly logs -a ai-employee-workers` (NOT `ai-employee-summarizer` — that app does not exist).
