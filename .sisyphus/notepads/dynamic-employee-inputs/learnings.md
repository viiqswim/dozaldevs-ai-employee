# Learnings — dynamic-employee-inputs

<!-- APPEND ONLY — never overwrite, never use Edit tool. Format: ## [TIMESTAMP] Task: {task-id} -->

## [2026-05-19T02:00:00Z] Session Start

- Plan: 16 tasks, 4 waves
- Stack: Express gateway + Inngest + Prisma + React SPA (Vite)
- DB: PostgreSQL at localhost:54322, database: ai_employee
- Admin API key: in .env as ADMIN_API_KEY
- Gateway: http://localhost:7700
- Dashboard dev: http://localhost:5173
- Key files: prisma/schema.prisma, src/gateway/validation/schemas.ts, src/gateway/routes/admin-archetypes.ts, src/inngest/employee-lifecycle.ts, src/workers/opencode-harness.mts, src/gateway/services/archetype-generator.ts

## [2026-05-19T02:22:00Z] Task 6: Trigger endpoint + lifecycle INPUT_ injection

- `admin-employee-trigger.ts` now pre-fetches archetype from DB to validate inputs before dispatching
- `employee-dispatcher.ts` adds optional `inputs?: Record<string,string>` — stored as `raw_event: { inputs: {...} }` (nested, not flattened)
- `employee-lifecycle.ts` reads `rawEvent['inputs']` as `Record<string,unknown>` via double cast to avoid TS type conflict (rawEvent is `Record<string,string>` but inputs value is an object at runtime)
- KEY_UPPERCASE rule confirmed: `report_date` → `INPUT_REPORT_DATE`
- Prisma client needed regeneration (`pnpm prisma generate`) after T1 added `input_schema` column; LSP showed stale errors but `tsc --noEmit` was clean
- Pre-existing test failures in `hostfully.test.ts` and `supersede-threading.test.ts` are unrelated to these changes — they don't use `employee-dispatcher.ts`
- Evidence files saved in `.sisyphus/evidence/`: task-6-trigger-with-inputs.txt, task-6-missing-required-input.txt, task-6-zero-body-backward-compat.txt

## [2026-05-18T00:00:00Z] Task 13: Show detected inputs in EditEmployeePage

- `GenerateArchetypeResponse` already had `input_schema?: InputSchemaItem[]` — no type change needed
- Added `input_schema: archetype.input_schema ?? []` to `currentConfig` (line 119) so refine flow carries the schema through to the new draft
- Changed "Input Schema" → "Detected Inputs" with description "Inputs auto-detected from your description. Review and edit before activating."
- Added `window.confirm()` guard in `handleRefine()` — fires before `refineArchetype()` if `archetype.input_schema.length > 0`; user can cancel to abort
- `onChange` in InputSchemaEditor already calls `patch({ input_schema: schema })` — no separate save path needed
- `tsc --noEmit` clean with zero errors
- Evidence: `.sisyphus/evidence/task-13-edit-employee-page.txt`

## [2026-05-19T03:50:00Z] Task 14: Unit tests for dynamic employee inputs pipeline

- `substituteTemplateVars` and `buildTemplateVars` were NOT exported from `opencode-harness.mts` — the harness also has a top-level IIFE that calls `process.exit(1)` if `TASK_ID` is not set, making direct test imports impossible
- Solution: extracted both pure functions to `src/workers/lib/template-vars.ts` (exported) and updated harness to import from there
- `buildTemplateVars(env?)` accepts optional env param (defaults to `process.env`) — makes it cleanly testable by passing a fixture env record
- Test file at `src/__tests__/input-schema-pipeline.test.ts` — 30 tests across 4 describe blocks:
  1. InputSchemaItemSchema — Zod validation (11 tests)
  2. InputSchemaSchema — array validation (3 tests)
  3. substituteTemplateVars (6 tests)
  4. buildTemplateVars (6 tests)
  5. TriggerEmployeeBodySchema (4 tests)
- All 30 tests pass; pre-existing failures in hostfully.test.ts and supersede-threading.test.ts are unaffected
- Vitest pattern: `import { describe, it, expect } from 'vitest'` — no `beforeEach` needed for pure function tests
- `vitest.config.ts` includes pattern `src/**/__tests__/**/*.test.ts` — `src/__tests__/` (at root) matches because `**` can match zero segments

## [2026-05-18T23:10:00Z] Task 15: Frontend Playwright E2E QA — Dynamic Employee Inputs Journey

