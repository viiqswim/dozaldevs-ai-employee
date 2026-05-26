# Fix daily-real-estate-inspiration-2 Delivery Bugs

## TL;DR

> **Quick Summary**: Fix two bugs in the `daily-real-estate-inspiration-2` employee: (1) posts a meta-description instead of actual inspirational content, (2) double-posts due to a delivery retry caused by a pre-existing PostgREST HTTP 400 on `task_status_log`. The PostgREST 400 is a platform-wide harness bug (wrong `actor` value + missing `updated_at`).
>
> **Deliverables**:
>
> - Fixed `opencode-harness.mts` — correct `actor` value, add `updated_at`, parameterize `markFailed` from_status
> - Updated archetype instructions — execution uses `--draft` for actual content
> - Updated delivery_instructions — explicitly parses JSON and posts `draft` field
> - Updated SQL migration script for reproducibility
> - Docker image rebuilt
> - 10 consecutive successful runs validated
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (harness fix) → Task 4 (Docker rebuild) → Task 5 (validate 10 runs)

---

## Context

### Original Request

Fix the `daily-real-estate-inspiration-2` employee which posts a meta-description summary instead of actual inspirational content, and double-posts identical messages in the Slack thread. Validate with 10 consecutive successful runs.

### Interview Summary

**Key Discussions**:

