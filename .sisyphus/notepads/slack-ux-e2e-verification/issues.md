# Issues & Anomalies — Slack UX E2E Verification

## Scenario A — Approve Happy Path

### Pre-existing: threadUid bug in get-messages.ts

- `get-messages.ts` had a bug where `threadUid` was not being passed correctly in some cases
- This was a pre-existing issue, not introduced by the slack-ux-overhaul changes
- Scenario A was marked PARTIAL FAIL due to delivery bug blocking Done terminal blocks; Slack UX assertions PASS

---

## Scenario B — Reject Path

### Anomaly: Double Top-Level Message

- Two top-level messages appeared for the same task in #cs-guest-communication:
  1. The notify message (ts 1778450137) — correctly updated to ❌ Rejected
  2. A second "no action needed" message (ts 1778450222) — likely from guest-message-poll cron firing between webhook dispatch and rejection
- **Root cause**: `trigger/guest-message-poll` cron fires every 15 min and creates a separate task for the same thread if it finds unresponded messages
- **Impact**: Pre-existing behavior, not caused by slack-ux-overhaul changes
- **Mitigation**: The poll cron uses `external_id: hostfully-poll-{lead_uid}-{YYYY-MM-DD}` dedup — but if the webhook task is still in Reviewing when the poll fires, the poll creates a new task with a different external_id

---

## Scenario D — Supersede Path

### Hostfully Propagation Timing

- Scenario required 3 messages instead of 2 due to Hostfully propagation lag
- Second message returned NO_ACTION_NEEDED because Hostfully's API showed `lastMessage.senderType === 'AGENCY'` (last message from host at 5:30 PM from Scenario C) when task_id_2's worker ran ~90 seconds after the message was sent
- **Root cause**: `get-messages.ts --unresponded-only` is client-side only — checks `lastMessage.senderType !== 'AGENCY'`. If Hostfully hasn't propagated the new guest message as the thread's last message yet, the thread appears "responded"
- **Workaround**: Wait ~10 minutes between Scenario C delivery and Scenario D first message, OR send a third message after propagation delay
- **Test guide correction needed**: The test guide should note this timing sensitivity and recommend waiting 10+ minutes after any host delivery before sending the next test message

### Notify Message Shows New Task State (Not "⏭️ Superseded")

- When task_id_2/3 inherit task_id_1's notify thread via gateway supersede path, the notify message shows the NEW task's state
- The "⏭️ Superseded" text appears on the approval card (in the thread), not the top-level notify message
- **This is expected behavior** — the notify message is updated by whichever task currently "owns" it
- **Test guide correction needed**: The plan says "Verify the top-level notify message for the first task also shows ⏭️ Superseded" — this is incorrect. The notify message shows the new task's state.

---

## Scenario E — Expiry Path

### Airbnb "Sending..." Propagation Failure

- Airbnb message "Is breakfast included? [e2e-test-1778454546]" got stuck in "Sending..." state in Airbnb UI after 11+ minutes
- Message never propagated to Hostfully — no webhook fired, no task created from Airbnb path
- **Root cause**: Unknown — possibly Airbnb rate limiting, network issue, or test account restriction
- **Workaround**: Fire `POST /webhooks/hostfully` directly with unique `message_uid` — bypasses Airbnb entirely
- **Impact**: Scenario E still PASSES via manual webhook fallback

### fetchLeadEnrichment Returns Null for Manual Webhook Tasks

- Tasks triggered via manual webhook (not real Airbnb webhook) have `fetchLeadEnrichment()` return null in the lifecycle's `notify-received` step
- Result: enriched blocks (guest name, property name, Hostfully link) NOT present in expired terminal blocks
- **Root cause**: Manual webhook payload may lack context that `fetchLeadEnrichment()` needs, OR the Hostfully API returns null for this lead at the time of the call
- **Impact**: Acceptable fallback — the critical assertion (correct expiry text "⏰ Expired — no action taken") still PASSES
- **Evidence**: Concurrent task `5a1eef1e` (real webhook) showed rich blocks with "Guest: Benjamin Botello" — proving the code path works for real webhooks

### Race Condition: b8acc3a6 Approval Card Not Updated

- Task `b8acc3a6` had a pending_approvals row with `guest_name=c.e. Wilson` but its approval card was NOT updated to "⏰ Expired"
- **Root cause**: Race condition with task `1828d2d3` — both tasks were processing simultaneously; `1828d2d3` went to Done (NO_ACTION_NEEDED) which may have interfered with `b8acc3a6`'s expiry update
- **Impact**: Pre-existing race condition, not caused by slack-ux-overhaul changes

---

## Test Guide Corrections Required

1. **Scenario B**: Rejected tasks end in `Cancelled`, not `Done` (AGENTS.md is authoritative)
2. **Scenario D**: Superseded tasks end in `Cancelled`, not `Done` (lifecycle line 1890)
3. **Scenario D**: Notify message does NOT show "⏭️ Superseded" — only the approval card does
4. **Scenario D**: Hostfully propagation lag may require 3 messages instead of 2; recommend 10+ min wait after any host delivery
5. **Scenario E**: Cannot inject `employee/approval.timeout` via curl — use `timeout_hours: 0.003` DB approach
6. **Scenario E**: Expired tasks end in `Cancelled`, not `Done` (lifecycle line 1451)
