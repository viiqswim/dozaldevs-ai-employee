# OpenCode Go Model Catalog Expansion

## TL;DR

> **Quick Summary**: Add all 14 OpenCode Go subscription models to the model catalog with accurate pricing/benchmark data, and add `strengths`/`weaknesses` text columns so each model has clear usage guidance.
>
> **Deliverables**:
>
> - Two new DB columns (`strengths`, `weaknesses`) on `model_catalog`
> - 13 new model entries in the catalog (+ update existing MiniMax M2.7)
> - Dashboard UI updated to show/edit strengths and weaknesses
> - Seed file updated for persistence across DB resets
> - AGENTS.md updated with expanded catalog list
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (migration) → Task 2 (API schema) → Task 3 (dashboard) → Tasks 4–7 (scrape + seed) → Task 8 (AGENTS.md) → Task 9 (notify) → F1–F4 (verification)

---

## Context

### Original Request

Add all 14 OpenCode Go subscription models into the model catalog database. Add a new field describing strengths/weaknesses and when to use each model. The models are: GLM-5.1, GLM-5, Kimi K2.5, Kimi K2.6, MiMo-V2.5-Pro, MiMo-V2.5, Qwen3.7 Max, Qwen3.7 Plus, Qwen3.6 Plus, MiniMax M2.5, MiniMax M2.7, MiniMax M3, DeepSeek V4 Pro, and DeepSeek V4 Flash.

### Interview Summary

**Key Discussions**:

- **Field structure**: User chose two text columns (`strengths`, `weaknesses`) over a single column or reusing `notes`
- **Addition method**: User chose both seed file + API for permanent storage + immediate availability
- **Data sourcing**: User chose to scrape OpenRouter for each model's pricing/performance data, falling back to research data if a model isn't listed yet (MiniMax M3 released June 1, Qwen3.7 Plus released June 2)

**Research Findings**:

- All 14 models already mapped in `go-models.ts` for OpenCode Go routing
- Only `minimax/minimax-m2.7` is currently in the catalog (+ 2 non-Go models)
- Extensive benchmark data gathered from official announcements, HuggingFace, Artificial Analysis, and VentureBeat
- The `/v-add-openrouter-model` slash command provides a 9-step process: parse URL → forbidden check → preflight → fetch OpenRouter API → scrape performance → scrape AA leaderboard → build payload → POST → summarize

### Metis Review

**Identified Gaps** (addressed):

- **Test fixture gap**: `makeModelRow()` in `admin-model-catalog.test.ts` must include `strengths: null, weaknesses: null` — resolved by including in the API schema task
- **Seed overwrites M2.7**: The upsert will overwrite existing `notes` — resolved by preserving existing notes content in the new seed entry
- **OpenRouter ID verification**: `go-models.ts` keys may differ from OpenRouter slugs — resolved by verifying each against `GET https://openrouter.ai/api/v1/models` before seeding
- **PostgREST cache reload**: Must run `NOTIFY pgrst, 'reload schema'` after migration — included in verification steps
- **`is_free` semantics**: Set to `false` for all Go models — `is_free` reflects the model's OpenRouter pricing, not the Go subscription economics

---

## Work Objectives

### Core Objective

Expand the model catalog with all 14 OpenCode Go subscription models and add structured usage guidance (strengths/weaknesses) to help the model selection engine and human operators choose the right model for each employee.

### Concrete Deliverables

- Prisma migration adding `strengths` and `weaknesses` columns to `model_catalog`
- Updated Zod schemas in `admin-model-catalog.ts`
- Updated dashboard form with textarea fields for strengths/weaknesses
- 14 model entries in `prisma/seed.ts` (13 new + 1 updated M2.7)
- All 14 models live in the catalog DB
- Updated AGENTS.md

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 failures
- [ ] `psql ... -c "\d model_catalog"` shows `strengths` and `weaknesses` columns
- [ ] `curl localhost:54331/rest/v1/model_catalog?select=model_id&deleted_at=is.null` returns all 14 Go model IDs
- [ ] Dashboard model catalog page shows strengths/weaknesses in the edit dialog

### Must Have

- All 14 Go models in the catalog with accurate pricing data
- `strengths` and `weaknesses` populated for every Go model
- Performance metrics (`quality_index`, `agentic_score`, etc.) populated where data is available from OpenRouter/Artificial Analysis
- Seed file updated so models survive DB resets

### Must NOT Have (Guardrails)

- Do NOT modify `tencent/hy3-preview` or `openrouter/owl-alpha` seed entries — out of scope
- Do NOT change model selection engine logic (`src/lib/model-selection/`) — `strengths`/`weaknesses` are informational only
- Do NOT make `strengths`/`weaknesses` required fields — they must be optional (nullable) for backward compatibility
- Do NOT add forbidden models (anthropic/claude-\*, openai/gpt-4o\*) to the catalog
- Do NOT hardcode Go-internal model IDs — verify each against the actual OpenRouter API first
- Do NOT silently overwrite the existing M2.7 `notes` value — preserve or explicitly replace it

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after) — existing tests must pass after schema changes
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB/Schema**: Use Bash (psql) — verify columns exist, data is correct
- **API**: Use Bash (curl) — POST/PATCH/GET with new fields, assert response
- **Dashboard**: Use Playwright — navigate, verify form fields, take screenshots

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — structural changes):
├── Task 1: Prisma migration (add columns) [quick]
├── Task 2: API schema + test fixture update [quick]
└── Task 3: Dashboard UI update [quick]

