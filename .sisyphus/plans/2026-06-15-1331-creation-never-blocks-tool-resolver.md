# Employee Creation Never Blocks: Deterministic Tool Resolver + No-Technical-Error Guarantee

## TL;DR

> **Quick Summary**: Make AI employee creation/editing a "total function" for non-technical users — every plain-English description either yields a working employee or a plain-English follow-up question, NEVER a technical error. Root cause: the conversation routes hard-fail with `422 PROPOSAL_INVALID` when the LLM emits a tool path missing `.ts` (e.g. `/tools/slack/read-channels`), and the frontend mislabels it "too complex to process." Fix: replace the hard-blocking tool validator with a deterministic, idempotent `resolveToolPaths()` (normalize-or-drop, exact-match against the real tool library, never fuzzy, never touch Composio), de-fang `validateTools` so tool issues drop-with-warning instead of 422, apply to BOTH shared routes (converse-create + propose-edit), and make the frontend incapable of surfacing a raw technical error.
>
> **Deliverables**:
>
> - Pure `resolveToolPaths()` resolver (normalize `/tools/` prefix + `.ts` suffix + bare-name→path; drop unresolvable; never fuzzy; skip Composio) with a full unit matrix.
> - De-fanged `validateTools`/`validateProposalFields`: tools never block; trigger_sources/input_schema salvage-or-coerce; prose-went-blank becomes a plain-English re-ask (not a 422).
> - Both `converse-create` and `propose-edit` stop returning 422 over tools; frontend chat hook can never render a raw gateway error.
> - Pre-enforcement validation gate: flipping `enforce_tool_registry → true` re-resolves and refuses (in plain English) on empty/unresolvable registry.
> - Observability preserved: every drop/coerce logged with tenant/archetype/path; dropped-tool count on the generation-call trace.
> - Live deepseek-v4-flash E2E replaying the EXACT failing transcript → proposal → save → trigger → `Done`.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (resolver) → T2 (de-fang validator) → T3 (routes) → T7 (live E2E) → F1–F4 → user okay

---

## Context

### Original Request

A user creating a Slack-summary employee in the wizard hit this conversation:

1. User: "I need an AI employee that reads all of the Slack channels and provides an executive summary."
2. Assistant: "Which Slack channels should I read from?"
3. User: "#project-lighthouse and #general"
4. Assistant: "I couldn't turn that into a change just now — the request may have been too complex to process. Try rephrasing it a bit, or breaking it into smaller changes."

The user asked: why did that happen, how do we fix it. That last message makes no sense to them.

### Interview Summary

**Root cause (code-verified)**:

- The 4th message is a generic FRONTEND fallback fired by a `catch` block (`dashboard/src/panels/employees/use-chat-conversation.ts:146`), NOT a real assistant reply.
- The chain: `converse-create` route → `generator.converse()` succeeds (DB trace `archetype_generation_calls.status = success` at the attempt timestamp) → route runs `validateProposalFields()` on `proposal.tool_registry.tools` → LLM emitted `/tools/slack/read-channels` WITHOUT `.ts` (documented non-deterministic LLM variance, T9 notepad of the prior plan) → `validateTools()` (`src/gateway/lib/archetype-edit-helpers.ts:99-125`) rejects it → route returns `sendError(res, 422, 'PROPOSAL_INVALID', ..., { errors })` (`src/gateway/routes/admin-archetype-converse-create.ts:215-219`).
- Frontend `getProposalErrorMessage()` (`use-chat-conversation.ts:7-27`) only parses a `{ reasons: {...} }` body shape; the route sends `{ errors: [...] }`. Shape mismatch → falls through to `PROPOSAL_ERROR_FALLBACK` ("too complex").

**The precise gap**: `postProcess()` (`src/gateway/services/archetype-generator.ts:382-389`) normalizes a BARE `service/tool` → `/tools/service/tool.ts` (lines 384-388) but a `/tools/`-prefixed path missing `.ts` hits line 383 (`if (normalized.startsWith('/tools/')) return normalized;`) and returns UNCHANGED. The validator then byte-rejects it.

**Tool consumption map (code-verified)**:

- `src/workers/lib/agents-md-compiler.mts` (builds the AGENTS.md the employee runs with) does NOT read `tool_registry` at all. The running employee discovers tools from on-demand skills at runtime.
- `isToolAllowed()` (`src/workers/lib/execution-phase.mts:79-89`) is the ONLY runtime consumer — exact-string Set match, but ONLY when `enforce_tool_registry === true`. That flag DEFAULTS FALSE → by default the list is never consulted at runtime.
- The creation-time validator is the only thing that hard-blocks on tool paths.

**Governing principle (confirmed with user — scale lens)**:

> Goal: millions of AI employees created by users with ZERO technical expertise.
> INVARIANT: Employee creation/editing must be a "total function" — every plain-English description either produces a working employee OR asks a plain-English follow-up question. It must NEVER terminate in a raw technical error.

**Confirmed decisions**:

