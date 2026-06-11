---
name: api-design
description: 'Use when creating or modifying Express routes, API endpoints, request validation, or response shapes, OR when you need the admin API endpoint catalog. Covers the mandatory sendError/sendSuccess helpers, ERROR_CODES, Zod validation, tenant-scoped routes, the UUID_REGEX quirk, and the full admin endpoint table.'
---

# Express + Zod API Design (ai-employee)

The gateway is an Express HTTP server (`src/gateway/`). All route handlers live in `src/gateway/routes/`, validation schemas in `src/gateway/validation/schemas.ts`, and shared response helpers in `src/gateway/lib/`. This is a **REST-only** repo — no GraphQL, no gRPC.

This skill is the canonical home for the **admin API endpoint catalog** (absorbed from AGENTS.md) and the non-obvious repo rules that route handlers must follow.

---

## The Non-Obvious Rules (read these first)

### 1. UUID route params: use `UUID_REGEX`, NEVER `z.string().uuid()`

This is a real bug source in this repo. **Zod v4's `z.string().uuid()` enforces RFC 4122 version/variant bits** and rejects some UUIDs that PostgreSQL and our seed data treat as perfectly valid (e.g. the all-zero tenant IDs like `00000000-0000-0000-0000-000000000002`). A route guarded with `z.string().uuid()` will 400 on legitimate requests.

Always use the loose `UUID_REGEX` / `uuidField()` helper from `src/gateway/validation/schemas.ts`:

```typescript
import { z } from 'zod';
import { uuidField } from '../validation/schemas.js';

// CORRECT — loose 8-4-4-4-12 hex regex, accepts all our UUIDs
export const GetTaskParamsSchema = z.object({
  tenantId: uuidField(),
  id: uuidField(),
});

// WRONG — z.string().uuid() rejects valid seed/tenant UUIDs (Zod v4 version-bit enforcement)
```

`UUID_REGEX` is defined as `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. `uuidField()` wraps it with a friendly error message. Use `uuidField()` for any tenant or task UUID in a path param or body.

### 2. Mandatory response helpers — `sendError` / `sendSuccess` (CRITICAL, post-refactor)

Every **admin / OAuth / internal** route handler MUST route its responses through the helpers in `src/gateway/lib/http-response.ts`. **Never inline `res.status(N).json({...})`.**

```typescript
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES, isPrismaError } from '../lib/prisma-helpers.js';

// Error response — code MUST come from ERROR_CODES, never a hardcoded literal
sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, { issues: result.error.issues });
sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Task not found');
sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);

// Success response — pass-through body, no envelope wrapping
sendSuccess(res, 201, created); // 201 with body
sendSuccess(res, 202, { task_id, status_url });
sendSuccess(res, 204); // no body → res.status(204).end()
```

Signatures:

- `sendError(res, status, code, message?, extra?)` → body shape `{ error: code, message?, ...extra }`
- `sendSuccess(res, status, body?)` → `res.status(status).json(body)`, or `.end()` when `body` is omitted

**Rules:**

- The `code` argument MUST be a member of `ERROR_CODES` (`src/gateway/lib/prisma-helpers.ts`): `INVALID_ID`, `INVALID_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, `UNAUTHORIZED`. Route-specific codes (e.g. `MODEL_ID_TAKEN`, `MISSING_REQUIRED_INPUTS`) are the only permitted string literals, and only when no `ERROR_CODES` member fits.
- Detect Prisma constraint violations with `isPrismaError(err)` — **never** `err instanceof PrismaClientKnownRequestError`. Example: `if (isPrismaError(err) && err.code === 'P2002') sendError(res, 409, 'MODEL_ID_TAKEN', ...)`.
- **Exception — webhook receiver routes** (`hostfully.ts`, `jira.ts`, `github.ts`) use `res.json()` directly for fire-and-forget 200 acks. The helper rule applies to admin / OAuth / internal routes only.

### 3. Admin auth — `Authorization: Bearer` (SERVICE_TOKEN or Supabase JWT)

All `/admin/*` and `/me` routes are guarded by `authMiddleware` + `requireAuth` + `requireTenantRole`/`requirePermission` from `src/gateway/middleware/auth.ts` and `src/gateway/middleware/authz.ts`. Two token types are accepted:

- **SERVICE_TOKEN** — opaque hex string from `SERVICE_TOKEN` env var. Bypasses all membership checks.
- **Supabase JWT** — short-lived JWT issued by Supabase Auth. Checked against `users.status` per-request.

`X-Admin-Key` / `ADMIN_API_KEY` / `requireAdminKey` are **removed** — not deprecated, gone since T24. All callers must use `Authorization: Bearer`.

Standard guard chain for a tenant-scoped route:

```typescript
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantRole } from '@prisma/client';

router.get(
  '/admin/tenants/:tenantId/things',
  authMiddleware,
  requireAuth,
  requireTenantRole(TenantRole.VIEWER),
  async (req, res) => { ... }
);
```

