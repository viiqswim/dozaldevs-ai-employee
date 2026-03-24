# Architecture Document — MVP Simplification Update

## TL;DR

> **Quick Summary**: Update the 2143-line architecture document to reflect MVP simplification decisions — marking what's built now vs deferred, removing file-level locking (Fly.io isolation makes it unnecessary), fixing stale Python Worker references, and expanding Section 28 with newly deferred items including build-now vs retrofit-later cost analysis.
> 
> **Deliverables**:
> - Architecture doc updated with MVP scope callouts in 6 sections
> - Section 7.6 rewritten (Fly.io isolation replaces file-level locking)
> - All 6 locking references across the document updated consistently
> - Section 14 Python Worker references removed (diagram + table + walkthrough)
> - Section 12 pgvector pipeline marked as deferred, Layer 2 confirmed as MVP
> - Section 24 reframed: thin API wrappers (MVP) vs full token bucket (deferred)
> - Section 28 expanded with 3 new deferred items + retrofit cost analysis
> - Sections 22, 23 given minimal MVP callouts (no restructure)
> 
> **Estimated Effort**: Medium (~3-4 agent-days across parallel waves)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Wave 1 (section edits) → Wave 2 (cross-references + Section 28) → Final Verification

---

## Context

### Original Request
Review the architecture document to identify what's over-engineered for MVP, then update the document to clearly distinguish "building now" from "building later" — without deleting future plans.

### Interview Summary
**Key Discussions**:
- MVP = full autonomous engineering (triage + execute + review + auto-merge low-risk) on one project
- Event Gateway and Archetype Framework: KEEP — foundational for scaling, departments coming soon
- pgvector Knowledge Base pipeline: DEFER — OpenCode has native codebase search
- File-level locking: REMOVE entirely — Fly.io machine isolation means each task has its own git clone; merge conflicts are handled naturally by Git at PR time
- Parallel concurrency (2-3 tasks): KEEP — accept natural Git merge conflicts
- Data model, LLM wrapper, agent versioning, audit log, tenant_id: BUILD for MVP — low build cost, high retrofit cost

**Research Findings**:
- Locking references appear in 6 locations across the document (Sections 2, 6, 7.6, 10, 18, 28) — all must be updated for consistency
- Section 14 still references "Python Workers" (3 diagram edges + 1 table row + 3 walkthrough items) from pre-TypeScript-only simplification
- Section 12's Mermaid diagram shows pgvector pipeline as active — needs "future state" annotation
- Section 24 describes full token bucket as current design — needs full reframe
- Triage agent context gap: if pgvector is deferred, triage uses direct SQL queries on `tasks` table

### Metis Review
**Identified Gaps** (addressed):
- Locking refs in Sections 6 (line 423), 10 (line 954), 18 (line 1597) beyond the known Section 7.6 — added to scope
- Section 28 Custom Orchestrator entry references file-level locking as future trigger — needs update
- Section 12 Layer 2 must NOT be marked deferred (task history tables are MVP) — guardrail added
- Triage agent needs explicit fallback strategy when pgvector is deferred — added to Section 12 update
- Section 14 walkthrough renumbering required (10 items → 7) after Python Worker removal

---

## Work Objectives

### Core Objective
Update the architecture document to clearly distinguish MVP scope from future enhancements, remove over-engineered components (file-level locking), fix stale references (Python Workers), and document deferred items with retrofit cost analysis.

### Concrete Deliverables
- Updated `docs/2026-03-22-2317-ai-employee-architecture.md`

### Definition of Done
- [x] `grep -n "file-level lock\|merge queue\|conflict lock" docs/2026-03-22-2317-ai-employee-architecture.md` returns 0 matches outside Section 28
- [x] `grep -n "PYWORKER\|Python Worker\|python worker\|In-Process Python" docs/2026-03-22-2317-ai-employee-architecture.md` returns 0 matches outside Section 28
- [x] Section 28 table has exactly 9 data rows (6 existing + 3 new)
- [x] Section 14 flow walkthrough numbered 1-7 with no gaps
- [x] All MVP callouts use consistent format: `> **MVP Scope**: [text]`
- [x] All edited Mermaid diagrams parse without syntax errors
- [x] Document still has exactly 28 sections

### Must Have
- Every deferred item has: What We Use Instead, What We Gave Up, When to Reconsider, Migration Path
- Section 7.6 explains WHY locking is unnecessary (Fly.io isolation), not just that it's removed
- Section 12 explicitly states what triage uses for context when pgvector is deferred (direct SQL on tasks table)
- Section 28 new rows include build-now vs retrofit-later cost estimates

