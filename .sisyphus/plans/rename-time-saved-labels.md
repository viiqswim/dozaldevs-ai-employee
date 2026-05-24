# Rename "Time Saved" → "Hours of Work Done" (Full Stack)

## TL;DR

> **Quick Summary**: Full-stack rename of the "time saved" concept to "work done" — from DB column through lifecycle code to dashboard labels. Eliminates tech debt by aligning every layer to the same terminology.
>
> **Deliverables**:
>
> - DB column renamed: `minutes_saved` → `work_minutes`
> - Lifecycle code: step names, log messages, and PostgREST insert updated
> - Dashboard: stat card labels, helper function, variables, PostgREST queries updated
> - AGENTS.md verification reference updated
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (migration) → Tasks 2+3 (parallel) → Task 4 (docs) → done

---

## Context

### Original Request

User noticed "Total Time Saved" on the tasks dashboard and wanted to reframe the concept. "Time saved" is a cost-avoidance frame (hypothetical — "you _would have_ spent X hours"). "Hours of Work Done" is a work-output frame (concrete — "your employees _did_ this work"). User confirmed they want a full-stack rename to prevent tech debt.

### Interview Summary

**Key Discussions**:

- Presented 5 framing options with UX rationale; user chose **"Hours of Work Done"**
- Both TaskFeed (main view) and ActivitySection (per-employee view) use the full label
- User explicitly requested full rename depth: DB column, lifecycle step names, log messages — not just UI labels

---

## Work Objectives

### Core Objective

Rename the "time saved" / "minutes saved" concept to "work done" / "work minutes" across every layer of the stack: database, lifecycle, dashboard, and documentation.

### Concrete Deliverables

- Prisma migration renaming `minutes_saved` → `work_minutes` on `task_metrics`
- Lifecycle step IDs: `record-time-saved-metric-*` → `record-work-metric-*`
- Lifecycle log messages updated
- Dashboard stat cards: "Hours of Work Done"
- Dashboard helper function + variables renamed
- Dashboard PostgREST queries referencing new column name
- AGENTS.md updated

### Definition of Done

- [ ] `pnpm build` passes
- [ ] `pnpm test -- --run` passes (no test regressions)
- [ ] DB column is `work_minutes` (verified via psql)
- [ ] PostgREST can read the renamed column (verified via curl)
- [ ] Both dashboard stat cards display "Hours of Work Done"
- [ ] No remaining "time saved" or "minutes_saved" references in active code (grep clean)

### Must Have

- DB column renamed with a proper Prisma migration
- All 5 Inngest step IDs renamed
- All 5 log messages updated
- All PostgREST queries in dashboard updated
- Both UI labels changed

### Must NOT Have (Guardrails)

- Do NOT rename `estimated_manual_minutes` or `estimated_manual_minutes_override` — different concept (estimation input, not output metric)
- Do NOT modify historical docs (product roadmap, story map)
- Do NOT change the "Employee Hourly Rate" stat card label
- Do NOT modify the migration SQL file that originally created the column — create a NEW migration

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO new tests — rename only, no logic changes. Existing tests must pass.
- **Framework**: Vitest

### QA Policy

Agent verifies via build check, test suite, psql column check, PostgREST curl, and grep audit.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — must complete first):
└── Task 1: DB migration — rename minutes_saved → work_minutes [quick]

Wave 2 (After Wave 1 — parallel code updates):
├── Task 2: Dashboard — labels, queries, function, variables [quick]
└── Task 3: Lifecycle — step names, log messages, insert field [quick]

Wave 3 (After Wave 2 — documentation):
└── Task 4: AGENTS.md + docs references [quick]

Notification:
└── Task 5: Telegram notification [quick]

Critical Path: Task 1 → Task 2+3 → Task 4 → Task 5
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 2, 3   |
| 2    | 1          | 4      |
| 3    | 1          | 4      |
| 4    | 2, 3       | 5      |
| 5    | 4          | —      |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **2 tasks** — T2 → `quick`, T3 → `quick`
- **Wave 3**: **1 task** — T4 → `quick`
- **Notification**: **1 task** — T5 → `quick`

