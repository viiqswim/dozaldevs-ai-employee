# Backwards-Compatibility & Legacy Cruft Cleanup

## TL;DR

> **Quick Summary**: Remove every backwards-compatibility shim, legacy code path, and dead orchestrator scaffolding from the ai-employee codebase (an alpha platform that explicitly does not need backwards compatibility), choosing the cleanest end state for each. Includes Prisma migrations dropping unused tables and columns.
>
> **Deliverables**:
>
> - `delivery_instructions` dead code removed everywhere (column already dropped in DB)
> - Legacy LLM parse paths in `classify-message.ts` collapsed to StandardOutput-only
> - `generic-harness` runtime references removed (file no longer exists)
> - Small shims removed: `LegacyJiraClientConfig`, `tool-parser` `_basePath`/`getToolByPath`, `output-schema` `version` made required, unused `APPROVED` enum value, `sendFixPrompt()`, dead comments
> - Legacy tenant config shape (`config.summary.publish_channel`) removed
> - Deprecated orchestrator teardown: old global `/webhooks/jira` route, `admin-projects`/`project-registry`/`project-lookup`, `agent-version`, `cancelTaskByExternalId`
> - Prisma schema/migration: drop `AgentVersion`, `RiskModel`, `Project`, `Department` tables + dead `Execution`/`Task` columns
> - Stale config/docs cleaned: `render.yaml`, `CONTRIBUTING.md`, `X-Admin-Key` test/doc remnants
> - All affected test fixtures updated; live per-employee E2E proving zero regressions
>
> **Estimated Effort**: Large
> **Parallel Execution**: NO — strictly sequential waves (schema-drop-before-deref ordering is mandatory)
> **Critical Path**: Wave 1 leaf cleanup → Wave 2 classify-message → Wave 3 orchestrator TS teardown → Wave 4 type-layer deref → BUILD GATE → Wave 5 Prisma migration → Wave 6 PostgREST reload → Wave 7 live E2E → Wave 8 docs+notify

---

## Context

### Original Request

Find all places in the codebase where decisions were made for "backwards compatibility" (or similar) and clean them up by making whatever decision yields the cleanest, most scalable, most reliable codebase moving forward. This follows a new directive added to AGENTS.md: the platform is in active alpha and does NOT need backwards compatibility.

### Interview Summary

**Key Decisions**:

- **Scope**: FULL — Tiers A–F including DB migrations that drop unused tables/columns.
- **Jira/engineer path**: Remove ONLY dead orchestrator scaffolding. KEEP the active per-employee Jira route (`/webhooks/jira/:tenantSlug/:employeeSlug`), the `jira-motivation-bot` archetype, `jira-client.ts`, and `jira-types.ts`.
- **classify-message.ts**: Remove ALL legacy parse paths now (collapse to StandardOutput-only). Keep the defensive parse-failure fallback (malformed → `NEEDS_APPROVAL` low-confidence, NOT a throw).
- **ensureAgentVersion()**: Add an `lsp_find_references` confirmation gate before deleting (it is an exported active function whose only known importer is its own test).
- **cancelTaskByExternalId**: Remove it (caller-less after global Jira route deletion).
- **Tests/E2E**: Update test fixtures in the same plan + mandatory live per-employee E2E wave.

**Research Findings** (3 explore agents + Metis):

- `delivery_instructions` column was already dropped by migration `20260616030000_consolidate_delivery_fields`; all remaining references are dead code.
- All 8 active employees emit StandardOutput via `submit-output.ts` (always writes `{version:1, summary, classification, ...}`), so the legacy plain-text and guest-era JSON paths in `classify-message.ts` are dead.
- `RiskModel` (the `risk_models` TABLE) is distinct from the load-bearing `archetype.risk_model` JSON COLUMN — drop the table, NEVER the column.
- `fix_iterations` is read via raw SQL in `scripts/trigger-task.ts:272`; `agent_version_id` in `scripts/verify-e2e.ts` — these scripts must be fixed BEFORE the columns are dropped or the primary E2E tooling breaks.
- `project_id` is written by the SHARED `jira-task-creation.ts` used by BOTH the kept per-employee route and the deleted global route — must strip the `projectId` param/write before dropping the column.
- `Department.department_id` is set on 14+ archetype upserts + 2 `department.upsert` calls in `seed.ts` — must remove from seed BEFORE dropping the table (FK violation otherwise).
- `src/workers/lib/postgrest-types.ts` (`TaskRow`) references the dropped Task columns — must be dereferenced or worker reads break.

### Metis Review

**Gaps addressed**:

