# Cost Tracking Fix + Model Validation

## TL;DR

> **Quick Summary**: Fix two gaps — (1) delivery phase LLM costs are silently discarded, making dashboard cost stats understated, and (2) the harness silently falls back to `minimax/minimax-m2.7` when an archetype has no model configured instead of failing fast.
>
> **Deliverables**:
>
> - Prisma migration: add `phase` column to `executions`, make `model` NOT NULL on `archetypes`
> - Harness: capture delivery cost in its own `executions` row, replace model fallback with hard error
> - Dispatcher: reject trigger when archetype has no model
> - Dashboard: sum all execution rows per task for accurate cost stats
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (migration) → Task 3 (harness delivery cost) → Task 6 (dashboard fix) → F1–F4

---

## Context

### Original Request

User asked to verify whether the cost shown on the dashboard tasks page includes both execution and delivery phase costs. Investigation revealed delivery costs are entirely lost — the harness discards the `runOpencodeSession` return value during the delivery phase. Additionally, the harness silently falls back to `minimax/minimax-m2.7` when no model is configured, which should be a hard error.

### Interview Summary

**Key Discussions**:

- All employees go through both execution AND delivery phases (delivery spawns when `delivery_instructions` is set)
- Delivery cost storage: user chose separate `executions` row with `phase` column over accumulating into one row
- Dashboard display: user chose combined total over per-phase breakdown
- Model validation: user chose full fix (DB NOT NULL + trigger guard + harness error)

**Research Findings**:

- `executions` row created at harness line 808, execution phase only — delivery branch exits at line 772 before reaching this code
- `runOpencodeSession` return value discarded at line 700 (no variable assignment)
- `tasks.cost_usd_cents` is a dead field — never written by any code path
- `model` is `String?` (nullable) in Prisma schema — root cause of silent fallback
- Archetype creation API already requires model; PATCH can't null it. Gap is at trigger/dispatch.
- `employee-dispatcher.ts` has zero model validation before dispatching
- Dashboard reads `executions?.[0]?.estimated_cost_usd` — only first execution row

### Metis Review

**Identified Gaps** (addressed):

- `TaskDetail.tsx` / `use-execution.ts` scope question → locked OUT of scope (Option C — only fix `TaskFeed.tsx` aggregate stats)
- Migration SQL order for NOT NULL → explicitly sequenced: UPDATE backfill first, then ALTER
- Delivery execution row timing → must be created AFTER confirming deliverable exists (after line 666)
- `current_stage` column alternative → rejected, dedicated `phase` column is semantically correct
- Delivery retry scenario (up to 3 attempts) → each creates its own row, dashboard sum captures all costs correctly
- Empty string model bypass → harness guard uses `if (!archetype.model)` which catches both null and empty string

---

## Work Objectives

### Core Objective

Ensure the platform accurately captures and displays the full cost of running an AI employee — both execution and delivery phases — and fails fast when an archetype has no model configured.

### Concrete Deliverables

- Prisma migration adding `phase` column to `executions` table
- Prisma migration making `model` NOT NULL on `archetypes` table (with backfill)
- Harness code creating a delivery-phase `executions` row with token usage
- Harness code replacing model fallback with hard error
- Dispatcher validation rejecting triggers for model-less archetypes
- Dashboard `TaskFeed.tsx` summing all execution rows for accurate cost stats

### Definition of Done

- [ ] Two execution rows exist for any task that completes both phases (verified via psql)
- [ ] Dashboard "Total Employee Cost" reflects sum of execution + delivery costs
- [ ] Triggering a model-less archetype returns HTTP 422 with clear error
- [ ] Harness with null model transitions task to `Failed` (not silent fallback)
- [ ] `pnpm build` passes clean

### Must Have

- `phase` column on `executions` table (`TEXT NOT NULL DEFAULT 'execution'`)
- `model` column on `archetypes` table changed from nullable to NOT NULL
- Delivery-phase `executions` row with `phase = 'delivery'` and cost data
- Model validation at dispatcher level before container spawn
- Hard error in harness when `archetype.model` is null/empty
- Dashboard aggregate cost summing all executions per task

### Must NOT Have (Guardrails)