---

## TODOs

- [x] 1. DB Migration — Rename `minutes_saved` → `work_minutes`

  **What to do**:
  1. Back up the database (per AGENTS.md backup protocol — `pg_dump` critical tables)
  2. In `prisma/schema.prisma` line 580: rename `minutes_saved` → `work_minutes`
  3. Run `pnpm prisma migrate dev --name rename_minutes_saved_to_work_minutes` to generate the migration
  4. Verify the migration SQL is a simple `ALTER TABLE task_metrics RENAME COLUMN minutes_saved TO work_minutes;`
  5. Reload PostgREST schema cache: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"`
  6. Verify PostgREST can see the renamed column via curl

  **Must NOT do**:
  - Do NOT rename `estimated_manual_minutes` or `estimated_manual_minutes_override` — those are a different concept
  - Do NOT edit the original migration file that created `minutes_saved` — create a NEW migration
  - Do NOT drop and recreate the column — use RENAME COLUMN to preserve data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single schema change + migration generation — mechanical, no design decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo — foundation)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:575-589` — Full `TaskMetric` model definition. Line 580 is the field to rename.
  - `prisma/migrations/20260522073456_add_time_estimation_and_task_metrics/migration.sql` — Original migration that created `minutes_saved`. Do NOT modify this file.

  **WHY Each Reference Matters**:
  - `schema.prisma:575-589` — The executor needs to see the full model to rename the correct field without disturbing other fields or relations.
  - Original migration — Referenced so the executor knows NOT to edit it. Prisma migrations are immutable once applied.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Column renamed in database
    Tool: Bash (psql)
    Preconditions: Migration applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name FROM information_schema.columns WHERE table_name='task_metrics' AND column_name='work_minutes';"
      2. Verify 1 row returned
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name FROM information_schema.columns WHERE table_name='task_metrics' AND column_name='minutes_saved';"
      4. Verify 0 rows returned (old name gone)
    Expected Result: work_minutes exists, minutes_saved does not
    Failure Indicators: 0 rows for work_minutes, or 1 row for minutes_saved
    Evidence: .sisyphus/evidence/task-1-column-check.txt

  Scenario: PostgREST serves renamed column
    Tool: Bash (curl)
    Preconditions: Migration applied, schema cache reloaded
    Steps:
      1. Source .env for SUPABASE_ANON_KEY
      2. Run: curl -s "http://localhost:54331/rest/v1/task_metrics?limit=1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
      3. Verify response contains "work_minutes" key (not "minutes_saved")
    Expected Result: Response JSON uses work_minutes field name
    Failure Indicators: PGRST205 schema cache error, or response still shows minutes_saved
    Evidence: .sisyphus/evidence/task-1-postgrest-check.txt

  Scenario: Existing data preserved
    Tool: Bash (psql)
    Preconditions: Migration applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*), sum(work_minutes) FROM task_metrics;"
      2. Verify count and sum match pre-migration values (data not lost)
    Expected Result: Row count and sum unchanged from before migration
    Evidence: .sisyphus/evidence/task-1-data-preserved.txt
  ```

  **Commit**: YES
  - Message: `refactor(db): rename minutes_saved to work_minutes in task_metrics`
  - Files: `prisma/schema.prisma`, `prisma/migrations/<new>/migration.sql`
  - Pre-commit: N/A (migration already applied)

