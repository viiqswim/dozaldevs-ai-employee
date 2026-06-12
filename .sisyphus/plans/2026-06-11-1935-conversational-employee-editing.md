# Conversational Employee Editing — Chat-to-Edit AI Assistant Tab

## TL;DR

> **Quick Summary**: Add an "AI Assistant" tab to the employee detail page where a non-technical user types a plain-English change request, an AI proposes archetype edits (reusing the existing `refine()` engine), the user reviews a git-diff-style preview, and Approves / Denies / Refines — with a persisted before/after change history and one-click revert.
>
> **Deliverables**:
>
> - Backend: `identity` added to PATCH schema; new `archetype_edit_history` table + migration; a thin "propose-edit" endpoint wrapping `refine()` with a hard field allowlist; record/list/revert history endpoints.
> - Frontend: new `AssistantTab.tsx` chat shell, inline diff proposal cards (`react-diff-viewer-continued`), Approve/Deny/Refine loop, change-history list + revert, and an unsaved-changes (`beforeunload` + nav) guard.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (field-name + PATCH fix) → T2 (history table) → T5 (propose-edit endpoint) → T9 (AssistantTab) → T11 (approve+history) → Final Wave

---

## Context

### Original Request

Add a chat box on the employee detail page (`/dashboard/employees/:id?tenant=:tenantId`) so a non-technical user can request changes in plain English. The AI figures out the needed archetype changes, shows a git-diff-style preview, and the user can approve, deny, or ask for more changes — without manually editing identity/execution_steps/etc. Reuse popular OSS libraries (chat UI, diffs) where helpful.

### Interview Summary

**Key Decisions (locked with user)**:

- Apply mechanism: **Direct apply on Approve** → `PATCH /admin/tenants/:tenantId/archetypes/:id`.
- Editable scope (v1): **Core prose only** — `identity`, `execution_steps`, `delivery_steps` (+ `overview` kept in sync). NOT model/temperature/tool_registry/risk_model.
- Versioning: **NEW `archetype_edit_history` table**; history list + revert in the UI.
- UX: **Full chat panel as a NEW tab** (`?tab=assistant`); proposals appear as inline diff cards with Approve/Deny/Refine.
- Streaming: **NO** — simple request/response with a loading spinner.
- Chat persistence: **ephemeral** (in-memory per session); only approved changes persist.
- **Unsaved-changes guard**: `beforeunload` + in-app nav block while an unapproved proposal is pending.
- Tests: **tests-after for core logic + mandatory Playwright agent QA**.

**Research Findings (verified, file:line)**:

- **AI-edit engine ALREADY EXISTS**: `ArchetypeGenerator.refine(previousConfig, refinementInstruction, catalog?)` in `src/gateway/services/archetype-generator.ts`, driven by `REFINE_SYSTEM_PROMPT` (`src/gateway/services/prompts/archetype-generator-prompts.ts`). Route `POST /admin/tenants/:tenantId/archetypes/generate` (`src/gateway/routes/admin-archetype-generate.ts`) handles refine when body carries `previous_config` + `refinement_instruction`. Returns `GenerateArchetypeResponse`; does NOT persist. Dashboard client `refineArchetype()` exists at `dashboard/src/lib/gateway.ts:244`.
- **PATCH route** `PATCH /admin/tenants/:tenantId/archetypes/:archetypeId` (`src/gateway/routes/admin-archetypes.ts`, ~line 300). Auth `requireTenantRole(TenantRole.ADMIN)`, tenant-scoped via `findFirst({id, tenant_id})`. `patchArchetype()` client at `dashboard/src/lib/gateway.ts:138` (already lists `identity`, `execution_steps`, `delivery_steps`).
- **Detail page** `dashboard/src/panels/employees/EmployeeDetail.tsx`: URL-driven tabs (`searchParams.get('tab') ?? 'profile'`, `handleTabChange` ~line 28; `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` lines 241–277). Sibling tabs: `TrainingTab.tsx`, `DebugTab.tsx`, `sections/AdvancedTab.tsx`.
- **Stack** (`dashboard/package.json`): React 19, Vite 8, Tailwind 4, Radix/shadcn, react-router-dom 7, **react-markdown 10 + remark-gfm 4 already installed**, sonner 2 (toasts), lucide-react. No diff lib → add `react-diff-viewer-continued`.

### Metis Review (gaps addressed)

- **Field-name collision RESOLVED**: The harness compiles `execution_steps`, `identity`, `delivery_steps` (`execution-phase.mts:115,194`; `delivery-phase.mts:111`; `agents-md-compiler.mts:120`). `execution_instructions` is a SEPARATE platform-constant prompt — NOT the behavior prose. ⇒ PATCHing those columns DOES change runtime behavior. Must still be confirmed via a real task trigger in QA.
- **PATCH schema gap**: `PatchArchetypeBodySchema` is missing `identity` (execution_steps/delivery_steps present). Must add it + ensure it flows to `prisma.archetype.update()`.
- **Scope leakage**: `refine()` regenerates the WHOLE config + runs `applyModelAndEstimate()`. Must hard-allowlist to `identity, execution_steps, delivery_steps, overview`, both server-side (propose endpoint) and client-side (before diff).
- **Empty-field wipe**: refine can return `identity:''`. Guard: reject proposals where a previously-non-empty allowed field became empty.
- **before_json at apply time**: re-fetch archetype immediately before PATCH (last-write-wins for v1).
- **actor_user_id nullable**: `req.auth` is undefined under SERVICE_TOKEN → store null.
- **Revert = restore snapshot + append-only new history row**. Never mutate/hard-delete history (soft-delete column per repo convention).
- **Diff baseline = persisted archetype**, not previous proposal (refine loop shows cumulative change).
- **employee_rules note**: a request might belong in learned rules, not archetype prose — out of scope v1, documented only.

---

## Work Objectives

### Core Objective

Let non-technical users edit an AI employee's behavior conversationally — request → AI proposal → diff review → approve/deny/refine — with a persisted, revertible change history, by reusing the existing archetype refine engine and constraining edits to a safe field allowlist.

### Concrete Deliverables

