# Learnings — rename-time-saved-labels

## [2026-05-24] Plan Start

### Key Files

- `prisma/schema.prisma:575-589` — TaskMetric model, `minutes_saved` field at line 580
- `prisma/migrations/20260522073456_add_time_estimation_and_task_metrics/migration.sql` — Original migration (DO NOT MODIFY)
- `src/inngest/employee-lifecycle.ts` — recordTimeSavedMetric helper at lines 105-118; 5 step.run calls at lines 248, 902, 1128, 1180, 2599
- `dashboard/src/lib/utils.ts:35` — formatMinutesSaved function
- `dashboard/src/panels/tasks/TaskFeed.tsx:145-250` — PostgREST query, aggregation, stat cards
- `dashboard/src/panels/employees/sections/ActivitySection.tsx:47-109` — Per-employee PostgREST query and stat card

### Rename Map

| Old                                           | New                              |
| --------------------------------------------- | -------------------------------- |
| `minutes_saved` (DB column)                   | `work_minutes`                   |
| `formatMinutesSaved`                          | `formatWorkMinutes`              |
| `totalMinutesSaved`                           | `totalWorkMinutes`               |
| `costPerHourSaved`                            | `costPerWorkHour`                |
| `record-time-saved-metric-*` (step IDs)       | `record-work-metric-*`           |
| `"Failed to record time-saved metric"` (logs) | `"Failed to record work metric"` |
| `"Total Time Saved"` (UI label)               | `"Hours of Work Done"`           |
| `"Time Saved"` (UI label)                     | `"Hours of Work Done"`           |

### Guardrails

- Do NOT rename `estimated_manual_minutes` or `estimated_manual_minutes_override`
- Do NOT modify existing migration files
- Do NOT change "Employee Hourly Rate" label
- Do NOT modify historical docs in docs/planning/ or docs/snapshots/

### DB Verification Commands

```bash
# Column exists
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name FROM information_schema.columns WHERE table_name='task_metrics' AND column_name='work_minutes';"

# Old column gone
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name FROM information_schema.columns WHERE table_name='task_metrics' AND column_name='minutes_saved';"

# Reload PostgREST cache
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "NOTIFY pgrst, 'reload schema';"
```
