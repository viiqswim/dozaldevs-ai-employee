# Cloud Deployment — AI Employee Platform

## TL;DR

> **Quick Summary**: Deploy the full AI Employee Platform to cloud services — Render (gateway), Supabase Cloud (database + PostgREST), Fly.io Machines (workers, already integrated), Inngest Cloud (orchestration), and GitHub Actions (CI/CD). Dashboard bundled with gateway.
>
> **Deliverables**:
>
> - Gateway deployed to Render with all env vars configured
> - Database migrated to Supabase Cloud Pro with PostgREST
> - Worker containers dispatching via Fly.io Machines (production mode)
> - Inngest Cloud connected and all 5 functions registered
> - GitHub Actions CI/CD pipeline for automated deploys
> - All hardcoded localhost references replaced with env-var-driven config
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Code fixes (Wave 1) → Infrastructure provisioning (Wave 2) → CI/CD + cutover (Wave 3) → Verification (Final Wave)

---

## Context

### Original Request

Deploy the entire AI Employee Platform to the cloud. Choose affordable, AI-agent-friendly services. User has experience with Vercel (frontend), Render (backend), and Supabase (DB/auth/storage).

### Interview Decisions

- **Dashboard**: Bundle with Express gateway — served at `/dashboard/`, PostgREST stays internal
- **Domain**: Platform defaults for now (e.g., `your-app.onrender.com`)
- **CI/CD**: GitHub Actions — auto-deploy gateway to Render + push worker image to Fly.io
- **Region**: US East (single region for all services)

### Architecture

```
┌────────────────────────────────────────────────┐
│  Render Starter ($7/mo)                        │
│  Express gateway + Inngest serve() + Slack Bolt │
│  Serves dashboard/dist/ at /dashboard/          │
│  ← Inngest Cloud calls /api/inngest             │
│  ← Slack Socket Mode (outbound WebSocket)       │
└──────┬───────────────┬──────────────────────────┘
       │               │
       ▼               ▼
┌──────────┐  ┌─────────────────┐   ┌──────────────────┐
│ Inngest  │  │ Supabase Cloud  │◄──│ Fly.io Machines  │
│ Cloud    │  │ Pro ($25/mo)    │   │ (pay-per-use)    │
│ (Free)   │  │ Postgres +      │   │ Worker containers │
└──────────┘  │ PostgREST       │   │ OpenCode agents  │
              └─────────────────┘   └──────────────────┘
```

**Estimated monthly cost: ~$37-47/mo**

### Deployment-Blocking Issues Found (all addressed in tasks)

1. `serve.ts:60` — `serveOrigin` hardcoded to `localhost` → Inngest Cloud can't call back (Task 1)
2. `employee-lifecycle.ts` lines ~537, ~1107, ~2465 — `INNGEST_BASE_URL: 'http://host.docker.internal:8288'` hardcoded (Task 1)
3. `employee-lifecycle.ts` same locations — `INNGEST_DEV: '1'` hardcoded in local Docker env blocks (Task 1)
4. No gateway `Dockerfile` — worker `Dockerfile` is for OpenCode only (Task 2)
5. `dashboard/src/lib/constants.ts:6-7` — hardcoded dev JWT as `SUPABASE_ANON_KEY` fallback (Task 3)
6. No `render.yaml` deployment blueprint exists (Task 4)
7. No CI/CD pipeline (Task 10)

### Scope Guardrails

- **IN**: Code fixes for cloud compatibility, gateway Dockerfile, render.yaml, Inngest Cloud config, CI/CD, database migration, E2E smoke test, deployment docs
- **OUT**: Custom domains, tenant data migration, business logic refactoring, new features, PostgREST replacement

---

## Work Objectives

### Must Have

- All services use env vars — zero hardcoded `localhost` in production code paths
- `WORKER_RUNTIME=fly` in production
- PostgREST accessible to workers via Supabase Cloud URL
- Slack Socket Mode working from Render (outbound WebSocket)
- Gateway Dockerfile that builds the Express server (separate from worker Dockerfile)
- Dashboard accessible at `https://{render-url}/dashboard/`
- GitHub Actions auto-deploys on push to `main`

### Must NOT Have

- No refactoring of business logic — deployment config changes only
- No changes to the worker `Dockerfile` (it already works with Fly.io)
- No custom domain setup
- No migration of tenant secrets data
- No PostgREST exposed publicly

---

## TODOs