Wave 2 (After Wave 1 — data research and population, MAX PARALLEL):
├── Task 4: Scrape + seed models batch 1 (GLM-5.1, GLM-5, Kimi K2.5, Kimi K2.6) [unspecified-high]
├── Task 5: Scrape + seed models batch 2 (MiMo-V2.5-Pro, MiMo-V2.5, Qwen3.7 Max, Qwen3.7 Plus) [unspecified-high]
├── Task 6: Scrape + seed models batch 3 (Qwen3.6 Plus, MiniMax M2.5, MiniMax M2.7 update, MiniMax M3) [unspecified-high]
└── Task 7: Scrape + seed models batch 4 (DeepSeek V4 Pro, DeepSeek V4 Flash) + run seed [unspecified-high]

Wave 3 (After Wave 2 — documentation + verification):
├── Task 8: Update AGENTS.md + run tests [quick]
└── Task 9: Notify completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends on | Blocks    |
| ---- | ---------- | --------- |
| 1    | —          | 2, 3, 4–7 |
| 2    | 1          | 4–7       |
| 3    | 1          | F3        |
| 4    | 2          | 8         |
| 5    | 2          | 8         |
| 6    | 2          | 8         |
| 7    | 2, 4, 5, 6 | 8         |
| 8    | 4, 5, 6, 7 | 9         |
| 9    | 8          | F1–F4     |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **4** — T4–T7 → `unspecified-high`
- **Wave 3**: **2** — T8 → `quick`, T9 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `strengths` and `weaknesses` columns to model_catalog

  **What to do**:
  - Run `pnpm prisma migrate dev --name add-model-strengths-weaknesses` to create a new migration
  - The migration should add two nullable TEXT columns: `strengths` and `weaknesses`
  - Verify the migration applies cleanly
  - Run `NOTIFY pgrst, 'reload schema'` to update PostgREST cache
  - Verify PostgREST sees the new columns

  **Must NOT do**:
  - Do NOT edit existing migrations — create a new one
  - Do NOT make the columns non-nullable (they must be optional)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before Wave 1 peers)
  - **Parallel Group**: Wave 1 (with Tasks 2, 3 — but 2 and 3 depend on 1)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:545-574` — Current `ModelCatalog` model definition. Add `strengths String? @db.Text` and `weaknesses String? @db.Text` after the `notes` field
  - `prisma/migrations/` — Existing migration directory. New migration goes here
  - The `notes` field pattern (line ~571 in schema) — follow the same `String? @db.Text` pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration applies and columns exist
    Tool: Bash (psql)
    Preconditions: Database is running at localhost:54322
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d model_catalog" | grep -E "strengths|weaknesses"
      2. Assert output contains two lines showing "strengths" and "weaknesses" columns with type "text"
    Expected Result: Both columns present as nullable text
    Failure Indicators: Columns not found or wrong type
    Evidence: .sisyphus/evidence/task-1-migration-columns.txt

  Scenario: PostgREST sees new columns
    Tool: Bash (curl)
    Preconditions: PostgREST running, schema cache reloaded
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
      2. Run: source .env && curl -s "http://localhost:54331/rest/v1/model_catalog?limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" | jq '.[0] | keys' | grep -E "strengths|weaknesses"
      3. Assert both "strengths" and "weaknesses" appear in the key list
    Expected Result: PostgREST response includes both new fields
    Failure Indicators: PGRST205 schema cache error, or fields missing from response
    Evidence: .sisyphus/evidence/task-1-postgrest-verify.txt
  ```

  **Commit**: YES
  - Message: `feat(model-catalog): add strengths and weaknesses columns`
  - Files: `prisma/schema.prisma`, `prisma/migrations/[new-migration]/`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Update API schemas, types, and test fixtures for new columns

  **What to do**:
  - Add `strengths: z.string().optional()` and `weaknesses: z.string().optional()` to both `CreateModelCatalogBodySchema` and `PatchModelCatalogBodySchema` in `admin-model-catalog.ts`
  - Add `strengths: null` and `weaknesses: null` to `makeModelRow()` in `admin-model-catalog.test.ts`
  - Update `ModelCatalogEntry` interface in `dashboard/src/lib/types.ts` — add `strengths: string | null` and `weaknesses: string | null`
  - Run `pnpm test -- --run` to verify all tests pass with the new fields

  **Must NOT do**:
  - Do NOT make `strengths`/`weaknesses` required in the Zod schema — must be `.optional()`
  - Do NOT change the model selection engine types or logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: Task 1

  **References**:
  - `src/gateway/routes/admin-model-catalog.ts` — Both Zod schemas (`CreateModelCatalogBodySchema` ~line 15, `PatchModelCatalogBodySchema` ~line 45). Add `strengths` and `weaknesses` as optional string fields
  - `src/gateway/routes/__tests__/admin-model-catalog.test.ts` — `makeModelRow()` function. Add `strengths: null, weaknesses: null` to prevent deep equality test failures
  - `dashboard/src/lib/types.ts:366-391` — `ModelCatalogEntry` interface. Add both fields as `string | null`
  - The existing `notes` field in all three files — follow the exact same pattern for `strengths`/`weaknesses`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass with new fields
    Tool: Bash
    Preconditions: Task 1 migration applied
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -5
      2. Assert output shows "0 failed" or all tests passing
    Expected Result: 0 test failures
    Failure Indicators: Any test failure mentioning "strengths", "weaknesses", or "makeModelRow"
    Evidence: .sisyphus/evidence/task-2-tests-pass.txt

  Scenario: API accepts strengths/weaknesses in POST
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700
    Steps:
      1. Run: source .env && curl -s -w "\n%{http_code}" -X POST "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"model_id":"test/verify-strengths-field","display_name":"Test Strengths","provider":"test","context_window":128000,"input_cost_per_million":0,"output_cost_per_million":0,"supports_tools":true,"supports_structured_output":true,"strengths":"Good at X","weaknesses":"Bad at Y"}'
      2. Assert HTTP 201 and response body contains "strengths":"Good at X" and "weaknesses":"Bad at Y"
      3. Capture the `id` from the response
      4. Clean up: curl -s -X DELETE "http://localhost:7700/admin/model-catalog/<id>" -H "X-Admin-Key: $ADMIN_API_KEY"
    Expected Result: 201 Created with both fields in response
    Failure Indicators: 400 validation error, or fields missing from response
    Evidence: .sisyphus/evidence/task-2-api-strengths.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `feat(model-catalog): add strengths and weaknesses columns`
  - Files: `src/gateway/routes/admin-model-catalog.ts`, test file, `dashboard/src/lib/types.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Update dashboard UI to show strengths/weaknesses fields

  **What to do**:
  - In `ModelCatalogPage.tsx`:
    - Add `strengths: string` and `weaknesses: string` to the `ModelForm` interface
    - Add `strengths: ''` and `weaknesses: ''` to the `EMPTY_FORM` constant
    - Add both fields to `entryToForm()` (map `null` to `''`)
    - Add both fields to `formToPayload()` (map `''` to `undefined`)
    - Add two `<textarea>` fields in the `ModelFormDialog` JSX — create a new card section called "Usage Guidance" after the "Performance Metrics" section
  - Each textarea should have a label ("Strengths — when to use this model" and "Weaknesses — when NOT to use this model"), placeholder text, and match the styling of the existing `notes` textarea

  **Must NOT do**:
  - Do NOT add strengths/weaknesses as table columns — keep the table clean, show them only in the edit dialog
  - Do NOT change the `EmployeeDetail.tsx` dropdown label format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 2 — both depend on Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: F3
  - **Blocked By**: Task 1

  **References**:
  - `dashboard/src/pages/ModelCatalogPage.tsx` — The `ModelForm` interface (~line 78), `EMPTY_FORM` (~line 102), `entryToForm()` (~line 126), `formToPayload()` (~line 164), and the JSX dialog section (~line 400+)
  - The existing `notes` textarea field in the dialog — follow the exact same pattern for `strengths` and `weaknesses`. Look for the "Status" card section that contains `notes`
  - `dashboard/src/lib/types.ts:366-391` — `ModelCatalogEntry` interface (updated in Task 2)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Edit dialog shows strengths/weaknesses fields
    Tool: Playwright
    Preconditions: Dashboard running at localhost:7700, at least one model in catalog
    Steps:
      1. Navigate to http://localhost:7700/dashboard/model-catalog
      2. Click the edit (pencil) button on any model row
      3. Scroll down in the dialog to find the "Usage Guidance" section
      4. Assert: textarea labeled "Strengths" exists
      5. Assert: textarea labeled "Weaknesses" exists
      6. Take screenshot
    Expected Result: Both textarea fields visible in the edit dialog
    Failure Indicators: Fields not found, dialog doesn't open, section missing
    Evidence: .sisyphus/evidence/task-3-dashboard-fields.png

  Scenario: Editing strengths/weaknesses persists
    Tool: Playwright
    Preconditions: Dashboard running, model in catalog
    Steps:
      1. Navigate to http://localhost:7700/dashboard/model-catalog
      2. Click edit on any model
      3. Type "Test strength value" into the Strengths textarea
      4. Type "Test weakness value" into the Weaknesses textarea
      5. Click Save
      6. Re-open the edit dialog for the same model
      7. Assert Strengths contains "Test strength value"
      8. Assert Weaknesses contains "Test weakness value"
    Expected Result: Values persisted correctly
    Failure Indicators: Values empty after save, save fails
    Evidence: .sisyphus/evidence/task-3-dashboard-persist.png
  ```

  **Commit**: YES (group with Tasks 1+2)
  - Message: `feat(model-catalog): add strengths and weaknesses columns`
  - Files: `dashboard/src/pages/ModelCatalogPage.tsx`
  - Pre-commit: `pnpm test -- --run`

