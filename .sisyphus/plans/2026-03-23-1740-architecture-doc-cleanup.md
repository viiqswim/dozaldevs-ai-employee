# Architecture Document Cleanup & Alignment

## TL;DR

> **Quick Summary**: Fix 11 internal contradictions in the main architecture doc, delete 2 stale supporting documents, rewrite the docs README, clarify the orchestrator identity (it IS Inngest functions), and add 4 pieces of new content (MVP diagram, orchestrator definition, triage_result interface, Event Gateway clarification).
>
> **Deliverables**:
> - Main architecture doc with zero internal contradictions
> - 2 stale docs deleted
> - Docs README rewritten to reflect current 2-doc structure
> - Orchestrator consistently defined as Inngest step functions throughout
> - 4 new content additions integrated into existing sections
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves + final review
> **Critical Path**: Task 1 → Task 3 → Task 6 → Task 7 → Task 8

---

## Context

### Original Request
Review the AI Employee Platform architecture document for gaps, contradictions, and simplification opportunities. Then create a work plan to fix all identified issues.

### Interview Summary
**Key Discussions**:
- **Orchestrator identity**: The "TypeScript Orchestrator" referenced 49 times is not a separate service — it IS the collection of Inngest step functions that manage the task lifecycle. The doc must make this unambiguous.
- **Agent model for MVP**: Triage agent deferred. Start with 2 agents (Execution + Review). Triage and review use direct LLM calls via OpenRouter, NOT OpenCode sessions.
- **Event Gateway**: Keep as thin webhook receiver (~200 lines) for signature verification, normalization, receipt tracking, and vendor independence. Not a full Fastify application.
- **triage_result interface**: Add `triage_result JSONB` column to tasks schema now. In MVP, populated with raw Jira ticket data. When triage agent is added, it writes enriched analysis. Execution agent always reads from this column.
- **Stale docs**: Delete reference guide and quick reference checklist — all useful content is already in Section 28 of the main doc.

**Research Findings**:
- Inngest handles webhooks natively with transforms, but Gateway is kept for webhook signature verification (security requirement) and vendor independence on URLs
- OpenCode `serve` has serious session management issues (validated decision to use direct LLM calls for triage/review)
- Inngest `step.waitForEvent()` handles Slack approval flows; no custom middleware needed beyond a webhook-to-event bridge

### Metis Review
**Identified Gaps** (addressed):
- **Section 28 must be READ-ONLY** — it legitimately references BullMQ, Redis, LangGraph, Python as future migration paths
- **Mermaid diagram labels need separate treatment** — 4 diagrams have `ORCH["Orchestrator\n(TypeScript)"]` nodes; label-only changes, no structural diagram rewrites
- **Docs README references deleted files** — mandatory fix after deletion, not just a nice-to-have
- **triage_result needs "reserved, no MVP writer" framing** — prevents reader confusion
- **No new top-level sections** — all new content goes into existing sections
- **Minimum viable changes only** — fix contradictions, don't rewrite surrounding prose

---

## Work Objectives

### Core Objective
Bring the architecture document into full internal consistency by fixing all contradictions against the agreed MVP decisions, removing references to deferred technologies in active sections, and clarifying the orchestrator as Inngest step functions.

### Concrete Deliverables
- `docs/2026-03-22-2317-ai-employee-architecture.md` — 11 contradictions fixed, orchestrator clarified, 4 new content pieces added
- `docs/2026-03-22-2314-reference-guide.md` — deleted
- `docs/2026-03-21-2314-quick-reference-checklist.md` — deleted
- `docs/2026-03-22-2317-readme.md` — rewritten for 2-doc structure

### Definition of Done
- [ ] Zero contradictions between active sections and MVP decisions
- [ ] Zero references to deleted docs in any remaining file
- [ ] "Orchestrator" consistently defined as Inngest step functions (not a separate service)
- [ ] Section 28 (Deferred Capabilities) untouched
- [ ] All mermaid diagrams still render correctly after label changes

### Must Have
- All 11 identified contradictions fixed with minimum viable changes
- Orchestrator clarified in definition, prose, and mermaid diagram labels
- MVP scope notes on triage agent section (deferred for MVP)
- `triage_result` JSONB interface documented with "reserved, no MVP writer" framing
- Event Gateway clarified as thin webhook receiver
- Stale docs deleted, README updated

