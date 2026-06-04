# AI Employee Platform — Agent Guide

> Keep this file concise and current. Only include information that helps agents make correct decisions. For architectural details, read the vision doc on demand — don't duplicate it here. This file is loaded into every LLM call — every token here costs tokens on every turn.

## Approved LLM Models

**CRITICAL CONSTRAINT — NEVER VIOLATE:**

Two categories of model use exist in this codebase. Each has its own rule.

| Category                               | Model                                                                                                | Rule                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Execution** (employee work)          | Any model present in the tenant's `model_catalog` table                                              | Selected via the recommendation engine at archetype creation. Default seed: `minimax/minimax-m2.7`.                                                                                                                                                                                                                                          |
| **Verification/judge** (gateway calls) | Configurable via `platform_settings` key `gateway_llm_model`. Default: `deepseek/deepseek-v4-flash`. | Read at runtime via `getPlatformSetting('gateway_llm_model')` in `call-llm.ts`. When `OPENCODE_GO_API_KEY` is set and the model is OpenAI-compatible on Go, routes through OpenCodeGo; Anthropic-format Go models fall back to OpenRouter. Change via dashboard `/dashboard/settings` or `PATCH /admin/platform-settings/gateway_llm_model`. |

**Execution model selection — how it works:** The model-selection engine (`src/lib/model-selection/`) profiles the archetype and ranks catalog models by cost, quality, speed, and tool reliability. New archetypes pick a model from the catalog via `POST /admin/tenants/:tenantId/archetypes/recommend-model`. The catalog is managed via `GET/POST/PATCH/DELETE /admin/model-catalog` (global — not tenant-scoped).

**Seeded catalog models (global):** `minimax/minimax-m2.7` · `minimax/minimax-m2.5` · `minimax/minimax-m3` · `zhipu/glm-5.1` · `zhipu/glm-5` · `moonshot/kimi-k2.5` · `moonshot/kimi-k2.6` · `xiaomi/mimo-v2.5-pro` · `xiaomi/mimo-v2.5` · `alibaba/qwen3.7-max` · `alibaba/qwen3.7-plus` · `alibaba/qwen3.6-plus` · `deepseek/deepseek-v4-pro` · `deepseek/deepseek-v4-flash`

**Recommended for E2E testing**: `deepseek/deepseek-v4-flash` — confirmed reliable for tool calling. Some catalog models (e.g., `xiaomi/mimo-v2.5`, `minimax/minimax-m2.7`) may not call bash tools, causing immediate task failure. When testing wizard-generated employees, override the model to `deepseek/deepseek-v4-flash` via DB before triggering. **Note**: `xiaomi/mimo-v2.5-pro` (distinct from `xiaomi/mimo-v2.5`) has been verified to reliably call bash tools in the engineer employee context (E2E verified 2026-06-03). `minimax/minimax-m2.7` fails bash tool calling via OpenCodeGo (E2E verified 2026-06-03) — use `deepseek/deepseek-v4-flash` for Go routing tests.

**OpenCode VM size requirement**: Any archetype using `runtime: 'opencode'` MUST have `vm_size: 'performance-1x'` set (or larger). The Go-based OpenCode binary reserves ~74GB virtual memory at startup — `shared-cpu-1x` Fly machines (256MB RAM) will OOM-kill it every time. Without `vm_size` set, the archetype defaults to `shared-cpu-1x` and every task fails within 45 seconds with 0 tokens. Set it in both the DB and the seed file: `UPDATE archetypes SET vm_size = 'performance-1x' WHERE id = '<archetype_id>';`

**Forbidden in hardcoded references:** `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, `openai/gpt-4o-mini`. These may not appear as hardcoded model IDs anywhere in production code, default fallbacks, or environment variable examples. Adding a model to the catalog is the correct path to make it usable.

**OpenCodeGo routing**: When `OPENCODE_GO_API_KEY` is set, the harness auto-routes compatible execution models through OpenCodeGo instead of OpenRouter. Supported models: `minimax/minimax-m2.7`, `deepseek/deepseek-v4-flash`, `xiaomi/mimo-v2.5-pro`, and 11 others (see `src/lib/go-models.ts`). The gateway verification model also routes through OpenCodeGo when `OPENCODE_GO_API_KEY` is set and the configured model is OpenAI-compatible on Go; otherwise falls back to OpenRouter.

## Deprecated Components

The following components are deprecated. Do NOT modify, do NOT add features, do NOT fix bugs in these files unless the user explicitly instructs you to work on them:

| Component                       | File                                              | Reason                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering task lifecycle      | `src/inngest/lifecycle.ts`                        | Engineering employee is on hold. All active development targets the unified employee lifecycle in `src/inngest/employee-lifecycle.ts`.                                                                                                                                                                         |
| Engineering task redispatch     | `src/inngest/redispatch.ts`                       | Paired with the deprecated engineering lifecycle.                                                                                                                                                                                                                                                              |
| Generic worker harness          | `src/workers/generic-harness.mts`                 | Replaced by the OpenCode-based harness (`src/workers/opencode-harness.mts`). Source file has been deleted; stale compiled artifacts may remain in `dist/`.                                                                                                                                                     |
| Tool registry                   | `src/workers/tools/registry.ts`                   | Part of the generic harness. Replaced by shell scripts at `src/worker-tools/`.                                                                                                                                                                                                                                 |
| Engineering watchdog cron       | `src/inngest/watchdog.ts`                         | Cron (`*/10 * * * *`) that detects stuck engineering tasks. On hold with the engineering employee; still registered, do not modify.                                                                                                                                                                            |
| Engineering worker orchestrator | `src/workers/orchestrate.mts`                     | Engineering-only worker — ~1100-line orchestrator for planning, wave execution, fix loops, and PR creation. On hold; do not modify. **Note**: This is the old orchestrator-based engineering employee. The new archetype-based engineer employee (created via wizard) is active and uses the OpenCode harness. |
| Engineering worker launcher     | `src/workers/entrypoint.sh`                       | Default Dockerfile CMD; shells out to `orchestrate.mts`. Engineering only — on hold, do not modify.                                                                                                                                                                                                            |
| Engineering worker libraries    | `src/workers/lib/` (except `postgrest-client.ts`) | 30 utilities exclusively supporting `orchestrate.mts` (wave executor, PR manager, session manager, etc.). On hold — do not modify. `postgrest-client.ts` is shared with `opencode-harness.mts` and is active.                                                                                                  |

## Platform Vision

A single-responsibility AI Employee Platform — deploys autonomous AI agents ("digital employees"), each with one job. Every employee follows the same lifecycle, uses the same infrastructure (Inngest orchestration, Supabase state, Fly.io runtime), and is defined by a declarative archetype config. What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds). Full architecture: `docs/architecture/2026-04-14-0104-full-system-vision.md`

## Current Implementation

Employee-specific details are in each archetype's `identity` and `execution_steps` fields and in `docs/employees/`. Do not list employees here — this file is injected into every worker container and must not contain employee-specific identity content.

## Adding a New Employee

**Wizard (primary path)**: Use the dashboard wizard at `http://localhost:7700/dashboard/employees/new?tenant=<tenantId>`. Describe what the employee does in plain English → the archetype generator (`src/gateway/services/archetype-generator.ts`) auto-generates `identity`, `execution_steps`, `delivery_steps`, and `tool_registry` → save as draft → set `status` to `active` → trigger. For field quality validation, see the [AI Employee E2E Test Guide](docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md).

