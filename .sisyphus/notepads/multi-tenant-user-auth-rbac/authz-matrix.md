# Role × Endpoint Authorization Matrix

**Task**: T0b — Author role × endpoint authorization matrix
**Created**: 2026-06-09-0102
**Scope**: Every admin/gateway endpoint currently protected by `requireAdminKey` (`src/gateway/middleware/admin-auth.ts`).

This document is the **spec** that T16 (apply authz to all admin routes) implements against. It is pure analysis — no middleware, no DB tables, no source changes were produced.

---

## Role Vocabulary

Two-tier model (per plan / inherited wisdom):

| Tier                    | Roles                                                 | Source                                 |
| ----------------------- | ----------------------------------------------------- | -------------------------------------- |
| Global `Role`           | `PLATFORM_OWNER`, `ADMIN`, `EDITOR`, `USER`, `VIEWER` | `users.role` (platform-wide)           |
| Per-tenant `TenantRole` | `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`                  | `tenant_members.role` (per membership) |

**Required-role column legend** (minimum authorization to call the endpoint):

| Token            | Meaning                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `PLATFORM_OWNER` | Global cross-tenant superadmin. Operates outside any single tenant. Bypasses membership checks.  |
| `OWNER`          | Tenant `OWNER` — destructive tenant-level ops (delete/restore tenant, secrets, integrations).    |
| `ADMIN`          | Tenant `ADMIN` or higher — config, archetype, rules, KB, locks, model/trigger management.        |
| `MEMBER`         | Tenant `MEMBER` or higher — trigger employees, do work.                                          |
| `VIEWER`         | Tenant `VIEWER` or higher — read-only list/get.                                                  |
| `SERVICE_TOKEN`  | Machine-only; no human role. (None of the `requireAdminKey` routes are service-only — see note.) |
| `PUBLIC`         | No auth. (None of the `requireAdminKey` routes are public.)                                      |

> **Ordering**: `PLATFORM_OWNER` > `OWNER` > `ADMIN` > `MEMBER` > `VIEWER`. "Minimum" means that role **and everything above it** is permitted. PLATFORM_OWNER is permitted on every row by the bypass rule.

---

## Coverage Summary

- **Route files with `requireAdminKey`**: 18 (all represented below)
- **Protected endpoints**: 56
- **Global (non-tenant-scoped) endpoints**: 5 — `admin-tenants` collection ops (2) + `admin-model-catalog` (5)… see per-file note. Specifically: `POST /admin/tenants`, `GET /admin/tenants`, and the 5 `model-catalog` routes are NOT under `:tenantId`.
- All tenant-scoped routes (`:tenantId` in path) additionally require **membership in that tenant** (see cross-cutting rules).

---

## Matrix

