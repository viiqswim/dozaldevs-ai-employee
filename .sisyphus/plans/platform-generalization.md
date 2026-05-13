# Platform Generalization — Archetype-Driven Employee Extensibility

## TL;DR

> **Quick Summary**: Refactor the AI employee platform so new employees can be created purely through archetype configuration + shell tools, without modifying shared infrastructure code (lifecycle, harness, gateway). Eliminates 13 hardcoded `role_name === 'guest-messaging'` branches, migrates triggers to an external cron service, and cleans up misleading naming throughout.
>
> **Deliverables**:
>
> - Generic notification enrichment interface replacing all employee-specific branches in `employee-lifecycle.ts`
> - Generic notification block builder replacing 10 forked block builders
> - `enrichment_adapter` archetype field for config-driven enrichment source selection
> - `vm_size` archetype field for per-employee VM sizing
> - External cron trigger infrastructure replacing Inngest per-employee trigger files
> - Cleaned-up env var naming (`WORKER_VM_SIZE`, `FLY_WORKER_APP` primary)
> - Updated AGENTS.md "Adding a new employee" section
>
> **Estimated Effort**: Medium-Large (5-7 days)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 5 → Task 9 → Task 13 → F1-F4

---

## Context

### Original Request

Victor is considering onboarding a new customer (Snobahn) to the AI employee platform. The Snobahn employee is fundamentally different from existing ones (external PostgreSQL, Excel file generation, Slack file uploads, timezone-aware cron). Before building the Snobahn employee, he wants to generalize the platform so creating new employees is truly config-driven.

### Interview Summary

**Key Discussions**:

- Used Snobahn as a stress test — discovered the platform scores 5.5/10 on genericness
- Three archetype fields (`trigger_sources`, `tool_registry`, `deliverable_type`) are stored but never read at runtime
- 13 `role_name === 'guest-messaging'` branches in the lifecycle hardcode employee-specific behavior
- The trigger system requires a new Inngest function file per employee

**Decisions**:

- **Triggers**: Move to external cron service calling the existing generic admin API endpoint
- **Notifications**: Generic enrichment interface + single block builder replacing all forks
- **Tool registry**: Keep as informational metadata (not enforced at runtime)
- **Pre-checks**: Leave as-is (only guest-messaging needs one, don't generalize)
- **Tests**: Tests after implementation; existing 515+ tests as regression

### Metis Review

**Identified Gaps** (addressed):

- **Enrichment data source unresolved**: Resolved → use `enrichment_adapter` field on archetype with dynamic import. Guest-messaging keeps rich notifications. New employees default to basic blocks. See Task 1 and Task 5.
- **13 branches not equivalent**: 10 control notification blocks, 2 control delivery env (`HOSTFULLY_MOCK`), 1 controls pre-check. Each addressed separately.
- **`target_channel` ≠ `notification_channel`**: Resolved → trace data flow in Task 3 before touching `tenant-env-loader.ts` in Task 8.
- **`FLY_SUMMARIZER_APP` backward compat**: Resolved → keep as secondary fallback in Task 7.
- **`HOSTFULLY_MOCK` leaks**: Resolved → move to VLRE tenant secrets in Task 6.
- **External cron service not chosen**: Resolved → research task (Task 10) before migration tasks.

---

## Work Objectives

### Core Objective

Make the AI employee platform truly archetype-driven: adding a new employee requires only a DB archetype record, shell tools, and an external cron job — zero changes to lifecycle, harness, or gateway shared code.

### Concrete Deliverables

- `src/lib/types/notification-enrichment.ts` — generic enrichment type
- `src/lib/slack-blocks.ts` — refactored with generic `buildNotifyBlocks()` replacing all forked builders
- `prisma/migrations/*/` — migration adding `vm_size` and `enrichment_adapter` to `archetypes`
- `src/inngest/employee-lifecycle.ts` — zero `role_name` branches in shared flow
- `src/workers/opencode-harness.mts` — delivery pre-parse moved to adapter
- `.env.example` — updated with renamed vars and deprecation notes
- Updated AGENTS.md "Adding a new employee" and env var sections

### Definition of Done

- [ ] `grep -c "role_name.*guest-messaging" src/inngest/employee-lifecycle.ts` → 1 (only the pre-check, which is explicitly kept)
- [ ] `grep -c "role_name.*guest-messaging" src/workers/opencode-harness.mts` → 0
- [ ] `pnpm test -- --run` → 515+ passing, 0 new failures
- [ ] `pnpm build` → exit 0
- [ ] Guest-messaging E2E: full trigger → approve → delivery flow works with rich notifications
- [ ] Summarizer E2E: full trigger → approve → publish flow works

### Must Have

- Generic enrichment interface type definition
- All 10 notification block forks replaced with single generic builder
- `enrichment_adapter` field on archetype (config-driven, not `role_name`-branched)
- `vm_size` field on archetype with backward-compatible fallback chain
- External cron trigger for at least one employee (proving the pattern)
- `FLY_WORKER_APP` as primary, `FLY_SUMMARIZER_APP` as deprecated fallback
- `WORKER_VM_SIZE` as primary, `SUMMARIZER_VM_SIZE` as deprecated fallback
- `HOSTFULLY_MOCK` moved from global env to VLRE tenant secrets
- Backward compatibility: existing guest-messaging and summarizer employees work identically

### Must NOT Have (Guardrails)

- Do NOT add a generic pre-check interface — pre-checks stay as-is (decision made)
- Do NOT enforce `tool_registry` at runtime — keep as documentation metadata
- Do NOT add `cron_expression` or trigger-related fields to archetype schema
- Do NOT rename `role_name` values in DB — they are dedup keys and external identifiers
- Do NOT rewrite `delivery_instructions` flow — it is already generic
- Do NOT create new Inngest functions as part of the trigger migration
- Do NOT modify: `feedback-summarizer.ts`, `reviewing-watchdog.ts`, `rule-extractor.ts`, `interaction-handler.ts`, `hostfully-precheck.ts`, any files under `src/worker-tools/`, any deprecated component files
- Do NOT add employee-specific language to shared files (per AGENTS.md convention)
- Do NOT change `prisma/seed.ts` beyond updating the schema fields on existing archetypes

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: Tests-after (write new tests for enrichment interface and generic block builder after implementation)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Refactored code**: Use Bash — `pnpm build`, `pnpm test`, `grep` for removed patterns
- **Schema migrations**: Use Bash — `pnpm prisma migrate deploy`, verify field exists
- **E2E flows**: Use Playwright + Bash — trigger employee, verify lifecycle states, approve in Slack
- **Cron triggers**: Use Bash — `curl` admin API endpoint, verify task created

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — types, schema, research):
├── Task 1: Define generic NotificationEnrichment type + enrichment adapter registry [quick]
├── Task 2: Prisma migration — add vm_size and enrichment_adapter to archetypes [quick]
├── Task 3: Trace target_channel / publish_channel data flow — document findings [deep]
├── Task 4: Move HOSTFULLY_MOCK to VLRE tenant secrets [quick]
└── Task 5: Build generic buildNotifyBlocks() function in slack-blocks.ts [unspecified-high]

Wave 2 (Core refactor — depends on Wave 1):
├── Task 6: Refactor lifecycle — replace 10 notification block forks [deep]
├── Task 7: Fix env var naming — WORKER_VM_SIZE + FLY_WORKER_APP primary [quick]
├── Task 8: Clean up tenant-env-loader.ts — generic config reads [unspecified-high]
└── Task 9: Clean up opencode-harness.mts — extract delivery pre-parse [unspecified-high]

Wave 3 (Trigger migration — depends on Wave 2):
├── Task 10: Research and select external cron service [deep]
├── Task 11: Set up external cron for daily-summarizer [quick]
├── Task 12: Set up external cron for guest-message-poll [quick]
└── Task 13: Clean up dead Inngest trigger files + update serve.ts [quick]

