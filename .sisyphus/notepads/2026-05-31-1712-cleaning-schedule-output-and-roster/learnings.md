## [2026-05-31] Plan Init

### Inherited from previous plan (fix-get-properties-pagination)

- execution_steps CREATE block: prisma/seed.ts ~line 3556 onward
- execution_steps UPDATE block: prisma/seed.ts ~line 3739 onward
- Both blocks MUST always be kept in sync
- DB update via: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "UPDATE archetypes SET execution_steps = '...', updated_at = NOW() WHERE id = '00000000-0000-0000-0000-000000000019';"
- Task status shows "Failed" due to delivery_instructions=NULL (pre-existing) — acceptable, worker still posts to Slack
- Archetype ID: 00000000-0000-0000-0000-000000000019
- Tenant ID: 00000000-0000-0000-0000-000000000003 (VLRE)
- Slack channel: C0B71QSMZKQ
- Model: deepseek/deepseek-v4-flash (confirmed working)
- ATOMIC SINGLE POST rule in STEP 5 working ✅ (prevents double-posting)
- HARD RATE RULE for NUT rooms working ✅

### June 1 Expected Checkouts (7 total)

- Austin (78744) → Yessica (weekday primary):
  1. 4403B-HAY-HOME → "4403 Hayride Ln — Unidad B"
  2. 4405A-HAY-HOME → "4405 Hayride Ln — Unidad A"
  3. 7213-NUT-4 → "7213 Nutria Run — Habitación 4"
- Kyle (78640) → Diana (all week primary): 4. 271-GIN-3 → "271 Gina Dr — Habitación 3" 5. 3505-BAN-1 → "3505 Banton Rd — Habitación 1" 6. 3505-BAN-2 → "3505 Banton Rd — Habitación 2" 7. 3505-BAN-3 → "3505 Banton Rd — Habitación 3"

## [2026-05-31 18:02] Task 1 — execution_steps + fixture update
- Changes applied: COST DISPLAY RULE, LETTER-PREFIX UNITS, TEAM ASSIGNMENT rewrite (Change C), Notion fixture update (Change D)
- Angela/Abi/Rocio/Norma removed: YES — confirmed absent from DB execution_steps and fixture
- seed.ts lines modified: CREATE block ~3556-3692, UPDATE block ~3777-3910 (both updated via replaceAll)
- DB updated: YES — UPDATE 1 row confirmed via psql dollar-quoted SQL
- Verification: PASS — all 5 checks passed
  - COST DISPLAY RULE: PASS
  - LETTER-PREFIX UNITS: PASS
  - Zenaida is the ONLY cleaner: PASS
  - Diana is PRIMARY (Kyle): PASS
  - BACKUP THRESHOLD (Austin): PASS
- Fixture: Diana updated, Berenice/Susana updated, Abi y Rocio removed, Norma removed, Mary o Carrie updated
- Evidence: .sisyphus/evidence/task-1-execution-steps-check.txt, task-1-fixture-check.txt
- Note: grep -iw was the reliable pattern for forbidden name detection on macOS (not -P)
- Note: Used Node.js + dollar-quoting SQL file to safely push 15KB execution_steps to DB

## Task 2 — June 1 Trigger Run (2026-05-31)

### What Happened
- Triggered cleaning-schedule with `{"inputs": {"date": "2026-06-01"}}`
- Task ID: d7f504ed-01dc-4878-a61b-76805a9ac06e
- Task reached: Done
- Model used: minimax/minimax-m2.7 (NOT deepseek — archetype not overridden)

### Critical Finding: Employee Ignored INPUT_DATE
- `INPUT_DATE=2026-06-01` was correctly set as env var in container
- Employee used TODAY (May 31, Sunday) from prompt header instead
- Output: "Domingo 31 de Mayo" — wrong date entirely
- Root cause: execution_steps says "date: The target date provided in inputs" but doesn't tell the model HOW to read it (no `echo $INPUT_DATE` instruction, no `{{date}}` template substitution)