1. Keep `tool_registry.tools` as REAL tool paths (so `enforce_tool_registry` capability sandboxing stays real + exact — a Slack bot should never be ABLE to rotate door locks), but make it SYSTEM-DERIVED advisory metadata, never user-authored, never blocking.
2. Resolver scope = "normalize + drop unknowns, never block." Deterministic only — NO fuzzy/semantic intent→tool mapping (explicit future work).
3. Frontend never surfaces a raw technical error — proposal or plain-English question only.
4. Fix BOTH CREATE (`converse-create`) and EDIT (`propose-edit`) — they share `validateProposalFields` + the frontend hook.
5. Include the pre-enforcement validation gate (refuse flipping `enforce_tool_registry → true` on empty/unresolvable registry, in plain English).

### Metis Review

**Findings incorporated (all code-verified)**:

- **Symmetric bug**: `converse-create` and `propose-edit` are copy-paste siblings sharing `validateProposalFields` + the identical `422 PROPOSAL_INVALID` block + the same frontend hook. Cannot fix CREATE's tool path without touching code EDIT runs. → Fix the shared helper + frontend; both routes inherit. (Tasks 2, 3, 5)
- **`converse()` already runs `postProcess()`** (`archetype-generator.ts:913`) for both routes — so the proposal both routes validate is already postProcessed. The resolver does NOT need a new route call site; it belongs inside the de-fanged validator. (Task 2)
- **Don't put the resolver in `postProcess`**: it's shared across generate/refine/converse (HIGH regression blast radius). Use a dedicated `resolveToolPaths()` consumed by a de-fanged `validateTools`. Leave `postProcess` UNTOUCHED. Golden-test refine/edit to prove no regression. (Tasks 1, 2, 8)
- **The never-block line is NOT "tools never block, everything else blocks."** It's "formatting/variance issues self-heal or drop; semantic-destruction issues re-ask in plain English (never raw-error)." Tools → resolve+drop; trigger_sources invalid → coerce to `{type:'manual'}`+warn; input_schema invalid → drop invalid items; prose-went-blank on EDIT → plain-English RE-ASK (not 422). (Task 2)
- **Composio `/tools/composio/...`**: resolver MUST NOT append `.ts`; unconnected-toolkit composio paths go to DROP-with-reason, never 422. (Task 1)
- **Empty `tool_registry` after all-drop is SAFE** (agents-md-compiler ignores it; isToolAllowed no-ops when enforcement off). Allow empty, log warning, do NOT re-ask the user about tools. (Task 2)
- **`validateProposalFields` returns `{ validTools }`** and both routes depend on it for `tool_registry` + `toolDelta`. The resolver must return the resolved/kept list in the SAME shape. (Task 2)
- **Degraded `no_change` masking**: `converse()` already returns `no_change` on LLM/parse FAILURE (lines ~879, ~887), indistinguishable from a legit no-op. Distinguish via log level; document. (Task 6)
- **Observability**: "Hide from user, never from logs." Every drop/coerce → structured `log.warn` with tenantId/archetypeId/originalPath/outcome; dropped-count on the trace row. (Tasks 2, 6)
- **Pre-enforcement gate** is the correct home for the Question-7 safety net per AGENTS.md. (Task 4)

---

## Work Objectives

### Core Objective

Make the AI employee creation AND editing conversation a total function: tool-path formatting variance from the LLM is deterministically resolved or silently dropped (logged), never producing a `422`; genuinely broken proposals re-ask in plain English; the frontend can never render a raw technical error. Preserve `enforce_tool_registry` exact-path sandboxing and add a pre-enforcement validation gate.

### Concrete Deliverables

- New `resolveToolPaths()` resolver (pure, deterministic, idempotent) + unit matrix.
- Modified `src/gateway/lib/archetype-edit-helpers.ts` (`validateTools` → resolver; `validateProposalFields` never-block policy).
- Modified `src/gateway/routes/admin-archetype-converse-create.ts` + `admin-archetype-propose-edit.ts` (remove 422-over-tools; carry resolved tools).
- Pre-enforcement gate in the archetype PATCH path.
- Modified `dashboard/src/panels/employees/use-chat-conversation.ts` (never render raw technical error).
- Tests (resolver matrix, no-422 invariant, postProcess/refine golden regression, isToolAllowed-unchanged, frontend shape) + live E2E evidence + AGENTS.md doc note.

### Definition of Done

- [ ] The exact failing transcript (Slack summary → "which channels" → "#project-lighthouse and #general") replayed via curl returns `kind:'proposal'` (not 422, not "too complex"); all `proposal.tool_registry.tools` end in `.ts` or are valid Composio entries.
- [ ] Both `converse-create` AND `propose-edit` never return 422 over tool paths.
- [ ] `resolveToolPaths()` is exact-match-or-drop (no fuzzy), idempotent, and skips `/tools/composio/...`.
- [ ] `enforce_tool_registry` exact-path semantics (`isToolAllowed`) UNCHANGED; flipping it ON re-resolves and refuses in plain English on empty/unresolvable registry.
- [ ] `postProcess` and refine/edit-on-existing behavior byte-identical for a known-good archetype (golden test).
- [ ] Frontend never renders a raw gateway error string for these routes.
- [ ] Live deepseek-flash E2E: create → save → activate → trigger → `Done`, task ID + status_log captured.

### Must Have

- Deterministic normalize-or-drop resolver (prefix/suffix/bare-name; exact-resolve against `ALL_TOOL_DESCRIPTORS`).
- Tools never block on BOTH routes; trigger_sources/input_schema salvage-or-coerce; prose-blank re-asks in plain English.
- Pre-enforcement validation gate.
- Observability: structured warn on every drop/coerce + dropped-count on trace row.
- No-422-over-tools invariant test + total-function E2E.

