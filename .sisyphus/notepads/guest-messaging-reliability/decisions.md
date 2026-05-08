# Decisions — guest-messaging-reliability

## [2026-05-08] Architecture Decisions

### D1: Tool self-writes file (not stdout piping)

- Tool writes `/tmp/approval-message.json` directly via `writeFileSync`
- Stdout still outputs `{"ts":"...","channel":"..."}` for backward compat
- Idempotency guard must also reject PLACEHOLDER values (not just check truthiness)

### D2: Harness validation throws immediately on bad metadata

- PLACEHOLDER pattern check (case-insensitive) for `ts` and `channel` fields
- Empty `ts` or `channel` also rejected
- Error message includes the actual values for debugging
- NO catch/retry — let it propagate, task goes to Failed

### D3: Lifecycle adds log.warn (not throw)

- Only add `log.warn(...)` before existing `return` at line 988
- DO NOT change lifecycle state machine or flow

### D4: Cron dedup strategy = unified ID + cross-namespace active-task check

- Cross-namespace check: query by `raw_event->>lead_uid=eq.${leadUid}` across ALL active statuses
- Also store `raw_event: { lead_uid, source: 'poll' }` on cron-created tasks for future bidirectional checks

### D5: `--conversation-ref` flag in tool

- Maps to `params.conversationRef` in `GuestApprovalParams`
- Stored in output file as `conversationRef` (camelCase) AND `conversation_ref` (snake_case) for harness compat
