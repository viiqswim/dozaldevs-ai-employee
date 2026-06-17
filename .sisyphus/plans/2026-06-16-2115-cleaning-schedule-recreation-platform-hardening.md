# Harden the Employee-Creation Platform Using the Cleaning-Schedule Employee as a Correctness Probe

## TL;DR

> **Quick Summary**: Create a cleaning-schedule employee from a **simple, plain-language description** (the way a real non-technical user would), trigger it on **real dates**, and judge it **purely by whether its OUTPUT is correct** — measured against a correct answer the executing agent **derives independently from the raw source data**, NOT against any hand-written spec and NOT trusting the existing employee (which itself may be producing wrong output). When the output is wrong, fix the underlying **PLATFORM** (archetype-generator, its prompt, converse-create) and **keep iterating — with NO fix cap and NO deferred backlog — until the employee reliably produces correct schedules across multiple dates** and no existing employee regresses.
>
> **Core principle shift**: Descriptions are meant to be SIMPLE now. The complex prompt drafted earlier is explicitly NOT the baseline. The verdict comes from the employee's behavior (correct schedule out), judged by the agent's own first-principles reasoning over the real data.
>
> **Deliverables**:
>
> - An **independent correctness oracle** per test date: what a correct cleaning schedule SHOULD contain, computed by the agent from raw checkout + source data (not from the existing employee)
> - A cleaning-schedule employee created from a simple description that, when triggered, produces a **correct** schedule on **every** pinned date
> - As many PLATFORM fixes as it takes — iterated until reliable, fixing every diagnosed issue (no cap, no backlog)
> - A generation safety baseline proving the platform fixes don't break other existing employees
> - Full live evidence: transcripts, generated archetypes, triggered task traces reaching `Done`, posted schedules, and per-date correctness judgments
>
> **Estimated Effort**: XL (unbounded fix-and-reverify loop across multiple real dates — many generation + execution cycles; watch the daily cost ceiling)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Pre-flight (W1) → Oracle + safety baseline (W1) → Create-from-simple + trigger + judge output (W2) → Diagnose all defects (W3) → Unbounded fix loop until reliable (W3) → Multi-date reliability proof (W4) → Final Wave

---

## Context

### Original Request

Recreate the prototype `cleaning-schedule` AI employee, but with the real goals being: (1) stress-test the employee-creation→trigger→verify loop with something complex and real; (2) **fix the underlying platform problems** so a non-technical user starting from a simple description — guided by the clarify-then-act chat — can create an employee that **actually does its job correctly**. Hardening the platform is the deliverable; the one employee is the instrument.

### Interview Summary

**Key Decisions (including critical course-corrections)**:

- **Judge the OUTPUT, not the spec.** Success = the created employee, when triggered, produces a CORRECT cleaning schedule. The earlier hand-written complex prompt is explicitly REJECTED as a baseline — AI employee descriptions are meant to be SIMPLE now. What gets judged is behavior.
- **Derive correctness independently.** The existing cleaning-schedule employee may itself be producing wrong output. The executing agent MUST compute, from first principles over the raw checkout + Notion source data, what a correct schedule should be — and use that as the oracle. Do NOT trust the existing employee as ground truth.
- **No fix cap. No backlog.** Keep diagnosing and fixing the platform until the employee is RELIABLY correct across multiple dates. Every discovered issue gets fixed — nothing is deferred or written up as "unfixed."
- **Trust the executing agent to self-verify.** Anti-overfitting and no-regression are GOALS the agent verifies thoroughly using its own judgment (the agent is a strong model), not rigid externally-imposed mechanical gates. The agent decides how best to prove a fix is a genuine, generic platform improvement.
- **Two creation runs, both from SIMPLE input**: (A) one naive sentence → exercise the clarify-then-act chat; (B) a short plain-language description → fewer/no questions. Both judged by output correctness.
- **Driving method**: real-browser Playwright against `localhost:7700/dashboard` (authentic non-technical-user UX).
- **Reliability over a single date**: validate across MULTIPLE real dates (varied checkout counts/zones), since a zero-checkout date is hard to find and a single-date pass could be luck.

**Research Findings (verified)**:

- Existing prototype = archetype `00000000-0000-0000-0000-000000000019` (`cleaning-schedule`, VLRE), model `deepseek/deepseek-v4-flash`, vm_size `performance-1x`, `approval_required:false`, manual trigger with `date` input. Its instructions are EXTREMELY complex and contain hardcoded June-1-2026 "ground truth" — this is exactly what we are moving away from.
- Source data: Hostfully checkouts (per date) + 3 Notion pages — Reporte Financiero (cleaning times) `370d540b438080ca8676e61856488960`, Manual de Personal (cleaner ZIP zones) `370d540b438080969a72c16c20defc70`, Directorio Operativo (trash schedule) `370d540b4380809a8ea0c11074f92abb`. Output: Spanish schedule posted to Slack channel `C0B71QSMZKQ`.
- Platform surfaces: generator `src/gateway/services/archetype-generator.ts`; prompt `src/gateway/services/prompts/archetype-generator-prompts.ts`; converse-create `src/gateway/routes/admin-archetype-converse-create.ts` (forced proposal after 5 assistant turns); wizard UI `dashboard/src/panels/employees/CreateEmployeePage.tsx`.
- `archetype_generation_calls` trace table records every generation.
- Infra GREEN: Notion+Slack+GitHub+Gmail Composio connections ACTIVE for VLRE; gateway healthy `:7700`; Inngest UI `:8288`; worker image `ai-employee-worker:latest` recent; Docker infra up.
- `src/gateway/` changes hot-reload via tsx watch (no rebuild). `src/workers/` changes need docker rebuild.

### Metis Review (gaps addressed, as amended by user direction)

- **Open-ended loop risk** → resolved NOT by a fix cap but by a concrete TERMINATION CONDITION: the employee produces correct output across ALL pinned dates AND no existing employee regresses. The loop is unbounded in count but bounded by a measurable quality bar.
- **Primary failure mode (agent hand-tunes the one employee and falsely declares the platform fixed)** → guarded by: judging the OUTPUT (not archetype fields), proving fixes generalize to a 2nd unrelated employee, and the agent self-verifying genuineness — but expressed as goals the strong agent owns, not a brittle grep gate.
- **Regression surface** → a generation safety baseline for several existing employees is captured first and re-checked after fixes.
- **Wrong baseline risk** → resolved by the independently-derived correctness oracle; the existing employee is never the oracle.
- **Unvalidated assumptions** (dates with checkouts, model in catalog, naive sentence triggers a question, Playwright auth, single-gateway, source-data drift) → all become explicit Wave-1 tasks.

