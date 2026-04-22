# AGENTS.md Accuracy Update — Sync with Ground-Truth Doc

## TL;DR

> **Quick Summary**: Fix 15 discrepancies in `AGENTS.md` found by comparing against the verified ground-truth document `docs/2026-04-20-1314-current-system-state.md`. Uses a "brief inline note + reference" pattern to keep AGENTS.md lean while ensuring accuracy.
>
> **Deliverables**:
>
> - Updated `AGENTS.md` with all factual corrections and critical missing information
> - No new top-level sections, no mermaid diagrams, no section reordering
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — single file, sequential edits
> **Critical Path**: Task 1 → Task 2 → Task 3 → F1-F4

---

## Context

### Original Request

User asked to verify AGENTS.md accuracy against `docs/2026-04-20-1314-current-system-state.md` (confirmed up-to-date). Systematic comparison revealed 15 discrepancies across 3 severity levels.

### Interview Summary

**Key Discussions**:

- User chose "completeness matters most" but with a "brief note + reference pattern" — AGENTS.md stays lean, agents get a pointer to the full reference doc for details
- Pattern: inline if ≤3 lines and operationally critical; reference-only note if >5-row table or purely informational

**Research Findings**:

- AGENTS.md is 372 lines, loaded into every LLM call (token-sensitive)
- `docs/2026-04-20-1314-current-system-state.md` is already in the Reference Documents table (line 372)
- 15 discrepancies: 2 wrong/misleading, 8 critical missing, 5 useful optional

### Metis Review

**Identified Gaps** (addressed):

- Token budget rule now explicit: "inline ≤3 lines if operationally critical; reference-only for tables >5 rows"
- Admin API section: rename from "Manual Trigger (Admin API)" to "Admin API" + add route count + reference
- Deprecated Components "29 → 30" fix is allowed — "do not modify" applies to CODE, not AGENTS.md descriptions
- No new top-level sections — notes go inline in existing sections
- `FEEDBACK_CONTEXT` note must explain source (env var from lifecycle), not just say "optionally prepends"
- Shell tool CLI syntax includes `NODE_NO_WARNINGS=1` prefix (canonical usage)

---

## Work Objectives

### Core Objective

Make AGENTS.md factually accurate against the verified ground-truth, adding critical missing info using the brief-note-plus-reference pattern.

### Concrete Deliverables

- `AGENTS.md` — corrected and augmented (target ≤420 lines)

### Definition of Done

- [ ] All 15 discrepancies addressed
- [ ] No mermaid diagrams added
- [ ] No new top-level sections created
- [ ] File ≤420 lines
- [ ] All grep-based acceptance criteria pass

### Must Have

- Fix the 2 factual errors (worker lib count, delivery step clarification)
- Add terminal states (Failed, Cancelled)
- Add harness output contract, SIGTERM handler, FEEDBACK_CONTEXT
- Update Admin API section with route count and reference
- Add Slack Bolt idempotency/dedup note
- Add shell tool CLI syntax
- Add shared library highlights (call-llm.ts cost breaker, encryption.ts)

### Must NOT Have (Guardrails)

- No mermaid diagrams (token cost)
- No new top-level sections (inline notes only)
- No section reordering or restructuring
- No expansion of DB schema section beyond 1-line correction
- No replacement of Commands table with Quick Start
- No expansion of Inngest functions one-liner into full table
- No replacement of feedback pipeline prose with diagram

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: N/A (documentation update)
- **Automated tests**: None
- **Framework**: N/A

### QA Policy

