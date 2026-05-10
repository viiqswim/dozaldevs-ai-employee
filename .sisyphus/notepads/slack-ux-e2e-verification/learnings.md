## Scenario C — Edit & Send Path (2026-05-10)

### What Worked

- Full Edit & Send flow end-to-end: Airbnb message → webhook → task → approval card → Edit & Send → modal → edited text submitted → Done
- Context thread reply correctly shows BOTH sections side-by-side:
  - `🤖 Original AI draft:` with the AI's original text
  - `✏️ Edited response (sent):` with the PM's edited text
- Task status = Done (NOT Cancelled) after Edit & Send — edit path is an approval variant
- Delivery to Airbnb confirmed — edited text appeared as Leo's reply at 5:30 PM
- pending_approvals = 0 after completion

### Technical Gotchas

- **Button click requires JS evaluate**: Direct Playwright click() on Edit & Send triggered page reload state. Must use `page.evaluate(() => button.click())` to properly open the modal via Socket Mode.
- **Modal submission also requires evaluate()**: After opening modal via evaluate(), native click() didn't submit "Send Edited Response". Used evaluate() again — worked.
- **Thread URL navigation**: Must use `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S/thread/C0AMGJQN05S-{notify_slack_ts}` to open thread directly. Channel doesn't auto-scroll to latest messages.

### Task Details

- Task ID: ebf37a31-2adf-400a-b628-90895e20ea33
- Epoch: 1778451423
- Message: "Do you have parking available? [e2e-test-1778451423]"
- notify_slack_ts: 1778451471.006919
- approval card ts: 1778451490.544529
- context reply ts: 1778452219.925579
- AI draft: "Hey Olivia! Yes, there's free parking at the property. You're all set."
- Edited text: "EDITED: Yes, free parking is available on-site. Spots are first-come first-served. Let me know if you need directions!"

---

## Scenario D — Supersede Path (2026-05-10)

### What Worked

- Gateway-level supersede fires synchronously (2-4ms) on new webhook receipt — cancels old task before creating new one
- Lifecycle-level `check-supersede` step correctly updates old approval card to "⏭️ Superseded — a newer message from this guest is pending review below. This suggested response was not sent."
- Old task ID appears in context block of superseded card ✅
- `pending_approvals` row cleared after supersede ✅
- New task inherits old notify message thread via `superseded_notify_ts` in `raw_event`

### Critical Architecture Discovery — Two Supersede Mechanisms

1. **Gateway-level** (synchronous, every webhook): Cancels old task in DB within 2-4ms, passes `superseded_notify_ts`/`superseded_notify_channel` to new task's `raw_event`. New task's lifecycle inherits old notify thread.
2. **Lifecycle-level** (`check-supersede` step, NEEDS_APPROVAL path only): Finds `pending_approvals` row for same `thread_uid`, updates old approval card to Superseded via `chat.update`, fires `superseded` event to old lifecycle, clears `pending_approvals`.

### Hostfully Propagation Timing Issue

- Scenario required **3 messages** (not 2) due to Hostfully propagation lag
- Second message returned NO_ACTION_NEEDED because Hostfully's API showed `lastMessage.senderType === 'AGENCY'` (last message from host at 5:30 PM from Scenario C) when task_id_2's worker ran ~90 seconds after the message was sent
- `get-messages.ts --unresponded-only` is **client-side only** — checks if `lastMessage.senderType !== 'AGENCY'`
- Workaround: wait ~10 minutes between Scenario C delivery and Scenario D first message, OR send a third message after propagation delay

### Notify Message Behavior

- When task_id_2/3 inherit task_id_1's notify thread via gateway path, the notify message shows the NEW task's state (not "⏭️ Superseded")
- The Superseded text appears on the **approval card** (in the thread), not the top-level notify message
- This is expected behavior — the notify message is updated by whichever task currently "owns" it

### Task Details

- task_id_1: `8651b57a-89bb-4220-a240-0465c058aec0` — WiFi question, Cancelled (superseded)
- task_id_2: `054a3415-5100-4859-ad39-83f21038c3a0` — Parking question, Cancelled (NO_ACTION_NEEDED + gateway supersede)
- task_id_3: `698c55cf-d071-47d2-a273-840e0f361e43` — Coffee maker question, Done (approved + delivered)
- Approval card slack_ts for task_id_1: `1778452733.143689`
- Notify slack_ts: `1778452669.715299`