**Manual seed (alternative)**:

1. Seed a new `archetypes` record: `role_name`, `identity`, `execution_steps`, `model` (`minimax/minimax-m2.7`), `deliverable_type`, `runtime: 'opencode'`, `temperature` (default `1.0`), `tool_registry` (array of tool paths), `status` (`'draft'` | `'active'` — must be `'active'` to trigger). **Required for delivery**: `delivery_steps` and `delivery_instructions` — both must be non-empty for employees that produce deliverables; `delivery_instructions` is the platform constant prompt used by the delivery container. Optional: `notification_channel`, `enrichment_adapter`, `vm_size`. For new employees, use the recommendation engine (`POST /admin/tenants/:tenantId/archetypes/recommend-model`) to pick the optimal model from the catalog rather than hardcoding `minimax/minimax-m2.7`.
2. If shell tools needed: add TypeScript scripts to `src/worker-tools/{service}/`. Follow the [Shell Tool Checklist](docs/guides/2026-05-04-1645-adding-a-shell-tool.md).
3. Create `docs/employees/{slug}.md` with operational details (trigger, archetype IDs, channel IDs, gotchas, test resources).
4. For **scheduled triggers**: configure cron on cron-job.org → `POST /admin/tenants/:tenantId/employees/:slug/trigger`.
5. For **webhook triggers**: add route handler in `src/gateway/routes/`.
6. Add entry to Reference Documents table in AGENTS.md pointing to `docs/employees/{slug}.md`.
7. Rebuild Docker image: `docker build -t ai-employee-worker:latest .`

**Approval gate**: Controlled per-archetype via `risk_model.approval_required`. When `false`, lifecycle short-circuits from `Submitting` to `Delivering` → `Done` (skips `Reviewing` and `Approved`).

## OpenCode Worker (All Employees)

All non-deprecated employees use the OpenCode-based harness on Fly.io:

- **Harness**: `src/workers/opencode-harness.mts` — reads archetype from DB, compiles AGENTS.md via `src/workers/lib/agents-md-compiler.mts`, starts OpenCode session, monitors until completion. The compiled AGENTS.md is saved to `tasks.compiled_agents_md` for debugging.
- **AGENTS.md compilation**: `agents-md-compiler.mts` assembles the per-task AGENTS.md from archetype fields (`identity`, `execution_steps`, `delivery_steps`), learned rules, knowledge base entries, and the platform base config (`src/workers/config/agents.md`). The `execution_instructions` field is the platform constant prompt injected as the initial OpenCode message — it is not user-editable.
  **Shell tools** at `/tools/` in Docker image — one directory per service:

| Service        | Directory                | Purpose                                                           |
| -------------- | ------------------------ | ----------------------------------------------------------------- |
| Slack          | `/tools/slack/`          | Post messages, read channels, post approval cards                 |
| Hostfully      | `/tools/hostfully/`      | Messages, properties, reservations, reviews, door codes           |
| Sifely         | `/tools/sifely/`         | Lock management, passcode CRUD, code rotation, access diagnostics |
| Jira           | `/tools/jira/`           | Issue lookup, search, comments                                    |
| Knowledge Base | `/tools/knowledge_base/` | Semantic search over employee knowledge entries                   |
| Notion         | `/tools/notion/`         | Get page content, append blocks, update blocks                    |
| Platform       | `/tools/platform/`       | Report issues, submit task output                                 |
| GitHub         | `/tools/github/`         | Fetch short-lived GitHub App installation tokens for git/gh CLI   |
| Google         | `/tools/google/`         | Gmail, Drive, Docs, Sheets, Slides, Calendar                      |

All tools support `--help`. For detailed CLI syntax, load the `tool-usage-reference` skill.
Source: `src/worker-tools/{service}/`. See the [Adding a Shell Tool](docs/guides/2026-05-04-1645-adding-a-shell-tool.md) guide.

