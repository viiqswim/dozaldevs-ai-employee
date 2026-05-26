# No-Approval Delivery Phase Fix

## TL;DR

> **Quick Summary**: Fix the delivery gap where employees with `approval_required: false` skip the `Delivering` phase entirely, causing deliverables to be created but never delivered. Rewrite archetype instructions so employees draft content without posting, then add a container-based delivery phase to the no-approval lifecycle path.
>
> **Deliverables**:
>
> - Modified `employee-lifecycle.ts` with `Delivering` phase in the no-approval path
> - Rewritten `instructions` for 4 archetypes (remove direct Slack posting from execution)
> - Added `delivery_instructions` for 5 archetypes (code-rotation, jira-motivator, motivation-bot-2, inspiration-2, schedule-generator)
> - SQL migration script for non-seeded archetype updates
> - Updated seed data for code-rotation and jira-motivator
> - Soft-deleted `qa-time-est-test` archetype
> - Committed DebugTab.tsx change (horizontal dividers)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (DebugTab commit) can start immediately | Wave 1 (Tasks 2, 3, 4) all parallel → Wave 2: Task 5 (lifecycle code) + Task 6 (DB apply) → Wave 3: Task 7 (Docker rebuild + E2E) → Final Wave

---

## Context

### Original Request

User reported that employees with `approval_required: false` (motivation bots, inspiration, code-rotation, etc.) had deliverables created in the DB but never actually delivered — content was never posted to Slack threads. Investigation confirmed the lifecycle goes `Submitting → Done` without visiting `Delivering`.

### Interview Summary

**Key Discussions**:

- User chose **container-based delivery** over lightweight in-lifecycle delivery — all archetypes should have `delivery_instructions` and use the same delivery container mechanism as the approval path.
- User chose **Model B (rewrite instructions)** — archetype `instructions` should be rewritten to draft content without posting to Slack during execution. The delivery container handles posting. This prevents double-posting.
- User chose to **soft-delete** the `qa-time-est-test` archetype (test data, empty `deliverable_type`, fake channel).
- User chose **SQL script** for updating non-seeded archetypes (committed to repo, auditable).

**Research Findings**:

- 6 of 8 archetypes have `approval_required: false` AND missing/empty `delivery_instructions`
- 4 of those are NOT in `prisma/seed.ts` (created via admin API/dashboard): `real-estate-motivation-bot-2`, `daily-real-estate-inspiration-2`, `schedule-generator-thornton`, `qa-time-est-test`
- 2 ARE in seed: `code-rotation` (null), `jira-ticket-motivator` (empty string '')
- The delivery container (`EMPLOYEE_PHASE: 'delivery'`) reads `delivery_instructions` from the archetype and `deliverable.content` from DB, then runs an OpenCode session with the instructions
- Employees like `daily-real-estate-inspiration-2` currently post directly to Slack during execution via `/tools/slack/post-message.ts` — their instructions explicitly say "Post the complete personalized message to Slack"
- The `NO_ACTION_NEEDED` classification check (line 942) only runs for approval-required employees — no-approval employees never check if delivery should be skipped

### Metis Review

**Identified Gaps** (addressed):

- **Double-posting risk**: Resolved by choosing Model B — rewrite instructions to draft, not post
- **`NO_ACTION_NEEDED` classification check missing in no-approval path**: Added as explicit requirement — no-approval path must check classification before spinning up delivery container
- **`tenantEnvForApproval` scope**: No-approval delivery needs its own `tenantEnv` load
- **Notify message timing**: "✅ Task complete" must move to AFTER delivery succeeds, not before
- **Execution machine cleanup order**: Must destroy execution machine BEFORE spawning delivery container (Docker name conflicts)
- **`qa-time-est-test` edge case**: Resolved by soft-deleting it
- **Empty `deliverable_type` guard**: Add guard to skip delivery if `deliverable_type` is empty/null

---

## Work Objectives

### Core Objective

Make all employees deliver their content through the container-based delivery phase, regardless of `approval_required` setting. Employees draft during execution; delivery container posts.

### Concrete Deliverables

- `src/inngest/employee-lifecycle.ts` — modified no-approval path with Delivering phase
- `prisma/seed.ts` — updated `delivery_instructions` and `instructions` for code-rotation and jira-motivator
- `scripts/2026-05-25-update-archetype-delivery.sql` — SQL script for non-seeded archetype updates
- `dashboard/src/panels/employees/DebugTab.tsx` — committed (already modified, pending commit)

### Definition of Done

