# Prevent Plumbing Leaks in Generated Archetype Fields

## TL;DR

> **Quick Summary**: AI-generated employees leak technical plumbing (CLI tool paths, `tsx`, `--flags`, `/tmp/` paths, raw Slack channel IDs) into user-facing fields. Fix it at generation time — never let the LLM produce plumbing — via a unified prompt rule across all 3 generation paths plus an LLM-judge validate-and-retry safety net. No regex text-mutation.
>
> **Deliverables**:
>
> - A no-leak prohibition folded into the shared `ARCHETYPE_AUTHORING_RULES` constant (covers all 3 paths)
> - An LLM-judge detector + corrective-retry loop (2 retries, accept-last-with-warning on exhaustion), single-sourced
> - `DEFAULT_DELIVERY_INSTRUCTIONS` rewritten to be plumbing-free (+ regenerated World-B copy)
> - Full unit + parity + golden test coverage and a live wizard E2E proving a leak-prone description yields clean output
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (shared rule) → Task 4 (judge+retry wrapper) → Task 7 (live E2E) → Final Wave

---

## Context

### Original Request

The latest wizard-created AI employee had these `delivery_steps`:

```
1. Receive the compiled schedule from the previous step.
2. Post the schedule as a message to Slack channel C0B71QSMZKQ using /tools/slack/post-message.ts.
3. Confirm delivery by submitting output via /tools/platform/submit-output.ts.
```

User goal: ensure NO technical details / plumbing leak to the end user in ANY generated user-facing field, enforced from ONE source so the generation paths can never drift again.

### Interview Summary

**Root cause (code-verified)**:

1. `postProcess()` (`src/gateway/services/archetype-generator.ts:369`) normalizes `tool_registry` paths and auto-attaches the Composio tool, but performs ZERO validation of prose fields — LLM output (`deepseek/deepseek-v4-flash`) passes through verbatim.
2. The no-leak prohibition is INCONSISTENT across the 3 generation paths: the REFINE prompt (`prompts.ts:474`) has an explicit no-leak rule; the GENERATE prompt (`prompts.ts:235`) is weak and even nudges toward `$NOTIFICATION_CHANNEL`; the WIZARD-CREATE prompt (`buildConverseSystemPromptPre`, `prompts.ts:527-530`) has NO prohibition at all — this is the path that leaked.
3. The shared `ARCHETYPE_AUTHORING_RULES` constant (`prompts.ts:76-222`) covers multi-source/coverage/backup/`{{key}}`/Composio rules but does NOT contain a delivery/no-leak rule.

**Architectural pivot (user-directed)**: User explicitly rejected a regex text-scrubber as too brittle ("Relying on simple text search is a lot less reliable than using a smart LLM"). The correct fix is: the LLM must not GENERATE plumbing; if it does, the LLM regenerates clean. Detection is via an LLM judge call, not regex mutation.

**Confirmed decisions**:

- All active employees are intent-level — there are NO live legacy/manual archetypes whose `execution_steps`/`delivery_steps` contain real `tsx /tools/...` commands the model must execute. So requiring intent-only prose across all user-facing fields is safe.
- `DEFAULT_DELIVERY_INSTRUCTIONS` (the null-delivery fallback) must be rewritten to be plumbing-free (it currently contains `/tmp/summary.txt`).
- Retry trigger = LLM judge call (not deterministic token check).
- Retry budget = 2 corrective retries (3 total generations max).
- Exhaustion behavior = accept last attempt + `log.warn` (never block employee creation).

**Infra facts (verified)**:

- All 3 paths call `postProcess()`: `generate()` line 762, `refine()` line 830, `converse()` line 963.
- `callLLM(options: CallLLMOptions)` in `src/lib/call-llm.ts:200` — `model` optional (defaults to `gateway_llm_model` platform setting), `taskType: 'review'`, `responseFormat: { type: 'json_object' }`.
- Private `callLLMWithJsonRetry` at line 535 wraps the LLM call function (`callLLMFn`) with an empty-content nudge.
- `applyModelAndEstimate()` runs AFTER `postProcess()`.
- `overview` is a STRUCTURED OBJECT (`role`, `trigger`, `workflow[]`, `tools_used`, `output`, `approval`), not a string.
- `DEFAULT_DELIVERY_INSTRUCTIONS` is World-A single-sourced (`src/lib/output-contract-constants.ts:25`); the World-B generated copy is regenerated via `pnpm generate-worker-constants`. Consumer: `admin-archetype-converse-create.ts:80`.

### Metis Review

**Identified gaps (addressed in this plan)**:

- CRITICAL #1: the `DEFAULT_DELIVERY_INSTRUCTIONS` fallback itself contains `/tmp/summary.txt` → would re-leak. Resolved by Task 2 (rewrite the constant).
- CRITICAL #2: `execution_steps` is the model's real runtime instructions for legacy archetypes → unsafe to mutate. Resolved by user confirmation (no live legacy archetypes) + the no-mutation architecture (judge regenerates, never strips).
- `{{key}}` / `INPUT_*` tokens and legitimate codes (e.g. `CONTRACT2024`) must NOT be flagged by the judge → explicit false-positive QA scenarios.
- `overview` is an object → judge must inspect sub-fields incl. the `workflow` array.
- Golden fixtures need regeneration after the prompt constant change → dedicated task.

---

## Work Objectives

### Core Objective

Guarantee that no AI-generated archetype field shown to or describing the employee for an end user contains technical plumbing — by preventing the LLM from producing it (unified prompt rule) and catching residual leaks with an LLM-judge retry loop that asks the LLM to regenerate clean.

### Concrete Deliverables

- No-leak prohibition inside `ARCHETYPE_AUTHORING_RULES` (single source, all 3 paths)
- Plumbing-free `DEFAULT_DELIVERY_INSTRUCTIONS` + regenerated World-B copy
- LLM-judge function + a single-sourced validate-and-retry wrapper used by `generate`, `refine`, and `converse`
- Judge prompt constant
- Unit tests (judge, retry loop, constant), prompt-parity test update, golden regen
- Live wizard E2E proving a leak-prone description yields plumbing-free output
- Updated `creating-archetypes` skill documentation

### Definition of Done

- [ ] `pnpm test:unit` green (0 failures, Docker-skip allowed)
- [ ] `pnpm lint` clean, `pnpm build` exit 0
- [ ] Live `converse-create` with a leak-prone description returns `delivery_steps` with zero plumbing tokens
- [ ] All 3 generation paths carry the identical no-leak rule via the shared constant

### Must Have

- Single source of truth for the no-leak rule (`ARCHETYPE_AUTHORING_RULES`) — no per-path duplication
- LLM-judge detection (not regex text-mutation)
- Corrective-retry that asks the LLM to regenerate, with the judge's feedback
- 2-retry budget; accept-last + `log.warn` on exhaustion
- Plumbing-free fallback constant
- Platform-generic (no cleaning/employee-specific tokens)

### Must NOT Have (Guardrails)

- NO regex/string scrubber that mutates generated text (explicitly rejected by user)
- NO stripping or rewriting of `{{key}}` placeholders or `INPUT_*` tokens anywhere
- NO judge false-positives on legitimate content (output codes, IDs that aren't Slack channels, `{{target_date}}`)
- NO direct edit of `src/worker-tools/lib/output-contract-paths.generated.ts` (regenerate via script)
- NO blocking of employee creation on retry exhaustion (accept-last + warn)
- NO employee-specific logic in shared files
- NO `--no-verify`; NO AI/claude/co-authored-by in commit messages

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: TDD (RED → GREEN → REFACTOR per task)
- **Framework**: vitest (`pnpm test:unit` one-shot)
- **No Docker rebuild** — all changes are gateway/lib only (worker-tools change is via the generator script, no image rebuild needed for local bind-mount).

### QA Policy

Every task includes agent-executed QA. Evidence to `.sisyphus/evidence/`.

- **Unit/judge/retry logic**: Bash (`pnpm test:unit -- <file>`) — assert pass counts.
- **Prompt parity / constants**: Bash (`node -e`/`pnpm test:unit`) — assert token presence/absence.
- **Live generation**: Bash (curl `converse-create`) — parse JSON, assert `delivery_steps` plumbing-free.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundations, independent):
├── Task 1: Add no-leak rule to ARCHETYPE_AUTHORING_RULES (shared constant) [unspecified-high]
├── Task 2: Rewrite DEFAULT_DELIVERY_INSTRUCTIONS + regenerate World-B copy [quick]
└── Task 3: Add LLM-judge prompt constant + judge function (pure, testable) [ultrabrain]

Wave 2 (After Wave 1 — integration):
├── Task 4: Single-sourced validate-and-retry wrapper, wired into all 3 paths (depends: 3) [ultrabrain]
├── Task 5: Update prompt-parity test for the new shared rule (depends: 1) [quick]
└── Task 6: Regenerate golden fixtures (depends: 1, 2) [quick]

Wave 3 (After Wave 2 — end-to-end proof + docs):
├── Task 7: Live wizard E2E — leak-prone description yields clean output (depends: 4) [unspecified-high]
└── Task 8: Update creating-archetypes skill docs (depends: 1, 2, 4) [writing]

