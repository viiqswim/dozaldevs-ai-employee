# Learnings: fix-trigger-confirm-false-failure

## Root Cause Pattern
The `allFound` branch in `TRIGGER_CONFIRM` had no `return` after dispatching. Control fell through to the default path which tried to create a second task with the same `external_id`. PostgREST rejected the duplicate (unique constraint), returned empty response, which threw "Task creation returned empty response" — landing in the catch block that posted the false ⚠️ failure message.

## Fix Pattern
1. `let dispatched = false;` declared OUTSIDE the main try block — survives into the catch block.
2. `dispatched = true;` set immediately after each `await inngest.send()` resolves (both allFound and default paths).
3. Success `respond()` calls wrapped in isolated try/catch (mirrors the "pending" respond pattern at lines 1535-1552) — prevents respond errors from triggering the outer catch.
4. `return;` added after the allFound success-respond try/catch — PRIMARY FIX, prevents fall-through to default path.
5. Catch block gates `⚠️ Failed to trigger` on `if (!dispatched)` — if dispatch succeeded, log.warn only (suppresses false failure).

## Optional Chaining Fix
`confirmResult.content?.trim() ?? ''` — LLM responses may have null/undefined content; optional chaining prevents runtime TypeError.

## Key Convention
The isolated respond try/catch pattern (log.warn, no re-throw) is the established pattern in this file for non-critical Slack API calls that should not abort the main flow.
