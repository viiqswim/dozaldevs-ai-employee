# Daily Summarizer (Papi Chulo) — Operational Details

> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.

## Identity & Configuration

**Summarizer (Papi Chulo)** — runs daily via cron, reads configured Slack channels, generates a digest with an LLM, posts to a target channel for human approval, then publishes on approval.

**Summarizer archetype slug**: `daily-summarizer` (seeded in `prisma/seed.ts`). Duplicate prevention: `external_id: summary-{YYYY-MM-DD}`.

**Cron timezone**: The daily-summarizer is now triggered by an external cron job on cron-job.org (not Inngest). cron-job.org supports per-job IANA timezone config, so the schedule can be set in the tenant's local timezone. The archetype's `trigger_sources.timezone` field is documentation metadata only — it does not configure any runtime behavior.

`trigger/daily-summarizer` — DELETED; replaced by external cron on cron-job.org. Trigger manually via admin API: `POST /admin/tenants/:id/employees/daily-summarizer/trigger`

## Per-Tenant Channel Configuration

> **⚠️ Planned change (PLAT-07/08)**: Hardcoded channel IDs in archetype instructions will be replaced by a `notification_channel` config (required per-tenant default + optional per-archetype override). All channel resolution will go through config, not natural language instructions. Do not add more hardcoded channel IDs to archetype instructions. See `docs/planning/2026-04-21-2202-phase1-story-map.md` § PLAT-07 and PLAT-08.

Channel config lives in two places — both must be consistent:

1. **`tenants.config.summary`** (DB) — read by `loadTenantEnv` to inject env vars into machine; also read by the lifecycle after approval to know which Slack message to update.
2. **Archetype `instructions`** (DB) — natural language telling OpenCode which shell tools to call and with which channel IDs. Tenant-specific archetypes can hardcode channels directly, bypassing env vars.

### DozalDevs (`00000000-0000-0000-0000-000000000002`)

- **Archetype ID**: `00000000-0000-0000-0000-000000000012`
- **Pattern**: Hardcoded channel IDs in archetype instructions (not env vars)
- Read from: `C092BJ04HUG` (`#project-lighthouse`)
- Post approval summary + buttons to: `C0AUBMXKVNU` (`#victor-tests`)
- Post confirmation (publish) to: `C092BJ04HUG` (`#project-lighthouse`)
- `tenant.config.summary.target_channel`: `C0AUBMXKVNU` (needed for lifecycle approval update)

### VLRE (`00000000-0000-0000-0000-000000000003`)

- **Archetype ID**: `00000000-0000-0000-0000-000000000013`
- **Pattern**: Hardcoded channel IDs in archetype instructions (not env vars)
- Read from: `C0AMGJQN05S`, `C0ANH9J91NC`, `C0960S2Q8RL`
- Post approval summary + buttons to: `C0960S2Q8RL`
- Post confirmation (publish) to: `C0960S2Q8RL`
- `tenant.config.summary.target_channel`: `C0960S2Q8RL` (needed for lifecycle approval update)

Both archetypes share the same Papi Chulo system prompt (dramatic Spanish TV news correspondent persona), model (`minimax/minimax-m2.7`), runtime (`opencode`), and risk model (`approval_required: true`, `timeout_hours: 24`).

## Failure Diagnostics

### Summarizer failure diagnostic

| Symptom                                                 | Cause                                                       | Fix                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Task → Reviewing in <30s, deliverable content empty     | `SLACK_BOT_TOKEN` missing from machine env                  | Re-run OAuth for that tenant                                  |
| `No installation for team: T...` in gateway logs        | `tenant_integrations` row missing for that Slack workspace  | Re-run OAuth for that tenant                                  |
| `Out of memory: Killed process (.opencode)` in Fly logs | OpenCode OOM on small VM                                    | Increase `WORKER_VM_SIZE` (or set `vm_size` on the archetype) |
| `channel_not_found` from Slack API                      | Bot token belongs to a different workspace than the channel | Wrong token stored — re-run OAuth for correct workspace       |

Fly.io worker logs: `fly logs -a ai-employee-workers` (NOT `ai-employee-summarizer` — that app does not exist).

## Tenant Reference

Two tenants are seeded in `prisma/seed.ts`. Each requires its own Slack OAuth connection to operate:

| ID                                     | Name      | Slug      | Slack Workspace                                    |
| -------------------------------------- | --------- | --------- | -------------------------------------------------- |
| `00000000-0000-0000-0000-000000000002` | DozalDevs | dozaldevs | `T0601SMSVEU` (Dozal Inc.) — must OAuth separately |
| `00000000-0000-0000-0000-000000000003` | VLRE      | vlre      | `vlreworkspace.slack.com` (team: `T06KFDGLHS6`)    |

## Trigger Command

```bash
TENANT=00000000-0000-0000-0000-000000000002
# Trigger
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
# Dry-run
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger?dry_run=true" -H "Content-Type: application/json" -d '{}'
```
