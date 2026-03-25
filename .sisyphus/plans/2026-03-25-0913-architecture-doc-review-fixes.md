# Architecture Document Review Fixes — AI Employee Platform

## TL;DR

> **Quick Summary**: Apply 22 verified findings from a deep architecture review to `docs/2026-03-22-2317-ai-employee-architecture.md`. Fixes 4 critical factual errors, 8 high-severity gaps, 8 medium improvements, and 5 low-severity items. All changes are surgical documentation edits to one markdown file — no code, no new files.
> 
> **Deliverables**:
> - Updated architecture document with all findings applied
> - All Mermaid diagrams syntactically valid
> - All pseudo-code corrections verified via grep
> - All cost estimates recalculated for correct machine spec
> 
> **Estimated Effort**: Medium (single file, 2836 lines, 12 sequential tasks)
> **Parallel Execution**: NO — all tasks edit the same file, must be sequential
> **Critical Path**: Task 1 → Task 2 → ... → Task 12 → F1-F4

---

## Context

### Original Request
Review the AI Employee Platform architecture document for gaps, inaccuracies, and improvement opportunities. Then update the document with the agreed-upon decisions.

### Interview Summary
**Key Discussions**:
- 4 parallel research agents (Inngest, Fly.io, OpenCode SDK, Prisma+pgvector) validated claims against official docs
- 22 findings identified across 4 severity levels (4 critical, 8 high, 8 medium, 5 low)
- User interviewed on 16 decision points across 4 structured question rounds
- All decisions locked — no open questions remain

**Research Findings**:
- **Inngest**: 6/7 claims verified. Issue #1433 "fix" claim is FALSE — closed as "not_planned", race condition persists. waitForEvent if-clause needs single quotes for string values.
- **Fly.io**: 5/7 verified. performance-2x = 4GB RAM (not 8GB). DinD fuse-overlayfs has known issues but user confirmed it works in nexus-stack.
- **OpenCode SDK**: All claims verified. v1.3.2 stable. No automatic crash recovery.
- **Prisma+pgvector**: Raw SQL migrations pattern correct. Critical gotcha: Supavisor (port 6543) breaks Prisma migrations. Prisma Next will add pgvector support mid-2026.

### Metis Review
**Identified Gaps** (addressed):
- C3+H4 interact on the same TypeScript code block (lines ~1102-1241). Merged into one task.
- H1 has 9 occurrences of "Received" status in Event Gateway context — not just the sequence diagram.
- C4 quoting fix applies to all `step.waitForEvent` calls with string interpolation, not just line 1151.
- AUDIT_LOG table schema is defined in §25 (line 2534): timestamp, agent_version_id, task_id, api_endpoint, http_method, response_status.
- C2 RAM correction ripples into §17 cost tables — multiple cost estimates need updating.
- H3 Provisioning removal orphans a prose note at line 373 — must also remove.
- Concurrency syntax: Inngest current examples use array form. Doc uses object form. Update to array.
- 8 guardrails defined: no adjacent improvements, preserve code formatting, validate Mermaid, surgical edits only, re-read before each edit, no new sections, grouped commits, don't touch §28.

---

## Work Objectives

### Core Objective
Apply 22 verified findings to the architecture document, correcting factual errors, closing architecture gaps, and adding documented improvements — while preserving the document's existing quality and structure.

### Concrete Deliverables
- Updated `docs/2026-03-22-2317-ai-employee-architecture.md` with all changes applied

### Definition of Done
- [ ] All 12 acceptance criteria grep checks pass (see Verification Strategy)
- [ ] Final line count is between 2836 and 2960
- [ ] All Mermaid fence pairs are balanced and syntactically valid
- [ ] Zero occurrences of "8 GB RAM" or "8GB RAM" associated with performance-2x
- [ ] Zero occurrences of "Now Fixed" for issue #1433

### Must Have
- All 22 findings applied as decided in the interview
- Inngest #1433 race condition reframed as known/unresolved with Supabase-first as primary defense
- performance-2x corrected to 4GB RAM with cost estimates recalculated
- Re-dispatch pseudo-code simplified (no duplicate machine creation)
- waitForEvent if-clause quoting fixed with single quotes
- Missing ER diagram columns and audit_log table added
- Event Gateway MVP status set to Ready (not Received)
- Supabase pooling gotcha documented in §15, §27, §27.5

### Must NOT Have (Guardrails)
- NO "while I'm here" adjacent improvements — only the 22 specified changes
- NO prose rewrites beyond the targeted sentences
- NO new `##` or `###` section headers
- NO changes to §28 (Deferred Capabilities) unless explicitly specified
- NO reformatting of code blocks — preserve existing indentation exactly
- NO edits to lines not specifically targeted by a finding

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (documentation edits)
- **Automated tests**: None (markdown file)
- **Framework**: N/A

### QA Policy
Every task includes grep-based verification commands. Evidence saved to `.sisyphus/evidence/`.

- **Documentation edits**: Use Bash (grep) — search for target strings, verify presence/absence
- **Mermaid diagrams**: Use Bash (wc, grep) — validate fence pairs, check for common syntax errors

---

## Execution Strategy

### Sequential Execution (Single File Constraint)

> All 12 tasks edit the same 2836-line markdown file. They MUST run sequentially.
> After each edit, line numbers shift — each task must re-read the target section before editing.
> Order front-loads high-risk code block edits, defers the large ER diagram edit until simpler edits stabilize.