- Assumption "AgentVersion is pure dead scaffolding" → corrected: it's an exported active function; added an `lsp_find_references` gate.
- Assumption "drop columns freely" → corrected: strict TS-deref-before-DDL ordering, plus `pnpm trigger-task`/`verify-e2e` raw-SQL fixes must precede the drop.
- Assumption "two Jira route files" → corrected: `jira.ts` is ONE file; keep lines 1–133, delete 135–321.
- Soft-delete rule clarification: governs ROW deletion, not DDL. Dropping unused columns/tables via migration is explicitly allowed here (stated so an implementer doesn't refuse the DROP).
- World-A/World-B: run `pnpm generate-worker-constants` and commit the regenerated file if `output-contract-constants.ts` changes (CI diff-gate).
- PostgREST schema-cache reload (`NOTIFY pgrst, 'reload schema'`) required after migration.
- Mandatory `pg_dump` backup before any migration (production-ops skill); use `DATABASE_URL_DIRECT` (port 5432, never 6543) for DDL.

---

## Work Objectives

### Core Objective

Eliminate all backwards-compatibility / legacy / deprecated-scaffolding code from the codebase, leaving a single clean path for every behavior, with zero regressions to active employees.

### Concrete Deliverables

- Source edits across `src/lib/`, `src/workers/`, `src/gateway/`, `src/inngest/`, `src/repositories/`, `dashboard/src/`, `scripts/`, `prisma/`
- One new Prisma migration dropping 4 tables + dead columns
- Updated test fixtures; green unit + integration suites
- Recorded live E2E task IDs proving active employees still reach `Done`
- Updated `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `render.yaml`

### Definition of Done

- [ ] `rg -i "backward.?compat|legacy|deprecated" src/` returns only intentional/correct matches (Bolt `MessageReplacementAck`, `config.ts` env detection, `UUID_REGEX` note, external Composio docs)
- [ ] `pnpm build && pnpm dashboard:build && pnpm prisma generate && pnpm lint && pnpm test:unit -- --run` all exit 0
- [ ] `to_regclass` for `projects`, `departments`, `agent_versions`, `risk_models` all NULL
- [ ] Live E2E: `jira-motivation-bot`, `daily-summarizer`, `guest-messaging` each reach `status='Done'` with recorded task IDs

### Must Have

- Strict wave ordering: every TS/dashboard reference to a dropped symbol removed and build green BEFORE the migration runs
- `pnpm trigger-task` and `pnpm verify:e2e` fixed before the columns they query are dropped
- `pg_dump` backup before the migration

### Must NOT Have (Guardrails)

- Do NOT touch the per-employee Jira route (`jira.ts` lines 1–133), the `jira-motivation-bot` archetype, `jira-client.ts`, or `jira-types.ts`
- Do NOT drop or alter the `archetype.risk_model` JSON column (only the separate `risk_models` table)
- Do NOT hard-delete data ROWS (soft-delete rule); column/table DROP via migration IS allowed
- Do NOT drop any column whose TS references are not yet removed
- Do NOT refactor `submit-output.ts` or the output contract beyond the scoped `version`-required / `APPROVED`-enum / v1-fallback changes
- Do NOT "improve" the per-employee Jira route while editing `jira.ts` — delete the global handler only
- Do NOT add `deleted_at` to tables lacking it (out of scope)
- Do NOT migrate or rewrite any archetype
- Do NOT rename/keep `LegacyMessageAck` as a "cleanup" beyond an optional clarity rename — it is a current Bolt type-gap workaround, not a compat shim

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (`vitest`, via `pnpm test:unit` / `pnpm test:integration`)
- **Automated tests**: Tests-after (this is a removal refactor — update existing fixtures/tests, do not author new TDD suites). Existing tests are the regression net.
- **Framework**: vitest (always via `pnpm test*` wrapper scripts — never `vitest` directly)
- **Build gate** is the primary safety mechanism: `pnpm build` + `pnpm dashboard:build` + `pnpm prisma generate` fail loudly on any dangling reference to a removed symbol.

### QA Policy

Every task includes agent-executed QA. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build/type checks**: `pnpm build`, `pnpm dashboard:build`, `pnpm prisma generate`, `pnpm lint`
- **DB/schema**: `psql` (`to_regclass`, column introspection) + PostgREST `curl`
- **Live employee execution**: `pnpm trigger-task`, `pnpm verify:e2e`, real Jira webhook `curl`, `task_status_log` queries
- **Search-based negative checks**: `rg`/`ast-grep` confirming zero residual references

---

## Execution Strategy

### Sequential Waves (NO parallelism — ordering is a correctness invariant)

```
Wave 1  (Leaf dead-code, no schema): Tasks 1-6
Wave 2  (classify-message collapse): Task 7
Wave 3  (Orchestrator TS teardown):  Tasks 8-12
Wave 4  (Type-layer dereference + seed): Tasks 13-14
GATE    (build/test green): Task 15
Wave 5  (Backup + Prisma migration): Tasks 16-17
Wave 6  (PostgREST reload + integration): Task 18
Wave 7  (Live per-employee E2E):     Task 19
Wave 8  (Docs + Telegram notify):    Tasks 20-21

Critical Path: 1→...→6 → 7 → 8→...→12 → 13→14 → 15 (GATE) → 16→17 → 18 → 19 → 20→21
Why sequential: dropping a Prisma column while any TS/dashboard/raw-SQL reference remains breaks the build/tooling. The build gate (Task 15) MUST be green before any DDL.
```

### Why no parallel waves

This is a deletion refactor where later steps depend on earlier dereferences. The standard "5-8 tasks per wave" parallelism target does not apply: the dominant risk (R1: drop-before-deref build break) is mitigated _only_ by strict ordering. Tasks within Wave 1 touch independent files and could in principle run concurrently, but the safest execution is top-to-bottom with a build check between waves.

### Agent Dispatch Summary

- **Wave 1**: T1-T6 → `quick` (mechanical leaf removals, single-concern each)
- **Wave 2**: T7 → `deep` (behavior-sensitive parser collapse)
- **Wave 3**: T8-T12 → `unspecified-high` (multi-file deletions + shared-function edits)
- **Wave 4**: T13 → `quick`, T14 → `deep` (seed FK ordering is delicate)
- **GATE**: T15 → `quick`
- **Wave 5**: T16 → `quick` (backup), T17 → `deep` (migration, load `prisma` + `production-ops` skills)
- **Wave 6**: T18 → `unspecified-high`
- **Wave 7**: T19 → `unspecified-high` (load `e2e-testing` skill)
- **Wave 8**: T20 → `writing`, T21 → `quick`

---

## TODOs

- [ ] 1. Remove `delivery_instructions` dead code (backend)

  **What to do**:
  - `src/lib/delivery-resolver.ts`: remove `delivery_instructions` from `DeliveryArchetypeFields` (line ~19), remove the `deliveryInstructions` variable (line ~35) and the fallback branch (lines ~42-45). Function collapses to: delivery_steps → has-delivery; deliverable_type set + not NO_ACTION_NEEDED → misconfigured; else → escape-hatch. Update the JSDoc priority list (remove item 2).
  - `src/workers/lib/failure-codes.ts:59`: change the string match `'missing delivery_instructions'` to match the current `delivery_steps` error message (verify the actual message emitted when `delivery_steps` is null/empty; align the substring).

  **Must NOT do**: Do not touch `delivery_steps` logic. Do not alter the migration that dropped the column.

  **Recommended Agent Profile**:
  - **Category**: `quick` — mechanical removal in 2 files, clear boundaries.
  - **Skills**: [] — no domain skill needed; straightforward TS edit.

  **Parallelization**: Wave 1. Blocks: Task 15 (gate). Blocked By: None.

  **References**:
  - `src/lib/delivery-resolver.ts:1-54` — full file; the fallback is lines 42-45.
  - `src/workers/lib/failure-codes.ts:59` — the dead string match.
  - Migration `prisma/migrations/20260616030000_consolidate_delivery_fields/migration.sql` — proves the column is already dropped (context only; do not edit).

  **Acceptance Criteria**:
  - [ ] `rg "delivery_instructions" src/lib src/workers` → zero matches
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: delivery-resolver still resolves delivery_steps correctly
    Tool: Bash (bun/tsx REPL or run existing unit test)
    Steps:
      1. Run: pnpm test:unit -- --run tests/unit/delivery-resolver.test.ts
      2. Assert: suite passes (after fixture update in Task 13 — for now, run build)
      3. Run: pnpm build
    Expected Result: build exits 0; no TS error referencing delivery_instructions
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: no residual references in backend
    Tool: Bash (rg)
    Steps:
      1. Run: rg "delivery_instructions" src/lib src/workers
    Expected Result: no output (exit 1)
    Evidence: .sisyphus/evidence/task-1-rg-backend.txt
  ```

  **Commit**: Groups with Wave 1.

- [ ] 2. Remove `delivery_instructions` dead code (dashboard)

  **What to do**:
  - `dashboard/src/lib/types.ts`: remove `delivery_instructions: string | null` from both type definitions (~lines 106, 312).
  - `dashboard/src/lib/gateway.ts:162`: remove `'delivery_instructions'` from the patchable-fields union.
  - `dashboard/src/panels/employees/DebugTab.tsx`: remove the rows rendering `archetype.delivery_instructions` (~lines 145, 246, 248).
  - Delete `dashboard/src/panels/employees/sections/DeliveryInstructionsSection.tsx` entirely. Remove its import/usage from any parent panel (grep for `DeliveryInstructionsSection` and remove references). If a `DeliveryStepsSection` already exists, ensure the delivery editing still works via that; do not create a new one.

  **Must NOT do**: Do not remove `delivery_steps` UI. Do not introduce new components.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`react-dashboard`] — dashboard conventions (SearchableSelect, card shells, URL-encoded state) must be respected when removing a section so layout stays intact.

  **Parallelization**: Wave 1. Blocks: Task 15. Blocked By: None.

  **References**:
  - `dashboard/src/panels/employees/sections/DeliveryInstructionsSection.tsx` — file to delete.
  - `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts:162`, `dashboard/src/panels/employees/DebugTab.tsx` — dereference points.

  **Acceptance Criteria**:
  - [ ] `rg "delivery_instructions|DeliveryInstructionsSection" dashboard/src` → zero matches
  - [ ] `pnpm dashboard:build` exits 0

  **QA Scenarios**:

  ```
  Scenario: dashboard builds without the removed section
    Tool: Bash
    Steps:
      1. Run: pnpm dashboard:build
    Expected Result: build exits 0
    Evidence: .sisyphus/evidence/task-2-dashboard-build.txt

  Scenario: no residual dashboard references
    Tool: Bash (rg)
    Steps:
      1. Run: rg "delivery_instructions|DeliveryInstructionsSection" dashboard/src
    Expected Result: no output (exit 1)
    Evidence: .sisyphus/evidence/task-2-rg-dashboard.txt
  ```

  **Commit**: Groups with Wave 1.

