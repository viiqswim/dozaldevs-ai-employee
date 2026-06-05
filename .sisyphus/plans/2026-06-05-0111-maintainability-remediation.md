# Maintainability Remediation — AI Employee Platform

## TL;DR

> **Quick Summary**: Execute a prioritized maintainability pass on the ~42K-line AI-employee platform before coworkers onboard. Fix active bugs first, delete ~5K lines of dead code, then decompose giant files and establish shared foundations — structured as 4 independently-shippable waves.
>
> **Deliverables**:
>
> - Working CI test gate (currently silently broken)
> - Active bug fixes: cost-breaker, shell-injection, `unescapeShellArg`, `TERMINAL_STATUSES`
> - ~4,764 lines of deprecated worker code deleted + knip cleanup
> - Decomposed `employee-lifecycle.ts`, `slack/handlers.ts`, `opencode-harness.mts`, 2 dashboard god-components
> - Shared foundations: central config (top-3 files), `task-status.ts`, `sendError`, shared logger, HTTP-client factory, Hostfully tool client
> - DB migrations: hot-path FK indexes + `deleted_at` on 6 active tables
> - Conventions: ESLint `any`→`error`, coverage report, `CONTRIBUTING.md`, worker-tools skill update, dashboard `SearchableSelect`/copy fixes
>
> **Estimated Effort**: XL (50+ tasks) — but each wave is independently shippable
> **Parallel Execution**: YES — 4 ordered waves; tasks within a wave parallelize
> **Critical Path**: CI gate → active bugs → TERMINAL_STATUSES → dead-code delete → foundations → decompositions → approval-flow unification (last)

---

## Context

### Original Request

"Find any and all opportunities to make this codebase better… I need it to be as maintainable as possible [before sharing with coworkers, before large refactors become impractical]." Findings recorded continuously to a markdown document.

### Source Findings Document

`/.sisyphus/drafts/2026-06-05-0111-maintainability-audit.md` — the comprehensive audit (8 dimensions, 6 parallel subsystem deep-dives, file:line precise). Every task below references a finding ID (e.g. `[ARCH-3]`) from that document. **A copy is published to `docs/guides/` for coworkers (Task 0).**

### Interview Summary

**Key user decisions** (confirmed):

- Deprecated worker code → **DELETE** (git history preserves it)
- Full data-access unification (ARCH-1) → **DEFER**; do ARCH-2 (task-creation consolidation) + document the dual Prisma/PostgREST pattern instead
- ESLint `any`/`unused-vars` → **escalate to `error` in Wave 1**
- Coverage → **report-only** (no CI threshold yet)
- Execution shape → **4 independently-shippable waves, one plan**

**Audit headline**: Type safety (0 `@ts-ignore`) and test count (~165 files) are STRENGTHS. The real risks are giant files, ~15% dead code, missing shared foundations, and a handful of latent/active bugs.

### Metis Review (gaps addressed)

- **CI gate is the #1 under-weighted item** — likely "silently green while DB tests skip." Made Wave-1 Task 1.
- **`watchdog.ts` verified SAFE to delete** — it's the deprecated engineering watchdog, commented out of `src/gateway/inngest/serve.ts`; the ACTIVE watchdog is the separate `src/inngest/triggers/reviewing-watchdog.ts`.
- **Approval-flow unification** — there are currently TWO parallel approval-button systems (generic `APPROVE`/`REJECT` and guest-specific `GUEST_APPROVE`/`GUEST_EDIT`/`GUEST_REJECT`). They MERGE into ONE generic Approve/Edit/Reject flow used by every employee (user decision: always 3 buttons; "Edit" is a generic capability, not guest-specific). Done in one pass — no dual-registration/deprecation window needed since nothing has launched. Placed late so it lands after the handler decomposition (Task 21).
- **Shell-injection in `rotate-property-code.ts` is a security bug**, not a smell → promoted to Wave 1.
- **Scope-creep traps** flagged: central config (don't touch all 289 sites), shared HTTP client (don't rewrite all clients), decompositions (extract only, no logic changes).
- **Ordering constraints**: TERMINAL_STATUSES before task-creation consolidation & handlers decomposition; dead-code delete before decompositions; soft-delete migration before lifecycle decomposition.

---

## Work Objectives

### Core Objective

Reduce onboarding friction and refactor risk by fixing latent/active bugs, removing dead code, decomposing the largest files, and establishing the shared foundations (config, logging, data-access patterns, conventions) that prevent drift as the team grows — without changing any externally-observable behavior.

### Concrete Deliverables

See TL;DR. Every deliverable maps to finding IDs in the audit doc.

### Definition of Done

- [ ] `pnpm build && pnpm test -- --run && pnpm lint` all green
- [ ] CI gate verified to actually run tests (deliberate-failure PR catches a break)
- [ ] All 4 active bugs fixed and verified via the executable criteria below
- [ ] `git ls-files src/workers/orchestrate.mts` returns nothing (dead code gone)
- [ ] `real-estate-motivation-bot-2` reaches `Done` after every lifecycle/harness change
- [ ] Slack UX Scenario A (approve happy path) passes after Slack-flow changes

### Must Have

- Each wave independently shippable (safe to stop after any wave)
- Every DB migration followed by PostgREST schema-cache reload + curl verification
- Per-task E2E for anything touching lifecycle/harness/approval

### Must NOT Have (Guardrails from Metis)

- **NO logic changes during any decomposition** — extract only; a bug found mid-extraction becomes a new finding, not an inline fix
- **NO touching all 289 `process.env` sites** — central config covers the top-3 files only
- **NO rewriting service clients** — HTTP-client factory + `slack-client.ts` only
- **NO full ARCH-1 data-access unification** — deferred by user decision
- **NO Prisma schema cleanup migration** for deprecated models — `// DEPRECATED` comments only
- **NO keeping a second "guest-only" approval card or handler path** — the merge in Task 32 must leave exactly ONE generic Approve/Edit/Reject flow for all employees
- **NO touching `docs/employees/guest-messaging.md` or archetype fields** during the approval-flow unification
- **NO "verify it works" / "user manually tests"** acceptance criteria

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (~165 test files, Vitest + global Postgres setup)
- **Automated tests**: Tests-after for refactors (extraction preserves existing tests green); new unit tests for new shared modules (`task-status.ts`, `config.ts`, `http-client.ts`)
- **Framework**: `vitest` (root config) + `dashboard/vite.config.ts` for dashboard
- **No new framework needed.** Lean on existing suite + the E2E guides in `docs/testing/`.

### QA Policy

