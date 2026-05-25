# Prompt & AGENTS.md Duplication Cleanup

## TL;DR

> **Quick Summary**: Remove redundant submit-output instructions and environment variables from the execution prompt, consolidating reference material into the AGENTS.md file where it belongs. Simplify the Debug tab UI by removing the individual layers breakdown.
>
> **Deliverables**:
>
> - Cleaned execution prompt (date + instructions + suffix only — no preamble, no env vars)
> - AGENTS.md remains the single source of truth for env vars and completion procedures
> - Simplified Debug tab showing one fully resolved AGENTS.md view
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Tasks 1–4 (parallel) → Task 5 (build + verify)

---

## Context

### Original Request

User noticed the Debug tab for AI employees shows duplicate information in the execution prompt:

1. The submit-output `MANDATORY FINAL STEP` instruction appears at both the beginning (preamble) and end (suffix) of the prompt — plus twice more in the AGENTS.md
2. The full environment variable manifest (~30 vars) appears in both the prompt AND the AGENTS.md
3. The "Individual Layers" collapsible section in the Debug tab is unnecessary — user wants one single fully resolved AGENTS.md view

### Interview Summary

**Key Discussions**:

- User correctly identified that the end of prompt (suffix) takes precedence over the beginning (preamble) due to recency effect in LLMs — agreed to remove preamble, keep suffix
- User decided environment variables are reference material, not prompt instructions — belong in AGENTS.md only
- User wants one clean view of the resolved AGENTS.md in the Debug tab

**Research Findings**:

- The submit-output instruction currently appears in 4 places: prompt preamble, prompt suffix, AGENTS.md Platform Runtime Context ("How to Complete Your Work"), and AGENTS.md Final Reminders
- After cleanup: appears in 2 places: prompt suffix (lightweight reminder) + AGENTS.md Platform Runtime Context (detailed guidance)
- `autoInjectedSections.outputContract` in the brain-preview API response is sourced from `closingSections[0]` — used by `ProfilePreviewSection`. Must be re-sourced from `generatePlatformProcedures()` to avoid breaking the Profile tab

### Metis Review

**Identified Gaps** (addressed):

- `autoInjectedSections.outputContract` would go blank if `closingSections` is naively removed from `admin-brain-preview.ts` → Re-source from `generatePlatformProcedures()` output
- Delivery phase in harness (lines 699-712) does NOT use closingSections and must NOT be touched → Scoped to execution phase only
- No unit tests exist for prompt-assembler or agents-md-resolver → Build + lint + curl verification required

---

## Work Objectives

### Core Objective

Eliminate duplication between the execution prompt and AGENTS.md so each piece of information lives in exactly one place. The prompt contains only task instructions + a closing reminder. All reference material (env vars, completion procedures, security) lives in AGENTS.md.

### Concrete Deliverables

- `src/workers/lib/prompt-assembler.mts` — simplified to: contextLine + instructions + suffix + taskId
- `src/workers/opencode-harness.mts` — no longer passes envManifest or closingSections
- `src/gateway/routes/admin-brain-preview.ts` — no longer passes envManifest to prompt, removes closingSections from AGENTS.md, re-sources outputContract
- `dashboard/src/panels/employees/DebugTab.tsx` — individual layers UI removed

### Definition of Done

- [ ] `pnpm build` passes with zero TypeScript errors
- [ ] `pnpm lint` passes with zero lint errors
- [ ] Brain-preview API returns valid response with cleaned prompt
- [ ] Debug tab shows one fully resolved AGENTS.md (no layers)
- [ ] Profile tab "How to complete work" section still shows content

### Must Have

- Submit-output instruction appears only in prompt suffix + AGENTS.md Platform Runtime Context
- Environment variables appear only in AGENTS.md Platform Runtime Context
- Debug tab shows single fully resolved AGENTS.md view
- ProfilePreviewSection's "How to complete work" displays content (not blank)

### Must NOT Have (Guardrails)

