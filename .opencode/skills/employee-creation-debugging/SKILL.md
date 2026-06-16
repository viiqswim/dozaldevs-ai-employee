---
name: employee-creation-debugging
description: Use when creating a new AI employee via the wizard or seed path, OR when debugging a failed/incomplete creation. Covers the full wizard walkthrough (generate → draft → activate), the archetype_generation_calls trace table, server-driven edit history, brain-preview inspection, and local-vs-production artifact access. Load before any employee creation or creation-side debugging session.
---

# Employee Creation and Creation-Side Debugging

This skill covers the creation path only. For runtime/execution debugging (stuck tasks, failed workers, lifecycle states), load `debugging-lifecycle` instead.

---

## Section 1: Wizard vs Seed — Which Path to Use

**Wizard (primary path)**: Use the dashboard or the generate API when you want the LLM to draft the archetype fields from a plain-English description. The wizard calls the recommendation engine, generates `identity`, `execution_steps`, `delivery_steps`, and `tool_registry`, and lets you review before saving. If the description is ambiguous, the wizard escalates to a clarify-then-act chat flow via `POST /admin/tenants/:tenantId/archetypes/converse-create` — the server returns a clarifying question, the user answers in the same input box, and the conversation continues until the intent is clear. Clear descriptions bypass the chat and generate directly.

**Manual seed (advanced path)**: Use `prisma/seed.ts` when you need a stable UUID, want to version-control the archetype definition, or are setting up a new employee type that requires custom shell tools. Load `creating-archetypes` for the full seed path, schema field reference, and upsert pattern.

**Rule**: The wizard is the primary path for new employees. The seed path is for infrastructure-level setup or when you need idempotent re-seeding across environments.

---

## Section 2: Step-by-Step Wizard Creation (API Flow)

The wizard is three API calls. All require `Authorization: Bearer $SERVICE_TOKEN`.

### Step 1: Generate

```bash
source .env
TENANT_ID="00000000-0000-0000-0000-000000000002"  # DozalDevs example

curl -s -X POST \
  "http://localhost:7700/admin/tenants/$TENANT_ID/archetypes/generate" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description": "A daily motivation bot that posts an uplifting message to the team Slack channel every morning"}' \
  | tee /tmp/generate-response.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('role_name:', d.get('role_name')); print('model:', d.get('model'))"
```

The response includes `role_name`, `model`, `runtime`, `instructions`, `execution_steps`, `delivery_steps`, `tool_registry`, and `risk_model`. Save the full response — you need it for Step 2.

### Step 2: Save as Draft

The create endpoint requires `instructions` (not just `execution_steps`). Include both from the generate response. Also include `model` and `runtime: 'opencode'`.

```bash
# Extract fields from the generate response
ROLE_NAME=$(python3 -c "import json; d=json.load(open('/tmp/generate-response.json')); print(d['role_name'])")
MODEL=$(python3 -c "import json; d=json.load(open('/tmp/generate-response.json')); print(d['model'])")

curl -s -X POST \
  "http://localhost:7700/admin/tenants/$TENANT_ID/archetypes" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "
import json, sys
d = json.load(open('/tmp/generate-response.json'))
payload = {
  'role_name': d['role_name'],
  'model': d['model'],
  'runtime': 'opencode',
  'instructions': d.get('instructions') or d.get('execution_steps', ''),
  'execution_steps': d.get('execution_steps', ''),
  'delivery_steps': d.get('delivery_steps', ''),
  'tool_registry': d.get('tool_registry', {}),
  'risk_model': d.get('risk_model', {'approval_required': False, 'timeout_hours': 2}),
  'status': 'draft'
}
print(json.dumps(payload))
")" | tee /tmp/create-response.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('archetype_id:', d.get('id')); print('status:', d.get('status'))"
```

**Critical**: If you omit `instructions`, the create endpoint returns `INVALID_REQUEST` with `{"path":["instructions"],"message":"Invalid input: expected string, received undefined"}`. The generate response has both `instructions` and `execution_steps` — include both.

