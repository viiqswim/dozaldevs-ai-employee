# Generality Check — Sales Reminder Employee

## Purpose

Verify that the 7 platform fixes in `archetype-generator-prompts.ts` are not cleaning-schedule-specific — they must generalize to unrelated employee types.

## Test Employee: Stale Deals Alert (Sales Reminder)

### Description given to converse-create

"Create an employee that monitors our Notion Sales Pipeline database for deals that haven't been updated in 7 days and sends a daily Slack alert listing the stale deals and their owners."

### Conversation Transcript (4 turns)

- Turn 1: User gave description → LLM returned `kind:'question'` asking about notification channel
- Turn 2: User answered "Post to #sales-alerts Slack channel" → LLM returned `kind:'question'` asking about threshold
- Turn 3: User answered "7 days without update" → LLM returned `kind:'question'` asking about schedule
- Turn 4: User answered "Daily at 8 AM" → LLM returned `kind:'proposal'`

### Final Proposal Analysis

**role_name**: `stale-deals-alert`
**model**: `minimax/minimax-m2.7`
**trigger_sources.type**: `scheduled` with `cron: "0 8 * * *"`
**approval_required**: `false`
**tool_registry**: `["/tools/slack/post-message.ts", "/tools/platform/submit-output.ts"]`
**execution_steps length**: ~640 chars

### Fix-by-Fix Assessment

| Fix                             | Description                                                | Result for Sales Reminder                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fix 1 (clarify gate)            | Ask clarifying question before generating                  | ✅ WORKING — asked 3 clarifying questions before proposing                                                                                                                |
| Fix 2 (date blindness)          | Use INPUT_TARGET_DATE env var for date-sensitive employees | ✅ N/A — sales reminder uses threshold (7 days), not a specific date. No input_schema generated (correct behavior)                                                        |
| Fix 3 (identity quality)        | Generate meaningful identity text                          | ✅ WORKING — "A sales operations assistant that monitors the Sales Pipeline Notion database for deals that have not been updated in 7 days and alerts the team."          |
| Fix 4 (execution steps quality) | Generate multi-step execution with clear logic             | ✅ WORKING — 5 steps: enforce boundary, read Notion DB, calculate staleness, compile list, submit                                                                         |
| Fix 5 (Composio tool registry)  | Include /tools/composio/execute.ts when Notion mentioned   | ❌ STILL FAILING — Notion explicitly mentioned but `/tools/composio/execute.ts` NOT in tool_registry. Only slack/post-message.ts and platform/submit-output.ts generated. |
| Fix 6 (trigger consistency)     | Generate correct trigger_sources type                      | ✅ WORKING — `type: "scheduled"` with `cron: "0 8 * * *"` matches the "daily at 8 AM" description                                                                         |
| Fix 7 (delivery thread)         | No --thread-ts in delivery_steps                           | ✅ WORKING — delivery_steps posts to $NOTIFICATION_CHANNEL without thread-ts                                                                                              |

### Summary

- **5/7 fixes working** for the sales reminder employee
- **Fix 5 (Composio)** is a persistent defect: even when Notion is explicitly mentioned across multiple turns, the LLM does not include `/tools/composio/execute.ts` in the tool_registry
- Fix 2 correctly does NOT generate input_schema for this employee (threshold-based, not date-specific) — this is correct behavior
- The clarify gate (Fix 1) works well for unrelated employee types — asked 3 relevant questions before proposing

### Conclusion

The platform fixes are **generic** (not cleaning-schedule-specific). Fix 5 (Composio tool registry) is a residual defect that affects any employee needing Notion/third-party integrations via Composio.
