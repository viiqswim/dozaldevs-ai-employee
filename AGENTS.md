# AI Employee Platform — Agent Guide

> Keep this file concise and current. Only include information that helps agents make correct decisions. For architectural details, read the vision doc on demand — don't duplicate it here. This file is loaded into every LLM call — every token here costs tokens on every turn.

## Approved LLM Models

**CRITICAL CONSTRAINT — NEVER VIOLATE:**

Only TWO LLM models are approved for use in this codebase. Using any other model is a bug.

| Model            | ID                           | Purpose                                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| MiniMax M2.7     | `minimax/minimax-m2.7`       | Primary execution model — all employee work, code generation, summaries                     |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` | Verification/judge only — plan verification, intent classification, feedback acknowledgment |

**Forbidden models (any reference = bug):** `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, `openai/gpt-4o-mini`, or any other model not listed above.

This applies to: production code, seed data, default fallbacks, environment variable examples, and test fixtures. No exceptions.

## Deprecated Components

The following components are deprecated. Do NOT modify, do NOT add features, do NOT fix bugs in these files unless the user explicitly instructs you to work on them:

| Component                       | File                                              | Reason                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering task lifecycle      | `src/inngest/lifecycle.ts`                        | Engineering employee is on hold. All active development targets the unified employee lifecycle in `src/inngest/employee-lifecycle.ts`.                                                                        |
| Engineering task redispatch     | `src/inngest/redispatch.ts`                       | Paired with the deprecated engineering lifecycle.                                                                                                                                                             |
| Generic worker harness          | `src/workers/generic-harness.mts`                 | Replaced by the OpenCode-based harness (`src/workers/opencode-harness.mts`). Source file has been deleted; stale compiled artifacts may remain in `dist/`.                                                    |
| Tool registry                   | `src/workers/tools/registry.ts`                   | Part of the generic harness. Replaced by shell scripts at `src/worker-tools/`.                                                                                                                                |
| Engineering watchdog cron       | `src/inngest/watchdog.ts`                         | Cron (`*/10 * * * *`) that detects stuck engineering tasks. On hold with the engineering employee; still registered, do not modify.                                                                           |
| Engineering worker orchestrator | `src/workers/orchestrate.mts`                     | Engineering-only worker — ~1100-line orchestrator for planning, wave execution, fix loops, and PR creation. On hold; do not modify.                                                                           |
| Engineering worker launcher     | `src/workers/entrypoint.sh`                       | Default Dockerfile CMD; shells out to `orchestrate.mts`. Engineering only — on hold, do not modify.                                                                                                           |
| Engineering worker libraries    | `src/workers/lib/` (except `postgrest-client.ts`) | 30 utilities exclusively supporting `orchestrate.mts` (wave executor, PR manager, session manager, etc.). On hold — do not modify. `postgrest-client.ts` is shared with `opencode-harness.mts` and is active. |

## Platform Vision

A single-responsibility AI Employee Platform — deploys autonomous AI agents ("digital employees"), each with one job. Every employee follows the same lifecycle, uses the same infrastructure (Inngest orchestration, Supabase state, Fly.io runtime), and is defined by a declarative archetype config.

What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds).

Full architecture, employee roadmap, archetype schema, lifecycle states, event routing, operating modes, integration map, and multi-tenancy design: `docs/2026-04-14-0104-full-system-vision.md`

## Current Implementation

One employee is active; one is deprecated and on hold:

1. **Engineering** ⚠️ **DEPRECATED — ON HOLD** — receives Jira tickets via webhook, spawns a Docker/Fly.io worker running OpenCode, delivers a GitHub pull request. Do not add features or fix bugs in engineering-specific files. See Deprecated Components table.
2. **Summarizer (Papi Chulo)** — runs daily via cron, reads configured Slack channels, generates a digest with an LLM, posts to a target channel for human approval, then publishes on approval.

**Stack**: TypeScript · Express · Inngest · Prisma · Docker · Supabase (PostgREST)

**What's built**: Event Gateway (Express), Inngest lifecycle functions, OpenCode-based worker (Docker/Fly.io), Supabase state management, Admin API (tenant-scoped `/admin/tenants` projects, trigger + status endpoints), Slack integration (Socket Mode + interactive buttons).

**What's deferred**: Triage agent, review agent, knowledge base (pgvector).

## OpenCode Worker (All Employees)

All non-deprecated employees use the OpenCode-based harness on Fly.io:

