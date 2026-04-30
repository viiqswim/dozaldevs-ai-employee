# Docker & Infrastructure — Verification Notepad

## Source Files Verified

- `Dockerfile` — container build (83 lines, 2-stage)
- `docker/shared-infra.yml` — shared services (PostgreSQL, Mailpit, Redis)
- `docker/supabase-services.yml` — per-project services (Auth/GoTrue, Kong, PostgREST)
- `scripts/ensure-infra.sh` — 3-state idempotent startup logic (201 lines)
- `src/workers/config/agents.md` — static platform AGENTS.md (6 sections)
- `src/workers/lib/agents-md-resolver.mts` — 3-level AGENTS.md concatenation
- `src/lib/telegram-client.ts` — Telegram notification client
- `scripts/telegram-notify.ts` — CLI wrapper for Telegram
- `src/worker-tools/platform/report-issue.ts` — issue reporting shell tool

---

## Current State

### Local Infrastructure (Split Compose)

#### `docker/shared-infra.yml` — Shared across all local projects

| Container         | Image                                         | Host Port                     | Purpose                             |
| ----------------- | --------------------------------------------- | ----------------------------- | ----------------------------------- |
| `shared-postgres` | `public.ecr.aws/supabase/postgres:17.6.1.064` | `54322`                       | PostgreSQL (shared by all projects) |
| `shared-mailpit`  | `axllent/mailpit:latest`                      | `54325` (web), `54324` (SMTP) | Email testing UI + SMTP relay       |
| `shared-redis`    | `redis:7-alpine`                              | `6379`                        | Redis cache/queue                   |

Network: `supabase-shared` (external bridge, shared across projects)

#### `docker/supabase-services.yml` — Per-project (ai-employee)

| Container          | Image                       | Host Port            | Purpose                    |
| ------------------ | --------------------------- | -------------------- | -------------------------- |
| `ai-employee-auth` | `supabase/gotrue:v2.186.0`  | internal only (9999) | Auth/JWT (GoTrue)          |
| `ai-employee-kong` | `kong/kong:3.9.1`           | `54331`              | API gateway (Supabase URL) |
| `ai-employee-rest` | `postgrest/postgrest:v14.6` | internal only        | PostgREST REST API         |

Networks: `supabase-shared` (external) + `ai-employee-internal` (bridge)

**Note**: `ai-employee-rest` has no published host port — accessed only through Kong at `54331` from outside, or directly container-to-container on `ai-employee-internal`.

---

### `scripts/ensure-infra.sh` — 3-State Idempotent Logic

Detects infrastructure state by checking container running status, then acts:

| State        | Detection                                                                       | Action                                                                                                              |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **FRESH**    | `shared-postgres` not running                                                   | Create network → start `shared-infra.yml` → wait healthy → create DB → run init SQL → start `supabase-services.yml` |
| **PARTIAL**  | `shared-postgres` running, `ai-employee-auth` or `ai-employee-kong` not running | Check if DB exists → init if missing → start `supabase-services.yml` only                                           |
| **COMPLETE** | Both `shared-postgres` AND (`ai-employee-auth` + `ai-employee-kong`) running    | No-op, print status, exit 0                                                                                         |

DB init steps (FRESH/PARTIAL if DB missing):

1. `CREATE DATABASE ai_employee`
2. Run all `docker/init/*.sql` files in sort order
3. Set `supabase_auth_admin` password
4. Configure `supabase_auth_admin` search_path
5. Grant `postgres` user access to `auth` schema
6. Mark GoTrue bootstrap migration `00` as applied

---

### Dockerfile (Worker Container) — 2-Stage Build

**Stage 1 — builder** (`node:20-slim`):

- Enables corepack/pnpm
- Installs all deps (`pnpm install --frozen-lockfile`)
- Generates Prisma client
- Compiles TypeScript (`pnpm build`)
- Prunes to prod deps only

**Stage 2 — runtime** (`node:20-slim`):

System packages (`apt-get install`):

- `git`, `curl`, `bash`, `jq`, `ca-certificates`
- `fuse-overlayfs`, `uidmap` — rootless Docker support on Fly.io (no privileged containers required)

GitHub CLI: **gh v2.45.0** (downloaded from `cli/cli/releases/download/v2.45.0/`)

Global npm packages:

- **`opencode-ai@1.3.3`** — OpenCode AI coding agent
- **`tsx`** (latest at build time) — TypeScript runner for shell tools

Default CMD: `["bash", "entrypoint.sh"]`

---

### Tools Installed in Image

| Docker Path              | Source Path                        | Contents                                                                                                                                 |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/tools/slack/`          | `src/worker-tools/slack/`          | `post-message.ts`, `read-channels.ts` + `@slack/web-api@^7.15.1`                                                                         |
| `/tools/hostfully/`      | `src/worker-tools/hostfully/`      | `validate-env.ts`, `get-property.ts`, `get-properties.ts`, `get-reservations.ts`, `get-messages.ts`, `get-reviews.ts`, `send-message.ts` |
| `/tools/platform/`       | `src/worker-tools/platform/`       | `report-issue.ts`                                                                                                                        |
| `/tools/knowledge_base/` | `src/worker-tools/knowledge_base/` | `search.ts`                                                                                                                              |
| `/app/AGENTS.md`         | `src/workers/config/agents.md`     | Static platform AGENTS.md (injected as base layer of 3-level resolution)                                                                 |
| `/app/opencode.json`     | `src/workers/config/opencode.json` | OpenCode session config                                                                                                                  |

---

### Deployment Commands

**Local Docker build:**

```bash
docker build -t ai-employee-worker:latest .
```

**Fly.io image push:**

```bash
pnpm fly:image   # builds + pushes to Fly.io registry
```

**Fly.io machine CMD** (used at dispatch time):

```
["node", "/app/dist/workers/opencode-harness.mjs"]
```

Note: `entrypoint.sh` (CMD default) is the deprecated engineering worker entrypoint. The opencode harness is invoked via explicit CMD override in Fly.io machine dispatch.

---

### Platform Infrastructure Additions

#### Configurable AGENTS.md — 3-Level Fallback

Source: `src/workers/lib/agents-md-resolver.mts`

The harness constructs `AGENTS.md` by concatenating up to 3 layers:

| Level                         | Source                                      | Header                    |
| ----------------------------- | ------------------------------------------- | ------------------------- |
| 1 — Platform (always present) | `/app/AGENTS.md` (static, baked into image) | `# Platform Policy`       |
| 2 — Tenant (optional)         | `tenants.config.default_agents_md` (DB)     | `# Tenant Conventions`    |
| 3 — Archetype (optional)      | `archetypes.agents_md` (DB)                 | `# Employee Instructions` |