### Must NOT Have (Guardrails)
- **Do NOT touch** Sections 1–5, 8–9, 11, 13, 15–17, 19–21, 25–27 — out of scope
- **Do NOT mark Section 13 (Data Model) as deferred** — it's explicitly kept for MVP
- **Do NOT mark Layer 2 (task history) as deferred** in Section 12 — only the pgvector embedding pipeline is deferred
- **Do NOT restructure Sections 22 or 23** — add MVP callout blockquote only, leave existing content intact
- **Do NOT remove the Section 12 Mermaid diagram** — annotate it as "future state," don't delete it
- **Do NOT remove the Runtime Selection table from Section 14** — remove the Python Worker row only
- **Do NOT invent new architecture** in Section 7.6 — describe only what was decided (Fly.io isolation + Git handles conflicts)
- **Do NOT add MVP callouts to sections not being edited** — keep callouts to Sections 7.6, 12, 22, 23, 24 only

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (documentation update)
- **Automated tests**: None (no code)
- **Framework**: N/A

### QA Policy
Every task includes agent-executed QA scenarios using Grep and Read tools to verify edits.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 5 parallel section edits):
├── Task 1: Section 14 — Remove Python Worker references [quick]
├── Task 2: Section 7.6 — Rewrite with Fly.io isolation approach [quick]
├── Task 3: Section 12 — Mark pgvector pipeline deferred, add diagram note [quick]
├── Task 4: Section 24 — Reframe rate limiting as deferred [quick]
└── Task 5: Sections 22 + 23 — Add MVP callouts [quick]

Wave 2 (After Wave 1 — cross-references + Section 28):
├── Task 6: Sections 6, 10, 18 — Update all remaining locking references [quick]
├── Task 7: Section 28 — Add 3 new deferred rows + update Custom Orchestrator entry [quick]
└── Task 8: Section 2 — Minor reference cleanup if needed [quick]

Wave FINAL (After ALL tasks — 3 parallel verification checks):
├── F1: Grep audit — locking terms, Python Worker terms, MVP callout format [quick]
├── F2: Mermaid syntax validation on all edited diagrams [quick]
└── F3: Cross-reference consistency + Section 28 row count [quick]
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|---|---|---|
| T1 | — | F1, F2, F3 |
| T2 | — | T6 (locking language consistency), F1, F3 |
| T3 | — | F1, F2, F3 |
| T4 | — | T7 (monitoring → Section 28), F1, F3 |
| T5 | — | F1, F3 |
| T6 | T2 (use same language) | F1, F3 |
| T7 | T4 (monitoring content moves here) | F1, F3 |
| T8 | T2 | F1, F3 |
| F1 | T1–T8 | user okay |
| F2 | T1, T3 | user okay |
| F3 | T1–T8 | user okay |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1-T5 → `quick`
- **Wave 2**: **3** — T6-T8 → `quick`
- **FINAL**: **3** — F1-F3 → `quick`

---

## TODOs

