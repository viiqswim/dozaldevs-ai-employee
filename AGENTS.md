# AI Employee Platform — Agent Guide

> **IMPORTANT — Keep this file current**: Before every commit, verify that this file accurately reflects the current state of the codebase. If your changes affect project structure, commands, conventions, environment variables, infrastructure, or any other section documented here, update this file in the same commit. This is the primary onboarding document for agents working in this repo — stale information here causes compounding errors downstream.

## Platform Vision

A **single-responsibility AI Employee Platform** — deploys autonomous AI agents ("digital employees"), each with one job, that monitor work queues, triage incoming tasks, execute domain-specific work, and submit results for review. Departments are organizational groupings, not architectural concepts.

Every employee follows the same five-step workflow:

1. **Trigger** — An event arrives (webhook, cron, employee event, manual command)
2. **Triage** — The employee analyzes the task, consults a knowledge base, and asks clarifying questions
3. **Execute** — The employee performs the work using domain-specific tools on a Fly.io machine
4. **Review** — Output is validated against acceptance criteria (auto or human)
5. **Deliver** — The result is published/merged/filed and stakeholders are notified

What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds). The orchestration layer (Inngest), state management (Supabase), runtime (Fly.io), and observability are shared.

### Employee Roadmap

| Employee                              | Department  | Runtime | Status                       |
| ------------------------------------- | ----------- | ------- | ---------------------------- |
| **Engineering - Coder**               | Engineering | Fly.io  | **Active — MVP operational** |
| Engineering - Code Reviewer           | Engineering | Fly.io  | Designed, not built          |
| Operations - Slack Daily Digest       | Operations  | Fly.io  | Designed (recommended next)  |
| Operations - Jira Daily Status        | Operations  | Fly.io  | Designed                     |
| Operations - Pull Request Summary Bot | Operations  | Fly.io  | Designed                     |
| Operations - Repo Health Checker      | Operations  | Fly.io  | Designed                     |
| Marketing - Campaign Optimizer        | Marketing   | Fly.io  | Planned                      |

All employees use Fly.io machines as their runtime — no exceptions. Inngest is the orchestrator and scheduler, NOT a runtime.

### Archetype Framework

Each employee is defined by a declarative **archetype config** — the platform reads it and knows what triggers the employee, what tools it needs, what model to use, what events it emits, and how to evaluate its output:

| Field                  | Purpose                          | Engineering - Coder                                           | Ops - Slack Summarizer                                        |
| ---------------------- | -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `department`           | Organizational grouping          | `engineering`                                                 | `operations`                                                  |
| `role_name`            | What this employee does          | `coder`                                                       | `slack-summarizer`                                            |
| `trigger_sources`      | What starts this employee        | Jira webhook                                                  | Cron (daily 9am)                                              |
| `input_events`         | Events from other employees      | `review.changes_requested`                                    | (none)                                                        |
| `output_events`        | Events this employee emits       | `pull_request.created`, `execution.complete`                  | `summary.posted`                                              |
| `execution_tools`      | Tools available during execution | Git, file editor, test runner                                 | Slack API                                                     |
| `knowledge_base`       | Domain knowledge sources         | pgvector embeddings, task history                             | Channel history, past summaries                               |
| `delivery_target`      | Where results go                 | GitHub pull request                                           | Slack message                                                 |
| `risk_model`           | Review prioritization score      | File-count + critical-path score                              | (none — low-stakes, still reviewed in supervised mode)        |
| `escalation_rules`     | When to involve a human          | database migrations, auth changes                             | (none)                                                        |
| `model_config`         | LLM selection                    | `{primary: "minimax-m2.7", verifier: "haiku-4.5"}`            | `{primary: "minimax-m2.7"}`                                   |
| `runtime_config`       | Fly.io machine settings          | `{vm_size: "performance-2x", max_duration: 90}`               | `{vm_size: "shared-cpu-1x", max_duration: 5}`                 |
| `operating_mode`       | `supervised` or `autonomous`     | `supervised`                                                  | `supervised`                                                  |
| `confidence_threshold` | Autonomous escalation threshold  | `0.8`                                                         | `0.5`                                                         |
| `promotion_criteria`   | Graduation thresholds            | `{min_approval_rate: 0.9, min_consecutive: 10, min_weeks: 4}` | `{min_approval_rate: 0.85, min_consecutive: 5, min_weeks: 2}` |
| `slack_channel`        | Deliverables + feedback channel  | `#engineering-ai`                                             | `#daily-digest`                                               |