- [ ] 3. Remove `generic-harness` runtime references

  **What to do**:
  - `src/gateway/services/employee-dispatcher.ts:49`: change `supportedRuntimes = ['generic-harness', 'opencode']` to `['opencode']`.
  - `src/inngest/lifecycle/lib/machine-provisioner.ts:~91-95`: remove the `runtime ?? 'generic-harness'` default (default to `'opencode'`) and remove the `generic-harness.mjs` command-path branch — always use `opencode-harness.mjs`.
  - Grep for any other `generic-harness` reference and remove it.

  **Must NOT do**: Do not alter the OpenCode harness command path or VM-size logic.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] — small targeted edits. (Implementer may load `inngest` if the provisioner edit is non-obvious.)

  **Parallelization**: Wave 1. Blocks: Task 15. Blocked By: None.

  **References**:
  - `src/gateway/services/employee-dispatcher.ts:49`
  - `src/inngest/lifecycle/lib/machine-provisioner.ts:91-95`

  **Acceptance Criteria**:
  - [ ] `rg "generic-harness" src/` → zero matches
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: only opencode runtime remains supported
    Tool: Bash (rg + build)
    Steps:
      1. Run: rg "generic-harness" src/
      2. Run: pnpm build
    Expected Result: rg no output (exit 1); build exits 0
    Evidence: .sisyphus/evidence/task-3-generic-harness.txt
  ```

  **Commit**: Groups with Wave 1.

- [ ] 4. Output-contract cleanup: require `version`, remove `APPROVED` enum value

  **What to do**:
  - `src/workers/lib/output-schema.mts`: make `version` required — `version: number` in `StandardOutput`, `version: z.number().int().positive()` (drop `.optional()`). Remove the "backward compatibility" comment (lines 4-6). Remove `'APPROVED'` from the `classification` union (line 9) and from the Zod enum (line 20) → `z.enum(['NEEDS_APPROVAL', 'NO_ACTION_NEEDED'])`.
  - `src/workers/lib/output-contract.mts:43-61`: remove the absent→v1 fallback. With version now required, a missing version is a malformed file. Keep the future-unknown-version WARN (forward-compat, not backward-compat) but base it on the parsed required `version`. If the file fails `parseStandardOutput`, fall through to existing not-written handling (do not throw harder than today).
  - Check `src/lib/output-contract-constants.ts` (World-A) for an `OutputClassification` type containing `APPROVED`; if present, remove it there too.
  - If `output-contract-constants.ts` changed, run `pnpm generate-worker-constants` and commit the regenerated `src/worker-tools/lib/output-contract-paths.generated.ts`.
  - Verify `src/worker-tools/platform/submit-output.ts` already writes `version` (it should). If it does not, add `version: OUTPUT_CONTRACT_VERSION` to its written payload.

  **Must NOT do**: Do not restructure StandardOutput beyond these three changes. Do not convert the parse path to throw on malformed input.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] — but MUST run `pnpm generate-worker-constants` if World-A constants change (CI diff-gate).

  **References**:
  - `src/workers/lib/output-schema.mts:4-26`
  - `src/workers/lib/output-contract.mts:43-61`
  - `src/lib/output-contract-constants.ts` — World-A single source.
  - `src/worker-tools/platform/submit-output.ts` — confirm it writes `version`.
  - AGENTS.md "Output-contract single source (World-A / World-B split)" — regeneration rule.

  **Acceptance Criteria**:
  - [ ] `version` is required in both the TS interface and Zod schema
  - [ ] `APPROVED` removed from the classification enum (World-A and World-B)
  - [ ] `pnpm generate-worker-constants` produces no diff (i.e. was run and committed)
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: submit-output writes a version-stamped, valid StandardOutput
    Tool: Bash (tsx)
    Steps:
      1. Inspect submit-output.ts payload construction; confirm it includes version.
      2. Run: pnpm build && pnpm generate-worker-constants
      3. Run: git diff --exit-code src/worker-tools/lib/output-contract-paths.generated.ts
    Expected Result: build exits 0; generate produces no uncommitted diff
    Evidence: .sisyphus/evidence/task-4-output-contract.txt

  Scenario: APPROVED is gone everywhere
    Tool: Bash (rg)
    Steps:
      1. Run: rg "'APPROVED'|\"APPROVED\"" src/workers src/lib src/worker-tools
    Expected Result: no output (exit 1)
    Evidence: .sisyphus/evidence/task-4-approved-gone.txt
  ```

  **Commit**: Groups with Wave 1.

- [ ] 5. Remove small shims: `tool-parser` `_basePath`/`getToolByPath`, `session-manager` `sendFixPrompt`, dead comments

  **What to do**:
  - `src/gateway/services/tool-parser.ts`: remove the `_basePath?: string` param from `discoverTools()` (line ~86) and update the JSDoc (remove the "backward compatibility" sentence, lines 7-8 and 83-85). Use `lsp_find_references` on `getToolByPath` and `parseToolFile` — both have no external caller per audit; remove `getToolByPath` and `parseToolFile` and the "Legacy path" JSDoc. Confirm `discoverTools` call sites (`archetype-generator.ts`, `admin-brain-preview.ts`, `admin-tools.ts`) already pass no args.
  - `src/workers/lib/session-manager.ts`: remove `sendFixPrompt()` from the interface (line ~36) and its implementation (lines ~359-399). Confirm zero callers via `lsp_find_references` first.
  - `src/workers/lib/resource-caps.ts:6`: remove the dead external comment referencing `nexus-stack/tools/fly-worker/entrypoint.sh`.

  **Must NOT do**: Do not remove `discoverTools` itself or change its caching behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] — uses `lsp_find_references` to confirm zero callers before deleting.

  **References**:
  - `src/gateway/services/tool-parser.ts:7-8,83-98,101-150`
  - `src/workers/lib/session-manager.ts:36,359-399`
  - `src/workers/lib/resource-caps.ts:6`

  **Acceptance Criteria**:
  - [ ] `lsp_find_references` confirms zero callers for `getToolByPath`, `parseToolFile`, `sendFixPrompt` before removal
  - [ ] `rg "_basePath|getToolByPath|sendFixPrompt" src/` → zero matches
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: discoverTools still returns the tool catalog
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Run: pnpm test:unit -- --run (tool-parser-related tests)
    Expected Result: build exits 0; tests pass
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: shims removed
    Tool: Bash (rg)
    Steps:
      1. Run: rg "_basePath|getToolByPath|sendFixPrompt|parseToolFile" src/
    Expected Result: no output (exit 1)
    Evidence: .sisyphus/evidence/task-5-rg.txt
  ```

  **Commit**: Groups with Wave 1.

- [ ] 6. Remove `LegacyJiraClientConfig` (keep jira-client itself)

  **What to do**:
  - `src/lib/jira-client.ts`: delete the `LegacyJiraClientConfig` interface (lines 19-24), change `createJiraClient` signature to `config: JiraClientConfig` only, and remove the `else` branch (lines 65-68) that handled the flat format. Remove the "Legacy format" JSDoc line (49).
  - `tests/unit/lib/jira-client.test.ts`: update every test that passes the flat `{ baseUrl, email, apiToken }` shape to the `{ auth: { email, apiToken, baseUrl } }` Basic-auth shape. OAuth tests already use the new shape.

  **Must NOT do**: Do not delete `jira-client.ts`, `jira-types.ts`, or any Jira method. The Jira client stays — only the legacy config branch goes.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] — isolated, well-bounded change with a dedicated test file.

  **References**:
  - `src/lib/jira-client.ts:19-24,49,51,65-68`
  - `tests/unit/lib/jira-client.test.ts` — call sites using the flat config.

  **Acceptance Criteria**:
  - [ ] `rg "LegacyJiraClientConfig" src tests` → zero matches
  - [ ] `pnpm test:unit -- --run tests/unit/lib/jira-client.test.ts` passes
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: jira-client constructs with the new auth shape only
    Tool: Bash
    Steps:
      1. Run: pnpm test:unit -- --run tests/unit/lib/jira-client.test.ts
    Expected Result: all tests pass; no flat-config usage remains
    Evidence: .sisyphus/evidence/task-6-jira-client-test.txt
  ```

  **Commit**: Groups with Wave 1.