### Must NOT Have (Guardrails)

- NO fuzzy/semantic tool mapping (deferred — deterministic exact-resolve-or-drop ONLY; a normalized path must match a descriptor exactly or be dropped, making wrong-mapping impossible).
- NO modification of `isToolAllowed` or `enforce_tool_registry` exact-match semantics.
- NO change to `postProcess`'s existing bare-`service/tool`→`.ts` or `cron`→`scheduled` behavior (leave the shared function untouched; the resolver lives elsewhere).
- NO regression of the intent-level prose abstraction shipped in the prior plan (execution_steps/delivery_steps/instructions stay plain English).
- NO appending `.ts` to `/tools/composio/...` paths.
- NO silent save of a blank `execution_steps`/`identity` as a real (broken) employee — re-ask instead.
- NO swallowing a true LLM/parse failure as a clean `no_change` without a distinguishing log level.
- NO hiding errors from operators — "hide from user, never from logs."
- NO marking the live-E2E task done on "looks intent-level" — only on a triggered task reaching `Done`.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest: `pnpm test:unit`; dashboard vitest; live `curl`/`psql`).
- **Automated tests**: YES (TDD — RED → GREEN → REFACTOR).
- **Framework**: vitest.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence → `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Backend/resolver/routes**: vitest unit + live `curl` + `jq` assertions against the gateway.
- **DB/trace**: psql against `archetype_generation_calls`, `archetypes`, `task_status_log`.
- **Frontend**: component/unit test (vitest + testing-library) proving no raw error string renders.
- **Worker E2E**: trigger task, watch container, verify `Done` + delivery.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — pure resolver + guardrail tests, INDEPENDENT):
├── Task 1: resolveToolPaths() pure resolver + unit matrix [deep]
├── Task 8: postProcess/refine golden regression + isToolAllowed-unchanged guard tests [unspecified-high]
└── Task 6: Observability + degraded-no_change log differentiation [unspecified-high]

Wave 2 (After T1 — de-fang the shared validator):
└── Task 2: validateTools→resolver + validateProposalFields never-block policy [deep]

Wave 3 (After T2 — apply to both routes + frontend + enforcement gate, MAX PARALLEL):
├── Task 3: converse-create + propose-edit remove 422-over-tools, carry resolved tools [deep]
├── Task 4: Pre-enforcement validation gate on enforce_tool_registry flip [unspecified-high]
└── Task 5: Frontend never-render-raw-error guarantee [visual-engineering]

Wave 4 (After Wave 3 — live verification + docs):
├── Task 7: Live deepseek-flash E2E replaying the exact failing transcript → Done [unspecified-high]
└── Task 9: AGENTS.md doc note (tool_registry advisory + never-block + pre-enforcement gate) [writing]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA + live E2E (unspecified-high)
└── F4: Scope fidelity + boundary audit (deep)
-> Present results -> user okay -> Notify (T10)

Critical Path: T1 → T2 → T3 → T7 → F1-F4 → user okay
```

### Dependency Matrix

- **1**: deps none → unblock 2
- **6**: deps none → unblock 2 (log helpers ready)
- **8**: deps none → independent guard (can land anytime)
- **2**: deps 1,6 → unblock 3,4,5
- **3**: deps 2 → unblock 7
- **4**: deps 2 → unblock 7
- **5**: deps 2 (knows final response contract) → unblock 7
- **7**: deps 3,4,5 → unblock 9
- **9**: deps 7 → unblock FINAL

### Agent Dispatch Summary

- **Wave 1 (3)**: T1 deep, T8 unspecified-high, T6 unspecified-high
- **Wave 2 (1)**: T2 deep
- **Wave 3 (3)**: T3 deep, T4 unspecified-high, T5 visual-engineering
- **Wave 4 (2)**: T7 unspecified-high, T9 writing
- **FINAL (4)**: F1 oracle, F2 unspecified-high, F3 unspecified-high, F4 deep

---

## TODOs

> Implementation + Test = ONE Task. Never separate. Every task has Agent-Executed QA Scenarios. TDD: RED first.

