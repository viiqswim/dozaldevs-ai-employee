# Learnings — employee-creation-observability

## [2026-06-13] Session Start

- Plan: 16 impl tasks + 4 final wave tasks
- DozalDevs tenant: `00000000-0000-0000-0000-000000000002`
- Local DB: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- Local PostgREST: `http://localhost:54331`
- Container name: `shared-postgres`
- MUST NOT touch: src/workers/, src/inngest/, opencode-harness.mts
- MUST NOT trigger/execute any employee
- All persistence is best-effort/non-blocking (try/catch → log.warn)
- archetype_id is nullable on archetype_generation_calls (EDGE-1: failures before archetype exists)
- created_by is nullable (EDGE-3: SERVICE_TOKEN has no user)
- Prompt/response capped at 256KB with truncated boolean flag
- One row per LLM call (not per creation) — EDGE-6
- Server owns ALL archetype_edit_history writes; AssistantTab client call removed
- kind:'create' is additive string value (no enum migration needed)

## Task 2 — Schema Migration (2026-06-13)

### Shadow DB blocker

`pnpm prisma migrate dev` fails with P3006 (shadow DB issue) because the existing migration `20260601214116_add_rls_policies` enables RLS on `_prisma_migrations` table — which doesn't exist when Prisma creates a fresh shadow DB. Both `--create-only` and normal `migrate dev` are blocked.

### Workaround used

1. `pnpm prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` to generate the correct SQL
2. Manually wrote a focused migration SQL file (only ADD/CREATE, no drops)
3. Applied directly via `psql ... -f migration.sql`
4. Registered in `_prisma_migrations` table manually with SHA256 checksum via `sha256sum` + INSERT
5. Reloaded PostgREST schema cache with `NOTIFY pgrst, 'reload schema'`

### Checksum format

Prisma uses SHA256 hex (64-char string) for migration checksums. Use `sha256sum <file> | cut -d' ' -f1`.

### Migration file location

`prisma/migrations/20260613220000_archetype_generation_calls/migration.sql`

## Task 6 — ArchetypeGenerationCallRepository (2026-06-13)

### File created

`src/repositories/ArchetypeGenerationCallRepository.ts` (PascalCase per task spec; note existing repos are kebab-case e.g. `task-repository.ts`).

### Conventions followed

- Repos use `import type { PrismaClient } from '@prisma/client'` + constructor injection (`constructor(private readonly prisma: PrismaClient) {}`). No singleton import — caller passes prisma (e.g. `new EmployeeRuleRepository(prisma)` in slack/handlers/index.ts).
- Methods are bare (NO per-method JSDoc) — matches task-repository.ts / employee-rule-repository.ts exactly. The comment-hook flags method docstrings; keep only file-header + magic-number + EDGE-traceability comments.
- Prisma model accessor is `prisma.archetypeGenerationCall` (camelCase of `ArchetypeGenerationCall`).

### Truncation

`capText()` uses `Buffer.byteLength(text,'utf8') > 262144` then `text.slice(0, MAX_SIZE)`. Note: slice is by UTF-16 code units, so for multibyte text the stored byte length can be <262144 but never >; ASCII test confirmed exactly 262144 bytes. Truncated flag set correctly.

### LSP vs tsc gotcha (IMPORTANT)

After `pnpm prisma generate`, the opencode LSP keeps a STALE in-memory PrismaClient type and reports `Property 'archetypeGenerationCall' does not exist` — FALSE POSITIVE. The typescript-language-server also fails to boot here (`.tool-versions` has no `typescript` entry → exit 126). Authoritative check is `npx tsc --noEmit -p tsconfig.json | grep <file>` → empty = clean. Runtime (`npx tsx`) is the real proof.

### Verification done

- Direct Prisma insert: id 266ee028... ✓
- Repository class record()/linkArchetype() via tsx: prompt_truncated=true (300KB), response_truncated=false, archetype_id null accepted (EDGE-1), created_by null accepted (EDGE-3), linkArchetype updates archetype_id ✓
- psql byte-length proof: octet_length(prompt)=262144 exactly when truncated. Evidence: `.sisyphus/evidence/task-6-repo-insert.txt`

