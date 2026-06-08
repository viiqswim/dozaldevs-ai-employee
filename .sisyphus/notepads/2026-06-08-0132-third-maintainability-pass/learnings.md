# Learnings — Third Maintainability Pass

## [2026-06-08] Session Start

- Plan: 33 tasks across 6 waves + 4 final-wave tasks
- All tasks pending — starting Wave 1
- sendSuccess() does NOT exist yet — must author before Tasks 14/15
- createHttpClient only has .post() — must add .get()/.delete() before Tasks 6/7
- config.ts has only 5 constants — must expand before Task 8
- Prisma DROP set: validation_runs, reviews, audit_log, cross_dept_triggers, clarifications (5 dead leaves only)
- NOT dropping: AgentVersion, Deliverable, Execution (referenced by active models)
- Dashboard: dead InputSchemaEditor.tsx at dashboard/src/components/ (NOT the one in panels/employees/components/)
- 3 raw fireHostfullyWebhook copies: EmployeeDetail.tsx:166, EmployeeList.tsx:240, TriggerPanel.tsx:110

## Task 5 — res.status() Inventory (2026-06-08)

### Counts
- Total `res.status()` calls in `src/gateway/routes/*.ts`: **58** (across 21 of 29 files)
- SUCCESS (2xx → migrate to sendSuccess): **52** calls
- SUCCESS-SEND (204 no-body → migrate): **5** calls
- ERROR stragglers (not yet sendError): **0** — all error paths already use sendError()
- NON-JSON (skip): **21** (8 redirects, 1 SSE stream, 12 bare res.json webhook acks)

### Key Findings
1. **Zero error stragglers** — every 4xx/5xx already uses `sendError()`. Tasks 14/15 only need to handle SUCCESS paths.
2. **204 no-body pattern** — 5 files use `res.status(204).send()`. Need to verify `sendSuccess` supports 204 before migrating.
3. **admin-slack-channels.ts:39** — returns `res.status(200).json({ channels: [], error: 'SLACK_NOT_CONFIGURED' })`. Semantically a degraded-success (200 with error field). Migrate to sendSuccess but preserve the error field in the body.
4. **admin-tasks.ts SSE block** — lines 98-113 are a Server-Sent Events stream. DO NOT migrate.
5. **OAuth files** — all success paths are `res.redirect(302, ...)`. DO NOT migrate.
6. **Webhook ack files** (github.ts, hostfully.ts, health.ts) — use bare `res.json()` with no explicit status. Out of scope for this task.

### Files to migrate in Tasks 14/15 (21 files with SUCCESS calls)
admin-archetype-generate.ts, admin-archetypes.ts, admin-brain-preview.ts,
admin-employee-trigger.ts, admin-github.ts, admin-google.ts, admin-kb.ts,
admin-model-catalog.ts, admin-platform-settings.ts, admin-projects.ts,
admin-property-locks.ts, admin-rules.ts, admin-slack-channels.ts, admin-tasks.ts,
admin-tenant-config.ts, admin-tenant-secrets.ts, admin-tenants.ts, admin-tools.ts,
internal-github-token.ts, internal-google-token.ts, jira.ts

### Files to skip entirely
github-oauth.ts, github.ts, google-oauth.ts, health.ts, hostfully.ts,
jira-oauth.ts, notion-oauth.ts, slack-oauth.ts

## [2026-06-08] Task 1 — sendSuccess() helper

- sendSuccess(res, status, body?) added to src/gateway/lib/http-response.ts
- Pass-through only: res.status(status).json(body) when body present, res.status(status).end() when absent
- No envelope wrapping — body is passed as-is (this is the critical constraint)
- JSDoc mirrors sendError style exactly (public API helper)
- Test file: tests/unit/gateway/http-response.test.ts (5 tests, all pass)
- Test covers: object body, array body, 201 created, 204 no-body, explicit no-envelope assertion
- pnpm build clean, pnpm test 5/5 pass
- Pre-existing failure in http-client.test.ts (delete() tests) — unrelated, not introduced by this task
