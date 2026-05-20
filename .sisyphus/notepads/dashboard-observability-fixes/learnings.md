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

## [2026-05-20] Wave 1 QA — Final Verification Results

### TypeScript Build
- `cd dashboard && npx tsc --noEmit` exits 0 — CLEAN

### Unit Tests
- 1490 passed | 27 skipped | 0 failures ✅
- Pre-existing skips: container-boot.test.ts (4 Docker-skipped), inngest-serve.test.ts (1 skipped for function count)

### Auto-pass task 3ed3d4c8 DOM assertions (ALL PASS)
- Status Timeline shows "Total duration: < 1s" ✅
- Execution Metrics shows ⚡ "Auto-completed — no worker execution..." banner ✅
- Deliverable section shows "No deliverable — task auto-completed during triage" ✅
- "No execution data" text ABSENT ✅
- "No deliverable yet" text ABSENT ✅
- Console errors: 1 (favicon 404 only — acceptable) ✅
- All PostgREST requests 200 OK, no 400s ✅

### Normal task 8debb23e DOM assertions (ALL PASS)
- Real execution metrics: Status "completed", Tokens 63,549, Cost $0.0204, Duration "1m 13s" ✅
- Deliverable shows slack_message content ✅
- 0 console errors ✅
- All PostgREST requests 200 OK, no 400s ✅

### Evidence files
- `.sisyphus/evidence/task-5-auto-pass-final.png`
- `.sisyphus/evidence/task-5-normal-final.png`
- `.sisyphus/evidence/task-5-build-verification.txt`

### Key observation: feedback_events select string
- Bug 1 fix confirmed working: select string no longer includes `actor_type` — PostgREST returns 200 on every load
- The select string in use-feedback-events.ts now: `id,task_id,event_type,actor_id,created_at`