- [x] 2. Dashboard — Labels, PostgREST Queries, Function, and Variables

  **What to do**:
  1. In `dashboard/src/lib/utils.ts`:
     - Line 35: Rename function `formatMinutesSaved` → `formatWorkMinutes`
  2. In `dashboard/src/panels/tasks/TaskFeed.tsx`:
     - Line 145: Change `select: 'minutes_saved,created_at'` → `select: 'work_minutes,created_at'`
     - Line 150: Change `postgrestFetch<{ minutes_saved: number; created_at: string }>` → `postgrestFetch<{ work_minutes: number; created_at: string }>`
     - Line 172: Change `m.minutes_saved` → `m.work_minutes` and rename variable `totalMinutesSaved` → `totalWorkMinutes`
     - Line 179: Rename `costPerHourSaved` → `costPerWorkHour` and update `totalMinutesSaved` reference
     - Line 238: Change `label="Total Time Saved"` → `label="Hours of Work Done"`
     - Line 239: Update `formatMinutesSaved` → `formatWorkMinutes` and variable reference
     - Line 250: Update `costPerHourSaved` → `costPerWorkHour`
     - Update import to use `formatWorkMinutes`
  3. In `dashboard/src/panels/employees/sections/ActivitySection.tsx`:
     - Line 47: Change `postgrestFetch<{ minutes_saved: number }>` → `postgrestFetch<{ work_minutes: number }>`
     - Line 50: Change `select: 'minutes_saved'` → `select: 'work_minutes'`
     - Line 56: Change `m.minutes_saved` → `m.work_minutes` and rename `totalMinutesSaved` → `totalWorkMinutes`
     - Line 109: Change `label="Time Saved"` → `label="Hours of Work Done"` and update function/variable references
     - Update import to use `formatWorkMinutes`

  **Must NOT do**:
  - Do NOT change the "Employee Hourly Rate" label
  - Do NOT change the "Tasks Completed" or "Total Employee Cost" labels
  - Do NOT modify any logic — only rename identifiers and strings

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical find-and-replace across 3 dashboard files — no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/tasks/TaskFeed.tsx:235-252` — All 4 stat cards; only the first label changes
  - `dashboard/src/panels/employees/sections/ActivitySection.tsx:47-56` — PostgREST query and aggregation
  - `dashboard/src/panels/employees/sections/ActivitySection.tsx:109` — Per-employee stat card

  **API/Type References**:
  - `dashboard/src/lib/utils.ts:35` — `formatMinutesSaved()` function to rename
  - PostgREST: `GET /rest/v1/task_metrics?select=work_minutes` (new column name after Task 1)

  **WHY Each Reference Matters**:
  - `TaskFeed.tsx:235-252` — Contains the primary "Total Time Saved" label and both variables to rename. Also contains the PostgREST query selecting `minutes_saved`.
  - `ActivitySection.tsx:47-56` — PostgREST fetch and aggregation of `minutes_saved` — must update column name to `work_minutes`.
  - `utils.ts:35` — Shared formatter function. Renaming here + at import sites ensures consistency.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after renames
    Tool: Bash
    Preconditions: All dashboard renames applied, Task 1 migration already applied
    Steps:
      1. Run `pnpm build` from project root
      2. Check exit code is 0
    Expected Result: Clean build with exit code 0
    Failure Indicators: TS2304 "Cannot find name", TS2305 "has no exported member"
    Evidence: .sisyphus/evidence/task-2-build-check.txt

  Scenario: No remaining old names in dashboard code
    Tool: Bash (grep)
    Preconditions: All changes applied
    Steps:
      1. Search for "minutes_saved" in all files under dashboard/src/ — expect 0 matches
      2. Search for "formatMinutesSaved" in all files under dashboard/src/ — expect 0 matches
      3. Search for "Time Saved" in all .tsx files under dashboard/src/ — expect 0 matches in label props
      4. Search for "work_minutes" in dashboard/src/ — expect matches in PostgREST queries
      5. Search for "formatWorkMinutes" in dashboard/src/ — expect matches
    Expected Result: Zero old names, new names present
    Failure Indicators: Any old name still present
    Evidence: .sisyphus/evidence/task-2-grep-audit.txt
  ```

  **Commit**: YES (grouped with Task 3)
  - Message: `refactor: rename "time saved" to "work done" across dashboard and lifecycle`
  - Files: `dashboard/src/panels/tasks/TaskFeed.tsx`, `dashboard/src/panels/employees/sections/ActivitySection.tsx`, `dashboard/src/lib/utils.ts`, `src/inngest/employee-lifecycle.ts`

