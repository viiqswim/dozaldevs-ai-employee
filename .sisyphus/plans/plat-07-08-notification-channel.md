# PLAT-07 + PLAT-08: Notification Channel & Channel Config Cleanup

## TL;DR

> **Quick Summary**: Add a `notification_channel` config field (required per-tenant, optional per-archetype override) as the single source of truth for where employees post approval cards, status updates, and notifications. Then clean up all hardcoded channel IDs in archetype instructions, rename `channel_ids` → `source_channels`, and consolidate stale env vars — so changing a channel requires only a DB update, not a code deploy.
>
> **Deliverables**:
>
> - Prisma migration adding `notification_channel` column to `archetypes` table
> - `notification_channel` field added to tenant config JSON schema
> - `resolveNotificationChannel()` shared utility
> - `loadTenantEnv()` updated to inject `NOTIFICATION_CHANNEL` and `SOURCE_CHANNELS`
> - All archetype instructions/delivery_instructions using env var references instead of hardcoded channel IDs
> - `source_channels` config field replacing `summary.channel_ids`
> - Stale env vars (`DAILY_SUMMARY_CHANNELS`, `SUMMARY_TARGET_CHANNEL`, `SUMMARY_PUBLISH_CHANNEL`) removed
> - Comprehensive test suite (unit + integration + API verification)
> - Story-map document updated with completed checkboxes
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (migration) → Task 2 (resolution utility) → Task 4 (loadTenantEnv) → Task 6 (seed cleanup) → Task 9 (tests) → Task 11 (API verification)

---

## Context

### Original Request

Implement PLAT-07 (Required Notification Channel per Employee) and PLAT-08 (Channel Config Cleanup) from the Phase 1 story map. Test thoroughly via automated tests and API endpoint verification. Mark story-map items as completed.

### Interview Summary

**Key Discussions**:

- Scope: PLAT-07 + PLAT-08 combined in one plan (user decision)
- `notification_channel` = approval/notification channel ONLY (user clarified). Does NOT replace publish channel — delivery output channel stays as defined by archetype's `delivery_instructions`
- `metadata.target_channel` from `/tmp/approval-message.json` stays — it's runtime output
- Source channels: rename `channel_ids` → `source_channels` (user confirmed)
- Test depth: unit + integration + API endpoint verification

**Research Findings**:

- `loadTenantEnv()` already injects `DAILY_SUMMARY_CHANNELS`, `SUMMARY_TARGET_CHANNEL`, `SUMMARY_PUBLISH_CHANNEL` but archetype instructions ignore them and hardcode channel IDs
- `SUMMARY_PUBLISH_CHANNEL` is injected but never read by any source code
- Lifecycle channel resolution: `metadata.target_channel ?? tenantEnvForApproval['SUMMARY_TARGET_CHANNEL'] ?? ''`
- Archetype model has no `notification_channel` column
- DozalDevs channels: read=C092BJ04HUG, approval=C0AUBMXKVNU, publish=C092BJ04HUG
- VLRE channels: read=C0AMGJQN05S/C0ANH9J91NC/C0960S2Q8RL, approval+publish=C0960S2Q8RL
- Test infra: Vitest, `makeDeps()` pattern for loader, `makeApp()` + supertest for routes, `InngestTestEngine` for lifecycle

### Metis Review

**Identified Gaps** (addressed):

- Clarified `notification_channel` is approval-only, not publish (user confirmed)
- Identified DozalDevs split-channel case — resolved: notification_channel=C0AUBMXKVNU for approval, publish stays in delivery_instructions
- Flagged migration ordering: update lifecycle consumer BEFORE removing old env var
- Identified `TenantConfigBodySchema` should keep `notification_channel` optional on PATCH (deep-merge pattern)
- Flagged guest-messaging archetype (0015) exclusion from instruction cleanup for delivery_instructions (uses Hostfully, not Slack)

---

## Work Objectives

### Core Objective

Establish `notification_channel` as the config-driven, resolvable channel for employee notifications (approval cards, status updates, feedback), and clean up all hardcoded channel IDs from archetype instructions so channel changes require only a DB update.

### Concrete Deliverables

- `prisma/migrations/YYYYMMDDHHMMSS_add_notification_channel/migration.sql`
- `src/gateway/services/notification-channel.ts` (resolution utility)
- Updated `src/gateway/services/tenant-env-loader.ts`
- Updated `src/gateway/validation/schemas.ts`
- Updated `src/inngest/employee-lifecycle.ts` (fallback chain)
- Updated `prisma/seed.ts` (notification_channel values + env var references in instructions)
- Updated `docs/2026-04-21-2202-phase1-story-map.md` (checkboxes marked)
- Test files: new + updated across 6+ test files

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes with zero new failures
- [ ] `pnpm prisma db seed` runs twice without error (idempotency)
- [ ] API endpoint `GET /admin/tenants/:id/config` returns `notification_channel` and `source_channels`
- [ ] No hardcoded Slack channel IDs (pattern `C[A-Z0-9]{8,}`) in any archetype instructions/delivery_instructions in seed.ts
- [ ] Story-map PLAT-07 and PLAT-08 acceptance criteria all marked `[x]`

### Must Have

- `notification_channel` field on tenant config (required for new tenants)
- `notification_channel` nullable column on archetypes table
- Resolution: `archetype.notification_channel ?? tenant.config.notification_channel`
- `NOTIFICATION_CHANNEL` env var injected into machine env
- `source_channels` replacing `channel_ids` in tenant config
- `SOURCE_CHANNELS` env var replacing `DAILY_SUMMARY_CHANNELS`
- All archetype instructions using `$NOTIFICATION_CHANNEL` and `$SOURCE_CHANNELS` instead of hardcoded IDs
- Lifecycle fallback updated to use `NOTIFICATION_CHANNEL` instead of `SUMMARY_TARGET_CHANNEL`
- Comprehensive automated tests

### Must NOT Have (Guardrails)

