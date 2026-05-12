# AI Employee Platform

A multi-tenant AI Employee Platform. Deploys autonomous AI agents ("digital employees"), each with a single job, triggered by webhooks or schedules, with human-in-the-loop approval gates.

## Quick Start

**Prerequisites**: Node ≥20, pnpm, Docker (with Compose plugin)

1. `git clone <repo> && pnpm install`
2. `pnpm setup` — sets up local Supabase, runs migrations, builds Docker image
3. `pnpm dev` — starts Gateway (:7700), Inngest (:8288), and Cloudflare tunnel (auto-detected)
4. Configure tenant secrets via admin API (Slack OAuth, Hostfully credentials) — see [Multi-Tenancy Guide](docs/2026-04-16-1655-multi-tenancy-guide.md)

## Local Development (Docker)

All projects in this workspace share a single PostgreSQL container, so you can run multiple projects simultaneously without port conflicts or database collisions.

### First-Time Setup

```bash
pnpm docker:start
```

This runs `scripts/ensure-infra.sh` under the hood, which is 3-state idempotent: safe to run any number of times.

### Docker Commands

| Command              | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| `pnpm docker:start`  | Start shared infra + this project's Auth and Kong containers    |
| `pnpm docker:stop`   | Stop this project's Auth/Kong (shared PostgreSQL keeps running) |
| `pnpm docker:reset`  | Destroy and recreate this project's database only               |
| `pnpm docker:status` | Show all containers on the `supabase-shared` network            |

### Port Assignments (ai-employee)

| Service       | Port  | URL                      |
| ------------- | ----- | ------------------------ |
| Kong (API)    | 54331 | `http://localhost:54331` |
| Auth (GoTrue) | 9002  | internal only            |
| PostgreSQL    | 54322 | shared with all projects |
| Mailpit SMTP  | 54324 | shared with all projects |
| Mailpit UI    | 54325 | `http://localhost:54325` |

Database name: `ai_employee`