Layers 2 and 3 are omitted if their DB field is null or whitespace-only. The three sections are joined with `\n\n`. The resolved string is written to the working directory so OpenCode picks it up as its AGENTS.md.

Platform AGENTS.md encodes 6 mandatory policies:

1. **Source access** — read any `/tools/` file freely when debugging
2. **Patch permission** — edit `/tools/*.ts` only, temp for session
3. **Smoke test** — `--help` required after every patch
4. **Mandatory issue reporting** — report all tool issues before task ends
5. **Platform off-limits** — never modify `/app/dist/` or `/app/node_modules/`
6. **DB via tools only** — no direct `psql`, `curl` to PostgREST, or raw SQL

#### Issue Reporting (`system_events` table)

Source: `src/worker-tools/platform/report-issue.ts` → installed at `/tools/platform/report-issue.ts`

Workers call this when they encounter tool failures, unexpected behavior, or apply patches.

**CLI:**

```bash
tsx /tools/platform/report-issue.ts \
  --task-id "$TASK_ID" \
  --tool-name "<tool-name>" \
  --description "<what broke and what you did>" \
  [--patch-diff "<unified diff>"]
```

**What it does:**

1. POSTs to `{SUPABASE_URL}/rest/v1/system_events` — creates a durable record with `tenant_id`, `task_id`, `tool_name`, `issue_description`, `patch_applied` (bool), optional `patch_diff`
2. If `ISSUES_SLACK_CHANNEL` is set, posts a Slack alert with task ID, tool name, and description
3. Slack failure is non-fatal (logged to stderr, exit 0 still on DB success)

**Required env vars:**

- `SUPABASE_URL` — PostgREST base URL
- `SUPABASE_SECRET_KEY` — service role JWT
- `TENANT_ID` — tenant UUID
- `SLACK_BOT_TOKEN` — Slack bot token

**Optional env vars:**

- `ISSUES_SLACK_CHANNEL` — Slack channel ID for alerts (skip if unset)
- `SLACK_API_BASE_URL` — defaults to `https://slack.com/api`

**Output:** `{ "ok": true, "event_id": "<uuid>" }` on stdout.
**Exit codes:** 0 = DB write succeeded; 1 = DB write failed / missing required arg / missing required env var.

#### Telegram Notifications

Source: `src/lib/telegram-client.ts` + `scripts/telegram-notify.ts`

**Library** (`createTelegramClient` / `sendTelegramNotification`):

- Calls `https://api.telegram.org/bot{token}/sendMessage`
- Handles 429 rate limiting with retry (maxAttempts: 2, baseDelay: 1000ms)
- `sendTelegramNotification(text)` — convenience function; reads `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` from env, silently skips if either is missing

**CLI wrapper** (`scripts/telegram-notify.ts`):

- Loads `.env` file manually (no dotenv dependency — reads and parses in-script)
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from env or `.env`
- Usage: `tsx scripts/telegram-notify.ts "Your message here"`

**Required env vars:**

- `TELEGRAM_BOT_TOKEN` — Telegram Bot API token
- `TELEGRAM_CHAT_ID` — target chat/channel ID

**Mandatory use** per AGENTS.md (Prometheus/Atlas rules):

- Prometheus sends `📋 Plan ready: <plan-name>` immediately after writing plan to `.sisyphus/plans/`
- Every plan includes a final "Notify completion" task
- Atlas sends `✅ <plan_name> complete — All tasks done` as absolute last action after completing any plan

---

## Changes from April 24 Doc

- opencode-ai version: **1.3.3** — unchanged (confirmed)
- gh version: **v2.45.0** — unchanged (confirmed)
- System packages: unchanged (git, curl, bash, jq, ca-certificates, fuse-overlayfs, uidmap)
- New additions since April 24:
  - `/tools/platform/report-issue.ts` added to Docker image
  - `/tools/knowledge_base/search.ts` added to Docker image
  - `src/workers/lib/agents-md-resolver.mts` — new 3-level AGENTS.md resolution
  - `src/lib/telegram-client.ts` + `scripts/telegram-notify.ts` — new Telegram notification pipeline
  - `scripts/ensure-infra.sh` — replaces old `docker/docker-compose.yml` startup approach with 3-state idempotent script

---

## Unresolved

- `tsx` version in image is unversioned (`npm install -g tsx` — no pinned version). Exact version depends on latest at build time. [UNVERIFIED — would need `docker run ai-employee-worker tsx --version`]
- `axllent/mailpit:latest` — no pinned tag; exact version depends on pull time. [UNVERIFIED for current built image]
