# Architecture Document Update — Review Findings Implementation

## TL;DR

> **Quick Summary**: Update the 2,376-line architecture document to reflect decisions from a comprehensive architecture review — redefine MVP scope (remove Review Agent), add Inngest SPOF mitigations, clarify fix loop semantics, fill data model gaps, and add operational concerns.
>
> **Deliverables**:
> - Updated `docs/2026-03-22-2317-ai-employee-architecture.md` with all 10 accepted findings incorporated
> - MVP cleanly scoped to Event Gateway + Execution Agent only
> - All deferred items properly documented in post-MVP sections
> - Internal consistency verified across all 28 sections
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (MVP scope) → Task 3 (archetype) → remaining tasks (parallel)

---

## Context

### Original Request
Update the architecture document to reflect decisions from a comprehensive review conducted with 4 research agents (nexus-stack code analysis, Inngest capability verification, OpenCode SDK verification, Oracle architecture critique). 12 findings were identified; 10 accepted, 2 rejected (cost model and boot time).

### Interview Summary
**Key Discussions**:
- MVP scope too large → Redefine as M1+M3 only (no Review Agent, no risk scoring, no auto-merge)
- Review Agent completely removed from MVP (not downgraded — removed)
- Inngest is SPOF → Add payload-first pattern + document CLI dispatch script
- Archetype Registry premature → Hardcode engineering, extract after Marketing
- Fix loop must re-run all subsequent stages + needs global iteration cap
- 5 operational concerns need documenting (gateway health, partial failure, connection pooling, secret rotation, auth plugin reference)
- Data model has gaps (projects concept, undefined entities)
- Cost model stays as-is (20 tasks/day is realistic for user)
- Boot time verification skipped for MVP

**Research Findings**:
- Inngest `waitForEvent()` has race condition for human approvals — only catches events AFTER step executes
- `@ex-machina/opencode-anthropic-auth` package doesn't exist — actual implementation is `sync-token.sh`
- OpenCode SDK tools are global, not per-session — mitigated by machine isolation
- Inngest has 4MB step payload / 32MB function state limits
- Inngest has no public SLA for free/pro tiers

### Metis Review
**Identified Gaps** (addressed):
- Review Agent removal affects 8+ sections — must update atomically
- Fix loop direction ambiguity (failing-stage-forward vs always-from-TypeScript) — resolved: failing-stage-forward
- `waitForSignal` is not a real Inngest API — resolved: document correct pattern (`waitForEvent` with pre-check)
- Archetype Registry removal depth — resolved: keep concept, add MVP scope note
- `projects` table fields undefined — resolved: define based on document context
- Global iteration cap number undefined — resolved: default to 10 total, keep 3 per-stage

---

## Work Objectives

### Core Objective
Make the architecture document internally consistent with the revised MVP scope and incorporate all accepted review findings, ensuring every deferred item has a clear post-MVP home.

### Concrete Deliverables
- Updated `docs/2026-03-22-2317-ai-employee-architecture.md`

### Definition of Done
- [ ] MVP scope table (Section 2) reflects M1+M3 only
- [ ] MVP architecture diagram has no Review Agent node
- [ ] Section 9.3 (Review Agent) marked as post-MVP with `> **MVP Scope**` callout
- [ ] Fix loop semantics clarified in both Section 4 and Section 9.2
- [ ] Data model includes projects concept and all missing entity definitions
- [ ] Inngest SPOF mitigation documented in Section 8 and Section 26
- [ ] All 5 operational concerns addressed
- [ ] No section references a concept that's removed from MVP without noting it's post-MVP
- [ ] `@ex-machina/opencode-anthropic-auth` reference corrected to `sync-token.sh`
- [ ] Inngest payload limits documented

### Must Have
- Internal consistency: every section that references Review Agent, auto-merge, or risk scoring must note these are post-MVP
- Foundation-ready: MVP sections must be written so post-MVP features can be added without rewriting
- Deferred items must have clear "when to add" triggers

### Must NOT Have (Guardrails)
- **No new `##` top-level sections** — all additions are `###` or `####` subsections
- **No Table of Contents changes** — section headers stay the same
- **No invented numbers** — iteration caps, payload limits, thresholds must come from user decisions or verified sources
- **No changes to Sections 5, 6.2–6.5, 7, 10.1, 10.2, 12, 15, 20, 21, 22, 23, 24, 25, 28** unless a specific decision explicitly requires it
- **No voice changes** — match the document's existing direct, opinionated, solo-developer voice
- **No reference to `step.waitForSignal()`** — this API doesn't exist in Inngest
- **No restructuring of existing runbooks** (Section 27) — additions only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (documentation update)
- **Automated tests**: None
- **Framework**: N/A

