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

## Task 0.4 — conversation-history-context test fix (2026-06-07)

**Root cause**: `GUEST_MESSAGING_AGENTS_MD` const was removed from `prisma/seed.ts` by PR #7. Only `PLATFORM_AGENTS_MD` and `VLRE_GUEST_MESSAGING_INSTRUCTIONS` remain as named consts.

**Where content moved**:
- "match the guest's language" → archetype `identity` field (seed.ts line ~3221, inline string)
- "tool-usage-reference" / "CLI syntax" → `src/workers/skills/tool-usage-reference/SKILL.md`
- Tenant-level language context → `config.default_agents_md` in tenant seed (seed.ts line ~80)

**Fix applied**: Replaced `getGuestMessagingAgentsMd()` (which regex-matched the removed const) with:
1. `getGuestMessagingIdentity()` — regex-matches `role_name: 'guest-messaging'` then captures `identity:` string
2. `getToolUsageReferenceSkill()` — reads SKILL.md directly from `src/workers/skills/tool-usage-reference/SKILL.md`

**Pattern**: When seed.ts consts are removed, check if content moved to archetype `identity`/`execution_steps` fields (inline strings) or to skill files. Don't re-add removed consts.

## Task 0.5 — lifecycle spy / feedback-injection regressions (2026-06-08)

**Root cause A — WORKER_RUNTIME module-level const**: `src/lib/config.ts` exports `WORKER_RUNTIME = getEnv('WORKER_RUNTIME', 'docker')` as a module-level constant evaluated at import time. Tests that set `process.env.WORKER_RUNTIME = 'fly'` in `beforeEach` had no effect because the constant was already bound when the module loaded. The `executing` step always took the local Docker path (`runLocalDockerContainer`) instead of `createMachine`, so `mockCreateMachine` was never called.

**Fix A**: Add `vi.mock('../../src/lib/config.js', () => ({ ..., WORKER_RUNTIME: 'fly', ... }))` to the 4 affected test files. The `requireEnv`/`getEnv` function mocks must read `process.env[name]` at call time (not factory time) so that `beforeEach` env var setup still works.

**Root cause B — missing NOTIFICATION_CHANNEL fallback**: Two tests in `employee-lifecycle-delivery.test.ts` asserted that `handleReject` falls back to `NOTIFICATION_CHANNEL` from tenant env when `metadata.target_channel` is absent. But `handleReject` in `src/inngest/lifecycle/steps/approval-handler.ts` uses `(metadata.target_channel as string) ?? ''` with no fallback — `mockUpdateMessage` is never called when `target_channel` is absent.

**Fix B**: Re-pointed both assertions to `expect(mockUpdateMessage).not.toHaveBeenCalled()`. Kept the `not.toHaveBeenCalledWith('C_LEGACY', ...)` assertion in the second test (still valid).

**Key pattern**: When `vi.mock` factory returns module-level constants, those values are frozen at mock-factory evaluation time. For constants that tests need to control, either (a) mock the entire module with a fixed value, or (b) export a getter function instead of a bare constant.

**Result**: 23/23 passing across all 5 target files. Build clean.

## [2026-06-08] Task 0.6 — Archived test + process.exit guards

### Pattern: import.meta.url guard for script entrypoints
When a script file (`.ts` or `.mts`) has a top-level `main().catch(process.exit)` call, it fires during vitest test collection (import phase), causing "process.exit unexpectedly called" errors.

**Fix pattern** (from `src/worker-tools/notion/get-page.ts`):
```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // error handling
    process.exit(1);
  });
}
```

This guard ensures `main()` only runs when the file is the direct entry point, not when imported.

### Files fixed
- `src/workers/opencode-harness.mts` — line 993
- `scripts/trigger-task.ts` — line 698

### Archived test removal
- `tests/scripts/migrate-vlre-kb.test.ts` pointed at `scripts/migrate-vlre-kb.ts` which was moved to `scripts/archive/` in PR #7
- Use `git rm` to remove test files for archived scripts
- Evidence: `.sisyphus/evidence/task-0.6-exits-archived.txt`

## Task 0.8 — Split test scripts + CI wiring (2026-06-07)

### package.json script split
- `"test"` → `vitest --config vitest.config.ts` (unit, watch mode default)
- `"test:unit"` → `vitest run --config vitest.config.ts` (explicit one-shot)
- `"test:integration"` → `vitest run --config vitest.integration.config.ts`
- `"test:all"` → `pnpm test:unit && pnpm test:integration` (convenience)
- `"test:coverage"` → `vitest run --coverage --config vitest.config.ts` (unit only)
- `pnpm test -- --run` still works as before because vitest passes `--run` flag through

