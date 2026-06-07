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

## [2026-06-07] Task 0.2 — drifted Slack copy assertions

### Scope clarification (important)

Root cause #2 lumped `slack-trigger-handler.test.ts` into the copy-drift bucket, but that file was already fixed in Task 0.1. Task 0.2's actual copy-drift surface was only TWO files: `reminder-blocks.test.ts` (3 failures) and `lifecycle-enriched-notify.test.ts` (1 failure) = 4 failures, not ~12.

### What was actually broken (two distinct drift mechanisms)

1. **`reminder-blocks.test.ts` — renamed `ReminderThread` fields (silent test rot).** `src/inngest/lib/reminder-blocks.ts` renamed interface fields `guestName` → `recipientName` and `propertyName` → `contextLabel`. The test's `makeThread()` overrides still passed `guestName:`/`propertyName:`, which TypeScript's excess-property check rejects (`'guestName' does not exist in type 'Partial<ReminderThread>'`) AND at runtime the unknown props were ignored, so the builder fell back to the default `recipientName: 'Alice Smith'` / `contextLabel: 'Beach House'`. That's why the failure showed "expected 'Jane Doe' received '_Alice Smith_ — Beach House'".
2. **`reminder-blocks.test.ts:94` — stale context-block copy.** Asserted `'AI Employee Platform'`; current builder emits `'⚡ These items are still waiting on a reply'`. Updated assertion to `toContain('These items are still waiting on a reply')`.
3. **`lifecycle-enriched-notify.test.ts` Test 5 — metadata key rename.** Production `update-notify-reviewing` step (`employee-lifecycle.ts:1590`) reads `metadata['recipient_name']`, but the test helper `buildReviewingFetchMock` wrote `metadata['guest_name']`. So `reviewingDraftedMessage(undefined)` produced the generic "I've drafted something…" instead of "…a reply for Jane Smith". Fix was in the MOCK (rename the key + the opts param `guestName` → `recipientName`), not in the assertion — the assertion `toContain('Jane Smith')` was correct all along.

### Source-of-truth strings confirmed (current production)

- `reviewingDraftedMessage(name)` → ``👀 I've drafted${name ? ` a reply for ${name}` : ' something'} and sent it your way for a quick look.`` (`src/lib/slack-copy.ts:43`)
- reminder context block → `'⚡ These items are still waiting on a reply'` (`src/inngest/lib/reminder-blocks.ts:36`)
- reminder section → `*${recipientName}* — ${contextLabel}\n⏱️ Waiting ${elapsedMinutes} min · <permalink|View message>`

### Out-of-scope failures left untouched (different category, NOT copy)

Full-suite run after fix: 37 failures remain, NONE are Slack copy-string assertions. They are: `expected "spy" to be called once, but got 0 times` (machine-dispatch / delivery mocks — feedback-injection, lifecycle-notify-msg-ts, employee-lifecycle-delivery, lifecycle-feedback-context-rejection), numeric equality (`expected 1 to be +0`), and CLI tests (`--admin-key`, `[ERROR]`). These belong to other Task 0.x buckets (lifecycle spy regressions, call-llm cost=0, process.exit leaks).

### Fix applied

- `reminder-blocks.test.ts`: renamed all `guestName:`/`propertyName:` overrides to `recipientName:`/`contextLabel:` (5 sites), updated 2 test titles ("guest"→"recipient"), updated context assertion.
- `lifecycle-enriched-notify.test.ts`: renamed `buildReviewingFetchMock` opts param + metadata key `guest_name` → `recipient_name`, updated 2 test titles. Assertions unchanged.

### Result: 14/14 passing across both target files

## Task 0.3 — call-llm cost-from-catalog test mocks (2026-06-07)

**Root cause**: `vi.mock('@prisma/client', ...)` only mocked `$queryRaw` but not `modelCatalog.findFirst`. After PR #7 moved pricing to `model_catalog` DB table, `getCostForModel()` calls `getPrisma().modelCatalog.findFirst(...)` which returned `undefined` → cost was 0.

**Fix pattern**:
1. Add `mockModelCatalogFindFirst = vi.hoisted(() => vi.fn().mockImplementation(...))` with a `CATALOG_PRICING` map
2. Add `modelCatalog: { findFirst: mockModelCatalogFindFirst }` to the `PrismaClient` mock implementation
3. Re-set `mockModelCatalogFindFirst.mockImplementation(...)` in `beforeEach` AFTER `vi.clearAllMocks()` (clearAllMocks wipes implementations)
4. Do NOT call `_resetPrisma()` in `beforeEach` — it forces a new `PrismaClient()` call, but after `vi.clearAllMocks()` the constructor mock has no implementation and returns `undefined`

**Pricing values for minimax/minimax-m2.7**: `input_cost_per_million: 0.3`, `output_cost_per_million: 1.1`
- Math: `(100 × 0.3 + 50 × 1.1) / 1_000_000 = 0.000085`

**Key gotcha**: `vi.clearAllMocks()` clears both call history AND mock implementations. Always re-set implementations after calling it in `beforeEach`.