- DO NOT touch the delivery phase in `opencode-harness.mts` (lines 646-787) — it does not use closingSections and is correct as-is
- DO NOT modify `resolveAgentsMd()` function signature or body in `agents-md-resolver.mts`
- DO NOT modify `generatePlatformProcedures()` in `platform-procedures.mts`
- DO NOT remove `agents_md.layers` from the API response — `ProfilePreviewSection` depends on it
- DO NOT touch `ProfilePreviewSection.tsx`
- DO NOT change `BrainPreviewResponse` type in `dashboard/src/lib/types.ts`
- DO NOT add new files — this is pure simplification

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None for this plan — no unit tests cover these modules (verified by Metis)
- **Framework**: Vitest (but no tests to run for these specific files)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API**: Use Bash (curl) — Send requests, assert status + response fields
- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (All parallel — independent file edits):
├── Task 1: Simplify prompt-assembler.mts [quick]
├── Task 2: Update opencode-harness.mts [quick]
├── Task 3: Update admin-brain-preview.ts [quick]
└── Task 4: Remove layers UI from DebugTab.tsx [quick]

Wave FINAL (After Wave 1 — build, verify, commit):
└── Task 5: Build + lint + verify + commit [quick]

Critical Path: Tasks 1-4 (parallel) → Task 5
Parallel Speedup: ~75% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 5      |
| 2    | —          | 5      |
| 3    | —          | 5      |
| 4    | —          | 5      |
| 5    | 1, 2, 3, 4 | —      |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave FINAL**: **1** — T5 → `quick`

---

## TODOs

- [x] 1. Simplify prompt-assembler.mts — Remove preamble and envManifest

  **What to do**:
  - Remove the `envManifest` property from the `AssembleTaskPromptOptions` interface
  - Remove the `submitOutputPreamble` variable and its construction (lines 24-26)
  - Remove `envManifest` from the destructuring of `options` (line 20)
  - Remove `submitOutputPreamble +` from the return statement (line 54)
  - The function should now return: `contextLine + instructions + submitOutputSuffix + taskId`
  - Keep the `contextLine` (date/time/epoch), `submitOutputSuffix` (REMINDER at end), and `taskId` exactly as they are

  **Must NOT do**:
  - DO NOT change the `submitOutputSuffix` text — it stays
  - DO NOT change the `contextLine` date/epoch generation
  - DO NOT change the `taskId` parameter or its default value

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, surgical removal of ~10 lines
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not a shell tool change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/lib/prompt-assembler.mts` — The entire file (60 lines). Remove lines 12-16 (envManifest from interface), lines 24-26 (preamble construction), and update line 54 (return statement).

  **WHY Each Reference Matters**:
  - This is the only file to edit. The function should go from ~40 lines of logic to ~20 lines.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: prompt-assembler produces clean output without preamble
    Tool: Bash (node)
    Preconditions: File has been edited
    Steps:
      1. Run: node -e "import('./src/workers/lib/prompt-assembler.mjs').then(m => { const result = m.assembleTaskPrompt({ instructions: 'Do the thing.', approvalRequired: false }); console.log('---START---'); console.log(result); console.log('---END---'); })"
      2. Assert output starts with "TODAY:" (the context line), NOT "MANDATORY FINAL STEP"
      3. Assert output contains "Do the thing." (the instructions)
      4. Assert output ends with "Task ID: <dynamic at runtime>"
      5. Assert output contains exactly one occurrence of "MANDATORY FINAL STEP" (the suffix)
      6. Assert output does NOT contain "AVAILABLE ENVIRONMENT VARIABLES"
    Expected Result: Clean prompt with contextLine + instructions + suffix + taskId only
    Failure Indicators: Output starts with "MANDATORY FINAL STEP" or contains "AVAILABLE ENVIRONMENT VARIABLES"
    Evidence: .sisyphus/evidence/task-1-prompt-output.txt
  ```

  **Commit**: YES (groups with 2, 3, 4)
  - Message: `fix(workers): remove duplicate submit-output and env vars from execution prompt`
  - Files: `src/workers/lib/prompt-assembler.mts`
  - Pre-commit: `pnpm build`