- **Wrong content**: The execution worker's instructions hardcode `--summary "Posted daily real estate inspiration message"` in the `submit-output.ts` call. The actual inspirational message the LLM composes is lost — never persisted. The `--draft` flag on `submit-output.ts` is the correct mechanism to pass actual content through.
- **Double-posting**: The delivery container posts once, but a PostgREST HTTP 400 on `task_status_log` causes the harness to throw after the Slack post succeeds. The lifecycle sees the task didn't reach `Done` cleanly and retries, spawning a second delivery container.
- **PostgREST 400 root cause**: Two issues — (a) `task_status_log.actor` CHECK constraint allows only `('gateway', 'lifecycle_fn', 'watchdog', 'machine', 'manual')` but harness sends `'opencode_harness'`; (b) `task_status_log.updated_at` is `NOT NULL` with no default but harness doesn't send it.
- **Scope**: Only fix `daily-real-estate-inspiration-2` archetype (not all employees). PostgREST 400 fix is platform-wide (acceptable since it's a platform bug).
- **No unit tests**: User said skip due to timeout issues. Validation via 10 consecutive runs.
- **PostgREST 400 fix approach**: User confirmed to include in this plan.

**Research Findings**:

- `submit-output.ts` already supports `--draft` flag (lines 49-50, 134) — when used, output JSON includes `{"summary":"...","classification":"...","draft":"actual content"}`
- `post-message.ts` auto-threads via `NOTIFY_MSG_TS` env var (lines 64-67) — delivery container has this set
- Lifecycle's `logStatusTransition` (line 57-79 of `employee-lifecycle.ts`) includes `updated_at: new Date().toISOString()` and uses `actor: 'lifecycle_fn'` — the harness should match this shape
- The `'machine'` actor value is already in the CHECK constraint allowlist and is semantically correct for worker containers — no migration needed
- `markFailed` is called from both delivery context (lines 656, 672, 723, 734, 745, 753) AND execution context (line 927), but hardcodes `from_status: 'Delivering'`
- The harness writes `tasks.status = 'Done'` (line 764-767) BEFORE writing `task_status_log` (line 769-777). The task_status_log failure causes a throw, but the task IS already marked Done in the DB

### Metis Review

**Identified Gaps** (addressed):

- **Double-post mechanism**: The harness writes `tasks.status='Done'` before `task_status_log`. The `task_status_log` POST fails (400), harness throws — but task IS already Done. The lifecycle polls task status, sees Done, and proceeds. However, the harness exit code is non-zero (throw → `process.exit(1)` or unhandled rejection), which the lifecycle interprets as a worker failure. The lifecycle may then re-dispatch. **Resolution**: Fixing the PostgREST 400 prevents the throw, so the harness exits cleanly with `process.exit(0)`.
- **`markFailed` has TWO task_status_log POSTs**: Both line 106-111 (markFailed) AND line 769-777 (success path) need the fix. Both are addressed in Task 1.
- **Use `actor: 'machine'` instead of migration**: `'machine'` is already in the CHECK constraint allowlist. Changing the harness code is safer than an irreversible schema migration. Adopted.
- **delivery_instructions must specify JSON parsing**: The delivery container receives raw JSON as `--- APPROVED CONTENT ---`. Instructions must explicitly tell it to parse JSON and extract `draft` field. Addressed in Task 3.
- **`submit-output.ts` doesn't write `delivered: true`**: The delivery container must write `/tmp/summary.txt` directly (e.g., `echo '{"delivered":true}' > /tmp/summary.txt`), NOT via `submit-output.ts`. Addressed in Task 3.
- **`--summary` value**: Execution worker must still provide a meaningful `--summary` alongside `--draft`. Specified as a short meta-description. Addressed in Task 2.

---

## Work Objectives

### Core Objective

Fix the `daily-real-estate-inspiration-2` employee so it reliably posts actual inspirational content (not meta-descriptions) exactly once per run, and fix the platform-wide PostgREST HTTP 400 bug in the delivery harness.

### Concrete Deliverables

- `src/workers/opencode-harness.mts` — fixed `task_status_log` POST calls (correct actor, include updated_at, parameterized from_status)
- Archetype `instructions` updated in DB — execution worker uses `--draft` for actual content
- Archetype `delivery_instructions` updated in DB — delivery container parses JSON, extracts `draft`, posts to Slack, writes `{"delivered":true}` directly
- `scripts/2026-05-25-update-archetype-delivery.sql` — updated for reproducibility
- Docker image rebuilt with harness fix
- 10 consecutive successful runs documented

### Definition of Done

- [x] `daily-real-estate-inspiration-2` posts actual inspirational content (quotes, insights), not meta-descriptions
- [x] Each run produces exactly ONE Slack message (no double-posting)
- [x] `task_status_log` has correct `Delivering→Done` entries (no more HTTP 400s)
- [x] 10 consecutive runs all reach `Done` status with correct content

### Must Have

- PostgREST 400 fix (actor value + updated_at) in the harness
- `markFailed` parameterized `from_status` (not hardcoded `'Delivering'`)
- Archetype instructions using `--draft` for actual content
- Delivery instructions with explicit JSON parsing and direct `/tmp/summary.txt` write
- 10 consecutive successful runs validated

### Must NOT Have (Guardrails)

- DO NOT modify `src/inngest/employee-lifecycle.ts` — the lifecycle is not broken
- DO NOT modify `src/inngest/lifecycle.ts` (deprecated engineering lifecycle)
- DO NOT touch any other archetype's `instructions` or `delivery_instructions`
- DO NOT add a new DB migration for the actor CHECK constraint — use `'machine'` instead
- DO NOT run unit tests (known timeout issues)
- DO NOT use `--no-verify` on git commits
- DO NOT add `Co-authored-by` lines to commits
- DO NOT reference AI tools in commit messages
- DO NOT modify the approval path (lines ~1858-2320 in employee-lifecycle.ts)
- DO NOT over-engineer the archetype instructions — this is a simple employee, keep it simple

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO (user explicitly said skip due to timeout issues)
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — Send PostgREST requests, assert status + response fields
- **DB verification**: Use Bash (psql) — Query task_status_log, deliverables, tasks tables
- **Slack verification**: Check delivery container logs for correct post-message.ts calls

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — code + DB fixes, fully parallel):
├── Task 1: Fix harness task_status_log POST calls [quick]
├── Task 2: Update archetype instructions in DB (execution worker) [quick]
├── Task 3: Update archetype delivery_instructions in DB [quick]
└── Task 4: Update SQL migration script for reproducibility [quick]

Wave 2 (After Wave 1 — rebuild + single validation):
└── Task 5: Docker rebuild + single validation run [unspecified-high]

