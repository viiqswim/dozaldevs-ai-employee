# Employee Creation: role_name Fix + Intent-Level Prompt Steps

## TL;DR

> **Quick Summary**: Fix the wizard draft-save bug where `role_name` arrives empty (Zod rejects the blank kebab-slug), then — gated behind a feasibility spike — abstract generated `execution_steps`/`delivery_steps`/`instructions` from literal `tsx /tools/...` CLI invocations into intent-level plain English, relying on the worker's always-on runtime skills to supply exact commands.
>
> **Deliverables**:
>
> - **(Ships first, standalone)** role_name auto-derive: CREATE-aware prompt + transcript-derived `postProcess` fallback + guaranteed non-empty slug; editable pre-filled UI field; draft-save returns 201.
> - **(Gated by spike)** Generator prompt rewrite to intent-level steps for the GENERATE + create-converse paths, preserving `$ENV` placeholders, `tool_registry` real paths, and a defined submit-output "intent closer".
> - Live deepseek-v4-flash E2E: generate → save draft → trigger → task `Done` with verified Slack delivery + non-empty `--draft-file` handoff.
> - Unit/regression/component tests; AGENTS.md doc update.
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves (Wave 0 spike gate, Wave 1 role_name standalone, Wave 2 abstraction, Wave 3 tests, Wave 4 live E2E)
> **Critical Path**: T1 → T2 → T3 (role_name ships) ‖ T4 spike → T5 → T6 → T7 → T11 E2E → F1–F4 → user okay

---

## Context

### Original Request

User tried to create an AI employee in the wizard. Two problems:

1. **Bug**: Saving the draft POSTs to `/admin/tenants/:tenantId/archetypes` with `role_name:""`, which fails Zod (`role_name must be kebab-case slug`, pattern `/^[a-z0-9]+(-[a-z0-9]+)*$/`, min 2). The converse-create proposal had identity/execution_steps/overview all populated — only role_name was empty.
2. **Design request**: Abstract technical mechanics out of `execution_steps`/`delivery_steps`. The user wants intent-level plain English ("post to Slack") and lets the runtime skills supply the exact `tsx /tools/...` commands under the hood, so the end user never sees CLI details.

### Interview Summary

**Confirmed user decisions**:

1. role_name = **auto-derive a kebab slug AND surface an editable pre-filled field** (field already exists in `WizardEditStep.tsx`).
2. Abstraction scope = **execution_steps + delivery_steps + instructions** (all three model-authored prompt fields).
3. Existing archetypes = **new employees only**; leave existing untouched (zero migration).
4. Verification = **live E2E with deepseek/deepseek-v4-flash, full lifecycle to delivery** — prove the abstracted employee still reads Slack + submits output using only skills.

**Research Findings (code-verified)**:

- **role_name root cause (TWO independent causes)**:
  - `CONVERSE_SYSTEM_PROMPT_PRE` (`src/gateway/services/prompts/archetype-generator-prompts.ts:344`) FORBIDS the model changing `role_name`. Correct for EDIT, wrong for CREATE (converse-create reuses the same method with empty baseline).
  - `converse()` (`src/gateway/services/archetype-generator.ts:913`) passes `currentConfig.role_name` (=`''`) as the `postProcess` derivation source — NOT the user's transcript. So even fixing the prompt leaves the fallback deriving from `''`. The user's description lives in `transcriptText` (~`:862`).
  - `buildEmptyBaseline()` (`src/gateway/routes/admin-archetype-converse-create.ts:46`) sets `role_name:''`. `applyCreateAllowlist()` (`:79`) strips `'' || undefined` → undefined. UI initializes `editedFields.role_name=''` (`CreateEmployeePage.tsx:66`).
  - Editable field exists: `WizardEditStep.tsx:80-83`. Zod: `CreateArchetypeBodySchema` (`src/gateway/routes/admin-archetypes.ts:79-84`).
  - `generate()` path is NOT broken — `SYSTEM_PROMPT_PRE:78` already instructs slug derivation.
- **Intent-level steps are safe/aligned**:
  - Worker initial prompt = `EXECUTION_PROMPT` ("Follow the instructions in <execution-instructions>") (`src/lib/output-contract-constants.ts:16`) — decoupled from step CONTENT.
  - `execution_steps`/`delivery_steps` → AGENTS.md `<execution-instructions>`/`<delivery-instructions>` blocks (`src/workers/lib/agents-md-compiler.mts:230-297`). `instructions` = alias of execution_steps (`archetype-generator.ts:366`). `overview` = dashboard-only.
  - `CRITICAL_DIRECTIVE` (`agents-md-compiler.mts:196-197`) already forces "EXECUTE, don't describe."
  - `tool-usage-reference` skill (always-on) supplies exact CLI at runtime. No doc/test says intent-level prose breaks tool calling; only MODEL capability does.
  - HARD CONSTRAINT: final execution step must still cause `submit-output.ts --draft-file ...` (the draft→delivery handoff). Delivery has a harness fallback (`delivery-phase.mts:170`) + `summary.txt` gate (`:217-227`), but the EXECUTION closer carrying `--draft-file` is load-bearing.
  - Generator-prompt CLI sections: "execution_steps Runtime Patterns (MANDATORY)" lines 115-157; Composio invocation `buildConnectedAppsBlock` lines 29-35; code-employee block 161-180; delivery templates 207-238; `REFINE_SYSTEM_PROMPT_PRE:309` + `CONVERSE_SYSTEM_PROMPT_PRE:347` echoes.