- [ ] 7. Collapse `classify-message.ts` to StandardOutput-only

  **What to do**:
  - `src/lib/classify-message.ts`: Remove Path 2 (the `NO_ACTION_NEEDED:` plain-text prefix branch, lines ~85-101) and Path 3 (the legacy JSON path with `LegacyParsed`/`guestName`/`propertyName`/`checkIn`/`checkOut`/`bookingChannel`/`leadUid`/`threadUid`/`messageUid` handling, lines ~103-192). Remove the now-vestigial `legacyFields` array and `hasLegacyFields` guard in Path 1 (lines ~31-47) — with legacy paths gone, Path 1 no longer needs to exclude legacy-field shapes.
  - KEEP the defensive parse-failure fallback: when the standard JSON parse fails, return `{ classification: 'NEEDS_APPROVAL', confidence: 0.3, reasoning: 'Failed to parse...', ... }` (route to human review, do NOT throw).
  - Keep the `ClassifyResult` interface but remove fields only the legacy paths produced if they are no longer set anywhere (`displayContext`/`context` — verify consumers in `no-approval-path.ts`/`override-card.ts` before removing; if either reads them, keep the field but stop synthesizing from guest fields). Default-safe: keep `ClassifyResult` shape, just stop populating from legacy inputs.
  - Update `tests/unit/lib/classify-message.test.ts`: remove tests asserting the plain-text and guest-JSON legacy behaviors; keep StandardOutput + parse-failure-fallback tests.

  **Must NOT do**: Do not throw on parse failure. Do not change the return shape consumed by `no-approval-path.ts` / `override-card.ts` without confirming those callers.

  **Recommended Agent Profile**:
  - **Category**: `deep` — behavior-sensitive; must verify caller expectations and guest-messaging output format before removing branches.
  - **Skills**: [] — implementer reads callers directly.

  **References**:
  - `src/lib/classify-message.ts:1-193` (full file)
  - `src/inngest/lifecycle/steps/no-approval-path.ts:70` and `src/inngest/lifecycle/steps/override-card.ts:61` — the two active callers; confirm which `ClassifyResult` fields they read.
  - `src/worker-tools/platform/submit-output.ts` — proves modern employees emit StandardOutput (`classification` + `summary`, no guest fields).
  - `tests/unit/lib/classify-message.test.ts` — tests to prune.

  **Acceptance Criteria**:
  - [ ] Only Path 1 (StandardOutput) + parse-failure fallback remain
  - [ ] `rg "LegacyParsed|hasLegacyFields|guestName" src/lib/classify-message.ts` → zero matches
  - [ ] `pnpm test:unit -- --run tests/unit/lib/classify-message.test.ts` passes
  - [ ] Callers `no-approval-path.ts` / `override-card.ts` build clean

  **QA Scenarios**:

  ```
  Scenario: StandardOutput classification still parses correctly
    Tool: Bash (tsx REPL)
    Steps:
      1. Run a tsx snippet: import parseClassifyResponse; call with
         JSON.stringify({version:1, classification:'NEEDS_APPROVAL', summary:'x', draft:'y', confidence:0.9})
      2. Assert: result.classification === 'NEEDS_APPROVAL', result.draftResponse === 'y'
    Expected Result: parsed correctly via Path 1
    Evidence: .sisyphus/evidence/task-7-standard-parse.txt

  Scenario: malformed output falls back to NEEDS_APPROVAL (defensive, no throw)
    Tool: Bash (tsx REPL)
    Steps:
      1. Call parseClassifyResponse('{ broken json >>>')
      2. Assert: result.classification === 'NEEDS_APPROVAL', result.confidence === 0.3, no exception thrown
    Expected Result: graceful fallback, no throw
    Evidence: .sisyphus/evidence/task-7-fallback.txt
  ```

  **Commit**: Wave 2 — `refactor: collapse classify-message to StandardOutput-only parsing`.

- [ ] 8. Delete old global Jira route from `jira.ts` (keep per-employee route)

  **What to do**:
  - `src/gateway/routes/jira.ts`: delete the second handler `router.post('/webhooks/jira', ...)` (lines ~135-321) that hardcodes `role_name: 'jira-motivation-bot'` and uses the `projects` table. KEEP lines 1-133 (the per-employee `/webhooks/jira/:tenantSlug/:employeeSlug` handler) and the `return router`.
  - Remove the now-unused `cancelTaskByExternalId` import if the global route was its only user in this file.

  **Must NOT do**: Do NOT touch the per-employee route (lines 1-133). Do not remove the `jira-motivation-bot` archetype.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — must precisely bound the deletion to the global handler only.
  - **Skills**: [`api-design`] — Express route conventions; ensure remaining route still uses sendError/sendSuccess.

  **References**:
  - `src/gateway/routes/jira.ts:1-133` (KEEP), `:135-321` (DELETE)
  - `src/gateway/services/jira-task-creation.ts` — exports `createTaskFromJiraWebhook`, `cancelTaskByExternalId`.

  **Acceptance Criteria**:
  - [ ] Per-employee route handler intact (lines 1-133 unchanged in behavior)
  - [ ] Global `/webhooks/jira` (no params) handler removed
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: per-employee jira route still registered
    Tool: Bash (rg + build)
    Steps:
      1. Run: rg "webhooks/jira/:tenantSlug/:employeeSlug" src/gateway/routes/jira.ts
      2. Run: rg "router.post\('/webhooks/jira'," src/gateway/routes/jira.ts
      3. Run: pnpm build
    Expected Result: step 1 matches (kept); step 2 no match (removed); build exits 0
    Evidence: .sisyphus/evidence/task-8-jira-routes.txt
  ```

  **Commit**: Groups with Wave 3.

- [ ] 9. Strip `projectId`/`project_id` from shared `jira-task-creation.ts` and remove `cancelTaskByExternalId`

  **What to do**:
  - `src/gateway/services/jira-task-creation.ts`: remove the `projectId` parameter from `createTaskFromJiraWebhook` and remove the `project_id` write (line ~51). The per-employee route does not need it. Remove the `cancelTaskByExternalId` function entirely (caller-less after Task 8) and its test.
  - Check `src/inngest/send.ts` (or wherever the task-dispatched event is built) for a `projectId`/`project_id` field tied to this path and remove it.
  - Update `src/gateway/routes/jira.ts` per-employee handler call site to not pass `projectId`.

  **Must NOT do**: Do not remove `createTaskFromJiraWebhook` itself (the per-employee route uses it). Do not drop the `project_id` DB column yet (that is Wave 5, after all TS refs are gone).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — shared function across kept/removed routes; precise edits required.
  - **Skills**: [`api-design`, `data-access-conventions`] — task creation touches the repository/dispatch layer; follow mergeTaskMetadata/repository conventions.

  **References**:
  - `src/gateway/services/jira-task-creation.ts:51` (project_id write), `cancelTaskByExternalId` function.
  - `src/inngest/send.ts` / `src/inngest/events.ts` — event payload fields.
  - `src/gateway/routes/jira.ts:1-133` — per-employee call site.

  **Acceptance Criteria**:
  - [ ] `createTaskFromJiraWebhook` no longer accepts or writes `project_id`
  - [ ] `cancelTaskByExternalId` removed; `rg "cancelTaskByExternalId" src tests` → zero matches
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: task creation no longer references project_id
    Tool: Bash (rg + build)
    Steps:
      1. Run: rg "project_id|projectId" src/gateway/services/jira-task-creation.ts
      2. Run: pnpm build
    Expected Result: no project_id references; build exits 0
    Evidence: .sisyphus/evidence/task-9-jira-task-creation.txt
  ```

  **Commit**: Groups with Wave 3.

