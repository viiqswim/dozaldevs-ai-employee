# GM-22: Hostfully Webhook Trigger

## TL;DR

> **Quick Summary**: Replace the `trigger/guest-message-poller` cron with a real-time `POST /webhooks/hostfully` Express route that receives Hostfully `NEW_INBOX_MESSAGE` webhooks, creates a task, and fires `employee/task.dispatched` to trigger the guest-messaging employee — delivering approval cards to Slack within seconds instead of polling windows.
>
> **Deliverables**:
>
> - New Express route: `POST /webhooks/hostfully` with payload validation, tenant resolution, dedup, and Inngest dispatch
> - Webhook registration script: `src/worker-tools/hostfully/register-webhook.ts`
> - Seed update: `hostfully_agency_uid` added to VLRE tenant config
> - Poller removal: `guest-message-poller.ts` deleted, unregistered from Inngest serve
> - Comprehensive automated tests (unit + integration)
> - Story-map doc updated to mark GM-22 complete
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (seed) → Task 3 (route) → Task 6 (integration tests) → Task 9 (poller removal) → F1-F4

---

## Context

### Original Request

Implement GM-22 from the Phase 1 story map: a Hostfully webhook trigger that replaces the polling cron. When a guest sends a message, the AI should draft a response within seconds, not after the next polling window.

### Interview Summary

**Key Discussions**:

- **HMAC**: Skip — ticket explicitly says not required, matches standalone MVP
- **Dedup**: DB-only via `tasks` table composite unique constraint `@@unique([external_id, source_system, tenant_id])` — no in-memory Set (Fly.io has no persistent local state)
- **Tenant resolution**: Store `hostfully_agency_uid` in `tenant.config.guest_messaging`, query tenants by config field
- **Poller**: Remove completely — delete file, remove from `serve.ts`, delete test file
- **Thread concurrency**: One task per message (`message_uid`). The `pending_approvals` table already handles thread-level concurrency at approval time.

**Research Findings**:

- Standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee/` has proven webhook pattern (Bun.serve → Express adaptation)
- `createTaskAndDispatch` requires Inngest `step` context — **cannot be used in Express routes**. Must use `employee-dispatcher.ts` pattern (Prisma direct + `inngest.send()`)
- `tasks` schema: `@@unique([external_id, source_system, tenant_id])` — composite constraint, must use all 3 fields for dedup
- `HostfullyWebhookPayload`: `{ agency_uid, event_type, message_uid, thread_uid, lead_uid?, property_uid?, message_content? }`
- VLRE tenant: `00000000-0000-0000-0000-000000000003`, archetype slug: `guest-messaging`
- Route registration pattern: Router factory with `{ inngestClient?, prisma? }` options, mounted in `server.ts` `buildApp()`

### Metis Review

**Identified Gaps** (addressed):

- **`createTaskAndDispatch` unusable in Express**: Corrected — route uses Prisma direct + `inngest.send()` pattern from `employee-dispatcher.ts`
- **`hostfully_agency_uid` not in tenant config**: Added as Task 1 (seed update)
- **PII logging risk**: Added guardrail — never log `message_content`
- **Unknown agency_uid response code**: Must return 200 (Hostfully retries on non-2xx)
- **Dedup race condition**: Use Prisma `create()` with unique constraint catch, not SELECT-then-INSERT
- **Thread concurrency**: Resolved — one task per message, `pending_approvals` handles thread-level blocking

---

## Work Objectives

### Core Objective

Replace polling-based guest message triggering with real-time Hostfully webhooks, reducing response latency from minutes to seconds.

### Concrete Deliverables

- `src/gateway/routes/hostfully.ts` — Express webhook route handler
- `src/gateway/validation/schemas.ts` — Zod schema for `HostfullyWebhookPayload`
- `src/gateway/server.ts` — Route registration
- `src/worker-tools/hostfully/register-webhook.ts` — Webhook registration script
- `prisma/seed.ts` — `hostfully_agency_uid` in VLRE tenant config
- Poller deleted: `src/inngest/triggers/guest-message-poller.ts`, registration in `serve.ts`, test file
- `tests/gateway/routes/hostfully.test.ts` — Unit tests
- `tests/gateway/hostfully-webhook.test.ts` — Integration tests
- `docs/planning/2026-04-21-2202-phase1-story-map.md` — GM-22 marked complete

### Definition of Done

- [ ] `curl POST /webhooks/hostfully` with valid payload → 200, task created, Inngest event fired
- [ ] `curl POST /webhooks/hostfully` with duplicate `message_uid` → 200, no new task
- [ ] `curl POST /webhooks/hostfully` with non-`NEW_INBOX_MESSAGE` → 200, no task
- [ ] `curl POST /webhooks/hostfully` with unknown `agency_uid` → 200, no task, warning logged
- [ ] `curl POST /webhooks/hostfully` with malformed payload → 400
- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes (all existing + new tests)
- [ ] `grep -r "guest-message-poller" src/` returns 0 results

### Must Have

- HTTP 200 returned immediately for ALL valid payloads (Hostfully expects fast ACK)
- `NEW_INBOX_MESSAGE` filter — only this event type creates tasks
- DB-level dedup via `@@unique([external_id, source_system, tenant_id])` — catch unique violation, don't SELECT-then-INSERT
- Tenant resolution from `agency_uid` via `tenant.config.guest_messaging.hostfully_agency_uid`
- `employee/task.dispatched` event fired with `{ taskId, archetypeId }`
- Complete poller removal (file + registration + tests)

### Must NOT Have (Guardrails)

- ❌ HMAC signature verification (explicitly out of scope per ticket)
- ❌ `createTaskAndDispatch` usage (requires Inngest step context, unavailable in Express routes)
- ❌ Handling of non-`NEW_INBOX_MESSAGE` event types beyond returning 200
- ❌ Modifications to `employee-dispatcher.ts` or `pending_approvals` logic
- ❌ A reusable `hostfully-client.ts` library module (registration script is self-contained)
- ❌ Modifications to the guest-messaging archetype record
- ❌ Logging of `message_content` (PII risk — log only `agency_uid`, `event_type`, `message_uid`, `thread_uid`)
- ❌ Non-2xx responses for unknown `agency_uid` (Hostfully retries on non-2xx)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios with evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API endpoints**: Use Bash (curl) — send requests, assert status + response fields
- **Build/Lint**: Use Bash — `pnpm build`, `pnpm test -- --run`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Seed update — add hostfully_agency_uid to VLRE tenant config [quick]
├── Task 2: Zod schema + types for HostfullyWebhookPayload [quick]
├── Task 3: Webhook route handler (POST /webhooks/hostfully) [deep]
└── Task 4: Webhook registration script [quick]

Wave 2 (After Wave 1 — tests + wiring):
├── Task 5: Unit tests for webhook route [unspecified-high]
├── Task 6: Integration tests for webhook route [unspecified-high]
├── Task 7: Register route in server.ts + .env.example update [quick]
└── Task 8: Build + lint verification [quick]

Wave 3 (After Wave 2 — cleanup + docs):
├── Task 9: Remove guest-message-poller (file + registration + tests) [quick]
├── Task 10: Update story-map doc to mark GM-22 complete [quick]
└── Task 11: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 7 → Task 6 → Task 9 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Waves 1 & 2)
```

