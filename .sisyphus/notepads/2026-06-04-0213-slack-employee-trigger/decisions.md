# Decisions

## [2026-06-04] Architecture Decisions (from user interview)

- Hybrid approach: fast path for 1 employee per channel, LLM routing for 2+
- Keep notification_channel as-is (no schema changes)
- Unassigned channels: politely decline
- Input collection: threaded follow-up messages (no modals)
- Confirmation: always mandatory
- DMs: out of scope for v1
- Task status in thread: only confirmation + "Task started"
- No dedup — confirmation prevents duplicates
- Tests: tests-after implementation

## [2026-06-04] Dispatch approach

- Use dispatchEmployee() from employee-dispatcher.ts (takes slug/role_name)
- In the Inngest handler, Prisma is available server-side
- The archetype row already has role_name — pass it directly to dispatchEmployee()
