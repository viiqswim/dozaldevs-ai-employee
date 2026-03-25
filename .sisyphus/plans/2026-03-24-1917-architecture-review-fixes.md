# Architecture Document — Review Fixes (11 Targeted Edits)

## TL;DR

> **Quick Summary**: Apply 11 targeted fixes to the existing architecture document based on a comprehensive review. Three critical gaps (LLM cost tracking, missing project_id FK, undocumented task dispatch mechanism), five important clarifications, and three quality improvements. All fixes are surgical edits to an existing 2,443-line document — no structural reorganization.
>
> **Deliverables**:
> - Updated `docs/2026-03-22-2317-ai-employee-architecture.md` with all 11 fixes applied
> - Zero internal contradictions introduced
> - All Mermaid diagrams syntactically valid
>
> **Estimated Effort**: Medium (11 surgical edits across 6 sections)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Wave 1 (isolated) → Wave 2 (§8) → Wave 3 (§9-10) → Wave 4 (§13+22) → Final Verification

---

## Context

### Original Request
Comprehensive architecture review identified 11 gaps/issues in the existing architecture document. All decisions confirmed through interactive interview with the user.

### Interview Summary
**Key Decisions**:
- LLM cost tracking: Add columns to EXECUTION entity (not a new LLM_CALL table) — simpler, per-task aggregation sufficient for circuit breaker
- Task dispatch: Env vars at `fly machine run` time → Supabase query at boot — matches nexus-stack pattern
- Marketing section: Collapse from 60+ lines to ~15-20 line vision summary
- Keep 90-minute timeout (declined 60-minute suggestion)
- waitForEvent race condition: Document mitigation now for M4