- [x] 3. Lifecycle — Inngest Step Names, Log Messages, and Insert Field

  **What to do**:
  1. In `src/inngest/employee-lifecycle.ts`:
     - Line 110: Change `minutes_saved: effectiveMinutes` → `work_minutes: effectiveMinutes`
     - Line 248: Change step name `'record-time-saved-metric-precheck'` → `'record-work-metric-precheck'`
     - Line 252: Change log message `'Failed to record time-saved metric — non-fatal'` → `'Failed to record work metric — non-fatal'`
     - Line 902: Change step name `'record-time-saved-metric-no-approval'` → `'record-work-metric-no-approval'`
     - Line 906: Change log message (same pattern)
     - Line 1128: Change step name `'record-time-saved-metric-no-action'` → `'record-work-metric-no-action'`
     - Line 1132: Change log message (same pattern)
     - Line 1180: Change step name `'record-time-saved-metric-override-dismissed'` → `'record-work-metric-override-dismissed'`
     - Line 1184: Change log message (same pattern)
     - Line 2599: Change step name `'record-time-saved-metric-approval'` → `'record-work-metric-approval'`
     - Line 2610: Change log message (same pattern)

  **Must NOT do**:
  - Do NOT change any logic — only rename step IDs, log strings, and the PostgREST field name
  - Do NOT rename the `recordTimeSavedMetric` helper function if one exists — verify first
  - Do NOT modify any other step names in the lifecycle

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical string replacements — 5 step names, 5 log messages, 1 field name
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 2)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:105-118` — The `recordTimeSavedMetric` helper that builds the PostgREST body. Line 110 has the `minutes_saved` field key.
  - `src/inngest/employee-lifecycle.ts:248-252` — First step invocation pattern. All 5 follow the same pattern: `step.run('record-time-saved-metric-{suffix}', ...)` wrapping a call that catches and logs.

  **WHY Each Reference Matters**:
  - Lines 105-118 — This is the shared helper that all 5 step invocations call. The `minutes_saved` key here must match the DB column name (now `work_minutes`).
  - Lines 248-252 — Shows the pattern for all 5 invocations. The executor can use this as a template and apply the same rename to all 5 occurrences.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No remaining old step names or log messages
    Tool: Bash (grep)
    Preconditions: All lifecycle renames applied
    Steps:
      1. Search for "time-saved-metric" in src/inngest/employee-lifecycle.ts — expect 0 matches
      2. Search for "time-saved metric" in src/inngest/employee-lifecycle.ts — expect 0 matches
      3. Search for "minutes_saved" in src/inngest/employee-lifecycle.ts — expect 0 matches
      4. Search for "record-work-metric" — expect 5 matches
      5. Search for "work metric" in log messages — expect 5 matches
      6. Search for "work_minutes" — expect 1 match (the PostgREST field)
    Expected Result: All old names gone, all new names present with correct counts
    Failure Indicators: Any old name still present, or wrong count of new names
    Evidence: .sisyphus/evidence/task-3-grep-audit.txt

  Scenario: Build succeeds after lifecycle renames
    Tool: Bash
    Preconditions: All lifecycle renames applied
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-3-build-check.txt
  ```

  **Commit**: YES (grouped with Task 2)
  - Message: `refactor: rename "time saved" to "work done" across dashboard and lifecycle`

