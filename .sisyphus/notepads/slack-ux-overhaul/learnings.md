# Learnings — slack-ux-overhaul

## Key Codebase Facts

### Files to Modify
- `src/lib/slack-blocks.ts` — add 4 new pure block builder functions
- `src/lib/hostfully-enrichment.ts` — NEW: lead enrichment utility
- `src/gateway/routes/hostfully.ts` — store message_content in raw_event (line 34 + 125-130)
- `src/inngest/employee-lifecycle.ts` — enrich notify-received, thread override card, state updates (1600+ lines)
- `prisma/seed.ts` — update VLRE guest-messaging archetype instructions (ID: 00000000-0000-0000-0000-000000000015)

### New Test Files
- `tests/lib/hostfully-enrichment.test.ts` — NEW
- `tests/inngest/lifecycle-enriched-notify.test.ts` — NEW
- `tests/lib/slack-blocks.test.ts` — EXTEND (existing file)

### Critical Constraints
- ALL lifecycle changes behind `if (archetype.role_name === 'guest-messaging')` guard
- Summarizer path MUST stay untouched
- `override_take_action` + `override_dismiss` action IDs must match exactly (handlers in handlers.ts:698,747)
- `post-guest-approval.ts` already supports `--thread-ts` — just needs instruction wiring
- `NOTIFY_MSG_TS` already passed to worker container (lifecycle lines 398, 421)
- Poll tasks: `raw_event = { lead_uid, source: 'poll' }` — NO property_uid

### API Patterns
- Hostfully lead endpoint: `GET /leads/{leadUid}` — returns guestInformation.firstName/lastName, checkInLocalDateTime, checkOutLocalDateTime, channel
- Header: `X-HOSTFULLY-APIKEY: <key>`
- Error handling: on any failure → return all-null object (non-fatal)

### Test Patterns
- Hostfully API mocks: follow `tests/lib/hostfully-precheck.test.ts` — mock `global.fetch`
- Block builder tests: follow `tests/lib/slack-blocks.test.ts` — pure function assertions
- Lifecycle tests: follow `tests/inngest/lifecycle-override.test.ts` — mock Inngest + fetch + Slack client

## Task 9 E2E Verification Results (2026-05-08)

### Verified Behaviors
- ✅ Docker image rebuilt from scratch (exit 0, ~90s with cache)
- ✅ DB re-seeded — archetype 00000000-0000-0000-0000-000000000015 instructions contain `--thread-ts "$NOTIFY_MSG_TS"`
- ✅ Parent message enriched: "⏳ Awaiting approval — reply drafted for Olivia" (guest name resolved via Hostfully API)
- ✅ Approval card is a thread reply (not top-level) — "1 reply" button on parent
- ✅ Parent updates after worker posts approval card: "Awaiting approval — reply drafted for {guestName}"
- ✅ On Approve & Send: parent updates to "✅ Reply sent to Olivia"
- ✅ Thread reply confirms: "✅ Sent to guest at {timestamp}"
- ✅ Task DB status = Done
- ✅ Task ID only in context blocks (not inline in message body)
- ✅ No orphan top-level messages — all in one thread

### Approval Card Content (Verified)
- Header: "🚨 Guest Message — {property name}"
- Guest, Property, Check-in (time), Check-out (time), Booking Channel: Hostfully
- Original Message quoted
- Proposed Response
- Confidence % + Category code
- Approve & Send / Edit & Send / Reject buttons
- Task ID context block at bottom

### Test Suite Findings
- 5 slack-ux-overhaul test files all pass: slack-blocks, hostfully-enrichment, lifecycle-enriched-notify, lifecycle-guest-approval, post-guest-approval
- Pre-existing failures unchanged: opencode-server (Docker), inngest-serve (function count), engineering worker tests
- No regressions introduced

### Timing
- Webhook → Reviewing: ~100s (Docker local)
- Approve → Done: ~15-20s