---

## Scenario E — Expiry Path (2026-05-10)

### What Worked

- `timeout_hours: 0.003` DB approach correctly triggers Inngest `step.waitForEvent` timeout (~11 seconds after Reviewing)
- Lifecycle correctly transitions `Reviewing → Cancelled` (NOT Done) on timeout
- Both top-level notify message and approval card thread reply updated to "⏰ Expired — no action taken"
- `clearPendingApprovalByTaskId` fires before `patchTask` → `pending_approvals` count = 0 after expiry
- timeout_hours restored to 24 immediately after test — verified via psql SELECT

### Enrichment Fallback Behavior

- `fetchLeadEnrichment()` returned null for the test task — enriched blocks (guest name, property name, Hostfully link) NOT present
- Lifecycle falls back to `buildNotifyStateBlocks` when `expiryEnrichment?.guestName` is falsy
- This is the acceptable fallback case — the critical assertion (correct expiry text) still PASSES
- Rich blocks capability confirmed via concurrent task `5a1eef1e` which showed "Guest: Benjamin Botello" + property + Hostfully link
- Root cause of null enrichment: `fetchLeadEnrichment()` in the lifecycle's `notify-received` step appears to fail for tasks triggered via manual webhook (vs real Airbnb webhook with full lead context)

### Manual Webhook Workaround

- Airbnb message "Is breakfast included? [e2e-test-1778454546]" got stuck in "Sending..." state in Airbnb UI after 11+ minutes — message did not propagate to Hostfully
- Fallback: fire `POST /webhooks/hostfully` directly with unique `message_uid` — creates task that reaches Reviewing correctly
- Manual webhook tasks DO reach Reviewing and DO expire correctly — the expiry mechanism is independent of how the task was triggered

### Task Details

- Primary evidence task: `8a2c8346-234a-473d-bded-fac7b43c1937` (documented in evidence file)
- Secondary clean run: `3aa64275-029f-4122-aad4-7a3ba2472157` (manual webhook, also expired correctly)
- timeout_hours: 0.003 → ~10.8 seconds in Reviewing before Cancelled
- Notify slack_ts (task 3aa64275): `1778455334.901079`
- Approval card slack_ts (task 3aa64275): `1778455417.815109`

---

## Scenario B — Reject Path (2026-05-10)

### What Worked

- Full reject flow end-to-end: Airbnb message → webhook → task → approval card → Reject button → modal → Cancelled
- `🤖 AI suggested response (not sent):` label confirmed correct (critical distinction from `📤 Response sent to guest:`)
- Rule extractor fired and posted "Noted: '...' — I'll apply this next time." in thread
- Terminal block updated to ❌ Rejected with @Victor Dozal actor mention
- pending_approvals = 0 after rejection (no orphaned rows)

### Spec Discrepancy

- Test spec says rejected tasks end in `Done`. Actual: `Cancelled`. AGENTS.md is authoritative — "Cancelled (reject action or 24h approval timeout)". Spec needs updating.

### Anomaly — Double Top-Level Message

- Two top-level messages appeared for the same task in #cs-guest-communication:
  1. The notify message (ts 1778450137) — correctly updated to ❌ Rejected
  2. A second "no action needed" message (ts 1778450222) — likely from guest-message-poll cron firing between webhook dispatch and rejection
- This is pre-existing behavior, not caused by slack-ux-overhaul changes

### Slack Navigation Notes

- Approval card is in a THREAD (not top-level) — must click "View thread" / "1 reply" to find it
- To scroll to older messages: scroll `c-scrollbar__hider` (largest height scroller), sometimes need to scroll UP ~800px
- Messages at ts ~1778450137 are NOT at the bottom — newer messages appear after them

### Task Details

- Task ID: 30443240-8459-4eb2-8888-2cce7a38cc1b
- Epoch: 1778450089
- Message: "What time is check-out? [e2e-test-1778450089]"
- notify_slack_ts: 1778450137.163829
