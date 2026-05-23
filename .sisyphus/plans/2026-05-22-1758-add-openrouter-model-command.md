# Add OpenRouter Model to Catalog — Slash Command

## TL;DR

> **Quick Summary**: Create a project-level OpenCode slash command (`.opencode/command/v-add-openrouter-model.md`) that accepts an OpenRouter model URL, scrapes metadata from 3 sources (API, performance page, Artificial Analysis), and POSTs to the model catalog for both tenants.
>
> **Deliverables**:
>
> - `.opencode/command/v-add-openrouter-model.md` — the slash command file
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — single deliverable
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request

User had a local OpenCode slash command that accepted an OpenRouter URL (e.g., `https://openrouter.ai/openai/gpt-oss-120b/performance`) and added the model to the platform's model catalog. The command was lost — it only existed at `~/.config/opencode/command/` and was never committed to git or exported. Exhaustive git archaeology confirmed it never existed in the repo.

### Interview Summary

**Key Discussions**:

- **Location**: Project-level at `.opencode/command/v-add-openrouter-model.md` (committed to git, never lost again)
- **Tenants**: All tenants dynamically — fetches tenant list via `GET /admin/tenants` and POSTs to each one. Future-proof: no hardcoded IDs.
- **Data sources**: 3 combined — OpenRouter API (no auth), OpenRouter performance page (Playwright), Artificial Analysis leaderboard (Playwright, fallback for intelligence score)

**Research Findings**:

- OpenRouter API (`GET https://openrouter.ai/api/v1/models`) returns: `id`, `name`, `description`, `context_length`, `pricing.prompt/completion`, `supported_parameters`
- Single model endpoint (`/api/v1/models/{org}/{model}`) returns 404 — must filter from full list
- Performance page shows per-provider metrics (throughput, latency, error rates) — use best provider values
- AA leaderboard Intelligence Index maps to `quality_index` — filter input: `input[placeholder="Filter, e.g. GPT, Meta"]`
- Model catalog POST requires 8 fields, accepts 11 optional enrichment fields

### Metis Review

**Identified Gaps** (addressed):

