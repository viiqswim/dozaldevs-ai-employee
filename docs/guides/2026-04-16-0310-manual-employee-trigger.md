# Manual Employee Trigger

Manually fire any AI employee via the admin API — useful for testing, debugging, or running employees that have no automatic trigger set up yet.

---

## Overview

Two endpoints were added to the admin API:

| Method | Path                                               | Description                             |
| ------ | -------------------------------------------------- | --------------------------------------- |
| `POST` | `/admin/tenants/:tenantId/employees/:slug/trigger` | Create a task and dispatch the employee |
| `GET`  | `/admin/tenants/:tenantId/tasks/:id`               | Check task status                       |

All requests require authentication. Two methods are accepted (dual-accept migration window — `X-Admin-Key` will be removed in T24):

| Method                            | Header                                  | Use case                             |
| --------------------------------- | --------------------------------------- | ------------------------------------ |
| **SERVICE_TOKEN** (preferred)     | `Authorization: Bearer <SERVICE_TOKEN>` | External cron callers (cron-job.org) |
| **Legacy admin key** (deprecated) | `X-Admin-Key: <ADMIN_API_KEY>`          | Internal tooling (remove after T24)  |

> **External cron callers** (e.g., cron-job.org scheduled triggers): use `Authorization: Bearer $SERVICE_TOKEN`. Do **not** use `X-Admin-Key` for external systems — it will stop working after the T24 migration.

The downstream flow is identical to a cron or webhook trigger — the Slack approval gate still fires.

**Supported runtimes**: `opencode`. Archetypes with `runtime = null` return `501 NOT_IMPLEMENTED`.

---

## Prerequisites

- Services running: `pnpm dev`
- `SERVICE_TOKEN` in `.env` (preferred) — or `ADMIN_API_KEY` for legacy callers

---

## Usage

### Trigger an employee (SERVICE_TOKEN — preferred)

```bash
TENANT=00000000-0000-0000-0000-000000000002

curl -s -X POST \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" \
  -d '{}'
```

**Response — 202:**

```json
{
  "task_id": "356785e8-8605-4e7a-a4bf-06ab14354242",
  "status_url": "/admin/tenants/00000000-.../tasks/356785e8-..."
}
```

### Trigger an employee (legacy admin key — deprecated, remove after T24)

```bash
curl -s -X POST \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" \
  -d '{}'
```

### Dry-run (validate without firing)

Append `?dry_run=true` to preview what would happen — no task row is created, no event is sent.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger?dry_run=true" \
  -d '{}'
```

**Response — 200:**

```json
{
  "valid": true,
  "would_fire": {
    "event_name": "employee/task.dispatched",
    "data": { "taskId": "<pending>", "archetypeId": "..." },
    "external_id": "manual-b017..."
  },
  "archetype_id": "..."
}
```

### Check task status

```bash
TASK_ID=356785e8-8605-4e7a-a4bf-06ab14354242

curl -s \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  "http://localhost:7700/admin/tenants/$TENANT/tasks/$TASK_ID"
```

**Response — 200:**

```json
{
  "id": "356785e8-...",
  "status": "Ready",
  "source_system": "manual",
  "external_id": "manual-b017...",
  "archetype_id": "...",
  "created_at": "2026-04-16T08:04:15.831Z",
  "updated_at": "2026-04-16T08:04:15.831Z"
}
```

---

## HTTP Response Codes

| Code  | Meaning                                             |
| ----- | --------------------------------------------------- |
| `202` | Task created, event dispatched                      |
| `200` | Dry-run preview (no side effects)                   |
| `400` | Invalid tenant UUID or slug format                  |
| `401` | Missing or invalid `Authorization` / `X-Admin-Key`  |
| `403` | Authenticated but insufficient tenant role          |
| `404` | No archetype for this tenant + slug                 |
| `501` | Runtime not supported (`null` or unsupported value) |
| `500` | Unexpected server error                             |

---

## How it works

1. Request hits `POST /admin/tenants/:tenantId/employees/:slug/trigger`
2. `authMiddleware` resolves identity: `Bearer <SERVICE_TOKEN>` → `isServiceToken=true`; Supabase JWT → `req.auth`; legacy `X-Admin-Key` → `isServiceToken=true` (dual-accept window, remove in T24)
3. `requireAuth` passes for any authenticated identity
4. `requireTenantRole(MEMBER)` passes for SERVICE_TOKEN/X-Admin-Key (no tenant membership check needed)
5. Gateway looks up the archetype by `(tenant_id, role_name)` — the slug is the `role_name`
6. A `tasks` row is created with `source_system: 'manual'` and `status: 'Ready'`
7. An `employee/task.dispatched` event is sent to Inngest
8. The `employee/universal-lifecycle` function picks it up and runs the full OpenCode harness flow

Manual tasks are distinguishable from automated ones by `source_system = 'manual'`.

---

## Audit trail

```sql
-- Find all manually triggered tasks
SELECT id, status, external_id, created_at
FROM tasks
WHERE source_system = 'manual'
ORDER BY created_at DESC;
```
