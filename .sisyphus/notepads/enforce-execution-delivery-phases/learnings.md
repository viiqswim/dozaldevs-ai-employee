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

## Task 10 — seed.ts delivery_instructions → delivery_steps (2026-06-16)

### What was changed

- Renamed `delivery_instructions` → `delivery_steps` in all archetype upserts in `prisma/seed.ts`
- 14 occurrences across 7 employees (create + update blocks each)
- For `cleaning-schedule`: removed `delivery_instructions: null` lines (kept `delivery_steps: null`)
- For `google-workspace-assistant`: removed `delivery_instructions: VLRE_GOOGLE_ASSISTANT_DELIVERY_INSTRUCTIONS` lines (kept `delivery_steps` which was already set to the correct short value)

### Gotcha: duplicate update block

- When using Edit tool to replace a block that spans create+update, be careful not to accidentally create a duplicate `update:` block
- The VLRE summarizer edit created a duplicate — had to remove the extra block

### Unit test failures (pre-existing, not caused by seed.ts)

- `no-approval-path-delivery.test.ts` — 3 failures (tests for delivery logic in no-approval-path.ts)
- `golden-prompts.test.ts` — 1 failure (golden fixture mismatch from archetype-generator-prompts.ts changes)
- `admin-archetypes.test.ts` — 2 failures (draft flow tests)
- `time-estimation-integration.test.ts` — 4 failures
- All pre-existing from other tasks in this plan; seed.ts changes don't affect unit tests

## Task 8: Generator always emits delivery phase (GREEN) — 2026-06-16

### 3 Generator Failure Vectors Fixed

**Vector 1: Prompt JSON example**

- Changed `"delivery_steps": null` to a real example in `SYSTEM_PROMPT_POST`
- This removes the bias that caused models to emit null for deliverable employees
- Location: `src/gateway/services/prompts/archetype-generator-prompts.ts`

**Vector 2: Mirror rule**

- Old rule: "set delivery_instructions to SAME VALUE as delivery_steps" — this cascaded null through
- New rule: delivery_steps MUST be non-empty when deliverable_type set; delivery_instructions deprecated/null
- Location: same prompts file

**Vector 3: postProcess() default derivation**

- Key insight: distinguish explicit null from garbage-normalized-to-null
- Pattern: `const rawDeliverySteps = result.delivery_steps; if (raw !== null && !string) → null; else if (raw === null && deliverable_type) → DEFAULT_DELIVERY_INSTRUCTIONS`
- Malformed values (e.g., numeric 42) → null (no default derived)
- Explicit null + deliverable_type set → DEFAULT_DELIVERY_INSTRUCTIONS
- Location: `src/gateway/services/archetype-generator.ts`

**Bonus: applyCreateAllowlist**

- Same default derivation applied on CREATE path in `admin-archetype-converse-create.ts`

### Golden Fixture Update

- When prompt text changes, must regenerate: `GENERATE_GOLDEN=true pnpm exec vitest run tests/unit/golden-prompts.test.ts`
- Then commit the updated fixture

### Old Tests That Encoded Prior Behavior

- `archetype-generator-prompts.test.ts` had 2 tests asserting null stays null (old invariant)
- These were updated to assert the NEW behavior (string default derived)
- Pattern: when updating behavior that had existing tests, check ALL test files for contradicting expectations

### Test Distinction

- `archetype-generator-delivery.test.ts` = RED by design (from T5, must not change)
- `archetype-generator-prompts.test.ts` = needed updating to match new behavior (NOT RED by design)

## [2026-06-16] Task 9 — POST + PATCH hard-gate GREEN

### What made the 4 gate tests pass

- Added `MISSING_DELIVERY_CONFIG` to `ERROR_CODES` (src/gateway/lib/prisma-helpers.ts).
- POST: removed the soft `delivery_instructions` backfill AND the `delivery_instructions`
  field from `CreateArchetypeBodySchema` (column was DROPPED in T6 — Prisma `.create` with it
  threw P-level errors → 500, which is why cases (b)/(d) were ALSO red at 500, not just (a)).
  Replaced with `resolveDelivery({delivery_steps, delivery_instructions:null, deliverable_type}, undefined)`
  → `kind==='misconfigured'` ⇒ `sendError(400, 'MISSING_DELIVERY_CONFIG', ...)`.
