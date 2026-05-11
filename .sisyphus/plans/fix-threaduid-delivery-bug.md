# Fix threadUid Delivery Bug in get-messages.ts

## TL;DR

> **Quick Summary**: Fix a pre-existing bug where `get-messages.ts` does not include `threadUid` in its output, causing the guest-messaging model to hallucinate or reuse `leadUid` as `threadUid`, breaking message delivery after Slack approval. Also rename the confusing `reservationId` field to `leadUid` to match archetype instructions.
>
> **Deliverables**:
>
> - `get-messages.ts` outputs `threadUid` and `leadUid` (replaces `reservationId`)
> - Harness delivery pre-parse has defensive fallback for missing `threadUid`
> - Archetype instructions updated to reference correct field names
> - Mock fixture updated
> - Full browser E2E verification: Airbnb message → approval → delivery → reply appears
>
> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6

---

## Context

### Original Request

Fix the pre-existing `threadUid` bug that caused Scenario A (Approve Happy Path) to partially fail during the slack-ux-e2e-verification plan. The delivery step failed with "Delivery failed after 3 attempts" because `threadUid` was wrong (the model wrote `leadUid` as `threadUid`). Verify the fix via the full Verified E2E flow documented in AGENTS.md.

### Interview Summary

**Key Discussions**:

- Root cause confirmed: `ThreadSummary` type in `get-messages.ts` has NO `threadUid` field, so the model hallucinates a value
- Secondary confusion: output uses `reservationId` but instructions reference `leadUid` → user chose clean rename
- User confirmed full browser E2E (Airbnb → Slack → Airbnb), not lighter DB-only verification

**Research Findings**:

- `THREAD_UID` env var is already injected into worker from `tasks.raw_event.thread_uid` (lifecycle line 494)
- Hostfully webhook schema requires `thread_uid` (`z.string().min(1)`) — always present for webhook tasks
- `post-guest-approval.ts` writes `thread_uid` to `/tmp/approval-message.json` → harness stores in `deliverables.metadata.thread_uid`
- The harness pre-parse (lines 437-474 of `opencode-harness.mts`) has likely **never worked** in production because it looks for `parsed['leadUid']` but the model outputs `reservationId`
- Poll-triggered tasks do NOT have `THREAD_UID` — out of scope for this fix

### Metis Review

**Identified Gaps** (addressed):

- Validate API response shape before adding `threadUid` to `RawMessage` → Decision: source from `THREAD_UID` env var, NOT from API response
- Poll-triggered tasks won't have `threadUid` → Explicitly out of scope
- Help text in `get-messages.ts` needs updating → Added to task scope
- Harness fallback should use `deliverables.metadata.thread_uid` (confirmed stored by post-guest-approval.ts)
- Fixture must use realistic UUIDs → Using known test UUIDs from AGENTS.md

---

## Work Objectives

### Core Objective

Make `get-messages.ts` include `threadUid` in its output so the guest-messaging model can correctly pass it through the pipeline, fixing delivery failures.

### Concrete Deliverables

- Updated `src/worker-tools/hostfully/get-messages.ts` with `threadUid` and renamed `leadUid` field
- Updated `src/worker-tools/hostfully/fixtures/get-messages/default.json` fixture
- Updated `src/workers/opencode-harness.mts` with `threadUid` fallback in delivery pre-parse
- Updated `prisma/seed.ts` archetype instructions
- Rebuilt Docker image with fixes
- Full E2E verification evidence

### Definition of Done

- [ ] `get-messages.ts --help` documents `leadUid` and `threadUid` (no `reservationId`)
- [ ] Mock fixture outputs `leadUid` and `threadUid` with realistic UUIDs
- [ ] Harness pre-parse logs `hasThreadId: true` during E2E
- [ ] Delivery command in worker logs shows both `--lead-id` and `--thread-id` with distinct UUIDs
- [ ] Full E2E: task reaches `Done` state after Slack approval
- [ ] Reply from Leo appears in Airbnb thread

### Must Have

- `threadUid` field in `ThreadSummary` output type
- `reservationId` renamed to `leadUid` in output
- Harness fallback for missing `threadUid` from deliverable content
- Updated mock fixture
- Updated archetype instructions + DB re-seed
- Docker rebuild before E2E
- Full browser E2E verification (Airbnb → Slack → Airbnb)