**Shared utility — `src/worker-tools/lib/unescape-args.ts`**: When writing a new shell tool, import `unescapeShellArg` and wrap every free-text CLI argument (`--body`, `--message`, `--content`, `--description`, etc.) at parse time. LLMs generate commands with literal `\n` in string arguments (e.g. `--body "Hello\nWorld"`); the shell passes `\`+`n` to `process.argv`, not a real newline. `unescapeShellArg` converts `\n` → newline, `\t` → tab, `\r` → carriage return. Omitting this causes literal backslash-n to reach external APIs (email, Notion, Jira, Hostfully, etc.).

- **OpenCode version — CRITICAL**: Pinned to `1.14.31`. Version `1.14.33` has a confirmed 6-second exit regression. **Never upgrade without explicit testing.**
- **`WORKER_RUNTIME` flag**: `docker` = local containers (default), `fly` = Fly.io machines (requires `TUNNEL_URL`).
- **Task-fetch-first**: Harness fetches task from DB before starting OpenCode. Fake `TASK_ID` exits at "Task not found" — OpenCode never launches.
- **`autoupdate: false`**: Must be set in `src/workers/config/opencode.json` and `~/.config/opencode/opencode.json`.
- **Lifecycle**: `src/inngest/employee-lifecycle.ts` — states: Received → Triaging → AwaitingInput → Ready → Executing → Validating (auto-pass) → Submitting → Reviewing → Approved → Delivering → Done. Terminal: `Failed`, `Cancelled`. Two delivery paths: (1) `approval_required: true` → Submitting → Reviewing → Approved → Delivering → Done; (2) `approval_required: false` → Submitting → Delivering → Done (delivery container always spawns when `delivery_instructions` is set; skips only when `NO_ACTION_NEEDED` AND no `delivery_instructions`).
- **Inngest functions** (active — 7): `employee/universal-lifecycle`, `employee/interaction-handler` (intent classification, `feedback_events`), `employee/rule-extractor` (`employee_rules`), `employee/rule-synthesizer` (`SYNTHESIS_THRESHOLD` = 5), `trigger/reviewing-watchdog` (15-min cron, marks stuck `Reviewing` → `Failed` after 30 min), `employee/slack-trigger-handler` (handles `employee/task.requested` from Slack @mentions — resolves channel → employee, posts confirmation card, dispatches task), `employee/slack-input-collector` (handles `employee/trigger.input-received` — collects required inputs from thread replies before dispatching).
- **Slack @mention triggering**: Users can trigger AI employees by @mentioning the bot in a Slack channel. The `app_mention` handler fires `employee/interaction.received` → classified as `task` intent → emits `employee/task.requested` → `slack-trigger-handler` resolves the channel's assigned employee, posts a Block Kit confirmation card in thread. User clicks Confirm → task dispatched (or input collection starts if employee has required `input_schema` fields). Cancel → no task. Unassigned channels get a polite decline. Multi-employee channels use LLM routing (`routeToEmployee()` in `src/inngest/slack-trigger-handler.ts`). Action IDs: `SLACK_ACTION_ID.TRIGGER_CONFIRM` / `TRIGGER_CANCEL` in `src/lib/slack-action-ids.ts`. In-memory `pendingInputCollections` Map tracks threads awaiting input (keyed by `channelId:threadTs`).
- **Output contract**: OpenCode writes `/tmp/summary.txt` and `/tmp/approval-message.json` via the `submit-output.ts` tool (`--draft-file` for full content, `--classification` for routing: `NEEDS_APPROVAL` or `NO_ACTION_NEEDED`). Absence of BOTH is a hard failure. If only a short summary appears in delivery (no actual content), `--draft-file` was missing from the generated `submit-output` call in `execution_steps` — the archetype generator has regressed.
- **Container naming**: Execution container: `employee-{taskId.slice(0,8)}`. Delivery container: `employee-delivery-{taskId.slice(0,8)}`. Find both with `docker ps --filter name=employee-`.
- **CRITICAL — Rebuild after every worker change**: Changes to `src/workers/` require a Docker image rebuild. `src/worker-tools/` is bind-mounted in local Docker mode — no rebuild needed for tool changes locally.
- **Multi-provider routing**: When `OPENCODE_GO_API_KEY` is set, `writeOpencodeAuth()` writes both `opencode-go` and `openrouter` entries to `auth.json`. Compatible models route through Go (flat $10/mo subscription); others fall back to OpenRouter. Provider selection is logged at task start. See `src/lib/go-models.ts` for the hardcoded 14-model Go list (moved from `src/workers/lib/` — now shared between gateway and worker). **OpenCodeGo usage limits**: $12/5hr, $30/week, $60/month metered on top of the $10/mo subscription. Gateway calls are negligible (~$0.50/mo). Track usage at https://opencode.ai/auth. **Go two-endpoint formats**: Go models use two API formats — OpenAI-compatible (`/zen/go/v1/chat/completions`) and Anthropic-compatible (`/zen/go/v1/messages`). `call-llm.ts` gateway routing only works with OpenAI-compatible models on Go. Worker harness handles both formats via OpenCode internally.

## Skills System

Skills are on-demand knowledge modules loaded by OpenCode agents. Before any non-trivial task, scan this list — if the domain overlaps, call `skill(name="skill-name")` before starting. Skills are free to load.

| If you are about to…                                                              | Load this skill        |
| --------------------------------------------------------------------------------- | ---------------------- |
| Create or modify a shell tool in `src/worker-tools/`                              | `adding-shell-tools`   |
| Debug a stuck or failed task, inspect container logs, or query task observability | `debugging-lifecycle`  |
| Add or configure a new employee archetype                                         | `creating-archetypes`  |
| Call any Hostfully API or fix a Hostfully integration                             | `hostfully-api`        |
| Run or write E2E tests                                                            | `e2e-testing`          |
| Call any shell tool inside a worker container                                     | `tool-usage-reference` |
| Pass UUIDs (lead_uid, thread_uid, property_uid, etc.) to any tool                 | `uuid-disambiguation`  |

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

**Two VLRE Slack tokens exist in `.env`**: `SLACK_BOT_TOKEN` (used by the gateway Bolt app for Socket Mode) and `VLRE_SLACK_BOT_TOKEN` (seed-only — used by `prisma/seed.ts` to populate `tenant_secrets` on DB reset). For API calls from scripts or testing, use `VLRE_SLACK_BOT_TOKEN`. Both hold the same VLRE workspace bot token value but serve different consumption points. Never store either as the DozalDevs tenant secret.

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
- `GET /admin/tenants/:tenantId/tasks/:id/logs` — stream task execution logs as SSE (local Docker mode only; requires log file at `/tmp/employee-{taskId.slice(0,8)}.log`)
- `GET /admin/tools` — list all available shell tools with parsed metadata (description, flags, env vars, output shape, SKILL.md enrichment)
- `GET /admin/tools/:service/:toolName` — get full metadata for a single tool
- `GET /admin/model-catalog` — list active catalog models (`?include_inactive=true` for all)
- `POST /admin/model-catalog` — add model to catalog
- `PATCH /admin/model-catalog/:id` — update catalog entry
- `DELETE /admin/model-catalog/:id` — soft-delete catalog entry
- `GET /admin/tenants/:tenantId/archetypes/model-questions` — returns the 3 plain-language recommendation questions
- `POST /admin/tenants/:tenantId/archetypes/recommend-model` — accepts archetype draft + user answers, returns top-3 ranked model recommendations
- `GET /admin/platform-settings` — list all platform settings (key, value, description, is_required)
- `PATCH /admin/platform-settings/:key` — update a platform setting value
- `GET /admin/tenants/:tenantId/github/repos` — list repos accessible to the tenant's GitHub App installation (requires `github_installation_id` tenant secret)
- `GET /admin/tenants/:tenantId/github/available-installations` — list GitHub App installations linkable to this tenant (requires App JWT)
- `POST /admin/tenants/:tenantId/github/link-installation` — link an existing GitHub App installation to this tenant (`installation_id` must be a string)
- `DELETE /admin/tenants/:tenantId/integrations/github` — disconnect GitHub from this tenant (soft-delete, does not affect other tenants sharing the same installation)

**GitHub OAuth (engineer employee):**

- `GET /auth/github/install` — initiates GitHub App installation flow for a tenant
- `GET /auth/github/callback` — OAuth callback; stores `github_installation_id` as tenant secret

**Google OAuth (Google Workspace integration):**

- `GET /integrations/google/install?tenant=<slug>` — initiates Google OAuth flow for a tenant
- `GET /integrations/google/callback` — OAuth callback; stores 5 Google secrets in `tenant_secrets`
- `DELETE /admin/tenants/:tenantId/integrations/google` — disconnect Google from tenant (soft-delete)
- `POST /internal/tasks/:taskId/google-token` — returns fresh Google access token for executing tasks (auth: `X-Task-ID` header)

**Internal (worker containers only):**

- `POST /internal/tasks/:taskId/github-token` — returns a short-lived GitHub App installation token scoped to the task's tenant (auth: `X-Task-ID` header). Used by `tsx /tools/github/get-token.ts` inside worker containers.

**GitHub token manager** (`src/gateway/services/github-token-manager.ts`): generates RS256 JWT + installation tokens via GitHub App API. Tokens have 1-hour TTL; the manager caches them for 55 minutes to avoid redundant API calls.

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
| Stress test      | `pnpm stress-test`                 |
| Docker start     | `pnpm docker:start`                |
| Docker stop      | `pnpm docker:stop`                 |
| Docker reset     | `pnpm docker:reset`                |
| Docker status    | `pnpm docker:status`               |
| Dashboard build  | `pnpm dashboard:build`             |
| Full E2E run     | `pnpm dev:e2e`                     |

Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin).

## Dashboard URLs

| Mode        | URL                                | Notes                                                                                                                                         |
| ----------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Development | `http://localhost:7700/dashboard/` | Gateway proxies to Vite dev server at :7701. Full HMR; use this URL for all development work. `pnpm dev` sets `VITE_DEV_PROXY` automatically. |
| Production  | `http://localhost:7700/dashboard/` | Served as pre-built static files from `dashboard/dist/`. Requires `pnpm dashboard:build` to reflect source changes.                           |