### Metis Review

**Gaps addressed (incorporated below)**:

- **Two-cause bug**: plan does BOTH Fix A (conditional forbid) + Fix B (transcript-derived postProcess) + a guaranteed non-empty fallback. (Task 1, 2)
- **Shared CREATE/EDIT prompt**: do NOT delete the forbid-line; suppress it only when baseline `role_name` is empty via a runtime `isCreate`/empty-baseline flag. (Task 1)
- **Wave 0 feasibility spike**: hand-author intent-level steps for the smoke-test employee, trigger on deepseek BEFORE rewriting any prompt; if `--draft-file` handoff/tool-bridging fails, Wave 2 is cancelled. (Task 4 — gates Wave 2)
- **Decouple waves**: role_name (T1–T3) ships independently of the abstraction experiment. (Commit strategy)
- **Preserve `$ENV` + `tool_registry` paths**: abstract ONLY `tsx /tools/...` prose; keep `$SOURCE_CHANNELS`/`$NOTIFICATION_CHANNEL`/`$PUBLISH_CHANNEL` and real tool paths. (Task 5, 6)
- **Define the "intent closer" artifact**: an exact English closer phrase the generator always appends to execution_steps that maps to submit-output-with-draft. (Task 4 defines it, Task 5 enforces it)
- **Reconcile "leave existing untouched"**: abstraction applies to GENERATE + create-converse (empty baseline) ONLY. `refine()` and edit-converse on existing archetypes are NOT abstracted. (Task 5 guardrail)
- **Exclude code-employee block** (git/gh procedural steps) from abstraction unless github skill coverage is verified. (Task 5 — explicit exclusion)
- **Skill draft-file convention check**: verify `tool-usage-reference` documents the draft→delivery handoff; if absent, ADD it to the skill (knowledge moved, not deleted). (Task 4)
- **role_name uniqueness/collisions**: pre-existing latent concern — DOCUMENT, do NOT fix here. (Future Work)

---

## Work Objectives

### Core Objective

(1) Make wizard draft-save succeed by guaranteeing a valid kebab `role_name` (model-generated when possible, transcript-derived as backstop, always non-empty), with an editable pre-filled field. (2) IF a feasibility spike proves it works, abstract generated step prose to intent-level so end users never see `tsx /tools/...` CLI — while preserving env-var placeholders, real tool paths, and the submit-output draft-file handoff.

### Concrete Deliverables

- Modified `src/gateway/services/prompts/archetype-generator-prompts.ts`, `src/gateway/services/archetype-generator.ts`, `src/gateway/routes/admin-archetype-converse-create.ts`
- Possibly modified `src/workers/skills/tool-usage-reference/SKILL.md` (if draft-file convention absent)
- Unit/regression/component tests; live E2E evidence; AGENTS.md doc note

### Definition of Done

- [ ] CREATE proposal returns `role_name` matching `/^[a-z0-9]+(-[a-z0-9]+)*$/` (length 2-60), even when the model omits it
- [ ] Draft-save POST returns 201 (the original failing flow now succeeds)
- [ ] EDIT guardrail intact: converse on an existing archetype never renames role_name
- [ ] (If spike passes) Generated execution_steps contain NO `tsx /tools/` but DO retain `$ENV` placeholders + a submit-output intent closer; `tool_registry.tools` retains real paths
- [ ] Live deepseek-flash E2E: generate → save → trigger → `Done` with Slack delivery + non-empty `--draft-file`

### Must Have

- role_name Fix A (conditional forbid) + Fix B (transcript-derived postProcess) + guaranteed non-empty fallback
- Editable pre-filled role_name field (already exists — ensure it receives the derived slug)
- Wave 0 spike gate before any prompt rewrite
- Defined "submit-output intent closer" artifact
- Preserved `$ENV` placeholders + `tool_registry` real paths + `--draft-file` handoff
- Live E2E to `Done` with verified delivery

### Must NOT Have (Guardrails)

- NO deletion of the role_name forbid-line from the EDIT path — suppress ONLY when baseline role_name is empty
- NO changes to `generate()` slug logic (`SYSTEM_PROMPT_PRE:78`) — read-only reference
- NO modification of `EXECUTION_PROMPT` / `output-contract-constants.ts`
- NO removal of `postProcess()` tool-path normalization (strip tsx / add `/tools/` prefix / `.ts` suffix / cron→scheduled) — it's the `tool_registry` safety net
- NO changes to `agents-md-compiler.mts` scaffolding (`CRITICAL_DIRECTIVE`, `<execution-instructions>`/`<delivery-instructions>` wrapping) or harness delivery fallback / `summary.txt` gate
- NO dropping of `$SOURCE_CHANNELS`/`$NOTIFICATION_CHANNEL`/`$PUBLISH_CHANNEL` env placeholders
- NO abstraction of `refine()` or edit-converse on EXISTING archetypes (reconcile with "leave existing untouched")
- NO abstraction of the code-employee git/gh block unless github-skill coverage is verified (excluded by default)
- NO mutation of existing archetype DB rows
- NO role_name uniqueness constraint added here (document only)
- NO automatic model fallback; NO wizard UI "improvements" beyond the existing role_name field
- NO marking Wave 2 done on "output looks intent-level" — only on a triggered task reaching `Done` with verified delivery

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest: `pnpm test:unit`, `pnpm test:integration`)
- **Automated tests**: YES (TDD — RED → GREEN → REFACTOR)
- **Framework**: vitest

