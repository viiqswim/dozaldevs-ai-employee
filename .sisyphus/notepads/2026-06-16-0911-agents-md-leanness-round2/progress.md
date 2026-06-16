
## Task 15 — Database section trim (COMPLETE)

Trimmed `## Database` section: replaced 11 per-table column-dump bullets (archetypes, task_metrics, platform_settings prose, users, tenant_memberships, tenant_invitations, composio_connections, task_composio_calls, archetype_edit_history, archetype_generation_calls, Enums) with 3 durable bullets:
- Condensed `platform_settings` (keys only, no prose)
- Soft-delete invariant
- `prisma/schema.prisma` source-of-truth pointer + `prisma` skill load

Kept: connection string, ORM line, test-DB guard, Database Backup MANDATORY subsection.

QA: all 7 scenarios PASS. archetype_generation_calls count=0. AGENTS.md 579→571 lines.
Commit: `docs(agents): trim DB column dumps to schema.prisma pointer; keep invariants` (9f54ed55)
Evidence: `.sisyphus/evidence/round2-task-15-database.txt`
