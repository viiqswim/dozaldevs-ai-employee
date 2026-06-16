# Chat-First AI Assistant Tab Redesign (Prometheus-style Clarify-then-Act)

## TL;DR

> **Quick Summary**: Rebuild the employee "AI Assistant" tab (`?tab=assistant`) into a single-input chat. The assistant clarifies inline (a Prometheus-style clearance check — keep asking only while genuinely ambiguous, then act), proposes a diff with **Approve / Deny only**, and you refine by typing a follow-up in the same box. The dual-input box and the upfront "Confirm" gate are removed. The backend engine gains a `kind: question | proposal | no_change` response branch driven by a client-held transcript (server stays request-stateless).
>
> **Deliverables**:
>
> - **Backend**: `ArchetypeGenerator.converse(transcript, currentConfig, …)` returning a discriminated union (question | proposal | no_change | too_long), branching BEFORE postProcess/nudge; clearance-style refine prompt with a server-enforced 5-question backstop (forced best-guess proposal on hit) + token-budget guard; unified `propose-edit` accepting `{ transcript }`; `interpret-request` retired; shared `mapArchetypeRowToConfig` + tool/trigger/input validation helpers extracted.
> - **Frontend**: rebuilt `AssistantTab.tsx` (single input, inline question bubbles, context-aware send → continue conversation vs answer), `ProposalDiffCard` stripped of its refine UI (Approve/Deny only), edit-history moved to a collapsible sub-view, unsaved-changes guard retained, re-fetch-baseline-at-Approve.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (shared helpers) → T3 (converse engine + prompt) → T5 (unified endpoint) → T9 (chat shell) → T10 (conversation wiring) → T11 (Approve + re-fetch) → T13 (mount) → Final Wave

---

## Context

### Original Request

