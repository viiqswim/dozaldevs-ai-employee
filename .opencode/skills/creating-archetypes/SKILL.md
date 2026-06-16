---
name: creating-archetypes
description: Use when creating a new AI employee archetype or modifying an existing one. Covers all archetype schema fields, seed data patterns, trigger setup, the loadTenantEnv() injection pipeline, approved models, and the 4-step checklist for deploying a new employee end-to-end.
---

# Creating AI Employee Archetypes

## What Is an Archetype?

An archetype is the config record that defines an AI employee. Every employee is config-driven — one `archetypes` row fully specifies who the employee is, what it does, how it is triggered, what model it uses, and whether human approval is required.

Source of truth: `prisma/schema.prisma` → `model Archetype` (@@map("archetypes"))

---

## Approved Models — CRITICAL CONSTRAINT

The `model` field must reference a model from the `model_catalog` table. Use the recommendation engine:

```bash
POST /admin/tenants/:tenantId/archetypes/recommend-model
```

The model-selection engine (`src/lib/model-selection/`) profiles the archetype and ranks catalog models by cost, quality, speed, and tool reliability. The catalog is managed via `GET/POST/PATCH/DELETE /admin/model-catalog` (global, not tenant-scoped).

**Default seed model**: `minimax/minimax-m2.7` — safe fallback when the recommendation engine is not used.

**Seeded catalog models (global):**

- `minimax/minimax-m2.7`
- `minimax/minimax-m2.5`
- `minimax/minimax-m3`
- `zhipu/glm-5.1`
- `zhipu/glm-5`
- `moonshot/kimi-k2.5`
- `moonshot/kimi-k2.6`
- `xiaomi/mimo-v2.5-pro`
- `xiaomi/mimo-v2.5`
- `alibaba/qwen3.7-max`
- `alibaba/qwen3.7-plus`
- `alibaba/qwen3.6-plus`
- `deepseek/deepseek-v4-pro`
- `deepseek/deepseek-v4-flash`

**OpenCodeGo routing**: When `OPENCODE_GO_API_KEY` is set, the harness auto-routes compatible execution models through OpenCodeGo instead of OpenRouter. Supported models include `minimax/minimax-m2.7`, `deepseek/deepseek-v4-flash`, `xiaomi/mimo-v2.5-pro`, and others — see `src/lib/go-models.ts` for the full list.

**Forbidden models**: Never hardcode `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, or `openai/gpt-4o-mini` as the `model` field. Any model NOT in the `model_catalog` table is forbidden.

**Gateway-only models**: The `gateway_llm_model` platform setting (default: `deepseek/deepseek-v4-flash`) controls the verification/judge LLM. **NEVER** use it as the `model` field in archetypes — it is not an execution model.

---

## Complete Archetype Schema Reference

All fields from `model Archetype` in `prisma/schema.prisma`:

### Identity & Routing

| Field              | Type   | Required? | Description                                                                    |
| ------------------ | ------ | --------- | ------------------------------------------------------------------------------ |
| `id`               | UUID   | Yes       | Stable deterministic UUID. Use a fixed UUID in seeds so upserts are idempotent |
| `tenant_id`        | UUID   | Yes       | Which tenant owns this archetype. Unique constraint: `(tenant_id, role_name)`  |
| `role_name`        | String | Yes       | URL-safe slug used in admin API: `POST /employees/:slug/trigger`               |
| `department_id`    | UUID   | No        | Links to `departments` table. Optional grouping                                |
| `runtime`          | String | Yes       | Always `'opencode'` for active employees                                       |
| `deliverable_type` | String | No        | Semantic label: `slack_message`, `hostfully_message`, `lock_code_rotation`     |

### AI Prompt Fields

These four fields together define the full LLM context injected into the worker:

| Field                   | Type | Description                                                                                                                                                                |
| ----------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system_prompt`         | Text | **WHO the employee is** — identity, persona, role framing, behavioral constraints. Written in first or second person. Contains no procedural steps.                        |
| `instructions`          | Text | **WHAT to do when triggered** — the full step-by-step task procedure. References env vars (`$LEAD_UID`, `$TASK_ID`, etc.) and specific tool invocations.                   |
| `agents_md`             | Text | **AGENTS.md content** injected as the third-level AGENTS.md in the OpenCode session. All archetypes share `PLATFORM_AGENTS_MD` (read from `src/workers/config/agents.md`). |
| `delivery_instructions` | Text | **What to do during the delivery phase only** (after PM approves). Receives approved content and publishes it. Can be `null` for approval-free employees.                  |

#### system_prompt vs instructions — Know the Difference