**For any UI inspection, screenshot, or browser automation task, always use `localhost:7700/dashboard/`.** When `pnpm dev` is running, the gateway proxies dashboard traffic to the Vite dev server (HMR enabled). Vite still listens on `:7701` as the underlying server but you do not need to use that port directly — `7700` works for everything including OAuth redirects.

**Task execution logs**: `/dashboard/tasks/:taskId/logs?tenant=:tenantId` — full-page formatted log viewer (noise-filtered, searchable, color-coded). Only available when a log file exists at `/tmp/employee-{taskId.slice(0,8)}.log` (local Docker mode).

**Employee creation wizard**: `http://localhost:7700/dashboard/employees/new?tenant=<tenantId>` — generates archetype fields from a plain-English description.

## Pre-existing Test Failures

Do NOT attempt to fix these — they are unrelated to any recent changes:

- `container-boot.test.ts` — requires Docker socket; all 4 tests skip via `describe.skipIf` when Docker is unavailable

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma`; **REST API**: Supabase PostgREST on `http://localhost:54331`
- **Test DB**: `ai_employee_test` — setup via `pnpm test:db:setup` (one-time, idempotent). Safety guard: `globalSetup` throws if `DATABASE_URL` doesn't contain `ai_employee_test`.
- **`archetypes` table**: has `estimated_manual_minutes` (Haiku-generated estimate) and `estimated_manual_minutes_override` (PM-set override); effective value = `override ?? estimated_manual_minutes`.
- **`task_metrics` table**: `id, task_id (unique), archetype_id, tenant_id, work_minutes, created_at` — one row per task, records work minutes done vs manual effort.
- **`platform_settings` table**: global key-value store for platform-level behavior defaults (VM size, cost limits, thresholds, Slack channels). All 8 initial settings have `is_required = true`. Use `getPlatformSetting(key)` from `src/lib/platform-settings.ts` to read. Missing required settings throw errors at startup via `validateRequiredPlatformSettings()` (called in `src/gateway/server.ts`). Managed via the dashboard at `/dashboard/settings` or via admin API. Keys: `default_worker_vm_size`, `cost_limit_usd_per_day`, `synthesis_threshold`, `max_employee_rules_chars`, `max_employee_knowledge_chars`, `worker_bash_timeout_ms`, `issues_slack_channel`, `cost_alert_slack_channel`, `gateway_llm_model` (controls which LLM model is used for gateway verification calls; default: `deepseek/deepseek-v4-flash`).

### Database Backup (MANDATORY before any reseed or wipe)

**Before running `pnpm prisma db seed`, `pnpm setup`, `docker compose down -v`, or any operation that resets or overwrites the database — YOU MUST back it up first.**

The database contains production data: learned rules accumulated over time, feedback history, tenant secrets, and task history. A reseed silently overwrites archetype rows. A volume wipe destroys everything. Always back up first.

**How to back up:**

```bash
# 1. Get a timestamp
TS=$(date "+%Y-%m-%d-%H%M")
BACKUP_DIR="database-backups/$TS"
mkdir -p "$BACKUP_DIR"

# 2. Full dump (plain SQL — human-readable and restorable)
docker exec shared-postgres pg_dump -U postgres -d ai_employee --format=plain > "$BACKUP_DIR/full-dump.sql"

# 3. Critical tables individually (for selective restore)
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t employee_rules --data-only --inserts > "$BACKUP_DIR/employee_rules.sql"
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t archetypes --data-only --inserts > "$BACKUP_DIR/archetypes.sql"
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t tenant_secrets --data-only --inserts > "$BACKUP_DIR/tenant_secrets.sql"
docker exec shared-postgres pg_dump -U postgres -d ai_employee -t knowledge_base_entries --data-only --inserts > "$BACKUP_DIR/knowledge_base_entries.sql"

# 4. Confirm row counts
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT 'employee_rules' as t, count(*) FROM employee_rules UNION ALL SELECT 'archetypes', count(*) FROM archetypes UNION ALL SELECT 'tasks', count(*) FROM tasks;"

echo "Backup complete: $BACKUP_DIR"
```

