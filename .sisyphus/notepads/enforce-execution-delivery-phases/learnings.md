# Learnings — enforce-execution-delivery-phases

## [2026-06-16] Session Start

### Key Architecture Facts

- Failure fires at `src/inngest/lifecycle/steps/no-approval-path.ts:174` (MISSING_DELIVERY_CONFIG)
- Three overlapping delivery fields: `deliverable_type` (gate), `delivery_instructions` (older gate), `delivery_steps` (newer, compiler prefers)
- Compiler fallback chain: `delivery_steps ?? delivery_instructions ?? ''`
- Lifecycle gates check `delivery_instructions`; compiler reads `delivery_steps` — MISMATCH

### Resolver Contract

```typescript
type DeliveryResolution =
  | { kind: 'has-delivery'; content: string }
  | { kind: 'no-delivery-escape-hatch' }
  | { kind: 'misconfigured' };

function resolveDelivery(
  archetype: {
    delivery_steps: string | null;
    delivery_instructions?: string | null;
    deliverable_type: string | null;
  },
  classification: string | undefined,
): DeliveryResolution;
```

Predicate:

1. `delivery_steps` non-empty → has-delivery(delivery_steps)
2. `delivery_instructions` non-empty → has-delivery(delivery_instructions) [transition tolerance]
3. `deliverable_type` set AND classification ≠ NO_ACTION_NEEDED → misconfigured
4. else → no-delivery-escape-hatch

### Migration Rule (CRITICAL — COALESCE, not blind copy)

```sql
UPDATE archetypes SET delivery_steps = COALESCE(delivery_steps, delivery_instructions) WHERE delivery_steps IS NULL;
ALTER TABLE archetypes DROP COLUMN delivery_instructions;
```

### Broken Employee

- ID: `ab1b5ecb-382f-4821-9054-4ede7457d223`
- Tenant: `18aaaab7-44c1-42ee-a9e2-928679db78e0`
- Failed task: `6e249d03-b897-4bb9-9d09-3bf423ac41d1`

### Escape Hatch (MUST PRESERVE)

- cleaning-schedule: delivery_steps=null, delivery_instructions=null, approval_required:false, NO_ACTION_NEEDED
- Posts to Slack directly in execution phase

### Deploy Order (CRITICAL)

Worker Fly image rebuild+deploy FIRST → then gateway migration with column drop

### Test DB

- `ai_employee_test` — setup via `pnpm test:db:setup`
- `pnpm test -- --run` = unit tests
- `pnpm test:integration` = DB-backed tests

## [2026-06-16] Task 3 — RED tests written

### Test file: tests/unit/no-approval-path-delivery.test.ts
- Root-level tests/unit/ files import via `../../src/...` (2 levels), NOT 4 levels.
  The pre-existing canonical test at tests/unit/inngest/lifecycle-steps/no-approval-path.test.ts
  uses `../../../../src/...` (4 levels) — depth differs by directory nesting.
- Reused the EXACT vi.hoisted() mock pattern from the canonical test:
  mock notify-and-track, delivery-retry, lib/lifecycle-helpers, steps/lifecycle-helpers,
  pending-approvals, postgrest-client, @prisma/client, logger, slack-blocks, slack-copy.
- `buildDeliverableFetch(content)` stubs global fetch: GET /deliverables? returns
  [{content}] (or [] when null); PATCH/POST resolve ok. setTimeout stubbed to fire
  synchronously so the 3x retry loop doesn't add real delay.
- step.run mock just invokes the fn immediately: `(_id, fn) => fn()`.

### RED proof (genuine vitest exit code = 1)
- (a) BUG CASE: delivery_steps set + deliverable_type null + NEEDS_APPROVAL
      → current code emits MISSING_DELIVERY_CONFIG (delivery spy 0 calls). FAILS. ✓RED
- (b) escape hatch: NO_ACTION_NEEDED + null delivery → Done. PASSES (preserved). ✓
- (c) misconfigured: deliverable_type set + empty delivery prose + NEEDS_APPROVAL
      → current code proceeds to Delivering (gate only checks deliverable_type),
        intended contract wants MISSING_DELIVERY_CONFIG. FAILS. ✓RED

### Current-code gate confirmed (no-approval-path.ts L158-204)
- Gate keys ONLY off `deliverable_type`:
    L159 `if (!deliverableType)` → only then considers MISSING_DELIVERY_CONFIG.
  So a valid `delivery_steps` with null `deliverable_type` wrongly fails,
  and a set `deliverable_type` with empty prose wrongly delivers.
  The GREEN fix must drive the gate off delivery_steps (canonical) /
  delivery_instructions (fallback), per the resolver contract in this notepad.

### Gotcha
- `${PIPESTATUS[0]}` after `| tee` returns tee's exit (0), masking vitest failure.
  Re-ran with redirect (`> file 2>&1; echo $?`) to capture the genuine exit code = 1.