Employees collaborate via **event-based pub/sub** — each declares `input_events` and `output_events`, and the platform's event router automatically builds the routing table. Adding a new employee requires zero changes to existing employees.

> **Current state**: The `departments`, `archetypes`, `knowledge_bases`, `risk_models`, `cross_dept_triggers`, and `agent_versions` tables exist in the Prisma schema and are migrated, but are **empty and unused by application code**. All event routing, webhook handling, and cost tracking are currently hardcoded to the Engineering - Coder employee. Activating multi-employee support requires seeding these tables and parameterizing the application code. See `docs/2026-04-14-0104-full-system-vision.md` §"What's Built vs. What's Designed" for the full gap analysis.

### Universal Task Lifecycle

All employees share this state machine — only the transitions' internal behavior changes per employee:

```mermaid
flowchart TD
    START(["Event from trigger source"]):::external
    RECV["Received"]:::service
    TRIAGE["Triaging"]:::service
    AWAIT["AwaitingInput"]:::decision
    STALE(["Stale — 72h timeout"]):::future
    READY["Ready"]:::service
    EXEC["Executing"]:::service
    VALID["Validating"]:::service
    SUBMIT["Submitting"]:::service
    REVIEW["Reviewing"]:::service
    CHANGES["Changes Requested"]:::decision
    APPROVED["Approved"]:::event
    DELIVER["Delivering"]:::service
    DONE(["Done"]):::event
    CANCEL(["Cancelled"]):::future

    START -->|"1. Event arrives"| RECV
    RECV -->|"2. Dispatch to triage"| TRIAGE
    TRIAGE -->|"3. Clarification needed"| AWAIT
    TRIAGE ==>|"4. Task is unambiguous"| READY
    AWAIT -->|"5. Input received"| TRIAGE
    AWAIT -->|"6. No response 72h"| STALE
    READY ==>|"7. Slot available, runtime ready"| EXEC
    EXEC ==>|"8. Work output produced"| VALID
    VALID -->|"9. Validation fails"| EXEC
    VALID ==>|"10. All checks pass"| SUBMIT
    SUBMIT ==>|"11. Submitted for review"| REVIEW
    REVIEW ==>|"12. Review passed"| APPROVED
    REVIEW -->|"13. Changes requested"| CHANGES
    CHANGES -->|"13. Re-execute"| EXEC
    APPROVED ==>|"14. Approval gate cleared"| DELIVER
    DELIVER ==>|"15. Result delivered"| DONE

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
    classDef future fill:#B0B0B0,stroke:#808080,color:#333,stroke-dasharray:5
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
    classDef decision fill:#F8E71C,stroke:#C7B916,color:#333
```

Any state can also transition to `Cancelled`.

**Engineering MVP simplification**: The gateway writes `Ready` directly (triage bypassed), pull requests are reviewed manually (review agent deferred), so the active flow is: `Ready → Executing → Submitting → Done`.

Full lifecycle diagram with all 15 transitions and per-employee state interpretations: `docs/2026-04-14-0104-full-system-vision.md` §"Universal Task Lifecycle"

Full architecture: `docs/2026-03-22-2317-ai-employee-architecture.md`

## Current Implementation (Engineering MVP)