- `identity` added to `PatchArchetypeBodySchema` and applied on PATCH.
- `archetype_edit_history` Prisma model + migration + PostgREST schema reload.
- `POST /admin/tenants/:tenantId/archetypes/:id/propose-edit` — wraps `refine()`, strips to allowlist, returns `{ proposal, changed_fields, baseline }`.
- `POST /admin/tenants/:tenantId/archetypes/:id/edit-history` (record), `GET …/edit-history` (list), `POST …/edit-history/:historyId/revert` (revert).
- `dashboard/src/panels/employees/AssistantTab.tsx` + supporting components (chat shell, `ProposalDiffCard`, `EditHistoryList`) and a `useUnsavedChangesGuard` hook.
- New tab wired into `EmployeeDetail.tsx` as `?tab=assistant`.
- `react-diff-viewer-continued` dependency added.

### Definition of Done

- [ ] On the detail page, a user can type a request, see a diff proposal, and Approve → the archetype prose is updated in the DB and reflected in a freshly-triggered task's compiled AGENTS.md.
- [ ] Refine and Deny loops behave correctly (cumulative diff vs persisted baseline; Deny applies nothing).
- [ ] Every approved/reverted change is recorded in `archetype_edit_history`; the history list renders and Revert works.
- [ ] Disallowed fields (model, tool_registry, risk_model, temperature) are never changed by this flow.
- [ ] `pnpm test:unit` and `pnpm --dir dashboard test` pass; `pnpm lint` and `pnpm build` clean.

### Must Have

- Hard field allowlist (`identity`, `execution_steps`, `delivery_steps`, `overview`) enforced server-side AND client-side.
- before/after snapshots in `archetype_edit_history`; append-only; tenant + archetype + soft-delete scoped.
- Unsaved-changes guard active only while an unapproved proposal is pending.
- Non-technical, plain-language UI copy; card shells; existing component conventions.

### Must NOT Have (Guardrails)

- NO streaming responses.
- NO editing of `model`, `temperature`, `tool_registry`, `risk_model`, `role_name`, `vm_size`, `concurrency_limit`, `input_schema` via this chat.
- NO persisting chat transcripts to the DB (ephemeral only).
- NO new LLM prompt/engine — reuse `refine()` (a thin wrapper endpoint is allowed).
- NO Slack-routed approval, NO multi-proposal batch apply, NO concurrency-lock system (last-write-wins v1).
- NO hard-deleting or mutating any `archetype_edit_history` row after creation.
- NO `overview` drift — if prose changes are applied, include regenerated `overview` in the same PATCH.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest + React Testing Library in `dashboard/`; Vitest in root for gateway).
- **Automated tests**: Tests-after — unit tests written after each core-logic task.
- **Framework**: Vitest (`pnpm test:unit` for gateway; `pnpm --dir dashboard test` for dashboard).

### QA Policy

Every task includes agent-executed QA. Evidence to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Frontend/UI**: Playwright on `localhost:7700/dashboard/...` (use existing real-Chrome/CDP pattern if WebGL/headless issues arise; this dashboard is plain so headless is fine).
- **API/Backend**: Bash `curl` with `Authorization: Bearer $SERVICE_TOKEN`, assert status + DB rows via `psql postgresql://postgres:postgres@localhost:54322/ai_employee`.
- **Real no-op check**: after applying an `execution_steps` edit, trigger a task and assert the compiled AGENTS.md / DB column reflects it (not just the UI).

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Confirm field mapping + add `identity` to PATCH schema [quick]
├── Task 2: archetype_edit_history Prisma model + migration + PostgREST reload [quick]
├── Task 3: Add react-diff-viewer-continued dep + ProposalDiffCard (presentational) [visual-engineering]
└── Task 4: useUnsavedChangesGuard hook (standalone) [quick]

Wave 2 (Backend + UI scaffolding — after Wave 1):
├── Task 5: propose-edit endpoint (wraps refine, allowlist, empty-guard) (deps: 1) [deep]
├── Task 6: edit-history record + list endpoints (deps: 2) [unspecified-high]
├── Task 7: edit-history revert endpoint (deps: 2) [unspecified-high]
└── Task 8: dashboard gateway.ts client fns (proposeEdit, recordEditHistory, listEditHistory, revertEdit) (deps: 1,2) [quick]

Wave 3 (Frontend assembly — after Wave 2):
├── Task 9: AssistantTab chat shell + message list (deps: 3,4,8) [visual-engineering]
├── Task 10: Wire propose-edit + Refine loop into chat (deps: 5,8,9) [visual-engineering]
├── Task 11: Approve flow → patchArchetype + recordEditHistory (deps: 6,8,10) [deep]
└── Task 12: EditHistoryList + Revert UI (deps: 7,8,9) [visual-engineering]