Wave 4 (Tests + docs — depends on Wave 3):
├── Task 14: Write tests for enrichment interface + generic block builder [unspecified-high]
├── Task 15: Run full regression suite + fix any breakage [unspecified-high]
├── Task 16: Update AGENTS.md + .env.example + docs [writing]
└── Task 17: Send Telegram notification that plan is complete [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 6 → Task 9 → Task 13 → Task 15 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On   | Blocks | Wave |
| ---- | ------------ | ------ | ---- |
| 1    | -            | 5, 6   | 1    |
| 2    | -            | 6, 7   | 1    |
| 3    | -            | 8      | 1    |
| 4    | -            | 6      | 1    |
| 5    | 1            | 6      | 1    |
| 6    | 1, 2, 4, 5   | 9, 14  | 2    |
| 7    | 2            | 15     | 2    |
| 8    | 3            | 15     | 2    |
| 9    | 6            | 13     | 2    |
| 10   | -            | 11, 12 | 3    |
| 11   | 10           | 13, 15 | 3    |
| 12   | 10           | 13, 15 | 3    |
| 13   | 9, 11, 12    | 15     | 3    |
| 14   | 6            | 15     | 4    |
| 15   | 7, 8, 13, 14 | 16     | 4    |
| 16   | 15           | 17     | 4    |
| 17   | 16           | F1-F4  | 4    |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1 `quick`, T2 `quick`, T3 `deep`, T4 `quick`, T5 `unspecified-high`
- **Wave 2**: 4 tasks — T6 `deep`, T7 `quick`, T8 `unspecified-high`, T9 `unspecified-high`
- **Wave 3**: 4 tasks — T10 `deep`, T11 `quick`, T12 `quick`, T13 `quick`
- **Wave 4**: 4 tasks — T14 `unspecified-high`, T15 `unspecified-high`, T16 `writing`, T17 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Define generic NotificationEnrichment type + enrichment adapter registry

  **What to do**:
  - Create `src/lib/types/notification-enrichment.ts` with:

    ```typescript
    export interface NotificationEnrichment {
      displayName?: string; // e.g. "Guest: Olivia" or "Schedule: Thornton 2026-05-11"
      contextUrl?: string; // e.g. Hostfully inbox link, or null
      subtitle?: string; // e.g. "Property: Casa del Sol" or "Location: Thornton"
      metadata?: Record<string, string>; // Additional key-value pairs for the Slack card
    }

    export type EnrichmentAdapter = (
      rawEvent: Record<string, unknown>,
      tenantSecrets: Record<string, string>,
    ) => Promise<NotificationEnrichment | null>;
    ```

  - Create `src/lib/enrichment-adapters/index.ts` as an adapter registry:
    ```typescript
    import type { EnrichmentAdapter } from '../types/notification-enrichment.js';
    const adapters: Record<string, EnrichmentAdapter> = {};
    export function registerAdapter(name: string, adapter: EnrichmentAdapter): void {
      adapters[name] = adapter;
    }
    export function getAdapter(name: string): EnrichmentAdapter | undefined {
      return adapters[name];
    }
    ```
  - Create `src/lib/enrichment-adapters/hostfully.ts` that wraps the existing `fetchLeadEnrichment()` function and returns a `NotificationEnrichment`:
    ```typescript
    import { fetchLeadEnrichment } from '../hostfully-enrichment.js';
    import { registerAdapter } from './index.js';
    registerAdapter('hostfully', async (rawEvent, tenantSecrets) => {
      const leadUid = rawEvent.lead_uid as string;
      const apiKey = tenantSecrets.HOSTFULLY_API_KEY;
      if (!leadUid || !apiKey) return null;
      const enrichment = await fetchLeadEnrichment(leadUid, apiKey);
      if (!enrichment) return null;
      return {
        displayName: enrichment.guestName ? `Guest: ${enrichment.guestName}` : undefined,
        contextUrl:
          enrichment.threadUid && enrichment.leadUid
            ? `https://platform.hostfully.com/app/#/inbox?threadUid=${enrichment.threadUid}&leadUid=${enrichment.leadUid}`
            : undefined,
        subtitle: enrichment.propertyName ? `Property: ${enrichment.propertyName}` : undefined,
        metadata: { checkIn: enrichment.checkIn || 'TBD', checkOut: enrichment.checkOut || 'TBD' },
      };
    });
    ```
  - Register the hostfully adapter at module load time (side-effect import in the lifecycle entry point)

  **Must NOT do**:
  - Do NOT import Hostfully-specific code at module level in `employee-lifecycle.ts`
  - Do NOT add employee-specific language to the generic types
  - Do NOT create adapters for employees that don't need enrichment (they just get `null`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small scope — 3 TypeScript files, pure type definitions and adapter wiring
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — straightforward TypeScript type + module work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/lib/hostfully-enrichment.ts` — Existing `fetchLeadEnrichment()` function that the Hostfully adapter wraps. Study its return type (`LeadEnrichment`) to map fields to the generic interface.
  - `src/lib/slack-blocks.ts:buildCompactNotifyBlocks()` — Current consumer of enrichment data. Study what fields it uses (`guestName`, `propertyName`, `threadUid`, `leadUid`, `checkIn`, `checkOut`) to ensure the generic interface covers all of them.
  - `src/inngest/employee-lifecycle.ts:220-234` — Where `fetchLeadEnrichment` is called today (inside `role_name === 'guest-messaging'` branch). This will be replaced by the adapter pattern in Task 6.

  **Acceptance Criteria**:
  - [ ] `src/lib/types/notification-enrichment.ts` exists and exports `NotificationEnrichment` and `EnrichmentAdapter` types
  - [ ] `src/lib/enrichment-adapters/index.ts` exists with `registerAdapter` and `getAdapter` exports
  - [ ] `src/lib/enrichment-adapters/hostfully.ts` exists and registers the hostfully adapter
  - [ ] `pnpm build` → exit 0

  **QA Scenarios**:

  ```
  Scenario: TypeScript compiles with new types
    Tool: Bash
    Preconditions: All 3 new files created
    Steps:
      1. Run `pnpm build`
      2. Check exit code
    Expected Result: exit 0, no TypeScript errors
    Failure Indicators: Type errors referencing notification-enrichment.ts
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: Adapter registry returns correct adapter
    Tool: Bash
    Preconditions: hostfully adapter registered
    Steps:
      1. Run `node -e "import('./src/lib/enrichment-adapters/hostfully.js').then(() => { const { getAdapter } = require('./src/lib/enrichment-adapters/index.js'); console.log(typeof getAdapter('hostfully')); })"`
      2. Or compile and test via a simple script
    Expected Result: Output is "function"
    Failure Indicators: Output is "undefined" or import error
    Evidence: .sisyphus/evidence/task-1-adapter-registry.txt
  ```

  **Commit**: YES
  - Message: `feat(platform): add generic NotificationEnrichment type and adapter registry`
  - Files: `src/lib/types/notification-enrichment.ts`, `src/lib/enrichment-adapters/index.ts`, `src/lib/enrichment-adapters/hostfully.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Prisma migration — add vm_size and enrichment_adapter to archetypes

  **What to do**:
  - Add two new fields to the `Archetype` model in `prisma/schema.prisma`:
    ```prisma
    vm_size             String?   // Per-archetype VM size override (e.g. 'shared-cpu-1x', 'shared-cpu-2x')
    enrichment_adapter  String?   // Name of enrichment adapter to use (e.g. 'hostfully', null for none)
    ```
  - Run `pnpm prisma migrate dev --name add-archetype-vm-size-and-enrichment-adapter`
  - Update `prisma/seed.ts` to set `enrichment_adapter: 'hostfully'` on the VLRE guest-messaging archetype (id `00000000-0000-0000-0000-000000000015`). Leave all other archetypes as `null`.
  - Update seed to NOT set `vm_size` on any existing archetypes (they use the env var default).

  **Must NOT do**:
  - Do NOT add `cron_expression` or trigger-related fields
  - Do NOT change any other archetype fields in the seed
  - Do NOT add default values in the schema that would affect existing behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single schema change + migration + small seed update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:
  - `prisma/schema.prisma:201-233` — Current Archetype model. Add the two new fields after `notification_channel`.
  - `prisma/seed.ts:3184-3343` — Archetype seed records. Find the VLRE guest-messaging archetype (id `...0015`) and add `enrichment_adapter: 'hostfully'`.

  **Acceptance Criteria**:
  - [ ] Migration file exists in `prisma/migrations/`
  - [ ] `pnpm prisma migrate deploy` → exit 0
  - [ ] `SELECT vm_size, enrichment_adapter FROM archetypes LIMIT 1` works
  - [ ] Guest-messaging archetype has `enrichment_adapter = 'hostfully'`

  **QA Scenarios**:

  ```
  Scenario: Migration applies successfully
    Tool: Bash
    Preconditions: Database running, no pending migrations
    Steps:
      1. Run `pnpm prisma migrate deploy`
      2. Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT id, enrichment_adapter FROM archetypes WHERE role_name = 'guest-messaging'"`
    Expected Result: Row shows enrichment_adapter = 'hostfully'
    Failure Indicators: Column not found error, or null value
    Evidence: .sisyphus/evidence/task-2-migration.txt

  Scenario: Schema compiles
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run `pnpm prisma generate`
      2. Run `pnpm build`
    Expected Result: Both exit 0
    Failure Indicators: Prisma client generation errors
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES
  - Message: `feat(schema): add vm_size and enrichment_adapter to archetypes`
  - Files: `prisma/schema.prisma`, `prisma/migrations/*/`, `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Trace target_channel / publish_channel data flow — document findings

  **What to do**:
  - This is a **research task** with no code changes. The output is a documented data flow that Task 8 will use.
  - Trace the full lifecycle of these three concepts:
    1. `notification_channel` — where "Task received" notification + approval card are posted
    2. `target_channel` / `SUMMARY_TARGET_CHANNEL` — where the lifecycle updates the approval card after approval
    3. `publish_channel` / `PUBLISH_CHANNEL` — where the final approved content is posted
  - Starting points to trace:
    - `src/gateway/services/tenant-env-loader.ts:62-85` — reads `config.summary.*` and injects env vars
    - `src/inngest/employee-lifecycle.ts` — search for `target_channel`, `SUMMARY_TARGET_CHANNEL`, `PUBLISH_CHANNEL`, `delivery_metadata`
    - `src/workers/opencode-harness.mts` — search for these env vars
    - `pending_approvals` table — check `delivery_metadata` column usage
  - Answer these questions:
    1. Does the lifecycle actually use `SUMMARY_TARGET_CHANNEL` from the env, or does it read from `pending_approvals.delivery_metadata`?
    2. Are the summarizer archetype's hardcoded channel IDs in `instructions` redundant with the env vars?
    3. Can `config.summary.*` be moved to archetype-level config without breaking the flow?
  - Write findings to `.sisyphus/notepads/target-channel-dataflow.md`

  **Must NOT do**:
  - Do NOT modify any code files — this is research only
  - Do NOT make assumptions — trace actual code paths

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful tracing across multiple files with understanding of data flow through Inngest step boundaries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - `src/gateway/services/tenant-env-loader.ts:62-85` — The summarizer-specific config reads to trace from
  - `src/inngest/employee-lifecycle.ts` — Search for `delivery_metadata`, `target_channel`, `NOTIFICATION_CHANNEL`
  - `prisma/schema.prisma` — Check `pending_approvals` model for `delivery_metadata` field

  **Acceptance Criteria**:
  - [ ] `.sisyphus/notepads/target-channel-dataflow.md` exists with complete data flow documentation
  - [ ] All 3 questions answered with file:line evidence

  **QA Scenarios**:

  ```
  Scenario: Data flow document is complete and actionable
    Tool: Bash
    Preconditions: Research completed
    Steps:
      1. Check `.sisyphus/notepads/target-channel-dataflow.md` exists
      2. Verify it contains answers to all 3 questions with file:line references
      3. Verify it includes a recommendation for Task 8
    Expected Result: Document exists with complete trace
    Failure Indicators: File missing, questions unanswered
    Evidence: .sisyphus/evidence/task-3-dataflow-doc.txt
  ```

  **Commit**: NO (research task, no code changes)

- [x] 4. Move HOSTFULLY_MOCK to VLRE tenant secrets

  **What to do**:
  - Remove `HOSTFULLY_MOCK` from the `PLATFORM_ENV_WHITELIST` in `tenant-env-loader.ts` (if present)
  - Remove `HOSTFULLY_MOCK` from the delivery machine env construction in `employee-lifecycle.ts` (lines ~1864, ~1881)
  - Add a note in `prisma/seed.ts` or a script to insert `HOSTFULLY_MOCK` as a `tenant_secrets` row for VLRE tenant (`00000000-0000-0000-0000-000000000003`) with value `'true'` (for local dev mock mode)
  - Since `tenant-env-loader.ts` auto-uppercases all tenant_secrets and injects them, storing `hostfully_mock: 'true'` in tenant_secrets will auto-inject as `HOSTFULLY_MOCK=true` for VLRE workers only
  - Update `.env.example` to remove `HOSTFULLY_MOCK` from the global section and add a comment noting it's now a tenant secret

  **Must NOT do**:
  - Do NOT break local dev mock mode for guest-messaging — the env var must still reach VLRE workers
  - Do NOT inject `HOSTFULLY_MOCK` into non-VLRE workers' environments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, surgical change across 2-3 files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `src/inngest/employee-lifecycle.ts:1864,1881` — Where `HOSTFULLY_MOCK` is injected into delivery machine env. Remove these lines.
  - `src/gateway/services/tenant-env-loader.ts` — Check if `HOSTFULLY_MOCK` is in `PLATFORM_ENV_WHITELIST`. If so, remove it.
  - `prisma/seed.ts` — Add tenant_secrets insert for VLRE. Follow the pattern of existing tenant_secrets seeding.

  **Acceptance Criteria**:
  - [ ] `grep -r "HOSTFULLY_MOCK" src/inngest/employee-lifecycle.ts` → 0 matches
  - [ ] VLRE workers still receive `HOSTFULLY_MOCK` via tenant_secrets injection
  - [ ] Non-VLRE workers do NOT receive `HOSTFULLY_MOCK`
  - [ ] `pnpm build` → exit 0

  **QA Scenarios**:

  ```
  Scenario: HOSTFULLY_MOCK removed from lifecycle
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Run `grep -c "HOSTFULLY_MOCK" src/inngest/employee-lifecycle.ts`
      2. Run `pnpm build`
    Expected Result: grep returns 0, build succeeds
    Failure Indicators: grep returns > 0
    Evidence: .sisyphus/evidence/task-4-hostfully-mock-removed.txt

  Scenario: VLRE tenant secret exists for HOSTFULLY_MOCK
    Tool: Bash
    Preconditions: Seed applied
    Steps:
      1. Run `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT key FROM tenant_secrets WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND key = 'hostfully_mock'"`
    Expected Result: One row returned
    Failure Indicators: Empty result
    Evidence: .sisyphus/evidence/task-4-tenant-secret.txt
  ```

  **Commit**: YES
  - Message: `fix(platform): scope HOSTFULLY_MOCK to VLRE tenant secrets`
  - Files: `src/inngest/employee-lifecycle.ts`, `prisma/seed.ts`, `.env.example`
  - Pre-commit: `pnpm build`

- [x] 5. Build generic buildNotifyBlocks() function in slack-blocks.ts

  **What to do**:
  - Add a new function `buildNotifyBlocks()` to `src/lib/slack-blocks.ts` that accepts:
    ```typescript
    function buildNotifyBlocks(params: {
      state: string; // e.g. 'Received', 'Executing', 'Failed', 'Done'
      archetypeName: string; // e.g. 'Guest Messaging', 'Daily Summarizer'
      taskId: string;
      enrichment?: NotificationEnrichment | null;
      emoji?: string; // state emoji (⏳, ✅, ❌, etc.)
      extraText?: string; // additional context line
    }): KnownBlock[];
    ```
  - The function builds Slack blocks that:
    - Always show: state emoji + archetype name + state (header)
    - Always show: task ID context block (per Slack Message Standards)
    - If `enrichment.displayName` present: show as a section field
    - If `enrichment.contextUrl` present: show as a linked text
    - If `enrichment.subtitle` present: show as a section field
    - If `enrichment.metadata` present: show as key-value fields
    - If `extraText` present: show as a section text
  - Move `buildHostfullyLink()` from `slack-blocks.ts` to `src/lib/enrichment-adapters/hostfully.ts` (it's only used to construct `contextUrl` now)
  - Keep existing `buildNotifyStateBlocks()` and `buildCompactNotifyBlocks()` temporarily — they will be removed in Task 6 after the lifecycle is refactored to use the new function

  **Must NOT do**:
  - Do NOT remove existing block builder functions yet (Task 6 handles the switchover)
  - Do NOT add employee-specific language to the generic builder
  - Do NOT change the Slack message format for the task ID context block

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Moderate complexity — must understand Slack Block Kit format, handle optional enrichment gracefully, and ensure backward compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1 (needs the NotificationEnrichment type)

  **References**:
  - `src/lib/slack-blocks.ts` — Existing file. Study `buildNotifyStateBlocks()` (the generic one) and `buildCompactNotifyBlocks()` (the guest-messaging one) to understand the current block formats. The new function must produce blocks that look at least as good as the existing generic one, and better when enrichment is provided.
  - `src/lib/types/notification-enrichment.ts` — The generic enrichment type from Task 1
  - `@slack/types` — KnownBlock types for Slack blocks

  **Acceptance Criteria**:
  - [ ] `buildNotifyBlocks()` exported from `slack-blocks.ts`
  - [ ] `buildHostfullyLink()` moved to `src/lib/enrichment-adapters/hostfully.ts`
  - [ ] `pnpm build` → exit 0
  - [ ] Existing block builder functions still exist (not yet removed)

  **QA Scenarios**:

  ```
  Scenario: Generic block builder produces valid blocks without enrichment
    Tool: Bash
    Preconditions: New function exists
    Steps:
      1. Run `pnpm build`
      2. Write a simple test script that calls buildNotifyBlocks({ state: 'Received', archetypeName: 'Test Employee', taskId: 'test-123' }) and logs the result
      3. Verify output is a valid KnownBlock[] with header and context blocks
    Expected Result: Array of Slack blocks with archetype name and task ID
    Failure Indicators: Empty array, missing taskId context block
    Evidence: .sisyphus/evidence/task-5-blocks-no-enrichment.txt

  Scenario: Generic block builder produces rich blocks with enrichment
    Tool: Bash
    Preconditions: New function exists
    Steps:
      1. Call buildNotifyBlocks({ state: 'Received', archetypeName: 'Guest Messaging', taskId: 'test-123', enrichment: { displayName: 'Guest: Olivia', contextUrl: 'https://example.com', subtitle: 'Property: Casa del Sol' } })
      2. Verify output includes displayName, contextUrl, and subtitle in the blocks
    Expected Result: Blocks include all enrichment fields
    Failure Indicators: Enrichment fields missing from output
    Evidence: .sisyphus/evidence/task-5-blocks-with-enrichment.txt
  ```

  **Commit**: YES
  - Message: `feat(platform): add generic buildNotifyBlocks replacing employee-specific builders`
  - Files: `src/lib/slack-blocks.ts`, `src/lib/enrichment-adapters/hostfully.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Refactor lifecycle — replace 10 notification block forks with generic enrichment

  **What to do**:
  - This is the core refactoring task. In `src/inngest/employee-lifecycle.ts`:
  - **Step 1**: Remove module-level Hostfully imports (lines ~13-14). These are `import { checkLastMessageSender }` and `import { fetchLeadEnrichment }`. The pre-check import stays (it's behind the `role_name === 'guest-messaging'` guard which we're keeping). For `fetchLeadEnrichment`, it's now called from the Hostfully adapter (Task 1).
  - **Step 2**: In the `notify-received` step (~line 220), replace the `role_name === 'guest-messaging'` branch with:
    ```typescript
    let enrichment: NotificationEnrichment | null = null;
    if (archetype.enrichment_adapter) {
      // Side-effect import to register adapters
      await import('../lib/enrichment-adapters/hostfully.js');
      const adapter = getAdapter(archetype.enrichment_adapter);
      if (adapter) {
        const secrets = /* get tenant secrets from env or context */;
        enrichment = await adapter(task.raw_event ?? {}, secrets);
      }
    }
    ```
  - **Step 3**: Replace all 10 notification block fork sites. At each of these locations, replace:
    ```typescript
    // Before:
    if (archetype.role_name === 'guest-messaging') {
      blocks = buildCompactNotifyBlocks(...);
    } else {
      blocks = buildNotifyStateBlocks(...);
    }
    // After:
    blocks = buildNotifyBlocks({ state, archetypeName, taskId, enrichment, emoji, extraText });
    ```
  - **Step 4**: Remove the `buildCompactNotifyBlocks()` calls entirely. After all 10 sites are converted, verify with grep that no references remain.
  - **Step 5**: Keep the pre-check guard (`role_name === 'guest-messaging'` at line ~152) — this is the ONE remaining role_name branch, which is explicitly kept per decision.
  - **Step 6**: Keep the nudge broadcast reply (`role_name === 'guest-messaging'` at line ~1415 for `track-pending-approval`) — convert this to check `enrichment_adapter` instead of `role_name`.

  **Must NOT do**:
  - Do NOT remove the pre-check guard at line ~152 — that stays
  - Do NOT change any business logic — only the notification block construction
  - Do NOT modify the approval card content (that's generated by the worker, not the lifecycle)
  - Do NOT touch `track-pending-approval` logic beyond the notification format

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Large refactor touching ~2400-line file at 10+ locations. Requires careful understanding of Inngest step boundaries, variable scoping, and backward compatibility.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential dependency on Wave 1)
  - **Blocks**: Tasks 9, 14
  - **Blocked By**: Tasks 1, 2, 4, 5

  **References**:
  - `src/inngest/employee-lifecycle.ts:13-14` — Module-level Hostfully imports to remove
  - `src/inngest/employee-lifecycle.ts:152` — Pre-check guard to KEEP (do not touch)
  - `src/inngest/employee-lifecycle.ts:220-234` — First enrichment call site (notify-received)
  - `src/inngest/employee-lifecycle.ts:714` — mark-failed block fork
  - `src/inngest/employee-lifecycle.ts:1355` — update-notify-reviewing block fork
  - `src/inngest/employee-lifecycle.ts:1415` — track-pending-approval nudge broadcast
  - `src/inngest/employee-lifecycle.ts:1569,1796,1938,2005,2068,2232` — Terminal state block forks (expiry, approve, delivery-fail, done, supersede, reject)
  - `src/lib/slack-blocks.ts:buildNotifyBlocks()` — The new generic builder from Task 5
  - `src/lib/enrichment-adapters/index.ts:getAdapter()` — Adapter registry from Task 1
  - `src/lib/types/notification-enrichment.ts` — Generic enrichment type from Task 1

  **Acceptance Criteria**:
  - [ ] `grep -c "buildCompactNotifyBlocks" src/inngest/employee-lifecycle.ts` → 0
  - [ ] `grep -c "role_name.*guest-messaging" src/inngest/employee-lifecycle.ts` → 1 (only pre-check)
  - [ ] `grep -c "enrichment_adapter" src/inngest/employee-lifecycle.ts` → 2+ (notify-received + nudge broadcast)
  - [ ] `grep -n "^import.*hostfully" src/inngest/employee-lifecycle.ts` → 0 (no module-level Hostfully imports)
  - [ ] `pnpm build` → exit 0
  - [ ] `pnpm test -- --run` → no new failures

  **QA Scenarios**:

  ```
  Scenario: No role_name notification forks remain
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. Run `grep -n "role_name.*guest-messaging" src/inngest/employee-lifecycle.ts`
      2. Verify exactly 1 match (the pre-check guard)
      3. Run `grep -c "buildCompactNotifyBlocks" src/inngest/employee-lifecycle.ts`
      4. Verify 0 matches
    Expected Result: 1 role_name match (pre-check only), 0 buildCompactNotifyBlocks matches
    Failure Indicators: More than 1 role_name match, or any buildCompactNotifyBlocks reference
    Evidence: .sisyphus/evidence/task-6-grep-audit.txt

  Scenario: Build and tests pass after refactor
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run `pnpm build`
      2. Run `pnpm test -- --run`
    Expected Result: Both exit 0, 515+ tests pass
    Failure Indicators: Build errors or test failures referencing lifecycle
    Evidence: .sisyphus/evidence/task-6-build-test.txt
  ```

  **Commit**: YES
  - Message: `refactor(lifecycle): replace role_name notification forks with generic enrichment`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build && pnpm test -- --run`

- [x] 7. Fix env var naming — WORKER_VM_SIZE + FLY_WORKER_APP primary

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`:
  - **VM size**: Replace all occurrences of the VM size fallback chain with:
    ```typescript
    const vmSize =
      archetype.vm_size ??
      process.env.WORKER_VM_SIZE ??
      process.env.SUMMARIZER_VM_SIZE ?? // deprecated fallback
      'shared-cpu-1x';
    ```
    This occurs at lines ~457 and ~1834. The `archetype.vm_size` field was added in Task 2.
  - **Fly app**: Replace all 6 occurrences of the Fly app fallback chain (lines ~460, ~751, ~824, ~870, ~1838, ~2388) with:
    ```typescript
    process.env.FLY_WORKER_APP ?? process.env.FLY_SUMMARIZER_APP ?? 'ai-employee-workers';
    ```
    Note: current code has `FLY_SUMMARIZER_APP` as PRIMARY. This fix swaps the priority to `FLY_WORKER_APP` primary, `FLY_SUMMARIZER_APP` deprecated fallback.
  - Update `.env.example`:
    - Add `WORKER_VM_SIZE` with a comment: `# VM size for all employee workers (default: shared-cpu-1x)`
    - Add deprecation note next to `SUMMARIZER_VM_SIZE`: `# DEPRECATED — use WORKER_VM_SIZE instead`
    - Ensure `FLY_WORKER_APP` is documented as primary
    - Add deprecation note next to `FLY_SUMMARIZER_APP`: `# DEPRECATED — use FLY_WORKER_APP instead`

  **Must NOT do**:
  - Do NOT remove `SUMMARIZER_VM_SIZE` or `FLY_SUMMARIZER_APP` — keep as deprecated fallbacks for backward compat
  - Do NOT change the default value (`shared-cpu-1x` for VM, `ai-employee-workers` for Fly app)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical search-and-replace at known line numbers
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9)
  - **Blocks**: Task 15
  - **Blocked By**: Task 2 (needs `vm_size` field on archetype)

  **References**:
  - `src/inngest/employee-lifecycle.ts:457,1834` — VM size reads to update
  - `src/inngest/employee-lifecycle.ts:460,751,824,870,1838,2388` — Fly app reads to update
  - `.env.example` — Env var documentation to update

  **Acceptance Criteria**:
  - [ ] `grep -c "WORKER_VM_SIZE" src/inngest/employee-lifecycle.ts` → 2+ (primary in fallback chain)
  - [ ] `grep -c "FLY_WORKER_APP" src/inngest/employee-lifecycle.ts` → 6+ (primary in all chains)
  - [ ] `pnpm build` → exit 0

  **QA Scenarios**:

  ```
  Scenario: FLY_WORKER_APP is primary in every fallback chain
    Tool: Bash
    Preconditions: Changes applied
    Steps:
      1. Run `grep -n "FLY_WORKER_APP\|FLY_SUMMARIZER_APP" src/inngest/employee-lifecycle.ts`
      2. For each line, verify FLY_WORKER_APP appears before FLY_SUMMARIZER_APP in the ?? chain
    Expected Result: Every fallback chain has FLY_WORKER_APP ?? FLY_SUMMARIZER_APP order
    Failure Indicators: Any line with FLY_SUMMARIZER_APP before FLY_WORKER_APP
    Evidence: .sisyphus/evidence/task-7-env-var-order.txt
  ```

  **Commit**: YES
  - Message: `refactor(platform): rename SUMMARIZER_VM_SIZE to WORKER_VM_SIZE with backward compat`
  - Files: `src/inngest/employee-lifecycle.ts`, `.env.example`
  - Pre-commit: `pnpm build`

