# AI Employee Platform — Agent Guide

> Keep this file concise and current. Only include information that helps agents make correct decisions. For architectural details, read the vision doc on demand — don't duplicate it here. This file is loaded into every LLM call — every token here costs tokens on every turn.

## Approved LLM Models

**CRITICAL CONSTRAINT — NEVER VIOLATE:**

Only TWO LLM models are approved for use in this codebase. Using any other model is a bug.

| Model            | ID                           | Purpose                                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| MiniMax M2.7     | `minimax/minimax-m2.7`       | Primary execution model — all employee work, code generation, summaries                     |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` | Verification/judge only — plan verification, intent classification, feedback acknowledgment |

**Forbidden models (any reference = bug):** `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, `openai/gpt-4o-mini`, or any other model not listed above.

This applies to: production code, seed data, default fallbacks, environment variable examples, and test fixtures. No exceptions.

## Deprecated Components

The following components are deprecated. Do NOT modify, do NOT add features, do NOT fix bugs in these files unless the user explicitly instructs you to work on them:

| Component                       | File                                              | Reason                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering task lifecycle      | `src/inngest/lifecycle.ts`                        | Engineering employee is on hold. All active development targets the unified employee lifecycle in `src/inngest/employee-lifecycle.ts`.                                                                        |
| Engineering task redispatch     | `src/inngest/redispatch.ts`                       | Paired with the deprecated engineering lifecycle.                                                                                                                                                             |
| Generic worker harness          | `src/workers/generic-harness.mts`                 | Replaced by the OpenCode-based harness (`src/workers/opencode-harness.mts`). Source file has been deleted; stale compiled artifacts may remain in `dist/`.                                                    |
| Tool registry                   | `src/workers/tools/registry.ts`                   | Part of the generic harness. Replaced by shell scripts at `src/worker-tools/`.                                                                                                                                |
| Engineering watchdog cron       | `src/inngest/watchdog.ts`                         | Cron (`*/10 * * * *`) that detects stuck engineering tasks. On hold with the engineering employee; still registered, do not modify.                                                                           |
| Engineering worker orchestrator | `src/workers/orchestrate.mts`                     | Engineering-only worker — ~1100-line orchestrator for planning, wave execution, fix loops, and PR creation. On hold; do not modify.                                                                           |
| Engineering worker launcher     | `src/workers/entrypoint.sh`                       | Default Dockerfile CMD; shells out to `orchestrate.mts`. Engineering only — on hold, do not modify.                                                                                                           |
| Engineering worker libraries    | `src/workers/lib/` (except `postgrest-client.ts`) | 30 utilities exclusively supporting `orchestrate.mts` (wave executor, PR manager, session manager, etc.). On hold — do not modify. `postgrest-client.ts` is shared with `opencode-harness.mts` and is active. |

## Platform Vision

A single-responsibility AI Employee Platform — deploys autonomous AI agents ("digital employees"), each with one job. Every employee follows the same lifecycle, uses the same infrastructure (Inngest orchestration, Supabase state, Fly.io runtime), and is defined by a declarative archetype config. What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds). Full architecture: `docs/architecture/2026-04-14-0104-full-system-vision.md`

## Current Implementation

| Employee                | Status        | Trigger                   | Operational Details                  |
| ----------------------- | ------------- | ------------------------- | ------------------------------------ |
| Summarizer (Papi Chulo) | Active        | Daily cron (cron-job.org) | `docs/employees/daily-summarizer.md` |
| Guest-Messaging (VLRE)  | Active        | Hostfully webhook         | `docs/employees/guest-messaging.md`  |
| Code-Rotation (VLRE)    | Active        | Manual (admin API)        | `docs/employees/code-rotation.md`    |
| Engineering             | ⚠️ DEPRECATED | Jira webhook              | See Deprecated Components            |

## Adding a New Employee