- [ ] Triggering `real-estate-motivation-bot-2` produces a `Delivering` state in `task_status_log`
- [ ] Content appears in Slack notification thread exactly ONCE (no double-posting)
- [ ] `task_status_log` shows `Submitting → Delivering → Done` for no-approval employees
- [ ] All archetypes (except soft-deleted `qa-time-est-test`) have non-empty `delivery_instructions`
- [ ] `NO_ACTION_NEEDED` classifications skip the delivery container

### Must Have

- Delivery phase in no-approval lifecycle path
- `delivery_instructions` on all active archetypes
- `NO_ACTION_NEEDED` classification check before delivery container launch
- Instructions rewritten to draft without posting for affected archetypes
- Execution machine destroyed before delivery container starts

### Must NOT Have (Guardrails)

- No changes to the approval path (lines 1758–2220) — it works correctly
- No changes to deprecated files (`lifecycle.ts`, `redispatch.ts`, etc.)
- No double-posting — employee must NOT post to Slack during execution AND delivery
- No delivery container spawn if `deliverable_type` is empty/null
- No hard deletes — use `deleted_at` timestamp for `qa-time-est-test`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (user constraint — known timeout issues with test suite)
- **Framework**: vitest (not used for this plan)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Lifecycle changes**: Use Bash (curl to trigger, psql to verify state transitions)
- **Seed/SQL changes**: Use Bash (psql to verify data after apply)
- **Dashboard changes**: Already verified in prior session (LSP clean)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent tasks):
├── Task 1: Commit DebugTab change [quick]
├── Task 2: Update seed.ts — delivery_instructions + instruction rewrites for code-rotation, jira-motivator [unspecified-high]
├── Task 3: Write SQL migration script for non-seeded archetypes [unspecified-high]
└── Task 4: Soft-delete qa-time-est-test archetype [quick]

Wave 2 (After Wave 1 — lifecycle modification):
├── Task 5: Add Delivering phase to no-approval path in employee-lifecycle.ts [deep]
└── Task 6: Database backup + apply seed + run SQL script [quick]