### Must NOT Have (Guardrails)

- Do NOT modify `send-message.ts` — already correct
- Do NOT modify `post-guest-approval.ts` — already correct
- Do NOT modify `employee-lifecycle.ts` — already correct
- Do NOT modify `guest-message-poll.ts` — poll threadUid gap is a separate bug
- Do NOT add `threadUid` to `RawMessage` type or attempt to parse it from the Hostfully API response (unverified whether API returns it)
- Do NOT change any archetype field other than `instructions` in `seed.ts`
- Do NOT refactor the harness pre-parse block beyond adding the `threadUid` fallback
- Do NOT update AGENTS.md or README.md (internal bug fix, no public API change)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — this is a shell tool fix with no existing unit tests for `get-messages.ts`; verification is via mock output check + full E2E
- **Framework**: N/A for shell tools

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Use Bash — run with `HOSTFULLY_MOCK=true`, validate JSON output
- **Docker**: Use Bash — build image, verify exit 0
- **E2E**: Use Playwright (dev-browser skill) + Bash (curl/psql) — full browser flow
- **Seed**: Use Bash — run seed, query DB

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — code fixes, all independent):
├── Task 1: Fix get-messages.ts output (add threadUid, rename reservationId → leadUid) [quick]
├── Task 2: Add harness delivery fallback for threadUid [quick]
└── Task 3: Update archetype instructions in seed.ts [quick]

