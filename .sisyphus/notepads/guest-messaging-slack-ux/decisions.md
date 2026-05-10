# Decisions — guest-messaging-slack-ux

## [2026-05-09] Architecture Decisions

### Threading Model

- Keep two-message structure: top-level status + threaded approval card
- Do NOT switch to top-level approval cards

### Employee-Agnostic Gating

- All guest-messaging-specific behavior in lifecycle gated on `metadata.original_message` existence
- NEVER gate on `archetype.role_name`

### Property Name Fetch Strategy

- Best-effort: 2s timeout, fallback to null on any failure
- Never block notify-received step on API failure

### Slack Date Format

- Use `<!date^{epoch}^{date_short_pretty} at {time}|${isoFallback}>` for all timestamps
- Epoch = Math.floor(Date.now() / 1000)

### reply_broadcast

- Set `reply_broadcast: true` for all guest-messaging approval cards
- Gate on `rawEvent['thread_uid']` existence (not role_name)

### buildSupersededBlocks signature change

- Add `taskId: string` parameter
- Update BOTH call sites in employee-lifecycle.ts