### QA Policy

Every task includes agent-executed QA scenarios. Evidence → `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Backend/generator**: vitest unit tests (mocked `callLLMFn`) + live `curl` against gateway + `jq` assertions
- **DB/trace**: psql against `archetypes` / `task_status_log`
- **Worker E2E**: trigger task, watch container, verify Slack delivery + delivered draft content
- **Dashboard**: component tests + Playwright for the wizard field

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — role_name fix, INDEPENDENTLY MERGEABLE):
├── Task 1: CREATE-aware role_name prompt (conditional forbid) [deep]
├── Task 2: Transcript-derived postProcess + guaranteed non-empty fallback [deep]
└── Task 3: Wizard pre-fill + save-draft regression (component + live curl) [unspecified-high]

Wave 0/2-GATE (Parallel with Wave 1 — feasibility spike; GATES Wave 2):
└── Task 4: Intent-level feasibility spike on deepseek-flash + define intent closer [unspecified-high]

Wave 2 (ONLY IF Task 4 spike PASSES — abstraction):
├── Task 5: Generator-prompt rewrite to intent-level (generate + create-converse) [deep]
└── Task 6: Preserve-and-assert harness (env placeholders, tool_registry, closer) [unspecified-high]

Wave 3 (After Wave 2 — tests):
├── Task 7: Unit/regression tests for abstracted generation [unspecified-high]
└── Task 8: Boundary tests (edit/refine NOT abstracted; code-employee excluded) [unspecified-high]

Wave 4 (After Wave 3 — live E2E + docs):
├── Task 9: Live generate→save→trigger→Done E2E on deepseek-flash [unspecified-high]
└── Task 10: AGENTS.md + skill doc updates [writing]

Wave FINAL (after ALL — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA + live E2E (unspecified-high)
└── F4: Scope fidelity + reuse/boundary audit (deep)
-> Present results -> user okay -> Notify

Critical Path: T1 → T2 → T3 (role_name ships) ‖ T4 → T5 → T6 → T7 → T9 → F1-F4 → user okay
GATE: If Task 4 spike FAILS, Tasks 5-9 are CANCELLED; ship only Wave 1 + document the negative result.
```

### Dependency Matrix

- **1**: deps none → unblock 2,3,5
- **2**: deps 1 → unblock 3,5
- **3**: deps 1,2 → ships role_name (independent merge)
- **4 (SPIKE/GATE)**: deps none → unblock 5 (PASS) or cancel 5-9 (FAIL)
- **5**: deps 1,2,4(PASS) → unblock 6,7
- **6**: deps 5 → unblock 7
- **7**: deps 5,6 → unblock 9
- **8**: deps 5 → unblock 9
- **9**: deps 7,8 → unblock 10
- **10**: deps 9 → unblock FINAL

### Agent Dispatch Summary

- **Wave 1 (3)**: T1 deep, T2 deep, T3 unspecified-high
- **Spike (1)**: T4 unspecified-high
- **Wave 2 (2)**: T5 deep, T6 unspecified-high
- **Wave 3 (2)**: T7 unspecified-high, T8 unspecified-high
- **Wave 4 (2)**: T9 unspecified-high, T10 writing
- **FINAL (4)**: F1 oracle, F2 unspecified-high, F3 unspecified-high, F4 deep

---

## TODOs

