# Skill System Hardening — Durable Docs, De-Overlapped Triggers, Re-Tested to Flawless

## TL;DR

> **Quick Summary**: Fix every finding from the live blind-discovery tests and the structural audit of the new skill library, AND eliminate the root-cause class behind them: brittle, volatile facts (hardcoded counts, exact line numbers, file line-lengths) that rot silently. Add a permanent **Documentation Durability** convention to AGENTS.md so the mistake cannot recur, then re-run the exact same blind-discovery test battery until the skill system passes flawlessly with zero friction.
>
> **Deliverables**:
>
> - A new **Documentation Durability (MANDATORY)** convention in AGENTS.md with a forbidden-vs-durable example set and the one-question heuristic
> - All volatile counts removed from skills AND AGENTS.md (enumerate items / name symbols / state invariants instead)
> - `inngest` skill function table completed (the two Slack functions added) — derived from ground truth, not a hardcoded tally
> - The two identically-named `lifecycle-helpers.ts` files disambiguated in the `inngest` skill (the PARTIAL finding)
> - Trigger-table de-overlap: `prisma` / `data-access-conventions` / `inngest` rows given clean lanes; `security` trigger narrowed
> - The vague multi-destination "Known issues" pointer fixed; the two worker-container-only skills labeled as such
> - A permanent **brittle-fact sweep** added to the verification wave
> - A re-run of all 4 blind-discovery tests + structural re-audit, looped until every verdict is YES and friction is ≤2/5 with zero dangling refs
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — Wave 1 is 4 independent files (fully parallel), Wave 2 is the verification battery
> **Critical Path**: Tasks 1–4 (parallel) → Task 5 (brittle-fact sweep) → Tasks 6a–6d (blind re-tests, parallel) + Task 7 (structural re-audit) → loop-to-green → commit → notify

---

## Context

### Original Request

