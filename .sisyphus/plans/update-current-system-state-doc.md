# Update Current System State Document

## TL;DR

> **Quick Summary**: Fix 4 minor inaccuracies in `docs/2026-04-20-1314-current-system-state.md` found by systematic verification of every section against the actual codebase. The document is overwhelmingly accurate — only targeted line edits needed.
>
> **Deliverables**:
>
> - Updated `docs/2026-04-20-1314-current-system-state.md` with 4 corrections
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (single file, 4 edits)
> **Critical Path**: Task 1 (all edits) → F1 (verify diff)

---

## Context

### Original Request

User asked to review every section of `docs/2026-04-20-1314-current-system-state.md` against the actual codebase and update any inaccurate or outdated sections.

### Research Summary

6 parallel explore agents verified every section of the 533-line document:

| Section                                    | Agent     | Verdict                                                       |
| ------------------------------------------ | --------- | ------------------------------------------------------------- |
| Inngest Functions (9 total)                | Explore 1 | All 9 correct — IDs, triggers, cron schedules, file paths     |
| Gateway Routes                             | Explore 2 | All routes correct, 1 param name mismatch                     |
| Database Schema (19 models, 18 migrations) | Explore 3 | Counts correct, constraints correct                           |
| Shared Libs, Scripts, Project Structure    | Explore 4 | File counts correct, 1 missing error class in description     |
| Workers + Docker                           | Explore 5 | Harness flow correct, Docker services/images/versions correct |
| Feedback Pipeline + Slack Bolt + Tenants   | Explore 6 | Pipeline correct, handlers correct, tenant config correct     |

### Metis Review

**Identified Gaps** (addressed):

- Verified `ProjectRegistryConflictError` is exported (confirmed: `export class` at `src/lib/errors.ts:81`)
- Verified only 2 Slack processing string variants exist (approve + reject, no others)
- Verified schema defines 3 groups (MVP-Active, Forward-Compatibility, Multi-Tenancy) — doc's "3 groups" text is schema-accurate despite presenting 4 sub-groups (A, B, C, D)

---

## Work Objectives

### Core Objective

Fix 4 verified inaccuracies in the current system state document while preserving everything else unchanged.

### Concrete Deliverables

- `docs/2026-04-20-1314-current-system-state.md` with 4 targeted line edits

### Definition of Done

- [ ] `git diff` shows exactly 4 changed regions, no unrelated modifications

### Must Have

- Fix the `errors.ts` description to include `ProjectRegistryConflictError`
- Fix the admin tasks route param from `:taskId` to `:id`
- Add "UTC" to the feedback-summarizer cron description
- Clarify the Slack processing state text is action-specific

### Must NOT Have (Guardrails)

- No reformatting, reordering, or rephrasing of unrelated text
- No new sections, bullets, or explanatory content added
- No cascading edits — only the 4 verified discrepancies
- No changes to the group structure (A, B, C, D) or "3 groups" text — it is schema-accurate
- No changes to the Mermaid diagrams (they are correct)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: N/A (documentation change)
- **Automated tests**: None
- **Framework**: N/A

### QA Policy

Single task — QA scenario verifies the diff contains exactly the 4 targeted changes and nothing else.

---

## Execution Strategy

### Single Wave (all edits are in the same file, must be sequential)

```
Wave 1:
└── Task 1: Apply all 4 targeted fixes [quick]

Wave FINAL:
└── Task F1: Verify diff shows exactly the targeted changes [quick]
```

### Dependency Matrix

- **1**: None → F1
- **F1**: 1 → Done

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **FINAL**: 1 task — F1 → `quick`

---

## TODOs

