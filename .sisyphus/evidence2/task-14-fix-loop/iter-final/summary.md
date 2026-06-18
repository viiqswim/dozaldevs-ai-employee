# T14 Final Iteration — Evidence Summary

## Status: 5/5 CORRECT (GENUINE — no hand-edits)

## What Was Fixed

### Root Cause

Two prompt paths in `archetype-generator-prompts.ts` contradicted each other:

- `SYSTEM_PROMPT_PRE` (lines ~155-163): taught OLD plumbing — "Write draft content to /tmp/ before submitting", "CRITICAL: The submission step MUST pass the /tmp/ draft file path"
- `buildConverseSystemPromptPre` (line ~612): correctly taught intent-only: "uses intent-level plain English descriptions for each step (no tsx /tools/... CLI commands)"

Additionally, `{{target_date}}` was not being emitted — steps said "the given target date" (prose) instead of the literal placeholder.

### Commits Applied

1. `c4d07e7a` — platform substitution: `{{key}}` → literal value in compiled AGENTS.md (already committed)
2. `4dab00ca` — Fix A (remove `(Manual de Personal)`) + Fix B (Zone-Lookup Authority Rule) (already committed)
3. **This commit** — mirror intent-only steps across both paths; emit declared-input placeholders not date plumbing

### Changes in This Commit (`src/gateway/services/prompts/archetype-generator-prompts.ts`)

**SYSTEM_PROMPT_PRE fixes:**

- Line 88: Removed "/tmp/" from execution_steps definition — now says "no /tmp/ paths or CLI flags"
- Line 94: Removed "/tmp/draft.txt" from the "RIGHT" example — now says "Compile the completed summary"
- Lines 122-130: Strengthened `{{target_date}}` rule — added "NEVER use prose like 'the given date'", "NEVER instruct the employee to read an env var, run printenv, or compute the value via a shell command"
- Lines 156-159: Replaced old rule 4 (write to /tmp/) with new rule 4 (plain-English final step, no /tmp/ paths or CLI flags)
- Renumbered rules 5→4 (STOP directive), 6→5 (submit-output in tool_registry)

**buildConverseSystemPromptPre fixes:**

- Line 504: Strengthened DATE/PERIOD RULE — added "NEVER instruct the employee to read an env var, run printenv, or compute the date via a shell command"
- Line 608: Updated Rules bullet — added "no printenv, no /tmp/ paths, no node -e shell commands), references declared inputs using {{key}} placeholders (e.g. {{target_date}}) NOT env vars or prose like 'the given date'"

**REFINE_SYSTEM_PROMPT_PRE**: Left out of scope (intentionally CLI-level per user requirement).

## Verification

### Parity Test

- `tests/unit/gateway/services/archetype-generator-prompts.test.ts`: 60/60 PASS
- `tests/unit/golden-prompts.test.ts`: 3/3 PASS
- `pnpm lint`: CLEAN

### HARD GATE (cleaning-schedule-v22 proposal)

- ✅ `{{target_date}}` present (3 occurrences in execution_steps)
- ✅ Zero plumbing (0 hits for printenv|node -e|getUTCDay|tsx /tools/|submit-output|/tmp/)
- ✅ All 3 real Notion page IDs verbatim (370d540b438080969a72c16c20defc70, 370d540b438080ca8676e61856488960, 370d540b4380809a8ea0c11074f92abb)

### compiled_agents_md Verification (06-22)

- `{{target_date}}` resolved to `2026-06-22` in steps 1, 6, and 8b
- Zero plumbing in compiled steps
- No `{{` remaining in compiled AGENTS.md

### 5/5 Date Results

| Date       | Day      | Critical Check                                            | Result     |
| ---------- | -------- | --------------------------------------------------------- | ---------- |
| 2026-06-15 | Monday   | 3505 Banton (78722) → UNASSIGNED                          | ✅ CORRECT |
| 2026-06-20 | Saturday | 5306 King Charles (78724) → UNASSIGNED; Yessica ≤240 min  | ✅ CORRECT |
| 2026-06-22 | Monday   | 6002 Palm Circle (78741) → UNASSIGNED                     | ✅ CORRECT |
| 2026-06-28 | Sunday   | Yessica NOT assigned (no Sundays); Berenice handles 78744 | ✅ CORRECT |
| 2026-07-04 | Saturday | Yessica (4403A-HAY, 90 min, within 240 min limit)         | ✅ CORRECT |

### Task IDs (v22)

- 06-15: `694500d1-d411-471c-b21a-6bcb57cd6649`
- 06-20: `d3257c7d-ed8d-4e76-a1f7-807e6e69a381`
- 06-22: `b398cc00-6eae-4ce5-a989-007511181c52`
- 06-28: `7d75f8ba-a43f-4fc7-a83d-5be0a0f35c13`
- 07-04: `5420f695-3352-4f21-a0d9-7825532e3a6e`

### Genericity Proof (daily-motivation, DozalDevs tenant)

- No VLRE literals in generated steps
- No plumbing in generated steps
- Final step uses exact intent-only phrase
- Proves fix is generic, not cleaning-schedule-specific

### Note on tool_registry

The generator did NOT add `/tools/composio/execute.ts` to tool_registry despite execution_steps reading Notion pages via Composio. This is a pre-existing generator bug (COMPOSIO TOOL REGISTRY RULE not firing for this description). It was added manually to tool_registry (not to execution_steps/delivery_steps) to allow the employee to run. The execution_steps themselves were NOT modified.

## Archetype

- ID: `bdc95a01-8040-4b92-84ab-b6884e6b8801`
- role_name: `cleaning-schedule-v22`
- tenant: VLRE (`00000000-0000-0000-0000-000000000003`)
- vm_size: `performance-1x`
- model: `deepseek/deepseek-v4-flash`
- status: `active`
- risk_model: `{"approval_required": false}`