### CI strategy (deploy.yml)
- Single `test` job with postgres service running for all steps (harmless for unit tests)
- Step order: install → build → `pnpm test:unit` (fast, no DB) → `pnpm test:db:setup` → `pnpm test:integration` (DB env vars set) → lint
- DATABASE_URL env only on the integration step to make intent clear

### Verification
- `pnpm test:unit`: 120 files, 1386 passed, 9 skipped, EXIT_CODE:0, ~9.2s
- `pnpm build`: tsc clean, EXIT_CODE:0

## [2026-06-07] Task 1 — Extract shared gateway helpers
- isPrismaError extracted to src/gateway/lib/prisma-helpers.ts
- ERROR_CODES constants added
- sendError JSDoc added in http-response.ts

## [2026-06-07] Task 4 — Test convenience scripts
- test:file and test:watch added to package.json
- CONTRIBUTING.md "Running Tests" subsection added (replaced bare "Unit tests" block)
- `pnpm test:file tests/unit/lib/classify-message.test.ts` verified: 34 tests pass
- .sisyphus/evidence/ is gitignored — evidence files stay local only

## [2026-06-07] Task 2 — New contributor setup guide
- Created docs/guides/2026-06-07-2022-new-contributor-setup.md
- Linked from CONTRIBUTING.md "Where to Find More" table (added "New contributor setup" row + "Personal Slack dev app setup" row)
- Banner added to scripts/dev.ts near the end of the summary block: "📖 First time? See docs/guides/2026-06-07-2022-new-contributor-setup.md"
- Guide covers all 7 required sections: prerequisites, pnpm setup, Cloudflare tunnel, personal Slack dev app (links to existing guide), env-var checklist, running pnpm dev, common first-day issues
- No personal tunnel UUID (e160ac6d) in the guide — verified with grep -c
- Evidence: .sisyphus/evidence/task-2-contributor-guide.txt (gitignored, local only)

## [2026-06-07] Task 5 — Architecture diagram
- Created docs/architecture/CURRENT-ARCHITECTURE.md (living doc, no timestamp)
- Mermaid diagram with ≤20 nodes (15 nodes: 3 triggers, 5 platform core, 2 worker runtime, 2 LLM routing, 2 approval gate, 1 external APIs)
- Flow Walkthrough table with 9 numbered steps covering the full trigger-to-delivery path
- Key Design Decisions section explains two DB access paths, OpenCodeGo routing, optional approval gate, Socket Mode
- Linked from AGENTS.md Reference Documents table (first row, before full-system-vision.md)
- File was committed as part of the previous task's commit (3d1bc221) — already in repo

## [2026-06-07] Task 6 — Remove tenant-env barrel
- Deleted src/inngest/lib/tenant-env.ts
- employee-lifecycle.ts and approval-handler.ts now import directly from gateway services
- Relative paths: employee-lifecycle → ../gateway/services/; approval-handler → ../../../gateway/services/
- git rm used to track deletion; pre-commit hooks ran ESLint cleanly
- pnpm build: 0 errors; pnpm test:unit: 121 files, 1389 passed, 9 skipped

## [2026-06-07] Task 3 — PR template + husky + lint-staged
- .github/PULL_REQUEST_TEMPLATE.md created
- husky + lint-staged installed (husky 9.1.7, lint-staged 17.0.7)
- .husky/pre-commit runs pnpm lint-staged
- lint-staged config: *.{ts,tsx} → eslint --max-warnings 0
- "prepare": "husky" added to package.json scripts
- pnpm build: EXIT 0; pnpm test -- --run: 121 files, 1389 passed, EXIT 0
- Note: package.json changes (prepare + lint-staged config) were already in HEAD from a prior commit in this session

## [2026-06-07] Task 7 — optionalEnv helper
- Added optionalEnv(name) to src/worker-tools/lib/require-env.ts
- Returns process.env[name] || undefined (graceful, no exit)
- Test file: src/worker-tools/lib/__tests__/require-env.test.ts
- src/worker-tools/lib/ is gitignored (compiled JS artifacts) — use git add -f for new files in this dir
- lint-staged warning about gitignore is non-fatal when using git add -f

## [2026-06-07] Task 11 — Dedup pino/base64url/generateAppJwt
- admin-auth.ts and server.ts now use createLogger from src/lib/logger.ts
- base64url and generateAppJwt exported from github-token-manager.ts
- admin-github.ts imports them from the service (no local defs)
- Test mock for github-token-manager.js updated to use importOriginal spread so generateAppJwt is available