- **Harness**: `src/workers/opencode-harness.mts` — reads archetype from DB, starts OpenCode session, injects natural language `instructions` + available tools, monitors until completion
- **Shell tools**: `src/worker-tools/slack/` — pre-installed in Docker image at `/tools/slack/`. Usage:
  - `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "C123" --text "msg" --task-id "uuid" > /tmp/approval-message.json`
    Output: JSON `{"ts":"...","channel":"..."}`. When `--task-id` is provided, auto-generates blocks: header, summary text, divider, task ID context block, Approve/Reject buttons.
  - `tsx /tools/slack/read-channels.ts --channels "C123,C456" --lookback-hours 24`
    Output: JSON `{"channels":[...]}`. Reads channel history with thread replies; filters out bot summary posts.
- **Lifecycle**: `src/inngest/employee-lifecycle.ts` — universal lifecycle with all states (Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done). States auto-pass where unambiguous (Triaging, AwaitingInput, Validating). Terminal states: `Failed` (machine poll timeout or unhandled error), `Cancelled` (reject action or 24h approval timeout).
- **Inngest functions**: `employee/universal-lifecycle`, `employee/feedback-handler`, `employee/feedback-responder`, `employee/mention-handler`, `trigger/daily-summarizer`, `trigger/feedback-summarizer`
- **Output contract**: OpenCode writes `/tmp/summary.txt` (deliverable content) and `/tmp/approval-message.json` (Slack message metadata). Absence of BOTH is a hard failure; either file alone is sufficient to proceed. See `docs/2026-04-20-1314-current-system-state.md` for the full 15-step harness flow.
- **SIGTERM handling**: Harness registers a `SIGTERM` handler that PATCHes the task to `Failed` on termination — explains why tasks show as Failed after machine preemption.
- **Feedback context**: Harness optionally prepends `FEEDBACK_CONTEXT` (env var injected by the lifecycle from stored feedback) to the system prompt, allowing historical feedback to influence future runs.

**Cron timezone — CRITICAL**: The daily-summarizer cron `0 8 * * 1-5` fires at **8am UTC**, not 8am local time. Inngest has no timezone config on this function. The archetype's `trigger_sources.timezone: "America/Chicago"` is stored as documentation metadata only — the Inngest runtime never reads it. Do not use it to infer the actual trigger time.

**Adding a new employee**:

1. Seed a new `archetypes` record with `role_name`, `system_prompt`, `instructions` (natural language), `model` (`minimax/minimax-m2.7`), `deliverable_type`, `runtime: 'opencode'`
2. If shell tools needed, add scripts to `src/worker-tools/{service}/` (compiled into Docker image at `/tools/{service}/`)
3. Add a trigger (cron or webhook) in `src/inngest/triggers/`

**Approval gate**: Controlled per-archetype via `risk_model.approval_required`. When `false`, the lifecycle short-circuits from `Submitting` directly to `Done`, skipping `Reviewing → Approved → Delivering` entirely. For the approval-required path, the lifecycle posts the approved summary directly to the publish channel — no separate delivery machine is spawned.

**Summarizer archetype slug**: `daily-summarizer` (seeded in `prisma/seed.ts`). Duplicate prevention: `external_id: summary-{YYYY-MM-DD}`.

**OpenCode harness CMD** (Fly.io dispatch): `["node", "/app/dist/workers/opencode-harness.mjs"]`

## Feedback Pipeline

Thread replies and @mentions on summary messages are captured and acknowledged:

- **Thread reply** → Slack Bolt fires `employee/feedback.received` → stored in `feedback` table → `employee/feedback.stored` emitted → `feedback-responder` generates a Haiku acknowledgment and posts it in-thread.
- **@mention** → Slack Bolt fires `employee/mention.received` → `mention-handler` classifies intent (feedback / teaching / question / task) → stores if relevant → responds in thread.
- **Weekly cron** (`0 0 * * 0`, Sunday midnight UTC) → `feedback-summarizer` reads recent feedback, generates a digest with Haiku, writes to `knowledge_bases`.

## Tenants

Two tenants are seeded in `prisma/seed.ts`. Each requires its own Slack OAuth connection to operate:

| ID                                     | Name      | Slug      | Slack Workspace                                    |
| -------------------------------------- | --------- | --------- | -------------------------------------------------- |
| `00000000-0000-0000-0000-000000000002` | DozalDevs | dozaldevs | `T0601SMSVEU` (Dozal Inc.) — must OAuth separately |
| `00000000-0000-0000-0000-000000000003` | VLRE      | vlre      | `vlreworkspace.slack.com` (team: `T06KFDGLHS6`)    |

