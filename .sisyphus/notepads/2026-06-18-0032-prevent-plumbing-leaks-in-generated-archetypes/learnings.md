# Learnings

## [2026-06-18] Plan Start

### Key Files

- `src/gateway/services/prompts/archetype-generator-prompts.ts` — `ARCHETYPE_AUTHORING_RULES` at line 76; `REFINE_SYSTEM_PROMPT_PRE` at line 474 (has existing no-leak rule); `buildConverseSystemPromptPre` at lines 527-530 (MISSING no-leak rule)
- `src/gateway/services/archetype-generator.ts` — `postProcess()` at line 369; `callLLMWithJsonRetry` at line 535; `generate()` at line 762; `refine()` at line 830; `converse()` at line 963; `proseFields` at line 966
- `src/lib/output-contract-constants.ts:25` — `DEFAULT_DELIVERY_INSTRUCTIONS` (World-A source)
- `src/worker-tools/lib/output-contract-paths.generated.ts` — World-B generated copy (DO NOT hand-edit)
- `src/gateway/routes/admin-archetype-converse-create.ts:80` — consumer of DEFAULT_DELIVERY_INSTRUCTIONS

### Architecture Decisions

- No regex scrubber — LLM judge detects, LLM regenerates
- Single source: no-leak rule in `ARCHETYPE_AUTHORING_RULES` propagates to all 3 paths
- Judge: fail-open (error → `{has_leak:false}` + log.warn)
- Retry budget: 2 corrective retries (3 total generations max)
- Exhaustion: accept-last + log.warn, never block creation
- `{{key}}` placeholders and `INPUT_*` tokens are NOT plumbing — must not be flagged

### Commit Groups

- T1+T5: `feat(archetype-gen): add no-leak rule to shared authoring constant`
- T2: `fix(output-contract): make DEFAULT_DELIVERY_INSTRUCTIONS plumbing-free`
- T3+T4: `feat(archetype-gen): LLM-judge validate-and-retry for plumbing leaks`
- T6: `test(archetype-gen): regenerate golden fixtures for no-leak rule`
- T8: `docs(creating-archetypes): document no-leak rule and judge-retry loop`

## [2026-06-18] Task 1 — No-Leak Rule Added to Shared Constant (DONE)

### What was done

- Added a `## No Plumbing Leaks (MANDATORY ...)` block as the FIRST rule inside `ARCHETYPE_AUTHORING_RULES` (now at line 76, before `## Multi-Source Reasoning`).
- Because the constant is composed via `${ARCHETYPE_AUTHORING_RULES}` into both `SYSTEM_PROMPT_PRE` (line ~325) and `buildConverseSystemPromptPre` create-branch (line ~521), the single edit propagates to BOTH the GENERATE and WIZARD-CREATE paths automatically — confirmed by the propagation script.

### Exact phrasing reused from REFINE rule (line 478) for cross-path consistency

`NO \`/tools/...\` CLI paths, NO \`tsx\` invocations, NO \`--flag\` syntax, NO \`/tmp/...\` paths, NO raw Slack channel IDs (refer to "the team's notification channel", never a literal channel ID).`The new rule names the four user-facing fields explicitly:`identity`, `execution_steps`, `delivery_steps`, and the `overview` object.

### Verification gotchas

- `lsp_diagnostics` is UNAVAILABLE in this env — `typescript-language-server` has no version set in `.tool-versions` (exits 126). Fall back to `npx tsc --noEmit -p tsconfig.json` and grep the edited filename.
- A tsx verify script in `/tmp` CANNOT resolve the repo's relative `.js` imports — write it at repo ROOT, run, then `rm`. (left no artifact behind)
- `.sisyphus/evidence/` is a SHARED dir with hundreds of files — a bare `ls` floods output (truncated to a file). Evidence saved at `.sisyphus/evidence/task-1-prompt-propagation.txt` (19/19 checks PASS).
- Confirmed `{{key}}` and `INPUT_` are NOT mentioned as forbidden in the new block (legitimate tokens).
- REFINE rule at line 478 left UNCHANGED (it pre-dates and is path-specific).

### Note for T5 (parity test)

The new shared heading `## No Plumbing Leaks` and the phrase `the team's notification channel` now appear in BOTH `SYSTEM_PROMPT_PRE` and `buildConverseSystemPromptPre(true)` — good anchors for parity assertions.

## [2026-06-18] Task 3 — LLM Judge + Unit Tests (DONE)

### What was done