- [x] 1. Section 14 — Remove Python Worker References

  **What to do**:
  - Read Section 14 (Platform Shared Infrastructure) starting around line 1306
  - In the Mermaid diagram: remove the `PYWORKER["Python Workers\n(Marketing/other)"]` node definition and all 3 edges connected to it (lines referencing PYWORKER: edges 2, 7, 10)
  - Renumber remaining edges in the diagram to be sequential (1-7, no gaps)
  - In the Flow Walkthrough below the diagram: remove the 3 walkthrough items that describe Python Worker flows (items 2, 7, 10) and renumber remaining items 1-7
  - In the Runtime Selection table: remove the "In-Process Python Worker" row entirely. Keep the "Fly.io Machine" and "Event Gateway Worker" rows
  - Verify the diagram still has valid Mermaid syntax (no orphan node references, no dangling edges)

  **Must NOT do**:
  - Do NOT remove the entire Runtime Selection table — only the Python Worker row
  - Do NOT change the Fly.io Machine or Event Gateway Worker rows
  - Do NOT edit any other section of the document
  - Do NOT change the diagram's overall structure beyond Python Worker removal

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-section edit with clear, bounded scope — find and remove specific elements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: F1, F2, F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1306-1371` — Section 14 with the Mermaid diagram containing PYWORKER node and edges
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1349-1361` — Flow Walkthrough items 1-10 (items 2, 7, 10 reference Python Workers)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1362-1371` — Runtime Selection table with 3 rows (remove the Python Worker row)

  **WHY Each Reference Matters**:
  - The Mermaid diagram has `PYWORKER` as a node with 3 edges — removing the node without removing edges creates invalid syntax
  - The walkthrough numbering must be contiguous (1-7) after removal — gaps confuse readers
  - The table row removal is straightforward but must preserve the header and remaining rows

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Python Worker node fully removed from diagram
    Tool: Bash (grep)
    Preconditions: Task edits applied to docs/2026-03-22-2317-ai-employee-architecture.md
    Steps:
      1. Run: grep -n "PYWORKER" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert: 0 matches returned
      3. Run: grep -n "Python Worker\|python worker\|In-Process Python" docs/2026-03-22-2317-ai-employee-architecture.md
      4. Assert: 0 matches outside Section 28 (line ~2128+)
    Expected Result: No PYWORKER references anywhere; no Python Worker references outside Section 28
    Failure Indicators: Any grep match before line 2128
    Evidence: .sisyphus/evidence/task-1-python-worker-grep.txt

  Scenario: Flow walkthrough renumbered correctly
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Read Section 14 flow walkthrough
      2. Verify items are numbered 1 through 7 consecutively
      3. Verify no items reference "Python Worker" or marketing/other department workers
    Expected Result: 7 consecutive walkthrough items, all referencing Fly.io or Event Gateway
    Failure Indicators: Numbering gaps (e.g., 1,2,4,5) or more than 7 items
    Evidence: .sisyphus/evidence/task-1-walkthrough-numbering.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs: apply MVP simplification — rewrite locking, defer pgvector pipeline and rate limiting, add MVP callouts`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 2. Section 7.6 — Rewrite Concurrent Task Conflicts with Fly.io Isolation

  **What to do**:
  - Read Section 7.6 (Concurrent Task Conflicts) starting around line 589
  - Replace the entire section content with a new explanation that covers:
    - **Why file-level locking is unnecessary**: Each engineering task runs on an isolated Fly.io machine with its own git clone, filesystem, and branch. Two tasks cannot conflict at the filesystem level because they never share a filesystem.
    - **How merge conflicts are handled naturally**: When two tasks modify overlapping files, both create PRs independently. GitHub detects merge conflicts at PR merge time. The review agent handles rebasing and conflict resolution as part of its normal workflow — this is standard engineering practice, not an exceptional case.
    - **What concurrency controls remain**: Per-project concurrency limits (2-3 concurrent tasks) enforced via Inngest concurrency controls. This prevents resource exhaustion without requiring file-level tracking.
    - **Cross-department generalization note**: For future non-engineering departments (marketing, finance), API-level conflicts (e.g., two agents modifying the same ad account) are handled by Inngest's per-function concurrency, not custom locking.
  - Keep the section heading "### 7.6 Concurrent Task Conflicts" but update the content entirely
  - The tone should match the rest of the document: direct, opinionated, explains the "why" not just the "what"

  **Must NOT do**:
  - Do NOT propose additional conflict resolution mechanisms beyond what's described above
  - Do NOT reference file-level locking as a future feature (it's removed, not deferred)
  - Do NOT add a Mermaid diagram to this section (the original didn't have one)
  - Do NOT edit any other section (locking references in Sections 6, 10, 18 are handled by Task 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single section rewrite with clear requirements — replace existing content with new narrative
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 6 (must use consistent language), F1, F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:589-599` — Current Section 7.6 content to be replaced
  - `docs/2026-03-22-2317-ai-employee-architecture.md:537-548` — Section 7.3 (Fly.io Machine Lifecycle) establishes the isolation property this section will reference
  - `docs/2026-03-22-2317-ai-employee-architecture.md:506-534` — Sections 7.1-7.2 for tone and style reference

  **WHY Each Reference Matters**:
  - Section 7.3 already establishes that each task gets an isolated Fly.io machine — 7.6 should reference this rather than re-explain it
  - Sections 7.1-7.2 show the document's style: state the problem, explain the solution, justify the trade-off

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Section 7.6 contains no file-level locking language
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Read the updated Section 7.6
      2. Run: grep -n "file-level lock\|merge queue\|serialized.*queue\|locking mechanism" docs/2026-03-22-2317-ai-employee-architecture.md | grep -A0 -B0 "7\.6"
      3. Assert: 0 matches within Section 7.6
    Expected Result: Section 7.6 contains zero references to file-level locking or merge queues
    Failure Indicators: Any match for locking/queue terms within the section boundaries
    Evidence: .sisyphus/evidence/task-2-section-7-6-grep.txt

  Scenario: Section 7.6 explains Fly.io isolation
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Read the updated Section 7.6
      2. Verify it contains: "Fly.io" or "isolated" or "isolation" (the core concept)
      3. Verify it contains: "merge conflict" or "Git" (the natural resolution mechanism)
      4. Verify it contains: "concurrency" (the remaining control)
    Expected Result: All three concepts present in the rewritten section
    Failure Indicators: Missing any of the three core concepts
    Evidence: .sisyphus/evidence/task-2-section-7-6-content.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs: apply MVP simplification — rewrite locking, defer pgvector pipeline and rate limiting, add MVP callouts`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 3. Section 12 — Mark pgvector Pipeline Deferred, Clarify MVP Approach

  **What to do**:
  - Read Section 12 (Knowledge Base Architecture) starting around line 1068
  - Add an MVP Scope callout blockquote immediately after the section heading (before the first paragraph), using this format:
    ```
    > **MVP Scope**: The pgvector embedding pipeline (Layer 1 indexing) is deferred for MVP. Triage agents use OpenCode's built-in codebase search (file search, LSP, grep, AST tools) for code context, and direct SQL queries on the `tasks` table for institutional memory. The task history tables (Layer 2) are built for MVP. The full vector pipeline is documented below as the future enhancement path.
    ```
  - In the "Layer 1 — Vector Embeddings" subsection: add a note at the top: `> **Deferred for MVP.** The indexing pipeline below will be built when triage quality degrades in ways that OpenCode's native search can't address. See Section 28 for migration path.`
  - Before the Pipeline Diagram (Mermaid): add a note: `> **Note**: This diagram reflects the future-state pipeline. MVP uses direct SQL queries on the `tasks` table and OpenCode's native codebase search tools.`
  - Do NOT remove the diagram, the Layer descriptions, or the Migration Path subsection — they document the future state
  - Confirm that Layer 2 description and the Per-Department Content table have NO deferred callouts

  **Must NOT do**:
  - Do NOT mark Layer 2 (Task History) as deferred — it IS built for MVP
  - Do NOT remove the Mermaid diagram — annotate it as future state
  - Do NOT restructure the section — add callouts only
  - Do NOT edit any other section

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add callout blockquotes to existing section, no restructuring needed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: F1, F2, F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1068-1180` — Full Section 12 content
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1072-1098` — Layer 1 (Vector Embeddings) subsection — this is what's deferred
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1099-1107` — Layer 2 (Task History) — this is MVP, must NOT be marked deferred
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1117-1153` — Pipeline Diagram that needs "future state" annotation

  **WHY Each Reference Matters**:
  - Layer 1 vs Layer 2 distinction is critical — only the embedding pipeline is deferred, not the task history
  - The diagram shows the full pipeline as active; without annotation, it contradicts the MVP callout

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: MVP callout present at top of Section 12
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Run: grep -n "MVP Scope" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert: at least one match within Section 12 line range (~1068-1180)
      3. Verify the callout mentions "OpenCode" and "direct SQL queries"
    Expected Result: MVP callout present with both OpenCode and SQL references
    Failure Indicators: Missing callout or missing key terms
    Evidence: .sisyphus/evidence/task-3-section-12-callout.txt

  Scenario: Layer 2 is NOT marked deferred
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Read the Layer 2 subsection (~lines 1099-1107)
      2. Run: grep -n "Deferred\|deferred\|MVP Scope" docs/2026-03-22-2317-ai-employee-architecture.md | grep -A0 "Task History"
      3. Assert: 0 matches (no deferred callout on Layer 2)
    Expected Result: Layer 2 has no deferred annotation
    Failure Indicators: Any "Deferred" or "MVP Scope" text near "Task History" heading
    Evidence: .sisyphus/evidence/task-3-layer2-not-deferred.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs: apply MVP simplification — rewrite locking, defer pgvector pipeline and rate limiting, add MVP callouts`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 4. Section 24 — Reframe API Rate Limiting as Deferred

  **What to do**:
  - Read Section 24 (API Rate Limiting) starting around line 1907
  - Add an MVP Scope callout blockquote immediately after the section heading:
    ```
    > **MVP Scope**: The full centralized token bucket with backpressure and cross-worker coordination is deferred. MVP uses thin API service wrappers (`jiraClient`, `githubClient`) with built-in retry-on-429 logic. All external API calls go through these wrappers, providing a single insertion point for the full rate limiter later. See Section 28 for the migration path and cost analysis.
    ```
  - In "### Solution: Centralized Token Bucket" subsection: add a note at the top: `> **Deferred for MVP.** The token bucket design below will be built when concurrent task volume causes cascading 429 failures. MVP uses retry-on-429 in the thin API service wrappers.`
  - In the "### Backpressure" subsection: add the same deferred note
  - In the "### Monitoring" subsection: add a note: `> **Deferred for MVP.** Rate limit monitoring will be added alongside the full token bucket. MVP relies on Inngest execution logs to spot rate-limit-related failures.`
  - Keep the "### Per-API Configuration" table as-is but add a note above it: `> **Future reference**: These limits will be used when the full token bucket is implemented.`
  - Do NOT restructure the section — add callouts only

  **Must NOT do**:
  - Do NOT delete the section content — it documents the future design
  - Do NOT restructure or reorder subsections
  - Do NOT edit any other section

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add callout blockquotes to existing section, no restructuring needed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 7 (Section 28 needs monitoring content reference), F1, F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1907-1936` — Full Section 24 content
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1913-1918` — Token Bucket subsection
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1919` — Backpressure subsection
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1921-1931` — Per-API Configuration table
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1932-1936` — Monitoring subsection

  **WHY Each Reference Matters**:
  - Each subsection needs its own deferred note because readers may jump directly to a subsection
  - The Per-API table is valuable future reference — keep it but mark it as future

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Section 24 has MVP callout
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Run: grep -n "MVP Scope" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert: at least one match within Section 24 line range (~1907-1940)
      3. Verify callout mentions "thin API service wrappers" and "retry-on-429"
    Expected Result: MVP callout present with both wrapper and retry references
    Failure Indicators: Missing callout or missing key terms
    Evidence: .sisyphus/evidence/task-4-section-24-callout.txt

  Scenario: Per-API table preserved with future reference note
    Tool: Read
    Preconditions: Task edits applied
    Steps:
      1. Read Section 24
      2. Verify the Per-API Configuration table still has all 5 API rows
      3. Verify a "Future reference" note appears above the table
    Expected Result: Table intact with 5 rows, future reference note present
    Failure Indicators: Table missing rows or no future reference note
    Evidence: .sisyphus/evidence/task-4-api-table-preserved.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs: apply MVP simplification — rewrite locking, defer pgvector pipeline and rate limiting, add MVP callouts`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 5. Sections 22 + 23 — Add MVP Callouts to LLM Gateway and Agent Versioning

  **What to do**:
  - Read Section 22 (LLM Gateway Design) starting around line 1765
  - Add an MVP Scope callout blockquote immediately after the "## 22. LLM Gateway Design" heading (before the first paragraph):
    ```
    > **MVP Scope**: MVP implements a minimal `callLLM({ model, messages, taskType })` wrapper function that all agents use. Today it calls OpenRouter directly. This provides a single insertion point for adding Claude Max routing, fallback orchestration, and cost tracking later — without modifying any agent code. The full gateway design below documents the future enhancement path.
    ```
  - Read Section 23 (Agent Versioning) starting around line 1873
  - Add an MVP Scope callout blockquote immediately after the "## 23. Agent Versioning" heading:
    ```
    > **MVP Scope**: MVP implements minimal versioning: the `agent_versions` table with `prompt_hash`, `model_id`, and `tool_config_hash`, and every `EXECUTION` record links to its `agent_version_id`. This preserves the forensic trail (which version ran which task) from day one. Performance profiles, A/B testing, and the formal rollback mechanism described below are future enhancements.
    ```
  - Do NOT restructure, reorder, or rewrite any existing content in either section

  **Must NOT do**:
  - Do NOT restructure Sections 22 or 23 — add callout blockquotes ONLY
  - Do NOT rewrite existing paragraphs
  - Do NOT remove the existing detailed descriptions (they document future state)
  - Do NOT edit any other section

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small callout additions, no restructuring
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4)
  - **Blocks**: F1, F3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1765-1870` — Section 22 (LLM Gateway Design)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1873-1903` — Section 23 (Agent Versioning)

  **WHY Each Reference Matters**:
  - The callout must go immediately after the section heading, before the first paragraph — reading the section structure ensures correct placement

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Both sections have MVP callouts
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Run: grep -n "MVP Scope" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert: matches within Section 22 range (~1765-1870) AND Section 23 range (~1873-1903)
      3. Verify Section 22 callout mentions "callLLM" wrapper
      4. Verify Section 23 callout mentions "agent_versions table" and "forensic trail"
    Expected Result: Both callouts present with key terms
    Failure Indicators: Missing either callout or missing key terms
    Evidence: .sisyphus/evidence/task-5-sections-22-23-callouts.txt

  Scenario: Existing content unchanged
    Tool: Read
    Preconditions: Task edits applied
    Steps:
      1. Read Section 22 first paragraph (should start with "All agent code calls the LLM Gateway...")
      2. Read Section 23 first paragraph (should start with "Every agent that runs in this platform is versioned...")
      3. Verify both paragraphs are identical to original
    Expected Result: Original content preserved exactly
    Failure Indicators: Any modification to existing paragraphs
    Evidence: .sisyphus/evidence/task-5-content-preserved.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs: apply MVP simplification — rewrite locking, defer pgvector pipeline and rate limiting, add MVP callouts`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 6. Sections 6, 10, 18 — Update All Remaining Locking References

  **What to do**:
  - This task updates the 3 remaining locking references outside of Section 7.6 (which Task 2 rewrites). The language must be consistent with Task 2's rewrite.
  - **Section 6 (line ~423)**: Find the paragraph about "Unique challenge — concurrent file conflicts" in Section 6.1 (Engineering Department). Replace the file-level conflict detection and serialized PR merge queue description with: Each engineering task runs on an isolated Fly.io machine with its own git clone, so concurrent tasks cannot conflict at the filesystem level. When two tasks modify overlapping files, both create PRs independently. Merge conflicts are resolved naturally by Git at PR review time — the review agent rebases as needed. Per-project concurrency limits (2-3 tasks) prevent resource exhaustion.
  - **Section 10 (line ~954)**: Find the sentence "The Concurrency Scheduler checks per-project concurrency limits and file-level conflict locks before allowing dispatch." Replace "and file-level conflict locks" so the sentence reads: "The Concurrency Scheduler checks per-project concurrency limits before allowing dispatch." (Remove file-level lock reference, keep concurrency limits.)
  - **Section 18 (line ~1595)**: Find the risk mitigation table row "Merge conflicts between concurrent PRs | File-level conflict detection at dispatch; serialized merge queue with rebase-on-merge." Replace the mitigation with: "Each task runs on an isolated Fly.io machine with its own git clone. Merge conflicts surface naturally at PR merge time and are resolved by the review agent via rebase."
  - Read Task 2's output (Section 7.6) first to match language and tone

  **Must NOT do**:
  - Do NOT edit Section 7.6 (that's Task 2's scope)
  - Do NOT add new locking or conflict detection mechanisms
  - Do NOT edit any sections beyond 6, 10, 18

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Three small, targeted edits across known locations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: F1, F3
  - **Blocked By**: Task 2 (must match Section 7.6 language)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:421-424` — Section 6.1 "Unique challenge" paragraph about concurrent file conflicts
  - `docs/2026-03-22-2317-ai-employee-architecture.md:954` — Section 10 Concurrency Scheduler sentence with "file-level conflict locks"
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1595` — Section 18 risk mitigation table row for "Merge conflicts between concurrent PRs"

  **WHY Each Reference Matters**:
  - Section 6 is a summary of the old Section 7.6 — if 7.6 changes, 6 must match
  - Section 10 describes what the scheduler checks — removing file-level locks from the check is a one-sentence edit
  - Section 18 is a risk mitigation table — the mitigation strategy must reflect the new approach

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All locking language removed from Sections 6, 10, 18
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Run: grep -n "file-level lock\|file-level conflict\|merge queue\|serialized.*queue\|conflict lock\|locking mechanism" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Filter results: exclude any matches in Section 28 (line ~2128+)
      3. Assert: 0 matches outside Section 28
    Expected Result: Zero locking language in active sections
    Failure Indicators: Any match before line 2128
    Evidence: .sisyphus/evidence/task-6-locking-grep.txt

  Scenario: Replacement text mentions Fly.io isolation
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Read the updated paragraphs in Sections 6, 10, 18
      2. Verify Section 6 mentions "isolated Fly.io machine" and "merge conflicts"
      3. Verify Section 10 mentions only "concurrency limits" (no file-level locks)
      4. Verify Section 18 mentions "isolated Fly.io machine" in the mitigation column
    Expected Result: All three sections reference the new approach
    Failure Indicators: Missing Fly.io isolation language or residual locking language
    Evidence: .sisyphus/evidence/task-6-replacement-text.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `docs: update cross-references and expand deferred capabilities section`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 7. Section 28 — Add 3 New Deferred Items + Update Custom Orchestrator Entry

  **What to do**:
  - Read Section 28 (Deferred Capabilities & Future Scale Path) starting around line 2128
  - Add 3 new rows to the deferred capabilities table, using the EXACT existing column format: `Deferred Capability | What We Use Instead (V1) | What We Gave Up | When to Reconsider | Migration Path`
  - **Row 1 — pgvector Embedding Pipeline**:
    - What We Use Instead (V1): OpenCode's native codebase search (file search, LSP, grep, AST tools) for code context. Direct SQL queries on `tasks` table for institutional memory. No vector similarity.
    - What We Gave Up: Semantic similarity search for triage context. Agents can't ask "find files similar to this ticket" — they search by keyword/structure instead. Lower recall for ambiguous tickets.
    - When to Reconsider: When triage agents frequently identify the wrong files or miss relevant past tasks. Track via the `feedback` table — if triage overrides exceed 30% for "wrong context" reasons, add the pipeline.
    - Migration Path: Add `knowledge_embeddings` table to Supabase, build webhook-triggered indexing (on merge to `main`), add embedding generation via OpenRouter (`text-embedding-3-small`), update triage query interface. ~2-3 days of agent work. No existing code changes — purely additive.
  - **Row 2 — Full API Rate Limiting (Token Bucket + Backpressure)**:
    - What We Use Instead (V1): Thin API service wrappers (`jiraClient.getTicket()`, `githubClient.createPR()`) with built-in retry-on-429 logic. No proactive rate tracking.
    - What We Gave Up: Proactive backpressure (delaying dispatch before hitting limits), cross-worker coordination (shared rate budget), per-API monitoring dashboards.
    - When to Reconsider: When concurrent tasks cause cascading 429 failures, or when adding Meta Ads API (stricter limits than Jira/GitHub). At MVP volume (2-3 concurrent tasks, one project), this is unlikely.
    - Migration Path: Add token bucket middleware to the thin API wrappers (single insertion point). Add Supabase table for cross-worker bucket state. Add Slack alerts at 80% utilization. ~1.5 days of agent work.
  - **Row 3 — Jira Reconciliation Cron Job**:
    - What We Use Instead (V1): Rely on Jira webhook delivery (99%+ reliable). Missed webhooks detected manually during daily monitoring.
    - What We Gave Up: Automatic detection and recovery of missed webhooks within 1 hour.
    - When to Reconsider: When task state drift is observed in production — tasks exist in Jira but not in the platform's task state store.
    - Migration Path: Add an Inngest cron function that polls Jira REST API hourly, compares against `tasks` table, and enqueues missing tasks. ~0.5 days of agent work. Standalone function with zero integration points — plug and play.
  - **Update existing "Custom Orchestrator" row**: Find the "When to Reconsider" cell that mentions "file-level locking across projects." Remove the file-level locking reference since locking is removed (not deferred). Replace with something like: "When Inngest's concurrency model is too coarse — e.g., you need custom priority algorithms or advanced scheduling logic."

  **Must NOT do**:
  - Do NOT change the existing 6 rows (BullMQ, LangGraph, LangSmith, Grafana, Custom Orchestrator, Dual-language) beyond the Custom Orchestrator "When to Reconsider" update
  - Do NOT change the table format or column structure
  - Do NOT edit any other section

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add rows to existing table in known format
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: F1, F3
  - **Blocked By**: Task 4 (Section 24 reframe provides monitoring content reference)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2128-2143` — Section 28 with the existing 6-row deferred capabilities table
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2138` — Custom Orchestrator row that references "file-level locking across projects"

  **WHY Each Reference Matters**:
  - New rows must match the exact column format of existing rows for table consistency
  - Custom Orchestrator row has stale locking reference that must be updated

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Section 28 has exactly 9 data rows
    Tool: Read
    Preconditions: Task edits applied
    Steps:
      1. Read Section 28
      2. Count data rows in the deferred capabilities table (exclude header and separator rows)
      3. Assert: exactly 9 data rows
      4. Verify new rows are: pgvector Embedding Pipeline, Full API Rate Limiting, Jira Reconciliation Cron Job
    Expected Result: 9 rows total, 3 new rows with correct titles
    Failure Indicators: Fewer or more than 9 rows, or missing expected row titles
    Evidence: .sisyphus/evidence/task-7-section-28-rows.txt

  Scenario: Custom Orchestrator row no longer mentions file-level locking
    Tool: Bash (grep)
    Preconditions: Task edits applied
    Steps:
      1. Run: grep -n "file-level lock" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert: 0 matches anywhere in the document (even Section 28 should not reference it as a locking feature)
    Expected Result: Zero file-level locking references in entire document
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-7-custom-orchestrator-update.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `docs: update cross-references and expand deferred capabilities section`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 8. Section 2 — Minor Locking Reference Cleanup

  **What to do**:
  - Read Section 2 (Platform Architecture) around line 60-133
  - Search for any mention of file-level locking, merge queues, or conflict detection in this section
  - Metis flagged line ~119 as a "minor reference" — verify if it exists and update if so
  - If no locking language is found in Section 2, mark this task as complete with no changes needed
  - If locking language IS found: update it to match the Fly.io isolation approach from Task 2

  **Must NOT do**:
  - Do NOT modify the Section 2 Mermaid diagram (it doesn't reference locking)
  - Do NOT restructure the section
  - Do NOT add MVP callouts to Section 2 (it's not in scope for callouts)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verify-and-maybe-edit task — may require no changes at all
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: F1, F3
  - **Blocked By**: Task 2 (must match Section 7.6 language)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:60-133` — Section 2 Platform Architecture

  **WHY Each Reference Matters**:
  - Metis flagged a potential minor locking reference here — needs verification

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No locking language in Section 2
    Tool: Bash (grep)
    Preconditions: Task edits applied (or no edits needed)
    Steps:
      1. Run: grep -n "file-level\|merge queue\|conflict lock\|locking" docs/2026-03-22-2317-ai-employee-architecture.md | head -20
      2. Filter: any matches within Section 2 line range (~60-133)
      3. Assert: 0 matches in Section 2
    Expected Result: Section 2 contains no locking language
    Failure Indicators: Any locking-related match in Section 2
    Evidence: .sisyphus/evidence/task-8-section-2-check.txt
  ```

  **Commit**: YES (groups with Wave 2, if changes made)
  - Message: `docs: update cross-references and expand deferred capabilities section`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 verification agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Grep Audit** — `quick`
  Run `grep -n "file-level lock\|merge queue\|conflict lock\|locking mechanism" docs/2026-03-22-2317-ai-employee-architecture.md` — expect 0 matches outside Section 28 deferred entries. Run `grep -n "PYWORKER\|Python Worker\|python worker\|In-Process Python" docs/2026-03-22-2317-ai-employee-architecture.md` — expect 0 matches outside Section 28. Run `grep -n "MVP Scope" docs/2026-03-22-2317-ai-employee-architecture.md` — verify all use consistent blockquote format `> **MVP Scope**:`. Count Section 28 table rows — expect exactly 9 data rows.
  Output: `Locking terms [PASS/FAIL] | Python terms [PASS/FAIL] | MVP format [PASS/FAIL] | Section 28 rows [N/9] | VERDICT`

- [x] F2. **Mermaid Syntax Validation** — `quick`
  Read every Mermaid code block in the document. Verify: Section 14 diagram does NOT contain `PYWORKER` node or edges. Section 12 diagram has annotation note before it. All edited diagrams have matching node definitions and edge references (no orphan nodes, no broken edges). Verify Section 14 flow walkthrough is numbered 1-7 consecutively.
  Output: `Section 14 diagram [PASS/FAIL] | Section 12 annotation [PASS/FAIL] | Walkthrough numbering [PASS/FAIL] | VERDICT`

- [x] F3. **Cross-Reference & Scope Fidelity** — `quick`
  Verify Sections 1–5, 8–9, 11, 13, 15–17, 19–21, 25–27 are UNTOUCHED (compare line counts or content hashes). Verify Section 13 (Data Model) has NO "deferred" callouts. Verify Section 12 Layer 2 is NOT marked deferred. Verify document still has exactly 28 sections. Verify no MVP callouts appear in out-of-scope sections.
  Output: `Untouched sections [N/N clean] | Data model [CLEAN] | Layer 2 [NOT deferred] | Section count [28] | VERDICT`

---

## Commit Strategy

- **Commit 1** (after Wave 1): `docs: apply MVP simplification — rewrite locking, defer pgvector pipeline and rate limiting, add MVP callouts`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
- **Commit 2** (after Wave 2): `docs: update cross-references and expand deferred capabilities section`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

---

## Success Criteria

### Verification Commands
```bash
grep -c "file-level lock\|merge queue\|conflict lock" docs/2026-03-22-2317-ai-employee-architecture.md  # Expected: 0 (outside Section 28)
grep -c "PYWORKER\|Python Worker" docs/2026-03-22-2317-ai-employee-architecture.md  # Expected: 0 (outside Section 28)
grep -c "MVP Scope" docs/2026-03-22-2317-ai-employee-architecture.md  # Expected: 5 (one per section: 7.6, 12, 22, 23, 24)
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All 6 locking references updated consistently
- [x] Python Worker fully removed from Section 14
- [x] Section 28 has 9 rows with cost analysis
- [x] Document reads coherently end-to-end
