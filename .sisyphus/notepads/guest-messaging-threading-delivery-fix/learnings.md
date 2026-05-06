# Learnings — guest-messaging-threading-delivery-fix

## NOTIFY_MSG_TS injection (lifecycle)

- Both env blocks in the `executing` step must be updated: local Docker (line ~356) and Fly.io (line ~379)
- `notifyMsgRef` shape: `{ ts: string | null, channel: string | null }` — always an object, never null itself (step.run returns it)
- Safe injection: `notifyMsgRef?.ts ?? ''` — handles both null ts and undefined gracefully
- `runLocalDockerContainer` is a module-private function (not exported) — cannot be vi.mock'd; tests use the Fly.io path (no `USE_LOCAL_DOCKER=1`)

## Test pattern for executing step

- To test env vars injected by the `executing` step, mock `notify-received` to return a specific value, then let `executing` run as `fn()` in the step mock
- After `execute()`, check `mockCreateMachine.mock.calls[0][1].env.NOTIFY_MSG_TS`
- The fetch mock must return OK for all PATCH/POST and empty arrays for GET requests (knowledge_bases, feedback, learned_rules)
- Use `waitForEvent → null` (timeout) to short-circuit the approval path cleanly

## Pre-existing test failures (do not fix)

- `interaction-handler-rejection-feedback.test.ts` — 7 failures (TDD RED)
- `lifecycle-guest-delivery.test.ts` — 1 failure ("TDD RED phase")
- `summarizer-trigger.test.ts` — 2 failures
- `workers/lib/fallback-pr.test.ts` — 11 failures
- `workers/lib/opencode-server.test.ts` — 7 failures
- `workers/lib/branch-manager.test.ts` — 1 failure
