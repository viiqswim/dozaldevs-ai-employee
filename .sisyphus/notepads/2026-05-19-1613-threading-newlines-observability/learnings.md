# Learnings — 2026-05-19-1613-threading-newlines-observability

## [2026-05-19] Plan Start

### Key Patterns

- `post-guest-approval.ts:235-236` has the reference `\n` normalization pattern: `.replace(/\\n/g, '\n')`
- `buildNotifyBlocks` is in `src/lib/slack-blocks.ts` around line 391
- `buildNotifyStateBlocks` is in `src/lib/slack-blocks.ts` around line 60
- Inngest `runId` is accessed via `async ({ event, step, runId }) => {}` — currently only `{ event, step }` at line 133
- All 15 call sites: lines 248, 616, 680, 761, 1040, 1083, 1361, 1458, 1614, 1817, 1885, 2037, 2096, 2143, 2348

### Architecture Decision

- Factory pattern chosen over per-call `runId` injection — `createTaskNotifyBuilders({ taskId, runId })` returns `{ notifyBlocks, notifyStateBlocks }` pre-configured
- `runId` stored in `tasks.metadata` JSON as `inngest_run_id` — no migration needed (same pattern as `notify_slack_ts`)