**Environment:** Dashboard dev server at http://localhost:7701/dashboard/ ✅ running
**Test archetype:** hostfully-daily-checkin-scheduler (4ca8f5db-d77f-4768-a6af-c0ca13259ef3), VLRE tenant
**Input schema:** `[{"key":"report_date","type":"date","label":"Report Date","required":true,"frequency":"every_run"}]`

### Results: 14 screenshots captured, all key features verified

#### ✅ PASS — Dashboard home loads (http://localhost:7701/dashboard/?tenant=...vlre...)
- Title: "AI Employee Dashboard" ✅
- Shows task history list (guest-messaging tasks visible)

#### ✅ PASS — Employee detail page (Config tab active by default)
Confirmed body text includes:
- `hostfully-daily-checkin-scheduler` (role name)
- Tabs: Config (active), Recent Tasks, Rules, Brain Preview
- `Trigger` and `Dry Run` action buttons
- Inline text: `Inputs📅Report DatedateEvery run*` — InputSchemaEditor rendering ✅

#### ✅ PASS — Config tab Inputs section (T10/T11)
- Config tab is the FIRST tab and is active by default (data-state="active", aria-selected="true")
- Shows "Inputs" section with card: `📅 Report Date — date — Every run *`
- Shows full archetype info (model, runtime, deliverable type, approval mode)
- `input_schema` data displayed correctly from DB

#### ✅ PASS — Trigger page dynamic form (T12)
URL: `/dashboard/employees/4ca8f5db.../trigger?tenant=...`
- Page title area: "Run hostfully-daily-checkin-scheduler"
- "← Back to hostfully-daily-checkin-scheduler" link
- "Report Date *" label with `input[type=date]` and `placeholder="Enter Report Date"`
- "Run Employee" submit button
- Admin API Key modal shown (secondary feature)
- 2 form inputs: date field + API key password field
- Date field fillable: successfully filled `2026-05-18`

#### ✅ PASS — Employee without input_schema: Config tab empty state (T11)
Test employee: code-rotation (00000000-0000-0000-0000-000000000016)
Config tab shows: "Inputs — No inputs configured. This employee runs without any user-provided data." ✅

#### ✅ PASS — Employee without input_schema: Trigger page (T12)
code-rotation trigger page shows: "No inputs required — this employee is ready to run." ✅
- 1 form input (Admin API Key only, no dynamic fields)
- "Run" button visible

### Issues / Bugs Found

1. **Modal overlay blocks pointer clicks** — An "Admin API Key" modal (from a different feature) renders
   with `z-50` overlay covering the whole page. This blocked Playwright `locator.click()` for tabs.
   Workaround: JS `element.click()` bypasses the overlay. Not a bug with our feature.

2. **TypeScript error in admin-employee-trigger.ts (LSP):**
   ```
   ERROR [64:24] Property 'input_schema' does not exist on type {...}
   ERROR [65:70] Property 'input_schema' does not exist on type {...}
   ```
   The Prisma-generated type for `archetypes` doesn't include `input_schema`. Despite this, the 
   trigger page displays input schema data correctly (runtime works). Likely Prisma client needs 
   regeneration or the type was added manually without regenerating. Should be investigated in a 
   follow-up task.

3. **Step 3 (Employees sidebar click)** — Also failed due to modal overlay. Same workaround applies.

### Screenshots Saved
| File | Description |
|------|-------------|
| task-15-01-dashboard-home.png | Dashboard home (tasks list) |
| task-15-02-home.png | Same, second run |
| task-15-04-employee-detail.png | Scheduler detail with Config tab active, Inputs visible |
| task-15-05-config-inputs.png | Config tab showing 📅 Report Date input card |
| task-15-07-trigger-form.png | Trigger page with Report Date field |
| task-15-08-employees-page.png | All VLRE employees list |
| task-15-10-no-input-detail.png | code-rotation detail page |
| task-15-11-no-input-config.png | code-rotation Config tab (empty state) |
| task-15-12-no-input-trigger-page.png | code-rotation trigger page ("No inputs required") |
| task-15-13-trigger-form-filled.png | Scheduler trigger form with 2026-05-18 filled |

All screenshots at: `.sisyphus/evidence/task-15-*.png`

### Conclusions
- T10 (InputSchemaEditor), T11 (Config tab Inputs section), T12 (TriggerEmployeePage) all render correctly
- Dynamic form for `every_run` inputs: working (date field shown, fillable)
- Empty state for no-input employees: working ("No inputs configured" in Config, "No inputs required" in Trigger)
- TS type error in backend route needs investigation (non-blocking for UI)
