# Jira Daily Digest Employee

## TL;DR

> **Quick Summary**: Enhance the Jira `search-issues` tool with a `--fields` flag, then create a new AI employee for DozalDevs that queries Jira for all issues updated in the last 24 hours, groups them by assignee, and auto-posts a high-level digest to Slack.
>
> **Deliverables**:
>
> - Enhanced `search-issues.ts` with `--fields` flag for dynamic field selection
> - Updated mock fixture and `--help` output for the enhanced tool
> - New "jira-daily-digest" employee created via the wizard for DozalDevs tenant
> - Employee activated, model overridden, and verified end-to-end
> - Employee operational doc at `docs/employees/`
> - AGENTS.md updated with new employee reference
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (tool enhancement) → Task 3 (wizard creation) → Task 4 (activation + E2E) → Task 5 (docs)

---

## Context

### Original Request

Create an AI employee for the DozalDevs tenant (`00000000-0000-0000-0000-000000000002`) that goes to Jira every day, summarizes activity by person through the last 24 hours, and posts an update to Slack.

### Interview Summary

**Key Discussions**:

- **Wizard vs manual**: Use the "Create Employee" wizard — it handles ~80% of the config automatically
- **Jira scope**: Query ALL projects (not scoped to one), group by assignee
- **Summary depth**: High-level overview (counts per person, not detailed issue listings)
- **Approval**: No approval gate — auto-post directly
- **Trigger**: Manual for now (no cron setup)
- **Jira auth**: Already connected via OAuth — no secret provisioning
- **Tool gap**: `search-issues.ts` only returns 5 fields; need `--fields` flag for `updated`, `reporter`, etc.

**Research Findings**:

- 4 Jira CLI tools exist: `search-issues`, `get-issue`, `list-comments`, `add-comment`
- `search-issues.ts --jql` is a full JQL passthrough — `updated >= -1d` works natively
- Existing `jira-motivation-bot` on VLRE tenant proves Jira tools work E2E
- Wizard auto-discovers tools from the live catalog and injects into `tool_registry`
- The wizard's `notification_channel` field is NOT set automatically — must be set post-wizard via DB

### Metis Review

**Identified Gaps** (addressed):

- `notification_channel` defaults to `null` after wizard save — plan includes explicit DB update to `C0B7YDQBJPJ`
- Mock fixture must be updated with new fields to support `JIRA_MOCK=true` testing
- `--fields` flag must handle unknown/invalid field names gracefully (error message, not crash)
- No existing tests for Jira tools — plan includes tests for the `--fields` enhancement

---

## Work Objectives

### Core Objective

Deliver a working Jira daily digest employee that auto-posts assignee-grouped summaries to Slack, with an enhanced search tool that supports dynamic field selection.

### Concrete Deliverables

- `src/worker-tools/jira/search-issues.ts` — enhanced with `--fields` flag
- `src/worker-tools/jira/fixtures/search-issues/default.json` — updated with new fields
- New archetype row in DB for `jira-daily-digest` (DozalDevs tenant)
- Employee operational doc at `docs/employees/YYYY-MM-DD-HHMM-jira-daily-digest.md`
- Updated AGENTS.md Reference Documents table

### Definition of Done

- [ ] `search-issues.ts --fields updated,reporter --jql "updated >= -1d"` returns issues with those fields
- [ ] Employee `jira-daily-digest` exists in DB with `status: 'active'`, tenant `00000000-0000-0000-0000-000000000002`
- [ ] Triggering the employee produces a Slack message in `#dozal-jira-summaries` (`C0B7YDQBJPJ`)
- [ ] Employee doc exists and is referenced in AGENTS.md

### Must Have

- `--fields` flag on `search-issues.ts` that accepts a comma-separated list of Jira field names
- Dynamic field inclusion in both the API request and the output JSON
- Employee auto-posts to Slack without approval gate
- Employee groups output by assignee with high-level counts
- `notification_channel` set to `C0B7YDQBJPJ` on the archetype

### Must NOT Have (Guardrails)

