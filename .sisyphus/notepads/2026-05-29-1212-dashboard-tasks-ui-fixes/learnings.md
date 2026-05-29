# Learnings — dashboard-tasks-ui-fixes

## 2026-05-29 Init

### Root Cause: "just now" bug

PostgREST returns `created_at` as `"2026-05-29T17:01:45.604"` — NO `Z` suffix.
JS `new Date("2026-05-29T17:01:45.604")` parses as LOCAL time (MDT = UTC-5), making UTC timestamps appear ~5hrs in the future.
Fix: append `Z` if dateStr doesn't end with `Z` and doesn't contain `+`.
Guard regex: `/[Z+\-]\d{0,4}$/.test(dateStr)`

### Cost Data

`executions.phase` = "execution" | "delivery" — already in DB, just need to add to PostgREST select.
`estimated_cost_usd` is Prisma Decimal → PostgREST returns as string (e.g. "0.0023"). Use `parseFloat(String(...))`.

### Employee Filter

TaskFeed already reads `?employee=<archetypeId>` from URL → filters `archetype_id=eq.<id>`.
No new TaskFeed changes needed for Activity tab navigation.

### formatRelativeTime call sites (8 total)

- TaskFeed.tsx:351
- StatusTimeline.tsx:144
- ActivitySection.tsx:135 (will be deleted)
- TenantOverview.tsx:166, 319
- TrainingTab.tsx:274
- RulesPanel.tsx:437, 619

### usePoll hook

- File: dashboard/src/hooks/use-poll.ts (48 lines)
- Polls unconditionally every 5s via setInterval
- TERMINAL_STATUSES already in dashboard/src/lib/constants.ts
- TaskDetail has 6 concurrent polls: task(keep), logs, approvals, useExecution, useDeliverable, useFeedbackEvents

### @testing-library/react

Check dashboard/package.json before writing usePoll tests — may need to install.

### SkeletonRow

Currently renders 6 cells. Must update to 8 when adding 2 cost columns.