- [x] 1. CREATE-aware role_name prompt (conditional forbid, do NOT break EDIT)

  **What to do**:
  - In `src/gateway/services/prompts/archetype-generator-prompts.ts`, the `CONVERSE_SYSTEM_PROMPT_PRE` (forbid line ~344: "Politely decline...to change: model, temperature, role_name, vm_size...") must NOT forbid `role_name` when the conversation is a CREATE (empty baseline). Implement a baseline-aware prompt: pass an `isCreate` (or `baselineHasRoleName`) flag from the converse builder so the forbid-line includes `role_name` ONLY when an existing role_name is present. When CREATE, the prompt must instead INSTRUCT the model to emit a kebab-case slug derived from the role/description (mirror `SYSTEM_PROMPT_PRE:78` wording — read-only reference, do not edit that line).
  - Thread the flag from the converse caller: `archetype-generator.ts` `converse()` already receives `currentConfig`; derive `isCreate = !currentConfig.role_name` and pass it into the system-prompt builder.
  - RED first: unit test asserting (a) with empty baseline, the built converse system prompt does NOT contain the role_name-forbid clause and DOES contain a slug-generation instruction; (b) with non-empty baseline, the forbid clause IS present.

  **Must NOT do**: Do NOT delete the forbid-line outright. Do NOT touch `generate()`'s `SYSTEM_PROMPT_PRE:78`. Do NOT change `REFINE_SYSTEM_PROMPT_PRE` (refine operates on existing configs — forbid stays).

  **Recommended Agent Profile**:
  - **Category**: `deep` — shared CREATE/EDIT prompt with a subtle baseline-conditional branch.
  - **Skills**: [`api-design`]

  **Parallelization**: Can Run In Parallel: YES | Wave 1 | Blocks: 2,3,5 | Blocked By: None

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:344` (CONVERSE forbid line), `:78` (generate slug instruction — copy wording), `:347` (converse echo), `:309` (refine — leave unchanged).
  - `src/gateway/services/archetype-generator.ts:~852-913` (`converse()` — where `currentConfig` and the system-prompt builder are called; derive isCreate here).
  - `src/gateway/routes/admin-archetype-converse-create.ts:46` (`buildEmptyBaseline` — confirms baseline role_name is `''`).
  - `tests/unit/gateway/services/archetype-generator-converse.test.ts` — existing converse test patterns.

  **Acceptance Criteria**:

  ```
  Scenario: empty baseline drops the role_name forbid and adds slug instruction
    Tool: Bash (vitest)
    Steps:
      1. Build converse system prompt with currentConfig.role_name=''
      2. Assert prompt does NOT contain the role_name forbid clause
      3. Assert prompt DOES contain a kebab-slug generation instruction
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-1-create-prompt.txt

  Scenario: non-empty baseline keeps the EDIT forbid (guardrail)
    Tool: Bash (vitest)
    Steps:
      1. Build converse system prompt with currentConfig.role_name='existing-bot'
      2. Assert prompt CONTAINS the role_name forbid clause
    Expected Result: pass; EDIT guardrail intact
    Evidence: .sisyphus/evidence/task-1-edit-guardrail.txt
  ```

  **Commit**: groups with Wave 1

- [x] 2. Transcript-derived postProcess + guaranteed non-empty role_name fallback

  **What to do**:
  - In `src/gateway/services/archetype-generator.ts`, `converse()` (~line 913) currently calls `postProcess(parsed.config, currentConfig.role_name)`. When CREATE (empty baseline), pass the user's actual description — derived from the transcript (use `transcriptText` / the first or concatenated user message, ~`:862`) — as the `description` derivation source instead of the empty `currentConfig.role_name`. This is **Fix B**: the guaranteed backstop so even when the model omits role_name, `postProcess` derives a slug from real text.
  - In `postProcess` (~lines 429-433), harden the fallback so the result is NEVER empty: if `toKebabCase(description...)` yields `''` (empty/whitespace/non-ASCII/emoji description), fall back to a deterministic non-empty slug (e.g. `employee-<short timestamp>`), so the Zod min(2)/regex can never reject.
  - RED first: (a) model omits role_name + non-empty transcript → derived non-empty kebab slug; (b) model omits role_name + empty/emoji transcript → deterministic fallback slug, still matches regex & min(2); (c) model emits a good role_name → kebab-normalized model value used (not overridden).

  **Must NOT do**: Do NOT remove the existing tool-path/trigger normalization in `postProcess` (keep the safety net). Do NOT change EDIT behavior (non-empty baseline still passes its own role_name through).

  **Recommended Agent Profile**:
  - **Category**: `deep` — derivation-source plumbing + fallback hardening with edge cases.
  - **Skills**: []

  **Parallelization**: Can Run In Parallel: NO (after T1) | Wave 1 | Blocks: 3,5 | Blocked By: 1

  **References**:
  - `src/gateway/services/archetype-generator.ts:913` (postProcess call site), `:429-433` (fallback derivation), `:~862` (`transcriptText`), `:366` (`instructions = execution_steps` alias).
  - `toKebabCase` definition (same file or a lib util — find via reference).
  - `src/gateway/routes/admin-archetypes.ts:79-84` (Zod target: regex + min(2) + max(60)).

  **Acceptance Criteria**:

  ```
  Scenario: model omits role_name, transcript present → derived slug
    Tool: Bash (vitest)
    Steps:
      1. Mock converse LLM returning a proposal WITHOUT role_name; transcript user msg "post a daily standup summary to slack"
      2. Assert result.role_name is non-empty and matches /^[a-z0-9]+(-[a-z0-9]+)*$/ and length>=2
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-2-derive.txt

  Scenario: empty/emoji transcript → deterministic non-empty fallback
    Tool: Bash (vitest)
    Steps:
      1. Mock omit role_name; transcript content is whitespace/emoji only
      2. Assert result.role_name matches regex and length>=2 (deterministic fallback)
    Expected Result: pass; never empty
    Evidence: .sisyphus/evidence/task-2-fallback.txt

  Scenario: model emits good slug → preserved (kebab-normalized)
    Tool: Bash (vitest)
    Steps:
      1. Mock proposal with role_name "Daily Standup Bot"
      2. Assert result.role_name === "daily-standup-bot"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-2-preserve.txt
  ```

  **Commit**: groups with Wave 1

- [x] 3. Wizard pre-fill + save-draft regression (component + live curl)

  **What to do**:
  - Confirm the proposal's `role_name` now flows into the wizard: `admin-archetype-converse-create.ts` `applyCreateAllowlist()` (~:79) currently does `raw.role_name || undefined` — ensure a now-populated slug is passed through (not stripped). The UI mapping `CreateEmployeePage.tsx:66` (`role_name: String(merged.role_name ?? '')`) and the editable field `WizardEditStep.tsx:80-83` already exist; verify they receive the derived slug.
  - RED first (component): mock converse-create → proposal with `role_name:'daily-standup-bot'`; assert `WizardEditStep` renders the input pre-filled with that slug (not empty).
  - Live regression: curl converse-create with the originally-failing-style clear description, take the returned proposal, POST it to `/archetypes`, assert HTTP 201 (the exact bug is gone).

  **Must NOT do**: Do NOT add new validation UX, live-slug-preview, or uniqueness checks (scope-creep guardrail). Do NOT change the field component beyond confirming pre-fill.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — spans route allowlist + React component + live curl.
  - **Skills**: [`react-dashboard`, `employee-creation-debugging`]

  **Parallelization**: Can Run In Parallel: NO (after T1,T2) | Wave 1 | Blocks: none (ships) | Blocked By: 1,2

  **References**:
  - `src/gateway/routes/admin-archetype-converse-create.ts:79` (`applyCreateAllowlist` role_name pass-through).
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx:56-78` (proposal merge), `:128` (save-draft POST body).
  - `dashboard/src/panels/employees/components/WizardEditStep.tsx:80-83` (role_name input).
  - `src/gateway/routes/admin-archetypes.ts:79-84` (Zod schema).

  **Acceptance Criteria**:

  ```
  Scenario: wizard pre-fills derived role_name (component)
    Tool: Bash (vitest component)
    Steps:
      1. Mock converseCreate → proposal{role_name:'daily-standup-bot', ...}
      2. Render wizard through to edit step
      3. Assert role_name input value === 'daily-standup-bot' (NOT empty)
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-3-prefill.txt

  Scenario: original failing flow now saves (live)
    Tool: Bash (curl + jq)
    Preconditions: pnpm dev running; SERVICE_TOKEN sourced
    Steps:
      1. curl converse-create -d transcript "reads all of our slack channels and provides an executive summary"
      2. Extract proposal; POST it to /archetypes
      3. Assert HTTP 201 (not 400 Zod rejection)
    Expected Result: draft created
    Evidence: .sisyphus/evidence/task-3-save-201.txt
  ```

  **Commit**: `fix(wizard): derive non-empty role_name slug on create-converse path` (Wave 1 ships standalone)

