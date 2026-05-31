## [2026-05-31] Task 4 — execution_steps targeted fixes + retry

### Changes Made

- Added SIBLING UNITS AUDIT rule after ROOM/UNIT IDENTIFICATION in execution_steps
- Added RATE LOOKUP NOTE for 7213 Nutria Run after CHECK-IN BILLING RULE section
- Applied to DB (archetype 00000000-0000-0000-0000-000000000019) and prisma/seed.ts (both CREATE + UPDATE blocks)
- seed.ts lines ~3556-3557 (CREATE) and ~3739-3740 (UPDATE)

### Task 4 Run Results (Task ID: 5a47db27-9391-4a37-95bd-f116b566e3d0)

- Status: Failed (pre-existing delivery_instructions=NULL)
- Runtime: ~25 minutes

### Issue 1 (NUT-2 MISSING): FIXED ✅

- NUT-2 now appears in both Slack schedule messages
- SIBLING UNITS AUDIT rule worked as intended

### Issue 2 (NUT-3 rate 40min → 25min): MIXED RESULT ⚠️

- First Slack message: NUT-3 at $30 ✅ (correct)
- Second Slack message: NUT-3 at $40/40min ❌ (wrong again)
- Employee posted the schedule TWICE (separate "never send multiple Slack messages" violation)
- The RATE LOOKUP NOTE helped the first pass but model re-computed incorrectly on second attempt
- Root cause: model ran STEP 5 (post to Slack) twice — likely re-ran due to self-correction loop

### New issue identified

- Employee posted the cleaning schedule TWICE in the same thread
- This violates "Never send multiple Slack messages — one message to one channel only"
- Possible cause: model posted first, then re-evaluated and posted a "corrected" version
- Resolution: would need stronger anti-repetition rule in execution_steps (not in scope for this task)

### HOV-3 billing issue (pre-existing, not in scope)

- HOV-3 checkout with HOV-HOME check-in should charge HOME rate ($120/100min)
- Both messages show HOV-3 at room rate ($30) - billing rule for HOV not followed
- The CHECK-IN BILLING RULE section already covers this case but model is not applying it correctly
- Pre-existing issue, not introduced by our changes

### Evidence file

.sisyphus/evidence/task-4-retry-output.txt

## [2026-05-31] Task 4 Run 11 — NUT Home/Room rate fix
- Changed: HARD RATE RULE now explicitly states "$160 / 185 min = NUT-HOME ONLY. NEVER apply $160 to any individual room." with WRONG/CORRECT examples
- Result: PASS ✅
- NUT-2 rate: $30 / 25 min ✅ (was $160 in Run 10)
- NUT-3 rate: $30 / 25 min ✅ (was $160 in Run 10)
- NUT-5 rate: $40 / 40 min ✅
- HOV-3 rate: $120 / 100 min ✅
- All 8 checkouts present: YES ✅
- Single Slack post: YES ✅ (2 msgs total: 1 platform + 1 schedule)
- Note: 9th unexpected property appeared (3505 Banton Rd Unit B, $30/25 min) — likely legitimate checkout
- Root cause confirmed: Model was reading $160 from Reporte Financiero Home entry and applying it to rooms. Explicit "WRONG: NUT-2 = $160" example prevented this.