Wave 3 (After Wave 2 — E2E verification):
└── Task 7: Docker rebuild + E2E trigger verification [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On                                            | Blocks | Wave |
| ---- | ----------------------------------------------------- | ------ | ---- |
| 1    | None                                                  | None   | 1    |
| 2    | None                                                  | 5, 6   | 1    |
| 3    | None                                                  | 6      | 1    |
| 4    | None                                                  | 6      | 1    |
| 5    | 2, 3 (for understanding delivery_instructions format) | 7      | 2    |
| 6    | 2, 3, 4                                               | 7      | 2    |
| 7    | 5, 6                                                  | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `unspecified-high`, T3 → `unspecified-high`, T4 → `quick`
- **Wave 2**: 2 tasks — T5 → `deep`, T6 → `quick`
- **Wave 3**: 1 task — T7 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Commit DebugTab horizontal dividers change

  **What to do**:
  - Stage and commit the already-modified `dashboard/src/panels/employees/DebugTab.tsx`
  - This file has the `LayeredContentView` component that renders horizontal `<hr>` dividers between AGENTS.md layers in the debug tab's rendered mode
  - Commit message: `feat(dashboard): add horizontal dividers between AGENTS.md layers in debug tab`

  **Must NOT do**:
  - Do not modify any other files
  - Do not run the full test suite (known timeout issues)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `dashboard/src/panels/employees/DebugTab.tsx` — the already-modified file with `LayeredContentView` component

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify commit succeeded
    Tool: Bash
    Steps:
      1. Run `git add dashboard/src/panels/employees/DebugTab.tsx`
      2. Run `git commit -m "feat(dashboard): add horizontal dividers between AGENTS.md layers in debug tab"`
      3. Run `git log -1 --oneline` to verify commit
    Expected Result: Commit created successfully with the exact message
    Evidence: .sisyphus/evidence/task-1-commit-debugtab.txt
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add horizontal dividers between AGENTS.md layers in debug tab`
  - Files: `dashboard/src/panels/employees/DebugTab.tsx`

- [x] 2. Update seed.ts — add delivery_instructions and rewrite instructions for code-rotation and jira-motivator

  **What to do**:
  - In `prisma/seed.ts`, update the `code-rotation` archetype (both `create` and `update` blocks):
    - Change `delivery_instructions: null` to a meaningful delivery instruction string
    - Rewrite the `instructions` field to REMOVE the direct Slack post-message call (`tsx /tools/slack/post-message.ts --thread-ts "$NOTIFY_MSG_TS" --channel "$NOTIFICATION_CHANNEL" --text "<summary>"`) — instead, the employee should write its summary to `/tmp/summary.txt` and call `submit-output`
    - The delivery_instructions should be: `Post the rotation summary to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.`
  - In `prisma/seed.ts`, update the `jira-motivation-bot` archetype (both `create` and `update` blocks):
    - Change `delivery_instructions: ''` to: `Post the motivational message to the configured Slack notification channel. Write confirmation to /tmp/summary.txt with { "delivered": true }.`
    - Rewrite the `instructions` field to REMOVE the direct Slack posting instruction ("Post the motivational message to the team Slack channel") — instead, compose the message and write it as the deliverable content via `submit-output`
  - CRITICAL: Both create AND update blocks must be updated (seed uses upsert)
  - CRITICAL: The `instructions` must still contain all the business logic (quote selection, personalization, etc.) — only remove the Slack posting step and replace with submit-output

  **Must NOT do**:
  - Do not change any other archetype in seed.ts
  - Do not modify the model, tool_registry, risk_model, or other config fields
  - Do not remove business logic from instructions — only remove Slack posting and add submit-output

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers archetype schema fields, seed data patterns, and the 4-step checklist

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:3178-3179` — existing `delivery_instructions` for daily-summarizer (pattern to follow)
  - `prisma/seed.ts:3281-3310` — existing `delivery_instructions` for guest-messaging (detailed step-by-step pattern)
  - `prisma/seed.ts:3393` — code-rotation `delivery_instructions: null` (line to change)
  - `prisma/seed.ts:3437` — code-rotation update block `delivery_instructions: null` (line to change)
  - `prisma/seed.ts:3473` — jira-motivation-bot `delivery_instructions: ''` (line to change)
  - `prisma/seed.ts:3499` — jira-motivation-bot update block `delivery_instructions: ''` (line to change)

  **Instructions to rewrite**:
  - `prisma/seed.ts:3402-3426` — code-rotation instructions (create block) — REMOVE the `tsx /tools/slack/post-message.ts` call on line ~3416, replace with submit-output call
  - `prisma/seed.ts:3456-3464` — jira-motivation-bot instructions (create block) — REMOVE "Post the motivational message to the team Slack channel" and replace with submit-output

  **Harness reference** (how delivery container works):
  - `src/workers/opencode-harness.mts:646-719` — delivery phase: reads `deliverable.content`, validates `delivery_instructions`, builds prompt, runs OpenCode session

  **WHY Each Reference Matters**:
  - The summarizer `delivery_instructions` is the canonical pattern for "post to Slack" delivery — follow its style
  - The guest-messaging `delivery_instructions` shows how detailed instructions can be when the delivery action is complex
  - The harness code shows that `delivery_instructions` becomes the prompt for the delivery OpenCode session, with the deliverable content appended as `--- APPROVED CONTENT ---`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify seed.ts compiles after changes
    Tool: Bash
    Steps:
      1. Run `npx tsc --noEmit prisma/seed.ts` (or the project-level tsc)
      2. Verify no TypeScript errors related to seed.ts
    Expected Result: No compilation errors
    Evidence: .sisyphus/evidence/task-2-tsc-check.txt

  Scenario: Verify code-rotation delivery_instructions is set in both blocks
    Tool: Bash (grep)
    Steps:
      1. Search seed.ts for code-rotation archetype create and update blocks
      2. Verify delivery_instructions is a non-empty, non-null string in both blocks
      3. Verify instructions no longer contain `tsx /tools/slack/post-message.ts`
      4. Verify instructions still contain `submit-output` call
    Expected Result: Both blocks have delivery_instructions set; no direct Slack posting in instructions
    Evidence: .sisyphus/evidence/task-2-code-rotation-verify.txt

  Scenario: Verify jira-motivator delivery_instructions is set in both blocks
    Tool: Bash (grep)
    Steps:
      1. Search seed.ts for jira-motivation-bot archetype create and update blocks
      2. Verify delivery_instructions is a non-empty string in both blocks
      3. Verify instructions no longer contain "Post the motivational message to the team Slack channel"
      4. Verify instructions contain submit-output call
    Expected Result: Both blocks have delivery_instructions set; no direct Slack posting
    Evidence: .sisyphus/evidence/task-2-jira-motivator-verify.txt
  ```

  **Commit**: YES (groups with Tasks 3, 4)
  - Message: `fix(lifecycle): add delivery_instructions to all archetypes and rewrite instructions for draft-only execution`
  - Files: `prisma/seed.ts`

- [x] 3. Write SQL migration script for non-seeded archetype updates

  **What to do**:
  - Create `scripts/2026-05-25-update-archetype-delivery.sql` with SQL statements to update the 3 non-seeded archetypes (motivation-bot-2, inspiration-2, schedule-generator-thornton)
  - For each archetype, the SQL must:
    1. Update `delivery_instructions` to a non-empty delivery instruction string
    2. Rewrite `instructions` to remove direct Slack posting and replace with submit-output
  - Specific updates:

  **`real-estate-motivation-bot-2`** (id: `561439b9-7491-40de-a550-95906624fffc`):
  - `delivery_instructions`: `'Post the motivational message to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.'`
  - `instructions`: Remove "Post the motivational content to Slack in a single call: tsx /tools/slack/post-message.ts..." and the following lines about combining into one --text value. Replace with: compose the message and submit via `tsx /tools/platform/submit-output.ts --summary "<one sentence>" --classification "NO_ACTION_NEEDED"`

  **`daily-real-estate-inspiration-2`** (id: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`):
  - `delivery_instructions`: `'Post the inspirational message to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.'`
  - `instructions`: Remove "Post the complete personalized message to Slack." at the end. Replace with: compose the message and submit via `tsx /tools/platform/submit-output.ts --summary "<one sentence>" --classification "NO_ACTION_NEEDED"`. Keep ALL the business logic (variety mandate, anti-repetition, structure variety, actionable insight requirements).

  **`schedule-generator-thornton`** (id: `00000000-0000-0000-0000-000000000017`):
  - `delivery_instructions`: `'Upload the generated schedule file to the configured Slack notification channel. If the deliverable content references a file path, upload that file. Otherwise, post the schedule text as a Slack message. Write confirmation to /tmp/summary.txt with { "delivered": true }.'`
  - `instructions`: This archetype's instructions are very long and reference database queries. The key change: find the step where it posts to Slack and replace with submit-output. The full instructions text is in the DB (it was truncated in our investigation). Read the full instructions from DB first, then write the updated version.

  - The SQL script must be idempotent (use `WHERE id = '...'` conditions)
  - Include a comment header explaining what this script does and when to run it
  - Include verification queries at the end (SELECT to confirm changes took effect)

  **Must NOT do**:
  - Do not use DELETE or TRUNCATE — updates only
  - Do not modify any archetype fields other than `instructions` and `delivery_instructions`
  - Do not modify seeded archetypes (those are handled in Task 2)
  - Do not strip business logic from instructions — only replace Slack posting with submit-output

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers archetype schema fields and seed data patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:

  **Data References** (current archetype state):
  - Database query: `SELECT id, role_name, instructions, delivery_instructions FROM archetypes WHERE role_name IN ('real-estate-motivation-bot-2', 'daily-real-estate-inspiration-2', 'schedule-generator-thornton') AND deleted_at IS NULL;`
  - `real-estate-motivation-bot-2` id: `561439b9-7491-40de-a550-95906624fffc`
  - `daily-real-estate-inspiration-2` id: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
  - `schedule-generator-thornton` id: `00000000-0000-0000-0000-000000000017`

  **Pattern References**:
  - `prisma/seed.ts:3178-3179` — canonical delivery_instructions pattern for Slack posting
  - `src/workers/opencode-harness.mts:646-681` — how the delivery container uses delivery_instructions

  **WHY Each Reference Matters**:
  - Must read full `instructions` from DB before rewriting (truncated in investigation — schedule-generator has very long instructions)
  - The delivery_instructions pattern from the summarizer shows the expected format
  - The harness code shows how `delivery_instructions` becomes the delivery prompt with `--- APPROVED CONTENT ---` appended

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify SQL script is syntactically valid
    Tool: Bash
    Steps:
      1. Run the SQL script against the database: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -f scripts/2026-05-25-update-archetype-delivery.sql`
      2. Verify no SQL errors
      3. Run the verification queries at the end of the script
    Expected Result: All 3 archetypes show non-empty delivery_instructions; instructions contain submit-output; instructions do NOT contain direct Slack posting commands
    Evidence: .sisyphus/evidence/task-3-sql-verify.txt

  Scenario: Verify idempotency
    Tool: Bash
    Steps:
      1. Run the SQL script a second time
      2. Verify no errors on re-run
      3. Verify values are unchanged from first run
    Expected Result: Script runs cleanly on second execution with identical results
    Evidence: .sisyphus/evidence/task-3-idempotency.txt
  ```

  **Commit**: YES (groups with Tasks 2, 4)
  - Message: `fix(lifecycle): add delivery_instructions to all archetypes and rewrite instructions for draft-only execution`
  - Files: `scripts/2026-05-25-update-archetype-delivery.sql`