### Must NOT Have (Guardrails)
- **DO NOT touch Section 28** (Deferred Capabilities) — it legitimately references BullMQ, Redis, LangGraph, Python as future migration paths
- **DO NOT restructure any mermaid diagram** — label text changes only, no node additions/removals/reconnections
- **DO NOT rewrite surrounding prose** for style/clarity — minimum viable change per contradiction
- **DO NOT add new top-level sections** — all new content goes into existing sections
- **DO NOT create archive folders or deprecation stubs** for deleted files — hard delete only
- **DO NOT make changes not on the explicit task list** — "while I'm in there" edits are forbidden
- **DO NOT add triage agent flow documentation** — triage_result interface only (one schema block in database section)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (documentation task)
- **Automated tests**: None — verification via grep commands
- **Framework**: N/A

### QA Policy
Every task includes grep-based verification commands. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent files):
├── Task 1: Delete stale docs [quick]
└── Task 2: Rewrite docs README [writing]

Wave 2 (After Wave 1 — sequential edits to main architecture doc):
├── Task 3: Fix Sections 9.1-9.3 — agent model contradictions [writing]
├── Task 4: Fix Sections 15-16 — tech stack + roadmap [writing]
├── Task 5: Fix Section 9.2 + Section 27 — execution env + deployment runbook [quick]
├── Task 6: Clarify orchestrator identity — definition + mermaid labels + prose [deep]
└── Task 7: Add new content — triage_result + Event Gateway + MVP diagram [writing]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Content quality review [unspecified-high]
├── Task F3: Contradiction scan verification [unspecified-high]
└── Task F4: Scope fidelity check [deep]
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 6 → Task 7 → F1-F4 → user okay
Parallel Speedup: Wave 1 tasks run simultaneously
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2 (README needs to know which files exist) |
| 2 | 1 | F1-F4 |
| 3 | 1 | 4, 5, 6, 7 |
| 4 | 3 | 5 |
| 5 | 4 | 6 |
| 6 | 5 | 7 |
| 7 | 6 | F1-F4 |
| F1-F4 | 2, 7 | user okay |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `writing`
- **Wave 2**: **5** — T3 → `writing`, T4 → `writing`, T5 → `quick`, T6 → `deep`, T7 → `writing`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Delete Stale Supporting Documents

  **What to do**:
  - Delete `docs/2026-03-22-2314-reference-guide.md` (1,089 lines — references BullMQ, Redis, LangGraph, Python workers as current tech)
  - Delete `docs/2026-03-21-2314-quick-reference-checklist.md` (423 lines — same stale references)
  - Hard delete — no archive folder, no deprecation stubs, no git-mv

  **Must NOT do**:
  - Create an archive directory
  - Add "deprecated" headers instead of deleting
  - Delete any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 2, 3-7
  - **Blocked By**: None (start immediately)

  **References**:
  - `docs/2026-03-22-2314-reference-guide.md` — File to delete
  - `docs/2026-03-21-2314-quick-reference-checklist.md` — File to delete

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Both stale docs are deleted
    Tool: Bash
    Steps:
      1. ls docs/2026-03-22-2314-reference-guide.md 2>/dev/null && echo "FAIL: still exists" || echo "PASS: deleted"
      2. ls docs/2026-03-21-2314-quick-reference-checklist.md 2>/dev/null && echo "FAIL: still exists" || echo "PASS: deleted"
      3. ls docs/ to confirm only 2026-03-22-2317-ai-employee-architecture.md and 2026-03-22-2317-readme.md remain
    Expected Result: Both files absent, only 2 docs remain
    Evidence: .sisyphus/evidence/task-1-stale-docs-deleted.txt

  Scenario: No archive or stub files created
    Tool: Bash
    Steps:
      1. ls -la docs/archive/ 2>/dev/null && echo "FAIL: archive dir exists" || echo "PASS"
      2. grep -rl "deprecated\|archived\|DEPRECATED" docs/ 2>/dev/null | wc -l
    Expected Result: No archive directory, no deprecation notices
    Evidence: .sisyphus/evidence/task-1-no-archive.txt
  ```

  **Commit**: YES
  - Message: `docs: delete stale reference guide and quick reference checklist`
  - Files: `docs/2026-03-22-2314-reference-guide.md`, `docs/2026-03-21-2314-quick-reference-checklist.md`

- [x] 2. Rewrite Docs README

  **What to do**:
  Rewrite `docs/2026-03-22-2317-readme.md` to reflect the current 2-document structure. The README currently references 4 docs (2 being deleted), BullMQ, LangGraph, Redis, Python workers, and a tech stack table that contradicts the main architecture doc.

  The new README should:
  - State that the architecture doc is the single source of truth
  - Summarize the platform in 2-3 sentences (AI Employee Platform that automates department tasks using Inngest workflows, OpenCode coding agents on Fly.io machines, and Supabase state management)
  - List the current tech stack accurately: Inngest (orchestration + queue), OpenCode (engineering execution), Supabase (state + vectors), OpenRouter (LLM gateway), Fly.io (execution compute), Slack (human interaction)
  - Remove ALL references to: BullMQ, Redis, LangGraph, Python workers, Kubernetes, OpenTelemetry, Grafana, AsyncPostgresSaver
  - Remove references to the deleted reference guide and quick reference checklist
  - Keep it under 50 lines — this is a pointer to the architecture doc, not a standalone document

  **Must NOT do**:
  - Reference any deleted document
  - Include BullMQ, LangGraph, Redis, or Python workers as current tech
  - Duplicate content from the architecture doc (point to it instead)
  - Exceed 50 lines

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (must know which docs still exist)

  **References**:
  - `docs/2026-03-22-2317-readme.md` — File to rewrite (read current content first)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1-20` — Opening lines for platform summary alignment
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1375-1403` — Section 15 tech stack table for accurate tech list

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: README has no stale technology references
    Tool: Bash (grep)
    Steps:
      1. grep -in "BullMQ\|LangGraph\|Python worker\|Redis\|Kubernetes\|OpenTelemetry\|Grafana\|AsyncPostgresSaver" docs/2026-03-22-2317-readme.md
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-2-no-stale-tech.txt

  Scenario: README has no references to deleted docs
    Tool: Bash (grep)
    Steps:
      1. grep -in "reference-guide\|quick-reference-checklist\|2026-03-22-2314\|2026-03-21-2314" docs/2026-03-22-2317-readme.md
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-2-no-deleted-refs.txt

  Scenario: README is concise
    Tool: Bash
    Steps:
      1. wc -l docs/2026-03-22-2317-readme.md
    Expected Result: Less than 50 lines
    Evidence: .sisyphus/evidence/task-2-line-count.txt
  ```

  **Commit**: YES
  - Message: `docs: rewrite docs README for current architecture`
  - Files: `docs/2026-03-22-2317-readme.md`