### Dependency Matrix

| Task  | Depends On | Blocks    | Wave  |
| ----- | ---------- | --------- | ----- |
| 1     | —          | 3, 6      | 1     |
| 2     | —          | 3, 5      | 1     |
| 3     | 1, 2       | 5, 6, 7   | 1     |
| 4     | —          | 8         | 1     |
| 5     | 2, 3       | 8         | 2     |
| 6     | 1, 3, 7    | 8         | 2     |
| 7     | 3          | 6, 8      | 2     |
| 8     | 5, 6, 7    | 9         | 2     |
| 9     | 8          | F1-F4     | 3     |
| 10    | 9          | F1-F4     | 3     |
| 11    | 10         | —         | 3     |
| F1-F4 | 9, 10      | user okay | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `quick`, T3 → `deep`, T4 → `quick`
- **Wave 2**: 4 tasks — T5 → `unspecified-high`, T6 → `unspecified-high`, T7 → `quick`, T8 → `quick`
- **Wave 3**: 3 tasks — T9 → `quick`, T10 → `quick`, T11 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Seed update — add `hostfully_agency_uid` to VLRE tenant config

  **What to do**:
  - In `prisma/seed.ts`, add `hostfully_agency_uid: '<VLRE_AGENCY_UID>'` inside `tenant.config.guest_messaging` for the VLRE tenant (both `create` and `update` blocks)
  - The actual VLRE Hostfully agency UID value should be read from the existing standalone MVP config. Check `/Users/victordozal/repos/real-estate/vlre-employee/.env` or the `HOSTFULLY_AGENCY_UID` env var for the real value. If unavailable, use a placeholder like `'VLRE_HOSTFULLY_AGENCY_UID'` and leave a TODO comment.
  - Run `pnpm prisma db seed` to apply the seed update to the local dev database
  - Verify the config was updated: query `SELECT config FROM tenants WHERE slug = 'vlre'` and confirm `guest_messaging.hostfully_agency_uid` exists

  **Must NOT do**:
  - Do NOT remove `poll_interval_minutes` or any other existing config keys
  - Do NOT modify DozalDevs tenant config

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file edit with a known pattern — adding a key to an existing JSON config block
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 3, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:85-130` — VLRE tenant upsert with `config.guest_messaging` block. Add `hostfully_agency_uid` alongside `poll_interval_minutes`, `alert_threshold_minutes`, and `quiet_hours`.

  **External References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/.env` — Contains `HOSTFULLY_AGENCY_UID` env var with the real VLRE agency UID value
  - `/Users/victordozal/repos/real-estate/vlre-employee/scripts/register-webhook.ts:5` — Shows `HOSTFULLY_AGENCY_UID` usage

  **WHY Each Reference Matters**:
  - `seed.ts:85-130`: This is the exact location where `guest_messaging` config is defined. The new key must go in both the `create` and `update` blocks (upsert pattern). Missing either block = seed doesn't apply correctly on re-run.
  - The MVP `.env` file has the actual Hostfully agency UID for VLRE — don't invent a value, use the real one.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed update applies hostfully_agency_uid to VLRE config
    Tool: Bash
    Preconditions: Local Supabase running, ai_employee database exists
    Steps:
      1. Run: pnpm prisma db seed
      2. Run: curl -s "http://localhost:54321/rest/v1/tenants?slug=eq.vlre&select=config" -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
      3. Parse JSON response, extract config.guest_messaging.hostfully_agency_uid
    Expected Result: The field exists and contains a non-empty string value
    Failure Indicators: Field is missing, null, or empty; seed command fails
    Evidence: .sisyphus/evidence/task-1-seed-update.json

  Scenario: Existing config keys preserved after seed update
    Tool: Bash
    Preconditions: Seed has been run
    Steps:
      1. Query VLRE tenant config as above
      2. Verify config.guest_messaging.poll_interval_minutes === 30
      3. Verify config.guest_messaging.alert_threshold_minutes === 30
      4. Verify config.guest_messaging.quiet_hours exists with start, end, timezone
    Expected Result: All existing keys preserved, new hostfully_agency_uid key added
    Failure Indicators: Any existing key missing or value changed
    Evidence: .sisyphus/evidence/task-1-config-preserved.json
  ```

  **Commit**: YES (group with Task 3)
  - Message: `chore(seed): add hostfully_agency_uid to VLRE tenant config`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Zod schema + types for HostfullyWebhookPayload

  **What to do**:
  - Add a `HostfullyWebhookPayloadSchema` Zod schema to `src/gateway/validation/schemas.ts`
  - Required fields: `agency_uid` (string, non-empty), `event_type` (string, non-empty), `message_uid` (string, non-empty), `thread_uid` (string, non-empty)
  - Optional fields: `lead_uid` (string), `property_uid` (string), `message_content` (string), `created` (string), `type` (string), `status` (string)
  - Use `.passthrough()` — don't reject unknown fields (Hostfully may add new fields)
  - Export a `parseHostfullyWebhook(body: unknown)` function following the `parseJiraWebhook` pattern
  - Export the inferred TypeScript type: `export type HostfullyWebhookPayload = z.infer<typeof HostfullyWebhookPayloadSchema>`

  **Must NOT do**:
  - Do NOT add HMAC signature validation
  - Do NOT modify existing schemas

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding a Zod schema to an existing file — straightforward type definition work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/validation/schemas.ts` — Contains existing Zod schemas (`parseJiraWebhook`, `parseJiraIssueDeletion`, `TriggerEmployeeParamsSchema`). Follow the same export and naming conventions.

  **API/Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/hostfully-client/types.ts:1-12` — The proven `HostfullyWebhookPayload` interface. Use this as the source of truth for field names and types.

  **WHY Each Reference Matters**:
  - `schemas.ts`: This is where ALL Zod validation lives. Adding the schema here keeps the pattern consistent and makes it importable by the route handler.
  - The MVP types file has the exact field names Hostfully sends — don't guess, copy them.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Valid payload parses successfully
    Tool: Bash (node REPL)
    Preconditions: pnpm build succeeds
    Steps:
      1. Import parseHostfullyWebhook from the built module
      2. Call with: { agency_uid: "ag-1", event_type: "NEW_INBOX_MESSAGE", message_uid: "msg-1", thread_uid: "th-1" }
      3. Assert it returns the parsed object without throwing
    Expected Result: Parsed object with all 4 required fields
    Failure Indicators: Throws ZodError
    Evidence: .sisyphus/evidence/task-2-valid-parse.txt

  Scenario: Missing required field throws ZodError
    Tool: Bash (node REPL)
    Preconditions: pnpm build succeeds
    Steps:
      1. Import parseHostfullyWebhook
      2. Call with: { event_type: "NEW_INBOX_MESSAGE" } (missing agency_uid, message_uid, thread_uid)
      3. Assert it throws ZodError with issues for missing fields
    Expected Result: ZodError thrown with issues array containing paths for missing fields
    Failure Indicators: Does not throw, or throws non-ZodError
    Evidence: .sisyphus/evidence/task-2-invalid-parse.txt

  Scenario: Extra fields pass through
    Tool: Bash (node REPL)
    Preconditions: pnpm build succeeds
    Steps:
      1. Call parseHostfullyWebhook with valid fields plus { extra_field: "hello" }
      2. Assert the returned object includes extra_field
    Expected Result: Object contains extra_field: "hello"
    Failure Indicators: extra_field stripped or error thrown
    Evidence: .sisyphus/evidence/task-2-passthrough.txt
  ```

  **Commit**: YES (group with Task 3)
  - Message: `feat(gateway): add Hostfully webhook route for guest messaging (GM-22)`
  - Files: `src/gateway/validation/schemas.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Webhook route handler — `POST /webhooks/hostfully`

  **What to do**:
  - Create `src/gateway/routes/hostfully.ts` following the Router factory pattern from `jira.ts`
  - Export `hostfullyRoutes(opts: HostfullyRouteOptions): Router` with `HostfullyRouteOptions { inngestClient?: InngestLike; prisma?: PrismaClient }`
  - Handler flow for `POST /webhooks/hostfully`:
    1. Parse body with `parseHostfullyWebhook()` — on ZodError, return 400
    2. If `event_type !== 'NEW_INBOX_MESSAGE'`, return `200 { ok: true, ignored: true }`
    3. Validate `message_uid` is non-empty (should be caught by Zod, but belt-and-suspenders)
    4. Resolve tenant: query all tenants, find one where `config.guest_messaging.hostfully_agency_uid === payload.agency_uid`. If no match, log warning and return `200 { ok: true, tenant_not_found: true }` (200, NOT 4xx — Hostfully retries on non-2xx)
    5. Look up archetype: `prisma.archetype.findUnique({ where: { tenant_id_role_name: { tenant_id, role_name: 'guest-messaging' } } })`. If missing, log error and return `200 { ok: true, archetype_not_found: true }`
    6. Create task with Prisma: `prisma.task.create({ data: { archetype_id, external_id: 'hostfully-msg-{message_uid}', source_system: 'hostfully', status: 'Ready', tenant_id, input_payload: { thread_uid, message_uid, lead_uid, property_uid } } })`. Wrap in try/catch — if Prisma throws unique constraint violation (P2002), return `200 { ok: true, duplicate: true }`.
    7. Fire Inngest event: `inngest.send({ name: 'employee/task.dispatched', data: { taskId: task.id, archetypeId: archetype.id }, id: 'hostfully-dispatch-hostfully-msg-{message_uid}' })`
    8. Return `200 { ok: true, task_id: task.id }`
    9. If `inngest.send()` throws, log error but still return 200 (task exists in DB for manual recovery)
  - Use `pino` logger. Log: `agency_uid`, `event_type`, `message_uid`, `thread_uid` only. NEVER log `message_content`.

  **Must NOT do**:
  - Do NOT use `createTaskAndDispatch` (requires Inngest step context)
  - Do NOT add HMAC signature verification
  - Do NOT check `pending_approvals` table
  - Do NOT modify `employee-dispatcher.ts`
  - Do NOT return non-2xx for any payload that Hostfully would retry

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core deliverable requiring careful error handling, dedup logic, tenant resolution, and multiple edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (starts in Wave 1, but depends on Tasks 1 and 2)
  - **Parallel Group**: Wave 1 (starts after Tasks 1 and 2 complete)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/gateway/routes/jira.ts` — Canonical webhook route pattern: Router factory, `JiraRouteOptions` interface, `parseJiraWebhook()` call, Prisma task creation, Inngest event fire, response shapes. Follow this structure exactly.
  - `src/gateway/services/employee-dispatcher.ts:26-81` — The dispatch pattern for Express routes: `prisma.archetype.findUnique()` → `prisma.task.create()` → `inngest.send({ name: 'employee/task.dispatched' })`. This is the pattern to replicate (NOT `createTaskAndDispatch`).
  - `/Users/victordozal/repos/real-estate/vlre-employee/src/webhook-receiver.ts:30-94` — Standalone MVP webhook handler: event_type filter, dedup check, immediate 200 response, async processing. Adapt the flow but use Express instead of Bun.serve.

  **API/Type References**:
  - `src/gateway/types.ts` — `InngestLike` interface definition. Use this type for the `inngestClient` option.
  - `src/gateway/validation/schemas.ts` — Where `parseHostfullyWebhook` will be imported from (Task 2 creates this).
  - `prisma/schema.prisma:20-52` — `Task` model fields: `archetype_id`, `external_id`, `source_system`, `status`, `tenant_id`, `input_payload`. The `@@unique([external_id, source_system, tenant_id])` constraint on line 52 — this is the dedup mechanism. Prisma throws error code `P2002` on unique violation.

  **External References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/hostfully-client/types.ts:1-12` — `HostfullyWebhookPayload` type definition showing all fields Hostfully sends.

  **WHY Each Reference Matters**:
  - `jira.ts`: The route structure (factory, options, handler) must be identical. Deviate = inconsistency.
  - `employee-dispatcher.ts`: Shows the correct way to create a task + fire Inngest from Express (not from Inngest step). The archetype lookup by `tenant_id_role_name` composite key is critical.
  - `schema.prisma:52`: The `@@unique` constraint means Prisma will throw `P2002` on duplicate `(external_id, source_system, tenant_id)`. Catch this error code specifically, don't do a SELECT first.
  - MVP `webhook-receiver.ts`: The proven flow — but must be adapted (Bun → Express, file dedup → DB dedup).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Valid NEW_INBOX_MESSAGE creates task and fires Inngest event
    Tool: Bash (curl)
    Preconditions: Services running (pnpm dev:start), VLRE tenant seeded with hostfully_agency_uid
    Steps:
      1. curl -s -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"<VLRE_AGENCY_UID>","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-msg-001","thread_uid":"test-thread-001"}'
      2. Assert HTTP status is 200
      3. Assert response body contains "ok": true and "task_id"
      4. Query tasks table: SELECT * FROM tasks WHERE external_id = 'hostfully-msg-test-msg-001' AND source_system = 'hostfully'
      5. Assert exactly 1 row exists with status = 'Ready'
    Expected Result: 200 response with task_id, task row in DB with correct fields
    Failure Indicators: Non-200 status, missing task_id in response, no task row in DB
    Evidence: .sisyphus/evidence/task-3-valid-webhook.json

  Scenario: Duplicate message_uid returns 200 with duplicate flag
    Tool: Bash (curl)
    Preconditions: Previous scenario completed (test-msg-001 already processed)
    Steps:
      1. curl -s -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"<VLRE_AGENCY_UID>","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-msg-001","thread_uid":"test-thread-001"}'
      2. Assert HTTP status is 200
      3. Assert response body contains "duplicate": true
      4. Query tasks: SELECT count(*) FROM tasks WHERE external_id = 'hostfully-msg-test-msg-001'
      5. Assert count is exactly 1 (no second task created)
    Expected Result: 200 with duplicate flag, still only 1 task in DB
    Failure Indicators: Non-200 status, second task created, error response
    Evidence: .sisyphus/evidence/task-3-duplicate-webhook.json

  Scenario: Non-NEW_INBOX_MESSAGE event returns 200 with ignored flag
    Tool: Bash (curl)
    Preconditions: Services running
    Steps:
      1. curl -s -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"<VLRE_AGENCY_UID>","event_type":"BOOKING_CONFIRMED","message_uid":"test-msg-002","thread_uid":"test-thread-002"}'
      2. Assert HTTP status is 200
      3. Assert response body contains "ignored": true
      4. Query: SELECT count(*) FROM tasks WHERE external_id = 'hostfully-msg-test-msg-002'
      5. Assert count is 0
    Expected Result: 200, no task created
    Failure Indicators: Non-200 status, task created for non-message event
    Evidence: .sisyphus/evidence/task-3-ignored-event.json

  Scenario: Unknown agency_uid returns 200 (not 4xx)
    Tool: Bash (curl)
    Preconditions: Services running
    Steps:
      1. curl -s -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"unknown-agency-xyz","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-msg-003","thread_uid":"test-thread-003"}'
      2. Assert HTTP status is 200 (NOT 404 or 401)
      3. Assert response body contains "tenant_not_found": true
      4. Query: SELECT count(*) FROM tasks WHERE external_id = 'hostfully-msg-test-msg-003'
      5. Assert count is 0
    Expected Result: 200 response, no task created, warning logged
    Failure Indicators: Non-200 status, task created for unknown agency
    Evidence: .sisyphus/evidence/task-3-unknown-agency.json

  Scenario: Malformed payload returns 400
    Tool: Bash (curl)
    Preconditions: Services running
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"event_type":"NEW_INBOX_MESSAGE"}'
      2. Assert HTTP status is 400
      3. Assert response contains error details about missing fields
    Expected Result: 400 with validation error details
    Failure Indicators: 200 or 500 status
    Evidence: .sisyphus/evidence/task-3-malformed-payload.json
  ```

  **Commit**: YES (group with Tasks 1, 2)
  - Message: `feat(gateway): add Hostfully webhook route for guest messaging (GM-22)`
  - Files: `src/gateway/routes/hostfully.ts`, `src/gateway/validation/schemas.ts`, `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Webhook registration script

  **What to do**:
  - Create `src/worker-tools/hostfully/register-webhook.ts` — a CLI script that registers the `NEW_INBOX_MESSAGE` webhook with Hostfully's API
  - Port the logic from `/Users/victordozal/repos/real-estate/vlre-employee/scripts/register-webhook.ts`
  - Env vars: `HOSTFULLY_API_KEY` (required), `HOSTFULLY_AGENCY_UID` (required), `HOSTFULLY_API_URL` (optional, default `https://api.hostfully.com/api/v3.2`), `WEBHOOK_PUBLIC_URL` (required — the gateway's public URL)
  - Flow:
    1. Validate env vars, exit with error if missing
    2. Call `GET /webhooks?agencyUid={agencyUid}` with `X-HOSTFULLY-APIKEY` header
    3. Check if `NEW_INBOX_MESSAGE` webhook already exists for the same callback URL → log "already registered" and exit
    4. Call `POST /webhooks` with `{ agencyUid, eventType: 'NEW_INBOX_MESSAGE', callbackUrl: '{WEBHOOK_PUBLIC_URL}/webhooks/hostfully', webhookType: 'POST_JSON', objectUid: agencyUid }`
    5. Log the webhook UID and callback URL on success
  - Self-contained — do NOT create a reusable client library. Inline the HTTP calls using `fetch()`.
  - Follow existing worker-tool patterns: `--help` flag support, stderr for errors, stdout for results

  **Must NOT do**:
  - Do NOT create `src/lib/hostfully-client.ts` — keep the script self-contained
  - Do NOT add this script to any automated pipeline — it's a one-time manual operation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Self-contained script, mostly porting from existing MVP code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/scripts/register-webhook.ts` — The proven registration script. Port the logic, adapting from Bun globals to Node.js `fetch()`.
  - `src/worker-tools/hostfully/send-message.ts:100-130` — Existing worker-tool CLI pattern: `--help` flag, env var validation, stderr for errors, exit codes. Follow this convention.
  - `src/worker-tools/hostfully/validate-env.ts` — Shows the standard env var validation pattern for Hostfully tools.

  **API/Type References**:
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/hostfully-client/client.ts:303-329` — `listWebhooks()` and `registerWebhook()` API methods showing exact Hostfully API endpoints and request/response shapes.
  - `/Users/victordozal/repos/real-estate/vlre-employee/skills/hostfully-client/types.ts:127-145` — `HostfullyWebhookRegistrationRequest` and `HostfullyWebhookRegistrationResponse` types.

  **WHY Each Reference Matters**:
  - The MVP script is battle-tested and works. Port it, don't reinvent.
  - The worker-tool pattern (`--help`, env validation, exit codes) must be followed for consistency.
  - The API client code shows exact endpoint paths and auth headers — don't guess the Hostfully API shape.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Script shows help with --help flag
    Tool: Bash
    Preconditions: pnpm build succeeds
    Steps:
      1. Run: node dist/worker-tools/hostfully/register-webhook.mjs --help
      2. Assert exit code is 0
      3. Assert stdout contains usage information mentioning HOSTFULLY_API_KEY, HOSTFULLY_AGENCY_UID, WEBHOOK_PUBLIC_URL
    Expected Result: Help text displayed, exit 0
    Failure Indicators: Non-zero exit code, no help text
    Evidence: .sisyphus/evidence/task-4-help-flag.txt

  Scenario: Script errors on missing env vars
    Tool: Bash
    Preconditions: No HOSTFULLY_API_KEY set
    Steps:
      1. Run: HOSTFULLY_API_KEY= HOSTFULLY_AGENCY_UID= WEBHOOK_PUBLIC_URL= node dist/worker-tools/hostfully/register-webhook.mjs
      2. Assert exit code is non-zero
      3. Assert stderr contains error about missing env vars
    Expected Result: Non-zero exit, clear error message
    Failure Indicators: Exit 0, no error message
    Evidence: .sisyphus/evidence/task-4-missing-env.txt
  ```

  **Commit**: YES
  - Message: `feat(worker-tools): add Hostfully webhook registration script`
  - Files: `src/worker-tools/hostfully/register-webhook.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Unit tests for webhook route

  **What to do**:
  - Create `tests/gateway/routes/hostfully.test.ts` following the `tests/gateway/routes/jira.test.ts` pattern
  - Use a `makeApp(overrides)` factory that creates an Express app with mocked Prisma and optional Inngest mock
  - Test cases (minimum):
    1. Valid `NEW_INBOX_MESSAGE` → 200, response contains `ok: true` and `task_id`
    2. Non-`NEW_INBOX_MESSAGE` event type → 200, response contains `ignored: true`, no Prisma calls
    3. Missing required fields (no `agency_uid`) → 400 with ZodError details
    4. Empty `message_uid` → 400
    5. Unknown `agency_uid` (tenant not found) → 200, response contains `tenant_not_found: true`
    6. Duplicate `message_uid` (Prisma throws P2002) → 200, response contains `duplicate: true`
    7. Archetype not found → 200, response contains `archetype_not_found: true`
    8. `inngest.send()` failure → still 200 (task exists in DB)
    9. Inngest client not injected (undefined) → 200 (task created, no event fired — graceful degradation)
    10. Verify `inngest.send()` called with correct event name and payload structure
  - Mock Prisma inline: `{ tenant: { findMany: vi.fn() }, archetype: { findUnique: vi.fn() }, task: { create: vi.fn() } } as never`
  - Mock Inngest: `{ send: vi.fn().mockResolvedValue({ ids: ['mock-id'] }) }`
  - For dedup test: mock `task.create` to throw `{ code: 'P2002' }` (Prisma unique constraint error)

  **Must NOT do**:
  - Do NOT use real database — these are unit tests with mocked Prisma
  - Do NOT test `message_content` logging (can't assert log output easily)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 10+ test cases requiring careful mocking of Prisma error codes and Inngest
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `tests/gateway/routes/jira.test.ts` — **Primary template**: `makeApp()` factory, `supertest` usage, mocked Prisma as inline object, `beforeEach(() => vi.clearAllMocks())`. Copy this structure.
  - `tests/gateway/routes/admin-employee-trigger.test.ts` — Shows how to mock services with `vi.mock()` for module-level mocking if needed.

  **Test References**:
  - `tests/gateway/inngest-send.test.ts` — How to spy on `InngestLike.send` and assert on `mock.calls[0][0]` for event name and payload.
  - `tests/inngest/triggers/guest-message-poller.test.ts` — Shows the `vi.hoisted()` + `vi.mock()` pattern for mocking `createTaskAndDispatch`. Not needed here (we don't use it), but shows the mocking convention.

  **WHY Each Reference Matters**:
  - `jira.test.ts`: This is the file to copy. Same structure, same patterns, different route.
  - `inngest-send.test.ts`: Shows how to assert the exact event name (`employee/task.dispatched`) and payload `{ taskId, archetypeId }` are correct.

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/routes/hostfully.test.ts` passes all tests
  - [ ] Minimum 10 test cases covering all listed scenarios

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All unit tests pass
    Tool: Bash
    Preconditions: Tasks 2, 3 completed
    Steps:
      1. Run: pnpm test -- --run tests/gateway/routes/hostfully.test.ts
      2. Assert exit code is 0
      3. Assert output shows ≥10 passing tests
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure, exit code non-zero
    Evidence: .sisyphus/evidence/task-5-unit-tests.txt
  ```

  **Commit**: YES (group with Task 6)
  - Message: `test(gateway): add unit and integration tests for Hostfully webhook`
  - Files: `tests/gateway/routes/hostfully.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/routes/hostfully.test.ts`

- [x] 6. Integration tests for webhook route

  **What to do**:
  - Create `tests/gateway/hostfully-webhook.test.ts` following `tests/gateway/jira-webhook.test.ts` pattern
  - Use `createTestApp` + real test database (`ai_employee_test`) + `cleanupTestData`
  - Test cases (minimum):
    1. Happy path: POST valid payload → 200, verify task row exists in DB with correct `external_id`, `source_system: 'hostfully'`, `status: 'Ready'`, correct `archetype_id`
    2. Dedup: POST same payload twice → first creates task, second returns `duplicate: true`, only 1 task row exists
    3. Full response shape: verify all response fields match expected structure
    4. Inngest event verification: assert `inngestMock.send` was called with `name: 'employee/task.dispatched'` and correct `taskId` + `archetypeId`
  - Import `inngestMock` from `tests/setup.ts` or create a spy version with `vi.fn()`
  - Use `getPrisma()` to query DB directly for assertions
  - `cleanupTestData()` in `afterEach` to reset between tests

  **Must NOT do**:
  - Do NOT test against Inngest dev server (mock it)
  - Do NOT start real Fly.io workers

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration tests require careful DB setup/teardown and understanding of test helpers
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1, 3, 7

  **References**:

  **Pattern References**:
  - `tests/gateway/jira-webhook.test.ts` — **Primary template**: `createTestApp`, `cleanupTestData`, `inngestMock`, real DB assertions with `getPrisma()`. Copy this structure.
  - `tests/setup.ts` — Shared test utilities: `TestApp`, `createTestApp()`, `inngestMock`, `cleanupTestData()`, `getPrisma()`, `disconnectPrisma()`. Import all from here.
  - `tests/gateway/seed-guest-messaging.test.ts` — Integration test for guest-messaging dispatch flow. Shows how to verify archetype lookup + task creation + Inngest event in the test DB.

  **WHY Each Reference Matters**:
  - `jira-webhook.test.ts`: Shows the exact lifecycle: `createTestApp` → inject request → assert DB state → `cleanupTestData`. Must follow this for DB consistency.
  - `setup.ts`: Contains all shared utilities. Don't reinvent test infrastructure.
  - `seed-guest-messaging.test.ts`: Confirms the guest-messaging archetype is seeded in the test DB and shows how to assert against it.

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run tests/gateway/hostfully-webhook.test.ts` passes all tests
  - [ ] Tests verify actual DB rows, not just HTTP responses

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Integration tests pass against test database
    Tool: Bash
    Preconditions: Test DB setup (pnpm test:db:setup)
    Steps:
      1. Run: pnpm test -- --run tests/gateway/hostfully-webhook.test.ts
      2. Assert exit code is 0
      3. Assert output shows ≥4 passing tests
    Expected Result: All integration tests pass
    Failure Indicators: DB connection errors, test failures, seed data missing
    Evidence: .sisyphus/evidence/task-6-integration-tests.txt
  ```

  **Commit**: YES (group with Task 5)
  - Message: `test(gateway): add unit and integration tests for Hostfully webhook`
  - Files: `tests/gateway/hostfully-webhook.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/hostfully-webhook.test.ts`

- [x] 7. Register route in server.ts + .env.example update

  **What to do**:
  - In `src/gateway/server.ts`:
    1. Add import: `import { hostfullyRoutes } from './routes/hostfully.js';`
    2. Add route registration after the `jiraRoutes` line (~line 154): `app.use(hostfullyRoutes({ inngestClient: options.inngestClient, prisma }));`
  - In `.env.example`:
    1. Add `HOSTFULLY_API_KEY=` if not already present (for the registration script and worker tools)
    2. Add `HOSTFULLY_AGENCY_UID=` if not already present
    3. Add `WEBHOOK_PUBLIC_URL=` if not already present (for the registration script)
  - Verify `pnpm build` still succeeds after the import

  **Must NOT do**:
  - Do NOT modify any other route registrations
  - Do NOT add middleware to the route (no auth, no HMAC)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small edits — one import + one `app.use()` line, plus env var additions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: Tasks 6, 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts:7-16` — Import block for all route modules. Add the new import here.
  - `src/gateway/server.ts:153-164` — Route registration block. Add `hostfullyRoutes` between `jiraRoutes` and `githubRoutes`.

  **WHY Each Reference Matters**:
  - The import and registration must follow the exact pattern (options injection with `inngestClient` + `prisma`). Getting this wrong means the route is silently unregistered.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Route is accessible after registration
    Tool: Bash (curl)
    Preconditions: pnpm build succeeds, services running
    Steps:
      1. curl -s -w "%{http_code}" -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{}'
      2. Assert HTTP status is NOT 404 (route is registered — it may return 400 for empty body)
    Expected Result: Status is 400 (payload validation) not 404 (route missing)
    Failure Indicators: 404 status means route not registered
    Evidence: .sisyphus/evidence/task-7-route-registered.txt

  Scenario: .env.example has required env vars
    Tool: Bash
    Steps:
      1. grep HOSTFULLY_API_KEY .env.example
      2. grep HOSTFULLY_AGENCY_UID .env.example
      3. grep WEBHOOK_PUBLIC_URL .env.example
    Expected Result: All three present
    Failure Indicators: Any grep returns empty
    Evidence: .sisyphus/evidence/task-7-env-example.txt
  ```

  **Commit**: YES (group with Tasks 1, 2, 3)
  - Message: `feat(gateway): add Hostfully webhook route for guest messaging (GM-22)`
  - Files: `src/gateway/server.ts`, `.env.example`
  - Pre-commit: `pnpm build`

- [x] 8. Build + lint + test verification

  **What to do**:
  - Run `pnpm build` — assert exit 0
  - Run `pnpm test -- --run` — assert all tests pass (existing + new). Note: pre-existing failures in `container-boot.test.ts` and `inngest-serve.test.ts` are expected and should be ignored if they fail.
  - If any NEW test failures appear, investigate and fix before proceeding
  - Run `pnpm lint` if configured — assert no new lint errors

  **Must NOT do**:
  - Do NOT fix pre-existing test failures (see AGENTS.md)
  - Do NOT skip failing tests with `.skip` — fix the root cause

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands and verifying output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — sequential gate
  - **Parallel Group**: Sequential (after Wave 2 tasks complete)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Lists pre-existing test failures to ignore: `container-boot.test.ts`, `inngest-serve.test.ts`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code is 0
    Expected Result: Clean build, no errors
    Failure Indicators: TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-8-build.txt

  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code is 0 (or only pre-existing failures)
      3. Count new test files' results — all must pass
    Expected Result: All new tests pass, no regressions
    Failure Indicators: New test failures
    Evidence: .sisyphus/evidence/task-8-tests.txt
  ```

  **Commit**: NO (verification gate, no files changed)

