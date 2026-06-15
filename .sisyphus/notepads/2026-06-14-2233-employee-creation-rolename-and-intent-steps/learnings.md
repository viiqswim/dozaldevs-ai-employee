# Learnings — employee-creation-rolename-and-intent-steps

## 2026-06-15 Session Start: Code-verified root cause

### Fix B (PARTIAL — applied, uncommitted)

`archetype-generator.ts` line ~913: `converse()` now derives `roleNameSource` from transcript user messages when baseline `role_name` is empty (CREATE path). The 3-line comment above the block must be REMOVED (hook flagged it as unnecessary — variable name is self-explanatory).

Current state of the edit (lines 912-922):

```typescript
if (kind === 'proposal' && parsed.config !== null && typeof parsed.config === 'object') {
  // On CREATE the baseline role_name is empty and the converse prompt forbids the model
  // from emitting one, so derive the slug-fallback source from the user's transcript instead
  // of the empty baseline. On EDIT (non-empty baseline) keep the existing role_name source.
  const roleNameSource = currentConfig.role_name
    ? currentConfig.role_name
    : transcript
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join(' ');
  const processedConfig = postProcess(parsed.config, roleNameSource);
```

→ Comment must be removed; code stays.

### postProcess fallback (lines 429-433) — NOT YET HARDENED

```typescript
if (!result.role_name || typeof result.role_name !== 'string') {
  result.role_name = toKebabCase(description.split(' ').slice(0, 4).join(' '));
} else {
  result.role_name = toKebabCase(result.role_name as string);
}
```

Problem: if `toKebabCase('')` → `''` (emoji/whitespace transcript), result is still empty → Zod min(2) rejects.
Fix: after `toKebabCase(...)`, if result is `''`, fall back to `'employee-' + Date.now().toString(36).slice(-4)`.

### Fix A (NOT YET DONE)

`archetype-generator-prompts.ts:344` — `CONVERSE_SYSTEM_PROMPT_PRE` forbids model from setting `role_name`. Must be conditional: forbid ONLY when `currentConfig.role_name` is non-empty (EDIT path). On CREATE (empty baseline), must INSTRUCT model to emit a kebab slug.
The prompt builder must accept an `isCreate` flag threaded from `converse()`.

### applyCreateAllowlist (admin-archetype-converse-create.ts:79)

`raw.role_name || undefined` — strips empty string to undefined. Once slug is non-empty (Fix B), this passes through correctly. No change needed here.

### Key file locations

- `src/gateway/services/archetype-generator.ts:913` — postProcess call (Fix B applied)
- `src/gateway/services/archetype-generator.ts:429-433` — postProcess fallback (needs hardening)
- `src/gateway/services/archetype-generator.ts:340-345` — `toKebabCase` function
- `src/gateway/services/prompts/archetype-generator-prompts.ts:344` — forbid line (Fix A)
- `src/gateway/routes/admin-archetype-converse-create.ts:46` — buildEmptyBaseline (role_name:'')
- `src/gateway/routes/admin-archetype-converse-create.ts:79` — applyCreateAllowlist
- `src/gateway/routes/admin-archetypes.ts:79-84` — Zod: regex + min(2) + max(60)
- `dashboard/src/panels/employees/components/WizardEditStep.tsx:80-83` — editable role_name input
- `tests/unit/gateway/services/archetype-generator-converse.test.ts` — existing test patterns

### Zod target

`/^[a-z0-9]+(-[a-z0-9]+)*$/` with min(2) and max(60). Must never be empty.

### EDIT guardrail (MUST NOT break)

When `currentConfig.role_name` is non-empty (EDIT path), the forbid clause must remain in the prompt AND `roleNameSource` passes the existing role_name through postProcess unchanged.

## Task 1 Complete (2026-06-15)

### What was done

- `CONVERSE_SYSTEM_PROMPT_PRE` (const string) → `buildConverseSystemPromptPre(isCreate: boolean)` function in `archetype-generator-prompts.ts`
- `buildConverseSystemPrompt(connectedToolkits, connectableToolkits)` → added `isCreate: boolean = false` third param
- `converse()` derives `isCreate = !currentConfig.role_name` before calling `buildConverseSystemPrompt`
- Import in `archetype-generator.ts` updated: `CONVERSE_SYSTEM_PROMPT_PRE` → `buildConverseSystemPromptPre`

