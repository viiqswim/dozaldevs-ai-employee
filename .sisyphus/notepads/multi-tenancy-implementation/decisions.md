# Decisions — multi-tenancy-implementation

## [2026-04-16] Locked Architectural Decisions

- **Isolation model**: Shared schema + app-level `tenant_id` filtering (NO Postgres RLS)
- **Encryption**: AES-256-GCM, master key from `ENCRYPTION_KEY` env var (64 hex chars = 32 bytes)
- **Tenant deletion**: SOFT-DELETE ONLY. No `hardDelete()` method anywhere. DB FKs use `ON DELETE RESTRICT` as defense-in-depth.
- **Secret deletion**: Hard-delete (true credential revoke, unlike tenants)
- **Slack app**: ONE distributed app; per-workspace OAuth; no admin UI
- **Tenant names**: "DozalDevs" (id: 00000...002) and "VLRE" (id: 00000...003) — these are REAL businesses
- **VLRE legacy**: `SLACK_BOT_TOKEN` env var migrated to tenant_secrets via setup script
- **Env vars moved to tenant-scoped**: `SLACK_BOT_TOKEN`, `JIRA_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN`
- **Env vars that stay platform-shared**: `DATABASE_URL`, `SUPABASE_*`, `INNGEST_*`, `FLY_*`, `ENCRYPTION_KEY`, `ADMIN_API_KEY`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`
- **Test strategy**: Tests-after (implement → write tests → ensure all pass)
- **Migration split**: (A) create tables + backfill in one migration; (B) add FK constraints in separate migration