- [x] 4. Intent-level feasibility spike on deepseek-flash + define the intent closer (GATE)

  **What to do**:
  - **This task gates Wave 2.** Do NOT rewrite any generator prompt yet. Instead, HAND-AUTHOR intent-level `execution_steps` + `delivery_steps` for the recommended smoke-test employee (`real-estate-motivation-bot-2`, per feature-verification skill) OR a minimal Slack-summary archetype: plain English ("Read recent messages from the channels in `$SOURCE_CHANNELS`. Write an executive summary. Submit your completed summary for review."), preserving `$ENV` placeholders, NO `tsx /tools/...`.
  - Inject directly into a DB archetype row (bypass the generator), set model to `deepseek/deepseek-v4-flash`, trigger a real task, and watch the worker.
  - **Assert the load-bearing behaviors**: (a) the worker actually calls the Slack read tool (via the runtime skill, not the prompt); (b) the FINAL step results in a `submit-output.ts` call that includes `--draft-file` with NON-EMPTY content; (c) the task reaches `Done` with a real Slack delivery.
  - **Verify the draft-file convention is documented**: grep `src/workers/skills/tool-usage-reference/SKILL.md` for the execution→delivery `--draft-file` handoff. If ABSENT, the knowledge currently lives ONLY in the CLI prompt you intend to delete — record this as a required Task 5 addition (add the convention to the skill, do not just delete it from the prompt).
  - **Define the exact "intent closer"**: the precise English sentence the generator will always append to execution_steps that reliably triggers submit-output-with-draft (e.g. "Finally, submit your completed work for review so it can be delivered."). Record the chosen wording in the notepad — Task 5 enforces it.
  - **GATE DECISION**: If the spike task reaches `Done` with verified Slack delivery + non-empty `--draft-file` → Wave 2 PROCEEDS. If it fails (text-only response, empty draft, no tool call) → Wave 2 is CANCELLED; document the negative result; only Wave 1 ships.

  **Must NOT do**: Do NOT mock the LLM. Do NOT edit generator prompts in this task. Do NOT use a model other than deepseek-v4-flash for the gate (per confirmed decision).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — live worker spike + DB injection + verdict.
  - **Skills**: [`employee-creation-debugging`, `feature-verification`, `e2e-testing`, `long-running-commands`]

  **Parallelization**: Can Run In Parallel: YES (with Wave 1) | Spike/Gate | Blocks: 5 (PASS) or cancels 5-9 (FAIL) | Blocked By: None

  **References**:
  - `.opencode/skills/feature-verification/SKILL.md` — smoke-test employee + PostgREST-vs-psql.
  - `.opencode/skills/employee-creation-debugging/SKILL.md` §2 — trigger + draft verification.
  - `src/lib/output-contract-constants.ts:16` (EXECUTION_PROMPT), `src/workers/lib/delivery-phase.mts:170` (delivery fallback), `:217-227` (summary.txt gate).
  - `src/workers/skills/tool-usage-reference/SKILL.md` — grep for `--draft-file` handoff convention.
  - AGENTS.md "Post-Implementation E2E Testing (MANDATORY)" + deepseek-flash reliability note.

  **Acceptance Criteria**:

  ```
  Scenario: hand-authored intent-level employee reaches Done with delivery
    Tool: Bash (psql + container watch) + long-running-commands
    Preconditions: pnpm dev running; docker image built; archetype injected with intent-level steps + deepseek-v4-flash
    Steps:
      1. Trigger the task; poll task_status_log until terminal
      2. Assert status reaches 'Done' (not Failed/text-only)
      3. Assert worker called the Slack read tool (grep container/task log)
      4. Assert submit-output called with --draft-file and the delivered draft is NON-EMPTY (Slack message present)
    Expected Result: Done + delivery; GATE = PASS
    Evidence: .sisyphus/evidence/task-4-spike-trace.txt, task-4-spike-delivery.txt

  Scenario: draft-file convention documented in skill
    Tool: Bash (grep)
    Steps:
      1. grep tool-usage-reference SKILL.md for the --draft-file execution→delivery handoff
      2. Record PRESENT/ABSENT (ABSENT → Task 5 must add it)
    Expected Result: documented finding recorded
    Evidence: .sisyphus/evidence/task-4-skill-draftfile.txt
  ```

  **Commit**: NO (spike — verification + notepad only)