1. Seed a new `archetypes` record: `role_name`, `system_prompt`, `instructions`, `model` (`minimax/minimax-m2.7`), `deliverable_type`, `runtime: 'opencode'`. Optional: `agents_md`, `delivery_instructions`, `notification_channel`, `enrichment_adapter`, `vm_size`.
2. If shell tools needed: add TypeScript scripts to `src/worker-tools/{service}/`. Follow the [Shell Tool Checklist](docs/guides/2026-05-04-1645-adding-a-shell-tool.md).
3. Create `docs/employees/{slug}.md` with operational details (trigger, archetype IDs, channel IDs, gotchas, test resources).
4. For **scheduled triggers**: configure cron on cron-job.org → `POST /admin/tenants/:tenantId/employees/:slug/trigger`.
5. For **webhook triggers**: add route handler in `src/gateway/routes/`.
6. Add entry to Reference Documents table in AGENTS.md pointing to `docs/employees/{slug}.md`.
7. Rebuild Docker image: `docker build -t ai-employee-worker:latest .`

**Approval gate**: Controlled per-archetype via `risk_model.approval_required`. When `false`, lifecycle short-circuits from `Submitting` directly to `Done`.

## OpenCode Worker (All Employees)

All non-deprecated employees use the OpenCode-based harness on Fly.io:

- **Harness**: `src/workers/opencode-harness.mts` — reads archetype from DB, starts OpenCode session, injects `instructions` + available tools, monitors until completion
- **Shell tools** at `/tools/` in Docker image: `slack/` (post messages, read channels), `sifely/` (lock management, code rotation), `hostfully/` (messages, properties, reservations), `knowledge_base/` (search), `platform/` (logging). Full CLI syntax: load `tool-usage-reference` skill.
- **Sifely tools** (`/tools/sifely/`):
  - `tsx /tools/sifely/list-locks.ts` — list all locks
  - `tsx /tools/sifely/list-passcodes.ts --lock-id <id>` — list passcodes for a lock
  - `tsx /tools/sifely/list-access-records.ts --lock-id <id> [--start-date <ms>] [--end-date <ms>] [--human]` — list access records; `--start-date`/`--end-date` optional (defaults: last 7 days → now); `--human` adds `recordTypeLabel` field (e.g. "Fingerprint", "Passcode", "Auto-Lock"); auto-paginates to fetch ALL records
  - `tsx /tools/sifely/create-passcode.ts --lock-id <id> --name "Name" --code "1234"` — create permanent passcode
  - `tsx /tools/sifely/update-passcode.ts --lock-id <id> --passcode-id <id> [--code "digits"] [--name "Name"]` — update passcode
  - `tsx /tools/sifely/delete-passcode.ts --lock-id <id> --passcode-id <id>` — delete passcode
  - `tsx /tools/sifely/generate-code.ts [--length 4|5|6] [--exclude-codes "1221,2332"]` — generate memorable code
  - `tsx /tools/sifely/rotate-property-code.ts --property-id <uid>` — rotate all lock codes for a property
  - `tsx /tools/sifely/diagnose-access.ts --property-id <uid>` — diagnose lock access issues
- **Hostfully tools** (`/tools/hostfully/`):
  - `tsx /tools/hostfully/get-door-code.ts --property-id <uid>` — read door code from Hostfully
  - `tsx /tools/hostfully/update-door-code.ts --property-id <uid> --code <digits>` — update door code
- **OpenCode version — CRITICAL**: Pinned to `1.14.31`. Version `1.14.33` has a confirmed 6-second exit regression. **Never upgrade without explicit testing.**
- **`WORKER_RUNTIME` flag**: `docker` = local containers (default), `fly` = Fly.io machines (requires `TUNNEL_URL`).
- **Task-fetch-first**: Harness fetches task from DB before starting OpenCode. Fake `TASK_ID` exits at "Task not found" — OpenCode never launches.
- **`autoupdate: false`**: Must be set in `src/workers/config/opencode.json` and `~/.config/opencode/opencode.json`.
- **Lifecycle**: `src/inngest/employee-lifecycle.ts` — states: Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done. Terminal: `Failed`, `Cancelled`.
- **Inngest functions** (active — 5): `employee/universal-lifecycle`, `employee/interaction-handler` (intent classification, `feedback_events`), `employee/rule-extractor` (`employee_rules`), `employee/rule-synthesizer` (`SYNTHESIS_THRESHOLD` = 5), `trigger/reviewing-watchdog` (15-min cron, marks stuck `Reviewing` → `Failed` after 30 min).
- **Inngest functions** (deregistered): `trigger/feedback-summarizer` (DELETED), `trigger/daily-summarizer` (DELETED — external cron), `trigger/guest-message-poll` (preserved at `src/inngest/triggers/guest-message-poll.ts`), 3 deprecated engineering functions.
- **Output contract**: OpenCode writes `/tmp/summary.txt` and `/tmp/approval-message.json`. Absence of BOTH is a hard failure.
- **CRITICAL — Rebuild after every worker change**: Changes to `src/workers/` require a Docker image rebuild. `src/worker-tools/` is bind-mounted in local Docker mode — no rebuild needed for tool changes locally.