Wave 4 (Integration — after Wave 3):
├── Task 13: Mount AssistantTab as ?tab=assistant in EmployeeDetail.tsx (deps: 9-12) [quick]
└── Task 14: Docs update (AGENTS.md endpoints + admin API table + employee detail) (deps: 13) [writing]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA incl. real-trigger no-op check + Playwright assistant E2E (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> user okay -> Notify completion

Critical Path: T1 → T2 → T5 → T9 → T11 → T13 → F1-F4 → user okay
Max Concurrent: 4
```

### Dependency Matrix

- **1**: deps — / blocks 5, 8
- **2**: deps — / blocks 6, 7, 8
- **3**: deps — / blocks 9
- **4**: deps — / blocks 9
- **5**: deps 1 / blocks 10
- **6**: deps 2 / blocks 11
- **7**: deps 2 / blocks 12
- **8**: deps 1, 2 / blocks 9, 10, 11, 12
- **9**: deps 3, 4, 8 / blocks 10, 11, 12, 13
- **10**: deps 5, 8, 9 / blocks 11, 13
- **11**: deps 6, 8, 10 / blocks 13
- **12**: deps 7, 8, 9 / blocks 13
- **13**: deps 9, 10, 11, 12 / blocks 14
- **14**: deps 13 / blocks Final Wave

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `quick`, T3 → `visual-engineering`, T4 → `quick`
- **Wave 2**: T5 → `deep`, T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `quick`
- **Wave 3**: T9 → `visual-engineering`, T10 → `visual-engineering`, T11 → `deep`, T12 → `visual-engineering`
- **Wave 4**: T13 → `quick`, T14 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Confirm field mapping and add `identity` to the PATCH schema

  **What to do**:
  - Confirm (read-verify) that the harness compiles the employee's behavior from `identity`, `execution_steps`, `delivery_steps` (NOT `execution_instructions`): check `src/workers/lib/execution-phase.mts` (~115,194), `src/workers/lib/delivery-phase.mts` (~111), `src/workers/lib/agents-md-compiler.mts` (~120). Record the finding in the task notepad.
  - In `src/gateway/routes/admin-archetypes.ts`, add `identity: z.string().max(10000).nullable().optional()` to `PatchArchetypeBodySchema`.
  - Ensure `identity` flows into the `prisma.archetype.update()` data (verify it's not excluded from the destructured spread; add explicitly if the handler enumerates fields).
  - Add a unit test proving PATCH with `identity` persists it.

  **Must NOT do**:
  - Do NOT touch `execution_instructions` handling or the `instructions`→`execution_instructions` mapping.
  - Do NOT add any other new fields to the schema.

  **Recommended Agent Profile**:
  - **Category**: `quick` — small, well-scoped schema + test change.
  - **Skills**: [`api-design`] — Zod validation + sendError/sendSuccess conventions for this route.
  - **Skills Evaluated but Omitted**: `prisma` (no schema change here, only Zod).

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 5, 8 · Blocked By: None.

  **References**:
  - `src/gateway/routes/admin-archetypes.ts` (~line 40–67 `PatchArchetypeBodySchema`; ~line 300+ PATCH handler) — add field here; `execution_steps`/`delivery_steps` are the model to mirror.
  - `src/workers/lib/execution-phase.mts:115,194`, `delivery-phase.mts:111`, `agents-md-compiler.mts:120` — proof that these columns drive runtime behavior.
  - WHY: the dashboard `patchArchetype()` (`dashboard/src/lib/gateway.ts:138`) ALREADY sends `identity`, but the gateway silently drops it without this fix — the central enabling change.

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit` includes a new test: PATCH body `{identity:"X"}` → 200 and `SELECT identity` returns `"X"`.

  **QA Scenarios**:

  ```
  Scenario: identity persists via PATCH (happy path)
    Tool: Bash (curl + psql)
    Preconditions: gateway running; a known archetype id + tenant id; $SERVICE_TOKEN set
    Steps:
      1. curl -X PATCH localhost:7700/admin/tenants/$T/archetypes/$A -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" -d '{"identity":"QA persona ABC"}'  -> 200
      2. psql ... -c "SELECT identity FROM archetypes WHERE id='$A';"
    Expected Result: row identity == "QA persona ABC"
    Failure Indicators: 200 but identity unchanged (schema drop not fixed); 400 (schema rejects)
    Evidence: .sisyphus/evidence/task-1-identity-patch.txt

  Scenario: invalid identity type rejected (negative)
    Tool: Bash (curl)
    Preconditions: same
    Steps:
      1. curl -X PATCH ... -d '{"identity": 123}' -> expect 400
    Expected Result: 400 with validation error; DB identity unchanged
    Evidence: .sisyphus/evidence/task-1-identity-reject.txt
  ```

  **Commit**: YES — `feat(archetypes): allow identity in PATCH schema`; Files: `src/gateway/routes/admin-archetypes.ts`, test; Pre-commit: `pnpm test:unit && pnpm lint`.

- [ ] 2. Create `archetype_edit_history` table (Prisma model + migration + PostgREST reload)

  **What to do**:
  - Add an `ArchetypeEditHistory` model to `prisma/schema.prisma`: `id (uuid pk)`, `archetype_id (uuid)`, `tenant_id (uuid)`, `request_text (Text)`, `before_json (Json)`, `after_json (Json)`, `changed_fields (Json — string[])`, `kind (String — 'edit' | 'revert')`, `actor_user_id (String? — nullable)`, `created_at (default now)`, `deleted_at (DateTime?)`. Add a relation to `Archetype` if other models follow that pattern; index `[archetype_id, created_at]` and `[tenant_id]`.
  - Generate the migration and apply it; then reload the PostgREST schema cache (`NOTIFY pgrst, 'reload schema'`).
  - **Back up the DB first** per AGENTS.md before any migration on the dev DB.

  **Must NOT do**:
  - Do NOT add a chat-message/transcript table (ephemeral chat — out of scope).
  - Do NOT make `actor_user_id` non-nullable.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single model + migration following established patterns.
  - **Skills**: [`prisma`] — migration workflow, soft-delete rule, schema-cache reload, ai_employee DB name.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 6, 7, 8 · Blocked By: None.

  **References**:
  - `prisma/schema.prisma` — `Archetype` model (~171–219) and any existing audit-style table (e.g. `AgentVersion` ~270, `task_composio_calls`) for column/relation conventions and soft-delete pattern.
  - AGENTS.md § "Database Backup" and § `prisma` skill — mandatory backup + PostgREST reload.
  - WHY: this table is the source of truth for the history list + revert; append-only + soft-delete + tenant scoping are repo invariants.

  **Acceptance Criteria**:
  - [ ] `pnpm prisma migrate status` shows the new migration applied.
  - [ ] `psql ... -c "\d archetype_edit_history"` lists all columns with correct types and `deleted_at` nullable.

  **QA Scenarios**:

  ```
  Scenario: table exists with correct shape (happy path)
    Tool: Bash (psql)
    Steps:
      1. psql ... -c "\d archetype_edit_history"
      2. psql ... -c "INSERT INTO archetype_edit_history (id, archetype_id, tenant_id, request_text, before_json, after_json, changed_fields, kind, created_at) VALUES (gen_random_uuid(), '$A', '$T', 'qa', '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, 'edit', now()); SELECT count(*) FROM archetype_edit_history WHERE archetype_id='$A';"
    Expected Result: columns present; insert succeeds; count >= 1
    Evidence: .sisyphus/evidence/task-2-table.txt

  Scenario: PostgREST sees the table (negative-of-stale-cache)
    Tool: Bash (curl)
    Steps:
      1. curl "http://localhost:54331/archetype_edit_history?limit=1" -H "apikey: ..." -> 200 (not 404 "relation does not exist")
    Expected Result: 200; proves schema reload worked
    Evidence: .sisyphus/evidence/task-2-postgrest.txt
  ```

  **Commit**: YES — `feat(db): add archetype_edit_history table`; Files: `prisma/schema.prisma`, `prisma/migrations/**`; Pre-commit: `pnpm build`.

- [ ] 3. Add `react-diff-viewer-continued` + build `ProposalDiffCard` (presentational)

  **What to do**:
  - `pnpm --dir dashboard add react-diff-viewer-continued`.
  - Create `dashboard/src/panels/employees/sections/ProposalDiffCard.tsx`: props `{ changedFields: {field: string; before: string; after: string}[]; onApprove; onDeny; onRefineSubmit?(text); busy?: boolean }`. For each changed field render a labeled (plain-language: "Personality", "How it works", "How it delivers") `ReactDiffViewer` with `compareMethod={DiffMethod.WORDS}`, `splitView={false}` (inline) plus a toggle for side-by-side. Wrap in a card shell (`rounded-lg border bg-card px-5 py-4`). Approve / Deny / "Ask for more changes" buttons (shadcn `Button`), with `busy` disabling them.
  - Pure presentational — no fetching. Map DB field names → friendly labels.

  **Must NOT do**:
  - Do NOT fetch or call the gateway here.
  - Do NOT show disallowed fields (model/tools/etc.) even if passed — render only identity/execution_steps/delivery_steps/overview.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — focused UI component, Tailwind/shadcn.
  - **Skills**: [`react-dashboard`] — card shells, component conventions, non-technical copy.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 9 · Blocked By: None.

  **References**:
  - `dashboard/src/panels/employees/sections/*.tsx` (e.g. `ExecutionStepsSection.tsx`) — card-shell + section styling to mirror.
  - react-diff-viewer-continued: `DiffMethod.WORDS` for prose; `styles` prop accepts class overrides; `splitView` toggles inline/side-by-side.
  - WHY: this is the review surface non-technical users see; word-level prose diff + friendly labels are the UX core.

  **Acceptance Criteria**:
  - [ ] `pnpm --dir dashboard test` includes an RTL test: given two changed fields, the card renders both diffs and fires `onApprove`/`onDeny` on click.

  **QA Scenarios**:

  ```
  Scenario: renders inline word diff + buttons (happy path)
    Tool: Bash (vitest via dashboard) then Playwright on a storybook-less render harness OR the live tab in a later task
    Steps:
      1. pnpm --dir dashboard test ProposalDiffCard -> PASS
    Expected Result: test asserts <ins>/<del> or diff rows present for changed text; click Approve calls onApprove
    Evidence: .sisyphus/evidence/task-3-diffcard-test.txt

  Scenario: disallowed field ignored (negative)
    Tool: vitest
    Steps:
      1. Pass a changedFields entry with field='model' -> assert it is NOT rendered
    Expected Result: only identity/execution_steps/delivery_steps/overview render
    Evidence: .sisyphus/evidence/task-3-diffcard-allowlist.txt
  ```

  **Commit**: YES — `feat(dashboard): add diff viewer + ProposalDiffCard`; Files: `dashboard/package.json`, `ProposalDiffCard.tsx`, test; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [ ] 4. Build `useUnsavedChangesGuard` hook (standalone)

  **What to do**:
  - Create `dashboard/src/lib/use-unsaved-changes-guard.ts` (or `dashboard/src/hooks/`): `useUnsavedChangesGuard(active: boolean, message?: string)`. When `active`: register a `beforeunload` listener that sets `e.preventDefault()` + `e.returnValue = message` (browser-native confirm on refresh/close); AND block React-Router-7 in-app navigation using `useBlocker` (react-router-dom 7) so switching tabs / back nav prompts a confirm. When `active` is false: remove listeners / disarm blocker. Clean up on unmount.
  - Default message: plain language, e.g. "You have an unsent change request. If you leave, it will be lost."

  **Must NOT do**:
  - Do NOT arm the guard globally — it must be toggled by `active` (only while an unapproved proposal/in-progress chat exists).
  - Do NOT block navigation after approve/deny (callers pass `active=false`).

  **Recommended Agent Profile**:
  - **Category**: `quick` — small isolated hook + test.
  - **Skills**: [`react-dashboard`] — dashboard conventions.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 9 · Blocked By: None.

  **References**:
  - react-router-dom 7 `useBlocker` API (in-app nav blocking) + native `beforeunload`.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx` — uses `useSearchParams`; the guard must cooperate with tab switching there.
  - WHY: user explicitly requested a "don't lose your changes" confirm on refresh/exit.

  **Acceptance Criteria**:
  - [ ] RTL/unit test: with `active=true`, a `beforeunload` event has its default prevented; with `active=false`, it does not.

  **QA Scenarios**:

  ```
  Scenario: guard arms only when active (happy + negative)
    Tool: vitest (dashboard)
    Steps:
      1. Render a test component using the hook with active=true; dispatch beforeunload -> assert defaultPrevented true
      2. Rerender with active=false; dispatch beforeunload -> assert defaultPrevented false
    Expected Result: both assertions pass
    Evidence: .sisyphus/evidence/task-4-guard-test.txt
  ```

  **Commit**: YES — `feat(dashboard): add useUnsavedChangesGuard hook`; Files: hook + test; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [ ] 5. Build the `propose-edit` endpoint (wraps `refine()`, enforces allowlist + empty-guard)

  **What to do**:
  - Add `POST /admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit` (new route module or extend `admin-archetype-generate.ts`). Body: `{ request_text: string (min 1, max 500) }`. Auth `requireTenantRole(TenantRole.ADMIN)`, tenant-scoped fetch of the archetype (404 if mismatch).
  - Map the DB archetype row → `GenerateArchetypeResponse` shape (the input `refine()` expects): include `role_name`, `identity`, `execution_steps`, `delivery_steps`, plus passthrough fields it needs. Call `generator.refine(mappedPrevious, request_text, catalog)`.
  - **Hard allowlist**: from the refine result, keep ONLY `identity`, `execution_steps`, `delivery_steps`, `overview`. Discard `model`, `role_name`, `tool_registry`, `risk_model`, `temperature`, `concurrency_limit`, `vm_size`, `estimated_manual_minutes`, `input_schema`, etc.
  - **Empty-field guard**: for each allowlisted field, if it was non-empty in the current archetype but the proposal makes it empty/whitespace, reject that field (or the whole proposal) with a clear error — never propose wiping persona/steps.
  - Compute `changed_fields`: only fields whose value actually differs from the current persisted archetype.
  - Respond `{ baseline: {identity, execution_steps, delivery_steps, overview}, proposal: {…same keys…}, changed_fields: string[] }`. If `changed_fields` is empty, respond with a flag so the UI can say "no change needed".
  - Use `sendError`/`sendSuccess`. Unit-test the allowlist + empty-guard + changed_fields logic with a mocked `refine`.

  **Must NOT do**:
  - Do NOT persist anything here (preview only).
  - Do NOT pass disallowed fields through, even if `refine()` changed them.
  - Do NOT build a new LLM prompt/engine — reuse `generator.refine`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — the allowlist/empty-guard/mapping logic is the highest-risk correctness surface.
  - **Skills**: [`api-design`, `data-access-conventions`] — route conventions; repository/PostgREST + tenant-scope rules.

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 10 · Blocked By: 1.

  **References**:
  - `src/gateway/services/archetype-generator.ts` — `refine(previousConfig, refinementInstruction, catalog?)`, `GenerateArchetypeResponse` shape; note `postProcess` may set fields to `''`.
  - `src/gateway/routes/admin-archetype-generate.ts` — existing generate/refine route: how `previous_config`+`refinement_instruction` are validated, how `callLLM`+`prisma` are injected, catalog fetch.
  - `src/gateway/routes/admin-archetypes.ts` — GET-by-id / tenant-scope pattern; `sendError`/`sendSuccess`.
  - WHY: `refine()` regenerates the WHOLE config; without this server-side strip, model/tool changes could reach the diff and the PATCH.

  **Acceptance Criteria**:
  - [ ] Unit tests: (a) refine result with changed `model`+`tool_registry` → response `proposal` contains NEITHER and `changed_fields` excludes them; (b) refine returns `identity:''` while current is non-empty → 4xx / field rejected; (c) `changed_fields` lists only genuinely different allowlisted fields.

  **QA Scenarios**:

  ```
  Scenario: propose returns allowlisted diff only (happy path)
    Tool: Bash (curl)
    Steps:
      1. curl -X POST .../archetypes/$A/propose-edit -H "Authorization: Bearer $SERVICE_TOKEN" -d '{"request_text":"make replies shorter and friendlier"}'
    Expected Result: 200; JSON has baseline+proposal+changed_fields; proposal keys ⊆ {identity,execution_steps,delivery_steps,overview}; no model/tool_registry keys
    Evidence: .sisyphus/evidence/task-5-propose.json

  Scenario: empty-field guard (negative)
    Tool: vitest (mock refine to return identity:'')
    Steps:
      1. call handler with current identity non-empty -> assert rejection, no empty identity in proposal
    Expected Result: field rejected / 4xx; persona never wiped
    Evidence: .sisyphus/evidence/task-5-empty-guard.txt
  ```

  **Commit**: YES — `feat(archetypes): add propose-edit endpoint with field allowlist`; Pre-commit: `pnpm test:unit && pnpm lint`.

- [ ] 6. Build edit-history **record + list** endpoints

  **What to do**:
  - `POST /admin/tenants/:tenantId/archetypes/:archetypeId/edit-history` — body `{ request_text, before_json, after_json, changed_fields, kind: 'edit' }`. Auth ADMIN, tenant-scoped. Insert a row with `actor_user_id = req.auth?.id ?? null` (nullable for SERVICE_TOKEN). Return the created row.
  - `GET /admin/tenants/:tenantId/archetypes/:archetypeId/edit-history` — list rows for `{tenant_id, archetype_id, deleted_at IS NULL}`, ordered `created_at desc`, with a sensible `limit` (e.g. 50) + optional pagination param.
  - Use the repository/PostgREST conventions (or a thin `ArchetypeEditHistoryRepository`); `sendError`/`sendSuccess`. Unit test insert + tenant-scoped list.

  **Must NOT do**:
  - Do NOT allow cross-tenant reads/writes.
  - Do NOT mutate/overwrite existing rows.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — two endpoints + repository + tests.
  - **Skills**: [`api-design`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 11 · Blocked By: 2.

  **References**:
  - `src/repositories/` (e.g. `TaskRepository`) — tenant-scoped repository pattern + soft-delete filter.
  - `src/gateway/routes/admin-archetypes.ts` / `admin-reads.ts` — route + Zod param + tenant-scope patterns.
  - WHY: append-only audit trail powering the history list; nullable actor + tenant scoping are the correctness invariants.

  **Acceptance Criteria**:
  - [ ] Unit test: record with JWT → `actor_user_id` set; record with SERVICE_TOKEN → `actor_user_id IS NULL`. List returns only the caller-tenant's rows.

  **QA Scenarios**:

  ```
  Scenario: record + list (happy path)
    Tool: Bash (curl + psql)
    Steps:
      1. curl -X POST .../edit-history -d '{"request_text":"qa","before_json":{...},"after_json":{...},"changed_fields":["identity"],"kind":"edit"}' -> 201
      2. curl .../edit-history -> array contains the row
    Evidence: .sisyphus/evidence/task-6-history.json

  Scenario: tenant isolation (negative)
    Tool: Bash (curl)
    Steps:
      1. GET tenant B's edit-history for an archetype owned by tenant A -> 404/empty, never tenant A rows
    Evidence: .sisyphus/evidence/task-6-tenant-iso.txt

  Scenario: service-token actor null
    Tool: Bash (curl + psql)
    Steps:
      1. POST with Bearer $SERVICE_TOKEN -> 201; psql assert actor_user_id IS NULL
    Evidence: .sisyphus/evidence/task-6-actor-null.txt
  ```

  **Commit**: YES — `feat(archetypes): add edit-history record + list endpoints`; Pre-commit: `pnpm test:unit && pnpm lint`.

- [ ] 7. Build edit-history **revert** endpoint

  **What to do**:
  - `POST /admin/tenants/:tenantId/archetypes/:archetypeId/edit-history/:historyId/revert` — Auth ADMIN, tenant-scoped. Fetch the target history row (scoped). Re-fetch the CURRENT archetype, snapshot it as `before_json`. PATCH the archetype's allowlisted fields back to the values in the target row's `before_json` (restore-snapshot semantics). Record a NEW append-only history row with `kind: 'revert'`, `request_text` like `"Revert to change from <created_at>"`, `before_json` = current snapshot, `after_json` = restored values, `changed_fields` = fields that differed, `actor_user_id = req.auth?.id ?? null`.
  - Reuse the same allowlist + apply path the Approve flow uses (factor a shared helper if convenient). `sendError`/`sendSuccess`. Unit test.

  **Must NOT do**:
  - Do NOT delete/modify the target history row (append-only).
  - Do NOT restore disallowed fields.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — endpoint + shared apply helper + test.
  - **Skills**: [`api-design`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 12 · Blocked By: 2.

  **References**:
  - Task 6 record endpoint + Task 1 PATCH path — shared apply/record logic.
  - WHY: revert must be safe (snapshot-at-apply, append-only) so non-technical users can undo without data loss.

  **Acceptance Criteria**:
  - [ ] Unit test: after revert, archetype allowlisted fields == target `before_json`; history count increases by 1; original row unchanged.

  **QA Scenarios**:

  ```
  Scenario: revert restores snapshot + appends row (happy path)
    Tool: Bash (curl + psql)
    Steps:
      1. Apply an edit (records row R1 with before_json B). 2. POST revert R1.
      2. psql assert archetype identity/execution_steps == B; assert history count +1; assert R1 row still present/unmodified
    Evidence: .sisyphus/evidence/task-7-revert.txt

  Scenario: cross-tenant revert blocked (negative)
    Tool: Bash (curl)
    Steps:
      1. tenant B reverts tenant A's history row -> 404; no change to A's archetype
    Evidence: .sisyphus/evidence/task-7-revert-tenant.txt
  ```

  **Commit**: YES — `feat(archetypes): add edit-history revert endpoint`; Pre-commit: `pnpm test:unit && pnpm lint`.

- [ ] 8. Add dashboard gateway client functions

  **What to do**:
  - In `dashboard/src/lib/gateway.ts`, add: `proposeEdit(tenantId, archetypeId, requestText)` → POST propose-edit; `recordEditHistory(tenantId, archetypeId, payload)` → POST edit-history; `listEditHistory(tenantId, archetypeId)` → GET edit-history; `revertEdit(tenantId, archetypeId, historyId)` → POST revert. Add matching TS types in `dashboard/src/lib/types.ts` (`ProposalResponse`, `EditHistoryRow`).
  - Mirror the existing `gatewayFetch` wrapper style (see `patchArchetype`, `refineArchetype`).

  **Must NOT do**:
  - Do NOT inline fetch — use `gatewayFetch`.

  **Recommended Agent Profile**:
  - **Category**: `quick` — thin client functions + types.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 9, 10, 11, 12 · Blocked By: 1, 2.

  **References**:
  - `dashboard/src/lib/gateway.ts:138 patchArchetype`, `:244 refineArchetype` — the exact client pattern + `gatewayFetch` usage.
  - `dashboard/src/lib/types.ts` — where Archetype/response types live.
  - WHY: every frontend task depends on these typed client calls.

  **Acceptance Criteria**:
  - [ ] `pnpm --dir dashboard build` (tsc) passes with the new functions/types referenced.

  **QA Scenarios**:

  ```
  Scenario: client functions typecheck + hit endpoints (happy path)
    Tool: Bash (tsc) + Playwright network assert in later tab task
    Steps:
      1. pnpm --dir dashboard build -> no TS errors
    Expected Result: compiles; functions exported
    Evidence: .sisyphus/evidence/task-8-client-build.txt
  ```

  **Commit**: YES — `feat(dashboard): add edit-assistant gateway client fns`; Pre-commit: `pnpm --dir dashboard build && pnpm lint`.

- [ ] 9. Build `AssistantTab` chat shell + message list

  **What to do**:
  - Create `dashboard/src/panels/employees/AssistantTab.tsx`, props `{ archetype: Archetype; tenantId: string; onSaved: () => void }` (mirror `TrainingTab`/`DebugTab` signatures).
  - Render a conversational thread: an ephemeral in-memory `messages` state (`{id, role: 'user'|'assistant', kind: 'text'|'proposal', text?, proposal?}`). User messages right-aligned; assistant messages left, rendered with `react-markdown` + `remark-gfm` (already installed). An input box (textarea + Send) at the bottom; Enter submits, Shift+Enter newline. Auto-scroll to newest. Loading spinner row while awaiting a proposal.
  - Wrap the panel in a card shell; plain-language empty state ("Ask me to change how this employee works — for example, 'make replies shorter'.").
  - Wire `useUnsavedChangesGuard(active)` where `active` = there is a pending (unapproved) proposal OR an in-flight request. (Approve/deny flows land in T10–T12; here just expose the `active` state + guard.)
  - No backend calls yet beyond a stub submit handler prop the next tasks fill in (or include `proposeEdit` call here and let T10 extend — keep T9 to shell + render + guard).

  **Must NOT do**:
  - Do NOT persist messages to the DB.
  - Do NOT add streaming.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — primary UI surface.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 10, 11, 12, 13 · Blocked By: 3, 4, 8.

  **References**:
  - `dashboard/src/panels/employees/TrainingTab.tsx`, `DebugTab.tsx` — tab component structure/props.
  - `ProposalDiffCard.tsx` (T3), `useUnsavedChangesGuard` (T4), gateway client (T8).
  - react-markdown + remark-gfm already in `package.json` — use the `components` prop to Tailwind-style markdown.
  - WHY: this is the container that hosts the whole chat-to-edit experience.

  **Acceptance Criteria**:
  - [ ] RTL test: typing + submit appends a user message; assistant proposal message renders a `ProposalDiffCard`; guard arms while a proposal is pending.

  **QA Scenarios**:

  ```
  Scenario: chat shell renders + guard arms (happy path)
    Tool: Playwright (in T13 once mounted) / vitest RTL here
    Steps:
      1. Render AssistantTab; type "make replies shorter"; submit -> user bubble appears; spinner shows
    Expected Result: message list + input behave; guard active while pending
    Evidence: .sisyphus/evidence/task-9-shell.txt
  ```

  **Commit**: YES — `feat(dashboard): add AI assistant tab chat shell`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [ ] 10. Wire propose-edit + Refine loop into the chat

  **What to do**:
  - On Send: call `proposeEdit(tenantId, archetype.id, requestText)`; show spinner; on success push an assistant `proposal` message containing the `ProposalDiffCard` (diffing `baseline` vs `proposal` for each `changed_fields`). If `changed_fields` is empty, push a friendly assistant text message ("It looks like no change is needed for that.").
  - **Refine loop**: "Ask for more changes" on a proposal card opens an input; submitting calls `proposeEdit` AGAIN with the new request_text — but the diff baseline stays the CURRENT PERSISTED archetype (re-fetch the archetype, or use the latest persisted values), so the new proposal shows cumulative change vs persisted, not vs the previous proposal. Replace/append a new proposal card; only ONE pending proposal is "active" at a time.
  - Error handling: surface gateway errors via `sonner` toast; clear spinner.

  **Must NOT do**:
  - Do NOT diff against the previous proposal (must be vs persisted baseline).
  - Do NOT allow two pending proposals to both be approvable.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — stateful chat wiring.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 11, 13 · Blocked By: 5, 8, 9.

  **References**:
  - T5 propose-edit response shape `{baseline, proposal, changed_fields}`; T8 `proposeEdit`.
  - `sonner` (`toast`) already used in the dashboard for notifications.
  - WHY: the refine loop is the "ask for more changes" requirement; baseline correctness avoids misleading approvals.

  **Acceptance Criteria**:
  - [ ] RTL/Playwright: first request renders a proposal; "Ask for more changes" produces a second proposal whose diff is vs the persisted baseline.

  **QA Scenarios**:

  ```
  Scenario: propose + refine cumulative (happy path)
    Tool: Playwright (validated fully in Final Wave)
    Steps:
      1. Submit request A -> proposal P1 (diff vs persisted). 2. Refine with B -> proposal P2 diff vs persisted (NOT vs P1).
    Expected Result: P2 reflects A+B cumulative vs baseline
    Evidence: .sisyphus/evidence/task-10-refine.txt
  ```

  **Commit**: YES — `feat(dashboard): wire propose + refine loop`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [ ] 11. Approve flow → patchArchetype + recordEditHistory

  **What to do**:
  - On Approve of a proposal: build the PATCH body from the allowlisted `proposal` fields ONLY (`identity`, `execution_steps`, `delivery_steps`, plus `overview`). Re-fetch the current archetype to capture `before_json` immediately before applying. Call `patchArchetype(tenantId, archetype.id, body)`. On success, call `recordEditHistory(...)` with `{request_text, before_json, after_json: appliedFields, changed_fields, kind:'edit'}`. Show a `sonner` success toast ("Change applied to your employee."). Mark the proposal as applied (no longer pending) → guard disarms. Call `onSaved()` so the parent refreshes archetype data.
  - **Client-side allowlist re-assert**: even though the server stripped, explicitly construct the PATCH body from a fixed allowlist constant so no stray fields leak.
  - On Deny: discard the pending proposal (push a small "Discarded." assistant note); guard disarms; nothing persisted.

  **Must NOT do**:
  - Do NOT include disallowed fields in the PATCH body.
  - Do NOT record history on Deny.

  **Recommended Agent Profile**:
  - **Category**: `deep` — apply correctness + history recording + guard state.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 13 · Blocked By: 6, 8, 10.

  **References**:
  - `dashboard/src/lib/gateway.ts:138 patchArchetype` (supports identity after T1), T6 `recordEditHistory`, T8 client fns.
  - WHY: this is where changes actually persist + get audited; the allowlist re-assert is the last guard against scope leakage.

  **Acceptance Criteria**:
  - [ ] After Approve in a test, `patchArchetype` is called with ONLY allowlisted keys, and `recordEditHistory` is called once. Deny calls neither.

  **QA Scenarios**:

  ```
  Scenario: approve applies + records (happy path) — verified in Final Wave end-to-end
    Tool: Playwright + psql
    Steps:
      1. Approve a proposal -> success toast; reload -> profile shows new text; psql archetype reflects change; history count +1
    Evidence: .sisyphus/evidence/task-11-approve.txt

  Scenario: deny persists nothing (negative)
    Tool: Playwright + psql
    Steps:
      1. Deny a proposal -> psql archetype unchanged; history count unchanged
    Evidence: .sisyphus/evidence/task-11-deny.txt
  ```

  **Commit**: YES — `feat(dashboard): approve applies change + records history`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [ ] 12. Build `EditHistoryList` + Revert UI

  **What to do**:
  - Create `dashboard/src/panels/employees/sections/EditHistoryList.tsx`: on mount call `listEditHistory(tenantId, archetype.id)`; render each entry in a card shell — request text, timestamp (friendly relative time, reuse existing util), changed fields as friendly labels, a "View changes" expander showing the before→after diff (`ProposalDiffCard` in read-only/no-buttons mode or a compact diff), and a **Revert** button. Revert → confirm → `revertEdit(...)` → toast → refresh list + call `onSaved()`. Distinguish `kind: 'revert'` rows visually.
  - Place the history list within the Assistant tab (below the chat, or a sub-section/toggle).

  **Must NOT do**:
  - Do NOT show disallowed fields in the historical diff.
  - Do NOT allow editing/deleting history entries.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 13 · Blocked By: 7, 8, 9.

  **References**:
  - T7 `revertEdit`, T8 `listEditHistory`, T3 `ProposalDiffCard` (read-only variant), existing relative-time util (`dashboard/src/tests/format-relative-time.test.ts` implies a util exists).
  - WHY: history + revert is the trust/safety feature for non-technical users.

  **Acceptance Criteria**:
  - [ ] RTL test: list renders entries; clicking Revert calls `revertEdit` and refreshes.

  **QA Scenarios**:

  ```
  Scenario: history list + revert (happy path) — full check in Final Wave
    Tool: Playwright + psql
    Steps:
      1. Open history -> entry for prior edit visible. 2. Revert -> confirm -> archetype text returns to prior value; new 'revert' entry appears
    Evidence: .sisyphus/evidence/task-12-history-ui.txt
  ```

  **Commit**: YES — `feat(dashboard): edit history list + revert UI`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [ ] 13. Mount `AssistantTab` as `?tab=assistant` on the employee detail page

  **What to do**:
  - In `dashboard/src/panels/employees/EmployeeDetail.tsx`: import `AssistantTab`; add `<TabsTrigger value="assistant">AI Assistant</TabsTrigger>` to the `TabsList` (lines ~243–247) and a matching `<TabsContent value="assistant"><AssistantTab archetype={archetype} tenantId={tenantId} onSaved={...} /></TabsContent>`. Position sensibly (e.g. after Training). The existing `handleTabChange` already URL-encodes the tab — no extra work for shareable state.
  - Ensure the unsaved-changes guard cooperates with `handleTabChange` (switching tabs while a proposal is pending should prompt).

  **Must NOT do**:
  - Do NOT change existing tabs' behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick` — small wiring change.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: NO (integration) · Wave 4 · Blocks: 14 · Blocked By: 9, 10, 11, 12.

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:241–277` — tab list + content; `:26,28` tab URL state.
  - WHY: makes the feature reachable at `?tab=assistant`, shareable/refresh-safe per repo convention.

  **Acceptance Criteria**:
  - [ ] Navigating to `/dashboard/employees/:id?tab=assistant` renders the AI Assistant tab; the tab param round-trips on refresh.

  **QA Scenarios**:

  ```
  Scenario: tab reachable + URL-encoded (happy path)
    Tool: Playwright
    Steps:
      1. Open .../employees/$A?tenant=$T -> click "AI Assistant" -> URL gains ?tab=assistant -> reload -> still on Assistant tab
    Expected Result: tab visible + persists across refresh
    Evidence: .sisyphus/evidence/task-13-tab.png
  ```

  **Commit**: YES — `feat(dashboard): mount AI assistant tab on employee detail`; Pre-commit: `pnpm --dir dashboard build && pnpm lint`.

- [ ] 14. Documentation update

  **What to do**:
  - Update **README.md** admin API table: add the new endpoints (`propose-edit`, `edit-history` record/list, `edit-history/:id/revert`).
  - Update **AGENTS.md**: add the new endpoints (or note them under the `api-design` skill catalog reference), add the `archetype_edit_history` table to the Database section (durable description, no volatile counts), and a one-line note that the employee detail page has an AI Assistant tab for conversational prose edits. Add a one-line note distinguishing archetype-prose edits (this feature) from `employee_rules` (learned rules) so they aren't conflated.
  - Follow the Documentation Freshness rules (new DB model + new admin endpoints both require AGENTS.md/README updates).

  **Must NOT do**:
  - Do NOT add volatile counts ("N endpoints"). Enumerate instead.

  **Recommended Agent Profile**:
  - **Category**: `writing`.
  - **Skills**: [] — docs only.

  **Parallelization**: Can Run In Parallel: NO · Wave 4 · Blocks: Final Wave · Blocked By: 13.

  **References**:
  - README.md admin endpoint table; AGENTS.md § Database, § Admin API, § Documentation Freshness.
  - WHY: repo mandates doc updates in the same change for new endpoints + DB models.

  **Acceptance Criteria**:
  - [ ] `grep -n "propose-edit\|edit-history\|archetype_edit_history" README.md AGENTS.md` returns matches.

  **QA Scenarios**:

  ```
  Scenario: docs mention new surface (happy path)
    Tool: Bash (grep)
    Steps:
      1. grep -n "propose-edit\|edit-history\|archetype_edit_history\|AI Assistant" README.md AGENTS.md
    Expected Result: matches present in both files
    Evidence: .sisyphus/evidence/task-14-docs.txt
  ```

  **Commit**: YES — `docs: document AI assistant edit feature`; Pre-commit: none.

- [ ] 15. **Notify completion** — Send Telegram: `tsx scripts/telegram-notify.ts "✅ Conversational Employee Editing complete — all tasks done, final wave passed. Come back to review results."` (run AFTER user gives explicit okay in the Final Wave).

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1–F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, query DB). For each "Must NOT Have": search the codebase for forbidden patterns — reject with file:line if found (e.g. any path where this flow PATCHes `model`/`tool_registry`/`risk_model`; any streaming; any chat-transcript DB write; any hard-delete of history). Check evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` + `pnpm --dir dashboard test`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports, AI slop (over-abstraction, generic names). Confirm `sendError`/`sendSuccess` used on new routes, `makePostgrestHeaders`/repository conventions respected, tenant scoping present.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      From a clean state: (a) the real-trigger no-op check — apply an `execution_steps` edit via the UI, trigger a task for that employee, assert the compiled AGENTS.md / DB column reflects the new text; (b) full Playwright assistant-tab E2E (propose → diff → approve → reload-verify → refine cumulative → deny → history → revert); (c) the unsaved-changes guard fires with a pending proposal and clears after approve/deny. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | No-op check [PASS/FAIL] | Guard [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec built, nothing beyond spec. Confirm the field allowlist is enforced in BOTH the propose endpoint and the client. Detect cross-task contamination and unaccounted changes.
      Output: `Tasks [N/N compliant] | Allowlist [enforced both sides Y/N] | Contamination [CLEAN/N] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(archetypes): allow identity in PATCH schema` — admin-archetypes.ts (+ test)
- **T2**: `feat(db): add archetype_edit_history table` — schema.prisma, migration
- **T3**: `feat(dashboard): add diff viewer + ProposalDiffCard` — package.json, ProposalDiffCard.tsx
- **T4**: `feat(dashboard): add useUnsavedChangesGuard hook` — hook + test
- **T5**: `feat(archetypes): add propose-edit endpoint` — route + service + test
- **T6/T7**: `feat(archetypes): add edit-history record/list/revert endpoints` — routes + tests
- **T8**: `feat(dashboard): add edit-assistant gateway client fns`
- **T9–T12**: `feat(dashboard): AI assistant tab chat + approve + history`
- **T13**: `feat(dashboard): mount assistant tab on employee detail`
- **T14**: `docs: document AI assistant edit feature`

Each task: `pnpm lint && pnpm build` (+ relevant test) as pre-commit.

## Success Criteria

### Verification Commands

```bash
pnpm build && pnpm lint                 # clean
pnpm test:unit                          # gateway tests pass
pnpm --dir dashboard test               # dashboard tests pass
# real no-op proof:
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT identity, execution_steps FROM archetypes WHERE id='<id>';"   # reflects applied edit
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT count(*) FROM archetype_edit_history WHERE archetype_id='<id>';"  # >= 1 after approve
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass; build + lint clean
- [ ] Real-trigger no-op check passed
- [ ] User gave explicit okay after Final Wave