- [x] 3. Fix Sections 9.1-9.3 — Agent Model Contradictions

  **What to do**:
  Fix 5 contradictions in the agent sections:

  **Section 9.1 (Triage Agent):**
  - Add an MVP scope note at the top of Section 9.1 (same pattern as Section 12, 22, 23, 24):
    > **MVP Scope**: The triage agent is deferred for MVP. In MVP, the execution agent reads the raw Jira ticket directly from the `triage_result` column (populated by the Event Gateway with the raw webhook payload). The full triage agent described below will be built when ticket volume or ambiguity justifies it. See Section 28 for the deferral rationale.
  - **Step 3** (~line 450): Replace "Query pgvector for similar past tickets and relevant codebase context" with "Query `tasks` table for similar past tickets (SQL `WHERE` on project, labels, keywords). Use OpenCode's native codebase search (file search, LSP, grep, AST tools) for code context — no vector similarity in V1."
  - **Responsibility #6** (~line 735): Remove "Conflict detection — Check if in-progress tickets overlap with the same files; alert orchestrator" entirely. Replace with: "Task history awareness — Check if similar tasks are currently in-progress and flag potential overlap for the execution agent."
  - **Line 676 reference**: Change "Triage and review run as lightweight OpenCode sessions on the orchestrator host" to "Triage and review run as stateless LLM inference calls via OpenRouter. They don't write code and don't need OpenCode's file editing, git, or LSP capabilities."

  **Section 9.3 (Review Agent):**
  - Update any reference to "OpenCode session" for the review agent to "direct LLM call via OpenRouter." The review agent reads PR diffs and Jira data via API, then calls the LLM for analysis. It doesn't need an OpenCode session.

  **Section 9.2 (Execution Agent):**
  - **Line 813**: Remove "Redis instance for caching" from the Execution Environment list. Redis is deferred per Section 28.

  **Must NOT do**:
  - Rewrite surrounding prose for style (minimum viable change only)
  - Add new mermaid diagrams
  - Touch Section 28
  - Remove the triage agent section entirely (it stays as the full architecture; the MVP scope note signals what's deferred)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential with Tasks 4-7)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:440-470` — Section 9.1 triage flow (pgvector step and responsibilities)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:670-680` — "Triage and review run as lightweight OpenCode sessions" statement
  - `docs/2026-03-22-2317-ai-employee-architecture.md:720-740` — Triage agent responsibilities list
  - `docs/2026-03-22-2317-ai-employee-architecture.md:805-820` — Section 9.2 execution environment (Redis line)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:820-900` — Section 9.3 review agent
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1767-1770` — Section 22 MVP scope note (pattern to follow)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: pgvector removed from active triage flow
    Tool: Bash (grep)
    Steps:
      1. grep -n "pgvector" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "Section 28\|Deferred\|deferred\|future\|migration\|Section 12\|MVP Scope\|knowledge base"
    Expected Result: 0 matches in active flow (only deferred/future/knowledge-base context references)
    Evidence: .sisyphus/evidence/task-3-no-pgvector-active.txt

  Scenario: No "OpenCode session" references for triage/review agents
    Tool: Bash (grep)
    Steps:
      1. grep -n "OpenCode session" docs/2026-03-22-2317-ai-employee-architecture.md | grep -iv "execution\|fly.io\|Execution Agent"
    Expected Result: 0 matches (only execution agent references remain)
    Evidence: .sisyphus/evidence/task-3-no-opencode-triage-review.txt

  Scenario: Redis removed from execution environment
    Tool: Bash (grep)
    Steps:
      1. grep -n "Redis instance for caching" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-3-no-redis-exec-env.txt

  Scenario: MVP scope note present on triage section
    Tool: Bash (grep)
    Steps:
      1. grep -n "MVP Scope.*triage.*deferred\|triage.*deferred.*MVP" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-3-triage-mvp-note.txt
  ```

  **Commit**: YES
  - Message: `docs: fix agent model contradictions in architecture doc`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 4. Fix Sections 15-16 — Tech Stack + Roadmap Contradictions

  **What to do**:
  Fix 4 contradictions:

  **Section 15 (Tech Stack Table):**
  - Row "Orchestration (Eng)": Change "Custom TypeScript (generalized `orchestrate.mjs`)" to "Inngest step functions (evolved from `orchestrate.mjs` pattern)". Update description to: "Durable workflow execution with step-level checkpointing, concurrency control, and crash recovery. Not a separate service — the orchestrator IS these Inngest functions."
  - Row "Execution Compute (Non-Eng)": Change "In-process Python workers" to "Inngest in-process (TypeScript)". Update description to: "No isolation needed for API-only tasks; lowest cost. Runs as Inngest function steps."

  **Section 16 (Roadmap):**
  - **M2** (line 1449): Change "Knowledge base indexing pipeline: pgvector embeddings for one pilot project" to "Task history queries via SQL for institutional memory. Codebase context via OpenCode's native search tools (file search, LSP, grep, AST). pgvector embeddings deferred — see Section 28."
  - **M5** (line 1483): Remove "File-level conflict detection at dispatch". Replace with: "Per-project concurrency scheduler (configurable limit per project)". The existing "Per-project concurrency scheduler" bullet already captures this — just remove the file-level bullet.
  - **M6** (line 1496): Change "In-process Python execution (no Fly.io needed for marketing tasks)" to "Inngest TypeScript workflow functions (no Fly.io needed for marketing tasks — runs as Inngest step functions)".

  **Must NOT do**:
  - Touch Section 28 (Deferred Capabilities)
  - Modify any other tech stack rows beyond the 2 listed
  - Change roadmap timeline estimates
  - Add or remove milestones

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1375-1403` — Section 15 tech stack table
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1420-1500` — Section 16 roadmap milestones
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2144-2162` — Section 28 deferred capabilities (READ ONLY — reference for context, do not edit)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tech stack table has no "Custom TypeScript" for orchestration
    Tool: Bash (grep)
    Steps:
      1. grep -n "Custom TypeScript" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-4-no-custom-ts.txt

  Scenario: Tech stack table has no "Python workers" in active rows
    Tool: Bash (grep)
    Steps:
      1. grep -n "In-process Python workers" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-4-no-python-workers.txt

  Scenario: Roadmap M6 references TypeScript not Python
    Tool: Bash (grep)
    Steps:
      1. grep -A2 "M6\|Paid Marketing Department" docs/2026-03-22-2317-ai-employee-architecture.md | grep -i "python"
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-4-m6-no-python.txt

  Scenario: Section 28 is untouched
    Tool: Bash (grep)
    Steps:
      1. grep -c "BullMQ.*self-hosted job queue" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: 1 (still present in Section 28)
    Evidence: .sisyphus/evidence/task-4-section28-intact.txt
  ```

  **Commit**: YES
  - Message: `docs: fix tech stack and roadmap contradictions`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 5. Fix Section 9.2 + Section 27 — Execution Env + Deployment Runbook

  **What to do**:
  Fix 3 remaining stale references:

  **Section 27 (Deployment Runbook):**
  - **Line 2034**: Change "Create Fly.io account and apps: `ai-employee-gateway` (Fastify/TS), `ai-employee-workers` (Python), `nexus-workers` (OpenCode execution)" to "Create Fly.io account and apps: `ai-employee-gateway` (Event Gateway — Fastify/TS), `nexus-workers` (OpenCode execution machines)". Remove the Python workers app entirely.
  - **Line 2035**: Change "Create Supabase project, enable pgvector extension, run schema migrations" to "Create Supabase project, run schema migrations. (Enable pgvector extension when knowledge base indexing is needed — deferred for MVP.)"
  - **Line 2045**: Remove "- `fly deploy --app ai-employee-workers` for Python worker changes" entirely. No Python workers in the current architecture.

  **Must NOT do**:
  - Change the structure of the deployment runbook
  - Add new deployment steps
  - Modify monitoring, incident, maintenance, or debugging runbooks

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2028-2050` — Section 27 Deployment Runbook

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No Python workers in deployment runbook
    Tool: Bash (grep)
    Steps:
      1. grep -n "ai-employee-workers\|Python worker" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "Section 28\|Deferred"
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-5-no-python-deploy.txt

  Scenario: pgvector marked as deferred in initial setup
    Tool: Bash (grep)
    Steps:
      1. grep -A1 "enable pgvector\|pgvector extension" docs/2026-03-22-2317-ai-employee-architecture.md | head -5
    Expected Result: Contains "deferred" or "when needed" qualifier
    Evidence: .sisyphus/evidence/task-5-pgvector-deferred.txt
  ```

  **Commit**: YES
  - Message: `docs: fix deployment runbook stale references`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 6. Clarify Orchestrator Identity Throughout Document

  **What to do**:
  The word "Orchestrator" or "orchestrator" appears 49 times in the main architecture doc. The document currently implies it's a separate standalone TypeScript service. It is NOT — it is the collection of Inngest step functions that manage the task lifecycle.

  **Step 1: Add canonical definition.** Find the first substantive mention of the orchestrator (Section 10, ~line 972: "The orchestrator is a generalized TypeScript service...") and replace with this canonical definition:

  > The orchestrator is the collection of Inngest step functions that manage the full task lifecycle — from webhook receipt through triage, execution, and review to final delivery. It is not a separate service. The orchestrator IS the Inngest functions. Each department has a lifecycle function (e.g., `engineering/task-lifecycle`) that coordinates phases through Inngest steps: `step.run()` for synchronous work, `step.waitForEvent()` for human approvals and agent completions, and Inngest's concurrency controls for per-project limits. This is a direct evolution of the nexus-stack `orchestrate.mjs` pattern, reimplemented as durable Inngest workflows rather than a standalone process.

  **Step 2: Update mermaid diagram labels (4 diagrams).** Change node labels only — do NOT restructure diagrams:
  - Line 203: `ORCH["Orchestrator\n(TypeScript)"]` → `ORCH["Inngest Lifecycle\nFunctions"]`
  - Line 622: `ORCH["Orchestrator\n(TypeScript)"]` → `ORCH["Inngest Lifecycle\nFunctions"]`
  - Line 913: `subgraph TypeScript Orchestrator` → `subgraph Inngest Lifecycle Functions`
  - Line 986: `participant Orchestrator as TypeScript Orchestrator` → `participant Orchestrator as Inngest Lifecycle Functions`

  **Step 3: Update prose references.** For each of the ~40 prose references, apply this rule:
  - If it says "TypeScript Orchestrator" → change to "Inngest lifecycle function" or "orchestrator" (lowercase, no caps)
  - If it says "the Orchestrator" as a standalone entity → change to "the orchestrator" (lowercase) or "the Inngest lifecycle function"
  - If it says "the orchestrator does X" where X describes behavior → keep but ensure it doesn't imply a separate service
  - If it says "the orchestrator crashes" (Section 13, line 1062) → keep as-is (Inngest functions can crash too, and the recovery behavior is the same)
  - **DO NOT touch line 2154** (Section 28: "Custom Orchestrator" in deferred capabilities)

  **Key prose fixes (not exhaustive — agent must find all 49):**
  - Line 280: "The TypeScript Orchestrator receives the Inngest event" → "The Inngest lifecycle function receives the event"
  - Line 656: "Inngest triggers the TypeScript Orchestrator" → "Inngest triggers the lifecycle function"
  - Line 972: Replace with canonical definition (see Step 1)
  - Lines 1032-1066: Sequence diagram walkthrough — update all "Orchestrator" references to "lifecycle function"

  **Must NOT do**:
  - Touch Section 28 line 2154 ("Custom Orchestrator" in deferred capabilities)
  - Restructure any mermaid diagram (label changes only)
  - Add new nodes or edges to any diagram
  - Change the ORCH variable name in mermaid (just the label text)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 49 references across a 2,162-line document requires careful, exhaustive search-and-replace with context awareness
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md` — Full document (all 49 orchestrator references)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:970-975` — Current orchestrator definition to replace
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2150-2158` — Section 28 "Custom Orchestrator" (DO NOT TOUCH)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No "TypeScript Orchestrator" references remain (except Section 28)
    Tool: Bash (grep)
    Steps:
      1. grep -n "TypeScript Orchestrator" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "Section 28\|Deferred\|Custom Orchestrator"
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-6-no-ts-orchestrator.txt

  Scenario: Canonical definition is present
    Tool: Bash (grep)
    Steps:
      1. grep -n "collection of Inngest step functions" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-6-canonical-def.txt

  Scenario: Mermaid diagrams updated
    Tool: Bash (grep)
    Steps:
      1. grep -n 'Orchestrator.*TypeScript' docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "Section 28\|Deferred"
    Expected Result: 0 matches in mermaid blocks
    Evidence: .sisyphus/evidence/task-6-mermaid-updated.txt

  Scenario: Section 28 "Custom Orchestrator" unchanged
    Tool: Bash (grep)
    Steps:
      1. grep -n "Custom Orchestrator.*generalized orchestrate.mjs" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: Exactly 1 match (Section 28 row intact)
    Evidence: .sisyphus/evidence/task-6-section28-intact.txt
  ```

  **Commit**: YES
  - Message: `docs: clarify orchestrator as Inngest step functions`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 7. Add New Content — triage_result Interface, Event Gateway Clarification, MVP Diagram

  **What to do**:
  Add 3 pieces of new content into EXISTING sections (no new top-level sections):

  **A. `triage_result` JSONB Interface (insert into Section 4, Database Schema area, ~line 350-370):**

  Add a subsection within the existing database schema discussion. Frame it as "reserved for future triage agent":

  ```sql
  -- triage_result column on the tasks table
  -- MVP: Populated by Event Gateway with raw Jira webhook data
  -- Future: Populated by Triage Agent with enriched analysis
  ALTER TABLE tasks ADD COLUMN triage_result JSONB;
  ```

  Document the interface contract:
  ```
  triage_result JSONB schema:
  {
    // Always present (MVP — populated by Event Gateway from webhook)
    "ticket_id": "string — external Jira ticket ID",
    "title": "string — ticket title",
    "description": "string — ticket body/description",
    "labels": ["string"] — Jira labels,
    "priority": "string — Jira priority level",
    "raw_ticket": {} — full Jira webhook payload (preserved for debugging),

    // Future (populated by Triage Agent when built)
    "scope_estimate": "small | medium | large | decompose",
    "complexity_notes": "string — agent's analysis of complexity",
    "suggested_approach": "string — recommended implementation strategy",
    "relevant_files": ["string"] — files likely affected,
    "relevant_past_tasks": ["uuid"] — similar past tasks from SQL query,
    "is_clear": "boolean — whether ticket is unambiguous",
    "clarifying_questions": ["string"] — questions to post on Jira (if not clear)
  }
  ```

  Add a note: "The execution agent always reads `triage_result` — it never queries Jira directly for ticket data. In MVP, this column contains the raw ticket. When the triage agent is built (see Section 28), it enriches this column with scope analysis, complexity estimates, and relevant context. This interface makes adding the triage agent a zero-code-change pluggable addition."

  **B. Event Gateway Clarification (insert into Section 11, Event Gateway section, ~line 620-680):**

  Add an MVP scope callout at the top of the Event Gateway section (same pattern as other sections):

  > **MVP Scope**: The Event Gateway is a thin webhook receiver (~200 lines of Fastify code), not a full application. It does exactly 4 things: (1) verify webhook signatures (Jira HMAC, GitHub X-Hub-Signature-256), (2) normalize payloads to the universal task schema, (3) write `Received` status to Supabase tasks table, and (4) send the event to Inngest. It does NOT do routing, business logic, orchestration, retry management, or anything that Inngest handles. It's a webhook funnel.

  Add a note about why it's kept (not collapsed into Inngest):
  - Webhook signature verification requires access to signing secrets — Inngest transforms run in Inngest's cloud
  - Task receipt tracking to Supabase before queuing provides idempotency and missed-webhook recovery
  - Webhook URLs are vendor-independent — switching from Inngest doesn't require reconfiguring external services

  **C. MVP Summary Diagram (insert into Section 1 or 2, early in the document, before the full architecture diagram):**

  Add a clearly labeled "MVP Architecture" diagram that shows ONLY what gets built in the first pass. Use this exact diagram:

  ```mermaid
  flowchart LR
      subgraph External
          JIRA(["Jira Cloud"]):::external
          GH(["GitHub"]):::external
          SLACK(["Slack"]):::external
      end

      subgraph Platform
          GW["Event Gateway\n(thin webhook receiver)"]:::service
          ING["Inngest\n(workflows + queue)"]:::service
          SUP[("Supabase\n(PostgreSQL)")]:::storage
      end

      subgraph Agents
          EXEC["Execution Agent\n(Fly.io + OpenCode)"]:::service
          REV["Review Agent\n(LLM call via OpenRouter)"]:::service
      end

      LLM["OpenRouter\n(LLM Gateway)"]:::external

      JIRA -.->|"webhook"| GW
      GH -.->|"webhook"| GW
      GW ==>|"event"| ING
      ING ==>|"dispatch"| EXEC
      ING ==>|"trigger"| REV
      EXEC -->|"state"| SUP
      REV -->|"state"| SUP
      EXEC -->|"PR"| GH
      REV -.->|"notify"| SLACK
      EXEC -->|"inference"| LLM
      REV -->|"inference"| LLM

      classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
      classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
      classDef external fill:#F5A623,stroke:#C4841A,color:#fff
  ```

  Add a caption: "This diagram shows the MVP architecture — what gets built first. Compare with the full architecture diagram below, which includes the triage agent, marketing department, and other capabilities described in the roadmap (Section 16). Dashed lines are async; solid lines are synchronous; bold lines are the critical path."

  **Must NOT do**:
  - Create new top-level sections (insert into existing sections)
  - Add triage agent flow documentation (interface only)
  - Modify existing diagrams
  - Add content to Section 28

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 6

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1-50` — Opening sections where MVP diagram should go
  - `docs/2026-03-22-2317-ai-employee-architecture.md:340-380` — Database schema area for triage_result
  - `docs/2026-03-22-2317-ai-employee-architecture.md:615-680` — Event Gateway section for clarification
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1767-1770` — Section 22 MVP scope note (pattern to follow for Event Gateway)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: triage_result interface documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "triage_result" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: At least 3 matches (column definition, schema, usage note)
    Evidence: .sisyphus/evidence/task-7-triage-result.txt

  Scenario: Event Gateway clarified as thin receiver
    Tool: Bash (grep)
    Steps:
      1. grep -n "thin webhook receiver\|~200 lines\|webhook funnel" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-7-gateway-thin.txt

  Scenario: MVP diagram present
    Tool: Bash (grep)
    Steps:
      1. grep -n "MVP Architecture\|MVP.*diagram\|what gets built first" docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: At least 1 match
    Evidence: .sisyphus/evidence/task-7-mvp-diagram.txt

  Scenario: No new top-level sections created
    Tool: Bash (grep)
    Steps:
      1. grep -c "^## " docs/2026-03-22-2317-ai-employee-architecture.md
    Expected Result: Same count as before this task (28 sections, verify by reading original)
    Evidence: .sisyphus/evidence/task-7-no-new-sections.txt
  ```

  **Commit**: YES
  - Message: `docs: add MVP diagram, triage_result interface, gateway clarification`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify the change was made (grep for expected text). For each "Must NOT Have": verify Section 28 is untouched (`git diff` on Section 28 lines), no new top-level sections exist, no structural mermaid changes. Check evidence files exist in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Content Quality Review** — `unspecified-high`
  Read the full architecture doc. Check for: internal consistency (tech stack mentions match across sections), no contradictions between Sections 9/15/16/27 and the decisions made. Check for AI-slop: vague language, excessive hedging, placeholder text. Verify the orchestrator is consistently described throughout.
  Output: `Consistency [PASS/FAIL] | Completeness [PASS/FAIL] | VERDICT`

- [x] F3. **Contradiction Scan Verification** — `unspecified-high`
  Run ALL grep verification commands from ALL tasks. Verify zero hits for: pgvector outside Section 28/12, "Python workers" outside Section 28, "Custom TypeScript" in tech stack, "Redis" outside Section 28, "reference-guide" or "quick-reference" in any remaining doc. Save full grep output as evidence.
  Output: `Grep Checks [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read the actual changes. Verify 1:1 — everything specified was done, nothing beyond spec was done. Check "Must NOT do" compliance. Verify Section 28 is byte-for-byte identical to original. Flag any prose changes beyond the minimum needed for each contradiction.
  Output: `Tasks [N/N compliant] | Section 28 [UNCHANGED/MODIFIED] | Extra Changes [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Commit 1**: `docs: delete stale reference guide and quick reference checklist` — delete 2 files
- **Commit 2**: `docs: rewrite docs README for current architecture` — `docs/2026-03-22-2317-readme.md`
- **Commit 3**: `docs: fix agent model contradictions in architecture doc` — Sections 9.1-9.3 fixes
- **Commit 4**: `docs: fix tech stack and roadmap contradictions` — Sections 15-16 fixes
- **Commit 5**: `docs: fix deployment runbook stale references` — Section 27 fixes
- **Commit 6**: `docs: clarify orchestrator as Inngest step functions` — orchestrator identity throughout
- **Commit 7**: `docs: add MVP diagram, triage_result interface, gateway clarification` — new content
- **Commit 8** (if all verification passes): `docs: final consistency fixes` — any issues caught in verification

---

## Success Criteria

### Verification Commands
```bash
# Stale docs deleted
ls docs/2026-03-22-2314-reference-guide.md 2>/dev/null && echo "FAIL" || echo "PASS"
ls docs/2026-03-21-2314-quick-reference-checklist.md 2>/dev/null && echo "FAIL" || echo "PASS"

# No broken references to deleted docs
grep -r "reference-guide\|quick-reference-checklist" docs/  # Expected: 0 results

# No stale tech in active sections (excluding Section 28)
grep -n "Python workers\|In-process Python" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "Section 28\|Deferred\|deferred\|migration"  # Expected: 0

# No pgvector in active triage/execution flow
grep -n "pgvector" docs/2026-03-22-2317-ai-employee-architecture.md | grep -v "Section 28\|Deferred\|deferred\|future\|migration\|Section 12"  # Expected: 0

# Orchestrator not described as separate service
grep -n "Custom TypeScript.*orchestrate" docs/2026-03-22-2317-ai-employee-architecture.md  # Expected: 0

# triage_result documented
grep -n "triage_result" docs/2026-03-22-2317-ai-employee-architecture.md  # Expected: >= 1

# README has no stale tech
grep -n "BullMQ\|LangGraph\|Python worker\|Redis" docs/2026-03-22-2317-readme.md  # Expected: 0
```

### Final Checklist
- [ ] All 11 contradictions fixed
- [ ] Section 28 untouched
- [ ] Orchestrator consistently defined
- [ ] Stale docs deleted
- [ ] README rewritten
- [ ] All mermaid diagrams valid
- [ ] New content integrated into existing sections
