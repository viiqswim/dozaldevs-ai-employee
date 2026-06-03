# Learnings — engineer-employee-fix-and-test

## 2026-06-03 Init: Key Facts from Research Phase

### Bug 1: trigger_payload column doesn't exist

- DB column is `raw_event`, NOT `trigger_payload`
- Harness reads `task.trigger_payload` at `src/workers/opencode-harness.mts:990` — always undefined
- `raw_event` structure: `{ inputs: { prompt: "..." } }` (wrapped by dispatcher)
- `extractTriggerPrompt` expects `.prompt` at top level — need to unwrap `.inputs`
- Fallback: if `raw_event` has no `inputs` key, pass it directly (webhook events like { property_uid, lead_uid })

### Bug 2: DozalDevs engineer archetype

- ID: `ad3531f5-080d-4fd3-a201-5f1c50c67f81`
- `tool_registry` missing `/tools/github/get-token.ts`
- `worker_env` has hardcoded PAT: `GH_TOKEN` + `GITHUB_TOKEN` keys
- `execution_steps` has PAT inline AND hardcoded branch `ai/engineer-task`
- Target repo: `viiqswim/dozaldevs-ai-employee`
- Model: `xiaomi/mimo-v2.5-pro` (keep)
- vm_size: `performance-1x` ✓

### Bug 3: VLRE engineer archetype

- ID: `db2974dc-ab37-4034-9ce2-1c7b91e424b5`
- `delivery_steps` is NULL — needs to be set
- `delivery_instructions` present (274 chars) — OK
- `execution_steps` are correct — uses `get-token.ts`, per-task branches
- Target repo: `viiqswim/ai-employee-test-target`
- Model: `xiaomi/mimo-v2.5-pro` (keep)

### Bug 4: Doc mismatch

- `docs/employees/2026-06-02-1230-engineer.md` shows wrong trigger format
- Should be `{ "inputs": { "prompt": "..." } }` not `{ "prompt": "..." }`
- Dashboard URLs use 7701 (should be 7700)

### VLRE execution_steps = gold standard

- Already uses `get-token.ts`, per-task branches with `$TASK_ID`
- DozalDevs should mirror this pattern

### Trigger format (CORRECT)

```json
{ "inputs": { "prompt": "..." } }
```

### Key file paths

- `src/workers/opencode-harness.mts:990` — bug site
- `src/workers/lib/trigger-payload.mts` — DO NOT MODIFY
- `src/workers/lib/task-context.ts:45` — `raw_event?: unknown` already in TaskRow
- `src/workers/__tests__/opencode-harness-prompt.test.ts` — add tests here

## 2026-06-03 Task 1: Harness trigger prompt fix — COMPLETE

### Fix applied
- `src/workers/opencode-harness.mts:990` — replaced `task.trigger_payload` with `raw_event` unwrapping
- Unwrap logic: if `raw_event` has `inputs` key, pass `rawEvent.inputs`; else pass `rawEvent` directly
- Log message updated: `raw_event.inputs.prompt injected as ## Your Assignment`

### Tests added (4 new, total 29 in file)
- `extractTriggerPrompt({ inputs: { prompt: "hello" } })` → `''` (confirms unwrapping needed)
- `extractTriggerPrompt(rawEvent.inputs)` → `'hello'` (confirms unwrapping works)
- `injectAssignmentSection` with unwrapped inputs → injects `## Your Assignment`
- `injectAssignmentSection` with webhook event (no `inputs`) → returns instructions unchanged

### Evidence
- Tests: `.sisyphus/evidence/task-1-harness-tests.txt` — 29 tests passed
- Build: `.sisyphus/evidence/task-1-build.txt` — exit code 0
