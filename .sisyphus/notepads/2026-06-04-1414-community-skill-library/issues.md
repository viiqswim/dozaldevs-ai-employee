# Issues

## [2026-06-08] Known Gaps to Document in Skills

- 6 active tables still lack deleted_at (Task, Execution, PendingApproval, EmployeeRule, FeedbackEvent, TaskMetric) per [ARCH-10]
- admin-github.ts and jira.ts still read raw process.env for webhook/GitHub secrets (config.ts rule not 100% enforced)
- Radix <Select> still wrongly used in Header.tsx and InputSchemaEditor.tsx ([DASH-2])
