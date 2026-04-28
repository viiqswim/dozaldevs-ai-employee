# Learnings — gm05-slack-approval-card

## Architecture Decisions

- Button values: Approve/Reject carry plain taskId string; Edit carries JSON `{taskId, draftResponse}` (truncated at 1900 chars to stay under Slack 2000-char limit)
- Action IDs use `guest_` prefix to avoid collision with existing `approve`/`reject` (summarizer)
- Modal infrastructure: first `boltApp.view()` handlers in platform — register inside `registerSlackHandlers()`
- rejectionReason stored in `tasks.metadata` (NOT `feedback` table)
- editedContent patches `deliverables.content` JSON before delivery machine spawns

## Key File Paths

- Shell tool: `src/worker-tools/slack/post-guest-approval.ts` (NEW)
- Type extension: `src/lib/classify-message.ts`
- Handlers: `src/gateway/slack/handlers.ts` (add guest_approve, guest_edit, guest_reject + 2 view handlers)
- Lifecycle: `src/inngest/employee-lifecycle.ts` (handle-approval-result step)
- Archetype: `prisma/seed.ts` VLRE_GUEST_MESSAGING_INSTRUCTIONS
- Tests: `tests/worker-tools/slack/post-guest-approval.test.ts`, `tests/gateway/slack/guest-handlers.test.ts`

## Reference Files

- Standalone MVP blocks: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-blocks/blocks.ts`
- Standalone MVP handlers: `/Users/victordozal/repos/real-estate/vlre-employee/skills/slack-bot/approval-handlers.ts`
- Pattern: `src/worker-tools/slack/post-message.ts` (do NOT modify)
- Pattern: `src/gateway/slack/handlers.ts:176-251` (existing approve handler)

## Guardrails (CRITICAL)

- DO NOT modify post-message.ts or its buildApprovalBlocks()
- DO NOT change existing 'approve' / 'reject' action IDs
- DO NOT change existing ClassifyResult fields (additive only)
- DO NOT add openModal to SlackClient interface

## ClassifyResult New Fields

guestName, propertyName, checkIn, checkOut, bookingChannel, originalMessage, leadUid, threadUid, messageUid
All optional (?) — backward compat mandatory
