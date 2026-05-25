# AGENTS.md Restructure — Lean Structure for Cheap LLMs

## TL;DR

> **Quick Summary**: Restructure the shared AGENTS.md assembly to put employee-specific content first (what cheap LLMs need most), compress the platform policy from 48 lines to 4 bullet points, remove the env var manifest injection entirely, and reorder sections so boilerplate is last.
>
> **Deliverables**:
>
> - Compressed `src/workers/config/agents.md` (~48 → ~10 lines)
> - Reordered section assembly in `agents-md-resolver.mts` (employee content first, policy last)
> - Removed env manifest injection from harness (execution + delivery phases)
> - Removed env manifest injection from brain-preview route (AGENTS.md assembly only)
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 + Task 2 (parallel) → Task 3 (verify)

---

## Context

### Original Request

User wants the AGENTS.md file (injected into every AI employee) to be leaner, better organized, and optimized for cheap LLMs. The current structure puts platform boilerplate first and employee-specific instructions in the middle — cheap models focus disproportionately on early content.

### Interview Summary

**Key Discussions**:

- Env var manifest: User said "Remove the env var list entirely" — it wastes tokens and tools already know what env vars they need
- Scope: User said "Just fix the shared structure for now" — no per-employee archetype edits
- Section order: Employee-specific content should come FIRST, platform boilerplate LAST

**Research Findings**:

- Brain-preview analysis showed motivation-bot gets ~2,162 bytes of platform policy it doesn't need to read carefully
- Tool listings appear in 3 places: platform policy §3, tool reference generator output, and tool-usage-reference skill
- The `prompt-agents-md-cleanup` plan (dependency) is fully complete — closingSections removed, envManifest removed from prompt, Final Reminders layer gone

### Metis Review

**Identified Gaps** (addressed):

- Delivery phase also injects env manifest — must remove from both phases
- `agents_md.layers` API response keys must NOT be renamed — only H1 heading text changes in rendered output
- `buildEnvManifestFromVars` import must stay in brain-preview (still used for `autoInjectedSections.envManifest` response field)
- §3 Tool Discovery in static file is redundant — tool-reference-generator already includes "load skill" text

---

## Work Objectives

### Core Objective

Make the AGENTS.md file that AI employees see optimized for cheap LLMs: employee-specific content first, platform boilerplate last, unnecessary content removed.

### Concrete Deliverables

- `src/workers/config/agents.md` — compressed to 4 bullet points (~300 bytes)
- `src/workers/lib/agents-md-resolver.mts` — reordered section assembly
- `src/workers/opencode-harness.mts` — env manifest removed from both execution and delivery phases
- `src/gateway/routes/admin-brain-preview.ts` — env manifest removed from platformRuntimeSections push (import and `autoInjectedSections` usage stays)

### Definition of Done