- Do NOT add cron/scheduled trigger infrastructure — manual trigger only
- Do NOT create or modify Jira tenant secrets — OAuth is already connected
- Do NOT build a changelog/activity history tool — out of scope
- Do NOT add detailed issue-by-issue listings — high-level overview only
- Do NOT modify shared lifecycle files with employee-specific language
- Do NOT hardcode forbidden models (`anthropic/claude-sonnet-*`, `openai/gpt-4o`, etc.)
- Do NOT add `Co-authored-by` lines or AI tool references in commit messages

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest via `pnpm test`)
- **Automated tests**: YES (tests-after) — add unit tests for the `--fields` flag parsing and output mapping
- **Framework**: Vitest (`pnpm test`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool (search-issues)**: Use Bash — run the tool with `JIRA_MOCK=true`, parse JSON output, assert fields present
- **Employee creation**: Use Bash (curl) — verify archetype row via PostgREST and admin API
- **E2E verification**: Use Bash (curl) — trigger employee, poll task status, verify Slack message posted

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — tool enhancement + tests):
├── Task 1: Enhance search-issues.ts with --fields flag [deep]
├── Task 2: Add unit tests for search-issues --fields [quick]

Wave 2 (After Wave 1 — employee creation + verification):
├── Task 3: Create jira-daily-digest employee via wizard [unspecified-high]
├── Task 4: Activate, configure, and E2E verify [deep]
├── Task 5: Create employee doc + update AGENTS.md [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
→ Task 6: Notify completion via Telegram

Critical Path: Task 1 → Task 3 → Task 4 → F1-F4 → user okay → Task 6
Parallel Speedup: Tasks 1+2 in parallel, Tasks 3+4+5 partially parallel
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task  | Depends On | Blocks  | Wave  |
| ----- | ---------- | ------- | ----- |
| 1     | —          | 2, 3, 4 | 1     |
| 2     | 1          | —       | 1     |
| 3     | 1          | 4       | 2     |
| 4     | 3          | F1-F4   | 2     |
| 5     | 1          | F1-F4   | 2     |
| F1-F4 | 4, 5       | 6       | FINAL |
| 6     | F1-F4      | —       | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `deep`, T2 → `quick`
- **Wave 2**: **3 tasks** — T3 → `unspecified-high`, T4 → `deep`, T5 → `writing`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Enhance `search-issues.ts` with `--fields` flag

  **What to do**:
  - Add a `--fields <field1,field2,...>` CLI flag to `src/worker-tools/jira/search-issues.ts` that accepts a comma-separated list of Jira field names
  - When `--fields` is provided, append those field names to the hardcoded `fields` array (`['summary', 'status', 'priority', 'assignee']`) in the API request body (line 108)
  - In the output mapping (lines 134-139), dynamically include any extra fields from the API response in each issue object. The base 5 fields (`key`, `summary`, `status`, `priority`, `assignee`) remain mapped as they are today. Extra fields should be included as-is from the raw Jira response (flattened — e.g., `"updated": "2026-05-28T14:30:00.000+0000"`, `"reporter": "Alice Johnson"` extracting `displayName` like assignee does)
  - Update the `IssueSearchItem` type to include `[key: string]: unknown` for extra fields, or create an extended type
  - Update the `--help` output to document the new flag
  - Update the mock fixture at `src/worker-tools/jira/fixtures/search-issues/default.json` to include `updated`, `reporter`, and `created` fields on each issue
  - Handle the mock path: when `JIRA_MOCK=true` and `--fields` is provided, the fixture should still return valid data (the fixture just has extra fields statically — no dynamic filtering needed for mocks)

  **Must NOT do**:
  - Do NOT change the default output shape when `--fields` is not provided — backward compatibility is critical
  - Do NOT add pagination (`--start-at` flag) — out of scope
  - Do NOT modify other Jira tools (`get-issue.ts`, `list-comments.ts`, `add-comment.ts`)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying a shell tool CLI with backward-compatible output changes requires careful handling of types, mapping logic, and edge cases
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Covers file structure, CLI pattern, TypeScript conventions, and mock fixture support for worker tools

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2's test file creation — but Task 2 depends on Task 1 completing first)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/worker-tools/jira/search-issues.ts` — The entire file (151 lines). Lines 15-48: `parseArgs()` for flag parsing pattern. Lines 106-111: API request body where `fields` array is hardcoded. Lines 119-131: raw Jira API response type. Lines 133-143: output mapping logic. Lines 1-7: `IssueSearchItem` type to extend.
  - `src/worker-tools/jira/get-issue.ts` — Lines showing how `assignee` and `reporter` display names are extracted from Jira's nested `{ displayName: string }` shape. Use the same pattern for `reporter` in search results.

  **API/Type References**:
  - Jira REST API `/rest/api/3/search/jql` — the `fields` parameter accepts an array of field names. Common fields: `summary`, `status`, `priority`, `assignee`, `updated`, `created`, `reporter`, `labels`, `components`, `sprint`, `resolution`
  - Jira field response shapes: `status` → `{ name: string }`, `priority` → `{ name: string }`, `assignee`/`reporter` → `{ displayName: string } | null`, `updated`/`created` → ISO 8601 string, `labels` → `string[]`

  **External References**:
  - Jira Cloud REST API search endpoint: `https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/`

  **WHY Each Reference Matters**:
  - `search-issues.ts` is the only file being modified — understand its full structure before changing
  - `get-issue.ts` shows the `displayName` extraction pattern already used in this codebase for Jira person fields
  - The Jira API docs confirm which fields exist and their response shapes

  **Acceptance Criteria**:
  - [ ] `--fields` flag added to `parseArgs()` and documented in `--help`
  - [ ] API request includes extra fields when `--fields` is provided
  - [ ] Output includes extra fields with correct extraction (displayName for person fields, raw for strings/dates)
  - [ ] Default output (no `--fields`) is identical to current behavior — zero breaking changes
  - [ ] Mock fixture updated with `updated`, `reporter`, `created` fields

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Default output unchanged (backward compatibility)
    Tool: Bash
    Preconditions: JIRA_MOCK=true
    Steps:
      1. Run: JIRA_MOCK=true tsx src/worker-tools/jira/search-issues.ts --project TEST
      2. Parse JSON output
      3. Assert each issue has exactly: key, summary, status, priority, assignee
      4. Assert no extra fields present (updated, reporter, created should NOT appear)
    Expected Result: Output shape identical to current — 5 fields per issue
    Failure Indicators: Extra fields appear in output when --fields not provided
    Evidence: .sisyphus/evidence/task-1-default-output.json

  Scenario: --fields adds requested fields to output
    Tool: Bash
    Preconditions: JIRA_MOCK=true
    Steps:
      1. Run: JIRA_MOCK=true tsx src/worker-tools/jira/search-issues.ts --project TEST --fields updated,reporter
      2. Parse JSON output
      3. Assert each issue has: key, summary, status, priority, assignee, updated, reporter
      4. Assert updated is an ISO 8601 string
      5. Assert reporter is a string (display name) or null
    Expected Result: 7 fields per issue including the 2 requested extra fields
    Failure Indicators: Missing fields, wrong types, or crash
    Evidence: .sisyphus/evidence/task-1-fields-output.json

  Scenario: --fields with --jql works together
    Tool: Bash
    Preconditions: JIRA_MOCK=true
    Steps:
      1. Run: JIRA_MOCK=true tsx src/worker-tools/jira/search-issues.ts --jql "updated >= -1d" --fields updated,reporter,created
      2. Parse JSON output
      3. Assert issues array is non-empty
      4. Assert each issue has: key, summary, status, priority, assignee, updated, reporter, created
    Expected Result: JQL and --fields work together without conflict
    Failure Indicators: Error about missing --project, or fields not appearing
    Evidence: .sisyphus/evidence/task-1-jql-fields-output.json

  Scenario: --help shows --fields documentation
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: tsx src/worker-tools/jira/search-issues.ts --help
      2. Assert output contains "--fields" and "comma-separated"
    Expected Result: Help text documents the --fields flag with usage example
    Failure Indicators: --fields not mentioned in help output
    Evidence: .sisyphus/evidence/task-1-help-output.txt
  ```

  **Commit**: YES
  - Message: `feat(jira): add --fields flag to search-issues for dynamic field selection`
  - Files: `src/worker-tools/jira/search-issues.ts`, `src/worker-tools/jira/fixtures/search-issues/default.json`
  - Pre-commit: `pnpm test -- --run`

- [ ] 2. Add unit tests for `search-issues --fields` flag

  **What to do**:
  - Create a test file for the `--fields` flag behavior at an appropriate test location (follow existing test patterns in the project — check `src/worker-tools/` or `src/__tests__/` for conventions)
  - Test cases to cover:
    1. Default behavior: no `--fields` → output has exactly 5 fields per issue
    2. With `--fields updated,reporter` → output includes those extra fields
    3. With `--fields` and `--jql` → both work together
    4. Empty `--fields` value → treated as no extra fields (graceful handling)
    5. `--fields` with a single field → works correctly
  - Tests should use `JIRA_MOCK=true` mode to avoid real API calls
  - Tests can either shell out to the script via `execSync`/`spawn` or import the parsing logic directly if it's exported

  **Must NOT do**:
  - Do NOT test against the real Jira API — mock mode only
  - Do NOT modify the source tool file — this task is tests only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward test file creation following existing patterns
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Documents test patterns and mock fixture conventions for worker tools

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/worker-tools/jira/search-issues.ts` — The tool being tested. Mock mode at lines 74-83 reads fixture from `fixtures/search-issues/default.json`
  - `src/worker-tools/jira/fixtures/search-issues/default.json` — The fixture data returned when `JIRA_MOCK=true`
  - Search the project for existing worker tool tests: `src/**/*.test.ts` or `src/**/*.spec.ts` — follow the same test structure, imports, and assertion patterns

  **WHY Each Reference Matters**:
  - The tool source shows how mock mode works (env var + fixture file) which is how tests should exercise it
  - Existing test files show the project's testing conventions (vitest, assertion style, etc.)

  **Acceptance Criteria**:
  - [ ] Test file created at appropriate location
  - [ ] `pnpm test -- --run` passes with all new tests green
  - [ ] At least 5 test cases covering the scenarios listed above

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass
    Tool: Bash
    Preconditions: Task 1 completed
    Steps:
      1. Run: pnpm test -- --run
      2. Check exit code is 0
      3. Grep output for the new test file name
      4. Assert all tests in the new file pass
    Expected Result: 0 failures, all new tests green
    Failure Indicators: Non-zero exit code, test failures
    Evidence: .sisyphus/evidence/task-2-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(jira): add unit tests for search-issues --fields flag`
  - Files: test file
  - Pre-commit: `pnpm test -- --run`

- [ ] 3. Create jira-daily-digest employee via wizard + configure

  **What to do**:
  - Open the wizard at `http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000002`
  - Enter a description like: _"Every day, search Jira for all issues updated in the last 24 hours across all projects. Group the results by assignee and create a concise daily digest showing how many issues each person has active, what statuses they're in, and any notable changes. Post the digest directly to Slack — no approval needed."_
  - In the edit step, verify:
    - `tool_registry` includes `/tools/jira/search-issues.ts` and `/tools/jira/get-issue.ts`
    - `trigger_sources.type` is `manual` (or change it to Manual in the dropdown)
    - `approval_required` is unchecked (false)
    - `execution_steps` reference `--jql "updated >= -1d"` and `--fields updated,reporter`
    - `delivery_steps` correctly reference Slack posting
  - Select the Slack channel `#dozal-jira-summaries` in the channel dropdown
  - Save the employee (will save as draft)
  - After saving, manually set the following in the DB:
    - `notification_channel = 'C0B7YDQBJPJ'` (if the wizard didn't set it correctly)
    - `status = 'active'`
    - Override model to `deepseek/deepseek-v4-flash` for reliable tool calling during testing
  - Verify the archetype row is correct via `psql`

  **Must NOT do**:
  - Do NOT seed this employee in `prisma/seed.ts` — wizard-created employees live in the DB only
  - Do NOT set up cron/scheduled triggers
  - Do NOT store Jira secrets — already connected via OAuth
  - Do NOT hardcode forbidden models

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Browser-based wizard interaction + DB configuration requires Playwright + shell commands
  - **Skills**: [`creating-archetypes`, `e2e-testing`]
    - `creating-archetypes`: Covers all archetype schema fields, the wizard flow, and deployment checklist
    - `e2e-testing`: Covers the wizard E2E flow and field quality verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 1 completes — needs the enhanced tool in the registry)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — Wizard flow walkthrough (AC1-AC8), field quality checks, and lifecycle verification steps
  - `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — Existing Jira employee reference. Shows tool_registry pattern, Jira tool usage, and archetype configuration for a Jira-based employee
  - `src/gateway/services/archetype-generator.ts` — The LLM prompt that generates archetype fields. Understanding what it generates helps verify wizard output quality

  **API/Type References**:
  - Admin API: `POST /admin/tenants/:tenantId/employees/:slug/trigger` — for triggering the employee after activation
  - Archetype DB schema: `role_name`, `identity`, `execution_steps`, `delivery_steps`, `tool_registry`, `notification_channel`, `risk_model`, `status`, `model`

  **WHY Each Reference Matters**:
  - The E2E test guide has the exact wizard flow steps and what to check at each stage
  - The jira-motivation-bot doc shows a working Jira employee config to compare against
  - The archetype generator source reveals what the LLM produces so you can verify/fix the output

  **Acceptance Criteria**:
  - [ ] Archetype exists in DB with `role_name = 'jira-daily-digest'` and `tenant_id = '00000000-0000-0000-0000-000000000002'`
  - [ ] `status = 'active'`
  - [ ] `notification_channel = 'C0B7YDQBJPJ'`
  - [ ] `risk_model.approval_required = false`
  - [ ] `tool_registry` includes Jira search and Slack post tools
  - [ ] `execution_steps` reference `--jql` with `updated >= -1d` and `--fields`
  - [ ] Model set to `deepseek/deepseek-v4-flash`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype exists with correct configuration
    Tool: Bash
    Preconditions: Wizard completed and saved
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT role_name, status, notification_channel, model FROM archetypes WHERE role_name = 'jira-daily-digest' AND tenant_id = '00000000-0000-0000-0000-000000000002';"
      2. Assert: status = 'active'
      3. Assert: notification_channel = 'C0B7YDQBJPJ'
      4. Assert: model = 'deepseek/deepseek-v4-flash'
    Expected Result: One row with all fields correct
    Failure Indicators: No rows, status = 'draft', wrong channel, wrong model
    Evidence: .sisyphus/evidence/task-3-archetype-query.txt

  Scenario: Tool registry includes Jira and Slack tools
    Tool: Bash
    Preconditions: Archetype saved
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT tool_registry FROM archetypes WHERE role_name = 'jira-daily-digest' AND tenant_id = '00000000-0000-0000-0000-000000000002';" -t
      2. Assert: output contains 'search-issues'
      3. Assert: output contains 'post-message'
    Expected Result: tool_registry JSON includes both Jira search and Slack post tools
    Failure Indicators: Missing tools in registry
    Evidence: .sisyphus/evidence/task-3-tool-registry.txt

  Scenario: Execution steps reference JQL and --fields
    Tool: Bash
    Preconditions: Archetype saved
    Steps:
      1. Run: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT execution_steps FROM archetypes WHERE role_name = 'jira-daily-digest' AND tenant_id = '00000000-0000-0000-0000-000000000002';" -t
      2. Assert: output contains 'updated >= -1d' or similar date-range JQL
      3. Assert: output contains '--fields' or references to requesting extra fields
    Expected Result: Execution steps instruct the employee to use JQL date-range and request extra fields
    Failure Indicators: No JQL reference, no --fields reference
    Evidence: .sisyphus/evidence/task-3-execution-steps.txt
  ```

  **Commit**: NO (wizard-created, DB-only — no code changes to commit)

- [ ] 4. E2E verify: trigger employee and confirm Slack output

  **What to do**:
  - Ensure `pnpm dev` is running (gateway, Inngest, Docker services)
  - Build the Docker worker image: `docker build -t ai-employee-worker:latest .` (needed because Task 1 modified `search-issues.ts` which is in the Docker image)
  - Trigger the employee via admin API:
    ```bash
    source .env
    curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/jira-daily-digest/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq .
    ```
  - Capture the `task_id` from the response
  - Poll task status until it reaches `Done` (or `Failed`):
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"
    ```
  - If task reaches `Done`, verify a Slack message was posted to `C0B7YDQBJPJ`
  - Check task_status_log for the full lifecycle trace
  - Check container logs for any errors: `docker logs employee-${TASK_ID:0:8}`
  - If task `Failed`, diagnose using the `debugging-lifecycle` skill pattern: check container logs, harness log, task status log

  **Must NOT do**:
  - Do NOT trigger against the VLRE tenant — this is DozalDevs only
  - Do NOT modify any code — this is pure verification
  - Do NOT skip the Docker image rebuild — the enhanced `search-issues.ts` must be in the image

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: E2E verification requires monitoring, polling, log analysis, and potential debugging
  - **Skills**: [`debugging-lifecycle`, `e2e-testing`]
    - `debugging-lifecycle`: For diagnosing stuck/failed tasks via container logs, task_status_log, and harness events
    - `e2e-testing`: For the full E2E verification flow including Slack channel verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — Full E2E lifecycle verification steps
  - `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — Section on E2E flow and mock mode testing for a Jira employee
  - AGENTS.md § "Task Debugging Quick Reference" — `task_status_log` query, container log commands, harness log filtering

  **API/Type References**:
  - Admin API: `POST /admin/tenants/:tenantId/employees/:slug/trigger` — returns `{ task_id, status_url }`
  - `tasks` table: `id`, `status`, `archetype_id`, `metadata`
  - `task_status_log` table: `task_id`, `from_status`, `to_status`, `created_at`

  **WHY Each Reference Matters**:
  - The E2E test guide has exact verification steps for the full lifecycle
  - The debugging reference shows how to diagnose failures if the task doesn't reach Done
  - The admin API reference shows the trigger endpoint and response shape

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` status (not `Failed` or stuck)
  - [ ] `task_status_log` shows full lifecycle: Received → Ready → Executing → Submitting → Done
  - [ ] Slack message posted to `C0B7YDQBJPJ` (verify via Slack API or visually)
  - [ ] No errors in container logs
  - [ ] Docker image was rebuilt before triggering

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full lifecycle succeeds
    Tool: Bash
    Preconditions: pnpm dev running, Docker image rebuilt, employee active
    Steps:
      1. Trigger: source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/jira-daily-digest/trigger" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}'
      2. Capture task_id from response
      3. Poll every 15s for up to 5 minutes: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
      4. Assert status = 'Done'
      5. Verify lifecycle trace: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT from_status, to_status, created_at FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
    Expected Result: Task reaches Done within 5 minutes. Lifecycle shows Received → Ready → Executing → Submitting → Done (no Reviewing step since approval_required=false)
    Failure Indicators: Task stuck at Executing for >5min, status = Failed, missing lifecycle transitions
    Evidence: .sisyphus/evidence/task-4-lifecycle-trace.txt

  Scenario: Slack message appears in correct channel
    Tool: Bash
    Preconditions: Task reached Done
    Steps:
      1. Check task metadata for Slack ts: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';"
      2. If Slack ts exists, verify message via API: curl -s "https://slack.com/api/conversations.history" -H "Authorization: Bearer $SLACK_BOT_TOKEN" -d "channel=C0B7YDQBJPJ&limit=5" | jq '.messages[0].text'
      3. Assert message content mentions assignees and issue counts
    Expected Result: Recent message in C0B7YDQBJPJ contains a daily digest grouped by assignee
    Failure Indicators: No message in channel, message in wrong channel, message content is empty/generic
    Evidence: .sisyphus/evidence/task-4-slack-message.json

  Scenario: Container logs clean (no errors)
    Tool: Bash
    Preconditions: Task completed (Done or Failed)
    Steps:
      1. Check harness log: grep '"level":[45][0-9]' /tmp/employee-${TASK_ID:0:8}.log || echo "No errors"
      2. Assert no level 40+ (error) or level 50+ (fatal) entries
    Expected Result: No error or fatal log entries
    Failure Indicators: Error-level log entries, crash dumps, unhandled exceptions
    Evidence: .sisyphus/evidence/task-4-container-logs.txt
  ```

  **Commit**: NO (verification only — no code changes)

- [ ] 5. Create employee doc + update AGENTS.md

  **What to do**:
  - Create `docs/employees/YYYY-MM-DD-HHMM-jira-daily-digest.md` (run `date "+%Y-%m-%d-%H%M"` for timestamp)
  - Follow the pattern from `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — include:
    - Employee overview (what it does, which tenant)
    - Archetype ID (query from DB after Task 3)
    - Trigger method (manual via admin API `POST /admin/tenants/.../employees/jira-daily-digest/trigger`)
    - Tools used (`search-issues.ts`, `get-issue.ts`, Slack `post-message.ts`)
    - JQL pattern used (`updated >= -1d ORDER BY assignee, updated DESC`)
    - Slack channel (`#dozal-jira-summaries`, `C0B7YDQBJPJ`)
    - Approval: None (`approval_required: false`)
    - Known gotchas (e.g., model must be `deepseek/deepseek-v4-flash` for reliable tool calling, Docker image must be rebuilt after tool changes)
  - Add an entry to AGENTS.md Reference Documents table:
    ```
    | `docs/employees/YYYY-MM-DD-HHMM-jira-daily-digest.md` | Working on jira-daily-digest employee — archetype ID, trigger command, JQL pattern, Slack channel, gotchas |
    ```

  **Must NOT do**:
  - Do NOT add employee-specific language to shared lifecycle files
  - Do NOT create the doc before Task 4 succeeds (need the archetype ID and verified behavior)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Pure documentation task — creating an operational doc and updating a reference table
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run in parallel with Task 4 once Task 3 is done, but ideally after Task 4 to capture verified archetype ID and behavior)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (for tool documentation), Task 3 (for archetype ID)

  **References**:

  **Pattern References**:
  - `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — Template for Jira employee operational docs. Follow its exact structure: Overview, Archetype Config, Trigger, Tools, Flow, Gotchas
  - `docs/employees/daily-summarizer.md` — Another operational doc pattern showing scheduled employee documentation
  - `AGENTS.md` § "Reference Documents" — The table to add the new entry to

  **WHY Each Reference Matters**:
  - `jira-motivation-bot.md` is the closest template — same tool family, same output type
  - AGENTS.md must be updated per the "Documentation Freshness" convention

  **Acceptance Criteria**:
  - [ ] Doc file exists at `docs/employees/YYYY-MM-DD-HHMM-jira-daily-digest.md`
  - [ ] Doc includes: archetype ID, tenant, trigger method, tools, JQL pattern, Slack channel, gotchas
  - [ ] AGENTS.md Reference Documents table has a new row for the doc
  - [ ] Doc follows the naming convention `YYYY-MM-DD-HHMM-{slug}.md`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Doc file exists and contains required sections
    Tool: Bash
    Preconditions: Doc file created
    Steps:
      1. Find: ls docs/employees/*jira-daily-digest*
      2. Assert file exists
      3. Grep for required content: "archetype", "trigger", "C0B7YDQBJPJ", "search-issues", "updated >= -1d"
    Expected Result: File exists, contains all required sections
    Failure Indicators: File missing, key sections absent
    Evidence: .sisyphus/evidence/task-5-doc-check.txt

  Scenario: AGENTS.md updated with reference
    Tool: Bash
    Preconditions: AGENTS.md edited
    Steps:
      1. Grep AGENTS.md for "jira-daily-digest"
      2. Assert a Reference Documents table row exists
    Expected Result: AGENTS.md contains a row linking to the employee doc
    Failure Indicators: No mention of jira-daily-digest in AGENTS.md
    Evidence: .sisyphus/evidence/task-5-agents-md-check.txt
  ```

  **Commit**: YES
  - Message: `docs(employees): add jira-daily-digest operational doc`
  - Files: `docs/employees/YYYY-MM-DD-HHMM-jira-daily-digest.md`, `AGENTS.md`
  - Pre-commit: —

