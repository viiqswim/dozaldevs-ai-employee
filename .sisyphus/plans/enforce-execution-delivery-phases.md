# Enforce Execution + Delivery Phases for Every AI Employee

## TL;DR

> **Quick Summary**: Fix the "Employee produced output but has no delivery configuration" failure by consolidating the three tangled delivery fields (`deliverable_type` gate / `delivery_instructions` / `delivery_steps`) into a single canonical `delivery_steps` field resolved through one shared resolver, and enforce at creation time that every deliverable-producing employee always has a valid delivery phase — with delivery clearly being the post-approval side effect.
>
> **Deliverables**:
>
> - A shared, employee-agnostic delivery resolver returning a discriminated union (`has-delivery` | `no-delivery-escape-hatch` | `misconfigured`)
> - Two-step Prisma migration: backfill `delivery_steps` via `COALESCE`, then drop `delivery_instructions` (with mandatory prod backup + worker-first deploy order)
> - All 4 lifecycle gate sites + compiler reading the single resolver
> - Generator (prompt + postProcess) that always emits non-null delivery for deliverable employees
> - Hard-gate validation at draft-save (POST) and edit (PATCH) for empty delivery
> - Runtime + creation-time approval/classification consistency fix
> - Manual repair of the broken employee `ab1b5ecb`
> - Live wizard E2E (failure-mirroring + approval-required employee) proving both delivery paths
> - Doc fixes (AGENTS.md mislabel + drift-audit)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (resolver tests) → T2 (resolver) → T6 (migration) → T7-T10 (gate redirects) → T16 (E2E) → F1-F4 → user okay

---

## Context

### Original Request

User created a new tenant and a wizard-generated AI employee:

> "I need an AI employee that reads all of the Slack channels and then provides me with a summary, an executive summary of all of these Slack channels."

- Employee: `ab1b5ecb-382f-4821-9054-4ede7457d223`
- Tenant: `18aaaab7-44c1-42ee-a9e2-928679db78e0`
- Failed task: `6e249d03-b897-4bb9-9d09-3bf423ac41d1`
- Failure reason: **"Employee produced output but has no delivery configuration."**

The user wants to (1) fix the bug, (2) define a general execution-vs-delivery model across employee types, and (3) enforce at creation that EVERY employee has valid execution AND delivery steps, with delivery being what happens after approval — so flipping `approval_required` on/off never strands or mis-delivers an employee.

### Conceptual Model (the execution-vs-delivery boundary)

- **EXECUTION** = PRODUCE/draft the deliverable (build the summary, write the code/PR, draft the message, prepare the review). Side-effect-free or reversible.
- **DELIVERY** = the side-effecting RELEASE of the deliverable (post the summary, send the message, merge the PR, submit the review). When `approval_required: true`, delivery is exactly the set of actions gated behind approval.
- **Universal escape hatch**: an employee may legitimately deliver _inside_ execution and emit `NO_ACTION_NEEDED` (e.g. cleaning-schedule posts to Slack directly). Such employees have null delivery fields and that is VALID.

### Interview Summary

**Key Decisions**:

- Enforcement: BOTH auto-fill (generator derives default delivery) AND hard-gate at draft-save.
- Field model: FULL CONSOLIDATION to a single canonical field (`delivery_steps`).
- Migration rule: `delivery_steps = COALESCE(delivery_steps, delivery_instructions)` — never a blind overwrite (prevents google-assistant data loss).
- Canonical field holds the FULL delivery content (short or long).
- Column drop: single-phase (drop `delivery_instructions` in this release) — mitigated by mandatory prod backup + worker-image-first deploy order + transition-tolerant resolver.
- Approval/classification consistency: enforce at creation AND make the no-approval path runtime-tolerant (deliver instead of fail).
- Repair: fix ONLY the broken employee `ab1b5ecb` manually.
- E2E proof: brand-new wizard employee mirroring the original failure + an approval-required employee, both triggered live to `Done`.
- Tests: TDD (tests first).

**Research Findings**:

- Failure fires at `src/inngest/lifecycle/steps/no-approval-path.ts:174` (`failure_code: MISSING_DELIVERY_CONFIG`) only on the no-approval path when classification is `NEEDS_APPROVAL` AND `deliverable_type` is null. The summarizer was `approval_required:false` yet emitted `NEEDS_APPROVAL` (a contradiction) AND had empty `deliverable_type` — a double defect.
- Three overlapping fields disagree across code paths: `deliverable_type` gates the no-approval decision; `delivery_instructions` (older) gates the container spawn (`delivery-retry.ts:60`, `approval-handler.ts:304`); `delivery_steps` (newer) is what the compiler prefers (`delivery_steps ?? delivery_instructions ?? ''`).
- Generator produces empty delivery via 3 vectors: prompt JSON example literally shows `"delivery_steps": null`; `delivery_instructions` is told to mirror `delivery_steps`; converse-create allowlist passes null through and the blank-guard never fires on CREATE (baseline null).
- Approval ORDERING is already correct — delivery only spawns after `handleApprove`. No reordering needed.
- `delivery_instructions` and `delivery_steps` legitimately hold DIFFERENT content for some employees (google-assistant short step vs summarizer/guest-messaging long prompt) — so migration must COALESCE, not copy.

### Metis Review

**Identified Gaps** (addressed):

- Blind-copy migration = data loss → resolved via `COALESCE(delivery_steps, delivery_instructions)` + explicit google-assistant-unchanged assertion.
- Column drop breaks in-flight tasks + old worker image → resolved via prod backup + worker-first deploy order + transition-tolerant resolver + verification before drop.
- Two duplicate lifecycle gates (`delivery-retry.ts:60`, `approval-handler.ts:304`) easily missed → enumerated as separate tasks; `lsp_find_references` mandated before any removal.
- `deliverable_type` does double duty (gate + Slack card UX at `approval-handler.ts:454/490`) → retained for routing/UX; only the existence-gate moves to the resolver.
- Generator mirror rule keeps emitting null → rewritten in same change.
- Classification fix must be runtime + creation, not just config → both layers included.

---

## Work Objectives

### Core Objective

Make "Employee produced output but has no delivery configuration" structurally impossible by consolidating delivery into one canonical field resolved through one shared resolver, and enforcing valid delivery at creation/edit time — while preserving the legitimate `NO_ACTION_NEEDED` escape hatch and never losing existing delivery content.

### Concrete Deliverables

- `resolveDelivery()` shared resolver in `src/lib/` (discriminated union)
- Prisma migration(s): backfill `delivery_steps` via `COALESCE`, drop `delivery_instructions`
- Updated gate sites: `no-approval-path.ts`, `delivery-retry.ts`, `approval-handler.ts`, compiler (`agents-md-compiler.mts`, `execution-phase.mts`, `delivery-phase.mts`)
- Generator prompt + `postProcess` defaulting + converse-create allowlist
- Hard-gate validation in POST + PATCH `/archetypes`
- Runtime no-approval classification tolerance
- `seed.ts` updated to the single field
- Manual SQL patch for `ab1b5ecb` (tenant-scoped)
- Live E2E: new wizard employee (failure-mirror) + approval-required employee to `Done`
- Doc fixes (AGENTS.md, drift-audit)

### Definition of Done

- [ ] `pnpm test -- --run` and `pnpm test:integration` pass
- [ ] Migration verification query returns ZERO deliverable employees (`deliverable_type IS NOT NULL`) with empty `delivery_steps`, except documented escape-hatch employees
- [ ] google-assistant `delivery_steps` UNCHANGED post-migration
- [ ] Live wizard E2E employee mirroring original failure reaches `tasks.status = Done` with the summary delivered to Slack
- [ ] An `approval_required:true` employee reaches `Done` via Approve, proving the approval-path resolver
- [ ] `ab1b5ecb` repaired and re-triggerable

### Must Have

- Single canonical delivery field (`delivery_steps`) read everywhere via one resolver
- `COALESCE` migration (no data loss)
- Mandatory prod DB backup before migration + documented worker-first deploy order
- Hard-gate at POST and PATCH for empty delivery on deliverable employees
- Preserved `NO_ACTION_NEEDED` null-delivery escape hatch
- Generator always emits non-null delivery for deliverable employees
- Runtime no-approval path delivers `NEEDS_APPROVAL`-from-`approval_required:false` instead of failing

### Must NOT Have (Guardrails)

- NO row `DELETE` / `deleteMany` anywhere (soft-delete only; column DROP via DDL is allowed)
- NO blind `delivery_instructions → delivery_steps` overwrite (must COALESCE)
- NO employee-specific language (summary/guest/Hostfully/Slack) in logs/vars/comments of shared files (`src/inngest`, `src/workers`, `src/lib`)
- NO reordering of the approval/delivery lifecycle (already correct)
- NO changes to the Slack card-copy `deliversToChannel` logic except to confirm it still reads `deliverable_type`
- NO broad repair sweep of other employees (only `ab1b5ecb`)
- NO redesign of `deliverable_type`, `risk_model`, or the broader archetype schema
- NO new delivery-type templates beyond a single sensible default
- NO unscoped `UPDATE` (every UPDATE/patch scoped by `tenant_id`)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No "user manually tests/confirms".

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: TDD — RED (failing test) → GREEN (minimal impl) → REFACTOR
- **Framework**: vitest (`pnpm test -- --run` unit, `pnpm test:integration` DB-backed)

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Backend/lifecycle/resolver**: Bash (vitest + psql) — run tests, query DB, assert rows/values
- **API (POST/PATCH /archetypes)**: Bash (curl) — send requests with `Authorization: Bearer $SERVICE_TOKEN`, assert status + error code
- **Live employee E2E**: Bash (admin API trigger) + psql polling of `tasks.status` / `task_status_log`; Playwright/CDP only if Slack-message visual confirmation is needed
- **Migration**: Bash (psql) — assert backfill correctness + zero-violation query

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — TDD red tests + design contracts):
├── Task 1: Resolver unit tests (RED) [quick]
├── Task 3: Gate-redirect tests for no-approval path (RED) [unspecified-high]
├── Task 4: Draft-save + PATCH hard-gate tests (RED) [unspecified-high]
├── Task 5: Generator postProcess delivery-default tests (RED) [unspecified-high]
└── Task 11: Migration verification query + seed-update spec (design) [quick]

Wave 2 (After Wave 1 — implement to GREEN):
├── Task 2: resolveDelivery() shared resolver (depends: 1) [deep]
├── Task 6: Prisma migration backfill+drop + prod backup task (depends: 11) [deep]
├── Task 8: Generator prompt fix + postProcess default + allowlist (depends: 5) [deep]
├── Task 9: POST + PATCH hard-gate validation (depends: 4) [unspecified-high]
└── Task 10: seed.ts single-field update (depends: 11) [quick]

Wave 3 (After Wave 2 — wire resolver into all gate sites + runtime fix):
├── Task 7: Redirect no-approval-path gate to resolver + classification tolerance (depends: 2, 3) [deep]
├── Task 12: Redirect delivery-retry.ts gate to resolver (depends: 2) [unspecified-high]
├── Task 13: Redirect approval-handler.ts gate to resolver (depends: 2) [unspecified-high]
├── Task 14: Compiler reads canonical field; remove `?? delivery_instructions` fallback (depends: 2, 6) [unspecified-high]
└── Task 15: Manual tenant-scoped patch of ab1b5ecb (depends: 6) [quick]

Wave 4 (After Wave 3 — build, live E2E, docs):
├── Task 16: Docker worker image rebuild + live wizard E2E (failure-mirror + approval-required) (depends: 7,12,13,14) [unspecified-high]
├── Task 17: Doc fixes — AGENTS.md mislabel + drift-audit (depends: 6,7,14) [writing]
└── Task 18: Notify completion (Telegram) (depends: 16,17) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA + live E2E re-run (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T2 → T7 → T16 → F1-F4 → user okay
Max Concurrent: 5 (Waves 1 & 2)
```

### Dependency Matrix

- **1**: deps — | blocks 2, 7
- **3**: deps — | blocks 7
- **4**: deps — | blocks 9
- **5**: deps — | blocks 8
- **11**: deps — | blocks 6, 10
- **2**: deps 1 | blocks 7, 12, 13, 14
- **6**: deps 11 | blocks 14, 15, 16
- **8**: deps 5 | blocks 16
- **9**: deps 4 | blocks 16
- **10**: deps 11 | blocks 16
- **7**: deps 2, 3 | blocks 16
- **12**: deps 2 | blocks 16
- **13**: deps 2 | blocks 16
- **14**: deps 2, 6 | blocks 16, 17
- **15**: deps 6 | blocks 16
- **16**: deps 7,12,13,14,8,9,10,15 | blocks 18, F-wave
- **17**: deps 6,7,14 | blocks 18
- **18**: deps 16,17 | blocks F-wave

### Agent Dispatch Summary

- **Wave 1**: 5 — T1 → `quick`; T3,T4,T5 → `unspecified-high`; T11 → `quick`
- **Wave 2**: 5 — T2,T6,T8 → `deep`; T9 → `unspecified-high`; T10 → `quick`
- **Wave 3**: 5 — T7 → `deep`; T12,T13,T14 → `unspecified-high`; T15 → `quick`
- **Wave 4**: 3 — T16 → `unspecified-high`; T17 → `writing`; T18 → `quick`
- **FINAL**: 4 — F1 → `oracle`; F2 → `unspecified-high`; F3 → `unspecified-high`; F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. EVERY task has Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Resolver unit tests (RED)

  **What to do**:
  - Write failing vitest unit tests for a not-yet-existing `resolveDelivery(archetype, classification)` in `src/lib/`.
  - Cover all 4 cases: (a) `delivery_steps` non-empty → `{ kind: 'has-delivery', content: <delivery_steps> }`; (b) `delivery_steps` null but legacy `delivery_instructions` present (transition tolerance) → `{ kind: 'has-delivery', content: <delivery_instructions> }`; (c) `delivery_steps` empty + `deliverable_type` set → `{ kind: 'misconfigured' }`; (d) `delivery_steps`/`delivery_instructions` null + classification `NO_ACTION_NEEDED` + `deliverable_type` null → `{ kind: 'no-delivery-escape-hatch' }`.
  - Add case: `approval_required:false` + classification `NEEDS_APPROVAL` + `delivery_steps` set → `has-delivery` (the original bug scenario must resolve to deliverable, not misconfigured).

  **Must NOT do**: Implement the resolver yet (RED phase). No employee-specific names in test fixtures' shared strings.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: focused single-file test authoring against a defined contract.
  - **Skills**: [`data-access-conventions`] — to match repo PostgREST/archetype row shapes. **Omitted**: lifecycle/inngest skills (resolver is pure logic, no Inngest).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1
  - **Blocks**: Task 2 | **Blocked By**: None

  **References**:
  - `src/inngest/lifecycle/steps/no-approval-path.ts:72,158-204` — current gate logic the resolver replaces (the predicate truth table).
  - `src/workers/lib/execution-phase.mts:256` and `src/workers/lib/delivery-phase.mts:123` — the `delivery_steps ?? delivery_instructions ?? ''` fallback the resolver formalizes.
  - `src/workers/lib/postgrest-types.ts` — typed archetype row shape (snake_case) for fixtures.
  - `tests/unit/` — existing unit test structure/conventions to follow.
  - WHY: the resolver must reproduce today's truth table exactly PLUS fix the bug case; tests encode that table.

  **Acceptance Criteria**:
  - [ ] Test file created under `tests/unit/` (e.g. `delivery-resolver.test.ts`)
  - [ ] `pnpm test -- --run tests/unit/delivery-resolver.test.ts` → FAILS (resolver not implemented) — confirms RED

  **QA Scenarios**:

  ```
  Scenario: RED phase confirmed
    Tool: Bash (vitest)
    Steps:
      1. Run `pnpm test -- --run tests/unit/delivery-resolver.test.ts`
      2. Assert output shows failures referencing missing resolveDelivery
    Expected Result: Non-zero exit, tests fail because resolveDelivery does not exist
    Evidence: .sisyphus/evidence/task-1-red.txt
  ```

  **Commit**: NO (groups with 2)

- [x] 2. `resolveDelivery()` shared resolver (GREEN)

  **What to do**:
  - Implement `resolveDelivery()` in `src/lib/` (new file, e.g. `delivery-resolver.ts`) returning the discriminated union from Task 1.
  - Predicate: `delivery_steps` non-empty → has-delivery(delivery_steps); else `delivery_instructions` non-empty → has-delivery(delivery_instructions) [transition tolerance]; else if `deliverable_type` set AND classification ≠ `NO_ACTION_NEEDED` → misconfigured; else → no-delivery-escape-hatch.
  - Export a typed `DeliveryResolution` union. Keep it employee-agnostic.

  **Must NOT do**: Inline this logic at call sites (must be single shared function). No employee-specific strings.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: load-bearing shared abstraction consumed by 4+ gate sites; correctness critical.
  - **Skills**: [`data-access-conventions`] — repo data-access/shared-lib conventions. **Omitted**: visual/frontend.

  **Parallelization**:
  - **Can Run In Parallel**: NO (consumed by many) — **Group**: Wave 2
  - **Blocks**: 7, 12, 13, 14 | **Blocked By**: 1

  **References**:
  - `src/lib/output-contract-constants.ts:25` — `DEFAULT_DELIVERY_INSTRUCTIONS` (the default content the generator will reuse; resolver should NOT hardcode it).
  - `src/lib/task-status.ts` — example of a small shared `src/lib` module + export style.
  - Task 1 tests — the exact contract to satisfy.
  - WHY: this single function becomes the only place delivery-existence is decided; every gate must call it.

  **Acceptance Criteria**:
  - [ ] `src/lib/delivery-resolver.ts` created with exported `resolveDelivery` + `DeliveryResolution` type
  - [ ] `pnpm test -- --run tests/unit/delivery-resolver.test.ts` → PASS (all cases)
  - [ ] `tsc --noEmit` clean for the new file

  **QA Scenarios**:

  ```
  Scenario: Resolver GREEN
    Tool: Bash (vitest)
    Steps:
      1. Run `pnpm test -- --run tests/unit/delivery-resolver.test.ts`
      2. Assert all cases pass, exit 0
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-2-green.txt

  Scenario: Single-source check (negative)
    Tool: Bash (grep)
    Steps:
      1. Confirm resolveDelivery is defined exactly once: `grep -rn "function resolveDelivery\|export const resolveDelivery" src/`
    Expected Result: Exactly one definition
    Evidence: .sisyphus/evidence/task-2-single-source.txt
  ```

  **Commit**: YES — `feat(lifecycle): add shared delivery resolver` — Files: `src/lib/delivery-resolver.ts`, `tests/unit/delivery-resolver.test.ts` — Pre-commit: `pnpm test -- --run`

- [x] 3. No-approval path gate-redirect tests (RED)

  **What to do**:
  - Write failing tests for `runNoApprovalPath` covering: (a) `approval_required:false` + classification `NEEDS_APPROVAL` + valid `delivery_steps` → proceeds to delivery (NOT `MISSING_DELIVERY_CONFIG`) — this is the original bug; (b) `NO_ACTION_NEEDED` + null delivery → `Done` (escape hatch preserved); (c) `deliverable_type` set + empty delivery → still `misconfigured`/Failed.
  - Use the existing lifecycle test mock factory.

  **Must NOT do**: Implement the runtime change yet. No reordering assertions (ordering already correct).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: Inngest step mocking is non-trivial; needs care.
  - **Skills**: [`inngest`, `debugging-lifecycle`] — `inngest`: step-function mocking and `InngestStep` type; `debugging-lifecycle`: the 13 states + auto-pass/blocking semantics. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1
  - **Blocks**: 7 | **Blocked By**: None

  **References**:
  - `src/inngest/lifecycle/steps/no-approval-path.ts:59-280` — the full function under test (skip logic L72, deliverable_type guard L158-204, delivery dispatch L251-280).
  - `tests/helpers/lifecycle-mocks.ts` — `createLifecycleMocks()` factory.
  - Existing lifecycle step tests under `tests/unit/` — pattern for mocking `step.run`/`patchTask`.
  - WHY: these tests lock the bug-fix behavior so Task 7's runtime change is verifiable.

  **Acceptance Criteria**:
  - [ ] Test file created/extended for no-approval path
  - [ ] `pnpm test -- --run` on that file → FAILS (current code still emits MISSING_DELIVERY_CONFIG for case a) — confirms RED

  **QA Scenarios**:

  ```
  Scenario: RED — bug case currently fails
    Tool: Bash (vitest)
    Steps:
      1. Run the new no-approval-path test file
      2. Assert case (a) fails against current code
    Expected Result: Test red for the NEEDS_APPROVAL+approval_required:false case
    Evidence: .sisyphus/evidence/task-3-red.txt
  ```

  **Commit**: NO (groups with 7)

- [x] 4. Draft-save + PATCH hard-gate tests (RED)

  **What to do**:
  - Write failing API tests: `POST /admin/tenants/:tid/archetypes` with `deliverable_type:'slack_message'` + empty delivery → expect `400` + specific error code (e.g. `MISSING_DELIVERY_CONFIG` from `ERROR_CODES`); same body with `deliverable_type:null` → expect `201` (escape hatch passes).
  - `PATCH /admin/tenants/:tid/archetypes/:id` flipping `approval_required` false→true and true→false on an employee with empty delivery → assert gate fires consistently with the create path.

  **Must NOT do**: Implement validation yet. Do not assert on `delivery_instructions` (being removed).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: route + Zod + auth wiring requires care.
  - **Skills**: [`api-design`, `security`] — `api-design`: `sendError`/`sendSuccess`, `ERROR_CODES`, UUID_REGEX, tenant-scoped routes; `security`: Bearer auth/SERVICE_TOKEN for test requests. **Omitted**: inngest.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1
  - **Blocks**: 9 | **Blocked By**: None

  **References**:
  - `src/gateway/routes/admin-archetypes.ts:82-116` (`CreateArchetypeBodySchema`), `:169-288` (POST handler), `:199-204` (existing backfill), PATCH handler.
  - `src/gateway/lib/http-response.ts` — `sendError`/`sendSuccess`.
  - `src/gateway/lib/prisma-helpers.ts` — `ERROR_CODES`.
  - `tests/integration/` — DB-backed route test conventions + auth header setup.
  - WHY: these tests define the exact enforcement contract Task 9 implements.

  **Acceptance Criteria**:
  - [ ] Integration test file created for create + patch gate
  - [ ] `pnpm test:integration` on that file → FAILS (no validation yet) — RED

  **QA Scenarios**:

  ```
  Scenario: RED — empty delivery currently accepted
    Tool: Bash (vitest integration)
    Steps:
      1. Run the new gate test file
      2. Assert POST with deliverable_type set + empty delivery currently returns 201 (should be 400) → test fails
    Expected Result: Red
    Evidence: .sisyphus/evidence/task-4-red.txt
  ```

  **Commit**: NO (groups with 9)

- [x] 5. Generator postProcess delivery-default tests (RED)

  **What to do**:
  - Write failing unit tests for `postProcess()` (and `applyCreateAllowlist`): given a generated proposal where the model returns `delivery_steps: null` but `deliverable_type` is set (or `approval_required:false` but the employee produces a deliverable), `postProcess` must DERIVE a non-null default `delivery_steps`.
  - Add a test asserting the generator no longer mirrors null and the escape-hatch case (no deliverable_type) leaves delivery null.

  **Must NOT do**: Implement the generator change yet. Don't assert exact default wording beyond "non-empty + mentions posting the result" (avoid brittle string match).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: generator post-processing has subtle branching.
  - **Skills**: [`creating-archetypes`] — archetype field semantics + generation pipeline. **Omitted**: inngest, visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1
  - **Blocks**: 8 | **Blocked By**: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:348-474` (`postProcess`), `:338-346` (`PostProcessedArchetypeSchema`), `:60-61` (response type).
  - `src/gateway/routes/admin-archetype-converse-create.ts:75-98` (`applyCreateAllowlist`), `:44-73` (`buildEmptyBaseline`).
  - `src/lib/output-contract-constants.ts:25` — `DEFAULT_DELIVERY_INSTRUCTIONS` (reusable default content).
  - WHY: encodes that generation can never emit empty delivery for a deliverable employee.

  **Acceptance Criteria**:
  - [ ] Test file created/extended for generator post-processing
  - [ ] `pnpm test -- --run` on it → FAILS — RED

  **QA Scenarios**:

  ```
  Scenario: RED — generator currently passes null through
    Tool: Bash (vitest)
    Steps:
      1. Run the generator postProcess test file
      2. Assert null-delivery-for-deliverable case fails against current code
    Expected Result: Red
    Evidence: .sisyphus/evidence/task-5-red.txt
  ```

  **Commit**: NO (groups with 8)

- [x] 11. Migration verification query + seed-update spec (design)

  **What to do**:
  - Author (in the plan-adjacent scratch or as a committed SQL/markdown note) the exact verification query: zero rows where `deleted_at IS NULL AND deliverable_type IS NOT NULL AND (delivery_steps IS NULL OR delivery_steps = '')`, excluding documented escape-hatch employees.
  - Enumerate every seed archetype and its target `delivery_steps` post-consolidation (COALESCE result): summarizer/guest-messaging/code-rotation get their `delivery_instructions` content moved into `delivery_steps`; google-assistant keeps its existing short `delivery_steps`; cleaning-schedule stays null (escape hatch). Produce the authoritative before/after table for Tasks 6 & 10.

  **Must NOT do**: Run the migration or edit seed yet. Don't include `deliverable_type` redesign.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: research + spec doc, no code.
  - **Skills**: [`prisma`, `feature-verification`] — `prisma`: migration/seed conventions, PostgREST-vs-psql; `feature-verification`: zero-rows-is-failure rule. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1
  - **Blocks**: 6, 10 | **Blocked By**: None

  **References**:
  - `prisma/seed.ts` — summarizer (~L3117-3155), guest-messaging (~L3207-3298), code-rotation (~L3306-3395), cleaning-schedule (~L3465-3999), google-workspace-assistant (~L5251-5308).
  - `prisma/schema.prisma:171-222` — Archetype model.
  - AGENTS.md "Database Backup (MANDATORY before any reseed or wipe)" + `production-ops` skill.
  - WHY: the COALESCE migration and seed edits must be driven by an authoritative per-employee target table to avoid data loss.

  **Acceptance Criteria**:
  - [ ] Per-employee before/after `delivery_steps` table produced (committed under `.sisyphus/evidence/task-11-migration-spec.md`)
  - [ ] Verification query string finalized and recorded

  **QA Scenarios**:

  ```
  Scenario: Spec completeness
    Tool: Bash (psql read-only)
    Steps:
      1. Query current delivery_steps + delivery_instructions + deliverable_type for all archetypes: `psql ... -c "SELECT role_name, deliverable_type, delivery_steps, delivery_instructions FROM archetypes WHERE deleted_at IS NULL;"`
      2. Confirm the spec's before-values match live DB
    Expected Result: Spec matches DB; every deliverable employee has a defined target
    Evidence: .sisyphus/evidence/task-11-spec-check.txt
  ```

  **Commit**: NO (design artifact only)

- [x] 6. Prisma migration: backfill (COALESCE) + drop delivery_instructions + prod backup

  **What to do**:
  - **First**: take a prod DB backup per AGENTS.md ("Database Backup (MANDATORY)" / `production-ops`) → `database-backups/<timestamp>/`. This is a hard precondition; record the path.
  - Write a Prisma migration that: (1) backfills `UPDATE archetypes SET delivery_steps = COALESCE(delivery_steps, delivery_instructions) WHERE delivery_steps IS NULL` (tenant-agnostic backfill is fine — it's a global archetype table, but DO NOT touch rows where `delivery_steps` already set); (2) drops the `delivery_instructions` column.
  - Update `prisma/schema.prisma` to remove `delivery_instructions`. Reload PostgREST schema cache (`NOTIFY pgrst, 'reload schema'`) per `prisma` skill.
  - **Document the deploy-order requirement** in the migration's accompanying note + commit body: worker Fly image MUST be rebuilt+deployed (Task 16 builds it locally; production deploy ordering noted) BEFORE this column-drop migration runs in prod. Resolver (Task 2) tolerates the old shape during the transition.

  **Must NOT do**: Blind copy (must be COALESCE, only where `delivery_steps IS NULL`). No row DELETE. Don't drop `deliverable_type`. Don't skip the backup.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: irreversible prod schema change; data-loss risk; backup + ordering discipline.
  - **Skills**: [`prisma`, `production-ops`, `data-access-conventions`] — `prisma`: migration workflow + schema-cache reload + soft-delete rule; `production-ops`: backup procedure + Render/Fly deploy mechanics; `data-access-conventions`: PostgREST reload. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: NO (schema lock) — **Group**: Wave 2
  - **Blocks**: 14, 15, 16 | **Blocked By**: 11

  **References**:
  - `prisma/schema.prisma:171-222` — Archetype model (remove `delivery_instructions String? @db.Text`).
  - Task 11 spec — the authoritative before/after table.
  - AGENTS.md "Database Backup" + `prisma` skill (schema-cache reload) + CI/CD migrate-on-merge section (port 5432 only for prod).
  - `src/inngest/lifecycle/steps/delivery-retry.ts:60`, `approval-handler.ts:304` — these read `delivery_instructions` today; Tasks 12/13 redirect them. Migration MUST land conceptually with those redirects (same release) so the column is unused before drop.
  - WHY: COALESCE + ordering prevents both data loss and in-flight breakage.

  **Acceptance Criteria**:
  - [ ] Backup created; path recorded in evidence
  - [ ] Migration applies cleanly: `pnpm prisma migrate deploy` (local) succeeds
  - [ ] Post-migration verification query returns 0 violating rows (deliverable employees with empty `delivery_steps`, except escape hatch)
  - [ ] google-assistant `delivery_steps` UNCHANGED
  - [ ] `delivery_instructions` column no longer exists; PostgREST schema reloaded

  **QA Scenarios**:

  ```
  Scenario: Backfill correctness (happy)
    Tool: Bash (psql)
    Steps:
      1. `psql ... -c "SELECT role_name FROM archetypes WHERE deleted_at IS NULL AND deliverable_type IS NOT NULL AND (delivery_steps IS NULL OR delivery_steps='');"`
    Expected Result: 0 rows
    Evidence: .sisyphus/evidence/task-6-violations.txt

  Scenario: No data loss on divergent employee (negative-guard)
    Tool: Bash (psql)
    Steps:
      1. `psql ... -c "SELECT delivery_steps FROM archetypes WHERE role_name='google-workspace-assistant';"`
    Expected Result: 'Post the task results to the configured Slack channel.' (unchanged)
    Evidence: .sisyphus/evidence/task-6-google-unchanged.txt

  Scenario: Column dropped
    Tool: Bash (psql)
    Steps:
      1. `psql ... -c "\d archetypes"` and grep for delivery_instructions
    Expected Result: delivery_instructions absent
    Evidence: .sisyphus/evidence/task-6-schema.txt
  ```

  **Commit**: YES — `feat(db): consolidate delivery fields to delivery_steps` — Files: `prisma/schema.prisma`, `prisma/migrations/*`, backup note — Pre-commit: `pnpm test -- --run`

- [ ] 8. Generator prompt fix + postProcess default + allowlist (GREEN)

  **What to do**:
  - In `archetype-generator-prompts.ts`: change the JSON example so `delivery_steps` shows a REAL example value (not `null`); rewrite the mirror rule (~L282) so the model is told `delivery_steps` MUST be non-null when the employee produces a deliverable; add an explicit rule tying classification to `approval_required`. Update `CONVERSE_SYSTEM_PROMPT` accordingly.
  - In `archetype-generator.ts:postProcess()`: derive a default `delivery_steps` (reuse `DEFAULT_DELIVERY_INSTRUCTIONS` content) when the model returns null but the employee is deliverable (`deliverable_type` set OR produces NEEDS_APPROVAL). Keep the escape hatch (no deliverable_type → leave null). Remove any logic that nulls delivery to mirror.
  - In `applyCreateAllowlist`: stop passing raw null through for deliverable employees (delegate to the same default).

  **Must NOT do**: Reference removed `delivery_instructions` field. Don't hardcode employee-specific delivery wording.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: LLM-prompt + post-processing correctness drives all future creations.
  - **Skills**: [`creating-archetypes`, `employee-creation-debugging`] — generation pipeline + converse paths + trace tables. **Omitted**: inngest.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 2
  - **Blocks**: 16 | **Blocked By**: 5

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:77,213-222,234-235,282,315-361`.
  - `src/gateway/services/archetype-generator.ts:348-474,338-346`.
  - `src/gateway/routes/admin-archetype-converse-create.ts:75-98`.
  - `src/lib/output-contract-constants.ts:25`.
  - Task 5 tests — must go GREEN.
  - WHY: this closes the 3 generation failure vectors at the source.

  **Acceptance Criteria**:
  - [ ] Task 5 tests PASS
  - [ ] Prompt JSON example no longer shows `"delivery_steps": null`
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: Generator GREEN
    Tool: Bash (vitest)
    Steps:
      1. Run the Task-5 generator test file
    Expected Result: 0 failures
    Evidence: .sisyphus/evidence/task-8-green.txt

  Scenario: No null-delivery example survives (negative)
    Tool: Bash (grep)
    Steps:
      1. `grep -n '"delivery_steps": null' src/gateway/services/prompts/archetype-generator-prompts.ts`
    Expected Result: No match
    Evidence: .sisyphus/evidence/task-8-no-null-example.txt
  ```

  **Commit**: YES — `feat(archetypes): generator always emits delivery phase` — Files: prompts + generator + converse-create — Pre-commit: `pnpm test -- --run`

- [ ] 9. POST + PATCH hard-gate validation (GREEN)

  **What to do**:
  - In `admin-archetypes.ts`: replace the soft `delivery_instructions` backfill with a HARD gate using the shared resolver logic: if `deliverable_type` is set but resolved delivery is empty → `sendError(... 400 ...)` with an `ERROR_CODES` code. If `deliverable_type` is null (escape hatch) → allow.
  - Apply the same gate on the PATCH path, including when `approval_required` is flipped — ensure flipping false→true on an employee with empty delivery is rejected consistently.
  - Write to `delivery_steps` only (no `delivery_instructions`).

  **Must NOT do**: Break the escape hatch (deliverable_type null must pass). Don't touch card-copy `deliversToChannel`. No inline `res.status().json()` — use `sendError`/`sendSuccess`.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: route + Zod + auth + consistent create/patch enforcement.
  - **Skills**: [`api-design`, `security`] — response helpers + ERROR_CODES + UUID_REGEX + auth. **Omitted**: inngest.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 2
  - **Blocks**: 16 | **Blocked By**: 4

  **References**:
  - `src/gateway/routes/admin-archetypes.ts:82-116,169-288,199-204` (replace backfill), PATCH handler.
  - `src/gateway/lib/archetype-edit-helpers.ts:157-216` (`validateProposalFields` — keep never-block for tools/triggers, add affirmative delivery check on the gate path).
  - `src/lib/delivery-resolver.ts` (Task 2) — reuse for the predicate.
  - `src/gateway/lib/http-response.ts`, `src/gateway/lib/prisma-helpers.ts` (`ERROR_CODES`).
  - Task 4 tests — must go GREEN.
  - WHY: this is the creation/edit hard gate that makes empty delivery impossible to persist.

  **Acceptance Criteria**:
  - [ ] Task 4 tests PASS
  - [ ] POST/PATCH with deliverable_type set + empty delivery → 400 + error code
  - [ ] POST/PATCH with deliverable_type null + empty delivery → 2xx
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: Reject empty delivery (happy gate)
    Tool: Bash (curl)
    Steps:
      1. POST /admin/tenants/<tid>/archetypes with Authorization: Bearer $SERVICE_TOKEN, deliverable_type=slack_message, empty delivery_steps
      2. Assert HTTP 400 and the specific ERROR_CODES value in body
    Expected Result: 400 with delivery-config error code
    Evidence: .sisyphus/evidence/task-9-reject.txt

  Scenario: Escape hatch passes (negative)
    Tool: Bash (curl)
    Steps:
      1. POST same route with deliverable_type=null, empty delivery_steps
    Expected Result: 2xx (created)
    Evidence: .sisyphus/evidence/task-9-escape-hatch.txt
  ```

  **Commit**: YES — `feat(archetypes): hard-gate empty delivery at create and edit` — Files: `admin-archetypes.ts`, `archetype-edit-helpers.ts`, tests — Pre-commit: `pnpm test:integration`

- [ ] 10. seed.ts single-field update (GREEN)

  **What to do**:
  - Update `prisma/seed.ts` so every archetype sets `delivery_steps` (per Task 11 spec) and no archetype references the removed `delivery_instructions`. Summarizer/guest-messaging/code-rotation move their long delivery content into `delivery_steps`; google-assistant keeps its short step; cleaning-schedule stays null (escape hatch).
  - Verify seed runs cleanly against a fresh DB.

  **Must NOT do**: Reference `delivery_instructions`. Don't change `deliverable_type` values. No row DELETE.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: mechanical field move driven by an authoritative spec.
  - **Skills**: [`prisma`] — seed conventions + schema-cache reload. **Omitted**: inngest, visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 2
  - **Blocks**: 16 | **Blocked By**: 11

  **References**:
  - `prisma/seed.ts` archetype blocks (see Task 11 reference line ranges).
  - Task 11 spec table — authoritative target values.
  - AGENTS.md "Database Backup (MANDATORY before any reseed or wipe)" — back up before reseeding locally to verify.
  - WHY: seed is the source of truth for fresh DBs; it must reflect the consolidated field.

  **Acceptance Criteria**:
  - [ ] No `delivery_instructions` reference remains in `seed.ts`
  - [ ] (After backup) `pnpm prisma db seed` runs cleanly
  - [ ] Post-seed verification query returns 0 violating rows

  **QA Scenarios**:

  ```
  Scenario: Seed has no removed field (negative)
    Tool: Bash (grep)
    Steps:
      1. `grep -n delivery_instructions prisma/seed.ts`
    Expected Result: No match
    Evidence: .sisyphus/evidence/task-10-grep.txt

  Scenario: Fresh seed valid
    Tool: Bash (psql)
    Steps:
      1. Back up DB, reseed, run the violation query
    Expected Result: 0 violating rows; google-assistant unchanged
    Evidence: .sisyphus/evidence/task-10-seed-verify.txt
  ```

  **Commit**: YES — `feat(db): update seed to consolidated delivery field` — Files: `prisma/seed.ts` — Pre-commit: `pnpm test -- --run`

- [ ] 7. Redirect no-approval-path gate to resolver + classification tolerance (GREEN)

  **What to do**:
  - In `no-approval-path.ts`, replace the `deliverable_type`-based existence gate (L158-204) and the skip logic (L72) with calls to `resolveDelivery()`. Map: `has-delivery` → spawn delivery; `no-delivery-escape-hatch` → `Done`; `misconfigured` → Failed `MISSING_DELIVERY_CONFIG`.
  - Add runtime tolerance: an `approval_required:false` employee that emits `NEEDS_APPROVAL` but HAS valid delivery → DELIVER (do not fail). This is the true root-cause fix so legacy/hand-edited employees can't strand.
  - Keep `deliverable_type` read where the card UX needs it (do not remove that usage).

  **Must NOT do**: Change approval ordering. Remove `deliverable_type` entirely. Employee-specific strings in logs/comments.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: core lifecycle branch + the user's central bug fix.
  - **Skills**: [`inngest`, `debugging-lifecycle`] — step modules + state semantics. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: NO (central file) — **Group**: Wave 3
  - **Blocks**: 16 | **Blocked By**: 2, 3

  **References**:
  - `src/inngest/lifecycle/steps/no-approval-path.ts:59-280` (skip L72, gate L158-204, dispatch L251-280).
  - `src/lib/delivery-resolver.ts` (Task 2).
  - `src/inngest/lifecycle/steps/approval-handler.ts:454,490` — confirm `deliverable_type` card-copy usage stays intact.
  - Task 3 tests — must go GREEN.
  - WHY: this is where the reported failure originates; it must now deliver instead of fail for the valid case.

  **Acceptance Criteria**:
  - [ ] Task 3 tests PASS
  - [ ] No-approval path uses `resolveDelivery`; no inline `deliverable_type` existence-gate remains
  - [ ] Escape hatch still reaches `Done`; bug case now delivers

  **QA Scenarios**:

  ```
  Scenario: Bug case now delivers (happy)
    Tool: Bash (vitest)
    Steps:
      1. Run Task-3 no-approval tests
      2. Assert NEEDS_APPROVAL + approval_required:false + valid delivery → delivery path, not Failed
    Expected Result: Pass
    Evidence: .sisyphus/evidence/task-7-green.txt

  Scenario: Escape hatch preserved (negative)
    Tool: Bash (vitest)
    Steps:
      1. Assert NO_ACTION_NEEDED + null delivery → Done (not Failed)
    Expected Result: Pass
    Evidence: .sisyphus/evidence/task-7-escape.txt
  ```

  **Commit**: YES — `fix(lifecycle): route no-approval delivery through resolver` — Files: `no-approval-path.ts`, tests — Pre-commit: `pnpm test -- --run`

- [ ] 12. Redirect delivery-retry.ts gate to resolver (GREEN)

  **What to do**:
  - Replace the `delivery_instructions`-null check (`delivery-retry.ts:60-70`) with `resolveDelivery()`: `misconfigured` → Failed; otherwise proceed with resolved content. Stop reading `delivery_instructions` directly.

  **Must NOT do**: Reorder retry logic. Reference removed field directly. Employee-specific strings.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: focused gate swap in a retry loop.
  - **Skills**: [`inngest`, `debugging-lifecycle`]. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 3
  - **Blocks**: 16 | **Blocked By**: 2

  **References**:
  - `src/inngest/lifecycle/steps/delivery-retry.ts:59-96`.
  - `src/lib/delivery-resolver.ts` (Task 2).
  - Use `lsp_find_references` on `delivery_instructions` to confirm this and Task 13 are the only lifecycle gate readers.
  - WHY: one of two duplicate gates Metis flagged; both must move to the resolver.

  **Acceptance Criteria**:
  - [ ] `delivery-retry.ts` no longer reads `delivery_instructions`; uses resolver
  - [ ] `pnpm test -- --run` lifecycle tests pass
  - [ ] `tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: Gate uses resolver (negative)
    Tool: Bash (grep)
    Steps:
      1. `grep -n delivery_instructions src/inngest/lifecycle/steps/delivery-retry.ts`
    Expected Result: No match
    Evidence: .sisyphus/evidence/task-12-grep.txt
  ```

  **Commit**: YES — `refactor(lifecycle): delivery-retry uses resolver` — Files: `delivery-retry.ts` — Pre-commit: `pnpm test -- --run`

- [ ] 13. Redirect approval-handler.ts gate to resolver (GREEN)

  **What to do**:
  - Replace the `delivery_instructions`-null check in `approval-handler.ts` (L304-315) with `resolveDelivery()`. Keep the `deliverable_type` card-copy usage at L454/L490 intact.

  **Must NOT do**: Touch the Slack card-copy `deliversToChannel` logic. Reference removed field. Reorder approval flow.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: approval-path gate swap with adjacent UX to preserve.
  - **Skills**: [`inngest`, `slack-conventions`] — `inngest`: step semantics; `slack-conventions`: confirm card-copy untouched. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 3
  - **Blocks**: 16 | **Blocked By**: 2

  **References**:
  - `src/inngest/lifecycle/steps/approval-handler.ts:190,303-344,430,454,490`.
  - `src/lib/delivery-resolver.ts` (Task 2).
  - WHY: the second duplicate gate; proves the approval path uses the same resolver.

  **Acceptance Criteria**:
  - [ ] `approval-handler.ts` gate uses resolver; card-copy `deliverable_type` usage unchanged
  - [ ] Lifecycle tests pass; `tsc --noEmit` clean

  **QA Scenarios**:

  ```
  Scenario: Gate uses resolver, card UX intact
    Tool: Bash (grep)
    Steps:
      1. `grep -n "delivery_instructions" src/inngest/lifecycle/steps/approval-handler.ts` → no match
      2. `grep -n "deliversToChannel\|deliverable_type" src/inngest/lifecycle/steps/approval-handler.ts` → still present
    Expected Result: delivery_instructions gone; deliverable_type card usage retained
    Evidence: .sisyphus/evidence/task-13-grep.txt
  ```

  **Commit**: YES — `refactor(lifecycle): approval-handler uses resolver` — Files: `approval-handler.ts` — Pre-commit: `pnpm test -- --run`

- [ ] 14. Compiler reads canonical field; remove `?? delivery_instructions` fallback (GREEN)

  **What to do**:
  - Update `agents-md-compiler.mts`, `execution-phase.mts:256`, `delivery-phase.mts:123` to read `delivery_steps` (via resolver where appropriate) and REMOVE the `?? delivery_instructions` fallback now that the column is gone.
  - Update `postgrest-types.ts` to drop `delivery_instructions` from the typed row. Update brain-preview (`admin-brain-preview.ts:276`) similarly.
  - Run `ast_grep_search` to confirm NO surviving `?? delivery_instructions` anywhere.

  **Must NOT do**: Leave any reference to the removed field. Employee-specific strings.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: cross-file fallback removal with a hard "zero survivors" bar.
  - **Skills**: [`data-access-conventions`] — PostgREST typed rows + worker/repository boundary. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 3
  - **Blocks**: 16, 17 | **Blocked By**: 2, 6

  **References**:
  - `src/workers/lib/agents-md-compiler.mts:230-257`, `execution-phase.mts:256`, `delivery-phase.mts:123`.
  - `src/workers/lib/postgrest-types.ts` — drop the field.
  - `src/gateway/routes/admin-brain-preview.ts:276`.
  - WHY: the column is dropped in Task 6; any lingering read of it yields `undefined` and silent empty delivery.

  **Acceptance Criteria**:
  - [ ] `ast_grep_search` for `?? delivery_instructions` (and any `.delivery_instructions`) → 0 matches in src/
  - [ ] Worker build typechecks (`tsc --noEmit`)
  - [ ] Compiler tests pass

  **QA Scenarios**:

  ```
  Scenario: Zero survivors (negative — critical)
    Tool: Bash (grep/ast-grep)
    Steps:
      1. `grep -rn "delivery_instructions" src/ | grep -v test` → expect 0
    Expected Result: No references to removed field in source
    Evidence: .sisyphus/evidence/task-14-zero-survivors.txt
  ```

  **Commit**: YES — `refactor(workers): compiler reads canonical delivery field` — Files: compiler + phases + postgrest-types + brain-preview — Pre-commit: `pnpm test -- --run`

- [ ] 15. Manual tenant-scoped patch of ab1b5ecb (GREEN)

  **What to do**:
  - After the migration (Task 6), patch the broken employee `ab1b5ecb-382f-4821-9054-4ede7457d223` (tenant `18aaaab7-44c1-42ee-a9e2-928679db78e0`) so it has valid `delivery_steps` and a consistent approval/classification config (e.g. set `delivery_steps` to "Post the executive summary to the configured Slack channel." and ensure `deliverable_type` is set). Prefer the admin `PATCH` API (exercises the new gate) over raw SQL; if SQL, scope by both id AND tenant_id.

  **Must NOT do**: Patch any other employee. Unscoped UPDATE. Hard delete.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: single targeted record repair.
  - **Skills**: [`api-design`, `debugging-lifecycle`] — PATCH route + verifying task readiness. **Omitted**: visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 3
  - **Blocks**: 16 | **Blocked By**: 6

  **References**:
  - `src/gateway/routes/admin-archetypes.ts` PATCH handler (now gated by Task 9).
  - Failed task `6e249d03-...` for context.
  - WHY: the user explicitly wants this one broken employee fixed (decision D).

  **Acceptance Criteria**:
  - [ ] `ab1b5ecb` has non-empty `delivery_steps` and consistent config
  - [ ] PATCH succeeds (gate passes because delivery now valid)

  **QA Scenarios**:

  ```
  Scenario: Repaired record (happy)
    Tool: Bash (psql)
    Steps:
      1. `psql ... -c "SELECT delivery_steps, deliverable_type FROM archetypes WHERE id='ab1b5ecb-382f-4821-9054-4ede7457d223';"`
    Expected Result: delivery_steps non-empty
    Evidence: .sisyphus/evidence/task-15-repair.txt
  ```

  **Commit**: YES — `fix(archetypes): repair broken summarizer delivery config` — Files: (data patch; note in commit body) — Pre-commit: `pnpm test -- --run`

- [ ] 16. Docker worker image rebuild + live wizard E2E (both delivery paths)

  **What to do**:
  - Rebuild the worker image: `docker build -t ai-employee-worker:latest .` (the compiler/phase changes require it). Use the tmux launch+poll pattern (`long-running-commands`).
  - **E2E A (failure-mirror, no-approval)**: Via the dashboard wizard (`/dashboard/employees/new?tenant=<tid>`) create a NEW employee mirroring the original request ("read all Slack channels, give an executive summary"), `approval_required:false`. Override model to `deepseek/deepseek-v4-flash` per AGENTS.md. Trigger via admin API. Poll `tasks.status` → `Done` via psql; capture `task_status_log` trace; confirm the summary posted to Slack (Playwright/CDP screenshot if needed). Record task ID.
  - **E2E B (approval-required)**: Create/trigger an employee with `approval_required:true`; drive Submitting → Reviewing → Approve → Delivering → Done (approve via the Slack card or the approval admin path). Record task ID + trace. Proves the approval-path resolver.
  - Per AGENTS.md: "verified from code"/"unit tests pass" is explicitly INSUFFICIENT — the live trigger→Done trace is mandatory.

  **Must NOT do**: Skip the live trigger. Use a non-deliverable employee for E2E A. Leave tmux sessions alive.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: multi-system live E2E with browser + DB + Docker.
  - **Skills**: [`e2e-testing`, `long-running-commands`, `debugging-lifecycle`, `feature-verification`] — E2E flows + tmux discipline + state verification + zero-rows rule. **Omitted**: prisma.

  **Parallelization**:
  - **Can Run In Parallel**: NO (integration gate) — **Group**: Wave 4
  - **Blocks**: 18 | **Blocked By**: 7,8,9,10,12,13,14,15

  **References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` (AC1-AC8) and `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` (Scenario A approve).
  - AGENTS.md "Post-Implementation E2E Testing (MANDATORY)" + "Recommended for E2E testing: deepseek/deepseek-v4-flash" + OpenCode VM `performance-1x` requirement.
  - `pnpm trigger-task` / admin trigger endpoint; `task_status_log`, `pending_approvals` tables.
  - WHY: this is the user-mandated proof (decision E) that the generator + lifecycle fix works live on both paths.

  **Acceptance Criteria**:
  - [ ] Worker image rebuilt successfully
  - [ ] E2E A employee reaches `tasks.status = Done`; summary delivered to Slack; task ID + `task_status_log` trace captured
  - [ ] E2E B employee reaches `Done` via Approve; task ID + trace captured
  - [ ] Generated E2E A employee has non-empty `delivery_steps` (proves generator fix)

  **QA Scenarios**:

  ```
  Scenario: No-approval wizard employee delivers (happy — original bug path)
    Tool: Bash (admin trigger + psql) + Playwright/CDP (Slack confirm)
    Steps:
      1. Wizard-create employee (Slack exec summary), approval_required:false, model deepseek/deepseek-v4-flash, vm_size performance-1x
      2. Confirm its delivery_steps is non-empty: psql SELECT
      3. Trigger task; poll `SELECT status FROM tasks WHERE id='<id>'` until Done (or Failed)
      4. Capture `SELECT * FROM task_status_log WHERE task_id='<id>' ORDER BY created_at`
      5. Verify summary posted in Slack channel
    Expected Result: status=Done, summary delivered, no MISSING_DELIVERY_CONFIG
    Evidence: .sisyphus/evidence/task-16-e2e-a.txt + screenshot

  Scenario: Approval-required employee delivers after Approve (happy — approval path)
    Tool: Bash (admin trigger + psql) + Slack card approve
    Steps:
      1. Create/trigger approval_required:true employee
      2. Drive to Reviewing; approve; poll to Done
    Expected Result: Reviewing→Approved→Delivering→Done trace
    Evidence: .sisyphus/evidence/task-16-e2e-b.txt
  ```

  **Commit**: NO (verification only; no source change)

- [ ] 17. Doc fixes — AGENTS.md mislabel + drift-audit

  **What to do**:
  - Correct AGENTS.md where `delivery_instructions` is described as "the platform constant prompt" — it was per-employee content + the lifecycle gate, and it is now REMOVED in favor of `delivery_steps`. Update the "Adding a New Employee" and OpenCode Worker sections to reference the single `delivery_steps` field + the resolver + the create/edit hard gate + the escape hatch.
  - Update `docs/guides/2026-06-12-2030-drift-audit.md` to reflect the consolidation (delivery is no longer a duplicated/divergent area).
  - Per AGENTS.md Documentation Freshness, this is the last content wave before notification.

  **Must NOT do**: Reintroduce volatile counts/line-numbers (AGENTS.md durability rule). Leave stale `delivery_instructions` references.

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: documentation prose accuracy.
  - **Skills**: [`writing-guidelines`] — voice/tone + durability rules. **Omitted**: code skills.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 4
  - **Blocks**: 18 | **Blocked By**: 6, 7, 14

  **References**:
  - `AGENTS.md` — "Adding a New Employee" (delivery_steps/delivery_instructions description), OpenCode Worker output-contract section, Documentation Durability rules.
  - `docs/guides/2026-06-12-2030-drift-audit.md`.
  - WHY: AGENTS.md is injected into every worker; an inaccurate delivery description misleads future generations + agents.

  **Acceptance Criteria**:
  - [ ] AGENTS.md no longer calls `delivery_instructions` the platform constant prompt; reflects single `delivery_steps` field + gate + escape hatch
  - [ ] `grep -n delivery_instructions AGENTS.md docs/guides/2026-06-12-2030-drift-audit.md` → only intentional historical mentions (if any), no current-behavior claims

  **QA Scenarios**:

  ```
  Scenario: Docs reflect consolidation
    Tool: Bash (grep)
    Steps:
      1. `grep -n "platform constant prompt" AGENTS.md` near delivery → corrected
      2. Confirm delivery_steps + resolver + hard gate described
    Expected Result: Accurate, single-field description
    Evidence: .sisyphus/evidence/task-17-docs.txt
  ```

  **Commit**: YES — `docs: correct delivery field semantics and drift audit` — Files: `AGENTS.md`, drift-audit doc — Pre-commit: `pnpm test -- --run`

- [ ] 18. Notify completion (Telegram)

  **What to do**:
  - Send Telegram: plan complete, all tasks done, come back to review.
  - `tsx scripts/telegram-notify.ts "✅ enforce-execution-delivery-phases complete — delivery now enforced for every employee; live E2E passed on both paths. Come back to review."`
  - Kill all tmux sessions created during execution (`tmux list-sessions -F '#{session_name}' | grep '^ai-' | xargs -I{} tmux kill-session -t {}`).

  **Must NOT do**: Skip tmux cleanup.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: single notification + cleanup.
  - **Skills**: [`long-running-commands`] — tmux cleanup rules. **Omitted**: all else.

  **Parallelization**:
  - **Can Run In Parallel**: NO (last) — **Group**: Wave 4
  - **Blocks**: F-wave | **Blocked By**: 16, 17

  **References**:
  - AGENTS.md "Prometheus Planning — Telegram Notifications" Rule 2 & 3.
  - `scripts/telegram-notify.ts`.
  - WHY: mandatory completion notification + tmux hygiene.

  **Acceptance Criteria**:
  - [ ] Telegram completion message sent
  - [ ] All `ai-*` tmux sessions killed

  **QA Scenarios**:

  ```
  Scenario: Notify + cleanup
    Tool: Bash
    Steps:
      1. Run telegram-notify.ts; assert exit 0
      2. `tmux list-sessions 2>/dev/null | grep '^ai-' | wc -l` → 0
    Expected Result: Sent; no ai- sessions
    Evidence: .sisyphus/evidence/task-18-notify.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> Do NOT auto-proceed. Never mark F1-F4 checked before the user's okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists (read file, run command, query DB). For each "Must NOT Have": grep the codebase for forbidden patterns — reject with file:line if found (esp. surviving `?? delivery_instructions` fallback, any row `DELETE`, employee-specific strings in shared files, unscoped UPDATE). Check evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + `pnpm lint` + `pnpm test -- --run` + `pnpm test:integration`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, commented-out code, unused imports, AI slop (over-abstraction, generic names). Confirm the resolver is genuinely shared (single definition) and employee-agnostic.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA + Live E2E re-run** — `unspecified-high` (+ `e2e-testing` skill)
      From a clean state, re-execute the full live E2E: wizard-create the failure-mirroring employee, trigger, poll `tasks.status` to `Done`, confirm Slack delivery; run the approval-required employee Approve→Done. Run the migration verification psql query. Save to `.sisyphus/evidence/final-qa/`.
      Output: `E2E [N/N pass] | Migration query [PASS/FAIL] | task IDs [...] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — nothing missing, nothing beyond spec (esp. no `deliverable_type`/`risk_model` redesign, no card-copy changes, no broad repair sweep). Confirm `COALESCE` migration (not blind copy) and google-assistant unchanged.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

Group by concern; one commit per logical unit. All commits run `pnpm test -- --run` pre-commit. No `--no-verify`, no `Co-authored-by`, no AI/tool attribution in messages.

- Resolver + tests: `feat(lifecycle): add shared delivery resolver`
- Migration + seed + backup: `feat(db): consolidate delivery fields to delivery_steps`
- Gate redirects: `refactor(lifecycle): route all delivery gates through resolver`
- Generator + validation: `feat(archetypes): enforce delivery phase at creation and edit`
- Repair: `fix(archetypes): repair broken summarizer delivery config`
- Docs: `docs: correct delivery field semantics and drift audit`

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                # Expected: all pass (0 failures beyond known pre-existing)
pnpm test:integration             # Expected: pass
# Migration correctness — zero deliverable employees with empty delivery_steps (except escape hatch):
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
 "SELECT id, role_name FROM archetypes WHERE deleted_at IS NULL AND deliverable_type IS NOT NULL AND (delivery_steps IS NULL OR delivery_steps = '');"
# Expected: 0 rows
# google-assistant unchanged:
psql ... -c "SELECT delivery_steps FROM archetypes WHERE role_name='google-workspace-assistant';"
# Expected: 'Post the task results to the configured Slack channel.'
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass; live E2E reaches Done on both paths
- [ ] Prod backup taken; worker-first deploy order documented