---

## Work Objectives

### Core Objective

Harden the employee-creation platform (generator + prompt + converse-create) so a simple, plain-language description from a non-technical user yields a cleaning-schedule employee that **reliably produces correct schedules** — proven by triggering it across multiple real dates and judging each output against an independently-derived correct answer — then keep fixing the platform until that reliability holds, without regressing other employees.

### Concrete Deliverables

- `.sisyphus/artifacts/correctness-oracle/` — per pinned date: the raw inputs (checkouts + source snapshots) AND the agent's independently-derived correct schedule, with the reasoning shown.
- `.sisyphus/artifacts/pinned-dates.md` — multiple real test dates (varied checkout counts/zones) + model-in-catalog confirmation.
- `.sisyphus/artifacts/safety-baseline/` — current generator output for several existing employees (regression "before").
- `.sisyphus/artifacts/run-a/`, `.sisyphus/artifacts/run-b/` — creation transcripts, generated archetypes, clarify-quality notes, Playwright evidence.
- `.sisyphus/artifacts/output-judgments/` — per date, per iteration: the employee's actual output vs the oracle, with a correct/incorrect verdict and the specific discrepancies.
- Platform fixes in the generator/prompt/converse-create — as many as needed — each shown to be a genuine generic improvement (validated on a 2nd unrelated employee) with no regression to the safety baseline.
- A final reliability proof: a freshly-created (from simple description) employee producing correct output on every pinned date.

### Definition of Done

- [ ] The cleaning-schedule employee, created from a SIMPLE description, produces a CORRECT schedule (matching the independently-derived oracle within the agreed correctness definition) on EVERY pinned date.
- [ ] Every diagnosed platform defect was fixed (nothing deferred to a backlog).
- [ ] Each platform fix is demonstrated to be a genuine generic improvement (verified on a 2nd unrelated employee), not a cleaning-specific hack.
- [ ] The generation safety baseline shows no degradation on the other existing employees after all fixes.
- [ ] The clarify-then-act chat, on the naive one-sentence input, surfaces the disambiguations a non-technical user needs (recorded with the transcript).
- [ ] All triggered tasks reached `Done` with recorded task ids + `task_status_log` traces; schedules posted to Slack.
- [ ] AGENTS.md/docs updated where conventions changed.

### Must Have

