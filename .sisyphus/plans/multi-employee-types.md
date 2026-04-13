# Plan: Multi-Employee Types Platform

> **Status**: Ready for implementation  
> **Reviewed by**: Oracle (architecture) + Metis (gap analysis)  
> **All decisions locked** — do not reopen unless explicitly instructed.

---

## Decision Log (Final)

| Decision                   | Choice                                                                 | Rationale                                                                                                    |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Plugin framework           | **Option Y** — Simple in-memory Archetype Registry                     | Vision doc §3.2 explicit recommendation; validated by OpenClaw architecture (352K stars); ships weeks faster |
| First new employee type    | **Executive Assistant**                                                | Slack inbound + Jira read + Slack outbound + morning briefing cron                                           |
| Exec Assistant scope       | **Medium slice**                                                       | Slack in+out, Jira read, 1 scheduled briefing; email deferred                                                |
| Integration layer          | **Composio v3 (hybrid managed→self-host)**                             | 250+ tools, per-tenant OAuth vault, LLM-agnostic                                                             |
| Memory layer               | **Mem0 OSS** (pgvector backend)                                        | Drop-in, automatic extraction, per-user namespacing; Zep upgrade path at v2                                  |
| LLM default                | **MiniMax M2.7** (`minimax/minimax-m2.7` via OpenRouter)               | 10× cheaper than Claude; engineering plugin overrides to Claude                                              |
| Scale target               | **Millions of employees, thousands of businesses**                     | Multi-tenancy enforced in design from day 1; full enforcement (RLS, billing) phased                          |
| Composio deployment        | **(c) Hybrid** — managed cloud MVP, interface for self-host swap at v2 | Zero code changes for swap                                                                                   |
| Self-service onboarding    | **OUT of scope** — admin API only                                      | Separate follow-up plan                                                                                      |
| Email integration          | **OUT of scope** — deferred                                            | Composio makes this trivial later                                                                            |
| Exec assistant audit trail | **YES** — creates tasks + executions rows                              | Required for cost tracking and audit at "millions of employees" scale                                        |

---

## Architectural Context

**Existing platform** (do not change):

- Event Gateway: Fastify on Fly.io (always-on), currently handles `POST /webhooks/jira` and `POST /webhooks/github`
- Inngest: lifecycle functions, watchdog cron, redispatch — all registered in `src/gateway/serve.ts`
- Engineering flow: Jira webhook → `tasks` row → Inngest `engineering/task.received` → Fly.io Docker machine (OpenCode) → GitHub PR → `Done`
- Schema: 16 tables, all with `tenant_id` (defaulted to `00000000-0000-0000-0000-000000000001`)
- `callLLM()`: `src/lib/call-llm.ts` — wraps OpenRouter, logs cost to `executions`

**What this plan adds** (extension, not replacement):

- In-memory Archetype Registry with `engineeringArchetype` + `executiveAssistantArchetype` entries
- Composio as the universal tool layer for non-engineering API calls
- Mem0 as the per-employee memory layer
- MiniMax M2.7 as default LLM (with per-archetype override)
- Slack Events API as inbound trigger (intentional override of vision doc §8)
- Executive Assistant Inngest lifecycle functions (in-process, not Fly.io)

**What §8 override means**: The vision doc explicitly states "Slack is async-only, never triggers a task directly." This plan intentionally deviates for the Executive Assistant archetype only. Documented here to be explicit. Engineering archetype is unaffected.

---

## Critical Invariants (enforced throughout all phases)

1. **Composio has a circuit breaker** — a Composio outage must not take down all non-engineering employees silently
2. **Slack prompt injection protection** — raw Slack message text NEVER goes directly to an LLM; structural extraction is mandatory
3. **Slack replay attack prevention** — reject events older than 5 minutes (`X-Slack-Request-Timestamp`)
4. **Bot message filtering** — exec assistant must not respond to its own Slack messages (infinite loop)
5. **Inngest step timeouts** — every in-process step has an explicit timeout
6. **Tenant isolation** — Composio `user_id` is namespaced `${NODE_ENV}:${tenantId}` at all times
7. **Mem0 namespace isolation** — namespaced by `app_id=tenantId, agent_id=archetypeRoleId, user_id=slackUserId|"system"`
8. **Action allowlist** — exec assistant only calls Composio tools explicitly listed in `ArchetypeConfig.toolRegistry`

---

## Contracts Defined in This Plan

### ArchetypeConfig TypeScript Interface

File: `src/lib/types/archetype.ts`

```typescript
export type ArchetypeRuntime = 'opencode' | 'inngest';
export type TriggerSource = 'jira' | 'slack' | 'github' | 'cron' | 'manual';

export interface ArchetypeToolRegistry {
  composioToolkits: string[]; // e.g. ["SLACK", "JIRA"] — for Composio getTools()
  composioTools: string[]; // allowlisted tool slugs — action allowlist enforcement
  directClients: string[]; // e.g. ["github"] — bypass Composio, use direct client
}

export interface ArchetypeMemoryConfig {
  agentId: string; // Mem0 agent_id dimension (e.g. "executive_assistant")
  collectionName: string; // Always "mem0_memories"
}

export interface ArchetypeConfig {
  id: string; // UUID — matches archetypes.id in DB (for correlation only)
  roleId: string; // Slug: "engineering" | "executive_assistant"
  roleName: string; // Human-readable
  runtime: ArchetypeRuntime; // Dispatch key
  modelOverride?: string; // If set, overrides OPENROUTER_MODEL for this archetype
  triggerSources: TriggerSource[];
  toolRegistry: ArchetypeToolRegistry;
  concurrencyLimit: number; // Max concurrent executions per tenant
  memoryConfig?: ArchetypeMemoryConfig;
  inngestFunctionId?: string; // For "inngest" runtime only
}
```