Wave 3 (After Wave 2 — full validation):
└── Task 6: 10 consecutive successful runs validation [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave  |
| ---- | ---------- | ------ | ----- |
| 1    | —          | 5      | 1     |
| 2    | —          | 5      | 1     |
| 3    | —          | 5      | 1     |
| 4    | —          | —      | 1     |
| 5    | 1, 2, 3    | 6      | 2     |
| 6    | 5          | F1-F4  | 3     |
| F1   | 6          | —      | FINAL |
| F2   | 6          | —      | FINAL |
| F3   | 6          | —      | FINAL |
| F4   | 6          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **1** — T5 → `unspecified-high`
- **Wave 3**: **1** — T6 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix harness `task_status_log` POST calls

  **What to do**:
  - In `src/workers/opencode-harness.mts`, change `actor: 'opencode_harness'` → `actor: 'machine'` in BOTH `task_status_log` POST calls:
    - Line 107 (inside `markFailed` function)
    - Line 770 (Delivering→Done success path)
  - Add `updated_at: new Date().toISOString()` to BOTH `task_status_log` POST calls (same two locations). This matches the shape used by `logStatusTransition` in `employee-lifecycle.ts:67-72`.
  - Refactor `markFailed` (line 90) to accept a `fromStatus` parameter instead of hardcoding `'Delivering'`:
    - Change signature from `markFailed(reason, executionId, failureCode?)` to `markFailed(reason, executionId, fromStatus, failureCode?)`
    - Update line 108: `from_status: fromStatus` (instead of `from_status: 'Delivering'`)
    - Update ALL call sites:
      - Lines 656, 672, 723, 734, 745, 753 — pass `'Delivering'` (these are correctly in delivery phase)
      - Line 927 — pass `'Executing'` (this is in the execution phase)

  **Must NOT do**:
  - DO NOT add a DB migration to modify the actor CHECK constraint
  - DO NOT modify `employee-lifecycle.ts`
  - DO NOT change the SIGTERM handler (lines 60-87) — it's a separate pre-existing gap

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file code change with clear before/after transformations
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not relevant — modifying the harness, not a shell tool

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5 (Docker rebuild)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/inngest/employee-lifecycle.ts:57-79` — `logStatusTransition` function showing the correct `task_status_log` POST shape: `{ task_id, from_status, to_status, actor: 'lifecycle_fn', updated_at: new Date().toISOString() }`. The harness must match this shape but use `actor: 'machine'`.

  **API/Type References** (contracts to implement against):
  - `prisma/schema.prisma:148-161` — `TaskStatusLog` model: `id` (auto UUID), `task_id` (UUID), `from_status` (nullable String), `to_status` (String), `actor` (String), `created_at` (auto), `updated_at` (NOT NULL, no default)
  - `prisma/migrations/20260326135326_add_check_constraints/migration.sql:27-29` — actor CHECK constraint: `IN ('gateway', 'lifecycle_fn', 'watchdog', 'machine', 'manual')` — `'machine'` is already allowed

  **Code References** (exact locations to modify):
  - `src/workers/opencode-harness.mts:90-114` — `markFailed` function: change signature, fix actor, add updated_at
  - `src/workers/opencode-harness.mts:106-111` — first `task_status_log` POST (inside markFailed)
  - `src/workers/opencode-harness.mts:769-777` — second `task_status_log` POST (Delivering→Done)
  - `src/workers/opencode-harness.mts:656` — `markFailed` call (delivery: missing archetype)
  - `src/workers/opencode-harness.mts:672` — `markFailed` call (delivery: missing delivery_instructions)
  - `src/workers/opencode-harness.mts:723` — `markFailed` call (delivery: OpenCode session error)
  - `src/workers/opencode-harness.mts:734` — `markFailed` call (delivery: missing summary.txt)
  - `src/workers/opencode-harness.mts:745` — `markFailed` call (delivery: delivered !== true)
  - `src/workers/opencode-harness.mts:753` — `markFailed` call (delivery: general failure)
  - `src/workers/opencode-harness.mts:927` — `markFailed` call (EXECUTION phase — must pass `'Executing'`)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify task_status_log POST succeeds via PostgREST
    Tool: Bash (curl)
    Preconditions: Services running (pnpm dev), at least one task exists in DB
    Steps:
      1. Get a valid task_id: psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT id FROM tasks LIMIT 1;"
      2. POST to task_status_log via PostgREST:
         source .env && curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:54331/rest/v1/task_status_log" \
           -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
           -H "Content-Type: application/json" \
           -d '{"task_id":"<task_id>","from_status":"Executing","to_status":"Failed","actor":"machine","updated_at":"2026-01-01T00:00:00.000Z"}'
      3. Assert HTTP status code is 201
    Expected Result: HTTP 201 Created (not 400)
    Failure Indicators: HTTP 400 with constraint violation error
    Evidence: .sisyphus/evidence/task-1-postgrest-status-log-post.txt

  Scenario: Verify markFailed signature updated correctly
    Tool: Bash (grep)
    Preconditions: Code changes applied
    Steps:
      1. grep for the markFailed function signature in opencode-harness.mts — must include fromStatus parameter
      2. grep for all markFailed call sites — verify each passes a from_status string
      3. Specifically verify line ~927 passes 'Executing' (not 'Delivering')
    Expected Result: All call sites pass explicit from_status; execution-phase call passes 'Executing'
    Failure Indicators: Any call site missing the fromStatus argument; line ~927 still passing 'Delivering'
    Evidence: .sisyphus/evidence/task-1-markfailed-signature.txt
  ```

  **Commit**: YES
  - Message: `fix(harness): correct task_status_log POST calls with proper actor and updated_at`
  - Files: `src/workers/opencode-harness.mts`

- [x] 2. Update archetype execution instructions to use `--draft` for actual content

  **What to do**:
  - Update the `instructions` field of archetype `3b07ec63-207f-4f2b-a8c3-c17f08bc508f` (`daily-real-estate-inspiration-2`) in the live DB
  - The current instructions tell the LLM to call `submit-output.ts --summary "Posted daily real estate inspiration message" --classification "NO_ACTION_NEEDED"` — the actual inspirational content is lost
  - The new instructions must:
    1. Tell the LLM to compose the inspirational message
    2. Call `submit-output.ts` with BOTH `--summary` (short meta-description) AND `--draft` (the actual full message)
    3. Example: `tsx /tools/platform/submit-output.ts --summary "Daily real estate inspiration message" --classification "NO_ACTION_NEEDED" --draft "<THE ACTUAL INSPIRATIONAL MESSAGE>"`
  - The `--summary` should be a brief one-sentence description (for audit/logging)
  - The `--draft` should contain the FULL inspirational message that will be delivered to Slack
  - Keep instructions simple and clear — this is a simple employee, don't over-engineer
  - IMPORTANT: The instructions must NOT tell the employee to post to Slack directly. The delivery container handles posting.

  **Must NOT do**:
  - DO NOT modify any other archetype's instructions
  - DO NOT add complexity — keep the instructions as simple as possible
  - DO NOT tell the employee to post to Slack (delivery container does that)
  - DO NOT hardcode the `--draft` value — the LLM must compose the actual content dynamically

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single DB update with clear requirements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5 (Docker rebuild + validation)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/platform/submit-output.ts:49-50` — `--draft` flag parsing: `if (args[i] === '--draft' && args[i + 1]) { draft = args[++i]; }`
  - `src/worker-tools/platform/submit-output.ts:134` — draft inclusion in output: `if (args.draft !== null) output['draft'] = args.draft;`

  **DB References**:
  - Archetype ID: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
  - Table: `archetypes`
  - Field: `instructions`
  - Current value ends with hardcoded `submit-output.ts --summary "Posted daily real estate inspiration message" --classification "NO_ACTION_NEEDED"`

  **External References**:
  - `scripts/2026-05-25-update-archetype-delivery.sql` — existing SQL update script; Task 4 will update this separately

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify archetype instructions updated in DB
    Tool: Bash (psql)
    Preconditions: DB accessible
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT instructions FROM archetypes WHERE id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f';"
      2. Assert the output contains '--draft' flag in the submit-output.ts call
      3. Assert the output does NOT contain a hardcoded summary message (should be dynamic)
      4. Assert the output does NOT tell the employee to post to Slack
    Expected Result: Instructions include --draft flag usage, dynamic content, no Slack posting
    Failure Indicators: Missing --draft; hardcoded message; Slack posting instructions present
    Evidence: .sisyphus/evidence/task-2-instructions-updated.txt

  Scenario: Verify instructions don't hardcode draft content
    Tool: Bash (psql)
    Preconditions: DB accessible
    Steps:
      1. Run the same query as above
      2. Check that --draft is followed by a variable/placeholder, not a static string
    Expected Result: The --draft content is dynamically generated by the LLM, not hardcoded
    Failure Indicators: --draft "Posted daily..." or any static string
    Evidence: .sisyphus/evidence/task-2-no-hardcoded-draft.txt
  ```

  **Commit**: NO (groups with Task 3 and 4 in commit 2)

- [x] 3. Update archetype delivery_instructions for JSON parsing and direct file write

  **What to do**:
  - Update the `delivery_instructions` field of archetype `3b07ec63-207f-4f2b-a8c3-c17f08bc508f` (`daily-real-estate-inspiration-2`) in the live DB
  - The delivery container receives the content from `deliverables.content` as a raw JSON string after `--- APPROVED CONTENT ---`
  - The new delivery_instructions MUST explicitly tell the delivery LLM to:
    1. Parse the content after `--- APPROVED CONTENT ---` as JSON
    2. Extract the `draft` field — this is the actual inspirational message
    3. Post the `draft` content to Slack using: `tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "<draft content>"`
    4. After successful posting, write the delivery confirmation file DIRECTLY: `echo '{"delivered":true}' > /tmp/summary.txt`
  - CRITICAL: The delivery container must NOT use `submit-output.ts` for the confirmation — `submit-output.ts` does NOT write a `delivered` key. The harness checks `deliverySummary.delivered !== true` at line 752.
  - CRITICAL: If `NOTIFY_MSG_TS` is set (non-empty), `post-message.ts` will automatically thread the message. No need to specify `--thread` in the instructions.

  **Must NOT do**:
  - DO NOT use `submit-output.ts` for the delivery confirmation file
  - DO NOT modify any other archetype's delivery_instructions
  - DO NOT tell the delivery container to use `--thread` (auto-threading handles this)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single DB update with clear requirements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5 (Docker rebuild + validation)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:660-665` — delivery phase reads content: `deliverableContent = (deliverable.content as string) ?? ''`
  - `src/workers/opencode-harness.mts:681` — delivery prompt construction: `deliveryPrompt = deliveryInstructions + "\n\n--- APPROVED CONTENT ---\n" + deliverableContent`
  - `src/workers/opencode-harness.mts:749-755` — delivery confirmation check: reads `/tmp/summary.txt`, parses JSON, checks `deliverySummary.delivered !== true`

  **Code References**:
  - `src/worker-tools/slack/post-message.ts:64-67` — auto-threading via `NOTIFY_MSG_TS`
  - `src/worker-tools/platform/submit-output.ts` — does NOT write `delivered` key (only `summary`, `classification`, `draft`)

  **DB References**:
  - Archetype ID: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
  - Table: `archetypes`
  - Field: `delivery_instructions`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify delivery_instructions updated in DB
    Tool: Bash (psql)
    Preconditions: DB accessible
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT delivery_instructions FROM archetypes WHERE id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f';"
      2. Assert the output mentions parsing JSON from APPROVED CONTENT
      3. Assert the output mentions extracting the 'draft' field
      4. Assert the output mentions writing '{"delivered":true}' to /tmp/summary.txt directly
      5. Assert the output does NOT mention submit-output.ts
    Expected Result: delivery_instructions include JSON parsing, draft extraction, direct file write
    Failure Indicators: Missing any of the 4 requirements; mentions submit-output.ts for confirmation
    Evidence: .sisyphus/evidence/task-3-delivery-instructions-updated.txt
  ```

  **Commit**: NO (groups with Task 2 and 4 in commit 2)

- [x] 4. Update SQL migration script for reproducibility

  **What to do**:
  - Update `scripts/2026-05-25-update-archetype-delivery.sql` to reflect the new `instructions` AND `delivery_instructions` from Tasks 2 and 3
  - This script should be idempotent (safe to re-run) and match the live DB state after Tasks 2 and 3
  - The script must update BOTH fields for archetype `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
  - Verify the script is syntactically correct by running it: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -f scripts/2026-05-25-update-archetype-delivery.sql`

  **Must NOT do**:
  - DO NOT modify any other archetype in the script
  - DO NOT create a Prisma migration — this is a data-only script

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: SQL script update with clear requirements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately) — but should coordinate with Tasks 2 and 3 for the final instruction text

  **References**:

  **Code References**:
  - `scripts/2026-05-25-update-archetype-delivery.sql` — existing script to update

  **DB References**:
  - Archetype ID: `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`
  - Fields: `instructions`, `delivery_instructions`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify SQL script runs without errors
    Tool: Bash (psql)
    Preconditions: DB accessible
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -f scripts/2026-05-25-update-archetype-delivery.sql
      2. Assert exit code is 0
      3. Verify the instructions and delivery_instructions match what Tasks 2 and 3 set
    Expected Result: Script runs cleanly; DB values match expected
    Failure Indicators: psql error; values don't match
    Evidence: .sisyphus/evidence/task-4-sql-script-run.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `fix(archetype): update inspiration-2 instructions to use --draft for actual content`
  - Files: `scripts/2026-05-25-update-archetype-delivery.sql`

