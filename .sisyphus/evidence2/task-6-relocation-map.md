# Task 6: Relocation Map

> READ-ONLY analysis — no source files modified

---

## Section A: /tmp Decoupling Verdict

### Does delivery read /tmp?

**PARTIAL — for confirmation only, NOT for deliverable content.**

- `delivery-phase.mts` line 217: reads `SUMMARY_PATH` (`/tmp/summary.txt`) **after** the delivery OpenCode session completes, to confirm the delivery agent wrote its confirmation. This is a post-delivery validation check, NOT the source of deliverable content.
- `delivery-phase.mts` does NOT import `DRAFT_PATH` or `APPROVAL_MESSAGE_PATH`. Only `SUMMARY_PATH` is imported.

### Where does delivery get content?

**From the `deliverables` DB table — fully decoupled from /tmp.**

```typescript
// delivery-phase.mts lines 52-69
const deliverableRows = await db.get(
  'deliverables',
  `external_ref=eq.${taskId}&select=*&order=created_at.desc&limit=1`,
);
const deliverable = deliverableRows?.[0];
const deliverableContent = (deliverable.content as string) ?? '';
```

The content is then injected into the delivery prompt:

```typescript
// delivery-phase.mts lines 94-97
const deliveryPrompt = assembleTaskPrompt({
  instructions: `Follow the instructions in <delivery-instructions> within the AGENTS.md file\n\n<approved-content>\n${deliverableContent}\n</approved-content>`,
  taskId,
});
```

### Is `/tmp/delivery-draft.txt` delivery-critical?

**NO.** It is a WORKING FILE convention within the delivery OpenCode session. Flow:

1. Platform injects `deliverables.content` into delivery prompt as `<approved-content>` XML
2. Delivery OpenCode session parses `<approved-content>`, writes content to `/tmp/delivery-draft.txt` (a session-local temp file)
3. Delivery session reads `/tmp/delivery-draft.txt` to pass to `post-message.ts --text-file`
4. Delivery session calls `submit-output.ts`, which writes `/tmp/summary.txt`
5. Platform reads `/tmp/summary.txt` to confirm delivery complete

Step 2–3 use `/tmp/delivery-draft.txt` entirely within the delivery container's session. The platform harness never reads it — only the delivery OpenCode session does.

### Risk of stopping the generator from teaching `/tmp/delivery-draft.txt`

**LOW.** The platform doesn't depend on this file path. Employees could write to any `/tmp/` path. However, some standard path must be documented somewhere so delivery employees know the convention. If removed from generator → must be RELOCATE-to-skill (Execution→Delivery Handoff section in tool-usage-reference or a new delivery context section in the compiler).

### What is `DRAFT_PATH = '/tmp/draft.txt'` in output-contract-constants.ts?

**Execution scratch path only.** Used by the execution container's OpenCode session to hold draft content before calling `submit-output.ts --draft-file /tmp/draft.txt`. The delivery platform harness does NOT read `DRAFT_PATH`. It is World-A source of truth for the execution phase's working file path. World-B consumers see it via the generated copy at `src/worker-tools/lib/output-contract-paths.generated.ts`.

---

## Section B: Compiler Injection Map

### Current injection order in `compileAgentsMd()` (`src/workers/lib/agents-md-compiler.mts`)

| Position | Section                                                                                 | Condition                              | Source                            |
| -------- | --------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| 1        | `identity`                                                                              | Always                                 | `input.identity`                  |
| 2        | `CRITICAL_DIRECTIVE` ("MUST use bash tool...")                                          | Always                                 | Hardcoded constant                |
| 3        | `<execution-instructions>` wrapper (EXEC_IMPORTANT + executionSteps + STOP_DIRECTIVE)   | Always                                 | `input.executionSteps`            |
| 4        | `<delivery-instructions>` wrapper (DELIVERY_IMPORTANT + deliverySteps + STOP_DIRECTIVE) | Always                                 | `input.deliverySteps`             |
| 5        | `## Connected Apps (via Composio)`                                                      | Only if `connectedToolkits.length > 0` | Built from tenant DB              |
| 6        | `## Custom Integrations`                                                                | Only if `connectedServices.length > 0` | Built from tenant DB              |
| 7        | `## Behavioral Rules (Learned)`                                                         | Only if `employeeRules` non-empty      | Learned rules from DB             |
| 8        | `## Knowledge Base`                                                                     | Only if `employeeKnowledge` non-empty  | KB entries from DB                |
| 9        | `## Platform Rules`                                                                     | Always (LOWEST priority)               | `agents.md` file (thin: 16 lines) |

### Position 9 (base agents.md) — confirmed thin

