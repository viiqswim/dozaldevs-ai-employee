---
name: slack-conventions
description: 'Use when posting Slack messages, building Block Kit payloads, handling interactive buttons, or implementing approval cards. Covers Socket Mode (never configure an Interactivity URL), the mandatory task-ID context block, user-mention syntax, message-update hygiene, and the manual approval fallback.'
---

## Slack Interactive Buttons — Socket Mode (CRITICAL)

**The Slack app uses Socket Mode. NEVER ask the user to configure an Interactivity Request URL.**

- `SLACK_APP_TOKEN=xapp-...` enables Bolt Socket Mode automatically — confirmed working when gateway logs show `"Slack Bolt — Socket Mode connected"`.
- If a button click does not reach the gateway, it is a **transient WebSocket drop**. Do NOT change Slack app settings.

**Approval action IDs — unified for ALL employees**: The approval card uses three generic action IDs defined in `src/lib/slack-action-ids.ts`: `APPROVE`, `EDIT_AND_SEND`, and `REJECT`. These apply to every employee (guest-messaging, summarizer, google-assistant, and any future employee). The old guest-specific `GUEST_APPROVE`, `GUEST_EDIT`, and `GUEST_REJECT` action IDs have been removed. Handler: `src/gateway/slack/handlers/approval-handlers.ts`.

**Manual approval fallback** (use when button click doesn't work):

```bash
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"<SLACK_USER_ID>","userName":"Victor"}}'
```

## Slack Message Standards

**REQUIRED on every message sent to Slack — no exceptions:**

1. **Task ID context block** — every message MUST include a trailing `context` block with the task ID as small gray metadata:
   ```json
   { "type": "context", "elements": [{ "type": "mrkdwn", "text": "Task `<taskId>`" }] }
   ```
2. **User mention for actions** — use `<@userId>` mrkdwn syntax (never raw username strings). `userId` available from `actionBody.user.id` in handlers.

**Reference implementation**: `src/inngest/employee-lifecycle.ts` (`handle-approval-result` step) and `src/worker-tools/slack/post-message.ts` (`buildApprovalBlocks`).

## Slack Message Hygiene (MANDATORY — No Message Accumulation)

Every task gets ONE primary top-level Slack message per channel. All status progressions MUST use one of:

1. **Replace in place** via `chat.update` — capture `ts` from `postMessage` return value
2. **Thread replies** via `thread_ts` — post follow-up context as replies to the original message

**Rules:**

- NEVER discard a `ts` return value from `postMessage`. Capture and pass `{ ts, channel }` through Inngest steps.
- Every terminal state (Done, Failed, Cancelled) MUST update the original "Task received" notification to reflect the final outcome — never leave it frozen at "⏳ processing".
- The approval card (`pending_approvals.slack_ts`) and the notify-received message are separate — both must be updated at terminal states.

**Reference**: `src/inngest/employee-lifecycle.ts` — `notify-received` (captures ts), `handle-approval-result` (updates both), `mark-failed` (updates to ❌ Failed).

## Action ID Constants

From `src/lib/slack-action-ids.ts`:

```typescript
export const SLACK_ACTION_ID = {
  APPROVE: 'approve',
  EDIT_AND_SEND: 'edit_and_send',
  REJECT: 'reject',
  OVERRIDE_TAKE_ACTION: 'override_take_action',
  OVERRIDE_DISMISS: 'override_dismiss',
  RULE_CONFIRM: 'rule_confirm',
  RULE_REJECT: 'rule_reject',
  RULE_REPHRASE: 'rule_rephrase',
  TRIGGER_CONFIRM: 'trigger_confirm',
  TRIGGER_CANCEL: 'trigger_cancel',
} as const;
```

Always import from `src/lib/slack-action-ids.ts` — never hardcode action ID strings inline.