- PATCH: removed `delivery_instructions` from `PatchArchetypeBodySchema` too. Added the gate AFTER
  the existing-row fetch, computing effective values from `(rest.X ?? existing.X)`.

### CRITICAL — PATCH gate MUST be conditional on the patch touching a delivery field

- First attempt (unconditional effective-value gate) BROKE 6 pre-existing PATCH unit tests:
  `admin-archetypes.test.ts` (×2) + `time-estimation-integration.test.ts` (×4). Those seed a
  GRANDFATHERED row (`deliverable_type:'slack_message'`, no `delivery_steps`) then PATCH only
  status/instructions/override expecting 200/409. An always-on gate makes every legacy row
  un-patchable for unrelated edits.
- Fix: `if (rest.deliverable_type !== undefined || rest.delivery_steps !== undefined) { ...gate... }`.
  Still satisfies test (c) (patches both) AND learnings' "reject patching deliverable_type alone
  onto an empty-delivery row" (patching deliverable_type touches a delivery field → gated).

### resolveDelivery still takes delivery_instructions in its interface

- The resolver keeps `delivery_instructions: string | null` for transition tolerance, so pass
  `delivery_instructions: null` literally at both call sites. This is an INTERFACE arg, not a
  DB column read — not a T6 violation.

### Build is RED but NOT my fault (pre-existing, T14 scope)

- `pnpm build` fails ONLY at `admin-brain-preview.ts:276,342` — stale `.delivery_instructions`
  on a Prisma row, left by T6's column drop. Plan assigns this file to TASK 14 (lines 818-842).
- PROVEN pre-existing: `git stash push` my 2 files → rebuild → IDENTICAL 2 errors, ZERO in mine.
- My edits actually REMOVED the admin-archetypes.ts errors the same column-drop would have caused.

### Unit suite after my change

- Only failing file: `no-approval-path-delivery.test.ts` (×3) = the sibling T3 RED file (tests
  `no-approval-path.ts`, forbidden here, GREENed by a different task). 178 files passed.
- My earlier-broken `admin-archetypes.test.ts` + `time-estimation-integration.test.ts` now PASS.

### Gotcha — `pnpm test -- --run` still drops into watch mode here

- Use `CI=true pnpm exec vitest run` for a clean one-shot exit + full failure list.
- Integration config only globs `tests/integration/` — unit files passed to it are silently ignored.

## [T15] Broken employee repair (2026-06-16)

- Employee `ab1b5ecb-382f-4821-9054-4ede7457d223` (slack-channel-summarizer, tenant `18aaaab7`) existed in local DB with empty `delivery_steps` and `deliverable_type`
- Patched via admin PATCH API (gateway was running on :7700) — no raw SQL needed
- PATCH body: `{"delivery_steps": "Post the executive summary to the configured Slack channel.", "deliverable_type": "slack_message"}`
- Gate passed: T9 hard gate validates delivery config on PATCH — the API returned 200 with updated archetype
- The `approval_required` column no longer exists (it's in `risk_model` JSON) — don't use it in SELECT
- Evidence saved to `.sisyphus/evidence/enforce-execution-delivery-phases/task-15-repair.txt` (gitignored)

---

## [2026-06-16] Task 7 — no-approval-path resolver routing (GREEN)

### What Changed

`no-approval-path.ts` had an inline `deliverable_type` gate (L158-204 original) that:

- Required `deliverable_type` to be set to trigger delivery
- Failed with MISSING_DELIVERY_CONFIG if NEEDS_APPROVAL but `deliverable_type` was null
- This blocked `delivery_steps`-only employees from ever delivering on the no-approval path

### Fix Applied

1. Removed `skipDelivery` computation from the step (it checked `delivery_instructions` which is dropped)
2. After fetching classification, call `resolveDelivery(archetype, classification)` from `src/lib/delivery-resolver.ts`
3. Branch on `resolution.kind`:
   - `has-delivery` → proceed to delivery container (fixes the bug)
   - `no-delivery-escape-hatch` → Done
   - `misconfigured` → Failed MISSING_DELIVERY_CONFIG

### Old Test File Updates (no-approval-path.test.ts)

Old tests used `makeCtx()` default with `deliverable_type: 'slack'` but NO `delivery_steps`. With the resolver, that's now `misconfigured`. Fixed by:

1. Adding `delivery_steps: 'Post the output to Slack.'` to makeCtx() default
2. Updating "no deliverable_type → fails visibly" test: new behavior is `no-delivery-escape-hatch` → Done
3. Fixed pre-existing `([id]: [string])` tuple destructuring TS error → `([id]: string[])`

### Pre-existing Failures (NOT Task 7 responsibility)

- `delivery-retry.test.ts` — 14 failing (T12 changes to delivery-retry.ts are in working tree)
- `admin-brain-preview.ts` build error — `delivery_instructions` property missing (T6 migration, pre-existing)

These existed before Task 7 started and are NOT caused by T7 changes.

### Test Results

- `tests/unit/no-approval-path-delivery.test.ts`: 4/4 passing (was 3 failing)
- `tests/unit/inngest/lifecycle-steps/no-approval-path.test.ts`: 13/13 passing (was 6 failing)

---

## [2026-06-16] Task 14 — Compiler reads canonical delivery field (GREEN)

### Scope reality vs plan expectation

- Task 14 names 5 files. Two had NOTHING to remove:
  - `agents-md-compiler.mts` ALREADY reads canonical `input.deliverySteps`. The
    `?? delivery_instructions` fallback lived in its 3 CALLERS, not the compiler.
  - `postgrest-types.ts` has NO `ArchetypeRow` and NO `delivery_instructions`.
    The real `ArchetypeRow` (with the field) is in `execution-phase.mts:40-58`.
    Removed it there instead — satisfies the plan's intent.
- Actual edits (3 files, 4 lines):
  - `execution-phase.mts`: dropped `delivery_instructions?` from ArchetypeRow +
    `delivery_steps ?? delivery_instructions ?? ''` → `delivery_steps ?? ''`
  - `delivery-phase.mts`: same fallback fix (uses ArchetypeRow from execution-phase)
  - `admin-brain-preview.ts`: L276 fallback fix + L342 `humanFields.afterApprovalAction`
    `archetype.delivery_instructions` → `archetype.delivery_steps` (these two were
    the PRE-EXISTING BUILD ERRORS the plan flagged; now fixed → build green).

### "Zero survivors" is GLOBAL-terminal, not per-task

- My 5 named files: 0 matches. ✓
- Global `grep -rn delivery_instructions src/ | grep -v test` is still NON-zero,
  but every survivor is owned by a DIFFERENT task and FORBIDDEN to me:
  delivery-retry.ts (T12), approval-handler.ts (T13), no-approval-path.ts (T7),
  delivery-resolver.ts (T2 keeps it as transition-tolerance INTERFACE arg),
  archetype-generator\*/admin-archetypes/converse-create/edit-helpers (T8/T9 committed),
  failure-codes.ts (failure-reason STRING match, not a column read).
  The global 0 is reached only after T7+T12+T13 land + resolver interface cleanup.

### CRITICAL — parallel Wave-3 contamination of the shared tree

- T7/T12/T13 sibling agents were editing approval-handler.ts / delivery-retry.ts /
  no-approval-path.ts + their tests IN THE SAME WORKING TREE concurrently.
- Full `vitest run` showed 13 reds — ALL in 3 test files that import NONE of my
  files. Proven via `git stash push -- <my 3 files>`: the reds persist (7) WITHOUT
  my changes and shrink (5) WITH them → they track the sibling churn, not me.
- Tests that DO import my files (agents-md-compiler ×2, golden-prompts,
  tool-registry-enforce) = 48 passed / 0 failed.
- LESSON: in a parallel-wave plan, a full-suite red does NOT mean your task broke
  it. Isolate with `git stash push -- <your files>` + grep-for-imports before
  assuming guilt. Commit ONLY your own files (`git add <explicit paths>`), never
  `git add -A` — the tree has uncommitted sibling work + sibling-appended notepad
  content.

### Build/lint

- `pnpm build` (tsc -p tsconfig.build.json) excludes tests → green even though
  test files have pre-existing `.filter()` predicate TS nits (sibling test mocks).
- Pre-commit = `pnpm lint-staged` → eslint --max-warnings 0 on staged .ts only.

## [2026-06-16] Task 12 — delivery-retry.ts gate → resolver (GREEN)

### What changed in delivery-retry.ts

- DELETED the old fetch `select=archetypes(delivery_instructions)` + `if (!deliveryInstructions)`
  gate (the DB query targeted a DROPPED column → would return undefined/error at runtime).
- The archetype is ALREADY in `ctx.archetype` (loaded once in triage-and-ready via
  `select=*,archetypes(*)` and threaded through). So no DB round-trip is needed — read
  `archetype.delivery_steps` + `archetype.deliverable_type` directly and call `resolveDelivery()`.
- Three-way branch mirrors no-approval-path.ts (T7):
  - `misconfigured` → Failed + `failure_code: 'MISSING_DELIVERY_CONFIG'` + `missingDeliveryConfigFailureMessage()` Slack copy → `return { status: 'config-fail' }`
  - `no-delivery-escape-hatch` → Done (no delivery container) → `return { status: 'done' }`
  - `has-delivery` → fall through to the unchanged retry loop (NO reorder)

### Resolver interface widened: delivery_instructions now OPTIONAL

- To hit the task's hard "0 matches of delivery_instructions" criterion, made
  `DeliveryArchetypeFields.delivery_instructions?: string | null` (was required).
  Backward-compatible: all 5 other callers still pass it explicitly (admin-archetypes POST/PATCH,
  no-approval-path, approval-handler) — still valid. delivery-retry now OMITS it entirely.
- Resolver body already used optional chaining (`archetype.delivery_instructions?.trim()`),
  so no body change needed.

### Existing delivery-retry.test.ts had to be updated (it mocked the DROPPED query)

- `makeCtx().archetype` was bare `{ role_name, vm_size }` → now resolves to escape-hatch (Done)
  before the loop. Added `delivery_steps:'Deliver this.'` + `deliverable_type:'slack_message'`
  to the default ctx so happy-path/retry tests reach the loop.
- config-fail tests previously stubbed `delivery_instructions:null` via fetch → rewrote them to
  drive misconfig through `ctx.archetype` (`deliverable_type` set + `delivery_steps:''`), and
  assert `failure_code:'MISSING_DELIVERY_CONFIG'` (the failure_reason wording is no longer the
  old "Archetype missing delivery_instructions").
- vm_size test override `{role_name,vm_size:null}` ALSO needed delivery fields added — otherwise
  it short-circuits at escape-hatch and never calls getPlatformSetting.
- Stripped the now-dead `select=archetypes(delivery_instructions)` branch from the fetch helpers.

### Flaky full-suite contamination (NOT my change — verified)

- First full `vitest run` showed 5 failures (employee-lifecycle-delivery.test.ts ×4 +
  approval-handler-idempotency.test.ts ×1). Re-run clean = 0 failures (2110 passed/9 skipped).
- Proof it's ordering contamination, not my edit: those 3 files run together pass 31/31
  deterministically 3×; employee-lifecycle-delivery.test.ts passes 9/9 in isolation at clean HEAD.
- WORKING-TREE CAVEAT: at commit time the tree also carries T13's uncommitted approval-handler.ts +
  its test. I staged ONLY my T12 files for the commit (delivery-retry.ts, delivery-resolver.ts,
  delivery-retry.test.ts) — left T13's files unstaged for that task to own.

### Build

- `pnpm build` clean (exit 0). The pre-existing admin-brain-preview.ts:276,342 errors noted by
  T9 did NOT appear in my build run — confirmed clean tsc.

## [2026-06-16] Task 13 — approval-handler gate → resolver (GREEN)

### What changed in src/inngest/lifecycle/steps/approval-handler.ts
- Removed the redundant `archetypes(delivery_instructions)` fetch (L303-310) + the
  `if (!deliveryInstructions)` null-gate. `ctx.archetype` ALREADY contains
  delivery_steps + deliverable_type — triage-and-ready.ts:57 loads
  `select=*,archetypes(*)`. The separate fetch was dead weight.
- Replaced with `resolveDelivery({ delivery_steps, deliverable_type }, 'NEEDS_APPROVAL')`.
  Approval path is always post-classification NEEDS_APPROVAL, so pass that literal.
  - `misconfigured` → Failed + failure_code:'MISSING_DELIVERY_CONFIG' + logStatusTransition('Failed','Delivering')
  - `no-delivery-escape-hatch` → Done (approved, nothing to release) — NEW branch, the
    old code had no escape hatch here (it always failed on missing delivery_instructions).
  - `has-delivery` → falls through to existing approve/deliver flow (unchanged).

### Zero-match grep requirement forced resolver interface widening
- Hard requirement: `grep -n delivery_instructions approval-handler.ts` → 0 matches.
- resolver's DeliveryArchetypeFields had `delivery_instructions` REQUIRED → naming it at
  the call site = a grep match. Fix: widen to `delivery_instructions?` (OPTIONAL) in
  src/lib/delivery-resolver.ts. Backward-compatible (required→optional widening); all
  OTHER callers (no-approval-path, delivery-retry, admin-archetypes×2) still pass it
  explicitly and remain valid. My call site is the ONLY one that omits it.
- A concurrent sibling had already typed the same optional change in the working tree
  (file-modified-since-read race). HEAD still has it REQUIRED, so I MUST include
  delivery-resolver.ts in my commit or the committed snapshot won't typecheck.

### deliverable_type card-copy KEPT intact (L492/L528/L535/L538)
- `cardDeliversToChannel`/`deliversToChannel = Boolean(archetype.deliverable_type)` untouched.
  Only the delivery-existence gate moved to the resolver; the Slack card UX still reads
  deliverable_type directly. grep confirms both: delivery_instructions=0, deliverable_type=present.

### Two test files encoded the OLD removed fetch contract → updated to new contract
- `approval-handler-idempotency.test.ts`: ctx.archetype used `delivery_instructions:'...'`
  + makeFetchStub stubbed the `archetypes(delivery_instructions)` GET. Changed default to
  `delivery_steps:'...'`, removed the dead fetch branch. Rewrote test 4 ("missing
  delivery_instructions"→Failed) as the new misconfigured contract (deliverable_type set +
  no delivery_steps → Failed + MISSING_DELIVERY_CONFIG). Added an escape-hatch test
  (no delivery config → Done). 5 pass.
- `employee-lifecycle-delivery.test.ts` (full-lifecycle InngestTestEngine): makeMockTaskData
  archetype had no delivery_steps; the 4 happy-path/retry tests relied on the old fetch.
  Threaded archetypeOverrides through makeMockTaskData+makeEngine, added default
  delivery_steps, removed `archetypes(delivery_instructions)` fetch branches + the unused
  `deliveryInstructions` opt from both fetch-mock builders. Rewrote the null-delivery test
  to the misconfigured contract (override delivery_steps:null + deliverable_type set → assert
  failure_code MISSING_DELIVERY_CONFIG). 9 pass.

### Verification
- Full unit suite: 179 files / 2110 passed / 9 skipped / 0 failures (CI=true pnpm exec vitest run).
- `pnpm build`: BUILD_EXIT=0, 0 TS errors. (The previously-noted admin-brain-preview.ts:276,342
  errors are GONE — concurrent T14 resolved them; build is now fully clean.)
- `pnpm test -- --run` still drops to watch mode here — used `CI=true pnpm exec vitest run`.