- MUST NOT change harness `/tmp/approval-message.json` reading logic (`opencode-harness.mts`)
- MUST NOT remove `metadata.target_channel` from deliverable metadata schema
- MUST NOT touch guest-messaging archetype (0015) delivery_instructions channel references (uses Hostfully)
- MUST NOT remove `summary.target_channel` or `summary.publish_channel` from `TenantConfigBodySchema` in this PR — only ADD new fields (backward compat)
- MUST NOT modify any deprecated files (see AGENTS.md deprecated components table)
- MUST NOT use any LLM model other than `minimax/minimax-m2.7` or `anthropic/claude-haiku-4-5`
- MUST NOT add `Co-authored-by` lines or AI references in commits

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — add tests after implementation)
- **Framework**: Vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Schema/Migration**: Use Bash (`pnpm prisma migrate deploy`, `pnpm prisma db seed`)
- **Unit tests**: Use Bash (`pnpm test -- --run --reporter=verbose`)
- **API endpoints**: Use Bash (curl) — send requests, assert status + response fields
- **Code quality**: Use Bash (`pnpm build`, `pnpm lint`)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately, all independent):
├── Task 1: Prisma migration — add notification_channel to archetypes [quick]
├── Task 2: Resolution utility — resolveNotificationChannel() [quick]
├── Task 3: Validation schema — add notification_channel + source_channels to TenantConfigBodySchema [quick]

Wave 2 (Core implementation — depends on Wave 1):
├── Task 4: Update loadTenantEnv() — inject NOTIFICATION_CHANNEL + SOURCE_CHANNELS (depends: 1, 2) [unspecified-high]
├── Task 5: Update lifecycle fallback — use NOTIFICATION_CHANNEL (depends: 2) [unspecified-high]
├── Task 6: Seed data update — notification_channel values + env var refs in instructions (depends: 1, 3) [unspecified-high]

