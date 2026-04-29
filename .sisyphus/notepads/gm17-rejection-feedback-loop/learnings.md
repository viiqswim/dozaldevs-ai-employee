# Learnings — GM-17 Rejection Feedback Loop

## [2026-04-29] Session Start

### Key File Locations

- Lifecycle rejection branch: `src/inngest/employee-lifecycle.ts` lines 870-923 (else block in handle-approval-result step)
- SlackClient interface: `src/lib/slack-client.ts` line 34 (SlackMessageParams), postMessage impl lines 46-76
- Interaction handler route-and-store: `src/inngest/interaction-handler.ts` lines 71-102
- Feedback table schema: `prisma/schema.prisma` lines 142-161
- FEEDBACK_CONTEXT builder: `src/inngest/employee-lifecycle.ts` lines 153-211
- Feedback summarizer: `src/inngest/triggers/feedback-summarizer.ts` lines 56-121

### Architecture Decisions

- `thread_ts` added as optional param to `postMessage` only — no breaking changes
- Task metadata used to flag rejection feedback pending: `rejection_feedback_requested: true`, `rejection_user_id: actorUserId`
- Interaction handler checks BEFORE LLM classification: if task is Cancelled + flags match + userId matches → `rejection_reason` type
- JSON merge for metadata (not overwrite) — fetch current metadata first, spread, then PATCH

### Canonical Constants

- Thread reply message: `"Got it, <@{userId}>. What should I have done differently? (Reply here — I'll learn from it.)"`
- New feedback_type: `rejection_reason`
- New task metadata keys: `rejection_feedback_requested` (boolean), `rejection_user_id` (string)

### Pre-existing LSP Errors (NOT our bugs — do not fix)

- `prisma/seed.ts`: `knowledgeBaseEntry` → `knowledgeBase` (other team's work)
- `tests/inngest/lib/create-task-and-dispatch.test.ts`: missing `tenantId` param
- `tests/setup.ts`: `knowledgeBaseEntry` reference
- `src/gateway/services/kb-repository.ts`: `KnowledgeBaseEntry` type reference
- `tests/inngest/redispatch.test.ts:53`: mock missing `updateMessage` — Task 1 should fix this as a side effect

### Test Patterns (from research)

- `vi.hoisted()` for all mocks in lifecycle tests
- `vi.mock('@prisma/client')`, `vi.mock('../../src/lib/slack-client.js')`, `vi.mock('../../src/gateway/services/tenant-env-loader.js')`
- `vi.stubGlobal('fetch', buildFetchMock(...))` with URL pattern matching for PostgREST
- InngestTestEngine + step.run switch-case pattern
- Direct function invocation for interaction handler: `(fn as any).fn({ event, step })`
