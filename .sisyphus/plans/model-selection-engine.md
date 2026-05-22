# Model Selection Engine

## TL;DR

> **Quick Summary**: Replace the hardcoded MiniMax M2.7 assignment with a data-driven model recommendation engine that auto-profiles archetype needs and suggests the optimal LLM from a curated catalog, with 2-3 plain-language user questions for business context.
>
> **Deliverables**:
>
> - `model_catalog` DB table with Prisma migration and seed data (3 initial models)
> - Task Profile Analyzer: reads archetype definition → infers requirements
> - Matching Engine: filter → score → rank → top-3 recommendation
> - Admin CRUD API for model catalog management
> - Dashboard: Model Catalog admin page + recommendation cards in employee creation + model selector in advanced tab
> - 2-3 non-technical user questions integrated into employee creation flow
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 5 → Task 6 → Task 7 → Task 9 → Task 11 → F1-F4

---

## Context

### Original Request

"At the moment, we are using the Minimax M2.7 model for all AI employees, regardless of the task they are going to be undertaking, which seems like a bit much. There are other models, even free ones, that would perform certain AI employee tasks perfectly. I'm thinking of an engine that, as an AI employee is being created, determines what model to use to optimize for cost and performance."

### Interview Summary

**Key Discussions**:

- **Selection timing**: At archetype creation (not per-task dynamic routing) — simpler, avoids compound error rates from dynamic routing
- **Inference approach**: Hybrid — 80% auto-inference from archetype definition, 20% from 2-3 plain-language user questions for business context
- **Model catalog**: DB table with manually curated metrics (admin reads benchmarks from Artificial Analysis, enters scores manually — no auto-refresh from OpenRouter)
- **Tier classification**: Computed from raw metrics using threshold rules (not admin-assigned tiers)
- **Quality data source**: Artificial Analysis (artificialanalysis.ai/leaderboards/models) for quality benchmarks; OpenRouter model page UI for tool call error rates
- **Recommendation UX**: Top 3 options compared — recommended + cheaper alternative + premium alternative
- **Scope**: Execution model only — verification model (claude-haiku-4-5) stays hardcoded
- **Cost tracking**: Already works for ANY model via OpenRouter response data in session transcripts — NO changes needed to call-llm.ts or cost tracking
- **Profile labels** (Free Agent, Budget Workhorse, etc.): Deferred to Phase 2

**Research Findings**:

- `archetypes.model` is a free-form `String?` — no enum constraint
- `archetype-generator.ts` line 215 hardcodes `result.model = 'minimax/minimax-m2.7'` via `postProcess()` — MUST REMOVE
- `admin-archetypes.ts` line ~78 has `z.enum(['minimax/minimax-m2.7', 'anthropic/claude-haiku-4-5'])` — MUST EXPAND to allow any catalog model
- `call-llm.ts` `PRICING_PER_1M_TOKENS` (lines 31-34) is ONLY for gateway verification calls — NOT for execution cost tracking — DO NOT MODIFY
- `session-manager.ts` `extractUsage()` at line 415 reads cost from OpenCode transcript (works for any model already)
- `opencode-harness.mts` reads `archetype.model` and injects via env var — no changes needed
- Dashboard `GenerateArchetypeResponse` type has literal `model: 'minimax/minimax-m2.7'` — MUST CHANGE to `string`

### Metis Review

**Identified Gaps** (all addressed):

- `postProcess()` override would silently overwrite engine recommendations → Task 11 removes it
- `z.enum` validation would reject new models → Task 12 expands it
- PATCH endpoint must also accept new models → Task 12 covers both POST and PATCH
- Model catalog cold-start risk → Task 5 seeds 3 initial models with real benchmarks
- Dashboard type mismatch → Task 13 fixes `GenerateArchetypeResponse`

---

## Work Objectives

### Core Objective

Build a model selection engine that recommends the optimal LLM for each AI employee based on auto-profiled task requirements and a curated model catalog, replacing the one-size-fits-all MiniMax M2.7 assignment.

### Concrete Deliverables

- Prisma `ModelCatalog` model + migration
- `src/lib/model-selection/` module: types, tier computation, profiler, matcher
- `src/gateway/routes/admin-model-catalog.ts` CRUD API
- `src/gateway/routes/admin-archetypes.ts` recommendation endpoint
- `prisma/seed.ts` with 3 initial model entries
- `dashboard/src/pages/ModelCatalogPage.tsx` admin UI
- Recommendation cards + user questions in employee creation flow
- Updated model selector (SearchableSelect) in employee advanced tab

### Definition of Done

- [ ] `pnpm test -- --run` passes (all existing + new tests)
- [ ] `pnpm build` succeeds
- [ ] `pnpm lint` passes
- [ ] Creating a new employee shows 3 user questions and top-3 model recommendations
- [ ] Admin can CRUD model catalog entries via dashboard
- [ ] Selecting a recommended model correctly persists to archetype.model
- [ ] No hardcoded `minimax/minimax-m2.7` remaining except in seed data and existing archetypes

### Must Have

- Model catalog table with quality metrics (Artificial Analysis benchmarks + tool error rates)
- Task profile auto-inference from archetype definition (system_prompt, instructions, deliverable_type)
- Scoring/ranking algorithm producing top-3 recommendations
- 2-3 plain-language user questions during employee creation
- Admin CRUD for catalog management
- Removal of `postProcess()` model override

### Must NOT Have (Guardrails)

- ❌ Auto-refresh from OpenRouter API — catalog is manually managed
- ❌ Per-task dynamic model routing — selection is one-time at creation
- ❌ Changes to `call-llm.ts` pricing or cost tracking — already works for any model
- ❌ Verification model selection — claude-haiku-4-5 stays hardcoded
- ❌ Profile labels (Free Agent, Budget Workhorse, etc.) — deferred to Phase 2
- ❌ AI-slop: excessive JSDoc, over-abstraction, generic variable names (data/result/item/temp)
- ❌ Employee-specific language in shared files (per AGENTS.md convention)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests after implementation)
- **Framework**: Vitest (`pnpm test -- --run`)
- **Strategy**: Unit tests for pure functions (tier computation, profiler, matcher), API tests for CRUD + recommendation endpoints

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **Library/Module**: Use Bash (bun/node REPL or vitest) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent, start immediately):
├── Task 1: Prisma schema + migration for model_catalog [quick]
├── Task 2: Shared types + constants (TaskProfile, tiers, scoring weights) [quick]
├── Task 3: Tier computation pure functions [quick]
├── Task 4: Model catalog CRUD API routes [unspecified-high]
└── Task 5: Seed data for 3 initial models [quick]

Wave 2 (Core Engine — depends on Wave 1 types/schema):
├── Task 6: Task Profile Analyzer [deep]
├── Task 7: Matching Engine (filter → score → rank → top-3) [deep]
└── Task 8: User questions + recommendation endpoint [unspecified-high]

Wave 3 (Integration — wiring engine into existing flows):
├── Task 9: Wire engine into archetype creation flow [unspecified-high]
├── Task 10: Remove postProcess() model override [quick]
├── Task 11: Expand API validation schemas (POST + PATCH) [quick]
└── Task 12: Fix dashboard GenerateArchetypeResponse type [quick]

Wave 4 (Dashboard UI — depends on API being ready):
├── Task 13: Model Catalog admin page [visual-engineering]
├── Task 14: Recommendation display in employee creation [visual-engineering]
├── Task 15: Model selector in Advanced tab (SearchableSelect) [visual-engineering]

Wave 5 (Tests + Notification):
├── Task 16: Unit + API tests [unspecified-high]
└── Task 17: Telegram notification [quick]