- [x] 8. Clean up tenant-env-loader.ts — generic config reads

  **What to do**:
  - Read the findings from Task 3 (`.sisyphus/notepads/target-channel-dataflow.md`) FIRST
  - Based on those findings, refactor `src/gateway/services/tenant-env-loader.ts` to make config reads generic
  - The current code at lines ~62-85 reads `config.summary.target_channel`, `config.summary.publish_channel`, `config.summary.channel_ids` and creates summarizer-specific env vars (`DAILY_SUMMARY_CHANNELS`, `SUMMARY_TARGET_CHANNEL`, `PUBLISH_CHANNEL`)
  - The goal: either (a) move these to a pattern where any archetype can provide config keys → env vars via a generic mechanism, or (b) if the data flow investigation (Task 3) shows these env vars are redundant (because the summarizer instructions hardcode the channel IDs), remove them
  - Whatever approach is taken, the summarizer must continue to work identically (backward compat)

  **Must NOT do**:
  - Do NOT break the summarizer's post-approval card update flow
  - Do NOT remove env vars that are actively consumed by the worker without confirming redundancy
  - Do NOT change `tenant-env-loader.ts` without reading Task 3's findings first

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding the data flow from Task 3 and making a judgment call on what's safe to change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9)
  - **Blocks**: Task 15
  - **Blocked By**: Task 3 (needs data flow findings)

  **References**:
  - `.sisyphus/notepads/target-channel-dataflow.md` — Data flow findings from Task 3 (READ FIRST)
  - `src/gateway/services/tenant-env-loader.ts:62-85` — The summarizer-specific config reads to refactor
  - `src/inngest/employee-lifecycle.ts` — Search for `delivery_metadata` to understand how target_channel flows through the lifecycle

  **Acceptance Criteria**:
  - [ ] No `config.summary` hardcoded key paths remain in `tenant-env-loader.ts`
  - [ ] Summarizer worker still receives necessary channel env vars
  - [ ] `pnpm build` → exit 0

  **QA Scenarios**:

  ```
  Scenario: Tenant env loader has no summarizer-specific config keys
    Tool: Bash
    Preconditions: Changes applied
    Steps:
      1. Run `grep -c "config.summary\|DAILY_SUMMARY" src/gateway/services/tenant-env-loader.ts`
    Expected Result: 0 matches (or matches are behind a generic config pattern)
    Failure Indicators: Hardcoded `config.summary` key paths remain
    Evidence: .sisyphus/evidence/task-8-generic-loader.txt
  ```

  **Commit**: YES
  - Message: `refactor(platform): generalize tenant-env-loader config reads`
  - Files: `src/gateway/services/tenant-env-loader.ts`
  - Pre-commit: `pnpm build`