- Forbidden model check needed (AGENTS.md: `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, `openai/gpt-4o-mini`)
- `:free` URL variants preserved as-is (different catalog entries)
- 409 per-tenant handled independently (partial success is OK)
- AA scraping gracefully degradable (null quality_index on failure, never abort)
- Preflight checks for gateway health and Chrome CDP availability
- Performance data: use best provider values (lowest error rates, highest throughput)

---

## Work Objectives

### Core Objective

Create a single `.opencode/command/v-add-openrouter-model.md` file that instructs the executing agent to fetch, scrape, transform, and POST model data to the catalog for both tenants.

### Concrete Deliverables

- `.opencode/command/v-add-openrouter-model.md`

### Definition of Done

- [ ] Command file exists at `.opencode/command/v-add-openrouter-model.md`
- [ ] Running `/v-add-openrouter-model https://openrouter.ai/openai/gpt-oss-120b/performance` fetches data from all 3 sources and POSTs to both tenants
- [ ] Command handles edge cases: forbidden models, 409 duplicates, AA scraping failures, missing performance data

### Must Have

- URL parsing for `https://openrouter.ai/{org}/{model}`, `/{org}/{model}/performance`, `/{org}/{model}/benchmarks`
- Forbidden model check before any API/scrape work
- OpenRouter API fetch (model metadata, pricing, capabilities)
- Playwright scrape of performance page (throughput, latency, error rates)
- Playwright scrape of AA leaderboard (Intelligence Index → quality_index)
- Dynamic tenant discovery via `GET /admin/tenants` — POST to ALL tenants, not hardcoded IDs
- Per-tenant 409 handling (partial success OK)
- Summary output showing populated vs null fields and per-tenant status

### Must NOT Have (Guardrails)

- No modification to existing model catalog API code
- No changes to the recommendation engine
- No changes to dashboard UI
- No PATCH/update of existing catalog entries (add-only)
- No hardcoded forbidden model IDs in the command (use pattern matching from AGENTS.md: `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, `openai/gpt-4o-mini`)
- No abort on AA scraping failure (graceful degradation to null quality_index)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — this is a slash command file (markdown), not source code
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Slash command**: Use Bash to verify file exists, lint content structure, and dry-run against a known model
- **API interaction**: Use Bash (curl) to verify gateway is up and catalog POST works
- **Playwright scraping**: Use Playwright MCP to verify data is extractable from target pages

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — single deliverable with dependencies):
├── Task 1: Create slash command file [quick]
├── Task 2: Dry-run against known model (gpt-oss-120b) [quick]
└── Task 3: Edge case testing + notify completion [quick]

Critical Path: Task 1 → Task 2 → Task 3
Parallel Speedup: N/A (sequential by nature — single file)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 2, 3   |
| 2    | 1          | 3      |
| 3    | 2          | —      |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `deep`, T2 → `unspecified-high`, T3 → `unspecified-high`

---

## TODOs

- [ ] 1. Create the slash command file

  **What to do**:
  Write `.opencode/command/v-add-openrouter-model.md` — a comprehensive slash command that instructs the executing agent to:

  **Step 1 — Parse the URL**:
  - Accept argument like `https://openrouter.ai/openai/gpt-oss-120b/performance`
  - Extract `{org}/{model}` (e.g., `openai/gpt-oss-120b`) by stripping the domain and optional trailing path segments (`/performance`, `/benchmarks`)
  - Construct `model_id` = `{org}/{model}` (e.g., `openai/gpt-oss-120b`)

  **Step 2 — Forbidden model check**:
  - Before any work, check if the model_id matches forbidden patterns:
    - `anthropic/claude-sonnet-*`
    - `anthropic/claude-opus-*`
    - `openai/gpt-4o` (exact)
    - `openai/gpt-4o-mini` (exact)
  - If match → abort with clear error message explaining why (AGENTS.md constraint)

  **Step 3 — Preflight checks**:
  - Verify gateway is running: `curl -sf http://localhost:7700/health || echo "Gateway not running"`
  - Verify `.env` exists and contains `ADMIN_API_KEY`: `source .env && [ -n "$ADMIN_API_KEY" ] || echo "ADMIN_API_KEY not set"`

  **Step 4 — Fetch OpenRouter API data**:
  - `curl -s https://openrouter.ai/api/v1/models` — no auth required
  - Filter the response JSON array for the entry where `id` matches the extracted `model_id`
  - If not found, abort with error: "Model not found in OpenRouter API"
  - Extract and transform fields per this mapping:

  | API field                                              | Catalog field                | Transform                                |
  | ------------------------------------------------------ | ---------------------------- | ---------------------------------------- |
  | `id`                                                   | `model_id`                   | direct                                   |
  | `name`                                                 | `display_name`               | direct                                   |
  | `id.split('/')[0]`                                     | `provider`                   | extract org before `/`                   |
  | `description`                                          | `description`                | direct (truncate to 500 chars if longer) |
  | `context_length`                                       | `context_window`             | direct                                   |
  | `pricing.prompt`                                       | `input_cost_per_million`     | parse as float, multiply by 1,000,000    |
  | `pricing.completion`                                   | `output_cost_per_million`    | parse as float, multiply by 1,000,000    |
  | `supported_parameters` includes `"tools"`              | `supports_tools`             | boolean                                  |
  | `supported_parameters` includes `"structured_outputs"` | `supports_structured_output` | boolean                                  |
  | `pricing.prompt === "0"`                               | `is_free`                    | boolean                                  |

  **Step 5 — Scrape OpenRouter performance page** (Playwright):
  - Navigate to `https://openrouter.ai/{org}/{model}/performance`
  - Wait for the page to load (wait for text "Throughput" or similar metrics header)
  - Extract per-provider rows from the performance tables:
    - **Throughput** (tok/s): Find the highest value across all providers
    - **Latency** (seconds): Find the lowest value across all providers
    - **Tool Call Error Rate** (%): Find the lowest value across all providers → divide by 100 for decimal
    - **Structured Output Error Rate** (%): Find the lowest value across all providers → divide by 100 for decimal
  - If page fails to load or has no data → set all 4 fields to null, log warning, continue

  **Step 6 — Scrape Artificial Analysis leaderboard** (Playwright):
  - Navigate to `https://artificialanalysis.ai/leaderboards/models`
  - Wait for the leaderboard table to render
  - Find the filter input: `input[placeholder="Filter, e.g. GPT, Meta"]`
  - Type the model name (e.g., `gpt-oss-120b`) into the filter
  - Wait for the table to filter
  - Find the row matching the model name (prefer the "(high)" variant if multiple results)
  - Extract the **Intelligence Index** column value → `quality_index` (parse as number)
  - If filter returns no results, or page fails to load → set `quality_index` to null, log warning, continue
  - **CRITICAL**: This step must NEVER abort the entire command. AA is a best-effort enrichment source.

  **Step 7 — Build the POST body**:
  - Combine all gathered data into the JSON body matching `CreateModelCatalogBodySchema`:
    ```json
    {
      "model_id": "openai/gpt-oss-120b",
      "display_name": "...",
      "provider": "openai",
      "context_window": 131072,
      "input_cost_per_million": 1.2,
      "output_cost_per_million": 4.8,
      "supports_tools": true,
      "supports_structured_output": true,
      "description": "...",
      "is_free": false,
      "throughput_tokens_per_sec": 685,
      "latency_seconds": 0.17,
      "tool_call_error_rate": 0.0016,
      "structured_output_error_rate": 0.0001,
      "quality_index": 33,
      "notes": "Added via /v-add-openrouter-model on YYYY-MM-DD"
    }
    ```
  - Omit any optional field that is null (don't send `null` — just exclude the key)

  **Step 8 — Discover all tenants and POST to each**:
  - `source .env` to get `ADMIN_API_KEY`
  - Fetch all tenants dynamically:
    ```bash
    curl -s "http://localhost:7700/admin/tenants" \
      -H "X-Admin-Key: $ADMIN_API_KEY"
    ```
  - This returns an array of tenant objects with `id` and `name` fields
  - Loop through each tenant and POST the model:
    ```bash
    curl -s -X POST "http://localhost:7700/admin/tenants/${TENANT_ID}/model-catalog" \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      -d '<JSON body>'
    ```
  - For each tenant: if 201 → success. If 409 → "already exists" (not an error, log and continue). If other error → log the error but continue to the next tenant.
  - **Why dynamic**: No hardcoded tenant IDs. When new organizations are added, the command automatically includes them.

  **Step 9 — Summary output**:
  - Print a summary table showing:
    - Model ID, display name, provider
    - All fields: which are populated vs null
    - Per-tenant POST result: ✅ Created / ⚠️ Already Exists (409) / ❌ Failed (error details)
  - If both tenants failed → exit with error
  - If at least one succeeded → exit success

  **Command file structure**:
  The `.md` file should have:
  - A header describing the command's purpose
  - `<argument>` tag for the OpenRouter URL
  - Clear step-by-step instructions (Steps 1-9 above) written as agent instructions
  - The field mapping table embedded for reference
  - Dynamic tenant discovery via `GET /admin/tenants` (no hardcoded IDs)
  - All forbidden model patterns listed
  - All Playwright selectors documented

  **Must NOT do**:
  - Do not create any TypeScript scripts — the command is a markdown file that instructs the agent to use Bash (curl) and Playwright MCP tools directly
  - Do not modify any existing source code
  - Do not add `:free` suffix handling (`:free` variants come through as different model_ids naturally)
  - Do not attempt to PATCH existing models — add-only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful multi-step instruction design with correct API references, Playwright selectors, and field transformations. Must produce a self-contained, unambiguous command file.
  - **Skills**: []
    - No specific skills needed — this is markdown authoring with embedded technical instructions
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not applicable — this is a slash command, not a shell tool
    - `hostfully-api`: Unrelated domain

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `/Users/victordozal/.config/opencode/command/v-code-commit.md` — Example of an existing OpenCode slash command structure (header, argument tag, step-by-step instructions)
  - `/Users/victordozal/.config/opencode/command/v-ticket-analyze.md` — Another slash command example showing argument handling
  - `.opencode/skills/creating-archetypes/SKILL.md` — Example of a project-level `.opencode/` file for reference on placement

  **API/Type References** (contracts to implement against):
  - `src/gateway/routes/admin-model-catalog.ts:27-49` — `CreateModelCatalogBodySchema` — the exact Zod schema the POST body must match. Required fields: `model_id`, `display_name`, `provider`, `context_window` (int > 0), `input_cost_per_million` (≥ 0), `output_cost_per_million` (≥ 0), `supports_tools` (bool), `supports_structured_output` (bool). Optional: `description`, `is_free`, `throughput_tokens_per_sec`, `latency_seconds`, `tool_call_error_rate`, `structured_output_error_rate`, `quality_index`, `agentic_score`, `tool_use_score`, `instruction_following_score`, `non_hallucination_rate`, `is_active`, `notes`.
  - `src/gateway/routes/admin-model-catalog.ts:53-80` — POST handler — returns 201 on success, 409 on duplicate `(tenant_id, model_id)` unique constraint violation.

  **External References** (libraries and APIs):
  - OpenRouter API: `https://openrouter.ai/api/v1/models` — no auth, returns JSON array of all models. Each model has `id`, `name`, `description`, `context_length`, `pricing: { prompt, completion }`, `supported_parameters: string[]`.
  - OpenRouter performance page: `https://openrouter.ai/{org}/{model}/performance` — Playwright target. Shows per-provider metrics tables for throughput, latency, tool call error rate, structured output error rate.
  - Artificial Analysis leaderboard: `https://artificialanalysis.ai/leaderboards/models` — Playwright target. Filter input selector: `input[placeholder="Filter, e.g. GPT, Meta"]`. Table has columns: Model, Context Window, Creator, Intelligence Index, Blended Price, Median Tokens/s, Latency, Total Response.

  **WHY Each Reference Matters**:
  - `admin-model-catalog.ts:27-49`: The POST body MUST exactly match this schema or the request will be rejected with 400. The executor needs to know required vs optional fields and their types.
  - `admin-model-catalog.ts:53-80`: Knowing the 409 duplicate behavior lets the command handle "already exists" gracefully without treating it as an error.
  - Existing slash commands: The executor needs to match the markdown structure (header, argument tag, instruction format) so OpenCode recognizes and loads the command correctly.
  - OpenRouter API docs: The command must filter from the full model list since single-model endpoints return 404.

  **Acceptance Criteria**:
  - [ ] File exists at `.opencode/command/v-add-openrouter-model.md`
  - [ ] File has proper OpenCode command structure (header, argument tag, instructions)
  - [ ] Instructions cover all 9 steps (URL parse → forbidden check → preflight → API fetch → perf scrape → AA scrape → build body → POST both → summary)
  - [ ] Field mapping table is embedded in the file
  - [ ] Dynamic tenant discovery via `GET /admin/tenants` is documented in the file
  - [ ] All 4 forbidden model patterns are listed
  - [ ] AA scraping is documented as gracefully degradable
  - [ ] Per-tenant 409 handling is documented

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Command file structure validation
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. `ls -la .opencode/command/v-add-openrouter-model.md` — confirm file exists
      2. `head -5 .opencode/command/v-add-openrouter-model.md` — confirm starts with proper markdown header
      3. `grep -c "/admin/tenants" .opencode/command/v-add-openrouter-model.md` — confirm dynamic tenant discovery endpoint present (expect: ≥1)
      4. `grep -c "anthropic/claude-sonnet" .opencode/command/v-add-openrouter-model.md` — confirm forbidden pattern present (expect: ≥1)
      5. `grep -c "anthropic/claude-opus" .opencode/command/v-add-openrouter-model.md` — confirm forbidden pattern present (expect: ≥1)
      6. `grep -c "openai/gpt-4o" .opencode/command/v-add-openrouter-model.md` — confirm forbidden pattern present (expect: ≥1)
      8. `grep -c "quality_index" .opencode/command/v-add-openrouter-model.md` — confirm AA field mapping present (expect: ≥1)
      9. `grep -c "artificialanalysis.ai" .opencode/command/v-add-openrouter-model.md` — confirm AA URL present (expect: ≥1)
    Expected Result: All checks pass — file exists with correct structure and all required content
    Failure Indicators: File missing, any grep returns 0, header format wrong
    Evidence: .sisyphus/evidence/task-1-structure-validation.txt

  Scenario: Field mapping completeness check
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. For each required POST field (`model_id`, `display_name`, `provider`, `context_window`, `input_cost_per_million`, `output_cost_per_million`, `supports_tools`, `supports_structured_output`), grep the command file to confirm it's mentioned in the mapping
      2. For each enrichment field (`throughput_tokens_per_sec`, `latency_seconds`, `tool_call_error_rate`, `structured_output_error_rate`, `quality_index`), grep to confirm it's mentioned
    Expected Result: All 13 fields appear in the command file
    Failure Indicators: Any field missing from the file
    Evidence: .sisyphus/evidence/task-1-field-completeness.txt
  ```

  **Commit**: YES
  - Message: `feat(dx): add /v-add-openrouter-model slash command for model catalog`
  - Files: `.opencode/command/v-add-openrouter-model.md`
  - Pre-commit: N/A (markdown file)

- [ ] 2. Dry-run the command against a known model

  **What to do**:
  Execute the newly created command end-to-end against `https://openrouter.ai/openai/gpt-oss-120b/performance` to verify it works. Follow every step in the command file:
  1. Parse the URL → extract `openai/gpt-oss-120b`
  2. Forbidden model check → should pass (not forbidden)
  3. Preflight → verify gateway is running
  4. Fetch OpenRouter API → find `openai/gpt-oss-120b` in results
  5. Scrape performance page → extract throughput, latency, error rates
  6. Scrape AA leaderboard → extract Intelligence Index
  7. Build POST body
  8. POST to both tenants
  9. Print summary

  After execution, verify the model exists in all tenant catalogs via the admin API:

  ```bash
  source .env
  # Get all tenant IDs, then check each one
  TENANTS=$(curl -s "http://localhost:7700/admin/tenants" -H "X-Admin-Key: $ADMIN_API_KEY" | jq -r '.[].id')
  for T in $TENANTS; do
    echo "Checking tenant $T..."
    curl -s "http://localhost:7700/admin/tenants/$T/model-catalog" \
      -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[] | select(.model_id == "openai/gpt-oss-120b")'
  done
  ```

  **If the model already exists (409)**: That's OK — the command handled it. Delete from one tenant and retry to verify fresh creation works:

  ```bash
  # Get the catalog entry ID, then DELETE (soft delete), then re-POST
  ```

  **Must NOT do**:
  - Do not modify the command file during this task — if issues are found, document them and fix in Task 3
  - Do not modify any source code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires executing a multi-step workflow with Bash + Playwright, verifying results, and documenting findings
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Needed for Playwright browser automation steps (performance page + AA leaderboard scraping)
  - **Skills Evaluated but Omitted**:
    - `hostfully-api`: Unrelated domain

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.opencode/command/v-add-openrouter-model.md` — the command file created in Task 1 (follow its instructions exactly)

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts:53-80` — POST handler, returns 201/409
  - `src/gateway/routes/admin-model-catalog.ts:82-120` — GET handler for listing catalog entries (use to verify POST results)

  **External References**:
  - OpenRouter API: `https://openrouter.ai/api/v1/models`
  - Performance page: `https://openrouter.ai/openai/gpt-oss-120b/performance`
  - AA leaderboard: `https://artificialanalysis.ai/leaderboards/models`

  **WHY Each Reference Matters**:
  - The command file IS the test — the executor follows it step by step and verifies each step produces expected output
  - The catalog GET endpoint lets the executor verify the POST actually persisted the data
  - The external URLs are the actual scraping targets

  **Acceptance Criteria**:
  - [ ] All 3 data sources successfully queried (API + perf page + AA)
  - [ ] POST returned 201 for at least one tenant (or 409 if model already existed)
  - [ ] Catalog GET for both tenants shows the model with populated fields
  - [ ] Summary output printed showing field coverage

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — full end-to-end model addition
    Tool: Bash + Playwright
    Preconditions: Gateway running at localhost:7700, .env has ADMIN_API_KEY, Chrome available for Playwright CDP
    Steps:
      1. Parse URL `https://openrouter.ai/openai/gpt-oss-120b/performance` → extract `openai/gpt-oss-120b`
      2. Check forbidden list → `openai/gpt-oss-120b` should NOT match any pattern
      3. `curl -sf http://localhost:7700/health` → assert 200
      4. `curl -s https://openrouter.ai/api/v1/models | jq '.data[] | select(.id == "openai/gpt-oss-120b") | .name'` → assert non-empty string
      5. Playwright: navigate to `https://openrouter.ai/openai/gpt-oss-120b/performance`, wait for metrics, extract best throughput value → assert > 0
      6. Playwright: navigate to `https://artificialanalysis.ai/leaderboards/models`, type "gpt-oss" in filter `input[placeholder="Filter, e.g. GPT, Meta"]`, extract Intelligence Index → assert numeric value
      7. Build JSON body with all extracted fields
      8. `source .env && curl -s -w "%{http_code}" -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '<body>'` → assert 201 or 409
      9. Same POST for VLRE tenant → assert 201 or 409
      10. `source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[] | select(.model_id == "openai/gpt-oss-120b") | {model_id, display_name, quality_index, throughput_tokens_per_sec}'` → assert all 4 fields present
    Expected Result: Model added to both tenants with API data + performance metrics + quality_index populated
    Failure Indicators: 400/500 on POST, model not found in GET, quality_index null (warning only — AA is best-effort)
    Evidence: .sisyphus/evidence/task-2-happy-path.txt

  Scenario: Verify field values are reasonable
    Tool: Bash
    Preconditions: Task 2 happy path completed
    Steps:
      1. Query the catalog entry for `openai/gpt-oss-120b` from DozalDevs tenant
      2. Assert `context_window` > 0
      3. Assert `input_cost_per_million` ≥ 0
      4. Assert `output_cost_per_million` ≥ 0
      5. Assert `supports_tools` is boolean
      6. Assert `throughput_tokens_per_sec` > 0 (if not null)
      7. Assert `latency_seconds` > 0 and < 60 (if not null)
      8. Assert `tool_call_error_rate` ≥ 0 and ≤ 1 (if not null)
    Expected Result: All field values within expected ranges
    Failure Indicators: Any field value outside expected range, negative costs, impossibly high latency
    Evidence: .sisyphus/evidence/task-2-field-validation.txt
  ```

  **Commit**: NO (no file changes — execution-only task)

- [ ] 3. Edge case testing and completion notification

  **What to do**:
  Test edge cases to verify the command handles them correctly. Then fix any issues found in Tasks 2-3 by updating the command file. Finally, send completion notification.

  **Edge case tests**:
  1. **Forbidden model** — Try mentally tracing (or actually running if command supports dry-run) with `https://openrouter.ai/anthropic/claude-sonnet-4` → should abort with forbidden model message before any API calls
  2. **Gateway down** — Stop gateway, verify the preflight check catches it (or note if preflight check is clear enough in instructions)
  3. **Non-existent model** — Try with a made-up URL like `https://openrouter.ai/fake-org/nonexistent-model/performance` → should abort with "Model not found in OpenRouter API"
  4. **URL format variants** — Verify instructions handle all 3 URL formats:
     - `https://openrouter.ai/openai/gpt-oss-120b` (base)
     - `https://openrouter.ai/openai/gpt-oss-120b/performance`
     - `https://openrouter.ai/openai/gpt-oss-120b/benchmarks`

  **Fix any issues**:
  - If any edge case reveals unclear or incorrect instructions in the command file, update `.opencode/command/v-add-openrouter-model.md`

  **Completion notification**:
  - `tsx scripts/telegram-notify.ts "📋 Plan complete: add-openrouter-model-command — All tasks done. Come back to review results."`

  **Must NOT do**:
  - Do not modify any source code files
  - Do not add new data sources beyond the 3 specified

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires systematic edge case testing and potentially updating the command file based on findings
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: Not needed — edge cases are mostly Bash-based or mental traces

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `.opencode/command/v-add-openrouter-model.md` — the command file to verify and potentially update
  - AGENTS.md forbidden model patterns section — verify the command matches these exactly

  **API/Type References**:
  - `src/gateway/routes/admin-model-catalog.ts:27-49` — schema validation (will reject malformed bodies)

  **WHY Each Reference Matters**:
  - The command file is both the artifact under test and the artifact to fix if issues are found
  - AGENTS.md patterns are the source of truth for forbidden models

  **Acceptance Criteria**:
  - [ ] Forbidden model edge case verified (abort behavior documented)
  - [ ] Non-existent model edge case verified
  - [ ] All 3 URL format variants confirmed in instructions
  - [ ] Any issues found are fixed in the command file
  - [ ] Telegram notification sent

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Forbidden model rejection
    Tool: Bash
    Preconditions: Command file exists
    Steps:
      1. Mentally trace the command with input `https://openrouter.ai/anthropic/claude-sonnet-4/performance`
      2. Verify the instructions would extract `anthropic/claude-sonnet-4`
      3. Verify the forbidden check pattern `anthropic/claude-sonnet-*` would match
      4. Verify the instructions say to abort with clear error message at this step
    Expected Result: Command instructions clearly specify abort for forbidden models before any API/scraping work
    Failure Indicators: Instructions don't mention forbidden check, or patterns are incomplete
    Evidence: .sisyphus/evidence/task-3-forbidden-model.txt

  Scenario: URL format variants
    Tool: Bash
    Preconditions: Command file exists
    Steps:
      1. `grep -c "performance\|benchmarks" .opencode/command/v-add-openrouter-model.md` — verify URL stripping is documented
      2. Verify instructions explain how to strip `/performance` and `/benchmarks` suffixes
      3. Verify the base URL format (no suffix) is also handled
    Expected Result: All 3 URL formats are explicitly documented in the parsing instructions
    Failure Indicators: Any URL format not mentioned or parsing logic unclear
    Evidence: .sisyphus/evidence/task-3-url-formats.txt

  Scenario: Completion notification sent
    Tool: Bash
    Preconditions: All edge cases verified
    Steps:
      1. `tsx scripts/telegram-notify.ts "📋 Plan complete: add-openrouter-model-command — All tasks done. Come back to review results."`
      2. Verify command exits with 0
    Expected Result: Telegram notification sent successfully
    Failure Indicators: Non-zero exit code, missing env vars for Telegram
    Evidence: .sisyphus/evidence/task-3-notification.txt
  ```

  **Commit**: YES (if command file was updated with fixes)
  - Message: `fix(dx): address edge cases in /v-add-openrouter-model command`
  - Files: `.opencode/command/v-add-openrouter-model.md`
  - Pre-commit: N/A (markdown file)

---

## Final Verification Wave

> After ALL implementation tasks, 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. Verify: command file exists at `.opencode/command/v-add-openrouter-model.md`. Check it references all 3 data sources (API, perf page, AA). Verify forbidden model patterns are included. Verify both tenant IDs present. Verify `source .env` for ADMIN_API_KEY. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Read the command file. Check for: clear step-by-step instructions, correct API endpoint references, correct Playwright selectors, correct field mapping table, no ambiguous instructions. Verify all file paths referenced exist in codebase (`src/gateway/routes/admin-model-catalog.ts`, etc.).
      Output: `References [N/N valid] | Instructions [clear/ambiguous] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Execute the command against `https://openrouter.ai/openai/gpt-oss-120b/performance`. Verify: URL parsed correctly, API data fetched, performance page scraped, AA leaderboard scraped, POST succeeds for both tenants (or 409 if already exists). Capture evidence screenshots.
      Output: `Sources [N/3 scraped] | Tenants [N/2 posted] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      Verify only `.opencode/command/v-add-openrouter-model.md` was created/modified. No source code changes. No API changes. No dashboard changes. No recommendation engine changes.
      Output: `Files changed [N] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1**: `feat(dx): add /v-add-openrouter-model slash command for model catalog` — `.opencode/command/v-add-openrouter-model.md`

---

## Success Criteria

### Verification Commands

```bash
# Command file exists
ls -la .opencode/command/v-add-openrouter-model.md  # Expected: file exists

# Gateway is running (prerequisite for POST)
curl -s http://localhost:7700/health  # Expected: 200 OK

# Model was added to both tenants
source .env
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/model-catalog" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[].model_id' | grep "openai/gpt-oss-120b"
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/model-catalog" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.[].model_id' | grep "openai/gpt-oss-120b"
```

### Final Checklist

- [ ] Command file at `.opencode/command/v-add-openrouter-model.md` — present
- [ ] Accepts OpenRouter URLs in all 3 formats (base, /performance, /benchmarks)
- [ ] Fetches from OpenRouter API, performance page, AA leaderboard
- [ ] POSTs to both tenants
- [ ] Handles forbidden models, 409 duplicates, AA failures gracefully
- [ ] Committed to git (never lost again)
