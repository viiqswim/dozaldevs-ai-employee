# Learnings — delivery-404-harness-fix

## [2026-05-06] Session Start

### Key Architecture Facts

- Harness delivery phase: `src/workers/opencode-harness.mts:375-402`
- Deliverable content is stored as a string (JSON) in `deliverables.content`
- Delivery prompt is built at line 402: `{delivery_instructions}\n\n--- DELIVERABLE CONTENT ---\n{content}\n--- END DELIVERABLE CONTENT ---\n\nTask ID: {taskId}`
- `runOpencodeSession()` ALSO appends `Task ID:` — double injection (DO NOT FIX, out of scope)
- PostgREST URL: `http://localhost:54331/rest/v1/` (Kong port, NOT 54321)
- Approved models: `minimax/minimax-m2.7` (execution) and `anthropic/claude-haiku-4-5` (verification)

### Root Cause

- Delivery model used Task ID as `--lead-id` for `send-message.ts`, getting a 404
- Multiple UUIDs in prompt (deliverable JSON + Task ID appended twice) caused LLM confusion
- Fix: pre-parse JSON in TypeScript, inject exact values into prompt

### Guard Rails

- Pre-parse MUST be gated on `archetype.role_name === 'guest-messaging'`
- Fallback to raw passthrough if JSON parse fails or fields missing
- `threadUid` must be OMITTED (not `"null"`) when absent
- DO NOT modify `runOpencodeSession()`, `send-message.ts`, or summarizer delivery instructions

## [2026-05-06] Task 1 Diagnostic — Deliverable Content Analysis

### Deliverable Found
- Deliverable ID: `93245cbc-bdbc-41d3-a920-602778c8dff7`
- Status: `pending` (delivery failed, never completed)
- delivery_type: `slack_message` (note: should be hostfully delivery — possible separate issue)

### Content Fields Present
- `classification`: "NEEDS_APPROVAL" ✓
- `draftResponse`: present and well-written ✓
- `guestName`: "Olivia" ✓
- `propertyName`: "3412-SAN-4" ✓
- `leadUid`: PRESENT but WRONG VALUE ❌
- `threadUid`: present (but may be wrong — see below)
- `messageUid`: present (looks fabricated)

### Critical Finding — BRANCH B
**`leadUid` IS present but its value is the TASK ID, not a Hostfully UID:**
- Stored value: `f2c8430a-3a0d-4c8e-ae47-5f3d24819de7` (= task ID)
- Expected value: `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb` (real Hostfully lead UID)

This confirms the model confused the task ID with the Hostfully lead UID when writing the JSON output.

### Branch Decision: BRANCH B
Execution instructions ALSO need fixing — the model must be explicitly told to use the `leadUid` from the Hostfully API response (get-messages.ts output), NOT the task ID.

### Additional Concerns
1. `threadUid` is `eaa63e2c-e03c-4268-943e-52d3fc8a72a5` — different from known test thread `2f18249a-9523-4acd-a512-20ff06d5c3fa`. May be a real different thread or also wrong.
2. `messageUid` `9a6c95f4-7b8a-4f3d-9e2a-1c5d8e3f7a2b` looks fabricated (not from real API response).
3. `delivery_type` is `slack_message` — should this be `hostfully_message`? Investigate if this affects delivery routing.

### Evidence
Saved to: `.sisyphus/evidence/task-1-diagnostic-deliverable-content.json`

## [2026-05-06] Task 2 — Container Cleanup + Gateway Restart

### Container Cleanup
- Found 14 orphaned `employee-delivery-*` containers, all running (up 4–38 hours)
- Removed with: `docker rm -f $(docker ps -a --filter name=employee-delivery -q)`
- Docker Compose services (postgres, kong, auth) were NOT affected

### Gateway Restart
- Gateway was running via `tsx watch` in terminal s022 (NOT in tmux)
- Killing the child server process (PID 86613) did NOT trigger tsx watch auto-restart
- Had to kill tsx watch processes (63911, 63871) and restart manually in tmux session `ai-gateway`
- Gateway healthy at `http://localhost:7700/health` → `{"status":"ok"}`
- Running with lifecycle fix from commit `28e7fd1`

### Gotcha: tsx watch does not always auto-restart
- When the child process is killed externally (not via file change), tsx watch may not respawn
- Safe restart strategy: kill tsx watch entirely, then start fresh in tmux

## T4 Seed Changes ($(date "+
## [2026-05-06] Task 3 — Harness Pre-Parse Block

