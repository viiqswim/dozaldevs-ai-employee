# Libraries, Scripts & Project Structure — Verification Notepad

## Source Files Verified

- `src/lib/*.ts` — 15 shared library files (all read individually)
- `package.json` — scripts section (fully read)
- Directory structure — verified with ls/find commands
- `scripts/` — 21 script files
- `docs/` — 28 documentation files
- `tests/` — 152 test files confirmed

---

## Current State

### Shared Libraries (15 files)

| File                            | Purpose                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-version.ts`              | Computes SHA-256 hashes for prompt/model/tool configs and upserts `agent_versions` records in the DB for versioning AI agent configurations                                                               |
| `call-llm.ts`                   | OpenRouter LLM wrapper with model enforcement (only `minimax/minimax-m2.7` and `anthropic/claude-haiku-4-5` allowed), $50/day cost circuit breaker, retry on rate limits, and token cost tracking         |
| `classify-message.ts` ← **NEW** | Pure parser for LLM classification responses — extracts `NEEDS_APPROVAL`/`NO_ACTION_NEEDED` verdict, confidence, draft response, urgency, and booking metadata from raw LLM JSON output; no network calls |
| `encryption.ts`                 | AES-256-GCM encrypt/decrypt for tenant secrets, with key validation and a test helper that asserts no plaintext appears in logs                                                                           |
| `errors.ts`                     | Custom typed error classes: `LLMTimeoutError`, `CostCircuitBreakerError`, `RateLimitExceededError`, `ExternalApiError`, `ProjectRegistryConflictError`                                                    |
| `fly-client.ts`                 | Fly.io Machines API client — `createMachine`, `destroyMachine`, `getMachine` with rate-limit retry and vm_size parsing                                                                                    |
| `github-client.ts`              | GitHub REST API client — `createPR`, `listPRs`, `getPR` with rate-limit detection (handles both 429 and 403 + X-RateLimit-Remaining: 0)                                                                   |
| `jira-client.ts`                | Jira Cloud REST API v3 client — `getIssue`, `addComment`, `transitionIssue` using Basic auth (email:apiToken)                                                                                             |
| `logger.ts`                     | Pino-based structured logger — `createLogger(component)`, `taskLogger(component, taskId)`, `logStep`, `logTool`, `logCost` (tokens only, never dollars), `logTiming`; auto-redacts secrets                |
| `repo-url.ts`                   | GitHub URL normalizer — strips `.git` suffix, parses `owner/repo` from HTTPS GitHub URLs                                                                                                                  |
| `retry.ts`                      | Exponential backoff retry utility — `withRetry(fn, opts)` with configurable `maxAttempts`, `baseDelayMs`, `retryOn` predicate; also exports `sleep(ms)`                                                   |
| `slack-blocks.ts` ← **NEW**     | Builds Slack Block Kit message blocks — currently exports `buildSupersededBlocks()` for marking guest messages superseded by newer pending reviews                                                        |
| `slack-client.ts`               | Slack Web API client — `postMessage` and `updateMessage` via `chat.postMessage`/`chat.update`, with rate-limit retry and proper `ok` field checking                                                       |
| `telegram-client.ts`            | Telegram Bot API client — `createTelegramClient` for `sendMessage`, plus `sendTelegramNotification(text)` convenience function reading credentials from env                                               |
| `tunnel-client.ts`              | Cloudflare Tunnel URL resolver for hybrid mode — reads `TUNNEL_URL` env var; throws with setup guidance if not set                                                                                        |

#### Key Library Details

**`classify-message.ts`**:

- Classifies guest messages as `NEEDS_APPROVAL` (human review required) or `NO_ACTION_NEEDED` (auto-handled)
- Pure parser — reads raw LLM text output, handles markdown code fences, non-JSON early exits, parse failures
- No LLM calls — the actual LLM call happens upstream in `src/gateway/services/interaction-classifier.ts`
- Returns full `ClassifyResult` with: `classification`, `confidence`, `reasoning`, `draftResponse`, `summary`, `category`, `conversationSummary`, `urgency`, and optional booking metadata (guestName, propertyName, checkIn, checkOut, bookingChannel, leadUid, threadUid, messageUid)

**`slack-blocks.ts`**:

- Builds Slack KnownBlock arrays for the guest messaging employee
- `buildSupersededBlocks()` — creates a section block with "⏭️ Superseded" message when a newer guest message makes an earlier one obsolete

---

### Scripts (21 files)

> Non-script items in `scripts/` dir: `long-running-sim` (simulation binary), `vlre-uid-mapping.json` (data file) — excluded from count

| Script                      | pnpm Command                       | Purpose                                                                                                     |
| --------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `setup.ts`                  | `pnpm setup`                       | One-time idempotent setup: Docker Compose services, migrations, seed, Docker image build                    |
| `dev-start.ts`              | `pnpm dev:start`                   | Start all local services (gateway, Inngest dev server)                                                      |
| `dev-start.sh`              | —                                  | Shell version of dev-start (legacy/fallback)                                                                |
| `trigger-task.ts`           | `pnpm trigger-task`                | Send mock Jira webhook and monitor task to completion (E2E trigger)                                         |
| `register-project.ts`       | `pnpm register-project`            | Interactive wizard to register a new project via admin API                                                  |
| `verify-e2e.ts`             | `pnpm verify:e2e --task-id <uuid>` | 12-point E2E verification — checks all lifecycle stages                                                     |
| `verify-e2e.sh`             | —                                  | Shell version of verify-e2e                                                                                 |
| `fly-setup.ts`              | `pnpm fly:setup`                   | Creates the `ai-employee-workers` Fly.io app if it doesn't exist                                            |
| `setup-two-tenants.ts`      | `pnpm setup:two-tenants`           | Interactive wizard to seed DozalDevs + VLRE tenants with credentials                                        |
| `verify-multi-tenancy.ts`   | `pnpm verify:multi-tenancy`        | Verifies both tenants have Slack OAuth tokens and correct channel configs                                   |
| `ensure-infra.sh`           | `pnpm docker:start`                | 3-state idempotent shared infra startup (Docker Compose)                                                    |
| `docker-reset.sh`           | `pnpm docker:reset`                | Destroys and recreates project database only (preserves shared infra)                                       |
| `benchmark-classifier.ts`   | —                                  | LLM classification accuracy benchmark — tests classify-message against sample messages; accepts `--dry-run` |
| `migrate-vlre-kb.ts`        | —                                  | Idempotent migration of VLRE property knowledge base files to platform via Admin API                        |
| `resolve-hostfully-uids.ts` | —                                  | Matches VLRE properties to Hostfully UIDs by fetching all properties from Hostfully API                     |
| `telegram-notify.ts`        | —                                  | CLI tool to send Telegram notifications (used by Prometheus/Atlas plan workflow)                            |
| `verify-supabase.ts`        | —                                  | Verifies local Supabase Docker Compose stack is healthy                                                     |
| `verify-container-boot.sh`  | —                                  | Shell script to verify Docker worker container boots correctly                                              |
| `verify-docker.sh`          | —                                  | Shell script to verify Docker setup is functional                                                           |
| `verify-phase1.sh`          | —                                  | Shell script to verify phase 1 features are working                                                         |
| `generate-jwt-keys.sh`      | —                                  | Generates JWT key pair (used for auth setup)                                                                |

#### Package.json Scripts (full list)

Beyond the `tsx scripts/` commands above, `package.json` also defines:

| Command              | Purpose                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm build`         | `tsc -p tsconfig.build.json` — TypeScript compile                                                      |
| `pnpm dev`           | `tsx src/gateway/server.ts` — run gateway directly                                                     |
| `pnpm start`         | `node dist/gateway/server.js` — run compiled gateway (production)                                      |
| `pnpm lint`          | `eslint .`                                                                                             |
| `pnpm format`        | `prettier --write .`                                                                                   |
| `pnpm format:check`  | `prettier --check .`                                                                                   |
| `pnpm test`          | `vitest`                                                                                               |
| `pnpm fly:image`     | `docker buildx build --platform linux/amd64 --tag registry.fly.io/ai-employee-workers:latest --push .` |
| `pnpm db:migrate`    | `prisma migrate dev`                                                                                   |
| `pnpm db:generate`   | `prisma generate`                                                                                      |
| `pnpm db:seed`       | `tsx prisma/seed.ts`                                                                                   |
| `pnpm test:db:setup` | Creates `ai_employee_test` database (idempotent)                                                       |
| `pnpm db:studio`     | `prisma studio`                                                                                        |
| `pnpm docker:stop`   | `docker compose -f docker/supabase-services.yml down`                                                  |
| `pnpm docker:status` | Lists all containers on `supabase-shared` network                                                      |