- [ ] 6. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `adding-shell-tools` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (enhanced tool used by the actual employee). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                               | Files                                             | Pre-commit           |
| ---- | ---------------------------------------------------------------------------- | ------------------------------------------------- | -------------------- |
| 1    | `feat(jira): add --fields flag to search-issues for dynamic field selection` | `src/worker-tools/jira/search-issues.ts`, fixture | `pnpm test -- --run` |
| 2    | `test(jira): add unit tests for search-issues --fields flag`                 | test file                                         | `pnpm test -- --run` |
| 5    | `docs(employees): add jira-daily-digest operational doc`                     | `docs/employees/...`, `AGENTS.md`                 | —                    |

---

## Success Criteria

### Verification Commands

```bash
# Tool enhancement works
JIRA_MOCK=true tsx src/worker-tools/jira/search-issues.ts --jql "updated >= -1d" --fields updated,reporter
# Expected: JSON with updated and reporter fields in each issue

# Employee exists and is active
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT role_name, status, notification_channel FROM archetypes WHERE role_name = 'jira-daily-digest' AND tenant_id = '00000000-0000-0000-0000-000000000002';"
# Expected: role_name=jira-daily-digest, status=active, notification_channel=C0B7YDQBJPJ

# Trigger and verify
source .env
curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/jira-daily-digest/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq .task_id
# Expected: task_id returned, task reaches Done, Slack message posted to C0B7YDQBJPJ

# Tests pass
pnpm test -- --run
# Expected: all tests pass
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Employee doc exists at `docs/employees/`
- [ ] AGENTS.md updated with reference to employee doc