Full port registry for all projects: [PORT_REGISTRY.md](https://github.com/victordozal/nexus-stack/blob/main/PORT_REGISTRY.md) in nexus-stack

## How It Works

The platform follows a single lifecycle pattern for all employees:

1. **Trigger** — A webhook or cron fires an event (e.g. Hostfully `NEW_INBOX_MESSAGE`, daily schedule)
2. **Task created** — Gateway creates a `tasks` row and emits `employee/task.dispatched` to Inngest
3. **Universal lifecycle** — Inngest transitions through states: `Received → Ready → Executing → Submitting → Reviewing`
4. **Worker container** — Fly.io or local Docker runs OpenCode with the archetype's `instructions` and available shell tools
5. **Approval gate** — Worker posts a Slack card; PM approves or rejects
6. **Delivery** — On approval, the deliverable is sent (Slack publish, Hostfully reply, etc.)

### Active employees

| Employee                    | Trigger                               | Deliverable                                                   |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| **Summarizer (Papi Chulo)** | Daily cron (8am UTC, weekdays)        | Slack digest of configured channels, posted after PM approval |
| **Guest-Messaging (VLRE)**  | Hostfully `NEW_INBOX_MESSAGE` webhook | AI-drafted guest reply, sent via Hostfully after PM approval  |

> **Engineering employee** — receives Jira tickets, delivers GitHub PRs. **On hold / deprecated** — do not add features.

Full architecture: [docs/2026-04-14-0104-full-system-vision.md](docs/2026-04-14-0104-full-system-vision.md)

## Registering Projects

> **Engineering employee only (deprecated/on hold).** The active employees (Summarizer, Guest-Messaging) do not use project registration.

Projects can be registered at runtime via the admin REST API. All endpoints require an `X-Admin-Key` header matching `ADMIN_API_KEY`.

| Method   | Path                                               | Description                     |
| -------- | -------------------------------------------------- | ------------------------------- |
| `POST`   | `/admin/tenants/:tenantId/projects`                | Register a new project          |
| `GET`    | `/admin/tenants/:tenantId/projects`                | List all projects               |
| `GET`    | `/admin/tenants/:tenantId/projects/:id`            | Get a single project            |
| `PATCH`  | `/admin/tenants/:tenantId/projects/:id`            | Update a project                |
| `DELETE` | `/admin/tenants/:tenantId/projects/:id`            | Delete a project                |
| `POST`   | `/admin/tenants/:tenantId/employees/:slug/trigger` | Manually trigger an AI employee |
| `GET`    | `/admin/tenants/:tenantId/tasks/:id`               | Get task status                 |

**Create a project:**

```bash
curl -X POST http://localhost:7700/admin/tenants/$TENANT_ID/projects \
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

`DELETE /admin/tenants/:tenantId/projects/:id` returns `409 Conflict` if the project has tasks in `Ready`, `Executing`, or `Submitting` state.

## Scripts

| Script                 | Command                                | Purpose                                                                                                                                                             |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup.ts`             | `pnpm setup`                           | One-time setup: Docker Compose services, migrations, seed, Docker image                                                                                             |
| `dev.ts`               | `pnpm dev`                             | Full local stack: Docker Compose + Inngest + Gateway + auto-detected Cloudflare tunnel + Docker worker image build. Flags: `--reset`, `--skip-build`, `--no-tunnel` |
| `dev-e2e.ts`           | `pnpm dev:e2e`                         | Start services + build Docker image + trigger task + run E2E verification (full end-to-end run)                                                                     |
| `register-project.ts`  | `pnpm register-project`                | Interactive wizard to register a new project via the admin API                                                                                                      |
| `trigger-task.ts`      | `pnpm trigger-task`                    | Send mock webhook and monitor                                                                                                                                       |
| `verify-e2e.ts`        | `pnpm verify:e2e --task-id <uuid>`     | 12-point E2E verification                                                                                                                                           |
| `setup-two-tenants.ts` | `pnpm setup:two-tenants`               | Multi-tenant setup: provisions DozalDevs + VLRE tenants with archetypes                                                                                             |
| `telegram-notify.ts`   | `tsx scripts/telegram-notify.ts "msg"` | Send developer Telegram push notification                                                                                                                           |

## Project Structure

```
src/
├── gateway/      # Express server — webhook receiver (Hostfully, Jira) + Slack Bolt + Inngest host
├── inngest/      # Universal employee lifecycle, interaction handler, rule extractor, cron triggers
├── workers/      # Docker container code — AI agent execution (OpenCode harness)
├── worker-tools/ # Shell tools for employees (Slack, Hostfully, locks, KB search, platform reporting)
└── lib/          # Shared utilities: LLM client, Slack/Fly.io/GitHub clients, encryption, logging, retry
prisma/           # Schema, migrations, seed
scripts/          # TypeScript scripts (setup, trigger, verify, dev tools)
docker/           # Docker Compose infrastructure (shared PostgreSQL, project-specific services)
docs/             # Architecture, planning, snapshots, guides
```

## Infrastructure Note: Docker Compose vs `supabase start`

This project uses the [official Supabase self-hosted Docker Compose](docker/docker-compose.yml) instead of the Supabase CLI (`supabase start`). The reason: the CLI hardcodes `Database: "postgres"` in its Go source and cannot be overridden — PostgREST always connects to `postgres`, regardless of `DATABASE_URL`. Since worker containers read task data via PostgREST, this would create a split-brain with `ai_employee` as the app database. The Docker Compose uses `${POSTGRES_DB}` throughout, so setting `POSTGRES_DB=ai_employee` in `docker/.env` makes all services natively use the right database.

**You do not need the Supabase CLI installed.** `pnpm setup` and `pnpm dev` use `docker compose` directly.

## Environment Variables

Copy `.env.example` to `.env` and fill in your API keys.

**Core (all employees):**

- `ADMIN_API_KEY` — admin API authentication (auto-generated by `pnpm setup`)
- `ENCRYPTION_KEY` — AES-256-GCM key for tenant secrets (validated at gateway startup)

**Summarizer (Papi Chulo):**

- `SLACK_APP_TOKEN` — `xapp-...` for Socket Mode WebSocket connection
- `SLACK_SIGNING_SECRET` — verifies Slack interaction webhooks
- `FLY_WORKER_APP` — Fly.io app name for worker machines (currently: `ai-employee-workers`)
- `SUMMARIZER_VM_SIZE` — VM size (default: `shared-cpu-1x`)

**Guest-Messaging (VLRE):**

- Hostfully credentials are stored as **tenant secrets in the database**, not `.env`. See [AGENTS.md](AGENTS.md) for provisioning commands.
- `WEBHOOK_PUBLIC_URL` — public URL for one-time Hostfully webhook registration (legitimate `.env` exception)

**Engineering (deprecated — on hold):**

- `OPENROUTER_API_KEY` — AI code generation
- `GITHUB_TOKEN` — PR creation (must have push access to all registered repos)
- `JIRA_WEBHOOK_SECRET` — webhook validation (use `test-secret` locally)

## Testing Employees Locally

**Summarizer**: Trigger manually via admin API:

```bash
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" \
  -H "Content-Type: application/json" -d '{}'
```

**Guest-Messaging**: Simulate a Hostfully webhook (no auth required):

```bash
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-msg-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
```

Note: `message_uid` must be unique per request. A real unresponded message must exist in Hostfully for the model to return `NEEDS_APPROVAL`.

## Documentation

| Document                                                                       | Description                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Full System Vision](docs/2026-04-14-0104-full-system-vision.md)               | Architecture, archetypes, lifecycle, event routing, multi-tenancy                                                                             |
| [Current System State](docs/snapshots/2026-04-29-2255-current-system-state.md) | Latest verified snapshot: lifecycle, harness flow, all routes, DB schema — includes unified interaction handler and guest messaging full flow |
| [Multi-Tenancy Guide](docs/2026-04-16-1655-multi-tenancy-guide.md)             | Provisioning tenants, Slack OAuth, per-tenant secrets, verification                                                                           |
| [Phase 1 Story Map](docs/planning/2026-04-21-2202-phase1-story-map.md)         | 58 stories across 5 releases — active development roadmap                                                                                     |
| [Product Roadmap](docs/planning/2026-04-21-1813-product-roadmap.md)            | 4-phase product roadmap, design partner strategy                                                                                              |
| [Troubleshooting](docs/2026-04-01-2110-troubleshooting.md)                     | Common failures with symptoms and fixes                                                                                                       |
| [Adding a Shell Tool](docs/2026-05-04-1645-adding-a-shell-tool.md)             | File structure, CLI pattern, mock fixtures, Docker integration for new shell tools                                                            |
| [Local E2E Testing](docs/2026-05-04-2023-local-e2e-testing.md)                 | Testing without real external APIs — mock conventions, fixture structure, env propagation                                                     |

## Testing

```bash
pnpm test     # Run Vitest suite
pnpm lint     # ESLint
pnpm build    # TypeScript compile
```

One pre-existing test failure is expected: `inngest-serve.test.ts` (function count check hardcodes `2` but 9 functions are registered; stale assertion). `container-boot.test.ts` skips all 4 tests when Docker is unavailable (not a failure).