- Added `PLUMBING_JUDGE_SYSTEM_PROMPT` exported constant to `src/gateway/services/prompts/archetype-generator-prompts.ts` (after `CONVERSE_SYSTEM_PROMPT_POST`). Instructs LLM to act as a plumbing-leak reviewer, defines exactly what counts as plumbing (`/tools/...` paths, `tsx`, `--flag`, `/tmp/...`, raw Slack channel IDs like `C0B71QSMZKQ`, tool filenames), and explicitly lists what is NOT plumbing (`{{key}}` placeholders, `INPUT_*`, business codes, plain words like "Slack"). Returns strict JSON `{ "has_leak": boolean, "fields": string[], "snippets": string[] }`.
- Added `judgeProseForPlumbing(fields: Record<string, unknown>)` method to `ArchetypeGenerator` class (after `_persistCall`, before `callLLMWithJsonRetry`). Uses `this.callLLMFn` (injected, not imported), `taskType: 'review'`, `temperature: 0`, `responseFormat: { type: 'json_object' }`. No hardcoded model ID.
- Created `tests/unit/gateway/services/archetype-generator-judge.test.ts` with 9 tests.

### Key implementation decisions

- Method is `async` and NOT `private` — TypeScript `private` methods can't be called in tests. Left without modifier to keep it unit-testable.
- Fail-open on LLM throw, JSON parse failure, AND unexpected response shape (missing `has_leak` field) — all return `{ has_leak: false, fields: [], snippets: [] }` + `log.warn`.
- Serializes `identity`, `execution_steps`, `delivery_steps`, `overview` (including `workflow` array sub-field) into the judge payload.
- `overview` sub-fields: the method extracts `overview.description`, `overview.trigger`, `overview.workflow` (joined if array) to ensure nested plumbing is caught.

### Test coverage (9/9 passing)

1. `has_leak: true` for payload with `/tools/slack/post-message.ts` and `C0B71QSMZKQ`
2. `has_leak: false` for clean intent-prose payload
3. Does NOT flag `{{target_date}}` placeholder
4. Does NOT flag plain business code `CONTRACT2024`
5. Fail-open on LLM throw (verifies `log.warn` called)
6. Fail-open on bad JSON (verifies `log.warn` called)
7. Fail-open on unexpected shape (verifies `log.warn` called)
8. Verifies overview sub-fields including `workflow` array are serialized into judge payload
9. Verifies LLM called with `taskType: 'review'`, `temperature: 0`, `responseFormat: { type: 'json_object' }`

### Commit

`feat(archetype-gen): LLM-judge validate-and-retry for plumbing leaks` — 3 files, 394 insertions

### Pre-existing failure note

`golden-prompts.test.ts` failure is pre-existing from T1 (adding the no-leak rule changed `SYSTEM_PROMPT_PRE`). Confirmed by stash test. This is a T6 task (regenerate golden fixtures). NOT introduced by T3.

## [2026-06-18] Task 4 — validateAndRetryProse + Wiring (DONE)

### What was done

- Added `validateAndRetryProse<T extends GenerateArchetypeResponse>` private method after `judgeProseForPlumbing`. Max 3 generations (1 original + 2 retries). Exhaustion: accept-last + `log.warn`. Corrective feedback message includes field names, offending snippets, and explicit no-plumbing instructions.
- Wired into `generate()`: between `postProcess()` and `applyModelAndEstimate()`. Retry regenerate closure appends feedback to `messages` array and re-calls `callLLMWithJsonRetry`.
- Wired into `refine()`: restructured `runRefineCall` → `runRefineCallRaw` (postProcess only, no `applyModelAndEstimate`). Plumbing check runs AFTER the unchanged-prose guard. `applyModelAndEstimate` runs once on the final result.
- Wired into `converse()` proposal branch only: `question`, `no_change`, `too_long` branches are NOT judged. Retry closure re-calls `callLLMWithJsonRetry` and re-parses the proposal JSON.

### Key implementation decisions

- `validateAndRetryProse` is `private` (unlike `judgeProseForPlumbing` which is non-private for testability). Tests for retry behavior go through `generate()`, `refine()`, `converse()` — not directly on the private method.
- `refine()` restructure: `runRefineCallRaw` does NOT call `applyModelAndEstimate`. This is a deliberate ordering constraint — the plumbing check must run on the final prose result, and `applyModelAndEstimate` (model recommendation + time estimation) should only run once on the final clean result.
- Converse retry closure: if the LLM returns a non-proposal kind on retry (e.g. `question`), the closure returns the original `processedConfig` unchanged. This is safe — the outer `validateAndRetryProse` will re-judge it and either accept or retry again.

### Test coverage (6 new tests in archetype-generator-retry.test.ts)

1. `generate()`: clean on first judge → no retry, judge called once
2. `generate()`: leak on attempt 1, clean on retry → returns clean, LLM called twice for generation
3. `generate()`: leak persists through 2 retries → accepts last + `log.warn` fired, LLM called 3 times
4. `converse()` proposal: leak on attempt 1, clean on retry → returns clean proposal
5. `converse()` question branch: judge NOT called
6. `converse()` no_change branch: judge NOT called