- [x] 5. Generator-prompt rewrite to intent-level (generate + create-converse ONLY)

  **What to do** (ONLY IF Task 4 spike PASSED):
  - Rewrite the CLI-mandating sections of the generator prompts so `execution_steps`/`delivery_steps`/`instructions` are intent-level plain English with NO `tsx /tools/...` invocations: `archetype-generator-prompts.ts` "execution_steps Runtime Patterns (MANDATORY)" (~115-157), Composio invocation in `buildConnectedAppsBlock` (~29-35), delivery templates (~207-238).
  - **Preserve**: `$SOURCE_CHANNELS`/`$NOTIFICATION_CHANNEL`/`$PUBLISH_CHANNEL` env placeholders (NOT CLI — runtime indirection); the submit-output **intent closer** defined in Task 4 (always appended to execution_steps); the instruction to populate `tool_registry.tools` with REAL paths (those stay file paths, validated against `ALL_TOOL_DESCRIPTORS`).
  - If Task 4 found the `--draft-file` convention undocumented, ADD it to `src/workers/skills/tool-usage-reference/SKILL.md` (knowledge moves to the skill, not deleted).
  - Apply to the GENERATE path (`SYSTEM_PROMPT_PRE`) and the CREATE branch of converse (empty baseline). Do NOT abstract `REFINE_SYSTEM_PROMPT_PRE` or the EDIT branch of converse (existing archetypes stay untouched). EXCLUDE the code-employee block (~161-180, git/gh) unless github-skill clone→PR coverage is verified.
  - RED first: generated execution_steps for a Slack-summary description contains NO `tsx /tools/`, DOES contain `$NOTIFICATION_CHANNEL`, DOES contain the intent closer; `tool_registry.tools` includes `/tools/platform/submit-output.ts`.

  **Must NOT do**: Do NOT abstract refine/edit/existing paths. Do NOT remove `$ENV` placeholders or `tool_registry` real paths. Do NOT touch `EXECUTION_PROMPT`/compiler scaffolding. Do NOT abstract the code-employee block by default.

  **Recommended Agent Profile**:
  - **Category**: `deep` — multi-section prompt engineering with strict preserve-list.
  - **Skills**: [`api-design`, `creating-archetypes`]

  **Parallelization**: NO | Wave 2 | Blocks: 6,7 | Blocked By: 1,2,4(PASS)

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:115-157,29-35,207-238,161-180,309,347` (sections to rewrite / preserve / exclude).
  - `src/gateway/services/archetype-generator.ts:358-433` (`postProcess` — tool_registry normalization stays).
  - `src/lib/tool-registry.ts` (`ALL_TOOL_DESCRIPTORS` — tool_registry validation target).
  - Task 4 notepad — the exact intent-closer wording.

  **Acceptance Criteria**:

  ```
  Scenario: generated steps are intent-level but preserve env + closer + tool paths
    Tool: Bash (vitest)
    Steps:
      1. Mock generate for "summarize #support daily into #support-digest"
      2. Assert execution_steps does NOT match /tsx \/tools\//
      3. Assert execution_steps matches /\$NOTIFICATION_CHANNEL/
      4. Assert execution_steps contains the defined intent closer
      5. Assert tool_registry.tools includes '/tools/platform/submit-output.ts'
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-5-intent-steps.txt
  ```

  **Commit**: groups with Wave 2-3

- [x] 6. Preserve-and-assert harness (env placeholders, tool_registry, closer)

  **What to do** (ONLY IF Task 4 spike PASSED):
  - Add a focused regression guard so future prompt edits cannot silently re-introduce CLI or drop the preserved elements. A test (or `postProcess` assertion) that, for generate-path output, fails if: execution_steps contains `tsx /tools/`, OR a Slack-delivery step lacks the relevant `$ENV` placeholder, OR the submit-output intent closer is absent, OR `tool_registry.tools` lost `/tools/platform/submit-output.ts`.
  - Confirm `delivery_steps=null` employees are unaffected (no closer injected into a null field).
  - RED first: each guard fails on a deliberately-bad fixture and passes on a good one.

  **Must NOT do**: Do NOT enforce these guards on the refine/edit/existing paths (only generate + create-converse). Do NOT inject a closer into null delivery_steps.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — regression-guard test design across edge cases.
  - **Skills**: []

  **Parallelization**: NO (after T5) | Wave 2 | Blocks: 7 | Blocked By: 5

  **References**:
  - `src/gateway/services/archetype-generator.ts:358-433` (postProcess), `:248-258`-equivalent null-handling in `agents-md-compiler.mts` for delivery.
  - Task 5 output for the canonical good fixture.

  **Acceptance Criteria**:

  ```
  Scenario: guard catches re-introduced CLI / dropped placeholders
    Tool: Bash (vitest)
    Steps:
      1. Feed a bad fixture (contains tsx /tools/ OR missing $ENV OR missing closer)
      2. Assert the guard FAILS
      3. Feed the Task 5 good fixture; assert guard PASSES
    Expected Result: pass/fail as expected
    Evidence: .sisyphus/evidence/task-6-guard.txt

  Scenario: null delivery_steps untouched
    Tool: Bash (vitest)
    Steps:
      1. Generate a NO_ACTION_NEEDED employee with delivery_steps null
      2. Assert no closer injected; delivery_steps stays null
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-6-null-delivery.txt
  ```

  **Commit**: groups with Wave 2-3

- [ ] 7. Unit/regression tests for abstracted generation

  **What to do** (ONLY IF Task 4 spike PASSED):
  - Broaden coverage beyond the single fixture: parametrized tests across several intent descriptions (Slack summary, Notion/Composio job, knowledge-base lookup) asserting intent-level output + preserved env/closer/tool_registry. Include a Composio case asserting the abstracted prose still results in `tool_registry` listing the composio tool and the per-app skill being the resolution path (no `--toolkit/--action` CLI in prose).
  - Confirm the `instructions` alias (`archetype-generator.ts:366`) is also intent-level (it mirrors execution_steps) and no consumer expects CLI in `instructions`.

  **Must NOT do**: Do NOT assert behavior on refine/edit paths. Do NOT require composio action-slug correctness from the model (skill resolves it) — only that prose is intent-level and tool_registry is correct.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — parametrized cross-domain test coverage.
  - **Skills**: []

  **Parallelization**: NO (after T5,T6) | Wave 3 | Blocks: 9 | Blocked By: 5,6

  **References**:
  - `src/gateway/services/archetype-generator.ts:366` (instructions alias).
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:29-35` (Composio block — abstracted).
  - Existing `tests/unit/gateway/services/archetype-generator-*.test.ts` patterns.

  **Acceptance Criteria**:

  ```
  Scenario: cross-domain intent-level generation
    Tool: Bash (vitest)
    Steps:
      1. Parametrize 3 descriptions (slack/composio/kb)
      2. For each: assert no 'tsx /tools/' in execution_steps, env placeholder present where relevant, closer present, tool_registry has real paths
    Expected Result: all pass
    Evidence: .sisyphus/evidence/task-7-cross-domain.txt
  ```

  **Commit**: groups with Wave 2-3