Wave FINAL (after ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + regression (unspecified-high)
├── F3: Real QA execution (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Task 9: Notify completion (Telegram)

Critical Path: Task 1 → Task 4 → Task 7 → F1-F4 → user okay
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

- **1**: deps none → blocks 4, 5, 6, 8
- **2**: deps none → blocks 6, 8
- **3**: deps none → blocks 4
- **4**: deps 3 (and 1 for prompt context) → blocks 7, 8
- **5**: deps 1 → blocks none
- **6**: deps 1, 2 → blocks none
- **7**: deps 4 → blocks none
- **8**: deps 1, 2, 4 → blocks none
- **9**: deps Final Wave → blocks none

### Agent Dispatch Summary

- **Wave 1**: T1 → `unspecified-high`, T2 → `quick`, T3 → `ultrabrain`
- **Wave 2**: T4 → `ultrabrain`, T5 → `quick`, T6 → `quick`
- **Wave 3**: T7 → `unspecified-high`, T8 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add the no-leak rule to the shared `ARCHETYPE_AUTHORING_RULES` constant

  **What to do**:
  - In `src/gateway/services/prompts/archetype-generator-prompts.ts`, add a new rule block to the `ARCHETYPE_AUTHORING_RULES` constant (line 76 region) prohibiting technical plumbing in ALL user-facing generated fields.
  - The rule must state: generated `identity`, `execution_steps`, `delivery_steps`, and the `overview` object must be written in plain-English intent only — NO `/tools/...` CLI paths, NO `tsx` invocations, NO `--flag` syntax, NO `/tmp/...` paths, NO raw Slack channel IDs. Refer to the destination as "the team's notification channel" (reuse the EXACT string already used at `prompts.ts:474` for consistency). The worker resolves all tool commands, channels, and file paths at runtime.
  - Because the constant is composed into both `SYSTEM_PROMPT_PRE` and `buildConverseSystemPromptPre`, this single edit propagates the rule to the GENERATE and WIZARD-CREATE paths. Verify the REFINE prompt (`REFINE_SYSTEM_PROMPT_PRE`) still carries equivalent wording (it has its own at line 474 — leave it, or note it as already-covered).
  - Keep the rule platform-generic — no employee/domain-specific examples beyond a generic Slack-post illustration.

  **Must NOT do**:
  - Do NOT duplicate the rule text into individual prompt regions — it must live ONCE in the shared constant.
  - Do NOT add any regex/scrubber logic here — this task is prompt text only.
  - Do NOT reference `{{key}}` or `INPUT_` as forbidden — those are legitimate.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: requires careful prompt wording aligned with existing conventions and parity tests; medium reasoning, low file count.
  - **Skills**: [`creating-archetypes`] — generator prompt structure, shared-constant pattern, parity guards documented there.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: 4, 5, 6, 8 — **Blocked By**: None

  **References**:
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:76` — `ARCHETYPE_AUTHORING_RULES` start; insert the new rule block here in the same style as surrounding rules.
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:474` — REFINE's existing no-leak wording; copy the EXACT phrasing ("the team's notification channel", the NO `/tools/`, `tsx`, `--flag`, `/tmp/`, channel-ID list) so the shared constant matches.
  - `src/gateway/services/prompts/archetype-generator-prompts.ts:319` and `:521` — the two `${ARCHETYPE_AUTHORING_RULES}` composition points proving single-edit propagation.
  - `tests/unit/generator-prompts-parity.test.ts` — the parity guard that will need a marker for the new rule (handled in Task 5).

  **Acceptance Criteria**:
  - [ ] The no-leak rule text appears exactly once in the source (in the constant).
  - [ ] `node -e "const p=require('./dist/...')"` not needed — instead assert via grep that both composed prompts contain the rule (Task 5 formalizes this).

  **QA Scenarios**:

  ```
  Scenario: Shared constant carries the no-leak rule into both composed prompts
    Tool: Bash (node + tsx import)
    Preconditions: Task 1 edit applied
    Steps:
      1. Run a node/tsx snippet importing SYSTEM_PROMPT_PRE and buildConverseSystemPromptPre(true)
      2. Assert both strings include the phrase "the team's notification channel"
      3. Assert both strings include the no-`/tools/` prohibition wording
    Expected Result: both prompts contain the rule (single-source propagation confirmed)
    Failure Indicators: rule missing from the wizard-create prompt
    Evidence: .sisyphus/evidence/task-1-prompt-propagation.txt
  ```

  **Commit**: YES (groups with T5) — Message: `feat(archetype-gen): add no-leak rule to shared authoring constant`

- [x] 2. Rewrite `DEFAULT_DELIVERY_INSTRUCTIONS` to be plumbing-free and regenerate the World-B copy

  **What to do**:
  - In `src/lib/output-contract-constants.ts:25`, rewrite `DEFAULT_DELIVERY_INSTRUCTIONS` to remove `/tmp/summary.txt` and the `submit-output` tool reference. New value: plain-English intent, e.g. `'Post the approved content to the configured notification channel using the Slack integration, then confirm the delivery is complete.'`
  - Run `pnpm generate-worker-constants` to regenerate `src/worker-tools/lib/output-contract-paths.generated.ts` (the World-B copy). Do NOT hand-edit the generated file.
  - Verify the consumer at `src/gateway/routes/admin-archetype-converse-create.ts:80` still type-checks and behaves (it just substitutes the constant for null delivery_steps).

  **Must NOT do**:
  - Do NOT hand-edit `src/worker-tools/lib/output-contract-paths.generated.ts`.
  - Do NOT remove the constant or change its export name/type.
  - Do NOT alter other constants in the file (`SUMMARY_PATH` etc. remain — they are the real runtime paths used by tools, not user-facing prose).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: single small constant edit + one generator script run.
  - **Skills**: [`creating-archetypes`] — covers DEFAULT_DELIVERY_INSTRUCTIONS and the World-A/World-B split.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: 6, 8 — **Blocked By**: None

  **References**:
  - `src/lib/output-contract-constants.ts:25` — the constant to rewrite; note its World-A header comment (lines 1-3) explaining why worker-tools can't import it.
  - `src/gateway/routes/admin-archetype-converse-create.ts:80` — consumer that uses the constant as the null-delivery fallback.
  - `src/gateway/services/archetype-generator.ts:391` — `postProcess` also assigns this constant when delivery_steps is null/empty; confirm the new value flows here too.
  - README.md "Scripts" table — `generate-worker-constants` entry documents the regen requirement and CI diff gate.

  **Acceptance Criteria**:
  - [ ] Constant contains no `/tmp/`, no `/tools/`, no `tsx`, no `submit-output`.
  - [ ] `pnpm generate-worker-constants` then `git diff --exit-code src/worker-tools/lib/output-contract-paths.generated.ts` shows the regenerated copy is committed (no drift).

  **QA Scenarios**:

  ```
  Scenario: Fallback constant is plumbing-free in both World-A and World-B
    Tool: Bash (node/grep)
    Preconditions: Task 2 edit + regen applied
    Steps:
      1. grep DEFAULT_DELIVERY_INSTRUCTIONS in output-contract-constants.ts and the generated copy
      2. Assert neither match contains "/tmp/" or "/tools/" or "tsx" or "submit-output"
    Expected Result: both copies are plain-English, plumbing-free
    Failure Indicators: "/tmp/summary.txt" still present in either file
    Evidence: .sisyphus/evidence/task-2-fallback-clean.txt

  Scenario: Generated World-B copy is in sync (no drift)
    Tool: Bash
    Steps:
      1. Run `pnpm generate-worker-constants`
      2. Run `git diff --exit-code src/worker-tools/lib/output-contract-paths.generated.ts`
    Expected Result: exit 0 (no uncommitted drift)
    Evidence: .sisyphus/evidence/task-2-generated-sync.txt
  ```

  **Commit**: YES — Message: `fix(output-contract): make DEFAULT_DELIVERY_INSTRUCTIONS plumbing-free`

- [x] 3. Add the LLM-judge prompt constant + pure judge function

  **What to do**:
  - Add a new exported prompt constant in `src/gateway/services/prompts/archetype-generator-prompts.ts` (e.g. `PLUMBING_JUDGE_SYSTEM_PROMPT`) instructing the LLM to act as a reviewer that detects technical plumbing leaks in user-facing archetype fields. It must return strict JSON: `{ "has_leak": boolean, "fields": string[], "snippets": string[] }`.
  - The judge prompt must explicitly define plumbing as: `/tools/...` CLI paths, `tsx` invocations, `--flag` syntax, `/tmp/...` paths, raw Slack channel IDs (e.g. `C0B71QSMZKQ`), and tool filenames like `post-message.ts`/`submit-output.ts`. It must explicitly state that `{{key}}` placeholders (e.g. `{{target_date}}`), `INPUT_*` references, plain business codes/IDs (e.g. an order code "CONTRACT2024"), and ordinary words like "Slack" or "channel" are NOT plumbing and must NOT be flagged.
  - Add a function (in `archetype-generator.ts`, e.g. private `async judgeProseForPlumbing(fields: Record<string,unknown>): Promise<{ has_leak: boolean; fields: string[]; snippets: string[] }>`) that serializes the user-facing fields (`identity`, `execution_steps`, `delivery_steps`, and `overview` — traversing its sub-fields incl. the `workflow` array) and calls the LLM via the existing `callLLMFn`/`callLLM` with `taskType:'review'`, `temperature:0`, `responseFormat:{type:'json_object'}`. Default model (gateway_llm_model) — do not hardcode a model ID.
  - Make the function robust: on LLM error or unparseable JSON, return `{ has_leak: false, fields: [], snippets: [] }` (fail-open — never block generation on a judge failure) and `log.warn`.

  **Must NOT do**:
  - Do NOT mutate any field — the judge only detects and reports.
  - Do NOT hardcode a model ID (`anthropic/...`, `openai/...` forbidden; use the default gateway model).
  - Do NOT flag `{{key}}`, `INPUT_*`, or legitimate business codes as plumbing.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: prompt design + a robust, fail-open LLM-integration function with careful false-positive boundaries.
  - **Skills**: [`creating-archetypes`, `data-access-conventions`] — generator structure; `createHttpClient`/LLM-call conventions and config access.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: 4 — **Blocked By**: None

  **References**:
  - `src/lib/call-llm.ts:20` (`CallLLMOptions`) and `:200` (`callLLM`) — the LLM call signature; `model` optional → defaults to `gateway_llm_model`.
  - `src/gateway/services/archetype-generator.ts:535` (`callLLMWithJsonRetry`) and the `callLLMFn` field — pattern for invoking the LLM with json_object + empty-content handling; reuse the injected `callLLMFn` so it stays unit-testable/mockable.
  - `src/gateway/services/archetype-generator.ts:966` (`proseFields` array) — canonical list of user-facing prose fields; the judge target list should match (`identity`, `execution_steps`, `delivery_steps`, `overview`).
  - `src/gateway/services/archetype-generator.ts:369` (`postProcess`) — note `overview` is `z.object({}).passthrough()`; the judge must stringify its sub-fields including `workflow[]`.

  **Acceptance Criteria**:
  - [ ] Judge returns `has_leak:true` for a payload containing `C0B71QSMZKQ` and `/tools/slack/post-message.ts`.
  - [ ] Judge returns `has_leak:false` for a clean intent-prose payload.
  - [ ] Judge does NOT flag `{{target_date}}` or an `overview.output` like "Generates report CONTRACT2024".
  - [ ] On LLM throw / bad JSON, judge returns `{has_leak:false,...}` and logs a warning (fail-open).

  **QA Scenarios**:

  ```
  Scenario: Judge flags a leaked payload (happy path)
    Tool: Bash (pnpm test:unit -- archetype-generator judge)
    Preconditions: judge fn + mocked callLLMFn returning {has_leak:true,...}
    Steps:
      1. Call judgeProseForPlumbing with delivery_steps containing "C0B71QSMZKQ" and "/tools/slack/post-message.ts"
      2. Assert returned has_leak === true and fields includes "delivery_steps"
    Expected Result: leak detected
    Evidence: .sisyphus/evidence/task-3-judge-flag.txt

  Scenario: Judge fail-open on LLM error (negative/edge)
    Tool: Bash (pnpm test:unit)
    Preconditions: mocked callLLMFn that throws
    Steps:
      1. Call judgeProseForPlumbing
      2. Assert it returns {has_leak:false} and log.warn was called (spy)
    Expected Result: no throw, generation never blocked by judge failure
    Evidence: .sisyphus/evidence/task-3-judge-failopen.txt
  ```

  **Commit**: YES (groups with T4) — Message: `feat(archetype-gen): LLM-judge validate-and-retry for plumbing leaks`

- [x] 4. Single-sourced validate-and-retry wrapper wired into all 3 generation paths

  **What to do**:
  - Add ONE shared private method to the generator (e.g. `async validateAndRetryProse(produce: () => Promise<GenerateArchetypeResponse>, regenerateWithFeedback: (feedback: string) => Promise<GenerateArchetypeResponse>): Promise<GenerateArchetypeResponse>`), OR a simpler helper that takes the messages + a re-call closure. The exact shape is the implementer's call, but it MUST be single-sourced and used by all 3 paths.
  - Logic: after obtaining a post-processed result, call `judgeProseForPlumbing`. If `has_leak`, re-call the SAME path's LLM with a corrective user message appended (include the judge's `fields`/`snippets` and the instruction "regenerate in plain-English intent only — no tool paths, no tsx, no flags, no /tmp paths, no raw channel IDs"). Re-run postProcess on the new output, re-judge. Budget: **2 corrective retries** (3 generations total max).
  - On exhaustion (still leaking after 2 retries): accept the last attempt and `log.warn({ fields, snippets }, 'archetype generation: plumbing leak persisted after retries — accepting last attempt')`. Never throw, never block.
  - Wire into `generate()` (line ~762), `refine()` (line ~830), and `converse()` proposal branch (line ~963). The judge/retry must run BEFORE `applyModelAndEstimate` (or be ordered so it doesn't redo model selection per attempt).
  - Ensure `converse()`'s `question`/`no_change`/`too_long` branches are NOT subject to judging (only the `proposal` branch produces archetype fields).

  **Must NOT do**:
  - Do NOT duplicate the retry logic per path — exactly one implementation.
  - Do NOT block creation on exhaustion — accept-last + warn only.
  - Do NOT run the judge on non-proposal converse results.
  - Do NOT re-run model selection (`applyModelAndEstimate`) on every retry attempt unnecessarily.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: control-flow integration across 3 call sites with retry budget, ordering constraints, and fail-open semantics.
  - **Skills**: [`creating-archetypes`, `data-access-conventions`] — generator internals and LLM-call conventions.

  **Parallelization**:
  - **Can Run In Parallel**: NO (integration hub) — **Parallel Group**: Wave 2
  - **Blocks**: 7, 8 — **Blocked By**: 3 (judge fn), 1 (corrective-message wording should match the prompt rule)

  **References**:
  - `src/gateway/services/archetype-generator.ts:707-765` (`generate`) — wrap the `postProcess` result; the corrective re-call reuses `messages` + appended user turn (see the empty-content nudge pattern at `:557-565`).
  - `src/gateway/services/archetype-generator.ts:767-830` (`refine`) — note `runRefineCall(msgs)` closure already exists; thread retry through it.
  - `src/gateway/services/archetype-generator.ts:875-980` (`converse`) — only the `kind === 'proposal'` branch (line 956) gets judged; `postProcess` at 963.
  - `src/gateway/services/archetype-generator.ts:550-565` — empty-content nudge: the canonical pattern for appending a corrective user message and re-calling.
  - Judge function from Task 3.

  **Acceptance Criteria**:
  - [ ] A single retry implementation is referenced by all 3 paths (grep shows one helper, 3 call sites).
  - [ ] Leak on attempt 1 → clean on retry → returns clean result (test).
  - [ ] Leak persists through 2 retries → returns last attempt + `log.warn` fired (test, spy).
  - [ ] `converse` question/no_change branches never call the judge (test).

  **QA Scenarios**:

  ```
  Scenario: Retry produces clean output after one corrective pass (happy path)
    Tool: Bash (pnpm test:unit -- archetype-generator)
    Preconditions: mocked LLM returns leaked payload first, clean payload on 2nd call; judge mock flags first, passes second
    Steps:
      1. Call generate() with a description
      2. Assert final delivery_steps has no plumbing tokens
      3. Assert LLM was called exactly twice
    Expected Result: clean result, one corrective retry consumed
    Evidence: .sisyphus/evidence/task-4-retry-clean.txt

  Scenario: Exhaustion accepts last attempt + warns (negative/edge)
    Tool: Bash (pnpm test:unit)
    Preconditions: mocked LLM always leaks; judge always flags
    Steps:
      1. Call generate(); spy on log.warn
      2. Assert it returns (no throw), LLM called 3 times total (1 + 2 retries)
      3. Assert log.warn called with persisted-leak message
    Expected Result: non-blocking accept-last, warning logged
    Evidence: .sisyphus/evidence/task-4-exhaustion-warn.txt
  ```

  **Commit**: YES (groups with T3) — Message: `feat(archetype-gen): LLM-judge validate-and-retry for plumbing leaks`

- [x] 5. Update the prompt-parity test for the new shared rule

  **What to do**:
  - In `tests/unit/generator-prompts-parity.test.ts`, add an assertion/marker confirming the no-leak rule (the "the team's notification channel" phrase and the no-`/tools/` prohibition) is present in BOTH `SYSTEM_PROMPT_PRE` and the wizard-create prompt (`buildConverseSystemPromptPre(true)`), proving single-source propagation.
  - Keep the existing parity markers intact; add the new one in the same style.

  **Must NOT do**:
  - Do NOT weaken existing parity assertions.
  - Do NOT add the rule text to the test as a duplicate source — assert against the imported prompts.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: single test-file addition.
  - **Skills**: [] — straightforward test edit.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: None — **Blocked By**: 1

  **References**:
  - `tests/unit/generator-prompts-parity.test.ts` — existing parity markers and structure.
  - `src/gateway/services/prompts/archetype-generator-prompts.ts` — `SYSTEM_PROMPT_PRE`, `buildConverseSystemPromptPre`.

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit -- generator-prompts-parity` passes with the new assertion.
  - [ ] The new assertion fails if the rule is removed from the shared constant (verify by temporary local check, then restore).

  **QA Scenarios**:

  ```
  Scenario: Parity test enforces the no-leak rule in all paths
    Tool: Bash (pnpm test:unit -- generator-prompts-parity)
    Steps:
      1. Run the parity test file
      2. Assert all tests pass including the new no-leak marker
    Expected Result: green
    Evidence: .sisyphus/evidence/task-5-parity.txt
  ```

  **Commit**: YES (groups with T1) — Message: `feat(archetype-gen): add no-leak rule to shared authoring constant`

- [x] 6. Regenerate golden fixtures for the prompt-constant change

  **What to do**:
  - The change to `ARCHETYPE_AUTHORING_RULES` (Task 1) and `DEFAULT_DELIVERY_INSTRUCTIONS` (Task 2) alter prompt/compiled output. Regenerate the affected golden fixtures using the repo's golden-update mechanism (e.g. `GENERATE_GOLDEN=true pnpm test:unit -- golden` or the project's documented regen flag — confirm the exact env/flag from the golden test file header).
  - Affected candidates: `tests/fixtures/golden/system-prompt.txt` (PRE prompt now contains the rule), and any inline golden snapshot in `tests/unit/gateway/services/archetype-generator-golden.test.ts`. Confirm `refine-prompt.txt` only changes if REFINE composes the constant (it does not — leave unchanged if so).
  - Commit the regenerated fixtures.

  **Must NOT do**:
  - Do NOT hand-edit golden fixtures — regenerate via the sanctioned flag.
  - Do NOT regenerate fixtures unrelated to this change.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: mechanical regen + commit.
  - **Skills**: [`creating-archetypes`] — golden test conventions noted there.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: None — **Blocked By**: 1, 2

  **References**:
  - `tests/unit/gateway/services/archetype-generator-golden.test.ts` — header should document the regen flag (`GENERATE_GOLDEN` or similar).
  - `tests/fixtures/golden/system-prompt.txt` — the PRE prompt golden.
  - `tests/fixtures/golden/refine-prompt.txt` — verify whether it changes (likely not).

  **Acceptance Criteria**:
  - [ ] `pnpm test:unit -- golden` passes after regen.
  - [ ] `git diff` of golden files shows ONLY the new no-leak rule text / new fallback wording, nothing unexpected.

  **QA Scenarios**:

  ```
  Scenario: Golden fixtures match after regen
    Tool: Bash
    Steps:
      1. Run the golden regen flag
      2. Run `pnpm test:unit -- golden` (without the flag) — assert pass
      3. Inspect `git diff tests/fixtures/golden/` — assert only expected rule/wording added
    Expected Result: green, scoped diff
    Evidence: .sisyphus/evidence/task-6-golden.txt
  ```

  **Commit**: YES — Message: `test(archetype-gen): regenerate golden fixtures for no-leak rule`

- [x] 7. Live wizard E2E — leak-prone description yields plumbing-free output

  **What to do**:
  - With services running (`pnpm dev` or equivalent; ensure a single gateway), call the wizard CREATE path `POST /admin/tenants/:tenantId/archetypes/converse-create` (the exact path that originally leaked) with a transcript whose description is leak-prone — e.g. a Slack-posting employee for a specific channel ("post the daily schedule to our ops Slack channel").
  - Drive the conversation to a `proposal` (answer the mandatory first clarifying question), then inspect the returned `config.delivery_steps`, `config.identity`, and `config.overview`.
  - Assert programmatically (jq/node) that none contain: `/tools/`, `tsx `, `--`, `/tmp/`, or a Slack channel ID pattern (`C[A-Z0-9]{8,}`).
  - Capture the raw response as evidence. Also tail gateway logs to confirm whether the judge fired / a retry occurred (observability check, not a pass/fail gate).
  - Use the VLRE tenant (`00000000-0000-0000-0000-000000000003`) and `SERVICE_TOKEN` auth. Override model to `deepseek/deepseek-v4-flash` if needed to reproduce the original conditions.

  **Must NOT do**:
  - Do NOT assert from code-reading only — this MUST exercise the live HTTP path.
  - Do NOT mark complete if any user-facing field still contains plumbing.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: live multi-turn API exercise + JSON assertions + log observation.
  - **Skills**: [`creating-archetypes`, `employee-creation-debugging`, `api-design`] — converse-create flow, wizard generate→propose path, endpoint/auth shape.

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on integrated wrapper) — **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: None — **Blocked By**: 4

  **References**:
  - `src/gateway/routes/admin-archetype-converse-create.ts` — the live endpoint + request/response shape.
  - README.md "Testing Employees Locally" + `docs/employees/cleaning-schedule.md` trigger section — curl/auth patterns and tenant IDs.
  - `e2e-testing` skill — single-gateway pre-flight requirement.

  **Acceptance Criteria**:
  - [ ] Live `converse-create` returns a `proposal` for a leak-prone description.
  - [ ] `delivery_steps`, `identity`, `overview.*` contain zero plumbing tokens (jq/node assertion).
  - [ ] Evidence (raw JSON + log excerpt) saved.

  **QA Scenarios**:

  ```
  Scenario: Live wizard create yields plumbing-free delivery_steps (happy path)
    Tool: Bash (curl + jq)
    Preconditions: services up, single gateway, SERVICE_TOKEN set
    Steps:
      1. POST converse-create turn 1 with a Slack-posting description; receive clarifying question
      2. POST turn 2 answering it; receive kind:"proposal"
      3. Extract .config.delivery_steps/.identity/.overview; assert no match of /C[A-Z0-9]{8,}|\/tools\/|\btsx\b|--\w|\/tmp\//
    Expected Result: all user-facing fields plumbing-free
    Failure Indicators: a channel ID or /tools/ path in delivery_steps
    Evidence: .sisyphus/evidence/task-7-live-create.json

  Scenario: Judge/retry observability (edge)
    Tool: Bash (log tail)
    Steps:
      1. Tail gateway logs during the run
      2. Note whether a plumbing-leak warning or retry log appears
    Expected Result: either clean first pass, or a retry that resolved (informational)
    Evidence: .sisyphus/evidence/task-7-judge-logs.txt
  ```

  **Commit**: NO (verification only)

- [x] 8. Update the `creating-archetypes` skill documentation

  **What to do**:
  - In `.opencode/skills/creating-archetypes/SKILL.md`, add a subsection documenting: (a) the no-leak rule now lives in `ARCHETYPE_AUTHORING_RULES` and applies to all 3 generation paths; (b) the LLM-judge validate-and-retry loop (2 retries, accept-last + warn on exhaustion, judge is fail-open); (c) `DEFAULT_DELIVERY_INSTRUCTIONS` is now plumbing-free and is the null-delivery fallback.
  - Keep it durable (no volatile counts/line numbers) — describe the invariant and name the symbols.

  **Must NOT do**:
  - Do NOT add line-number references or volatile tallies.
  - Do NOT duplicate the rule text — point to the constant.

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: documentation prose.
  - **Skills**: [`creating-archetypes`] — match existing skill voice/structure.

  **Parallelization**:
  - **Can Run In Parallel**: YES — **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: None — **Blocked By**: 1, 2, 4

  **References**:
  - `.opencode/skills/creating-archetypes/SKILL.md` — existing "Composio Tool Auto-Attach" and "Shared Authoring Rules Constant" subsections; add the new content nearby in the same style.

  **Acceptance Criteria**:
  - [ ] Subsection added covering the no-leak rule, judge-retry loop, and the fallback constant.
  - [ ] No volatile line numbers or counts introduced.

  **QA Scenarios**:

  ```
  Scenario: Docs describe the no-leak system durably
    Tool: Bash (grep)
    Steps:
      1. grep the SKILL.md for "no-leak"/"judge"/"DEFAULT_DELIVERY_INSTRUCTIONS"
      2. Assert the new subsection exists and references the constant by name
    Expected Result: present, durable wording
    Evidence: .sisyphus/evidence/task-8-docs.txt
  ```

  **Commit**: YES — Message: `docs(creating-archetypes): document no-leak rule and judge-retry loop`

- [x] 9. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.
  - Run: `tsx scripts/telegram-notify.ts "✅ Prevent-plumbing-leaks plan complete — all tasks done, suite green, live E2E clean. Come back to review."`
  - **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found (especially: any regex text-scrubber that mutates generated prose; any direct edit to the generated World-B file; any per-path duplication of the no-leak rule). Check evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality + Regression** — `unspecified-high`
      Run `pnpm build` (`tsc -p tsconfig.build.json --noEmit`) + `pnpm lint` + `pnpm test:unit`. Review changed files for `as any`/`@ts-ignore`, empty catches, stray `console.log`, AI slop. Confirm the World-B generated file matches `pnpm generate-worker-constants` output (run it, assert `git diff` empty).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Generated-copy-fresh [Y/N] | VERDICT`

- [x] F3. **Real QA Execution** — `unspecified-high`
      Start services. Execute the live wizard E2E from Task 7 against at least 2 distinct leak-prone descriptions. Capture the returned proposals and assert `delivery_steps`, `identity`, and `overview.*` are plumbing-free. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Descriptions [N/N clean] | Judge-fired [observed Y/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything specced was built, nothing beyond spec. Confirm no scrubber crept in, no employee-specific tokens, no `INPUT_`/`{{key}}` handling changes. Flag cross-task contamination or unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(archetype-gen): add no-leak rule to shared authoring constant` — `prompts/archetype-generator-prompts.ts`; pre-commit `pnpm test:unit -- generator-prompts-parity`
- **T2**: `fix(output-contract): make DEFAULT_DELIVERY_INSTRUCTIONS plumbing-free` — `output-contract-constants.ts`, generated copy; pre-commit `pnpm generate-worker-constants && pnpm test:unit`
- **T3+T4**: `feat(archetype-gen): LLM-judge validate-and-retry for plumbing leaks` — `archetype-generator.ts`, `prompts.ts`, judge tests; pre-commit `pnpm test:unit -- archetype-generator`
- **T5**: groups with T1
- **T6**: `test(archetype-gen): regenerate golden fixtures for no-leak rule` — golden files
- **T8**: `docs(creating-archetypes): document no-leak rule and judge-retry loop` — SKILL.md

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                   # exit 0
pnpm lint                                    # clean
pnpm test:unit                               # 0 failures
pnpm generate-worker-constants && git diff --exit-code src/worker-tools/lib/output-contract-paths.generated.ts  # no drift
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (no scrubber, no per-path dup, no generated-file hand-edit)
- [ ] Live wizard E2E: leak-prone description → plumbing-free output
- [ ] All tests pass