### Test-script tip

tsx scripts in `/tmp` CANNOT resolve repo node_modules (ERR_MODULE_NOT_FOUND). Put scratch `.mts` inside project tree (e.g. `.sisyphus/evidence/`) and rm after. Import path from there: `../../src/repositories/...js`.

## Task 7: archetype-generator.ts instrumentation (2026-06-14)

### Pattern used

- Added optional `repo?: ArchetypeGenerationCallRepository` to `ArchetypeGenerator` constructor
- Added optional `generationContext?: { tenantId: string; createdBy?: string | null }` to `generate()` and `refine()` — backward-compat (no breaking changes)
- Added private `_persistCall()` helper that wraps repo.record() in try/catch → log.warn (best-effort)
- `callLLMWithJsonRetry()` got optional `callContext` 3rd param — persists a row after each successful `callLLMFn` invocation (retry_count: 0 for initial, 1 for LLM retry)
- `applyModelAndEstimate()` got optional `generationContext` — persists `call_type: 'recommend_model'` + logs INFO with model/totalScore
- Failure rows in `generate()` and `runRefineCall()` catch blocks (no model/tokens since LLM threw)

### Route wiring

- `admin-archetype-generate.ts`: creates `ArchetypeGenerationCallRepository(prisma)`, passes to generator constructor
- Builds `generationContext = { tenantId, createdBy: req.auth?.id ?? null }` per-request
- Passes to both `generator.generate()` and `generator.refine()`

### EDGE-1

- `archetype_id` is always null at generation time — archetype doesn't exist yet
- `linkArchetype()` is called later (from the save/persist route, not the generate route)

### EDGE-3

- SERVICE_TOKEN has no user → `req.auth?.id` is undefined → `createdBy` = null

### What the LLM-empty-content failure looks like

- When LLM returns empty content, `callLLM` throws before returning result
- `_persistCall` inside `callLLMWithJsonRetry` never fires (throws before that line)
- `generate()` catch block fires instead with status:'failed', error_message from the thrown error
- Evidence: `.sisyphus/evidence/task-7-generate-row.txt` shows `generate | failed | LLM returned empty content`

### Unit test compatibility

- All 163 test files pass — existing mocks return `CallLLMResult` shape, `_persistCall` is no-op when `callContext` is undefined

## Task 8: admin-archetype-propose-edit.ts instrumentation (2026-06-14)

### Pattern used (route-level, NOT generator-level)

- propose-edit route constructs `ArchetypeGenerator(opts.callLLM)` WITHOUT the repo and passes NO generationContext to refine() — so the generator's internal \_persistCall writes ZERO rows here. Route-level persistence is the ONLY source of `propose_edit` rows.
- Instantiated `generationCallRepo = new ArchetypeGenerationCallRepository(prisma)` in the route factory.
- SUCCESS row: right after `generator.refine()` returns, before applyAllowlist(). try/catch -> logger.warn.
- FAILURE row: at TOP of the existing catch block, BEFORE the GENERATION_FAILED/500 branching — so error contract is byte-identical. try/catch -> logger.warn.

### archetype_id is KNOWN here (unlike generate)

- It's a path param (`/archetypes/:archetypeId/propose-edit`), destructured as `archetypeId` alongside `tenantId` BEFORE the try block → in scope in catch. Pass it directly (no linkArchetype dance needed).

### refine() return shape limitation

- `generator.refine()` returns `GenerateArchetypeResponse` which has `.model` (string) but NOT promptTokens/completionTokens/estimatedCostUsd/latencyMs — those CallLLMResult fields live only inside the generator's \_persistCall. Task spec example referenced result.promptTokens etc. but those DON'T exist on this return type. Route row sets `model_actual: rawProposal.model ?? null` only; token/cost/latency default to null in repo. Including non-existent props would break tsc.

### This file uses `logger` not `log`

- `const logger = createLogger('admin-archetype-propose-edit')` at module top. Sibling generate route also uses `logger`. (archetype-generator.ts uses `log`.)

