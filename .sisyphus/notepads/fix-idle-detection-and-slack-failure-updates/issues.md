# Issues & Gotchas

## [2026-06-03] Known Issues

### CRITICAL: Wrong env var name

- `NOTIFY_MSG_CHANNEL` does NOT exist in harness container
- MUST use `NOTIFICATION_CHANNEL` instead
- Guard ALL three: `if (token && ts && channel)` before Slack call

### Dashboard conventions to follow

- SearchableSelect for any dropdowns (NOT Radix Select)
- Cards must use `rounded-lg border bg-card` with `px-5 py-4` padding
- All navigatable UI state must be URL-encoded
- End-user language is non-technical

### Inngest Dev Server step contamination

- Confirmed: Inngest Dev Server was restarted mid-execution for task 197a00dc
- This caused mark-failed step to never run → Slack stuck on "Received"
- markFailed() in harness is the gap we're filling
