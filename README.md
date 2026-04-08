# AI Employee Platform

Automated engineering workflow: receives Jira tickets via webhook and delivers pull requests on GitHub, fully orchestrated by an AI coding agent.

## Quick Start

**Prerequisites**: Node ≥20, pnpm, Docker (with Compose plugin)

1. `git clone <repo> && pnpm install`
2. `pnpm setup` — sets up local Supabase, runs migrations, builds Docker image
3. `pnpm dev:start` — starts Gateway (:3000) and Inngest (:8288)
4. `pnpm trigger-task` — sends a mock Jira webhook and monitors to completion
5. `pnpm verify:e2e --task-id <uuid>` — verify all 12 integration checks pass

## How It Works

1. **Jira webhook** arrives at `POST /webhooks/jira` (Gateway, port 3000)
2. Gateway creates a `tasks` row (status `Ready`) and fires `engineering/task.received` to Inngest
3. **Lifecycle function** transitions to `Executing` and spawns a Docker worker container
4. **Worker container** clones the repo, starts OpenCode (AI coding agent), generates code, runs validation, and opens a PR on GitHub
5. Worker writes `Submitting` to Supabase; lifecycle polls, detects it, and marks task `Done`

Full architecture: [docs/2026-04-01-1726-system-overview.md](docs/2026-04-01-1726-system-overview.md)

## Registering Projects

Projects can be registered at runtime via the admin REST API. All endpoints require an `X-Admin-Key` header matching `ADMIN_API_KEY`.

| Method   | Path                  | Description            |
| -------- | --------------------- | ---------------------- |
| `POST`   | `/admin/projects`     | Register a new project |
| `GET`    | `/admin/projects`     | List all projects      |
| `GET`    | `/admin/projects/:id` | Get a single project   |
| `PATCH`  | `/admin/projects/:id` | Update a project       |
| `DELETE` | `/admin/projects/:id` | Delete a project       |

**Create a project:**

```bash
curl -X POST http://localhost:3000/admin/projects \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d '{
    "jira_project_key": "MYPROJ",
    "repo_url": "https://github.com/your-org/your-repo",
    "name": "My Project",
    "tooling_config": {
      "install": "npm ci"
    }
  }'
```

`tooling_config.install` is optional. It defaults to `pnpm install --frozen-lockfile` if not specified. Set it to match your repo's package manager.

`GITHUB_TOKEN` must have push access to every registered repo. It's a single global token shared across all projects.

`DELETE /admin/projects/:id` returns `409 Conflict` if the project has tasks in `Ready`, `Executing`, or `Submitting` state.

## Scripts

| Script            | Command                            | Purpose                                                                 |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `setup.ts`        | `pnpm setup`                       | One-time setup: Docker Compose services, migrations, seed, Docker image |
| `dev-start.ts`    | `pnpm dev:start`                   | Start all local services                                                |
| `trigger-task.ts` | `pnpm trigger-task`                | Send mock webhook and monitor                                           |
| `verify-e2e.ts`   | `pnpm verify:e2e --task-id <uuid>` | 12-point E2E verification                                               |

## Project Structure

```
src/
├── gateway/     # Fastify server — receives Jira/GitHub webhooks
├── inngest/     # Lifecycle, watchdog, redispatch functions
├── workers/     # Docker container code — AI agent execution
└── lib/         # Shared: logger, fly-client, github-client, retry
prisma/          # Schema (16 tables), migrations, seed
scripts/         # zx TypeScript scripts (setup, trigger, verify)
docker/          # Supabase self-hosted Docker Compose (replaces `supabase start` — see note below)
docs/            # Architecture and phase documentation
```

## Infrastructure Note: Docker Compose vs `supabase start`

This project uses the [official Supabase self-hosted Docker Compose](docker/docker-compose.yml) instead of the Supabase CLI (`supabase start`). The reason: the CLI hardcodes `Database: "postgres"` in its Go source and cannot be overridden — PostgREST always connects to `postgres`, regardless of `DATABASE_URL`. Since worker containers read task data via PostgREST, this would create a split-brain with `ai_employee` as the app database. The Docker Compose uses `${POSTGRES_DB}` throughout, so setting `POSTGRES_DB=ai_employee` in `docker/.env` makes all services natively use the right database.

**You do not need the Supabase CLI installed.** `pnpm setup` and `pnpm dev:start` use `docker compose` directly.

## Environment Variables

Copy `.env.example` to `.env` and fill in your API keys. Full reference in [docs/2026-04-01-1726-system-overview.md](docs/2026-04-01-1726-system-overview.md).

**Minimum for local E2E:**

- `OPENROUTER_API_KEY` — AI code generation
- `GITHUB_TOKEN` — PR creation on test repo (must have push access to all registered repos)
- `JIRA_WEBHOOK_SECRET` — webhook validation (use `test-secret` locally)
- `ADMIN_API_KEY` — admin API authentication (auto-generated by `pnpm setup`; generate manually with `openssl rand -hex 32`)

## Test Repo

The built-in E2E uses [`viiqswim/ai-employee-test-target`](https://github.com/viiqswim/ai-employee-test-target) — a minimal TypeScript project. Conventions the AI agent expects:

- Package manager: **pnpm** (not npm/yarn)
- Scripts: `build` (tsc), `test` (vitest), `lint` (tsc --noEmit)

## Documentation

| Document                                                         | Description                                   |
| ---------------------------------------------------------------- | --------------------------------------------- |
| [System Overview](docs/2026-04-01-1726-system-overview.md)       | Complete architecture, data flow, local setup |
| [Phase 8: E2E](docs/2026-04-01-1655-phase8-e2e.md)               | MVP validation and verification               |
| [Phase 7: Resilience](docs/2026-04-01-0114-phase7-resilience.md) | Watchdog, redispatch, error handling          |
| [All phase docs](docs/)                                          | Phase 1-7 implementation details              |
| [Troubleshooting](docs/2026-04-01-2110-troubleshooting.md)       | Common E2E failures with symptoms and fixes   |

## Testing

```bash
pnpm test     # Run Vitest suite (515+ tests)
pnpm lint     # ESLint
pnpm build    # TypeScript compile
```

Two pre-existing test failures are expected: `container-boot.test.ts` (requires Docker socket) and `inngest-serve.test.ts` (function count check).