- [x] 4. Update AGENTS.md + Documentation References

  **What to do**:
  1. In `AGENTS.md`:
     - Update the `task_metrics` table description to reference `work_minutes` instead of `minutes_saved`
     - Update the verification checklist (around line 580) to say "Hours of Work Done" instead of "Total Time Saved"
     - Search for any other active references to `minutes_saved` or "time saved" and update
  2. Run the full verification suite as a final check:
     - `pnpm build` — clean build
     - `pnpm test -- --run` — all tests pass
     - `psql` — verify column name
     - `grep` audit — no remaining old names in active code

  **Must NOT do**:
  - Do NOT modify historical docs in `docs/planning/` or `docs/snapshots/`
  - Do NOT modify migration files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Doc updates + verification commands
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo — after Tasks 2+3)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `AGENTS.md:253` — `task_metrics` table description mentioning `minutes_saved`
  - `AGENTS.md:506` — Verification command referencing `minutes_saved`
  - `AGENTS.md:577-578` — Verification commands checking `minutes_saved` value
  - `AGENTS.md:580` — "Total Time Saved" in dashboard verification checklist

  **WHY Each Reference Matters**:
  - These are the agent-facing references that other AI agents use to verify features. If they still say `minutes_saved` or "Total Time Saved," future agents will write incorrect verification commands.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build and test suite pass
    Tool: Bash
    Steps:
      1. Run `pnpm build` — expect exit code 0
      2. Run `pnpm test -- --run` — expect all tests pass, 0 failures
    Expected Result: Build clean, tests green
    Evidence: .sisyphus/evidence/task-4-build-test.txt

  Scenario: No remaining old names anywhere in active code
    Tool: Bash (grep)
    Steps:
      1. Search entire repo for "minutes_saved" — expect matches ONLY in: migration SQL files, docs/planning/, docs/snapshots/
      2. Search entire repo for "time-saved-metric" — expect 0 matches
      3. Search entire repo for label="Time Saved" or label="Total Time Saved" — expect 0 matches
      4. Confirm "work_minutes" appears in: schema.prisma, employee-lifecycle.ts, TaskFeed.tsx, ActivitySection.tsx
      5. Confirm "Hours of Work Done" appears in: TaskFeed.tsx, ActivitySection.tsx
    Expected Result: Old terminology only in historical/immutable files
    Evidence: .sisyphus/evidence/task-4-full-grep-audit.txt

  Scenario: AGENTS.md references updated
    Tool: Bash (grep)
    Steps:
      1. Search AGENTS.md for "work_minutes" — expect matches in task_metrics description and verification commands
      2. Search AGENTS.md for "Hours of Work Done" — expect match in verification checklist
      3. Search AGENTS.md for "minutes_saved" — expect 0 matches
      4. Search AGENTS.md for "Total Time Saved" — expect 0 matches
    Expected Result: All AGENTS.md references use new terminology
    Evidence: .sisyphus/evidence/task-4-agentsmd-check.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md for work_minutes rename`
  - Files: `AGENTS.md`

- [x] 5. Notify completion

  **What to do**: Send Telegram notification that the plan is complete.

  ```bash
  tsx scripts/telegram-notify.ts "✅ rename-time-saved-labels complete — 'Hours of Work Done' labels applied across full stack. Come back to review."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: Task 4

---

## Final Verification Wave

> Folded into Task 4's QA scenarios for this small plan — includes build check, test suite, psql verification, PostgREST curl, and grep audit.

---

## Commit Strategy

- **Task 1**: `refactor(db): rename minutes_saved to work_minutes in task_metrics` — `prisma/schema.prisma`, new migration file
- **Tasks 2+3**: `refactor: rename "time saved" to "work done" across dashboard and lifecycle` — `dashboard/src/panels/tasks/TaskFeed.tsx`, `dashboard/src/panels/employees/sections/ActivitySection.tsx`, `dashboard/src/lib/utils.ts`, `src/inngest/employee-lifecycle.ts`
- **Task 4**: `docs: update AGENTS.md for work_minutes rename` — `AGENTS.md`

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: clean build
pnpm test -- --run            # Expected: all tests pass
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT column_name FROM information_schema.columns WHERE table_name='task_metrics' AND column_name='work_minutes';"
                              # Expected: 1 row
```

### Final Checklist

- [ ] DB column is `work_minutes`
- [ ] PostgREST serves `work_minutes` field
- [ ] Both stat cards display "Hours of Work Done"
- [ ] All Inngest step IDs use `record-work-metric-*`
- [ ] Build and tests pass
- [ ] No remaining `minutes_saved` or `time-saved-metric` in active code
