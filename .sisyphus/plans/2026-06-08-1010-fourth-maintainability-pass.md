# Fourth Maintainability Pass — Pre-Onboarding Final Hardening

## TL;DR

> **Quick Summary**: Close the last maintainability gaps three prior passes deferred or surfaced — fix the remaining layering/data-access violations (raw-PostgREST Slack handlers, inngest→gateway type import, inline PrismaClient leaks), dedup the repeated lifecycle blocks, externalize VLRE-specific tool config, harden OAuth calls, decompose the 5 remaining large backend files, write the missing tests for 8 untested lifecycle steps + fix all test-infra gaps, and ship a dedicated onboarding-docs wave with copy-paste templates. All extract-only / pass-through except two explicitly-flagged, strictly-safer standardizations.
>
> **Deliverables**:
>
> - **Layering**: `TaskRepository`(read-only) + `EmployeeRuleRepository` replace 12 raw-PostgREST sites; `InngestStep` moved to `events.ts` (kills inngest→gateway import + 6 local re-derivations); shared `prisma` injected into 2 Bolt handlers (fixes conn-pool leak)
> - **Dedup/smells**: `mergeTaskMetadata()` (standardized, 6 sites) + `makePostgrestHeaders()` (36 sites); silent catches logged; then-in-await fixed; Zod-validate 2 unsafe casts; magic numbers named; 15 dead lines removed; dashboard console→toast
> - **Worker-tools**: notion-types consolidated to one local `.ts` (kills 4-copy + cross-package import); SMELL-7 fully externalized (ZIP_CITY/room-naming/street-norm → config) proven byte-identical
> - **OAuth/HTTP**: 5 OAuth token-exchanges + 3 admin-github calls gain retry via `createHttpClient`/`createGitHubClient`
> - **Decomposition** (extract-only): `opencode-harness.mts`, `approval-handlers.ts`, `execute.ts`, `reviewing-path.ts`, `rule-handlers.ts`
> - **Tests**: direct tests for ALL 8 untested lifecycle steps; rename+add handler tests; `cleanupTestData` covers all tables; consolidate dup test files; dashboard vitest+CI; orphan test recovered; mock-style consistency; idempotency + soft-delete coverage
> - **Docs/scaffolding**: README/CONTRIBUTING/troubleshooting/AGENTS.md fixes; "Your First PR"; unit-vs-integration rule; FULL template set (shell-tool, gateway-route, archetype, 3 test types)
>
> **Estimated Effort**: XL (~55 tasks across 8 waves + final verification) — each wave independently shippable
> **Parallel Execution**: YES — 8 ordered waves; tasks within a wave parallelize
> **Critical Path**: PRE-TASKS (P-A/B/C) → ARCH-NEW-1 type-move → dedup helpers → layering repos → backend decomp (Tier B) → SMELL-7 golden-diff → test coverage (after cleanupTestData) → docs wave → final wave

---

## Context

### Original Request

After THREE completed maintainability plans (`2026-06-05-0111-maintainability-remediation.md`, `2026-06-07-1653-onboarding-readiness.md`, `2026-06-08-0132-third-maintainability-pass.md`), analyze the codebase ONE more time and find where else to improve structure/maintainability before new engineers onboard next week — so they have clear patterns to follow and avoid copying bad ones. Best-quality codebase possible.

### What the THREE prior plans already did (do NOT redo)

- **Plan 1**: active bug fixes, deleted ~5K dead lines, unified `TERMINAL_STATUSES`→`src/lib/task-status.ts`, shared foundations (`config.ts`, `logger.ts`, `http-client.ts` PoC, `sendError`, Hostfully client PoC), FK-index + `deleted_at` migrations, decomposed then-biggest files, unified approval flow, ESLint `any`→error, coverage tooling.
- **Plan 2**: fixed 61 failing tests, split `tests/unit/`+`tests/integration/`, contributor guide + PR template + husky, `CURRENT-ARCHITECTURE.md`, typed PostgREST (`postgrest-types.ts`) + typed Inngest events (`events.ts`), `employee-lifecycle.ts`→88 lines, `sendError` in all 29 routes, migrated 54 worker tools to `requireEnv`/`optionalEnv`/`getArg`, `lifecycle-mocks.ts`.
- **Plan 3**: authored `sendSuccess` + adopted, extended `createHttpClient` (`.get`/`.delete`) + adopted in fly/telegram/github-token, expanded `config.ts`, migrated 8 Hostfully tools, decomposed validate-and-submit/approval-handler/opencode-harness(→~700)/override-handlers/slack-input-collector/interaction-handler, relocated tenant repos→`src/repositories/` + interaction-classifier→`src/lib`, dropped 5 dead Prisma tables, dashboard decomp, named magic numbers, documented barrel/catch/as-unknown-as policies.

### Source Findings

Draft: `.sisyphus/drafts/2026-06-08-1010-fourth-maintainability-pass.md` — synthesizes 5 parallel explore-agent reports (architecture, large-files, onboarding/DX, code-smells, test-quality), file:line precise. Every task references a finding ID (e.g. `[ARCH-1]`, `[GAP-03]`).

### Interview Summary

**Confirmed decisions**:

- **Scope**: ALL 7 themes, one comprehensive plan.
- **Theme 5 decomposition**: include ALL 5 backend files (extract-only).
- **Theme 6 tests**: FULL coverage — direct tests for all 8 untested lifecycle steps + all infra fixes.
- **Config widening**: NARROW — only non-startup-critical `src/lib` reads (`call-llm`, `interaction-classifier`); `encryption.ts` EXCLUDED (startup-critical); `server.ts`'s 14 startup reads UNTOUCHED.
- **SMELL-7**: FULLY externalize to tenant config, proven byte-identical (live employees consume it).
- **Docs**: DEDICATED final wave; FULL template set (shell-tool, gateway-route, archetype, each test type).
- **Verification**: same Tier S/A/B model + Docker rebuild + 4-agent Final Verification Wave.
- **mergeTaskMetadata (D-01)**: STANDARDIZE all 6 sites (documented behavior change — always `.ok`-check + structured warn; strictly safer).
- **Test vs decompose order**: DECOMPOSE FIRST, then test new shape (mitigation: each decomp proves behavior via Tier B E2E before its tests are written).

### Metis Review (gaps addressed — see Guardrails)

Metis verified: the 6 `mergeTaskMetadata` sites are NOT identical (→ standardize, flagged); `InngestStep` move may pull `inngest` into worker bundle (→ PRE-TASK P-A grep); SMELL-7 byte-identity is fragile incl. `'Austin, TX'` line-307 fallback (→ PRE-TASK P-B golden capture, fixture must hit all branches); `cleanupTestData` `notIn` guards can delete seed data (→ PRE-TASK P-C seed-ID extraction); `approval-handler.ts` (lifecycle step) vs `approval-handlers.ts` (Bolt handler) naming trap (→ full paths everywhere); ordering: ARCH-NEW-1 before T5, dedup-before-decompose, cleanupTestData proven before new tests.

---

## Work Objectives

### Core Objective

Eliminate the last patterns a new engineer would copy wrongly — the dual data-access in Slack handlers, the inngest→gateway layering violation, per-request PrismaClient leaks, duplicated lifecycle blocks, VLRE-coupled "generic" tools, untested critical lifecycle paths, and onboarding-doc inaccuracies — leaving ONE consistent, well-tested, well-documented pattern everywhere, with zero externally-observable behavior change (except two explicitly-flagged strictly-safer standardizations).

### Concrete Deliverables

See TL;DR. Every task maps to a finding ID in the source draft.

### Definition of Done

- [ ] `pnpm build && pnpm lint && pnpm test -- --run && pnpm test:integration && pnpm dashboard:build` all green
- [ ] `grep -rn "GetStepTools\|type InngestStep" src/` → exactly ONE definition (in `events.ts`)
- [ ] No `src/inngest/**` file imports `InngestStep` from `gateway/inngest/client`
- [ ] Zero raw-PostgREST `fetch(` in `shared.ts` + `rule-handlers.ts` (replaced by repositories)
- [ ] No inline `new PrismaClient()` in `trigger-handlers.ts` / `event-handlers.ts`
- [ ] SMELL-7: `diff golden.json after.json` (mock mode, env unset) returns EMPTY
- [ ] `pnpm test:integration` run TWICE consecutively (no reset) → both green (cleanup proven)
- [ ] All 8 lifecycle step modules have a direct test file
- [ ] `dashboard/vitest.config.ts` exists; dashboard tests run in CI
- [ ] `real-estate-motivation-bot-2` → `Done` after every lifecycle/harness change; Tier B passes after approval-path file splits

### Must Have

- Each wave independently shippable
- Every extraction behavior-identical (extract-only); `mergeTaskMetadata` standardization explicitly documented
- DB/test-infra change verified via real run (suite twice), not build-only
- Harness change → Docker rebuild → live worker run

### Must NOT Have (Guardrails from Metis)

- **NO behavior change** during THEME 5 extractions — control flow / error semantics / LLM behavior untouched; a bug found mid-extraction = NEW finding, never an inline fix
- **NO config framework / plugin system** for SMELL-7 — `optionalEnv` + JSON default only
- **NO touching `server.ts`'s 14 startup `process.env` reads**; `encryption.ts` EXCLUDED from config widening (startup-critical)
- **NO write methods on `TaskRepository`** (read-only per finding)
- **NO fixing bugs discovered by new tests inline** — new tests assert CURRENT behavior; file discovered bugs separately
- **NO new `index.ts` barrels**; **NO splitting** the cohesive files (`slack-blocks.ts`, `tool-parser.ts`, `session-manager.ts`, `gateway.ts`, `types.ts`, `schemas.ts`)
- **NO wrong-file edits** from the `approval-handler.ts` (singular, lifecycle step) vs `approval-handlers.ts` (plural, Bolt handler) naming trap — full paths in every task
- **NO `notIn`-guard mistake** deleting seed data in `cleanupTestData`
- **NO "verify it works" / "user manually tests"** acceptance criteria

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed. Reuses the proven Tier S/A/B model from the three prior plans.

### Test Decision

- **Infrastructure exists**: YES (`tests/unit/` parallel + `tests/integration/` DB-backed; dashboard Vitest after this plan; Playwright over CDP)
- **Automated tests**: Tests-after for extractions/migrations (existing tests stay green); NEW unit tests for new shared modules (`TaskRepository`, `EmployeeRuleRepository`, `mergeTaskMetadata`, `makePostgrestHeaders`) AND for all 8 untested lifecycle steps (FULL coverage decision)
- **Framework**: `vitest` (root + new dashboard config) + Playwright over CDP for dashboard parity
- **No new framework needed.**

### QA Policy

