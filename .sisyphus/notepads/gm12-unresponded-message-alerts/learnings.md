# GM-12 Learnings

## Key Conventions

- PostgREST operators: `eq.`, `is.null`, `lt.`, `in.(...)` in query params
- Trigger factory pattern: `createXxxTrigger(inngest: Inngest): InngestFunction.Any`
- All DB work via `step.run()` for Inngest durability
- Bot tokens encrypted AES-256-GCM in `tenant_secrets` — use `decrypt()` from `src/lib/encryption.ts`
- `PendingApproval` table at `/rest/v1/pending_approvals` — PostgREST base
- `makeHeaders(supabaseKey)` in `pending-approvals.ts` for consistent auth headers
- Slack permalink: `https://slack.com/archives/{channelId}/p{slackTs.replace('.', '')}`
- Test pattern: `vi.hoisted()` + `vi.stubGlobal('fetch', makeMockFetch(...))` + restore in `afterEach`

## Pre-existing TS Errors (NOT our bugs — ignore)

- `prisma/seed.ts`: `knowledgeBaseEntry` → `knowledgeBase` (pre-existing, unrelated)
- `tests/inngest/lib/create-task-and-dispatch.test.ts`: missing `tenantId` (pre-existing)
- `tests/setup.ts`: `knowledgeBaseEntry` (pre-existing)
- `tests/inngest/redispatch.test.ts`: missing `updateMessage` (pre-existing)
- `src/gateway/services/kb-repository.ts`: `KnowledgeBaseEntry` (pre-existing)
