# Learnings — employee-debug-tab

## [2026-05-25] Session Start

### Key Architecture Facts

- Two things injected into an AI employee at runtime: (1) the prompt, (2) the AGENTS.md file
- Harness assembles AGENTS.md in 7 layers: platform policy, platform runtime context, tenant conventions, employee instructions, behavioral rules (learned), employee knowledge, final reminders
- Harness assembles prompt as: preamble + date/epoch context line + resolvedInstructions + suffix + Task ID
- Brain-preview API currently has inline resolveAgentsMd (5 layers, missing #2 and #7) and wrong execution_prompt construction
- Import boundary: gateway .ts files can import from src/workers/lib/\*.mts using .mjs extension (proven by tool-reference-generator.mts importing tool-parser.js in reverse)
- PLATFORM_ENV_MANIFEST is a runtime env var — must be synthesized from env_vars array for API preview
- system_prompt belongs in platformRuntimeSections as "Legacy System Prompt", NOT prepended to task prompt

### Key Files

- `src/workers/opencode-harness.mts:855-952` — source of truth for harness behavior
- `src/workers/lib/agents-md-resolver.mts` — shared 7-layer resolver (DO NOT MODIFY, only import)
- `src/workers/lib/platform-procedures.mts` — generates "How to Complete Your Work"
- `src/gateway/routes/admin-brain-preview.ts` — the API to fix (404 lines)
- `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx` — existing consumer of brain-preview API
- `dashboard/src/lib/types.ts:248` — BrainPreviewResponse interface

### Test Employee

- ID: 3b07ec63-207f-4f2b-a8c3-c17f08bc508f (daily-real-estate-inspiration-2)
- Tenant: 00000000-0000-0000-0000-000000000003 (VLRE)

## [2026-05-25] prompt-assembler extraction

### What was done
- Created `src/workers/lib/prompt-assembler.mts` — pure function `assembleTaskPrompt()` that encapsulates the full task prompt assembly logic previously inline in `opencode-harness.mts` (lines 922–952).
- Updated `opencode-harness.mts`: added import from `./lib/prompt-assembler.mjs`, replaced inline block with `assembleTaskPrompt({ instructions: resolvedInstructions, approvalRequired, envManifest: platformEnvManifest, taskId: TASK_ID })`.
- Also updated `runOpencodeSession` (line 303): removed the `\n\nTask ID: ${TASK_ID}` suffix since it's now embedded by `assembleTaskPrompt`.

### Key gotcha
`runOpencodeSession` was appending `\n\nTask ID: ${TASK_ID}` to the prompt at line 303. Since `assembleTaskPrompt` now includes Task ID, that line was changed to `const fullPrompt = instructions` to avoid double-appending.

### Pattern confirmed
`platform-procedures.mts` is the exact pattern: interface + pure function + `.mts` extension + import via `.mjs` in harness. `prompt-assembler.mts` follows the same pattern.

### Verification
`npx tsx src/workers/lib/_verify-prompt-assembler.mts` → `true`. No TypeScript errors in `src/workers/`.

## [2026-05-25] admin-brain-preview.ts — shared module refactor

### What was done
- Removed inline `resolveAgentsMd` (5-arg, missing platformRuntime/finalReminders layers)
- Removed dead helpers: `extractSections`, `outputContractContent`, top-level `__dirname`/`platformAgentsMd`
- Removed `import { fileURLToPath } from 'url'`
- Added imports: `resolveAgentsMd`, `assembleTaskPrompt`, `generatePlatformProcedures`, `generateToolReference`, `buildEnvManifestFromVars`
- After `env_vars` assembly: builds `platformRuntimeSections` (security preamble, env manifest, legacy system_prompt, platform procedures, tool reference) and `closingSections`
- Calls `resolveAgentsMd` with all 7 args — exact match to harness
- Builds `executionPrompt` via `assembleTaskPrompt`
- `agents_md.layers` now 7 keys: platform, platformRuntime, tenant, employee, rules, knowledge, finalReminders
- Removed `autoInjectedSections` from response

### Verification
- layers keys: ["employee","finalReminders","knowledge","platform","platformRuntime","rules","tenant"] ✅
- prompt starts "MANDATORY FINAL STEP:", has TODAY/EPOCH_MS, has REMINDER suffix ✅
- No TypeScript errors ✅

### Note on substituteTemplateVars
Skipped — preview context, runtime vars not available in gateway. Not needed for correctness.