## [2026-06-16] Task 4 — Draft-save + PATCH hard-gate RED tests written

### Test file: tests/integration/archetypes-delivery-gate.test.ts
- Pattern source: tests/integration/gateway/admin-projects-create.test.ts (the canonical
  DB-backed route test). Real express app + real prisma (getPrisma()) + TestApp.inject()
  with `Authorization: Bearer ${ADMIN_TEST_KEY}`. NOT the mocked-prisma unit style.
- ADMIN_TEST_KEY from tests/setup.ts; set `process.env.SERVICE_TOKEN = ADMIN_TEST_KEY`
  in beforeEach so authMiddleware's timing-safe SERVICE_TOKEN compare passes.
- Integration config (vitest.integration.config.ts) auto-runs globalSetup: migrate
  deploy + seed against ai_employee_test. Run with:
  `pnpm exec vitest run --config vitest.integration.config.ts <file>`.
  The plain `pnpm exec vitest run <file>` uses the UNIT config (no test DB env) — wrong.
- cleanupTestData() in setup.ts does NOT touch archetypes. Added local
  cleanupGateArchetypes() keyed on role_name startsWith 'gate-test-' so seed archetypes
  are untouched. MUST delete archetypeEditHistory children FIRST (onDelete:Restrict FK)
  — the POST handler writes a kind:'create' history row, PATCH writes kind:'edit'.
- Mocked time-estimator.js + call-llm.js (TimeEstimator hits LLM on create/update) to
  keep tests hermetic — same mock shape as the enforce-gate unit test.

### Contract encoded (target error code = MISSING_DELIVERY_CONFIG, NOT in ERROR_CODES yet)
- (a) POST deliverable_type:'slack_message' + delivery_steps:'' → expect 400 MISSING_DELIVERY_CONFIG
- (b) POST deliverable_type:null + delivery_steps:'' → expect 201 (escape hatch)
- (c) PATCH (seed valid → patch deliverable_type set + delivery_steps:'') → expect 400 MISSING_DELIVERY_CONFIG
- (d) POST deliverable_type:'slack_message' + non-empty delivery_steps → expect 201

### RED proof (genuine vitest exit = 1, evidence task-4-red.txt)
- (a) FAILS: got 201, want 400 — current POST backfills DEFAULT_DELIVERY_INSTRUCTIONS
      (admin-archetypes.ts L202-204) instead of rejecting. ✓RED
- (c) FAILS: got 200, want 400 — PATCH has NO delivery gate at all. ✓RED
- (b) PASSES + (d) PASSES — the two always-green cases already behave (escape hatch + valid).
  Handler logs "Archetype created"/"Archetype updated" confirm real DB writes, so the 2
  failures are genuine assertion misses, not compile/setup errors.

### GREEN guidance for Task 9
- Add MISSING_DELIVERY_CONFIG to ERROR_CODES (src/gateway/lib/prisma-helpers.ts).
- POST: replace the soft backfill (L199-204) with a hard gate; escape hatch = deliverable_type null.
- PATCH: gate must also fire — compute effective deliverable_type/delivery_steps from
  (patch body ?? existing row) since PATCH is partial. Case (c) sets BOTH in one body,
  but a real impl must also reject patching deliverable_type alone onto an empty-delivery row.

## [2026-06-16] Task 5 — Generator postProcess() delivery-default RED tests written

### Test file: tests/unit/archetype-generator-delivery.test.ts (ROOT-level unit)
- Root-level tests/unit/ imports use `../../src/...` (2 levels) — confirmed vs
  tests/unit/delivery-resolver.test.ts. NOT the 4-level depth used by nested
  tests/unit/gateway/services/ files.
- postProcess() is PRIVATE — reached only via generate(). Drove a raw model
  payload through `gen.generate(DESCRIPTION)` and asserted on result.delivery_steps,
  exactly like the canonical golden test
  (tests/unit/gateway/services/archetype-generator-golden.test.ts).
- Mock pattern (copied from golden test): `makeRoutingLLM(mainResponse)` routes the
  TimeEstimator sub-call (system prompt starts 'You estimate manual task duration')
  to '5', and the main generation call to the supplied raw JSON. makeResult() shape:
  {content, model, promptTokens, completionTokens, estimatedCostUsd, latencyMs}.
- DESCRIPTION must NOT match isCodeWritingEmployee() CODE_PHRASE_PATTERNS (no
  'implement'/'code'/'github' etc.) or postProcess forces concurrency_limit=1 +
  vm_size + github tool injection. Used neutral 'A helper that processes records
  and notifies a channel'.

### Current-code bug confirmed (archetype-generator.ts L362-364)
- `if (result.delivery_steps !== null && typeof result.delivery_steps !== 'string')
   result.delivery_steps = null;`
  i.e. a model-emitted `delivery_steps: null` is passed straight through. No
  deliverable_type-aware default exists. So both deliverable cases land null.

