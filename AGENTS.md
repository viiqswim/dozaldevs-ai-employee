# AI Employee Platform — Agent Guide

## Project Overview

One-line: Automated Jira-to-PR pipeline — receives Jira tickets via webhook, spawns a Docker worker running OpenCode (AI coding agent), delivers a GitHub PR.

Stack: TypeScript · Fastify · Inngest · Prisma · Docker · Supabase (PostgREST)

## Commands

| Action           | Command                            |
| ---------------- | ---------------------------------- |
| First-time setup | `pnpm setup`                       |
| Start services   | `pnpm dev:start`                   |
| Run tests        | `pnpm test -- --run`               |
| Lint             | `pnpm lint`                        |
| Build            | `pnpm build`                       |
| Trigger E2E task | `pnpm trigger-task`                |
| Verify E2E       | `pnpm verify:e2e --task-id <uuid>` |

Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin).

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma` (16 tables)
- **REST API**: Supabase PostgREST on `http://localhost:54321`

## Infrastructure

Uses **Docker Compose** (`docker/docker-compose.yml`) instead of `supabase start`. The Supabase CLI hardcodes `database: postgres` in its Go source — PostgREST would connect to the wrong database. Docker Compose uses `${POSTGRES_DB}` throughout, so `POSTGRES_DB=ai_employee` in `docker/.env` makes all services use the right database.

Worker Docker image must be built before any task can run:

```bash
docker build -t ai-employee-worker .
```

**CRITICAL — Rebuild after every worker change**: Any modification to files under `src/workers/` requires rebuilding the image before the fix takes effect in E2E runs. The gateway and Inngest code (`src/gateway/`, `src/inngest/`) do NOT require a rebuild — they run directly from source. After applying a fix, always:

```bash
docker build -t ai-employee-worker:latest . && pnpm trigger-task
```

For **hybrid mode** (USE_FLY_HYBRID), also run `pnpm fly:image` to push the updated image to Fly.io registry.

## Hybrid Fly.io Mode (USE_FLY_HYBRID)

### Purpose

Use hybrid mode when you want to test real Fly.io machine dispatch without migrating Supabase or Inngest to the cloud. The gateway, Inngest Dev Server, and Supabase all run locally; only the worker container runs on a real Fly.io machine. A tunnel exposes local PostgREST to the Fly machine.

### Prerequisites

- Fly.io account with `FLY_API_TOKEN` set in `.env`
- Fly.io worker app `ai-employee-workers` created: run `pnpm fly:setup`
- Worker image pushed to registry: run `pnpm fly:image`
- A tunnel tool installed — **Cloudflare Tunnel is recommended** (ngrok free-tier blocks Fly.io IPs):
  - Cloudflare: `brew install cloudflared` (no account needed for quick tunnels)
  - ngrok (paid): `brew install ngrok` + `ngrok config add-authtoken <your-token>`

### Setup Steps

#### Option A: Cloudflare Tunnel (recommended — free, works with Fly.io)

1. `pnpm dev:start` — start local Supabase, gateway, and Inngest Dev Server
2. In a separate terminal: `cloudflared tunnel --url http://localhost:54321` — note the `https://xxx.trycloudflare.com` URL printed to stderr
3. Set the tunnel URL: `export TUNNEL_URL=https://xxx.trycloudflare.com`
4. In another terminal: `USE_FLY_HYBRID=1 pnpm trigger-task` — dispatch task to real Fly machine

#### Option B: ngrok (paid plans only — free tier blocks Fly.io IPs)

1. `pnpm dev:start` — start local Supabase, gateway, and Inngest Dev Server
2. In a separate terminal: `ngrok http 54321` — expose PostgREST to the internet
3. In another terminal: `USE_FLY_HYBRID=1 pnpm trigger-task` — dispatch task to real Fly machine

### Workflow Notes

- Worker code changes require BOTH `docker build -t ai-employee-worker:latest .` (for local Docker mode) AND `pnpm fly:image` (for hybrid mode)
- If `TUNNEL_URL` env var is set, it is used directly (bypasses ngrok agent API) — use this for Cloudflare Tunnel
- If `TUNNEL_URL` is not set, the ngrok agent API at `NGROK_AGENT_URL` (default: `http://localhost:4040`) is queried at dispatch time
- Tunnel URL changes on every restart — that's fine, hybrid mode reads it fresh each dispatch

### Debugging

```bash
fly logs --app ai-employee-workers                              # View Fly machine logs
fly machines list --app ai-employee-workers                    # Verify machine cleanup
fly machines exec <machine-id> --app ai-employee-workers env   # Check env passed to machine
```

Inspect ngrok request log: `http://localhost:4040/inspect/http`

### Known Limitations

- Hybrid mode requires a tunnel running locally — failed pre-flight aborts dispatch and sets task to `AwaitingInput`
- **ngrok free-tier is NOT compatible** — Fly.io cloud egress IPs are blocked by ngrok's free infrastructure; use Cloudflare Tunnel or a paid ngrok plan
- Polling ceiling is 60 minutes (configurable via `FLY_HYBRID_POLL_MAX`)
- Worker's completion event to Inngest will fail (no `INNGEST_BASE_URL` passed) — this is intentional; completion is detected via Supabase polling instead
- The existing default Fly.io mode has a known `auto_destroy` bug (machines may persist) — hybrid mode does NOT have this bug (uses `restart: { policy: "no" }`)

