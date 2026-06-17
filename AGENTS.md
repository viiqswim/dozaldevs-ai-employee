# AI Employee Platform — Agent Guide

> Keep this file concise and current. Only include information that helps agents make correct decisions. For architectural details, read the vision doc on demand — don't duplicate it here. This file is loaded into every LLM call — every token here costs tokens on every turn.

## Table of Contents

- [Approved LLM Models](#approved-llm-models)
- [Platform Vision](#platform-vision)
- [Adding a New Employee](#adding-a-new-employee)
- [OpenCode Worker (All Employees)](#opencode-worker-all-employees)
- [Skills System](#skills-system)
- [Feedback Pipeline](#feedback-pipeline)
- [Tenants](#tenants)
- [Authentication & Authorization](#authentication--authorization)
- [Commands](#commands)
- [Dashboard URLs](#dashboard-urls)
- [Pre-existing Test Failures](#pre-existing-test-failures)
- [Database](#database)
- [Infrastructure](#infrastructure)
- [CI/CD — Auto-Deploy + Auto-Migrate on Merge to `main`](#cicd--auto-deploy--auto-migrate-on-merge-to-main)
- [Project Structure](#project-structure)
- [Key Conventions](#key-conventions)
- [Environment Variables](#environment-variables)
- [Prometheus Planning — Telegram Notifications](#prometheus-planning--telegram-notifications-mandatory)
- [E2E Testing](#e2e-testing-mandatory--applies-to-every-implementation)
- [Reference Documents](#reference-documents)

> **Before editing ANY file, check the dispatch table in [Skills System](#skills-system) and load the matching skill FIRST — this is mandatory, not advisory.**

## Approved LLM Models

**CRITICAL CONSTRAINT — NEVER VIOLATE:**

Two categories of model use exist in this codebase. Each has its own rule.

| Category                               | Model                                                                                                | Rule                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Execution** (employee work)          | Any model present in the tenant's `model_catalog` table                                              | Selected via the recommendation engine at archetype creation. Default seed: `deepseek/deepseek-v4-flash`.                                                                                                                                                                                                                                    |
| **Verification/judge** (gateway calls) | Configurable via `platform_settings` key `gateway_llm_model`. Default: `deepseek/deepseek-v4-flash`. | Read at runtime via `getPlatformSetting('gateway_llm_model')` in `call-llm.ts`. When `OPENCODE_GO_API_KEY` is set and the model is OpenAI-compatible on Go, routes through OpenCodeGo; Anthropic-format Go models fall back to OpenRouter. Change via dashboard `/dashboard/settings` or `PATCH /admin/platform-settings/gateway_llm_model`. |

**Execution model selection — how it works:** The model-selection engine (`src/lib/model-selection/`) profiles the archetype and ranks catalog models by cost, quality, speed, and tool reliability. New archetypes pick a model from the catalog via `POST /admin/tenants/:tenantId/archetypes/recommend-model`. The catalog is managed via `GET/POST/PATCH/DELETE /admin/model-catalog` (global — not tenant-scoped).

**Seeded catalog models:** See `creating-archetypes` skill for the full list and per-model reliability notes.

**OpenCode VM size requirement**: Any archetype using `runtime: 'opencode'` MUST have `vm_size: 'performance-1x'` set (or larger). The Go-based OpenCode binary reserves ~74GB virtual memory at startup — `shared-cpu-1x` Fly machines (256MB RAM) will OOM-kill it every time. Without `vm_size` set, the archetype defaults to `shared-cpu-1x` and every task fails within 45 seconds with 0 tokens. Set it in both the DB and the seed file: `UPDATE archetypes SET vm_size = 'performance-1x' WHERE id = '<archetype_id>';`

**Forbidden in hardcoded references:** `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, `openai/gpt-4o-mini`. These may not appear as hardcoded model IDs anywhere in production code, default fallbacks, or environment variable examples. Adding a model to the catalog is the correct path to make it usable.

**OpenCodeGo routing:** When `OPENCODE_GO_API_KEY` is set, compatible models route through OpenCodeGo. Full mechanics and model list → `creating-archetypes` skill + `src/lib/go-models.ts`.

The engineering employee and its orchestrator-based worker are retired; all active employees use the OpenCode harness.

## Platform Vision

A single-responsibility AI Employee Platform — deploys autonomous AI agents ("digital employees"), each with one job. Every employee follows the same lifecycle, uses the same infrastructure (Inngest orchestration, Supabase state, Fly.io runtime), and is defined by a declarative archetype config. What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds). Full architecture: `docs/architecture/2026-04-14-0104-full-system-vision.md`

Employee-specific details are in each archetype's `identity` and `execution_steps` fields and in `docs/employees/`. Do not list employees here — this file is injected into every worker container and must not contain employee-specific identity content.

## Adding a New Employee

**Wizard (primary path)**: Use the dashboard wizard at `http://localhost:7700/dashboard/employees/new?tenant=<tenantId>`. Describe what the employee does in plain English → the archetype generator (`src/gateway/services/archetype-generator.ts`) auto-generates `identity`, `execution_steps`, `delivery_steps`, and `tool_registry` → save as draft → set `status` to `active` → trigger. The wizard uses a clarify-then-act chat flow via `POST /admin/tenants/:tenantId/archetypes/converse-create`: on the first turn, the generator always asks a clarifying question when the description is short (under 200 words) — even if the description seems clear. Longer descriptions that explicitly state the trigger type, output format, and primary data sources may generate directly. The conversation continues until the intent is complete enough to produce a proposal. For field quality validation, see the [AI Employee E2E Test Guide](docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md). Creating or editing an employee → load `creating-archetypes` FIRST.

**Manual seed (alternative)**:

1. Seed a new `archetypes` record: `role_name`, `identity`, `execution_steps`, `model` (`minimax/minimax-m2.7`), `deliverable_type`, `runtime: 'opencode'`, `temperature` (default `1.0`), `tool_registry` (array of tool paths), `status` (`'draft'` | `'active'` — must be `'active'` to trigger). **Required for delivery**: `delivery_steps` must be non-empty for employees that produce deliverables; it is the single canonical delivery field used by the delivery container. Employees with `deliverable_type: null` and `delivery_steps: null` are valid — they deliver inside execution and emit `NO_ACTION_NEEDED` (escape hatch). Optional: `notification_channel`, `enrichment_adapter`, `vm_size`. For new employees, use the recommendation engine (`POST /admin/tenants/:tenantId/archetypes/recommend-model`) to pick the optimal model from the catalog rather than hardcoding `minimax/minimax-m2.7`.
2. If shell tools needed: add TypeScript scripts to `src/worker-tools/{service}/`. Follow the [Shell Tool Checklist](docs/guides/2026-05-04-1645-adding-a-shell-tool.md).
3. Create `docs/employees/{slug}.md` with operational details (trigger, archetype IDs, channel IDs, gotchas, test resources).
4. For **scheduled triggers**: configure cron on cron-job.org → `POST /admin/tenants/:tenantId/employees/:slug/trigger`.
5. For **webhook triggers**: add route handler in `src/gateway/routes/`.
6. Add entry to Reference Documents table in AGENTS.md pointing to `docs/employees/{slug}.md`.
7. Rebuild Docker image: `docker build -t ai-employee-worker:latest .`

**Approval gate**: Controlled per-archetype via `risk_model.approval_required`. When `false`, lifecycle short-circuits from `Submitting` to `Delivering` → `Done` (skips `Reviewing` and `Approved`).

## OpenCode Worker (All Employees)

All non-deprecated employees use the OpenCode-based harness on Fly.io:

- **Harness**: `src/workers/opencode-harness.mts` — reads archetype from DB, compiles AGENTS.md via `src/workers/lib/agents-md-compiler.mts`, starts OpenCode session, monitors until completion. The compiled AGENTS.md is saved to `tasks.compiled_agents_md` for debugging. Shared utilities (container naming, log helpers) extracted to `src/workers/lib/harness-helpers.mts`. Execution and delivery logic extracted to `src/workers/lib/execution-phase.mts` and `src/workers/lib/delivery-phase.mts`.
- **AGENTS.md compilation**: `agents-md-compiler.mts` assembles the per-task AGENTS.md from archetype fields (`identity`, `execution_steps`, `delivery_steps`), learned rules, knowledge base entries, and the platform base config (`src/workers/config/agents.md`). The `execution_instructions` field is the platform constant prompt injected as the initial OpenCode message — it is not user-editable.
  **Shell tools** at `/tools/` in Docker image — one directory per service:

| Service        | Directory                | Purpose                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slack          | `/tools/slack/`          | Post messages, read channels, post approval cards                                                                                                                                                                                                                                                                                                                     |
| Hostfully      | `/tools/hostfully/`      | Messages, properties, reservations, reviews, door codes                                                                                                                                                                                                                                                                                                               |
| Sifely         | `/tools/sifely/`         | Lock management, passcode CRUD, code rotation, access diagnostics                                                                                                                                                                                                                                                                                                     |
| Knowledge Base | `/tools/knowledge_base/` | Semantic search over employee knowledge entries                                                                                                                                                                                                                                                                                                                       |
| Platform       | `/tools/platform/`       | Report issues, submit task output                                                                                                                                                                                                                                                                                                                                     |
| GitHub         | `/tools/github/`         | Fetch short-lived GitHub App installation tokens for git/gh CLI                                                                                                                                                                                                                                                                                                       |
| Composio       | `/tools/composio/`       | `execute.ts` — run any Composio action (Notion, Google, Jira, and more); `list-actions.ts` — discover available actions for a toolkit at runtime. Composio manages auth for all connected toolkits — employees never hold third-party tokens directly. GitHub and Slack connections use own-app credentials (GitHub: `repo` scope; Slack: tenant's own bot identity). |

All tools support `--help`. For detailed CLI syntax, load the `tool-usage-reference` skill.
Source: `src/worker-tools/{service}/`. See the [Adding a Shell Tool](docs/guides/2026-05-04-1645-adding-a-shell-tool.md) guide.

**Shared utility — `unescapeShellArg`**: Wrap every free-text CLI arg in new shell tools. Details → `adding-shell-tools` skill.

- **OpenCode version — CRITICAL**: Pinned to `1.14.31`. Version `1.14.33` has a confirmed 6-second exit regression. **Never upgrade without explicit testing.**
- **`WORKER_RUNTIME` flag**: `docker` = local containers (default), `fly` = Fly.io machines (requires `TUNNEL_URL`).
- **Task-fetch-first**: Harness fetches task from DB before starting OpenCode. Fake `TASK_ID` exits at "Task not found" — OpenCode never launches.
- **`autoupdate: false`**: Must be set in `src/workers/config/opencode.json` and `~/.config/opencode/opencode.json`.
- **Lifecycle**: `src/inngest/employee-lifecycle.ts` — states: Received → Triaging → AwaitingInput → Ready → Executing → Validating (auto-pass) → Submitting → Reviewing → Approved → Delivering → Done. Terminal: `Failed`, `Cancelled`. Two delivery paths: (1) `approval_required: true` → Submitting → Reviewing → Approved → Delivering → Done; (2) `approval_required: false` → Submitting → Delivering → Done (delivery container always spawns when `delivery_steps` is set; skips only when `NO_ACTION_NEEDED` AND no `delivery_steps`). Delivery routing is determined by `resolveDelivery()` in `src/lib/delivery-resolver.ts` — returns `has-delivery`, `no-delivery-escape-hatch`, or `misconfigured`.
- **Inngest functions** (active, each registered in `src/gateway/inngest/serve.ts`): `employee/universal-lifecycle`, `employee/interaction-handler` (intent classification, `feedback_events`), `employee/rule-extractor` (`employee_rules`), `employee/rule-synthesizer` (`SYNTHESIS_THRESHOLD` = 5), `trigger/reviewing-watchdog` (15-min cron, marks stuck `Reviewing` → `Failed` after 30 min), `employee/slack-trigger-handler` (handles `employee/task.requested` from Slack @mentions — resolves channel → employee, posts confirmation card, dispatches task), `employee/slack-input-collector` (handles `employee/trigger.input-received` — collects required inputs from thread replies before dispatching).
- **Slack @mention triggering**: @mention → interaction classification → channel routing → confirmation card → task dispatch. Full algorithm → `execution-trace-debugging` skill.
- **Output contract**: OpenCode writes `/tmp/summary.txt` and `/tmp/approval-message.json` via the `submit-output.ts` tool (`--draft-file` for full content, `--classification` for routing: `NEEDS_APPROVAL` or `NO_ACTION_NEEDED`). Absence of BOTH is a hard failure. If only a short summary appears in delivery (no actual content), `--draft-file` was missing from the generated `submit-output` call in `execution_steps` — the archetype generator has regressed. **Output-contract paths are single-sourced** in `src/lib/output-contract-constants.ts` (World-A); worker-tools consume a generated copy at `src/worker-tools/lib/output-contract-paths.generated.ts` (World-B, `// @generated` header). Never edit the generated file directly — run `pnpm generate-worker-constants` to regenerate. **Output-contract versioning**: `StandardOutput` carries an optional `version` field. Absent = v1 (legacy backward compat). Future-unknown versions are warned but not thrown — additive-only within a major version guarantees degraded read safety.
- **Container naming**: Execution container: `employee-{taskId.slice(0,8)}`. Delivery container: `employee-delivery-{taskId.slice(0,8)}`. Find both with `docker ps --filter name=employee-`.
- **Multi-provider routing**: When `OPENCODE_GO_API_KEY` is set, compatible models route through OpenCodeGo. Full mechanics → `creating-archetypes` skill + `src/lib/go-models.ts`.

## Skills System

Skills are on-demand knowledge modules loaded by OpenCode agents. Before any non-trivial task, scan this list — if the domain overlaps, call `skill(name="skill-name")` before starting. Skills are free to load.

| If you are about to…                                                                                                                          | Load this skill                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Create or modify a shell tool in `src/worker-tools/`                                                                                          | `adding-shell-tools`                           |
| Debug a stuck or failed task, inspect container logs, or query task observability                                                             | `debugging-lifecycle`                          |
| Add or configure a new employee archetype                                                                                                     | `creating-archetypes`                          |
| Call any Hostfully API or fix a Hostfully integration                                                                                         | `hostfully-api`                                |
| Run or write E2E tests                                                                                                                        | `e2e-testing`                                  |
| Call any shell tool inside a worker container                                                                                                 | `tool-usage-reference` (worker container only) |
| Pass UUIDs (lead_uid, thread_uid, property_uid, etc.) to any tool                                                                             | `uuid-disambiguation` (worker container only)  |
| Change the Prisma schema, write or run migrations, or edit seed data                                                                          | `prisma`                                       |
| Write or modify Inngest functions, step functions, or durable workflow logic                                                                  | `inngest`                                      |
| Create or modify Express routes, API endpoints, validation, or response shapes, OR need the admin API endpoint catalog                        | `api-design`                                   |
| Modify the dashboard UI under `dashboard/src/`                                                                                                | `react-dashboard`                              |
| Add or modify secret storage, encryption, admin auth middleware, or tenant isolation boundaries                                               | `security`                                     |
| Write or modify any code that accesses the DB at runtime (repositories, PostgREST calls), reads env vars, or makes outbound HTTP calls        | `data-access-conventions`                      |
| Verify a completed feature end-to-end                                                                                                         | `feature-verification`                         |
| Debug production issues, check Render deploys, fetch runtime logs, or update production service config                                        | `production-ops`                               |
| Post Slack messages, build Block Kit payloads, handle interactive buttons, or implement approval cards                                        | `slack-conventions`                            |
| Run any command expected to take >30 seconds                                                                                                  | `long-running-commands`                        |
| Debug a failed or incomplete AI employee creation (wizard, generate, propose-edit, time-estimate)                                             | `employee-creation-debugging`                  |
| Trace a Slack @mention through the full execution path, debug a task that disappeared or silently failed, or run a production incident triage | `execution-trace-debugging`                    |

Worker skills (baked into Docker image via `COPY src/workers/skills/`) vs dev skills (`.opencode/skills/`) — rebuild Docker for worker changes, commit for dev changes.

New skill: create `src/workers/skills/{name}/SKILL.md` (worker) or `.opencode/skills/{name}/SKILL.md` (dev). Pattern: `^[a-z0-9]+(-[a-z0-9]+)*$`.

Skill generation/registry internals → `creating-archetypes`/`adding-shell-tools` skills.

## Feedback Pipeline

Thread replies and @mentions are captured through a unified pipeline:

- **Thread reply or @mention** → `interaction-handler` classifies intent, writes `feedback_events` audit row
  - **Correction/teaching** → `rule-extractor` extracts rule → Slack confirmation card → confirmed rules stored in `employee_rules`
  - **Question/feedback** → responds in thread
- **PM confirms rule** → synthesis check: at multiple of `SYNTHESIS_THRESHOLD` (5), `rule-synthesizer` merges rules, flags contradictions

**Key constants**: `SYNTHESIS_THRESHOLD = 5` · `MAX_EMPLOYEE_RULES_CHARS = 8000` · `MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000`

## Tenants

Two tenants are seeded in `prisma/seed.ts`. Each requires its own Slack OAuth connection to operate:

| ID                                     | Name      | Slug      | Slack Workspace                                    |
| -------------------------------------- | --------- | --------- | -------------------------------------------------- |
| `00000000-0000-0000-0000-000000000002` | DozalDevs | dozaldevs | `T0601SMSVEU` (Dozal Inc.) — must OAuth separately |
| `00000000-0000-0000-0000-000000000003` | VLRE      | vlre      | `vlreworkspace.slack.com` (team: `T06KFDGLHS6`)    |

Routing is by channel — see `docs/guides/2026-05-14-0040-slack-tenant-integration.md` for the full flow.

**Papi Chulo = the platform Slack bot, NOT an employee name.** App ID `A09678HT90S`, installed on VLRE workspace. ALL AI employees communicate through this single bot — it is not tied to the daily-summarizer or any specific employee. The daily-summarizer archetype uses a "dramatic Spanish TV news correspondent" persona in its prompt, but the Papi Chulo name belongs to the bot/app, not that employee.

**Two VLRE Slack tokens exist in `.env`**: `SLACK_BOT_TOKEN` (used by the gateway Bolt app for Socket Mode) and `VLRE_SLACK_BOT_TOKEN` (seed-only — used by `prisma/seed.ts` to populate `tenant_secrets` on DB reset). For API calls from scripts or testing, use `VLRE_SLACK_BOT_TOKEN`. Both hold the same VLRE workspace bot token value but serve different consumption points. Never store either as the DozalDevs tenant secret.

For Slack OAuth setup and per-tenant token architecture, see `docs/guides/2026-05-14-0040-slack-tenant-integration.md`.

## Authentication & Authorization

All `/admin/*` and `/me` endpoints require an `Authorization: Bearer <token>` header. Two token types are accepted:

| Token type        | Value                                          | Use case                                          |
| ----------------- | ---------------------------------------------- | ------------------------------------------------- |
| **SERVICE_TOKEN** | Opaque hex string from `SERVICE_TOKEN` env var | External cron callers, scripts, Inngest functions |
| **Supabase JWT**  | Short-lived JWT issued by Supabase Auth        | Dashboard users, logged-in humans                 |

`ADMIN_API_KEY` / `X-Admin-Key` are **removed** (not deprecated — gone since T24). All callers must use `Authorization: Bearer`.

Role rank order (highest to lowest): `OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)`.

Auth/RBAC/secrets work → load `security` FIRST; full flow in `docs/guides/2026-06-09-1448-user-auth-rbac.md`.

## Commands

| Action                                                                           | Command                            |
| -------------------------------------------------------------------------------- | ---------------------------------- |
| First-time setup                                                                 | `pnpm setup`                       |
| Start services                                                                   | `pnpm dev`                         |
| Run unit tests (watch)                                                           | `pnpm test`                        |
| Run unit tests (one-shot)                                                        | `pnpm test -- --run`               |
| Run unit tests (explicit)                                                        | `pnpm test:unit`                   |
| Run integration tests (DB)                                                       | `pnpm test:integration`            |
| Run all tests (unit + DB)                                                        | `pnpm test:all`                    |
| Setup test DB                                                                    | `pnpm test:db:setup`               |
| Lint                                                                             | `pnpm lint`                        |
| Build                                                                            | `pnpm build`                       |
| Trigger E2E task                                                                 | `pnpm trigger-task`                |
| Verify E2E                                                                       | `pnpm verify:e2e --task-id <uuid>` |
| Stress test                                                                      | `pnpm stress-test`                 |
| Docker start                                                                     | `pnpm docker:start`                |
| Docker stop                                                                      | `pnpm docker:stop`                 |
| Docker reset                                                                     | `pnpm docker:reset`                |
| Docker status                                                                    | `pnpm docker:status`               |
| Dashboard build                                                                  | `pnpm dashboard:build`             |
| Full E2E run                                                                     | `pnpm dev:e2e`                     |
| Regenerate Composio skills                                                       | `pnpm generate-composio-skills`    |
| Regenerate worker constants                                                      | `pnpm generate-worker-constants`   |
| Regenerate tool-usage skill                                                      | `pnpm generate-tool-usage-skill`   |
| Regenerate all skills (tool-usage-reference + per-service + Composio when keyed) | `pnpm generate-skills`             |

Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin).

## Dashboard URLs

| Mode        | URL                                | Notes                                                                                                                                         |
| ----------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Development | `http://localhost:7700/dashboard/` | Gateway proxies to Vite dev server at :7701. Full HMR; use this URL for all development work. `pnpm dev` sets `VITE_DEV_PROXY` automatically. |
| Production  | `http://localhost:7700/dashboard/` | Served as pre-built static files from `dashboard/dist/`. Requires `pnpm dashboard:build` to reflect source changes.                           |

**For any UI inspection, screenshot, or browser automation task, always use `localhost:7700/dashboard/`.** When `pnpm dev` is running, the gateway proxies dashboard traffic to the Vite dev server (HMR enabled). Vite still listens on `:7701` as the underlying server but you do not need to use that port directly — `7700` works for everything including OAuth redirects.

**Task execution logs**: `/dashboard/tasks/:taskId/logs?tenant=:tenantId` — full-page formatted log viewer (noise-filtered, searchable, color-coded). Only available when a log file exists at `/tmp/employee-{taskId.slice(0,8)}.log` (local Docker mode).

**Employee creation wizard**: `http://localhost:7700/dashboard/employees/new?tenant=<tenantId>` — generates archetype fields from a plain-English description.

**AI Assistant / converse-create internals** → `employee-creation-debugging` skill.

## Pre-existing Test Failures

Do NOT attempt to fix these — they are unrelated to any recent changes:

- `container-boot.test.ts` — requires Docker socket; its tests skip via `describe.skipIf` when Docker is unavailable

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma`; **REST API**: Supabase PostgREST on `http://localhost:54331`
- **Test DB**: `ai_employee_test` — setup via `pnpm test:db:setup` (one-time, idempotent). Safety guard: `globalSetup` throws if `DATABASE_URL` doesn't contain `ai_employee_test`.
- **`platform_settings` table**: global key-value store. Keys: `default_worker_vm_size`, `cost_limit_usd_per_day`, `synthesis_threshold`, `max_employee_rules_chars`, `max_employee_knowledge_chars`, `worker_bash_timeout_ms`, `issues_slack_channel`, `cost_alert_slack_channel`, `gateway_llm_model`. Use `getPlatformSetting(key)` from `src/lib/platform-settings.ts`. Missing required settings throw at startup.
- **Soft-delete only** — never hard-delete any row. Use `deleted_at` timestamp. All queries filter `deleted_at IS NOT NULL`.
- **Table schemas** → `prisma/schema.prisma` (source of truth). Load `prisma` skill for migration/query work.

### Database Backup (MANDATORY before any reseed or wipe)

**Before running `pnpm prisma db seed`, `pnpm setup`, `docker compose down -v`, or any operation that resets or overwrites the database — YOU MUST back it up first.** See the `production-ops` skill for the full backup and restore procedure.

## Infrastructure

Uses **Docker Compose** (`docker/docker-compose.yml`) instead of `supabase start` — the CLI hardcodes `database: postgres`, which would break PostgREST. `POSTGRES_DB=ai_employee` in `docker/.env` makes all services use the right database. **CRITICAL — Rebuild after every worker change**: Changes to `src/workers/` require a Docker image rebuild. `src/worker-tools/` is bind-mounted in local Docker mode — no rebuild needed for tool changes locally. Gateway/Inngest code changes take effect immediately via `tsx watch`.

**Dockerfile.gateway build foot-gun**: `pnpm prune --prod` re-fires the `prepare` → `husky` lifecycle script after devDeps are pruned. Fix: `ENV HUSKY=0` in the builder stage + `pnpm prune --prod --ignore-scripts`. Both are required — `HUSKY=0` alone is insufficient because the binary is already gone by the time the hook runs.

```bash
docker build -t ai-employee-worker:latest . && pnpm trigger-task
```

## CI/CD — Auto-Deploy + Auto-Migrate on Merge to `main`

Every push to `main` runs `.github/workflows/deploy.yml`:

1. **test** — pnpm (pinned: `packageManager: pnpm@10.24.0` + `pnpm/action-setup@v4`), build, unit + integration (postgres service container) + lint + dashboard tests.
2. **migrate** (`needs: test`) — `prisma migrate deploy` against prod, then PostgREST schema reload (`NOTIFY pgrst, 'reload schema'`). A guard step fails fast if the DB URL is pooled/transaction (`:6543`/`pgbouncer`).
3. **deploy-gateway** (`needs: [test, migrate]`) — triggers the Render deploy via the Render API, polls to `live`/failed, and surfaces Render's deploy logs inside the Actions run. The job goes red if the deploy doesn't reach `live`.
4. **deploy-worker** (`needs: test`) — rebuilds + pushes the Fly worker image (`registry.fly.io/ai-employee-workers:latest`, `--platform linux/amd64`).

Workflow `concurrency` serializes overlapping merges (`cancel-in-progress: false`) so a running migrate is never cancelled.

**Single trigger**: Render auto-deploy is OFF (`autoDeploy: false` in `render.yaml` and on the live service). GitHub Actions is the sole gateway-deploy trigger — no more Render-on-push double-deploy race.

**Prod DB connection (critical)**: the migrate job connects via the Supabase **session-mode pooler on port 5432** (`aws-1-us-west-2.pooler.supabase.com:5432`), held in the `PROD_DATABASE_URL_DIRECT` GitHub secret. The direct `db.<ref>.supabase.co:5432` host is **IPv6-only** and unreachable from IPv4-only GitHub runners (`P1001`); the session pooler is IPv4 and supports DDL-in-transaction. It is NOT the transaction pooler (`:6543`/`pgbouncer`), so it passes the port-5432 guard.

**Secrets**: `PROD_DATABASE_URL_DIRECT` (session pooler, port 5432), `FLY_API_TOKEN`, `RENDER_API_KEY` (trigger + poll + logs). The old `RENDER_DEPLOY_HOOK_URL` is no longer used.

**Migrate-failure recovery**: a prod backup is taken before each risky change (`database-backups/<timestamp>/`). If a migrate fails mid-run, restore from that backup (see "Database Backup" above) and investigate before re-merging.

## Project Structure

```
src/
├── gateway/      # Express HTTP server — webhook receiver + Inngest function host
│   ├── routes/       # All HTTP route handlers
│   ├── slack/        # Bolt event/action handlers + OAuth installation store — browse dir + load slack-conventions skill
│   ├── middleware/   # Auth middleware (authMiddleware, requireAuth, requireTenantRole, requirePermission)
│   ├── validation/   # Zod schemas + HMAC signature verification
│   ├── services/     # Business logic services (archetype generator, dispatcher, task creation, interaction classification) — browse dir + load relevant skill
│   ├── lib/          # Shared gateway utilities: `http-response.ts` (sendError()/sendSuccess()), `prisma-helpers.ts`, `socket-mode-lock.ts`
│   └── inngest/      # Inngest client factory, event sender, serve registration
├── inngest/      # Durable workflow functions: lifecycle, watchdog, redispatch
│   ├── triggers/     # Cron trigger functions
│   ├── lifecycle/    # Extracted lifecycle step modules — browse dir + load inngest skill
│   ├── lib/          # Shared: `postgrest-headers.ts` (makePostgrestHeaders — canonical PostgREST header factory, import from here), create-task-and-dispatch, poll-completion, pending-approvals
│   └── events.ts     # Typed Inngest event schemas (EventPayload, InngestStep) — import from here, never inline event types
├── workers/      # Docker container code — runs inside the worker machine
│   └── lib/          # Harness utilities, session manager, output contract, model provider, prompt assembler — browse dir + load relevant skill
├── repositories/ # Tenant-scoped data access layer — TaskRepository, EmployeeRuleRepository, UserRepository, ArchetypeGenerationCallRepository
├── worker-tools/ # Shell tools (TypeScript, executed via tsx in Docker at /tools/)
└── lib/          # Shared: LLM client, encryption, model-selection, config, HTTP client, email, `output-contract-constants.ts` (World-A single source), `tool-registry.ts`, `delivery-resolver.ts` — browse dir + load relevant skill
prisma/           # Schema, migrations, seed
scripts/          # TypeScript scripts run via tsx (setup, trigger, verify)
tests/
├── unit/         # Fast unit tests (no DB) — run with `pnpm test` or `pnpm test:unit`
├── integration/  # DB-backed integration tests — run with `pnpm test:integration`
└── helpers/      # Shared test utilities: `lifecycle-mocks.ts`
```

## Key Conventions

- **AI employee injection — exactly two things, use exact names**: When an AI employee runs, exactly two things are injected into it: (1) **the prompt** — the initial message sent to the employee, and (2) **the AGENTS.md file** — a literal markdown file written to `/app/AGENTS.md` in the worker container. Never use vague synonyms like "instructions," "knowledge base," "instruction manual," or "context" when referring to these. Always say "the prompt" or "the AGENTS.md file." Any other framing is imprecise and confusing.

- **Discover before you build** — Before writing anything new — a utility, a client, an abstraction, a shared pattern — the first step is to search the existing codebase. Duplicate implementations are the silent tax every codebase pays: two HTTP clients with subtly different retry logic, two encryption wrappers with different IV assumptions, two PostgREST header builders producing slightly different shapes. Each diverges imperceptibly under maintenance until they contradict one another. Search `src/lib/`, `src/gateway/`, `src/inngest/lib/`, `src/workers/lib/`, and `src/worker-tools/` before writing. If a precedent exists — reuse it, extend it, or compose on top of it. Author something new only after satisfying yourself that no existing piece can be made to serve the purpose.

- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`
- Employee behavior is config-driven (archetype pattern), not hardcoded orchestration logic
- **Multi-tenancy is mandatory** — every table, registry, catalog, and query must be scoped by `tenant_id`. When adding any new data structure, ask: "Is this tenant-isolated?" If not, it's a bug.
- **Shared files must stay employee-agnostic** — `src/inngest/employee-lifecycle.ts`, `src/workers/opencode-harness.mts`, and any file under `src/gateway/` or `src/lib/` serve ALL employees. Never use employee-specific language (e.g. "guest", "summary", "Hostfully") in log messages, comments, error strings, or variable names in these files. If you catch yourself writing something employee-specific in a shared file, that is a bug.
- **Zod v4 UUID validation**: `z.string().uuid()` enforces RFC 4122 version/variant bits and may reject certain UUIDs. Use the loose `UUID_REGEX` in `src/gateway/validation/schemas.ts` for any route param that accepts tenant or task UUIDs.
- **Soft deletes only — never hard delete**: No record in any table may be permanently deleted. Use the `deleted_at` timestamp column to mark records as deleted. All queries and API responses must filter out rows where `deleted_at IS NOT NULL`, unless the caller is explicitly presenting data for recovery purposes (e.g. an "undelete" or admin restore UI). Any code path that issues a SQL `DELETE` or Prisma `.delete()`/`.deleteMany()` is a bug — use `.update({ deleted_at: new Date() })` instead.
- **Dashboard UI** — Editing dashboard UI → load `react-dashboard` FIRST; SearchableSelect + card-shells + URL-encoded-state are hard-enforced.
- **End-user language is non-technical** — The end users of the AI Employee platform are non-technical (property managers, small business owners — not developers). When writing anything visible to end users — user-facing labels, UI copy, error messages, Slack notification text, dashboard copy — always use plain language. Examples: "Organization" not "Tenant", "Employee setup" not "Archetype configuration", "Approval needed" not "`risk_model.approval_required` is true".
- **AI employee outputs should be concise** — Slack messages, summaries, and guest replies produced by AI employees should be short and to-the-point. Avoid verbose explanations or filler text in delivered content. If the user asks for more detail, provide it; otherwise, keep it brief.
- **`/tmp/` contract files must be written via tools only** — `/tmp/summary.txt` and `/tmp/approval-message.json` are the harness output contract files. They MUST be written exclusively via TypeScript tools in `/tools/` (e.g., `submit-output.ts`). Never write to these files directly via `echo`, shell redirects, or any non-tool method. The harness reads these files after the OpenCode session completes — if written in the wrong format, the task will fail. This applies to both the execution phase and the delivery phase.
- **Platform settings over env vars** — Platform-level behavior defaults (VM size, cost limits, thresholds, Slack channels) are stored in the `platform_settings` DB table, not env vars. Use `getPlatformSetting(key)` from `src/lib/platform-settings.ts` to read. Never add hardcoded fallback values — missing required settings throw errors at startup. Managed via `/dashboard/settings` or `PATCH /admin/platform-settings/:key`.
- **Gateway routes** — Adding a gateway route → load `api-design` FIRST; use `sendError()`/`sendSuccess()` for ALL responses.
- **Auth/secrets** — Handling secrets, auth, or tenant isolation → load `security` FIRST; gateway-proxied set-password is the ONLY path for `SUPABASE_SECRET_KEY`.
- **`src/worker-tools/knowledge_base/` uses snake_case intentionally** — All other tool directories under `src/worker-tools/` use kebab-case (e.g. `slack/`, `hostfully/`). `knowledge_base/` is the lone exception: it uses snake_case to match the Docker image path `/tools/knowledge_base/` exactly. Do not rename it to `knowledge-base/`.
- **Shell tools** — Adding a shell tool → load `adding-shell-tools` FIRST; export a `descriptor` + use `requireEnv()`.
- **Date-parameterized employees — `printenv INPUT_<KEY>` pattern (MANDATORY)**: When an employee operates on a specific date or period supplied at trigger time (e.g., "for that date", "checking out today"), the archetype generator creates an `input_schema` item with `key: "target_date"` and the first `execution_steps` step MUST read it via `printenv INPUT_TARGET_DATE` — never via the system date or `date` command. The day-of-week MUST be derived from that value using `node -e "const d=new Date(process.env.INPUT_TARGET_DATE+'T12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"`. This pattern is enforced by the generator and must be preserved when manually editing `execution_steps`.
- **`pnpm test:unit` = fast one-shot unit suite; `pnpm test` = WATCH mode** — `pnpm test:unit` runs the unit suite in `tests/unit/` once and exits — no DB required, completes in seconds. **`pnpm test` (no `:unit`) stays in WATCH mode and never exits** — use it only interactively, NEVER in scripts, CI, or agent automation. `pnpm test:integration` runs `tests/integration/` against the test DB (`ai_employee_test`). Run `pnpm test:db:setup` once before integration tests. `pnpm test:all` runs both suites sequentially.
- **Test runs are orphan-protected — NEVER bypass the wrapper** — `vitest.config.ts` uses `pool: 'forks'`, so each worker is a forked child process. If a run is killed abnormally (SIGKILL, closed tmux pane, killed `| tee` pipeline, dead parent shell), the forked workers re-parent to init (ppid=1) and run forever, each pinning a CPU core — stacked abandoned runs have rendered the whole machine unusable (load avg 36). All `test*` scripts in `package.json` route through `scripts/run-vitest.mjs`, a signal-safe wrapper that runs vitest in its own process group and reaps the ENTIRE group on every exit path (clean exit, signal, or parent death via a `ppid` watchdog). **Always run tests via the `pnpm test*` scripts** — never invoke `vitest` / `pnpm exec vitest` directly, as that bypasses the protection. When killing a test run manually, kill the process group (`kill -- -<pgid>`), not just the parent. After any abnormal interruption, check for orphans: `ps -Ao pid,ppid,command | grep -iE 'node \(vitest' | grep -v grep | awk '$2==1'` (any output = orphans to `kill -9`). Full detail → `long-running-commands` skill.

- **Output-contract single source (World-A / World-B split)** — All output-contract paths, phase values, version constant, and `OutputClassification` type are authored once in `src/lib/output-contract-constants.ts` (World-A). Worker-tools run in a tsx-isolated environment and cannot import World-A modules, so they consume a generated copy at `src/worker-tools/lib/output-contract-paths.generated.ts` (World-B). The generated file carries a `// @generated by scripts/generate-worker-constants.ts — do not edit` header. Run `pnpm generate-worker-constants` to regenerate; CI has a diff gate that fails if the committed copy is stale. Never edit the generated file directly and never duplicate these constants elsewhere.

- **Archetype routes/helpers** — Editing archetype routes or helpers → load `creating-archetypes` FIRST; `enforce_tool_registry`, `archetype-edit-helpers`, and never-block policy are documented there.

### Documentation Freshness (MANDATORY)

**Plan completion rule:** When a plan is fully complete (all tasks `[x]`, final wave passed, user has approved), update AGENTS.md and any other relevant documentation to capture new components, changed conventions, new admin API endpoints, and new DB models before declaring the plan done. This is the last step of every plan.

**Discrepancy rule (MANDATORY — applies at all times, not just plan completion):** Whenever you read any documentation (AGENTS.md, README.md, guides, employee docs, architecture docs) in the course of debugging, investigating, or implementing — if you find anything that is wrong, outdated, or missing relative to what you observe in the actual system, **update the documentation immediately in the same session**. Do not defer. Examples: a guide says to use port 6543 but port 5432 works and 6543 fails → fix the guide; an employee doc references a slug that no longer exists → fix it; AGENTS.md describes a behavior that changed → update it. Documentation rot is a first-class bug.

**Production debugging rule:** When debugging any issue in the **production** environment (Render, Fly.io, Supabase Cloud, Inngest Cloud), load `docs/guides/2026-06-01-2246-production-debugging-guide.md` first. After resolving the issue, update that guide with any new failure modes, commands, or gotchas discovered.

When making code changes that add, remove, or rename any of the following, you MUST update AGENTS.md and/or README.md in the same commit or PR:

**Triggers requiring AGENTS.md update:** New or removed Inngest function · New or removed worker-tool directory under `src/worker-tools/` · New or removed gateway route or service · New Prisma model or significant field additions · New or removed `src/lib/` module · Changes to approved LLM models or employee archetypes · New or removed employee → update `docs/employees/{slug}.md` and add to Reference Documents table · Completion of a "planned change" noted with ⚠️

**Triggers requiring README.md update:** New or removed npm script · New or removed admin API endpoint · New active employee type · Changes to Quick Start or setup flow · New documentation files in `docs/`

See README.md for docs directory structure and naming conventions.

### Documentation Durability (MANDATORY)

**Principle**: Every fact in AGENTS.md or any skill must be _durable_ — true today and true after future commits without needing an edit. Describe patterns, invariants, and where to look — never volatile tallies that a normal code change would invalidate.

**Forbidden (volatile facts)**:

- Counting mutable collections: "Active Functions (7)", "the 6 repository modules", "8 typed interfaces", "expects 1490 passing, 27 skipped" tests, "58 stories", "the 14-model Go list"
- Exact line-number references: "see AGENTS.md line 334", "defined at line 53"
- File line-length claims: "a thin orchestrator (84 lines)", "503-line skill"

**Durable instead**: enumerate the items in a list or table (the list is the source of truth), name the symbol/file, or state the invariant. Example: instead of "Active Functions (7)" write "Active functions (each registered in `src/gateway/inngest/serve.ts`):" + the list; instead of "84 lines" write "a thin orchestrator that only wires step modules".

**Allowed exception — semantic constants**: Named constants that define platform behavior are NOT volatile and MUST be kept: `SYNTHESIS_THRESHOLD = 5`, `MAX_EMPLOYEE_RULES_CHARS = 8000`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000`, DB ports (`5432`/`6543`), the 30-minute `Reviewing` watchdog threshold, version pins (OpenCode `1.14.31`). These are contracts — a deliberate code change would intentionally update them, not incidentally invalidate them.

**One-question heuristic**: "If someone adds or removes one of these tomorrow, does this sentence become a lie? If yes → volatile, enumerate/describe instead. If the number is a configured threshold or contract that a code change would deliberately change (not incidentally invalidate) → semantic constant, keep it."

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E: `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `JIRA_WEBHOOK_SECRET`, `SERVICE_TOKEN`, `ENCRYPTION_KEY`. Slack (required for approval cards): `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, `FLY_WORKER_APP`. See `.env.example` for the full list. **Note**: `WORKER_VM_SIZE`, `SUMMARIZER_VM_SIZE`, and `COST_LIMIT_USD_PER_DEPT_PER_DAY` are now managed via the `platform_settings` DB table — not env vars.

**AI agent rule — new env vars MUST be added to BOTH files (MANDATORY):** Whenever an AI agent introduces a new environment variable — whether referenced via `requireEnv()`/`optionalEnv()`, added to `PLATFORM_ENV_WHITELIST`, or needed by any new feature — it MUST in the same session:

1. Add the var with a full descriptive comment to `.env.example` in the correct section (`.env.example` is the source of truth and is committed to the repo)
2. Add the var with an empty placeholder value and a brief comment to `.env` in the same section (`.env` is gitignored — the user fills in real values here)

**Why both files:** `.env.example` tells every developer what the var does and where to get it. `.env` puts the empty slot directly in front of the user so they can fill it in without hunting. A var that exists in code but not in both files is a bug — the user cannot know it's needed.

**Placement rule:** Insert new vars into the correct named section (e.g., `# Composio`, `# Fly.io`). Never append to the bottom of either file outside a named section.

**GitHub App — per-environment vars**: `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` differ between dev and prod. Dev App points to `https://local-ai-employee.dozaldevs.com`; prod App points to `https://ai-employees-laaa.onrender.com`. Each App has its own private key and webhook secret — never shared between environments. See [GitHub Integration Guide](docs/guides/2026-06-02-1727-github-integration.md) § Multi-Environment Setup.

**Google Integration:**

- `GOOGLE_CLIENT_ID` — OAuth 2.0 client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — OAuth 2.0 client secret from Google Cloud Console
- `GOOGLE_REDIRECT_BASE_URL` — Base URL for OAuth callback (default: `http://localhost:7700`)

**Email:**

- `RESEND_API_KEY` — Resend API key for production email delivery. Leave empty to use Mailpit (local dev). Provider is selected once at startup — restart required to switch.
- `EMAIL_FROM` — Sender address for invitation emails. Default: `DozalDevs <noreply@dozaldevs.com>`. Production uses the `dozaldevs.com` apex domain (verified in Resend; do NOT change to a subdomain without re-verifying).
- `DASHBOARD_BASE_URL` — Base URL for the accept-invite link embedded in invitation emails. Default: `http://localhost:7700`. Production: `https://ai-employees-laaa.onrender.com`. **Must be set correctly in production or all invite links point at localhost.**
- `SMTP_URL` — SMTP connection URL for local Mailpit (used when `RESEND_API_KEY` is absent). Default: `smtp://localhost:54324`. Mailpit web UI: `http://localhost:54325`.

**OpenCode Go (optional)**: `OPENCODE_GO_API_KEY` — when set, the harness automatically routes compatible models through OpenCodeGo ($10/mo flat subscription) instead of OpenRouter. Get a key at https://opencode.ai/auth. Remove the env var to revert all routing to OpenRouter. The Go model list is hardcoded in `src/lib/go-models.ts`.

**Composio (third-party app integrations):**

- `COMPOSIO_API_KEY` — API key for Composio, enabling 1000+ app integrations (Notion, Linear, Gmail, etc.) via the gateway OAuth connect flow and the `/tools/composio/execute.ts` worker shell tool. Get from: https://app.composio.dev → Settings → API Keys. Added to `PLATFORM_ENV_WHITELIST` so it auto-injects into worker containers.

---

## Prometheus Planning — Telegram Notifications (MANDATORY)

Send notifications via: `tsx scripts/telegram-notify.ts "Your message here"`

### Rule 1 — Prometheus: notify when plan is ready

Immediately after writing a plan file to `.sisyphus/plans/`, send: `📋 Plan ready: <plan-name>\n\nCome back to start the work.`

### Rule 2 — Prometheus: final task in every plan

Every plan's TODOs must include: `- [ ] **N. Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.`

### Rule 3 — Atlas fallback: always notify on plan completion

When Atlas finishes executing a plan (all tasks marked `[x]`), send a Telegram notification as the absolute last action:

```bash
PLAN=$(node -e "console.log(require('.sisyphus/boulder.json').plan_name)" 2>/dev/null || echo "plan")
tsx scripts/telegram-notify.ts "✅ ${PLAN} complete — All tasks done. Come back to review results."
```

---

## E2E Testing (MANDATORY — applies to EVERY implementation)

**YOU MUST run a real end-to-end test after implementing any feature or fix. "Code looks correct" is not a substitute for actual execution.**

This is non-negotiable. After any implementation work — whether part of a formal plan or a one-off fix — you MUST:

1. **Run the relevant live path yourself.** If you changed the Slack trigger flow, send an @mention. If you changed a webhook handler, fire the webhook. If you changed task delivery, trigger a task and watch it complete. Do not ask the user to test for you.
2. **Observe real output.** Check logs, Slack messages, DB state. Confirm the feature behaves exactly as intended, end-to-end.
3. **Document what you observed.** When reporting completion, include the task ID, state trace, or log excerpt that proves it worked — not just "I implemented the change."

Without a live test, you cannot detect: gateway restart timing gaps that swallow events, silent failure modes that `log.warn` instead of throwing, state machine transitions that look correct in code but fail at runtime, Slack API errors, Inngest retry failures, or DB write failures.

Every plan for an AI employee feature must include a **real browser E2E validation wave** as the final non-notification step.

**Slack trigger workflow changes require live @mention E2E.** Any plan that modifies the Slack trigger workflow — `app_mention` handler, `slack-trigger-handler`, `interaction-handler`/classifier, confirmation cards, `slack-copy`, or any code in the path from @mention to task dispatch — MUST include all three of the following before the plan passes:

1. **Single-gateway pre-flight**: confirm only one gateway process is running before testing. A stale socket will silently absorb ~50% of test events.
2. **Live @mention → Confirm → Done E2E**: send a real @mention in Slack, click Confirm on the card, then verify `tasks.status = Done` in the DB. Record the task ID and the full `task_status_log` trace.
3. **"Verified from code" or "unit tests pass" is explicitly insufficient** for this workflow — the live Slack path must be exercised.

Full pre-flight scripts, scenario tables, and plan template → load `e2e-testing` skill.

## Reference Documents

Read these on demand when you need deeper context — do not load preemptively.

| Document                                                        | When to Read                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/architecture/CURRENT-ARCHITECTURE.md`                     | Quick visual overview of current topology, trigger paths, approval gate         |
| `docs/architecture/2026-04-14-0104-full-system-vision.md`       | Full architecture, archetypes, lifecycle, multi-tenancy                         |
| `docs/guides/2026-04-16-0310-manual-employee-trigger.md`        | Manual trigger API — endpoints and curl examples                                |
| `docs/guides/2026-04-16-1655-multi-tenancy-guide.md`            | Provisioning tenants, Slack OAuth, per-tenant secrets                           |
| `docs/snapshots/2026-04-29-2255-current-system-state.md`        | Full lifecycle, harness flow, all routes, DB schema, shell tool CLI syntax      |
| `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`            | Adding a shell tool — file structure, CLI pattern, mock fixtures                |
| `docs/testing/2026-05-04-2023-local-e2e-testing.md`             | Local E2E without real APIs — mock conventions, fixture structure               |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`       | Slack UX E2E scenarios A–F (approve, reject, edit, supersede, expiry, failure)  |
| `docs/guides/2026-05-12-1731-api-integration-practices.md`      | Adding or debugging external API integrations                                   |
| `docs/employees/guest-messaging.md`                             | Guest-messaging employee — archetype IDs, inbound flow, gotchas                 |
| `docs/employees/code-rotation.md`                               | Code-rotation employee — archetype IDs, lock IDs, trigger command               |
| `docs/employees/daily-summarizer.md`                            | Summarizer employee — channel IDs, failure diagnostics, cron config             |
| `docs/employees/2026-06-02-1230-engineer.md`                    | Engineer employee — archetype IDs, GitHub App setup, gotchas                    |
| `docs/guides/2026-05-14-0040-slack-tenant-integration.md`       | Slack OAuth or per-tenant token issues — TenantInstallationStore, loadTenantEnv |
| `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`   | Per-developer Slack app setup — Socket Mode, sandbox teamId, xapp- token        |
| `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`    | E2E test guide — creation, execution, approval, delivery, wizard flow           |
| `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md` | Deploying to production — Supabase, Render, Fly.io, CI/CD pipeline              |
| `docs/guides/2026-06-01-2246-production-debugging-guide.md`     | Debugging production — cloud DB queries, Fly.io inspection, Render gotchas      |
| `docs/guides/2026-06-02-1727-github-integration.md`             | GitHub App integration — OAuth, webhook handling, multi-environment setup       |
| `docs/employees/2026-06-03-0243-google-assistant.md`            | Google Workspace Assistant — archetype IDs, tools, tenant secrets               |
| `docs/guides/2026-06-05-0111-maintainability-audit.md`          | Maintainability findings by dimension with file evidence and finding IDs        |
| `docs/guides/2026-06-09-1448-user-auth-rbac.md`                 | User auth and RBAC — JWT flow, SERVICE_TOKEN, invitation flow, cloud setup      |
| `docs/guides/2026-06-10-1118-email-setup.md`                    | Email system — Mailpit vs Resend, env vars, invitation API, known gotchas       |
| `docs/guides/2026-06-12-2030-drift-audit.md`                    | Duplicated platform facts audit — drift risk ratings and target single sources  |