Wave 3 (Testing, verification, docs — depends on Wave 2):
├── Task 7: Unit + integration tests for resolution utility + loadTenantEnv (depends: 2, 4) [unspecified-high]
├── Task 8: Route + schema + lifecycle tests (depends: 3, 5, 6) [unspecified-high]
├── Task 9: Full test suite + build verification (depends: 7, 8) [quick]
├── Task 10: API endpoint verification with curl (depends: 6, 9) [quick]
├── Task 11: Update story-map document (depends: 9) [quick]
├── Task 12: Notify completion via Telegram (depends: 11) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 4, 6    | 1    |
| 2    | —          | 4, 5, 7 | 1    |
| 3    | —          | 6, 8    | 1    |
| 4    | 1, 2       | 7, 10   | 2    |
| 5    | 2          | 8       | 2    |
| 6    | 1, 3       | 8, 10   | 2    |
| 7    | 2, 4       | 9       | 3    |
| 8    | 3, 5, 6    | 9       | 3    |
| 9    | 7, 8       | 10, 11  | 3    |
| 10   | 6, 9       | 11      | 3    |
| 11   | 9          | 12      | 3    |
| 12   | 11         | F1-F4   | 3    |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: **3 tasks** — T4 `unspecified-high`, T5 `unspecified-high`, T6 `unspecified-high`
- **Wave 3**: **6 tasks** — T7 `unspecified-high`, T8 `unspecified-high`, T9 `quick`, T10 `quick`, T11 `quick`, T12 `quick`
- **FINAL**: **4 tasks** — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Prisma migration — add `notification_channel` to archetypes table

  **What to do**:
  - Add `notification_channel String? @db.Text` to the `Archetype` model in `prisma/schema.prisma` (after the `model` field, before `deliverable_type`)
  - Run `pnpm prisma migrate dev --name add_notification_channel` to generate the migration
  - Verify the generated SQL is: `ALTER TABLE "archetypes" ADD COLUMN "notification_channel" TEXT;`
  - Run `pnpm prisma generate` to update the Prisma client types

  **Must NOT do**:
  - Do NOT add `NOT NULL` constraint — field must be nullable
  - Do NOT add a default value
  - Do NOT modify any other columns in the schema

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file schema change + migration generation, mechanical task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: [4, 6]
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma:199-230` — Current `Archetype` model definition, add new field here
  - `prisma/migrations/` — Existing migrations directory, new migration goes here

  **WHY Each Reference Matters**:
  - `schema.prisma:199-230`: The exact model to modify — look at field ordering convention (nullable fields at the end)
  - `prisma/migrations/`: Verify the generated SQL matches expectations

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Migration applies cleanly
    Tool: Bash
    Preconditions: Database running (pnpm dev:start or docker compose up)
    Steps:
      1. Run: pnpm prisma migrate deploy
      2. Assert: exit code 0
      3. Run: pnpm prisma generate
      4. Assert: exit code 0
    Expected Result: Migration applies without error, Prisma client regenerated
    Failure Indicators: Non-zero exit code, "migration failed" in output
    Evidence: .sisyphus/evidence/task-1-migration-apply.txt

  Scenario: Column exists in database
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='archetypes' AND column_name='notification_channel';"
      2. Assert: output contains "notification_channel | text | YES"
    Expected Result: Column exists, is TEXT type, is nullable
    Failure Indicators: Empty result set, wrong type, NOT NULL
    Evidence: .sisyphus/evidence/task-1-column-exists.txt
  ```

  **Commit**: YES (commit 1)
  - Message: `feat(schema): add notification_channel column to archetypes table`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm prisma migrate deploy`

- [x] 2. Resolution utility — `resolveNotificationChannel()`

  **What to do**:
  - Create `src/gateway/services/notification-channel.ts`
  - Export function `resolveNotificationChannel(archetype: { notification_channel: string | null }, tenantConfig: { notification_channel?: string }): string`
  - Logic: `return archetype.notification_channel ?? tenantConfig.notification_channel ?? ''`
  - If both are null/undefined, return empty string (caller handles)
  - Keep it pure (no DB calls, no side effects) — just resolution logic

  **Must NOT do**:
  - Do NOT add database queries — this is a pure utility function
  - Do NOT throw on missing values — return empty string for caller to handle
  - Do NOT import any external dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single pure function, ~15 lines, no external dependencies
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: [4, 5, 7]
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/services/tenant-env-loader.ts` — Existing service pattern in this directory, follow naming/export conventions

  **API/Type References**:
  - `prisma/schema.prisma:199-230` — `Archetype` model fields (after Task 1, will have `notification_channel`)

  **WHY Each Reference Matters**:
  - `tenant-env-loader.ts`: Shows the service file pattern — named export, TypeScript, no class
  - `schema.prisma:199-230`: The type of `notification_channel` on archetype — `String?` → `string | null` in TypeScript

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compiles
    Tool: Bash
    Preconditions: File created
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: No TypeScript errors
    Failure Indicators: Compilation errors mentioning notification-channel.ts
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: Function exists and is importable
    Tool: Bash
    Preconditions: File created
    Steps:
      1. Run: node -e "const { resolveNotificationChannel } = require('./dist/gateway/services/notification-channel.js'); console.log(typeof resolveNotificationChannel);"
      2. Assert: output is "function"
    Expected Result: Function is exported and callable
    Failure Indicators: Module not found error, undefined
    Evidence: .sisyphus/evidence/task-2-importable.txt
  ```

  **Commit**: YES (groups with Task 3 — commit 2)
  - Message: `feat(config): add notification channel resolution utility and schema validation`
  - Files: `src/gateway/services/notification-channel.ts`, `src/gateway/validation/schemas.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Validation schema — add `notification_channel` + `source_channels` to `TenantConfigBodySchema`

  **What to do**:
  - In `src/gateway/validation/schemas.ts`, update `TenantConfigBodySchema` (line ~254):
    - Add `notification_channel: z.string().optional()` at the top level of the schema (NOT nested under `summary`)
    - Add `source_channels: z.array(z.string()).optional()` at the top level
    - Keep existing `summary.*` fields intact (backward compatibility)
  - The `notification_channel` is optional on the PATCH body (deep-merge — partial updates). The required-ness is enforced by the seed and tenant creation logic, not the PATCH schema.

  **Must NOT do**:
  - Do NOT remove `summary.target_channel` or `summary.publish_channel` from the schema — backward compatibility
  - Do NOT make `notification_channel` required in the Zod schema — it's optional for PATCH
  - Do NOT modify the `CreateTenantBodySchema` in this task (if it exists)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small schema addition, ~5 lines changed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: [6, 8]
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/validation/schemas.ts:254-263` — Current `TenantConfigBodySchema` definition showing existing `summary` nested structure

  **WHY Each Reference Matters**:
  - `schemas.ts:254-263`: Shows the exact Zod schema to modify — all fields are optional (`.optional()`), and new fields should follow the same pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema accepts notification_channel
    Tool: Bash
    Preconditions: File updated
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: TypeScript compiles cleanly
    Failure Indicators: Compilation errors
    Evidence: .sisyphus/evidence/task-3-build.txt

  Scenario: Schema rejects non-string notification_channel
    Tool: Bash
    Preconditions: File updated, build passes
    Steps:
      1. Run: node -e "const { TenantConfigBodySchema } = require('./dist/gateway/validation/schemas.js'); try { TenantConfigBodySchema.parse({ notification_channel: 123 }); console.log('FAIL: should have thrown'); } catch(e) { console.log('PASS: rejected non-string'); }"
      2. Assert: output contains "PASS: rejected non-string"
    Expected Result: Non-string value rejected by Zod
    Failure Indicators: "FAIL: should have thrown"
    Evidence: .sisyphus/evidence/task-3-validation.txt
  ```

  **Commit**: YES (groups with Task 2 — commit 2)
  - Message: `feat(config): add notification channel resolution utility and schema validation`
  - Files: `src/gateway/services/notification-channel.ts`, `src/gateway/validation/schemas.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Update `loadTenantEnv()` — inject `NOTIFICATION_CHANNEL` + `SOURCE_CHANNELS`

  **What to do**:
  - In `src/gateway/services/tenant-env-loader.ts`, modify `loadTenantEnv()`:
    - Import `resolveNotificationChannel` from `./notification-channel.ts`
    - The function currently receives `tenantId` and fetches tenant data. It needs to ALSO accept an optional `archetype` parameter (or the archetype's `notification_channel` value) so it can resolve the notification channel.
    - Add `NOTIFICATION_CHANNEL` to the env output: `resolveNotificationChannel(archetype, tenant.config)`
    - Rename the `DAILY_SUMMARY_CHANNELS` mapping: read from `tenant.config.source_channels` (new field) OR fall back to `tenant.config.summary.channel_ids` (backward compat). Inject as `SOURCE_CHANNELS` env var.
    - Keep injecting `DAILY_SUMMARY_CHANNELS` as an alias of `SOURCE_CHANNELS` for backward compatibility during transition (both point to the same value)
    - Add `NOTIFICATION_CHANNEL` injection from the resolved value
    - Remove `SUMMARY_TARGET_CHANNEL` injection (replaced by `NOTIFICATION_CHANNEL`) — BUT first confirm Task 5 has updated the lifecycle consumer. If implementing in parallel, keep `SUMMARY_TARGET_CHANNEL` as an alias temporarily.
    - Remove `SUMMARY_PUBLISH_CHANNEL` injection (it was never read by any code)
  - Update the function signature to accept archetype notification_channel

  **Must NOT do**:
  - Do NOT remove `SUMMARY_TARGET_CHANNEL` until Task 5 updates the lifecycle (if parallel, keep as alias)
  - Do NOT change the env whitelist logic or secret injection logic
  - Do NOT modify the Fly.io machine dispatch code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifying a critical service with multiple consumers, needs careful backward compat handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5, Task 6 in Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: [7, 10]
  - **Blocked By**: [1, 2]

  **References**:

  **Pattern References**:
  - `src/gateway/services/tenant-env-loader.ts:1-65` — Full current implementation, the exact file to modify
  - `src/gateway/services/notification-channel.ts` — Resolution utility created in Task 2 (import this)

  **API/Type References**:
  - `prisma/schema.prisma:199-230` — Archetype model with new `notification_channel` field

  **Test References**:
  - `tests/gateway/services/tenant-env-loader.test.ts` — Existing tests using `makeDeps()` pattern, must not break these

  **WHY Each Reference Matters**:
  - `tenant-env-loader.ts:1-65`: The exact function to modify — understand the tenant fetch, config parsing, and env building flow
  - `notification-channel.ts`: Import the resolution utility for `NOTIFICATION_CHANNEL` value
  - `tenant-env-loader.test.ts`: Existing tests that must continue passing — study the mock patterns

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: NOTIFICATION_CHANNEL injected from tenant config
    Tool: Bash
    Preconditions: Tasks 1, 2 complete
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
      3. Run: pnpm test -- --run tests/gateway/services/tenant-env-loader.test.ts --reporter=verbose 2>&1
      4. Assert: all existing tests pass (no regressions)
    Expected Result: Build passes, existing tests pass
    Failure Indicators: Compilation error, test failure
    Evidence: .sisyphus/evidence/task-4-build-and-existing-tests.txt

  Scenario: SOURCE_CHANNELS replaces DAILY_SUMMARY_CHANNELS
    Tool: Bash
    Preconditions: Function updated
    Steps:
      1. Verify the source code includes mapping from `source_channels` config to `SOURCE_CHANNELS` env var
      2. Verify backward compat: `DAILY_SUMMARY_CHANNELS` still injected as alias
    Expected Result: Both `SOURCE_CHANNELS` and `DAILY_SUMMARY_CHANNELS` present in env output
    Failure Indicators: Missing either env var
    Evidence: .sisyphus/evidence/task-4-source-channels.txt
  ```

  **Commit**: YES (groups with Task 5 — commit 3)
  - Message: `feat(lifecycle): inject NOTIFICATION_CHANNEL env var and update fallback chain`
  - Files: `src/gateway/services/tenant-env-loader.ts`, `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Update lifecycle fallback — use `NOTIFICATION_CHANNEL`

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the `handle-approval-result` step (around lines 325-402)
  - Update the channel resolution fallback chain (currently lines 334-337):
    ```typescript
    // BEFORE:
    const targetChannel =
      (metadata.target_channel as string) ?? tenantEnvForApproval['SUMMARY_TARGET_CHANNEL'] ?? '';
    // AFTER:
    const targetChannel =
      (metadata.target_channel as string) ??
      tenantEnvForApproval['NOTIFICATION_CHANNEL'] ??
      tenantEnvForApproval['SUMMARY_TARGET_CHANNEL'] ?? // backward compat fallback
      '';
    ```
  - The three-level fallback ensures: (1) runtime channel from approval message takes priority, (2) new `NOTIFICATION_CHANNEL` from config, (3) old `SUMMARY_TARGET_CHANNEL` for backward compat during transition

  **Must NOT do**:
  - Do NOT remove the `metadata.target_channel` as primary source — it's runtime output from the harness
  - Do NOT change any other step in the lifecycle
  - Do NOT modify the delivery machine spawn logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Modifying the lifecycle — high-stakes function, needs careful fallback chain
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4, Task 6 in Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: [8]
  - **Blocked By**: [2]

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:325-402` — The `handle-approval-result` step containing the channel resolution logic
  - `src/inngest/employee-lifecycle.ts:334-337` — Exact lines with the current fallback chain to modify

  **Test References**:
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — Existing lifecycle delivery tests with `mockLoadTenantEnv`, must not break

  **WHY Each Reference Matters**:
  - `employee-lifecycle.ts:334-337`: The exact 4 lines to modify — understand the current fallback chain before changing it
  - `employee-lifecycle-delivery.test.ts`: Shows the mock pattern and what channels are asserted — new tests will follow this pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Lifecycle compiles with new fallback
    Tool: Bash
    Preconditions: Task 2 complete
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: No TypeScript errors
    Failure Indicators: Compilation errors in employee-lifecycle.ts
    Evidence: .sisyphus/evidence/task-5-build.txt

  Scenario: Existing lifecycle tests pass
    Tool: Bash
    Preconditions: Lifecycle updated
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts --reporter=verbose 2>&1
      2. Assert: all existing tests pass
    Expected Result: Zero regressions in delivery tests
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-existing-tests.txt
  ```

  **Commit**: YES (groups with Task 4 — commit 3)
  - Message: `feat(lifecycle): inject NOTIFICATION_CHANNEL env var and update fallback chain`
  - Files: `src/gateway/services/tenant-env-loader.ts`, `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Seed data update — `notification_channel` values + env var refs in instructions

  **What to do**:
  This is the largest task. Update `prisma/seed.ts` in multiple areas:

  **PLAT-07: Add notification_channel values**:
  - DozalDevs tenant config (~line 254): add `notification_channel: 'C0AUBMXKVNU'` at top level of config JSON (the approval channel, `#victor-tests`)
  - VLRE tenant config (~line 285): add `notification_channel: 'C0960S2Q8RL'` at top level of config JSON
  - DozalDevs summarizer archetype (~line 340): add `notification_channel: null` (uses tenant default)
  - VLRE summarizer archetype (~line 360): add `notification_channel: null` (uses tenant default)

  **PLAT-07: Add source_channels values**:
  - DozalDevs tenant config: add `source_channels: ['C092BJ04HUG']` at top level
  - VLRE tenant config: add `source_channels: ['C0AMGJQN05S', 'C0ANH9J91NC', 'C0960S2Q8RL']` at top level

  **PLAT-08: Replace hardcoded channel IDs in instructions**:
  - `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` (~lines 381-391): Replace hardcoded `C092BJ04HUG` in `--channels` arg with `$SOURCE_CHANNELS`. Replace hardcoded `C0AUBMXKVNU` in `--channel` arg with `$NOTIFICATION_CHANNEL`.
  - `VLRE_SUMMARIZER_INSTRUCTIONS` (~lines 393-403): Replace hardcoded `C0AMGJQN05S,C0ANH9J91NC,C0960S2Q8RL` in `--channels` arg with `$SOURCE_CHANNELS`. Replace hardcoded `C0960S2Q8RL` in `--channel` arg with `$NOTIFICATION_CHANNEL`.
  - `DOZALDEVS delivery_instructions` (~lines 1115-1133): Replace hardcoded `C092BJ04HUG` in `--channel` arg with `$NOTIFICATION_CHANNEL` (for delivery, use the notification channel — user clarified this is the approval/notification channel, NOT publish). **WAIT — user clarified notification_channel is for approvals, not publish. The delivery_instructions post the FINAL published summary to a different channel.** So in delivery_instructions, replace the hardcoded channel ID with a new env var `$PUBLISH_CHANNEL` OR keep the current `$SUMMARY_PUBLISH_CHANNEL` env var for delivery. **Decision: keep `publish_channel` in tenant config for delivery, inject as `PUBLISH_CHANNEL` env var. The delivery_instructions should use `$PUBLISH_CHANNEL`.**
  - `VLRE delivery_instructions` (~lines 1158-1176): Same pattern — replace hardcoded `C0960S2Q8RL` with `$PUBLISH_CHANNEL`
  - Guest-messaging archetype (0015) instructions (~line 423-430): Replace hardcoded `C0960S2Q8RL` (the approval posting channel) with `$NOTIFICATION_CHANNEL`. Leave Hostfully-related delivery_instructions alone.

  **PLAT-08: Verify all hardcoded channel IDs removed from instruction strings**:
  - After changes, grep for `C[A-Z0-9]{8,}` in instruction/delivery_instruction template strings — should find ZERO matches
  - Channel IDs should only appear in config field assignments (`notification_channel: 'C...'`, `source_channels: [...]`, `target_channel: '...'`, `publish_channel: '...'`)

  **Must NOT do**:
  - Do NOT remove `summary.target_channel` or `summary.publish_channel` from tenant config — keep for backward compat
  - Do NOT modify guest-messaging archetype (0015) delivery_instructions (uses Hostfully tool, not Slack channels for delivery)
  - Do NOT change archetype `system_prompt` fields — only `instructions` and `delivery_instructions`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Large seed file modification with multiple string replacements, needs careful grep verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4, Task 5 in Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: [8, 10]
  - **Blocked By**: [1, 3]

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:254-305` — Current tenant config objects (DozalDevs + VLRE) — add `notification_channel` and `source_channels` here
  - `prisma/seed.ts:381-403` — Current summarizer instruction templates with hardcoded channel IDs
  - `prisma/seed.ts:1100-1180` — Current delivery_instructions with hardcoded channel IDs
  - `prisma/seed.ts:423-430` — Guest-messaging archetype instructions with hardcoded channel ID

  **WHY Each Reference Matters**:
  - `seed.ts:254-305`: Exact location to add `notification_channel` and `source_channels` to tenant configs
  - `seed.ts:381-403`: Instruction strings where `C092BJ04HUG`, `C0AUBMXKVNU`, `C0960S2Q8RL` etc. must be replaced with env var references
  - `seed.ts:1100-1180`: Delivery instruction strings where publish channel IDs must be replaced with `$PUBLISH_CHANNEL`
  - `seed.ts:423-430`: Guest-messaging instructions — replace approval channel only, leave delivery alone

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs without error
    Tool: Bash
    Preconditions: Tasks 1, 3 complete (migration applied, schema updated)
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit code 0
      3. Run: pnpm prisma db seed (second time for idempotency)
      4. Assert: exit code 0
    Expected Result: Seed runs cleanly twice
    Failure Indicators: Non-zero exit code, upsert errors
    Evidence: .sisyphus/evidence/task-6-seed-idempotent.txt

  Scenario: No hardcoded channel IDs in instruction strings
    Tool: Bash
    Preconditions: Seed file updated
    Steps:
      1. Run: grep -n 'C[A-Z0-9]\{8,\}' prisma/seed.ts | grep -i 'instruction'
      2. Assert: zero matches in instruction template strings
      3. Run: grep -n '\$NOTIFICATION_CHANNEL\|\$SOURCE_CHANNELS\|\$PUBLISH_CHANNEL' prisma/seed.ts
      4. Assert: env var references found in instruction strings
    Expected Result: All channel IDs replaced with env var references in instructions
    Failure Indicators: Hardcoded channel IDs still present in instruction strings
    Evidence: .sisyphus/evidence/task-6-no-hardcoded-ids.txt

  Scenario: Tenant configs have notification_channel
    Tool: Bash
    Preconditions: Seed applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT config->>'notification_channel' as nc FROM tenants WHERE id='00000000-0000-0000-0000-000000000002';"
      2. Assert: output contains "C0AUBMXKVNU"
      3. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT config->>'notification_channel' as nc FROM tenants WHERE id='00000000-0000-0000-0000-000000000003';"
      4. Assert: output contains "C0960S2Q8RL"
    Expected Result: Both tenants have notification_channel in config
    Failure Indicators: NULL or missing values
    Evidence: .sisyphus/evidence/task-6-tenant-configs.txt
  ```

  **Commit**: YES (commit 4)
  - Message: `refactor(seed): replace hardcoded channel IDs with env var references`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm prisma db seed`

- [x] 7. Unit + integration tests for resolution utility + `loadTenantEnv`

  **What to do**:
  - Create `tests/gateway/services/notification-channel.test.ts` with tests for `resolveNotificationChannel()`:
    - Archetype value present → returns archetype value
    - Archetype value null, tenant value present → returns tenant value
    - Both null → returns empty string
    - Archetype value overrides tenant value
  - Add tests to `tests/gateway/services/tenant-env-loader.test.ts`:
    - `NOTIFICATION_CHANNEL` injected from resolved value (tenant config + archetype)
    - `SOURCE_CHANNELS` injected from `config.source_channels`
    - `DAILY_SUMMARY_CHANNELS` still injected as backward compat alias
    - When `source_channels` absent, falls back to `summary.channel_ids`
    - `SUMMARY_PUBLISH_CHANNEL` removed (or aliased to `PUBLISH_CHANNEL`)
  - Follow existing `makeDeps()` pattern for loader tests
  - Add integration test in `tests/integration/multi-tenancy.test.ts` asserting `NOTIFICATION_CHANNEL` is tenant-isolated

  **Must NOT do**:
  - Do NOT break existing tests — only ADD new test cases
  - Do NOT modify the test helpers or global setup

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, needs to follow existing patterns precisely
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8 in Wave 3)
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: [9]
  - **Blocked By**: [2, 4]

  **References**:

  **Pattern References**:
  - `tests/gateway/services/tenant-env-loader.test.ts:1-157` — Existing test file with `makeDeps()` factory pattern
  - `tests/gateway/services/hostfully-env-injection.test.ts` — Shows pattern for testing new env var injection
  - `tests/integration/multi-tenancy.test.ts:283-292` — Existing integration test asserting `SUMMARY_TARGET_CHANNEL` per tenant

  **WHY Each Reference Matters**:
  - `tenant-env-loader.test.ts:1-157`: THE pattern file — copy the `makeDeps()` factory, mock structure, and assertion style exactly
  - `hostfully-env-injection.test.ts`: Shows how new secret/env types get tested — same pattern for `NOTIFICATION_CHANNEL`
  - `multi-tenancy.test.ts:283-292`: Integration test that calls real `loadTenantEnv` — add parallel assertion for `NOTIFICATION_CHANNEL`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: Tasks 2, 4 complete
    Steps:
      1. Run: pnpm test -- --run tests/gateway/services/notification-channel.test.ts --reporter=verbose 2>&1
      2. Assert: all tests pass
      3. Run: pnpm test -- --run tests/gateway/services/tenant-env-loader.test.ts --reporter=verbose 2>&1
      4. Assert: all tests pass (existing + new)
    Expected Result: All resolution utility and loader tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-unit-tests.txt

  Scenario: No regressions in integration tests
    Tool: Bash
    Preconditions: All source changes complete
    Steps:
      1. Run: pnpm test -- --run tests/integration/multi-tenancy.test.ts --reporter=verbose 2>&1
      2. Assert: all tests pass
    Expected Result: Multi-tenancy integration tests pass with new assertions
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-integration-tests.txt
  ```

  **Commit**: YES (groups with Task 8 — commit 5)
  - Message: `test: add notification channel resolution, loader, lifecycle, and schema tests`
  - Files: `tests/gateway/services/notification-channel.test.ts`, `tests/gateway/services/tenant-env-loader.test.ts`, `tests/integration/multi-tenancy.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Route + schema + lifecycle tests

  **What to do**:
  - Add `describe('TenantConfigBodySchema')` block in `tests/gateway/schemas.test.ts`:
    - Valid body with `notification_channel` accepted
    - Non-string `notification_channel` rejected
    - Body without `notification_channel` accepted (optional)
    - Valid body with `source_channels` array accepted
    - Non-array `source_channels` rejected
  - Add tests to `tests/gateway/routes/admin-tenant-config.test.ts`:
    - PATCH with `notification_channel` persists correctly
    - GET returns `notification_channel` from config
  - Add tests to `tests/inngest/employee-lifecycle-delivery.test.ts`:
    - Update `mockLoadTenantEnv.mockResolvedValue(...)` in relevant tests to return `{ NOTIFICATION_CHANNEL: 'C-TEST' }` alongside existing values
    - New test: when `metadata.target_channel` is absent and `NOTIFICATION_CHANNEL` is set, lifecycle uses `NOTIFICATION_CHANNEL`
    - New test: when both `NOTIFICATION_CHANNEL` and `SUMMARY_TARGET_CHANNEL` present, `NOTIFICATION_CHANNEL` takes priority (if metadata.target_channel absent)

  **Must NOT do**:
  - Do NOT break existing tests — only ADD new test cases and update mocks where needed
  - Do NOT remove the `SUMMARY_TARGET_CHANNEL` mock value from existing tests — add `NOTIFICATION_CHANNEL` alongside

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files across different domains (schema, route, lifecycle), needs pattern adherence
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7 in Wave 3)
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: [9]
  - **Blocked By**: [3, 5, 6]

  **References**:

  **Pattern References**:
  - `tests/gateway/schemas.test.ts` — Existing schema test file, add new describe block here
  - `tests/gateway/routes/admin-tenant-config.test.ts:1-128` — Existing route tests with `makeApp()` + supertest pattern
  - `tests/inngest/employee-lifecycle-delivery.test.ts:1-207` — Existing lifecycle delivery tests with `InngestTestEngine` + `mockCtx`

  **WHY Each Reference Matters**:
  - `schemas.test.ts`: Shows how other schemas are tested (parse/safeParse assertions) — follow same pattern for `TenantConfigBodySchema`
  - `admin-tenant-config.test.ts:1-128`: Shows the `makeApp(prismaOverrides)` + supertest pattern and how config PATCH/GET are tested
  - `employee-lifecycle-delivery.test.ts:1-207`: Shows `mockLoadTenantEnv` pattern and channel assertions — update mocks and add new assertions here

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema tests pass
    Tool: Bash
    Preconditions: Tasks 3, 5, 6 complete
    Steps:
      1. Run: pnpm test -- --run tests/gateway/schemas.test.ts --reporter=verbose 2>&1
      2. Assert: all tests pass including new TenantConfigBodySchema tests
    Expected Result: All schema validation tests pass
    Failure Indicators: Zod parse errors, test failures
    Evidence: .sisyphus/evidence/task-8-schema-tests.txt

  Scenario: Route tests pass
    Tool: Bash
    Preconditions: All source changes complete
    Steps:
      1. Run: pnpm test -- --run tests/gateway/routes/admin-tenant-config.test.ts --reporter=verbose 2>&1
      2. Assert: all tests pass including new notification_channel tests
    Expected Result: Route tests pass with new assertions
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-8-route-tests.txt

  Scenario: Lifecycle delivery tests pass
    Tool: Bash
    Preconditions: Task 5 complete
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts --reporter=verbose 2>&1
      2. Assert: all tests pass including new NOTIFICATION_CHANNEL fallback tests
    Expected Result: Lifecycle tests pass with updated mocks and new assertions
    Failure Indicators: Any test failure, especially channel resolution assertions
    Evidence: .sisyphus/evidence/task-8-lifecycle-tests.txt
  ```

  **Commit**: YES (groups with Task 7 — commit 5)
  - Message: `test: add notification channel resolution, loader, lifecycle, and schema tests`
  - Files: `tests/gateway/schemas.test.ts`, `tests/gateway/routes/admin-tenant-config.test.ts`, `tests/inngest/employee-lifecycle-delivery.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Full test suite + build verification

  **What to do**:
  - Run `pnpm build` and verify zero TypeScript errors
  - Run `pnpm test -- --run` and verify all tests pass
  - Run `pnpm prisma db seed` twice to confirm idempotency
  - Capture full test output for evidence
  - Fix any failures found (iterate until green)

  **Must NOT do**:
  - Do NOT skip any failing tests with `.skip()` — fix the root cause
  - Do NOT modify test expectations to match broken behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure verification task — run commands, check output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 7, 8)
  - **Parallel Group**: Sequential after Wave 3 parallel tasks
  - **Blocks**: [10, 11]
  - **Blocked By**: [7, 8]

  **References**:

  **External References**:
  - AGENTS.md "Pre-existing Test Failures" section — `container-boot.test.ts` and `inngest-serve.test.ts` are known pre-existing failures, do not fix these

  **WHY Each Reference Matters**:
  - AGENTS.md pre-existing failures: Distinguish pre-existing failures from new regressions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full build passes
    Tool: Bash
    Preconditions: All source changes complete
    Steps:
      1. Run: pnpm build 2>&1
      2. Assert: exit code 0
    Expected Result: TypeScript compilation succeeds
    Failure Indicators: Any compilation error
    Evidence: .sisyphus/evidence/task-9-build.txt

  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: Build passes
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert: zero new failures (pre-existing failures in container-boot.test.ts and inngest-serve.test.ts are expected)
    Expected Result: All tests pass except known pre-existing failures
    Failure Indicators: New test failures not in the pre-existing list
    Evidence: .sisyphus/evidence/task-9-full-tests.txt

  Scenario: Seed idempotency
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: pnpm prisma db seed 2>&1
      2. Assert: exit code 0
      3. Run: pnpm prisma db seed 2>&1
      4. Assert: exit code 0
    Expected Result: Seed runs cleanly twice
    Failure Indicators: Error on second run
    Evidence: .sisyphus/evidence/task-9-seed-idempotent.txt
  ```

  **Commit**: NO (verification only)