Wave 2 (After Wave 1 — build + seed + verify):
├── Task 4: Rebuild Docker image + re-seed DB [quick]
├── Task 5: Full browser E2E verification [deep + dev-browser]
└── Task 6: Notify completion [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA [unspecified-high + dev-browser]
└── Task F4: Scope fidelity check [deep]
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | —          | 4      | 1     |
| 2     | —          | 4      | 1     |
| 3     | —          | 4      | 1     |
| 4     | 1, 2, 3    | 5      | 2     |
| 5     | 4          | 6      | 2     |
| 6     | 5          | —      | 2     |
| F1-F4 | 6          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **3** — T4 → `quick`, T5 → `deep` + `dev-browser`, T6 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + `dev-browser`, F4 → `deep`

---

## TODOs

- [x] 1. Fix get-messages.ts — add threadUid, rename reservationId → leadUid

  **What to do**:
  - Add `threadUid: string` field to `ThreadSummary` type (line 66). Source it from `process.env['THREAD_UID'] ?? ''`
  - Rename `reservationId: string` → `leadUid: string` in `ThreadSummary` type
  - Update both `threads.push({...})` call sites (lines 268-278 and 372-382) to:
    - Use `leadUid: lead.uid` instead of `reservationId: lead.uid`
    - Add `threadUid: process.env['THREAD_UID'] ?? ''`
  - Update `--help` text (lines 151-167) to document `leadUid` and `threadUid` instead of `reservationId`
  - Update mock fixture `src/worker-tools/hostfully/fixtures/get-messages/default.json`:
    - Rename `reservationId` → `leadUid` (keep value: `"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb"`)
    - Add `threadUid: "2f18249a-9523-4acd-a512-20ff06d5c3fa"` (known test thread UID from AGENTS.md)
  - Verify no other files reference `reservationId` from this tool's output (use `lsp_find_references` or grep)

  **Must NOT do**:
  - Do NOT modify `RawMessage` type — we're sourcing `threadUid` from env var, not from API response
  - Do NOT modify `send-message.ts` or `post-guest-approval.ts`
  - Do NOT add any new CLI flags
  - Do NOT change the filtering logic (unresponded-only, lead type exclusions)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change with clear search-and-replace edits + fixture update
  - **Skills**: `[]`
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts:66-76` — `ThreadSummary` type definition to modify
  - `src/worker-tools/hostfully/get-messages.ts:268-278` — First `threads.push({...})` call site (single-lead path)
  - `src/worker-tools/hostfully/get-messages.ts:372-382` — Second `threads.push({...})` call site (multi-lead path)
  - `src/worker-tools/hostfully/get-messages.ts:151-167` — `--help` output schema documentation

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:494` — `THREAD_UID` env var injection: `if (rawEvent.thread_uid) rawEventEnv['THREAD_UID'] = rawEvent.thread_uid`
  - `src/gateway/validation/schemas.ts:327` — Webhook schema: `thread_uid: z.string().min(1)` (always present for webhook tasks)

  **External References**:
  - `src/worker-tools/hostfully/fixtures/get-messages/default.json` — Mock fixture to update

  **WHY Each Reference Matters**:
  - Lines 66-76: The type definition that needs `threadUid` added and `reservationId` renamed
  - Lines 268/372: The two places where `ThreadSummary` objects are constructed — both must be updated identically
  - Line 494: Confirms `THREAD_UID` is available as `process.env['THREAD_UID']` inside the worker container
  - Line 327: Confirms `thread_uid` is required in webhook payload, so env var is always set for webhook tasks

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mock output contains leadUid and threadUid, no reservationId
    Tool: Bash
    Preconditions: Source files modified, no Docker rebuild needed for mock test
    Steps:
      1. Run: HOSTFULLY_MOCK=true THREAD_UID=mock-thread-uid-123 tsx src/worker-tools/hostfully/get-messages.ts --unresponded-only 2>/dev/null
      2. Parse stdout as JSON
      3. Assert first object has key "leadUid" with value "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb"
      4. Assert first object has key "threadUid" with value "2f18249a-9523-4acd-a512-20ff06d5c3fa"
      5. Assert first object does NOT have key "reservationId"
    Expected Result: JSON output contains leadUid and threadUid, no reservationId
    Failure Indicators: "reservationId" key present; "leadUid" key missing; "threadUid" key missing
    Evidence: .sisyphus/evidence/task-1-mock-output.txt

  Scenario: Help text documents new field names
    Tool: Bash
    Preconditions: Source files modified
    Steps:
      1. Run: tsx src/worker-tools/hostfully/get-messages.ts --help 2>&1
      2. Assert output contains "leadUid" (not "reservationId")
      3. Assert output contains "threadUid"
    Expected Result: Help text shows leadUid and threadUid
    Failure Indicators: "reservationId" appears in help text; "threadUid" not mentioned
    Evidence: .sisyphus/evidence/task-1-help-output.txt

  Scenario: No other files reference reservationId from get-messages output
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: grep -r "reservationId" src/worker-tools/hostfully/ --include="*.ts" --include="*.json" -l
      2. Assert no files returned (or only get-messages.ts if still in comments)
    Expected Result: No references to reservationId remain
    Failure Indicators: Files other than get-messages.ts reference reservationId
    Evidence: .sisyphus/evidence/task-1-no-stale-refs.txt
  ```

  **Commit**: YES
  - Message: `fix(hostfully): add threadUid to get-messages output and rename reservationId to leadUid`
  - Files: `src/worker-tools/hostfully/get-messages.ts`, `src/worker-tools/hostfully/fixtures/get-messages/default.json`
  - Pre-commit: `pnpm build`

- [x] 2. Add harness delivery fallback for threadUid

  **What to do**:
  - In `src/workers/opencode-harness.mts` lines 441-442, add fallback logic for `threadUid`:
    1. Try `parsed['threadUid']` (camelCase — primary)
    2. Try `parsed['thread_uid']` (snake_case — model might use either)
    3. If both empty, try reading `deliverables.metadata.thread_uid` from the deliverable row (which is set by `post-guest-approval.ts`)
  - The deliverable row is already fetched at this point in the harness code — check if `metadata` is available. If not, read it from the PostgREST deliverables endpoint using the existing PostgREST client
  - Also add the same snake_case fallback for `leadUid`: try `parsed['lead_uid']` if `parsed['leadUid']` is empty
  - Add a log line when fallback is used: `log.info({ taskId, source: 'metadata-fallback' }, '[opencode-harness] threadUid sourced from deliverable metadata')`

  **Must NOT do**:
  - Do NOT refactor the entire pre-parse block — only add the fallback
  - Do NOT change the `leadUid !== TASK_ID` safety check
  - Do NOT change how `draftResponse` is extracted
  - Do NOT modify any other harness logic (session management, status reporting, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small targeted change in a single file — add fallback logic after existing variable declarations
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:437-474` — The guest-messaging pre-parse block where changes go
  - `src/workers/opencode-harness.mts:441-442` — Current `leadUid`/`threadUid` extraction (primary target for fallback)
  - `src/workers/opencode-harness.mts:254-261` — Where harness reads `/tmp/approval-message.json` into `extraMetadata` (confirms `thread_uid` is in metadata)

  **API/Type References**:
  - `src/worker-tools/slack/post-guest-approval.ts:408` — Writes `thread_uid: params.threadUid` to approval-message.json
  - `src/workers/lib/postgrest-client.ts` — PostgREST client if needed to query deliverables

  **WHY Each Reference Matters**:
  - Lines 437-474: The exact code block where the fallback must be inserted — read this entire block to understand the flow
  - Lines 254-261: Shows that `extraMetadata` includes `thread_uid` from approval-message.json, which becomes `deliverables.metadata`
  - Line 408: Confirms `thread_uid` is stored in the metadata chain

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compiles without errors
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: No compilation errors
    Failure Indicators: tsc errors in opencode-harness.mts
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: Fallback code is present
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Read opencode-harness.mts
      2. Assert code checks for both 'threadUid' and 'thread_uid' keys
      3. Assert a log line exists for metadata fallback
    Expected Result: Fallback logic and logging are present
    Failure Indicators: Only 'threadUid' checked (no snake_case fallback); no fallback log line
    Evidence: .sisyphus/evidence/task-2-fallback-code.txt
  ```

  **Commit**: YES
  - Message: `fix(worker): add threadUid fallback in delivery pre-parse`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 3. Update archetype instructions in seed.ts

  **What to do**:
  - In `prisma/seed.ts`, find the `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant (line 269+)
  - At line 318, update the field extraction instruction:
    - Change `"extract from the leadUid field in the message objects returned by get-messages.ts"` → `"extract from the leadUid field in each thread object returned by get-messages.ts in Step 1"`
    - The `threadUid` instruction is already correct ("from the threadUid field in Step 1 output") — now that the field actually exists, no change needed for threadUid
  - Run `pnpm prisma db seed` to apply the updated instructions to the dev database
  - Verify the seed applied: query the instructions column

  **Must NOT do**:
  - Do NOT change `system_prompt`, `model`, `risk_model`, `delivery_instructions`, or any other archetype field
  - Do NOT add new archetype rows
  - Do NOT modify the seed logic (upsert pattern)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single string change in seed file + re-seed command
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:269-361` — `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant — the full instruction text
  - `prisma/seed.ts:318` — The specific line referencing `leadUid` extraction from `get-messages.ts`
  - `prisma/seed.ts:3274-3339` — Archetype upsert for guest-messaging (ID `00000000-0000-0000-0000-000000000015`)

  **WHY Each Reference Matters**:
  - Line 318: The exact text to change — currently says "message objects" but should say "thread object" since `leadUid` is on the thread, not individual messages
  - Lines 3274-3339: Shows the upsert pattern — confirms only `instructions` is safe to change

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully and instructions updated in DB
    Tool: Bash
    Preconditions: seed.ts modified
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert exit code 0
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT instructions FROM archetypes WHERE role_name = 'guest-messaging' AND tenant_id = '00000000-0000-0000-0000-000000000003'"
      4. Assert output contains "leadUid field in each thread object"
      5. Assert output does NOT contain "leadUid field in the message objects"
    Expected Result: Instructions updated in DB with correct field reference
    Failure Indicators: Seed fails; old instruction text still present; new text not found
    Evidence: .sisyphus/evidence/task-3-seed-verify.txt
  ```

  **Commit**: YES
  - Message: `fix(seed): update guest-messaging instructions to reference leadUid field correctly`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm prisma db seed`

- [x] 4. Rebuild Docker image + verify build

  **What to do**:
  - Run `docker build -t ai-employee-worker:latest .` to rebuild the Docker image with all worker-tool changes
  - Verify the build succeeds (exit 0)
  - Verify the updated `get-messages.ts` is inside the image: `docker run --rm ai-employee-worker:latest cat /tools/hostfully/get-messages.ts | grep "threadUid"` — must find the new field
  - Verify the updated fixture is inside: `docker run --rm ai-employee-worker:latest cat /tools/hostfully/fixtures/get-messages/default.json | grep "threadUid"` — must find the field
  - Also run `pnpm build` to verify TypeScript compilation

  **Must NOT do**:
  - Do NOT push the Docker image to any registry
  - Do NOT modify the Dockerfile
  - Do NOT change any source files in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single build command + verification
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `Dockerfile` — Copies `src/worker-tools/` to `/tools/` in the image
  - `.sisyphus/evidence/task-1-mock-output.txt` — Task 1 evidence to verify changes landed

  **WHY Each Reference Matters**:
  - Dockerfile: Confirms the copy path so we know where to find files inside the container

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully with updated get-messages.ts
    Tool: Bash (tmux for long-running docker build)
    Preconditions: Tasks 1-3 committed
    Steps:
      1. Run: docker build -t ai-employee-worker:latest . (use tmux — takes ~2 min)
      2. Assert exit code 0
      3. Run: docker run --rm ai-employee-worker:latest grep -c "threadUid" /tools/hostfully/get-messages.ts
      4. Assert count >= 2 (type definition + push call)
      5. Run: docker run --rm ai-employee-worker:latest cat /tools/hostfully/fixtures/get-messages/default.json | grep "threadUid"
      6. Assert threadUid is present in fixture
    Expected Result: Docker image builds clean; updated files are inside
    Failure Indicators: Build fails; grep finds 0 matches; fixture missing threadUid
    Evidence: .sisyphus/evidence/task-4-docker-build.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Preconditions: All code changes committed
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Clean build
    Failure Indicators: tsc errors
    Evidence: .sisyphus/evidence/task-4-tsc.txt
  ```

  **Commit**: NO

- [x] 5. Full browser E2E verification

  **What to do**:
  Execute the full Verified E2E flow from AGENTS.md to prove the threadUid fix works:
  1. **Send guest message on Airbnb** — navigate to `https://www.airbnb.com/guest/messages/2525238359`, type a test message as Olivia: `"Can I bring my dog? [e2e-threaduid-fix-{epoch}]"` (use `date +%s` for epoch)
  2. **Confirm webhook fires** — watch gateway logs for `POST /webhooks/hostfully 200`
  3. **Track task through lifecycle** — poll DB: `SELECT id, status FROM tasks ORDER BY created_at DESC LIMIT 1` until status = `Reviewing`
  4. **Verify approval card in Slack** — navigate to `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`, find the approval card thread, verify it has all 4 buttons
  5. **Click Approve & Send** — click the button, confirm card updates to "Approved by @..."
  6. **Verify task reaches Done** — poll DB until status = `Done`. If status = `Failed`, check `failure_reason`
  7. **Verify reply appears in Airbnb** — navigate back to `https://www.airbnb.com/guest/messages/2525238359`, confirm host reply appears
  8. **Verify harness logs** — check Docker container logs for `hasThreadId: true` in the pre-parse log line

  **CRITICAL: Wait for Hostfully propagation** — after the Airbnb message, the webhook may take 1-5 minutes to fire. If no webhook after 5 minutes, check if any previous host reply was the last message in the Hostfully thread (pre-check auto-complete). If so, send a second message.

  **Must NOT do**:
  - Do NOT modify any source code
  - Do NOT skip any step — all 8 steps must be executed and documented
  - Do NOT accept `Failed` status without investigating `failure_reason`
  - Do NOT use mock mode — this must be a real Hostfully/Airbnb E2E test

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-step E2E flow requiring browser automation, DB polling, and log analysis
  - **Skills**: `["dev-browser"]`
    - `dev-browser`: Required for Playwright browser automation (Airbnb + Slack interaction)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `docs/2026-05-10-1609-slack-ux-e2e-test-guide.md` — E2E test guide with Scenario A steps
  - `.sisyphus/notepads/slack-ux-e2e-verification/learnings.md` — Learnings from previous E2E run (Slack navigation tips, timing gotchas)

  **External References**:
  - Airbnb thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack channel: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S` (`#cs-guest-communication`)
  - DB connection: `postgresql://postgres:postgres@localhost:54322/ai_employee`

  **WHY Each Reference Matters**:
  - The test guide has detailed steps and known gotchas from the previous E2E run
  - The learnings notepad has critical Slack navigation tips (thread vs channel, button click techniques)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E delivery succeeds — reply appears in Airbnb
    Tool: Playwright (dev-browser) + Bash (psql)
    Preconditions: Docker image rebuilt (Task 4), services running (gateway + Inngest + Docker)
    Steps:
      1. Generate epoch: date +%s
      2. Navigate to https://www.airbnb.com/guest/messages/2525238359
      3. Type: "Can I bring my dog? [e2e-threaduid-fix-{epoch}]" and send
      4. Wait up to 5 min for webhook (poll gateway logs or DB for new task)
      5. Poll DB: SELECT id, status FROM tasks WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d' ORDER BY created_at DESC LIMIT 1
      6. Wait for status = 'Reviewing' (poll every 15s, timeout 10 min)
      7. Navigate to Slack #cs-guest-communication, find approval card thread
      8. Click "Approve & Send" button
      9. Poll DB: wait for status = 'Done' (timeout 5 min)
      10. Navigate back to Airbnb thread, confirm host reply from Leo
    Expected Result: Task reaches Done; reply appears in Airbnb from Leo; no Failed state
    Failure Indicators: Task stuck in Executing; status = Failed; no reply in Airbnb; delivery error in logs
    Evidence: .sisyphus/evidence/task-5-e2e-delivery.txt

  Scenario: Harness pre-parse shows hasThreadId: true
    Tool: Bash
    Preconditions: Task completed successfully (status = Done)
    Steps:
      1. Find the Docker container used for this task: docker ps -a --filter name=employee-{task-id-prefix}
      2. Read its logs: docker logs {container-id} 2>&1 | grep "guest-messaging delivery pre-parsed"
      3. Assert log line contains "hasThreadId\":true" (not false)
    Expected Result: Harness used the threadUid from deliverable content
    Failure Indicators: hasThreadId: false; log line not found; raw fallback was used
    Evidence: .sisyphus/evidence/task-5-harness-logs.txt

  Scenario: Delivery command has distinct --lead-id and --thread-id
    Tool: Bash
    Preconditions: Task completed successfully
    Steps:
      1. Read container logs: docker logs {container-id} 2>&1 | grep "send-message.ts"
      2. Extract --lead-id and --thread-id values
      3. Assert both are non-empty UUIDs
      4. Assert they are different from each other
      5. Assert neither matches the task ID
    Expected Result: Both IDs present, distinct, and neither is the task ID
    Failure Indicators: --thread-id missing; same UUID for both; task ID used as lead or thread ID
    Evidence: .sisyphus/evidence/task-5-delivery-command.txt
  ```

  **Commit**: NO

- [x] 6. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ fix-threaduid-delivery-bug complete — threadUid fix verified via full E2E. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 5)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `scripts/telegram-notify.ts` — Telegram notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ fix-threaduid-delivery-bug complete — threadUid fix verified via full E2E. Come back to review results."
      2. Assert output contains "sent" or similar success indicator
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-6-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `dev-browser` skill)
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `fix(hostfully): add threadUid to get-messages output and rename reservationId to leadUid` — `src/worker-tools/hostfully/get-messages.ts`, `src/worker-tools/hostfully/fixtures/get-messages/default.json`
- **Wave 1**: `fix(worker): add threadUid fallback in delivery pre-parse` — `src/workers/opencode-harness.mts`
- **Wave 1**: `fix(seed): update guest-messaging instructions to reference leadUid field` — `prisma/seed.ts`

---

## Success Criteria

### Verification Commands

```bash
# 1. Mock output check (no Docker needed)
HOSTFULLY_MOCK=true THREAD_UID=test-thread-uid tsx src/worker-tools/hostfully/get-messages.ts --unresponded-only 2>/dev/null
# Expected: JSON with leadUid, threadUid, NO reservationId

# 2. Seed verification
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT instructions FROM archetypes WHERE role_name = 'guest-messaging'" | grep -c "leadUid field"
# Expected: 1

# 3. Build check
pnpm build
# Expected: exit 0

# 4. E2E delivery — task reaches Done after approval
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status FROM tasks ORDER BY created_at DESC LIMIT 1"
# Expected: Done
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `get-messages.ts` outputs `leadUid` + `threadUid`, no `reservationId`
- [ ] Harness pre-parse logs `hasThreadId: true`
- [ ] Full E2E delivery succeeds (reply appears in Airbnb)
- [ ] All tmux sessions cleaned up
