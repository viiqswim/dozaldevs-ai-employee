# Fix LLM Extraction Truncation — Reasoning-Model Token Starvation

## TL;DR

> **Quick Summary**: The Slack bot ignores inputs provided in the initial @mention (e.g. a date) and re-asks for them ~50-62% of the time. Root cause: `extractInputsFromText` calls a reasoning model (`deepseek/deepseek-v4-flash`) with `maxTokens: 200`; the model burns the whole budget on internal reasoning and emits truncated/empty JSON → `JSON.parse` throws → returns `{}` → bot re-prompts. Fix = raise the token ceiling to 800 + a bounded 3-attempt retry loop with escalating budget, entirely inside `extractInputsFromText` (zero call-site changes).
>
> **Deliverables**:
>
> - `extractInputsFromText` raises `maxTokens` 200 → 800, adds a bounded retry loop (3 attempts, 800 → 1600 → 3200), per-attempt timeout, and a strengthened JSON-only prompt
> - Retry triggers ONLY on empty/whitespace content OR `JSON.parse` throw — never on a valid parse (e.g. `{"date": null}`)
> - Retry aborts immediately on `CostCircuitBreakerError` / `RateLimitExceededError`
> - Unit tests (sequenced mock) covering retry success, exhaustion, no-retry-on-valid-null, escalating budget, breaker-abort, prompt nudge
> - Real reproduction QA (8× live extraction) + Slack E2E confirming the date-in-initial-message path
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single source file; sequential (impl → tests → QA)
> **Critical Path**: Task 1 (impl) → Task 2 (tests) → Final Verification Wave

---

## Context

### Original Request

A user @mentioned the bot: "puedes generarme el itinerario de limpieza para **Junio 8, 2026**?" (Spanish: "can you generate the cleaning itinerary for June 8, 2026?"). The bot replied "Before I can trigger cleaning-schedule, I need a few details: 1. Checkout Date — ..." — re-asking for a date the user already provided. The user wants the intent and inputs detected from the initial Slack message.

### Interview Summary

**Key Discussions**:

- This is a DIFFERENT bug from the previously-fixed thread-reply i18n bug. This one is in the INITIAL @mention → Confirm → extraction path.
- Verified the date text IS preserved end-to-end (app_mention strips only `<@mention>`; interaction-handler passes text through; slack-trigger-handler embeds full text in the confirmation card button value at `slack-trigger-handler.ts:213`). The date is NOT lost in transit — extraction is the single failure point.

**Research Findings (REPRODUCED, not speculation)**:

- `extractInputsFromText` (`src/lib/extract-inputs.ts:53`) calls gateway LLM with `maxTokens: 200`, then `JSON.parse(stripFences(content))` at line 62; on any throw it catches and returns `{}` (lines 77-80).
- Gateway model = `deepseek/deepseek-v4-flash` (from `platform_settings.gateway_llm_model`), routed via OpenCodeGo (OpenAI-compatible endpoint). It is a REASONING model — reasoning tokens count toward `completion_tokens`.
- Ran the raw `callLLM` 6× with the exact user message. Results keyed by `completion_tokens`:
  - `compTok=200` → content TRUNCATED (`{"date": "2026-06`) or EMPTY (`""`) → `JSON.parse` throws → `{}`
  - `compTok=182-192` (under ceiling) → valid `{"date":"2026-06-08"}` → success
  - Failure rate observed: 5/8 and 3/6 (~50-62%).
- Probed the Go endpoint for `finish_reason` / `reasoning_content` — NOT returned. So the retry trigger must be a HEURISTIC (empty/unparseable content), NOT `finish_reason`. `callLLM` will NOT be modified.
- `callLLM` already guarantees `content` is a string (`call-llm.ts:253` uses `?? ''`).
- The $50/day cost circuit breaker is checked at the top of every `callLLM` (`call-llm.ts`) — retries are independently metered and protected.
- Slack `ack()` fires BEFORE extraction (async continuation) — retry latency does not threaten the 3s ack window.

### Oracle Consultation (ses_16779a62effeWS7YXJUjfJ1LJA)

