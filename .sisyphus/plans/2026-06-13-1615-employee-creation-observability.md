# AI Employee Creation — Observability Hardening + Combined Creation/Debugging Skill

## TL;DR

> **Quick Summary**: Audit-and-fix the observability/traceability of the AI employee CREATION process (wizard → archetype-generator LLM call → save → activate, plus the compiled-AGENTS.md bridge artifact) by adding a creation-scoped LLM-call trace table, server-driven edit history, and success/decision logging — then create one real DozalDevs employee via the wizard (draft → active, NOT triggered) and write a combined creation+debugging OpenCode skill.
>
> **Deliverables**:
>
> - New `archetype_generation_calls` table (creation-scoped LLM-call trace) + repository
> - `created_by` column on `archetypes`
> - Server-driven `archetype_edit_history` for wizard create + direct PATCH (incl. status flips); AssistantTab client-driven history removed
> - Best-effort instrumentation in archetype-generator, generate/create/patch/propose-edit routes (capture prompt/response/tokens/latency/actual-model/recommendation/failures)
> - One real DozalDevs employee created via wizard (draft → active)
> - New dev skill `.opencode/skills/employee-creation-debugging/SKILL.md` (creation walkthrough + creation-time debugging/observability reference)
> - AGENTS.md + README.md updated
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (backup) → Task 2 (schema+migration) → Task 3 (PostgREST reload) → Task 6 (repo) → Task 7-10 (instrumentation) → Task 12 (real creation) → Task 13 (skill) → Final Wave

---

## Context

### Original Request

"Help me go through the full AI employee creation process. Make sure that if I try to troubleshoot or debug anything in my local environment or in production, everything is appropriately logged or stored somewhere so that I can debug any issues that may come up. I also want to create a `.opencode/skills` for this so that you are able to do this easily in the future."

### Interview Summary

**Key Discussions** (decisions confirmed):

- **Create a real new employee** (not a dry-run), via the **dashboard wizard**, for the **DozalDevs** tenant (`00000000-0000-0000-0000-000000000002`).
- **Scope reframe (stated twice, decisive)**: The user cares about observability/debugging/tracing of the **CREATION process** and **creation-time artifacts** (incl. the compiled AGENTS.md bridge artifact). They explicitly do **NOT** care about the runtime/triggering process this session ("I will handle that triggering part later"). Creation stops at `status: active` — **no task is triggered**.
- **Audit + fix creation-side observability gaps**, then document.
- **One combined skill** covering the creation walkthrough AND creation-time debugging/observability.
- **Table scope**: creation-scoped table named `archetype_generation_calls` (NOT a generic gateway-wide table).
- **History ownership**: server owns ALL `archetype_edit_history` writes; AssistantTab's client-driven `recordEditHistory` call is removed (no double-recording).

**Research Findings** (creation-path observability audit, file:line evidence):

- Generation LLM call discards prompt/response/tokens/latency/actual-model/retries (`archetype-generator.ts:300-329`). Persists nothing.
- Wizard create writes no history row, no `created_by`, no success log (`admin-archetypes.ts:196,235`).
- Model recommendation decision not persisted (`archetype-generator.ts:331-363`).
- Direct PATCH bypasses edit history; `status:active` flip untracked (`admin-archetypes.ts:363,412`).
- No record a generate/propose-edit attempt happened on failure (`admin-archetype-generate.ts:113-123`, `admin-archetype-propose-edit.ts:409-418`).
- Time-estimation LLM call untracked (`time-estimator.ts:35-43`).
- `callLLM` logs requested not actual model (`call-llm.ts:243`).
- WORKS already (no action): brain-preview (`admin-brain-preview.ts:82`), compile-preview (`:48`), edit-history approve/revert.
- `executions` and `system_events` are both task-runtime-scoped — structurally wrong for creation-time calls (Metis verified). New table justified.

### Metis Review

**Identified Gaps** (addressed in plan):

- Table scope/name → **resolved**: `archetype_generation_calls` (creation-scoped).
- RISK-A double-history → **resolved**: server owns all history; remove AssistantTab client call.
- `archetype_id` must be nullable (failure before archetype exists) → EDGE-1, addressed in schema task.
- SERVICE_TOKEN actor → nullable `created_by`, read `req.auth?.id ?? null` → EDGE-3.
- Prompt size/redaction → cap + `truncated` flag + assert no secrets → EDGE-4, Q2 default applied.
- `kind` enum widening (`'create'`) must not break dashboard history UI → RISK-B, validated in plan.
- One row per LLM call (not per creation) for full traceability → EDGE-6 default applied.
- Best-effort/non-blocking persistence; logging never blocks creation → RISK-F.
- Backup before migration; PostgREST schema reload; verify via PostgREST not just psql.

---

## Work Objectives

### Core Objective

Make every step of the AI employee CREATION process durably traceable (locally and in production) so any creation issue can be debugged after the fact, create one real DozalDevs employee via the wizard, and capture the whole workflow in a single reusable OpenCode skill.

### Concrete Deliverables

- `archetype_generation_calls` Prisma model + migration + PostgREST visibility.
- `archetypes.created_by` column.
- `ArchetypeGenerationCallRepository` in `src/repositories/`.
- Server-driven edit-history (wizard create `kind:'create'`, direct PATCH incl. status flips); AssistantTab client `recordEditHistory` removed.
- Instrumentation in `archetype-generator.ts`, `admin-archetype-generate.ts`, `admin-archetypes.ts` (create/patch/recommend), `admin-archetype-propose-edit.ts`, `time-estimator.ts`, and actual-model logging in `call-llm.ts`.
- One real DozalDevs employee (draft → active, not triggered).
- `.opencode/skills/employee-creation-debugging/SKILL.md`.
- Updated AGENTS.md (Database, structure, Dev skills table) + README.md (any new endpoint).