- [x] 9. Clean up opencode-harness.mts — extract delivery pre-parse to adapter

  **What to do**:
  - In `src/workers/opencode-harness.mts` at lines ~437-498, there's a `role_name === 'guest-messaging'` branch that pre-parses the deliverable JSON to extract `leadUid`/`threadUid` and constructs the exact `send-message.ts` shell command
  - Extract this logic into a delivery adapter pattern:
    1. Create `src/workers/lib/delivery-adapters/index.mts` with:
       ```typescript
       export type DeliveryPreProcessor = (deliverable: string) => string;
       const adapters: Record<string, DeliveryPreProcessor> = {};
       export function registerDeliveryAdapter(name: string, fn: DeliveryPreProcessor) {
         adapters[name] = fn;
       }
       export function getDeliveryAdapter(name: string): DeliveryPreProcessor | undefined {
         return adapters[name];
       }
       ```
    2. Create `src/workers/lib/delivery-adapters/guest-messaging.mts` that contains the extracted pre-parse logic
    3. In the harness, replace the `role_name` branch with:
       ```typescript
       if (archetype.enrichment_adapter) {
         await import('./lib/delivery-adapters/guest-messaging.mjs');
         const adapter = getDeliveryAdapter(archetype.enrichment_adapter);
         if (adapter) deliverableContent = adapter(deliverableContent);
       }
       ```
  - Note: we reuse `enrichment_adapter` as the key for delivery adapters too, since the concepts are correlated (an employee with Hostfully enrichment also needs Hostfully delivery pre-parsing). If this coupling becomes a problem, a separate `delivery_adapter` field can be added later.

  **Must NOT do**:
  - Do NOT change the actual delivery pre-parse logic — only move it
  - Do NOT break guest-messaging delivery
  - Do NOT modify the `/tmp/summary.txt` output contract

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Must understand the harness flow, extract logic cleanly, and maintain the exact same behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Task 13
  - **Blocked By**: Task 6 (needs lifecycle refactored first to establish the adapter pattern)

  **References**:
  - `src/workers/opencode-harness.mts:437-498` — The delivery pre-parse to extract. Study what it does: parses JSON deliverable, extracts leadUid/threadUid/draftResponse, builds `send-message.ts` command string.
  - `src/lib/enrichment-adapters/index.ts` — Follow the same adapter pattern established in Task 1

  **Acceptance Criteria**:
  - [ ] `grep -c "role_name.*guest-messaging" src/workers/opencode-harness.mts` → 0
  - [ ] `src/workers/lib/delivery-adapters/guest-messaging.mts` exists
  - [ ] `pnpm build` → exit 0

  **QA Scenarios**:

  ```
  Scenario: No role_name check in harness
    Tool: Bash
    Preconditions: Extraction complete
    Steps:
      1. Run `grep -c "role_name.*guest-messaging" src/workers/opencode-harness.mts`
      2. Run `pnpm build`
    Expected Result: 0 matches, build succeeds
    Failure Indicators: role_name reference found
    Evidence: .sisyphus/evidence/task-9-harness-cleanup.txt
  ```

  **Commit**: YES
  - Message: `refactor(harness): extract guest-messaging delivery pre-parse to adapter`
  - Files: `src/workers/opencode-harness.mts`, `src/workers/lib/delivery-adapters/index.mts`, `src/workers/lib/delivery-adapters/guest-messaging.mts`
  - Pre-commit: `pnpm build`

