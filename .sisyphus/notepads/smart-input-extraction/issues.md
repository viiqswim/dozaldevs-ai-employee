# Issues — smart-input-extraction

## [2026-06-05] Session Start

## [2026-06-05] E2E Task 5 — Smart Extraction Failure

### Issue 1: LLM returns null for natural-language dates

**Symptom**: `extractInputsFromText` returns `extractedCount: 0` for message "generate cleaning schedule for June 10th".

**Root cause**: The `extractInputsFromText` system prompt says "extract the requested field values... or null if not found." The field description for `date` says `e.g. 2026-05-30` (YYYY-MM-DD). When the user says "June 10th" (no year, non-ISO format), the LLM returns `{"date": null}` because it can't match the expected format — it treats the format mismatch as "not found". The `extractInputsFromText` function then skips null values (line 61: `if (val === null || val === undefined) continue`), resulting in `extractedCount: 0`.

**Fix needed**: Update the system prompt in `src/lib/extract-inputs.ts` to instruct the LLM to normalize date values to YYYY-MM-DD format when the field type is `date`, rather than returning null for natural-language dates. Also add explicit instruction: "For date fields, convert natural language dates (e.g. 'June 10th', 'next Monday', 'tomorrow') to YYYY-MM-DD format using the current year if no year is specified."

**Gateway log evidence** (2026-06-05 03:58:05 UTC):

```
{"component":"slack-handlers","someFound":false,"extractedCount":0,"msg":"Waiting for inputs in thread before dispatching task"}
```

### Issue 2: Socket Mode app_mention events dropped (transient)

**Symptom**: @mention sent at 10:48 PM and 10:54 PM local time did not trigger `app_mention` events in the gateway. Socket Mode showed "reconnected" at 10:45 PM but no events arrived.

**Workaround**: Manually fire `employee/interaction.received` event to Inngest (`http://localhost:8288/e/local`) with the correct `messageTs`. The `TRIGGER_CONFIRM` button click WAS received via Socket Mode despite `app_mention` events not working — suggesting a partial Socket Mode issue.

**Note**: This is a known transient WebSocket drop per AGENTS.md. Not a code bug.

## 2026-06-05 pendingKey bug fix

Line 1711 handlers.ts: swapped priority so ctx.threadTs (top-level thread ts) is
used as pendingKey instead of inputMsgResult.ts (bot reply ts). The lookup at
line 318 uses mention.thread_ts which equals ctx.threadTs, not inputMsgResult.ts.
