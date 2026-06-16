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

| Component                       | File                                                                                                                                                                                        | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering task lifecycle      | `src/inngest/lifecycle.ts`                                                                                                                                                                  | Engineering employee is on hold. All active development targets the unified employee lifecycle in `src/inngest/employee-lifecycle.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Engineering task redispatch     | `src/inngest/redispatch.ts`                                                                                                                                                                 | Paired with the deprecated engineering lifecycle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Generic worker harness          | `src/workers/generic-harness.mts`                                                                                                                                                           | Replaced by the OpenCode-based harness (`src/workers/opencode-harness.mts`). Source file has been deleted; stale compiled artifacts may remain in `dist/`.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tool registry                   | `src/workers/tools/registry.ts`                                                                                                                                                             | Part of the generic harness. Replaced by shell scripts at `src/worker-tools/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Engineering watchdog cron       | `src/inngest/watchdog.ts`                                                                                                                                                                   | Cron (`*/10 * * * *`) that detects stuck engineering tasks. On hold with the engineering employee; still registered, do not modify.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Engineering worker orchestrator | `src/workers/orchestrate.mts`                                                                                                                                                               | Engineering-only worker — a large orchestrator for planning, wave execution, fix loops, and PR creation. On hold; do not modify. **Note**: This is the old orchestrator-based engineering employee. The new archetype-based engineer employee (created via wizard) is active and uses the OpenCode harness.                                                                                                                                                                                                                                                                                       |
| Engineering worker launcher     | `src/workers/entrypoint.sh`                                                                                                                                                                 | Default Dockerfile CMD; shells out to `orchestrate.mts`. Engineering only — on hold, do not modify.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Engineering worker libraries    | `src/workers/lib/` (except `postgrest-client.ts`, `session-manager.ts`, `execution-phase.mts`, `delivery-phase.mts`, `harness-helpers.mts`, `agents-md-compiler.mts`, `postgrest-types.ts`) | 30 utilities exclusively supporting `orchestrate.mts` (wave executor, PR manager, session manager, etc.). On hold — do not modify. `postgrest-client.ts` is shared with `opencode-harness.mts` and is active. `session-manager.ts` is also active — imported by `opencode-harness.mts` to manage OpenCode sessions. `execution-phase.mts` and `delivery-phase.mts` are active — extracted from `opencode-harness.mts`. **`postgrest-client.ts` uses raw `process.env` with null-checks intentionally** — worker startup guarantees differ from gateway startup; do not "fix" with `requireEnv()`. |

## Platform Vision

A single-responsibility AI Employee Platform — deploys autonomous AI agents ("digital employees"), each with one job. Every employee follows the same lifecycle, uses the same infrastructure (Inngest orchestration, Supabase state, Fly.io runtime), and is defined by a declarative archetype config. What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds). Full architecture: `docs/architecture/2026-04-14-0104-full-system-vision.md`

## Current Implementation

Employee-specific details are in each archetype's `identity` and `execution_steps` fields and in `docs/employees/`. Do not list employees here — this file is injected into every worker container and must not contain employee-specific identity content.

## Adding a New Employee

**Wizard (primary path)**: Use the dashboard wizard at `http://localhost:7700/dashboard/employees/new?tenant=<tenantId>`. Describe what the employee does in plain English → the archetype generator (`src/gateway/services/archetype-generator.ts`) auto-generates `identity`, `execution_steps`, `delivery_steps`, and `tool_registry` → save as draft → set `status` to `active` → trigger. If the description is ambiguous, the wizard escalates to a clarify-then-act chat flow: the server returns a clarifying question, the user answers in the same input box, and the conversation continues until the intent is clear enough to generate a proposal. Clear descriptions bypass the chat and generate directly. The clarify-then-act path uses `POST /admin/tenants/:tenantId/archetypes/converse-create` (see "AI Assistant tab" section). For field quality validation, see the [AI Employee E2E Test Guide](docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md).