- [x] 4. Scrape + seed models batch 1: GLM-5.1, GLM-5, Kimi K2.5, Kimi K2.6

  **What to do**:

  For EACH of these 4 models (`zhipu/glm-5.1`, `zhipu/glm-5`, `moonshot/kimi-k2.5`, `moonshot/kimi-k2.6`), follow the `/v-add-openrouter-model` process:
  1. **Verify OpenRouter slug**: `curl -s "https://openrouter.ai/api/v1/models" | jq '.data[] | select(.id == "<model_id>") | .id'` — confirm the model exists on OpenRouter. If the slug differs from `go-models.ts`, use the OpenRouter slug.
  2. **Fetch pricing + metadata from OpenRouter API**: Extract `context_length`, `pricing.prompt`, `pricing.completion`, `architecture.tokenizer`, `top_provider.max_completion_tokens`, and `description`.
  3. **Scrape performance data from OpenRouter model page**: Visit `https://openrouter.ai/<model_id>` and extract any benchmark scores shown.
  4. **Scrape Artificial Analysis leaderboard**: Visit `https://artificialanalysis.ai/leaderboards/terminal-and-coding` for benchmark scores (`quality_index`, `agentic_score`, `tool_use_score`, `instruction_following_score`, `non_hallucination_rate`). Not all models may be listed — populate what's available, leave rest as `null`.
  5. **Build seed entry**: Add an entry to the `MODEL_CATALOG_ENTRIES` array in `prisma/seed.ts`. Follow the exact shape of the existing `minimax/minimax-m2.7` entry. Include `strengths` and `weaknesses` text from the research below.
  6. **POST via admin API** for immediate availability:
     ```bash
     source .env && curl -s -X POST "http://localhost:7700/admin/model-catalog" \
       -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
       -d '{ ... full payload ... }'
     ```

  **Pre-researched strengths/weaknesses** (use as starting points, refine with scraped data):
  - **zhipu/glm-5.1**: Strengths: "Best-in-class software engineering (SWE-Bench Pro 58.4%). Long-horizon agentic capability with runs up to 8 hours. Top CyberGym score (68.7%). Open-source MIT license. Compatible with Claude Code tooling." Weaknesses: "Text-only — no multimodal (vision/audio) support. Expensive token usage on long autonomous tasks. Relatively new with limited third-party benchmarking."
  - **zhipu/glm-5**: Strengths: "Strong open-source model for coding and agent tasks (744B total, 40B active). Leading BrowseComp score (62.0%). MIT license. Good balance of capability and openness." Weaknesses: "Superseded by GLM-5.1 in most benchmarks. Text-only — no multimodal support. Not frontier-tier on latest coding benchmarks."
  - **moonshot/kimi-k2.5**: Strengths: "Native multimodal (vision + text). Agent Swarm architecture orchestrates up to 100 sub-agents, reducing latency 4.5x. Strong agentic search capabilities. 256K context window." Weaknesses: "256K context is smaller than competitors offering 1M. Older generation — superseded by Kimi K2.6. Agent Swarm less mature than K2.6's 300-agent version."
  - **moonshot/kimi-k2.6**: Strengths: "Strongest open-weight reasoning model at release (AA Intelligence Index 54). Upgraded Agent Swarm with 300 sub-agents and proactive orchestration. Excellent long-horizon coding. 256K context." Weaknesses: "256K context window — half the size of 1M-context competitors. Vision support but no audio input. Open-weight but very large model footprint."

  **Must NOT do**:
  - Do NOT modify existing `tencent/hy3-preview` or `openrouter/owl-alpha` seed entries
  - Do NOT add entries if the model doesn't exist on OpenRouter — skip and document why
  - Do NOT fabricate benchmark scores — use `null` for any metric not found

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:4742-4836` — Current `MODEL_CATALOG_ENTRIES` array with 3 existing entries. Follow the exact object shape for new entries. The `minimax/minimax-m2.7` entry is the best template.
  - `src/workers/lib/go-models.ts` — Maps Go subscription model IDs. Verify that the `model_id` you use in the seed matches the keys here.

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts` — `CreateModelCatalogBodySchema` Zod schema defines the POST payload shape. Required fields: `model_id`, `display_name`, `provider`, `context_window`, `input_cost_per_million`, `output_cost_per_million`, `supports_tools`, `supports_structured_output`. All performance metrics and `strengths`/`weaknesses` are optional.

  **External References**:
  - OpenRouter API: `GET https://openrouter.ai/api/v1/models` — authoritative pricing source
  - OpenRouter model pages: `https://openrouter.ai/zhipu/glm-5.1` etc. — benchmark display
  - Artificial Analysis: `https://artificialanalysis.ai/leaderboards/terminal-and-coding` — quality metrics

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 batch-1 models exist in catalog via API
    Tool: Bash (curl)
    Preconditions: Gateway running, Tasks 1-2 completed
    Steps:
      1. Run: source .env && for m in "zhipu/glm-5.1" "zhipu/glm-5" "moonshot/kimi-k2.5" "moonshot/kimi-k2.6"; do echo "--- $m ---"; curl -s "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq --arg id "$m" '.[] | select(.model_id == $id) | {model_id, display_name, strengths: (.strengths != null), weaknesses: (.weaknesses != null), input_cost: .input_cost_per_million, output_cost: .output_cost_per_million}'; done
      2. Assert: All 4 models appear with non-null strengths and weaknesses, and pricing > 0
    Expected Result: 4 JSON objects, each with strengths:true, weaknesses:true, costs populated
    Failure Indicators: Any model missing, or strengths/weaknesses null, or pricing at 0
    Evidence: .sisyphus/evidence/task-4-batch1-api-verify.txt

  Scenario: Seed entries added to prisma/seed.ts
    Tool: Bash (grep)
    Preconditions: Seed file modified
    Steps:
      1. Run: grep -c "zhipu/glm-5.1\|zhipu/glm-5\|moonshot/kimi-k2.5\|moonshot/kimi-k2.6" prisma/seed.ts
      2. Assert: Count is exactly 4 (one entry per model)
    Expected Result: 4 matches
    Failure Indicators: Fewer than 4 matches
    Evidence: .sisyphus/evidence/task-4-batch1-seed-verify.txt
  ```

  **Commit**: NO (groups with Tasks 5, 6, 7 in Wave 2 commit)

- [x] 5. Scrape + seed models batch 2: MiMo-V2.5-Pro, MiMo-V2.5, Qwen3.7 Max, Qwen3.7 Plus

  **What to do**:

  For EACH of these 4 models (`xiaomi/mimo-v2.5-pro`, `xiaomi/mimo-v2.5`, `alibaba/qwen3.7-max`, `alibaba/qwen3.7-plus`), follow the same process as Task 4:
  1. Verify OpenRouter slug exists via API
  2. Fetch pricing + metadata from OpenRouter API
  3. Scrape performance data from OpenRouter model page
  4. Scrape Artificial Analysis leaderboard for benchmark scores
  5. Build seed entry in `prisma/seed.ts` `MODEL_CATALOG_ENTRIES` array
  6. POST via admin API for immediate availability

  **Pre-researched strengths/weaknesses**:
  - **xiaomi/mimo-v2.5-pro**: Strengths: "Most token-efficient agentic model (ClawEval 64% at ~70K tokens). Perfect compiler build rate. Highest GDPVal-AA score (1581). 1M context window. MIT open-source. AA Intelligence Index 54." Weaknesses: "Text-only — no multimodal support. Slow inference (47 t/s). Very verbose outputs (92M tokens on AA eval). Large model footprint (1.02T total, 42B active)."
  - **xiaomi/mimo-v2.5**: Strengths: "Native multimodal (vision + audio input). 1M context window. Half the cost of MiMo-V2.5-Pro. Strong agentic capability for the size. MIT open-source." Weaknesses: "Smaller model (310B/15B active) — less capable than Pro on hardest reasoning tasks. Less proven in production than Pro variant. E2E verified: may fail bash tool calling in some contexts."
  - **alibaba/qwen3.7-max**: Strengths: "Flagship with 35-hour autonomous coding runs. AA Intelligence Index 56.6 (#5 global). APEX 44.5 (beats Claude Opus 4.6). MCP-Atlas 76.4. 1M context window." Weaknesses: "Proprietary — no open weights. High abstention rate (48%) means frequent refusals. Expensive vs Chinese peers ($2.50/$7.50 per million tokens). Not the cheapest option for routine tasks."
  - **alibaba/qwen3.7-plus**: Strengths: "Native multimodal with vision and video input. Very affordable ($0.40/$1.60). Terminal-Bench 70.3. ScreenSpot Pro 79.0. 1M context window. Released June 2, 2026 — latest generation." Weaknesses: "Sub-SOTA on pure reasoning benchmarks. Proprietary — no open weights. Brand new (1 day old) with minimal community testing. Not yet proven for complex agentic workflows."

  **Must NOT do**:
  - Do NOT modify existing seed entries for non-Go models
  - Do NOT fabricate benchmark scores — use `null` for any metric not found
  - Do NOT use hardcoded pricing — always scrape from OpenRouter API

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:4742-4836` — `MODEL_CATALOG_ENTRIES` array — follow existing entry shape exactly
  - `src/workers/lib/go-models.ts` — Verify model IDs: `xiaomi/mimo-v2.5-pro`, `xiaomi/mimo-v2.5`, `alibaba/qwen3.7-max`, `alibaba/qwen3.7-plus`

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts` — POST payload schema

  **External References**:
  - OpenRouter API: `GET https://openrouter.ai/api/v1/models`
  - Artificial Analysis: `https://artificialanalysis.ai/leaderboards/terminal-and-coding`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 batch-2 models exist in catalog via API
    Tool: Bash (curl)
    Preconditions: Gateway running, Tasks 1-2 completed
    Steps:
      1. Run: source .env && for m in "xiaomi/mimo-v2.5-pro" "xiaomi/mimo-v2.5" "alibaba/qwen3.7-max" "alibaba/qwen3.7-plus"; do echo "--- $m ---"; curl -s "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq --arg id "$m" '.[] | select(.model_id == $id) | {model_id, display_name, strengths: (.strengths != null), weaknesses: (.weaknesses != null), input_cost: .input_cost_per_million, output_cost: .output_cost_per_million}'; done
      2. Assert: All 4 models appear with non-null strengths/weaknesses and pricing
    Expected Result: 4 JSON objects, each with populated fields
    Failure Indicators: Any model missing or fields null
    Evidence: .sisyphus/evidence/task-5-batch2-api-verify.txt

  Scenario: Seed entries added to prisma/seed.ts
    Tool: Bash (grep)
    Preconditions: Seed file modified
    Steps:
      1. Run: grep -c "xiaomi/mimo-v2.5-pro\|xiaomi/mimo-v2.5\|alibaba/qwen3.7-max\|alibaba/qwen3.7-plus" prisma/seed.ts
      2. Assert: Count is exactly 4
    Expected Result: 4 matches
    Failure Indicators: Fewer than 4 matches
    Evidence: .sisyphus/evidence/task-5-batch2-seed-verify.txt
  ```

  **Commit**: NO (groups with Wave 2 commit)

- [x] 6. Scrape + seed models batch 3: Qwen3.6 Plus, MiniMax M2.5, MiniMax M2.7 update, MiniMax M3

  **What to do**:

  For EACH of these 4 models (`alibaba/qwen3.6-plus`, `minimax/minimax-m2.5`, `minimax/minimax-m2.7`, `minimax/minimax-m3`), follow the same process as Task 4.

  **CRITICAL for MiniMax M2.7**: This model already exists in the seed file and the catalog DB. Do NOT create a duplicate. Instead:
  - Find the existing `minimax/minimax-m2.7` entry in `MODEL_CATALOG_ENTRIES`
  - ADD `strengths` and `weaknesses` fields to the existing entry
  - PRESERVE the existing `notes` value — do not overwrite it
  - For the API: use `PATCH` (not POST) to update the existing catalog entry with strengths/weaknesses

  **CRITICAL for MiniMax M3**: This model was released June 1, 2026. It may not yet be on OpenRouter. If not found via API, use these known specs: SWE-Bench Pro 59.0%, MSA architecture (1/20th compute at 1M), open-weight, multimodal (vision + text), $0.60/$2.40 per million tokens. Still attempt the OpenRouter scrape first.

  **Pre-researched strengths/weaknesses**:
  - **alibaba/qwen3.6-plus**: Strengths: "Budget-friendly Alibaba model with good general coding capability. Agent programming enhancement. Solid baseline for cost-sensitive tasks." Weaknesses: "Superseded by Qwen 3.7 series. Not frontier-tier on any benchmark. Limited community benchmarking compared to newer models."
  - **minimax/minimax-m2.5**: Strengths: "Very cheap budget model. SWE-Bench Verified ~80.2% — high score for the price tier. Good for simple, high-volume tasks where cost matters most." Weaknesses: "Older generation — less capable than M2.7 and M3 on complex agentic tasks. Not suitable for multi-step reasoning or long-horizon workflows."
  - **minimax/minimax-m2.7**: Strengths: "Balanced cost/performance. Currently the default model for new archetypes. Proven reliable in production for non-tool-calling workflows." Weaknesses: "Fails bash tool calling via OpenCodeGo (E2E verified 2026-06-03). Not frontier-tier. Use deepseek/deepseek-v4-flash instead when tool calling is required."
  - **minimax/minimax-m3**: Strengths: "First open-weight model combining frontier coding (SWE-Bench Pro 59.0%) + 1M context + multimodal. MSA architecture uses 1/20th compute at 1M context. Very affordable ($0.60/$2.40). Open-weight." Weaknesses: "Brand new (released June 1, 2026) — benchmarks not yet verified by third parties. Multimodal ranking lower than text-only peers (#69 on multimodal leaderboard). Limited production track record."

  **Must NOT do**:
  - Do NOT create a duplicate entry for M2.7 — update the existing one
  - Do NOT delete the existing M2.7 `notes` value
  - Do NOT modify `tencent/hy3-preview` or `openrouter/owl-alpha` entries

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:4742-4836` — Existing `MODEL_CATALOG_ENTRIES` — find the M2.7 entry and update it in-place; add new entries for M2.5, Qwen3.6 Plus, and M3
  - `src/workers/lib/go-models.ts` — Verify model IDs: `alibaba/qwen3.6-plus`, `minimax/minimax-m2.5`, `minimax/minimax-m2.7`, `minimax/minimax-m3`

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts` — POST for new entries, PATCH for M2.7 update

  **External References**:
  - OpenRouter API: `GET https://openrouter.ai/api/v1/models`
  - Artificial Analysis: `https://artificialanalysis.ai/leaderboards/terminal-and-coding`
  - MiniMax M3 announcement (June 1, 2026): search for "MiniMax M3" if not on OpenRouter yet

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 batch-3 models exist in catalog (including M2.7 update)
    Tool: Bash (curl)
    Preconditions: Gateway running, Tasks 1-2 completed
    Steps:
      1. Run: source .env && for m in "alibaba/qwen3.6-plus" "minimax/minimax-m2.5" "minimax/minimax-m2.7" "minimax/minimax-m3"; do echo "--- $m ---"; curl -s "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq --arg id "$m" '.[] | select(.model_id == $id) | {model_id, display_name, strengths: (.strengths != null), weaknesses: (.weaknesses != null), notes: (.notes != null)}'; done
      2. Assert: All 4 models present with strengths and weaknesses populated
      3. Assert: M2.7 still has its `notes` value (not null)
    Expected Result: 4 JSON objects; M2.7 has notes:true, strengths:true, weaknesses:true
    Failure Indicators: M2.7 notes is null (was overwritten), or any model missing
    Evidence: .sisyphus/evidence/task-6-batch3-api-verify.txt

  Scenario: No duplicate M2.7 entries
    Tool: Bash (curl)
    Preconditions: Catalog populated
    Steps:
      1. Run: source .env && curl -s "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '[.[] | select(.model_id == "minimax/minimax-m2.7")] | length'
      2. Assert: Result is exactly 1
    Expected Result: 1 (not 2 or more)
    Failure Indicators: Count > 1 means a duplicate was created
    Evidence: .sisyphus/evidence/task-6-m27-no-duplicate.txt
  ```

  **Commit**: NO (groups with Wave 2 commit)

- [x] 7. Scrape + seed models batch 4: DeepSeek V4 Pro, DeepSeek V4 Flash + run seed

  **What to do**:

  For EACH of these 2 models (`deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`), follow the same process as Task 4.

  **After adding both models to the seed file**, verify that all 14 model entries exist in `MODEL_CATALOG_ENTRIES`, then run the seed:

  ```bash
  pnpm prisma db seed
  ```

  This will upsert all 14 entries (13 new + M2.7 update) via the seed file's `upsert` logic, ensuring persistence across DB resets.

  **Pre-researched strengths/weaknesses**:
  - **deepseek/deepseek-v4-pro**: Strengths: "Leading agentic open-weight model (GDPVal-AA 1554). LiveCodeBench 93.5. 1M context window. AA Intelligence Index 52. Strong at complex multi-step reasoning and coding." Weaknesses: "Very high hallucination rate (94% on AA eval). Expensive for an open-weight model ($1.74/$3.48). High token usage — verbose outputs. Not suitable for tasks requiring factual accuracy."
  - **deepseek/deepseek-v4-flash**: Strengths: "Extremely cheap ($0.14/$0.28 per million tokens). Reliable tool calling — E2E verified in production. 1M context window. Fast inference. Best value option for high-volume, tool-calling tasks." Weaknesses: "Smaller model (284B/13B active) — less capable on hardest reasoning tasks. Very high hallucination rate (96%). Not suitable for complex multi-step reasoning or factual accuracy tasks."

  **Must NOT do**:
  - Do NOT run `pnpm prisma db seed` until all 14 entries are in the seed file (coordinate with Tasks 4, 5, 6)
  - Do NOT fabricate benchmark scores

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: PARTIALLY — scraping can run in parallel with Tasks 4-6, but running seed must wait until all batches are in the seed file
  - **Parallel Group**: Wave 2 (but seed run is sequential after 4, 5, 6 complete their seed edits)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 2, 4, 5, 6 (for seed run)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:4742-4836` — `MODEL_CATALOG_ENTRIES` array
  - `src/workers/lib/go-models.ts` — Verify model IDs: `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts` — POST payload schema

  **External References**:
  - OpenRouter API: `GET https://openrouter.ai/api/v1/models`
  - Artificial Analysis: `https://artificialanalysis.ai/leaderboards/terminal-and-coding`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Both DeepSeek models in catalog
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Run: source .env && for m in "deepseek/deepseek-v4-pro" "deepseek/deepseek-v4-flash"; do echo "--- $m ---"; curl -s "http://localhost:7700/admin/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq --arg id "$m" '.[] | select(.model_id == $id) | {model_id, display_name, strengths: (.strengths != null), weaknesses: (.weaknesses != null), input_cost: .input_cost_per_million}'; done
      2. Assert: Both models present with strengths, weaknesses, and pricing
    Expected Result: 2 JSON objects with all fields populated
    Failure Indicators: Model missing or fields null
    Evidence: .sisyphus/evidence/task-7-batch4-api-verify.txt

  Scenario: All 14 Go models exist in catalog after seed run
    Tool: Bash (psql)
    Preconditions: Seed has been run after all batches added
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT model_id, strengths IS NOT NULL as has_strengths, weaknesses IS NOT NULL as has_weaknesses FROM model_catalog WHERE deleted_at IS NULL AND model_id IN ('zhipu/glm-5.1','zhipu/glm-5','moonshot/kimi-k2.5','moonshot/kimi-k2.6','xiaomi/mimo-v2.5-pro','xiaomi/mimo-v2.5','alibaba/qwen3.7-max','alibaba/qwen3.7-plus','alibaba/qwen3.6-plus','minimax/minimax-m2.5','minimax/minimax-m2.7','minimax/minimax-m3','deepseek/deepseek-v4-pro','deepseek/deepseek-v4-flash') ORDER BY model_id;"
      2. Assert: Exactly 14 rows, all with has_strengths=true and has_weaknesses=true
    Expected Result: 14 rows, all with both fields populated
    Failure Indicators: Fewer than 14 rows, or any has_strengths/has_weaknesses = false
    Evidence: .sisyphus/evidence/task-7-all-14-models.txt

  Scenario: Seed file has all 14 entries
    Tool: Bash (grep)
    Preconditions: All batch tasks completed
    Steps:
      1. Run: grep -c "model_id:" prisma/seed.ts | head -1  (count model_id occurrences in MODEL_CATALOG_ENTRIES)
      2. More precisely: grep "model_id: '" prisma/seed.ts | grep -E "zhipu|moonshot|xiaomi|alibaba|minimax|deepseek" | wc -l
      3. Assert: Count is 14
    Expected Result: 14 Go model entries in seed file
    Failure Indicators: Count less than 14
    Evidence: .sisyphus/evidence/task-7-seed-count.txt
  ```

  **Commit**: YES (Wave 2 commit — all seed changes)
  - Message: `feat(model-catalog): add 14 OpenCode Go models to seed and catalog`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Update AGENTS.md with expanded model catalog + run tests

  **What to do**:
  - Update the "Seeded catalog models" line in AGENTS.md to list all 14 Go models (currently only lists 3: `minimax/minimax-m2.7`, `tencent/hy3-preview`, `openrouter/owl-alpha`)
  - The new line should read: `**Seeded catalog models (global):** minimax/minimax-m2.7 · minimax/minimax-m2.5 · minimax/minimax-m3 · zhipu/glm-5.1 · zhipu/glm-5 · moonshot/kimi-k2.5 · moonshot/kimi-k2.6 · xiaomi/mimo-v2.5-pro · xiaomi/mimo-v2.5 · alibaba/qwen3.7-max · alibaba/qwen3.7-plus · alibaba/qwen3.6-plus · deepseek/deepseek-v4-pro · deepseek/deepseek-v4-flash · tencent/hy3-preview · openrouter/owl-alpha`
  - Run `pnpm test -- --run` to confirm nothing is broken
  - Run `pnpm lint` to check for any lint issues across changed files

  **Must NOT do**:
  - Do NOT remove `tencent/hy3-preview` or `openrouter/owl-alpha` from the list — they're still in the catalog
  - Do NOT update the "Recommended for E2E testing" line — that stays as `deepseek/deepseek-v4-flash`
  - Do NOT change any AGENTS.md sections unrelated to the model catalog

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:
  - `AGENTS.md` — Find the line starting with `**Seeded catalog models (global):**` and replace it. Currently near the top of the file in the "Approved LLM Models" section.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md lists all Go models
    Tool: Bash (grep)
    Preconditions: AGENTS.md updated
    Steps:
      1. Run: grep "Seeded catalog models" AGENTS.md
      2. Assert: Line contains all 14 Go model IDs plus the 2 existing non-Go models
      3. Run: echo "zhipu/glm-5.1 zhipu/glm-5 moonshot/kimi-k2.5 moonshot/kimi-k2.6 xiaomi/mimo-v2.5-pro xiaomi/mimo-v2.5 alibaba/qwen3.7-max alibaba/qwen3.7-plus alibaba/qwen3.6-plus minimax/minimax-m2.5 minimax/minimax-m2.7 minimax/minimax-m3 deepseek/deepseek-v4-pro deepseek/deepseek-v4-flash tencent/hy3-preview openrouter/owl-alpha" | tr ' ' '\n' | while read m; do grep -q "$m" AGENTS.md && echo "OK: $m" || echo "MISSING: $m"; done
      4. Assert: All 16 show "OK"
    Expected Result: 16 "OK" lines, 0 "MISSING" lines
    Failure Indicators: Any "MISSING" line
    Evidence: .sisyphus/evidence/task-8-agents-md-verify.txt

  Scenario: Tests still pass
    Tool: Bash
    Preconditions: All code changes complete
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -5
      2. Assert: 0 failures
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-8-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md with expanded model catalog`
  - Files: `AGENTS.md`
  - Pre-commit: none

