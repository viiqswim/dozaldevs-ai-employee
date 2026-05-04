# Guest-Messaging: Webhook-Driven Processing + Shell Tool Checklist

## TL;DR

> **Quick Summary**: Change the guest-messaging employee from "poll all unresponded messages" to "process the specific inbound message identified by the Hostfully webhook." Each webhook = one task = one message = one reply.
>
> **Deliverables**:
>
> - `get-messages.ts` with new `--lead-id` flag for targeted thread fetch
> - Gateway validation requiring `lead_uid` on `NEW_INBOX_MESSAGE` webhooks
> - Rewritten archetype instructions referencing specific thread UIDs from webhook
> - Shell tool checklist doc (`docs/2026-05-04-1645-adding-a-shell-tool.md`) + AGENTS.md reference
> - Mock convention for Hostfully tools (`HOSTFULLY_MOCK=true` + fixture files) — platform-wide test infrastructure
> - E2E verification via simulated webhook with mock mode → Slack approval card
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (tool) → Task 5 (mock) → Task 6 (seed + build) → Task 7 (E2E)

---

## Context

### Original Request

The guest-messaging system currently ignores the webhook payload data. When a Hostfully `NEW_INBOX_MESSAGE` webhook fires, the worker independently polls ALL unresponded messages across all leads for the property, processing whatever it finds. The webhook's `thread_uid`, `message_uid`, `lead_uid`, and `property_uid` are stored in `raw_event` but never reach the model.

The user wants the system to process ONLY the specific inbound message identified by the webhook payload. Each webhook = one task = one reply. No polling.

Additionally, a shell tool checklist document is needed — no such onboarding guide exists for engineers adding new tools to `src/worker-tools/`.

### Interview Summary

**Key Discussions**:

- Confirmed: model still needs to call Hostfully API (webhook has UIDs, not message text), but scoped to the specific thread
- Confirmed: 1:1 mapping — each webhook triggers one task, processes one message, drafts one reply
- Confirmed: parallel webhooks for different leads run as parallel tasks (concurrency_limit: 5 already exists)

**Research Findings**:

- The lifecycle (employee-lifecycle.ts:179-184) ALREADY extracts `THREAD_UID`, `MESSAGE_UID`, `LEAD_UID`, `PROPERTY_UID` from `raw_event` and injects them as env vars into the container. The plumbing is complete — the harness and instructions just don't use these env vars yet.
- `get-messages.ts` has NO `--lead-id` flag — it always fetches ALL leads for a property. This is the primary tool gap.
- `send-message.ts` already accepts `--lead-id` + `--thread-id`. No change needed.
- `post-guest-approval.ts` already accepts all three UIDs. No change needed.
- The harness needs NO code changes — env vars flow from container → OpenCode → shell commands naturally. The instructions just need to reference `$LEAD_UID` instead of `$PROPERTY_UID`.
- `lead_uid` is OPTIONAL in the webhook Zod schema — must be addressed.
- The `*/5 * * * *` cron on the archetype's `trigger_sources` is dead metadata (no Inngest function reads it). Harmless.

### Metis Review

**Identified Gaps** (addressed):

- **`lead_uid` optionality**: Must add validation in route handler requiring `lead_uid` for `NEW_INBOX_MESSAGE` events, returning 400 if absent. Cleanest boundary enforcement.
- **Already-responded guard**: Model needs explicit instruction to check if the last message in the thread is from a guest before drafting a reply. Prevents false positives when PM already responded directly in Hostfully.
- **Loop language in instructions**: All 6 steps must be audited to remove "For each unresponded message thread" iteration language.
- **Output shape contract**: The new `--lead-id` path in `get-messages.ts` must return `ThreadSummary[]` (array of one element) — same shape as existing output.

---

## Work Objectives

### Core Objective

Switch guest-messaging from "poll all unresponded messages" to "process the specific message thread identified by the webhook payload."

### Concrete Deliverables

- `src/worker-tools/hostfully/get-messages.ts` — new `--lead-id` flag
- `src/gateway/routes/hostfully.ts` — `lead_uid` required for `NEW_INBOX_MESSAGE`
- `prisma/seed.ts` — rewritten `VLRE_GUEST_MESSAGING_INSTRUCTIONS`
- `docs/2026-05-04-1645-adding-a-shell-tool.md` — 8-step checklist for adding new shell tools
- `AGENTS.md` — reference to the checklist in "Adding a new employee" section + Reference Documents table
- E2E verified via simulated webhook

### Definition of Done

- [ ] Sending a simulated Hostfully webhook with `lead_uid` creates a task that processes ONLY that specific thread
- [ ] Sending a webhook WITHOUT `lead_uid` returns HTTP 400
- [ ] `get-messages.ts --lead-id <uid>` returns a single-element `ThreadSummary[]` array
- [ ] Archetype instructions reference `$LEAD_UID` (not `--property-id "$PROPERTY_UID" --unresponded-only`)
- [ ] All instruction steps use singular "the message thread" language (no loop/iteration)

### Must Have

