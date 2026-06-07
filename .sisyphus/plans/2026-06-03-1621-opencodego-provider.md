# OpenCodeGo Provider Integration

## TL;DR

> **Quick Summary**: Switch AI employee worker execution from OpenRouter ($51/mo usage-based) to OpenCodeGo ($10/mo flat subscription) as the primary LLM provider, with automatic fallback to OpenRouter for unsupported models.
>
> **Deliverables**:
>
> - Smart provider auto-detection in the OpenCode harness
> - Go model mapping utility with unit tests
> - Environment variable setup (local + production)
> - Both providers available in auth.json for seamless routing
> - Structured logging for provider selection observability
>
> **Estimated Effort**: Short (4-6 hours)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 3 → Task 4 → F1-F4

---

## Context

### Original Request

Switch the AI employee platform's primary LLM provider from OpenRouter to OpenCodeGo, a $10/month flat subscription that includes the same open source models we already use (MiniMax M2.7, DeepSeek V4 Flash, MiMo-V2.5-Pro, etc.). OpenRouter should remain as a fallback for models not available on Go. The system should auto-detect which provider to use based on the model — no manual configuration per archetype.

### Interview Summary

**Key Discussions**:

- Two separate LLM paths exist: worker execution (bulk of cost, switches to Go) and gateway verification (stays on OpenRouter, uses claude-haiku-4-5)
- Smart auto-detection: harness checks if model is on the Go model list and `OPENCODE_GO_API_KEY` is set → routes to Go automatically
- Hardcoded Go model list preferred over dynamic API fetching
- No changes to model catalog, archetypes, or gateway verification path
- The on/off switch is the presence/absence of `OPENCODE_GO_API_KEY` env var

**Research Findings**:

- OpenCodeGo API documented at https://opencode.ai/docs/go — OpenAI-compatible for some models, Anthropic-compatible for others
- OpenCode natively supports `opencode-go` as a provider. Auth entry format: `{ "opencode-go": { "type": "api", "key": "..." } }`
- Model ID format: OpenRouter `minimax/minimax-m2.7` → Go `minimax-m2.7` (strip org prefix)
- 14 Go models: `glm-5.1`, `glm-5`, `kimi-k2.5`, `kimi-k2.6`, `mimo-v2.5`, `mimo-v2.5-pro`, `minimax-m3`, `minimax-m2.7`, `minimax-m2.5`, `qwen3.7-max`, `qwen3.7-plus`, `qwen3.6-plus`, `deepseek-v4-pro`, `deepseek-v4-flash`
- `session-manager.ts` already reads `OPENCODE_PROVIDER_ID` from env with `'openrouter'` fallback — needs ZERO changes
- `call-llm.ts` is gateway-only — needs ZERO changes for this work
- `writeOpencodeAuth()` is called at BOTH execution phase (line ~990) and delivery phase (line ~764) — both get the fix automatically

### Metis Review

**Identified Gaps** (addressed):

- Delivery phase provider routing: Both call sites of `writeOpencodeAuth()` will get the fix since the function itself is modified
- Model ID stripping edge cases: Using a lookup map instead of string manipulation for correctness
- Observability: Adding structured log line for provider selection
- `session-manager.ts`: Confirmed NO changes needed — env var already drives provider selection
- `call-llm.ts`: Confirmed NO changes needed — gateway-only, irrelevant to worker execution cost
- Fallback behavior: If Go is selected and the Go API fails, the task fails. Operator removes `OPENCODE_GO_API_KEY` to revert to OpenRouter. No automatic failover (per user preference)

---

## Work Objectives

### Core Objective

Route AI employee worker execution through OpenCodeGo when the model is available on the Go subscription and the API key is configured, reducing LLM costs from ~$51/month to $10/month.

### Concrete Deliverables

- `src/workers/lib/go-models.ts` — Go model mapping utility with provider resolution
- Modified `src/workers/opencode-harness.mts` — multi-provider auth.json + smart routing
- Updated `src/gateway/services/tenant-env-loader.ts` — whitelist new env var
- Updated `.env.example` — documented new env var
- Unit tests for the model mapping utility
- Updated AGENTS.md — new env var documentation

### Definition of Done

- [ ] Tasks using Go-available models route through `opencode-go` provider when `OPENCODE_GO_API_KEY` is set
- [ ] Tasks using non-Go models continue routing through `openrouter` regardless of Go key presence
- [ ] Removing `OPENCODE_GO_API_KEY` reverts all routing to `openrouter` (no behavior change from current)
- [ ] Harness logs include provider selection for observability
- [ ] All existing tests pass (`pnpm test -- --run`)

### Must Have