### Definition of Done

- [ ] `archetype_generation_calls` exists and is queryable via PostgREST (200, not 404 PGRST205).
- [ ] A real DozalDevs wizard creation produces: a generation-call row (with prompt/response/tokens/latency/actual_model), a `kind:'create'` history row, `created_by` populated-or-documented-null, and the new archetype is `active`.
- [ ] Forced generation failure persists a failure row AND creates no orphaned archetype.
- [ ] An AssistantTab-style edit produces exactly one history row (no duplicates).
- [ ] `pnpm test:unit` and `pnpm lint` pass with zero new failures.
- [ ] Skill file present with valid frontmatter; documents the real table/columns and the real verification commands.

### Must Have

- Creation-scoped trace table `archetype_generation_calls` (tenant-scoped, soft-delete, nullable `archetype_id`, nullable `created_by`).
- Server-driven history for create + direct PATCH; AssistantTab client call removed.
- Best-effort, non-blocking persistence everywhere.
- DB backup before migration; PostgREST schema reload + PostgREST-level verification.
- Combined creation + debugging dev skill.

### Must NOT Have (Guardrails)

- **MUST NOT touch any runtime/harness code**: `src/workers/`, `src/inngest/`, `opencode-harness.mts`, `execution-phase.mts`, `delivery-phase.mts`. (User deferred runtime.)
- **MUST NOT fix the 9 runtime observability gaps** from the earlier runtime audit — creation-path only.
- **MUST NOT trigger, dispatch, or execute** the new employee. Stop at `status: active`.
- **MUST NOT refactor** `archetype-generator.ts` generation logic or prompt — ADD instrumentation only.
- **MUST NOT store any tenant secret/token/credential** in the trace table — prompts carry toolkit _names_ only; assert this.
- **MUST NOT hard-delete** any row (soft-delete `deleted_at` only).
- **MUST NOT let a logging/persistence failure block** a creation/generation response.
- **MUST NOT create double history rows** for AssistantTab edits.
- **MUST NOT create employees for any tenant other than DozalDevs.**

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No "user manually tests/confirms".

### Test Decision

- **Infrastructure exists**: YES (Vitest — `pnpm test:unit` / `pnpm test:integration`).
- **Automated tests**: Tests-after — add unit tests with fault injection for the new repository + instrumentation (simulate PostgREST/persistence failure and assert non-blocking + warn). No live task triggering (matches user constraint).
- **Framework**: Vitest.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB/migration**: psql `\d` + PostgREST `curl` (200 vs 404 PGRST205).
- **Creation flow**: real wizard creation via API/curl against DozalDevs; assert rows via psql (zero rows = failure).
- **Routes**: `curl` for status codes + response shapes; `sendError`/`sendSuccess` envelope.
- **Skill**: `head`/grep frontmatter + content checks.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: DB backup (BLOCKS all migration) [quick]
└── Task 2: Schema — archetype_generation_calls model + created_by + kind 'create' [deep]

Wave 2 (After schema — migration + access layer):
├── Task 3: Run migration + PostgREST schema reload + verify [quick]
├── Task 4: PostgREST types + output (postgrest-types if workers read it — N/A; gateway Prisma) [quick]
├── Task 5: ERROR_CODES / Zod schema additions if any new route surface [quick]
└── Task 6: ArchetypeGenerationCallRepository [unspecified-high]

Wave 3 (After repo — instrumentation, MAX PARALLEL):
├── Task 7: Instrument archetype-generator.ts (capture call metadata, recommendation, failures) [deep]
├── Task 8: Instrument generate + propose-edit routes (persist attempts incl. failures) [unspecified-high]
├── Task 9: Server-driven history on create + direct PATCH; success logs; created_by [deep]
├── Task 10: Remove AssistantTab client recordEditHistory; verify no duplicates [visual-engineering]
├── Task 11: Instrument time-estimator + call-llm actual-model logging [quick]
└── Task 14: Unit tests w/ fault injection for repo + instrumentation [unspecified-high]