**`SLACK_BOT_TOKEN` in `.env` is the VLRE workspace bot token only.** It cannot access DozalDevs channels. Never store it as the DozalDevs tenant secret.

## Slack Interactive Buttons — Socket Mode (CRITICAL — READ BEFORE DEBUGGING)

**The Papi chulo Slack app uses Socket Mode. This has been confirmed multiple times.**

- **NEVER ask the user to configure an Interactivity Request URL** in the Slack API dashboard. Socket Mode is enabled on the app, which means "You won't need to specify a Request URL" — Slack says this explicitly in the UI.
- `SLACK_APP_TOKEN=xapp-...` is already set in `.env`. The gateway (`src/gateway/server.ts` lines 68–93) detects this and automatically starts Bolt in Socket Mode with a WebSocket connection to Slack.
- Confirmed working: gateway logs show `"Slack Bolt — Socket Mode connected"` on every startup.
- If a button click does not reach the gateway, it is a **transient WebSocket drop**, NOT a URL configuration problem. Do NOT ask the user to change any Slack app settings.
- **Processing state**: approve/reject handlers call `(ack as any)({ replace_original: true, blocks: [...] })` — embeds `⏳ Processing approval...` / `⏳ Processing rejection...` directly in the Socket Mode ack envelope, eliminating any ⚠️ flash. Do not remove this ack pattern.
- **Idempotency**: Before firing `employee/approval.received`, handlers check task status === `'Reviewing'` via PostgREST. If already processed, updates the Slack message to "already processed" instead. Events are deduped by Inngest ID `employee-approval-{taskId}`.