Every task gates on its assigned tier (Verification Tier Map) and captures evidence to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Tier S** — Smoke: `pnpm build && pnpm lint && pnpm test -- --run` (+ `pnpm dashboard:build` for dashboard) + the task-specific grep/assertion. Full gate for pure doc/config/test tasks.
- **Tier A** — Fast runtime: Tier S, then trigger `real-estate-motivation-bot-2` (VLRE, `approval_required:false`) → `Done` (psql AND PostgREST) + `task_metrics` row + Slack post.
- **Tier B** — Full approval loop: Tier A, then real Airbnb→draft→Slack-card→approve→reply→DB (or simulate Hostfully webhook per README). Single-gateway pre-flight (`pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` == 1) first.
- **Dashboard parity** — Playwright over CDP (real Chrome): before/after screenshot per touched page, zero console errors. `lsp_find_references` before any deletion.
- **DB/test-infra** — `pnpm test:integration` run TWICE consecutively (no reset) both green; migrations → `NOTIFY pgrst,'reload schema'` → curl verify.
- **Harness change** — `docker build -t ai-employee-worker:latest .` → trigger `real-estate-motivation-bot-2` → `Done` + metrics row.
- **SMELL-7** — golden byte-diff: `HOSTFULLY_MOCK=true tsx get-checkouts.ts --date <fixture> > after.json && diff golden.json after.json` EMPTY; fixture exercises ZIP hit + ZIP miss (`'Austin, TX'` fallback) + all 4 `deriveRoomId` branches + street-norm.

---

## Execution Strategy

> **8 ordered, independently-shippable waves** (Wave 0 = pre-task gates). Tasks within a wave parallelize. Every task ends with its tier gate + captured evidence.
>
> **Universal ordering invariants (Metis)**: (1) ARCH-NEW-1 type-move BEFORE Theme-5 step decompositions. (2) dedup-before-decompose for files in BOTH Theme 2 + Theme 5. (3) `cleanupTestData` proven-green BEFORE the 8 new step tests. (4) GAP-02 rename test BEFORE decomposing `approval-handlers.ts`. (5) `approval-handler.ts` (lifecycle step, singular) vs `approval-handlers.ts` (Bolt handler, plural) — full paths in every task.

### Wave Map

```
WAVE 0 — Pre-task gates (read-only validations; unblock the risky waves)
├── P-A. Grep worker bundle for inngest/events|inngest/client imports → gates ARCH-NEW-1
├── P-B. Capture SMELL-7 golden output (HOSTFULLY_MOCK, all branches) → gates SMELL-7
└── P-C. Extract authoritative seeded-ID list from prisma/seed.ts → gates GAP-03
   ↳ CHECKPOINT W0: 3 validation artifacts captured

WAVE 1 — Foundation: type-move + dedup helpers (unblock layering + decomp)
├── 1. Move InngestStep → events.ts; delete 9 gateway imports + 6 local re-derivations [ARCH-NEW-1]
├── 2. Add mergeTaskMetadata() (STANDARDIZED) to lifecycle-helpers.ts + unit test [D-01]
├── 3. Add makePostgrestHeaders(key) helper + adopt across 15 inngest files [D-02]
└── 4. Add TaskRepository(read-only) + EmployeeRuleRepository skeletons + unit tests [ARCH-1 pt1]
   ↳ CHECKPOINT W1: helpers + repos exist, unit-tested; build/test green

WAVE 2 — Layering adoption + smell cleanup (new devs copy the RIGHT pattern)
├── 5. Replace 5 raw-fetch sites in shared.ts with TaskRepository [ARCH-1 pt2]
├── 6. Replace 7 raw-fetch sites in rule-handlers.ts with EmployeeRuleRepository [ARCH-1 pt3]
├── 7. Inject shared prisma into trigger-handlers + event-handlers (fix leak/finally) [ARCH-NEW-2]
├── 8. Adopt mergeTaskMetadata at the 6 sites (incl P-01/P-02 then-in-await fix) [D-01 adopt]
├── 9. Log silent catches (call-llm:150, harness:388,417) + name magic numbers [E-01/02/03, M-01/02]
├── 10. Zod-validate 2 unsafe casts; comment 6 legit casts; delete serve.ts dead lines; dashboard toast [A-01/02, A-03..08, DC-01, C-01]
└── 11. Narrow config widening: call-llm + interaction-classifier non-startup reads [ENV, encryption EXCLUDED]
   ↳ CHECKPOINT W2: Tier B (lifecycle dedup) + Tier A green; no raw-fetch in handlers

WAVE 3 — Worker-tools hygiene + OAuth hardening (independent, parallelizable)
├── 12. Consolidate notion-types to one worker-tools-local .ts; delete dup copies [ARCH-15]
├── 13. SMELL-7: externalize ZIP_CITY + room-naming + street-norm to config; golden-diff [SMELL-7]
├── 14. Extract CONFIRMED_STATUSES to hostfully/lib/constants.ts (dedup) [SMELL-7 dedup]
└── 15. OAuth retry: 5 token-exchanges + admin-github → createHttpClient/createGitHubClient [ARCH-NEW-3]
   ↳ CHECKPOINT W3: SMELL-7 byte-identical; Tier A green; notion tools --help exit 0

WAVE 4 — Backend decomposition (EXTRACT-ONLY) + rebuild + Tier B
├── 16. Decompose opencode-harness.mts (exec/delivery seam) + rebuild [SIZE-harness]
├── 17. Decompose approval-handlers.ts (5 action handlers) — AFTER GAP-02 rename (task 30) [SIZE-approval-bolt]
├── 18. Decompose execute.ts (executing step → machine-provisioner) [SIZE-execute]
├── 19. Decompose reviewing-path.ts (check-supersede + track-pending-approval) [SIZE-reviewing]
└── 20. Decompose rule-handlers.ts (action-split, around repo calls) [SIZE-rule-bolt]
   ↳ CHECKPOINT W4: docker rebuild → ONE Tier B (covers 16,19) + Scenario A (17,19) → green

WAVE 5 — Test infrastructure (foundation for new coverage)
├── 21. Extend cleanupTestData with all tables (notIn guards from P-C); prove suite twice [GAP-03]
├── 22. Recover orphaned tests/gateway/inngest-send.test.ts → tests/unit/gateway/ [GAP-06]
├── 23. Consolidate dup call-llm + config test files [GAP-04, GAP-12]
├── 24. Add dashboard/vitest.config.ts + CI step + expand smoke tests [GAP-05]
└── 25. Migrate 4 legacy (mocked as any).step files to createLifecycleMocks; doc setTimeout pattern; fix dev-preflight 400ms wait [GAP-07, GAP-08]
   ↳ CHECKPOINT W5: integration suite TWICE green; dashboard in CI; mock styles unified

WAVE 6 — Test coverage (after cleanupTestData; tests the post-decomp shape)
├── 26. Tests: reviewing-path + no-approval-path (highest-risk) [GAP-01a]
├── 27. Tests: triage-and-ready + validate-and-submit + notify-and-track [GAP-01b]
├── 28. Tests: delivery-retry + approval-handler-reject + lifecycle-helpers [GAP-01c]
├── 29. Rename guest-handlers.test → approval-handlers.test; add event-handlers + trigger-handlers tests [GAP-02]
├── 30. Idempotency (double-approve) + soft-delete filtering tests [GAP-09, GAP-10]
   ↳ CHECKPOINT W6: all 8 step modules have direct tests; handler coverage added; suite green twice

WAVE 7 — Onboarding docs + scaffolding templates (dedicated, ship last)
├── 31. FULL template set: shell-tool + gateway-route + archetype + 3 test-type skeletons [GAP-14/15]
├── 32. CONTRIBUTING: Your First PR + unit-vs-integration rule + test-writing patterns + log-vs-logger [GAP-08/09/11/16]
├── 33. README fixes: port table (Kong/PostgREST), lifecycle 5→13 states, collapse deprecated section [GAP-05/06/07]
├── 34. .env.example + new-contributor guide: docker/.env + SUPABASE keys + model note + task-stuck [GAP-04/12/19/20/21]
├── 35. AGENTS.md: session-manager exception + claude-haiku note; shell-tool guide requireEnv; troubleshooting stale fix [GAP-01/02/13/17/18]
└── 36. Update AGENTS/README/CONTRIBUTING for new modules (repos, helpers, decomposed files, dashboard config)
   ↳ CHECKPOINT W7: docs accurate; templates present; dashboard:build green

WAVE FINAL — 4 parallel reviews + user okay
├── F1. Plan compliance audit (oracle)
├── F2. Code quality review (unspecified-high)
├── F3. Real manual QA — Tier A + Tier B + dashboard parity (unspecified-high)
└── F4. Scope fidelity check (deep)
-> Present results -> Get explicit user okay -> Telegram notify

Critical Path: P-A/B/C → 1 → 2,3,4 → 5,6,7 → 16,19 (Tier B) → 13 (golden) → 21 → 26-30 → 31-36 → F1-F4 → okay
```

### Dependency Notes

- **P-A/B/C (Wave 0)** gate ARCH-NEW-1, SMELL-7, GAP-03 respectively.
- **Task 1 (InngestStep move)** BEFORE all Theme-5 decompositions (16-20).
- **Tasks 2,3 (helpers)** BEFORE Task 8 adoption AND BEFORE decomposing the same files (dedup-before-decompose).
- **Task 4 (repos)** BEFORE 5,6 adoption.
- **Task 29 (GAP-02 rename)** BEFORE Task 17 (decompose `approval-handlers.ts`) — but 29 is Wave 6; so the rename portion of 29 is pulled forward as a precondition note in Task 17 (do the rename first, then split). Sequenced: Wave 4 Task 17 includes "rename test file first" as step 0.
- **Task 21 (cleanupTestData)** proven-green BEFORE Tasks 26-28 (new step tests).
- **Tasks 12,15 (Theme 3/4)** INDEPENDENT — parallelize freely.

### Verification Tier Map

| Task                      | Tier            | Task                        | Tier                | Task                             | Tier                 |
| ------------------------- | --------------- | --------------------------- | ------------------- | -------------------------------- | -------------------- |
| P-A inngest grep          | S               | 12 notion-types             | A (tool run)        | 24 dashboard vitest+CI           | S                    |
| P-B SMELL-7 golden        | S               | 13 SMELL-7 externalize      | **A + golden-diff** | 25 mock-style migrate            | S (+integration)     |
| P-C seed-IDs              | S               | 14 CONFIRMED_STATUSES       | A                   | 26 reviewing+no-approval tests   | S (+integration)     |
| 1 InngestStep move        | S               | 15 OAuth retry              | A                   | 27 triage+validate+notify tests  | S (+integration)     |
| 2 mergeTaskMetadata       | S (parity test) | 16 harness decomp           | **B + rebuild**     | 28 delivery+reject+helpers tests | S (+integration)     |
| 3 makePostgrestHeaders    | S               | 17 approval-handlers decomp | **B**               | 29 handler tests + rename        | S (+integration)     |
| 4 repos skeleton          | S               | 18 execute decomp           | **B + rebuild**     | 30 idempotency+soft-delete       | **B** (+integration) |
| 5 shared.ts repo          | **B**           | 19 reviewing-path decomp    | **B**               | 31 templates                     | S                    |
| 6 rule-handlers repo      | **B**           | 20 rule-handlers decomp     | **B**               | 32 CONTRIBUTING                  | S                    |
| 7 prisma inject           | **B**           | 21 cleanupTestData          | S (+integration ×2) | 33 README                        | S                    |
| 8 mergeTaskMetadata adopt | **B**           | 22 orphan test              | S                   | 34 .env/guide                    | S                    |
| 9 catches+magic           | A (+rebuild)    | 23 consolidate tests        | S                   | 35 AGENTS/troubleshooting        | S                    |
| 10 casts/dead/toast       | S (+dashboard)  |                             |                     | 36 docs freshness                | S                    |
| 11 config widen           | A               |                             |                     | F1-F4                            | **B** (full)         |

