---
name: inngest
description: 'Use when writing or modifying Inngest functions, step functions, event handlers, or durable workflow logic. Covers the 5 active functions, the lifecycle step-module map, the state machine, NonRetriableError, the InngestStep type, makePostgrestHeaders, mergeTaskMetadata, and idempotency.'
---

# Inngest Durable Workflows — ai-employee

## Active Functions (5)

| Function ID                    | Trigger event                        | File                                    |
| ------------------------------ | ------------------------------------ | --------------------------------------- |
| `employee/universal-lifecycle` | `employee/task.dispatched`           | `src/inngest/employee-lifecycle.ts`     |
| `employee/interaction-handler` | `employee/interaction.received`      | `src/inngest/interaction-handler.ts`    |
| `employee/rule-extractor`      | `employee/rule.extract-requested`    | `src/inngest/rule-extractor.ts`         |
| `employee/rule-synthesizer`    | `employee/rule.synthesize-requested` | `src/inngest/rule-synthesizer.ts`       |
| `trigger/reviewing-watchdog`   | cron `*/15 * * * *`                  | `src/inngest/watchdog.ts` (active cron) |

All functions register in the **gateway process** — not a separate service. They are served via `serve()` from Express.

---

## Lifecycle State Machine

```
Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting
  → Reviewing → Approved → Delivering → Done
```

Terminal states: `Failed`, `Cancelled`

**Approval-required path**: Submitting → Reviewing → Approved → Delivering → Done  
**No-approval path**: Submitting → Delivering → Done (short-circuit — skips Reviewing/Approved)

Key decision points:

- `archetype.risk_model.approval_required` controls which path runs
- `Validating` is auto-pass (no blocking)
- `reviewing-watchdog` marks stuck `Reviewing` tasks `Failed` after 30 minutes (fires every 15 min)

---

## Post-Refactor Architecture — CRITICAL

`employee-lifecycle.ts` is a **thin orchestrator** (84 lines). All lifecycle logic lives in extracted step modules.

**NEVER add lifecycle logic directly to `employee-lifecycle.ts`.** Find the matching step module and add it there.

### Step-Module Map

| Module                                                   | Phase                          | Key exports                                                                                  |
| -------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/inngest/lifecycle/steps/triage-and-ready.ts`        | Triage → Ready                 | `runTriageAndReady()` — loads task/archetype, enriches, posts notify-received Slack message  |
| `src/inngest/lifecycle/steps/execute.ts`                 | Executing                      | `runExecutePhase()` — provisions machine, polls completion, handles timeout/failure          |
| `src/inngest/lifecycle/steps/validate-and-submit.ts`     | Validating → Submitting        | `runValidateAndSubmit()` — dispatches to approval or no-approval path                        |
| `src/inngest/lifecycle/steps/no-approval-path.ts`        | Submitting → Delivering → Done | Direct delivery without human review                                                         |
| `src/inngest/lifecycle/steps/reviewing-path.ts`          | Reviewing → Approved           | Posts approval card, waits for `employee/approval.received`                                  |
| `src/inngest/lifecycle/steps/approval-handler.ts`        | Approved                       | Handles approve/edit actions, dispatches delivery                                            |
| `src/inngest/lifecycle/steps/approval-handler-reject.ts` | Rejected                       | `handleReject()` — extracted from approval-handler                                           |
| `src/inngest/lifecycle/steps/delivery-retry.ts`          | Delivering                     | Retry loop for delivery container                                                            |
| `src/inngest/lifecycle/steps/override-card.ts`           | Admin overrides                | Posts Slack override card for stuck/failed states                                            |
| `src/inngest/lifecycle/steps/notify-and-track.ts`        | Notify                         | Slack message helpers, tenant Slack loading                                                  |
| `src/inngest/lifecycle/steps/lifecycle-helpers.ts`       | Shared                         | `cleanupExecutionMachine`, `safeRecordWorkMetric`, `mergeTaskMetadata`, `writeFeedbackEvent` |
| `src/inngest/lifecycle/lib/machine-provisioner.ts`       | Provisioning                   | `provisionWorkerMachine()` — Fly.io/Docker machine provisioning + env-manifest assembly      |

---

## Required Types and Helpers

### `InngestStep` — ALWAYS use this, never inline `GetStepTools<Inngest>`

```typescript
// CORRECT
import type { InngestStep } from '../events.js';

export async function runSomePhase(ctx: PhaseContext, step: InngestStep) { ... }

// WRONG — do not do this
import type { GetStepTools, Inngest } from 'inngest';
async ({ step }: { step: GetStepTools<Inngest> }) => { ... }
```

`InngestStep` is defined in `src/inngest/events.ts` as:

```typescript
export type InngestStep = GetStepTools<Inngest>;
```

### `makePostgrestHeaders` — ALWAYS use for PostgREST requests

Every PostgREST request from an Inngest function MUST use this. Never construct headers inline.

```typescript
import { makePostgrestHeaders } from '../lib/postgrest-headers.js';

const headers = makePostgrestHeaders(supabaseKey);
// Returns: { apikey, Authorization: 'Bearer ...', 'Content-Type': 'application/json', Prefer: 'return=representation' }

// Override Prefer for writes that don't need the response body:
const writeHeaders = { ...makePostgrestHeaders(supabaseKey), Prefer: 'return=minimal' };
```

### `mergeTaskMetadata` — ALWAYS use for task metadata JSONB updates

Never fetch-then-patch the `metadata` column inline. Use this helper.

```typescript
import { mergeTaskMetadata } from './lifecycle-helpers.js';

