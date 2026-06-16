# AI Assistant — Confirm-Understanding Step + Fix Invalid-JSON Failure

## TL;DR

> **Quick Summary**: Two things. (1) **Bug fix**: the AI Assistant tab's `propose-edit` flow fails with `GENERATION_FAILED: ... Unterminated string in JSON` whenever applying a change produces long multi-line instruction text (e.g. rewriting an employee's instructions to generate Mermaid diagrams in its pull requests). The model (`deepseek/deepseek-v4-flash`, 1M-token context) is NOT running out of context — the JSON breaks because the model emits raw newlines inside string values, compounded by an artificially low `maxTokens: 6000` and possible empty/reasoning-only responses on the OpenCodeGo endpoint. (2) **New UX**: add a confirm-understanding step so that, before any edit is generated, the assistant restates in plain English what it understood the user wants, and the user confirms or corrects — only then does it generate the actual diff. The restatement is plain text (no JSON), so that phase is naturally immune to the parsing bug.
>
> **Deliverables**:
>
> - **Confirm-understanding flow**: a lightweight "interpret request" step that returns a plain-English restatement of the user's intent; the chat shows it with Confirm / correct-by-replying; Confirm triggers the existing diff proposal.
> - Verified root-cause diagnosis (logged raw LLM response for the exact failing prompt) recorded in the notepad.
> - Hardened proposal-generation call: appropriate `maxTokens`, JSON response-format where supported, empty-content guard, and a robust parse path that survives the model's most common JSON mistakes.
> - Friendly, non-technical error copy in the assistant chat (no raw `GENERATION_FAILED`/stack text shown to users).
> - Live E2E proof: the exact employee + exact prompt yields restatement → confirm → valid diff proposal in the UI.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (diagnose) → T2 (harden call) → T3 (robust parse) → T7 (wire confirm flow in UI) → live E2E

---

## Context

### Original Request

> `deepseek/deepseek-v4-flash` has a context of one million tokens, why are we truncating it? Create a plan to fix both bugs. Test with employee `db2974dc-ab37-4034-9ce2-1c7b91e424b5` (tenant `00000000-0000-0000-0000-000000000003`) using this exact prompt:
> "Please help me change this GitHub code engineer so that every time a pull request is submitted, it contains: - A high-level description of what changed - A Mermaid diagram showing any architectural changes made, with a before-and-after view in two Separate Mermaid diagrams."
>
> Follow-up: "I'm wondering if, as part of this AI assistant, the first step in the process is to try to parse what the human means and then write back to the human what the LLM understood in a better format so that the human can confirm or deny. After that, we can proceed with updating the instructions."

### Intent Clarification (important — the request was understood correctly)

The user's request means: _rewrite this employee's job instructions so that, when it submits a pull request, the PR includes a high-level description plus two before/after Mermaid diagrams._ The Mermaid diagrams belong in the **pull requests the employee later creates** — NOT in any planning artifact and NOT a diagram about the employee itself. The resulting edit is a longer, multi-line block of **instruction prose** added to the employee's `delivery_steps`/`execution_steps`. The system reads this intent correctly; the failure is purely in serializing that long multi-line text back as JSON.

### Decisions (from interview)

- **Packaging**: ONE combined plan — confirm-understanding step + JSON robustness fix ship together.
- **Confirm UX**: plain-English restatement of intent + Confirm/deny. User corrects by replying in the chat. No "which fields" detail required; no ambiguity-gating (the confirm step always runs).

### Investigation Findings (observed during diagnosis)

- **Model context is NOT the bottleneck.** `deepseek/deepseek-v4-flash` = 1M-token context window (confirmed on OpenRouter). The earlier "ran out of ~500 output tokens" claim was an unverified guess and is WRONG.
- **The real symptom** (from `/tmp/ai-dev.log`): repeated `component:"archetype-generator"` errors —
  - `SyntaxError: Unterminated string in JSON at position 2032 (line 6 column 1454)`
  - `Unterminated string in JSON at position 2323`, `position 6846`
  - `SyntaxError: Unexpected end of JSON input` (empty/blank `content`)
  - Each followed by `GENERATION_FAILED: JSON parse error during refine` → HTTP 422.
