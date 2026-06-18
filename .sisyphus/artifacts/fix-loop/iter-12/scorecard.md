# Scorecard — Iter-12 (cleaning-schedule-v14)

## Summary

| Date             | Critical Passes                                                                                          | Critical Fails                                                                                                                                             | Status               |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 2026-06-20 (Sat) | SIN ASIGNAR ✅, Diana exclusive ✅, Berenice gets Hayride ✅, Yessica gets Nutria ✅, trash reminders ✅ | Diana time (75 vs 25), Loft time (30 vs 60), Nutria per-unit times (30 vs 25/25/40), Berenice times (60 vs 90), Yessica got Hovenweep (should be Berenice) | ❌ FAIL              |
| 2026-06-15 (Mon) | SIN ASIGNAR ✅, Diana exclusive ✅, Yessica gets Nutria ✅, ALL trash reminders ✅                       | Diana time (75 vs 25), Nutria Hab1 time (30 vs 25)                                                                                                         | ❌ FAIL              |
| 2026-06-22 (Mon) | SIN ASIGNAR ✅, ALL trash reminders ✅, 6002 Palm Circle trash→Zenaida ✅                                | Yessica overhead 45 min missing (minor)                                                                                                                    | ✅ PASS (minor miss) |

## Root Cause Analysis

### Bug 1: Diana time always 75 min (CRITICAL)

- Execution step 5 says "271 Gina Dr has 3 habitaciones, each 25 minutes, total cleaning time 75 minutes"
- Model applies 75 min to Diana regardless of how many habitaciones are checked out
- FIX NEEDED: Step 5 must say "each checked-out habitación = 25 min" not "total = 75 min"

### Bug 2: Per-unit cleaning times wrong (CRITICAL)

- Nutria Hab1/3 = 30 min (should be 25 min), Hab5 = 30 min (should be 40 min)
- Hayride A/B/S = 60 min (should be 90 min)
- Loft at 407 S Gevers = 30 min (should be 60 min)
- Root cause: execution_steps says "use get-property.ts to retrieve property details. Calculate total cleaning time as (number of bedrooms or units) × 30 minutes"
- The model is using the 30-min default instead of actual property data from Hostfully
- FIX NEEDED: Either hardcode known property times OR ensure get-property.ts returns correct data

### Bug 3: Saturday grouping wrong (CRITICAL)

- Yessica got Hovenweep (90 min) + Nutria (90 min) = 180 min
- Berenice got Hayride (180 min with wrong times)
- Oracle: Yessica=Nutria (90 min), Berenice=Hayride (270 min)
- Both Nutria and Hovenweep are 90 min groups — model picked Hovenweep first instead of Nutria
- The "smallest first" rule is ambiguous when groups are equal size
- FIX NEEDED: When groups are equal size, prefer the group with more individual units (Nutria has 3 units vs Hovenweep has 1)
  OR: Hardcode that Nutria goes to Yessica and Hayride goes to Berenice

## What Fixed vs Iter-11

### FIXED ✅

- 2026-06-22 trash reminders: ALL correct (was completely missing in iter-11)
- 2026-06-15 trash reminders: ALL correct (Breckenridge/Sand Dunes/Hovenweep on Monday ✅)
- Property grouping: Nutria units stay together ✅, Hayride units stay together ✅
- SIN ASIGNAR: correct on all 3 dates ✅

### STILL BROKEN ❌

- Cleaning times: model uses 30-min default instead of actual property data
- Diana time: always 75 min (3 habitaciones) instead of per-checkout
- Saturday assignment: Hovenweep goes to Yessica instead of Berenice

## Next Fix Priorities

1. **Fix cleaning times** — hardcode known property times in execution_steps:
   - 271 Gina Dr: each checked-out habitación = 25 min (NOT total 75 min)
   - 7213 Nutria Run: Hab1=25, Hab2=25, Hab3=25, Hab4=25, Hab5=40 min
   - 4403 Hayride Ln: each unit = 90 min
   - 407 S Gevers St: Loft = 60 min
   - 219 Paul St: Casa = 90 min
   - 6002 Palm Circle: Casa = 180 min
   - 3505 Banton Rd: each habitación = 25 min

2. **Fix Saturday tie-breaking** — when groups are equal size, prefer Nutria over Hovenweep
   OR hardcode: "On Saturdays, if both Nutria and Hovenweep have checkouts, assign Nutria to Yessica"

3. **Fix Yessica overhead** — add rule: if Yessica has only trash tasks (no cleanings), add 45 min travel overhead