## Project Structure

```
src/
├── gateway/     # Fastify HTTP server — Jira/GitHub webhooks, Inngest wiring
├── inngest/     # lifecycle.ts, watchdog.ts, redispatch.ts
├── workers/     # Docker container: entrypoint.sh, orchestrate.mts, validation pipeline
└── lib/         # logger, fly-client, github-client, slack-client, jira-client, retry, errors
prisma/          # schema.prisma (16 tables), migrations, seed.ts
scripts/         # setup.ts, dev-start.ts, trigger-task.ts, verify-e2e.ts (all tsx)
docker/          # Supabase self-hosted Docker Compose
```

## Key Conventions

- Task status flow: `NULL → Ready → Executing → Submitting → Done`
- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E:

```
OPENROUTER_API_KEY   # AI code generation (OpenCode via OpenRouter)
GITHUB_TOKEN         # git push + gh pr create on test repo
JIRA_WEBHOOK_SECRET  # HMAC-SHA256 validation (use "test-secret" locally)
```

See `.env.example` for the full list (database, Inngest, Fly.io, Slack, cost gate).

## Known Test Failures (pre-existing, not regressions)

- `tests/workers/container-boot.test.ts` — requires live Docker socket; skipped without it
- `tests/gateway/inngest-serve.test.ts` — function count mismatch with test expectation

Intermittently fail in parallel runs (run serially if needed):

- `tests/gateway/migration.test.ts`
- `tests/gateway/project-lookup.test.ts`

## Long-Running Command Protocol (MANDATORY)

**NEVER** run a command expected to take >30 seconds with a blocking shell call. Doing so
makes the process unmonitorable — you cannot observe progress, detect hangs, or take corrective
action. This project has many such commands (`pnpm trigger-task`, `docker build`, `fly logs`,
`pnpm dev:start`, `cloudflared tunnel`, etc.).

### Rule

> Every command that can run for more than 30 seconds MUST be launched in a detached tmux
> session with output piped to a log file. Poll the log file every 30–60 seconds. Never block
> waiting for completion.

### Pattern (use verbatim)

**Step 1 — Launch** (use `mcp_interactive_bash` with tmux):

```bash
# Create a named detached session
tmux new-session -d -s <session-name> -x 220 -y 50

# Start the command; append EXIT_CODE marker so you can detect completion
tmux send-keys -t <session-name> \
  "cd /path/to/repo && COMMAND 2>&1 | tee /tmp/<session-name>.log; echo 'EXIT_CODE:'$? >> /tmp/<session-name>.log" \
  Enter
```

**Step 2 — Poll every 30–60 s** (use `mcp_bash`):

```bash
# Check last output lines
tail -30 /tmp/<session-name>.log

# Detect completion (EXIT_CODE line appears when command finishes)
grep "EXIT_CODE:" /tmp/<session-name>.log && echo "FINISHED" || echo "STILL RUNNING"

# Alternatively, capture the live tmux pane
tmux capture-pane -t <session-name> -p | tail -20
```

**Step 3 — React if stuck**:

```bash
# Send Ctrl+C to the running process
tmux send-keys -t <session-name> C-c

# Kill the session entirely
tmux kill-session -t <session-name>
```

### Commands that ALWAYS require this pattern

| Command                          | Reason                                     |
| -------------------------------- | ------------------------------------------ |
| `pnpm trigger-task`              | Polls until task Done — can take 45–90 min |
| `pnpm dev:start`                 | Blocks forever by design                   |
| `docker build / buildx`          | 5–15 min cross-compile                     |
| `fly logs` (without `--no-tail`) | Streams forever                            |
| `cloudflared tunnel --url ...`   | Persistent daemon                          |
| `ngrok http ...`                 | Persistent daemon                          |

### Naming convention for sessions and logs

Use `<project>-<task>` format, e.g.:

- Session: `ai-e2e`, `ai-dev`, `ai-build`
- Log: `/tmp/ai-e2e.log`, `/tmp/ai-dev.log`

### Example: running `pnpm trigger-task` for T13

```bash
# Launch
tmux new-session -d -s ai-e2e -x 220 -y 50
tmux send-keys -t ai-e2e \
  "cd /Users/victordozal/repos/dozal-devs/ai-employee && TUNNEL_URL=$(cat .sisyphus/evidence/task-13-ngrok-url.txt) USE_FLY_HYBRID=1 pnpm trigger-task -- --key TEST-300 2>&1 | tee /tmp/ai-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-e2e.log" \
  Enter

# Poll 60 s later
tail -30 /tmp/ai-e2e.log
grep "EXIT_CODE:" /tmp/ai-e2e.log && echo "DONE" || echo "RUNNING"
```

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools (claude, opencode, etc.) in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)