- [ ] 10. Delete project-registry scaffolding + unmount routes

  **What to do**:
  - Delete files: `src/gateway/routes/admin-projects.ts`, `src/gateway/services/project-registry.ts`, `src/gateway/services/project-lookup.ts`.
  - Remove `ProjectRegistryConflictError` (or equivalent) from `src/lib/errors.ts` if only used by the above.
  - `src/gateway/server.ts`: unmount the admin-projects router (the import and the `app.use(...)`/route registration — Metis noted ~lines 14, 249). Confirm no other route depends on these.
  - Grep for any residual import of the deleted modules and remove.

  **Must NOT do**: Do not remove unrelated admin routes. Do not touch the `projects` Prisma model yet (Wave 5).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multi-file deletion + server wiring.
  - **Skills**: [`api-design`] — route registration conventions.

  **References**:
  - `src/gateway/routes/admin-projects.ts`, `src/gateway/services/project-registry.ts`, `src/gateway/services/project-lookup.ts` — files to delete.
  - `src/gateway/server.ts:14,249` — mount points.
  - `src/lib/errors.ts` — conflict error class.

  **Acceptance Criteria**:
  - [ ] The 3 files deleted; no residual imports
  - [ ] `rg "admin-projects|project-registry|project-lookup|ProjectRegistry" src` → zero matches
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: server boots without project routes
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Run: rg "projectRoutes|admin-projects|project-registry" src/gateway
    Expected Result: build exits 0; no residual references
    Evidence: .sisyphus/evidence/task-10-project-scaffolding.txt
  ```

  **Commit**: Groups with Wave 3.

- [ ] 11. Remove `agent-version` (with lsp gate) + `AGENT_VERSION_ID` plumbing

  **What to do**:
  - **GATE FIRST**: run `lsp_find_references` on `ensureAgentVersion` (in `src/lib/agent-version.ts`). Confirm the ONLY references are the file itself + its test (`schema.test.ts`). If any runtime caller exists in `src/inngest/` or `src/workers/`, STOP and report — do not delete.
  - If gate passes: delete `src/lib/agent-version.ts` and its test references (the `schema.test.ts:201-207` block asserting agentVersion).
  - `src/repositories/tenant-env-loader.ts`: remove `'AGENT_VERSION_ID'` from `PLATFORM_ENV_WHITELIST`.
  - `src/gateway/routes/admin-brain-preview.ts:182-187`: remove the `AGENT_VERSION_ID` env-preview block.
  - Grep for residual `AGENT_VERSION_ID` / `ensureAgentVersion` / `agentVersion` and remove (keep schema model for Wave 5).

  **Must NOT do**: Do not drop the `agent_versions` table here (Wave 5). Do not remove the env parity test itself — just the whitelist entry.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`data-access-conventions`] — PLATFORM_ENV_WHITELIST and env-loader conventions.

  **References**:
  - `src/lib/agent-version.ts` (delete after gate)
  - `src/repositories/tenant-env-loader.ts:16` (whitelist entry)
  - `src/gateway/routes/admin-brain-preview.ts:182-187`
  - `tests/.../schema.test.ts:201-207` (agentVersion assertion)

  **Acceptance Criteria**:
  - [ ] `lsp_find_references` on `ensureAgentVersion` confirms zero runtime callers (evidence captured)
  - [ ] `rg "ensureAgentVersion|AGENT_VERSION_ID" src` → zero matches
  - [ ] Env parity test still passes
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: lsp gate confirms ensureAgentVersion is unused at runtime
    Tool: lsp_find_references (then Bash)
    Steps:
      1. lsp_find_references on ensureAgentVersion → record all results
      2. Assert: only agent-version.ts + its test appear (no inngest/workers caller)
      3. Run: pnpm test:unit -- --run (env parity test)
    Expected Result: gate passes; parity test green
    Evidence: .sisyphus/evidence/task-11-agentversion-gate.txt

  Scenario: AGENT_VERSION_ID plumbing removed
    Tool: Bash (rg)
    Steps:
      1. Run: rg "AGENT_VERSION_ID|ensureAgentVersion|agentVersion" src
    Expected Result: no output (exit 1)
    Evidence: .sisyphus/evidence/task-11-rg.txt
  ```

  **Commit**: Groups with Wave 3.

- [ ] 12. Remove legacy tenant config shape + fix E2E scripts' raw SQL

  **What to do**:
  - `src/repositories/tenant-env-loader.ts:73-78`: remove the `legacyNotifConfig` / `config.summary.publish_channel` → `PUBLISH_CHANNEL` block. (First verify via `psql` that no live tenant has `config.summary.publish_channel` set; if one does, note it for a one-time config move — but since this is alpha, removal is acceptable.)
  - `src/gateway/validation/schemas.ts`: remove the `summary` sub-object (`channel_ids`/`target_channel`/`publish_channel`) from `TenantConfigBodySchema`.
  - `src/gateway/routes/admin-brain-preview.ts`: remove the `PUBLISH_CHANNEL` preview tied to `summary.publish_channel`.
  - **CRITICAL (pre-migration fix)**: `scripts/trigger-task.ts:272` reads `fix_iterations` via raw SQL — remove/replace that column from the SELECT and any `fixIterations` return usage. `scripts/verify-e2e.ts` reads `agent_version_id` — remove it from its SELECT. These MUST be fixed now so the columns can be dropped in Wave 5 without breaking the E2E tooling.

  **Must NOT do**: Do not remove the `notification_channel` resolution (that is the canonical path). Do not drop columns here.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`data-access-conventions`, `api-design`] — env-loader + validation schema conventions.

  **References**:
  - `src/repositories/tenant-env-loader.ts:73-78`
  - `src/gateway/validation/schemas.ts` — `TenantConfigBodySchema`
  - `src/gateway/routes/admin-brain-preview.ts` — PUBLISH_CHANNEL block
  - `scripts/trigger-task.ts:272` (fix_iterations raw SQL), `scripts/verify-e2e.ts` (agent_version_id)

  **Acceptance Criteria**:
  - [ ] `rg "config\['summary'\]|summary.publish_channel|PUBLISH_CHANNEL" src` → zero matches
  - [ ] `scripts/trigger-task.ts` and `scripts/verify-e2e.ts` no longer SELECT `fix_iterations`/`agent_version_id`
  - [ ] `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: E2E scripts run without the dropped-soon columns
    Tool: Bash
    Steps:
      1. Run: rg "fix_iterations|agent_version_id" scripts/
      2. Run: pnpm build
    Expected Result: no raw-SQL references to those columns; build exits 0
    Evidence: .sisyphus/evidence/task-12-scripts-and-config.txt
  ```

  **Commit**: Groups with Wave 3.

