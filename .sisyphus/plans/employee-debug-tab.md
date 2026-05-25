# Employee Debug Tab — Shared Prompt & AGENTS.md Preview

## TL;DR

> **Quick Summary**: Add a "Debug" tab to the employee detail page that shows the EXACT execution prompt and EXACT resolved AGENTS.md as the harness constructs them. Fix the brain-preview API to share code with the harness so they can never drift apart.
>
> **Deliverables**:
>
> - Shared prompt assembler module (`src/workers/lib/prompt-assembler.mts`)
> - Fixed brain-preview API using shared code (no more inline duplicates)
> - New "Debug" tab on employee detail page with rendered + raw markdown views
> - Updated `BrainPreviewResponse` type with missing layers
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → F1-F4

---

## Context

### Original Request

User wants a debugging page for each employee that shows:

1. The EXACT prompt sent to the AI employee every time it's executed
2. The full resolved AGENTS.md file in rendered markdown + raw source

The existing brain-preview API has drifted from the harness — it has its own inline `resolveAgentsMd()` with only 5 layers (missing Platform Runtime Context and Final Reminders) and constructs the execution prompt incorrectly (`systemPrompt + instructions` instead of the preamble-wrapped version with date injection and submit-output wrapping). The user explicitly wants shared code between the API and harness so they can never drift.

### Interview Summary

**Key Discussions**:

- **Location**: New tab on existing employee detail page (not standalone page)
- **API approach**: Fix existing brain-preview endpoint (not new endpoint)
- **Shared code mandate**: API and harness must import the SAME functions — no inline duplicates
- **Technical instructions**: Shell commands NEVER go in "The Assignment" section — platform-level only
- **Submit-output removed from instructions**: Already done — stripped from archetype instructions field

**Research Findings**:

- The harness at `opencode-harness.mts:855-952` builds 7 AGENTS.md layers + wraps the task prompt with preamble/suffix/date injection
- The API at `admin-brain-preview.ts:33-57` has an inline 5-layer `resolveAgentsMd()` that's missing layers #2 (Platform Runtime Context) and #7 (Final Reminders)
- The API at line 310 constructs `execution_prompt` as `${systemPrompt}\n\n${instructions}` — missing the preamble, date context line, and suffix
- `agents-md-resolver.mts` (43 lines) is the shared 7-layer resolver — already used by harness, just needs to be imported by the API
- `platform-procedures.mts` (42 lines) generates the "How to Complete Your Work" section — harness uses it, API doesn't
- `tool-reference-generator.mts` generates tool reference — already imports from `gateway/services/tool-parser.js`
- `ProfilePreviewSection.tsx` already uses the brain-preview API — will automatically benefit from the fix
- Tab state is already URL-encoded via `useSearchParams` — adding `value="debug"` follows existing pattern
- `MarkdownPreview` component is already used throughout the dashboard

### Metis Review

**Identified Gaps** (addressed):

- **Import boundary**: Gateway `.ts` files importing from `src/workers/lib/*.mts` — use `.mjs` extension in import path. The reverse direction (workers→gateway) already works via `tool-reference-generator.mts` importing `tool-parser.js`.
- **`generateToolReference` is async**: Reads filesystem — API should call it directly (tools basePath is available in API context).
- **`PLATFORM_ENV_MANIFEST`**: Runtime-only env var built by harness — API must synthesize an equivalent from the env_vars array it already computes.
- **`system_prompt` placement**: Currently wrong in API (prepended to prompt) vs harness (in platformRuntimeSections as "Legacy System Prompt").
- **Template variable substitution**: Harness calls `substituteTemplateVars()` on `agents_md` — API should do the same or note it as runtime-only.

---

## Work Objectives

### Core Objective

Ensure the dashboard shows the EXACT same execution prompt and AGENTS.md that the harness would construct at runtime, by sharing code between the API and the harness.

### Concrete Deliverables

- `src/workers/lib/prompt-assembler.mts` — New shared module
- `src/gateway/routes/admin-brain-preview.ts` — Fixed to use shared imports
- `dashboard/src/lib/types.ts` — Updated `BrainPreviewResponse` interface
- `dashboard/src/panels/employees/DebugTab.tsx` — New debug tab component
- `dashboard/src/panels/employees/EmployeeDetail.tsx` — Add "Debug" tab trigger

### Definition of Done

- [ ] `curl` brain-preview API returns `agents_md.layers` with all 7 layers (platform, platformRuntime, tenant, employee, rules, knowledge, finalReminders)
- [ ] `curl` brain-preview API returns `execution_prompt` with preamble, date context, instructions, and suffix — matching harness format
- [ ] Dashboard Debug tab renders both sections with rendered markdown + raw source toggle
- [ ] `ProfilePreviewSection` still works correctly (regression check — it consumes same API)
- [ ] No inline `resolveAgentsMd` remains in `admin-brain-preview.ts`