## Skills System

Skills are on-demand knowledge modules loaded by OpenCode agents. Before any non-trivial task, scan this list — if the domain overlaps, call `skill(name="skill-name")` before starting. Skills are free to load.

| If you are about to…                                              | Load this skill        |
| ----------------------------------------------------------------- | ---------------------- |
| Create or modify a shell tool in `src/worker-tools/`              | `adding-shell-tools`   |
| Debug a stuck or failed task in the lifecycle                     | `debugging-lifecycle`  |
| Add or configure a new employee archetype                         | `creating-archetypes`  |
| Call any Hostfully API or fix a Hostfully integration             | `hostfully-api`        |
| Run or write E2E tests                                            | `e2e-testing`          |
| Call any shell tool inside a worker container                     | `tool-usage-reference` |
| Pass UUIDs (lead_uid, thread_uid, property_uid, etc.) to any tool | `uuid-disambiguation`  |

**Employee skills** (baked into Docker image via `COPY src/workers/skills/ /app/.opencode/skills/`):

| Skill                  | Description                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-usage-reference` | Exact CLI syntax, required flags, output JSON shapes, and critical warnings for all shell tools in the container (`/tools/slack/`, `/tools/hostfully/`, `/tools/sifely/`, `/tools/knowledge_base/`, `/tools/platform/`) |
| `uuid-disambiguation`  | All UUID types in the system (lead_uid, thread_uid, property_uid, message_uid, task_id, tenant_id), their sources, env var names, and the critical rule that lead_uid and thread_uid are never the same value           |

**Dev skills** (project-level at `.opencode/skills/`):

| Skill                 | Description                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adding-shell-tools`  | File structure, CLI pattern, TypeScript conventions, mock fixture support, Docker integration, and AGENTS.md documentation requirements for new shell tool scripts                                                              |
| `debugging-lifecycle` | All 13 lifecycle states, auto-pass vs blocking states, stuck-state diagnostics, approval flow debugging, reviewing-watchdog behavior, and admin API commands for task status checking                                           |
| `creating-archetypes` | All archetype schema fields, seed data patterns, trigger setup, the `loadTenantEnv()` injection pipeline, approved models, and the 4-step checklist for deploying a new employee end-to-end                                     |
| `hostfully-api`       | Response envelope patterns, known API quirks, shell tool CLI syntax, and UUID disambiguation for Hostfully message retrieval, sending, and property/reservation lookups                                                         |
| `e2e-testing`         | Prerequisites checklist, per-employee trigger methods, Playwright browser automation via CDP, state verification via `task_status_log`, and the full scenario library (Slack UX scenarios A–F, Feedback Pipeline scenarios A–F) |

New skill: create `src/workers/skills/{name}/SKILL.md` (employee — rebuild Docker) or `.opencode/skills/{name}/SKILL.md` (dev — commit). Pattern: `^[a-z0-9]+(-[a-z0-9]+)*$`.

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

**`SLACK_BOT_TOKEN` in `.env` is the VLRE workspace bot token only.** It cannot access DozalDevs channels. Never store it as the DozalDevs tenant secret.

For Slack OAuth setup and per-tenant token architecture, see `docs/guides/2026-05-14-0040-slack-tenant-integration.md`.

