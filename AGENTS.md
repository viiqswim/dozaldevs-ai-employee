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

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools (claude, opencode, etc.) in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)