- [x] 9. Remove guest-message-poller (file + registration + tests)

  **What to do**:
  - Delete `src/inngest/triggers/guest-message-poller.ts`
  - Delete `tests/inngest/triggers/guest-message-poller.test.ts`
  - In `src/gateway/inngest/serve.ts`:
    1. Remove the import: `import { createGuestMessagePollerTrigger } from '../../inngest/triggers/guest-message-poller.js';`
    2. Remove the variable: `const guestMessagePollerFn = createGuestMessagePollerTrigger(inngest);`
    3. Remove `guestMessagePollerFn` from the `functions` array in `serve()`
  - **Before deleting**: Use `grep -r "guest-message-poller" src/` to verify no other files import or reference it. If any references found beyond `serve.ts`, update those too.
  - After deletion: run `pnpm build` to verify no broken imports
  - After deletion: run `grep -r "guest-message-poller" src/` to verify 0 results

  **Must NOT do**:
  - Do NOT comment out the code — delete it entirely
  - Do NOT create a "disabled" version
  - Do NOT modify `createTaskAndDispatch` or any other shared utility

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + 3 line removals from serve.ts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts:12,37,52` — The three lines referencing `guestMessagePollerFn`: import (line 12), creation (line 37), registration in functions array (line 52). All three must be removed.
  - `src/inngest/triggers/guest-message-poller.ts` — The file to delete.
  - `tests/inngest/triggers/guest-message-poller.test.ts` — The test file to delete.

  **WHY Each Reference Matters**:
  - `serve.ts` has 3 references — missing any one will cause a build error (dangling import) or a runtime error (undefined function in array).
  - The `grep -r` verification is critical — other files may reference the poller (e.g., docs, comments, test helpers).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Poller fully removed from codebase
    Tool: Bash
    Steps:
      1. Run: grep -r "guest-message-poller" src/
      2. Assert output is empty (0 results)
      3. Run: ls src/inngest/triggers/guest-message-poller.ts 2>&1
      4. Assert file does not exist
      5. Run: ls tests/inngest/triggers/guest-message-poller.test.ts 2>&1
      6. Assert file does not exist
    Expected Result: No references in src/, both files deleted
    Failure Indicators: Any grep matches, files still exist
    Evidence: .sisyphus/evidence/task-9-poller-removed.txt

  Scenario: Build succeeds after poller removal
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code is 0
      3. Run: pnpm test -- --run
      4. Assert no new failures (pre-existing exceptions allowed)
    Expected Result: Clean build and test pass
    Failure Indicators: Import errors, test failures related to poller
    Evidence: .sisyphus/evidence/task-9-build-after-removal.txt
  ```

  **Commit**: YES
  - Message: `refactor(inngest): remove guest-message-poller cron (replaced by webhook)`
  - Files: `src/inngest/triggers/guest-message-poller.ts` (deleted), `src/gateway/inngest/serve.ts`, `tests/inngest/triggers/guest-message-poller.test.ts` (deleted)
  - Pre-commit: `pnpm build && pnpm test -- --run`