- Do NOT modify deprecated files: `orchestrate.mts`, `session-manager.ts`, `lifecycle.ts`
- Do NOT modify `admin-brain-preview.ts` line 337 fallback (display-only, out of scope)
- Do NOT change `use-execution.ts` or `TaskDetail.tsx` (out of scope for this plan)
- Do NOT populate `primary_model_id` on any execution row
- Do NOT add heartbeat to the delivery execution row
- Do NOT write to `tasks.cost_usd_cents` (dead field, out of scope)
- Do NOT add model validation to webhook trigger routes (Hostfully, Jira) — only dispatcher
- Do NOT use `current_stage` column to distinguish phases — use dedicated `phase` column

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO (user waiver)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB changes**: Use `psql` to verify schema and data
- **API changes**: Use `curl` to verify endpoints
- **Dashboard**: Use Playwright to verify stat cards
- **Harness**: Trigger real tasks and verify DB state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — DB + schema foundation):
├── Task 1: Prisma migration (phase column + model NOT NULL) [quick]
├── Task 2: Dispatcher model validation guard [quick]

Wave 2 (After Wave 1 — harness changes + Docker rebuild):
├── Task 3: Delivery-phase executions row + cost capture [deep]
├── Task 4: Harness model hard error (replace fallback) [quick]
├── Task 5: Docker image rebuild [quick]