```
system_prompt  → "You are a precise lock code rotation specialist..."
                  Identity + behavioral constraints
                  NO procedural steps

instructions   → "STEP 1: Get today's date. Run: date +%Y-%m-%d
                  STEP 2: Fetch all properties from PostgREST..."
                  Full step-by-step procedure with $ENV_VAR refs and tool invocations
```

### Risk & Approval

| Field               | Type | Description                                                                                                                             |
| ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `risk_model`        | JSON | `{ "approval_required": boolean, "timeout_hours": number }`. When `false`, lifecycle skips `Reviewing → Approved → Delivering` entirely |
| `concurrency_limit` | Int  | Max concurrent tasks for this archetype. Default: 3. Webhook-triggered employees often need higher (e.g., 5). Sequential-only use 1.    |

#### risk_model examples from seed.ts

```typescript
// Approval required — human reviews before delivery
risk_model: { approval_required: true, timeout_hours: 24 }

// Fully automated — no Slack card, straight to Done after submitting
risk_model: { approval_required: false, timeout_hours: 2 }
```

### Notification & Enrichment

| Field                  | Type   | Description                                                                                                                                         |
| ---------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification_channel` | String | Slack channel ID (e.g., `C0AMGJQN05S`) for task notifications and approval cards. Set `null` to use `tenant.config.notification_channel`            |
| `enrichment_adapter`   | String | Adapter for enriched Slack notification blocks. `'hostfully'` = guest name, property, check-in/out. `null` = plain blocks                           |
| `pre_check_adapter`    | String | Pre-execution check adapter. `'hostfully'` = before spawning worker, checks if last message is from host; if so, skips to Done without a worker run |

### Worker Runtime

| Field        | Type   | Description                                                                                                             |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `vm_size`    | String | Per-archetype Fly.io VM size override. e.g., `'shared-cpu-2x'` for memory-intensive workers. Overrides `WORKER_VM_SIZE` |
| `model`      | String | LLM model ID. MUST be one of the two approved models.                                                                   |
| `worker_env` | JSON   | Static env vars injected directly into the worker machine. Rarely needed — prefer `tenant_secrets` for credentials.     |

### Tool Registry & Triggers

| Field             | Type | Description                                                                                                             |
| ----------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `tool_registry`   | JSON | Informational list of tools the employee uses. Not enforced at runtime but useful documentation.                        |
| `trigger_sources` | JSON | Documents the trigger type. `{ type: 'manual' }`, `{ type: 'cron', expression: '...' }`, `{ type: 'cron_and_webhook' }` |

---

## Seed Pattern (prisma/seed.ts)

Always use `prisma.archetype.upsert` with a stable UUID so the seed is idempotent:

```typescript
const archetype = await (prisma.archetype as any).upsert({
  where: { id: 'YOUR-STABLE-UUID-HERE' },
  create: {
    id: 'YOUR-STABLE-UUID-HERE',
    role_name: 'my-new-employee', // URL slug used in admin API
    runtime: 'opencode', // always opencode
    system_prompt: MY_SYSTEM_PROMPT, // WHO the employee is
    instructions: MY_INSTRUCTIONS, // WHAT to do when triggered
    model: 'minimax/minimax-m2.7', // MUST be an approved model
    deliverable_type: 'slack_message', // semantic label
    tool_registry: { tools: ['/tools/slack/post-message.ts'] },
    trigger_sources: { type: 'manual' },
    risk_model: { approval_required: true, timeout_hours: 24 },
    notification_channel: 'CXXXXXXXXXX', // Slack channel ID, or null for tenant default
    concurrency_limit: 1,
    agents_md: PLATFORM_AGENTS_MD, // read from src/workers/config/agents.md
    delivery_instructions: null, // or a string for approval-required employees
    enrichment_adapter: null, // or 'hostfully' if applicable
    pre_check_adapter: null, // or 'hostfully' if applicable
    vm_size: null, // or 'shared-cpu-2x' for memory-intensive
    tenant_id: 'TENANT-UUID',
    department_id: 'DEPT-UUID', // optional
  },
  update: {
    // Same fields as create, minus tenant_id (immutable — never include in update)
    role_name: 'my-new-employee',
    // ... all other mutable fields
  },
});
```

**Critical**: `tenant_id` is immutable — include it only in `create`, never in `update`.

---

## loadTenantEnv() — How Secrets Reach the Worker

`src/gateway/services/tenant-env-loader.ts` builds the Fly.io machine environment:

1. **Platform whitelist** injects: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `INNGEST_EVENT_KEY`, `OPENROUTER_API_KEY`, `NODE_ENV`, and a few others.
2. **Tenant secrets auto-injection** (no whitelist): reads ALL `tenant_secrets` rows for the tenant, applies `env[key.toUpperCase()] = value` for each row:
   - `hostfully_api_key` → `HOSTFULLY_API_KEY`
   - `hostfully_agency_uid` → `HOSTFULLY_AGENCY_UID`
   - `slack_bot_token` → `SLACK_BOT_TOKEN`
   - Any other secret stored → same auto-uppercase mapping
3. **Notification channel resolution**: `archetype.notification_channel` overrides `tenant.config.notification_channel`.
4. **Source channels**: `tenant.config.source_channels` → `SOURCE_CHANNELS` (comma-joined string).
5. **Publish channel**: `tenant.config.summary.publish_channel` → `PUBLISH_CHANNEL`.

**Rule**: Credentials go in `tenant_secrets` via admin API — never hardcoded in `worker_env` or `.env`.

```bash
# Store a secret for a tenant
curl -X PUT "http://localhost:7700/admin/tenants/{tenantId}/secrets/{key}" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"<secret-value>"}'
```

---

## Trigger Types

### 1. External Cron (preferred for scheduled jobs)

Configure cron-job.org to call the admin API trigger endpoint. No new Inngest function needed.

```
cron-job.org → POST /admin/tenants/:tenantId/employees/:slug/trigger
               Header: Authorization: Bearer {SERVICE_TOKEN}
               Body: {}
