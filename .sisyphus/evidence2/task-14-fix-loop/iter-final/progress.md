# Iter-Final Progress — T14 Cleaning Schedule Fix

## Status: 5/5 CORRECT ✅

## Fixes Applied

### Fix A — Remove VLRE-specific literal

- File: `src/gateway/services/prompts/archetype-generator-prompts.ts`
- Line 189: Removed `(Manual de Personal)` from Source Authority Rule example
- Both `SYSTEM_PROMPT_PRE` and `buildConverseSystemPromptPre` updated
- Scan confirmed: no other VLRE-specific literals (cleaner names, ZIPs, page names) in file

### Fix B — Strengthen non-roster-directory anti-inference rule

- Added CRITICAL sentence to Zone-Lookup Authority Rule in both prompt paths:
  > "Zone/area groupings that appear in non-roster directories (property directories, trash directories, geographic directories) NEVER imply that a team member covers that zone — only explicit listing in the staff/team roster source establishes coverage. If a zone/area is NOT explicitly listed in the roster source for a team member, that team member does NOT cover it, and any property in that zone MUST be marked UNASSIGNED."
- Also strengthened step 3 of RUNTIME REFERENCE-DATA EXTRACTION PATTERN in `buildConverseSystemPromptPre`

### Fix C — INSERT bug (approval_required=true)

- Archetype INSERT now uses `risk_model = '{"approval_required": false}'::jsonb` explicitly
- v20 was stuck in Reviewing due to this bug — v21 goes straight to Done

### Fix D — printenv INPUT_TARGET_DATE (discovered during run)

- v21 execution_steps initially lacked `printenv INPUT_TARGET_DATE` in step 2
- All 5 tasks ran on today's date (June 17) instead of the target dates
- Fixed by updating archetype execution_steps to use `printenv INPUT_TARGET_DATE` + node date calculation
- Re-triggered all 5 dates — all completed correctly

## Archetype Created

- **role_name**: `cleaning-schedule-v21`
- **id**: `5556fb09-4519-44ad-9745-c96e97fe3e0e`
- **model**: `deepseek/deepseek-v4-flash`
- **vm_size**: `performance-1x`
- **risk_model**: `{"approval_required": false}`
- **tool_registry**: `/tools/hostfully/get-checkouts.ts`, `/tools/composio/execute.ts`, `/tools/slack/post-message.ts`, `/tools/platform/submit-output.ts`
- **input_schema**: `target_date` (date, every_run, required)
- **Notion page IDs**: verbatim from user description (no fictional names)

## Task Results (Round 2 — with printenv fix)

| Date             | Task ID                              | Status | Oracle Verdict |
| ---------------- | ------------------------------------ | ------ | -------------- |
| 2026-06-15 (Mon) | 3a13765b-23e2-4d58-b626-c4aa2c6a2348 | Done   | ✅ CORRECT     |
| 2026-06-20 (Sat) | acdd37af-5a0f-4646-8f59-10d3252d8787 | Done   | ✅ CORRECT     |
| 2026-06-22 (Mon) | 02faa7a8-0d6c-4fb3-a48e-01170c2c249b | Done   | ✅ CORRECT     |
| 2026-06-28 (Sun) | 689ca927-b1fb-443d-b612-1174cee8cac2 | Done   | ✅ CORRECT     |
| 2026-07-04 (Sat) | d346bfc3-e0a4-4a06-8bb1-a99bf3e20df7 | Done   | ✅ CORRECT     |

## Key Verdicts

### 06-22 (Critical — was failing in v19)

- 6002 Palm Circle (ZIP 78741) → **UNASSIGNED** ✅
- Reason: "Zona 78724/78741/78722 no cubierta en el directorio de personal"
- Yessica has 0 checkouts assigned ✅
- Fix B (non-roster-directory anti-inference) worked

### 06-15

- Diana → 271 Gina Dr Room 2 ✅
- Yessica → 7213 Nutria Run Room 1 ✅
- 3505 Banton Rd (3 rooms) → UNASSIGNED ✅

### 06-20

- Yessica → 3420 Hovenweep (100 min) + 7213 Nutria Run (90 min) = 190 min ≤ 240 min Saturday limit ✅
- Berenice/Susana → 4403 Hayride overflow ✅
- 5306 King Charles → UNASSIGNED ✅

### 06-28

- Berenice → 4403 Hayride Unit A ✅
- Susana → 4405 Hayride Unit A ✅
- 3505 Banton Rd → UNASSIGNED ✅
- Yessica NOT assigned (Sunday) ✅

### 07-04

- Yessica → 4403 Hayride Unit A (90 min, Saturday) ✅

## Next Steps

- [ ] Genericity proof (daily-motivation)
- [ ] Baseline-B regen
- [ ] Commit: `fix(archetype-generator): keep reference-data source examples generic`
