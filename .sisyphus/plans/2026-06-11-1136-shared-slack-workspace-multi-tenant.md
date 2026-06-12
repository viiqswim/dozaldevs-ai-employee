# Shared Slack Workspace — Multi-Tenant Employee Routing

## TL;DR

> **Quick Summary**: Allow multiple tenants to connect the SAME Slack workspace, and route inbound Slack events (@mentions) to the correct employee across ALL tenants on that workspace using channel-based + LLM disambiguation. Plus a one-time, additive production data repair to unblock tenant `a17cdcca-1911-4138-b6dc-48b6e6393702`.
>
> **Deliverables**:
>
> - Removal of the OAuth 409 conflict check (`slack-oauth.ts`) so a workspace can attach to N tenants
> - Cross-tenant `app_mention` routing (gather employees across all tenants on the workspace, channel-match + LLM route, and on ambiguity ask the user to pick via a disambiguation card — never silently drop)
> - A cross-tenant channel→employee resolver that NEVER uses the "oldest archetype" fallback (data-leak guard)
> - Split `deleteInstallation` semantics (single-tenant dashboard disconnect vs workspace-wide Slack revoke)
> - `fetchInstallation` robustness (iterate to a tenant with a live token, deterministic order)
> - Full TDD test coverage incl. mandatory negative/decline paths
> - Production additive data repair (backup → insert second tenant row → live verify)
> - Documentation updates
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Verify-spikes → cross-tenant resolver → app_mention routing → E2E → prod repair

---

## Context

### Original Request

A teammate testing production for the first time hit, while connecting Slack:

```
{ "error": "CONFLICT", "message": "Slack workspace already attached to a different tenant" }
```

for tenant `a17cdcca-1911-4138-b6dc-48b6e6393702`. Desired end state: every tenant can connect to Slack, even the same workspace.

### Interview Summary

**Key Discussions**:

- Direction: **Option A — workspace → all employees routing** (user's refinement: "find all employees on this workspace, regardless of tenant"). Option C (per-tenant Slack apps / multiple Socket Mode connections) is OUT.
- Channel collision tiebreaker: gather ALL candidate employees across all tenants on the channel/workspace and let the existing `routeToEmployee()` LLM pick. If the LLM is NOT confident (or no clear channel owner), DO NOT decline — instead post a Slack disambiguation card offering the most likely candidate employees as buttons and let the user pick which one to run. Only if there are genuinely ZERO candidate employees anywhere on the workspace do we post a "no employees available" message.
- Test strategy: **TDD** (Vitest; affected files already well-tested).
- Scope: code change + **production data repair** to unblock the teammate now.

**Research Findings** (verified via code exploration):

- Error source: `src/gateway/routes/slack-oauth.ts:119-123` — app-level 409 check (NOT a DB constraint); currently UNTESTED.
- DB: `tenant_integrations` has `@@unique([tenant_id, provider])` ONLY — NO unique on `(provider, external_id)`. Multiple tenants CAN already share a `team_id`. **No migration needed.**
- `findManyByExternalId` already exists and is used for GitHub multi-tenant installs (`src/gateway/routes/github.ts:70-101`) — the fan-out template.
- Bot token is **workspace-scoped** (one Slack app → same `xoxb` token for all tenants). Bolt `authorize` (`server.ts:129`) needs NO change.
- Approval-card buttons (approve/reject/edit) resolve via `task_id` → `tasks.tenant_id`. ALREADY tenant-safe. Out of scope.
- Thread replies resolve via `taskId` → `tasks.tenant_id`. ALREADY tenant-safe. Out of scope.

### Metis Review

**Identified Gaps** (addressed in this plan):

- 🔴 The "oldest archetype for tenant" fallback in `resolveArchetypeFromChannel` becomes a **silent cross-tenant data-leak** if used across tenants → cross-tenant variant MUST use explicit channel match only; decline otherwise.
- 🔴 `deleteInstallation` fan-out must NOT blindly mirror GitHub: dashboard single-tenant disconnect ≠ Slack workspace-wide revoke. Verify the caller; split behavior.
- Employees with no `notification_channel` → define explicit contract (NOT a channel-routing candidate; decline).
- `fetchInstallation` must iterate deterministically to a tenant with a live token.
- Ambiguity paths (no clear channel owner, low LLM confidence) MUST ask the user to pick via a disambiguation card — NOT decline. Only a workspace with zero employees gets a "no employees available" message. These are release-blockers.
- Prod repair: backup first; additive only; NEVER touch the incumbent tenant row; deploy code before repairing data; verify live (not code-only).

---

## Work Objectives

### Core Objective

Permit N tenants to attach one Slack workspace and route each inbound @mention to the correct employee across all those tenants — safely, asking the user to pick when ambiguous — and unblock the existing production tenant.

### Concrete Deliverables

- `slack-oauth.ts`: 409 conflict check removed; OAuth allows additional tenants on an attached workspace.
- New cross-tenant resolver (in `interaction-classifier.ts`) returning candidates WITH their `tenant_id`, explicit channel match only.
- `event-handlers.ts` `app_mention`: cross-tenant candidate gathering + routing.
- `installation-store.ts`: `fetchInstallation` token robustness; `deleteInstallation` split semantics.
- `routeToEmployee` candidate pool widened across tenants.
- TDD tests incl. negative paths.
- Production additive data repair (script or documented psql steps) + backup.
- Docs updated.

### Definition of Done

- [ ] Two tenants can OAuth the same workspace (no 409); both rows present.
- [ ] @mention routes to the correct employee/tenant; ambiguous cases show a pick-an-employee card; zero-employee workspaces show a clear message.
- [ ] All new + existing Slack tests pass (`pnpm test:unit`, `pnpm test:integration`).
- [ ] Live @mention → Confirm → Done E2E passes with single-gateway pre-flight.
- [ ] Production tenant `a17cdcca-…` connected and verified live.

### Must Have

- Cross-tenant routing with explicit-channel-match-only (no cross-tenant fallback).
- Ask-on-ambiguity: low LLM confidence → disambiguation card, never a silent drop.
- Additive-only prod repair with prior backup.

### Must NOT Have (Guardrails)

- NO DB migration; NO unique constraint on `(provider, external_id)`.
- NO change to the Bolt `authorize` callback (`server.ts:129`) beyond nothing (workspace-scoped token is load-bearing).
- NO change to approval-card handlers, thread-reply resolution, or any `task_id → tenant_id` path.
- NO hard deletes — soft-delete (`deleted_at`) only; fan-out delete is per-row soft delete.
- `deleteInstallation` MUST NOT wipe tokens of tenants that did not disconnect (gate behind verified Slack semantics).
- The cross-tenant resolver MUST NOT use the "oldest archetype for tenant" fallback.
- NO `res.status().json()` inline — use `sendError`/`sendSuccess`.
- Prod repair MUST NOT UPDATE/DELETE the incumbent tenant's `tenant_integrations` row.
- NO prod write before a prod DB backup (port 5432 session pooler only).
- Option C (per-tenant Slack apps, multiple Socket Mode connections) is OUT.
- NO channel-mapping admin UI / new mapping table (out of scope).
- NO LLM router prompt redesign — only widen candidate pool.
- NO new `app_uninstalled`/`tokens_revoked` handler unless it already exists (separate feature).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** for unit/integration acceptance. The single LIVE Slack E2E is agent-driven via Playwright/CDP per the e2e-testing skill.

### Test Decision

- **Infrastructure exists**: YES (Vitest unit + integration).
- **Automated tests**: TDD (RED → GREEN → REFACTOR). Negative/decline tests written first.
- **Framework**: Vitest (`pnpm test:unit`, `pnpm test:integration`).

### QA Policy

Every task includes agent-executed QA scenarios. Evidence → `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Routing/handlers/repo**: Bash (`pnpm test ...`) + DB assertions via `psql`.
- **OAuth callback**: Bash (vitest) + integration route test.
- **Live Slack**: Playwright/CDP per `e2e-testing` skill; DB verify via `task_status_log`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — verify-spikes + foundation):
├── Task 1: VERIFY deleteInstallation caller/trigger semantics (spike, read-only)
├── Task 2: VERIFY resolveArchetypeFromChannel exact fallback code (spike, read-only)
├── Task 3: VERIFY repair-row token need + encryption parity (spike, read-only)
├── Task 4: Add findManyByExternalId slack coverage + repo confirm (TDD)
└── Task 5: Remove OAuth 409 conflict check + NEW callback test (TDD)

Wave 2 (After Wave 1 — core resolver + store, MAX PARALLEL):
├── Task 6: Cross-tenant channel→employee resolver (no fallback) (TDD)  [depends 2]
├── Task 7: fetchInstallation token robustness (deterministic) (TDD)    [depends 1,3]
└── Task 8: deleteInstallation split semantics (TDD)                    [depends 1]

Wave 3 (After Wave 2 — wire routing):
├── Task 9: app_mention cross-tenant routing + widen routeToEmployee pool (TDD) [depends 6]
└── Task 10: Documentation updates                                       [depends 5,6,8,9]

Wave 4 (After ALL code — verification + prod):
├── Task 11: Single-gateway pre-flight + live @mention E2E (ambiguity-pick + happy) [depends 9]
├── Task 12: Production backup + additive data repair + live verify        [depends 11]
└── Task 13: Notify completion (Telegram)                                  [depends 12]

Wave FINAL (4 parallel reviews → user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T2 → T6 → T9 → T11 → T12
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

- **1 (verify delete)**: deps none → blocks 7, 8
- **2 (verify fallback)**: deps none → blocks 6
- **3 (verify token)**: deps none → blocks 7, 12
- **4 (findMany test)**: deps none → blocks 9
- **5 (remove 409)**: deps none → blocks 10, 12
- **6 (resolver)**: deps 2 → blocks 9
- **7 (fetchInstallation)**: deps 1,3 → blocks 11
- **8 (deleteInstallation)**: deps 1 → blocks 10
- **9 (app_mention)**: deps 4,6 → blocks 10, 11
- **10 (docs)**: deps 5,6,8,9 → blocks none
- **11 (E2E)**: deps 7,9 → blocks 12
- **12 (prod repair)**: deps 3,5,11 → blocks 13
- **13 (notify)**: deps 12 → blocks none

### Agent Dispatch Summary

- **Wave 1**: T1-T3 → `deep` (spikes), T4 → `quick`, T5 → `unspecified-high`
- **Wave 2**: T6 → `deep`, T7 → `unspecified-high`, T8 → `deep`
- **Wave 3**: T9 → `deep`, T10 → `writing`
- **Wave 4**: T11 → `unspecified-high` (+`e2e-testing`,`dev-browser` skills), T12 → `deep` (+`production-ops` skill), T13 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. VERIFY `deleteInstallation` caller/trigger semantics (read-only spike)

  **What to do**:
  - Trace EVERY caller of `installationStore.deleteInstallation` and the Slack events that trigger it (search `deleteInstallation`, `app_uninstalled`, `tokens_revoked` in `src/gateway/`).
  - Determine: is it fired by (a) a per-tenant dashboard "disconnect" action, (b) a workspace-wide Slack revoke event, or (c) both/neither?
  - **KNOWN (verified 2026-06-12 during plan re-validation)**: A per-tenant dashboard disconnect route exists at `src/gateway/routes/admin-integrations.ts:22-50` — `DELETE /admin/tenants/:tenantId/integrations/slack` (OWNER-gated). It is ALREADY single-tenant safe: `integrationRepo.delete(tenantId, 'slack')` + `secretRepo.delete(tenantId, 'slack_bot_token')`, both scoped by `tenant_id`, soft-delete. It does NOT call `installationStore.deleteInstallation`. So the dashboard disconnect path is confirmed correct & additive-safe for shared workspaces. The spike's remaining job is ONLY to confirm what triggers `installationStore.deleteInstallation` (the Slack-event path) — likely no live trigger.
  - Record findings as a short note in the task's evidence file. This DECIDES Task 8's behavior (single-tenant soft-delete vs fan-out).

  **Must NOT do**: Modify any file. Read-only.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: requires careful caller tracing and semantic reasoning about Slack lifecycle.
  - **Skills**: [`slack-conventions`] — Slack event semantics. Omitted: others (no overlap).

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 7, 8 | Blocked By: None

  **References**:
  - `src/gateway/routes/admin-integrations.ts:22-50` — CONFIRMED per-tenant dashboard disconnect (single-tenant, scoped by tenant_id, soft-delete). Already safe.
  - `src/gateway/slack/installation-store.ts:50-57` — current `deleteInstallation` (single-tenant via `findByExternalId`); confirm its caller/trigger (Slack-event path).
  - `src/gateway/routes/github.ts:70-101` — GitHub fan-out (CONTRAST: per-installation, not workspace-wide).
  - WHY: Metis Assumption #4 — GitHub uninstall ≠ Slack revoke. Blind mirroring could wipe all tenants' tokens.

  **Acceptance Criteria**:
  - [ ] Evidence file states the exact caller(s) and trigger event(s) of `installationStore.deleteInstallation` AND confirms `admin-integrations.ts` disconnect stays single-tenant.
  - [ ] Explicit recommendation: Task 8 = single-tenant soft-delete, fan-out, or both (split).

  **QA Scenarios**:

  ```
  Scenario: Caller trace complete
    Tool: Bash (grep) + Read
    Steps:
      1. grep -rn "deleteInstallation" src/ ; grep -rn "app_uninstalled\|tokens_revoked" src/
      2. Read each hit; classify trigger as dashboard vs workspace-wide.
    Expected Result: A definitive list of callers + triggers documented.
    Evidence: .sisyphus/evidence/task-1-deleteinstallation-semantics.md
  ```

  **Commit**: NO (spike note only).

- [x] 2. VERIFY `resolveArchetypeFromChannel` exact fallback code (read-only spike)

  **What to do**:
  - Read `resolveArchetypeFromChannel` fully and document the EXACT fallback query (the "oldest active archetype for tenant" branch) and its return shape.
  - Confirm the function signature, how `tenant_id` is used in the PostgREST query, and what it returns on no match.
  - This DEFINES the contract Task 6 must preserve for single-tenant while DISABLING the fallback cross-tenant.

  **Must NOT do**: Modify any file. Read-only.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: precise contract extraction.
  - **Skills**: [] — none needed.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 6 | Blocked By: None

  **References**:
  - `src/lib/interaction-classifier.ts:92-132` — `resolveArchetypeFromChannel`.
  - WHY: Metis Assumption #1 (🔴) — the fallback becomes a cross-tenant data leak; Task 6 must build a fallback-free cross-tenant variant.

  **Acceptance Criteria**:
  - [ ] Evidence file quotes the exact fallback branch (file:line) and return shape.
  - [ ] Documents single-tenant behavior to preserve vs cross-tenant behavior to change.

  **QA Scenarios**:

  ```
  Scenario: Fallback contract documented
    Tool: Read
    Steps:
      1. Read interaction-classifier.ts:92-132.
      2. Quote the exact-match query, the fallback query, and the no-match return.
    Expected Result: Contract documented with line numbers.
    Evidence: .sisyphus/evidence/task-2-resolve-fallback-contract.md
  ```

  **Commit**: NO (spike note only).

- [x] 3. VERIFY repair-row token need + encryption parity (read-only spike)

  **What to do**:
  - Determine whether the second tenant's `tenant_integrations` row needs its OWN `slack_bot_token` in `tenant_secrets`, OR whether `fetchInstallation`'s any-tenant-token fallback (Task 7) makes a token unnecessary for the second tenant.
  - Read the AES-256-GCM tenant-secret encryption path (`src/lib/encryption.ts`, `TenantSecretRepository.set`) to document how a token would be encrypted under tenant `a17cdcca-…`'s context if needed.
  - This DEFINES the exact prod repair steps in Task 12.

  **Must NOT do**: Modify any file. No prod access. Read-only code analysis.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: security-sensitive reasoning about token storage.
  - **Skills**: [`security`] — encryption/tenant-secret pattern.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 7, 12 | Blocked By: None

  **References**:
  - `src/gateway/slack/installation-store.ts:24` — `fetchInstallation` token lookup by tenant.
  - `src/lib/encryption.ts`, `src/repositories/tenant-secret-repository.ts` — AES-256-GCM store.
  - WHY: Metis Repair #5 — repair insert may or may not need an encrypted token; intersects Task 7's any-tenant fallback.

  **Acceptance Criteria**:
  - [ ] Evidence file states: does the repair row need its own token? (YES/NO + rationale)
  - [ ] If YES, documents the exact encrypted-insert path; if NO, documents why Task 7 fallback covers it.

  **QA Scenarios**:

  ```
  Scenario: Token-need decision documented
    Tool: Read
    Steps:
      1. Read fetchInstallation + encryption + secret repo.
      2. Decide and document whether the second tenant needs its own token row.
    Expected Result: Binary decision with rationale; Task 12 steps unblocked.
    Evidence: .sisyphus/evidence/task-3-repair-token-need.md
  ```

  **Commit**: NO (spike note only).

- [x] 4. `findManyByExternalId` slack coverage (TDD)

  **What to do**:
  - RED: Add an integration test asserting `findManyByExternalId('slack', teamId)` returns BOTH rows when two tenants share a `team_id`, ordered by `created_at asc`, excluding soft-deleted rows.
  - GREEN: Confirm the existing method already satisfies this (it should — no code change expected). If a gap exists, fix minimally.
  - Confirm slack rows carry `team_id` in the `external_id` column (Metis Assumption #5).

  **Must NOT do**: Change the method signature; alter GitHub behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: small test addition against an existing method.
  - **Skills**: [`data-access-conventions`] — repository/PostgREST conventions.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 9 | Blocked By: None

  **References**:
  - `src/gateway/services/tenant-integration-repository.ts:27-32` — `findManyByExternalId`.
  - `tests/integration/gateway/services/tenant-integration-repository.test.ts:81-98` — existing `findByExternalId` test (pattern).
  - WHY: Task 9 depends on multi-row resolution working for slack.

  **Acceptance Criteria**:
  - [ ] New integration test for slack multi-row added.
  - [ ] `pnpm test:integration -- tenant-integration-repository` → PASS.

  **QA Scenarios**:

  ```
  Scenario: Two slack rows, same team_id, returned together
    Tool: Bash (vitest integration) + psql
    Preconditions: Seed two tenants, both with provider='slack', external_id='T_TEST', deleted_at NULL.
    Steps:
      1. pnpm test:integration -- tenant-integration-repository
      2. Assert result length === 2, ordered by created_at asc.
    Expected Result: PASS; 2 rows.
    Evidence: .sisyphus/evidence/task-4-findmany-slack.txt

  Scenario: Soft-deleted row excluded
    Tool: Bash (vitest)
    Steps:
      1. Soft-delete one row; assert findManyByExternalId returns 1.
    Expected Result: length === 1.
    Evidence: .sisyphus/evidence/task-4-findmany-softdelete.txt
  ```

  **Commit**: YES (groups with 5) — `test(slack): cover findManyByExternalId for shared workspace`.

- [x] 5. Remove OAuth 409 conflict check + NEW callback test (TDD)

  **What to do**:
  - RED: Add a NEW route test for `GET /slack/oauth_callback` asserting that when the workspace `team_id` is already attached to a DIFFERENT tenant, the callback now SUCCEEDS (200) and upserts the second tenant's integration — instead of returning 409.
  - GREEN: Remove the conflict check at `slack-oauth.ts:119-123`. Keep the `secretRepo.set` + `integrationRepo.upsert` (already keyed on `(tenant_id, provider)`).
  - Also remove the now-unreachable `DUPLICATE_TEAM` catch branch (lines 132-139) if it only served the conflict path; confirm before removing.
  - Use `sendError`/`sendSuccess` (no inline `res.status().json()`).

  **Must NOT do**: Touch google-oauth.ts or notion-oauth.ts conflict checks (separate providers, out of scope). Add any migration. Change the success HTML behavior.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: behavior change on an OAuth route with a new test; moderate care.
  - **Skills**: [`api-design`, `security`] — route response helpers + OAuth/token handling.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 10, 12 | Blocked By: None

  **References**:
  - `src/gateway/routes/slack-oauth.ts:119-123` — the 409 check to remove; `:132-139` — DUPLICATE_TEAM catch.
  - `src/gateway/routes/slack-oauth.ts:124-131` — upsert + success (keep).
  - `tests/unit/gateway/routes/slack-oauth-install.test.ts` — existing test file (currently only covers `/slack/install`; add callback coverage here or a sibling file).
  - WHY: Metis — the check is currently UNTESTED; this is the primary unblock for multi-tenant attach.

  **Acceptance Criteria**:
  - [ ] New callback test asserts 200 + second integration upserted when workspace already attached to another tenant.
  - [ ] `pnpm test:unit -- slack-oauth` → PASS.
  - [ ] No 409 path remains for the cross-tenant case; no inline `res.status().json()`.

  **QA Scenarios**:

  ```
  Scenario: Second tenant attaches same workspace — succeeds
    Tool: Bash (vitest)
    Preconditions: Mock token exchange returns team.id='T_SHARED'; existing integration for tenant A on 'T_SHARED'.
    Steps:
      1. Invoke callback as tenant B with valid signed state.
      2. Assert HTTP 200, secretRepo.set called for B, integrationRepo.upsert called for B.
    Expected Result: 200; no 409.
    Evidence: .sisyphus/evidence/task-5-oauth-second-tenant.txt

  Scenario: Same tenant re-connects (idempotent)
    Tool: Bash (vitest)
    Steps:
      1. Invoke callback as tenant A again on 'T_SHARED'.
    Expected Result: 200; upsert (no duplicate row); no 409.
    Evidence: .sisyphus/evidence/task-5-oauth-reconnect.txt
  ```

  **Commit**: YES (groups with 4) — `fix(slack): allow multiple tenants to attach one workspace`.

- [x] 6. Cross-tenant channel→employee resolver (NO fallback) (TDD)

  **What to do**:
  - RED: Write tests for a NEW cross-tenant resolver that accepts a `channelId` + an array of `tenantId`s (the tenants sharing the workspace) and returns candidate employees with their `tenant_id`, matching ONLY by explicit `notification_channel = channelId`. Tests must assert: (a) single explicit match returns one candidate; (b) two tenants matching the channel return TWO candidates; (c) NO channel match returns EMPTY (NOT the "oldest archetype" fallback); (d) employees with NULL `notification_channel` are never candidates.
  - GREEN: Implement the resolver in `interaction-classifier.ts` (e.g., `resolveEmployeesAcrossTenants(channelId, tenantIds)`), reusing the exact-match query from `resolveArchetypeFromChannel` but iterating/querying across the tenant set. **Do NOT call or replicate the fallback branch.**
  - Preserve the existing single-tenant `resolveArchetypeFromChannel` unchanged (other callers rely on it).

  **Must NOT do**: Use/port the "oldest archetype for tenant" fallback. Modify the existing single-tenant function's behavior. Add a mapping table.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: the core safety-critical routing primitive (data-leak guard).
  - **Skills**: [`data-access-conventions`] — PostgREST query conventions.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 | Blocks: 9 | Blocked By: 2

  **References**:
  - `src/lib/interaction-classifier.ts:92-132` — exact-match query to reuse; fallback to AVOID (confirmed by Task 2 spike).
  - `tests/unit/gateway/services/interaction-classifier.test.ts:150-216` — test patterns.
  - WHY: Metis Assumption #1 (🔴) — explicit-match-only prevents silent cross-tenant routing.

  **Acceptance Criteria**:
  - [ ] New resolver returns candidates WITH `tenant_id`; explicit channel match only.
  - [ ] Empty result when no explicit match (no fallback); NULL-channel employees excluded.
  - [ ] Existing single-tenant resolver behavior unchanged (its tests still pass).
  - [ ] `pnpm test:unit -- interaction-classifier` → PASS.

  **QA Scenarios**:

  ```
  Scenario: Two tenants both own the channel → two candidates
    Tool: Bash (vitest)
    Preconditions: Mock PostgREST: tenantA + tenantB each have active archetype with notification_channel='C_SHARED'.
    Steps:
      1. Call resolveEmployeesAcrossTenants('C_SHARED', [A,B]).
      2. Assert 2 candidates, each carrying its tenant_id.
    Expected Result: length 2.
    Evidence: .sisyphus/evidence/task-6-two-candidates.txt

  Scenario: No explicit channel match → EMPTY (no fallback) [NEGATIVE]
    Tool: Bash (vitest)
    Preconditions: Neither tenant has an archetype mapped to 'C_NONE'.
    Steps:
      1. Call resolveEmployeesAcrossTenants('C_NONE', [A,B]).
      2. Assert result is EMPTY — fallback must NOT fire.
    Expected Result: length 0.
    Evidence: .sisyphus/evidence/task-6-no-fallback.txt

  Scenario: Employee with NULL notification_channel excluded [NEGATIVE]
    Tool: Bash (vitest)
    Steps:
      1. tenantA archetype has notification_channel=NULL.
      2. Assert it is never returned as a candidate.
    Expected Result: excluded.
    Evidence: .sisyphus/evidence/task-6-null-channel.txt
  ```

  **Commit**: YES — `feat(slack): cross-tenant channel resolver without fallback`.

- [x] 7. `fetchInstallation` token robustness (deterministic) (TDD)

  **What to do**:
  - RED: Test that when the first tenant (by deterministic order, e.g. `created_at asc`) on a shared workspace has NO/soft-deleted `slack_bot_token`, `fetchInstallation` iterates to the next tenant that DOES have a live token and returns it. Test that with a single tenant behavior is unchanged.
  - GREEN: Update `fetchInstallation` to use `findManyByExternalId('slack', teamId)`, iterate in deterministic order, and return the first live token. Document that the slack bot token is workspace-scoped.
  - If Task 3 concluded the repair row needs no token, this is the mechanism that covers it.

  **Must NOT do**: Change the Bolt `authorize` callback (`server.ts`). Hard-delete anything. Change return shape of the Installation object beyond the token source.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: auth-path robustness; careful but bounded.
  - **Skills**: [`slack-conventions`, `security`] — installation store + token handling.

  **Parallelization**: Can Run In Parallel: YES | Wave 2 | Blocks: 11 | Blocked By: 1, 3

  **References**:
  - `src/gateway/slack/installation-store.ts:17-48` — current `fetchInstallation`.
  - `src/gateway/server.ts:125-138` — authorize callback `authorize: async ({ teamId }) => { ... fetchInstallation({ teamId }) ... }` (DO NOT CHANGE; context only). (Line shifted from 129 → 125 after recent server.ts edits; verified 2026-06-12.)
  - WHY: Metis Assumption #2 — any-tenant token works, but must iterate deterministically to a live one.

  **Acceptance Criteria**:
  - [ ] `fetchInstallation` returns a live token even if the first tenant lacks one.
  - [ ] Deterministic ordering documented and tested.
  - [ ] Single-tenant behavior unchanged; `pnpm test:unit -- installation-store` → PASS.

  **QA Scenarios**:

  ```
  Scenario: First tenant lacks token, second has it
    Tool: Bash (vitest)
    Preconditions: Mock findManyByExternalId → [A (no token), B (token)].
    Steps:
      1. Call fetchInstallation({teamId:'T_SHARED'}).
      2. Assert returned bot.token === B's token.
    Expected Result: B's token returned.
    Evidence: .sisyphus/evidence/task-7-token-iterate.txt

  Scenario: No tenant has a token → throws [NEGATIVE]
    Tool: Bash (vitest)
    Steps:
      1. Mock both tenants without tokens.
      2. Assert it throws "No bot token found for team".
    Expected Result: throws.
    Evidence: .sisyphus/evidence/task-7-no-token.txt
  ```

  **Commit**: YES — `fix(slack): fetchInstallation resolves a live token across tenants`.

- [x] 8. `deleteInstallation` split semantics (TDD)

  **What to do**:
  - **CONFIRMED (plan re-validation 2026-06-12)**: The per-tenant dashboard disconnect already lives at `src/gateway/routes/admin-integrations.ts:22-50` and is ALREADY single-tenant safe (scoped by tenant_id, soft-delete). Task 8's primary job is therefore: (1) ADD a regression test confirming `admin-integrations.ts` disconnect leaves OTHER tenants on a shared workspace intact; (2) handle the `installationStore.deleteInstallation` Slack-event path per Task 1's finding.
  - Based on Task 1's findings, implement the CORRECT semantics for `installationStore.deleteInstallation`:
    - If it is reachable via a workspace-wide Slack revoke (`app_uninstalled`/`tokens_revoked`) → fan-out soft-delete across ALL tenants (mirror GitHub `github.ts:70-101`).
    - If Task 1 finds `installationStore.deleteInstallation` has NO live trigger, leave it as-is (or add a guarding comment) and document why fan-out is N/A; do NOT add a new Slack event handler.
  - RED first: write tests for whichever path(s) Task 1 confirmed. Continue-on-error per tenant for fan-out; soft-delete only.

  **Must NOT do**: Wipe tokens of tenants that did not disconnect in the single-tenant (`admin-integrations.ts`) path. Hard-delete. Add a new Slack event handler if none exists (note it as out of scope instead). Change the OWNER role gate on the disconnect route.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: opposite-behavior risk; correctness-critical.
  - **Skills**: [`slack-conventions`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES | Wave 2 | Blocks: 10 | Blocked By: 1

  **References**:
  - `src/gateway/routes/admin-integrations.ts:22-50` — CONFIRMED per-tenant dashboard disconnect (already single-tenant safe). Add a shared-workspace regression test here.
  - `src/gateway/slack/installation-store.ts:50-57` — `deleteInstallation` Slack-event path; handle per Task 1.
  - `src/gateway/routes/github.ts:70-101` — fan-out template (apply ONLY to a confirmed workspace-revoke path).
  - WHY: Metis Assumption #4 (🔴) — blind fan-out would wipe all tenants on a single disconnect.

  **Acceptance Criteria**:
  - [ ] Behavior matches Task 1's confirmed trigger(s); soft-delete only; per-tenant continue-on-error for any fan-out.
  - [ ] `admin-integrations.ts` single-tenant disconnect leaves OTHER tenants' tokens intact on a shared workspace (NEW regression test).
  - [ ] `pnpm test:unit -- installation-store` and the admin-integrations route test → PASS (including the previously-skipped delete test, now un-skipped & rewritten if applicable).

  **QA Scenarios**:

  ```
  Scenario: Single-tenant dashboard disconnect preserves others [NEGATIVE-SAFETY]
    Tool: Bash (vitest, admin-integrations route test)
    Preconditions: Two tenants A,B both attached to 'T_SHARED'.
    Steps:
      1. DELETE /admin/tenants/{A}/integrations/slack.
      2. Assert A's integration + slack_bot_token soft-deleted; B's integration + token intact.
    Expected Result: B still resolvable via findManyByExternalId.
    Evidence: .sisyphus/evidence/task-8-single-disconnect.txt

  Scenario: installationStore.deleteInstallation Slack-revoke path (if applicable)
    Tool: Bash (vitest)
    Steps:
      1. Per Task 1: if a workspace-wide revoke trigger exists, exercise it; else assert N/A documented.
      2. If applicable: assert all tenants soft-deleted; continue-on-error works.
    Expected Result: all deleted_at set (or documented N/A).
    Evidence: .sisyphus/evidence/task-8-fanout-revoke.txt
  ```

  **Commit**: YES — `fix(slack): correct deleteInstallation semantics for shared workspace`.

- [x] 9. `app_mention` cross-tenant routing + widen `routeToEmployee` pool (TDD)

  **What to do**:
  - RED: Tests for the updated `app_mention` handler: (a) resolve ALL tenants on `mention.team` via `findManyByExternalId`; (b) gather candidate employees across those tenants via the Task 6 resolver; (c) if exactly one candidate → route to it (its `tenant_id` becomes the resolved tenant); (d) if multiple candidates → call `routeToEmployee()` with the FULL cross-tenant candidate list; if the LLM picks confidently → route to the winner; (e) if the LLM is NOT confident (multiple plausible) → DO NOT decline: post a Slack disambiguation card listing the most likely candidate employees as buttons so the user picks; no task is created until they pick; (f) if there are genuinely ZERO candidate employees on the whole workspace → post a brief "no employees available" message; (g) a tenant on the workspace with zero active employees is simply skipped (it just contributes no candidates).
  - GREEN: Update `event-handlers.ts` app_mention (`:171-178`) to use the new resolver + multi-candidate `routeToEmployee`. Widen the `routeToEmployee` call site in `slack-trigger-handler.ts` to pass the union candidate list (remove the dead single-element path). The resolved `tenant_id` must flow into the dispatched event so downstream `loadTenantEnv(tenantId)` and task creation use the WINNER's tenant.
  - GREEN (disambiguation card): when the LLM is not confident, build a Slack Block Kit card that lists the top candidate employees (each as a button carrying its archetype id + tenant id), following the existing trigger-confirmation card pattern. Add a button-click handler that, when the user picks an employee, dispatches the task to THAT employee's tenant — reuse the existing trigger-confirm dispatch path so input-collection and the lifecycle behave identically. Cap the card at a sensible number of buttons (e.g. top 3-5 by LLM ranking).
  - Ensure the resolved tenant's bot token is what posts the confirmation/disambiguation/reply.

  **Must NOT do**: Touch thread-reply resolution or approval-card handlers (already tenant-safe). Redesign the LLM prompt. Use any cross-tenant fallback. Change `authorize`. Silently drop an ambiguous mention (no "do nothing" — always either route, ask, or say no-employees-available).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: the integration heart of the feature; multi-file, correctness + safety critical.
  - **Skills**: [`slack-conventions`, `inngest`, `data-access-conventions`] — event handling, Inngest dispatch, DB access.

  **Parallelization**: Can Run In Parallel: NO (critical path) | Wave 3 | Blocks: 10, 11 | Blocked By: 4, 6

  **References**:
  - `src/gateway/slack/handlers/event-handlers.ts:171-185` — app_mention resolution + `resolveArchetypeFromChannel` call.
  - `src/inngest/slack-trigger-handler.ts:126-161` — `resolve-employee` + `route-employee` steps (single-element dead path to widen).
  - `src/inngest/slack-trigger-handler.ts:29-97` — `routeToEmployee` (already multi-candidate capable).
  - `tests/unit/gateway/slack/event-handlers.test.ts:279-320` — mock returns single tenant (update to ARRAY).
  - WHY: Metis AC2/AC3/AC4/AC5/AC12 — happy + collision + decline + empty-tenant paths.

  **Acceptance Criteria**:
  - [ ] Single-owner channel routes to correct employee/tenant.
  - [ ] Two-owner channel, confident LLM → picks; exactly one task; winner's `tenant_id` recorded.
  - [ ] Ambiguous (LLM not confident) → disambiguation card posted with candidate buttons; NO task until user picks; picking a button dispatches to that employee's tenant. [release-blocker]
  - [ ] Zero candidate employees on the whole workspace → brief "no employees available" message; no task.
  - [ ] Tenant with zero active employees contributes no candidates and never crashes routing.
  - [ ] `pnpm test:unit -- event-handlers slack-trigger-handler` → PASS.

  **QA Scenarios**:

  ```
  Scenario: Single-owner channel routes correctly
    Tool: Bash (vitest)
    Preconditions: team 'T_SHARED' → tenants [A,B]; only A has employee on channel 'C1'.
    Steps:
      1. Fire app_mention {team:'T_SHARED', channel:'C1'}.
      2. Assert dispatched event tenantId === A; one task path.
    Expected Result: routes to A.
    Evidence: .sisyphus/evidence/task-9-single-owner.txt

  Scenario: Two-owner channel → LLM picks one [COLLISION]
    Tool: Bash (vitest)
    Preconditions: both A and B have an employee on 'C2'; mock LLM picks B.
    Steps:
      1. Fire app_mention {team:'T_SHARED', channel:'C2'}.
      2. Assert exactly one dispatch; tenantId === B.
    Expected Result: one task; B.
    Evidence: .sisyphus/evidence/task-9-collision.txt

  Scenario: Ambiguous mention → disambiguation card (NOT decline) [release-blocker]
    Tool: Bash (vitest)
    Steps:
      1. Two+ candidates; mock LLM confidence < threshold.
      2. Assert a disambiguation card is posted with candidate-employee buttons; ZERO tasks created yet.
      3. Simulate a button click; assert task dispatched to that employee's tenant.
    Expected Result: card shown, then exactly one task on pick.
    Evidence: .sisyphus/evidence/task-9-disambiguation.txt

  Scenario: Zero employees anywhere on workspace → no-employees message [release-blocker]
    Tool: Bash (vitest)
    Steps:
      1. No tenant on the workspace has any active employee.
      2. Assert a brief "no employees available" message; zero tasks.
    Expected Result: zero tasks; informative message.
    Evidence: .sisyphus/evidence/task-9-lowconf.txt
  ```

  **Commit**: YES — `feat(slack): route mentions to correct employee across tenants on a shared workspace`.

- [x] 10. Documentation updates (durable, non-volatile)

  **What to do**:
  - Update `docs/guides/2026-05-14-0040-slack-tenant-integration.md`: replace the 1:1 framing with many:1 — a workspace can attach to multiple tenants; routing is by channel→employee across all tenants; bot token is workspace-scoped.
  - Update `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md` (the "routes by team_id to the right tenant" line) to "routes by team_id → all tenants on the workspace → channel/employee disambiguation".
  - Update AGENTS.md Slack sections + the `slack-conventions` skill if it asserts 1:1.
  - Do NOT edit `docs/snapshots/*` (immutable).
  - Follow Documentation Durability rules (no volatile counts/line numbers).

  **Must NOT do**: Edit snapshot docs. Introduce volatile facts (counts, line numbers).

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: documentation prose.
  - **Skills**: [`writing-guidelines`].

  **Parallelization**: Can Run In Parallel: YES | Wave 3 | Blocks: None | Blocked By: 5, 6, 8, 9

  **References**:
  - `docs/guides/2026-05-14-0040-slack-tenant-integration.md`, `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md:~234`, `AGENTS.md` Slack sections.
  - WHY: AGENTS.md Documentation Freshness — workspace↔tenant relationship changed.

  **Acceptance Criteria**:
  - [ ] Both guides + AGENTS.md describe many:1 routing accurately.
  - [ ] No snapshot files modified; no volatile facts introduced.

  **QA Scenarios**:

  ```
  Scenario: Docs reflect many:1
    Tool: Bash (grep) + Read
    Steps:
      1. grep for "already attached to a different tenant" / "routes by team_id to the right tenant" in docs/guides + AGENTS.md.
      2. Confirm updated to many:1 framing; snapshots untouched (git status).
    Expected Result: guides updated; snapshots clean.
    Evidence: .sisyphus/evidence/task-10-docs.txt
  ```

  **Commit**: YES — `docs(slack): document multi-tenant shared workspace routing`.

- [x] 11. Single-gateway pre-flight + LIVE @mention E2E (ambiguity-pick + happy)

  **What to do**:
  - MANDATORY pre-flight: `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` MUST return `1`. If more, kill zombies before proceeding (a stale socket silently absorbs ~50% of events).
  - Confirm services live: `curl localhost:7700/health`, `curl localhost:8288/health`, `tail /tmp/ai-dev.log | grep "Socket Mode"`.
  - Set up a LOCAL shared-workspace scenario: two tenants attached to the same dev workspace `team_id` (use the dev OAuth flow per the slack-tenant-integration guide for both tenants).
  - Run the happy path: real @mention in a channel owned by exactly one tenant's employee → click Confirm on the card → verify `tasks.status = Done` in DB; record task ID + full `task_status_log` trace.
  - Run an ambiguity path: @mention where two tenants both have a plausible employee → verify a disambiguation card appears with candidate buttons, click one, verify the task dispatches to the chosen employee's tenant and reaches Done.
  - Use Playwright/CDP per the `e2e-testing` and `dev-browser` skills.

  **Must NOT do**: Claim "verified from code" — live path is mandatory. Run against production. Skip the pre-flight.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: live multi-system E2E.
  - **Skills**: [`e2e-testing`, `dev-browser`, `long-running-commands`] — Slack CDP automation, tmux for services.

  **Parallelization**: Can Run In Parallel: NO | Wave 4 | Blocks: 12 | Blocked By: 7, 9

  **References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Scenario A (approve happy path).
  - AGENTS.md "Plan E2E Validation" — single-gateway pre-flight + live @mention→Confirm→Done is mandatory for Slack trigger workflow changes.
  - WHY: This change modifies the app_mention path — code/unit tests are explicitly insufficient.

  **Acceptance Criteria**:
  - [ ] Pre-flight returns exactly 1 gateway.
  - [ ] Happy path: task reaches `Done`; task ID + status trace recorded.
  - [ ] Ambiguity path: disambiguation card observed; clicking a candidate dispatches one task to the chosen employee's tenant; reaches Done. [release-blocker]

  **QA Scenarios**:

  ```
  Scenario: Single-gateway pre-flight
    Tool: Bash
    Steps:
      1. pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l
    Expected Result: 1
    Evidence: .sisyphus/evidence/task-11-preflight.txt

  Scenario: Live @mention → Confirm → Done (shared workspace, single owner)
    Tool: Playwright/CDP + psql
    Steps:
      1. @mention bot in tenant-A-owned channel.
      2. Click Confirm on the card.
      3. Poll tasks for status; assert Done; capture task_status_log.
    Expected Result: Done; tenant_id === A.
    Evidence: .sisyphus/evidence/task-11-live-happy.png + .txt

  Scenario: Live ambiguous @mention → disambiguation card → pick → Done
    Tool: Playwright/CDP + psql
    Steps:
      1. @mention bot where two tenants both have a plausible employee.
      2. Assert a disambiguation card with candidate buttons appears; no task yet.
      3. Click a candidate; assert one task dispatched to that employee's tenant; reaches Done.
    Expected Result: card → pick → one task Done.
    Evidence: .sisyphus/evidence/task-11-live-disambiguation.png + .txt
  ```

  **Commit**: NO (verification only). Kill all `ai-*` tmux sessions on completion.

- [ ] 12. Production backup + ADDITIVE data repair + live verify

  **What to do**:
  - PRECONDITION: code from Tasks 5-9 must be DEPLOYED to production first (deploy-code → verify → repair sequence). Confirm the prod deploy is `live` before touching data.
  - Load the `production-ops` skill. Connect to the CLOUD DB via the session pooler on **port 5432** (NOT 6543).
  - BACKUP FIRST (no exceptions): full `pg_dump` + a `tenant_integrations` table dump to `database-backups/<timestamp>/` per AGENTS.md.
  - Inspect current state: which tenant currently owns the workspace `team_id` that tenant `a17cdcca-1911-4138-b6dc-48b6e6393702` tried to attach. Document it.
  - ADDITIVE repair: insert/upsert the `tenant_integrations` row for tenant `a17cdcca-…` (provider `slack`, `external_id` = that workspace's `team_id`). Per Task 3's decision, add a `tenant_secrets` `slack_bot_token` for that tenant ONLY IF required (otherwise rely on Task 7's any-tenant token resolution). The cleanest path: have the teammate simply re-run the OAuth flow now that the 409 is removed — prefer this over manual SQL if feasible; document which path was used.
  - Verify LIVE: confirm via `psql` (zero-rows-is-failure) that both integration rows exist, then perform a live @mention in a channel owned by tenant `a17cdcca-…`'s employee and confirm correct routing.

  **Must NOT do**: UPDATE or DELETE the incumbent tenant's row. Touch prod before backup. Use port 6543. Repair before code is deployed. Verify by PostgREST/code only.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: production data operation; high blast radius.
  - **Skills**: [`production-ops`, `security`, `feature-verification`] — prod DB ops, encryption, live verification.

  **Parallelization**: Can Run In Parallel: NO | Wave 4 | Blocks: 13 | Blocked By: 3, 5, 11

  **References**:
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md` — prod DB access (port 5432).
  - AGENTS.md "Database Backup (MANDATORY before any reseed or wipe)" — backup commands.
  - `docs/guides/2026-05-14-0040-slack-tenant-integration.md` — re-connect via OAuth flow.
  - WHY: Metis Repair #1-#6 — additive only, backup first, deploy-before-repair, live verify.

  **Acceptance Criteria**:
  - [ ] Prod backup artifact exists at `database-backups/<ts>/` before any write.
  - [ ] Incumbent tenant's row UNCHANGED (verified diff).
  - [ ] Tenant `a17cdcca-…` integration row present (psql count ≥ 1 for that team_id+tenant).
  - [ ] Live @mention routes to tenant `a17cdcca-…`'s employee correctly.

  **QA Scenarios**:

  ```
  Scenario: Backup taken before write
    Tool: Bash (production-ops)
    Steps:
      1. pg_dump tenant_integrations → database-backups/<ts>/tenant_integrations.sql
    Expected Result: file exists, non-empty.
    Evidence: .sisyphus/evidence/task-12-backup.txt

  Scenario: Additive repair — both rows exist, incumbent untouched
    Tool: psql (port 5432)
    Steps:
      1. SELECT tenant_id, external_id FROM tenant_integrations WHERE external_id='<team_id>' AND deleted_at IS NULL;
      2. Assert incumbent row identical to pre-repair; a17cdcca row present.
    Expected Result: 2 rows; incumbent unchanged.
    Evidence: .sisyphus/evidence/task-12-rows.txt

  Scenario: Live routing for repaired tenant [NEGATIVE-SAFETY: incumbent still works]
    Tool: Playwright/CDP + psql
    Steps:
      1. @mention in a17cdcca-owned channel → assert routes to a17cdcca.
      2. @mention in incumbent-owned channel → assert still routes to incumbent.
    Expected Result: both route correctly.
    Evidence: .sisyphus/evidence/task-12-live-verify.txt
  ```

  **Commit**: NO (operational). Backup artifacts are gitignored.

- [ ] 13. Notify completion (Telegram)

  **What to do**: Send Telegram: plan complete, all tasks done, come back to review.
  - `tsx scripts/telegram-notify.ts "✅ Shared Slack workspace multi-tenant routing complete — tenant a17cdcca unblocked in prod. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: single command.
  - **Skills**: [].

  **Parallelization**: Can Run In Parallel: NO | Wave 4 | Blocks: None | Blocked By: 12

  **Acceptance Criteria**:
  - [ ] Telegram message sent (script exit 0).

  **QA Scenarios**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "...complete..."
    Expected Result: exit 0.
    Evidence: .sisyphus/evidence/task-13-notify.txt
  ```

  **Commit**: NO.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1-F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. Verify each "Must Have" exists (read file, run test, psql). For each "Must NOT Have": grep for forbidden patterns (new migration on tenant_integrations; changes to server.ts authorize; hard deletes; cross-tenant "oldest archetype" fallback; res.status().json in slack-oauth; modifications to approval/thread-reply paths) — reject with file:line if found. Confirm evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + `pnpm lint` + `pnpm test:unit` + `pnpm test:integration`. Review changed files for `as any`, empty catches, console.log, dead code, generic names. Confirm sendError/sendSuccess usage in slack-oauth.
      Output: `Build | Lint | Tests | Files | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `e2e-testing`, `dev-browser` skills)
      From a clean gateway: single-gateway pre-flight, then execute every QA scenario incl. the ambiguity cases (no clear owner, low confidence → disambiguation card + user pick) and zero-employee workspace. Evidence → `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N] | Negatives [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task, read "What to do" vs the actual diff. Confirm 1:1 (nothing missing, nothing beyond spec). Confirm approval/thread-reply paths untouched, no migration added, authorize untouched. Flag contamination.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | VERDICT`

---

## Commit Strategy

- Group 1 (Wave 1-3 code): conventional commits per task (`fix(slack): ...`, `feat(slack): ...`, `test(slack): ...`, `docs(slack): ...`). Pre-commit: `pnpm test:unit && pnpm lint`.
- Prod repair (T12): NOT a code commit — operational steps + backup artifact (gitignored).

## Success Criteria

### Verification Commands

```bash
pnpm test:unit            # Expected: all pass
pnpm test:integration     # Expected: all pass
pgrep -f "src/gateway/server.ts" | wc -l   # Expected: 1
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Live @mention → Confirm → Done E2E passed
- [ ] Production tenant a17cdcca-… connected + verified
