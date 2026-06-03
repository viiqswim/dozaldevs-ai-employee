# GitHub App Multi-Tenant Shared Installation

## TL;DR

> **Quick Summary**: Fix the multi-tenant GitHub App install flow so multiple tenants can connect to the same GitHub account. Currently, when tenant A installs the App, tenant B sees "already configured" with a disabled Save button and no redirect fires. The fix uses the GitHub API to look up existing installations and share the `installation_id` across tenants — the industry-standard pattern used by Vercel, Sentry, and Linear. Also adds a Disconnect button and fixes a webhook cleanup bug.
>
> **Deliverables**:
>
> - New `GET /admin/tenants/:tenantId/github/available-installations` endpoint (lists GitHub App installations via API)
> - Modified install flow that detects existing installations and offers to link them
> - Disconnect GitHub button in the integrations dashboard
> - Fixed webhook cleanup for shared installations (`findManyByExternalId`)
> - Unit tests for all new/modified handlers
> - Updated documentation
>
> **Estimated Effort**: Medium (4-6 hours)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (repo method) → T3 (available-installations endpoint) → T5 (dashboard UX) → T7 (E2E verification)

---

## Context

### Original Request

Two tenants (DozalDevs + VLRE) need to connect to the same GitHub account via the same GitHub App. When DozalDevs installs the App, VLRE sees "already configured" on GitHub with a disabled Save button — no redirect fires, so VLRE's `installation_id` never gets stored.

### Interview Summary

**Key Discussions**:

- Root cause: GitHub App installations are 1-per-account. GitHub shows "Configure" (not "Install") for already-installed accounts, and the config page Save button is disabled when nothing changed — no redirect fires.
- Industry pattern: Vercel, Sentry, Linear all share `installation_id` across tenants. Our DB schema already supports this (no cross-tenant uniqueness constraint).
- Chosen approach: Smart API lookup — use `GET /app/installations` to find existing installations and store them for the new tenant.
- Disconnect button: User requested this in scope.

**Research Findings**:

- `GET /app/installations` lists all installations (authenticated as App via JWT)
- `installation_id` IS included in redirects for both `install` and `update` `setup_action` values
- The callback handler already handles both — the problem is the redirect never fires for the "already configured" case
- `findByExternalId` returns only the first matching tenant — bug when sharing installations

### Metis Review

**Identified Gaps** (addressed):

- `findByExternalId` uses `findFirst` — non-deterministic when multiple tenants share installation_id → Fixed with `findManyByExternalId`
- `installation.deleted` webhook only cleans up first tenant → Fixed to iterate all matching tenants
- `installation.deleted` handler has no try/catch → Added error handling
- Disconnect must NOT call GitHub API to uninstall (would break other tenants) → Soft-delete only
- Token cache is correct for shared installations — DO NOT change
- Smart API lookup needs account-matching — endpoint will list available installations for the user to select
- Race condition on simultaneous connect is benign — both upserts succeed

---

## Work Objectives

### Core Objective

Enable multiple tenants to connect to the same GitHub account by sharing the `installation_id`, with a dashboard UX that detects existing installations and lets tenants link them without going through GitHub's broken "Configure" flow.

### Concrete Deliverables

- `findManyByExternalId` method in `tenant-integration-repository.ts`
- Fixed `installation.deleted` handler in `github.ts`
- `GET /admin/tenants/:tenantId/github/available-installations` endpoint
- `DELETE /admin/tenants/:tenantId/integrations/github` endpoint
- Updated `IntegrationsPage.tsx` with Disconnect button and "Link existing" flow
- Unit tests for new/modified code
- Updated integration guide and AGENTS.md

### Definition of Done

- [ ] Tenant B can connect to a GitHub account already connected by Tenant A
- [ ] `installation.deleted` webhook cleans up ALL tenants sharing the installation
- [ ] Disconnect button removes only the requesting tenant's records
- [ ] Disconnect does NOT affect other tenants sharing the same installation
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Build passes (`pnpm build`)

### Must Have

- `findManyByExternalId` returns `TenantIntegration[]` (not single result)
- `installation.deleted` iterates ALL returned tenants and cleans up each
- `installation.deleted` has try/catch per tenant cleanup
- Disconnect endpoint is soft-delete only (sets `deleted_at`)
- Disconnect does NOT call GitHub API to uninstall the App
- New available-installations endpoint authenticates as App via JWT
- Dashboard detects existing installations before redirecting to GitHub

### Must NOT Have (Guardrails)

- NO `@@unique([provider, external_id])` Prisma constraint — breaks multi-tenant sharing
- NO changes to `github-token-manager.ts` — cache is already correct
- NO changes to `@@unique([tenant_id, provider])` on `tenant_integrations`
- NO hard-delete of any DB row (soft-delete via `deleted_at` only)
- NO GitHub API call from disconnect endpoint to uninstall the App
- NO GitHub org name display in the UI (out of scope)
- NO handling of `installation.suspended`/`installation.unsuspended` webhooks
- NO per-tenant repo permission scoping
- NO rate limiting on the new endpoint (out of scope)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests after implementation)
- **Framework**: Vitest (bun test compatible)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend routes**: Use Bash (curl) — verify HTTP responses and DB state
- **Dashboard UI**: Use Playwright — navigate, click, assert DOM
- **DB state**: Use psql — verify rows exist/updated correctly

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Add findManyByExternalId to tenant-integration-repository [quick]
├── Task 2: Fix installation.deleted webhook cleanup [quick]
└── Task 3: Add available-installations API endpoint [unspecified-high]