`src/workers/config/agents.md` is 16 lines: 4 bullet-point rules + a "Discovering Composio Actions" section. Load-bearing mechanics MUST NOT go there.

### Best insertion point for date-handling mechanic

**Between position 2 (CRITICAL_DIRECTIVE) and position 3 (execution-instructions).**

Rationale:

- Appears before execution_steps, so the employee reads it first
- Outranks position-9 base agents.md (which is lowest priority)
- Applies specifically to date-parameterized employees — conditional injection based on whether `input_schema` contains a date-type item or `executionSteps` references `INPUT_TARGET_DATE`

### Exact function/method to add

`compileAgentsMd()` in `src/workers/lib/agents-md-compiler.mts` lines 230–297. Add after the `parts.push(CRITICAL_DIRECTIVE)` call (line 234) and before the `<execution-instructions>` push (line 236):

```typescript
// NEW: inject date-parameterization rules when archetype is date-driven
if (isDateParameterized(input)) {
  parts.push(DATE_PARAMETERIZATION_RULES);
}
```

Where `isDateParameterized(input)` checks `input.executionSteps.includes('INPUT_TARGET_DATE')` or a dedicated `input.isDateParameterized` field.

---

## Section C: Generator Teaching Inventory

### Key: Exact locations reference both prompt paths

| Path                             | Symbol                                                        | Lines   |
| -------------------------------- | ------------------------------------------------------------- | ------- |
| `SYSTEM_PROMPT_PRE`              | `src/gateway/services/prompts/archetype-generator-prompts.ts` | 70–443  |
| `buildConverseSystemPromptPre()` | Same file                                                     | 535–676 |
| `REFINE_SYSTEM_PROMPT_PRE`       | Same file                                                     | 505–527 |

---

### `submit-output` CLI teaching

**Classification: DELETE from generator prose sections; ALREADY EXISTS in tool-usage-reference skill.**

**Evidence that it's already in skill:** `tool-usage-reference/SKILL.md` lines 223–236 (auto-generated section: `platform/submit-output` with all flags including `--draft-file`) + lines 1053–1103 (hand-written extended section with worked examples).

**Locations in generator to DELETE/replace with intent-level language:**

| Location                                    | Line(s) | Content to remove                                                                                                                                           |
| ------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `SYSTEM_PROMPT_PRE` code-writing section    | 383     | `tsx /tools/platform/submit-output.ts --summary "Created PR: <url>" --classification "NEEDS_APPROVAL" --draft "PR created: <url>"`                          |
| `SYSTEM_PROMPT_PRE` approval flow           | 414     | References to `${APPROVAL_MESSAGE_PATH}` and `${SUMMARY_PATH}` via import (but these are imported constants — keep the import)                              |
| `SYSTEM_PROMPT_PRE` metadata pattern        | 421     | `tsx /tools/platform/submit-output.ts ... --metadata '{"key": "value", ...}'`                                                                               |
| `SYSTEM_PROMPT_POST` delivery_steps example | 454     | `tsx /tools/platform/submit-output.ts --summary "Delivered successfully" --classification NO_ACTION_NEEDED`                                                 |
| `REFINE_SYSTEM_PROMPT_PRE`                  | 513     | `tsx /tools/platform/submit-output.ts --summary "..." --classification "NEEDS_APPROVAL                                                                      | NO_ACTION_NEEDED"` |
| `buildConverseSystemPromptPre`              | 655     | `ends with a submit-output FINAL STEP using the exact phrase: "Finally, submit your completed summary..."` (KEEP the intent phrase, DELETE the CLI example) |

**Exception:** The code-writing employee template (lines 374–383) deliberately teaches explicit CLI because that section is intentionally low-level. Evaluate separately.

---

### `<approved-content>` XML teaching

**Classification: RELOCATE-to-compiler — inject an `approved-content` context note into the `<delivery-instructions>` wrapper.**

The delivery container MUST know about `<approved-content>` because it's injected into the delivery PROMPT by `delivery-phase.mts` (line 95). This is a platform contract, not employee-specific knowledge. The right home is the compiler's delivery-instructions wrapper.

**Current generator locations:**

