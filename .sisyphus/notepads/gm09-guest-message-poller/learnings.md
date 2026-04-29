# Learnings — gm09-guest-message-poller

## Conventions

- Inngest trigger pattern: factory function `createXTrigger(inngest: Inngest): InngestFunction.Any`
- PostgREST headers: `{ apikey, Authorization: Bearer, Content-Type: application/json }`
- All triggers registered in `src/gateway/inngest/serve.ts` — import + instantiate + add to array
- Test pattern: `vi.hoisted()` + `vi.mock()` for createTaskAndDispatch, handler extracted from `mockInngest.createFunction.mock.calls[0][1]`
- externalId dedup: floor-based slot `Math.floor(Date.now() / intervalMs)` → one task per polling window
- Approved models: minimax/minimax-m2.7 (execution) and anthropic/claude-haiku-4-5 (verification only)
- Gateway port: 7700 (not 3000 per README — AGENTS.md Admin API section confirms 7700)
- PostgREST port: 54321
