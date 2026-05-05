# Local E2E Testing Guide

> How to run a complete end-to-end test of any employee — webhook through approval through delivery — without touching real external APIs.

## Overview

"Local E2E testing" means running the full employee lifecycle on your machine with no real external service calls. The goal: verify that a webhook triggers a task, the working phase runs correctly, the approval card appears in Slack, and the delivery phase completes — all without Hostfully credentials, without sending real messages to guests, and without any live API keys beyond what's already in your local `.env`.

What stays real:

- **Slack** — Socket Mode connects directly to your local gateway. Approval cards appear in your real Slack workspace.
- **Inngest** — local dev server at `localhost:8288` handles all orchestration.
- **Supabase/PostgreSQL** — local Docker Compose. All task state is real.
- **OpenRouter/LLM** — OpenCode sessions use your real `OPENROUTER_API_KEY`. The model runs for real.

What gets mocked:

- Any external service with a `{SERVICE}_MOCK=true` env var (see Section 2).

The result: a fully observable, repeatable test that exercises every code path without side effects.

---

## The `{SERVICE}_MOCK=true` Convention

### Naming

Mock env vars follow the pattern `{SERVICE}_MOCK=true`, where `{SERVICE}` is the uppercase service name. Examples:

- `HOSTFULLY_MOCK=true`
- `SLACK_MOCK=true` (not yet implemented)
- `SIFELY_MOCK=true` (not yet implemented)

### How to enable

Set the var in your `.env` file:

```bash
HOSTFULLY_MOCK=true
```

The gateway process reads `.env` on startup. When it spawns a worker machine, `tenant-env-loader.ts` propagates whitelisted vars (including mock flags) into the container environment. The tool running inside the container sees `HOSTFULLY_MOCK=true` and returns fixture data instead of calling the real API.

### What happens inside the tool

Each mock-enabled tool checks its service mock var at the very top of `main()`, before any argument validation or env var checks. When the flag is set, the tool reads a fixture file from disk and writes it to stdout, then returns early. No network call is made.

Canonical pattern (from `src/worker-tools/hostfully/get-reservations.ts`):

```typescript
// HOSTFULLY_MOCK: return fixture data instead of calling the real API.
// Set HOSTFULLY_MOCK=true in .env for local E2E testing without real Hostfully credentials.
if (process.env['HOSTFULLY_MOCK'] === 'true') {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(__dirname, 'fixtures', 'get-reservations', 'default.json');
  const fixtureData = readFileSync(fixturePath, 'utf8');
  process.stdout.write(fixtureData.trimEnd() + '\n');
  return;
}
```

When `HOSTFULLY_MOCK` is not set (or is `false`), the tool proceeds normally and calls the real API.

---

## Fixture File Structure

### Location

```
src/worker-tools/{service}/fixtures/{tool-name}/default.json
```

Examples:

```
src/worker-tools/hostfully/fixtures/get-messages/default.json
src/worker-tools/hostfully/fixtures/get-reservations/default.json
src/worker-tools/hostfully/fixtures/get-property/default.json
src/worker-tools/hostfully/fixtures/send-message/default.json
```

### Content

The fixture must be valid JSON that exactly matches the shape the tool would return from the live API. The model parses stdout as structured data — if the shape is wrong, the model will fail or produce incorrect output.

Example `send-message` fixture:

```json
{ "sent": true, "messageId": "mock-message-id-001", "timestamp": "2026-05-01T14:00:00Z" }
```

### Per-argument variants (optional)

Some tools support argument-specific fixtures. For example, `get-messages` can look for `fixtures/get-messages/{leadId}.json` before falling back to `default.json`. This lets you test different scenarios (e.g., a lead with no messages vs. one with pending messages) without changing the default.

When in doubt, `default.json` is sufficient for most E2E tests.

---

## Env Propagation Path

Mock vars are not secrets — they don't live in `tenant_secrets`. They must be explicitly whitelisted so they reach the worker container.

### The path

```
.env
  → gateway process (reads on startup)
    → tenant-env-loader.ts (PLATFORM_ENV_WHITELIST)
      → machine env (worker container)
        → tool process (reads process.env)
```

### PLATFORM_ENV_WHITELIST

From `src/gateway/services/tenant-env-loader.ts`:

```typescript
const PLATFORM_ENV_WHITELIST = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'INNGEST_BASE_URL',
  'OPENROUTER_API_KEY',
  'NODE_ENV',
  'LOG_LEVEL',
  'AGENT_VERSION_ID',
  'HOSTFULLY_MOCK',
];
```

Any var in this list that is set in the gateway's environment gets injected into the worker machine env. Vars not in this list are silently dropped.

### Delivery machines

The delivery phase spawns a separate container. The lifecycle explicitly passes mock vars to the delivery container env (because delivery uses `tenantEnvForApproval`, not `loadTenantEnv`). If you add a new mock var, make sure it's also passed in the delivery machine env block in `src/inngest/employee-lifecycle.ts`.

---

## What's Always Real (Not Mocked)

These services run locally and cannot be mocked out:

| Service                 | Why it's always real                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Slack**               | Socket Mode — your local gateway holds a live WebSocket to Slack. Approval cards appear in your real workspace. |
| **Inngest**             | Local dev server at `localhost:8288`. All orchestration, retries, and step functions run for real.              |
| **Supabase/PostgreSQL** | Local Docker Compose. Task state, tenant config, and secrets are all real DB rows.                              |
| **OpenRouter/LLM**      | OpenCode sessions require a real `OPENROUTER_API_KEY`. The model reads your instructions and calls tools.       |

