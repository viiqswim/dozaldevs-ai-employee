# Learnings — no-approval-delivery

## 2026-05-26 Task: Wave 1 (T1-T4)

### Wave 1 Status: COMPLETE (committed 4f87430)

### seed.ts patterns

- Both `create` and `update` blocks must be updated for upsert archetypes
- `delivery_instructions` field is a plain string (not JSON)
- `code-rotation` and `jira-motivation-bot` now have delivery_instructions set
- Instructions no longer contain direct `tsx /tools/slack/post-message.ts` calls
- Both archetypes end with `tsx /tools/platform/submit-output.ts --classification "NO_ACTION_NEEDED"`

### SQL script patterns

- Dollar-quoting `$$...$$` used for multi-line strings
- `WHERE id = '...' AND deleted_at IS NULL` for idempotency
- Wrapped in `BEGIN; ... COMMIT;`
- Verification queries at end of script

### Archetype IDs (non-seeded)

- `real-estate-motivation-bot-2`: `561439b9-7491-40de-a550-95906624fffc`
- `daily-real-estate-inspiration-2`: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
- `schedule-generator-thornton`: `00000000-0000-0000-0000-000000000017`
- `qa-time-est-test` (soft-deleted): `b77c5176-8a33-46f3-a3ff-f1526addd286`

### delivery_instructions canonical pattern

```
Post the [content type] to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.
```

## 2026-05-26 Task: T5 — Lifecycle code analysis

### Current no-approval path (lines 814-938)

- `if (!approvalRequired)` block starts at line 814
- `step.run('complete', ...)` at line 816 — does Done transition + notify update + approval card cleanup
- `step.run('record-work-metric-no-approval', ...)` at line 916
- `step.run('cleanup-no-approval', ...)` at line 923 — destroys execution machine
- `return;` at line 938

### Classification check (lines 942-966) — approval path only

- `step.run('check-classification', ...)` — reads deliverable, calls `parseClassifyResponse`
- Returns `{ skipApproval, reasoning, displayContext }`
- Retries 3x with 1s delay if no deliverable found yet

### NO_ACTION_NEEDED handling (lines 968-1136) — approval path only

- `step.run('cleanup-no-action', ...)` — destroys execution machine
- `step.run('post-override-card', ...)` — posts override card + no-action thread reply
- `step.waitForEvent('wait-for-override', ...)` — waits for PM override
- Handles timeout and override cases

### delivery_instructions fetch pattern (lines 1887-1934)

```typescript
const archetypeRes = await fetch(
  `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=archetypes(delivery_instructions)`,
  { headers },
);
const archetypeRows = (await archetypeRes.json()) as Array<{
  archetypes?: { delivery_instructions?: string | null };
}>;
const deliveryInstructions = archetypeRows[0]?.archetypes?.delivery_instructions;
if (!deliveryInstructions) {
  /* mark Failed */ return;
}
```

### Delivery container env (lines 2026-2076)

- Uses `tenantEnvForApproval` (no-approval path needs its own `tenantEnvForDelivery`)
- Container name: `employee-delivery-${taskId.slice(0, 8)}`
- Key env vars: TASK_ID, EMPLOYEE_PHASE='delivery', EMPLOYEE_ROLE_NAME, APPROVAL_REQUIRED, NOTIFY_MSG_TS, SUPABASE_URL (with host.docker.internal replacement), SUPABASE_SECRET_KEY, INNGEST_BASE_URL, INNGEST_EVENT_KEY, INNGEST_DEV
- Fly mode: uses `effectiveSupabaseUrlForDelivery` (from getTunnelUrl())

### Delivery polling (lines 2082-2157)

- maxDeliveryPolls = 20, deliveryIntervalMs = 15_000 (5 min total)
- Polls task status for 'Done' or 'Failed'
- 3 attempts total (attempt 0, 1, 2)
- On retry: reset status to 'Delivering', destroy old container, spawn new one
- On final failure: mark Failed, update Slack messages

### tenantEnv loading pattern

```typescript
const prismaForDelivery = new PrismaClient();
const tenantEnvForDelivery = await loadTenantEnv(
  tenantId,
  {
    tenantRepo: new TenantRepository(prismaForDelivery),
    secretRepo: new TenantSecretRepository(prismaForDelivery),
  },
  (archetype.notification_channel as string | null) ?? null,
);
await prismaForDelivery.$disconnect();
```

### CRITICAL: Machine cleanup order

- Current code: complete → record-metric → cleanup-no-approval (WRONG ORDER)
- Required: cleanup execution machine FIRST, then spawn delivery container
- Docker name conflict: `employee-${taskId.slice(0,8)}` (execution) vs `employee-delivery-${taskId.slice(0,8)}` (delivery) — different names, so no conflict
- BUT: still best practice to destroy execution machine before delivery starts

### Step naming (must be unique across entire function)

- Existing no-approval steps: 'complete', 'record-work-metric-no-approval', 'cleanup-no-approval'
- New steps to add: 'check-classification-no-approval', 'cleanup-execution-machine-no-approval', 'delivering-no-approval', 'complete-after-delivery-no-approval', 'record-work-metric-after-delivery'
- DO NOT reuse step names from approval path

### Imports already available