- [x] 1. `resolveToolPaths()` pure deterministic resolver + unit matrix

  **What to do**:
  - Create a pure, exported function `resolveToolPaths(tools: string[], descriptors = ALL_TOOL_DESCRIPTORS, connectedToolkits: string[] = [])` that returns `{ resolved: string[]; dropped: Array<{ tool: string; reason: string }> }`.
  - Normalization rules (deterministic, in order): (a) strip leading `tsx ` prefix; (b) if bare `service/tool` (2 parts, no `/tools/` prefix) → `/tools/service/tool.ts`; (c) if `/tools/`-prefixed but missing a recognized extension AND the path is NOT under `/tools/composio/` → append `.ts`; (d) leave `/tools/composio/...` paths as-is (never append `.ts`).
  - After normalization, RESOLVE: a shell-tool path is kept ONLY if it exactly matches the descriptor set (`ALL_TOOL_DESCRIPTORS.map(d => toolInvocationPath(d).replace(/^tsx /, ''))`); a composio path/bare-toolkit is kept ONLY if its toolkit is in `connectedToolkits`. Anything else → `dropped` with a human reason. NO fuzzy/semantic matching.
  - Idempotent: resolving an already-resolved path returns it unchanged.
  - Place it in `src/gateway/lib/archetype-edit-helpers.ts` (same module as the validator that will consume it) OR a sibling `tool-resolver.ts` — pick whichever keeps imports clean; document the choice in the notepad.
  - RED first: write the unit matrix (below) before the implementation.

  **Must NOT do**: Do NOT add fuzzy/semantic matching. Do NOT modify `postProcess()`. Do NOT append `.ts` to `/tools/composio/` paths. Do NOT touch `isToolAllowed`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — pure-function logic with exact edge-case semantics and idempotency.
  - **Skills**: [`api-design`]

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 2 | Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:377-391` (existing `postProcess` tool normalization — mirror the bare-path rule, do NOT edit this).
  - `src/gateway/lib/archetype-edit-helpers.ts:84-128` (`validateTools` — the reject logic to convert; descriptor Set construction at :91-93).
  - `src/lib/tool-registry.ts` (`ALL_TOOL_DESCRIPTORS`, `toolInvocationPath`).
  - The Composio match pattern `validateTools` uses (`composioSet`, `/^\/tools\/composio\//`).

  **Acceptance Criteria**:

  ```
  Scenario: resolver matrix (deterministic normalize-or-drop)
    Tool: Bash (vitest)
    Steps:
      1. '/tools/slack/read-channels' → resolved '/tools/slack/read-channels.ts'
      2. 'slack/read-channels' → resolved '/tools/slack/read-channels.ts'
      3. 'tsx /tools/slack/read-channels.ts' → resolved '/tools/slack/read-channels.ts'
      4. '/tools/platform/submit-output.ts' (already valid) → unchanged (idempotent)
      5. '/tools/nonexistent/foo' → dropped (reason present)
      6. '/tools/composio/notion' with connectedToolkits=[] → dropped, and NOT mangled to '.ts'
      7. '/tools/composio/notion' with connectedToolkits=['notion'] → kept as-is, no '.ts'
    Expected Result: all pass
    Evidence: .sisyphus/evidence/task-1-resolver-matrix.txt
  ```

  **Commit**: groups with Wave 1