### Existing test fixes

- `archetype-generator-repair.test.ts`: updated `makeRoutingMock` to intercept judge calls (return `has_leak: false`) so `generationCalls.length` counts only JSON-generation attempts.
- `archetype-generator-converse.test.ts`: updated `makeConverseRoutingMock` and `makeCapturingConverseMock` to intercept judge calls.
- `archetype-generator-code.test.ts`: updated `makeLLMResult` to intercept judge and estimator calls; updated call count expectations (2→3 for no-retry, 3→4 for retry-success paths).

### Commit

`feat(archetype-gen): wire validate-and-retry into all generation paths` — 5 files, 454 insertions, 21 deletions

## [2026-06-18] Task 5 — Parity Test Assertions (DONE)

### What was done

- Added 2 new `it()` blocks to `tests/unit/generator-prompts-parity.test.ts` (lines 141–155):
  1. `SYSTEM_PROMPT_PRE contains no-plumbing-leaks rule with notification channel phrase`
  2. `buildConverseSystemPromptPre contains no-plumbing-leaks rule with notification channel phrase`
- Each asserts: `'No Plumbing Leaks'`, `"the team's notification channel"`, `'NO \`/tools/'`
- Test count went from 25 → 27 (both new tests pass)
- Evidence saved to `.sisyphus/evidence/task-5-parity.txt` (gitignored dir — evidence not committed)
- Committed: `test(archetype-gen): add parity assertion for no-leak rule` (sha: 0375dbf1)

### Gotchas

- `.sisyphus/evidence/` is gitignored — only the test file was committed
- The section-separator comment style matches existing file pattern (line 66 uses same style)
- `golden-prompts.test.ts` failure is pre-existing from T1 — not introduced here

## [2026-06-18] Task 7 — Live Wizard E2E (converse-create) — PASS

### Outcome
- Live `POST /admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/converse-create` returned `kind:"proposal"` for a leak-prone description. ALL user-facing fields plumbing-free. Original leak tokens did NOT survive.
- Leak-prone input: `"...posts the daily ops schedule to our Slack channel C0B71QSMZKQ every morning using /tools/slack/post-message.ts"`.
- Generated `delivery_steps` used `$NOTIFICATION_CHANNEL` placeholder (NOT the literal `C0B71QSMZKQ`). `/tools/slack/post-message.ts` did NOT appear in any prose field. Legit `{{schedule_text}}` input placeholder preserved.

### CRITICAL request-shape gotchas (task description was WRONG)
- Request body field is **`transcript`** (array of `{role,content}`), NOT `messages`. The route schema is `ConverseCreateBodySchema = z.object({ transcript: z.array(...) })`. Sending `messages` → 400 INVALID_REQUEST.
- Proposal fields are under **`proposal`**, NOT `config`. Response shape: `{ kind, baseline, proposal, changed_fields, tool_delta?, input_change? }`. The task's `r.config` reference is wrong for this endpoint — use `r.proposal`.
- `tool_registry.tools` LEGITIMATELY contains real `/tools/...` paths (e.g. `/tools/slack/post-message.ts`) — this is correct and must NOT be asserted plumbing-free. Only `identity`, `execution_steps`, `delivery_steps`, `overview.*` are user-facing prose to scan.

### Conversation took 3 turns (not 2)
- Turn 1 → clarifying question (schedule source?).
- Turn 2 (answered "Google Sheets") → SECOND question: "Google Sheets is not currently connected as an integration..." The generator gates on connected integrations.
- Turn 3 (answered "forget integration, schedule provided as input, trigger manually") → `proposal`. To reach a proposal fast, steer toward NO unconnected integration — provide data as a runtime input + manual trigger.

### Judge/retry observability
- Gateway logs are in `/tmp/ai-dev.log` (mixed `[gateway]` + `[inngest]` streams; filter `grep -E "\[gateway\]"` and exclude `cli/command|cli/dev_ui|received event|publishing event` — Inngest floods it).
- The plumbing judge emits `log.warn` ONLY on leak-persists-after-2-retries. ZERO such warnings during the run + verified-clean output ⇒ **clean on FIRST pass** (prompt rule prevented plumbing at generation; judge confirmed clean, no retry). This is the ideal branch.
- `time-estimator` logged a NON-BLOCKING "LLM returned empty content" warn — expected, time_estimate failures never block creation.

