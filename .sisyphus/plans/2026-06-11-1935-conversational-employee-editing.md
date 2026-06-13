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
- Editable scope (v1 — EXPANDED 2026-06-13): **Core prose** (`identity`, `execution_steps`, `delivery_steps`, + `overview` synced) **PLUS approval gate** (`risk_model.approval_required`) **PLUS tool access** (`tool_registry.tools`, validated vs the tenant's available tools) **PLUS schedule/trigger** (`trigger_sources`, validated vs `TriggerSourceSchema`) **PLUS required inputs** (`input_schema`, validated vs `InputSchemaSchema`). STILL EXCLUDED (genuinely technical / breakage-prone): `model`, `temperature`, `role_name`, `vm_size`, `concurrency_limit`. Rationale: the allowlist's purpose is to stop `refine()`'s UNREQUESTED full-config regeneration from silently riding along — NOT to forbid a user's EXPLICIT request. model/temperature can silently break tool-calling (need the model-selection engine); role_name has slug-collision rules + its own rename UI; vm_size/concurrency_limit are infra knobs with no user-facing value. Approval-off requires a prominent warning + explicit confirm. Tools, trigger, and inputs render as friendly lists (not prose diffs) and are validated before they can be proposed.
- Versioning: **NEW `archetype_edit_history` table**; history list + revert in the UI.
- UX: **Full chat panel as a NEW tab** (`?tab=assistant`); proposals appear as inline diff cards with Approve/Deny/Refine.
- Streaming: **NO** — simple request/response with a loading spinner.
- Chat persistence: **ephemeral** (in-memory per session); only approved changes persist.
- **Unsaved-changes guard**: `beforeunload` + in-app nav block while an unapproved proposal is pending.
- Tests: **tests-after for core logic + mandatory Playwright agent QA**.

**Research Findings (verified, file:line)**:

- **AI-edit engine ALREADY EXISTS**: `ArchetypeGenerator.refine(previousConfig, refinementInstruction, catalog?, composioContext?)` at `src/gateway/services/archetype-generator.ts:398`, driven by `buildRefineSystemPrompt()` from `REFINE_SYSTEM_PROMPT_PRE`/`REFINE_SYSTEM_PROMPT_POST` (the older single `REFINE_SYSTEM_PROMPT` constant no longer exists — code now injects a Composio "connected apps" block between PRE and POST). Route `POST /admin/tenants/:tenantId/archetypes/generate` (`src/gateway/routes/admin-archetype-generate.ts:90-112`) handles refine when body carries `previous_config` + `refinement_instruction`, now passes `{connectedToolkits, connectableToolkits}` to `refine()`, and responds `{ ...result, connectedToolkits, suggestedToolkits }`. Returns a `GenerateArchetypeResponse`-shaped object; does NOT persist. Dashboard clients confirmed at `dashboard/src/lib/gateway.ts`: `patchArchetype` (line 144), `generateArchetype` (240), `refineArchetype` (250) — note line numbers shifted slightly from earlier research.
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
- [ ] Strictly-disallowed fields (`model`, `temperature`, `role_name`, `vm_size`, `concurrency_limit`) are never changed by this flow.
- [ ] Allowed-on-request fields work: turning approval off (with confirm) persists `risk_model.approval_required=false`; adding/removing a tool persists `tool_registry.tools`; changing the schedule persists `trigger_sources`; changing required inputs persists `input_schema`. Invalid tools/triggers/inputs are rejected with a clear message.
- [ ] `pnpm test:unit` and `pnpm --dir dashboard test` pass; `pnpm lint` and `pnpm build` clean.

### Must Have

- Hard field allowlist enforced server-side AND client-side. Allowlist = `identity`, `execution_steps`, `delivery_steps`, `overview` (synced), `risk_model.approval_required`, `tool_registry.tools`, `trigger_sources`, `input_schema`. Everything else from `refine()`'s output is stripped.
- **Tool validation**: any proposed `tool_registry.tools` entry must resolve to a tool actually available to the tenant (a known shell-tool descriptor OR a connected Composio toolkit). Unavailable tools are rejected at the propose endpoint with a plain-language reason — never proposed/applied.
- **Trigger + input validation**: a proposed `trigger_sources` must pass `TriggerSourceSchema` (well-formed manual / scheduled cron+timezone / supported webhook event_type); a proposed `input_schema` must pass `InputSchemaSchema`. Invalid shapes are rejected at the propose endpoint with a plain-language reason.
- **Approval-off safeguard**: a proposal that sets `approval_required` from true→false renders a prominent warning ("This employee will act WITHOUT asking you first") and requires a distinct, explicit confirm before Approve applies it.
- before/after snapshots in `archetype_edit_history`; append-only; tenant + archetype + soft-delete scoped.
- Unsaved-changes guard active only while an unapproved proposal is pending.
- Non-technical, plain-language UI copy; card shells; existing component conventions.

### Must NOT Have (Guardrails)

- NO streaming responses.
- NO editing of `model`, `temperature`, `role_name`, `vm_size`, `concurrency_limit` via this chat. (These stay out of scope — breakage-prone or no user-facing value; the chat should politely decline such requests.)
- NO applying a tool the tenant does not actually have available (must validate first).
- NO applying a `trigger_sources` or `input_schema` that fails its Zod schema (must validate first).
- NO removing the approval gate WITHOUT the explicit warning + confirm step.
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

- [x] 1. Confirm field mapping and add `identity` to the PATCH schema

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

- [x] 2. Create `archetype_edit_history` table (Prisma model + migration + PostgREST reload)

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

- [x] 3. Add `react-diff-viewer-continued` + build `ProposalDiffCard` (presentational)

  **What to do**:
  - `pnpm --dir dashboard add react-diff-viewer-continued`.
  - Create `dashboard/src/panels/employees/sections/ProposalDiffCard.tsx`. Props (discriminated change list): `{ proseChanges: {field; before; after}[]; toolDelta?: {added: string[]; removed: string[]}; approvalChange?: {from: boolean; to: boolean}; onApprove; onDeny; onRefineSubmit?(text); busy?: boolean }`.
  - **Prose changes**: for each, render a plain-language label ("Personality", "How it works", "How it delivers") + `ReactDiffViewer` with `compareMethod={DiffMethod.WORDS}`, `splitView={false}` (inline) plus a side-by-side toggle.
  - **Tool changes**: render NOT as a text diff but as a friendly add/remove list — green "＋ Can now use: <friendly tool name>" and red "－ No longer uses: <friendly tool name>". Map tool ids → friendly names.
  - **Approval change**: render a clear sentence ("This employee will ask you to approve actions" ↔ "This employee will act WITHOUT asking you first"). When `approvalChange.to === false` (turning approval OFF), render a PROMINENT warning banner and require a separate confirm checkbox/toggle that must be ticked before Approve is enabled.
  - **Schedule change** (`triggerChange?`): render a friendly before→after sentence ("Runs: manually → every weekday at 8:00 AM UTC" / "Runs when a new guest message arrives"). NOT a prose diff.
  - **Required-inputs change** (`inputChange?`): render the before/after required-input list as friendly add/remove items ("Now asks you for: Property name").
  - Extend props accordingly: `{ proseChanges; toolDelta?; approvalChange?; triggerChange?; inputChange?; onApprove; onDeny; onRefineSubmit?; busy? }`.
  - Wrap in a card shell (`rounded-lg border bg-card px-5 py-4`). Approve / Deny / "Ask for more changes" buttons (shadcn `Button`); `busy` disables them; Approve stays disabled until the approval-off confirm (if present) is ticked.
  - Pure presentational — no fetching. Map field/tool ids → friendly labels.

  **Must NOT do**:
  - Do NOT fetch or call the gateway here.
  - Do NOT show STRICTLY-disallowed fields (model/temperature/role_name/vm_size/concurrency_limit) even if passed — render only prose changes, tool delta, approval change, schedule change, and inputs change.
  - Do NOT enable Approve while an approval-OFF change is pending without its explicit confirm ticked.

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

- [x] 4. Build `useUnsavedChangesGuard` hook (standalone)

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

- [x] 5. Build the `propose-edit` endpoint (wraps `refine()`, enforces allowlist + empty-guard)

  **What to do**:
  - Add `POST /admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit` (new route module or extend `admin-archetype-generate.ts`). Body: `{ request_text: string (min 1, max 500) }`. Auth `requireTenantRole(TenantRole.ADMIN)`, tenant-scoped fetch of the archetype (404 if mismatch).
  - Map the DB archetype row → `GenerateArchetypeResponse` shape (the input `refine()` expects): include `role_name`, `identity`, `execution_steps`, `delivery_steps`, `risk_model`, `tool_registry`, `trigger_sources`, `input_schema`, plus passthrough fields it needs. Call `generator.refine(mappedPrevious, request_text, catalog, { connectedToolkits, connectableToolkits })` (mirror the generate route's composio-context derivation).
  - **Hard allowlist (EXPANDED)**: from the refine result, keep ONLY `identity`, `execution_steps`, `delivery_steps`, `overview`, `risk_model.approval_required` (just the boolean — ignore other risk_model keys like timeout_hours), `tool_registry.tools`, `trigger_sources`, and `input_schema`. Discard `model`, `role_name`, `temperature`, `concurrency_limit`, `vm_size`, `estimated_manual_minutes`, and any non-`approval_required` risk_model keys.
  - **Tool validation**: compute the set of tools ACTUALLY available to this tenant = shell-tool ids/paths from `discoverTools()`/`ALL_TOOL_DESCRIPTORS` (via the tool-parser) UNION the tenant's connected Composio toolkits (the same `connectedToolkits` already derived for the refine call). For each tool in the proposed `tool_registry.tools`, if it is NOT in the available set, REJECT the proposal (or that tool) with a clear, plain-language reason (e.g. "I can't add 'X' because this organization hasn't connected it yet"). Never propose an unavailable tool. Surface the validated add/remove deltas so the UI can render them as a list.
  - **Trigger + input validation (NEW)**: if the proposal changes `trigger_sources`, run it through `TriggerSourceSchema` (`admin-archetypes.ts:27`) — reject with a plain-language reason if it's not a valid manual / scheduled (cron + timezone) / supported webhook (event_type) shape. If it changes `input_schema`, run it through `InputSchemaSchema` (`validation/schemas.ts`) — reject if invalid. Never propose an invalid trigger/input shape.
  - **Empty-field guard**: for each allowlisted PROSE field (`identity`, `execution_steps`, `delivery_steps`), if it was non-empty in the current archetype but the proposal makes it empty/whitespace, reject that field (or the whole proposal) with a clear error — never propose wiping persona/steps. (Does not apply to `approval_required`, an intentionally-emptied tool list, trigger, or inputs.)
  - **Approval-off flag**: if the proposal sets `approval_required` from `true`→`false`, include `approval_warning: true` in the response so the UI shows the prominent warning + requires explicit confirm.
  - Compute `changed_fields`: only fields whose value actually differs from the current persisted archetype. For `tool_registry`, express the diff as `{added: string[], removed: string[]}`; for `approval_required`, as a `{from, to}` boolean; for `trigger_sources` and `input_schema`, as a before/after summary the UI can render as a friendly list (not a prose diff).
  - Respond `{ baseline, proposal, changed_fields, tool_delta?: {added,removed}, trigger_change?, input_change?, approval_warning?: boolean }`. If nothing changed, respond with a flag so the UI can say "no change needed".
  - Use `sendError`/`sendSuccess`. Unit-test the allowlist + tool/trigger/input validation + empty-guard + approval-flag + changed_fields logic with a mocked `refine`.

  **Must NOT do**:
  - Do NOT persist anything here (preview only).
  - Do NOT pass STRICTLY-disallowed fields through (`model`, `temperature`, `role_name`, `vm_size`, `concurrency_limit`), even if `refine()` changed them.
  - Do NOT include a proposed tool not in the tenant's available-tools set, nor a `trigger_sources`/`input_schema` that fails its Zod schema.
  - Do NOT build a new LLM prompt/engine — reuse `generator.refine`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — the allowlist/empty-guard/mapping logic is the highest-risk correctness surface.
  - **Skills**: [`api-design`, `data-access-conventions`] — route conventions; repository/PostgREST + tenant-scope rules.

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 10 · Blocked By: 1.

  **References** (RE-VERIFIED against current code 2026-06-13):
  - `src/gateway/services/archetype-generator.ts:398` — `refine(previousConfig, refinementInstruction, catalog?, composioContext?)`. NOTE: signature now has a 4th `composioContext?: { connectedToolkits?: string[]; connectableToolkits?: string[] }` param; prompt is built via `buildRefineSystemPrompt(...)` from `REFINE_SYSTEM_PROMPT_PRE`/`_POST` (no single `REFINE_SYSTEM_PROMPT` constant anymore). `applyModelAndEstimate` still runs (line 435). `GenerateArchetypeResponse` shape unchanged; `postProcess` may set fields to `''`.
  - `src/gateway/routes/admin-archetype-generate.ts:90-112` — generate/refine route. NOTE: it now derives `connectedToolkits`/`connectableToolkits` and passes them as the 4th arg to `refine()`, and responds `{ ...result, connectedToolkits, suggestedToolkits }`. The propose-edit endpoint should mirror this (pass composio context to `refine()`), then STRIP to the allowlist — `connectedToolkits`/`suggestedToolkits` and all non-allowlisted keys get discarded by the strip step, so our approach is unchanged.
  - `src/gateway/routes/admin-archetypes.ts:46,88-93,184` — GET-by-id / tenant-scope pattern; `sendError`/`sendSuccess`; `risk_model.approval_required` is already a PATCH-able boolean here (no schema change needed for the approval gate).
  - `src/gateway/services/tool-parser.ts` (`discoverTools()`) and `src/lib/tool-registry.ts` (`ALL_TOOL_DESCRIPTORS`) — the canonical set of shell tools; `dashboard` reads these via `fetchTools()`. Use as the available-shell-tools source for validation.
  - `src/gateway/routes/composio-admin.ts` + `src/lib/composio/connectable-apps.ts` — connected vs connectable Composio toolkits per tenant; the connected set is the available-Composio-tools source (same `connectedToolkits` already derived for refine).
  - `src/gateway/routes/admin-archetypes.ts:27 TriggerSourceSchema` + `src/gateway/validation/schemas.ts InputSchemaSchema` — reuse these EXISTING Zod schemas to validate proposed `trigger_sources` / `input_schema`. Both are already PATCH-able (no schema change needed) — only allowlist + validation work.
  - WHY: `refine()` regenerates the WHOLE config; the strip stops UNREQUESTED model/temperature/role changes from riding along, while DELIBERATELY allowing approval, tools, schedule, and inputs. Validation prevents proposing a tool the tenant can't run (breaks execution, esp. with `enforce_tool_registry`) or a malformed schedule/input shape.

  **Acceptance Criteria**:
  - [ ] Unit tests: (a) refine result with changed `model`+`temperature` → response `proposal` contains NEITHER and `changed_fields` excludes them; (b) refine returns `identity:''` while current is non-empty → 4xx / field rejected; (c) `changed_fields` lists only genuinely different allowlisted fields; (d) proposed `tool_registry.tools` containing a tool NOT in the tenant's available set → rejected with a clear reason, valid tools still proposed; (e) proposal flipping `approval_required` true→false → response includes `approval_warning: true`; (f) `tool_delta` correctly reports added/removed; (g) a malformed `trigger_sources` (e.g. scheduled with no cron) → rejected; a valid cron+timezone → proposed with a `trigger_change` summary; (h) a malformed `input_schema` → rejected; a valid one → proposed with an `input_change` summary.

  **QA Scenarios**:

  ```
  Scenario: propose returns allowlisted diff only (happy path)
    Tool: Bash (curl)
    Steps:
      1. curl -X POST .../archetypes/$A/propose-edit -H "Authorization: Bearer $SERVICE_TOKEN" -d '{"request_text":"make replies shorter and friendlier"}'
    Expected Result: 200; JSON has baseline+proposal+changed_fields; proposal keys ⊆ {identity,execution_steps,delivery_steps,overview,risk_model(approval_required only),tool_registry(tools),trigger_sources,input_schema}; NO model/temperature/role_name/vm_size/concurrency_limit keys
    Evidence: .sisyphus/evidence/task-5-propose.json

  Scenario: empty-field guard (negative)
    Tool: vitest (mock refine to return identity:'')
    Steps:
      1. call handler with current identity non-empty -> assert rejection, no empty identity in proposal
    Expected Result: field rejected / 4xx; persona never wiped
    Evidence: .sisyphus/evidence/task-5-empty-guard.txt

  Scenario: unavailable tool rejected (negative)
    Tool: vitest (mock refine to add a tool the tenant has NOT connected)
    Steps:
      1. tenant available-set = {slack, knowledge_base}; refine proposes adding 'hostfully' -> assert 'hostfully' is rejected with a clear reason and NOT present in proposal.tool_registry.tools
    Expected Result: unavailable tool blocked; any valid tool still proposed; plain-language reason returned
    Evidence: .sisyphus/evidence/task-5-tool-validation.txt

  Scenario: approval-off raises warning flag (happy path)
    Tool: vitest (mock refine to set approval_required false; current true)
    Steps:
      1. assert response.approval_warning === true and changed_fields includes approval_required {from:true,to:false}
    Expected Result: warning flag present so UI can require explicit confirm
    Evidence: .sisyphus/evidence/task-5-approval-warning.txt

  Scenario: schedule change validated (happy + negative)
    Tool: vitest (mock refine)
    Steps:
      1. refine proposes valid trigger_sources {type:'scheduled', cron:'0 8 * * 1-5', timezone:'UTC'} -> assert proposed + trigger_change summary present
      2. refine proposes {type:'scheduled'} with no cron -> assert rejected with clear reason, not proposed
    Expected Result: valid schedule passes TriggerSourceSchema; invalid rejected
    Evidence: .sisyphus/evidence/task-5-trigger-validation.txt

  Scenario: input_schema change validated (negative)
    Tool: vitest (mock refine to return a malformed input_schema)
    Steps:
      1. assert malformed input_schema rejected via InputSchemaSchema; valid one proposed with input_change summary
    Evidence: .sisyphus/evidence/task-5-input-validation.txt

  Scenario: strictly-disallowed field stripped (negative)
    Tool: vitest (mock refine to change model + temperature)
    Steps:
      1. assert proposal has NO model/temperature keys; changed_fields excludes them
    Expected Result: only allowlisted fields survive
    Evidence: .sisyphus/evidence/task-5-strip.txt
  ```

  **Commit**: YES — `feat(archetypes): add propose-edit endpoint with field allowlist + tool validation`; Pre-commit: `pnpm test:unit && pnpm lint`.

- [x] 6. Build edit-history **record + list** endpoints

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

- [x] 7. Build edit-history **revert** endpoint

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

- [x] 8. Add dashboard gateway client functions

  **What to do**:
  - In `dashboard/src/lib/gateway.ts`, add: `proposeEdit(tenantId, archetypeId, requestText)` → POST propose-edit; `recordEditHistory(tenantId, archetypeId, payload)` → POST edit-history; `listEditHistory(tenantId, archetypeId)` → GET edit-history; `revertEdit(tenantId, archetypeId, historyId)` → POST revert. Add matching TS types in `dashboard/src/lib/types.ts` (`ProposalResponse` with `{baseline, proposal, changed_fields, tool_delta?, trigger_change?, input_change?, approval_warning?}`, `EditHistoryRow`).
  - **Extend `patchArchetype`'s `Pick<>` type** (`gateway.ts:147-168`) to ADD `'tool_registry'` and `'trigger_sources'` (currently missing) so the Approve flow (T11) can send them. The gateway PATCH schema already accepts both.
  - Mirror the existing `gatewayFetch` wrapper style (see `patchArchetype`, `refineArchetype`).

  **Must NOT do**:
  - Do NOT inline fetch — use `gatewayFetch`.
  - Do NOT add `model`/`temperature` handling to these client fns.

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

- [x] 9. Build `AssistantTab` chat shell + message list

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

- [x] 10. Wire propose-edit + Refine loop into the chat

  **What to do**:
  - On Send: call `proposeEdit(tenantId, archetype.id, requestText)`; show spinner; on success push an assistant `proposal` message containing the `ProposalDiffCard`. Pass through ALL change types from the response: prose diffs (`baseline` vs `proposal`), `tool_delta`, `trigger_change`, `input_change`, and `approval_warning` → mapped to the card's `proseChanges`/`toolDelta`/`triggerChange`/`inputChange`/`approvalChange` props. If `changed_fields` is empty, push a friendly assistant text message ("It looks like no change is needed for that."). If the propose endpoint returned a rejection reason (unavailable tool / invalid schedule / invalid input), surface it as a friendly assistant message instead of a card.
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

- [x] 11. Approve flow → patchArchetype + recordEditHistory

  **What to do**:
  - On Approve of a proposal: build the PATCH body from the allowlisted `proposal` fields ONLY — `identity`, `execution_steps`, `delivery_steps`, `overview`, and (when changed) `risk_model` (with the proposed `approval_required`), `tool_registry`, `trigger_sources`, `input_schema`. Re-fetch the current archetype to capture `before_json` immediately before applying. Call `patchArchetype(tenantId, archetype.id, body)` — note `patchArchetype` already supports `risk_model`/`tool_registry`/`trigger_sources`/`input_schema` (and `identity` after T1). On success, call `recordEditHistory(...)` with `{request_text, before_json, after_json: appliedFields, changed_fields, kind:'edit'}`. Show a `sonner` success toast ("Change applied to your employee."). Mark the proposal as applied (no longer pending) → guard disarms. Call `onSaved()` so the parent refreshes archetype data.
  - **Approval-off gate**: if the proposal turns approval OFF, Approve must be blocked until the `ProposalDiffCard`'s explicit confirm is ticked (the card enforces this; the handler should also defensively check).
  - **Client-side allowlist re-assert**: even though the server stripped, explicitly construct the PATCH body from a fixed allowlist constant (`['identity','execution_steps','delivery_steps','overview','risk_model','tool_registry','trigger_sources','input_schema']`) so no stray fields (model/temperature/role_name/vm_size/concurrency_limit) leak.
  - On Deny: discard the pending proposal (push a small "Discarded." assistant note); guard disarms; nothing persisted.

  **Must NOT do**:
  - Do NOT include disallowed fields in the PATCH body.
  - Do NOT record history on Deny.

  **Recommended Agent Profile**:
  - **Category**: `deep` — apply correctness + history recording + guard state.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 13 · Blocked By: 6, 8, 10.

  **References**:
  - `dashboard/src/lib/gateway.ts:144 patchArchetype` — its `Pick<>` type currently includes `risk_model`, `input_schema`, `overview`, `identity` but is MISSING `tool_registry` and `trigger_sources` (even though the gateway PATCH schema supports both at `admin-archetypes.ts:52-53`). T8 must extend this `Pick<>` to add `tool_registry` and `trigger_sources` so the Approve body typechecks.
  - T6 `recordEditHistory`, T8 client fns.
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

- [x] 12. Build `EditHistoryList` + Revert UI

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

- [x] 13. Mount `AssistantTab` as `?tab=assistant` on the employee detail page

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

- [x] 14. Documentation update

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

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, query DB). For each "Must NOT Have": search the codebase for forbidden patterns — reject with file:line if found (e.g. any path where this flow PATCHes `model`/`temperature`/`role_name`/`vm_size`/`concurrency_limit`; any tool applied without availability validation; any `trigger_sources`/`input_schema` applied without Zod validation; any approval-OFF without the explicit confirm; any streaming; any chat-transcript DB write; any hard-delete of history). NOTE: `tool_registry.tools`, `risk_model.approval_required`, `trigger_sources`, `input_schema` ARE allowed-on-request — do not flag them. Check evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` + `pnpm --dir dashboard test`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports, AI slop (over-abstraction, generic names). Confirm `sendError`/`sendSuccess` used on new routes, `makePostgrestHeaders`/repository conventions respected, tenant scoping present.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      From a clean state: (a) the real-trigger no-op check — apply an `execution_steps` edit via the UI, trigger a task for that employee, assert the compiled AGENTS.md / DB column reflects the new text; (b) full Playwright assistant-tab E2E (propose → diff → approve → reload-verify → refine cumulative → deny → history → revert); (c) the unsaved-changes guard fires with a pending proposal and clears after approve/deny; (d) EXPANDED-SCOPE checks: turn approval OFF (assert the warning + confirm gate appears, then `risk_model.approval_required=false` persists); add an AVAILABLE tool and assert `tool_registry.tools` persists; attempt to add an UNAVAILABLE tool and assert a friendly rejection with no PATCH; change the schedule (assert `trigger_sources` persists and an invalid schedule is rejected); change required inputs (assert `input_schema` persists). Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | No-op check [PASS/FAIL] | Guard [PASS/FAIL] | Expanded-scope [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
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