- [ ] 13. Dereference dropped fields in types + worker postgrest-types + test fixtures

  **What to do**:
  - `dashboard/src/lib/types.ts`: remove `scope_estimate`, `affected_resources`, `plan_content`, `plan_generated_at`, `project_id` from Task-related types (whatever subset is present). First confirm via grep that no dashboard component renders them (DebugTab/task-detail) — if any does, remove that render too.
  - `dashboard/src/lib/gateway.ts`: remove any of those fields from field-selection unions.
  - `src/workers/lib/postgrest-types.ts`: remove `project_id`, `scope_estimate`, `affected_resources`, `plan_content`, `plan_generated_at` from `TaskRow`, and `wave_number`/`wave_state`/`fix_iterations`/`agent_version_id` from the `Execution`/row type if present.
  - Update all test fixtures that set `delivery_instructions: null` (~19 files) and any that set the soon-dropped columns, to remove those keys.
  - Remove the 6 `admin-*.test.ts` files' `X-Admin-Key`/`ADMIN_API_KEY` usage → rewrite to `Authorization: Bearer $SERVICE_TOKEN` (or delete tests that only existed to test the removed auth). Delete the ~10 dead test files Metis flagged (orchestrator/project tests) — confirm each only tests removed code before deleting.

  **Must NOT do**: Do not remove fields still actively rendered/used. Do not drop the Prisma columns here.

  **Recommended Agent Profile**:
  - **Category**: `quick` — mostly mechanical fixture/type edits, but high file count.
  - **Skills**: [`react-dashboard`] — dashboard type/field conventions.

  **References**:
  - `dashboard/src/lib/types.ts`, `dashboard/src/lib/gateway.ts`
  - `src/workers/lib/postgrest-types.ts` — `TaskRow` / execution row types.
  - ~19 test fixtures with `delivery_instructions: null` (from audit).
  - `tests/unit/gateway/routes/admin-*.test.ts` (6 files) — X-Admin-Key pattern.

  **Acceptance Criteria**:
  - [ ] `rg "scope_estimate|affected_resources|plan_content|plan_generated_at|wave_number|wave_state|fix_iterations|agent_version_id" src dashboard/src` → zero matches (outside the Prisma schema, which is edited in Wave 5)
  - [ ] `rg "X-Admin-Key|ADMIN_API_KEY" tests src` → zero matches
  - [ ] `pnpm build && pnpm dashboard:build` exit 0

  **QA Scenarios**:

  ```
  Scenario: all TS/dashboard references to soon-dropped columns are gone
    Tool: Bash (rg + builds)
    Steps:
      1. Run the rg checks above
      2. Run: pnpm build && pnpm dashboard:build
    Expected Result: no residual references; both builds exit 0
    Evidence: .sisyphus/evidence/task-13-deref.txt
  ```

  **Commit**: Groups with Wave 4.

- [ ] 14. Clean `seed.ts`: remove department_id, agentVersion/project/department upserts (FK-safe ordering)

  **What to do**:
  - `prisma/seed.ts`: In a SINGLE coordinated edit, remove `department_id` from ALL archetype upserts (14+ sites) AND remove the two `department.upsert` calls — both must go together to avoid an FK insert failure on reseed.
  - Remove the `agentVersion.upsert` (lines ~161-203) and `project.upsert` (lines ~180-203) blocks.
  - Remove any `risk_models` table seed if present (the `risk_model` JSON on archetypes stays — do NOT touch that).
  - Remove the `X-Admin-Key` curl comment examples (lines ~4324-4330) → update to `Authorization: Bearer $SERVICE_TOKEN`.

  **Must NOT do**: Do NOT remove `risk_model` JSON values from archetype upserts. Do not remove the `jira-motivation-bot` archetype upsert.

  **Recommended Agent Profile**:
  - **Category**: `deep` — seed FK ordering is delicate; a partial edit breaks reseed.
  - **Skills**: [`prisma`, `creating-archetypes`] — seed/upsert patterns and archetype field rules.

  **References**:
  - `prisma/seed.ts:161-203` (agentVersion + project upserts), department upserts, `:4324-4330` (X-Admin-Key comments)
  - `prisma/seed.ts:3510,3537` — `jira-motivation-bot` archetype (KEEP).

  **Acceptance Criteria**:
  - [ ] `rg "department_id|agentVersion.upsert|project.upsert|department.upsert|X-Admin-Key" prisma/seed.ts` → zero matches
  - [ ] `risk_model` JSON still set on archetypes (`rg "risk_model" prisma/seed.ts` still matches)
  - [ ] Seed parses (TS compiles): `pnpm build` exits 0

  **QA Scenarios**:

  ```
  Scenario: seed is FK-safe and idempotent after edits (dry compile)
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Run: rg "department_id|agentVersion.upsert|project.upsert" prisma/seed.ts
      3. Confirm risk_model JSON retained: rg "risk_model" prisma/seed.ts
    Expected Result: build exits 0; no removed-entity upserts; risk_model retained
    Evidence: .sisyphus/evidence/task-14-seed.txt
  ```

  > Full reseed against a DB is validated in Wave 6 after the migration; here we only compile-check to keep ordering safe.

  **Commit**: Groups with Wave 4.

- [ ] 15. BUILD GATE — full green before any DDL

  **What to do**:
  - Run, in order, and require all to exit 0:
    `pnpm build` · `pnpm dashboard:build` · `pnpm prisma generate` · `pnpm lint` · `pnpm test:unit -- --run`
  - Run residual-reference sweep: `rg -i "delivery_instructions|generic-harness|AGENT_VERSION_ID|X-Admin-Key|cancelTaskByExternalId|ensureAgentVersion|getToolByPath|sendFixPrompt" src scripts dashboard/src` → expect zero (outside intentional).
  - If anything fails, STOP — fix the referencing task before proceeding to Wave 5. Do NOT run the migration with a red build.

  **Must NOT do**: Do not proceed to Wave 5 if any check fails.

  **Recommended Agent Profile**:
  - **Category**: `quick` — runs checks, gates progression.
  - **Skills**: [`long-running-commands`] — builds/tests may exceed 30s; use the tmux launch+poll pattern.

  **References**: AGENTS.md test commands; `scripts/run-vitest.mjs` orphan-protection (always use `pnpm test*`).

  **Acceptance Criteria**:
  - [ ] All five commands exit 0
  - [ ] Residual-reference sweep returns only intentional matches

  **QA Scenarios**:

  ```
  Scenario: full gate green
    Tool: interactive_bash (tmux) for long-running builds/tests
    Steps:
      1. Launch in tmux: pnpm build && pnpm dashboard:build && pnpm prisma generate && pnpm lint && pnpm test:unit -- --run; echo EXIT:$?
      2. Poll log until EXIT line; assert EXIT:0
      3. Run the rg residual sweep
    Expected Result: EXIT:0; no unexpected residual references
    Evidence: .sisyphus/evidence/task-15-build-gate.txt
  ```

  **Commit**: NO (gate only).

- [ ] 16. Pre-migration database backup (MANDATORY)

  **What to do**:
  - Per the `production-ops` skill, take a `pg_dump` of the local DB before any DDL. Store under `database-backups/<timestamp>/ai_employee.dump`.
  - `pg_dump 'postgresql://postgres:postgres@localhost:54322/ai_employee' -Fc -f database-backups/<ts>/ai_employee.dump`
  - (Prod backup is taken later, by CI/manual, BEFORE the prod deploy — note this in the plan; this task covers local.)

  **Must NOT do**: Do not run the migration before the backup completes.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`production-ops`] — backup/restore procedure.

  **References**: `production-ops` skill § Database Backup.

  **Acceptance Criteria**:
  - [ ] Backup file exists and is non-empty under `database-backups/<ts>/`

  **QA Scenarios**:

  ```
  Scenario: backup created
    Tool: Bash
    Steps:
      1. Run pg_dump as above
      2. Run: ls -la database-backups/<ts>/ai_employee.dump
    Expected Result: file exists, size > 0
    Evidence: .sisyphus/evidence/task-16-backup.txt
  ```

  **Commit**: NO (artifact only; backups are gitignored).

