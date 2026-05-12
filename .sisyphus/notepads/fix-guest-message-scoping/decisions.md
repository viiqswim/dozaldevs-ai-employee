# Decisions — fix-guest-message-scoping

## [2026-05-12] Fix approach

### Decision: Tool-level guard + instructions update (defense in depth)

- When `--lead-id` is provided: always return full conversation (ignore `--unresponded-only`)
- When `LEAD_UID` env var is set but `--lead-id` not passed: auto-use env var with warning log
- Polling cron path (`--unresponded-only` alone, no `--lead-id`): unchanged

### Decision: Drop `--unresponded-only` from archetype instructions

- The lifecycle pre-check already gates "should we respond?"
- Worker needs full conversation context for the specific lead
- `--unresponded-only` is for the polling cron scanner, not webhook path