On `/dashboard/employees/:id?tab=assistant`, the conversational editing UX has a dual-input-box problem: clicking "Ask for more changes" on a proposal card opens a SECOND input box while the main chat input still sits below — confusing about which box to use. There is also an upfront "Confirm" gate before the assistant starts working. The user wants a real chat (like oh-my-openagent's Prometheus mode): the assistant thinks, tries to fulfill the request, and asks clarifying questions inline when unsure — all through ONE chat box. Approve/Deny on the diff is fine; the extra input and the Confirm gate are not.

### Interview Summary

**Key Decisions (locked with user)**:

- **Inline clarify, single input**: clarifying questions render as normal assistant chat bubbles; the user answers in the SAME single input box. No special "ask" buttons.
- **Proposal confirmation**: diff card keeps **Approve / Deny ONLY**. The "Ask for more changes" button + its secondary textarea are REMOVED. Refinement = typing a follow-up in the main chat box.
- **No upfront Confirm gate**: retire the `interpret-request` restatement step; the assistant starts working immediately.
- **Scope**: FULL REBUILD of the assistant-tab frontend.
- **Real multi-turn clarification**: backend engine returns EITHER `{kind:'question', question}`, `{kind:'proposal', …}`, or `{kind:'no_change'}`. Conversation continues across turns.
- **Conversation state**: CLIENT holds the full transcript and resends it each turn. NO server-side session store, NO new DB table. Server stays request-stateless.
- **Question stop condition = Prometheus clearance style**: prompt instructs the model to ask ONLY while the request is genuinely ambiguous (which field / what value) and to propose the moment it's confident — no artificial limit in normal use. A **high server-side backstop of 5 questions** exists solely to stop a degenerate loop from the weaker gateway model. On hitting the backstop, the engine is FORCED to emit a best-guess proposal (never a dead end).
- **Transcript cap**: token-budget guard; if transcript+config would exceed a safe budget, return a friendly "let's start fresh" signal instead of erroring; UI shows a clean reset.
- **Approve**: re-fetch the archetype immediately before PATCH so `before_json` is accurate; silent last-write-wins (no concurrency lock).
- **Edit-history + revert**: keep the feature, move it to a collapsible sub-view so it doesn't compete with the chat.
- **Refactor cleanup IN SCOPE**: extract the duplicated `mapArchetypeRowToConfig` and the route-level tool/trigger/input validation into shared helpers.
- **Auth**: ADMIN-only for the whole unified flow (folds in interpret-request's former MEMBER bar).
- Tests: tests-after for core logic + mandatory agent QA (Playwright + curl/psql + real-trigger no-op).

**Research Findings (verified, file:line)**:

_Frontend (dashboard/src/)_

- `panels/employees/AssistantTab.tsx` (~449 lines) — owns ALL state + the always-on bottom input. State: `messages[]`, `inputText`, `isLoading`, `pendingProposalId`, `pendingRestatementId`, `historyRefreshTrigger`. 3-hop flow today: interpret → confirm → propose → approve.
- `panels/employees/sections/ProposalDiffCard.tsx` (~226 lines) — diff (react-diff-viewer-continued) + Approve/Deny + the SECOND input: `showRefine` state (~L43-46), refine textarea (~L182-208), "Ask for more changes" button (~L218-222), `onRefineSubmit` prop (~L28), approval-off confirm checkbox (~L48,110-139). ← dual-input origin AND the approval-off safeguard live here.
- `panels/employees/sections/EditHistoryList.tsx` (~151 lines) — history + revert, rendered always-visible below chat (mounted in AssistantTab ~L435-446).
- `panels/employees/EmployeeDetail.tsx` — URL-driven tabs; mounts `<AssistantTab>` (~L267-269) when `?tab=assistant`.
- `lib/types.ts` — `InterpretResponse` (~L432), `ProposalResponse` (~L436), `RecordEditHistoryPayload` (~L447), `EditHistoryRow` (~L455).
- `lib/gateway.ts` — `interpretRequest` (~L639), `proposeEdit` (~L653), `recordEditHistory` (~L667), `listEditHistory` (~L681), `revertEdit` (~L690).
- Tests: `panels/employees/__tests__/AssistantTab.test.tsx` (~247 lines).
- Stack: React 19, Vite 8, Tailwind 4, Radix/shadcn, react-router-dom 7, react-markdown 10 + remark-gfm 4, sonner 2, react-diff-viewer-continued (already added). `useUnsavedChangesGuard` hook exists.

_Backend (src/gateway/)_

- `services/archetype-generator.ts` — `ArchetypeGenerator` (~L366). `refine(previousConfig, refinementInstruction, catalog?, composioContext?)` (~L398) ALWAYS returns a full JSON config or throws `GENERATION_FAILED` — NO question branch. `postProcess()` + `applyModelAndEstimate()` run on every result (~L580-581). Internal `proseUnchanged` nudge-retry (~L599-620) will misfire on a question response. `interpretRequest()` returns `{understanding}` only. refine LLM: temp 0.3, maxTokens 16000, json_object.
- `services/prompts/archetype-generator-prompts.ts` — `REFINE_SYSTEM_PROMPT_PRE` (~L301) / `_POST` (~L325); interpret system prompt (~L507-519); refine user msg (~L588-591); `buildConnectedAppsBlock()`.
- `routes/admin-archetype-propose-edit.ts` — `POST .../propose-edit` (auth ADMIN). Body `{request_text}`. Calls refine(), `applyAllowlist` (~L60-73), `validateTools` (~L80, IN ROUTE), trigger/input Zod validation, prose-blank guard, approval-off detection, `changed_fields` diff. Returns `{baseline, proposal, changed_fields, tool_delta?, trigger_change?, input_change?, approval_warning?, no_change?}`; 422 `PROPOSAL_INVALID`. Does NOT persist. `mapArchetypeRowToConfig` (~L147). Allowlist: `identity, execution_steps, delivery_steps, overview, risk_model.approval_required, tool_registry.tools, trigger_sources, input_schema`. Strictly-disallowed: `model, temperature, role_name, vm_size, concurrency_limit`.
- `routes/admin-archetype-interpret-request.ts` — `POST .../interpret-request` (auth MEMBER). Returns `{understanding}`. DUPLICATE `mapArchetypeRowToConfig` (~L33).
- `routes/admin-archetype-edit-history.ts` — `POST/GET .../edit-history` + `POST .../edit-history/:historyId/revert`. `extractAllowlistedFields()` (~L39). Append-only, soft-delete.
- `routes/admin-archetypes.ts` — `PATCH .../archetypes/:id` apply (~L301); `TriggerSourceSchema` (~L27).
- `server.ts` — route registration (~L245-249); interpret-request import (~L24).
- **CRITICAL**: backend STATELESS one-shot; NO conversation history; NO clarifying-question branch; apply path client-driven (PATCH then separate edit-history POST; `before_json` from stale render-time prop).

### Metis Review (gaps addressed)

- **R1 — nudge-retry corrupts question branch**: branch on `kind` immediately after parse; question responses skip the `proseUnchanged` nudge AND `postProcess()`/`applyModelAndEstimate()`.
- **R2 — allowlist / approval-off lost in rebuild**: treat the hard allowlist (propose-edit ~L60-73, ~L336-337) and the approval-off warning+confirm (ProposalDiffCard ~L48,110-139) as behavior-preservation invariants with explicit tests.
- **R3 — transcript token blow-up**: token-budget guard + graceful "start fresh".
- **R4 — over/under-asking**: clearance-style prompt bounds asking to genuine field/value ambiguity; 5-question server backstop forces a best-guess proposal.
- **R5 — stale baseline at Approve**: re-fetch archetype before PATCH, recompute `before_json` (silent last-write-wins).
- **R6 — scope creep into apply path**: do NOT make PATCH+edit-history atomic; the only in-scope apply change is re-fetch-baseline.
- **R7 — `no_change` as a real union member**: explicit `kind` discriminant, not overloaded flags.
- **R8 — baseline invariant under transcript flow**: prompt MUST state the transcript is for intent-understanding only; ALWAYS diff against the current config in the user message, never an earlier proposal in the transcript.
- **interpret-request retirement is safe**: only consumers are AssistantTab + gateway.ts + server.ts + README row. Confirm via `lsp_find_references` before deleting.

---

## Work Objectives

### Core Objective

Turn the assistant tab into a single-input, chat-first editor that clarifies inline (Prometheus clearance style) and proposes a diff with Approve/Deny only — by adding a `question | proposal | no_change` engine branch driven by a client-held transcript, while preserving the allowlist, approval-off safeguard, and edit-history/revert as behavior-preservation invariants.

### Concrete Deliverables

- Shared `mapArchetypeRowToConfig` helper + shared `validateProposalFields` (tool/trigger/input) helper (refactor).
- `ArchetypeGenerator.converse(transcript, currentConfig, catalog?, composioContext?)` returning `{kind:'question'|'proposal'|'no_change'|'too_long', …}`, branching before postProcess/nudge.
- New clearance-style converse prompt (PRE/POST) bounding clarifying questions + the baseline invariant; 5-question server backstop forcing a proposal; token-budget guard returning a "start fresh" signal.
- Unified `POST .../propose-edit` accepting `{ transcript: {role,content}[] }`, returning the discriminated union; ADMIN auth; preserves allowlist + validation + approval-off + `changed_fields`/deltas for the proposal branch only.
- `interpret-request` route deleted; `server.ts`, `gateway.ts`, README admin table cleaned.
- Dashboard `lib/gateway.ts` + `lib/types.ts`: `converseEdit(tenantId, archetypeId, transcript)` + `ConverseResponse` union type; `interpretRequest` removed.
- Rebuilt `AssistantTab.tsx`: single input, inline question bubbles, context-aware submit, transcript state, "start fresh" reset, retained unsaved-changes guard.
- `ProposalDiffCard.tsx`: refine textarea + "Ask for more changes" button + `onRefineSubmit` prop removed; Approve/Deny + approval-off confirm retained.
- Edit-history moved into a collapsible sub-view (`CollapsibleSection`).
- Approve flow re-fetches baseline before PATCH; recomputes `before_json`.
- Docs updated (AGENTS.md + README admin endpoint table).

### Definition of Done

- [ ] On `?tab=assistant`, a user types one request; if ambiguous the assistant asks a clarifying question as a chat bubble; the user answers in the SAME input box; once clear the assistant shows a diff card with Approve/Deny only.
- [ ] Typing a follow-up after a proposal refines it (re-proposes vs the CURRENT persisted archetype), with no second input box anywhere in the DOM.
- [ ] Approve applies allowlisted fields via PATCH, records an edit-history row with an accurate re-fetched `before_json`, and the change is visible in a freshly-triggered task's `tasks.compiled_agents_md`.
- [ ] Deny applies nothing; the proposal card greys out.
- [ ] Strictly-disallowed fields (`model, temperature, role_name, vm_size, concurrency_limit`) are never applied; blanking non-empty prose still 422s; approval true→false still requires the explicit confirm.
- [ ] The 5-question backstop forces a best-guess proposal; the token-budget guard returns the "start fresh" signal instead of erroring.
- [ ] `interpret-request` is gone (route, server registration, client fn, README row); `mapArchetypeRowToConfig` exists once.
- [ ] Edit-history + revert work from the collapsible sub-view.
- [ ] `pnpm test:unit`, `pnpm --dir dashboard test`, `pnpm lint`, `pnpm build` all clean.

### Must Have

- Single chat input box; clarifying questions inline as assistant bubbles; answers in the same box.
- Proposal card: Approve / Deny only; approval-off warning + explicit confirm retained.
- `kind: 'question' | 'proposal' | 'no_change' | 'too_long'` discriminated union; client distinguishes all via `kind`.
- Engine branches on `kind` BEFORE `postProcess()`/`applyModelAndEstimate()` and BEFORE the `proseUnchanged` nudge.
- Clearance-style prompt: ask only on genuine field/value ambiguity, propose when confident; transcript is intent-only; diff baseline ALWAYS the current config passed in.
- 5-question server-side backstop → forced best-guess proposal.
- Token-budget guard → graceful "start fresh".
- Hard allowlist + strictly-disallowed fields preserved server-side for the proposal branch.
- Tool/trigger/input validation preserved (now via shared helper).
- Re-fetch baseline at Approve; accurate `before_json`.
- Edit-history + revert preserved, in a collapsible sub-view.
- Unsaved-changes guard active while a proposal is pending or a request is in flight.
- ADMIN auth on the unified endpoint.
- Non-technical, plain-language copy; card shells; existing component conventions.

### Must NOT Have (Guardrails)

- NO streaming responses.
- NO server-side session store and NO new DB table (server stays request-stateless; transcript is client-held).
- NO second/secondary input box anywhere — exactly one chat input.
- NO upfront Confirm gate / restatement step.
- NO editing of `model, temperature, role_name, vm_size, concurrency_limit`; the assistant politely declines such requests.
- NO applying a tool the tenant lacks, or an invalid `trigger_sources`/`input_schema` (validate first).
- NO removing the approval gate without the explicit warning + confirm.
- NO making PATCH + edit-history atomic / new transaction endpoint (out of scope; only re-fetch-baseline is in scope).
- NO persisting chat transcripts to the DB (ephemeral).
- NO new LLM provider/model; reuse the gateway LLM client and the existing refine engine, extended.
- NO hard-deleting or mutating any `archetype_edit_history` row.
- NO `overview` drift — when prose changes apply, include regenerated `overview` in the same PATCH.
- NO leaving a dead `interpret-request` reference anywhere (route, server, client, README).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest + React Testing Library in `dashboard/`; Vitest in root for gateway).
- **Automated tests**: Tests-after — unit tests written after each core-logic task.
- **Framework**: Vitest (`pnpm test:unit` gateway; `pnpm --dir dashboard test` dashboard).

### QA Policy

Every task includes agent-executed QA. Evidence to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Frontend/UI**: Playwright on `localhost:7700/dashboard/employees/:id?tab=assistant` (dashboard is plain DOM — headless fine; use CDP/real-Chrome only if needed). Smoke-test employee: `real-estate-motivation-bot-2` (feature-verification skill).
- **API/Backend**: Bash `curl` with `Authorization: Bearer $SERVICE_TOKEN`; assert status + DB via `psql postgresql://postgres:postgres@localhost:54322/ai_employee`.
- **Real no-op check**: after applying an `execution_steps`/`identity` edit, trigger the employee and assert the new task's `tasks.compiled_agents_md` contains the approved text (verify via psql, not just PostgREST — zero rows = failure).

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately):
├── Task 1: Extract shared mapArchetypeRowToConfig + validateProposalFields helpers [deep]
├── Task 2: Define discriminated-union types (gateway + dashboard) + ConverseMessage [quick]
├── Task 3: converse() engine branch + clearance prompt + backstop + token guard [deep]
└── Task 4: Strip ProposalDiffCard refine UI (keep Approve/Deny + approval-off) [visual-engineering]