- **`Unterminated string ... line 6 column 1454/6170`** is the classic signature of the model placing **raw, unescaped newlines inside a JSON string value** — exactly what a multi-line Mermaid diagram in `execution_steps` produces. JSON requires `\n`; the model emits a literal newline → parser aborts mid-string.
- **`Unexpected end of JSON input`** (empty content) is a _different_ failure mode → suggests the OpenCodeGo `/zen/go/v1/chat/completions` endpoint sometimes returns reasoning tokens / empty `content`, or the response is genuinely truncated by an output cap.
- **Current config** (`src/gateway/services/archetype-generator.ts:414`): `refine()` uses `{ taskType: 'review', temperature: 0.3, maxTokens: 6000 }`. 6000 is far below the model's capability and below what a full archetype + two Mermaid diagrams needs.
- **Current parse path** (`callLLMWithJsonRetry`, lines 300–329): `stripFences()` → `JSON.parse()` → on failure, one "respond with ONLY valid JSON" retry → `JSON.parse()` again (throws if still bad). No repair of raw newlines, no JSON response-format request, no reasoning-token handling.
- **Routing** (`src/lib/call-llm.ts:216-241`): when `OPENCODE_GO_API_KEY` is set and the model is OpenAI-compatible on Go, the gateway routes to `GO_OPENAI_ENDPOINT` (`https://opencode.ai/zen/go/v1/chat/completions`). `requestBody` (lines 251-256) sends only `model`, `messages`, `temperature`, `max_tokens` — **no `response_format`, no `reasoning` control.** `content` is read from `data.choices[0]?.message.content ?? ''` (line 296) — an empty string if the provider returns reasoning-only output.

### Two Bugs to Fix + One New UX Layer

1. **Refine produces invalid/empty JSON for multi-line proposals** (backend) — the core failure. Caused by some combination of: raw newlines in string values, no JSON response-format, low `maxTokens`, and/or reasoning-token/empty-content on the Go endpoint.
2. **The UI shows the raw technical error** (frontend) — `AssistantTab.tsx` renders `I wasn't able to make that change: GENERATION_FAILED: LLM returned invalid JSON during refinement — SyntaxError: Unterminated string...`. Non-technical users should see a friendly, actionable message.
3. **New: confirm-understanding step** (full-stack) — before generating any diff, the assistant restates the user's intent in plain English and waits for Confirm. This builds trust, catches misread requests early, and (bonus) the restatement is plain text so it never hits the JSON bug. It is an additive layer ON TOP of the robustness fix — the apply phase still round-trips multi-line text through JSON, so the robustness fix remains the foundation.

### Relevant Files

- `src/gateway/services/archetype-generator.ts` — `refine()` (398-437), `callLLMWithJsonRetry()` (300-329), `stripFences()` (187-193), `buildRefineSystemPrompt()` (151-185)
- `src/lib/call-llm.ts` — `callLLM()` request body (251-256), Go routing (216-241), content read (296)
- `src/lib/go-models.ts` — `GO_OPENAI_ENDPOINT`, `resolveProvider()`
- `src/gateway/routes/admin-archetype-propose-edit.ts` — propose-edit handler; maps `GENERATION_FAILED` → 422 (409-419)
- `dashboard/src/panels/employees/AssistantTab.tsx` — `handleSubmit` (47-96) + `handleRefine` (98-) error branches; `proposeEdit` client in `dashboard/src/lib/gateway.ts`
- Test target: employee `db2974dc-ab37-4034-9ce2-1c7b91e424b5`, tenant `00000000-0000-0000-0000-000000000003`

---

## Work Objectives

### Core Objective

Make the AI Assistant flow (1) first restate the user's intent in plain English and wait for confirmation, then (2) reliably return a valid diff proposal for change requests that produce large, multi-line instruction text, and (3) show non-technical users a friendly message if anything still fails.

### Concrete Deliverables

- A confirm-understanding step: backend "interpret" endpoint returning a plain-English restatement; chat UI shows it with a Confirm action; Confirm runs the existing propose-edit; replying with a correction re-runs interpret.
- A logged, verified diagnosis of WHY the JSON breaks for the exact failing prompt (raw newlines vs empty content vs truncation), recorded in the notepad.
- Hardened `refine()` LLM call + parse path that survives the model's common JSON mistakes and large outputs.
- Friendly error copy in the UI for the generic-failure path.
- Live E2E proof in the browser using the exact employee + exact prompt: restatement → Confirm → valid diff proposal.

### Definition of Done

- [ ] Sending the exact prompt to the exact employee shows a **plain-English restatement** of intent with a Confirm action.
- [ ] Clicking Confirm returns a **diff proposal card** (not an error), modifying `delivery_steps`/`execution_steps` to instruct the employee to include a PR description + two before/after Mermaid diagrams in its pull requests.
- [ ] No `GENERATION_FAILED` error appears in `/tmp/ai-dev.log` for the test run.
- [ ] If a failure IS forced (e.g. mock invalid JSON), the UI shows friendly copy with NO raw `SyntaxError`/`GENERATION_FAILED`/stack text.
- [ ] `pnpm test:unit`, `pnpm lint`, `pnpm build` all pass.

### Must Have

- A confirm-understanding step that runs BEFORE diff generation: plain-English restatement + explicit user Confirm; correction-by-reply re-interprets.
- The restatement must be plain text (not JSON) so it is immune to the parsing bug.
- Root cause verified by inspecting the actual raw LLM response (logged), not assumed.
- `maxTokens` for refine raised to a value that comfortably fits a full archetype + two Mermaid-diagram instruction blocks.
- Robust JSON acquisition: prefer a JSON `response_format` when the provider supports it; fall back to a tolerant repair/parse for raw-newline-in-string and code-fence cases.
- Empty-`content` (reasoning-only) responses handled explicitly (detected and either re-requested or surfaced as a clean error — never a bare `JSON.parse('')`).
- Friendly UI error copy.