Every task has grep-based acceptance criteria. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — all edit same file):
├── Task 1: Fix factual errors + add terminal states [quick]
├── Task 2: Add critical missing info to OpenCode Worker section [quick]
└── Task 3: Update Admin API, Slack Bolt, optional items, project structure [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks |
| ----- | ---------- | ------ |
| 1     | None       | 2, 3   |
| 2     | 1          | 3      |
| 3     | 2          | F1-F4  |
| F1-F4 | 3          | Done   |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix factual errors and add terminal states

  **What to do**:
  1. **Line 33** — Change `29 utilities` to `30 utilities` in the Deprecated Components table description for `src/workers/lib/`
  2. **Line 62** — After the lifecycle states string `(Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done)`, add a note about auto-pass states and terminal states. The updated text should read:
     ```
     States auto-pass where unambiguous (Triaging*, AwaitingInput*, Validating*). Terminal states: `Failed` (machine poll timeout or unhandled error), `Cancelled` (reject action or 24h approval timeout).
     ```
  3. **Line 73** (approval gate bullet) — After the sentence about short-circuiting, add: `For the approval-required path, the lifecycle posts the approved summary directly to the publish channel — no separate delivery machine is spawned.`

  **Must NOT do**:
  - Do not add mermaid state diagrams
  - Do not restructure the lifecycle section
  - Do not expand into a full state machine description

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Three small, targeted text edits in one file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential with Tasks 2, 3)
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `AGENTS.md:33` — Deprecated Components table, `src/workers/lib/` row
  - `AGENTS.md:62` — Lifecycle states string
  - `AGENTS.md:73` — Approval gate bullet

  **Ground-Truth References**:
  - `docs/2026-04-20-1314-current-system-state.md:96-128` — Full lifecycle states with terminal states, auto-pass markers, approval gate
  - `docs/2026-04-20-1314-current-system-state.md:87` — "no delivery machine spawned" clarification
  - `docs/2026-04-20-1314-current-system-state.md:529` — "30 files" for worker utilities

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Wrong number fixed
    Tool: Bash (grep)
    Steps:
      1. Run: grep "29 utilities" AGENTS.md
      2. Assert: no matches (exit code 1)
      3. Run: grep "30 " AGENTS.md | grep "workers/lib"
      4. Assert: ≥1 match
    Expected Result: "29 utilities" gone, "30" present near workers/lib reference
    Evidence: .sisyphus/evidence/task-1-wrong-number-fixed.txt

  Scenario: Terminal states present
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "Failed\|Cancelled" AGENTS.md | grep -iv "pre-existing\|test"
      2. Assert: ≥2 matches (one for Failed, one for Cancelled in lifecycle context)
    Expected Result: Both terminal states documented in lifecycle section
    Evidence: .sisyphus/evidence/task-1-terminal-states.txt

  Scenario: Delivery clarification present
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "no.*delivery machine\|posts.*directly.*publish" AGENTS.md
      2. Assert: ≥1 match
    Expected Result: Clarification that no separate machine is spawned for delivery
    Evidence: .sisyphus/evidence/task-1-delivery-clarification.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `docs: sync AGENTS.md with verified ground-truth system state doc`
  - Files: `AGENTS.md`

---

- [x] 2. Add critical missing info to OpenCode Worker section

  **What to do**:
  Add the following bullets to the **OpenCode Worker (All Employees)** section (after the existing bullets, before `**Cron timezone**`):
  1. **Harness output contract** — add bullet:

     ```
     - **Output contract**: OpenCode writes `/tmp/summary.txt` (deliverable content) and `/tmp/approval-message.json` (Slack message metadata). Absence of BOTH is a hard failure; either file alone is sufficient to proceed. See current-system-state.md for the full 15-step harness flow.
     ```

  2. **SIGTERM handler** — add bullet:

     ```
     - **SIGTERM handling**: Harness registers a `SIGTERM` handler that PATCHes the task to `Failed` on termination — explains why tasks show as Failed after machine preemption.
     ```

  3. **FEEDBACK_CONTEXT** — add bullet:

     ```
     - **Feedback context**: Harness optionally prepends `FEEDBACK_CONTEXT` (env var injected by the lifecycle from stored feedback) to the system prompt, allowing historical feedback to influence future runs.
     ```

  4. **Shell tool CLI syntax** — update the existing `Shell tools` bullet to include usage examples:
     ```
     - **Shell tools**: `src/worker-tools/slack/` — pre-installed in Docker image at `/tools/slack/`. Usage:
       - `NODE_NO_WARNINGS=1 node /tools/slack/post-message.js --channel "C123" --text "msg" --task-id "uuid" > /tmp/approval-message.json`
       - `node /tools/slack/read-channels.js --channels "C123,C456" --lookback-hours 24`
     ```

  **Must NOT do**:
  - Do not add the full 15-step harness sequence diagram
  - Do not create a new "Harness" top-level section
  - Do not duplicate the full shell tool table from current-system-state.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding bullets to one section of one file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `AGENTS.md:59-77` — OpenCode Worker section (existing bullets to augment)

  **Ground-Truth References**:
  - `docs/2026-04-20-1314-current-system-state.md:143-196` — Full harness execution flow, output contract, shell tools table
  - `docs/2026-04-20-1314-current-system-state.md:174` — SIGTERM handler
  - `docs/2026-04-20-1314-current-system-state.md:177` — FEEDBACK_CONTEXT prepend

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Output contract documented
    Tool: Bash (grep)
    Steps:
      1. Run: grep "summary.txt" AGENTS.md
      2. Assert: ≥1 match
      3. Run: grep "approval-message.json" AGENTS.md
      4. Assert: ≥1 match
    Expected Result: Both output files mentioned in OpenCode Worker section
    Evidence: .sisyphus/evidence/task-2-output-contract.txt

  Scenario: SIGTERM documented
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "SIGTERM" AGENTS.md
      2. Assert: ≥1 match
    Expected Result: SIGTERM handler behavior documented
    Evidence: .sisyphus/evidence/task-2-sigterm.txt

  Scenario: FEEDBACK_CONTEXT documented
    Tool: Bash (grep)
    Steps:
      1. Run: grep "FEEDBACK_CONTEXT" AGENTS.md
      2. Assert: ≥1 match
    Expected Result: FEEDBACK_CONTEXT env var mentioned with explanation
    Evidence: .sisyphus/evidence/task-2-feedback-context.txt

  Scenario: Shell tool CLI syntax present
    Tool: Bash (grep)
    Steps:
      1. Run: grep "NODE_NO_WARNINGS" AGENTS.md
      2. Assert: ≥1 match
      3. Run: grep "read-channels.js" AGENTS.md
      4. Assert: ≥1 match
    Expected Result: Both shell tool commands documented with flags
    Evidence: .sisyphus/evidence/task-2-shell-tools.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `docs: sync AGENTS.md with verified ground-truth system state doc`
  - Files: `AGENTS.md`