- [x] 10. Research and select external cron service

  **What to do**:
  - This is a **research task**. Evaluate external cron services that can trigger employees via the admin API endpoint.
  - Requirements for the service:
    1. Can make authenticated HTTP POST requests (with `X-Admin-Key` header)
    2. Supports timezone-aware cron scheduling (e.g., "2am Mountain Time")
    3. Reliable (99.9%+ uptime)
    4. Simple to configure per-employee (one cron job per employee schedule)
    5. Low/no cost for <10 cron jobs
    6. Supports JSON body in POST requests
  - Evaluate these options:
    1. **cron-job.org** — free tier (up to 60 jobs), timezone support, HTTP with headers/body
    2. **EasyCron** — free tier (1 job), paid for more, timezone support
    3. **Cronhooks.io** — simple webhook scheduling
    4. **GitHub Actions scheduled workflows** — free, YAML config, can make HTTP calls via `curl`
    5. **Pipedream** — free tier, cron + HTTP steps
    6. **Fly.io Machines with scheduled start** — already on Fly, but limited cron support
  - For each option, document: pricing, timezone support, header support, reliability, configuration complexity
  - **Recommend one** with rationale
  - Write findings to `.sisyphus/notepads/external-cron-evaluation.md`
  - The recommendation must include the exact configuration needed for both existing employees:
    - Daily-summarizer: `0 8 * * 1-5` UTC (8am UTC weekdays)
    - Guest-message-poll: `*/15 * * * *` UTC (every 15 min, all days)

  **Must NOT do**:
  - Do NOT sign up for or configure any service — research only
  - Do NOT create new Inngest functions

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires web research, comparison analysis, and a clear recommendation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (can start as soon as Wave 2 is done, or even earlier since it's pure research)
  - **Blocks**: Tasks 11, 12
  - **Blocked By**: None (pure research, but placed in Wave 3 for logical grouping)

  **References**:
  - `src/gateway/routes/admin-employee-trigger.ts` — The admin trigger endpoint that external cron will call. Study its request format, authentication, and response.
  - `src/inngest/triggers/summarizer-trigger.ts` — Current summarizer cron config to migrate
  - `src/inngest/triggers/guest-message-poll.ts` — Current guest-message-poll cron config to migrate

  **Acceptance Criteria**:
  - [ ] `.sisyphus/notepads/external-cron-evaluation.md` exists with comparison table
  - [ ] One service recommended with rationale
  - [ ] Exact cron configurations documented for both existing employees
  - [ ] Configuration includes the full HTTP request (URL, method, headers, body)

  **QA Scenarios**:

  ```
  Scenario: Evaluation document is actionable
    Tool: Bash
    Preconditions: Research completed
    Steps:
      1. Verify `.sisyphus/notepads/external-cron-evaluation.md` exists
      2. Check it contains a comparison table with at least 4 services evaluated
      3. Check it contains a clear recommendation
      4. Check it contains exact HTTP request configs for both employees
    Expected Result: Complete, actionable evaluation
    Failure Indicators: Missing comparison table, no recommendation, no configs
    Evidence: .sisyphus/evidence/task-10-cron-eval.txt
  ```

  **Commit**: NO (research task)

- [x] 11. Set up external cron for daily-summarizer

  **What to do**:
  - Using the service recommended in Task 10, configure a cron job for the daily-summarizer
  - The cron job must call:
    ```
    POST https://<gateway-url>/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger
    Headers: X-Admin-Key: <admin_api_key>, Content-Type: application/json
    Body: {}
    Schedule: 0 8 * * 1-5 (8am UTC, weekdays)
    ```
  - Also configure for VLRE tenant if applicable:
    ```
    POST https://<gateway-url>/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-summarizer/trigger
    ```
  - Document the configuration in `.sisyphus/notepads/external-cron-configs.md`
  - Note: the actual gateway URL depends on deployment (local: `http://localhost:7700`, production: the Fly.io or Cloudflare tunnel URL). Document both.

  **Must NOT do**:
  - Do NOT delete the old Inngest trigger file yet (Task 13 handles cleanup)
  - Do NOT modify any code files — this is pure service configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuring an external service following Task 10's instructions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 12)
  - **Blocks**: Task 13
  - **Blocked By**: Task 10

  **References**:
  - `.sisyphus/notepads/external-cron-evaluation.md` — Service choice and configuration template from Task 10
  - `src/gateway/routes/admin-employee-trigger.ts` — Endpoint being called

  **Acceptance Criteria**:
  - [ ] External cron job configured and documented
  - [ ] Test trigger fires successfully (verify via gateway logs or task creation)

  **QA Scenarios**:

  ```
  Scenario: External cron triggers daily-summarizer
    Tool: Bash
    Preconditions: External cron configured, gateway running
    Steps:
      1. Manually trigger the cron job (or wait for it to fire)
      2. Check gateway logs for the trigger request
      3. Verify a task was created in the DB
    Expected Result: Task created with status 'Received' for daily-summarizer
    Failure Indicators: No task created, 401 auth error, 404 not found
    Evidence: .sisyphus/evidence/task-11-cron-summarizer.txt
  ```

  **Commit**: NO (external service config, but document in `.sisyphus/notepads/`)

- [x] 12. Set up external cron for guest-message-poll

  **What to do**:
  - Using the service recommended in Task 10, configure a cron job for guest-message-poll
  - **Important**: The guest-message-poll is NOT the same as triggering the guest-messaging employee. The poll function queries Hostfully for ALL unresponded messages across all leads, then creates tasks for each one. This polling logic must be preserved.
  - Two options:
    1. **If the poll logic can be moved to the worker**: Configure the cron to trigger a `guest-message-poller` archetype that runs the polling logic inside OpenCode. This requires a new archetype and shell tool.
    2. **If the poll logic stays as an Inngest function**: The external cron calls a new endpoint that fires `trigger/guest-message-poll` events. This means the Inngest function stays but is triggered externally instead of by Inngest's built-in cron.
  - **Recommended approach**: Option 2 is simpler and doesn't require new infrastructure. The Inngest function already exists — just change its trigger from `cron` to `event` (e.g., `trigger/guest-message-poll.requested`) and have the external cron fire that event.
  - Document the configuration in `.sisyphus/notepads/external-cron-configs.md`

  **Must NOT do**:
  - Do NOT break the polling logic — every unresponded message must still be found
  - Do NOT create a new archetype for polling (that's over-engineering for this plan)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration task following established pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 10

  **References**:
  - `.sisyphus/notepads/external-cron-evaluation.md` — Service choice from Task 10
  - `src/inngest/triggers/guest-message-poll.ts` — Current polling logic. Study what it does: queries all archetypes with `role_name=guest-messaging`, then for each tenant calls Hostfully API to find unresponded messages, creates tasks for each.

  **Acceptance Criteria**:
  - [ ] External cron job configured and documented
  - [ ] Guest-message-poll fires on schedule (or can be manually triggered)
  - [ ] Polling logic is preserved (all unresponded messages are found)

  **QA Scenarios**:

  ```
  Scenario: External cron triggers guest-message-poll
    Tool: Bash
    Preconditions: External cron configured, gateway running
    Steps:
      1. Manually fire the cron job
      2. Check Inngest dashboard for guest-message-poll event
      3. Verify the poll ran successfully (check function output)
    Expected Result: Poll executes and creates tasks for unresponded messages (if any)
    Failure Indicators: No event fired, poll function errors
    Evidence: .sisyphus/evidence/task-12-cron-poll.txt
  ```

  **Commit**: NO (external service config)

- [x] 13. Clean up dead Inngest trigger files + update serve.ts

  **What to do**:
  - Remove the cron trigger definitions from the deregistered Inngest functions:
    - `src/inngest/triggers/summarizer-trigger.ts` — either delete entirely or convert from `cron` trigger to `event` trigger (if keeping as an event-triggered function for the external cron to call)
    - `src/inngest/triggers/guest-message-poll.ts` — same treatment
  - Update `src/gateway/inngest/serve.ts`:
    - Remove imports for deleted trigger files
    - Remove them from the `functions: [...]` array
    - If converting to event-triggered, update the function definitions
  - **Decision**: If Task 12 chose Option 2 (keep poll as event-triggered Inngest function), then `guest-message-poll.ts` gets its `cron` trigger removed but stays registered with an `event` trigger. If Task 12 chose Option 1, it gets deleted entirely.
  - For `summarizer-trigger.ts`: since the admin API trigger already works for manual triggering, and the external cron will call the admin API, this file can be deleted entirely.
  - Update the Inngest functions list comment in `serve.ts` to reflect what's registered

  **Must NOT do**:
  - Do NOT touch `feedback-summarizer.ts` or `reviewing-watchdog.ts` — these are platform-level, not per-employee
  - Do NOT touch `learned-rules-expiry.ts` — already deregistered, leave as-is
  - Do NOT remove any function that's still actively running

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: File deletion + import cleanup in serve.ts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 11, 12 completing first)
  - **Parallel Group**: Wave 3 (sequential after 11, 12)
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 9, 11, 12

  **References**:
  - `src/inngest/triggers/summarizer-trigger.ts` — File to delete or convert
  - `src/inngest/triggers/guest-message-poll.ts` — File to delete or convert
  - `src/gateway/inngest/serve.ts` — Function registration to update. Find the `functions: [...]` array and remove/update entries.

  **Acceptance Criteria**:
  - [ ] Deleted trigger files no longer exist (or are converted to event-triggered)
  - [ ] `serve.ts` compiles with updated imports
  - [ ] `pnpm build` → exit 0
  - [ ] No Inngest function registration errors at gateway startup

  **QA Scenarios**:

  ```
  Scenario: Gateway starts without Inngest errors
    Tool: Bash
    Preconditions: Files cleaned up, serve.ts updated
    Steps:
      1. Run `pnpm build`
      2. Start gateway briefly and check for Inngest registration errors
    Expected Result: Build succeeds, no Inngest function registration errors
    Failure Indicators: Import errors, missing function references
    Evidence: .sisyphus/evidence/task-13-cleanup.txt
  ```

  **Commit**: YES (groups with 11, 12)
  - Message: `feat(triggers): migrate cron triggers to external service, remove dead Inngest files`
  - Files: `src/inngest/triggers/*.ts`, `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

- [x] 14. Write tests for enrichment interface + generic block builder

  **What to do**:
  - Create `tests/lib/enrichment-adapters.test.ts`:
    - Test `registerAdapter` / `getAdapter` — register, retrieve, retrieve unknown
    - Test the Hostfully adapter — mock `fetchLeadEnrichment`, verify it returns correct `NotificationEnrichment` shape
    - Test adapter with missing data — no leadUid, no apiKey → returns null
  - Create or update `tests/lib/slack-blocks.test.ts`:
    - Test `buildNotifyBlocks` with no enrichment → basic blocks with archetype name + task ID
    - Test `buildNotifyBlocks` with full enrichment → blocks include displayName, contextUrl, subtitle
    - Test `buildNotifyBlocks` with partial enrichment → only present fields rendered
    - Test that every block array includes the task ID context block (per Slack Message Standards)
  - Run full test suite to confirm no regressions

  **Must NOT do**:
  - Do NOT modify production code — tests only
  - Do NOT write tests for deprecated/unchanged code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple test files, mock setup, understanding of both enrichment and Slack block contracts
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 15)
  - **Blocks**: Task 15
  - **Blocked By**: Task 6 (needs the enrichment + block builder implemented)

  **References**:
  - `tests/lib/slack-blocks.test.ts` — Existing test file for slack-blocks (may already exist, check first). Note: LSP shows errors in this file — check if they're pre-existing.
  - `src/lib/enrichment-adapters/index.ts` — Module under test
  - `src/lib/enrichment-adapters/hostfully.ts` — Adapter under test
  - `src/lib/slack-blocks.ts:buildNotifyBlocks()` — Function under test

  **Acceptance Criteria**:
  - [ ] Test files created
  - [ ] `pnpm test -- --run` → all new tests pass
  - [ ] No regressions in existing tests

  **QA Scenarios**:

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. Run `pnpm test -- --run tests/lib/enrichment-adapters.test.ts tests/lib/slack-blocks.test.ts`
    Expected Result: All tests pass
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-14-tests.txt
  ```

  **Commit**: YES
  - Message: `test(platform): add tests for enrichment interface and generic block builder`
  - Files: `tests/lib/enrichment-adapters.test.ts`, `tests/lib/slack-blocks.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 15. Run full regression suite + fix any breakage

  **What to do**:
  - Run the full test and build pipeline:
    ```bash
    pnpm build
    pnpm lint
    pnpm test -- --run
    ```
  - Fix any regressions introduced by Tasks 1-14
  - Verify the TypeScript compilation has zero errors
  - Check for any LSP diagnostics in modified files
  - Run `grep -r "role_name.*guest-messaging" src/` to verify the only remaining reference is the pre-check in `employee-lifecycle.ts`
  - Run `grep -r "SUMMARIZER_VM_SIZE\|FLY_SUMMARIZER_APP" src/` to verify these only appear as deprecated fallbacks

  **Must NOT do**:
  - Do NOT fix pre-existing test failures (`container-boot.test.ts`, `inngest-serve.test.ts`)
  - Do NOT introduce new features — only fix regressions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: May require debugging across multiple files to resolve regressions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, after all implementation)
  - **Blocks**: Task 16
  - **Blocked By**: Tasks 7, 8, 13, 14

  **References**:
  - All files modified in Tasks 1-14

  **Acceptance Criteria**:
  - [ ] `pnpm build` → exit 0
  - [ ] `pnpm lint` → exit 0
  - [ ] `pnpm test -- --run` → 515+ passing, 0 new failures
  - [ ] `grep -c "role_name.*guest-messaging" src/inngest/employee-lifecycle.ts` → 1

  **QA Scenarios**:

  ```
  Scenario: Full pipeline passes
    Tool: Bash
    Preconditions: All tasks complete
    Steps:
      1. Run `pnpm build`
      2. Run `pnpm lint`
      3. Run `pnpm test -- --run`
    Expected Result: All three pass
    Failure Indicators: Any non-zero exit code
    Evidence: .sisyphus/evidence/task-15-regression.txt
  ```

  **Commit**: YES (if fixes needed)
  - Message: `fix: resolve any regression issues from platform generalization`
  - Files: varies
  - Pre-commit: `pnpm test -- --run`

- [x] 16. Update AGENTS.md + .env.example + docs

  **What to do**:
  - Update `AGENTS.md`:
    - **"Adding a new employee" section**: Rewrite to reflect the new process:
      1. Seed archetype record with `role_name`, `system_prompt`, `instructions`, `model`, `risk_model`, `enrichment_adapter` (optional), `vm_size` (optional), `notification_channel`
      2. If shell tools needed, add to `src/worker-tools/` and rebuild Docker image
      3. Configure external cron job to call admin API trigger endpoint
      4. (No new Inngest function file needed)
    - **Env var section**: Update `SUMMARIZER_VM_SIZE` → `WORKER_VM_SIZE` (note deprecated alias). Update `FLY_SUMMARIZER_APP` → `FLY_WORKER_APP` (note deprecated alias). Remove `HOSTFULLY_MOCK` from global vars.
    - **Inngest functions section**: Update to reflect removed/converted trigger functions
    - **Remove any mentions of `trigger_sources`, `tool_registry` being "used at runtime"** — they are documentation metadata only
  - Update `.env.example`:
    - Ensure `WORKER_VM_SIZE` and `FLY_WORKER_APP` are documented as primary
    - Add deprecation comments for `SUMMARIZER_VM_SIZE` and `FLY_SUMMARIZER_APP`
    - Remove `HOSTFULLY_MOCK` from global section (it's now a tenant secret)

  **Must NOT do**:
  - Do NOT rewrite AGENTS.md from scratch — targeted updates only
  - Do NOT change docs/snapshots/\* files (point-in-time records)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation update requiring clear, accurate technical writing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, after regression fixes)
  - **Blocks**: Task 17
  - **Blocked By**: Task 15

  **References**:
  - `AGENTS.md` — Current content, find "Adding a new employee" section and env var sections
  - `.env.example` — Current env var documentation

  **Acceptance Criteria**:
  - [ ] "Adding a new employee" section updated with new process
  - [ ] Env var deprecation notes added
  - [ ] No stale references to removed trigger files

  **QA Scenarios**:

  ```
  Scenario: AGENTS.md reflects current system state
    Tool: Bash
    Preconditions: Docs updated
    Steps:
      1. Run `grep -c "summarizer-trigger.ts" AGENTS.md` — should be 0 or marked as removed
      2. Run `grep "WORKER_VM_SIZE" AGENTS.md` — should mention it as primary
      3. Run `grep "Adding a new employee" AGENTS.md` — should mention external cron
    Expected Result: All checks pass
    Failure Indicators: Stale references to removed files
    Evidence: .sisyphus/evidence/task-16-docs.txt
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md and .env.example for platform generalization`
  - Files: `AGENTS.md`, `.env.example`
  - Pre-commit: —

- [x] 17. Send Telegram notification that plan is complete

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "✅ platform-generalization complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Blocked By**: Task 16

  **Acceptance Criteria**:
  - [ ] Telegram notification sent

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for patterns, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no employee-specific language in shared files.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
      Execute full E2E for both existing employees:
  - Guest-messaging: Airbnb message → webhook → lifecycle → worker → approval card → approve → reply sent. Verify rich notification blocks still show guest name + property.
  - Summarizer: Admin API trigger → lifecycle → worker → approval card → approve → published. Verify notification blocks show archetype info.
    Save to `.sisyphus/evidence/final-qa/`.
    Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Verify no changes to protected files (feedback-summarizer, reviewing-watchdog, rule-extractor, interaction-handler, hostfully-precheck, worker-tools). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task(s) | Commit Message                                                                         | Files                                                            | Pre-commit                         |
| ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| 1       | `feat(platform): add generic NotificationEnrichment type and adapter registry`         | `src/lib/types/notification-enrichment.ts`                       | `pnpm build`                       |
| 2       | `feat(schema): add vm_size and enrichment_adapter to archetypes`                       | `prisma/schema.prisma`, `prisma/migrations/*/`, `prisma/seed.ts` | `pnpm build`                       |
| 3       | (no commit — research/documentation task)                                              | —                                                                | —                                  |
| 4       | `fix(platform): scope HOSTFULLY_MOCK to VLRE tenant secrets`                           | `src/inngest/employee-lifecycle.ts`, `prisma/seed.ts`            | `pnpm build`                       |
| 5       | `feat(platform): add generic buildNotifyBlocks replacing employee-specific builders`   | `src/lib/slack-blocks.ts`                                        | `pnpm build`                       |
| 6       | `refactor(lifecycle): replace role_name notification forks with generic enrichment`    | `src/inngest/employee-lifecycle.ts`                              | `pnpm build && pnpm test -- --run` |
| 7       | `refactor(platform): rename SUMMARIZER_VM_SIZE to WORKER_VM_SIZE with backward compat` | `src/inngest/employee-lifecycle.ts`, `.env.example`              | `pnpm build`                       |
| 8       | `refactor(platform): generalize tenant-env-loader config reads`                        | `src/gateway/services/tenant-env-loader.ts`                      | `pnpm build`                       |
| 9       | `refactor(harness): extract guest-messaging delivery pre-parse to adapter`             | `src/workers/opencode-harness.mts`                               | `pnpm build`                       |
| 10      | (no commit — research task)                                                            | —                                                                | —                                  |
| 11-13   | `feat(triggers): migrate cron triggers to external service, remove dead Inngest files` | `src/inngest/triggers/*.ts`, `src/gateway/inngest/serve.ts`      | `pnpm build`                       |
| 14      | `test(platform): add tests for enrichment interface and generic block builder`         | `tests/enrichment.test.ts`, `tests/slack-blocks.test.ts`         | `pnpm test -- --run`               |
| 15      | `fix: resolve any regression issues from platform generalization`                      | varies                                                           | `pnpm test -- --run`               |
| 16      | `docs: update AGENTS.md and .env.example for platform generalization`                  | `AGENTS.md`, `.env.example`                                      | —                                  |

---

## Success Criteria

### Verification Commands

```bash
# Zero guest-messaging role_name branches in lifecycle (except pre-check)
grep -c "role_name.*guest-messaging" src/inngest/employee-lifecycle.ts
# Expected: 1 (only the pre-check on line ~152)

# Zero guest-messaging role_name branches in harness
grep -c "role_name.*guest-messaging" src/workers/opencode-harness.mts
# Expected: 0

# No Hostfully module-level imports in lifecycle
grep -n "^import.*hostfully" src/inngest/employee-lifecycle.ts
# Expected: 0 matches

# TypeScript compiles
pnpm build
# Expected: exit 0

# All tests pass
pnpm test -- --run
# Expected: 515+ passing

# New archetype fields exist
pnpm prisma migrate status
# Expected: all migrations applied

# WORKER_VM_SIZE is primary
grep -n "WORKER_VM_SIZE" src/inngest/employee-lifecycle.ts
# Expected: appears before SUMMARIZER_VM_SIZE in fallback chain

# FLY_WORKER_APP is primary
grep -n "FLY_WORKER_APP" src/inngest/employee-lifecycle.ts
# Expected: appears before FLY_SUMMARIZER_APP in fallback chain
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Guest-messaging E2E verified
- [ ] Summarizer E2E verified
- [ ] AGENTS.md updated
- [ ] .env.example updated