---

### Test Files

Count: **152** (verified with `find tests -name "*.test.ts" -type f | wc -l`)

Pre-existing test failures (do not fix):

- `container-boot.test.ts` — requires Docker socket; fails in CI
- `inngest-serve.test.ts` — function count check expects old count
- `tests/inngest/integration.test.ts` — uses Fastify API that no longer exists

---

### Quick Start

```bash
# Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin)
pnpm setup          # One-time: infra, migrations, seed, Docker image
pnpm dev:start      # Start gateway (:7700) + Inngest (:8288)

# Trigger DozalDevs daily summarizer
TENANT=00000000-0000-0000-0000-000000000002
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" \
  -H "Content-Type: application/json" -d '{}'

# Trigger VLRE guest messaging employee
TENANT=00000000-0000-0000-0000-000000000003
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/guest-messaging/trigger" \
  -H "Content-Type: application/json" -d '{}'

# Check task status
TENANT=00000000-0000-0000-0000-000000000002
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT/tasks/<TASK_ID>"

# Manual approval fallback (when button click doesn't work)
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"<SLACK_USER_ID>","userName":"Victor"}}'

# Rebuild Docker image after worker changes (REQUIRED)
docker build -t ai-employee-worker:latest .

# Push to Fly.io registry (hybrid mode)
pnpm fly:image

# Run tests
pnpm test -- --run

# Setup test DB (one-time)
pnpm test:db:setup
```