- An independently-derived correctness oracle per date (the agent's own first-principles answer over raw data).
- Multiple real test dates with checkouts (varied) for reliability.
- Single-gateway pre-flight before every Slack-touching step.
- A generation safety baseline captured before any fix.

### Must NOT Have (Guardrails)

- **NO judging by spec adherence.** Do not score the employee by how closely its archetype matches the complex hand-written prompt. Judge the OUTPUT's correctness only.
- **NO trusting the existing employee as ground truth.** The oracle is derived from raw data; the current employee's output is suspect and is itself under test.
- **NO complex/hardcoded descriptions as input.** Inputs are simple and plain-language; never paste the long spec or any date-specific "ground truth."
- **NO cleaning-specific hacks in the platform.** Generator/prompt/converse-create changes must be genuine generic improvements that help arbitrary employees — verified by the agent against a 2nd unrelated employee. The agent owns proving genuineness (e.g. semantic review + a 2nd-domain reproduction; a keyword scan for leaked domain terms is one optional signal, the agent's call).
- **NO fix cap and NO deferred backlog.** Fix every diagnosed issue; iterate until the reliability bar is met.
- **NO hardcoding to pass a test**; no special-casing the instrument's slug/id in platform code.
- **NO touching**: model-selection engine, harness/delivery phase, wizard UX (beyond driving it), or OTHER employees' archetypes (regressions are fixed by narrowing the generator change, never by patching downstream).
- **NO reusing** task ids / archetype drafts across iterations (Inngest memoization risk).
- **NO `src/workers/` changes** unless unavoidable (forces a docker rebuild) — prefer `src/gateway/` (hot-reload).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed (independent oracle derivation, live trigger + `task_status_log`, output-vs-oracle comparison, safety-baseline diffs, Playwright). No "user visually confirms" criteria.

### The Correctness Definition (judged on OUTPUT)

A produced schedule is CORRECT for a date when, compared to the agent's independently-derived oracle for that date:

- Every checkout on that date is present and assigned to exactly one cleaner, and that cleaner is the correct one per the source-data zone rules.
- Cleaning durations and any trash duties match what the source data implies for that date.
- Per-cleaner and overall totals are internally consistent (parts sum to stated totals).
- The schedule is in the correct language/format and contains real addresses — no placeholder/TODO text, no listing/lock codes.
- It omits nothing the oracle includes and invents nothing the oracle excludes.

> The bar is **substantive correctness vs the independently-derived answer**, allowing benign formatting variation. Any assignment, duration, trash-duty, or totals discrepancy = INCORRECT for that date.

### Test Decision

- **Infrastructure exists**: YES (Vitest). **Automated tests**: tests-after for any generator LOGIC change (add/adjust unit tests). Prompt-only changes are validated via the safety baseline + live output correctness.
- **Primary verification = agent-executed**: independent oracle vs live employee output, across multiple dates, every iteration.

### QA Policy

Evidence to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Wizard/clarify chat**: Playwright (real browser, authenticated) at `localhost:7700/dashboard`.
- **Trigger/lifecycle**: Bash (admin trigger) + `task_status_log` polling + Inngest UI.
- **Output correctness**: Bash/agent reasoning comparing posted schedule to the per-date oracle.
- **Safety baseline / generality**: Bash + DB (`archetype_generation_calls`, generated archetypes) + a 2nd unrelated employee generation.

### Oracle-First Rule (CRITICAL)

The per-date correctness oracle MUST be derived in Wave 1, from raw source data, BEFORE any employee output is judged — and independently of the existing employee's output. Judging against the existing employee, or reverse-justifying the oracle from the employee's output, is forbidden.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — parallel):
├── Task 1: Pre-flight — infra, single-gateway, cost headroom [quick]
├── Task 2: Pin MULTIPLE real dates (varied checkouts/zones) + model-in-catalog [unspecified-high]
├── Task 3: Snapshot raw inputs (checkouts + 3 source pages) per date, with hashes [quick]
├── Task 4: Derive the INDEPENDENT correctness oracle per date (first-principles) [ultrabrain]
├── Task 5: Capture generation safety baseline for several existing employees [unspecified-high]
├── Task 6: Probe — does a naive one sentence trigger a clarify question? [unspecified-high]
└── Task 7: Establish authenticated Playwright session against the dashboard [unspecified-high]

Wave 2 (Create from simple input → trigger → judge OUTPUT):
├── Task 8: Run A — one naive sentence → clarify chat → create employee (Playwright) [deep]
├── Task 9: Run B — short plain description → create employee (Playwright) [deep]
└── Task 10: Trigger created employee across ALL pinned dates; judge each OUTPUT vs oracle [deep]

Wave 3 (Diagnose everything → unbounded platform fix loop until reliable):
├── Task 11: Diagnose every output defect → platform root-cause → generic fix design [deep]
└── Task 12: UNBOUNDED fix loop: fix → regenerate → re-trigger all dates → re-judge → prove
              generality (2nd employee) + no regression → repeat until reliably correct [ultrabrain]

Wave 4 (Reliability proof + docs):
├── Task 13: Final reliability proof — fresh create-from-simple, correct on EVERY date [deep]
└── Task 14: Update AGENTS.md/docs for any changed conventions [writing]

Wave FINAL (4 parallel reviews → user okay → notify):
├── F1: Plan compliance + genuine-platform-fix audit (oracle)
├── F2: Code quality + safety-baseline regression review (unspecified-high)
├── F3: Real live QA — multi-date create→trigger→judge replay (unspecified-high)
└── F4: Scope fidelity + output-judged-not-spec-judged check (deep)
-> Present results -> user okay -> Task 15: Notify completion

Critical Path: 1 → 2 → 4 → 8/9 → 10 → 11 → 12 (loop) → 13 → F1-F4
Max Concurrent: 7 (Wave 1)
```

### Dependency Matrix

- **1**: deps none → blocks 8,9,10,13
- **2**: deps none → blocks 3,4,10,13
- **3**: deps 2 → blocks 4,10
- **4**: deps 2,3 → blocks 10,12
- **5**: deps none → blocks 12
- **6**: deps none → blocks 8
- **7**: deps none → blocks 8,9
- **8**: deps 1,6,7 → blocks 10
- **9**: deps 1,7 → blocks 10
- **10**: deps 1,2,3,4,8,9 → blocks 11
- **11**: deps 10 → blocks 12
- **12**: deps 4,5,11 → blocks 13
- **13**: deps 1,2,4,12 → blocks F-wave
- **14**: deps 12 → blocks F-wave

### Agent Dispatch Summary

- **Wave 1**: T1 `quick`, T2 `unspecified-high`, T3 `quick`, T4 `ultrabrain`, T5 `unspecified-high`, T6 `unspecified-high`, T7 `unspecified-high`
- **Wave 2**: T8 `deep`, T9 `deep`, T10 `deep`
- **Wave 3**: T11 `deep`, T12 `ultrabrain`
- **Wave 4**: T13 `deep`, T14 `writing`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

> Every task has Recommended Agent Profile + Parallelization + QA Scenarios. Correctness is judged on OUTPUT vs the independent oracle.

- [x] 1. Pre-flight: infra health, single-gateway, cost headroom

  **What to do**:
  - Confirm exactly ONE gateway process is listening on :7700 (a stale second gateway silently absorbs ~50% of Slack events — AGENTS.md). If >1, stop extras.
  - Confirm `GET /health` = ok, Inngest UI reachable at :8288, Docker infra containers up, worker image present (do NOT rebuild unless a later `src/workers/` change forces it).
  - Read `platform_settings.cost_limit_usd_per_day` + current spend; record headroom. This loop is UNBOUNDED in iterations and multi-date — the cost gate is a real stall risk, so record it and monitor.
  - Write `.sisyphus/artifacts/preflight.md`.

  **Must NOT do**: Start any run; change config.

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: read-only env checks.
  - **Skills**: [`production-ops`] (service-status patterns), [`long-running-commands`] (only if a docker action is needed).

  **Parallelization**: Parallel: YES · Wave 1 · Blocks: 8,9,10,13 · Blocked By: None.

  **References**:
  - AGENTS.md "Single-gateway pre-flight" + E2E Testing — the ~50% socket rule.
  - `src/lib/platform-settings.ts` `getPlatformSetting('cost_limit_usd_per_day')`.

  **Acceptance Criteria**:
  - [ ] `preflight.md` records: one gateway PID, health ok, Inngest reachable, infra up, worker image present, cost headroom.

  **QA Scenarios**:

  ```
  Scenario: Single gateway + cost headroom
    Tool: Bash
    Steps:
      1. lsof -nP -i:7700 | grep LISTEN | wc -l → assert == 1
      2. curl -s localhost:7700/health → assert "ok"
      3. psql query cost_limit_usd_per_day → assert numeric limit > current spend
    Expected Result: clean single-gateway env with cost headroom
    Failure Indicators: 0 or >1 gateway; no headroom
    Evidence: .sisyphus/evidence/task-1-preflight.txt
  ```

  **Commit**: NO (Group 1).

- [x] 2. Pin MULTIPLE real dates (varied checkouts/zones) + confirm model in catalog

  **What to do**:
  - Probe Hostfully checkouts across a range of real dates and select **at least 3 dates** with DIFFERENT characteristics: e.g. one with several checkouts across ≥2 ZIP zones, one with a small number, one with a single checkout — so reliability (not single-date luck) is tested. (A zero-checkout date is hard to find and is NOT required.)
  - Confirm `deepseek/deepseek-v4-flash` is present in the VLRE-usable `model_catalog` (the generator's recommend-model picks from catalog; absence contaminates results). If absent, record the catalog fallback the generator would pick.
  - Write `.sisyphus/artifacts/pinned-dates.md` with each date's raw checkout summary (count, zones) + model confirmation.

  **Must NOT do**: Trigger anything; require an empty date.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: live API probing + date selection judgment.
  - **Skills**: [`hostfully-api`], [`creating-archetypes`] (catalog rules).

  **Parallelization**: Parallel: YES · Wave 1 · Blocks: 3,4,10,13 · Blocked By: None.

  **References**:
  - `src/worker-tools/hostfully/get-checkouts.ts` — fields (zipCode, city, normalizedAddress, status, checkOutTime, roomId).
  - `hostfully-api` skill; `model_catalog` table (`GET /admin/model-catalog`).

  **Acceptance Criteria**:
  - [ ] ≥3 pinned dates recorded with varied checkout profiles (raw JSON saved).
  - [ ] deepseek presence (or fallback) recorded.

  **QA Scenarios**:

  ```
  Scenario: Three varied dates pinned
    Tool: Bash
    Steps:
      1. For candidate dates, invoke get-checkouts; record counts + distinct zip zones
      2. Assert >=3 dates selected spanning varied profiles (at least one multi-zone)
    Expected Result: a reliability-grade date set
    Evidence: .sisyphus/evidence/task-2-dates.json

  Scenario: Execution model available
    Tool: Bash
    Steps:
      1. Query model_catalog for deepseek/deepseek-v4-flash → record present/absent (+fallback)
    Evidence: .sisyphus/evidence/task-2-model.txt
  ```

  **Commit**: NO (Group 1).

- [x] 3. Snapshot raw inputs (checkouts + 3 source pages) per date, with hashes

  **What to do**:
  - For each pinned date, save the raw Hostfully checkouts JSON to `.sisyphus/artifacts/correctness-oracle/{date}/checkouts.json`.
  - Snapshot the 3 Notion source pages (Reporte Financiero, Manual de Personal, Directorio Operativo) to `.sisyphus/artifacts/correctness-oracle/sources/` with a content hash each. These are LIVE docs — snapshots freeze the inputs so the oracle (Task 4) and every later judgment use identical data, and drift is detectable.

  **Must NOT do**: Edit Notion; read the existing employee's output (the oracle must be independent).

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: read calls + file writes.
  - **Skills**: [].

  **Parallelization**: Parallel: YES (after 2) · Wave 1 · Blocks: 4,10 · Blocked By: 2.

  **References**:
  - `src/worker-tools/composio/execute.ts` — `--toolkit notion --action NOTION_GET_PAGE_MARKDOWN --params '{"page_id":"..."}'`.
  - The 3 page IDs (Context).

  **Acceptance Criteria**:
  - [ ] Per-date checkouts saved; 3 source snapshots saved with hashes; all non-empty.

  **QA Scenarios**:

  ```
  Scenario: Inputs frozen for oracle + judging
    Tool: Bash
    Steps:
      1. For each date, assert checkouts.json exists and parses
      2. Assert 3 source snapshots each > 200 chars + a hash recorded
    Expected Result: stable, hashed inputs
    Evidence: .sisyphus/evidence/task-3-snapshots.txt
  ```

  **Commit**: NO (Group 1).

- [x] 4. Derive the INDEPENDENT correctness oracle per date (first-principles)

  **What to do**:
  - For EACH pinned date, using ONLY the raw snapshots from Task 3 (checkouts + 3 source pages), compute from first principles what a CORRECT cleaning schedule should be: which cleaner each checkout is assigned to (by the source-data ZIP-zone rules), the cleaning duration per property/unit (from Reporte Financiero), any trash duties (from Directorio Operativo, by take-out-day matching the date's weekday), trash-only properties, travel-overhead where the source rules dictate, and per-cleaner + overall totals (do the arithmetic explicitly).
  - **Do NOT consult the existing employee's output, and do NOT reverse-justify from it** — it may be wrong and is itself under test. Show the reasoning so the oracle is auditable.
  - Save `.sisyphus/artifacts/correctness-oracle/{date}/oracle.md` per date (the correct schedule + the derivation).
  - Where the source data is genuinely ambiguous, record the ambiguity explicitly (these become the disambiguations the clarify chat SHOULD surface).

  **Must NOT do**: Use the existing employee as ground truth; skip showing the derivation; bake in date-specific assumptions not grounded in the snapshots.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: this is the logical backbone — careful multi-source reasoning to produce a trustworthy independent answer. Give the goal (a correct, auditable schedule per date from raw data), not step-by-step.
  - **Skills**: [].

  **Parallelization**: Parallel: YES (after 3) · Wave 1 · Blocks: 10,12 · Blocked By: 2,3.

  **References**:
  - Task 3 snapshots (the ONLY inputs permitted).
  - The source-data semantics described in Context (zone assignment, cleaning times, trash take-out-day matching, travel overhead) — used as RULES to apply, not answers to copy.

  **Acceptance Criteria**:
  - [ ] Per-date `oracle.md` exists with: every checkout assigned to exactly one correct cleaner, durations, trash duties, totals (arithmetic shown), and any genuine ambiguities flagged.
  - [ ] Derivation references only Task-3 snapshots; no reference to the existing employee's output.

  **QA Scenarios**:

  ```
  Scenario: Independent oracle is complete and auditable
    Tool: Bash + agent review
    Steps:
      1. For each date, assert oracle.md covers every checkout in checkouts.json (count matches)
      2. Assert totals are internally consistent (parts sum to stated totals)
      3. Assert the derivation cites only snapshots, not the existing employee
    Expected Result: a trustworthy per-date correct answer to judge against
    Evidence: .sisyphus/evidence/task-4-oracle.txt
  ```

  **Commit**: NO (Group 1).

- [x] 5. Capture generation safety baseline for several existing employees

  **What to do**:
  - Pick several representative existing employee descriptions from `docs/employees/` (e.g. guest-messaging, daily-summarizer, engineer — varied domains).
  - Run each through the CURRENT generator (converse-create / generate endpoint) and snapshot the full output (identity, execution_steps, delivery_steps, tool_registry, model, input_schema) to `.sisyphus/artifacts/safety-baseline/{slug}.json`, plus the `archetype_generation_calls` trace rows.
  - This "before" is what every platform fix gets checked against to ensure other employees don't regress.

  **Must NOT do**: Activate/trigger these; edit their archetypes; apply any fix yet.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: multiple live generations + structured capture.
  - **Skills**: [`employee-creation-debugging`], [`api-design`].

  **Parallelization**: Parallel: YES · Wave 1 · Blocks: 12 · Blocked By: None.

  **References**:
  - `admin-archetype-converse-create.ts` + generate route.
  - `employee-creation-debugging` skill — `archetype_generation_calls`.
  - `docs/employees/*.md` — source descriptions.

  **Acceptance Criteria**:
  - [ ] ≥3 baseline JSON files saved (non-empty execution_steps + tool_registry); trace rows captured.

  **QA Scenarios**:

  ```
  Scenario: Safety baseline captured
    Tool: Bash
    Steps:
      1. Count safety-baseline/*.json → assert >= 3
      2. Each has non-empty execution_steps + tool_registry
      3. Matching archetype_generation_calls row exists per run
    Evidence: .sisyphus/evidence/task-5-baseline.txt
  ```

  **Commit**: NO (Group 1).

- [x] 6. Probe — does a naive one sentence trigger a clarify question?

  **What to do**:
  - Draft a naive one-sentence description a real PM might type (e.g. "Help me tell my cleaning crew which houses to clean each day.").
  - POST it (single-message transcript) to `converse-create` for VLRE; assert the response is `{kind:'question'}`, not `{kind:'proposal'}`. Run A depends on the chat actually engaging.
  - If it jumps straight to a proposal, that itself is a candidate platform defect (chat skipped needed disambiguation) — record it for diagnosis and pick a slightly vaguer sentence for Run A.
  - Save `.sisyphus/artifacts/run-a/naive-sentence.md` (sentence + first question or the skip finding).

  **Must NOT do**: Complete the full chat here (Task 8); use a detailed description.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: API probe + judgment.
  - **Skills**: [`api-design`], [`employee-creation-debugging`].

  **Parallelization**: Parallel: YES · Wave 1 · Blocks: 8 · Blocked By: None.

  **References**: `admin-archetype-converse-create.ts` — `{kind:...}`, 5-turn backstop.

  **Acceptance Criteria**:
  - [ ] Sentence yields `kind:'question'` (or the immediate-proposal is logged as a defect for Task 11).

  **QA Scenarios**:

  ```
  Scenario: Naive sentence engages the clarify chat
    Tool: Bash (curl)
    Steps:
      1. POST converse-create with single-message transcript
      2. Assert response.kind == "question" (else log finding)
    Evidence: .sisyphus/evidence/task-6-probe.json
  ```

  **Commit**: NO (Group 1).

- [x] 7. Establish an authenticated Playwright session against the dashboard

  **What to do**:
  - The dashboard requires Supabase JWT auth. Establish a reusable authenticated Playwright session (login with a seeded user, or inject a valid session) and confirm you can reach `/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003` and see the description input (10–2000 chars).
  - Note dashboard conventions: SearchableSelect dropdowns (not native `<select>`) + URL-encoded navigation — selectors must account for these. Prefer connecting to a real Chrome via CDP if headless hydration issues appear.
  - Save storage state for reuse; record approach in `.sisyphus/artifacts/playwright-auth.md`.

  **Must NOT do**: Submit a description (Wave 2).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: auth plumbing + UI recon.
  - **Skills**: [`react-dashboard`], `dev-browser`/`playwright`.

  **Parallelization**: Parallel: YES · Wave 1 · Blocks: 8,9 · Blocked By: None.

  **References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — wizard steps, input ids, char limits.
  - AGENTS.md Dashboard URLs (use :7700, JWT required); `react-dashboard` skill.

  **Acceptance Criteria**:
  - [ ] Playwright reaches the authenticated wizard description box; storage state saved; screenshot captured.

  **QA Scenarios**:

  ```
  Scenario: Authenticated wizard reachable
    Tool: Playwright
    Steps:
      1. Load session, navigate to the new-employee wizard for VLRE
      2. Assert description textarea visible (not redirected to login)
      3. Screenshot
    Failure Indicators: redirect to /login or blank page
    Evidence: .sisyphus/evidence/task-7-wizard-auth.png
  ```

  **Commit**: NO (Group 1).

- [x] 8. Run A — one naive sentence → clarify chat → create employee (Playwright)

  **What to do**:
  - Using the authenticated session (Task 7) and the validated naive sentence (Task 6), drive the REAL wizard: type the sentence, then answer each clarifying question as a NON-TECHNICAL PM would — plausible, plain-language answers. Crucially, the answers should convey the real intent (a daily cleaning schedule from checkouts + the team's source docs, posted to the crew's Slack) **without** dictating step-by-step procedure or pasting any spec. Continue until a proposal is produced (or the 5-turn backstop fires).
  - Capture the FULL transcript + the generated archetype + step screenshots to `.sisyphus/artifacts/run-a/`.
  - Record (qualitatively) whether the chat surfaced the disambiguations a non-technical user needs — cross-reference the genuine ambiguities the oracle (Task 4) flagged. Note any jargon questions a non-technical user couldn't answer, and whether the backstop produced something coherent.
  - Do NOT trigger yet (Task 10). Do NOT judge by archetype shape — judging happens on OUTPUT.

  **Must NOT do**: Paste a detailed/complex description; give expert step-by-step answers; edit the generator; score by spec-match.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: multi-turn UX as a real user + careful capture.
  - **Skills**: [`react-dashboard`], [`employee-creation-debugging`], `playwright`.

  **Parallelization**: Parallel: YES (with 9) · Wave 2 · Blocks: 10 · Blocked By: 1,6,7.

  **References**:
  - Task 4 oracle (for the list of genuine ambiguities the chat ideally surfaces).
  - `CreateEmployeePage.tsx`; `admin-archetype-converse-create.ts` (kinds + backstop).

  **Acceptance Criteria**:
  - [ ] Full transcript + generated archetype + screenshots saved.
  - [ ] Notes on which needed disambiguations the chat surfaced, any jargon questions, and backstop coherence.

  **QA Scenarios**:

  ```
  Scenario: Naive-sentence creation captured (judged later on output)
    Tool: Playwright
    Steps:
      1. Type naive sentence; answer each question plainly as a non-technical user
      2. Reach proposal; save archetype JSON + transcript + screenshots
      3. Note disambiguations surfaced vs the oracle's flagged ambiguities; note jargon questions
    Expected Result: a real-UX creation artifact ready to trigger and judge
    Evidence: .sisyphus/evidence/task-8-run-a.md + screenshots
  ```

  **Commit**: NO (Group 1 artifacts).

- [x] 9. Run B — short plain description → create employee (Playwright)

  **What to do**:
  - Drive the wizard with a SHORT plain-language description (a few sentences a non-technical user could write — naming the job, the data sources in plain terms, the destination channel, and that it's a daily schedule). Still simple — NOT the long complex spec, NO procedural steps, NO date-specific data.
  - Expect fewer or no clarifying questions. Capture the generated archetype + screenshots to `.sisyphus/artifacts/run-b/`.
  - Do NOT trigger yet (Task 10). Judging is on OUTPUT.

  **Must NOT do**: Use the long complex prompt; include hardcoded ground truth; judge by spec-match.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: real-UX creation + capture.
  - **Skills**: [`react-dashboard`], [`creating-archetypes`], `playwright`.

  **Parallelization**: Parallel: YES (with 8) · Wave 2 · Blocks: 10 · Blocked By: 1,7.

  **References**: `CreateEmployeePage.tsx`; the simple-description principle (Context).

  **Acceptance Criteria**:
  - [ ] Generated archetype + screenshots saved; the input description recorded (and is genuinely simple/short).

  **QA Scenarios**:

  ```
  Scenario: Plain-description creation captured
    Tool: Playwright
    Steps:
      1. Submit a short plain-language description; capture proposal JSON + screenshots
      2. Assert the input contained no procedural steps and no date-specific data
    Evidence: .sisyphus/evidence/task-9-run-b.json
  ```

  **Commit**: NO (Group 1 artifacts).

- [x] 10. Trigger created employee across ALL pinned dates; judge each OUTPUT vs oracle

  **What to do**:
  - Choose the employee created in Wave 2 (prefer the Run-B plain-description one as the primary; keep Run-A available for comparison). Single-gateway pre-flight, then activate it for VLRE.
  - For EACH pinned date (Task 2), trigger with that date (FRESH task id each time — no reuse), poll `task_status_log` to terminal, confirm `Done`, and fetch the posted Slack schedule.
  - **Judge each output against that date's independent oracle (Task 4)** using the Correctness Definition: every checkout assigned to exactly one correct cleaner; durations + trash duties match; totals consistent; correct language/format; real addresses; nothing missing or invented. Produce a per-date verdict (CORRECT/INCORRECT) with the SPECIFIC discrepancies.
  - Cross-check each run used the same source content (compare Task-3 hashes; flag drift).
  - Save `.sisyphus/artifacts/output-judgments/{date}.md` per date. Expect failures here — they are the input to diagnosis.

  **Must NOT do**: Judge by archetype shape; trust the existing employee; declare success from `Done` alone (correctness is about the schedule content).

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: live multi-date execution + rigorous output-vs-oracle comparison.
  - **Skills**: [`debugging-lifecycle`], [`execution-trace-debugging`], [`feature-verification`], [`slack-conventions`], `playwright`.

  **Parallelization**: Parallel: NO (synthesis) · Wave 2 · Blocks: 11 · Blocked By: 1,2,3,4,8,9.

  **References**:
  - Task 4 oracles; Task 2 dates; Task 3 hashes.
  - `debugging-lifecycle`/`execution-trace-debugging` skills (state trace, log locations); AGENTS.md lifecycle (approval-off short-circuit).

  **Acceptance Criteria**:
  - [ ] Each pinned date triggered (fresh task id) → `Done` with recorded trace; schedule fetched.
  - [ ] Per-date CORRECT/INCORRECT verdict vs oracle with specific discrepancies recorded.
  - [ ] Source-hash cross-check recorded.

  **QA Scenarios**:

  ```
  Scenario: Multi-date output judged against independent oracle
    Tool: Bash (trigger + psql) + Slack fetch + agent comparison
    Preconditions: single gateway; employee active
    Steps:
      1. For each pinned date: trigger with --date; capture task id; poll to Done
      2. Fetch posted schedule; compare to that date's oracle.md
      3. Assert each checkout assigned once to the correct cleaner; durations/trash/totals match; language/format correct; no placeholder
      4. Record CORRECT/INCORRECT + discrepancies per date
    Expected Result: an honest per-date correctness map (failures expected → feed diagnosis)
    Evidence: .sisyphus/evidence/task-10-judgments/ (one file per date)
  ```

  **Commit**: NO (verification artifacts).

- [x] 11. Diagnose every output defect → platform root-cause → generic fix design

  **What to do**:
  - For EVERY incorrect output (any date) and every clarify-chat weakness from Wave 2, trace the root cause back to the PLATFORM: did the generator emit weak/missing execution steps? wrong/missing tools? a model that can't do the reasoning? Did the clarify chat fail to surface a disambiguation the oracle flagged? Did it use jargon? Did the backstop fire prematurely?
  - For each root cause, design a GENERIC fix to the generator / its prompt / converse-create — phrased to help ANY employee that needs structured multi-source reasoning, grounded tool selection, or better disambiguation. Not a cleaning-specific patch.
  - Determine whether each defect is likely to reproduce on an unrelated employee (the agent will confirm during the fix loop by actually generating one). Sequence fixes prompt-first (lowest blast radius), logic-second.
  - Write `.sisyphus/artifacts/diagnosis.md`: every defect → root cause → generic fix design. EVERY defect is in scope to fix (no triage-out, no backlog).

  **Must NOT do**: Classify any defect as "won't fix"; design a fix that only helps cleaning; propose editing the employee's archetype fields as the "fix."

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: root-cause analysis linking output errors to generator behavior.
  - **Skills**: [`employee-creation-debugging`], [`creating-archetypes`], [`api-design`].

  **Parallelization**: Parallel: NO · Wave 3 · Blocks: 12 · Blocked By: 10.

  **References**:
  - Task 10 judgments + Task 8 chat notes.
  - Generator/prompt/converse-create files (Context).

  **Acceptance Criteria**:
  - [ ] `diagnosis.md` maps EVERY observed defect to a platform root cause + a generic fix design. Zero defects left unaddressed.

  **QA Scenarios**:

  ```
  Scenario: Complete, generic-oriented diagnosis
    Tool: Bash + agent review
    Steps:
      1. Assert every INCORRECT date and every chat weakness has a diagnosis entry
      2. Assert each fix design targets a platform file generically (not the archetype row, not cleaning-only)
    Evidence: .sisyphus/evidence/task-11-diagnosis.txt
  ```

  **Commit**: NO (Group 1 artifacts).

- [x] 12. UNBOUNDED fix loop: fix → regenerate → re-trigger all dates → re-judge → prove generality + no regression → repeat until reliably correct

  **What to do** (iterate with NO cap until the termination condition is met):
  1. Apply the next generic fix — **prefer an additive edit to the generator's prompt** (`archetype-generator-prompts.ts`, hot-reloads, easy revert); edit generator logic (`archetype-generator.ts`) or converse-create only when a prompt change is insufficient. Any added example must be in an unrelated (non-cleaning) domain.
  2. **Regenerate** the cleaning-schedule employee FROM A SIMPLE DESCRIPTION (fresh draft, fresh task ids — Inngest memoization), activate, and **re-trigger across ALL pinned dates**, re-judging each OUTPUT against its oracle (Task 4) per the Correctness Definition.
  3. **Prove the fix is genuine/generic**: generate a 2nd, UNRELATED employee from one sentence (e.g. a sales stale-deal reminder) and confirm the fix helps it too (or at minimum does not depend on cleaning-domain specifics). The agent decides how best to demonstrate genuineness — semantic self-review of the diff, a domain-term scan for leaked specifics, and the 2nd-employee check are all available signals; use judgment, be thorough.
  4. **Prove no regression**: regenerate the safety-baseline employees (Task 5) and confirm no structural degradation. If degraded → narrow or revert THIS fix (never patch the other employee).
  5. Run `tsc --noEmit && pnpm lint && pnpm test`. If a logic change landed, add/adjust a Vitest test for the new generic behavior.
  6. **Repeat** with the next defect / any newly-surfaced defect.
  - **Termination condition (the bar, not a count)**: the cleaning-schedule employee — created from a SIMPLE description — produces a CORRECT schedule on EVERY pinned date, AND the safety baseline is clean, AND every diagnosed defect has been fixed. Keep going until ALL hold. New defects discovered mid-loop are fixed too (no backlog).
  - Record each iteration's evidence under `.sisyphus/artifacts/fix-loop/iter-{n}/` (the fix, the per-date re-judgments, the 2nd-employee check, the regression check).

  **Must NOT do**: Stop at a count; defer any defect; ship a cleaning-specific hack; hardcode to pass; special-case the instrument slug/id; touch `src/workers/`, model-selection, harness, wizard UX, or other employees' archetypes; reuse task ids/drafts.

  **Recommended Agent Profile**:
  - **Category**: `ultrabrain` — Reason: the core intellectual work — make the generator reliably produce a correct complex employee from simple input, generically, without regressions. Give the goal (hit the termination bar), not step-by-step.
  - **Skills**: [`creating-archetypes`], [`api-design`], [`employee-creation-debugging`], [`data-access-conventions`], [`debugging-lifecycle`], `playwright`.

  **Parallelization**: Parallel: NO (sequential loop) · Wave 3 · Blocks: 13 · Blocked By: 4,5,11.

  **References**:
  - `archetype-generator-prompts.ts` (SYSTEM_PROMPT_PRE/POST; field rules; execution/delivery patterns) — primary fix surface.
  - `archetype-generator.ts` (generate/refine/converse, postProcess, tool validation); `admin-archetype-converse-create.ts` (question/proposal + 5-turn backstop).
  - Task 4 oracles; Task 5 safety baseline; `archetype_generation_calls` traces.

  **Acceptance Criteria**:
  - [ ] Cleaning-schedule employee (from simple description) is CORRECT on EVERY pinned date.
  - [ ] Every diagnosed defect fixed; any mid-loop defects also fixed; no backlog remains.
  - [ ] Each landed fix shown genuine/generic (2nd-employee evidence) + safety baseline clean.
  - [ ] `tsc`, `pnpm lint`, `pnpm test` pass after each landed fix.

  **QA Scenarios**:

  ```
  Scenario: Loop terminates on the reliability bar, with generic non-regressing fixes
    Tool: Bash (trigger + psql) + Playwright + agent comparison
    Steps:
      1. After each fix: regenerate from simple desc; re-trigger all pinned dates; re-judge each vs oracle
      2. Generate a 2nd unrelated employee; confirm the fix generalizes (not cleaning-only)
      3. Regenerate safety-baseline employees; assert no degradation
      4. tsc --noEmit && pnpm lint && pnpm test -- --run → assert pass
      5. Continue until: correct on EVERY date AND baseline clean AND all defects fixed
    Expected Result: a reliably-correct employee from simple input, via genuine platform improvements
    Failure Indicators: any date still incorrect, any baseline degradation, any deferred defect → keep iterating / narrow-revert
    Evidence: .sisyphus/evidence/task-12-fix-loop/ (per-iteration)
  ```

  **Commit**: YES (Group 2 — one commit per landed fix).
  - Message: `fix(archetype-generator): <generic hardening description>` (NO cleaning/domain terms as the reason)
  - Files: generator/prompt/converse-create + any added unit tests
  - Pre-commit: `pnpm test -- --run && pnpm lint`

- [x] 13. Final reliability proof — fresh create-from-simple, correct on EVERY date

  **What to do**:
  - From a CLEAN slate (single-gateway pre-flight), create the cleaning-schedule employee ONE more time from a SIMPLE plain-language description through the real wizard (fresh draft) — proving the hardened platform yields a correct employee from simple input, not just a patched one-off.
  - Activate it; trigger across ALL pinned dates (fresh task ids); confirm each reaches `Done`; judge each posted schedule against its oracle. ALL dates must be CORRECT.
  - Save `.sisyphus/artifacts/final-proof/` (the description used, generated archetype, per-date traces + schedules + verdicts).

  **Must NOT do**: Reuse the Wave-2/loop employee or its task ids; hand-edit the archetype to pass; judge by spec.

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: clean end-to-end proof + output judging.
  - **Skills**: [`debugging-lifecycle`], [`feature-verification`], [`slack-conventions`], [`react-dashboard`], `playwright`.

  **Parallelization**: Parallel: NO · Wave 4 · Blocks: F-wave · Blocked By: 1,2,4,12.

  **References**: Task 4 oracles; Task 2 dates; the hardened generator.

  **Acceptance Criteria**:
  - [ ] Fresh employee created from a simple description; correct on EVERY pinned date (traces + verdicts saved).

  **QA Scenarios**:

  ```
  Scenario: Reliability holds from a clean create
    Tool: Playwright + Bash + agent comparison
    Steps:
      1. Create employee from a simple description (fresh draft)
      2. Trigger all pinned dates (fresh task ids) → each Done
      3. Judge each output vs oracle → assert ALL CORRECT
    Expected Result: hardened platform reliably yields a correct employee from simple input
    Failure Indicators: any date incorrect → return to Task 12
    Evidence: .sisyphus/evidence/task-13-final-proof/
  ```

  **Commit**: NO (verification artifacts).

- [x] 14. Update AGENTS.md/docs for any changed conventions

  **What to do**:
  - If any platform fix changed generator behavior, prompt conventions, or the converse-create flow in a way that affects how employees are created, update AGENTS.md (and README.md if endpoints/scripts changed) per the Documentation Freshness rule. Keep facts durable (no volatile counts/line numbers).
  - If nothing user-facing changed, record that explicitly.

  **Must NOT do**: Reference cleaning specifics as the reason; add volatile counts.

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: docs maintenance.
  - **Skills**: [`writing-guidelines`].

  **Parallelization**: Parallel: YES · Wave 4 · Blocks: F-wave · Blocked By: 12.

  **References**: AGENTS.md Documentation Freshness + Durability; the landed diffs from Task 12.

  **Acceptance Criteria**:
  - [ ] AGENTS.md/README updated where conventions changed (or an explicit "no user-facing change" note).

  **QA Scenarios**:

  ```
  Scenario: Docs reflect platform changes
    Tool: Bash (git diff)
    Steps:
      1. If Task-12 changed generator/converse behavior, assert AGENTS.md describes it durably
    Evidence: .sisyphus/evidence/task-14-docs.txt
  ```

  **Commit**: YES (Group 3) — `docs(employee-creation): update conventions for generator hardening`.

- [x] 15. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**: After the Final Verification Wave passes AND the user gives explicit okay, run `tsx scripts/telegram-notify.ts "✅ Employee-creation platform hardening complete — cleaning-schedule employee created from a simple description now produces correct schedules across all test dates. Come back to review."`

  **Recommended Agent Profile**: **Category**: `quick`. **Skills**: [].
  **Parallelization**: Sequential — absolute last action · Blocked By: F1-F4 + user okay.
  **Acceptance Criteria**: [ ] Telegram message sent.
  **Commit**: NO.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Never mark F1-F4 checked before user okay.

- [x] F1. **Plan Compliance + Genuine-Platform-Fix Audit** — `oracle`
      Verify every "Must Have" exists (oracle artifacts, multi-date reliability evidence, safety baseline). Verify every "Must NOT Have" is absent: confirm judging was OUTPUT-based not spec-based; confirm the oracle was derived independently (not from the existing employee); confirm no cleaning-specific hacks in the platform files (review the diffs semantically; a domain-term scan is one supporting signal); confirm each fix was shown generic on a 2nd unrelated employee; confirm NO deferred backlog exists (everything diagnosed was fixed); confirm no other employees' archetypes were edited. Confirm evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Fixes generic [N/N] | Backlog absent [Y/N] | VERDICT`

- [x] F2. **Code Quality + Safety-Baseline Regression** — `unspecified-high`
      Run `tsc --noEmit` + `pnpm lint` + `pnpm test`. Review changed platform files for `as any`/`@ts-ignore`, dead code, over-abstraction. Re-run the generation safety baseline for the existing employees and confirm no structural degradation. Query `archetype_generation_calls` for new error states.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Regression [CLEAN/N degraded] | VERDICT`

- [x] F3. **Real Live QA — Multi-Date Replay** — `unspecified-high` (+ `playwright` skill)
      From clean state + single-gateway pre-flight: re-create the employee from a simple description, trigger it across all pinned dates, confirm each task reaches `Done` (fresh task ids + `task_status_log` traces), and independently re-judge each posted schedule against the per-date oracle. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Dates [N/N correct] | All Done [Y/N] | VERDICT`

- [x] F4. **Scope Fidelity + Output-Judged Check** — `deep`
      For each task: read "What to do", read the actual diff. Confirm correctness was judged on OUTPUT vs the independent oracle (not spec adherence, not the existing employee). Confirm platform changes touched only generator/prompt/converse-create; no scope creep into model-selection, harness, or wizard UX; no other employees' archetypes edited. Confirm the loop terminated on the reliability bar (correct on every date), not on a count. Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Output-judged [Y/N] | Scope creep [NONE/N] | VERDICT`

---

## Commit Strategy

- Group 1 (artifacts/setup): `chore(planning): pin dates, correctness oracle, safety baseline` — `.sisyphus/artifacts/**`
- Group 2 (platform fixes): `fix(archetype-generator): <generic hardening description>` — generator/prompt/converse-create + any added unit tests. Pre-commit: `pnpm test -- --run && pnpm lint`. One commit per landed fix; messages stay generic/platform-level (never "to fix cleaning schedule").
- Group 3 (docs): `docs(employee-creation): conventions updated for generator hardening` — AGENTS.md/README if conventions changed.

## Success Criteria

### Verification Commands

```bash
# Build + tests + lint
pnpm test -- --run && pnpm lint && pnpm build

# An employee task reached Done (replace TASK_ID)
psql "postgresql://postgres:postgres@localhost:54322/ai_employee" -c "SELECT status FROM tasks WHERE id='TASK_ID';"  # expect: Done
```

### Final Checklist

- [ ] Employee created from a SIMPLE description produces a CORRECT schedule on EVERY pinned date (vs independent oracle).
- [ ] Every diagnosed defect fixed; no backlog.
- [ ] Each fix shown generic (2nd unrelated employee) + safety baseline clean.
- [ ] All triggers reached `Done` with recorded traces; schedules posted.
- [ ] Docs updated.
