# Learnings

## Project Conventions

- TenantIntegrationRepository uses Prisma — `findMany` for multi-result queries, `findFirst` for single
- All integration deletes are soft-delete (`deleted_at: new Date()`) — EXCEPT tenant secrets which use hard delete (Prisma `.delete()`)
- Routes in `admin-github.ts` all use `requireAdminKey` middleware + `TenantIdParamSchema` param validation
- Test files use `vi.hoisted()` for mock setup to avoid hoisting issues
- Express routes co-located in same router file where logical
- Server registration: `app.use(adminGithubRoutes({ prisma }))` in `src/gateway/server.ts:213`

## Key File Locations

- `src/gateway/services/tenant-integration-repository.ts` — T1 target
- `src/gateway/routes/github.ts` — T2 target (webhook handler)
- `src/gateway/routes/admin-github.ts` — T3+T4 targets
- `src/gateway/routes/__tests__/github-webhook.test.ts` — T2 tests
- `src/gateway/routes/__tests__/admin-github.test.ts` — T6 tests
- `dashboard/src/panels/integrations/IntegrationsPage.tsx` — T5 target
- `dashboard/src/lib/gateway.ts` — T5 API functions
- `dashboard/src/lib/types.ts` — T5 type definitions

## GitHub JWT Auth

- JWT uses RS256, `iat: now-60`, `exp: now+600`, `iss: GITHUB_APP_ID`
- `generateAppJwt` is private in `github-token-manager.ts` — DO NOT MODIFY that file
- Re-implement locally using `crypto.createSign('RSA-SHA256')` + base64url helper
- Normalize `\\n` → `\n` in GITHUB_PRIVATE_KEY before use

## Critical Guardrails

- NO `@@unique([provider, external_id])` Prisma constraint
- NO changes to `github-token-manager.ts`
- NO hard-delete for tenant_integrations (soft-delete only via `deleted_at`)
- NO GitHub API uninstall call from disconnect endpoint
- Disconnect endpoint removes only the requesting tenant's records

## E2E Verification Findings (Task 7 — 2026-06-03)

### link-installation API — installation_id must be a STRING
- Route validates: `typeof installation_id !== 'string'` → returns 400
- Passing as JSON number: `{"installation_id": 137599429}` → `{"error": "installation_id is required"}`
- Correct: `{"installation_id": "137599429"}` → `{"linked": true, ...}`
- Evidence: `.sisyphus/evidence/task-7-e2e-full-flow.txt`

### Shared Installation Verification
- DozalDevs (external_id=137599429) and VLRE can both share installation_id=137599429
- Both show in tenant_integrations with deleted_at=NULL when both connected
- Disconnect of VLRE only sets VLRE's deleted_at — DozalDevs remains active
- VLRE repos returns 404 after disconnect; DozalDevs repos unaffected (109 repos)

### Dashboard UI Behavior
- Connected tenant: "✓ Connected · {installation_id} · {time}" + Reconnect + Disconnect buttons
- Disconnected tenant: "Connect GitHub" link + "Or link an existing GitHub connection:" with available installation list
- Console 404 for /dashboard/api/config.js and /favicon.ico are pre-existing benign errors

## F3 Real Manual QA Results (2026-06-03)

### All 8 checks PASSED — VERDICT: APPROVE

| Check | Result | Key Evidence |
|-------|--------|-------------|
| 1. available-installations | PASS | 1 install (id:137599429, login:viiqswim, already_linked:false) |
| 2. DB state | PASS | DozalDevs connected (deleted_at NULL), VLRE soft-deleted |
| 3. disconnect idempotent | PASS | HTTP 200 on already-disconnected tenant |
| 4. link-installation | PASS | `{"linked":true,"installation_id":"137599429"}` |
| 5. shared installation_id | PASS | Both rows: external_id=137599429, deleted_at=NULL |
| 6. both fetch repos | PASS | DozalDevs=109, VLRE=109 (same count) |
| 7. disconnect isolation | PASS | VLRE is_deleted=t, DozalDevs is_deleted=f, still 109 repos |
| 8. dashboard UI | PASS | DozalDevs: "✓ Connected·137599429·Disconnect btn"; VLRE: "Connect GitHub"+"Or link existing·viiqswim/Link btn"; console error = pre-existing benign 404 |

### State Left After QA
- DozalDevs: connected (deleted_at NULL)
- VLRE: disconnected (deleted_at set) — intentional from Check 7
- VLRE can be re-linked via dashboard "Link" button or link-installation API