### Must NOT Have (Guardrails)

- **NO** changing the execution model away from `deepseek/deepseek-v4-flash` or editing the model catalog to "work around" the bug.
- **NO** hardcoding any forbidden model ID (`anthropic/claude-sonnet-*`, `claude-opus-*`, `openai/gpt-4o*`).
- **NO** changing the field allowlist, the diff/approve/revert flow, the `archetype_edit_history` schema, or any other already-shipped behavior of the conversational-editing feature. The confirm step is ADDITIVE — it precedes the existing propose-edit; it does not alter how the diff/approve works once generated.
- **NO** persisting chat transcripts OR the restatement (the feature is ephemeral by design).
- **NO** ambiguity-gating or auto-skipping the confirm step — it always runs before a diff is generated (per interview decision).
- **NO** making the confirm step return structured JSON for display — the restatement shown to the user is plain text (immune to the parse bug).
- **NO** swallowing genuine errors silently — a real failure must still log server-side and return 422/500; only the _user-facing copy_ changes.
- **NO** speculative refactor of `call-llm.ts` beyond what the fix needs (add `response_format`/reasoning handling minimally and behind existing routing).
- **NO** edits to deprecated files.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest — `pnpm test:unit`)
- **Automated tests**: Tests-after (add focused unit tests for the new parse/guard logic; the headline verification is live browser E2E)
- **Framework**: vitest
- **Reasoning**: The core bug is an integration/LLM-shape problem best proven by a real browser run; unit tests lock in the deterministic parse/guard logic.

### QA Policy

Every task includes agent-executed QA. Evidence → `.sisyphus/evidence/`.

- **Backend logic**: Bash (`pnpm test:unit -- <file>`, `pnpm build`, `pnpm lint`)
- **LLM call / live path**: Bash (curl the propose-edit endpoint with SERVICE_TOKEN) + `/tmp/ai-dev.log` inspection
- **UI**: Playwright against `http://localhost:7700/dashboard/...?tab=assistant`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (diagnose + independent groundwork):
├── Task 1: Diagnose — log raw LLM response for the exact failing prompt [deep]
├── Task 4: Friendly UI error copy in AssistantTab [visual-engineering]
└── Task 6: Backend "interpret-request" endpoint (plain-English restatement) [deep]

Wave 2 (backend robustness, informed by diagnosis):
├── Task 2: Harden refine LLM call (maxTokens, response_format, empty-content guard) [deep]
└── Task 3: Robust JSON acquisition + repair in callLLMWithJsonRetry [deep]

Wave 3 (wire UI + tests):
├── Task 7: Wire confirm-understanding flow into AssistantTab [visual-engineering]
└── Task 5: Unit tests for parse/guard logic + interpret endpoint [unspecified-high]

Wave FINAL:
├── F1: Plan compliance + scope fidelity (oracle)
├── F2: Code quality + build/lint/test (unspecified-high)
└── F3: Live browser E2E: restatement → confirm → diff, exact employee + prompt (unspecified-high + playwright)
-> Present results -> user okay