- [ ] 17. Prisma schema edits + migration (drop tables + columns)

  **What to do**:
  - `prisma/schema.prisma`: remove models `AgentVersion`, `RiskModel` (the `risk_models` table — NOT the `risk_model` JSON column), `Project`, `Department`, and all relation fields pointing to them. Remove columns: `Execution.wave_number`, `wave_state`, `fix_iterations`, `agent_version_id`; `Task.plan_content`, `plan_generated_at`, `project_id`, `scope_estimate`, `affected_resources`. Remove the `department_id` field from `Archetype` (and `Project` if it carried one).
  - Generate the migration via the DIRECT connection (port 5432, NEVER 6543): `pnpm prisma migrate dev --name drop_orchestrator_scaffolding` with `DATABASE_URL`/`DATABASE_URL_DIRECT` pointing at `:54322` locally. Ensure FK columns are dropped before/with their parent tables (Prisma handles ordering, but verify the generated SQL drops `agent_version_id`/`project_id` FKs before dropping `agent_versions`/`projects`).
  - Run `pnpm prisma generate` to refresh the client.

  **Must NOT do**: Do NOT drop or alter the `archetype.risk_model` JSON column. Do not use the transaction pooler (6543) for DDL.

  **Recommended Agent Profile**:
  - **Category**: `deep` — schema correctness + migration ordering.
  - **Skills**: [`prisma`, `production-ops`] — migration workflow, schema-cache reload, DIRECT-URL rule.

  **References**:
  - `prisma/schema.prisma` — models `AgentVersion`, `RiskModel`, `Project`, `Department`; `Execution`/`Task`/`Archetype` columns.
  - `prisma` skill — migration checklist + PostgREST reload.
  - AGENTS.md CI/CD note — DDL must use session pooler/direct (5432), not 6543.

  **Acceptance Criteria**:
  - [ ] New migration file created under `prisma/migrations/`
  - [ ] `prisma generate` succeeds; `pnpm build` exits 0 with regenerated client
  - [ ] `archetype.risk_model` JSON column still present in schema

  **QA Scenarios**:

  ```
  Scenario: migration applies and tables are dropped
    Tool: Bash (psql)
    Steps:
      1. Run: pnpm prisma migrate dev --name drop_orchestrator_scaffolding (DIRECT URL)
      2. Run: psql .../ai_employee -c "SELECT to_regclass('public.projects'), to_regclass('public.departments'), to_regclass('public.agent_versions'), to_regclass('public.risk_models');"
      3. Run: psql .../ai_employee -c "\d archetypes" | grep risk_model
    Expected Result: all four to_regclass NULL; archetypes.risk_model (jsonb) still present
    Evidence: .sisyphus/evidence/task-17-migration.txt

  Scenario: dropped columns gone from executions/tasks
    Tool: Bash (psql)
    Steps:
      1. Run: psql .../ai_employee -c "\d executions" and "\d tasks"
      2. Assert: no wave_number/wave_state/fix_iterations/agent_version_id on executions; no plan_content/plan_generated_at/project_id/scope_estimate/affected_resources on tasks
    Expected Result: columns absent
    Evidence: .sisyphus/evidence/task-17-columns.txt
  ```

  **Commit**: Wave 5 — `refactor(db): drop unused orchestrator tables and columns`.

- [ ] 18. PostgREST schema reload + integration tests + reseed

  **What to do**:
  - Reload PostgREST schema cache: `psql .../ai_employee -c "NOTIFY pgrst, 'reload schema';"` (or restart the PostgREST container).
  - Verify via curl that the API reflects the drop and still serves rows.
  - Run a full reseed to confirm `seed.ts` edits are FK-safe end-to-end: `pnpm prisma db seed` (after the Task 16 backup) — confirm no FK violations from removed department/project/agentVersion.
  - Run `pnpm test:integration` (after `pnpm test:db:setup` if needed) against `ai_employee_test`.

  **Must NOT do**: Do not skip the PostgREST reload — workers read via PostgREST and will error on stale cache.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`prisma`, `feature-verification`] — PostgREST-vs-psql distinction, zero-rows-is-failure rule.

  **References**:
  - `prisma` skill — schema-cache reload requirement.
  - PostgREST URL `http://localhost:54331`; `feature-verification` skill.

  **Acceptance Criteria**:
  - [ ] PostgREST returns 200 (not PGRST205) for `tasks`/`executions`/`archetypes`
  - [ ] Response bodies do NOT contain the dropped columns
  - [ ] `pnpm prisma db seed` completes with no FK errors
  - [ ] `pnpm test:integration` → 0 failures

  **QA Scenarios**:

  ```
  Scenario: PostgREST reflects the migration
    Tool: Bash (curl)
    Steps:
      1. Run: psql .../ai_employee -c "NOTIFY pgrst, 'reload schema';"
      2. Run: curl -s "http://localhost:54331/tasks?limit=1" (with PostgREST headers)
      3. Assert: 200 + JSON array; no project_id/scope_estimate/plan_content keys
    Expected Result: 200, dropped columns absent
    Evidence: .sisyphus/evidence/task-18-postgrest.txt

  Scenario: reseed is FK-safe
    Tool: Bash
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit 0, no FK violation in output
    Expected Result: seed completes cleanly
    Evidence: .sisyphus/evidence/task-18-reseed.txt
  ```

  **Commit**: NO (verification; reseed mutates DB only).