**`role_name` on the CREATE path**: `converse-create` (the wizard's creation path) auto-derives a kebab-case `role_name` slug from the employee description when the model omits it. The derived slug is pre-filled in the editable `role_name` field in the wizard's Review & Edit step — the user can change it before saving. If the description yields no valid slug (e.g. emoji-only input), a deterministic `employee-<short-id>` fallback is used so draft-save never fails with a validation error. The EDIT path (`propose-edit` on an existing archetype) still forbids the model from changing `role_name` — that guardrail is unchanged. Implementation: `buildConverseSystemPromptPre(isCreate: boolean)` in `src/gateway/services/prompts/archetype-generator-prompts.ts` switches the instruction based on whether the baseline `role_name` is empty; `postProcess()` in `src/gateway/services/archetype-generator.ts` derives the slug from the transcript when the model omits it.

**Intent-level steps convention (wizard-generated employees)**: The archetype generator produces `execution_steps`, `delivery_steps`, and `instructions` as plain-English intent prose — no `tsx /tools/...` CLI invocations appear in generated steps. The worker resolves exact tool commands at runtime via the always-on `tool-usage-reference` skill. Channel names are written directly in the employee's instructions (e.g. `general` or `#general` — both accepted); `read-channels.ts` resolves plain names to IDs at runtime via `conversations.list`. `$NOTIFICATION_CHANNEL` and `$PUBLISH_CHANNEL` env-var placeholders are still preserved in generated steps. `tool_registry.tools` still contains real file paths (e.g. `/tools/slack/read-channels.ts`) — only the prose is abstracted. The final execution step always ends with an intent-level submit-output closer (e.g. "Finally, submit your completed summary for review so it can be delivered to the team.") — this is the load-bearing handoff that drives `submit-output --draft-file`. This abstraction applies only to the GENERATE path and the CREATE branch of `converse-create` (empty baseline). `refine()` and edit-converse on existing archetypes are not abstracted — existing employees' steps are untouched. The `--draft-file` execution→delivery handoff convention is documented in `src/workers/skills/tool-usage-reference/SKILL.md`.

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

**Shared utility — `src/worker-tools/lib/unescape-args.ts`**: When writing a new shell tool, import `unescapeShellArg` and wrap every free-text CLI argument (`--body`, `--message`, `--content`, `--description`, etc.) at parse time. LLMs generate commands with literal `\n` in string arguments (e.g. `--body "Hello\nWorld"`); the shell passes `\`+`n` to `process.argv`, not a real newline. `unescapeShellArg` converts `\n` → newline, `\t` → tab, `\r` → carriage return. Omitting this causes literal backslash-n to reach external APIs (email, Notion, Jira, Hostfully, etc.).

- **OpenCode version — CRITICAL**: Pinned to `1.14.31`. Version `1.14.33` has a confirmed 6-second exit regression. **Never upgrade without explicit testing.**
- **`WORKER_RUNTIME` flag**: `docker` = local containers (default), `fly` = Fly.io machines (requires `TUNNEL_URL`).
- **Task-fetch-first**: Harness fetches task from DB before starting OpenCode. Fake `TASK_ID` exits at "Task not found" — OpenCode never launches.
- **`autoupdate: false`**: Must be set in `src/workers/config/opencode.json` and `~/.config/opencode/opencode.json`.
- **Lifecycle**: `src/inngest/employee-lifecycle.ts` — states: Received → Triaging → AwaitingInput → Ready → Executing → Validating (auto-pass) → Submitting → Reviewing → Approved → Delivering → Done. Terminal: `Failed`, `Cancelled`. Two delivery paths: (1) `approval_required: true` → Submitting → Reviewing → Approved → Delivering → Done; (2) `approval_required: false` → Submitting → Delivering → Done (delivery container always spawns when `delivery_instructions` is set; skips only when `NO_ACTION_NEEDED` AND no `delivery_instructions`).
- **Inngest functions** (active, each registered in `src/gateway/inngest/serve.ts`): `employee/universal-lifecycle`, `employee/interaction-handler` (intent classification, `feedback_events`), `employee/rule-extractor` (`employee_rules`), `employee/rule-synthesizer` (`SYNTHESIS_THRESHOLD` = 5), `trigger/reviewing-watchdog` (15-min cron, marks stuck `Reviewing` → `Failed` after 30 min), `employee/slack-trigger-handler` (handles `employee/task.requested` from Slack @mentions — resolves channel → employee, posts confirmation card, dispatches task), `employee/slack-input-collector` (handles `employee/trigger.input-received` — collects required inputs from thread replies before dispatching).
- **Slack @mention triggering**: Users can trigger AI employees by @mentioning the bot in a Slack channel. The `app_mention` handler fires `employee/interaction.received` → classified as `task` intent → emits `employee/task.requested` → `slack-trigger-handler` resolves the employee. **Routing is by channel across all tenants on the workspace**: `findManyByExternalId('slack', team_id)` returns all tenants connected to that workspace, then `resolveEmployeesAcrossTenants(channel, tenantIds)` finds candidates. Single candidate → direct dispatch. Multiple candidates → LLM routing via `routeToEmployee()`; confident result → dispatch, null → disambiguation card with employee buttons (`TRIGGER_DISAMBIGUATE`). Zero candidates → "no employees available" message. Posts a Block Kit confirmation card in thread. User clicks Confirm → task dispatched (or input collection starts if employee has required `input_schema` fields). Cancel → no task. Action IDs: `SLACK_ACTION_ID.TRIGGER_CONFIRM` / `TRIGGER_CANCEL` / `TRIGGER_DISAMBIGUATE` in `src/lib/slack-action-ids.ts`. In-memory `pendingInputCollections` Map tracks threads awaiting input (keyed by `channelId:threadTs`).
- **Output contract**: OpenCode writes `/tmp/summary.txt` and `/tmp/approval-message.json` via the `submit-output.ts` tool (`--draft-file` for full content, `--classification` for routing: `NEEDS_APPROVAL` or `NO_ACTION_NEEDED`). Absence of BOTH is a hard failure. If only a short summary appears in delivery (no actual content), `--draft-file` was missing from the generated `submit-output` call in `execution_steps` — the archetype generator has regressed. **Output-contract paths are single-sourced** in `src/lib/output-contract-constants.ts` (World-A); worker-tools consume a generated copy at `src/worker-tools/lib/output-contract-paths.generated.ts` (World-B, `// @generated` header). Never edit the generated file directly — run `pnpm generate-worker-constants` to regenerate. **Output-contract versioning**: `StandardOutput` carries an optional `version` field. Absent = v1 (legacy backward compat). Future-unknown versions are warned but not thrown — additive-only within a major version guarantees degraded read safety.
- **Container naming**: Execution container: `employee-{taskId.slice(0,8)}`. Delivery container: `employee-delivery-{taskId.slice(0,8)}`. Find both with `docker ps --filter name=employee-`.
- **CRITICAL — Rebuild after every worker change**: Changes to `src/workers/` require a Docker image rebuild. `src/worker-tools/` is bind-mounted in local Docker mode — no rebuild needed for tool changes locally.
- **Multi-provider routing**: When `OPENCODE_GO_API_KEY` is set, `writeOpencodeAuth()` writes both `opencode-go` and `openrouter` entries to `auth.json`. Compatible models route through Go (flat $10/mo subscription); others fall back to OpenRouter. Provider selection is logged at task start. See `src/lib/go-models.ts` for the hardcoded Go model list (moved from `src/workers/lib/` — now shared between gateway and worker). **OpenCodeGo usage limits**: $12/5hr, $30/week, $60/month metered on top of the $10/mo subscription. Gateway calls are negligible (~$0.50/mo). Track usage at https://opencode.ai/auth. **Go two-endpoint formats**: Go models use two API formats — OpenAI-compatible (`/zen/go/v1/chat/completions`) and Anthropic-compatible (`/zen/go/v1/messages`). `call-llm.ts` gateway routing only works with OpenAI-compatible models on Go. Worker harness handles both formats via OpenCode internally.

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

**Employee skills** (baked into Docker image via `COPY src/workers/skills/ /app/.opencode/skills/`):

| Skill                                                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-usage-reference`                                                 | Exact CLI syntax, required flags, output JSON shapes, and critical warnings for all shell tools in the container (`/tools/slack/`, `/tools/hostfully/`, `/tools/sifely/`, `/tools/knowledge_base/`, `/tools/platform/`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `uuid-disambiguation`                                                  | All UUID types in the system (lead_uid, thread_uid, property_uid, message_uid, task_id, tenant_id), their sources, env var names, and the critical rule that lead_uid and thread_uid are never the same value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `composio-<app>`                                                       | Per-app Composio skill (one per connected app: `composio-gmail`, `composio-notion`, `composio-slack`, `composio-slackbot`). Action index + per-action parameter schemas. Generated by `pnpm generate-composio-skills`; committed to `src/workers/skills/`. Boot-time filtered to only the tenant's connected apps by `filterComposioSkills()` in the harness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `hostfully`, `sifely`, `github`, `slack`, `knowledge-base`, `platform` | Per-service custom-integration skills. Generated from `ALL_TOOL_DESCRIPTORS` via `pnpm generate-skills` (`scripts/generate-skills.ts`). Each skill folder contains a `SKILL.md` overview table and `actions/<tool-id>.md` per tool. Boot-time filtered by `filterCustomSkills(connectedServices)` in `harness-helpers.mts` — explicit allowlist `['hostfully','sifely','github','slack']`; always-keep: `['knowledge-base','platform']`. Tenant detection via `loadCustomIntegrations(tenantId)` in `agents-md-compiler.mts`: hostfully secrets → hostfully; sifely secrets → sifely; `slack_bot_token` secret → slack; github integration row or `github_installation_id` secret → github. When services are detected, the compiled AGENTS.md includes a `## Custom Integrations` section listing connected services. `tool-usage-reference` is the always-on generated reference for all tools and is NOT replaced by these per-service skills. |

**Dev skills** (project-level at `.opencode/skills/`):

| Skill                         | Description                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adding-shell-tools`          | File structure, CLI pattern, TypeScript conventions, mock fixture support, Docker integration, and AGENTS.md documentation requirements for new shell tool scripts                                                                                      |
| `debugging-lifecycle`         | All 13 lifecycle states, auto-pass vs blocking states, stuck-state diagnostics, approval flow debugging, reviewing-watchdog behavior, and admin API commands for task status checking                                                                   |
| `creating-archetypes`         | All archetype schema fields, seed data patterns, trigger setup, the `loadTenantEnv()` injection pipeline, approved models, and the 4-step checklist for deploying a new employee end-to-end                                                             |
| `hostfully-api`               | Response envelope patterns, known API quirks, shell tool CLI syntax, and UUID disambiguation for Hostfully message retrieval, sending, and property/reservation lookups                                                                                 |
| `e2e-testing`                 | Prerequisites checklist, per-employee trigger methods, Playwright browser automation via CDP, state verification via `task_status_log`, and the full scenario library (Slack UX scenarios A–F, Feedback Pipeline scenarios A–F)                         |
| `prisma`                      | Prisma schema conventions, migration workflow, seed patterns, test DB setup, and the soft-delete rule for all tables                                                                                                                                    |
| `inngest`                     | Active functions, step-module map, `InngestStep` type, `makePostgrestHeaders`, `mergeTaskMetadata`, `NonRetriableError`, idempotency rules, and the Dev Server contamination workaround                                                                 |
| `api-design`                  | `sendError`/`sendSuccess` helpers, Zod validation, UUID_REGEX quirk, tenant-scoped routes, and the full admin API endpoint catalog                                                                                                                      |
| `react-dashboard`             | Dashboard component conventions, `SearchableSelect`, card shells, URL-encoded state, Vite dev proxy, and the dashboard URL at `localhost:7700/dashboard/`                                                                                               |
| `security`                    | AES-256-GCM encryption for tenant secrets, `requireEnv`/`optionalEnv` rules, HMAC signature verification, soft-delete mandate, and tenant data isolation                                                                                                |
| `data-access-conventions`     | PostgREST vs Prisma boundaries, `makePostgrestHeaders`, repository pattern, multi-tenancy scope rules, and HTTP client factory                                                                                                                          |
| `feature-verification`        | PostgREST-vs-psql distinction, zero-rows-is-failure rule, dashboard real-data verification, real-world verification matrix, and recommended smoke-test employee                                                                                         |
| `production-ops`              | Render API commands, service ID, deploy-status checks, env-var PUT gotcha, known API quirks, and ngrok/tunnel guidance                                                                                                                                  |
| `slack-conventions`           | Socket Mode (never configure Interactivity URL), task-ID context block, user-mention syntax, message hygiene, voice & tone rules, and the manual approval fallback                                                                                      |
| `long-running-commands`       | tmux launch+poll pattern, 5 mandatory cleanup rules, session naming (`ai-e2e`, `ai-dev`, `ai-build`), and macOS vnode-exhaustion risk                                                                                                                   |
| `employee-creation-debugging` | Full wizard walkthrough (generate → draft → activate), `archetype_generation_calls` trace table, server-driven edit history, brain-preview inspection, and local-vs-production artifact access for creation-side debugging                              |
| `execution-trace-debugging`   | Complete forward trace (Slack @mention → delivery), side-by-side local/prod log-location matrix, DB observability queries, reverse stuck-in-state lookup, and a self-contained Production Incident Playbook for Render/Fly/Supabase Cloud/Inngest Cloud |

New skill: create `src/workers/skills/{name}/SKILL.md` (employee — rebuild Docker) or `.opencode/skills/{name}/SKILL.md` (dev — commit). Pattern: `^[a-z0-9]+(-[a-z0-9]+)*$`.

**Skill registry** (`src/lib/skill-registry.ts`): `getWorkerSkills(skillsDir?)` reads `src/workers/skills/*/SKILL.md` frontmatter (name + description) and returns `WorkerSkill[]` sorted by name. The gateway uses this to build the brain-preview skill list — no hardcoded skill arrays anywhere. Adding a new skill folder makes it appear automatically with no code change.

**`tool-usage-reference` skill generation**: The body of `src/workers/skills/tool-usage-reference/SKILL.md` is generated from `ALL_TOOL_DESCRIPTORS` via `pnpm generate-tool-usage-skill` (`scripts/generate-tool-usage-skill.ts`). A sentinel comment `<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->` preserves curated warnings and gotchas below the generated section. Run the script and commit when adding or changing a tool descriptor.

**Composio skill system**: Per-app skills (`composio-<toolkit>/`) are committed artifacts generated by `pnpm generate-composio-skills` (calls Composio API, writes `SKILL.md` action index + `actions/<SLUG>.md` per action). Run the script and commit when a new app becomes connectable. CI fails if committed skills are stale. At container boot, `filterComposioSkills(connectedToolkits)` in `harness-helpers.mts` deletes `composio-*` folders for apps the tenant has NOT connected — OpenCode only sees skills for connected apps. `TASK_PHASE` env var (`'execution'` | `'delivery'`) is set by the harness before the OpenCode session starts so `execute.ts` can write the correct phase to `task_composio_calls`.

**Custom per-service skill system**: Per-service skills (`hostfully/`, `sifely/`, `github/`, `slack/`, `knowledge-base/`, `platform/`) are committed artifacts generated from `ALL_TOOL_DESCRIPTORS` via `pnpm generate-skills` (`scripts/generate-skills.ts`). Each folder contains a `SKILL.md` overview table and `actions/<tool-id>.md` per tool. Run the script and commit when adding or changing a tool descriptor — CI has a freshness gate that fails if the committed folders are stale. At container boot, `filterCustomSkills(connectedServices)` in `harness-helpers.mts` removes skill folders for services the tenant has NOT connected, using an explicit allowlist `['hostfully','sifely','github','slack']`; `knowledge-base` and `platform` are always kept. Tenant service detection runs via `loadCustomIntegrations(tenantId)` in `agents-md-compiler.mts` — signals: `hostfully_*` secrets → hostfully; `sifely_*` secrets → sifely; `slack_bot_token` secret → slack; github integration row or `github_installation_id` secret → github. When services are detected, the compiled AGENTS.md includes a `## Custom Integrations` section listing connected services with their skill names. `tool-usage-reference` is the always-on reference for all tools and coexists with these per-service skills — it is NOT replaced by them.

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

**Multiple tenants can share a Slack workspace (many:1).** The platform supports connecting the same workspace to more than one tenant — there is no conflict. Each tenant gets its own `tenant_integrations` row. Routing is by channel: when a user @mentions the bot, the gateway looks up all tenants on that workspace and resolves which employee owns the channel across all of them. See `docs/guides/2026-05-14-0040-slack-tenant-integration.md` for the full routing flow.

**Papi Chulo = the platform Slack bot, NOT an employee name.** App ID `A09678HT90S`, installed on VLRE workspace. ALL AI employees communicate through this single bot — it is not tied to the daily-summarizer or any specific employee. The daily-summarizer archetype uses a "dramatic Spanish TV news correspondent" persona in its prompt, but the Papi Chulo name belongs to the bot/app, not that employee.

**Two VLRE Slack tokens exist in `.env`**: `SLACK_BOT_TOKEN` (used by the gateway Bolt app for Socket Mode) and `VLRE_SLACK_BOT_TOKEN` (seed-only — used by `prisma/seed.ts` to populate `tenant_secrets` on DB reset). For API calls from scripts or testing, use `VLRE_SLACK_BOT_TOKEN`. Both hold the same VLRE workspace bot token value but serve different consumption points. Never store either as the DozalDevs tenant secret.

For Slack OAuth setup and per-tenant token architecture, see `docs/guides/2026-05-14-0040-slack-tenant-integration.md`.

## Slack Interactive Buttons — Socket Mode (CRITICAL)

**[Moved to skill]** — Load `slack-conventions` skill for Socket Mode, message standards, voice & tone, message hygiene, known Slack issues, and the manual approval fallback.

## Slack Message Standards

**[Moved to skill]** — See `slack-conventions` skill.

## Slack Voice & Tone (MANDATORY — Every Message, No Exceptions)

**[Moved to skill]** — See `slack-conventions` skill.

## Slack Message Hygiene (MANDATORY — No Message Accumulation)

**[Moved to skill]** — See `slack-conventions` skill.

## Authentication & Authorization

All `/admin/*` and `/me` endpoints require an `Authorization: Bearer <token>` header. Two token types are accepted:

| Token type        | Value                                          | Use case                                          |
| ----------------- | ---------------------------------------------- | ------------------------------------------------- |
| **SERVICE_TOKEN** | Opaque hex string from `SERVICE_TOKEN` env var | External cron callers, scripts, Inngest functions |
| **Supabase JWT**  | Short-lived JWT issued by Supabase Auth        | Dashboard users, logged-in humans                 |

`ADMIN_API_KEY` / `X-Admin-Key` are **removed** (not deprecated — gone since T24). All callers must use `Authorization: Bearer`.

### Auth middleware resolution order

`authMiddleware` in `src/gateway/middleware/auth.ts` resolves identity in this order:

1. **SERVICE_TOKEN** — timing-safe compare of the Bearer token against `SERVICE_TOKEN()`. Sets `req.isServiceToken = true`. Bypasses all membership checks.
2. **Supabase JWT** — `verifySupabaseJwt(token)` (see below) + `ensureUserExists(claims)` upsert. Sets `req.auth` to the `AuthenticatedUser`. Returns 403 `ACCOUNT_DISABLED` if `user.status !== 'active'`.
3. **No match** — 401 `AUTHENTICATION_REQUIRED`.

### JWT verification — dual-env profiles

The gateway detects its profile at startup via `detectEnvProfile()` in `src/lib/config.ts`:

| Profile   | Detection                                                                               | JWT algorithm | Verification                              |
| --------- | --------------------------------------------------------------------------------------- | ------------- | ----------------------------------------- |
| **LOCAL** | `SUPABASE_URL` starts with `http://localhost` and `SUPABASE_ANON_KEY` starts with `eyJ` | HS256         | Symmetric secret from `GOTRUE_JWT_SECRET` |
| **CLOUD** | `SUPABASE_URL` is `https://*.supabase.co` and `SUPABASE_ANON_KEY` starts with `sb_`     | ES256         | Asymmetric JWKS from `SUPABASE_JWKS_URL`  |

Mixing LOCAL and CLOUD values causes a fatal error at startup. `SUPABASE_JWKS_URL` is derived automatically: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.

### Supabase key model

The platform uses the new Supabase opaque key model:

- **Publishable key** (`sb_publishable_...`) — safe for browser use. Stored as `SUPABASE_ANON_KEY`. Used as the `apikey` header for PostgREST and Auth calls.
- **Secret key** (`sb_secret_...`) — server-side only. Stored as `SUPABASE_SECRET_KEY`. Used as both `apikey` and `Authorization: Bearer` for admin Auth API calls (user creation, invitations). **Never expose to browser.**

Legacy `eyJ` HS256 JWT keys (local dev) are still valid for the LOCAL profile. The `sb_` opaque keys are CLOUD-only.

### Authorization middleware

`src/gateway/middleware/authz.ts` exports three guards:

- `requireAuth` — plain middleware; passes if `req.isServiceToken` or `req.auth` is set. Returns 401 otherwise.
- `requireTenantRole(...roles)` — factory; checks the user's `TenantMembership` for the `:tenantId` route param. SERVICE_TOKEN and PLATFORM_OWNER bypass the membership check. Returns 403 if the user's role rank is below the minimum required.
- `requirePermission(permission)` — factory; checks `ROLE_PERMISSIONS` or `TENANT_ROLE_PERMISSIONS` for the named permission. SERVICE_TOKEN and PLATFORM_OWNER always pass.

Role rank order (highest to lowest): `OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)`.

### RBAC — roles and permissions

**Global roles** (`Role` enum, `src/lib/auth/permissions.ts`):

| Role             | Scope                   | Key permissions                                                                  |
| ---------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `PLATFORM_OWNER` | Cross-tenant superadmin | All permissions                                                                  |
| `ADMIN`          | Platform-level          | Manage archetypes, rules, KB, locks, projects, trigger employees, invite members |
| `EDITOR`         | Platform-level          | Manage archetypes, rules, KB (no trigger)                                        |
| `USER`           | Platform-level          | Trigger employees, read tasks                                                    |
| `VIEWER`         | Platform-level          | Read tenant and tasks only                                                       |

**Tenant roles** (`TenantRole` enum):

| Role     | Key permissions                                                                          |
| -------- | ---------------------------------------------------------------------------------------- |
| `OWNER`  | All tenant permissions including delete tenant, manage secrets/integrations/members      |
| `ADMIN`  | Manage archetypes, rules, KB, locks, projects, trigger, invite (no secrets/integrations) |
| `MEMBER` | Trigger employees, read tasks                                                            |
| `VIEWER` | Read tenant and tasks only                                                               |

### Bootstrap — first PLATFORM_OWNER

Run `scripts/seed-platform-owner.ts` to create the first PLATFORM_OWNER user in both Supabase Auth and the app DB:

```bash
BOOTSTRAP_OWNER_EMAIL=owner@example.com BOOTSTRAP_OWNER_PASSWORD=YourPassword tsx scripts/seed-platform-owner.ts
```

The script upserts the user in `users` with `role: PLATFORM_OWNER` and creates `OWNER` memberships in all seeded tenants. This is a **manual, on-demand step** — it is NOT part of `prisma/seed.ts` and NOT run by `pnpm setup`. After a fresh `pnpm setup` the database has tenants but no users, so you must run this once before you can log into the dashboard. Choose your own email/password — do not commit real credentials.

## Admin API

**[Moved to skill]** — Load `api-design` skill for the full admin API endpoint table and curl examples.

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

**AI Assistant tab**: `/dashboard/employees/:id?tab=assistant` — single-input chat-first experience for non-technical users. The user types a request; when the request is genuinely ambiguous, the assistant replies with a clarifying question as a chat bubble and the user answers in the same input box. Once the intent is clear, the assistant proposes a diff. `POST .../propose-edit` accepts `{ transcript: ConverseMessage[] }` and returns a discriminated union: `{ kind: 'question', question }` | `{ kind: 'proposal', baseline, proposal, changed_fields, ... }` | `{ kind: 'no_change' }` | `{ kind: 'too_long' }`. The client holds the full transcript; the server stays request-stateless (no DB table, no session store). A server-side backstop forces a best-guess proposal if the model asks more than 5 clarifying questions. A token-budget guard returns `too_long` for very long conversations. Approve applies allowlisted fields via `PATCH /admin/tenants/:tenantId/archetypes/:id` and records a `kind:'edit'` row in `archetype_edit_history` with a re-fetched `before_json`. The retired single-shot endpoint has been removed; `propose-edit` now handles the full clarify-then-act flow. Distinct from `employee_rules` (learned rules from Slack feedback) — this feature edits archetype prose directly.

**Creation wizard clarify-then-act**: `POST /admin/tenants/:tenantId/archetypes/converse-create` mirrors the same request-stateless transcript design for CREATION (no existing archetype). The discriminated result contract is identical: `question | proposal | no_change | too_long`. The creation entry point stays a single text box; chat appears only when the server returns `kind:'question'`. On a `proposal` result, the wizard advances to the "Review & Edit" step — the user can then save as draft and activate. The route uses the same `ArchetypeGenerator.converse()` method as `propose-edit` with an empty baseline (`buildEmptyBaseline()`), so there is no duplicate logic. The create allowlist (`applyCreateAllowlist()`) is wider than the edit allowlist and includes `role_name`, `model`, and `runtime` — fields needed when the UI calls `POST /archetypes` to persist the new employee.

## Pre-existing Test Failures

Do NOT attempt to fix these — they are unrelated to any recent changes:

- `container-boot.test.ts` — requires Docker socket; its tests skip via `describe.skipIf` when Docker is unavailable

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma`; **REST API**: Supabase PostgREST on `http://localhost:54331`
- **Test DB**: `ai_employee_test` — setup via `pnpm test:db:setup` (one-time, idempotent). Safety guard: `globalSetup` throws if `DATABASE_URL` doesn't contain `ai_employee_test`.
- **`archetypes` table**: has `estimated_manual_minutes` (generated via the configured gateway LLM model (`gateway_llm_model`, default `deepseek/deepseek-v4-flash`)) and `estimated_manual_minutes_override` (PM-set override); effective value = `override ?? estimated_manual_minutes`. Also has `created_by String? @db.Uuid` (nullable — null when created via SERVICE_TOKEN).
- **`task_metrics` table**: `id, task_id (unique), archetype_id, tenant_id, work_minutes, created_at` — one row per task, records work minutes done vs manual effort.
- **`platform_settings` table**: global key-value store for platform-level behavior defaults (VM size, cost limits, thresholds, Slack channels). Most settings are required; `issues_slack_channel` and `cost_alert_slack_channel` are optional (`is_required = false`). Use `getPlatformSetting(key)` from `src/lib/platform-settings.ts` to read. Missing required settings throw errors at startup via `validateRequiredPlatformSettings()` (called in `src/gateway/server.ts`). Managed via the dashboard at `/dashboard/settings` or via admin API. Keys: `default_worker_vm_size`, `cost_limit_usd_per_day`, `synthesis_threshold`, `max_employee_rules_chars`, `max_employee_knowledge_chars`, `worker_bash_timeout_ms`, `issues_slack_channel`, `cost_alert_slack_channel`, `gateway_llm_model` (controls which LLM model is used for gateway verification calls; default: `deepseek/deepseek-v4-flash`).
- **`users` table**: `id, supabase_id (unique, nullable), email, name, role (Role enum), status, created_at, updated_at, deleted_at`. Created/updated via `ensureUserExists()` on every authenticated request. `status = 'disabled'` is the immediate lockout mechanism — checked per-request in `authMiddleware`.
- **`tenant_memberships` table**: composite PK `[tenant_id, user_id]`. Fields: `tenant_id, user_id, role (TenantRole enum), joined_at, deleted_at`. Soft-delete only. Scoped by `tenant_id` on every query.
- **`tenant_invitations` table**: `id, tenant_id, email, role (TenantRole), token (unique), status, expires_at, accepted_at, declined_at, revoked_at, inviter_id, created_at`. No `deleted_at` — status transitions (`pending → accepted/declined/revoked`) are the lifecycle. Token is a 32-byte random hex string; expires in 7 days.
- **`composio_connections` table**: `id, tenant_id, toolkit (e.g. "notion"), status ("active"), connected_at, disconnected_at, deleted_at, created_at, updated_at`. One row per tenant per toolkit. Soft-delete only. Queried by `agents-md-compiler.mts` via PostgREST to inject the Connected Apps section into compiled AGENTS.md. Managed via `GET/DELETE /admin/tenants/:tenantId/composio/connections` and the OAuth connect flow.
- **`task_composio_calls` table**: `id, task_id, tenant_id, toolkit, tool_name, called_at, phase` — audit log for Composio tool calls made during task execution. Written by `execute.ts` via PostgREST on the success path; `phase` is `'execution'` or `'delivery'`. Queried by `GET /admin/tenants/:tenantId/composio/usage`.
- **`archetype_edit_history` table**: `id, archetype_id, tenant_id, request_text (Text), before_json (Json), after_json (Json), changed_fields (Json — string[]), kind (String — 'create' | 'edit' | 'revert'), actor_user_id (String? — nullable for SERVICE_TOKEN), created_at (default now), deleted_at (DateTime?)`. Append-only audit trail for archetype changes. Indexed on `[archetype_id, created_at]` and `[tenant_id]`. Soft-delete only — never hard-delete rows. `actor_user_id` is null when the change was made via SERVICE_TOKEN. Written server-side on two paths: wizard create (`POST /archetypes`) writes a `kind:'create'` row; every PATCH (including status flips) writes a `kind:'edit'` row. The AI Assistant conversational editing feature also writes `kind:'edit'` rows via the same mechanism.
- **`archetype_generation_calls` table**: `id, tenant_id, archetype_id (nullable), call_type, model_requested, model_actual, prompt, response, prompt_truncated, response_truncated, prompt_tokens, completion_tokens, estimated_cost_usd, latency_ms, retry_count, status, error_message, created_by (nullable), created_at, deleted_at` — creation-scoped LLM-call trace table. One row per LLM call made during archetype generation, refinement, model recommendation, time estimation, or propose-edit. Persisted best-effort (non-blocking). Queried via psql or PostgREST for creation-side debugging.
- **Enums**: `Role` (PLATFORM_OWNER, ADMIN, EDITOR, USER, VIEWER) — global platform role. `TenantRole` (OWNER, ADMIN, MEMBER, VIEWER) — per-tenant role stored in `tenant_memberships`.

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

**[Moved to skill]** — Load `production-ops` skill for Render API commands, deploy checks, and known quirks.

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
│   ├── slack/        # Bolt event/action handlers + OAuth installation store; `handlers/override-handlers.ts` (extracted override card handlers); per-action approval modules: `approve-action.ts`, `edit-action.ts`, `reject-action.ts`; per-action rule modules: `rule-confirm-action.ts`, `rule-reject-action.ts`, `rule-rephrase-action.ts`
│   ├── middleware/   # Auth middleware: `auth.ts` (authMiddleware — SERVICE_TOKEN + Supabase JWT), `authz.ts` (requireAuth, requireTenantRole, requirePermission)
│   ├── validation/   # Zod schemas + HMAC signature verification
│   ├── services/     # Business logic services: archetype generator (`archetype-generator.ts` — wizard LLM prompt for employee creation; `generate()` passes `responseFormat: { type: 'json_object' }` matching `refine()` and `converse()`; `callLLMWithJsonRetry` retries once on empty/reasoning-only content before failing; `postProcess()` normalizes tool paths (bare `service/tool` → `/tools/service/tool.ts`, strips `tsx ` prefix) and trigger_sources (`type:'cron'` → `type:'scheduled'`) before validation), dispatcher, task creation, tenant/secret management, interaction classification, and more. Browse `src/gateway/services/` for the full list.
│   ├── lib/          # Shared gateway utilities: `http-response.ts` (`sendError()` + `sendSuccess()`), `prisma-helpers.ts` (`isPrismaError` + `ERROR_CODES`), `socket-mode-lock.ts`
│   └── inngest/      # Inngest client factory, event sender, serve registration
├── inngest/      # Durable workflow functions: lifecycle, watchdog, redispatch
│   ├── triggers/     # Cron trigger functions (guest-message-poll deregistered, not in serve.ts; daily-summarizer deregistered)
│   ├── lifecycle/    # Extracted lifecycle step modules
│   │   ├── steps/    # `delivery-retry.ts` (delivery retry loop), `approval-handler.ts` (approval handlers), `approval-handler-reject.ts` (extracted `handleReject`), `triage-and-ready.ts`, `execute.ts`, `validate-and-submit.ts`, `no-approval-path.ts`, `override-card.ts`, `reviewing-path.ts`, `notify-and-track.ts`, `lifecycle-helpers.ts` (`cleanupExecutionMachine`, `safeRecordWorkMetric`)
│   │   └── lib/      # `machine-provisioner.ts` — Fly.io/Docker machine provisioning + env-manifest assembly (extracted from `execute.ts`)
│   ├── lib/          # Shared: create-task-and-dispatch, poll-completion, pending-approvals, quiet-hours, reminder-blocks, `interaction-helpers.ts` (extracted from `interaction-handler.ts`), `postgrest-headers.ts` (`makePostgrestHeaders` — canonical PostgREST header factory, import from here)
│   └── events.ts     # Typed Inngest event schemas (`EventPayload`, `InngestStep`) — import from here, never inline event types
├── workers/      # Docker container code — runs inside the worker machine
│   └── lib/          # `agents-md-compiler.mts` (template compiler), `postgrest-client.ts` (shared DB client), `postgrest-types.ts` (typed PostgREST row interfaces — snake_case, use for all PostgREST reads/writes), `harness-helpers.mts` (extracted harness utilities: container naming, log helpers), `execution-phase.mts` (execution phase logic + `isToolAllowed()` capability enforcement), `delivery-phase.mts` (delivery phase logic extracted from harness), `output-schema.mts` (Zod schema for `StandardOutput` — includes optional `version` field)
├── repositories/ # Tenant-scoped data access layer (relocated from `src/gateway/services/`); `TaskRepository` (task lookups by ID/thread_ts/approval_ts), `EmployeeRuleRepository` (rule CRUD: get, countConfirmed, patchConfirm/Reject/Archive/Rephrase), `UserRepository` (user list/softDelete/restore — no create, users come from ensureUserExists), `ArchetypeGenerationCallRepository` (write-only best-effort trace of LLM calls made during archetype creation, refinement, and editing)
├── worker-tools/ # Shell tools (TypeScript, executed via tsx in Docker at /tools/)
└── lib/          # Shared: LLM client (`call-llm.ts` — $50/day cost circuit breaker, model enforcement), encryption (`encryption.ts` — AES-256-GCM for tenant secrets), model-selection engine (`model-selection/`), task terminal state sets (`task-status.ts` — `TERMINAL_STATUSES` and related constants), central config (`config.ts` — env vars as named constants for the top-3 high-churn files), shared HTTP client factory (`http-client.ts` — `createHttpClient`), email abstraction (`email/` — `SmtpEmailProvider` (nodemailer→Mailpit, local dev) and `ResendEmailProvider` (official `resend` SDK, production), selected by `RESEND_API_KEY` presence; factory: `createEmailProvider()`, singleton: `getEmailProvider()`), **output-contract single source** (`output-contract-constants.ts` — canonical paths, phase values, version constant, and `OutputClassification` re-export; World-A consumers import from here directly), **typed tool registry** (`tool-registry.ts` — exports `ToolDescriptor` interface and `ALL_TOOL_DESCRIPTORS` static aggregator; no disk reads, no regex), **skill registry** (`skill-registry.ts` — `getWorkerSkills()` reads `src/workers/skills/*/SKILL.md` frontmatter; returns `WorkerSkill[]` sorted by name), plus logging, retry utilities, and type definitions. Browse `src/lib/` for the full list.
prisma/           # Schema, migrations, seed
scripts/          # TypeScript scripts run via tsx (setup, trigger, verify)
tests/
├── unit/         # Fast unit tests (no DB) — run with `pnpm test` or `pnpm test:unit`
├── integration/  # DB-backed integration tests — run with `pnpm test:integration`
└── helpers/      # Shared test utilities: `lifecycle-mocks.ts` (`createLifecycleMocks()` factory for Inngest step mocking)
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
- **Searchable dropdowns — always use `SearchableSelect`**: Any dropdown/select in the dashboard that presents a list of options to the user MUST use `<SearchableSelect>` from `dashboard/src/components/ui/searchable-select.tsx` instead of the Radix UI `<Select>`. `SearchableSelect` is a single-select combobox with a built-in search input — it matches the hand-rolled dropdown style used in `RulesPanel.tsx` and gives users the ability to both scroll and type to filter options. Never use `<Select>` from `@/components/ui/select` for user-facing option lists. The only exception is programmatic/non-interactive selects where search is meaningless (e.g. a 2-option toggle). Props: `options: {value, label}[]`, `value: string`, `onValueChange: (v: string) => void`, `placeholder?`, `searchPlaceholder?`, `className?`, `disabled?`.
- **Dashboard UI sections use cards for visual separation** — Any panel, section, or grouping of related content in the dashboard MUST be wrapped in a card shell: `rounded-lg border bg-card` with `px-5 py-4` padding. This keeps the UI readable and prevents sections from bleeding together. Use `CollapsibleSection` (which already applies this styling) for collapsible content. For non-collapsible groups, apply the classes directly to the wrapper `<div>`. Never render a wall of content without clear card boundaries.
- **All navigatable UI state must be URL-encoded** — Every tab, filter, sub-navigation item, or modal that a user can navigate to MUST reflect its state in the URL (via query params or route segments), so that the exact view is shareable and survives a page refresh. Examples: a selected tab becomes `?tab=activity`, an active filter becomes `?status=done`, a selected employee stays at `/employees/:id`. Use `useSearchParams` (React Router) to read and write query params; preserve existing params when updating (e.g. copy current `URLSearchParams` and set only the changed key). Never use component-local state alone for anything the user might want to bookmark, share, or return to after a refresh.
- **End-user language is non-technical** — The end users of the AI Employee platform are non-technical (property managers, small business owners — not developers). When writing anything visible to end users — user-facing labels, UI copy, error messages, Slack notification text, dashboard copy — always use plain language. Examples: "Organization" not "Tenant", "Employee setup" not "Archetype configuration", "Approval needed" not "`risk_model.approval_required` is true".
- **AI employee outputs should be concise** — Slack messages, summaries, and guest replies produced by AI employees should be short and to-the-point. Avoid verbose explanations or filler text in delivered content. If the user asks for more detail, provide it; otherwise, keep it brief.
- **`/tmp/` contract files must be written via tools only** — `/tmp/summary.txt` and `/tmp/approval-message.json` are the harness output contract files. They MUST be written exclusively via TypeScript tools in `/tools/` (e.g., `submit-output.ts`). Never write to these files directly via `echo`, shell redirects, or any non-tool method. The harness reads these files after the OpenCode session completes — if written in the wrong format, the task will fail. This applies to both the execution phase and the delivery phase.
- **Platform settings over env vars** — Platform-level behavior defaults (VM size, cost limits, thresholds, Slack channels) are stored in the `platform_settings` DB table, not env vars. Use `getPlatformSetting(key)` from `src/lib/platform-settings.ts` to read. Never add hardcoded fallback values — missing required settings throw errors at startup. Managed via `/dashboard/settings` or `PATCH /admin/platform-settings/:key`.
- **`sendError()` / `sendSuccess()` for ALL gateway responses** — Every gateway route handler MUST use `sendError()` from `src/gateway/lib/http-response.ts` for error responses (never `res.status(N).json({...})` inline) and `sendSuccess()` for ALL 2xx responses (never `res.status(N).json({...})` inline for success either). Both helpers live in `src/gateway/lib/http-response.ts`. `sendSuccess(res, status, body?)` sends `res.status(status).json(body)` when body is present, `res.status(status).end()` when absent — no envelope wrapping. This ensures consistent response shape and structured logging across all routes.
- **Gateway-proxied set-password (MANDATORY)** — `POST /invitations/set-password` is the ONLY place `SUPABASE_SECRET_KEY` is used to set a user's password. The browser never holds the secret key. This endpoint is token-bound (requires a valid `pending` invitation token), status/expiry-gated, and email-matched (only sets the password on the account whose email matches the invitation). Never add a client-side path that calls the Supabase admin API directly.
- **`src/worker-tools/knowledge_base/` uses snake_case intentionally** — All other tool directories under `src/worker-tools/` use kebab-case (e.g. `slack/`, `hostfully/`). `knowledge_base/` is the lone exception: it uses snake_case to match the Docker image path `/tools/knowledge_base/` exactly. Do not rename it to `knowledge-base/`.
- **`requireEnv()`/`optionalEnv()` in worker tools, never raw `process.env`** — All shell tools in `src/worker-tools/` must read environment variables via `requireEnv(name)` (throws if missing) or `optionalEnv(name)` (returns `string | undefined`). Never access `process.env.FOO` directly — missing vars fail silently and produce cryptic errors at runtime.
- **`pnpm test` = fast unit suite; `pnpm test:integration` = DB suite** — `pnpm test` (alias: `pnpm test:unit`) runs the unit suite in `tests/unit/` — no DB required, completes in seconds. `pnpm test:integration` runs `tests/integration/` against the test DB (`ai_employee_test`). Run `pnpm test:db:setup` once before integration tests. `pnpm test:all` runs both suites sequentially.

- **Output-contract single source (World-A / World-B split)** — All output-contract paths, phase values, version constant, and `OutputClassification` type are authored once in `src/lib/output-contract-constants.ts` (World-A). Worker-tools run in a tsx-isolated environment and cannot import World-A modules, so they consume a generated copy at `src/worker-tools/lib/output-contract-paths.generated.ts` (World-B). The generated file carries a `// @generated by scripts/generate-worker-constants.ts — do not edit` header. Run `pnpm generate-worker-constants` to regenerate; CI has a diff gate that fails if the committed copy is stale. Never edit the generated file directly and never duplicate these constants elsewhere.

- **Typed `ToolDescriptor` + startup-cached discovery** — Every shell tool under `src/worker-tools/` exports a `descriptor: ToolDescriptor` object (type defined in `src/worker-tools/lib/types.ts`). `src/lib/tool-registry.ts` exports `ALL_TOOL_DESCRIPTORS` as a static typed array — no disk reads, no regex. `discoverTools()` in `src/gateway/services/tool-parser.ts` maps `ALL_TOOL_DESCRIPTORS` to `ToolMetadata` and caches the result at first call (startup). This eliminates the production bug where `src/worker-tools/` was not present in the gateway image. When adding a new shell tool, export a `descriptor` from the tool file and add it to `ALL_TOOL_DESCRIPTORS` in `tool-registry.ts`.

- **`enforce_tool_registry` capability flag** — `archetypes.enforce_tool_registry Boolean @default(false)`. When `false` (default), all tools are available — byte-identical to pre-enforcement behavior. When `true`, `isToolAllowed(toolPath, archetype)` in `src/workers/lib/execution-phase.mts` restricts the worker to only the paths listed in `archetype.tool_registry.tools`; denied attempts are logged with `archetypeId` and `toolPath`. Do NOT enable this flag on any employee without first validating that every path in its `tool_registry` resolves to a real file with a descriptor. **Pre-enforcement gate**: `PATCH /admin/tenants/:tenantId/archetypes/:id` with `enforce_tool_registry: true` (flipping from `false`) re-resolves the archetype's current `tool_registry.tools` via `resolveToolPaths()` and returns `400 ENFORCE_REGISTRY_INVALID` if any tool drops or the resolved list is empty. This prevents silently locking an employee out of all tools.

- **Archetype editing shared helpers** — `mapArchetypeRowToConfig`, `validateProposalFields`, and `resolveToolPaths` live in `src/gateway/lib/archetype-edit-helpers.ts`. All are used by `propose-edit`, `converse-create`, and the PATCH route. Import from there; do not inline or duplicate these functions in route handlers. `resolveToolPaths(tools, descriptors?, connectedToolkits?)` normalizes raw tool paths (strips `tsx ` prefix, expands bare `service/tool` → `/tools/service/tool.ts`, appends `.ts` to extension-less `/tools/` paths) and returns `{ resolved: string[]; dropped: Array<{tool, reason}> }`. It never throws — unknown paths are dropped and logged, not rejected.

- **Tool-path never-block policy** — `validateProposalFields()` in `archetype-edit-helpers.ts` enforces a never-block policy for tool paths, trigger sources, and input schema: unknown tools are resolved and dropped (logged as warn), invalid trigger sources are coerced to `{ type: 'manual' }` (logged), invalid input schema items are dropped (logged). The ONLY guard that returns `{ ok: false, reAsk: true }` is prose-went-blank on EDIT (a field that had content is now empty). Both `converse-create` and `propose-edit` routes convert `reAsk:true` into `{ kind: 'question' }` (200) — never a 422.

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

### Future Work (Backlog — Not in Current Plan)

The following improvements were identified during the single-source-and-scale-architecture plan but deferred:

- **AGENTS.md typed-section schema** — a machine-readable schema for AGENTS.md sections so tooling can validate structure and detect drift automatically.
- **Prompts as versioned template objects** — replace raw string fields (`execution_steps`, `delivery_steps`) with structured template objects that carry named slots, a version number, and a changelog. This would make prompt evolution auditable and enable automated regression detection.

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

## Long-Running Commands

**[Moved to skill]** — Load `long-running-commands` skill for tmux patterns, cleanup rules, and session naming.

### Tmux Session Cleanup (MANDATORY)

**[Moved to skill]** — See `long-running-commands` skill.

## Known Issues

**[Moved to skills]** — For known issues: production/tunnel issues → `production-ops`; Slack/Socket Mode issues → `slack-conventions`; Inngest Dev Server issues → `inngest`.

## Task Debugging Quick Reference

**[Moved to skill]** — Load `debugging-lifecycle` skill for task debugging commands and stuck-state diagnostics.

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

**[Moved to skill]** — Load `feature-verification` skill for the full checklist, PostgREST verification, and smoke-test employee.

---

## Post-Implementation E2E Testing (MANDATORY — applies to EVERY implementation, not just plans)

**YOU MUST run a real end-to-end test after implementing any feature or fix. "Code looks correct" is not a substitute for actual execution.**

This is non-negotiable. After any implementation work — whether part of a formal plan or a one-off fix — you MUST:

1. **Run the relevant live path yourself.** If you changed the Slack trigger flow, send an @mention. If you changed a webhook handler, fire the webhook. If you changed task delivery, trigger a task and watch it complete. Do not ask the user to test for you.
2. **Observe real output.** Check logs, Slack messages, DB state. Confirm the feature behaves exactly as intended, end-to-end.
3. **Document what you observed.** When reporting completion, include the task ID, state trace, or log excerpt that proves it worked — not just "I implemented the change."

### Why this is mandatory

Without a live test, you cannot detect:

- Gateway restart timing gaps that swallow events
- Silent failure modes that `log.warn` instead of throwing
- State machine transitions that look correct in code but fail at runtime
- Slack API errors, Inngest retry failures, or DB write failures

### How to self-test (Slack trigger workflow)

```bash
# 1. Pre-flight — confirm single stable gateway
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l  # must be ≤2 (tsx watch + one gateway)
lsof -i :7700 -sTCP:LISTEN                         # must show exactly ONE PID
grep "Socket Mode connected" /tmp/ai-dev.log | tail -1  # must be recent

# 2. Watch logs live during the test
tail -f /tmp/ai-dev.log | grep -E "(app_mention|interaction|trigger|confirmation|card|error)" &

# 3. Use browser automation (CDP) to send the @mention in Slack
# OR confirm with the user that they will send it immediately after your pre-flight

# 4. Verify the confirmation card appeared within ~10 seconds
grep "confirmation card" /tmp/ai-dev.log | tail -3

# 5. Kill the tail
kill %1
```

### Gateway stability rule (CRITICAL for Slack testing)

tsx watch restarts the gateway every time you save a file. A restart takes 5–15 seconds. If the user tests during a restart window, the @mention is silently dropped. **Always wait for the gateway to fully stabilize before testing:**

```bash
# Confirm the gateway has been stable for at least 30 seconds
GATEWAY_PID=$(lsof -ti :7700 -sTCP:LISTEN)
echo "Gateway PID: $GATEWAY_PID — started at:"
ps -o lstart= -p $GATEWAY_PID
grep "Socket Mode connected" /tmp/ai-dev.log | tail -1
```

If you made code changes immediately before testing, wait 15–30 seconds after the last file save before triggering the test.

---

## Plan E2E Validation (MANDATORY)

Every plan for an AI employee feature must include a **real browser E2E validation wave** as the final non-notification step.

**Slack trigger workflow changes require live @mention E2E.** Any plan that modifies the Slack trigger workflow — `app_mention` handler, `slack-trigger-handler`, `interaction-handler`/classifier, confirmation cards, `slack-copy`, or any code in the path from @mention to task dispatch — MUST include all three of the following before the plan passes:

1. **Single-gateway pre-flight**: `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` must return `1`. If it returns more, kill the zombies before proceeding — a stale socket will silently absorb ~50% of test events.
2. **Live @mention → Confirm → Done E2E**: Send a real @mention in Slack, click Confirm on the card, then verify `tasks.status = Done` in the DB. Record the task ID and the full `task_status_log` trace.
3. **"Verified from code" or "unit tests pass" is explicitly insufficient** for this workflow — the live Slack path must be exercised.

| Guide                                                              | Scenarios | Domain                                                                                      |
| ------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------- |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`          | A–F       | Approval paths, terminal state blocks, context thread replies, supersede, expiry, failure   |
| `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` | A–F       | Rule extraction, rule injection, feedback consolidation, rule synthesis                     |
| `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`       | AC1–AC8   | Wizard generation, field quality, full lifecycle with approval, Slack delivery verification |

**Minimum for any guest-messaging change**: Slack UX Scenario A (approve happy path).
**Minimum for any archetype generator, wizard, or delivery pipeline change**: AI Employee E2E guide (AC1–AC8).
**Minimum for any Slack trigger workflow change** (app_mention, slack-trigger-handler, interaction-handler, confirmation cards): Single-gateway pre-flight + live @mention → Confirm → Done E2E.
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

| Document                                                                         | When to Read                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/CURRENT-ARCHITECTURE.md`                                      | Living architecture diagram — current system topology, trigger paths, approval gate, OpenCodeGo routing. Start here for a quick visual overview.                                                                                                                                                                                                                |
| `docs/architecture/2026-04-14-0104-full-system-vision.md`                        | Architecture, archetypes, lifecycle, event routing, operating modes, multi-tenancy                                                                                                                                                                                                                                                                              |
| `docs/architecture/2026-03-22-2317-ai-employee-architecture.md`                  | Original detailed architecture (data model, security, scaling, cost estimates)                                                                                                                                                                                                                                                                                  |
| `docs/architecture/2026-04-14-0057-worker-post-redesign-overview.md`             | Worker redesign scope (before/after, files added/removed)                                                                                                                                                                                                                                                                                                       |
| `.sisyphus/plans/worker-agent-delegation-redesign.md`                            | Active redesign plan (14 tasks across 4 waves)                                                                                                                                                                                                                                                                                                                  |
| `docs/guides/2026-04-16-0310-manual-employee-trigger.md`                         | Manual employee trigger API — endpoints, curl examples, how it works                                                                                                                                                                                                                                                                                            |
| `docs/guides/2026-04-16-1655-multi-tenancy-guide.md`                             | Multi-tenancy: provisioning tenants, Slack OAuth, per-tenant secrets, verification                                                                                                                                                                                                                                                                              |
| `docs/snapshots/2026-04-29-2255-current-system-state.md`                         | Point-in-time system state snapshot: full lifecycle, harness flow, all gateway routes, DB schema, shell tool CLI syntax, Docker services, shared libraries — includes interaction handler unification, guest messaging full flow, learned rules pipeline                                                                                                        |
| `docs/planning/2026-04-21-2202-phase1-story-map.md`                              | Phase 1 story map: stories across multiple releases + cleanup, all epics and dependencies                                                                                                                                                                                                                                                                       |
| `docs/planning/2026-04-21-1813-product-roadmap.md`                               | Product roadmap: 4 phases, design partner strategy, success criteria                                                                                                                                                                                                                                                                                            |
| `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`                             | Adding a new shell tool — file structure, CLI pattern, mock fixtures, Docker, documentation                                                                                                                                                                                                                                                                     |
| `docs/testing/2026-05-04-2023-local-e2e-testing.md`                              | Local E2E testing without real external APIs — mock convention, fixture structure, env propagation, running full lifecycle tests locally                                                                                                                                                                                                                        |
| `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`                        | Slack UX E2E test guide — 6 scenarios (A–F): approve, reject, edit & send, supersede, expiry, failure. Step-by-step with DB checks, Slack UI verification, Quick-Reference table                                                                                                                                                                                |
| `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md`               | Feedback pipeline E2E test guide — 6 scenarios (A–F): rule extraction, @mention teaching, awaiting_input path, rule injection, feedback consolidation, rule synthesis                                                                                                                                                                                           |
| `docs/architecture/airbnb-integration/2026-05-12-1120-go-no-go-decision.md`      | Airbnb direct integration: definitive NO-GO decision with evidence matrix, re-evaluation triggers, and comparison to Hostfully path                                                                                                                                                                                                                             |
| `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md`    | Airbnb integration market landscape: Tier 1 (official partners), Tier 2 (Repull middleware), Tier 3 (unofficial/stale OSS). Repull deep-dive. Implications for the platform.                                                                                                                                                                                    |
| `docs/architecture/airbnb-integration/2026-05-12-1120-partner-api-next-steps.md` | Playbook for pursuing Airbnb Partner API access when the platform reaches scale (50+ customers, 500+ listings, 6+ months track record)                                                                                                                                                                                                                          |
| `docs/guides/2026-05-12-1731-api-integration-practices.md`                       | Adding or debugging any external API integration — response envelope patterns, safe casting, shape smoke tests, silent null tracing                                                                                                                                                                                                                             |
| `docs/employees/guest-messaging.md`                                              | Working on guest-messaging employee — archetype IDs, full inbound flow, CRITICAL gotchas, Hostfully test resources, Airbnb E2E test account                                                                                                                                                                                                                     |
| `docs/employees/code-rotation.md`                                                | Working on code-rotation employee — archetype IDs, lock IDs, trigger command, what it does                                                                                                                                                                                                                                                                      |
| `docs/employees/daily-summarizer.md`                                             | Working on summarizer employee — channel IDs per tenant, failure diagnostics, cron config                                                                                                                                                                                                                                                                       |
| `docs/employees/2026-05-21-1721-jira-motivation-bot.md`                          | Working on jira-motivation-bot employee — archetype ID, webhook setup, trigger command, mock mode, E2E flow, known gotchas, tenant secrets                                                                                                                                                                                                                      |
| `docs/employees/cleaning-schedule.md`                                            | Working on cleaning-schedule employee — archetype ID, trigger command, Notion page IDs, Slack channel, gotchas                                                                                                                                                                                                                                                  |
| `docs/employees/2026-06-02-1230-engineer.md`                                     | Working on engineer employee — archetype IDs, GitHub App setup, trigger command, what it does, known gotchas                                                                                                                                                                                                                                                    |
| `docs/guides/2026-05-14-0040-slack-tenant-integration.md`                        | Slack OAuth or per-tenant token issues — TenantInstallationStore, loadTenantEnv, re-connecting after DB reset                                                                                                                                                                                                                                                   |
| `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`                    | Per-developer Slack app setup — create dev app, enable Socket Mode, register sandbox teamId, set personal xapp- token in .env. Required for every new engineer to avoid round-robin event drops with prod.                                                                                                                                                      |
| `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`                     | Full E2E test guide for AI employee creation → execution → approval → delivery. Covers wizard flow, field quality checks (AC1–AC8), lifecycle verification, Slack delivery confirmation, manual approval fallback, and all known gotchas.                                                                                                                       |
| `docs/infrastructure/2026-05-28-1900-cloud-deployment-guide.md`                  | Deploying to production — Supabase Cloud, Render, Inngest Cloud, Fly.io. Step-by-step provisioning, full env var reference, database migration, CI/CD pipeline, cost breakdown, and troubleshooting.                                                                                                                                                            |
| `docs/guides/2026-06-01-2246-production-debugging-guide.md`                      | Debugging production issues — topology overview, cloud DB queries (port 5432 only), Fly.io machine inspection via REST API, Render env var gotchas, Inngest retry loop diagnosis, known production bugs and fixes, re-trigger instructions.                                                                                                                     |
| `.sisyphus/plans/2026-06-01-2344-platform-settings-table.md`                     | Platform settings table implementation plan — DB schema, admin API endpoints, dashboard settings page, env var migration                                                                                                                                                                                                                                        |
| `docs/guides/2026-06-02-1727-github-integration.md`                              | Working on GitHub App integration — OAuth install flow, webhook handling, token delivery to workers, multi-environment two-App setup (dev vs prod)                                                                                                                                                                                                              |
| `docs/employees/2026-06-03-0243-google-assistant.md`                             | Working on Google Workspace Assistant employee — archetype IDs, trigger command (`google-workspace-assistant`), available tools, required tenant secrets, known gotchas                                                                                                                                                                                         |
| `docs/guides/2026-06-05-0111-maintainability-audit.md`                           | Reviewing or planning maintainability/refactoring work — full findings by dimension with file:line evidence and finding IDs.                                                                                                                                                                                                                                    |
| `docs/guides/2026-06-09-1448-user-auth-rbac.md`                                  | Multi-tenant user auth and RBAC — JWT flow, SERVICE_TOKEN, dual-env profiles (LOCAL HS256 vs CLOUD ES256), key model, invitation flow (custom email + set-password + accept page), bootstrap, cloud setup, known gotchas.                                                                                                                                       |
| `docs/guides/2026-06-10-1118-email-setup.md`                                     | Email system — Mailpit vs Resend provider selection, verified `dozaldevs.com` sending domain, env vars, invitation API, local testing via Mailpit web UI, and known gotchas (token not in POST response, transient 500 on accept, singleton restart rule).                                                                                                      |
| `docs/guides/2026-06-12-2030-drift-audit.md`                                     | Complete audit of every duplicated platform fact — output-contract paths, classification enums, execution prompt, phase values, tool CLI docs, skill metadata, env-var requirements — with per-area drift risk ratings, intentional asymmetries, and the target single-source architecture. Load when planning or reviewing any consolidation/refactoring work. |
| `.sisyphus/plans/2026-06-11-1935-conversational-employee-editing.md`             | Implementation plan for the AI Assistant conversational editing feature — archetype prose edits, diff preview, approve/revert flow                                                                                                                                                                                                                              |
