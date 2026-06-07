# Onboarding Readiness — Second Maintainability Pass

## TL;DR

> **Quick Summary**: First stabilize the codebase to a 100% green baseline (build + lint + a fast unit suite + an isolated integration suite), then remediate the remaining maintainability/DX issues before new engineers onboard next week. Covers DX infrastructure (PR template, hooks, contributor guide, architecture diagram), pattern unification (sendError, error formats, logger naming), code deduplication, type safety (PostgREST generics, Inngest typed schemas), full lifecycle decomposition (1,886 → <500 lines), and systematic worker-tool helper adoption.
>
> **Deliverables**:
>
> - **Wave 0**: 61 failing tests fixed; suite split into fast `tests/unit/` + DB-backed `tests/integration/`; `pnpm test` = unit-only (seconds)
> - New contributor setup guide + PR template + husky/lint-staged
> - Current architecture Mermaid diagram (living doc)
> - Test factory for Inngest lifecycle mocks
> - Typed PostgREST client with generics + typed Inngest event schemas
> - `employee-lifecycle.ts` decomposed to <500 lines
> - `sendError` adopted in all 29 route files (279 raw `res.status` calls eliminated)
> - 54 worker tools migrated to shared helpers (5 already done)
> - ESLint `no-explicit-any` escalated to `error`
>
> **Estimated Effort**: XL (~48h — 8 Wave-0 tasks + 29 tasks across 5 waves + final verification)
> **Parallel Execution**: YES — Wave 0 gates everything; then 5 waves each with a checkpoint
> **Critical Path**: Wave 0 (green baseline) → Task 1 (shared helpers) → Task 8 (typed PostgREST) + Task 9 (typed events) → Task 14 (lifecycle decomp) → Tier B verification → Final Wave

---

## ⚠️ BASELINE NOTE (2026-06-07) — investigated before planning

> A read-only baseline run was executed before this plan was finalized. **`pnpm build` PASSES. `pnpm lint` PASSES.** The test suite does NOT: **61 failing tests across 14 files**, and a **117-second runtime** (terrible for a unit suite). These are regressions from PR #7 (the prior "completed" remediation) where production code drifted from tests, plus a structural problem: `vitest.config.ts` uses `pool: 'forks'` + `singleFork: true`, forcing all 171 files to run sequentially in ONE process. 122 of 171 files have NO DB dependency and can run fast in parallel. **Wave 0 fixes every failure AND splits the suite before any other work begins.**
>
> **Verified failure buckets** (from `/tmp/ai-test.log`):
>
> - **~18** `boltApp.use is not a function` — `src/gateway/slack/handlers/event-handlers.ts:17` now calls `boltApp.use(...)`, but the test mock `boltApp` (in override-handler, rule-handlers, slack-trigger-handler, slack-input-collector tests) never added `.use`. PRODUCTION REGRESSION exposed by missing mock method.
> - **~12** drifted Slack copy assertions — copy-unification commit changed strings ("Trigger Guest Messaging?" → "Want me to get _Guest Messaging_ started?", "Jane Doe"/"Bob"/"AI Employee Platform" enrichment text) but `reminder-blocks`, `lifecycle-enriched-notify`, `slack-trigger-handler` tests assert the old text.
> - **~4** `call-llm` cost = 0 — SMELL-4 fix moved pricing to the `model_catalog` DB table; unit mocks don't seed catalog pricing so `estimatedCostUsd` is 0 (`call-llm.test.ts:105,266`).
> - **2** `GUEST_MESSAGING_AGENTS_MD not found in seed.ts` — `conversation-history-context.test.ts:8` greps `prisma/seed.ts` for a const that was removed (only `PLATFORM_AGENTS_MD` remains).
> - **~17** lifecycle spy regressions (`expected "spy" to be called once, but got 0 times`) — `feedback-injection`, `lifecycle-feedback-context-rejection`, `lifecycle-notify-msg-ts`, `slack-input-collector`, `employee-lifecycle-delivery` — handler wiring changed; mocks/expectations stale.
> - **~9** `tenant-repository.test.ts` Prisma `Unique constraint failed (slug)` — real-DB integration test failing on leftover data (cleanup gap), NOT a code bug. Fixed by integration isolation.
> - **1+** `migrate-vlre-kb.test.ts` → `scripts/migrate-vlre-kb.ts` was archived to `scripts/archive/` by PR #7; test points at the old path and spawns slow `npx tsx` subprocesses.
> - **2 errors** unhandled `process.exit(1)` from `opencode-harness.mts:995` / `trigger-task.ts:703` top-level `main().catch(process.exit)` leaking into vitest.
>
> **Slowness**: `singleFork: true` (no parallelism) + slow subprocess tests (`get-messages.test.ts` 5,950ms, `employee-lifecycle-delivery.test.ts` 3,556ms, `migrate-vlre-kb` shells out). Split + parallel unit pool fixes it.

---

## Context

### Original Request