### Comment hook

- Kept ONE necessary comment on the success-path try ("Best-effort instrumentation — never block the route...") — documents a deliberate invariant (the repo file header codifies the same best-effort contract). Omitted it on the failure path to minimize noise. Hook acknowledged as priority-3 necessary.

### Verification

- `npx tsc --noEmit` clean on admin-archetype-propose-edit.ts (TSC_CLEAN_ON_FILE).
- Full suite: 163 files passed, 1895 passed, 9 skipped, 0 fail. First run had 2 'socket hang up' flakes in UNRELATED github-oauth.test.ts; isolated + full re-run both green.
- The stale-LSP archetypeGenerationCall false-positive (Task 6 note) reappeared on save — IGNORE, tsc is authoritative.
- Evidence: `.sisyphus/evidence/task-8-propose-edit.txt`

## Task 9 — Server-driven history writes

- `created_by` is in the Prisma schema (migration `20260613220000_archetype_generation_calls`) but the LSP server has a stale cache; `npx tsc --noEmit` is the reliable type-check tool
- `pnpm prisma generate` outputs to `node_modules/.pnpm/@prisma+client@*/...` — the `.prisma/client/default.d.ts` file was empty (0 bytes) before regeneration; after, `tsc` accepted `created_by`
- `existing` is already fetched in the PATCH handler for the 404 check — reuse it as `before_json` without an extra DB query
- `Object.keys(bodyResult.data)` gives the correct changed_fields set for PATCH (the validated body keys)
- History writes are wrapped in try/catch + logger.warn — never throw, never block the main response
- `kind: 'create'` works as a plain string ('edit'|'revert'|'create') — the schema field is String not an enum

## Task 10: Client-driven history removal + kind:'create' UI support

- `recordEditHistory` was called client-side in `AssistantTab.handleApprove` after `patchArchetype`.
  Now that Task 9 made the server write history on PATCH, the client call was redundant.
- Removed: `beforeJson` variable, `requestText` lookup, `historyPayload` object, `recordEditHistory` call.
- The `EditHistoryRow.kind` type was `'edit' | 'revert'` — added `'create'` to the union in types.ts.
- EditHistoryList gracefully handles `kind:'create'`:
  - Shows `✦` prefix before `request_text`
  - Hides Revert button (no previous state to revert to for creation entries)
  - No crash, no blank render.
- Build passed clean after all changes.

## Task 11 — TimeEstimator instrumentation + call-llm actual-model logging

### Pattern: per-request estimator instantiation

- `TimeEstimator` is created at route-level in `adminArchetypesRoutes()` but `tenantId` is only available per-request.
- Solution: removed the shared `estimator` variable; create `new TimeEstimator(callLLM, callGenerationRepo, tenantId)` inline at each of the two call sites (POST create and PATCH update).
- `callGenerationRepo` is created once at route-level (shared, stateless).

### call-llm.ts actual-model logging (GAP-10)

- Added `createLogger('call-llm').info({ actualModel, requestedModel: effectiveModel }, 'Gateway LLM call — actual model')` immediately after `const actualModel = data.model` (line 308).
- Uses inline `createLogger('call-llm')` pattern (same as existing warn calls in that file — no module-level `log` variable).

### Pre-existing LSP error in admin-archetypes.ts

- `created_by` field at line 201 triggers a Prisma type error — pre-existing, not introduced by Task 11.
- `npx tsc --noEmit` grep on changed files shows zero errors for our changes.

### Backward compat

- `TimeEstimator` constructor: `(callLLMFn, repo?, tenantId?)` — existing callers passing only `callLLMFn` still work.
- Persistence is fully best-effort: both success and failure paths wrap `repo.record()` in try/catch → log.warn.

## Task 14: Vitest fault-injection tests (2026-06-14)

### Files created

- `tests/unit/repositories/archetype-generation-call-repository.test.ts` (11 tests)
- `tests/unit/gateway/archetype-generator-instrumentation.test.ts` (5 tests)