- [x] 10. Update story-map doc to mark GM-22 complete

  **What to do**:
  - In `docs/planning/2026-04-21-2202-phase1-story-map.md`, find the GM-22 section
  - Mark all acceptance criteria checkboxes as checked: `- [x]`
  - This means changing `- [ ]` to `- [x]` for each of the 11 acceptance criteria items listed under GM-22

  **Must NOT do**:
  - Do NOT modify any other stories in the doc
  - Do NOT add new stories
  - Do NOT reorganize the document

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple checkbox toggle in a markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `docs/planning/2026-04-21-2202-phase1-story-map.md` — Find the GM-22 section (search for "GM-22"). The acceptance criteria are the `- [ ]` items under the "Acceptance Criteria" heading.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GM-22 acceptance criteria all checked
    Tool: Bash
    Steps:
      1. grep -c "\- \[x\]" docs/planning/2026-04-21-2202-phase1-story-map.md (count checked items in GM-22 section)
      2. grep -A 20 "GM-22" docs/planning/2026-04-21-2202-phase1-story-map.md | grep -c "\- \[ \]"
      3. Assert no unchecked items remain in GM-22 section
    Expected Result: All GM-22 acceptance criteria are [x]
    Failure Indicators: Any [ ] remains in GM-22 section
    Evidence: .sisyphus/evidence/task-10-story-map-updated.txt
  ```

  **Commit**: YES
  - Message: `docs(planning): mark GM-22 complete in story map`
  - Files: `docs/planning/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