- [x] 2. Update opencode-harness.mts — Remove envManifest from prompt call and closingSections from AGENTS.md

  **What to do**:
  - In the `assembleTaskPrompt()` call (lines 927-932): Remove the `envManifest: platformEnvManifest` property. Keep `instructions`, `approvalRequired`, and `taskId`.
  - Remove the `closingSections` array definition (lines 900-903)
  - In the `resolveAgentsMd()` call (line 904-911): Remove the `closingSections` argument (the 7th argument). The call should have 6 arguments: platformContent, tenantConfig, archetype, employeeRules, employeeKnowledge, platformRuntimeSections.
  - DO NOT touch any other part of the harness

  **Must NOT do**:
  - DO NOT touch the delivery phase (lines 646-787) — it does not use closingSections
  - DO NOT touch the `platformRuntimeSections` array — the env manifest in AGENTS.md stays
  - DO NOT touch `platformEnvManifest` variable reading — it's still used for AGENTS.md platformRuntimeSections
  - DO NOT touch `runOpencodeSession`, `markFailed`, or any other function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 3 surgical edits
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:900-932` — The closingSections definition (lines 900-903), the resolveAgentsMd call (lines 904-911), and the assembleTaskPrompt call (lines 927-932)

  **WHY Each Reference Matters**:
  - Lines 900-903: `closingSections` array to delete entirely
  - Line 911: The `closingSections` argument to remove from `resolveAgentsMd()` call
  - Line 930: The `envManifest: platformEnvManifest` property to remove from `assembleTaskPrompt()` call
  - Lines 857-886: `platformRuntimeSections` — DO NOT touch this. The env manifest is STILL injected into AGENTS.md via this array (line 869). Only the prompt gets cleaned up.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: harness compiles without closingSections or envManifest in prompt call
    Tool: Bash
    Preconditions: File has been edited
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
      3. Grep the modified file to confirm closingSections is gone: grep -c "closingSections" src/workers/opencode-harness.mts
      4. Assert count is 0
      5. Grep to confirm envManifest is NOT in assembleTaskPrompt call — look for the specific pattern: grep "envManifest.*platformEnvManifest" src/workers/opencode-harness.mts
      6. Assert no matches
    Expected Result: Clean compile, no closingSections references, envManifest not passed to assembleTaskPrompt
    Failure Indicators: Build error or closingSections/envManifest references remain
    Evidence: .sisyphus/evidence/task-2-build-output.txt

  Scenario: platformRuntimeSections still includes env manifest for AGENTS.md
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Grep for PLATFORM_ENV_MANIFEST: grep -c "PLATFORM_ENV_MANIFEST" src/workers/opencode-harness.mts
      2. Assert count is >= 2 (still used in execution and delivery phases for AGENTS.md)
      3. Grep for platformRuntimeSections: grep -c "platformRuntimeSections" src/workers/opencode-harness.mts
      4. Assert count is >= 3 (still defined and used)
    Expected Result: Env manifest is still injected into AGENTS.md via platformRuntimeSections
    Failure Indicators: PLATFORM_ENV_MANIFEST references dropped below 2
    Evidence: .sisyphus/evidence/task-2-env-manifest-check.txt
  ```

  **Commit**: YES (groups with 1, 3, 4)
  - Files: `src/workers/opencode-harness.mts`