- [ ] 8. Boundary tests (edit/refine NOT abstracted; code-employee excluded)

  **What to do** (ONLY IF Task 4 spike PASSED):
  - Lock the boundary: tests asserting that (a) `refine()` on an existing CLI-style config does NOT rewrite its steps to intent-level (existing untouched); (b) the EDIT branch of converse (non-empty baseline) does NOT abstract steps; (c) a code-writing employee description still yields procedural git/gh steps (excluded from abstraction) OR is explicitly carved out.
  - These guard the "leave existing untouched" decision and the code-employee exclusion against future drift.

  **Must NOT do**: Do NOT change refine/edit behavior to MAKE these pass — they should already hold from Task 5's scoped change. If they fail, Task 5 over-reached; reject Task 5.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — boundary/guardrail test design.
  - **Skills**: []

  **Parallelization**: YES (with T7) | Wave 3 | Blocks: 9 | Blocked By: 5

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:309` (refine — unchanged), `:161-180` (code-employee — excluded).
  - `src/gateway/services/archetype-generator.ts` `refine()` + converse EDIT branch.

  **Acceptance Criteria**:

  ```
  Scenario: refine on existing config keeps CLI-style steps
    Tool: Bash (vitest)
    Steps:
      1. refine() an existing config whose execution_steps contain tsx /tools/
      2. Assert refined execution_steps STILL contain the CLI (not abstracted)
    Expected Result: pass; existing untouched
    Evidence: .sisyphus/evidence/task-8-refine-boundary.txt

  Scenario: code-employee steps excluded from abstraction
    Tool: Bash (vitest)
    Steps:
      1. Generate a code-writing employee description
      2. Assert procedural git/gh steps remain (or explicit carve-out documented)
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-8-code-employee.txt
  ```

  **Commit**: groups with Wave 2-3

- [ ] 9. Live generate→save→trigger→Done E2E on deepseek-flash

  **What to do** (ONLY IF Task 4 spike PASSED):
  - Full live pipeline through the REAL generator (not hand-authored): generate an intent-level Slack-summary employee via the wizard/API on `deepseek/deepseek-v4-flash`, save the draft (assert 201 + valid role_name), activate, trigger a real task, and verify it reaches `Done` with a real Slack delivery and non-empty `--draft-file` content — using ONLY the runtime skills (no CLI in the prompt).
  - Capture task_id + full `task_status_log` trace + proof of delivery. "Code looks correct"/"unit tests pass" is explicitly INSUFFICIENT for this delivery-pipeline change (per AGENTS.md). Load the AI Employee E2E guide (AC1–AC8) + Slack UX Scenario A.

  **Must NOT do**: Do NOT mock anything. Do NOT substitute a different model. Do NOT declare pass without a Done task + verified delivery.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — full live lifecycle E2E.
  - **Skills**: [`e2e-testing`, `employee-creation-debugging`, `feature-verification`, `long-running-commands`]

  **Parallelization**: NO | Wave 4 | Blocks: 10 | Blocked By: 7,8

  **References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` (AC1–AC8).
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` Scenario A.
  - `.opencode/skills/feature-verification/SKILL.md` (smoke-test employee).

  **Acceptance Criteria**:

  ```
  Scenario: generated intent-level employee runs end-to-end
    Tool: Bash (curl + psql + container watch) + long-running-commands
    Preconditions: pnpm dev running; docker image built; SERVICE_TOKEN sourced
    Steps:
      1. Generate intent-level employee on deepseek-flash; save draft → assert 201 + valid role_name
      2. Activate + trigger; poll task_status_log to terminal
      3. Assert status 'Done'; assert Slack delivery present; assert delivered draft NON-EMPTY
    Expected Result: Done + verified delivery
    Evidence: .sisyphus/evidence/task-9-e2e-trace.txt, task-9-e2e-delivery.txt
  ```

  **Commit**: NO (verification only)

- [ ] 10. Documentation updates

  **What to do**:
  - Update AGENTS.md: (a) the role_name CREATE-path behavior (converse-create derives a kebab slug; editable field); (b) IF spike passed, the intent-level-steps convention (generated steps are intent-level prose; runtime skills supply CLI; `$ENV` placeholders + submit-output closer preserved; existing/refine paths NOT abstracted).
  - If Task 4/5 added the `--draft-file` convention to `tool-usage-reference`, note it.
  - If the spike FAILED, document the negative result (intent-level steps not viable on current models) instead of the convention.
  - Follow Documentation Durability (no volatile counts/line numbers).

  **Must NOT do**: Do NOT document abstraction as shipped if the spike failed. Do NOT add volatile counts.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: NO | Wave 4 | Blocks: FINAL | Blocked By: 9

  **References**:
  - AGENTS.md "Documentation Freshness" + "Documentation Durability".
  - `.opencode/skills/employee-creation-debugging/SKILL.md`.

  **Acceptance Criteria**:

  ```
  Scenario: docs reflect shipped behavior
    Tool: Bash (grep)
    Steps:
      1. grep AGENTS.md for role_name create-path note
      2. If spike passed: grep for intent-level steps convention; assert no "model fallback" claim
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-10-docs.txt
  ```

  **Commit**: `docs: role_name create-path behavior + intent-level steps convention`

- [ ] 11. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1-F4 checked before user okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read plan end-to-end. Each "Must Have": verify implementation exists (read file, curl, run test). Each "Must NOT Have": grep codebase for forbidden patterns (deleted EDIT forbid-line, modified EXECUTION_PROMPT, removed postProcess normalization, dropped `$ENV` placeholders, abstracted refine/edit path) — reject with file:line if found. Confirm evidence files exist in `.sisyphus/evidence/`. If the spike (T4) failed and Wave 2 was cancelled, verify Wave 1 still fully shipped and the negative result is documented.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Spike [PASS/FAIL/cancelled-correctly] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` (tsc) + `pnpm lint` + `pnpm test:unit` + dashboard tsc. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log, AI slop. Confirm the conditional forbid is baseline-aware (not a blanket delete) and shared helpers are reused.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | VERDICT`

- [ ] F3. **Real Manual QA + Live E2E** — `unspecified-high` (+ `playwright`, `e2e-testing`, `employee-creation-debugging`)
      From clean state: (a) curl converse-create on a clear description → assert role_name slug; (b) browser save-draft → 201; (c) IF spike passed: full live E2E on deepseek-flash generate→save→trigger→`Done`, capture task_id + task_status_log + proof of Slack delivery + non-empty `--draft-file`. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N] | Live E2E [task_id reached Done Y/N] | VERDICT`

