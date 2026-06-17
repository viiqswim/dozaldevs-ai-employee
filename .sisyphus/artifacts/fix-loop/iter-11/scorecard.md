# Scorecard — Iter-11 (cleaning-schedule-v13)

## Archetype

- ID: `da47c68c-8295-4c80-af2e-d1f0bd3807a8`
- Model: `deepseek/deepseek-v4-flash`
- vm_size: `performance-1x`
- Created via: converse-create (3 turns)

## Fix 18 Applied

Added "EXPLICIT BUSINESS RULES ENCODING (MANDATORY)" section to archetype-generator-prompts.ts instructing the LLM to hardcode business rules from description (exclusive assignments, capacity limits, backup rules) directly into execution_steps.

## Task Results

| Date       | Task ID    | Status |
| ---------- | ---------- | ------ |
| 2026-06-20 | `45794be9` | Done   |
| 2026-06-15 | `5ee59b4b` | Done   |
| 2026-06-22 | `6f4550ea` | Done   |

## Correctness Scorecard

| Check                            | 2026-06-20 (Sat)         | 2026-06-15 (Mon)  | 2026-06-22 (Mon)  |
| -------------------------------- | ------------------------ | ----------------- | ----------------- |
| Diana exclusively at 271 Gina Dr | ✅                       | ✅                | N/A (no checkout) |
| Yessica Saturday cap ≤ 240min    | ✅ (190min)              | N/A               | N/A               |
| Berenice as Saturday overflow    | ❌ WRONG units           | N/A               | N/A               |
| Yessica on Monday (not Berenice) | N/A                      | ✅                | ✅ (trash only)   |
| SIN ASIGNAR for uncovered ZIPs   | ✅ (78724)               | ✅ (78722)        | ✅ (78741)        |
| Spanish output                   | ✅                       | ✅                | ✅                |
| Trash reminders correct          | ✅ (Saturday)            | ✅ (none correct) | ❌ (missing)      |
| Day of week correct              | ✅                       | ✅                | ✅                |
| No hallucinated properties       | ✅                       | ✅                | ✅                |
| All checkouts included           | ❌ (Nutria Hab1 missing) | ✅                | ✅                |

## Summary

**What improved vs iter-10 (v12):**

- Diana exclusive assignment now works consistently ✅
- SIN ASIGNAR correctly applied for all 3 dates ✅
- Spanish output consistent ✅

**What still fails:**

### 2026-06-20 (Saturday) — Critical Failures:

1. **7213 Nutria Run Hab 1 MISSING**: One checkout dropped entirely
2. **Wrong Saturday distribution**:
   - Deliverable: Yessica=Hovenweep+Hayride A, Berenice=Hayride B+S+Nutria 3+5
   - Oracle: Yessica=Hovenweep+Nutria 1+3+5, Berenice=Hayride A+B+S
   - Root cause: "alphabetical order" rule gives different grouping than expected

### 2026-06-22 (Monday) — Data Issues:

1. **Missing trash reminders**: Hardcoded calendar from conversation was incorrect (wrong collection days for Hovenweep, S Gevers, Paul St). LLM correctly applied the wrong data.
2. **Missing properties in calendar**: 3401 Breckenridge, 3412 Sand Dunes, Heron Flats, Chestnut Cedar not in hardcoded list
3. **6002 Palm Circle time**: 60 min default vs oracle's 180 min (Casa type)

### 2026-06-15 (Monday) — Minor Issues Only:

- Cleaning times for non-listed units (60 min default vs 25 min per oracle for habitaciones)

## Root Cause Categories

1. **Logic bug** (Fix 18b needed): Saturday overflow alphabetical order → wrong unit grouping, dropped Nutria Hab 1
2. **Data quality** (conversation data was wrong): Trash calendar collection days don't match real oracle
3. **Data gap**: Only Hab 4 hardcoded for 271 Gina Dr; all other units fall to 60-min default

## Next Fix Direction

**Fix 18b**: Change step 8's Saturday overflow rule from "alphabetical order" to "property-address grouping":

- Keep all units of the SAME address together (don't split Hayride A from Hayride B+S)
- Assign by address groups: calculate group total, assign entire group to Yessica or Berenice
- Correct order: Hovenweep (100) → Yessica, Nutria Run (90) → Yessica (190 total ≤ 240), Hayride (270) → Berenice

**Fix 18c**: Improve the trash calendar data OR switch from hardcoded to Notion/database-sourced calendar

**Fix 18d**: Generalize Gina Dr times: "all habitaciones at 271 Gina Dr are 25 min regardless of unit number"