Validated the two-layer defense (raise maxTokens + bounded retry), recommended escalating budget (800→1600→3200), confirmed raising the ceiling alone is insufficient (non-deterministic reasoning consumption), and flagged: verify `finish_reason` availability (done — absent → use heuristic), watch the cost breaker on retry storms, keep the fix internal to `extractInputsFromText`.

### Metis Review

**Identified Gaps** (addressed in this plan):

- **Call-site count corrected**: there are **3 call expressions across 2 files** — `handlers.ts:1602`, `slack-trigger-handler.ts:331` (single-input), `slack-trigger-handler.ts:344` (multi-input). ZERO call sites change.
- **Single-input raw-text fallback** (`slack-trigger-handler.ts:334-341`, from the prior plan) masks this bug by shoving raw text into the field on `{}`. The fix REDUCES its activation frequency. Explicitly OUT OF SCOPE to modify — documented only.
- **Do NOT retry on a valid parse** that yields no usable fields (`{"date": null}` is a legitimate "not found" — retrying wastes money). Retry ONLY on empty/whitespace content OR parse-throw.
- **Abort retry** on `CostCircuitBreakerError` / `RateLimitExceededError` — propagate to outer catch → `{}`, do not count as retryable.
- **Per-attempt timeout** must be tighter than the 120s `callLLM` default (≤20s) so 3 attempts cannot stack to minutes.
- **Failure contract preserved**: exhausted retries still return `{}` (graceful degradation, identical to today).
- **Prompt nudge** promoted to mandatory (defense-in-depth for `temperature: 0` determinism).
- **Test helper**: existing `makeCallLLM` returns one fixed value — add `makeSequencedCallLLM([...])` for fail→fail→succeed sequences without breaking the 11 existing tests.

---

## Work Objectives

### Core Objective

Make `extractInputsFromText` reliably return the extracted inputs when the user's message contains them, by giving the reasoning model enough token budget and retrying on truncated/empty responses — so the Slack bot triggers the task instead of re-asking for already-provided inputs.

### Concrete Deliverables

- Modified `src/lib/extract-inputs.ts`: `maxTokens` base 800, bounded 3-attempt retry loop with escalating ceiling, per-attempt timeout, strengthened JSON-only prompt, breaker-abort, structured retry logging.
- New unit tests in `tests/lib/extract-inputs.test.ts` (sequenced mock helper + 8 new cases).

### Definition of Done

- [ ] Live reproduction: 8/8 extractions of "puedes generarme el itinerario de limpieza para Junio 8, 2026?" return `{"date":"2026-06-08"}` (vs. pre-fix ~38-50% failure).
- [ ] Slack E2E: @mention with the date-bearing Spanish message → Confirm → task dispatched (NOT re-prompted); DB `raw_event->'inputs'->>'date'` = `2026-06-08`.
- [ ] `pnpm test -- --run tests/lib/extract-inputs.test.ts` → 0 failures (11 existing + 8 new).
- [ ] No changes outside `src/lib/extract-inputs.ts` and `tests/lib/extract-inputs.test.ts`.

### Must Have