### archetypes DB Table — Json Field Schemas

All three Json fields must follow these exact schemas when seeded:

**`trigger_sources`** (array of strings):

```json
["jira", "slack", "github", "cron", "manual"]
```

**`tool_registry`** (object):

```json
{
  "composio_toolkits": ["SLACK", "JIRA"],
  "composio_tools": [
    "SLACK_SEND_MESSAGE",
    "SLACK_REPLY_TO_MESSAGE",
    "JIRA_LIST_ISSUES",
    "JIRA_GET_ISSUE"
  ],
  "direct_clients": []
}
```

Engineering archetype `direct_clients`: `["github"]`, `composio_toolkits`: `[]`, `composio_tools`: `[]`

**`risk_model`** (object):

```json
{
  "cost_limit_usd": 5.0,
  "max_duration_seconds": 300,
  "allow_destructive_actions": false
}
```

### Inngest Event Names

| Archetype      | Event                                        | Notes                                                 |
| -------------- | -------------------------------------------- | ----------------------------------------------------- |
| Engineering    | `engineering/task.received`                  | **UNCHANGED** — do not rename, watchdog depends on it |
| Engineering    | `engineering/task.completed`                 | **UNCHANGED**                                         |
| Exec Assistant | `executive_assistant/slack.message.received` | New in Phase 7                                        |
| Exec Assistant | `executive_assistant/morning.briefing`       | Cron in Phase 9                                       |

### Composio API (v3 — pinned @composio/core@0.6.8)

**CRITICAL**: v3 API is completely different from v1/v2. Use ONLY these patterns:

```typescript
import { Composio } from '@composio/core'; // NOT ComposioToolSet
// NOT: entity.getTools(), entity_id, actions field

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

// Get tools for a user
const tools = await composio.getTools({
  apps: ['SLACK', 'JIRA'], // toolkit slugs
  user_id: composioUserId, // namespaced: `${NODE_ENV}:${tenantId}`
  limit: 50, // ALWAYS set — default is 20, Slack has 151 tools
});

// Execute a tool
const result = await composio.executeAction({
  action: 'SLACK_SEND_MESSAGE', // exact slug from tool catalog
  params: { channel: 'C123', text: 'Hello' },
  user_id: composioUserId,
});
// result.successful is false on failure — does NOT throw — always check this
if (!result.successful) throw new ComposioToolError(result);
```

### Mem0 OSS (npm: mem0ai)

**CRITICAL**: OSS version has different import path from cloud version.

```typescript
import { Memory } from 'mem0ai/oss'; // OSS (NOT 'mem0ai' — that's cloud)

const memory = new Memory({
  vector_store: {
    provider: 'pgvector',
    config: {
      url: process.env.DATABASE_URL,
      collection_name: 'mem0_memories', // NOT "memories" — avoids Prisma collision
    },
  },
  embedder: {
    provider: 'openai',
    config: {
      model: 'text-embedding-3-small',
      api_key: process.env.MEM0_EMBEDDING_OPENAI_KEY,
    },
  },
});

// Namespace dimensions: app_id=tenantId, agent_id=archetypeRoleId, user_id=slackUserId|"system"
await memory.add(messages, {
  app_id: tenantId,
  agent_id: 'executive_assistant',
  user_id: slackUserId,
});
const results = await memory.search(query, {
  app_id: tenantId,
  agent_id: 'executive_assistant',
  user_id: slackUserId,
});
// deleteAll REQUIRES at least one filter dimension — never call without filters
await memory.deleteAll({ app_id: tenantId, agent_id: 'executive_assistant' });
```

### Slack HMAC Verification (NOT the same as Jira)

```typescript
// Slack signature format: v0=${hmac-sha256(signingSecret, `v0:${timestamp}:${rawBody}`)}
// Jira uses X-Hub-Signature: sha256=<hex> with different base string — DO NOT REUSE

const signingSecret = process.env.SLACK_SIGNING_SECRET; // NOT SLACK_BOT_TOKEN
const timestamp = req.headers['x-slack-request-timestamp'];
const signature = req.headers['x-slack-signature'];
const rawBody = req.rawBody; // fastify-raw-body already installed

// Replay attack prevention — MANDATORY
if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
  return reply.status(400).send({ error: 'Request too old' });
}

const baseString = `v0:${timestamp}:${rawBody}`;
const computed =
  `v0=` + crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
  return reply.status(401).send({ error: 'Invalid signature' });
}

// url_verification event type: NO signature — respond with challenge immediately
if (body.type === 'url_verification') {
  return reply.send({ challenge: body.challenge });
}
```

---

## Required Environment Variables

All of the following must be added to `.env.example`. Missing ones are the most common source of silent failures.

| Variable                    | Phase   | Notes                                                          |
| --------------------------- | ------- | -------------------------------------------------------------- |
| `COMPOSIO_API_KEY`          | Phase 4 | Global platform key from composio.dev                          |
| `COMPOSIO_BASE_URL`         | Phase 4 | Optional. Set for self-hosted v2 swap. Default: Composio cloud |
| `SLACK_SIGNING_SECRET`      | Phase 7 | From Slack app settings. DIFFERENT from `SLACK_BOT_TOKEN`      |
| `MEM0_EMBEDDING_OPENAI_KEY` | Phase 5 | OpenAI API key for text-embedding-3-small (Mem0 OSS embedder)  |
| `OPENROUTER_MODEL`          | Phase 3 | Update default to `minimax/minimax-m2.7` in .env.example       |

Variables already in `.env.example` that are relevant:

- `OPENROUTER_API_KEY` — used by callLLM() for all LLM calls including MiniMax
- `SLACK_BOT_TOKEN` — for direct Slack SDK fallback (Composio outage path)
- `SLACK_WEBHOOK_URL` — for direct Slack sends (Composio outage path)

---

## Phase 0 — Pre-flight Verification

**Goal**: Ensure all prerequisites are met before any code is written. This phase is verification and configuration only — no application code changes.

**Todos**:

- [ ] **Verify pgvector availability**: Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"`. If no row returned, change `docker/docker-compose.yml` db service image from `postgres:17.6.1` to `pgvector/pgvector:pg17`, rebuild containers.
- [ ] **Add missing env vars to `.env.example`**: `COMPOSIO_API_KEY`, `COMPOSIO_BASE_URL` (optional), `SLACK_SIGNING_SECRET`, `MEM0_EMBEDDING_OPENAI_KEY`. Update `OPENROUTER_MODEL` default to `minimax/minimax-m2.7`.
- [ ] **Verify Composio v3 SDK**: Confirm `@composio/core@0.6.8` is the target package. Do not install yet — just confirm the version in preparation for Phase 4.
- [ ] **No code changes in this phase** — pre-flight only.

**Success criteria**: pgvector extension available in DB. All new env vars documented in `.env.example`.

---

## Phase 1 — Foundation + Plugin Framework

**Goal**: Define the ArchetypeConfig contract, build the in-memory registry, and seed the DB tables. This phase establishes the schema that all subsequent phases depend on. The registry is populated from static imports at boot — NOT from the database. The DB is seeded for audit/correlation purposes only.

**Files to create**:

- `src/lib/types/archetype.ts` — ArchetypeConfig interface (exact shape in Contracts section above)
- `src/lib/archetype-registry.ts` — in-memory map, populated at boot
- `src/lib/archetypes/engineering.ts` — stub entry (full extraction in Phase 2)
- `src/lib/archetypes/executive-assistant.ts` — stub entry (full impl in Phase 8)

**Todos**:

- [ ] Create `src/lib/types/archetype.ts` with exact interface from Contracts section. Export all types.
- [ ] Create `src/lib/archetype-registry.ts`:
  ```typescript
  // In-memory map — NOT DB-backed at boot. DB is a mirror, not the source of truth.
  // Populated synchronously at module load. No top-level await.
  import { engineeringArchetype } from './archetypes/engineering.js';
  import { executiveAssistantArchetype } from './archetypes/executive-assistant.js';
  const registry = new Map<string, ArchetypeConfig>([
    ['engineering', engineeringArchetype],
    ['executive_assistant', executiveAssistantArchetype],
  ]);
  export const archetypeRegistry = {
    get: (roleId: string) => registry.get(roleId),
    getAll: () => Array.from(registry.values()),
    // Hot-reload escape hatch (no-op until hot-reload is implemented):
    reloadArchetypes: () => {
      /* future: re-read from config */
    },
  };
  ```
- [ ] Create `src/lib/archetypes/engineering.ts` — stub with correct shape (runtime: "opencode", no Composio toolkits, direct_clients: ["github"]). Mark STUB clearly in JSDoc. Concrete config extracted in Phase 2.
- [ ] Create `src/lib/archetypes/executive-assistant.ts` — stub with correct shape (runtime: "inngest", composioToolkits: ["SLACK", "JIRA"], composioTools: per allowlist in Contracts section). Mark STUB clearly in JSDoc. Concrete impl in Phase 8.
- [ ] Update `prisma/seed.ts` to upsert `departments` and `archetypes` rows using Json schemas from Contracts section. Use Prisma `upsert` (not `create`) — seed is idempotent on re-run. Field `trigger_sources`, `tool_registry`, `risk_model` must match Contracts exactly.
- [ ] Fix `tests/gateway/inngest-serve.test.ts`: change `=== N` count check to `>= N` so adding new functions doesn't re-break this test.
- [ ] Run `pnpm test -- --run` — expect same pass count as before (minus pre-existing failures).
- [ ] Run `pnpm build` — expect zero TypeScript errors.

**Success criteria**:

- `archetypeRegistry.get("engineering")` returns ArchetypeConfig object
- `archetypeRegistry.get("executive_assistant")` returns ArchetypeConfig object
- `archetypeRegistry.get("unknown")` returns `undefined` (not throws)
- `archetypeRegistry.getAll()` returns exactly 2 entries
- `SELECT role_id, runtime, trigger_sources FROM archetypes` returns 2 rows
- `pnpm build` clean
- `pnpm test -- --run` — no new failures

---

## Phase 2 — Engineering Plugin Refactor

**Goal**: Extract the hardcoded engineering archetype configuration from `src/inngest/lifecycle.ts` into `src/lib/archetypes/engineering.ts`, wiring the Archetype Registry for the first time. Zero behavior change to engineering flow. Engineering Inngest event names (`engineering/task.*`) are NOT renamed — watchdog depends on them.

**Docker rebuild required** after this phase — engineering code lives in `src/workers/` and the Docker image must be rebuilt before E2E testing.

**Todos**:

- [ ] Read `src/inngest/lifecycle.ts` fully before touching anything. Identify the hardcoded Fly.io dispatch config (machine config, env vars passed, timeouts).
- [ ] Move engineering-specific Fly.io dispatch config into `src/lib/archetypes/engineering.ts` (the stub created in Phase 1). The `runtime: "opencode"` dispatch path calls the existing Fly.io dispatch logic, parameterized by the archetype config.
- [ ] In `lifecycle.ts`, replace hardcoded config with `archetypeRegistry.get("engineering")`. The dispatch logic reads from the archetype config. **Do NOT change the Inngest function ID or event names** — keep `engineering/task.received`, `engineering/task.completed`, `engineering/task-lifecycle` exactly as they are.
- [ ] Do NOT touch `src/watchdog.ts` — it references `engineering/task.*` events which are unchanged.
- [ ] Do NOT touch `src/workers/` in this phase beyond what's needed for the engineering archetype config extraction.
- [ ] Docker rebuild: `docker build -t ai-employee-worker:latest .` (per AGENTS.md protocol — run in tmux)
- [ ] Run E2E in tmux: `pnpm trigger-task` — expect task reaches `Done` status with PR created. Full run.
- [ ] Run `pnpm test -- --run` — expect same pass count as Phase 1.
- [ ] Run `pnpm build` — expect zero errors.