- [x] 9. Send Telegram notification of plan completion

  **What to do**:
  - Send a Telegram notification that the model catalog expansion is complete:
    ```bash
    tsx scripts/telegram-notify.ts "✅ OpenCode Go Model Catalog Expansion complete — All 14 models added with strengths/weaknesses. Come back to review results."
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 8)
  - **Blocks**: F1–F4
  - **Blocked By**: Task 8

  **References**:
  - `scripts/telegram-notify.ts` — Telegram notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: scripts/telegram-notify.ts exists and TELEGRAM_BOT_TOKEN is set
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ OpenCode Go Model Catalog Expansion complete — All 14 models added with strengths/weaknesses. Come back to review results."
      2. Assert: Exit code 0
    Expected Result: Notification sent successfully
    Failure Indicators: Non-zero exit code, error message
    Evidence: .sisyphus/evidence/task-9-telegram-sent.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
      Start from clean state. Navigate to `http://localhost:7700/dashboard/model-catalog`. Verify: (a) all 14 Go models appear in the table, (b) clicking edit on any model shows `Strengths` and `Weaknesses` textarea fields, (c) editing and saving strengths/weaknesses persists correctly, (d) the model catalog API returns `strengths` and `weaknesses` fields. Save screenshots to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit                                                               | Files                                                                                                            | Pre-commit           |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1    | `feat(model-catalog): add strengths and weaknesses columns`          | prisma/schema.prisma, migration file, admin-model-catalog.ts, admin-model-catalog.test.ts, dashboard types/pages | `pnpm test -- --run` |
