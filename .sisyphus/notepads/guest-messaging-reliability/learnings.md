# Learnings — guest-messaging-reliability

## [2026-05-08] Session start

### File Locations

- `post-guest-approval.ts`: `src/worker-tools/slack/post-guest-approval.ts` — 344 lines
  - `main()` starts at line 259
  - Idempotency guard: lines 262-278 — checks `existsSync(APPROVAL_OUTPUT_PATH)` and `existing.ts`
  - `parseArgs()`: lines 32-117
  - `GuestApprovalParams` interface: lines 5-25 (does NOT yet have `conversationRef`)
  - `PostResult` interface: lines 27-30 — `{ ts: string; channel: string }` — DO NOT CHANGE
  - Slack post: lines 325-335 — `client.chat.postMessage()`
  - Stdout output: line 338 — `process.stdout.write(JSON.stringify(output))`

### Harness `checkOutputFiles()` — lines 223-257

- Reads `/tmp/approval-message.json` at lines 238-255
- Maps: `approvalData.ts` → `approval_message_ts`, `approvalData.channel` → `target_channel`
- Maps: `approvalData.conversationRef` → `conversation_ref` (line 245-247)
- NO validation currently — any value including PLACEHOLDER passes through

### Lifecycle `track-pending-approval` — lines 975-1003

- Lines 988-990: `if (!conversationRef || !approvalMsgTs || !targetChannel) { return; }`
- SILENT return — zero observability when metadata missing
- Must change to `log.warn(...)` then `return` — DO NOT throw

### Cron `guest-message-poll.ts`

- Existing same-namespace dedup: lines 199-207 — checks `external_id=eq.${externalId}` (only finds hostfully-poll-\* tasks)
- Task creation: lines 209-219 — body has NO `raw_event` field currently
- After cross-namespace fix: must also store `raw_event: { lead_uid: leadUid, source: 'poll' }`

### Constraints

- DO NOT modify `src/gateway/routes/hostfully.ts`
- DO NOT change stdout output of `post-guest-approval.ts` (PostResult shape)
- DO NOT create `post-no-action-notification.ts` (doesn't exist, out of scope)
- DO NOT throw in `track-pending-approval` — only log.warn
- Seed test line 93: `toContain('/tmp/approval-message.json')` — still passes (instructions still mention file)
- PostgREST URL: `http://localhost:54331`, DB: `ai_employee`, port 54322
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
- Guest-messaging archetype ID: `00000000-0000-0000-0000-000000000015`

## Wave 1 Test Additions (2026-05-08)

### Mock isolation gotcha — mockImplementationOnce queue pollution
When an `idempotency guard` test sets up `vi.mocked(WebClient).mockImplementationOnce(...)` but then returns early (guard fires, WebClient never instantiated), the `mockImplementationOnce` stays queued. The next test that creates `new WebClient()` consumes that stale queue entry, not its own mock. Fix: call `vi.mocked(WebClient).mockReset()` before setting up your own implementation in any self-contained test.

### Adding writeFileSync to an existing vi.mock
Add `writeFileSync: vi.fn()` to the mock factory AND add `writeFileSync` to the import statement. Since `vi.mock` is hoisted, the mock is available when the source module is first loaded. Existing tests that don't assert on writeFileSync are unaffected (the mock just no-ops the real write).

### Harness source-check tests
Simple static checks on source file content (grep for constant/string presence) are valid unit tests when the actual logic runs inside a worker container and can't be invoked in the test environment. Use `readFileSync` on the `.mts` source path with `import.meta.dirname` for portable paths.

### Test count: 22 post-guest-approval + 4 harness-placeholder = 26 new tests total

## [2026-05-08] Wave 1-2 complete

### Commits
- `fe0acaf` — harness placeholder validation in opencode-harness.mts
- `7af3fc7` — lifecycle log.warn in track-pending-approval
- `64e63b6` — cron cross-namespace dedup in guest-message-poll.ts
- `4a42525` — post-guest-approval.ts self-write + --conversation-ref
- `e32be26` — seed.ts archetype instructions updated
- `82b410a` — tests: 22 post-guest-approval + 4 harness-placeholder-validation

### Test state
- 26/26 new tests pass (targeted run)
- Full suite unknown (times out >90s due to DB globalSetup)
- Use `npx vitest --run` directly for targeted runs (bypasses pnpm slow startup)

### STEP 6 seed note
- STEP 6 (error handling path) still has `> /tmp/approval-message.json` — intentionally left
- Only STEP 5 (happy path) was changed to remove redirect
- 1 remaining occurrence in DB grep is STEP 6

## [2026-05-08] E2E Test — Task 8 Complete (Wave 3 Verification)

### E2E Test Results — PASS

- Task ID: `42bba9e3-59c7-4149-88c1-2aadb3a9ef2d`
- External ID: `hostfully-msg-7f271c67-43b2-4068-8ea7-2c46eb0ca724` (webhook-triggered, not poll)
- Guest message: "Is there a washer and dryer available at the property?"
- Full flow: Airbnb send → webhook → Executing → Reviewing → Approved → Done
- Reply delivered to Airbnb at 8:02 PM (host Leo)

### Metadata Validation
- `ts`: `1778201790.696679` ✅ (real Slack timestamp)
- `channel`: `C0AMGJQN05S` ✅ (real channel)
- `conversationRef`: `29a64abd-d02c-44bc-8d5c-47df58a7ab14` ✅ (real lead_uid, no PLACEHOLDER)
- `pending_approvals` row created ✅

### Approval Card
- Correct template: Guest-messaging card (NOT summarizer)
- Buttons: "Approve & Send", "Edit & Send", "Reject"
- Thread reply in top-level channel message
- Card shows: property name, guest name, check-in/out, original message, proposed response, confidence

### Issue Observed (Separate)
- Poll-cron tasks (external_id `hostfully-poll-*`) fail with "Required environment variables LEAD_UID, THREAD_UID, MESSAGE_UID, PROPERTY_UID are all empty"
- Poll-cron tasks don't pass raw_event to worker (known from Wave 1-2 learnings — `raw_event` field missing from cron task creation)
- Webhook-triggered tasks work correctly because they have `raw_event` with lead/thread/message UIDs
- Poll-cron task `86b0e86c` used summarizer-style approval card (wrong template) — needs investigation

### Evidence
- Screenshot: `.sisyphus/evidence/task-8-e2e-full.png`
- Metadata: `.sisyphus/evidence/task-8-e2e-metadata.txt`