---

## TODOs

> Every task references a finding ID. **Extractions are extract-only; `mergeTaskMetadata` is a documented standardization; new tests assert CURRENT behavior.** Re-grep line numbers before editing — they drift. Run each task's tier gate + capture evidence before the next.

### WAVE 0 — Pre-task gates (read-only validations)

- [x] P-A. **Validate InngestStep move is worker-bundle-clean**

  **What to do**: `grep -rn "inngest/events\|inngest/client" src/workers src/worker-tools --include="*.ts" --include="*.mts"`. Confirm NO worker-bundle file imports from `src/inngest/events` or `src/gateway/inngest/client` (moving `InngestStep` into `events.ts` adds an `inngest`-package dependency to `events.ts`; if a worker file transitively pulls it, that's a bundle regression). Record the result. If any hit, Task 1 must use a type-only re-export shim instead.
  **Must NOT do**: Edit anything — read-only validation.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 0. Blocks: 1. Blocked By: none.
  **References**: `src/gateway/inngest/client.ts:11` (`InngestStep` def); `src/inngest/events.ts` (proposed home); the 9 inngest importers.
  **Acceptance Criteria**:
  - [ ] Grep result captured to `.sisyphus/evidence/task-P-A-bundle-check.txt`; verdict (CLEAN / needs-shim) stated
        **Commit**: NO (validation artifact; committed with Task 1)

- [x] P-B. **Capture SMELL-7 golden output (all branches)**

  **What to do**: Identify the Hostfully mock fixture date(s) that exercise ALL externalized branches: a ZIP_CITY hit, a ZIP_CITY miss (triggers the `'Austin, TX'` line-307 fallback), all 4 `deriveRoomId` outputs (`Habitación`/`Unidad`/`Loft`/`Casa`), and the street-suffix normalization. If the existing fixture doesn't cover every branch, note which fixture rows to add (the executor of Task 13 must ensure coverage). Then capture golden: `HOSTFULLY_MOCK=true pnpm exec tsx src/worker-tools/hostfully/get-checkouts.ts --date <date> > .sisyphus/evidence/task-P-B-golden-checkouts.json` (one per needed date).
  **Must NOT do**: Change `get-checkouts.ts` — capture only.
  **Recommended Agent Profile**: Category `deep`; Skills: [`adding-shell-tools`, `hostfully-api`].
  **Parallelization**: Wave 0. Blocks: 13. Blocked By: none.
  **References**: `src/worker-tools/hostfully/get-checkouts.ts:44-96,307`; `src/worker-tools/hostfully/__mocks__` or fixture dir; AGENTS.md mock-fixture convention.
  **Acceptance Criteria**:
  - [ ] Golden JSON captured for date(s) covering ZIP-hit, ZIP-miss, all 4 room branches, street-norm; branch-coverage checklist noted in `.sisyphus/evidence/task-P-B-branch-coverage.txt`
        **Commit**: NO (golden artifact; referenced by Task 13)

- [x] P-C. **Extract authoritative seeded-ID list from prisma/seed.ts**

  **What to do**: Read `prisma/seed.ts`; enumerate every row it seeds for the tables `cleanupTestData` will newly cover — esp. `Archetype`, `Tenant`, `ModelCatalog`, `PlatformSetting` (the tables with seed rows that must survive `cleanupTestData`). Produce a table: table → seeded IDs (or seeded unique keys). Classify each newly-covered table as SEEDED (needs `notIn` guard) vs SCRATCH (full delete): SCRATCH = `TaskMetric`, `FeedbackEvent`, `PendingApproval`, `EmployeeRule`, `SystemEvent`, `TenantIntegration`, `PropertyLock`, `AgentVersion`.
  **Must NOT do**: Edit `cleanupTestData` here — inventory only.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 0. Blocks: 21. Blocked By: none.
  **References**: `prisma/seed.ts`; `tests/setup.ts` (`cleanupTestData` current list); `prisma/schema.prisma` (model→table `@@map`).
  **Acceptance Criteria**:
  - [ ] `.sisyphus/evidence/task-P-C-seed-ids.txt` lists per-table SEEDED-ids vs SCRATCH classification for every table Task 21 will add
        **Commit**: NO (inventory; committed with Task 21)

> **CHECKPOINT W0** — 3 validation artifacts captured. Gates Tasks 1, 13, 21.

### WAVE 1 — Foundation: type-move + dedup helpers

- [x] 1. **Move `InngestStep` → `events.ts`; delete gateway imports + 6 local re-derivations** `[ARCH-NEW-1]` `[BLOCKS Theme 5]`

  **What to do**: Per P-A's verdict: if CLEAN, move the `InngestStep` definition from `src/gateway/inngest/client.ts:11` to `src/inngest/events.ts` (export it). `lsp_find_references` on `InngestStep` first to map all usages. Update the 9 `src/inngest/` importers from `'../gateway/inngest/client.js'` to `'./events.js'`/`'../events.js'`. Delete the 6 local re-derivations (`type InngestStep = GetStepTools<Inngest>`) in `src/inngest/lifecycle/steps/*.ts` and import from `events.ts` instead. If P-A flagged a worker-bundle pull, keep `events.ts` type-only and use a re-export shim instead.
  **Must NOT do**: Change the type's shape; leave any duplicate definition; introduce a barrel.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 1. Blocks: 16-20. Blocked By: P-A.
  **References**: `src/gateway/inngest/client.ts:11`; `src/inngest/events.ts`; the 9 importers (slack-input-collector:11, rule-extractor:10, slack-trigger-handler:13, rule-synthesizer:9, lib/create-task-and-dispatch:3, lib/interaction-helpers:5, interaction-handler:16, triggers/reviewing-watchdog:27, triggers/guest-message-poll:6); the 6 lifecycle step files re-deriving it.
  **Acceptance Criteria**:
  - [ ] `grep -rn "GetStepTools\|type InngestStep" src/ | grep -v node_modules` → exactly 1 (events.ts)
  - [ ] `grep -rln "gateway/inngest/client" src/inngest --include="*.ts"` → empty
  - [ ] `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `refactor: move InngestStep type to inngest/events; remove inngest→gateway import`

- [x] 2. **Add `mergeTaskMetadata()` (STANDARDIZED) + unit test** `[D-01]`

  **What to do**: Add `mergeTaskMetadata(supabaseUrl, headers, taskId, updates: Record<string, unknown>)` to `src/inngest/lifecycle/steps/lifecycle-helpers.ts`. It: fetches current `metadata`, shallow-spreads `updates`, sets `updated_at`, PATCHes back, **ALWAYS checks `res.ok` and logs a structured `log.warn({ taskId, status }, ...)` on failure** (the deliberate, DOCUMENTED standardization — 4 of the 6 current sites skip this check; standardizing is strictly safer). Handle `metadata: null` → `{}`. Add a JSDoc note: "Standardizes the previously-divergent 6 task-metadata-merge sites; always validates the PATCH response." Add unit test in `tests/unit/inngest/lifecycle-helpers.test.ts` asserting shallow-spread preservation, `updated_at` set to fresh ISO, and `null`→`{}` coalescing.
  **Must NOT do**: Adopt it at call sites yet (Task 8). Don't wrap in an envelope. Don't add per-site behavior flags (decision: standardize, not parameterize).
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 1. Blocks: 8. Blocked By: none.
  **References**: `src/inngest/lifecycle/steps/lifecycle-helpers.ts` (`patchTask` sibling); the 6 sites (triage-and-ready.ts:142-161,186-207; approval-handler.ts:269-281; approval-handler-reject.ts:43-46,197-219; lib/interaction-helpers.ts:102) — read all 6 to capture the union of keys.
  **Acceptance Criteria**:
  - [ ] `grep -c "export function mergeTaskMetadata\|export const mergeTaskMetadata" src/inngest/lifecycle/steps/lifecycle-helpers.ts` → 1
  - [ ] Unit test green (shallow-spread, updated_at, null→{}); `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `feat(lifecycle): add standardized mergeTaskMetadata helper with unit test`

- [x] 3. **Add `makePostgrestHeaders(key)` + adopt across inngest files** `[D-02]`

  **What to do**: Add `makePostgrestHeaders(supabaseKey: string)` returning the standard `{ apikey, Authorization: 'Bearer …', 'Content-Type': 'application/json', Prefer: 'return=representation' }` object (extend `lifecycle-helpers.ts` or a small `src/inngest/lib/postgrest-headers.ts`). Replace the ~36 inline header literals across the 15 `src/inngest/` files. Verify each call site previously used the identical header shape (some may omit `Prefer` — preserve per-site intent: if a GET site doesn't need `Prefer`, expose a variant or accept the standardized superset only where harmless).
  **Must NOT do**: Change request semantics (don't add `Prefer` to GETs that intentionally omit it if it alters response shape). Don't touch the worker `postgrest-client.ts` (separate layer).
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 1. Parallel w/ 2,4. Blocked By: none.
  **References**: the 15 inngest files with inline PostgREST headers; `src/inngest/lifecycle/steps/lifecycle-helpers.ts`.
  **Acceptance Criteria**:
  - [ ] `makePostgrestHeaders` defined once; ≥15 files import it; `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `refactor(inngest): centralize PostgREST header construction`

- [x] 4. **Add `TaskRepository` (read-only) + `EmployeeRuleRepository` skeletons + unit tests** `[ARCH-1 pt1]`

  **What to do**: In `src/repositories/`, add `TaskRepository` (read-only: `findById`, `findIdByThreadTs`, `findByApprovalTs`, status-message getter — exactly the reads `shared.ts` needs) and `EmployeeRuleRepository` (the CRUD `rule-handlers.ts` needs: get, count-confirmed, patch-confirm/reject/archive/rephrase). Follow the existing tenant-scoped Prisma repository pattern in `src/repositories/`. Add unit tests with a mocked Prisma. Do NOT adopt at call sites yet (Tasks 5,6).
  **Must NOT do**: Add WRITE methods to `TaskRepository` (read-only per finding). Don't change repository conventions.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 1. Blocks: 5, 6. Blocked By: none.
  **References**: `src/repositories/` (existing pattern, e.g. tenant-repository.ts); `src/gateway/slack/handlers/shared.ts:111,119,147,183,209` (reads to model); `src/gateway/slack/handlers/rule-handlers.ts:50,99,120,189,279,387,399` (ops to model).
  **Acceptance Criteria**:
  - [ ] Both repositories exist with unit tests; `TaskRepository` has zero write methods; `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `feat(repositories): add read-only TaskRepository and EmployeeRuleRepository`

> **CHECKPOINT W1** — `InngestStep` single-sourced; `mergeTaskMetadata`/`makePostgrestHeaders`/repos exist + unit-tested; build/test/lint green. **Wave 1 independently shippable.**

### WAVE 2 — Layering adoption + smell cleanup

- [x] 5. **Replace 5 raw-fetch sites in `shared.ts` with `TaskRepository`** `[ARCH-1 pt2]`

  **What to do** (re-grep — lines drift): In `src/gateway/slack/handlers/shared.ts`, replace the 5 raw-PostgREST `fetch` calls (≈111,119,147,183,209 — `findTaskIdByThreadTs`, `isTaskAwaitingApproval`, `isTaskAwaitingOverride`, `getTaskStatusMessage`) with `TaskRepository` calls (Task 4). Inject the repository (or a `prisma`/repo instance) into the helpers; preserve the exact return values/branching the handlers depend on (e.g. the `handleAlreadyProcessed` guard).
  **Must NOT do**: Change handler behavior, the awaiting-state logic, or `TERMINAL_STATUSES` usage. Don't add writes.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 6,7. Blocked By: 4.
  **References**: `src/gateway/slack/handlers/shared.ts:111,119,147,183,209`; `src/repositories/` `TaskRepository` (Task 4); `tests/**/slack/*`.
  **Acceptance Criteria**:
  - [ ] `grep -n "rest/v1" src/gateway/slack/handlers/shared.ts` → 0 (no raw PostgREST)
  - [ ] **Tier B**: full approval loop (real Airbnb→card→approve→reply) green. Evidence: `.sisyphus/evidence/task-5-tierB-*`
  - [ ] `pnpm test -- --run tests` green
        **Commit**: YES — `refactor(gateway): replace raw PostgREST with TaskRepository in slack shared helpers`

- [x] 6. **Replace 7 raw-fetch sites in `rule-handlers.ts` with `EmployeeRuleRepository`** `[ARCH-1 pt3]`

  **What to do** (re-grep): In `src/gateway/slack/handlers/rule-handlers.ts`, replace the 7 raw-PostgREST `fetch` calls (≈50,99,120,189,279,387,399 — confirm/count/archive/reject/rephrase-fetch/rephrase-save/get-ts) with `EmployeeRuleRepository` calls (Task 4). Preserve the rule-confirmation synthesis-threshold logic and Slack card update sequencing.
  **Must NOT do**: Change rule-extraction/confirmation behavior or the synthesis trigger. (This file is also decomposed in Task 20 — repo-first shrinks it; do NOT decompose here.)
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 5,7. Blocked By: 4.
  **References**: `src/gateway/slack/handlers/rule-handlers.ts:50,99,120,189,279,387,399`; `EmployeeRuleRepository` (Task 4); feedback-pipeline E2E guide.
  **Acceptance Criteria**:
  - [ ] `grep -n "rest/v1" src/gateway/slack/handlers/rule-handlers.ts` → 0
  - [ ] **Tier B**: a rule-extraction/confirm cycle works (feedback-pipeline Scenario). Evidence: `.sisyphus/evidence/task-6-tierB-*`
  - [ ] `pnpm test -- --run tests/**/rule*` green
        **Commit**: YES — `refactor(gateway): replace raw PostgREST with EmployeeRuleRepository in rule handlers`

- [x] 7. **Inject shared `prisma` into trigger + event handlers (fix conn-pool leak)** `[ARCH-NEW-2]`

  **What to do** (re-grep): Add a `prisma: PrismaClient` parameter to `registerTriggerHandlers()` and `registerEventHandlers()`; pass the module-level singleton from `src/gateway/server.ts` (the `opts.prisma ?? new PrismaClient()` singleton already used by routes). Remove the inline `new PrismaClient()` at `trigger-handlers.ts:71` and `event-handlers.ts:169`. Wrap `event-handlers.ts`'s `$disconnect` in a `finally` (or remove it entirely since the injected singleton is long-lived — do NOT `$disconnect` a shared singleton). Verify singleton lifecycle: ensure no shutdown `$disconnect` is bypassed.
  **Must NOT do**: `$disconnect` the shared singleton per-request; change the @mention/confirm routing behavior; touch `server.ts` socket-mode-lock wiring.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 5,6. Blocked By: none.
  **References**: `src/gateway/slack/handlers/trigger-handlers.ts:71,335`; `src/gateway/slack/handlers/event-handlers.ts:169,173`; `src/gateway/server.ts:98` (prisma singleton); `src/gateway/slack/handlers/index.ts` (registration wiring).
  **Acceptance Criteria**:
  - [ ] `grep -c "new PrismaClient" src/gateway/slack/handlers/trigger-handlers.ts src/gateway/slack/handlers/event-handlers.ts` → 0,0
  - [ ] **Tier B**: @mention→confirm→task dispatched→terminal (Slack trigger path) — capture `task_status_log`; confirm no Prisma connection-pool growth across ≥3 repeated clicks (psql `pg_stat_activity` count stable). Evidence: `.sisyphus/evidence/task-7-tierB-poolcount.txt`
        **Commit**: YES — `fix(gateway): inject shared prisma into slack trigger/event handlers (no per-click pool)`

- [x] 8. **Adopt `mergeTaskMetadata` at the 6 sites (+ P-01/P-02 then-in-await fix)** `[D-01 adopt, P-01, P-02]`

  **What to do** (re-grep): Replace the 6 inline fetch-read-modify-write metadata blocks (triage-and-ready.ts:142-161,186-207; approval-handler.ts:269-281; **approval-handler.ts** singular = lifecycle step `src/inngest/lifecycle/steps/approval-handler.ts`; approval-handler-reject.ts:43-46,197-219; lib/interaction-helpers.ts:102) with calls to `mergeTaskMetadata()` (Task 2). This INTENTIONALLY standardizes the 4 sites that skipped `.ok`-checks (documented behavior change — strictly safer). While here, fix the `.then((r)=>r.json())`-inside-`await` (P-01 approval-handler.ts:272, P-02 approval-handler-reject.ts:45) — but since those become `mergeTaskMetadata` calls, the then-chain is removed by the adoption itself; verify no residual then-in-await remains.
  **Must NOT do**: Touch `approval-handlers.ts` (plural, Bolt handler — different file). Leave any inline metadata-merge block behind.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 2. Blocked By: 2. **Do BEFORE Task 19 (decompose reviewing-path) and any decomp of these files (dedup-before-decompose).**
  **References**: the 6 sites above; `mergeTaskMetadata` (Task 2); AGENTS.md `approval-handler.ts` (singular) vs `approval-handlers.ts` (plural) distinction.
  **Acceptance Criteria**:
  - [ ] All 6 sites call `mergeTaskMetadata`; `grep -rn "\.then((r) => r.json())" src/inngest/lifecycle/steps/approval-handler*.ts` → 0
  - [ ] **Tier B**: approval + rejection loops both work (metadata writes intact). Evidence: `.sisyphus/evidence/task-8-tierB-*`
  - [ ] `pnpm test -- --run && pnpm test:integration` green
        **Commit**: YES — `refactor(lifecycle): adopt standardized mergeTaskMetadata at 6 sites`

- [x] 9. **Log silent catches + name magic numbers** `[E-01, E-02, E-03, M-01, M-02]`

  **What to do**: Replace `.catch(() => {})` with logged warns: `call-llm.ts:150` (`log.warn({ err }, 'Cost alert Slack post failed')`), `opencode-harness.mts:388,417` (`log.warn({ taskId: TASK_ID, err }, 'Failed to mark execution failed (non-fatal)')`). Name magic numbers: `guest-message-poll.ts:112` (`const LEAD_LOOKBACK_DAYS = 30; const LEAD_LOOKBACK_MS = LEAD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000`), `opencode-harness.mts:406` (`const MIN_DELIVERY_SESSION_MS = 30_000`). **Rebuild Docker** (harness changed).
  **Must NOT do**: Change any numeric value or control flow; don't touch the legit bare-catch in `lifecycle-helpers.ts:131` (docker-stop idempotency — optionally add `log.debug`).
  **Recommended Agent Profile**: Category `quick`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 2. Parallel w/ 10,11. Blocked By: none. **Do BEFORE Task 16 (harness decomp) — small diffs first.**
  **References**: `src/lib/call-llm.ts:150`; `src/workers/opencode-harness.mts:388,406,417`; `src/inngest/triggers/guest-message-poll.ts:112`.
  **Acceptance Criteria**:
  - [ ] `grep -n "catch(() => {})" src/lib/call-llm.ts src/workers/opencode-harness.mts` → 0; named constants present (git diff shows ONLY literal→named, zero value change)
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds; **Tier A** → `Done`. Evidence: `.sisyphus/evidence/task-9-tierA.txt`
        **Commit**: YES — `refactor: log previously-silent catches; name lookback/session magic numbers`

- [x] 10. **Zod-validate 2 casts; comment 6 legit casts; delete serve.ts dead lines; dashboard toast** `[A-01, A-02, A-03..08, DC-01, C-01]`

  **What to do**: (a) Add Zod parse/shape-check before the 2 unsafe casts — `archetype-generator.ts:224` (LLM response) and `admin-archetype-generate.ts:55` (request body). (b) Add one-line explanatory comments to the 6 legitimate `as unknown as` casts (jira-task-creation.ts:54-55, tool-parser.ts:76-77, execute.ts:113, server.ts:148, approval-handlers.ts ack, override-handlers.ts ack). (c) Delete the 15 commented-out dead lines in `serve.ts:3-30`, replacing with a single short rationale comment. (d) Replace `console.error` at `dashboard/src/panels/integrations/IntegrationsPage.tsx:128,140` with `toast.error(...)`.
  **Must NOT do**: Change the behavior of any cast site beyond adding validation/comments; remove the valuable deregistration rationale entirely (keep a 1-line summary).
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 9,11. Blocked By: none.
  **References**: `src/gateway/services/archetype-generator.ts:224`; `src/gateway/routes/admin-archetype-generate.ts:55`; `src/gateway/inngest/serve.ts:3-30`; `dashboard/src/panels/integrations/IntegrationsPage.tsx:128,140`; the 6 cast sites.
  **Acceptance Criteria**:
  - [ ] 2 casts preceded by validation; `grep -c "^// \|^import" src/gateway/inngest/serve.ts` shows dead lines removed; dashboard uses `toast.error`
  - [ ] `pnpm build && pnpm test -- --run && pnpm dashboard:build` green
        **Commit**: YES — `refactor: validate llm/request casts; document legit casts; remove dead serve.ts lines; dashboard toast`

- [x] 11. **Narrow config widening: `call-llm` + `interaction-classifier`** `[ENV — encryption EXCLUDED]`

  **What to do**: Migrate ONLY the NON-startup-critical `process.env` reads in `src/lib/call-llm.ts` (`SLACK_BOT_TOKEN`, `OPENCODE_GO_API_KEY`, `OPENROUTER_API_KEY`, `DATABASE_URL`) and `src/lib/interaction-classifier.ts` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY`) to lazy getters in `src/lib/config.ts` (add any missing ones as lazy/non-throwing). **EXCLUDE `src/lib/encryption.ts`** — its `ENCRYPTION_KEY` read is validated at gateway startup (startup-critical) per README, so leave it as-is. **EXCLUDE `server.ts`'s 14 startup-validation reads** (Metis guardrail).
  **Must NOT do**: Make config throw at import; touch `encryption.ts` or `server.ts` startup reads; move `platform_settings` DB lookups into config.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 2. Parallel w/ 9,10. Blocked By: none.
  **References**: `src/lib/config.ts` (lazy-getter pattern); `src/lib/call-llm.ts`, `src/lib/interaction-classifier.ts`; README "ENCRYPTION_KEY validated at gateway startup".
  **Acceptance Criteria**:
  - [ ] `call-llm.ts` + `interaction-classifier.ts` read via config; `encryption.ts` UNCHANGED; config still lazy (importing with unset var doesn't throw)
  - [ ] **Tier A** → `Done`; `pnpm build && pnpm test -- --run` green. Evidence: `.sisyphus/evidence/task-11-tierA.txt`
        **Commit**: YES — `refactor(config): migrate non-startup call-llm and interaction-classifier env reads`

> **CHECKPOINT W2** — no raw PostgREST in slack handlers; no per-click PrismaClient; metadata merge standardized; Tier B (lifecycle) + Tier A green. **Wave 2 independently shippable.**

### WAVE 3 — Worker-tools hygiene + OAuth hardening (independent)

- [x] 12. **Consolidate `notion-types` to one worker-tools-local `.ts`; delete dup copies** `[ARCH-15]`

  **What to do**: Create `src/worker-tools/notion/lib/notion-types.ts` (proper TypeScript) as the single worker-tools source for `NOTION_AUTH_URL`/`NOTION_TOKEN_URL`/`NOTION_API_VERSION`. Update `get-page.ts`, `append-blocks.ts`, `update-block.ts` to import from `./lib/notion-types.js` (worker-tools-local) — removing the cross-package `../../lib/notion-types.js` imports (append-blocks.ts:2, update-block.ts:2) that reach into `src/lib/`. Delete the dup `.js` copies `src/worker-tools/lib/notion-types.js` and the old `src/worker-tools/notion/lib/notion-types.js`. Keep `src/lib/notion-types.ts` (used by gateway `notion-oauth.ts` — legal for gateway).
  **Must NOT do**: Change the constant values; make worker-tools import from `src/lib/`; touch `notion-oauth.ts`'s import.
  **Recommended Agent Profile**: Category `deep`; Skills: [`adding-shell-tools`].
  **Parallelization**: Wave 3. Parallel w/ 13,14,15. Blocked By: none.
  **References**: `src/worker-tools/notion/{get-page,append-blocks,update-block}.ts`; `src/worker-tools/lib/notion-types.js`; `src/worker-tools/notion/lib/notion-types.js`; `src/lib/notion-types.ts` (gateway, keep).
  **Acceptance Criteria**:
  - [ ] `grep -rn "lib/notion-types" src/worker-tools` → only `./lib/notion-types` (no `../../lib/`); dup `.js` deleted
  - [ ] `pnpm exec tsx src/worker-tools/notion/get-page.ts --help` exit 0; `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `refactor(tools): consolidate notion-types to one worker-tools-local module`

- [x] 13. **SMELL-7: externalize `ZIP_CITY` + room-naming + street-norm to config; golden-diff** `[SMELL-7]`

  **What to do**: In `src/worker-tools/hostfully/get-checkouts.ts`, move `ZIP_CITY` (52-59), `deriveRoomId` room-name patterns (86-96), and the street-suffix normalization table (≈69-84) out of hardcoded constants into a config source: a committed default JSON (`src/worker-tools/hostfully/config/vlre-location-config.json`) loaded with an `optionalEnv('HOSTFULLY_LOCATION_CONFIG_JSON')` override. **The default-when-env-unset MUST reproduce today's hardcoded values EXACTLY**, including the `'Austin, TX'` fallback (line 307) and `'Casa'` room default. Do NOT build a config framework — a single JSON load + lookup. Prove byte-identity vs P-B golden.
  **Must NOT do**: Build a tenant-config-loader abstraction / plugin registry / strategy pattern (scope-creep trap); change ANY output byte; alter the fallback values.
  **Recommended Agent Profile**: Category `ultrabrain` (byte-identity-critical, live employees consume it); Skills: [`adding-shell-tools`, `hostfully-api`].
  **Parallelization**: Wave 3. Parallel w/ 12,15. Blocked By: P-B.
  **References**: `src/worker-tools/hostfully/get-checkouts.ts:44-96,307`; P-B golden output + branch-coverage checklist; `src/worker-tools/lib/require-env.ts` (`optionalEnv`).
  **Acceptance Criteria**:
  - [ ] `ZIP_CITY`/`deriveRoomId`/street-norm read from JSON config; `grep -n "ZIP_CITY = {" src/worker-tools/hostfully/get-checkouts.ts` → 0 (moved)
  - [ ] **Golden byte-diff**: `HOSTFULLY_MOCK=true pnpm exec tsx ...get-checkouts.ts --date <P-B-date> > after.json && diff .sisyphus/evidence/task-P-B-golden-checkouts.json after.json` → EMPTY (for every P-B date, covering ZIP-hit/miss/all-room-branches/street-norm). Evidence: `.sisyphus/evidence/task-13-golden-diff.txt`
  - [ ] **Tier A**: trigger an employee that consumes checkouts (cleaning-schedule path if available) or confirm `real-estate-motivation-bot-2` → `Done`. Evidence: `.sisyphus/evidence/task-13-tierA.txt`
        **Commit**: YES — `refactor(tools): externalize VLRE location config in get-checkouts (byte-identical)`

- [x] 14. **Extract `CONFIRMED_STATUSES` to `hostfully/lib/constants.ts` (dedup)** `[SMELL-7 dedup]`

  **What to do**: Extract the `CONFIRMED_STATUSES` set — duplicated in `get-checkouts.ts:44` and `get-reservations.ts:152` — into `src/worker-tools/hostfully/lib/constants.ts`; both import it. Value-identical.
  **Must NOT do**: Change the status set membership; conflate `get-reviews.ts` (Hostfully API, not the `reviews` table).
  **Recommended Agent Profile**: Category `quick`; Skills: [`adding-shell-tools`].
  **Parallelization**: Wave 3. Parallel w/ 12,13,15. Blocked By: none (can pair with 13).
  **References**: `src/worker-tools/hostfully/get-checkouts.ts:44`; `src/worker-tools/hostfully/get-reservations.ts:152`; `src/worker-tools/hostfully/lib/` (constants home).
  **Acceptance Criteria**:
  - [ ] `CONFIRMED_STATUSES` defined once in `lib/constants.ts`; both tools import it; `--help` exit 0; worker-tools hostfully tests green
        **Commit**: YES — `refactor(tools): extract shared CONFIRMED_STATUSES to hostfully/lib/constants`

- [x] 15. **OAuth retry: 5 token-exchanges + admin-github → `createHttpClient`/`createGitHubClient`** `[ARCH-NEW-3]`

  **What to do**: Wrap the OAuth token-exchange raw `fetch` calls in `withRetry()` (or `createHttpClient`): `notion-oauth.ts:101`, `google-oauth.ts:135`, `jira-oauth.ts:107,132`, `slack-oauth.ts:91`. Refactor the 3 raw GitHub API `fetch` calls in `admin-github.ts:51,180,264` to use the existing `createGitHubClient` from `src/lib/github-client.ts`.
  **Must NOT do**: Change OAuth redirect/HTML responses, token-storage logic, or the GitHub token cache. Don't alter the OAuth flow's success/error branching.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 3. Parallel w/ 12,13,14. Blocked By: none.
  **References**: `src/gateway/routes/{notion,google,jira,slack}-oauth.ts` (token-exchange fetch lines); `src/gateway/routes/admin-github.ts:51,180,264`; `src/lib/github-client.ts` (`createGitHubClient`); `src/lib/retry.ts` (`withRetry`); `src/lib/http-client.ts`.
  **Acceptance Criteria**:
  - [ ] Token-exchange calls wrapped in retry; `admin-github.ts` uses `createGitHubClient` (no raw `fetch`); `pnpm build && pnpm test -- --run` green
  - [ ] **Tier A** → `Done` (gateway routes intact). Evidence: `.sisyphus/evidence/task-15-tierA.txt`
        **Commit**: YES — `refactor(gateway): add retry to OAuth token exchange; use github-client in admin-github`

> **CHECKPOINT W3** — SMELL-7 byte-identical (golden-diff empty); notion-types single-sourced; OAuth hardened; Tier A green. **Wave 3 independently shippable.**

### WAVE 4 — Backend decomposition (EXTRACT-ONLY) + rebuild + Tier B

> **Universal Wave-4 guardrail**: extract only — zero control-flow / error-semantics / LLM-behavior change. A bug found mid-extraction = a NEW finding, never an inline fix. **MITIGATION for decompose-first ordering**: each task proves behavior preservation via its Tier B (or Tier A+rebuild) E2E BEFORE Wave 6 writes the new-shape tests. Preserve ALL Inngest step IDs. `approval-handler.ts` (singular, lifecycle step) ≠ `approval-handlers.ts` (plural, Bolt handler).

- [x] 16. **Decompose `opencode-harness.mts` (exec/delivery seam) + rebuild** `[SIZE-harness]`

  **What to do** (re-grep): Split the 3 large functions along the execution/delivery seam: extract `runExecutionPhase()` (≈235 lines) → `src/workers/lib/execution-phase.mts`, `runDeliveryPhase()` (≈216 lines) → `src/workers/lib/delivery-phase.mts`; keep `runOpencodeSession()` (≈212) in the harness or extract its session-mgmt into `harness-helpers.mts` (already exists from Plan 3). `main()` becomes a thin phase-dispatcher. Pure move — preserve output-contract semantics, provider routing, monitoring timing. **Rebuild Docker** after.
  **Must NOT do**: Change output-contract, provider routing, or phase logic. (Tasks 9's catch-logging + magic-number edits already landed — extract around them.)
  **Recommended Agent Profile**: Category `ultrabrain` (core worker entrypoint); Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 4. Parallel w/ 17,18,19,20. Blocked By: 1, 9.
  **References**: `src/workers/opencode-harness.mts` (re-grep current line ranges); `src/workers/lib/harness-helpers.mts` (Plan-3 home); AGENTS.md "Rebuild after every worker change"; `src/workers/__tests__/opencode-harness-prompt.test.ts`.
  **Acceptance Criteria**:
  - [ ] `wc -l src/workers/opencode-harness.mts` materially reduced; `execution-phase.mts` + `delivery-phase.mts` exist; existing harness tests green
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds; **Tier B** (covered in wave's Tier B run) → `Done` + metrics. Evidence: `.sisyphus/evidence/task-16-rebuild-tierB.txt`
        **Commit**: YES — `refactor(worker): split opencode-harness into execution and delivery phase modules`

- [x] 17. **Decompose `approval-handlers.ts` (Bolt, plural) — rename test FIRST** `[SIZE-approval-bolt]`

  **What to do** (re-grep): STEP 0 — rename `tests/unit/gateway/slack/guest-handlers.test.ts` → `approval-handlers.test.ts` (it tests these handlers; establishes the safety net). THEN split the 462-line `registerApprovalHandlers()` in `src/gateway/slack/handlers/approval-handlers.ts` (plural, Bolt) — extract each action into `handlers/approve-action.ts`, `handlers/edit-action.ts`, `handlers/reject-action.ts` (register from the `index.ts` orchestrator). Preserve ack/button-removal ordering, action IDs, the approval-flow merge (done in a prior plan), and socket-mode-lock wiring.
  **Must NOT do**: Touch `approval-handler.ts` (singular, lifecycle step). Change handler behavior or action IDs. Re-introduce `GUEST_*`.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 4. Parallel w/ 16,18,19,20. Blocked By: none (rename is self-contained step 0).
  **References**: `src/gateway/slack/handlers/approval-handlers.ts` (462-line fn); `src/gateway/slack/handlers/index.ts`; `tests/unit/gateway/slack/guest-handlers.test.ts` (to rename); `src/lib/slack-action-ids.ts`.
  **Acceptance Criteria**:
  - [ ] Test file renamed; `approval-handlers.ts` < 250 lines; 3 action files exist; all slack handler tests green
  - [ ] **Tier B** approval happy-path (in wave Tier B run). Evidence: `.sisyphus/evidence/task-17-tierB-*`
        **Commit**: YES — `refactor(slack): split approval-handlers into per-action modules; rename test`

- [x] 18. **Decompose `execute.ts` (executing step → machine-provisioner)** `[SIZE-execute]`

  **What to do** (re-grep): Extract the machine-provisioning + env-manifest assembly + Fly.io launch logic from the 238-line `executing` `step.run` callback in `src/inngest/lifecycle/steps/execute.ts` into helper functions (e.g. `src/inngest/lifecycle/lib/machine-provisioner.ts`). The `step.run` callback becomes a thin orchestrator. Preserve the step ID `executing` and all branch behavior. **Rebuild Docker** if any worker-bundle file changes (this is inngest, likely no rebuild — verify).
  **Must NOT do**: Change step ID, machine sizing, env-var assembly, or launch behavior.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 4. Parallel w/ 16,17,19,20. Blocked By: 1.
  **References**: `src/inngest/lifecycle/steps/execute.ts:76-313` (executing callback); `src/lib/env-manifest-builder.mts` if referenced; `tests/integration/.../lifecycle-*`.
  **Acceptance Criteria**:
  - [ ] `executing` callback materially shorter; `machine-provisioner` helper exists; step ID preserved; `pnpm build && pnpm test -- --run && pnpm test:integration` green
  - [ ] **Tier A** → `Done` (execution path intact). Evidence: `.sisyphus/evidence/task-18-tierA.txt`
        **Commit**: YES — `refactor(lifecycle): extract machine provisioning from executing step`

- [x] 19. **Decompose `reviewing-path.ts` (check-supersede + track-pending-approval)** `[SIZE-reviewing]`

  **What to do** (re-grep): Extract the two large `step.run` callbacks — `check-supersede` (≈141 lines) and `track-pending-approval` (≈138 lines) — from `src/inngest/lifecycle/steps/reviewing-path.ts` into helper functions (same file or `lifecycle/lib/`), leaving thin `step.run` wrappers. Preserve step IDs and supersede/pending-approval behavior. (Task 8 already adopted `mergeTaskMetadata` here — extract around it.)
  **Must NOT do**: Change supersede logic, the watchdog/expiry path, or step IDs.
  **Recommended Agent Profile**: Category `ultrabrain` (approval-path state machine); Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 4. Parallel w/ 16,17,18,20. Blocked By: 1, 8.
  **References**: `src/inngest/lifecycle/steps/reviewing-path.ts:74-214,258-395`; `tests/integration/.../lifecycle-*`.
  **Acceptance Criteria**:
  - [ ] Both callbacks extracted to helpers; step IDs preserved; `pnpm build && pnpm test -- --run && pnpm test:integration` green
  - [ ] **Tier B** approval + supersede paths (in wave Tier B + Scenario A). Evidence: `.sisyphus/evidence/task-19-tierB-*`
        **Commit**: YES — `refactor(lifecycle): extract supersede and pending-approval helpers from reviewing-path`

- [x] 20. **Decompose `rule-handlers.ts` (action-split, around repo calls)** `[SIZE-rule-bolt]`

  **What to do** (re-grep): AFTER Task 6 (repo adoption shrinks the file), split the remaining `registerRuleHandlers()` in `src/gateway/slack/handlers/rule-handlers.ts` by action (confirm/reject/rephrase modal) into focused modules registered from `index.ts`, mirroring Task 17's pattern. Preserve action IDs and rule-confirmation/synthesis behavior.
  **Must NOT do**: Change rule behavior or the synthesis threshold; re-inline the repository calls.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Wave 4. Parallel w/ 16,17,18,19. Blocked By: 6 (repo adoption first).
  **References**: `src/gateway/slack/handlers/rule-handlers.ts` (post-Task-6 shape); `src/gateway/slack/handlers/index.ts`; feedback-pipeline E2E guide.
  **Acceptance Criteria**:
  - [ ] `rule-handlers.ts` < 250 lines; per-action modules exist; slack/rule tests green
  - [ ] **Tier B** rule-confirm cycle (in wave run). Evidence: `.sisyphus/evidence/task-20-tierB-*`
        **Commit**: YES — `refactor(slack): split rule-handlers into per-action modules`

> **CHECKPOINT W4** — after ALL Wave-4 tasks: ONE `docker build`, then ONE Tier B run covering 16/17/19 + Scenario A for approval paths; `real-estate-motivation-bot-2` → `Done`; build/test/lint/integration green. **Wave 4 independently shippable.**

### WAVE 5 — Test infrastructure (foundation for new coverage)

- [x] 21. **Extend `cleanupTestData` with all tables (notIn guards from P-C); prove suite twice** `[GAP-03]`

  **What to do**: Using P-C's seeded-ID inventory, add the missing tables to `cleanupTestData()` in `tests/setup.ts`: full-delete the SCRATCH tables (`TaskMetric`, `FeedbackEvent`, `PendingApproval`, `EmployeeRule`, `SystemEvent`, `TenantIntegration`, `PropertyLock`, `AgentVersion`); use `notIn: [<seeded-ids>]` guards for SEEDED tables (`Archetype`, `Tenant`, `ModelCatalog`, `PlatformSetting`). Respect FK delete order (children before parents). Prove no leaks: run `pnpm test:integration` TWICE consecutively with NO DB reset between — both green.
  **Must NOT do**: Delete seeded rows (would break every subsequent test); wrong FK order (FK violations).
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 5. Blocks: 26,27,28 (new step tests depend on robust cleanup). Blocked By: P-C.
  **References**: `tests/setup.ts` (`cleanupTestData`); `.sisyphus/evidence/task-P-C-seed-ids.txt`; `prisma/schema.prisma` (FK order).
  **Acceptance Criteria**:
  - [ ] All target tables in `cleanupTestData`; seeded tables use `notIn` guards
  - [ ] `pnpm test:integration` run TWICE consecutively (no reset) → BOTH green. Evidence: `.sisyphus/evidence/task-21-integration-twice.txt`
        **Commit**: YES — `test: extend cleanupTestData to all tables with seed-aware guards`

- [x] 22. **Recover orphaned `tests/gateway/inngest-send.test.ts`** `[GAP-06]`

  **What to do**: `git mv tests/gateway/inngest-send.test.ts tests/unit/gateway/inngest-send.test.ts` (bringing it under `vitest.config.ts`'s `tests/unit/**` include). Fix relative imports if the depth changed. Confirm it runs and passes. Check `tests/gateway/` for any other orphans and relocate them too.
  **Must NOT do**: Change the test's assertions; lose git history (use `git mv`).
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 5. Parallel w/ 23,24,25. Blocked By: none.
  **References**: `tests/gateway/inngest-send.test.ts`; `vitest.config.ts` include globs.
  **Acceptance Criteria**:
  - [ ] File under `tests/unit/gateway/`; `pnpm test -- --run tests/unit/gateway/inngest-send.test.ts` green; `tests/gateway/` empty of orphans
        **Commit**: YES — `test: recover orphaned inngest-send test into unit suite`

- [x] 23. **Consolidate duplicate `call-llm` + `config` test files** `[GAP-04, GAP-12]`

  **What to do**: Merge `src/lib/__tests__/call-llm.test.ts` into `tests/unit/lib/call-llm.test.ts` (union of coverage: cost-breaker trip, rate-limit, timeout, Slack alert from one + Go routing, model caching, decimal-limit, catalog cost from the other). Reconcile the mock setups (`@prisma/client`, `platform-settings`) into one consistent pattern; document the test-only exports (`_resetAlertState`, `_resetGatewayModelCache`, `_resetPrisma`). Similarly merge `src/lib/__tests__/config.test.ts` into `tests/unit/lib/config.test.ts`. Delete the now-empty `src/lib/__tests__/` copies.
  **Must NOT do**: Drop any existing test case; weaken assertions.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 5. Parallel w/ 22,24,25. Blocked By: none.
  **References**: `tests/unit/lib/call-llm.test.ts` + `src/lib/__tests__/call-llm.test.ts`; `tests/unit/lib/config.test.ts` + `src/lib/__tests__/config.test.ts`.
  **Acceptance Criteria**:
  - [ ] One `call-llm.test.ts` + one `config.test.ts`; `src/lib/__tests__` copies deleted; union of cases present; `pnpm test -- --run` green
        **Commit**: YES — `test: consolidate duplicate call-llm and config test files`

- [x] 24. **Add `dashboard/vitest.config.ts` + CI step + expand smoke tests** `[GAP-05]`

  **What to do**: Add `dashboard/vitest.config.ts` (jsdom + `@testing-library/react`). Add `test:dashboard` script to root `package.json`. Add a CI step in `.github/workflows/deploy.yml` running dashboard tests. Expand `dashboard/src/tests/` with smoke tests for at least the approval-card render and one wizard step (beyond the current `StatusBadge`/utils-only coverage).
  **Must NOT do**: Block CI on flaky tests; over-test (a few high-value smoke tests, not exhaustive).
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Wave 5. Parallel w/ 22,23,25. Blocked By: none.
  **References**: `dashboard/package.json`; `dashboard/src/tests/smoke.test.tsx`; `.github/workflows/deploy.yml`; root `package.json` scripts.
  **Acceptance Criteria**:
  - [ ] `test -f dashboard/vitest.config.ts`; `pnpm test:dashboard` green; CI workflow runs dashboard tests
  - [ ] `pnpm dashboard:build` green. Evidence: `.sisyphus/evidence/task-24-dashboard-ci.txt`
        **Commit**: YES — `test(dashboard): add vitest config, CI step, and smoke tests`

- [x] 25. **Migrate 4 legacy mock files to `createLifecycleMocks`; doc patterns; fix 400ms wait** `[GAP-07, GAP-08]`

  **What to do**: Migrate the 4 files using the legacy `(mocked as any).step` mutation pattern (`lifecycle-guest-approval.test.ts`, `lifecycle-override.test.ts`, `lifecycle-rejection-feedback.test.ts`, `lifecycle-guest-delivery.test.ts`) to `createLifecycleMocks()`. Replace the real `await new Promise((r) => setTimeout(r, 200))` in `dev-preflight.test.ts` with `vi.useFakeTimers()`. Add a CONTRIBUTING note documenting the `vi.stubGlobal('setTimeout', (fn) => fn())` pattern used in lifecycle tests (full doc pass is Task 32 — minimal note here).
  **Must NOT do**: Change what the tests assert; introduce real-time waits.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 5. Parallel w/ 22,23,24. Blocked By: none.
  **References**: the 4 legacy files; `tests/helpers/lifecycle-mocks.ts` (`createLifecycleMocks`); `tests/unit/.../dev-preflight.test.ts`.
  **Acceptance Criteria**:
  - [ ] `grep -rln "(mocked as any).step" tests/` → 0; `dev-preflight.test.ts` uses fake timers (runs <50ms); `pnpm test -- --run && pnpm test:integration` green
        **Commit**: YES — `test: migrate legacy step mocks to createLifecycleMocks; fake-timer dev-preflight`

> **CHECKPOINT W5** — integration suite TWICE green; dashboard in CI; mock styles unified; orphan recovered. **Wave 5 independently shippable.**

### WAVE 6 — Test coverage (after cleanupTestData; tests the post-decomp shape)

> Tests assert CURRENT (post-Wave-4-decomposition) behavior. **If a test reveals a real bug, record it as a NEW finding — do NOT fix inline.** Use `createLifecycleMocks()`. All depend on Task 21 (cleanupTestData proven).

- [x] 26. **Tests: `reviewing-path` + `no-approval-path` (highest-risk)** `[GAP-01a]`

  **What to do**: Add `tests/unit/inngest/lifecycle-steps/reviewing-path.test.ts` and `no-approval-path.test.ts` covering the main branches (reviewing→approved/cancelled/failed, supersede, expiry; no-approval direct delivery). Use `createLifecycleMocks()`. Assert current behavior post-decomposition.
  **Must NOT do**: Fix bugs inline; over-mock to the point of testing nothing.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 6. Parallel w/ 27,28,29,30. Blocked By: 19, 21.
  **References**: `src/inngest/lifecycle/steps/reviewing-path.ts`, `no-approval-path.ts` (post-decomp); `tests/helpers/lifecycle-mocks.ts`; existing `lifecycle-*` tests as pattern.
  **Acceptance Criteria**:
  - [ ] Both test files exist with branch coverage; `pnpm test -- --run && pnpm test:integration` green
        **Commit**: YES — `test(lifecycle): add reviewing-path and no-approval-path coverage`

- [x] 27. **Tests: `triage-and-ready` + `validate-and-submit` + `notify-and-track`** `[GAP-01b]`

  **What to do**: Add direct test files for these 3 step modules covering their main branches (triage→ready/awaiting-input; validate→submit; notify+track). `createLifecycleMocks()`.
  **Must NOT do**: Fix bugs inline.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 6. Parallel w/ 26,28,29,30. Blocked By: 21.
  **References**: `src/inngest/lifecycle/steps/{triage-and-ready,validate-and-submit,notify-and-track}.ts`; `lifecycle-mocks.ts`.
  **Acceptance Criteria**:
  - [ ] 3 test files exist; `pnpm test -- --run && pnpm test:integration` green
        **Commit**: YES — `test(lifecycle): add triage, validate-submit, notify-track coverage`

- [x] 28. **Tests: `delivery-retry` + `approval-handler-reject` + `lifecycle-helpers`** `[GAP-01c]`

  **What to do**: Add direct test files for these 3 modules (delivery retry loop; reject path; the helpers incl. `mergeTaskMetadata`/`makePostgrestHeaders`/`patchTask`). `createLifecycleMocks()`. Note: `lifecycle-helpers` partially covered by Task 2's `mergeTaskMetadata` test — extend, don't duplicate.
  **Must NOT do**: Fix bugs inline; duplicate the Task-2 `mergeTaskMetadata` test.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 6. Parallel w/ 26,27,29,30. Blocked By: 21.
  **References**: `src/inngest/lifecycle/steps/{delivery-retry,approval-handler-reject,lifecycle-helpers}.ts`; `tests/unit/inngest/lifecycle-helpers.test.ts` (Task 2).
  **Acceptance Criteria**:
  - [ ] 3 test files (helpers extended); `pnpm test -- --run && pnpm test:integration` green
        **Commit**: YES — `test(lifecycle): add delivery-retry, reject, and helpers coverage`

- [x] 29. **Add `event-handlers` + `trigger-handlers` tests** `[GAP-02]`

  **What to do**: (The `guest-handlers.test.ts`→`approval-handlers.test.ts` rename already happened in Task 17 step 0.) Add `tests/unit/gateway/slack/event-handlers.test.ts` covering the `message` thread-reply collection + `app_mention` routing. Extend `handlers-trigger-confirm.test.ts` (or add `trigger-handlers.test.ts`) for the TRIGGER_CANCEL path and the input-collection timeout. Use the mock `boltApp` with `.use()` (per Plan-2 fix).
  **Must NOT do**: Re-rename (done in Task 17); change handler behavior.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Wave 6. Parallel w/ 26,27,28,30. Blocked By: 17 (rename).
  **References**: `src/gateway/slack/handlers/event-handlers.ts`, `trigger-handlers.ts`; existing `tests/unit/gateway/slack/*`.
  **Acceptance Criteria**:
  - [ ] `event-handlers.test.ts` exists; TRIGGER_CANCEL + timeout covered; `pnpm test -- --run` green
        **Commit**: YES — `test(slack): add event-handlers and trigger-cancel/timeout coverage`

- [x] 30. **Idempotency (double-approve) + soft-delete filtering tests** `[GAP-09, GAP-10]`

  **What to do**: (a) Add a lifecycle-layer test: fire two `employee/approval.received` for the same task; assert the second is a no-op (task stays `Approved`, delivery machine spawned once). (b) Add integration tests asserting soft-delete filtering (`deleted_at IS NULL`) for `Archetype`, `TenantIntegration`, and `ModelCatalog` queries (mirroring the existing Tenant soft-delete test).
  **Must NOT do**: Change production idempotency/soft-delete logic to make tests pass (if a real gap is found, file it as a NEW finding).
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Wave 6. Parallel w/ 26,27,28,29. Blocked By: 21.
  **References**: `src/inngest/lifecycle/steps/approval-handler.ts:216` (approve patch); `tests/integration/multi-tenancy.test.ts:222` (Tenant soft-delete pattern); Archetype/TenantIntegration/ModelCatalog repositories.
  **Acceptance Criteria**:
  - [ ] Double-approve test asserts single delivery; soft-delete tests for 3 models green
  - [ ] **Tier B**: a real double-click on Approve in Slack results in exactly one delivery. Evidence: `.sisyphus/evidence/task-30-tierB-idempotent.txt`
        **Commit**: YES — `test: add approval idempotency and soft-delete filtering coverage`

> **CHECKPOINT W6** — all 8 step modules have direct tests; handler coverage added; idempotency + soft-delete covered; suite green twice. **Wave 6 independently shippable.**

### WAVE 7 — Onboarding docs + scaffolding templates (dedicated, ship last)

- [x] 31. **FULL template set: shell-tool + gateway-route + archetype + 3 test-type skeletons** `[GAP-14, GAP-15]`

  **What to do**: Create annotated, copy-paste-ready skeletons: (a) `src/worker-tools/_template/example-tool.ts` (requireEnv/optionalEnv/getArg/unescapeShellArg/mock-mode/`import.meta.url` main-guard); (b) a "Adding a Gateway Route" annotated example in CONTRIBUTING.md (Router factory + Zod + sendError/sendSuccess + admin-key middleware + optional Prisma injection); (c) an archetype seed skeleton (or annotated reference in `creating-archetypes` skill); (d) three test skeletons (unit, integration, dashboard) showing the canonical patterns (supertest+injected-Prisma for routes, `createLifecycleMocks` for lifecycle, `@testing-library/react` for dashboard).
  **Must NOT do**: Make the template-tool a registered/active tool; duplicate full guides — link them.
  **Recommended Agent Profile**: Category `writing`; Skills: [`adding-shell-tools`, `creating-archetypes`].
  **Parallelization**: Wave 7. Parallel w/ 32,33,34,35. Blocked By: Waves 1-6 (templates reflect final patterns).
  **References**: `src/worker-tools/slack/post-message.ts` (correct tool pattern); `src/gateway/routes/admin-employee-trigger.ts` (route pattern); `tests/helpers/lifecycle-mocks.ts`; `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`.
  **Acceptance Criteria**:
  - [ ] Template files exist; gateway-route + 3 test-type examples in CONTRIBUTING; `pnpm exec tsx src/worker-tools/_template/example-tool.ts --help` exit 0; `pnpm build` clean
        **Commit**: YES — `docs: add shell-tool, gateway-route, archetype, and test templates`

- [x] 32. **CONTRIBUTING: First PR + unit-vs-integration rule + test patterns + log-vs-logger** `[GAP-08, GAP-09, GAP-11, GAP-16]`

  **What to do**: Add to CONTRIBUTING.md: (a) "Your First PR" section (recommend a shell-tool addition as lowest-risk first change; exact pre-PR commands `pnpm test -- --run`/`pnpm lint`/`pnpm build`; smoke-test curl). (b) "Where to put your test" decision table (no-DB→`tests/unit/`; needs-DB→`tests/integration/`; dashboard→`dashboard/src/tests/`; never `tests/gateway/`). (c) "Writing Gateway Route Tests" + "Writing Shell Tool Tests" pattern sections. (d) Reinforce the `log` (inngest) vs `logger` (gateway routes) convention with the directory rule + the `vi.stubGlobal('setTimeout')` note.
  **Must NOT do**: Rewrite existing CONTRIBUTING sections wholesale; restate AGENTS.md.
  **Recommended Agent Profile**: Category `writing`; Skills: [].
  **Parallelization**: Wave 7. Parallel w/ 31,33,34,35. Blocked By: none.
  **References**: `CONTRIBUTING.md`; `tests/unit/gateway/routes/*` (route test pattern); `tests/helpers/lifecycle-mocks.ts`.
  **Acceptance Criteria**:
  - [ ] CONTRIBUTING has "Your First PR", test-location table, route/tool test patterns, log-vs-logger note; links not duplications
        **Commit**: YES — `docs(contributing): add first-PR guide, test-location rule, and test patterns`

- [x] 33. **README fixes: port table + lifecycle states + collapse deprecated section** `[GAP-05, GAP-06, GAP-07]`

  **What to do**: Fix README.md: (a) port table — relabel `54331` as PostgREST/Pooler (not Kong); add/clarify Kong at `54321` or remove. (b) lifecycle state list → full 13 states (or link `docs/guides/...-inngest-lifecycle-steps-explained.md`). (c) collapse/move the deprecated "Registering Projects" section to an appendix or callout. (d) Show `pnpm test -- --run` (one-shot) in the Testing section, noting bare `pnpm test` is watch mode.
  **Must NOT do**: Remove the deprecated section's info entirely (move/collapse); change active employee descriptions.
  **Recommended Agent Profile**: Category `writing`; Skills: [].
  **Parallelization**: Wave 7. Parallel w/ 31,32,34,35. Blocked By: none.
  **References**: `README.md` (port table ~line 39, lifecycle ~line 55, Registering Projects ~74-118, Testing ~232); `docker/.env.example` (port truth: Kong=54321, Pooler=54331).
  **Acceptance Criteria**:
  - [ ] Port table correct (PostgREST@54331); lifecycle shows 13 states or links the guide; deprecated section collapsed; `--run` shown
        **Commit**: YES — `docs(readme): fix port labels, lifecycle states, collapse deprecated section`

- [x] 34. **.env.example + new-contributor guide: docker/.env + SUPABASE keys + model note + task-stuck** `[GAP-04, GAP-12, GAP-19, GAP-20, GAP-21]`

  **What to do**: (a) `.env.example` — add a Supabase comment block explaining `SUPABASE_SECRET_KEY`/`SUPABASE_ANON_KEY` come from `docker/.env` (`SERVICE_ROLE_KEY`/`ANON_KEY`); add a note that for local E2E, override `OPENROUTER_MODEL` to `deepseek/deepseek-v4-flash`. (b) new-contributor guide — explain `pnpm setup` auto-creates `docker/.env` and what it is; add `SUPABASE_SECRET_KEY`/`ANON_KEY` to the env checklist; add a "task is stuck/failed" troubleshooting entry (docker logs + harness grep + `debugging-lifecycle` skill).
  **Must NOT do**: Put real secret values in `.env.example`; duplicate the docker/.env file contents.
  **Recommended Agent Profile**: Category `writing`; Skills: [].
  **Parallelization**: Wave 7. Parallel w/ 31,32,33,35. Blocked By: none.
  **References**: `.env.example` (Supabase section); `docker/.env.example`; `docs/guides/2026-06-07-2022-new-contributor-setup.md`; AGENTS.md Task Debugging Quick Reference.
  **Acceptance Criteria**:
  - [ ] `.env.example` explains SUPABASE key source + model note; guide explains docker/.env + has task-stuck entry + SUPABASE keys in checklist
        **Commit**: YES — `docs: explain docker/.env + supabase keys; add task-stuck troubleshooting`

- [x] 35. **AGENTS.md + shell-tool guide + troubleshooting corrections** `[GAP-01, GAP-02, GAP-13, GAP-17, GAP-18]`

  **What to do**: (a) AGENTS.md — add `session-manager.ts` to the `src/workers/lib/` deprecation EXCEPTION list (it's ACTIVE, imported by the harness, like `postgrest-client.ts`); add a note that `anthropic/claude-haiku-4-5` is the approved verification/judge model (distinct from execution models, the only permitted Anthropic model); document that `src/workers/lib/postgrest-client.ts` uses raw `process.env` with null-checks intentionally (worker startup guarantees differ — don't "fix" with requireEnv). (b) Shell-tool guide — fix the code example to use `requireEnv()` not raw `process.env`. (c) `troubleshooting.md` — mark/remove the stale deprecated-engineering entries (#3, #6, #7) and add current active-employee failure entries. (d) Link `debugging-lifecycle` skill from CONTRIBUTING/new-contributor guide.
  **Must NOT do**: Rename `session-manager.ts`; rewrite AGENTS.md wholesale.
  **Recommended Agent Profile**: Category `writing`; Skills: [].
  **Parallelization**: Wave 7. Parallel w/ 31,32,33,34. Blocked By: none.
  **References**: AGENTS.md (Deprecated Components table, Approved LLM Models); `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`; `docs/guides/2026-04-01-2110-troubleshooting.md`; `src/workers/lib/session-manager.ts`, `postgrest-client.ts`.
  **Acceptance Criteria**:
  - [ ] AGENTS.md has session-manager exception + claude-haiku note + postgrest-client raw-env note; shell-tool guide uses requireEnv; troubleshooting stale entries fixed
        **Commit**: YES — `docs: correct AGENTS deprecation/model notes, shell-tool guide, troubleshooting`

- [x] 36. **Documentation freshness: new modules + decomposed files** `[Documentation Freshness]`

  **What to do**: Per AGENTS.md Documentation Freshness — update AGENTS.md/README/CONTRIBUTING to reference the new/moved modules from this plan: `TaskRepository`/`EmployeeRuleRepository` (data-access pattern), `mergeTaskMetadata`/`makePostgrestHeaders`, the relocated `InngestStep` (now in `events.ts`), the decomposed files (`execution-phase.mts`/`delivery-phase.mts`, the per-action slack handler modules, `machine-provisioner.ts`), the consolidated `notion-types`, the SMELL-7 location config, the new dashboard test config, and the FULL template set. Update "Project Structure" notes where homes changed.
  **Must NOT do**: Duplicate CONTRIBUTING into AGENTS (link); add employee-specific content to shared docs.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Wave 7. Blocked By: Waves 1-6 complete (docs reflect final state).
  **References**: AGENTS.md, README.md, CONTRIBUTING.md; all new/moved files from this plan.
  **Acceptance Criteria**:
  - [ ] Docs reference the new repos/helpers/decomposed modules/templates; `grep -c "TaskRepository\|mergeTaskMetadata\|execution-phase" AGENTS.md CONTRIBUTING.md` ≥ 1
        **Commit**: YES — `docs: update AGENTS/README/CONTRIBUTING for fourth maintainability pass`

> **CHECKPOINT W7** — docs accurate; FULL template set present; AGENTS/README/CONTRIBUTING current; `pnpm dashboard:build` green. **Wave 7 independently shippable.**

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user; get explicit "okay" before completing. Never mark F1-F4 checked before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists (read file, curl, run command). For each "Must NOT Have": search for forbidden patterns — reject with file:line (server.ts startup reads still raw? TaskRepository gained write methods? config framework added for SMELL-7? behavior changed in a T5 extraction? new barrels? a test fixes a bug inline?). Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run` + `pnpm test:integration` (TWICE) + `pnpm dashboard:build`. Review changed files for new `as any`/`@ts-ignore`, empty catches introduced, `console.*` in prod, commented-out code, unused imports, AI slop. Confirm no decomposed file regressed.
      Output: `Build [P/F] | Lint [P/F] | Unit [N/N] | Integration×2 [P/F] | Dashboard [P/F] | VERDICT`

- [x] F3. **Real Manual QA — Tier A + Tier B + Dashboard parity** — `unspecified-high` (+ `e2e-testing`, `playwright`)
      Tier A: `real-estate-motivation-bot-2` → `Done` + metrics (psql AND PostgREST) + Slack. Tier B: full approval loop → delivery. SMELL-7: golden-diff EMPTY. Dashboard: load touched pages, zero console errors. Evidence → `.sisyphus/evidence/final-qa/`.
      Output: `Tier A [P/F] | Tier B [P/F] | SMELL-7 diff [P/F] | Dashboard [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read the actual diff. Verify 1:1 — everything in spec built, nothing beyond (no behavior change in extractions except the documented mergeTaskMetadata standardization, no SMELL-7 config-framework creep, no value change in named magic numbers, no inline bug-fixes in new tests). Detect cross-task contamination (esp. the `approval-handler.ts` vs `approval-handlers.ts` trap). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N] | Unaccounted [CLEAN/N] | VERDICT`

- [x] F5. **Docs freshness + git cleanup + Telegram notify** — `deep`
      After F1-F4 APPROVE and user okay: confirm Documentation Freshness done (Task 36); run Git Cleanup (`git status --short` must be clean — commit stray plan/notepad/evidence files, delete temps). **Send Telegram completion**: `pnpm exec tsx scripts/telegram-notify.ts "✅ Fourth maintainability pass complete — all tasks done, baseline green. Come back to review."`
      **Must NOT do**: Mark F1-F4 checked before the user's explicit okay.

---

## Commit Strategy

- One commit per task (conventional commits: `feat`, `refactor`, `chore`, `perf`, `docs`, `test`).
- Pre-commit: `pnpm build && pnpm test -- --run && pnpm lint` (+ `pnpm dashboard:build` for dashboard). Never `--no-verify`.
- No AI / Co-authored-by trailers.
- Wave themes: W0 gates · W1 helpers · W2 layering+smells · W3 worker-tools+oauth · W4 decomp · W5 test-infra · W6 coverage · W7 docs.

## Success Criteria

### Verification Commands

```bash
pnpm build && pnpm lint && pnpm test -- --run && pnpm test:integration && pnpm dashboard:build   # all green
grep -rn "GetStepTools\|type InngestStep" src/ | grep -v node_modules                            # exactly 1 (events.ts)
grep -rln "gateway/inngest/client" src/inngest --include="*.ts"                                  # empty (InngestStep moved)
grep -rn "fetch(" src/gateway/slack/handlers/shared.ts src/gateway/slack/handlers/rule-handlers.ts | grep rest/v1  # empty (repos)
grep -c "new PrismaClient" src/gateway/slack/handlers/trigger-handlers.ts src/gateway/slack/handlers/event-handlers.ts  # 0,0
test -f dashboard/vitest.config.ts                                                                # exists
HOSTFULLY_MOCK=true tsx src/worker-tools/hostfully/get-checkouts.ts --date <fixture> | diff golden.json -  # empty
```

### Final Checklist

- [x] All "Must Have" present; all "Must NOT Have" absent
- [x] Layering fixed (repos, InngestStep move, prisma injection); dedup helpers adopted
- [x] SMELL-7 externalized + byte-identical; notion-types consolidated; OAuth hardened
- [x] 5 backend files decomposed (extract-only); Tier B + rebuild green
- [x] 8 lifecycle steps tested; test-infra fixed; cleanupTestData proven twice; dashboard in CI
- [x] Docs accurate; FULL template set present; AGENTS/README/CONTRIBUTING updated
- [ ] F1-F4 APPROVE + user okay; Telegram notify sent
