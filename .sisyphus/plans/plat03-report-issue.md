# PLAT-03: Issue Reporting Shell Tool + `system_events` Table

## TL;DR

> **Quick Summary**: Add a `system_events` Prisma table and a `report-issue.ts` shell tool so AI employees can write structured issue records to the database and post Slack alerts when they encounter or patch tool problems at runtime.
>
> **Deliverables**:
>
> - Prisma migration creating `system_events` table
> - `src/worker-tools/platform/report-issue.ts` shell tool (zero imports, native fetch)
> - Comprehensive test suite (`tests/worker-tools/platform/report-issue.test.ts`)
> - Dockerfile stanza for `/tools/platform/`
> - `TENANT_ID` + `ISSUES_SLACK_CHANNEL` injected into worker machine env
> - Updated `AGENTS.md` Section 4
> - Story map PLAT-03 checkboxes marked complete
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (migration) → Task 5 (tests) → Task 7 (verification) → F1-F4

---

## Context

### Original Request

Implement PLAT-03 from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). New `system_events` table + `report-issue.ts` shell tool. Test thoroughly via automated tests and API endpoint verification. Mark story map items complete.

### Interview Summary

**Key Discussions**:

- Dependencies HF-01 (env pattern), PLAT-01 (tsx execution), PLAT-02 (AGENTS.md self-repair policy) are ALL complete
- PLAT-01 confirms Docker path is `.ts` not `.js` — tsx executes source directly
- PLAT-02's AGENTS.md already references `report-issue.ts` in Sections 3 and 4 — anticipating this work
- This is the FIRST worker tool to write to PostgREST (all existing tools call external APIs only)

**Research Findings**:

- Shell tool pattern: manual arg parsing, zero imports (hostfully pattern), `main().catch()`, `Error:`/`Warning:`/`Fatal:` stderr prefixes
- Prisma conventions: `@id @default(uuid()) @db.Uuid`, tenant FK `onDelete: Restrict`, `@@map("system_events")`, closest analog: `TaskStatusLog`
- Tests: subprocess spawn via `execFile` + `npx tsx`, real `http.Server` on port 0 for mocking
- Docker: `.ts` source copied to `/tools/platform/`, no compilation, tsx is globally installed
- PostgREST default privileges auto-grant access to new tables — no explicit GRANT needed
- `#ai-employee-issues` channel ID does not exist anywhere in codebase — tool reads from env var

### Metis Review

**Identified Gaps** (addressed):

- `task_id` type conflict (text vs uuid): Resolved — use `text` as story map specifies. Not a FK to tasks table. Intentional for flexibility (AI agents may not have valid UUID).
- `TENANT_ID` not in container env: Resolved — add to machine env at `employee-lifecycle.ts:215` alongside `TASK_ID` (1-line change)
- `#ai-employee-issues` channel ID missing: Resolved — tool reads `ISSUES_SLACK_CHANNEL` env var, skips Slack with Warning if unset
- Slack failure behavior undefined: Resolved — Warning on stderr + exit 0 (DB write is primary deliverable; Slack is best-effort notification)
- Slack posting approach ambiguity: Resolved — native `fetch` to Slack API (zero imports, matching hostfully tool pattern and story map's "no npm imports" directive)
- PostgREST auto-exposure: Resolved — `ALTER DEFAULT PRIVILEGES` from existing migration covers new tables automatically
- Back-relation on Tenant: Required by Prisma — add `systemEvents SystemEvent[]` to Tenant model
- AGENTS.md Section 4 says "also post a Slack summary" as a separate agent action: Resolved — update Section 4 to clarify tool handles Slack posting internally (remove manual posting instruction)
- Testability: Tool accepts `SLACK_API_BASE_URL` env var (defaults to `https://slack.com/api`) so tests can redirect to mock server

---

## Work Objectives

### Core Objective

Create a durable, queryable log of runtime tool problems (separate from guest feedback) and a shell tool that writes to it + notifies engineers via Slack.

### Concrete Deliverables

- `prisma/migrations/{timestamp}_add_system_events_table/migration.sql`
- `prisma/schema.prisma` — `SystemEvent` model + Tenant back-relation
- `src/worker-tools/platform/report-issue.ts`
- `tests/worker-tools/platform/report-issue.test.ts`
- `Dockerfile` — COPY stanza for `/tools/platform/`
- `src/inngest/employee-lifecycle.ts` — `TENANT_ID` + `ISSUES_SLACK_CHANNEL` in machine env
- `src/workers/config/agents.md` — Updated Section 4
- `docs/2026-04-21-2202-phase1-story-map.md` — PLAT-03 checkboxes marked `[x]`

### Definition of Done

- [ ] `pnpm test -- --run` passes (baseline + new tests)
- [ ] `pnpm build` exits 0
- [ ] `tsx src/worker-tools/platform/report-issue.ts --help` exits 0
- [ ] PostgREST exposes `/system_events` (curl returns 200)
- [ ] Docker image builds and smoke test passes
- [ ] All 11 PLAT-03 acceptance criteria in story map are checked `[x]`

### Must Have

- `system_events` table with exact schema from story map
- Shell tool following zero-import pattern (native fetch only)
- Exit 0 on success, exit 1 with stderr on failure
- `--help` with full documentation (flags, env vars, output shape)
- Tests covering: success path, missing required args, PostgREST 500, Slack failure
- Documentation comments explaining when to call the tool

### Must NOT Have (Guardrails)

- MUST NOT modify `post-message.ts`, `read-channels.ts`, or any hostfully tool
- MUST NOT add a FK from `system_events.task_id` to the `tasks` table (task_id is `text`, not uuid FK)
- MUST NOT add admin API endpoints for `system_events` (out of scope)
- MUST NOT install npm packages at `/tools/platform/` (zero-import tool)
- MUST NOT add RLS policies for `system_events` (service role key bypasses RLS)
- MUST NOT write tests that call real PostgREST or real Slack API
- MUST NOT over-document or add excessive JSDoc beyond what the story map requires

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — tool implemented first, then tests)
- **Framework**: Vitest (existing project framework)
- **Test pattern**: Subprocess spawn via `execFile` + `npx tsx` + real `http.Server` mock on port 0