| Location                                | Line(s) | Content                                                                                                                               |
| --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SYSTEM_PROMPT_PRE` delivery_steps rule | 82      | `"The approved content is in the prompt within the \`<approved-content>\` XML block as JSON. Use the bash tool to parse the JSON..."` |
| `SYSTEM_PROMPT_PRE` annotated contrast  | 94–95   | `delivery_steps: "1. Parse the approved content from \`<approved-content>\`..."`                                                      |
| `SYSTEM_PROMPT_PRE` Template A          | 431–432 | Template A step 1: parse `<approved-content>` JSON, extract `draft` field                                                             |
| `SYSTEM_PROMPT_PRE` Template B          | 438     | Template B step 1: parse JSON, extract `draft` and `metadata` fields                                                                  |
| `buildConverseSystemPromptPre`          | 633     | `Parse the approved content from the <approved-content> XML block and write the draft field to /tmp/delivery-draft.txt.`              |

**Target location in compiler:** Modify the `<delivery-instructions>` wrapper at `agents-md-compiler.mts` lines 248–258 to prepend an `APPROVED_CONTENT_CONTEXT` note explaining that `<approved-content>` JSON is in the initial delivery prompt and how to parse it.

---

### `/tmp/delivery-draft.txt` teaching

**Classification: RELOCATE-to-skill — add to `tool-usage-reference/SKILL.md` Execution→Delivery Handoff section (hand-written section, lines 397–408).**

The specific path `/tmp/delivery-draft.txt` is a DELIVERY SESSION convention. It belongs in the tool-usage-reference skill alongside the existing Execution→Delivery Handoff section (lines 397–408).

**Current generator locations:**

| Location                                | Line(s) | Content                                                                                                  |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `SYSTEM_PROMPT_PRE` delivery_steps rule | 82      | `write it to \`/tmp/delivery-draft.txt\``                                                                |
| `SYSTEM_PROMPT_PRE` delivery_steps rule | 82      | `tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text-file /tmp/delivery-draft.txt` |
| `SYSTEM_PROMPT_PRE` Template A          | 431     | `write it to /tmp/delivery-draft.txt`                                                                    |
| `SYSTEM_PROMPT_PRE` Template A          | 432     | `tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text-file /tmp/delivery-draft.txt` |
| `buildConverseSystemPromptPre`          | 633–634 | `write the draft field to /tmp/delivery-draft.txt`                                                       |

**Target location in skill:** Add a "Delivery Session Pattern" subsection under the existing "Execution→Delivery Handoff" section (`SKILL.md` lines 397–408).

---

### `printenv INPUT_TARGET_DATE` teaching

**Classification: RELOCATE-to-compiler — inject a `## Date Parameterization` section at position 2.5 (between CRITICAL_DIRECTIVE and execution-instructions) when the archetype is date-parameterized.**

**Current generator locations:**

| Location                                               | Line(s) | Content                                                                          |
| ------------------------------------------------------ | ------- | -------------------------------------------------------------------------------- |
| `SYSTEM_PROMPT_PRE` DATE/PERIOD RULE                   | 122–125 | Rule text: MUST read `printenv INPUT_TARGET_DATE` as step 1                      |
| `SYSTEM_PROMPT_PRE` Concrete Example                   | 241–244 | Example step 1: `1. Read the target date by running: printenv INPUT_TARGET_DATE` |
| `SYSTEM_PROMPT_PRE` 10-point list item 1               | 317     | `Step 1 MUST be \`printenv INPUT_TARGET_DATE\``                                  |
| `buildConverseSystemPromptPre` DATE/PERIOD RULE        | 560–563 | Repeat of same rule                                                              |
| `buildConverseSystemPromptPre` CONCRETE PATTERN item 1 | 599     | `Step 1 reads \`printenv INPUT_TARGET_DATE\``                                    |

**Target location in compiler:** New constant `DATE_PARAMETERIZATION_RULES` injected by `compileAgentsMd()` at position 2.5 when the archetype uses date inputs.

---

### `node -e "...getUTCDay()..."` day-of-week derivation

**Classification: RELOCATE-to-compiler — same new section as `printenv INPUT_TARGET_DATE` above.**

**Current generator locations:**

| Location                                               | Line(s) | Content                                                                       |
| ------------------------------------------------------ | ------- | ----------------------------------------------------------------------------- |
| `SYSTEM_PROMPT_PRE` Concrete Example                   | 246–249 | Full `node -e` command in example step 2                                      |
| `SYSTEM_PROMPT_PRE` 10-point list item 2               | 318     | `Use the exact \`node -e "const d=new Date(...+'T12:00:00Z'); ..."\` command` |
| `buildConverseSystemPromptPre` CONCRETE PATTERN item 2 | 599–600 | Same `node -e` command                                                        |

**Target location in compiler:** Same `DATE_PARAMETERIZATION_RULES` section as above.

---

### `/tools/slack/post-message.ts` CLI teaching in generator

**Classification: DELETE from generator — already comprehensively documented in tool-usage-reference skill.**

**Evidence it's in skill:** `SKILL.md` lines 368–380 (auto-generated section) + lines 456–496 (hand-written extended section with full flag docs, output shape, worked example).