- [x] 1. Fix hardcoded localhost references in gateway and lifecycle code

  Fix three deployment-blocking hardcodes:

  **A. `src/gateway/inngest/serve.ts` line 60**
  Change:

  ```ts
  serveOrigin: `http://localhost:${process.env.PORT ?? '7700'}`,
  ```

  To:

  ```ts
  serveOrigin: process.env.GATEWAY_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '7700'}`,
  ```

  This lets Inngest Cloud call back to the public Render URL in production.

  **B. `src/inngest/employee-lifecycle.ts` — three locations (~537, ~1107, ~2465)**
  Each location has a local Docker env block that injects `INNGEST_BASE_URL` and `INNGEST_DEV` hardcoded:

  ```ts
  INNGEST_BASE_URL: 'http://host.docker.internal:8288',
  INNGEST_DEV: '1',
  ```

  These lines only appear in the `WORKER_RUNTIME !== 'fly'` (local Docker) branch. They are fine for local Docker mode. But verify they are inside conditional blocks only — if any appear outside a `WORKER_RUNTIME === 'docker'` condition, fix them to be conditional.

  The Fly.io branch should pass `INNGEST_BASE_URL: process.env.INNGEST_BASE_URL` (the Inngest Cloud ingest URL) and NOT set `INNGEST_DEV` at all.

  **C. `.env.example`**
  Add `GATEWAY_PUBLIC_URL` entry in the "Platform Core" section:

  ```
  GATEWAY_PUBLIC_URL=  # Public HTTPS URL of gateway (e.g. https://ai-employee.onrender.com). Required for Inngest Cloud callbacks.
  ```

  After changes: `pnpm build` must pass. `pnpm test -- --run` must pass (0 new failures).

- [x] 2. Create gateway Dockerfile (Dockerfile.gateway)

  Create `/Dockerfile.gateway` — a multi-stage Docker build for the Express gateway server. This is entirely separate from the existing `Dockerfile` (which is for OpenCode worker containers).

  **Requirements**:
  - Multi-stage: `builder` stage compiles TypeScript + builds dashboard; `runner` stage copies only production artifacts
  - Node 22 base image
  - Install pnpm, run `pnpm install --frozen-lockfile` for production deps
  - Run `pnpm build` (compiles `src/` → `dist/`)
  - Run `pnpm dashboard:build` (builds `dashboard/` → `dashboard/dist/`)
  - Run `npx prisma generate`
  - Final image: copy `dist/`, `node_modules/` (prod only), `dashboard/dist/`, `prisma/`
  - CMD: `node dist/gateway/server.js`
  - Expose port `$PORT` (Render sets this automatically)
  - Target image size: <500MB (vs ~2GB worker image with OpenCode)

  Do NOT include: OpenCode, shell tools (`/tools/`), worker skills, `src/worker-tools/`, `src/workers/`

  Verify: `docker build -f Dockerfile.gateway -t ai-employee-gateway:test .` exits code 0.

- [x] 3. Fix dashboard VITE\_ env vars for production

  **`dashboard/src/lib/constants.ts` line 5-7**:
  Remove the hardcoded dev JWT fallback for `SUPABASE_ANON_KEY`:

  ```ts
  // BEFORE (broken in cloud — Supabase Cloud will 401 with this dev JWT):
  export const SUPABASE_ANON_KEY =
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

  // AFTER (fails visibly if VITE_SUPABASE_ANON_KEY not set in prod):
  export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  ```

  Keep localhost fallbacks for the other 3 vars (`VITE_POSTGREST_URL`, `VITE_GATEWAY_URL`, `VITE_INNGEST_URL`) — those are needed for local dev.

  **`dashboard/.env.example`** (create if missing, or update):
  Document all 4 `VITE_*` vars:

  ```
  VITE_POSTGREST_URL=http://localhost:54331/rest/v1  # PostgREST URL. Production: https://{ref}.supabase.co/rest/v1
  VITE_SUPABASE_ANON_KEY=  # Supabase anon JWT. Required for PostgREST queries.
  VITE_GATEWAY_URL=http://localhost:7700  # Gateway API URL. Production: https://{render-url}
  VITE_INNGEST_URL=http://localhost:8288  # Inngest URL. Production: https://inn.gs
  ```

  Verify: `cd dashboard && pnpm build` succeeds (uses fallback values).