**Manual approval fallback** (use when button click doesn't work):

```bash
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"<SLACK_USER_ID>","userName":"Victor"}}'
```

**Debugging button click failures:**

1. Check gateway logs for `"Slack Bolt — Socket Mode connected"` — if missing, `SLACK_APP_TOKEN` is unset or invalid
2. Check for `slack_bolt_authorization_error` — if present with a team ID, that team's `tenant_integrations` row is missing (run OAuth)
3. If Socket Mode is connected and no error appears, it was a transient drop — retry by clicking again or use the manual fallback above

## Slack Message Standards

**REQUIRED on every message sent to Slack — no exceptions:**

1. **Task ID context block** — every message must include a trailing `context` block with the task ID as small gray metadata:
   ```json
   { "type": "context", "elements": [{ "type": "mrkdwn", "text": "Task `<taskId>`" }] }
   ```
2. **User mention for actions** — whenever a human takes an action (approve, reject, or any future action state), display the actor using the Slack `<@userId>` mrkdwn syntax so it renders as `@Victor Dozal`. Never use the raw Slack username string (e.g. `victor192`). The `userId` (e.g. `U05V0CTJLF6`) is available from `actionBody.user.id` in handlers and from `approvalEvent.data.userId` in the lifecycle.

**Reference implementation**: `src/inngest/employee-lifecycle.ts` (`handle-approval-result` step) and `src/worker-tools/slack/post-message.ts` (`buildApprovalBlocks`).

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

VLRE alternative: run `pnpm tsx scripts/setup-two-tenants.ts` to migrate the legacy `SLACK_BOT_TOKEN` env var into VLRE's tenant secret without OAuth.

## Per-Tenant Slack Token Architecture

`loadTenantEnv()` (`src/gateway/services/tenant-env-loader.ts`) builds the Fly.io machine environment:

- `tenant_secrets.slack_bot_token` → `SLACK_BOT_TOKEN` in machine env
- `tenant.config.summary.channel_ids` → `DAILY_SUMMARY_CHANNELS`
- `tenant.config.summary.target_channel` → `SUMMARY_TARGET_CHANNEL`
- `tenant.config.summary.publish_channel` → `SUMMARY_PUBLISH_CHANNEL`

**Fly.io app-level secrets are NOT inherited by spawned machines.** Only what `loadTenantEnv` returns (+ explicit `TASK_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) reaches the worker.

### Summarizer failure diagnostic

| Symptom                                                 | Cause                                                       | Fix                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Task → Reviewing in <30s, deliverable content empty     | `SLACK_BOT_TOKEN` missing from machine env                  | Re-run OAuth for that tenant                            |
| `No installation for team: T...` in gateway logs        | `tenant_integrations` row missing for that Slack workspace  | Re-run OAuth for that tenant                            |
| `Out of memory: Killed process (.opencode)` in Fly logs | OpenCode OOM on small VM                                    | Increase `SUMMARIZER_VM_SIZE`                           |
| `channel_not_found` from Slack API                      | Bot token belongs to a different workspace than the channel | Wrong token stored — re-run OAuth for correct workspace |

Fly.io worker logs: `fly logs -a ai-employee-workers` (NOT `ai-employee-summarizer` — that app does not exist).

## Summarizer — Per-Tenant Channel Configuration

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

## Hostfully Testing

Use these VLRE resources for all Hostfully-related testing:

| Resource     | ID / URL                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Thread       | `https://platform.hostfully.com/app/#/inbox?threadUid=2f18249a-9523-4acd-a512-20ff06d5c3fa&leadUid=37f5f58f-d308-42bf-8ed3-f0c2d70f16fb` |
| Thread UID   | `2f18249a-9523-4acd-a512-20ff06d5c3fa`                                                                                                   |
| Lead UID     | `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`                                                                                                   |
| Property     | `https://platform.hostfully.com/app/#/property/c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                     |
| Property UID | `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                                                                   |

## Admin API

Two commonly used endpoints for triggering employees and checking status:

- `POST /admin/tenants/:tenantId/employees/:slug/trigger` — creates task, returns 202 + `{ task_id, status_url }`. Add `?dry_run=true` to validate without creating a task.
- `GET /admin/tenants/:tenantId/tasks/:id` — check task status (tenant-scoped, 404 on cross-tenant access)

Auth: `X-Admin-Key: $ADMIN_API_KEY` header on both endpoints. `source_system` for manual tasks: `'manual'` (existing values: `'jira'`, `'cron'`).

The admin API has 18 total routes covering tenant CRUD (create, list, get, update, soft-delete, restore), per-tenant secrets management (list keys, set, delete), tenant config (get, deep-merge update), project CRUD, employee trigger, and task status. Full route table: `docs/2026-04-20-1314-current-system-state.md` § Gateway and Routes.

```bash
TENANT=00000000-0000-0000-0000-000000000002
# Trigger
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
# Dry-run
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger?dry_run=true" -H "Content-Type: application/json" -d '{}'
```

## Commands

| Action           | Command                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| First-time setup | `pnpm setup`                                                                                                |
| Start services   | `pnpm dev:start`                                                                                            |
| Run tests        | `pnpm test -- --run`                                                                                        |
| Setup test DB    | `pnpm test:db:setup`                                                                                        |
| Lint             | `pnpm lint`                                                                                                 |
| Build            | `pnpm build`                                                                                                |
| Trigger E2E task | `pnpm trigger-task`                                                                                         |
| Verify E2E       | `pnpm verify:e2e --task-id <uuid>`                                                                          |
| Register project | `curl -X POST http://localhost:7700/admin/tenants/:tenantId/projects -H "X-Admin-Key: $ADMIN_API_KEY" -d …` |

Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin).

## Pre-existing Test Failures

Do NOT attempt to fix these — they are unrelated to any recent changes:

- `container-boot.test.ts` — requires Docker socket; always fails in CI without Docker
- `inngest-serve.test.ts` — function count check expects an old count; stale test
- `tests/inngest/integration.test.ts` — uses Fastify-specific API (`inject`, `ready`, `close`) that no longer exists after Express migration; stale test

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma`
- **REST API**: Supabase PostgREST on `http://localhost:54321`

### Test Database

- **Name**: `ai_employee_test` (separate from dev `ai_employee`)
- **Setup**: `pnpm test:db:setup` (one-time, idempotent — creates DB, runs migrations + seed)
- **How it works**: `vitest.config.ts` overrides `DATABASE_URL` → `globalSetup` runs `prisma migrate deploy` + seed → all tests use test DB automatically
- **Safety guard**: `globalSetup` throws if `DATABASE_URL` doesn't contain `ai_employee_test`
- **After DB reset**: Run `pnpm test:db:setup` to recreate the test database

## Infrastructure

Uses **Docker Compose** (`docker/docker-compose.yml`) instead of `supabase start`. The Supabase CLI hardcodes `database: postgres` in its Go source — PostgREST would connect to the wrong database. Docker Compose uses `${POSTGRES_DB}` throughout, so `POSTGRES_DB=ai_employee` in `docker/.env` makes all services use the right database.

**CRITICAL — Rebuild after every worker change**: Any modification to files under `src/workers/` or `src/worker-tools/` requires rebuilding the Docker image before the fix takes effect. Gateway and Inngest code (`src/gateway/`, `src/inngest/`) do NOT require a rebuild.

```bash
docker build -t ai-employee-worker:latest . && pnpm trigger-task
```

For hybrid Fly.io mode (local Supabase + remote Fly.io worker), also run `pnpm fly:image`. Hybrid mode requires a Cloudflare Tunnel exposing local PostgREST. Set `USE_FLY_HYBRID=1` and `TUNNEL_URL=<cloudflare-url>` when dispatching.

## Project Structure

```
src/
├── gateway/      # Express HTTP server — webhook receiver + Inngest function host
│   ├── routes/       # All HTTP route handlers (10 files)
│   ├── slack/        # Bolt event/action handlers + OAuth installation store
│   ├── middleware/   # Admin auth middleware
│   ├── validation/   # Zod schemas + HMAC signature verification
│   ├── services/     # Business logic (10 files): dispatcher, task creation, project registry, tenant/secret repos
│   └── inngest/      # Inngest client factory, event sender, serve registration
├── inngest/      # Durable workflow functions: lifecycle, watchdog, redispatch
│   ├── triggers/     # Cron trigger functions (daily-summarizer, feedback-summarizer)
│   └── lib/          # Shared: create-task-and-dispatch, poll-completion
├── workers/      # Docker container code — runs inside the worker machine
├── worker-tools/ # Shell scripts compiled into Docker image (Slack tools, etc.)
└── lib/          # Shared (12 files): fly-client, github-client, slack-client, jira-client, call-llm (model enforcement + $50/day cost circuit breaker), encryption (AES-256-GCM for tenant secrets), logger, retry, errors, tunnel-client, repo-url, agent-version
prisma/           # Schema (19 models), 18 migrations, seed
scripts/          # TypeScript scripts run via tsx (setup, trigger, verify)
docker/           # Supabase self-hosted Docker Compose
docs/             # Architecture vision, phase docs, troubleshooting
tests/            # 102 test files (Vitest)
```

## Key Conventions

- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`
- Employee behavior is config-driven (archetype pattern), not hardcoded orchestration logic
- **Multi-tenancy is mandatory** — every table, registry, catalog, and query must be scoped by `tenant_id`. When adding any new data structure, ask: "Is this tenant-isolated?" If not, it's a bug.
- **Zod v4 UUID validation**: `z.string().uuid()` enforces RFC 4122 version/variant bits and may reject certain UUIDs. Use the loose `UUID_REGEX` in `src/gateway/validation/schemas.ts` for any route param that accepts tenant or task UUIDs.

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E:

```
OPENROUTER_API_KEY   # AI code generation (OpenCode via OpenRouter)
GITHUB_TOKEN         # git push + gh pr create (must have push access to all registered repos)
JIRA_WEBHOOK_SECRET  # HMAC-SHA256 validation (use "test-secret" locally)
ADMIN_API_KEY        # Admin API key for all /admin/* endpoints (auto-generated by pnpm setup)
ENCRYPTION_KEY       # AES-256-GCM key for tenant secrets (validated at gateway startup)
```

Summarizer-specific vars (required for Papi Chulo):

```
SLACK_SIGNING_SECRET       # Verifies Slack interaction webhooks (HMAC-SHA256)
FLY_WORKER_APP             # Fly.io app for all worker machines (currently: ai-employee-workers)
SUMMARIZER_VM_SIZE         # VM size for summarizer machines (default: shared-cpu-1x)
```

See `.env.example` for the full list.

## Long-Running Commands

**NEVER** run commands expected to take >30 seconds with a blocking shell call. Launch in a detached tmux session with output piped to a log file. Poll every 30–60 seconds.

Commands that ALWAYS require tmux: `pnpm trigger-task`, `pnpm dev:start`, `docker build`, `fly logs`, `cloudflared tunnel`.

```bash
# Launch
tmux new-session -d -s <name> -x 220 -y 50
tmux send-keys -t <name> \
  "cd /path/to/repo && COMMAND 2>&1 | tee /tmp/<name>.log; echo 'EXIT_CODE:'$? >> /tmp/<name>.log" \
  Enter

# Poll
tail -30 /tmp/<name>.log
grep "EXIT_CODE:" /tmp/<name>.log && echo "DONE" || echo "RUNNING"
```

Session naming: `ai-e2e`, `ai-dev`, `ai-build`. Log files: `/tmp/ai-e2e.log`, etc.

## Known Issues

### 1. ngrok free tier doesn't work with Fly.io

Cloudflare Tunnel is the permanent solution for hybrid mode.

**PostgREST tunnel** (for Fly.io workers → local Supabase): `cloudflared tunnel --url http://localhost:54321` → copy the `trycloudflare.com` URL → set `TUNNEL_URL=<url>` in `.env`. This tunnel can be a quick (random-URL) tunnel since `TUNNEL_URL` is set at dispatch time.

### 2. Slack OAuth redirect URI requires a stable public URL

The Slack app's redirect URI must be pre-registered and cannot be a `localhost` URL. Use the named Cloudflare Tunnel (`local-ai-employee.dozaldevs.com`) — it never changes on restart.

**Named tunnel is already configured** at `~/.cloudflared/ai-employee-local.yml` → `tunnel: e160ac6d-2d7d-47c4-a552-b13700947d29`.

Start it: `cloudflared tunnel --config ~/.cloudflared/ai-employee-local.yml run`

**For new contributors**: create your own subdomain (e.g. `local-ai-employee-yourname.dozaldevs.com`):

```bash
cloudflared tunnel login
cloudflared tunnel create ai-employee-yourname
cloudflared tunnel route dns ai-employee-yourname local-ai-employee-yourname.dozaldevs.com
```

Then ask the repo owner to add `https://local-ai-employee-yourname.dozaldevs.com/slack/oauth_callback` to the Slack app's Redirect URLs. Set `SLACK_REDIRECT_BASE_URL=https://local-ai-employee-yourname.dozaldevs.com` in your `.env`.

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools (claude, opencode, etc.) in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)