- [ ] Brain-preview for motivation-bot shows employee instructions BEFORE platform policy
- [ ] Brain-preview shows NO "Available Environment Variables" section in AGENTS.md layers
- [ ] Platform policy section is ≤10 lines in rendered output
- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm lint` passes

### Must Have

- Employee-specific content (tenant conventions, employee instructions) appears before platform boilerplate
- Env var manifest completely removed from AGENTS.md injection (both phases)
- Platform policy compressed to essential rules only
- Behavioral Rules heading includes override note: "These rules override conflicting guidance above."

### Must NOT Have (Guardrails)

- DO NOT rename `agents_md.layers` API response keys (`platform`, `platformRuntime`, `tenant`, `employee`, `rules`, `knowledge`) — ProfilePreviewSection depends on them
- DO NOT change `resolveAgentsMd()` function signature (parameter order stays the same)
- DO NOT modify `prompt-assembler.mts`, `platform-procedures.mts`, or `tool-reference-generator.mts`
- DO NOT touch per-employee archetype `agents_md` content
- DO NOT remove `buildEnvManifestFromVars` import from brain-preview (still used for `autoInjectedSections.envManifest` and `env_vars` response fields)
- DO NOT run unit tests (known timing issues)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO (known timeout issues per user constraint)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) - Hit brain-preview endpoint, assert response fields
- **Build**: Use Bash - `pnpm build`, assert exit code 0

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent changes):
├── Task 1: Compress platform policy static file [quick]
├── Task 2: Reorder sections in resolver + rename headings [quick]
├── Task 3: Remove env manifest from harness (execution + delivery) [quick]
└── Task 4: Remove env manifest from brain-preview route [quick]

Wave 2 (After Wave 1 — verification + commit):
└── Task 5: Build verification + brain-preview QA + commit [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Tasks 1-4 (parallel) → Task 5 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task  | Blocked By | Blocks |
| ----- | ---------- | ------ |
| 1     | None       | 5      |
| 2     | None       | 5      |
| 3     | None       | 5      |
| 4     | None       | 5      |
| 5     | 1, 2, 3, 4 | F1-F4  |
| F1-F4 | 5          | Done   |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **1** — T5 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Compress platform policy static file

  **What to do**:
  - Replace the entire contents of `src/workers/config/agents.md` with this compressed version:

    ```markdown
    # AI Employee — Platform Rules

    - NEVER modify files outside `/tools/` (including `/app/dist/` and `/app/node_modules/`)
    - NEVER access the database directly — no psql, no curl to PostgREST, no raw SQL, no connection strings
    - Use only the purpose-built tools in `/tools/` for all operations
    - If you encounter a platform bug, report it via `report-issue` and stop
    ```

  - This removes §1 (3 paragraphs → 1 bullet), §2 (4 paragraphs → 1 bullet), and §3 entirely (redundant with tool-reference-generator output)

  **Must NOT do**:
  - Do NOT change the file path or filename
  - Do NOT add any additional content beyond the 4 bullets above

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file replacement, trivial change
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not a shell tool

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/config/agents.md` (entire file) — Current 48-line policy to be replaced

  **Why Each Reference Matters**:
  - The current file shows what's being replaced. The new content is specified verbatim in "What to do" above.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Platform policy file is compressed
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: `wc -l src/workers/config/agents.md`
      2. Assert line count ≤ 10
      3. Run: `grep -c "NEVER" src/workers/config/agents.md`
      4. Assert count = 2 (two NEVER rules)
      5. Run: `grep -c "report-issue" src/workers/config/agents.md`
      6. Assert count = 1
    Expected Result: File is ≤10 lines with exactly 2 NEVER rules and 1 report-issue reference
    Failure Indicators: Line count > 10, missing NEVER rules, missing report-issue
    Evidence: .sisyphus/evidence/task-1-compressed-policy.txt

  Scenario: No §3 Tool Discovery section remains
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: `grep -c "tool-usage-reference" src/workers/config/agents.md`
      2. Assert count = 0
      3. Run: `grep -c "Tool Discovery" src/workers/config/agents.md`
      4. Assert count = 0
    Expected Result: No references to tool-usage-reference or Tool Discovery
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-1-no-tool-discovery.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3, 4)
  - Message: `refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest`
  - Files: `src/workers/config/agents.md`

