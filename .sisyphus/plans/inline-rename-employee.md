# Inline Rename Employee

## TL;DR

> **Quick Summary**: Make the employee name (`role_name`) inline-editable on the employee detail page header, so users can resolve the "This name is already taken" error without leaving the page.
>
> **Deliverables**:
>
> - Click-to-edit inline name on the `<h1>` header of `EmployeeDetail.tsx`
> - Client-side kebab-case validation (PATCH schema does NOT enforce it)
> - 409 duplicate name error handling via toast
> - Works for both `draft` and `active` employees
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single task
> **Critical Path**: Task 1 → F1-F4

---

## Context

### Original Request

User tried creating an AI employee via the employee detail page and got:

```
This name is already taken by an active employee. Change the role name first.
```

But there's no way to change the name on that page — `role_name` is displayed as a read-only `<h1>`.

### Interview Summary

**Key Discussions**:

- User wants inline click-to-edit on the header, for both draft and active employees
- Backend PATCH endpoint already supports `role_name` updates (line 45 of `admin-archetypes.ts`)

**Research Findings**:

- `role_name` is read-only `<h1>` on line 296 of `EmployeeDetail.tsx`
- `patchArchetype()` already used in the same file for model updates (lines 416)
- PATCH has 409 duplicate check for active employees (line 316)
- `CreateArchetypeBodySchema` enforces kebab-case regex, but `PatchArchetypeBodySchema` does NOT — client-side validation is mandatory

### Metis Review

**Identified Gaps** (addressed):

- PATCH schema missing kebab-case regex → client-side validation added as mandatory guardrail
- Renaming active employee silently breaks webhook URLs → informational note about external webhook breakage not needed for MVP (edge case, power users only)
- `refresh()` must be called after save → added to acceptance criteria
- Escape key must cancel edit → added to acceptance criteria

---

## Work Objectives

### Core Objective

Add inline click-to-edit for the employee name in the `EmployeeDetail.tsx` header, with client-side kebab-case validation and proper error handling.

### Concrete Deliverables

- Modified `EmployeeDetail.tsx` with inline edit functionality

### Definition of Done

- [ ] Clicking the name converts it to an input, pre-filled with the current value
- [ ] Enter saves (calls PATCH), Escape cancels (reverts)
- [ ] Blur saves if the value changed and is valid
- [ ] Invalid format shows inline error, does NOT call PATCH
- [ ] 409 shows toast error about duplicate name
- [ ] After successful save, `refresh()` updates all derived values (trigger buttons, webhook URL, delete dialog)

### Must Have

- Inline click-to-edit on the `<h1>` header
- Client-side kebab-case validation (`/^[a-z0-9]+(-[a-z0-9]+)*$/`)
- Empty string rejection (client-side)
- Escape key to cancel edit
- 409 error handling with toast
- `refresh()` called after successful save
- Works for both `draft` and `active` employees

### Must NOT Have (Guardrails)

- Do NOT extract an `InlineEdit` shared component — implement inline in `EmployeeDetail.tsx` only
- Do NOT modify `handleFinalize`, `handleTrigger`, `handleDryRun`, or `handleDelete`
- Do NOT touch the button row (lines 299–350)
- Do NOT add backend PATCH schema changes — client-side validation only
- Do NOT add a confirmation dialog for active employee renames
- Do NOT modify `EmployeeProfileLayout.tsx` or `EmployeeList.tsx`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — UI-only change, Playwright QA is the primary verification
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task):
└── Task 1: Inline rename in EmployeeDetail.tsx [visual-engineering]