- [x] 4. Add render.yaml blueprint and verify health endpoint

  **A. Create `render.yaml`** in project root:

  ```yaml
  services:
    - type: web
      name: ai-employee-gateway
      runtime: docker
      dockerfilePath: ./Dockerfile.gateway
      region: ohio
      plan: starter
      healthCheckPath: /health
      envVars:
        - key: NODE_ENV
          value: production
        - key: WORKER_RUNTIME
          value: fly
        - key: FLY_WORKER_APP
          value: ai-employee-workers
        - key: DATABASE_URL
          sync: false
        - key: SUPABASE_URL
          sync: false
        - key: SUPABASE_SECRET_KEY
          sync: false
        - key: SUPABASE_ANON_KEY
          sync: false
        - key: ENCRYPTION_KEY
          sync: false
        - key: ADMIN_API_KEY
          sync: false
        - key: OPENROUTER_API_KEY
          sync: false
        - key: INNGEST_EVENT_KEY
          sync: false
        - key: INNGEST_SIGNING_KEY
          sync: false
        - key: GATEWAY_PUBLIC_URL
          sync: false
        - key: SLACK_SIGNING_SECRET
          sync: false
        - key: SLACK_BOT_TOKEN
          sync: false
        - key: SLACK_APP_TOKEN
          sync: false
        - key: SLACK_CLIENT_ID
          sync: false
        - key: SLACK_CLIENT_SECRET
          sync: false
        - key: SLACK_REDIRECT_BASE_URL
          sync: false
        - key: WEBHOOK_PUBLIC_URL
          sync: false
        - key: FLY_API_TOKEN
          sync: false
        - key: JIRA_CLIENT_ID
          sync: false
        - key: JIRA_CLIENT_SECRET
          sync: false
        - key: JIRA_WEBHOOK_SECRET
          sync: false
  ```

  **B. Verify `/health` endpoint exists** in `src/gateway/server.ts`. If it does not exist, add:

  ```ts
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  ```

  Add it near the top of the route declarations (before other routes).

  Verify: `pnpm build` passes.

- [x] 5. Write cloud deployment guide

  Create `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md`:

  Sections:
  1. **Architecture Overview** — diagram + table of what runs where and why
  2. **Service Provisioning** — step-by-step for each: Supabase Cloud, Render, Inngest Cloud, Fly.io
  3. **Environment Variables** — complete mapping of every env var, which service it goes to, where to find the value
  4. **Database Migration** — `prisma migrate deploy`, PostgREST schema reload verification
  5. **CI/CD Pipeline** — what GitHub Actions does, required secrets, how to trigger manually
  6. **Ongoing Costs** — $7 Render + $25 Supabase + ~$10 Fly.io + $0 Inngest = ~$42/mo
  7. **Troubleshooting** — Inngest not connecting, PostgREST 401, Slack Socket Mode issues, CORS
  8. **Local vs Cloud Differences** — what changes between environments

  After writing: update `AGENTS.md` Reference Documents table and `README.md` Documentation table with a row pointing to this doc.

  No hardcoded secrets or real API keys anywhere in the document.

- [ ] 6. Provision Supabase Cloud Pro and collect credentials

  **Manual provisioning steps** (agent assists with verification):
  1. Go to https://supabase.com/dashboard → "New project"
  2. Name: `ai-employee-prod`, Region: `East US (North Virginia)`, Plan: Pro ($25/mo)
  3. Wait for project to fully provision (~2 min)
  4. From project Settings → Database → collect:
     - `DATABASE_URL` (connection string — use "Transaction" mode for connection pooling)
     - `DATABASE_URL_DIRECT` (direct connection — needed for Prisma migrations)
  5. From project Settings → API → collect:
     - `SUPABASE_URL` → this is the project URL: `https://{ref}.supabase.co`
     - `SUPABASE_ANON_KEY` (anon/public key)
     - `SUPABASE_SECRET_KEY` (service_role key — this is the PostgREST service key)

  **Verify PostgREST is reachable** (after provisioning, before migration):

  ```bash
  curl -s "https://{ref}.supabase.co/rest/v1/" \
    -H "apikey: {anon_key}" \
    -H "Authorization: Bearer {anon_key}"
  # Expected: {"hint":null,"details":null,"code":"PGRST000", ...} or similar API root response
  ```

  Save all credentials to Render env vars (Task 7) and to a local secure store (1Password, etc.).