- `--lead-id` flag on `get-messages.ts` that skips lead-fetching and calls `GET /messages?leadUid={uid}` directly
- `lead_uid` validation at gateway boundary for `NEW_INBOX_MESSAGE` events
- "Already-responded" guard in instructions: if last message is from host, return `NO_ACTION_NEEDED`
- Same `ThreadSummary[]` output shape from `--lead-id` path
- Shell tool checklist doc with 8 steps (file structure, script pattern, mock fixtures, env vars, Docker, AGENTS.md, instructions, testing) + anti-patterns table
- AGENTS.md: "Adding a new employee" step 2 links to checklist + new row in Reference Documents table
- Mock convention: `HOSTFULLY_MOCK=true` env var makes Hostfully tools return fixture data instead of calling the real API
- Fixture files for `get-messages.ts`, `get-reservations.ts`, `get-property.ts` checked into repo
- `HOSTFULLY_MOCK` added to platform env whitelist in `tenant-env-loader.ts` so it propagates to worker containers
- Docker image rebuild after changes
- E2E test via simulated webhook **with `HOSTFULLY_MOCK=true`** — exercises full path without real Hostfully data

### Must NOT Have (Guardrails)

- NO changes to `send-message.ts`, `post-guest-approval.ts`, `post-no-action-notification.ts` — confirmed working
- NO changes to `employee-lifecycle.ts` — env var injection already works
- NO changes to `opencode-harness.mts` — env vars flow naturally to shell commands
- NO changes to the `ThreadSummary` output type definition
- NO changes to the `unresponded-message-monitor` archetype or its trigger
- NO new Inngest cron function for the dead `*/5 * * * *` metadata
- NO storing `message_content` in `raw_event` (out of scope)
- NO deprecating the `unresponded-message-monitor` (separate decision)
- NO mocking Slack tools in this plan (real Slack API used for approval cards — we WANT to see the real card)
- NO mocking Sifely/lock tools (out of scope — add when needed)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after for the `--lead-id` tool flag; agent QA for E2E
- **Framework**: Vitest (bun test / pnpm test)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Tool changes**: Use Bash — run the tool with various flag combinations, assert output shape and exit codes
- **Gateway changes**: Use Bash (curl) — send webhooks, assert HTTP status codes and response bodies
- **E2E flow**: Use Bash (curl) + admin API — send webhook, poll task status, verify Slack card posted

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 4 independent changes):
├── Task 1: Add --lead-id flag to get-messages.ts [deep]
├── Task 2: Require lead_uid in webhook validation [quick]
├── Task 3: Rewrite archetype instructions in seed.ts [deep]
└── Task 4: Create shell tool checklist doc + AGENTS.md reference [quick]

Wave 2 (After Wave 1 — mock infrastructure):
└── Task 5: Add mock convention to Hostfully tools + fixtures + env propagation [deep]

Wave 3 (After Wave 2 — apply + build):
└── Task 6: Run prisma db seed + rebuild Docker image [quick]