- [x] 2. Reorder sections in resolver and rename headings

  **What to do**:
  - Edit `src/workers/lib/agents-md-resolver.mts` — change ONLY the function body (lines 20-42), NOT the signature or parameters
  - New section assembly order (replace the entire body between `const sections: string[] = [];` and `return sections.join('\n\n');`):
    ```typescript
    const sections: string[] = [];
    const tenantDefault = tenantConfig?.default_agents_md;
    if (typeof tenantDefault === 'string' && tenantDefault.trim().length > 0) {
      sections.push(`# Who You Are\n\n${tenantDefault}`);
    }
    const archetypeMd = archetype?.agents_md;
    if (archetypeMd != null && archetypeMd.trim().length > 0) {
      sections.push(`# Your Job\n\n${archetypeMd}`);
    }
    if (platformRuntimeSections && platformRuntimeSections.length > 0) {
      sections.push(`# Your Tools & Procedures\n\n${platformRuntimeSections.join('\n\n')}`);
    }
    if (employeeRules != null && employeeRules.trim().length > 0) {
      sections.push(
        `# Behavioral Rules (Learned)\n\nThese rules override conflicting guidance above.\n\n${employeeRules}`,
      );
    }
    if (employeeKnowledge != null && employeeKnowledge.trim().length > 0) {
      sections.push(`# Knowledge Base\n\n${employeeKnowledge}`);
    }
    sections.push(`# Platform Rules\n\n${platformContent}`);
    if (closingSections && closingSections.length > 0) {
      sections.push(closingSections.join('\n\n'));
    }
    return sections.join('\n\n');
    ```
  - Update the JSDoc comment at top of file to reflect new order:
    ```
    1. tenantConfig.default_agents_md → "# Who You Are"
    2. archetype.agents_md → "# Your Job"
    3. platformRuntimeSections → "# Your Tools & Procedures"
    4. employeeRules → "# Behavioral Rules (Learned)"
    5. employeeKnowledge → "# Knowledge Base"
    6. platformContent → "# Platform Rules" (always last)
    7. closingSections (if any — currently unused)
    ```

  **Must NOT do**:
  - Do NOT change the function signature or parameter order
  - Do NOT rename the function
  - Do NOT change how parameters are passed in callers (harness, brain-preview)
  - Do NOT rename `agents_md.layers` keys in the brain-preview response — those are separate from the heading text

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, body-only change in a 43-line file
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/agents-md-resolver.mts` (entire file, 43 lines) — The file being modified. Current body order: platform → platformRuntime → tenant → employee → rules → knowledge → closingSections. New order: tenant → employee → platformRuntime → rules → knowledge → platform → closingSections.

  **API/Type References**:
  - `src/gateway/routes/admin-brain-preview.ts:320-360` — The `agents_md.layers` response keys (`platform`, `platformRuntime`, `tenant`, `employee`, `rules`, `knowledge`) — these must NOT change. They are SEPARATE from heading text.
  - `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx` — Consumes `agents_md.layers.*` — confirms keys must be stable.

  **Why Each Reference Matters**:
  - The resolver file is what we're editing — need to see current structure
  - The brain-preview layers response shows API keys that must stay unchanged (they're independent of the H1 heading text in the rendered output)
  - ProfilePreviewSection confirms downstream consumers of the layers API keys

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Section order is correct in rendered output
    Tool: Bash (curl)
    Preconditions: pnpm dev running, gateway on localhost:7700
    Steps:
      1. Run: source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq -r '.agents_md.rendered' | grep "^# "
      2. Assert the H1 headings appear in this order:
         - "# Your Job" (employee instructions — tenant has no default_agents_md so "Who You Are" is skipped)
         - "# Your Tools & Procedures"
         - "# Platform Rules"
      3. Specifically assert "# Platform Rules" appears AFTER "# Your Job"
    Expected Result: Employee content before platform boilerplate
    Failure Indicators: "# Platform Rules" or "# Platform Policy" appears before "# Your Job"
    Evidence: .sisyphus/evidence/task-2-section-order.txt

  Scenario: Behavioral rules heading includes override note
    Tool: Bash (curl)
    Preconditions: An archetype with learned rules exists (or test with guest-messaging which has rules)
    Steps:
      1. Run: source .env && curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/00000000-0000-0000-0000-000000000015/brain-preview" -H "X-Admin-Key: $ADMIN_API_KEY" | jq -r '.agents_md.rendered' | grep -A1 "Behavioral Rules"
      2. Assert output contains "These rules override conflicting guidance above."
    Expected Result: Override note present under Behavioral Rules heading
    Failure Indicators: Missing override text, or heading text changed
    Evidence: .sisyphus/evidence/task-2-override-note.txt

  Scenario: Function signature unchanged
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep -A7 "^export function resolveAgentsMd" src/workers/lib/agents-md-resolver.mts
      2. Assert parameters are still: platformContent, tenantConfig, archetype, employeeRules, employeeKnowledge, platformRuntimeSections, closingSections
    Expected Result: Signature exactly matches original
    Failure Indicators: Any parameter renamed, reordered, or removed
    Evidence: .sisyphus/evidence/task-2-signature-stable.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3, 4)
  - Message: `refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest`
  - Files: `src/workers/lib/agents-md-resolver.mts`

