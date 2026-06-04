# Gateway Model Swap — Haiku 4.5 → DeepSeek V4 Flash

## TL;DR

> **Quick Summary**: Replace the hardcoded `anthropic/claude-haiku-4-5` gateway/judge model with `deepseek/deepseek-v4-flash`, make it configurable via `platform_settings`, and route through OpenCodeGo when available — eliminating ~$51/mo in OpenRouter spend.
>
> **Deliverables**:
>
> - `gateway_llm_model` platform setting (DB + dashboard + seed)
> - `call-llm.ts` reads model from platform setting, routes through Go when available
> - All 8 caller sites stop hardcoding the model
> - JSON parse retry in archetype generator
> - Updated tests and documentation
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (migration) → T3 (call-llm) → T4 (callers) → T5 (retry) → T7 (E2E) → F1-F4

---

## Context

### Original Request

User noticed ~$51/mo OpenRouter spend (mostly Haiku 4.5 for gateway calls) and asked whether newer models on the $10/mo OpenCodeGo subscription could replace it. After analysis, DeepSeek V4 Flash emerged as the clear winner: higher intelligence (AA 47.0 vs 37.1), comparable speed, already E2E verified in the system, and available on Go for $0 incremental cost.

### Interview Summary

**Key Discussions**:

- Audited all 8 Haiku call sites — 5 simple (classification, acks, estimation), 3 complex (archetype gen/refine, rule synthesis)
- User wants ALL 8 sites swapped (no Haiku fallback)
- Model should be a `platform_settings` entry, editable in dashboard
- Go routing should auto-detect (reuse `resolveProvider()` pattern)
- JSON parse retry for archetype generator as safety net
- Tests after implementation

**Research Findings**:

- Flash is 7-18× cheaper per token than Haiku even on OpenRouter
- Flash has AA 47.0 intelligence (85th percentile) vs Haiku's 37.1 (66th percentile)
- OpenCodeGo does NOT support Anthropic models — Haiku can never route through Go
- `go-models.ts` already has `deepseek/deepseek-v4-flash` in the Go model map
- Dashboard settings page dynamically renders all `platform_settings` rows — no UI code changes needed for adding a new row
- 29 total references to `claude-haiku` across source and test files

**CRITICAL — OpenCodeGo Two-Endpoint Architecture** (from https://opencode.ai/docs/go/):
Go models use two DIFFERENT API protocols depending on the model:

- **OpenAI-compatible** (`/chat/completions`): GLM-5, GLM-5.1, Kimi K2.5, K2.6, DeepSeek V4 Pro, V4 Flash, MiMo-V2.5, MiMo-V2.5-Pro — endpoint: `https://opencode.ai/zen/go/v1/chat/completions`
- **Anthropic-compatible** (`/messages`): MiniMax M3, M2.7, M2.5, Qwen3.7 Max, Qwen3.7 Plus, Qwen3.6 Plus — endpoint: `https://opencode.ai/zen/go/v1/messages`

Since `call-llm.ts` uses OpenAI chat format (raw fetch to `/chat/completions`), only the 8 OpenAI-compatible Go models can be routed through Go for gateway calls. The 6 Anthropic-compatible models MUST fall back to OpenRouter for gateway calls. The worker harness is unaffected — OpenCode handles endpoint routing internally via auth.json.

**OpenCodeGo Usage Limits** (from official docs):

- $10/mo subscription (not flat unlimited — metered against limits)
- 5-hour limit: $12 of usage
- Weekly limit: $30 of usage
- Monthly limit: $60 of usage
- DeepSeek V4 Flash: ~158,150 requests/month — gateway calls (~100-500/month, tiny tokens) are negligible

### Metis Review

**Identified Gaps** (all addressed):

- `go-models.ts` is in `src/workers/lib/` — importing into `src/lib/call-llm.ts` creates cross-boundary dependency → **Resolved**: Move `go-models.ts` to `src/lib/` where both gateway and worker can import it
- `getPlatformSetting()` makes a DB call — N+1 risk if called on every LLM request → **Resolved**: Add in-memory cache with 60s TTL (same pattern as circuit breaker cache)
- `is_required` flag for new setting → **Resolved**: Set `is_required = true` (consistent with all 8 existing settings)
- AGENTS.md says "Never change this" about Haiku → **Resolved**: Remove that constraint comment
- Tests reference `claude-haiku-4-5` in mock expectations → **Resolved**: Update test expectations
- Go routing failure mode → **Resolved**: Same as worker harness — if Go is down, request fails. Remove `OPENCODE_GO_API_KEY` to revert to OpenRouter.

---

## Work Objectives

### Core Objective

Eliminate ~$51/mo OpenRouter spend by replacing the gateway/judge model with DeepSeek V4 Flash routed through OpenCodeGo, while making the model configurable for future flexibility.

### Concrete Deliverables

- New `platform_settings` row: `gateway_llm_model` = `deepseek/deepseek-v4-flash`
- `src/lib/call-llm.ts` reads model from platform setting (cached, 60s TTL), routes through Go when available
- `src/lib/go-models.ts` (moved from `src/workers/lib/`) — shared between gateway and worker, with endpoint type metadata
- All 8 caller sites use the platform setting (no hardcoded model)
- JSON parse retry in `archetype-generator.ts`
- Updated Prisma seed, AGENTS.md, test files

### Definition of Done

- [ ] `grep -r "claude-haiku" src/ --include="*.ts" --include="*.mts"` returns 0 results
- [ ] `platform_settings` table has `gateway_llm_model` row with value `deepseek/deepseek-v4-flash`
- [ ] Archetype generation succeeds with Flash (wizard E2E)
- [ ] All existing tests pass (`pnpm test -- --run`)
- [ ] Dashboard settings page shows the new setting

### Must Have

- Gateway model read from `platform_settings` (not hardcoded)
- Go routing auto-detection in `call-llm.ts` using `resolveProvider()` — but ONLY for OpenAI-compatible Go models
- Correct Go API endpoint: `https://opencode.ai/zen/go/v1/chat/completions` (NOT `https://opencode.ai/api/v1/...`)
- Endpoint type metadata in `go-models.ts` to distinguish OpenAI-compatible vs Anthropic-compatible Go models
- In-memory cache for the platform setting (60s TTL)
- JSON parse retry (1 retry) in archetype generator
- Flash pricing entry in `PRICING_PER_1M_TOKENS`
- `is_required = true` for the new setting

### Must NOT Have (Guardrails)

- Do NOT add a model dropdown or validation UI to the dashboard settings page — plain text input only (same as existing settings)
- Do NOT make `PRICING_PER_1M_TOKENS` dynamic — hardcode Flash entry as static addition
- Do NOT add JSON parse retry to `rule-extractor.ts` or `rule-synthesizer.ts` — only `archetype-generator.ts`
- Do NOT add cost tracking/persistence for gateway calls (out of scope — gateway costs remain untracked)
- Do NOT modify `session-manager.ts`
- Do NOT modify worker harness Go routing logic (already done in previous plan)
- Do NOT add automatic failover (if Go is down and model is Go-only, call fails)
- Do NOT change deprecated files
- Do NOT add model string validation on `PATCH /admin/platform-settings/gateway_llm_model`
- Do NOT implement Anthropic messages format in `call-llm.ts` — Anthropic-format Go models fall back to OpenRouter

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **Library/Module**: Use Bash (vitest) — Run tests, verify pass count

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent):
├── Task 1: Prisma migration + seed for gateway_llm_model [quick]
├── Task 2: Move go-models.ts to src/lib/ + add endpoint type metadata [quick]
└── (2 tasks, both independent)