### Step 3: Activate

```bash
ARCHETYPE_ID=$(python3 -c "import json; d=json.load(open('/tmp/create-response.json')); print(d['id'])")

curl -s -X PATCH \
  "http://localhost:7700/admin/tenants/$TENANT_ID/archetypes/$ARCHETYPE_ID" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('status:', d.get('status'))"
```

After activation, the archetype is live and can be triggered. The PATCH also writes a `kind:'edit'` row to `archetype_edit_history` automatically.

---

## Section 2b: Clarify-Then-Act Creation Flow (converse-create)

When the wizard description is ambiguous, the dashboard uses `POST /admin/tenants/:tenantId/archetypes/converse-create` instead of the direct generate path.

**How it works:**

- The endpoint accepts `{ transcript: ConverseMessage[] }` — the same request-stateless transcript design as `propose-edit` for editing.
- The discriminated result contract is identical: `{ kind: 'question', question }` | `{ kind: 'proposal', baseline, proposal, changed_fields }` | `{ kind: 'no_change' }` | `{ kind: 'too_long' }`.
- The route calls `ArchetypeGenerator.converse()` with an empty baseline (`buildEmptyBaseline()`) — no existing archetype. The proposal IS the new employee.
- The create allowlist (`applyCreateAllowlist()`) is wider than the edit allowlist: it includes `role_name`, `model`, and `runtime`, which the UI needs when calling `POST /archetypes` to persist the draft.
- A server-side backstop activates after 5 assistant turns: `converse()` never returns `kind:'question'` again. It returns `proposal` (if the LLM cooperates) or `no_change` (if the LLM disobeys the backstop directive).

**Dashboard behavior:**

- Single text box entry is preserved. Chat UI appears only when the server returns `kind:'question'`.
- On a `proposal` result, the wizard advances to the "Review & Edit" step automatically.
- `kind:'too_long'` renders a friendly "conversation too long" chat bubble — it does NOT reach the error step.

**Debugging a failed converse-create proposal:**

The most common failure mode is `PROPOSAL_INVALID` (HTTP 422) from `validateProposalFields`. Check:

1. **Tool paths** — `postProcess()` normalizes bare `service/tool` → `/tools/service/tool.ts` and strips `tsx ` prefix. If a tool path still fails, the LLM emitted an unrecognized shape.
2. **trigger_sources** — `postProcess()` normalizes `type:'cron'` → `type:'scheduled'` and fills missing `cron` fields. If trigger_sources still fails, the LLM emitted an unknown type.
3. **risk_model.timeout_hours** — `applyCreateAllowlist()` passes `timeout_hours` through. If missing, the `POST /archetypes` save will 400.

The `archetype_generation_calls` trace row for a converse-create call has `call_type='propose_edit'` and `archetype_id=null` (no archetype exists yet). Note: the trace records `status='success'` when the LLM call succeeds, even if `validateProposalFields` later rejects the proposal — the trace does not reflect validation failures.

---

## Section 3: Creation-Time Observability Reference

### `archetype_generation_calls` Table

Every LLM call made during archetype creation is persisted here. One row per call.