### Must Have

- Shared `resolveAgentsMd` import from `src/workers/lib/agents-md-resolver.mts` — NOT an inline copy
- Shared prompt assembly logic — NOT duplicated between harness and API
- All 7 AGENTS.md layers present in API response
- Execution prompt includes preamble, date/epoch context, and suffix
- Debug tab with rendered markdown + raw source toggle for both sections
- Tab state URL-encoded (follows existing pattern)

### Must NOT Have (Guardrails)

- DO NOT modify `src/workers/lib/agents-md-resolver.mts` — only import it
- DO NOT modify `archetype-generator.ts`, `submit-output.ts`, or `output-schema.mts`
- DO NOT add shell commands or platform instructions to the archetype `instructions` field
- DO NOT run unit tests (known timeout issues)
- DO NOT remove §1 (Platform Code Is Off-Limits) or §2 (Database Access Only Via Tools) from agents.md
- DO NOT add new npm dependencies — use existing components and libraries

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO (user explicitly said not to run tests — known timeout issues)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API**: Use Bash (curl) — Send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — shared modules):
├── Task 1: Extract shared prompt assembler [quick]
└── Task 2: Extract shared env-manifest builder [quick]

Wave 2 (Integration — fix API + update types):
├── Task 3: Fix brain-preview API to use shared code (depends: 1, 2) [unspecified-high]
└── Task 4: Update BrainPreviewResponse type (depends: 3) [quick]