- [x] 5. Docker rebuild + single validation run

  **What to do**:
  - Rebuild the Docker image to pick up the harness changes from Task 1:
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
  - Trigger one run of `daily-real-estate-inspiration-2` and validate:
    ```bash
    source .env
    curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
    ```
  - Wait for completion (~2-3 minutes), then verify:
    1. Task reaches `Done` status
    2. `task_status_log` has a `Delivering→Done` entry with `actor='machine'`
    3. `deliverables.content` JSON has a non-empty `draft` field with actual inspirational content
    4. Exactly ONE message posted to Slack (check delivery container log)
  - If the validation run fails, debug and fix the issue before proceeding to Task 6

  **Must NOT do**:
  - DO NOT proceed to Task 6 if this validation fails — fix issues first
  - DO NOT skip the Docker rebuild

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires Docker build (long-running), triggering a task, waiting, and multi-step verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - AGENTS.md "Long-Running Commands" section — Docker build must use tmux
  - AGENTS.md "Tmux Session Cleanup" — kill sessions when done

  **Command References**:
  - Docker build: `docker build -t ai-employee-worker:latest .`
  - Trigger: `curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Single validation run — happy path
    Tool: Bash (curl + psql)
    Preconditions: Docker image rebuilt, services running
    Steps:
      1. Trigger the employee and capture task_id from response
      2. Wait 3 minutes (poll every 30s: psql -t -c "SELECT status FROM tasks WHERE id='<task_id>'")
      3. Assert status = 'Done'
      4. Query task_status_log: psql -c "SELECT from_status, to_status, actor FROM task_status_log WHERE task_id='<task_id>' AND to_status='Done';"
         Assert: from_status='Delivering', actor='machine'
      5. Query deliverables: psql -c "SELECT content FROM deliverables WHERE external_ref='<task_id>';"
         Assert: JSON contains non-empty 'draft' field with actual inspirational content (not "Posted daily...")
      6. Check delivery container log for exactly 1 post-message.ts call:
         grep -c "post-message" /tmp/employee-delivery-<task_id_prefix>.log
         Assert: count = 1
    Expected Result: Task Done, clean status log, real content in draft, single Slack post
    Failure Indicators: Task stuck at Delivering; status='Failed'; draft is empty/meta-description; 2+ post-message calls
    Evidence: .sisyphus/evidence/task-5-single-validation.txt

  Scenario: Verify no PostgREST 400 in delivery container logs
    Tool: Bash (grep)
    Preconditions: Validation run completed
    Steps:
      1. grep "400" /tmp/employee-delivery-<task_id_prefix>.log
      2. Assert no HTTP 400 errors related to task_status_log
    Expected Result: No 400 errors in delivery logs
    Failure Indicators: Any "400" or "constraint" errors in the log
    Evidence: .sisyphus/evidence/task-5-no-400-errors.txt
  ```

  **Commit**: NO (Docker rebuild is not committed)

