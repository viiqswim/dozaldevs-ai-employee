# Phase 6: Completion & Delivery — Work Plan

## TL;DR

> **Quick Summary**: Close the loop between the Fly.io worker and the Inngest lifecycle function. After execution succeeds, the worker creates a task branch, opens a PR (with deduplication), writes completion status to Supabase BEFORE sending an Inngest event (SPOF mitigation), and the lifecycle function finalizes the task with a deliverables record.
>
> **Deliverables**:
>
> - `src/workers/lib/branch-manager.ts` — Git branch creation, commit, push
> - `src/workers/lib/pr-manager.ts` — PR creation with deduplication
> - `src/workers/lib/completion.ts` — Supabase-first write + Inngest event send
> - `src/workers/lib/project-config.ts` — Fetch project's tooling_config from DB
> - Updated `src/workers/orchestrate.mts` — Wires completion flow after fix loop
> - Updated `src/inngest/lifecycle.ts` — Real finalize step with deliverables record
> - Updated `src/workers/entrypoint.sh` — Branch name construction
> - Dedicated test file per module + updated existing test files
> - Phase completion doc `docs/YYYY-MM-DD-phase6-completion-delivery.md`
> - Updated `.sisyphus/progress.json`
>
> **Estimated Effort**: Medium (comparable to Phase 5)
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Task 1 → Tasks 2-5 → Task 10 → Task 12 → Task 15

---

## Context

### Original Request

Create a granular work plan for Phase 6 (Completion & Delivery) of the AI Employee Platform. Every meaningful implementation task must have corresponding tasks for automated/manual testing and documentation. Include progress.json updates and a final review/testing phase. Write a phase completion doc similar to `docs/2026-03-26-1511-phase1-foundation.md`.

### Interview Summary

**Key Discussions**:

- Phase 6 is the next phase (Phases 1-5 complete, 338 tests, all passing)
- Architecture references: §9.4 Branch Naming, §9.2 PR Deduplication, §8 Reverse-Path SPOF Mitigation, §10 Lifecycle finalize
- Test strategy: Vitest with dedicated test file per module (matching existing pattern)
- User confirmed: Generate plan now, no additional requirements beyond architecture doc

**Research Findings**:

- `orchestrate.mts` has explicit Phase 6 TODOs: "Does NOT send engineering/task.completed", "Does NOT create branches or PRs"
- `lifecycle.ts` finalize step has TODO: "Phase 6: Machine sends task.completed event with status and PR URL"
- `github-client.ts` already has `createPR()`, `listPRs()`, `getPR()` methods with retry-on-429
- `entrypoint.sh` Step 3 handles branch checkout via `TASK_BRANCH` env var
- PostgREST client exists for worker DB access (`src/workers/lib/postgrest-client.ts`)
- `Submitting` is confirmed in the CHECK constraint on `tasks.status` (migration SQL)
- `Deliverable` model exists in Prisma with `delivery_type`, `external_ref`, `risk_score`, `status`
- `Project` model has `default_branch` and `tooling_config` fields
- Phase 5 exits with `process.exit(0)` after fix loop — Phase 6 inserts steps between fix loop success and exit

### Metis Review

**Identified Gaps** (addressed):