- [x] 4. Soft-delete qa-time-est-test archetype

  **What to do**:
  - Add a SQL statement to the script from Task 3 (or include in the same file) that sets `deleted_at = NOW()` on the `qa-time-est-test` archetype
  - Archetype id: `b77c5176-8a33-46f3-a3ff-f1526addd286`
  - `UPDATE archetypes SET deleted_at = NOW(), updated_at = NOW() WHERE id = 'b77c5176-8a33-46f3-a3ff-f1526addd286' AND deleted_at IS NULL;`

  **Must NOT do**:
  - Do not hard DELETE the row — soft delete only
  - Do not modify any other archetypes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3) — can be part of Task 3's SQL script
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `b77c5176-8a33-46f3-a3ff-f1526addd286` — qa-time-est-test archetype ID
  - AGENTS.md "Soft deletes only" convention

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify soft-delete applied
    Tool: Bash
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, deleted_at IS NOT NULL AS is_deleted FROM archetypes WHERE role_name = 'qa-time-est-test';"`
    Expected Result: `is_deleted = true`
    Evidence: .sisyphus/evidence/task-4-soft-delete.txt

  Scenario: Verify archetype no longer appears in active queries
    Tool: Bash
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM archetypes WHERE deleted_at IS NULL AND role_name = 'qa-time-est-test';"`
    Expected Result: count = 0
    Evidence: .sisyphus/evidence/task-4-not-in-active.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `fix(lifecycle): add delivery_instructions to all archetypes and rewrite instructions for draft-only execution`
  - Files: included in `scripts/2026-05-25-update-archetype-delivery.sql`