### Env gotchas
- `python3` is unusable (asdf has no version set → exits with version error). Use `node -e` for ALL JSON parsing/assertions.
- Single-gateway check: `lsof -nP -iTCP:7700 -sTCP:LISTEN` → exactly 1 PID (11085). The 3 `ps | grep gateway` matches are tsx-watch parent/children; only one binds the port.
- `gateway_llm_model = deepseek/deepseek-v4-flash` (the model that originally leaked) — no model override needed, reproduced original conditions naturally.

### Evidence
- `.sisyphus/evidence/task-7-live-create.json` — full proposal response (4.6KB)
- `.sisyphus/evidence/task-7-judge-logs.txt` — observability summary

## F3 Real QA Execution (live converse-create) — 2026-06-18

- **converse-create body field is `transcript`** (not `messages`); proposal fields under `proposal` (not `config`). Confirmed against live API.
- **Multi-turn clarify flow is real**: both leak-prone descriptions triggered 2-3 clarifying questions before `kind:'proposal'`. Slack-source desc asked for data source twice; Hostfully desc asked for trigger type once.
- **LLM-judge is UNCONDITIONAL on the proposal branch**: `validateAndRetryProse` (archetype-generator.ts:1085, inside `kind==='proposal'`) → `judgeProseForPlumbing` (line 608 always called). Returns early only when `has_leak===false`. Success path is SILENT — no log line. Only leak/failure emits `log.warn`.
- **Observability of judge**: success leaves no trace beyond the LLM call itself. Verified via: (1) code path unconditional, (2) 6 call-llm entries in proposal time windows (converse + judge + estimator + recommend), (3) `grep -c "plumbing leak detected"` = 0 across entire log → judge passed clean both runs, no retry fired.
- **tool_registry is allowed to contain `/tools/...` paths** — only user-facing prose (identity, execution_steps, delivery_steps, overview) must be plumbing-free. Leak-check script must exclude tool_registry.
- **Result**: Description 1 (Slack + channel ID C0B71QSMZKQ + tool path) → CLEAN. Description 2 (Hostfully + 2 tool paths + tsx) → CLEAN. Both input descriptions deliberately seeded plumbing; generated prose stripped it entirely.
- python3 not configured via asdf in this repo; use `jq` + `node` for JSON parsing in QA scripts.

## F2: Code Quality + Regression (verification)

- Build PASS (tsc exit 0), Lint PASS (eslint exit 0).
- Unit tests: full suite first run showed 1 flaky failure in `admin-archetype-converse-create.test.ts` ("proposal kind ... non-empty identity") with `expected 404 to be 200`. The route handler has NO 404 path and the test fully mocks `ArchetypeGenerator.converse`, so the plan's `validateAndRetryProse` never runs in it — confirmed test-pollution flake under `pool: 'forks'`. Isolated/clean re-run: 2168 passed | 9 skipped | 0 failed.
- Generated-copy-fresh YES: `pnpm generate-worker-constants` reports "Up to date"; `DEFAULT_DELIVERY_INSTRUCTIONS` is World-A only (not exported to World-B path constants), so no drift expected — matches inherited wisdom.
- Code review clean on all 3 files: no `as any` in new judge/retry code, no `@ts-ignore`, no empty catches (converse retry catches return `processedConfig` fallback — intentional), no `console.log` (all `log.warn`). Retry logic correctly caps at 3 total generations (1 + 2 retries); exhaustion returns `retry2` (last attempt) with `log.warn`, never throws. `judgeProseForPlumbing` fails open (returns SAFE) on LLM error, JSON parse error, and bad shape — all three paths verified.

## F3 Real QA Execution (2026-06-18)

- Live converse-create tested with 2 leak-prone descriptions (raw Slack channel ID + /tools/ path + tsx; and /tmp/ paths + tsx + --output CLI).
- Both reached kind:proposal in 2 turns (Turn 1 always a clarifying question; answer with "data provided as input, trigger manually" to steer to proposal).
- Both proposals CLEAN: zero plumbing in identity/execution_steps/delivery_steps/overview. Regex used: /\/tools\/|\/tmp\/|\btsx\b|--\w+|C[A-Z0-9]{8,}/
- Generator correctly substitutes allowed placeholders: $NOTIFICATION_CHANNEL (not raw C0B71QSMZKQ) and {{target_date}}.
- Judge observability: validateAndRetryProse logs leak ONLY on detection (archetype-generator.ts:620). Clean pass = silent return (line 609). No leak/retry log entries during test = judge passed first-pass. Judge-fired=N is the PASSING outcome.
- tool_registry.tools legitimately holds /tools/... paths — do NOT assert those.
- Evidence: .sisyphus/evidence/final-qa/desc1-proposal.json, desc2-proposal.json, F3-real-qa-execution-results.md
- VERDICT: APPROVE (2/2 clean)