**How to restore:**

```bash
# Full restore (replaces everything — use after a volume wipe)
docker exec -i shared-postgres psql -U postgres -d ai_employee < database-backups/YYYY-MM-DD-HHMM/full-dump.sql

# Selective restore — just learned rules (use after an accidental reseed)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "TRUNCATE employee_rules CASCADE;"
psql postgresql://postgres:postgres@localhost:54322/ai_employee < database-backups/YYYY-MM-DD-HHMM/employee_rules.sql
```

**Notes:**

- Backups are gitignored (`database-backups/` in `.gitignore`) — they stay local only
- The Docker container name is `shared-postgres` — verify with `docker ps --filter name=postgres`
- `pg_dump` inside the container is always version-matched — do not use the host `pg_dump` (version mismatch causes errors)
- Existing backups live in `database-backups/` — check before overwriting

## Render API (Production Gateway)

The production Express gateway runs on Render. Agents have direct API access to check deploys, fetch logs, and update service config.

- **API key**: stored in `.env` as `RENDER_API_KEY` and in `AGENTS.md` for reference: `rnd_0XF5Yo08XVffYVQReUx0VisS1xSp`
- **Service ID**: `srv-d8f1b2gg4nts738dj7jg` (also in `.env` as `RENDER_SERVICE_ID`)
- **Base URL**: `https://api.render.com/v1`
- **Auth header**: `Authorization: Bearer $RENDER_API_KEY`
- **Dashboard**: `https://dashboard.render.com/web/srv-d8f1b2gg4nts738dj7jg`
- **Live URL**: `https://ai-employees-laaa.onrender.com`

**IMPORTANT — Service was created manually (not via Blueprint).** `render.yaml` is NOT authoritative for this service. Any settings in `render.yaml` (dockerfilePath, healthCheckPath, envVars) must be applied via PATCH API or the dashboard manually. Changes to `render.yaml` alone have no effect.

```bash
# Check latest deploy status
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" | jq '.[0] | {id: .deploy.id, status: .deploy.status}'

# Trigger a new deploy
curl -s -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" -d '{"clearCache":"do_not_clear"}' | jq '{id: .id, status: .status}'

# Update service config (e.g. dockerfilePath)
curl -s -X PATCH -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID" \
  -d '{"serviceDetails": {"envSpecificDetails": {"dockerfilePath": "./Dockerfile.gateway"}}}' | jq '.serviceDetails.envSpecificDetails.dockerfilePath'

# Set/replace ALL env vars (PUT replaces entire list — always include ALL vars)
curl -s -X PUT -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars" -d '[{"key":"FOO","value":"bar"}]'

# Get runtime logs (SSE stream — pipe through head to limit output)
curl -sN -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/logs?tail=100" | head -c 20000
```

**Known API quirks:**