After building a 10-skill OpenCode dev-skill library and slimming AGENTS.md, the user asked for a _real_ usability test. Live blind-discovery tests (fresh agents given realistic tasks, navigating only via the repo's own docs) plus an Oracle structural audit surfaced concrete findings. The user then made a sharper observation: hardcoding a count of active functions in a skill "doesn't make any sense" — and asked for a durable guardrail so the whole _class_ of volatile-fact rot is prevented, with explicit forbidden examples.

### What the Live Tests Found (the findings this plan fixes)

| Source             | Finding                                                                                                                                          | Severity                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| inngest blind test | `inngest` skill hardcodes a function count AND its table is missing `slack-trigger-handler` + `slack-input-collector`; contradicts AGENTS.md     | BLOCKER (reframed: brittle count) |
| inngest blind test | Two identically-named `lifecycle-helpers.ts` files (`src/inngest/lib/` vs `src/inngest/lifecycle/steps/`) — real confusion trap; verdict PARTIAL | HIGH                              |
| structural audit   | `prisma` vs `data-access-conventions` trigger rows overlap ("query the database" vs "reads/writes the DB")                                       | HIGH                              |
| structural audit   | "Inngest function" appears in BOTH the `inngest` and `data-access-conventions` trigger rows                                                      | HIGH                              |
| structural audit   | `security` trigger ("input validation, or tenant data isolation") is so broad it matches nearly every task                                       | HIGH                              |
| structural audit   | The "Known issues" `[Moved to skills]` pointer names 3 skills with no routing signal                                                             | MEDIUM                            |
| structural audit   | `tool-usage-reference` + `uuid-disambiguation` are in the dev trigger table but are worker-container-only skills                                 | MEDIUM                            |
| user insight       | Hardcoded counts (functions, tests, modules), exact line numbers, and file line-lengths are a recurring rot class with no guardrail              | ROOT CAUSE                        |

### Root-Cause Reframe (the user's insight)

The original "5 vs 7" finding mis-diagnosed the fix as "update the number." The real defect is that a **count of mutable things should never be written down at all**. This plan bans the class, documents the ban, and enforces it with a sweep — so the fix is permanent, not a re-armed time-bomb.

### Verified Ground Truth (brittle facts currently present)

- `inngest/SKILL.md` — description: "the 5 active functions"; heading: "Active Functions (5)"; body: "a thin orchestrator (84 lines)"; function table missing 2 functions
- `prisma/SKILL.md` — "all 6 repository modules"; "8 typed row interfaces"
- `data-access-conventions/SKILL.md` — "the 6 repository modules"
- `AGENTS.md` — "Inngest functions (active — 7)"; "the hardcoded 14-model Go list" / "14-model"
- ALLOWED semantic constants that must NOT be "fixed": `SYNTHESIS_THRESHOLD = 5`, `MAX_EMPLOYEE_RULES_CHARS = 8000`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000`, port `5432`/`6543`, the 30-minute `Reviewing` watchdog threshold

### Metis-Style Gap Check (self-applied)

- Risk: executor "fixes" a legitimate semantic constant (e.g. `SYNTHESIS_THRESHOLD = 5`) → mitigated by the explicit allow-list and the one-question heuristic in the durability convention and in each task's Must-NOT-do.
- Risk: completing the inngest table reintroduces a count if phrased "Active Functions (7)" → mitigated by mandating the heading carry NO number and the list be derived from `src/gateway/inngest/serve.ts` registration (ground truth), not from memory.
- Risk: trigger de-overlap creates a _gap_ (a task that now matches no row) → mitigated by the structural re-audit's situational-coverage check.

---

## Work Objectives

### Core Objective

Make the dev-skill system flawless by AI-agent usability standards: every realistic task routes unambiguously to the right skill(s), every skill loads, every fact in AGENTS.md and the skills is durable (survives future commits without edits), and the verification battery confirms it with re-run blind tests.

### Concrete Deliverables

- AGENTS.md: new Documentation Durability convention; own volatile counts removed; trigger rows de-overlapped + narrowed; vague pointer fixed; worker-only skills labeled
- `inngest`, `prisma`, `data-access-conventions` skills: volatile counts removed, replaced with durable phrasing
- `inngest` skill: complete function list (ground-truth-derived) + `lifecycle-helpers.ts` disambiguation
- A re-run test report proving zero remaining friction

### Must Have

- A durability convention that names forbidden patterns AND the allowed-constant exception with a generalizable heuristic
- Zero volatile counts/line-numbers/file-line-lengths in AGENTS.md or any `.opencode/skills/**/SKILL.md`
- The `inngest` function list complete and matching `src/gateway/inngest/serve.ts`
- Trigger rows with non-overlapping lanes; no task left without a route
- All blind-discovery re-tests return verdict YES; structural re-audit returns ADEQUATE-or-better with no HIGH/BLOCKER open

### Must NOT Have (Guardrails)

- NO hardcoded count of anything mutable (functions, tests, modules, interfaces, skills, files) anywhere in AGENTS.md or skills
- NO exact line-number references ("see line 334") or file line-length claims ("84 lines") in durable docs
- Do NOT remove or alter legitimate **named semantic constants** (`SYNTHESIS_THRESHOLD`, `MAX_*_CHARS`, ports, the 30-min threshold)
- Do NOT delete any AGENTS.md section wholesale — extracted content keeps its pointer
- Do NOT touch employee runtime skills' behavior; this is dev-skill + AGENTS.md hygiene only
- Do NOT introduce a trigger-table gap (every major situation must still have a clear route)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision

- **Infrastructure exists**: N/A (documentation/markdown change — no unit-test framework applies)
- **Automated tests**: None (no code changes). Verification is (a) grep-based brittle-fact sweeps, (b) live `skill()` load + blind-discovery agent re-tests, (c) structural re-audit.
- **Primary method**: Re-run the exact blind-discovery battery that found the issues; require all-YES.

### QA Policy

Every task carries agent-executed QA scenarios. Evidence → `.sisyphus/evidence/hardening/`. The Wave-2 battery is the real test the user asked for; it loops until flawless.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start immediately — 4 INDEPENDENT files, fully parallel):
├── Task 1: AGENTS.md surgery — durability convention + own counts + triggers + pointer + labels [deep]
├── Task 2: inngest skill — de-count + complete function list + helpers disambiguation [deep]
├── Task 3: prisma skill — remove "6 repository modules" / "8 typed interfaces" [quick]
└── Task 4: data-access-conventions skill — remove "6 repository modules" [quick]

Wave 2 (After ALL Wave 1 — verification battery, parallel):
├── Task 5: Brittle-fact sweep across AGENTS.md + all skills (grep + judgment) [unspecified-high]
├── Task 6a: Blind re-test — DB table + admin endpoint [explore]
├── Task 6b: Blind re-test — Inngest lifecycle step (was PARTIAL → must become YES) [explore]
├── Task 6c: Blind re-test — dashboard filter dropdown [explore]
├── Task 6d: Blind re-test — stuck Reviewing prod task [explore]
└── Task 7: Structural re-audit of AGENTS.md routing [oracle]

Loop: any FAIL/PARTIAL/HIGH → fix → re-run affected check → until all green.

Wave 3 (After green):
├── Task 8: Commit all changes [quick]
└── Task 9: Notify completion [quick]

Critical Path: (1‖2‖3‖4) → 5 → (6a‖6b‖6c‖6d‖7) → loop → 8 → 9
```

### Agent Dispatch Summary

- **Wave 1**: Task 1 → `deep`, Task 2 → `deep`, Task 3 → `quick`, Task 4 → `quick`
- **Wave 2**: Task 5 → `unspecified-high`, Tasks 6a–6d → `explore` (parallel background), Task 7 → `oracle`
- **Wave 3**: Task 8 → `quick`, Task 9 → `quick`

---

## TODOs

- [ ] 1. AGENTS.md surgery — durability convention + own counts + trigger lanes + pointer + worker-only labels

  **What to do** (all in `AGENTS.md`):

  **A. Add a "Documentation Durability (MANDATORY)" convention** under the `## Key Conventions` section (place it near the existing "Documentation Freshness" rule so the two read as companions). It MUST contain:
  - The principle: _Every fact written in AGENTS.md or in any skill must be **durable** — true today and true after future commits without needing an edit. Documentation describes patterns, invariants, and where to look — never volatile tallies that a normal code change invalidates._
  - A **Forbidden (volatile facts)** list with concrete examples:
    - Counting mutable collections: "Active Functions (7)", "the 6 repository modules", "8 typed interfaces", "expects 1490 passing, 27 skipped" unit tests, "58 stories", "the 14-model Go list"
    - Exact line-number references: "see AGENTS.md line 334", "defined at line 53"
    - File line-length claims: "a thin orchestrator (84 lines)", "503-line skill"
  - A **Durable instead** column showing the fix for each: _enumerate the items in a list/table (the list is the source of truth), name the symbol/file, or state the invariant_ — e.g. instead of "Active Functions (7)" write "Active functions (each registered in `src/gateway/inngest/serve.ts`):" followed by the list; instead of "84 lines" write "a thin orchestrator that only wires step modules".
  - The **allowed exception**: _Named semantic constants that define behavior are NOT volatile facts and MUST be kept_ — `SYNTHESIS_THRESHOLD = 5`, `MAX_EMPLOYEE_RULES_CHARS = 8000`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000`, DB ports (`5432`/`6543`), the 30-minute Reviewing watchdog threshold. These are contracts, not counts.
  - The **one-question heuristic**: _"If someone adds or removes one of these tomorrow, does this sentence become a lie?" If yes → it's a volatile fact; enumerate or describe instead. If the number is a configured threshold/contract that a code change would deliberately change (not incidentally invalidate) → it's a semantic constant; keep it._

  **B. Remove AGENTS.md's own volatile counts** (apply the new rule to itself):
  - "Inngest functions (active — 7):" → drop the "— 7"; keep the enumerated list (the list IS the truth). Phrase the lead-in so adding an 8th function later needs no count edit.
  - "the hardcoded 14-model Go list" / any "14-model" phrasing → "the hardcoded Go model list in `src/lib/go-models.ts`" (name the file; drop the number).
  - Scan the whole file for any other volatile tally and fix in place. Do NOT touch semantic constants (`SYNTHESIS_THRESHOLD = 5`, `MAX_*_CHARS`, ports).

  **C. De-overlap the trigger table** (the `If you are about to… | Load this skill` table):
  - `prisma` row → schema/migration/seed lane ONLY. Suggested: "Change the Prisma schema, write or run migrations, or edit seed data". Remove "or query the database" (that's runtime DB access → data-access lane).
  - `data-access-conventions` row → runtime DB/env/HTTP access lane. Remove "Inngest function" from it (that's the `inngest` lane). Suggested: "Write or modify any code that accesses the DB at runtime (repositories, PostgREST calls), reads env vars, or makes outbound HTTP calls".
  - `inngest` row → keep workflow-logic lane (unchanged is fine; ensure it owns "Inngest function / step function / durable workflow").
  - The three lanes must be mutually exclusive in wording.

  **D. Narrow the `security` trigger** so it stops matching nearly every task. Suggested: "Add or modify secret storage, encryption, admin auth middleware, or tenant isolation boundaries". Drop the bare "input validation" (that's `api-design`/Zod) and standalone "tenant data isolation" phrasing that over-matches.

  **E. Fix the vague "Known issues" pointer** (the `[Moved to skills]` line that names 3 skills). Replace with per-category routing, e.g.: "For known issues — production/tunnel issues → `production-ops`; Slack/Socket Mode issues → `slack-conventions`; Inngest Dev Server issues → `inngest`."

  **F. Label the two worker-container-only skills.** In the dev trigger table, the `tool-usage-reference` and `uuid-disambiguation` rows must be marked as worker-container-only (they live in `src/workers/skills/`, not `.opencode/skills/`), e.g. append "(worker container only)" to each, so a dev agent doesn't try to load them locally and get confused.

  **Must NOT do**:
  - Remove/alter semantic constants (`SYNTHESIS_THRESHOLD`, `MAX_*_CHARS`, ports, 30-min threshold)
  - Delete any section wholesale or drop an existing `[Moved to skill]` pointer
  - Create a trigger-table gap — every situation that had a route must still have one
  - Reorder unrelated sections

  **Recommended Agent Profile**:
  - **Category**: `deep` — multi-edit surgery on the most critical always-loaded file; requires judgment to distinguish volatile counts from semantic constants
  - **Skills**: `[]`

  **Parallelization**: Can run in parallel — YES · Wave 1 · Blocks Task 5 · Blocked by none

  **References**:
  - `AGENTS.md` — `## Key Conventions` (add convention near "Documentation Freshness"), the Inngest functions line, the Go-model line, the Skills System trigger table, the Employee-skills table (worker-only context), the "Known issues" pointer
  - `src/gateway/inngest/serve.ts` — ground-truth registration of active Inngest functions (for phrasing the enumerated list)
  - `src/lib/go-models.ts` — the Go model list (name it instead of counting it)

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Durability convention exists and is self-consistent
    Tool: Bash
    Steps:
      1. grep -c "Documentation Durability" AGENTS.md            # >=1
      2. grep -ci "volatile" AGENTS.md                            # >=1 (forbidden-facts framing present)
      3. grep -c "SYNTHESIS_THRESHOLD" AGENTS.md                  # still present (constant preserved)
    Expected: convention present; allowed-constant exception intact
    Evidence: .sisyphus/evidence/hardening/task-1-durability.txt

  Scenario: AGENTS.md no longer hardcodes its own mutable counts
    Tool: Bash
    Steps:
      1. grep -n "active — 7\|active—7\|(active — 7)" AGENTS.md   # expect empty
      2. grep -n "14-model" AGENTS.md                            # expect empty
      3. grep -n "slack-trigger-handler" AGENTS.md               # list still enumerates the functions
    Expected: no volatile count; enumerated list retained
    Evidence: .sisyphus/evidence/hardening/task-1-counts.txt

  Scenario: Trigger lanes are mutually exclusive and security narrowed
    Tool: Read + judgment
    Steps:
      1. Read the trigger table. Confirm "query the database" no longer in prisma row.
      2. Confirm "Inngest function" no longer in data-access-conventions row.
      3. Confirm security row no longer contains bare "input validation".
      4. Confirm tool-usage-reference + uuid-disambiguation rows marked worker-only.
      5. Confirm the "Known issues" pointer routes per-category.
    Expected: all five true; no situation left without a route
    Evidence: .sisyphus/evidence/hardening/task-1-triggers.txt
  ```

  **Commit**: groups with Task 8

- [x] 2. inngest skill — remove volatile counts, complete function list (ground-truth), disambiguate the two `lifecycle-helpers.ts`

  **What to do** (all in `.opencode/skills/inngest/SKILL.md`):
  - **De-count the description frontmatter**: replace "the 5 active functions" with non-counting phrasing, e.g. "the active lifecycle functions". Keep `description` starting with "Use when".
  - **De-count the heading**: "## Active Functions (5)" → "## Active Functions" (NO number).
  - **Complete the function table from GROUND TRUTH**: read `src/gateway/inngest/serve.ts` (and the function definition files) and add the missing `employee/slack-trigger-handler` and `employee/slack-input-collector` rows with correct trigger events and file paths. The list must match what's actually registered — do not trust any prior tally.
  - **Remove the "(84 lines)" file-line-length claim**: "a thin orchestrator (84 lines)" → "a thin orchestrator that only wires the step modules together".
  - **Disambiguate the two `lifecycle-helpers.ts` files** (the PARTIAL finding). Add an explicit callout distinguishing:
    - `src/inngest/lifecycle/steps/lifecycle-helpers.ts` — the step-level helpers (`safeRecordWorkMetric`, `mergeTaskMetadata`, `cleanupExecutionMachine`, `writeFeedbackEvent`) — import these from step modules.
    - `src/inngest/lib/lifecycle-helpers.ts` — the lower-level helpers (e.g. `recordWorkMetric`, `patchTask`, `logStatusTransition`) — the raw layer the step-level wrappers call.
      State plainly: from a step module, import the **steps-level** file; never confuse the two. Make this a NEVER-style rule.
  - Scan the rest of the file for any other volatile count/line-number and fix.

  **Must NOT do**:
  - Re-introduce a count anywhere (no "Active Functions (7)")
  - Alter `SYNTHESIS_THRESHOLD = 5` or other semantic constants present in the file
  - Change the documented step-module behaviors or the NonRetriableError/idempotency guidance
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `deep` — must read source to derive the true function list and correctly disambiguate two same-named files
  - **Skills**: `[]`

  **Parallelization**: Can run in parallel — YES · Wave 1 · Blocks Task 5 · Blocked by none

  **References**:
  - `.opencode/skills/inngest/SKILL.md` — target (description line, "Active Functions" heading + table, "(84 lines)" phrase, Step-Module Map)
  - `src/gateway/inngest/serve.ts` — GROUND TRUTH for which functions are registered
  - `src/inngest/lifecycle/steps/lifecycle-helpers.ts` and `src/inngest/lib/lifecycle-helpers.ts` — the two same-named files to disambiguate (verify exports of each)

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Function list complete and uncounted
    Tool: Bash
    Steps:
      1. grep -n "Active Functions" .opencode/skills/inngest/SKILL.md      # heading has NO "(N)"
      2. grep -c "slack-trigger-handler\|slack-input-collector" .opencode/skills/inngest/SKILL.md  # >=2
      3. grep -n "5 active functions\|Active Functions (5)\|Active Functions (7)" .opencode/skills/inngest/SKILL.md  # empty
    Expected: heading uncounted; both Slack functions present; no count
    Evidence: .sisyphus/evidence/hardening/task-2-functions.txt

  Scenario: lifecycle-helpers disambiguation present; no line-length claim
    Tool: Bash
    Steps:
      1. grep -c "lifecycle/steps/lifecycle-helpers" .opencode/skills/inngest/SKILL.md   # >=1
      2. grep -c "lib/lifecycle-helpers" .opencode/skills/inngest/SKILL.md                # >=1
      3. grep -n "84 lines\|84-line" .opencode/skills/inngest/SKILL.md                    # empty
      4. test "$(grep -c '' .opencode/skills/inngest/SKILL.md)" -le 400 && echo OK        # <=400 lines
    Expected: both paths named distinctly; no "(84 lines)"; file within cap
    Evidence: .sisyphus/evidence/hardening/task-2-helpers.txt
  ```

  **Commit**: groups with Task 8

- [x] 3. prisma skill — remove volatile counts

  **What to do** (in `.opencode/skills/prisma/SKILL.md`):
  - Replace "all 6 repository modules" with non-counting phrasing, e.g. "all repository modules under `src/repositories/` (read each file's header for ownership)". The directory is the source of truth, not a number.
  - Replace "8 typed row interfaces" with e.g. "the typed PostgREST row interfaces in `src/workers/lib/postgrest-types.ts`".
  - Scan for any other volatile count/line-number and fix.
  - Leave the PostgREST-cache-reload guidance, soft-delete rules, the `DATABASE_URL_DIRECT` (5432) port (semantic constant — keep), and `[ARCH-10]` reference intact.

  **Must NOT do**:
  - Touch port numbers (`5432`/`6543` are semantic constants), the `NOTIFY pgrst` command, or the repository-mandate rule
  - Re-introduce a count
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `quick` — two targeted phrase replacements + a scan
  - **Skills**: `[]`

  **Parallelization**: Can run in parallel — YES · Wave 1 · Blocks Task 5 · Blocked by none

  **References**:
  - `.opencode/skills/prisma/SKILL.md` — the "6 repository modules" and "8 typed row interfaces" phrases (Cross-References section)
  - `src/repositories/` and `src/workers/lib/postgrest-types.ts` — name these instead of counting

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: prisma skill has no volatile counts
    Tool: Bash
    Steps:
      1. grep -nE "[0-9]+ repository modules|[0-9]+ typed" .opencode/skills/prisma/SKILL.md   # empty
      2. grep -c "src/repositories/" .opencode/skills/prisma/SKILL.md                          # >=1 (named, not counted)
      3. grep -c "NOTIFY pgrst" .opencode/skills/prisma/SKILL.md                               # >=1 (guidance intact)
    Expected: counts gone; directory named; key guidance preserved
    Evidence: .sisyphus/evidence/hardening/task-3-prisma.txt
  ```

  **Commit**: groups with Task 8

- [x] 4. data-access-conventions skill — remove volatile count

  **What to do** (in `.opencode/skills/data-access-conventions/SKILL.md`):
  - Replace "the 6 repository modules" with non-counting phrasing, e.g. "the repository modules under `src/repositories/`".
  - Scan for any other volatile count/line-number and fix.
  - Leave the 7-rule structure and all helper references intact (the rules are a described set, not a brittle tally — but if any sentence hardcodes a count of rules/helpers that a refactor would invalidate, rephrase to enumerate).

  **Must NOT do**:
  - Alter the documented conventions themselves or any helper/file name
  - Re-introduce a count
  - Exceed 400 lines

  **Recommended Agent Profile**:
  - **Category**: `quick` — one targeted phrase replacement + a scan
  - **Skills**: `[]`

  **Parallelization**: Can run in parallel — YES · Wave 1 · Blocks Task 5 · Blocked by none

  **References**:
  - `.opencode/skills/data-access-conventions/SKILL.md` — the "6 repository modules" phrase
  - `src/repositories/` — name it instead of counting

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: data-access skill has no volatile repository count
    Tool: Bash
    Steps:
      1. grep -nE "[0-9]+ repository modules" .opencode/skills/data-access-conventions/SKILL.md   # empty
      2. grep -c "src/repositories/" .opencode/skills/data-access-conventions/SKILL.md             # >=1
    Expected: count gone; directory named
    Evidence: .sisyphus/evidence/hardening/task-4-data-access.txt
  ```

  **Commit**: groups with Task 8

- [x] 5. Brittle-fact sweep across AGENTS.md + all skills

  **What to do**:
  - Run a repo-wide sweep over `AGENTS.md` and every `.opencode/skills/**/SKILL.md` for the volatile-fact class:
    - Counts of mutable collections: `grep -rnE "\([0-9]+\)|[0-9]+ (active|repository|repositories|typed|modules|interfaces|tests|passing|skipped|stories|skills|functions|steps)" AGENTS.md .opencode/skills/`
    - File line-length claims: `grep -rnE "\([0-9]+ lines\)|[0-9]+-line" AGENTS.md .opencode/skills/`
    - Exact line-number refs: `grep -rnE "line [0-9]{2,}" .opencode/skills/`
  - For EACH hit, classify: **VOLATILE** (must be fixed — count of mutable things, line ref, file length) vs **SEMANTIC CONSTANT** (keep — `SYNTHESIS_THRESHOLD = 5`, `MAX_*_CHARS`, ports `5432`/`6543`, the 30-min threshold, version pins like OpenCode `1.14.31`, percentages/thresholds that are contracts).
  - Produce a table: file:line · matched text · classification · (if volatile) the required fix.
  - If ANY volatile hit remains → REJECT: report exactly which, so the orchestrator delegates a fix and re-runs this sweep.
  - Save the report to `.sisyphus/evidence/hardening/task-5-brittle-sweep.txt`.

  **Must NOT do**:
  - Flag semantic constants as violations (apply the one-question heuristic: "does adding/removing one of these tomorrow make the sentence a lie?" — only then is it volatile)
  - Modify files (this task observes + reports; fixes are delegated)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — requires judgment to separate volatile counts from semantic constants
  - **Skills**: `[]`

  **Parallelization**: Can run in parallel — YES (with 6a–6d, 7) · Wave 2 · Blocked by Tasks 1–4

  **References**:
  - `AGENTS.md`, all `.opencode/skills/**/SKILL.md`
  - The Documentation Durability convention added in Task 1 (the rubric to classify against)

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Zero volatile facts remain after Wave 1
    Tool: Bash + judgment
    Steps:
      1. Run the three greps above; capture all hits.
      2. Classify each hit volatile vs semantic-constant.
      3. Assert: count of VOLATILE hits == 0.
    Expected: every remaining numeric is a justified semantic constant; zero volatile facts
    Evidence: .sisyphus/evidence/hardening/task-5-brittle-sweep.txt
  ```

  **Commit**: NO (verification only)

- [x] 6a. Blind re-test — DB table + admin endpoint

  **What to do**: Re-run the original blind-discovery test. Spawn a FRESH explore agent told it is onboarding to the repo with ONLY the repo's own docs. Task: "Add a new `widgets` table and `GET /admin/tenants/:tenantId/widgets`." It must: start from AGENTS.md, identify the matching trigger row(s) with line numbers, attempt `skill()` for each, report load success/error verbatim, extract the non-obvious gotchas, cross-check every file path it names actually exists, and return: (a) skills+rows, (b) did `skill()` load, (c) top gotchas, (d) friction 1–5, (e) VERDICT YES/PARTIAL/NO. Save output to `.sisyphus/evidence/hardening/retest-6a.txt`.

  **Pass condition**: VERDICT = YES, friction ≤2 (lower is better — note the scale is "5=effortless" in the agent's own framing; require effortless/near-effortless), zero dangling file refs, and specifically confirm the prisma/data-access lanes no longer both match ambiguously.

  **Recommended Agent Profile**: `explore` (run_in_background=true) · Skills: `[]`
  **Parallelization**: Wave 2 · Blocked by Tasks 1–4 (run after Task 5 ideally, but may run concurrently)

  **References**: `AGENTS.md` trigger table; `.opencode/skills/{prisma,api-design,data-access-conventions}/SKILL.md`

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Fresh agent routes + loads + applies, no ambiguity
    Tool: task(explore) → read evidence
    Expected: VERDICT YES; prisma vs data-access no longer ambiguous; all skill() loads succeed; no broken paths
    Evidence: .sisyphus/evidence/hardening/retest-6a.txt
  ```

  **Commit**: NO

- [x] 6b. Blind re-test — Inngest lifecycle step (was PARTIAL → must become YES)

  **What to do**: Re-run the inngest blind-discovery test with a FRESH explore agent. Task: "Add a new step to the employee lifecycle that records a work metric after the Delivering state completes." Same protocol as 6a. **This test previously returned PARTIAL** because of the two `lifecycle-helpers.ts` files and the missing/contradictory function count — explicitly verify BOTH are now resolved: (1) the skill clearly disambiguates the two same-named files, and (2) the function list is complete and uncounted. Save to `.sisyphus/evidence/hardening/retest-6b.txt`.

  **Pass condition**: VERDICT = YES (not PARTIAL); the agent reports NO confusion between the two `lifecycle-helpers.ts` files and finds the complete function list; zero dangling refs.

  **Recommended Agent Profile**: `explore` (run_in_background=true) · Skills: `[]`
  **Parallelization**: Wave 2 · Blocked by Tasks 1–4

  **References**: `.opencode/skills/inngest/SKILL.md`; `src/inngest/lifecycle/steps/lifecycle-helpers.ts`; `src/inngest/lib/lifecycle-helpers.ts`; `src/gateway/inngest/serve.ts`

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Previously-PARTIAL inngest task now YES
    Tool: task(explore) → read evidence
    Expected: VERDICT YES; explicit confirmation the two lifecycle-helpers files are unambiguous; function list complete; no count contradiction
    Evidence: .sisyphus/evidence/hardening/retest-6b.txt
  ```

  **Commit**: NO

- [x] 6c. Blind re-test — dashboard filter dropdown

  **What to do**: Re-run with a FRESH explore agent. Task: "Add a status filter dropdown to the dashboard tasks page (survives refresh / shareable)." Same protocol as 6a. Save to `.sisyphus/evidence/hardening/retest-6c.txt`.

  **Pass condition**: VERDICT = YES; `react-dashboard` routes cleanly; `SearchableSelect` path resolves; no dangling refs. (This was already YES — confirm no regression from the trigger edits.)

  **Recommended Agent Profile**: `explore` (run_in_background=true) · Skills: `[]`
  **Parallelization**: Wave 2 · Blocked by Tasks 1–4

  **References**: `AGENTS.md` trigger table; `.opencode/skills/react-dashboard/SKILL.md`

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Dashboard routing still flawless post-edit
    Tool: task(explore) → read evidence
    Expected: VERDICT YES; no regression; component path resolves
    Evidence: .sisyphus/evidence/hardening/retest-6c.txt
  ```

  **Commit**: NO

- [x] 6d. Blind re-test — stuck Reviewing prod task (multi-skill routing)

  **What to do**: Re-run with a FRESH explore agent. Task: "A task in PRODUCTION is stuck in `Reviewing` and never completes — diagnose it." Same protocol as 6a; specifically verify discovery still surfaces BOTH `debugging-lifecycle` AND `production-ops` after the trigger edits, and that the merged Quick Reference commands are runnable. Save to `.sisyphus/evidence/hardening/retest-6d.txt`.

  **Pass condition**: VERDICT = YES; BOTH skills surfaced; no routing gap introduced by the de-overlap edits.

  **Recommended Agent Profile**: `explore` (run_in_background=true) · Skills: `[]`
  **Parallelization**: Wave 2 · Blocked by Tasks 1–4

  **References**: `AGENTS.md` trigger table; `.opencode/skills/{debugging-lifecycle,production-ops}/SKILL.md`

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Multi-skill routing intact post-edit
    Tool: task(explore) → read evidence
    Expected: VERDICT YES; both debugging-lifecycle and production-ops surface; commands runnable
    Evidence: .sisyphus/evidence/hardening/retest-6d.txt
  ```

  **Commit**: NO

- [x] 7. Structural re-audit of AGENTS.md routing

  **What to do**: Spawn a FRESH oracle agent to re-audit AGENTS.md after the Wave-1 edits. It must verify: (1) trigger-table lanes are now mutually exclusive (prisma/data-access/inngest), (2) the `security` trigger is appropriately narrow, (3) the Documentation Durability convention is present, coherent, and correctly carves out semantic constants, (4) NO situational-coverage GAP was introduced (every major task type still has a route — enumerate them and confirm), (5) pointer integrity 100% (all `[Moved to skill]` targets exist; worker-only skills labeled), (6) no remaining contradictions between AGENTS.md and skills. Output STRENGTHS / ISSUES (severity + file:line + one-line fix) / VERDICT (STRONG/ADEQUATE/NEEDS WORK). Save to `.sisyphus/evidence/hardening/retest-7-audit.txt`.

  **Pass condition**: VERDICT = ADEQUATE or STRONG with NO open BLOCKER/HIGH and NO trigger-table gap.

  **Recommended Agent Profile**: `oracle` (run_in_background=true) · Skills: `[]`
  **Parallelization**: Wave 2 · Blocked by Tasks 1–4

  **References**: `AGENTS.md` (full); `.opencode/skills/` (spot-read as needed)

  **Acceptance Criteria — QA Scenarios (MANDATORY)**:

  ```
  Scenario: Structural re-audit passes with no HIGH/BLOCKER and no gap
    Tool: task(oracle) → read evidence
    Expected: VERDICT ADEQUATE+; lanes exclusive; security narrowed; durability convention sound; zero coverage gaps; pointers 100%
    Evidence: .sisyphus/evidence/hardening/retest-7-audit.txt
  ```

  **Commit**: NO

> **LOOP-TO-GREEN**: If Task 5 finds volatile hits, or any of 6a–6d is not YES, or Task 7 is NEEDS WORK / has an open HIGH+ or a coverage gap → delegate the specific fix, then re-run ONLY the affected check(s). Repeat until: brittle-sweep clean, 6a–6d all YES, Task 7 ADEQUATE+. Do not proceed to commit until every check is green.

- [x] 8. Commit all changes

  **What to do**: Stage AGENTS.md + the edited skill files (and the evidence dir if desired). Commit: `docs(skills): add documentation durability convention, remove volatile counts, de-overlap triggers`. Then `git status --short` must be clean (or only intentionally-gitignored entries).

  **Recommended Agent Profile**: `quick` · Skills: `[]`
  **Parallelization**: Wave 3 · Blocked by loop-to-green
  **Acceptance Criteria**:

  ```
  Scenario: Clean commit
    Tool: Bash
    Steps: git add -A relevant paths; git commit; git status --short
    Expected: commit succeeds (pre-commit hook passes), working tree clean
    Evidence: .sisyphus/evidence/hardening/task-8-commit.txt
  ```

  **Commit**: YES (this task)

- [x] 9. Notify completion

  **What to do**: Send Telegram: `tsx scripts/telegram-notify.ts "✅ Skill system hardening complete — durability convention added, volatile counts removed, triggers de-overlapped; all blind re-tests YES. Come back to review."`

  **Recommended Agent Profile**: `quick` · Skills: `[]`
  **Parallelization**: Wave 3 · Blocked by Task 8
  **Acceptance Criteria**:

  ```
  Scenario: Telegram sent
    Tool: Bash → exit 0, "[telegram] Notification sent."
    Evidence: .sisyphus/evidence/hardening/task-9-notify.txt
  ```

  **Commit**: NO

---

## Final Verification Wave

> The Wave-2 battery (Tasks 5, 6a–6d, 7) IS the final verification. ALL must pass:
>
> - Task 5 brittle-fact sweep: zero volatile facts remain (semantic constants correctly preserved)
> - Tasks 6a–6d: every blind-discovery verdict = YES; 6b (previously PARTIAL) specifically resolved
> - Task 7: structural re-audit = ADEQUATE or STRONG, with no open HIGH/BLOCKER and no trigger gap
>
> If ANY check fails: delegate the fix, re-run that check, present updated results. Do NOT declare done until every check is green and the user has seen the consolidated result.

---

## Commit Strategy

- **Wave 1+fixes**: `docs(skills): add documentation durability convention, remove volatile counts, de-overlap triggers`
- Single squashed commit acceptable since all edits serve one objective.

## Success Criteria

### Verification Commands

```bash
# No volatile "(N)" count headings or "N active/modules/interfaces/tests" in skills or AGENTS.md
grep -rnE "\([0-9]+\)|[0-9]+ (active|repository|repositories|typed|modules|interfaces|tests|passing|skipped|stories|existing|new skills)" .opencode/skills/ AGENTS.md
# (Expect: only legitimate semantic constants — reviewer classifies)

# No file line-length claims
grep -rnE "\([0-9]+ lines\)|[0-9]+-line" .opencode/skills/ AGENTS.md   # expect empty (or justified)

# No exact line-number refs in durable docs
grep -rnE "line [0-9]{2,}|:[0-9]{2,}\b" .opencode/skills/   # expect empty

# Durability convention present
grep -c "Documentation Durability" AGENTS.md   # expect >=1

# inngest function list complete (ground truth = serve registration)
grep -c "slack-trigger-handler\|slack-input-collector" .opencode/skills/inngest/SKILL.md   # expect >=2
```

### Final Checklist

- [ ] Documentation Durability convention present with forbidden examples + allowed-constant heuristic
- [ ] Zero volatile counts in AGENTS.md and skills (semantic constants preserved)
- [ ] inngest function list complete + lifecycle-helpers disambiguated
- [ ] Trigger rows de-overlapped; security narrowed; no routing gap
- [ ] Vague pointer fixed; worker-only skills labeled
- [ ] All 4 blind re-tests = YES; structural re-audit ADEQUATE+; brittle-fact sweep clean
- [ ] Changes committed; completion Telegram sent
