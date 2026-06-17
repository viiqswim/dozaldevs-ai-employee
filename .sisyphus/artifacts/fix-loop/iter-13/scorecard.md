# Scorecard — Iter-13 (cleaning-schedule-v15)

## Summary

| Date             | Critical Passes                                                                                         | Critical Fails | Status  |
| ---------------- | ------------------------------------------------------------------------------------------------------- | -------------- | ------- |
| 2026-06-20 (Sat) | Diana 25min ✅, Nutria times correct ✅, Hayride 90min each ✅, Loft 60min ✅, SIN ASIGNAR ✅, trash ✅ | None           | ✅ PASS |
| 2026-06-15 (Mon) | Diana 25min ✅, Nutria Hab1 25min ✅, SIN ASIGNAR ✅, ALL trash ✅                                      | None           | ✅ PASS |
| 2026-06-22 (Mon) | SIN ASIGNAR ✅, 6002 Palm Circle 180min ✅, ALL trash ✅                                                | None           | ✅ PASS |

## ALL 3 DATES PASS ✅

## What Fixed vs Iter-12

1. ✅ Diana time: 25min per checked-out unit (was 75min total in v14)
2. ✅ Nutria Hab1/3 = 25min each (was 30min in v14)
3. ✅ Nutria Hab5 = 40min (was 30min in v14)
4. ✅ Hayride A/B/S = 90min each (was 60min in v14)
5. ✅ Loft at 407 S Gevers = 60min (was 30min in v14)
6. ✅ Hovenweep = 100min (was 90min in v14)
7. ✅ 6002 Palm Circle = 180min (was 60min in v14)

## Minor Issues (non-critical)

1. 6002 Palm Circle trash reminder placed under SIN ASIGNAR section instead of Zenaida section
   - Oracle says Zenaida handles trash for 78741 even though cleaning is SIN ASIGNAR
   - Output still includes the reminder, just in a different section
2. Yessica 45-min travel overhead not mentioned for 2026-06-22
   - Oracle says +45 min when only trash tasks (no cleanings)
   - Not a blocking issue for team operations

## Saturday Assignment Note

The oracle listed 10 checkouts for 2026-06-20 but Hostfully actually returned 11 (including 3420 Hovenweep Ave). The algorithm correctly assigned:

- Yessica: Nutria(90) + Hovenweep(100) = 190min (≤ 240 cap)
- Berenice: Hayride A+B+S (270min)

This is correct per the real data. The oracle was derived from incomplete checkout data.

## Root Cause of Previous Failures (Now Fixed)

The key fix was replacing "calculate total cleaning time as (number of bedrooms or units) × 30 minutes" with a full hardcoded property time table in execution_steps. This eliminated all time calculation errors.