- **DB migrations**: `NOTIFY pgrst, 'reload schema'` then `curl localhost:54331/rest/v1/<table>?limit=1` returns `[]` (not a PGRST schema error).
- **CLI tools**: `interactive_bash`/`Bash` run the tool with `--help` + a real arg; assert JSON shape + exit code.
- Evidence → `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

### E2E VERIFICATION PROTOCOL (MANDATORY — runs after EVERY task)

> **Goal: 100% confidence that every change still works from a real user's perspective — not just build + unit tests.** Every task has an assigned verification tier (see the **Verification Tier Map** in Execution Strategy). A task is **NOT complete** until its tier passes and evidence is captured. The executor runs the gate immediately after the work, before starting the next task. If a gate fails, STOP — the change broke something; fix or revert before proceeding.
>
> **Prerequisites (confirm once at session start)**: services live (`pnpm dev`), `curl localhost:7700/health` OK, Inngest OK, Slack Socket Mode connected (`tail /tmp/ai-dev.log | grep "Socket Mode"`), worker Docker image built. Load the `e2e-testing` skill. Airbnb test account + Hostfully test resources per `docs/employees/guest-messaging.md`. Browser automation via Playwright over CDP (see `e2e-testing` skill).

**Tier S — Smoke (non-runtime changes: docs, lint, coverage, pure dashboard UI)**

1. `pnpm build && pnpm test -- --run && pnpm lint` all green.
2. For dashboard tasks: open the affected page in the browser (`localhost:7700/dashboard/...`), confirm it renders with real data and shows zero console errors (screenshot evidence).

**Tier A — Fast runtime smoke (runtime changes NOT on the approval/guest path)**

1. Run Tier S first.
2. **Trigger an employee from the actual dashboard**: open `/dashboard/employees`, trigger `real-estate-motivation-bot-2` (VLRE) — or curl the trigger endpoint.
3. **Review the logs**: open the task's log viewer (`/dashboard/tasks/:id/logs`) — confirm clean execution, no errors/retries.
4. **Review the task**: confirm it transitions to `Done` in the task feed.
5. **Look at the database records**: `psql` AND PostgREST (`curl localhost:54331/...`) — confirm the `tasks` row is `Done` and a `task_metrics` row exists.
6. **Check Slack**: confirm the expected message posted in the channel (the platform bot), and the "received" notice updated to its final state.

- Evidence: `.sisyphus/evidence/task-{N}-tierA-{dashboard,logs,db,slack}.{png,txt}`

**Tier B — Full approval / real-guest loop (changes touching lifecycle approval, Slack handlers, approval cards, task-creation, harness delivery, blocks, or the guest path)**

1. Run Tier A first (fast confidence the no-approval path is intact).
2. **Send a real message from Airbnb**: using the Airbnb test account in the browser, send a guest message → this fires the Hostfully `NEW_INBOX_MESSAGE` webhook (or simulate the webhook if the account is unavailable, per README).
3. **Review logs + task**: watch `task_status_log` transitions (`Received → … → Reviewing`); confirm no errors.
4. **Check Slack**: confirm a drafted reply + approval card posts in the channel with working buttons.
5. **Approve in Slack**: click Approve (or the manual approval-event fallback in AGENTS.md).
6. **Confirm delivery on Airbnb**: the reply is actually sent back via Hostfully and visible in the Airbnb thread.
7. **Look at the database**: `tasks` → `Done`, `pending_approvals` resolved, `task_metrics` row — verified via psql AND PostgREST.

- Evidence: `.sisyphus/evidence/task-{N}-tierB-{airbnb-msg,slack-card,slack-approve,airbnb-reply,db}.{png,txt}`

---

## Execution Strategy

> **4 ordered, independently-shippable waves.** A wave fully completes (incl. its checkpoint) before the next begins. Tasks WITHIN a wave parallelize. Stopping after any wave leaves the codebase in a better, working state.
>
> **Every task ends with a mandatory real-E2E verification gate** (tier assigned in the Verification Tier Map above; protocol in Verification Strategy). The task is not done until its gate passes with captured evidence. This guarantees no change ships on build+unit-tests alone — each is proven from a real user's perspective (dashboard trigger, logs, tasks, DB records, real Airbnb message, Slack).

### Wave Map

```
WAVE 1 — Stabilize & Stop the Bleeding (ship-safe; makes everything else verifiable)
├── 1. Fix CI test gate (BUILD-3) ............... [BLOCKS ALL — do first]
├── 2. Fix shell-injection + spin-wait (SMELL-3)  [security]
├── 3. Fix cost circuit breaker (SMELL-4)
├── 4. Fix parseInt cost-limit (SMELL-5)
├── 5. Add unescapeShellArg to 3 tools (SMELL-2)
├── 6. Unify TERMINAL_STATUSES → task-status.ts (ARCH-3) [blocks 8, 21]
├── 7. Delete deprecated worker + inngest code (BUILD-1) [blocks 22-24]
├── 8. knip cleanup + false-positive fix (BUILD-7)
├── 9. Escalate ESLint any/unused → error (TYPE-1)
└── 10. Add coverage tooling (report-only) (BUILD-5)
   ↳ CHECKPOINT W1: build+test+lint green; CI catches a deliberate failure

WAVE 2 — Shared Foundations (unblock clean decomposition; prevent drift)
├── 11. Central config module + top-3 files (ARCH-11)
├── 12. Shared createLogger across 30 routes (ARCH-5)
├── 13. sendError + uuidField exports (ARCH-6, gateway F12)
├── 14. Consolidate task-creation → ARCH-2 (depends 6) + rename file
├── 15. DB migration: hot-path FK indexes (ARCH-9)
├── 16. DB migration: deleted_at on 6 active tables (ARCH-10)
├── 17. Shared HTTP-client factory + slack-client (ARCH-12)
├── 18. Hostfully tool client + paginator (TOOLS-1)
├── 19. worker-tools requireEnv/getArg helpers (TOOLS-2)
└── 20. status CHECK constraint + slack-blocks types (TYPE-3, TYPE-4)
   ↳ CHECKPOINT W2: migrations verified via PostgREST; E2E green

WAVE 3 — Decompositions (one file per task; extract-only)
├── 21. Decompose slack/handlers.ts (SIZE-5; depends 6)
├── 22. Decompose opencode-harness.mts (SIZE-3; depends 7) — de-dup checkOutputFiles FIRST
├── 23. Decompose employee-lifecycle.ts — helpers+tenant-env (SIZE-4; depends 7,16)
├── 24. Decompose employee-lifecycle.ts — approval/delivery steps (depends 23)
├── 25. Extract archetype-generator prompts (SIZE-6)
├── 26. Decompose dashboard TaskDetail.tsx (DASH-1)
└── 27. Decompose dashboard RulesPanel.tsx (DASH-1)
   ↳ CHECKPOINT W3: E2E (no-approval + approval) green; pages render

WAVE 4 — Conventions, Docs & Approval-Flow Unification (ship last)
├── 28. Dashboard SearchableSelect + end-user copy (DASH-2)
├── 29. Dashboard shared components/dedup (DASH-3, DASH-4)
├── 30. worker-tools skill + CONTRIBUTING.md + archive scripts (TOOLS-3, DOC-1/2, BUILD-6)
├── 31. Remove employee-specific language from shared files: data + blocks (ARCH-8/ARCH-13)
├── 32. Merge guest + generic approval into ONE flow for all employees (ARCH-8)
└── 33. Final Verification Wave + docs freshness + notify
   ↳ CHECKPOINT W4: full E2E; docs updated

