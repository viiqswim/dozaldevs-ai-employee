---
name: production-ops
description: 'Use when debugging production issues, checking Render deploys, fetching runtime logs, or updating production service config. Covers the Render API commands, service ID, deploy-status checks, env-var PUT gotcha, and known API quirks.'
---

# Production Ops — Render API (Production Gateway)

The production Express gateway runs on Render. Use this skill for any production debugging, deploy management, or service config changes.

> **Load `docs/guides/2026-06-01-2246-production-debugging-guide.md`** for full production debugging methodology (topology overview, cloud DB queries, Fly.io machine inspection, Inngest retry loop diagnosis, known production bugs and fixes).

## Key References

- **API key**: stored in `.env` as `RENDER_API_KEY`. The key lives in `.env` as `RENDER_API_KEY` and in `.env.example` for reference.
- **Service ID**: `srv-d8f1b2gg4nts738dj7jg` (also in `.env` as `RENDER_SERVICE_ID`)
- **Base URL**: `https://api.render.com/v1`
- **Auth header**: `Authorization: Bearer $RENDER_API_KEY`
- **Dashboard**: `https://dashboard.render.com/web/srv-d8f1b2gg4nts738dj7jg`
- **Live URL**: `https://ai-employees-laaa.onrender.com`

> **IMPORTANT — Service was created manually (not via Blueprint).** `render.yaml` is NOT authoritative for this service. Any settings in `render.yaml` (dockerfilePath, healthCheckPath, envVars) must be applied via PATCH API or the dashboard manually. Changes to `render.yaml` alone have no effect.

## Curl Commands

```bash
# Check latest deploy status
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" | jq '.[0] | {id: .deploy.id, status: .deploy.status}'

# Trigger a new deploy
curl -s -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" -d '{"clearCache":"do_not_clear"}' | jq '{id: .id, status: .status}'

# Update service config (e.g. dockerfilePath)
curl -s -X PATCH -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID" \
  -d '{"serviceDetails": {"envSpecificDetails": {"dockerfilePath": "./Dockerfile.gateway"}}}' | jq '.serviceDetails.envSpecificDetails.dockerfilePath'

# Set/replace ALL env vars (PUT replaces entire list — always include ALL vars)
curl -s -X PUT -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars" -d '[{"key":"FOO","value":"bar"}]'

# Get runtime logs (the per-service logs path 404s now — use the top-level /v1/logs endpoint).
# Needs ownerId (the team id). Time window is required for useful output.
RENDER_OWNER_ID=$(curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID" | jq -r '.ownerId')
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/logs?ownerId=$RENDER_OWNER_ID&resource=$RENDER_SERVICE_ID&limit=100&startTime=2026-06-16T19:00:00Z&endTime=2026-06-16T19:10:00Z" \
  | jq -r '.logs[] | "\(.timestamp) \(.message)"'

# List env vars (always use ?limit=100 — default paginates at ~20)
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars?limit=100" | jq '[.[] | {key: .envVar.key}]'
```

## Known API Quirks

- `PUT /env-vars` replaces ALL env vars — always include the full list or you will wipe existing secrets
- `PATCH /services/{id}` with `serviceDetails.dockerfilePath` does NOT work — must nest under `serviceDetails.envSpecificDetails.dockerfilePath`
- Runtime logs endpoint: the per-service path `GET /v1/services/{id}/logs` **returns `404 page not found`** (verified 2026-06-16). Use the top-level `GET /v1/logs?ownerId={ownerId}&resource={serviceId}&limit=N&startTime=...&endTime=...` instead. Get `ownerId` from `GET /v1/services/{id}` (`.ownerId`, the team id — currently `tea-d1uscc3uibrs738pu040`). Returns JSON (`.logs[].message` are JSON log lines), not an SSE stream.
- Deploy logs (build output) are only visible in the Render dashboard, not via API
- `GET /env-vars` paginates at ~20 by default — always append `?limit=100` when listing or verifying env vars, or keys will appear missing even when set
- Prod `DATABASE_URL` MUST include `?pgbouncer=true` (it uses the 6543 transaction pooler) — without it Prisma intermittently crashes at boot with `42P05 prepared statement "s0" already exists`. `DATABASE_URL_DIRECT` (port 5432, used for migrations) must NOT have the param.

---

## Known Issue: ngrok Free Tier Doesn't Work with Fly.io

Cloudflare Tunnel is the permanent solution. Named tunnel `postgrest-ai-employee.dozaldevs.com` is configured in `~/.cloudflared/ai-employee-local.yml` — stable across restarts. If `TUNNEL_URL` is unset, `dev.ts` auto-spawns a quick tunnel.

---

## Database Backup (MANDATORY before any reseed or wipe)

**Before running `pnpm prisma db seed`, `pnpm setup`, `docker compose down -v`, or any operation that resets or overwrites the database — YOU MUST back it up first.**

The database contains production data: learned rules accumulated over time, feedback history, tenant secrets, and task history. A reseed silently overwrites archetype rows. A volume wipe destroys everything. Always back up first.

**How to back up:**

```bash
# 1. Get a timestamp
TS=$(date "+%Y-%m-%d-%H%M")
BACKUP_DIR="database-backups/$TS"
mkdir -p "$BACKUP_DIR"

# 2. Full dump (plain SQL — human-readable and restorable)
docker exec shared-postgres pg_dump -U postgres -d ai_employee --format=plain > "$BACKUP_DIR/full-dump.sql"

# 3. Critical tables individually (for selective restore)
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t employee_rules --data-only --inserts > "$BACKUP_DIR/employee_rules.sql"
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t archetypes --data-only --inserts > "$BACKUP_DIR/archetypes.sql"
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t tenant_secrets --data-only --inserts > "$BACKUP_DIR/tenant_secrets.sql"
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t knowledge_base_entries --data-only --inserts > "$BACKUP_DIR/knowledge_base_entries.sql"

# 4. Confirm row counts
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT 'employee_rules' as t, count(*) FROM employee_rules UNION ALL SELECT 'archetypes', count(*) FROM archetypes UNION ALL SELECT 'tasks', count(*) FROM tasks;"

echo "Backup complete: $BACKUP_DIR"
```

**How to restore:**

```bash
# Full restore (replaces everything — use after a volume wipe)
docker exec -i shared-postgres psql -U postgres -d ai_employee < database-backups/YYYY-MM-DD-HHMM/full-dump.sql

# Selective restore — just learned rules (use after an accidental reseed)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "TRUNCATE employee_rules CASCADE;"
psql postgresql://postgres:postgres@localhost:54322/ai_employee < database-backups/YYYY-MM-DD-HHMM/employee_rules.sql
```

**Notes:**

- Backups are gitignored (`database-backups/` in `.gitignore`) — they stay local only
- The Docker container name is `shared-postgres` — verify with `docker ps --filter name=postgres`
- `pg_dump` inside the container is always version-matched — do not use the host `pg_dump` (version mismatch causes errors)
- Existing backups live in `database-backups/` — check before overwriting
