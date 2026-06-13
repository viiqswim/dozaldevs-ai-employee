# AI Employee Platform

A multi-tenant AI Employee Platform. Deploys autonomous AI agents ("digital employees"), each with a single job, triggered by webhooks or schedules, with human-in-the-loop approval gates.

## Quick Start

**Prerequisites**: Node ≥20, pnpm, Docker (with Compose plugin)

1. `git clone <repo> && pnpm install`
2. `pnpm setup` — sets up local Supabase, runs migrations, builds Docker image
3. Create a dashboard login — the seed creates tenants but no users. Run `pnpm seed-platform-owner` with your own credentials to bootstrap the first PLATFORM_OWNER (details in AGENTS.md § Bootstrap — first PLATFORM_OWNER):
   ```bash
   BOOTSTRAP_OWNER_EMAIL=you@example.com BOOTSTRAP_OWNER_PASSWORD=YourPassword pnpm seed-platform-owner
   ```
4. `pnpm dev` — starts Gateway (:7700), Inngest (:8288), and Cloudflare tunnel (auto-detected)
5. Configure tenant secrets via admin API (Slack OAuth, Hostfully credentials) — see [Multi-Tenancy Guide](docs/guides/2026-04-16-1655-multi-tenancy-guide.md)

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

| Service            | Port  | URL                      |
| ------------------ | ----- | ------------------------ |
| Kong (API gateway) | 54321 | `http://localhost:54321` |
| PostgreSQL         | 54322 | shared with all projects |
| Studio (dashboard) | 54323 | `http://localhost:54323` |
| Mailpit SMTP       | 54324 | shared with all projects |
| Mailpit UI         | 54325 | `http://localhost:54325` |
| PostgREST / Pooler | 54331 | `http://localhost:54331` |

Database name: `ai_employee`