## Prometheus Planning — Telegram Notifications (MANDATORY)

These rules apply to any agent acting as Prometheus (plan writer) or Atlas (plan executor) in this repo.

Send notifications via the CLI wrapper (uses `src/lib/telegram-client.ts` with retry):

```bash
tsx scripts/telegram-notify.ts "Your message here"
```

### Rule 1 — Prometheus: notify when plan is ready

Immediately after writing a plan file to `.sisyphus/plans/`, send:

```
📋 Plan ready: <plan-name>

Come back to start the work.
```

Do this before presenting the plan to the user.

### Rule 2 — Prometheus: final task in every plan

Every plan's TODOs section must include a final task after the Final Verification Wave:

```markdown
- [ ] **N. Notify completion** — Send Telegram notification: plan `<plan-name>` complete, all tasks done, come back to review results.
```

The executing agent fulfills this task by running the script above with an appropriate message.

### Rule 3 — Atlas fallback: always notify on plan completion

When Atlas finishes executing a plan (all tasks marked `[x]`), it MUST send a Telegram notification as its absolute last action — regardless of whether the plan already contained a notification task. Read `plan_name` from `.sisyphus/boulder.json`.

```bash
PLAN=$(node -e "console.log(require('.sisyphus/boulder.json').plan_name)" 2>/dev/null || echo "plan")
tsx scripts/telegram-notify.ts "✅ ${PLAN} complete — All tasks done. Come back to review results."
```