- [ ] F4. **Scope Fidelity + Boundary Audit** — `deep`
      For each task: read "What to do" + actual diff (git diff). Verify 1:1 — nothing missing, nothing beyond spec. **Boundary audit**: confirm GENERATE + create-converse are abstracted but `refine()` and edit-converse on EXISTING archetypes are NOT; confirm code-employee block excluded; confirm `tool_registry` paths + `$ENV` placeholders preserved; confirm EDIT role_name forbid intact. Confirm role_name fix uses BOTH Fix A and Fix B. Detect cross-task contamination.
      Output: `Tasks [N/N] | Boundary [CLEAN/N drift] | role_name [A+B+fallback Y/N] | VERDICT`

---

## Commit Strategy

- **Wave 1 (ships standalone)**: `fix(wizard): derive non-empty role_name slug on create-converse path`
- **Wave 2-3 (gated by spike)**: `feat(archetype-gen): intent-level execution steps relying on runtime skills`
- **Wave 4**: `docs: role_name create-path behavior + intent-level steps convention`
- If spike fails: `chore: document intent-level steps spike negative result` (Wave 1 only ships)

---

## Success Criteria

### Verification Commands

```bash
pnpm test:unit                 # all pass
pnpm build && pnpm lint        # clean
# CREATE returns a valid slug even though model may omit it:
SERVICE_TOKEN=$(grep '^SERVICE_TOKEN=' .env | cut -d'=' -f2-)
curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/archetypes/converse-create" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"transcript":[{"role":"user","content":"post a daily standup summary to the team slack channel"}]}' \
  | jq -e '.proposal.role_name | test("^[a-z0-9]+(-[a-z0-9]+)*$")'
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] role_name fix ships (Wave 1) regardless of spike outcome
- [ ] Spike result captured (PASS → abstraction shipped + live E2E; FAIL → documented, Wave 2 cancelled)
- [ ] Docs updated

## Future Work (Backlog)

- role_name uniqueness/collision handling per tenant (pre-existing latent gap — out of scope here).
- Apply intent-level abstraction to refine/edit paths + backfill existing archetypes (deferred — "leave existing untouched").
- Code-employee (git/gh) step abstraction once github-skill clone→PR coverage is verified.
- Multi-model E2E to map the model-capability boundary for intent-level steps.