- `maxTokens` base raised to 800, escalating 800 → 1600 → 3200 across attempts.
- Bounded `for` loop: exactly 3 attempts max (initial + 2 retries). No `while`, no recursion.
- Retry trigger heuristic: empty/whitespace `content` OR `JSON.parse` throw — ONLY these.
- Retry ABORT on `CostCircuitBreakerError` / `RateLimitExceededError` (propagate → `{}`).
- Per-attempt timeout ≤ 20s (passed via `callLLM`'s `timeoutMs`).
- Strengthened JSON-only system prompt (discourage explanation/reasoning prose).
- Structured warning log per retry: `{ attempt, maxTokens, reason, contentPreview }`.
- Failure contract unchanged: exhausted retries return `{}`.

### Must NOT Have (Guardrails)

- Do NOT modify `callLLM` signature/return (no `finish_reason` surfacing — Go omits it).
- Do NOT change `extractInputsFromText`'s signature or return type.
- Do NOT change any call site (`handlers.ts`, `slack-trigger-handler.ts`) — the fix is internal.
- Do NOT modify the single-input raw-text fallback in `slack-trigger-handler.ts:334-341` (separate path; document only).
- Do NOT touch the select/options filter logic (`extract-inputs.ts:71`) — orthogonal to token budget.
- Do NOT hardcode any `anthropic/claude-*` or `openai/gpt-*` model string anywhere (model stays swappable).
- Do NOT change the gateway model or `platform_settings`.
- Do NOT retry on a successful parse that yields no fields (e.g. `{"date": null}`).
- Do NOT use a `while` loop or recursion for retries (unbounded-loop risk).

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (Tests-after — extend `tests/lib/extract-inputs.test.ts`)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA. Evidence saved to `.sisyphus/evidence/`.

- **Library logic**: Bash (Vitest) — run tests, assert pass counts and call counts
- **Live LLM behavior**: Bash (tsx reproduction harness) — 8× extraction, assert success rate
- **Slack E2E**: real @mention via the platform + DB assertion (per AGENTS.md mandatory E2E wave)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (implementation — single file, sequential):
└── Task 1: Add retry loop + raise maxTokens + prompt nudge in extract-inputs.ts [quick]

Wave 2 (tests — after impl):
└── Task 2: Add sequenced-mock helper + 8 retry/edge tests [quick]

Wave FINAL (after impl + tests):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — live 8x reproduction + Slack E2E (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → F1-F4 → user okay
Note: Single-file change — intentionally sequential, no parallelism benefit.
```

### Dependency Matrix

| Task       | Depends On | Blocks | Wave |
| ---------- | ---------- | ------ | ---- |
| 1          | —          | 2      | 1    |
| 2          | 1          | F1-F4  | 2    |
| 3 (notify) | F1-F4      | —      | post |

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`
- **Wave 2**: T2 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = the unit of work. EVERY task has Recommended Agent Profile + QA Scenarios.

- [x] 1. Add bounded retry loop, raise maxTokens, strengthen prompt in `extractInputsFromText`

  **What to do**:
  - In `src/lib/extract-inputs.ts`, refactor the single `callLLMFn` call (lines 50-62) into a bounded retry loop INSIDE the existing `try` block. Keep the function signature and `{}`-on-failure return contract identical.
  - **Token ceiling**: base `800`, escalate per attempt: attempt 1 → 800, attempt 2 → 1600, attempt 3 → 3200. Use a local `const MAX_ATTEMPTS = 3` and compute `maxTokens = 800 * 2 ** attemptIndex` (or an explicit `[800, 1600, 3200]` array).
  - **Per-attempt timeout**: pass `timeoutMs: 20_000` to each `callLLMFn` call so 3 attempts cannot stack to minutes.
  - **Loop body** (per attempt):
    1. Call `callLLMFn({ taskType: 'review', temperature: 0, maxTokens: <escalating>, timeoutMs: 20_000, messages })`.
    2. `const raw = (llmResult.content ?? '').trim()`.
    3. If `raw` is empty/whitespace → log retry `{ attempt, maxTokens, reason: 'empty' }` and `continue` to next attempt (or fall through to `{}` if last attempt).
    4. `const stripped = stripFences(raw)`. Try `JSON.parse(stripped)` in a NESTED try/catch:
       - On throw → log retry `{ attempt, maxTokens, reason: 'parse_error', contentPreview: stripped.slice(0, 80) }` and `continue` (or fall through to `{}` if last attempt).
       - On success → break out and run the EXISTING field-mapping logic (lines 64-74, unchanged: null/undefined skip, select/options filter). **Return the mapped result immediately — do NOT retry a successful parse even if it yields no fields.**
  - **Breaker abort**: wrap each `callLLMFn` call so that if it throws `CostCircuitBreakerError` or `RateLimitExceededError`, the loop STOPS immediately (re-throw to the outer catch, or break) → outer catch returns `{}`. These must NOT be treated as retryable. Import these error classes from `./errors.js`.
  - **Prompt nudge**: strengthen the system prompt (line 28-36) — the existing `'Do not include any other text.'` stays; ADD a clause discouraging reasoning/explanation prose, e.g. append `'Output the JSON object directly with no preamble, no explanation, and no markdown code fences.'`. Do NOT add language-specific examples (keep the existing multilingual instruction at line 35).
  - The outer `try/catch` that returns `{}` (lines 77-80) stays as the final safety net.

  **Must NOT do**:
  - Do NOT change the function signature or return type.
  - Do NOT modify `callLLM` (`call-llm.ts`).
  - Do NOT change the field-mapping/select-filter logic (lines 64-74) beyond moving it inside the loop's success path.
  - Do NOT use a `while` loop or recursion — bounded `for` only.
  - Do NOT retry on a successful parse (even `{"date": null}` → return `{}` after one call).
  - Do NOT retry on `CostCircuitBreakerError` / `RateLimitExceededError`.
  - Do NOT hardcode any model string.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-function refactor in one file, all dependencies already imported or available from `./errors.js`.
  - **Skills**: []
    - Skills Evaluated but Omitted: `creating-archetypes`, `hostfully-api` — no domain overlap (pure LLM-client logic).

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/extract-inputs.ts:50-62` — the current single `callLLMFn` call + `JSON.parse` (the code to wrap in a retry loop).
  - `src/lib/extract-inputs.ts:64-74` — existing field-mapping + select/options filter (move into success path, otherwise unchanged).
  - `src/lib/extract-inputs.ts:77-80` — outer catch returning `{}` (final safety net, keep).
  - `src/lib/extract-inputs.ts:28-36` — system prompt to strengthen (line 35 multilingual instruction stays).

  **API/Type References**:
  - `src/lib/call-llm.ts:14-31` — `CallLLMOptions` (accepts `maxTokens`, `timeoutMs`) and `CallLLMResult` (`content` is always a string via `?? ''` at line 253).
  - `src/lib/errors.ts` — `CostCircuitBreakerError`, `RateLimitExceededError` (import for breaker-abort).

  **WHY Each Reference Matters**:
  - The success-path field-mapping must be preserved byte-for-byte (only relocated) so the select/options filtering and null-skipping behavior is identical — Metis flagged this as orthogonal to the token fix.
  - `content` being guaranteed-string means the empty check is `raw === ''` after trim, not a null guard.

  **Acceptance Criteria**:

  ```
  Scenario: Bounded retry loop with escalating budget (happy path - real behavior)
    Tool: Bash (Vitest, via Task 2 tests)
    Steps:
      1. Run: pnpm test -- --run tests/lib/extract-inputs.test.ts
      2. Assert: 0 failures (11 existing + 8 new pass)
    Expected Result: All tests green
    Evidence: .sisyphus/evidence/task-1-tests.txt

  Scenario: No while-loop or recursion (bounded-loop guarantee)
    Tool: Bash (grep)
    Steps:
      1. Run: grep -nE "while \\(|extractInputsFromText\\(" src/lib/extract-inputs.ts
      2. Assert: no `while`; only ONE definition of extractInputsFromText (no recursive self-call)
    Expected Result: Bounded for-loop only
    Evidence: .sisyphus/evidence/task-1-bounded.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -5
      2. Assert: exit 0, no TS errors
    Expected Result: Clean compile
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Commit**: YES
  - Message: `fix(extract-inputs): retry on truncated LLM output to handle reasoning-model token starvation`
  - Files: `src/lib/extract-inputs.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/extract-inputs.test.ts`

- [x] 2. Add sequenced-mock helper + retry/edge-case tests

  **What to do**:
  - In `tests/lib/extract-inputs.test.ts`, add a `makeSequencedCallLLM(contents: string[]): typeof callLLM` helper alongside the existing `makeCallLLM`. It returns a `vi.fn()` whose successive calls resolve to the next `content` in the array (use `mockResolvedValueOnce` chaining or an index closure), each wrapped in the same result shape as `makeCallLLM` (`{ content, model, promptTokens, completionTokens, estimatedCostUsd, latencyMs }`).
  - Add these 8 test cases (all asserting both the RESULT and the mock CALL COUNT):
    1. **Retry succeeds on 2nd attempt**: `makeSequencedCallLLM(['', '{"date":"2026-06-08"}'])` → result `{ date: '2026-06-08' }`, mock called exactly **2×**.
    2. **Retry succeeds on 3rd attempt**: `makeSequencedCallLLM(['', '{"date": "2026-06', '{"date":"2026-06-08"}'])` (empty, then truncated/unparseable, then valid) → result `{ date: '2026-06-08' }`, mock called **3×**.
    3. **All retries exhausted → `{}`**: `makeSequencedCallLLM(['', '', ''])` → result `{}`, mock called exactly **3×** (NOT 4, NOT infinite).
    4. **Escalating maxTokens**: use a `vi.fn()` that records each call's `maxTokens` arg; drive 3 failing attempts; assert recorded ceilings `[800, 1600, 3200]`.
    5. **No retry on valid-but-null parse**: `makeCallLLM('{"date": null}')` → result `{}`, mock called exactly **1×** (proves money isn't wasted retrying a legitimate "not found").
    6. **No retry on valid extraction**: `makeCallLLM('{"date":"2026-06-08"}')` → result `{ date: '2026-06-08' }`, mock called exactly **1×**.
    7. **CostCircuitBreakerError aborts retries**: mock rejects attempt 1 with `new CostCircuitBreakerError(...)` → result `{}`, mock called exactly **1×** (no retry on breaker). Import `CostCircuitBreakerError` from `../../src/lib/errors.js`.
    8. **Prompt nudge present**: capture the system message passed to the mock; assert it contains the strengthened JSON-only clause (e.g. "no markdown" or "no explanation") AND still contains "any language" (multilingual instruction preserved).
  - Per-attempt timeout assertion (fold into test 4 or add inline): assert each recorded call's `timeoutMs === 20000`.

  **Must NOT do**:
  - Do NOT modify or break the 11 existing tests (the `makeCallLLM` helper and its callers stay).
  - Do NOT add integration tests requiring a live LLM (that is F3's job).
  - Do NOT place the test file anywhere but `tests/lib/extract-inputs.test.ts`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding well-specified test cases following the established DI mock pattern.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo, after Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `tests/lib/extract-inputs.test.ts:5-14` — existing `makeCallLLM(content)` helper (model the new `makeSequencedCallLLM` on this exact result shape).
  - `tests/lib/extract-inputs.test.ts:26-90` — existing extraction test cases (style: `await extractInputsFromText(text, fields, mockLLM)` then `expect(result).toEqual(...)`).
  - `tests/lib/extract-inputs.test.ts:52-60` — the `{"date": null}` test (the basis for the no-retry-on-null assertion, now extended with a call-count check).

  **API/Type References**:
  - `src/lib/errors.ts` — `CostCircuitBreakerError` constructor (for test 7).
  - `src/lib/call-llm.ts:24-31` — `CallLLMResult` shape the sequenced mock must return.

  **WHY Each Reference Matters**:
  - The new helper must mirror `makeCallLLM`'s result object exactly, or the function's destructuring of `llmResult.content` breaks.
  - Test 5 directly encodes Metis's "don't retry a valid null" cost-protection requirement — it is the guard against a money-wasting regression.

  **Acceptance Criteria**:

  ```
  Scenario: All new + existing tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/lib/extract-inputs.test.ts 2>&1 | tail -10
      2. Assert: 0 failures; test count >= 19 (11 existing + 8 new)
    Expected Result: Green suite
    Evidence: .sisyphus/evidence/task-2-tests.txt

  Scenario: Retry call-count correctness (no infinite loop)
    Tool: Bash
    Steps:
      1. Run the exhaustion test specifically: pnpm test -- --run tests/lib/extract-inputs.test.ts -t "exhausted"
      2. Assert: pass, and the test asserts mock called exactly 3×
    Expected Result: Bounded at 3 attempts
    Evidence: .sisyphus/evidence/task-2-bounded.txt

  Scenario: Full suite no regression
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -15
      2. Assert: no NEW failures vs. the known pre-existing failures (tests/gateway/slack/ ~28 pre-existing, documented)
    Expected Result: Zero new regressions
    Evidence: .sisyphus/evidence/task-2-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(extract-inputs): add retry, exhaustion, and breaker-abort coverage`
  - Files: `tests/lib/extract-inputs.test.ts`
  - Pre-commit: `pnpm test -- --run tests/lib/extract-inputs.test.ts`

- [ ] 3. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**:
  - After F1-F4 pass and user approves, run: `tsx scripts/telegram-notify.ts "✅ fix-extraction-truncation complete — extraction retry shipped, Junio 8 repro 8/8. Come back to review."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ fix-extraction-truncation complete ..."
      2. Assert: exit 0, stdout "[telegram] Notification sent."
    Expected Result: Delivered
    Evidence: .sisyphus/evidence/task-3-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read `extract-inputs.ts`, confirm bounded for-loop, escalating maxTokens, heuristic trigger, breaker-abort, timeout, prompt nudge, log). For each "Must NOT Have": grep for violations (no `callLLM` signature change, no call-site edits, no `while`/recursion, no hardcoded claude/gpt, no select-logic change). Check evidence files exist in `.sisyphus/evidence/`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run tests/lib/extract-inputs.test.ts` + `pnpm exec eslint src/lib/extract-inputs.ts tests/lib/extract-inputs.test.ts` + `pnpm build`. Review for: `as any`/`@ts-ignore`, empty catches that swallow the breaker, unbounded loops, off-by-one in attempt count, generic names. Confirm the 11 pre-existing tests still pass.
      Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Build [PASS/FAIL] | VERDICT`

- [x] F3. **Real QA — live reproduction + Slack E2E** — `unspecified-high`
      (a) Run a tsx harness calling `extractInputsFromText("puedes generarme el itinerario de limpieza para Junio 8, 2026?", [{key:'date',label:'Checkout Date',type:'date'}], callLLM)` 8× against the live Go-routed gateway model. Assert 8/8 return `{date:'2026-06-08'}`. Delete the harness after.
      (b) Slack E2E (AGENTS.md mandatory): confirm services live (`curl localhost:7700/health`, Inngest, Socket Mode in `/tmp/ai-dev.log`). @mention the cleaning-schedule employee (tenant `00000000-0000-0000-0000-000000000003`, archetype `00000000-0000-0000-0000-000000000019`) with the Spanish date message → click Confirm → assert bot posts "✅ ... triggered" and does NOT post "I need a few details". Verify DB: `SELECT raw_event->'inputs'->>'date' FROM tasks WHERE archetype_id='00000000-0000-0000-0000-000000000019' ORDER BY created_at DESC LIMIT 1` = `2026-06-08`.
      Output: `Repro [N/8 success] | Slack [dispatched Y/N] | DB date [value] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      `git diff` — confirm ONLY `src/lib/extract-inputs.ts` and `tests/lib/extract-inputs.test.ts` changed. Verify 1:1 with spec: retry loop bounded to 3, ceiling 800/1600/3200, heuristic-only trigger, breaker-abort, no signature change, no call-site contamination, no `slack-trigger-handler.ts`/`handlers.ts`/`call-llm.ts` edits.
      Output: `Files [N/N in scope] | Contamination [CLEAN/N] | Spec match [Y/N] | VERDICT`

- [x] F5. **Tmux/scratch cleanup** — kill any tmux sessions created during E2E; delete any temp harness scripts (`scripts/_tmp-*`). `git status` must be clean (only intended files).

---

## Commit Strategy

| Commit | Message                                                                                         | Files                              | Pre-commit                                            |
| ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| 1      | `fix(extract-inputs): retry on truncated LLM output to handle reasoning-model token starvation` | `src/lib/extract-inputs.ts`        | `pnpm test -- --run tests/lib/extract-inputs.test.ts` |
| 2      | `test(extract-inputs): add retry, exhaustion, and breaker-abort coverage`                       | `tests/lib/extract-inputs.test.ts` | `pnpm test -- --run tests/lib/extract-inputs.test.ts` |

---

## Success Criteria

### Verification Commands

```bash
# All extract-inputs tests pass (11 existing + 8 new)
pnpm test -- --run tests/lib/extract-inputs.test.ts
# Expected: 0 failures

# Bounded loop present, no while/recursion
grep -nE "for \(|while \(" src/lib/extract-inputs.ts
# Expected: a bounded for-loop, no while

# Escalating maxTokens present
grep -nE "800|1600|maxTokens \* 2|<<|\\* 2" src/lib/extract-inputs.ts
# Expected: escalating budget logic

# No call-llm / call-site changes
git diff --name-only
# Expected: ONLY src/lib/extract-inputs.ts and tests/lib/extract-inputs.test.ts
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Live reproduction 8/8 success
- [ ] Slack E2E dispatches with `date=2026-06-08` in DB
- [ ] All tests pass; only 2 files changed
