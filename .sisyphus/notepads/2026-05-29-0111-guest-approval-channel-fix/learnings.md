# Learnings — guest-approval-channel-fix

## 2026-05-29 Session Start

### Architecture Context

- `post-guest-approval.ts` is a guest-messaging-specific Slack tool at `src/worker-tools/slack/`
- It posts rich Block Kit approval cards with: guest name, property, check-in/out, original message, draft response, Approve/Edit/Reject buttons, View in Hostfully link
- It writes `/tmp/approval-message.json` — this is the harness contract file the lifecycle reads for approval routing
- `submit-output.ts` writes `/tmp/summary.txt` — the other harness contract file
- The harness reads BOTH files; absence of BOTH is a hard failure; either alone is sufficient

### Root Causes Confirmed

- **Issue 2 (wrong channel)**: `post-guest-approval.ts` requires `--channel` flag. `execution_steps` step 7 does NOT pass it. LLM reads SKILL.md which has `C0960S2Q8RL` as channel example on lines 63, 107, 114 → hallucinates that channel.
- **Issue 3 (orphaned thread hint)**: Context thread reply posted to approval card channel (wrong one). Notify channel Done-state update has `threadHint: true` → shows "See thread for full details" but thread is in wrong channel. Fixes automatically when Issue 2 fixed.

### Key File Paths

- `src/worker-tools/slack/post-guest-approval.ts` — file to refactor (434 lines)
- `src/worker-tools/slack/post-message.ts` — threading pattern reference (lines 75-78)
- `src/worker-tools/platform/submit-output.ts` — subprocess target (180 lines)
- `src/workers/skills/tool-usage-reference/SKILL.md` — SKILL.md with C0960S2Q8RL on lines 63, 107, 114
- `src/gateway/services/archetype-generator.ts` — approval pattern at lines 168-173
- `tests/worker-tools/slack/post-guest-approval.test.ts` — test file to update
- `src/workers/opencode-harness.mts` — reads /tmp/approval-message.json (lines 382-415)
- `src/inngest/employee-lifecycle.ts` — DO NOT MODIFY; threadHint: true is correct

### Architectural Decisions Made

- `--channel` flag REMOVED ENTIRELY from post-guest-approval.ts (not just defaulted)
- Channel sourced from `process.env.NOTIFICATION_CHANNEL` with hard fail if missing
- `--thread-ts` defaults to `process.env.NOTIFY_MSG_TS` (matching post-message.ts pattern)
- `/tmp/summary.txt` written BEFORE Slack post (write order matters for reliability)
- Idempotency guard fires first; even on guard skip, ensure /tmp/summary.txt exists
- In dry-run mode: still write /tmp/summary.txt, skip Slack post

### /tmp/approval-message.json Schema (DO NOT CHANGE)

```json
{
  "ts": "<slack_ts>",
  "channel": "<channel_id>",
  "conversationRef": "<thread_uid>",
  "approval_message_ts": "<slack_ts>",
  "target_channel": "<channel_id>",
  "conversation_ref": "<thread_uid>",
  "task_id": "<task_id>",
  "guest_name": "<string>",
  "property_name": "<string>",
  "category": "<string>",
  "confidence": <number>,
  "lead_uid": "<uuid>",
  "thread_uid": "<uuid>",
  "message_uid": "<string>",
  "original_message": "<string>",
  "draft_response": "<string>",
  "check_in": "<string>",
  "check_out": "<string>",
  "booking_channel": "<string>",
  "urgency": <boolean>,
  "lead_status": "<string>|null"
}
```

### Live Archetype Details

- ID: `94b1e64c-2c2a-4391-a6e3-f3ef61044cb5`
- role_name: `guest-messaging`
- Current execution_steps: 8 steps; step 7 calls post-guest-approval.ts, step 8 calls submit-output.ts
- After fix: step 8 becomes redundant (post-guest-approval.ts internally calls submit-output.ts)
- NOTIFICATION_CHANNEL: `C0AMGJQN05S` (#cs-guest-communication)

### Test Resources for E2E

- Airbnb thread: https://www.airbnb.com/guest/messages/2525238359
- Slack channel: https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S
- Webhook payload: agency_uid=942d08d9-82bb-4fd3-9091-ca0c6b50b578, thread_uid=aef3d0cf-bc61-4f05-a3ce-1a4199ca336d, lead_uid=29a64abd-d02c-44bc-8d5c-47df58a7ab14, property_uid=562695df-6a4f-40d6-990d-56fe043aa9e8
- VLRE tenant: 00000000-0000-0000-0000-000000000003

## Task 7 E2E Retest (2026-05-29)

### Test Run
- Task ID: `10c4d940-06d2-487e-a375-dbffc0e1f92c`
- Airbnb message sent: "What time is check-in for this weekend? [e2e-test-1780043976497]"
- Thread: `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`, Lead: `29a64abd-d02c-44bc-8d5c-47df58a7ab14`

### Issue 2: Approval Card Channel
- `pending_approvals.channel_id = C0AMGJQN05S` ✅ FIXED
- `deliverables.metadata->>'target_channel' = C0AMGJQN05S` ✅ FIXED

### Issue 3: Thread Existence
- Thread has 4 messages (notify + superseded + approval card + context) ✅ FIXED
- Done-state notify has "_See thread for full details_" context block ✅
- Thread contains real messages so the link is valid ✅

### "Skipped: host_message" gotcha
- If last Hostfully message is from host (senderType=AGENCY), webhook returns `{"ok":true,"skipped":"host_message"}`
- Must send a real Airbnb guest message BEFORE triggering the webhook
- Used Playwright MCP (built-in browser) to send the message since Chrome CDP wasn't available

### Full lifecycle trace
Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Validating → Submitting → Reviewing → Approved → Delivering → Done (all 10 rows)