await mergeTaskMetadata(supabaseUrl, headers, taskId, {
  notify_slack_ts: ts,
  notify_slack_channel: channelId,
});
// Fetches current metadata, shallow-spreads updates, adds updated_at, PATCHes back.
// Handles metadata: null → {}. Logs warn on failure (non-fatal).
```

---

## Step Conventions

### Naming — kebab-case, descriptive

```typescript
const result = await step.run('load-task-from-db', async () => { ... });
const archetype = await step.run('load-archetype', async () => { ... });
await step.run('patch-status-triaging', async () => { ... });
```

Step IDs are deterministic (hashed by name per function). Use descriptive kebab-case that won't collide within the same function.

### Never nest steps

```typescript
// WRONG
await step.run('outer', async () => {
  await step.run('inner', async () => { ... }); // ❌ nested step — breaks Inngest replay
});

// CORRECT
await step.run('outer', async () => { ... });
await step.run('inner', async () => { ... });
```

### Idempotency — steps must be re-execution-safe

Inngest replays steps on retry. Every `step.run()` callback must be safe to re-run:

- Prefer upserts over inserts (`ON CONFLICT DO UPDATE` / `?on_conflict=...`)
- Check state before acting (e.g. `if (task.status === 'Executing') { ... }`)
- Side effects that aren't idempotent (e.g. Slack posts) should store the `ts` in task metadata so duplicates can be detected

### `NonRetriableError` — for permanent failures

```typescript
import { NonRetriableError } from 'inngest';

// Task not found, archetype misconfigured, etc.
throw new NonRetriableError('Task not found — will not retry');
```

Use `NonRetriableError` when a retry cannot fix the problem. Regular `Error` triggers Inngest's default retry policy.

### `step.waitForEvent` — for blocking on human actions

```typescript
const approvalEvent = await step.waitForEvent('wait-for-approval', {
  event: 'employee/approval.received',
  match: 'data.taskId', // matches event.data.taskId === current taskId
  timeout: `${timeoutHours}h`,
});

if (!approvalEvent) {
  // Timeout — task moves to Failed
}
```

### `step.sleep` — for fixed delays

```typescript
await step.sleep('wait-before-retry', '30s');
```

---

## Structured Logging

All Inngest functions use pino-structured logging. Required fields on every log call:

```typescript
const log = createLogger('employee-lifecycle'); // component field

log.info({ taskId, runId, archetypeId }, 'Lifecycle started');
log.info({ taskId, tenantId, step: 'patch-status-triaging' }, 'Status updated');
log.warn({ taskId, err }, 'Failed to destroy machine');
log.error({ taskId, tenantId }, 'Task failed');
```

| Field       | Required when                                   |
| ----------- | ----------------------------------------------- |
| `component` | Set via `createLogger('name')` — always present |
| `taskId`    | Always                                          |
| `tenantId`  | When available (after triage phase)             |
| `step`      | On status-transition logs                       |
| `runId`     | On lifecycle start/end                          |

---

## Cost Circuit Breaker

`src/lib/call-llm.ts` enforces a daily cost limit. The limit is **NOT hardcoded** — it reads from `platform_settings` at runtime:

```typescript
const costLimitStr = await getPlatformSetting('cost_limit_usd_per_day');
```

Change the limit via the dashboard at `/dashboard/settings` or:

```bash
curl -X PATCH "http://localhost:7700/admin/platform-settings/cost_limit_usd_per_day" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"75"}'
```

When the limit is exceeded, `CostCircuitBreakerError` is thrown and a Slack alert fires to `platform_settings.cost_alert_slack_channel`.

---

## Event Payload Types

```typescript
// src/inngest/events.ts — import from here, never inline
import type { InngestStep } from './events.js';
// Also exports: InteractionReceivedData, TaskRequestedData, TriggerInputReceivedData, RuleSynthesizeRequestedData

// Type a function handler:
async ({ event, step }: { event: EventPayload<{ taskId: string; archetypeId: string }>; step: InngestStep }) => {
  const { taskId, archetypeId } = event.data;
  ...
}
```

---

## Common Mistakes

| Don't                                                  | Do Instead                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Add logic to `employee-lifecycle.ts`                   | Add to the matching step module in `lifecycle/steps/`                         |
| Use `GetStepTools<Inngest>` inline                     | Import `InngestStep` from `../events.js`                                      |
| Construct PostgREST headers inline                     | Use `makePostgrestHeaders(supabaseKey)`                                       |
| Fetch-then-patch `metadata` column inline              | Use `mergeTaskMetadata()` from `lifecycle-helpers.ts`                         |
| Throw `Error` for unrecoverable failures               | Throw `NonRetriableError`                                                     |
| Nest `step.run()` inside another                       | Keep all steps at the top level of the function                               |
| Edit the old engineering lifecycle or redispatch files | Both are deprecated — only touch `employee-lifecycle.ts` and its step modules |

---

## Known Issue: Dev Server Step Output Contamination

**Symptom**: In the Inngest Dev Server UI, step outputs for a run of `employee/universal-lifecycle` may show data from a completely different run. The function executed correctly — only the UI display is wrong.

**Root cause**: Step IDs are computed as `sha1(stepName)` — deterministic across ALL runs. The Dev Server's in-memory SQLite cache does not scope stored outputs by run ID. When a new run completes, its step outputs overwrite the previous run's stored outputs under the same step ID key.

**Impact**: Display only. Does NOT affect production Inngest Cloud (which uses Redis with proper run-scoped keys).

**Workaround**: Restart the Dev Server to clear the cache. Use DB queries and gateway logs as ground truth:

- DB: `docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT id, status, archetype_id FROM tasks WHERE id = '<taskId>'"`
- Gateway logs: `grep '"taskId":"<taskId>"' /tmp/ai-dev.log | grep '"step"'`

**Warning**: Do NOT use `inngest dev --persist` — it makes contamination worse by accumulating stale span data across restarts.
