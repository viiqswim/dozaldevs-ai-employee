# GM-12: Unresponded Message Monitor — Full AI Employee Conversion

## TL;DR

> **Quick Summary**: Convert the existing lightweight `unresponded-message-alert.ts` cron trigger into a full AI employee with its own archetype, task lifecycle, and OpenCode session. The employee reads `pending_approvals` via PostgREST, evaluates quiet hours and urgency, and posts thread replies to stale approval cards. Remove the old inline trigger to avoid duplicate reminders.
>
> **Deliverables**:
>
> - New archetype `unresponded-message-monitor` seeded in `prisma/seed.ts` (VLRE only)
> - New cron trigger `src/inngest/triggers/monitor-trigger.ts` (every 30 min, uses `createTaskAndDispatch`)
> - System prompt + instructions in `prisma/prompts/unresponded-message-monitor.ts`
> - Removal of `src/inngest/triggers/unresponded-message-alert.ts` and its registration
> - Updated tests (remove old trigger tests, add new trigger + seed tests)
> - API endpoint verification via admin trigger
> - Story map GM-12 checkboxes marked complete
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (archetype + prompt) → Task 3 (trigger) → Task 5 (remove old) → Task 7 (verify) → Task 8 (story map)

---

## Context

### Original Request

Implement GM-12 (Unresponded Message Monitor) from the Phase 1 story map as a full AI employee with its own archetype and task lifecycle. The monitor detects guest messaging approval cards that PMs haven't acted on and posts reminder thread replies. Test thoroughly via automated tests and API endpoints. Mark GM-12 complete in the story map.

### Interview Summary

**Key Discussions**:

- **DB-based detection**: User suggested querying DB instead of scraping Slack — confirmed viable via `pending_approvals` table
- **Card scope**: Guest messaging cards only (not daily summary)
- **Tenant scope**: VLRE only
- **Approval gate**: `approval_required: false` — autonomous monitoring, no human review
- **PM tagging**: No specific @mention — post reminder to thread, channel members see it
- **Urgency**: Category field + keyword scan (urgency flag already on `pending_approvals`)
- **Existing code**: Discovered `unresponded-message-alert.ts` already does 90% of the work as a lightweight trigger — user chose to convert to full AI employee and remove the old trigger

**Research Findings**:

- `pending_approvals` table has all needed fields: `slack_ts`, `channel_id`, `guest_name`, `property_name`, `urgency`, `reminder_sent_at`, `created_at`
- `getStaleApprovals()` and `markReminderSent()` exist in `src/inngest/lib/pending-approvals.ts`
- Quiet hours config at `tenants.config.guest_messaging.quiet_hours` with `shouldSendReminder()` in `src/inngest/lib/quiet-hours.ts`
- `buildReminderBlocks()` in `src/inngest/lib/reminder-blocks.ts` — currently posts top-level messages, needs thread reply adaptation
- `post-message.ts` supports `--thread-ts` for thread replies

### Metis Review

**Identified Gaps** (addressed):

- `pending_approvals` should be the query source, not `tasks JOIN deliverables` — incorporated
- Existing `unresponded-message-alert.ts` already registered — must be removed to avoid duplicates
- `markReminderSent()` must be called only after confirmed Slack post success
- Quiet hours read from tenant config, not hardcoded
- UUID `...000000000014` is skipped — confirmed intentional, using `...000000000016`

---

## Work Objectives

### Core Objective

Replace the inline `unresponded-message-alert.ts` cron trigger with a full AI employee that runs every 30 minutes, queries `pending_approvals` for stale guest messaging approval cards, respects quiet hours and urgency, and posts reminder thread replies to the original Slack approval messages.

### Concrete Deliverables

- Archetype record in `prisma/seed.ts` with slug `unresponded-message-monitor`
- System prompt + instructions in `prisma/prompts/unresponded-message-monitor.ts`
- Cron trigger in `src/inngest/triggers/monitor-trigger.ts`
- Registration in `src/gateway/inngest/serve.ts`
- Removal of `src/inngest/triggers/unresponded-message-alert.ts` and its tests
- New test file `tests/inngest/triggers/monitor-trigger.test.ts`
- Seed test verification
- API endpoint verification

### Definition of Done

- [ ] `pnpm prisma db seed` runs without error
- [ ] `pnpm test -- --run` passes with no new failures
- [ ] Admin API trigger endpoint creates task and dispatches employee
- [ ] Employee lifecycle completes (Received → Done) without errors
- [ ] GM-12 checkboxes marked in story map