---

- [x] 3. Update Admin API, Slack Bolt, optional items, and project structure

  **What to do**:
  1. **Rename Admin API section** (line 200) — Change heading from `## Manual Trigger (Admin API)` to `## Admin API`. Keep the existing 2 endpoints (trigger + task status) as the "commonly used" examples, then add a note:

     ```
     The admin API has 16 total routes covering tenant CRUD (create, list, get, update, soft-delete, restore), per-tenant secrets management (list keys, set, delete), tenant config (get, deep-merge update), project CRUD, employee trigger, and task status. Full route table: `docs/2026-04-20-1314-current-system-state.md` § Gateway and Routes.
     ```

  2. **Add Slack Bolt idempotency** — In the "Slack Interactive Buttons — Socket Mode" section (around line 120, after the debugging list), add a bullet:

     ```
     - **Idempotency**: Before firing `employee/approval.received`, handlers check task status === `'Reviewing'` via PostgREST. If already processed, updates the Slack message to "already processed" instead. Events are deduped by Inngest ID `employee-approval-{taskId}`.
     ```

  3. **Add shared libraries note** — In the Project Structure section (line 267), update the `src/lib/` line to:

     ```
     └── lib/          # Shared (12 files): fly-client, github-client, slack-client, jira-client, call-llm (model enforcement + $50/day cost circuit breaker), encryption (AES-256-GCM for tenant secrets), logger, retry, errors, tunnel-client, repo-url, agent-version
     ```

  4. **Update prisma description** — In the Project Structure section (line 268), update:

     ```
     prisma/           # Schema (19 models), 18 migrations, seed
     ```

  5. **Add archetype shared config note** — In the "Summarizer — Per-Tenant Channel Configuration" section (around line 182, after the VLRE subsection), add:

     ```
     Both archetypes share the same Papi Chulo system prompt (dramatic Spanish TV news correspondent persona), model (`minimax/minimax-m2.7`), runtime (`opencode`), and risk model (`approval_required: true`, `timeout_hours: 24`).
     ```

  6. **Update Reference Documents table description** — Update the description for `docs/2026-04-20-1314-current-system-state.md` (line 372) to be more prominent:
     ```
     Verified ground-truth snapshot: full lifecycle, harness flow (15 steps), all gateway routes (16 admin + webhooks + OAuth), DB schema (19 models), shell tool CLI syntax, Docker services, shared libraries
     ```

  **Must NOT do**:
  - Do not inline the full 16-route admin API table (too many tokens)
  - Do not add new top-level sections
  - Do not expand the database section
  - Do not add Inngest functions full table
  - Do not exceed 420 total lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Multiple small edits across sections of one file, all straightforward text changes
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `AGENTS.md:200-215` — Admin API section (rename + augment)
  - `AGENTS.md:98-120` — Slack Interactive Buttons section (add idempotency)
  - `AGENTS.md:260-272` — Project Structure section (update lib + prisma)
  - `AGENTS.md:177-198` — Per-Tenant Channel Configuration section (add shared config note)
  - `AGENTS.md:362-372` — Reference Documents table (update description)

  **Ground-Truth References**:
  - `docs/2026-04-20-1314-current-system-state.md:276-331` — Full gateway routes and Slack Bolt handlers
  - `docs/2026-04-20-1314-current-system-state.md:475-491` — Shared libraries table
  - `docs/2026-04-20-1314-current-system-state.md:357` — "19 models across 4 groups. 18 migrations total"
  - `docs/2026-04-20-1314-current-system-state.md:347-352` — Both archetypes share same config

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Admin route count noted
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "16.*route\|16.*total" AGENTS.md
      2. Assert: ≥1 match
    Expected Result: Admin API section notes 16 total routes
    Evidence: .sisyphus/evidence/task-3-admin-routes.txt

  Scenario: Slack Bolt idempotency documented
    Tool: Bash (grep)
    Steps:
      1. Run: grep -i "idempoten\|already processed\|dedup" AGENTS.md
      2. Assert: ≥1 match
    Expected Result: Idempotency behavior documented in Socket Mode section
    Evidence: .sisyphus/evidence/task-3-bolt-idempotency.txt

  Scenario: Shared libraries highlighted
    Tool: Bash (grep)
    Steps:
      1. Run: grep "call-llm" AGENTS.md
      2. Assert: ≥1 match
      3. Run: grep "encryption" AGENTS.md | grep -i "AES\|tenant"
      4. Assert: ≥1 match
    Expected Result: call-llm and encryption mentioned in project structure
    Evidence: .sisyphus/evidence/task-3-shared-libs.txt

  Scenario: Line count within budget
    Tool: Bash (wc)
    Steps:
      1. Run: wc -l AGENTS.md
      2. Assert: ≤420
    Expected Result: File stays within token budget constraint
    Evidence: .sisyphus/evidence/task-3-line-count.txt

  Scenario: No mermaid added
    Tool: Bash (grep)
    Steps:
      1. Run: grep "mermaid" AGENTS.md
      2. Assert: 0 matches (exit code 1)
    Expected Result: No diagrams added to AGENTS.md
    Evidence: .sisyphus/evidence/task-3-no-mermaid.txt

  Scenario: Reference doc entry preserved and updated
    Tool: Bash (grep)
    Steps:
      1. Run: grep "2026-04-20-1314-current-system-state" AGENTS.md
      2. Assert: ≥1 match
    Expected Result: Reference doc still in table with updated description
    Evidence: .sisyphus/evidence/task-3-reference-doc.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `docs: sync AGENTS.md with verified ground-truth system state doc`
  - Files: `AGENTS.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify the edit exists in AGENTS.md (grep for key phrases). For each "Must NOT Have": search for forbidden patterns (mermaid, new sections). Check that all 15 discrepancies were addressed.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `wc -l AGENTS.md` (must be ≤420). Check markdown formatting: no broken links, no orphaned bullets, no double blank lines. Verify all `(see docs/2026-04-20-1314-current-system-state.md)` references are consistent.
      Output: `Line Count [PASS/FAIL] | Formatting [PASS/FAIL] | References [N consistent] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Read AGENTS.md top-to-bottom. Execute every grep-based acceptance criterion from all 3 tasks. Save each grep output to `.sisyphus/evidence/final-qa/`.
      Output: `Grep Checks [N/N pass] | Readability [OK/Issues] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Run `git diff AGENTS.md`. Verify: only the 15 planned edits were made (no extra changes). Check that no existing correct content was accidentally removed. Verify file structure (sections, headings) unchanged except the Admin API rename.
      Output: `Planned Edits [N/N] | Unplanned Changes [CLEAN/N issues] | Content Preservation [OK/Issues] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                     | Files       | Pre-commit               |