### CRITICAL — generate() signature is POSITIONAL, not an object

- Task spec / inherited wisdom said `generate({ description, tenantId, availableTools })` — WRONG. The real signature is `generate(description: string, catalog?, composioContext?, generationContext?)`.
- `generationContext = { tenantId: string; createdBy?: string | null }` is the 4th positional arg. Call: `gen.generate('desc', undefined, undefined, { tenantId, createdBy })`.
- ALWAYS verify the real source signature; do not trust the task-card example shape.

### Dual-LLM-call routing mock (reused from archetype-generator-repair.test.ts)

- `generate()` fires callLLM TWICE: once for generation, once for the internal `TimeEstimator` (inside `applyModelAndEstimate`). A naive single-return mock makes the estimator consume the generation JSON.
- Solution: route by the estimator's system-prompt prefix `'You estimate manual task duration'` → return `'15'`; everything else returns the generation content. Pattern copied verbatim from the sibling repair test (ESTIMATOR_SYSTEM_PREFIX).

### Repo mock must be TYPED or tsc fails on .mock.calls[0]

- `record: vi.fn(async () => ({ id: 'call-1' }))` → `mock.calls[0]` is typed `[]` (no params) → tsc errors "Tuple of length 0 has no element at index 0".
- Fix: type the mock param explicitly: `record: vi.fn(async (_input: RecordInput) => ({ id: 'call-1' }))`. Then `c[0]` is `RecordInput` and `.find(row => row.status === 'failed')` type-checks with no cast.

### Fault injection patterns proven

- (f) repo throws → `record()` rejects: `prisma.archetypeGenerationCall.create.mockRejectedValue(...)` then `await expect(repo.record(...)).rejects.toThrow()`. The repo itself does NOT swallow — caller owns try/catch.
- (g) non-blocking: `repo.record.mockRejectedValue(...)` + assert `generate()` STILL returns a valid config. The generator's `_persistCall` swallows via try/catch → log.warn.
- (h) failure row: mock generation LLM to throw → assert `repo.record` called with `status:'failed'` + `error_message` contains the thrown message. Find it via `repo.record.mock.calls.map(c=>c[0]).find(r=>r.status==='failed')`.

### Truncation tests (b)

- `'x'.repeat(300000)` (300KB ASCII) → `prompt_truncated:true`, stored `prompt.length === 262144` (MAX_SIZE). Also tested response truncation + exact-boundary (`'z'.repeat(262144)` → NOT truncated).
- Inspect create args via `prisma.archetypeGenerationCall.create.mock.calls[0][0].data` cast.

### LSP false positives (confirmed AGAIN — Task 6/11 note holds)

- LSP reports `Property 'archetypeGenerationCall' does not exist on PrismaClient` + `created_by does not exist` (in admin-archetypes.ts line 201) — STALE cache, FALSE.
- `npx tsc --noEmit -p tsconfig.json | grep <testfile>` → empty = authoritative clean. Confirmed both new test files clean.

### Log noise ≠ failures

- The full run emits MANY `level:40/50` pino lines (audit insert failed, GENERATION_FAILED, etc.) — these are the SOURCE code's own best-effort logging firing under fault injection. NOT test failures. Grep for `Test Files`/`Tests ` lines for the real result.

### Result

- Full suite: 165 files passed, 1911 passed, 9 skipped, 0 fail (was 1895 passed before — +16 new tests). No `console.log` used.

## Task 12: Real DozalDevs Wizard Creation (2026-06-14)

### New Archetype Created
- **ID**: `a360b2e6-7dcc-410d-a17b-8d51e21c74ed`
- **role_name**: `daily-motivation`
- **tenant**: DozalDevs (`00000000-0000-0000-0000-000000000002`)
- **model**: `minimax/minimax-m2.7`
- **status**: active (after PATCH)

### API Field Mapping (Critical Learning)
- The generate endpoint returns BOTH `execution_steps` AND `instructions` (same content)
- The create endpoint Zod schema REQUIRES `instructions` (not `execution_steps`)
- Missing `instructions` → INVALID_REQUEST with `{"path":["instructions"],"message":"Invalid input: expected string, received undefined"}`
- Solution: include both `instructions` AND `execution_steps` in create payload