- [x] 6. Validate with 10 consecutive successful runs

  **What to do**:
  - Trigger `daily-real-estate-inspiration-2` 10 times sequentially (wait for each to complete before starting the next)
  - For EACH run, verify:
    1. Task reaches `Done` status (not `Failed`)
    2. `task_status_log` has clean `Delivering→Done` entry with `actor='machine'`
    3. `deliverables.content` JSON has a non-empty `draft` field with actual inspirational content
    4. Exactly ONE message posted per run (no double-posting)
    5. The posted Slack message contains actual inspirational content (quotes, insights), not a meta-description
  - If ANY run fails, stop, diagnose, fix the issue, Docker rebuild, and restart the count from 0
  - After 10 consecutive successes, record all task IDs and results
  - Final verification query:
    ```sql
    SELECT id, status, failure_reason, created_at
    FROM tasks
    WHERE archetype_id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f'
    ORDER BY created_at DESC LIMIT 10;
    ```
    ALL 10 must show `status='Done'`, `failure_reason=NULL`

  **Must NOT do**:
  - DO NOT count a failed run — reset counter to 0
  - DO NOT skip verification steps for any run
  - DO NOT run tasks in parallel — run sequentially to avoid interference

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Long-running iterative process with potential debugging loops, requires patience and systematic verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5

  **References**:

  **Command References**:
  - Trigger command (repeat 10 times):
    ```bash
    source .env
    curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-real-estate-inspiration-2/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq '.task_id'
    ```
  - Status check: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT status FROM tasks WHERE id='<task_id>';"`
  - Content check: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT content FROM deliverables WHERE external_ref='<task_id>';"`
  - Log check: `grep -c "post-message" /tmp/employee-delivery-<prefix>.log`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 10 consecutive successful runs
    Tool: Bash (curl + psql)
    Preconditions: Task 5 passed, services running, Docker image rebuilt
    Steps:
      1. For i in 1..10:
         a. Trigger the employee, capture task_id
         b. Poll until status != 'Executing' (max 5 min)
         c. Assert status = 'Done'
         d. Query task_status_log: assert Delivering→Done with actor='machine'
         e. Query deliverables: assert draft field non-empty with actual content
         f. Check delivery log: assert exactly 1 post-message call
         g. Record task_id and result
      2. Final query: SELECT id, status, failure_reason FROM tasks WHERE archetype_id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f' ORDER BY created_at DESC LIMIT 10;
      3. Assert all 10 have status='Done', failure_reason=NULL
    Expected Result: 10/10 runs successful with correct content and no double-posts
    Failure Indicators: Any run with status='Failed'; any draft containing meta-description; any run with 2+ Slack messages
    Evidence: .sisyphus/evidence/task-6-ten-runs-validation.txt

  Scenario: Verify no duplicate Delivering entries in task_status_log
    Tool: Bash (psql)
    Preconditions: 10 runs completed
    Steps:
      1. For each of the 10 task_ids:
         SELECT count(*) FROM task_status_log WHERE task_id='<id>' AND to_status='Delivering';
      2. Assert each count = 1 (not 2+)
    Expected Result: Each task has exactly 1 Delivering entry
    Failure Indicators: Any task with 2+ Delivering entries (would indicate retry)
    Evidence: .sisyphus/evidence/task-6-no-duplicate-delivering.txt
  ```

  **Commit**: NO (validation only — no code changes)

- [x] 7. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ fix-inspiration-delivery plan complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 6

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Trigger `daily-real-estate-inspiration-2` once. Verify: (1) task reaches Done, (2) `task_status_log` has Delivering→Done entry with `actor='machine'`, (3) deliverables.content JSON has non-empty `draft` field, (4) Slack channel has ONE message with actual inspirational content. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Tasks      | Message                                                                               | Files                                                                    |
| ------ | ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1      | T1         | `fix(harness): correct task_status_log POST calls with proper actor and updated_at`   | `src/workers/opencode-harness.mts`                                       |
| 2      | T2, T3, T4 | `fix(archetype): update inspiration-2 instructions to use --draft for actual content` | `scripts/2026-05-25-update-archetype-delivery.sql` (+ DB update applied) |
| 3      | T6         | `docs(agents): update AGENTS.md if needed after validation`                           | AGENTS.md (if applicable)                                                |

---

## Success Criteria

### Verification Commands

```bash
# Verify task_status_log has correct entries for a given task
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT from_status, to_status, actor, created_at FROM task_status_log WHERE task_id='<TASK_ID>' ORDER BY created_at;"
# Expected: Delivering→Done row with actor='machine'

# Verify deliverables has real content
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT content FROM deliverables WHERE external_ref='<TASK_ID>';"
# Expected: JSON with non-empty 'draft' field containing actual inspirational content

# Verify 10 consecutive runs all Done
psql postgresql://postgres:postgres@localhost:54322/ai_employee \
  -c "SELECT id, status, failure_reason FROM tasks WHERE archetype_id='3b07ec63-207f-4f2b-a8c3-c17f08bc508f' ORDER BY created_at DESC LIMIT 10;"
# Expected: All 10 rows with status='Done', failure_reason=NULL
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] 10 consecutive runs all Done with correct content
- [x] No double-posting in any of the 10 runs
- [ ] `task_status_log` has clean Delivering→Done entries
