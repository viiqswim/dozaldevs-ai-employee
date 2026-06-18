# Execution Steps Inspection — iter-11 (cleaning-schedule-v13)

Generated via converse-create with richer description (3 turns: initial description + 2 clarifying Q&A).

## Key Rules Present in Generated Steps

### ✅ Diana Exclusive (Step 6)

"Diana is exclusively assigned to 271 Gina Dr (ZIP 78640) every single day, all units, no exceptions. Override the extracted table for this property: always assign Diana, regardless of the lookup table."

### ✅ Yessica 240min Saturday Cap (Step 8)

"Override for ZIP 78744: If targetDay is Sunday, assign Berenice instead of Yessica (Yessica does not work Sundays). For Saturday, apply the capacity rule: total cleaning time for 78744 checkouts = sum of times from hardcoded list (...). If total ≤ 240 min, assign all to Yessica. If total > 240, assign properties in alphabetical order to Yessica until her capacity is reached; the remaining properties go to Berenice."

### ✅ Berenice as Overflow (Step 8)

Berenice is the explicit backup for Saturday overflow AND Sunday.

### ✅ Hardcoded Cleaning Times (Step 9)

"271 Gina Dr Hab 4: 25 min; 407 S Gevers St Loft: 60 min; 219 Paul St Casa: 90 min; 7213 Nutria Run Hab 1: 30 min, Hab 3: 30 min, Hab 5: 30 min; 3420 Hovenweep Ave Casa: 100 min; 4403 Hayride Ln Unidad A: 90 min, Unidad B: 90 min, Unidad S: 90 min; 5306 King Charles Dr Unidad A: 60 min. For any property not in this list, use a default of 60 min."

### ✅ Hardcoded Trash Calendar (Step 10)

"407 S Gevers St (Loft): Wednesday; 219 Paul St (Casa): Wednesday; 271 Gina Dr (Hab 4): Monday; 7213 Nutria Run (Hab 1,3,5): Wednesday; 3420 Hovenweep Ave (Casa): Wednesday; 4403 Hayride Ln (Unidad A,B,S): Wednesday; 5306 King Charles Dr (Unidad A): Wednesday."

### ✅ SIN ASIGNAR (Step 7)

"If the ZIP code is not found in the table, mark the property as 'SIN ASIGNAR (ZIP no cubierto)'."

### ✅ Spanish Output (Step 12)

"Compile the output in Spanish."

## Concerns / Risks

### ⚠️ Alphabetical Order for Saturday Overflow (Step 8)

The step says "assign properties in alphabetical order to Yessica until her capacity is reached; the remaining properties go to Berenice." This is ambiguous:

- Interpretation A (stop on first overflow): alphabetical, first property that pushes over 240 → stop, all remaining go to Berenice
- Interpretation B (greedy fill): alphabetical, skip any that would overflow, continue to next

The oracle expects Interpretation B behavior in practice.

### ⚠️ Missing Composio in Original Tool Registry

The proposal's tool_registry only had [hostfully, slack, submit-output]. Added `/tools/composio/execute.ts` during DB update since step 5 requires Composio for Notion access.

### ⚠️ Trash Calendar Data Accuracy

The trash calendar provided in the conversation was based on information from the task prompt, which may differ from the actual ground truth. The oracle uses real Hostfully/Google Calendar data. The hardcoded calendar may have incorrect collection days for some properties.

### ⚠️ Only Hab 4 Hardcoded for 271 Gina Dr

The hardcoded times only list "271 Gina Dr Hab 4: 25 min". Other units (Hab 2, Hab 3, etc.) fall to the 60-min default. Oracle may expect 25 min for all habitaciones.