Critical Path: 1 → 6 → 7 → 16 → 23 → 24 → 31 → 32 → 33
```

### Dependency Notes

- **Task 1 blocks everything** (verifiability).
- **6 (TERMINAL_STATUSES) before 14 & 21.**
- **7 (delete) before 22, 23, 24.**
- **16 (soft-delete migration) before 23/24** (extracted DB helpers must be soft-delete-aware).
- **32 merges the two approval flows into ONE generic flow** (deletes all `GUEST_*`) — single pass, no dual-registration/window (not launched yet). Pairs with Task 21 (handlers decomposition).

### Verification Tier Map (every task gates on its tier — see E2E Verification Protocol)

| Task                         | Tier                          | Task                                         | Tier               | Task                               | Tier                |
| ---------------------------- | ----------------------------- | -------------------------------------------- | ------------------ | ---------------------------------- | ------------------- |
| 0 Publish docs               | S                             | 11 Central config (lifecycle/harness/server) | **B**              | 22 Decompose harness               | **B**               |
| 1 CI gate                    | A + deliberate-fail PR        | 12 Shared logger (routes)                    | A                  | 23 Lifecycle helpers (pt1)         | **B**               |
| 2 Sifely injection fix       | A + tool mock run             | 13 sendError/uuidField                       | A                  | 24 Lifecycle steps (pt2, approval) | **B**               |
| 3 Cost breaker               | A (non-default model, cost>0) | 14 Task-creation consolidation               | **B**              | 25 Archetype-gen prompts           | A (wizard generate) |
| 4 Cost-limit float           | A                             | 15 FK indexes migration                      | A + PostgREST      | 26 Dashboard TaskDetail            | S (page load)       |
| 5 unescapeShellArg (3 tools) | A + tool mock run             | 16 deleted_at migration                      | **B** + PostgREST  | 27 Dashboard RulesPanel            | S (page load)       |
| 6 TERMINAL_STATUSES          | **B** (idempotency)           | 17 HTTP-client + slack-client                | **B**              | 28 Dashboard SearchableSelect/copy | S (page load)       |
| 7 Delete dead code           | **B**                         | 18 Hostfully client (2 tools)                | **B** (guest path) | 29 Dashboard shared comps          | S (page load)       |
| 8 knip cleanup               | S                             | 19 worker-tools helpers                      | A + tool runs      | 30 Docs/skill/CONTRIBUTING         | S                   |
| 9 ESLint error               | S                             | 20 status CHECK + block types                | **B**              | 31 Shared-file language rename     | **B**               |
| 10 Coverage tooling          | S                             | 21 Decompose slack/handlers                  | **B**              | 32 Unify approval flow (all emps)  | **B**               |
|                              |                               |                                              |                    | 33 Final Wave + docs + notify      | **B** (full)        |

> **Rule**: Tier S = build/test/lint (+ page load for UI). Tier A = real dashboard trigger of `real-estate-motivation-bot-2` + logs + task + DB (psql AND PostgREST) + Slack post. Tier B = Tier A **plus** the full real-Airbnb→draft→Slack-approval→reply→DB loop. Every gate captures evidence; a failed gate stops progress.

---

## TODOs

> Every task references a finding ID from the audit doc. **Decompositions are extract-only — zero logic changes.**
>
> **MANDATORY E2E GATE ON EVERY TASK**: After completing a task's work, the executor MUST run that task's assigned verification tier from the **Verification Tier Map** (see Execution Strategy) using the full **E2E Verification Protocol** (see Verification Strategy). A task is NOT done until its tier passes with captured evidence. The per-task `**QA**`/`**VERIFY**` bullet below names the specific concrete check for that task; the tier defines the minimum surrounding loop (S = build/test/lint + page-load; A = real dashboard trigger + logs + task + DB(psql&PostgREST) + Slack; B = A **plus** the full real-Airbnb→draft→Slack-approval→reply→DB loop). Where a task's bullet says `**QA**` and its tier is A or B, run the FULL tier loop — not just the named check. If any gate fails, STOP and fix/revert before the next task. This guarantees 100% confidence from a real-user perspective, never build+unit-tests alone.

### WAVE 1 — Stabilize & Stop the Bleeding

- [ ] 0. **Publish findings doc + scaffold evidence dir**

  **What to do**: Copy `.sisyphus/drafts/2026-06-05-0111-maintainability-audit.md` to `docs/guides/2026-06-05-0111-maintainability-audit.md` (run `date "+%Y-%m-%d-%H%M"` is unnecessary — keep the existing timestamp). Add a row to README.md's Documentation table and AGENTS.md Reference Documents table pointing to it. Create `.sisyphus/evidence/`.
  **Must NOT do**: Alter the findings content.
  **Recommended Agent Profile**: Category `quick`; Skills: [] (trivial copy + doc edit).
  **Parallelization**: Can start immediately. Blocks: none. Blocked By: none.
  **References**: `.sisyphus/drafts/2026-06-05-0111-maintainability-audit.md`; README.md "Documentation" table; AGENTS.md "Reference Documents" table.
  **Acceptance Criteria**:
  - [ ] `test -f docs/guides/2026-06-05-0111-maintainability-audit.md` → exists
  - [ ] `grep -c maintainability-audit README.md AGENTS.md` → ≥1 each
        **Commit**: YES — `docs: publish maintainability audit findings for team onboarding`

- [ ] 1. **Fix the CI test gate so it actually runs the suite** `[BLOCKS ALL]`

  **What to do** ([BUILD-3]): The `test` job in `.github/workflows/deploy.yml` runs `pnpm test -- --run`, but `tests/helpers/global-setup.ts` needs Postgres at `localhost:54322` (it runs `prisma migrate deploy` + `db:seed` via `psql`). CI has no Postgres service. Add a `postgres:16` service container to the `test` job (env `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=ai_employee_test`, port `54322:5432`, health-check), add a `pnpm test:db:setup` step, and ensure `DATABASE_URL` points at it. Confirm the suite runs green (not skipped).
  **Must NOT do**: Weaken `global-setup.ts`'s `ai_employee_test` safety guard. Don't add `continue-on-error`.
  **Recommended Agent Profile**: Category `deep` (CI + DB nuance); Skills: [`debugging-lifecycle`] (DB/test infra).
  **Parallelization**: FIRST. Blocks: all. Blocked By: none.
  **References**: `.github/workflows/deploy.yml:8-20`; `tests/helpers/global-setup.ts` (psql at :54322, migrate deploy, seed); `vitest.config.ts` (DATABASE_URL env); `package.json` `test:db:setup` script; AGENTS.md "Pre-existing Test Failures" (`container-boot.test.ts` skips when Docker absent — expected).
  **Acceptance Criteria**:
  - [ ] CI `test` job log shows N tests RUN (not "0 tests" / mass skips)
  - [ ] **Deliberate-failure proof**: a temp commit adding `expect(true).toBe(false)` makes CI `test` FAIL; revert restores green. Capture both CI run URLs.
  - **Evidence**: `.sisyphus/evidence/task-1-ci-green.txt`, `task-1-ci-deliberate-fail.txt`
    **Commit**: YES — `ci: add postgres service so the test gate actually runs`

- [ ] 2.  **Fix shell-injection + event-loop spin-wait in rotate-property-code** `[security]`

           **What to do** ([SMELL-3]): In `src/worker-tools/sifely/rotate-property-code.ts`: (a) replace every `execSync(\`...--lock-id ${lockId}...\`)`(lines ~254/290/311/346/367) with`execFileSync('pnpm', ['exec','tsx', toolPath, '--lock-id', lockId, ...], {...})`so values are passed as argv, not shell string; (b) replace the busy`while (Date.now()-start<3000){}`(lines ~77–79) with`await new Promise(r => setTimeout(r, 3000))`(make the enclosing fn async if needed).

      **Must NOT do**: Change the rotation business logic or the set of tools invoked.
      **Recommended Agent Profile**: Category`deep`; Skills: [`adding-shell-tools`] (tool conventions).
      **Parallelization**: Parallel w/ 3,4,5. Blocked By: none.
      **References**: `src/worker-tools/sifely/rotate-property-code.ts:77-79,254,290,311,346,367`; `src/worker-tools/sifely/lib/api.ts` (existing client/retry pattern); AGENTS.md Long-Running Commands (no blocking).
      **Acceptance Criteria**:
  - [ ] `grep -n "execSync" src/worker-tools/sifely/rotate-property-code.ts` → 0 matches
  - [ ] `grep -n "while.*Date.now" src/worker-tools/sifely/rotate-property-code.ts` → 0 matches
  - [ ] `tsx src/worker-tools/sifely/rotate-property-code.ts --help` exits 0
  - [ ] **QA (mock)**: run with a lock-id containing a space/`;` → no shell error, value passed literally. Evidence: `.sisyphus/evidence/task-2-injection-safe.txt`
        **Commit**: YES — `fix(sifely): use execFileSync and async sleep in code rotation`

- [ ] 3. **Fix the silently-broken cost circuit breaker**

  **What to do** ([SMELL-4]): `src/lib/call-llm.ts:33-36` `PRICING_PER_1M_TOKENS` only covers 2 of 14 models → others record `$0`, so the $50/day breaker never fires. Replace the hardcoded map with a lookup of `input_cost_per_million`/`output_cost_per_million` from the `model_catalog` table at cost-compute time (fall back to 0 only with a `log.warn` when a model is truly absent).
  **Must NOT do**: Change the breaker threshold logic or `gateway_llm_model` routing.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Parallel w/ 2,4,5. Blocked By: none. (Precedes 11 per Metis.)
  **References**: `src/lib/call-llm.ts:33-36,88,258-261`; `prisma/schema.prisma` `ModelCatalog` (cost columns); AGENTS.md "Approved LLM Models" / catalog; `src/lib/__tests__/call-llm.test.ts`.
  **Acceptance Criteria**:
  - [ ] `bun test src/lib/__tests__/call-llm.test.ts` (or `pnpm test`) green incl. a new case for a non-minimax/non-deepseek model
  - [ ] **QA**: trigger a task on a catalog model NOT in the old map (e.g. `zhipu/glm-5.1`); `psql ... -c "SELECT estimated_cost_usd FROM executions WHERE task_id='<id>'"` → `> 0`. Evidence: `.sisyphus/evidence/task-3-cost-nonzero.txt`
        **Commit**: YES — `fix(call-llm): compute cost from model_catalog so breaker covers all models`

- [ ] 4. **Fix decimal cost-limit truncation**

  **What to do** ([SMELL-5]): `src/lib/call-llm.ts:88` uses `parseInt(costLimitStr,10)` → `"50.5"` becomes `50`. Replace with `parseFloat` + an `isNaN` guard that logs and falls back to a sane default.
  **Must NOT do**: Change the default limit value.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Parallel w/ 2,3,5. Blocked By: none.
  **References**: `src/lib/call-llm.ts:88`; `platform_settings.cost_limit_usd_per_day` (AGENTS.md).
  **Acceptance Criteria**:
  - [ ] `grep -n "parseInt(costLimitStr" src/lib/call-llm.ts` → 0
  - [ ] Unit test asserts `"50.5"` → `50.5`. `pnpm test` green.
        **Commit**: YES — `fix(call-llm): parse cost limit as float, not int`

- [ ] 5. **Add `unescapeShellArg` to 3 tools missing it**

  **What to do** ([SMELL-2]): Wrap free-text args with `unescapeShellArg` so multi-line LLM text isn't corrupted: `platform/report-issue.ts` (`--description`, `--patch-diff`), `google/create-event.ts` (`--summary`), `google/update-event.ts` (`--summary`).
  **Must NOT do**: Wrap non-free-text args (IDs, enums).
  **Recommended Agent Profile**: Category `quick`; Skills: [`adding-shell-tools`].
  **Parallelization**: Parallel w/ 2,3,4. Blocked By: none.
  **References**: `src/worker-tools/lib/unescape-args.ts`; `src/worker-tools/platform/report-issue.ts:44,47`; `src/worker-tools/google/create-event.ts:30`; `src/worker-tools/google/update-event.ts:32`; a correct example: `src/worker-tools/slack/post-message.ts` (`--text`).
  **Acceptance Criteria**:
  - [ ] Each `--description/--patch-diff/--summary` parse site calls `unescapeShellArg(...)`
  - [ ] **QA (mock)**: run `report-issue` with `--description "line1\nline2"`; output contains a REAL newline. Evidence: `.sisyphus/evidence/task-5-newline.txt`
        **Commit**: YES — `fix(tools): unescape multi-line args in report-issue and calendar tools`

- [ ] 6. **Unify `TERMINAL_STATUSES` into one source of truth** `[blocks 14, 21]`

  **What to do** ([ARCH-3]): Create `src/lib/task-status.ts` exporting `TERMINAL_STATUSES: ReadonlySet<string>` (decide the canonical members — likely `Done, Cancelled, Failed`; treat `Delivering`/`Stale` deliberately per their current call-site intent and DOCUMENT the choice in a comment). Replace the 4 divergent definitions with imports: `handlers.ts:57`, `handlers.ts:155`, `admin-tasks.ts:123`, `task-creation.ts:115`.
  **Must NOT do**: Silently change idempotency behavior — if a call site needs `Delivering`/`Stale`, derive a named subset (e.g. `IDEMPOTENCY_TERMINAL`) rather than forcing one set.
  **Recommended Agent Profile**: Category `deep` (semantics matter); Skills: [].
  **Parallelization**: After 1. Blocks: 14, 21. Blocked By: 1.
  **References**: `src/gateway/slack/handlers.ts:57,155`; `src/gateway/routes/admin-tasks.ts:123`; `src/gateway/services/task-creation.ts:115`; AGENTS.md lifecycle states list.
  **Acceptance Criteria**:
  - [ ] `grep -rl "TERMINAL_STATUSES\|terminalState" src/ | grep -v task-status.ts | grep -v __tests__` → only import lines
  - [ ] `pnpm test` green
  - [ ] **QA**: trigger `real-estate-motivation-bot-2` → `Done`; then POST a duplicate `employee/approval.received` for it → idempotency guard returns already-processed (not a crash). Evidence: `.sisyphus/evidence/task-6-idempotent.txt`
        **Commit**: YES — `refactor: single TERMINAL_STATUSES source in src/lib/task-status.ts`

- [ ] 7. **Delete deprecated engineering-employee code** `[blocks 22, 23, 24]`

  **What to do** ([BUILD-1]): Delete (git rm) the verified-dead files: `src/workers/orchestrate.mts`, `src/workers/entrypoint.sh`, `src/workers/config/long-running.ts`, the 25 deprecated `src/workers/lib/*` files (wave-executor, pr-manager, plan-judge, plan-parser, plan-sync, planning-orchestrator, fix-loop, fallback-pr, branch-manager, cache-validator, ci-classifier, completion, completion-detector, continuation-dispatcher, cost-breaker, cost-tracker-v2, disk-check, install-runner, project-config, prompt-builder, task-context, token-tracker, validation-pipeline, between-wave-push, agents-md-reader), `src/workers/experimental/`, and the deprecated inngest files `src/inngest/lifecycle.ts`, `src/inngest/redispatch.ts`, `src/inngest/watchdog.ts` (Metis verified these are commented out of `src/gateway/inngest/serve.ts`; the ACTIVE watchdog is `src/inngest/triggers/reviewing-watchdog.ts` — DO NOT touch it). Run `pnpm build && pnpm test -- --run` in this same task.
  **Must NOT do**: Delete `reviewing-watchdog.ts`, `resource-caps.ts`, `heartbeat.ts`, `agents-md-compiler.mts`, `postgrest-client.ts`, or any harness-imported lib. Don't delete deprecated Prisma MODELS (separate concern, ARCH-14).
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: After 1. Blocks: 8, 22, 23, 24. Blocked By: 1.
  **References**: `knip.json` ignore list (the deprecated set); `src/gateway/inngest/serve.ts` (watchdog/lifecycle commented out); audit doc [BUILD-1] full file list; AGENTS.md "Deprecated Components".
  **Acceptance Criteria**:
  - [ ] `git ls-files src/workers/orchestrate.mts src/inngest/lifecycle.ts` → empty
  - [ ] `pnpm build && pnpm test -- --run` green (no broken imports)
  - [ ] **QA**: trigger `real-estate-motivation-bot-2` → `Done` (harness path intact). Evidence: `.sisyphus/evidence/task-7-e2e.txt`
        **Commit**: YES — `chore: delete deprecated engineering-employee worker and inngest code`

- [ ] 8. **knip cleanup + fix false-positives**

  **What to do** ([BUILD-7]): Remove the ~27 now-deleted entries from `knip.json` ignore. Remove `resource-caps.ts` and `heartbeat.ts` from the ignore list (they ARE imported by the harness — false negatives). Run `pnpm lint:unused` and resolve any newly-surfaced genuine unused exports (or re-ignore with justification).
  **Must NOT do**: Blanket-ignore to silence knip; investigate each.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: After 7. Blocked By: 7.
  **References**: `knip.json`; `src/workers/opencode-harness.mts` (imports resource-caps:17, heartbeat:6).
  **Acceptance Criteria**:
  - [ ] `knip.json` ignore no longer lists any deleted file, nor resource-caps/heartbeat
  - [ ] `pnpm lint:unused` runs clean (or remaining items justified inline)
        **Commit**: YES — `chore(knip): prune ignore list after dead-code deletion`

- [ ] 9. **Escalate ESLint `any`/`unused-vars` to `error`**

  **What to do** ([TYPE-1]): In `eslint.config.mjs` set `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` to `error`. Sweep the legit exceptions with targeted `// eslint-disable-next-line` + a one-line reason (the Bolt `(ack as any)` casts — note task 13/21 may later replace these with a typed helper). Ensure `pnpm lint` passes.
  **Must NOT do**: Add file-level blanket disables; don't introduce new `any` to dodge errors.
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: After 7 (fewer files to sweep post-delete). Blocked By: 7.
  **References**: `eslint.config.mjs:21-24`; `src/gateway/slack/handlers.ts` ack casts (424,502,580,710,926,952,1394).
  **Acceptance Criteria**:
  - [ ] `eslint.config.mjs` shows both rules = `'error'`
  - [ ] `pnpm lint` exits 0
        **Commit**: YES — `chore(eslint): promote no-explicit-any and no-unused-vars to error`

- [ ] 10. **Add coverage tooling (report-only)**

  **What to do** ([BUILD-5]): Add `@vitest/coverage-v8` devDep, a `coverage` block in `vitest.config.ts` (provider v8, reporters text+html, `all: true` over `src/**`), and a `test:coverage` script. NO CI threshold (user decision). Generate one report so the giant files' coverage is visible.
  **Must NOT do**: Add a CI coverage gate.
  **Recommended Agent Profile**: Category `quick`; Skills: [].
  **Parallelization**: Parallel w/ 9. Blocked By: none (do after 7 to exclude deleted files).
  **References**: `vitest.config.ts`; `package.json` scripts.
  **Acceptance Criteria**:
  - [ ] `pnpm test:coverage` produces a report; `coverage/` summary printed
  - [ ] `coverage/` added to `.gitignore`
        **Commit**: YES — `chore(test): add v8 coverage reporting (report-only)`

> **CHECKPOINT W1** — `pnpm build && pnpm test -- --run && pnpm lint` green; CI deliberate-failure proof captured; `real-estate-motivation-bot-2` → `Done`. **Wave 1 is independently shippable.**

### WAVE 2 — Shared Foundations

- [ ] 11. **Central config module (top-3 files only)**

  **What to do** ([ARCH-11]): Create `src/lib/config.ts` exporting typed, validated env constants via a `requireEnv(name)` helper, validated at module load (throw a clear `Missing required environment variable: X` at boot). Migrate ONLY the 3 highest-frequency files: `src/inngest/employee-lifecycle.ts`, `src/workers/opencode-harness.mts`, `src/gateway/server.ts`. Wire `server.ts` startup validation to include `SUPABASE_URL`/`SUPABASE_SECRET_KEY`.
  **Must NOT do**: Touch the other ~230 `process.env` sites (scope-creep trap). Don't move `platform_settings` DB lookups into config.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: After 3 (per Metis). Parallel w/ 12,13,15. Blocked By: 3.
  **References**: AGENTS.md "Platform settings over env vars" (don't add hardcoded fallbacks); `src/gateway/server.ts` (existing `validateEncryptionKey`); `src/lib/platform-settings.ts` (`validateRequiredPlatformSettings` pattern to mirror).
  **Acceptance Criteria**:
  - [ ] New `config.test.ts`: unsetting a required var throws at import; `pnpm test` green
  - [ ] **QA**: `SUPABASE_URL= pnpm dev` exits within ~5s with a message containing "Missing required environment variable". Evidence: `.sisyphus/evidence/task-11-boot-fail.txt`
  - [ ] The 3 target files import from `config.ts` (spot-grep)
        **Commit**: YES — `refactor(config): add typed config module with boot validation (top-3 files)`

- [ ] 12. **Shared `createLogger` across 30 route files**

  **What to do** ([ARCH-5]): Replace the per-file `const logger = pino({ level: ... })` in ~30 `src/gateway/routes/*` with `createLogger('route-name')` from `src/lib/logger.ts`. Mechanical.
  **Must NOT do**: Change log call sites/levels beyond the instantiation.
  **Recommended Agent Profile**: Category `unspecified-high` (many files); Skills: [].
  **Parallelization**: Parallel w/ 11,13,15. Blocked By: none.
  **References**: `src/lib/logger.ts` (`createLogger`); any `src/gateway/routes/*.ts` showing the `pino({...})` pattern; `src/gateway/slack/handlers.ts:12` (correct usage).
  **Acceptance Criteria**:
  - [ ] `grep -rl "pino({" src/gateway/routes | wc -l` → 0
  - [ ] `pnpm build && pnpm test -- --run` green
        **Commit**: YES — `refactor(gateway): use shared createLogger across route modules`

- [ ] 13. **`sendError` helper + export `uuidField`/`UUID_REGEX`**

  **What to do** ([ARCH-6] + gateway F12): Add `src/gateway/lib/http-response.ts` `sendError(res, status, code, message?, extra?)`; adopt in a representative set of routes (don't force all). Export `UUID_REGEX`/`uuidField` from `src/gateway/validation/schemas.ts` and delete the 3 duplicate local copies (`admin-archetypes.ts`, `admin-brain-preview.ts`, `admin-model-catalog.ts`).
  **Must NOT do**: Rewrite every error response in the codebase (adopt incrementally).
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [].
  **Parallelization**: Parallel w/ 11,12,15. Blocked By: none.
  **References**: `src/gateway/validation/schemas.ts:165-167`; dup copies `admin-archetypes.ts:24-26`, `admin-brain-preview.ts:22-24`, `admin-model-catalog.ts:12-14`.
  **Acceptance Criteria**:
  - [ ] `grep -rl "UUID_REGEX =" src/gateway` → only `schemas.ts`
  - [ ] `sendError` exists and used in ≥3 routes; `pnpm test` green
        **Commit**: YES — `refactor(gateway): add sendError helper and centralize uuid validation`

- [ ] 14. **Consolidate task-creation paths (ARCH-2) + rename file**

  **What to do** ([ARCH-2]): Make `dispatchEmployee()` (`employee-dispatcher.ts`) the single task-creation entry. Replace the ~200 inlined PostgREST-fetch lines in the `slack/handlers.ts` `trigger_confirm` handler with a call into the dispatcher (add a Slack-friendly entry if needed). Rename `gateway/services/task-creation.ts` → `jira-task-creation.ts` and update imports. Document the (still-dual) Prisma/PostgREST pattern in CONTRIBUTING.md (created in Task 30) — note ARCH-1 full unification is deferred.
  **Must NOT do**: Attempt full raw-fetch→Prisma unification across handlers (ARCH-1 deferred). Don't change the dispatched event name/shape.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: After 6. Blocked By: 6.
  **References**: `src/gateway/services/employee-dispatcher.ts:36-86`; `src/gateway/slack/handlers.ts:1554-1800` (trigger_confirm); `src/gateway/services/task-creation.ts`; AGENTS.md Slack @mention triggering flow.
  **Acceptance Criteria**:
  - [ ] `git ls-files src/gateway/services/task-creation.ts` → empty (renamed)
  - [ ] **QA**: Slack @mention → confirm card → Confirm → task dispatched and reaches a terminal state (Slack UX Scenario A or the trigger-confirm path). Evidence: `.sisyphus/evidence/task-14-slack-trigger.txt`
  - [ ] `pnpm test` green incl. `handlers-trigger-confirm.test.ts`
        **Commit**: YES — `refactor: route Slack trigger through dispatchEmployee; rename jira-task-creation`

- [ ] 15. **DB migration: indexes on hot-path FK columns**

  **What to do** ([ARCH-9]): Add Prisma `@@index` for `tasks.archetype_id`, `tasks.tenant_id`, `executions.task_id`, `task_status_log.task_id`, `deliverables.execution_id`, `validation_runs.execution_id` (skip validation_runs if dropped). Create + run migration. Reload PostgREST schema cache.
  **Must NOT do**: Alter columns/types; don't index deprecated-only tables being removed.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Parallel w/ 11,12,13. Blocked By: none.
  **References**: `prisma/schema.prisma` Task/Execution/TaskStatusLog/Deliverable; AGENTS.md "PostgREST ≠ psql" + Database Backup (MANDATORY before migrations).
  **Acceptance Criteria**:
  - [ ] **Back up DB first** (per AGENTS.md) — evidence the backup dir exists
  - [ ] `prisma migrate status` → up to date
  - [ ] After `NOTIFY pgrst,'reload schema'`: `curl localhost:54331/rest/v1/tasks?limit=1 -H "apikey:$SUPABASE_ANON_KEY"` → `[]` (not schema error). Evidence: `.sisyphus/evidence/task-15-postgrest.txt`
        **Commit**: YES — `perf(db): add indexes on hot-path foreign-key columns`

- [ ] 16. **DB migration: `deleted_at` on 6 active tables** `[blocks 23,24]`

  **What to do** ([ARCH-10]): Add nullable `deleted_at DateTime?` to `Task`, `Execution`, `PendingApproval`, `EmployeeRule`, `FeedbackEvent`, `TaskMetric`. Migrate; reload PostgREST cache. (Code paths to actually filter on it are future work — this enables soft-delete-aware helpers extracted in Task 23.)
  **Must NOT do**: Backfill/delete rows; don't add to deprecated tables; don't change existing queries to filter yet.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: Parallel w/ 15. Blocks: 23, 24. Blocked By: none.
  **References**: `prisma/schema.prisma` (the 5 models that DO have `deleted_at` as the pattern); AGENTS.md "Soft deletes only" + Database Backup + "PostgREST ≠ psql".
  **Acceptance Criteria**:
  - [ ] Backup taken; `prisma migrate status` up to date
  - [ ] **QA (zero-rows-is-never-expected)**: trigger `real-estate-motivation-bot-2` → `Done`; `curl localhost:54331/rest/v1/tasks?id=eq.<id>&select=deleted_at` returns the row with `deleted_at: null` (column visible via PostgREST). Evidence: `.sisyphus/evidence/task-16-deleted-at.txt`
        **Commit**: YES — `feat(db): add deleted_at to active tables for soft-delete compliance`

- [ ] 17. **Shared HTTP-client factory + adopt in slack-client only**

  **What to do** ([ARCH-12]): Create `src/lib/http-client.ts` `createHttpClient(baseUrl, defaultHeaders)` encapsulating fetch + 429/`Retry-After` detection + `withRetry`. Refactor `src/lib/slack-client.ts` to use it (it has the most duplication). Leave github/jira/telegram clients for later.
  **Must NOT do**: Rewrite github/jira/telegram clients (scope-creep trap). Don't change `slack-client` public API.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Parallel w/ 18,19. Blocked By: none.
  **References**: `src/lib/fly-client.ts` (`makeRequestWithRetry` reference pattern); `src/lib/slack-client.ts` (postMessage/updateMessage dup 429 block); `src/lib/retry.ts`; `tests/lib/slack-client.test.ts`.
  **Acceptance Criteria**:
  - [ ] `slack-client.ts` no longer inlines duplicate 429 parsing
  - [ ] `pnpm test` green incl. `slack-client.test.ts`
        **Commit**: YES — `refactor(lib): add shared http-client factory; adopt in slack-client`

- [ ] 18. **Hostfully shared tool client + paginator (PoC: 2 tools)**

  **What to do** ([TOOLS-1]): Create `src/worker-tools/hostfully/lib/client.ts` (`resolveHostfullyClient(): {headers, baseUrl}`) and `paginate.ts` (`paginateCursor<T>()`), mirroring `sifely/lib/api.ts`. Migrate 2 tools as proof-of-concept: `get-messages.ts` + `get-checkouts.ts`. Also move duplicated `formatGuestName()` → `hostfully/lib/format.ts`.
  **Must NOT do**: Migrate all 8 hostfully tools now (do 2). Don't change tool output JSON shapes.
  **Recommended Agent Profile**: Category `deep`; Skills: [`adding-shell-tools`, `hostfully-api`].
  **Parallelization**: Parallel w/ 17,19. Blocked By: none.
  **References**: `src/worker-tools/sifely/lib/api.ts` (pattern); `hostfully/get-messages.ts:233,314`, `get-checkouts.ts:121,329`; `tests/worker-tools/hostfully/*`.
  **Acceptance Criteria**:
  - [ ] `get-messages.ts`/`get-checkouts.ts` import the shared client+paginator
  - [ ] `pnpm test -- --run tests/worker-tools/hostfully` green (output shapes unchanged)
        **Commit**: YES — `refactor(tools): add shared hostfully client and paginator (2 tools)`

- [ ] 19. **worker-tools `requireEnv`/`getArg` shared helpers**

  **What to do** ([TOOLS-2]): Promote `requireEnv()` from `google/google-fetch.ts` to `src/worker-tools/lib/require-env.ts`. Add a minimal `getArg(args, '--flag')` to `worker-tools/lib/`. Adopt in 3-4 representative tools as PoC.
  **Must NOT do**: Refactor all 50 tools' parseArgs now (scope-creep trap).
  **Recommended Agent Profile**: Category `unspecified-high`; Skills: [`adding-shell-tools`].
  **Parallelization**: Parallel w/ 17,18. Blocked By: none.
  **References**: `src/worker-tools/google/google-fetch.ts` (`requireEnv`); `src/worker-tools/lib/unescape-args.ts` (lib location pattern).
  **Acceptance Criteria**:
  - [ ] `require-env.ts` + `get-arg.ts` exist with unit tests; `pnpm test` green
  - [ ] ≥3 tools import them; their `--help` still exits 0
        **Commit**: YES — `refactor(tools): add shared require-env and get-arg helpers`

- [ ] 20. **status CHECK constraint + slack-blocks return types**

  **What to do** ([TYPE-3] + [TYPE-4]): (a) Add a PG `CHECK` constraint on `tasks.status`/`executions.status` via a raw migration mirroring the existing `task_status_log` pattern. (b) Type all builders in `src/lib/slack-blocks.ts` as `KnownBlock[]` (remove internal `as KnownBlock` casts).
  **Must NOT do**: Constrain values that aren't real lifecycle states; don't change block content.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: After 15/16 (migration ordering). Blocked By: 16.
  **References**: `prisma/schema.prisma:159` (existing CHECK pattern); AGENTS.md lifecycle states; `src/lib/slack-blocks.ts` (return types); `tests/lib/slack-blocks.test.ts`.
  **Acceptance Criteria**:
  - [ ] Migration applied; inserting an invalid status via psql is rejected. Evidence: `.sisyphus/evidence/task-20-check.txt`
  - [ ] `pnpm build && pnpm test -- --run` green (no type regressions)
        **Commit**: YES — `feat(db): CHECK constraint on status; type slack-blocks as KnownBlock[]`

> **CHECKPOINT W2** — migrations verified via PostgREST (not just psql); `real-estate-motivation-bot-2` → `Done`; `pnpm build/test/lint` green. **Wave 2 is independently shippable.**

### WAVE 3 — Decompositions (EXTRACT-ONLY — zero logic changes)

> **Universal guardrail for Wave 3**: Extract only. If you find a bug, record it as a NEW finding — do NOT fix inline. Run the relevant E2E after EACH task. Keep all existing tests green.

- [ ] 21. **Decompose `slack/handlers.ts` (1,869 lines)**

  **What to do** ([SIZE-5]): Split `registerSlackHandlers` into `slack/handlers/{approval,rule,trigger,event}-handlers.ts` + `slack/supabase-client.ts` (the 4 fetch helpers) + `slack/block-kit.ts` + `slack/pending-state.ts`, with a thin `slack/handlers/index.ts` orchestrator. Start with `rule-handlers.ts` (lines 1138–1499, zero deps). Inject the `prisma` singleton instead of `new PrismaClient()` in the `app_mention` handler. Optionally introduce `ackWithResponse(ack, payload)` to isolate the Bolt casts.
  **Must NOT do**: Change handler behavior, action IDs, or event wiring (the approval-flow merge that deletes `GUEST_*` is Task 32).
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: After 6 & ideally 14. Parallel w/ 22,25,26,27. Blocked By: 6.
  **References**: audit [SIZE-5]/gateway-F1 line ranges; `src/gateway/slack/handlers.ts`; existing tests `tests/gateway/slack/_` (must stay green).
  **Acceptance Criteria**:
  - [ ] `wc -l src/gateway/slack/handlers*/*.ts` — no single file >600 lines
  - [ ] `pnpm test -- --run tests/gateway/slack` green (all existing handler tests pass unchanged)
  - [ ] **QA**: Slack UX Scenario A (approve happy path). Evidence: `.sisyphus/evidence/task-21-scenarioA.txt`
        **Commit**: YES (may group sub-extractions) — `refactor(slack): decompose handlers.ts into focused modules`

- [ ] 22. **Decompose `opencode-harness.mts` (1,162 lines)**

  **What to do** ([SIZE-3]): FIRST extract the verbatim-duplicated `checkOutputFiles` (lines 442–511 ≈ 625–698) into one module-scope fn. Then split `main()` → `runDeliveryPhase()` + `runExecutionPhase()`; split `runOpencodeSession()` → `resolveModelProvider()` + session-mgmt + `readOutputContract()`; extract `updateSlackNotificationToFailed()` from `markFailed()`. Remove dead `opencodeRunPid` branch. **Rebuild Docker image** after (worker change).
  **Must NOT do**: Change the output-contract semantics, provider routing, or monitoring timing. No logic changes.
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: After 7. Parallel w/ 21,25,26,27. Blocked By: 7.
  **References**: audit [SIZE-3] line ranges; `src/workers/opencode-harness.mts`; `tests/workers/*`, `src/workers/__tests__/opencode-harness-prompt.test.ts`; AGENTS.md "Rebuild after every worker change".
  **Acceptance Criteria**:
  - [ ] `grep -c "checkOutputFiles" src/workers/opencode-harness*` shows ONE definition
  - [ ] `pnpm test -- --run tests/workers` green
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds
  - [ ] **QA**: trigger `real-estate-motivation-bot-2` → `Done` + summary delivered. Evidence: `.sisyphus/evidence/task-22-e2e.txt`
        **Commit**: YES — `refactor(worker): decompose opencode-harness; de-duplicate output-contract check`

- [ ] 23. **Decompose `employee-lifecycle.ts` — helpers + tenant-env (Part 1)**

  **What to do** ([SIZE-4] part 1): Extract (zero behavior change) `lifecycle/db-helpers.ts` (`patchTask`, `logStatusTransition`, `recordWorkMetric`), `lifecycle/tenant-env.ts` (`loadTenantSlackToken` — collapse the 19× boilerplate), `lifecycle/machine-runner.ts` (run/stop Docker, `destroyWorkerMachine` for the 6× dup, the 2× env-manifest merge). Make extracted DB helpers soft-delete-aware where they write the tables migrated in Task 16. `employee-lifecycle.ts` imports them.
  **Must NOT do**: Touch step logic/branches yet (that's Task 24). No behavior change.
  **Recommended Agent Profile**: Category `ultrabrain` (highest-risk file, needs careful reasoning); Skills: [`debugging-lifecycle`].
  **Parallelization**: After 7 & 16. Blocks: 24. Blocked By: 7, 16.
  **References**: audit [SIZE-4]/[ARCH-4] line ranges; `src/inngest/employee-lifecycle.ts:36-161` (helpers), 19× `loadTenantEnv` sites; `tests/inngest/*` (must stay green).
  **Acceptance Criteria**:
  - [ ] `grep -c "new PrismaClient()" src/inngest/employee-lifecycle.ts` drops substantially (boilerplate collapsed)
  - [ ] `pnpm test -- --run tests/inngest` green
  - [ ] **QA**: `real-estate-motivation-bot-2` → `Done`. Evidence: `.sisyphus/evidence/task-23-e2e.txt`
        **Commit**: YES — `refactor(lifecycle): extract db-helpers, tenant-env, machine-runner`

- [ ] 24. **Decompose `employee-lifecycle.ts` — steps (Part 2)**

  **What to do** ([SIZE-4] part 2): Extract step bodies into `lifecycle/steps/{notify,execute,delivery,approval,supersede,classification,override}.ts`. Collapse the verbatim-duplicated delivery retry loop (1098–1245 ≈ 2453–2598) into `runDeliveryWithRetry()`. Split the 978-line `handle-approval-result` into `handleApprove/Reject/Supersede/Expiry`. The Inngest `step.run` callbacks become thin dispatchers. **Do ONE step extraction at a time, E2E after each.**
  **Must NOT do**: Change approval/supersede/reject behavior or Slack message sequencing. Break Inngest step isolation (no shared mutable state across steps). No logic changes.
  **Recommended Agent Profile**: Category `ultrabrain`; Skills: [`debugging-lifecycle`].
  **Parallelization**: After 23. Blocked By: 23.
  **References**: audit [SIZE-4] step inventory (handle-approval-result 2069–3047; delivery dup; supersede 1684–1858); `tests/inngest/lifecycle-*` and `employee-lifecycle-*` (must stay green).
  **Acceptance Criteria**:
  - [ ] No single `step.run` callback >150 lines
  - [ ] `pnpm test -- --run tests/inngest` green
  - [ ] **QA**: BOTH `real-estate-motivation-bot-2` (no-approval) AND Slack UX Scenario A (approval) pass. Evidence: `.sisyphus/evidence/task-24-no-approval.txt`, `task-24-scenarioA.txt`
        **Commit**: YES (per-step sub-commits ok) — `refactor(lifecycle): extract step modules; split approval handler`

- [ ] 25. **Extract `archetype-generator.ts` prompts + dedup post-processing**

  **What to do** ([SIZE-6]): Move `SYSTEM_PROMPT_PRE/POST` + `REFINE_SYSTEM_PROMPT` to `src/gateway/services/prompts/` (importable strings). Extract the duplicated model-recommendation + time-estimation block from `generate()`/`refine()` into `applyModelAndEstimate()`.
  **Must NOT do**: Change prompt text/wording (verbatim move) or generation output schema.
  **Recommended Agent Profile**: Category `deep`; Skills: [].
  **Parallelization**: Parallel w/ 21,22,26,27. Blocked By: none.
  **References**: `src/gateway/services/archetype-generator.ts:87-342,575-696`; `src/gateway/services/__tests__/archetype-generator-code.test.ts`.
  **Acceptance Criteria**:
  - [ ] Prompt strings byte-identical after move (diff the extracted constants)
  - [ ] `pnpm test -- --run` (archetype generator tests) green
        **Commit**: YES — `refactor(gateway): extract archetype-generator prompts and shared post-processing`

- [ ] 26. **Decompose dashboard `TaskDetail.tsx` (870 lines)**

  **What to do** ([DASH-1]): Extract `useTaskData` hook (the 6 fetches) and pull inline sub-components (`RawEventViewer`, `CollapsibleJsonViewer`, `CompiledAgentsMdViewer`, `CommandRow`) into `panels/tasks/components/`. Extract `ApprovalSection`, `RerunDialog`. Add type guards for the two unsafe casts (404, 804). NO UI behavior change.
  **Must NOT do**: Change rendered UI/URL-state behavior; no styling changes.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Parallel w/ 21,22,25,27. Blocked By: none.
  **References**: `dashboard/src/panels/tasks/TaskDetail.tsx`; `dashboard/src/lib/gateway.ts`, `usePoll`; `dashboard/src/tests/*`.
  **Acceptance Criteria**:
  - [ ] `wc -l dashboard/src/panels/tasks/TaskDetail.tsx` < 250
  - [ ] `cd dashboard && pnpm build` succeeds; `pnpm test` green
  - [ ] **QA (Playwright)**: open `/dashboard/tasks/<id>?tenant=<VLRE>`; assert task fields + transcript render, no console errors. Evidence: `.sisyphus/evidence/task-26-taskdetail.png`
        **Commit**: YES — `refactor(dashboard): decompose TaskDetail into hook + sub-components`

- [ ] 27. **Decompose dashboard `RulesPanel.tsx` (852 lines)**

  **What to do** ([DASH-1]): Extract `MultiSelectDropdown` → `components/ui/multi-select-dropdown.tsx` (generic), `EmployeeMultiSelect` → own file (uses the generic one, removes duplicate checkbox SVG), `RulesTab` + `FeedbackEventsTab` → own files. `RulesPanel` becomes tab orchestration. NO behavior change.
  **Must NOT do**: Change filter/URL-state behavior or data queries.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Parallel w/ 21,22,25,26. Blocked By: none.
  **References**: `dashboard/src/panels/rules/RulesPanel.tsx` (line ranges in audit DASH-1); existing dashboard tests.
  **Acceptance Criteria**:
  - [ ] No single rules file >300 lines
  - [ ] `cd dashboard && pnpm build` + `pnpm test` green
  - [ ] **QA (Playwright)**: open Rules panel; switch tabs (URL `?tab=` updates), apply a filter, assert table renders. Evidence: `.sisyphus/evidence/task-27-rules.png`
        **Commit**: YES — `refactor(dashboard): decompose RulesPanel into tabs and shared dropdown`

> **CHECKPOINT W3** — both E2E paths green; dashboard pages render with real data; all existing tests pass. **Wave 3 is independently shippable.**

### WAVE 4 — Conventions, Docs & Approval-Flow Unification (ship last)

- [ ] 28. **Dashboard: `SearchableSelect` + non-technical end-user copy**

  **What to do** ([DASH-2]): Replace Radix `<Select>` with `<SearchableSelect>` in `components/layout/Header.tsx` (tenant switcher) and `components/InputSchemaEditor.tsx`. Rewrite technical end-user strings: "Select tenant"→"Select organization" (Header:71), "No archetypes found for this tenant" (RulesPanel:828), "employee archetype…admin API" (TriggerPanel:173), "...for this tenant" (CreateEmployeePage:540, CompactSettingsGrid:243).
  **Must NOT do**: Change internal field names (only user-visible copy); don't swap programmatic 2-option toggles.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Parallel w/ 29,30. Blocked By: none.
  **References**: `dashboard/src/components/ui/searchable-select.tsx`; AGENTS.md "Searchable dropdowns" + "End-user language is non-technical"; cited file:lines above.
  **Acceptance Criteria**:
  - [ ] `grep -rl "from '@/components/ui/select'" dashboard/src` → only justified non-interactive toggles
  - [ ] `grep -rni "tenant\|archetype" dashboard/src/**/*.tsx` → no user-VISIBLE strings (internal identifiers ok)
  - [ ] **QA (Playwright)**: tenant switcher is searchable; copy reads "organization". Evidence: `.sisyphus/evidence/task-28-ux.png`
        **Commit**: YES — `fix(dashboard): use SearchableSelect; non-technical end-user copy`

- [ ] 29. **Dashboard: shared components + dedup**

  **What to do** ([DASH-3]+[DASH-4]): Move `WEBHOOK_FIXTURES` → `lib/constants.ts`; dedup `computeCostTierLabel` → `lib/utils.ts`; extract shared `DeleteEmployeeDialog`, `ErrorBox`, `Textarea`, `FormField`; route `deleteRule` through `gatewayFetch`; convert `CompactSettingsGrid` 7-useState cluster → `useReducer`.
  **Must NOT do**: Change behavior/styling of the deduped UI.
  **Recommended Agent Profile**: Category `visual-engineering`; Skills: [`frontend-ui-ux`].
  **Parallelization**: Parallel w/ 28,30. Blocked By: none.
  **References**: `EmployeeList.tsx:33`, `EmployeeDetail.tsx:38`/`:28`; `ModelCatalogPage.tsx:34`; `lib/gateway.ts:282`; `CompactSettingsGrid.tsx:35,74,142`.
  **Acceptance Criteria**:
  - [ ] `WEBHOOK_FIXTURES`/`computeCostTierLabel` each defined once
  - [ ] `cd dashboard && pnpm build` + `pnpm test` green
        **Commit**: YES — `refactor(dashboard): extract shared components and dedup constants`

- [ ] 30. **Docs: worker-tools skill + CONTRIBUTING.md + archive one-shot scripts**

  **What to do** ([TOOLS-3]+[DOC-1]+[DOC-2]+[BUILD-6]): Update the `adding-shell-tools` skill with the canonical tool structure (--help placement, mock-mode rule, `node:` prefix, `requireEnv`/`getArg`). Create `CONTRIBUTING.md` (active-vs-deprecated map, the task-creation paths + which to use, dual Prisma/PostgREST pattern note, how to add a tool/employee, how to run E2E, link into AGENTS.md). Move executed one-shots (`migrate-archetypes-to-template.ts`, `migrate-feedback-data.ts`, `migrate-vlre-kb.ts`, `resolve-hostfully-uids.ts`, `setup-two-tenants.ts`) → `scripts/archive/`.
  **Must NOT do**: Duplicate AGENTS.md wholesale into CONTRIBUTING (link, don't copy).
  **Recommended Agent Profile**: Category `writing`; Skills: [`adding-shell-tools`].
  **Parallelization**: Parallel w/ 28,29. Blocked By: none.
  **References**: `.opencode/skills/adding-shell-tools/SKILL.md`; AGENTS.md (source for the active/deprecated map); `scripts/` one-shots.
  **Acceptance Criteria**:
  - [ ] `test -f CONTRIBUTING.md` and it covers all 5 topics above
  - [ ] `scripts/archive/` contains the 5 one-shots; root `scripts/` no longer lists them
  - [ ] README Documentation table updated
        **Commit**: YES — `docs: add CONTRIBUTING, update tool skill, archive one-shot scripts`

- [ ] 31. **Remove employee-specific language from shared files (data + blocks)**

  **What to do** ([ARCH-8]+[ARCH-13]): Make shared files employee-agnostic — generalize the DATA and BLOCK layers (the approval-flow MERGE is Task 32). `inngest/employee-lifecycle.ts`: `guest_name`→`recipient_name`, `SUMMARY_TARGET_CHANNEL` fallback→`NOTIFICATION_CHANNEL`, remove the employee-naming comments. `inngest/lib/reminder-blocks.ts`: `guestName/propertyName`→`recipientName/contextLabel`. `gateway/services/tenant-env-loader.ts`: `summary` key→generic. `src/lib/slack-blocks.ts`: replace the hardcoded Hostfully link/"View in Hostfully" coupling with generic `contextUrl`/`contextLabel` params, and rename the guest-specific block builders (`buildEnrichedNotifyBlocks` etc.) to generic names so ANY employee can use them. Update seed/config keys accordingly. (Leave the `GUEST_*` action-ID constants themselves in place — Task 32 deletes them as part of the handler merge.)
  **Must NOT do**: Touch `docs/employees/guest-messaging.md` or the guest-messaging archetype's own fields (those are correctly employee-specific). Don't merge the approval handlers yet (Task 32).
  **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`].
  **Parallelization**: After 24. Blocks: 32. Blocked By: 24.
  **References**: audit [ARCH-8]/[ARCH-13] cited file:lines; AGENTS.md "Shared files must stay employee-agnostic"; `tests/inngest/*`, `tests/lib/slack-blocks*`.
  **Acceptance Criteria**:
  - [ ] `grep -rni "guest\|summary\|hostfully" src/inngest/employee-lifecycle.ts src/inngest/lib/reminder-blocks.ts src/lib/slack-blocks.ts` → 0 (excluding the `GUEST_*` action-ID constants, removed in Task 32)
  - [ ] `pnpm test` green
  - [ ] **VERIFY [Tier B]**: full real-Airbnb→draft→Slack-card→approve→reply loop still works (data/blocks generalized, behavior identical). Evidence: `.sisyphus/evidence/task-31-tierB-*`
        **Commit**: YES — `refactor: remove employee-specific language from shared files`

- [ ] 32. **Merge the two approval flows into ONE generic flow (every employee)**

  **What to do** ([ARCH-8]): Today there are TWO parallel approval-button systems in `src/gateway/slack/handlers.ts`: generic `APPROVE`/`REJECT` (handlers ~410, 488) and guest-specific `GUEST_APPROVE`/`GUEST_EDIT`/`GUEST_REJECT` (handlers ~566, 650, 808). The only real difference is the guest flow's "Edit the draft, then send" step — which is NOT guest-specific (any employee with an editable text deliverable wants it). **Merge them into a single generic flow that EVERY employee uses, always showing Approve / Edit / Reject** (user decision):
  - In `src/lib/slack-action-ids.ts`: collapse to ONE set — `APPROVE`, `EDIT_AND_SEND` (absorbs `GUEST_EDIT`+`EDITED_DRAFT`), `REJECT`. DELETE `GUEST_APPROVE`/`GUEST_EDIT`/`GUEST_REJECT`.
  - In `handlers.ts`: keep ONE handler per action. Fold the (richer) guest handler bodies into the generic `APPROVE`/`REJECT` handlers and add the generic `EDIT_AND_SEND` handler from the old `GUEST_EDIT` logic. Delete the three `GUEST_*` handlers. Any genuinely employee-specific step (e.g. enrichment context) must be driven by task/archetype data passed through, NOT by which button was clicked.
  - In the emitters — worker `approval-card-poster.mts` and the gateway block builders — every approval card now emits the SAME three generic buttons (Approve / Edit / Reject). Remove the separate `GUEST_BUTTON_BLOCKS` path so there is ONE card builder.
    **End state**: zero `GUEST_*` anywhere; one approval card shape and one handler set serve guest-messaging, summarizer, google-assistant, and any future employee identically.
    **Must NOT do**: Leave any emitter/handler on a removed ID (would silently break buttons). Don't keep a second card-builder path "just for guests". Don't change the visual card layout beyond unifying to 3 buttons.
    **Recommended Agent Profile**: Category `deep`; Skills: [`debugging-lifecycle`, `e2e-testing`].
    **Parallelization**: After 31. Blocks: 33. Blocked By: 31. (Note: pairs naturally with the handlers decomposition in Task 21 — do 21 first if both are queued.)
    **References**: `src/lib/slack-action-ids.ts:4-7`; `src/gateway/slack/handlers.ts:193-228` (dual button blocks), `:410,488` (generic handlers), `:566,650,808` (guest handlers), `:691` (`EDITED_DRAFT`); `src/workers/lib/approval-card-poster.mts:93`; audit [ARCH-8].
    **Acceptance Criteria**:
  - [ ] `grep -ri "GUEST_APPROVE\|GUEST_EDIT\|GUEST_REJECT\|GUEST_BUTTON" src/` → 0 (constants, handlers, emitters, card builder all merged)
  - [ ] Exactly ONE handler registered per approval action (`grep -c "boltApp.action(SLACK_ACTION_ID.APPROVE" handlers.ts` → 1; same for REJECT, EDIT_AND_SEND)
  - [ ] ONE approval-card builder remains (no separate guest card path)
  - [ ] `pnpm test` green
  - [ ] **VERIFY [Tier B] — exercise the merged flow on TWO different employees**: (a) guest-messaging — real Airbnb message → card shows Approve/Edit/Reject → click **Edit**, change the draft, send → confirm edited reply delivered to Airbnb; (b) a non-guest draft employee (e.g. daily-summarizer or google-assistant) → same card → **Approve** → delivered. Both use the identical generic handler. Evidence: `.sisyphus/evidence/task-32-tierB-guest-edit-*`, `task-32-tierB-other-employee-*`
        **Commit**: YES — `refactor(slack): unify guest and generic approval into one flow`

- [ ] 33. **Final Verification Wave + docs freshness + notify**

  **What to do**: Run the **Final Verification Wave** (F1–F4 below), present consolidated results, get explicit user okay. Update AGENTS.md/README per Documentation Freshness (new `task-status.ts`, `config.ts`, `http-client.ts`, deleted components, CONTRIBUTING.md, removed deprecated code). Run Git Cleanup (`git status --short` clean). **Send Telegram completion notification** (`pnpm exec tsx scripts/telegram-notify.ts "✅ Maintainability remediation complete — all tasks done. Come back to review."`).
  **Must NOT do**: Mark F1–F4 checked before user okay.
  **Recommended Agent Profile**: Category `deep`; Skills: [`e2e-testing`, `debugging-lifecycle`].
  **Parallelization**: LAST. Blocked By: 32.
  **References**: AGENTS.md Documentation Freshness + Telegram Notifications + Git Cleanup on Plan Completion.
  **Acceptance Criteria**:
  - [ ] Final Verification Wave F1–F4 all APPROVE; user gives explicit okay
  - [ ] AGENTS.md + README + CONTRIBUTING updated; `git status --short` clean
  - [ ] Telegram completion sent
        **Commit**: YES — `docs: update AGENTS/README after maintainability remediation`

> **CHECKPOINT W4** — full E2E green; docs current; Final Verification Wave passed + user okay. **Plan complete.**

---

## Final Verification Wave

> Runs as Tasks F1–F4 inside Task 33's wave. 4 review agents in PARALLEL; ALL must APPROVE; present to user; wait for explicit okay before marking complete.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Verify every "Must Have" implemented and every "Must NOT Have" absent (grep for logic changes in decomposition diffs, all-289-sites config sprawl, any surviving `GUEST_*` or second guest-only approval path). Confirm evidence files exist. Output: `Must Have [N/N] | Must NOT [N/N] | VERDICT`.

- [ ] F2. **Code Quality Review** — `unspecified-high`
      `pnpm build && pnpm lint && pnpm test -- --run`. Review changed files for `as any`, dead code, console.\*, AI slop. Output: `Build/Lint/Tests + VERDICT`.

- [ ] F3. **Real E2E QA** — `unspecified-high` (+ `e2e-testing`, `playwright` skills)
      Trigger `real-estate-motivation-bot-2` → `Done` + metrics row (psql AND PostgREST). Run Slack UX Scenario A (approve happy path). Verify dashboard pages render with real data. Output: `Scenarios [N/N] | VERDICT`.

- [ ] F4. **Scope Fidelity Check** — `deep`
      Per task: diff vs spec, confirm extract-only (no logic drift), no cross-task contamination, GUEST\_\* two-step honored. Output: `Tasks [N/N compliant] | VERDICT`.

→ Present consolidated results → get explicit user okay → THEN mark complete.

---

## Commit Strategy

- One commit per task (Task 32's approval-flow merge is a single commit).
- Conventional commits: `fix(...)`, `refactor(...)`, `chore(...)`, `perf(...)`, `docs(...)`.
- Pre-commit: `pnpm build && pnpm test -- --run && pnpm lint`. Never `--no-verify`.
- No AI/Co-authored-by trailers.

## Success Criteria

### Verification Commands

```bash
pnpm build && pnpm test -- --run && pnpm lint          # all green
git ls-files src/workers/orchestrate.mts                # empty (deleted)
grep -rl "TERMINAL_STATUSES" src/ | grep -v task-status # only imports
```

### Final Checklist

- [ ] All "Must Have" present; all "Must NOT Have" absent
- [ ] 4 active bugs fixed + verified
- [ ] Dead code deleted; knip clean
- [ ] Giant files decomposed (extract-only)
- [ ] Migrations verified via PostgREST
- [ ] Approval flow unified — one generic Approve/Edit/Reject for all employees; zero `GUEST_*` remain
- [ ] AGENTS.md + README + CONTRIBUTING updated (Documentation Freshness rule)