```
Task 1:  C4 — waitForEvent quoting fix (isolated, low risk) [quick]
Task 2:  C3+H4 — redispatch + cancellation guard (same code block) [deep]
Task 3:  H3 — remove Provisioning from state machine [quick]
Task 4:  H1 — Event Gateway sets Ready directly (MVP scope) [quick]
Task 5:  C1 — reframe Inngest #1433 race condition [quick]
Task 6:  C2 — correct performance-2x to 4GB + cost updates [unspecified-high]
Task 7:  H2 — add missing columns/tables to ER diagram [deep]
Task 8:  H5+H6+concurrency — risk table + pooling gotcha + syntax [quick]
Task 9:  M1 — cost circuit breaker caching [quick]
Task 10: M2-M4 — watchdog gap, Supabase retries, PrismaClient [quick]
Task 11: M5-M8 — volume timing, Inngest Connect, Zod, seq diagram [quick]
Task 12: L1-L5 — low-severity items batch [quick]

FINAL: F1-F4 — 4 parallel verification agents
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2 | 1 |
| 2 | 1 | 3 | 2 |
| 3 | 2 | 4 | 3 |
| 4 | 3 | 5 | 4 |
| 5 | 4 | 6 | 5 |
| 6 | 5 | 7 | 6 |
| 7 | 6 | 8 | 7 |
| 8 | 7 | 9 | 8 |
| 9 | 8 | 10 | 9 |
| 10 | 9 | 11 | 10 |
| 11 | 10 | 12 | 11 |
| 12 | 11 | F1-F4 | 12 |
| F1-F4 | 12 | — | FINAL |

### Agent Dispatch Summary

- **Waves 1-12**: 12 sequential tasks — T1,T3-T5,T8-T12 → `quick`, T2 → `deep`, T6 → `unspecified-high`, T7 → `deep`
- **FINAL**: 4 parallel — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. C4 — Fix waitForEvent if-clause quoting

  **What to do**:
  - Find ALL `step.waitForEvent` calls in the pseudo-code that use string interpolation in the `if` clause
  - The current pattern is `if: \`async.data.taskId == "${taskId}"\`` — UUID strings need single quotes
  - Change to: `if: \`async.data.taskId == '${taskId}'\``
  - Check line ~1151 (main lifecycle waitForEvent) — this is the primary fix
  - Also check lines ~953, ~959, ~989, ~993 — these are Mermaid diagram node labels and prose references to waitForEvent. Only fix actual TypeScript code, NOT Mermaid labels or prose descriptions
  - The Mermaid diagram labels (lines 953, 959) show `step.waitForEvent` as node text — do NOT edit these
  - Prose at lines 989, 993 describes the pattern in English — do NOT edit these unless they show actual if-clause syntax

  **Must NOT do**:
  - Do not edit Mermaid diagram node labels
  - Do not reformat surrounding code
  - Do not change the timeout values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 1)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1148-1152` — Main lifecycle waitForEvent call with if-clause
  - Inngest GitHub issue #2030 — Documents the quoting requirement for string values in if expressions
  - Inngest validation report in `.sisyphus/drafts/2026-03-25-0913-architecture-review.md` — Section on C4

  **Acceptance Criteria**:
  - [ ] All `async.data.taskId ==` patterns in TypeScript code blocks use single-quoted strings

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: All waitForEvent if-clauses use single quotes
    Tool: Bash (grep)
    Preconditions: File exists at docs/2026-03-22-2317-ai-employee-architecture.md
    Steps:
      1. grep "async.data.taskId ==" docs/2026-03-22-2317-ai-employee-architecture.md
      2. For each match, verify it contains single quotes around the interpolated value
      3. grep "async.data.taskId ==" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "'" | wc -l
    Expected Result: 0 lines without single quotes
    Evidence: .sisyphus/evidence/task-1-waitforevent-quoting.txt

  Scenario: No unintended edits to Mermaid labels
    Tool: Bash (grep)
    Preconditions: File exists
    Steps:
      1. grep -n "step.waitForEvent" docs/2026-03-22-2317-ai-employee-architecture.md | head -20
      2. Verify Mermaid node labels at lines ~953, ~959 are unchanged
    Expected Result: Mermaid labels still contain the original text without quoting changes
    Evidence: .sisyphus/evidence/task-1-mermaid-unchanged.txt
  ```

  **Commit**: YES
  - Message: `docs: C4 fix waitForEvent if-clause quoting to use single quotes for strings`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 2. C3+H4 — Simplify redispatch to event-only and add cancellation guard

  **What to do**:
  - **C3 (redispatch simplification)**: In `engineeringTaskRedispatch` function (starts ~line 1209):
    - Remove the `step.run("redispatch-machine", ...)` block that calls `flyApi.createMachine()`
    - Remove the associated Fly.io rate-limit comment below it
    - Keep the `step.sendEvent("restart-lifecycle", ...)` call — this is now the ONLY thing redispatch does
    - The resulting function body: one step that sends `engineering/task.received` event
  - **H4 (cancellation guard)**: In `engineeringTaskLifecycle` function, AFTER step 1 (update-status-executing) and BEFORE step 2 (dispatch-fly-machine):
    - Add a new step that reads `tasks.status` from Supabase
    - If status is `Cancelled`, return early with a log message
    - Use this pattern:
    ```typescript
    // Step 1.5: Check for cancellation before provisioning (§4.2 guarantee)
    const isCancelled = await step.run("check-cancellation", async () => {
      const { data } = await supabase.from("tasks")
        .select("status")
        .eq("id", taskId)
        .single();
      return data?.status === "Cancelled";
    });
    if (isCancelled) return; // Task cancelled — skip machine dispatch
    ```

  **Must NOT do**:
  - Do not restructure the main lifecycle function beyond adding the cancellation check
  - Do not change the finalize step logic
  - Do not change the event name or data shape in step.sendEvent

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`
    - Reason: Editing TypeScript pseudo-code requires careful attention to surrounding context and memoization semantics

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1102-1241` — Full lifecycle pseudo-code block
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1209-1240` — engineeringTaskRedispatch function to simplify
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1114-1137` — Steps 1-2 where cancellation guard goes between
  - `docs/2026-03-22-2317-ai-employee-architecture.md:356-376` — §4.2 cancellation guarantee that H4 implements

  **Acceptance Criteria**:
  - [ ] Redispatch function has no `flyApi.createMachine` call
  - [ ] Cancellation guard exists between status update and machine dispatch
  - [ ] Main lifecycle function still has exactly 1 `flyApi.createMachine` call

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Redispatch has no machine creation
    Tool: Bash (grep)
    Steps:
      1. Extract the redispatch function block from the document
      2. grep -A 30 "engineeringTaskRedispatch" docs/2026-03-22-2317-ai-employee-architecture.md | grep "createMachine"
    Expected Result: 0 matches — redispatch does not create machines
    Evidence: .sisyphus/evidence/task-2-redispatch-no-machine.txt

  Scenario: Exactly 1 createMachine call total
    Tool: Bash (grep)
    Steps:
      1. grep -c "flyApi.createMachine\|createMachine" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: Exactly 1 match (in main lifecycle function)
    Evidence: .sisyphus/evidence/task-2-single-createmachine.txt

  Scenario: Cancellation guard present before dispatch
    Tool: Bash (grep)
    Steps:
      1. grep -n "check-cancellation\|isCancelled\|Cancelled" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: ≥1 match in lifecycle function area (lines ~1110-1140)
    Evidence: .sisyphus/evidence/task-2-cancellation-guard.txt
  ```

  **Commit**: YES
  - Message: `docs: C3+H4 simplify redispatch to event-only and add cancellation guard`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 3. H3 — Remove Provisioning state from universal state machine

  **What to do**:
  - In the `stateDiagram-v2` block (~lines 322-352):
    - Remove line `Ready --> Provisioning: 7. Execution slot available`
    - Remove line `Provisioning --> Executing: 8. Runtime environment ready`
    - Remove line `Provisioning --> Cancelled: Task cancelled`
    - Add line: `Ready --> Executing: 7. Execution slot available + runtime ready`
    - Renumber subsequent transitions (what was 9 becomes 8, etc.)
  - In the prose walkthrough (~lines 354-376):
    - Remove or merge the step 7 ("Execution slot available") and step 8 ("Runtime environment ready") descriptions into one step
    - Update: "7. **Execution slot available + runtime ready** — The Concurrency Scheduler confirms a slot is open and the execution environment is provisioned. Task moves to `Executing`."
  - Remove the `> **Note on Provisioning**` blockquote at ~line 373 — it's orphaned without the Provisioning state
  - In §9.2 (~line 899): The "Provisioning strategy" label may reference Provisioning state — update to just describe the machine boot strategy without implying a state machine state

  **Must NOT do**:
  - Do not change other state transitions (Cancelled paths, etc.)
  - Do not rewrite unrelated prose in the walkthrough

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:322-352` — stateDiagram-v2 block
  - `docs/2026-03-22-2317-ai-employee-architecture.md:354-376` — Prose walkthrough of transitions
  - `docs/2026-03-22-2317-ai-employee-architecture.md:373` — Note on Provisioning blockquote to remove
  - `docs/2026-03-22-2317-ai-employee-architecture.md:899` — "Provisioning strategy" label

  **Acceptance Criteria**:
  - [ ] Zero occurrences of `Provisioning` in the stateDiagram block
  - [ ] Note on Provisioning blockquote removed
  - [ ] Prose walkthrough merged into a single step 7

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: No Provisioning in state machine diagram
    Tool: Bash (grep)
    Steps:
      1. Extract the stateDiagram block
      2. grep "Provisioning" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 0 matches in stateDiagram lines; removed from prose walkthrough and note
    Evidence: .sisyphus/evidence/task-3-no-provisioning.txt

  Scenario: State machine still valid (Ready → Executing path exists)
    Tool: Bash (grep)
    Steps:
      1. grep "Ready.*Executing\|Ready --> Executing" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: ≥1 match showing direct Ready → Executing transition
    Evidence: .sisyphus/evidence/task-3-ready-executing.txt
  ```

  **Commit**: YES
  - Message: `docs: H3 remove Provisioning state from universal state machine`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 4. H1 — Set MVP Event Gateway status to Ready instead of Received

  **What to do**:
  - This change applies ONLY to the MVP scope. The full architecture (when triage is added) will use `Received` again.
  - Update the following locations to say `Ready` instead of `Received` for the MVP Event Gateway behavior:
    - **§8 MVP Scope callout** (~line 647): Change "write `Received` status" to "write `Ready` status (MVP bypasses triage; when triage is added in M2, this reverts to `Received`)"
    - **§8 Event handling table** (~line 748): Change "`Received` status" to "`Ready` status" in the MVP column
    - **§11 Sequence diagram** (~line 1300): Change `Gateway->>Supabase: 4. Record task (status: Received)` to `(status: Ready)`
    - **§11 Sequence diagram walkthrough** (~line 1333): Update step 4 prose
    - **§27.5 Local test flow** (~line 2809): Change `Received → Executing` to `Ready → Executing`
  - Do NOT change these references (they describe the full architecture or recovery scripts):
    - Line 649 (idempotency explanation — keep "Received" as it describes the concept)
    - Line 1727 (optimistic locking examples — keep `Received → Executing` as a valid transition)
    - Line 2642 (dispatch-task.ts recovery — keep `--status received` as the CLI flag)
    - Line 2832 (dispatch-task.ts note — keep as-is)
  - Add a callout note near the changed locations: `> **MVP Note**: The Event Gateway sets status to \`Ready\` directly, bypassing triage. When the triage agent is added (M2), the Gateway will set \`Received\` and triage will transition to \`Ready\`.`

  **Must NOT do**:
  - Do not change recovery script references to `--status received`
  - Do not change optimistic locking examples
  - Do not change the full-architecture descriptions (only MVP-scoped ones)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:647` — §8 MVP Scope callout
  - `docs/2026-03-22-2317-ai-employee-architecture.md:748` — Event handling table
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1300` — Sequence diagram
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1333` — Sequence diagram walkthrough
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2809` — Local test flow

  **Acceptance Criteria**:
  - [ ] MVP Event Gateway references use `Ready` status
  - [ ] Full-architecture references still use `Received`
  - [ ] MVP Note callout added

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: MVP Gateway references use Ready
    Tool: Bash (grep)
    Steps:
      1. grep -n "Record task.*status" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify sequence diagram shows (status: Ready)
    Expected Result: Sequence diagram line shows Ready, not Received
    Evidence: .sisyphus/evidence/task-4-gateway-ready.txt

  Scenario: Recovery scripts still reference Received
    Tool: Bash (grep)
    Steps:
      1. grep "dispatch-task.ts\|--status received" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: Recovery script references unchanged (still say "received")
    Evidence: .sisyphus/evidence/task-4-recovery-unchanged.txt
  ```

  **Commit**: YES
  - Message: `docs: H1 set MVP Event Gateway status to Ready instead of Received`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 5. C1 — Reframe Inngest #1433 race condition as unresolved

  **What to do**:
  - Find the blockquote at ~line 1270 starting with `> **Previously Known Issue (Now Fixed)`
  - Rewrite this blockquote to:
    ```
    > **Known Issue (Unresolved) — `step.waitForEvent()` Race Condition**: Inngest issue #1433 describes a race condition where events sent before `step.waitForEvent()` starts listening are silently missed. This issue was closed as "not planned" and **remains unresolved** as of March 2026. **Primary mitigation (mandatory)**: All systems that send events consumed by `step.waitForEvent()` must write their state to Supabase FIRST. Before calling `step.waitForEvent()`, the lifecycle function checks Supabase for an existing completion/action. If found, it skips the wait and proceeds immediately. This applies to: execution completion events (machine writes to Supabase before sending event), Slack approval actions (Gateway writes to Supabase before sending event), and CI completion. This mitigation is required for ALL `step.waitForEvent()` calls — not optional defense-in-depth.
    ```
  - Key changes from original:
    - "Now Fixed" → "Unresolved"
    - "fixed in Inngest v1.17.2" → "closed as not planned, remains unresolved"
    - "retained as defense-in-depth but is no longer required" → "required, mandatory"
    - Remove the "This mitigation must be implemented when building the review agent in M4 — it does not affect MVP" — it DOES affect MVP (execution completion event)

  **Must NOT do**:
  - Do not edit surrounding paragraphs (the orchestrator description above or the §11 header below)
  - Do not add a new section header

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1270` — The blockquote to rewrite
  - Inngest validation report — Issue #1433 closed as "not_planned"
  - `.sisyphus/drafts/2026-03-25-0913-architecture-review.md` — C1 decision record

  **Acceptance Criteria**:
  - [ ] No "Now Fixed" or "no longer required" language
  - [ ] Supabase-first described as "mandatory" not "defense-in-depth"

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: No "Now Fixed" language remains
    Tool: Bash (grep)
    Steps:
      1. grep -c "Now Fixed\|no longer required\|#1433.*fixed\|fixed in Inngest" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-5-no-now-fixed.txt

  Scenario: Supabase-first is described as mandatory
    Tool: Bash (grep)
    Steps:
      1. grep -A 5 "Known Issue.*Unresolved" docs/2026-03-22-2317-ai-employee-architecture.md | grep -i "mandatory\|required\|must"
    Expected Result: ≥1 match confirming mandatory language
    Evidence: .sisyphus/evidence/task-5-mandatory-mitigation.txt
  ```

  **Commit**: YES
  - Message: `docs: C1 reframe Inngest 1433 race condition as unresolved with Supabase-first defense`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 6. C2 — Correct performance-2x to 4GB RAM and recalculate cost estimates

  **What to do**:
  - Fix all references to `performance-2x` machine spec from 8GB to 4GB:
    - **Line ~504** (§7): Change "8 GB RAM" to "4 GB RAM"
    - **Line ~586** (§7.3): Change "(2 shared CPU, 8GB RAM)" to "(2 shared CPU, 4GB RAM)" AND recalculate cost: $0.05/GB-hour × 4GB = $0.20/hour. For 20-60 min tasks: ~$0.07-$0.20. Update the `$0.50-$2.00` range to approximately `$0.15-$0.50` (including storage overhead)
    - **Line ~899** (§9.2): Change "8GB RAM" to "4GB RAM"
  - Update derived cost references in §17 and elsewhere. Locations to check:
    - **Line ~1004**: "$0.50–$2.00 additional per task" — recalculate
    - **Line ~1263**: "each machine costs roughly $0.50-$2.00 per task" — recalculate
    - **Line ~1809** (§15 table): "~$0.50-$2.00/task" — recalculate
    - **Line ~2031** (§17 cost table): "~$0.50-$2.00" for Fly.io machine — recalculate
    - **Line ~2036** (§17 With Claude Max): "~$0.50-$2.40" — recalculate
  - Look up current Fly.io pricing for `performance-2x` (4GB) to ensure the per-GB-hour rate is still $0.05. Adjust all numbers accordingly.
  - Add a note after the cost line: "Cost based on Fly.io `performance-2x` pricing as of March 2026. Verify current pricing at fly.io/docs/about/pricing."

  **Must NOT do**:
  - Do not change the machine tier (keep performance-2x)
  - Do not change other cost components (LLM costs, Supabase costs)
  - Do not restructure the cost tables

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
    - Reason: Requires looking up current pricing and recalculating multiple derived values consistently

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:504` — §7 execution environment
  - `docs/2026-03-22-2317-ai-employee-architecture.md:586` — §7.3 cost line
  - `docs/2026-03-22-2317-ai-employee-architecture.md:899` — §9.2 provisioning strategy
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2030-2036` — §17 cost tables
  - Fly.io pricing: https://fly.io/docs/about/pricing/
  - Fly.io machine sizing: https://fly.io/docs/machines/guides-examples/machine-sizing/

  **Acceptance Criteria**:
  - [ ] Zero occurrences of "8 GB RAM" or "8GB RAM" in the document
  - [ ] All cost estimates consistent with 4GB spec
  - [ ] Pricing note added

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: No 8GB references for performance-2x
    Tool: Bash (grep)
    Steps:
      1. grep -n "8.GB\|8 GB" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-6-no-8gb.txt

  Scenario: 4GB references present
    Tool: Bash (grep)
    Steps:
      1. grep -n "4.GB\|4 GB" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: ≥3 matches (§7, §7.3, §9.2)
    Evidence: .sisyphus/evidence/task-6-4gb-present.txt

  Scenario: Cost estimates updated consistently
    Tool: Bash (grep)
    Steps:
      1. grep -n "\$0.50.*2.00\|\$0.50–\$2.00" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 0 matches (old cost range should be replaced)
    Evidence: .sisyphus/evidence/task-6-costs-updated.txt
  ```

  **Commit**: YES
  - Message: `docs: C2 correct performance-2x to 4GB RAM and recalculate cost estimates`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 7. H2 — Add missing columns and audit_log table to ER diagram

  **What to do**:
  - In the `erDiagram` block (~lines 1537-1663), add the following:
  - **TASK entity** — add these columns:
    - `text failure_reason "Reason for failure (set on timeout/exhaustion)"`
    - `jsonb triage_result "Triage output: scope, files, plan (see §13 triage_result schema)"`
  - **EXECUTION entity** — add these columns:
    - `timestamptz heartbeat_at "Last heartbeat from machine (Layer 2 monitoring)"`
    - `text current_stage "Current execution stage: boot, clone, install, execute, submit"`
  - **TASK_STATUS_LOG entity** — update the actor comment to include `machine`:
    - Change `"CHECK: gateway, lifecycle_fn, watchdog, manual"` to `"CHECK: gateway, lifecycle_fn, watchdog, machine, manual"`
  - **Add new AUDIT_LOG entity** (schema from §25, line 2534):
    ```
    AUDIT_LOG {
        uuid id PK
        uuid task_id FK
        uuid agent_version_id FK
        text api_endpoint "External API endpoint called"
        text http_method "GET, POST, PUT, DELETE"
        int response_status "HTTP response status code"
        timestamptz created_at
    }
    ```
  - **Add relationship line**: `TASK ||--o{ AUDIT_LOG : "records"`
  - **Add relationship line**: `AGENT_VERSION ||--o{ AUDIT_LOG : "logged_by"`

  **Must NOT do**:
  - Do not modify existing columns or relationships
  - Do not reformat the ER diagram
  - Do not add columns not listed above

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`
    - Reason: ER diagram is 163 lines of precise Mermaid syntax. Adding entities requires careful placement and relationship wiring.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 7)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1537-1663` — Full ER diagram block
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2534` — §25 audit_log column descriptions
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1666` — TASK_STATUS_LOG actor CHECK constraint
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1180` — failure_reason usage in pseudo-code
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1243-1255` — §10.1 heartbeat references

  **Acceptance Criteria**:
  - [ ] ER diagram contains failure_reason, triage_result, heartbeat_at, current_stage
  - [ ] AUDIT_LOG entity exists with correct columns
  - [ ] Relationship lines connect AUDIT_LOG to TASK and AGENT_VERSION
  - [ ] TASK_STATUS_LOG actor includes "machine"
  - [ ] Mermaid diagram is syntactically valid

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: All new columns present in ER diagram
    Tool: Bash (grep)
    Steps:
      1. grep "failure_reason\|heartbeat_at\|current_stage\|AUDIT_LOG" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: ≥4 matches, all within the erDiagram block area
    Evidence: .sisyphus/evidence/task-7-er-columns.txt

  Scenario: AUDIT_LOG has correct relationships
    Tool: Bash (grep)
    Steps:
      1. grep "AUDIT_LOG" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: Entity block + 2 relationship lines visible
    Evidence: .sisyphus/evidence/task-7-audit-log-rels.txt

  Scenario: Mermaid ER diagram syntax valid
    Tool: Bash (grep)
    Steps:
      1. Count erDiagram opening and verify all entities have closing braces
      2. grep -c "}" docs/2026-03-22-2317-ai-employee-architecture.md in the ER block area
    Expected Result: All entities properly closed
    Evidence: .sisyphus/evidence/task-7-mermaid-valid.txt
  ```

  **Commit**: YES
  - Message: `docs: H2 add missing columns and audit_log table to ER diagram`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 8. H5+H6+Concurrency — Fix risk table, add pooling gotcha, update concurrency syntax

  **What to do**:
  - **H5 (Risk table)**: At ~line 2092, update the "Webhook delivery failures" mitigation:
    - Change: "Inngest retries with exponential backoff + hourly Jira reconciliation poll as safety net."
    - To: "Inngest retries with exponential backoff. Hourly Jira reconciliation poll deferred for MVP (see §28); missed webhooks detected manually during daily monitoring (see §27)."
  - **H6 (Supabase pooling gotcha)**: Add callout blocks at 3 locations:
    - **§15** (~line 1894, near Supabase in tech stack): Add blockquote:
      ```
      > **Supabase Connection Gotcha**: Prisma migrations (`prisma migrate dev/deploy`) hang when using Supabase's transaction pooler (port 6543/Supavisor). Always use the **direct connection** (port 5432) for migrations. Use the pooled connection (port 6543) for application runtime queries. See §27.5 for the correct connection strings.
      ```
    - **§27 Deployment Runbook** (~line 2586, near `npx prisma migrate deploy`): Add note:
      ```
      > **Important**: Use the **direct** Supabase connection (port 5432) for all Prisma migration commands. The transaction pooler (port 6543) causes migrations to hang indefinitely.
      ```
    - **§27.5 Local Dev Setup** (~line 2789, near `.env.local`): Add `DATABASE_URL_DIRECT` to the env example and note:
      ```
      DATABASE_URL_DIRECT=postgresql://postgres:postgres@localhost:54322/postgres  # For migrations
      ```
  - **Concurrency syntax**: At ~line 1108, update:
    - From: `concurrency: { limit: 3, key: "event.data.projectId" },`
    - To: `concurrency: [{ limit: 3, key: "event.data.projectId", scope: "fn" }],`
    - This matches Inngest's current documented array syntax format

  **Must NOT do**:
  - Do not add new `##` section headers
  - Do not rewrite surrounding paragraphs
  - Keep blockquote format (`>`) for callouts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 7

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2092` — Risk table webhook row
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1894` — §15 tech stack area
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2586` — §27 deployment runbook
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2789` — §27.5 .env.local
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1108` — Concurrency config

  **Acceptance Criteria**:
  - [ ] Risk table says "deferred" for reconciliation
  - [ ] Supabase pooling gotcha appears in 3 sections
  - [ ] Concurrency uses array syntax with `scope: "fn"`

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Risk table reconciliation deferred
    Tool: Bash (grep)
    Steps:
      1. grep "reconciliation" docs/2026-03-22-2317-ai-employee-architecture.md | grep -i "deferred\|post-MVP\|§28"
    Expected Result: ≥1 match
    Evidence: .sisyphus/evidence/task-8-risk-deferred.txt

  Scenario: Pooling gotcha in 3 sections
    Tool: Bash (grep)
    Steps:
      1. grep -c "direct connection\|port 5432\|Supavisor.*migration\|pooler.*hang\|transaction pooler" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: ≥3 matches across different sections
    Evidence: .sisyphus/evidence/task-8-pooling-gotcha.txt

  Scenario: Concurrency uses array syntax
    Tool: Bash (grep)
    Steps:
      1. grep "concurrency:" docs/2026-03-22-2317-ai-employee-architecture.md | head -3
    Expected Result: Shows array form `[{` not object form `{`
    Evidence: .sisyphus/evidence/task-8-concurrency-syntax.txt
  ```

  **Commit**: YES
  - Message: `docs: H5+H6+concurrency fix risk table, add pooling gotcha, update concurrency syntax`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 9. M1 — Update cost circuit breaker to use cached daily spend

  **What to do**:
  - At ~lines 2415-2421 (§22.1 Cost Circuit Breaker), update the description:
    - Current: "Before each call, the wrapper checks cumulative daily spend for the department via `SELECT SUM(estimated_cost_usd) FROM executions WHERE department_id = $dept AND created_at > NOW() - INTERVAL '1 day'`"
    - New: "The wrapper caches cumulative daily spend per department in-memory. The cache is populated on first LLM call of each task and refreshed every 5 minutes (or when the cached value exceeds 80% of the threshold). This avoids a database query on every LLM call while maintaining cost protection. The SQL query `SELECT SUM(estimated_cost_usd) FROM executions WHERE department_id = $dept AND created_at > NOW() - INTERVAL '1 day'` is used for cache refresh."
  - Also update the sentence "Before each call, the wrapper checks" → "Before each call, the wrapper checks the cached"
  - Keep the threshold, Slack alert, and AwaitingInput behavior unchanged

  **Must NOT do**:
  - Do not change the threshold value ($50/day)
  - Do not add implementation code blocks
  - Do not restructure the section

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 9)
  - **Blocks**: Task 10
  - **Blocked By**: Task 8

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2415-2421` — §22.1 Cost Circuit Breaker

  **Acceptance Criteria**:
  - [ ] Circuit breaker description mentions caching and 5-minute refresh
  - [ ] SQL query still documented as the refresh mechanism

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: Cache mechanism documented
    Tool: Bash (grep)
    Steps:
      1. grep -i "cache\|in-memory\|refresh" docs/2026-03-22-2317-ai-employee-architecture.md | grep -i "circuit\|cost\|spend"
    Expected Result: ≥1 match confirming caching is described
    Evidence: .sisyphus/evidence/task-9-cache-documented.txt
  ```

  **Commit**: YES
  - Message: `docs: M1 update cost circuit breaker to use cached daily spend`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 10. M2-M4 — Watchdog timing note, Supabase write retries, PrismaClient singleton

  **What to do**:
  - **M2 (Watchdog timing gap)**: In §10.1 Layer 3 (~line 1255 area), add a note after the watchdog description:
    ```
    > **Detection latency**: With a 10-minute cron interval and 10-minute stale threshold, worst-case detection delay is ~20 minutes (machine dies immediately after a watchdog check). This is acceptable for MVP. To reduce to ~10 minutes, either halve the cron interval (5 min) or reduce the stale threshold (5 min) — but shorter thresholds risk false positives on slow-booting machines.
    ```
  - **M3 (Supabase write retries from machines)**: In §8 (~line 647 area) or §10.1, add a note:
    ```
    > **Machine → Supabase reliability**: The Supabase-first completion write is the critical path for SPOF mitigation. If the Supabase write fails (network partition, Supabase outage), the machine should retry with exponential backoff (3 attempts: 1s, 2s, 4s) before falling back to writing status to stdout (captured in Fly.io logs for manual recovery). This retry logic lives in `orchestrate.mjs`.
    ```
  - **M4 (PrismaClient singleton)**: In §15 (~line 1894 area, near the Supabase pooling gotcha added in Task 8), add:
    ```
    > **PrismaClient Singleton**: Use a single shared PrismaClient instance across the application (global singleton pattern). Multiple PrismaClient instances each create their own connection pool, which can exhaust Supabase's connection limit. See the Prisma documentation on connection management.
    ```

  **Must NOT do**:
  - Do not add new section headers
  - Keep all additions as blockquote callouts (`>`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 10)
  - **Blocks**: Task 11
  - **Blocked By**: Task 9

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1243-1260` — §10.1 Layer 3 watchdog
  - `docs/2026-03-22-2317-ai-employee-architecture.md:647-649` — §8 MVP scope / SPOF mitigation area
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1894` — §15 tech stack area

  **Acceptance Criteria**:
  - [ ] Watchdog detection latency note exists
  - [ ] Machine Supabase retry logic described
  - [ ] PrismaClient singleton note exists

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: All three notes present
    Tool: Bash (grep)
    Steps:
      1. grep -c "Detection latency\|Machine.*Supabase reliability\|PrismaClient Singleton" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 3 matches
    Evidence: .sisyphus/evidence/task-10-three-notes.txt
  ```

  **Commit**: YES
  - Message: `docs: M2-M4 add watchdog timing note, Supabase retry, PrismaClient singleton`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 11. M5-M8 — Volume fork timing, Inngest Connect, Zod validation, sequence diagram fix

  **What to do**:
  - **M5 (Volume fork timing)**: In §7.3 (~line 586 area) or §9.2 (~line 899), update the warm boot description:
    - Add note: "Volume forking is not instantaneous for previously-mounted volumes — expect 14-32s fork time (vs ~1s for fresh volumes). Factor this into the 80-second warm boot target."
  - **M6 (Inngest Connect)**: In §15 (~line 1824 area, tech stack considerations) or §28, add:
    ```
    > **Optimization opportunity**: Inngest Connect establishes a persistent outbound connection from the Event Gateway to Inngest, reducing inter-step latency from ~120ms to <5ms. Since the Event Gateway runs on Fly.io (always-on), this is directly applicable. Consider enabling after MVP is stable.
    ```
  - **M7 (Zod validation for triage_result)**: In §13 (~line 1682 area, where triage_result schema is described), add a note:
    ```
    > **Validation**: Define a Zod schema for `triage_result` that the execution agent uses to parse triage output. This prevents malformed JSON from crashing execution. The schema should match the structure defined above.
    ```
  - **M8 (Sequence diagram ordering)**: In §11 (~line 1300 area), verify that the sequence diagram shows Supabase write (step 4) BEFORE Inngest send (step 5). If the ordering is reversed, swap them. The prose at §8 says "Supabase before Inngest" — the diagram must match.

  **Must NOT do**:
  - Do not add new section headers
  - Do not rewrite surrounding paragraphs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 10

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:586` — §7.3 warm boot
  - `docs/2026-03-22-2317-ai-employee-architecture.md:899` — §9.2 provisioning strategy
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1824` — §15 tech considerations
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1682` — §13 triage_result schema
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1298-1305` — §11 sequence diagram steps 4-5

  **Acceptance Criteria**:
  - [ ] Volume fork timing note exists
  - [ ] Inngest Connect mentioned as optimization opportunity
  - [ ] Zod validation note exists near triage_result
  - [ ] Sequence diagram shows Supabase before Inngest

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: All four items present
    Tool: Bash (grep)
    Steps:
      1. grep -c "14-32s\|fork time\|Inngest Connect\|Zod.*triage_result\|Zod schema" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: ≥3 matches
    Evidence: .sisyphus/evidence/task-11-medium-items.txt
  ```

  **Commit**: YES
  - Message: `docs: M5-M8 update volume timing, add Inngest Connect, Zod note, fix sequence diagram`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 12. L1-L5 — Low-severity items batch

  **What to do**:
  - **L1 (Status CHECK constraint)**: In §13 (~line 1666 area, near the TASK_STATUS_LOG actor CHECK), add a note:
    ```
    > **Recommended**: Add a CHECK constraint on `tasks.status` to enforce valid values: `CHECK (status IN ('Received', 'Triaging', 'AwaitingInput', 'Ready', 'Executing', 'Validating', 'Submitting', 'Reviewing', 'Approved', 'Delivering', 'Done', 'Cancelled', 'Stale'))`. This catches typos at the database level.
    ```
  - **L2 (Machine actor in status_log)**: Already handled in Task 7 (H2). Verify it was applied. If not, add `machine` to the actor CHECK constraint list.
  - **L3 (Prisma Next pgvector)**: In §28 (~line 2824, pgvector row), add a note after the existing row:
    ```
    > **Update (March 2026)**: Prisma Next (expected GA July 2026) will add native pgvector support via `@prisma-next/extension-pgvector`, providing type-safe vector column definitions and query operations. This may simplify the knowledge base implementation when it ships.
    ```
  - **L4 (pgvectorscale)**: In §12 (~line 1450 area, or wherever Qdrant is mentioned as the vector scaling path), add:
    ```
    > **Alternative**: pgvectorscale (Timescale, released March 2026) delivers 11.4× faster pgvector queries by adding StreamingDiskANN indexing. This stays within PostgreSQL — avoiding a new service (Qdrant). Consider as an intermediate step before evaluating Qdrant.
    ```
  - **L5 (No load testing strategy)**: In §27 Operational Runbooks (~line 2698 area, end of quarterly section), add:
    ```
    > **Pre-production validation**: Before enabling autonomous mode, run a load test simulating 5-10 concurrent tasks across 2-3 projects. Verify: Inngest queue health, Fly.io machine creation rate limits not hit, Supabase connection pool not exhausted, cost circuit breaker triggers correctly. Use Inngest Dev Server + local Docker for initial validation.
    ```

  **Must NOT do**:
  - Do not modify existing rows in §28
  - Do not restructure tables
  - Keep all additions as blockquote callouts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 12)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 11

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1666` — actor CHECK constraint
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2824` — §28 pgvector row
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1450` — §12 or knowledge base scaling
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2698` — §27 quarterly section

  **Acceptance Criteria**:
  - [ ] Status CHECK constraint note exists
  - [ ] Prisma Next pgvector note exists
  - [ ] pgvectorscale alternative mentioned
  - [ ] Load testing note exists

  **QA Scenarios (MANDATORY)**:
  ```
  Scenario: All low-severity items present
    Tool: Bash (grep)
    Steps:
      1. grep -c "CHECK.*status IN\|Prisma Next\|pgvectorscale\|load test\|Pre-production" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: ≥3 matches
    Evidence: .sisyphus/evidence/task-12-low-items.txt
  ```

  **Commit**: YES
  - Message: `docs: L1-L5 add Prisma Next note, pgvectorscale, status constraint, machine actor`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each finding (C1-C4, H1-H7, M1-M8, L1-L5): verify the change was applied. Run all 12 acceptance criteria grep checks (AC1-AC12). Compare deliverables against plan.
  Output: `Findings applied [22/22] | AC checks [12/12 pass] | VERDICT: APPROVE/REJECT`

- [x] F2. **Document Quality Review** — `unspecified-high`
  Read the full updated document. Check for: broken cross-references (§N references), inconsistent terminology, orphaned notes, prose that contradicts the edits, Mermaid diagrams with syntax errors, TypeScript pseudo-code with unbalanced braces. Check all Mermaid fences are balanced.
  Output: `Cross-refs [N/N valid] | Mermaid [N/N valid] | Pseudo-code [N/N balanced] | VERDICT`

- [x] F3. **Factual Accuracy Verification** — `unspecified-high`
  For each corrected fact (performance-2x RAM, Inngest issue status, waitForEvent quoting, concurrency syntax): verify the correction matches the research evidence. Check cost estimates are mathematically consistent with the 4GB spec. Verify no "8GB" references remain for performance-2x.
  Output: `Facts [N/N correct] | Costs [consistent/inconsistent] | Stale refs [N found] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was edited (no missing), nothing beyond spec was edited (no creep). Check "Must NOT do" compliance. Flag unaccounted changes. Verify no new section headers were added.
  Output: `Tasks [12/12 compliant] | Creep [CLEAN/N issues] | Headers [CLEAN] | VERDICT`

---

## Commit Strategy

All tasks edit one file. Commits grouped by logical batch:

- **T1**: `docs: C4 fix waitForEvent if-clause quoting to use single quotes for strings`
- **T2**: `docs: C3+H4 simplify redispatch to event-only and add cancellation guard`
- **T3**: `docs: H3 remove Provisioning state from universal state machine`
- **T4**: `docs: H1 set MVP Event Gateway status to Ready instead of Received`
- **T5**: `docs: C1 reframe Inngest 1433 race condition as unresolved with Supabase-first defense`
- **T6**: `docs: C2 correct performance-2x to 4GB RAM and recalculate cost estimates`
- **T7**: `docs: H2 add missing columns and audit_log table to ER diagram`
- **T8**: `docs: H5+H6+concurrency fix risk table, add pooling gotcha, update concurrency syntax`
- **T9**: `docs: M1 update cost circuit breaker to use cached daily spend`
- **T10**: `docs: M2-M4 add watchdog timing note, Supabase retry, PrismaClient singleton`
- **T11**: `docs: M5-M8 update volume timing, add Inngest Connect, Zod note, fix sequence diagram`
- **T12**: `docs: L1-L5 add Prisma Next note, pgvectorscale, status constraint, machine actor`

---

## Success Criteria

### Verification Commands
```bash
# AC1: No "Now Fixed" language for #1433
grep -c "Now Fixed\|no longer required\|#1433.*fixed\|fixed in Inngest" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: 0

# AC2: RAM spec is 4GB everywhere for performance-2x
grep -c "8.GB RAM\|8 GB RAM" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: 0

# AC3: Redispatch has no machine creation
grep -c "flyApi.createMachine\|createMachine" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: exactly 1 (in main lifecycle, NOT in redispatch)

# AC4: waitForEvent if-clause uses single quotes for strings
grep "async.data.taskId ==" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "'" | wc -l
# Expected: 0 (all occurrences use single quotes)

# AC5: ER diagram has all new columns
grep -c "failure_reason\|heartbeat_at\|current_stage\|AUDIT_LOG" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥4 (each term at least once in ER diagram area)

# AC6: No Provisioning in state machine
grep "Provisioning" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v ">" | head -5
# Expected: 0 lines from stateDiagram block

# AC7: Cancellation guard exists in lifecycle
grep -c "Cancelled\|cancel" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥1 in the lifecycle function pseudo-code area

# AC8: Risk table reconciliation marked deferred
grep "reconciliation" docs/2026-03-22-2317-ai-employee-architecture.md | grep -c "deferred\|post-MVP\|§28"
# Expected: ≥1

# AC9: Supabase pooling gotcha appears in 3 sections
grep -c "5432\|Supavisor.*migration\|pooler.*migration\|direct connection.*migration" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥3

# AC10: Mermaid blocks balanced
grep -c '```mermaid' docs/2026-03-22-2317-ai-employee-architecture.md
# Must equal number of closing ``` after mermaid opens

# AC11: Line count sanity
wc -l < docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: 2836-2960

# AC12: No new section headers
git diff docs/2026-03-22-2317-ai-employee-architecture.md | grep "^+" | grep -c "^+##"
# Expected: 0
```

### Final Checklist
- [ ] All 22 findings applied
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 12 AC checks pass
- [ ] All Mermaid diagrams valid