### Changes Made
- Replaced `const deliveryPrompt = ...` at line 402 with a role-gated pre-parse block
- Block declared `let deliveryPrompt = ''` (initializer needed — TypeScript can't verify definite assignment through try/catch + usedPreParse flag pattern)
- Gate: `archetype.role_name === 'guest-messaging'` → enter pre-parse path
- Extracts `leadUid`, `threadUid`, `draftResponse` from `JSON.parse(deliverableContent)`
- Safety: `leadUid !== TASK_ID` guard catches exact T1 failure mode (model wrote task ID as leadUid)
- `threadIdArg`: empty string when `threadUid` falsy, so `--thread-id` arg is entirely omitted
- Fallback: JSON parse failure OR missing/invalid fields → raw `--- DELIVERABLE CONTENT ---` passthrough
- Summarizer and other archetypes: hit `else` branch, unchanged raw passthrough

### TypeScript Fix
- `let deliveryPrompt: string;` → `let deliveryPrompt = '';` because TS can't follow the usedPreParse control flow through try/catch and treats the variable as potentially unassigned

### Verification
- Zero TS errors in opencode-harness.mts (pre-existing errors in scripts/ and tests/ are unrelated)
- All 3 grep checks pass
- Evidence: `.sisyphus/evidence/task-3-harness-diagnostics.txt`

## T4 Seed Changes
- delivery_instructions updated in both create+update blocks for guest-messaging archetype (000015)
- deliverable_type changed from slack_message → hostfully_message in both blocks
- VLRE_GUEST_MESSAGING_INSTRUCTIONS Step 5: added explicit CRITICAL warning — leadUid must come from get-messages.ts API response, NOT $TASK_ID
- Summarizer archetypes (000012, 000013) delivery_instructions untouched (verified: 4 occurrences of "Post the approved summary" still present)

## [2026-05-06] Task 5 — Unit Tests for JSON Pre-Parse Delivery Path

### Changes Made
- Modified `buildMockFetch` in `tests/workers/opencode-harness-delivery.test.ts` to accept `roleName?: string | null` opt
- Added `role_name: roleName ?? null` to `taskRow.archetypes` object in the mock
- Added 5 new test cases inside the `describe('opencode-harness — delivery phase')` block

### Test Cases Added
1. **guest-messaging valid JSON** → pre-parsed command contains `--lead-id`, `--thread-id`, "pre-parsed" text
2. **guest-messaging missing threadUid** → `--thread-id` omitted, `--lead-id` present, "pre-parsed" text
3. **guest-messaging non-JSON** → raw passthrough with `--- DELIVERABLE CONTENT ---`
4. **guest-messaging JSON missing leadUid** → raw passthrough with `--- DELIVERABLE CONTENT ---`
5. **non-guest-messaging (daily-summarizer)** → raw passthrough, no "pre-parsed"

### How to capture injectTaskPrompt arg
`sessionManagerMock.injectTaskPrompt.mock.calls[0]?.[1] as string` — index [1] is the fullPrompt
Note: fullPrompt = `systemPrompt\n\ndeliveryPrompt\n\nTask ID: test-task-id`
The deliveryPrompt for pre-parsed case already contains `Task ID:` — double injection is expected, don't fix.

### Results
- Targeted file: ✓ 15 tests passed (10 existing + 5 new) in 759ms
- Full suite: 14 failed files (same pre-existing baseline), 143 passed, 3 skipped
- Commit: `6b2ee87` — `test(delivery): add unit tests for JSON pre-parse delivery path`

## [2026-05-06] Task 6 — Docker Rebuild + Seed Apply
- Docker image rebuilt: 2026-05-06T17:36:03.151308464Z (EXIT_CODE:0)
- Seed applied: success — all archetypes upserted cleanly
- DB verification: delivery_instructions contains "pre-parsed": yes, deliverable_type: "hostfully_message"
- PostgREST URL confirmed: http://localhost:54331/rest/v1/ (Kong port)
- Build took ~30s (cached layers, only final COPY steps ran fresh)

## [2026-05-06] Task 7 — E2E Verification
- Task ID: 3128eabe-5f1f-4daa-8b46-af651b31bf8e
- Final status: Done (gateway log) / Failed in DB (SIGTERM race condition — known issue)
- Delivery container: employee-delivery-3128eabe (found, ran, completed)
- leadUid in logs: 37f5f58f-d308-42bf-8ed3-f0c2d70f16fb
- Correct (not task ID): YES ✅

### Key findings:
1. **USE_LOCAL_DOCKER must be set** — gateway started without it defaults to Fly.io; Fly.io machines can't reach local Supabase without a tunnel. Always start gateway via dev.ts or with explicit USE_LOCAL_DOCKER=1.
2. **Pre-parse confirmed working** — harness log: "[opencode-harness] guest-messaging delivery pre-parsed" with leadUid=37f5f58f-... (not task ID). T3 fix is verified.
3. **SIGTERM race condition** — lifecycle marks Done, removes container, SIGTERM handler overwrites to Failed. This is a known issue per AGENTS.md. Gateway log is the authoritative source for lifecycle state.
4. **Evidence file**: .sisyphus/evidence/task-7-e2e-delivery-logs.txt