**Current generator locations:**

| Location                                | Line(s) | Content                                                                                                  |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `SYSTEM_PROMPT_PRE` delivery_steps rule | 82      | `tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text-file /tmp/delivery-draft.txt` |
| `SYSTEM_PROMPT_PRE` Template A          | 432     | Same CLI invocation                                                                                      |

**Note:** The `--text-file` flag is NOT documented in the auto-generated section of the skill (the descriptor shows `--text` as required). This is a gap — see Section D.

---

### "Concrete Execution Steps Example" (hardcoding driver)

**Classification: DELETE — this example drives hardcoding of zone tables and calendars into execution_steps, which contradicts the Notion Data Extraction Pattern.**

**Location:** `SYSTEM_PROMPT_PRE` lines 232–313 (the entire "Concrete Execution Steps Example" section with the warehouse inventory example).

**Specific items to DELETE from the 10-point list (lines 314–341):**

| Item   | Line(s) | Reason to DELETE                                                                                                                                                                             |
| ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item 4 | 321     | "**Hardcode coverage/zone table IN execution_steps**: Do NOT say 'look up zone in Notion.'" — this is the primary hardcoding driver, directly contradicts the Notion Data Extraction Pattern |
| Item 7 | 322–324 | "**Hardcode recurring task calendar IN execution_steps**: Do NOT say 'read the restock/trash calendar from Notion.'" — same contradiction                                                    |

**Items to KEEP from 10-point list (items 1, 2, 3, 5, 6, 8, 9, 10):**

- Item 1 (`printenv INPUT_TARGET_DATE`) → RELOCATE-to-compiler
- Item 2 (`node -e getUTCDay`) → RELOCATE-to-compiler
- Items 3, 5, 6, 8, 9 → legitimate guidance about UNASSIGNED, roles, zone-wide tasks — KEEP if refactored
- Item 10 (output language from identity) → KEEP

**Also DELETE in `buildConverseSystemPromptPre`:**

- Lines 598–626 (CONCRETE EXECUTION STEPS PATTERN items 4 and 7 specifically):
  - Item 4 (line 602): "**Hardcode coverage table IN the steps**: Do NOT say 'look up zone in Notion.'"
  - Item 7 (line 605): "**Hardcode recurring task calendar IN the steps**: Do NOT read it from Notion."

---

### "Notion Data Extraction Pattern" (correct live-fetch pattern)

**Classification: KEEP — but make UNCONDITIONAL and PRIMARY (not gated on "mentions Notion as data source").**

**Current status:** Conditional — only triggered when "the employee description mentions reading reference data from Notion at runtime". Items 4 & 7 of the 10-point list CONTRADICT this pattern by explicitly saying to hardcode the data instead.

**Locations:**

- `SYSTEM_PROMPT_PRE` lines 343–363: `## Notion Data Extraction Pattern (MANDATORY for runtime Notion lookups)`
- `buildConverseSystemPromptPre` lines 611–617: `NOTION DATA EXTRACTION PATTERN (MANDATORY when description mentions Notion as a data source)`

**Required changes (not modifications to source, just noting for Tasks 8/9):**

1. Make this the DEFAULT reference-data pattern — remove the "when description mentions Notion" conditionality
2. Generalize from "Notion" to "any runtime reference data source" (Notion, Google Sheets, Airtable, etc.)
3. DELETE contradicting items 4 & 7 from the 10-point list (see above)
4. Make this the UNCONDITIONAL pattern used whenever reference data is involved

---

## Section D: tool-usage-reference Gaps

### What's already in `src/workers/skills/tool-usage-reference/SKILL.md`

| Feature                                 | Section                                                     | Notes                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `submit-output` CLI with `--draft-file` | Auto-generated lines 223–236 + hand-written lines 1053–1103 | Comprehensive — all flags, worked examples                                                                               |
| `slack/post-message.ts` CLI             | Auto-generated lines 368–380 + hand-written lines 456–496   | Comprehensive — all flags, auto-thread behavior, output shape                                                            |
| Execution→Delivery Handoff explanation  | Hand-written lines 397–408                                  | Good but uses confusing example `/tmp/summary.txt` as a draft file path (line 403 — conflicts with output contract path) |
| All other tools                         | Auto-generated + hand-written sections                      | Complete                                                                                                                 |

### What needs to be ADDED to `tool-usage-reference/SKILL.md`