### QA Policy
Every task MUST include agent-executed QA scenarios using grep and diff to verify changes.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Documentation updates**: Use Bash (grep) — search for key phrases, verify line counts, check cross-references
- **Diagram updates**: Use Bash (grep) — count nodes, verify walkthrough step count matches edges

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundational scope changes):
├── Task 1: Redefine MVP scope — Section 2 table + diagram + all MVP callouts [deep]
├── Task 2: Fill data model gaps — Section 13 entity definitions [quick]

Wave 2 (After Wave 1 — section-specific updates, MAX PARALLEL):
├── Task 3: Hardcode archetype — Section 3.2 + Section 19 [quick]
├── Task 4: Fix loop clarification — Section 4 + Section 9.2 + diagram [quick]
├── Task 5: Inngest SPOF mitigation — Section 8 + Section 26 + Section 27 [unspecified-low]
├── Task 6: Operational concerns — Section 9.2 + Section 14 + Section 18 + Section 27 [unspecified-low]
├── Task 7: Fix auth plugin reference + Inngest limits — Section 22 + Section 14 [quick]

Wave 3 (After Wave 2 — final integration):
├── Task 8: Cross-reference consistency audit [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Document quality review (unspecified-high)
├── Task F3: Cross-reference verification (deep)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|---|---|---|---|
| 1 (MVP scope) | — | 3, 4, 5, 6, 7, 8 | 1 |
| 2 (Data model) | — | 8 | 1 |
| 3 (Archetype) | 1 | 8 | 2 |
| 4 (Fix loop) | 1 | 8 | 2 |
| 5 (Inngest SPOF) | 1 | 8 | 2 |
| 6 (Operational) | 1 | 8 | 2 |
| 7 (Auth + limits) | 1 | 8 | 2 |
| 8 (Audit) | 2, 3, 4, 5, 6, 7 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `deep`, T2 → `quick`
- **Wave 2**: **5** — T3 → `quick`, T4 → `quick`, T5 → `unspecified-low`, T6 → `unspecified-low`, T7 → `quick`
- **Wave 3**: **1** — T8 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `deep`, F4 → `deep`

---

## TODOs

- [x] 1. Redefine MVP Scope — Remove Review Agent, Narrow to M1+M3

  **What to do**:
  - Update **Section 2 MVP Scope Summary table** (lines 192–203): Change the "Review Agent" row to show "Deferred — human reviews PRs manually" in the MVP column. Move current MVP description to post-MVP column.
  - Update **Section 2 MVP Architecture diagram** (lines 148–184): Remove the `REV["Review Agent"]` node and its edges (`ING ==>|"trigger"| REV`, `REV -->|"state"| SUP`, `REV -.->|"notify"| SLACK`, `REV -->|"inference"| LLM`). The diagram should show: External → Gateway → Inngest → Execution Agent → GitHub (PR created). Add a note under the diagram: the execution agent creates PRs which are reviewed manually by the developer.
  - Update **Section 2 "What's not in the MVP"** paragraph (line 186): Add "the review agent (deferred — PRs are reviewed manually)" to the list alongside the triage agent.
  - Update **Section 9.3 Review Agent** (lines 929–994): Add a `> **MVP Scope**` callout at the top: "The review agent is deferred for MVP. In MVP, the execution agent creates PRs which are reviewed manually by the developer. The full review agent described below will be built when execution agent output quality is proven and manual review becomes a bottleneck. See Section 28 for the deferral rationale."
  - Update **Section 11 Full Lifecycle Sequence** (lines 1116–1209): Add a `> **Note**` callout noting that steps 23–29 (review agent steps) are post-MVP. In MVP, the lifecycle ends at step 20 (PR created + task status updated to Submitting) and the developer reviews manually.
  - Update **Section 16 Implementation Roadmap** (lines 1623–1714): Clarify that MVP = M1+M3. M4 (Review Agent) remains in the roadmap but is explicitly post-MVP. Add a sentence to M3's description: "M3 completes the MVP — the platform creates PRs from Jira tickets. Human review is the approval gate until M4."
  - Update **Section 17 Cost Estimation** (lines 1717–1770): Remove the "Review Agent" row from the per-task cost table (lines 1741). Update the "Total per engineering task" range to exclude review agent costs. Keep the review cost row in a "Post-MVP additions" note.
  - Update **Section 18 Risk Mitigation** (line 1800): The "Auto-merged PR introduces regression" risk row depends on the review agent. Change this to "Post-MVP risk (requires Review Agent)" and add an MVP-specific risk: "AI-generated PR contains bugs" with mitigation "Human reviews all PRs in MVP; fix loop + escalation reduce defect rate."

  **Must NOT do**:
  - Do not remove Section 9.3 entirely — keep it as the post-MVP design spec
  - Do not remove M4 from the roadmap — it's the plan for after MVP
  - Do not change the Section 4 state machine — the states are universal; only the agent executing them changes
  - Do not touch the Section 11 sequence diagram Mermaid code — only add a note callout above it

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Touches 8 sections with interdependent cross-references; requires careful reading of existing text to preserve voice and ensure consistency
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5, 6, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:186` — Current "What's not in the MVP" paragraph — follow this pattern for adding review agent to the deferred list
  - `docs/2026-03-22-2317-ai-employee-architecture.md:786-788` — Section 9.1 Triage Agent MVP callout — follow this exact `> **MVP Scope**` pattern for Section 9.3

  **Cross-reference targets** (must verify after edit):
  - Section 2: lines 148-203 (diagram + table + "what's not" paragraph)
  - Section 8: line 759 (mentions "Launch review session" — add note this is post-MVP)
  - Section 9.3: lines 929-994 (add MVP callout)
  - Section 10: lines 1048-1049 (review worker scaling — note post-MVP)
  - Section 11: lines 1116-1209 (add note above sequence diagram)
  - Section 16: lines 1623-1714 (clarify MVP = M1+M3)
  - Section 17: lines 1717-1770 (update cost table)
  - Section 18: line 1800 (update risk row)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: MVP scope table no longer lists Review Agent as MVP
    Tool: Bash (grep)
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: grep -n "Review Agent" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify every match is in a post-MVP context (contains "deferred", "post-MVP", "M4", "future", or "Phase")
      3. Run: grep -n "REV\[" docs/2026-03-22-2317-ai-employee-architecture.md
      4. Verify the REV node is NOT in the MVP Architecture diagram (lines 148-184) but MAY still exist in the full architecture diagram
    Expected Result: Zero Review Agent references in MVP-active context
    Failure Indicators: Any line containing "Review Agent" without a post-MVP qualifier between lines 148-203
    Evidence: .sisyphus/evidence/task-1-mvp-scope-grep.txt

  Scenario: MVP Architecture diagram has no review agent node
    Tool: Bash (grep)
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: sed -n '148,184p' docs/2026-03-22-2317-ai-employee-architecture.md
      2. Count nodes in the Mermaid diagram — should be: JIRA, GH, SLACK, GW, ING, SUP, EXEC, LLM (8 nodes)
      3. Verify no "REV" node exists in this specific diagram block
    Expected Result: MVP diagram has exactly 8 nodes, no REV
    Failure Indicators: "REV" appears in the MVP diagram; node count != 8
    Evidence: .sisyphus/evidence/task-1-mvp-diagram.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): redefine MVP scope — remove review agent, narrow to M1+M3`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep verification per QA scenarios

- [x] 2. Fill Data Model Gaps — Section 13

  **What to do**:
  - Add **`PROJECT`** entity to the ER diagram and entity definitions (Section 13, lines 1335–1440). A project represents a GitHub repository that the engineering department operates on. Fields: `uuid id PK`, `uuid department_id FK`, `string name`, `string repo_url`, `string default_branch`, `int concurrency_limit`, `json tooling_config`, `uuid tenant_id`. Add relationship: `DEPARTMENT ||--o{ PROJECT : manages` and `PROJECT ||--o{ TASK : generates`.
  - Add **`VALIDATION_RUN`** entity definition. Currently referenced in ER diagram (line 1343: `EXECUTION ||--o{ VALIDATION_RUN : produces`) but never defined. Fields: `uuid id PK`, `uuid execution_id FK`, `string stage` (typescript/lint/unit/integration/e2e), `string status` (passed/failed), `int iteration`, `text error_output`, `int duration_ms`, `timestamptz created_at`.
  - Add **`REVIEW`** entity definition. Currently referenced in ER diagram (line 1345: `DELIVERABLE ||--o{ REVIEW : receives`) but never defined. Fields: `uuid id PK`, `uuid deliverable_id FK`, `string reviewer_type` (ai/human), `uuid agent_version_id FK`, `int risk_score`, `string verdict` (approved/changes_requested/rejected), `text comments`, `timestamptz created_at`.
  - Add **`CLARIFICATION`** entity definition. Currently referenced in ER diagram (line 1341: `TASK ||--o{ CLARIFICATION : requires`) but never defined. Fields: `uuid id PK`, `uuid task_id FK`, `text question`, `text answer`, `string source_system` (jira/slack), `string external_ref`, `timestamptz asked_at`, `timestamptz answered_at`.
  - Clarify **`EXECUTION.runtime_id`**: Add a comment in the entity definition: `string runtime_id -- Fly.io machine ID for OpenCode tasks; Inngest function run ID for Inngest tasks`.

  **Must NOT do**:
  - Do not change existing entity definitions — only add new ones and clarify runtime_id
  - Do not add index definitions (out of scope)
  - Do not change ER diagram relationships that already exist

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single section, well-defined additions, no cross-reference concerns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1350-1439` — Existing entity definitions (DEPARTMENT, ARCHETYPE, TASK, EXECUTION, etc.) — follow this exact format for new entities
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1335-1348` — ER diagram relationships — add PROJECT relationships here

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 missing entities are now defined
    Tool: Bash (grep)
    Preconditions: Task 2 edits applied
    Steps:
      1. Run: grep -n "VALIDATION_RUN {" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Run: grep -n "REVIEW {" docs/2026-03-22-2317-ai-employee-architecture.md
      3. Run: grep -n "CLARIFICATION {" docs/2026-03-22-2317-ai-employee-architecture.md
      4. Run: grep -n "PROJECT {" docs/2026-03-22-2317-ai-employee-architecture.md
      5. Verify each returns exactly one match in the Section 13 entity definitions block
    Expected Result: 4 matches, all within lines 1335-1500 (approximately)
    Failure Indicators: Any entity missing or defined outside Section 13
    Evidence: .sisyphus/evidence/task-2-data-model.txt

  Scenario: runtime_id clarification is present
    Tool: Bash (grep)
    Preconditions: Task 2 edits applied
    Steps:
      1. Run: grep -n "runtime_id" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least one match contains "Fly.io machine ID" or similar clarification
    Expected Result: runtime_id has an inline comment explaining its purpose
    Failure Indicators: runtime_id exists but has no clarifying comment
    Evidence: .sisyphus/evidence/task-2-runtime-id.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): fill data model gaps — add projects, validation_run, review, clarification entities`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep verification per QA scenarios

- [x] 3. Simplify Archetype to Hardcoded Engineering Config for MVP

  **What to do**:
  - Update **Section 3.2 Archetype Composition** (lines 258–307): Add a `> **MVP Scope**` callout at the top: "For MVP, the engineering archetype is a hardcoded configuration object, not a dynamic registry. The Archetype Registry pattern described below is the target architecture for when the second department (Paid Marketing) is onboarded. At that point, the common pattern will be extracted from two concrete implementations rather than designed speculatively."
  - Update **Section 3.2 text** (line 307): After "The Archetype Registry is a simple in-memory map at startup", add: "In MVP, this is a single exported config object (`engineeringArchetype`). The registry pattern activates when the second department validates that the schema generalizes."
  - Update **Section 19 Onboarding Checklist** (line 1808): Step 1 currently says "register it in the Archetype Registry." Change to: "Define the archetype config object. (MVP: hardcoded. Post-MVP: register in the Archetype Registry once the pattern is validated by two departments.)"

  **Must NOT do**:
  - Do not remove Section 3 or its diagrams — the archetype concept is the target architecture
  - Do not remove the Archetype Registry from the composition diagram — it represents the target state
  - Do not rewrite Section 3.3 (Why Archetypes Matter) — the rationale still holds for the platform vision

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Three small text insertions in three locations — straightforward additions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:786-788` — Section 9.1 Triage Agent MVP callout — follow this exact `> **MVP Scope**` pattern
  - `docs/2026-03-22-2317-ai-employee-architecture.md:258-307` — Current Section 3.2 text to be augmented

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype MVP scope note exists in Section 3.2
    Tool: Bash (grep)
    Preconditions: Task 3 edits applied
    Steps:
      1. Run: grep -n "hardcoded\|single exported config" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least one match is in the Section 3.2 area (lines 258-310)
    Expected Result: MVP scope note present in Section 3.2
    Failure Indicators: No "hardcoded" or "single exported config" text in Section 3.2
    Evidence: .sisyphus/evidence/task-3-archetype.txt

  Scenario: Onboarding checklist updated
    Tool: Bash (grep)
    Preconditions: Task 3 edits applied
    Steps:
      1. Run: grep -n "Archetype Registry" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify the Section 19 mention (around line 1808) now includes a parenthetical about MVP hardcoded vs post-MVP registry
    Expected Result: Onboarding checklist step 1 has MVP/post-MVP distinction
    Failure Indicators: Section 19 still says only "register it in the Archetype Registry" without qualification
    Evidence: .sisyphus/evidence/task-3-onboarding.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): simplify archetype to hardcoded engineering config for MVP`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep verification per QA scenarios

- [x] 4. Fix Loop Clarification — Section 4 + Section 9.2

  **What to do**:
  - Update **Section 4 fix loop note** (line 378): Change from "the execution agent re-enters at the **failing validation stage**, not from the beginning of code generation" to: "the execution agent re-enters at the **failing validation stage** and re-runs all subsequent stages from that point forward. A lint fix re-enters at lint and then continues through unit → integration → E2E. This catches cascading failures where fixing one stage inadvertently breaks a later stage. Maximum 3 fix iterations per individual stage; maximum 10 fix iterations total across all stages before escalating to human."
  - Update **Section 9.2 fix loop text** (line 908): Update to match the same semantics: "When a stage fails, the agent diagnoses the specific error, applies a fix, and re-runs the pipeline from the failing stage forward through all remaining stages. A TypeScript fix re-runs TypeScript → lint → unit → integration → E2E. A lint fix re-runs lint → unit → integration → E2E. This stage-forward approach catches cascading failures. Maximum 3 fix iterations per stage, 10 total across all stages, before escalating to human."
  - Update **Section 9.2 diagram** (lines 848–885): The diagram currently shows `FIX -->|"11. Re-enter at failing stage"| TYPECHECK`. This is actually correct for the "re-run from failing stage forward" behavior since the pipeline is linear (TYPECHECK is the first stage — re-entering there re-runs everything). Update the edge label from `"11. Re-enter at failing stage"` to `"11. Re-enter at failing stage, run all subsequent"` and add a note in the walkthrough that the diagram shows the worst case (re-entry at TypeScript) but re-entry can happen at any stage.
  - Update **Section 9.2 escalation text** (line 910): Add after "Maximum 3 failed fix iterations on any stage": "The platform also enforces a global cap of 10 fix iterations across all stages. If the total fix count reaches 10 before any individual stage hits 3, the task escalates immediately. This prevents a scenario where the agent cycles through many stages without converging."

  **Must NOT do**:
  - Do not add new states to the state machine diagram (Section 4)
  - Do not restructure the validation pipeline order (TypeScript → lint → unit → integration → E2E)
  - Do not change the Mermaid node layout — only update edge labels and walkthrough text

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted text updates in 2 sections, no structural changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 5, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:376-379` — Section 4 fix loop note (update this)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:906-910` — Section 9.2 fix loop text (update this)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:848-885` — Section 9.2 Mermaid diagram (update edge label)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fix loop clarification present in both sections
    Tool: Bash (grep)
    Preconditions: Task 4 edits applied
    Steps:
      1. Run: grep -n "all subsequent stages\|stage-forward\|run all subsequent" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least 2 matches — one in Section 4 area (lines 376-380) and one in Section 9.2 area (lines 906-912)
    Expected Result: Both sections clarified with "re-run all subsequent stages" language
    Failure Indicators: Fewer than 2 matches; only one section updated
    Evidence: .sisyphus/evidence/task-4-fix-loop.txt

  Scenario: Global iteration cap documented
    Tool: Bash (grep)
    Preconditions: Task 4 edits applied
    Steps:
      1. Run: grep -n "10 fix iterations\|10 total\|global cap" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least one match in Section 9.2 area
    Expected Result: Global cap of 10 documented
    Failure Indicators: No mention of global iteration cap
    Evidence: .sisyphus/evidence/task-4-global-cap.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): clarify fix loop — re-run all stages from fix point, add global cap`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep verification per QA scenarios

- [x] 5. Document Inngest SPOF Mitigation

  **What to do**:
  - Update **Section 8 (Engineering Department — System Context)** MVP Scope callout (lines 697–701): After the existing 3 reasons the Event Gateway exists, add a 4th bullet: "4. **Inngest failure recovery** (SPOF mitigation): The Event Gateway writes the full normalized payload to `tasks.raw_event` (JSONB) before sending to Inngest. If Inngest loses the event or has an outage, the payload is recoverable from Supabase. A CLI dispatch script (`dispatch-task.ts`) can read tasks in `Received` state and re-send events to Inngest for manual recovery."
  - Update **Section 13 Data Model** TASK entity (lines 1368-1378): Add `json raw_event` field to the TASK entity definition with comment: `json raw_event -- Full normalized webhook payload, stored before Inngest send for SPOF recovery`.
  - Update **Section 26 Disaster Recovery** Inngest outage row (line 2218): Change recovery from "Exponential backoff on webhook receipt; events re-send when Inngest recovers" to: "Events are stored in `tasks.raw_event` before Inngest send. On recovery: Inngest retries with exponential backoff automatically. For extended outages: run `dispatch-task.ts` CLI to re-send events from Supabase for tasks stuck in `Received` state."
  - Add to **Section 27 Incident Runbook** (around line 2290): Add a new row to the incident table: `| Inngest outage (> 30 min) | Events not appearing in Inngest Dashboard; tasks stuck in Received | Run: npx dispatch-task.ts --status received --since 1h — re-sends events from Supabase. Inngest will dedup by event ID. |`

  **Must NOT do**:
  - Do not implement the CLI script — only document its interface and purpose
  - Do not restructure Section 26 or Section 27 — only add targeted content
  - Do not add a new top-level section — all content goes in existing sections

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Additions to 4 sections, all straightforward text insertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:697-701` — Section 8 MVP Scope callout with 3 numbered reasons (add 4th)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2215-2221` — Section 26 failure table format (follow this pattern)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2290-2297` — Section 27 incident table format (follow this pattern)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: SPOF mitigation documented in Section 8
    Tool: Bash (grep)
    Preconditions: Task 5 edits applied
    Steps:
      1. Run: grep -n "raw_event\|SPOF\|dispatch-task\|failure recovery" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least one match in Section 8 area (lines 695-710)
    Expected Result: SPOF mitigation documented as 4th reason for Event Gateway
    Failure Indicators: No SPOF-related text in Section 8
    Evidence: .sisyphus/evidence/task-5-spof.txt

  Scenario: raw_event field added to TASK entity
    Tool: Bash (grep)
    Preconditions: Task 5 edits applied
    Steps:
      1. Run: grep -n "raw_event" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify a match exists in the Section 13 TASK entity definition
    Expected Result: raw_event field present in TASK entity
    Failure Indicators: No raw_event in Section 13
    Evidence: .sisyphus/evidence/task-5-raw-event.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): document inngest SPOF mitigation — payload-first + CLI dispatch`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep verification per QA scenarios

- [x] 6. Add Operational Concerns — Gateway Health, Partial Failure, Connection Pooling, Secret Rotation

  **What to do**:
  - Add to **Section 18 Risk Mitigation — Engineering-Specific Risks** (after line 1801): Add 4 new rows to the risk table:
    - `| Event Gateway downtime | Fly.io health checks on /health endpoint + uptime monitoring (e.g., Fly.io built-in checks). Gateway is a single Fastify process — if it crashes, Fly.io restarts it automatically. |`
    - `| Fly.io machine crash after branch creation but before PR | Re-dispatch creates idempotent branch checkout: entrypoint.sh checks if branch exists, reuses it. Git push --force-with-lease on re-dispatch prevents stale overwrites. |`
    - `| Supabase connection pool exhaustion | Expected connections: 3 Fly.io machines + 1 gateway + Inngest functions ≈ 10-15 concurrent connections. Supabase Pro provides 60 direct connections. Enable Supavisor (Supabase connection pooler) if concurrent machines exceed 10. |`
    - `| Secret expires during long-running execution | GitHub tokens (90-day expiry) are unlikely to expire mid-task (max 90 min). If auth fails at PR creation, the execution agent retries once with a fresh token from Fly.io Secrets. Claude Max OAuth tokens are refreshed via sync-token.sh before each dispatch. |`
  - Add a **`/health` endpoint note** to Section 27 Deployment Runbook (after line 2256): "The Event Gateway exposes a `GET /health` endpoint that returns 200 when the server is ready to accept webhooks. Fly.io's built-in health checks use this to detect and restart crashed instances."

  **Must NOT do**:
  - Do not restructure Section 18 tables — only add new rows
  - Do not add new sections — all content goes in existing subsections
  - Do not change existing risk mitigations

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Table row additions and a small text insertion — straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4, 5, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1793-1801` — Existing Engineering-Specific Risks table format (follow this pattern)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2245-2262` — Section 27 Deployment Runbook format (add health endpoint note here)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 operational risks documented
    Tool: Bash (grep)
    Preconditions: Task 6 edits applied
    Steps:
      1. Run: grep -n "Gateway downtime\|branch creation\|connection pool\|Secret expires" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify 4 matches, all in Section 18 area (lines 1793-1810)
    Expected Result: 4 new risk rows present
    Failure Indicators: Fewer than 4 matches
    Evidence: .sisyphus/evidence/task-6-operational.txt

  Scenario: Health endpoint documented in deployment runbook
    Tool: Bash (grep)
    Preconditions: Task 6 edits applied
    Steps:
      1. Run: grep -n "/health" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least one match in Section 27 area
    Expected Result: /health endpoint mentioned in deployment runbook
    Failure Indicators: No /health mention in Section 27
    Evidence: .sisyphus/evidence/task-6-health.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): add operational concerns — gateway health, partial failure, pooling, secrets`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep verification per QA scenarios

