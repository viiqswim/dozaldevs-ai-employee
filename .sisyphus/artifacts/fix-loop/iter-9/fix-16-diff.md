# Fix 16 — Changes Applied to archetype-generator-prompts.ts

## Summary

Added a concrete, generic example of explicit execution_steps to the generator prompt to guide the LLM toward deterministic, hardcoded reference-data patterns.

## Changes

### 1. `SYSTEM_PROMPT_PRE` (static string)

Added a new section `## Concrete Execution Steps Example` after `## Reference-Data Employee Step Template` and before `## Code-Writing Employees`.

The example uses a warehouse/inventory domain (not cleaning-specific) showing:

- Reading input from `printenv INPUT_TARGET_DATE`
- Deterministic day-of-week calculation via `node -e "...process.env.INPUT_TARGET_DATE..."`
- Hardcoded lookup table for zone assignments
- Explicit SIN ASIGNAR / UNASSIGNED handling
- Hardcoded calendar for recurring tasks
- Exclusion rules for specific properties

### 2. `buildConverseSystemPromptPre()` (dynamic function)

Added a compact `**CONCRETE EXECUTION STEPS PATTERN**` block in `createGenerationRules`, after the REFERENCE-DATA STEP TEMPLATE.

## Result

The generated execution_steps from converse-create now include:

- ✅ `printenv INPUT_TARGET_DATE` — correctly reads from env var
- ✅ Deterministic day-of-week calculation
- ❌ Still reads zone assignments from Notion (not hardcoded lookup table)
- ❌ No explicit SIN ASIGNAR handling for unassigned ZIPs
- ❌ No hardcoded trash/recurring task calendar
- ❌ No Colorado exclusion
- ❌ Output in English (not Spanish)

## Conclusion

Fix 16 was a PARTIAL improvement. The generator learned patterns 1 and 2 (env var reading, day-of-week) but NOT the critical patterns (hardcoded coverage table, SIN ASIGNAR logic, trash calendar, language). The root cause is that the generator still relies on Notion for zone assignments rather than hardcoding them.

## Iter-9 Verdict

All 3 pinned dates: **INCORRECT**

Common failures across all dates:

1. Unassigned ZIPs (78722, 78724, 78741) assigned to cleaners instead of SIN ASIGNAR
2. No trash duties in any output
3. Output in English instead of Spanish
4. Wrong cleaner assignments (Yessica gets wrong properties on 2026-06-20)