- [x] 3. Update admin-brain-preview.ts — Remove envManifest from prompt, remove closingSections from AGENTS.md, fix outputContract

  **What to do**:
  - In the `assembleTaskPrompt()` call (lines 302-306): Remove the `envManifest: envManifestStr` property. Keep `instructions` and `approvalRequired`.
  - Remove the `closingSections` array definition (lines 286-289)
  - In the `resolveAgentsMd()` call (lines 291-299): Remove the `closingSections` argument (the 7th argument). The call should have 6 arguments.
  - Update `agents_md.layers.finalReminders` (line 340) to always return `null` — since closingSections is no longer part of the resolved AGENTS.md
  - Update `autoInjectedSections.outputContract` (line 389): Change from `closingSections[0] ?? ''` to `generatePlatformProcedures({ approvalRequired })` — this is the actual output contract guidance that IS still injected via platformRuntimeSections

  **Must NOT do**:
  - DO NOT remove `envManifestStr` variable or `buildEnvManifestFromVars` call — it's still used for the AGENTS.md platformRuntimeSections (line 269-274) and for `autoInjectedSections.envManifest` (line 391)
  - DO NOT change `agents_md.layers` keys other than `finalReminders`
  - DO NOT touch `autoInjectedSections.securityPreamble` or `autoInjectedSections.envManifest`
  - DO NOT change any other field in the response JSON

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 5 surgical edits
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-brain-preview.ts:286-306` — closingSections definition, resolveAgentsMd call, assembleTaskPrompt call
  - `src/gateway/routes/admin-brain-preview.ts:327-392` — Response JSON structure, specifically `agents_md.layers.finalReminders` (line 340) and `autoInjectedSections.outputContract` (line 389)
  - `src/workers/lib/platform-procedures.mts` — The `generatePlatformProcedures()` function that returns the output contract text. Already imported at line 13. Call it with `{ approvalRequired }` to get the right classification.

  **API/Type References**:
  - `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx:126` — Uses `data.autoInjectedSections.outputContract` to render the "How to complete work" collapsible. Must remain non-empty after this change.

  **WHY Each Reference Matters**:
  - Lines 286-289: `closingSections` array to delete
  - Line 299: `closingSections` argument to remove from resolveAgentsMd call
  - Line 305: `envManifest: envManifestStr` to remove from assembleTaskPrompt call
  - Line 340: `finalReminders` to set to `null`
  - Line 389: `outputContract` to re-source from `generatePlatformProcedures({ approvalRequired })`
  - ProfilePreviewSection line 126: Proof that `outputContract` must remain populated

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Brain-preview API returns cleaned prompt without env vars
    Tool: Bash (curl)
    Preconditions: Gateway is running at localhost:7700, .env has ADMIN_API_KEY
    Steps:
      1. source .env
      2. curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.execution_prompt' > /tmp/prompt-check.txt
      3. grep -c "AVAILABLE ENVIRONMENT VARIABLES" /tmp/prompt-check.txt — assert 0
      4. grep -c "MANDATORY FINAL STEP" /tmp/prompt-check.txt — assert 1 (suffix only)
    Expected Result: Prompt has no env vars, exactly 1 MANDATORY FINAL STEP
    Failure Indicators: Count > 0 for env vars or count > 1 for MANDATORY FINAL STEP
    Evidence: .sisyphus/evidence/task-3-prompt-check.txt

  Scenario: autoInjectedSections.outputContract is non-empty
    Tool: Bash (curl)
    Preconditions: Gateway is running
    Steps:
      1. source .env
      2. curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.autoInjectedSections.outputContract | length'
      3. Assert result > 0
    Expected Result: outputContract field is non-empty (sourced from generatePlatformProcedures)
    Failure Indicators: outputContract is empty string or null
    Evidence: .sisyphus/evidence/task-3-output-contract.txt

  Scenario: agents_md.full does NOT contain "Final Reminders"
    Tool: Bash (curl)
    Preconditions: Gateway is running
    Steps:
      1. source .env
      2. curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.agents_md.full' | grep -c "# Final Reminders"
      3. Assert result is 0
      4. jq '.agents_md.layers.finalReminders' — assert null
    Expected Result: No Final Reminders section in the full AGENTS.md, layers.finalReminders is null
    Failure Indicators: "# Final Reminders" found in full AGENTS.md or layers.finalReminders is non-null
    Evidence: .sisyphus/evidence/task-3-agents-md-check.txt
  ```

  **Commit**: YES (groups with 1, 2, 4)
  - Files: `src/gateway/routes/admin-brain-preview.ts`