- Smart provider auto-detection based on model + env var presence
- Both `opencode-go` and `openrouter` entries in auth.json when Go key is present
- Hardcoded Go model list (14 models) in a dedicated utility module
- Structured log line when Go routing is selected
- `OPENCODE_GO_API_KEY` whitelisted in platform env for container injection
- Works for both execution phase and delivery phase

### Must NOT Have (Guardrails)

- **NO changes to `session-manager.ts`** — it already reads `OPENCODE_PROVIDER_ID` from env
- **NO changes to `call-llm.ts`** — gateway-only, irrelevant to worker execution
- **NO changes to model catalog or archetype records** — routing is transparent
- **NO new DB schema/migration** — no `provider` column on archetypes
- **NO dynamic Go model list fetching** — hardcoded list only
- **NO automatic failover** — if Go fails, task fails; operator removes key to revert
- **NO changes to deprecated files** (`lifecycle.ts`, `redispatch.ts`, `orchestrate.mts`, `entrypoint.sh`)
- **NO over-abstraction** — this is a targeted 4-file change, not a provider framework

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (Tests-after) — unit tests for the model mapping utility
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (bun/node REPL) — import, call functions, compare output
- **CLI/Container**: Use Bash — inspect auth.json, check env vars, grep logs
- **E2E**: Use Bash — trigger task, poll status, verify provider in logs

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, 3 parallel tasks):
├── Task 1: Go model mapping utility + unit tests [quick]
├── Task 2: Env var whitelist + .env files [quick]
└── Task 3: Verify auth.json provider key name [quick]

Wave 2 (After Wave 1 — core implementation):
├── Task 4: Modify opencode-harness.mts with Go provider routing [deep]
└── Task 5: Update AGENTS.md documentation [quick]

