# Learnings

## [2026-05-20] Plan Start

- 4 bugs all in dashboard frontend — no backend/harness changes needed
- actor_type: confirmed absent from feedback_events table — PostgREST returns {"code":"42703","message":"column feedback_events.actor_type does not exist"}
- Auto-pass task `3ed3d4c8`: 0 executions, 0 deliverables, started_at=NULL, completed_at=NULL, 1 status log (Received→Done)
- Normal task `8debb23e`: execution, deliverable, 7 status logs all populated correctly
- TERMINAL_STATUSES: check dashboard/src/lib/constants.ts — may need to define inline in StatusTimeline
- actor_type only in 2 files: use-feedback-events.ts:10 (select string) and types.ts:~158 (interface)
- TaskDetail.tsx line ~521: "No execution data", line ~561: "No deliverable yet"
- useFeedbackEvents already returns error from usePoll — just not destructured in TaskDetail
- StatusTimeline line 73: `showTotalDuration = task?.started_at != null && task?.completed_at != null`