1. **`--text-file` flag for `post-message.ts`** — The generator teaches `--text-file /tmp/delivery-draft.txt` but the auto-generated section only shows `--text` as required. The hand-written section (lines 456–496) doesn't mention `--text-file` either. This flag MUST be documented if it's a real flag, or the generator teaching must be corrected to use `--text` with `$(cat /tmp/delivery-draft.txt)`.

2. **Delivery Session Pattern** — A new subsection explaining the delivery container's internal workflow:

   ```
   ## Delivery Session Pattern
   In the delivery phase, the platform injects approved content via <approved-content> XML in the prompt.
   Standard pattern:
   1. Parse <approved-content> JSON from the initial prompt
   2. Extract the `draft` field and write to /tmp/delivery-draft.txt
   3. Use the draft file with the appropriate delivery tool
   4. Call submit-output.ts --classification NO_ACTION_NEEDED to confirm delivery
   ```

3. **Fix confusing example at line 403** — The example says `Write the full deliverable ... to a /tmp/ file (e.g. /tmp/summary.txt or /tmp/draft.txt)`. Using `/tmp/summary.txt` as a draft file is WRONG — it's the OUTPUT CONTRACT file that `submit-output.ts` writes. Change the example to use `/tmp/draft.txt` only.

4. **Date-handling (if not going to compiler)** — If the date-parameterization mechanic is targeted at tool-usage-reference instead of the compiler, add:
   ```
   ## Date Parameterization
   Read target date: printenv INPUT_TARGET_DATE
   Derive day of week: node -e "const d=new Date(process.env.INPUT_TARGET_DATE+'T12:00:00Z'); const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; console.log(days[d.getUTCDay()]);"
   ```
   **However, RELOCATE-to-compiler is preferred** since only date-parameterized employees need this.

---

## Summary Table

| Mechanic                                             | Classification                                      | Source Location                                                                                            | Target Location                                                                                |
| ---------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `submit-output` CLI syntax                           | Already in skill — DELETE from generator prose      | `SYSTEM_PROMPT_PRE` L383, L421, L454; `REFINE_SYSTEM_PROMPT_PRE` L513; `buildConverseSystemPromptPre` L655 | Already: `tool-usage-reference/SKILL.md` lines 223-236, 1053-1103                              |
| `<approved-content>` XML parsing                     | RELOCATE-to-compiler                                | `SYSTEM_PROMPT_PRE` L82, L94-95, L431-432, L438; `buildConverseSystemPromptPre` L633                       | `agents-md-compiler.mts` — prepend `APPROVED_CONTENT_CONTEXT` to delivery-instructions wrapper |
| `/tmp/delivery-draft.txt` convention                 | RELOCATE-to-skill                                   | `SYSTEM_PROMPT_PRE` L82, L431-432; `buildConverseSystemPromptPre` L633-634                                 | `tool-usage-reference/SKILL.md` — add "Delivery Session Pattern" subsection                    |
| `printenv INPUT_TARGET_DATE`                         | RELOCATE-to-compiler                                | `SYSTEM_PROMPT_PRE` L122-125, L241-244, L317; `buildConverseSystemPromptPre` L560-563, L599                | `agents-md-compiler.mts` — new `DATE_PARAMETERIZATION_RULES` section at position 2.5           |
| `node -e "...getUTCDay()..."`                        | RELOCATE-to-compiler                                | `SYSTEM_PROMPT_PRE` L246-249, L318; `buildConverseSystemPromptPre` L599-600                                | `agents-md-compiler.mts` — same `DATE_PARAMETERIZATION_RULES` section                          |
| `/tools/slack/post-message.ts` CLI in delivery_steps | DELETE from generator — already in skill            | `SYSTEM_PROMPT_PRE` L82, L432                                                                              | Already: `tool-usage-reference/SKILL.md` lines 368-380, 456-496                                |
| "Concrete Execution Steps Example" (entire section)  | DELETE — hardcoding driver                          | `SYSTEM_PROMPT_PRE` L232-313                                                                               | N/A                                                                                            |
| 10-point list item 4 (hardcode zone table)           | DELETE — contradicts Notion Data Extraction Pattern | `SYSTEM_PROMPT_PRE` L321; `buildConverseSystemPromptPre` L602                                              | N/A                                                                                            |
| 10-point list item 7 (hardcode calendar)             | DELETE — contradicts Notion Data Extraction Pattern | `SYSTEM_PROMPT_PRE` L322-324; `buildConverseSystemPromptPre` L605                                          | N/A                                                                                            |
| "Notion Data Extraction Pattern"                     | KEEP + make unconditional + generalize              | `SYSTEM_PROMPT_PRE` L343-363; `buildConverseSystemPromptPre` L611-617                                      | Remain in generator — promote to PRIMARY pattern, remove Notion-only framing                   |