- **TASK_BRANCH construction**: Must be generated in the worker from task context (`external_id` + summary kebab), passed to entrypoint.sh as env var. Added to entrypoint.sh update task.
- **Attempt number for deterministic event ID**: Worker can read `dispatch_attempts` from the task context JSON. Fallback to `execution_id` if not available.
- **PR base branch**: From `project.default_branch` (confirmed in Prisma schema). The project row is fetched via PostgREST as part of the tooling_config task.
- **Git commit author identity**: `entrypoint.sh` Step 1 already writes auth tokens. Need to add `git config user.email/name`. Added to entrypoint.sh task.
- **Dirty working tree**: branch-manager must `git add -A && git commit` any uncommitted changes before push.
- **Empty diff**: If no files changed, skip branch/PR creation and exit with a note.
- **Push with `--force-with-lease`**: For re-dispatch safety when remote branch has diverged history.
- **listPRs filter by head branch**: Already supported by github-client `ListPRsParams.head`.
- **Supabase PATCH ordering test**: Use `vi.fn()` with `invocationCallOrder` tracking.
- **Worker imports from src/lib/**: github-client.ts is a pure REST client (no Prisma), safe to import from worker.
- **Watchdog cron**: Explicitly OUT of Phase 6 scope (Phase 7).

---

## Work Objectives

### Core Objective

Enable the Fly.io worker to deliver its work product (branch + PR) and reliably signal the Inngest lifecycle function that execution is complete, with Supabase-first write ensuring no successful work is silently lost.

### Concrete Deliverables

- 4 new worker modules with dedicated test files
- Updated orchestrate.mts with completion flow (Steps 12-16)
- Updated lifecycle.ts with real finalize step + deliverables record
- Updated entrypoint.sh with branch naming
- Phase completion doc
- Updated progress.json

### Definition of Done

- [ ] `pnpm test -- --run` → all tests pass (338 existing + ~80-100 new)
- [ ] `pnpm tsc --noEmit` → 0 errors
- [ ] `pnpm lint` → 0 errors
- [ ] Branch naming follows `ai/<ticket-id>-<kebab-summary>` format
- [ ] PR deduplication prevents duplicate PRs on re-dispatch
- [ ] Supabase PATCH to `Submitting` happens BEFORE Inngest event send
- [ ] Lifecycle finalize creates `deliverables` record with PR URL
- [ ] Status log shows: `Executing → Submitting (machine) → Done (lifecycle_fn)`
- [ ] Phase doc written and progress.json updated

### Must Have

- Branch creation with `ai/<ticket-id>-<kebab-summary>` format (§9.4)
- PR deduplication check before `gh pr create` (§9.2)
- Supabase-first completion write — status=`Submitting` + deliverables record BEFORE Inngest event (§8)
- Deterministic Inngest event ID: `task-${taskId}-completion-${executionId}` (deduplication)
- Lifecycle finalize: handle completion event, create deliverables, transition to Done
- Project tooling_config fetch from database (replacing Phase 5 default)
- Retry logic: 3 attempts with exponential backoff for Supabase writes and Inngest sends

### Must NOT Have (Guardrails)

- **NO watchdog cron** — Phase 7 scope
- **NO token tracking** — Phase 7 scope
- **NO review agent** — Post-MVP, human reviews PRs
- **NO Slack notification on PR creation** — Not in architecture spec
- **NO branch cleanup after merge** — Post-merge hook, separate concern
- **NO PR reviewer assignment** — Not in architecture spec
- **NO modifications to fix-loop.ts, heartbeat.ts, or validation-pipeline.ts** — Phase 5 modules, read-only
- **NO modifications to the escalation path** in orchestrate.mts (fix-loop failure branch)
- **NO `Date.now()` in deterministic event ID** — Use `taskId + executionId` only
- **NO new Prisma migrations** — Schema already has `Submitting` in CHECK and `deliverables` table

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 338 tests)
- **Automated tests**: YES — Tests-after per module (dedicated test file per new module)
- **Framework**: Vitest + `@inngest/test` for lifecycle function testing
- **Pattern**: Each new module → new test file; modified modules → updated existing test files

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Worker modules**: Use Bash (Vitest) — Run test suite, assert pass counts
- **Lifecycle function**: Use Bash (Vitest + `@inngest/test`) — Run lifecycle tests
- **Entrypoint.sh**: Use Bash — `bash -n` syntax check + variable substitution test
- **Integration**: Use Bash — `pnpm test -- --run` full suite

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Gate — must pass before any implementation):
└── Task 1: Schema & codebase verification [quick]

Wave 2 (Foundation modules — MAX PARALLEL):
├── Task 2: Implement branch-manager.ts [deep]
├── Task 3: Tests for branch-manager.ts [quick] (depends: 2)
├── Task 4: Implement pr-manager.ts [deep]
├── Task 5: Tests for pr-manager.ts [quick] (depends: 4)
├── Task 6: Implement completion.ts [deep]
├── Task 7: Tests for completion.ts [quick] (depends: 6)
├── Task 8: Implement project-config.ts [quick]
└── Task 9: Tests for project-config.ts [quick] (depends: 8)

Wave 3 (Integration — after Wave 2):
├── Task 10: Integrate completion flow into orchestrate.mts [deep] (depends: 2,4,6,8)
├── Task 11: Tests for orchestrate.mts changes [unspecified-high] (depends: 10)
├── Task 12: Update lifecycle.ts finalize + deliverables [deep] (depends: 6)
├── Task 13: Tests for lifecycle.ts changes [unspecified-high] (depends: 12)
└── Task 14: Update entrypoint.sh + tests [quick] (depends: 2)

Wave 4 (Documentation & Tracking — after Wave 3):
├── Task 15: Write phase completion doc [writing] (depends: all implementation)
├── Task 16: Update progress.json [quick] (depends: 15)
└── Task 17: Full test suite verification [quick] (depends: all)

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 2,4,6,8 | 1    |
| 2    | 1          | 3,10,14 | 2    |
| 3    | 2          | —       | 2    |
| 4    | 1          | 5,10    | 2    |
| 5    | 4          | —       | 2    |
| 6    | 1          | 7,10,12 | 2    |
| 7    | 6          | —       | 2    |
| 8    | 1          | 9,10    | 2    |
| 9    | 8          | —       | 2    |
| 10   | 2,4,6,8    | 11,15   | 3    |
| 11   | 10         | 17      | 3    |
| 12   | 6          | 13,15   | 3    |
| 13   | 12         | 17      | 3    |
| 14   | 2          | 15      | 3    |
| 15   | 10,12,14   | 16      | 4    |
| 16   | 15         | 17      | 4    |
| 17   | all        | F1-F4   | 4    |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **8 tasks** — T2 → `deep`, T3 → `quick`, T4 → `deep`, T5 → `quick`, T6 → `deep`, T7 → `quick`, T8 → `quick`, T9 → `quick`
- **Wave 3**: **5 tasks** — T10 → `deep`, T11 → `unspecified-high`, T12 → `deep`, T13 → `unspecified-high`, T14 → `quick`
- **Wave 4**: **3 tasks** — T15 → `writing`, T16 → `quick`, T17 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Schema & Codebase Verification Gate

  **What to do**:
  - Verify `Submitting` exists in the CHECK constraint on `tasks.status` (already confirmed in migration SQL — double-check against live DB)
  - Verify `deliverables` table exists with `delivery_type`, `external_ref`, `risk_score`, `status` columns
  - Verify `projects` table has `default_branch` and `tooling_config` columns
  - Verify `executions` table has `status` column writable via PostgREST
  - Verify `github-client.ts` can be imported from worker context (check compiled output path)
  - Verify `git config user.email` and `git config user.name` are set in `entrypoint.sh` Step 1 (if not, note for Task 14)
  - Run `pnpm test -- --run` to confirm baseline: 338+ tests pass, 0 failures
  - Run `pnpm tsc --noEmit` to confirm clean TypeScript build
  - Document all findings in `.sisyphus/evidence/task-1-schema-verification.md`

  **Must NOT do**:
  - Do NOT create any Prisma migrations
  - Do NOT modify any source files
  - Do NOT change database content

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only verification, no implementation — fast checks against existing schema and code
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — pure verification task

  **Parallelization**:
  - **Can Run In Parallel**: NO (gate task)
  - **Parallel Group**: Wave 1 (alone)
  - **Blocks**: Tasks 2, 4, 6, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/migrations/20260326135326_add_check_constraints/migration.sql:23` — CHECK constraint SQL with all 13 status values including `Submitting`
  - `prisma/schema.prisma:77-91` — Deliverable model with `delivery_type`, `external_ref`, `risk_score`, `status`
  - `prisma/schema.prisma:109-127` — Project model with `default_branch`, `tooling_config`

  **API/Type References**:
  - `src/lib/github-client.ts:45-49` — GitHubClient interface with createPR, listPRs, getPR methods
  - `src/workers/lib/postgrest-client.ts:1-10` — PostgRESTClient interface for worker DB access

  **Test References**:
  - `tests/schema.test.ts` — Existing schema validation tests (12 tests) to verify baseline

  **WHY Each Reference Matters**:
  - The migration SQL confirms `Submitting` at the DB level — if missing, we'd need a new migration (blocker)
  - The Deliverable model confirms the exact fields available for PR URL storage — `external_ref` is the PR URL field
  - The Project model confirms `default_branch` exists — needed for PR base branch
  - The github-client interface confirms available methods — pr-manager.ts will delegate to these

  **Acceptance Criteria**:
  - [ ] `Submitting` confirmed in CHECK constraint: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT conname, consrc FROM pg_constraint WHERE conname LIKE '%tasks_status%';" | grep -q 'Submitting'`
  - [ ] `deliverables` table queryable: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'deliverables';" | grep -q 'external_ref'`
  - [ ] TypeScript build clean: `pnpm tsc --noEmit` exits 0
  - [ ] Test suite baseline: `pnpm test -- --run` exits 0 with 338+ tests

  **QA Scenarios**:

  ```
  Scenario: Verify Submitting status in CHECK constraint
    Tool: Bash
    Preconditions: Local Supabase running, ai_employee database exists
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "INSERT INTO tasks (id, status, tenant_id, updated_at) VALUES (gen_random_uuid(), 'Submitting', '00000000-0000-0000-0000-000000000001', now()) RETURNING status;"
      2. Assert output contains: Submitting
      3. Clean up: DELETE FROM tasks WHERE status = 'Submitting';
    Expected Result: INSERT succeeds — `Submitting` is a valid status value
    Failure Indicators: CHECK constraint violation error
    Evidence: .sisyphus/evidence/task-1-submitting-check.txt

  Scenario: Verify deliverables table schema
    Tool: Bash
    Preconditions: Local Supabase running
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d deliverables"
      2. Assert output contains columns: id, execution_id, delivery_type, external_ref, risk_score, status
    Expected Result: All 6 columns present with correct types
    Failure Indicators: Missing column or wrong type
    Evidence: .sisyphus/evidence/task-1-deliverables-schema.txt

  Scenario: Verify full test suite baseline
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert: exit code 0
      3. Assert: output contains "Tests" line with 0 failures
    Expected Result: 338+ tests pass, 0 failures, 0 errors
    Failure Indicators: Any test failure or TypeScript compilation error
    Evidence: .sisyphus/evidence/task-1-test-baseline.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-1-schema-verification.md` — Full findings document
  - [ ] `task-1-submitting-check.txt` — Submitting INSERT output
  - [ ] `task-1-deliverables-schema.txt` — Deliverables table description
  - [ ] `task-1-test-baseline.txt` — Full test suite output

  **Commit**: NO (read-only task, no code changes)

---

- [x] 2. Implement `branch-manager.ts` — Git Branch Creation, Commit, Push

  **What to do**:
  - Create `src/workers/lib/branch-manager.ts` with these exports:
    - `buildBranchName(ticketId: string, summary: string): string` — Creates `ai/<ticket-id>-<kebab-summary>` format. Kebab-case the summary (lowercase, replace spaces/special chars with hyphens, max 60 chars).
    - `ensureBranch(branchName: string, cwd: string): Promise<BranchResult>` — Checks if branch exists remotely (`git ls-remote --heads origin <branch>`). If exists, checks it out. If not, creates new branch from current HEAD.
    - `commitAndPush(branchName: string, message: string, cwd: string): Promise<PushResult>` — Stages all changes (`git add -A`), checks if there are changes to commit (`git diff --cached --quiet`), commits with message, pushes with `--force-with-lease` for re-dispatch safety.
  - Use `execFile` (not `exec`) for all git commands to prevent shell injection (matching validation-pipeline.ts pattern)
  - Handle edge case: empty diff (no changes) → return `{ pushed: false, reason: 'no_changes' }` without error
  - Set git author identity in `ensureBranch` if not already set: `git config user.email "ai-employee@platform.local"` and `git config user.name "AI Employee"`

  **Must NOT do**:
  - Do NOT use `git push --force` (use `--force-with-lease` for safety)
  - Do NOT modify fix-loop.ts or validation-pipeline.ts
  - Do NOT add Slack notifications
  - Do NOT handle PR creation (that's pr-manager's responsibility)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Git operations require careful handling of edge cases (empty diff, remote branch exists, force-with-lease), needs deep understanding of git CLI behavior
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — standard TypeScript module with `execFile` child process calls

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 8)
  - **Blocks**: Task 3 (tests), Task 10 (orchestrate integration), Task 14 (entrypoint)
  - **Blocked By**: Task 1 (schema verification gate)

  **References**:

  **Pattern References**:
  - `src/workers/lib/validation-pipeline.ts:runSingleStage()` — Pattern for using `execFile` instead of `exec` for shell safety. Follow the same `{ stdout, stderr }` capture pattern.
  - `src/workers/lib/postgrest-client.ts` — Module structure pattern: named exports, no default exports, interface-first design.
  - `src/workers/entrypoint.sh:79-92` — Existing branch creation logic in Step 3 (`git show-ref --verify`, `git checkout -b`). The TypeScript module replaces the in-container git operations that happen AFTER code is written.

  **API/Type References**:
  - Architecture doc §9.4 — Branch naming convention: `ai/<jira-ticket-id>-<kebab-summary>`. Examples: `ai/PROJ-123-fix-login-bug`, `ai/ENG-456-add-payment-retry-logic`.

  **External References**:
  - `git push --force-with-lease` docs — Safer than `--force`, fails if remote has been updated since last fetch.

  **WHY Each Reference Matters**:
  - `validation-pipeline.ts:runSingleStage()` — Exact pattern for `execFile` usage. Copy the error handling and timeout approach.
  - `entrypoint.sh:79-92` — Shows what currently happens at boot. branch-manager.ts handles the LATER step (after code is written), but must be aware of what entrypoint already did.
  - §9.4 — The exact branch naming format is a hard requirement, not a suggestion.

  **Acceptance Criteria**:
  - [ ] `buildBranchName('PROJ-123', 'Fix login bug')` returns `'ai/PROJ-123-fix-login-bug'`
  - [ ] `buildBranchName('ENG-456', 'Add payment retry logic with special chars!')` returns `'ai/ENG-456-add-payment-retry-logic-with-special-chars'`
  - [ ] Branch name matches regex: `/^ai\/[A-Z]+-\d+-[a-z0-9-]+$/`
  - [ ] Module uses `execFile` (not `exec`) for all git commands
  - [ ] Empty diff returns `{ pushed: false, reason: 'no_changes' }` without error
  - [ ] `--force-with-lease` used for push (not `--force`)
  - [ ] TypeScript compiles: `pnpm tsc --noEmit` exits 0

  **QA Scenarios**:

  ```
  Scenario: Branch name formatting
    Tool: Bash (Vitest)
    Preconditions: Module compiled
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/branch-manager.test.ts
      2. Assert test "buildBranchName formats correctly" passes
      3. Assert test "buildBranchName handles special characters" passes
      4. Assert test "buildBranchName enforces max length" passes
    Expected Result: All branch naming tests pass
    Failure Indicators: Branch name doesn't match expected format
    Evidence: .sisyphus/evidence/task-2-branch-naming.txt

  Scenario: Empty diff handling
    Tool: Bash (Vitest)
    Preconditions: Module compiled
    Steps:
      1. Run test that mocks `git diff --cached --quiet` returning exit code 0 (no changes)
      2. Assert `commitAndPush` returns `{ pushed: false, reason: 'no_changes' }`
      3. Assert `git commit` was NOT called
    Expected Result: No commit or push attempted on empty diff
    Failure Indicators: git commit called despite no changes, or error thrown
    Evidence: .sisyphus/evidence/task-2-empty-diff.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-2-branch-naming.txt` — Branch name test output
  - [ ] `task-2-empty-diff.txt` — Empty diff test output

  **Commit**: YES (groups with Task 3)
  - Message: `feat(workers): add branch-manager with git branch/commit/push support`
  - Files: `src/workers/lib/branch-manager.ts`, `tests/workers/lib/branch-manager.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/branch-manager.test.ts`

---

- [x] 3. Tests for `branch-manager.ts`

  **What to do**:
  - Create `tests/workers/lib/branch-manager.test.ts` with dedicated test file
  - Test `buildBranchName`:
    - Normal ticket ID + summary → correct format
    - Special characters stripped, lowercase, hyphenated
    - Long summary truncated to 60 chars
    - Empty summary handled gracefully
    - Regex validation: `/^ai\/[A-Z]+-\d+-[a-z0-9-]+$/`
  - Test `ensureBranch`:
    - Remote branch exists → checkout existing
    - Remote branch does not exist → create new from HEAD
    - Git command failure → returns error result
  - Test `commitAndPush`:
    - Changes present → commit + push with `--force-with-lease`
    - No changes (empty diff) → returns `{ pushed: false, reason: 'no_changes' }`
    - Push failure → returns error with stderr
    - Git author identity set if missing
  - Mock `execFile` using `vi.mock('child_process')` pattern (matching validation-pipeline.test.ts)
  - Target: ~15-18 tests

  **Must NOT do**:
  - Do NOT run actual git commands against a real repo (mock all `execFile` calls)
  - Do NOT test PR creation (that's pr-manager's tests)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test writing following established patterns, no complex logic needed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other test tasks)
  - **Parallel Group**: Wave 2 (after Task 2 completes)
  - **Blocks**: None directly
  - **Blocked By**: Task 2 (needs module to exist)

  **References**:

  **Pattern References**:
  - `tests/workers/lib/validation-pipeline.test.ts` — Pattern for mocking `execFile` with `vi.mock('child_process')`. Follow the same mock setup and assertion patterns.
  - `tests/workers/lib/postgrest-client.test.ts` — Pattern for testing modules with external dependencies mocked.

  **API/Type References**:
  - `src/workers/lib/branch-manager.ts` — The module being tested (created in Task 2)

  **WHY Each Reference Matters**:
  - `validation-pipeline.test.ts` — Exact pattern for mocking child process calls in worker modules. Reuse the mock factory.

  **Acceptance Criteria**:
  - [ ] Test file exists: `tests/workers/lib/branch-manager.test.ts`
  - [ ] `pnpm test -- --run tests/workers/lib/branch-manager.test.ts` → 15+ tests pass, 0 failures
  - [ ] Branch naming regex tested: `expect(result).toMatch(/^ai\/[A-Z]+-\d+-[a-z0-9-]+$/)`
  - [ ] Empty diff path tested explicitly
  - [ ] `--force-with-lease` asserted in push command

  **QA Scenarios**:

  ```
  Scenario: All branch-manager tests pass
    Tool: Bash (Vitest)
    Preconditions: Task 2 module exists, tests written
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/branch-manager.test.ts 2>&1
      2. Assert: exit code 0
      3. Assert: output shows 15+ tests passed
      4. Assert: output shows 0 failures
    Expected Result: All tests pass with no failures
    Failure Indicators: Any test failure, import error, or mock issue
    Evidence: .sisyphus/evidence/task-3-branch-tests.txt
  ```

  **Commit**: YES (combined with Task 2)
  - Message: `feat(workers): add branch-manager with git branch/commit/push support`
  - Files: `tests/workers/lib/branch-manager.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/branch-manager.test.ts`

- [x] 4. Implement `pr-manager.ts` — PR Creation with Deduplication

  **What to do**:
  - Create `src/workers/lib/pr-manager.ts` with these exports:
    - `checkExistingPR(owner: string, repo: string, headBranch: string, githubClient: GitHubClient): Promise<GitHubPR | null>` — Calls `githubClient.listPRs({ owner, repo, state: 'open', head: \`${owner}:${headBranch}\` })` and returns the first match or null.
    - `createOrUpdatePR(params: CreateOrUpdatePRParams, githubClient: GitHubClient): Promise<PRResult>` — Checks for existing PR first. If exists, returns existing PR info (no duplicate created). If not, calls `githubClient.createPR()` with `[AI] <ticket-id>: <summary>` title format.
    - `buildPRBody(task: TaskRow, executionId: string | null): string` — Builds PR description with: ticket ID, summary, description excerpt, execution ID, validation results summary.
  - Import `GitHubClient` and types from `src/lib/github-client.ts` (pure REST client, no Prisma dependency)
  - PR title format: `[AI] <ticket-id>: <summary>` per architecture §9.2
  - Handle `listPRs` returning empty array (no existing PR) vs. populated array (PR exists)

  **Must NOT do**:
  - Do NOT assign PR reviewers
  - Do NOT add PR labels
  - Do NOT handle PR merge (that's the review agent's job, post-MVP)
  - Do NOT create draft PRs (that's shadow mode in Phase 10)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Deduplication logic requires careful handling of GitHub API responses and edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 6, 8)
  - **Blocks**: Task 5 (tests), Task 10 (orchestrate integration)
  - **Blocked By**: Task 1 (schema verification gate)

  **References**:

  **Pattern References**:
  - `src/lib/github-client.ts:150-161` — `createPR()` method with `POST /repos/{owner}/{repo}/pulls`. Follow the same request/response types.
  - `src/lib/github-client.ts:163-172` — `listPRs()` with `head` filter parameter. The deduplication check calls this.
  - `src/workers/lib/postgrest-client.ts` — Module structure pattern: interface-first, named exports.

  **API/Type References**:
  - `src/lib/github-client.ts:13-21` — `GitHubPR` interface: `{ number, title, html_url, head: { ref }, base: { ref }, state, body }`
  - `src/lib/github-client.ts:23-30` — `CreatePRParams` interface: `{ owner, repo, title, head, base, body }`
  - Architecture doc §9.2 — PR deduplication: check `gh pr list --head <task-branch>` before creating

  **WHY Each Reference Matters**:
  - `github-client.ts:150-161` — pr-manager delegates to this method. Must understand the params and return type.
  - `github-client.ts:163-172` — The `head` filter format must be `owner:branch` for GitHub API v3. If misformatted, deduplication fails silently.
  - §9.2 — The exact deduplication check is a hard requirement, not optional.

  **Acceptance Criteria**:
  - [ ] `checkExistingPR` returns `null` when `listPRs` returns empty array
  - [ ] `checkExistingPR` returns the PR when `listPRs` returns a match
  - [ ] `createOrUpdatePR` does NOT call `createPR()` when existing PR found
  - [ ] `createOrUpdatePR` calls `createPR()` when no existing PR
  - [ ] PR title matches format: `[AI] <ticket-id>: <summary>`
  - [ ] TypeScript compiles: `pnpm tsc --noEmit` exits 0

  **QA Scenarios**:

  ```
  Scenario: PR deduplication prevents duplicate creation
    Tool: Bash (Vitest)
    Preconditions: Module compiled, github-client mocked
    Steps:
      1. Mock listPRs to return [{ number: 42, html_url: 'https://github.com/org/repo/pull/42', ... }]
      2. Call createOrUpdatePR
      3. Assert: createPR was NOT called (vi.spyOn assertion)
      4. Assert: returned PR number is 42
    Expected Result: Existing PR returned, no new PR created
    Failure Indicators: createPR called despite existing PR, or wrong PR returned
    Evidence: .sisyphus/evidence/task-4-dedup.txt

  Scenario: PR creation when no existing PR
    Tool: Bash (Vitest)
    Preconditions: Module compiled, github-client mocked
    Steps:
      1. Mock listPRs to return []
      2. Mock createPR to return { number: 99, html_url: 'https://github.com/org/repo/pull/99' }
      3. Call createOrUpdatePR
      4. Assert: createPR WAS called with correct title format [AI] PROJ-123: Fix login bug
    Expected Result: New PR created with correct title
    Failure Indicators: createPR not called, or wrong title format
    Evidence: .sisyphus/evidence/task-4-create.txt
  ```

  **Commit**: YES (groups with Task 5)
  - Message: `feat(workers): add pr-manager with deduplication support`
  - Files: `src/workers/lib/pr-manager.ts`, `tests/workers/lib/pr-manager.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/pr-manager.test.ts`

---

- [x] 5. Tests for `pr-manager.ts`

  **What to do**:
  - Create `tests/workers/lib/pr-manager.test.ts` with dedicated test file
  - Test `checkExistingPR`:
    - `listPRs` returns empty array → returns `null`
    - `listPRs` returns one PR → returns that PR
    - `listPRs` returns multiple PRs → returns first one
    - `listPRs` throws (network error) → propagates error
  - Test `createOrUpdatePR`:
    - No existing PR → calls `createPR()` with correct params and title
    - Existing PR found → returns existing PR, `createPR()` NOT called
    - `createPR()` throws → propagates error
  - Test `buildPRBody`:
    - Full task context → rich PR body with ticket ID, summary, description
    - Minimal task context → fallback PR body
    - Long description truncated
  - Test PR title format: `[AI] <ticket-id>: <summary>`
  - Mock `GitHubClient` interface methods using `vi.fn()`
  - Target: ~12-15 tests

  **Must NOT do**:
  - Do NOT make real GitHub API calls
  - Do NOT test github-client.ts internals (those have their own tests)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard test writing with mock patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other test tasks)
  - **Parallel Group**: Wave 2 (after Task 4 completes)
  - **Blocks**: None directly
  - **Blocked By**: Task 4 (needs module to exist)

  **References**:

  **Pattern References**:
  - `tests/lib/github-client.test.ts` — Pattern for mocking GitHub API responses with `vi.fn()` and testing retry behavior.
  - `tests/workers/lib/postgrest-client.test.ts` — Pattern for interface-based mock setup.

  **Acceptance Criteria**:
  - [ ] Test file exists: `tests/workers/lib/pr-manager.test.ts`
  - [ ] `pnpm test -- --run tests/workers/lib/pr-manager.test.ts` → 12+ tests pass, 0 failures
  - [ ] Deduplication test: `expect(githubClient.createPR).not.toHaveBeenCalled()`
  - [ ] Title format test: `expect(params.title).toBe('[AI] PROJ-123: Fix login bug')`

  **QA Scenarios**:

  ```
  Scenario: All pr-manager tests pass
    Tool: Bash (Vitest)
    Preconditions: Task 4 module exists, tests written
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/pr-manager.test.ts 2>&1
      2. Assert: exit code 0
      3. Assert: output shows 12+ tests passed, 0 failures
    Expected Result: All tests pass
    Failure Indicators: Test failure, import error, or mock mismatch
    Evidence: .sisyphus/evidence/task-5-pr-tests.txt
  ```

  **Commit**: YES (combined with Task 4)
  - Message: `feat(workers): add pr-manager with deduplication support`
  - Files: `tests/workers/lib/pr-manager.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/pr-manager.test.ts`

---

- [x] 6. Implement `completion.ts` — Supabase-First Write + Inngest Event

  **What to do**:
  - Create `src/workers/lib/completion.ts` with these exports:
    - `writeCompletionToSupabase(params: CompletionParams, postgrestClient: PostgRESTClient): Promise<boolean>` — PATCHes `tasks` to set `status = 'Submitting'`, then POSTs a `deliverables` record with `delivery_type = 'pull_request'`, `external_ref = prUrl`, `status = 'submitted'`. Retry: 3 attempts, exponential backoff (1s, 2s, 4s). Returns false on total failure (logs to stdout as fallback per §8).
    - `sendCompletionEvent(params: CompletionEventParams): Promise<boolean>` — Sends `engineering/task.completed` Inngest event via HTTP POST to `${INNGEST_EVENT_URL}` (or `${SUPABASE_URL}` relay). Event ID: `task-${taskId}-completion-${executionId}` (deterministic for dedup). Retry: 3 attempts, exponential backoff. Returns false on failure.
    - `runCompletionFlow(params: FullCompletionParams, postgrestClient: PostgRESTClient): Promise<CompletionResult>` — Orchestrates: Supabase write FIRST, then Inngest send. If Supabase write fails, abort (exit with logged stdout for manual recovery). If Inngest send fails after retries, still exit(0) — work IS done, watchdog handles recovery.
  - The ORDERING is critical (§8 SPOF mitigation): Supabase PATCH must happen BEFORE Inngest send. This is the most important behavior to test.
  - Write status log entry: `{ from_status: 'Executing', to_status: 'Submitting', actor: 'machine' }` via PostgREST POST to `task_status_log`

  **Must NOT do**:
  - Do NOT implement watchdog cron (Phase 7)
  - Do NOT send Slack notifications on completion
  - Do NOT use `Date.now()` in the event ID (use `taskId + executionId` only)
  - Do NOT roll back Supabase write if Inngest send fails (the whole point of SPOF mitigation is the Supabase write persists)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: SPOF mitigation ordering is safety-critical. Retry logic with exponential backoff needs careful implementation. The Inngest event format must match what lifecycle.ts expects.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4, 8)
  - **Blocks**: Task 7 (tests), Task 10 (orchestrate integration), Task 12 (lifecycle finalize)
  - **Blocked By**: Task 1 (schema verification gate)

  **References**:

  **Pattern References**:
  - `src/workers/lib/postgrest-client.ts:patch()` — The PostgREST PATCH method that completion.ts uses for Supabase writes.
  - `src/workers/lib/heartbeat.ts:escalate()` — Pattern for multi-step fire-and-forget operations with individual try/catch per step.
  - `src/gateway/jira.ts:97-115` — Inngest send retry pattern with 3 attempts and exponential backoff (implemented in Phase 2).

  **API/Type References**:
  - `src/inngest/lifecycle.ts:53-57` — The `step.waitForEvent` that listens for `engineering/task.completed` with `if: async.data.taskId == '${taskId}'`. The event payload MUST include `taskId` in `data`.
  - Architecture doc §8 — Reverse-Path SPOF Mitigation: "The machine writes its final status (+ PR URL if applicable) to tasks.status = 'Submitting' in Supabase BEFORE sending the Inngest event"

  **WHY Each Reference Matters**:
  - `heartbeat.ts:escalate()` — Same pattern of multiple independent steps, each with its own try/catch. Copy this approach for the completion flow.
  - `jira.ts:97-115` — Exact retry logic for `inngest.send()`. The completion event uses the same retry strategy.
  - `lifecycle.ts:53-57` — The `waitForEvent` filter REQUIRES `async.data.taskId` to match. If the event payload uses a different key, the lifecycle will timeout.

  **Acceptance Criteria**:
  - [ ] Supabase PATCH called BEFORE Inngest event send (ordering verified)
  - [ ] Task status PATCHed to `Submitting`
  - [ ] Deliverables record POSTed with `delivery_type: 'pull_request'` and `external_ref: prUrl`
  - [ ] Status log entry created with `actor: 'machine'`
  - [ ] Event ID is deterministic: `task-${taskId}-completion-${executionId}`
  - [ ] Event data includes `taskId` key (matching lifecycle `waitForEvent` filter)
  - [ ] 3 retries with exponential backoff for both Supabase and Inngest
  - [ ] Inngest send failure → still returns (does NOT throw), work IS done
  - [ ] TypeScript compiles: `pnpm tsc --noEmit` exits 0

  **QA Scenarios**:

  ```
  Scenario: Supabase write happens before Inngest send (ordering)
    Tool: Bash (Vitest)
    Preconditions: Module compiled, PostgREST and fetch mocked
    Steps:
      1. Mock postgrestClient.patch and global fetch (for Inngest send) as vi.fn()
      2. Call runCompletionFlow()
      3. Assert: postgrestClient.patch.mock.invocationCallOrder[0] < fetchMock.mock.invocationCallOrder[0]
    Expected Result: Supabase PATCH invoked before Inngest HTTP POST
    Failure Indicators: Inngest send happens before Supabase write
    Evidence: .sisyphus/evidence/task-6-ordering.txt

  Scenario: Inngest send failure does not prevent clean exit
    Tool: Bash (Vitest)
    Preconditions: Module compiled
    Steps:
      1. Mock Supabase PATCH to succeed
      2. Mock Inngest HTTP POST to throw on all 3 attempts
      3. Call runCompletionFlow()
      4. Assert: returns { supabaseWritten: true, inngestSent: false }
      5. Assert: no error thrown
    Expected Result: Function returns gracefully despite Inngest failure
    Failure Indicators: Exception thrown, or supabaseWritten is false
    Evidence: .sisyphus/evidence/task-6-inngest-failure.txt
  ```

  **Commit**: YES (groups with Task 7)
  - Message: `feat(workers): add completion module with Supabase-first SPOF mitigation`
  - Files: `src/workers/lib/completion.ts`, `tests/workers/lib/completion.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/completion.test.ts`

---

- [x] 7. Tests for `completion.ts`

  **What to do**:
  - Create `tests/workers/lib/completion.test.ts` with dedicated test file
  - Test `writeCompletionToSupabase`:
    - Happy path: PATCH tasks + POST deliverables + POST status log all succeed
    - PATCH tasks fails → retries 3 times with backoff → returns false
    - POST deliverables fails → logged but does not block (tasks PATCH already done)
    - POST status log fails → logged but does not block
  - Test `sendCompletionEvent`:
    - Happy path: HTTP POST to Inngest succeeds → returns true
    - All 3 retries fail → returns false (no throw)
    - Event ID matches: `task-${taskId}-completion-${executionId}`
    - Event data includes `taskId` field
  - Test `runCompletionFlow`:
    - Both succeed → returns `{ supabaseWritten: true, inngestSent: true }`
    - Supabase fails → returns `{ supabaseWritten: false, inngestSent: false }` (abort)
    - Supabase succeeds, Inngest fails → returns `{ supabaseWritten: true, inngestSent: false }` (acceptable)
    - **CRITICAL**: Ordering test with `invocationCallOrder` (Supabase before Inngest)
  - Mock PostgREST client and global `fetch` for Inngest HTTP calls
  - Target: ~18-22 tests

  **Must NOT do**:
  - Do NOT make real Supabase or Inngest calls
  - Do NOT test PostgREST client internals

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard test writing, but ordering test requires careful mock setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (after Task 6 completes)
  - **Blocks**: None directly
  - **Blocked By**: Task 6 (needs module to exist)

  **References**:

  **Pattern References**:
  - `tests/workers/lib/heartbeat.test.ts` — Pattern for testing multi-step operations with individual step mocking and assertion.
  - `tests/gateway/inngest-send.test.ts` — Pattern for testing Inngest send retry behavior.

  **Acceptance Criteria**:
  - [ ] Test file exists: `tests/workers/lib/completion.test.ts`
  - [ ] `pnpm test -- --run tests/workers/lib/completion.test.ts` → 18+ tests pass, 0 failures
  - [ ] Ordering test present: `invocationCallOrder` assertion for Supabase-before-Inngest
  - [ ] Deterministic event ID test present

  **QA Scenarios**:

  ```
  Scenario: All completion tests pass
    Tool: Bash (Vitest)
    Preconditions: Task 6 module exists, tests written
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/completion.test.ts 2>&1
      2. Assert: exit code 0
      3. Assert: 18+ tests passed, 0 failures
    Expected Result: All tests pass including critical ordering test
    Failure Indicators: Test failure, especially ordering assertion
    Evidence: .sisyphus/evidence/task-7-completion-tests.txt
  ```

  **Commit**: YES (combined with Task 6)
  - Message: `feat(workers): add completion module with Supabase-first SPOF mitigation`
  - Files: `tests/workers/lib/completion.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/completion.test.ts`

---

- [x] 8. Implement `project-config.ts` — Fetch Project Tooling Config from DB

  **What to do**:
  - Create `src/workers/lib/project-config.ts` with these exports:
    - `fetchProjectConfig(projectId: string, postgrestClient: PostgRESTClient): Promise<ProjectConfig | null>` — Fetches the project row from PostgREST: `GET projects?id=eq.${projectId}&select=id,name,repo_url,default_branch,tooling_config`. Returns parsed config or null on failure.
    - `parseRepoOwnerAndName(repoUrl: string): { owner: string; repo: string }` — Parses `https://github.com/owner/repo` or `https://github.com/owner/repo.git` into `{ owner, repo }`.
  - This replaces the Phase 5 hardcoded `resolveToolingConfig(null)` call in orchestrate.mts
  - The project row provides: `default_branch` (for PR base), `tooling_config` (for validation pipeline), and `repo_url` (for GitHub API owner/repo)

  **Must NOT do**:
  - Do NOT modify `resolveToolingConfig()` — it already handles merge with defaults. Just provide the project row to it.
  - Do NOT add new columns to the projects table

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple PostgREST fetch + URL parsing — minimal complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4, 6)
  - **Blocks**: Task 9 (tests), Task 10 (orchestrate integration)
  - **Blocked By**: Task 1 (schema verification gate)

  **References**:

  **Pattern References**:
  - `src/workers/lib/task-context.ts:resolveToolingConfig()` — The function that project-config's output feeds into. Phase 5 calls it with `null`; Phase 6 calls it with the fetched project row.
  - `src/workers/lib/postgrest-client.ts:get()` — The PostgREST GET method for fetching the project row.

  **API/Type References**:
  - `prisma/schema.prisma:109-127` — Project model with `default_branch`, `tooling_config`, `repo_url` fields
  - `src/workers/lib/task-context.ts:ProjectRow` — The interface that `resolveToolingConfig` expects

  **WHY Each Reference Matters**:
  - `task-context.ts:resolveToolingConfig()` — The output of `fetchProjectConfig` must be compatible with the input shape of `resolveToolingConfig`. Check the `ProjectRow` interface.
  - `postgrest-client.ts:get()` — Use this exact method for the fetch. The PostgREST query format uses `eq.` filter syntax.

  **Acceptance Criteria**:
  - [ ] `fetchProjectConfig` returns project config with `default_branch`, `tooling_config`, `repo_url`
  - [ ] `fetchProjectConfig` returns `null` on network error or empty result
  - [ ] `parseRepoOwnerAndName('https://github.com/org/repo')` returns `{ owner: 'org', repo: 'repo' }`
  - [ ] `parseRepoOwnerAndName('https://github.com/org/repo.git')` returns `{ owner: 'org', repo: 'repo' }`
  - [ ] TypeScript compiles: `pnpm tsc --noEmit` exits 0

  **QA Scenarios**:

  ```
  Scenario: Project config fetch and repo URL parsing
    Tool: Bash (Vitest)
    Preconditions: Module compiled, PostgREST mocked
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/project-config.test.ts
      2. Assert: All tests pass
    Expected Result: Config fetch and URL parsing both work correctly
    Evidence: .sisyphus/evidence/task-8-project-config.txt
  ```

  **Commit**: YES (groups with Task 9)
  - Message: `feat(workers): add project-config fetch for tooling_config`
  - Files: `src/workers/lib/project-config.ts`, `tests/workers/lib/project-config.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/project-config.test.ts`

---

- [x] 9. Tests for `project-config.ts`

  **What to do**:
  - Create `tests/workers/lib/project-config.test.ts` with dedicated test file
  - Test `fetchProjectConfig`:
    - Happy path: PostgREST returns project row → parsed config returned
    - Empty result (project not found) → returns null
    - Network error → returns null with warning
    - `tooling_config` is null → returned config has null tooling_config (resolveToolingConfig handles defaults)
  - Test `parseRepoOwnerAndName`:
    - HTTPS URL → `{ owner, repo }`
    - HTTPS URL with `.git` suffix → `{ owner, repo }` (strip .git)
    - SSH URL `git@github.com:owner/repo.git` → `{ owner, repo }`
    - Invalid URL → throws or returns error
  - Mock PostgREST client
  - Target: ~10-12 tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple test patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (after Task 8)
  - **Blocks**: None directly
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `tests/workers/lib/task-context.test.ts` — Pattern for testing parsers and config resolution

  **Acceptance Criteria**:
  - [ ] Test file exists: `tests/workers/lib/project-config.test.ts`
  - [ ] `pnpm test -- --run tests/workers/lib/project-config.test.ts` → 10+ tests pass, 0 failures

  **QA Scenarios**:

  ```
  Scenario: All project-config tests pass
    Tool: Bash (Vitest)
    Steps:
      1. Run: pnpm test -- --run tests/workers/lib/project-config.test.ts 2>&1
      2. Assert: exit code 0, 10+ tests pass, 0 failures
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-9-project-config-tests.txt
  ```

  **Commit**: YES (combined with Task 8)
  - Message: `feat(workers): add project-config fetch for tooling_config`
  - Files: `tests/workers/lib/project-config.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/lib/project-config.test.ts`

- [x] 10. Integrate Completion Flow into `orchestrate.mts`

  **What to do**:
  - Modify `src/workers/orchestrate.mts` to add Steps 12-16 between the fix loop success check and the final `process.exit(0)`:
    - **Step 12: Fetch project config** — Call `fetchProjectConfig(task.project_id, postgrestClient)` and pass result to `resolveToolingConfig()` (replacing the Phase 5 `resolveToolingConfig(null)` call). Also extract `owner`, `repo` via `parseRepoOwnerAndName(projectConfig.repo_url)` and `defaultBranch` from `projectConfig.default_branch`.
    - **Step 13: Create/checkout branch** — Call `buildBranchName(task.external_id, summary)` to get the branch name. Call `ensureBranch(branchName, '/workspace')`.
    - **Step 14: Commit and push** — Call `commitAndPush(branchName, commitMessage, '/workspace')`. If `pushed: false` (empty diff), log warning and skip PR creation but still send completion event.
    - **Step 15: Create PR (with deduplication)** — Call `createOrUpdatePR({ owner, repo, base: defaultBranch, headBranch: branchName, ticketId, summary, task, executionId }, githubClient)`. Skip if no changes were pushed.
    - **Step 16: Run completion flow** — Call `runCompletionFlow({ taskId, executionId, prUrl: pr?.html_url, postgrestClient })`. This writes Supabase first, then sends Inngest event.
  - Move Step 4 (toolingConfig resolution) to after project config fetch in Step 12
  - Import `createGitHubClient` from `src/lib/github-client.ts` and construct it with `GITHUB_TOKEN` env var
  - Update the success exit code block to log PR URL and completion status
  - Preserve the failure path (fix-loop failure → escalate → exit(1)) exactly as-is

  **Must NOT do**:
  - Do NOT modify the fix-loop failure path (lines 170-175)
  - Do NOT change the heartbeat or escalation logic
  - Do NOT remove existing Phase 5 steps (1-11)
  - Do NOT change the SIGTERM handler behavior

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Critical integration point wiring 4 new modules into the existing 12-step flow. Must preserve all existing behavior while adding new steps. High coordination risk.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential within wave)
  - **Blocks**: Task 11 (tests), Task 15 (documentation)
  - **Blocked By**: Tasks 2, 4, 6, 8 (all Wave 2 modules)

  **References**:

  **Pattern References**:
  - `src/workers/orchestrate.mts:68-183` — The full existing `main()` function. Phase 6 inserts between line 160 (fix loop result check) and line 169 (process.exit(0)).
  - `src/workers/orchestrate.mts:49-62` — `patchExecution()` helper pattern for fire-and-forget DB writes. New steps should use the same pattern.

  **API/Type References**:
  - `src/workers/lib/branch-manager.ts` — `buildBranchName`, `ensureBranch`, `commitAndPush` (Task 2)
  - `src/workers/lib/pr-manager.ts` — `createOrUpdatePR` (Task 4)
  - `src/workers/lib/completion.ts` — `runCompletionFlow` (Task 6)
  - `src/workers/lib/project-config.ts` — `fetchProjectConfig`, `parseRepoOwnerAndName` (Task 8)
  - `src/lib/github-client.ts:84` — `createGitHubClient({ token })` constructor

  **WHY Each Reference Matters**:
  - `orchestrate.mts:68-183` — The exact insertion point. Lines 160-169 is the success path. New steps go here.
  - `orchestrate.mts:49-62` — The `patchExecution` wrapper. Phase 6 steps should follow this pattern for DB updates.
  - All Task 2/4/6/8 modules — These are the building blocks wired together here.

  **Acceptance Criteria**:
  - [ ] orchestrate.mts has 16 steps (12 existing + 4 new: project config, branch, PR, completion)
  - [ ] `resolveToolingConfig(null)` replaced with `resolveToolingConfig(projectConfig)`
  - [ ] Branch name constructed from `task.external_id` and summary
  - [ ] PR creation skipped when no changes pushed
  - [ ] Completion flow runs with correct params
  - [ ] `process.exit(0)` still called after all new steps
  - [ ] Fix-loop failure path unchanged
  - [ ] TypeScript compiles: `pnpm tsc --noEmit` exits 0

  **QA Scenarios**:

  ```
  Scenario: Full orchestrate success path with completion flow
    Tool: Bash (Vitest)
    Preconditions: All Wave 2 modules exist
    Steps:
      1. Run: pnpm test -- --run tests/workers/orchestrate.test.ts 2>&1
      2. Assert: "full main() happy path" test passes (updated to include Phase 6 steps)
      3. Assert: process.exit called with 0
    Expected Result: All 16 steps execute in order, exit(0)
    Failure Indicators: Any step throws, wrong exit code, or missing step
    Evidence: .sisyphus/evidence/task-10-orchestrate-integration.txt

  Scenario: Empty diff skips PR creation
    Tool: Bash (Vitest)
    Steps:
      1. Mock commitAndPush to return { pushed: false, reason: 'no_changes' }
      2. Run main()
      3. Assert: createOrUpdatePR NOT called
      4. Assert: runCompletionFlow still called (with null PR URL)
    Expected Result: No PR created, but completion event still sent
    Failure Indicators: PR creation attempted, or completion flow skipped
    Evidence: .sisyphus/evidence/task-10-empty-diff-flow.txt
  ```

  **Commit**: YES (groups with Task 11)
  - Message: `feat(workers): integrate completion flow into orchestrate.mts`
  - Files: `src/workers/orchestrate.mts`, `tests/workers/orchestrate.test.ts`
  - Pre-commit: `pnpm test -- --run tests/workers/orchestrate.test.ts`

---

- [x] 11. Update Tests for `orchestrate.mts` Changes

  **What to do**:
  - Update `tests/workers/orchestrate.test.ts` (existing 11 tests) to add Phase 6 scenarios:
    - Update "full main() happy path" test to include Steps 12-16 (project config, branch, PR, completion)
    - Add test: "project config fetch failure → falls back to defaults" (non-fatal)
    - Add test: "branch creation failure → exit(1) with error"
    - Add test: "push failure → exit(1) with error"
    - Add test: "empty diff → skips PR, sends completion event"
    - Add test: "PR deduplication → reuses existing PR URL"
    - Add test: "completion Supabase write fails → exit(1)"
    - Add test: "completion Inngest send fails → exit(0) (work done, watchdog handles)"
    - Add test: "github-client construction from GITHUB_TOKEN env var"
  - Mock all new module imports using `vi.mock()`
  - Target: ~9-11 new tests (total: ~20-22 for this file)

  **Must NOT do**:
  - Do NOT remove existing Phase 5 tests
  - Do NOT make real GitHub/Supabase/Inngest calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Testing complex integration with many mocked dependencies, need to cover multiple paths
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 10)
  - **Blocks**: Task 17 (full test suite)
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `tests/workers/orchestrate.test.ts` — Existing 11 tests. The mock setup for `main()` already exists — add new mocks for Phase 6 modules.

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/workers/orchestrate.test.ts` → 20+ tests pass, 0 failures
  - [ ] All Phase 5 tests still pass (no regressions)
  - [ ] Empty diff path covered
  - [ ] Inngest failure → exit(0) path covered

  **QA Scenarios**:

  ```
  Scenario: Updated orchestrate tests all pass
    Tool: Bash (Vitest)
    Steps:
      1. Run: pnpm test -- --run tests/workers/orchestrate.test.ts 2>&1
      2. Assert: exit code 0, 20+ tests pass, 0 failures
    Expected Result: All tests pass including new Phase 6 scenarios
    Evidence: .sisyphus/evidence/task-11-orchestrate-tests.txt
  ```

  **Commit**: YES (combined with Task 10)
  - Message: `feat(workers): integrate completion flow into orchestrate.mts`
  - Files: `tests/workers/orchestrate.test.ts`

---

- [x] 12. Update `lifecycle.ts` Finalize Step + Deliverables Record

  **What to do**:
  - Modify `src/inngest/lifecycle.ts` finalize step to handle real completion event data:
    - Read the `result` object from `step.waitForEvent` — it carries `{ data: { taskId, executionId, prUrl, status } }`
    - On completion (result is not null):
      1. Read task status from Supabase to confirm `Submitting` (machine already wrote this)
      2. Create `deliverables` record via Prisma: `prisma.deliverable.create({ data: { execution_id: executionId, delivery_type: 'pull_request', external_ref: prUrl, status: 'submitted' } })`
      3. Update task status to `Done` via `prisma.task.updateMany({ where: { id: taskId, status: 'Submitting' }, data: { status: 'Done' } })` (optimistic lock on `Submitting`)
      4. Write `task_status_log` entry: `{ from_status: 'Submitting', to_status: 'Done', actor: 'lifecycle_fn' }`
      5. Attempt machine destroy as fallback: `// TODO Phase 7: flyApi.destroyMachine(machine.id).catch(() => {})`
    - On timeout (result is null): Keep existing behavior (re-dispatch or escalate)
    - Handle edge case: task status already `Done` (idempotent — skip update)
    - Handle edge case: task status is `Cancelled` (don't transition to Done)
    - Handle case where `prUrl` is null (empty diff — no PR created): create deliverables record with `delivery_type: 'no_changes'` and `external_ref: null`

  **Must NOT do**:
  - Do NOT implement review agent logic
  - Do NOT implement Fly.io machine destroy (keep as TODO for Phase 7)
  - Do NOT change the timeout/re-dispatch logic (already correct from Phase 3)
  - Do NOT change concurrency configuration

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Lifecycle function finalize is the critical path for task completion. Must handle multiple edge cases (already Done, Cancelled, no PR). Uses Prisma + InngestTestEngine testing.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 13 (tests), Task 15 (documentation)
  - **Blocked By**: Task 6 (completion event format must be defined)

  **References**:

  **Pattern References**:
  - `src/inngest/lifecycle.ts:59-127` — The existing finalize step. Lines 113-126 is the completion branch (currently a stub with TODO).
  - `src/inngest/lifecycle.ts:19-37` — Optimistic locking pattern for status transitions (`updateMany` with `WHERE status = expected`).

  **API/Type References**:
  - `prisma/schema.prisma:77-91` — Deliverable model: `{ execution_id, delivery_type, external_ref, risk_score, status }`
  - `src/workers/lib/completion.ts` — Event payload shape: `{ taskId, executionId, prUrl, status }` (from Task 6)

  **Test References**:
  - `tests/inngest/lifecycle.test.ts` — Existing lifecycle tests using `InngestTestEngine` and Prisma mocks

  **WHY Each Reference Matters**:
  - `lifecycle.ts:113-126` — The exact code being replaced. The stub currently just checks `task.status !== 'Done'` and sets Done. Phase 6 adds deliverables creation and the optimistic lock on `Submitting`.
  - `lifecycle.ts:19-37` — The optimistic lock pattern to copy for `Submitting → Done`.

  **Acceptance Criteria**:
  - [ ] Deliverables record created with `delivery_type: 'pull_request'` and `external_ref: prUrl`
  - [ ] Task status transitions: `Submitting → Done` (not `Executing → Done`)
  - [ ] Status log entry: `{ from: 'Submitting', to: 'Done', actor: 'lifecycle_fn' }`
  - [ ] Already-Done task → no duplicate update (idempotent)
  - [ ] Cancelled task → no transition to Done
  - [ ] Timeout/re-dispatch logic unchanged
  - [ ] TypeScript compiles: `pnpm tsc --noEmit` exits 0

  **QA Scenarios**:

  ```
  Scenario: Lifecycle finalize creates deliverables on completion
    Tool: Bash (Vitest + @inngest/test)
    Preconditions: lifecycle tests set up with InngestTestEngine
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts 2>&1
      2. Assert: "finalize creates deliverable record" test passes
      3. Assert: prisma.deliverable.create called with correct args
    Expected Result: Deliverable created with PR URL
    Evidence: .sisyphus/evidence/task-12-lifecycle-finalize.txt

  Scenario: Lifecycle handles already-Done task idempotently
    Tool: Bash (Vitest)
    Steps:
      1. Mock task.findUnique to return { status: 'Done' }
      2. Send completion event
      3. Assert: task.updateMany NOT called (already Done)
    Expected Result: No duplicate status update
    Evidence: .sisyphus/evidence/task-12-already-done.txt
  ```

  **Commit**: YES (groups with Task 13)
  - Message: `feat(inngest): update lifecycle finalize with deliverables record`
  - Files: `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/lifecycle.test.ts`

---

- [x] 13. Update Tests for `lifecycle.ts` Changes

  **What to do**:
  - Update `tests/inngest/lifecycle.test.ts` to add Phase 6 scenarios:
    - Add test: "finalize on completion creates deliverable with PR URL"
    - Add test: "finalize on completion transitions Submitting → Done"
    - Add test: "finalize on completion writes status log entry (actor: lifecycle_fn)"
    - Add test: "finalize skips update when task already Done (idempotent)"
    - Add test: "finalize skips update when task Cancelled"
    - Add test: "finalize handles null prUrl (no changes, delivery_type: 'no_changes')"
    - Add test: "finalize on timeout still uses existing re-dispatch logic"
    - Update existing finalize tests to work with new event payload shape
  - Use `InngestTestEngine` and mock Prisma client (matching existing test pattern)
  - Target: ~7-8 new tests (total: ~18-19 for lifecycle tests)

  **Must NOT do**:
  - Do NOT remove existing Phase 3 tests
  - Do NOT test Fly.io machine destroy (placeholder)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: InngestTestEngine patterns are complex, need to handle step completion events and Prisma mock coordination
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 12)
  - **Blocks**: Task 17 (full test suite)
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle.test.ts` — Existing test setup with `InngestTestEngine`, `mockCtx`, and `mockPrisma`

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/inngest/lifecycle.test.ts` → 18+ tests pass, 0 failures
  - [ ] Deliverables creation test present
  - [ ] Submitting → Done transition test present
  - [ ] Idempotent (already Done) test present
  - [ ] All Phase 3 tests still pass

  **QA Scenarios**:

  ```
  Scenario: Updated lifecycle tests all pass
    Tool: Bash (Vitest)
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts 2>&1
      2. Assert: exit code 0, 18+ tests pass, 0 failures
    Expected Result: All tests pass including new Phase 6 scenarios
    Evidence: .sisyphus/evidence/task-13-lifecycle-tests.txt
  ```

  **Commit**: YES (combined with Task 12)
  - Message: `feat(inngest): update lifecycle finalize with deliverables record`
  - Files: `tests/inngest/lifecycle.test.ts`

---

- [x] 14. Update `entrypoint.sh` — Branch Naming + Git Identity

  **What to do**:
  - Modify `src/workers/entrypoint.sh`:
    - **Step 1 addition**: After writing auth tokens, add git identity config:
      ```bash
      git config --global user.email "ai-employee@platform.local"
      git config --global user.name "AI Employee"
      ```
    - **Step 3 modification**: Construct `TASK_BRANCH` from task context if not already set:
      - Read `external_id` from `.task-context.json` (using `grep -o` or `jq` if available)
      - Read `summary` from the triage_result in `.task-context.json`
      - Construct branch name: `ai/${EXTERNAL_ID}-$(echo "${SUMMARY}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | head -c 60)`
      - Export `TASK_BRANCH` so orchestrate.mts can read it
    - Ensure the construction is idempotent (only construct if `TASK_BRANCH` is not already set as env var)
  - Update `tests/workers/entrypoint.test.ts` (if exists) or create basic syntax/logic tests

  **Must NOT do**:
  - Do NOT change Steps 2, 4-8 of entrypoint.sh
  - Do NOT remove the existing `TASK_BRANCH` env var support (backward compat)
  - Do NOT add dependencies (no `jq` requirement — use bash builtins and standard tools)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small shell script modifications, bash string manipulation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15 (documentation)
  - **Blocked By**: Task 2 (branch naming format must be defined)

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh:41-52` — Step 1: Auth tokens. Git identity config goes here.
  - `src/workers/entrypoint.sh:79-92` — Step 3: Branch checkout. Task branch construction goes here.
  - Architecture doc §9.4 — Branch naming: `ai/<jira-ticket-id>-<kebab-summary>`

  **Acceptance Criteria**:
  - [ ] `bash -n src/workers/entrypoint.sh` → syntax OK
  - [ ] Git identity set: `user.email = ai-employee@platform.local`, `user.name = AI Employee`
  - [ ] `TASK_BRANCH` constructed when not already set as env var
  - [ ] `TASK_BRANCH` preserved when already set as env var (backward compat)
  - [ ] Branch name follows `ai/<ticket-id>-<kebab-summary>` format

  **QA Scenarios**:

  ```
  Scenario: Entrypoint syntax check
    Tool: Bash
    Steps:
      1. Run: bash -n src/workers/entrypoint.sh
      2. Assert: exit code 0 (no syntax errors)
    Expected Result: Clean syntax
    Evidence: .sisyphus/evidence/task-14-entrypoint-syntax.txt

  Scenario: Git identity is set in Step 1
    Tool: Bash (grep)
    Steps:
      1. Grep entrypoint.sh for 'git config --global user.email'
      2. Grep entrypoint.sh for 'git config --global user.name'
      3. Assert: both lines present
    Expected Result: Git identity configuration found
    Evidence: .sisyphus/evidence/task-14-git-identity.txt
  ```

  **Commit**: YES
  - Message: `feat(workers): add branch naming to entrypoint.sh`
  - Files: `src/workers/entrypoint.sh`, `tests/workers/entrypoint.test.ts`
  - Pre-commit: `bash -n src/workers/entrypoint.sh && pnpm test -- --run tests/workers/entrypoint.test.ts`

---

- [x] 15. Write Phase Completion Document

  **What to do**:
  - Create `docs/YYYY-MM-DD-phase6-completion-delivery.md` (get timestamp via `date "+%Y-%m-%d-%H%M"`)
  - Follow the exact structure of `docs/2026-03-26-1511-phase1-foundation.md` and `docs/2026-03-30-1511-phase5-execution-agent.md`:
    - **What This Document Is** — Phase 6 scope statement
    - **What Was Built** — Mermaid diagram of Phase 6 components + table
    - **Project Structure** — Updated directory tree showing new files
    - **Module Architecture** — Each new module with interface, behavior, design decisions
    - **Execution Flow** — Updated 16-step orchestrate.mts flow diagram
    - **Completion Flow** — Branch → PR → Supabase → Inngest → Lifecycle → Done sequence
    - **Known Limitations** — What Phase 7 builds on top
    - **Test Suite** — Table of all test files with counts
    - **Key Design Decisions** — Supabase-first SPOF, deterministic event ID, force-with-lease, etc.
    - **What Phase 7 Builds On Top** — Watchdog, cost circuit breaker, token tracking
  - Use standard Mermaid color palette (see AGENTS.md Mermaid rules)
  - Include all numbered steps in flow diagrams with Flow Walkthrough tables

  **Must NOT do**:
  - Do NOT include emojis
  - Do NOT include speculative "future work" beyond what Phase 7 explicitly defines
  - Do NOT duplicate architecture doc content — reference it instead

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation with Mermaid diagrams, following established template
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after all implementation)
  - **Blocks**: Task 16 (progress.json needs doc file path)
  - **Blocked By**: Tasks 10, 12, 14 (all implementation must be complete)

  **References**:

  **Pattern References**:
  - `docs/2026-03-26-1511-phase1-foundation.md` — Exact document structure to follow. Copy the heading hierarchy and section order.
  - `docs/2026-03-30-1511-phase5-execution-agent.md` — Most recent phase doc. Follow the same level of detail for module descriptions.

  **Acceptance Criteria**:
  - [ ] Doc file exists at `docs/YYYY-MM-DD-phase6-completion-delivery.md`
  - [ ] Contains: What Was Built, Project Structure, Module Architecture, Execution Flow, Test Suite, Key Design Decisions
  - [ ] Mermaid diagrams use standard color palette
  - [ ] All flow diagrams have numbered steps + Flow Walkthrough tables
  - [ ] Test suite section lists all new test files with counts

  **Commit**: YES
  - Message: `docs(phase6): add phase 6 completion & delivery documentation`
  - Files: `docs/YYYY-MM-DD-phase6-completion-delivery.md`

---

- [x] 16. Update `progress.json` for Phase 6

  **What to do**:
  - Update `.sisyphus/progress.json`:
    - Set Phase 6 `status` to `"complete"`
    - Set `started_at` and `completed_at` timestamps
    - Set `plan_file` to `.sisyphus/plans/2026-03-30-1624-phase6-completion-delivery.md`
    - Set `doc_file` to the Phase 6 doc path from Task 15
    - Set `last_session_id` to the current session ID
    - Update `last_updated` to current timestamp
    - Update all checkpoint statuses to `"complete"` with `verified_at` timestamps and `verify_command` entries:
      - `branch_creation`: verify_command: `grep -q 'buildBranchName' src/workers/lib/branch-manager.ts && echo PASS`
      - `pr_creation`: verify_command: `grep -q 'checkExistingPR' src/workers/lib/pr-manager.ts && echo PASS`
      - `supabase_first_write`: verify_command: `grep -q 'writeCompletionToSupabase' src/workers/lib/completion.ts && echo PASS`
      - `inngest_completion_event`: verify_command: `grep -q 'sendCompletionEvent' src/workers/lib/completion.ts && echo PASS`
      - `lifecycle_finalize`: verify_command: `pnpm test -- --run tests/inngest/lifecycle.test.ts`
      - `tests_written`: description with total new test count
      - `tests_passing`: verify_command: `pnpm test -- --run`
      - `committed`: description listing all commits
      - `documented`: description with doc file path
    - Update Phase 6 `resume_hint` to `"Phase 6 is complete. Proceed to Phase 7 (Resilience & Monitoring)."`

  **Must NOT do**:
  - Do NOT modify Phase 1-5 entries
  - Do NOT modify Phase 7-10 entries (except `resume_hint` is already correct)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON file update following established pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 15)
  - **Blocks**: Task 17
  - **Blocked By**: Task 15

  **References**:

  **Pattern References**:
  - `.sisyphus/progress.json:13-82` — Phase 1 entry structure. Copy the checkpoint format exactly.
  - `.sisyphus/progress.json:303-369` — Phase 5 entry. Most recent completed phase — follow the same detail level.

  **Acceptance Criteria**:
  - [ ] Phase 6 status = `"complete"`
  - [ ] All 9 checkpoints have status = `"complete"` with `verified_at` timestamps
  - [ ] `plan_file` and `doc_file` point to correct paths
  - [ ] `last_updated` is current
  - [ ] JSON is valid: `node -e "JSON.parse(require('fs').readFileSync('.sisyphus/progress.json', 'utf8'))"` exits 0

  **QA Scenarios**:

  ```
  Scenario: progress.json is valid and complete
    Tool: Bash
    Steps:
      1. Run: node -e "const p = JSON.parse(require('fs').readFileSync('.sisyphus/progress.json', 'utf8')); const ph6 = p.phases.find(ph => ph.id === 6); console.log(ph6.status); console.log(Object.values(ph6.checkpoints).every(c => c.status === 'complete'))"
      2. Assert: output is "complete" and "true"
    Expected Result: Phase 6 complete with all checkpoints
    Evidence: .sisyphus/evidence/task-16-progress.txt
  ```

  **Commit**: YES
  - Message: `chore(progress): update progress.json for Phase 6 completion`
  - Files: `.sisyphus/progress.json`

---

- [x] 17. Full Test Suite Verification

  **What to do**:
  - Run the complete test suite: `pnpm test -- --run`
  - Verify: 0 failures, all existing tests still pass (no regressions)
  - Run TypeScript build: `pnpm tsc --noEmit`
  - Run lint: `pnpm lint`
  - Count total tests and verify it's 338 (baseline) + ~80-100 new = ~420-440 total
  - Document results in evidence file

  **Must NOT do**:
  - Do NOT skip any test files
  - Do NOT modify source code (this is verification only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run commands, capture output, verify counts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final gate)
  - **Parallel Group**: Wave 4 (last task before Final wave)
  - **Blocks**: F1-F4 (Final verification)
  - **Blocked By**: All previous tasks

  **References**: None — pure verification task

  **Acceptance Criteria**:
  - [ ] `pnpm tsc --noEmit` → exit 0
  - [ ] `pnpm lint` → exit 0
  - [ ] `pnpm test -- --run` → exit 0, 0 failures, 420+ tests pass
  - [ ] No regression: all 338 baseline tests still pass

  **QA Scenarios**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm tsc --noEmit 2>&1
      2. Assert: exit 0
      3. Run: pnpm lint 2>&1
      4. Assert: exit 0
      5. Run: pnpm test -- --run 2>&1
      6. Assert: exit 0, "Tests" line shows 0 failures
      7. Assert: total test count ≥ 420
    Expected Result: Clean build, lint, and full test pass
    Evidence: .sisyphus/evidence/task-17-full-suite.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm tsc --noEmit` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (completion flow end-to-end). Test edge cases: empty diff, re-dispatch, PR deduplication. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                             | Files                                                                           |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1    | `chore(phase6): verify schema assumptions for completion & delivery`       | verification notes only                                                         |
| 2a   | `feat(workers): add branch-manager with git branch/commit/push support`    | `src/workers/lib/branch-manager.ts`, `tests/workers/lib/branch-manager.test.ts` |
| 2b   | `feat(workers): add pr-manager with deduplication support`                 | `src/workers/lib/pr-manager.ts`, `tests/workers/lib/pr-manager.test.ts`         |
| 2c   | `feat(workers): add completion module with Supabase-first SPOF mitigation` | `src/workers/lib/completion.ts`, `tests/workers/lib/completion.test.ts`         |
| 2d   | `feat(workers): add project-config fetch for tooling_config`               | `src/workers/lib/project-config.ts`, `tests/workers/lib/project-config.test.ts` |
| 3a   | `feat(workers): integrate completion flow into orchestrate.mts`            | `src/workers/orchestrate.mts`, `tests/workers/orchestrate.test.ts`              |
| 3b   | `feat(inngest): update lifecycle finalize with deliverables record`        | `src/inngest/lifecycle.ts`, `tests/inngest/lifecycle.test.ts`                   |
| 3c   | `feat(workers): add branch naming to entrypoint.sh`                        | `src/workers/entrypoint.sh`, `tests/workers/entrypoint.test.ts`                 |
| 4a   | `docs(phase6): add phase 6 completion & delivery documentation`            | `docs/YYYY-MM-DD-phase6-completion-delivery.md`                                 |
| 4b   | `chore(progress): update progress.json for Phase 6 completion`             | `.sisyphus/progress.json`                                                       |

Pre-commit check: `pnpm test -- --run` must pass before every commit.

---

## Success Criteria

### Verification Commands

```bash
pnpm tsc --noEmit              # Expected: 0 errors
pnpm lint                       # Expected: 0 errors
pnpm test -- --run              # Expected: ~420-440 tests pass, 0 failures
bash -n src/workers/entrypoint.sh  # Expected: syntax OK
```

### Final Checklist

- [ ] All "Must Have" items present and tested
- [ ] All "Must NOT Have" items absent from codebase
- [ ] All 17 tasks completed + 4 final reviews approved
- [ ] Phase completion doc written at `docs/YYYY-MM-DD-phase6-completion-delivery.md`
- [ ] `progress.json` Phase 6 status = "complete" with all checkpoints
- [ ] Full test suite passes