### RED proof (genuine vitest exit = 1, evidence task-5-red.txt)
- (a) BUG: deliverable_type='slack_message' + delivery_steps:null +
      delivery_instructions set → result.delivery_steps === null (typeof 'object').
      FAILS `expect(typeof).toBe('string')`. ✓RED
- (c) MIRROR BUG: deliverable_type set + BOTH delivery fields null → same null
      passthrough. FAILS. ✓RED
- (b) ESCAPE HATCH: deliverable_type:null + delivery_steps:null → stays null.
      PASSES (1 passed). Escape hatch preserved. ✓

### Assertion choice (avoid brittleness)
- For (a)/(c) asserted typeof==='string' + toBeTruthy + length>0 — NOT exact
  wording. The GREEN fix can reuse DEFAULT_DELIVERY_INSTRUCTIONS
  (output-contract-constants.ts:25) or any non-empty derivation; tests stay green
  regardless of wording.

### GREEN guidance for the generator fix task
- In postProcess(), after the L362-364 null-normalization, add: if delivery_steps
  is null/empty AND deliverable_type is set (truthy) → derive a non-empty default
  (DEFAULT_DELIVERY_INSTRUCTIONS is the obvious reuse). Leave null only when
  deliverable_type is null (escape hatch / case b).
- Note: postProcess does NOT currently touch delivery_instructions at all — the fix
  scope per these tests is delivery_steps only.

### Comment-hook gotcha
- The repo's post-edit hook flags ALL comments aggressively. Kept only a 2-line
  RED-phase warning header (justified under necessary-comment rule: failing tests
  normally signal a bug, so the intent must be documented or a future dev deletes
  them). Stripped every inline explanatory comment — test names carry the meaning.

## [2026-06-16] T11 Migration Spec Findings

### CRITICAL: Verification Query Returns 2 Rows Post-Migration (Not 0)
- `cleaning-schedule` and `daily-motivation` have `deliverable_type` SET but both delivery fields NULL
- These are KNOWN escape hatches (post directly in execution phase)
- Post-migration verification query will return 2 rows (not 0) — this is EXPECTED
- The plan's success criteria says "0 rows" but must be updated to "2 rows (known escape hatches)"

### BACKFILL: Only 1 Employee Needs Backfill
- `real-estate-motivation-bot-2`: delivery_steps=NULL, delivery_instructions=SET → will be backfilled

### Google-Assistant Safety Confirmed
- delivery_steps = 'Post the task results to the configured Slack channel.' (short, canonical)
- delivery_instructions = long detailed prompt (different content)
- COALESCE is safe: delivery_steps IS NOT NULL → no change

### Escape Hatch Employees (NULL delivery, NULL deliverable_type)
- slack-channel-summarizer, t11-slack-summarizer-final, t11-support-digest-final

### Broken Employee (ab1b5ecb) NOT in DB
- The broken employee from the original bug is in tenant 18aaaab7 (not the main seed)
- It will need to be patched separately in T15

## [2026-06-16] Task 6 — Migration applied

### Migration: consolidate-delivery-fields
- File: `prisma/migrations/20260616030000_consolidate_delivery_fields/migration.sql`
- COALESCE UPDATE: ran on 13 rows (all where delivery_steps IS NULL, including deleted rows)
  - Active employees backfilled: 1 (`real-estate-motivation-bot-2`)
  - Escape hatches preserved null: cleaning-schedule, daily-motivation, slack-channel-summarizer, t11-slack-summarizer-final, t11-support-digest-final
- DROP COLUMN: `ALTER TABLE archetypes DROP COLUMN delivery_instructions;` — succeeded
- `_prisma_migrations` table updated with manual INSERT (shadow DB unavailable)
- PostgREST reloaded: `NOTIFY pgrst, 'reload schema';`
- Prisma client regenerated: `pnpm prisma generate`

### Post-migration Verification Results
- Violation query: 2 rows (cleaning-schedule, daily-motivation) — EXPECTED escape hatches
- google-workspace-assistant: delivery_steps = 'Post the task results to the configured Slack channel.' — UNCHANGED
- delivery_instructions column: 0 rows in information_schema.columns — DROPPED

### Unit Tests
- 5 pre-existing RED failures (T3: no-approval-path-delivery.test.ts ×3, T5: archetype-generator-delivery.test.ts ×2)
- 0 NEW failures from migration change
- 2104 previously-passing tests still pass

### DB Backup
- Path: database-backups/20260616-022947/full-dump.sql (136MB)

### Shadow DB Gotcha
- `prisma migrate dev --create-only` fails with P3006 (shadow DB issue: `_prisma_migrations` table not found in shadow)
- Workaround: manually write migration SQL + apply via psql + INSERT into `_prisma_migrations` with gen_random_uuid()