### Observability Assertions (All PASS)
1. `archetype_generation_calls`: call_type=generate, status=success, model_actual=deepseek-v4-flash, prompt_tokens=5585, latency_ms=49723
2. `archetype_edit_history`: kind='create' row written at create time; kind='edit' row written at PATCH/activate
3. `archetypes.status`: 'active' confirmed after PATCH
4. `tasks count`: 0 — employee not triggered
5. `brain-preview`: returns 200, compiled_agents_md=2279 chars starting with employee identity

### create payload note
- The PATCH activation also creates an `archetype_edit_history` row with kind='edit'
- `archetype_edit_history` captures BOTH creation and subsequent edits automatically
- `created_by` is null when using SERVICE_TOKEN (no user identity)

### archetype_generation_calls note
- The generate call uses gateway LLM (deepseek-v4-flash, the platform setting) for generation itself
- model_actual field captures the gateway LLM model, not the execution model (minimax/minimax-m2.7)
- time_estimate call failed (non-blocking — archetype still created successfully)

## Task 13: employee-creation-debugging skill (2026-06-14)

### File created

`.opencode/skills/employee-creation-debugging/SKILL.md`

### Structure

7 sections as specified:
1. Wizard vs Seed decision
2. Step-by-step wizard creation (3-step API flow with real curl commands)
3. Creation-time observability reference (archetype_generation_calls columns, edit_history, psql queries)
4. Debugging bad/failed generation (failed rows, retry_count, prompt inspection)
5. Compiled AGENTS.md bridge artifact (brain-preview, compile-preview)
6. Local vs Production artifact access table
7. Cross-references to sibling skills

### Key content decisions

- Used real archetype ID `a360b2e6-7dcc-410d-a17b-8d51e21c74ed` and real assertion data from Task 12 evidence
- Documented the `instructions` field requirement (critical gotcha from Task 12)
- Noted that `model_actual` captures the gateway LLM (deepseek-v4-flash), not the execution model (minimax/minimax-m2.7)
- Noted that `time_estimate` failures are non-blocking
- Kept production section as a cross-reference to `production-ops` (no duplication)
- LSP errors on ArchetypeGenerationCallRepository are known stale-cache false positives (Task 6 note)

### Grep verification

All 5 required terms present: archetype_generation_calls (8 matches), brain-preview (5 matches), created_by (5 matches), 54331 (2 matches), 5432 (4 matches)

## Task 15: AGENTS.md documentation update (2026-06-14)

### Changes made

Four edits to AGENTS.md:

1. **Database section — `archetypes` table**: Added `created_by String? @db.Uuid` (nullable — null when created via SERVICE_TOKEN).

2. **Database section — `archetype_edit_history` table**: Updated `kind` field to include `'create'` value (`'create' | 'edit' | 'revert'`). Expanded description to note server-driven writes: wizard create writes `kind:'create'`, every PATCH writes `kind:'edit'`. AI Assistant conversational editing also writes `kind:'edit'` via the same mechanism.

3. **Database section — new `archetype_generation_calls` table**: Added full column list and description as a new bullet after `archetype_edit_history`.

4. **Dev skills table**: Added `employee-creation-debugging` row after `long-running-commands`.

5. **Skills System "If you are about to..." table**: Added trigger row for `employee-creation-debugging` after `long-running-commands`.

6. **Project Structure repositories**: Added `ArchetypeGenerationCallRepository` to the repositories line.

### Grep verification (all pass)

- `archetype_generation_calls`: line 363 (table entry)
- `employee-creation-debugging`: lines 127 (skills trigger table) + 157 (dev skills table)
- `ArchetypeGenerationCallRepository`: line 467 (project structure)
- `created_by`: line 354 (archetypes table) + line 363 (archetype_generation_calls table)

### README.md

No changes needed — no new npm scripts or admin API endpoints were added in this plan (instrumentation was added to existing routes only).