- `parseClassifyResponse` — already imported
- `runLocalDockerContainer`, `stopLocalDockerContainer` — already imported
- `createMachine`, `destroyMachine` — already imported
- `getTunnelUrl` — already imported
- `PrismaClient`, `TenantRepository`, `TenantSecretRepository`, `loadTenantEnv` — already imported
- `recordWorkMetric`, `clearPendingApprovalByTaskId` — already imported
- `notifyBlocks`, `notifyStateBlocks`, `buildNoActionThreadBlocks`, `buildOverrideCardBlocks` — already imported
- `createSlackClient` — already imported

## Task 6: DB Backup + Seed + SQL Migration (2026-05-26)

### Key Finding: jira-ticket-motivator vs jira-motivation-bot
- The seed upserts `jira-motivation-bot` by ID `00000000-0000-0000-0000-000000000018` — but this row was already soft-deleted in the DB
- The active archetype is `jira-ticket-motivator` (ID `db2168e3-9d5c-4875-bf50-fcafeab9bcc6`) — a different row not covered by seed or SQL script
- Had to manually UPDATE `jira-ticket-motivator` to add `delivery_instructions`
- Always check active archetypes (WHERE deleted_at IS NULL) after seed runs — seed may upsert soft-deleted rows

### Backup Location
- `database-backups/2026-05-26-0024/` — full-dump.sql (14485 lines) + archetypes.sql

### SQL Script Result
- `real-estate-motivation-bot-2`: delivery_instructions added ✅
- `daily-real-estate-inspiration-2`: delivery_instructions added ✅
- `schedule-generator-thornton`: delivery_instructions added ✅
- `qa-time-est-test`: soft-deleted ✅
- `jira-ticket-motivator`: manually patched (not in SQL script) ✅

### Final State
- All 7 active archetypes have non-empty delivery_instructions ✅
- qa-time-est-test is soft-deleted ✅
- 0 no-approval archetypes have direct Slack posting in instructions ✅

## Task 7: Docker rebuild + E2E verification (2026-05-26)

### Final verified task ID: 9d72e435-d9dc-4b0d-a818-04f6f9f0a3a9

### Root cause analysis (Delivering state not triggered)

TWO separate root causes blocked the `Delivering` state:

1. **Archetype instructions used `--classification "NO_ACTION_NEEDED"`**: The lifecycle's `check-classification-no-approval` step had `skipDelivery = result.classification === 'NO_ACTION_NEEDED'`. The instructions in the DB correctly specified `NEEDS_APPROVAL`, but the model ignored them due to root cause #2.

2. **`platform-procedures.mts` hardcoded `NO_ACTION_NEEDED` for no-approval archetypes**: The AGENTS.md injected into the worker explicitly said "Do NOT use NEEDS_APPROVAL" for `approval_required: false` archetypes. This overrode anything in the archetype instructions.

3. **`parseClassifyResponse` only accepts NEEDS_APPROVAL or NO_ACTION_NEEDED**: Any other string falls through to NEEDS_APPROVAL. So changing the archetype instruction to a custom classification wouldn't help.

### Fixes applied

1. **`src/inngest/employee-lifecycle.ts`** — `check-classification-no-approval` step now checks `delivery_instructions` presence: `skipDelivery = result.classification === 'NO_ACTION_NEEDED' && !hasDeliveryInstructions`. This overrides worker classification when delivery is expected.

2. **`src/workers/lib/platform-procedures.mts`** — Added `hasDeliveryInstructions` option. When true, the AGENTS.md tells the worker: "Do NOT post to external systems — content delivery is handled by the platform. Generate the content and submit it."

3. **`src/workers/opencode-harness.mts`** — Passes `hasDeliveryInstructions: !!(archetype.delivery_instructions)` to `generatePlatformProcedures`.

### Verified state machine trace (final run)
```
Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Validating → Submitting → Delivering → Done
```
(Note: `Delivering → Done` not in task_status_log due to HTTP 400 in delivery harness logStatusTransition — pre-existing issue)

### Double-posting fix confirmation
- Execution container: ONLY ran `tsx /tools/platform/submit-output.ts` (no Slack call)
- Delivery container: ran `tsx /tools/slack/post-message.ts` (correct, one Slack post)
- ONE deliverable row in DB

### Known residual issue
- `Delivering → Done` transition is NOT logged in `task_status_log` — the delivery container's `logStatusTransition` call fails with HTTP 400 (constraint or schema issue in the delivery harness's PostgREST call). This is a pre-existing issue, not introduced by these changes. Task IS Done despite the missing log entry.

## 2026-05-26 F3 Final QA Run — skipDelivery fix verified

### Task: `8a81efd7-c83e-497b-8718-7a0ab9d5498f`

**Key finding: skipDelivery fix (commit 5ca1bfb) works correctly.**

- Worker submits `NO_ACTION_NEEDED` + archetype has `delivery_instructions` → `skipDelivery = false` → delivery container spawned ✅
- Previous run (`4f406a20`) showed Delivering state bypassed (old bug). This run shows `Submitting → Delivering` in status log ✅

### State machine trace (post-fix):
```
Received → Triaging → AwaitingInput → Ready → Executing → [Submitting → Validating → Submitting] → Delivering → Done
```
(Delivering→Done not in status_log — known pre-existing HTTP 400 issue — acceptable)

### Double-posting check:
- Execution container (`employee-8a81efd7.log`): 0 post-message calls (submit-output only)
- Delivery container (`employee-delivery-8a81efd7.log`): 1 post-message call to `C0960S2Q8RL`
- No double-posting confirmed ✅

### Evidence file:
`.sisyphus/evidence/final-qa/qa-run-8a81efd7.md`

### VERDICT: APPROVE ✅