Wave 3 (UI — debug tab):
├── Task 5: Build Debug tab component (depends: 4) [visual-engineering]
└── Task 6: Wire Debug tab into EmployeeDetail (depends: 5) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 3      | 1     |
| 2     | —          | 3      | 1     |
| 3     | 1, 2       | 4      | 2     |
| 4     | 3          | 5      | 2     |
| 5     | 4          | 6      | 3     |
| 6     | 5          | F1-F4  | 3     |
| F1-F4 | 6          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2 parallel** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **2 sequential** — T3 → `unspecified-high`, T4 → `quick`
- **Wave 3**: **2 sequential** — T5 → `visual-engineering`, T6 → `quick`
- **FINAL**: **4 parallel** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Extract shared prompt assembler module

  **What to do**:
  - Create `src/workers/lib/prompt-assembler.mts`
  - Extract the prompt assembly logic from `opencode-harness.mts:922-952` into a pure function
  - Function signature: `assembleTaskPrompt(options: { instructions: string; approvalRequired: boolean; envManifest?: string }): string`
  - The function must construct the EXACT same prompt the harness builds:
    1. `submitOutputPreamble` — "MANDATORY FINAL STEP: ..." with the correct classification (`NEEDS_APPROVAL` or `NO_ACTION_NEEDED`) + env var manifest (NOTIFICATION_CHANNEL, TASK_ID, SLACK_BOT_TOKEN)
    2. `contextLine` — "TODAY: {human-readable date} | EPOCH_MS: {epoch}" using current time
    3. The resolved `instructions` (passed in as parameter)
    4. `submitOutputSuffix` — "---\nREMINDER — MANDATORY FINAL STEP: ..."
    5. `"\n\nTask ID: <dynamic at runtime>"` appended at the end
  - The harness should then import and call this function instead of inline assembly. Update `opencode-harness.mts` to: `import { assembleTaskPrompt } from './prompt-assembler.mjs';` and replace lines 922-952 with a call to `assembleTaskPrompt({ instructions: resolvedInstructions, approvalRequired, envManifest: platformEnvManifest })`
  - The function must accept an optional `taskId` parameter — when provided (harness), it uses the real task ID; when omitted (API preview), it uses `"<dynamic at runtime>"`
  - Export everything needed so the API can import the same function

  **Must NOT do**:
  - Do NOT change the actual prompt content — only extract it
  - Do NOT modify `agents-md-resolver.mts`
  - Do NOT add shell commands to archetype instructions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward extraction refactor — move existing code into a new module
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not a shell tool — this is an internal library module

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:922-952` — The EXACT prompt assembly logic to extract. Lines 925-926 build `submitOutputCmd` and `submitOutputPreamble`, lines 930-948 build the date context, line 950 is the suffix, line 951-952 combines them. This is the source of truth.
  - `src/workers/lib/platform-procedures.mts` — Example of an existing shared module extracted from the harness. Follow the same pattern: TypeScript interface for options, exported pure function.
  - `src/workers/lib/agents-md-resolver.mts` — Another example of the extraction pattern. Note the `.mts` extension convention.

  **API/Type References**:
  - `src/workers/opencode-harness.mts:877-878` — How `approvalRequired` is derived from `archetype.risk_model`

  **WHY Each Reference Matters**:
  - `opencode-harness.mts:922-952`: This is the code being extracted — copy it verbatim, then parameterize. The prompt format (preamble + context + instructions + suffix + task ID) must be byte-for-byte identical to what the harness currently produces.
  - `platform-procedures.mts`: Shows the established pattern for shared worker modules — TypeScript interface, pure function, `.mts` extension.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Prompt assembler produces correct output
    Tool: Bash
    Preconditions: Module exists at src/workers/lib/prompt-assembler.mts
    Steps:
      1. Run: node -e "import('./src/workers/lib/prompt-assembler.mjs').then(m => { const result = m.assembleTaskPrompt({ instructions: 'Test instructions here', approvalRequired: true }); console.log(JSON.stringify({ startsWithMandatory: result.startsWith('MANDATORY FINAL STEP'), containsToday: result.includes('TODAY:'), containsEpoch: result.includes('EPOCH_MS:'), containsInstructions: result.includes('Test instructions here'), containsReminder: result.includes('REMINDER — MANDATORY FINAL STEP'), containsTaskId: result.includes('Task ID:'), containsNeedsApproval: result.includes('NEEDS_APPROVAL') })) })"
      2. Assert all fields are true
    Expected Result: All 7 boolean fields are true — the assembled prompt contains all required sections
    Failure Indicators: Any field is false, or import fails
    Evidence: .sisyphus/evidence/task-1-prompt-assembler-output.txt

  Scenario: Harness still compiles after refactor
    Tool: Bash
    Preconditions: Harness updated to import from prompt-assembler
    Steps:
      1. Run: npx tsc --noEmit src/workers/opencode-harness.mts 2>&1 || true
      2. Check for type errors in the changed file
    Expected Result: No new type errors introduced by the refactor
    Failure Indicators: Type errors referencing prompt-assembler or the removed inline code
    Evidence: .sisyphus/evidence/task-1-tsc-check.txt

  Scenario: approvalRequired=false changes classification
    Tool: Bash
    Preconditions: Module exists
    Steps:
      1. Run: node -e "import('./src/workers/lib/prompt-assembler.mjs').then(m => { const result = m.assembleTaskPrompt({ instructions: 'Test', approvalRequired: false }); console.log(JSON.stringify({ containsNoAction: result.includes('NO_ACTION_NEEDED'), doesNotContainNeedsApproval: !result.includes('NEEDS_APPROVAL') })) })"
      2. Assert both fields are true
    Expected Result: Classification is NO_ACTION_NEEDED, not NEEDS_APPROVAL
    Evidence: .sisyphus/evidence/task-1-no-approval-mode.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): extract shared prompt assembler module`
  - Files: `src/workers/lib/prompt-assembler.mts`, `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm lint`

- [x] 2. Extract shared env-manifest builder

  **What to do**:
  - Create `src/workers/lib/env-manifest-builder.mts`
  - Extract the logic for building the `PLATFORM_ENV_MANIFEST` string from an env vars list
  - At runtime (harness), `PLATFORM_ENV_MANIFEST` is a pre-built string injected as an env var by the lifecycle. At preview time (API), it doesn't exist — the API must synthesize an equivalent from the env_vars array it already computes.
  - Function signature: `buildEnvManifestFromVars(envVars: Array<{ name: string; source: string; category: string }>): string`
  - The function formats env vars into the same bullet-point format the harness sees: `- $VAR_NAME — source (category)`
  - This is a small utility — the main value is that both harness and API can produce identical env manifests

  **Must NOT do**:
  - Do NOT modify `agents-md-resolver.mts`
  - Do NOT change how the harness reads `PLATFORM_ENV_MANIFEST` — it still reads the env var at runtime

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility function — ~20 lines
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:863-869` — How the harness reads `PLATFORM_ENV_MANIFEST` and injects it into AGENTS.md as "Available Environment Variables"
  - `src/gateway/routes/admin-brain-preview.ts:156-306` — The env_vars array construction in the API. This is the data source the manifest builder will format.
  - `src/workers/lib/platform-procedures.mts` — Pattern to follow: interface + pure function + `.mts` extension

  **WHY Each Reference Matters**:
  - `opencode-harness.mts:863-869`: Shows the format the harness expects — the builder must produce compatible output
  - `admin-brain-preview.ts:156-306`: The env_vars array has `name`, `source`, `category`, `is_set` fields — the builder formats these into a readable string

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Env manifest builder produces formatted output
    Tool: Bash
    Preconditions: Module exists at src/workers/lib/env-manifest-builder.mts
    Steps:
      1. Run: node -e "import('./src/workers/lib/env-manifest-builder.mjs').then(m => { const result = m.buildEnvManifestFromVars([{name:'TASK_ID',source:'lifecycle',category:'always'},{name:'SLACK_BOT_TOKEN',source:'tenant_secret',category:'always'}]); console.log(result); console.log('---'); console.log(JSON.stringify({ containsTaskId: result.includes('TASK_ID'), containsSlackBot: result.includes('SLACK_BOT_TOKEN') })) })"
      2. Assert output contains both variable names in a readable format
    Expected Result: Formatted string with both vars listed
    Evidence: .sisyphus/evidence/task-2-env-manifest-output.txt

  Scenario: Empty vars array produces empty string
    Tool: Bash
    Steps:
      1. Run: node -e "import('./src/workers/lib/env-manifest-builder.mjs').then(m => { console.log(JSON.stringify({ result: m.buildEnvManifestFromVars([]) })) })"
    Expected Result: Empty string returned
    Evidence: .sisyphus/evidence/task-2-empty-vars.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): extract shared env-manifest builder`
  - Files: `src/workers/lib/env-manifest-builder.mts`
  - Pre-commit: `pnpm lint`