- [x] 11. Notify completion via Telegram

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ gm22-hostfully-webhook-trigger complete — All tasks done. Come back to review results."`
  - This is the mandatory completion notification per AGENTS.md rules.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — must be last
  - **Parallel Group**: Sequential (after Task 10)
  - **Blocks**: —
  - **Blocked By**: Task 10

  **References**:
  - `scripts/telegram-notify.ts` — The notification script
  - `AGENTS.md` — Telegram notification rules

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ gm22-hostfully-webhook-trigger complete — All tasks done. Come back to review results."
      2. Assert exit code is 0
    Expected Result: Notification sent successfully
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-11-telegram-sent.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify no `message_content` appears in any log statement.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start services with `pnpm dev:start`. Execute ALL 6 curl-based acceptance criteria from the Definition of Done section. Capture response bodies as evidence. Test rapid-fire: send 3 webhooks with different `message_uid` values in 1 second — verify 3 tasks created. Send 2 webhooks with same `message_uid` — verify exactly 1 task. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Rapid-fire [PASS/FAIL] | Dedup [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Verify no modifications to: `employee-dispatcher.ts`, `pending_approvals`, guest-messaging archetype, any HMAC verification added. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Creep [CLEAN/N issues] | Forbidden [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                     | Files                                                                                                                                                     | Pre-commit                         |
| ------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1      | `feat(gateway): add Hostfully webhook route for guest messaging (GM-22)`    | `src/gateway/routes/hostfully.ts`, `src/gateway/validation/schemas.ts`, `src/gateway/server.ts`                                                           | `pnpm build`                       |
| 2      | `feat(worker-tools): add Hostfully webhook registration script`             | `src/worker-tools/hostfully/register-webhook.ts`                                                                                                          | `pnpm build`                       |
| 3      | `chore(seed): add hostfully_agency_uid to VLRE tenant config`               | `prisma/seed.ts`                                                                                                                                          | `pnpm build`                       |
| 4      | `test(gateway): add unit and integration tests for Hostfully webhook`       | `tests/gateway/routes/hostfully.test.ts`, `tests/gateway/hostfully-webhook.test.ts`                                                                       | `pnpm test -- --run`               |
| 5      | `refactor(inngest): remove guest-message-poller cron (replaced by webhook)` | `src/inngest/triggers/guest-message-poller.ts` (deleted), `src/gateway/inngest/serve.ts`, `tests/inngest/triggers/guest-message-poller.test.ts` (deleted) | `pnpm build && pnpm test -- --run` |
| 6      | `docs(planning): mark GM-22 complete in story map`                          | `docs/planning/2026-04-21-2202-phase1-story-map.md`                                                                                                       | —                                  |

---

## Success Criteria

### Verification Commands

```bash
# Build succeeds
pnpm build                    # Expected: exit 0

# All tests pass
pnpm test -- --run            # Expected: all pass (existing + new)

# Poller is gone
grep -r "guest-message-poller" src/   # Expected: 0 results

# Valid webhook → task created
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"VLRE_AGENCY_UID","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-001","thread_uid":"thread-001"}'
# Expected: 200

# Ignored event type → 200, no task
curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"VLRE_AGENCY_UID","event_type":"BOOKING_CONFIRMED","message_uid":"test-002","thread_uid":"thread-002"}'
# Expected: 200, body contains "ignored"

# Duplicate → 200, deduped
curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"VLRE_AGENCY_UID","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-001","thread_uid":"thread-001"}'
# Expected: 200, body contains "duplicate"
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Poller completely removed
- [ ] Story map updated
