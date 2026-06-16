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

## Slack Web API Gotchas (cause silent failures)

These two traps each caused a silent production-style failure. Both are easy to reintroduce.

### 1. `chat.update` requires a channel ID — `chat.postMessage` accepts a name

`chat.postMessage` accepts a plain channel NAME (e.g. `victor-tests`) and resolves it internally; its response returns the canonical channel ID in `response.channel`. `chat.update` does NOT accept names — it rejects them with `channel_not_found`.

**Rule**: when you post a message you will later update, persist `result.channel` (the resolved ID from the postMessage response), NEVER the input channel value. Storing the name means the post succeeds but every later `chat.update` silently fails (`channel_not_found`) — e.g. a "Processing" status that never flips to "Complete".

This applies wherever a channel may be a plain name — which is everywhere now that employees use plain channel names. Worker-side updates that run from `process.env` must receive the resolved ID too: the lifecycle injects `NOTIFY_MSG_CHANNEL` (the resolved ID) for this; prefer it over `NOTIFICATION_CHANNEL` (which may be a name).

**Reference**: `src/inngest/lifecycle/steps/triage-and-ready.ts` and `override-card.ts` (store `result.channel`); `src/inngest/lifecycle/lib/machine-provisioner.ts` (injects `NOTIFY_MSG_CHANNEL`); `src/workers/lib/harness-helpers.mts` (prefers it for failure updates).

### 2. `header` blocks hard-cap at 150 characters — the emoji prefix counts

A Block Kit `header` block's `plain_text` must be < 151 chars. The prefix counts toward the limit. Slicing the summary to 150 and THEN prepending a prefix (`📝 ` + 150 chars = 152+) overflows and Slack rejects the ENTIRE message with `invalid_blocks` — so an approval card never posts, the task strands in `Reviewing`, and (with the zombie guard) routes to `Failed`.

**Rule**: build the full header string (prefix + text) and slice the WHOLE thing to a safe cap (use 148 — emoji can count as >1 char in Slack's tally): `` `${prefix}${summary}`.slice(0, 148) ``. Never slice the text first and prepend after.

**Reference**: `src/workers/lib/approval-card-poster.mts` (`buildApprovalBlocks`).

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

---

## Slack Voice & Tone (MANDATORY — Every Message, No Exceptions)

**Every Slack message MUST sound like a person wrote it — not a machine.** Applies to all contexts: trigger confirmations, approval cards, status updates, error messages, missing-info prompts, terminal-state notifications.

Before writing Slack copy, ask: _"Would a thoughtful colleague send this exact message?"_ If no, rewrite it.

**Forbidden (robotic):** Status codes as prose (`"Task status: NEEDS_APPROVAL"`), passive system-speak (`"Your request is being processed."`), dry confirmations (`"Operation completed successfully."`), all-caps emphasis, filler preamble.

**Required (human):** First person present active voice (`"On it — I'll post results here."`), `<@userId>` mentions, acknowledge before pivoting, friendly closure (`"✅ Done — I'm on it."`), empathetic failure framing (`"Something went wrong — mind trying again?"`).

**Centralise copy in named constants** (e.g. `loadingMessage(roleName)`) — inline prose scattered across handler logic is a tone-consistency risk.

---

## Known Issue: Slack OAuth Redirect URI Requires a Stable Public URL

Use the named Cloudflare Tunnel (`local-ai-employee.dozaldevs.com`) — tunnel `e160ac6d-2d7d-47c4-a552-b13700947d29` at `~/.cloudflared/ai-employee-local.yml`. `pnpm dev` starts it automatically. For new contributors: create your own subdomain and ask the repo owner to register the redirect URL.

---

## Known Issue: Stale Detached Processes from Previous `pnpm dev` Sessions

**Symptom**: @mention triggers produce no Slack response ~50% of the time, or produce responses from stale code. Gateway logs show the event was received but step outputs are missing.

**Root cause**: `tsx watch` spawns two processes (SUPERVISOR + CHILD node leaf). The old reaper pattern killed the supervisor but left the leaf alive, keeping the Slack Socket Mode WebSocket open as a zombie.

**Diagnosis**: `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` — should return 1.

**Fix**: `dev.ts` Step 0 preflight kills all three process forms. If still stale: `pkill -f "$(pwd).*src/gateway/server.ts" || true`

**Prevention**: Always stop `pnpm dev` with Ctrl+C (SIGINT). `src/gateway/lib/socket-mode-lock.ts` prevents a second gateway from connecting Socket Mode even if the reaper misses a zombie.

---

## Known Issue: Phantom Socket Mode Connections + Dev/Prod Shared Token

**Symptom**: `@mention` produces no response intermittently (roughly 1-in-N), even with a single local gateway process. No gateway log for the missed event.

**Root cause A — dev/prod shared `SLACK_APP_TOKEN`**: Production (Render) and local `pnpm dev` share the same `SLACK_APP_TOKEN`. Slack round-robins each event across ALL open sockets. ~50% land on prod, which silently drops them. **Resolution**: each developer creates their own Slack app at `api.slack.com`, gets a personal `xapp-` token, sets `SLACK_APP_TOKEN=xapp-<personal>` in local `.env`. See `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`.

**Root cause B — phantom socket** (Slack-side stranded WebSocket): An unclean gateway death leaves a WebSocket registered with Slack. Events delivered to the phantom vanish silently. The local process count check returns `1` even when a phantom is present.

**Prevention in place**: (1) Single-instance guard in `dev.ts` exits 1 if another instance is already running. (2) Grace-wait `killAndWait()` waits for old gateway to fully exit before starting new one. (3) Gateway logs `"Socket Mode WS closed cleanly"` after `bolt.stop()`.

**Diagnose phantom**: `num_connections` in the Socket Mode `hello` frame. If `> (local gateways + 1)`, a phantom is present. Wait for Slack to expire it (typically minutes).

**Operational rule**: Run exactly ONE `pnpm dev` at a time. Always stop with Ctrl+C.

**`SLACK_BOT_TOKEN` note**: Not used for Socket Mode auth. Bolt reads `tenant_secrets.slack_bot_token` via `TenantInstallationStore.fetchInstallation`. The env var is a legacy artifact.