- [x] 3. Fix brain-preview API to use shared code from harness

  **What to do**:
  - Modify `src/gateway/routes/admin-brain-preview.ts` to eliminate ALL inline duplicates and use shared imports instead.

  **Step-by-step changes:**

  **A. Replace inline `resolveAgentsMd` (lines 33-57) with shared import:**
  - Delete the inline function at lines 33-57
  - Add import: `import { resolveAgentsMd } from '../../workers/lib/agents-md-resolver.mjs';`
  - The shared version accepts `platformRuntimeSections` and `closingSections` parameters — pass them

  **B. Import and use shared prompt assembler:**
  - Add import: `import { assembleTaskPrompt } from '../../workers/lib/prompt-assembler.mjs';`
  - Replace line 310 (`const executionPrompt = \`${systemPrompt}\n\n${instructions}\`...`) with a call to `assembleTaskPrompt({ instructions, approvalRequired, envManifest })`where`approvalRequired`is derived from`archetype.risk_model`(same as harness at line 877-878) and`envManifest` is built from the env_vars array using the shared builder

  **C. Import and use shared platform-procedures:**
  - Add import: `import { generatePlatformProcedures } from '../../workers/lib/platform-procedures.mjs';`

  **D. Build platformRuntimeSections (matching harness lines 856-883):**
  - Build the `platformRuntimeSections` array exactly as the harness does:
    1. Security preamble (same string as harness line 860)
    2. Env manifest section — use `buildEnvManifestFromVars(env_vars)` from Task 2
    3. Legacy system prompt (if non-empty) — `## Legacy System Prompt\n\n${systemPrompt}`
    4. Platform procedures — `generatePlatformProcedures({ approvalRequired })`
    5. Tool reference — call `generateToolReference(toolPaths)` where `toolPaths` comes from `archetype.tool_registry`
  - Import `generateToolReference` from `../../workers/lib/tool-reference-generator.mjs`

  **E. Build closingSections (matching harness lines 898-901):**
  - Build the `closingSections` array: the submit-output closing reminder with correct classification

  **F. Call shared `resolveAgentsMd` with all 7 layers:**
  - Replace the current 5-arg call (line 146-152) with the full 7-arg call: `resolveAgentsMd(platformMd, tenantConfig, archetype, rulesForMd, knowledgeForMd, platformRuntimeSections, closingSections)`

  **G. Update the response `agents_md.layers` object:**
  - Add `platformRuntime` layer (the joined platformRuntimeSections)
  - Add `finalReminders` layer (the joined closingSections)
  - Keep existing layers (platform, tenant, employee, rules, knowledge)

  **H. Template variable substitution:**
  - Apply `substituteTemplateVars` to `archetype.agents_md` before passing to resolver, matching harness line 895
  - Import from harness or implement inline (it's simple string replacement of `{{VAR_NAME}}` with env values)
  - For preview, use placeholder values for runtime-only vars like `TASK_ID`: `"<dynamic at runtime>"`

  **I. Clean up dead code:**
  - Remove the `extractSections` function (lines 19-29) and `outputContractContent` (line 31) — they extracted output contract text for `autoInjectedSections` which is now superseded by the proper layer structure
  - Remove or simplify the `autoInjectedSections` response field since the data is now in proper layers

  **Must NOT do**:
  - Do NOT modify `agents-md-resolver.mts` — only import it
  - Do NOT modify `platform-procedures.mts` — only import it
  - Do NOT change the API route path or parameter schema
  - Do NOT remove env_vars, tools, skills, config, or output_contract from the response — those stay

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step integration task touching imports, response shape, and business logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:855-911` — The EXACT AGENTS.md construction to replicate. Lines 856-883 build platformRuntimeSections, lines 897-901 build closingSections, lines 902-911 call resolveAgentsMd with all 7 args.
  - `src/workers/opencode-harness.mts:922-952` — The EXACT prompt assembly to replicate (now shared via Task 1's prompt-assembler module).
  - `src/workers/lib/tool-reference-generator.mts:10` — Shows how to import from gateway: `import { getToolByPath } from '../../gateway/services/tool-parser.js'`. The reverse direction (gateway → workers) uses `.mjs` extension.

  **API/Type References**:
  - `src/workers/lib/agents-md-resolver.mts:11-18` — Full function signature with all 7 parameters
  - `src/workers/lib/platform-procedures.mts:5-7` — `PlatformProceduresOptions` interface
  - `src/gateway/routes/admin-brain-preview.ts:59-64` — `EnvVarEntry` interface (stays unchanged)

  **WHY Each Reference Matters**:
  - `opencode-harness.mts:855-911`: This is the source of truth for what AGENTS.md looks like at runtime. The API must produce IDENTICAL output. Copy the platformRuntimeSections and closingSections construction verbatim.
  - `tool-reference-generator.mts:10`: Proves the cross-boundary import pattern works — gateway→workers uses `.mjs`.
  - `agents-md-resolver.mts:11-18`: The function signature shows all 7 parameters including the new `platformRuntimeSections` and `closingSections`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: API returns all 7 AGENTS.md layers
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700
    Steps:
      1. Run: source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/3b07ec63-207f-4f2b-a8c3-c17f08bc508f/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.agents_md.layers | keys'
      2. Assert output contains: ["employee","finalReminders","knowledge","platform","platformRuntime","rules","tenant"]
    Expected Result: All 7 layer keys present (was 5 before fix)
    Failure Indicators: Missing "platformRuntime" or "finalReminders" keys
    Evidence: .sisyphus/evidence/task-3-api-layers.json

  Scenario: execution_prompt contains preamble and date context
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Run: source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/3b07ec63-207f-4f2b-a8c3-c17f08bc508f/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq -r '.execution_prompt' > /tmp/exec-prompt.txt
      2. Assert: grep -c "MANDATORY FINAL STEP" /tmp/exec-prompt.txt returns 2 (preamble + suffix)
      3. Assert: grep -c "TODAY:" /tmp/exec-prompt.txt returns 1
      4. Assert: grep -c "EPOCH_MS:" /tmp/exec-prompt.txt returns 1
      5. Assert: grep -c "Task ID:" /tmp/exec-prompt.txt returns 1
    Expected Result: Prompt contains preamble (top), date context, instructions, suffix (bottom), and task ID
    Failure Indicators: Any grep returns 0
    Evidence: .sisyphus/evidence/task-3-exec-prompt.txt

  Scenario: platformRuntime layer contains security + procedures + tool reference
    Tool: Bash (curl)
    Steps:
      1. Run: source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/3b07ec63-207f-4f2b-a8c3-c17f08bc508f/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq -r '.agents_md.layers.platformRuntime' > /tmp/platform-runtime.txt
      2. Assert: grep -c "Security Boundary" /tmp/platform-runtime.txt returns 1
      3. Assert: grep -c "How to Complete Your Work" /tmp/platform-runtime.txt returns 1
    Expected Result: platformRuntime layer contains security preamble and platform procedures
    Evidence: .sisyphus/evidence/task-3-platform-runtime.txt

  Scenario: No inline resolveAgentsMd remains
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "function resolveAgentsMd" src/gateway/routes/admin-brain-preview.ts
    Expected Result: No matches — the inline function has been removed
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-3-no-inline.txt

  Scenario: API still returns 200 (no import errors)
    Tool: Bash (curl)
    Steps:
      1. Run: source .env && curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/3b07ec63-207f-4f2b-a8c3-c17f08bc508f/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY"
    Expected Result: 200
    Failure Indicators: 500 (import error), 404
    Evidence: .sisyphus/evidence/task-3-api-status.txt
  ```

  **Commit**: YES
  - Message: `fix(gateway): sync brain-preview API with harness using shared code`
  - Files: `src/gateway/routes/admin-brain-preview.ts`
  - Pre-commit: `pnpm lint`

- [x] 4. Update BrainPreviewResponse type and frontend gateway client

  **What to do**:
  - Update `dashboard/src/lib/types.ts` — add `platformRuntime` and `finalReminders` to `BrainPreviewResponse.agents_md.layers`
  - The updated interface should be:
    ```typescript
    layers: {
      platform: string;
      platformRuntime: string | null; // NEW
      tenant: string | null;
      employee: string | null;
      rules: string | null;
      knowledge: string | null;
      finalReminders: string | null; // NEW
    }
    ```
  - Verify `fetchBrainPreview` in `dashboard/src/lib/gateway.ts` doesn't need changes (it's generic — just passes through the JSON)
  - Verify `ProfilePreviewSection.tsx` still compiles — it accesses `data.agents_md.layers.platform` etc. The new fields are additive, so existing code should be fine. But check for any destructuring that would break.

  **Must NOT do**:
  - Do NOT change `fetchBrainPreview` behavior — it's a passthrough
  - Do NOT modify ProfilePreviewSection logic (it should just work with additive fields)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type-only change — 2 lines added to an interface
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `dashboard/src/lib/types.ts:248-286` — Current `BrainPreviewResponse` interface. Add 2 new fields to `layers`.
  - `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx:1-60` — Consumes `BrainPreviewResponse`. Check it doesn't destructure `layers` in a way that breaks.

  **WHY Each Reference Matters**:
  - `types.ts:248-286`: The EXACT location to add the new fields. The interface must match what the API now returns.
  - `ProfilePreviewSection.tsx`: Regression risk — need to verify additive fields don't break existing consumers.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds
    Tool: Bash
    Steps:
      1. Run: cd dashboard && npx tsc --noEmit 2>&1 | tail -5
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-4-tsc.txt

  Scenario: ProfilePreviewSection still references valid types
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "layers\." dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx
      2. Verify all accessed fields (platform, tenant, employee, rules, knowledge) still exist in the updated type
    Expected Result: All existing field accesses are still valid
    Evidence: .sisyphus/evidence/task-4-profile-preview-check.txt
  ```

  **Commit**: YES (groups with Task 5 and 6)
  - Message: `feat(dashboard): add Debug tab to employee detail page`
  - Files: `dashboard/src/lib/types.ts`
  - Pre-commit: `pnpm lint`

- [x] 5. Build Debug tab component

  **What to do**:
  - Create `dashboard/src/panels/employees/DebugTab.tsx`
  - The component receives `archetypeId: string` and `tenantId: string` as props
  - On mount, call `fetchBrainPreview(tenantId, archetypeId)` — follow the exact fetch-on-mount pattern from `ProfilePreviewSection.tsx:40-56`
  - Display two main sections, each in a card (`rounded-lg border bg-card px-5 py-4`):

  **Section 1: "Execution Prompt"**
  - Header: "Execution Prompt" with a subtitle: "The exact prompt sent to the AI employee at runtime"
  - Toggle button: "Rendered" / "Source" — switches between MarkdownPreview and raw `<pre>` block
  - Default: "Rendered" (MarkdownPreview)
  - Content: `data.execution_prompt`
  - The raw view should use `<pre className="whitespace-pre-wrap font-mono text-xs bg-muted/30 p-4 rounded-md overflow-auto max-h-[600px]">`

  **Section 2: "Resolved AGENTS.md"**
  - Header: "Resolved AGENTS.md" with a subtitle: "The full AGENTS.md file as the harness constructs it (all 7 layers merged)"
  - Same toggle: "Rendered" / "Source"
  - Default: "Rendered" (MarkdownPreview)
  - Content: `data.agents_md.full`
  - Below the full view, add a collapsible "Individual Layers" section showing each layer separately with its name as a header:
    - Platform Policy, Platform Runtime Context, Tenant Conventions, Employee Instructions, Behavioral Rules, Employee Knowledge, Final Reminders
    - Each layer rendered with MarkdownPreview inside a card
    - Skip layers that are null/empty — don't show empty sections

  **Loading/Error states:**
  - Loading: Skeleton placeholders (2 animated pulse blocks)
  - Error: Red text with retry button
  - Follow the exact pattern from `ProfilePreviewSection.tsx`

  **Must NOT do**:
  - Do NOT add new npm dependencies
  - Do NOT use emojis in the UI
  - Do NOT make the tab editable — this is read-only debug view

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with layout, toggle state, conditional rendering
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx:35-60` — Fetch-on-mount pattern: useState for data/loading/error, useEffect calling fetchBrainPreview, .then/.catch pattern. COPY THIS PATTERN EXACTLY.
  - `dashboard/src/panels/employees/TrainingTab.tsx` — Tab component structure pattern. DebugTab should follow the same props interface pattern.
  - `dashboard/src/components/MarkdownPreview.tsx` — The markdown renderer to use. Import: `import { MarkdownPreview } from '@/components/MarkdownPreview'`
  - `dashboard/src/panels/employees/components/CollapsibleSection.tsx` — Use for the "Individual Layers" collapsible. Already applies card styling.

  **API/Type References**:
  - `dashboard/src/lib/types.ts:248-286` — `BrainPreviewResponse` interface (updated in Task 4 with new layer fields)
  - `dashboard/src/lib/gateway.ts:170-173` — `fetchBrainPreview(tenantId, archetypeId)` function

  **WHY Each Reference Matters**:
  - `ProfilePreviewSection.tsx:35-60`: This is the EXACT fetch pattern to copy — same API call, same loading/error/data state management. The DebugTab is structurally the same component but with different content rendering.
  - `CollapsibleSection.tsx`: Used for the individual layers accordion — each layer is a collapsible section.
  - `MarkdownPreview.tsx`: The markdown renderer used everywhere — import path and usage pattern.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Debug tab loads and renders execution prompt
    Tool: Playwright
    Preconditions: Gateway running, dashboard dev server at localhost:7701
    Steps:
      1. Navigate to: http://localhost:7701/dashboard/employees/3b07ec63-207f-4f2b-a8c3-c17f08bc508f?tenant=00000000-0000-0000-0000-000000000003&tab=debug
      2. Wait for loading to complete (skeleton disappears)
      3. Assert: text "Execution Prompt" is visible on page
      4. Assert: text "MANDATORY FINAL STEP" is visible (from the prompt preamble)
      5. Assert: text "Resolved AGENTS.md" is visible on page
    Expected Result: Both sections render with content from the API
    Failure Indicators: Skeleton never disappears, error message shown, or sections missing
    Evidence: .sisyphus/evidence/task-5-debug-tab-loaded.png

  Scenario: Source toggle shows raw markdown
    Tool: Playwright
    Preconditions: Debug tab loaded
    Steps:
      1. Find and click the "Source" toggle button in the "Execution Prompt" section
      2. Assert: a <pre> element is now visible with monospace text
      3. Assert: the rendered MarkdownPreview is no longer visible in that section
    Expected Result: Toggle switches between rendered and raw view
    Evidence: .sisyphus/evidence/task-5-source-toggle.png

  Scenario: Individual layers section shows non-null layers
    Tool: Playwright
    Steps:
      1. Scroll to "Individual Layers" section
      2. Assert: "Platform Policy" layer is visible
      3. Assert: "Platform Runtime Context" layer is visible
      4. Assert: "Final Reminders" layer is visible
    Expected Result: All non-null layers are shown with their content
    Evidence: .sisyphus/evidence/task-5-individual-layers.png

  Scenario: Error state shows retry button
    Tool: Playwright
    Steps:
      1. Navigate to debug tab with an invalid archetypeId: http://localhost:7701/dashboard/employees/00000000-0000-0000-0000-000000000000?tenant=00000000-0000-0000-0000-000000000003&tab=debug
      2. Wait for error state
      3. Assert: error message is visible
    Expected Result: Error message displayed (not a blank screen)
    Evidence: .sisyphus/evidence/task-5-error-state.png
  ```

  **Commit**: YES (groups with Tasks 4 and 6)
  - Message: `feat(dashboard): add Debug tab to employee detail page`
  - Files: `dashboard/src/panels/employees/DebugTab.tsx`
  - Pre-commit: `pnpm lint`

- [x] 6. Wire Debug tab into EmployeeDetail

  **What to do**:
  - Modify `dashboard/src/panels/employees/EmployeeDetail.tsx`
  - Add import: `import { DebugTab } from './DebugTab';`
  - Add a new `TabsTrigger` in the `TabsList` at line 449-454:
    ```tsx
    <TabsTrigger value="debug">Debug</TabsTrigger>
    ```
    Place it after "Advanced" — it should be the last tab.
  - Add a new `TabsContent` after the "advanced" content block (after line 580):
    ```tsx
    <TabsContent value="debug">
      <DebugTab archetypeId={archetype.id} tenantId={tenantId} />
    </TabsContent>
    ```
  - The tab state is already URL-encoded via `useSearchParams` at line 50-62 — `?tab=debug` will work automatically.

  **Must NOT do**:
  - Do NOT change existing tab order or behavior
  - Do NOT modify any existing TabsContent blocks

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 lines added — import, TabsTrigger, TabsContent
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:448-580` — The Tabs component structure. Add the new tab following the exact same pattern as existing tabs (profile, activity, training, advanced).
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:471-475` — TrainingTab pattern: `<TabsContent value="training"><div className="rounded-lg border bg-card px-5 py-4"><TrainingTab ... /></div></TabsContent>`. Follow this pattern but note that DebugTab should handle its own card styling internally (since it has multiple cards).

  **WHY Each Reference Matters**:
  - Lines 448-580: The exact location to insert the new tab trigger and content. The pattern is consistent — each tab has a `TabsTrigger` + `TabsContent` pair.
  - Lines 471-475: Shows the wrapping convention — some tabs wrap in a card div, others handle it internally. DebugTab handles its own cards.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Debug tab appears in tab list
    Tool: Playwright
    Preconditions: Dashboard running
    Steps:
      1. Navigate to: http://localhost:7701/dashboard/employees/3b07ec63-207f-4f2b-a8c3-c17f08bc508f?tenant=00000000-0000-0000-0000-000000000003
      2. Assert: tab list contains "Profile", "Activity", "Training", "Advanced", "Debug" in that order
    Expected Result: 5 tabs visible, Debug is last
    Failure Indicators: Debug tab missing or in wrong position
    Evidence: .sisyphus/evidence/task-6-tab-list.png

  Scenario: URL-encoded tab state works
    Tool: Playwright
    Steps:
      1. Navigate directly to: http://localhost:7701/dashboard/employees/3b07ec63-207f-4f2b-a8c3-c17f08bc508f?tenant=00000000-0000-0000-0000-000000000003&tab=debug
      2. Assert: Debug tab is active (selected)
      3. Assert: Debug tab content is visible
    Expected Result: Direct URL navigation lands on Debug tab
    Evidence: .sisyphus/evidence/task-6-url-state.png

  Scenario: Other tabs still work (regression)
    Tool: Playwright
    Steps:
      1. Click "Profile" tab
      2. Assert: Profile content visible
      3. Click "Training" tab
      4. Assert: Training content visible
      5. Click "Debug" tab
      6. Assert: Debug content visible
    Expected Result: All tabs switch correctly
    Evidence: .sisyphus/evidence/task-6-tab-switching.png
  ```

  **Commit**: YES (groups with Tasks 4 and 5)
  - Message: `feat(dashboard): add Debug tab to employee detail page`
  - Files: `dashboard/src/panels/employees/EmployeeDetail.tsx`
  - Pre-commit: `pnpm lint`

