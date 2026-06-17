# Mandatory Execution + Delivery Phase for All Employees (Abolish Config-Time Escape Hatch)

## TL;DR

> **Quick Summary**: Make a non-empty `delivery_steps` (and `execution_steps`) mandatory for EVERY employee — born that way and unable to be saved otherwise. Three parts: (1) **harden generation + the save/edit gate** so no employee can ever be created with empty delivery steps, closing the remaining `deliverable_type: null` + `delivery_steps: null` "pure utility" loophole; (2) **add clear execution-vs-delivery boundary guidance** to the generator prompt so the model files steps into the right phase; (3) **retrofit the two existing config-time escape-hatch employees** (`cleaning-schedule`, `daily-motivation`) so their Slack-posting moves out of execution into a real delivery phase. This abolishes the config-time escape hatch that makes the approval-flip bug possible, while preserving the legitimate runtime `NO_ACTION_NEEDED` no-op finish. `deliverable_type` is retained (load-bearing in model-selection + time-estimation + card UX); its removal is logged as separate backlog.
>
> **Deliverables**:
>
> - Generator always emits a non-empty `delivery_steps` (no more `delivery_steps: null` for "pure utility" employees)
> - Generator prompt teaches the execution-vs-delivery boundary (definitions + one annotated contrast + "never deliver in execution" anti-pattern)
> - Create + edit hard gate rejects empty `delivery_steps` INDEPENDENT of `deliverable_type` (closes the null/null loophole)
> - `cleaning-schedule` retrofit: execution produces a draft + submit-output; delivery_steps posts to Slack
> - `daily-motivation` retrofit: execution produces a draft + submit-output; delivery_steps posts to Slack (ignore-guard removed)
> - Seed file updated so a fresh DB reseed reproduces the retrofitted (non-escape-hatch) config
> - `NO_ACTION_NEEDED` runtime no-op preserved end-to-end; `deliverable_type` removal logged as backlog
> - Live E2E: both retrofitted employees deliver to Done; an approval-flip on one no longer fails; a generation attempt cannot produce an empty-delivery employee
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: RED tests → harden generator+prompt+gate (GREEN) → retrofit archetypes → live E2E + approval-flip + guardrail check → final review

---

## Context

### Original Request

After the `enforce-execution-delivery-phases` plan shipped, the user identified a latent correctness bug:

1. Two employees (`cleaning-schedule`, `daily-motivation`) are **config-time escape hatches** — they have `deliverable_type` set but `delivery_steps` empty, and they post to Slack _inside their execution phase_.
2. If a human flips `approval_required` from `false` to `true` on such an employee:
   - The output is **already delivered** during execution (horse left the barn) — approval is semantically meaningless.
   - At the `Approved → Delivering` gate, the resolver is called with classification `NEEDS_APPROVAL`. With `deliverable_type` set but no `delivery_steps`, it returns **`misconfigured`** → the task **Fails** with `MISSING_DELIVERY_CONFIG`.
3. The escape hatch is fundamentally incompatible with the approval model.

The user further asked: every AI employee should be generated with BOTH an execution and a delivery phase, with clear guidance so the LLM knows what belongs in each.

### User Decisions (confirmed)

- **D1 — Enforcement scope**: Enforce `delivery_steps` mandatory for ALL active deliverable employees AND retrofit the 2 existing escape-hatch employees — move their Slack-posting out of execution into a real delivery phase. Fully abolish the config-time escape hatch.
- **D2 — Runtime no-op**: Keep `NO_ACTION_NEEDED` as a valid runtime finish. An employee configured with both steps can still emit `NO_ACTION_NEEDED` on a given run (e.g. a monitor that found nothing) and finish cleanly as Done. This is a runtime decision, distinct from the config gap, and is NOT the bug being fixed.
- **D3 — Close the null/null loophole + harden generation**: Every employee must be BORN with both a non-empty `execution_steps` AND a non-empty `delivery_steps`. Forbid the "pure utility" config (`deliverable_type: null` + `delivery_steps: null`) at BOTH generation time AND save/edit time (the gate must reject empty `delivery_steps` regardless of whether `deliverable_type` is set). Runtime `NO_ACTION_NEEDED` (D2) is unaffected — it is a per-run decision, not a config state.
- **D4 — `deliverable_type` retained (deferred removal)**: `deliverable_type` stays. It is load-bearing in THREE subsystems beyond card UX: the model-selection profiler (`profiler.ts`), the time estimator (`time-estimator.ts`), and the generator template selection (`archetype-generator-prompts.ts`), plus the Slack card copy (`approval-handler.ts` `deliversToChannel`). Deriving the type from `delivery_steps` prose is possible but would require rewiring model-selection + time-estimation — a separate evaluation, logged as backlog.
- **D5 — Execution-vs-delivery boundary examples**: Add ONE annotated contrast + a crisp boundary definition + an explicit "never deliver inside execution" anti-pattern to the generator prompt. Single worked example only (not multiple domain variants) to limit prompt budget.

### Key Distinction (load-bearing for the whole plan)

There are TWO different "no-delivery" situations — only one is being abolished:

| Situation                      | What it is                                                                     | Verdict                 |
| ------------------------------ | ------------------------------------------------------------------------------ | ----------------------- |
| **Config-time escape hatch**   | Archetype _configured_ with empty `delivery_steps`, posts during execution     | **ABOLISH** (this plan) |
| **Runtime `NO_ACTION_NEEDED`** | Archetype _configured with both steps_, but a given run has nothing to deliver | **PRESERVE**            |

### Research Findings

- `cleaning-schedule` (tenant VLRE): reads Hostfully checkouts → builds a daily cleaning schedule → posts to Slack within execution. `deliverable_type=slack_message`, `delivery_steps` empty, `approval_required=false`.
- `daily-motivation` (tenant DozalDevs): composes a motivational quote → posts to Slack within execution → submit-output. **It already contains a `<delivery-instructions>` section in its prompt that it is explicitly told to IGNORE** ("Do NOT read or follow `<delivery-instructions>` — STOP after step 3"). So delivery prose effectively exists but is deliberately bypassed. `deliverable_type=slack_message`, `delivery_steps` empty, `approval_required=false`.
- Both are the ONLY 2 rows returned by: `SELECT ... WHERE deliverable_type IS NOT NULL AND (delivery_steps IS NULL OR delivery_steps='')`.
- The resolver (`src/lib/delivery-resolver.ts`) already returns `misconfigured` for `deliverable_type` set + empty delivery + `NEEDS_APPROVAL`. After retrofit, neither employee hits that branch.
- The hard gate at POST/PATCH `/archetypes` already rejects NEW employees with empty `delivery_steps` **when `deliverable_type` is set** — but there is a **LOOPHOLE**: an employee saved with `deliverable_type: null` + `delivery_steps: null` (the "pure utility" config) still passes as `no-delivery-escape-hatch`. D3 closes it.
- **`deliverable_type` is consumed programmatically in 4 places** (confirmed via grep): `archetype-generator-prompts.ts` (template selection), `src/lib/model-selection/profiler.ts` (quality/speed scoring → model recommendation), `src/gateway/services/time-estimator.ts` (manual-minutes estimate), `src/inngest/lifecycle/steps/approval-handler.ts` (`deliversToChannel` card UX). NOT pure card decoration.
- Generator code path: `src/gateway/services/archetype-generator.ts` `postProcess()` (~L362-366) derives a default `delivery_steps` ONLY when `deliverable_type` is set; the prompt (`archetype-generator-prompts.ts` L281) explicitly permits `delivery_steps: null` "when deliverable_type is also null (pure utility employees)". Both must change.
- **Generator prompt currently has delivery TEMPLATES (Template A: Slack, Template B: external) and a JSON shape example, but NO crisp execution-vs-delivery boundary definition.** The execution example is a generic placeholder (`"1. First step.\n2. Second step."`). This missing boundary is exactly what let `daily-motivation` post inside execution.
- Create/edit gate code path: `admin-archetypes.ts` POST (~L197-201) + PATCH (~L393-397), plus `admin-archetype-converse-create.ts` (~L79).

### Metis Review (self-incorporated; gaps folded into tasks)

- **G1**: The `--draft-file` handoff convention — execution writes the deliverable to a draft file and calls `submit-output --draft-file`; retrofitted execution_steps must NOT post to Slack directly.
- **G2**: `daily-motivation`'s "ignore `<delivery-instructions>`" guard must be REMOVED.
- **G3**: Channel env-var placeholders (`$NOTIFICATION_CHANNEL`) preserved.
- **G4**: Both employees live in DB AND seed.ts — update both, tenant-scoped.
- **G5**: `cleaning-schedule` is VLRE; `daily-motivation` is DozalDevs — don't cross-wire.
- **G6**: Do NOT remove the `NO_ACTION_NEEDED` runtime path.
- **G7**: The new gate is SAVE-time, not runtime — must not break the runtime `NO_ACTION_NEEDED` finish.
- **G8**: Keep `deliverable_type`; do NOT rewire model-selection/time-estimator.

---

## Work Objectives

### Core Objective

Make every employee structurally guaranteed to be born with BOTH a non-empty execution phase AND a non-empty delivery phase, with the generator clearly understanding what belongs in each: (1) harden the generator + create/edit gate so the empty-delivery state (including the `deliverable_type: null` loophole) can never be created, (2) teach the generator the execution-vs-delivery boundary, and (3) retrofit the two existing config-time escape-hatch employees. Together these make the approval-flip failure structurally impossible.

### Concrete Deliverables

- Generator (`archetype-generator.ts` + prompts): always produces non-empty `delivery_steps`; never emits `delivery_steps: null`; prompt contains explicit execution-vs-delivery boundary guidance
- Create/edit hard gate (`admin-archetypes.ts` POST + PATCH, `admin-archetype-converse-create.ts`): rejects empty `delivery_steps` regardless of `deliverable_type`, with a clear error
- `cleaning-schedule`: `delivery_steps` populated; `execution_steps` rewritten to produce the schedule as a draft + `submit-output --draft-file` (no direct Slack post)
- `daily-motivation`: `delivery_steps` populated; `execution_steps` rewritten to produce the quote as a draft + `submit-output --draft-file` (no direct Slack post; ignore-guard removed)
- `prisma/seed.ts`: both archetypes seeded WITH `delivery_steps` (no escape-hatch rows)
- Live E2E: both employees deliver to Done via the delivery container; approval-flip reaches Done; empty-delivery generation impossible
- Backlog note recorded: evaluate deriving `deliverable_type` from `delivery_steps` (separate plan)

### Definition of Done

- [x] Generator never emits `delivery_steps: null` — a generated deliverable employee always has non-empty delivery prose (RED proves old behavior, GREEN proves fix)
- [x] Generator prompt contains the execution-vs-delivery boundary definition + one annotated contrast + the "never deliver in execution" anti-pattern
- [x] Create + edit gate rejects empty `delivery_steps` even when `deliverable_type` is null (loophole closed) — integration test proves rejection
- [x] Verification query returns **0 rows**: `SELECT ... WHERE deleted_at IS NULL AND deliverable_type IS NOT NULL AND (delivery_steps IS NULL OR delivery_steps='')`
- [x] Both retrofitted employees trigger → reach `tasks.status = Done` via the delivery container
- [x] Approval-flip regression on one employee reaches Done through the full approval path
- [x] `pnpm test -- --run` and `pnpm test:integration` pass
- [x] Seed reseed reproduces the retrofitted config (no escape-hatch rows)

### Must Have

- Generator always produces a non-empty `delivery_steps`; the create/edit gate rejects empty `delivery_steps` independent of `deliverable_type`
- Generator prompt clearly defines execution-vs-delivery with a worked contrast + anti-pattern
- Both employees have non-empty `delivery_steps` in DB AND seed
- Slack-posting happens in the DELIVERY phase, driven by `submit-output --draft-file` handoff from execution
- `NO_ACTION_NEEDED` runtime no-op preserved end-to-end
- All UPDATE/patch operations scoped by `tenant_id`
- A clear, non-technical error when the gate rejects an empty-delivery employee (end-user language per AGENTS.md)

### Must NOT Have (Guardrails)

- NO direct Slack `post-message` call left in the retrofitted execution_steps (must hand off to delivery)
- NO `<delivery-instructions>`-ignore instruction remaining in `daily-motivation`
- NO removal of the `NO_ACTION_NEEDED` runtime path from resolver/lifecycle
- NO breaking of the runtime `NO_ACTION_NEEDED` finish when tightening the gate (the gate is CONFIG-time, not runtime)
- NO cross-tenant wiring (cleaning-schedule = VLRE; daily-motivation = DozalDevs)
- NO row DELETE/deleteMany (soft-delete only; use UPDATE/PATCH)
- NO unscoped UPDATE
- NO change to `deliverable_type` semantics or the resolver's contract; NO removal of `deliverable_type` (deferred per D4)
- NO rewiring of the model-selection profiler or time-estimator (they keep reading `deliverable_type`)
- NO multiple domain example variants in the prompt — ONE annotated contrast only (prompt budget)
- NO broad sweep of other employees — only these 2 are retrofitted
- NO schema migration (schema is already correct from the prior plan)
- Prod DB backup MANDATORY before any production DB write

---

## Verification Strategy

> ZERO HUMAN INTERVENTION — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest + integration config)
- **Automated tests**: TDD (RED → GREEN) for the generator + gate changes; live E2E + DB query for the retrofits
- **Framework**: vitest

### QA Policy

Every task includes agent-executed QA. Evidence to `.sisyphus/evidence/mandatory-delivery-phase-all-employees/`.

- **DB state**: psql verification query (0 rows)
- **Live employee runs**: trigger via admin API, poll `tasks.status` + `task_status_log`
- **API**: curl for trigger + approval-flip + gate rejection
- E2E model override: `deepseek/deepseek-v4-flash` per AGENTS.md

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (parallel — independent concerns):
├── Task 1: Retrofit cleaning-schedule (DB + seed, VLRE) [unspecified-high]
├── Task 2: Retrofit daily-motivation (DB + seed, DozalDevs) [unspecified-high]
├── Task 6: RED tests — generator must emit non-empty delivery_steps + gate rejects null/null [unspecified-high]
└── Task 7: RED test — integration: create with deliverable_type:null + empty delivery_steps → 400 [unspecified-high]

Wave 2 (GREEN — after RED tests land):
├── Task 8: GREEN — generator always emits non-empty delivery_steps + boundary guidance [unspecified-high]
└── Task 9: GREEN — create/edit gate rejects empty delivery_steps independent of deliverable_type [unspecified-high]

Wave 3 (verification — after retrofits + gate/generator hardening):
├── Task 3: DB verification query + reseed check [quick]
├── Task 4: Live E2E both employees → Done via delivery container [unspecified-high]
├── Task 5: Approval-flip regression (one employee) [unspecified-high]
└── Task 10: Generation-guardrail live check — empty-delivery employee impossible [unspecified-high]

Wave FINAL (parallel review):
├── F1: Plan compliance audit (oracle)
├── F2: Scope fidelity (deep)
└── F3: Real manual QA re-run (unspecified-high)
-> Present results -> user okay

Critical Path: T6/T7 (RED) → T8/T9 (GREEN) → T1/T2 (retrofit) → T4/T5/T10 → F1-F3 → user okay
```

### Agent Dispatch Summary

- **Wave 1**: T1 → `unspecified-high`, T2 → `unspecified-high`, T6 → `unspecified-high`, T7 → `unspecified-high`
- **Wave 2**: T8 → `unspecified-high`, T9 → `unspecified-high`
- **Wave 3**: T3 → `quick`, T4 → `unspecified-high`, T5 → `unspecified-high`, T10 → `unspecified-high`
- **FINAL**: F1 → `oracle`, F2 → `deep`, F3 → `unspecified-high`

---

## TODOs

> Implementation + verification = ONE task. EVERY task has Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Retrofit `cleaning-schedule` — move Slack-posting into a real delivery phase (VLRE)

  **What to do**:
  - Rewrite `execution_steps` so the employee BUILDS the daily cleaning schedule and writes it to a draft file, then calls `tsx /tools/platform/submit-output.ts --draft-file <path> --summary "..."` — and does NOT post to Slack directly.
  - Populate `delivery_steps` with intent prose that posts the submitted schedule to the VLRE notification channel (use the existing `$NOTIFICATION_CHANNEL` placeholder convention). Final delivery step MUST be the submit-output confirmation.
  - Apply via the admin PATCH endpoint, scoped to the VLRE tenant (`00000000-0000-0000-0000-000000000003`) — the hard gate will validate the non-empty delivery_steps.
  - Update `prisma/seed.ts` for the `cleaning-schedule` upsert (both create + update blocks) so a reseed reproduces the retrofitted config. Keep `deliverable_type: 'slack_message'`.
  - BACKUP the DB first if touching production; local DB is fine to edit directly via PATCH.

  **Must NOT do**:
  - Leave any `post-message` call in `execution_steps` (must hand off via draft file).
  - Cross-wire to the DozalDevs tenant or channel. Use an unscoped UPDATE.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: archetype prose rewrite + seed edit + tenant-scoped API call across DB and seed.
  - **Skills**: [`creating-archetypes`, `api-design`, `data-access-conventions`, `prisma`]. **Omitted**: frontend/visual (no UI).

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1 (independent tenant from Task 2)
  - **Blocks**: 3, 4, 5 | **Blocked By**: None

  **References**:
  - `docs/employees/cleaning-schedule.md` — channel IDs, trigger command, resources
  - `src/workers/skills/tool-usage-reference/SKILL.md` — the `--draft-file` execution→delivery handoff convention
  - `prisma/seed.ts` — the `cleaning-schedule` upsert blocks (create + update)
  - `src/gateway/routes/admin-archetypes.ts` — PATCH hard gate
  - Existing `daily-summarizer`/`google-workspace-assistant` archetypes — examples of correct execution(draft)→delivery(post) split

  **Acceptance Criteria**:

  ```
  Scenario: cleaning-schedule has a real delivery phase
    Tool: Bash (psql)
    Steps:
      1. psql ... -c "SELECT delivery_steps, execution_steps FROM archetypes WHERE role_name='cleaning-schedule' AND deleted_at IS NULL;"
      2. Assert delivery_steps non-empty
      3. Assert execution_steps contains 'submit-output' and '--draft-file' and does NOT contain 'post-message'
    Expected Result: delivery_steps populated; execution hands off via draft file
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-1-cleaning.txt

  Scenario: seed reproduces non-escape-hatch config
    Tool: Bash (grep)
    Steps:
      1. Confirm prisma/seed.ts cleaning-schedule blocks set a non-empty delivery_steps
    Expected Result: no escape-hatch row in seed
    Evidence: same file
  ```

  **Commit**: YES (groups with Task 2) — `fix(archetypes): give cleaning-schedule and daily-motivation real delivery phases`

- [x] 2. Retrofit `daily-motivation` — move Slack-posting into a real delivery phase (DozalDevs)

  **What to do**:
  - Rewrite `execution_steps` so the employee composes the motivational quote to a draft file and calls `submit-output --draft-file <path> --summary "..."` — and does NOT post to Slack directly.
  - REMOVE the "Do NOT read or follow `<delivery-instructions>` — STOP after step 3" guard. It actively fights the delivery phase and must go.
  - Populate `delivery_steps` with intent prose that posts the quote to the DozalDevs notification channel (`$NOTIFICATION_CHANNEL`). Final delivery step MUST be the submit-output confirmation.
  - Apply via admin PATCH scoped to DozalDevs tenant (`00000000-0000-0000-0000-000000000002`).
  - Update `prisma/seed.ts` for the `daily-motivation` upsert (create + update blocks). Keep `deliverable_type: 'slack_message'`.

  **Must NOT do**:
  - Leave any `post-message` call in `execution_steps`. Leave the ignore-guard. Cross-wire to VLRE. Use an unscoped UPDATE.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: prose rewrite that must remove an active anti-delivery guard.
  - **Skills**: [`creating-archetypes`, `api-design`, `data-access-conventions`, `prisma`]. **Omitted**: frontend/visual.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1 (with Task 1)
  - **Blocks**: 3, 4, 5 | **Blocked By**: None

  **References**:
  - `docs/employees/daily-summarizer.md` — channel IDs per tenant (DozalDevs notification channel)
  - `src/workers/skills/tool-usage-reference/SKILL.md` — `--draft-file` handoff
  - `prisma/seed.ts` — the `daily-motivation` upsert blocks
  - `src/gateway/routes/admin-archetypes.ts` — PATCH hard gate

  **Acceptance Criteria**:

  ```
  Scenario: daily-motivation has a real delivery phase + no ignore-guard
    Tool: Bash (psql + grep)
    Steps:
      1. psql ... -c "SELECT delivery_steps, execution_steps FROM archetypes WHERE role_name='daily-motivation' AND deleted_at IS NULL;"
      2. Assert delivery_steps non-empty
      3. Assert execution_steps contains 'submit-output' + '--draft-file', does NOT contain 'post-message', does NOT contain 'Do NOT read or follow'
    Expected Result: delivery phase real; ignore-guard removed; execution hands off via draft file
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-2-motivation.txt
  ```

  **Commit**: YES (groups with Task 1)

- [x] 3. DB verification query + reseed check

  **What to do**:
  - Run the verification query; confirm it returns **0 rows** (no deliverable employee with empty `delivery_steps`).
  - Confirm `prisma/seed.ts` no longer contains an escape-hatch row for either employee (grep both role_names + delivery_steps presence).

  **Must NOT do**: Modify any archetype (read-only verification).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: a couple of psql/grep checks.
  - **Skills**: [`feature-verification`, `prisma`]. **Omitted**: everything else.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 3 | **Blocked By**: 1, 2

  **Acceptance Criteria**:

  ```
  Scenario: zero escape-hatch rows remain
    Tool: Bash (psql)
    Steps:
      1. psql ... -c "SELECT id, role_name FROM archetypes WHERE deleted_at IS NULL AND deliverable_type IS NOT NULL AND (delivery_steps IS NULL OR delivery_steps='');"
    Expected Result: 0 rows
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-3-verify.txt
  ```

  **Commit**: NO (verification only)

- [x] 4. Live E2E — both retrofitted employees deliver to Done via the delivery container

  **What to do**:
  - Confirm the worker Docker image exists/current (rebuild only if worker code changed — for this plan it likely did not).
  - Trigger `cleaning-schedule` (VLRE) and `daily-motivation` (DozalDevs) via the admin trigger endpoint. Use model override `deepseek/deepseek-v4-flash` if needed for reliable tool calling.
  - Poll `tasks.status` to `Done`; capture `task_status_log`. Confirm the trace shows a `Delivering` state (proves the delivery CONTAINER ran — not in-execution posting).

  **Must NOT do**: Accept a `Done` that bypassed `Delivering` (would mean it still posted in-execution).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: live multi-step E2E with polling + trace analysis.
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`, `long-running-commands`, `data-access-conventions`]. **Omitted**: frontend.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 3 | **Blocked By**: 1, 2

  **Acceptance Criteria**:

  ```
  Scenario: both employees deliver via the delivery container
    Tool: Bash (curl trigger + psql poll)
    Steps:
      1. Trigger each via POST /admin/tenants/:tenantId/employees/:slug/trigger
      2. Poll tasks.status until Done (max 10 min each)
      3. Assert task_status_log includes 'Delivering' for each
    Expected Result: both reach Done; both traces include Delivering
    Failure Indicators: Failed with MISSING_DELIVERY_CONFIG, or Done without Delivering
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-4-e2e.txt
  ```

  **Commit**: NO (verification only)

- [x] 5. Approval-flip regression — flipping approval ON no longer fails

  **What to do**:
  - On ONE retrofitted employee (recommend `daily-motivation` in local, or a throwaway clone), set `risk_model.approval_required: true` via PATCH (tenant-scoped).
  - Trigger it. Poll to `Reviewing`. Approve via the `employee/approval.received` Inngest event (no REST /approve endpoint — see prior plan's evidence). Poll to `Done`.
  - Confirm the trace is `Submitting → Reviewing → Approved → Delivering → Done` with NO `MISSING_DELIVERY_CONFIG`. This is the exact bug this plan abolishes.
  - Restore `approval_required: false` afterward (tenant-scoped).

  **Must NOT do**: Leave the employee flipped to approval-required after the test. Cross-tenant.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: live approval-path E2E with event injection.
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`, `inngest`, `data-access-conventions`]. **Omitted**: frontend.

  **Parallelization**:
  - **Can Run In Parallel**: NO — runs after Task 4 to avoid trigger collisions | **Blocked By**: 1, 2, 4

  **Acceptance Criteria**:

  ```
  Scenario: approval-flip reaches Done through the approval path
    Tool: Bash (curl PATCH + trigger + Inngest event + psql poll)
    Steps:
      1. PATCH approval_required=true (tenant-scoped)
      2. Trigger; poll to Reviewing
      3. POST employee/approval.received {action:approve} to Inngest dev endpoint
      4. Poll to Done; assert trace has Reviewing→Approved→Delivering→Done
      5. PATCH approval_required=false (restore)
    Expected Result: Done via full approval path; no MISSING_DELIVERY_CONFIG; config restored
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-5-approval-flip.txt
  ```

  **Commit**: NO (verification only)

- [x] 6. RED — generator must emit non-empty `delivery_steps`; gate must reject null/null

  **What to do**:
  - Add a failing unit test proving the generator currently CAN emit `delivery_steps: null` for a "pure utility" employee (`deliverable_type` null). Drive a raw model payload with `delivery_steps: null` + `deliverable_type: null` through `gen.generate(...)` and assert (intended GREEN) that `delivery_steps` comes back non-empty. FAILS today (postProcess only defaults when `deliverable_type` is set).
  - Follow the existing pattern from `tests/unit/archetype-generator-delivery.test.ts` (root-level `../../src/...` import depth; `makeRoutingLLM` mock routing the TimeEstimator sub-call to '5').
  - Prove genuine RED with a captured non-zero vitest exit (redirect, not `| tee`).

  **Must NOT do**: Implement the fix here (RED only). Touch `deliverable_type` semantics.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: TDD RED test mirroring an established mock harness.
  - **Skills**: [`creating-archetypes`, `api-design`]. **Omitted**: frontend.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1 | **Blocked By**: None

  **References**:
  - `tests/unit/archetype-generator-delivery.test.ts` — the prior plan's generator-default test (pattern to extend)
  - `src/gateway/services/archetype-generator.ts` `postProcess()` (~L362-366) — the null-normalization to change
  - `src/gateway/services/prompts/archetype-generator-prompts.ts` (L281) — the "set null when deliverable_type null" instruction

  **Acceptance Criteria**:

  ```
  Scenario: generator-default RED proof
    Tool: Bash (vitest)
    Steps:
      1. Run the new test; redirect output; echo $?
    Expected Result: exit code 1 (fails on current code — delivery_steps comes back null)
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-6-red.txt
  ```

  **Commit**: YES — `test(archetypes): RED — generator must always emit delivery_steps`

- [x] 7. RED — integration: create with `deliverable_type: null` + empty `delivery_steps` → 400

  **What to do**:
  - Add a failing integration test (DB-backed, real express app) proving the create endpoint currently ACCEPTS (201) an employee with `deliverable_type: null` + empty/absent `delivery_steps` (the null/null loophole), asserting the intended GREEN behavior (400 with a `MISSING_DELIVERY_CONFIG`-style rejection).
  - Reuse `tests/integration/archetypes-delivery-gate.test.ts` (prior plan's gate test): real `getPrisma()`, `TestApp.inject()`, `SERVICE_TOKEN` auth, `cleanupGateArchetypes()` keyed on a `gate-test-` role_name prefix, mocked time-estimator + call-llm.
  - Run with the integration config: `pnpm exec vitest run --config vitest.integration.config.ts <file>`. Prove genuine RED.

  **Must NOT do**: Implement the gate change here (RED only).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: DB-backed integration RED test.
  - **Skills**: [`api-design`, `data-access-conventions`, `prisma`]. **Omitted**: frontend.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 1 | **Blocked By**: None

  **References**:
  - `tests/integration/archetypes-delivery-gate.test.ts` — pattern + cleanup helper
  - `src/gateway/routes/admin-archetypes.ts` POST (~L197-201) — current escape-hatch allowance
  - `src/lib/delivery-resolver.ts` — `no-delivery-escape-hatch` is what currently lets null/null through

  **Acceptance Criteria**:

  ```
  Scenario: null/null loophole RED proof
    Tool: Bash (vitest integration)
    Steps:
      1. POST archetype {deliverable_type:null, delivery_steps:'' or omitted}; current code returns 201
      2. Test asserts 400 → FAILS today
    Expected Result: exit code 1 (genuine RED)
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-7-red.txt
  ```

  **Commit**: YES — `test(archetypes): RED — gate must reject empty delivery_steps even when deliverable_type is null`

- [x] 8. GREEN — generator always emits non-empty `delivery_steps` + execution-vs-delivery boundary guidance

  **What to do**:
  - In `archetype-generator.ts` `postProcess()`, derive a non-empty `delivery_steps` default whenever it is null/empty — regardless of whether `deliverable_type` is set. Reuse `DEFAULT_DELIVERY_INSTRUCTIONS` (from `output-contract-constants.ts`). Apply the SAME default on the CREATE path in `admin-archetype-converse-create.ts` (`applyCreateAllowlist`, ~L79).
  - In `archetype-generator-prompts.ts`, change the L281 instruction: `delivery_steps` MUST always be a non-empty numbered list. Remove the "Set to null ONLY when deliverable_type is also null (pure utility employees)" carve-out.
  - **ADD a "What Goes Where" boundary section to the generator prompt** so the model files steps into the correct phase. It MUST contain three parts:
    1. **Definitions**: `execution_steps` = everything the employee does to GATHER inputs, do the work, and PRODUCE/DRAFT the deliverable — ending with the `submit-output` handoff (`--draft-file` for content, `--metadata` for IDs the delivery phase needs). `delivery_steps` = take the APPROVED content from `<approved-content>` and SEND it to the destination, then confirm via `submit-output`. Execution produces; delivery transmits.
    2. **ONE annotated before/after contrast**: a step like "post the summary to Slack" shown WRONG (inside execution_steps) vs RIGHT (drafted + handed off in execution; actually posted in delivery). Single worked example only (prompt budget).
    3. **Anti-pattern rule (explicit)**: "NEVER post, send, email, or otherwise deliver the final output inside `execution_steps`. Execution drafts and hands off; delivery sends. An employee that delivers during execution cannot be safely switched to require approval."
  - Regenerate the golden fixture (prompt text changed): `GENERATE_GOLDEN=true pnpm exec vitest run tests/unit/golden-prompts.test.ts`, then commit the fixture.
  - Make Task 6's RED test pass. Update older tests that encoded the now-removed null-passthrough behavior (e.g. `archetype-generator-prompts.test.ts`) to assert the new always-non-empty invariant.

  **Must NOT do**: Touch `deliverable_type` derivation/semantics. Break the runtime `NO_ACTION_NEEDED` path (config-generation change only). Break the prior plan's `archetype-generator-delivery.test.ts`. Bloat the prompt with multiple domain examples — ONE annotated contrast only.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: generator logic + prompt authoring + golden fixture + test reconciliation.
  - **Skills**: [`creating-archetypes`, `api-design`, `data-access-conventions`]. **Omitted**: frontend.

  **Parallelization**:
  - **Can Run In Parallel**: NO — runs after Task 6 RED | **Blocked By**: 6

  **References**:
  - `src/gateway/services/archetype-generator.ts` `postProcess()` — the default-derivation site
  - `src/gateway/services/prompts/archetype-generator-prompts.ts` — L208-223 (delivery templates), L281 (the null carve-out), and the SYSTEM_PROMPT_POST JSON-shape example with the generic `execution_steps` placeholder
  - `src/gateway/routes/admin-archetype-converse-create.ts` (~L79) — CREATE allowlist default
  - `src/lib/output-contract-constants.ts` — `DEFAULT_DELIVERY_INSTRUCTIONS`
  - `tests/unit/golden-prompts.test.ts` — golden fixture regeneration command

  **Acceptance Criteria**:

  ```
  Scenario: generator GREEN + boundary guidance present
    Tool: Bash (vitest + grep)
    Steps:
      1. Run Task 6's test → PASS
      2. Run tests/unit/archetype-generator-delivery.test.ts (prior plan) → still PASS
      3. Run golden-prompts.test.ts → PASS (fixture regenerated + committed)
      4. grep the prompts file: assert it contains the boundary definition, a before/after contrast, and the 'NEVER ... inside execution_steps' anti-pattern
    Expected Result: all green; delivery_steps always non-empty; boundary guidance present
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-8-green.txt
  ```

  **Commit**: YES — `feat(archetypes): generator always emits a delivery phase with clear boundary guidance`

- [x] 9. GREEN — create/edit gate rejects empty `delivery_steps` independent of `deliverable_type`

  **What to do**:
  - Tighten the create gate (`admin-archetypes.ts` POST ~L197-201) and the edit gate (PATCH ~L393-397), plus the converse-create path, so an empty `delivery_steps` is rejected with `MISSING_DELIVERY_CONFIG` EVEN WHEN `deliverable_type` is null. Invariant: a saved employee always has non-empty `delivery_steps`.
  - Preserve the PATCH conditionality lesson from the prior plan: only gate when the patch actually touches a delivery-related field, so unrelated edits to existing rows don't get blocked. Use end-user-friendly error copy.
  - Make Task 7's RED test pass. Keep the prior plan's 4 gate tests green.

  **Must NOT do**: Add a runtime check (this is a save-time gate). Block legitimate edits to existing valid rows. Reintroduce a `deliverable_type`-only condition.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: gate logic across 3 endpoints + test reconciliation.
  - **Skills**: [`api-design`, `data-access-conventions`, `security`]. **Omitted**: frontend.

  **Parallelization**:
  - **Can Run In Parallel**: NO — runs after Task 7 RED | **Blocked By**: 7

  **References**:
  - `src/gateway/routes/admin-archetypes.ts` POST + PATCH gate sites
  - `src/gateway/routes/admin-archetype-converse-create.ts` — create path
  - `src/gateway/lib/prisma-helpers.ts` — `ERROR_CODES.MISSING_DELIVERY_CONFIG` (already added in prior plan)
  - `tests/integration/archetypes-delivery-gate.test.ts` — the existing 4 gate tests that must stay green

  **Acceptance Criteria**:

  ```
  Scenario: gate GREEN
    Tool: Bash (vitest integration)
    Steps:
      1. Run Task 7's test → PASS (null/null now 400)
      2. Run archetypes-delivery-gate.test.ts → 4/4 still PASS
    Expected Result: empty delivery_steps rejected regardless of deliverable_type; loophole closed
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-9-green.txt
  ```

  **Commit**: YES — `feat(archetypes): require a delivery phase at save time regardless of deliverable_type`

- [x] 10. Generation-guardrail live check — an empty-delivery employee is impossible

  **What to do**:
  - Live-verify the two new guardrails against the running gateway: (a) attempt to create an employee via the admin API with `deliverable_type: null` + empty `delivery_steps` → expect 400; (b) run the wizard generation path (or `converse-create`) on a "pure utility"-sounding description and confirm the persisted/proposed archetype has a non-empty `delivery_steps` AND that execution_steps does not deliver (sanity-check the boundary guidance took effect).
  - Clean up any test archetypes created (soft-delete / `gate-test-` prefix), tenant-scoped.

  **Must NOT do**: Leave test employees active. Cross-tenant.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: live API guardrail verification.
  - **Skills**: [`e2e-testing`, `api-design`, `data-access-conventions`, `employee-creation-debugging`]. **Omitted**: frontend.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Group**: Wave 3 | **Blocked By**: 8, 9

  **References**:
  - `src/gateway/routes/admin-archetypes.ts` — create endpoint
  - `src/gateway/routes/admin-archetype-converse-create.ts` — wizard generation path
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — wizard field-quality checks

  **Acceptance Criteria**:

  ```
  Scenario: guardrails hold live
    Tool: Bash (curl)
    Steps:
      1. POST archetype {deliverable_type:null, delivery_steps:''} → assert HTTP 400
      2. Generate/converse-create a 'pure utility' employee → assert resulting delivery_steps non-empty
      3. Soft-delete the test archetype(s), tenant-scoped
    Expected Result: empty-delivery creation blocked; generated employee always has a delivery phase
    Evidence: .sisyphus/evidence/mandatory-delivery-phase-all-employees/task-10-guardrail.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1-F3 checked before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      For each "Must Have": verify (query DB, read seed, run command, confirm gate + generator + prompt changes exist). For each "Must NOT Have": grep for forbidden patterns — direct Slack post in retrofitted execution_steps, the `<delivery-instructions>`-ignore guard in daily-motivation, any removal of `NO_ACTION_NEEDED`, any removal/rewire of `deliverable_type` (model-selection profiler + time-estimator must still read it), cross-tenant wiring, unscoped UPDATE, row DELETE. Confirm: verification query returns 0 rows; the generator can no longer emit `delivery_steps: null`; the prompt contains the execution-vs-delivery boundary guidance; the create/edit gate rejects empty `delivery_steps` even when `deliverable_type` is null.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Loophole closed [Y/N] | Boundary guidance present [Y/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Scope Fidelity Check** — `deep`
      Verify ONLY the 2 named employees were retrofitted (DB + seed); the generator/gate/prompt changes touched only the generator, prompts, and the 3 archetype endpoints. Confirm `NO_ACTION_NEEDED` runtime path untouched in resolver + lifecycle (new gate is save-time, not runtime). Confirm `deliverable_type` RETAINED and the model-selection profiler + time-estimator still read it (no rewire — D4 deferred). Confirm only ONE annotated contrast was added to the prompt (no multi-domain bloat). Confirm cleaning-schedule stayed VLRE and daily-motivation stayed DozalDevs. Confirm no schema migration and no resolver-contract change.
      Output: `Retrofitted [2/2] | NO_ACTION_NEEDED intact [Y/N] | deliverable_type retained [Y/N] | Cross-tenant [CLEAN/N] | VERDICT`

- [x] F3. **Real Manual QA Re-run** — `unspecified-high` (+ `e2e-testing` skill)
      Re-trigger both retrofitted employees from clean state → confirm Done via the delivery container (not in-execution post). Re-run the approval-flip regression. Re-run the generation-guardrail live check (empty-delivery creation blocked; generated employee always has a delivery phase). Run `pnpm test -- --run` + `pnpm test:integration` + the DB verification query. Save to `.sisyphus/evidence/mandatory-delivery-phase-all-employees/final-qa/`.
      Output: `E2E [N/N] | Approval-flip [PASS/FAIL] | Guardrail [PASS/FAIL] | Tests [N pass/N fail] | DB query [0 rows?] | VERDICT`

- [x] N. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review.

---

## Commit Strategy

- RED tests: `test(archetypes): RED — mandatory delivery phase at generation and save`
- Generator GREEN: `feat(archetypes): generator always emits a delivery phase with clear boundary guidance`
- Gate GREEN: `feat(archetypes): require a delivery phase at save time regardless of deliverable_type`
- Retrofits + seed: `fix(archetypes): give cleaning-schedule and daily-motivation real delivery phases`
- No `--no-verify`, no `Co-authored-by`, no AI/tool attribution in messages.

## Deferred Backlog (NOT in this plan — D4)

- **Evaluate removing `deliverable_type`**: it is load-bearing in the model-selection profiler (`src/lib/model-selection/profiler.ts`), the time estimator (`src/gateway/services/time-estimator.ts`), the generator template selection (`archetype-generator-prompts.ts`), and the Slack approval-card copy (`approval-handler.ts` `deliversToChannel`). A future plan could derive the type signal from `delivery_steps`/`identity` and migrate the column out — but that requires rewiring model-selection + time-estimation to parse prose instead of reading an enum, and re-validating model-recommendation quality. Logged here so it is not lost; do NOT bundle it into this bug-fix plan.

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run
pnpm test:integration
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
 "SELECT id, role_name FROM archetypes WHERE deleted_at IS NULL AND deliverable_type IS NOT NULL AND (delivery_steps IS NULL OR delivery_steps = '');"
# Expected: 0 rows
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] Generator can no longer emit `delivery_steps: null`
- [x] Generator prompt teaches the execution-vs-delivery boundary
- [x] Create/edit gate rejects empty `delivery_steps` even when `deliverable_type` is null (loophole closed)
- [x] Both employees deliver via the delivery container to Done
- [x] Approval-flip no longer fails
- [x] Verification query returns 0 rows
- [x] `deliverable_type` retained; model-selection + time-estimator untouched; removal logged as backlog
