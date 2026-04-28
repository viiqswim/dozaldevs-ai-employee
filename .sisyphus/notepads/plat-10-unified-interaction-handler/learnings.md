# Learnings — plat-10-unified-interaction-handler

## Conventions

- All DB operations inside Inngest functions use PostgREST fetch(), NOT Prisma
- Inngest function test pattern: `(fn as any).fn({ event, step })` direct invocation
- `makeStep()` defined locally per test file — never shared
- `vi.hoisted()` required for mock refs used inside `vi.mock()` factories
- Model for classification: `anthropic/claude-haiku-4-5`, taskType: 'review'
- All Slack acks must include: `thread_ts` + task ID context block (AGENTS.md requirement)
- PostgREST headers: `apikey: SUPABASE_ANON_KEY`, `Authorization: Bearer SUPABASE_SECRET_KEY`

## File Locations

- feedback-handler.ts → src/inngest/feedback-handler.ts (to be DELETED)
- mention-handler.ts → src/inngest/mention-handler.ts (to be DELETED)
- feedback-responder.ts → src/inngest/feedback-responder.ts (to be DELETED)
- MentionHandler service → src/gateway/services/mention-handler.ts (to be DELETED)
- FeedbackService → src/gateway/services/feedback-service.ts (CHECK CALLERS BEFORE DELETING)
- serve.ts → src/gateway/inngest/serve.ts (to be UPDATED)
- Bolt handlers → src/gateway/slack/handlers.ts (only 2 inngest.send() calls to change)

## Event Names

- OLD: employee/feedback.received, employee/feedback.stored, employee/mention.received
- NEW: employee/interaction.received
- GM-18 stub: employee/rule.extract-requested { tenantId, feedbackId, feedbackType, source }
- Task stub: employee/task.requested { tenantId, text, userId, channelId, archetypeId }

## Feedback Table Types

- thread_reply: thread reply linked to taskId
- mention_feedback: @mention with feedback intent (no taskId)
- teaching: teaching intent (no taskId)

## Pre-existing Test Failures (DO NOT FIX)

- container-boot.test.ts
- inngest-serve.test.ts
- tests/inngest/integration.test.ts

## Task 7 — Full Verification (Mon Apr 27 2026)

- BUILD: pnpm build exits 0 — TypeScript compiles cleanly
- LINT: pnpm lint exits 1 — 6 pre-existing errors in src/worker-tools/hostfully/\*.ts (while(true) loops, no-constant-condition). NOT introduced by PLAT-10. 95 warnings also pre-existing.
- TESTS: 15 failed | 101 passed | 3 skipped (119 files). 64 failed | 1244 passed | 17 skipped (1325 tests).
  - All 15 failing files are pre-existing (deprecated engineering components, stale tests)
  - PLAT-10 new tests: interaction-handler.test.ts (18 ✓), interaction-classifier.test.ts (20 ✓)
  - PLAT-10 deleted tests: feedback-service, mention-handler, feedback-handler, feedback-responder (all removed with deprecated handlers)
  - No new failures introduced by PLAT-10
- Evidence saved to .sisyphus/evidence/task-7-full-verification.txt and task-7-new-tests-included.txt

## InteractionClassifier (Task 1)

- Classifier uses dependency injection for callLLM — constructor param, not module import
- This makes it trivially testable without `vi.mock` — just pass a vi.fn()
- `resolveArchetypeFromChannel` does TWO fetches: exact channel match, then fallback to first tenant archetype by created_at.asc
- `resolveArchetypeFromTask` does TWO fetches: task → archetype. Returns null if task has no archetype_id
- PostgREST headers must use SUPABASE_ANON_KEY for `apikey` and SUPABASE_SECRET_KEY for `Authorization: Bearer`
- All vi.stubGlobal('fetch', ...) tests must call vi.unstubAllGlobals() in afterEach
- 20 tests total: 11 for classifyIntent, 4 for resolveArchetypeFromChannel, 5 for resolveArchetypeFromTask

## Task 9: Story Map Update (2026-04-27)

- PLAT-10 acceptance criteria are at lines 490-501 of `docs/2026-04-21-2202-phase1-story-map.md`
- 12 acceptance criteria total, all marked `[x]` as complete
- `.sisyphus/evidence/` is in `.gitignore` — evidence files cannot be committed; they exist only locally
- Committed with: `docs: mark PLAT-10 unified interaction handler as complete in story map`

## Task 8 — Inngest Function Registration Verification (2026-04-27)

### Finding: Gateway was running stale compiled binary
- Port 7700 was served by PID 73697 running `dist/gateway/server.js` compiled BEFORE T4 changes
- The tsx process (PID 37533) was NOT serving port 7700 — it was a dev-start script process
- Inngest dev server was synced with the old gateway → showed 9 functions (old handlers present)

### Fix Applied
1. Killed old gateway process (PID 73697)
2. Started new gateway with `node dist/gateway/server.js` (built at 14:27 with T4 changes)
3. Inngest auto-re-synced → now shows 7 functions

### Verified Function List (7 total)
- `ai-employee-engineering/task-lifecycle`
- `ai-employee-engineering/task-redispatch`
- `ai-employee-engineering/watchdog-cron`
- `ai-employee-employee/universal-lifecycle`
- `ai-employee-trigger/daily-summarizer`
- `ai-employee-trigger/feedback-summarizer`
- `ai-employee-employee/interaction-handler` ← NEW ✅

### Absent (as expected)
- `employee/feedback-handler` ✅ gone
- `employee/mention-handler` ✅ gone
- `employee/feedback-responder` ✅ gone

### Inngest API Endpoint for Function List
`GET http://localhost:8288/v1/apps/ai-employee/functions` → returns array with `.id` fields
(NOT `/v1/fns` which returns 404)

### Evidence Files
- `.sisyphus/evidence/task-8-inngest-functions.txt`
- `.sisyphus/evidence/task-8-dev-start.txt`