### Must Have

- Archetype with `approval_required: false` (no human review of reminders)
- Cron every 30 minutes (`*/30 * * * *`)
- Instructions tell employee to query `pending_approvals` via PostgREST
- Instructions tell employee to respect quiet hours from tenant config
- Instructions tell employee to post thread replies (not top-level messages) using `post-message.ts --thread-ts`
- Instructions tell employee to include guest name, property, elapsed time, and permalink in reminders
- Deduplication: only remind once per approval card (check `reminder_sent_at`)
- No-op completion when no stale approvals exist

### Must NOT Have (Guardrails)

- Do NOT create new DB tables, migrations, or Prisma models
- Do NOT modify `src/inngest/lib/pending-approvals.ts`
- Do NOT modify `src/inngest/lib/quiet-hours.ts`
- Do NOT modify `src/inngest/lib/reminder-blocks.ts`
- Do NOT modify existing approval card Block Kit format
- Do NOT modify `src/inngest/employee-lifecycle.ts`
- Do NOT PATCH `tasks.status` from within the monitor
- Do NOT add `approval_required: true` — this is autonomous
- Do NOT use any model other than `minimax/minimax-m2.7`
- Do NOT create a DozalDevs archetype (VLRE only)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest + `@inngest/test`)
- **Automated tests**: YES (Tests-after — not TDD since this is mostly config/seed work)
- **Framework**: Vitest

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Seed verification**: Use Bash (`pnpm prisma db seed`) — assert exit 0
- **Trigger tests**: Use Bash (`pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts`)
- **API verification**: Use Bash (curl) — hit admin trigger endpoint, assert 202, check task status
- **Full test suite**: Use Bash (`pnpm test -- --run`) — assert no new failures

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — all independent):
├── Task 1: Archetype seed + system prompt + instructions [unspecified-high]
├── Task 2: Remove old trigger + update serve.ts registration [quick]

Wave 2 (After Wave 1 — depends on removal + archetype):
├── Task 3: New cron trigger function [unspecified-high]
├── Task 4: Update/create tests [unspecified-high]