If the plan already had a notification task that fired, the user receives two notifications — this is intentional.

## Reference Documents

Read these on demand when you need deeper context — do not load preemptively.

| Document                                                | When to Read                                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/2026-04-14-0104-full-system-vision.md`            | Architecture, archetypes, lifecycle, event routing, operating modes, multi-tenancy                                                                                                                         |
| `docs/2026-03-22-2317-ai-employee-architecture.md`      | Original detailed architecture (data model, security, scaling, cost estimates)                                                                                                                             |
| `docs/2026-04-14-0057-worker-post-redesign-overview.md` | Worker redesign scope (before/after, files added/removed)                                                                                                                                                  |
| `.sisyphus/plans/worker-agent-delegation-redesign.md`   | Active redesign plan (14 tasks across 4 waves)                                                                                                                                                             |
| `docs/2026-04-16-0310-manual-employee-trigger.md`       | Manual employee trigger API — endpoints, curl examples, how it works                                                                                                                                       |
| `docs/2026-04-16-1655-multi-tenancy-guide.md`           | Multi-tenancy: provisioning tenants, Slack OAuth, per-tenant secrets, verification                                                                                                                         |
| `docs/2026-04-20-1314-current-system-state.md`          | Verified ground-truth snapshot: full lifecycle, harness flow (15 steps), all gateway routes (18 admin + webhooks + OAuth), DB schema (19 models), shell tool CLI syntax, Docker services, shared libraries |