### Conditional logic in buildConverseSystemPromptPre

- `isCreate=true` → forbid line replaced with: `"- Derive a kebab-case slug for role_name from the employee's role or description (e.g. 'daily-standup-bot')."`
- `isCreate=false` → forbid line unchanged: `"- Politely decline (return {"kind":"no_change"}) any requests to change: model, temperature, role_name, vm_size, or concurrency_limit."`

### Test coverage added

6 new tests in `tests/unit/gateway/services/archetype-generator-converse.test.ts`:

1. `buildConverseSystemPromptPre(true)` — does NOT contain role_name forbid
2. `buildConverseSystemPromptPre(true)` — DOES contain slug instruction
3. `buildConverseSystemPromptPre(false)` — DOES contain role_name forbid
4. `buildConverseSystemPromptPre(false)` — does NOT contain slug instruction
5. `converse()` CREATE mode (empty role_name) — captures system prompt, verifies no forbid + has slug instruction
6. `converse()` EDIT mode (non-empty role_name) — captures system prompt, verifies forbid present

### Patterns

- The test file uses `makeCapturingSystemPromptMock` capturing `messages[0].content` (system prompt) while routing estimator calls (via `ESTIMATOR_SYSTEM_PREFIX` check) to a dummy response.
- `makeEmptyConfig()` = `makeConfig({ role_name: '' })` — covers the CREATE baseline.
- All 1974 unit tests pass.

## Task 2 — postProcess hardening + comment removal (2026-06-15)

### Changes made

- **Removed 3-line comment** from `converse()` in `archetype-generator.ts` above the `roleNameSource` block (lines 905–907). The variable name is self-documenting.
- **Hardened `postProcess`** (lines 419–423): after `toKebabCase(...)`, if the result is `''`, fall back to `'employee-' + Date.now().toString(36).slice(-4)`. Applied to BOTH branches (model-omits-role_name and model-emits-role_name), since even a user-supplied name could theoretically be all emoji.
- **Added 3 unit tests** in `archetype-generator-converse.test.ts` in new describe block `'converse() — role_name derivation and fallback (CREATE path)'`.

### RED → GREEN flow

- Test (b) was RED before the fix (emoji transcript → empty slug, no fallback).
- Tests (a) and (c) were GREEN immediately (English transcript → non-empty slug; model-emitted role_name → kebab-normalized).
- After fix: all 3 tests GREEN. Suite: 1977 passed, 0 failing.

### Key patterns

- `toKebabCase('🎉 🎊')` → `''` (non-ASCII stripped, then `-` trimmed). Edge case must be handled.
- Fallback format `'employee-' + Date.now().toString(36).slice(-4)` produces e.g. `'employee-1a2b'` — 13 chars, matches `/^[a-z0-9]+(-[a-z0-9]+)*$/`, length ≥ 2. Always deterministic for a given millisecond.
- For testing proposals without role_name, using `makeConfig({ role_name: '' })` in the mock LLM response works because `''` is falsy — postProcess enters the derivation branch.

## Task 3 — Wizard pre-fill + save-draft regression (live curl, 2026-06-15)

### Verification result: NO CODE CHANGES NEEDED — all 4 steps pass with T1+T2 already committed

- **Step 1 (allowlist)**: `applyCreateAllowlist()` `raw.role_name || undefined` confirmed correct. Non-empty slug passes through truthy. Once T2 guarantees a non-empty slug, no change here. Verified.
- **Step 4 (UI pre-fill)**: `CreateEmployeePage.tsx:66` `role_name: String(merged.role_name ?? '')` + `WizardEditStep.tsx:81` `value={editedFields.role_name}` — both correctly bound, no static empty string. Verified.

### Live curl flow (real gateway, real LLM — NOT mocked)