- [ ] 1. Apply 4 targeted fixes to current-system-state doc

  **What to do**:

  Apply these 4 edits to `docs/2026-04-20-1314-current-system-state.md`. Use content-anchored `Edit` operations (match on surrounding text, not line numbers). Apply in reverse document order (bottom-to-top) to prevent line number drift.

  **Edit 4 (near line 481) — Add missing error class to `errors.ts` description**:
  Find:

  ```
  | `errors.ts`        | Custom errors: `LLMTimeoutError`, `CostCircuitBreakerError`, `RateLimitExceededError`, `ExternalApiError` |
  ```

  Replace with:

  ```
  | `errors.ts`        | Custom errors: `LLMTimeoutError`, `CostCircuitBreakerError`, `RateLimitExceededError`, `ExternalApiError`, `ProjectRegistryConflictError` |
  ```

  **Edit 3 (near line 323) — Clarify Slack processing state text is action-specific**:
  Find:

  ```
  - **Processing state**: handlers call `(ack as any)({ replace_original: true, blocks: [...] })` — embeds the `⏳ Processing...` message directly in the Socket Mode ack envelope, eliminating any ⚠️ flash
  ```

  Replace with:

  ```
  - **Processing state**: handlers call `(ack as any)({ replace_original: true, blocks: [...] })` — embeds action-specific text (`⏳ Processing approval...` / `⏳ Processing rejection...`) directly in the Socket Mode ack envelope, eliminating any ⚠️ flash
  ```

  **Edit 2 (near line 310) — Fix route param name**:
  Find:

  ```
  | `GET`    | `/admin/tenants/:tenantId/tasks/:taskId`           | Get task status (tenant-scoped)                 |
  ```

  Replace with:

  ```
  | `GET`    | `/admin/tenants/:tenantId/tasks/:id`               | Get task status (tenant-scoped)                 |
  ```

  **Edit 1 (near line 231) — Add UTC timezone to cron description**:
  Find:

  ```
  Note over SL,LLM: Weekly Summary (Sunday midnight cron)
  ```

  Replace with:

  ```
  Note over SL,LLM: Weekly Summary (Sunday midnight UTC cron)
  ```

  **Must NOT do**:
  - Do not reformat, reorder, or rephrase any text outside these 4 edits
  - Do not modify Mermaid diagrams beyond the one note text change
  - Do not add new sections or content
  - Do not "fix" adjacent text that looks off but wasn't in the verified discrepancy list
  - Do not change the "3 groups" text or group ordering (A, B, D, C) — it is schema-accurate

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 4 targeted text replacements in a single markdown file — trivial edit task
  - **Skills**: []
    - No specialized skills needed for markdown editing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: F1
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-04-20-1314-current-system-state.md` — the file to edit. Read it first to confirm the exact text to match.

  **Source-of-truth References** (why each fix is correct):
  - `src/lib/errors.ts:81` — `export class ProjectRegistryConflictError extends Error` (confirms the 5th error class exists and is exported)
  - `src/gateway/slack/handlers.ts:186,263` — actual strings are `'⏳ Processing approval...'` and `'⏳ Processing rejection...'` (confirms action-specific text)
  - `src/gateway/routes/admin-tasks.ts:17` — route uses `:id` param not `:taskId`
  - `src/inngest/triggers/feedback-summarizer.ts:31` — cron `0 0 * * 0` with no timezone = UTC

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 edits applied correctly
    Tool: Bash (grep)
    Preconditions: Edits have been applied to the file
    Steps:
      1. Run: grep -n "ProjectRegistryConflictError" docs/2026-04-20-1314-current-system-state.md
      2. Assert: Returns exactly 1 line in the errors.ts description row
      3. Run: grep -n "Processing approval" docs/2026-04-20-1314-current-system-state.md
      4. Assert: Returns exactly 1 line near the Slack Bolt section
      5. Run: grep -n "tasks/:id" docs/2026-04-20-1314-current-system-state.md
      6. Assert: Returns exactly 1 line (the admin tasks route)
      7. Run: grep -n "tasks/:taskId" docs/2026-04-20-1314-current-system-state.md
      8. Assert: Returns 0 lines (old param name no longer present)
      9. Run: grep -n "Sunday midnight UTC" docs/2026-04-20-1314-current-system-state.md
      10. Assert: Returns exactly 1 line in the Mermaid diagram note
    Expected Result: All 5 grep assertions pass
    Failure Indicators: Any grep returns unexpected count
    Evidence: .sisyphus/evidence/task-1-grep-verification.txt

  Scenario: No unintended changes
    Tool: Bash (git diff)
    Preconditions: Edits applied, file not yet committed
    Steps:
      1. Run: git diff --stat docs/2026-04-20-1314-current-system-state.md
      2. Assert: Shows exactly 1 file changed
      3. Run: git diff docs/2026-04-20-1314-current-system-state.md | grep "^[-+]" | grep -v "^[-+][-+][-+]" | wc -l
      4. Assert: Returns 8 (4 removed lines + 4 added lines)
    Expected Result: Diff contains exactly 4 changed line pairs
    Failure Indicators: More than 8 changed lines indicates scope creep
    Evidence: .sisyphus/evidence/task-1-diff-check.txt
  ```

  **Commit**: YES
  - Message: `docs: fix 4 minor inaccuracies in current-system-state doc`
  - Files: `docs/2026-04-20-1314-current-system-state.md`
  - Pre-commit: N/A

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 1 review agent verifies the changes. Present results to user for approval.

- [ ] F1. **Diff Audit** — `quick`
      Run `git diff docs/2026-04-20-1314-current-system-state.md`. Verify exactly 4 changed regions. Verify each change matches the planned edit. Flag any unintended modifications.
      Output: `Edits [4/4 correct] | Unintended changes [0] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **1**: `docs: fix 4 minor inaccuracies in current-system-state doc` — `docs/2026-04-20-1314-current-system-state.md`

---

## Success Criteria

### Verification Commands

```bash
grep -c "ProjectRegistryConflictError" docs/2026-04-20-1314-current-system-state.md  # Expected: 1
grep -c "Processing approval" docs/2026-04-20-1314-current-system-state.md            # Expected: 1
grep -c "tasks/:id" docs/2026-04-20-1314-current-system-state.md                      # Expected: 1
grep -c "tasks/:taskId" docs/2026-04-20-1314-current-system-state.md                  # Expected: 0
grep -c "Sunday midnight UTC" docs/2026-04-20-1314-current-system-state.md             # Expected: 1
```

### Final Checklist

- [ ] All 4 edits applied with exact text matches
- [ ] No unrelated modifications in the file
- [ ] Git diff shows exactly 4 changed line pairs
