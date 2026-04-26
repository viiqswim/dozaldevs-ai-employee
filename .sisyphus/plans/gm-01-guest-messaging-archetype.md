# GM-01: Guest Messaging Archetype Record

## TL;DR

> **Quick Summary**: Seed a new `guest-messaging` archetype for the VLRE tenant in `prisma/seed.ts`, following the exact `daily-summarizer` pattern, then verify with automated tests and API dry-run.
>
> **Deliverables**:
>
> - New archetype upsert in `prisma/seed.ts` (slug: `guest-messaging`, VLRE tenant)
> - New test file `tests/gateway/seed-guest-messaging.test.ts` (seed verification + integration trigger)
> - GM-01 acceptance criteria marked `[x]` in story map
>
> **Estimated Effort**: Quick (hours)
> **Parallel Execution**: YES — 2 waves + final verification
> **Critical Path**: Task 1 (seed) → Task 2 (tests) → Task 3 (story-map update)

---

## Context

### Original Request

Create the GM-01 Guest Messaging Archetype Record as defined in `docs/2026-04-21-2202-phase1-story-map.md`. Test thoroughly via automated tests and API endpoint verification. Mark acceptance criteria as completed in the story map.

### Interview Summary

**Key Discussions**:

- **Tenant scope**: VLRE only (not DozalDevs) — matches story acceptance criteria
- **System prompt/instructions**: Placeholder values only — GM-02 is a separate story for real content
- **Test strategy**: Tests-after (not TDD). New test file, don't modify existing passing tests.

**Research Findings**:

- Archetype upsert uses `(prisma.archetype as any).upsert()` because fields added via raw migration
- Upsert by UUID ID, `tenant_id` in `create` block only (immutable)
- Unique constraint: `@@unique([tenant_id, role_name])` — same role_name OK across tenants
- Test patterns: `tests/gateway/migration-agents-md.test.ts` (seed verification via `$queryRaw`), `tests/gateway/integration/manual-trigger.integration.test.ts` (dispatcher integration)
- No `tool_config` field — it's `tool_registry` (Json type)
- Existing tool paths use `.ts` extension (PLAT-01 tsx migration complete)
- Gateway runs on port `7700` for admin API endpoints
- Dry-run trigger returns HTTP `200` (not `202`) with `{ kind: 'dry_run' }`

### Metis Review

**Identified Gaps** (addressed):

- **`concurrency_limit`**: Must be set explicitly. Defaulting to `5` for webhook-triggered employee (multiple concurrent guests). Summarizer uses `1` because only one daily run.
- **Port mismatch**: API verification must use port `7700` (not `3000` from README)
- **Test file isolation**: New file only — must NOT modify `migration-agents-md.test.ts` or `manual-trigger.integration.test.ts`
- **Placeholder values**: System prompt and instructions must be explicit non-empty strings (not `null`)
- **`trigger_sources` shape**: `{ type: 'webhook' }` is metadata only — harness doesn't read it at runtime
- **Seed idempotency**: Must verify running `pnpm prisma db seed` twice doesn't fail

---

## Work Objectives

### Core Objective

Add a `guest-messaging` archetype record to the VLRE tenant's seed data, verify it with automated tests and API dry-run, and mark GM-01 complete in the story map.

### Concrete Deliverables

- Modified `prisma/seed.ts` with new archetype upsert block
- New file `tests/gateway/seed-guest-messaging.test.ts`
- Updated `docs/2026-04-21-2202-phase1-story-map.md` with checked criteria

### Definition of Done

- [ ] `pnpm prisma db seed` exits 0 and seeds guest-messaging archetype
- [ ] `pnpm test -- --run` exits 0 (pre-existing failures excepted)
- [ ] `POST /admin/tenants/.../employees/guest-messaging/trigger?dry_run=true` returns 200
- [ ] Story map GM-01 criteria all marked `[x]`

### Must Have

