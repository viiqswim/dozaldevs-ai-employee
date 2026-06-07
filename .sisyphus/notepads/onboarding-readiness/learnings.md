# Learnings — onboarding-readiness

## [2026-06-07] Session Start

### Verified Baseline State

- `pnpm build` PASSES ✅
- `pnpm lint` PASSES ✅
- Test suite: 61 failures across 14 files, 117-second runtime
- Git HEAD: dd33115c (plan committed, clean working tree)

### Root Cause Summary (verified with file:line evidence)

1. **~18 failures** — `boltApp.use is not a function`: `src/gateway/slack/handlers/event-handlers.ts:17` calls `boltApp.use(...)` but test mock boltApp objects in 4 files never added `.use`. Files: override-handler.test.ts, rule-handlers.test.ts, slack-trigger-handler.test.ts, slack-input-collector.test.ts
2. **~12 failures** — Drifted Slack copy: PR #7 changed strings but tests assert old text. Files: reminder-blocks.test.ts, lifecycle-enriched-notify.test.ts, slack-trigger-handler.test.ts
3. **~4 failures** — call-llm cost=0: PR #7 moved pricing to model_catalog DB table; unit mocks don't seed catalog pricing. File: call-llm.test.ts:105,266
4. **2 failures** — GUEST_MESSAGING_AGENTS_MD removed from seed.ts (only PLATFORM_AGENTS_MD remains). File: conversation-history-context.test.ts:6-9
5. **~17 failures** — Lifecycle spy regressions: handler wiring changed in PR #7; spies stale. Files: feedback-injection.test.ts, lifecycle-feedback-context-rejection.test.ts, lifecycle-notify-msg-ts.test.ts, employee-lifecycle-delivery.test.ts, slack-input-collector.test.ts
6. **~9 failures** — tenant-repository.test.ts Prisma unique constraint on slug (DB cleanup gap, integration test)
7. **1+ failures** — migrate-vlre-kb.test.ts points at archived script path
8. **2 errors** — process.exit(1) leaks from opencode-harness.mts:995 and trigger-task.ts:703

### Key Conventions

- Use `pnpm exec tsx` not bare `tsx` (tsx not on PATH)
- Never `--no-verify` on commits; never add Co-authored-by or AI references in commits
- Fix tests to match SHIPPED production behavior — if a test exposes a real prod BUG, record it, don't hide it
- Do NOT touch deprecated files (orchestrate.mts, lifecycle.ts, redispatch.ts, watchdog.ts, etc.)
- Do NOT re-migrate the 5 already-migrated worker tools

## [2026-06-07] Task 0.1 — boltApp.use mock fix

### What was actually broken (refined analysis)

Root cause #1 said ALL 4 files had boltApp.use failures. Actual breakdown:

- `override-handler.test.ts` + `rule-handlers.test.ts`: DID have boltApp.use failures (18 total). Both call `registerSlackHandlers()` which calls `registerEventHandlers()` → `boltApp.use()` at line 17.
- `slack-trigger-handler.test.ts` + `slack-input-collector.test.ts`: Did NOT have boltApp.use failures. They import `createSlackTriggerHandlerFunction`/`createSlackInputCollectorFunction` which never calls `boltApp.use`. Their failures were from other root causes.

### Hidden failures revealed by fixing boltApp.use

After adding `use: vi.fn()`, 5 additional failures were revealed in the gateway/slack files:

- **rule-handlers.test.ts** (4 failures): Production `rule_confirm` and `rule_reject` handlers now send a loading-state `client.chat.update` ("On it — one moment…") BEFORE the final update. Tests asserted `toHaveBeenCalledOnce()` but now it's `toHaveBeenCalledTimes(2)`. Also `mock.calls[0]` → `mock.calls[1]` to get the final call.
- **override-handler.test.ts** (1 failure): Slack copy changed from `'Processing override'` → `'⏳ On it — working on your direction…'`.

### Inngest file failures (separate root causes)

- `slack-trigger-handler.test.ts`: `triggerCardPrompt()` in `src/lib/slack-copy.ts` changed from `'Trigger {name}?'` → `'Want me to get *{name}* started?'` (humanized per voice & tone rules). Fixed by updating test assertion.
- `slack-input-collector.test.ts`: Single-input handling now ALWAYS calls `extractInputsFromText` (LLM extraction), whereas old behavior bypassed it. Test description updated; result assertion unchanged since fallback to raw text still produces expected value.

### Fix applied

- `override-handler.test.ts`: Added `use: vi.fn()` to `makeMockBoltApp()`. Updated copy assertion.
- `rule-handlers.test.ts`: Added `use: vi.fn()` to `makeMockBoltApp()`. Updated 4 assertions to `toHaveBeenCalledTimes(2)` and `calls[1]` for the final update.
- `slack-trigger-handler.test.ts`: Updated Slack copy assertion to match current `triggerCardPrompt()` output.
- `slack-input-collector.test.ts`: Updated single-input test description and assertion to reflect current behavior (LLM extraction always runs).

### Result: 37/37 passing across all 4 files