- [x] 7. Fix Auth Plugin Reference + Document Inngest Payload Limits

  **What to do**:
  - Fix **Section 22 LLM Gateway Design** (line 1993): Replace `@ex-machina/opencode-anthropic-auth` with the correct reference. The actual implementation is `sync-token.sh` — a shell script that reads OAuth tokens from `~/.local/share/opencode/auth.json`, checks expiry, refreshes via `opencode auth login` if expired, and pushes updated tokens to Fly.io Secrets. Update the text to: "The nexus-stack's `sync-token.sh` script manages the Claude Max OAuth token lifecycle — reading tokens from OpenCode's local auth store, checking expiry, refreshing via `opencode auth login`, and pushing to Fly.io Secrets. The `entrypoint.sh` boot script writes these tokens into the Fly.io machine's auth store at startup."
  - Fix the second reference to the plugin at **line 2071** in the LLM Gateway Architecture Diagram walkthrough: Replace "`@ex-machina/opencode-anthropic-auth` OAuth token" with "`sync-token.sh` OAuth token management".
  - Add **Inngest execution limits** to Section 14 (Platform Shared Infrastructure), after the Runtime Selection table (around line 1548). Add a new `####` subsection: "#### Inngest Execution Limits" with a table documenting the limits that affect this platform:

    | Limit | Value | Platform Impact |
    |---|---|---|
    | Max step payload | 4 MB | PR diffs passed through steps must be references (PR URL), not full payloads |
    | Max function state | 32 MB | Total state across all steps + event data; monitor for complex multi-step lifecycles |
    | Max steps per function | 1,000 | Not a concern for the task lifecycle (~10-15 steps); watch for unbounded loops |
    | Max event payload | 256 KB (free) / 3 MB (pro) | Jira webhook payloads are typically 5-50 KB; no concern at MVP |
    | Max sleep duration | 7 days (free) / 1 year (pro) | Human approval timeouts (7d) require at minimum the free tier |

  **Must NOT do**:
  - Do not restructure Section 22 or Section 14 — only add targeted content
  - Do not add a new `##` section — the Inngest limits go under `####`
  - Do not change the LLM Gateway architecture diagram — only update walkthrough text

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two find-and-replace fixes plus one small table addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4, 5, 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1993` — Current `@ex-machina/opencode-anthropic-auth` reference to replace
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2071` — Second plugin reference to replace
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1541-1548` — Runtime Selection table format (add Inngest limits after this)

  **External References**:
  - Inngest execution limits: verified via librarian research (bg_78d4bc57) — 4MB step, 32MB function, 1000 steps, 256KB/3MB event
  - nexus-stack `sync-token.sh`: verified via explore agent (bg_60aeb2b9) — 81 lines, reads auth.json, checks expiry, pushes to Fly secrets

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auth plugin reference removed
    Tool: Bash (grep)
    Preconditions: Task 7 edits applied
    Steps:
      1. Run: grep -n "ex-machina/opencode-anthropic-auth" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify 0 matches — all references replaced
    Expected Result: Zero occurrences of the non-existent package name
    Failure Indicators: Any match remaining
    Evidence: .sisyphus/evidence/task-7-auth-fix.txt

  Scenario: Inngest limits table present
    Tool: Bash (grep)
    Preconditions: Task 7 edits applied
    Steps:
      1. Run: grep -n "Inngest Execution Limits\|Max step payload\|4 MB" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify matches exist in Section 14 area
    Expected Result: Inngest limits subsection with table present
    Failure Indicators: No "Inngest Execution Limits" heading or "4 MB" in Section 14
    Evidence: .sisyphus/evidence/task-7-inngest-limits.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): fix auth plugin reference, document inngest payload limits`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep verification per QA scenarios