| Route File                  | Method | Path                                                             | Required Role    | Notes                                                                                                                                                                                      |
| --------------------------- | ------ | ---------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| admin-tenants.ts            | POST   | `/admin/tenants`                                                 | `PLATFORM_OWNER` | Create a brand-new tenant — no membership exists yet; only platform superadmin can provision tenants.                                                                                      |
| admin-tenants.ts            | GET    | `/admin/tenants`                                                 | `PLATFORM_OWNER` | Lists **all** tenants cross-tenant. Superadmin-only. (A future per-user "my tenants" endpoint would differ.)                                                                               |
| admin-tenants.ts            | GET    | `/admin/tenants/:tenantId`                                       | `VIEWER`         | Read single tenant; requires membership in `:tenantId`. PLATFORM_OWNER bypass.                                                                                                             |
| admin-tenants.ts            | PATCH  | `/admin/tenants/:tenantId`                                       | `OWNER`          | Mutates tenant name/status/config — tenant-level destructive/sensitive.                                                                                                                    |
| admin-tenants.ts            | DELETE | `/admin/tenants/:tenantId`                                       | `OWNER`          | Soft-delete the tenant. Most destructive tenant op. PLATFORM_OWNER bypass.                                                                                                                 |
| admin-tenants.ts            | POST   | `/admin/tenants/:tenantId/restore`                               | `OWNER`          | Un-delete tenant. Pairs with DELETE; same authority. (PLATFORM_OWNER realistically needed if all owners removed.)                                                                          |
| admin-tenant-config.ts      | GET    | `/admin/tenants/:tenantId/config`                                | `VIEWER`         | Read tenant config blob; requires membership.                                                                                                                                              |
| admin-tenant-config.ts      | PATCH  | `/admin/tenants/:tenantId/config`                                | `ADMIN`          | Deep-merge tenant config (notification channels, summary settings). Admin-level.                                                                                                           |
| admin-tenant-secrets.ts     | GET    | `/admin/tenants/:tenantId/secrets`                               | `OWNER`          | Lists secret **keys** (not values). Secrets are highly sensitive → OWNER.                                                                                                                  |
| admin-tenant-secrets.ts     | PUT    | `/admin/tenants/:tenantId/secrets/:key`                          | `OWNER`          | Sets/overwrites a secret value (API tokens, OAuth creds). OWNER-only.                                                                                                                      |
| admin-tenant-secrets.ts     | DELETE | `/admin/tenants/:tenantId/secrets/:key`                          | `OWNER`          | Hard-deletes a secret. OWNER-only.                                                                                                                                                         |
| admin-archetypes.ts         | POST   | `/admin/tenants/:tenantId/archetypes`                            | `ADMIN`          | Create employee archetype. Employee management → ADMIN.                                                                                                                                    |
| admin-archetypes.ts         | GET    | `/admin/tenants/:tenantId/archetypes/model-questions`            | `VIEWER`         | Static question list for the wizard. Read-only.                                                                                                                                            |
| admin-archetypes.ts         | POST   | `/admin/tenants/:tenantId/archetypes/recommend-model`            | `ADMIN`          | Runs model recommendation (LLM/catalog read). Part of employee setup → ADMIN. Note: POST but non-mutating; gated as setup action.                                                          |
| admin-archetypes.ts         | PATCH  | `/admin/tenants/:tenantId/archetypes/:archetypeId`               | `ADMIN`          | Update archetype (model, steps, status active/draft). Employee management → ADMIN.                                                                                                         |
| admin-archetypes.ts         | DELETE | `/admin/tenants/:tenantId/archetypes/:archetypeId`               | `ADMIN`          | Soft-delete archetype. Employee management → ADMIN.                                                                                                                                        |
| admin-archetypes.ts         | POST   | `/admin/tenants/:tenantId/archetypes/:archetypeId/restore`       | `ADMIN`          | Restore soft-deleted archetype. Employee management → ADMIN.                                                                                                                               |
| admin-archetype-generate.ts | POST   | `/admin/tenants/:tenantId/archetypes/generate`                   | `ADMIN`          | Wizard LLM generation of a new employee config. Employee setup → ADMIN.                                                                                                                    |
| admin-brain-preview.ts      | POST   | `/admin/tenants/:tenantId/archetypes/compile-preview`            | `ADMIN`          | Compiles a preview AGENTS.md from draft fields. Authoring tool → ADMIN.                                                                                                                    |
| admin-brain-preview.ts      | GET    | `/admin/tenants/:tenantId/archetypes/:archetypeId/brain-preview` | `ADMIN`          | Exposes env-var presence, tenant secret **key names**, rules, KB themes → information-sensitive. ADMIN min (not VIEWER) because it leaks secret key inventory + env manifest.              |
| admin-employee-trigger.ts   | POST   | `/admin/tenants/:tenantId/employees/:slug/trigger`               | `MEMBER`         | Trigger an employee run (incl. `?dry_run`). Doing work → MEMBER+. **FLAG**: confirm whether triggering is MEMBER or ADMIN per product intent (cost/side-effects). Default MEMBER per plan. |
| admin-rules.ts              | POST   | `/admin/tenants/:tenantId/employees/:archetypeId/rules`          | `ADMIN`          | Create a learned/admin rule that steers employee behavior. Behavior management → ADMIN.                                                                                                    |
| admin-rules.ts              | PATCH  | `/admin/tenants/:tenantId/employees/:archetypeId/rules/:ruleId`  | `ADMIN`          | Update/confirm/archive a rule. → ADMIN.                                                                                                                                                    |
| admin-rules.ts              | DELETE | `/admin/tenants/:tenantId/employees/:archetypeId/rules/:ruleId`  | `ADMIN`          | Delete a rule (note: current impl hard-deletes via `deleteMany` — separate soft-delete concern, not authz). → ADMIN.                                                                       |
| admin-kb.ts                 | POST   | `/admin/tenants/:tenantId/kb/entries`                            | `ADMIN`          | Create knowledge-base entry (employee domain expertise). → ADMIN.                                                                                                                          |
| admin-kb.ts                 | GET    | `/admin/tenants/:tenantId/kb/entries`                            | `VIEWER`         | List KB entries. Read-only → VIEWER.                                                                                                                                                       |
| admin-kb.ts                 | GET    | `/admin/tenants/:tenantId/kb/entries/:entryId`                   | `VIEWER`         | Get single KB entry. Read-only → VIEWER.                                                                                                                                                   |
| admin-kb.ts                 | PATCH  | `/admin/tenants/:tenantId/kb/entries/:entryId`                   | `ADMIN`          | Update KB entry content. → ADMIN.                                                                                                                                                          |
| admin-kb.ts                 | DELETE | `/admin/tenants/:tenantId/kb/entries/:entryId`                   | `ADMIN`          | Delete KB entry. → ADMIN.                                                                                                                                                                  |
| admin-property-locks.ts     | POST   | `/admin/tenants/:tenantId/property-locks`                        | `ADMIN`          | Create property-lock mapping (operational config for code-rotation). → ADMIN.                                                                                                              |
| admin-property-locks.ts     | GET    | `/admin/tenants/:tenantId/property-locks`                        | `VIEWER`         | List property locks. Read-only → VIEWER.                                                                                                                                                   |
| admin-property-locks.ts     | GET    | `/admin/tenants/:tenantId/property-locks/:lockId`                | `VIEWER`         | Get single property lock. Read-only → VIEWER.                                                                                                                                              |
| admin-property-locks.ts     | PATCH  | `/admin/tenants/:tenantId/property-locks/:lockId`                | `ADMIN`          | Update property lock. → ADMIN.                                                                                                                                                             |
| admin-property-locks.ts     | DELETE | `/admin/tenants/:tenantId/property-locks/:lockId`                | `ADMIN`          | Delete property lock. → ADMIN.                                                                                                                                                             |
| admin-projects.ts           | POST   | `/admin/tenants/:tenantId/projects`                              | `ADMIN`          | Register project (deprecated engineering employee, but still `requireAdminKey`). Resource management → ADMIN.                                                                              |
| admin-projects.ts           | GET    | `/admin/tenants/:tenantId/projects`                              | `VIEWER`         | List projects. Read-only → VIEWER.                                                                                                                                                         |
| admin-projects.ts           | GET    | `/admin/tenants/:tenantId/projects/:id`                          | `VIEWER`         | Get single project. Read-only → VIEWER.                                                                                                                                                    |
| admin-projects.ts           | PATCH  | `/admin/tenants/:tenantId/projects/:id`                          | `ADMIN`          | Update project. → ADMIN.                                                                                                                                                                   |
| admin-projects.ts           | DELETE | `/admin/tenants/:tenantId/projects/:id`                          | `ADMIN`          | Delete project (409 if active tasks). → ADMIN.                                                                                                                                             |
| admin-slack-channels.ts     | GET    | `/admin/tenants/:tenantId/slack/channels`                        | `ADMIN`          | Lists Slack channels via the tenant's bot token. Reveals workspace structure + exercises the integration token → ADMIN min (not VIEWER).                                                   |
| admin-github.ts             | GET    | `/admin/tenants/:tenantId/github/repos`                          | `ADMIN`          | Lists repos via installation token. Integration-sensitive → ADMIN.                                                                                                                         |
| admin-github.ts             | GET    | `/admin/tenants/:tenantId/github/available-installations`        | `ADMIN`          | Lists GitHub App installations linkable to tenant. Integration setup → ADMIN.                                                                                                              |
| admin-github.ts             | POST   | `/admin/tenants/:tenantId/github/link-installation`              | `OWNER`          | Binds a GitHub installation to the tenant + writes `github_installation_id` secret. Touches secrets/integration ownership → OWNER.                                                         |
| admin-github.ts             | DELETE | `/admin/tenants/:tenantId/integrations/github`                   | `OWNER`          | Disconnect GitHub: deletes integration record + secret. Destructive integration op → OWNER.                                                                                                |
| admin-google.ts             | DELETE | `/admin/tenants/:tenantId/integrations/google`                   | `OWNER`          | Disconnect Google: deletes integration record + 5 OAuth secrets + clears token cache. Destructive integration op → OWNER.                                                                  |
| admin-tasks.ts              | GET    | `/admin/tenants/:tenantId/tasks/:id`                             | `VIEWER`         | Get task status. Read → VIEWER.                                                                                                                                                            |
| admin-tasks.ts              | GET    | `/admin/tenants/:tenantId/tasks/:id/logs`                        | `VIEWER`         | SSE stream of execution logs. Read → VIEWER. (Logs may contain operational detail; VIEWER acceptable within-tenant.)                                                                       |
| admin-model-catalog.ts      | GET    | `/admin/model-catalog`                                           | `PLATFORM_OWNER` | **Global** catalog (not tenant-scoped). Read all models. Cross-tenant resource → PLATFORM_OWNER. (Optionally relax to any authenticated user later; superadmin-safe default.)              |
| admin-model-catalog.ts      | GET    | `/admin/model-catalog/:id`                                       | `PLATFORM_OWNER` | **Global** get single model. → PLATFORM_OWNER.                                                                                                                                             |
| admin-model-catalog.ts      | POST   | `/admin/model-catalog`                                           | `PLATFORM_OWNER` | **Global** create catalog model. Cross-tenant mutation → PLATFORM_OWNER.                                                                                                                   |
| admin-model-catalog.ts      | PATCH  | `/admin/model-catalog/:id`                                       | `PLATFORM_OWNER` | **Global** update catalog model. → PLATFORM_OWNER.                                                                                                                                         |
| admin-model-catalog.ts      | DELETE | `/admin/model-catalog/:id`                                       | `PLATFORM_OWNER` | **Global** soft-delete catalog model. → PLATFORM_OWNER.                                                                                                                                    |
| admin-platform-settings.ts  | GET    | `/admin/platform-settings`                                       | `PLATFORM_OWNER` | **Global** platform settings (VM size, cost limits, gateway LLM model). Cross-tenant → PLATFORM_OWNER.                                                                                     |
| admin-platform-settings.ts  | PATCH  | `/admin/platform-settings/:key`                                  | `PLATFORM_OWNER` | **Global** mutate platform behavior. Cross-tenant → PLATFORM_OWNER.                                                                                                                        |
| admin-tools.ts              | GET    | `/admin/tools`                                                   | `PLATFORM_OWNER` | **Global** shell-tool catalog (filesystem discovery, not tenant-scoped). → PLATFORM_OWNER. (Could relax to any authed user; superadmin-safe default.)                                      |
| admin-tools.ts              | GET    | `/admin/tools/:service/:toolName`                                | `PLATFORM_OWNER` | **Global** single tool metadata. → PLATFORM_OWNER.                                                                                                                                         |