- [x] 6. Observability helpers + degraded-`no_change` log differentiation

  **What to do**:
  - Provide the structured-logging shape the resolver/validator will use for every drop/coerce: `log.warn({ tenantId, archetypeId (null on create), originalTool, outcome }, 'tool path dropped/normalized')`. Keep it a thin, reused helper (or a documented logging convention) so Tasks 2/3/4 all emit consistent records. Discover existing logger usage first (`createLogger`) — do NOT invent a new logging mechanism.
  - In `archetype-generator.ts` `converse()`, the LLM-call-failure path and the parse-failure path currently both degrade to `kind:'no_change'` (≈ lines 879, 887), indistinguishable from a legitimate no-op. Differentiate them by LOG LEVEL/message only (e.g. `log.warn`/`log.error` "degraded to no_change after <reason>") so operators can tell a real no-op from a swallowed failure. Do NOT change the returned `kind` (API contract stays), and do NOT change happy-path behavior.
  - RED first: a test asserting that a forced LLM-call failure inside `converse()` emits the distinguishing log (spy on the logger) while still returning `no_change`.

  **Must NOT do**: Do NOT change the `no_change` API contract or any returned `kind`. Do NOT alter happy-path behavior. Do NOT add a new logging library.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — logging convention + targeted failure-path test.
  - **Skills**: [`data-access-conventions`]

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 2 | Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:~849-913` (`converse()` — the two degrade-to-no_change branches).
  - `src/lib/logger.ts` (`createLogger`).
  - `src/repositories/ArchetypeGenerationCallRepository.ts` (where dropped-count can be recorded on the trace row — coordinate with Task 2/3).

  **Acceptance Criteria**:

  ```
  Scenario: degraded no_change is logged distinctly
    Tool: Bash (vitest)
    Steps:
      1. Force converse() LLM call to throw; spy on logger
      2. Assert returned kind === 'no_change'
      3. Assert a warn/error log distinguishing "degraded after failure" was emitted
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-6-degraded-log.txt
  ```

  **Commit**: groups with Wave 1

- [x] 8. Regression guards: `postProcess`/refine golden + `isToolAllowed`-unchanged

  **What to do**:
  - Lock the boundaries BEFORE the de-fang change so any regression is caught: (a) a golden/snapshot test on a known-good EXISTING archetype config asserting that `postProcess()` output (tool paths + prose + trigger) is byte-identical to current behavior; (b) a `refine()` round-trip test asserting refine on an existing CLI-style config does NOT alter its tool paths or prose; (c) an `isToolAllowed` test asserting exact-match semantics for `enforce_tool_registry:true` (listed path → true, unlisted → false) and no-op (`true`) when the flag is false.
  - These are pure guard tests; they should PASS on the current code and continue passing after Tasks 1-5. If any later task breaks them, that task over-reached.
  - RED-not-applicable: these assert CURRENT behavior — they go green immediately and act as regression tripwires.

  **Must NOT do**: Do NOT modify source to make these pass — they describe existing behavior. If they fail at authoring time, the assumption about current behavior is wrong — investigate.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — regression/guard test design.
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: none (tripwire) | Blocked By: None

  **References**:
  - `src/gateway/services/archetype-generator.ts:358-433` (`postProcess`), `refine()` (~:760-826).
  - `src/workers/lib/execution-phase.mts:79-89` (`isToolAllowed`).
  - `tests/unit/tool-registry-enforce.test.ts` (existing isToolAllowed tests — extend, don't duplicate).

  **Acceptance Criteria**:

  ```
  Scenario: postProcess + refine byte-identical for known-good archetype
    Tool: Bash (vitest)
    Steps:
      1. Feed a known-good existing config through postProcess; assert tool paths/prose/trigger unchanged vs golden
      2. refine() the same config; assert tool paths + prose not altered
    Expected Result: pass (tripwire green on current code)
    Evidence: .sisyphus/evidence/task-8-golden.txt

  Scenario: isToolAllowed exact-match preserved
    Tool: Bash (vitest)
    Steps:
      1. enforce_tool_registry:true, listed path → true; unlisted → false
      2. enforce_tool_registry:false → true (no-op) regardless
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-8-enforce.txt
  ```

  **Commit**: groups with Wave 1

- [ ] 2. De-fang `validateTools` → resolver; `validateProposalFields` never-block policy

  **What to do** (depends on T1's `resolveToolPaths` + T6's log convention):
  - Replace the reject-based `validateTools` (`archetype-edit-helpers.ts:84-128`) with a call to `resolveToolPaths()`. `validateProposalFields` must STILL return `{ ok: true; validTools: string[] }` on the happy path (both routes depend on `validation.validTools` for `tool_registry` + `toolDelta`) — but `validTools` now = the resolver's `resolved` list, and dropped tools are LOGGED (per T6), never pushed into `errors`.
  - Implement the never-block policy precisely:
    - **tools**: resolve + drop unknowns + log. NEVER an error.
    - **trigger_sources** invalid (fails `TriggerSourceSchema`): coerce to `{ type: 'manual' }` + log. NEVER an error.
    - **input_schema** invalid: drop the invalid items, keep valid ones; if all invalid, drop the field + log. NEVER an error.
    - **prose-went-blank** (`identity`/`execution_steps` non-empty in baseline but blank in proposal): this is the ONE retained guard — but convert it from a hard error into a signal the route turns into a plain-English RE-ASK (see Task 3). On CREATE the baseline is empty so this never fires; it only matters on EDIT.
  - Update the `ValidateProposalResult` type so the never-block outcomes are representable without `ok:false` for tools/trigger/input. Keep a distinct result variant for the prose-blank re-ask (e.g. `{ ok:false, reAsk:true, fields:[...] }`) so Task 3 can branch on it. Do NOT collapse re-ask into the old generic 422.
  - RED first: tests for each policy branch (tool drop keeps ok:true; bad trigger coerced to manual; partial input_schema salvage; prose-blank → re-ask variant).

  **Must NOT do**: Do NOT keep any path that returns a tool-related `errors[]`/422. Do NOT change `postProcess`. Do NOT alter the `{ validTools }` shape the routes consume (just its source). Do NOT make prose-blank a silent accept.

  **Recommended Agent Profile**:
  - **Category**: `deep` — shared-helper refactor with a precise never-block policy + new result variant.
  - **Skills**: [`api-design`]

  **Parallelization**: Can Run In Parallel: NO | Wave 2 | Blocks: 3,4,5 | Blocked By: 1,6

  **References**:
  - `src/gateway/lib/archetype-edit-helpers.ts:31-33` (`ValidateProposalResult`), `:84-128` (`validateTools`), `:130-190` (`validateProposalFields`; prose check :138-153; trigger :161-169; input_schema :171-179).
  - T1 `resolveToolPaths` signature/return shape.
  - Both route consumers of `validation.validTools` (converse-create:222-223,268-269; propose-edit:197,243-244).

  **Acceptance Criteria**:

  ```
  Scenario: tools drop keeps ok:true (never error)
    Tool: Bash (vitest)
    Steps:
      1. validateProposalFields with proposal tools=['/tools/slack/read-channels','/tools/bogus/x']
      2. Assert ok===true, validTools===['/tools/slack/read-channels.ts'], bogus dropped+logged
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-2-tools-neverblock.txt

  Scenario: bad trigger coerced; partial input_schema salvaged; prose-blank re-asks
    Tool: Bash (vitest)
    Steps:
      1. invalid trigger_sources → result coerces to {type:'manual'}, ok:true
      2. input_schema with 1 good + 1 bad item → keeps good, ok:true
      3. EDIT baseline non-empty execution_steps, proposal blank → result.reAsk===true (NOT a tool/422 error)
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-2-policy.txt
  ```

  **Commit**: groups with Wave 2

- [ ] 3. Both routes: remove 422-over-tools, carry resolved tools, handle re-ask

  **What to do** (depends on T2):
  - In BOTH `admin-archetype-converse-create.ts` and `admin-archetype-propose-edit.ts`: remove the `if (!validation.ok) { sendError(res, 422, 'PROPOSAL_INVALID', ...) }` block as the tool/trigger/input path. Wire the new result: on happy path, set `stripped.tool_registry = { tools: validation.validTools }` (resolved list) and compute `toolDelta` as before.
  - When T2 signals the prose-blank RE-ASK variant, the route must return a plain-English `kind:'question'` (e.g. "What should this employee actually do, step by step?") — NOT a 422. This preserves the total-function contract on EDIT.
  - Keep the genuine internal-error path (`catch` → 500 `INTERNAL_ERROR`, and `GENERATION_FAILED` → 422) intact — those are real failures, not tool-formatting variance. (The frontend Task 5 handles those as last-resort.)
  - Record dropped-tool count on the `archetype_generation_calls` trace row (coordinate with T6) so operators have visibility.
  - RED first: route-level tests (supertest/mocked) asserting a proposal with garbage tools returns 200 `kind:'proposal'` (not 422) on BOTH routes; an EDIT that blanks prose returns `kind:'question'`.

  **Must NOT do**: Do NOT remove the 500/`GENERATION_FAILED` real-error handling. Do NOT fix only one route. Do NOT change the success response contract fields the frontend already consumes (baseline/proposal/changed_fields/tool_delta).

  **Recommended Agent Profile**:
  - **Category**: `deep` — twin-route surgery with shared contract + re-ask branch.
  - **Skills**: [`api-design`]

  **Parallelization**: Can Run In Parallel: NO (after T2) | Wave 3 | Blocks: 7 | Blocked By: 2

  **References**:
  - `src/gateway/routes/admin-archetype-converse-create.ts:205-310` (validation→response assembly; 422 at :215-219).
  - `src/gateway/routes/admin-archetype-propose-edit.ts:182-260` (mirror; 422 at :190-194).
  - `src/repositories/ArchetypeGenerationCallRepository.ts` (trace row for dropped-count).
  - `tests/unit/gateway/routes/admin-archetype-converse-create.test.ts`, `admin-archetype-propose-edit.test.ts` (existing route test patterns).

  **Acceptance Criteria**:

  ```
  Scenario: garbage tools → proposal, not 422 (both routes)
    Tool: Bash (vitest route tests)
    Steps:
      1. converse-create: mock converse() proposal with tools ['/tools/x/y','/tools/slack/read-channels']
      2. Assert HTTP 200, kind 'proposal', tool_registry.tools all valid '.ts'
      3. Repeat identical assertion for propose-edit
    Expected Result: pass on BOTH
    Evidence: .sisyphus/evidence/task-3-both-routes.txt

  Scenario: EDIT prose-blank → plain-English question (not 422)
    Tool: Bash (vitest)
    Steps:
      1. propose-edit on existing archetype; mock proposal blanks execution_steps
      2. Assert response kind 'question' (re-ask), NOT 422
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-3-reask.txt
  ```

  **Commit**: groups with Wave 3

- [ ] 4. Pre-enforcement validation gate on `enforce_tool_registry` flip

  **What to do** (depends on T2's resolver availability):
  - In the archetype PATCH path (`admin-archetypes.ts` PATCH handler), when a request flips `enforce_tool_registry` from false→true, re-resolve the archetype's `tool_registry.tools` via `resolveToolPaths()`. If the resolved list is EMPTY or any path is unresolvable, REJECT the flip with a plain-English message (e.g. "This employee's tools couldn't be verified, so strict tool mode can't be turned on yet.") — a 400/422 here is acceptable because it is an ADMIN/technical action, not the non-technical creation flow. Per AGENTS.md, enabling this flag must validate every path resolves to a real descriptor — this gate enforces exactly that.
  - Do NOT change `isToolAllowed` or the runtime enforcement behavior — only gate the ENABLE action.
  - RED first: PATCH test — flipping enforcement on with an empty/unresolvable registry is rejected; flipping on with a fully-resolved registry succeeds; flipping OFF is always allowed.

  **Must NOT do**: Do NOT modify `isToolAllowed`/runtime enforcement. Do NOT gate any field other than the false→true enforcement flip. Do NOT block turning enforcement OFF.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — targeted PATCH-path guard.
  - **Skills**: [`api-design`, `creating-archetypes`]

  **Parallelization**: Can Run In Parallel: YES (with T3,T5) | Wave 3 | Blocks: 7 | Blocked By: 2

  **References**:
  - `src/gateway/routes/admin-archetypes.ts` (PATCH handler + `CreateArchetypeBodySchema`/patch schema).
  - `src/workers/lib/execution-phase.mts:79-89` (`isToolAllowed` — read-only context).
  - AGENTS.md `enforce_tool_registry` capability-flag note.

  **Acceptance Criteria**:

  ```
  Scenario: enforcement flip gated on resolvable registry
    Tool: Bash (vitest)
    Steps:
      1. PATCH enforce_tool_registry true with tool_registry.tools=[] → rejected, plain-English message
      2. PATCH true with one unresolvable path → rejected
      3. PATCH true with all-resolvable paths → 200
      4. PATCH false (disable) → always 200
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-4-enforce-gate.txt
  ```

  **Commit**: groups with Wave 3

- [ ] 5. Frontend never-render-raw-error guarantee

  **What to do** (depends on T2/T3 finalizing the response contract):
  - In `dashboard/src/panels/employees/use-chat-conversation.ts`, the `catch` block currently calls `getProposalErrorMessage(err)` which parses a `{ reasons: {...} }` shape the routes never send → always the misleading "too complex" fallback. After T3, tool/trigger/input issues no longer 422, so the catch should be a TRUE last-resort for network/5xx only. Ensure: (a) the happy-path `kind:'question'` (including the new prose-blank re-ask) renders as a normal assistant bubble; (b) any genuine thrown error renders a calm, plain-English, non-technical message (no JSON, no status codes, no "reasons"/"errors" dumps) and never the inaccurate "too complex" wording when the real issue is unknown.
  - Update/replace `getProposalErrorMessage` so it does not depend on a server error-body shape that doesn't exist; prefer a single friendly fallback for true errors. Keep the existing `too_long` and `no_change` handling.
  - RED first (component/unit): given a thrown gateway error with body `{ errors: [...] }`, assert the rendered text is the calm plain-English fallback (and assert it does NOT print "errors"/JSON). Given `kind:'question'`, assert a normal assistant bubble renders.
  - Per the react-dashboard convention, keep copy non-technical (end users are property managers, not developers).

  **Must NOT do**: Do NOT surface raw JSON, status codes, field names, or stack traces to the user. Do NOT remove `too_long`/`no_change` handling. Do NOT change the transcript/state-machine shape the hook exposes.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — dashboard chat UX + non-technical copy.
  - **Skills**: [`react-dashboard`]

  **Parallelization**: Can Run In Parallel: YES (with T3,T4) | Wave 3 | Blocks: 7 | Blocked By: 2

  **References**:
  - `dashboard/src/panels/employees/use-chat-conversation.ts:4-27` (`PROPOSAL_ERROR_FALLBACK`, `getProposalErrorMessage`), `:87-150` (`submit` + catch).
  - `dashboard/src/panels/employees/__tests__/CreateEmployeePage.test.tsx`, `AssistantTab.test.tsx`, `use-chat-conversation.test.ts` (existing tests asserting the fallback — update them to the new behavior).
  - AGENTS.md "End-user language is non-technical" convention.

  **Acceptance Criteria**:

  ```
  Scenario: gateway error body never leaks to user
    Tool: Bash (vitest + testing-library)
    Steps:
      1. Mock converseFn to throw Error with message containing '{ "errors": [...] }'
      2. Render chat, submit a message
      3. Assert rendered assistant text is the calm plain-English fallback; assert NO 'errors'/JSON/status code in DOM
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-5-frontend-noleak.txt

  Scenario: question (incl. re-ask) renders as normal bubble
    Tool: Bash (vitest + testing-library)
    Steps:
      1. Mock converseFn → { kind:'question', question:'What should this employee do, step by step?' }
      2. Assert the question renders as an assistant bubble
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-5-question-bubble.txt
  ```

  **Commit**: groups with Wave 3

- [ ] 7. Live deepseek-flash E2E replaying the EXACT failing transcript → Done

  **What to do** (depends on T3,T4,T5):
  - Full live pipeline on `deepseek/deepseek-v4-flash`: (a) replay the literal 3-turn transcript via curl against `/converse-create` and assert `kind:'proposal'` (NOT 422, NOT "too complex"), with all `proposal.tool_registry.tools` ending in `.ts` or valid Composio; (b) build the save-draft POST from the proposal (override model to deepseek-flash; inject delivery_steps/delivery_instructions + worker_env channels per the prior plan's proven pattern), assert HTTP 201 + valid role_name; (c) activate + trigger; poll `task_status_log` to terminal; assert `Done` with a real Slack delivery + non-empty `--draft-file`; (d) assert a dropped-tool `log.warn` fired if any tool was dropped (observability).
  - Also run the no-422 invariant live: a converse-create whose model output would have had bad tool paths returns a proposal, never 422.
  - Capture task_id + full status_log trace + delivery proof. Per AGENTS.md, "code looks correct"/"unit tests pass" is INSUFFICIENT for a wizard/generator/delivery change. Load AI Employee E2E guide (AC1–AC8) + Slack UX Scenario A.
  - Reset any test archetype to `draft` after the run.

  **Must NOT do**: Do NOT mock. Do NOT substitute a different model. Do NOT declare pass without a `Done` task + verified delivery.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — full live lifecycle E2E.
  - **Skills**: [`e2e-testing`, `employee-creation-debugging`, `feature-verification`, `long-running-commands`]

  **Parallelization**: Can Run In Parallel: NO | Wave 4 | Blocks: 9 | Blocked By: 3,4,5

  **References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` (AC1–AC8).
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Scenario A.
  - Prior plan notepad: `.sisyphus/notepads/2026-06-14-2233-employee-creation-rolename-and-intent-steps/learnings.md` (T9 save-draft payload + deepseek override pattern; tenant `00000000-0000-0000-0000-000000000002`).

  **Acceptance Criteria**:

  ```
  Scenario: exact failing transcript now runs end-to-end
    Tool: Bash (curl + psql + container watch) + long-running-commands
    Preconditions: pnpm dev running; docker image built; SERVICE_TOKEN sourced
    Steps:
      1. curl converse-create with the literal 3-turn transcript → assert kind 'proposal', tools valid
      2. Save draft (deepseek-flash override + delivery injection) → assert 201 + valid role_name
      3. Activate + trigger; poll task_status_log to terminal
      4. Assert status 'Done'; assert Slack delivery present; assert delivered draft NON-EMPTY
    Expected Result: Done + verified delivery
    Evidence: .sisyphus/evidence/task-7-e2e-trace.txt, task-7-e2e-delivery.txt
  ```

  **Commit**: NO (verification only)