Wave 3 (After Wave 2 — E2E verification, 2 parallel tasks):
├── Task 6: Docker rebuild + E2E test with Go routing [unspecified-high]
└── Task 7: Regression test without Go key [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 4       | 1    |
| 2    | —          | 4       | 1    |
| 3    | —          | 4       | 1    |
| 4    | 1, 2, 3    | 5, 6, 7 | 2    |
| 5    | 4          | —       | 2    |
| 6    | 4          | F1-F4   | 3    |
| 7    | 4          | F1-F4   | 3    |

Critical Path: Task 1 → Task 4 → Task 6 → F1-F4 → user okay

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 2 tasks — T4 `deep`, T5 `quick`
- **Wave 3**: 2 tasks — T6 `unspecified-high`, T7 `unspecified-high`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Go Model Mapping Utility + Unit Tests

  **What to do**:
  - Create `src/workers/lib/go-models.ts` with:
    - A `GO_MODEL_MAP` constant: a `Map<string, string>` mapping OpenRouter model IDs to Go model IDs. For the 14 Go models, the mapping is: strip the org prefix (everything before and including the first `/`). Examples:
      - `minimax/minimax-m2.7` → `minimax-m2.7`
      - `deepseek/deepseek-v4-flash` → `deepseek-v4-flash`
      - `xiaomi/mimo-v2.5-pro` → `mimo-v2.5-pro`
      - `xiaomi/mimo-v2.5` → `mimo-v2.5`
      - Full list of 14 Go models from docs: `glm-5.1`, `glm-5`, `kimi-k2.5`, `kimi-k2.6`, `mimo-v2.5`, `mimo-v2.5-pro`, `minimax-m3`, `minimax-m2.7`, `minimax-m2.5`, `qwen3.7-max`, `qwen3.7-plus`, `qwen3.6-plus`, `deepseek-v4-pro`, `deepseek-v4-flash`
    - Note: Some Go models may not currently exist in the model catalog. The map should include ALL 14 Go models regardless, using reasonable OpenRouter ID guesses for models not in the catalog. The map entries that DO exist in the catalog are the important ones. The others are "ready" for when those models get added. Reasonable OpenRouter ID patterns based on known models:
      - `minimax/minimax-m2.7` → `minimax-m2.7` (known)
      - `minimax/minimax-m2.5` → `minimax-m2.5`
      - `minimax/minimax-m3` → `minimax-m3`
      - `deepseek/deepseek-v4-flash` → `deepseek-v4-flash` (known)
      - `deepseek/deepseek-v4-pro` → `deepseek-v4-pro`
      - `xiaomi/mimo-v2.5` → `mimo-v2.5` (known)
      - `xiaomi/mimo-v2.5-pro` → `mimo-v2.5-pro` (known)
      - `alibaba/qwen3.7-max` → `qwen3.7-max`
      - `alibaba/qwen3.7-plus` → `qwen3.7-plus`
      - `alibaba/qwen3.6-plus` → `qwen3.6-plus`
      - `zhipu/glm-5.1` → `glm-5.1`
      - `zhipu/glm-5` → `glm-5`
      - `moonshot/kimi-k2.5` → `kimi-k2.5`
      - `moonshot/kimi-k2.6` → `kimi-k2.6`
    - A function `resolveProvider(openRouterModelId: string, goApiKeyPresent: boolean): { providerID: string; modelID: string }`:
      - If `goApiKeyPresent` AND the model ID is in `GO_MODEL_MAP` → return `{ providerID: 'opencode-go', modelID: goModelId }`
      - Otherwise → return `{ providerID: 'openrouter', modelID: openRouterModelId }`
      - Handle the edge case where the model has an `openrouter/` prefix (strip it first, as the current harness does)
  - Create unit tests at `src/workers/lib/__tests__/go-models.test.ts`:
    - Test: Go model with key present → returns `opencode-go` provider
    - Test: Go model without key → returns `openrouter` provider
    - Test: Non-Go model with key present → returns `openrouter` provider
    - Test: Model with `openrouter/` prefix → strips prefix correctly
    - Test: All 14 Go models in the map are correctly mapped

  **Must NOT do**:
  - Do NOT fetch models from API — hardcoded list only
  - Do NOT add a provider column to any DB table
  - Do NOT import from gateway code — this is worker-only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility module + straightforward unit tests
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/session-manager.ts:283-285` — Shows how `OPENCODE_PROVIDER_ID` and `OPENROUTER_MODEL` are read. The utility must produce values compatible with this consumer.
  - `src/workers/opencode-harness.mts:358` — Current `openrouter/` prefix stripping logic. The utility replaces this.

  **API/Type References**:
  - OpenCodeGo docs model list: https://opencode.ai/docs/go/#endpoints — authoritative source for Go model IDs

  **Test References**:
  - `src/workers/lib/__tests__/session-manager.test.ts` — If it exists, follow its test structure and mocking patterns
  - `src/lib/model-selection/__tests__/` — Follow this directory's test patterns for model-related tests

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/go-models.ts` exists with `GO_MODEL_MAP` and `resolveProvider()`
  - [ ] `pnpm test -- --run src/workers/lib/__tests__/go-models.test.ts` → PASS (5+ tests, 0 failures)
  - [ ] `resolveProvider('minimax/minimax-m2.7', true)` returns `{ providerID: 'opencode-go', modelID: 'minimax-m2.7' }`
  - [ ] `resolveProvider('minimax/minimax-m2.7', false)` returns `{ providerID: 'openrouter', modelID: 'minimax/minimax-m2.7' }`
  - [ ] `resolveProvider('tencent/hy3-preview', true)` returns `{ providerID: 'openrouter', modelID: 'tencent/hy3-preview' }`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Go model resolves to opencode-go provider when key present
    Tool: Bash
    Preconditions: Unit test file exists
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/__tests__/go-models.test.ts
      2. Assert exit code 0
      3. Assert output contains "5 passed" or higher
    Expected Result: All tests pass with 0 failures
    Failure Indicators: Exit code non-zero, or "failed" in output
    Evidence: .sisyphus/evidence/task-1-unit-tests.txt

  Scenario: Non-Go model always uses OpenRouter
    Tool: Bash
    Preconditions: Unit test includes non-Go model test case
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/__tests__/go-models.test.ts -t "Non-Go model"
      2. Assert test passes
    Expected Result: Non-Go model returns openrouter provider regardless of key
    Evidence: .sisyphus/evidence/task-1-non-go-model.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): add Go model mapping utility with provider resolution`
  - Files: `src/workers/lib/go-models.ts`, `src/workers/lib/__tests__/go-models.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Add OPENCODE_GO_API_KEY to Platform Environment

  **What to do**:
  - Add `OPENCODE_GO_API_KEY` to `PLATFORM_ENV_WHITELIST` array in `src/gateway/services/tenant-env-loader.ts` (line ~5-17). Place it right after `OPENROUTER_API_KEY` since they serve the same purpose (LLM provider auth).
  - Add `OPENCODE_GO_API_KEY` to `.env.example` in the "AI / OpenRouter" section (section 7). Add a comment explaining it:
    ```
    # OpenCode Go — $10/mo subscription for open source models (optional, auto-detected by harness)
    # Get your key at https://opencode.ai/auth — subscribe to Go
    # When set, the harness routes compatible models through Go instead of OpenRouter
    OPENCODE_GO_API_KEY=
    ```
  - The section header in `.env.example` should be updated from "AI / OpenRouter" to "AI / LLM Providers" since we now have two providers.

  **Must NOT do**:
  - Do NOT add the actual API key value to `.env.example` — it should be blank
  - Do NOT add this as a tenant secret — it's a platform-level key
  - Do NOT modify `call-llm.ts` — it's gateway-only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small file edits (add to array, add to env file)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/services/tenant-env-loader.ts:5-17` — `PLATFORM_ENV_WHITELIST` array. Add `'OPENCODE_GO_API_KEY'` as a new entry.
  - `.env.example:~98` — "AI / OpenRouter" section. This is where the new env var goes.

  **Acceptance Criteria**:
  - [ ] `OPENCODE_GO_API_KEY` appears in `PLATFORM_ENV_WHITELIST` array
  - [ ] `.env.example` contains `OPENCODE_GO_API_KEY=` with descriptive comments
  - [ ] `.env.example` section header updated to "AI / LLM Providers"
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Env var is whitelisted for container injection
    Tool: Bash
    Preconditions: tenant-env-loader.ts is modified
    Steps:
      1. Run: grep -n 'OPENCODE_GO_API_KEY' src/gateway/services/tenant-env-loader.ts
      2. Assert output shows the var in the PLATFORM_ENV_WHITELIST array
    Expected Result: Line containing 'OPENCODE_GO_API_KEY' found in the whitelist
    Failure Indicators: No output from grep
    Evidence: .sisyphus/evidence/task-2-whitelist-check.txt

  Scenario: .env.example documents the new var
    Tool: Bash
    Preconditions: .env.example is modified
    Steps:
      1. Run: grep -A2 'OPENCODE_GO_API_KEY' .env.example
      2. Assert output contains the var and a descriptive comment
    Expected Result: OPENCODE_GO_API_KEY= line with surrounding comments visible
    Failure Indicators: No output or missing comments
    Evidence: .sisyphus/evidence/task-2-env-example.txt
  ```

  **Commit**: YES
  - Message: `chore(env): add OPENCODE_GO_API_KEY to platform env whitelist`
  - Files: `src/gateway/services/tenant-env-loader.ts`, `.env.example`
  - Pre-commit: `pnpm build`

- [x] 3. Verify OpenCode auth.json Provider Key Name

  **What to do**:
  - This is a critical verification task. Before writing any provider routing code, confirm the exact `auth.json` key name that OpenCode uses for the Go provider.
  - Check the OpenCode binary's source code or the local `auth.json` file after running `/connect` with Go to confirm the provider key is `"opencode-go"`.
  - Verification steps:
    1. Check if `~/.local/share/opencode/auth.json` already exists on the dev machine (the user subscribed to Go). If it does, read it and confirm the key name.
    2. If not available, check the OpenCode source code on GitHub (`https://github.com/anomalyco/opencode`) for the Go provider registration — search for `opencode-go` in the source.
    3. As a fallback, the docs at https://opencode.ai/docs/go/#endpoints confirm model IDs use `opencode-go/<model-id>` format, strongly suggesting the auth.json key is `opencode-go`.
  - Document the confirmed key name in `.sisyphus/evidence/task-3-auth-key-verification.md`

  **Must NOT do**:
  - Do NOT install or configure Go on the dev machine — just verify the key name
  - Do NOT modify any files — this is a read-only verification task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only verification — check a file or search source code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **External References**:
  - `~/.local/share/opencode/auth.json` — check if Go credentials are already stored here
  - OpenCode source: `https://github.com/anomalyco/opencode` — search for `opencode-go` provider registration
  - OpenCode Go docs: `https://opencode.ai/docs/go/#endpoints` — model ID format confirms `opencode-go` prefix

  **Acceptance Criteria**:
  - [ ] The exact auth.json key name for Go provider is documented
  - [ ] Evidence file created at `.sisyphus/evidence/task-3-auth-key-verification.md`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify auth.json key name from local file
    Tool: Bash
    Preconditions: User has subscribed to OpenCodeGo and run /connect
    Steps:
      1. Run: cat ~/.local/share/opencode/auth.json 2>/dev/null | jq 'keys' || echo "File not found"
      2. If file exists, check if "opencode-go" appears in the keys
      3. If file not found, search OpenCode GitHub source for the key name
    Expected Result: Confirmed key name (expected: "opencode-go")
    Failure Indicators: Key name is different from "opencode-go"
    Evidence: .sisyphus/evidence/task-3-auth-key-verification.md

  Scenario: Fallback verification via OpenCode source
    Tool: Bash
    Preconditions: Local auth.json does not exist or does not have Go entry
    Steps:
      1. Search OpenCode docs/source for the Go provider key name
      2. Document findings
    Expected Result: Confirmed key name with source reference
    Evidence: .sisyphus/evidence/task-3-auth-key-verification.md
  ```

  **Commit**: NO (read-only task)

- [x] 4. Modify OpenCode Harness with Go Provider Routing

  **What to do**:
  - This is the core implementation task. Modify `src/workers/opencode-harness.mts` to support OpenCodeGo as a provider.

  **Step 1 — Import the Go model utility**:
  - Add import at top: `import { resolveProvider } from './lib/go-models.js'`

  **Step 2 — Modify `writeOpencodeAuth()`** (currently at ~line 294-341):
  - Currently writes only the OpenRouter entry to auth.json
  - Modify to ALSO write the `opencode-go` entry when `process.env.OPENCODE_GO_API_KEY` is present
  - The auth.json structure should be:
    - When Go key IS present: `{ "opencode-go": { "type": "api", "key": goKey }, "openrouter": { "type": "api", "key": orKey } }`
    - When Go key is NOT present: `{ "openrouter": { "type": "api", "key": orKey } }` (unchanged from current behavior)
  - Use the exact provider key name confirmed in Task 3 (expected: `"opencode-go"`)

  **Step 3 — Modify provider detection logic** (currently at ~line 358-383):
  - Currently:
    ```typescript
    const modelID = model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : model;
    process.env.OPENROUTER_MODEL = modelID;
    process.env.OPENCODE_PROVIDER_ID = 'openrouter';
    ```
  - Replace with:

    ```typescript
    // Strip openrouter/ prefix if present (backward compatibility)
    const cleanModel = model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : model;

    // Resolve provider: Go when available + key present, else OpenRouter
    const goKeyPresent = Boolean(process.env.OPENCODE_GO_API_KEY);
    const resolved = resolveProvider(cleanModel, goKeyPresent);

    process.env.OPENROUTER_MODEL = resolved.modelID;
    process.env.OPENCODE_PROVIDER_ID = resolved.providerID;
    ```

  - Note: `OPENROUTER_MODEL` env var name is kept even for Go models because `session-manager.ts` reads it (line 284: `process.env.OPENROUTER_MODEL ?? process.env.OPENCODE_MODEL_ID ?? 'minimax/minimax-m2.7'`). The env var name is misleading but changing it would require changing session-manager.ts which is out of scope.

  **Step 4 — Add structured logging**:
  - After the provider resolution, add a log line:
    ```typescript
    logger.info(
      {
        component: 'opencode-harness',
        provider: resolved.providerID,
        model: resolved.modelID,
        originalModel: cleanModel,
        goKeyPresent,
      },
      `LLM provider resolved: ${resolved.providerID}/${resolved.modelID}`,
    );
    ```
  - This makes provider selection observable in task logs

  **Must NOT do**:
  - Do NOT modify `session-manager.ts` — it already reads from env vars
  - Do NOT modify `call-llm.ts` — gateway-only
  - Do NOT add automatic failover logic — if Go fails, task fails
  - Do NOT rename the `OPENROUTER_MODEL` env var — session-manager depends on it
  - Do NOT modify the deprecated `entrypoint.sh`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying a critical infrastructure file (harness) that runs all employee tasks. Requires careful understanding of the existing code flow and provider routing.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:294-341` — `writeOpencodeAuth()` function. This is the primary modification target. Read the entire function to understand the auth.json structure and file paths used.
  - `src/workers/opencode-harness.mts:358-383` — Current provider detection and env var setting. This is the second modification target.
  - `src/workers/opencode-harness.mts:~764` — Delivery phase call to `writeOpencodeAuth()`. Confirm this call site also gets the fix (it will, since we're modifying the function itself, not the call site).
  - `src/workers/opencode-harness.mts:~990` — Execution phase call to `writeOpencodeAuth()`. Same as above.

  **API/Type References**:
  - `src/workers/lib/go-models.ts` — The utility created in Task 1. Import `resolveProvider` from here.
  - `src/workers/lib/session-manager.ts:283-285` — Consumer of `OPENCODE_PROVIDER_ID` and `OPENROUTER_MODEL` env vars. Do NOT modify this file, but understand what values it expects.

  **External References**:
  - `.sisyphus/evidence/task-3-auth-key-verification.md` — Confirmed auth.json provider key name from Task 3

  **Acceptance Criteria**:
  - [ ] `writeOpencodeAuth()` writes both `opencode-go` and `openrouter` entries when Go key is present
  - [ ] `writeOpencodeAuth()` writes only `openrouter` entry when Go key is absent (no behavior change)
  - [ ] Provider resolution uses `resolveProvider()` from `go-models.ts`
  - [ ] Structured log line emitted with provider selection details
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm test -- --run` passes (no regressions)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build succeeds after harness changes
    Tool: Bash
    Preconditions: All harness modifications complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Clean TypeScript compilation
    Failure Indicators: Type errors or import resolution failures
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: All existing tests still pass
    Tool: Bash
    Preconditions: Harness modified
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0
      3. Assert no test failures in output
    Expected Result: Same pass count as before, 0 new failures
    Failure Indicators: Any test failure or regression
    Evidence: .sisyphus/evidence/task-4-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): route execution through OpenCodeGo when available`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm test -- --run && pnpm build`

- [x] 5. Update AGENTS.md Documentation

  **What to do**:
  - Update the "Environment Variables" section in AGENTS.md to document `OPENCODE_GO_API_KEY`
  - Update the "Approved LLM Models" section to mention OpenCodeGo as a provider option
  - Add a note in the "OpenCode Worker" section about multi-provider support

  Specific changes:
  1. In the **Environment Variables** section, add after the existing OPENROUTER mention:
     ```
     **OpenCode Go (optional)**: `OPENCODE_GO_API_KEY` — when set, the harness automatically routes compatible models through OpenCodeGo ($10/mo subscription) instead of OpenRouter. Get a key at https://opencode.ai/auth. Remove the env var to revert all routing to OpenRouter.
     ```
  2. In the **Approved LLM Models** table, add a row or note:

     ```
     | **Execution** (via Go) | Any model in the Go subscription (14 models) | Auto-selected when `OPENCODE_GO_API_KEY` is set and model is available on Go. Fallback: OpenRouter. |
     ```

  3. In the **OpenCode Worker** section, add a bullet:

     ```
     - **Multi-provider**: When `OPENCODE_GO_API_KEY` is set, the harness writes both `opencode-go` and `openrouter` entries to `auth.json`. Compatible models (MiniMax M2.7, DeepSeek V4 Flash, MiMo-V2.5-Pro, etc.) route through Go; others fall back to OpenRouter. The Go model list is hardcoded in `src/workers/lib/go-models.ts`.
     ```

  4. Update the `.env.example` reference in AGENTS.md if it mentions "AI / OpenRouter" section name → change to "AI / LLM Providers"

  **Must NOT do**:
  - Do NOT rewrite unrelated AGENTS.md sections
  - Do NOT add employee-specific language to AGENTS.md (shared file)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation update only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run parallel with Task 4 if both are in Wave 2, but logically depends on Task 4 being done)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:
  - `AGENTS.md` — Read the "Environment Variables", "Approved LLM Models", and "OpenCode Worker" sections before editing

  **Acceptance Criteria**:
  - [ ] `OPENCODE_GO_API_KEY` documented in AGENTS.md Environment Variables section
  - [ ] Go provider mentioned in Approved LLM Models section
  - [ ] Multi-provider behavior documented in OpenCode Worker section

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: AGENTS.md mentions Go provider
    Tool: Bash
    Preconditions: AGENTS.md updated
    Steps:
      1. Run: grep -c 'OPENCODE_GO_API_KEY' AGENTS.md
      2. Assert output is >= 2 (env var section + worker section)
      3. Run: grep -c 'opencode-go' AGENTS.md
      4. Assert output is >= 1
    Expected Result: Go provider documented in multiple sections
    Failure Indicators: Zero matches
    Evidence: .sisyphus/evidence/task-5-docs-check.txt
  ```

  **Commit**: YES
  - Message: `docs: add OpenCodeGo provider documentation to AGENTS.md`
  - Files: `AGENTS.md`
  - Pre-commit: —

- [x] 6. Docker Rebuild + E2E Test with Go Routing

  **What to do**:
  - Rebuild the Docker worker image to include the harness changes
  - Set `OPENCODE_GO_API_KEY` in the local `.env` file (the user has their key)
  - Trigger `real-estate-motivation-bot-2` employee and verify it completes using Go routing

  Steps:
  1. **Rebuild Docker image**: `docker build -t ai-employee-worker:latest .`
  2. **Add Go API key to .env**: Ask user for their key or check if already set. Add `OPENCODE_GO_API_KEY=<key>` to `.env`.
  3. **Ensure services are running**: Verify gateway and Inngest are up
  4. **Trigger test employee**:
     ```bash
     source .env
     curl -s -X POST \
       "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
       -H "X-Admin-Key: $ADMIN_API_KEY" \
       -H "Content-Type: application/json" \
       -d '{}' | jq '{task_id: .task_id}'
     ```
  5. **Wait for completion** (~60-90 seconds), then verify:
     - Task reached `Done` status
     - Harness log contains `"provider":"opencode-go"` (confirms Go routing)
     - Task has non-zero token counts in executions table

  **Must NOT do**:
  - Do NOT modify any source files in this task — rebuild only
  - Do NOT skip the Docker rebuild — harness changes require it
  - Do NOT mark this task complete without verifying the provider in logs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Docker build + E2E trigger + verification across multiple systems (DB, logs, Slack)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 7 — but Task 7 should run AFTER this to avoid conflicts)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:
  - AGENTS.md "Recommended Test Employee" section — `real-estate-motivation-bot-2` details
  - AGENTS.md "Task Debugging Quick Reference" — how to check task status and logs
  - AGENTS.md "Long-Running Commands" — use tmux for Docker build

  **Acceptance Criteria**:
  - [ ] Docker image rebuilt successfully
  - [ ] Task triggered and reaches `Done` status
  - [ ] Harness log contains `"provider":"opencode-go"` entry
  - [ ] Task has non-zero token counts
  - [ ] `info.cost` behavior for Go tasks documented in `.sisyphus/evidence/task-6-go-cost-analysis.md`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Task completes with Go routing
    Tool: Bash
    Preconditions: Docker image rebuilt, OPENCODE_GO_API_KEY set in .env, services running
    Steps:
      1. Trigger real-estate-motivation-bot-2 via curl
      2. Capture task_id from response
      3. Wait 90 seconds
      4. Query: SELECT status FROM tasks WHERE id = '$TASK_ID'
      5. Assert status = 'Done'
      6. Run: grep '"provider":"opencode-go"' /tmp/employee-${TASK_ID:0:8}.log
      7. Assert at least 1 match (confirms Go provider was used)
    Expected Result: Task Done + Go provider confirmed in logs
    Failure Indicators: Task not Done, or no "opencode-go" in logs (meaning it fell back to OpenRouter)
    Evidence: .sisyphus/evidence/task-6-e2e-go-routing.txt

  Scenario: Token usage is tracked
    Tool: Bash
    Preconditions: Task completed
    Steps:
      1. Query: SELECT prompt_tokens, completion_tokens FROM executions WHERE task_id = '$TASK_ID'
      2. Assert both values > 0
    Expected Result: Non-zero token counts recorded
    Failure Indicators: Zero tokens or no execution row
    Evidence: .sisyphus/evidence/task-6-token-tracking.txt

  Scenario: Verify info.cost behavior for Go provider (CRITICAL — cost reporting analysis)
    Tool: Bash
    Preconditions: Go-routed task completed (Done status confirmed in previous scenario)
    Context: OpenCodeGo is a flat $10/mo subscription — there is no per-token cost.
      The system tracks cost via OpenCode's transcript (msg.info.cost field).
      We need to determine what OpenCode reports as info.cost when using the
      opencode-go provider, since this value feeds into executions.estimated_cost_usd
      and is read by the cost circuit breaker (gateway-side, not directly affected,
      but important for dashboard reporting accuracy).
    Steps:
      1. Query the executions table for the Go task's cost data:
         SELECT prompt_tokens, completion_tokens, estimated_cost_usd,
                session_transcript IS NOT NULL as has_transcript
         FROM executions WHERE task_id = '$TASK_ID'
      2. Record estimated_cost_usd — is it $0, or does OpenCode calculate a synthetic cost?
      3. If session_transcript is available, extract info.cost values from it:
         SELECT jsonb_array_elements(session_transcript::jsonb) -> 'info' -> 'cost'
         FROM executions WHERE task_id = '$TASK_ID'
         (If transcript is stored as text, adapt the query accordingly)
      4. As a fallback, check the harness log for extractUsage output:
         grep -i 'cost\|usage\|token' /tmp/employee-${TASK_ID:0:8}.log | head -20
      5. Compare against a known OpenRouter task's cost data for the same model:
         SELECT estimated_cost_usd, prompt_tokens, completion_tokens
         FROM executions
         WHERE task_id != '$TASK_ID'
         AND estimated_cost_usd > 0
         ORDER BY created_at DESC LIMIT 1
      6. Document findings in .sisyphus/evidence/task-6-go-cost-analysis.md with:
         - Go task: estimated_cost_usd value, prompt_tokens, completion_tokens
         - OpenRouter comparison task (if available): same fields
         - Whether info.cost is $0 or has a value for Go
         - Conclusion: does cost reporting work, partially work, or not work?
         - Recommendation: any follow-up action needed?
    Expected Result: A clear documented understanding of Go cost reporting behavior.
      Acceptable outcomes (all are valid, just need to be documented):
      - info.cost = $0 for Go tasks → cost reporting underreports, but nothing breaks
      - info.cost = synthetic value → cost reporting works normally
      - info.cost = null/missing → extractUsage() returns 0, same as $0 case
    Failure Indicators: Unable to determine cost behavior (transcript missing AND
      log has no cost data AND DB has no execution row)
    Evidence: .sisyphus/evidence/task-6-go-cost-analysis.md
  ```

  **Commit**: NO (E2E verification task, no source changes)

- [x] 7. Regression Test — OpenRouter Fallback Without Go Key

  **What to do**:
  - Verify that removing `OPENCODE_GO_API_KEY` reverts all routing to OpenRouter (no behavior change from before this work)
  - This is a critical regression test to ensure the change is safely reversible

  Steps:
  1. **Temporarily remove Go key**: Comment out `OPENCODE_GO_API_KEY` in `.env` (or set to empty string)
  2. **Restart services** so the env var change takes effect
  3. **Trigger test employee**:
     ```bash
     source .env
     curl -s -X POST \
       "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
       -H "X-Admin-Key: $ADMIN_API_KEY" \
       -H "Content-Type: application/json" \
       -d '{}' | jq '{task_id: .task_id}'
     ```
  4. **Wait for completion**, then verify:
     - Task reached `Done` status
     - Harness log contains `"provider":"openrouter"` (confirms OpenRouter routing)
     - NO `"provider":"opencode-go"` entries in logs
  5. **Restore Go key**: Uncomment `OPENCODE_GO_API_KEY` in `.env` after test

  **Must NOT do**:
  - Do NOT leave the Go key removed after the test — restore it
  - Do NOT modify any source files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E trigger + verification, same as Task 6
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run after Task 6 to avoid env conflicts)
  - **Parallel Group**: Wave 3 (sequential after Task 6)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:
  - Same as Task 6

  **Acceptance Criteria**:
  - [ ] Task triggered and reaches `Done` status WITHOUT Go key
  - [ ] Harness log contains `"provider":"openrouter"` (not `"opencode-go"`)
  - [ ] Go key restored in `.env` after test

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Task completes via OpenRouter when Go key is absent
    Tool: Bash
    Preconditions: OPENCODE_GO_API_KEY removed/empty, services restarted, Docker image current
    Steps:
      1. Trigger real-estate-motivation-bot-2 via curl
      2. Capture task_id from response
      3. Wait 90 seconds
      4. Query: SELECT status FROM tasks WHERE id = '$TASK_ID'
      5. Assert status = 'Done'
      6. Run: grep '"provider":"openrouter"' /tmp/employee-${TASK_ID:0:8}.log
      7. Assert at least 1 match
      8. Run: grep '"provider":"opencode-go"' /tmp/employee-${TASK_ID:0:8}.log
      9. Assert 0 matches (no Go routing without key)
    Expected Result: Task Done via OpenRouter, no Go routing
    Failure Indicators: Task failed, or "opencode-go" appears in logs
    Evidence: .sisyphus/evidence/task-7-regression-openrouter.txt

  Scenario: Go key is restored after test
    Tool: Bash
    Steps:
      1. Run: grep 'OPENCODE_GO_API_KEY' .env
      2. Assert line is uncommented and has a value
    Expected Result: Go key is back in .env
    Evidence: .sisyphus/evidence/task-7-key-restored.txt
  ```

  **Commit**: NO (regression test, no source changes)