Wave 3 (After Wave 2 — dashboard + verification):
├── Task 6: Dashboard TaskFeed.tsx cost aggregation fix [quick]
├── Task 7: E2E verification — trigger task, verify both costs [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks        | Wave  |
| ----- | ---------- | ------------- | ----- |
| 1     | —          | 3, 4, 5, 6, 7 | 1     |
| 2     | —          | 7             | 1     |
| 3     | 1          | 5, 6, 7       | 2     |
| 4     | 1          | 5, 7          | 2     |
| 5     | 3, 4       | 7             | 2     |
| 6     | 1          | 7             | 3     |
| 7     | 5, 6       | F1-F4         | 3     |
| F1-F4 | 7          | —             | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 3 tasks — T3 → `deep`, T4 → `quick`, T5 → `quick`
- **Wave 3**: 2 tasks — T6 → `quick`, T7 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma migration: add `phase` column to `executions` + make `model` NOT NULL on `archetypes`

  **What to do**:
  - Create a single Prisma migration that does two things:
    1. Add `phase` column to `executions` table: `ALTER TABLE "executions" ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'execution';` — existing rows automatically get `'execution'` via DEFAULT
    2. Backfill NULL models on archetypes: `UPDATE "archetypes" SET "model" = 'minimax/minimax-m2.7' WHERE "model" IS NULL;`
    3. Make model NOT NULL: `ALTER TABLE "archetypes" ALTER COLUMN "model" SET NOT NULL;`
  - Update `prisma/schema.prisma`:
    - Add `phase String @default("execution")` to the `Execution` model (after `runtime_type`)
    - Change `model String?` to `model String` on the `Archetype` model (line 206)
  - Run `pnpm prisma migrate dev --name add-execution-phase-and-require-model`
  - After migration: reload PostgREST schema cache: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"`
  - Verify PostgREST sees the new column via curl

  **Must NOT do**:
  - Do NOT use `current_stage` to distinguish phases
  - Do NOT create separate migrations — both changes go in one migration
  - Do NOT alter any other tables

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single migration + schema update — straightforward DB operation
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` lines 62–89 — `Execution` model definition (add `phase` field after `runtime_type` at line 66)
  - `prisma/schema.prisma` line 206 — `model String?` on `Archetype` model (change to `model String`)
  - `prisma/migrations/` — existing migrations for SQL pattern reference

  **Why Each Reference Matters**:
  - The Execution model shows exact field ordering and type conventions used in this project
  - Line 206 is the exact field to change from nullable to non-nullable
  - Existing migrations show the SQL style used (double-quoted identifiers, etc.)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Phase column exists with correct default
    Tool: Bash (psql)
    Preconditions: Migration has been applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'executions' AND column_name = 'phase';"
      2. Assert: 1 row returned with data_type = 'text', column_default contains 'execution'
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT DISTINCT phase FROM executions;"
      4. Assert: All existing rows have phase = 'execution'
    Expected Result: Column exists, type is text, default is 'execution', all existing rows backfilled
    Failure Indicators: 0 rows from step 1 (column missing), or any row with phase != 'execution'
    Evidence: .sisyphus/evidence/task-1-phase-column.txt

  Scenario: Model column is NOT NULL
    Tool: Bash (psql)
    Preconditions: Migration has been applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'archetypes' AND column_name = 'model';"
      2. Assert: is_nullable = 'NO'
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT COUNT(*) FROM archetypes WHERE model IS NULL;"
      4. Assert: count = 0
    Expected Result: Column is NOT NULL, zero rows with NULL model
    Failure Indicators: is_nullable = 'YES' or count > 0
    Evidence: .sisyphus/evidence/task-1-model-not-null.txt

  Scenario: PostgREST sees the new phase column
    Tool: Bash (curl)
    Preconditions: PostgREST schema cache reloaded
    Steps:
      1. Run: source .env && curl -s "http://localhost:54331/rest/v1/executions?limit=1&select=phase" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
      2. Assert: Response is a JSON array (not a PGRST205 error), and if rows exist, each has a "phase" key
    Expected Result: PostgREST returns data with phase field (not schema cache error)
    Failure Indicators: Response contains "Could not find" or "PGRST" error code
    Evidence: .sisyphus/evidence/task-1-postgrest-phase.txt

  Scenario: pnpm build passes after schema change
    Tool: Bash
    Preconditions: Prisma schema updated, client regenerated
    Steps:
      1. Run: pnpm build
      2. Assert: Exit code 0, no TypeScript errors
    Expected Result: Clean build
    Failure Indicators: TypeScript errors referencing `model` type or `phase` field
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-phase-column.txt
  - [ ] task-1-model-not-null.txt
  - [ ] task-1-postgrest-phase.txt
  - [ ] task-1-build.txt

  **Commit**: YES (commit 1)
  - Message: `feat(db): add executions phase column and make archetype model non-nullable`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm build`

- [x] 2. Dispatcher model validation guard

  **What to do**:
  - In `src/gateway/services/employee-dispatcher.ts`, after the archetype is fetched and the runtime check passes, add a model check:
    ```typescript
    if (!archetype.model) {
      return {
        kind: 'error' as const,
        code: 'MODEL_NOT_CONFIGURED',
        message: `Archetype "${archetype.role_name}" has no model configured. Set a model before triggering.`,
      };
    }
    ```
  - Add `'MODEL_NOT_CONFIGURED'` to the error code type union in the `DispatchEmployeeResult` type (or wherever the error codes are defined)
  - In the route handler that calls the dispatcher, ensure `MODEL_NOT_CONFIGURED` maps to HTTP 422 (Unprocessable Entity)
  - Check how other error codes are handled in the route to follow the same pattern

  **Must NOT do**:
  - Do NOT add model validation to webhook trigger routes (Hostfully, Jira)
  - Do NOT add validation to the Inngest lifecycle — only the dispatcher

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single guard clause addition — one file, a few lines
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/services/employee-dispatcher.ts` lines 32–82 — `dispatchEmployee()` function, see existing error return patterns (runtime check, archetype not found, etc.)
  - `src/gateway/routes/admin-trigger.ts` — route handler that calls `dispatchEmployee()` and maps error codes to HTTP status codes

  **Why Each Reference Matters**:
  - The dispatcher function shows the exact pattern for returning errors (the `{ kind: 'error', code: '...', message: '...' }` shape)
  - The route handler shows how error codes map to HTTP status codes — follow the same switch/if pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dispatcher rejects model-less archetype at trigger time
    Tool: Bash (curl + psql)
    Preconditions: An archetype exists with model = NULL (create one via direct psql INSERT for testing, or temporarily UPDATE an existing one)
    Steps:
      1. Find or create a test archetype with NULL model: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "UPDATE archetypes SET model = NULL WHERE id = '<test_archetype_id>';" (if model is NOT NULL from Task 1, this needs to run before Task 1's migration, or use a raw SQL insert bypassing the constraint for testing — alternatively, test with empty string model)
      2. Actually — after Task 1 makes model NOT NULL, test with an empty-string model instead: psql ... -c "UPDATE archetypes SET model = '' WHERE id = '<test_id>';"
      3. Run: source .env && curl -s -w "\n%{http_code}" -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/<test-slug>/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
      4. Assert: HTTP status 422, response body contains "MODEL_NOT_CONFIGURED"
      5. Restore the model: psql ... -c "UPDATE archetypes SET model = 'minimax/minimax-m2.7' WHERE id = '<test_id>';"
    Expected Result: HTTP 422 with clear error message mentioning model not configured
    Failure Indicators: HTTP 200/202 (trigger succeeded when it shouldn't), or HTTP 500 (unhandled error)
    Evidence: .sisyphus/evidence/task-2-dispatcher-guard.txt

  Scenario: Dispatcher allows trigger when model is set
    Tool: Bash (curl)
    Preconditions: real-estate-motivation-bot-2 has a valid model set
    Steps:
      1. Run: source .env && curl -s -w "\n%{http_code}" -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger?dry_run=true" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
      2. Assert: HTTP status is NOT 422, response does not contain "MODEL_NOT_CONFIGURED"
    Expected Result: Trigger succeeds (or returns other expected status — dry_run validates without creating)
    Failure Indicators: HTTP 422 with MODEL_NOT_CONFIGURED when model IS set (false positive)
    Evidence: .sisyphus/evidence/task-2-dispatcher-allows.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-dispatcher-guard.txt
  - [ ] task-2-dispatcher-allows.txt

  **Commit**: YES (commit 2)
  - Message: `feat(gateway): reject trigger when archetype has no model configured`
  - Files: `src/gateway/services/employee-dispatcher.ts`, route handler file
  - Pre-commit: `pnpm build`

- [x] 3. Capture delivery-phase cost in its own `executions` row

  **What to do**:
  - In `src/workers/opencode-harness.mts`, inside the `isDeliveryPhase` branch (after line 666 where deliverable existence is confirmed, before line 700):
    1. Create a delivery execution row via PostgREST:
       ```typescript
       const deliveryExecutionId = crypto.randomUUID();
       let deliveryExecId: string | null = null;
       try {
         const execRecord = await db.post('executions', {
           id: deliveryExecutionId,
           task_id: TASK_ID,
           runtime_type: 'opencode',
           status: 'running',
           phase: 'delivery',
           updated_at: new Date().toISOString(),
         });
         deliveryExecId = execRecord?.id ?? deliveryExecutionId;
       } catch (err) {
         log.warn(
           { err },
           '[opencode-harness] Failed to create delivery execution row — non-fatal',
         );
         deliveryExecId = null;
       }
       ```
    2. Capture the `runOpencodeSession` return value on line 700:
       ```typescript
       const deliveryResult = await runOpencodeSession(
         deliveryPrompt,
         archetype.model, // no more fallback — model is guaranteed non-null after Task 4
         'tsx /tools/platform/submit-output.ts ...',
         { minElapsedMs: 10_000 },
       );
       ```
    3. After the delivery session completes successfully, patch the delivery execution row with cost data:
       ```typescript
       if (deliveryExecId) {
         try {
           const usage = deliveryResult.tokenUsage;
           await db.patch('executions', `id=eq.${deliveryExecId}`, {
             status: 'completed',
             prompt_tokens: usage.promptTokens,
             completion_tokens: usage.completionTokens,
             estimated_cost_usd: usage.estimatedCostUsd,
             updated_at: new Date().toISOString(),
           });
           log.info(
             { taskId: TASK_ID, deliveryExecId, ...usage },
             '[opencode-harness] Delivery execution metrics persisted',
           );
         } catch (err) {
           log.warn(
             { err },
             '[opencode-harness] Failed to persist delivery execution metrics — non-fatal',
           );
         }
       }
       ```
    4. In the existing catch block (lines 706–710), patch the delivery execution row to `status: 'failed'`:
       ```typescript
       if (deliveryExecId) {
         await db
           .patch('executions', `id=eq.${deliveryExecId}`, {
             status: 'failed',
             updated_at: new Date().toISOString(),
           })
           .catch(() => {});
       }
       ```

  **Must NOT do**:
  - Do NOT create the delivery execution row before confirming the deliverable exists (early exit at line 657–665 means no LLM was called, no cost to record)
  - Do NOT add a heartbeat to the delivery execution row
  - Do NOT store `session_transcript` on the delivery execution row (keep it lightweight)
  - Do NOT populate `primary_model_id`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying the harness delivery flow is nuanced — must handle success, failure, and early-exit paths correctly
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 1 (needs `phase` column to exist)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts` lines 807–827 — Execution-phase execution row creation pattern (follow this exact pattern for delivery)
  - `src/workers/opencode-harness.mts` lines 915–933 — Execution-phase cost patch pattern (follow this for delivery cost patch)
  - `src/workers/opencode-harness.mts` lines 649–772 — The entire `isDeliveryPhase` branch (the code being modified)
  - `src/workers/opencode-harness.mts` line 700 — The `runOpencodeSession` call whose return value must be captured
  - `src/workers/opencode-harness.mts` lines 706–710 — The catch block for delivery session failure (add execution row patch here)
  - `src/workers/opencode-harness.mts` lines 657–665 — Early exit when no deliverable exists (do NOT create execution row before this check)

  **API/Type References**:
  - `src/workers/opencode-harness.mts` lines 294–304 — `runOpencodeSession` return type including `tokenUsage: { promptTokens, completionTokens, estimatedCostUsd }`
  - `src/workers/lib/postgrest-client.ts` — `db.post()` and `db.patch()` method signatures

  **Why Each Reference Matters**:
  - Lines 807–827 show the exact PostgREST call pattern for creating an execution row — use identical field set plus `phase: 'delivery'`
  - Lines 915–933 show the exact pattern for patching cost data — replicate for delivery
  - Line 700 is the exact line to modify (add `const deliveryResult =` before `await`)
  - Lines 657–665 are the early-exit guard — execution row must be AFTER this check

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Delivery execution row created with phase = 'delivery'
    Tool: Bash (psql)
    Preconditions: A task has completed with both execution and delivery phases
    Steps:
      1. Trigger a real task: source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id'
      2. Wait for task to reach Done (poll every 30s): psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status FROM tasks WHERE id = '<TASK_ID>';"
      3. Once Done, query execution rows: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT phase, status, estimated_cost_usd, prompt_tokens, completion_tokens FROM executions WHERE task_id = '<TASK_ID>' ORDER BY created_at;"
      4. Assert: 2 rows returned — one with phase = 'execution', one with phase = 'delivery'
      5. Assert: Both rows have estimated_cost_usd > 0
      6. Assert: Both rows have status = 'completed'
    Expected Result: Two execution rows with distinct phases and non-zero cost data
    Failure Indicators: Only 1 row (delivery row missing), or delivery row has estimated_cost_usd = 0
    Evidence: .sisyphus/evidence/task-3-delivery-exec-row.txt

  Scenario: No delivery execution row when deliverable doesn't exist (early exit)
    Tool: Bash (psql)
    Preconditions: Understanding of the early-exit path
    Steps:
      1. This is verified by code inspection — the delivery execution row creation must be placed AFTER the deliverable existence check (line 666+)
      2. Verify by reading the code: grep -n "db.post.*executions.*delivery" src/workers/opencode-harness.mts
      3. Assert: The POST call line number is greater than the deliverable check line number
    Expected Result: Execution row creation code is positioned after deliverable validation
    Failure Indicators: POST appears before the deliverable check
    Evidence: .sisyphus/evidence/task-3-no-early-row.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-delivery-exec-row.txt
  - [ ] task-3-no-early-row.txt

  **Commit**: YES (commit 3)
  - Message: `feat(harness): capture delivery phase cost in separate executions row`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 4. Replace harness model fallback with hard error

  **What to do**:
  - In `src/workers/opencode-harness.mts`, find both occurrences of `archetype.model ?? 'minimax/minimax-m2.7'`:
    1. **Line 784** (execution phase): Replace with:
       ```typescript
       if (!archetype.model) {
         log.error(
           { taskId: TASK_ID },
           '[opencode-harness] Archetype has no model configured — cannot proceed',
         );
         await markFailed(
           'Archetype has no model configured. Set a model in the employee settings before triggering.',
           executionId,
           'Executing',
           'missing_model',
         );
         process.exit(1);
       }
       const model = archetype.model;
       ```
    2. **Line 702** (delivery phase): Replace `archetype.model ?? 'minimax/minimax-m2.7'` with just `archetype.model` — after the guard above, this is guaranteed non-null. But also add a delivery-specific guard for defense in depth:
       ```typescript
       if (!archetype.model) {
         log.error(
           { taskId: TASK_ID },
           '[opencode-harness] Archetype has no model configured for delivery phase',
         );
         await markFailed('Archetype has no model configured', null, 'Delivering', 'missing_model');
         process.exit(1);
       }
       ```
  - Do NOT modify any other fallback patterns (deprecated files, brain-preview)

  **Must NOT do**:
  - Do NOT modify `admin-brain-preview.ts` line 337 (display-only)
  - Do NOT modify deprecated files (`orchestrate.mts`, `session-manager.ts`, `lifecycle.ts`)
  - Do NOT change the model value used — only remove the fallback pattern

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two simple find-and-replace changes with guard clauses
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (needs `model` NOT NULL migration applied so existing archetypes are safe)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts` line 784 — `const model = archetype.model ?? 'minimax/minimax-m2.7'` (execution phase fallback to replace)
  - `src/workers/opencode-harness.mts` line 702 — `archetype.model ?? 'minimax/minimax-m2.7'` inline in delivery `runOpencodeSession` call
  - `src/workers/opencode-harness.mts` lines 109–130 — `markFailed()` function signature and usage pattern

  **Why Each Reference Matters**:
  - Lines 784 and 702 are the exact locations to modify
  - `markFailed()` is the correct function to call — it patches the task to `Failed` status, writes `task_status_log`, and patches the execution row if one exists

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No fallback pattern remains in active harness code
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -n "minimax/minimax-m2.7" src/workers/opencode-harness.mts
      2. Assert: Zero matches — no fallback strings remain in the active harness
    Expected Result: 0 occurrences of the fallback model string
    Failure Indicators: Any match found in the file
    Evidence: .sisyphus/evidence/task-4-no-fallback.txt

  Scenario: Guard clause exists for both phases
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. Run: grep -n "!archetype.model" src/workers/opencode-harness.mts
      2. Assert: At least 2 matches (one for execution phase, one for delivery phase)
      3. Run: grep -n "missing_model" src/workers/opencode-harness.mts
      4. Assert: At least 2 matches (failure code used in both guards)
    Expected Result: Both guard clauses present with correct failure code
    Failure Indicators: Fewer than 2 matches for either pattern
    Evidence: .sisyphus/evidence/task-4-guard-clauses.txt

  Scenario: pnpm build passes after removing fallbacks
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: Exit code 0
    Expected Result: Clean build — no TypeScript errors from the model type change
    Failure Indicators: Type errors where `archetype.model` is used as a non-null string
    Evidence: .sisyphus/evidence/task-4-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-no-fallback.txt
  - [ ] task-4-guard-clauses.txt
  - [ ] task-4-build.txt

  **Commit**: YES (commit 4)
  - Message: `fix(harness): replace silent model fallback with hard error`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 5. Docker image rebuild

  **What to do**:
  - Rebuild the Docker image to include harness changes from Tasks 3 and 4:
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
  - Verify the build succeeds (EXIT_CODE: 0)

  **Must NOT do**:
  - Do NOT push the image to any registry
  - Do NOT modify the Dockerfile

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — must wait for Tasks 3 and 4
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `Dockerfile` — the build file (no changes needed, just run the build)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux for long-running)
    Steps:
      1. Run: docker build -t ai-employee-worker:latest .
      2. Assert: Exit code 0
      3. Run: docker images ai-employee-worker:latest --format '{{.CreatedAt}}'
      4. Assert: Timestamp is within last 5 minutes
    Expected Result: Image built successfully with recent timestamp
    Failure Indicators: Non-zero exit code, build errors
    Evidence: .sisyphus/evidence/task-5-docker-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-docker-build.txt

  **Commit**: NO (no code changes)

- [x] 6. Dashboard `TaskFeed.tsx` cost aggregation fix

  **What to do**:
  - In `dashboard/src/panels/tasks/TaskFeed.tsx`:
    1. **Line 191** — Fix aggregate total cost calculation to sum ALL executions per task (not just first):

       ```typescript
       // Before (broken — only first execution):
       filteredCosts?.reduce((sum, t) => sum + (t.executions?.[0]?.estimated_cost_usd ?? 0), 0) ??
         0;

       // After (correct — sum all executions per task):
       filteredCosts?.reduce(
         (sum, t) =>
           sum + (t.executions?.reduce((s, e) => s + (e.estimated_cost_usd ?? 0), 0) ?? 0),
         0,
       ) ?? 0;
       ```

    2. **Line 355** — Fix per-task cost column to sum all executions:

       ```typescript
       // Before (broken — only first execution):
       const cost = task.executions?.[0]?.estimated_cost_usd;
       return cost != null && cost > 0 ? `$${cost.toFixed(4)}` : '—';

       // After (correct — sum all executions):
       const cost = task.executions?.reduce((s, e) => s + (e.estimated_cost_usd ?? 0), 0) ?? 0;
       return cost > 0 ? `$${cost.toFixed(4)}` : '—';
       ```

  **Must NOT do**:
  - Do NOT modify `use-execution.ts` or `TaskDetail.tsx` — out of scope
  - Do NOT add per-phase breakdown columns to the table
  - Do NOT modify the PostgREST query — it already fetches all execution rows via the embedded join

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two line changes in one file — straightforward JavaScript reduce fix
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1 (needs phase column for new execution rows to exist)

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/TaskFeed.tsx` line 131 — PostgREST query with `select: '*,archetypes(role_name,model),executions(estimated_cost_usd)'` (already fetches all rows)
  - `dashboard/src/panels/tasks/TaskFeed.tsx` line 191 — Aggregate cost calculation (the line to fix)
  - `dashboard/src/panels/tasks/TaskFeed.tsx` lines 354–357 — Per-task cost column (the lines to fix)
  - `dashboard/src/panels/tasks/TaskFeed.tsx` lines 257–261 — "Total Employee Cost" stat card that displays `totalCostUsd`

  **Why Each Reference Matters**:
  - Line 131 confirms the PostgREST query already returns an array of ALL executions — no query change needed
  - Line 191 is the exact aggregation logic that only reads `[0]` — needs to reduce over all
  - Lines 354–357 are the per-row rendering that also only reads `[0]`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Aggregate cost sums both execution and delivery rows
    Tool: Playwright (browser)
    Preconditions: At least one completed task exists with both execution and delivery execution rows (from Task 3's E2E)
    Steps:
      1. Navigate to: http://localhost:7701/dashboard/tasks?tenant=00000000-0000-0000-0000-000000000003
      2. Find the "Total Employee Cost" stat card
      3. Assert: Value is greater than $0.0000
      4. Compare with manual calculation: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT SUM(estimated_cost_usd) FROM executions e JOIN tasks t ON e.task_id = t.id WHERE t.tenant_id = '00000000-0000-0000-0000-000000000003';"
      5. Assert: Dashboard value approximately matches the psql sum
    Expected Result: Dashboard stat shows combined execution + delivery cost
    Failure Indicators: Dashboard shows $0.0000 when DB has non-zero costs, or dashboard shows only half the total
    Evidence: .sisyphus/evidence/task-6-aggregate-cost.png

  Scenario: Per-task cost column shows combined total
    Tool: Playwright (browser)
    Preconditions: A task with both execution and delivery execution rows
    Steps:
      1. Navigate to: http://localhost:7701/dashboard/tasks?tenant=00000000-0000-0000-0000-000000000003
      2. Find the task row in the table
      3. Read the cost column value
      4. Compare with: psql ... -c "SELECT SUM(estimated_cost_usd) FROM executions WHERE task_id = '<TASK_ID>';"
      5. Assert: Dashboard per-task cost matches the sum of both execution rows
    Expected Result: Per-task cost = execution cost + delivery cost
    Failure Indicators: Per-task cost equals only the execution-phase cost (delivery not included)
    Evidence: .sisyphus/evidence/task-6-per-task-cost.png
  ```

  **Evidence to Capture:**
  - [ ] task-6-aggregate-cost.png
  - [ ] task-6-per-task-cost.png

  **Commit**: YES (commit 5)
  - Message: `fix(dashboard): sum all execution phases for accurate cost display`
  - Files: `dashboard/src/panels/tasks/TaskFeed.tsx`
  - Pre-commit: `pnpm build`

- [x] 7. E2E verification — trigger task, verify full cost flow

  **What to do**:
  - This is the integration test that verifies the entire pipeline works end-to-end
  - First, verify the test employee has delivery instructions:
    ```bash
    psql postgresql://postgres:postgres@localhost:54322/ai_employee \
      -c "SELECT role_name, delivery_instructions IS NOT NULL as has_delivery FROM archetypes WHERE role_name = 'real-estate-motivation-bot-2';"
    ```
    If `has_delivery = false`, find another employee with delivery instructions for E2E
  - Trigger the employee:
    ```bash
    source .env
    curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq '{task_id: .task_id}'
    ```
  - Wait for task to reach `Done` (poll every 30s, max 5 minutes)
  - Verify both execution rows exist with costs
  - Load the dashboard and verify the cost is reflected
  - Test the model validation guard (dispatcher reject)

  **Must NOT do**:
  - Do NOT use `real-estate-motivation-bot-2` if it lacks `delivery_instructions` — find an alternative
  - Do NOT skip the PostgREST verification — curl PostgREST to confirm the phase column is readable

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step E2E verification involving trigger, polling, DB checks, dashboard verification
  - **Skills**: [`playwright`]
    - `playwright`: Needed for dashboard verification screenshots

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — requires all prior tasks complete, Docker image rebuilt
  - **Blocks**: F1–F4
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - AGENTS.md § "Recommended Test Employee: real-estate-motivation-bot-2" — trigger command and verification steps
  - AGENTS.md § "Feature Verification Checklist" — PostgREST ≠ psql, zero rows is never expected, dashboard must show real data

  **Why Each Reference Matters**:
  - The AGENTS.md trigger command is the exact curl to use
  - The verification checklist ensures we check all layers (psql, PostgREST, dashboard)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full pipeline — two execution rows with costs after task completes
    Tool: Bash (curl + psql) + Playwright (dashboard)
    Preconditions: All prior tasks complete, Docker image rebuilt, services running
    Steps:
      1. Trigger task: source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id'
      2. Poll until Done (max 5 min): psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status FROM tasks WHERE id = '<TASK_ID>';"
      3. Verify execution rows: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT phase, status, estimated_cost_usd, prompt_tokens, completion_tokens FROM executions WHERE task_id = '<TASK_ID>' ORDER BY created_at;"
      4. Assert: 2 rows — phase 'execution' + phase 'delivery', both status 'completed', both estimated_cost_usd > 0
      5. Verify via PostgREST: source .env && curl -s "http://localhost:54331/rest/v1/executions?task_id=eq.<TASK_ID>&select=phase,estimated_cost_usd&order=created_at" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
      6. Assert: Same 2 rows via PostgREST
      7. Load dashboard: http://localhost:7701/dashboard/tasks?tenant=00000000-0000-0000-0000-000000000003
      8. Assert: "Total Employee Cost" stat card > $0.0000
      9. Find the task row, assert cost column shows combined total
    Expected Result: Two execution rows with costs, dashboard reflects combined cost
    Failure Indicators: Only 1 execution row, or delivery row has cost = 0, or dashboard still shows only execution cost
    Evidence: .sisyphus/evidence/task-7-e2e-full-pipeline.txt, .sisyphus/evidence/task-7-dashboard-cost.png

  Scenario: Model validation — dispatcher rejects model-less archetype
    Tool: Bash (curl + psql)
    Preconditions: Dispatcher guard from Task 2 is deployed
    Steps:
      1. Create a temporary test: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "UPDATE archetypes SET model = '' WHERE role_name = 'real-estate-motivation-bot-2';"
      2. Attempt trigger: source .env && curl -s -w "\n%{http_code}" -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
      3. Assert: HTTP 422 with MODEL_NOT_CONFIGURED
      4. Restore: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "UPDATE archetypes SET model = 'minimax/minimax-m2.7' WHERE role_name = 'real-estate-motivation-bot-2';"
    Expected Result: Trigger rejected with clear error, then restored to working state
    Failure Indicators: HTTP 200/202 (guard didn't fire), or model not restored after test
    Evidence: .sisyphus/evidence/task-7-model-validation.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-e2e-full-pipeline.txt
  - [ ] task-7-dashboard-cost.png
  - [ ] task-7-model-validation.txt

  **Commit**: NO (verification only)

- [ ] 8. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ cost-tracking-and-model-validation complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1–F4

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` (must pass clean). Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify Prisma migration SQL is correct and migration has been applied.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for dashboard)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: trigger a real task, wait for Done, verify two execution rows with costs, load dashboard, confirm aggregate cost is non-zero. Test model validation: attempt to trigger a model-less archetype via curl. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance — verify deprecated files untouched, `TaskDetail.tsx` untouched, `admin-brain-preview.ts` untouched, no writes to `tasks.cost_usd_cents`. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                       | Files                                                       | Pre-commit   |
| ------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------ |
| 1      | `feat(db): add executions phase column and make archetype model non-nullable` | `prisma/schema.prisma`, `prisma/migrations/*/migration.sql` | `pnpm build` |
| 2      | `feat(gateway): reject trigger when archetype has no model configured`        | `src/gateway/services/employee-dispatcher.ts`               | `pnpm build` |
| 3      | `feat(harness): capture delivery phase cost in separate executions row`       | `src/workers/opencode-harness.mts`                          | `pnpm build` |
| 4      | `fix(harness): replace silent model fallback with hard error`                 | `src/workers/opencode-harness.mts`                          | `pnpm build` |
| 5      | `fix(dashboard): sum all execution phases for accurate cost display`          | `dashboard/src/panels/tasks/TaskFeed.tsx`                   | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
# Phase column exists
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'executions' AND column_name = 'phase';"
# Expected: phase | text | 'execution'::text

# Model is NOT NULL
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'archetypes' AND column_name = 'model';"
# Expected: NO

# Two execution rows after a completed task
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT phase, status, estimated_cost_usd FROM executions WHERE task_id = '<TASK_ID>' ORDER BY created_at;"
# Expected: 2 rows — execution + delivery, both with cost > 0

# Dispatcher rejects model-less archetype
source .env
curl -s -X POST "http://localhost:7700/admin/tenants/$TENANT/employees/<slug>/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
# Expected: HTTP 422, {"kind":"error","code":"MODEL_NOT_CONFIGURED",...}

# pnpm build passes
pnpm build  # Expected: 0 errors
```

### Final Checklist

- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent (verified by F4)
- [ ] `pnpm build` passes clean
- [ ] Docker image rebuilt
- [ ] PostgREST schema cache reloaded
- [ ] Dashboard shows combined cost from both phases