- [ ] 9. Documentation update (AGENTS.md)

  **What to do** (depends on T7):
  - Update AGENTS.md: (a) `tool_registry` is SYSTEM-DERIVED advisory metadata at creation — tool paths are deterministically resolved (normalize `/tools/` prefix + `.ts`; bare-name→path) or silently dropped, and tool issues NEVER block creation/editing; (b) the runtime resolves tools from on-demand skills (agents-md-compiler does not read tool_registry; `isToolAllowed` only consults it when `enforce_tool_registry` is on); (c) the pre-enforcement gate: flipping `enforce_tool_registry → true` re-resolves and refuses on empty/unresolvable registry; (d) the total-function contract: creation/editing returns a proposal or a plain-English question, never a raw technical error.
  - Follow Documentation Durability (no volatile counts/line numbers). Present tense.

  **Must NOT do**: Do NOT add volatile counts/line numbers. Do NOT document fuzzy mapping (it's future work). Do NOT modify source.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: NO | Wave 4 | Blocks: FINAL | Blocked By: 7

  **References**:
  - AGENTS.md "Adding a New Employee" + "Documentation Freshness"/"Documentation Durability" + the `enforce_tool_registry` note.

  **Acceptance Criteria**:

  ```
  Scenario: docs reflect shipped behavior
    Tool: Bash (grep)
    Steps:
      1. grep AGENTS.md for tool_registry advisory/never-block note + pre-enforcement gate
    Expected Result: present, no volatile counts
    Evidence: .sisyphus/evidence/task-9-docs.txt
  ```

  **Commit**: `docs: tool_registry advisory + never-block creation convention`

- [ ] 10. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1-F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read plan end-to-end. Each "Must Have": verify implementation exists (read file, curl, run test). Each "Must NOT Have": grep for forbidden patterns (modified `isToolAllowed`/`enforce_tool_registry` semantics, changed `postProcess` bare→`.ts`/cron→scheduled, fuzzy tool mapping, `.ts` appended to `/tools/composio/`, blank-prose silent save, regressed intent-level prose) — reject with file:line if found. Confirm evidence files exist. Confirm BOTH routes fixed (not CREATE-only).
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Both-routes [Y/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` + dashboard tsc/tests. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, AI slop. Confirm resolver is pure/idempotent and reused (not duplicated across routes). Confirm log warnings present (observability not lost).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | VERDICT`

- [ ] F3. **Real Manual QA + Live E2E** — `unspecified-high` (+ `playwright`, `e2e-testing`, `employee-creation-debugging`)
      From clean state: (a) replay the EXACT failing transcript via curl → assert `kind:'proposal'`, valid `.ts` tools; (b) feed 100%-garbage tool paths → assert 200 not 422; (c) full live E2E on deepseek-flash create→save→activate→trigger→`Done`, capture task_id + `task_status_log` + delivery proof; (d) assert a dropped-tool `log.warn` was emitted. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N] | Live E2E [task_id reached Done Y/N] | VERDICT`

- [ ] F4. **Scope Fidelity + Boundary Audit** — `deep`
      For each task: read "What to do" + actual diff. Verify 1:1 — nothing missing, nothing beyond spec. **Boundary audit**: `postProcess` untouched (golden test green); `isToolAllowed`/`enforce_tool_registry` exact-match intact; resolver exact-match-or-drop (no fuzzy); Composio paths never `.ts`-mangled; intent-level prose un-regressed; BOTH routes de-fanged; prose-blank re-asks (not 422); observability preserved. Detect cross-task contamination.
      Output: `Tasks [N/N] | Boundary [CLEAN/N drift] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(archetype-gen): add deterministic resolveToolPaths resolver + regression guards`
- **Wave 2**: `refactor(archetype-edit): tool issues resolve-or-drop instead of 422; never-block policy`
- **Wave 3**: `fix(wizard): creation/editing never returns technical error; pre-enforcement gate`
- **Wave 4**: `docs: tool_registry advisory + never-block creation convention`

---

## Success Criteria

### Verification Commands

```bash
pnpm test:unit                 # all pass
pnpm build && pnpm lint        # clean
# The exact failing flow now yields a proposal, never 422:
SERVICE_TOKEN=$(grep '^SERVICE_TOKEN=' .env | cut -d'=' -f2-)
curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/archetypes/converse-create" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"transcript":[{"role":"user","content":"I need an AI employee that reads all of the Slack channels and provides an executive summary"},{"role":"assistant","content":"Which Slack channels should I read from?"},{"role":"user","content":"#project-lighthouse and #general"}]}' \
  | jq -e '.kind == "proposal" and (.proposal.tool_registry.tools | all(endswith(".ts") or startswith("/tools/composio/")))'
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Both routes (CREATE + EDIT) never 422 over tools
- [ ] Live E2E reached `Done`
- [ ] Docs updated

## Future Work (Backlog)

- Richer fuzzy/semantic intent→tool mapping (map free-text "read Slack" → real path), with its own matching-accuracy guardrails.
- Re-evaluate whether `tool_registry` should be dropped from the creation contract entirely once runtime skill-resolution is proven sufficient at scale.
- Distinguish "model genuinely proposed no change" from "we degraded to no_change after a failure" as a first-class API signal (not just a log level).