- [ ] 7. Deploy gateway to Render and configure env vars

  **Deployment steps**:
  1. Go to https://render.com → "New Web Service"
  2. Connect GitHub repo
  3. Runtime: Docker, Dockerfile path: `./Dockerfile.gateway`
  4. Region: Ohio (US East), Plan: Starter ($7/mo)
  5. Set all env vars from `render.yaml` list — use actual values from: Task 6 (DB/Supabase), Task 8 (Inngest keys), existing `.env` (Slack, Fly.io, OpenRouter)
  6. Critical env var values for production:
     - `DATABASE_URL` → Supabase Cloud transaction pooler URL
     - `SUPABASE_URL` → `https://{ref}.supabase.co` (NOT port 54331)
     - `INNGEST_DEV` → leave UNSET (do not set to `1`)
     - `WORKER_RUNTIME` → `fly`
     - `SLACK_REDIRECT_BASE_URL` → `https://{service}.onrender.com`
     - `WEBHOOK_PUBLIC_URL` → `https://{service}.onrender.com`
  7. Deploy → wait for build to complete
  8. After deploy: set `GATEWAY_PUBLIC_URL` → `https://{service}.onrender.com`

  **Verification**:

  ```bash
  curl -s https://{service}.onrender.com/health
  # Expected: {"status":"ok"}
  ```

- [ ] 8. Configure Inngest Cloud and register all functions

  **Setup steps**:
  1. Create account at https://app.inngest.com (or log in)
  2. Create a new "Production" environment
  3. From Settings → Event Keys: copy `INNGEST_EVENT_KEY`
  4. From Settings → Signing Keys: copy `INNGEST_SIGNING_KEY`
  5. Set both in Render env vars (Task 7 — update if deploy already happened)
  6. In Inngest Cloud → Apps → "Add App" → enter URL: `https://{service}.onrender.com/api/inngest`
  7. Inngest Cloud will call this endpoint and discover all 5 functions

  **Verify all 5 functions appear**:
  - `employee/universal-lifecycle`
  - `employee/interaction-handler`
  - `employee/rule-extractor`
  - `employee/rule-synthesizer`
  - `trigger/reviewing-watchdog` (cron: `*/15 * * * *`)

- [x] 9. Verify Fly.io worker app and push production image

  **Steps**:
  1. Verify app exists: `fly apps list | grep ai-employee-workers`
     - If missing: `pnpm fly:setup` (runs `scripts/fly-setup.ts`)
  2. Build + push worker image for linux/amd64:
     ```bash
     pnpm fly:image
     # This runs: docker buildx build --platform linux/amd64 --tag registry.fly.io/ai-employee-workers:latest --push .
     ```
  3. Set critical Fly.io app secrets (injected into ALL machines):
     ```bash
     fly secrets set -a ai-employee-workers \
       OPENROUTER_API_KEY="..." \
       SUPABASE_URL="https://{ref}.supabase.co" \
       SUPABASE_SECRET_KEY="..."
     ```
     Note: Most env vars are injected at machine-creation time via `loadTenantEnv()`. Only base platform secrets need to be set at the app level.

  **Verify**:

  ```bash
  fly apps list | grep ai-employee-workers   # app exists
  fly secrets list -a ai-employee-workers    # secrets configured
  ```

- [x] 10. Create GitHub Actions CI/CD workflow

  Create `.github/workflows/deploy.yml`:

  ```yaml
  name: Deploy

  on:
    push:
      branches: [main]

  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v3
        - uses: actions/setup-node@v4
          with: { node-version: '22', cache: 'pnpm' }
        - run: pnpm install --frozen-lockfile
        - run: pnpm build
        - run: pnpm test -- --run
        - run: pnpm lint

    deploy-gateway:
      needs: test
      runs-on: ubuntu-latest
      steps:
        - name: Trigger Render deploy
          run: curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"

    deploy-worker:
      needs: test
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: superfly/flyctl-actions/setup-flyctl@master
        - run: fly auth docker
          env: { FLY_API_TOKEN: '${{ secrets.FLY_API_TOKEN }}' }
        - uses: docker/setup-buildx-action@v3
        - run: docker buildx build --platform linux/amd64 --tag registry.fly.io/ai-employee-workers:latest --push .
          env: { FLY_API_TOKEN: '${{ secrets.FLY_API_TOKEN }}' }
  ```

  Also create `.github/workflows/deploy-worker-only.yml` for worker-only deploys (when only shell tools change):

  ```yaml
  name: Deploy Worker Only

  on:
    workflow_dispatch: # Manual trigger only

  jobs:
    deploy-worker:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: superfly/flyctl-actions/setup-flyctl@master
        - run: fly auth docker
          env: { FLY_API_TOKEN: '${{ secrets.FLY_API_TOKEN }}' }
        - uses: docker/setup-buildx-action@v3
        - run: docker buildx build --platform linux/amd64 --tag registry.fly.io/ai-employee-workers:latest --push .
          env: { FLY_API_TOKEN: '${{ secrets.FLY_API_TOKEN }}' }
  ```

  Required GitHub repo secrets to document (in deployment guide):
  - `RENDER_DEPLOY_HOOK_URL` — from Render dashboard → Settings → Deploy Hook
  - `FLY_API_TOKEN` — from `fly auth token`

