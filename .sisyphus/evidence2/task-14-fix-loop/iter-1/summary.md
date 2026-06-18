# Task T14 Fix Loop — Iteration 1 Evidence

**Date**: 2026-06-17
**Commit**: c4d07e7a

## Platform Fix Applied

### Files Modified

- `src/workers/lib/execution-phase.mts` — Added `substituteTemplateVars(rawCompiledAgentsMd, templateVars)` after `compileAgentsMd()`
- `src/workers/lib/delivery-phase.mts` — Added same substitution with freshly-built `templateVars`
- `src/workers/lib/agents-md-compiler.mts` — Reverted bridge sentence from `DATE_PARAMETERIZATION_RULES`; reverted `{{target_date}}` clause from `isDateParameterized()`
- `src/__tests__/input-schema-pipeline.test.ts` — Added 3 new tests proving multi-key generic substitution

### Fix Mechanism

`buildTemplateVars()` maps every `INPUT_<KEY>` env var → `key`. `substituteTemplateVars(text, vars)` replaces `{{key}}` patterns only for known keys, leaves unknowns untouched. Applied to compiled AGENTS.md before writing to `/app/AGENTS.md` and before saving `compiled_agents_md` snapshot.

## Archetype Created

- **role_name**: `cleaning-schedule-v17`
- **id**: `8ed564e5-0bd9-4480-87f3-808db04e2973`
- **vm_size**: `performance-1x`
- **model**: `deepseek/deepseek-v4-flash`
- **approval_required**: false
- **input_schema**: `[{"key": "target_date", ...}]`
- **execution_steps**: Contains `{{target_date}}` (wizard-generated, no plumbing)
- **Plumbing check**: CLEAN (no `printenv`, `node -e`, `getUTCDay`, `tsx /tools/`, `<approved-content>`, `/tmp/`)

## 5-Date Run Results

| Date       | Task ID  | Status | {{target_date}} resolved | Date in compiled_md |
| ---------- | -------- | ------ | ------------------------ | ------------------- |
| 2026-06-15 | 509ba0ec | Done   | ✅ OK                    | ✅ OK               |
| 2026-06-20 | 0cc71733 | Done   | ✅ OK                    | ✅ OK               |
| 2026-06-22 | 54bf01d2 | Done   | ✅ OK                    | ✅ OK               |
| 2026-06-28 | a9d8d93d | Done   | ✅ OK                    | ✅ OK               |
| 2026-07-04 | 6ee571e3 | Done   | ✅ OK                    | ✅ OK               |

**Platform fix verified: `{{target_date}}` resolved in ALL 5 tasks.**

## Oracle Judgments

| Date       | Day      | Checkouts | Verdict    | Notes                                                                                                                                                  |
| ---------- | -------- | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-15 | Monday   | 5         | ⚠️ PARTIAL | Yessica assigned to 3505 Banton Rd (78722) — oracle says UNKNOWN. Trash duties incomplete.                                                             |
| 2026-06-20 | Saturday | 11        | ⚠️ PARTIAL | Total 725min correct! Zenaida/Diana correct. Yessica over-assigned (460min vs 190min limit). 5306 King Charles assigned to Yessica instead of UNKNOWN. |
| 2026-06-22 | Monday   | 1         | ⚠️ PARTIAL | 6002 Palm Circle → Yessica (oracle: UNKNOWN/78741). Duration 165min vs 180min. Trash incomplete.                                                       |
| 2026-06-28 | Sunday   | 3         | ⚠️ PARTIAL | All → Yessica (oracle: Berenice/Susana for 78744 on Sunday, UNKNOWN for 78722). Trash incomplete.                                                      |
| 2026-07-04 | Saturday | 1         | ⚠️ PARTIAL | Yessica/90min correct! Trash duties missing (7213 Nutria Run + 271 Gina Dr Monday reminder).                                                           |

**Assessment**: The platform fix ({{target_date}} substitution) works perfectly. The remaining inaccuracies are model reasoning quality issues (cleaner assignment rules, trash duty completeness, capacity limits), NOT platform bugs. The model doesn't have the Notion data baked into its context — it's reading from Notion at runtime but the Notion pages don't have the same structure the model expects ("Cleaning Rules" database, "Cleaner Assignments" database, "Trash Schedule" database). The actual Notion pages are prose documents, not structured databases.

## Live-Fetch Proof

Log file `/tmp/employee-509ba0ec.log` contains 384 lines mentioning `composio/NOTION/get-checkouts`. The harness log shows:

- `composio-notion` skill loaded and filtered (connected toolkit)
- `hostfully` skill loaded and filtered (connected service)
- Both used during execution

## Generic Fix Proof (daily-motivation)

- Task ID: `3271be82`
- Status: Done
- No regression — employee with no `{{...}}` placeholders runs cleanly

## Baseline-B Results

| Employee         | kind     | exec_steps len | tools | Result  |
| ---------------- | -------- | -------------- | ----- | ------- |
| guest-messaging  | proposal | 1055           | 4     | ✅ PASS |
| code-rotation    | proposal | 605            | 4     | ✅ PASS |
| daily-motivation | proposal | 231            | 1     | ✅ PASS |

## Remaining Issues (Model Quality, Not Platform)

The model assigns cleaners incorrectly because:

1. The Notion pages are prose documents, not structured databases — the model can't reliably extract "Cleaning Rules database" or "Cleaner Assignments database" from prose
2. The execution_steps reference "Cleaning Rules database" and "Cleaner Assignments database" which don't exist as named databases in Notion
3. The model doesn't apply capacity limits (Yessica's Saturday 4h window)
4. Trash duty logic is incomplete

**Root cause**: The archetype's execution_steps assume Notion has structured databases, but the actual Notion pages are prose. The archetype needs to reference the actual Notion page IDs and describe the prose structure.
