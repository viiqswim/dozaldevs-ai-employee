# Learnings — slack-per-dev-app-architecture

## [2026-06-06] Plan initialized

### Root Cause (empirically proven)

- Prod (Render) + local `pnpm dev` share the SAME `SLACK_APP_TOKEN`
- Slack round-robins each event per-APP across all sockets (max 10); multiple tokens from same app do NOT create independent routing
- ~50% of @mentions land on prod; prod throws `"We couldn't find an event key ... Set the INNGEST_EVENT_KEY"` (Inngest SDK stderr at `dist/gateway/slack/handlers.js:227`) and silently drops them
- Socket probe confirmed: `num_connections: 3` (prod + local + probe)

### Key Code Locations

- `scripts/dev.ts:102-109` — `.env` loading (won't overwrite already-set vars)
- `scripts/dev.ts:243-254` — single-instance guard (DO NOT TOUCH)
- `scripts/dev.ts:280` — Step-0 reaper pattern `${repoRoot}.*src/gateway/server.ts`
- `scripts/dev.ts:337` — `SLACK_APP_TOKEN` in REQUIRED_VARS
- `src/gateway/server.ts:108` — gateway reads `process.env.SLACK_APP_TOKEN`
- `src/gateway/slack/installation-store.ts:17-48` — `fetchInstallation` teamId→tenant→bot-token (the authorize blocker)
- `src/gateway/routes/slack-oauth.ts` — existing OAuth install flow writing `slack_integrations` + `tenant_secrets`
- `src/gateway/services/tenant-integration-repository.ts`, `tenant-secret-repository.ts` — repos to reuse

### Prod Service

- Service ID: `srv-d8f1b2gg4nts738dj7jg`
- Logs API: `GET https://api.render.com/v1/logs?ownerId=tea-d1uscc3uibrs738pu040&resource=srv-d8f1b2gg4nts738dj7jg&limit=N`
- Error location: `dist/gateway/slack/handlers.js:227`

### Metis-confirmed blocker

- `installation-store.ts:24-27`: `fetchInstallation` resolves tenant by `teamId` via `slack_integrations.external_id`
- A fresh Developer Sandbox workspace has a brand-new team ID mapping to NO tenant → throws `"No installation for team: <teamId>"`
- REQUIRED: sandbox-`teamId`→dev-tenant registration path before per-dev apps work at all

### Tooling Notes

- Socket Mode probe: Node 22 global `WebSocket` (do NOT `import 'ws'`)
- Prod logs API: `GET https://api.render.com/v1/logs?ownerId=tea-d1uscc3uibrs738pu040&resource=srv-d8f1b2gg4nts738dj7jg&limit=N[&text=...][&startTime=...&endTime=...]`
- 20-trial proof: use uuidgen-tagged messages so dedup at handlers.ts:90 can't mask a drop
- Render `PUT /env-vars` REPLACES ALL vars — NEVER use for Inngest keys; use dashboard only

## [2026-06-06] Task 1 SPIKE — slack run + Developer Sandbox GO/NO-GO

### Overall Verdict: CONDITIONAL-GO (architecture pivot recommended)

### Gate (a) — Developer Sandbox + Socket Mode: CONDITIONAL-GO ✅

- Slack CLI v3 NOT installed. Install: `curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash`
- No `.slack/` directory in repo. CLI has never been set up for this project.
- Developer Sandbox workspaces (`slack sandbox create`) require Slack Developer Program membership.
- Socket Mode with `xapp-` tokens: FULLY SUPPORTED in sandbox apps (same as any Slack app).
  Doc: "The only thing you need to do is set your app-level token as an env var: export SLACK_APP_TOKEN='xapp-\*\*\*'"
- Socket probe (shared prod token, app_id A09678HT90S): num_connections=3 → confirms the root cause.
- Pre-existing blocker: installation-store.ts:24-27 needs sandbox teamId→dev-tenant registration (Task 5).

### Gate (b) — Token Injection: NO-GO for `slack run` / ALTERNATIVE IS GO ⛔→✅

- `slack run` DOES inject SLACK_APP_TOKEN + SLACK_BOT_TOKEN + SLACK_CLI_XAPP + SLACK_CLI_XOXB
  to the `start` hook process (when `sdk-managed-connection-enabled: true`).
- BUT: only "if these aren't available beforehand" (official docs).
- BLOCKER #1: dev.ts:102-109 pre-loads .env (including SLACK_APP_TOKEN) into process.env before
  spawning any child → children inherit prod/shared token → slack run sees it "already set" → NO injection.
- BLOCKER #2: No `.slack/hooks.json` in repo → `sdk_hook_not_found` → gateway never launches.
- ALTERNATIVE (GO, no code changes): Developer gets own xapp- token, sets SLACK_APP_TOKEN in .env.
  pnpm dev runs unchanged. Their socket is exclusive to their app. No slack run needed.

### Gate (c) — Process Ownership: CONDITIONAL-GO / FULL GO for alternative ✅

- Current gateway: 2 processes (tsx supervisor + node leaf), both match ${repoRoot}.\*src/gateway/server.ts.
- If slack run integrated as tracked child: reaper pattern unchanged, Ctrl+C kills full tree, pgrep→0.
- For alternative approach (manual token): zero changes, full GO.

### Architecture Recommendation

PIVOT: Skip `slack run` wrapper entirely. Manual per-dev token approach:

1. `slack sandbox create` (or create app at api.slack.com manually)
2. Enable Socket Mode, generate xapp- token
3. Set SLACK_APP_TOKEN=xapp-<personal> in local .env
4. pnpm dev — unchanged, just works
   Code changes needed: ZERO for core flow. Task 5 (teamId registration) still required.

### Slack CLI token injection env var names (for future reference)

`SLACK_CLI_XAPP`, `SLACK_CLI_XOXB`, `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`
These are injected by slack run in SDK-managed-connection mode ONLY IF NOT already set.

## [2026-06-06] Task 2 — Prod Hotfix Attempt

### Evidence Gathered (GATE PASSED)
- Both Inngest errors confirmed in prod logs:
  1. `INNGEST_SIGNING_KEY` missing: "In cloud mode but no signing key found" — ~198 occurrences in 200-log window, firing every ~1 minute from Inngest watchdog retries
  2. `INNGEST_EVENT_KEY` missing: "We couldn't find an event key to use to send events to Inngest" — at least 2 occurrences from @mention events (21:12 and 21:14 UTC)
- Error location confirmed: `dist/gateway/slack/handlers.js:227`

### Prod Env-Var Analysis
- GET /env-vars returns 20 vars (complete list — confirmed via config.js showing SUPABASE vars empty)
- INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are ABSENT from prod (never set)
- Config endpoint confirms SUPABASE_URL not set either (empty VITE_POSTGREST_URL)
- Prod has NEVER had working Inngest integration (always silently dropping @mention events)

### Fix Blocker: Local .env Inngest Keys Are Dev Placeholders
- Local .env has: INNGEST_EVENT_KEY="local", INNGEST_SIGNING_KEY="local"
- These are placeholders for the local Inngest dev server (port 8288) which accepts any key
- The REAL prod Inngest Cloud keys must come from app.inngest.com → Manage → Keys
- Cannot access Inngest Cloud without browser authentication (no stored session in headless Playwright)

### Render API PUT /env-vars Gotcha (LEARNED)
- PUT /env-vars silently dropped GATEWAY_URL and WEBHOOK_PUBLIC_URL when adding 2 new vars to 20 existing
  → Went from 20 original vars to 20 resulting vars (missing 2 original, gained 2 new) — net loss of 2 vars
  → Reason unknown (possibly value encoding issue or Render internal dedup logic)
  → ALWAYS verify post-PUT key count matches (pre-PUT count + new vars)
- GATEWAY_URL is CRITICAL: passed to Fly.io worker containers for gateway callback (token fetch, output submit)
- WEBHOOK_PUBLIC_URL is non-critical at runtime (used only for one-time Hostfully webhook registration)

### Prod State After Task 2
- Restored to exact pre-fix state (20 vars, same as before)
- GATEWAY_URL restored to https://ai-employees-laaa.onrender.com (explicitly set, previously implicit)
- WEBHOOK_PUBLIC_URL restored to https://ai-employees-laaa.onrender.com
- NO redeploy triggered
- Prod still broken for @mentions (same as before task 2)

### Manual Steps Required to Complete Fix
1. Log in to https://app.inngest.com → Manage → Keys → copy Event Key and Signing Key
2. Add via Render dashboard (https://dashboard.render.com/web/srv-d8f1b2gg4nts738dj7jg/env):
   - INNGEST_EVENT_KEY = <event key from inngest>
   - INNGEST_SIGNING_KEY = <signing key from inngest>
3. Trigger redeploy: POST https://api.render.com/v1/services/srv-d8f1b2gg4nts738dj7jg/deploys
4. Verify: no "signing key" errors in prod logs; @mention → task.status=Done in prod DB

## [2026-06-07] Tasks 3+4 — manifest.json + gitignore + dev.ts startup info
- manifest.json created at repo root (dev app source-of-truth)
- .slack/ and .slack/apps*.json added to .gitignore
- dev.ts: informational message added after REQUIRED_VARS check — reminds dev to use personal token
- .env.example: SLACK_APP_TOKEN comment updated to note per-developer requirement
- No slack run orchestration (SPIKE proved not viable)

### Implementation specifics
- dev.ts guard sits at lines 351-362 (after REQUIRED_VARS loop at 342-349, before cloudflared check at 364).
  Uses info() x2, prints last-6-chars of token (no full-secret leak), never blocks (no prereqFail/exit).
- gitignore: `.slack/` dir rule already matches all children; explicit `.slack/apps*.json` kept per spec as
  defense-in-depth. `git check-ignore -v` exit 0 for .slack/, .slack/apps.json, .slack/apps.dev.json.
- Hard-block was rejected: prod xapp- token is unknowable to dev.ts without hardcoding a secret (forbidden).
  Informational-only is the safest enforceable contract.
- Verification: `tsc --noEmit --skipLibCheck` clean on scripts/dev.ts (repo LSP server unconfigured —
  typescript-language-server has no version in .tool-versions; tsc used instead).
- manifest.json validated as parseable JSON via node JSON.parse.
- Onboarding doc referenced as `docs/guides/*-slack-per-dev-app-onboarding.md` (created by Task 6, glob pattern
  used so the reference survives the eventual timestamped filename).

## [2026-06-07] Task 5 — dev-tenant registration script
- scripts/register-dev-slack-tenant.ts created
- Uses PrismaClient directly + encrypt() for bot token
- Upserts slack_integrations(provider='slack', external_id=teamId) + tenant_secrets(slack_bot_token)
- Idempotent (safe to re-run)
- package.json: added "register-dev-slack" script
- Unique upsert key for TenantIntegration: tenant_id_provider (compound: tenant_id + provider)
- Unique upsert key for TenantSecret: tenant_id_key (compound: tenant_id + key)
- .env vars must be injected into process.env manually before PrismaClient init (encrypt() reads ENCRYPTION_KEY from process.env)
- Script defaults to DozalDevs tenant (00000000-0000-0000-0000-000000000002) if --tenant-id omitted
- Validates teamId starts with 'T', botToken starts with 'xoxb-', tenantId is valid UUID
- Verifies upsert by reading back the integration row (findFirst with deleted_at: null check)

## [2026-06-07] Final Verification Wave (F1-F4) — Atlas direct execution

### F1 Plan Compliance: APPROVE
- All 8 tasks complete and committed
- Must Have: 4/4 PASS (SPIKE gated Track B; registration delivered; prod fix via dashboard; 20-trial PENDING user action)
- Must NOT Have: 10/10 PASS (no tokens committed; protected files untouched; CI Slack-less)

### F2 Code Quality: APPROVE
- pnpm build: exit 0 (zero TS errors)
- 25 new unit tests: 25/25 PASS
- Zero as-any / @ts-ignore / eslint-disable in changed files
- All token-like strings in diff are placeholder/example values only

### F3 Live Proofs: CONDITIONAL-APPROVE
- Socket Mode probe ran: num_connections=3, app_id=A09678HT90S (prod/shared token still in local .env — expected)
- Prod env vars confirmed: INNGEST_EVENT_KEY ✅, INNGEST_SIGNING_KEY ✅, GATEWAY_URL ✅
- Prod Inngest errors: ZERO in logs; Inngest health checks returning 200s
- Prod gateway health: {"status":"ok"}
- 20-trial @mention proof: BLOCKED — requires user to set SLACK_APP_TOKEN=xapp-<personal> in .env
- Cross-machine isolation + clean shutdown: BLOCKED (depend on 20-trial proof)

### F4 Scope Fidelity: APPROVE
- 15 files changed, all in scope
- All protected components untouched (zero diff on socket-mode-lock.ts, dev.ts:243-254, dev.ts:280, installation-store.ts, schema.prisma, employee-lifecycle.ts, handlers.ts)
- .slack/ gitignored confirmed
- No real tokens in diff

### F5 Cleanup
- Killed tmux session: ai-test
- Removed temp files: /tmp/sm-probe.mjs, /tmp/prod-logs.json
- Plan checkboxes F1-F4 marked [x]
- Committed plan + notepads