| 2    | `feat(model-catalog): add 14 OpenCode Go models to seed and catalog` | prisma/seed.ts                                                                                                   | `pnpm test -- --run` |
| 3    | `docs: update AGENTS.md with expanded model catalog`                 | AGENTS.md                                                                                                        | —                    |

---

## Success Criteria

### Verification Commands

```bash
# Schema has new columns
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d model_catalog" | grep -E "strengths|weaknesses"
# Expected: two TEXT columns

# All 14 Go models in catalog
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT model_id, strengths IS NOT NULL as has_strengths FROM model_catalog WHERE deleted_at IS NULL AND model_id IN ('zhipu/glm-5.1','zhipu/glm-5','moonshot/kimi-k2.5','moonshot/kimi-k2.6','xiaomi/mimo-v2.5-pro','xiaomi/mimo-v2.5','alibaba/qwen3.7-max','alibaba/qwen3.7-plus','alibaba/qwen3.6-plus','minimax/minimax-m2.5','minimax/minimax-m2.7','minimax/minimax-m3','deepseek/deepseek-v4-pro','deepseek/deepseek-v4-flash') ORDER BY provider, model_id;"
# Expected: 14 rows, all with has_strengths = true

# Tests pass
pnpm test -- --run
# Expected: 0 failures
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated
