# Archetype Generation Fix + Clarify-Then-Act Creation Wizard

## TL;DR

> **Quick Summary**: Permanently fix the wizard "Generation Failed" empty/reasoning-only-content bug by adding JSON mode + a bounded retry to the shared LLM helper, surface non-technical errors, fix the tenant-URL convention violation, and then add a converse-style clarify-then-act flow to the creation wizard so ambiguous descriptions get clarified before an employee is generated.
>
> **Deliverables**:
>
> - JSON mode on the `generate()` path (parity with `refine`/`converse`)
> - Bounded (exactly-one) retry on empty/reasoning-only content inside `callLLMWithJsonRetry`
> - Accurate, non-technical error messaging (dashboard + route), technical detail kept in logs/`details`
> - Accurate `archetype_generation_calls` trace (`retry_count`, `status`) — fix the pre-existing success-before-validation mislabel
> - Regression guardrail test locking generate/refine/converse JSON-mode symmetry
> - Tenant-URL convention fix at all 5 sites + create wizard reads tenant from URL
> - Clarify-then-act creation wizard (converse-style: ask → propose → create) with backstop
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 → T2 → T3 → T8 → T9 → T11 → F1–F4 → user okay

---

## Context

### Original Request

User hit `Gateway error 422 ... GENERATION_FAILED: LLM returned invalid JSON — Error: LLM returned empty content — possible reasoning-only response` when creating an AI employee from the prompt _"reads all of the Slack channels and then provides me with an executive summary."_ Wants the bug investigated, fixed permanently, the tenant-less URL explained/fixed, AND (added mid-session) a clarify-then-act flow so ambiguous descriptions are clarified before creation.

### Interview Summary

**Key Discussions**:

- Fix scope: JSON mode + retry-on-empty + clear errors. NOT automatic model fallback.
- URL tenant-ID convention bug: fix in this plan.
- Testing: TDD (failing tests first).
- Clarify flow: combined into THIS plan as a later wave (not a separate plan).
- Confirmed clarify-flow alone would NOT fully fix the bug (converse swallows empty content into silent `no_change`; retry fix lives in shared helper both paths need).

**Research Findings (code-verified)**:

- `generate()` (`src/gateway/services/archetype-generator.ts:622`) omits `responseFormat`; `refine()` (`:673`) and `converse()` (`:786`) both set `{ type: 'json_object' }`. This asymmetry is the primary trigger.
- `call-llm.ts:300-306` THROWS on empty content (log says "triggering retry" — there is none).
- `callLLMWithJsonRetry` (`:457-471`): the first `callLLMFn()` is OUTSIDE the try/catch (`:493`); nudge-retry only catches `JSON.parse` errors → generate path gets ZERO retries on empty content.
- `generate()` catch (`:636-649`) rewraps empty-content error as misleading "invalid JSON".
- `converse()` (`:796-799`) catches LLM throw and returns `{ kind: 'no_change' }` — silent failure on empty content.
- `_persistCall` first-call (`:473-490`) hardcodes `retry_count:0, status:'success'` BEFORE JSON validation → mislabels later-failed calls as success.
- Dashboard surfaces raw `err.message` (`CreateEmployeePage.tsx:73`, rendered `:258`); route returns `{ details: message }` (`admin-archetype-generate.ts:126`).
- URL convention violated at 5 sites: `App.tsx:94`, `EmployeeList.tsx:94`, `EmployeeListStates.tsx:30,78,85`. `useTenant` falls back to localStorage (`use-tenant.ts:42`) so it "works" but isn't shareable/refresh-safe.
- Skill `employee-creation-debugging` §4: `archetype_generation_calls` logs every failed generation with `error_message`, `retry_count` — usable for QA assertions.

### Metis Review

**Identified Gaps** (addressed):

- Retry must be bounded to exactly ONE attempt (no loops/cost blowup) → locked in Task 2.
- JSON mode may not be honored by the Go route → live E2E against real `deepseek-v4-flash` required (not just mocks).
- converse failure semantics (`no_change`/`too_long`/`question`) must stay byte-identical → guarded by snapshot test.
- Pre-existing `_persistCall` mislabel: **decision = include** (part of "accurate trace").
- Regression guardrail test (all 3 paths pass JSON mode) = highest-value anti-regression check.

---

## Work Objectives

### Core Objective

Make archetype generation durably reliable against empty/reasoning-only LLM responses, surface friendly errors, restore the URL-encoded-tenant convention, and add a clarify-then-act creation flow that resolves ambiguity before generating an employee. **The creation entry point stays a single text box**: if the description is already clear, generation proceeds directly (today's experience, unchanged); the chat experience appears ONLY when the system needs to ask clarifying questions.

### Concrete Deliverables

- Modified `src/gateway/services/archetype-generator.ts`, `src/lib/call-llm.ts`
- Modified `src/gateway/routes/admin-archetype-generate.ts` + dashboard `CreateEmployeePage.tsx`, `EmployeeList.tsx`, `EmployeeListStates.tsx`, `App.tsx`
- New/adapted converse-style creation endpoint + wizard chat step
- Unit + integration tests; live API + browser E2E evidence
- AGENTS.md doc note

### Definition of Done

- [ ] Live generate E2E returns HTTP 200 with non-empty `identity` + `execution_steps` against the real default model
- [ ] Empty-content is retried exactly once, then fails with a non-technical message
- [ ] All 3 generation entry points pass `responseFormat: json_object` (asserted by a test)
- [ ] New Employee navigation carries `?tenant=` and survives refresh
- [ ] Clarify flow asks a question for an ambiguous description, then produces a valid employee

### Must Have

- JSON mode on generate; bounded one-shot empty-content retry in shared helper
- Accurate, distinct (empty vs invalid-JSON) internal errors; non-technical user-facing copy
- Accurate trace (`retry_count`/`status`)
- URL tenant fix at all 5 sites
- Clarify-then-act creation flow with 5-question backstop
- Single-textbox entry preserved: chat appears ONLY when clarification is needed; clear descriptions generate directly with no chat UI
- Maximal reuse across the three clarify surfaces: ONE generator converse method, ONE discriminated result contract (`question`/`proposal`/`no_change`/`too_long`), ONE generalized client chat hook shared by the assistant tab AND the create wizard

### Must NOT Have (Guardrails)

- NO automatic model fallback (user-excluded)
- NO skill-registry-drift guardrail (user-excluded)
- NO change to `converse()` failure semantics (`no_change`/`too_long`/`question`)
- NO chat UI on the initial create screen — the first thing the user sees MUST remain the plain single text box
- NO second/parallel chat state machine — the create wizard MUST consume the same generalized `useChatConversation` hook as the assistant tab, not a copy
- NO duplicate converse logic on the server — the create endpoint MUST call the same `ArchetypeGenerator.converse()` method as `propose-edit`; only the baseline (empty for create) and the field-allowlist may differ
- NO retry that can run more than once per call (no loops, no unbounded recursion)
- NO technical error text leaked to end users (keep in `details`/logs only)
- NO employee-specific language in shared files (`call-llm.ts`)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest: `pnpm test:unit`, `pnpm test:integration`)
- **Automated tests**: YES (TDD — RED → GREEN → REFACTOR)
- **Framework**: vitest

### QA Policy

Every task includes agent-executed QA scenarios. Evidence → `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Backend/LLM**: vitest unit tests with mocked `callLLMFn` + live `curl` against gateway
- **Dashboard**: Playwright (browser) for URL + clarify-flow
- **Trace**: psql against `archetype_generation_calls`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — core fix, RED tests + impl):
├── Task 1: JSON mode on generate() + symmetry regression test [quick]
├── Task 2: Bounded empty-content retry in callLLMWithJsonRetry [deep]
├── Task 3: Accurate internal error classification (empty vs JSON) [quick]
└── Task 4: Accurate _persistCall trace (retry_count/status) [quick]

Wave 2 (After Wave 1 — error surface + URL convention):
├── Task 5: Non-technical user-facing error (route + dashboard) [unspecified-high]
├── Task 6: Tenant-URL convention fix (5 sites + create reads URL) [quick]
└── Task 7: Live generate E2E + trace verification [unspecified-high]

Wave 3 (After Wave 2 — clarify-then-act creation flow):
├── Task 8: Creation converse endpoint (server) [deep]
├── Task 9: Wizard chat-first step UI (CreateEmployeePage) [visual-engineering]
└── Task 10: Backstop + ambiguity unit/integration tests [unspecified-high]

Wave 4 (After Wave 3 — integration + docs):
├── Task 11: Clarify-flow live E2E (ambiguous → question → create) [unspecified-high]
└── Task 12: AGENTS.md + README doc updates [writing]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> user okay -> Notify

Critical Path: T1 → T2 → T3 → T8 → T9 → T11 → F1–F4 → user okay
```

### Dependency Matrix

- **1-4**: deps none → unblock 5,6,7,8
- **5**: deps 3 → unblock 7,9
- **6**: deps none → unblock 11
- **7**: deps 1,2,3,4 → unblock (gate Wave 3)
- **8**: deps 1,2,3 → unblock 9,10,11
- **9**: deps 5,8 → unblock 11
- **10**: deps 8 → unblock 11
- **11**: deps 6,9,10 → unblock 12
- **12**: deps 11 → unblock FINAL

### Agent Dispatch Summary

- **Wave 1 (4)**: T1 quick, T2 deep, T3 quick, T4 quick
- **Wave 2 (3)**: T5 unspecified-high, T6 quick, T7 unspecified-high
- **Wave 3 (3)**: T8 deep, T9 visual-engineering, T10 unspecified-high
- **Wave 4 (2)**: T11 unspecified-high, T12 writing
- **FINAL (4)**: F1 oracle, F2 unspecified-high, F3 unspecified-high, F4 deep

---

## TODOs

- [x] 1. Add JSON mode to generate() + symmetry regression test

  **What to do**:
  - In `src/gateway/services/archetype-generator.ts:622`, add `responseFormat: { type: 'json_object' as const }` to `generate()`'s `llmOptions`, matching `refine()` (:673) and `converse()` (:786).
  - RED first: write a test asserting `generate()`'s captured `callLLMFn` options include `responseFormat.type === 'json_object'`.
  - Add the regression guardrail test: assert ALL THREE entry points (`generate`, `refine`, `converse`) pass `responseFormat: { type: 'json_object' }` (inspect options arg captured by a mocked `callLLMFn`).

  **Must NOT do**: Do not change temperature/maxTokens; do not alter refine/converse behavior beyond the assertion.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single-field change + focused tests.
  - **Skills**: [] — no domain skill needed.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 7,8 | Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:609-654` (generate), `:673-678` (refine options), `:786-791` (converse options) — copy the responseFormat shape.
  - `tests/unit/gateway/archetype-generator-instrumentation.test.ts` — existing mock pattern for `callLLMFn` (`makeRoutingLLM`).

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit -- archetype-generator` → PASS including new symmetry test

  ```
  Scenario: generate() requests JSON mode
    Tool: Bash (vitest)
    Steps:
      1. Mock callLLMFn returning valid JSON; call generate()
      2. Assert captured options.responseFormat.type === 'json_object'
    Expected Result: test passes
    Evidence: .sisyphus/evidence/task-1-json-mode.txt

  Scenario: all three paths pass JSON mode (regression guard)
    Tool: Bash (vitest)
    Steps:
      1. Invoke generate, refine, converse with mocked callLLMFn
      2. Assert each captured options.responseFormat.type === 'json_object'
    Expected Result: passes; would fail if any path drops JSON mode
    Evidence: .sisyphus/evidence/task-1-symmetry.txt
  ```

  **Commit**: groups with Wave 1

- [x] 2. Bounded empty-content retry in callLLMWithJsonRetry

  **What to do**:
  - In `archetype-generator.ts` `callLLMWithJsonRetry` (:457), move the FIRST `callLLMFn()` (:471) INSIDE a try/catch so the empty-content `Error` thrown by `call-llm.ts:305` is caught.
  - On empty-content error, retry EXACTLY ONCE with the existing nudge pattern (mirror the JSON-parse nudge at :508-552). After one failed retry, throw.
  - Hard cap: `callLLMFn` invoked at most 2× per call total. No loops, no recursion without counter.
  - RED first: test mocking `content:''` on call 1, valid JSON on call 2 → resolves, exactly 2 calls. Test mocking `content:''` on BOTH → rejects, exactly 2 calls (never 3+).

  **Must NOT do**: Do not change `converse()`'s catch-to-`no_change` behavior. Do not introduce unbounded retry. Do not edit `call-llm.ts` throw site in this task (Task 3 owns message classification).

  **Recommended Agent Profile**:
  - **Category**: `deep` — control-flow change in a shared helper with subtle retry semantics.
  - **Skills**: [] (optionally `data-access-conventions` if touching repo persistence — but that's Task 4).

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 7,8 | Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:457-553` — full helper; mirror the existing one-shot nudge.
  - `src/lib/call-llm.ts:300-306` — the empty-content throw to catch.
  - `tests/unit/gateway/services/archetype-generator-repair.test.ts:177-188` — existing empty-content guard test reference.

  **Acceptance Criteria**:

  ```
  Scenario: empty-then-success recovers
    Tool: Bash (vitest)
    Steps:
      1. Mock callLLMFn: call1 content:'', call2 valid JSON
      2. Call generate(); assert resolves, callLLMFn called exactly 2x
    Expected Result: resolves with parsed config
    Evidence: .sisyphus/evidence/task-2-recover.txt

  Scenario: both-empty fails bounded
    Tool: Bash (vitest)
    Steps:
      1. Mock callLLMFn: content:'' both calls
      2. Call generate(); assert rejects, callLLMFn called exactly 2x (never 3+)
    Expected Result: rejects; call count == 2
    Evidence: .sisyphus/evidence/task-2-bounded.txt
  ```

  **Commit**: groups with Wave 1

- [x] 3. Accurate internal error classification (empty vs invalid-JSON)

  **What to do**:
  - When the final failure is empty/reasoning-only content, the thrown message must say so (e.g. `GENERATION_FAILED: LLM returned no usable content`) — NOT "invalid JSON".
  - Keep JSON-parse failures labeled as JSON errors. Distinguish the two in the nudge text and the final `generate()`/`refine()` catch (`:636-649`, `:691-706`).
  - RED first: test asserts both-empty failure surfaces a non-"invalid JSON" message; JSON-parse failure still says JSON.

  **Must NOT do**: Do not leak technical text to end users here (Task 5 owns user-facing copy). Do not change HTTP status mapping.

  **Recommended Agent Profile**:
  - **Category**: `quick` — string/branch classification + tests.
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 5,7,8 | Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:636-649` (generate catch), `:691-706` (refine catch).
  - `src/lib/call-llm.ts:305` — source error string to detect.

  **Acceptance Criteria**:

  ```
  Scenario: empty-content error not labeled invalid JSON
    Tool: Bash (vitest)
    Steps:
      1. Force both-empty; capture thrown message
      2. Assert message does NOT contain "invalid JSON" and indicates empty/no content
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-3-classify.txt
  ```

  **Commit**: groups with Wave 1

- [x] 4. Accurate archetype_generation_calls trace (retry_count/status)

  **What to do**:
  - Fix the pre-existing mislabel: `_persistCall` for the first call (`:473-490`) hardcodes `retry_count:0, status:'success'` BEFORE JSON validation. Record the trace AFTER the outcome is known so a call that ultimately failed is `status:'failed'` and a retried-then-succeeded call records `retry_count:1, status:'success'`.
  - RED first: spy on `_persistCall`/repo. Empty-then-success → final row `retry_count:1, status:'success'`. Both-empty → final row `status:'failed'`, non-empty `error_message`. Assert no row claims `success` for an ultimately-failed call.

  **Must NOT do**: Do not change the table schema. Do not break the best-effort (non-throwing) persistence contract.

  **Recommended Agent Profile**:
  - **Category**: `quick` — reorder/condition persistence + tests.
  - **Skills**: [`data-access-conventions`] — touches repository persistence patterns.

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 7 | Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:448-553` — `_persistCall` + both call sites.
  - `src/repositories/ArchetypeGenerationCallRepository.ts` — `record()` signature.
  - `.opencode/skills/employee-creation-debugging/SKILL.md` §3-4 — trace table columns + failed-row shape.
  - `tests/unit/repositories/archetype-generation-call-repository.test.ts` — existing patterns.

  **Acceptance Criteria**:

  ```
  Scenario: retried-success records retry_count 1
    Tool: Bash (vitest)
    Steps:
      1. Spy repo.record; empty-then-success generate()
      2. Assert a recorded row has retry_count:1 status:'success'
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-4-trace-success.txt

  Scenario: ultimate failure records failed
    Tool: Bash (vitest)
    Steps:
      1. both-empty generate(); assert final recorded row status:'failed' with error_message
      2. Assert NO recorded row marks the failed call as success
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-4-trace-failed.txt
  ```

  **Commit**: groups with Wave 1

- [ ] 5. Non-technical user-facing generation error (route + dashboard)

  **What to do**:
  - Route (`src/gateway/routes/admin-archetype-generate.ts:122-132`): keep raw message in `details` (logs/debug), but return a non-technical user-facing message field for `GENERATION_FAILED` (e.g. "We couldn't generate your employee from that description. Please try again or add more detail.").
  - Dashboard (`CreateEmployeePage.tsx:73,258`): render the friendly message, not raw `Gateway error 422 ...`. Parse the structured error; fall back to a generic friendly string if absent.
  - RED first (dashboard): test that an error response renders the friendly copy and does NOT render "Gateway error" / "422" / raw JSON.

  **Must NOT do**: Do not remove `details` from the API (debugging needs it). Do not change error copy for unrelated routes.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — spans gateway route + React, with copy + parsing.
  - **Skills**: [`react-dashboard`, `api-design`] — dashboard conventions + sendError/ERROR_CODES shape.

  **Parallelization**: Can Run In Parallel: NO (after T3) | Wave 2 | Blocks: 9 | Blocked By: 3

  **References**:
  - `src/gateway/routes/admin-archetype-generate.ts:122-132` — catch + sendError.
  - `src/gateway/lib/http-response.ts` — sendError shape.
  - `dashboard/src/lib/gateway.ts:90,250` — `generateArchetype` + error throw text.
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:51-76,254-266` — error state + render.
  - AGENTS.md "End-user language is non-technical" convention.

  **Acceptance Criteria**:

  ```
  Scenario: friendly error rendered (dashboard unit)
    Tool: Bash (vitest)
    Steps:
      1. Mock generateArchetype to reject with a GENERATION_FAILED error
      2. Render CreateEmployeePage error state; assert text is friendly
      3. Assert NOT containing "Gateway error","422", or raw JSON braces
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-5-friendly.txt
  ```

  **Commit**: groups with Wave 2

- [ ] 6. Tenant-URL convention fix (5 sites + create reads URL)

  **What to do**:
  - Append `?tenant=${tenantId}` to all New Employee navigations: `EmployeeList.tsx:94`, `EmployeeListStates.tsx:30,78,85`.
  - Ensure `/dashboard/employees/new` (`CreateEmployeePage.tsx`) reads tenant from the URL via `useTenant()` (which already reads `searchParams.get('tenant')` first in `use-tenant.ts:42`) and that the back-nav (`:155`) preserves `?tenant=`.
  - Confirm the route in `App.tsx:94` needs no param change (tenant is a query param, consistent with other pages).
  - RED first (browser): clicking "+ New Employee" yields a URL containing `tenant=`.

  **Must NOT do**: Do not convert tenant to a path segment (other pages use query param). Do not change `use-tenant.ts` fallback logic.

  **Recommended Agent Profile**:
  - **Category**: `quick` — small nav-string edits.
  - **Skills**: [`react-dashboard`]

  **Parallelization**: Can Run In Parallel: YES | Wave 2 | Blocks: 11 | Blocked By: None

  **References**:
  - `dashboard/src/panels/employees/EmployeeList.tsx:94`, `components/EmployeeListStates.tsx:30,78,85` — nav sites.
  - `dashboard/src/hooks/use-tenant.ts:42-59` — tenant resolution + setSearchParams pattern.
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:231` — correct `?tenant=` precedent.

  **Acceptance Criteria**:

  ```
  Scenario: New Employee nav carries tenant + survives refresh
    Tool: Playwright
    Preconditions: logged in, on /dashboard/employees?tenant=<id>
    Steps:
      1. Click "+ New Employee"
      2. Assert page.url() contains "tenant=<id>"
      3. Reload; assert create form renders (no error state, tenant retained)
    Expected Result: tenant present in URL and after reload
    Evidence: .sisyphus/evidence/task-6-url.png
  ```

  **Commit**: groups with Wave 2

- [ ] 7. Live generate E2E + trace verification (Wave 1 gate)

  **What to do**:
  - With services running, POST to the real generate endpoint against the default `gateway_llm_model` (deepseek-v4-flash). Assert HTTP 200 and a body with non-empty `identity` and `execution_steps`.
  - Use the exact failing-style prompt to confirm the original bug is gone: `"reads all of our Slack channels and provides an executive summary"`.
  - Verify the trace: query `archetype_generation_calls` for the tenant; confirm a `status:'success'` row, and if any empty-content retry occurred, `retry_count>=1`.
  - This is the gate that proves the Wave 1 fix works end-to-end before building the clarify flow.

  **Must NOT do**: Do not mock the LLM. Do not skip the live call ("verified from code" is insufficient per repo policy).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — live E2E + DB verification.
  - **Skills**: [`employee-creation-debugging`, `feature-verification`, `long-running-commands`]

  **Parallelization**: NO (gate) | Wave 2 | Blocks: Wave 3 | Blocked By: 1,2,3,4

  **References**:
  - `.opencode/skills/employee-creation-debugging/SKILL.md` §2 (3-call flow) + §4 (failed-row query).
  - AGENTS.md "Post-Implementation E2E Testing (MANDATORY)".

  **Acceptance Criteria**:

  ```
  Scenario: live generate succeeds on the previously-failing prompt
    Tool: Bash (curl)
    Preconditions: pnpm dev running; SERVICE_TOKEN sourced
    Steps:
      1. curl POST .../archetypes/generate -d '{"description":"reads all of our Slack channels and provides an executive summary"}'
      2. Assert HTTP 200
      3. Assert response.identity and response.execution_steps are non-empty
    Expected Result: 200 with populated config
    Evidence: .sisyphus/evidence/task-7-generate.json

  Scenario: trace row recorded accurately
    Tool: Bash (psql)
    Steps:
      1. SELECT call_type,status,retry_count FROM archetype_generation_calls WHERE tenant_id='<id>' AND call_type='generate' ORDER BY created_at DESC LIMIT 1
      2. Assert status='success'
    Expected Result: success row present
    Evidence: .sisyphus/evidence/task-7-trace.txt
  ```

  **Commit**: NO (verification only)

- [ ] 8. Creation converse endpoint (clarify-then-act, server)

  **What to do**:
  - Add a server path that runs the converse-style clarify flow for CREATION (no existing archetype). It MUST call the **same `ArchetypeGenerator.converse()` method** that `propose-edit` calls — do NOT write a second converse implementation. The discriminated result contract stays identical: `{ kind:'question' }` | `{ kind:'proposal' }` | `{ kind:'no_change' }` | `{ kind:'too_long' }`.
  - The ONLY legitimate differences between create and edit are: (a) the **baseline** passed to `converse()` — edit passes the existing archetype config; create passes an empty/default baseline so the proposal IS the generated employee — and (b) the field allowlist applied to the proposal. Extract a shared baseline/allowlist helper if needed so both routes stay thin.
  - New endpoint `POST .../archetypes/converse-create`, mirroring the request-stateless transcript shape of `propose-edit` (client holds transcript; server holds no session).
  - Reuse the 5-question backstop (`converse` already forces a proposal after 5 assistant turns).
  - RED first: integration test — ambiguous transcript → `kind:'question'`; clear transcript → `kind:'proposal'` with non-empty identity/execution_steps.

  **Must NOT do**: Do not alter the existing edit-side `propose-edit` route's behavior. Do not change `converse()` failure semantics. Do NOT duplicate the converse logic — both routes must funnel through the one `converse()` method; if the methods diverge, that is a defect.

  **Recommended Agent Profile**:
  - **Category**: `deep` — new endpoint wiring + baseline design.
  - **Skills**: [`api-design`, `employee-creation-debugging`, `data-access-conventions`]

  **Parallelization**: NO | Wave 3 | Blocks: 9,10,11 | Blocked By: 1,2,3

  **References**:
  - `src/gateway/services/archetype-generator.ts:752-885` — converse() to reuse.
  - `src/gateway/routes/admin-archetype-propose-edit.ts` — endpoint + transcript shape precedent.
  - AGENTS.md "AI Assistant tab" (propose-edit discriminated union) — mirror request-stateless design.

  **Acceptance Criteria**:

  ```
  Scenario: ambiguous description yields a question
    Tool: Bash (vitest integration)
    Steps:
      1. POST transcript=[{role:'user',content:'summarize all my slack channels'}]
      2. Assert kind === 'question' with non-empty question
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-8-question.txt

  Scenario: sufficient detail yields a proposal
    Tool: Bash (vitest integration)
    Steps:
      1. POST transcript with channel, cadence, destination specified
      2. Assert kind==='proposal', proposal.identity and execution_steps non-empty
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-8-proposal.txt

  Scenario: create and edit routes share one converse method (reuse guard)
    Tool: Bash (vitest)
    Steps:
      1. Spy on ArchetypeGenerator.converse
      2. Drive converse-create with a transcript; assert ArchetypeGenerator.converse was invoked
      3. Assert the create route contains no inline converse/LLM-branching logic of its own (single call site)
    Expected Result: both routes funnel through the same method
    Evidence: .sisyphus/evidence/task-8-shared-converse.txt
  ```

  **Commit**: groups with Wave 3-4

- [ ] 9. Generalize the chat hook + wizard single-textbox entry with conditional chat escalation

  **What to do**:
  - **Generalize the existing chat hook FIRST.** The assistant tab's `useChatConversation` currently hardcodes the edit converse caller (`converseEdit`) and requires an `archetypeId`. Refactor it so the converse caller is INJECTED (a function the consumer passes in) and `archetypeId` is optional. The hook keeps owning the full ask→answer→propose state machine, transcript, the four `kind` branches, and friendly error parsing — written ONCE.
  - **Migrate the assistant tab to the generalized hook** and keep its existing tests green (no behavior change for the edit flow). This proves the generalization is backward-compatible before the create wizard depends on it.
  - **Preserve the simple entry experience**: the create screen opens as the existing single text box (`step === 'describe'`). The user types one description and submits — no chat UI visible up front.
  - **Conditional branching on submit** (driven by the generalized hook, with a converse-create caller injected):
    - If the server returns `kind:'proposal'` on first submit, proceed directly into the existing `edit` step (pre-filled from the proposal) — current happy path, unchanged from the user's perspective.
    - ONLY if the server returns `kind:'question'` does the UI escalate into the chat experience: render the question as a chat bubble, answer in the same input, continue the loop until a `kind:'proposal'` arrives → transition into `edit`.
  - Keep the existing edit/preview/save steps intact (proposal feeds `setConfig`/`setEditedFields`).
  - Friendly error handling from Task 5 applies here too. `kind:'too_long'` → friendly message (Task 10).
  - RED first: hook test (injected caller is invoked, archetypeId optional path works); component tests — (a) clear description → never shows chat, lands directly on edit step; (b) ambiguous → escalates to chat; (c) chat loops to proposal then edit.

  **Must NOT do**: Do NOT create a second/copied chat hook — generalize the one that exists. Do NOT change the assistant tab's user-visible behavior. Do NOT show chat UI on initial create load — first screen stays the plain text box. Do NOT remove the existing edit/preview/save flow. Do NOT force the chat path when a proposal comes back immediately.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — chat UI/UX + a careful shared-hook refactor in React.
  - **Skills**: [`react-dashboard`]

  **Parallelization**: NO | Wave 3 | Blocks: 11 | Blocked By: 5,8

  **References**:
  - `dashboard/src/panels/employees/use-chat-conversation.ts` — the hook to GENERALIZE (currently imports `converseEdit` at line 2, calls it at line 101, requires `archetypeId` at line 67). These are the exact coupling points to parameterize.
  - `dashboard/src/panels/employees/AssistantTab.tsx` — current consumer; migrate it to the generalized hook with no behavior change.
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — wizard steps to extend; new consumer of the generalized hook.
  - `dashboard/src/lib/gateway.ts` — `converseEdit` precedent (line ~250 area); add a sibling `converseCreate` client fn to inject.

  **Acceptance Criteria**:

  ```
  Scenario: clear description skips chat entirely (preserve simple UX)
    Tool: Bash (vitest component)
    Steps:
      1. Mock converse-create → kind:'proposal' on first submit
      2. Render describe step; assert it is a single text box, no chat bubbles
      3. Submit a clear description
      4. Assert NO chat UI ever rendered; wizard lands directly on edit step with prefilled fields
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-9-clear-skips-chat.txt

  Scenario: ambiguous description escalates to chat
    Tool: Bash (vitest component)
    Steps:
      1. Mock converse-create → kind:'question' on first submit
      2. Submit ambiguous description; assert question bubble + input appear
      3. Submit answer; assert second request includes full transcript
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-9-chat.txt

  Scenario: chat loop ends at proposal → edit step
    Tool: Bash (vitest component)
    Steps:
      1. Mock converse-create → kind:'question' then kind:'proposal'
      2. Answer the question; assert wizard transitions to edit step with prefilled fields
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-9-proposal.txt

  Scenario: assistant tab and create wizard share ONE hook (reuse guard)
    Tool: Bash (vitest + grep)
    Steps:
      1. Assert AssistantTab and CreateEmployeePage both import the same useChatConversation module (no duplicate/copied hook file exists)
      2. Run the assistant tab's existing test suite; assert all green (edit behavior unchanged after generalization)
      3. Assert the generalized hook accepts an injected converse caller and works with archetypeId omitted
    Expected Result: one shared hook, edit flow intact, create flow uses injection
    Evidence: .sisyphus/evidence/task-9-shared-hook.txt
  ```

  **Commit**: groups with Wave 3-4

- [ ] 10. Backstop + ambiguity tests

  **What to do**:
  - Verify the 5-question backstop forces a proposal (no infinite questioning) for the creation path, and the `too_long` token guard returns gracefully.
  - Add tests covering: backstop coercion (>5 assistant turns → proposal, never question), and `too_long` path renders a friendly message in the wizard.

  **Must NOT do**: Do not change `CONVERSE_TOKEN_BUDGET` or backstop threshold without noting it (these are semantic constants).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — cross-layer test coverage.
  - **Skills**: []

  **Parallelization**: YES | Wave 3 | Blocks: 11 | Blocked By: 8

  **References**:
  - `src/gateway/services/archetype-generator.ts:761-768,811-814` — token budget + backstop.

  **Acceptance Criteria**:

  ```
  Scenario: backstop forces proposal after 5 questions
    Tool: Bash (vitest)
    Steps:
      1. Build transcript with 5 assistant turns; mock model returning question
      2. Assert result coerced away from 'question'
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-10-backstop.txt
  ```

  **Commit**: groups with Wave 3-4

- [ ] 11. Clarify-flow live E2E (ambiguous → question → create)

  **What to do**:
  - Live browser E2E: from `/dashboard/employees`, click New Employee (asserting tenant in URL from Task 6), type the ambiguous prompt `"summarize all my Slack channels"`, confirm the wizard asks at least one clarifying question, answer it, and confirm a valid employee proposal is produced and saved as draft.
  - Capture screenshots at each stage. Verify the saved draft exists via `archetypes` query.

  **Must NOT do**: Do not mock the LLM. Do not skip the question step assertion.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — full live browser + DB E2E.
  - **Skills**: [`e2e-testing`, `employee-creation-debugging`, `long-running-commands`]

  **Parallelization**: NO | Wave 4 | Blocks: 12 | Blocked By: 6,9,10

  **References**:
  - `.opencode/skills/e2e-testing/SKILL.md` — Playwright via CDP.
  - `.opencode/skills/employee-creation-debugging/SKILL.md` §2 — draft verification.

  **Acceptance Criteria**:

  ```
  Scenario: ambiguous prompt → clarify → create (live)
    Tool: Playwright
    Preconditions: pnpm dev running; logged in
    Steps:
      1. /dashboard/employees → click "+ New Employee" (assert tenant in URL)
      2. Type "summarize all my Slack channels"; submit
      3. Assert a clarifying question bubble appears
      4. Answer (e.g. "#general, daily at 9am, post to #digests"); submit
      5. Assert wizard reaches edit/proposal with non-empty identity
      6. Save draft; assert navigation to employee detail
    Expected Result: draft created after clarification
    Evidence: .sisyphus/evidence/task-11-clarify-flow.png

  Scenario: clear prompt generates directly, no chat (live)
    Tool: Playwright
    Preconditions: pnpm dev running; logged in
    Steps:
      1. /dashboard/employees → click "+ New Employee"
      2. Type a fully-specified prompt: "Every weekday at 9am, read the #support Slack channel and post a summary of unresolved issues to #support-digest"; submit
      3. Assert NO clarifying question/chat bubble appears
      4. Assert wizard lands directly on the edit/proposal step with non-empty identity
    Expected Result: direct generation, chat never shown
    Evidence: .sisyphus/evidence/task-11-direct-no-chat.png

  Scenario: draft persisted
    Tool: Bash (psql)
    Steps:
      1. SELECT id,role_name,status FROM archetypes ORDER BY created_at DESC LIMIT 1
      2. Assert a new draft row exists
    Expected Result: row present
    Evidence: .sisyphus/evidence/task-11-draft.txt
  ```

  **Commit**: NO (verification only)

- [ ] 12. Documentation updates

  **What to do**:
  - Update AGENTS.md: note the generate path now uses JSON mode + bounded empty-content retry (call-llm/archetype-generator), the accurate trace behavior, and the new clarify-then-act creation flow (alongside the existing AI Assistant edit flow).
  - Update README.md admin endpoint table if a new converse-create endpoint was added.
  - Update the `employee-creation-debugging` skill if the wizard flow changed (per AGENTS.md discrepancy rule).

  **Must NOT do**: Do not add volatile counts (per Documentation Durability rule). Do not document excluded features (model fallback) as present.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: NO | Wave 4 | Blocks: FINAL | Blocked By: 11

  **References**:
  - AGENTS.md "Documentation Freshness (MANDATORY)" + "Documentation Durability".
  - `.opencode/skills/employee-creation-debugging/SKILL.md` §2.

  **Acceptance Criteria**:

  ```
  Scenario: docs build/lint clean and reference new behavior
    Tool: Bash
    Steps:
      1. grep AGENTS.md for the new clarify-flow + JSON-mode note
      2. Assert present; assert no "model fallback" claim
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-12-docs.txt
  ```

  **Commit**: `docs: archetype generation reliability + clarify-then-act wizard`

- [ ] 13. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1-F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read plan end-to-end. Each "Must Have": verify implementation exists (read file, curl, run test). Each "Must NOT Have": grep codebase for forbidden patterns (model fallback, converse semantic changes, technical error leakage) — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` (tsc) + `pnpm lint` + `pnpm test:unit`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, AI slop. Confirm `call-llm.ts` stays employee-agnostic.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright`)
      From clean state, execute EVERY task QA scenario. Live generate E2E (real model). Browser: New Employee URL carries tenant + survives refresh; clarify flow asks question for ambiguous prompt then creates. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N] | Integration [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do" + actual diff (git diff). Verify 1:1 — nothing missing, nothing beyond spec. Confirm "Must NOT do" compliance. Detect cross-task contamination. **Reuse audit**: confirm there is exactly ONE client chat hook (no copied/parallel hook) consumed by both the assistant tab and the create wizard, and that both `propose-edit` and `converse-create` funnel through the single `ArchetypeGenerator.converse()` method (no duplicated converse logic).
      Output: `Tasks [N/N] | Contamination [CLEAN/N] | Reuse [1 hook/1 method | DRIFT] | VERDICT`

---

## Commit Strategy

- Wave 1: `fix(archetype-gen): add JSON mode and bounded retry for empty LLM responses`
- Wave 2: `fix(dashboard): non-technical generation errors and tenant-encoded URLs`
- Wave 3-4: `feat(wizard): clarify-then-act creation flow for ambiguous descriptions`

---

## Success Criteria

### Verification Commands

```bash
pnpm test:unit                 # all pass
pnpm build && pnpm lint        # clean
# live generate (expect HTTP 200, non-empty identity/execution_steps)
curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/generate" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"description":"Send a daily Slack summary of new guest messages"}'
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Live generate + clarify E2E evidence captured
- [ ] Docs updated

## Future Work (Backlog)

- Apply clarify-then-act pattern to the `refine` path as well (currently one-shot nudge).
- Consider a session-cached vs disk-discovered skill consistency check (deferred — user declined as a guardrail here).