Wave 2 (Core changes — T3 first, then T4/T5 parallel, then T6):
├── Task 3: Modify call-llm.ts — platform setting + Go routing + Flash pricing (depends: T1, T2) [deep]
├── Task 4: Remove hardcoded model from all 8 caller sites (depends: T3) [unspecified-high]
├── Task 5: Add JSON parse retry in archetype-generator.ts (depends: T3) [quick]
└── Task 6: Update all test files (depends: T3, T4) [unspecified-high]

Wave 3 (Verification + docs):
├── Task 7: E2E smoke test — wizard + Go routing verification (depends: T4, T5, T6) [unspecified-high]
├── Task 8: Update AGENTS.md (depends: T3, T4) [quick]
└── Task 9: Send Telegram notification [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1 → T3 → T4 → T6 → T7 → F1-F4 → user okay
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task  | Depends On | Blocks         | Wave  |
| ----- | ---------- | -------------- | ----- |
| T1    | —          | T3             | 1     |
| T2    | —          | T3             | 1     |
| T3    | T1, T2     | T4, T5, T6, T8 | 2     |
| T4    | T3         | T6, T7         | 2     |
| T5    | T3         | T7             | 2     |
| T6    | T3, T4     | T7             | 2     |
| T7    | T4, T5, T6 | —              | 3     |
| T8    | T3, T4     | —              | 3     |
| T9    | T7         | —              | 3     |
| F1-F4 | ALL        | —              | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 4 tasks — T3 → `deep`, T4 → `unspecified-high`, T5 → `quick`, T6 → `unspecified-high`
- **Wave 3**: 3 tasks — T7 → `unspecified-high`, T8 → `quick`, T9 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `gateway_llm_model` platform setting (migration + seed)

  **What to do**:
  - Create a Prisma migration adding a new row to `platform_settings`:
    - `key`: `gateway_llm_model`
    - `value`: `deepseek/deepseek-v4-flash`
    - `description`: `LLM model used for gateway calls (classification, archetype generation, rule extraction). Must be a valid OpenRouter model ID. If available on OpenCodeGo and OPENCODE_GO_API_KEY is set, calls route through Go automatically.`
    - `is_required`: `true`
  - Update `prisma/seed.ts` to include this setting in the seed data (same pattern as existing 8 settings)
  - Run `pnpm prisma migrate deploy` and `pnpm prisma db seed` to apply
  - Reload PostgREST schema cache: `psql ... -c "NOTIFY pgrst, 'reload schema';"`

  **Must NOT do**:
  - Do NOT add model validation logic in the seed or migration
  - Do NOT modify the `platform_settings` table schema itself

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single migration + seed update, well-documented pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Look for existing `platform_settings` upsert pattern (search for `platformSetting` or `cost_limit_usd_per_day`)
  - `.sisyphus/plans/2026-06-01-2344-platform-settings-table.md` — Original plan that created the platform settings table, for migration pattern reference

  **API/Type References**:
  - `prisma/schema.prisma` — `PlatformSetting` model definition (fields: key, value, description, is_required, deleted_at)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Platform setting exists after migration
    Tool: Bash (psql)
    Preconditions: Migration applied, seed run
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT key, value, is_required FROM platform_settings WHERE key = 'gateway_llm_model';"
      2. Assert: 1 row returned
      3. Assert: value = 'deepseek/deepseek-v4-flash'
      4. Assert: is_required = true
    Expected Result: Row exists with correct value and is_required=true
    Failure Indicators: 0 rows, wrong value, is_required=false
    Evidence: .sisyphus/evidence/task-1-setting-exists.txt

  Scenario: Setting is readable via admin API
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. Run: source .env && curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/platform-settings | jq '.[] | select(.key == "gateway_llm_model")'
      2. Assert: JSON object returned with key, value, description fields
    Expected Result: Non-null JSON object with value = 'deepseek/deepseek-v4-flash'
    Failure Indicators: null, empty response, 404
    Evidence: .sisyphus/evidence/task-1-api-readable.txt

  Scenario: Setting is editable via admin API
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. Run: source .env && curl -s -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" http://localhost:7700/admin/platform-settings/gateway_llm_model -d '{"value": "deepseek/deepseek-v4-flash"}' | jq '.value'
      2. Assert: Returns "deepseek/deepseek-v4-flash"
    Expected Result: 200 OK with updated value
    Failure Indicators: 404, 500, wrong value
    Evidence: .sisyphus/evidence/task-1-api-editable.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add gateway_llm_model platform setting`
  - Files: `prisma/migrations/*/migration.sql`, `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Move `go-models.ts` to `src/lib/` and add endpoint type metadata

  **What to do**:
  - Move `src/workers/lib/go-models.ts` to `src/lib/go-models.ts`
  - Move `src/workers/lib/__tests__/go-models.test.ts` to the appropriate test location (same relative structure)
  - Update ALL import paths that reference the old location:
    - `src/workers/opencode-harness.mts` — imports `resolveProvider` from `./lib/go-models.js`
    - Any test files that import from the old path
  - **Add endpoint type metadata** — Go models use TWO different API protocols. Add this to the file so `call-llm.ts` can determine which Go models are compatible with the OpenAI chat format:

    ```typescript
    // OpenAI-compatible models use /chat/completions endpoint
    // Anthropic-compatible models use /messages endpoint (NOT supported by call-llm.ts)
    export type GoEndpointType = 'openai' | 'anthropic';

    export const GO_ENDPOINT_TYPE: Map<string, GoEndpointType> = new Map([
      // OpenAI-compatible — can be used by both worker harness AND gateway (call-llm.ts)
      ['deepseek-v4-flash', 'openai'],
      ['deepseek-v4-pro', 'openai'],
      ['glm-5.1', 'openai'],
      ['glm-5', 'openai'],
      ['kimi-k2.5', 'openai'],
      ['kimi-k2.6', 'openai'],
      ['mimo-v2.5', 'openai'],
      ['mimo-v2.5-pro', 'openai'],
      // Anthropic-compatible — worker harness only (OpenCode handles routing internally)
      // call-llm.ts CANNOT use these through Go (uses OpenAI chat format)
      ['minimax-m3', 'anthropic'],
      ['minimax-m2.7', 'anthropic'],
      ['minimax-m2.5', 'anthropic'],
      ['qwen3.7-max', 'anthropic'],
      ['qwen3.7-plus', 'anthropic'],
      ['qwen3.6-plus', 'anthropic'],
    ]);

    export const GO_OPENAI_ENDPOINT = 'https://opencode.ai/zen/go/v1/chat/completions';
    ```

  - **Update `ResolvedProvider`** to include the endpoint type:
    ```typescript
    export interface ResolvedProvider {
      providerID: string;
      modelID: string;
      goEndpointType?: GoEndpointType; // Only set when providerID === 'opencode-go'
    }
    ```
  - **Update `resolveProvider()`** to populate `goEndpointType` from `GO_ENDPOINT_TYPE` map when resolving to Go.
  - **Update tests** to cover the new endpoint type field and the two constants.
  - Verify no broken imports remain: `pnpm build`

  **Must NOT do**:
  - Do NOT change the `GO_MODEL_MAP` entries (just add the metadata alongside)
  - Do NOT change the core routing logic in `resolveProvider()` — only add the `goEndpointType` field to the result
  - Do NOT modify any logic in `opencode-harness.mts` beyond the import path

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File move + metadata addition, no complex logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/go-models.ts` — The file being moved (39 lines, exports `GO_MODEL_MAP`, `ResolvedProvider`, `resolveProvider`)
  - `src/workers/opencode-harness.mts:13` — Current import: `import { resolveProvider } from './lib/go-models.js';`

  **External References**:
  - https://opencode.ai/docs/go/ — The Endpoints table shows which models use `/chat/completions` (OpenAI, `@ai-sdk/openai-compatible`) vs `/messages` (Anthropic, `@ai-sdk/anthropic`). This is the authoritative source for the `GO_ENDPOINT_TYPE` mapping.

  **WHY Each Reference Matters**:
  - The official Go docs explicitly list each model's endpoint and AI SDK package — this is where the openai/anthropic split comes from. DeepSeek, GLM, Kimi, MiMo use the OpenAI-compatible endpoint. MiniMax, Qwen use the Anthropic endpoint.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: File exists at new location, not old
    Tool: Bash (ls)
    Preconditions: File moved
    Steps:
      1. Run: ls -la src/lib/go-models.ts
      2. Assert: file exists
      3. Run: ls -la src/workers/lib/go-models.ts
      4. Assert: file does NOT exist (moved, not copied)
    Expected Result: File at src/lib/go-models.ts, not at src/workers/lib/go-models.ts
    Evidence: .sisyphus/evidence/task-2-file-moved.txt

  Scenario: Endpoint type metadata covers all 14 Go models
    Tool: Bash (vitest)
    Preconditions: GO_ENDPOINT_TYPE map populated
    Steps:
      1. Write test: for each entry in GO_MODEL_MAP, assert GO_ENDPOINT_TYPE has corresponding entry
      2. Assert GO_ENDPOINT_TYPE.size === 14
      3. Assert 8 entries are 'openai', 6 are 'anthropic'
    Expected Result: All 14 models have endpoint type, correct split
    Evidence: .sisyphus/evidence/task-2-endpoint-metadata.txt

  Scenario: resolveProvider returns goEndpointType for Go models
    Tool: Bash (vitest)
    Preconditions: resolveProvider updated
    Steps:
      1. Call resolveProvider('deepseek/deepseek-v4-flash', true)
      2. Assert: { providerID: 'opencode-go', modelID: 'deepseek-v4-flash', goEndpointType: 'openai' }
      3. Call resolveProvider('minimax/minimax-m3', true)
      4. Assert: { providerID: 'opencode-go', modelID: 'minimax-m3', goEndpointType: 'anthropic' }
      5. Call resolveProvider('anthropic/claude-haiku-4-5', true)
      6. Assert: { providerID: 'openrouter', ..., goEndpointType: undefined }
    Expected Result: Correct endpoint type for each category
    Evidence: .sisyphus/evidence/task-2-resolve-endpoint.txt

  Scenario: Build succeeds with new import paths
    Tool: Bash
    Preconditions: All imports updated
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: No TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-2-build-pass.txt

  Scenario: All existing go-models tests pass
    Tool: Bash
    Preconditions: Test file moved alongside source
    Steps:
      1. Run: pnpm test -- --run go-models
      2. Assert: All tests pass (existing 8 + new endpoint type tests)
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-2-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `refactor: move go-models to src/lib with endpoint type metadata`
  - Files: `src/lib/go-models.ts`, `src/workers/opencode-harness.mts`, test files
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Modify `call-llm.ts` — platform setting + Go routing + Flash pricing

  **What to do**:
  - **Add Flash pricing** to `PRICING_PER_1M_TOKENS`:
    ```
    'deepseek/deepseek-v4-flash': { prompt: 0.14, completion: 0.28 },
    ```
  - **Add gateway model cache** — in-memory cache with 60s TTL (same pattern as `COST_CACHE`):

    ```typescript
    const GATEWAY_MODEL_CACHE: { value: string | null; refreshedAt: Date | null } = {
      value: null,
      refreshedAt: null,
    };
    const GATEWAY_MODEL_CACHE_TTL_MS = 60 * 1000;

    async function getGatewayModel(): Promise<string> {
      const now = new Date();
      const expired =
        GATEWAY_MODEL_CACHE.refreshedAt === null ||
        now.getTime() - GATEWAY_MODEL_CACHE.refreshedAt.getTime() > GATEWAY_MODEL_CACHE_TTL_MS;
      if (expired) {
        GATEWAY_MODEL_CACHE.value = await getPlatformSetting('gateway_llm_model');
        GATEWAY_MODEL_CACHE.refreshedAt = now;
      }
      return GATEWAY_MODEL_CACHE.value!;
    }
    ```

  - **Make `model` optional** in `CallLLMOptions` — when omitted, use `getGatewayModel()`. Update the interface:
    ```typescript
    export interface CallLLMOptions {
      model?: string; // Optional — defaults to gateway_llm_model platform setting
      // ... rest unchanged
    }
    ```
  - **Add Go routing** — Import `resolveProvider`, `GO_OPENAI_ENDPOINT` from `src/lib/go-models.js`. In `callLLM()`, after resolving the model:
    1. Call `resolveProvider(model, !!process.env.OPENCODE_GO_API_KEY)`
    2. If provider is `opencode-go` AND `goEndpointType === 'openai'`: use `GO_OPENAI_ENDPOINT` (`https://opencode.ai/zen/go/v1/chat/completions`) as URL, use `OPENCODE_GO_API_KEY` for auth header
    3. If provider is `opencode-go` AND `goEndpointType === 'anthropic'`: **fall back to OpenRouter** — `call-llm.ts` uses OpenAI chat format and cannot speak Anthropic messages format. Log a warning: `"Model {model} uses Anthropic format on Go — falling back to OpenRouter for gateway call"`
    4. If provider is `openrouter`: use existing OpenRouter URL and key (current behavior)
    5. The resolved Go `modelID` (e.g., `deepseek-v4-flash` without vendor prefix) should be sent in the request body `model` field when routing through Go
    6. Log the provider selection at info level: `"Gateway LLM call — provider: {provider}, model: {model}"`
  - **Update the comment** on line 14 — remove "ONLY approved models" constraint, update to reflect configurable model
  - **Update error message** on line 187 — currently says "OpenRouter returned..." but may now be a Go error. Make it generic: `"LLM provider returned {status}: {body}"`
  - **Export `_resetGatewayModelCache`** for testing (same pattern as `_resetAlertState`)

  **Must NOT do**:
  - Do NOT modify the circuit breaker logic
  - Do NOT add cost persistence for gateway calls
  - Do NOT add automatic failover (if Go fails, let it fail — except for the Anthropic-format fallback which is by design)
  - Do NOT change retry logic (still only retries on 429)
  - Do NOT change the `CallLLMResult` interface
  - Do NOT implement Anthropic messages format — just fall back to OpenRouter for those models

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core infrastructure change — must understand call-llm.ts deeply, handle Go routing correctly with two endpoint types, maintain backward compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2 start)
  - **Blocks**: Tasks 4, 5, 6, 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/lib/call-llm.ts` — Full file (211 lines). Study: `COST_CACHE` pattern (lines 43-47) for model cache implementation, `PRICING_PER_1M_TOKENS` (lines 32-35) for pricing entry pattern, `callLLM()` function (lines 130-211) for where to add routing logic, `OPENROUTER_URL` constant (line 108) for endpoint pattern
  - `src/lib/go-models.ts` (after Task 2 moves it) — `resolveProvider()` returns `{ providerID, modelID, goEndpointType }`, `GO_OPENAI_ENDPOINT` constant is `https://opencode.ai/zen/go/v1/chat/completions`

  **API/Type References**:
  - `src/lib/platform-settings.ts` — `getPlatformSetting(key: string): Promise<string>` — throws if key not found
  - Go endpoint (OpenAI-compatible): `https://opencode.ai/zen/go/v1/chat/completions` — same request/response format as OpenRouter's `/chat/completions`
  - Auth header for Go: `Authorization: Bearer ${process.env.OPENCODE_GO_API_KEY}`
  - Go model IDs do NOT include vendor prefix (e.g., `deepseek-v4-flash` not `deepseek/deepseek-v4-flash`)

  **External References**:
  - https://opencode.ai/docs/go/ — Endpoints table confirms: DeepSeek V4 Flash uses `https://opencode.ai/zen/go/v1/chat/completions` with `@ai-sdk/openai-compatible`. MiniMax/Qwen models use `https://opencode.ai/zen/go/v1/messages` with `@ai-sdk/anthropic`.

  **WHY Each Reference Matters**:
  - `call-llm.ts` is the ONLY file being modified — study it completely before editing
  - `go-models.ts` provides both the routing decision AND the endpoint type — essential for knowing whether to route through Go or fall back
  - The Go docs URL is the authoritative source for the correct endpoint — using the wrong URL was a critical bug in the previous plan draft

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: callLLM uses platform setting model when no model specified
    Tool: Bash (vitest)
    Preconditions: Platform setting seeded with 'deepseek/deepseek-v4-flash'
    Steps:
      1. Write a test that calls callLLM without model param
      2. Mock getPlatformSetting to return 'deepseek/deepseek-v4-flash'
      3. Mock fetch to capture the request body
      4. Assert request body contains model: 'deepseek-v4-flash' (Go model ID, no vendor prefix)
    Expected Result: Platform setting model is used
    Evidence: .sisyphus/evidence/task-3-default-model.txt

  Scenario: callLLM routes through Go for OpenAI-compatible model
    Tool: Bash (vitest)
    Preconditions: OPENCODE_GO_API_KEY set, model is deepseek/deepseek-v4-flash (OpenAI-compatible)
    Steps:
      1. Set process.env.OPENCODE_GO_API_KEY = 'test-key'
      2. Call callLLM with model 'deepseek/deepseek-v4-flash'
      3. Assert fetch was called with URL 'https://opencode.ai/zen/go/v1/chat/completions'
      4. Assert Authorization header uses OPENCODE_GO_API_KEY value
      5. Assert request body model field is 'deepseek-v4-flash' (not 'deepseek/deepseek-v4-flash')
    Expected Result: Request routed to correct Go endpoint with correct model ID
    Evidence: .sisyphus/evidence/task-3-go-routing.txt

  Scenario: callLLM falls back to OpenRouter for Anthropic-compatible Go model
    Tool: Bash (vitest)
    Preconditions: OPENCODE_GO_API_KEY set, model is 'minimax/minimax-m3' (Anthropic-compatible on Go)
    Steps:
      1. Set process.env.OPENCODE_GO_API_KEY = 'test-key'
      2. Call callLLM with model 'minimax/minimax-m3'
      3. Assert fetch was called with OpenRouter URL (NOT Go endpoint)
      4. Assert Authorization header uses OPENROUTER_API_KEY
      5. Assert a warning was logged about Anthropic format fallback
    Expected Result: Anthropic-format model falls back to OpenRouter, warning logged
    Evidence: .sisyphus/evidence/task-3-anthropic-fallback.txt

  Scenario: callLLM falls back to OpenRouter for non-Go model
    Tool: Bash (vitest)
    Preconditions: OPENCODE_GO_API_KEY set, model is 'anthropic/claude-haiku-4-5' (not on Go list)
    Steps:
      1. Set process.env.OPENCODE_GO_API_KEY = 'test-key'
      2. Call callLLM with model 'anthropic/claude-haiku-4-5'
      3. Assert fetch was called with OpenRouter URL
      4. Assert Authorization header uses OPENROUTER_API_KEY
    Expected Result: Non-Go model always routes to OpenRouter
    Evidence: .sisyphus/evidence/task-3-openrouter-fallback.txt

  Scenario: callLLM uses OpenRouter when OPENCODE_GO_API_KEY is not set
    Tool: Bash (vitest)
    Preconditions: OPENCODE_GO_API_KEY not set
    Steps:
      1. Delete process.env.OPENCODE_GO_API_KEY
      2. Call callLLM with model 'deepseek/deepseek-v4-flash'
      3. Assert fetch was called with OpenRouter URL
    Expected Result: Always OpenRouter when Go key absent
    Evidence: .sisyphus/evidence/task-3-no-go-key.txt

  Scenario: Gateway model cache works (60s TTL)
    Tool: Bash (vitest)
    Preconditions: Platform setting exists
    Steps:
      1. Call callLLM twice in quick succession (< 60s apart)
      2. Assert getPlatformSetting was called only once (cached)
      3. Advance time by 61s (vi.advanceTimersByTime)
      4. Call callLLM again
      5. Assert getPlatformSetting was called again (cache expired)
    Expected Result: DB called once per 60s, not per request
    Evidence: .sisyphus/evidence/task-3-cache-ttl.txt

  Scenario: Flash pricing entry produces correct cost estimates
    Tool: Bash (vitest)
    Preconditions: Pricing table has Flash entry
    Steps:
      1. Call callLLM with model 'deepseek/deepseek-v4-flash'
      2. Mock response with 1000 prompt tokens, 500 completion tokens
      3. Assert estimatedCostUsd = (1000 * 0.14 + 500 * 0.28) / 1_000_000 = 0.00028
    Expected Result: Non-zero, correctly computed cost
    Evidence: .sisyphus/evidence/task-3-flash-pricing.txt
  ```

  **Commit**: YES
  - Message: `feat(gateway): route LLM calls through Go with configurable model`
  - Files: `src/lib/call-llm.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Remove hardcoded model from all 8 caller sites

  **What to do**:
  - Remove `model: 'anthropic/claude-haiku-4-5'` from all 8 call sites. Since `model` is now optional in `CallLLMOptions` (defaults to platform setting), simply delete the `model` property from each `callLLM()` call.
  - **8 call sites across 6 files**:
    1. `src/gateway/services/interaction-classifier.ts:22` — `classifyIntent()`
    2. `src/inngest/interaction-handler.ts:348` — question answering
    3. `src/inngest/interaction-handler.ts:385` — feedback acknowledgment
    4. `src/inngest/rule-extractor.ts:121` — `extract-rule` step
    5. `src/inngest/rule-synthesizer.ts:107` — `detect-overlaps` step
    6. `src/gateway/services/archetype-generator.ts:553` — `generate()`
    7. `src/gateway/services/archetype-generator.ts:619` — `refine()`
    8. `src/gateway/services/time-estimator.ts:36` — `estimate()`
  - After removal, verify with: `grep -r "claude-haiku" src/ --include="*.ts" --include="*.mts"` → 0 results

  **Must NOT do**:
  - Do NOT change ANY logic in the caller files — only remove the `model` property from `callLLM()` calls
  - Do NOT change prompt text, temperature, maxTokens, or any other parameter
  - Do NOT add any new imports to the caller files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 8 edits across 6 files — must be thorough and not miss any
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T3)
  - **Parallel Group**: Wave 2 (after T3, but T5 can run in parallel with T4)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - All 6 caller files listed above — each has a `callLLM({ model: 'anthropic/claude-haiku-4-5', ... })` call where the `model` line should be deleted

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No Haiku references remain in source code
    Tool: Bash (grep)
    Preconditions: All 8 sites edited
    Steps:
      1. Run: grep -r "claude-haiku" src/ --include="*.ts" --include="*.mts"
      2. Assert: 0 results
    Expected Result: Zero matches — all Haiku references removed from source
    Failure Indicators: Any match in src/ (test files are handled in Task 6)
    Evidence: .sisyphus/evidence/task-4-no-haiku-refs.txt

  Scenario: Build succeeds after removal
    Tool: Bash
    Preconditions: All model properties removed
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0, no TypeScript errors
    Expected Result: Clean build — model is optional so removing it is type-safe
    Evidence: .sisyphus/evidence/task-4-build-pass.txt
  ```

  **Commit**: YES
  - Message: `refactor(gateway): remove hardcoded model from all LLM callers`
  - Files: `src/gateway/services/interaction-classifier.ts`, `src/gateway/services/archetype-generator.ts`, `src/gateway/services/time-estimator.ts`, `src/inngest/interaction-handler.ts`, `src/inngest/rule-extractor.ts`, `src/inngest/rule-synthesizer.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Add JSON parse retry in `archetype-generator.ts`

  **What to do**:
  - In `ArchetypeGenerator.generate()` and `ArchetypeGenerator.refine()`, wrap the `JSON.parse()` call with a single retry:
    1. First attempt: call `callLLM()`, strip fences, `JSON.parse()`
    2. If `JSON.parse()` throws (SyntaxError): call `callLLM()` again with the SAME messages PLUS an additional user message: `"Your previous response was not valid JSON. Please respond with ONLY a valid JSON object matching the required schema. No explanations, no markdown, just the JSON."`
    3. Second attempt: strip fences, `JSON.parse()`. If this also fails, throw the original error.
  - Log a warning when the retry fires (so we can monitor Flash's JSON reliability)
  - Extract the retry logic into a private method `callLLMWithJsonRetry()` to avoid duplicating between generate and refine

  **Must NOT do**:
  - Do NOT add JSON retry to `rule-extractor.ts` or `rule-synthesizer.ts`
  - Do NOT change the prompt content (only add the retry nudge message on failure)
  - Do NOT add more than 1 retry
  - Do NOT change temperature or maxTokens for the retry call

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused change in one file, clear spec
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run alongside T4)
  - **Parallel Group**: Wave 2 (parallel with T4)
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts:545-570` — `generate()` method, see the `callLLM()` call and subsequent `JSON.parse()` with `stripFences()`
  - `src/gateway/services/archetype-generator.ts:610-640` — `refine()` method, same pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Valid JSON on first attempt — no retry
    Tool: Bash (vitest)
    Preconditions: callLLM mocked to return valid JSON on first call
    Steps:
      1. Call generate() with a description
      2. Assert callLLM was called exactly once
      3. Assert result is a valid parsed object
    Expected Result: Single call, successful parse
    Evidence: .sisyphus/evidence/task-5-no-retry.txt

  Scenario: Invalid JSON on first attempt — retry succeeds
    Tool: Bash (vitest)
    Preconditions: callLLM mocked to return "Sure! Here's the JSON: {..." on first call, valid JSON on second
    Steps:
      1. Call generate() with a description
      2. Assert callLLM was called exactly twice
      3. Assert second call includes the retry nudge message
      4. Assert result is a valid parsed object from the retry
    Expected Result: Two calls, second succeeds, warning logged
    Evidence: .sisyphus/evidence/task-5-retry-success.txt

  Scenario: Invalid JSON on both attempts — error thrown
    Tool: Bash (vitest)
    Preconditions: callLLM mocked to return invalid JSON on both calls
    Steps:
      1. Call generate() with a description
      2. Assert callLLM was called exactly twice
      3. Assert the function throws (GENERATION_FAILED or similar)
    Expected Result: Two calls, both fail, error propagated
    Evidence: .sisyphus/evidence/task-5-retry-fail.txt
  ```

  **Commit**: YES
  - Message: `feat(gateway): add JSON parse retry for archetype generation`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Update all test files for configurable gateway model

  **What to do**:
  - Update ALL test files that reference `claude-haiku-4-5` — these tests currently assert the hardcoded model and will fail after Tasks 3-4.
  - **Test files to update** (from grep results):
    1. `src/gateway/services/__tests__/archetype-generator-code.test.ts:12`
    2. `src/gateway/services/__tests__/time-estimator.test.ts:10`
    3. `tests/gateway/services/interaction-classifier.test.ts:14,78,81`
    4. `tests/gateway/services/interaction-classifier-injection.test.ts:11`
    5. `tests/inngest/interaction-handler-injection.test.ts:6,119`
    6. `tests/inngest/lifecycle-feedback-context-rejection.test.ts:134`
    7. `tests/inngest/feedback-injection.test.ts:170`
    8. `tests/inngest/rule-synthesis.test.ts:17,145,294`
    9. `tests/inngest/rule-extractor.test.ts:8,105,237,363,393,401`
  - For each test: change `model: 'anthropic/claude-haiku-4-5'` expectations to match the new behavior. Since callers no longer pass `model`, tests should either:
    - Mock `getPlatformSetting` to return `'deepseek/deepseek-v4-flash'` and assert that model is used, OR
    - Remove the model assertion if the test is checking something else (e.g., prompt content)
  - For `interaction-classifier.test.ts:78` which has a specific test "uses anthropic/claude-haiku-4-5 model for classification" — rename and update this test to verify the platform setting is used instead
  - Run `pnpm test -- --run` and ensure all tests pass
  - Verify: `grep -r "claude-haiku" tests/ --include="*.ts"` → 0 results

  **Must NOT do**:
  - Do NOT change test logic beyond the model expectations
  - Do NOT delete any tests — update them
  - Do NOT add new tests beyond what's needed for model expectation updates

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Many test files to update (9 files, ~25 references), must be thorough
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after T3 and T4 to know the final interface)
  - **Parallel Group**: Wave 2 (after T4)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - Each test file listed above — search for `claude-haiku` to find exact lines
  - `src/lib/platform-settings.ts` — `getPlatformSetting()` is the function tests will need to mock

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: All test files updated
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: 0 failures
    Expected Result: All tests pass (expected: ~1490 pass, ~27 skip)
    Evidence: .sisyphus/evidence/task-6-tests-pass.txt

  Scenario: No Haiku references in test files
    Tool: Bash (grep)
    Preconditions: All test expectations updated
    Steps:
      1. Run: grep -r "claude-haiku" tests/ --include="*.ts"
      2. Run: grep -r "claude-haiku" src/ --include="*.test.ts"
      3. Assert: 0 results from both
    Expected Result: Zero Haiku references in any test file
    Evidence: .sisyphus/evidence/task-6-no-haiku-tests.txt
  ```

  **Commit**: YES
  - Message: `test: update LLM caller tests for configurable gateway model`
  - Files: All test files listed above
  - Pre-commit: `pnpm test -- --run`

- [x] 7. E2E smoke test — wizard + Go routing verification

  **What to do**:
  - **Prerequisite**: Ensure `pnpm dev` is running and Docker image is rebuilt (`docker build -t ai-employee-worker:latest .`)
  - **Test 1 — Archetype generation with Flash**:
    1. Call the archetype generation endpoint with a simple description
    2. Verify the response is valid JSON with non-empty fields (role_name, identity, execution_steps)
    3. This proves Flash can handle the most complex gateway call (6000-token JSON)
  - **Test 2 — Go routing verification**:
    1. Check gateway logs for provider selection when `OPENCODE_GO_API_KEY` is set
    2. Verify the log shows `opencode-go` as provider for `deepseek/deepseek-v4-flash`
    3. Verify the log shows the correct Go endpoint URL (`opencode.ai/zen/go/v1/chat/completions`)
  - **Test 3 — Dashboard settings page**:
    1. Navigate to `http://localhost:7700/dashboard/settings?tenant=00000000-0000-0000-0000-000000000003`
    2. Verify `gateway_llm_model` row is visible
    3. Verify the value shows `deepseek/deepseek-v4-flash`
  - Save all evidence to `.sisyphus/evidence/`

  **Must NOT do**:
  - Do NOT trigger a full employee lifecycle (just the gateway calls)
  - Do NOT modify any code — this is a verification-only task

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-tool verification requiring curl, log inspection, and Playwright
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after all implementation)
  - **Blocks**: —
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **API/Type References**:
  - `POST /admin/tenants/:tenantId/archetypes/generate` — Archetype generation endpoint
  - `GET /admin/platform-settings` — Settings API

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype generation succeeds with Flash via Go
    Tool: Bash (curl)
    Preconditions: Gateway running, OPENCODE_GO_API_KEY set, platform setting = deepseek/deepseek-v4-flash
    Steps:
      1. Run: source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/generate" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"description": "Send a daily motivational quote to the team Slack channel every morning"}' | jq '{role_name: .role_name, has_identity: (.identity | length > 0), has_steps: (.execution_steps | length > 0)}'
      2. Assert: role_name is non-empty
      3. Assert: has_identity = true
      4. Assert: has_steps = true
    Expected Result: Valid archetype JSON with all required fields populated
    Failure Indicators: 422 GENERATION_FAILED, empty fields, curl error
    Evidence: .sisyphus/evidence/task-7-wizard-flash.txt

  Scenario: Go routing confirmed in gateway logs
    Tool: Bash (grep)
    Preconditions: Gateway running with OPENCODE_GO_API_KEY set
    Steps:
      1. Trigger archetype generation (above)
      2. Run: grep "opencode-go" /tmp/ai-dev.log | tail -5
      3. Assert: log entry shows provider = opencode-go
      4. Assert: log entry shows endpoint containing 'opencode.ai/zen/go'
    Expected Result: Logs confirm Go routing with correct endpoint
    Failure Indicators: Logs show 'openrouter' instead, or no provider log at all
    Evidence: .sisyphus/evidence/task-7-go-routing-logs.txt

  Scenario: Dashboard settings shows gateway_llm_model
    Tool: Playwright
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. Navigate to http://localhost:7700/dashboard/settings?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for page load (settings table visible)
      3. Assert: text "gateway_llm_model" is visible on the page
      4. Assert: text "deepseek/deepseek-v4-flash" is visible on the page
      5. Take screenshot
    Expected Result: Setting row visible with correct value
    Evidence: .sisyphus/evidence/task-7-dashboard-settings.png
  ```

  **Commit**: NO (verification only)

- [x] 8. Update AGENTS.md documentation

  **What to do**:
  - **Remove the "Never change this" constraint** — In the "Approved LLM Models" table, update the row for verification/judge model:
    - Old: `anthropic/claude-haiku-4-5` | `Hardcoded in call-llm.ts. Never change this.`
    - New: Update to reflect that the gateway model is now configurable via `platform_settings` table (`gateway_llm_model` key). Default: `deepseek/deepseek-v4-flash`. Routed through OpenCodeGo when `OPENCODE_GO_API_KEY` is set and the model is OpenAI-compatible on Go; Anthropic-format Go models fall back to OpenRouter.
  - **Update the "Forbidden in hardcoded references"** section — remove `anthropic/claude-haiku-4-5` from the forbidden list since it's no longer hardcoded
  - **Update the "OpenCode Worker" section** — mention that `go-models.ts` moved from `src/workers/lib/` to `src/lib/` and is now shared between gateway and worker
  - **Add OpenCodeGo usage limits** — Document in the OpenCode Worker section or near the Go routing docs:
    - $10/mo subscription with metered limits: $12/5hr, $30/week, $60/month
    - Gateway calls are negligible (~$0.50/mo at typical volume)
    - Track usage at https://opencode.ai/auth
  - **Add Go two-endpoint note** — Document that Go models use two API formats (OpenAI-compatible vs Anthropic-compatible) and that `call-llm.ts` gateway routing only works with OpenAI-compatible models. Worker harness handles both formats via OpenCode internally.
  - **Add platform setting** reference — note the new `gateway_llm_model` setting in the Database section
  - Verify: `grep "Never change this" AGENTS.md` → 0 results

  **Must NOT do**:
  - Do NOT add employee-specific content to AGENTS.md
  - Do NOT change the Approved Models table structure — just update the content
  - Do NOT remove the entire verification model row — update it

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation update, clear spec
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run alongside T7)
  - **Parallel Group**: Wave 3 (parallel with T7)
  - **Blocks**: —
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `AGENTS.md` — "Approved LLM Models" table, "Forbidden in hardcoded references" section, "OpenCode Worker" section, Database section

  **External References**:
  - https://opencode.ai/docs/go/ — Authoritative source for Go usage limits, pricing, endpoint types, model list

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: "Never change this" removed from AGENTS.md
    Tool: Bash (grep)
    Steps:
      1. Run: grep "Never change this" AGENTS.md
      2. Assert: 0 results
    Expected Result: Constraint comment removed
    Evidence: .sisyphus/evidence/task-8-no-never-change.txt

  Scenario: Gateway model documentation is accurate
    Tool: Bash (grep)
    Steps:
      1. Run: grep "gateway_llm_model" AGENTS.md
      2. Assert: at least 1 result referencing the platform setting
      3. Run: grep "deepseek/deepseek-v4-flash" AGENTS.md
      4. Assert: at least 1 result
    Expected Result: New model and setting documented
    Evidence: .sisyphus/evidence/task-8-docs-accurate.txt

  Scenario: Go usage limits documented
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "usage limit" AGENTS.md
      2. Assert: at least 1 result mentioning the $60/month or per-hour limits
    Expected Result: Usage limits are documented for team awareness
    Evidence: .sisyphus/evidence/task-8-limits-documented.txt

  Scenario: Two-endpoint architecture documented
    Tool: Bash (grep)
    Steps:
      1. Run: grep "openai-compatible\|Anthropic-compatible\|/zen/go/" AGENTS.md
      2. Assert: at least 1 result explaining the endpoint split
    Expected Result: Two-endpoint architecture documented
    Evidence: .sisyphus/evidence/task-8-endpoints-documented.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md for gateway model swap to configurable Flash`
  - Files: `AGENTS.md`
  - Pre-commit: —

- [x] 9. Send Telegram notification

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "📋 Gateway model swap complete — Haiku 4.5 replaced with DeepSeek V4 Flash. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 7

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`
      **RESULT**: APPROVE — haiku pricing entry removed, rate limit error genericized. `grep -r "claude-haiku" src/` → 0 results. All DoD criteria met.

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` and `pnpm build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify `grep -r "claude-haiku" src/ --include="*.ts" --include="*.mts"` returns 0 results.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Haiku refs [N] | Files [N clean/N issues] | VERDICT`
      **RESULT**: APPROVE — Build PASS, tests pass (1 pre-existing Hostfully failure unrelated), 0 haiku refs, code clean.

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run the archetype generation wizard with Flash — verify JSON output parses correctly. Test interaction classification (if possible via curl). Verify dashboard settings page shows `gateway_llm_model` row. Verify Go routing logs appear when `OPENCODE_GO_API_KEY` is set. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`
      **RESULT**: APPROVE — 5/5 scenarios pass, Go routing confirmed in logs, dashboard shows setting, JSON retry fired and recovered correctly in live E2E.

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log/diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`
      **RESULT**: APPROVE — All 9 tasks compliant, no scope creep, no forbidden patterns, no unaccounted files.

---

## Commit Strategy

| Commit # | Message                                                               | Files                  | Pre-commit           |
| -------- | --------------------------------------------------------------------- | ---------------------- | -------------------- |
| 1        | `feat(db): add gateway_llm_model platform setting`                    | migration, seed        | `pnpm test -- --run` |
| 2        | `refactor: move go-models to src/lib with endpoint type metadata`     | go-models.ts, imports  | `pnpm test -- --run` |
| 3        | `feat(gateway): route LLM calls through Go with configurable model`   | call-llm.ts            | `pnpm test -- --run` |
| 4        | `refactor(gateway): remove hardcoded model from all LLM callers`      | 6 caller files         | `pnpm test -- --run` |
| 5        | `feat(gateway): add JSON parse retry for archetype generation`        | archetype-generator.ts | `pnpm test -- --run` |
| 6        | `test: update LLM caller tests for configurable gateway model`        | test files             | `pnpm test -- --run` |
| 7        | `docs: update AGENTS.md for gateway model swap to configurable Flash` | AGENTS.md              | —                    |

---

## Success Criteria

### Verification Commands

```bash
# No Haiku references remain in source
grep -r "claude-haiku" src/ --include="*.ts" --include="*.mts"
# Expected: 0 results

# Platform setting exists
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT key, value FROM platform_settings WHERE key = 'gateway_llm_model';"
# Expected: 1 row, value = 'deepseek/deepseek-v4-flash'

# Setting readable via API
source .env && curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  http://localhost:7700/admin/platform-settings | jq '.[] | select(.key == "gateway_llm_model")'
# Expected: non-null object

# All tests pass
pnpm test -- --run
# Expected: 0 failures

# Build succeeds
pnpm build
# Expected: exit 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Dashboard settings page shows gateway_llm_model
- [ ] Archetype generation works with Flash