- [x] 5. Add Delivering phase to no-approval path in employee-lifecycle.ts

  **What to do**:
  This is the core lifecycle change. Modify the `if (!approvalRequired)` branch (lines 814–938) to add a Delivering phase between Submitting and Done.

  **High-level structure of the modified no-approval path**:

  ```
  if (!approvalRequired) {
    // 1. Check classification (NEW — moved from approval-only path)
    //    - Read deliverable, parse classification
    //    - If NO_ACTION_NEEDED: go straight to Done (skip delivery), update notify msg, cleanup, return

    // 2. Check deliverable_type guard (NEW)
    //    - If deliverable_type is empty/null: go straight to Done (skip delivery), log warning

    // 3. Destroy execution machine (MOVED — must happen before delivery container)

    // 4. Transition to Delivering state (NEW)
    //    - patchTask status to 'Delivering'
    //    - logStatusTransition 'Delivering' from 'Submitting'

    // 5. Load tenant env fresh (NEW — can't reuse approval-path variable)
    //    - Use PrismaClient + loadTenantEnv (same pattern as line 822-831)

    // 6. Fetch delivery_instructions from archetype (NEW — same pattern as line 1887-1894)
    //    - If missing: mark Failed, update notify msg, return

    // 7. Spawn delivery container (NEW — same pattern as lines 2006-2076)
    //    - Set EMPLOYEE_PHASE: 'delivery'
    //    - Set all env vars (tenantEnv, TASK_ID, etc.)
    //    - Use retry loop (3 attempts, same as approval path)
    //    - Poll for Done/Failed status
    //    - Destroy delivery container after each attempt

    // 8. Handle delivery result (NEW)
    //    - If Done: update notify msg to "✅ Task complete", record metric
    //    - If Failed: update notify msg to "❌ Failed", mark task failed

    // 9. Best-effort cleanup of stale approval cards (KEPT — existing code)

    // 10. Record work metric (KEPT — existing code, moved to after delivery)
  }
  ```

  **Critical implementation details**:
  1. **Classification check**: Copy the logic from lines 942–966 (`check-classification` step). Read deliverable, parse with `parseClassifyResponse`, check if `NO_ACTION_NEEDED`. If so, skip delivery entirely — go straight to Done with the existing simple path (lines 816-938). The `NO_ACTION_NEEDED` path should also post the override card and no-action thread reply (same as lines 985-1136 in the approval path classification block).

  2. **`deliverable_type` guard**: Read `archetype.deliverable_type`. If empty/null, log a warning and skip delivery — go straight to Done.

  3. **Machine cleanup order**: The execution machine must be destroyed BEFORE the delivery container starts. Currently `cleanup-no-approval` (lines 923-937) happens AFTER the `complete` step. Move it to happen BEFORE the delivery container is spawned.

  4. **`tenantEnv` loading**: Create a fresh `tenantEnv` load for the delivery section. Pattern:

  ```typescript
  const prismaForDelivery = new PrismaClient();
  const tenantEnvForDelivery = await loadTenantEnv(
    tenantId,
    {
      tenantRepo: new TenantRepository(prismaForDelivery),
      secretRepo: new TenantSecretRepository(prismaForDelivery),
    },
    (archetype.notification_channel as string | null) ?? null,
  );
  await prismaForDelivery.$disconnect();
  ```

  5. **Delivery container env**: Match the approval path (lines 2030-2050) but use `tenantEnvForDelivery` instead of `tenantEnvForApproval`. Include TASK_ID, EMPLOYEE_PHASE='delivery', EMPLOYEE_ROLE_NAME, APPROVAL_REQUIRED, NOTIFY_MSG_TS, SUPABASE_URL (with host.docker.internal replacement for local mode), SUPABASE_SECRET_KEY, INNGEST_BASE_URL, INNGEST_EVENT_KEY, INNGEST_DEV.

  6. **Notify message update timing**: Do NOT update the notify message to "✅ Task complete" before delivery. Update it AFTER the delivery container finishes successfully. If delivery fails, update to "❌ Failed".

  7. **Step naming**: Use unique Inngest step names that don't conflict with approval-path step names. Suggested: `'check-classification-no-approval'`, `'cleanup-execution-machine'`, `'delivering-no-approval'`, `'complete-after-delivery'`, `'record-work-metric-after-delivery'`.

  **Must NOT do**:
  - Do not modify the approval path (lines 1758–2220)
  - Do not modify the `NO_ACTION_NEEDED` classification path for approval-required employees (lines 968-1136)
  - Do not introduce new imports — all needed utilities are already imported
  - Do not change step names of existing steps that other code might reference
  - Do not add employee-specific language (shared file must stay employee-agnostic per AGENTS.md conventions)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
    - No specific skills needed — this is core lifecycle code modification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — depends on Wave 1)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 2, 3 (need to understand delivery_instructions format)

  **References**:

  **Pattern References** (existing code to follow — CRITICAL):
  - `src/inngest/employee-lifecycle.ts:814-938` — current no-approval path (the code being modified)
  - `src/inngest/employee-lifecycle.ts:942-966` — classification check logic to copy for no-approval path
  - `src/inngest/employee-lifecycle.ts:968-1136` — NO_ACTION_NEEDED handling (override card, no-action thread reply) to copy
  - `src/inngest/employee-lifecycle.ts:1887-1934` — delivery_instructions fetch and null check pattern
  - `src/inngest/employee-lifecycle.ts:2006-2076` — delivery container env setup and spawn pattern (LOCAL + FLY modes)
  - `src/inngest/employee-lifecycle.ts:2082-2157` — delivery polling, retry, failure handling pattern
  - `src/inngest/employee-lifecycle.ts:820-831` — `tenantEnv` loading pattern for no-approval path

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:1-50` — imports (parseClassifyResponse, runLocalDockerContainer, stopLocalDockerContainer, etc.)
  - `src/inngest/lib/` — shared utilities: `clearPendingApprovalByTaskId`, `recordWorkMetric`, etc.

  **WHY Each Reference Matters**:
  - Lines 814-938 are the code being modified — must understand the full existing flow
  - Lines 942-966 show exactly how to read and parse the deliverable classification — copy this logic
  - Lines 968-1136 show the NO_ACTION_NEEDED override card posting — this needs to be available in the no-approval path too
  - Lines 2006-2076 show the EXACT delivery container setup for both local Docker and Fly.io — must match
  - Lines 2082-2157 show polling, retry (3 attempts), and failure handling — must replicate

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds
    Tool: Bash
    Steps:
      1. Run `npx tsc --noEmit`
      2. Check for any errors in employee-lifecycle.ts
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-5-tsc-check.txt

  Scenario: Verify classification check exists in no-approval path
    Tool: Bash (grep)
    Steps:
      1. Search employee-lifecycle.ts for 'check-classification-no-approval' step name
      2. Verify parseClassifyResponse is called within the no-approval branch
    Expected Result: Classification check step exists in the no-approval code path
    Evidence: .sisyphus/evidence/task-5-classification-check.txt

  Scenario: Verify Delivering state transition in no-approval path
    Tool: Bash (grep)
    Steps:
      1. Search employee-lifecycle.ts for `status: 'Delivering'` within the no-approval branch
      2. Verify logStatusTransition call with 'Delivering'
    Expected Result: Delivering state transition exists in no-approval path
    Evidence: .sisyphus/evidence/task-5-delivering-state.txt

  Scenario: Verify delivery container spawn in no-approval path
    Tool: Bash (grep)
    Steps:
      1. Search employee-lifecycle.ts for `EMPLOYEE_PHASE: 'delivery'` — should appear in BOTH approval and no-approval paths
      2. Verify the no-approval delivery uses `tenantEnvForDelivery` (not `tenantEnvForApproval`)
    Expected Result: Two delivery container spawn points exist; no-approval uses its own tenantEnv
    Evidence: .sisyphus/evidence/task-5-delivery-container.txt

  Scenario: Verify notify message update is after delivery (not before)
    Tool: Bash (code review)
    Steps:
      1. In the no-approval path, find the "Task complete" notify message update
      2. Verify it appears AFTER the delivery polling loop, not before
    Expected Result: Notify update follows delivery completion
    Evidence: .sisyphus/evidence/task-5-notify-timing.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): add Delivering phase to no-approval path with classification check`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `npx tsc --noEmit`