- [x] 7. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "📋 employee-debug-tab plan complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After F1-F4 and user okay
  - **Blocked By**: F1-F4

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill for UI)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                               | Files                                                                                                                            | Pre-commit  |
| ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1      | `feat(workers): extract shared prompt assembler module`               | `src/workers/lib/prompt-assembler.mts`                                                                                           | `pnpm lint` |
| 2      | `feat(workers): extract shared env-manifest builder`                  | `src/workers/lib/env-manifest-builder.mts`                                                                                       | `pnpm lint` |
| 3      | `fix(gateway): sync brain-preview API with harness using shared code` | `src/gateway/routes/admin-brain-preview.ts`                                                                                      | `pnpm lint` |
| 4      | `feat(dashboard): add Debug tab to employee detail page`              | `dashboard/src/lib/types.ts`, `dashboard/src/panels/employees/DebugTab.tsx`, `dashboard/src/panels/employees/EmployeeDetail.tsx` | `pnpm lint` |

---

## Success Criteria

### Verification Commands

```bash
# API returns all 7 layers
source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/3b07ec63-207f-4f2b-a8c3-c17f08bc508f/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.agents_md.layers | keys'
# Expected: ["employee","finalReminders","knowledge","platform","platformRuntime","rules","tenant"]

# Execution prompt contains preamble
source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/3b07ec63-207f-4f2b-a8c3-c17f08bc508f/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.execution_prompt' | head -5
# Expected: starts with "MANDATORY FINAL STEP:"

# Debug tab loads in dashboard
# Navigate to http://localhost:7701/dashboard/employees/3b07ec63-207f-4f2b-a8c3-c17f08bc508f?tenant=00000000-0000-0000-0000-000000000003&tab=debug
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `ProfilePreviewSection` still works (regression)
- [ ] Debug tab renders execution prompt and AGENTS.md with toggle
- [ ] No inline `resolveAgentsMd` in API
- [ ] Shared imports verified via grep