Wave 3 (After Wave 2 — integration + verification):
├── Task 5: Seed verification + full test suite [quick]
├── Task 6: API endpoint verification (trigger + lifecycle) [deep]
├── Task 7: Story map update [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| 1    | —          | 3, 4, 5, 6 | 1    |
| 2    | —          | 3, 4, 5    | 1    |
| 3    | 1, 2       | 5, 6       | 2    |
| 4    | 1, 2       | 5          | 2    |
| 5    | 1, 2, 3, 4 | 6, 7       | 3    |
| 6    | 3, 5       | 7          | 3    |
| 7    | 5, 6       | —          | 3    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `unspecified-high`, T2 → `quick`
- **Wave 2**: 2 tasks — T3 → `unspecified-high`, T4 → `unspecified-high`
- **Wave 3**: 3 tasks — T5 → `quick`, T6 → `deep`, T7 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Archetype Seed + System Prompt + Instructions

  **What to do**:
  - Create `prisma/prompts/unresponded-message-monitor.ts` with the system prompt and instructions as named exports
  - System prompt: Define the employee's persona — a diligent monitoring assistant that checks for unacted guest messaging approval cards and posts reminder thread replies. Keep it concise (not a novel). The prompt should tell the LLM it is a monitoring agent, its purpose is to detect stale approval cards and remind PMs, and it should never modify task status or approval state.
  - Instructions: The natural language instructions that tell the LLM exactly what to do each run. Must cover:
    1. Query PostgREST for `pending_approvals` where `tenant_id=eq.{TENANT_ID}` AND `reminder_sent_at=is.null` AND `created_at` older than threshold (`ALERT_THRESHOLD_MINUTES` env var, default 30). URL: `$SUPABASE_URL/rest/v1/pending_approvals?tenant_id=eq.$TENANT_ID&reminder_sent_at=is.null&created_at=lt.<cutoff_iso>&order=created_at.asc`
    2. If no results, write `/tmp/summary.txt` with "No stale approvals found. Nothing to do." and exit successfully.
    3. Read quiet hours config from `$SUPABASE_URL/rest/v1/tenants?id=eq.$TENANT_ID&select=config`. Extract `config.guest_messaging.quiet_hours` (fields: `start`, `end`, `timezone`). Default: `{ start: 1, end: 8, timezone: "America/Chicago" }`.
    4. For each stale approval: check if current time is within quiet hours. If yes AND `urgency` is `false`, skip (do not remind). If `urgency` is `true`, remind regardless of quiet hours.
    5. For each qualifying approval: post a thread reply using `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "<channel_id>" --thread-ts "<slack_ts>" --text "<reminder_text>"`. The reminder text must include: guest name, property name, elapsed time (e.g., "45 minutes"), and a Slack permalink to the original message (`https://slack.com/archives/<channel_id>/p<slack_ts_without_dot>`).
    6. After EACH successful Slack post, PATCH `pending_approvals` to set `reminder_sent_at`: `PATCH $SUPABASE_URL/rest/v1/pending_approvals?id=eq.<approval_id>` with body `{"reminder_sent_at": "<iso_timestamp>"}`. Only PATCH after confirmed post success.
    7. Write `/tmp/summary.txt` with a summary of what was done (e.g., "Sent 3 reminders for stale approval cards.").
  - Add the archetype upsert block in `prisma/seed.ts` after the `vlreGuestMessaging` block:
    - UUID: `00000000-0000-0000-0000-000000000016`
    - `role_name`: `unresponded-message-monitor`
    - `runtime`: `opencode`
    - `model`: `minimax/minimax-m2.7`
    - `deliverable_type`: `slack_message`
    - `tool_registry`: `{ tools: ['/tools/slack/post-message.ts'] }` (only needs to post thread replies)
    - `trigger_sources`: `{ type: 'cron', expression: '*/30 * * * *' }`
    - `risk_model`: `{ approval_required: false, timeout_hours: 1 }`
    - `notification_channel`: `null`
    - `concurrency_limit`: `1`
    - `agents_md`: `PLATFORM_AGENTS_MD`
    - `delivery_instructions`: `null` (no delivery phase — `approval_required: false` skips it)
    - `tenant_id`: `00000000-0000-0000-0000-000000000003` (VLRE)
    - `department_id`: `00000000-0000-0000-0000-000000000021` (VLRE department)
  - Follow the exact upsert pattern from `vlreGuestMessaging` — `(prisma.archetype as any).upsert`, `tenant_id` in `create` but NOT in `update`

  **Must NOT do**:
  - Do NOT use any model other than `minimax/minimax-m2.7`
  - Do NOT set `approval_required: true`
  - Do NOT create a DozalDevs archetype
  - Do NOT add new tools to `src/worker-tools/` — use existing `post-message.ts`
  - Do NOT modify existing prompt files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of archetype seeding patterns, system prompt design, and PostgREST query construction — multi-file, multi-concern work
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI work
    - `git-master`: Standard git, not complex history operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `prisma/seed.ts` (lines ~3200-3280) — `vlreGuestMessaging` upsert block — follow this exact pattern for the new archetype
  - `prisma/prompts/guest-messaging.ts` — example of externalizing system prompt to a dedicated file with named exports

  **API/Type References** (contracts to implement against):
  - `prisma/schema.prisma` (lines 199-231) — `Archetype` model with all field types and constraints
  - `src/inngest/lib/pending-approvals.ts` — `PendingApproval` interface (lines 1-12) — output schema from PostgREST queries the LLM will make
  - `src/inngest/lib/quiet-hours.ts` — `QuietHoursConfig` interface and `DEFAULT_QUIET_HOURS` — the LLM instructions must replicate this logic

  **External References**:
  - PostgREST filtering docs: `https://postgrest.org/en/stable/references/api/tables_views.html#horizontal-filtering`

  **WHY Each Reference Matters**:
  - `vlreGuestMessaging` block: Shows exact upsert structure, `(prisma.archetype as any)` cast, `tenant_id` only in create
  - `guest-messaging.ts`: Shows how to structure a separate prompt file with named exports
  - `PendingApproval` interface: The LLM instructions must tell the employee to parse this JSON shape from PostgREST responses
  - `QuietHoursConfig`: The LLM instructions must replicate the quiet hours check logic

  **Acceptance Criteria**:
  - [ ] File `prisma/prompts/unresponded-message-monitor.ts` exists with system prompt and instructions exports
  - [ ] `prisma/seed.ts` has upsert block for UUID `00000000-0000-0000-0000-000000000016`
  - [ ] `pnpm prisma db seed` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully with new archetype
    Tool: Bash
    Preconditions: Local Supabase running, ai_employee database exists
    Steps:
      1. Run `pnpm prisma db seed`
      2. Assert exit code 0
      3. Query PostgREST: `curl -s "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000016&select=role_name,model,runtime" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"`
      4. Assert response contains `"role_name":"unresponded-message-monitor"`, `"model":"minimax/minimax-m2.7"`, `"runtime":"opencode"`
    Expected Result: Seed completes, archetype row exists with correct values
    Failure Indicators: Non-zero exit code, missing archetype row, wrong field values
    Evidence: .sisyphus/evidence/task-1-seed-archetype.json

  Scenario: Seed is idempotent (second run succeeds)
    Tool: Bash
    Preconditions: Seed already ran once
    Steps:
      1. Run `pnpm prisma db seed` a second time
      2. Assert exit code 0
      3. Query count: `curl -s "http://localhost:54321/rest/v1/archetypes?role_name=eq.unresponded-message-monitor&tenant_id=eq.00000000-0000-0000-0000-000000000003&select=id" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -H "Prefer: count=exact"`
      4. Assert exactly 1 row (no duplicates)
    Expected Result: No errors on re-run, exactly 1 archetype row
    Failure Indicators: Unique constraint violation, duplicate rows
    Evidence: .sisyphus/evidence/task-1-seed-idempotent.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-seed-archetype.json — PostgREST response showing archetype row
  - [ ] task-1-seed-idempotent.txt — Second seed run output

  **Commit**: YES
  - Message: `feat(seed): add unresponded-message-monitor archetype for VLRE`
  - Files: `prisma/seed.ts`, `prisma/prompts/unresponded-message-monitor.ts`
  - Pre-commit: `pnpm prisma db seed`

- [x] 2. Remove Old Inline Trigger

  **What to do**:
  - Delete `src/inngest/triggers/unresponded-message-alert.ts`
  - Delete `tests/inngest/triggers/unresponded-message-alert.test.ts`
  - Update `src/gateway/inngest/serve.ts`: remove the import of `createUnrespondedMessageAlertTrigger` and remove `unrespondedAlertFn` from the `functions` array
  - Verify build succeeds after removal
  - Do NOT delete the supporting libraries (`pending-approvals.ts`, `quiet-hours.ts`, `reminder-blocks.ts`) — the new employee's instructions reference the same PostgREST query patterns, and these libs may be useful for other purposes

  **Must NOT do**:
  - Do NOT delete `src/inngest/lib/pending-approvals.ts`
  - Do NOT delete `src/inngest/lib/quiet-hours.ts`
  - Do NOT delete `src/inngest/lib/reminder-blocks.ts`
  - Do NOT modify any other trigger files
  - Do NOT modify the employee lifecycle

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file deletion + import removal — straightforward, low-risk
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts` — find the `createUnrespondedMessageAlertTrigger` import and `unrespondedAlertFn` variable in the functions array

  **WHY Each Reference Matters**:
  - `serve.ts`: Must cleanly remove the import and array entry without breaking other function registrations

  **Acceptance Criteria**:
  - [ ] `src/inngest/triggers/unresponded-message-alert.ts` does not exist
  - [ ] `tests/inngest/triggers/unresponded-message-alert.test.ts` does not exist
  - [ ] `src/gateway/inngest/serve.ts` has no reference to `unrespondedMessageAlert` or `UnrespondedMessageAlert`
  - [ ] `pnpm build` exits 0 (no broken imports)
  - [ ] `src/inngest/lib/pending-approvals.ts` still exists (NOT deleted)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds after trigger removal
    Tool: Bash
    Preconditions: Old trigger files deleted, serve.ts updated
    Steps:
      1. Run `pnpm build`
      2. Assert exit code 0
      3. Run `grep -r "unresponded-message-alert" src/ --include="*.ts"`
      4. Assert zero matches (no stale references)
    Expected Result: Clean build, no references to old trigger
    Failure Indicators: Build errors from broken imports, stale references in other files
    Evidence: .sisyphus/evidence/task-2-build-clean.txt

  Scenario: Supporting libraries still exist
    Tool: Bash
    Preconditions: Trigger removed
    Steps:
      1. Verify `ls src/inngest/lib/pending-approvals.ts` exists
      2. Verify `ls src/inngest/lib/quiet-hours.ts` exists
      3. Verify `ls src/inngest/lib/reminder-blocks.ts` exists
    Expected Result: All three library files still present
    Failure Indicators: Any of the three files missing
    Evidence: .sisyphus/evidence/task-2-libs-preserved.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-build-clean.txt — Build output showing success
  - [ ] task-2-libs-preserved.txt — ls output confirming library files exist

  **Commit**: YES
  - Message: `refactor(triggers): remove inline unresponded-message-alert trigger`
  - Files: `src/inngest/triggers/unresponded-message-alert.ts` (deleted), `src/gateway/inngest/serve.ts`, `tests/inngest/triggers/unresponded-message-alert.test.ts` (deleted)
  - Pre-commit: `pnpm build`

- [x] 3. New Cron Trigger Function

  **What to do**:
  - Create `src/inngest/triggers/monitor-trigger.ts` following the `summarizer-trigger.ts` pattern exactly
  - Factory function: `createMonitorTrigger(inngest: Inngest): InngestFunction.Any`
  - Inngest function config: `{ id: 'trigger/unresponded-message-monitor', triggers: [{ cron: '*/30 * * * *' }] }`
  - Step 1 (`discover-archetypes`): Query PostgREST for `archetypes?role_name=eq.unresponded-message-monitor&select=id,tenant_id`
  - Step 2: For each archetype, call `createTaskAndDispatch({ inngest, step, tenantId, archetypeSlug: 'unresponded-message-monitor', externalId: \`monitor-${tenantId}-${slotKey}\`, sourceSystem: 'cron' })`
  - The `slotKey` should be a 30-minute time slot: `Math.floor(Date.now() / (30 * 60 * 1000))` — this ensures deduplication within the same 30-minute window
  - Register in `src/gateway/inngest/serve.ts`: import `createMonitorTrigger`, instantiate as `const monitorTriggerFn = createMonitorTrigger(inngest)`, add to the functions array

  **Must NOT do**:
  - Do NOT inline the detection/reminder logic in the trigger — the trigger only creates tasks; the AI employee (via OpenCode + instructions) does the actual work
  - Do NOT modify `createTaskAndDispatch`
  - Do NOT use `step.run` for anything beyond archetype discovery — the employee lifecycle handles everything else

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of Inngest trigger patterns, PostgREST queries, and serve.ts registration — must match existing conventions exactly
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/inngest/triggers/summarizer-trigger.ts` — canonical trigger pattern: factory function, `discover-archetypes` step, `createTaskAndDispatch` loop
  - `src/inngest/triggers/guest-message-poller.ts` — alternative trigger pattern showing per-tenant config lookup

  **API/Type References**:
  - `src/inngest/lib/create-task-and-dispatch.ts` — `CreateTaskAndDispatchParams` interface: `inngest`, `step`, `tenantId`, `archetypeSlug`, `externalId`, `sourceSystem`
  - `src/gateway/inngest/serve.ts` — registration pattern: import factory, instantiate, add to functions array

  **WHY Each Reference Matters**:
  - `summarizer-trigger.ts`: The simplest and most canonical trigger — copy its structure verbatim
  - `create-task-and-dispatch.ts`: Must call with correct parameter names; `tenantId` is required (the old tests had bugs missing it)
  - `serve.ts`: Must add import + instantiation + array entry in the correct locations

  **Acceptance Criteria**:
  - [ ] File `src/inngest/triggers/monitor-trigger.ts` exists
  - [ ] Exports `createMonitorTrigger` factory function
  - [ ] Cron expression is `*/30 * * * *`
  - [ ] Uses `createTaskAndDispatch` (not inline logic)
  - [ ] Registered in `serve.ts`
  - [ ] `pnpm build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Trigger file compiles and exports correctly
    Tool: Bash
    Preconditions: Task 2 completed (old trigger removed), file created
    Steps:
      1. Run `pnpm build`
      2. Assert exit code 0
      3. Run `grep "createMonitorTrigger" src/gateway/inngest/serve.ts`
      4. Assert match found (registered)
      5. Run `grep "*/30 * * * *" src/inngest/triggers/monitor-trigger.ts`
      6. Assert match found (correct cron)
    Expected Result: File compiles, is registered, has correct cron expression
    Failure Indicators: Build failure, missing registration, wrong cron
    Evidence: .sisyphus/evidence/task-3-trigger-build.txt

  Scenario: Trigger does NOT inline detection logic
    Tool: Bash
    Preconditions: Trigger file exists
    Steps:
      1. Run `grep -c "pending_approvals" src/inngest/triggers/monitor-trigger.ts`
      2. Assert count is 0 (no direct DB queries)
      3. Run `grep -c "createTaskAndDispatch" src/inngest/triggers/monitor-trigger.ts`
      4. Assert count is >= 1 (uses proper dispatch)
    Expected Result: Trigger only discovers archetypes and dispatches — no inline work
    Failure Indicators: Direct PostgREST queries to pending_approvals in the trigger
    Evidence: .sisyphus/evidence/task-3-trigger-no-inline.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-trigger-build.txt — Build output + grep results
  - [ ] task-3-trigger-no-inline.txt — Verification that trigger doesn't inline logic

  **Commit**: YES
  - Message: `feat(triggers): add monitor-trigger cron for unresponded-message-monitor`
  - Files: `src/inngest/triggers/monitor-trigger.ts`, `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Tests for New Trigger + Seed

  **What to do**:
  - Create `tests/inngest/triggers/monitor-trigger.test.ts` following the Pattern B (pure mock) approach from the old `unresponded-message-alert.test.ts`
  - Test cases to cover:
    1. **Discovers archetypes**: Mock PostgREST response with one archetype → verify `createTaskAndDispatch` called with correct args (`archetypeSlug: 'unresponded-message-monitor'`, `sourceSystem: 'cron'`, correct `tenantId`)
    2. **No archetypes found**: Mock empty PostgREST response → verify `createTaskAndDispatch` NOT called, function returns cleanly
    3. **Multiple tenants**: Mock PostgREST returning 2 archetypes → verify `createTaskAndDispatch` called twice with correct tenant IDs
    4. **External ID deduplication format**: Verify `externalId` includes tenant ID and time slot key
    5. **Cron expression is correct**: Extract function config from `mockInngest.createFunction.mock.calls[0][0]` → assert `triggers[0].cron === '*/30 * * * *'`
    6. **Function ID is correct**: Assert `id === 'trigger/unresponded-message-monitor'`
  - Use `vi.hoisted()` for mocks, `vi.mock()` for module replacement, `vi.stubGlobal('fetch', ...)` for PostgREST calls
  - Add a seed test (can be in a separate describe block or file) that verifies the archetype exists after seeding:
    - Import Prisma, query for the archetype by UUID
    - Assert `role_name`, `model`, `runtime`, `risk_model` values

  **Must NOT do**:
  - Do NOT write integration tests that require a running Inngest server
  - Do NOT test the employee's actual behavior (that's the OpenCode session's job, not the trigger's)
  - Do NOT use real DB calls in trigger tests — pure mock only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test writing requires understanding of the mock patterns, Inngest test utilities, and the trigger's expected behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `tests/inngest/triggers/unresponded-message-alert.test.ts` — the DELETED file, but its patterns should be referenced from git history or from `tests/inngest/triggers/summarizer-trigger.test.ts` as a fallback
  - `tests/inngest/triggers/summarizer-trigger.test.ts` — alternative trigger test pattern: mock `createFunction`, extract handler, call with mock step
  - `tests/inngest/triggers/feedback-summarizer-injection.test.ts` — more complete mock pattern with `vi.hoisted()` + `vi.mock()` + URL-based fetch mock

  **API/Type References**:
  - `src/inngest/lib/create-task-and-dispatch.ts` — `CreateTaskAndDispatchParams` — assert calls match this interface
  - `src/inngest/triggers/monitor-trigger.ts` — the file being tested (from Task 3)

  **WHY Each Reference Matters**:
  - `summarizer-trigger.test.ts`: Simplest trigger test — shows the mock `createFunction` → extract handler → call pattern
  - `feedback-summarizer-injection.test.ts`: Most complete mock setup with `vi.hoisted()`
  - `CreateTaskAndDispatchParams`: Must assert the trigger passes correct params

  **Acceptance Criteria**:
  - [ ] File `tests/inngest/triggers/monitor-trigger.test.ts` exists
  - [ ] At least 6 test cases covering the scenarios listed above
  - [ ] `pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts` passes
  - [ ] All tests use pure mock pattern (no real DB, no real Inngest)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All trigger tests pass
    Tool: Bash
    Preconditions: Test file created, trigger file exists
    Steps:
      1. Run `pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts`
      2. Assert exit code 0
      3. Assert output shows 6+ tests passing
    Expected Result: All tests pass, no failures
    Failure Indicators: Non-zero exit code, any test failures
    Evidence: .sisyphus/evidence/task-4-trigger-tests.txt

  Scenario: No tests reference deleted files
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Run `grep -r "unresponded-message-alert" tests/ --include="*.ts"`
      2. Assert zero matches (no imports of deleted trigger)
    Expected Result: No stale references to old trigger
    Failure Indicators: Import or reference to deleted trigger file
    Evidence: .sisyphus/evidence/task-4-no-stale-refs.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-trigger-tests.txt — Test run output
  - [ ] task-4-no-stale-refs.txt — Grep results confirming no stale references

  **Commit**: YES
  - Message: `test(triggers): add monitor-trigger tests and remove old alert tests`
  - Files: `tests/inngest/triggers/monitor-trigger.test.ts`
  - Pre-commit: `pnpm test -- --run tests/inngest/triggers/monitor-trigger.test.ts`

- [x] 5. Full Test Suite + Seed Verification

  **What to do**:
  - Run `pnpm prisma db seed` — assert exit 0
  - Run `pnpm test -- --run` — assert all tests pass with no new failures
  - Run `pnpm build` — assert exit 0
  - Run `pnpm lint` — assert no new lint errors in changed files
  - If any failures, diagnose and fix. Common issues:
    - Import path mismatches (`.js` extension required in imports)
    - Missing `vi.hoisted()` declarations
    - Serve.ts function count mismatches in stale tests (check `inngest-serve.test.ts` — this is a known pre-existing failure, do NOT fix)

  **Must NOT do**:
  - Do NOT fix pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running existing commands and checking output — no creative work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — must pass before API verification)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - `AGENTS.md` § Pre-existing Test Failures — list of known failures to ignore

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` exits 0
  - [ ] `pnpm test -- --run` passes (no new failures)
  - [ ] `pnpm build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `pnpm prisma db seed`
      2. Assert exit code 0
      3. Run `pnpm test -- --run`
      4. Assert exit code 0 (or only pre-existing failures)
      5. Run `pnpm build`
      6. Assert exit code 0
    Expected Result: All commands succeed, no new failures
    Failure Indicators: New test failures, build errors, seed errors
    Evidence: .sisyphus/evidence/task-5-full-suite.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-full-suite.txt — Combined output of seed, test, build

  **Commit**: NO (verification only)

- [x] 6. API Endpoint Verification

  **What to do**:
  - Start local services if not running (`pnpm dev:start` in tmux)
  - Trigger the new employee via admin API:
    ```bash
    TENANT=00000000-0000-0000-0000-000000000003
    curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/$TENANT/employees/unresponded-message-monitor/trigger" \
      -H "Content-Type: application/json" -d '{}'
    ```
  - Assert 202 response with `task_id` and `status_url`
  - Check task status via status URL — verify it transitions through lifecycle states
  - The task should complete as `Done` (since `approval_required: false`)
  - If no stale approvals exist, the employee should write "No stale approvals found" to `/tmp/summary.txt` and complete normally
  - Verify the task reaches `Done` status (not `Failed`)

  **Must NOT do**:
  - Do NOT trigger the employee in production
  - Do NOT modify any Fly.io configuration
  - This is LOCAL verification only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires starting services, making API calls, monitoring lifecycle state transitions, and diagnosing any failures in the execution chain
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 5

  **References**:

  **Pattern References**:
  - `AGENTS.md` § Admin API — trigger endpoint format and auth header
  - `AGENTS.md` § Commands — `pnpm dev:start` for starting services

  **API/Type References**:
  - `POST /admin/tenants/:tenantId/employees/:slug/trigger` — returns `{ task_id, status_url }`
  - `GET /admin/tenants/:tenantId/tasks/:id` — returns task with `status` field

  **Acceptance Criteria**:
  - [ ] Admin trigger returns 202 with `task_id`
  - [ ] Task reaches `Done` status (not `Failed`)
  - [ ] No errors in gateway or Inngest logs related to the monitor

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Admin trigger creates and completes task
    Tool: Bash
    Preconditions: Local services running (gateway + Inngest), archetype seeded
    Steps:
      1. Trigger: `curl -s -w "\n%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/unresponded-message-monitor/trigger" -d '{}'`
      2. Assert HTTP 202
      3. Extract `task_id` from response body
      4. Poll status every 15s for up to 5 minutes: `curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID"`
      5. Assert task reaches `Done` status
    Expected Result: Task created, lifecycle completes, status is Done
    Failure Indicators: HTTP 404/500 on trigger, task stuck in Executing, task reaches Failed
    Evidence: .sisyphus/evidence/task-6-api-trigger.json

  Scenario: Dry run succeeds
    Tool: Bash
    Preconditions: Local services running
    Steps:
      1. Dry run: `curl -s -w "\n%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/unresponded-message-monitor/trigger?dry_run=true" -d '{}'`
      2. Assert HTTP 200 (dry run returns 200, not 202)
      3. Assert response includes archetype information
    Expected Result: Dry run validates archetype exists without creating a task
    Failure Indicators: HTTP 404 (archetype not found), HTTP 500
    Evidence: .sisyphus/evidence/task-6-dry-run.json
  ```

  **Evidence to Capture:**
  - [ ] task-6-api-trigger.json — Trigger response + final task status
  - [ ] task-6-dry-run.json — Dry run response

  **Commit**: NO (verification only)

- [x] 7. Story Map Update

  **What to do**:
  - Open `docs/planning/2026-04-21-2202-phase1-story-map.md`
  - Find the GM-12 section (search for `#### GM-12`)
  - Mark all acceptance criteria checkboxes as complete: change `- [ ]` to `- [x]` for each AC item
  - Do NOT modify any other section of the story map

  **Must NOT do**:
  - Do NOT change any other story's checkboxes
  - Do NOT reword acceptance criteria
  - Do NOT change section headings or numbering

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple checkbox updates in a markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Tasks 5, 6)
  - **Blocks**: None
  - **Blocked By**: Tasks 5, 6

  **References**:

  **Pattern References**:
  - `docs/planning/2026-04-21-2202-phase1-story-map.md` — search for `#### GM-12: Unresponded Message Monitor`

  **Acceptance Criteria**:
  - [ ] All GM-12 checkboxes in story map changed from `- [ ]` to `- [x]`
  - [ ] No other sections modified

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All GM-12 checkboxes marked
    Tool: Bash
    Preconditions: Story map file exists
    Steps:
      1. Count unchecked boxes in GM-12 section: search between "#### GM-12" and the next "####" heading for `- [ ]`
      2. Assert count is 0
      3. Count checked boxes in same range
      4. Assert count equals the original number of ACs (12)
    Expected Result: All 12 GM-12 acceptance criteria marked as complete
    Failure Indicators: Any unchecked boxes remaining, wrong section modified
    Evidence: .sisyphus/evidence/task-7-story-map-update.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-story-map-update.txt — Grep showing all boxes checked

  **Commit**: YES
  - Message: `docs(story-map): mark GM-12 acceptance criteria complete`
  - Files: `docs/planning/2026-04-21-2202-phase1-story-map.md`

- [x] 8. Notify completion

  Send Telegram notification: plan `gm12-unresponded-message-monitor` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ gm12-unresponded-message-monitor complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                             | Files                                                                                                                                                               | Pre-commit            |
| ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1    | `feat(seed): add unresponded-message-monitor archetype for VLRE`           | `prisma/seed.ts`, `prisma/prompts/unresponded-message-monitor.ts`                                                                                                   | `pnpm prisma db seed` |
| 1    | `refactor(triggers): remove inline unresponded-message-alert trigger`      | `src/inngest/triggers/unresponded-message-alert.ts` (deleted), `src/gateway/inngest/serve.ts`, `tests/inngest/triggers/unresponded-message-alert.test.ts` (deleted) | `pnpm build`          |
| 2    | `feat(triggers): add monitor-trigger cron for unresponded-message-monitor` | `src/inngest/triggers/monitor-trigger.ts`, `src/gateway/inngest/serve.ts`                                                                                           | `pnpm build`          |
| 2    | `test(triggers): add monitor-trigger tests`                                | `tests/inngest/triggers/monitor-trigger.test.ts`                                                                                                                    | `pnpm test -- --run`  |
| 3    | `docs(story-map): mark GM-12 acceptance criteria complete`                 | `docs/planning/2026-04-21-2202-phase1-story-map.md`                                                                                                                 | —                     |

---

## Success Criteria

### Verification Commands

```bash
pnpm prisma db seed              # Expected: exit 0, no errors
pnpm test -- --run               # Expected: all tests pass, no new failures
pnpm build                       # Expected: exit 0
```

### Final Checklist

- [ ] Archetype `unresponded-message-monitor` exists in seed with correct UUID, model, and config
- [ ] Old `unresponded-message-alert.ts` trigger removed from codebase and serve.ts
- [ ] New `monitor-trigger.ts` registered in serve.ts
- [ ] Cron expression is `*/30 * * * *`
- [ ] System prompt and instructions are comprehensive and self-contained
- [ ] All tests pass
- [ ] GM-12 marked complete in story map