- Archetype ID: `00000000-0000-0000-0000-000000000015`
- `role_name`: `guest-messaging`
- `model`: `minimax/minimax-m2.7` (AGENTS.md constraint — no other model allowed)
- `runtime`: `opencode`
- `risk_model`: `{ approval_required: true, timeout_hours: 24 }`
- `tenant_id`: `00000000-0000-0000-0000-000000000003` (VLRE)
- `department_id`: `00000000-0000-0000-0000-000000000021` (existing VLRE department)
- `concurrency_limit`: `5` (webhook-triggered, multiple concurrent guests)
- `deliverable_type`: `slack_message` (placeholder — to be revisited in GM-02)
- `trigger_sources`: `{ type: 'webhook' }` (metadata only)
- `tool_registry`: `{ tools: ['/tools/hostfully/get-property.ts', '/tools/hostfully/get-reservations.ts', '/tools/hostfully/get-messages.ts', '/tools/hostfully/send-message.ts', '/tools/slack/post-message.ts', '/tools/slack/read-channels.ts', '/tools/platform/report-issue.ts'] }`
- `agents_md`: reuse `PLATFORM_AGENTS_MD` constant
- Placeholder `system_prompt` and `instructions` (explicit non-empty strings)

### Must NOT Have (Guardrails)

- Do NOT write real system prompt or instructions content — GM-02 owns that
- Do NOT introduce a new `deliverable_type` enum value — use `slack_message` as placeholder
- Do NOT add a Prisma migration — all columns already exist, this is seed-only
- Do NOT modify existing test files (`migration-agents-md.test.ts`, `manual-trigger.integration.test.ts`, `archetype-uniqueness.test.ts`)
- Do NOT create a DozalDevs archetype — VLRE only
- Do NOT use any model other than `minimax/minimax-m2.7`
- Do NOT use port `3000` for API verification — use `7700`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Seed verification**: Use Bash (`pnpm prisma db seed`) — run seed, assert exit code, check output
- **Test suite**: Use Bash (`pnpm test -- --run`) — run tests, assert pass count
- **API verification**: Use Bash (curl) — send dry-run request, assert status + response fields
- **DB verification**: Use Bash (psql or Prisma script) — query archetype, assert field values

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — seed record):
└── Task 1: Add guest-messaging archetype to prisma/seed.ts [quick]

Wave 2 (After Wave 1 — tests require seeded data):
└── Task 2: Write automated tests for guest-messaging archetype [unspecified-high]