---

### Project Structure

```
src/
├── gateway/              # Express HTTP server — webhook receiver + Inngest function host
│   ├── routes/           # 11 route handlers (admin CRUD, health, jira, github, slack-oauth)
│   ├── services/         # 11 business logic files (dispatcher, task-creation, project-registry,
│   │                     #   tenant/secret repos, interaction-classifier, kb-repository,
│   │                     #   notification-channel, tenant-env-loader, tenant-integration-repo)
│   ├── slack/            # 2 files: Bolt event/action handlers + OAuth installation store
│   ├── middleware/       # 1 file: admin-auth.ts (X-Admin-Key validation)
│   ├── validation/       # 2 files: Zod schemas + HMAC signature verification
│   ├── inngest/          # 3 files: Inngest client factory, event sender, serve registration
│   ├── server.ts         # Express app entry point (Socket Mode Bolt, Inngest serve)
│   ├── slack-logger.ts   # Slack-specific logging utility
│   └── types.ts          # Shared Express/gateway type definitions
│
├── inngest/              # Durable workflow functions
│   ├── employee-lifecycle.ts   # Universal lifecycle (all states, approval, delivery)
│   ├── interaction-handler.ts  # Unified interaction handler (thread replies + @mentions)
│   ├── rule-extractor.ts       # Rule extraction from guest interactions (ACTIVE)
│   ├── rule-extractor-types.ts # Type definitions for rule extractor
│   ├── lifecycle.ts            # ⚠️ DEPRECATED — engineering task lifecycle
│   ├── redispatch.ts           # ⚠️ DEPRECATED — engineering redispatch
│   ├── watchdog.ts             # ⚠️ DEPRECATED — engineering watchdog cron
│   ├── triggers/         # 5 cron trigger functions:
│   │                     #   summarizer-trigger, feedback-summarizer, guest-message-poller,
│   │                     #   unresponded-message-alert, learned-rules-expiry
│   └── lib/              # 5 shared inngest helpers:
│                         #   create-task-and-dispatch, poll-completion, pending-approvals,
│                         #   quiet-hours, reminder-blocks
│
├── workers/              # Docker container code — runs inside worker machines on Fly.io
│   ├── opencode-harness.mts   # ACTIVE: OpenCode-based harness (15-step flow)
│   ├── orchestrate.mts        # ⚠️ DEPRECATED: Engineering-only ~1100-line orchestrator
│   ├── entrypoint.sh          # ⚠️ DEPRECATED: Engineering worker launcher
│   ├── config/          # Worker config files (agents.md, opencode.json, long-running.ts)
│   ├── lib/             # Worker utilities (deprecated — support orchestrate.mts only,
│   │                    #   except postgrest-client.ts which is shared with harness)
│   └── tools/           # ⚠️ DEPRECATED: Tool registry (replaced by worker-tools/)
│
├── worker-tools/         # Shell tools (TypeScript, executed via tsx in Docker at /tools/)
│   ├── slack/            # post-message.ts, read-channels.ts, post-guest-approval.ts,
│   │                     #   post-no-action-notification.ts
│   ├── hostfully/        # 7 files: get-messages, get-properties, get-property,
│   │                     #   get-reservations, get-reviews, send-message, validate-env
│   ├── knowledge_base/   # search.ts — KB semantic search tool
│   └── platform/         # report-issue.ts — platform issue reporting tool
│
└── lib/                  # 15 shared library files (see table above)

prisma/                   # Schema (23 models), 26 migrations, seed.ts
scripts/                  # 21 script files (TypeScript + shell)
docker/                   # Supabase self-hosted Docker Compose
docs/                     # 28 .md documentation files
tests/                    # 152 test files (Vitest)
```

