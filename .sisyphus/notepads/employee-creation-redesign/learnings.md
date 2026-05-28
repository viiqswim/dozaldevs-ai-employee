# Learnings — employee-creation-redesign

## [2026-05-28] Plan Start

### Key patterns

- PatchArchetypeBodySchema (lines 22-78 of admin-archetypes.ts) already has identity/execution_steps/delivery_steps/temperature — use as exact template for CreateArchetypeBodySchema
- compileAgentsMd() already imported in admin-brain-preview.ts — no new imports needed for T2
- MarkdownPreview component at dashboard/src/components/MarkdownPreview.tsx — used in DebugTab, use same component for wizard preview step
- Spinner pattern in current CreateEmployeePage.tsx lines 221-228 — preserve this exact pattern
- SearchableSelect is MANDATORY for channel picker per AGENTS.md convention
- `approval_required: false` on daily-real-estate-inspiration-2-copy — stress test runs fully autonomously

### Archetype field references

- identity: z.string().max(10000).optional().default('')
- execution_steps: z.string().max(10000).optional().default('')
- delivery_steps: z.string().max(10000).nullable().optional().default(null)
- temperature: z.number().min(0).max(2).optional().default(1.0)

### Stress test employee

- Slug: daily-real-estate-inspiration-2-copy
- Archetype ID: ad5f02f0-f38d-4e00-abd0-4973cd93a7eb
- Tenant: 00000000-0000-0000-0000-000000000003 (VLRE)
- Model: deepseek/deepseek-v4-flash
- approval_required: false
- Command: pnpm stress-test --count 20 --concurrency 1 --employee daily-real-estate-inspiration-2-copy

## Task 4: CreateEmployeePage wizard rewrite (Steps 1-3)

- Replaced `PageState` union type with flat `WizardStep` string literal type
- Removed `recommendModel`, `ModelRecommendation`, `ModelQuestionAnswers`, `ModelQuestionsStep`, `ModelRecommendationStep` — these files stay on disk, just no longer imported
- `config` state is set via `setConfig` after generation but read values go into `editedFields` — config is retained as state for future steps (T5/T6)
- `createArchetype` and `compilePreview` imported as required but not yet called — `noUnusedLocals` is NOT in tsconfig so no build error
- The `void` suppression trick is NOT needed — tsconfig has `strict: true` but NOT `noUnusedLocals`
- `trigger_type` populated from `result.trigger_sources?.type` — uses optional chaining since `trigger_sources` field shape varies
- Preview AGENTS.md button has `console.log` placeholder — T5 will wire this to actual preview flow
- Both `pnpm build` (EXIT_CODE:0) and `pnpm dashboard:build` (EXIT_CODE:0) pass clean

## Task 5: Preview + Save Draft steps wired

- Added `MarkdownPreview` import from `@/components/MarkdownPreview`
- Added `compiledPreview` state (`useState<string | null>(null)`)
- `handlePreview`: sets step to 'previewing', calls `compilePreview()`, sets `compiledPreview`, transitions to 'preview'; on error transitions to 'error'
- `handleSaveDraft`: guards on `!config`, sets step to 'saving', calls `createArchetype()` with spread of `config` + editedFields overrides, navigates to `/dashboard/employees/${archetype.id}`; on error transitions to 'error'
- `trigger_sources` built from `editedFields.trigger_type` — scheduled uses `cron: '0 8 * * 1-5'`, webhook and manual use their respective `{ type }` shapes
- Preview step JSX uses `rounded-lg border bg-card` per AGENTS.md card convention, `max-h-[600px]` with `overflow-auto` for long AGENTS.md content
- `pnpm build` EXIT_CODE:0

## Task 1: CreateArchetypeBodySchema fields added

- Added `identity`, `execution_steps`, `delivery_steps`, `temperature` to `CreateArchetypeBodySchema` in `src/gateway/routes/admin-archetypes.ts`
- POST handler uses `...rest` spread — new fields automatically flow to Prisma create call without handler changes
- `execution_steps` and `delivery_steps` in PatchSchema are `nullable().optional()` (no default), but for CreateSchema we used `.default('')` and `.default(null)` respectively to match task spec
- Build passes: `pnpm build` EXIT_CODE:0

## Task 6: E2E Integration Verification + Bug Fix

### Bug Found: instructions field not mapped to execution_instructions in Prisma create/patch

- **Root cause**: The Zod schema (`CreateArchetypeBodySchema`) has `instructions` field, but the Prisma model field is `execution_instructions`. The route handler used `...rest` spread which included `instructions`, causing Prisma to reject it as an unknown field at runtime (500 INTERNAL_ERROR).
- **Fix**: Extract `instructions` in the destructure of `bodyResult.data`, then explicitly pass `execution_instructions: instructions` to the Prisma create call. Same fix for PATCH handler.
- **Affected files**: `src/gateway/routes/admin-archetypes.ts`
- **Build**: `pnpm build` EXIT_CODE:0 after fix

### E2E Verification Results

- compile-preview endpoint: ✓ length=1124, has_identity, has_exec, has_platform
- Browser wizard: ✓ all 5 steps completed (Describe → Generate → Edit → Preview → Save)
- DB verification: ✓ identity starts with "E2E TEST - ", execution_steps non-empty, execution_instructions = execution_steps
- Screenshots saved to `.sisyphus/evidence/task-6-*.png` (gitignored)

### Key gotcha: Prisma XOR type LSP false positive

After adding `execution_instructions: instructions` to the Prisma create call, LSP complained about unknown property. However `tsc` (with `tsconfig.build.json`) passes clean. This is a known Prisma XOR type inference quirk — the field IS valid and runtime confirms it.