- [x] 10. API endpoint verification with curl

  **What to do**:
  - This task requires the gateway to be running (`pnpm dev:start` or equivalent)
  - Verify tenant config endpoints return the new fields:
    - `GET /admin/tenants/00000000-0000-0000-0000-000000000002/config` → config includes `notification_channel: "C0AUBMXKVNU"` and `source_channels: ["C092BJ04HUG"]`
    - `GET /admin/tenants/00000000-0000-0000-0000-000000000003/config` → config includes `notification_channel: "C0960S2Q8RL"` and `source_channels: ["C0AMGJQN05S","C0ANH9J91NC","C0960S2Q8RL"]`
  - Verify PATCH config works with new fields:
    - `PATCH /admin/tenants/.../config` with `{"notification_channel": "C_NEW"}` → persists
    - `GET` → returns updated value
    - Restore original value after test
  - Verify tenant config deep-merge preserves existing fields:
    - PATCH with only `notification_channel` doesn't remove `summary.*` fields

  **Must NOT do**:
  - Do NOT leave test data in the database — restore original values after verification
  - Do NOT test against production — only local

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Curl commands + assertions, mechanical verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs running services)
  - **Parallel Group**: Sequential after Task 9
  - **Blocks**: [11]
  - **Blocked By**: [6, 9]

  **References**:

  **Pattern References**:
  - AGENTS.md "Admin API" section — curl examples with `X-Admin-Key` header

  **WHY Each Reference Matters**:
  - AGENTS.md Admin API: Shows the exact curl format, auth header, and endpoint patterns

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GET config returns notification_channel for DozalDevs
    Tool: Bash (curl)
    Preconditions: Gateway running, seed applied
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/config" | jq '.config.notification_channel'
      2. Assert: output is "C0AUBMXKVNU"
      3. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/config" | jq '.config.source_channels'
      4. Assert: output is ["C092BJ04HUG"]
    Expected Result: Both fields present and correct
    Failure Indicators: null, missing field, wrong value
    Evidence: .sisyphus/evidence/task-10-get-dozaldevs.txt

  Scenario: GET config returns notification_channel for VLRE
    Tool: Bash (curl)
    Preconditions: Gateway running, seed applied
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/config" | jq '.config.notification_channel'
      2. Assert: output is "C0960S2Q8RL"
      3. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/config" | jq '.config.source_channels'
      4. Assert: output is ["C0AMGJQN05S","C0ANH9J91NC","C0960S2Q8RL"]
    Expected Result: Both fields present and correct
    Failure Indicators: null, missing field, wrong value
    Evidence: .sisyphus/evidence/task-10-get-vlre.txt

  Scenario: PATCH config updates notification_channel
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Run: curl -s -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/config" -d '{"notification_channel":"C_TEST_TEMP"}'
      2. Assert: HTTP 200
      3. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/config" | jq '.config.notification_channel'
      4. Assert: output is "C_TEST_TEMP"
      5. Restore: curl -s -X PATCH -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/config" -d '{"notification_channel":"C0AUBMXKVNU"}'
      6. Assert: HTTP 200
    Expected Result: PATCH persists and GET returns updated value; original restored
    Failure Indicators: 4xx/5xx status, value not persisted
    Evidence: .sisyphus/evidence/task-10-patch-config.txt

  Scenario: Deep merge preserves existing fields
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Run: curl -s -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/config" | jq '.config.summary.target_channel'
      2. Assert: output is "C0AUBMXKVNU" (existing field still present)
    Expected Result: Deep merge doesn't destroy existing summary fields
    Failure Indicators: summary.target_channel is null or missing
    Evidence: .sisyphus/evidence/task-10-deep-merge.txt
  ```

  **Commit**: NO (verification only)

- [x] 11. Update story-map document

  **What to do**:
  - In `docs/2026-04-21-2202-phase1-story-map.md`, mark all PLAT-07 acceptance criteria as complete:
    - Line 418: `- [ ]` → `- [x]` (`tenants.config` JSON schema requires `notification_channel`)
    - Line 419: `- [ ]` → `- [x]` (Prisma migration adds nullable `notification_channel`)
    - Line 420: `- [ ]` → `- [x]` (Resolution logic implemented)
    - Line 421: `- [ ]` → `- [x]` (`loadTenantEnv()` injects `NOTIFICATION_CHANNEL`)
    - Line 422: `- [ ]` → `- [x]` (Existing tenants seeded)
    - Line 423: `- [ ]` → `- [x]` (Validation: tenant creation fails if missing)
    - Line 424: `- [ ]` → `- [x]` (`pnpm prisma db seed` runs without error)
  - Mark all PLAT-08 acceptance criteria as complete:
    - Line 441: `- [ ]` → `- [x]` (No hardcoded Slack channel IDs)
    - Line 442: `- [ ]` → `- [x]` (Instructions reference env vars)
    - Line 443: `- [ ]` → `- [x]` (`loadTenantEnv()` injects all channel env vars)
    - Line 444: `- [ ]` → `- [x]` (Existing archetypes updated)
    - Line 445: `- [ ]` → `- [x]` (`channel_ids` → `source_channels`)
    - Line 446: `- [ ]` → `- [x]` (Stale env vars removed or aliased)
    - Line 447: `- [ ]` → `- [x]` (Changing channel requires only DB update)
    - Line 448: `- [ ]` → `- [x]` (`pnpm prisma db seed` runs without error)
    - Line 449: `- [ ]` → `- [x]` (Manual test: change channel, trigger run, confirm)

  **Must NOT do**:
  - Do NOT modify any other stories in the document
  - Do NOT change the story text, only checkboxes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple checkbox updates in a markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 9 passing)
  - **Parallel Group**: Sequential after Task 9
  - **Blocks**: [12]
  - **Blocked By**: [9]

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:416-449` — Exact lines with PLAT-07 and PLAT-08 acceptance criteria checkboxes

  **WHY Each Reference Matters**:
  - `story-map.md:416-449`: The exact checkboxes to change from `[ ]` to `[x]`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All PLAT-07 checkboxes marked
    Tool: Bash
    Preconditions: Task 9 passes
    Steps:
      1. Run: grep -c '\- \[ \]' docs/2026-04-21-2202-phase1-story-map.md (count unchecked in PLAT-07 section)
      2. Run: grep -A 20 'PLAT-07' docs/2026-04-21-2202-phase1-story-map.md | grep -c '\- \[x\]'
      3. Assert: 7 checked items for PLAT-07
    Expected Result: All 7 PLAT-07 acceptance criteria marked [x]
    Failure Indicators: Unchecked items remain
    Evidence: .sisyphus/evidence/task-11-plat07-checkboxes.txt

  Scenario: All PLAT-08 checkboxes marked
    Tool: Bash
    Preconditions: Task 9 passes
    Steps:
      1. Run: grep -A 20 'PLAT-08' docs/2026-04-21-2202-phase1-story-map.md | grep -c '\- \[x\]'
      2. Assert: 9 checked items for PLAT-08
    Expected Result: All 9 PLAT-08 acceptance criteria marked [x]
    Failure Indicators: Unchecked items remain
    Evidence: .sisyphus/evidence/task-11-plat08-checkboxes.txt
  ```

  **Commit**: YES (commit 6)
  - Message: `docs: mark PLAT-07 and PLAT-08 complete in story map`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

- [x] 12. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification that PLAT-07 + PLAT-08 implementation is complete
  - Run: `tsx scripts/telegram-notify.ts "✅ PLAT-07 + PLAT-08 (Notification Channel & Channel Config Cleanup) complete — all tasks done, all tests passing. Come back to review results."`

  **Must NOT do**:
  - Do NOT skip this task — it's mandatory per AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (last task)
  - **Blocks**: [F1-F4]
  - **Blocked By**: [11]

  **References**:

  **Pattern References**:
  - AGENTS.md "Prometheus Planning — Telegram Notifications" section — exact script path and message format

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: Task 11 complete
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ PLAT-07 + PLAT-08 (Notification Channel & Channel Config Cleanup) complete — all tasks done, all tests passing. Come back to review results."
      2. Assert: exit code 0
    Expected Result: Notification sent successfully
    Failure Indicators: Non-zero exit code, network error
    Evidence: .sisyphus/evidence/task-12-telegram.txt
  ```

  **Commit**: NO (notification only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify no hardcoded channel IDs remain in any archetype instructions/delivery_instructions (grep for `C[A-Z0-9]{8,}` in seed.ts instruction strings).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `pnpm prisma db seed` twice (idempotency). Execute ALL QA scenarios from EVERY task — follow exact steps, capture evidence. Test API endpoints with curl. Verify `loadTenantEnv` returns correct env vars by reading the test output. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: harness unchanged, metadata.target_channel preserved, guest-messaging 0015 delivery_instructions untouched, no deprecated files modified. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Scope | Message                                                                           | Files                                                                               | Pre-commit                   |
| ------ | ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| 1      | T1    | `feat(schema): add notification_channel column to archetypes table`               | `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`                         | `pnpm prisma migrate deploy` |
| 2      | T2+T3 | `feat(config): add notification channel resolution utility and schema validation` | `src/gateway/services/notification-channel.ts`, `src/gateway/validation/schemas.ts` | `pnpm build`                 |
| 3      | T4+T5 | `feat(lifecycle): inject NOTIFICATION_CHANNEL env var and update fallback chain`  | `src/gateway/services/tenant-env-loader.ts`, `src/inngest/employee-lifecycle.ts`    | `pnpm build`                 |
| 4      | T6    | `refactor(seed): replace hardcoded channel IDs with env var references`           | `prisma/seed.ts`                                                                    | `pnpm prisma db seed`        |
| 5      | T7+T8 | `test: add notification channel resolution, loader, lifecycle, and schema tests`  | `tests/**/*.test.ts`                                                                | `pnpm test -- --run`         |
| 6      | T11   | `docs: mark PLAT-07 and PLAT-08 complete in story map`                            | `docs/2026-04-21-2202-phase1-story-map.md`                                          | —                            |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                    # Expected: exits 0, no TypeScript errors
pnpm test -- --run            # Expected: all tests pass, zero new failures
pnpm prisma db seed           # Expected: exits 0 (run twice for idempotency)
pnpm prisma db seed           # Expected: exits 0 on second run

# API verification (requires services running)
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/config" \
  | jq '.config.notification_channel'
# Expected: "C0AUBMXKVNU"

curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/config" \
  | jq '.config.notification_channel'
# Expected: "C0960S2Q8RL"

# Verify no hardcoded channel IDs in archetype instructions
grep -E 'C[A-Z0-9]{8,}' prisma/seed.ts | grep -v 'notification_channel\|source_channels\|target_channel\|publish_channel\|\/\/'
# Expected: only config field assignments, no IDs inside instruction strings
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Story-map PLAT-07 items marked `[x]`
- [ ] Story-map PLAT-08 items marked `[x]`
- [ ] `pnpm prisma db seed` idempotent (runs twice cleanly)