### What the Output Showed (May 31 checkouts)
- Diana assigned 5 Austin properties (Sunday = Diana primary for Austin)
- 3420 Hovenweep Ave — Habitación 3 (Casa rate, 100 min)
- 3505 Banton Rd — Habitación 1, 2, 3 (25 min each)
- 4403 Hayride Ln — Unidad A (90 min)
- Costs in Resumen: $290 total ✓
- No $ in per-property lines ✓
- No double-posting ✓
- Angela/Abi/Rocio/Norma absent ✓

### Fix Needed
Two options:
1. Add `{{date}}` to execution_steps and use template substitution (cleanest)
2. Add explicit instruction: "Read target date: run `echo $INPUT_DATE` to get the date"
3. Override model to deepseek/deepseek-v4-flash which may be better at reading env vars

### Checklist Results
- PASS: No $ in per-property lines
- PASS: Costs in Resumen
- PASS: No double-posting
- PASS: Angela/Abi/Rocio/Norma absent
- FAIL: Wrong date (May 31 not June 1)
- FAIL: Wrong properties (May 31 checkouts not June 1)
- FAIL: Wrong cleaner assignment (Diana for Austin on Sunday, not Yessica for Monday)
- FAIL: Missing 7213 Nutria Habitación 4
- FAIL: Missing 271 Gina Habitación 3
- FAIL: Missing 4405A Unidad A
- FAIL: 4403 shows Unidad A (May 31 checkout) not Unidad B (June 1 checkout)

## [2026-05-31] Task 3 — INPUT_DATE fix

- Root cause: execution_steps STEP 1 never told model to read $INPUT_DATE — model defaulted to TODAY header in the prompt
- Fix A: Added "CRITICAL: run `printenv INPUT_DATE` to get the date" at very top of STEP 1 instructions
- Fix B: Updated hardcoded date filter examples from "target date 2026-05-31" to generic "assuming targetDate = 2026-06-01"
- Both fixes applied to DB (UPDATE 1 confirmed) and prisma/seed.ts (CREATE block ~3531 and UPDATE block ~3752)
- Task triggered for 2026-06-01, reached status: Done

### Verification Results
- ✅ DATE FIX CONFIRMED: Output now shows "Lunes 1 de Junio" (was "Domingo 31 de Mayo")
- ✅ All 7 expected June 1 checkouts PRESENT in output
- ✅ No dollar amounts in per-property lines (COST DISPLAY RULE respected)
- ✅ Forbidden names (Angela/Abi/Rocio/Norma) absent
- ❌ Yessica NOT assigned Austin properties on weekday Monday — Berenice/Susana assigned instead
- ❌ 7 EXTRA unexpected checkouts found (14 total vs 7 expected)

### Remaining Issues (not caused by INPUT_DATE bug)
1. **Yessica skip**: Model assigned Berenice (7 props, 420 min) and Susana (5 props) to Austin instead of Yessica first. Backup threshold rule (420 min) may have triggered, but Yessica should be assigned FIRST up to 420 min.
2. **Extra checkouts**: Model found 14 June 1 checkouts instead of expected 7. Could be real Hostfully data OR model including check-in dates. Unexpected extras: 271 GIN-HOME Casa (185 min), 3401 Breckenridge-1, 4403-Unidad A, 5306 King Charles-Unidad A, 7213 NUT-2/3/5, 6002 Palm Circle.
3. **271 Gina Dr — Casa (185 min)**: Model created a "Casa" entry at 185 min (same as HOV-HOME rate). The CHECK-IN BILLING RULE may have been applied incorrectly (GIN-HOME billing rate is different from HOV-HOME).
4. **3505 Banton Rd city**: Model shows "Austin" but expected "Kyle" — may be Hostfully data issue or address lookup returning wrong city.

### Pattern: Model Assigns No Work to Yessica
The model appears to completely skip Yessica and uses backups (Berenice, Susana) for all Austin properties. This might be because the Manual de Personal section in Notion has ambiguous language that the model interprets differently than intended. Needs further investigation in Task 4+.

### DB Update Pattern (15KB execution_steps)
- Use Node.js to write dollar-quoted SQL to a temp file: `$$<content>$$`
- Apply via: `PGPASSWORD=postgres psql ... -f /tmp/update-steps.sql`
- Verify with: `SELECT execution_steps FROM archetypes WHERE id='...' | grep -c "new text"`