| Column               | Type     | Description                                                                                              |
| -------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `id`                 | UUID     | Row identifier                                                                                           |
| `tenant_id`          | UUID     | Tenant that initiated the call                                                                           |
| `archetype_id`       | UUID?    | Nullable. Null during generation (archetype doesn't exist yet). Linked after save via `linkArchetype()`. |
| `call_type`          | String   | `'generate'` `'refine'` `'recommend_model'` `'time_estimate'` `'propose_edit'`                           |
| `model_requested`    | String?  | Model the platform asked for                                                                             |
| `model_actual`       | String?  | Model the provider actually used (may differ from requested)                                             |
| `prompt`             | Text?    | Full prompt sent to the LLM, capped at 256KB                                                             |
| `response`           | Text?    | Full LLM response, capped at 256KB                                                                       |
| `prompt_truncated`   | Boolean  | True when the prompt exceeded 256KB and was cut                                                          |
| `response_truncated` | Boolean  | True when the response exceeded 256KB and was cut                                                        |
| `prompt_tokens`      | Int?     | Token count from the provider response                                                                   |
| `completion_tokens`  | Int?     | Completion token count                                                                                   |
| `estimated_cost_usd` | Decimal? | Estimated cost in USD                                                                                    |
| `latency_ms`         | Int?     | Wall-clock time for the LLM call                                                                         |
| `retry_count`        | Int      | How many LLM retries occurred (0 = first attempt succeeded)                                              |
| `status`             | String   | `'success'` or `'failed'`                                                                                |
| `error_message`      | Text?    | Set on failure rows; null on success                                                                     |
| `created_by`         | UUID?    | User ID of the caller. Null when called via SERVICE_TOKEN (no user identity).                            |
| `created_at`         | DateTime | When the call was made                                                                                   |

**Key facts:**

- `model_actual` captures the gateway LLM model (e.g., `deepseek-v4-flash`), not the execution model chosen for the archetype (e.g., `minimax/minimax-m2.7`). These are different things.
- `archetype_id` is always null for `call_type='generate'` rows because the archetype doesn't exist yet at generation time.
- `time_estimate` failures are non-blocking. The archetype is still created successfully even if the time estimate call fails.

### `archetypes.created_by`

The `created_by` column on the `archetypes` table records who created the archetype. It is null when the create call was made via SERVICE_TOKEN (no authenticated user).

### `archetype_edit_history` (Server-Driven)

The server writes all history rows automatically. You never need to call the history endpoint manually.

| Event                              | `kind` value | When written                                                                     |
| ---------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| Archetype created via POST         | `'create'`   | At `POST /admin/tenants/:tenantId/archetypes` time                               |
| Any PATCH (including draft→active) | `'edit'`     | At every `PATCH /admin/tenants/:tenantId/archetypes/:id`                         |
| Revert to prior state              | `'revert'`   | At `POST /admin/tenants/:tenantId/archetypes/:id/edit-history/:historyId/revert` |

### Verification Queries

```sql
-- All generation calls for a tenant in the last 10 minutes
SELECT call_type, status, model_actual, prompt_tokens, latency_ms, created_at
FROM archetype_generation_calls
WHERE tenant_id = '<tenant_id>'
  AND created_at > now() - interval '10 minutes'
ORDER BY created_at DESC;

-- Edit history for a specific archetype (creation + all edits)
SELECT kind, changed_fields, created_at
FROM archetype_edit_history
WHERE archetype_id = '<archetype_id>'
ORDER BY created_at;

-- Check who created an archetype and its current status
SELECT id, role_name, status, created_by
FROM archetypes
WHERE id = '<archetype_id>';
```

Connect locally: `psql postgresql://postgres:postgres@localhost:54322/ai_employee`

---

## Section 4: Debugging a Bad or Failed Generation

### Find Failed Rows

```sql
SELECT call_type, status, model_requested, model_actual, error_message, prompt_tokens, latency_ms
FROM archetype_generation_calls
WHERE tenant_id = '<tenant_id>'
  AND status = 'failed'
ORDER BY created_at DESC
LIMIT 5;
```

### What Failed Rows Look Like

- `status = 'failed'`
- `error_message` is set (e.g., `'LLM returned empty content'`)
- `archetype_id` is null (generation failed before the archetype was saved)
- `model_actual` may be null if the LLM call threw before returning a response

### Retry Visibility

`retry_count` shows how many LLM retries occurred before the final result. A value of `0` means the first attempt succeeded (or failed without retry). A value of `1` means one retry was attempted.

### If No Rows Appear

If you expect rows but the table is empty, check that `ArchetypeGenerationCallRepository` is wired into the generate route. Look at `src/gateway/routes/admin-archetype-generate.ts` — the route factory should instantiate `new ArchetypeGenerationCallRepository(prisma)` and pass it to the `ArchetypeGenerator` constructor.

### Inspect the Full Prompt/Response

```sql
-- Read the full prompt for a specific call (may be truncated at 256KB)
SELECT prompt, prompt_truncated, response, response_truncated
FROM archetype_generation_calls
WHERE id = '<call_id>';
```

If `prompt_truncated = true`, the stored prompt was cut at 256KB. The actual prompt sent to the LLM was longer.

---

## Section 5: The Compiled AGENTS.md Bridge Artifact

When a worker runs, the harness compiles a per-task AGENTS.md from the archetype fields (`identity`, `execution_steps`, `delivery_steps`), learned rules, knowledge base entries, and the platform base config. You can inspect this compiled output without triggering a task.

### Brain-Preview (Compiled AGENTS.md)

```bash
source .env
TENANT_ID="00000000-0000-0000-0000-000000000002"
ARCHETYPE_ID="a360b2e6-7dcc-410d-a17b-8d51e21c74ed"

# Full compiled AGENTS.md
curl -s "http://localhost:7700/admin/tenants/$TENANT_ID/archetypes/$ARCHETYPE_ID/brain-preview" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('compiled_agents_md','')[:500])"

# Check length and first line
curl -s "http://localhost:7700/admin/tenants/$TENANT_ID/archetypes/$ARCHETYPE_ID/brain-preview" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); md=d.get('compiled_agents_md',''); print('length:', len(md)); print('first line:', md.split(chr(10))[0])"
```

A healthy brain-preview returns HTTP 200 with `compiled_agents_md` starting with the employee's identity (e.g., `"You are MotivateBot, the Team Morale Specialist at DozalDevs..."`). Length of ~2000–5000 chars is normal for a simple employee.

### Compile-Preview (Archetype Prompt)

```bash
curl -s "http://localhost:7700/admin/tenants/$TENANT_ID/archetypes/$ARCHETYPE_ID/compile-preview" \
  -H "Authorization: Bearer $SERVICE_TOKEN"
```

### What Gets Compiled

The compiler (`src/workers/lib/agents-md-compiler.mts`) assembles:

- Archetype `identity` and `execution_steps`
- Archetype `delivery_steps` (if set)
- Learned rules from `employee_rules` for this archetype
- Knowledge base entries from `knowledge_base_entries`
- Platform base config from `src/workers/config/agents.md`
- Connected integrations section (Hostfully, Slack, GitHub, Sifely — when tenant secrets are present)

---

## Section 6: Local vs Production Artifact Access

| Artifact                              | Local command                                                                                                                                          | Production command                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archetype_generation_calls` rows     | `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT ..."`                                                                      | Cloud DB session pooler port 5432 — see `production-ops` skill for exact URL                                                                            |
| `archetype_edit_history` rows         | same psql                                                                                                                                              | same — see `production-ops`                                                                                                                             |
| `archetypes.created_by`               | same psql                                                                                                                                              | same — see `production-ops`                                                                                                                             |
| PostgREST query (table visible check) | `curl http://localhost:54331/rest/v1/archetype_generation_calls?limit=5 -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"` | Cloud PostgREST URL — see `production-ops`                                                                                                              |
| Brain-preview                         | `curl http://localhost:7700/admin/tenants/$TENANT_ID/archetypes/$ARCHETYPE_ID/brain-preview -H "Authorization: Bearer $SERVICE_TOKEN"`                 | `curl https://ai-employees-laaa.onrender.com/admin/tenants/$TENANT_ID/archetypes/$ARCHETYPE_ID/brain-preview -H "Authorization: Bearer $SERVICE_TOKEN"` |
| Gateway logs                          | `tail -f /tmp/ai-dev.log`                                                                                                                              | Render dashboard → Logs — see `production-ops`                                                                                                          |

**PostgREST schema cache**: After any migration that adds a new table, reload the cache before querying via PostgREST:

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
```

Without this, PostgREST returns `"Could not find the table in the schema cache"` even though the table exists in PostgreSQL.

For all production connection strings, log-fetch mechanics, Render service details, and Cloud DB quirks, load the `production-ops` skill.

---

## Section 7: converse-create / propose-edit Internals

Both endpoints share the same underlying `ArchetypeGenerator.converse()` method and the same request-stateless transcript design. The client holds the full transcript; the server stores nothing between requests.

### Discriminated Result Contract (both endpoints)

```typescript
{ kind: 'question', question: string }       // server needs more info
{ kind: 'proposal', baseline, proposal, changed_fields, ... }  // ready to save
{ kind: 'no_change' }                        // nothing to change
{ kind: 'too_long' }                         // conversation exceeded token budget
```

### converse-create (creation path)

- Endpoint: `POST /admin/tenants/:tenantId/archetypes/converse-create`
- Uses an empty baseline (`buildEmptyBaseline()`) — no existing archetype.
- The create allowlist (`applyCreateAllowlist()`) is wider than the edit allowlist: includes `role_name`, `model`, and `runtime` — fields the UI needs when calling `POST /archetypes` to persist the draft.
- On a `proposal` result, the wizard advances to the "Review & Edit" step automatically.
- `kind:'too_long'` renders a friendly chat bubble — it does NOT reach the error step.

### propose-edit (edit path)

- Endpoint: `POST /admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit`
- Accepts `{ transcript: ConverseMessage[] }` — the full conversation history.
- The edit allowlist is narrower: `role_name` is forbidden (the model cannot change it on an existing archetype).
- A server-side backstop forces a best-guess proposal if the model asks more than 5 clarifying questions — `converse()` never returns `kind:'question'` after 5 assistant turns.
- A token-budget guard returns `kind:'too_long'` for very long conversations.

### Shared safeguards

- **Tool-path never-block policy**: `validateProposalFields()` in `src/gateway/lib/archetype-edit-helpers.ts` never throws on unknown tool paths or invalid trigger sources. Unknown tools are dropped (logged as warn); invalid trigger sources are coerced to `{ type: 'manual' }` (logged). The only guard that returns `{ ok: false, reAsk: true }` is prose-went-blank on EDIT (a field that had content is now empty).
- **`reAsk: true` → `kind:'question'`**: Both routes convert `reAsk:true` from `validateProposalFields` into `{ kind: 'question' }` (HTTP 200) — never a 422.
- **Shared helpers**: `mapArchetypeRowToConfig`, `validateProposalFields`, and `resolveToolPaths` live in `src/gateway/lib/archetype-edit-helpers.ts`. Import from there; do not inline or duplicate in route handlers.

### Debugging a failed proposal

1. Check `archetype_generation_calls` for the call — `call_type='propose_edit'`, `archetype_id=null` for converse-create.
2. `status='success'` in the trace means the LLM call succeeded, even if `validateProposalFields` later rejected the proposal. The trace does not reflect validation failures.
3. HTTP 422 `PROPOSAL_INVALID` from the route means `validateProposalFields` returned `ok:false` without `reAsk:true` — this should not happen under the never-block policy. If it does, check `archetype-edit-helpers.ts` for a regression.

---

## Section 8: Cross-References

| Skill                     | When to load it                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `creating-archetypes`     | Full seed path, archetype schema fields, model recommendation engine, trigger setup         |
| `debugging-lifecycle`     | Runtime/execution debugging: stuck tasks, failed workers, lifecycle state transitions       |
| `feature-verification`    | PostgREST-vs-psql distinction, zero-rows-is-failure rule, end-to-end verification checklist |
| `production-ops`          | Production connection strings, Render logs, Cloud DB access, deploy-status checks           |
| `data-access-conventions` | Repository pattern, PostgREST vs Prisma boundary, `makePostgrestHeaders`                    |