Critical Path: T1 → T2 → T3 → T7 → F3
```

### Dependency Matrix

- **T1 Diagnose**: depends none — blocks T2, T3
- **T4 UI copy**: depends none — blocks T7, F3
- **T6 Interpret endpoint**: depends none — blocks T7, F3
- **T2 Harden call**: depends T1 — blocks T5, T7, F3
- **T3 Robust parse**: depends T1 — blocks T5, T7, F3
- **T7 Wire confirm UI**: depends T4, T6, T2, T3 — blocks F3
- **T5 Unit tests**: depends T2, T3, T6 — blocks F2
- **F1/F2/F3**: depend all impl tasks

---

## TODOs

- [x] 1. **Diagnose — capture the raw LLM response for the exact failing prompt**

  **What to do**:
  - Add temporary, clearly-marked debug logging in `callLLMWithJsonRetry` (`src/gateway/services/archetype-generator.ts`) that logs: the raw `result.content` (full, untruncated), its `.length`, `completionTokens`/`promptTokens` from the LLM result, and the byte at the JSON error position. Tag logs with `DIAGNOSE-REFINE` so they're easy to grep and remove.
  - Reproduce by calling the propose-edit endpoint with the EXACT prompt against the EXACT employee:
    ```bash
    curl -sS -X POST \
      http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/db2974dc-ab37-4034-9ce2-1c7b91e424b5/propose-edit \
      -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
      -d '{"request_text":"Please help me change this GitHub code engineer so that every time a pull request is submitted, it contains: - A high-level description of what changed - A Mermaid diagram showing any architectural changes made, with a before-and-after view in two Separate Mermaid diagrams."}'
    ```
  - Inspect `/tmp/ai-dev.log` for the `DIAGNOSE-REFINE` output. Classify the actual failure into one (or more) of: (a) raw newlines inside a JSON string value, (b) empty/blank `content` (reasoning-only response), (c) genuinely truncated at `max_tokens`, (d) code fences / leading prose.
  - **Record the verified classification + the raw response excerpt in the notepad** at `.sisyphus/notepads/2026-06-13-1621-ai-assistant-refine-json-failure-fix/diagnosis.md`. This drives T2/T3.
  - Leave the debug logging in place ONLY until T2/T3 are done; F2 will verify it's removed.

  **Must NOT do**: Do not commit the debug logging permanently. Do not change model or prompts in this task.

  **Recommended Agent Profile**:
  - **Category**: `deep` — needs careful runtime investigation and classification.
  - **Skills**: [] (no domain skill needed; reads logs + curl)

  **Parallelization**: Can run in parallel with T4. Blocks T2, T3.

  **References**:
  - `src/gateway/services/archetype-generator.ts:300-329` — `callLLMWithJsonRetry` (where to add logging)
  - `src/lib/call-llm.ts:294-310` — where `content`/usage are returned
  - `/tmp/ai-dev.log` — existing `GENERATION_FAILED` lines show error positions to correlate
  - `SERVICE_TOKEN` is in `.env`

  **Acceptance Criteria**:
  - [ ] `.sisyphus/notepads/2026-06-13-1621-ai-assistant-refine-json-failure-fix/diagnosis.md` exists with the verified failure classification and a raw-response excerpt.

  **QA Scenarios**:

  ```
  Scenario: Reproduce and classify the failure
    Tool: Bash (curl) + log inspection
    Steps:
      1. Ensure gateway running (curl localhost:7700/health -> 200)
      2. Run the propose-edit curl above with the exact prompt
      3. grep "DIAGNOSE-REFINE" /tmp/ai-dev.log -> raw content captured
      4. Classify failure mode; write diagnosis.md
    Expected Result: diagnosis.md names the concrete cause (a/b/c/d) with evidence
    Evidence: .sisyphus/evidence/task-1-diagnosis.txt
  ```

  **Commit**: NO (diagnosis only; logging removed by T2/T3)

- [x] 4. **Friendly UI error copy in AssistantTab**

  **What to do**:
  - In `dashboard/src/panels/employees/AssistantTab.tsx`, both the `handleSubmit` (lines ~82-92) and `handleRefine` catch branches currently render `I wasn't able to make that change: ${errMsg}` where `errMsg` can be the raw `GENERATION_FAILED: ... SyntaxError ...`. Replace with friendly, non-technical copy that does NOT leak `GENERATION_FAILED`, `SyntaxError`, JSON, or stack text.
  - Suggested copy: "I couldn't turn that into a change just now — the request may have been too complex to process. Try rephrasing it a bit, or breaking it into smaller changes." Keep it ephemeral (a normal assistant text message), consistent with existing message styling.
  - If the error is a known validation error (e.g. allowlist/trigger/input invalid) the backend returns specific field reasons — preserve showing those clearly (they are already user-actionable). Only the generic `GENERATION_FAILED`/500 path gets the friendly fallback. Detect via the error shape/status surfaced by `proposeEdit` in `dashboard/src/lib/gateway.ts`.

  **Must NOT do**: Do not change the success/proposal rendering, the approve/deny/refine flow, or the loading guard. Do not remove server-side logging.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — dashboard React/copy change.
  - **Skills**: [`react-dashboard`] — repo dashboard conventions (non-technical end-user language rule).

  **Parallelization**: Can run in parallel with T1. Blocks F3.

  **References**:
  - `dashboard/src/panels/employees/AssistantTab.tsx:82-96` — handleSubmit catch
  - `dashboard/src/panels/employees/AssistantTab.tsx:125-` — handleRefine catch (mirror the change)
  - `dashboard/src/lib/gateway.ts` — `proposeEdit` error shape/status
  - AGENTS.md "End-user language is non-technical" convention

  **Acceptance Criteria**:
  - [ ] On a forced failure, the assistant message contains friendly copy and NONE of: `GENERATION_FAILED`, `SyntaxError`, `JSON`, stack frames.

  **QA Scenarios**:

  ```
  Scenario: Friendly copy on generic failure
    Tool: Playwright
    Preconditions: Temporarily force proposeEdit to reject (or test against pre-fix backend)
    Steps:
      1. Open AI Assistant tab for the test employee
      2. Send any request that triggers a 422/500
      3. Read the assistant error bubble text
    Expected Result: Friendly sentence; no technical tokens present
    Evidence: .sisyphus/evidence/task-4-friendly-error.png
  ```

  **Commit**: YES — `fix(dashboard): show friendly error in AI assistant when a change cannot be proposed`