Wave 4 (After instrumentation — real creation + skill + docs):
├── Task 12: Real DozalDevs wizard creation (draft → active, NOT triggered) + assert observability [deep]
├── Task 13: Write combined creation+debugging skill [writing]
└── Task 15: Update AGENTS.md + README.md [writing]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real QA execution (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> user okay -> Task 16 Notify completion

Critical Path: 1 → 2 → 3 → 6 → 9 → 12 → 13 → F1-F4 → user okay
```

### Dependency Matrix

- **1**: deps none — blocks 2,3
- **2**: deps 1 — blocks 3,6
- **3**: deps 2 — blocks 6,12
- **4**: deps 3 — blocks 6 (if needed; else skip)
- **5**: deps none — blocks 8
- **6**: deps 3 — blocks 7,8,9,11,14
- **7**: deps 6 — blocks 12,14
- **8**: deps 5,6 — blocks 12,14
- **9**: deps 6 — blocks 10,12,14
- **10**: deps 9 — blocks 12
- **11**: deps 6 — blocks 14
- **12**: deps 7,8,9,10,11 — blocks 13,F\*
- **13**: deps 12 — blocks F\*
- **14**: deps 7,8,9,11 — blocks F\*
- **15**: deps 12 — blocks F\*

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `deep`
- **Wave 2**: T3 → `quick`, T4 → `quick`, T5 → `quick`, T6 → `unspecified-high`
- **Wave 3**: T7 → `deep`, T8 → `unspecified-high`, T9 → `deep`, T10 → `visual-engineering`, T11 → `quick`, T14 → `unspecified-high`
- **Wave 4**: T12 → `deep`, T13 → `writing`, T15 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. DB backup before any migration

  **What to do**:
  - Follow AGENTS.md § "Database Backup". Create `database-backups/$(date +%Y-%m-%d-%H%M)/` and run `pg_dump` (full + critical tables) inside the `shared-postgres` container.
  - Record the backup directory path in this task's evidence file.

  **Must NOT do**:
  - Do NOT run any migration in this task. Backup only.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single, mechanical, well-documented procedure.
  - **Skills**: [`prisma`] — covers backup/reseed safety; [`long-running-commands`] if `pg_dump` runs long.

  **Parallelization**: Can Run In Parallel: NO. Wave 1. Blocks: 2, 3. Blocked By: None.

  **References**:
  - AGENTS.md § "Database Backup (MANDATORY before any reseed or wipe)" — exact `pg_dump` commands, container name `shared-postgres`, row-count confirmation.

  **Acceptance Criteria**:
  - [ ] `ls database-backups/<timestamp>/full-dump.sql` exists and is non-empty.
  - **QA Scenarios**:

  ```
  Scenario: Full backup produced
    Tool: Bash
    Steps:
      1. Run the backup block from AGENTS.md § Database Backup.
      2. Assert: `test -s database-backups/<ts>/full-dump.sql && echo OK`
    Expected Result: prints OK; row-count query prints task/archetype/rule counts.
    Evidence: .sisyphus/evidence/task-1-db-backup.txt
  ```

  **Commit**: NO.

- [ ] 2. Schema: `archetype_generation_calls` model + `archetypes.created_by` + `kind:'create'`

  **What to do**:
  - Add Prisma model `ArchetypeGenerationCall` (`@@map("archetype_generation_calls")`): `id` (uuid), `tenant_id @db.Uuid`, `archetype_id String? @db.Uuid` (nullable — EDGE-1: failures before archetype exists), `call_type String` (`'generate' | 'refine' | 'recommend_model' | 'time_estimate' | 'propose_edit'`), `model_requested String?`, `model_actual String?`, `prompt String? @db.Text`, `response String? @db.Text`, `prompt_truncated Boolean @default(false)`, `response_truncated Boolean @default(false)`, `prompt_tokens Int?`, `completion_tokens Int?`, `estimated_cost_usd Decimal?`, `latency_ms Int?`, `retry_count Int @default(0)`, `status String` (`'success' | 'failed'`), `error_message String? @db.Text`, `created_by String? @db.Uuid` (nullable — SERVICE_TOKEN), `created_at DateTime @default(now())`, `deleted_at DateTime?`. Indexes: `@@index([tenant_id, created_at])`, `@@index([archetype_id])`.
  - Add `created_by String? @db.Uuid` to the `Archetype` model (nullable — EDGE-3).
  - Document in schema comments that `kind` on `archetype_edit_history` now also accepts `'create'` (string field — additive values change; no enum migration).
  - Generate the migration with `prisma migrate dev` (do NOT deploy to prod here).

  **Must NOT do**:
  - Do NOT add any column intended to store secrets/tokens. Prompt field stores generation prompt only (toolkit names, never credentials).
  - Do NOT modify any runtime/worker/inngest table or code.

  **Recommended Agent Profile**:
  - **Category**: `deep` — schema design correctness, nullable/index decisions, migration safety.
  - **Skills**: [`prisma`] — migration workflow, soft-delete, schema-reload; [`data-access-conventions`] — tenant-scoping conventions.

  **Parallelization**: Can Run In Parallel: NO. Wave 1. Blocks: 3, 6. Blocked By: 1.

  **References**:
  - `prisma/schema.prisma` `model ArchetypeEditHistory` (~lines 644-663) — copy tenant-scoping, soft-delete, nullable actor, index shape.
  - `prisma/schema.prisma` `model Archetype` — add `created_by` here.
  - AGENTS.md § Key Conventions — "Soft deletes only", "Multi-tenancy is mandatory".

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` contains the new model + `created_by`.
  - [ ] Migration file generated under `prisma/migrations/`.
  - **QA Scenarios**:

  ```
  Scenario: Schema validates and migration generated
    Tool: Bash
    Steps:
      1. `pnpm prisma validate` → no errors.
      2. `pnpm prisma migrate dev --name archetype_generation_calls` → migration created + applied to local DB.
      3. `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetype_generation_calls"` → shows all columns.
    Expected Result: table present with archetype_id nullable, created_by nullable on both tables.
    Evidence: .sisyphus/evidence/task-2-schema.txt
  ```

  **Commit**: YES (2). `feat(db): add archetype_generation_calls table and archetypes.created_by`.

- [ ] 3. Apply migration + PostgREST schema reload + verify visibility

  **What to do**:
  - Ensure migration applied (from Task 2). Reload PostgREST schema cache: `psql ... -c "NOTIFY pgrst, 'reload schema';"`.
  - Verify the table is queryable VIA PostgREST (not just psql) — the zero-rows / 404-PGRST205 distinction from the feature-verification skill.

  **Must NOT do**: Do NOT skip the PostgREST reload — a missing reload makes the table invisible to PostgREST.

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`prisma`] (schema-cache reload), [`feature-verification`] (PostgREST-vs-psql).

  **Parallelization**: Can Run In Parallel: NO. Wave 2. Blocks: 6, 12. Blocked By: 2.

  **References**:
  - `feature-verification` skill — PostgREST-vs-psql, zero-rows-is-failure.
  - AGENTS.md CI/CD note — `NOTIFY pgrst, 'reload schema'`.

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Table visible via PostgREST
    Tool: Bash (curl)
    Steps:
      1. `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"`
      2. `curl -s "http://localhost:54331/archetype_generation_calls?limit=1" -H "apikey: $SUPABASE_ANON_KEY" -o /dev/null -w "%{http_code}"`
    Expected Result: HTTP 200 (NOT 404 PGRST205 "table not found").
    Failure Indicators: 404 / PGRST205 = reload missing.
    Evidence: .sisyphus/evidence/task-3-postgrest.txt
  ```

  **Commit**: NO (groups with 2 if migration not yet committed).

- [ ] 4. Confirm gateway DB access path (Prisma) — no PostgREST worker types needed

  **What to do**:
  - Confirm the new table is accessed ONLY from the gateway via Prisma (creation runs in the gateway, not the worker). Verify no worker (`src/workers/`) needs to read it → therefore NO `postgrest-types.ts` change required.
  - Run `pnpm prisma generate` so the Prisma client includes the new model.

  **Must NOT do**: Do NOT add the table to any worker-side PostgREST type or read it from `src/workers/`.

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`data-access-conventions`] (worker-vs-repository boundary).

  **Parallelization**: Can Run In Parallel: YES. Wave 2 (with 3,5). Blocks: 6. Blocked By: 2.

  **References**: `data-access-conventions` skill — Prisma-in-gateway vs PostgREST-in-workers boundary.

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Prisma client knows the model
    Tool: Bash
    Steps:
      1. `pnpm prisma generate`
      2. `grep -r "archetypeGenerationCall" node_modules/.prisma/client/index.d.ts | head -1`
    Expected Result: model present in generated client.
    Evidence: .sisyphus/evidence/task-4-prisma-client.txt
  ```

  **Commit**: NO.

- [ ] 5. Add ERROR_CODES / Zod schema for any new route surface (if needed)

  **What to do**:
  - This plan adds instrumentation to EXISTING routes (no new endpoints expected). Confirm no new ERROR_CODES or Zod schemas are required. If a read endpoint for the trace table is added later it is OUT OF SCOPE here.
  - If any touched route needs a new error code (e.g. none expected), add it to `ERROR_CODES` per the api-design skill.

  **Must NOT do**: Do NOT add a new public read endpoint for the trace table in this plan (debugging is via psql/PostgREST + skill).

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`api-design`] (sendError/ERROR_CODES/Zod).

  **Parallelization**: Can Run In Parallel: YES. Wave 2. Blocks: 8. Blocked By: None.

  **References**: `api-design` skill; `src/gateway/lib/prisma-helpers.ts` (`ERROR_CODES`).

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: No new endpoint added; codes consistent
    Tool: Bash
    Steps:
      1. `git diff --name-only` shows no new route file under src/gateway/routes/.
    Expected Result: confirmed; any touched route still uses sendError/sendSuccess.
    Evidence: .sisyphus/evidence/task-5-no-new-endpoint.txt
  ```

  **Commit**: NO.

- [ ] 6. `ArchetypeGenerationCallRepository`

  **What to do**:
  - Add `src/repositories/ArchetypeGenerationCallRepository.ts` with a tenant-scoped `record(input)` method that inserts a row via Prisma, plus optional `linkArchetype(callId, archetypeId)` to attach the archetype_id after a successful create.
  - `record()` MUST cap `prompt`/`response` at a hard size (e.g. 256 KB) and set `*_truncated` flags. MUST be safe to call with `archetype_id: null`.
  - All methods filter `deleted_at IS NULL` on reads.

  **Must NOT do**:
  - Do NOT store secrets. Do NOT throw from `record()` in a way that would propagate to the route — callers wrap it best-effort, but the repo itself should also be defensive.
  - Do NOT call `prisma` for this table from anywhere except this repository.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — careful data-layer code + size-cap logic.
  - **Skills**: [`data-access-conventions`] (repository pattern), [`prisma`].

  **Parallelization**: Can Run In Parallel: NO (foundation for Wave 3). Wave 2. Blocks: 7,8,9,11,14. Blocked By: 3.

  **References**:
  - `src/repositories/EmployeeRuleRepository.ts` and `src/repositories/TaskRepository.ts` — repository structure, tenant-scoping, soft-delete filtering.
  - `data-access-conventions` skill — repository-layer rule.

  **Acceptance Criteria**:
  - [ ] `record()` inserts a row; size cap + truncation flags work.
  - **QA Scenarios**:

  ```
  Scenario: record() inserts a tenant-scoped row
    Tool: Bash (node/tsx one-off or unit test)
    Steps:
      1. Call record({ tenant_id: DozalDevs, call_type:'generate', model_requested:'x', status:'success', prompt:'p', response:'r' }).
      2. `psql ... -c "SELECT call_type,status,prompt_truncated FROM archetype_generation_calls ORDER BY created_at DESC LIMIT 1;"`
    Expected Result: one row, call_type=generate, status=success.
    Evidence: .sisyphus/evidence/task-6-repo-insert.txt

  Scenario: oversized prompt is truncated, not rejected
    Tool: Bash (unit test)
    Steps:
      1. Call record() with a >256KB prompt.
      2. Assert row.prompt_truncated = true and length <= cap.
    Expected Result: truncated flag set; no throw.
    Evidence: .sisyphus/evidence/task-6-repo-truncate.txt
  ```

  **Commit**: YES (6). `feat(repositories): add ArchetypeGenerationCallRepository`.

- [ ] 7. Instrument `archetype-generator.ts` (capture call metadata + recommendation + failures)

  **What to do**:
  - In `callLLMWithJsonRetry` (~`archetype-generator.ts:300-329`), capture the full `CallLLMResult`: `model` (actual), `promptTokens`, `completionTokens`, `estimatedCostUsd`, `latencyMs`, and the retry count — instead of discarding them. Capture the prompt sent and the raw response.
  - Persist via `ArchetypeGenerationCallRepository.record()` for each call (`call_type:'generate'|'refine'`), including failure rows on `GENERATION_FAILED` (status `'failed'`, `error_message` set) — EDGE-1: `archetype_id` is null at this point. One row per LLM call (EDGE-6); set `retry_count`.
  - In `applyModelAndEstimate` (~`:331-363`), log the model recommendation decision (top model + score breakdown) at INFO and persist a `call_type:'recommend_model'` row (recommendation is in-memory, no LLM tokens — record decision + chosen model).
  - All persistence wrapped best-effort (try/catch → `log.warn`), MUST NOT block generation (RISK-F).

  **Must NOT do**:
  - Do NOT refactor the generation logic or change the prompt. ADD capture/persist only.
  - Do NOT store secrets — generator prompt carries toolkit names only; assert in a comment.

  **Recommended Agent Profile**:
  - **Category**: `deep` — careful threading of result metadata without changing behavior.
  - **Skills**: [`data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES. Wave 3 (with 8,9,10,11,14). Blocks: 12,14. Blocked By: 6.

  **References**:
  - `src/gateway/services/archetype-generator.ts:300-329` (callLLMWithJsonRetry), `:331-363` (applyModelAndEstimate).
  - `src/lib/call-llm.ts` — `CallLLMResult` shape (`model`, `promptTokens`, `completionTokens`, `estimatedCostUsd`, `latencyMs`).

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Successful generation persists a full call row
    Tool: Bash (curl to generate route + psql)
    Steps:
      1. POST /admin/tenants/<DozalDevs>/archetypes/generate with a valid description.
      2. `psql ... -c "SELECT call_type,status,model_actual,prompt_tokens,latency_ms FROM archetype_generation_calls ORDER BY created_at DESC LIMIT 1;"`
    Expected Result: call_type=generate, status=success, model_actual non-null, latency_ms non-null.
    Evidence: .sisyphus/evidence/task-7-generate-row.txt

  Scenario: Generation does NOT break when persistence fails
    Tool: Bash (unit test, mock repo.record to throw)
    Steps:
      1. Mock record() to throw; call generate().
      2. Assert generate() still returns a valid config (no throw propagated).
    Expected Result: generation succeeds; a log.warn emitted.
    Evidence: .sisyphus/evidence/task-7-nonblocking.txt
  ```

  **Commit**: YES (groups 7-11). `feat(observability): trace archetype creation LLM calls and edits`.

- [ ] 8. Instrument generate + propose-edit routes (persist attempts incl. failures)

  **What to do**:
  - In `admin-archetype-generate.ts` (~113-123): ensure a row is persisted even when the route returns `422 GENERATION_FAILED` (GAP-6). If the generator already persists (Task 7), confirm no duplication; otherwise persist a route-level failure attempt row with `tenant_id` + `error_message`.
  - In `admin-archetype-propose-edit.ts` (~409-418): persist a `call_type:'propose_edit'` row for each attempt (success + failure), with `archetype_id` (known here) (GAP-7).
  - Best-effort, non-blocking.

  **Must NOT do**: Do NOT change the route's error contract (still 422 GENERATION_FAILED via sendError).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`.
  - **Skills**: [`api-design`], [`data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES. Wave 3. Blocks: 12,14. Blocked By: 5,6.

  **References**:
  - `src/gateway/routes/admin-archetype-generate.ts:113-123`.
  - `src/gateway/routes/admin-archetype-propose-edit.ts:409-418`.

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Failed generation persists a failure attempt row
    Tool: Bash (curl with a description engineered to fail JSON-retry OR mock; + psql)
    Steps:
      1. Trigger a generation failure (422).
      2. `psql ... -c "SELECT status,error_message FROM archetype_generation_calls WHERE status='failed' ORDER BY created_at DESC LIMIT 1;"`
    Expected Result: one failed row with error_message; NO new archetypes row created.
    Evidence: .sisyphus/evidence/task-8-failure-row.txt

  Scenario: propose-edit attempt persists
    Tool: Bash (curl propose-edit + psql)
    Steps:
      1. POST /propose-edit for an existing archetype.
      2. psql: latest row call_type='propose_edit' with that archetype_id.
    Expected Result: row present.
    Evidence: .sisyphus/evidence/task-8-propose-edit.txt
  ```

  **Commit**: YES (groups 7-11).

- [ ] 9. Server-driven edit history on create + direct PATCH; success logs; created_by

  **What to do**:
  - In `POST /admin/tenants/:tenantId/archetypes` (`admin-archetypes.ts:196`): after `prisma.archetype.create`, write an `archetype_edit_history` row server-side with `kind:'create'`, `before_json:{}`, `after_json:<snapshot>`, `request_text:<original description if available>`, `actor_user_id: req.auth?.id ?? null`. Set `created_by: req.auth?.id ?? null` on the archetype (EDGE-3). Add `logger.info` on success with new id + role_name (GAP-4).
  - In `PATCH /admin/tenants/:tenantId/archetypes/:archetypeId` (`:363`): after update, write a server-side history row capturing before/after + `changed_fields` (incl. status flips draft→active — EDGE-2). Add `logger.info` on success with changed field names (GAP-4).
  - Add a guard so the PATCH-originated-from-assistant path does NOT double-write (Task 10 removes the client write; this task makes the server the single writer). Use the same write helper for create + patch + (existing) propose-edit-apply path.
  - All history writes best-effort/non-blocking.

  **Must NOT do**: Do NOT hard-delete; Do NOT change unrelated PATCH validation.

  **Recommended Agent Profile**:
  - **Category**: `deep` — before/after diffing, changed_fields computation, single-writer guarantee.
  - **Skills**: [`api-design`], [`data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES. Wave 3. Blocks: 10,12,14. Blocked By: 6.

  **References**:
  - `src/gateway/routes/admin-archetypes.ts:196,235,363,412`.
  - `src/gateway/routes/admin-archetype-edit-history.ts:145` — existing history write shape (before_json/after_json/changed_fields/kind/request_text).
  - `prisma/schema.prisma` `ArchetypeEditHistory` (~644-663).

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Wizard create writes a kind:'create' history row + created_by
    Tool: Bash (curl create + psql)
    Steps:
      1. POST /archetypes (DozalDevs) with a generated config.
      2. psql: SELECT kind FROM archetype_edit_history WHERE archetype_id=<new> AND kind='create' → 1 row.
      3. psql: SELECT created_by FROM archetypes WHERE id=<new> → populated or NULL (document if SERVICE_TOKEN).
    Expected Result: create row exists; success log emitted.
    Evidence: .sisyphus/evidence/task-9-create-history.txt

  Scenario: status flip draft->active is traced
    Tool: Bash (curl PATCH {status:active} + psql)
    Steps:
      1. PATCH archetype status to active.
      2. psql: SELECT changed_fields FROM archetype_edit_history WHERE archetype_id=<new> ORDER BY created_at DESC LIMIT 1 → includes 'status'.
    Expected Result: status change recorded.
    Evidence: .sisyphus/evidence/task-9-status-flip.txt
  ```

  **Commit**: YES (groups 7-11).

- [ ] 10. Remove AssistantTab client-driven `recordEditHistory`; verify single-writer

  **What to do**:
  - In `dashboard/src/.../AssistantTab.tsx` (~line 200), remove the separate `recordEditHistory` POST after `patchArchetype` — the server (Task 9) now writes history atomically on PATCH. Ensure the apply path still works (PATCH only).
  - Confirm the edit-history list UI tolerates the new `kind:'create'` value (RISK-B) — render a sensible label, no crash on unknown kind.

  **Must NOT do**: Do NOT remove the server `POST /edit-history/:id/revert` (revert still needed). Do NOT change unrelated AssistantTab behavior.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — dashboard/React change + UI tolerance check.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES. Wave 3. Blocks: 12. Blocked By: 9.

  **References**:
  - `dashboard/src/components/.../AssistantTab.tsx:~200` (`recordEditHistory`).
  - `react-dashboard` skill.

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: AssistantTab edit produces exactly ONE history row (no duplicate)
    Tool: Playwright (dashboard) OR curl PATCH simulating assistant apply + psql
    Steps:
      1. Apply one assistant-style edit (PATCH) to an archetype.
      2. psql: SELECT count(*) FROM archetype_edit_history WHERE archetype_id=<id> AND created_at > now()-interval '2 minutes'.
    Expected Result: count = 1 (no double-record).
    Evidence: .sisyphus/evidence/task-10-single-writer.txt

  Scenario: History list renders kind:'create' without crashing
    Tool: Bash (dashboard build) + grep
    Steps:
      1. `pnpm dashboard:build` succeeds.
      2. Confirm a fallback label exists for unknown/`create` kind in the history list component.
    Expected Result: build clean; create rows labeled sensibly.
    Evidence: .sisyphus/evidence/task-10-kind-render.txt
  ```

  **Commit**: YES (10). `refactor(dashboard): server-owned archetype edit history`.

- [ ] 11. Instrument time-estimator + `call-llm` actual-model logging

  **What to do**:
  - In `time-estimator.ts` (~35-43): persist a `call_type:'time_estimate'` row (success + failure), capturing tokens/latency/actual-model from the `CallLLMResult`. Best-effort/non-blocking (GAP-8).
  - In `call-llm.ts` (~243): add a `log.info` (or extend existing) recording the ACTUAL model returned by the provider (`data.model`, ~line 297), not just the requested model (GAP-10).

  **Must NOT do**: Do NOT change the cost circuit breaker or call-llm behavior — logging/capture only.

  **Recommended Agent Profile**:
  - **Category**: `quick`.
  - **Skills**: [`data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES. Wave 3. Blocks: 14. Blocked By: 6.

  **References**: `src/gateway/services/time-estimator.ts:35-43`; `src/lib/call-llm.ts:243,297`.

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: time estimate persists a row; actual model logged
    Tool: Bash (curl create which triggers estimate + psql + log grep)
    Steps:
      1. Create an archetype (triggers TimeEstimator).
      2. psql: latest row call_type='time_estimate'.
      3. grep gateway log for the actual model line from call-llm.
    Expected Result: time_estimate row present; actual model logged.
    Evidence: .sisyphus/evidence/task-11-time-estimate.txt
  ```

  **Commit**: YES (groups 7-11).

- [ ] 14. Unit tests with fault injection for repository + instrumentation

  **What to do**:
  - Add Vitest unit tests under `tests/unit/`: (a) `ArchetypeGenerationCallRepository.record()` inserts + truncates + tolerates null archetype_id; (b) generator persistence is non-blocking when `record()` throws; (c) create/PATCH history single-writer (no duplicate); (d) failure-path persists a failed row.
  - Use existing test helpers/mocks; no live task triggering.

  **Must NOT do**: Do NOT write tests that trigger/execute an employee task.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`.
  - **Skills**: [`data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES. Wave 3. Blocks: F\*. Blocked By: 7,8,9,11.

  **References**: `tests/unit/`, `tests/helpers/lifecycle-mocks.ts` (mock patterns).

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: New unit tests pass; no new failures
    Tool: Bash
    Steps:
      1. `pnpm test:unit -- --run`
    Expected Result: new tests pass; 0 new failures vs baseline.
    Evidence: .sisyphus/evidence/task-14-unit-tests.txt
  ```

  **Commit**: YES (groups 7-11).

- [ ] 12. Real DozalDevs wizard creation (draft → active, NOT triggered) + assert observability

  **What to do**:
  - Go through the REAL creation process for the DozalDevs tenant (`00000000-0000-0000-0000-000000000002`) via the wizard path: describe an employee → generate via `POST /admin/tenants/<DozalDevs>/archetypes/generate` → save via `POST /admin/tenants/<DozalDevs>/archetypes` (draft) → activate via `PATCH ... {status:'active'}`.
  - Use the dashboard wizard UI (`/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000002`) via Playwright OR the equivalent API calls — whichever exercises the full path. Capture the new archetype id.
  - Assert ALL observability artifacts (see scenarios). Also call the brain-preview endpoint to confirm the compiled AGENTS.md bridge artifact is inspectable WITHOUT triggering.

  **Must NOT do**:
  - **MUST NOT trigger/dispatch/execute the employee.** Stop at `status:active`. No `pnpm trigger-task`, no Slack @mention, no task row creation.
  - MUST NOT create employees for any other tenant.

  **Recommended Agent Profile**:
  - **Category**: `deep` — multi-step real flow + thorough assertions.
  - **Skills**: [`creating-archetypes`], [`feature-verification`], [`dev-browser`] (if using Playwright for the wizard UI).

  **Parallelization**: Can Run In Parallel: NO (integration gate). Wave 4. Blocks: 13,15,F\*. Blocked By: 7,8,9,10,11.

  **References**:
  - AGENTS.md § "Adding a New Employee" (wizard path), Dashboard URLs (`/dashboard/employees/new`).
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — AC1-AC8 field-quality checks (apply the CREATION/field-quality portion only; SKIP the triggering/lifecycle portion).
  - `admin-brain-preview.ts:82` — brain-preview endpoint.

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Full creation produces complete observability trail
    Tool: Bash (curl/Playwright) + psql
    Steps:
      1. Generate → Save (draft) → Activate for DozalDevs. Record archetype id.
      2. psql: >=1 archetype_generation_calls row for this tenant in last 10 min with prompt/response/model_actual/tokens/latency non-null.
      3. psql: archetype_edit_history has a kind='create' row for the new id.
      4. psql: archetypes.created_by populated or NULL (documented).
      5. psql: archetypes.status='active' for the new id.
      6. curl brain-preview for the new id → 200 with compiled_agents_md present.
    Expected Result: all assertions pass; NO tasks row created for this archetype.
    Evidence: .sisyphus/evidence/task-12-real-creation.txt

  Scenario: No task was triggered
    Tool: Bash (psql)
    Steps:
      1. psql: SELECT count(*) FROM tasks WHERE archetype_id=<new id> → 0.
    Expected Result: 0 (creation only, no triggering).
    Evidence: .sisyphus/evidence/task-12-no-trigger.txt
  ```

  **Commit**: NO (validation task; no source change).

- [ ] 13. Write combined creation + debugging OpenCode skill

  **What to do**:
  - Create `.opencode/skills/employee-creation-debugging/SKILL.md` (DEV skill — committed, NO Docker rebuild). Frontmatter `name` must match `^[a-z0-9]+(-[a-z0-9]+)*$` (`employee-creation-debugging`), with a triggering `description`.
  - Content (own the connective tissue; cross-reference existing skills, don't duplicate them):
    1. **Wizard vs seed decision** + when to use each (cross-ref `creating-archetypes`).
    2. **Step-by-step wizard creation walkthrough** (generate → save draft → activate), with the DozalDevs example from Task 12.
    3. **Creation-time observability reference**: the new `archetype_generation_calls` table (every column + what it captures), `archetypes.created_by`, server-driven `archetype_edit_history` (incl. `kind:'create'` and status flips). Exact psql + PostgREST verification commands.
    4. **Debugging a bad/failed generation**: how to find the persisted prompt/response/model/error for a given attempt; failure rows; retry visibility.
    5. **The compiled AGENTS.md bridge artifact**: how to inspect via brain-preview / compile-preview WITHOUT triggering; what gets compiled.
    6. **Local vs production**: where creation data lives locally (psql 54322 / PostgREST 54331) vs production (Cloud DB session pooler port 5432, Render gateway logs) — cross-ref `production-ops`.
    7. **Cross-references** to: `creating-archetypes`, `debugging-lifecycle`, `feature-verification`, `production-ops`, `data-access-conventions` at the right handoff points.
  - Use real file paths and the real verification commands implemented in this plan.

  **Must NOT do**: Do NOT document the runtime/triggering debugging as if implemented here (point to existing skills). Do NOT place under `src/workers/skills/` (that's the Docker/employee path).

  **Recommended Agent Profile**:
  - **Category**: `writing`.
  - **Skills**: [`skill-creator`] (skill authoring conventions + description optimization).

  **Parallelization**: Can Run In Parallel: YES (with 15). Wave 4. Blocks: F\*. Blocked By: 12.

  **References**:
  - Existing dev skills in `.opencode/skills/` (format reference): `creating-archetypes/SKILL.md`, `debugging-lifecycle/SKILL.md`, `feature-verification/SKILL.md`, `production-ops/SKILL.md`.
  - `src/workers/lib/agents-md-compiler.mts` (what compiles), `admin-brain-preview.ts` (preview endpoints).

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Skill file valid + references real artifacts
    Tool: Bash
    Steps:
      1. `head -6 .opencode/skills/employee-creation-debugging/SKILL.md` → valid frontmatter (name matches regex, description present).
      2. grep for "archetype_generation_calls", "brain-preview", "created_by", "54331", "5432" → all present.
    Expected Result: valid frontmatter; references the real table/columns/commands.
    Evidence: .sisyphus/evidence/task-13-skill.txt
  ```

  **Commit**: YES (13). `docs(skills): add employee-creation-debugging skill`.

- [ ] 15. Update AGENTS.md + README.md

  **What to do**:
  - AGENTS.md: add `archetype_generation_calls` to the Database section (durable description, not a volatile count); note `archetypes.created_by`; add the new dev skill to the Dev skills table; note that wizard create + direct PATCH now write server-side `archetype_edit_history` (incl. `kind:'create'`); mention `ArchetypeGenerationCallRepository` in the repositories list.
  - README.md: update only if a new npm script or admin endpoint was added (none expected — confirm and skip if so).
  - Follow Documentation Durability rules (no volatile tallies, no line numbers).

  **Must NOT do**: Do NOT add volatile counts or line-number references.

  **Recommended Agent Profile**:
  - **Category**: `writing`.
  - **Skills**: [`writing-guidelines`].

  **Parallelization**: Can Run In Parallel: YES (with 13). Wave 4. Blocks: F\*. Blocked By: 12.

  **References**: AGENTS.md § Database, § Project Structure (repositories), Dev skills table, § Documentation Durability.

  **Acceptance Criteria**:
  - **QA Scenarios**:

  ```
  Scenario: Docs reference the new artifacts, no volatile facts
    Tool: Bash
    Steps:
      1. grep AGENTS.md for "archetype_generation_calls", "created_by", "employee-creation-debugging", "ArchetypeGenerationCallRepository".
      2. Confirm no new "(N)" tallies or "line NNN" references were added in the diff.
    Expected Result: all present; durable phrasing.
    Evidence: .sisyphus/evidence/task-15-docs.txt
  ```

  **Commit**: YES (15). `docs: update AGENTS.md and README for creation observability`.

- [ ] 16. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.
  - After the Final Verification Wave passes AND the user has given explicit okay, run: `tsx scripts/telegram-notify.ts "✅ employee-creation-observability complete — All tasks done. Come back to review results."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1-F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists (read file, query DB, curl PostgREST). For each "Must NOT Have": search for forbidden patterns — confirm NO changes under `src/workers/` or `src/inngest/`, NO task triggering, NO generator refactor, NO hard deletes, NO secrets in the trace table. Check evidence files in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` (or `pnpm build`) + `pnpm lint` + `pnpm test:unit`. Review changed files for: `as any`/`@ts-ignore`, persistence writes NOT wrapped in best-effort try/catch (would block creation = bug), direct `prisma` calls in routes for the new table (must use repository), missing `sendError`/`sendSuccess`, console.log, unused imports.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA Execution** — `unspecified-high`
      From clean state, execute EVERY QA scenario from EVERY task — real DozalDevs wizard creation, assert all observability rows via psql + PostgREST, force a generation failure, run the double-history check. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Failure-path [PASS/FAIL] | Double-history [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything in spec built, nothing beyond spec. Confirm zero changes under `src/workers/`, `src/inngest/`; confirm no employee was triggered; confirm only DozalDevs touched. Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **2**: `feat(db): add archetype_generation_calls table and archetypes.created_by` — schema.prisma, migration; pre-commit: `pnpm lint`
- **6**: `feat(repositories): add ArchetypeGenerationCallRepository` — repo file + test; `pnpm test:unit`
- **7-11**: `feat(observability): trace archetype creation LLM calls and edits` — generator, routes, time-estimator, call-llm; `pnpm test:unit && pnpm lint`
- **10**: `refactor(dashboard): server-owned archetype edit history` — AssistantTab; `pnpm dashboard:build`
- **13**: `docs(skills): add employee-creation-debugging skill` — SKILL.md
- **15**: `docs: update AGENTS.md and README for creation observability` — AGENTS.md, README.md

## Success Criteria

### Verification Commands

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d archetype_generation_calls"  # table exists
curl -s "http://localhost:54331/archetype_generation_calls?limit=1" -H "apikey: $SUPABASE_ANON_KEY" -o /dev/null -w "%{http_code}\n"  # 200 not 404
pnpm test:unit -- --run  # 0 new failures
pnpm lint  # clean
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (esp. no runtime/harness changes, no triggering)
- [ ] All tests pass
- [ ] Skill documents real table/columns + real verification commands