Full port registry for all projects: [PORT_REGISTRY.md](https://github.com/victordozal/nexus-stack/blob/main/PORT_REGISTRY.md) in nexus-stack

## How It Works

The platform follows a single lifecycle pattern for all employees:

1. **Trigger** — A webhook or cron fires an event (e.g. Hostfully `NEW_INBOX_MESSAGE`, daily schedule)
2. **Task created** — Gateway creates a `tasks` row and emits `employee/task.dispatched` to Inngest
3. **Universal lifecycle** — Inngest transitions through 13 states: `Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done` (terminal: `Failed`, `Cancelled`). When `approval_required: false`, the path short-circuits from `Submitting` directly to `Delivering → Done`.
4. **Worker container** — Fly.io or local Docker runs OpenCode with a compiled AGENTS.md (from archetype fields) and available shell tools
5. **Approval gate** — Worker posts a Slack card; PM approves or rejects
6. **Delivery** — On approval, the deliverable is sent (Slack publish, Hostfully reply, etc.)

### Active employees

| Employee                              | Trigger                               | Deliverable                                                                            |
| ------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| **Daily Summarizer**                  | Daily cron (8am UTC, weekdays)        | Slack digest of configured channels, posted after PM approval                          |
| **Guest-Messaging (VLRE)**            | Hostfully `NEW_INBOX_MESSAGE` webhook | AI-drafted guest reply, sent via Hostfully after PM approval                           |
| **Code-Rotation (VLRE)**              | Manual (admin API)                    | Rotates Sifely lock passcodes for all VLRE properties, posts Slack summary             |
| **Engineer (DozalDevs)**              | Manual (admin API or dashboard)       | Receives coding instructions, implements changes in GitHub repo, creates PR for review |
| **Google Workspace Assistant (VLRE)** | Manual (admin API)                    | AI-drafted Google Workspace task results, posted to Slack after PM approval            |

> **Old orchestrator-based engineering employee** (`src/workers/orchestrate.mts`) — receives Jira tickets, delivers GitHub PRs. **On hold / deprecated** — do not add features. The new archetype-based engineer employee (above) is active.

Full architecture: [docs/architecture/2026-04-14-0104-full-system-vision.md](docs/architecture/2026-04-14-0104-full-system-vision.md)

<details>
<summary><strong>Registering Projects</strong> (deprecated — engineering employee only, on hold)</summary>

> The active employees (Summarizer, Guest-Messaging, Code-Rotation, Engineer, Google Workspace Assistant) do not use project registration. This section applies only to the old orchestrator-based engineering employee (`src/workers/orchestrate.mts`), which is on hold.

Projects can be registered at runtime via the admin REST API. All endpoints require an `Authorization: Bearer $SERVICE_TOKEN` header.

| Method   | Path                                                      | Description                                                                                                  |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POST`   | `/admin/tenants/:tenantId/projects`                       | Register a new project                                                                                       |
| `GET`    | `/admin/tenants/:tenantId/projects`                       | List all projects                                                                                            |
| `GET`    | `/admin/tenants/:tenantId/projects/:id`                   | Get a single project                                                                                         |
| `PATCH`  | `/admin/tenants/:tenantId/projects/:id`                   | Update a project                                                                                             |
| `DELETE` | `/admin/tenants/:tenantId/projects/:id`                   | Delete a project                                                                                             |
| `POST`   | `/admin/tenants/:tenantId/employees/:slug/trigger`        | Manually trigger an AI employee                                                                              |
| `GET`    | `/admin/tenants/:tenantId/tasks/:id`                      | Get task status                                                                                              |
| `GET`    | `/admin/tenants/:tenantId/tasks/:id/logs`                 | Stream task execution logs (SSE, local Docker only)                                                          |
| `GET`    | `/admin/tools`                                            | List all shell tools with metadata                                                                           |
| `GET`    | `/admin/tools/:service/:toolName`                         | Get metadata for a single tool                                                                               |
| `GET`    | `/admin/platform-settings`                                | List all platform settings (key, value, description, is_required)                                            |
| `PATCH`  | `/admin/platform-settings/:key`                           | Update a platform setting value                                                                              |
| `GET`    | `/admin/tenants/:tenantId/github/available-installations` | List GitHub App installations linkable to this tenant                                                        |
| `POST`   | `/admin/tenants/:tenantId/github/link-installation`       | Link an existing GitHub App installation to this tenant                                                      |
| `DELETE` | `/admin/tenants/:tenantId/integrations/github`            | Disconnect GitHub from this tenant (soft-delete, does not affect other tenants)                              |
| `GET`    | `/admin/tenants/:tenantId/composio/connect`               | Initiate Composio OAuth for a toolkit (returns `{ url }` for browser redirect)                               |
| `GET`    | `/admin/tenants/:tenantId/composio/connections`           | List active Composio connections for the tenant                                                              |
| `DELETE` | `/admin/tenants/:tenantId/composio/connections/:toolkit`  | Disconnect a Composio toolkit (soft-delete)                                                                  |
| `GET`    | `/admin/tenants/:tenantId/composio/usage`                 | List Composio tool call audit log grouped by toolkit and date                                                |
| `GET`    | `/admin/tenants/:tenantId/composio/toolkits`              | Browse the Composio app catalog (cursor-paginated; includes `connectable` and `connected` flags per toolkit) |
| `GET`    | `/me`                                                     | Get current user profile (id, email, globalRole, status)                                                     |
| `GET`    | `/me/tenants`                                             | List tenants the current user belongs to (PLATFORM_OWNER sees all)                                           |
| `GET`    | `/admin/tenants/:tenantId/members`                        | List tenant members (requires ADMIN or OWNER role)                                                           |
| `PATCH`  | `/admin/tenants/:tenantId/members/:userId`                | Update a member's tenant role                                                                                |
| `DELETE` | `/admin/tenants/:tenantId/members/:userId`                | Remove a member (soft-delete; blocks removing the last OWNER)                                                |
| `POST`   | `/admin/tenants/:tenantId/invitations`                    | Create an invitation (custom email + token; expires in 7 days)                                               |
| `POST`   | `/admin/tenants/:tenantId/invitations/:id/revoke`         | Revoke a pending invitation                                                                                  |
| `GET`    | `/invitations/:token`                                     | Look up invitation details by token (public; returns email, org name, role, isExistingUser)                  |
| `POST`   | `/invitations/set-password`                               | Set password for a new invitee (public, token-bound, gateway-proxied)                                        |
| `POST`   | `/invitations/accept`                                     | Accept an invitation by token (no auth required)                                                             |
| `POST`   | `/invitations/decline`                                    | Decline an invitation by token (no auth required)                                                            |

**Create a project:**

```bash
curl -X POST http://localhost:7700/admin/tenants/$TENANT_ID/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
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

</details>

## Scripts

| Script                   | Command                                                                                                            | Purpose                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup.ts`               | `pnpm setup`                                                                                                       | One-time setup: Docker Compose services, migrations, seed, Docker image                                                                                                                              |
| `dev.ts`                 | `pnpm dev`                                                                                                         | Full local stack: Docker Compose + Inngest + Gateway + auto-detected Cloudflare tunnel + Docker worker image build. Flags: `--reset`, `--skip-build`, `--no-tunnel`                                  |
| `dev-e2e.ts`             | `pnpm dev:e2e`                                                                                                     | Start services + build Docker image + trigger task + run E2E verification (full end-to-end run)                                                                                                      |
| `register-project.ts`    | `pnpm register-project`                                                                                            | Interactive wizard to register a new project via the admin API                                                                                                                                       |
| `trigger-task.ts`        | `pnpm trigger-task`                                                                                                | Send mock webhook and monitor                                                                                                                                                                        |
| `verify-e2e.ts`          | `pnpm verify:e2e --task-id <uuid>`                                                                                 | 12-point E2E verification                                                                                                                                                                            |
| `stress-test.ts`         | `pnpm stress-test`                                                                                                 | Run an employee N times and report success rate, p50/p90/p99 timing, and anomaly detection (tag bleed, retries, missing Slack posts). Options: `--count`, `--concurrency`, `--employee`, `--timeout` |
| `setup-two-tenants.ts`   | (archived)                                                                                                         | One-shot multi-tenant setup script — moved to `scripts/archive/`. Run manually if needed: `pnpm exec tsx scripts/archive/setup-two-tenants.ts`                                                       |
| `telegram-notify.ts`     | `tsx scripts/telegram-notify.ts "msg"`                                                                             | Send developer Telegram push notification                                                                                                                                                            |
| `seed-platform-owner.ts` | `BOOTSTRAP_OWNER_EMAIL=owner@example.com BOOTSTRAP_OWNER_PASSWORD=YourPassword tsx scripts/seed-platform-owner.ts` | Bootstrap the first PLATFORM_OWNER user in Supabase Auth and the app DB; creates OWNER memberships in all seeded tenants                                                                             |

## Project Structure

```
src/
├── gateway/      # Express server — webhook receiver (Hostfully, Jira) + Slack Bolt + Inngest host
├── inngest/      # Universal employee lifecycle, interaction handler, rule extractor, cron triggers
├── workers/      # Docker container code — AI agent execution (OpenCode harness)
├── worker-tools/ # Shell tools for employees (Slack, Hostfully, locks, KB search, platform reporting)
└── lib/          # Shared utilities: LLM client, Slack/Fly.io/GitHub clients, encryption, logging, retry; `email/` — EmailProvider abstraction (Mailpit local / Resend prod)
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

- `SERVICE_TOKEN` — machine-to-machine auth for all `/admin/*` endpoints. Generate: `openssl rand -hex 32`
- `ENCRYPTION_KEY` — AES-256-GCM key for tenant secrets (validated at gateway startup)

**Slack (Papi Chulo bot — all employees):**

- `SLACK_APP_TOKEN` — `xapp-...` for Socket Mode WebSocket connection (Papi Chulo is the platform Slack bot, not an employee name)
- `SLACK_SIGNING_SECRET` — verifies Slack interaction webhooks
- `FLY_WORKER_APP` — Fly.io app name for worker machines (currently: `ai-employee-workers`)

> **Note**: `SUMMARIZER_VM_SIZE`, `WORKER_VM_SIZE`, and `COST_LIMIT_USD_PER_DEPT_PER_DAY` are now managed via the `platform_settings` DB table. Use the dashboard at `/dashboard/settings` or `PATCH /admin/platform-settings/:key` to update them.

**Email:**

- `RESEND_API_KEY` — Resend API key for production email delivery. Leave empty to use Mailpit (local dev).
- `EMAIL_FROM` — Sender address for invitation emails. Default: `DozalDevs <noreply@dozaldevs.com>`.
- `DASHBOARD_BASE_URL` — Base URL for invitation links in emails. Default: `http://localhost:7700`. Production: `https://ai-employees-laaa.onrender.com`.
- `SMTP_URL` — SMTP connection URL for local Mailpit. Default: `smtp://localhost:54324`.

**Guest-Messaging (VLRE):**

- Hostfully credentials are stored as **tenant secrets in the database**, not `.env`. See [AGENTS.md](AGENTS.md) for provisioning commands.
- `WEBHOOK_PUBLIC_URL` — public URL for one-time Hostfully webhook registration (legitimate `.env` exception)

**Engineer employee (archetype-based, active):**

- `GITHUB_APP_ID` — GitHub App ID (numeric, from GitHub App settings)
- `GITHUB_APP_NAME` — GitHub App URL slug (e.g. `my-ai-employee`)
- `GITHUB_PRIVATE_KEY` — RSA private key downloaded from GitHub App settings (store with literal `\n` escaping)

**Composio (third-party app integrations):**

- `COMPOSIO_API_KEY` — API key for Composio, enabling 1000+ app integrations (Notion, Linear, Gmail, etc.) via the gateway OAuth connect flow and the `/tools/composio/execute.ts` worker shell tool. Get from: https://app.composio.dev → Settings → API Keys.

**Engineering (deprecated — on hold):**

- `OPENROUTER_API_KEY` — AI code generation
- `GITHUB_TOKEN` — PR creation (must have push access to all registered repos)
- `JIRA_WEBHOOK_SECRET` — webhook validation (use `test-secret` locally)

## Testing Employees Locally

**Summarizer**: Trigger manually via admin API:

```bash
curl -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
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

| Document                                                                                    | Description                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Full System Vision](docs/architecture/2026-04-14-0104-full-system-vision.md)               | Architecture, archetypes, lifecycle, event routing, multi-tenancy                                                                                                                                                                            |
| [Current System State](docs/snapshots/2026-04-29-2255-current-system-state.md)              | Latest verified snapshot: lifecycle, harness flow, all routes, DB schema — includes unified interaction handler and guest messaging full flow                                                                                                |
| [Multi-Tenancy Guide](docs/guides/2026-04-16-1655-multi-tenancy-guide.md)                   | Provisioning tenants, Slack OAuth, per-tenant secrets, verification                                                                                                                                                                          |
| [Slack Per-Dev App Onboarding](docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md) | Per-developer Slack app setup — create dev app, enable Socket Mode, register sandbox teamId, set personal xapp- token. Required for every new engineer.                                                                                      |
| [Phase 1 Story Map](docs/planning/2026-04-21-2202-phase1-story-map.md)                      | 58 stories across 5 releases — active development roadmap                                                                                                                                                                                    |
| [Product Roadmap](docs/planning/2026-04-21-1813-product-roadmap.md)                         | 4-phase product roadmap, design partner strategy                                                                                                                                                                                             |
| [Troubleshooting](docs/guides/2026-04-01-2110-troubleshooting.md)                           | Common failures with symptoms and fixes                                                                                                                                                                                                      |
| [Adding a Shell Tool](docs/guides/2026-05-04-1645-adding-a-shell-tool.md)                   | File structure, CLI pattern, mock fixtures, Docker integration for new shell tools                                                                                                                                                           |
| [Local E2E Testing](docs/testing/2026-05-04-2023-local-e2e-testing.md)                      | Testing without real external APIs — mock conventions, fixture structure, env propagation                                                                                                                                                    |
| [Airbnb Integration Research](docs/architecture/airbnb-integration/)                        | Research spike: go/no-go decision, Partner API analysis, credential custody, API reverse engineering, ecosystem landscape, next-steps playbook                                                                                               |
| [Cloud Deployment Guide](docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md)     | Deploying to production — Supabase Cloud, Render, Inngest Cloud, Fly.io. Step-by-step provisioning, full env var reference, database migration, CI/CD pipeline, cost breakdown, and troubleshooting.                                         |
| [Engineer Employee](docs/employees/2026-06-02-1230-engineer.md)                             | Engineer employee operational details — archetype setup, GitHub App OAuth, trigger command, known gotchas, verified E2E flow.                                                                                                                |
| [Google Workspace Assistant](docs/employees/2026-06-03-0243-google-assistant.md)            | Google Workspace Assistant employee operational details — archetype ID, trigger command, available tools, required tenant secrets, known gotchas.                                                                                            |
| [Maintainability Audit](docs/guides/2026-06-05-0111-maintainability-audit.md)               | Comprehensive maintainability findings (architecture, large files, code smells, tests, types, conventions, docs, build) with a companion remediation plan in .sisyphus/plans/.                                                               |
| [User Auth & RBAC](docs/guides/2026-06-09-1448-user-auth-rbac.md)                           | Multi-tenant user auth and RBAC — JWT flow, SERVICE_TOKEN, dual-env profiles (LOCAL HS256 vs CLOUD ES256), Supabase key model, invitation flow, bootstrap, cloud setup, known gotchas.                                                       |
| [Information Drift Audit](docs/guides/2026-06-12-2030-drift-audit.md)                       | Complete audit of every place a platform fact is duplicated — output-contract paths, classification enums, prompt text, skill metadata, env-var requirements — with per-area drift risk, intentional asymmetries, and target single sources. |
| [Contributing Guide](CONTRIBUTING.md)                                                       | Active vs deprecated component map, task-creation paths (Prisma vs PostgREST), how to add a shell tool, how to add an employee, how to run E2E tests, and key conventions.                                                                   |

## Testing

```bash
pnpm test:unit   # Run unit suite once and exit (one-shot, no watch)
pnpm test        # Run unit suite in watch mode (stays running, re-runs on file change)
pnpm lint        # ESLint
pnpm build       # TypeScript compile
```

> `pnpm test` stays in watch mode — use `pnpm test:unit` in scripts or CI where you need a clean exit.

**Expected results**: All tests should pass with 0 failures. One pre-existing skip is expected and intentional: `container-boot.test.ts` skips all 4 tests when Docker is unavailable — not a failure.

## Environment File Conventions

`.env` and `.env.example` must stay in sync and organized. Follow these rules whenever adding, removing, or renaming any env var.

### Section Order (mandatory — maintain in both files)

1. **Database** — `DATABASE_URL`, `DATABASE_URL_DIRECT`
2. **Supabase (PostgREST + Auth)** — `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY`
3. **Platform Core** — `ENCRYPTION_KEY`, `SERVICE_TOKEN`, `PORT`
4. **Inngest (Event Queue)** — `INNGEST_DEV`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
5. **Worker Dispatch Mode** — `WORKER_RUNTIME`, `TUNNEL_URL`
6. **Fly.io (Worker Runtime)** — `FLY_API_TOKEN`, `FLY_WORKER_APP`, `FLY_WORKER_IMAGE` (note: `WORKER_VM_SIZE` moved to `platform_settings` DB table)
7. **AI / OpenRouter** — `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `PLAN_VERIFIER_MODEL`
8. **GitHub** — `GITHUB_TOKEN`, `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`
9. **Slack Integration** — `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_BASE_URL`, `SLACK_CHANNEL_ID`, `VLRE_SLACK_BOT_TOKEN`
10. **Email** — `RESEND_API_KEY`, `EMAIL_FROM`, `DASHBOARD_BASE_URL`, `SMTP_URL`
11. **Webhooks** — `JIRA_WEBHOOK_SECRET`, `GITHUB_WEBHOOK_SECRET`, `WEBHOOK_PUBLIC_URL`
12. **Telegram (Developer Notifications)** — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
13. **Cost Control** — `AGENT_VERSION_ID` (note: `COST_LIMIT_USD_PER_DEPT_PER_DAY` moved to `platform_settings` DB table)
14. **TENANT SECRETS** — reference-only comment block; never real values here
15. **DEPRECATED** — commented-out superseded vars; always at the bottom

### Rules

- **`.env.example` is the source of truth** — every var in `.env` must have a matching entry in `.env.example` with a description. A var in `.env` with no entry in `.env.example` is a bug.
- **Tenant secrets never go in `.env`** — Hostfully, Sifely, and per-tenant Slack tokens are stored via the admin API (`tenant_secrets` table). The only exception is `VLRE_SLACK_BOT_TOKEN` (seed-only: used by `prisma/seed.ts` on DB reset). See the `TENANT SECRETS` block in `.env.example` for the full list.
- **Deprecated vars go to the DEPRECATED section** — when a var is superseded, move the old name to the `DEPRECATED` block at the bottom of `.env.example` (commented out with a note of what replaced it). Remove it from `.env` entirely. Never leave deprecated vars active in either file.
- **Keep both files in sync** — after adding, removing, or renaming any var, update both files in the same commit.
- **Known deprecated aliases** — `SUMMARIZER_VM_SIZE` → `WORKER_VM_SIZE` → `platform_settings.default_worker_vm_size`; `COST_LIMIT_USD_PER_DEPT_PER_DAY` → `platform_settings.cost_limit_usd_per_day`; `FLY_SUMMARIZER_APP` → `FLY_WORKER_APP`; `USE_LOCAL_DOCKER` / `USE_FLY_HYBRID` / `FLY_HYBRID_POLL_MAX` → `WORKER_RUNTIME` + `TUNNEL_URL`.

## Docs Directory Structure

The `docs/` directory is organized into subdirectories by document type. Always file new documents in the correct location.

| Directory              | Contents / Pattern                                  | Description                                                                 |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `docs/architecture/`   | System design, vision, redesign overviews           | Architecture decisions, system overviews, vision documents                  |
| `docs/phases/`         | `phase*-*.md`, `*-implementation-phases.md`         | Historical MVP build phases 1–8. Closed archive — no new files expected.    |
| `docs/guides/`         | `*-guide.md`, `*-overview.md`, troubleshooting      | How-to guides, employee guides, setup instructions, troubleshooting         |
| `docs/infrastructure/` | Infrastructure, deployment, migration docs          | Supabase, Docker, cloud migration, hybrid mode                              |
| `docs/planning/`       | `*-product-roadmap.md`, `*-story-map.md`            | Product roadmaps and phase story maps                                       |
| `docs/snapshots/`      | `*-current-system-state.md`                         | Point-in-time system state snapshots. Never edit after creation.            |
| `docs/testing/`        | E2E test guides, scenario docs, testing methodology | All testing documentation including per-employee scenario guides in subdirs |
| `docs/external/`       | Non-platform documentation                          | Client-specific docs, external system references (e.g. snobahn)             |

### Adding New Docs — Criteria

**1. Naming** — always `YYYY-MM-DD-HHMM-{slug}.md`. Run `date "+%Y-%m-%d-%H%M"` first. Never create a file without a timestamp prefix.

**2. Subdirectory** — match the document's _primary purpose_, not its topic:

| If the document is...                                          | Put it in                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| A new system design, vision, or architectural decision         | `docs/architecture/`                                         |
| A historical phase build record                                | `docs/phases/` — note: closed archive, no new files expected |
| A how-to, setup guide, troubleshooting, or employee overview   | `docs/guides/`                                               |
| Infrastructure, deployment, or migration documentation         | `docs/infrastructure/`                                       |
| A product roadmap or story map                                 | `docs/planning/`                                             |
| A point-in-time system state snapshot                          | `docs/snapshots/` — never edit after creation                |
| An E2E test guide or scenario document for a specific employee | `docs/testing/{employee-slug}/` (create subdir if needed)    |
| A general testing methodology or cross-employee test guide     | `docs/testing/` (root level)                                 |
| Client-specific or external system reference                   | `docs/external/`                                             |

**3. After adding** — per [Documentation Freshness](AGENTS.md):

- Add a row to the README.md Documentation table for any doc worth surfacing to developers
- Add a row to the AGENTS.md Reference Documents table if agents should read it on demand
- Never add to `docs/snapshots/` or `docs/phases/` without also noting it is immutable/archived

**4. Never place files at `docs/` root** — every new markdown file must go into a subdirectory.

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools (claude, opencode, etc.) in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)

## Git Cleanup on Plan Completion (MANDATORY)

When a plan's implementation work is fully complete (all tasks done, final wave passed), Atlas **must** run `git status` and resolve every outstanding item before declaring done:

```bash
git status --short
```

Handle each category:

| Status                                                           | Action                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `M` modified — source/test files                                 | Stage and commit with an appropriate message                                |
| `??` untracked — `.sisyphus/plans/` or `.sisyphus/notepads/`     | Stage and commit: `chore(sisyphus): add plans and notepads for <plan-name>` |
| `??` untracked — generated/build artifacts (`dist/`, `*.js.map`) | Add to `.gitignore` if not already ignored                                  |
| `??` untracked — temp/scratch files                              | Delete them                                                                 |
| `D` deleted files that should stay deleted                       | Stage the deletion and commit                                               |

**Rule**: `git status` must show an empty output (or only entries that are intentionally gitignored) before the plan is considered truly complete. Do not skip this step even if you believe everything was committed during task execution — subagents frequently leave orphaned files.