- `PUT /env-vars` replaces ALL env vars — always include the full list or you will wipe existing secrets
- `PATCH /services/{id}` with `serviceDetails.dockerfilePath` does NOT work — must nest under `serviceDetails.envSpecificDetails.dockerfilePath`
- Runtime logs endpoint: `GET /v1/services/{id}/logs` — returns SSE stream; use `curl -sN` and pipe to `head`
- Deploy logs (build output) are only visible in the Render dashboard, not via API

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
│   ├── services/     # Business logic services: archetype generator (`archetype-generator.ts` — wizard LLM prompt for employee creation), dispatcher, task creation, tenant/secret management, interaction classification, and more. Browse `src/gateway/services/` for the full list.
│   └── inngest/      # Inngest client factory, event sender, serve registration
├── inngest/      # Durable workflow functions: lifecycle, watchdog, redispatch
│   ├── triggers/     # Cron trigger functions (guest-message-poll; daily-summarizer deregistered)
│   └── lib/          # Shared: create-task-and-dispatch, poll-completion, pending-approvals, quiet-hours, reminder-blocks
├── workers/      # Docker container code — runs inside the worker machine
│   └── lib/          # `agents-md-compiler.mts` (template compiler), `postgrest-client.ts` (shared DB client)
├── worker-tools/ # Shell tools (TypeScript, executed via tsx in Docker at /tools/)
└── lib/          # Shared: LLM client (`call-llm.ts` — $50/day cost circuit breaker, model enforcement), encryption (`encryption.ts` — AES-256-GCM for tenant secrets), model-selection engine (`model-selection/`), plus HTTP clients, logging, retry utilities, and type definitions. Browse `src/lib/` for the full list.
prisma/           # Schema, migrations, seed
scripts/          # TypeScript scripts run via tsx (setup, trigger, verify)
```

## Key Conventions

- **AI employee injection — exactly two things, use exact names**: When an AI employee runs, exactly two things are injected into it: (1) **the prompt** — the initial message sent to the employee, and (2) **the AGENTS.md file** — a literal markdown file written to `/app/AGENTS.md` in the worker container. Never use vague synonyms like "instructions," "knowledge base," "instruction manual," or "context" when referring to these. Always say "the prompt" or "the AGENTS.md file." Any other framing is imprecise and confusing.

- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`
- Employee behavior is config-driven (archetype pattern), not hardcoded orchestration logic
- **Multi-tenancy is mandatory** — every table, registry, catalog, and query must be scoped by `tenant_id`. When adding any new data structure, ask: "Is this tenant-isolated?" If not, it's a bug.
- **Shared files must stay employee-agnostic** — `src/inngest/employee-lifecycle.ts`, `src/workers/opencode-harness.mts`, and any file under `src/gateway/` or `src/lib/` serve ALL employees. Never use employee-specific language (e.g. "guest", "summary", "Hostfully") in log messages, comments, error strings, or variable names in these files. If you catch yourself writing something employee-specific in a shared file, that is a bug.
- **Zod v4 UUID validation**: `z.string().uuid()` enforces RFC 4122 version/variant bits and may reject certain UUIDs. Use the loose `UUID_REGEX` in `src/gateway/validation/schemas.ts` for any route param that accepts tenant or task UUIDs.
- **Soft deletes only — never hard delete**: No record in any table may be permanently deleted. Use the `deleted_at` timestamp column to mark records as deleted. All queries and API responses must filter out rows where `deleted_at IS NOT NULL`, unless the caller is explicitly presenting data for recovery purposes (e.g. an "undelete" or admin restore UI). Any code path that issues a SQL `DELETE` or Prisma `.delete()`/`.deleteMany()` is a bug — use `.update({ deleted_at: new Date() })` instead.
- **Searchable dropdowns — always use `SearchableSelect`**: Any dropdown/select in the dashboard that presents a list of options to the user MUST use `<SearchableSelect>` from `dashboard/src/components/ui/searchable-select.tsx` instead of the Radix UI `<Select>`. `SearchableSelect` is a single-select combobox with a built-in search input — it matches the hand-rolled dropdown style used in `RulesPanel.tsx` and gives users the ability to both scroll and type to filter options. Never use `<Select>` from `@/components/ui/select` for user-facing option lists. The only exception is programmatic/non-interactive selects where search is meaningless (e.g. a 2-option toggle). Props: `options: {value, label}[]`, `value: string`, `onValueChange: (v: string) => void`, `placeholder?`, `searchPlaceholder?`, `className?`, `disabled?`.
- **Dashboard UI sections use cards for visual separation** — Any panel, section, or grouping of related content in the dashboard MUST be wrapped in a card shell: `rounded-lg border bg-card` with `px-5 py-4` padding. This keeps the UI readable and prevents sections from bleeding together. Use `CollapsibleSection` (which already applies this styling) for collapsible content. For non-collapsible groups, apply the classes directly to the wrapper `<div>`. Never render a wall of content without clear card boundaries.
- **All navigatable UI state must be URL-encoded** — Every tab, filter, sub-navigation item, or modal that a user can navigate to MUST reflect its state in the URL (via query params or route segments), so that the exact view is shareable and survives a page refresh. Examples: a selected tab becomes `?tab=activity`, an active filter becomes `?status=done`, a selected employee stays at `/employees/:id`. Use `useSearchParams` (React Router) to read and write query params; preserve existing params when updating (e.g. copy current `URLSearchParams` and set only the changed key). Never use component-local state alone for anything the user might want to bookmark, share, or return to after a refresh.
- **End-user language is non-technical** — The end users of the AI Employee platform are non-technical (property managers, small business owners — not developers). When writing anything visible to end users — user-facing labels, UI copy, error messages, Slack notification text, dashboard copy — always use plain language. Examples: "Organization" not "Tenant", "Employee setup" not "Archetype configuration", "Approval needed" not "`risk_model.approval_required` is true".
- **AI employee outputs should be concise** — Slack messages, summaries, and guest replies produced by AI employees should be short and to-the-point. Avoid verbose explanations or filler text in delivered content. If the user asks for more detail, provide it; otherwise, keep it brief.
- **`/tmp/` contract files must be written via tools only** — `/tmp/summary.txt` and `/tmp/approval-message.json` are the harness output contract files. They MUST be written exclusively via TypeScript tools in `/tools/` (e.g., `submit-output.ts`). Never write to these files directly via `echo`, shell redirects, or any non-tool method. The harness reads these files after the OpenCode session completes — if written in the wrong format, the task will fail. This applies to both the execution phase and the delivery phase.
- **Platform settings over env vars** — Platform-level behavior defaults (VM size, cost limits, thresholds, Slack channels) are stored in the `platform_settings` DB table, not env vars. Use `getPlatformSetting(key)` from `src/lib/platform-settings.ts` to read. Never add hardcoded fallback values — missing required settings throw errors at startup. Managed via `/dashboard/settings` or `PATCH /admin/platform-settings/:key`.

### Documentation Freshness (MANDATORY)

**Plan completion rule:** When a plan is fully complete (all tasks `[x]`, final wave passed, user has approved), update AGENTS.md and any other relevant documentation to capture new components, changed conventions, new admin API endpoints, and new DB models before declaring the plan done. This is the last step of every plan.

**Discrepancy rule (MANDATORY — applies at all times, not just plan completion):** Whenever you read any documentation (AGENTS.md, README.md, guides, employee docs, architecture docs) in the course of debugging, investigating, or implementing — if you find anything that is wrong, outdated, or missing relative to what you observe in the actual system, **update the documentation immediately in the same session**. Do not defer. Examples: a guide says to use port 6543 but port 5432 works and 6543 fails → fix the guide; an employee doc references a slug that no longer exists → fix it; AGENTS.md describes a behavior that changed → update it. Documentation rot is a first-class bug.

**Production debugging rule:** When debugging any issue in the **production** environment (Render, Fly.io, Supabase Cloud, Inngest Cloud), load `docs/guides/2026-06-01-2246-production-debugging-guide.md` first. After resolving the issue, update that guide with any new failure modes, commands, or gotchas discovered.

When making code changes that add, remove, or rename any of the following, you MUST update AGENTS.md and/or README.md in the same commit or PR:

**Triggers requiring AGENTS.md update:** New or removed Inngest function · New or removed worker-tool directory under `src/worker-tools/` · New or removed gateway route or service · New Prisma model or significant field additions · New or removed `src/lib/` module · Changes to approved LLM models or employee archetypes · New or removed employee → update `docs/employees/{slug}.md` and add to Reference Documents table · Completion of a "planned change" noted with ⚠️

**Triggers requiring README.md update:** New or removed npm script · New or removed admin API endpoint · New active employee type · Changes to Quick Start or setup flow · New documentation files in `docs/`

See README.md for docs directory structure and naming conventions.

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E: `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `JIRA_WEBHOOK_SECRET`, `ADMIN_API_KEY`, `ENCRYPTION_KEY`. Slack (required for approval cards): `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`, `FLY_WORKER_APP`. See `.env.example` for the full list. **Note**: `WORKER_VM_SIZE`, `SUMMARIZER_VM_SIZE`, and `COST_LIMIT_USD_PER_DEPT_PER_DAY` are now managed via the `platform_settings` DB table — not env vars.

**GitHub App — per-environment vars**: `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` differ between dev and prod. Dev App points to `https://local-ai-employee.dozaldevs.com`; prod App points to `https://ai-employees-laaa.onrender.com`. Each App has its own private key and webhook secret — never shared between environments. See [GitHub Integration Guide](docs/guides/2026-06-02-1727-github-integration.md) § Multi-Environment Setup.