For global (non-tenant-scoped) endpoints, use `requirePermission` instead of `requireTenantRole`:

```typescript
import { requirePermission } from '../middleware/authz.js';
import { PERMISSIONS } from '../../lib/auth/permissions.js';

router.get('/admin/model-catalog', authMiddleware, requireAuth, requirePermission(PERMISSIONS.MANAGE_ARCHETYPES), async (req, res) => { ... });
```

### 4. Tenant-scoped path shape

Anything tenant-isolated lives under `/admin/tenants/:tenantId/...`. Multi-tenancy is mandatory — validate `tenantId` with `uuidField()` and scope every DB query by `tenant_id` (and `deleted_at: null` for soft-deletes). Cross-tenant access must 404, never leak.

### 5. Thin handlers — delegate to services / repositories

Handlers do three things: validate input (Zod `safeParse`), call a service/repository, map the result to `sendSuccess`/`sendError`. **No business logic inline.** Services live in `src/gateway/services/`; tenant-scoped data access lives in `src/repositories/`.

### 6. Workers reach the DB via PostgREST, not Prisma

Gateway route handlers use Prisma directly. **Worker containers** (`src/workers/`, `src/worker-tools/`) read and write through PostgREST (`http://localhost:54331`), never Prisma. Don't import Prisma into worker code.

### 7. Status-code conventions

| Code  | When                                                                      |
| ----- | ------------------------------------------------------------------------- |
| `200` | Successful read / update / dry-run validation                             |
| `201` | Resource created                                                          |
| `202` | Async work accepted (task dispatched — returns `{ task_id, status_url }`) |
| `204` | Success, no body                                                          |
| `400` | Zod validation failure (`INVALID_REQUEST` / `INVALID_ID` + `issues`)      |
| `401` | Missing/invalid auth token (`UNAUTHORIZED` / `AUTHENTICATION_REQUIRED`)   |
| `404` | Not found / cross-tenant access (`NOT_FOUND`)                             |
| `409` | Unique-constraint conflict (Prisma `P2002`)                               |
| `422` | Semantically invalid (e.g. missing required employee inputs)              |
| `500` | Unexpected error (`INTERNAL_ERROR`)                                       |

---

## Canonical Handler Pattern

Copy this shape for every new admin route. It demonstrates `uuidField()`, `safeParse`, the helpers, `ERROR_CODES`, and `isPrismaError`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient, TenantRole } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES, isPrismaError } from '../lib/prisma-helpers.js';

const ParamSchema = z.object({ tenantId: uuidField(), id: uuidField() });

