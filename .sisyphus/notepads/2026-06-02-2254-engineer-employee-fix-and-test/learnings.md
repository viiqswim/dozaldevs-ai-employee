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

## 2026-06-03 Task 2: DozalDevs engineer archetype DB fix — COMPLETE

### Fix applied (DB-only, no source changes)

- `tool_registry`: added `/tools/github/get-token.ts` alongside existing tools
- `worker_env`: removed `GH_TOKEN` and `GITHUB_TOKEN` (hardcoded PATs); kept only `GITHUB_REPO_URL`
- `execution_steps`: replaced with GitHub App token pattern using `get-token.ts`, per-task branch using `$TASK_ID`

### Verification results

- `uses_get_token = t` ✓
- `has_pat = f` ✓ (PAT fully removed)
- `uses_task_id = t` ✓
- `model = xiaomi/mimo-v2.5-pro` ✓ (unchanged)

### Method

- Dollar quoting (`$BODY$...$BODY$`) used for execution_steps to handle backticks and special chars
- SQL file written to `/tmp/fix-dozaldevs-archetype.sql` and executed via `psql -f`

### Evidence

- `.sisyphus/evidence/task-2-archetype-verify.txt`

## 2026-06-03 Task 6: DozalDevs engineer E2E test — COMPLETE ✅

### Test Run

- Task ID: `23817c79-7159-4c47-bf75-66c0672ce37a`
- Prompt: "Add a one-line comment to the top of README.md that says: # This project is a test target for the AI Employee platform."
- Final status: Done
- Total duration: ~15 minutes (5:03 to 5:18 UTC)

### T1 Harness Fix — VERIFIED

- Log: `[opencode-harness] raw_event.inputs.prompt injected as ## Your Assignment`
- Confirmed: `inputs.prompt` properly passed through to OpenCode

### Model Behavior (xiaomi/mimo-v2.5-pro)

- **Mimo SUCCESSFULLY called bash tools** — contrary to the risk warning in AGENTS.md
- Tools called in sequence:
  1. `tsx /tools/github/get-token.ts` — GitHub token obtained
  2. `pnpm install --ignore-scripts` — deps installed
  3. `npx prisma generate` — prisma generated
  4. `pnpm build` — project built
  5. `timeout 180 pnpm test -- --run` — tests ran (with timeout wrapping)
  6. Made code change (1-line comment added to README.md)
  7. Created PR via gh CLI
  8. `tsx /tools/platform/submit-output.ts --summary "PR created: ..." --classification "NEEDS_APPROVAL" --draft-file /tmp/summary.txt`

### Full Lifecycle Trace

```
Received      → Triaging      05:03:24
Triaging      → AwaitingInput 05:03:25
AwaitingInput → Ready         05:03:25
Ready         → Executing     05:03:25
Submitting    → Validating    05:17:40  (worker submitted)
Validating    → Submitting    05:17:40
Submitting    → Reviewing     05:17:40  (approval required)
Reviewing     → Approved      05:18:09  (manual approval via Inngest event)
Approved      → Delivering    05:18:09
Delivering    → Done          05:18:45
```

### PR Created

- URL: https://github.com/viiqswim/dozaldevs-ai-employee/pull/2
- Title: AI Task: 23817c79
- Branch: `ai/23817c79-engineer` (correct pattern — uses $TASK_ID)
- Change: README.md +1 line

### Key Findings

- Mimo v2.5-pro IS capable of tool calling for engineer tasks
- Per-task branch naming working: `ai/{taskId[:8]}-engineer`
- NEEDS_APPROVAL classification used correctly (not NO_ACTION_NEEDED)
- Manual approval via `POST http://localhost:8288/e/local` works

### Evidence File

- `.sisyphus/evidence/task-6-dozaldevs-e2e.txt`

---

## 2026-06-03 Task 7: VLRE github-code-engineer E2E test — COMPLETE ✅

### Test Run