- converse-create is **multi-turn** for ambiguous input. "reads all of our slack channels..." → `kind:question` (asks which channels). Had to answer with channels + schedule in a 3-message transcript to reach `kind:proposal`. Single clear-enough turn would proposal directly, but this description triggered clarify-then-act.
- Turn-3 proposal → `role_name: "executive-summary-bot"` (matches `/^[a-z0-9]+(-[a-z0-9]+)*$/`).
- Proposal shape: keys = delivery_steps, execution_steps, identity, model, overview, risk_model, role_name, runtime, tool_registry, trigger_sources. **proposal.model = minimax/minimax-m2.7** (baseline was deepseek-v4-flash — the LLM upgraded it via recommendation). runtime = opencode.

### save-draft replication (handleSaveDraft merge)

- Merge is `{...baseline, ...proposal}` then UI overrides (role_name, instructions=execution_steps, identity, execution_steps, delivery_steps→null if empty, temperature=1.0, risk_model, trigger_sources, status:draft, parent_draft_id:null).
- POST /archetypes → **HTTP 201**, id=293fb5f2-9375-45b4-9a65-9b1df339b40b, role_name=executive-summary-bot, status=draft. The originally-failing 422/400 INVALID_REQUEST on role_name is gone.

### Note

- A draft archetype (293fb5f2...) was created in the local DB as a side effect of the live test. It's a `draft`, harmless. Left in place as proof.
- Evidence: `.sisyphus/evidence/task-3-save-201.txt`
- Pre-existing unrelated LSP error in `vitest.config.ts` (coverage key) — not touched by this task.

## Task 4 — Intent-level feasibility spike (GATE) — ✅ PASS (2026-06-15)

### GATE DECISION: PASS → Wave 2 (T5-T9) is CLEARED to proceed.

A live deepseek/deepseek-v4-flash worker driven by PLAIN-ENGLISH INTENT steps (zero
`tsx /tools/...` in the prompt) reached terminal status **Done** with a real Slack delivery.

### Evidence

- Task ID: `efcda54f-19bf-4c9d-a18a-38e614b03935`
- Test archetype: `a8d7c7e2-09a3-402a-8db5-31a9c705e599` (role_name `intent-spike-test`, DozalDevs). Copy of daily-summarizer. Reset to `draft` after spike.
- Trigger: admin API `POST /admin/tenants/.../employees/intent-spike-test/trigger`. approval_required=false → autonomous Submitting→Delivering→Done.
- Slack tool resolved from intent: `read-channels.ts --channels C092BJ04HUG` (+ retries with --lookback-hours). Prompt only said "Read the recent messages from ... $SOURCE_CHANNELS".
- Load-bearing handoff fired: `submit-output.ts --draft-file /tmp/summary.txt`. Deliverable draft field = 646 chars (non-empty), full content 1098 chars, `"version":1`, classification NEEDS_APPROVAL.
- Slack delivery confirmed: `post-message.ts --channel C0AUBMXKVNU`; notify_slack_ts `1781539362.638879`. No Slack errors.
- 39 bash tool calls → model EXECUTED, did not describe.
- Evidence files: `.sisyphus/evidence/task-4-spike-trace.txt`, `task-4-spike-delivery.txt`, `task-4-inject.sql`.

### INTENT CLOSER (the exact phrase that triggers submit-output from intent prose)

> "Finally, submit your completed summary for review so it can be delivered to the team."

This is the recommended closer for Wave 2's generator prompt: it ends an intent block and
reliably drives the `submit-output --draft-file` handoff without naming any tool.

### Mechanism findings (why intent-only works — for Wave 2 prompt design)

- `EXECUTION_PROMPT` ("Follow the instructions in <execution-instructions>") is decoupled from step CONTENT — steps can be prose.
- `CRITICAL_DIRECTIVE` (agents-md-compiler.mts) forces EXECUTE-don't-describe.
- `tool-usage-reference` + `slack` + `platform` skills are always compiled into the brain (verified via brain-preview) → model resolves exact CLI at runtime.
- **`submitOutputCmd` (3rd param of `runOpencodeSession`) is NEVER consumed in the harness body** — the recovery nudge text is hardcoded and injects NO draft. So the MODEL must call submit-output --draft-file itself. The spike proves deepseek-flash does this from intent alone. This is the HARD CONSTRAINT Wave 2 must preserve: the generated intent steps MUST end by submitting the draft via submit-output --draft-file.

### Env injection for Slack-summary archetypes (reusable for Wave 2 tests)

