# Issues

## [2026-06-04] Known Issues

### threadTs missing from employee/task.requested event

- Current emission at interaction-handler.ts:450-461 does NOT include threadTs
- Must add threadTs to the event payload in Task 2
- The new trigger handler (Task 6) needs threadTs to reply in the correct thread

### resolveArchetypeFromChannel silent fallback

- Currently falls back to oldest active archetype when no channel match
- Dangerous for trigger feature — would dispatch to wrong employee
- Fix in Task 3: add isExactMatch flag

### Stub ack fires before confirmation card

- "Got it! I'll work on that." fires for task intent before confirmation card
- Must suppress in Task 2

### Bot self-mention loop risk

- No guard in app_mention handler
- Must add in Task 4
