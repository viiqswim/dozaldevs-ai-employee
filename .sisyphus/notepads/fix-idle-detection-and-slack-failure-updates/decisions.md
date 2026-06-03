# Decisions

## [2026-06-03] Architecture Decisions

### T1/T2: idle threshold values

- Main execution: 10_000 → 60_000 (6x increase, gives slow models like xiaomi/mimo-v2.5-pro with ~23s TTFT enough room)
- Delivery: 10_000 → 30_000 (delivery prompts are simpler, 30s adequate)
- Recovery nudge (~line 512): LEFT AT 10_000 intentionally — this is for re-prompted sessions, not first response

### T3: Slack update insertion point

- Decision: add Slack chat.update to `markFailed()`, NOT to SIGTERM handler
- Reason: SIGTERM handler is fire-and-forget, can't reliably await; markFailed() is async and properly awaited
- Double update (harness + lifecycle) accepted as benign/idempotent

### T4/T5: Dashboard changes

- Move RawEventViewer to after failure banner, before StatusTimeline (near top of page)
- Rename "Trigger Payload" → "Task Input" for clarity
- Re-run modal only for source_system === 'manual' AND terminal states
- No new API endpoints needed — use existing triggerEmployee() client
- Must add `input_schema` to PostgREST select in fetchTask