- `$NOTIFICATION_CHANNEL` ← archetype.notification_channel column (machine-provisioner → loadTenantSlack → loadTenantEnv).
- `$SOURCE_CHANNELS` / `$PUBLISH_CHANNEL` ← either tenant.config (source_channels / summary.\*) OR archetype.worker_env jsonb (spread into container env). DozalDevs tenant.config={} so I set them via archetype.worker_env = {"SOURCE_CHANNELS":"C092BJ04HUG","NOTIFICATION_CHANNEL":"C0AUBMXKVNU","PUBLISH_CHANNEL":"C0AUBMXKVNU"}.
- brain-preview shows SOURCE_CHANNELS is_set=false because it only inspects tenant_config, NOT worker_env — but worker_env IS injected at runtime (machine-provisioner line ~173/178). Confirmed: read-channels.ts received C092BJ04HUG.

### --draft-file doc status

- The `--draft-file` FLAG was already documented per-tool. The execution→delivery HANDOFF CONCEPT was ABSENT.
- Added new hand-written section to `src/workers/skills/tool-usage-reference/SKILL.md`: "## Execution→Delivery Handoff (CRITICAL — the load-bearing final step)" (above CRITICAL WARNINGS, below the generate sentinel). Skills are baked into the Docker image (Dockerfile COPY src/workers/skills/) → rebuild required for it to reach worker containers.

### Caveat observed (not a blocker)

- Delivering→Failed→Done is a SIGTERM race in local Docker: delivery container read summary.txt + persisted metrics, then got SIGTERM ~3s before signalling done → Failed; Inngest delivery-retry recovered → Done. Slack post had already succeeded on attempt 1. Final state Done. Stale tasks.failure_reason="Worker terminated" is from the failed attempt, not authoritative.

## Task 6 — Regression guard tests (2026-06-15)

### What was added (test-only; no source edits)

Extended `tests/unit/gateway/services/archetype-generator-prompts.test.ts` (T5 left it at 20 tests / 117 lines) with 6 new tests → 26 tests total. Covered the two guards T5 did NOT already cover: guard 7 (REFINE stays CLI-level) and guard 11 (null delivery_steps stays null).

### Guard coverage discovery (important for future tasks)

T5 had ALREADY written guards 1-6, 8, 9, 10 in this same file. Do NOT re-add them — read the file first. Only 7 and 11 were missing. The 11-item checklist in the task spec overlaps heavily with existing T5 coverage.

### Guard 7 — REFINE intentionally NOT abstracted

`REFINE_SYSTEM_PROMPT_PRE` (source line ~295) was DELIBERATELY left CLI-level by T5 while `SYSTEM_PROMPT_PRE` + converse were abstracted. Source still has 6 `tsx /tools/` occurrences (`grep -c "tsx /tools/" archetype-generator-prompts.ts` => 6). The guard asserts REFINE STILL `.toMatch(/tsx \/tools\//)`, STILL contains `tsx /tools/platform/submit-output.ts`, and STILL contains the literal mandate `includes explicit \`tsx /tools/...\` invocations`. This catches an over-applied intent rewrite.

### Guard 11 — postProcess never synthesizes delivery_steps (KEY MECHANISM)

- `postProcess` is PRIVATE — cannot import it. Exercise it through the public `generate()` API.
- Mock pattern (copied from `archetype-generator-json-mode.test.ts`): a routing `vi.fn` that returns `'15'` when `messages[0].content` startsWith `'You estimate manual task duration'` (the TimeEstimator system prompt prefix) and returns the main JSON otherwise. Construct via `new ArchetypeGenerator(fn as unknown as typeof callLLM, repo as never)`. Repo stub: `{ record: vi.fn, linkArchetype: vi.fn }`.
- postProcess source (lines 362-364) ONLY null-coerces a non-string delivery_steps; it never injects. `applyModelAndEstimate` (609-660) touches only model/estimate fields. So `delivery_steps: null` in → `null` out is the invariant.
- GOTCHA: `expect(null).not.toContain(str)` THROWS in chai ("the given combination of arguments (null and string) is invalid"). This is actually useful as a RED signal proving the value is truly null — but for a GREEN assertion use `.toBeNull()`. The final test asserts the closer IS in `execution_steps` and `delivery_steps` `.toBeNull()` — proves no cross-field synthesis without tripping the chai null guard.