Analyze the codebase for remaining maintainability issues before team onboarding next week, then remediate everything found. This is the second pass — the first (33-task plan, PR #7) removed dead code, decomposed giant files, unified approval flow, and added shared foundations. **User then added**: investigate current failures and fix them at the START of the plan so we begin from 100% green; and split the slow unit suite.

### Interview Summary

**Key Discussions**:

- Scope: All three severity tiers (Blocks Onboarding + Causes Confusion + Nice to Have)
- Lifecycle: Full decomposition — extract each state handler to its own file
- Tests: After implementation, for new shared abstractions only
- Worker tools: Systematic adoption with awareness of edge cases (boolean flags, optional env, comma-split args)
- **Wave 0 decisions (2026-06-07)**: (1) Split via **directory move** — `tests/unit/` vs `tests/integration/`; (2) `pnpm test` = **unit-only** (fast; husky pre-commit + CI default); (3) the archived-script test (`migrate-vlre-kb`) is **removed**, not repointed.

**Research Findings**:

- Two explore agents + a full read-only baseline run with file:line evidence
- `sendError` exists but only 3/29 routes adopted it
- 54/59 worker tools need migration (5 already done)
- 122/171 test files have no DB dependency → clean unit/integration split is feasible

### Metis Review (gaps addressed)

- Worker-tools migration sequenced: low-risk first, high-risk Slack tools (`post-message.ts`, `post-guest-approval.ts`) last and isolated
- `optionalEnv()` helper added before Slack tool migration; boolean flags use `args.includes()`, not `getArg`
- Route factory signature inconsistency (`adminPlatformSettingsRoutes`) fixed alongside sendError adoption
- ESLint escalation fixes existing violations in the same task (depends on typed events first)

---

## Work Objectives

### Core Objective

Reach a 100%-green baseline (build + lint + fast unit suite + isolated integration suite), then eliminate patterns new engineers would copy/perpetuate, unify conventions, and provide onboarding infrastructure — without changing any externally-observable runtime behavior.

### Concrete Deliverables

- **Wave 0**: green build/lint/test; `tests/unit/` (parallel, seconds) + `tests/integration/` (DB-backed, isolated); `pnpm test` (unit) + `pnpm test:integration` scripts; CI + husky wired
- `docs/guides/2026-06-07-XXXX-new-contributor-setup.md` — personal tunnel + Slack app setup
- `docs/architecture/CURRENT-ARCHITECTURE.md` — living Mermaid diagram
- `.github/PULL_REQUEST_TEMPLATE.md`; `.husky/pre-commit`
- `tests/helpers/lifecycle-mocks.ts`; `src/gateway/lib/prisma-helpers.ts`
- `src/workers/lib/postgrest-types.ts`; `src/inngest/events.ts`
- `src/worker-tools/lib/require-env.ts` — extended with `optionalEnv()`
- `src/inngest/lifecycle/steps/` — 4 new extracted step files

### Definition of Done

- [ ] `pnpm build && pnpm lint && pnpm test && pnpm test:integration` ALL green (0 failures)
- [ ] Unit suite (`pnpm test`) runs in seconds, parallelized
- [ ] `employee-lifecycle.ts` under 500 lines
- [ ] Zero `eslint-disable @typescript-eslint/no-explicit-any` in non-deprecated files
- [ ] All 29 route files use `sendError`
- [ ] All worker tools use `requireEnv`/`optionalEnv`/`getArg` where applicable
- [ ] New contributor can follow guide to run full stack (verified via QA scenario)

### Must Have

- A 100%-green baseline before any Wave-1 task starts (Wave 0 gates everything)
- Fast parallel unit suite + isolated DB integration suite
- PR template + pre-commit hooks + contributor guide + architecture diagram
- Typed PostgREST client; lifecycle under 500 lines; `sendError` universal adoption

### Must NOT Have (Guardrails)

- Do NOT decompose dashboard files (separate plan)
- Do NOT change any runtime behavior — all changes structural/typing only (Wave 0 fixes tests to match SHIPPED behavior; if a test exposes a real prod BUG, record it as a new finding, don't silently "fix" the test to hide it)
- Do NOT use `requireEnv` for optional environment variables (use `optionalEnv`)
- Do NOT use `getArg` for boolean flags (use `args.includes()`)
- Do NOT touch deprecated files (listed in AGENTS.md — `orchestrate.mts`, `lifecycle.ts`, `redispatch.ts`, `watchdog.ts`, the 25 deprecated `src/workers/lib/*`, etc.)
- Do NOT modify `employee-lifecycle.ts` public API or step IDs — only extract internal steps
- Do NOT add path aliases (`@/`) — stay consistent with existing relative imports
- Do NOT rename `log` to `logger` or vice versa — document the convention instead
- Do NOT break existing tests — every task keeps `pnpm test` + `pnpm test:integration` green; a change that alters test outcomes (other than Wave 0's deliberate fixes) is a regression
- Do NOT change any worker-tool output JSON shape, the `/tmp/summary.txt`+`/tmp/approval-message.json` output contract, or `unescapeShellArg` wrappers
- Do NOT re-migrate the 5 already-migrated worker tools (`hostfully/get-property.ts`, `google/google-fetch.ts`, `jira/get-issue.ts`, `knowledge_base/search.ts`, `slack/read-channels.ts`)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Modeled on `.sisyphus/plans/2026-06-05-0111-maintainability-remediation.md`: every task gates on an assigned tier, every wave ends with a checkpoint, and nothing ships on build+unit-tests alone.

### Test Decision

- **Infrastructure exists**: YES (171 test files, Vitest + global Postgres setup at `tests/helpers/global-setup.ts`)
- **Automated tests**: Wave 0 makes the suite green and splits it; later waves keep both suites green; NEW unit tests for new shared modules (`prisma-helpers.ts`, `postgrest-types.ts` generic client, `events.ts`, `optionalEnv`, `lifecycle-mocks.ts`)
- **Framework**: vitest. After Wave 0: `pnpm test` = fast parallel unit suite; `pnpm test:integration` = DB-backed suite (keeps `globalSetup` + single-fork or DB isolation)
- **Coverage**: `test:coverage` script ALREADY EXISTS (package.json:20) — do not re-add

### E2E VERIFICATION PROTOCOL (MANDATORY — runs after EVERY task)

> Every task has an assigned tier (see **Verification Tier Map**). A task is **NOT complete** until its tier passes and evidence is captured in `.sisyphus/evidence/task-{N}-{slug}.{ext}`. If a gate fails, STOP — fix or revert before the next task.
>
> **Prerequisites (confirm once at session start)**: `pnpm dev` running; `curl localhost:7700/health` OK; Inngest `curl localhost:8288/health` OK; Slack Socket Mode connected (`tail /tmp/ai-dev.log | grep "Socket Mode"`); single gateway (`pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` → `1`); worker Docker image built; **test DB present** (`pnpm test:db:setup`).

**Tier S — Smoke (non-runtime changes: docs, lint, config, package.json, PR template, husky, diagrams, test-only changes)**

1. `pnpm build` → clean compile.
2. `pnpm test` (unit) → 0 failures, runs in seconds.
3. `pnpm lint` → exit 0.
4. For Wave 0 / test-infra tasks: `pnpm test:integration` → 0 failures.
5. Task-specific assertion (file exists, grep proves the change). Evidence captured.

**Tier A — Fast runtime smoke (runtime changes NOT on the approval/guest path)**

1. Run Tier S first.
2. **Rebuild worker image** if `src/workers/` changed (`src/worker-tools/` is bind-mounted — no rebuild for tool-only changes).
3. **Trigger** `real-estate-motivation-bot-2` (VLRE, `approval_required: false`):
   ```bash
   source .env
   curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot-2/trigger" \
     -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{}' | jq '{task_id, status_url}'
   ```
4. **Wait ~90s**, verify `Done` (psql) + `task_metrics` row (psql AND PostgREST `localhost:54331`).
5. **Confirm Slack** post landed.
6. Evidence: `.sisyphus/evidence/task-{N}-tierA-{db,slack}.{txt,png}`.

**Tier B — Full approval / real-guest loop (lifecycle approval, Slack handlers, approval cards, harness delivery, or guest path)**

1. Run Tier A first.
2. Trigger an `approval_required: true` employee (wizard motivational employee, model `deepseek/deepseek-v4-flash`) OR simulate the guest-messaging Hostfully webhook (README curl).
3. Watch `task_status_log` → `Reviewing`; confirm approval card posts in Slack with working buttons.
4. Approve in Slack (or manual approval-event fallback). Confirm `Done` + `pending_approvals` resolved + delivery posted — psql AND PostgREST.
5. Evidence: `.sisyphus/evidence/task-{N}-tierB-{statuslog,slack-card,slack-approve,db}.{txt,png}`.

### QA Policy

- **PostgREST verification**: the typed PostgREST client (Task 8) must round-trip a real read against `localhost:54331` (not just psql).
- **CLI worker tools**: run the migrated tool with `--help` (exit 0) + one real arg; assert JSON shape unchanged vs pre-migration.
- Evidence → `.sisyphus/evidence/task-{N}-{slug}.{ext}` for every task, always.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Stabilize Baseline — MUST be 100% green before ANY other wave):
├── Task 0.1: Fix Slack mock .use() regression — 4 test files (~18 failures) [deep]
├── Task 0.2: Fix drifted Slack copy assertions — ~12 failures [unspecified-high]
├── Task 0.3: Fix call-llm cost-from-catalog test mocks — ~4 failures [quick]
├── Task 0.4: Fix seed.ts GUEST_MESSAGING_AGENTS_MD reference — 2 failures [quick]
├── Task 0.5: Fix lifecycle spy/feedback-injection regressions — ~17 failures [deep]
├── Task 0.6: Remove archived migrate-vlre-kb test + fix process.exit leaks [quick]
├── Task 0.7: Split suites into tests/unit/ + tests/integration/ (directory move) [deep]
└── Task 0.8: Wire pnpm test (unit) + test:integration + CI/husky [deep]
  ↳ CHECKPOINT W0: build + lint + `pnpm test` (unit) + `pnpm test:integration` ALL green, 0 failures; unit suite runs in seconds. GATES EVERYTHING.

Wave 1 (Foundation — shared helpers + infrastructure):
├── Task 1: Extract shared gateway helpers (isPrismaError, sendError types) [quick]
├── Task 2: Create new contributor setup guide [writing]
├── Task 3: Add PR template + husky + lint-staged [quick]
├── Task 4: Add test convenience scripts to package.json [quick]
├── Task 5: Create current architecture diagram [writing]
├── Task 6: Remove tenant-env barrel re-export [quick]
└── Task 7: Add optionalEnv() to worker-tools shared lib [quick]
  ↳ CHECKPOINT W1: build/test/lint green; PR template + husky present; husky pre-commit fires on a staged lint error.

Wave 2 (Type safety + test factory — depends on Wave 1 helpers):
├── Task 8: Typed PostgREST client with generics (depends: 1) [deep]
├── Task 9: Inngest typed event schemas (depends: 1) [deep]
├── Task 10: Create lifecycle test mock factory (depends: 9) [unspecified-high]
├── Task 11: Fix raw pino() + base64url duplication (depends: 1) [quick]
├── Task 12: Fix _resetCacheForTest leak + ClassifyResult fields [quick]
└── Task 13: ESLint escalation — warn→error + fix violations (depends: 9) [unspecified-high]
  ↳ CHECKPOINT W2: build/test/lint green; typed PostgREST round-trips a real read; lint zero-warning.

Wave 3 (Pattern unification — depends on Wave 2 type safety):
├── Task 14: Lifecycle decomposition — extract state handlers (depends: 8, 9) [deep]
├── Task 15: sendError adoption — route group 1 (11 admin files, ~137 calls) (depends: 1) [unspecified-high]
├── Task 16: sendError adoption — route group 2 (17 oauth/internal files, ~142 calls) (depends: 1) [unspecified-high]
├── Task 17: Standardize error format + route factory signatures (depends: 15, 16) [quick]
├── Task 18: Centralize process.env reads in 7 inngest files (depends: 9) [unspecified-high]
└── Task 19: Fix Knip unused exports (depends: 9, 13) [quick]
  ↳ CHECKPOINT W3: build/test/lint green; employee-lifecycle.ts < 500 lines; zero res.status() in routes; Tier A + Tier B pass.

Wave 4 (Worker tools migration — depends on Task 7. 54 files; 5 already done — SKIP get-property.ts, google-fetch.ts, get-issue.ts, search.ts, read-channels.ts):
├── Task 20: Migrate hostfully/ — 10 files (depends: 7) [unspecified-high]
├── Task 21: Migrate google/ — 19 files (depends: 7) [unspecified-high]
├── Task 22: Migrate sifely(9)+jira(5)+notion(5) — 19 files (depends: 7) [unspecified-high]
├── Task 23: Migrate platform(3)+github(1) — 4 files (depends: 7) [quick]
├── Task 24: Migrate slack/post-message.ts — high-risk (depends: 7) [deep]
├── Task 25: Migrate slack/post-guest-approval.ts — highest-risk (depends: 7) [deep]
└── Task 26: Document worker-tools local install requirement [quick]
  ↳ CHECKPOINT W4: build/test/lint green; ≥3 migrated tools' --help exit 0; tests/worker-tools green; Tier A pass.

Wave 5 (Documentation + logger convention):
├── Task 27: Document log vs logger convention [quick]
├── Task 28: Update AGENTS.md with new components + conventions [quick]
└── Task 29: Send Telegram notification [quick]
  ↳ CHECKPOINT W5: docs reference all new modules; AGENTS.md + CONTRIBUTING.md current.

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA — Tier A + Tier B (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Wave 0 → Task 1 → Task 8 + 9 → Task 14 → Tier B → F1-F4 → user okay
```

### Dependency Matrix

| Task    | Depends On            | Blocks             | Wave |
| ------- | --------------------- | ------------------ | ---- |
| 0.1–0.6 | —                     | 0.7                | 0    |
| 0.7     | 0.1–0.6 (green tests) | 0.8                | 0    |
| 0.8     | 0.7                   | ALL Wave 1+        | 0    |
| 1       | W0 green              | 8, 9, 11, 15, 16   | 1    |
| 2–6     | W0 green              | —                  | 1    |
| 7       | W0 green              | 20–25              | 1    |
| 8       | 1                     | 14                 | 2    |
| 9       | 1                     | 10, 13, 14, 18, 19 | 2    |
| 10      | 9                     | —                  | 2    |
| 11      | 1                     | —                  | 2    |
| 12      | W0 green              | —                  | 2    |
| 13      | 9                     | 19                 | 2    |
| 14      | 8, 9                  | —                  | 3    |
| 15, 16  | 1                     | 17                 | 3    |
| 17      | 15, 16                | —                  | 3    |
| 18      | 9                     | —                  | 3    |
| 19      | 9, 13                 | —                  | 3    |
| 20–25   | 7                     | —                  | 4    |
| 26      | —                     | —                  | 4    |
| 27–29   | —                     | —                  | 5    |

### Agent Dispatch Summary

- **Wave 0**: 8 tasks — T0.1→`deep`, T0.2→`unspecified-high`, T0.3→`quick`, T0.4→`quick`, T0.5→`deep`, T0.6→`quick`, T0.7→`deep`, T0.8→`deep`
- **Wave 1**: 7 tasks — T1→`quick`, T2→`writing`, T3→`quick`, T4→`quick`, T5→`writing`, T6→`quick`, T7→`quick`
- **Wave 2**: 6 tasks — T8→`deep`, T9→`deep`, T10→`unspecified-high`, T11→`quick`, T12→`quick`, T13→`unspecified-high`
- **Wave 3**: 6 tasks — T14→`deep`, T15→`unspecified-high`, T16→`unspecified-high`, T17→`quick`, T18→`unspecified-high`, T19→`quick`
- **Wave 4**: 7 tasks — T20→`unspecified-high`, T21→`unspecified-high`, T22→`unspecified-high`, T23→`quick`, T24→`deep`, T25→`deep`, T26→`quick`
- **Wave 5**: 3 tasks — T27→`quick`, T28→`quick`, T29→`quick`
- **FINAL**: 4 tasks — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

### Verification Tier Map

| Task                      | Tier             | Task                        | Tier          | Task                      | Tier  |
| ------------------------- | ---------------- | --------------------------- | ------------- | ------------------------- | ----- |
| 0.1 Slack mock .use()     | S (+integration) | 8 Typed PostgREST           | A + PostgREST | 18 Centralize inngest env | A     |
| 0.2 Slack copy            | S                | 9 Inngest events            | A             | 19 Knip exports           | S     |
| 0.3 call-llm cost         | S                | 10 Mock factory             | S             | 20 hostfully tools        | A     |
| 0.4 seed const            | S                | 11 pino/base64url           | S             | 21 google tools           | A     |
| 0.5 lifecycle spies       | S (+integration) | 12 test-leak+ClassifyResult | A             | 22 sifely/jira/notion     | A     |
| 0.6 archived test + exits | S                | 13 ESLint escalation        | S             | 23 platform/github        | A     |
| 0.7 suite split           | S (+integration) | 14 Lifecycle decomp         | **B**         | 24 post-message.ts        | A     |
| 0.8 scripts/CI/husky      | S (+integration) | 15 sendError grp 1          | A             | 25 post-guest-approval    | **B** |
| 1 Shared helpers          | S                | 16 sendError grp 2          | A             | 26 worker-tools doc       | S     |
| 2 Contributor guide       | S                | 17 Error format             | A             | 27 logger doc             | S     |
| 3 PR template + husky     | S                |                             |               | 28 AGENTS.md              | S     |
| 4 Test scripts            | S                |                             |               | 29 Telegram               | S     |
| 5 Arch diagram            | S                |                             |               |                           |       |
| 6 tenant-env barrel       | S                |                             |               |                           |       |
| 7 optionalEnv             | S                |                             |               |                           |       |

> **Rule**: Tier S = build/test/lint (+ task-specific assertion; Wave-0/test-infra tasks also run `pnpm test:integration`). Tier A = Tier S + real trigger of `real-estate-motivation-bot-2` → Done + DB(psql&PostgREST) + Slack. Tier B = Tier A + full approval→delivery loop. Every gate captures evidence.

---

## TODOs

### WAVE 0 — Stabilize Baseline (MUST reach 100% green before any other wave)

> **Guardrail for ALL of Wave 0**: fix tests to match the SHIPPED production behavior. If a failing test reveals a genuine production BUG (not just drifted text/mocks), STOP and record it as a new finding — do NOT edit the test to hide a real defect. Re-grep line numbers before editing; PR #7 moved things.

- [ ] 0.1. Fix Slack mock `.use()` regression (~18 failures)

  **What to do**:
  - **ROOT CAUSE (verified)**: `src/gateway/slack/handlers/event-handlers.ts:17` calls `boltApp.use(async ({ body, next }) => {...})` (a global middleware registered during `registerSlackHandlers`). The test mock `boltApp` objects do NOT implement `.use`, so every test that calls `registerSlackHandlers(mockBoltApp, ...)` throws `TypeError: boltApp.use is not a function`.
  - Add a `use: vi.fn()` (capturing the middleware if a test needs it, else a no-op) to the mock `boltApp` factory in each affected test file:
    - `tests/gateway/slack/override-handler.test.ts` (mock at ~line 25, `makeMockBoltApp`)
    - `tests/gateway/slack/rule-handlers.test.ts`
    - `tests/inngest/slack-trigger-handler.test.ts`
    - `tests/inngest/slack-input-collector.test.ts`
  - Re-grep for ALL `boltApp.use is not a function` occurrences (`grep -rln "_getAction\|makeMockBoltApp\|registerSlackHandlers" tests/`) — fix every mock factory, not just these 4.

  **Must NOT do**:
  - Do NOT change `event-handlers.ts` — the `.use()` middleware is shipped, correct production behavior; the TESTS are stale
  - Do NOT remove the global middleware to make tests pass

  **Recommended Agent Profile**: Category `deep`; Skills: [] (mock infra knowledge)

  **Parallelization**: Wave 0. Blocks: 0.7. Blocked By: none.

  **References**:
  - `src/gateway/slack/handlers/event-handlers.ts:17` — the `boltApp.use(...)` call
  - `tests/gateway/slack/override-handler.test.ts:25` — `makeMockBoltApp` factory (add `use`)
  - existing mock pattern: the same files' `action`/`view`/`command` mock fns

  **Acceptance Criteria** (Tier S + integration):
  - [ ] `grep -rl "boltApp.use is not a function" /tmp/*.log` after re-run → none
  - [ ] `pnpm test tests/gateway/slack/override-handler.test.ts tests/gateway/slack/rule-handlers.test.ts` → green
  - [ ] `pnpm build` clean

  **QA Scenarios**:

  ```
  Scenario: Slack handler tests no longer crash on .use
    Tool: Bash
    Steps:
      1. grep mock factories for "use:" — present in all 4 files
      2. pnpm test -- --run tests/gateway/slack tests/inngest/slack-trigger-handler.test.ts tests/inngest/slack-input-collector.test.ts
      3. Confirm 0 "is not a function" errors
    Expected Result: All Slack-handler tests pass
    Evidence: .sisyphus/evidence/task-0.1-slack-mock.txt
  ```

  **Commit**: YES — `test(slack): add use() to mock boltApp factories to match shipped middleware`

- [ ] 0.2. Fix drifted Slack copy assertions (~12 failures)

  **What to do**:
  - **ROOT CAUSE (verified)**: PR #7's copy-unification changed user-facing Slack strings, but assertions still expect the old text. Update each assertion to the CURRENT shipped copy (read the production source of truth — `src/lib/slack-copy.ts`, `src/lib/slack-blocks.ts`, `src/inngest/lib/reminder-blocks.ts` — and match exactly):
    - `tests/inngest/lib/reminder-blocks.test.ts` — expects `'Jane Doe'`/`'Bob'`; actual enriched output uses different names/format
    - `tests/inngest/lifecycle-enriched-notify.test.ts` — expects `'Jane Smith'` in the drafted-notify text
    - `tests/inngest/slack-trigger-handler.test.ts` — expects `'Trigger Guest Messaging?'`; actual is `'Want me to get *Guest Messaging* started?'`
    - any other "expected ... to contain/to be" copy mismatches in the log
  - For each: open the PRODUCTION builder, copy the real current string/shape, update the test expectation. Confirm the test data (names like "Alice Smith — Beach House") matches what the builder is actually given.

  **Must NOT do**:
  - Do NOT change production copy to satisfy old tests — the new copy is intentional (Slack Voice & Tone work)
  - Do NOT weaken assertions to `expect.anything()` — assert the real current text

  **Recommended Agent Profile**: Category `unspecified-high`; Skills: []

  **Parallelization**: Wave 0. Blocks: 0.7. Blocked By: none.

  **References**:
  - `src/lib/slack-copy.ts` — centralized trigger/confirm copy (source of truth)
  - `src/inngest/lib/reminder-blocks.ts` — reminder block builder
  - `src/lib/slack-blocks.ts` — enriched notify/terminal builders
  - failing files listed above

  **Acceptance Criteria** (Tier S):
  - [ ] `pnpm test -- --run tests/inngest/lib/reminder-blocks.test.ts tests/inngest/lifecycle-enriched-notify.test.ts tests/inngest/slack-trigger-handler.test.ts` → green
  - [ ] Each updated assertion matches a string actually produced by the current builder (spot-verify)

  **QA Scenarios**:

  ```
  Scenario: Copy assertions match shipped strings
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/inngest/lib/reminder-blocks.test.ts tests/inngest/lifecycle-enriched-notify.test.ts tests/inngest/slack-trigger-handler.test.ts
      2. Confirm 0 "Object.is equality" / "to contain" copy failures
    Expected Result: All copy assertions pass against current production text
    Evidence: .sisyphus/evidence/task-0.2-slack-copy.txt
  ```

  **Commit**: YES — `test(slack): update copy assertions to match unified Slack voice strings`

- [ ] 0.3. Fix call-llm cost-from-catalog test mocks (~4 failures)

  **What to do**:
  - **ROOT CAUSE (verified)**: PR #7 (SMELL-4) changed `src/lib/call-llm.ts` to compute cost from the `model_catalog` DB table instead of a hardcoded map. The unit tests (`tests/lib/call-llm.test.ts:105,266`) don't provide catalog pricing, so `estimatedCostUsd` is 0 (`expected 0 to be greater than 0`; `expected +0 to be close to 0.000085`).
  - Read how `call-llm.ts` now looks up pricing (which function/table column) and mock it in the test: stub the catalog lookup to return `input_cost_per_million`/`output_cost_per_million` for the tested models (`minimax/minimax-m2.7` etc.), so the cost math produces the expected `0.000085`.
  - If this test needs DB access to the catalog, it becomes an INTEGRATION test (moves to `tests/integration/` in Task 0.7) — decide based on whether `call-llm.ts` reads the catalog via Prisma/PostgREST or via an injectable function. Prefer mocking the lookup to keep it a fast unit test.

  **Must NOT do**:
  - Do NOT revert the catalog-based pricing (it's the correct SMELL-4 fix)
  - Do NOT hardcode `estimatedCostUsd` in the assertion — mock the inputs and let the real math run

  **Recommended Agent Profile**: Category `quick`; Skills: []

  **Parallelization**: Wave 0. Blocks: 0.7. Blocked By: none.

  **References**:
  - `src/lib/call-llm.ts:33-36,88,258` — pricing lookup (re-grep; the hardcoded `PRICING_PER_1M_TOKENS` was replaced)
  - `tests/lib/call-llm.test.ts:105,266` — failing assertions
  - `prisma/schema.prisma` `ModelCatalog` — `input_cost_per_million`/`output_cost_per_million` columns

  **Acceptance Criteria** (Tier S):
  - [ ] `pnpm test -- --run tests/lib/call-llm.test.ts` → green
  - [ ] The cost assertion passes via mocked catalog pricing, not a weakened expectation

  **QA Scenarios**:

  ```
  Scenario: call-llm cost computed from mocked catalog
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/lib/call-llm.test.ts
      2. Confirm estimatedCostUsd assertions pass (0.000085 close-to)
    Expected Result: call-llm tests green
    Evidence: .sisyphus/evidence/task-0.3-call-llm.txt
  ```

  **Commit**: YES — `test(call-llm): mock model_catalog pricing so cost assertions pass`

- [ ] 0.4. Fix seed.ts `GUEST_MESSAGING_AGENTS_MD` reference (2 failures)

  **What to do**:
  - **ROOT CAUSE (verified)**: `tests/lib/conversation-history-context.test.ts:6-9` reads `prisma/seed.ts` and regex-matches `const GUEST_MESSAGING_AGENTS_MD = \`...\``. PR #7 removed that const (seed.ts now only has `const PLATFORM_AGENTS_MD`). The test throws `GUEST_MESSAGING_AGENTS_MD not found in seed.ts`.
  - Determine where the guest-messaging AGENTS.md content lives NOW (it likely moved to an archetype `identity`/`execution_steps` field, the archetype generator, or a fixture). Update the test to read the CURRENT source of truth.
  - If guest-messaging AGENTS.md content is no longer a static seed const at all (now DB/archetype-driven), this test's premise is obsolete — convert it to read the actual current artifact, or if the behavior it guards (conversation-history context instructions) is now covered elsewhere, mark it obsolete and remove with a one-line justification. Prefer repointing over deletion if the guarded behavior still exists.

  **Must NOT do**:
  - Do NOT re-add `GUEST_MESSAGING_AGENTS_MD` to seed.ts just to satisfy the test
  - Do NOT delete the test without confirming the guarded behavior is covered or obsolete

  **Recommended Agent Profile**: Category `quick`; Skills: []

  **Parallelization**: Wave 0. Blocks: 0.7. Blocked By: none.

  **References**:
  - `tests/lib/conversation-history-context.test.ts:6-9` — the broken seed grep
  - `prisma/seed.ts` — now has `PLATFORM_AGENTS_MD` only (verify with `grep "AGENTS_MD" prisma/seed.ts`)
  - guest-messaging archetype source (DB seed row / `src/gateway/services/archetype-generator.ts`) — where the content moved

  **Acceptance Criteria** (Tier S):
  - [ ] `pnpm test -- --run tests/lib/conversation-history-context.test.ts` → green
  - [ ] Test reads a real current source (or is justified-removed if obsolete)

  **QA Scenarios**:

  ```
  Scenario: conversation-history-context test repointed
    Tool: Bash
    Steps:
      1. grep "AGENTS_MD" prisma/seed.ts (confirm what exists now)
      2. pnpm test -- --run tests/lib/conversation-history-context.test.ts
    Expected Result: Test green against current source of truth
    Evidence: .sisyphus/evidence/task-0.4-seed-const.txt
  ```

  **Commit**: YES — `test(conversation-history): repoint at current guest-messaging AGENTS.md source`

- [ ] 0.5. Fix lifecycle spy / feedback-injection regressions (~17 failures)

  **What to do**:
  - **ROOT CAUSE**: handler wiring changed in PR #7; mocks/expectations are stale. Failures are `expected "spy" to be called once, but got 0 times` (and one `to not be called ... called 1 times`). Affected files:
    - `tests/inngest/feedback-injection.test.ts`
    - `tests/inngest/lifecycle-feedback-context-rejection.test.ts`
    - `tests/inngest/lifecycle-notify-msg-ts.test.ts`
    - `tests/inngest/employee-lifecycle-delivery.test.ts` (5 failures — also one of the SLOWEST at 3,556ms)
    - `tests/inngest/slack-input-collector.test.ts` (the "not be called" case)
  - For each: trace what the spy targets (which function/step the production code now calls or no longer calls). Update the mock setup / expectation to match the CURRENT call graph. Where a step was renamed or moved (e.g. into `lifecycle/steps/`), point the spy at the new location.
  - These touch the live lifecycle — several are real-DB or heavy. Note which are integration (move to `tests/integration/` in Task 0.7) vs unit.

  **Must NOT do**:
  - Do NOT change lifecycle production code to satisfy a stale spy — match tests to shipped wiring
  - Do NOT delete assertions; re-point them

  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`]

  **Parallelization**: Wave 0. Blocks: 0.7. Blocked By: none.

  **References**:
  - `src/inngest/employee-lifecycle.ts` + `src/inngest/lifecycle/steps/` — current call graph
  - `src/inngest/interaction-handler.ts` / feedback pipeline — for feedback-injection spies
  - the 5 failing test files listed above

  **Acceptance Criteria** (Tier S + integration):
  - [ ] `pnpm test -- --run tests/inngest/feedback-injection.test.ts tests/inngest/lifecycle-feedback-context-rejection.test.ts tests/inngest/lifecycle-notify-msg-ts.test.ts tests/inngest/employee-lifecycle-delivery.test.ts tests/inngest/slack-input-collector.test.ts` → green
  - [ ] Each spy targets a function the production code actually calls now

  **QA Scenarios**:

  ```
  Scenario: lifecycle spies match current wiring
    Tool: Bash
    Steps:
      1. pnpm test -- --run tests/inngest/feedback-injection.test.ts tests/inngest/lifecycle-feedback-context-rejection.test.ts tests/inngest/lifecycle-notify-msg-ts.test.ts tests/inngest/employee-lifecycle-delivery.test.ts tests/inngest/slack-input-collector.test.ts
      2. Confirm 0 "spy ... 0 times" failures
    Expected Result: All lifecycle spy tests pass
    Evidence: .sisyphus/evidence/task-0.5-lifecycle-spies.txt
  ```

  **Commit**: YES — `test(lifecycle): repoint feedback/notify spies at current handler wiring`

- [ ] 0.6. Remove archived `migrate-vlre-kb` test + fix `process.exit` leaks

  **What to do**:
  - **migrate-vlre-kb**: `tests/scripts/migrate-vlre-kb.test.ts:8` points at `scripts/migrate-vlre-kb.ts`, which PR #7 moved to `scripts/archive/migrate-vlre-kb.ts`. Per user decision, **remove the test** (the script is a one-shot already archived; the test adds 0 ongoing value and spawns slow `npx tsx` subprocesses). `git rm tests/scripts/migrate-vlre-kb.test.ts`. Check if `tests/scripts/` has other archived-script tests with the same problem (re-grep `scripts/archive` references in `tests/`) and remove those too.
  - **process.exit leaks (2 errors)**: `Error: process.exit unexpectedly called with "1"` originates from `src/workers/opencode-harness.mts:995` and `scripts/trigger-task.ts:703` top-level `main().catch(() => process.exit(1))`. These modules get imported during test collection and their top-level `main()` runs. Fix by guarding the entrypoint so `main()` only runs when the module is executed directly, e.g. `if (import.meta.url === \`file://${process.argv[1]}\`) main().catch(...)`. This prevents the harness/script from auto-running (and exiting) when imported by a test.
  - Verify which test files import these modules (`hostfully/get-messages-lead-id.test.ts`, `schema.test.ts` per the log) and confirm the guard stops the leak.

  **Must NOT do**:
  - Do NOT change harness/script runtime behavior when run directly (the guard only affects import-time)
  - Do NOT keep the archived-script test "just in case"

  **Recommended Agent Profile**: Category `quick`; Skills: []

  **Parallelization**: Wave 0. Blocks: 0.7. Blocked By: none.

  **References**:
  - `tests/scripts/migrate-vlre-kb.test.ts` — to remove
  - `scripts/archive/migrate-vlre-kb.ts` — where the script now lives
  - `src/workers/opencode-harness.mts:995` + `scripts/trigger-task.ts:703` — `main().catch(process.exit)` entrypoints to guard
  - existing `import.meta.url` entrypoint-guard pattern in `src/worker-tools/notion/*.ts`

  **Acceptance Criteria** (Tier S):
  - [ ] `test ! -f tests/scripts/migrate-vlre-kb.test.ts`
  - [ ] `grep -c "process.exit unexpectedly" /tmp/ai-test.log` after re-run → 0
  - [ ] `pnpm test` shows 0 unhandled-rejection errors

  **QA Scenarios**:

  ```
  Scenario: No process.exit leaks, archived test gone
    Tool: Bash
    Steps:
      1. test ! -f tests/scripts/migrate-vlre-kb.test.ts && echo GONE
      2. pnpm test -- --run 2>&1 | grep -c "process.exit unexpectedly" (expect 0)
    Expected Result: Archived test removed, no exit leaks
    Evidence: .sisyphus/evidence/task-0.6-exits-archived.txt
  ```

  **Commit**: YES — `test: remove archived migrate-vlre-kb test and guard script entrypoints against import-time exit`

- [ ] 0.7. Split suites into `tests/unit/` + `tests/integration/` (directory move)

  **What to do** (do this ONLY after 0.1–0.6 make the suite green — never split a red suite):
  - **Classify all 171 test files** as unit (no DB) or integration (DB-backed). Decision rule: a file is **integration** if it imports `../setup.js`/`getPrisma`/`createTestApp`/`cleanupTestData`, OR imports `@prisma/client` to hit a real DB, OR otherwise depends on `tests/helpers/global-setup.ts`. Everything else is **unit**. (Verified baseline: ~122 unit, ~49 integration.) Generate the list with:
    ```bash
    # integration candidates:
    grep -rl "PrismaClient\|getPrisma\|createTestApp\|cleanupTestData\|setup.js" tests/ src --include="*.test.ts" --include="*.test.mts"
    ```
  - **Move files** preserving git history (`git mv`):
    - Unit tests in `tests/` → `tests/unit/...` (mirror existing subfolder structure)
    - Integration tests in `tests/` → `tests/integration/...`
    - `src/**/__tests__/*.test.ts` — leave co-located OR move per the same rule; prefer leaving pure-unit co-located tests in place and have the unit config include them (decide and document). Simplest: keep `src/**/__tests__` in the UNIT set (they're overwhelmingly pure unit) and only move `tests/` files.
  - **Fix relative imports** after moving (the `../setup.js` / `../../helpers` depths change). `pnpm build` + a test run will surface broken paths.
  - **Two vitest configs**:
    - `vitest.config.ts` (unit): `include: ['tests/unit/**/*.test.ts', 'src/**/__tests__/**/*.test.{ts,mts}']`, **NO `globalSetup`**, `pool: 'forks'` with **`singleFork: false`** (or `'threads'`) for parallelism, keep the `env` block. This is the fast suite.
    - `vitest.integration.config.ts`: `include: ['tests/integration/**/*.test.ts']`, KEEP `globalSetup: './tests/helpers/global-setup.ts'`, keep `singleFork: true` (DB safety) — or add per-file DB isolation later (out of scope).
  - **CRITICAL — fix the pre-existing `vitest.config.ts` coverage type error**: the current file has an LSP error (`'coverage' does not exist in type 'UserConfigExport'` — the `coverage` key must be nested under `test:`, not at the root). Move `coverage` inside `test:` in the new unit config. This is a latent config bug; fixing it is part of this task.
  - **Move any heavy/subprocess tests into integration** even if they don't touch the DB (e.g. `get-messages.test.ts` at 5,950ms spawns subprocesses) so the unit suite stays fast. Document the heuristic: unit = pure, fast, in-process; integration = DB/subprocess/slow.

  **Must NOT do**:
  - Do NOT split while the suite is red (0.1–0.6 must be green first)
  - Do NOT lose git history — use `git mv`
  - Do NOT delete `tests/helpers/global-setup.ts` — the integration config still needs it
  - Do NOT change test ASSERTIONS during the move — pure relocation + config

  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`]

  **Parallelization**: Wave 0. Blocks: 0.8. Blocked By: 0.1–0.6 (green suite).

  **References**:
  - `vitest.config.ts` — current single config (also has the latent coverage-key type bug)
  - `tests/helpers/global-setup.ts` — DB migrate+seed (integration only)
  - `tests/setup.ts` — `createTestApp`/`getPrisma`/`cleanupTestData` (integration marker)
  - baseline classification: ~122 unit / ~49 integration

  **Acceptance Criteria** (Tier S + integration):
  - [ ] `tests/unit/` and `tests/integration/` exist with files moved via `git mv` (history preserved)
  - [ ] `vitest.config.ts` has NO `globalSetup`, parallel pool, and `coverage` nested under `test:` (LSP error gone)
  - [ ] `vitest.integration.config.ts` exists with `globalSetup` + integration include
  - [ ] `pnpm vitest run --config vitest.config.ts` → green, runs in SECONDS (parallel)
  - [ ] `pnpm vitest run --config vitest.integration.config.ts` → green
  - [ ] `pnpm build` clean (no broken import paths)

  **QA Scenarios**:

  ```
  Scenario: Suites split, unit fast, both green
    Tool: Bash
    Steps:
      1. ls tests/unit tests/integration (both populated)
      2. git log --follow on a moved file shows history preserved
      3. time pnpm vitest run --config vitest.config.ts (green, << 117s, ideally <20s)
      4. pnpm vitest run --config vitest.integration.config.ts (green)
    Expected Result: Two green suites; unit suite dramatically faster
    Evidence: .sisyphus/evidence/task-0.7-split-{unit,integration,timing}.txt
  ```

  **Commit**: YES — `test: split into fast unit suite and isolated integration suite`

- [ ] 0.8. Wire `pnpm test` (unit) + `test:integration` + update CI/husky

  **What to do**:
  - **package.json scripts**:
    - `"test": "vitest --config vitest.config.ts"` (unit; watch by default like before)
    - `"test:unit": "vitest run --config vitest.config.ts"` (explicit one-shot)
    - `"test:integration": "vitest run --config vitest.integration.config.ts"`
    - keep `"test:coverage"` but point it at the unit config (or a combined coverage config — document the choice)
    - `"test:all": "pnpm test:unit && pnpm test:integration"` (convenience)
    - Preserve the existing `pnpm test -- --run` invocation used across docs/AGENTS.md — `vitest --config ... ` + `-- --run` still works (run-once). Verify `pnpm test -- --run` runs the UNIT suite one-shot.
  - **CI (`.github/workflows/deploy.yml`)**: the `test` job currently runs `pnpm test -- --run` against the test DB. Update it to run BOTH: `pnpm test:unit` (fast, no DB needed — can drop the postgres service for a unit-only job OR keep one job) then `pnpm test:integration` (needs the postgres service + `pnpm test:db:setup`). Keep `pnpm lint`. Ensure `DATABASE_URL` is set for the integration step. Document whether unit runs without the DB service (faster CI).
  - **husky pre-commit (added in Wave 1 Task 3)**: ensure `lint-staged` runs ESLint only (fast). Do NOT run integration tests on pre-commit. (Optionally run `pnpm test:unit` on pre-push — note it but Task 3 owns husky.)
  - **Docs**: update AGENTS.md + CONTRIBUTING.md references from "`pnpm test` runs everything" to the new split (the `pnpm test -- --run` smoke instruction now = unit suite; integration is separate). This overlaps Task 28 — do the minimal correction here, full doc pass in Task 28.

  **Must NOT do**:
  - Do NOT make `pnpm test` (the husky/CI default) run the slow integration suite
  - Do NOT drop integration tests from CI — they must run, just in a separate step/job
  - Do NOT break the `pnpm test -- --run` invocation referenced throughout docs

  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`]

  **Parallelization**: Wave 0 (final task). Blocks: ALL Wave 1+. Blocked By: 0.7.

  **References**:
  - `package.json:19-20,33` — current `test`, `test:coverage`, `test:db:setup`
  - `.github/workflows/deploy.yml` — `test` job (`pnpm test -- --run`, `pnpm test:db:setup`, postgres service)
  - AGENTS.md "Commands" table + "Pre-existing Test Failures" + the `pnpm test -- --run` smoke references

  **Acceptance Criteria** (Tier S + integration):
  - [ ] `pnpm test:unit` and `pnpm test:integration` both exist and pass
  - [ ] `pnpm test -- --run` runs the UNIT suite one-shot (green, fast)
  - [ ] CI `deploy.yml` runs unit + integration + lint (all green); integration step has the postgres service + `test:db:setup`
  - [ ] `pnpm build` clean

  **QA Scenarios**:

  ```
  Scenario: Split scripts + CI wired
    Tool: Bash
    Steps:
      1. pnpm test:unit (green, seconds)
      2. pnpm test:integration (green)
      3. pnpm test -- --run (runs unit one-shot, green)
      4. grep "test:integration\|test:unit" .github/workflows/deploy.yml
    Expected Result: Both suites green, CI runs both, default is fast unit
    Evidence: .sisyphus/evidence/task-0.8-scripts-ci.txt
  ```

  > **CHECKPOINT W0 (MANDATORY GATE)**: `pnpm build` + `pnpm lint` + `pnpm test` (unit) + `pnpm test:integration` ALL green, **0 failures**, unit suite in seconds. Capture evidence. **No Wave 1 task may begin until this checkpoint is green.**

  **Commit**: YES — `ci: run split unit/integration suites; default pnpm test = fast unit`

### WAVE 1 — Foundation (shared helpers + infrastructure)

- [ ] 1. Extract shared gateway helpers

  **What to do**:
  - Create `src/gateway/lib/prisma-helpers.ts` with `isPrismaError(err: unknown): err is { code: string; meta?: Record<string, unknown> }` — extracted from the duplicate implementations at `admin-archetypes.ts:17` and `admin-model-catalog.ts:10` (both verified to exist).
  - Ensure `sendError` in `src/gateway/lib/http-response.ts:3` has clear JSDoc for the standard error body: `{ error: string, message?: string, issues?: ZodIssue[] }`.
  - Define standard error-code constants: `INVALID_ID`, `INVALID_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`, `UNAUTHORIZED`.
  - Delete the local `isPrismaError` from both route files; import from the shared module.

  **Must NOT do**: Do NOT change route handler behavior; do NOT add error codes beyond what's used.

  **Recommended Agent Profile**: Category `quick`; Skills: [].

  **Parallelization**: Wave 1. Blocks: 8, 9, 11, 15, 16. Blocked By: W0 green.

  **References**:
  - `src/gateway/routes/admin-archetypes.ts:17`; `src/gateway/routes/admin-model-catalog.ts:10` (dup `isPrismaError`)
  - `src/gateway/lib/http-response.ts:3` (`sendError`)

  **Acceptance Criteria** (Tier S):
  - [ ] `src/gateway/lib/prisma-helpers.ts` exports `isPrismaError`; both route files import it (zero local defs)
  - [ ] `pnpm build` + `pnpm test` pass

  **QA Scenarios**:

  ```
  Scenario: Shared helper exported and imported
    Tool: Bash
    Steps:
      1. grep -c "function isPrismaError" src/gateway/routes/admin-archetypes.ts src/gateway/routes/admin-model-catalog.ts (expect 0,0)
      2. grep "prisma-helpers" src/gateway/routes/admin-archetypes.ts (import present)
      3. pnpm build && pnpm test -- --run
    Expected Result: Dedup complete, build+tests green
    Evidence: .sisyphus/evidence/task-1-shared-helpers.txt
  ```

  **Commit**: YES — `refactor(gateway): extract shared isPrismaError and standardize error codes`

- [ ] 2. Create new contributor setup guide

  **What to do**:
  - Create `docs/guides/2026-06-07-XXXX-new-contributor-setup.md` (replace XXXX with `date "+%H%M"`). Cover: (1) prerequisites (Node ≥20, pnpm, Docker), (2) `pnpm setup`, (3) personal Cloudflare Tunnel setup, (4) personal Slack dev app (link `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`), (5) env-var checklist (personal vs shared), (6) running `pnpm dev` + banner meaning, (7) common first-day issues (tunnel not found, Socket Mode, PostgREST schema cache).
  - Link from CONTRIBUTING.md "Where to Find More" table. Add a banner line to `scripts/dev.ts` startup: "📖 First time? See docs/guides/...-new-contributor-setup.md".

  **Must NOT do**: Do NOT include the repo owner's personal tunnel UUID/creds; do NOT duplicate existing guides — link them.

  **Recommended Agent Profile**: Category `writing`; Skills: [].

  **Parallelization**: Wave 1. Blocks: none. Blocked By: W0 green.

  **References**:
  - `scripts/dev.ts` (hardcoded personal tunnel config — what new contributors hit)
  - `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`; `CONTRIBUTING.md`; `.env.example`

  **Acceptance Criteria** (Tier S):
  - [ ] Guide exists in `docs/guides/`; CONTRIBUTING.md links it; covers all 7 sections; `grep -c "e160ac6d" docs/guides/*new-contributor*` → 0

  **QA Scenarios**:

  ```
  Scenario: Guide exists and is linked
    Tool: Bash
    Steps:
      1. ls docs/guides/*new-contributor*
      2. grep "new-contributor" CONTRIBUTING.md
      3. grep -c "e160ac6d" docs/guides/*new-contributor* (expect 0)
    Expected Result: File exists, linked, no personal data
    Evidence: .sisyphus/evidence/task-2-contributor-guide.txt
  ```

  **Commit**: YES — `docs: add new contributor setup guide`

- [ ] 3. Add PR template + husky + lint-staged

  **What to do**:
  - Create `.github/PULL_REQUEST_TEMPLATE.md` with a checklist: tenant-scoped queries; soft-delete only; shared files employee-agnostic; no employee-specific language in shared code; `pnpm lint` zero warnings; `pnpm test` passes; AGENTS.md updated for new routes/tools/models/employees; no hardcoded secrets.
  - `pnpm add -D husky lint-staged`; add `"prepare": "husky"`; create `.husky/pre-commit` running `pnpm lint-staged`; add `"lint-staged": { "*.{ts,tsx}": ["eslint --max-warnings 0"] }`; run `pnpm prepare`.

  **Must NOT do**: Do NOT add `--fix` to lint-staged; do NOT add prettier; do NOT run integration tests on pre-commit.

  **Recommended Agent Profile**: Category `quick`; Skills: [].

  **Parallelization**: Wave 1. Blocks: none. Blocked By: W0 green.

  **References**: `package.json`; `eslint.config.mjs`.

  **Acceptance Criteria** (Tier S):
  - [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists with checklist; `husky`+`lint-staged` in devDeps; `.husky/pre-commit` exists; `pnpm lint-staged` runs clean

  **QA Scenarios**:

  ```
  Scenario: Pre-commit hook fires on staged lint error
    Tool: Bash
    Steps:
      1. cat .husky/pre-commit (contains lint-staged)
      2. Stage a file with `const x: any = 1` and attempt commit on a throwaway branch — commit is REJECTED
      3. grep "tenant-scoped" .github/PULL_REQUEST_TEMPLATE.md
    Expected Result: Hook blocks the bad commit; template present
    Evidence: .sisyphus/evidence/task-3-husky-pr.txt
  ```

  **Commit**: YES — `feat(dx): add PR template, husky pre-commit hook, and lint-staged`

- [ ] 4. Add test convenience scripts to package.json

  **What to do**:
  - **VERIFIED**: `test:coverage` ALREADY exists (package.json:20) — do NOT re-add. Wave 0 already added `test:unit`/`test:integration`. Here, add only what's still missing for DX: `"test:file": "vitest run --config vitest.config.ts"` (usage: `pnpm test:file tests/unit/...`) and `"test:watch": "vitest --config vitest.config.ts"`.
  - Add a "Running Tests" subsection to CONTRIBUTING.md explaining: `pnpm test` (unit watch), `pnpm test -- --run` (unit one-shot, CI), `pnpm test:integration`, `pnpm test:file <path>`, `pnpm test:coverage`.

  **Must NOT do**: Do NOT re-add `test:coverage`; do NOT change the `test` script semantics set in Wave 0.

  **Recommended Agent Profile**: Category `quick`; Skills: [].

  **Parallelization**: Wave 1. Blocks: none. Blocked By: W0 green.

  **References**: `package.json` scripts; `CONTRIBUTING.md`.

  **Acceptance Criteria** (Tier S):
  - [ ] `test:file` + `test:watch` present; `pnpm test:file <one unit file>` runs only that file; CONTRIBUTING.md documents all scripts; `node -e "require('./package.json')"` valid

  **QA Scenarios**:

  ```
  Scenario: Test scripts work
    Tool: Bash
    Steps:
      1. pnpm test:file tests/unit/lib/classify-message.test.ts (runs one file)
      2. grep "test:file\|test:integration" CONTRIBUTING.md
    Expected Result: Single-file run works; docs updated
    Evidence: .sisyphus/evidence/task-4-test-scripts.txt
  ```

  **Commit**: YES — `feat(dx): add test:file and test:watch scripts`

- [ ] 5. Create current architecture diagram

  **What to do**:
  - Create `docs/architecture/CURRENT-ARCHITECTURE.md` (no timestamp — living doc). One Mermaid diagram (≤20 nodes): Gateway (Express) → Inngest → Worker (Docker/Fly) → Shell Tools → External APIs; Slack @mention trigger path; approval-gate path; OpenCodeGo routing; Dashboard via Gateway; Prisma (gateway) + PostgREST (workers). Load `v-mermaid` skill, follow its conventions. Add "Last updated" line + a Flow Walkthrough table. Link from AGENTS.md Reference Documents.

  **Must NOT do**: Do NOT include employee-specific flows; do NOT exceed 20 nodes; do NOT timestamp the filename.

  **Recommended Agent Profile**: Category `writing`; Skills: [`v-mermaid`].

  **Parallelization**: Wave 1. Blocks: none. Blocked By: W0 green.

  **References**: `docs/architecture/2026-04-14-0104-full-system-vision.md`; `docs/snapshots/2026-04-29-2255-current-system-state.md`; `AGENTS.md`; `src/gateway/server.ts`; `src/inngest/employee-lifecycle.ts`; `src/workers/opencode-harness.mts`.

  **Acceptance Criteria** (Tier S):
  - [ ] File exists; valid Mermaid block; ≤20 nodes; AGENTS.md links it; Flow Walkthrough table present

  **QA Scenarios**:

  ````
  Scenario: Diagram valid and linked
    Tool: Bash
    Steps:
      1. ls docs/architecture/CURRENT-ARCHITECTURE.md
      2. grep '```mermaid' docs/architecture/CURRENT-ARCHITECTURE.md
      3. grep "CURRENT-ARCHITECTURE" AGENTS.md
    Expected Result: Exists, has diagram, linked
    Evidence: .sisyphus/evidence/task-5-arch-diagram.txt
  ````

  **Commit**: YES — `docs: add current architecture diagram as living reference`

- [ ] 6. Remove tenant-env barrel re-export

  **What to do**:
  - **VERIFIED**: `scripts/` one-shots are ALREADY archived — do NOT touch `scripts/`. Delete `src/inngest/lib/tenant-env.ts` (3-line barrel re-exporting `loadTenantEnv`, `TenantRepository`, `TenantSecretRepository`).
  - **VERIFIED importers (exactly 2)** — rewrite to import directly from `../../gateway/services/`:
    - `src/inngest/employee-lifecycle.ts:15` (`from './lib/tenant-env.js'`)
    - `src/inngest/lifecycle/steps/approval-handler.ts:14` (`from '../../lib/tenant-env.js'`)
  - Replace each with three direct imports from `tenant-env-loader.js`, `tenant-repository.js`, `tenant-secret-repository.js` (mind relative depth).

  **Must NOT do**: Do NOT touch `scripts/`; do NOT change the three services' behavior.

  **Recommended Agent Profile**: Category `quick`; Skills: [].

  **Parallelization**: Wave 1. Blocks: none. Blocked By: W0 green. (Run before Task 14, which also edits `employee-lifecycle.ts`.)

  **References**: `src/inngest/lib/tenant-env.ts`; `src/gateway/services/tenant-env-loader.ts`/`tenant-repository.ts`/`tenant-secret-repository.ts`.

  **Acceptance Criteria** (Tier S):
  - [ ] `test ! -f src/inngest/lib/tenant-env.ts`; `grep -rl "lib/tenant-env" src/` empty; `pnpm build` + `pnpm test` green

  **QA Scenarios**:

  ```
  Scenario: Barrel removed, imports rewired
    Tool: Bash
    Steps:
      1. test ! -f src/inngest/lib/tenant-env.ts && echo GONE
      2. grep -rl "lib/tenant-env" src/ (empty)
      3. pnpm build && pnpm test -- --run
    Expected Result: Barrel gone, direct imports resolve, green
    Evidence: .sisyphus/evidence/task-6-barrel.txt
  ```

  **Commit**: YES — `refactor(inngest): remove tenant-env barrel, import gateway services directly`

- [ ] 7. Add optionalEnv() to worker-tools shared lib

  **What to do**:
  - **VERIFIED**: `src/worker-tools/lib/require-env.ts` exports `requireEnv(name)` which on a missing var writes stderr + `process.exit(1)` (does NOT throw). `get-arg.ts` exports `getArg(args, flag)`. Both exist.
  - Add `optionalEnv(name: string): string | undefined` → `process.env[name] || undefined`. JSDoc: `requireEnv` aborts (`process.exit(1)`); `optionalEnv` is graceful.
  - Add `src/worker-tools/lib/__tests__/require-env.test.ts` (matches existing `src/worker-tools/**/__tests__/` convention) testing `optionalEnv` returns value when set, `undefined` when unset/empty.

  **Must NOT do**: Do NOT change `requireEnv` behavior; do NOT migrate any tool files yet (Wave 4).

  **Recommended Agent Profile**: Category `quick`; Skills: [].

  **Parallelization**: Wave 1. Blocks: 20-25. Blocked By: W0 green.

  **References**: `src/worker-tools/lib/require-env.ts`; `src/worker-tools/slack/post-message.ts` (6 optional env vars — future consumer).

  **Acceptance Criteria** (Tier S):
  - [ ] `optionalEnv` exported; test file passes; JSDoc present

  **QA Scenarios**:

  ```
  Scenario: optionalEnv works
    Tool: Bash
    Steps:
      1. pnpm test:file src/worker-tools/lib/__tests__/require-env.test.ts
      2. grep "optionalEnv" src/worker-tools/lib/require-env.ts
    Expected Result: Tests pass, exported
    Evidence: .sisyphus/evidence/task-7-optional-env.txt
  ```

  **Commit**: YES — `feat(worker-tools): add optionalEnv helper`

### WAVE 2 — Type safety + test factory

- [ ] 8. Typed PostgREST client with generics

  **What to do**:
  - Create `src/workers/lib/postgrest-types.ts` with interfaces for key models read via PostgREST: `TaskRow`, `ArchetypeRow`, `ExecutionRow`, `TenantRow`, `PendingApprovalRow`, `TaskStatusLogRow`, `TaskMetricsRow` — field names in snake_case (PostgREST), derived from `prisma/schema.prisma`.
  - Refactor `src/workers/lib/postgrest-client.ts` to generic: `query<T>(table, params): Promise<T[] | null>`, `insert<T>`, `update<T>`.
  - Update 3-5 common callers in `employee-lifecycle.ts` to typed queries (demonstration). Add a test validating the generic client.

  **Must NOT do**: Do NOT change runtime behavior; do NOT migrate ALL callers (Task 14 does that); do NOT use Prisma camelCase types (PostgREST is snake_case).

  **Recommended Agent Profile**: Category `deep`; Skills: [].

  **Parallelization**: Wave 2. Blocks: 14. Blocked By: 1.

  **References**: `src/workers/lib/postgrest-client.ts`; `prisma/schema.prisma`; `src/inngest/employee-lifecycle.ts` (inline fetch callers); `src/inngest/lifecycle/steps/delivery-retry.ts`.

  **Acceptance Criteria** (Tier A + PostgREST round-trip):
  - [ ] `postgrest-types.ts` has 7+ interfaces; client exports generic `query<T>`/`insert<T>`/`update<T>`; ≥3 lifecycle callers typed
  - [ ] `pnpm build` (type-safe); test validates client
  - [ ] PostgREST round-trip: `curl localhost:54331/rest/v1/tasks?limit=1 -H "apikey:$SUPABASE_ANON_KEY"` → `[]`
  - [ ] Tier A: `real-estate-motivation-bot-2` → Done

  **QA Scenarios**:

  ```
  Scenario: Typed client compiles and round-trips
    Tool: Bash
    Steps:
      1. pnpm build (0 type errors)
      2. grep "query<TaskRow>" src/inngest/employee-lifecycle.ts
      3. curl PostgREST tasks?limit=1 → []
      4. Tier A trigger → Done
    Expected Result: Types defined, callers typed, real read works, employee runs
    Evidence: .sisyphus/evidence/task-8-tierA-{build,postgrest,db}.txt
  ```

  **Commit**: YES — `feat(types): add typed PostgREST client with generic query/insert/update`

- [ ] 9. Inngest typed event schemas

  **What to do**:
  - **DERIVE payloads from real call sites** — `grep -rn "inngest.send\|\.send({" src/ --include="*.ts"` and read each `name:`/`data:`. Active events/functions are in AGENTS.md ("Inngest functions (active — 7)"). Names include `employee/task.dispatched`, `employee/interaction.received`, `employee/task.requested`, `employee/approval.received`, `employee/trigger.input-received`, rule events.
  - Create `src/inngest/events.ts` with a typed schema per event (VERIFY fields against senders). Use Inngest `EventSchemas` to make a typed client. Update `src/gateway/inngest/client.ts` to use it. Update 2-3 functions (e.g. `rule-extractor.ts`, `reviewing-watchdog.ts`) to typed `event` and remove their `eslint-disable no-explicit-any`.

  **Must NOT do**: Do NOT change event payloads at runtime; do NOT update ALL functions (Task 13 does the bulk); do NOT change client init logic.

  **Recommended Agent Profile**: Category `deep`; Skills: [].

  **Parallelization**: Wave 2. Blocks: 10, 13, 14, 18, 19. Blocked By: 1.

  **References**: `src/gateway/inngest/client.ts`; `src/inngest/interaction-handler.ts:22` (eslint-disable); `src/inngest/rule-extractor.ts:25`; Inngest EventSchemas docs.

  **Acceptance Criteria** (Tier A):
  - [ ] `src/inngest/events.ts` has typed schemas for all platform events; client uses them; 2-3 functions de-suppressed; `pnpm build`; Tier A → Done

  **QA Scenarios**:

  ```
  Scenario: Typed events compile, suppressions removed
    Tool: Bash
    Steps:
      1. pnpm build
      2. grep -c "eslint-disable.*no-explicit-any" src/inngest/rule-extractor.ts (expect 0)
      3. Tier A trigger → Done
    Expected Result: Typed events, demo files clean, employee runs
    Evidence: .sisyphus/evidence/task-9-tierA-{build,db}.txt
  ```

  **Commit**: YES — `feat(types): add Inngest typed event schemas and typed client`

- [ ] 10. Create lifecycle test mock factory

  **What to do**:
  - Create `tests/helpers/lifecycle-mocks.ts` exporting `createLifecycleMocks()` returning pre-configured stubs for `fly-client`, `tunnel-client`, `tenant-env-loader`, `tenant-repository`, `tenant-secret-repository`, `@slack/web-api` WebClient, `postgrest-client`. Sensible overridable defaults. JSDoc usage. Add a "Writing Lifecycle Tests" section to CONTRIBUTING.md.
  - **NOTE**: place this in `tests/helpers/` (shared by integration tests after the Wave 0 split — most lifecycle tests are integration).

  **Must NOT do**: Do NOT refactor existing tests to use it (too risky now); do NOT mock Prisma here (gateway tests use `createTestApp`).

  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].

  **Parallelization**: Wave 2. Blocks: none. Blocked By: 9.

  **References**: `tests/integration/.../lifecycle-*.test.ts` (post-split path); `tests/setup.ts`; `src/inngest/employee-lifecycle.ts`; `CONTRIBUTING.md`.

  **Acceptance Criteria** (Tier S):
  - [ ] `tests/helpers/lifecycle-mocks.ts` exports `createLifecycleMocks()` covering 7+ modules; CONTRIBUTING.md section added; a sample test using it compiles+passes

  **QA Scenarios**:

  ```
  Scenario: Mock factory usable
    Tool: Bash
    Steps:
      1. ls tests/helpers/lifecycle-mocks.ts
      2. pnpm build
      3. grep "Writing Lifecycle Tests" CONTRIBUTING.md
    Expected Result: Factory exists, compiles, documented
    Evidence: .sisyphus/evidence/task-10-mock-factory.txt
  ```

  **Commit**: YES — `feat(test): add lifecycle mock factory`

- [ ] 11. Fix raw pino() + base64url duplication

  **What to do**:
  - **VERIFIED**: Replace raw `pino()` with `createLogger` at `src/gateway/middleware/admin-auth.ts:5` and `src/gateway/server.ts:52`.
  - **VERIFIED**: Delete `base64url()` + `generateAppJwt()` from `src/gateway/routes/admin-github.ts:27,32`; import from `src/gateway/services/github-token-manager.ts` (which has them at :24,29 — but they're currently NOT exported; add `export` to both there).

  **Must NOT do**: Do NOT change logger levels/format or token-gen logic.

  **Recommended Agent Profile**: Category `quick`; Skills: [].

  **Parallelization**: Wave 2. Blocks: none. Blocked By: 1.

  **References**: `src/gateway/middleware/admin-auth.ts:5`; `src/gateway/server.ts:52`; `src/gateway/routes/admin-github.ts:27,32`; `src/gateway/services/github-token-manager.ts:24,29`; `src/lib/logger.ts`.

  **Acceptance Criteria** (Tier S):
  - [ ] No `from 'pino'` in src/ except `logger.ts`; `admin-github.ts` imports base64url/generateAppJwt from the service; `pnpm build` + `pnpm test` green

  **QA Scenarios**:

  ```
  Scenario: Dedup complete
    Tool: Bash
    Steps:
      1. grep -rl "from 'pino'" src/ | grep -v logger.ts (empty)
      2. grep -c "function base64url" src/gateway/routes/admin-github.ts (expect 0)
      3. pnpm build && pnpm test -- --run
    Expected Result: No raw pino, no local base64url, green
    Evidence: .sisyphus/evidence/task-11-dedup.txt
  ```

  **Commit**: YES — `refactor: deduplicate pino/base64url/generateAppJwt`

- [ ] 12. Fix \_resetCacheForTest production leak + ClassifyResult employee fields

  **What to do**:
  - **VERIFIED**: `src/gateway/routes/admin-google.ts:7,54` imports and calls `_resetCacheForTest()` (a test-only fn from `google-token-manager.ts:20`) inside the production DELETE handler. Extract a production `clearTokenCache()` in `google-token-manager.ts` (same cache-clear, non-test name), export it, call that from the route.
  - **VERIFIED**: `src/lib/classify-message.ts:1,11-13` — `ClassifyResult` has guest-specific fields (`guestName?`, `propertyName?`, `checkIn?`, ...) at top level in a SHARED type used by the universal lifecycle. Restructure: keep universal `intent`/`confidence` at top level, move employee-specific fields under a `context?: Record<string, unknown>` (or a discriminated subtype). Update consumers.

  **Must NOT do**: Do NOT break classification runtime behavior; do NOT remove fields that are actively used — restructure the type.

  **Recommended Agent Profile**: Category `quick`; Skills: [].

  **Parallelization**: Wave 2. Blocks: none. Blocked By: W0 green.

  **References**: `src/gateway/routes/admin-google.ts:7,54`; `src/gateway/services/google-token-manager.ts:20`; `src/lib/classify-message.ts:1,11-13`; `src/inngest/employee-lifecycle.ts` (consumer).

  **Acceptance Criteria** (Tier A — classifier + google route are runtime paths):
  - [ ] `grep -c "resetCacheForTest" src/gateway/routes/admin-google.ts` → 0; `ClassifyResult` has no guest field at top level; `pnpm build` + `pnpm test`; Tier A → Done

  **QA Scenarios**:

  ```
  Scenario: No test fn in prod, type employee-agnostic
    Tool: Bash
    Steps:
      1. grep -c "resetCacheForTest" src/gateway/routes/admin-google.ts (0)
      2. grep -c "guestName" src/lib/classify-message.ts at top-level interface (0)
      3. pnpm build && pnpm test -- --run; Tier A trigger → Done
    Expected Result: Leak fixed, type restructured, employee runs
    Evidence: .sisyphus/evidence/task-12-tierA-{grep,db}.txt
  ```

  **Commit**: YES — `fix: remove test-only fn from prod path; make ClassifyResult employee-agnostic`

- [ ] 13. ESLint escalation — warn→error + fix existing violations

  **What to do**:
  - **VERIFIED**: 13 `eslint-disable @typescript-eslint/no-explicit-any` across 9 files: `guest-message-poll.ts:48`, `reviewing-watchdog.ts:58`, `interaction-handler.ts:22`, `create-task-and-dispatch.ts:6`, `rule-synthesizer.ts:26`, `slack-trigger-handler.ts:117,371`, `rule-extractor.ts:25`, `approval-handlers.ts:30,180,575,602`, `rule-handlers.ts:333`.
  - In `eslint.config.mjs` set `@typescript-eslint/no-explicit-any` and `no-unused-vars` to `'error'`. Run `pnpm lint`. Fix each: Inngest `event:any`/`step:any` → typed events from Task 9; Bolt `ack` casts → a typed wrapper or `Parameters<typeof ack>[0]`; unused vars → remove or `_`-prefix. Remove now-unneeded disables. Truly-unfixable → `eslint-disable-next-line` WITH a reason comment.

  **Must NOT do**: Do NOT add file-level blanket disables; do NOT suppress without a reason; do NOT change runtime behavior to satisfy types.

  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].

  **Parallelization**: Wave 2. Blocks: 19. Blocked By: 9.

  **References**: `eslint.config.mjs`; the 9 files above; Task 9 typed events.

  **Acceptance Criteria** (Tier S):
  - [ ] `pnpm lint` exits 0 (zero warnings/errors); both rules `'error'`; zero `eslint-disable no-explicit-any` in non-deprecated files (or each has a reason)

  **QA Scenarios**:

  ```
  Scenario: Lint clean after escalation
    Tool: Bash
    Steps:
      1. pnpm lint (exit 0, zero warnings)
      2. grep -rl "eslint-disable.*no-explicit-any" src/ | grep -v deprecated (empty)
    Expected Result: Clean lint, suppressions gone
    Evidence: .sisyphus/evidence/task-13-eslint.txt
  ```

  **Commit**: YES — `refactor(lint): escalate no-explicit-any and no-unused-vars to error`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns — reject with file:line if found. Confirm Wave 0 left the baseline green. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test` + `pnpm test:integration`. Review changed files for `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports, AI slop. Verify zero eslint-disable no-explicit-any in non-deprecated files.
      Output: `Build [P/F] | Lint [P/F] | Unit [N/N] | Integration [N/N] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA — Tier A + Tier B** — `unspecified-high` (+ `e2e-testing` skill)
      Confirm prerequisites. **Tier A**: trigger `real-estate-motivation-bot-2` → `Done` + `task_metrics` (psql AND PostgREST) + Slack post. **Tier B**: full approval loop → delivery. **Structural**: `wc -l src/inngest/employee-lifecycle.ts` < 500; zero `res.status(` in non-test routes; husky fires; ≥3 migrated tools `--help` exit 0; `pnpm test && pnpm test:integration` green. Evidence → `.sisyphus/evidence/final-qa/`.
      Output: `Tier A [P/F] | Tier B [P/F] | Structural [N/N] | Suites [unit P/F, int P/F] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec built, nothing beyond spec. Check "Must NOT do" compliance. Confirm Wave 0 fixed tests to match SHIPPED behavior (no prod bugs silently hidden). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

---

## Commit Strategy

> Commits group per-task (see each task's Commit line). Per-wave roll-up themes:

| Wave | Theme                                                                |
| ---- | -------------------------------------------------------------------- |
| 0    | Green baseline: fix 61 failing tests + split unit/integration suites |
| 1    | DX foundations + shared helpers                                      |
| 2    | Type safety + test factory                                           |
| 3    | Pattern unification (sendError, lifecycle decomp)                    |
| 4    | Worker tools migration (54 files)                                    |
| 5    | Docs + conventions                                                   |

---

## Success Criteria

### Verification Commands

```bash
pnpm build              # Expected: clean compile
pnpm test               # Expected: unit suite, 0 fail, runs in seconds
pnpm test:integration   # Expected: DB suite, 0 fail
pnpm lint               # Expected: 0 errors, 0 warnings (after Task 13)
wc -l src/inngest/employee-lifecycle.ts                                     # Expected: <500
grep -rl "eslint-disable.*no-explicit-any" src/ --include="*.ts" | grep -v deprecated | wc -l  # Expected: 0
grep -rl "res\.status(" src/gateway/routes/*.ts | grep -v ".test.ts" | wc -l   # Expected: 0
```

### Final Checklist

- [ ] **Wave 0 green baseline reached and never regressed**
- [ ] All "Must Have" present; all "Must NOT Have" absent
- [ ] `pnpm build && pnpm test && pnpm test:integration && pnpm lint` all green
- [ ] Unit suite runs in seconds (parallelized)
- [ ] Employee lifecycle under 500 lines; all 29 routes use `sendError`
- [ ] All 54 worker tools use shared helpers; `tests/worker-tools` green
- [ ] New contributor guide + PR template + husky fire on staged lint error
- [ ] **Tier A passed** and **Tier B passed** (evidence captured)
