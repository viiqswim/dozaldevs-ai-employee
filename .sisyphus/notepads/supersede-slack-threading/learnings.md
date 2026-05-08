# Learnings — supersede-slack-threading

## Project conventions
- `pnpm tsc --noEmit` for type checking (pre-existing errors in scripts/verify-multi-tenancy.ts and tests/inngest/interaction-handler-injection.test.ts — ignore)
- `pnpm test -- --run` for tests (pre-existing failures: container-boot.test.ts, inngest-serve.test.ts — ignore)
- PostgREST on port 54331, Postgres on 54322, DB: ai_employee
- Gateway auto-restarts via tsx watch — no manual restart needed
- NEVER use --no-verify on commits
- NEVER add Co-authored-by or AI references to commits
- Approved models ONLY: minimax/minimax-m2.7 (execution), anthropic/claude-haiku-4-5 (judge)

## Key file locations
- src/inngest/employee-lifecycle.ts — universal lifecycle (1759+ lines)
- src/gateway/routes/hostfully.ts — webhook handler (166 lines)
- src/worker-tools/slack/post-guest-approval.ts — approval card shell tool
- prisma/schema.prisma — DB schema
- prisma/seed.ts — archetype seeds incl. guest-messaging instructions

## notify-received step (lines 191-272)
- Returns { ts, channel, enrichment }
- Guest-messaging enriched path returns at ~line 246
- Generic path returns at ~line 267
- slackClient.postMessage / slackClient.updateMessage both available

## Supersede logic (hostfully.ts lines 92-133)
- findFirst selects { id, status } — we need to add metadata
- Cancels non-Executing/Validating tasks
- Creates new task with raw_event

## Metadata write pattern (lifecycle lines 1549-1557)
- Read existing metadata from DB
- Merge new keys with existing (don't overwrite)
- PATCH back via PostgREST

## patchTask helper / PostgREST pattern
- Lifecycle uses fetch to /rest/v1/tasks?id=eq.<id> with PATCH method
- Must merge metadata: { ...existingMetadata, ...newKeys }

## Wave 1 execution order
- T1 (migration) + T3 (post-guest-approval.ts) run in parallel — no deps
- T2 waits for T1 (needs metadata column to exist)
- T4 waits for T1 (needs Prisma types regenerated)

## Task 3 — reply-broadcast flag (post-guest-approval.ts)
- Added `replyBroadcast: boolean` to `GuestApprovalParams` interface (line 26)
- Added `let replyBroadcast = false;` in parseArgs (line 54)
- Added `} else if (args[i] === '--reply-broadcast') { replyBroadcast = true; }` in the for loop (after --dry-run, before --conversation-ref, ~line 94)
- Added `replyBroadcast` to the return object of parseArgs (line 121)
- Empty-string guard: `const effectiveThreadTs = params.threadTs && params.threadTs.length > 0 ? params.threadTs : undefined;` (line 339)
- postMessage uses spread pattern: `...(effectiveThreadTs ? { thread_ts: effectiveThreadTs } : {})` and `...(params.replyBroadcast && effectiveThreadTs ? { reply_broadcast: true } : {})` — cast to `Parameters<typeof client.chat.postMessage>[0]` to avoid Slack union type conflict (BroadcastedThreadReply vs WithinThreadReply)
- Test fixture `baseParams` needed `replyBroadcast: false` added (line 76 in test file)
- Slack type `reply_broadcast` is part of a union: `BroadcastedThreadReply` (boolean) vs `WithinThreadReply` (false | undefined) — spread of `{}` makes it `true | undefined` which conflicts; solution: cast the whole args object

## Task 1 — metadata column migration (completed 2026-05-08)
- Migration timestamp: 20260508143607
- Migration file: prisma/migrations/20260508143607_add_tasks_metadata/migration.sql
- SQL: `ALTER TABLE "tasks" ADD COLUMN "metadata" JSONB;`
- Field added AFTER triage_result in Task model (line 35 in schema.prisma)
- Pattern copied from Deliverable model's `metadata Json?` (line 92)
- `pnpm prisma migrate dev` blocked by drift (column defaults differ between migration history and actual DB — pre-existing issue)
- Workaround: manually created migration dir + SQL file, applied SQL directly via psql, recorded in _prisma_migrations table, then ran `pnpm prisma generate`
- Drift is cosmetic (default values on id/updated_at columns) — does not affect functionality
- Prisma types regenerated successfully (exit 0)
- tsc --noEmit exits 0 (pre-existing errors in test files are not blocking)
- Evidence saved to .sisyphus/evidence/task-1-migration-column.txt (gitignored)

## Task 6 — supersede threading tests (completed 2026-05-08)
- Test file: tests/inngest/supersede-threading.test.ts
- 4 tests: 2 webhook handler supersede tests + 2 post-guest-approval shell tool tests
- Webhook tests use exact same makeApp/makeValidPayload pattern as tests/gateway/routes/hostfully.test.ts
- Shell tool tests (empty thread-ts, reply-broadcast) use same vi.mock + beforeEach/afterEach pattern as post-guest-approval.test.ts
- GOTCHA: post-guest-approval.ts auto-runs main() at module load (line 388). When imported in tests, the auto-run fires once with whatever process.argv is set. This means postMessage is called N+1 times (auto-run + explicit main() call). Fix: use toHaveBeenCalled() + .mock.calls.at(-1) instead of toHaveBeenCalledOnce() + .mock.calls[0]
- The existing --thread-ts flag tests in post-guest-approval.test.ts avoid this via vi.hoisted() which sets process.argv with --dry-run before module load, preventing the auto-run from calling postMessage
- No regressions: hostfully.test.ts 14/14 passing

## PostgREST schema cache (discovered during E2E 2026-05-08)
- After adding a new column via raw SQL (not `prisma migrate dev`), PostgREST caches the old schema and silently ignores writes to the new column
- Symptom: PATCH returns HTTP 204 but the column stays NULL; no error in logs
- Fix: `NOTIFY pgrst, 'reload schema'` via psql — takes effect immediately, no restart needed
- Command: `PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "NOTIFY pgrst, 'reload schema';"`
- Must be run after every raw SQL migration that adds columns (not needed for `prisma migrate dev` which triggers reload automatically)

## Supersede chain gap (discovered during E2E 2026-05-08)
- The supersede branch in `notify-received` returns early (line 259 / 337) WITHOUT writing `notify_slack_ts` to the new task's metadata
- Impact: if task 3 supersedes task 2 (which was itself a superseded task), `hostfully.ts` reads task 2's metadata to find `notify_slack_ts` — but it's NULL, so `superseded_notify_ts` is not passed to task 3, breaking the chain
- Fix: after `updateMessage` succeeds in the supersede branch, write `{ notify_slack_ts: supersededNotifyTs, notify_slack_channel: supersededNotifyChannel }` to the new task's metadata before returning
- This ensures every task (whether superseded or not) always has `notify_slack_ts` in metadata for future supersede lookups
