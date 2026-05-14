# Issues — local-ops-dashboard

## [2026-05-14] Known Risks
- employee_rules and feedback_events may need GRANT SELECT TO anon (403 risk)
- Zombie tasks: task in Reviewing + no pending_approvals row → show "Approval unavailable"
- pending_approvals.task_id is TEXT not UUID FK (join with eq. not cast)
- PostgREST tenant scoping is manual — no RLS enforces it
- E2E Scenario A requires real Hostfully message or falls back to webhook-only trigger