**Google Integration:**

- `GOOGLE_CLIENT_ID` — OAuth 2.0 client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — OAuth 2.0 client secret from Google Cloud Console
- `GOOGLE_REDIRECT_BASE_URL` — Base URL for OAuth callback (default: `http://localhost:7700`)

**OpenCode Go (optional)**: `OPENCODE_GO_API_KEY` — when set, the harness automatically routes compatible models through OpenCodeGo ($10/mo flat subscription) instead of OpenRouter. Get a key at https://opencode.ai/auth. Remove the env var to revert all routing to OpenRouter. The Go model list is hardcoded in `src/lib/go-models.ts` (14 models).

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

### 3. Inngest Dev Server step output contamination

**Symptom**: In the Inngest Dev Server UI, step outputs for a run of `employee/universal-lifecycle` may show data from a completely different run (e.g., a guest-messaging task's `load-task` output appearing in a motivation-bot run). The function executed correctly — only the UI display is wrong.

**Root cause**: Step IDs are computed as `sha1(stepName)` — deterministic and identical across ALL runs of the same function. The Dev Server's in-memory SQLite output cache does not scope stored outputs by run ID (`tid: ""` always in Dev Server). When a new run completes, its step outputs overwrite the previous run's stored outputs under the same step ID key.

**Impact**: Display only. Actual function execution is correct and independently verifiable. Does NOT affect production Inngest Cloud (which uses Redis with proper run-scoped keys).

**Workaround**: Restart the Dev Server to clear the in-memory SQLite cache. After restart, the first run's outputs will display correctly. Use DB queries and gateway logs as ground truth instead of the Inngest UI:

- DB: `docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT id, status, archetype_id FROM tasks WHERE id = '<taskId>'"`
- Gateway logs: `grep '"taskId":"<taskId>"' /tmp/ai-dev.log | grep '"step"'`

**Warning — `--persist` flag**: The `inngest dev` CLI supports a `--persist` flag (Advanced options) that stores data between restarts using file-based SQLite. Do NOT use `--persist` — it makes contamination worse by accumulating stale span data across restarts.

**Ground truth sources** (use these instead of Inngest UI):

1. DB task row: `SELECT id, status, archetype_id FROM tasks WHERE id = '<taskId>'`
2. Gateway structured logs: `grep '"runId":"<runId>"' /tmp/ai-dev.log`
3. Inngest event payload: `http://localhost:8288` → Events tab → find `employee/task.dispatched`

## Task Debugging Quick Reference

Assumes `TASK_ID` is set in your shell. Container name prefix: `${TASK_ID:0:8}`. For deeper diagnostics (stuck states, root-cause tables, decision tree), load the `debugging-lifecycle` skill.

**Task state:**

```bash
# Current status
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"

# Full lifecycle trace
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT from_status, to_status, created_at FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
```

**Worker container** (active during `Executing`):

```bash
docker ps --filter name=employee-${TASK_ID:0:8}
docker logs -f employee-${TASK_ID:0:8}
```

**Delivery container** (active during `Delivering`):

```bash
docker ps --filter name=employee-delivery-${TASK_ID:0:8}
docker logs -f employee-delivery-${TASK_ID:0:8}
```

**Harness log** (persists after container exits — more complete than `docker logs`):

```bash
# Harness events only (skip OpenCode noise)
grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30

# Errors and warnings only
grep '"level":[45][0-9]' /tmp/employee-${TASK_ID:0:8}.log

# Dashboard viewer (noise-filtered, recommended)
# http://localhost:7700/dashboard/tasks/<TASK_ID>/logs?tenant=<TENANT_ID>
```

**Execution metrics** (spot runaway LLM loops):

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT prompt_tokens, completion_tokens, estimated_cost_usd FROM executions WHERE task_id = '$TASK_ID';"
```

**Slack thread** (verify what was actually posted):

```bash
source .env
CHANNEL=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT metadata->>'notify_slack_channel' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')
NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')
curl -s "https://slack.com/api/conversations.replies" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
  -d "channel=$CHANNEL&ts=$NOTIFY_TS&limit=20" \
  | jq '[.messages[] | {ts: .ts, text: (.text | .[0:200])}]'
```

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

## Feature Verification Checklist (MANDATORY — applies to every plan)

After implementing any feature, the Final Verification Wave **must** include real-world verification that exercises the actual production code path — not just unit tests or schema checks. The following rules are non-negotiable.

### PostgREST ≠ psql (CRITICAL)

`psql` connects directly to PostgreSQL and bypasses PostgREST entirely. Worker containers and the lifecycle write data through PostgREST (`http://localhost:54331`). **Any new table must be verified via PostgREST curl, not just psql.**

After every Prisma migration that creates a new table, run:

```bash
# 1. Reload PostgREST schema cache (required after every migration that adds tables)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"

# 2. Confirm PostgREST can see the new table (use anon key from .env)
source .env
curl -s "http://localhost:54331/rest/v1/<new_table>?limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
# Expected: [] (empty array), NOT a PGRST205 "schema cache" error
```

If you get `"Could not find the table in the schema cache"` — the migration ran but PostgREST doesn't know about it. Nothing that goes through the lifecycle or workers will work until the cache is reloaded.

### Zero Rows Is Never "Expected" for a Write Path

If a feature is supposed to write DB records (metrics, logs, audit rows), **zero rows after a completed test action is a failure — not an acceptable baseline.** The verification must:

1. Trigger the actual action (call the API, send a webhook, trigger an employee)
2. Wait for it to complete
3. Verify the row actually exists in the DB via psql AND via PostgREST

Example for a lifecycle metric step:

```bash
# Trigger a task, wait for Done, then verify:
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT * FROM task_metrics WHERE task_id = '<task_id>';"
# Expected: 1 row with work_minutes > 0 — NOT 0 rows
```

### Dashboard UI Must Show Real Data

For any feature that displays data in the dashboard, load the actual page and verify with real data — not just that the component renders or that the PostgREST query is syntactically correct.

```bash
# Use the Playwright MCP to open the relevant dashboard page and confirm:
# 1. The stat/value is non-zero (not "—" or "0" when data exists)
# 2. No console errors
# 3. The data matches what's in the DB
```

A feature is NOT verified if the dashboard page shows "—" or "0" and you haven't confirmed whether that's correct or a bug.

### Real-World Verification Matrix

Apply every row that matches your feature:

| Feature type             | Required verification                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ |
| New DB table             | PostgREST curl confirms table visible; write via PostgREST succeeds (not just psql)  |
| New lifecycle step       | Trigger a real task end-to-end; confirm the step's DB output row exists              |
| New dashboard stat/card  | Load the page in a browser; confirm the value is non-zero with real data             |
| New API endpoint         | curl the endpoint with real payloads; verify response body matches spec              |
| New gateway route        | Hit it with curl; check gateway logs for the expected structured log entries         |
| New PostgREST write path | curl PostgREST directly (not via gateway); confirm HTTP 201, not a schema/auth error |

### What "Verified" Means

Verification is complete only when ALL of these are true:

- [ ] The actual code path was exercised (not a mock, not a unit test alone)
- [ ] The DB row exists and has the correct values (checked via psql after the action)
- [ ] PostgREST can read and write the table (checked via curl to `localhost:54331`)
- [ ] The dashboard page shows the correct non-placeholder value (checked via browser or Playwright)
- [ ] Gateway/Inngest logs show the expected structured log entries (no silent errors)

### Recommended Test Employee: `real-estate-motivation-bot-2`

Use **`real-estate-motivation-bot-2`** (VLRE tenant) as the default smoke-test employee for any plan that touches the lifecycle, task metrics, or dashboard. It is the simplest employee in the system:

- `approval_required: false` → goes straight to Done, no Slack approval card needed
- Completes in ~1 minute
- Tenant: `00000000-0000-0000-0000-000000000003` (VLRE)
- Archetype ID: `561439b9-7491-40de-a550-95906624fffc`
- Override estimate: 15 min (pre-set)

**Trigger it with curl (faster than the dashboard button):**

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '{task_id: .task_id, status_url: .status_url}'
```

**Then verify end-to-end:**

```bash
# 1. Wait ~60s, then check task reached Done
TASK_ID=<task_id from above>
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
# Expected: Done

# 2. Confirm task_metrics row was written
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT work_minutes FROM task_metrics WHERE task_id = '$TASK_ID';"
# Expected: 1 row, work_minutes = 15

# 3. Load the dashboard and confirm "Hours of Work Done" is non-zero
# http://localhost:7700/dashboard/tasks?tenant=00000000-0000-0000-0000-000000000003
```

**For full approval path testing** (wizard → execution → Reviewing → Approved → Delivering → Done): Use the wizard to generate a motivational message employee per the [AI Employee E2E Test Guide](docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md). Override the model to `deepseek/deepseek-v4-flash` via DB after saving. This exercises the full approval flow that `real-estate-motivation-bot-2` (which has `approval_required: false`) skips.

---

## Plan E2E Validation (MANDATORY)

Every plan for an AI employee feature must include a **real browser E2E validation wave** as the final non-notification step.

| Guide                                                              | Scenarios | Domain                                                                                      |
| ------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------- |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`          | A–F       | Approval paths, terminal state blocks, context thread replies, supersede, expiry, failure   |
| `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` | A–F       | Rule extraction, rule injection, feedback consolidation, rule synthesis                     |
| `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`       | AC1–AC8   | Wizard generation, field quality, full lifecycle with approval, Slack delivery verification |

**Minimum for any guest-messaging change**: Slack UX Scenario A (approve happy path).
**Minimum for any archetype generator, wizard, or delivery pipeline change**: AI Employee E2E guide (AC1–AC8).
Use the **Quick-Reference table** in each guide to identify which additional scenarios apply to your change.

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
| `docs/employees/2026-05-21-1721-jira-motivation-bot.md`                          | Working on jira-motivation-bot employee — archetype ID, webhook setup, trigger command, mock mode, E2E flow, known gotchas, tenant secrets                                                                                                               |
| `docs/employees/cleaning-schedule.md`                                            | Working on cleaning-schedule employee — archetype ID, trigger command, Notion page IDs, Slack channel, gotchas                                                                                                                                           |
| `docs/employees/2026-06-02-1230-engineer.md`                                     | Working on engineer employee — archetype IDs, GitHub App setup, trigger command, what it does, known gotchas                                                                                                                                             |
| `docs/guides/2026-05-14-0040-slack-tenant-integration.md`                        | Slack OAuth or per-tenant token issues — TenantInstallationStore, loadTenantEnv, re-connecting after DB reset                                                                                                                                            |
| `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`                     | Full E2E test guide for AI employee creation → execution → approval → delivery. Covers wizard flow, field quality checks (AC1–AC8), lifecycle verification, Slack delivery confirmation, manual approval fallback, and all known gotchas.                |
| `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md`                  | Deploying to production — Supabase Cloud, Render, Inngest Cloud, Fly.io. Step-by-step provisioning, full env var reference, database migration, CI/CD pipeline, cost breakdown, and troubleshooting.                                                     |
| `docs/guides/2026-06-01-2246-production-debugging-guide.md`                      | Debugging production issues — topology overview, cloud DB queries (port 5432 only), Fly.io machine inspection via REST API, Render env var gotchas, Inngest retry loop diagnosis, known production bugs and fixes, re-trigger instructions.              |
| `.sisyphus/plans/2026-06-01-2344-platform-settings-table.md`                     | Platform settings table implementation plan — DB schema, admin API endpoints, dashboard settings page, env var migration                                                                                                                                 |
| `docs/guides/2026-06-02-1727-github-integration.md`                              | Working on GitHub App integration — OAuth install flow, webhook handling, token delivery to workers, multi-environment two-App setup (dev vs prod)                                                                                                       |
| `docs/employees/2026-06-03-0243-google-assistant.md`                             | Working on Google Workspace Assistant employee — archetype IDs, trigger command (`google-workspace-assistant`), available tools, required tenant secrets, known gotchas                                                                                  |
| `docs/guides/2026-06-03-0202-google-cloud-setup.md`                              | Setting up Google Cloud OAuth credentials for the Google integration                                                                                                                                                                                     |