- [x] 8. Cross-Reference Consistency Audit

  **What to do**:
  - Read the entire updated document end-to-end
  - Grep for every key concept that was modified and verify consistency:
    - `Review Agent` — every mention must be in post-MVP context or qualified with "post-MVP"/"M4"/"future"
    - `auto-merge` — same as above, must be post-MVP context
    - `risk scor` — same, must be post-MVP context (risk scoring depends on review agent)
    - `Archetype Registry` — must have MVP qualification where appropriate
    - `fix loop` / `fix iteration` / `re-enter` — must reflect "all subsequent stages" + global cap semantics
    - `waitForEvent` — check if any references need the race condition caveat
    - `ex-machina` — must be zero occurrences
    - `raw_event` — must appear in both Section 8 and Section 13
  - Fix any orphaned references found — e.g., a sentence that says "the review agent auto-merges" without noting this is post-MVP
  - Verify the Table of Contents anchor links still work (no renamed headers)
  - Verify all Mermaid diagrams have ≤ 20 nodes

  **Must NOT do**:
  - Do not rewrite sections beyond fixing orphaned references
  - Do not change the document voice or style
  - Do not add new content beyond consistency fixes
  - Do not touch Sections 5, 6.2–6.5, 7, 12, 15, 20, 21, 23, 24, 25, 28 unless an orphaned reference requires a one-line fix

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full-document audit requiring reading all 2,400+ lines and cross-referencing multiple concepts across 28 sections
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after all Wave 2 tasks)
  - **Blocks**: Final Verification Wave (F1-F4)
  - **Blocked By**: Tasks 2, 3, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - Full document: `docs/2026-03-22-2317-ai-employee-architecture.md` — read end-to-end
  - The "Must NOT Have" guardrails from this plan — use as the audit checklist

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No orphaned Review Agent references in MVP context
    Tool: Bash (grep)
    Preconditions: All Tasks 1-7 completed
    Steps:
      1. Run: grep -n "Review Agent\|review agent" docs/2026-03-22-2317-ai-employee-architecture.md
      2. For each match, verify it's either: (a) in a section already marked post-MVP, (b) in the "full architecture" context, or (c) explicitly qualified with post-MVP language
      3. Run: grep -n "auto-merge\|auto_merge\|automerge" docs/2026-03-22-2317-ai-employee-architecture.md
      4. Same verification as step 2
    Expected Result: Zero orphaned references to MVP-removed concepts
    Failure Indicators: Any Review Agent or auto-merge mention without post-MVP context
    Evidence: .sisyphus/evidence/task-8-consistency-audit.txt

  Scenario: No references to non-existent packages
    Tool: Bash (grep)
    Preconditions: All Tasks 1-7 completed
    Steps:
      1. Run: grep -n "ex-machina" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify 0 matches
    Expected Result: Zero occurrences
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-8-package-check.txt

  Scenario: Table of Contents anchors still valid
    Tool: Bash (grep)
    Preconditions: All Tasks 1-7 completed
    Steps:
      1. Extract all `## ` headers from the document
      2. Extract all `[text](#anchor)` links from the Table of Contents
      3. Verify each anchor matches a header
    Expected Result: All ToC links resolve to existing headers
    Failure Indicators: Any broken anchor
    Evidence: .sisyphus/evidence/task-8-toc-check.txt
  ```

  **Commit**: YES
  - Message: `docs(architecture): cross-reference consistency audit — verify all sections aligned`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: full-document grep per QA scenarios

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify the change exists in the document (grep for key phrases). For each "Must NOT Have": search document for forbidden patterns — reject with line number if found. Check that no section outside the allowed list was modified. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Document Quality Review** — `unspecified-high`
  Read the full updated document. Check for: broken Mermaid diagrams (unclosed blocks, mismatched classDefs), dangling cross-references (section mentions "See Section X" where X doesn't exist), voice inconsistencies (passive voice, hedging language), and incomplete sentences or placeholder text like `[TBD]` or `[DECISION NEEDED]`.
  Output: `Diagrams [N clean/N issues] | Cross-refs [N valid/N broken] | Voice [consistent/inconsistent] | VERDICT`

- [x] F3. **Cross-Reference Verification** — `deep`
  For every concept that was modified (Review Agent, auto-merge, risk scoring, Archetype Registry, fix loop, waitForEvent): grep the entire document for all mentions. Verify each mention is consistent with the updated version. Flag any orphaned references where the concept is mentioned in MVP context but was moved to post-MVP.
  Output: `Concepts checked [N] | Orphaned refs [N] | Inconsistencies [N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was done, nothing beyond spec was done. Check that no section in the "Must NOT touch" list was modified. Verify commit messages match the commit strategy.
  Output: `Tasks [N/N compliant] | Forbidden sections [CLEAN/N touched] | VERDICT`

---

## Commit Strategy

| Commit | Message | Files | Pre-commit |
|---|---|---|---|
| 1 | `docs(architecture): redefine MVP scope — remove review agent, narrow to M1+M3` | `docs/2026-03-22-2317-ai-employee-architecture.md` | grep verification |
| 2 | `docs(architecture): fill data model gaps — add projects, validation_run, review, clarification entities` | `docs/2026-03-22-2317-ai-employee-architecture.md` | grep verification |
| 3 | `docs(architecture): simplify archetype to hardcoded engineering config for MVP` | `docs/2026-03-22-2317-ai-employee-architecture.md` | grep verification |
| 4 | `docs(architecture): clarify fix loop — re-run all stages from fix point, add global cap` | `docs/2026-03-22-2317-ai-employee-architecture.md` | grep verification |
| 5 | `docs(architecture): document inngest SPOF mitigation — payload-first + CLI dispatch` | `docs/2026-03-22-2317-ai-employee-architecture.md` | grep verification |
| 6 | `docs(architecture): add operational concerns — gateway health, partial failure, pooling, secrets` | `docs/2026-03-22-2317-ai-employee-architecture.md` | grep verification |
| 7 | `docs(architecture): fix auth plugin reference, document inngest payload limits` | `docs/2026-03-22-2317-ai-employee-architecture.md` | grep verification |
| 8 | `docs(architecture): cross-reference consistency audit — verify all sections aligned` | `docs/2026-03-22-2317-ai-employee-architecture.md` | full-document grep |

---

## Success Criteria

### Verification Commands
```bash
# MVP scope reflects M1+M3 only
grep -n "Review Agent" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "post-MVP\|deferred\|future\|Phase\|M4"
# Expected: 0 results (all Review Agent mentions in MVP context are removed or marked post-MVP)

# Fix loop clarification present in both locations
grep -n "re-run.*subsequent\|all stages from" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: matches in both Section 4 and Section 9.2

# Inngest SPOF mitigation documented
grep -n "raw_event\|dispatch-task\|CLI dispatch\|manual recovery" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: matches in Section 8 and/or Section 26

# Auth plugin reference corrected
grep -n "ex-machina/opencode-anthropic-auth" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: 0 results (reference removed/replaced)

# All entity definitions present
grep -n "VALIDATION_RUN\|CLARIFICATION" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: matches in Section 13 entity definitions

# No forbidden sections modified (spot check)
# Verified via git diff --stat after each commit
```

### Final Checklist
- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] Document line count is reasonable (additions net positive vs 2,376 baseline)
- [ ] Table of Contents links intact (no renamed headers)
- [ ] Mermaid diagrams have ≤ 20 nodes each
