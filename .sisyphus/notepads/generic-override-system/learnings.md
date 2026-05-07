# Learnings — generic-override-system

## [2026-05-06] Session Start

### Critical Architecture Decisions

- Dismiss handler fires `employee/override.requested` with `direction: null` (not a separate event) — lifecycle uses single waitForEvent
- `isTaskPendingReplyAnyway` (handlers.ts:88-117) → renamed/replaced by `isTaskAwaitingOverride`
- `NO_ACTION_BUTTON_BLOCKS` (handlers.ts:169-181) → REMOVED
- `guest_reply_anyway` handler (handlers.ts:712-794) → REMOVED

### Key Line References (original, may shift after edits)

- `employee-lifecycle.ts:540-550` — infinite loop guard (REMOVE)
- `employee-lifecycle.ts:572-586` — `cleanup-no-action` step (KEEP, override card goes AFTER this)
- `employee-lifecycle.ts:588-592` — `wait-for-reply-anyway` (REPLACE with `wait-for-override`)
- `employee-lifecycle.ts:594-670` — timeout handling (REPLACE with generic version)
- `employee-lifecycle.ts:673-877` — Reply Anyway re-run flow (DELETE)
- `handlers.ts:516-568` — `guest_edit` modal (REFERENCE pattern for override_take_action)
- `handlers.ts:571-653` — `guest_edit_modal` view (REFERENCE pattern for override_take_action_modal)

### Patterns to Follow

- Slack modal: `client.views.open()`, `callback_id`, `private_metadata: JSON.stringify({taskId, channelId, messageTs})`
- Modal submit: parse private_metadata, validate non-empty, fire Inngest event, update message
- Task creation: PostgREST POST /rest/v1/tasks, then inngest.send('employee/task.dispatched')
- ack with replace_original for Socket Mode processing state
- loadTenantEnv pattern: `new PrismaClient()`, `loadTenantEnv(tenantId, {tenantRepo, secretRepo}, notifChannel)`, `$disconnect()`

### Pre-existing Test Failures (DO NOT FIX)

39 total: opencode-server(7), fallback-pr(11), branch-manager(1), between-wave-push(1), lifecycle-guest-delivery(1), rule-handlers(2), interaction-handler-rejection-feedback(7), inngest-serve(1), schema(1), admin-property-locks(2), installation-store(1), employee-dispatcher(1), jira-webhook-with-new-project(1), summarizer-trigger(2)