- Task ID: `8331fad7-d0a3-4dac-a48c-de916af873ae`
- Prompt: "Add a one-line comment to the top of README.md that says: # This project is a test target for the AI Employee platform."
- Final status: Done
- Total duration: ~9 minutes (05:23 to 05:32 UTC)

### T1 Harness Fix — VERIFIED

- Log: `[opencode-harness] raw_event.inputs.prompt injected as ## Your Assignment`
- Confirmed: `inputs.prompt` properly passed through to OpenCode

### Model Behavior (xiaomi/mimo-v2.5-pro)

- **Mimo SUCCESSFULLY called bash tools** — confirmed for VLRE tenant too
- GitHub token obtained via `tsx /tools/github/get-token.ts` after exploring multiple paths
- Also called `/internal/tasks/${TASK_ID}/github-token` gateway endpoint directly
- Model explored filesystem for PEM keys (found none) before discovering the tool — expected exploration behavior

### Full Lifecycle Trace

```
Received      → Triaging      05:23:02.104
Triaging      → AwaitingInput 05:23:02.406
AwaitingInput → Ready         05:23:02.413
Ready         → Executing     05:23:02.42
Submitting    → Validating    05:30:17.935  (worker submitted, ~7 min execution)
Validating    → Submitting    05:30:17.941
Submitting    → Reviewing     05:30:17.956  (approval required)
Reviewing     → Approved      05:31:18.49   (manual approval via Inngest event)
Approved      → Delivering    05:31:18.494
Delivering    → Done          05:32:07.236
```

### PR Created

- URL: https://github.com/viiqswim/ai-employee-test-target/pull/37
- Title: "Add comment to README.md indicating project is a test target"
- Branch: `ai/8331fad7-code-fix`

### Key Findings

- VLRE engineer employee fully functional end-to-end
- delivery_steps fix (Task 3) confirmed working — Delivering → Done without issues
- `xiaomi/mimo-v2.5-pro` confirmed reliable for tool calling across BOTH tenants
- GitHub App token flow: model tried `tsx /tools/github/get-token.ts` AND direct gateway call — both worked
- OpenCode session: `ses_174109621ffeinlsTAjLkj2ngs`, 41+ tool loops, ~7 min total

### Evidence File

- `.sisyphus/evidence/task-7-vlre-e2e.txt`

---

## 2026-06-03 Task 3: VLRE engineer archetype delivery_steps fix — COMPLETE

### Fix applied (DB-only, no source changes)

- `delivery_steps`: set to `'Post the pull request URL and summary to Slack.'` (was NULL)
- `tool_registry`: added `/tools/slack/post-message.ts` (was missing; needed for delivery_instructions to work)

### Verification results

- `delivery_steps = 'Post the pull request URL and summary to Slack.'` ✓
- `tool_registry` now includes `/tools/slack/post-message.ts` ✓
- `model = xiaomi/mimo-v2.5-pro` ✓ (unchanged)

### Evidence

- `.sisyphus/evidence/task-3-vlre-delivery.txt`

---

## 2026-06-03 Task 8: Documentation update — COMPLETE

### Changes made

1. `docs/employees/2026-06-02-1230-engineer.md`
   - Added VLRE archetype ID: `db2974dc-ab37-4034-9ce2-1c7b91e424b5` (role_name: `github-code-engineer`)
   - Replaced placeholder "Verified E2E Flow" section with real test data for both archetypes
   - DozalDevs: task `23817c79`, PR #2, ~15 min
   - VLRE: task `8331fad7`, PR #37, ~9 min

2. `AGENTS.md`
   - Updated model warning to note `xiaomi/mimo-v2.5-pro` (distinct from `xiaomi/mimo-v2.5`) is verified to reliably call bash tools in engineer employee context (E2E verified 2026-06-03)

### Commit

- `79dc039c` — `docs(engineer): record verified E2E results and update model warning`

### Evidence

- `.sisyphus/evidence/task-8-docs-verify.txt`