Wave 4 (After Wave 3 — verify):
└── Task 7: E2E test via simulated webhook with HOSTFULLY_MOCK=true [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 5      | 1     |
| 2     | —          | 6      | 1     |
| 3     | —          | 6      | 1     |
| 4     | —          | —      | 1     |
| 5     | 1          | 6      | 2     |
| 6     | 2, 3, 5    | 7      | 3     |
| 7     | 6          | F1-F4  | 4     |
| F1-F4 | 7          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `deep`, T2 → `quick`, T3 → `deep`, T4 → `quick`
- **Wave 2**: 1 task — T5 → `deep`
- **Wave 3**: 1 task — T6 → `quick`
- **Wave 4**: 1 task — T7 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `--lead-id` flag to `get-messages.ts`

  **What to do**:
  - Add a `--lead-id <uid>` CLI flag to `src/worker-tools/hostfully/get-messages.ts` following the existing arg-parsing pattern (lines 72-97)
  - When `--lead-id` is provided: skip the "fetch all leads" step entirely. Go directly to `GET /messages?leadUid={uid}` (the same API call at line 215, but for a single lead instead of iterating all leads)
  - Build the same `ThreadSummary` output shape — array of one element: `[{ reservationId, guestName, channel, unresponded, messages[] }]`
  - The `guestName` and `channel` (booking channel) fields come from the lead data. When using `--lead-id`, fetch the lead details for just that one lead: `GET /leads/{leadUid}` to get the guest name and booking channel
  - `--lead-id` and `--property-id` should be mutually exclusive. If neither is provided, error with: `"Error: either --lead-id or --property-id is required"`
  - The `--unresponded-only` and `--limit` flags should still work when combined with `--lead-id`
  - Add a unit test file `tests/worker-tools/get-messages-lead-id.test.ts` that tests: (a) `--lead-id` flag is parsed correctly, (b) output shape matches `ThreadSummary[]`, (c) error when neither `--lead-id` nor `--property-id` provided. Mock the Hostfully API calls.

  **Must NOT do**:
  - Do NOT change the `ThreadSummary` type definition
  - Do NOT change the existing `--property-id` code path — it must continue working identically
  - Do NOT change `send-message.ts` or any other tool

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding the existing fetch pipeline (leads → messages → transform) and cleanly adding a parallel path
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 5 (mock convention)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts:72-97` — existing arg-parsing pattern to follow
  - `src/worker-tools/hostfully/get-messages.ts:195-240` — the `fetchMessagesForLead()` function that calls `GET /messages?leadUid={uid}` — this is what the `--lead-id` path should call directly
  - `src/worker-tools/hostfully/get-messages.ts:242-290` — the `transformToThreadSummary()` function that builds the output shape — reuse this for the `--lead-id` path

  **API/Type References**:
  - `src/worker-tools/hostfully/get-messages.ts:20-30` — `ThreadSummary` and `MessageEntry` type definitions (output contract, must not change)
  - Hostfully API: `GET /leads/{leadUid}` — returns lead details (guest name, booking channel, property UID, check-in/out dates)
  - Hostfully API: `GET /messages?leadUid={uid}` — returns messages for a specific lead

  **Test References**:
  - `tests/worker-tools/` — check for existing test patterns in this directory

  **WHY Each Reference Matters**:
  - Lines 72-97: Copy the exact arg-parsing pattern so flags are consistent (minimist-style or manual)
  - Lines 195-240: This function is the core of what `--lead-id` needs — a single call to `GET /messages?leadUid={uid}` + transform. The `--lead-id` path reuses this function directly, just calling it once instead of in a loop
  - Lines 242-290: The transform function guarantees output shape consistency — call it the same way

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — --lead-id returns single-element ThreadSummary array
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY and HOSTFULLY_AGENCY_UID env vars set
    Steps:
      1. Run: HOSTFULLY_API_KEY=$KEY tsx src/worker-tools/hostfully/get-messages.ts --lead-id "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb"
      2. Parse stdout as JSON
      3. Assert: output is an array
      4. Assert: array has exactly 1 element (or 0 if lead has no messages — valid)
      5. Assert: element has keys: reservationId, guestName, channel, unresponded, messages
      6. Assert: exit code is 0
    Expected Result: JSON array with ThreadSummary shape, exit 0
    Failure Indicators: Non-JSON output, exit code non-zero, missing keys in output
    Evidence: .sisyphus/evidence/task-1-lead-id-happy.json

  Scenario: Error — neither --lead-id nor --property-id provided
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY set
    Steps:
      1. Run: HOSTFULLY_API_KEY=$KEY tsx src/worker-tools/hostfully/get-messages.ts 2>&1
      2. Assert: stderr contains "either --lead-id or --property-id"
      3. Assert: exit code is 1
    Expected Result: Clear error message, exit code 1
    Failure Indicators: Exit code 0, no error message
    Evidence: .sisyphus/evidence/task-1-lead-id-missing-error.txt

  Scenario: --property-id path still works (regression)
    Tool: Bash
    Preconditions: HOSTFULLY_API_KEY and HOSTFULLY_AGENCY_UID set
    Steps:
      1. Run: HOSTFULLY_API_KEY=$KEY HOSTFULLY_AGENCY_UID=$UID tsx src/worker-tools/hostfully/get-messages.ts --property-id "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2" --unresponded-only
      2. Parse stdout as JSON
      3. Assert: output is an array of ThreadSummary objects
      4. Assert: exit code is 0
    Expected Result: Same behavior as before, exit 0
    Failure Indicators: Error, different output shape
    Evidence: .sisyphus/evidence/task-1-property-id-regression.json
  ```

  **Commit**: YES
  - Message: `feat(hostfully): add --lead-id flag to get-messages for targeted thread fetch`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `tests/worker-tools/get-messages-lead-id.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Require `lead_uid` on `NEW_INBOX_MESSAGE` webhooks

  **What to do**:
  - In `src/gateway/routes/hostfully.ts`, after the Zod parse succeeds and after the `event_type !== 'NEW_INBOX_MESSAGE'` early return, add a validation check: if `parsed.lead_uid` is falsy, return HTTP 400 with `{ error: "lead_uid is required for NEW_INBOX_MESSAGE events" }`
  - Do NOT change the Zod schema in `schemas.ts` — `lead_uid` stays optional in the schema (other event types may not include it). The validation is route-level, specific to `NEW_INBOX_MESSAGE`
  - Also store `message_content` in `raw_event` if present (currently in Zod schema but dropped): add `if (parsed.message_content) rawEvent.message_content = parsed.message_content` alongside the existing UID storage (lines 87-92)

  **Must NOT do**:
  - Do NOT change the Zod schema definition in `schemas.ts`
  - Do NOT change the dedup logic
  - Do NOT change the task creation logic
  - Do NOT change the tenant matching logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 5-10 lines of code, straightforward validation addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 6 (seed + build)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/routes/hostfully.ts:55-95` — the full webhook handler function showing Zod parse, event type check, tenant matching, raw_event construction, task creation

  **API/Type References**:
  - `src/gateway/validation/schemas.ts:322-335` — `HostfullyWebhookPayloadSchema` Zod definition showing `lead_uid: z.string().optional()`

  **WHY Each Reference Matters**:
  - Lines 55-95: The validation check must be inserted at exactly the right point — after the event_type check (line ~70) but before tenant matching (line ~75). Reading the full handler shows the correct insertion point.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Webhook without lead_uid returns 400
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-no-lead","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa"}'
      2. Assert: HTTP status code is 400
      3. Assert: response body contains "lead_uid is required"
    Expected Result: 400 with clear error message
    Failure Indicators: 200/201 response, task created without lead_uid
    Evidence: .sisyphus/evidence/task-2-no-lead-uid-400.txt

  Scenario: Webhook WITH lead_uid still works (regression)
    Tool: Bash (curl)
    Preconditions: Gateway running, VLRE tenant seeded
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-with-lead-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
      2. Assert: HTTP status code is 201
      3. Assert: response body contains "task_id"
    Expected Result: 201 with task_id
    Failure Indicators: 400/500 response
    Evidence: .sisyphus/evidence/task-2-with-lead-uid-201.txt
  ```

  **Commit**: YES
  - Message: `fix(gateway): require lead_uid on NEW_INBOX_MESSAGE webhooks`
  - Files: `src/gateway/routes/hostfully.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Rewrite archetype instructions for webhook-driven message processing

  **What to do**:
  - In `prisma/seed.ts`, rewrite the `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant (lines 273-389)
  - **Step 1 changes**: Replace `tsx /tools/hostfully/get-messages.ts --property-id "$PROPERTY_UID" --unresponded-only` with `tsx /tools/hostfully/get-messages.ts --lead-id "$LEAD_UID"`. Add a note at the top: "This task was triggered by a specific Hostfully webhook. Environment variables `$LEAD_UID`, `$THREAD_UID`, `$MESSAGE_UID`, and `$PROPERTY_UID` identify the specific message to process."
  - **Add "already-responded" guard in Step 1**: After fetching the thread, check if the last message in the thread is from the host (not a guest). If so, write `NO_ACTION_NEEDED: Thread already responded to. Last message is from host.` to `/tmp/summary.txt` and stop. This prevents false positives when a PM already replied directly in Hostfully.
  - **Remove all loop/iteration language**: The instructions currently say "For each unresponded message thread" in Step 2. Change to "For the message thread" (singular). Audit ALL 6 steps for any loop or "for each" phrasing.
  - **Update the empty-result handling**: Currently Step 1 says "If the output is an empty array, write NO_ACTION_NEEDED". With webhook-driven processing, an empty result likely means an API issue, not "nothing to do". Change to: "If the output is an empty array, this is unexpected — the webhook indicated a message exists. Write an error to /tmp/summary.txt and post an error notification via Step 6."
  - **Keep ALL other steps (2-6) functionally identical** — only change singular/plural language and the Step 1 tool invocation
  - **Both `create` and `update` blocks** in the archetype upsert (lines 3302-3365) must reference the new `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant — verify both use the same constant (they should already)

  **Must NOT do**:
  - Do NOT change the system prompt (`prisma/prompts/guest-messaging.ts`) — tone, format, classification rules stay the same
  - Do NOT change the `delivery_instructions` field — it already uses `send-message.ts --lead-id --thread-id` correctly
  - Do NOT change Steps 3-6 logic (classification, lock diagnosis, routing, approval posting, error handling) — only update language from plural to singular
  - Do NOT change any other archetype's instructions (summarizer, monitor, etc.)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: The instructions are a 120-line natural language script with subtle cross-references between steps. Getting the rewrite right requires understanding the full flow and ensuring no step references data that no longer exists.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 6 (seed + build)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:273-389` — `VLRE_GUEST_MESSAGING_INSTRUCTIONS` full text (the constant to rewrite)
  - `prisma/seed.ts:3302-3365` — archetype upsert that references the instructions constant

  **API/Type References**:
  - `prisma/prompts/guest-messaging.ts` — system prompt (DO NOT MODIFY, read for context only)

  **External References**:
  - `src/inngest/employee-lifecycle.ts:179-184` — env vars injected into container: `THREAD_UID`, `MESSAGE_UID`, `LEAD_UID`, `PROPERTY_UID`, `NOTIFICATION_CHANNEL`, `TASK_ID`

  **WHY Each Reference Matters**:
  - Lines 273-389: This IS the content being rewritten. Read the full text to understand cross-step dependencies.
  - Lines 3302-3365: Verify both `create` and `update` use the same constant — no orphaned instructions.
  - Lifecycle env vars: These are what the model can reference as `$LEAD_UID` etc. in shell commands. Must confirm which env vars exist.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Instructions reference $LEAD_UID, not --property-id --unresponded-only
    Tool: Bash (grep)
    Preconditions: seed.ts saved with new instructions
    Steps:
      1. grep -c "unresponded-only" prisma/seed.ts
      2. Assert: count is 0 (no references to old flag in guest-messaging instructions)
      3. grep -c "lead-id" prisma/seed.ts
      4. Assert: count is >= 1 (new flag referenced)
      5. grep -c "LEAD_UID" prisma/seed.ts
      6. Assert: count is >= 1 ($LEAD_UID env var referenced)
    Expected Result: No unresponded-only, has --lead-id and $LEAD_UID
    Failure Indicators: unresponded-only still present, --lead-id missing
    Evidence: .sisyphus/evidence/task-3-instructions-grep.txt

  Scenario: No loop/iteration language in instructions
    Tool: Bash (grep)
    Preconditions: seed.ts saved
    Steps:
      1. Extract VLRE_GUEST_MESSAGING_INSTRUCTIONS text
      2. grep -ci "for each" (in the extracted text only — not the entire seed.ts)
      3. Assert: count is 0
      4. grep -ci "each unresponded" (in the extracted text only)
      5. Assert: count is 0
    Expected Result: Zero loop/iteration language
    Failure Indicators: "for each" or "each unresponded" found
    Evidence: .sisyphus/evidence/task-3-no-loop-language.txt

  Scenario: Already-responded guard present
    Tool: Bash (grep)
    Preconditions: seed.ts saved
    Steps:
      1. grep -c "already responded\|last message.*host\|senderType.*GUEST" prisma/seed.ts
      2. Assert: count is >= 1
    Expected Result: Guard instruction present
    Failure Indicators: No mention of checking last message sender
    Evidence: .sisyphus/evidence/task-3-responded-guard.txt

  Scenario: Build succeeds with new instructions
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: Clean build
    Failure Indicators: TypeScript errors, template literal issues
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES
  - Message: `feat(guest-messaging): rewrite instructions for webhook-driven message processing`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Create shell tool checklist doc + AGENTS.md reference

  **What to do**:

  **Part A — Create `docs/2026-05-04-1645-adding-a-shell-tool.md`**:

  An 8-step checklist for adding a new shell tool to the platform:
  1. **Create the script file** — path convention: `src/worker-tools/{service}/{verb}-{noun}.ts`
  2. **Implement the standard script pattern** — `parseArgs()`, `--help`, env var validation, JSON stdout, stderr errors, exit codes, no external deps
  3. **Add mock fixture support** — `src/worker-tools/{service}/fixtures/{verb}-{noun}.json`, `{SERVICE}_MOCK=true` check at top of `main()`
  4. **Handle environment variables** — credentials from `tenant_secrets` (auto-injected), platform env whitelist for non-secrets
  5. **Docker** — bulk-copied via `COPY src/worker-tools/ /tools/`, rebuild required after changes
  6. **Document in AGENTS.md** — usage example under "OpenCode Worker" section
  7. **Reference in archetype instructions** — add tool usage to archetype's `instructions` in `prisma/seed.ts`
  8. **Test** — `--help`, mock mode, Docker rebuild, E2E trigger

  Include:
  - Quick Reference box at the top (source path, container path, execution, output format)
  - Reference implementations section pointing to `get-property.ts` (simple GET), `send-message.ts` (POST), `sifely-client.ts` (multi-action), `post-message.ts` (Block Kit)
  - Anti-patterns table (don't import from `src/lib/`, don't use CLI frameworks, don't print human-readable output, don't skip `--help`, don't forget mock fixture)

  **Part B — Update `AGENTS.md`**:

  Edit 1: In the "Adding a new employee" section (line 89), append to step 2:

  ```
  2. If shell tools needed, add TypeScript scripts to `src/worker-tools/{service}/` (copied into Docker image at `/tools/{service}/`, executed via `tsx`). Follow the [Shell Tool Checklist](docs/2026-05-04-1645-adding-a-shell-tool.md).
  ```

  Edit 2: Add a row to the Reference Documents table at the bottom of AGENTS.md:

  ```
  | `docs/2026-05-04-1645-adding-a-shell-tool.md`             | Adding a new shell tool — file structure, CLI pattern, mock fixtures, Docker, documentation |
  ```

  **Must NOT do**:
  - Do NOT rewrite any other section of AGENTS.md beyond the two targeted edits
  - Do NOT add inline checklist content to AGENTS.md (it belongs in the doc)
  - Do NOT modify any existing tool files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure documentation — one new markdown file + two small edits to AGENTS.md
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-property.ts` — canonical simple tool pattern (parseArgs, --help, env validation, JSON output)
  - `src/worker-tools/slack/post-message.ts` — complex tool with Block Kit
  - `src/worker-tools/locks/sifely-client.ts` — multi-action tool pattern
  - `AGENTS.md:86-90` — "Adding a new employee" section (edit target)
  - `AGENTS.md:600-615` — Reference Documents table (edit target)

  **WHY Each Reference Matters**:
  - The tool source files are the ground truth for what the checklist should document. Read them to verify every convention is accurate.
  - AGENTS.md sections are the exact edit targets — read to find correct insertion points.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Checklist doc exists with all 8 sections
    Tool: Bash (grep)
    Steps:
      1. test -f docs/2026-05-04-1645-adding-a-shell-tool.md && echo "EXISTS"
      2. grep -c "^### [0-9]" docs/2026-05-04-1645-adding-a-shell-tool.md
    Expected Result: File exists, contains 8 numbered sections
    Evidence: .sisyphus/evidence/task-4-doc-exists.txt

  Scenario: AGENTS.md references the checklist
    Tool: Bash (grep)
    Steps:
      1. grep "Shell Tool Checklist" AGENTS.md
      2. grep "adding-a-shell-tool" AGENTS.md
    Expected Result: Both greps return matches (link in step 2 + reference table row)
    Failure Indicators: No matches — edits were missed
    Evidence: .sisyphus/evidence/task-4-agents-reference.txt
  ```

  **Commit**: YES
  - Message: `docs: add shell tool onboarding checklist and reference from AGENTS.md`
  - Files: `docs/2026-05-04-1645-adding-a-shell-tool.md`, `AGENTS.md`

---

- [x] 5. Add mock convention to Hostfully tools + fixtures + env propagation

  **What to do**:
  - **Establish the convention**: At the top of each Hostfully tool's execution (before any API call), check `process.env.HOSTFULLY_MOCK === 'true'`. If true, read from a fixture JSON file instead of calling the real Hostfully API. Return the fixture data to stdout in the exact same format as the real API response, then exit 0.
  - **Implement in 3 tools**:
    - `src/worker-tools/hostfully/get-messages.ts` — add mock check. When `--lead-id` is used in mock mode, read from `fixtures/get-messages/{leadId}.json`, falling back to `fixtures/get-messages/default.json` if specific lead fixture doesn't exist.
    - `src/worker-tools/hostfully/get-reservations.ts` — add mock check. Read from `fixtures/get-reservations/default.json`.
    - `src/worker-tools/hostfully/get-property.ts` — add mock check. Read from `fixtures/get-property/default.json`.
  - **Create fixture files** in `src/worker-tools/hostfully/fixtures/`:
    - `get-messages/default.json` — a realistic `ThreadSummary[]` with ONE unresponded guest message. Guest name: "Test Guest", property: "Test Beach House", message: "Hi, what's the wifi password?", category suitable for classification as `NEEDS_APPROVAL`. Include 2-3 messages in the thread (a welcome from host, then a guest question) so the model has conversation context.
    - `get-reservations/default.json` — a realistic reservation array with one confirmed reservation matching the test lead. Include check-in/check-out dates, guest name, booking channel.
    - `get-property/default.json` — a realistic property object with name, address, amenities.
  - **Update env propagation**: In `src/gateway/services/tenant-env-loader.ts`, add `HOSTFULLY_MOCK` to the platform env whitelist so it propagates from the gateway process env to the worker container env.
  - **Document the convention**: Add a brief comment at the top of the first mock-enabled tool explaining the pattern for future developers.

  **Must NOT do**:
  - Do NOT add mock mode to Slack tools (we want real Slack cards in E2E)
  - Do NOT add mock mode to Sifely/lock tools (out of scope)
  - Do NOT change the output format of any tool — mock output must be identical shape to real output
  - Do NOT change any tool logic beyond the mock check at entry point

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Touches 3 tools + creates fixture data that must be realistic enough for the model to classify correctly + updates env propagation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Wave 1)
  - **Blocks**: Task 6 (seed + build)
  - **Blocked By**: Task 1 (get-messages.ts must have --lead-id before adding mock on top)

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts` — the primary tool to modify (already modified by Task 1 for --lead-id)
  - `src/worker-tools/hostfully/get-reservations.ts` — reservation fetch tool
  - `src/worker-tools/hostfully/get-property.ts` — property fetch tool
  - `src/gateway/services/tenant-env-loader.ts` — platform env whitelist (look for the existing env var list that gets forwarded to workers)

  **API/Type References**:
  - `src/worker-tools/hostfully/get-messages.ts:20-30` — `ThreadSummary` type definition (mock fixture must match this shape exactly)

  **WHY Each Reference Matters**:
  - The fixture JSON files must produce output that exactly matches the real API response shape. Read the type definitions and real API responses to create realistic fixtures.
  - The env-loader whitelist determines what env vars reach the worker. `HOSTFULLY_MOCK` must be added here or it won't propagate.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock mode returns fixture data for get-messages
    Tool: Bash
    Preconditions: Fixture files created
    Steps:
      1. Run: HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/get-messages.ts --lead-id "any-lead-id"
      2. Parse stdout as JSON
      3. Assert: output is an array with at least 1 element
      4. Assert: element has keys: reservationId, guestName, channel, unresponded, messages
      5. Assert: at least one message has sender "guest"
      6. Assert: exit code 0
    Expected Result: Fixture data returned, correct shape, exit 0
    Failure Indicators: Real API called (would fail without credentials), wrong shape
    Evidence: .sisyphus/evidence/task-4-mock-get-messages.json

  Scenario: Mock mode returns fixture data for get-reservations
    Tool: Bash
    Steps:
      1. Run: HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/get-reservations.ts --property-id "any-property-id"
      2. Parse stdout as JSON
      3. Assert: output contains reservation data with guest name, check-in, check-out
      4. Assert: exit code 0
    Expected Result: Fixture data returned, exit 0
    Evidence: .sisyphus/evidence/task-4-mock-get-reservations.json

  Scenario: Mock mode returns fixture data for get-property
    Tool: Bash
    Steps:
      1. Run: HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/get-property.ts --property-id "any-property-id"
      2. Parse stdout as JSON
      3. Assert: output contains property name
      4. Assert: exit code 0
    Expected Result: Fixture data returned, exit 0
    Evidence: .sisyphus/evidence/task-4-mock-get-property.json

  Scenario: Without HOSTFULLY_MOCK, tools behave normally (require real credentials)
    Tool: Bash
    Steps:
      1. Run: tsx src/worker-tools/hostfully/get-messages.ts --lead-id "fake-lead" 2>&1
      2. Assert: exit code is non-zero (API call fails without credentials)
    Expected Result: Real API called, fails without credentials
    Failure Indicators: Exit code 0 (would mean mock is active when it shouldn't be)
    Evidence: .sisyphus/evidence/task-4-no-mock-fails.txt
  ```

  **Commit**: YES
  - Message: `feat(worker-tools): add HOSTFULLY_MOCK convention with fixture data for E2E testing`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `src/worker-tools/hostfully/get-reservations.ts`, `src/worker-tools/hostfully/get-property.ts`, `src/worker-tools/hostfully/fixtures/*`, `src/gateway/services/tenant-env-loader.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 6. Apply seed changes and rebuild Docker image

  **What to do**:
  - Run `pnpm prisma db seed` to apply the new archetype instructions to the local database
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Verify the seeded instructions in DB match what's in `seed.ts`:
    ```bash
    curl -s "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions" \
      -H "apikey: $SUPABASE_ANON_KEY" | jq -r '.[0].instructions' | head -5
    ```
  - Verify the Docker image has the updated `get-messages.ts` with both `--lead-id` and mock mode:
    ```bash
    docker run --rm ai-employee-worker:latest grep -c "lead-id" /tools/hostfully/get-messages.ts
    docker run --rm ai-employee-worker:latest grep -c "HOSTFULLY_MOCK" /tools/hostfully/get-messages.ts
    ```
  - Verify fixture files are baked into the image:
    ```bash
    docker run --rm ai-employee-worker:latest ls /tools/hostfully/fixtures/get-messages/
    ```

  **Must NOT do**:
  - Do NOT modify any source files in this task — only run commands
  - Do NOT run `prisma migrate` — no schema changes, only seed data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure command execution — no code changes, just seed + build
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: Task 7 (E2E test)
  - **Blocked By**: Tasks 2, 3, 5

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — the seed script being executed
  - `Dockerfile` — the image being rebuilt (copies `src/worker-tools/` to `/tools/`)

  **WHY Each Reference Matters**:
  - Need to verify seed applied correctly by querying DB
  - Need to verify Docker image contains updated tool by inspecting container

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed applied — DB has new instructions
    Tool: Bash (curl)
    Preconditions: Supabase running on localhost:54321
    Steps:
      1. Run: curl -s "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" | jq -r '.[0].instructions' | head -3
      2. Assert: output contains "--lead-id" (not "--property-id" with "--unresponded-only")
    Expected Result: Instructions in DB match seed.ts
    Failure Indicators: Old instructions still in DB
    Evidence: .sisyphus/evidence/task-6-seed-verified.txt

  Scenario: Docker image has updated get-messages.ts
    Tool: Bash
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest grep "lead-id" /tools/hostfully/get-messages.ts
      2. Assert: output contains "lead-id" flag parsing code
      3. Assert: exit code 0
    Expected Result: Updated tool baked into image
    Failure Indicators: grep returns nothing, exit code 1
    Evidence: .sisyphus/evidence/task-6-docker-verified.txt
  ```

  **Commit**: NO (no code changes — just command execution)

- [x] 7. E2E test via simulated Hostfully webhook (with mock mode)

  **What to do**:
  - Ensure services are running: gateway (:7700), Inngest (:8288), Docker compose (Supabase)
  - **Set `HOSTFULLY_MOCK=true` in `.env`** so the worker container uses fixture data instead of the real Hostfully API. This is the key change — the model will receive realistic fixture data (an unresponded guest message asking about wifi) and will draft a reply, classify it, and post a Slack approval card.
  - Restart the gateway if needed so it picks up the new `.env` value
  - Send a simulated Hostfully webhook with all required fields:
    ```bash
    curl -X POST http://localhost:7700/webhooks/hostfully \
      -H "Content-Type: application/json" \
      -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"e2e-webhook-driven-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
    ```
  - Monitor the task through the lifecycle:
    - Poll task status via admin API: `GET /admin/tenants/00000000-0000-0000-0000-000000000003/tasks/{task_id}`
    - Watch for status progression: `Ready` → `Executing` → `Submitting` → `Reviewing`
    - Check Inngest dashboard at http://localhost:8288 for function execution
  - **Expected behavior with mock mode**: The fixture data contains an unresponded guest message ("Hi, what's the wifi password?"). The model should:
    1. Fetch via `get-messages.ts --lead-id` → receives fixture thread with unresponded guest message
    2. Fetch reservation/property context via mocked tools → receives fixture reservation and property data
    3. Classify as `NEEDS_APPROVAL` → draft a reply about wifi
    4. Post a Slack approval card to `C0960S2Q8RL` with the guest's message and draft reply
    5. Task reaches `Reviewing` status
  - Capture Docker container logs to verify the worker called `get-messages.ts --lead-id` (not `--property-id --unresponded-only`)
  - Capture the Slack approval card content to verify it shows the fixture guest name and message
  - **After verification, remove `HOSTFULLY_MOCK=true` from `.env`** to restore normal operation

  **Must NOT do**:
  - Do NOT modify any code (except adding/removing `HOSTFULLY_MOCK=true` in `.env`)
  - Do NOT approve or reject the Slack card (just verify it appears)
  - Do NOT send real messages to guests via Hostfully

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: E2E testing requires running services, monitoring async lifecycle progression, capturing evidence from multiple sources (curl, docker logs, DB queries, Slack)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after Wave 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `.sisyphus/plans/2026-05-04-1226-local-docker-opencode-fix.md` — Task 5 in the previous plan showed the E2E testing pattern (dispatch task, poll status, capture logs)

  **External References**:
  - Admin API: `GET /admin/tenants/:tenantId/tasks/:id` with `X-Admin-Key` header
  - Inngest dashboard: http://localhost:8288

  **WHY Each Reference Matters**:
  - Previous plan's Task 5 is the closest precedent for local Docker E2E testing — follow the same tmux + polling pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E — webhook → mock data → classification → Slack approval card
    Tool: Bash (curl)
    Preconditions: Services running (gateway, Inngest, Supabase, Docker), HOSTFULLY_MOCK=true in .env, Docker image rebuilt
    Steps:
      1. Set HOSTFULLY_MOCK=true in .env, restart gateway if needed
      2. Send webhook: curl -s -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"e2e-mock-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
      3. Assert: HTTP 201, response has task_id
      4. Extract task_id from response
      5. Poll: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID" every 15s for up to 5 minutes
      6. Assert: task status reaches "Reviewing" (not just Submitting — the mock data has an unresponded guest message, so the model should classify as NEEDS_APPROVAL and post a Slack card)
    Expected Result: Task reaches Reviewing, Slack approval card appears in C0960S2Q8RL
    Failure Indicators: Task stuck in Executing, reaches Submitting with NO_ACTION_NEEDED (would mean mock data not working or already-responded guard false positive)
    Evidence: .sisyphus/evidence/task-7-e2e-status.txt

  Scenario: Worker used --lead-id (not --property-id --unresponded-only)
    Tool: Bash (docker logs)
    Preconditions: E2E task ran
    Steps:
      1. Capture Docker container logs for the worker that ran the task
      2. Search logs for "lead-id" or "LEAD_UID"
      3. Search logs for "unresponded-only" — should NOT appear
      4. Assert: "lead-id" appears in logs, "unresponded-only" does NOT
    Expected Result: Worker invoked get-messages.ts with --lead-id
    Failure Indicators: "unresponded-only" found in logs, "lead-id" not found
    Evidence: .sisyphus/evidence/task-7-container-logs.txt

  Scenario: Slack approval card shows fixture guest data
    Tool: Bash (curl Slack API or check channel)
    Preconditions: Task reached Reviewing
    Steps:
      1. Query task from DB to get deliverable_content
      2. Assert: deliverable_content JSON contains "draftResponse" field (model drafted a reply)
      3. Assert: deliverable_content references guest name from fixture ("Test Guest" or similar)
      4. Assert: deliverable_content contains "wifi" or "password" (the fixture message topic)
    Expected Result: Model processed the fixture message and drafted a contextual reply
    Failure Indicators: Deliverable empty, references wrong guest, generic non-contextual reply
    Evidence: .sisyphus/evidence/task-7-deliverable.json
  ```

  **Commit**: YES
  - Message: `chore(sisyphus): add E2E evidence for webhook-driven guest messaging`
  - Files: `.sisyphus/evidence/task-7-*`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: webhook without `lead_uid` → 400, webhook with `lead_uid` but no messages → error path. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: `send-message.ts`, `post-guest-approval.ts`, `employee-lifecycle.ts`, `opencode-harness.mts` — NONE of these files should appear in any diff. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Forbidden Files [CLEAN/N touched] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                               | Files                                                                                             | Pre-commit           |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| 1          | `feat(hostfully): add --lead-id flag to get-messages for targeted thread fetch`       | `src/worker-tools/hostfully/get-messages.ts`, test file                                           | `pnpm test -- --run` |
| 2          | `fix(gateway): require lead_uid on NEW_INBOX_MESSAGE webhooks`                        | `src/gateway/routes/hostfully.ts`                                                                 | `pnpm test -- --run` |
| 3          | `feat(guest-messaging): rewrite instructions for webhook-driven message processing`   | `prisma/seed.ts`                                                                                  | `pnpm build`         |
| 4          | `docs: add shell tool onboarding checklist and reference from AGENTS.md`              | `docs/2026-05-04-1645-adding-a-shell-tool.md`, `AGENTS.md`                                        | —                    |
| 5          | `feat(worker-tools): add HOSTFULLY_MOCK convention with fixture data for E2E testing` | `get-messages.ts`, `get-reservations.ts`, `get-property.ts`, `fixtures/*`, `tenant-env-loader.ts` | `pnpm test -- --run` |
| 7          | `chore(sisyphus): add E2E evidence for webhook-driven guest messaging`                | `.sisyphus/evidence/`                                                                             | —                    |

---

## Success Criteria

### Verification Commands

```bash
# Tool flag works
HOSTFULLY_API_KEY=$KEY tsx src/worker-tools/hostfully/get-messages.ts --lead-id "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb"
# Expected: JSON array with 1 element, ThreadSummary shape, exit 0

# Webhook without lead_uid rejected
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"test-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa"}'
# Expected: 400

# Full E2E (requires real unresponded message in Hostfully)
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"e2e-test-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
# Expected: 201 with task_id → task reaches Reviewing → Slack card in C0960S2Q8RL
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Docker image rebuilt
- [ ] Shell tool checklist doc exists and AGENTS.md links to it
- [ ] E2E evidence captured in `.sisyphus/evidence/`

---

## Telegram Notification

- [x] **8. Notify completion** — Send Telegram notification: plan `guest-messaging-webhook-driven` complete, all tasks done, come back to review results.