---

## Cross-Cutting Rules

These rules apply on top of the per-row minimum and are how T16 should enforce authorization.

1. **PLATFORM_OWNER bypass** — A user whose global `Role` is `PLATFORM_OWNER` is authorized on **every** endpoint in this matrix, regardless of the per-row minimum and regardless of tenant membership. PLATFORM_OWNER never needs a `tenant_members` row.

2. **Tenant-membership requirement** — Every endpoint whose path contains `:tenantId` requires the caller to have an active `tenant_members` row for that exact `:tenantId` (any non-deleted membership), in addition to meeting the per-row minimum `TenantRole`. No membership in `:tenantId` ⇒ `403 Forbidden` (or `404` to avoid tenant-existence disclosure — implementer's choice in T16), **unless** PLATFORM_OWNER.

3. **Global (non-tenant-scoped) endpoints** — Endpoints with no `:tenantId` segment are cross-tenant platform resources. They require `PLATFORM_OWNER`:
   - `POST /admin/tenants`, `GET /admin/tenants` (tenant provisioning + global list)
   - `GET|POST /admin/model-catalog`, `GET|PATCH|DELETE /admin/model-catalog/:id`
   - `GET|PATCH /admin/platform-settings[...]`
   - `GET /admin/tools`, `GET /admin/tools/:service/:toolName`

4. **Destructive tenant ops require OWNER** — Deleting/restoring the tenant, and all secrets + integration disconnect/link operations (which read or write `tenant_secrets`) require `OWNER`. Rationale: these can lock out the org or leak/rotate credentials.
   - Tenant: `PATCH`/`DELETE /admin/tenants/:tenantId`, `POST .../restore`
   - Secrets: `GET`/`PUT`/`DELETE /admin/tenants/:tenantId/secrets[...]`
   - Integrations: `POST .../github/link-installation`, `DELETE .../integrations/github`, `DELETE .../integrations/google`

5. **Member/invite management requires ADMIN+** — (Future endpoints from this plan, not yet present under `requireAdminKey`.) When member-management and invitation routes are added, gate them at `ADMIN` minimum. Listed here so T16 keeps the rule consistent.

6. **Employee trigger requires MEMBER+** — `POST /admin/tenants/:tenantId/employees/:slug/trigger` is the one "do work" endpoint and is set to `MEMBER`. **FLAGGED FOR CONFIRMATION**: triggering has real cost + external side-effects; product may prefer `ADMIN`. Defaulting to `MEMBER` per plan guidance; T16/PM should confirm before shipping.

7. **Read-only list/get endpoints require VIEWER+** — Pure reads within a tenant (tenant get, config get, KB list/get, property-lock list/get, projects list/get, task get/logs) are `VIEWER`. **Exceptions raised to ADMIN** because they expose sensitive material:
   - `GET .../archetypes/:archetypeId/brain-preview` — leaks tenant secret **key inventory** + env manifest.
   - `GET .../slack/channels`, `GET .../github/repos`, `GET .../github/available-installations` — exercise live integration tokens and reveal external workspace/repo structure.
   - `GET .../secrets` — secret key listing → OWNER (per rule 4).

8. **Last-owner protection** — Any operation that would remove the final `OWNER` from a tenant must be rejected (`409 Conflict`), even when the caller is otherwise authorized. Relevant to future member-removal/role-change endpoints and to `DELETE /admin/tenants/:tenantId` semantics. PLATFORM_OWNER may still perform platform-level recovery. (No current endpoint changes membership, so this is a forward-looking guard for T16.)

9. **POST-but-read actions** — A few POSTs are non-mutating helpers (`recommend-model`, `generate`, `compile-preview`). They are gated at `ADMIN` because they are part of the employee-authoring workflow, not because they mutate state. If product wants designers-without-write to preview, these could relax to `VIEWER` later.

---

## Notes / Assumptions for T16

- **No SERVICE_TOKEN or PUBLIC rows**: every `requireAdminKey` route maps to a human role tier. Service-only routes (`/tasks/:taskId/github-token`, `/tasks/:taskId/google-token`) and public routes (`/health`, `/webhooks/*`, OAuth `*/install|callback`) do **not** use `requireAdminKey` and are intentionally out of scope for this matrix.
- The `ADMIN` global `Role` and the `ADMIN` `TenantRole` are distinct; the per-row minimum refers to the **effective tenant authority** for tenant-scoped routes and to **global PLATFORM_OWNER** for global routes. A global `ADMIN` does not automatically get tenant `OWNER` powers unless they also hold that tenant membership (or are PLATFORM_OWNER).
- Where a row says `ADMIN` for a read endpoint, that is a deliberate elevation above `VIEWER` due to credential/structure disclosure (rule 7).
- The `admin-projects.ts` routes belong to the deprecated engineering employee but remain live under `requireAdminKey`; included for completeness.
