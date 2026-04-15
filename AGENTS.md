# AI Employee Platform — Agent Guide

> Keep this file concise and current. Only include information that helps agents make correct decisions. For architectural details, read the vision doc on demand — don't duplicate it here. This file is loaded into every LLM call — every token here costs tokens on every turn.

## Platform Vision

A single-responsibility AI Employee Platform — deploys autonomous AI agents ("digital employees"), each with one job. Every employee follows the same lifecycle, uses the same infrastructure (Inngest orchestration, Supabase state, Fly.io runtime), and is defined by a declarative archetype config.

What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds).

Full architecture, employee roadmap, archetype schema, lifecycle states, event routing, operating modes, integration map, and multi-tenancy design: `docs/2026-04-14-0104-full-system-vision.md`

## Current Implementation

The Engineering department is live: receives Jira tickets via webhook, spawns a Docker/Fly.io worker running OpenCode (AI coding agent), delivers a GitHub pull request.

**Stack**: TypeScript · Fastify · Inngest · Prisma · Docker · Supabase (PostgREST)

**What's built**: Event Gateway (Fastify), Inngest lifecycle functions, OpenCode-based worker (Docker/Fly.io), Supabase state management, Admin API (`/admin/projects`), Slack integration.

**What's deferred**: Triage agent, review agent, knowledge base (pgvector), non-engineering employees.

## Commands

| Action           | Command                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| First-time setup | `pnpm setup`                                                                              |
| Start services   | `pnpm dev:start`                                                                          |
| Run tests        | `pnpm test -- --run`                                                                      |
| Lint             | `pnpm lint`                                                                               |
| Build            | `pnpm build`                                                                              |
| Trigger E2E task | `pnpm trigger-task`                                                                       |
| Verify E2E       | `pnpm verify:e2e --task-id <uuid>`                                                        |
| Register project | `curl -X POST http://localhost:3000/admin/projects -H "X-Admin-Key: $ADMIN_API_KEY" -d …` |

Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin).

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma`
- **REST API**: Supabase PostgREST on `http://localhost:54321`

## Infrastructure

Uses **Docker Compose** (`docker/docker-compose.yml`) instead of `supabase start`. The Supabase CLI hardcodes `database: postgres` in its Go source — PostgREST would connect to the wrong database. Docker Compose uses `${POSTGRES_DB}` throughout, so `POSTGRES_DB=ai_employee` in `docker/.env` makes all services use the right database.

**CRITICAL — Rebuild after every worker change**: Any modification to files under `src/workers/` requires rebuilding the Docker image before the fix takes effect. Gateway and Inngest code (`src/gateway/`, `src/inngest/`) do NOT require a rebuild.

```bash
docker build -t ai-employee-worker:latest . && pnpm trigger-task
```

For hybrid Fly.io mode (local Supabase + remote Fly.io worker), also run `pnpm fly:image`. Hybrid mode requires a Cloudflare Tunnel exposing local PostgREST. Set `USE_FLY_HYBRID=1` and `TUNNEL_URL=<cloudflare-url>` when dispatching.

## Project Structure

```
src/
├── gateway/     # Fastify HTTP server — webhook receiver + Inngest function host
├── inngest/     # Durable workflow functions: lifecycle, watchdog, redispatch
├── workers/     # Docker container code — runs inside the worker machine
└── lib/         # Shared: fly-client, github-client, slack-client, jira-client, logger, retry, errors
prisma/          # Schema, migrations, seed
scripts/         # TypeScript scripts run via tsx (setup, trigger, verify)
docker/          # Supabase self-hosted Docker Compose
docs/            # Architecture vision, phase docs, troubleshooting
```

## Key Conventions

- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`
- Employee behavior is config-driven (archetype pattern), not hardcoded orchestration logic
- **Multi-tenancy is mandatory** — every table, registry, catalog, and query must be scoped by `tenant_id`. When adding any new data structure, ask: "Is this tenant-isolated?" If not, it's a bug.

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E:

```
OPENROUTER_API_KEY   # AI code generation (OpenCode via OpenRouter)
GITHUB_TOKEN         # git push + gh pr create (must have push access to all registered repos)
JIRA_WEBHOOK_SECRET  # HMAC-SHA256 validation (use "test-secret" locally)
ADMIN_API_KEY        # Admin API key for /admin/projects (auto-generated by pnpm setup)
```

See `.env.example` for the full list.

## Long-Running Commands

**NEVER** run commands expected to take >30 seconds with a blocking shell call. Launch in a detached tmux session with output piped to a log file. Poll every 30–60 seconds.

Commands that ALWAYS require tmux: `pnpm trigger-task`, `pnpm dev:start`, `docker build`, `fly logs`, `cloudflared tunnel`, `ngrok http`.

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

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools (claude, opencode, etc.) in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)

## Reference Documents

Read these on demand when you need deeper context — do not load preemptively.

| Document                                                | When to Read                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/2026-04-14-0104-full-system-vision.md`            | Architecture, archetypes, lifecycle, event routing, operating modes, multi-tenancy |
| `docs/2026-03-22-2317-ai-employee-architecture.md`      | Original detailed architecture (data model, security, scaling, cost estimates)     |
| `docs/2026-04-14-0057-worker-post-redesign-overview.md` | Worker redesign scope (before/after, files added/removed)                          |
| `.sisyphus/plans/worker-agent-delegation-redesign.md`   | Active redesign plan (14 tasks across 4 waves)                                     |