### QA Policy

Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run `tsx` commands, parse stdout JSON, check exit codes and stderr
- **Database**: Use Bash (curl) — POST to PostgREST to verify writes, GET to verify reads
- **Docker**: Use Bash — `docker build` + `docker run --entrypoint` smoke tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, all independent):
├── Task 1: Prisma migration for system_events table [quick]
├── Task 2: Shell tool report-issue.ts [deep]
├── Task 3: Inject TENANT_ID + ISSUES_SLACK_CHANNEL into machine env [quick]
└── Task 4: Update AGENTS.md Section 4 [quick]

Wave 2 (After Wave 1 — testing + Docker):
├── Task 5: Comprehensive tests for report-issue.ts (depends: 2) [unspecified-high]
└── Task 6: Dockerfile update + Docker smoke test (depends: 1, 2) [quick]

Wave 3 (After Wave 2 — verification + cleanup):
├── Task 7: Full build + test suite verification (depends: 1-6) [quick]
└── Task 8: Story map update + Telegram notification (depends: 7) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 6 → Task 7 → Task 8 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 6, 7   | 1    |
| 2    | —          | 5, 6   | 1    |
| 3    | —          | 7      | 1    |
| 4    | —          | 7      | 1    |
| 5    | 2          | 7      | 2    |
| 6    | 1, 2       | 7      | 2    |
| 7    | 1-6        | 8      | 3    |
| 8    | 7          | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `deep`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **2 tasks** — T5 → `unspecified-high`, T6 → `quick`
- **Wave 3**: **2 tasks** — T7 → `quick`, T8 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Prisma Migration for `system_events` Table

  **What to do**:
  - Add `SystemEvent` model to `prisma/schema.prisma` with these exact fields:

    ```prisma
    model SystemEvent {
      id                String   @id @default(uuid()) @db.Uuid
      task_id           String
      tenant_id         String   @db.Uuid
      tool_name         String
      issue_description String   @db.Text
      patch_applied     Boolean  @default(false)
      patch_diff        String?  @db.Text
      created_at        DateTime @default(now())

      tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Restrict)

      @@map("system_events")
    }
    ```

  - Add back-relation to `Tenant` model: `systemEvents SystemEvent[]`
  - **IMPORTANT**: `task_id` is `String` (text), NOT `@db.Uuid`. This is intentional — it's not a FK to the `tasks` table. AI agents may pass non-UUID identifiers during testing or edge cases.
  - Run `pnpm prisma migrate dev --name add_system_events_table` to generate the migration
  - Run `pnpm prisma generate` (usually auto-runs with migrate dev, but verify)
  - Verify PostgREST exposes the new table (may require PostgREST cache refresh — check with curl)

  **Must NOT do**:
  - Do NOT add a FK relation from `task_id` to the `tasks` table
  - Do NOT add seed data for `system_events` (it's a runtime-populated log table)
  - Do NOT add RLS policies or explicit GRANT statements (default privileges cover new tables)
  - Do NOT add an `updated_at` field (this is an append-only log table)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file schema change + standard Prisma migration command
  - **Skills**: `[]`
    - No special skills needed — standard Prisma workflow
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 6 (Dockerfile needs migration in image), Task 7 (verification)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `prisma/schema.prisma` — Full schema file. Find `model TaskStatusLog` (line ~near model definitions) — this is the closest analog (append-only log table with uuid PK, created_at, no updated_at needed). Also find `model Tenant` to add the back-relation `systemEvents SystemEvent[]` alongside other relation arrays like `secrets`, `integrations`, etc.
  - `prisma/migrations/20260416210126_add_tenant_and_secret_tables/migration.sql` — Shows canonical CREATE TABLE + FK pattern for tenant-scoped tables

  **API/Type References**:
  - `prisma/migrations/20260401210430_postgrest_grants/migration.sql` — Shows the `ALTER DEFAULT PRIVILEGES` that auto-grants access to new tables. No explicit GRANT needed in your migration.

  **External References**:
  - Prisma migrate docs: `pnpm prisma migrate dev --name <name>` generates timestamped directory + SQL

  **WHY Each Reference Matters**:
  - `TaskStatusLog` model: Copy its PK pattern (`@id @default(uuid()) @db.Uuid`) and `created_at` pattern. Note it has `updated_at @updatedAt` — do NOT copy that for SystemEvent (append-only, no updates).
  - `Tenant` model: You need to add `systemEvents SystemEvent[]` to its relations block. Find where `secrets TenantSecret[]` is — add yours in the same area.
  - PostgREST grants migration: Confirms you do NOT need to add any GRANT statements.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration applies cleanly
    Tool: Bash
    Preconditions: Local DB running (`docker compose` up), no pending migrations
    Steps:
      1. Run `pnpm prisma migrate dev --name add_system_events_table`
      2. Check exit code is 0
      3. Verify migration directory created under `prisma/migrations/`
    Expected Result: Migration applies without error, new directory exists with `migration.sql`
    Failure Indicators: Non-zero exit code, "Error" in output, missing migration directory
    Evidence: .sisyphus/evidence/task-1-migration-apply.txt

  Scenario: PostgREST exposes system_events table
    Tool: Bash (curl)
    Preconditions: Migration applied, PostgREST running (port 54321)
    Steps:
      1. Run `curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/system_events" -o /dev/null -w "%{http_code}"`
      2. If 404, restart PostgREST: `docker compose -f docker/docker-compose.yml restart postgrest` then retry
      3. Assert status code is 200
    Expected Result: HTTP 200 (empty array `[]` is fine — table exists and is accessible)
    Failure Indicators: HTTP 404 (table not exposed), HTTP 401 (auth issue)
    Evidence: .sisyphus/evidence/task-1-postgrest-exposure.txt

  Scenario: Can INSERT a record via PostgREST
    Tool: Bash (curl)
    Preconditions: Migration applied, PostgREST running
    Steps:
      1. Run `curl -s -X POST -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -H "Content-Type: application/json" -H "Prefer: return=representation" "http://localhost:54321/rest/v1/system_events" -d '{"task_id":"test-123","tenant_id":"00000000-0000-0000-0000-000000000003","tool_name":"test-tool","issue_description":"test issue","patch_applied":false}'`
      2. Assert response contains `"id"` field (uuid), `"tool_name":"test-tool"`, `"created_at"` timestamp
      3. Clean up: DELETE the test record
    Expected Result: 201 Created with full record JSON including auto-generated `id` and `created_at`
    Failure Indicators: 400 (schema mismatch), 404 (table not found), 409 (FK violation on tenant_id)
    Evidence: .sisyphus/evidence/task-1-postgrest-insert.txt

  Scenario: pnpm build still passes after schema change
    Tool: Bash
    Preconditions: prisma generate has run
    Steps:
      1. Run `pnpm build`
      2. Assert exit code 0
    Expected Result: TypeScript compilation succeeds (Prisma client types regenerated correctly)
    Failure Indicators: Non-zero exit code, type errors referencing SystemEvent
    Evidence: .sisyphus/evidence/task-1-build-passes.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-migration-apply.txt
  - [ ] task-1-postgrest-exposure.txt
  - [ ] task-1-postgrest-insert.txt
  - [ ] task-1-build-passes.txt

  **Commit**: YES
  - Message: `feat(db): add system_events table for runtime issue tracking`
  - Files: `prisma/schema.prisma`, `prisma/migrations/{timestamp}_add_system_events_table/migration.sql`
  - Pre-commit: `pnpm build`

---

- [x] 2. Shell Tool `report-issue.ts`

  **What to do**:
  - Create `src/worker-tools/platform/report-issue.ts` — a self-contained shell tool with ZERO npm imports
  - The tool does two things: (1) writes a `system_events` record via PostgREST, (2) posts a Slack alert via native `fetch` to the Slack API
  - **CLI arguments** (manual `for` loop over `argv.slice(2)`, no library):
    - `--task-id <string>` (REQUIRED) — the current task ID
    - `--tool-name <string>` (REQUIRED) — name of the broken/patched tool
    - `--description <string>` (REQUIRED) — what happened and what was done
    - `--patch-diff <string>` (OPTIONAL) — the diff applied, if any
    - `--help` — print usage and exit 0
  - **Environment variables** (validated at top of `main()`):
    - `SUPABASE_URL` (REQUIRED) — PostgREST base URL
    - `SUPABASE_SECRET_KEY` (REQUIRED) — service role key for PostgREST auth
    - `TENANT_ID` (REQUIRED) — tenant UUID for the `system_events` FK
    - `SLACK_BOT_TOKEN` (REQUIRED) — Slack bot token for posting alerts
    - `ISSUES_SLACK_CHANNEL` (OPTIONAL) — Slack channel ID for alerts. If not set, skip Slack with Warning.
    - `SLACK_API_BASE_URL` (OPTIONAL, for testing) — defaults to `https://slack.com/api`. Allows test mock server injection.
  - **PostgREST write** (native `fetch`):
    ```
    POST ${SUPABASE_URL}/rest/v1/system_events
    Headers: { apikey: key, Authorization: Bearer key, Content-Type: application/json, Prefer: return=representation }
    Body: { task_id, tenant_id, tool_name, issue_description, patch_applied: !!patchDiff, patch_diff }
    ```
  - **Slack post** (native `fetch`):
    ```
    POST ${SLACK_API_BASE_URL}/chat.postMessage
    Headers: { Authorization: Bearer SLACK_BOT_TOKEN, Content-Type: application/json }
    Body: { channel: ISSUES_SLACK_CHANNEL, text: formatted alert message }
    ```
    The Slack message text should include: tool name, task ID, issue description, and whether a patch was applied.
  - **Exit behavior**:
    - DB write success + Slack success → exit 0, stdout: `{ "ok": true, "event_id": "<uuid>" }`
    - DB write success + Slack failure → exit 0, stdout: `{ "ok": true, "event_id": "<uuid>" }`, stderr: `Warning: Slack notification failed: <reason>`
    - DB write success + no ISSUES_SLACK_CHANNEL → exit 0, stdout: `{ "ok": true, "event_id": "<uuid>" }`, stderr: `Warning: ISSUES_SLACK_CHANNEL not set — skipping Slack notification`
    - DB write failure → exit 1, stderr: `Error: Failed to write system event: <status>`
    - Missing required arg → exit 1, stderr: `Error: --<flag> is required`
    - Missing required env var → exit 1, stderr: `Error: <VAR> environment variable is required`
  - **`--help` output** (Pattern B: flag returned, checked at top of `main()`):
    - Must document ALL flags with descriptions
    - Must list ALL required and optional env vars
    - Must show output JSON shape
    - Must include a brief description of what constitutes a "reportable event"
  - **Documentation comments** at top of file:
    - When to call this tool (tool breakage, unexpected behavior, patches applied)
    - What constitutes a reportable event
    - Relationship to AGENTS.md Section 4 policy
  - **Code structure**: Follow the 6-part skeleton from existing tools:
    1. Documentation comments (no imports)
    2. Type/interface definitions
    3. `parseArgs(argv)` function
    4. Helper functions (formatSlackMessage, etc.)
    5. `async function main(): Promise<void>`
    6. `main().catch((err) => { Fatal: ... exit(1) })`

  **Must NOT do**:
  - Do NOT import any npm packages (`@slack/web-api`, etc.) — use native `fetch` for everything
  - Do NOT import from `../../lib/` or other worker-tools files — tool must be fully self-contained
  - Do NOT use `console.log` or `console.error` — use `process.stdout.write` and `process.stderr.write`
  - Do NOT add excessive JSDoc or AI-slop comments — keep documentation concise and purposeful
  - Do NOT hardcode the Slack channel ID — read from `ISSUES_SLACK_CHANNEL` env var

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Self-contained tool with two external service integrations (PostgREST + Slack), multiple exit paths, and careful error handling. Requires understanding existing patterns deeply.
  - **Skills**: `[]`
    - No special skills needed — standard TypeScript shell tool
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5 (tests need the tool source), Task 6 (Dockerfile needs the file)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts` — Best reference for overall tool structure: manual arg parsing with `for` loop, `--help` Pattern B (flag returned, checked at top of `main()`), detailed `--help` output with output schema docs, `Error:`/`Warning:` stderr, native `fetch`. Copy this structure exactly for `report-issue.ts`.
  - `src/worker-tools/hostfully/get-property.ts` — Shows `Warning:` stderr pattern for non-fatal failures (e.g., secondary data fetch fails but tool continues). Use this same pattern for Slack failure: `process.stderr.write('Warning: ...')` + continue with exit 0.
  - `src/worker-tools/hostfully/validate-env.ts` — Simplest tool example. Shows minimal env var validation pattern: `if (!process.env['VAR']) { Error: ... exit(1) }`.
  - `src/worker-tools/slack/post-message.ts` — Shows Slack message block structure and how approval blocks are built. Reference for Slack message formatting, BUT do not copy its `@slack/web-api` import pattern — use native `fetch` instead.

  **API/Type References**:
  - `src/workers/lib/postgrest-client.ts` — Shows the exact PostgREST headers pattern: `{ apikey, Authorization: Bearer, Content-Type: application/json, Prefer: return=representation }`. Copy these headers for the PostgREST write.
  - Slack API `chat.postMessage`: `POST https://slack.com/api/chat.postMessage` with `Authorization: Bearer <bot-token>`, body `{ channel, text }`. Returns `{ ok: true, ts: "...", channel: "..." }` on success.

  **WHY Each Reference Matters**:
  - `get-messages.ts`: The most complex existing tool — shows how to handle multiple args, detailed --help, and the full tool lifecycle. Your tool has similar complexity.
  - `get-property.ts`: Shows the Warning pattern for non-fatal failures. Slack failure is non-fatal in report-issue.ts.
  - `postgrest-client.ts`: The PostgREST header pattern is NOT obvious (need both `apikey` AND `Authorization`). Get this from the reference — don't guess.
  - `post-message.ts`: Shows Slack message formatting conventions. Don't import it, but read it to understand how Slack blocks work for consistent formatting.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — DB write + Slack post succeed
    Tool: Bash
    Preconditions: SUPABASE_URL, SUPABASE_SECRET_KEY, TENANT_ID, SLACK_BOT_TOKEN, ISSUES_SLACK_CHANNEL all set (can use test values for Slack)
    Steps:
      1. Run `SUPABASE_URL=http://localhost:54321 SUPABASE_SECRET_KEY=$KEY TENANT_ID=00000000-0000-0000-0000-000000000003 SLACK_BOT_TOKEN=xoxb-test ISSUES_SLACK_CHANNEL=CTEST tsx src/worker-tools/platform/report-issue.ts --task-id "test-task-001" --tool-name "get-messages" --description "API returned 500 on valid request"`
      2. Note: Slack will fail (test token), but DB write should succeed
      3. Check exit code is 0 (DB write is primary)
      4. Parse stdout JSON — assert `ok` is true, `event_id` is a UUID
    Expected Result: Exit 0, stdout JSON with `ok: true` and `event_id`, Warning on stderr about Slack failure
    Failure Indicators: Exit 1, no stdout JSON, Error on stderr about DB write
    Evidence: .sisyphus/evidence/task-2-happy-path.txt

  Scenario: --help exits 0 with comprehensive output
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `tsx src/worker-tools/platform/report-issue.ts --help`
      2. Assert exit code is 0
      3. Assert stdout contains: `--task-id`, `--tool-name`, `--description`, `--patch-diff`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TENANT_ID`, `SLACK_BOT_TOKEN`, `ISSUES_SLACK_CHANNEL`
    Expected Result: Exit 0, comprehensive usage text covering all flags and env vars
    Failure Indicators: Exit 1, missing flag documentation, stack trace
    Evidence: .sisyphus/evidence/task-2-help-output.txt

  Scenario: Missing required arg exits 1
    Tool: Bash
    Preconditions: All env vars set
    Steps:
      1. Run `SUPABASE_URL=x SUPABASE_SECRET_KEY=x TENANT_ID=x SLACK_BOT_TOKEN=x tsx src/worker-tools/platform/report-issue.ts --tool-name "test" --description "test"` (missing --task-id)
      2. Assert exit code is 1
      3. Assert stderr contains `--task-id`
    Expected Result: Exit 1, stderr: `Error: --task-id is required`
    Failure Indicators: Exit 0, no error message, wrong error message
    Evidence: .sisyphus/evidence/task-2-missing-arg.txt

  Scenario: Missing required env var exits 1
    Tool: Bash
    Preconditions: SUPABASE_URL not set
    Steps:
      1. Run `SUPABASE_SECRET_KEY=x TENANT_ID=x SLACK_BOT_TOKEN=x tsx src/worker-tools/platform/report-issue.ts --task-id "t" --tool-name "t" --description "t"` (SUPABASE_URL missing)
      2. Assert exit code is 1
      3. Assert stderr contains `SUPABASE_URL`
    Expected Result: Exit 1, stderr: `Error: SUPABASE_URL environment variable is required`
    Failure Indicators: Exit 0, no error message
    Evidence: .sisyphus/evidence/task-2-missing-env.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-happy-path.txt
  - [ ] task-2-help-output.txt
  - [ ] task-2-missing-arg.txt
  - [ ] task-2-missing-env.txt

  **Commit**: YES (groups with Task 4)
  - Message: `feat(worker-tools): add report-issue shell tool for AI employee self-reporting`
  - Files: `src/worker-tools/platform/report-issue.ts`, `src/workers/config/agents.md`
  - Pre-commit: `pnpm build`

- [x] 3. Inject `TENANT_ID` + `ISSUES_SLACK_CHANNEL` into Worker Machine Env

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, at line ~215 (inside the `executing` step's `createMachine` call), add `TENANT_ID: tenantId` to the `env` object alongside `TASK_ID: taskId`
  - Also add `ISSUES_SLACK_CHANNEL` — read it from `tenantEnv` (if loadTenantEnv already returns it) OR from a hardcoded platform-level constant. For now, add it as a direct string in the env block: `ISSUES_SLACK_CHANNEL: process.env.ISSUES_SLACK_CHANNEL ?? ''`. The actual channel ID will be set in `.env` or via tenant config later when the Slack channel is created.
  - Update the existing test file for employee-lifecycle to verify `TENANT_ID` is present in the machine env
  - The change is exactly 2 lines added to the env object at line ~213-219

  **Must NOT do**:
  - Do NOT modify `loadTenantEnv()` or its test files — keep the change localized to the lifecycle dispatch
  - Do NOT modify the deprecated `src/inngest/lifecycle.ts` (engineering lifecycle — on hold)
  - Do NOT add tenant config schema changes for `issues_channel` (deferred to when channel is created)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2-line env addition + test update in a single file pair
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 7 (verification)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:207-220` — The `createMachine` call in the `executing` step. Line 213-219 is the `env` object. Add `TENANT_ID: tenantId,` at line 215 (right after `TASK_ID: taskId,`). Also add `ISSUES_SLACK_CHANNEL: process.env.ISSUES_SLACK_CHANNEL ?? '',`
  - `src/inngest/employee-lifecycle.ts:90` — Where `tenantId` is extracted from `taskData.tenant_id`. Confirms `tenantId` is in scope and validated (non-null).

  **Test References**:
  - Search for existing tests of the `executing` step in `tests/inngest/employee-lifecycle.test.ts` or similar. If the `createMachine` env object is already tested (e.g., verifying `TASK_ID` is passed), add an assertion for `TENANT_ID` in the same test.

  **WHY Each Reference Matters**:
  - Line 207-220 is the EXACT location where the 2 new lines go. No searching needed.
  - Line 90 confirms `tenantId` is a validated, non-null string in scope.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TENANT_ID is in the machine env object
    Tool: Bash
    Preconditions: Source code modified
    Steps:
      1. Read `src/inngest/employee-lifecycle.ts` lines 207-225
      2. Verify `TENANT_ID: tenantId,` appears in the env object
      3. Verify `ISSUES_SLACK_CHANNEL` appears in the env object
    Expected Result: Both env vars present in the createMachine env block
    Failure Indicators: Missing lines, wrong variable names, syntax errors
    Evidence: .sisyphus/evidence/task-3-env-injection.txt

  Scenario: pnpm build passes
    Tool: Bash
    Preconditions: Source modified
    Steps:
      1. Run `pnpm build`
      2. Assert exit code 0
    Expected Result: No type errors from the added lines
    Failure Indicators: Type errors mentioning tenantId or env properties
    Evidence: .sisyphus/evidence/task-3-build-passes.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: Source modified
    Steps:
      1. Run `pnpm test -- --run` (or specifically the lifecycle test file if identifiable)
      2. Assert all tests pass
    Expected Result: Zero regressions from 2-line addition
    Failure Indicators: New test failures in lifecycle tests
    Evidence: .sisyphus/evidence/task-3-tests-pass.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-env-injection.txt
  - [ ] task-3-build-passes.txt
  - [ ] task-3-tests-pass.txt

  **Commit**: YES
  - Message: `feat(lifecycle): inject TENANT_ID and ISSUES_SLACK_CHANNEL into worker machine env`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 4. Update `AGENTS.md` Section 4 (Mandatory Issue Reporting)

  **What to do**:
  - Edit `src/workers/config/agents.md` Section 4 ("Mandatory Issue Reporting")
  - Update the tool invocation example to include `--patch-diff` as an optional arg:
    ```
    tsx /tools/platform/report-issue.ts --task-id "$TASK_ID" --tool-name "<tool-name>" --description "<what broke and what you did>" [--patch-diff "<unified diff of changes>"]
    ```
  - Remove or rephrase the sentence "After filing the report, also post a brief plain-text summary to the configured Slack issues channel so a human is notified promptly." → Replace with: "The tool automatically posts a Slack notification to the configured issues channel if `ISSUES_SLACK_CHANNEL` is set in the environment."
  - Keep the rest of Section 4 unchanged — the reporting policy ("before this task ends", "even if you fixed it") is correct as-is

  **Must NOT do**:
  - Do NOT modify Sections 1, 2, 3, 5, 6, or Summary — they are out of scope
  - Do NOT add new sections
  - Do NOT add excessive documentation — keep it concise and actionable for AI agents

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single markdown file, ~3 lines changed
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 7 (verification)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `src/workers/config/agents.md:31-41` — Section 4 "Mandatory Issue Reporting". Lines 36-37 contain the current invocation example. Line 39 contains the sentence about manual Slack posting that needs updating.

  **WHY Each Reference Matters**:
  - These are the EXACT lines to edit. The rest of the file must remain unchanged.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Updated invocation example includes --patch-diff
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Read `src/workers/config/agents.md`
      2. Assert the invocation example contains `--patch-diff`
      3. Assert the manual Slack posting instruction is removed/replaced
      4. Assert Sections 1, 2, 3, 5, 6 are unchanged
    Expected Result: Section 4 updated with --patch-diff and auto-Slack clarification
    Failure Indicators: Missing --patch-diff in example, manual Slack instruction still present, other sections modified
    Evidence: .sisyphus/evidence/task-4-agents-md-update.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-agents-md-update.txt

  **Commit**: YES (groups with Task 2)
  - Message: `feat(worker-tools): add report-issue shell tool for AI employee self-reporting`
  - Files: `src/workers/config/agents.md` (committed alongside `report-issue.ts`)
  - Pre-commit: `pnpm build`

- [x] 5. Comprehensive Tests for `report-issue.ts`

  **What to do**:
  - Create `tests/worker-tools/platform/report-issue.test.ts`
  - Follow the EXACT test pattern from `tests/worker-tools/hostfully/get-messages.test.ts`:
    - `execFile` + `npx tsx` subprocess spawn (NOT module imports)
    - Real `http.Server` on port 0 for mocking
    - `beforeAll`/`afterAll` for server lifecycle
  - The mock server must handle BOTH PostgREST AND Slack API routes on the same port:
    - `POST /rest/v1/system_events` → PostgREST mock (return `[{ id: "uuid", ... }]` with 201)
    - `POST /chat.postMessage` → Slack API mock (return `{ ok: true, ts: "...", channel: "..." }`)
  - Env vars injected into subprocess:
    - `SUPABASE_URL: http://localhost:${port}` (redirects PostgREST calls to mock)
    - `SUPABASE_SECRET_KEY: test-secret`
    - `TENANT_ID: 00000000-0000-0000-0000-000000000003`
    - `SLACK_BOT_TOKEN: xoxb-test-token`
    - `ISSUES_SLACK_CHANNEL: C_TEST_ISSUES`
    - `SLACK_API_BASE_URL: http://localhost:${port}` (redirects Slack calls to mock)
  - **Test cases (minimum 8 required)**:
    1. `--help` exits 0 with usage text containing all flags and env var names
    2. Missing `--task-id` → exit 1, stderr contains `--task-id`
    3. Missing `--tool-name` → exit 1, stderr contains `--tool-name`
    4. Missing `--description` → exit 1, stderr contains `--description`
    5. Missing `SUPABASE_URL` env var → exit 1, stderr contains `SUPABASE_URL`
    6. Missing `SLACK_BOT_TOKEN` env var → exit 1, stderr contains `SLACK_BOT_TOKEN`
    7. Happy path (all args + env vars valid) → exit 0, stdout JSON with `ok: true` and `event_id`
    8. Happy path with `--patch-diff` → exit 0, mock server received `patch_applied: true` and `patch_diff` in request body
    9. PostgREST returns 500 → exit 1, stderr contains `Error:`
    10. Slack API returns `{ ok: false }` → exit 0 (DB write succeeded), stderr contains `Warning:`
    11. `ISSUES_SLACK_CHANNEL` not set → exit 0, stderr contains `Warning:` about skipping Slack
  - Mock server must track requests received (store in array) so tests can assert on request bodies
  - Use `describe`/`it` blocks with descriptive names

  **Must NOT do**:
  - Do NOT import the tool module — always use subprocess via `execFile` + `npx tsx`
  - Do NOT call real PostgREST or real Slack API
  - Do NOT use MSW, nock, or any HTTP mocking library — use raw `http.Server`
  - Do NOT add more than ~15 test cases — focus on the AC-specified scenarios

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex test setup with dual mock server (PostgREST + Slack), 11 test cases, subprocess spawning. Requires careful async handling and request body tracking.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: Task 7 (verification)
  - **Blocked By**: Task 2 (needs the tool source file to exist for `execFile`)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `tests/worker-tools/hostfully/get-messages.test.ts` — PRIMARY reference. Copy this file's structure: imports, `runScript` helper, `http.Server` setup in `beforeAll`, server teardown in `afterAll`, CLI arg tests, output shape tests, error path tests.
  - `tests/worker-tools/hostfully/get-property.test.ts` — Shows `Warning` vs `Error` stderr assertion patterns. The `get-property.ts` tests check for non-fatal failures (amenities endpoint fails but tool continues). Use same pattern for Slack failure.
  - `tests/worker-tools/hostfully/validate-env.test.ts` — Simplest tool test. Shows minimal env var validation testing.

  **Test References**:
  - `vitest.config.ts` — Confirms `pool: 'forks'`, `singleFork: true`, 30s timeout. New test file auto-discovered from `tests/**/*.test.ts` glob.

  **WHY Each Reference Matters**:
  - `get-messages.test.ts`: The mock server setup is COMPLEX (handles multiple routes, tracks request metadata). Your mock must handle both PostgREST and Slack routes — use the same multi-route handler pattern.
  - `get-property.test.ts`: Shows how to test Warning (non-fatal) vs Error (fatal) paths in the same test file.
  - `validate-env.test.ts`: Shows the simplest possible env var test — use as a template for the 2 env var test cases.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All test cases pass
    Tool: Bash
    Preconditions: Task 2 complete (report-issue.ts exists), test file created
    Steps:
      1. Run `pnpm test -- --run tests/worker-tools/platform/report-issue.test.ts`
      2. Assert exit code 0
      3. Assert all 11+ test cases pass (0 failures)
    Expected Result: All tests pass, no skipped tests
    Failure Indicators: Any test failure, timeout (>30s per test), mock server port conflict
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt

  Scenario: Tests cover PostgREST 500 error path
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Read test file, find the "PostgREST 500" test case
      2. Verify it configures mock server to return 500 for `/rest/v1/system_events`
      3. Verify it asserts exit code 1 and stderr contains `Error:`
    Expected Result: Test case exists and follows the Error pattern
    Failure Indicators: Test case missing, wrong exit code assertion, missing stderr check
    Evidence: .sisyphus/evidence/task-5-postgrest-500-test.txt

  Scenario: Tests cover Slack failure graceful degradation
    Tool: Bash
    Preconditions: Test file created
    Steps:
      1. Read test file, find the "Slack failure" test case
      2. Verify it configures mock server to return `{ ok: false }` for `/chat.postMessage`
      3. Verify it asserts exit code 0 (not 1!) and stderr contains `Warning:`
    Expected Result: Test case exists, verifies Slack failure is non-fatal (exit 0 + Warning)
    Failure Indicators: Test case missing, asserts exit 1 (wrong — Slack failure should not fail the tool)
    Evidence: .sisyphus/evidence/task-5-slack-failure-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-tests-pass.txt
  - [ ] task-5-postgrest-500-test.txt
  - [ ] task-5-slack-failure-test.txt

  **Commit**: YES
  - Message: `test(worker-tools): add comprehensive tests for report-issue shell tool`
  - Files: `tests/worker-tools/platform/report-issue.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 6. Dockerfile Update + Docker Smoke Test

  **What to do**:
  - Add these lines to the `Dockerfile`, after the existing hostfully tool COPY stanzas (near the end of the runtime stage, before `WORKDIR /app` or `CMD`):
    ```dockerfile
    RUN mkdir -p /tools/platform
    COPY --from=builder /build/src/worker-tools/platform/report-issue.ts /tools/platform/report-issue.ts
    ```
  - No `npm install --prefix /tools/platform` needed (tool has zero npm imports)
  - Build the Docker image and run a smoke test

  **Must NOT do**:
  - Do NOT add `npm install --prefix /tools/platform` — tool uses only native `fetch`
  - Do NOT modify existing COPY stanzas for slack or hostfully tools
  - Do NOT change the CMD, ENTRYPOINT, or WORKDIR

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2 lines added to Dockerfile + one Docker build + smoke test
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 7 (verification)
  - **Blocked By**: Task 1 (migration must be in the image build context), Task 2 (tool source must exist)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `Dockerfile` — Find the existing hostfully tool COPY stanzas (search for `mkdir -p /tools/hostfully` and the COPY lines that follow). Place the new `/tools/platform/` stanzas immediately after the last hostfully COPY line, before any `WORKDIR` or `CMD` instruction.

  **WHY Each Reference Matters**:
  - The Dockerfile line ordering matters. Tools must be copied AFTER the builder stage compiles, but BEFORE the CMD. Following the existing hostfully/slack pattern ensures correct ordering.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully
    Tool: Bash
    Preconditions: Tasks 1 and 2 complete, Dockerfile updated
    Steps:
      1. Run `docker build -t ai-employee-worker:latest .`
      2. Assert exit code 0
    Expected Result: Image builds without errors
    Failure Indicators: COPY failure (source file not found), build error
    Evidence: .sisyphus/evidence/task-6-docker-build.txt

  Scenario: report-issue.ts --help works inside container
    Tool: Bash
    Preconditions: Docker image built
    Steps:
      1. Run `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/platform/report-issue.ts --help`
      2. Assert exit code 0
      3. Assert stdout contains `--task-id`, `--tool-name`, `--description`
    Expected Result: Tool is executable inside the container, --help produces correct output
    Failure Indicators: File not found, tsx error, missing output
    Evidence: .sisyphus/evidence/task-6-docker-smoke.txt

  Scenario: File exists at correct path
    Tool: Bash
    Preconditions: Docker image built
    Steps:
      1. Run `docker run --rm --entrypoint ls ai-employee-worker:latest /tools/platform/`
      2. Assert output contains `report-issue.ts`
    Expected Result: File is present at `/tools/platform/report-issue.ts`
    Failure Indicators: Empty directory, missing file
    Evidence: .sisyphus/evidence/task-6-file-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-docker-build.txt
  - [ ] task-6-docker-smoke.txt
  - [ ] task-6-file-check.txt

  **Commit**: YES
  - Message: `build(docker): add /tools/platform/ directory and report-issue.ts to image`
  - Files: `Dockerfile`
  - Pre-commit: `docker build -t ai-employee-worker:latest .`

- [x] 7. Full Build + Test Suite Verification

  **What to do**:
  - Run `pnpm build` and verify exit 0
  - Run `pnpm test -- --run` and verify all tests pass (existing + new)
  - Verify no pre-existing test failures have regressed (expected failures: `container-boot.test.ts`, `inngest-serve.test.ts`)
  - Verify PostgREST still serves `/system_events` (curl check)
  - This is a verification-only task — no code changes

  **Must NOT do**:
  - Do NOT modify any source files in this task — it's verification only
  - Do NOT fix unrelated test failures (pre-existing failures are expected)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run 3 commands, check outputs
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1-6 (all implementation must be complete)

  **References**:

  **Pattern References**:
  - `AGENTS.md` (project root) — Lists pre-existing test failures to expect: `container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: pnpm build exits 0
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `pnpm build`
      2. Assert exit code 0
    Expected Result: Clean TypeScript compilation
    Failure Indicators: Type errors from new code
    Evidence: .sisyphus/evidence/task-7-build.txt

  Scenario: pnpm test passes (new + existing tests)
    Tool: Bash
    Preconditions: All implementation tasks complete
    Steps:
      1. Run `pnpm test -- --run`
      2. Assert new `report-issue.test.ts` tests all pass
      3. Assert only pre-existing failures appear (container-boot, inngest-serve)
    Expected Result: All tests pass except known pre-existing failures
    Failure Indicators: New test failures, regression in existing tests
    Evidence: .sisyphus/evidence/task-7-tests.txt

  Scenario: PostgREST still accessible
    Tool: Bash (curl)
    Preconditions: Docker Compose running
    Steps:
      1. Run `curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/system_events" -w "\n%{http_code}"`
      2. Assert HTTP 200
    Expected Result: Table accessible, returns 200 (empty array if no records)
    Failure Indicators: 404, 401, connection refused
    Evidence: .sisyphus/evidence/task-7-postgrest.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-build.txt
  - [ ] task-7-tests.txt
  - [ ] task-7-postgrest.txt

  **Commit**: NO (verification only — no files changed)

---

- [x] 8. Story Map Update + Telegram Notification

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the PLAT-03 section (starts at line ~305)
  - Change ALL 11 acceptance criteria checkboxes from `[ ]` to `[x]`
  - Update the one AC that mentions `.js` to reflect the tsx path: change "Compiled into Docker image at `/tools/platform/report-issue.js` (or tsx path if PLAT-01 complete)" to "Available in Docker image at `/tools/platform/report-issue.ts` (tsx execution — PLAT-01 complete)"
  - Send Telegram notification that the plan is complete

  **Must NOT do**:
  - Do NOT modify any other story in the story map (HF-_, GM-_, PLAT-01, PLAT-02, etc.)
  - Do NOT change the story description, notes, or attributes — only checkboxes
  - Do NOT mark boxes `[x]` unless Task 7 verification passed

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Checkbox updates in a markdown file + one script call
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7 (must verify everything works before marking complete)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:305-329` — PLAT-03 section. Lines 318-329 contain the 11 acceptance criteria checkboxes. Each `- [ ]` must become `- [x]`.
  - The AC at line ~327 references `.js` path — update to `.ts` since PLAT-01 is complete.

  **WHY Each Reference Matters**:
  - Exact line numbers prevent accidentally modifying other stories in this 400+ line file.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All PLAT-03 checkboxes are marked complete
    Tool: Bash
    Preconditions: Task 7 verification passed
    Steps:
      1. Read `docs/2026-04-21-2202-phase1-story-map.md` lines 305-330
      2. Count `- [x]` items in the PLAT-03 Acceptance Criteria section
      3. Assert count is 11 (all criteria marked complete)
      4. Assert zero `- [ ]` items remain in PLAT-03 section
    Expected Result: All 11 acceptance criteria checked
    Failure Indicators: Any unchecked box, wrong section modified, fewer than 11 boxes
    Evidence: .sisyphus/evidence/task-8-story-map.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: Story map updated
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "📋 Plan plat03-report-issue complete, all tasks done, come back to review results."`
      2. Assert exit code 0
    Expected Result: Notification delivered
    Failure Indicators: Script error, network failure (non-fatal — log and continue)
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-story-map.txt
  - [ ] task-8-telegram.txt

  **Commit**: YES
  - Message: `docs: mark PLAT-03 acceptance criteria complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/plat03-report-issue.md` end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify the shell tool follows the zero-import pattern — no `import` statements except type-only imports.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `pnpm prisma migrate dev` to apply migration. Verify PostgREST serves `/system_events` via curl. Execute `tsx src/worker-tools/platform/report-issue.ts` with valid args against local PostgREST (real DB write). Query `/system_events` via curl to confirm record exists. Run `tsx src/worker-tools/platform/report-issue.ts --help` and verify output. Run with missing args to verify exit codes. Build Docker image and run smoke test. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no post-message.ts changes, no admin API endpoints, no npm installs at /tools/platform/. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Tasks | Message                                                                              | Pre-commit                                    |
| ------ | ----- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1      | 1     | `feat(db): add system_events table for runtime issue tracking`                       | `pnpm build`                                  |
| 2      | 2, 4  | `feat(worker-tools): add report-issue shell tool for AI employee self-reporting`     | `pnpm build`                                  |
| 3      | 3     | `feat(lifecycle): inject TENANT_ID and ISSUES_SLACK_CHANNEL into worker machine env` | `pnpm build`                                  |
| 4      | 5     | `test(worker-tools): add comprehensive tests for report-issue shell tool`            | `pnpm test -- --run`                          |
| 5      | 6     | `build(docker): add /tools/platform/ directory and report-issue.ts to image`         | `docker build -t ai-employee-worker:latest .` |
| 6      | 7, 8  | `docs: mark PLAT-03 acceptance criteria complete in story map`                       | —                                             |

---

## Success Criteria

### Verification Commands

```bash
# Migration applied and PostgREST serves the table
curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "http://localhost:54321/rest/v1/system_events" -o /dev/null -w "%{http_code}"
# Expected: 200

# Tool --help works
tsx src/worker-tools/platform/report-issue.ts --help
# Expected: exit 0, usage text with all flags and env vars

# Tests pass
pnpm test -- --run
# Expected: all tests pass including new report-issue tests

# Build passes
pnpm build
# Expected: exit 0

# Docker smoke test
docker build -t ai-employee-worker:latest . && docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/platform/report-issue.ts --help
# Expected: exit 0, usage text
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Story map PLAT-03 items all checked `[x]`
