# Slack Channel UX Consolidation

## TL;DR

> **Quick Summary**: Fix confusing triple-channel UX by making `notification_channel` the single "Slack Channel" concept — consistently labeled, required, and no longer duplicated as an LLM-generated detected input.
>
> **Deliverables**:
>
> - Consistent "Slack Channel" label on both `/new` and `/edit` pages
> - Required field validation (frontend + backend)
> - LLM prompt updated to suppress Slack channel detected inputs
> - Helper text explaining what the field does
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (parallel with Task 2) → Task 3 → Task 4 → F1-F4

---

## Context

### Original Request

User noticed three different "Slack channel" fields across the employee creation and editing pages:

1. "Slack Channel (optional)" on `/new` — sets `archetypes.notification_channel`
2. "Notification Channel" on `/edit` — same DB column, different label
3. "Slack Channel for Schedule Delivery" in Detected Inputs on `/edit` — completely different concept (LLM-generated `input_schema` item)

This creates user confusion: which channel is which, are they connected, and why are there three of them?

### Interview Summary

**Key Discussions**:

- Fields 1 and 2 are the same DB column with inconsistent labels
- Field 3 is a redundant LLM-generated input — the platform already provides a channel via `notification_channel`
- User wants single-channel-per-employee: one Slack channel for everything (status messages, work output, all bot activity)
- Field should be called "Slack Channel" consistently and be required

**Research Findings**:

- `notification_channel` → injected as `NOTIFICATION_CHANNEL` env var via `tenant-env-loader.ts`
- LLM-generated Slack channel inputs → injected as `INPUT_SLACK_CHANNEL` env var — redundant with the above
- The `archetype-generator.ts` prompt has no awareness of `notification_channel` as a platform concept, so it generates Slack channel inputs when the description mentions Slack

### Metis Review

**Identified Gaps** (addressed):

- Required validation scope: Applied to both `/new` and `/edit` pages — "Create Employee" button blocked if channel is empty
- Backend enforcement: Added `z.string().min(1)` to `CreateArchetypeBodySchema` for belt-and-suspenders validation

---

## Work Objectives

### Core Objective

Consolidate three confusing Slack channel fields into a single, consistently named, required "Slack Channel" field.

### Concrete Deliverables

- Updated `CreateEmployeePage.tsx`: label change + required validation
- Updated `EditEmployeePage.tsx`: label change + required validation on "Create Employee" button
- Updated `archetype-generator.ts`: LLM prompt suppresses Slack channel input generation
- Updated `admin-archetypes.ts`: Backend schema enforces non-null `notification_channel` on create

### Definition of Done

- [ ] Both pages show "Slack Channel" as the field label
- [ ] Neither page allows creating/activating an employee without a Slack channel
- [ ] LLM-generated archetypes never include Slack channel items in `input_schema`
- [ ] Backend rejects archetype creation with null/empty `notification_channel`

### Must Have

- Consistent "Slack Channel" label on both `/new` and `/edit` pages
- Required field validation preventing empty channel on creation
- LLM prompt instruction to not generate Slack channel inputs
- Backend validation rejecting null `notification_channel` on create

### Must NOT Have (Guardrails)