Wave 2 (Endpoint + client — after Wave 1):
├── Task 5: Unified propose-edit endpoint ({transcript} -> union, ADMIN) (deps: 1,2,3) [deep]
├── Task 6: Retire interpret-request (route, server.ts, gateway.ts, README) (deps: 2) [unspecified-high]
└── Task 7: Dashboard gateway client: converseEdit + types; drop interpretRequest (deps: 2,5) [quick]

Wave 3 (Frontend assembly — after Wave 2):
├── Task 8: useChatConversation hook (transcript state, single-input routing, start-fresh) (deps: 2,7) [deep]
├── Task 9: Rebuilt AssistantTab chat shell (single input, question bubbles, guard) (deps: 4,7,8) [visual-engineering]
├── Task 10: Wire converse loop (question vs proposal vs no_change; refine in same box) (deps: 5,8,9) [visual-engineering]
├── Task 11: Approve flow: re-fetch baseline -> PATCH -> recordEditHistory (deps: 5,9,10) [deep]
└── Task 12: Edit-history collapsible sub-view + revert (deps: 7,9) [visual-engineering]

Wave 4 (Integration + docs — after Wave 3):
├── Task 13: Mount rebuilt AssistantTab in EmployeeDetail.tsx (?tab=assistant) (deps: 9-12) [quick]
└── Task 14: Docs update (AGENTS.md + README admin table; remove interpret-request) (deps: 6,13) [writing]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA — Playwright chat E2E (question turn + Approve no-op check) (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> user okay -> Notify completion

Critical Path: T1 -> T3 -> T5 -> T9 -> T10 -> T11 -> T13 -> F1-F4 -> user okay
Max Concurrent: 5
```

### Dependency Matrix

- **1**: deps — / blocks 5
- **2**: deps — / blocks 5, 6, 7
- **3**: deps — / blocks 5
- **4**: deps — / blocks 9
- **5**: deps 1, 2, 3 / blocks 7, 10, 11
- **6**: deps 2 / blocks 14
- **7**: deps 2, 5 / blocks 8, 9, 10, 11, 12
- **8**: deps 2, 7 / blocks 9, 10
- **9**: deps 4, 7, 8 / blocks 10, 11, 12, 13
- **10**: deps 5, 8, 9 / blocks 11, 13
- **11**: deps 5, 9, 10 / blocks 13
- **12**: deps 7, 9 / blocks 13
- **13**: deps 9, 10, 11, 12 / blocks 14
- **14**: deps 6, 13 / blocks Final Wave

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep`, T2 → `quick`, T3 → `deep`, T4 → `visual-engineering`
- **Wave 2**: T5 → `deep`, T6 → `unspecified-high`, T7 → `quick`
- **Wave 3**: T8 → `deep`, T9 → `visual-engineering`, T10 → `visual-engineering`, T11 → `deep`, T12 → `visual-engineering`
- **Wave 4**: T13 → `quick`, T14 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Extract shared `mapArchetypeRowToConfig` + `validateProposalFields` helpers

  **What to do**:
  - Create a shared helper module (recommend `src/gateway/lib/archetype-edit-helpers.ts`, or a static on `ArchetypeGenerator` if cleaner) containing `mapArchetypeRowToConfig(row)` — copy the EXACT logic currently duplicated in `admin-archetype-propose-edit.ts` (~L147) and `admin-archetype-interpret-request.ts` (~L33).
  - Extract the route-level validation from `admin-archetype-propose-edit.ts` into a shared `validateProposalFields(...)`: `validateTools` (~L80, tools vs `ALL_TOOL_DESCRIPTORS`/`discoverTools()` ∪ tenant connected Composio toolkits), the `trigger_sources` Zod check (`TriggerSourceSchema`), the `input_schema` Zod check (`InputSchemaSchema`), and the prose-blank guard. Keep behavior byte-identical; return a structured `{ ok: true } | { ok: false, reason: string }` the route can map to 422.
  - Update `admin-archetype-propose-edit.ts` to import both helpers (it will be further changed in T5 — here only de-duplicate, do not change behavior).
  - Run `lsp_find_references` on `mapArchetypeRowToConfig` to confirm both call sites before/after; ensure no third caller is missed.
  - Add unit tests for the extracted helpers (mapping correctness; validateProposalFields rejects an unavailable tool, a malformed trigger, a malformed input, and a blanked prose field; accepts valid inputs).

  **Must NOT do**:
  - Do NOT change validation semantics or the allowlist set.
  - Do NOT delete `interpret-request` here (that's T6) — just point its `mapArchetypeRowToConfig` at the shared helper.

  **Recommended Agent Profile**:
  - **Category**: `deep` — correctness-sensitive extraction that everything downstream depends on.
  - **Skills**: [`api-design`, `data-access-conventions`] — route conventions, tool-registry + tenant-scope rules.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 5 · Blocked By: None.

  **References**:
  - `src/gateway/routes/admin-archetype-propose-edit.ts:~33-160` (`mapArchetypeRowToConfig`, `applyAllowlist`, `validateTools`, trigger/input/prose guards) — the source of truth to extract.
  - `src/gateway/routes/admin-archetype-interpret-request.ts:~33` — the duplicate to replace.
  - `src/lib/tool-registry.ts` (`ALL_TOOL_DESCRIPTORS`), `src/gateway/services/tool-parser.ts` (`discoverTools()`), `src/gateway/routes/admin-archetypes.ts:27` (`TriggerSourceSchema`), `src/gateway/validation/schemas.ts` (`InputSchemaSchema`).
  - WHY: T5 builds the unified endpoint on top of these helpers; de-duplicating first keeps the new flow from spawning a third copy.

  **Acceptance Criteria**:
  - [ ] `mapArchetypeRowToConfig` exists once (grep shows a single definition); both routes import it.
  - [ ] `pnpm test:unit` includes helper tests covering map + all 4 validation branches.

  **QA Scenarios**:

  ```
  Scenario: helpers de-duplicated, behavior unchanged (happy path)
    Tool: Bash (grep + vitest)
    Steps:
      1. grep -rn "function mapArchetypeRowToConfig" src/ -> exactly ONE definition
      2. pnpm test:unit -> helper tests PASS; propose-edit existing tests still PASS
    Expected Result: single definition; all tests green
    Evidence: .sisyphus/evidence/task-1-helpers.txt

  Scenario: validateProposalFields rejects bad inputs (negative)
    Tool: vitest
    Steps:
      1. call with a tool not in the available set -> {ok:false, reason}
      2. call with scheduled trigger missing cron -> {ok:false}
      3. call with malformed input_schema -> {ok:false}
      4. call blanking a non-empty prose field -> {ok:false}
    Expected Result: each rejected with a plain-language reason; valid inputs pass
    Evidence: .sisyphus/evidence/task-1-validate.txt
  ```

  **Commit**: YES — `refactor(archetypes): extract shared archetype-edit map + validation helpers`; Pre-commit: `pnpm test:unit && pnpm lint`.

- [x] 2. Define the discriminated-union types (gateway + dashboard) + `ConverseMessage`

  **What to do**:
  - Gateway: define the converse response union (e.g. in `src/gateway/services/archetype-generator.ts` or a shared types file): `ConverseMessage = { role: 'user' | 'assistant'; content: string }`; `ConverseResult = { kind: 'question'; question: string } | { kind: 'proposal'; baseline; proposal; changed_fields; tool_delta?; trigger_change?; input_change?; approval_warning? } | { kind: 'no_change' } | { kind: 'too_long' }` (the `too_long` member is the token-budget "start fresh" signal).
  - Dashboard `lib/types.ts`: mirror as `ConverseMessage` and `ConverseResponse` (same `kind` discriminant + same proposal fields as today's `ProposalResponse` so `ProposalDiffCard` stays compatible). Keep `EditHistoryRow`, `RecordEditHistoryPayload`. Mark/remove `InterpretResponse` (removed in T6/T7).
  - No runtime logic — types only (plus any shared Zod schema for the request body `{ transcript: ConverseMessage[] }` if you co-locate it).

  **Must NOT do**:
  - Do NOT use implicit flags (no overloading `no_change` as a boolean on a proposal) — the `kind` field is the single discriminant.
  - Do NOT add fields for disallowed archetype properties.

  **Recommended Agent Profile**:
  - **Category**: `quick` — type definitions only.
  - **Skills**: [`api-design`] — response-shape conventions.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 5, 6, 7 · Blocked By: None.

  **References**:
  - `dashboard/src/lib/types.ts:~436` (`ProposalResponse`) — keep proposal fields identical for card compatibility.
  - `src/gateway/routes/admin-archetype-propose-edit.ts` response shape — the proposal-branch fields to reuse.
  - WHY: every other task imports these types; a stable, explicit union prevents the R7 implicit-flag bug.

  **Acceptance Criteria**:
  - [ ] `pnpm build` and `pnpm --dir dashboard build` compile with the new types referenced by a trivial type-only import.

  **QA Scenarios**:

  ```
  Scenario: union types compile and discriminate (happy path)
    Tool: Bash (tsc)
    Steps:
      1. pnpm build && pnpm --dir dashboard build -> no TS errors
      2. (in a test) a switch on result.kind narrows each branch's fields
    Expected Result: exhaustive switch typechecks; proposal branch exposes baseline/proposal/changed_fields
    Evidence: .sisyphus/evidence/task-2-types.txt
  ```

  **Commit**: YES — `feat(archetypes): add converse discriminated-union types`; Pre-commit: `pnpm build && pnpm --dir dashboard build`.

- [x] 3. Add `converse()` engine branch + clearance prompt + 5-question backstop + token-budget guard

  **What to do**:
  - In `ArchetypeGenerator` (`src/gateway/services/archetype-generator.ts`), add `converse(transcript: ConverseMessage[], currentConfig, catalog?, composioContext?)` that returns `ConverseResult`. It builds messages from a NEW clearance-style system prompt + the current config + the full transcript, calls the gateway LLM (reuse the existing client; `responseFormat: json_object`), and parses a model output whose JSON carries `{ kind: 'question' | 'proposal', ... }`.
  - **Branch BEFORE side-effects**: immediately after parse, if `kind === 'question'`, RETURN the question WITHOUT calling `postProcess()`, `applyModelAndEstimate()`, or the `proseUnchanged` nudge-retry (~L580-620). Only the proposal branch runs postProcess + emits a full config for the route to allowlist/diff.
  - **5-question backstop**: count assistant `question` turns already in `transcript`. If that count ≥ 5, inject a directive into the system/user message forcing the model to produce a PROPOSAL (best guess) — and if the model still returns `kind:'question'`, coerce/re-prompt once with "you must propose now". Never return a 6th question.
  - **Token-budget guard**: before the LLM call, estimate tokens for (system prompt + currentConfig + transcript). If it exceeds a safe budget (a named constant well under the model context, accounting for `maxTokens: 16000` output), DO NOT call the LLM — return `{ kind: 'too_long' }`.
  - **New prompt** in `services/prompts/archetype-generator-prompts.ts` (`CONVERSE_SYSTEM_PROMPT_PRE`/`_POST`, reusing `buildConnectedAppsBlock` + catalog like refine): clearance-style instructions — "Ask a clarifying question ONLY when the request is genuinely ambiguous about WHICH field or WHAT value to change. The moment you can make a confident, reasonable edit, output a proposal instead. Prefer acting over asking." MUST state the baseline invariant: "The conversation transcript is for understanding intent only. ALWAYS compute changes against the CURRENT configuration provided in this message — never against an earlier proposal mentioned in the transcript." MUST politely decline requests to change model/temperature/role_name/vm_size/concurrency_limit. Output contract: strict JSON with `kind` plus either `question` or the full config.
  - Add unit tests (mock the LLM): question branch skips postProcess + nudge; proposal branch runs postProcess; backstop forces a proposal at ≥5 questions; token-guard returns `too_long`.

  **Must NOT do**:
  - Do NOT remove or repurpose the existing `refine()` (T5 may call `converse()`; keep `generate()` for the wizard untouched).
  - Do NOT let the `proseUnchanged` nudge run on a question response.
  - Do NOT add server-side persistence/session — transcript is an argument only.

  **Recommended Agent Profile**:
  - **Category**: `deep` — the highest-risk correctness surface (branch ordering, backstop, token guard, prompt design).
  - **Skills**: [`api-design`, `data-access-conventions`] — gateway LLM client + service conventions.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 5 · Blocked By: None.

  **References**:
  - `src/gateway/services/archetype-generator.ts:~398 refine`, `:~580-581 postProcess/applyModelAndEstimate`, `:~599-620 proseUnchanged nudge` — branch BEFORE these.
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:~301 REFINE_SYSTEM_PROMPT_PRE/_POST`, `buildConnectedAppsBlock` — mirror structure for the new converse prompt.
  - `src/lib/call-llm.ts` — gateway LLM client + model enforcement + json_object usage.
  - AGENTS.md — gateway model is `deepseek/deepseek-v4-flash` (weaker) → why the clearance prompt must be explicit and the backstop must exist (Metis R4).
  - WHY: this method is the heart of the Prometheus clarify-then-act behavior; getting the branch order + prompt right is what makes the whole feature feel right.

  **Acceptance Criteria**:
  - [ ] Unit: mock LLM `{kind:'question',question}` → `converse` returns it; `postProcess`/`applyModelAndEstimate`/nudge NOT called (spy assertions).
  - [ ] Unit: mock LLM proposal → postProcess runs; returns a full config for allowlisting.
  - [ ] Unit: transcript with 5 assistant question turns → result is `proposal`/`no_change`, never `question`.
  - [ ] Unit: oversized transcript → `{kind:'too_long'}`, LLM NOT called (spy).

  **QA Scenarios**:

  ```
  Scenario: question branch skips side-effects (happy path)
    Tool: vitest (mock LLM + spies)
    Steps:
      1. converse([{user:"make it shorter"}], cfg) with LLM returning {kind:'question'} -> returns question
      2. assert postProcess + applyModelAndEstimate + nudge spies NOT called
    Evidence: .sisyphus/evidence/task-3-question-branch.txt

  Scenario: backstop forces a proposal (negative-of-loop)
    Tool: vitest
    Steps:
      1. transcript with 5 prior assistant questions; LLM tries another question
      2. assert final result.kind === 'proposal' (forced best guess), never a 6th question
    Evidence: .sisyphus/evidence/task-3-backstop.txt

  Scenario: token guard returns start-fresh (negative)
    Tool: vitest
    Steps:
      1. pass an oversized transcript -> {kind:'too_long'}; assert LLM client spy NOT called
    Evidence: .sisyphus/evidence/task-3-token-guard.txt
  ```

  **Commit**: YES — `feat(archetypes): add converse() clarify-then-act engine branch`; Pre-commit: `pnpm test:unit && pnpm lint`.

- [x] 4. Strip `ProposalDiffCard` refine UI (keep Approve/Deny + approval-off safeguard)

  **What to do**:
  - In `dashboard/src/panels/employees/sections/ProposalDiffCard.tsx`, REMOVE: the `showRefine` state (~L43-46), the refine `<textarea>` block (~L182-208), the "Ask for more changes" button (~L218-222), and the `onRefineSubmit` prop from `ProposalDiffCardProps` (~L28). Run `lsp_find_references` on `onRefineSubmit` + `showRefine` to confirm no other consumer.
  - KEEP everything else: the diff viewer (react-diff-viewer-continued), tool/trigger/input friendly delta rendering, the Approve and Deny buttons, the `busy` disabling, AND the approval-off safeguard (the prominent warning + the explicit confirm checkbox that gates Approve when `approvalChange.to === false`, ~L48,110-139).
  - Update the card's RTL test to assert: NO refine textarea, NO "Ask for more changes" button, Approve still disabled until the approval-off confirm is ticked when applicable, `onApprove`/`onDeny` fire on click.

  **Must NOT do**:
  - Do NOT remove/weaken the approval-off warning + confirm.
  - Do NOT render any disallowed field (model/temperature/role_name/vm_size/concurrency_limit) even if passed.
  - Do NOT add any new input box to the card.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — focused component edit + test.
  - **Skills**: [`react-dashboard`] — card shells, non-technical copy, component conventions.

  **Parallelization**: Can Run In Parallel: YES · Wave 1 · Blocks: 9 · Blocked By: None.

  **References**:
  - `dashboard/src/panels/employees/sections/ProposalDiffCard.tsx:~28,43-46,110-139,182-222` — exact removals + the approval-off block to preserve.
  - `dashboard/src/panels/employees/__tests__/AssistantTab.test.tsx` — existing assertions to update.
  - WHY: removing the second input box here is the literal fix for the user's dual-input confusion; preserving the approval-off gate is a behavior-preservation invariant (Metis R2).

  **Acceptance Criteria**:
  - [ ] `pnpm --dir dashboard test` includes a card test asserting no refine textarea + no "Ask for more changes" button + approval-off confirm still gates Approve.
  - [ ] `grep -rn "onRefineSubmit\|showRefine" dashboard/src/` → no matches.

  **QA Scenarios**:

  ```
  Scenario: card has no second input, keeps Approve/Deny (happy path)
    Tool: vitest (RTL)
    Steps:
      1. render ProposalDiffCard with a prose change -> diff + Approve + Deny present; query for textarea -> none; query "Ask for more changes" -> absent
      2. click Approve -> onApprove called
    Evidence: .sisyphus/evidence/task-4-card.txt

  Scenario: approval-off still gated (negative)
    Tool: vitest (RTL)
    Steps:
      1. render with approvalChange {from:true,to:false} -> warning visible; Approve disabled until confirm checkbox ticked
    Evidence: .sisyphus/evidence/task-4-approval-off.txt
  ```

  **Commit**: YES — `refactor(dashboard): remove ProposalDiffCard secondary input, keep approval gate`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [x] 5. Unified `propose-edit` endpoint: `{ transcript }` → discriminated union (ADMIN)

  **What to do**:
  - Change `POST /admin/tenants/:tenantId/archetypes/:archetypeId/propose-edit` (`admin-archetype-propose-edit.ts`) request body from `{ request_text }` to `{ transcript: ConverseMessage[] }` (Zod-validated; min 1 message; cap message count/length reasonably). Auth stays `requireTenantRole(TenantRole.ADMIN)`; tenant-scoped fetch (404 on mismatch).
  - Use the shared `mapArchetypeRowToConfig` (T1) to build `currentConfig`; derive `connectedToolkits`/`connectableToolkits` as the existing route does; call `generator.converse(transcript, currentConfig, catalog, { connectedToolkits, connectableToolkits })` (T3).
  - **Branch on `result.kind`**:
    - `'question'` → respond `{ kind:'question', question }` (200). NO allowlist, NO validation, NO persistence.
    - `'too_long'` → respond `{ kind:'too_long' }` (200) so the UI can show "start fresh".
    - `'proposal'` → run the EXISTING proposal pipeline on the returned config: `applyAllowlist` (keep ONLY the allowlisted fields), shared `validateProposalFields` (T1) for tools/trigger/input + prose-blank guard (422 `PROPOSAL_INVALID` on failure), compute `changed_fields`/`tool_delta`/`trigger_change`/`input_change` vs the persisted archetype, set `approval_warning` when `approval_required` goes true→false. Respond `{ kind:'proposal', baseline, proposal, changed_fields, … }`.
    - `'no_change'` (or proposal that differs in nothing) → respond `{ kind:'no_change' }`.
  - `sendError`/`sendSuccess` for all responses. Unit-test each branch with a mocked `converse`.

  **Must NOT do**:
  - Do NOT persist anything (preview only).
  - Do NOT let disallowed fields survive the allowlist; do NOT propose an unavailable tool / invalid trigger / invalid input.
  - Do NOT keep the old `{ request_text }` body shape.

  **Recommended Agent Profile**:
  - **Category**: `deep` — the contract change + branch routing + invariant preservation are correctness-critical.
  - **Skills**: [`api-design`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 7, 10, 11 · Blocked By: 1, 2, 3.

  **References**:
  - `src/gateway/routes/admin-archetype-propose-edit.ts` (whole file) — existing allowlist/validation/diff pipeline to reuse on the proposal branch.
  - T1 helpers, T3 `converse()`, T2 types.
  - `src/gateway/routes/admin-archetypes.ts:~88-93,184` — tenant-scope + sendError/sendSuccess patterns.
  - WHY: this is the single unified endpoint the chat calls every turn; the kind-branch is what lets the same call either ask or propose (Metis Q1 resolved: one endpoint, discriminated union).

  **Acceptance Criteria**:
  - [ ] Unit: mock converse → question → 200 `{kind:'question'}`, no allowlist/validation invoked (spies).
  - [ ] Unit: mock converse → proposal that changes model+temperature → response proposal has NEITHER; `changed_fields` excludes them.
  - [ ] Unit: proposal blanking non-empty `execution_steps` → 422 `PROPOSAL_INVALID`.
  - [ ] Unit: unavailable tool in proposal → rejected with a clear reason.
  - [ ] Unit: approval true→false → `approval_warning: true`.
  - [ ] Unit: oversized transcript path → `{kind:'too_long'}`.

  **QA Scenarios**:

  ```
  Scenario: question turn (happy path)
    Tool: Bash (curl)
    Steps:
      1. curl -X POST .../propose-edit -H "Authorization: Bearer $SERVICE_TOKEN" -d '{"transcript":[{"role":"user","content":"make it shorter"}]}'
    Expected Result: 200 with {kind:'question', question:"..."} OR {kind:'proposal',...} depending on model; no persistence (psql archetype unchanged)
    Evidence: .sisyphus/evidence/task-5-question.json

  Scenario: proposal allowlist + strip (negative)
    Tool: vitest (mock converse returns config changing model/temperature/identity)
    Steps:
      1. assert proposal keys subset of allowlist; NO model/temperature; changed_fields excludes them
    Evidence: .sisyphus/evidence/task-5-allowlist.txt

  Scenario: empty-prose + bad-tool guards (negative)
    Tool: vitest
    Steps:
      1. blanked execution_steps -> 422 PROPOSAL_INVALID
      2. unavailable tool -> rejected with reason
    Evidence: .sisyphus/evidence/task-5-guards.txt
  ```

  **Commit**: YES — `feat(archetypes): unify propose-edit to transcript-driven converse union`; Pre-commit: `pnpm test:unit && pnpm lint`.

- [x] 6. Retire `interpret-request` completely

  **What to do**:
  - Run `lsp_find_references` on `interpretRequest` (service method) and on the route to enumerate ALL consumers first.
  - Delete the route file `src/gateway/routes/admin-archetype-interpret-request.ts`.
  - Remove its import + registration in `src/gateway/server.ts` (~L24, ~L245-249 region).
  - Remove `ArchetypeGenerator.interpretRequest()` and its prompt (`services/prompts/archetype-generator-prompts.ts` interpret system prompt ~L507-519) IF no other caller remains (confirm via references; if the wizard or anything else uses it, keep the method and only remove the route).
  - Remove `interpretRequest` from `dashboard/src/lib/gateway.ts` (~L639) and `InterpretResponse` from `dashboard/src/lib/types.ts` (~L432). (T7 owns adding `converseEdit`; this task owns the removals on gateway/server/service/prompt + the dashboard `interpretRequest`/`InterpretResponse` + README — keep removals here to avoid conflict.)
  - Remove the `interpret-request` row from the README admin endpoint table (Documentation Freshness).
  - Ensure `pnpm build`, `pnpm test:unit`, `pnpm --dir dashboard build` still pass after removal.

  **Must NOT do**:
  - Do NOT remove `generate()` or `refine()`/`converse()`.
  - Do NOT leave any dangling reference (route, import, client fn, type, README row).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — multi-file deletion with reference verification.
  - **Skills**: [`api-design`].

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 14 · Blocked By: 2.

  **References**:
  - `src/gateway/routes/admin-archetype-interpret-request.ts`, `src/gateway/server.ts:~24,245-249`, `src/gateway/services/archetype-generator.ts interpretRequest`, `dashboard/src/lib/gateway.ts:~639`, `dashboard/src/lib/types.ts:~432`, `README.md` admin table.
  - WHY: the restatement/Confirm gate is being removed; leaving a half-wired endpoint is dead code + a documentation lie.

  **Acceptance Criteria**:
  - [ ] `grep -rn "interpret-request\|interpretRequest\|InterpretResponse" src/ dashboard/src/ README.md` → no matches.
  - [ ] `pnpm build && pnpm --dir dashboard build && pnpm test:unit` clean.

  **QA Scenarios**:

  ```
  Scenario: endpoint fully removed (happy path)
    Tool: Bash (grep + curl)
    Steps:
      1. grep -rn "interpret-request\|interpretRequest" src/ dashboard/src/ README.md -> none
      2. curl -X POST .../interpret-request -> 404 (route gone)
    Evidence: .sisyphus/evidence/task-6-retire.txt
  ```

  **Commit**: YES — `refactor(archetypes): retire interpret-request endpoint and restatement gate`; Pre-commit: `pnpm build && pnpm test:unit && pnpm lint`.

- [x] 7. Dashboard gateway client: `converseEdit` + union type; drop `interpretRequest`

  **What to do**:
  - In `dashboard/src/lib/gateway.ts`, add `converseEdit(tenantId, archetypeId, transcript: ConverseMessage[]): Promise<ConverseResponse>` → POST the unified `propose-edit` with `{ transcript }`, using the existing `gatewayFetch` wrapper (mirror `proposeEdit`/`refineArchetype` style). Replace the old `proposeEdit(request_text)` with `converseEdit`.
  - Keep `recordEditHistory`, `listEditHistory`, `revertEdit`, `patchArchetype` (ensure `patchArchetype`'s `Pick<>` already covers `identity, execution_steps, delivery_steps, overview, risk_model, tool_registry, trigger_sources, input_schema` — add any missing).
  - Reference the `ConverseResponse`/`ConverseMessage` types from T2.

  **Must NOT do**:
  - Do NOT inline fetch — use `gatewayFetch`.
  - Do NOT add model/temperature handling.
  - Do NOT re-remove `interpretRequest`/`InterpretResponse` (T6 owns that) — just don't reference them.

  **Recommended Agent Profile**:
  - **Category**: `quick` — thin client + type wiring.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 2 · Blocks: 8, 9, 10, 11, 12 · Blocked By: 2, 5.

  **References**:
  - `dashboard/src/lib/gateway.ts:~653 proposeEdit, ~667 recordEditHistory, ~681 listEditHistory, ~690 revertEdit, patchArchetype Pick<>` — patterns to mirror/extend.
  - T2 types.
  - WHY: every frontend task depends on this typed client call.

  **Acceptance Criteria**:
  - [ ] `pnpm --dir dashboard build` passes with `converseEdit` referenced; `proposeEdit(request_text)` gone.

  **QA Scenarios**:

  ```
  Scenario: client compiles + posts transcript (happy path)
    Tool: Bash (tsc) + Playwright network assert in T13
    Steps:
      1. pnpm --dir dashboard build -> no TS errors
    Evidence: .sisyphus/evidence/task-7-client.txt
  ```

  **Commit**: YES — `feat(dashboard): add converseEdit client`; Pre-commit: `pnpm --dir dashboard build && pnpm lint`.

- [x] 8. Build `useChatConversation` hook (transcript state + single-input routing + start-fresh)

  **What to do**:
  - Create `dashboard/src/panels/employees/use-chat-conversation.ts` (or `dashboard/src/hooks/`). It owns the ephemeral conversation: `messages` (UI message list: `{id, role:'user'|'assistant', kind:'text'|'question'|'proposal'|'notice', text?, question?, proposal?, proposalActed?}`) AND the `transcript` (the `ConverseMessage[]` of plain role/content pairs sent to the backend).
  - Expose `submit(text: string)`: appends the user's text to BOTH messages and transcript, marks loading, calls `converseEdit(tenantId, archetypeId, transcript)`, then on result:
    - `kind:'question'` → append assistant question bubble + push `{role:'assistant', content: question}` to transcript (so the next turn has context).
    - `kind:'proposal'` → append a proposal message (one ACTIVE proposal at a time; mark any prior proposal `proposalActed`).
    - `kind:'no_change'` → append a friendly assistant notice ("It looks like no change is needed for that.").
    - `kind:'too_long'` → append a notice + set a `mustStartFresh` flag; `startFresh()` clears messages+transcript.
  - Expose `startFresh()`, `isLoading`, `hasPendingProposal` (an un-acted proposal exists), and `pending` (loading OR hasPendingProposal) for the unsaved-changes guard.
  - **Single-input routing is trivial here**: there is ONE `submit` — whether the user is starting, answering a question, or refining a proposal, it's the same call with the growing transcript. (Refine = a follow-up user turn while a proposal is on screen; the backend diffs vs the CURRENT persisted archetype per the T3 invariant.)
  - Unit-test the reducer logic: each `kind` maps to the right message; transcript grows correctly; `hasPendingProposal` toggles; `startFresh` resets.

  **Must NOT do**:
  - Do NOT persist to DB or localStorage (ephemeral per decision).
  - Do NOT keep more than one ACTIVE (un-acted) proposal.
  - Do NOT add a second submit path for "refine" — one input, one submit.

  **Recommended Agent Profile**:
  - **Category**: `deep` — the state machine that makes the single-input UX correct.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 9, 10 · Blocked By: 2, 7.

  **References**:
  - `dashboard/src/panels/employees/AssistantTab.tsx` (current state shape) — what to REPLACE; do not carry over the restatement/confirm hop or the dual handlers.
  - T2 `ConverseResponse`/`ConverseMessage`, T7 `converseEdit`.
  - WHY: collapsing the old interpret→confirm→propose→refine handlers into ONE transcript-driven submit is the core of the single-input fix.

  **Acceptance Criteria**:
  - [ ] RTL/unit: `submit` with a mocked `converseEdit` returning each `kind` produces the correct message + transcript growth; `hasPendingProposal` true after a proposal, false after act/startFresh.

  **QA Scenarios**:

  ```
  Scenario: one submit handles question then proposal (happy path)
    Tool: vitest
    Steps:
      1. submit("make it shorter") -> mocked kind:'question' -> question bubble + transcript has user+assistant turns
      2. submit("the slack message") -> mocked kind:'proposal' -> proposal message; hasPendingProposal true
    Evidence: .sisyphus/evidence/task-8-hook.txt

  Scenario: too_long sets start-fresh (negative)
    Tool: vitest
    Steps:
      1. mocked kind:'too_long' -> notice + mustStartFresh true; startFresh() clears all
    Evidence: .sisyphus/evidence/task-8-startfresh.txt
  ```

  **Commit**: YES — `feat(dashboard): add useChatConversation transcript hook`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [x] 9. Rebuilt `AssistantTab` chat shell (single input, question bubbles, guard)

  **What to do**:
  - Rebuild `dashboard/src/panels/employees/AssistantTab.tsx` from scratch, props `{ archetype: Archetype; tenantId: string; onSaved: () => void }` (mirror `TrainingTab`/`DebugTab`). Use `useChatConversation` (T8).
  - Render ONE conversational thread: user bubbles right-aligned; assistant `text`/`question`/`notice` bubbles left (react-markdown + remark-gfm); `proposal` messages render `ProposalDiffCard` (T4, Approve/Deny only). Auto-scroll to newest. Loading spinner row while awaiting a response.
  - Exactly ONE input box at the bottom (textarea + Send; Enter submits, Shift+Enter newline) → calls `submit`. Plain-language empty state ("Ask me to change how this employee works — for example, 'make replies shorter'. I'll ask a question if I need to."). When `mustStartFresh`, show a "Start fresh" button that calls `startFresh()`.
  - Wire `useUnsavedChangesGuard(pending)` where `pending = hasPendingProposal || isLoading`.
  - Render the edit-history collapsible sub-view (T12) below/aside the chat.

  **Must NOT do**:
  - Do NOT render any second input box anywhere (no refine textarea).
  - Do NOT add a Confirm/restatement step.
  - Do NOT persist messages.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — primary UI surface.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 10, 11, 12, 13 · Blocked By: 4, 7, 8.

  **References**:
  - `dashboard/src/panels/employees/TrainingTab.tsx`, `DebugTab.tsx` — tab structure/props.
  - T4 `ProposalDiffCard`, T8 `useChatConversation`, existing `useUnsavedChangesGuard`.
  - WHY: this is the container that delivers the chat-first experience the user asked for.

  **Acceptance Criteria**:
  - [ ] RTL: exactly one textarea in the tab; typing+Send appends a user bubble + spinner; a question result renders a question bubble answerable from the same box; guard arms when a proposal is pending.

  **QA Scenarios**:

  ```
  Scenario: single-input chat shell (happy path)
    Tool: vitest (RTL) then Playwright in F3
    Steps:
      1. render AssistantTab; assert exactly ONE textarea; submit "make it shorter" -> user bubble + spinner
    Evidence: .sisyphus/evidence/task-9-shell.txt
  ```

  **Commit**: YES — `feat(dashboard): rebuild AI assistant tab as single-input chat`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [x] 10. Wire the converse loop (question vs proposal vs no_change; refine in the same box)

  **What to do**:
  - Connect `AssistantTab` ↔ `useChatConversation` end-to-end so the live `converseEdit` flow works: submitting a request returns either a question bubble (answered in the same input) or a `ProposalDiffCard`; submitting a follow-up while a proposal is shown produces a NEW proposal diffed against the CURRENT persisted archetype (re-fetch the archetype, or rely on the backend baseline, per T3/T5) and supersedes the prior one (mark prior `proposalActed`).
  - Surface gateway errors via `sonner` toast; clear the spinner. Surface a `kind:'proposal'`-with-rejection-reason path (422 PROPOSAL_INVALID from the endpoint) as a friendly assistant notice ("I can't add 'X' because…"), NOT a card.
  - Ensure only ONE proposal is approvable at a time.

  **Must NOT do**:
  - Do NOT diff a refine against the previous proposal (must be vs persisted baseline).
  - Do NOT allow two pending proposals to both be approvable.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — stateful chat wiring.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 11, 13 · Blocked By: 5, 8, 9.

  **References**:
  - T5 endpoint union shape; T8 hook; `sonner` toast usage in the dashboard.
  - WHY: this is where "type a follow-up to refine" replaces the deleted second input box — the literal UX the user wanted.

  **Acceptance Criteria**:
  - [ ] RTL/Playwright: a follow-up after a proposal yields a new proposal card and greys the old; an invalid-tool request renders a notice, not a card.

  **QA Scenarios**:

  ```
  Scenario: refine via main input (happy path)
    Tool: Playwright (F3) / RTL here
    Steps:
      1. get a proposal; type a follow-up in the SAME box; Send -> new proposal card; old card greyed
    Evidence: .sisyphus/evidence/task-10-refine.txt

  Scenario: invalid tool -> notice not card (negative)
    Tool: RTL (mock 422)
    Steps:
      1. submit a request the endpoint rejects with PROPOSAL_INVALID -> friendly notice bubble, no card
    Evidence: .sisyphus/evidence/task-10-invalid.txt
  ```

  **Commit**: YES — `feat(dashboard): wire converse loop with inline refine`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [x] 11. Approve flow: re-fetch baseline → PATCH → recordEditHistory

  **What to do**:
  - On Approve in `ProposalDiffCard`: (1) re-fetch the CURRENT archetype (fresh GET) and snapshot its allowlisted fields as `before_json` — do NOT use the render-time prop (Metis R5). (2) `patchArchetype(tenantId, archetypeId, proposedAllowlistedFields)` — include regenerated `overview` when prose changed (no overview drift). (3) `recordEditHistory(tenantId, archetypeId, { request_text: <the user's originating request from the transcript>, before_json, after_json: proposedFields, changed_fields: Object.keys(changed_fields), kind:'edit' })`. (4) Mark the proposal `proposalActed`, toast success, call `onSaved()`, refresh the history list, disarm the guard.
  - Respect the approval-off confirm: if `approval_required` true→false, Approve must already be gated by the card's confirm checkbox (T4) before this runs.
  - On Deny: mark `proposalActed`, apply nothing, no history row.
  - Silent last-write-wins (no concurrency warning). Unit-test the apply sequence (re-fetch → patch → record) with mocked clients; assert `before_json` comes from the re-fetch, not the stale prop.

  **Must NOT do**:
  - Do NOT build an atomic/transaction apply endpoint (out of scope) — keep the two client calls, just fix the baseline source.
  - Do NOT apply disallowed fields (the endpoint already stripped them; the client must not re-add).
  - Do NOT record history on Deny.

  **Recommended Agent Profile**:
  - **Category**: `deep` — apply correctness + history accuracy.
  - **Skills**: [`react-dashboard`, `data-access-conventions`].

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 13 · Blocked By: 5, 9, 10.

  **References**:
  - `dashboard/src/panels/employees/AssistantTab.tsx:~221 handleApprove` (current stale-prop pattern to FIX); `dashboard/src/lib/gateway.ts patchArchetype, recordEditHistory`.
  - WHY: re-fetching kills the stale-baseline race so `before_json`/revert are trustworthy (Metis R5).

  **Acceptance Criteria**:
  - [ ] Unit: Approve calls GET(archetype) → PATCH(proposed) → recordEditHistory with `before_json` == the re-fetched snapshot (spy order + payload).
  - [ ] Unit: Deny records nothing.

  **QA Scenarios**:

  ```
  Scenario: approve re-fetches baseline then persists (happy path)
    Tool: Bash (curl + psql) in F3 + RTL spies here
    Steps:
      1. Approve a prose proposal -> PATCH applies; edit-history row has before_json from a fresh read
      2. psql: archetype identity/execution_steps == proposed; history count +1
    Evidence: .sisyphus/evidence/task-11-approve.txt

  Scenario: deny applies nothing (negative)
    Tool: RTL
    Steps:
      1. Deny -> no patchArchetype/recordEditHistory calls; card greyed
    Evidence: .sisyphus/evidence/task-11-deny.txt
  ```

  **Commit**: YES — `feat(dashboard): approve flow re-fetches baseline before apply`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [x] 12. Edit-history collapsible sub-view + revert

  **What to do**:
  - Move `EditHistoryList` out of the always-visible chat area into a collapsible sub-view using the repo's `CollapsibleSection` (or equivalent card-shell collapsible) so it doesn't compete with the conversation. Default collapsed; header like "Change history".
  - Keep its existing behavior: `listEditHistory` on open/refresh, render rows newest-first, Revert → `revertEdit(tenantId, archetypeId, historyId)` → toast + refresh + `onSaved()`. If the expanded/collapsed state is bookmark-worthy, encode it in the URL (`?historyOpen=1`) per repo convention; otherwise local state is fine for an ephemeral toggle.
  - Update tests to assert the collapsible renders, expands, lists rows, and Revert calls the client.

  **Must NOT do**:
  - Do NOT delete the history/revert feature.
  - Do NOT hard-delete or mutate history rows (revert is append-only on the backend).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — UI relocation + collapsible.
  - **Skills**: [`react-dashboard`] — `CollapsibleSection`, card shells, URL-encoded state.

  **Parallelization**: Can Run In Parallel: YES · Wave 3 · Blocks: 13 · Blocked By: 7, 9.

  **References**:
  - `dashboard/src/panels/employees/sections/EditHistoryList.tsx` (~151 lines) — existing list + revert to wrap.
  - `react-dashboard` skill — `CollapsibleSection` (already applies card-shell styling), URL-encoded navigatable state.
  - WHY: decision #7 — keep history but get it out of the chat's way.

  **Acceptance Criteria**:
  - [ ] RTL: history is collapsed by default, expands on click, lists rows, Revert calls `revertEdit`.

  **QA Scenarios**:

  ```
  Scenario: collapsible history + revert (happy path)
    Tool: vitest (RTL)
    Steps:
      1. render -> "Change history" collapsed; click -> expands; rows render; click Revert -> revertEdit called
    Evidence: .sisyphus/evidence/task-12-history.txt
  ```

  **Commit**: YES — `feat(dashboard): move edit history into collapsible sub-view`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [x] 13. Mount the rebuilt `AssistantTab` in `EmployeeDetail.tsx` (`?tab=assistant`)

  **What to do**:
  - Ensure `EmployeeDetail.tsx` mounts the rebuilt `AssistantTab` at the existing `?tab=assistant` `TabsContent` (~L267-269), passing `{ archetype, tenantId, onSaved }`. Confirm the `onSaved` handler refreshes the archetype (so the diff baseline is current after an Approve).
  - Verify URL-driven tab switching still works and the unsaved-changes guard cooperates with tab changes (guard from T9).

  **Must NOT do**:
  - Do NOT change other tabs.
  - Do NOT add a separate route — it stays a tab.

  **Recommended Agent Profile**:
  - **Category**: `quick` — wiring + smoke check.
  - **Skills**: [`react-dashboard`].

  **Parallelization**: Can Run In Parallel: NO (integration) · Wave 4 · Blocks: 14 · Blocked By: 9, 10, 11, 12.

  **References**:
  - `dashboard/src/panels/employees/EmployeeDetail.tsx:~28 handleTabChange, ~241-277 Tabs, ~267-269 assistant TabsContent`.
  - WHY: makes the rebuilt experience live at the route the user uses.

  **Acceptance Criteria**:
  - [ ] Playwright: navigating to `?tab=assistant` renders the new chat; switching tabs with a pending proposal triggers the guard; after Approve, the baseline reflects the saved change.

  **QA Scenarios**:

  ```
  Scenario: tab mounts the new chat (happy path)
    Tool: Playwright
    Steps:
      1. open /dashboard/employees/<id>?tab=assistant -> single-input chat renders; one textarea only
    Evidence: .sisyphus/evidence/task-13-mount.txt
  ```

  **Commit**: YES — `feat(dashboard): mount rebuilt assistant tab`; Pre-commit: `pnpm --dir dashboard test && pnpm lint`.

- [x] 14. Docs update (AGENTS.md + README admin table; remove interpret-request)

  **What to do**:
  - Update the README admin-endpoint table: ensure the `interpret-request` row is GONE (also covered by T6) and the `propose-edit` row's description reflects the new transcript-driven, clarify-or-propose behavior.
  - Update AGENTS.md where the AI Assistant tab is described (the `/dashboard/employees/:id?tab=assistant` paragraph): describe the single-input chat-first clarify-then-act flow, the `kind: question|proposal|no_change|too_long` contract, the client-held transcript (server stateless), the 5-question backstop, and that `interpret-request` was retired. Note the shared `mapArchetypeRowToConfig`/`validateProposalFields` helpers under the appropriate convention/section.
  - Run `date "+%Y-%m-%d-%H%M"` if any NEW doc file is created (none expected; edits only).

  **Must NOT do**:
  - Do NOT add volatile counts/line-numbers (Documentation Durability rule).
  - Do NOT create a new doc file unless necessary.

  **Recommended Agent Profile**:
  - **Category**: `writing` — docs only.
  - **Skills**: [`writing-guidelines`].

  **Parallelization**: Can Run In Parallel: NO · Wave 4 · Blocks: Final Wave · Blocked By: 6, 13.

  **References**:
  - `README.md` admin endpoint table; `AGENTS.md` "AI Assistant tab" paragraph + Key Conventions.
  - WHY: Documentation Freshness rule — endpoint + behavior changed; docs must match.

  **Acceptance Criteria**:
  - [ ] `grep -rn "interpret-request" README.md AGENTS.md` → no matches; `propose-edit` description updated; AGENTS.md describes the new flow.

  **QA Scenarios**:

  ```
  Scenario: docs reflect new flow (happy path)
    Tool: Bash (grep)
    Steps:
      1. grep -rn "interpret-request" README.md AGENTS.md -> none
      2. grep -n "transcript\|clarify\|single-input\|propose-edit" AGENTS.md README.md -> present
    Evidence: .sisyphus/evidence/task-14-docs.txt
  ```

  **Commit**: YES — `docs: update assistant-tab flow and retire interpret-request from docs`; Pre-commit: `pnpm lint`.

- [x] 15. **Notify completion** — Send Telegram: plan complete, all tasks done, come back to review. `tsx scripts/telegram-notify.ts "✅ Chat-first AI Assistant redesign complete — all tasks done, final wave passed. Come back to review."`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never mark F1-F4 checked before the user's okay.

- [x] F1. **Plan compliance audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists (read file / curl / psql). For each "Must NOT Have": grep the codebase for the forbidden pattern — reject with file:line if found (esp. any second input box, any `interpret-request` reference, any new DB table/migration, any edit to disallowed fields). Confirm evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code quality review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test:unit` + `pnpm --dir dashboard test`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, dead code (orphaned `onRefineSubmit`/`showRefine`/`interpretRequest`), unused imports, AI slop (over-abstraction, generic names). Confirm the union discriminant is type-safe end-to-end.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real manual QA** — `unspecified-high` (+ `playwright`/`e2e-testing` skills)
      Live browser on `localhost:7700/dashboard/employees/<real-estate-motivation-bot-2 id>?tab=assistant`. Execute EVERY QA scenario. MUST include: (a) an ambiguous request → assert a question bubble + answer in the SAME box → proposal card with Approve/Deny only and NO refine textarea in the DOM; (b) Approve a prose edit → trigger the employee → psql-assert the new task's `compiled_agents_md` contains the approved text. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Question-turn [PASS/FAIL] | Approve-no-op [PASS/FAIL] | VERDICT`

- [x] F4. **Scope fidelity check** — `deep`
      For each task: read "What to do", read the actual diff (git). Verify 1:1 — everything specified built, nothing beyond spec (esp. NO atomic apply endpoint, NO session store, NO new editable fields, NO new DB table). Confirm allowlist/approval-off/edit-history invariants survived. Detect cross-task contamination + unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

- [x] F5. **E2E prerequisites** — Confirm services live: `curl localhost:7700/health`, `curl localhost:8288/health`, gateway stable (`pgrep -f "src/gateway/server.ts" | wc -l` ≤ 2), Docker worker image built.

---

## Commit Strategy

One commit per task (messages in each task's **Commit** block). Conventional Commits. Never `--no-verify`. No AI/Co-authored-by references.

## Success Criteria

### Verification Commands

```bash
pnpm build && pnpm lint            # clean
pnpm test:unit                     # gateway unit suite passes
pnpm --dir dashboard test          # dashboard suite passes
grep -rn "interpret-request\|interpretRequest" src/ dashboard/src/ README.md  # expect: no matches
grep -rn "onRefineSubmit\|showRefine" dashboard/src/  # expect: no matches
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass; build + lint clean
- [ ] Real question-turn + Approve-no-op E2E proven with evidence
- [ ] Docs (AGENTS.md + README) updated