Wave FINAL (After task 1 — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks    |
| ----- | ---------- | --------- |
| 1     | —          | F1-F4     |
| F1-F4 | 1          | user okay |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `visual-engineering`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add inline click-to-edit for employee name in EmployeeDetail.tsx

  **What to do**:
  - Add local state: `isEditingName` (boolean), `editNameValue` (string), `nameSaving` (boolean), `nameError` (string | null)
  - Replace the `<h1>` on line 296 with a conditional:
    - **Not editing**: `<h1 className="text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors" onClick={() => { setIsEditingName(true); setEditNameValue(archetype.role_name ?? ''); setNameError(null); }}>{archetype.role_name ?? archetype.id}</h1>` — add a small pencil icon or underline-on-hover to hint it's editable
    - **Editing**: A controlled `<input>` with matching text size, `autoFocus`, `value={editNameValue}`, `onChange`, `onKeyDown` (Enter = save, Escape = cancel), `onBlur` (save if changed and valid)
  - Validation function: check `/^[a-z0-9]+(-[a-z0-9]+)*$/` — if invalid, set `nameError` to a helpful message like "Use lowercase letters, numbers, and hyphens only (e.g. my-employee)" and do NOT call PATCH
  - Empty string check: if empty, set `nameError` to "Name is required"
  - Save function:
    1. Validate format
    2. If unchanged from original, just exit edit mode
    3. Set `nameSaving(true)`
    4. Call `patchArchetype(tenantId, archetype.id, { role_name: editNameValue })`
    5. On success: `toast.success('Name updated')`, `refresh()`, exit edit mode
    6. On 409: `toast.error('This name is already taken by an active employee.')`, keep input open so user can try again
    7. On other error: `toast.error(err instanceof Error ? err.message : String(err))`
    8. Set `nameSaving(false)` in finally
  - Show `nameError` as a small red text below the input when validation fails
  - Show a subtle saving indicator (e.g. disable input) while PATCH is in-flight
  - Style the input to match the `<h1>` visually (same font size, weight, no jarring layout shift)

  **Must NOT do**:
  - Do NOT modify any other functions (`handleFinalize`, `handleTrigger`, etc.)
  - Do NOT touch the button row (lines 299–350)
  - Do NOT create a new shared component file
  - Do NOT modify any backend files

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI/UX change with inline editing interaction, styling concerns, and visual polish
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Domain overlaps but visual-engineering category already covers it

  **Parallelization**:
  - **Can Run In Parallel**: NO (single task)
  - **Parallel Group**: Wave 1
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:412-428` — Model save pattern: `modelSaving` boolean + `try/catch` with `toast.error(err instanceof Error ? err.message : String(err))` + `refresh()` on success. Follow this exact pattern for the name save.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:296` — Current `<h1>` to replace with the conditional inline edit
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:201-204` — 409 error handling pattern with `msg.includes('409')` check

  **API/Type References** (contracts to implement against):
  - `src/gateway/routes/admin-archetypes.ts:45` — PATCH accepts `role_name: z.string().min(1).max(200).optional()` — no kebab-case regex on PATCH!
  - `src/gateway/routes/admin-archetypes.ts:78-80` — CREATE enforces `/^[a-z0-9]+(-[a-z0-9]+)*$/` — copy this regex for client-side validation
  - `src/gateway/routes/admin-archetypes.ts:316` — 409 response: `{ error: 'role_name already taken by an active employee' }`
  - `dashboard/src/lib/gateway.ts:patchArchetype` — The function to call

  **External References**: None needed

  **WHY Each Reference Matters**:
  - Line 412-428 gives the exact save/error/refresh pattern to replicate
  - Line 296 is the exact element to replace
  - Lines 78-80 provide the kebab-case regex that MUST be enforced client-side since the PATCH schema is missing it
  - Line 316 shows the exact 409 response shape to match against

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — rename a draft employee
    Tool: Playwright
    Preconditions: Dashboard running at http://localhost:7701/dashboard/, employee detail page loaded
    Steps:
      1. Navigate to http://localhost:7701/dashboard/employees/<employee-id>?tenant=00000000-0000-0000-0000-000000000003
      2. Click the employee name heading (h1 element)
      3. Assert: input element appears, pre-filled with current name
      4. Clear the input and type "new-test-name"
      5. Press Enter
      6. Assert: toast with "Name updated" appears
      7. Assert: heading now shows "new-test-name"
    Expected Result: Name updated, heading reflects new value
    Failure Indicators: No input appears on click, PATCH fails, heading doesn't update
    Evidence: .sisyphus/evidence/task-1-rename-happy-path.png

  Scenario: Invalid format — non-kebab-case rejected
    Tool: Playwright
    Preconditions: Employee detail page loaded, click name to enter edit mode
    Steps:
      1. Click the employee name heading
      2. Clear and type "My Employee"
      3. Press Enter (or blur)
      4. Assert: red error text appears below input with format hint
      5. Assert: NO network request to PATCH was fired
    Expected Result: Inline error shown, no PATCH called
    Failure Indicators: PATCH fires with invalid name, no error shown
    Evidence: .sisyphus/evidence/task-1-invalid-format.png

  Scenario: Escape cancels edit
    Tool: Playwright
    Preconditions: Employee detail page loaded
    Steps:
      1. Click the employee name heading
      2. Assert: input appears
      3. Type "something-new"
      4. Press Escape
      5. Assert: input disappears, original name restored in heading
      6. Assert: NO network request to PATCH was fired
    Expected Result: Edit cancelled, original name shown
    Failure Indicators: Edit persists, PATCH fires, name changes
    Evidence: .sisyphus/evidence/task-1-escape-cancel.png

  Scenario: 409 duplicate name shows error toast
    Tool: Playwright
    Preconditions: Employee detail page loaded, another active employee exists with name "daily-summarizer"
    Steps:
      1. Click the employee name heading
      2. Clear and type "daily-summarizer" (known active employee name)
      3. Press Enter
      4. Assert: toast with "already taken" message appears
      5. Assert: input stays open so user can try a different name
    Expected Result: Error toast shown, input remains editable
    Failure Indicators: No toast, input closes, name silently changes
    Evidence: .sisyphus/evidence/task-1-duplicate-409.png

  Scenario: Empty name rejected
    Tool: Playwright
    Preconditions: Employee detail page loaded
    Steps:
      1. Click the employee name heading
      2. Clear the input completely (empty string)
      3. Press Enter (or blur)
      4. Assert: inline error "Name is required" shown
      5. Assert: NO network request to PATCH was fired
    Expected Result: Error shown, no PATCH called
    Failure Indicators: PATCH fires with empty name
    Evidence: .sisyphus/evidence/task-1-empty-name.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshot of inline edit in editing mode
  - [ ] Screenshot of successful rename
  - [ ] Screenshot of validation error for non-kebab-case
  - [ ] Screenshot of 409 error toast

  **Commit**: YES
  - Message: `feat(dashboard): add inline rename for employee name`
  - Files: `dashboard/src/panels/employees/EmployeeDetail.tsx`
  - Pre-commit: `pnpm build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build && npx eslint dashboard/src/panels/employees/EmployeeDetail.tsx`. Review the changed file for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
      Start from clean state. Execute EVERY QA scenario from Task 1 — follow exact steps, capture evidence. Test edge cases: rapid double-click, very long names, special characters. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Read the git diff. Verify ONLY `EmployeeDetail.tsx` was changed. Verify no functions were modified beyond what was specified (no handleFinalize, handleTrigger, etc. changes). Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

- [x] N. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

---

## Commit Strategy

| Group | Message                                                | Files                                               | Pre-commit   |
| ----- | ------------------------------------------------------ | --------------------------------------------------- | ------------ |
| T1    | `feat(dashboard): add inline rename for employee name` | `dashboard/src/panels/employees/EmployeeDetail.tsx` | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build  # Expected: success, no errors
```

### Final Checklist

- [ ] Clicking employee name enters edit mode
- [ ] Enter saves, Escape cancels, blur saves if changed
- [ ] Kebab-case validation prevents invalid names
- [ ] 409 duplicate name shows error toast
- [ ] `refresh()` called after successful save — all derived values update
- [ ] Only `EmployeeDetail.tsx` modified