## Slack Interactive Buttons — Socket Mode (CRITICAL)

**The Slack app uses Socket Mode. NEVER ask the user to configure an Interactivity Request URL.**

- `SLACK_APP_TOKEN=xapp-...` enables Bolt Socket Mode automatically — confirmed working when gateway logs show `"Slack Bolt — Socket Mode connected"`.
- If a button click does not reach the gateway, it is a **transient WebSocket drop**. Do NOT change Slack app settings.

**Manual approval fallback** (use when button click doesn't work):

```bash
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"<SLACK_USER_ID>","userName":"Victor"}}'
```

## Slack Message Standards

**REQUIRED on every message sent to Slack — no exceptions:**

1. **Task ID context block** — every message must include a trailing `context` block with the task ID as small gray metadata:
   ```json
   { "type": "context", "elements": [{ "type": "mrkdwn", "text": "Task `<taskId>`" }] }
   ```
2. **User mention for actions** — use `<@userId>` mrkdwn syntax (never raw username strings). `userId` available from `actionBody.user.id` in handlers.

**Reference implementation**: `src/inngest/employee-lifecycle.ts` (`handle-approval-result` step) and `src/worker-tools/slack/post-message.ts` (`buildApprovalBlocks`).

## Slack Message Hygiene (MANDATORY — No Message Accumulation)

Every task gets ONE primary top-level Slack message per channel. All status progressions MUST use one of:

1. **Replace in place** via `chat.update` — capture `ts` from `postMessage` return value
2. **Thread replies** via `thread_ts` — post follow-up context as replies to the original message

**Rules:**

- NEVER discard a `ts` return value from `postMessage`. Capture and pass `{ ts, channel }` through Inngest steps.
- Every terminal state (Done, Failed, Cancelled) MUST update the original "Task received" notification to reflect the final outcome — never leave it frozen at "⏳ processing".
- The approval card (`pending_approvals.slack_ts`) and the notify-received message are separate — both must be updated at terminal states.

**Reference**: `src/inngest/employee-lifecycle.ts` — `notify-received` (captures ts), `handle-approval-result` (updates both), `mark-failed` (updates to ❌ Failed).

## Admin API

- `POST /admin/tenants/:tenantId/employees/:slug/trigger` — creates task, returns 202 + `{ task_id, status_url }`. Add `?dry_run=true` to validate without creating.
- `GET /admin/tenants/:tenantId/tasks/:id` — check task status (tenant-scoped, 404 on cross-tenant access)
- `GET /admin/tools` — list all available shell tools with parsed metadata (description, flags, env vars, output shape, SKILL.md enrichment)
- `GET /admin/tools/:service/:toolName` — get full metadata for a single tool

Auth: `X-Admin-Key: $ADMIN_API_KEY`. Full route table: `docs/snapshots/2026-04-20-1314-current-system-state.md` § Gateway and Routes.

```bash
TENANT=00000000-0000-0000-0000-000000000002
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
```

## Commands

| Action           | Command                            |
| ---------------- | ---------------------------------- |
| First-time setup | `pnpm setup`                       |
| Start services   | `pnpm dev`                         |
| Run tests        | `pnpm test -- --run`               |
| Setup test DB    | `pnpm test:db:setup`               |
| Lint             | `pnpm lint`                        |
| Build            | `pnpm build`                       |
| Trigger E2E task | `pnpm trigger-task`                |
| Verify E2E       | `pnpm verify:e2e --task-id <uuid>` |

Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin).

## Pre-existing Test Failures

Do NOT attempt to fix these — they are unrelated to any recent changes:

- `container-boot.test.ts` — requires Docker socket; all 4 tests skip via `describe.skipIf` when Docker is unavailable
- `inngest-serve.test.ts` — function count check hardcodes `function_count === 2` but 9 functions are registered; stale assertion, do not fix

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma`; **REST API**: Supabase PostgREST on `http://localhost:54331`
- **Test DB**: `ai_employee_test` — setup via `pnpm test:db:setup` (one-time, idempotent). Safety guard: `globalSetup` throws if `DATABASE_URL` doesn't contain `ai_employee_test`.