| ---- | ------------------------------------------------------------------ | ----------- | ------------------------ |
| 1    | `docs: sync AGENTS.md with verified ground-truth system state doc` | `AGENTS.md` | `wc -l AGENTS.md` (≤420) |

---

## Success Criteria

### Verification Commands

```bash
# AC1: Wrong number fixed
grep "29 utilities" AGENTS.md  # Expected: no matches
grep "30 " AGENTS.md | grep "workers/lib"  # Expected: match

# AC2: Terminal states present
grep -i "Failed\|Cancelled" AGENTS.md | grep -iv "pre-existing\|test"  # Expected: ≥2 matches

# AC3: Output contract present
grep "summary.txt" AGENTS.md  # Expected: match
grep "approval-message.json" AGENTS.md  # Expected: match

# AC4: SIGTERM mentioned
grep -i "SIGTERM" AGENTS.md  # Expected: match

# AC5: FEEDBACK_CONTEXT mentioned
grep "FEEDBACK_CONTEXT" AGENTS.md  # Expected: match

# AC6: Admin route count noted
grep -i "16.*route\|16.*endpoint" AGENTS.md  # Expected: match

# AC7: Slack Bolt idempotency
grep -i "idempoten\|dedup\|already processed" AGENTS.md  # Expected: match

# AC8: Shell tool CLI syntax
grep "NODE_NO_WARNINGS" AGENTS.md  # Expected: match
grep "read-channels.js" AGENTS.md  # Expected: match

# AC9: No mermaid added
grep "mermaid" AGENTS.md  # Expected: no matches

# AC10: Line count
wc -l AGENTS.md  # Expected: ≤420

# AC11: Reference doc preserved
grep "2026-04-20-1314-current-system-state" AGENTS.md  # Expected: match

# AC12: Shared libs mentioned
grep "call-llm\|encryption.ts" AGENTS.md  # Expected: match
```

### Final Checklist

- [ ] All 15 discrepancies addressed
- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] Line count ≤420
- [ ] All 12 verification commands pass