```

Set `trigger_sources: { type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' }` as documentation. The `timezone` field is metadata only — configure timezone directly on cron-job.org.

### 2. Webhook Trigger

Add a new route handler in `src/gateway/routes/` that creates a task and emits `employee/task.dispatched`.

```typescript
// src/gateway/routes/my-service.ts
router.post('/webhooks/my-service', async (req, res) => {
  // Validate payload (Zod schema)
  // Match tenant by webhook field
  // Find archetype by { tenant_id, role_name: 'my-employee' }
  // prisma.task.create(...)
  // inngest.send('employee/task.dispatched', { taskId, ... })
  res.json({ taskId });
});
```

Register the router in `src/gateway/server.ts`. Set `trigger_sources: { type: 'webhook' }` in the archetype.

### 3. Inngest Cron (rarely needed)

Use only when the trigger logic itself requires DB access or secret decryption (e.g., `trigger/guest-message-poll` that scans all tenant leads). Add a new function in `src/inngest/triggers/`.

---

## Output Contract (Required for Every Worker Run)

### How employees submit output

At the end of every task, the employee calls `submit-output.ts`:

```bash
tsx /tools/platform/submit-output.ts \
  --summary "One sentence describing what was done" \
  --classification "NEEDS_APPROVAL|NO_ACTION_NEEDED"
```

**Required flags:**

| Flag               | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `--summary`        | Human-readable summary of what was done                                     |
| `--classification` | `NEEDS_APPROVAL` (PM review required) or `NO_ACTION_NEEDED` (task complete) |

**Optional flags:**

| Flag           | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `--draft`      | Draft message/content for PM review (use with `NEEDS_APPROVAL`) |
| `--confidence` | Confidence score 0–1 (e.g. `0.95`)                              |
| `--reasoning`  | Explanation of the classification decision                      |
| `--urgency`    | Flag presence marks `urgency=true`                              |
| `--metadata`   | JSON object with additional structured data                     |

### What the platform handles automatically

After `submit-output.ts` is called:

- It writes `/tmp/summary.txt` in the correct JSON format — employees must never write this file directly
- If `approval_required: true` in the archetype, the harness auto-posts the Slack approval card and manages `/tmp/approval-message.json` — employees must **never** write `/tmp/approval-message.json` directly
- If `approval_required: false`, the harness skips the approval card and transitions straight to `Done`

### Key rule for archetype authors

**Do NOT include output format instructions in `agents_md`.** The platform injects them at runtime via `platform-procedures.mts` — every employee already receives the correct `submit-output.ts` instructions regardless of what is in `agents_md`. The `agents_md` field should only describe the employee's job: workflow steps, classification rules, domain knowledge, and which tools to use. Platform plumbing belongs at the platform level.

### Failure condition

If neither `/tmp/summary.txt` nor `/tmp/approval-message.json` is present when the worker exits → harness marks the task as `Failed`.

---

## Lifecycle States

```
Received → Triaging → AwaitingInput → Ready → Executing → Submitting
  → [if approval_required: true]  → Reviewing → Approved → Delivering → Done
  → [if approval_required: false] → Done  (skips Reviewing entirely)

Terminal states: Done, Failed, Cancelled
```

---

## Checklist: Creating a New Employee

### 1. Seed the Archetype

In `prisma/seed.ts`, add a `prisma.archetype.upsert` call with:

- [ ] `role_name` — URL-safe slug (no spaces)
- [ ] `system_prompt` — employee identity (WHO, not WHAT)
- [ ] `instructions` — step-by-step procedure (WHAT, with $ENV_VARS and tool calls)
  - [ ] `model` — use `recommend-model` endpoint output, or `minimax/minimax-m2.7` as default seed
- [ ] `runtime: 'opencode'`
- [ ] `risk_model` — approval gate config
- [ ] `agents_md: PLATFORM_AGENTS_MD` — always set this
- [ ] `tenant_id` — only in `create`, not in `update`

Run: `pnpm prisma db seed`

### 2. Add Shell Tools (if needed)

Add TypeScript scripts to `src/worker-tools/{service}/`. Local Docker mode: bind-mounted, no rebuild. Fly.io: requires image rebuild.

See: `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`

Rebuild when changing `src/workers/`:

```bash
docker build -t ai-employee-worker:latest .
```

### 3. Configure the Trigger

- **Scheduled**: cron-job.org → `POST /admin/tenants/:id/employees/:slug/trigger`
- **Webhook**: add route in `src/gateway/routes/` + register in `src/gateway/server.ts`
- **Manual only**: no extra setup

### 4. Store Tenant Secrets

```bash
curl -X PUT "http://localhost:7700/admin/tenants/{tenantId}/secrets/{key}" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value":"..."}'
```

Any stored secret key is auto-uppercased and injected as `$KEY` in the worker machine environment.

---

## Real-World Field Comparison

| Field                   | daily-summarizer                   | guest-messaging                    | code-rotation                      |
| ----------------------- | ---------------------------------- | ---------------------------------- | ---------------------------------- |
| `model`                 | `minimax/minimax-m2.7`             | `minimax/minimax-m2.7`             | `minimax/minimax-m2.7`             |
| `approval_required`     | `true`                             | `true`                             | `false`                            |
| `notification_channel`  | `null` (uses tenant default)       | `'C0AMGJQN05S'` (specific channel) | `'C0960S2Q8RL'` (specific channel) |
| `concurrency_limit`     | `1` (one daily run)                | `5` (multiple concurrent guests)   | `1` (Sifely rate limits)           |
| `enrichment_adapter`    | `null`                             | `'hostfully'`                      | `null`                             |
| `pre_check_adapter`     | `null`                             | `'hostfully'`                      | `null`                             |
| `delivery_instructions` | Publish to channel (approval path) | Send reply via Hostfully tool      | `null` (no delivery phase)         |
| `trigger_sources.type`  | `'cron'`                           | `'cron_and_webhook'`               | `'manual'`                         |

---

## OpenCodeGo Routing

When `OPENCODE_GO_API_KEY` is set, the worker harness automatically routes compatible models through OpenCodeGo instead of OpenRouter. This affects which models work reliably for a given archetype.

### How it works

`writeOpencodeAuth()` writes both `opencode-go` and `openrouter` entries to `auth.json`. Compatible models route through Go (flat $10/mo subscription); others fall back to OpenRouter. Provider selection is logged at task start.

### Two Go endpoint formats

| Format               | Endpoint                      | Used by                                  |
| -------------------- | ----------------------------- | ---------------------------------------- |
| OpenAI-compatible    | `/zen/go/v1/chat/completions` | `call-llm.ts` gateway routing            |
| Anthropic-compatible | `/zen/go/v1/messages`         | Worker harness (via OpenCode internally) |

`call-llm.ts` gateway routing only works with OpenAI-compatible models on Go. The worker harness handles both formats via OpenCode internally.

### Go model list

The full list of models that route through OpenCodeGo is in `src/lib/go-models.ts`. Check this file when picking a model to know whether it will use Go or OpenRouter.

### Usage limits

OpenCodeGo metered limits on top of the $10/mo subscription:

- $12 per 5-hour window
- $30 per week
- $60 per month

Track usage at https://opencode.ai/auth.

### Reverting to OpenRouter

Remove `OPENCODE_GO_API_KEY` from the environment. No archetype changes needed.

---

## Common Mistakes to Avoid

1. **Wrong model** — use only models from the `model_catalog`. Default seed: `minimax/minimax-m2.7`. Use the `recommend-model` endpoint rather than hardcoding.
2. **tenant_id in update** — immutable. Only in `create` block of upsert.
3. **Credentials in `.env`** — go in `tenant_secrets`. Only legitimate `.env` exception: `WEBHOOK_PUBLIC_URL`.
4. **Channel IDs in shared code** — channel IDs belong in `notification_channel` field or archetype `instructions`, not in `employee-lifecycle.ts`.
5. **Missing `/tmp/summary.txt`** — worker MUST write this file or harness marks task `Failed`.
6. **Employee-specific language in shared files** — `employee-lifecycle.ts`, `opencode-harness.mts`, `src/gateway/`, `src/lib/` serve ALL employees. Keep them generic.
7. **Forgetting `agents_md`** — always set `agents_md: PLATFORM_AGENTS_MD` (read from `src/workers/config/agents.md`).
