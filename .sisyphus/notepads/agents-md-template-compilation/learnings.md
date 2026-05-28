# Learnings — agents-md-template-compilation

## [2026-05-28] Session Start

### Key Architecture Decisions

- New fields on archetypes: `identity` (Text), `execution_steps` (Text), `delivery_steps` (Text), `temperature` (Float default 1.0)
- `instructions` renamed → `execution_instructions` (platform constant prompt, NOT user-editable)
- `compiled_agents_md` added to tasks table (debugging snapshot)
- Old fields `system_prompt` and `agents_md` kept until Wave 3, then dropped

### Proven AGENTS.md Format (41 lines, 100% pass rate)

File: `src/workers/experimental/daily-real-estate-inspiration-2-copy/2026-05-27-2128-compiled-agents-md.md`
Structure:

1. Identity block (plain text)
2. CRITICAL bash-tool directive (always at top, compiler adds it)
3. `<execution-instructions>` with IMPORTANT/STOP directives wrapping numbered steps
4. `<delivery-instructions>` with IMPORTANT/STOP directives wrapping numbered steps
5. Learned rules (if non-empty)
6. Knowledge base (if non-empty)
7. Platform rules (from src/workers/config/agents.md)

### Platform Constant Prompts (stored in DB, not user-editable)

- Execution: `"Follow the instructions in <execution-instructions> within the AGENTS.md file"`
- Delivery: `"Follow the instructions in <delivery-instructions> within the AGENTS.md file\n\n--- APPROVED CONTENT ---\n{deliverableContent}\n--- END APPROVED CONTENT ---\n\nTask ID: {TASK_ID}"`

### Experimental Employee Details

- Archetype ID: `ad5f02f0-f38d-4e00-abd0-4973cd93a7eb`
- Tenant: VLRE (`00000000-0000-0000-0000-000000000003`)
- Temperature: 1.5 (all others default to 1.0)
- Notification channel: `C0960S2Q8RL` (#victor-tests)

### Harness Surgery Sites

- Line ~264: hardcoded `temperature: 1.5` → replace with `archetype.temperature ?? 1.0`
- Lines ~649-730: delivery AGENTS.md resolution → replace with `compileAgentsMd()`
- Lines ~870-936: execution AGENTS.md resolution → replace with `compileAgentsMd()`
- Lines ~489-523: recovery nudge message → update text to reference `<execution-instructions>`
- Lines ~905-911: experimental bypass block → delete entirely

### Files to DELETE (Wave 3)

- `src/workers/lib/platform-procedures.mts` (62 lines)
- `src/workers/lib/tool-reference-generator.mts` (86 lines)
- `src/workers/lib/agents-md-resolver.mts` (45 lines) — or gut entirely

### 6 Archetypes to Migrate

1. guest-messaging
2. daily-summarizer
3. daily-real-estate-inspiration-2
4. daily-real-estate-inspiration-2-copy (temperature=1.5)
5. code-rotation
6. schedule-generator-thornton

## [T11] Dashboard compiled_agents_md integration

### Files Changed
- `dashboard/src/lib/types.ts`: Added `compiled_agents_md: string | null` to `Task` and `BrainPreviewResponse` interfaces
- `dashboard/src/panels/employees/sections/ProfilePreviewSection.tsx`: Added "Compiled AGENTS.md" CollapsibleSection with char-count badge and scrollable pre block
- `dashboard/src/panels/tasks/TaskDetail.tsx`: Added `CompiledAgentsMdViewer` component, rendered only when `task.compiled_agents_md` is non-null
- `dashboard/src/panels/employees/DebugTab.tsx`: Added `archetype: Archetype` to `DebugTabProps` (was missing, caused TS2322)
- `dashboard/src/pages/ModelCatalogPage.tsx`: Added `structured_output_error_rate` to ModelForm, EMPTY_FORM, entryToForm, formToPayload (was missing, caused TS2741)

### Task select query
TaskDetail uses `select: '*,archetypes(role_name,model)'` — the `*` wildcard fetches all columns including `compiled_agents_md`. No changes needed to gateway.ts.

### Pre-existing build errors fixed
- DebugTab TS2322: `archetype` prop passed from EmployeeDetail but not declared in DebugTabProps
- ModelCatalogPage TS2741: `structured_output_error_rate` missing from form payload construction

## [T9] Migration + E2E Verification

### Migration Outcome (2026-05-28)
- All 6 archetypes successfully migrated with `identity`, `execution_steps`, `delivery_steps`, `temperature`
- Backup saved: `database-backups/2026-05-27-2325/`
- daily-real-estate-inspiration-2-copy: temperature=1.5, delivery_steps=null (acceptable, no delivery phase)

### Infrastructure Issues Found and Fixed

#### 1. Stale Docker Image (old harness checked `archetype.instructions`)
- Old built harness used `archetype.instructions` (undefined) → hard abort
- Fix: Rebuilt image with `--no-cache`
- Root cause: cached Docker layers from before harness changes

#### 2. agents.md Not Copied to dist/ in Docker Image
- `agents-md-compiler.mts` reads `join(__dirname, '../config/agents.md')`
- In Docker: `__dirname` = `/app/dist/workers/lib/`, so it looks for `/app/dist/workers/config/agents.md`
- Dockerfile only copied to `/app/AGENTS.md` (not to `dist/workers/config/`)
- Fix: Added two lines to Dockerfile:
  ```dockerfile
  RUN mkdir -p /app/dist/workers/config
  COPY src/workers/config/agents.md /app/dist/workers/config/agents.md
  ```
- Required rebuild to apply

#### 3. Stale Prisma Client (system_prompt dropped from DB, not from client)
- Migration `20260527233704_drop_deprecated_archetype_fields` dropped `system_prompt` and `agents_md`
- But `prisma generate` had not been run → client still queried `system_prompt`
- All trigger calls returned 500 INTERNAL_ERROR
- Fix: `npx prisma generate`, then `touch src/gateway/server.ts` to restart tsx watch

#### 4. PostgREST Schema Cache Not Reloaded
- `compiled_agents_md` added by migration but PostgREST cache stale
- PATCH returned HTTP 400 → harness logged "saved" (false positive, `db.patch` returns null on error)
- Fix: `NOTIFY pgrst, 'reload schema';`
- **LESSON**: Must run schema reload after EVERY migration that adds columns to existing tables

### E2E Result (Task 6351f40f)
- status = Done ✅
- compiled_agents_md length = 2292 ✅
- Lifecycle: Received → Executing → Validating → Submitting → Delivering → Done

### Post-Deploy Checklist (for next deployments)
1. `npx prisma generate` — always after schema changes
2. `NOTIFY pgrst, 'reload schema';` — always after adding columns
3. `touch src/gateway/server.ts` — restart gateway after Prisma regeneration
4. Docker rebuild needed after harness/worker changes
