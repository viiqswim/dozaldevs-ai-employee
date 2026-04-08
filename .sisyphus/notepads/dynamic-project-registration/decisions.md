# Decisions — dynamic-project-registration

## [2026-04-08] Session Start

### Architecture Decisions (from interview)

- REST API interface (not CLI, not UI)
- Single global GITHUB_TOKEN — no per-project tokens (MVP)
- X-Admin-Key header auth with crypto.timingSafeEqual (no JWT/OAuth/passport)
- Lightweight validation only — Zod + URL format, no network calls at registration time
- TDD per task: RED → GREEN → REFACTOR
- @@unique([jira_project_key, tenant_id]) via Prisma migration
- Block DELETE with 409 if any task in Ready/Executing/Submitting
- tooling_config.install replaces pnpm install --frozen-lockfile in entrypoint.sh
- Install execution moves from bash (entrypoint.sh) to TypeScript (orchestrate.mts)
- PATCH tooling_config uses REPLACE semantics (not deep merge)
- List endpoint: no pagination for MVP (limit/offset with max 200)

### Error Code Decisions

- Duplicate jira_project_key → 409 Conflict
- Not found → 404
- Auth failure → 401 (never reveal if key missing vs wrong)
- Active tasks on DELETE → 409 with activeTaskIds in response
- Invalid request body → 400 with Zod issues

### Scope Boundaries

- IN: Admin REST API, Prisma migration, per-project install command, shared repo-url lib, TDD, docs, Docker rebuild
- OUT: per-project GitHub tokens, multi-tenant endpoints, pagination, UI, token encryption, webhook for project changes
