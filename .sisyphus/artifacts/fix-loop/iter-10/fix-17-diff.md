# Fix 17 — Changes Applied to archetype-generator-prompts.ts

## Summary

Added a `## Notion Data Extraction Pattern (MANDATORY for runtime Notion lookups)` section to `SYSTEM_PROMPT_PRE` and a compact `**NOTION DATA EXTRACTION PATTERN**` block to `buildConverseSystemPromptPre()`.

## Changes

### 1. `SYSTEM_PROMPT_PRE` (static string)

Added after the Concrete Execution Steps Example patterns list, before `## Code-Writing Employees`:

```
## Notion Data Extraction Pattern (MANDATORY for runtime Notion lookups)

When the employee description mentions reading reference data from Notion at runtime:
1. Extract a lookup table first (with explicit column names)
2. Use ONLY the extracted table
3. Explicit UNASSIGNED handling
4. Separate data sources by purpose
5. Recurring task calendar from Notion — extract and apply to ALL properties
FORBIDDEN: vague "look up in Notion" instructions
```

### 2. `buildConverseSystemPromptPre()` (dynamic function)

Added compact version after the CONCRETE EXECUTION STEPS PATTERN block.

## Result

The generated execution_steps from converse-create now include:

- ✅ `printenv INPUT_TARGET_DATE` — correctly reads from env var
- ✅ Deterministic day-of-week calculation
- ✅ Explicit Notion extraction with column names (steps 4, 5, 6)
- ✅ "ONLY authoritative source" declaration
- ✅ Explicit UNASSIGNED handling for uncovered ZIPs
- ✅ Trash reminders for ALL properties in zone (step 8)
- ✅ Spanish output (step 9)
- ❌ Diana exclusive assignment not encoded (Notion lookup doesn't distinguish exclusive vs backup)
- ❌ Saturday capacity limits not encoded (Yessica 240min cap)
- ❌ Berenice backup role not encoded
- ❌ Trash calendar logic incomplete (wrong day logic for Monday)

## Iter-10 Verdict

| Date       | Verdict   | Key improvements                             | Remaining failures                                          |
| ---------- | --------- | -------------------------------------------- | ----------------------------------------------------------- |
| 2026-06-20 | INCORRECT | SIN ASIGNAR ✅, Spanish ✅, Zenaida ✅       | Diana missing, Yessica overloaded, no Berenice, trash wrong |
| 2026-06-15 | INCORRECT | SIN ASIGNAR ✅, Spanish ✅, partial trash ✅ | Diana missing, Zenaida trash missing                        |
| 2026-06-22 | INCORRECT | SIN ASIGNAR ✅, Spanish ✅, partial trash ✅ | Trash incomplete, missing Yessica overhead                  |

## Progress vs Iter-9

| Criterion                       | Iter-9 | Iter-10    |
| ------------------------------- | ------ | ---------- |
| SIN ASIGNAR (78722/78724/78741) | ❌     | ✅         |
| Spanish output                  | ❌     | ✅         |
| Trash duties present            | ❌     | Partial ✅ |
| Diana exclusive                 | ❌     | ❌         |
| Saturday capacity               | ❌     | ❌         |
| Berenice backup                 | ❌     | ❌         |