- [x] 3. Remove env manifest from harness (execution + delivery phases)

  **What to do**:
  - In `src/workers/opencode-harness.mts`, remove the env manifest block from the **execution phase** (lines 865-871):
    ```typescript
    // DELETE THIS BLOCK:
    const platformEnvManifest = process.env.PLATFORM_ENV_MANIFEST;
    if (platformEnvManifest && platformEnvManifest.trim().length > 0) {
      platformRuntimeSections.push(
        `## Available Environment Variables\n\nThe following environment variables are available to you:\n\n${platformEnvManifest}`,
      );
    }
    ```
  - Also remove the env manifest block from the **delivery phase** (lines 699-704):
    ```typescript
    // DELETE THIS BLOCK:
    const platformEnvManifest = process.env.PLATFORM_ENV_MANIFEST;
    if (platformEnvManifest && platformEnvManifest.trim().length > 0) {
      deliveryRuntimeSections.push(
        `## Available Environment Variables\n\nThe following environment variables are available to you:\n\n${platformEnvManifest}`,
      );
    }
    ```
  - After removing both blocks, check if `PLATFORM_ENV_MANIFEST` is referenced anywhere else in the file. If not, no further cleanup needed (it's an env var, not an import).

  **Must NOT do**:
  - Do NOT remove the Security Boundary push (line 861-863, 696-698) — that stays
  - Do NOT modify `platform-procedures.mts` or `tool-reference-generator.mts`
  - Do NOT change how `resolveAgentsMd()` is called (same args, same order)
  - Do NOT touch `prompt-assembler.mts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small deletions in one file, well-defined blocks
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:858-885` — Execution phase platformRuntimeSections assembly. Delete lines 865-871 (env manifest block). Keep lines 858-863 (security), 873-885 (legacy prompt, procedures, tool reference).
  - `src/workers/opencode-harness.mts:695-711` — Delivery phase deliveryRuntimeSections assembly. Delete lines 699-704 (env manifest block). Keep lines 695-698 (security).

  **Why Each Reference Matters**:
  - Exact line ranges show what to delete vs what to keep — critical for not accidentally removing security preamble or platform procedures

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No env manifest reference in platformRuntimeSections assembly
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep -n "PLATFORM_ENV_MANIFEST\|envManifest\|Available Environment Variables" src/workers/opencode-harness.mts
      2. Assert zero matches
    Expected Result: No references to env manifest in harness file
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-3-no-env-manifest-harness.txt

  Scenario: Security boundary still present in both phases
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep -c "Security Boundary" src/workers/opencode-harness.mts
      2. Assert count = 2 (one for execution phase, one for delivery phase)
    Expected Result: Both security boundary sections preserved
    Failure Indicators: Count < 2
    Evidence: .sisyphus/evidence/task-3-security-preserved.txt

  Scenario: Platform procedures and tool reference still present
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep -c "generatePlatformProcedures" src/workers/opencode-harness.mts
      2. Assert count ≥ 1
      3. Run: grep -c "generateToolReference" src/workers/opencode-harness.mts
      4. Assert count ≥ 1
    Expected Result: Both generators still called in execution phase
    Failure Indicators: Either count = 0
    Evidence: .sisyphus/evidence/task-3-generators-preserved.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)
  - Message: `refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest`
  - Files: `src/workers/opencode-harness.mts`

- [x] 4. Remove env manifest from brain-preview route

  **What to do**:
  - In `src/gateway/routes/admin-brain-preview.ts`, remove the env manifest push into `platformRuntimeSections` (lines 269-274):
    ```typescript
    // DELETE THIS BLOCK:
    const envManifestStr = buildEnvManifestFromVars(env_vars);
    if (envManifestStr.trim().length > 0) {
      platformRuntimeSections.push(
        `## Available Environment Variables\n\nThe following environment variables are available to you:\n\n${envManifestStr}`,
      );
    }
    ```
  - KEEP the `buildEnvManifestFromVars` import (line 15) — it's still used later at line 383 for `autoInjectedSections.envManifest` response field
  - After deletion, the `envManifestStr` variable will be unused in its current location. Move the `const envManifestStr = buildEnvManifestFromVars(env_vars);` line to just before line 383 where it's used for `autoInjectedSections.envManifest`. Or, if `envManifestStr` is already used elsewhere for the response object, just remove the `platformRuntimeSections.push(...)` call and its surrounding `if` block while keeping the `const envManifestStr` declaration.

  **Must NOT do**:
  - Do NOT remove the `buildEnvManifestFromVars` import
  - Do NOT remove the `autoInjectedSections.envManifest` field from the response
  - Do NOT remove the `env_vars` field from the response
  - Do NOT change how `resolveAgentsMd()` is called
  - Do NOT touch any other route file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small deletion in one file, well-defined block
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-brain-preview.ts:263-284` — platformRuntimeSections assembly. Delete lines 269-274 (env manifest push). Keep lines 265-267 (security boundary), 276-284 (legacy prompt, procedures, tool reference).
  - `src/gateway/routes/admin-brain-preview.ts:383` — `envManifest: envManifestStr` in `autoInjectedSections` — this line MUST stay, meaning the `envManifestStr` variable declaration must also stay (just not be pushed to platformRuntimeSections).

  **Why Each Reference Matters**:
  - Shows the exact block to delete and the downstream usage that must be preserved
  - The `autoInjectedSections.envManifest` field is informational in the API response — it tells the debug tab what WAS available, even though it's no longer injected into AGENTS.md

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No env manifest in platformRuntimeSections
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep -n "platformRuntimeSections.push" src/gateway/routes/admin-brain-preview.ts
      2. Assert NO line contains "Available Environment Variables"
      3. Run: grep -c "platformRuntimeSections.push" src/gateway/routes/admin-brain-preview.ts
      4. Assert count = 3 (security boundary, legacy prompt condition, procedures, tool ref — only the non-env ones remain)
    Expected Result: Only security, legacy prompt, procedures, and tool ref are pushed
    Failure Indicators: "Environment Variables" found in any push, or wrong count
    Evidence: .sisyphus/evidence/task-4-no-env-in-runtime.txt

  Scenario: autoInjectedSections.envManifest still in response
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep -n "envManifest" src/gateway/routes/admin-brain-preview.ts
      2. Assert at least one match contains "autoInjectedSections" or the response object assignment
      3. Run: grep "buildEnvManifestFromVars" src/gateway/routes/admin-brain-preview.ts
      4. Assert import line still present
    Expected Result: Import and autoInjectedSections usage preserved
    Failure Indicators: Import removed or envManifest field missing from response
    Evidence: .sisyphus/evidence/task-4-import-preserved.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 3)
  - Message: `refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest`
  - Files: `src/gateway/routes/admin-brain-preview.ts`

