# Execution Steps Inspection — cleaning-schedule-v15

## Checklist

1. ✅ Diana exclusive with per-unit 25min (NOT total 75min)
   - Step 6: "Calculate total cleaning time: number_of_checked_out_units × 25 min"
   - Step 4: "271 Gina Dr (ZIP 78640): each checked-out habitación = 25 min"

2. ✅ Yessica 240min Saturday cap with property-address grouping
   - Step 7: Full Saturday logic with group-by-address, sort ascending, assign until limit

3. ✅ Cleaning times hardcoded table
   - Step 4: Full table with Nutria Hab1=25, Hab5=40, Hayride=90, Loft=60, Hovenweep=100

4. ✅ Trash calendar hardcoded
   - Step 10: Full trash schedule with all properties

5. ✅ SIN ASIGNAR for uncovered ZIPs
   - Step 5: "Any other ZIP → SIN ASIGNAR (unassigned)"

6. ✅ Spanish output
   - Step 11: "Compile the final schedule in Spanish"

7. ✅ Tie-breaking rule
   - Step 7: "If two groups have the same total time, sort by number of units descending (prefer the group with more units)"

8. ⚠️ No Composio/Notion lookup — step 5 says "DO NOT use any other source"
   - This is BETTER — removes dependency on Notion for coverage table
   - tool_registry does NOT include composio (correct)

## Key Improvement vs v14

- v14 had "calculate total cleaning time as (number of bedrooms or units) × 30 minutes" — caused wrong times
- v15 has full hardcoded time table — no default multiplication
- v14 had "total cleaning time 75 minutes" for Diana — caused wrong total
- v15 has "each checked-out habitación = 25 min" — correct per-unit
