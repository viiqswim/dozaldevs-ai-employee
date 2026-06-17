# Run B — Chat Quality Notes

## Description used

"Every morning, I need an employee to check which properties have guests checking out that day and create a cleaning schedule for my team. My team uses Notion to track which cleaners cover each area and how long each property takes. The final schedule should be posted to our Slack channel so cleaners know what to do."
(317 chars, 3 sentences)

## Clarifying questions asked

**ZERO.** The wizard jumped straight to `kind:'proposal'` in one turn with no clarifying question.

This is the same defect observed in Task 6 (Run A naive sentence), but with a longer, more specific description. The DEFECT persists regardless of description length or specificity.

## Turn transcript

| Turn | Role      | Content                                          |
| ---- | --------- | ------------------------------------------------ |
| 1    | user      | (317-char description above)                     |
| 1    | assistant | `kind:'proposal'` → jumped to Review & Edit step |

No question was asked about:

- Which Slack channel to post to
- What Notion page/database holds the cleaner assignments
- What time to run (only overview prose says "8 AM" — structured trigger is `manual`)
- What to do when there are no checkouts

## Proposal quality assessment

### What was correct ✓

- **Identified Hostfully** as the checkout data source → `get-checkouts.ts`, `get-property.ts`
- **Identified Notion** as the cleaner assignment source (mentioned by name in description)
- **Identified Slack** as the output destination → `post-message.ts`
- **Role name** auto-derived: `daily-cleaning-schedule-coordinator` (sensible, kebab-case)
- **Execution steps** are reasonable 6-step flow (verify → Hostfully checkouts → Notion lookup → cross-reference → compile → submit)
- **Identity** is coherent: "friendly and efficient coordinator... daily cleaning schedule for a property management team"
- **Model selected**: `minimax/minimax-m2.7` (correct — from model catalog)

### Issues found ✗

#### 1. Trigger inconsistency (same as Task 6 DEFECT)

- `proposal.trigger_sources.type = 'manual'`
- But `proposal.overview.trigger = 'Scheduled daily at 8 AM'`
- Structured field contradicts prose field. If saved as-is, the employee would NOT run on a schedule.
- User would have to manually fix `trigger_sources` after the wizard.

#### 2. Composio/Notion tool MISSING from tool_registry

- `execution_steps` step 3 says: "use Notion (via Composio) to look up the cleaning team database"
- `tool_registry.tools` = `[get-checkouts, get-property, post-message, submit-output]`
- **No Composio execute tool registered** (`/tools/composio/execute.ts` absent)
- Steps reference a tool but the tool_registry doesn't include it → if `enforce_tool_registry: true`, Notion access would be blocked at runtime

#### 3. No knowledge_base or Notion page IDs in steps

- Notion lookup in step 3 gives no page ID, database ID, or connection name
- Worker would need to discover these at runtime (risky — may hallucinate)

#### 4. approval_required = false

- The description says "create a cleaning schedule for my team" and "post the schedule to our Slack channel"
- The proposal sets approval_required=false and delivery_steps to post to Slack
- This means the schedule would auto-post without PM review
- Whether this is correct depends on business intent — not flagged as a defect, just noted

## Comparison vs Task 6 (Run A — naive sentence)

| Dimension                 | Run A (naive, 1 sentence)                                | Run B (plain, 3 sentences)                               |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Clarifying questions      | 0 (defect)                                               | 0 (defect)                                               |
| Tools selected            | get-checkouts, get-property, post-message, submit-output | get-checkouts, get-property, post-message, submit-output |
| Notion mentioned in steps | No                                                       | Yes (step 3)                                             |
| Notion in tool_registry   | No                                                       | No (gap)                                                 |
| Trigger structured field  | manual                                                   | manual                                                   |
| Trigger overview prose    | "Scheduled daily at 6 AM"                                | "Scheduled daily at 8 AM"                                |
| approval_required         | false                                                    | false                                                    |
| Model                     | minimax/minimax-m2.7                                     | minimax/minimax-m2.7                                     |
| Role name                 | (unknown from Task 6)                                    | daily-cleaning-schedule-coordinator                      |

**Key finding**: More specific description (naming Notion explicitly) caused Notion to appear in the execution steps prose but NOT in the tool_registry. The structural gap (Composio tool missing from registry) persists. The trigger inconsistency persists.

## Overall verdict

The proposal is PLAUSIBLE but has 2 structural defects that would affect runtime correctness:

1. Trigger is `manual` not `scheduled` → employee won't run daily without manual intervention
2. Composio tool not in registry → Notion access may silently fail

The description was sufficient to name the right data sources (Hostfully, Notion, Slack) but the generator didn't automatically register the Composio execute tool even when Notion was explicitly mentioned.