## Infrastructure

Uses **Docker Compose** (`docker/docker-compose.yml`) instead of `supabase start` — the CLI hardcodes `database: postgres`, which would break PostgREST. `POSTGRES_DB=ai_employee` in `docker/.env` makes all services use the right database. **CRITICAL — Rebuild after every worker change**: Changes to `src/workers/` require a Docker image rebuild. `src/worker-tools/` is bind-mounted in local Docker mode — no rebuild needed for tool changes locally. Gateway/Inngest code changes take effect immediately via `tsx watch`.

```bash
docker build -t ai-employee-worker:latest . && pnpm trigger-task
```

## Project Structure

```
src/
├── gateway/      # Express HTTP server — webhook receiver + Inngest function host
│   ├── routes/       # All HTTP route handlers
│   ├── slack/        # Bolt event/action handlers + OAuth installation store
│   ├── middleware/   # Admin auth middleware
│   ├── validation/   # Zod schemas + HMAC signature verification
│   ├── services/     # Business logic: dispatcher, task creation, project registry, tenant/secret repos
│   └── inngest/      # Inngest client factory, event sender, serve registration
├── inngest/      # Durable workflow functions: lifecycle, watchdog, redispatch
│   ├── triggers/     # Cron trigger functions (guest-message-poll; daily-summarizer deregistered)
│   └── lib/          # Shared: create-task-and-dispatch, poll-completion, pending-approvals, quiet-hours, reminder-blocks
├── workers/      # Docker container code — runs inside the worker machine
├── worker-tools/ # Shell tools (TypeScript, executed via tsx in Docker at /tools/)
└── lib/          # Shared: fly-client, github-client, slack-client, jira-client, call-llm (model enforcement + $50/day cost circuit breaker), encryption (AES-256-GCM for tenant secrets), logger, retry, errors, tunnel-client, repo-url, agent-version, classify-message, hostfully-precheck, slack-blocks, telegram-client
prisma/           # Schema (24 models), 28 migrations, seed
scripts/          # TypeScript scripts run via tsx (setup, trigger, verify)
```

## Key Conventions

- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`
- Employee behavior is config-driven (archetype pattern), not hardcoded orchestration logic
- **Multi-tenancy is mandatory** — every table, registry, catalog, and query must be scoped by `tenant_id`. When adding any new data structure, ask: "Is this tenant-isolated?" If not, it's a bug.
- **Shared files must stay employee-agnostic** — `src/inngest/employee-lifecycle.ts`, `src/workers/opencode-harness.mts`, and any file under `src/gateway/` or `src/lib/` serve ALL employees. Never use employee-specific language (e.g. "guest", "summary", "Hostfully") in log messages, comments, error strings, or variable names in these files. If you catch yourself writing something employee-specific in a shared file, that is a bug.
- **Zod v4 UUID validation**: `z.string().uuid()` enforces RFC 4122 version/variant bits and may reject certain UUIDs. Use the loose `UUID_REGEX` in `src/gateway/validation/schemas.ts` for any route param that accepts tenant or task UUIDs.

### Documentation Freshness (MANDATORY)

When making code changes that add, remove, or rename any of the following, you MUST update AGENTS.md and/or README.md in the same commit or PR:

**Triggers requiring AGENTS.md update:** New or removed Inngest function · New or removed worker-tool directory under `src/worker-tools/` · New or removed gateway route or service · New Prisma model or significant field additions · New or removed `src/lib/` module · Changes to approved LLM models or employee archetypes · New or removed employee → update `docs/employees/{slug}.md` and add to Reference Documents table · Completion of a "planned change" noted with ⚠️

**Triggers requiring README.md update:** New or removed npm script · New or removed admin API endpoint · New active employee type · Changes to Quick Start or setup flow · New documentation files in `docs/`

See README.md for docs directory structure and naming conventions.

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E: `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `JIRA_WEBHOOK_SECRET`, `ADMIN_API_KEY`, `ENCRYPTION_KEY`. Slack (required for approval cards): `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, `FLY_WORKER_APP`, `WORKER_VM_SIZE`. See `.env.example` for the full list.

## Long-Running Commands

**NEVER** run commands expected to take >30 seconds with a blocking shell call. Launch in a detached tmux session with output piped to a log file. Poll every 30–60 seconds.

Commands that ALWAYS require tmux: `pnpm trigger-task`, `pnpm dev`, `docker build`, `fly logs`, `cloudflared tunnel`.

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

### Tmux Session Cleanup (MANDATORY)

Stale tmux sessions accumulate zsh processes, gitstatus watchers, and kernel vnodes. On macOS, this exhausts the vnode table (`kern.maxvnodes`) and triggers `ENFILE: file table overflow` errors — even when file descriptor limits are not reached. **This has caused production-impacting failures.**

**Rules:**

1. **Kill sessions when done.** After a long-running command completes (EXIT_CODE detected in log), immediately kill its tmux session:

   ```bash
   tmux kill-session -t <name>
   ```

2. **Never leave sessions overnight.** At the end of any task execution, kill ALL tmux sessions you created:

   ```bash
   tmux list-sessions -F '#{session_name}' | grep '^ai-' | xargs -I{} tmux kill-session -t {}
   ```

3. **Pre-flight check.** Before creating a new tmux session, check how many exist. If more than 10 are alive, kill finished ones first:

   ```bash
   echo "Active tmux sessions: $(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')"
   ```

4. **Reuse session names.** Prefer reusing names like `ai-build` over creating `ai-build2`, `ai-build3`, etc. Kill the old one first:

   ```bash
   tmux kill-session -t ai-build 2>/dev/null; tmux new-session -d -s ai-build -x 220 -y 50
   ```

5. **Final wave cleanup.** Every plan's Final Verification Wave must include a step that kills all tmux sessions created during execution.

## Known Issues

### 1. ngrok free tier doesn't work with Fly.io

Cloudflare Tunnel is the permanent solution. Named tunnel `postgrest-ai-employee.dozaldevs.com` is configured in `~/.cloudflared/ai-employee-local.yml` — stable across restarts. If `TUNNEL_URL` is unset, `dev.ts` auto-spawns a quick tunnel.

### 2. Slack OAuth redirect URI requires a stable public URL

Use the named Cloudflare Tunnel (`local-ai-employee.dozaldevs.com`) — tunnel `e160ac6d-2d7d-47c4-a552-b13700947d29` at `~/.cloudflared/ai-employee-local.yml`. `pnpm dev` starts it automatically. For new contributors: create your own subdomain and ask the repo owner to register the redirect URL.

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

## Plan E2E Validation (MANDATORY)

Every plan for an AI employee feature must include a **real browser E2E validation wave** as the final non-notification step.

| Guide                                                              | Scenarios | Domain                                                                                    |
| ------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------- |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`          | A–F       | Approval paths, terminal state blocks, context thread replies, supersede, expiry, failure |
| `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` | A–F       | Rule extraction, rule injection, feedback consolidation, rule synthesis                   |

**Minimum for any guest-messaging change**: Scenario A (approve happy path). Use the **Quick-Reference table** in each guide to identify which additional scenarios apply to your change.

### Plan template (Final Verification Wave)