- [x] 4. Remove Individual Layers UI from DebugTab.tsx

  **What to do**:
  - Remove the `AGENTS_MD_LAYERS` constant (lines 14-25)
  - Remove the "Individual Layers" `CollapsibleSection` block and its contents (lines 142-154)
  - The `<div className="space-y-4">` wrapper around the full content view (line 139) can be simplified — it wrapped `ContentView` + `Individual Layers`, but now only wraps `ContentView`. Remove the wrapper div.
  - Verify no unused imports result from these removals (the `BrainPreviewResponse` type is still used for state, `CollapsibleSection` is still used for outer sections, `MarkdownPreview` is still used in `ContentView`)

  **Must NOT do**:
  - DO NOT change the `ViewToggle` or `ContentView` components
  - DO NOT change the "Execution Prompt" section
  - DO NOT change the outer "Resolved AGENTS.md" `CollapsibleSection` — only the nested "Individual Layers" is removed
  - DO NOT touch `ProfilePreviewSection.tsx`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, removal of ~15 lines
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/DebugTab.tsx:14-25` — `AGENTS_MD_LAYERS` constant to delete
  - `dashboard/src/panels/employees/DebugTab.tsx:139-155` — The `<div className="space-y-4">` wrapper containing `ContentView` + `Individual Layers` to simplify

  **WHY Each Reference Matters**:
  - Lines 14-25: The constant defines the 7 layer keys. Only used in the Individual Layers section. Safe to delete.
  - Lines 139-155: The wrapper div and Individual Layers CollapsibleSection. After removal, the "Resolved AGENTS.md" section should just render `<ContentView content={data.agents_md.full} mode={agentsMdMode} />` directly.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Debug tab shows full AGENTS.md without Individual Layers
    Tool: Playwright
    Preconditions: Dashboard running at localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/3b07ec63-207f-4f2b-a8c3-c17f08bc508f?tenant=00000000-0000-0000-0000-000000000003&tab=debug
      2. Wait for content to load (loading skeleton disappears)
      3. Assert "Resolved AGENTS.md" section exists
      4. Assert "Individual Layers" text does NOT exist on page
      5. Assert AGENTS.md content is visible (look for "Platform Policy" text in the rendered content)
      6. Take screenshot
    Expected Result: Single resolved AGENTS.md view, no layers dropdown
    Failure Indicators: "Individual Layers" text found on page
    Evidence: .sisyphus/evidence/task-4-debug-tab.png

  Scenario: Debug tab still shows Execution Prompt
    Tool: Playwright
    Preconditions: Dashboard running at localhost:7701
    Steps:
      1. Navigate to same URL as above
      2. Assert "Execution Prompt" section exists
      3. Assert prompt content is visible (look for "TODAY:" text)
      4. Assert prompt does NOT contain "AVAILABLE ENVIRONMENT VARIABLES"
    Expected Result: Execution Prompt section present with cleaned prompt content
    Failure Indicators: "AVAILABLE ENVIRONMENT VARIABLES" found in prompt section
    Evidence: .sisyphus/evidence/task-4-prompt-section.png
  ```

  **Commit**: YES (groups with 1, 2, 3)
  - Files: `dashboard/src/panels/employees/DebugTab.tsx`

- [x] 5. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ prompt-agents-md-cleanup complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after all tasks)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3, 4

---

## Final Verification Wave

> After all tasks complete, run `pnpm build && pnpm lint` and verify via curl + browser.

- [x] F1. **Build + Lint** — Run `pnpm build` and `pnpm lint`. Zero errors in both.
- [x] F2. **Brain-preview API check** — Verify the API returns a valid response with the cleaned-up prompt and AGENTS.md.
- [x] F3. **Debug tab visual check** — Load the Debug tab and confirm no Individual Layers section exists.
- [x] F4. **Profile tab regression check** — Load the Profile tab and confirm "How to complete work" section still shows content.

---

## Commit Strategy

- **Single commit** after all tasks pass: `fix(workers): remove duplicate submit-output and env vars from execution prompt`
  - Files: `src/workers/lib/prompt-assembler.mts`, `src/workers/opencode-harness.mts`, `src/gateway/routes/admin-brain-preview.ts`, `dashboard/src/panels/employees/DebugTab.tsx`
  - Pre-commit: `pnpm build && pnpm lint`

---

## Success Criteria

### Verification Commands

```bash
# Build
pnpm build  # Expected: zero errors

# Lint
pnpm lint  # Expected: zero errors

# Brain-preview API — prompt should NOT contain preamble or env vars
source .env
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.execution_prompt' | grep -c "AVAILABLE ENVIRONMENT VARIABLES"
# Expected: 0

# Prompt should have exactly 1 MANDATORY FINAL STEP (the suffix only)
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.execution_prompt' | grep -c "MANDATORY FINAL STEP"
# Expected: 1

# autoInjectedSections.outputContract should be non-empty
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.autoInjectedSections.outputContract | length > 0'
# Expected: true
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes
- [ ] Lint passes