- Do NOT rename the DB column `notification_channel` — label-only change
- Do NOT modify the `input_schema` feature itself (detected inputs are fine for non-Slack inputs)
- Do NOT clean up existing employees' `input_schema` — users can delete redundant items manually
- Do NOT change the `resolveNotificationChannel()` runtime logic — it already works correctly
- Do NOT touch `frequency: 'once'` input handling — separate concern
- Do NOT add excessive comments explaining the change

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None for this change — purely UI labels + LLM prompt text + Zod schema. Existing tests cover Zod schema validation.
- **Framework**: Vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Update dashboard UI labels + validation [quick]
├── Task 2: Update LLM prompt to suppress Slack channel inputs [quick]
└── Task 3: Update backend schema validation [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | F1-F4  |
| 2    | —          | F1-F4  |
| 3    | —          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Update dashboard UI — consistent "Slack Channel" label + required validation

  **What to do**:
  - In `CreateEmployeePage.tsx` (line 98): Change label from `Slack Channel (optional)` to `Slack Channel`
  - In `CreateEmployeePage.tsx` (line 110): Add `!notificationChannel.trim()` to the `disabled` condition on the Generate button so users cannot proceed without a channel
  - In `EditEmployeePage.tsx` (line 247): Change label from `Notification Channel` to `Slack Channel`
  - In `EditEmployeePage.tsx` (lines 405-409): Add `!archetype.notification_channel?.trim()` to the `disabled` condition on the "Create Employee" button
  - Add helper text below the Slack Channel input on both pages: `"The Slack channel where this employee operates — all notifications, approvals, and deliveries go here."`

  **Must NOT do**:
  - Do NOT rename any React state variables (keep `notificationChannel` in CreateEmployeePage)
  - Do NOT change the `onBlur` save behavior on the edit page
  - Do NOT modify the `InputSchemaEditor` component
  - Do NOT touch the Concurrency Limit field

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple label changes and adding a disabled condition — purely mechanical edits
  - **Skills**: []
    - No special skills needed — standard React edits
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — no design work, just label and validation changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:98` — Current "Slack Channel (optional)" label to change
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:108-113` — Generate button disabled logic to extend
  - `dashboard/src/panels/employees/EditEmployeePage.tsx:244-261` — Current "Notification Channel" section to change
  - `dashboard/src/panels/employees/EditEmployeePage.tsx:403-412` — "Create Employee" button disabled logic to extend

  **WHY Each Reference Matters**:
  - Lines 98 and 247: These are the exact label strings to change
  - Lines 108-113 and 403-412: These are the existing disabled conditions to extend with the channel check
  - The edit page uses `archetype.notification_channel` from state; the create page uses `notificationChannel` from local state

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify /new page shows "Slack Channel" label and requires it
    Tool: Playwright
    Preconditions: Dashboard running at http://localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003
      2. Assert label text "Slack Channel" is visible (not "Slack Channel (optional)")
      3. Assert helper text "The Slack channel where this employee operates" is visible
      4. Type "A test employee that monitors a channel daily" in the description textarea
      5. Assert Generate button is disabled (description > 10 chars but no channel)
      6. Type "#test-channel" in the Slack Channel input
      7. Assert Generate button is now enabled
    Expected Result: Label says "Slack Channel", helper text present, Generate disabled without channel, enabled with channel
    Failure Indicators: Label still says "(optional)", Generate enabled without a channel
    Evidence: .sisyphus/evidence/task-1-new-page-required.png

  Scenario: Verify /edit page shows "Slack Channel" label and blocks activation without it
    Tool: Playwright
    Preconditions: Dashboard running, a draft employee exists (e.g. the hostfully-cleaning-scheduler at d998d547-ca06-4734-bc1a-9fd39dbcd073)
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/d998d547-ca06-4734-bc1a-9fd39dbcd073/edit?tenant=00000000-0000-0000-0000-000000000003
      2. Assert label text "Slack Channel" is visible in the Configuration section (not "Notification Channel")
      3. Assert helper text "The Slack channel where this employee operates" is visible
      4. Clear the Slack Channel input field
      5. Click outside to trigger blur/save
      6. Assert "Create Employee" button is disabled
      7. Type "#cleaning-updates" in the Slack Channel input
      8. Click outside to trigger blur/save
      9. Assert "Create Employee" button is now enabled (assuming other required fields are filled)
    Expected Result: Label says "Slack Channel", Create Employee disabled without channel
    Failure Indicators: Label still says "Notification Channel", button enabled without channel
    Evidence: .sisyphus/evidence/task-1-edit-page-required.png
  ```

  **Evidence to Capture:**
  - [ ] task-1-new-page-required.png — screenshot of /new page showing "Slack Channel" label
  - [ ] task-1-edit-page-required.png — screenshot of /edit page showing "Slack Channel" label

  **Commit**: YES
  - Message: `fix(dashboard): consolidate Slack channel UX — consistent label, required field`
  - Files: `dashboard/src/panels/employees/CreateEmployeePage.tsx`, `dashboard/src/panels/employees/EditEmployeePage.tsx`
  - Pre-commit: `pnpm lint`

- [x] 2. Update LLM prompt to suppress Slack channel detected inputs

  **What to do**:
  - In `archetype-generator.ts`, add a rule to the `SYSTEM_PROMPT` constant (in the `## Input Detection (CRITICAL)` section, around line 56) instructing the LLM to NEVER generate Slack channel items in `input_schema`
  - Add text like: `- NEVER create an input_schema item for Slack channels (channel names, delivery channels, notification channels). The platform provides a dedicated Slack Channel setting for every employee. If the description mentions posting to Slack, reference it in the overview and instructions but do NOT create an input for it.`
  - Also add the same instruction to `REFINE_SYSTEM_PROMPT` (line 177) so refinements don't re-introduce Slack channel inputs
  - In the `postProcess()` function (line 209), add a filter step that strips any `input_schema` items whose `key` contains `slack_channel` or `channel` + `slack` — as a safety net in case the LLM ignores the instruction

  **Must NOT do**:
  - Do NOT change the `input_schema` feature for non-Slack inputs — only suppress Slack channel inputs
  - Do NOT modify the `InputSchemaSchema` Zod validation
  - Do NOT change the generate/refine API endpoints
  - Do NOT add excessive comments explaining why

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding a paragraph to a prompt string and a simple array filter — mechanical edits
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `creating-archetypes`: Not needed — we're editing the generator prompt, not creating an archetype

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/services/archetype-generator.ts:44-175` — Full `SYSTEM_PROMPT` constant, specifically the `## Input Detection (CRITICAL)` section at line 55
  - `src/gateway/services/archetype-generator.ts:177-192` — `REFINE_SYSTEM_PROMPT` constant — needs same Slack suppression rule
  - `src/gateway/services/archetype-generator.ts:209-234` — `postProcess()` function where safety-net filter should be added

  **WHY Each Reference Matters**:
  - Lines 55-68: The Input Detection section tells the LLM how to generate `input_schema` items — adding the Slack suppression rule here is the primary fix
  - Lines 177-192: The refinement prompt must match to prevent re-introducing Slack inputs during "Refine" flows
  - Lines 209-234: `postProcess()` already enforces model/runtime — adding a Slack channel filter here provides defense-in-depth

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify LLM prompt contains Slack suppression rule
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. Run: grep -c "NEVER create an input_schema item for Slack" src/gateway/services/archetype-generator.ts
      2. Assert count >= 1 (found in SYSTEM_PROMPT)
      3. Run: grep -c "Slack" src/gateway/services/archetype-generator.ts | check REFINE_SYSTEM_PROMPT section also mentions Slack suppression
    Expected Result: Both SYSTEM_PROMPT and REFINE_SYSTEM_PROMPT contain the Slack suppression instruction
    Failure Indicators: Grep returns 0 matches, or only one prompt has the rule
    Evidence: .sisyphus/evidence/task-2-prompt-grep.txt

  Scenario: Verify postProcess strips Slack channel inputs
    Tool: Bash (node REPL)
    Preconditions: TypeScript compiled or tsx available
    Steps:
      1. Read the postProcess function source and verify it includes a filter that removes input_schema items with keys matching slack/channel patterns
      2. Visually confirm the filter logic handles: "slack_channel", "delivery_channel", "notification_channel" key patterns
    Expected Result: postProcess includes an array filter removing Slack channel input_schema items
    Failure Indicators: No filter present, or filter uses wrong key patterns
    Evidence: .sisyphus/evidence/task-2-postprocess-filter.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-prompt-grep.txt — grep output showing Slack suppression in both prompts
  - [ ] task-2-postprocess-filter.txt — relevant code snippet showing the safety-net filter

  **Commit**: YES
  - Message: `fix(generator): suppress Slack channel from LLM-generated input_schema`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm lint`

- [x] 3. Update backend schema to require notification_channel on create

  **What to do**:
  - In `admin-archetypes.ts` (line 91): Change `notification_channel` validation in `CreateArchetypeBodySchema` from `z.string().max(50).nullable().default(null)` to `z.string().min(1).max(50)` — making it required, non-null, non-empty
  - Verify existing tests still pass — the schema change may affect test fixtures that create archetypes without a channel

  **Must NOT do**:
  - Do NOT change `PatchArchetypeBodySchema` — patching should still allow optional updates
  - Do NOT change the DB column nullability in Prisma schema — only enforce at the API validation level
  - Do NOT modify the archetype creation logic beyond the schema change

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single Zod schema field change — one line edit
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not relevant — no shell tool work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-archetypes.ts:72-103` — `CreateArchetypeBodySchema` — the Zod schema to modify (line 91 specifically)
  - `src/gateway/routes/admin-archetypes.ts:38-70` — `PatchArchetypeBodySchema` — do NOT change this (line 47, `notification_channel` is optional here and should stay optional)

  **WHY Each Reference Matters**:
  - Line 91: This is the exact line to change — from `.nullable().default(null)` to `.min(1)` (drop nullable and default)
  - Lines 38-70: The patch schema is shown so the executor knows NOT to touch it — patching is a partial update and channel should remain optional there

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Backend rejects archetype creation without notification_channel
    Tool: Bash (curl)
    Preconditions: Gateway running at http://localhost:7700, ADMIN_API_KEY set
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"role_name":"test-no-channel","model":"minimax/minimax-m2.7","runtime":"opencode","instructions":"test","agents_md":"test","system_prompt":""}'
      2. Assert HTTP status is 400
      3. Run same request but with "notification_channel": "#test-channel" added
      4. Assert HTTP status is 201 (or 409 if name taken)
    Expected Result: 400 without channel, 201 with channel
    Failure Indicators: 201 returned without notification_channel, or 400 returned with it
    Evidence: .sisyphus/evidence/task-3-api-validation.txt

  Scenario: Backend still accepts PATCH without notification_channel
    Tool: Bash (curl)
    Preconditions: Gateway running, an existing archetype ID available
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" -X PATCH "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/{existing-id}" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"concurrency_limit": 2}'
      2. Assert HTTP status is 200 (patch without notification_channel still works)
    Expected Result: PATCH succeeds without notification_channel (it's optional on patch)
    Failure Indicators: PATCH returns 400 requiring notification_channel
    Evidence: .sisyphus/evidence/task-3-patch-still-works.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-api-validation.txt — curl output showing 400 without channel, success with channel
  - [ ] task-3-patch-still-works.txt — curl output showing PATCH works without channel

  **Commit**: YES
  - Message: `fix(api): require notification_channel on archetype creation`
  - Files: `src/gateway/routes/admin-archetypes.ts`
  - Pre-commit: `pnpm lint && pnpm test -- --run`

- [x] 4. Notify completion

  Send Telegram notification: `tsx scripts/telegram-notify.ts "slack-channel-ux-fix complete — all tasks done. Come back to review results."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                           | Files                                            | Pre-commit                        |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| 1      | `fix(dashboard): consolidate Slack channel UX — consistent label, required field` | `CreateEmployeePage.tsx`, `EditEmployeePage.tsx` | `pnpm lint`                       |
| 2      | `fix(generator): suppress Slack channel from LLM-generated input_schema`          | `archetype-generator.ts`                         | `pnpm lint`                       |
| 3      | `fix(api): require notification_channel on archetype creation`                    | `admin-archetypes.ts`                            | `pnpm lint && pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Build passes
pnpm build

# Lint passes
pnpm lint

# Tests pass
pnpm test -- --run
```

### Final Checklist

- [ ] Both pages show "Slack Channel" label
- [ ] "Create Employee" button disabled without Slack Channel on both pages
- [ ] LLM prompt explicitly tells model not to generate Slack channel inputs
- [ ] Backend API rejects null/empty notification_channel on create
- [ ] No DB column rename occurred
- [ ] No changes to resolveNotificationChannel() service
- [ ] No changes to InputSchemaEditor component behavior