export function exampleRoutes({ prisma }: { prisma: PrismaClient }): Router {
  const router = Router();
  const logger = createLogger('example-routes');

  router.get(
    '/admin/tenants/:tenantId/things/:id',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const parsed = ParamSchema.safeParse(req.params);
      if (!parsed.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID, undefined, { issues: parsed.error.issues });
        return;
      }
      const { tenantId, id } = parsed.data;
      try {
        const thing = await prisma.thing.findFirst({
          where: { id, tenant_id: tenantId, deleted_at: null },
        });
        if (!thing) {
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }
        sendSuccess(res, 200, thing);
      } catch (err) {
        logger.error({ err }, 'Failed to get thing');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  return router;
}
```

**Validation discipline:** validate `req.params`, `req.query`, and `req.body` with their own `safeParse` calls, returning `sendError(res, 400, ...)` with `{ issues }` on the first failure. Express delivers query params as strings — use `z.enum(['true','false']).transform(...)` for booleans (see `TriggerEmployeeQuerySchema`).

---

## Admin API Endpoint Catalog

Auth: every endpoint below requires `Authorization: Bearer $SERVICE_TOKEN` (or a valid Supabase JWT with sufficient role) unless noted as OAuth/internal/public. This table is the authoritative catalog — it was moved here out of AGENTS.md.

| Method   | Path                                                      | Description                                                                                                               |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/admin/tenants/:tenantId/employees/:slug/trigger`        | Creates task, returns 202 + `{ task_id, status_url }`. Add `?dry_run=true` to validate without creating.                  |
| `GET`    | `/admin/tenants/:tenantId/tasks/:id`                      | Check task status (tenant-scoped, 404 on cross-tenant access).                                                            |
| `GET`    | `/admin/tenants/:tenantId/tasks/:id/logs`                 | Stream task execution logs as SSE (local Docker mode only; requires log file at `/tmp/employee-{taskId.slice(0,8)}.log`). |
| `GET`    | `/admin/tools`                                            | List all available shell tools with parsed metadata (description, flags, env vars, output shape, SKILL.md enrichment).    |
| `GET`    | `/admin/tools/:service/:toolName`                         | Get full metadata for a single tool.                                                                                      |
| `GET`    | `/admin/model-catalog`                                    | List active catalog models (`?include_inactive=true` for all).                                                            |
| `POST`   | `/admin/model-catalog`                                    | Add model to catalog.                                                                                                     |
| `PATCH`  | `/admin/model-catalog/:id`                                | Update catalog entry.                                                                                                     |
| `DELETE` | `/admin/model-catalog/:id`                                | Soft-delete catalog entry.                                                                                                |
| `GET`    | `/admin/tenants/:tenantId/archetypes/model-questions`     | Returns the 3 plain-language recommendation questions.                                                                    |
| `POST`   | `/admin/tenants/:tenantId/archetypes/recommend-model`     | Accepts archetype draft + user answers, returns top-3 ranked model recommendations.                                       |
| `GET`    | `/admin/platform-settings`                                | List all platform settings (key, value, description, is_required).                                                        |
| `PATCH`  | `/admin/platform-settings/:key`                           | Update a platform setting value.                                                                                          |
| `GET`    | `/admin/tenants/:tenantId/github/repos`                   | List repos accessible to the tenant's GitHub App installation (requires `github_installation_id` tenant secret).          |
| `GET`    | `/admin/tenants/:tenantId/github/available-installations` | List GitHub App installations linkable to this tenant (requires App JWT).                                                 |
| `POST`   | `/admin/tenants/:tenantId/github/link-installation`       | Link an existing GitHub App installation to this tenant (`installation_id` must be a string).                             |
| `DELETE` | `/admin/tenants/:tenantId/integrations/github`            | Disconnect GitHub from this tenant (soft-delete, does not affect other tenants sharing the installation).                 |
| `DELETE` | `/admin/tenants/:tenantId/integrations/google`            | Disconnect Google from tenant (soft-delete).                                                                              |
| `GET`    | `/admin/tenants/:tenantId/composio/connect`               | Initiate Composio OAuth for a toolkit (`?toolkit=notion`). Returns `{ url }` for browser redirect. Requires ADMIN role.   |
| `GET`    | `/admin/tenants/:tenantId/composio/connections`           | List active Composio connections for the tenant. Returns `[{ toolkit, status, connected_at }]`. Requires MEMBER role.     |
| `DELETE` | `/admin/tenants/:tenantId/composio/connections/:toolkit`  | Disconnect a Composio toolkit (soft-delete). Returns 204. Requires ADMIN role.                                            |
| `GET`    | `/admin/tenants/:tenantId/composio/usage`                 | List Composio tool call audit log grouped by toolkit and date. Returns `[{ toolkit, date, count }]`. Requires MEMBER.     |

**GitHub OAuth (engineer employee):**

| Method | Path                    | Description                                                       |
| ------ | ----------------------- | ----------------------------------------------------------------- |
| `GET`  | `/auth/github/install`  | Initiates GitHub App installation flow for a tenant.              |
| `GET`  | `/auth/github/callback` | OAuth callback; stores `github_installation_id` as tenant secret. |

**Google OAuth (Google Workspace integration):**

| Method | Path                                         | Description                                                  |
| ------ | -------------------------------------------- | ------------------------------------------------------------ |
| `GET`  | `/integrations/google/install?tenant=<slug>` | Initiates Google OAuth flow for a tenant.                    |
| `GET`  | `/integrations/google/callback`              | OAuth callback; stores 5 Google secrets in `tenant_secrets`. |

**Internal (worker containers only — auth via `X-Task-ID` header, not `Authorization: Bearer`):**

| Method | Path                                   | Description                                                                                                                                         |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/internal/tasks/:taskId/github-token` | Returns a short-lived GitHub App installation token scoped to the task's tenant. Used by `tsx /tools/github/get-token.ts` inside worker containers. |
| `POST` | `/internal/tasks/:taskId/google-token` | Returns a fresh Google access token for executing tasks.                                                                                            |

> **GitHub token manager** (`src/gateway/services/github-token-manager.ts`): generates RS256 JWT + installation tokens via GitHub App API. Tokens have a 1-hour TTL; the manager caches them for 55 minutes to avoid redundant API calls.

### Trigger example

```bash
TENANT=00000000-0000-0000-0000-000000000002
curl -X POST -H "Authorization: Bearer $SERVICE_TOKEN" \
  "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" \
  -H "Content-Type: application/json" -d '{}'
```

> The README documents an additional deprecated `/admin/tenants/:tenantId/projects` CRUD set (engineering employee, on hold). Don't add features there.

---

## Quick Checklist for a New Route

- [ ] Path under `/admin/tenants/:tenantId/...` if tenant-scoped; `authMiddleware + requireAuth + requireTenantRole(...)` attached
- [ ] UUID params validated with `uuidField()` — **not** `z.string().uuid()`
- [ ] `req.params` / `req.query` / `req.body` each `safeParse`d; 400 + `{ issues }` on failure
- [ ] All responses via `sendSuccess` / `sendError` — no inline `res.status().json()`
- [ ] Error `code` from `ERROR_CODES` (or a justified route-specific literal)
- [ ] Prisma errors detected with `isPrismaError(err)`; `P2002` → 409
- [ ] DB queries scoped by `tenant_id` and filter `deleted_at: null` (soft-delete only)
- [ ] Business logic in a service/repository, not the handler
