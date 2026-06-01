# Learnings

## [2026-06-01] Wave 1 Complete

### Key Discoveries

- `Dockerfile.gateway` is a NEW file — the existing `Dockerfile` is worker-only (OpenCode)
- `src/gateway/inngest/serve.ts:60` had `serveOrigin` hardcoded to localhost — fixed to use `GATEWAY_PUBLIC_URL` env var
- `src/inngest/employee-lifecycle.ts` had `INNGEST_BASE_URL: 'http://host.docker.internal:8288'` and `INNGEST_DEV: '1'` hardcoded in 3 Fly.io env blocks — fixed to use env vars
- `dashboard/src/lib/constants.ts` had a hardcoded dev JWT as `SUPABASE_ANON_KEY` fallback — changed to empty string
- `/health` endpoint already exists in `src/gateway/routes/health.ts` — no changes needed
- `pnpm dashboard:build` has pnpm workspace policy conflict with `@swc/core` native build scripts in Docker context — Dockerfile.gateway works around this with `npm install --legacy-peer-deps && npx vite build`
- Dashboard has 4 `VITE_*` env vars baked at build time by Vite — NOT available at runtime

### Files Modified (Wave 1)

- `src/gateway/inngest/serve.ts` — serveOrigin uses GATEWAY_PUBLIC_URL
- `src/inngest/employee-lifecycle.ts` — 3 Fly.io env blocks now include INNGEST_BASE_URL + INNGEST_EVENT_KEY
- `.env.example` — Added GATEWAY_PUBLIC_URL
- `dashboard/src/lib/constants.ts` — SUPABASE_ANON_KEY fallback is now ''
- `dashboard/.env.example` — Documents all 4 VITE\_ vars
- `AGENTS.md` — Added cloud deployment guide row
- `README.md` — Added cloud deployment guide row

### Files Created (Wave 1)

- `Dockerfile.gateway` — Multi-stage gateway Docker build
- `render.yaml` — Render Blueprint deployment config
- `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` — Full deployment guide

### GitHub Actions Notes

- Need `.github/workflows/deploy.yml` (main CI/CD) and `.github/workflows/deploy-worker-only.yml` (manual worker deploy)
- Required GitHub secrets: `RENDER_DEPLOY_HOOK_URL`, `FLY_API_TOKEN`
- Test command: `pnpm test -- --run`
- Worker image: `registry.fly.io/ai-employee-workers:latest` (linux/amd64)
