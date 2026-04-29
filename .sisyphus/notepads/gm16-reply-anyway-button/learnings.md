## Task 2 — REPLY_ANYWAY_CONTEXT harness injection (2026-04-29)

- Target line: `const instructions = archetype.instructions ?? '';` (line 333 in opencode-harness.mts)
- Pattern mirrors FEEDBACK_CONTEXT (lines 328-332) but injects into `instructions` not `systemPrompt`
- When `REPLY_ANYWAY_CONTEXT` is set: instructions get a full override prefix telling the agent to skip Step 1, treat as NEEDS_APPROVAL, and use the provided message context
- When unset: instructions fall through to `archetype.instructions ?? ''` unchanged
- Build passes clean with no TypeScript errors
- Evidence diff saved to `.sisyphus/evidence/task-2-harness-diff.txt`

## Task 3 — seed.ts NO_ACTION_NEEDED instruction update

- Line 244 in `prisma/seed.ts` updated: replaced `post-message.ts` informational message with `post-no-action-notification.ts` multi-line invocation
- Mirrored the `post-guest-approval.ts` pattern (multi-line `\\\n` continuations)
- Added `conversationRef` append step after writing `/tmp/approval-message.json` (same pattern as NEEDS_APPROVAL path at line 268)
- Pre-existing LSP errors at lines 3273+ (`knowledgeBaseEntry`) are unrelated to this change
- `pnpm build` exits 0 — TypeScript compiles cleanly

## Task 4 — Reply Anyway wait window in lifecycle (2026-04-29)

### Implementation
- `check-classification` step: infinite loop guard added at the TOP, before deliverables fetch
  - Fetches `/tasks?id=eq.${taskId}&select=metadata` — if `metadata.reply_anyway === true`, returns `{ skipApproval: false }` immediately to force approval flow for re-draft machines
  - If guard doesn't trigger, existing retry loop for deliverable fetch follows unchanged
- `if (classificationCheck.skipApproval)` block completely replaced:
  - `cleanup-no-action` (destroy initial machine) runs first
  - `step.waitForEvent('wait-for-reply-anyway', { event: 'employee/reply-anyway.requested', match: 'data.taskId', timeout: '${timeoutHours}h' })`
  - **Timeout path** (null): `complete-no-action-timeout` step → patchTask(Done) + logStatusTransition → `return`
  - **Click path**: `mark-reply-anyway-override` → `build-reply-context` → `reply-anyway-execute` (createMachine with REPLY_ANYWAY_CONTEXT) → `reply-anyway-poll` → fall through to approval flow
  - `void replyMachineId;` suppresses unused variable warning
  - NO `return` after the block — fall-through to approval flow is correct

### tenantEnv scope issue
`tenantEnv` is defined INSIDE the `executing` step callback and is NOT available in the outer scope.
`reply-anyway-execute` must load it fresh using the same `PrismaClient + loadTenantEnv + $disconnect` pattern as `handle-approval-result`.

### Classification test regression (known, unavoidable)
`tests/inngest/employee-lifecycle-classification.test.ts` has 2 tests that assert `expect(waitForEventMock).not.toHaveBeenCalled()` for NO_ACTION_NEEDED scenarios. After this change, `step.waitForEvent('wait-for-reply-anyway')` IS called in the NO_ACTION_NEEDED path, so these assertions fail. There is no way to add a `step.waitForEvent` call in that path AND keep those assertions passing without modifying the test file. Task spec has a contradictory requirement — feature is correct, classification tests must be updated separately.

### Build
`pnpm build` exits 0 — TypeScript compiles cleanly with no errors.

## Task 6 — Full verification run (2026-04-29)

### Test suite results (full run)
- Total: 1493 passing, 54 failing, 10 skipped across 144 test files
- GM-16 specific tests: 89/89 pass across 9 test files
- Pre-existing failures confirmed (stash-verified): container-boot.test.ts, inngest-serve.test.ts, lifecycle.test.ts (deprecated), opencode-server.test.ts (--hostname added in d7b7fca but tests not updated), jira-webhook-with-new-project.test.ts, employee-dispatcher.test.ts, installation-store.test.ts, between-wave-push.test.ts, branch-manager.test.ts, fallback-pr.test.ts
- **ZERO GM-16 regressions found**

### Build
- `pnpm build` exits 0 — clean TypeScript compile

### Lint
- `pnpm lint` exits 1 — 7 errors all in `src/worker-tools/hostfully/` (Unexpected constant condition)
- Confirmed pre-existing: identical errors with and without GM-16 stashed
- GM-16 files produce zero lint errors

### Stash technique
Used `git stash -- <GM-16 files>` to isolate pre-existing failures from GM-16 regressions. All 54 test failures and all 7 lint errors exist before GM-16 changes.