The Engineering department is live: receives Jira tickets via webhook, spawns a Docker/Fly.io worker running OpenCode (AI coding agent), delivers a GitHub pull request.

**Stack**: TypeScript · Fastify · Inngest · Prisma · Docker · Supabase (PostgREST)

### What's Built

- **Event Gateway** (Fastify) — Jira/GitHub webhook receiver + Inngest function host
- **Inngest lifecycle functions** — task orchestration, watchdog, redispatch
- **Execution Agent** — OpenCode-based worker on Docker or Fly.io machines
- **Supabase** (PostgreSQL + PostgREST) — task state, project registry
- **Admin API** — project registration and management (`/admin/projects`)
- **Slack integration** — notifications and escalations

### What's Deferred

- **Triage Agent** — raw Jira payload passed directly to execution (no triage step yet)
- **Review Agent** — Pull requests reviewed manually by developer (no AI review yet)
- **Knowledge Base** — no pgvector embeddings; SQL task history + OpenCode native search only
- **Paid Marketing Department** — archetype designed, not implemented
- **Cross-Department Workflows** — event contract designed, wiring deferred

### Active Redesign

The worker orchestration is being redesigned to delegate planning and execution to the oh-my-opencode agent system (Prometheus for planning, Atlas for execution) instead of custom TypeScript orchestration. Key changes: thin `orchestrate.mts` wrapper replacing ~600 lines, unified `WORKER_RUNTIME` env var replacing two boolean flags, language-agnostic Docker base image, cost-based escalation replacing iteration limits. See `.sisyphus/plans/worker-agent-delegation-redesign.md`.

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
├── gateway/     # Fastify HTTP server — webhook receiver + Inngest function host
├── inngest/     # Durable workflow functions: lifecycle, watchdog, redispatch
├── workers/     # Docker container code — runs inside the worker machine
│                # (entrypoint.sh boot lifecycle → orchestrate.mts → OpenCode sessions)
└── lib/         # Shared: fly-client, github-client, slack-client, jira-client, logger, retry, errors
prisma/          # schema.prisma (16 tables), migrations, seed.ts
scripts/         # setup.ts, dev-start.ts, trigger-task.ts, verify-e2e.ts (all tsx)
docker/          # Supabase self-hosted Docker Compose
docs/            # Architecture vision, phase docs, troubleshooting
```

## Key Conventions

- Task status flow: `NULL → Ready → Executing → Submitting → Done` (MVP simplified from the universal lifecycle)
- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`
- Employee behavior is config-driven (archetype pattern), not hardcoded orchestration logic
- **Multi-tenancy is mandatory** — every table, registry, catalog, and query must be scoped by `tenant_id`. One tenant's employees, events, and data must never be visible to another tenant. When adding any new data structure, always ask: "Is this tenant-isolated?" If not, it's a bug. See `docs/2026-04-14-0104-full-system-vision.md` §"Multi-Tenancy" for the full design rule

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E:

```
OPENROUTER_API_KEY   # AI code generation (OpenCode via OpenRouter)
GITHUB_TOKEN         # git push + gh pr create on test repo (must have push access to all registered repos)
JIRA_WEBHOOK_SECRET  # HMAC-SHA256 validation (use "test-secret" locally)
ADMIN_API_KEY        # Admin API key for /admin/projects endpoints (auto-generated by pnpm setup; generate manually: openssl rand -hex 32)
```

See `.env.example` for the full list (database, Inngest, Fly.io, Slack, cost gate).

`tooling_config.install` is configurable per project via `POST /admin/projects` — defaults to `pnpm install --frozen-lockfile` if not set. Use this to support repos with different package managers (npm, yarn, etc.).

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

### Example: running `pnpm trigger-task`

```bash
# Launch
tmux new-session -d -s ai-e2e -x 220 -y 50
tmux send-keys -t ai-e2e \
  "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm trigger-task 2>&1 | tee /tmp/ai-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-e2e.log" \
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