```markdown
- [ ] **N. E2E prerequisites** — Confirm services are live: gateway (`curl localhost:7700/health`), Inngest (`curl localhost:8288/health`), Socket Mode (`tail /tmp/ai-dev.log | grep "Socket Mode"`).
- [ ] **N+1. Scenario A — Approve happy path** — Follow `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Scenario A. Document: task ID, state machine trace, delivery confirmed.
- [ ] **N+2. Outcome summary** — Record all scenarios run, task IDs, and any deviations.
```

**No plan passes its Final Verification Wave without all applicable scenarios completed and outcomes documented.**

## Reference Documents

Read these on demand when you need deeper context — do not load preemptively.

| Document                                                                         | When to Read                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/2026-04-14-0104-full-system-vision.md`                        | Architecture, archetypes, lifecycle, event routing, operating modes, multi-tenancy                                                                                                                                                                       |
| `docs/architecture/2026-03-22-2317-ai-employee-architecture.md`                  | Original detailed architecture (data model, security, scaling, cost estimates)                                                                                                                                                                           |
| `docs/architecture/2026-04-14-0057-worker-post-redesign-overview.md`             | Worker redesign scope (before/after, files added/removed)                                                                                                                                                                                                |
| `.sisyphus/plans/worker-agent-delegation-redesign.md`                            | Active redesign plan (14 tasks across 4 waves)                                                                                                                                                                                                           |
| `docs/guides/2026-04-16-0310-manual-employee-trigger.md`                         | Manual employee trigger API — endpoints, curl examples, how it works                                                                                                                                                                                     |
| `docs/guides/2026-04-16-1655-multi-tenancy-guide.md`                             | Multi-tenancy: provisioning tenants, Slack OAuth, per-tenant secrets, verification                                                                                                                                                                       |
| `docs/snapshots/2026-04-29-2255-current-system-state.md`                         | Point-in-time system state snapshot: full lifecycle, harness flow, all gateway routes, DB schema, shell tool CLI syntax, Docker services, shared libraries — includes interaction handler unification, guest messaging full flow, learned rules pipeline |
| `docs/planning/2026-04-21-2202-phase1-story-map.md`                              | Phase 1 story map: 58 stories across 5 releases + cleanup, all epics and dependencies                                                                                                                                                                    |
| `docs/planning/2026-04-21-1813-product-roadmap.md`                               | Product roadmap: 4 phases, design partner strategy, success criteria                                                                                                                                                                                     |
| `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`                             | Adding a new shell tool — file structure, CLI pattern, mock fixtures, Docker, documentation                                                                                                                                                              |
| `docs/testing/2026-05-04-2023-local-e2e-testing.md`                              | Local E2E testing without real external APIs — mock convention, fixture structure, env propagation, running full lifecycle tests locally                                                                                                                 |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`                        | Slack UX E2E test guide — 6 scenarios (A–F): approve, reject, edit & send, supersede, expiry, failure. Step-by-step with DB checks, Slack UI verification, Quick-Reference table                                                                         |
| `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md`               | Feedback pipeline E2E test guide — 6 scenarios (A–F): rule extraction, @mention teaching, awaiting_input path, rule injection, feedback consolidation, rule synthesis                                                                                    |
| `docs/architecture/airbnb-integration/2026-05-12-1120-go-no-go-decision.md`      | Airbnb direct integration: definitive NO-GO decision with evidence matrix, re-evaluation triggers, and comparison to Hostfully path                                                                                                                      |
| `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md`    | Airbnb integration market landscape: Tier 1 (official partners), Tier 2 (Repull middleware), Tier 3 (unofficial/stale OSS). Repull deep-dive. Implications for the platform.                                                                             |
| `docs/architecture/airbnb-integration/2026-05-12-1120-partner-api-next-steps.md` | Playbook for pursuing Airbnb Partner API access when the platform reaches scale (50+ customers, 500+ listings, 6+ months track record)                                                                                                                   |
| `docs/guides/2026-05-12-1731-api-integration-practices.md`                       | Adding or debugging any external API integration — response envelope patterns, safe casting, shape smoke tests, silent null tracing                                                                                                                      |
| `docs/employees/guest-messaging.md`                                              | Working on guest-messaging employee — archetype IDs, full inbound flow, CRITICAL gotchas, Hostfully test resources, Airbnb E2E test account                                                                                                              |
| `docs/employees/code-rotation.md`                                                | Working on code-rotation employee — archetype IDs, lock IDs, trigger command, what it does                                                                                                                                                               |
| `docs/employees/daily-summarizer.md`                                             | Working on summarizer employee — channel IDs per tenant, failure diagnostics, cron config                                                                                                                                                                |
| `docs/guides/2026-05-14-0040-slack-tenant-integration.md`                        | Slack OAuth or per-tenant token issues — TenantInstallationStore, loadTenantEnv, re-connecting after DB reset                                                                                                                                            |