- [x] 8. Send Telegram Notification

  **What to do**:
  - Send Telegram notification that the plan is complete
  - Run: `tsx scripts/telegram-notify.ts "✅ OpenCodeGo Provider Integration complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4 + user okay

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for provider routing logic, check auth.json writing). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (Go routing + OpenRouter fallback). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                         | Files                                     | Pre-commit                         |
| ---- | ---------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| 1    | `feat(workers): add Go model mapping utility with provider resolution` | `src/workers/lib/go-models.ts`, test file | `pnpm test -- --run`               |
| 2    | `chore(env): add OPENCODE_GO_API_KEY to platform env whitelist`        | `tenant-env-loader.ts`, `.env.example`    | `pnpm build`                       |
| 4    | `feat(workers): route execution through OpenCodeGo when available`     | `opencode-harness.mts`                    | `pnpm test -- --run && pnpm build` |
| 5    | `docs: add OpenCodeGo provider documentation to AGENTS.md`             | `AGENTS.md`                               | —                                  |

---

## Success Criteria

### Verification Commands

```bash
# Unit tests pass
pnpm test -- --run                                    # Expected: all pass, 0 failures

# Build succeeds
pnpm build                                            # Expected: clean compile

# Go routing observable in task logs
grep '"provider":"opencode-go"' /tmp/employee-*.log   # Expected: matches when Go key is set

# OpenRouter fallback works
grep '"provider":"openrouter"' /tmp/employee-*.log    # Expected: matches when Go key is absent
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] E2E with Go routing: task reaches Done
- [ ] E2E without Go key: task reaches Done (regression)
- [ ] AGENTS.md updated with new env var and provider info
