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

# Get runtime logs (SSE stream — pipe through head to limit output)
curl -sN -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/logs?tail=100" | head -c 20000

# List env vars (always use ?limit=100 — default paginates at ~20)
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars?limit=100" | jq '[.[] | {key: .envVar.key}]'
```

## Known API Quirks

- `PUT /env-vars` replaces ALL env vars — always include the full list or you will wipe existing secrets
- `PATCH /services/{id}` with `serviceDetails.dockerfilePath` does NOT work — must nest under `serviceDetails.envSpecificDetails.dockerfilePath`
- Runtime logs endpoint: `GET /v1/services/{id}/logs` — returns SSE stream; use `curl -sN` and pipe to `head`
- Deploy logs (build output) are only visible in the Render dashboard, not via API
- `GET /env-vars` paginates at ~20 by default — always append `?limit=100` when listing or verifying env vars, or keys will appear missing even when set
- Prod `DATABASE_URL` MUST include `?pgbouncer=true` (it uses the 6543 transaction pooler) — without it Prisma intermittently crashes at boot with `42P05 prepared statement "s0" already exists`. `DATABASE_URL_DIRECT` (port 5432, used for migrations) must NOT have the param.