- [ ] 11. Run database migration against Supabase Cloud

  Run Prisma migrations against the cloud DB:

  ```bash
  # Use DATABASE_URL_DIRECT (not pooled) for migrations
  DATABASE_URL={supabase-direct-url} npx prisma migrate deploy
  ```

  Verify status:

  ```bash
  DATABASE_URL={supabase-direct-url} npx prisma migrate status
  # Expected: "Database schema is up to date" — all 46 migrations applied
  ```

  Verify PostgREST can see all key tables:

  ```bash
  curl -s "https://{ref}.supabase.co/rest/v1/tasks?limit=1" \
    -H "apikey: {anon}" \
    -H "Authorization: Bearer {anon}"
  # Expected: [] (empty array, NOT a PGRST205 schema cache error)

  curl -s "https://{ref}.supabase.co/rest/v1/archetypes?limit=1" \
    -H "apikey: {anon}" \
    -H "Authorization: Bearer {anon}"
  # Expected: [] or seeded rows
  ```

  Optional seed for initial archetypes + tenants:

  ```bash
  DATABASE_URL={supabase-direct-url} pnpm db:seed
  ```

- [ ] 12. End-to-end smoke test in production cloud

  Trigger a complete task lifecycle through the cloud stack. Use `real-estate-motivation-bot-2` (simplest employee, `approval_required: false`, completes in ~60-90s).

  ```bash
  # 1. Trigger via cloud gateway
  TASK_RESPONSE=$(curl -s -X POST \
    "https://{render-url}/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
    -H "X-Admin-Key: $ADMIN_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{}')
  echo $TASK_RESPONSE
  TASK_ID=$(echo $TASK_RESPONSE | node -e "const d=require('/dev/stdin').toString();console.log(JSON.parse(d).task_id)")

  # 2. Poll until Done (check every 15s, up to 120s)
  for i in {1..8}; do
    sleep 15
    STATUS=$(curl -s "https://{render-url}/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" \
      -H "X-Admin-Key: $ADMIN_API_KEY" | node -e "const d=require('/dev/stdin').toString();console.log(JSON.parse(d).status)")
    echo "Status: $STATUS"
    [[ "$STATUS" == "Done" ]] && break
  done

  # 3. Assert Done
  [[ "$STATUS" == "Done" ]] && echo "✅ PASS" || echo "❌ FAIL: stuck at $STATUS"
  ```

  Also verify:
  - Inngest Cloud dashboard shows lifecycle function ran with all steps completed
  - Fly.io machine was created and auto-destroyed (`fly machines list -a ai-employee-workers` shows empty after completion)
  - Dashboard accessible: `curl -s https://{render-url}/dashboard/ | grep -c 'root'` returns 1

  If stuck, diagnose with:
  - Render logs: Render dashboard → Logs tab
  - Inngest Cloud: Runs tab → find the run → inspect each step
  - Fly.io machine logs: `fly logs -a ai-employee-workers`

- [ ] 13. Notify completion
  ```bash
  tsx scripts/telegram-notify.ts "✅ Cloud deployment complete — all tasks done. Platform is live at https://{render-url}. Come back to review."
  ```

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read this plan end-to-end. For each Must Have: verify implementation exists (read file or curl endpoint). For each Must NOT Have: search codebase for forbidden patterns. Check all 12 implementation tasks are done.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run` + `pnpm lint`. Review all changed files for: hardcoded secrets, `as any`, empty catches, commented-out code. Check Dockerfile.gateway for best practices.
      Output: `Build [PASS/FAIL] | Tests [N/N] | Lint [PASS/FAIL] | VERDICT: APPROVE/REJECT`

- [ ] F3. **Real QA** — `unspecified-high`
      Verify from clean state: gateway health check, Inngest functions registered, task lifecycle completes end-to-end, dashboard loads. Save evidence.
      Output: `Health [PASS/FAIL] | Inngest [5/5 fns] | E2E [PASS/FAIL] | Dashboard [PASS/FAIL] | VERDICT: APPROVE/REJECT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Compare each task's spec vs actual diff. Verify 1:1 — everything in spec was built, nothing beyond scope was added. Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/issues] | VERDICT: APPROVE/REJECT`