Do not attempt to mock these. The value of local E2E testing comes from exercising the real orchestration and approval flow — only the external service calls (Hostfully, etc.) are replaced with fixtures.

---

## Running a Full Local E2E Test

### Prerequisites

1. Services running: `pnpm dev:start` (gateway on `:7700`, Inngest on `:8288`)
2. Docker image rebuilt with latest worker code: `docker build -t ai-employee-worker:latest .`
3. `.env` configured with mock flags: `HOSTFULLY_MOCK=true`
4. Tenant secrets provisioned (Slack OAuth complete for the target tenant)

### Step 1: Trigger via webhook

For the VLRE guest-messaging employee:

```bash
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-msg-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }'
```

The `message_uid` must be unique per request (it's the dedup key). Change it for each test run.

The response includes a `task_id`. Save it.

### Step 2: Monitor task status

```bash
TASK_ID=<your-task-id>
TENANT=00000000-0000-0000-0000-000000000003

curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT/tasks/$TASK_ID" \
  | jq '.status'
```

Poll every 10-15 seconds. Expected progression: `Received → Ready → Executing → Submitting → Reviewing`.

The working phase takes roughly 1-2 minutes (OpenCode session + tool calls).

### Step 3: Approve via Slack or manual event

**Slack**: Click the Approve button on the card that appears in your configured channel.

**Manual fallback** (if the button doesn't work):

```bash
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"approve\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\"}}"
```

### Step 4: Verify delivery

After approval, the task transitions: `Reviewing → Approved → Delivering → Done`.

The delivery phase spawns a second container. With `HOSTFULLY_MOCK=true`, the `send-message` tool returns the mock fixture instead of calling Hostfully. The task completes as `Done`.

Final check:

```bash
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/$TENANT/tasks/$TASK_ID" \
  | jq '{status, status_transitions: .status_transitions[-3:]}'
```

Expected: `status: "Done"` with transitions through `Delivering` and `Done`.

---

## Adding Mock Support to a New Shell Tool

When you add a new shell tool that calls an external API, follow these steps to give it mock support.

### 1. Add the mock var to PLATFORM_ENV_WHITELIST

In `src/gateway/services/tenant-env-loader.ts`, add `'{SERVICE}_MOCK'` to the whitelist array:

```typescript
const PLATFORM_ENV_WHITELIST = [
  // ... existing entries ...
  'HOSTFULLY_MOCK',
  'YOUR_SERVICE_MOCK', // add this
];
```

### 2. Add the mock check to the tool's `main()`

Copy the pattern from any existing Hostfully tool. Place it at the top of `main()`, before argument validation:

```typescript
if (process.env['YOUR_SERVICE_MOCK'] === 'true') {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fixturePath = join(__dirname, 'fixtures', 'your-tool-name', 'default.json');
  const fixtureData = readFileSync(fixturePath, 'utf8');
  process.stdout.write(fixtureData.trimEnd() + '\n');
  return;
}
```

### 3. Create the fixture file

```bash
mkdir -p src/worker-tools/{service}/fixtures/{tool-name}
# Write a JSON file matching the tool's real output shape
```

### 4. Pass the mock var to delivery machines

If the lifecycle spawns a delivery machine explicitly (check `src/inngest/employee-lifecycle.ts`), make sure the mock var is included in the delivery container's env block. The working phase and delivery phase are separate containers — each needs the var independently.

### 5. Rebuild and test

```bash
docker build -t ai-employee-worker:latest .
YOUR_SERVICE_MOCK=true tsx src/worker-tools/{service}/{tool-name}.ts --required-arg val
```

The second command should print fixture JSON and exit 0 without any network calls.

Full checklist: [docs/2026-05-04-1645-adding-a-shell-tool.md](./2026-05-04-1645-adding-a-shell-tool.md)

---

## Currently Mock-Enabled Tools

All four tools share the same `HOSTFULLY_MOCK=true` flag:

| Tool                                             | Mock var              | Fixture path                             |
| ------------------------------------------------ | --------------------- | ---------------------------------------- |
| `src/worker-tools/hostfully/get-messages.ts`     | `HOSTFULLY_MOCK=true` | `fixtures/get-messages/default.json`     |
| `src/worker-tools/hostfully/get-reservations.ts` | `HOSTFULLY_MOCK=true` | `fixtures/get-reservations/default.json` |
| `src/worker-tools/hostfully/get-property.ts`     | `HOSTFULLY_MOCK=true` | `fixtures/get-property/default.json`     |
| `src/worker-tools/hostfully/send-message.ts`     | `HOSTFULLY_MOCK=true` | `fixtures/send-message/default.json`     |

Setting `HOSTFULLY_MOCK=true` in `.env` enables mock mode for all four simultaneously. There's no per-tool granularity within the same service — the flag covers the whole service.

### Scenario-specific test docs

For step-by-step test scenarios targeting the guest-messaging employee specifically, see [docs/testing/guest-messaging/](./testing/guest-messaging/). Those docs cover specific scenarios (no unresponded messages, approval flow, rejection flow, etc.) and reference the fixture files above.