**Success criteria**: E2E pass. Test suite same as before. `lifecycle.ts` no longer has hardcoded Fly.io config — reads from archetype registry.

---

## Phase 3 — LLM Gateway

**Goal**: Add MiniMax M2.7 pricing to `callLLM()`, add per-archetype model routing, and add a MiniMax→Claude fallback. Note: `callLLM()` is used by the GATEWAY process (plan verification, triage). The WORKER process uses OpenCode SDK sessions directly (`orchestrate.mts`) — these are separate code paths. Do NOT conflate them.

**Todos**:

- [ ] Read `src/lib/call-llm.ts` fully. Locate the pricing map.
- [ ] Add MiniMax M2.7 entry to pricing map:
  - model ID: `minimax/minimax-m2.7` (exact string — not `minimax-m2.7` or `MiniMax/M2.7`)
  - input: `0.30` USD per million tokens
  - output: `1.20` USD per million tokens
- [ ] Add per-archetype model override: `callLLM()` accepts optional `modelOverride?: string`. Resolution order:
  1. `modelOverride` param (if provided)
  2. `process.env.OPENROUTER_MODEL` (existing behavior)
     The archetype's `modelOverride` field is passed explicitly by the caller — not auto-resolved inside `callLLM()`.
- [ ] Add MiniMax→Claude fallback: if `minimax/minimax-m2.7` returns 5xx or throws after 1 retry, retry once with `claude-sonnet-4-6`. Log the fallback as a warning (`pino` logger). This is ~20 lines — no new dependencies.
- [ ] Add per-call timeout: `callLLM()` accepts optional `timeoutMs?: number`. Default: no timeout (existing behavior). Callers pass 30_000 for exec assistant, 120_000 for engineering triage.
- [ ] Update `.env.example` default for `OPENROUTER_MODEL` to `minimax/minimax-m2.7`.
- [ ] Do NOT add per-tenant LLM override config — out of scope for v1. If asked by an agent: this is deferred.
- [ ] Do NOT add `callLLM()` calls in worker code — worker uses OpenCode SDK directly.
- [ ] Run `pnpm test -- --run` on `call-llm` tests.
- [ ] Run `pnpm build`.

**Success criteria**: `callLLM("minimax/minimax-m2.7", ...)` computes cost correctly. Fallback to Claude on 5xx. Existing tests unchanged.

---

## Phase 4 — Composio Integration

**Goal**: Install Composio v3 SDK, build the `ComposioClient` wrapper, add a circuit breaker, and establish per-tenant credential namespacing. This phase creates the integration infrastructure — it does NOT yet wire it to the exec assistant.

**CRITICAL**: Pin exact version `@composio/core@0.6.8`. v3 API is completely different from v1/v2 (see Contracts section). An agent using older training data will generate broken code.

**Todos**:

- [ ] `pnpm add @composio/core@0.6.8` (exact version, pinned)
- [ ] Create `src/lib/composio-client.ts` using v3 API patterns from Contracts section:
  - Export `createComposioClient(tenantId: string): ComposioClient` factory
  - `composioUserId` = `` `${process.env.NODE_ENV ?? 'development'}:${tenantId}` `` (prevents dev/prod collision)
  - Methods: `getTools(toolkits, tools)`, `executeTool(actionSlug, params)`, `healthCheck()`
  - All `executeTool` calls check `result.successful` and throw `ComposioToolError` if false
  - Add `limit: 50` to all `getTools` calls (default 20 silently truncates — Slack has 151 tools)
- [ ] Add circuit breaker to `ComposioClient`: simple counter-based (no new library). After 3 consecutive failures within 60s, open circuit and throw `ComposioCircuitOpenError` immediately. Reset after 60s. Log opens/closes.
- [ ] Add Composio health check: call from gateway startup (in `src/gateway/server.ts` or wherever the server boots). Log warning if unhealthy — do NOT abort startup (Composio may not be needed immediately).
- [ ] Add direct Slack SDK fallback for outbound Slack sends: `src/lib/slack-client.ts` likely already exists. Add `sendSlackMessageDirect(channel, text)` using `SLACK_BOT_TOKEN`. The exec assistant uses Composio for Slack normally, but falls back to this direct method if Composio circuit is open. This is the critical safety net.
- [ ] Add `COMPOSIO_API_KEY` and `COMPOSIO_BASE_URL` to `.env.example` (Phase 0 may have done this — verify and add if missing).
- [ ] Do NOT add per-tenant OAuth redirect flows — Composio managed cloud handles OAuth. Admin registers connected accounts via Composio dashboard for MVP.
- [ ] Unit tests `src/lib/composio-client.test.ts` — mock `@composio/core`. Test: successful execution, `successful: false` → throws, circuit breaker opens after 3 failures.
- [ ] `pnpm test -- --run`, `pnpm build`.

**Success criteria**: `ComposioClient.executeTool()` throws on `successful: false`. Circuit breaker opens after 3 failures. Direct Slack fallback exists. Tests pass.

---

## Phase 5 — Mem0 Integration

**Goal**: Install Mem0 OSS, build the `MemoryService` wrapper with correct namespacing, verify pgvector availability (from Phase 0), and define the swap-ready abstraction interface.