Wave 3 (After Wave 2 — all verified):
├── Task 3: Update story-map document [quick]
└── Task 4: Notify completion [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → F1-F4 → user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 2, 3   |
| 2    | 1          | 3      |
| 3    | 2          | F1-F4  |
| 4    | 2          | —      |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 1 task — T2 → `unspecified-high`
- **Wave 3**: 2 tasks — T3 → `quick`, T4 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add guest-messaging archetype to prisma/seed.ts

  **What to do**:
  - Define a `GUEST_MESSAGING_SYSTEM_PROMPT` constant with a placeholder string: `'Guest Messaging Employee — system prompt to be defined in GM-02.'`
  - Define a `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant with a placeholder string: `'Guest Messaging Employee — instructions to be defined in GM-02. Available tools: /tools/hostfully/get-property.ts, /tools/hostfully/get-reservations.ts, /tools/hostfully/get-messages.ts, /tools/hostfully/send-message.ts, /tools/slack/post-message.ts, /tools/slack/read-channels.ts, /tools/platform/report-issue.ts'`
  - Add a new upsert block after the existing VLRE summarizer upsert (after line ~276), following the EXACT same pattern:
    ```typescript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vlreGuestMessaging = await (prisma.archetype as any).upsert({
      where: { id: '00000000-0000-0000-0000-000000000015' },
      create: {
        id: '00000000-0000-0000-0000-000000000015',
        role_name: 'guest-messaging',
        runtime: 'opencode',
        system_prompt: GUEST_MESSAGING_SYSTEM_PROMPT,
        instructions: VLRE_GUEST_MESSAGING_INSTRUCTIONS,
        model: 'minimax/minimax-m2.7',
        deliverable_type: 'slack_message', // placeholder — revisit in GM-02
        tool_registry: {
          tools: [
            '/tools/hostfully/get-property.ts',
            '/tools/hostfully/get-reservations.ts',
            '/tools/hostfully/get-messages.ts',
            '/tools/hostfully/send-message.ts',
            '/tools/slack/post-message.ts',
            '/tools/slack/read-channels.ts',
            '/tools/platform/report-issue.ts',
          ],
        },
        trigger_sources: { type: 'webhook' }, // event-driven, not cron
        risk_model: { approval_required: true, timeout_hours: 24 },
        concurrency_limit: 5, // webhook-triggered: multiple concurrent guests
        agents_md: PLATFORM_AGENTS_MD,
        tenant_id: '00000000-0000-0000-0000-000000000003', // VLRE
        department_id: '00000000-0000-0000-0000-000000000021', // VLRE department
      },
      update: {
        role_name: 'guest-messaging',
        runtime: 'opencode',
        system_prompt: GUEST_MESSAGING_SYSTEM_PROMPT,
        instructions: VLRE_GUEST_MESSAGING_INSTRUCTIONS,
        model: 'minimax/minimax-m2.7',
        deliverable_type: 'slack_message',
        tool_registry: {
          tools: [
            '/tools/hostfully/get-property.ts',
            '/tools/hostfully/get-reservations.ts',
            '/tools/hostfully/get-messages.ts',
            '/tools/hostfully/send-message.ts',
            '/tools/slack/post-message.ts',
            '/tools/slack/read-channels.ts',
            '/tools/platform/report-issue.ts',
          ],
        },
        trigger_sources: { type: 'webhook' },
        risk_model: { approval_required: true, timeout_hours: 24 },
        concurrency_limit: 5,
        agents_md: PLATFORM_AGENTS_MD,
        // NO tenant_id — immutable
        // NO department_id — immutable
      },
    });
    ```
  - Add a console.log after the upsert: `console.log('✅ Archetype upserted:', vlreGuestMessaging.id, '(role:', vlreGuestMessaging.role_name, ', model:', vlreGuestMessaging.model, ')');` — match the log pattern of existing archetype upserts
  - Run `pnpm prisma db seed` and verify it exits 0
  - Run `pnpm prisma db seed` a SECOND time to verify idempotency (upsert must not fail on re-run)
  - Verify existing archetypes still seed correctly (look for `000...0012` and `000...0013` in output)

  **Must NOT do**:
  - Do NOT write real system prompt or instructions — placeholder strings only
  - Do NOT add a Prisma migration — all columns already exist
  - Do NOT modify any existing upsert blocks
  - Do NOT use any model other than `minimax/minimax-m2.7`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file edit following an established pattern with clear copy-paste template
  - **Skills**: `[]`
    - No special skills needed — straightforward seed.ts modification
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — just editing and running a seed file

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `prisma/seed.ts` — VLRE summarizer archetype upsert block (ID `00000000-0000-0000-0000-000000000013`). Copy this exact structure for the new guest-messaging archetype. Pay attention to: the `(prisma.archetype as any)` cast, `tenant_id` in `create` only (not `update`), same for `department_id`, the console.log pattern after upsert.
  - `prisma/seed.ts` — Look for the `PAPI_CHULO_SYSTEM_PROMPT` and `VLRE_SUMMARIZER_INSTRUCTIONS` constant definitions. Place the new `GUEST_MESSAGING_SYSTEM_PROMPT` and `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constants in the same area (before the upsert calls).
  - `prisma/seed.ts` — Look for the `PLATFORM_AGENTS_MD` constant. This is already defined and must be reused for `agents_md` — do NOT define a new one.

  **API/Type References** (contracts to implement against):
  - `prisma/schema.prisma` — `Archetype` model definition. Shows all field names, types, and constraints. The `@@unique([tenant_id, role_name])` constraint is critical.

  **External References**:
  - None needed — this is purely internal seed data

  **WHY Each Reference Matters**:
  - `prisma/seed.ts` (VLRE summarizer): The EXACT template to copy. Every field name, the cast pattern, the create/update split — copy it verbatim and change only the values.
  - `prisma/schema.prisma`: Confirms which fields exist and their types, preventing typos or missing fields.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully with new archetype
    Tool: Bash
    Preconditions: Database running (pnpm docker:start or docker compose)
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit code is 0
      3. Assert: stdout contains "00000000-0000-0000-0000-000000000015"
      4. Assert: stdout contains "guest-messaging"
      5. Assert: stdout contains "minimax/minimax-m2.7"
    Expected Result: Seed completes with archetype logged in output
    Failure Indicators: Non-zero exit code, missing archetype ID in output, Prisma error
    Evidence: .sisyphus/evidence/task-1-seed-success.txt

  Scenario: Seed is idempotent (re-run succeeds)
    Tool: Bash
    Preconditions: First seed run already completed
    Steps:
      1. Run: pnpm prisma db seed (second time)
      2. Assert: exit code is 0
      3. Assert: stdout still contains all three archetype IDs (000...0012, 000...0013, 000...0015)
    Expected Result: Second run succeeds without duplicate key errors
    Failure Indicators: P2002 unique constraint violation, non-zero exit code
    Evidence: .sisyphus/evidence/task-1-seed-idempotent.txt

  Scenario: Existing archetypes not broken
    Tool: Bash
    Preconditions: Seed completed
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: stdout contains "00000000-0000-0000-0000-000000000012" (DozalDevs summarizer)
      3. Assert: stdout contains "00000000-0000-0000-0000-000000000013" (VLRE summarizer)
    Expected Result: All existing archetypes still seeded correctly
    Failure Indicators: Missing archetype IDs in output, different field values
    Evidence: .sisyphus/evidence/task-1-existing-archetypes-intact.txt

  Scenario: DB field values are correct
    Tool: Bash (psql or node script)
    Preconditions: Seed completed
    Steps:
      1. Query: SELECT id, role_name, model, runtime, deliverable_type, tenant_id, concurrency_limit FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'
      2. Assert: role_name = 'guest-messaging'
      3. Assert: model = 'minimax/minimax-m2.7'
      4. Assert: runtime = 'opencode'
      5. Assert: deliverable_type = 'slack_message'
      6. Assert: tenant_id = '00000000-0000-0000-0000-000000000003'
      7. Assert: concurrency_limit = 5
      8. Query: SELECT risk_model FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015'
      9. Assert: risk_model contains "approval_required": true
    Expected Result: All fields match expected values
    Failure Indicators: NULL values, wrong tenant_id, wrong model
    Evidence: .sisyphus/evidence/task-1-db-field-values.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-seed-success.txt — stdout of first seed run
  - [ ] task-1-seed-idempotent.txt — stdout of second seed run
  - [ ] task-1-existing-archetypes-intact.txt — grep of archetype IDs from seed output
  - [ ] task-1-db-field-values.txt — DB query results

  **Commit**: YES
  - Message: `feat(seed): add guest-messaging archetype for VLRE tenant`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm prisma db seed`

---

- [x] 2. Write automated tests for guest-messaging archetype

  **What to do**:
  - Create a NEW file: `tests/gateway/seed-guest-messaging.test.ts`
  - Follow the pattern from `tests/gateway/migration-agents-md.test.ts` for seed verification
  - Follow the pattern from `tests/gateway/integration/manual-trigger.integration.test.ts` for trigger integration

  **Test file structure:**

  ```typescript
  import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
  import { getPrisma, disconnectPrisma, ADMIN_TEST_KEY } from '../setup.js';
  // Import dispatchEmployee for integration test
  import { dispatchEmployee } from '../../src/gateway/services/employee-dispatcher.js';

  const VLRE_TENANT_ID = '00000000-0000-0000-0000-000000000003';
  const GUEST_MESSAGING_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000015';

  describe('Guest Messaging Archetype - Seed Verification', () => {
    const prisma = getPrisma();

    afterAll(async () => {
      await disconnectPrisma();
    });

    // Group 1: Seed data presence and field verification
    describe('seed data', () => {
      it('archetype record exists with correct ID', async () => {
        const archetype = await prisma.archetype.findUnique({
          where: { id: GUEST_MESSAGING_ARCHETYPE_ID },
        });
        expect(archetype).not.toBeNull();
      });

      it('has correct role_name (slug)', async () => {
        const result = await prisma.$queryRaw`
          SELECT role_name FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].role_name).toBe('guest-messaging');
      });

      it('uses approved model (minimax/minimax-m2.7)', async () => {
        const result = await prisma.$queryRaw`
          SELECT model FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].model).toBe('minimax/minimax-m2.7');
      });

      it('uses opencode runtime', async () => {
        const result = await prisma.$queryRaw`
          SELECT runtime FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].runtime).toBe('opencode');
      });

      it('belongs to VLRE tenant', async () => {
        const archetype = await prisma.archetype.findUnique({
          where: { id: GUEST_MESSAGING_ARCHETYPE_ID },
        });
        expect(archetype!.tenant_id).toBe(VLRE_TENANT_ID);
      });

      it('has approval_required: true in risk_model', async () => {
        const result = await prisma.$queryRaw`
          SELECT risk_model FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].risk_model).toMatchObject({ approval_required: true });
      });

      it('has non-empty system_prompt', async () => {
        const result = await prisma.$queryRaw`
          SELECT system_prompt FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].system_prompt).toBeTruthy();
        expect(result[0].system_prompt.length).toBeGreaterThan(0);
      });

      it('has non-empty instructions', async () => {
        const result = await prisma.$queryRaw`
          SELECT instructions FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].instructions).toBeTruthy();
        expect(result[0].instructions.length).toBeGreaterThan(0);
      });

      it('has non-empty agents_md', async () => {
        const result = await prisma.$queryRaw`
          SELECT agents_md FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].agents_md).toBeTruthy();
      });

      it('has deliverable_type set', async () => {
        const result = await prisma.$queryRaw`
          SELECT deliverable_type FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        expect(result[0].deliverable_type).toBe('slack_message');
      });

      it('has concurrency_limit of 5', async () => {
        const archetype = await prisma.archetype.findUnique({
          where: { id: GUEST_MESSAGING_ARCHETYPE_ID },
        });
        expect(archetype!.concurrency_limit).toBe(5);
      });

      it('has tool_registry with Hostfully and platform tools', async () => {
        const result = await prisma.$queryRaw`
          SELECT tool_registry FROM archetypes WHERE id = ${GUEST_MESSAGING_ARCHETYPE_ID}::uuid
        `;
        const tools = result[0].tool_registry.tools;
        expect(tools).toContain('/tools/hostfully/get-property.ts');
        expect(tools).toContain('/tools/hostfully/get-messages.ts');
        expect(tools).toContain('/tools/hostfully/send-message.ts');
        expect(tools).toContain('/tools/slack/post-message.ts');
        expect(tools).toContain('/tools/platform/report-issue.ts');
      });
    });

    // Group 2: Integration — dispatch with new slug
    describe('trigger integration', () => {
      beforeEach(async () => {
        // Clean up manual tasks for VLRE tenant
        await prisma.task.deleteMany({
          where: { source_system: 'manual', tenant_id: VLRE_TENANT_ID },
        });
      });

      it('dispatchEmployee finds guest-messaging archetype', async () => {
        const spy = { send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }) };
        const result = await dispatchEmployee({
          tenantId: VLRE_TENANT_ID,
          slug: 'guest-messaging',
          dryRun: true,
          prisma,
          inngest: spy as any,
        });
        expect(result.kind).toBe('dry_run');
        expect(result.archetypeId).toBe(GUEST_MESSAGING_ARCHETYPE_ID);
      });

      it('dispatchEmployee can create a task for guest-messaging', async () => {
        const spy = { send: vi.fn().mockResolvedValue({ ids: ['mock-event-id'] }) };
        const result = await dispatchEmployee({
          tenantId: VLRE_TENANT_ID,
          slug: 'guest-messaging',
          dryRun: false,
          prisma,
          inngest: spy as any,
        });
        expect(result.kind).toBe('dispatched');
        expect(result.taskId).toBeTruthy();
        // Verify task exists in DB
        const task = await prisma.task.findUnique({ where: { id: result.taskId } });
        expect(task).not.toBeNull();
        expect(task!.tenant_id).toBe(VLRE_TENANT_ID);
      });
    });
  });
  ```

  - Adapt the above to match exact import paths and patterns from the existing test files
  - Use `vi.fn()` from Vitest for the Inngest spy (import `vi` from vitest)
  - Ensure cleanup in `beforeEach` uses `deleteMany` scoped to VLRE tenant + manual source
  - Run `pnpm test -- --run` and verify all tests pass (including the new ones)

  **Must NOT do**:
  - Do NOT modify `tests/gateway/migration-agents-md.test.ts`
  - Do NOT modify `tests/gateway/integration/manual-trigger.integration.test.ts`
  - Do NOT modify `tests/prisma/archetype-uniqueness.test.ts`
  - Do NOT create test fixtures that duplicate seed data

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Test file requires understanding import patterns, Prisma query syntax, Vitest conventions, and dispatchEmployee service interface — more than a trivial edit
  - **Skills**: `[]`
    - No special skills needed — test patterns are well-documented in references
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not UI testing — DB and service integration only

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1 (seed must exist before tests can verify it)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `tests/gateway/migration-agents-md.test.ts` — Seed data verification pattern using `$queryRaw`. Shows how to query individual columns from archetypes table by known UUID, assert field presence and values. Copy this pattern for the seed data describe block.
  - `tests/gateway/integration/manual-trigger.integration.test.ts` — Integration test for `dispatchEmployee`. Shows: `beforeAll` guard (verify archetype exists), `beforeEach` cleanup (delete manual tasks), Inngest spy pattern `{ send: vi.fn().mockResolvedValue({ ids: [...] }) }`, assertion on `result.kind`. Adapt this for VLRE tenant + `guest-messaging` slug.
  - `tests/setup.ts` — Shared test utilities: `getPrisma()`, `disconnectPrisma()`, `ADMIN_TEST_KEY`. All test files import from here.

  **API/Type References** (contracts to implement against):
  - `src/gateway/services/employee-dispatcher.ts` — `dispatchEmployee()` function signature. Shows the `DispatchResult` type (`kind: 'dispatched' | 'dry_run'`, `taskId`, `archetypeId`). Needed to write correct assertions.

  **WHY Each Reference Matters**:
  - `migration-agents-md.test.ts`: Exact `$queryRaw` syntax for column-level checks on archetypes table. Copy the SQL template literal pattern.
  - `manual-trigger.integration.test.ts`: The `dispatchEmployee` integration test is the closest existing pattern. Shows how to mock Inngest, how to clean up tasks, how to assert dispatch results.
  - `tests/setup.ts`: Required imports for any test file in this project.
  - `employee-dispatcher.ts`: Needed to understand the return type of `dispatchEmployee()` for correct assertions.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: Task 1 complete (archetype seeded), database running
    Steps:
      1. Run: pnpm test -- --run tests/gateway/seed-guest-messaging.test.ts
      2. Assert: exit code is 0
      3. Assert: stdout shows all tests passing (12+ tests)
      4. Assert: no test failures related to guest-messaging
    Expected Result: All seed verification and integration tests pass
    Failure Indicators: Any test failure, import errors, connection refused
    Evidence: .sisyphus/evidence/task-2-new-tests-pass.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: New test file added
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: exit code is 0
      3. Assert: test count increased (was 515+, should be 527+ with new tests)
      4. Assert: only pre-existing failures present (container-boot.test.ts, inngest-serve.test.ts)
    Expected Result: No regressions — all existing tests still pass
    Failure Indicators: New test failures in existing files, decreased pass count
    Evidence: .sisyphus/evidence/task-2-full-suite-pass.txt

  Scenario: Dry-run trigger via API returns 200
    Tool: Bash (curl)
    Preconditions: Gateway running on port 7700, archetype seeded
    Steps:
      1. Run: curl -s -w "\n%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger?dry_run=true" -d '{}'
      2. Assert: HTTP status code is 200
      3. Assert: response body contains "dry_run"
      4. Assert: response body contains "00000000-0000-0000-0000-000000000015"
    Expected Result: API finds the archetype and returns dry-run result
    Failure Indicators: 404 (archetype not found), 500 (server error), wrong archetypeId
    Evidence: .sisyphus/evidence/task-2-api-dryrun.txt

  Scenario: 404 for non-existent slug on same tenant
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. Run: curl -s -w "\n%{http_code}" -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/nonexistent-slug/trigger?dry_run=true" -d '{}'
      2. Assert: HTTP status code is 404
    Expected Result: Non-existent slug returns 404, confirming lookup works correctly
    Failure Indicators: 200 or 500 (would indicate broken routing)
    Evidence: .sisyphus/evidence/task-2-api-404-nonexistent.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-new-tests-pass.txt — test run output for new test file
  - [ ] task-2-full-suite-pass.txt — full `pnpm test -- --run` output
  - [ ] task-2-api-dryrun.txt — curl response for dry-run trigger
  - [ ] task-2-api-404-nonexistent.txt — curl response for nonexistent slug

  **Commit**: YES
  - Message: `test(archetype): add seed and trigger tests for guest-messaging`
  - Files: `tests/gateway/seed-guest-messaging.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 3. Update story-map document to mark GM-01 complete

  **What to do**:
  - Edit `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the GM-01 acceptance criteria section (lines 415-419)
  - Change all `- [ ]` to `- [x]` for the 5 criteria:
    ```
    - [x] New archetype seeded in `prisma/seed.ts` with slug `guest-messaging`
    - [x] Fields set: `role_name`, `system_prompt`, `instructions`, `model` (`minimax/minimax-m2.7`), `deliverable_type`, `runtime: 'opencode'`
    - [x] `risk_model.approval_required: true` (supervised mode - every message approved)
    - [x] Archetype linked to VLRE tenant with a tenant-specific archetype record
    - [x] `pnpm prisma db seed` successfully upserts without breaking existing archetypes
    ```

  **Must NOT do**:
  - Do NOT modify any other story's acceptance criteria
  - Do NOT change any text — only change `[ ]` to `[x]`
  - Do NOT update GM-02 or any other story

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file, 5-line change — checkbox toggle only
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 3 (with Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2 (must verify everything works before marking complete)

  **References** (CRITICAL):

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md` lines 415-419 — The exact 5 lines to change. Each `- [ ]` becomes `- [x]`. Look at HF-01 through HF-06 (lines 179-396) for examples of already-completed criteria (all marked `[x]`).

  **WHY Each Reference Matters**:
  - Story map lines 415-419: These are the ONLY lines to touch. The file has 1200+ lines — be precise.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 5 GM-01 criteria marked complete
    Tool: Bash (grep)
    Preconditions: Story-map file updated
    Steps:
      1. Run: grep -A 5 "GM-01" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[x\]" | wc -l
      2. Assert: count is 5
      3. Run: grep -A 5 "GM-01" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \[ \]" | wc -l
      4. Assert: count is 0
    Expected Result: All 5 acceptance criteria have [x], none have [ ]
    Failure Indicators: Any unchecked boxes, wrong section modified
    Evidence: .sisyphus/evidence/task-3-story-map-updated.txt

  Scenario: No other stories modified
    Tool: Bash (git diff)
    Preconditions: Story-map updated
    Steps:
      1. Run: git diff docs/2026-04-21-2202-phase1-story-map.md | grep "^[-+]" | grep -v "^---" | grep -v "^+++"
      2. Assert: only 5 lines changed (the checkboxes)
      3. Assert: no lines outside the GM-01 section are modified
    Expected Result: Diff shows exactly 5 changed lines — all checkbox toggles
    Failure Indicators: More than 10 diff lines, changes outside GM-01 section
    Evidence: .sisyphus/evidence/task-3-diff-scope.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-story-map-updated.txt — grep confirmation of checked boxes
  - [ ] task-3-diff-scope.txt — git diff showing only checkbox changes

  **Commit**: YES
  - Message: `docs(story-map): mark GM-01 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

- [x] 4. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification that GM-01 is complete:
    ```bash
    tsx scripts/telegram-notify.ts "📋 Plan gm-01-guest-messaging-archetype complete — all tasks done, come back to review results."
    ```

  **Must NOT do**:
  - Do NOT skip this step — Telegram notification is mandatory per AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 3 (with Task 3)
  - **Blocks**: —
  - **Blocked By**: Task 2

  **References**:
  - `scripts/telegram-notify.ts` — Telegram notification script. Takes a single string argument.
  - `AGENTS.md` — Telegram notification rules (Rule 2: final task in every plan)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: telegram-notify.ts exists and is configured
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "📋 Plan gm-01-guest-messaging-archetype complete — all tasks done, come back to review results."
      2. Assert: exit code is 0
    Expected Result: Notification delivered to Telegram
    Failure Indicators: Non-zero exit code, connection error
    Evidence: .sisyphus/evidence/task-4-telegram-sent.txt
  ```

  **Commit**: NO (no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (query DB for archetype fields, check seed.ts for upsert block). For each "Must NOT Have": search codebase for forbidden patterns (wrong model, modified existing tests, DozalDevs archetype). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review changed files for: `as any` beyond the required Prisma cast, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Run `pnpm prisma db seed` — verify guest-messaging archetype appears. Run dry-run trigger via curl. Run full test suite. Test seed idempotency (run seed twice). Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance: no existing test modifications, no DozalDevs archetype, no wrong model. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                    | Files                                        | Pre-commit Check      |
| ---- | ----------------------------------------------------------------- | -------------------------------------------- | --------------------- |
| 1    | `feat(seed): add guest-messaging archetype for VLRE tenant`       | `prisma/seed.ts`                             | `pnpm prisma db seed` |
| 2    | `test(archetype): add seed and trigger tests for guest-messaging` | `tests/gateway/seed-guest-messaging.test.ts` | `pnpm test -- --run`  |
| 3    | `docs(story-map): mark GM-01 acceptance criteria complete`        | `docs/2026-04-21-2202-phase1-story-map.md`   | —                     |

---

## Success Criteria

### Verification Commands

```bash
pnpm prisma db seed          # Expected: exits 0, logs archetype 000...0015
pnpm test -- --run            # Expected: all tests pass (pre-existing failures excepted)
pnpm build                    # Expected: exits 0

# Dry-run trigger
curl -s -X POST \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/guest-messaging/trigger?dry_run=true" \
  -d '{}'
# Expected: HTTP 200, body contains { "kind": "dry_run", "archetypeId": "00000000-0000-0000-0000-000000000015" }
```

### Final Checklist

- [ ] All "Must Have" present in seeded archetype
- [ ] All "Must NOT Have" absent from codebase changes
- [ ] All tests pass
- [ ] GM-01 criteria marked `[x]` in story map