Wave 2 (After Wave 1 — API + UI):
├── Task 4: Add disconnect GitHub endpoint [quick]
├── Task 5: Dashboard: Disconnect button + Link existing flow [visual-engineering]
└── Task 6: Unit tests for new/modified code [unspecified-high]

Wave 3 (After Wave 2 — docs + verification):
├── Task 7: E2E verification [unspecified-high]
├── Task 8: Update documentation [quick]
└── Task 9: Notify completion [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks  |
| ---- | ---------- | ------- |
| 1    | —          | 2, 4, 6 |
| 2    | 1          | 6, 7    |
| 3    | —          | 5, 6, 7 |
| 4    | 1          | 5, 6, 7 |
| 5    | 3, 4       | 7       |
| 6    | 1, 2, 3, 4 | 7       |
| 7    | 2, 5, 6    | F1-F4   |
| 8    | 7          | F1-F4   |
| 9    | F1-F4      | —       |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `unspecified-high`
- **Wave 2**: **3 tasks** — T4 → `quick`, T5 → `visual-engineering`, T6 → `unspecified-high`
- **Wave 3**: **3 tasks** — T7 → `unspecified-high`, T8 → `quick`, T9 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add `findManyByExternalId` method to tenant-integration-repository

  **What to do**:
  - Add a new method `findManyByExternalId(provider: string, externalId: string): Promise<TenantIntegration[]>` to `TenantIntegrationRepository` in `src/gateway/services/tenant-integration-repository.ts`
  - Implementation: use `this.prisma.tenantIntegration.findMany({ where: { provider, external_id: externalId, deleted_at: null }, orderBy: { created_at: 'asc' } })`
  - Keep the existing `findByExternalId` method unchanged (it's used by existing tests and the current webhook handler — Task 2 will switch the webhook handler to use the new method)
  - Export the return type if needed

  **Must NOT do**:
  - Do NOT remove or modify the existing `findByExternalId` method
  - Do NOT add any Prisma schema changes or `@@unique` constraints
  - Do NOT modify `github-token-manager.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change, adding one method (~5 lines) to an existing class
  - **Skills**: []
    - No domain-specific skills needed for this simple repository method addition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2, 4, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/services/tenant-integration-repository.ts:21-25` — Existing `findByExternalId` method using `findFirst`. The new method mirrors this but uses `findMany` with `orderBy: { created_at: 'asc' }` and returns `TenantIntegration[]`
  - `src/gateway/services/tenant-integration-repository.ts:12-18` — `findByTenantAndProvider` method showing the pattern for `deleted_at: null` filtering

  **API/Type References**:
  - `src/gateway/services/tenant-integration-repository.ts:1` — `TenantIntegration` type imported from `@prisma/client`

  **Acceptance Criteria**:
  - [ ] New method `findManyByExternalId` exists in `TenantIntegrationRepository`
  - [ ] Method signature: `(provider: string, externalId: string): Promise<TenantIntegration[]>`
  - [ ] Method filters by `deleted_at: null`
  - [ ] Method uses `orderBy: { created_at: 'asc' }`
  - [ ] Existing `findByExternalId` method is unchanged
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build succeeds with new method
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `pnpm build`
      2. Check exit code is 0
    Expected Result: Build passes with no TypeScript errors
    Failure Indicators: TypeScript compilation error mentioning `findManyByExternalId`
    Evidence: .sisyphus/evidence/task-1-build-check.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `pnpm test -- --run src/gateway/routes/__tests__/github-webhook.test.ts`
      2. Check all existing tests pass (the tests still reference `findByExternalId` which was not removed)
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure in the github-webhook test file
    Evidence: .sisyphus/evidence/task-1-existing-tests.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `fix(github): support shared installations across tenants`
  - Files: `src/gateway/services/tenant-integration-repository.ts`

- [x] 2. Fix `installation.deleted` webhook handler for shared installations

  **What to do**:
  - In `src/gateway/routes/github.ts`, modify the `installation.deleted` handler (lines 69-90) to:
    1. Call the new `integrationRepo.findManyByExternalId('github', installationId)` instead of `findByExternalId`
    2. If the result array is empty, return the existing "unknown installation" response
    3. Iterate over ALL returned integrations and for each:
       - Call `integrationRepo.delete(integration.tenant_id, 'github')` — wrapped in try/catch
       - Call `secretRepo.delete(integration.tenant_id, 'github_installation_id')` — wrapped in try/catch
       - Log each tenant cleanup individually (success or failure)
    4. If any individual cleanup fails, log the error but continue with remaining tenants
    5. After the loop, return `{ received: true, action: 'deleted', tenants_cleaned: N }`
  - Update the mock setup in the test file `src/gateway/routes/__tests__/github-webhook.test.ts`:
    1. Add `mockFindManyByExternalId` mock function alongside existing `mockFindByExternalId`
    2. Add it to the `TenantIntegrationRepository` mock constructor
    3. Update the existing `installation.deleted` test to use `mockFindManyByExternalId` (returning a single-element array) so the test still passes
    4. Add a NEW test: `installation.deleted — cleans up ALL tenants sharing the installation` — mock returns 2 integrations, verify both get cleaned up
    5. Add a NEW test: `installation.deleted — continues cleanup if one tenant fails` — mock `integrationRepo.delete` to throw for the first tenant, verify the second tenant still gets cleaned up

  **Must NOT do**:
  - Do NOT change the webhook signature verification logic
  - Do NOT handle `installation.suspended` or `installation.unsuspended` events
  - Do NOT modify `github-token-manager.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two-file change with clear before/after — modify handler loop + update tests
  - **Skills**: []
    - No domain-specific skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T3, but needs T1 completed first for `findManyByExternalId`)
  - **Parallel Group**: Wave 1 (starts after T1 completes if T1 is fast, otherwise Wave 2)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/routes/github.ts:69-90` — Current `installation.deleted` handler that uses `findByExternalId` (returns single). This is the code to modify.
  - `src/gateway/routes/__tests__/github-webhook.test.ts:70-96` — Existing test for `installation.deleted` that needs updating to use `findManyByExternalId`
  - `src/gateway/routes/__tests__/github-webhook.test.ts:6-10` — Mock setup pattern using `vi.hoisted()` — add `mockFindManyByExternalId` here

  **API/Type References**:
  - `src/gateway/services/tenant-integration-repository.ts` — Task 1 adds `findManyByExternalId` returning `TenantIntegration[]`

  **Test References**:
  - `src/gateway/routes/__tests__/github-webhook.test.ts:48-58` — `makeInstallationPayload` helper function used in tests
  - `src/gateway/routes/__tests__/github-webhook.test.ts:60-66` — Test setup pattern (beforeEach, env vars)

  **Acceptance Criteria**:
  - [ ] `installation.deleted` handler uses `findManyByExternalId` instead of `findByExternalId`
  - [ ] Handler iterates ALL returned integrations and cleans up each tenant
  - [ ] Each individual cleanup is wrapped in try/catch
  - [ ] If one tenant cleanup fails, remaining tenants are still cleaned up
  - [ ] Response includes `tenants_cleaned` count
  - [ ] All existing webhook tests still pass
  - [ ] 2 new tests added and passing

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All webhook tests pass including new shared-installation tests
    Tool: Bash
    Preconditions: Task 1 completed (findManyByExternalId exists)
    Steps:
      1. Run `pnpm test -- --run src/gateway/routes/__tests__/github-webhook.test.ts`
      2. Verify all tests pass including the 2 new tests
    Expected Result: All tests pass (previous count + 2 new), 0 failures
    Failure Indicators: Any test failure; mock not being called expected number of times
    Evidence: .sisyphus/evidence/task-2-webhook-tests.txt

  Scenario: Error in one tenant cleanup doesn't block others
    Tool: Bash
    Preconditions: New test exists for partial failure
    Steps:
      1. Run `pnpm test -- --run src/gateway/routes/__tests__/github-webhook.test.ts -t "continues cleanup"`
      2. Verify the partial-failure test passes
    Expected Result: Test asserts that second tenant is cleaned up even when first throws
    Failure Indicators: Test fails because loop doesn't continue after error
    Evidence: .sisyphus/evidence/task-2-partial-failure-test.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `fix(github): support shared installations across tenants`
  - Files: `src/gateway/routes/github.ts`, `src/gateway/routes/__tests__/github-webhook.test.ts`

- [x] 3. Add `GET /admin/tenants/:tenantId/github/available-installations` endpoint

  **What to do**:
  - Add a new route in `src/gateway/routes/admin-github.ts` (co-locate with existing `/admin/tenants/:tenantId/github/repos` endpoint):
    1. Route: `GET /admin/tenants/:tenantId/github/available-installations`
    2. Auth: `requireAdminKey` middleware (same as the repos endpoint)
    3. Validate `tenantId` param with `TenantIdParamSchema`
    4. Authenticate as the GitHub App using JWT:
       - Read `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` from env vars
       - Generate JWT using the `generateAppJwt` function — **extract it from `github-token-manager.ts` into a shared export** OR duplicate the JWT generation logic locally (prefer extraction to avoid duplication)
       - Actually: the `generateAppJwt` function in `github-token-manager.ts` is private (not exported). **Instead of modifying that file (forbidden), re-implement the JWT generation in this route file using the same pattern**: read env vars, create RS256 JWT with `iss=appId`, `iat=now-60`, `exp=now+600`
    5. Call `GET https://api.github.com/app/installations` with the JWT bearer token, paginate through all results
    6. For each installation, return: `{ id: number, account: { login: string, type: string, avatar_url: string }, app_id: number, target_type: string, repository_selection: string }`
    7. Also check which installations the current tenant already has linked (query `tenant_integrations` for this tenant + provider=github)
    8. Return response shape: `{ installations: Array<{ id: number, account: { login: string, type: string, avatar_url: string }, already_linked: boolean }> }`
  - Add a NEW route to link an existing installation: `POST /admin/tenants/:tenantId/github/link-installation`
    1. Auth: `requireAdminKey`
    2. Body: `{ installation_id: string }` — validate with Zod
    3. Verify the installation_id exists by calling `GET https://api.github.com/app/installations/:id` with App JWT
    4. Store using `secretRepo.set(tenantId, 'github_installation_id', installationId)` and `integrationRepo.upsert(tenantId, 'github', { external_id: installationId })`
    5. Return 200 with `{ linked: true, installation_id: string }`
  - Import `TenantIntegrationRepository` in addition to existing `TenantSecretRepository`

  **Must NOT do**:
  - Do NOT modify `github-token-manager.ts` (forbidden by guardrails)
  - Do NOT add rate limiting (out of scope)
  - Do NOT return GitHub org names or additional metadata beyond what's specified

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step task — two new API endpoints + GitHub API integration + JWT generation. Needs careful error handling and proper GitHub API interaction.
  - **Skills**: []
    - No domain-specific skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-github.ts:85-128` — Existing `/admin/tenants/:tenantId/github/repos` endpoint — follow this exact pattern for auth, param validation, error handling, and response shape
  - `src/gateway/routes/admin-github.ts:31-63` — `fetchAllRepos` function showing GitHub API pagination with `Link` header parsing — reuse `parseNextLink` helper for the installations endpoint pagination
  - `src/gateway/routes/admin-github.ts:66-77` — `parseNextLink` helper — reuse for installations pagination

  **API/Type References**:
  - `src/gateway/services/github-token-manager.ts:29-46` — `generateAppJwt` function (private) — copy this pattern for JWT generation in the route file. Uses RS256, `iat: now - 60`, `exp: now + 10*60`, `iss: appId`
  - `src/gateway/services/github-token-manager.ts:24-27` — `base64url` helper — copy this too
  - `src/gateway/validation/schemas.ts` — `TenantIdParamSchema` for param validation
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey` middleware

  **External References**:
  - GitHub API: `GET /app/installations` — https://docs.github.com/en/rest/apps/apps#list-installations-for-the-authenticated-app — requires JWT auth, returns array of installation objects with `id`, `account`, `target_type`, `repository_selection`
  - GitHub API: `GET /app/installations/:id` — https://docs.github.com/en/rest/apps/apps#get-an-installation-for-the-authenticated-app — verify installation exists before linking

  **WHY Each Reference Matters**:
  - `admin-github.ts:85-128` — Copy the exact route structure: `requireAdminKey` middleware, `TenantIdParamSchema` validation, error response pattern. Ensures consistency.
  - `github-token-manager.ts:29-46` — The JWT generation pattern is critical. Must use RS256 with proper `iat`/`exp` claims. Cannot import it (private + file is forbidden to modify), so copy the implementation.
  - `parseNextLink` — GitHub API uses `Link` headers for pagination. The existing helper handles this correctly.

  **Acceptance Criteria**:
  - [ ] `GET /admin/tenants/:tenantId/github/available-installations` returns list of installations
  - [ ] `POST /admin/tenants/:tenantId/github/link-installation` stores installation_id for tenant
  - [ ] Both endpoints require admin key auth
  - [ ] JWT generation works correctly for GitHub App authentication
  - [ ] Response includes `already_linked` boolean per installation
  - [ ] `pnpm build` passes
  - [ ] Linking an installation stores both tenant secret and tenant integration

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Available-installations endpoint returns installations
    Tool: Bash (curl)
    Preconditions: Gateway running at localhost:7700, GITHUB_APP_ID and GITHUB_PRIVATE_KEY set in .env
    Steps:
      1. source .env
      2. curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/github/available-installations" | jq '.installations | length'
      3. Verify response has at least 1 installation (Victor's personal account)
    Expected Result: HTTP 200, JSON with `installations` array containing at least 1 entry with `id`, `account.login`, `already_linked`
    Failure Indicators: HTTP 500/502, empty installations array when App is installed, JWT auth error
    Evidence: .sisyphus/evidence/task-3-available-installations.txt

  Scenario: Link-installation endpoint stores installation_id
    Tool: Bash (curl + psql)
    Preconditions: Gateway running, VLRE tenant has no github integration
    Steps:
      1. First disconnect VLRE if connected: call DELETE endpoint (Task 4) or manually clear
      2. Get available installations: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/github/available-installations" | jq '.installations[0].id'
      3. Link it: curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/github/link-installation" -d '{"installation_id":"<ID_FROM_STEP_2>"}'
      4. Verify DB: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT external_id FROM tenant_integrations WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND provider='github' AND deleted_at IS NULL;"
    Expected Result: HTTP 200 with `{ linked: true }`, DB row exists with correct external_id
    Failure Indicators: HTTP 400/500, no DB row created, installation_id mismatch
    Evidence: .sisyphus/evidence/task-3-link-installation.txt

  Scenario: Endpoint returns 401 without admin key
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/github/available-installations"
    Expected Result: HTTP 401
    Failure Indicators: HTTP 200 (endpoint not protected)
    Evidence: .sisyphus/evidence/task-3-auth-check.txt
  ```

  **Commit**: YES
  - Message: `feat(github): add available-installations and link-installation endpoints`
  - Files: `src/gateway/routes/admin-github.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Add `DELETE /admin/tenants/:tenantId/integrations/github` disconnect endpoint

  **What to do**:
  - Add a new route in `src/gateway/routes/admin-github.ts` (co-locate with existing GitHub admin routes):
    1. Route: `DELETE /admin/tenants/:tenantId/integrations/github`
    2. Auth: `requireAdminKey` middleware
    3. Validate `tenantId` with `TenantIdParamSchema`
    4. Soft-delete the tenant's GitHub integration: call `integrationRepo.delete(tenantId, 'github')` — this already sets `deleted_at` (see `tenant-integration-repository.ts:50-59`)
    5. Delete the tenant's `github_installation_id` secret: call `secretRepo.delete(tenantId, 'github_installation_id')` — NOTE: `TenantSecretRepository.delete` does a HARD delete (Prisma `.delete()`). This is acceptable for secrets since they are not subject to the soft-delete convention (secrets are re-created via `set()` on reconnect, and the encryption payload changes each time making old rows useless)
    6. Return `{ disconnected: true, tenant_id: tenantId }`
    7. If neither integration nor secret exists, still return 200 (idempotent)
  - Import `TenantIntegrationRepository` if not already imported in the file

  **Must NOT do**:
  - Do NOT call the GitHub API to uninstall the App (would break other tenants sharing the installation)
  - Do NOT delete tenant_integrations rows for OTHER tenants
  - Do NOT modify `github-token-manager.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single route handler (~20 lines), straightforward soft-delete pattern following existing code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 1 (needs `TenantIntegrationRepository` import pattern; technically can start immediately since the repo is unchanged, but logically grouped after Wave 1)

  **References**:

  **Pattern References**:
  - `src/gateway/routes/admin-github.ts:85-128` — Existing repos endpoint — follow same auth/validation/error pattern
  - `src/gateway/services/tenant-integration-repository.ts:50-59` — `delete()` method — already does soft-delete via `deleted_at: new Date()`. Just call it.
  - `src/gateway/services/tenant-secret-repository.ts:52-62` — `delete()` method — hard-deletes the secret row. This is the correct behavior for encrypted secrets.

  **API/Type References**:
  - `src/gateway/validation/schemas.ts` — `TenantIdParamSchema`
  - `src/gateway/middleware/admin-auth.ts` — `requireAdminKey`

  **Acceptance Criteria**:
  - [ ] `DELETE /admin/tenants/:tenantId/integrations/github` returns 200
  - [ ] Integration row gets `deleted_at` set (soft-delete)
  - [ ] Secret row for `github_installation_id` is deleted
  - [ ] Endpoint does NOT call GitHub API
  - [ ] Other tenants' integrations are unaffected
  - [ ] Idempotent — calling twice returns 200 both times
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Disconnect removes only requesting tenant's GitHub connection
    Tool: Bash (curl + psql)
    Preconditions: Gateway running. DozalDevs tenant has github integration connected.
    Steps:
      1. source .env
      2. Verify DozalDevs has github integration: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id FROM tenant_integrations WHERE tenant_id='00000000-0000-0000-0000-000000000002' AND provider='github' AND deleted_at IS NULL;"
      3. Call disconnect: curl -s -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/integrations/github"
      4. Verify DozalDevs integration is soft-deleted: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT deleted_at FROM tenant_integrations WHERE tenant_id='00000000-0000-0000-0000-000000000002' AND provider='github';"
      5. Verify DozalDevs secret is gone: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT count(*) FROM tenant_secrets WHERE tenant_id='00000000-0000-0000-0000-000000000002' AND key='github_installation_id';"
      6. If VLRE has github integration, verify it's unaffected: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT deleted_at FROM tenant_integrations WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND provider='github';"
    Expected Result: HTTP 200 with `{ disconnected: true }`. DozalDevs integration has `deleted_at` set. DozalDevs secret count is 0. VLRE integration (if exists) has `deleted_at IS NULL`.
    Failure Indicators: HTTP 500, other tenant's integration affected, secret still exists
    Evidence: .sisyphus/evidence/task-4-disconnect.txt

  Scenario: Disconnect is idempotent
    Tool: Bash (curl)
    Preconditions: Tenant already disconnected from previous scenario
    Steps:
      1. Call disconnect again: curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/integrations/github"
    Expected Result: HTTP 200 (not 404 or 500)
    Failure Indicators: HTTP 404 or 500
    Evidence: .sisyphus/evidence/task-4-idempotent.txt
  ```

  **Commit**: YES
  - Message: `feat(github): add disconnect endpoint for tenant GitHub integration`
  - Files: `src/gateway/routes/admin-github.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Dashboard: Add Disconnect button and Link Existing Installation flow

  **What to do**:
  - Modify `dashboard/src/panels/integrations/IntegrationsPage.tsx`:
    1. **Disconnect button**: When GitHub integration exists (row has `provider === 'github'`), add a "Disconnect" button next to the "Reconnect" link
       - Button style: `variant="ghost"` with `text-destructive` color, small size
       - On click: show a confirmation dialog ("Are you sure? This will disconnect GitHub from this organization. Other organizations using the same GitHub account won't be affected.")
       - On confirm: call `DELETE /admin/tenants/${tenantId}/integrations/github` via `gatewayFetch`
       - On success: refresh integrations list
    2. **Link Existing flow**: When GitHub is NOT connected, check if there are available installations:
       - On component mount (when no github integration exists), call `GET /admin/tenants/${tenantId}/github/available-installations`
       - If installations exist: show a dropdown/list below the "Connect GitHub" button with text "Or link an existing GitHub connection:" followed by the available installations (showing `account.login` and whether it's `already_linked`)
       - Each installation shows a "Link" button that calls `POST /admin/tenants/${tenantId}/github/link-installation` with the `installation_id`
       - On success: refresh integrations list, show a success state
       - If no installations exist: show nothing extra (just the normal "Connect GitHub" button)
       - If the API call fails (e.g., GITHUB_APP_ID not set): silently fail, show nothing (graceful degradation)
  - Add new API functions in `dashboard/src/lib/gateway.ts`:
    1. `fetchAvailableInstallations(tenantId: string)` → calls `GET /admin/tenants/${tenantId}/github/available-installations`
    2. `linkGitHubInstallation(tenantId: string, installationId: string)` → calls `POST /admin/tenants/${tenantId}/github/link-installation`
    3. `disconnectGitHub(tenantId: string)` → calls `DELETE /admin/tenants/${tenantId}/integrations/github`
  - Add types in `dashboard/src/lib/types.ts`:
    1. `GitHubInstallation` type: `{ id: number; account: { login: string; type: string; avatar_url: string }; already_linked: boolean }`

  **Must NOT do**:
  - Do NOT display GitHub org names (out of scope — just show account login)
  - Do NOT add per-tenant repo permission scoping
  - Do NOT modify non-GitHub integration rows
  - Do NOT use Radix `<Select>` — use `SearchableSelect` if needed (AGENTS.md convention), though a simple list with buttons is fine for this case since there will typically be 1-3 installations

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard UI work — React components, state management, confirmation dialogs, loading states, visual polish
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (but depends on T3 and T4 completing first)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx:51-105` — `IntegrationRow` component — the Disconnect button and Link flow will modify the GitHub-specific row rendering
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx:70-85` — Current "Connected" state rendering — add Disconnect button here alongside "Reconnect"
  - `dashboard/src/panels/integrations/IntegrationsPage.tsx:86-101` — Current "Not connected" state rendering — add "Link existing" flow below the Connect button
  - `dashboard/src/lib/gateway.ts:390-392` — `fetchGitHubRepos` function — follow same `gatewayFetch` pattern for new API functions
  - `dashboard/src/lib/gateway.ts:42-64` — `gatewayFetch` helper — reuse for all new API calls

  **API/Type References**:
  - `dashboard/src/lib/types.ts:210` — Existing `TenantIntegration` type
  - `dashboard/src/lib/types.ts` — Add new `GitHubInstallation` type here

  **External References**:
  - `dashboard/src/components/ui/button.tsx` — Button component with `variant` prop
  - `dashboard/src/components/ui/badge.tsx` — Badge component (already used)

  **WHY Each Reference Matters**:
  - `IntegrationRow` component is the render target — Disconnect button goes inside the "Connected" branch, Link flow goes inside the "Not connected" branch
  - `gatewayFetch` is the authenticated HTTP client — all new API calls must go through it
  - Must follow card styling convention: `rounded-lg border bg-card` with `px-5 py-4` padding (AGENTS.md)

  **Acceptance Criteria**:
  - [ ] Disconnect button visible when GitHub is connected
  - [ ] Disconnect shows confirmation dialog before proceeding
  - [ ] Disconnect calls DELETE endpoint and refreshes the list
  - [ ] Link Existing flow shows available installations when GitHub is not connected
  - [ ] Clicking "Link" on an installation calls POST endpoint and refreshes
  - [ ] Graceful degradation if available-installations API fails
  - [ ] Dashboard builds: `pnpm dashboard:build` passes
  - [ ] No console errors on the integrations page

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Disconnect button visible and functional
    Tool: Playwright
    Preconditions: Gateway running, DozalDevs tenant has GitHub connected, dashboard accessible at localhost:7700
    Steps:
      1. Navigate to http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000002
      2. Wait for integrations to load (skeleton disappears)
      3. Find the GitHub integration row — verify it shows "✓ Connected" badge
      4. Find a "Disconnect" button within the GitHub row
      5. Click the Disconnect button
      6. Verify a confirmation dialog appears with text about "disconnect" or "remove"
      7. Click the confirm/accept button in the dialog
      8. Wait for the integrations list to refresh
      9. Verify the GitHub row now shows "Connect GitHub" (not "✓ Connected")
    Expected Result: GitHub integration disconnected, UI updates to show "Connect GitHub"
    Failure Indicators: No Disconnect button found, no confirmation dialog, UI doesn't refresh
    Evidence: .sisyphus/evidence/task-5-disconnect-ui.png

  Scenario: Link Existing flow shows available installations
    Tool: Playwright
    Preconditions: Gateway running, VLRE tenant has GitHub NOT connected, DozalDevs has it connected (so installation exists)
    Steps:
      1. Navigate to http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for integrations to load
      3. Find the GitHub row — verify it shows "Connect GitHub" (not connected)
      4. Look for text like "Or link an existing" or a list of available installations
      5. If installations are shown, verify at least one has an account login displayed
      6. Click the "Link" button next to the first installation
      7. Wait for the page to refresh
      8. Verify the GitHub row now shows "✓ Connected"
    Expected Result: Available installations are shown, linking works, UI updates to Connected
    Failure Indicators: No available installations shown, Link button doesn't work, 500 error in network
    Evidence: .sisyphus/evidence/task-5-link-existing-ui.png

  Scenario: Graceful degradation when GitHub App not configured
    Tool: Playwright
    Preconditions: Gateway running but GITHUB_APP_ID not set (or unset temporarily)
    Steps:
      1. Navigate to http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003
      2. Wait for integrations to load
      3. Verify the GitHub row shows "Connect GitHub" without errors
      4. Open browser console — verify no unhandled errors related to available-installations
    Expected Result: Page loads normally, no crash, "Connect GitHub" button still works
    Failure Indicators: Console error, page crash, error banner
    Evidence: .sisyphus/evidence/task-5-graceful-degradation.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add disconnect button and link-existing flow for GitHub`
  - Files: `dashboard/src/panels/integrations/IntegrationsPage.tsx`, `dashboard/src/lib/gateway.ts`, `dashboard/src/lib/types.ts`
  - Pre-commit: `pnpm dashboard:build`

- [x] 6. Unit tests for new and modified code

  **What to do**:
  - Add tests in `src/gateway/routes/__tests__/admin-github.test.ts` for the new endpoints:
    1. **Available-installations tests**:
       - Mock `generateAppJwt` (or mock `fetch` for the GitHub API call) and return a list of installations
       - Test: returns 200 with installations array
       - Test: returns 401 without admin key
       - Test: returns 502 when GitHub API fails
       - Test: marks installations as `already_linked: true` when tenant has matching integration
    2. **Link-installation tests**:
       - Test: returns 200 and stores installation_id (mock secretRepo.set + integrationRepo.upsert)
       - Test: returns 400 when installation_id is missing from body
       - Test: returns 401 without admin key
       - Test: returns 502 when GitHub API verification fails (installation doesn't exist)
    3. **Disconnect tests**:
       - Test: returns 200 and calls integrationRepo.delete + secretRepo.delete
       - Test: returns 200 idempotent when already disconnected (delete returns undefined/false)
       - Test: returns 401 without admin key
  - Update mock setup in the test file to include all new mocked methods

  **Must NOT do**:
  - Do NOT test `github-token-manager.ts` (out of scope, unchanged)
  - Do NOT write integration tests requiring a running gateway (unit tests with mocks only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test suites across different endpoints, needs careful mock setup matching the codebase patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Tasks 1-4 complete, so test targets exist)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:

  **Pattern References**:
  - `src/gateway/routes/__tests__/admin-github.test.ts:1-29` — Existing admin-github test file — extend this file with new test blocks
  - `src/gateway/routes/__tests__/github-webhook.test.ts:6-23` — Mock setup pattern using `vi.hoisted()` — follow this for new mocks
  - `src/gateway/routes/__tests__/github-oauth.test.ts:6-28` — Another mock setup example — follow for mocking multiple repositories

  **Test References**:
  - `src/gateway/routes/__tests__/admin-github.test.ts` — Existing test file for admin-github routes. Extend with new describe blocks.
  - `src/gateway/routes/__tests__/github-webhook.test.ts:70-96` — Example of testing a delete flow with mock assertions

  **Acceptance Criteria**:
  - [ ] At least 4 tests for available-installations endpoint
  - [ ] At least 3 tests for link-installation endpoint
  - [ ] At least 3 tests for disconnect endpoint
  - [ ] All tests pass: `pnpm test -- --run src/gateway/routes/__tests__/admin-github.test.ts`
  - [ ] Full test suite still passes: `pnpm test -- --run`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All new unit tests pass
    Tool: Bash
    Preconditions: Tasks 1-4 completed
    Steps:
      1. Run `pnpm test -- --run src/gateway/routes/__tests__/admin-github.test.ts`
      2. Verify all tests pass
    Expected Result: 10+ tests pass, 0 failures
    Failure Indicators: Any test failure, mock setup errors
    Evidence: .sisyphus/evidence/task-6-unit-tests.txt

  Scenario: Full test suite remains green
    Tool: Bash
    Preconditions: All previous tasks completed
    Steps:
      1. Run `pnpm test -- --run`
      2. Verify no regressions
    Expected Result: All tests pass (same count as before + new tests)
    Failure Indicators: Any previously-passing test now fails
    Evidence: .sisyphus/evidence/task-6-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(github): add tests for shared installations and disconnect`
  - Files: `src/gateway/routes/__tests__/admin-github.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. E2E verification — Multi-tenant GitHub connection flow

  **What to do**:
  - Prerequisites check: verify gateway, Inngest, and database are running
  - Test the full multi-tenant flow end-to-end:
    1. **Verify DozalDevs has GitHub connected**: check `tenant_integrations` and `tenant_secrets` for DozalDevs tenant
    2. **Disconnect VLRE if connected**: call `DELETE /admin/tenants/00000000-0000-0000-0000-000000000003/integrations/github`
    3. **List available installations for VLRE**: call `GET /admin/tenants/00000000-0000-0000-0000-000000000003/github/available-installations` — verify it returns at least 1 installation (Victor's personal account which DozalDevs is connected to)
    4. **Link the installation for VLRE**: call `POST /admin/tenants/00000000-0000-0000-0000-000000000003/github/link-installation` with the installation_id from step 3
    5. **Verify both tenants now share the installation**: query `tenant_integrations WHERE provider='github' AND deleted_at IS NULL` — should return 2 rows with the same `external_id`
    6. **Verify both tenants can fetch repos**: call `GET /admin/tenants/:tenantId/github/repos` for BOTH tenants — both should return the same repos
    7. **Test disconnect only affects one tenant**: call `DELETE /admin/tenants/00000000-0000-0000-0000-000000000003/integrations/github` — verify VLRE is disconnected but DozalDevs is still connected
    8. **Dashboard UI verification**: Open the integrations page for VLRE in browser, verify the "Link existing" flow is visible when not connected
  - Record all task IDs, HTTP responses, and DB queries in evidence files

  **Must NOT do**:
  - Do NOT test webhook cleanup (that's unit-tested in Task 2)
  - Do NOT test with GitHub API mocks — this is a real E2E test against the live GitHub API

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step E2E verification requiring curl, psql, and Playwright — needs methodical execution and evidence collection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — must wait for all implementation)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 5, 6

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — E2E test methodology and evidence collection pattern

  **External References**:
  - DozalDevs tenant ID: `00000000-0000-0000-0000-000000000002`
  - VLRE tenant ID: `00000000-0000-0000-0000-000000000003`
  - Dashboard integrations URL: `http://localhost:7700/dashboard/integrations?tenant=<tenantId>`

  **Acceptance Criteria**:
  - [ ] Both tenants can connect to the same GitHub account
  - [ ] Both tenants can fetch repos via the existing repos endpoint
  - [ ] Disconnect only removes the requesting tenant's connection
  - [ ] Dashboard shows the correct state for each tenant
  - [ ] All evidence files saved

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full multi-tenant shared installation E2E
    Tool: Bash (curl + psql) + Playwright
    Preconditions: Gateway running at localhost:7700, both tenants exist, DozalDevs has GitHub connected
    Steps:
      1-8 as described in "What to do" above
    Expected Result: Both tenants share installation, disconnect isolates correctly, dashboard reflects state
    Failure Indicators: API 500 errors, mismatched installation_ids, disconnect affecting wrong tenant
    Evidence: .sisyphus/evidence/task-7-e2e-full-flow.txt

  Scenario: Dashboard integrations page loads correctly for both tenants
    Tool: Playwright
    Preconditions: After E2E flow above — DozalDevs connected, VLRE disconnected (or re-connected)
    Steps:
      1. Navigate to http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000002
      2. Verify GitHub shows "✓ Connected" with Disconnect button
      3. Navigate to http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003
      4. Verify GitHub shows correct state (Connected or Connect with link-existing)
    Expected Result: Both pages load without errors, showing correct connection state
    Failure Indicators: Page errors, wrong state displayed
    Evidence: .sisyphus/evidence/task-7-dashboard-both-tenants.png
  ```

  **Commit**: NO (verification only — no code changes)

- [x] 8. Update documentation

  **What to do**:
  - Update `docs/guides/2026-06-02-1727-github-integration.md`:
    1. Add a new section "Multi-Tenant Shared Installation" explaining:
       - How multiple tenants share the same GitHub App installation
       - The "Link existing" flow via the dashboard
       - The disconnect behavior (only affects requesting tenant)
       - API endpoints: `GET /admin/tenants/:tenantId/github/available-installations`, `POST /admin/tenants/:tenantId/github/link-installation`, `DELETE /admin/tenants/:tenantId/integrations/github`
    2. Add curl examples for each new endpoint
  - Update `AGENTS.md`:
    1. Add the new admin API endpoints to the Admin API table:
       - `GET /admin/tenants/:tenantId/github/available-installations` — list GitHub App installations linkable to this tenant
       - `POST /admin/tenants/:tenantId/github/link-installation` — link an existing GitHub App installation to this tenant
       - `DELETE /admin/tenants/:tenantId/integrations/github` — disconnect GitHub from this tenant (soft-delete)
    2. Update the Engineer Employee section or GitHub section if any behavioral notes about shared installations are relevant
  - Update `README.md`:
    1. Add the 3 new admin API endpoints to the admin API table

  **Must NOT do**:
  - Do NOT create new documentation files — update existing ones
  - Do NOT include AI/agent references in documentation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation-only changes to existing files — adding sections and table rows
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7, though depends on implementation being complete)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `docs/guides/2026-06-02-1727-github-integration.md` — Existing GitHub integration guide — add multi-tenant section
  - `AGENTS.md` — Admin API section (search for `## Admin API`) — add new endpoints to the table
  - `README.md` — Admin API table — add new endpoints

  **Acceptance Criteria**:
  - [ ] GitHub integration guide has multi-tenant section with curl examples
  - [ ] AGENTS.md has all 3 new endpoints in the Admin API table
  - [ ] README.md has all 3 new endpoints in the admin API table
  - [ ] No broken markdown formatting

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Documentation is accurate and complete
    Tool: Bash
    Preconditions: None
    Steps:
      1. Read docs/guides/2026-06-02-1727-github-integration.md — verify multi-tenant section exists
      2. Read AGENTS.md — verify 3 new endpoints in Admin API table
      3. Read README.md — verify 3 new endpoints in admin API table
      4. Verify curl examples in the guide match the actual endpoint paths and response shapes
    Expected Result: All 3 files updated with accurate information
    Failure Indicators: Missing endpoints, wrong paths, broken markdown
    Evidence: .sisyphus/evidence/task-8-docs-review.txt
  ```

  **Commit**: YES
  - Message: `docs(github): document multi-tenant shared installation support`
  - Files: `docs/guides/2026-06-02-1727-github-integration.md`, `AGENTS.md`, `README.md`

- [x] 9. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "📋 github-multi-tenant-install plan complete — all tasks done. Come back to review results."`

  **Must NOT do**:
  - Do NOT send the notification until ALL other tasks (including F1-F4) are complete and approved

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After Final Wave
  - **Blocks**: None
  - **Blocked By**: F1-F4

  **References**:
  - `scripts/telegram-notify.ts` — Notification script

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Telegram notification delivered
    Tool: Bash
    Preconditions: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID set in .env
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "📋 github-multi-tenant-install plan complete — all tasks done. Come back to review results."`
      2. Check exit code is 0
    Expected Result: Script exits 0, message appears in Telegram
    Failure Indicators: Non-zero exit code, missing env vars
    Evidence: .sisyphus/evidence/task-9-telegram.txt
  ```

  **Commit**: NO (notification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed `.ts` files for: `as any`, `@ts-ignore`, empty catches, console.log in prod. Check AI slop.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute ALL QA scenarios from every task. Test: available-installations endpoint, disconnect endpoint, webhook cleanup with shared installations, dashboard UI flow.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify all changes are within scope. No `github-token-manager.ts` changes. No `@@unique([provider, external_id])` constraint added. No hard-deletes. No GitHub API uninstall calls from disconnect.
      Output: `Files Changed [N] | Scope [CLEAN/VIOLATION] | VERDICT`

---

## Commit Strategy

- **1**: `fix(github): support shared installations across tenants` — `tenant-integration-repository.ts`, `github.ts`
- **2**: `feat(github): add available-installations and disconnect endpoints` — `github-oauth.ts` or new route file, admin route
- **3**: `feat(dashboard): add disconnect button and link-existing flow` — `IntegrationsPage.tsx`
- **4**: `test(github): add tests for shared installations and disconnect` — test files
- **5**: `docs(github): document multi-tenant shared installation support` — docs, AGENTS.md

---

## Success Criteria

### Verification Commands

```bash
# Tenant B has installation_id after linking existing installation
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT key FROM tenant_secrets WHERE tenant_id = '<TENANT_B>' AND key = 'github_installation_id';"
# Expected: 1 row

# Both tenants cleaned up after installation.deleted
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT tenant_id, deleted_at FROM tenant_integrations WHERE provider = 'github' AND external_id = '<SHARED_ID>';"
# Expected: all rows have deleted_at IS NOT NULL

# Disconnect only affects requesting tenant
curl -s -X DELETE "http://localhost:7700/admin/tenants/<TENANT_A>/integrations/github" -H "X-Admin-Key: $ADMIN_API_KEY"
# Expected: 200 OK. Tenant B's integration row unaffected.

# All tests pass
pnpm test -- --run
# Expected: 0 failures
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Build succeeds