- [x] 5. Build verification + brain-preview QA + commit

  **What to do**:
  - Run `pnpm build` — must exit 0 with no TypeScript errors
  - Run `pnpm lint` — must exit 0
  - If dev server is running, hit brain-preview endpoint for motivation-bot and verify:
    1. Section order: "# Your Job" appears before "# Platform Rules"
    2. No "Available Environment Variables" section in rendered AGENTS.md
    3. Platform policy section is ≤10 lines
  - If dev server is NOT running, verify only build + lint (brain-preview will be checked in Final Verification Wave)
  - Stage all 4 changed files and commit with message: `refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest`

  **Must NOT do**:
  - Do NOT run `pnpm test` (known timeout issues)
  - Do NOT use `--no-verify` on git commit
  - Do NOT add `Co-authored-by` lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Build + commit verification, no implementation
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - All 4 files from Tasks 1-4 — staged together for one atomic commit

  **Why Each Reference Matters**:
  - All changes are a single logical unit — one commit

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build passes
    Tool: Bash
    Preconditions: Tasks 1-4 complete
    Steps:
      1. Run: pnpm build
      2. Assert exit code = 0
    Expected Result: Clean TypeScript compilation
    Failure Indicators: Non-zero exit code, type errors
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: Lint passes
    Tool: Bash
    Preconditions: Tasks 1-4 complete
    Steps:
      1. Run: pnpm lint
      2. Assert exit code = 0
    Expected Result: No lint errors
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-5-lint.txt

  Scenario: Git commit succeeds
    Tool: Bash
    Preconditions: Build and lint pass
    Steps:
      1. Run: git add src/workers/config/agents.md src/workers/lib/agents-md-resolver.mts src/workers/opencode-harness.mts src/gateway/routes/admin-brain-preview.ts
      2. Run: git commit -m "refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest"
      3. Assert exit code = 0
    Expected Result: Clean commit with all 4 files
    Failure Indicators: Pre-commit hook failure, unstaged changes
    Evidence: .sisyphus/evidence/task-5-commit.txt
  ```

  **Commit**: YES (this IS the commit task)
  - Message: `refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest`
  - Files: `src/workers/config/agents.md`, `src/workers/lib/agents-md-resolver.mts`, `src/workers/opencode-harness.mts`, `src/gateway/routes/admin-brain-preview.ts`
  - Pre-commit: `pnpm build && pnpm lint`

- [x] 6. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ agents-md-restructure complete — AGENTS.md compressed and reordered. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: F1-F4 + user okay

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed files for: unused imports, `as any`, empty catches, commented-out code. Check no AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start `pnpm dev` if not running. Hit brain-preview for motivation-bot AND guest-messaging. Verify: (1) section order is correct, (2) no env manifest in AGENTS.md layers, (3) platform policy is compressed, (4) behavioral rules heading has override note.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify: everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance — specifically that `agents_md.layers` keys are unchanged and `buildEnvManifestFromVars` import remains in brain-preview.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                             | Files                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `refactor(workers): restructure AGENTS.md — compress policy, reorder sections, remove env manifest` | `src/workers/config/agents.md`, `src/workers/lib/agents-md-resolver.mts`, `src/workers/opencode-harness.mts`, `src/gateway/routes/admin-brain-preview.ts` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build    # Expected: exit 0, no errors
pnpm lint     # Expected: exit 0, no warnings

# Brain-preview for motivation-bot — verify section order
source .env
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.agents_md.rendered' | head -20
# Expected: First H1 heading should be "# Who You Are" or "# Your Job" (not "# Platform Policy")

# Verify no env manifest in rendered AGENTS.md
curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/561439b9-7491-40de-a550-95906624fffc/brain-preview" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.agents_md.rendered' | grep -c "Available Environment Variables"
# Expected: 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes
- [ ] Lint passes
- [ ] Brain-preview shows correct section order
- [ ] No env manifest in AGENTS.md output
