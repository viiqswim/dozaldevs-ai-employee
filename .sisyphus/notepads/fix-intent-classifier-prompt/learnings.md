# Learnings — fix-intent-classifier-prompt

## 2026-06-04 Wave 1 Complete

### Task 1 — messageTs fix (commit 079c0263)

- `src/gateway/slack/handlers.ts` line 355: `messageTs: mention.ts` added to inngest.send() payload
- For top-level @mentions, `mention.thread_ts` is undefined but `mention.ts` is always set
- The event data type already had `ts: string` available at line 287

### Task 2 — Classifier fix (commit 1851fd05)

- `src/gateway/services/interaction-classifier.ts`: 5-category prompt with explicit definitions
- `MentionIntent` type now includes `'unclear'`
- `validIntents` array includes `'unclear'`
- Structured log added after classification
- `maxTokens: 500` unchanged in source (thinking model compatibility)
- Tests updated: maxTokens 10→500, new 'unclear' test, prompt string assertions updated
- All 22 classifier tests pass

### Key Architecture Facts

- `SLACK_ACTION_ID` already imported at line 14 of interaction-handler.ts
- `TRIGGER_CONFIRM` handler (handlers.ts line 1457) expects JSON value: `{ archetypeId, tenantId, userId, channelId, threadTs, text }` — exactly 6 fields
- `send-acknowledgment` step (line 366) uses `loadTenantEnv` which may throw silently
- Threading: `threadTs` is the parent thread ts; `messageTs` is the @mention's own ts
- `threadTarget = threadTs ?? messageTs` — use parent if in thread, else start new thread from mention
- The `task` intent path (lines 452-464) MUST NOT be touched — it works

### Pre-existing Test Issues (do not fix)

- `tests/inngest/lib/create-task-and-dispatch.test.ts` — 4 TS errors (missing tenantId)
- `tests/gateway/slack/rule-handlers.test.ts` — pre-existing failures
- `tests/gateway/jira-webhook-with-new-project.test.ts` — pre-existing failures
- `tests/inngest/interaction-handler-injection.test.ts` — pre-existing TS errors