**CRITICAL**: Use OSS import path `from 'mem0ai/oss'` — NOT `from 'mem0ai'` (that's the cloud version with different API). Collection name MUST be `mem0_memories` (not `memories`) to avoid future Prisma model collision.

**Todos**:

- [ ] Confirm pgvector is available (Phase 0 verified this). If `pgvector/pgvector:pg17` image change was needed, confirm Docker Compose is updated before proceeding.
- [ ] `pnpm add mem0ai`
- [ ] Define `MemoryService` interface in `src/lib/types/memory-service.ts`:
  ```typescript
  export interface MemoryNamespace {
    tenantId: string; // → Mem0 app_id
    archetypeRoleId: string; // → Mem0 agent_id
    userId: string; // → Mem0 user_id (Slack user ID or "system" for cron)
  }
  export interface MemoryService {
    add(messages: Array<{ role: string; content: string }>, ns: MemoryNamespace): Promise<void>;
    search(
      query: string,
      ns: MemoryNamespace,
      limit?: number,
    ): Promise<Array<{ memory: string; score: number }>>;
    deleteAll(ns: Pick<MemoryNamespace, 'tenantId' | 'archetypeRoleId'>): Promise<void>;
  }
  ```
- [ ] Create `src/lib/memory-service.ts` implementing `MemoryService` using Mem0 OSS (see Contracts section for exact API). Named export: `createMemoryService(): MemoryService`.
- [ ] Namespace mapping in impl: `app_id: ns.tenantId`, `agent_id: ns.archetypeRoleId`, `user_id: ns.userId`
- [ ] Collection name: hardcode `"mem0_memories"` — never use default `"memories"`
- [ ] Add periodic audit: on every `search()` call, append a record to `audit_log` table via PostgREST: `{ tenant_id, action: "mem0_search", metadata: { query, result_count, namespace } }`. This provides observability without building a full memory audit UI.
- [ ] Add `MEM0_EMBEDDING_OPENAI_KEY` to `.env.example` (required by Mem0 OSS embedder).
- [ ] Unit tests `src/lib/memory-service.test.ts` — mock `mem0ai/oss`. Test: `add()` → `search()` round-trip (mocked), namespace isolation (tenant A cannot access tenant B's memories because namespace is different), `deleteAll()` requires filters.
- [ ] `pnpm test -- --run`, `pnpm build`.

**Success criteria**: `MemoryService` interface implemented. Namespace isolation verified by tests. `pnpm build` clean.

---

## Phase 6 — Exec Assistant Audit Trail

**Goal**: Decide and implement the audit trail strategy for exec assistant interactions. The exec assistant is NOT a code-generating task — it's a conversational interaction. But at "millions of AI employees" scale, invisible operations are unacceptable.

**Decision (locked)**: Exec assistant creates lightweight `tasks` + `executions` rows for every interaction.

**Todos**:

- [ ] Read `src/gateway/routes/jira.ts` (or wherever `tasks` rows are created for engineering) to understand the creation pattern.
- [ ] Create `src/lib/create-exec-assistant-task.ts` — a helper that creates a `tasks` row with:
  - `status: 'Executing'` (transitions to `Done` on completion)
  - `input_payload: { type: "slack_interaction" | "morning_briefing", ... }`
  - `archetype_id`: FK to the exec assistant archetype row seeded in Phase 1
  - `tenant_id`: from the incoming event
- [ ] Create corresponding `executions` row for cost tracking (LLM calls go through `callLLM()` which already logs cost).
- [ ] Write to `audit_log` for each Composio tool execution: `{ tenant_id, action: "composio_tool_call", metadata: { tool_slug, successful, estimated_latency_ms } }`.
- [ ] Update task status to `Done` at end of exec assistant function.
- [ ] No new DB migrations needed — existing tables are sufficient.
- [ ] `pnpm build`.

**Success criteria**: After an exec assistant interaction, `tasks` table has a new row with `status: Done`. `executions` table has cost data. `audit_log` has Composio call records.

---

## Phase 7 — Event Gateway: Slack Events API

**Goal**: Add `POST /webhooks/slack/events` to the Event Gateway. This route must respond in under 3 seconds (Slack's requirement), HMAC-verify the signature (different algorithm from Jira), handle `url_verification` without HMAC, filter bot messages, deduplicate events, and enqueue to Inngest.

**`SLACK_SIGNING_SECRET` is a different credential from `SLACK_BOT_TOKEN`**. Get it from the Slack app's "Basic Information" page, not the "OAuth & Permissions" page.

**Todos**:

- [ ] Add `SLACK_SIGNING_SECRET` to `.env.example` if not already done in Phase 0.
- [ ] Create `src/gateway/routes/slack-events.ts`:
  - See exact HMAC verification code in Contracts section above — do NOT reuse `verifyJiraSignature()`
  - **Step 1**: Timestamp check — reject if `|now - timestamp| > 300s` (replay attack prevention)
  - **Step 2**: If `body.type === 'url_verification'` — respond `{ challenge: body.challenge }` immediately (NO HMAC check for this type)
  - **Step 3**: HMAC verification for all other event types
  - **Step 4**: Bot message filter — if `body.event?.bot_id` is present OR `body.event?.subtype === 'bot_message'`, respond 200 and return immediately (do NOT enqueue)
  - **Step 5**: Deduplication — check `audit_log` for existing record with `action: 'slack_event_dedup'` and `metadata.event_id === body.event_id`. If found, respond 200 and return. If not found, write dedup record now (before enqueue).
  - **Step 6**: Workspace verification — validate `body.team_id` against a registered tenant (PostgREST lookup on `projects` or wherever tenant→Slack workspace mapping is stored). If not found, log warning and respond 200 (don't leak rejection behavior to Slack).
  - **Step 7**: Respond `{ ok: true }` with HTTP 200 IMMEDIATELY. No async work before this point.
  - **Step 8**: Enqueue to Inngest: `inngest.send({ name: "executive_assistant/slack.message.received", data: { tenantId, teamId: body.team_id, event: body.event, eventId: body.event_id } })`
- [ ] Register route in `src/gateway/server.ts` (alongside existing Jira and GitHub routes)
- [ ] Unit tests `src/gateway/routes/slack-events.test.ts`:
  - Valid signature + message event → 200, enqueued to Inngest
  - Invalid signature → 401
  - Timestamp too old → 400
  - `url_verification` (no signature) → 200 with challenge
  - `bot_message` subtype → 200, NOT enqueued
  - `bot_id` present → 200, NOT enqueued
  - Duplicate `event_id` → 200, NOT enqueued twice
  - Unknown `team_id` → 200 (logged warning)
- [ ] `pnpm test -- --run`, `pnpm build`.

**Slack app configuration checklist** (do outside of code):

- Event subscriptions: `message.channels`, `message.im` (DMs), `message.groups`
- OAuth scopes: `chat:write`, `channels:history`, `im:history`, `groups:history`
- Request URL: `https://<gateway-host>/webhooks/slack/events`
- Add bot to channels that should trigger the exec assistant

**Success criteria**: All unit tests pass. Route registered. Slack sends `url_verification` → responds with challenge. Build clean.

---

## Phase 8a — Executive Assistant Plugin (Triggered, No Memory)

**Goal**: Build the core Inngest lifecycle function for the exec assistant triggered by Slack messages. Implements intent classification → Jira fetch → response composition → Slack reply. Memory integration is Phase 8b.

**CRITICAL structural requirements**:

1. Each external call (Composio tool, LLM call) must be a separate `step.run()` — never chain multiple external calls in one step
2. Bot message guard at function level (belt-and-suspenders with Phase 7's webhook filter)
3. Prompt injection defense: NEVER pass raw Slack message text directly to LLM — extract structured intent first
4. Action allowlist: only call Composio tools listed in `ArchetypeConfig.toolRegistry.composioTools`

**Todos**:

- [ ] Create `src/inngest/executive-assistant-lifecycle.ts`:
  ```typescript
  export const executiveAssistantHandler = inngest.createFunction(
    {
      id: 'executive_assistant/message-handler',
      timeouts: { finish: '5m' },
    },
    { event: 'executive_assistant/slack.message.received' },
    async ({ event, step }) => {
      const { tenantId, event: slackEvent } = event.data;

      // Belt-and-suspenders bot filter (webhook should have caught this already)
      if (slackEvent.bot_id || slackEvent.subtype === 'bot_message') return;

      // Input sanitization: cap at 2000 chars before ANY LLM call
      const userText = (slackEvent.text ?? '').slice(0, 2000);

      // Create audit task row
      const taskId = await step.run('create-task', () =>
        createExecAssistantTask(tenantId, 'slack_interaction', slackEvent),
      );

      // Step: Intent classification — structural extraction, never raw text → LLM
      // Prompt: "Classify the following request into one of: jira_status, jira_summary, general, unknown.
      //          Request: [userText]. Respond with only the category name."
      const intent = await step.run('classify-intent', async () => {
        const result = await callLLM('minimax/minimax-m2.7', intentClassificationPrompt(userText), {
          timeoutMs: 30_000,
        });
        return parseIntent(result); // validates against allowed categories
      });

      // Step: Fetch Jira data (only if intent requires it)
      const jiraData = await step.run('fetch-jira', async () => {
        if (intent === 'general' || intent === 'unknown') return null;
        const composio = createComposioClient(tenantId);
        const result = await composio.executeTool('JIRA_LIST_ISSUES', {
          jql: 'status != Done AND assignee is not EMPTY ORDER BY priority ASC',
          maxResults: 10,
        });
        return result.data;
      });

      // Step: Compose response
      const responseText = await step.run('compose-response', () =>
        callLLM('minimax/minimax-m2.7', responseCompositionPrompt(intent, jiraData, userText), {
          timeoutMs: 30_000,
        }),
      );

      // Step: Post Slack reply (thread reply, not channel post)
      await step.run('post-slack-reply', async () => {
        const composio = createComposioClient(tenantId);
        try {
          await composio.executeTool('SLACK_REPLY_TO_MESSAGE', {
            channel: slackEvent.channel,
            thread_ts: slackEvent.ts, // parent ts — creates thread reply
            text: responseText,
          });
        } catch (e) {
          // Composio circuit open — use direct Slack fallback
          await sendSlackMessageDirect(slackEvent.channel, responseText);
        }
      });

      // Mark task Done
      await step.run('complete-task', () => completeExecAssistantTask(taskId));
    },
  );
  ```
- [ ] `intentClassificationPrompt(userText)`: System prompt explicitly names the role and allowed categories. Do NOT include raw userText verbatim — wrap it: `"The user sent a message. Classify their request. Message summary: [structural extraction of intent keywords from userText]"`
- [ ] `parseIntent(result)`: validates LLM output is one of the allowed category strings — returns `"unknown"` if not recognized
- [ ] Register `executiveAssistantHandler` in `src/gateway/serve.ts` (alongside existing Inngest functions)
- [ ] Unit tests `src/inngest/executive-assistant-lifecycle.test.ts` — mock `@composio/core`, mock `callLLM`:
  - Slack message event → full flow completes, Slack reply posted
  - `bot_message` subtype at function level → no Jira query, no reply
  - Composio `SLACK_REPLY_TO_MESSAGE` fails → direct Slack fallback called
  - Composio circuit open → direct Slack fallback called
  - LLM returns unrecognized intent → falls back to `"unknown"` path
- [ ] `pnpm test -- --run`, `pnpm build`.

**Success criteria**: All unit tests pass. E2E: send "What's the status of my Jira tickets?" in Slack → bot replies in thread within 10s.

---

## Phase 8b — Executive Assistant Plugin (Triggered, With Memory)

**Goal**: Layer Mem0 memory retrieval and storage onto the Phase 8a flow. After this phase, the exec assistant "grows and learns" — it remembers user preferences, past interactions, and business context.

**Todos**:

- [ ] Update `src/inngest/executive-assistant-lifecycle.ts` to add memory steps:
  - Add **Step 0** (BEFORE intent classification): `step.run("retrieve-memory", () => memoryService.search(userText, { tenantId, archetypeRoleId: "executive_assistant", userId: slackEvent.user }))`
  - Inject memory results into intent classification prompt and response composition prompt as context (not as raw text — summarize: "User context: prefers concise updates, works on PROJ project")
  - Add **Step 5** (AFTER Slack reply): `step.run("store-memory", () => memoryService.add([{ role: "user", content: userText }, { role: "assistant", content: responseText }], { tenantId, archetypeRoleId: "executive_assistant", userId: slackEvent.user }))`
- [ ] Memory namespace for this context: `{ tenantId: event.tenantId, archetypeRoleId: "executive_assistant", userId: slackEvent.user }` (Slack user ID)
- [ ] Update unit tests to verify memory `search` called before intent classification, memory `add` called after reply.
- [ ] `pnpm test -- --run`, `pnpm build`.

**Success criteria**: Second interaction with same user includes memory context. Test: two interactions → second has populated context from first.

---

## Phase 9 — Executive Assistant Plugin (Scheduled: Morning Briefing)

**Goal**: Inngest cron function that runs daily at 08:00 UTC, iterates over all tenants with the exec assistant archetype, and posts a morning briefing to each tenant's configured Slack channel.

**Multi-tenant iteration is the core complexity here** — this is not a single-tenant cron.

**Todos**:

- [ ] Create `src/inngest/executive-assistant-briefing.ts`:
  ```typescript
  export const morningBriefing = inngest.createFunction(
    {
      id: 'executive_assistant/morning-briefing',
      timeouts: { finish: '10m' },
    },
    { cron: '0 8 * * *' }, // UTC — document in tenancy guide as v2 will add per-tenant timezone
    async ({ step }) => {
      // Idempotency: skip if already ran today (UTC date)
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const alreadyRan = await step.run('check-idempotency', () => checkBriefingRanToday(today));
      if (alreadyRan) return;
      await step.run('mark-ran', () => markBriefingRanToday(today));

      // Fetch all tenants with executive_assistant archetype enabled
      const tenants = await step.run('fetch-tenants', () =>
        fetchTenantsWithArchetype('executive_assistant'),
      );

      // For each tenant: fetch Jira, retrieve memory, generate briefing, post to Slack
      for (const tenant of tenants) {
        await step.run(`briefing-${tenant.tenantId}`, async () => {
          const composio = createComposioClient(tenant.tenantId);
          const memSvc = createMemoryService();

          const jiraIssues = await composio.executeTool('JIRA_LIST_ISSUES', {
            jql: 'status != Done AND assignee is not EMPTY ORDER BY priority ASC',
            maxResults: 20,
          });

          const memories = await memSvc.search('preferences briefing priorities recent updates', {
            tenantId: tenant.tenantId,
            archetypeRoleId: 'executive_assistant',
            userId: 'system', // channel-level memories, not user-specific
          });

          const briefingText = await callLLM(
            'minimax/minimax-m2.7',
            briefingPrompt(jiraIssues.data, memories),
            { timeoutMs: 30_000 },
          );

          // Post to departments.slack_channel (not a thread — channel post)
          try {
            await composio.executeTool('SLACK_SEND_MESSAGE', {
              channel: tenant.slackChannel,
              text: briefingText,
            });
          } catch {
            await sendSlackMessageDirect(tenant.slackChannel, briefingText);
          }
        });
      }
    },
  );
  ```
- [ ] `checkBriefingRanToday(date)`: query `audit_log` for record with `action: 'morning_briefing_ran'` and `metadata.date === date`
- [ ] `markBriefingRanToday(date)`: write to `audit_log`
- [ ] `fetchTenantsWithArchetype(roleId)`: PostgREST query joining `departments` and `archetypes` tables, returns `{ tenantId, slackChannel }[]`
- [ ] Slack channel source: `departments.slack_channel` field — document this in tenancy guide
- [ ] Timezone: UTC for v1. Document prominently in tenancy guide that v2 adds per-tenant timezone.
- [ ] Register `morningBriefing` in `src/gateway/serve.ts`
- [ ] Unit tests `src/inngest/executive-assistant-briefing.test.ts`:
  - 2 tenants → 2 Slack posts, 2 memory retrievals
  - Already ran today → skip (idempotency)
  - Jira fetch failure → briefing still posted with "Jira data unavailable" note
  - Composio circuit open → direct Slack fallback used
- [ ] `pnpm test -- --run`, `pnpm build`.

**Success criteria**: Manual trigger via Inngest Dev Server (`localhost:8288`) → Slack channel receives briefing within 30s. Idempotency: second trigger same day → no duplicate.

---

## Phase 10 — Testing, Docs, Hardening

**Goal**: Complete test coverage for all new code, update pre-existing broken test, write essential documentation, and run a full security checklist.

**Todos**:

- [ ] **Update `tests/gateway/inngest-serve.test.ts`**: function count has changed (added `executiveAssistantHandler`, `morningBriefing`). Update expected count to match reality. Do not use `=== N` — use `>= N` (already fixed in Phase 1, but verify here).
- [ ] **Mock strategy** for all integration tests: `vi.mock('@composio/core')`, `vi.mock('mem0ai/oss')`. All tests must be runnable without live API credentials.
- [ ] **Verify full test suite**: `pnpm test -- --run`. Target: ≥ 515 passing (existing baseline) + all new tests passing. Pre-existing failures (`container-boot.test.ts`, `inngest-serve.test.ts` old version) must not increase.
- [ ] **Run `pnpm lint` + `pnpm build`**: must both pass clean.
- [ ] **Security checklist** (verify each is implemented, not just planned):
  - [ ] Slack HMAC: different algorithm from Jira, not reusing `verifyJiraSignature()` ✓
  - [ ] Slack replay attack: `|now - timestamp| > 300s` → reject ✓
  - [ ] Prompt injection: raw Slack text never passed directly to LLM ✓
  - [ ] Input length cap: 2000 char limit on incoming Slack text ✓
  - [ ] Action allowlist: only tools in `ArchetypeConfig.toolRegistry.composioTools` called ✓
  - [ ] Bot message filter: both webhook and function level ✓
  - [ ] Composio circuit breaker: open after 3 failures in 60s ✓
  - [ ] Direct Slack fallback: exists and tested ✓
  - [ ] Inngest step timeouts: 30s exec assistant, 10m briefing ✓
  - [ ] Tenant isolation: Composio `user_id` namespaced `${NODE_ENV}:${tenantId}` ✓
  - [ ] Mem0 namespace isolation: app_id=tenantId enforced at all call sites ✓
- [ ] **Create plugin authoring guide**: `docs/$(date "+%Y-%m-%d-%H%M")-plugin-authoring-guide.md` — covers: ArchetypeConfig interface, how to add a new archetype to the registry, tool catalog format, memory namespacing convention, Inngest function registration, Composio tool slugs lookup.
- [ ] **Create tenancy guide**: `docs/$(date "+%Y-%m-%d-%H%M")-tenancy-guide.md` — covers: registering a tenant (admin API), setting up Composio connected accounts per tenant, configuring Slack workspace per tenant, configuring `departments.slack_channel`, MiniMax M2.7 default + how to override for a tenant (v2).
- [ ] **Create architecture update doc**: `docs/$(date "+%Y-%m-%d-%H%M")-multi-employee-architecture.md` — documents: Archetype Registry (Option Y decision and rationale), Composio as integration layer, Mem0 as memory layer, MiniMax M2.7 as default LLM, Slack-as-trigger intentional §8 override, what's deferred to v2.

**Success criteria**: `pnpm test -- --run` passes. `pnpm build` clean. `pnpm lint` clean. Security checklist all ✓. Three new doc files created.

---

## Non-Goals (Hard Guardrails)

Do NOT implement any of the following — they are explicitly deferred:

- Paid Marketing plugin (dept #3, future plan)
- Email integration (Composio makes it trivial when the time comes)
- Engineering Triage agent (M2) or Engineering Review agent (M4)
- Cross-department workflow chaining (vision §5)
- Self-service onboarding UI (separate plan)
- RLS enforcement (v2)
- Per-tenant billing/metering enforcement (v2)
- Zep / temporal knowledge graph memory (v2)
- 3rd-party plugin marketplace (v3+)
- Auto-merge or destructive actions from Exec Assistant
- Hot-reload of archetypes without restart (v2 — `reloadArchetypes()` stub is enough)
- Per-tenant timezone for morning briefing (v2 — document in tenancy guide)
- Dynamic Inngest cron schedules per tenant

---

## Dependency Graph

```
Phase 0 (pre-flight)
    ↓
Phase 1 (foundation + registry)
    ↓
Phase 2 (engineering refactor)   ← E2E must pass before proceeding
    ↓
Phase 3 (LLM gateway)
    ↓
Phase 4 (Composio)
    ↓
Phase 5 (Mem0)
    ↓
Phase 6 (audit trail)
    ↓
Phase 7 (Slack Events API)       ← Gate: Slack app must be configured externally
    ↓
Phase 8a (exec assistant triggered, no memory)
    ↓
Phase 8b (exec assistant triggered, with memory)
    ↓
Phase 9 (morning briefing cron)
    ↓
Phase 10 (testing, docs, hardening)
```

Phases 4 and 5 can be developed in parallel once Phase 3 is complete (both depend on LLM gateway, both are independent of each other). Phases 8a and 9 can be developed in parallel once Phase 7 is complete.

---

## Estimated Scale

- 10 phases (0–10)
- ~60 individual todos
- New files: `src/lib/types/archetype.ts`, `src/lib/types/memory-service.ts`, `src/lib/archetype-registry.ts`, `src/lib/archetypes/engineering.ts`, `src/lib/archetypes/executive-assistant.ts`, `src/lib/composio-client.ts`, `src/lib/memory-service.ts`, `src/lib/create-exec-assistant-task.ts`, `src/gateway/routes/slack-events.ts`, `src/inngest/executive-assistant-lifecycle.ts`, `src/inngest/executive-assistant-briefing.ts`
- Modified files: `src/inngest/lifecycle.ts`, `src/gateway/serve.ts`, `src/lib/call-llm.ts`, `prisma/seed.ts`, `.env.example`, `tests/gateway/inngest-serve.test.ts`
- New test files: ~6 new test files mirroring the new source files
- New doc files: 3

---

_Plan generated from: draft at `.sisyphus/drafts/multi-employee-types.md` + Oracle architecture review (ses_27a64cd6cffe1lPfvu21S2eM3C) + Metis gap analysis (ses_27a645709ffegnYG51gSieeS1z)_