- [ ] 19. Live per-employee E2E (mandatory — proves zero regressions)

  **What to do**:
  - Single-gateway pre-flight: `ps -Ao pid,ppid,command | grep -i gateway` — confirm exactly one gateway process (a stale second one swallows ~50% of events).
  - Ensure `docker build -t ai-employee-worker:latest .` is current and services are up (`pnpm dev` or equivalent).
  - **jira-motivation-bot (canary — shared `jira-task-creation.ts` was edited)**: POST a real `jira:issue_created` payload to `/webhooks/jira/<tenantSlug>/jira-motivation-bot`. Assert a `tasks` row is created and reaches `status='Done'`. Confirm NO `project_id` column error in logs. Record task ID + `task_status_log` trace.
  - **daily-summarizer**: `pnpm trigger-task` (or the summarizer trigger curl). Assert `Done`. This also proves the `fix_iterations` SQL fix in `trigger-task.ts`.
  - **guest-messaging**: trigger one inbound (Hostfully webhook curl from AGENTS.md). Assert an approval card posts and the task reaches a valid state — proves `parseClassifyResponse` Path 1 (StandardOutput) still works after the collapse.
  - For each, run `pnpm verify:e2e --task-id <uuid>` and assert no raw-SQL column errors.

  **Must NOT do**: Do not accept "unit tests pass" as a substitute. Do not skip the jira-motivation-bot canary.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`, `long-running-commands`] — trigger methods, lifecycle state verification, tmux for long runs.

  **References**:
  - `e2e-testing` skill — per-employee trigger methods + verification.
  - AGENTS.md "Testing Employees Locally" — summarizer + guest-messaging curl examples.
  - `docs/employees/2026-06-02-1230-engineer.md` / jira-motivation-bot seed for the webhook shape.

  **Acceptance Criteria**:
  - [ ] jira-motivation-bot task reaches `Done` (task ID recorded); no project_id error
  - [ ] daily-summarizer task reaches `Done` (task ID recorded)
  - [ ] guest-messaging produces a valid approval card / state (task ID recorded)
  - [ ] `pnpm verify:e2e` passes for each with no column errors

  **QA Scenarios**:

  ```
  Scenario: jira-motivation-bot end-to-end (canary)
    Tool: Bash (curl) + psql
    Steps:
      1. Single-gateway pre-flight
      2. curl POST /webhooks/jira/<tenantSlug>/jira-motivation-bot with a jira:issue_created body
      3. Poll: psql .../ai_employee -c "SELECT status FROM tasks WHERE external_ref='<issueKey>'"
      4. Assert status reaches 'Done'; pull task_status_log trace
    Expected Result: Done; no project_id SQL error in worker logs
    Evidence: .sisyphus/evidence/task-19-jira-bot.txt

  Scenario: summarizer + guest-messaging reach valid terminal states
    Tool: Bash (curl/pnpm) + psql
    Steps:
      1. pnpm trigger-task (summarizer) → poll to Done → verify:e2e
      2. curl Hostfully webhook (guest-messaging) → assert approval card / valid state
    Expected Result: both produce recorded task IDs with valid states; verify:e2e clean
    Evidence: .sisyphus/evidence/task-19-summarizer-guest.txt
  ```

  **Commit**: NO (verification).

- [ ] 20. Update documentation (AGENTS.md, README.md, CONTRIBUTING.md, render.yaml)

  **What to do**:
  - `render.yaml`: remove `ADMIN_API_KEY`, `COST_LIMIT_USD_PER_DEPT_PER_DAY` (moved to platform_settings), and the dead `JIRA_CLIENT_ID`/`JIRA_CLIENT_SECRET` OAuth vars. Keep `JIRA_WEBHOOK_SECRET` (the active per-employee route uses it).
  - `CONTRIBUTING.md`: delete the stale "Deprecated component" table (all listed files are gone), and update all `X-Admin-Key` curl examples to `Authorization: Bearer $SERVICE_TOKEN`.
  - `AGENTS.md`: remove references to the orchestrator engineering employee, `projects` table, `AgentVersion`, `delivery_instructions`, `generic-harness`, and the output-contract "absent = v1 legacy" note now that version is required. Update the output-contract versioning description to "version is required". Per the Documentation Freshness rule, reflect the dropped tables/columns and removed routes.
  - `README.md`: remove/adjust the deprecated orchestrator "Registering Projects" section and the `delivery_instructions` mentions; ensure the active employee list and admin endpoint table no longer list the removed `/admin/.../projects` routes.
  - `.env.example`: move `ADMIN_API_KEY`/`AGENT_VERSION_ID`/dead Jira OAuth vars to the DEPRECATED block or remove; keep both `.env`/`.env.example` in sync.

  **Must NOT do**: Do not remove docs for the KEPT per-employee Jira route or jira-motivation-bot.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`] — docs voice/tone + freshness conventions.

  **References**:
  - `render.yaml:29,57-64`; `CONTRIBUTING.md:27-34,162,422,459,475,486-517`; `AGENTS.md` (output-contract + reference tables); `README.md` deprecated sections; `.env.example` DEPRECATED block.

  **Acceptance Criteria**:
  - [ ] `rg -i "X-Admin-Key|ADMIN_API_KEY" CONTRIBUTING.md README.md` → zero matches
  - [ ] `render.yaml` no longer declares the dead vars
  - [ ] AGENTS.md output-contract section says version is required; no `delivery_instructions`/`generic-harness`/orchestrator references remain
  - [ ] `.env`/`.env.example` in sync

  **QA Scenarios**:

  ```
  Scenario: docs reflect the cleanup
    Tool: Bash (rg)
    Steps:
      1. Run: rg -i "X-Admin-Key|ADMIN_API_KEY|delivery_instructions|generic-harness" AGENTS.md README.md CONTRIBUTING.md render.yaml
    Expected Result: no output (exit 1)
    Evidence: .sisyphus/evidence/task-20-docs.txt
  ```

  **Commit**: Wave 8 — `docs: update AGENTS/README/CONTRIBUTING after compat cleanup`.

- [ ] 21. Notify completion (Telegram)

  **What to do**:
  - Per AGENTS.md Prometheus Planning rule, after all tasks complete and the final verification wave passes with user okay, send: `tsx scripts/telegram-notify.ts "✅ backwards-compat-cleanup complete — All tasks done, active employees verified Done in E2E. Come back to review."`

  **Must NOT do**: Do not send before the final verification wave + user okay.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**: AGENTS.md § Prometheus Planning — Telegram Notifications.

  **Acceptance Criteria**:
  - [ ] Telegram message sent (command exits 0)

  **QA Scenarios**:

  ```
  Scenario: completion notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ backwards-compat-cleanup complete ..."
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-21-telegram.txt
  ```

  **Commit**: NO.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1-F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": grep the codebase for the forbidden change (e.g. confirm `jira.ts` lines 1-133 intact, `archetype.risk_model` JSON column untouched, no hard row deletes) — reject with file:line if violated. Confirm `to_regclass` returns NULL for all 4 dropped tables. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm dashboard:build` + `pnpm prisma generate` + `pnpm lint` + `pnpm test:unit -- --run` + `pnpm test:integration`. Grep for residual `delivery_instructions`, `generic-harness`, `AGENT_VERSION_ID`, `X-Admin-Key`, `project_id`, `agent_versions`, `risk_models`, `departments`, `sendFixPrompt`, `cancelTaskByExternalId`, `APPROVED` (in output enum), legacy classify paths. Verify no `as any`/`@ts-ignore` added to silence removals.
      Output: `Build [PASS/FAIL] | Dashboard [PASS/FAIL] | Lint [PASS/FAIL] | Unit [N pass/N fail] | Integration [N pass/N fail] | Residual refs [N] | VERDICT`

- [ ] F3. **Real Live E2E QA** — `unspecified-high` (load `e2e-testing` skill)
      Single-gateway pre-flight. Execute live: jira-motivation-bot via real `/webhooks/jira/<tenantSlug>/jira-motivation-bot` webhook; daily-summarizer via `pnpm trigger-task`; guest-messaging inbound. Assert each reaches `status='Done'`; capture task IDs + `task_status_log`. Run `pnpm verify:e2e --task-id <uuid>` for each (proves `fix_iterations`/`agent_version_id` SQL fixes). Save to `.sisyphus/evidence/final-qa/`.
      Output: `jira-bot [Done? task-id] | summarizer [Done? task-id] | guest-msg [Done? task-id] | verify:e2e [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify 1:1 — everything scoped was removed, nothing beyond scope touched. Confirm KEEP list untouched (per-employee jira route, jira-motivation-bot, jira-client, risk_model JSON column). Detect contamination (a task touching files outside its scope) and unaccounted changes.
      Output: `Tasks [N/N compliant] | KEEP-list [INTACT/violated] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

-> Present consolidated F1-F4 results to user -> wait for explicit "okay" -> only then mark complete.

---

## Commit Strategy

Commit per wave (logical grouping), all via pre-commit hooks (never `--no-verify`):

- **Wave 1**: `refactor: remove delivery_instructions dead code and legacy shims`
- **Wave 2**: `refactor: collapse classify-message to StandardOutput-only parsing`
- **Wave 3**: `refactor: remove deprecated orchestrator scaffolding (projects, agent-version, global jira route)`
- **Wave 4**: `refactor: dereference dropped schema fields in types and seed`
- **Wave 5**: `refactor(db): drop unused orchestrator tables and columns`
- **Wave 8**: `docs: update AGENTS/README/CONTRIBUTING after compat cleanup`
- **Plans/evidence**: `chore(sisyphus): add backwards-compat-cleanup plan and evidence`

---

## Success Criteria

### Verification Commands

```bash
pnpm build && pnpm dashboard:build && pnpm prisma generate && pnpm lint   # all exit 0
pnpm test:unit -- --run                                                    # 0 failures
pnpm test:integration                                                      # 0 failures
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT to_regclass('public.projects'), to_regclass('public.departments'), to_regclass('public.agent_versions'), to_regclass('public.risk_models');"  # all NULL
rg -i "delivery_instructions|generic-harness|AGENT_VERSION_ID|X-Admin-Key" src/ scripts/ dashboard/src/  # only intentional matches
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (KEEP list intact)
- [ ] All active employees reach `Done` in live E2E with recorded task IDs
- [ ] All tests pass; build + dashboard build + prisma generate green
- [ ] Docs updated (AGENTS.md, README.md, CONTRIBUTING.md, render.yaml)