### Mock JSON must satisfy PostProcessedArchetypeSchema (loose, warn-only)

The schema at line 338 requires role_name/runtime/identity/execution_steps/instructions/tool_registry/overview — but it's `safeParse` + warn-only (returns anyway). Including those fields keeps the log clean. `instructions` is set by postProcess from `execution_steps` regardless.

### Results

- Target file: 26 tests pass. Full suite: 2003 passed | 9 skipped | 0 failed (was 1997 → +6).
- Pino ERROR/WARN noise in stdout is from OTHER tests feeding deliberate bad JSON — all those files show ✓. Use `>/tmp/x.log 2>&1` then grep for the summary; piping `2>/dev/null` does NOT suppress pino (it writes to stdout).
- LSP unavailable (typescript-language-server not pinned in .tool-versions). vitest tsx transform is the authoritative type check. Pre-existing unrelated LSP error in vitest.config.ts (coverage key) — untouched.
- Evidence: `.sisyphus/evidence/task-6-guard.txt`

## Task 7 — Cross-domain parametrized regression tests (2026-06-15)

### What was added (test-only; no source edits)

Extended `tests/unit/gateway/services/archetype-generator-prompts.test.ts` (T6 left it at 26 tests / 238 lines) with 22 new tests in 3 describe blocks → 48 tests in this file. Suite: 2003 → **2025 passed | 9 skipped | 0 failed**.

### Reused everything — zero new imports/helpers

T5+T6 already declared at the top of the file: `INTENT_CLOSER`, `CLI_PATTERN` (`/tsx \/tools\//`), `ESTIMATOR_SYSTEM_PREFIX`, the `ArchetypeGenerator` + `callLLM` + `buildConnectedAppsBlock` imports, and the function-hoisted mock helpers (`makeLLMResult`, `makeGenerateLLMWithStubbedEstimator`, `makeGenerationRepo`). New tests just call them. Read the whole file first before adding — half the scaffolding was already present.

### it.each parametrization pattern (vitest)

`it.each(cases)('$domain: ...', async ({ description, executionSteps, tools, expectPresent }) => {...})` — the `$domain` token in the title interpolates the object key. For the toolkit array variant use `it.each(['notion','gmail',...])('%s connected: ...', (toolkit) => {...})` — `%s` is printf-style for primitive arrays. Both keep cross-domain coverage DRY (1 body, N domains).

### instructions alias proof (the load-bearing assertion)

`postProcess` (archetype-generator.ts:356) hard-sets `result.instructions = result.execution_steps` AFTER reading the model's JSON. To prove the OVERWRITE (not just coincidental equality), the mock JSON sets `instructions` to a deliberately divergent `'STALE PLACEHOLDER ...'`. After `generate()`: `result.instructions === result.execution_steps`, `.not.toContain('STALE')`. This is the only way to distinguish "alias overwrites" from "model happened to return equal values".

### Composio cross-domain nuance (matches MUST-NOT-DO)

The Notion case asserts the PROSE (`execution_steps`) has no `tsx /tools/composio/execute.ts`, while the `tool_registry.tools` array IS allowed to name `/tools/composio/execute.ts`. The abstraction target is the intent prose, not the tool registry — tool_registry stays CLI-path-shaped (postProcess normalizes bare `service/tool` → `/tools/service/tool.ts`). Did NOT assert action-slug correctness.

### Hook friction (comments)

The pre-existing file convention is single-line `// Invariant under guard: ...` rationale comments above guard describe blocks (original lines 128, 176). My first draft added verbose 3-line blocks → comment hook fired. Condensed to the file's existing one-line invariant style + removed one redundant value-restating comment. Match the file's comment density, don't exceed it.

### Verification

- `pnpm test:unit -- --run` (positional path arg does NOT filter — it runs the whole suite; that's the required full-suite check anyway). 171 files, 2025 passed, 0 fail.
- LSP unavailable (typescript-language-server not in .tool-versions) — vitest tsx transform is authoritative type check; clean collection across all 171 files = type-clean.
- Evidence: `.sisyphus/evidence/task-7-cross-domain.txt`
