# Learnings — slack-notification-enrichment

## [2026-05-24] Session Start

### Key architectural facts

- Two Slack messages per task: `notifyMsgRef` (main channel) and `approvalMsgTs` (approval card)
- `notifyBlocks` and `notifyStateBlocks` are closures created at line 134 via `createTaskNotifyBuilders` — already in scope everywhere in the lifecycle function
- `notifyBlocks` requires `archetypeName: string` (non-optional) — use `(archetype.role_name as string) ?? 'unknown'`
- `notifyMsgRef.enrichment` is captured at `notify-received` step — available as `notifyMsgRef.enrichment as NotificationEnrichment | null`

### Pattern to follow for Task 1 (complete step)

Reference: `src/inngest/employee-lifecycle.ts:641-646` (Superseded path) — copy exactly:

```typescript
notifyBlocks({
  state: 'Task complete',
  archetypeName: (archetype.role_name as string) ?? 'unknown',
  enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
  emoji: '✅',
});
```

### failure_reason facts (Task 2)

- `failure_reason` is only set in 2 delivery-path places (lines 1816, 2037) — NOT for execution crashes
- Use null-safe: `extraText: (taskData.failure_reason as string) ?? undefined`
- `mark-failed` step ALREADY calls `notifyBlocks` with `archetypeName` — only adding `extraText` is needed
