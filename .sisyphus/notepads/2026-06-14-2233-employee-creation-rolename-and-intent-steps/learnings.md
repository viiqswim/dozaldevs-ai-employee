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