Wave FINAL (4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks            | Wave |
| ---- | ---------- | ----------------- | ---- |
| 1    | —          | 4, 5, 6, 7, 8, 9  | 1    |
| 2    | —          | 3, 6, 7, 8, 9, 12 | 1    |
| 3    | 2          | 7                 | 1    |
| 4    | 1, 2       | 13                | 1    |
| 5    | 1          | 7, 8              | 1    |
| 6    | 1, 2       | 7, 8              | 2    |
| 7    | 2, 3, 5, 6 | 8, 9, 14          | 2    |
| 8    | 2, 6, 7    | 9, 14             | 2    |
| 9    | 7, 8       | 14                | 3    |
| 10   | —          | 9                 | 3    |
| 11   | 2          | 9                 | 3    |
| 12   | 2          | 14, 15            | 3    |
| 13   | 4          | —                 | 4    |
| 14   | 8, 9, 12   | —                 | 4    |
| 15   | 12         | —                 | 4    |
| 16   | 1-15       | —                 | 5    |
| 17   | 16         | —                 | 5    |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1 `quick`, T2 `quick`, T3 `quick`, T4 `unspecified-high`, T5 `quick`
- **Wave 2**: 3 tasks — T6 `deep`, T7 `deep`, T8 `unspecified-high`
- **Wave 3**: 4 tasks — T9 `unspecified-high`, T10 `quick`, T11 `quick`, T12 `quick`
- **Wave 4**: 3 tasks — T13 `visual-engineering`, T14 `visual-engineering`, T15 `visual-engineering`
- **Wave 5**: 2 tasks — T16 `unspecified-high`, T17 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Prisma Schema + Migration for `model_catalog`

  **What to do**:
  - Add a new `ModelCatalog` model to `prisma/schema.prisma` with these columns:
    - `id` (UUID, default cuid)
    - `model_id` (String, unique) — e.g. `minimax/minimax-m2.7`
    - `display_name` (String) — e.g. "MiniMax M2.7"
    - `provider` (String) — e.g. "minimax", "tencent", "openrouter"
    - `description` (String, optional) — short description of the model
    - `context_window` (Int) — max tokens
    - `input_cost_per_million` (Float) — USD per 1M input tokens
    - `output_cost_per_million` (Float) — USD per 1M output tokens
    - `is_free` (Boolean, default false)
    - `throughput_tokens_per_sec` (Float, optional) — median tokens/sec from AA
    - `latency_seconds` (Float, optional) — time-to-first-token from AA
    - `tool_call_error_rate` (Float, optional) — from OpenRouter model page UI (0.0 to 1.0)
    - `structured_output_error_rate` (Float, optional) — from OpenRouter (0.0 to 1.0)
    - `quality_index` (Float, optional) — AA Intelligence Index (0-100)
    - `agentic_score` (Float, optional) — AA GDPval-AA (0-100)
    - `tool_use_score` (Float, optional) — AA τ²-Bench (0-100)
    - `instruction_following_score` (Float, optional) — AA IFBench (0-100)
    - `non_hallucination_rate` (Float, optional) — AA (0-100)
    - `supports_tools` (Boolean, default false)
    - `supports_structured_output` (Boolean, default false)
    - `is_active` (Boolean, default true) — soft toggle (different from deleted_at)
    - `notes` (String, optional) — admin notes
    - `tenant_id` (String) — FK to tenants (multi-tenancy per AGENTS.md convention)
    - `created_at` (DateTime, default now)
    - `updated_at` (DateTime, updatedAt)
    - `deleted_at` (DateTime, optional) — soft delete per AGENTS.md convention
  - Add `@@index([tenant_id])` and `@@unique([tenant_id, model_id])` for multi-tenant scoping
  - Run `pnpm prisma migrate dev --name add_model_catalog`
  - Verify migration applies cleanly

  **Must NOT do**:
  - Do NOT add computed tiers as stored columns — tiers are derived at runtime
  - Do NOT add profile labels — deferred to Phase 2
  - Do NOT add any auto-refresh or sync mechanism

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file schema change + migration, well-defined structure
  - **Skills**: []
    - No special skills needed — standard Prisma work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 4, 5, 6, 7, 8, 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` — Follow existing model patterns (e.g. `Archetype` model for naming, casing, and relation conventions). Note `tenant_id` pattern from other tenant-scoped models.

  **API/Type References**:
  - `prisma/schema.prisma` — Look at how `KnowledgeBaseEntry` does `tenant_id` + `deleted_at` + `@@index` for the multi-tenant soft-delete pattern

  **External References**:
  - Artificial Analysis leaderboard: `https://artificialanalysis.ai/leaderboards/models` — column names map to these benchmark names

  **WHY Each Reference Matters**:
  - The existing Prisma schema defines the project's naming conventions (camelCase fields, snake_case table via `@@map`). Follow exactly.
  - The `tenant_id` + `deleted_at` pattern is critical — every table must be tenant-scoped and soft-deletable per AGENTS.md.

  **Acceptance Criteria**:
  - [ ] `pnpm prisma migrate dev` completes successfully
  - [ ] `pnpm build` passes
  - [ ] `SELECT * FROM model_catalog LIMIT 0` runs without error in psql

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Migration applies cleanly
    Tool: Bash
    Preconditions: Database is running at localhost:54322
    Steps:
      1. Run: pnpm prisma migrate dev --name add_model_catalog
      2. Run: docker exec shared-postgres psql -U postgres -d ai_employee -c "\d model_catalog"
      3. Assert: Output shows all expected columns with correct types
      4. Assert: unique constraint on (tenant_id, model_id) exists
    Expected Result: Migration succeeds, table has all 23 columns, unique constraint present
    Failure Indicators: Migration fails, missing columns, wrong types
    Evidence: .sisyphus/evidence/task-1-migration-applies.txt

  Scenario: Build still passes after schema change
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: pnpm build
      2. Assert: Exit code 0, no TypeScript errors
    Expected Result: Clean build
    Failure Indicators: Type errors from Prisma client generation
    Evidence: .sisyphus/evidence/task-1-build-passes.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add model_catalog table with quality metrics`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*`
  - Pre-commit: `pnpm build`

- [x] 2. Shared Types + Constants

  **What to do**:
  - Create `src/lib/model-selection/types.ts` with:
    - `CostTier`: `'free' | 'budget' | 'standard' | 'premium'`
    - `QualityTier`: `'basic' | 'capable' | 'advanced' | 'frontier'`
    - `SpeedGrade`: `'slow' | 'moderate' | 'fast'`
    - `ToolReliability`: `'unreliable' | 'usable' | 'reliable' | 'rock_solid'`
    - `TaskProfile` interface: `{ toolIntensity: 'none' | 'light' | 'heavy', outputQualityBar: 'low' | 'medium' | 'high', contextNeeds: 'small' | 'medium' | 'large', latencySensitivity: 'relaxed' | 'normal' | 'critical', costSensitivity: 'low' | 'medium' | 'high', domain: string | null }`
    - `UserAnswers` interface: `{ audience: 'external' | 'internal', frequency: 'frequent' | 'daily' | 'rare', speedPreference: 'fast' | 'relaxed' }`
    - `ModelScore` interface: `{ modelId: string, displayName: string, totalScore: number, breakdown: { quality: number, cost: number, speed: number, toolReliability: number }, tiers: { cost: CostTier, quality: QualityTier, speed: SpeedGrade, toolReliability: ToolReliability }, costEstimate: { perTaskUsd: number, monthlyUsd: number | null } }`
    - `ModelRecommendation` interface: `{ recommended: ModelScore, cheaperAlternative: ModelScore | null, premiumAlternative: ModelScore | null }`
  - Create `src/lib/model-selection/constants.ts` with:
    - Cost tier thresholds: `COST_TIER_THRESHOLDS = { free: 0, budget: 0.5, standard: 3.0 }` (average of input+output per 1M)
    - Quality tier thresholds: `QUALITY_TIER_THRESHOLDS = { basic: 40, capable: 60, advanced: 80 }` (weighted composite)
    - Speed grade thresholds: `SPEED_GRADE_THRESHOLDS = { slow: 15, moderate: 40 }` (tokens/sec) + latency cutoff 3s
    - Tool reliability thresholds: `TOOL_RELIABILITY_THRESHOLDS = { unreliable: 0.05, usable: 0.02, reliable: 0.01 }` (error rate)
    - Scoring weights: `SCORING_WEIGHTS = { quality: 0.35, cost: 0.25, speed: 0.15, toolReliability: 0.25 }` (default — adjusted by profile)
    - Quality composite weights: `QUALITY_COMPOSITE_WEIGHTS = { qualityIndex: 0.2, agenticScore: 0.3, toolUseScore: 0.25, instructionFollowingScore: 0.15, nonHallucinationRate: 0.1 }`
  - Create `src/lib/model-selection/index.ts` barrel export

  **Must NOT do**:
  - Do NOT include profile labels or profile-to-label mapping — Phase 2
  - Do NOT add OpenRouter API client or auto-fetch logic
  - Do NOT use generic names like `data`, `result`, `item`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions and constants — no logic, no side effects
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Tasks 3, 6, 7, 8, 9, 12
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/call-llm.ts:1-50` — See how existing LLM types/constants are defined in this project
  - `src/gateway/validation/schemas.ts` — Zod schema patterns used for API validation

  **External References**:
  - Artificial Analysis: `https://artificialanalysis.ai/leaderboards/models` — benchmark names that map to type fields

  **WHY Each Reference Matters**:
  - `call-llm.ts` shows the project's pattern for LLM-related type definitions. New types should match this style.
  - The scoring weights and tier thresholds were derived from the interview — they are the core tuning knobs.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes — all types compile
  - [ ] Barrel export from `src/lib/model-selection/index.ts` includes all types and constants

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Types compile and export correctly
    Tool: Bash
    Preconditions: Files created
    Steps:
      1. Run: pnpm build
      2. Run: grep -c "export" src/lib/model-selection/index.ts
      3. Assert: Export count >= 10 (all types + constants)
    Expected Result: Clean build, all exports present
    Failure Indicators: Type errors, missing exports
    Evidence: .sisyphus/evidence/task-2-types-compile.txt

  Scenario: Constants have correct values
    Tool: Bash
    Preconditions: Files created
    Steps:
      1. Run: node -e "const c = require('./dist/lib/model-selection/constants.js'); console.log(JSON.stringify(c.COST_TIER_THRESHOLDS)); console.log(JSON.stringify(c.SCORING_WEIGHTS))"
      2. Assert: COST_TIER_THRESHOLDS.free === 0, .budget === 0.5, .standard === 3.0
      3. Assert: SCORING_WEIGHTS values sum to 1.0
    Expected Result: All threshold values match specification
    Failure Indicators: Wrong values, missing properties
    Evidence: .sisyphus/evidence/task-2-constants-values.txt
  ```

  **Commit**: YES (groups with Task 3)
  - Message: `feat(model-selection): add shared types, constants, and tier computation`
  - Files: `src/lib/model-selection/*`
  - Pre-commit: `pnpm build`

- [x] 3. Tier Computation Pure Functions

  **What to do**:
  - Create `src/lib/model-selection/tiers.ts` with pure functions:
    - `computeCostTier(inputCostPerMillion: number, outputCostPerMillion: number, isFree: boolean): CostTier` — average of input+output, compare against thresholds
    - `computeQualityTier(metrics: { qualityIndex?, agenticScore?, toolUseScore?, instructionFollowingScore?, nonHallucinationRate? }): QualityTier` — weighted composite using `QUALITY_COMPOSITE_WEIGHTS`, ignore null/undefined metrics (re-weight remaining)
    - `computeSpeedGrade(throughputTokensPerSec: number | null, latencySeconds: number | null): SpeedGrade` — both must meet threshold for 'fast'; null = 'slow' by default
    - `computeToolReliability(toolCallErrorRate: number | null): ToolReliability` — null = 'unreliable' (conservative default)
    - `computeQualityComposite(metrics: same as above): number` — returns 0-100 weighted score
  - All functions must handle null/undefined gracefully (models may not have all metrics)
  - Export from barrel

  **Must NOT do**:
  - Do NOT add DB queries — these are pure functions taking data in, returning tiers
  - Do NOT add profile label computation — Phase 2

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small pure functions with clear input/output — straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (needs Task 2 types but can start concurrently if T2 is fast)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2 (needs type definitions)

  **References**:

  **Pattern References**:
  - `src/lib/model-selection/types.ts` (Task 2 output) — `CostTier`, `QualityTier`, `SpeedGrade`, `ToolReliability` types
  - `src/lib/model-selection/constants.ts` (Task 2 output) — threshold values and composite weights

  **WHY Each Reference Matters**:
  - The tier types and threshold constants define the exact boundaries for each function. These are the source of truth.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] All 5 functions exported from barrel
  - [ ] Functions handle null/undefined inputs gracefully (no crashes)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Cost tier computation
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "const t = require('./dist/lib/model-selection/tiers.js'); console.log(t.computeCostTier(0, 0, true)); console.log(t.computeCostTier(0.2, 0.3, false)); console.log(t.computeCostTier(1.0, 2.0, false)); console.log(t.computeCostTier(5.0, 10.0, false))"
      2. Assert output: free, budget, standard, premium (in order)
    Expected Result: Each pricing scenario returns correct tier
    Failure Indicators: Wrong tier classification
    Evidence: .sisyphus/evidence/task-3-cost-tiers.txt

  Scenario: Quality tier with null metrics
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "const t = require('./dist/lib/model-selection/tiers.js'); console.log(t.computeQualityTier({ qualityIndex: 75, agenticScore: null, toolUseScore: null, instructionFollowingScore: null, nonHallucinationRate: null }))"
      2. Assert: Returns a valid tier (not crash, not undefined)
    Expected Result: Graceful handling — returns tier based on available metrics
    Failure Indicators: TypeError, undefined, NaN
    Evidence: .sisyphus/evidence/task-3-null-handling.txt

  Scenario: Tool reliability with null
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "const t = require('./dist/lib/model-selection/tiers.js'); console.log(t.computeToolReliability(null)); console.log(t.computeToolReliability(0.005))"
      2. Assert: null → 'unreliable', 0.005 → 'rock_solid'
    Expected Result: Conservative default for unknown, correct classification for known
    Failure Indicators: Wrong classification or crash on null
    Evidence: .sisyphus/evidence/task-3-tool-reliability.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(model-selection): add shared types, constants, and tier computation`
  - Files: `src/lib/model-selection/*`
  - Pre-commit: `pnpm build`

- [x] 4. Model Catalog CRUD API Routes

  **What to do**:
  - Create `src/gateway/routes/admin-model-catalog.ts` with these endpoints (all admin-authed via `X-Admin-Key`):
    - `GET /admin/tenants/:tenantId/model-catalog` — list all active models for tenant (filter `deleted_at IS NULL`, `is_active = true` by default; accept `?include_inactive=true` query param)
    - `GET /admin/tenants/:tenantId/model-catalog/:id` — get single model
    - `POST /admin/tenants/:tenantId/model-catalog` — create new model (validate with Zod schema)
    - `PATCH /admin/tenants/:tenantId/model-catalog/:id` — update model fields
    - `DELETE /admin/tenants/:tenantId/model-catalog/:id` — soft delete (set `deleted_at`, do NOT hard delete per AGENTS.md)
  - Create Zod validation schemas for create/update bodies
  - Register routes in `src/gateway/routes/index.ts` (or wherever routes are mounted)
  - All queries must be scoped by `tenant_id` (multi-tenancy)
  - All responses must exclude `deleted_at IS NOT NULL` rows unless explicitly requested
  - Use Prisma client (not PostgREST) — this runs in the gateway process

  **Must NOT do**:
  - Do NOT hard delete — soft delete only (`deleted_at`)
  - Do NOT skip tenant_id scoping on any query
  - Do NOT add auto-refresh or OpenRouter sync endpoints

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-endpoint CRUD with validation, auth middleware, and multi-tenancy scoping — non-trivial
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 1, 2 (needs schema + types)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-archetypes.ts` — THE pattern to follow: admin auth middleware, Zod validation, Prisma queries, tenant scoping, error handling. Copy this structure exactly.
  - `src/gateway/routes/admin-knowledge-base.ts` — Another CRUD example with soft delete pattern (`deleted_at`)
  - `src/gateway/routes/index.ts` — Where to register the new route module

  **API/Type References**:
  - `src/gateway/middleware/admin-auth.ts` — Admin auth middleware to apply to all routes
  - `src/gateway/validation/schemas.ts` — Existing Zod schema patterns (note: `UUID_REGEX` for loose UUID validation per AGENTS.md)

  **WHY Each Reference Matters**:
  - `admin-archetypes.ts` is the canonical admin CRUD pattern — endpoint naming, response shapes, error codes. Deviating from this pattern would create API inconsistency.
  - `admin-knowledge-base.ts` specifically demonstrates the soft-delete pattern (setting `deleted_at` on DELETE).
  - Routes must be registered in the index file or they won't be reachable.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] All 5 CRUD endpoints respond correctly
  - [ ] Soft delete works (DELETE sets `deleted_at`, GET excludes deleted rows)
  - [ ] All queries are tenant-scoped

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: CRUD lifecycle
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700, ADMIN_API_KEY set
    Steps:
      1. POST /admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog with body: {"model_id":"test/model-1","display_name":"Test Model","provider":"test","context_window":128000,"input_cost_per_million":0.5,"output_cost_per_million":1.0,"supports_tools":true,"supports_structured_output":false}
      2. Assert: 201, response has id field
      3. GET /admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog
      4. Assert: 200, array contains the created model
      5. PATCH /admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog/:id with body: {"display_name":"Updated Model"}
      6. Assert: 200, display_name changed
      7. DELETE /admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog/:id
      8. Assert: 200 (or 204)
      9. GET /admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog
      10. Assert: deleted model NOT in list
    Expected Result: Full CRUD lifecycle works, soft delete excludes from listing
    Failure Indicators: Wrong status codes, hard delete, deleted item still visible
    Evidence: .sisyphus/evidence/task-4-crud-lifecycle.txt

  Scenario: Tenant isolation
    Tool: Bash (curl)
    Preconditions: Model created for tenant 000...002
    Steps:
      1. GET /admin/tenants/00000000-0000-0000-0000-000000000003/model-catalog
      2. Assert: 200, array does NOT contain tenant 002's model
    Expected Result: Models are tenant-scoped
    Failure Indicators: Cross-tenant data leak
    Evidence: .sisyphus/evidence/task-4-tenant-isolation.txt

  Scenario: Validation rejects invalid input
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. POST /admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog with body: {"model_id":"","display_name":""}
      2. Assert: 400, error message mentions validation
    Expected Result: Empty required fields rejected
    Failure Indicators: 201 with empty data, 500 error
    Evidence: .sisyphus/evidence/task-4-validation-error.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add model catalog CRUD endpoints`
  - Files: `src/gateway/routes/admin-model-catalog.ts`, `src/gateway/routes/index.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Seed Data for 3 Initial Models

  **What to do**:
  - Add model catalog seed entries to `prisma/seed.ts` for BOTH tenants (DozalDevs + VLRE)
  - Seed 3 models per tenant (6 total rows):
    1. **MiniMax M2.7** (`minimax/minimax-m2.7`): The current default — mid-tier pricing, strong agentic performance
       - Metrics: Look up current values from Artificial Analysis and OpenRouter model page at time of implementation
       - `supports_tools: true`, `supports_structured_output: true`
    2. **Tencent HY3 Preview** (`tencent/hy3-preview`): Free model — good for cost-sensitive, simpler tasks
       - `is_free: true`, `input_cost_per_million: 0`, `output_cost_per_million: 0`
       - Look up quality metrics from Artificial Analysis
    3. **OpenRouter Owl Alpha** (`openrouter/owl-alpha`): Free, specifically designed for agentic tasks
       - `is_free: true`
       - Look up quality metrics
  - Use `prisma.modelCatalog.upsert()` keyed on `{ tenant_id, model_id }` to be idempotent
  - **CRITICAL**: Back up database before running seed (per AGENTS.md Database Backup section)

  **Must NOT do**:
  - Do NOT hard-code fake benchmark numbers — look up real values from Artificial Analysis at implementation time
  - Do NOT skip the database backup step
  - Do NOT seed only one tenant — both must get the same catalog

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding seed entries to existing seed file — well-defined data, small change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 1 (needs schema/migration)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Follow existing upsert patterns for seeding (look at how archetypes are seeded)
  - `prisma/schema.prisma` — ModelCatalog model (from Task 1) for field names

  **External References**:
  - Artificial Analysis: `https://artificialanalysis.ai/leaderboards/models` — look up real benchmark scores for each model
  - OpenRouter: `https://openrouter.ai/minimax/minimax-m2.7`, `https://openrouter.ai/tencent/hy3-preview`, `https://openrouter.ai/openrouter/owl-alpha` — pricing and tool error rates

  **WHY Each Reference Matters**:
  - `prisma/seed.ts` has a specific idempotent upsert pattern that must be followed to avoid duplicate-key errors on re-run.
  - Real benchmark data is critical — fake numbers would make the recommendation engine useless.

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` completes without errors
  - [ ] 6 rows in `model_catalog` (3 per tenant)
  - [ ] Re-running seed doesn't create duplicates (idempotent)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Seed creates catalog entries
    Tool: Bash
    Preconditions: Migration applied, database backed up
    Steps:
      1. Run: pnpm prisma db seed
      2. Run: docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT model_id, display_name, tenant_id, is_free FROM model_catalog ORDER BY tenant_id, model_id"
      3. Assert: 6 rows (3 per tenant), correct model_ids, correct is_free flags
    Expected Result: All 6 entries present with correct data
    Failure Indicators: Missing rows, wrong tenant_id, null required fields
    Evidence: .sisyphus/evidence/task-5-seed-creates.txt

  Scenario: Seed is idempotent
    Tool: Bash
    Preconditions: Seed already run once
    Steps:
      1. Run: pnpm prisma db seed (second time)
      2. Run: docker exec shared-postgres psql -U postgres -d ai_employee -c "SELECT count(*) FROM model_catalog"
      3. Assert: Still 6 rows (not 12)
    Expected Result: No duplicate entries
    Failure Indicators: Row count doubled
    Evidence: .sisyphus/evidence/task-5-seed-idempotent.txt
  ```

  **Commit**: YES
  - Message: `feat(seed): add initial model catalog entries`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Task Profile Analyzer

  **What to do**:
  - Create `src/lib/model-selection/profiler.ts` with:
    - `analyzeArchetype(archetype: { system_prompt: string, instructions: string, deliverable_type: string, agents_md?: string }): TaskProfile` — auto-infers profile from archetype definition
    - Logic for inferring each dimension:
      - **toolIntensity**: Scan instructions/agents_md for tool-related keywords (e.g. "API", "curl", "shell", "tool", "database", "query"). `heavy` if 5+ tool references, `light` if 1-4, `none` if 0.
      - **outputQualityBar**: `high` if deliverable_type involves customer communication (e.g. "guest_reply", "message") or system_prompt mentions "professional", "accurate"; `medium` for summaries/reports; `low` for internal notifications.
      - **contextNeeds**: `large` if instructions > 2000 chars or mentions "conversation history", "full context"; `medium` if 500-2000; `small` otherwise.
      - **latencySensitivity**: `critical` if deliverable_type is real-time messaging; `normal` for daily tasks; `relaxed` for background/batch.
      - **costSensitivity**: Default `medium`; adjusted by user answers (Task 8).
      - **domain**: Extract from system_prompt/instructions — "hospitality", "engineering", "operations", etc. (keyword matching, null if unclear).
    - `adjustProfileWithUserAnswers(profile: TaskProfile, answers: UserAnswers): TaskProfile` — modifies profile based on user's business context:
      - `audience: 'external'` → raises `outputQualityBar` to at least `high`
      - `frequency: 'frequent'` → raises `costSensitivity` to `high`
      - `frequency: 'rare'` → lowers `costSensitivity` to `low`
      - `speedPreference: 'fast'` → raises `latencySensitivity` to at least `normal`

  **Must NOT do**:
  - Do NOT use LLM calls for profiling — this is pure keyword/heuristic analysis
  - Do NOT make DB queries — this is a pure function taking archetype data in
  - Do NOT over-engineer the keyword matching — simple includes/regex is fine

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful heuristic design — the quality of recommendations depends entirely on accurate profiling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Tasks 1, 2 (needs schema types)

  **References**:

  **Pattern References**:
  - `src/lib/model-selection/types.ts` (Task 2) — `TaskProfile` and `UserAnswers` interfaces
  - `src/gateway/services/archetype-generator.ts` — See what archetype fields are available (system_prompt, instructions, deliverable_type, agents_md)

  **API/Type References**:
  - `prisma/schema.prisma` → `Archetype` model — exact field names and types available for analysis

  **External References**:
  - Current archetypes in DB — run `SELECT role_name, deliverable_type, substring(instructions, 1, 200) FROM archetypes` to see real examples of what the profiler will analyze

  **WHY Each Reference Matters**:
  - The archetype schema defines exactly what data the profiler receives. The profiler must work with real archetype data, not hypothetical structures.
  - `archetype-generator.ts` shows what fields are populated during creation — some may be null at the point when profiling runs.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] `analyzeArchetype()` returns valid `TaskProfile` for any archetype input
  - [ ] Guest-messaging archetype → `toolIntensity: 'heavy'`, `outputQualityBar: 'high'`
  - [ ] Summarizer archetype → `outputQualityBar: 'medium'`, `latencySensitivity: 'relaxed'`
  - [ ] `adjustProfileWithUserAnswers()` correctly modifies profile based on answers

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Profile guest-messaging archetype
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "const p = require('./dist/lib/model-selection/profiler.js'); const result = p.analyzeArchetype({ system_prompt: 'You are a professional guest messaging assistant for a property management company', instructions: 'Use Hostfully API to read messages. Use Slack tools to post. Check knowledge base for property info.', deliverable_type: 'guest_reply' }); console.log(JSON.stringify(result, null, 2))"
      2. Assert: toolIntensity is 'heavy' (3+ tool refs: Hostfully, Slack, knowledge base)
      3. Assert: outputQualityBar is 'high' (guest_reply = customer-facing)
    Expected Result: Profile correctly identifies tool-heavy, high-quality customer-facing task
    Failure Indicators: Wrong tool intensity, low quality bar for customer communication
    Evidence: .sisyphus/evidence/task-6-profile-guest-messaging.txt

  Scenario: User answers adjust profile
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "const p = require('./dist/lib/model-selection/profiler.js'); const base = { toolIntensity: 'light', outputQualityBar: 'medium', contextNeeds: 'small', latencySensitivity: 'relaxed', costSensitivity: 'medium', domain: null }; const adjusted = p.adjustProfileWithUserAnswers(base, { audience: 'external', frequency: 'frequent', speedPreference: 'fast' }); console.log(JSON.stringify(adjusted, null, 2))"
      2. Assert: outputQualityBar raised to 'high' (external audience)
      3. Assert: costSensitivity raised to 'high' (frequent)
      4. Assert: latencySensitivity raised to at least 'normal' (fast preference)
    Expected Result: All three user answers correctly modify the profile
    Failure Indicators: Profile unchanged, wrong adjustments
    Evidence: .sisyphus/evidence/task-6-user-answers-adjust.txt
  ```

  **Commit**: YES (groups with Tasks 7, 8)
  - Message: `feat(model-selection): add task profiler, matching engine, and recommendation endpoint`
  - Files: `src/lib/model-selection/*`, `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm build`

- [x] 7. Matching Engine (Filter → Score → Rank → Top-3)

  **What to do**:
  - Create `src/lib/model-selection/matcher.ts` with:
    - `matchModels(profile: TaskProfile, catalog: ModelCatalogRow[]): ModelScore[]` — the core algorithm:
      1. **Filter**: Remove models that don't meet hard requirements:
         - If `profile.toolIntensity !== 'none'` → model must have `supports_tools = true`
         - If `profile.contextNeeds === 'large'` → model must have `context_window >= 100000`
         - If `profile.contextNeeds === 'medium'` → model must have `context_window >= 32000`
         - Model must have `is_active = true` and `deleted_at = null`
      2. **Score**: For each surviving model, compute weighted score (0-100):
         - Quality score (0-100): `computeQualityComposite(model metrics)` — from Task 3
         - Cost score (0-100): Inverse of cost — $0 = 100, $0.50/M avg = 80, $3/M = 40, $10/M = 10 (logarithmic scale)
         - Speed score (0-100): Based on throughput + latency — fast=100, moderate=60, slow=30 (null=30)
         - Tool reliability score (0-100): rock_solid=100, reliable=80, usable=50, unreliable=20 (null=20)
         - Total = weighted sum using `SCORING_WEIGHTS` (adjusted by profile — see below)
      3. **Weight adjustment by profile**:
         - `costSensitivity === 'high'` → increase cost weight by 0.15, decrease quality by 0.10, speed by 0.05
         - `latencySensitivity === 'critical'` → increase speed weight by 0.10, decrease cost by 0.10
         - `toolIntensity === 'heavy'` → increase toolReliability weight by 0.10, decrease cost by 0.10
         - (Always re-normalize weights to sum to 1.0)
      4. **Rank**: Sort by totalScore descending
      5. **Cost estimate**: For each model, estimate per-task cost: `(avg_input_tokens * input_cost + avg_output_tokens * output_cost)` — use 2000 input / 1000 output as defaults
    - `recommendModels(profile: TaskProfile, catalog: ModelCatalogRow[]): ModelRecommendation` — wraps matchModels:
      - `recommended`: Highest-scoring model
      - `cheaperAlternative`: Highest-scoring model with lower cost tier than recommended (null if recommended is already cheapest)
      - `premiumAlternative`: Highest-scoring model with higher quality tier than recommended (null if recommended is already frontier)

  **Must NOT do**:
  - Do NOT make DB queries in matcher — it receives catalog data as parameter
  - Do NOT use LLM calls for matching
  - Do NOT crash when catalog is empty — return empty recommendation gracefully

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core algorithm with scoring, weight adjustment, and edge cases — must be thoroughly designed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: Tasks 8, 9, 14
  - **Blocked By**: Tasks 2, 3, 5, 6 (needs types, tiers, seed data for testing, profiler)

  **References**:

  **Pattern References**:
  - `src/lib/model-selection/types.ts` (Task 2) — `ModelScore`, `ModelRecommendation`, `TaskProfile`
  - `src/lib/model-selection/constants.ts` (Task 2) — `SCORING_WEIGHTS`
  - `src/lib/model-selection/tiers.ts` (Task 3) — `computeQualityComposite`, `computeCostTier`, etc.

  **WHY Each Reference Matters**:
  - The scoring weights and tier functions are the building blocks. The matcher orchestrates them.
  - The type definitions define the exact shape of inputs and outputs.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] `matchModels()` returns sorted scores for a given profile + catalog
  - [ ] `recommendModels()` returns recommended + alternatives (or null alternatives when not available)
  - [ ] Empty catalog → returns empty recommendation (no crash)
  - [ ] Models without tool support filtered out when profile requires tools

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Match with 3-model catalog
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Create test data: 3 models (free/no-tools, budget/with-tools, premium/with-tools)
      2. Run matchModels with a tool-heavy profile
      3. Assert: Free model filtered out (no tool support)
      4. Assert: Remaining 2 models scored and ranked
      5. Assert: recommendModels returns recommended + cheaperAlternative
    Expected Result: Correct filtering, scoring, and 3-tier recommendation
    Failure Indicators: Non-tool model not filtered, wrong ranking
    Evidence: .sisyphus/evidence/task-7-match-three-models.txt

  Scenario: Empty catalog returns graceful empty result
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: recommendModels with a valid profile but empty catalog []
      2. Assert: Returns { recommended: null, cheaperAlternative: null, premiumAlternative: null } (or similar empty shape)
    Expected Result: No crash, empty recommendation
    Failure Indicators: TypeError, undefined access, crash
    Evidence: .sisyphus/evidence/task-7-empty-catalog.txt

  Scenario: Cost-sensitive profile boosts cheaper models
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Create 2 models: one cheap (quality 60), one expensive (quality 70)
      2. Run matchModels with costSensitivity='high' profile
      3. Assert: Cheap model ranks higher despite lower quality (cost weight boosted)
    Expected Result: Weight adjustment correctly favors cheaper model
    Failure Indicators: Expensive model still ranks first despite high cost sensitivity
    Evidence: .sisyphus/evidence/task-7-cost-sensitive.txt
  ```

  **Commit**: YES (groups with Tasks 6, 8)
  - Message: `feat(model-selection): add task profiler, matching engine, and recommendation endpoint`
  - Files: `src/lib/model-selection/*`
  - Pre-commit: `pnpm build`

- [x] 8. User Questions + Recommendation Endpoint

  **What to do**:
  - Add a new endpoint to `src/gateway/routes/admin-archetypes.ts`:
    - `POST /admin/tenants/:tenantId/archetypes/recommend-model` — accepts archetype draft + user answers, returns top-3 recommendation
    - Request body (Zod validated):
      ```
      {
        archetype: { system_prompt: string, instructions: string, deliverable_type: string, agents_md?: string },
        userAnswers: { audience: 'external' | 'internal', frequency: 'frequent' | 'daily' | 'rare', speedPreference: 'fast' | 'relaxed' }
      }
      ```
    - Response: `ModelRecommendation` (recommended + alternatives with scores and cost estimates)
    - Implementation:
      1. Call `analyzeArchetype(archetype)` to get base profile
      2. Call `adjustProfileWithUserAnswers(profile, userAnswers)` to refine
      3. Fetch active models from `model_catalog` for the tenant
      4. Call `recommendModels(adjustedProfile, catalog)` to get recommendation
      5. Return recommendation
  - Also add a `GET /admin/tenants/:tenantId/archetypes/model-questions` endpoint that returns the 3 questions (static — for the frontend to render):
    ```json
    [
      {
        "id": "audience",
        "question": "Will this employee communicate directly with your customers, or is it for internal use only?",
        "options": [
          { "value": "external", "label": "Customer-facing" },
          { "value": "internal", "label": "Internal only" }
        ]
      },
      {
        "id": "frequency",
        "question": "How often will this employee run?",
        "options": [
          { "value": "frequent", "label": "Multiple times a day" },
          { "value": "daily", "label": "About once a day" },
          { "value": "rare", "label": "A few times a week or less" }
        ]
      },
      {
        "id": "speedPreference",
        "question": "Does this employee need to respond quickly, or is a few minutes fine?",
        "options": [
          { "value": "fast", "label": "Speed matters" },
          { "value": "relaxed", "label": "A few minutes is fine" }
        ]
      }
    ]
    ```

  **Must NOT do**:
  - Do NOT hardcode model IDs in the recommendation logic — it reads from the catalog
  - Do NOT add questions beyond the 3 agreed upon
  - Do NOT require user answers — the endpoint should work with just the archetype (answers are optional enhancement)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New API endpoint with validation, DB query, and orchestration of multiple modules
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: Tasks 9, 14
  - **Blocked By**: Tasks 2, 6, 7 (needs types, profiler, matcher)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-archetypes.ts` — Add endpoints here alongside existing archetype routes
  - `src/gateway/routes/admin-model-catalog.ts` (Task 4) — Reference for Prisma query pattern to fetch catalog

  **API/Type References**:
  - `src/lib/model-selection/profiler.ts` (Task 6) — `analyzeArchetype()`, `adjustProfileWithUserAnswers()`
  - `src/lib/model-selection/matcher.ts` (Task 7) — `recommendModels()`
  - `src/lib/model-selection/types.ts` (Task 2) — `UserAnswers`, `ModelRecommendation`

  **WHY Each Reference Matters**:
  - This endpoint orchestrates the entire engine: profiler + matcher + DB query. It must import and compose them correctly.
  - The admin-archetypes route file is where this endpoint lives — it must follow existing patterns there.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] `GET .../model-questions` returns 3 questions with options
  - [ ] `POST .../recommend-model` with archetype + answers returns top-3 recommendation
  - [ ] `POST .../recommend-model` with archetype only (no answers) still works
  - [ ] Empty catalog → graceful response (empty recommendation, not 500)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Get model questions
    Tool: Bash (curl)
    Preconditions: Gateway running, seed data present
    Steps:
      1. GET /admin/tenants/00000000-0000-0000-0000-000000000002/archetypes/model-questions
      2. Assert: 200, array of 3 questions
      3. Assert: Each question has id, question text, and options array
    Expected Result: 3 questions returned with non-technical language
    Failure Indicators: Wrong count, missing fields, technical jargon
    Evidence: .sisyphus/evidence/task-8-get-questions.txt

  Scenario: Recommend model for guest-messaging-like archetype
    Tool: Bash (curl)
    Preconditions: Gateway running, seed data with 3 models
    Steps:
      1. POST /admin/tenants/00000000-0000-0000-0000-000000000002/archetypes/recommend-model with body:
         {"archetype":{"system_prompt":"Professional guest messaging assistant","instructions":"Use Hostfully API, Slack tools, knowledge base","deliverable_type":"guest_reply"},"userAnswers":{"audience":"external","frequency":"daily","speedPreference":"fast"}}
      2. Assert: 200, response has recommended model with score
      3. Assert: Recommended model has supports_tools=true (guest messaging needs tools)
      4. Assert: Response includes cost estimate per task
    Expected Result: Engine recommends tool-capable, high-quality model
    Failure Indicators: Recommends non-tool model, missing cost estimate, 500 error
    Evidence: .sisyphus/evidence/task-8-recommend-guest-messaging.txt

  Scenario: Recommend without user answers
    Tool: Bash (curl)
    Preconditions: Gateway running, seed data
    Steps:
      1. POST /admin/tenants/00000000-0000-0000-0000-000000000002/archetypes/recommend-model with body:
         {"archetype":{"system_prompt":"Summarize Slack channels","instructions":"Read messages, generate summary","deliverable_type":"summary"}}
      2. Assert: 200, recommendation returned (user answers not required)
    Expected Result: Works without user answers, uses auto-profiled defaults
    Failure Indicators: 400 requiring userAnswers, crash
    Evidence: .sisyphus/evidence/task-8-recommend-no-answers.txt
  ```

  **Commit**: YES (groups with Tasks 6, 7)
  - Message: `feat(model-selection): add task profiler, matching engine, and recommendation endpoint`
  - Files: `src/lib/model-selection/*`, `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm build`

- [x] 9. Wire Engine into Archetype Creation Flow

  **What to do**:
  - Modify `src/gateway/services/archetype-generator.ts` to integrate the recommendation engine into the archetype generation flow:
    - After the LLM generates the archetype config, call the recommendation engine to suggest a model
    - The `generateArchetype()` function should return the recommendation alongside the generated archetype
    - Add `modelRecommendation` to the response payload so the frontend can display it
    - The archetype's `model` field should be set to the recommended model's `model_id` by default
    - BUT the user can override this in the frontend before saving
  - Update the `POST /admin/tenants/:tenantId/archetypes/generate` response to include the recommendation
  - Ensure the user's selected model (from recommendation cards or manual override) is what gets persisted when the archetype is saved

  **Must NOT do**:
  - Do NOT force the recommended model — it's a suggestion, user can override
  - Do NOT modify the LLM prompt to include model selection — the engine runs AFTER generation
  - Do NOT remove the `model` field from the archetype — it should still accept any model string

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integrating into existing service with careful attention to not break current flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12)
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 7, 8, 10, 11 (needs matcher, endpoint, postProcess removal, schema expansion)

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts` — THE file to modify. Read the entire file to understand the generation flow, especially `generateArchetype()` and `postProcess()`.
  - `src/gateway/routes/admin-archetypes.ts` — The route that calls `generateArchetype()` — may need response type update

  **API/Type References**:
  - `src/lib/model-selection/matcher.ts` (Task 7) — `recommendModels()` function to call
  - `src/lib/model-selection/profiler.ts` (Task 6) — `analyzeArchetype()`, `adjustProfileWithUserAnswers()`

  **WHY Each Reference Matters**:
  - `archetype-generator.ts` is the integration point — you must understand its full flow before modifying
  - The recommendation engine functions must be imported and called at the right point in the flow

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] `POST .../archetypes/generate` response includes `modelRecommendation` field
  - [ ] Default model is set to recommended model's `model_id`
  - [ ] Existing archetype generation still works (no regression)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Generate archetype includes model recommendation
    Tool: Bash (curl)
    Preconditions: Gateway running, seed catalog present
    Steps:
      1. POST /admin/tenants/00000000-0000-0000-0000-000000000002/archetypes/generate with a valid archetype generation request
      2. Assert: 200, response includes standard archetype fields
      3. Assert: Response includes modelRecommendation object with recommended model
      4. Assert: archetype.model field is set to recommended model's model_id
    Expected Result: Generation returns archetype + recommendation together
    Failure Indicators: Missing modelRecommendation, model field still hardcoded to minimax
    Evidence: .sisyphus/evidence/task-9-generate-with-recommendation.txt
  ```

  **Commit**: YES (groups with Tasks 10, 11, 12)
  - Message: `feat(integration): wire model engine into archetype creation, remove hardcoded model`
  - Files: `src/gateway/services/archetype-generator.ts`, `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm build`

- [x] 10. Remove `postProcess()` Model Override (CRITICAL)

  **What to do**:
  - In `src/gateway/services/archetype-generator.ts`, find the `postProcess()` function (around line 215)
  - Remove the line: `result.model = 'minimax/minimax-m2.7'` (or equivalent hardcoded model assignment)
  - The model should now come from the recommendation engine (Task 9) or the user's selection
  - If `postProcess()` does other important things, keep those — only remove the model override line
  - Verify no other places in the file hardcode the model

  **Must NOT do**:
  - Do NOT delete the entire `postProcess()` function if it does other things — only remove the model override
  - Do NOT replace with a different hardcoded model
  - Do NOT leave any commented-out model assignment

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line removal in a known location
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11, 12)
  - **Blocks**: Task 9 (should be done before wiring, so engine output isn't overwritten)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts:~215` — Exact location of `postProcess()` model override

  **WHY Each Reference Matters**:
  - This is the CRITICAL blocker — if this line stays, the entire recommendation engine is useless because postProcess silently overwrites the model.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] No hardcoded `minimax/minimax-m2.7` assignment in `archetype-generator.ts`
  - [ ] `postProcess()` still handles other validations (if any)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Model override removed
    Tool: Bash
    Preconditions: File edited
    Steps:
      1. Run: grep -n "minimax/minimax-m2.7" src/gateway/services/archetype-generator.ts
      2. Assert: No matches (or only in non-assignment contexts like comments/imports)
      3. Run: grep -n "result.model\s*=" src/gateway/services/archetype-generator.ts
      4. Assert: No hardcoded model assignment in postProcess
    Expected Result: No model override remains
    Failure Indicators: Grep still finds hardcoded assignment
    Evidence: .sisyphus/evidence/task-10-override-removed.txt
  ```

  **Commit**: YES (groups with Tasks 9, 11, 12)
  - Message: `feat(integration): wire model engine into archetype creation, remove hardcoded model`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm build`

- [x] 11. Expand API Validation Schemas (POST + PATCH)

  **What to do**:
  - In `src/gateway/routes/admin-archetypes.ts`, find the Zod schema that validates the `model` field
  - Currently uses `z.enum(['minimax/minimax-m2.7', 'anthropic/claude-haiku-4-5'])` — this rejects any new models
  - Replace with `z.string().min(1)` — accept any non-empty string (validation that the model exists in catalog happens at the engine level, not schema level)
  - Apply this change to BOTH:
    - `CreateArchetypeBodySchema` (POST endpoint)
    - `UpdateArchetypeBodySchema` (PATCH endpoint)
  - Also check `src/gateway/validation/schemas.ts` for any additional model validation that might reject new models

  **Must NOT do**:
  - Do NOT add dynamic enum from DB — that would require DB query during schema compilation
  - Do NOT remove the model field entirely — it should still be validated as a non-empty string
  - Do NOT change the verification model (`anthropic/claude-haiku-4-5`) anywhere

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small schema change in known locations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 12)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2 (needs types)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-archetypes.ts:~78` — The `z.enum` that needs replacing
  - `src/gateway/validation/schemas.ts` — Check for additional model validation

  **WHY Each Reference Matters**:
  - The `z.enum` is the validation gate — if not expanded, new models from the catalog will be rejected by the API.
  - Both POST and PATCH must be updated — asymmetry would mean you can create with new models but not update, or vice versa.

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes
  - [ ] POST with `model: "tencent/hy3-preview"` accepted (not rejected by validation)
  - [ ] PATCH with `model: "openrouter/owl-alpha"` accepted
  - [ ] POST with `model: ""` rejected (empty string not allowed)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: New model accepted by POST
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. POST /admin/tenants/00000000-0000-0000-0000-000000000002/archetypes with a body that includes model: "tencent/hy3-preview"
      2. Assert: NOT rejected with validation error (previously would fail z.enum)
    Expected Result: Accepted (200/201), model persisted
    Failure Indicators: 400 with enum validation error
    Evidence: .sisyphus/evidence/task-11-post-new-model.txt

  Scenario: Empty model rejected
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. POST /admin/tenants/00000000-0000-0000-0000-000000000002/archetypes with model: ""
      2. Assert: 400, validation error
    Expected Result: Empty string rejected
    Failure Indicators: Accepted with empty model
    Evidence: .sisyphus/evidence/task-11-empty-model-rejected.txt
  ```

  **Commit**: YES (groups with Tasks 9, 10, 12)
  - Message: `feat(integration): wire model engine into archetype creation, remove hardcoded model`
  - Files: `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm build`

- [x] 12. Fix Dashboard `GenerateArchetypeResponse` Type

  **What to do**:
  - In `dashboard/src/lib/types.ts`, find the `GenerateArchetypeResponse` type
  - Change the `model` field from literal type `'minimax/minimax-m2.7'` to `string`
  - Add the `modelRecommendation` field to match the updated API response (from Task 9):
    ```typescript
    modelRecommendation?: {
      recommended: { modelId: string; displayName: string; totalScore: number; costEstimate: { perTaskUsd: number; monthlyUsd: number | null } } | null;
      cheaperAlternative: { modelId: string; displayName: string; totalScore: number; costEstimate: { perTaskUsd: number; monthlyUsd: number | null } } | null;
      premiumAlternative: { modelId: string; displayName: string; totalScore: number; costEstimate: { perTaskUsd: number; monthlyUsd: number | null } } | null;
    }
    ```
  - Also check for any other places in the dashboard that assume model is the minimax literal type

  **Must NOT do**:
  - Do NOT import server-side types into the dashboard — duplicate the necessary types
  - Do NOT add the full `ModelScore` type with all breakdown details — keep the frontend type minimal

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definition change in a known file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: Tasks 14, 15
  - **Blocked By**: Task 2 (needs to know the type shape)

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/types.ts` — The file containing `GenerateArchetypeResponse`

  **API/Type References**:
  - `src/lib/model-selection/types.ts` (Task 2) — `ModelRecommendation` type (server-side reference for what the API returns)

  **WHY Each Reference Matters**:
  - The literal type `'minimax/minimax-m2.7'` will cause TypeScript errors when the API returns different model IDs. This is a type mismatch waiting to happen.
  - The new `modelRecommendation` field must match what the API actually returns (from Task 9).

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes (including dashboard build if separate)
  - [ ] `GenerateArchetypeResponse.model` is `string`, not a literal type
  - [ ] `modelRecommendation` field present with correct shape
  - [ ] No TypeScript errors in dashboard code

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Dashboard builds with updated types
    Tool: Bash
    Preconditions: Type file updated
    Steps:
      1. Run: pnpm build (or dashboard-specific build command)
      2. Assert: No TypeScript errors related to model type
      3. Run: grep -n "minimax/minimax-m2.7" dashboard/src/lib/types.ts
      4. Assert: No literal type reference to minimax
    Expected Result: Clean build, no literal model type
    Failure Indicators: Type errors, literal type still present
    Evidence: .sisyphus/evidence/task-12-dashboard-types.txt
  ```

  **Commit**: YES (groups with Tasks 9, 10, 11)
  - Message: `feat(integration): wire model engine into archetype creation, remove hardcoded model`
  - Files: `dashboard/src/lib/types.ts`
  - Pre-commit: `pnpm build`

- [x] 13. Model Catalog Admin Page

  **What to do**:
  - Create `dashboard/src/pages/ModelCatalogPage.tsx` — admin page for managing the model catalog
  - Add a new sidebar entry "Model Catalog" (or "AI Models") in the dashboard navigation
  - Page structure:
    - Header: "Model Catalog" with "Add Model" button
    - Table/list of models with columns: Display Name, Provider, Cost Tier (computed), Quality Tier (computed), Tool Support, Active/Inactive toggle, Actions (Edit, Delete)
    - Each tier should show a colored badge (use existing badge patterns from dashboard)
    - "Add Model" opens a form/modal with all catalog fields
    - "Edit" opens the same form pre-filled
    - "Delete" shows confirmation dialog, calls soft-delete endpoint
  - Use existing dashboard patterns:
    - Card shell: `rounded-lg border bg-card` with `px-5 py-4`
    - SearchableSelect for any dropdown (per AGENTS.md)
    - URL-encode active tab/filter state via `useSearchParams`
  - Fetch data from `GET /admin/tenants/:tenantId/model-catalog`
  - Use Prisma-generated types or define frontend-specific types
  - Compute and display tiers client-side (import tier computation logic or duplicate simple thresholds)

  **Must NOT do**:
  - Do NOT use `<Select>` from Radix — use `SearchableSelect` per AGENTS.md
  - Do NOT skip card shells — every section must be wrapped
  - Do NOT use employee-specific language — this is a shared admin page
  - Do NOT add auto-refresh functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Full dashboard page with table, forms, badges, and interactive elements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15)
  - **Blocks**: None
  - **Blocked By**: Task 4 (needs CRUD API)

  **References**:

  **Pattern References**:
  - `dashboard/src/pages/` — Look at existing page structure for layout, data fetching, and component patterns
  - `dashboard/src/components/ui/searchable-select.tsx` — SearchableSelect component (MUST use for dropdowns)
  - `dashboard/src/components/` — Existing badge, table, card patterns

  **API/Type References**:
  - `GET /admin/tenants/:tenantId/model-catalog` (Task 4) — API to fetch catalog data
  - `POST/PATCH/DELETE` endpoints (Task 4) — CRUD operations

  **External References**:
  - Dashboard dev server: `http://localhost:7701/dashboard/` — use this URL for testing (per AGENTS.md)

  **WHY Each Reference Matters**:
  - Existing pages define the project's UI conventions. New pages must look consistent.
  - SearchableSelect is mandatory per AGENTS.md — using native Select is a bug.
  - The dev server URL is important for Playwright testing.

  **Acceptance Criteria**:
  - [ ] Page renders with model catalog data
  - [ ] CRUD operations work (add, edit, delete)
  - [ ] Tiers displayed as badges
  - [ ] Uses card shells, SearchableSelect, useSearchParams
  - [ ] Sidebar navigation includes new entry

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Model Catalog page loads with seed data
    Tool: Playwright
    Preconditions: Dashboard running at localhost:7701, seed data present
    Steps:
      1. Navigate to http://localhost:7701/dashboard/ (or wherever model catalog link is)
      2. Click "Model Catalog" (or equivalent) in sidebar
      3. Assert: Page shows table with 3 seeded models
      4. Assert: Each row shows display name, provider, cost tier badge, quality tier badge
      5. Screenshot the page
    Expected Result: Table renders with all 3 models and tier badges
    Failure Indicators: Empty table, missing badges, 404 page
    Evidence: .sisyphus/evidence/task-13-catalog-page.png

  Scenario: Add new model via form
    Tool: Playwright
    Preconditions: Catalog page loaded
    Steps:
      1. Click "Add Model" button
      2. Fill form: model_id="test/new-model", display_name="Test New Model", provider="test", context_window=64000, input_cost=0.1, output_cost=0.2
      3. Submit form
      4. Assert: New model appears in table
      5. Assert: Cost tier badge shows "budget" (avg $0.15/M)
    Expected Result: Model created and displayed in table with correct computed tier
    Failure Indicators: Form error, model not appearing, wrong tier
    Evidence: .sisyphus/evidence/task-13-add-model.png

  Scenario: Delete model (soft delete)
    Tool: Playwright
    Preconditions: Test model created
    Steps:
      1. Click delete button for test model
      2. Confirm deletion in dialog
      3. Assert: Model removed from table
      4. Verify in DB: model still exists with deleted_at set
    Expected Result: Soft delete — removed from UI but preserved in DB
    Failure Indicators: Hard delete, still showing in table
    Evidence: .sisyphus/evidence/task-13-delete-model.png
  ```

  **Commit**: YES (groups with Tasks 14, 15)
  - Message: `feat(dashboard): add model catalog page, recommendation cards, and model selector`
  - Files: `dashboard/src/pages/ModelCatalogPage.tsx`, `dashboard/src/components/*`
  - Pre-commit: `pnpm build`

- [x] 14. Recommendation Display in Employee Creation

  **What to do**:
  - Modify the employee creation flow in the dashboard to include:
    1. **3 user questions** (from `GET .../model-questions` endpoint) — displayed AFTER the archetype is generated but BEFORE the user confirms
    2. **Top-3 recommendation cards** — displayed after the user answers questions
    3. Each card shows: Model name, provider, cost tier badge, quality tier badge, estimated cost per task, a brief reason why it's recommended/cheaper/premium
    4. One card is highlighted as "Recommended"
    5. User clicks a card to select that model (or can skip to use recommended)
  - The flow:
    1. User fills out employee creation form → clicks Generate
    2. Archetype is generated (existing flow)
    3. NEW: 3 questions appear (plain language, one at a time or all at once)
    4. NEW: After answering, recommendation cards appear with top-3 models
    5. User selects a model (or accepts recommended default)
    6. User proceeds to review/save (existing flow with selected model)
  - Call `POST .../recommend-model` with the generated archetype + user answers to get recommendations
  - Use card shells, proper spacing, non-technical language for all UI elements

  **Must NOT do**:
  - Do NOT block the flow if recommendation API fails — fall back to current default model with a note
  - Do NOT use technical terms in question/card text — target audience is non-technical
  - Do NOT show raw scores/numbers to users — show tiers and cost estimates in plain language
  - Do NOT skip card shells or use bare content

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Multi-step interactive UI with conditional rendering, API calls, and careful UX design for non-technical users
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 15)
  - **Blocks**: None
  - **Blocked By**: Tasks 8, 9, 12 (needs recommendation endpoint, wiring, and updated types)

  **References**:

  **Pattern References**:
  - Dashboard employee creation pages/components — understand the current creation flow to know where to insert the new steps
  - `dashboard/src/components/ui/searchable-select.tsx` — for any dropdown needed

  **API/Type References**:
  - `GET /admin/tenants/:tenantId/archetypes/model-questions` (Task 8) — questions to display
  - `POST /admin/tenants/:tenantId/archetypes/recommend-model` (Task 8) — recommendation endpoint
  - `dashboard/src/lib/types.ts` → `GenerateArchetypeResponse` (Task 12) — updated type with modelRecommendation

  **WHY Each Reference Matters**:
  - The existing creation flow defines where the new steps insert. Must not break the existing flow.
  - The API endpoints provide the data. The types ensure TypeScript safety.

  **Acceptance Criteria**:
  - [ ] 3 user questions displayed after archetype generation
  - [ ] Recommendation cards appear after answering questions
  - [ ] Recommended card is visually highlighted
  - [ ] Selecting a card updates the archetype's model field
  - [ ] Flow works end-to-end: create → generate → questions → recommend → select → save
  - [ ] Graceful fallback if recommendation API fails

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full creation flow with model recommendation
    Tool: Playwright
    Preconditions: Dashboard at localhost:7701, gateway running, seed catalog present
    Steps:
      1. Navigate to employee creation page
      2. Fill out required fields and trigger archetype generation
      3. Assert: After generation, 3 questions appear with plain-language options
      4. Answer all 3 questions (click options)
      5. Assert: 3 recommendation cards appear (recommended highlighted)
      6. Click on a non-recommended card to select it
      7. Assert: Selected card is now highlighted, model field updated
      8. Screenshot the recommendation cards
    Expected Result: Full flow works, cards display, selection persists
    Failure Indicators: Questions not showing, cards not appearing, selection not persisting
    Evidence: .sisyphus/evidence/task-14-recommendation-flow.png

  Scenario: Graceful fallback on API failure
    Tool: Playwright
    Preconditions: Gateway stopped (or recommendation endpoint returning error)
    Steps:
      1. Navigate through creation flow
      2. Answer questions
      3. Assert: No crash — shows fallback message or skips to default model
    Expected Result: Graceful degradation, not a blank screen or crash
    Failure Indicators: Unhandled error, blank screen, stuck spinner
    Evidence: .sisyphus/evidence/task-14-fallback.png
  ```

  **Commit**: YES (groups with Tasks 13, 15)
  - Message: `feat(dashboard): add model catalog page, recommendation cards, and model selector`
  - Files: `dashboard/src/pages/*`, `dashboard/src/components/*`
  - Pre-commit: `pnpm build`

- [x] 15. Model Selector in Advanced Tab (SearchableSelect)

  **What to do**:
  - In the employee edit/advanced settings tab, replace the current model field (if any) with a `SearchableSelect` dropdown populated from the model catalog
  - Fetch active models from `GET /admin/tenants/:tenantId/model-catalog`
  - Display options as: "Display Name (provider) — Cost Tier" (e.g. "MiniMax M2.7 (minimax) — Standard")
  - Allow selecting any active model from the catalog
  - Selected value saves to `archetype.model` (the `model_id` string)
  - If the current archetype has a model not in the catalog, show it as the selected value with a warning badge

  **Must NOT do**:
  - Do NOT use `<Select>` — MUST use `SearchableSelect` per AGENTS.md
  - Do NOT restrict to only catalog models — if a custom model_id was set, it should display
  - Do NOT make model required — it should remain optional (nullable in schema)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component integration with data fetching and SearchableSelect
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14)
  - **Blocks**: None
  - **Blocked By**: Task 12 (needs updated types)

  **References**:

  **Pattern References**:
  - `dashboard/src/components/ui/searchable-select.tsx` — THE component to use. Props: `options: {value, label}[]`, `value: string`, `onValueChange: (v: string) => void`
  - Dashboard employee edit pages — find the Advanced tab where model is configured

  **WHY Each Reference Matters**:
  - SearchableSelect is mandatory. Using any other select component is a bug per AGENTS.md.
  - The Advanced tab is where power users can override the recommended model.

  **Acceptance Criteria**:
  - [ ] SearchableSelect populated with catalog models
  - [ ] Selecting a model updates archetype.model
  - [ ] Unknown models (not in catalog) still display as selected value
  - [ ] Search/filter works in the dropdown

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Model selector shows catalog models
    Tool: Playwright
    Preconditions: Dashboard at localhost:7701, existing employee with model set
    Steps:
      1. Navigate to employee edit page → Advanced tab
      2. Click model selector dropdown
      3. Assert: Dropdown shows all 3 seeded models with display names and cost tiers
      4. Type "mini" in search box
      5. Assert: Filtered to show only MiniMax M2.7
      6. Select it
      7. Assert: Field value updated
      8. Screenshot
    Expected Result: SearchableSelect works with catalog data, search filters correctly
    Failure Indicators: Empty dropdown, no search, using native Select
    Evidence: .sisyphus/evidence/task-15-model-selector.png
  ```

  **Commit**: YES (groups with Tasks 13, 14)
  - Message: `feat(dashboard): add model catalog page, recommendation cards, and model selector`
  - Files: `dashboard/src/pages/*`, `dashboard/src/components/*`
  - Pre-commit: `pnpm build`

- [x] 16. Unit + API Tests

  **What to do**:
  - Create test files using Vitest (project's test framework):
    - `src/lib/model-selection/__tests__/tiers.test.ts` — test all tier computation functions:
      - `computeCostTier`: free/budget/standard/premium boundaries, edge cases
      - `computeQualityTier`: all tiers, null metric handling, single-metric-only
      - `computeSpeedGrade`: fast/moderate/slow, null handling
      - `computeToolReliability`: all tiers, null → unreliable
      - `computeQualityComposite`: weighted composite, null re-weighting
    - `src/lib/model-selection/__tests__/profiler.test.ts` — test profiler:
      - `analyzeArchetype`: tool-heavy archetype, simple archetype, empty fields
      - `adjustProfileWithUserAnswers`: each user answer type, combination effects
    - `src/lib/model-selection/__tests__/matcher.test.ts` — test matcher:
      - `matchModels`: filtering (no-tools, context too small), scoring, ranking
      - `recommendModels`: top-3 selection, empty catalog, single model, all same tier
      - Weight adjustment: cost-sensitive boosts cheap models, tool-heavy boosts reliable models
    - `src/gateway/routes/__tests__/admin-model-catalog.test.ts` — API integration tests:
      - CRUD lifecycle, tenant isolation, validation errors, soft delete
      - Recommendation endpoint with/without user answers
  - Follow existing test patterns (look at nearby test files for setup, mocking, assertions)
  - Run: `pnpm test -- --run` and verify all pass

  **Must NOT do**:
  - Do NOT mock tier computation in matcher tests — use real functions (they're pure)
  - Do NOT test implementation details — test behavior and contracts
  - Do NOT write tests that depend on specific seed data model_ids (use test fixtures)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files covering unit + integration, significant scope
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (sequential — after all implementation)
  - **Blocks**: Task 17
  - **Blocked By**: Tasks 1-15 (needs all implementation complete)

  **References**:

  **Pattern References**:
  - `src/**/__tests__/*.test.ts` — Existing test file patterns (setup, describe/it structure, assertions)
  - `src/gateway/routes/__tests__/` — Existing API test patterns (supertest, test DB setup)

  **Test References**:
  - `vitest.config.ts` or `package.json` test config — test runner configuration
  - `src/__tests__/setup.ts` or similar — test setup/teardown patterns

  **WHY Each Reference Matters**:
  - Following existing test patterns ensures consistency and proper setup/teardown.
  - API tests need the correct test DB and server setup patterns.

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` passes (all existing + new)
  - [ ] Tier computation: 15+ test cases covering boundaries and nulls
  - [ ] Profiler: 8+ test cases covering different archetype profiles
  - [ ] Matcher: 10+ test cases covering filtering, scoring, edge cases
  - [ ] API: 8+ test cases covering CRUD + recommendation + validation

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: All implementation complete
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: Exit code 0
      3. Assert: No failing tests
      4. Assert: New test files appear in output
    Expected Result: All tests pass including new ones
    Failure Indicators: Test failures, missing test files
    Evidence: .sisyphus/evidence/task-16-tests-pass.txt

  Scenario: No regression in existing tests
    Tool: Bash
    Preconditions: Tests run
    Steps:
      1. Run: pnpm test -- --run 2>&1 | grep -E "Tests|Test Files"
      2. Assert: Test count >= 1490 (existing) + new tests
      3. Assert: 0 failures
    Expected Result: Existing test count unchanged, new tests added
    Failure Indicators: Reduced test count, new failures in existing tests
    Evidence: .sisyphus/evidence/task-16-no-regression.txt
  ```

  **Commit**: YES
  - Message: `test(model-selection): add unit and API tests`
  - Files: `src/lib/model-selection/__tests__/*`, `src/gateway/routes/__tests__/*`
  - Pre-commit: `pnpm test -- --run`

- [x] 17. Telegram Notification

  **What to do**:
  - Send Telegram notification that the model selection engine is complete
  - Run: `tsx scripts/telegram-notify.ts "✅ Model Selection Engine complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (after Task 16)
  - **Blocks**: None
  - **Blocked By**: Task 16

  **References**:
  - `scripts/telegram-notify.ts` — notification script

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Preconditions: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID set
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ Model Selection Engine complete — All tasks done. Come back to review results."
      2. Assert: Exit code 0
    Expected Result: Notification delivered
    Failure Indicators: Error, missing env vars
    Evidence: .sisyphus/evidence/task-17-telegram.txt
  ```

  **Commit**: NO (no code change)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && pnpm lint && pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (create employee → see recommendations → select model → verify persisted). Test edge cases: empty catalog, all models filtered out. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group   | Message                                                                                  | Files                                                                                                           | Pre-commit           |
| ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| T1      | `feat(db): add model_catalog table with quality metrics`                                 | prisma/schema.prisma, prisma/migrations/\*                                                                      | `pnpm build`         |
| T2-T3   | `feat(model-selection): add shared types, constants, and tier computation`               | src/lib/model-selection/\*                                                                                      | `pnpm build`         |
| T4      | `feat(api): add model catalog CRUD endpoints`                                            | src/gateway/routes/admin-model-catalog.ts, src/gateway/middleware/\*                                            | `pnpm build`         |
| T5      | `feat(seed): add initial model catalog entries`                                          | prisma/seed.ts                                                                                                  | `pnpm build`         |
| T6-T8   | `feat(model-selection): add task profiler, matching engine, and recommendation endpoint` | src/lib/model-selection/\*, src/gateway/routes/admin-archetypes.ts                                              | `pnpm build`         |
| T9-T12  | `feat(integration): wire model engine into archetype creation, remove hardcoded model`   | src/gateway/services/archetype-generator.ts, src/gateway/routes/admin-archetypes.ts, dashboard/src/lib/types.ts | `pnpm build`         |
| T13-T15 | `feat(dashboard): add model catalog page, recommendation cards, and model selector`      | dashboard/src/pages/_, dashboard/src/components/_                                                               | `pnpm build`         |
| T16     | `test(model-selection): add unit and API tests`                                          | src/\*_/_.test.ts                                                                                               | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build           # Expected: success, no errors
pnpm lint            # Expected: no warnings or errors
pnpm test -- --run   # Expected: all passing (existing + new)
```

### Final Checklist

- [ ] All "Must Have" present and functional
- [ ] All "Must NOT Have" absent from codebase
- [ ] All existing tests still pass (no regressions)
- [ ] New tests cover tier computation, profiler, matcher, and API endpoints
- [ ] Employee creation flow shows user questions and model recommendations
- [ ] Model catalog CRUD works from dashboard
- [ ] No hardcoded `minimax/minimax-m2.7` in archetype-generator.ts postProcess
- [ ] `z.enum` expanded or replaced to accept any catalog model
- [ ] Dashboard `GenerateArchetypeResponse.model` is `string`, not literal type
