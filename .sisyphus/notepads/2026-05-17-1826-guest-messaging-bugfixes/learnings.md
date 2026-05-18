# Learnings

## [2026-05-17] Session Init

### Key File Locations
- Inline poll loop (BUG TARGET): `src/inngest/employee-lifecycle.ts` ~line 570 — exits on 'Submitting'|'Failed' only
- Poll library (DO NOT TOUCH): `src/inngest/lib/poll-completion.ts` — already handles Cancelled
- Dedup hard-block array (BUG TARGET): `src/gateway/routes/hostfully.ts` ~line 109 — ['Executing','Validating']
- sentSnippet (BUG TARGET): `src/lib/slack-blocks.ts` ~line 208 — no \n normalization
- draftResponse (BUG TARGET): `src/worker-tools/slack/post-guest-approval.ts` ~line 253 — no \n normalization
- originalMessage (ALREADY FIXED): `src/worker-tools/slack/post-guest-approval.ts` line 235 — has .replace(/\\n/g, '\n')
- tryAutoPostApprovalCard (BUG TARGET): `src/workers/opencode-harness.mts` ~line 165 — missing threadTs
- postApprovalCard (ALREADY SUPPORTS threadTs): `src/workers/lib/approval-card-poster.mts` line 19 — interface has threadTs?: string; line 126 passes it to Slack
- NOTIFY_MSG_TS injection: `src/inngest/employee-lifecycle.ts` lines 505, 534 — can be empty string, must guard with || undefined
- SKILL.md (BUG TARGET): `src/workers/skills/tool-usage-reference/SKILL.md` — example invocation missing --thread-ts
- seed.ts (BUG TARGET): `prisma/seed.ts` archetype ID 00000000-0000-0000-0000-000000000015 — both create + upsert blocks

### Pattern References
- mark-failed step in employee-lifecycle.ts: reference for Cancelled handling pattern (Slack update + machine destroy + return)
- handle-approval-result step ~line 1910: reference for buildSupersededBlocks() usage
- buildSupersededBlocks() in slack-blocks.ts line 5: pre-built superseded block layout
- Existing \n normalization at post-guest-approval.ts line 235: exact pattern to copy for draftResponse fix

### Constraints
- NEVER modify src/inngest/lib/poll-completion.ts
- NEVER add guest-specific fields to approval-card-poster.mts (employee-agnostic)
- NEVER add Reviewing/Submitting to hostfully.ts hard-block list
- Guard NOTIFY_MSG_TS with || undefined (can be empty string)
- Archetype instruction changes are surgical only — do NOT rewrite full block

## Task 1 — Ghost Worker Fix (Cancelled poll exit)

**Pattern location**: `src/inngest/employee-lifecycle.ts`, inline poll loop inside `step.run('poll-completion', ...)` at ~line 559.

**Fix applied**:
1. Added `|| status === 'Cancelled'` to the exit condition at line 570 — the poll now returns early when the task is already Cancelled (superseded).
2. Added a `Cancelled` branch **before** the `Failed` branch at line 576 that:
   - Logs the ghost worker stop
   - Runs `step.run('mark-cancelled', ...)` that updates the notify Slack msg to "⏭️ Superseded" state using `buildNotifyBlocks({ state: 'Superseded', emoji: '⏭️', ... })`
   - Runs `step.run('cleanup-on-cancellation', ...)` that destroys the worker machine (same `stopLocalDockerContainer` / `destroyMachine` pattern as `mark-failed`)
   - Returns early — no validation, no approval card, no delivery

**Key insight**: `buildSupersededBlocks(taskId)` is for the approval card (the pending_approvals Slack message). For the *notify-received* message update, use `buildNotifyBlocks({ state: 'Superseded', ... })` — this is what `handle-approval-result` does at line 1930.

**poll-completion.ts**: NOT modified. Zero diff. The standalone library is already correct and separate from the inline loop.

**Evidence**: `.sisyphus/evidence/task-1-cancelled-poll-exit.txt`