- [x] 6. Database backup + apply seed + run SQL script

  **What to do**:
  - Back up the database FIRST (MANDATORY before any data changes):
    ```bash
    TS=$(date "+%Y-%m-%d-%H%M")
    BACKUP_DIR="database-backups/$TS"
    mkdir -p "$BACKUP_DIR"
    docker exec shared-postgres pg_dump -U postgres -d ai_employee --format=plain > "$BACKUP_DIR/full-dump.sql"
    docker exec shared-postgres pg_dump -U postgres -d ai_employee -t archetypes --data-only --inserts > "$BACKUP_DIR/archetypes.sql"
    ```
  - Run the seed to apply code-rotation and jira-motivator changes:
    ```bash
    pnpm prisma db seed
    ```
  - Run the SQL migration script for non-seeded archetypes:
    ```bash
    psql postgresql://postgres:postgres@localhost:54322/ai_employee -f scripts/2026-05-25-update-archetype-delivery.sql
    ```
  - Verify all archetypes have delivery_instructions set

  **Must NOT do**:
  - Do not skip the database backup
  - Do not run seed without backup
  - Do not modify the SQL script — just execute it

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — after Wave 1)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:
  - AGENTS.md "Database Backup (MANDATORY)" section — backup procedure
  - `scripts/2026-05-25-update-archetype-delivery.sql` — the SQL script from Task 3

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify backup exists
    Tool: Bash
    Steps:
      1. List database-backups/ directory
      2. Verify the latest backup contains full-dump.sql and archetypes.sql
      3. Verify full-dump.sql is non-empty (> 1KB)
    Expected Result: Backup files exist and are non-empty
    Evidence: .sisyphus/evidence/task-6-backup-verify.txt

  Scenario: Verify all active archetypes have delivery_instructions
    Tool: Bash
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, delivery_instructions IS NOT NULL AND delivery_instructions != '' AS has_instr FROM archetypes WHERE deleted_at IS NULL;"`
    Expected Result: ALL rows show has_instr = true
    Evidence: .sisyphus/evidence/task-6-delivery-instr-verify.txt

  Scenario: Verify qa-time-est-test is soft-deleted
    Tool: Bash
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, deleted_at IS NOT NULL AS is_deleted FROM archetypes WHERE role_name = 'qa-time-est-test';"`
    Expected Result: is_deleted = true
    Evidence: .sisyphus/evidence/task-6-softdelete-verify.txt

  Scenario: Verify instructions no longer contain direct Slack posting
    Tool: Bash
    Steps:
      1. Run: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name FROM archetypes WHERE deleted_at IS NULL AND instructions LIKE '%post-message.ts%' AND (risk_model->>'approval_required')::boolean = false;"`
    Expected Result: 0 rows returned (no no-approval archetype has direct Slack posting in instructions). Note: code-rotation may still reference post-message.ts in its tool_registry — that's fine, as long as the instructions don't tell the employee to call it.
    Evidence: .sisyphus/evidence/task-6-no-slack-posting.txt
  ```

  **Commit**: NO (data changes only, no code changes)

- [x] 7. Docker rebuild + E2E trigger verification

  **What to do**:
  - Rebuild the Docker worker image to pick up the lifecycle changes:
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
  - Ensure `pnpm dev` is running (gateway, Inngest, Docker Compose)
  - Trigger `real-estate-motivation-bot-2` and verify end-to-end:
    ```bash
    source .env
    TASK_ID=$(curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id')
    ```
  - Wait ~120s, then verify:
    1. Task reached `Done` status
    2. `task_status_log` shows `Delivering` was visited
    3. Slack channel `C0960S2Q8RL` has exactly ONE new message (not double-posted)
    4. Notify message updated to ✅ (not stuck at ⏳)
    5. Deliverable status updated from `pending` to `delivered`

  **Must NOT do**:
  - Do not skip Docker rebuild — lifecycle changes won't take effect without it
  - Do not run the full test suite

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Wave 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 6

  **References**:
  - AGENTS.md "Long-Running Commands" section — Docker build needs tmux
  - AGENTS.md "Recommended Test Employee" section — `real-estate-motivation-bot-2`
  - AGENTS.md "Feature Verification Checklist" section — real-world verification requirements

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify task reaches Done with Delivering state
    Tool: Bash
    Steps:
      1. Trigger real-estate-motivation-bot-2 via curl
      2. Wait 120 seconds
      3. Check task status: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"`
      4. Check status log: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT from_status, to_status FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"`
    Expected Result: status = 'Done'; task_status_log contains row with to_status = 'Delivering'
    Failure Indicators: status stuck at 'Submitting' or 'Delivering'; no 'Delivering' row in log
    Evidence: .sisyphus/evidence/task-7-e2e-status.txt

  Scenario: Verify no double-posting in Slack
    Tool: Bash (Slack API)
    Steps:
      1. After task completes, check Slack channel C0960S2Q8RL for messages from the bot in the last 5 minutes
      2. Count messages related to this task (by thread_ts or task ID context block)
    Expected Result: Exactly 1 content message (from delivery container), plus 1 notify message (lifecycle). NOT 2 content messages.
    Failure Indicators: Two identical or similar motivational messages posted
    Evidence: .sisyphus/evidence/task-7-no-double-post.txt

  Scenario: Verify delivery container ran successfully
    Tool: Bash
    Steps:
      1. Check Docker container logs: `docker logs employee-delivery-${TASK_ID:0:8} 2>&1 | tail -30`
      2. Verify no "missing delivery_instructions" error
      3. Verify "delivered" confirmation in logs
    Expected Result: Container ran, no delivery_instructions errors, delivered=true
    Failure Indicators: "Archetype missing delivery_instructions" in logs
    Evidence: .sisyphus/evidence/task-7-delivery-container.txt

  Scenario: Verify notify message updated to Done
    Tool: Bash
    Steps:
      1. Check the notify message timestamp in task metadata or status log
      2. Verify the Slack message at that timestamp shows ✅ (not ⏳)
    Expected Result: Notify message shows task complete
    Evidence: .sisyphus/evidence/task-7-notify-updated.txt
  ```

  **Commit**: NO (E2E verification only, no code changes)

- [x] 8. Notify completion via Telegram

  **What to do**:
  - Send a Telegram notification: `tsx scripts/telegram-notify.ts "✅ no-approval-delivery plan complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After Final Wave
  - **Blocks**: None
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: `tsx scripts/telegram-notify.ts "✅ no-approval-delivery plan complete — All tasks done. Come back to review results."`
    Expected Result: Script exits with code 0
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Trigger `real-estate-motivation-bot-2` via admin API. Verify: task reaches Done, `task_status_log` shows Delivering, Slack channel has exactly one new message (not double-posted), notify message updated to ✅. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task  | Commit Message                                                                                                  | Files                                                                | Pre-commit     |
| ----- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------- |
| 1     | `feat(dashboard): add horizontal dividers between AGENTS.md layers in debug tab`                                | `dashboard/src/panels/employees/DebugTab.tsx`                        | `tsc --noEmit` |
| 2+3+4 | `fix(lifecycle): add delivery_instructions to all archetypes and rewrite instructions for draft-only execution` | `prisma/seed.ts`, `scripts/2026-05-25-update-archetype-delivery.sql` | `tsc --noEmit` |
| 5     | `fix(lifecycle): add Delivering phase to no-approval path with classification check`                            | `src/inngest/employee-lifecycle.ts`                                  | `tsc --noEmit` |
| 7     | No commit — E2E verification only                                                                               | —                                                                    | —              |

---

## Success Criteria

### Verification Commands

```bash
# Verify all archetypes have delivery_instructions
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, delivery_instructions IS NOT NULL AND delivery_instructions != '' AS has_instr FROM archetypes WHERE deleted_at IS NULL;"
# Expected: all rows show has_instr = true

# Verify qa-time-est-test is soft-deleted
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT role_name, deleted_at IS NOT NULL AS is_deleted FROM archetypes WHERE role_name = 'qa-time-est-test';"
# Expected: is_deleted = true

# Trigger motivation bot and verify delivery
source .env
TASK_ID=$(curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq -r '.task_id')
# Wait ~120s
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT from_status, to_status FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
# Expected: row with to_status = 'Delivering' present, final status = 'Done'
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Delivery phase visited in task_status_log for no-approval tasks
- [ ] No double-posting in Slack
- [ ] All active archetypes have delivery_instructions