**Research Findings (verified by agents)**:
- Jira Cloud HMAC-SHA256 with `X-Hub-Signature` header — document is correct
- Inngest step retries are step-level, not function-level — confirmed
- Inngest concurrency supports `event.data.project_id` dynamic key — confirmed
- waitForEvent race condition confirmed (GitHub #1433) — events before listener are missed
- OpenCode SDK `createOpencodeClient()` confirmed with session management

### Metis Review
**Identified Gaps (addressed in plan)**:
- Fix #1 contradicts §22 lines 2075-2079 ("No additional database table needed") — must update that statement
- Fix #6 verified: Line 168 confirms `GH -.->|"webhook"| GW` in MVP diagram — not a no-op
- Fix #10 needs explicit scope: what survives from §6.2 collapse
- Fix #9 placement: after existing flow walkthrough, before §10.1
- Fix #3 split: §9.2 gets machine-side flow, §10 gets Inngest-side dispatch

**Guardrails from Metis (enforced in all tasks)**:
- Only modify the specific node/edge being changed in Mermaid diagrams — no reformatting
- No prose rewrites outside fix scope — document is mature
- §6.2 collapse: select surviving sentences, don't rewrite in new words
- Fix #1 must include rationale note explaining why per-call tracking supersedes OpenRouter Dashboard approach
- Fix #8: only add context/notes — do NOT alter existing cost figures

---

## Work Objectives

### Core Objective
Apply 11 verified fixes to make the architecture document airtight for MVP implementation, resolving critical gaps in the data model, task dispatch mechanism, and cost tracking while adding operational clarity for the Event Gateway and Inngest lifecycle.

### Concrete Deliverables
- Updated architecture document with all 11 fixes
- No new files created — edits only to `docs/2026-03-22-2317-ai-employee-architecture.md`

### Definition of Done
- [x] All 11 fixes applied and verified via grep
- [x] No internal contradictions (especially §22 cost tracking statement updated)
- [x] All Mermaid diagrams render correctly
- [x] Document line count in range 2,400-2,600 (net additions minus §6.2 collapse)

### Must Have
- project_id FK on TASK entity + ER diagram consistency
- LLM cost tracking columns on EXECUTION + updated §22 cost tracking statement
- Fly.io task dispatch mechanism documented with env var → Supabase query flow
- Gateway retry spec (3 attempts, exponential backoff)
- Webhook routing table in Section 8
- MVP diagram without GitHub webhooks
- callLLM() interface contract with function signature and cost tracking fields
- MVP Inngest lifecycle pseudo-code (~30 lines)

### Must NOT Have (Guardrails)
- No Mermaid diagram reformatting beyond the specific fix
- No prose rewrites adjacent to fixes
- No new diagrams (prose/code blocks only for Fixes #9 and #11)
- No alteration of existing cost figures in Section 17 (only add notes)
- No new columns on TASK beyond project_id (no "while we're here" additions)
- No rewriting §6.2 in new words — select surviving sentences from existing text
- No new entities in the data model (add columns to EXECUTION, not a new LLM_CALL table)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (documentation task)
- **Automated tests**: None
- **Framework**: N/A

### QA Policy
Every task MUST verify via grep that the specific fix was applied correctly and no adjacent content was unintentionally modified. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Isolated edits — no dependencies between them):
├── Task 1: Fix #2 — Add project_id FK to TASK entity [quick]
├── Task 2: Fix #6 — Remove GitHub webhook from MVP diagram [quick]
├── Task 3: Fix #8 — Add MVP cost note to Section 17 [quick]
└── Task 4: Fix #10 — Collapse Section 6.2 marketing [quick]

Wave 2 (Section 8 additions):
├── Task 5: Fix #5 — Add Gateway retry spec to Section 8 [quick]
└── Task 6: Fix #7 — Add webhook routing table to Section 8 [quick]

Wave 3 (Section 9-10 additions — sequential within section):
├── Task 7: Fix #3 — Document Fly.io dispatch mechanism (§9.2 + §10) [writing]
├── Task 8: Fix #4 — Document waitForEvent race condition (§10) [quick]
└── Task 9: Fix #9 — Add MVP Inngest lifecycle pseudo-code (§10) [quick]

Wave 4 (Section 13 + 22 — coupled edits):
├── Task 10: Fix #1 — Add LLM cost tracking (§13 + §22) [writing]
└── Task 11: Fix #11 — Add callLLM() interface contract (§22) [quick]

Wave FINAL (Verification — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Content quality + contradiction check (unspecified-high)
├── Task F3: Mermaid diagram validation (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1-4 (parallel) → Task 5-6 (parallel) → Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → F1-F4 → user okay
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|---|---|---|
| 1-4 | None | F1-F4 |
| 5-6 | None (but Wave 2 for ordering) | F1-F4 |
| 7 | None | 8, 9 |
| 8 | 7 (§10 content from Fix #3 must be in place) | 9 |
| 9 | 8 (pseudo-code placement depends on §10 structure) | F1-F4 |
| 10 | None | 11 |
| 11 | 10 (§22 updates from Fix #1 must be in place) | F1-F4 |
| F1-F4 | All tasks | User okay |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1-T4 → `quick`
- **Wave 2**: **2** — T5-T6 → `quick`
- **Wave 3**: **3** — T7 → `writing`, T8-T9 → `quick`
- **Wave 4**: **2** — T10 → `writing`, T11 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix #2 — Add `project_id` FK to TASK entity (Section 13)

  **What to do**:
  - In the TASK entity definition (lines 1371-1382), add `uuid project_id FK` after `archetype_id FK`
  - Verify the ER diagram already shows `PROJECT ||--o{ TASK : generates` (it does — line 1351) — no diagram change needed
  - Do NOT add any other columns

  **Must NOT do**:
  - Add any columns beyond project_id
  - Modify any other entity definitions
  - Reformat the ER diagram Mermaid code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1336-1484` — Section 13 ER diagram and entity definitions
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1351` — Existing `PROJECT ||--o{ TASK : generates` relationship line
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1371-1382` — TASK entity definition (add project_id here)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: project_id FK present in TASK entity definition
    Tool: Bash (grep)
    Steps:
      1. grep -n "project_id" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥2 matches: one in ER relationship lines, one in TASK entity block
      3. Verify the new line is between archetype_id and external_id in the entity block
    Expected Result: project_id appears in TASK entity with uuid type and FK annotation
    Failure Indicators: <2 grep matches, or project_id appears only in PROJECT entity
    Evidence: .sisyphus/evidence/task-1-project-id.txt

  Scenario: No unintended changes to adjacent entities
    Tool: Bash (grep)
    Steps:
      1. grep -c "EXECUTION\|DELIVERABLE\|FEEDBACK" in entity definition blocks
      2. Compare counts with known baseline (these entities should be unchanged)
    Expected Result: Other entity definitions untouched
    Evidence: .sisyphus/evidence/task-1-no-collateral.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3, 4)
  - Message: `docs(architecture): add project_id FK, remove MVP GH webhook, add MVP cost note, collapse marketing section`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 2. Fix #6 — Remove GitHub webhook from MVP diagram (Section 2)

  **What to do**:
  - In the MVP diagram (lines 148-178), remove line 168: `GH -.->|"webhook"| GW`
  - Keep `GH` in the External subgraph (it's still an output target — line 172 `EXEC -->|"PR"| GH`)
  - After the diagram (line 180), add a note: "GitHub webhooks are enabled in M4 when the review agent reacts to PR events. In MVP, GitHub is an output target only (the execution agent creates PRs)."
  - Check lines 186-196 (MVP scope summary table) — if GitHub webhooks are mentioned as MVP, update accordingly

  **Must NOT do**:
  - Remove `GH` from the External subgraph (it's still needed as PR target)
  - Reformat any other diagram lines
  - Modify the full platform architecture diagram (only the MVP diagram)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:148-178` — MVP Mermaid diagram
  - `docs/2026-03-22-2317-ai-employee-architecture.md:168` — The specific line to remove: `GH -.->|"webhook"| GW`
  - `docs/2026-03-22-2317-ai-employee-architecture.md:172` — Keep this line: `EXEC -->|"PR"| GH` (output to GitHub)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:180` — After diagram, where to add note
  - `docs/2026-03-22-2317-ai-employee-architecture.md:186-196` — MVP scope summary table, check for GitHub webhook references

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GitHub webhook line removed from MVP diagram
    Tool: Bash (grep)
    Steps:
      1. grep -n 'GH.*webhook.*GW\|GH -.->.*GW' docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert 0 matches
      3. grep -n 'EXEC.*PR.*GH' docs/2026-03-22-2317-ai-employee-architecture.md
      4. Assert ≥1 match (PR output line preserved)
    Expected Result: No GitHub webhook input line; GitHub still present as PR output target
    Failure Indicators: webhook line still present, or GH node removed entirely
    Evidence: .sisyphus/evidence/task-2-gh-webhook-removed.txt

  Scenario: MVP diagram still renders correctly
    Tool: Bash (grep)
    Steps:
      1. Extract Mermaid block between ```mermaid and ``` markers near line 148
      2. Verify JIRA, GH, GW, ING, SUP, EXEC, LLM nodes still present
      3. Verify classDef lines intact
    Expected Result: Diagram has all nodes except the removed edge
    Evidence: .sisyphus/evidence/task-2-diagram-valid.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3, 4)

- [x] 3. Fix #8 — Add MVP cost note to Section 17

  **What to do**:
  - In Section 17's per-task cost table (lines 1796-1800), add a note after the total row:
    `> **MVP note**: Triage is deferred in MVP. MVP per-task cost is ~$1.00-$5.00 (execution + compute only). The triage line item applies when the triage agent is added in M2.`
  - Do NOT change any existing numbers

  **Must NOT do**:
  - Alter any existing cost figures
  - Restructure the cost table
  - Add new rows to the table

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1790-1804` — Section 17 per-task cost table

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: MVP cost note present
    Tool: Bash (grep)
    Steps:
      1. grep -n "MVP note\|MVP per-task cost\|triage.*deferred" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥1 match in line range near 1800
    Expected Result: MVP cost clarification present near the cost table
    Evidence: .sisyphus/evidence/task-3-mvp-cost-note.txt

  Scenario: Existing cost figures unchanged
    Tool: Bash (grep)
    Steps:
      1. grep "1.05.*5.15\|0.50.*2.40" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert both totals still present (original figures preserved)
    Expected Result: No cost figures altered
    Evidence: .sisyphus/evidence/task-3-costs-unchanged.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)

- [x] 4. Fix #10 — Collapse Section 6.2 marketing to vision summary

  **What to do**:
  - Section 6.2 (lines 513-571) currently has: overview, V1 scope, trigger sources, agent runtime with Inngest code example, execution environment, triage tools, execution tools, risk model table, and summary.
  - **Keep**: First paragraph (overview + runtime type, line 515), V1 scope sentence (line 517), trigger sources sentence (line 519). These are the essential vision elements.
  - **Remove**: The Inngest code example (lines 521-549), the step checkpoint explanation (line 552), execution environment detail (line 554), triage tools list (line 556), execution tools list (line 558), and the risk model table (lines 560-570).
  - Add a closing sentence: "Detailed marketing agent specifications — risk model weights, tool configurations, and Inngest workflow patterns — will be defined when M6 planning begins."
  - Target: ~15-20 lines total for §6.2

  **Must NOT do**:
  - Rewrite surviving sentences in new words — keep original text verbatim
  - Remove the §6.2 header or the `---` separator before §6.3
  - Add new content beyond the closing sentence

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:513-571` — Current Section 6.2 full content
  - `docs/2026-03-22-2317-ai-employee-architecture.md:574` — Section 6.3 header (preserve boundary)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Section 6.2 within target line count
    Tool: Bash (awk)
    Steps:
      1. awk '/### 6.2/,/### 6.3/' docs/2026-03-22-2317-ai-employee-architecture.md | wc -l
      2. Assert result is 15-25 lines
    Expected Result: Section collapsed to target range
    Failure Indicators: >30 lines (not enough removed) or <10 lines (too much removed)
    Evidence: .sisyphus/evidence/task-4-section62-lines.txt

  Scenario: Code example removed
    Tool: Bash (grep)
    Steps:
      1. grep "inngest.createFunction\|step.run.*collect-data\|optimizeCampaign" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert 0 matches
    Expected Result: Inngest code example fully removed
    Evidence: .sisyphus/evidence/task-4-code-removed.txt

  Scenario: Risk model table removed
    Tool: Bash (grep)
    Steps:
      1. grep "Daily spend increase.*30%\|New audience targeting.*25%" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert 0 matches
    Expected Result: Marketing risk model table removed
    Evidence: .sisyphus/evidence/task-4-risk-table-removed.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 3)

- [x] 5. Fix #5 — Add Gateway → Inngest retry spec (Section 8)

  **What to do**:
  - In Section 8 (Event Gateway), after the existing description of the Gateway → Inngest event send flow, add a subsection or note specifying retry behavior:
    - The Gateway retries `inngest.send()` 3 times with exponential backoff (1s, 2s, 4s) before giving up
    - If all retries fail, the task stays in `Received` state with `raw_event` preserved (existing SPOF mitigation)
    - The `dispatch-task.ts` CLI handles manual recovery for persistent failures
    - Escalation: if >5 tasks/week get stuck in `Received`, add an Inngest cron for automatic re-send
  - Frame this as a new design decision, not a correction of existing behavior
  - Find the appropriate insertion point in Section 8 — likely after the numbered flow walkthrough steps where the Gateway sends events to Inngest

  **Must NOT do**:
  - Rewrite surrounding prose
  - Add more than ~10-15 lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 6)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:691-774` — Section 8 (Event Gateway)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:749-758` — The numbered flow walkthrough (find the Inngest send step)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Retry spec present in Section 8
    Tool: Bash (grep)
    Steps:
      1. grep -n "exponential.*backoff\|retry.*attempt\|3.*attempt\|1s.*2s.*4s" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥1 match in Section 8 line range
    Expected Result: Retry behavior documented with specific attempt count and timing
    Evidence: .sisyphus/evidence/task-5-retry-spec.txt

  Scenario: No unintended changes to Section 8 flow
    Tool: Bash (grep)
    Steps:
      1. Verify the existing numbered flow steps (1-8) are still present and unchanged
    Expected Result: Existing content preserved; new content is additive only
    Evidence: .sisyphus/evidence/task-5-no-collateral.txt
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `docs(architecture): add gateway retry spec and webhook routing table`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 6. Fix #7 — Add webhook event routing table (Section 8)

  **What to do**:
  - In Section 8, add a "Webhook Event Routing" subsection with a concrete table mapping Jira event types to Gateway actions. Place it after the retry spec (Task 5) or after the existing flow walkthrough.
  - Table content:

    | Jira Event | MVP Action | Post-MVP Action |
    |---|---|---|
    | `jira:issue_created` | Create task record in Supabase, send to Inngest | Same + trigger triage agent |
    | `jira:issue_updated` | Ignore during execution (Section 4.2) | Update `triage_result` if task is pre-execution |
    | `jira:issue_deleted` or status → Cancelled | Set task status to `Cancelled`, notify Inngest | Same |
    | `jira:comment_created` | Ignore | Resume `AwaitingInput` tasks (re-trigger triage) |

  - Add a brief note: "The Gateway determines action by matching the `webhookEvent` field in the Jira payload. Unknown event types are logged and ignored."
  - Scope: Jira events ONLY (not GitHub, not Slack). ~10-15 lines including the table.

  **Must NOT do**:
  - Add GitHub or Slack event routing (GitHub webhooks are M4, Slack is a separate endpoint)
  - Create a comprehensive event catalog — keep to 4-5 rows
  - Rewrite surrounding prose

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:691-774` — Section 8 (Event Gateway)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:318-352` — Section 4.2 (mid-flight task updates — referenced by routing table)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Routing table present with Jira event types
    Tool: Bash (grep)
    Steps:
      1. grep -n "issue_created\|issue_updated\|issue_deleted\|comment_created" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥4 matches clustered together (table rows)
    Expected Result: Routing table with 4+ Jira event types and MVP/post-MVP actions
    Evidence: .sisyphus/evidence/task-6-routing-table.txt

  Scenario: No GitHub or Slack events in routing table
    Tool: Bash (grep)
    Steps:
      1. In the routing table area, verify no GitHub event types (pull_request, push, etc.)
    Expected Result: Table is Jira-only as specified
    Evidence: .sisyphus/evidence/task-6-jira-only.txt
  ```

  **Commit**: YES (groups with Task 5)

- [x] 7. Fix #3 — Document Fly.io task dispatch mechanism (Sections 9.2 + 10)

  **What to do**:
  Two additions — one in §9.2 (machine-side) and one in §10 (Inngest-side):

  **In Section 9.2 (Execution Agent Flow)**, near the entrypoint.sh boot lifecycle description (lines 905-906), add a "Task Context Injection" subsection (~15-20 lines):
  - The Inngest lifecycle function calls the Fly.io Machines API (`POST /v1/apps/{app}/machines`) with these environment variables:
    - `TASK_ID` — UUID of the task record in Supabase
    - `REPO_URL` — The project's GitHub repository URL (from PROJECT record)
    - `REPO_BRANCH` — The base branch to clone from (from PROJECT record)
    - Credentials: `GITHUB_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY` (from Fly.io Secrets)
  - `entrypoint.sh` reads `TASK_ID` from the environment at boot
  - The machine queries Supabase for the full task record: `SELECT * FROM tasks WHERE id = $TASK_ID`
  - The task's `triage_result` JSONB column provides: ticket_id, title, description, labels, priority
  - This context is passed to the OpenCode session via `client.session.create()` + `client.session.chat()` with the task description as the initial prompt
  - Note: This mirrors the proven nexus-stack pattern where `dispatch.sh` passes `PLAN_NAME` and `REPO_URL` as env vars

  **In Section 10 (Orchestration)**, in the Inngest lifecycle function flow walkthrough (near lines 1070-1084), add or update the dispatch step to explicitly mention the Fly.io Machines API call with env vars. Reference Section 9.2 for the full env var list.

  **Must NOT do**:
  - Rewrite the existing entrypoint.sh description or provisioning strategy
  - Add a new Mermaid diagram
  - Modify the fix loop or escalation sections

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 3 is sequential — §10 additions depend on ordering)
  - **Parallel Group**: Wave 3 — runs first
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:841-926` — Section 9.2 (Execution Agent Flow)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:905-906` — Existing entrypoint.sh mention
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1021-1112` — Section 10 (Orchestration) flow walkthrough
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1070-1084` — 14-step flow walkthrough (update dispatch step)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1494-1528` — triage_result interface contract (reference for what the machine reads)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Task dispatch mechanism documented in §9.2
    Tool: Bash (grep)
    Steps:
      1. grep -n "TASK_ID\|REPO_URL\|REPO_BRANCH\|fly.*machine\|env.*var" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert matches in §9.2 line range (~841-926 area)
    Expected Result: Env var injection documented with all 3 required variables
    Evidence: .sisyphus/evidence/task-7-dispatch-mechanism.txt

  Scenario: §10 references the dispatch mechanism
    Tool: Bash (grep)
    Steps:
      1. grep -n "Machines API\|TASK_ID\|Section 9.2" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert match in §10 line range (~1021-1112 area)
    Expected Result: §10 flow walkthrough mentions Fly.io Machines API call with env vars
    Evidence: .sisyphus/evidence/task-7-section10-ref.txt

  Scenario: Existing content not rewritten
    Tool: Bash (grep)
    Steps:
      1. grep "Pre-built Docker images\|Target warm boot" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert both existing phrases still present
    Expected Result: Prior entrypoint.sh content unchanged
    Evidence: .sisyphus/evidence/task-7-no-rewrite.txt
  ```

  **Commit**: YES (groups with Tasks 8, 9)
  - Message: `docs(architecture): document dispatch mechanism, waitForEvent mitigation, MVP lifecycle pseudo-code`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 8. Fix #4 — Document waitForEvent race condition mitigation (Section 10)

  **What to do**:
  - In Section 10, find the area discussing `step.waitForEvent()` for human-in-the-loop pauses (near lines 1086-1098)
  - Add a "Known Limitation" or "Implementation Note" subsection (~10-15 lines):
    - Inngest's `step.waitForEvent()` only listens for events sent AFTER it starts executing. Events sent before the listener is ready are silently missed (Inngest GitHub issue #1433).
    - This affects approval flows: if a human clicks "Approve" in Slack before the lifecycle function reaches `step.waitForEvent("approval.received")`, the approval is lost and the function times out.
    - **Mitigation pattern**: The `/slack/interactions` endpoint writes the approval action to Supabase first (e.g., a `manual_action` column on the task or deliverable). Before calling `step.waitForEvent()`, the lifecycle function checks Supabase for an existing action. If found, skip the wait and proceed.
    - This mitigation is required when implementing the review agent approval flow (M4). It does not affect MVP (no approval gates in MVP).
  - Reference: This is documented for M4 implementation, not for MVP build.

  **Must NOT do**:
  - Add this to the MVP scope or roadmap
  - Modify the existing `step.waitForEvent()` description — add the note alongside, not instead of
  - Add a Mermaid diagram

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 — runs after Task 7
  - **Blocks**: Task 9
  - **Blocked By**: Task 7 (§10 content must be stable)

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1086-1098` — Existing step.waitForEvent() discussion in §10
  - Inngest GitHub issue #1433 — Race condition documentation

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Race condition mitigation documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "race condition\|waitForEvent.*miss\|Supabase first\|check.*before.*wait" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥1 match in §10 line range
    Expected Result: Race condition and mitigation pattern documented
    Evidence: .sisyphus/evidence/task-8-race-condition.txt

  Scenario: Explicitly scoped to post-MVP
    Tool: Bash (grep)
    Steps:
      1. grep -A3 "race condition" docs/2026-03-22-2317-ai-employee-architecture.md | grep -i "M4\|post-MVP\|review agent"
    Expected Result: Note clearly states this applies to M4, not MVP
    Evidence: .sisyphus/evidence/task-8-post-mvp-scope.txt
  ```

  **Commit**: YES (groups with Tasks 7, 9)

- [x] 9. Fix #9 — Add MVP Inngest lifecycle pseudo-code (Section 10)

  **What to do**:
  - In Section 10, after the existing 14-step flow walkthrough (lines ~1070-1084) and before §10.1, add a "MVP Lifecycle Function" subsection with ~30-line TypeScript pseudo-code showing the actual Inngest function structure.
  - The pseudo-code should show:
    ```typescript
    export const engineeringTaskLifecycle = inngest.createFunction(
      {
        id: "engineering/task-lifecycle",
        concurrency: { limit: 3, key: "event.data.projectId" },
      },
      { event: "engineering/task.received" },
      async ({ event, step }) => {
        // Step 1: Update task status to Executing
        await step.run("update-status-executing", async () => {
          await supabase.from("tasks").update({ status: "Executing" }).eq("id", event.data.taskId);
        });

        // Step 2: Dispatch Fly.io machine with task context
        const machine = await step.run("dispatch-fly-machine", async () => {
          return await flyApi.createMachine({
            config: {
              env: {
                TASK_ID: event.data.taskId,
                REPO_URL: event.data.repoUrl,
                REPO_BRANCH: event.data.repoBranch,
              },
              image: "registry.fly.io/nexus-workers:latest",
            },
          });
        });

        // Step 3: Wait for completion event (90-min timeout)
        const result = await step.waitForEvent("wait-for-completion", {
          event: "engineering/task.completed",
          timeout: "90m",
          if: `async.data.taskId == "${event.data.taskId}"`,
        });

        // Step 4: Handle result
        await step.run("finalize", async () => {
          if (!result) {
            // Timeout — machine is stuck
            await supabase.from("tasks").update({ status: "Failed" }).eq("id", event.data.taskId);
            await sendSlackAlert(`Task ${event.data.taskId} timed out`);
          } else {
            await supabase.from("tasks").update({ status: result.data.status }).eq("id", event.data.taskId);
          }
        });
      }
    );
    ```
  - Add a brief note: "This pseudo-code shows the MVP function structure. The triage step (M2), review step (M4), and approval gates are added as additional `step.run()` blocks within this same function as each milestone is built."
  - Emphasize: this complements the prose walkthrough, it doesn't replace it

  **Must NOT do**:
  - Add a new Mermaid diagram
  - Duplicate the existing 14-step walkthrough in code form
  - Include triage or review steps in the MVP pseudo-code
  - Show more than ~35 lines of code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 — runs after Task 8
  - **Blocks**: F1-F4
  - **Blocked By**: Task 8 (§10 structure must be final)

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1021-1112` — Section 10 (Orchestration)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1070-1084` — 14-step flow walkthrough (pseudo-code complements this)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1086-1098` — Inngest function configuration area

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: MVP lifecycle pseudo-code present
    Tool: Bash (grep)
    Steps:
      1. grep -n "engineeringTaskLifecycle\|engineering/task-lifecycle\|createFunction" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥1 match in §10 line range
    Expected Result: Inngest function pseudo-code present with correct function ID
    Evidence: .sisyphus/evidence/task-9-lifecycle-pseudocode.txt

  Scenario: Pseudo-code includes key elements
    Tool: Bash (grep)
    Steps:
      1. grep -n "dispatch-fly-machine\|wait-for-completion\|TASK_ID\|90m" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert all 4 terms present in the pseudo-code block
    Expected Result: Pseudo-code has dispatch, wait, task ID injection, and timeout
    Evidence: .sisyphus/evidence/task-9-key-elements.txt

  Scenario: No triage or review steps in MVP pseudo-code
    Tool: Bash (grep)
    Steps:
      1. In the pseudo-code block, grep for "triage\|review agent\|approval"
      2. Assert 0 matches within the code block itself (note mentioning future additions is OK)
    Expected Result: MVP pseudo-code is clean — only dispatch + wait + finalize
    Evidence: .sisyphus/evidence/task-9-mvp-only.txt
  ```

  **Commit**: YES (groups with Tasks 7, 8)

- [x] 10. Fix #1 — Add LLM cost tracking to data model + update §22 (Sections 13 + 22)

  **What to do**:
  Two changes — one in §13 (data model) and one in §22 (LLM Gateway):

  **In Section 13 (Data Model)**, add columns to the EXECUTION entity (lines 1383-1391):
  - `int prompt_tokens` — Total prompt tokens across all LLM calls in this execution
  - `int completion_tokens` — Total completion tokens across all LLM calls in this execution
  - `string primary_model_id` — The primary model used (e.g., "anthropic/claude-sonnet-4")
  - `numeric estimated_cost_usd` — Estimated total LLM cost for this execution
  - These are SUMMARY fields per execution, not per-call. The `callLLM()` wrapper accumulates counts in memory during the session and writes totals to EXECUTION on completion.

  **In Section 22 (LLM Gateway)**, two sub-changes:
  1. **Update the "Cost Tracking" subsection** (lines 2075-2079): Replace the statement "No additional database table is needed — OpenRouter handles the tracking for all API calls" with:
     "LLM cost data is tracked at two levels: per-execution via the `prompt_tokens`, `completion_tokens`, and `estimated_cost_usd` columns on the EXECUTION table (populated by the `callLLM()` wrapper on execution completion), and in aggregate via the OpenRouter Dashboard. The per-execution columns enable the cost circuit breaker (Section 22.1), per-task cost analysis, and feedback loop optimization. The OpenRouter Dashboard provides model-level cost breakdowns for monthly budgeting."
  2. **In the "Cost Circuit Breaker" subsection** (lines 2142-2153), add a note explaining how the circuit breaker reads the data: "The circuit breaker queries `SELECT SUM(estimated_cost_usd) FROM executions WHERE department_id = $dept AND created_at > NOW() - INTERVAL '1 day'` to check cumulative daily spend."

  **Must NOT do**:
  - Add a new LLM_CALL entity/table (columns on EXECUTION are sufficient for MVP)
  - Modify the ER diagram relationships (only the EXECUTION entity block changes)
  - Alter the cost circuit breaker threshold or behavior — only document how it reads data
  - Remove the OpenRouter Dashboard reference (it's still useful for aggregate views)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 — runs first
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1383-1391` — EXECUTION entity definition (add columns here)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2075-2079` — "Cost Tracking" subsection to update (currently says "no additional table needed")
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2142-2153` — Cost Circuit Breaker subsection

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: EXECUTION entity has cost tracking columns
    Tool: Bash (grep)
    Steps:
      1. grep -n "prompt_tokens\|completion_tokens\|estimated_cost_usd\|primary_model_id" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥4 matches in §13 EXECUTION entity block
    Expected Result: All 4 cost tracking columns present in EXECUTION entity
    Evidence: .sisyphus/evidence/task-10-execution-columns.txt

  Scenario: §22 "no additional table" statement updated
    Tool: Bash (grep)
    Steps:
      1. grep "No additional database table is needed" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert 0 matches (statement replaced)
      3. grep "per-execution\|prompt_tokens.*completion_tokens\|callLLM.*wrapper" docs/2026-03-22-2317-ai-employee-architecture.md
      4. Assert ≥1 match in §22 range
    Expected Result: Old statement removed, new cost tracking description present
    Failure Indicators: Old "no additional table" statement still present (contradiction with §13)
    Evidence: .sisyphus/evidence/task-10-no-contradiction.txt

  Scenario: Circuit breaker references the query mechanism
    Tool: Bash (grep)
    Steps:
      1. grep -n "SUM.*estimated_cost\|circuit.*breaker.*query\|daily spend" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert match in §22.1 area
    Expected Result: Circuit breaker section explains how it reads per-execution cost data
    Evidence: .sisyphus/evidence/task-10-circuit-breaker-query.txt
  ```

  **Commit**: YES (groups with Task 11)
  - Message: `docs(architecture): add LLM cost tracking to data model and callLLM interface contract`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 11. Fix #11 — Add callLLM() interface contract (Section 22)

  **What to do**:
  - In Section 22, after the "MVP Scope" callout (line ~2036), add a "Interface Contract" subsection with the `callLLM()` function specification (~20-25 lines):

    ```typescript
    interface CallLLMOptions {
      model: string;            // OpenRouter model ID (e.g., "anthropic/claude-sonnet-4")
      messages: Message[];      // Standard chat messages array
      taskType: string;         // "triage" | "execution" | "review" — drives model selection defaults
      taskId?: string;          // For cost tracking — associates LLM usage with a task
      temperature?: number;     // Default: 0 for code, 0.3 for analysis
      maxTokens?: number;       // Default: model-dependent
      timeoutMs?: number;       // Default: 120_000 (2 minutes)
    }

    interface CallLLMResult {
      content: string;          // The model's response text
      model: string;            // Actual model used (may differ from requested if fallback triggered)
      promptTokens: number;     // From OpenRouter response.usage.prompt_tokens
      completionTokens: number; // From OpenRouter response.usage.completion_tokens
      estimatedCostUsd: number; // Calculated from token counts × model pricing
      latencyMs: number;        // Wall-clock time for the LLM call
    }
    ```

  - Add behavior notes:
    - **Error handling**: On 429 (rate limit), retry with exponential backoff (3 attempts). On 5xx, fall through to next model in fallback chain (Section 22 Fallback Chain). On timeout, throw `LLMTimeoutError`.
    - **Cost accumulation**: Each call's token counts are accumulated in memory. On execution completion, totals are written to the EXECUTION table's `prompt_tokens`, `completion_tokens`, and `estimated_cost_usd` columns.
    - **Circuit breaker check**: Before each call, check cumulative daily spend. If over threshold, throw `CostCircuitBreakerError` (Section 22.1).

  **Must NOT do**:
  - Add a new Mermaid diagram
  - Rewrite the existing §22 prose about OpenRouter or the fallback chain
  - Specify implementation details beyond the interface (no class structure, no module layout)
  - Add more than ~25-30 lines total

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 — runs after Task 10
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10 (§22 cost tracking updates must be in place)

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2034-2154` — Section 22 (LLM Gateway Design)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2036` — MVP Scope callout (add interface after this)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2063-2073` — Fallback Chain (referenced by error handling behavior)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2142-2153` — Cost Circuit Breaker (referenced by circuit breaker check)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: callLLM interface contract present
    Tool: Bash (grep)
    Steps:
      1. grep -n "CallLLMOptions\|CallLLMResult\|interface.*callLLM\|Interface Contract" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥2 matches in §22 line range
    Expected Result: Both request and response interfaces defined
    Evidence: .sisyphus/evidence/task-11-interface-contract.txt

  Scenario: Error handling behavior documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "LLMTimeoutError\|CostCircuitBreakerError\|429.*retry\|fallback.*chain" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥2 matches near the interface contract
    Expected Result: Error handling specifies retry, fallback, and timeout behavior
    Evidence: .sisyphus/evidence/task-11-error-handling.txt

  Scenario: Cost accumulation behavior documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "accumulate\|execution completion\|prompt_tokens.*completion_tokens" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert ≥1 match linking callLLM to EXECUTION table columns
    Expected Result: Clear connection between per-call tracking and EXECUTION table
    Evidence: .sisyphus/evidence/task-11-cost-accumulation.txt
  ```

  **Commit**: YES (groups with Task 10)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan. For each of the 11 fixes: verify the change exists in the document via grep. For each "Must NOT Have" guardrail: search for forbidden patterns. Check evidence files exist.
  Output: `Fixes Applied [11/11] | Guardrails [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Content Quality + Contradiction Check** — `unspecified-high`
  Read Sections 2, 6.2, 8, 9.2, 10, 13, 17, 22 end-to-end. Verify no internal contradictions (especially §22 cost tracking statement vs. new EXECUTION columns). Verify all cross-references are valid. Check that new content matches the document's existing voice and technical depth.
  Output: `Contradictions [CLEAN/N found] | Cross-refs [N/N valid] | Voice [CONSISTENT/DRIFTED] | VERDICT`

- [x] F3. **Mermaid Diagram Validation** — `unspecified-high`
  Extract all Mermaid blocks from the document. Verify each renders without syntax errors. Special attention to: §2 MVP diagram (GitHub webhook removed), §13 ER diagram (project_id added to TASK). Verify no formatting changes to untouched diagrams.
  Output: `Diagrams [N/N valid] | Modified [N diagrams] | Untouched [CLEAN] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each of the 11 tasks: verify ONLY the specified change was made. Check git diff for unaccounted modifications. Flag any content that was changed but not in the plan scope. Verify §6.2 collapse preserved only intended sentences.
  Output: `Fixes [11/11 scoped] | Unaccounted changes [CLEAN/N found] | VERDICT`

---

## Commit Strategy

| Commit | Fixes | Message | Files |
|---|---|---|---|
| 1 | Tasks 1-4 | `docs(architecture): add project_id FK, remove MVP GH webhook, add MVP cost note, collapse marketing section` | `docs/2026-03-22-2317-ai-employee-architecture.md` |
| 2 | Tasks 5-6 | `docs(architecture): add gateway retry spec and webhook routing table` | `docs/2026-03-22-2317-ai-employee-architecture.md` |
| 3 | Tasks 7-9 | `docs(architecture): document dispatch mechanism, waitForEvent mitigation, MVP lifecycle pseudo-code` | `docs/2026-03-22-2317-ai-employee-architecture.md` |
| 4 | Tasks 10-11 | `docs(architecture): add LLM cost tracking to data model and callLLM interface contract` | `docs/2026-03-22-2317-ai-employee-architecture.md` |

---

## Success Criteria

### Verification Commands
```bash
# All fixes present
grep -n "project_id" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥2 matches (ER + entity)
grep -n "token_count\|prompt_tokens\|completion_tokens\|estimated_cost" docs/2026-03-22-2317-ai-employee-architecture.md  # matches in §13 + §22
grep -n "TASK_ID.*REPO_URL\|env.*var.*machine\|fly machine run" docs/2026-03-22-2317-ai-employee-architecture.md  # match in §9.2 or §10
grep -n "race condition\|Supabase first\|check before.*waitForEvent" docs/2026-03-22-2317-ai-employee-architecture.md  # match in §10
grep -n "exponential.*backoff\|retry.*attempt\|1s.*2s.*4s" docs/2026-03-22-2317-ai-employee-architecture.md  # match in §8
grep -n "issue_created\|issue_updated\|routing" docs/2026-03-22-2317-ai-employee-architecture.md  # routing table in §8
grep -n "callLLM\|taskType\|interface.*LLM\|function.*signature" docs/2026-03-22-2317-ai-employee-architecture.md  # interface in §22
grep -c "GH.*webhook.*GW" docs/2026-03-22-2317-ai-employee-architecture.md  # 0 (removed from MVP diagram)
awk '/### 6.2/,/### 6.3/' docs/2026-03-22-2317-ai-employee-architecture.md | wc -l  # 15-25 lines
wc -l docs/2026-03-22-2317-ai-employee-architecture.md  # 2400-2600 range
```

### Final Checklist
- [ ] All 11 fixes applied
- [ ] No internal contradictions (§22 cost tracking statement updated)
- [ ] All Mermaid diagrams render correctly
- [ ] §6.2 collapsed to ~15-20 lines
- [ ] GitHub webhook removed from MVP diagram
- [ ] Document reads as coherent whole (no patchwork feel)
