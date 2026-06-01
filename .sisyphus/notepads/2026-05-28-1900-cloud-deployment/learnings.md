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

## [2026-06-01] T9 Complete — Fly.io Worker Image Pushed

- `fly apps list` confirms `ai-employee-workers` app exists (status: suspended — normal when no machines running)
- `fly auth docker` works with `FLY_API_TOKEN` from `.env`
- `docker buildx build --platform linux/amd64 --tag registry.fly.io/ai-employee-workers:latest --push .` succeeded (exit 0)
- Build took ~261s for the 1.23GB layer push
- `fly secrets list -a ai-employee-workers` shows NO secrets set yet — need to set after Supabase Cloud provisioned:
  ```bash
  fly secrets set -a ai-employee-workers \
    OPENROUTER_API_KEY="..." \
    SUPABASE_URL="https://{ref}.supabase.co" \
    SUPABASE_SECRET_KEY="..."
  ```
- T9 is COMPLETE for the image push portion; Fly.io secrets step requires Supabase Cloud URL (T6)

## [2026-06-01] Final Wave F1/F2/F4 — All APPROVE

- F1 (Plan Compliance): All 7 Must Haves ✅, all 5 Must NOT Haves ✅, all 6 code tasks complete
- F2 (Code Quality): Build PASS, Tests PASS (86 passing), lint local-only failure (broken symlink not in git — won't affect CI)
- F4 (Scope Fidelity): All tasks COMPLIANT; T4 minor over-scope (3 extra render.yaml env vars: DATABASE_URL_DIRECT, FLY_WORKER_IMAGE, COST_LIMIT_USD_PER_DEPT_PER_DAY) — beneficial, not harmful
- F3 (Real QA) BLOCKED: requires live cloud deployment (T6-T8 must complete first)

## [2026-06-01] Remaining Blockers — Needs User Action

Tasks T6, T7, T8, T11, T12, T13 and F3 are ALL blocked on cloud credentials.
Required sequence:
1. T6: Provision Supabase Cloud Pro → collect DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY
2. T8: Create Inngest Cloud account → collect INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
3. T7: Deploy to Render → set all env vars, get GATEWAY_PUBLIC_URL
4. T9 (secrets): fly secrets set with SUPABASE_URL + SUPABASE_SECRET_KEY + OPENROUTER_API_KEY
5. T11: DATABASE_URL_DIRECT={supabase-direct} npx prisma migrate deploy
6. T12: E2E smoke test via cloud gateway
7. T13: Telegram notify
8. F3: Real QA (health check + Inngest functions + E2E + dashboard)