- [x] 2. **Harden the refine LLM call (maxTokens, response_format, reasoning/empty-content guard)**

  **What to do**:
  - In `refine()` (`src/gateway/services/archetype-generator.ts:414`), raise `maxTokens` from 6000 to a value that comfortably fits a full archetype JSON + two Mermaid diagrams (target ~16000; pick based on T1's observed `completionTokens`). Document the chosen number with a brief comment referencing the diagnosis.
  - In `callLLM` (`src/lib/call-llm.ts:251-256`), add an OPTIONAL `responseFormat` passthrough so refine can request strict JSON output (`response_format: { type: 'json_object' }`) when the provider supports it. Wire it via the existing `CallLLMOptions` type (around line 20-30) and only set it on the request body when provided. Then have `refine()` opt in.
    - **Provider caveat**: the OpenCodeGo OpenAI endpoint (`GO_OPENAI_ENDPOINT`) may or may not honor `response_format`. Send it; do NOT hard-fail if ignored — T3's robust parse is the safety net. If T1 shows the Go endpoint returns empty `content` with reasoning, also handle that here (see next bullet).
  - **Empty/reasoning-only content guard**: in `callLLM` after reading `content` (line 296), if `content` is empty but the provider returned reasoning/other fields, detect it and surface a distinct, catchable error (e.g. `LLMEmptyContentError`) instead of returning `''`. `callLLMWithJsonRetry` already retries once — ensure an empty first response triggers the retry rather than a bare `JSON.parse('')`.
  - Keep all changes minimal and behind existing routing; do NOT restructure `call-llm.ts`.

  **Must NOT do**: Do not change the model. Do not add forbidden model IDs. Do not alter non-refine callers' behavior (responseFormat is opt-in; default unchanged). Do not remove cost circuit-breaker or retry logic.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: [`data-access-conventions`] — touches the shared LLM HTTP client + config patterns.

  **Parallelization**: Depends T1. Can run alongside T3 (different concerns: call config vs parse), but both edit nearby code — coordinate; if same agent, do T2 then T3 sequentially. Blocks T5, F3.

  **References**:
  - `src/gateway/services/archetype-generator.ts:414` — refine llmOptions (maxTokens)
  - `src/lib/call-llm.ts:20-35` — `CallLLMOptions` type (add optional `responseFormat`)
  - `src/lib/call-llm.ts:251-256` — request body assembly (conditionally add `response_format`)
  - `src/lib/call-llm.ts:296` — content read (empty-content guard)
  - `src/lib/go-models.ts:42` — `GO_OPENAI_ENDPOINT`
  - T1 diagnosis.md — chosen maxTokens + whether response_format/empty-content applies

  **Acceptance Criteria**:
  - [ ] `refine()` requests sufficient `maxTokens` and (where supported) JSON response_format.
  - [ ] Empty-content responses no longer cause a bare `JSON.parse('')`; they trigger retry or a clean catchable error.
  - [ ] `pnpm build` passes; no forbidden model IDs introduced.

  **QA Scenarios**:

  ```
  Scenario: Refine call carries new options
    Tool: Bash (unit/integration assertion or curl + DIAGNOSE log)
    Steps:
      1. Re-run the exact-prompt curl from T1
      2. Confirm completionTokens now well within the raised cap and content non-empty
    Expected Result: content is a parseable (or repairable) JSON object
    Evidence: .sisyphus/evidence/task-2-refine-call.txt
  ```

  **Commit**: YES (group with T3) — `fix(archetype-generator): harden refine LLM call and JSON parsing for large multi-line proposals`

- [x] 3. **Robust JSON acquisition + repair in callLLMWithJsonRetry**

  **What to do**:
  - In `callLLMWithJsonRetry` (`src/gateway/services/archetype-generator.ts:300-329`), make parsing tolerant of the model's most common mistakes identified in T1:
    1. Keep `stripFences()` (code fences / leading "json").
    2. If `JSON.parse` fails, attempt a **bounded, safe repair** before the LLM retry: extract the outermost `{...}` object, and repair raw newlines/tabs/carriage-returns that appear **inside string values** by escaping them (`\n`, `\t`, `\r`). This directly fixes the "Unterminated string" case from Mermaid content. Implement as a small pure helper (e.g. `repairJsonStrings(raw)`) so it's unit-testable.
    3. Only if repair still fails, do the existing one-shot LLM retry ("respond with ONLY valid JSON"), then repair+parse that too.
    4. Guard against empty content (from T2's `LLMEmptyContentError`/empty string) — treat as a parse failure that triggers retry, never `JSON.parse('')`.
  - The repair must be conservative: never alter content outside string values, never change keys/structure; if the repaired string still doesn't parse, fall through to the existing error path (so genuine garbage still fails cleanly → 422).

  **Must NOT do**: Do not introduce a third-party "json5"/"jsonrepair" dependency unless T1 proves the simple newline-escape repair is insufficient (prefer zero new deps). Do not weaken the final throw — invalid output must still surface `GENERATION_FAILED`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — careful string/parse logic with edge cases.
  - **Skills**: []

  **Parallelization**: Depends T1. Pairs with T2. Blocks T5, F3.

  **References**:
  - `src/gateway/services/archetype-generator.ts:187-193` — `stripFences`
  - `src/gateway/services/archetype-generator.ts:300-329` — `callLLMWithJsonRetry` (target)
  - `src/gateway/services/archetype-generator.ts:425-432` — refine's parse + GENERATION_FAILED throw (must still trigger on true failure)
  - T1 diagnosis.md — confirms the dominant failure mode the repair must fix

  **Acceptance Criteria**:
  - [ ] A response with raw newlines inside a string value parses successfully after repair.
  - [ ] Genuinely invalid output still throws → `GENERATION_FAILED` (no false "success").
  - [ ] `repairJsonStrings` is a pure, exported (or test-accessible) helper.

  **QA Scenarios**:

  ```
  Scenario: Newline-in-string repair
    Tool: Bash (unit test, added in T5)
    Steps:
      1. Feed a JSON string with a literal newline inside execution_steps value
      2. repairJsonStrings -> JSON.parse succeeds
    Expected Result: parsed object preserves the multi-line content as \n-escaped
    Evidence: .sisyphus/evidence/task-3-repair.txt
  ```

  **Commit**: YES (group with T2) — `fix(archetype-generator): harden refine LLM call and JSON parsing for large multi-line proposals`

- [x] 5. **Unit tests for parse/guard logic + interpret method**

  **What to do**:
  - Add focused unit tests (vitest, `tests/unit/`) for the new deterministic logic from T2/T3:
    - `repairJsonStrings`: raw newline inside a string value → parseable; tab/CR variants; already-valid JSON passes through unchanged; truly broken JSON still throws/returns unrepairable.
    - Empty-content handling: an empty/reasoning-only LLM result triggers the retry path (mock the LLM fn), not a bare `JSON.parse('')`.
    - `callLLMWithJsonRetry`: first attempt invalid-with-newlines → repaired success without needing the LLM retry; genuinely invalid twice → throws.
  - Add a test for the new `interpretRequest()` generator method (from T6): with a mocked `callLLMFn`, it returns the trimmed plain-text restatement and does NOT call `JSON.parse` (i.e. a non-JSON LLM reply still succeeds).
  - Mock the LLM via the existing `callLLMFn` injection pattern (`ArchetypeGenerator` constructor takes `callLLMFn`).

  **Must NOT do**: Do not hit a real LLM. Do not add integration/DB tests here.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**: Depends T2, T3, T6. Blocks F2.

  **References**:
  - `src/gateway/services/archetype-generator.ts:298` — constructor injects `callLLMFn` (mock point)
  - existing generator tests (search `tests/unit` for `archetype-generator`) for patterns
  - `tests/helpers/` — shared mock utilities

  **Acceptance Criteria**:
  - [ ] New tests pass: `pnpm test:unit` green.
  - [ ] Tests cover repair success, passthrough, unrepairable-throws, empty-content retry, and interpret-returns-plain-text.

  **QA Scenarios**:

  ```
  Scenario: Run new unit tests
    Tool: Bash
    Steps:
      1. pnpm test:unit -- archetype-generator
    Expected Result: all new cases pass, 0 failures
    Evidence: .sisyphus/evidence/task-5-units.txt
  ```

  **Commit**: YES — `test(archetype-generator): cover refine JSON parse, empty-content guard, and interpret-request`

- [x] 6. **Backend "interpret-request" endpoint (plain-English restatement)**

  **What to do**:
  - Add a new admin endpoint that takes the user's raw request + the current archetype and returns a SHORT, plain-English restatement of what the assistant understood the user wants changed — as PLAIN TEXT, not structured JSON for display. Example output for the test prompt: "I'll update this employee's instructions so that every pull request it opens includes a high-level summary of the changes and two Mermaid diagrams — one showing the architecture before the change and one showing it after."
  - Mirror the existing propose-edit endpoint's shape: same route group (`/admin/tenants/:tenantId/archetypes/:archetypeId/...`), same auth (`authMiddleware` + `requireTenantRole`), same `sendError`/`sendSuccess` helpers, same `request_text` Zod body (min 1, max 500). Suggested path: `.../interpret-request`.
  - Implement the restatement via a small method on the archetype generator that reuses the injected `callLLMFn` with a focused system prompt: "Restate, in one or two plain sentences for a non-technical user, what change they are asking to make to this employee. Do not output JSON. Do not make the change." Because the output is plain prose, it does NOT go through `callLLMWithJsonRetry` — return the text directly (trim only). This is what makes the confirm phase immune to the JSON bug.
  - Return `{ understanding: string }`. Keep it ephemeral — do NOT persist it anywhere.
  - Add a client function `interpretRequest(tenantId, archetypeId, requestText)` in `dashboard/src/lib/gateway.ts` and a return type in `dashboard/src/lib/types.ts`.

  **Must NOT do**: Do not have this endpoint apply or persist any change. Do not return JSON-for-display. Do not introduce a new LLM model. Do not duplicate the allowlist logic here (interpret does not edit anything).

  **Recommended Agent Profile**:
  - **Category**: `deep` — new endpoint + generator method + client wiring.
  - **Skills**: [`api-design`, `data-access-conventions`] — route conventions (sendError/sendSuccess, Zod, UUID_REGEX, tenant-scoped) and LLM/config access patterns.

  **Parallelization**: Independent (no diagnosis dependency — it's a new path). Runs in Wave 1. Blocks T7, T5, F3.

  **References**:
  - `src/gateway/routes/admin-archetype-propose-edit.ts:1-47` — endpoint skeleton, auth, Zod body to mirror
  - `src/gateway/routes/admin-archetype-propose-edit.ts:220-260` — how the route loads the archetype + calls the generator (mirror the load, NOT the allowlist/diff)
  - `src/gateway/services/archetype-generator.ts:298,398-421` — constructor `callLLMFn` injection + `refine()` as the pattern for a new `interpretRequest()` method (but plain-text output, no JSON parse)
  - `dashboard/src/lib/gateway.ts` — `proposeEdit` client function to mirror for `interpretRequest`
  - `dashboard/src/lib/types.ts` — `ProposalResponse` type as the pattern for the new return type
  - `api-design` skill — admin endpoint catalog + response-shape rules

  **Acceptance Criteria**:
  - [ ] `POST .../interpret-request` with the exact prompt returns `{ understanding: <plain sentence(s) describing the PR-diagram change> }`, HTTP 200.
  - [ ] Endpoint persists nothing and changes nothing.
  - [ ] `interpretRequest` client function + type exist.

  **QA Scenarios**:

  ```
  Scenario: Interpret returns plain-English restatement
    Tool: Bash (curl)
    Steps:
      1. curl POST .../interpret-request with the exact prompt + SERVICE_TOKEN
      2. Inspect JSON body
    Expected Result: { understanding: "..." } describing PR description + two before/after Mermaid diagrams; no error, nothing persisted
    Evidence: .sisyphus/evidence/task-6-interpret.json

  Scenario: Interpret never mutates the archetype
    Tool: Bash (psql)
    Steps:
      1. Note archetype updated_at before
      2. Call interpret-request
      3. Re-check updated_at
    Expected Result: unchanged
    Evidence: .sisyphus/evidence/task-6-no-mutation.txt
  ```

  **Commit**: YES — `feat(archetype): add interpret-request endpoint for confirm-understanding step`

- [x] 7. **Wire confirm-understanding flow into AssistantTab**

  **What to do**:
  - Change the chat flow so a user request goes: type request → call `interpretRequest` → show the plain-English restatement as an assistant message with a **Confirm** action (and a hint that the user can reply to correct it) → on Confirm, call the existing `proposeEdit` and render the diff proposal card exactly as today → Approve/Deny/Refine continue unchanged.
  - If the user replies with a correction instead of confirming, re-run `interpretRequest` with the new text and show the updated restatement (loop until Confirm).
  - Add a new message kind for the restatement-with-confirm (alongside the existing `text` and `proposal` kinds). Keep the unsaved-changes guard active while a restatement is pending confirmation or a proposal is pending.
  - Preserve all existing behavior: loading spinner, scroll-to-bottom, history list/revert, friendly error copy from T4 (now applied to BOTH interpret and propose failures).
  - Keep copy non-technical (react-dashboard end-user language rule).

  **Must NOT do**: Do not change the diff card, approve handler, history, or revert. Do not auto-confirm. Do not persist the restatement.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — React chat-flow change.
  - **Skills**: [`react-dashboard`] — dashboard conventions, end-user language.

  **Parallelization**: Depends T4 (error copy), T6 (interpret endpoint+client), and the backend robustness (T2/T3) so Confirm actually succeeds. Wave 3. Blocks F3.

  **References**:
  - `dashboard/src/panels/employees/AssistantTab.tsx:19-29` — `MessageKind`/`ChatMessage` (add restatement+confirm kind)
  - `dashboard/src/panels/employees/AssistantTab.tsx:47-96` — `handleSubmit` (now calls interpret first)
  - `dashboard/src/panels/employees/AssistantTab.tsx:98-` — `handleRefine` (correction path → re-interpret)
  - `dashboard/src/panels/employees/sections/ProposalDiffCard.tsx` — unchanged; rendered after Confirm
  - `dashboard/src/lib/gateway.ts` — `interpretRequest` (from T6) + existing `proposeEdit`

  **Acceptance Criteria**:
  - [ ] Sending a request first shows a plain-English restatement + Confirm action (no diff yet).
  - [ ] Confirm produces the diff proposal card.
  - [ ] Replying with a correction re-shows an updated restatement.
  - [ ] Existing approve/deny/refine/history/revert all still work.

  **QA Scenarios**:

  ```
  Scenario: Restatement → Confirm → diff (happy path)
    Tool: Playwright
    Steps:
      1. Open AI Assistant tab for the test employee
      2. Type the exact prompt, Send
      3. Assert a restatement message + Confirm button appears (no diff yet)
      4. Click Confirm
      5. Assert a diff proposal card renders
    Expected Result: two-phase flow works; diff card present
    Evidence: .sisyphus/evidence/task-7-confirm-flow.png

  Scenario: Correction re-interprets
    Tool: Playwright
    Steps:
      1. Send a request, get restatement
      2. Instead of Confirm, reply "actually only on the main branch"
      3. Assert an updated restatement appears
    Expected Result: restatement reflects the correction; still awaits Confirm
    Evidence: .sisyphus/evidence/task-7-correction.png
  ```

  **Commit**: YES — `feat(dashboard): add confirm-understanding step before generating an edit`

- [x] 8. **Documentation freshness**

  **What to do**:
  - If any convention or behavior changed (e.g. new optional `responseFormat` on `callLLM`, refine `maxTokens`), add a short note where appropriate. Check `data-access-conventions` skill content and AGENTS.md "AI employee injection"/LLM sections for accuracy; update only if something is now wrong or missing. Do NOT add volatile facts (no token-count tallies that a tweak invalidates) — describe the capability, not the exact number.

  **Must NOT do**: Do not create new doc files unless genuinely warranted. No volatile counts.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: [`writing-guidelines`]

  **Parallelization**: After impl tasks. Blocks F1.

  **References**: `AGENTS.md` (LLM/model sections), `.opencode/skills/data-access-conventions/SKILL.md`

  **Acceptance Criteria**:
  - [ ] Docs accurately reflect the optional `responseFormat` passthrough and refine hardening, with no volatile numbers.

  **Commit**: YES — `docs: note optional response_format passthrough and refine hardening`

---

## Final Verification Wave

- [x] F1. **Plan compliance + scope fidelity** — `oracle`
      Read this plan. Verify every Must-Have present and every Must-Not-Have absent (grep for forbidden model IDs, confirm no allowlist/history/diff-flow changes, confirm model unchanged). Diff each impl task's "What to do" against the actual git diff for 1:1 fidelity and no cross-task contamination.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code quality + build** — `unspecified-high`
      Run `pnpm build`, `pnpm lint`, `pnpm test:unit`. Review changed files for `as any`, empty catches, leftover debug logging from T1, AI slop, unused imports.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Live browser E2E (exact employee + exact prompt)** — `unspecified-high` + `playwright` skill
      Pre-flight: gateway healthy (`curl localhost:7700/health`), single gateway PID. Navigate to `http://localhost:7700/dashboard/employees/db2974dc-ab37-4034-9ce2-1c7b91e424b5?tenant=00000000-0000-0000-0000-000000000003&tab=assistant`. Type the EXACT prompt, click Send. Assert FIRST a **plain-English restatement + Confirm** appears (no diff yet) and the restatement correctly describes "PR includes a summary + two before/after Mermaid diagrams". Click Confirm. Then assert a **diff proposal card renders** (not an error), touching `execution_steps`/`delivery_steps` with the PR-description + two-Mermaid-diagram instruction. Tail `/tmp/ai-dev.log` — assert NO `GENERATION_FAILED` for this run. Screenshots (restatement + diff) to `.sisyphus/evidence/final-qa/`.
      Output: `Restatement shown [YES/NO] | Diff after confirm [YES/NO] | GENERATION_FAILED in logs [NONE/FOUND] | VERDICT`

---

## Commit Strategy

- T4: `fix(dashboard): show friendly error in AI assistant when a change cannot be proposed`
- T6: `feat(archetype): add interpret-request endpoint for confirm-understanding step`
- After Wave 2 (T2+T3): `fix(archetype-generator): harden refine LLM call and JSON parsing for large multi-line proposals`
- T7: `feat(dashboard): add confirm-understanding step before generating an edit`
- T5: `test(archetype-generator): cover refine JSON parse, empty-content guard, and interpret-request`
- T8: `docs: note interpret-request endpoint and refine hardening`
- Plan close: `chore(sisyphus): close ai-assistant-confirm-and-refine-fix plan — user approved`

## Success Criteria

### Verification Commands

```bash
pnpm build && pnpm lint && pnpm test:unit
# Live: send exact prompt to exact employee in AI Assistant tab -> diff proposal card, no GENERATION_FAILED in /tmp/ai-dev.log
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] Exact prompt on exact employee yields a valid diff proposal in the UI
- [x] Friendly error copy verified
- [x] Docs updated if behavior/conventions changed

---

## Post-Approval Closeout

- [ ] 9. **Notify completion** — After Victor gives explicit okay in the Final Wave, send Telegram: `tsx scripts/telegram-notify.ts "✅ AI Assistant confirm-step + refine fix complete — restatement → confirm → valid proposal works on the exact employee, final wave passed. Come back to review."`
