# Decisions — manual-employee-trigger-api

## [2026-04-16] Architecture Decisions (from Prometheus planning session)

| Decision          | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| Scope             | Summarizer-only; engineering deferred                                    |
| URL pattern       | `POST /admin/tenants/:tenantId/employees/:slug/trigger` — tenant in path |
| Status endpoint   | `GET /admin/tenants/:tenantId/tasks/:id`                                 |
| DB constraint     | Add `@@unique([tenant_id, role_name])` to archetypes                     |
| Tenant validation | UUID format + archetype lookup (no Tenant FK table exists)               |
| Admin auth        | Single `ADMIN_API_KEY` — per-tenant keys deferred                        |
| Dry-run           | `?dry_run=true` query param — no DB write, no event send                 |
| Audit trail       | `source_system: 'manual'` (new value, no migration needed)               |
| Idempotency       | `external_id = 'manual-' + randomUUID()` (fresh UUID each call)          |
| Error mapping     | UNSUPPORTED_RUNTIME → HTTP 501 (signals "future feature")                |
| Cross-tenant      | Always 404 (not 403) — prevents tenant enumeration                       |
| Test strategy     | TDD (RED → GREEN → REFACTOR) with Vitest                                 |
| Integration tests | Real Prisma + vi.fn() spy for inngest.send (no real Inngest server)      |