---

### Reference Documents

> Skip the early phase docs (phase1–phase8) unless debugging their specific features. Focus on the current-state and architecture docs.

| Document                                                            | When to Read                                                                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/2026-04-24-1452-current-system-state.md`                      | **START HERE** — latest ground-truth snapshot: full lifecycle, harness flow (15 steps), all 18+ admin routes, DB schema, shell tool CLI syntax, Docker services |
| `docs/2026-04-14-0104-full-system-vision.md`                        | Architecture deep-dive: archetypes, lifecycle, event routing, operating modes, multi-tenancy design                                                             |
| `docs/2026-04-21-2202-phase1-story-map.md`                          | Phase 1 story map: 58 stories across 5 releases — pending/planned work, PLAT-05 through PLAT-10 planned changes                                                 |
| `docs/2026-04-21-1813-product-roadmap.md`                           | Product roadmap: 4 phases, design partner strategy, success criteria                                                                                            |
| `docs/2026-04-16-1655-multi-tenancy-guide.md`                       | Provisioning tenants, Slack OAuth, per-tenant secrets, verification                                                                                             |
| `docs/2026-04-16-0310-manual-employee-trigger.md`                   | Manual employee trigger API — endpoints, curl examples, how it works                                                                                            |
| `docs/2026-04-16-1811-slack-oauth-setup-guide.md`                   | Slack OAuth setup: app creation, redirect URIs, Socket Mode, installation flow                                                                                  |
| `docs/2026-04-15-1910-summarizer-overview.md`                       | Papi Chulo summarizer: architecture, channel config, approval flow                                                                                              |
| `docs/2026-04-14-0057-worker-post-redesign-overview.md`             | Worker redesign scope: before/after, files added/removed, deprecated components                                                                                 |
| `docs/2026-04-08-1357-project-registration-and-development-loop.md` | Register projects, trigger AI development, get a PR (engineering employee)                                                                                      |
| `docs/2026-04-07-1732-hybrid-mode-current-state.md`                 | Hybrid mode (local Supabase + Fly.io workers): setup, Cloudflare Tunnel, env vars                                                                               |
| `docs/2026-04-01-1726-system-overview.md`                           | Original complete architecture, data flow, local setup (pre-multi-tenancy)                                                                                      |
| `docs/2026-04-01-2110-troubleshooting.md`                           | Common E2E failures with symptoms and fixes                                                                                                                     |
| `docs/2026-03-22-2317-ai-employee-architecture.md`                  | Original detailed architecture (data model, security, scaling, cost estimates)                                                                                  |
| `docs/2026-04-03-1251-supabase-infrastructure.md`                   | Supabase infrastructure: Docker Compose setup, why not supabase start                                                                                           |
| Phase docs (`phase1`–`phase8`, `mvp-implementation-phases`)         | Historical implementation notes — only read if debugging the specific phase's features                                                                          |

---

## Changes from April 24 Doc

| Category    | April 24 Count | April 29 Count | Delta |
| ----------- | -------------- | -------------- | ----- |
| Shared libs | 13             | 15             | +2    |
| Scripts     | 12             | 21             | +9    |
| Test files  | 118            | 152            | +34   |
| Docs        | 24             | 28             | +4    |

## New Content (not in old doc)

### New Shared Libraries

- `classify-message.ts` — pure parser for LLM guest message classification results
- `slack-blocks.ts` — Slack Block Kit builder for guest messaging employee (superseded blocks)
- `telegram-client.ts` — counted as "new" (was present but not in old doc's 13-lib count)

### New Scripts (vs old 12)

| Script                      | Purpose                                           |
| --------------------------- | ------------------------------------------------- |
| `benchmark-classifier.ts`   | LLM classification accuracy benchmark             |
| `docker-reset.sh`           | Docker database reset helper                      |
| `fly-setup.ts`              | Fly.io app creation (`pnpm fly:setup`)            |
| `generate-jwt-keys.sh`      | JWT key pair generation                           |
| `migrate-vlre-kb.ts`        | VLRE knowledge base migration                     |
| `resolve-hostfully-uids.ts` | Match VLRE properties to Hostfully UIDs           |
| `setup-two-tenants.ts`      | Two-tenant seed wizard (`pnpm setup:two-tenants`) |
| `telegram-notify.ts`        | CLI Telegram notification sender                  |
| `verify-phase1.sh`          | Phase 1 feature verification shell script         |

### New Docs

- `2026-04-15-1910-summarizer-overview.md`
- `2026-04-16-1811-slack-oauth-setup-guide.md`
- `2026-04-16-2149-current-system-state.md`
- `2026-04-17-1408-current-system-state.md`

## Unresolved

- `src/workers/config/long-running.ts` purpose not read — appears to be worker config for long-running session support
- Pre-existing LSP errors in `kb-repository.ts`, `seed.ts`, and tests (`knowledgeBaseEntry` → Prisma client mismatch, `create-task-and-dispatch.test.ts` missing `tenantId`) — these are pre-existing and out of scope for this task

---

## T12 Assembly Note

T12 (document assembly) completed on April 29, 2026. Output: `docs/2026-04-29-2255-current-system-state.md`. All 11 notepad files read and assembled into the final document. All 4 Mermaid diagrams included. Zero [UNVERIFIED] markers in final output. All counts match verified ground truth (23 models, 13 tools, 11 functions, 26 migrations, 15 libs, 21 scripts, 152 tests).
