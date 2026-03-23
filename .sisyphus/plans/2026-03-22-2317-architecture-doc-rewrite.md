# AI Employee Platform — Architecture Document Rewrite

## TL;DR

> **Quick Summary**: Complete rewrite of the Digital AI Employee Platform architecture document, incorporating 16 major decisions from a 6-round collaborative review. Replaces OpenClaw with hybrid OpenCode/LangGraph runtimes, Temporal with custom orchestrator, Qdrant with pgvector in Supabase, and adds 7 new sections (feedback loops, LLM gateway, agent versioning, API rate limiting, disaster recovery, operational runbooks, security model).
>
> **Deliverables**:
> - Complete revised architecture document at `docs/2026-03-22-ai-employee-architecture.md`
> - All 20+ sections rewritten to reflect interview decisions
> - 7 new sections added
> - All Mermaid diagrams updated
> - Cost estimates, tech stack, and roadmap revised
>
> **Estimated Effort**: Large (document is 3,000+ words across 20+ sections; rewrite will be larger)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (skeleton) → Tasks 2-8 (sections in parallel) → Tasks 9-15 (more sections) → Task 16 (final review + consistency)

---

## Context

### Original Request
User has an existing architecture document for a "Digital AI Employee Platform" that was generated with AI assistance. After a 6-round collaborative interview, 16 major decisions were made that fundamentally change the tech stack, scope, and approach. The document needs a complete rewrite incorporating all decisions.

### Interview Summary
**Key Discussions**:
- Solo developer — architecture must minimize operational complexity
- Internal first, SaaS later — design for future multi-tenancy without building it now
- Engineering MVP + Paid Marketing second department to validate archetype pattern
- Hybrid agent runtime: OpenCode for engineering, LangGraph for non-engineering
- Existing nexus-stack codebase already has a working Fly.io dispatch system with OpenCode
- Supabase already in use — confirmed as database choice with pgvector replacing Qdrant
- OpenRouter as LLM router + Claude Max subscription as cost optimization
- Slack-first human interaction model
- 2-layer knowledge base initially (vectors + task history)

**Research Findings**:
- OpenClaw ≠ OpenCode (different tools; doc incorrectly specifies OpenClaw)
- BullMQ Python client is production-ready (1.7M+ downloads, official package)
- Supabase has MCP server + pgvector + Edge Functions (best for AI-first automation)
- OpenCode SDK (`@opencode-ai/sdk`) provides HTTP server API for programmatic control
- LangGraph has durable execution via PostgreSQL checkpointing (suitable for non-coding workflows)

### Gap Analysis (Self-Conducted)
**Identified gaps to address in rewrite**:
1. Original doc specifies OpenClaw — must be replaced with hybrid OpenCode/LangGraph
2. Original doc specifies Temporal.io — must be replaced with custom orchestrator
3. No feedback loop mechanism described
4. No LLM gateway abstraction
5. No agent versioning strategy
6. No API rate limiting across concurrent tasks
7. No disaster recovery plan
8. No operational runbooks for solo developer
9. No security model for credential management
10. Non-MVP departments over-specified (full pages instead of paragraph summaries)
11. Cost estimates don't reflect OpenRouter pricing or Claude Max optimization
12. Implementation roadmap assumes team, not solo developer
13. Missing: how nexus-stack's existing fly-worker pattern informs the engineering department design
14. Mermaid diagrams reference wrong technologies
15. Data model doesn't include feedback, versioning, or LLM gateway tables

---

## Work Objectives

### Core Objective
Produce a complete, revised architecture document that accurately reflects all 16 decisions from the collaborative review, adds 7 missing sections, and serves as the definitive blueprint for building the AI Employee Platform.

### Concrete Deliverables
- Revised architecture document at `docs/2026-03-22-ai-employee-architecture.md` (overwrite existing)
- All sections coherent and cross-referenced
- All Mermaid diagrams valid and reflecting actual tech stack
- Cost estimates based on real pricing (OpenRouter, Supabase, Fly.io, Upstash)

### Definition of Done
- [ ] Document reads as a coherent whole (not a patchwork of edits)
- [ ] No references to OpenClaw anywhere (replaced with OpenCode/LangGraph)
- [ ] No references to Temporal.io as primary orchestrator (replaced)
- [ ] No references to Qdrant (replaced with pgvector in Supabase)
- [ ] All 7 new sections present and substantive
- [ ] Non-MVP departments reduced to 1-paragraph vision summaries
- [ ] All Mermaid diagrams render correctly
- [ ] Implementation roadmap reflects solo developer constraints
- [ ] Cost estimates use real pricing

### Must Have
- Accurate tech stack reflecting all 16 decisions
- Hybrid runtime architecture clearly explained (OpenCode for eng, LangGraph for non-eng)
- nexus-stack's fly-worker pattern referenced as proven engineering baseline
- All original strong sections preserved (archetype abstraction, universal lifecycle, risk model, shadow→supervised→autonomous)
- 7 new sections: Feedback Loops, LLM Gateway, Agent Versioning, API Rate Limiting, Disaster Recovery, Operational Runbooks, Security Model

### Must NOT Have (Guardrails)
- No references to OpenClaw (wrong tool)
- No Temporal.io as primary orchestrator (too heavy for solo dev)
- No Qdrant (replaced by pgvector)
- No full multi-page specs for Finance, Sales, or Content departments (vision only)
- No cost estimates based on assumptions (must use real pricing)
- No SaaS/multi-tenancy features described as "built in V1" (future only)
- No team-based roadmap timelines (must reflect solo developer reality)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (this is a documentation task)
- **Automated tests**: None (document, not code)
- **Framework**: N/A

### QA Policy
Every task MUST verify:
1. The section is written and placed correctly in the document
2. Mermaid diagrams (if any) render without syntax errors
3. Cross-references to other sections are valid
4. No references to replaced technologies (OpenClaw, Temporal, Qdrant)
5. Content matches the interview decisions recorded in the draft

Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — document skeleton + core sections):
├── Task 1: Document skeleton + Sections 1-2 (Vision + Platform Architecture) [writing]
├── Task 2: Section 3 (Employee Archetype Framework — revised) [writing]
├── Task 3: Section 4 (Universal Task Lifecycle — preserved with fixes) [writing]
└── Task 4: Section 5 (Cross-Department Workflows — preserved with updates) [writing]

Wave 2 (Department specs + new sections batch 1):
├── Task 5: Section 6 (Department Archetypes — Engineering full + Marketing detailed + others trimmed) [writing]
├── Task 6: Section 7 (Architecture Review & Design Decisions — revised) [writing]
├── Task 7: Sections 8-9 (Engineering System Context + Phase Details — revised with OpenCode) [writing]
├── Task 8: Sections 10-11 (Orchestration/Scaling + Lifecycle Sequence — revised) [writing]
├── Task 9: NEW Section — Feedback Loops [writing]
└── Task 10: NEW Section — LLM Gateway Design [writing]

Wave 3 (New sections batch 2 + infrastructure sections):
├── Task 11: Section 12 (Knowledge Base Architecture — revised for 2 layers + pgvector) [writing]
├── Task 12: Section 13-14 (Data Model + Shared Infrastructure — revised) [writing]
├── Task 13: NEW Section — Agent Versioning [writing]
├── Task 14: NEW Section — API Rate Limiting [writing]
├── Task 15: NEW Section — Security Model [writing]
└── Task 16: NEW Section — Disaster Recovery [writing]

Wave 4 (Remaining sections + final assembly):
├── Task 17: Section 15 (Technology Stack — completely revised) [writing]
├── Task 18: Section 16 (Implementation Roadmap — revised for solo dev) [writing]
├── Task 19: Sections 17-18 (Cost Estimation + Risk Mitigation — revised) [writing]
├── Task 20: Sections 19-20 (Onboarding Checklist + Success Metrics — revised) [writing]
├── Task 21: NEW Section — Operational Runbooks [writing]
└── Task 22: Final consistency review + Mermaid validation [deep]

Wave FINAL (Verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Content quality review (unspecified-high)
├── Task F3: Mermaid diagram validation (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → All other tasks (depend on skeleton) → Task 22 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Waves 2 & 3)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|---|---|---|
| 1 | None | 2-22 (creates document skeleton) |
| 2-4 | 1 | 22 |
| 5-10 | 1 | 22 |
| 11-16 | 1 | 22 |
| 17-21 | 1 | 22 |
| 22 | 2-21 | F1-F4 |
| F1-F4 | 22 | User okay |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1-T4 → `writing`
- **Wave 2**: **6** — T5-T10 → `writing`
- **Wave 3**: **6** — T11-T16 → `writing`
- **Wave 4**: **6** — T17-T21 → `writing`, T22 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create document skeleton + Sections 1-2 (Vision + Platform Architecture)

  **What to do**:
  - Read the original document at `docs/2026-03-22-ai-employee-architecture.md` for reference structure
  - Read the interview draft at `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` for all decisions
  - Create the full document skeleton with all section headers (20+ sections including 7 new ones)
  - Write Section 1 (Platform Vision): Preserve the core insight (trigger→triage→execute→review→deliver) but update to reflect hybrid runtime, solo developer context, and internal-first product model
  - Write Section 2 (Platform Architecture): Update the Mermaid diagram to show Supabase instead of generic State Store, BullMQ instead of generic Job Queues, and the hybrid runtime architecture. Remove OpenClaw references.
  - Update the Mermaid diagram: External Ecosystem should include Jira, GitHub, Meta Ads, GoHighLevel, Slack. Shared Platform should show Event Gateway (Fastify), BullMQ+Redis, Supabase, Observability. Department Runtimes should show Engineering (OpenCode) and Marketing (LangGraph) as active, Finance/Sales as future.

  **Must NOT do**:
  - Reference OpenClaw anywhere
  - Include Temporal.io as a component
  - Include Qdrant as a component

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: This is a documentation/architecture writing task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (creates skeleton other tasks depend on)
  - **Parallel Group**: Wave 1 — this task must complete FIRST
  - **Blocks**: Tasks 2-22 (all depend on skeleton existing)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original document structure and content to preserve/revise

  **Decision References**:
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — All 16 decisions, tech stack tables, and architecture changes. This is the SOURCE OF TRUTH for what should change.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Document skeleton exists with all section headers
    Tool: Bash (grep)
    Steps:
      1. grep -c "^## " docs/2026-03-22-ai-employee-architecture.md
      2. Assert count >= 25 (20 original + 7 new sections)
    Expected Result: All section headers present
    Evidence: .sisyphus/evidence/task-1-skeleton-headers.txt

  Scenario: No forbidden technology references
    Tool: Bash (grep)
    Steps:
      1. grep -ci "openclaw" docs/2026-03-22-ai-employee-architecture.md
      2. grep -ci "qdrant" docs/2026-03-22-ai-employee-architecture.md (except in "considered" context)
    Expected Result: 0 matches for OpenClaw, 0 for Qdrant as active component
    Evidence: .sisyphus/evidence/task-1-forbidden-terms.txt

  Scenario: Section 2 Mermaid diagram renders correctly
    Tool: Bash (grep + visual inspection)
    Steps:
      1. Extract Mermaid block from Section 2
      2. Verify it contains: Supabase, BullMQ, Fastify, OpenCode, LangGraph
      3. Verify no OpenClaw, Temporal, Qdrant nodes
    Expected Result: Diagram reflects revised tech stack
    Evidence: .sisyphus/evidence/task-1-mermaid-section2.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 2. Section 3 — Employee Archetype Framework (revised)

  **What to do**:
  - Preserve the archetype abstraction concept (this is the strongest idea in the doc)
  - Update the Archetype Schema table (Section 3.1): Add a `runtime` field (values: `opencode`, `langgraph`, `in-process`). Add a `runtime_config` field for runtime-specific configuration. Update examples to use OpenCode for Engineering and LangGraph for Marketing.
  - Update the Archetype Composition diagram (Section 3.2): Add Runtime selection to the composition. Show how archetype config wires to either OpenCode or LangGraph workers.
  - Preserve Section 3.3 (Why Archetypes Matter) but add a note about how the hybrid runtime model means each department can use the best-fit agent technology.
  - Add `runtime_config` examples showing Fly.io machine config for engineering vs in-process config for marketing.

  **Must NOT do**:
  - Remove or weaken the archetype abstraction
  - Reference OpenClaw
  - Imply all departments must use the same runtime

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4)
  - **Blocks**: Task 22 (final review)
  - **Blocked By**: Task 1 (skeleton must exist)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Section 3 for archetype schema, composition diagram, and rationale
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — "FINAL Architecture Stack" table and "Hybrid runtime" decision

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype schema includes runtime field
    Tool: Bash (grep)
    Steps:
      1. grep -A2 "runtime" docs/2026-03-22-ai-employee-architecture.md | head -20
      2. Verify `runtime` and `runtime_config` appear in the schema table
    Expected Result: Both fields present with Engineering (opencode) and Marketing (langgraph) examples
    Evidence: .sisyphus/evidence/task-2-runtime-field.txt

  Scenario: Mermaid diagram updated
    Tool: Bash (grep)
    Steps:
      1. Search for "Archetype Composition" Mermaid block
      2. Verify it includes a Runtime node
    Expected Result: Diagram shows runtime selection in archetype composition
    Evidence: .sisyphus/evidence/task-2-mermaid-composition.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 3. Section 4 — Universal Task Lifecycle (preserved with fixes)

  **What to do**:
  - Preserve the state machine diagram — it's well-designed and department-agnostic
  - Fix the Provisioning state: Make it conditional based on `runtime_config.type`. When `type = "in-process"`, skip Provisioning and go directly from Ready to Executing. Add a note explaining this.
  - Update the department-specific interpretations table: Keep Engineering and Marketing (Paid) detailed. Reduce Finance and Sales to abbreviated entries. Remove or collapse Content Marketing row.
  - Add a note about the fix loop design improvement: When execution fails at a specific stage (e.g., lint), the retry should re-enter at the failing stage, not restart from code generation. This prevents oscillation.

  **Must NOT do**:
  - Break the state machine's department-agnostic design
  - Remove existing states (they're all valid)
  - Add engineering-specific states to the universal machine

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4)
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Section 4 state machine and department table

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: State machine preserved and Provisioning made conditional
    Tool: Bash (grep)
    Steps:
      1. grep "Provisioning" docs/2026-03-22-ai-employee-architecture.md
      2. Verify conditional skip note exists
    Expected Result: Provisioning state exists but documented as skippable for in-process runtimes
    Evidence: .sisyphus/evidence/task-3-provisioning.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 4. Section 5 — Cross-Department Workflows (preserved with updates)

  **What to do**:
  - Preserve the cross-department workflow concept and the event contract
  - Update the Mermaid diagram: Keep the Sales→Engineering→Finance→Marketing flow. Mark Engineering and Marketing as active (solid lines), Finance as future (dashed).
  - Preserve the JSON event contract but add a `runtime_hint` field so the receiving department knows which runtime to use.
  - Add a note that cross-department workflows are a Phase 2+ feature (after both Engineering and Marketing departments are operational independently).

  **Must NOT do**:
  - Remove the cross-department concept (it's important for the vision)
  - Present it as a V1 feature
  - Over-specify the implementation

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Section 5, workflow diagram, and event contract JSON

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cross-department section preserved and marked as Phase 2+
    Tool: Bash (grep)
    Steps:
      1. grep -i "phase 2\|cross-department" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: Section exists and explicitly notes this is Phase 2+ functionality
    Evidence: .sisyphus/evidence/task-4-cross-dept.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 5. Section 6 — Department Archetypes (Engineering full + Marketing detailed + others trimmed)

  **What to do**:
  - **Section 6.1 (Engineering)**: Keep detailed. Update to reference OpenCode as agent runtime, Fly.io machines for execution, and the nexus-stack fly-worker pattern as proven baseline. Mention the existing `orchestrate.mjs`, `dispatch.sh`, and `entrypoint.sh` as the starting point. Update trigger sources, tools, and knowledge base to reflect 2-layer KB decision.
  - **Section 6.2 (Paid Marketing)**: Keep detailed (this is the second department). Update to reference LangGraph as agent runtime, in-process Python workers for execution. Keep the risk model table. Note that creative generation is deferred — V1 focuses on campaign optimization (API calls + analytics).
  - **Sections 6.3 (Organic Content), 6.4 (Finance), 6.5 (Sales)**: COLLAPSE each to a single paragraph summarizing the role, trigger sources, and key differentiator. Remove detailed tool lists, risk model tables, and delivery targets. These are vision-only.

  **Must NOT do**:
  - Remove Engineering or Marketing detail
  - Keep full multi-page specs for Finance, Sales, Content
  - Reference OpenClaw in any department spec

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-10)
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Sections 6.1-6.5
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — Decisions on scope, runtime choice, marketing scope (defer creative gen)
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/` — Existing engineering execution pipeline to reference

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Engineering and Marketing fully specified, others trimmed
    Tool: Bash
    Steps:
      1. Count lines in Engineering section (should be substantial, >50 lines)
      2. Count lines in Marketing section (should be substantial, >30 lines)
      3. Count lines in Finance/Sales/Content sections (should be <10 lines each)
    Expected Result: Engineering and Marketing detailed; others are 1-paragraph summaries
    Evidence: .sisyphus/evidence/task-5-dept-lengths.txt

  Scenario: Engineering references nexus-stack's fly-worker
    Tool: Bash (grep)
    Steps:
      1. grep -i "nexus\|fly-worker\|orchestrate.mjs\|dispatch.sh\|opencode serve" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: At least 2 references to existing nexus-stack implementation
    Evidence: .sisyphus/evidence/task-5-nexus-refs.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 6. Section 7 — Architecture Review & Design Decisions (revised)

  **What to do**:
  - **7.1 (Polling vs Event-Driven)**: Preserve — still valid. Webhooks recommendation stands.
  - **7.2 (OpenClaw for Everything vs Separation of Concerns)**: COMPLETELY REWRITE. Now about the hybrid runtime decision: OpenCode for engineering (coding-specific), LangGraph for non-engineering (generic workflows), custom TS orchestrator for platform layer. Explain WHY this split makes sense.
  - **7.3 (Fly.io Machine Lifecycle)**: Update with lessons from nexus-stack: pre-built Docker images, ~5-10 second warm start, 8GB RAM machines, volume-cached pnpm store, Docker-in-Docker for Supabase. Reference actual timing data (cold=7.8min, warm=2.6min, target=<80s warm).
  - **7.4 (AI-Only PR Merge)**: Preserve — risk-based merge gates are still the right approach.
  - **7.5 (Knowledge Base Strategy)**: REVISE for 2-layer approach. Layer 1: pgvector embeddings in Supabase. Layer 2: Task history in Supabase. Explicitly note that Layers 3-4 (AST graph, living docs) are deferred. Explain the generalization for other departments.
  - **7.6 (Concurrent Task Conflicts)**: Preserve — file-level awareness is still important for engineering. Add note about how this generalizes (account-level for finance, contact-level for sales).

  **Must NOT do**:
  - Reference OpenClaw or Temporal in recommendations
  - Describe 4-layer knowledge base as V1 scope

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Section 7
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — Hybrid runtime decision, knowledge base decision, Fly.io timing data

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Section 7.2 reflects hybrid runtime decision
    Tool: Bash (grep)
    Steps:
      1. grep -A5 "Separation of Concerns\|Hybrid Runtime" docs/2026-03-22-ai-employee-architecture.md
      2. Verify OpenCode and LangGraph are both mentioned with rationale
    Expected Result: Section explains hybrid approach with clear reasoning
    Evidence: .sisyphus/evidence/task-6-hybrid-runtime.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 7. Sections 8-9 — Engineering System Context + Phase Details (revised with OpenCode)

  **What to do**:
  - **Section 8 (System Context)**: Update the Mermaid diagram. Replace generic "Triage Agent / Execution Agent / Review Agent" with OpenCode-specific labels. Show Fly.io, GitHub, Jira, Slack as external systems. Show Event Gateway, BullMQ, Supabase as platform. Show OpenCode agents as the worker pool.
  - **Section 9.1 (Triage Agent Flow)**: Preserve the flowchart. Update triage agent responsibilities to reference pgvector queries instead of "knowledge base queries". Note that the triage agent runs as an OpenCode session with MCP tools for Jira API access.
  - **Section 9.2 (Execution Agent Flow)**: MAJOR UPDATE. Reference the nexus-stack `entrypoint.sh` boot lifecycle as the proven pattern. Update provisioning strategy with actual data: pre-built Docker images, volume-cached pnpm store, ~5-10s warm start with pre-built image. Update fix loop: change from "fix → restart from CODE" to "fix → re-enter at failing stage". Keep the 3-iteration budget.
  - **Section 9.3 (Review Agent Flow)**: Preserve flowchart and responsibilities. Add note that review agent uses OpenCode with GitHub PR API MCP tools.

  **Must NOT do**:
  - Remove the phase flowcharts (they're valuable)
  - Reference OpenClaw
  - Ignore the existing nexus-stack implementation

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Sections 8-9
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/entrypoint.sh` — Existing boot lifecycle (lines 1-34 for overview)
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/orchestrate.mjs` — Existing orchestrator (lines 1-72 for architecture)
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/Dockerfile` — Existing Docker image setup
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/.sisyphus/plans/fly-dispatch-optimization.md` — Timing data and optimization findings

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Execution agent references nexus-stack boot lifecycle
    Tool: Bash (grep)
    Steps:
      1. grep -i "entrypoint\|boot lifecycle\|warm start\|pre-built" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: References to proven boot sequence with timing data
    Evidence: .sisyphus/evidence/task-7-boot-lifecycle.txt

  Scenario: Fix loop uses stage-targeted re-entry
    Tool: Bash (grep)
    Steps:
      1. grep -i "failing stage\|re-enter\|stage-targeted" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: Fix loop documented as re-entering at failing stage, not restarting from CODE
    Evidence: .sisyphus/evidence/task-7-fix-loop.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 8. Sections 10-11 — Orchestration/Scaling + Lifecycle Sequence (revised)

  **What to do**:
  - **Section 10 (Orchestration & Scaling)**: Update the Mermaid diagram to show BullMQ queues (not generic queues), the custom TS orchestrator (not Temporal), and OpenCode workers. Update scaling strategy to reflect solo developer constraints: start with 1-2 workers per phase, scale based on demand. Update concurrency model to reference Upstash Redis.
  - **Section 11 (Lifecycle Sequence)**: Update the sequence diagram. Replace generic agent labels with OpenCode-specific ones. Add Supabase as the state store participant. Show the Slack notification flow. Ensure the sequence reflects the actual nexus-stack flow: Jira webhook → Event Gateway → BullMQ → Orchestrator → OpenCode serve → Fly.io Machine → GitHub PR → Review → Slack.

  **Must NOT do**:
  - Reference Temporal.io as the orchestrator
  - Show unrealistic worker pool sizes for a solo developer

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Sections 10-11
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/.opencode/command/nexus-fly-dispatch.md` — Actual dispatch workflow and monitoring

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Orchestration diagram shows BullMQ and custom orchestrator
    Tool: Bash (grep)
    Steps:
      1. grep -i "bullmq\|custom orchestrator\|opencode" in the orchestration Mermaid block
    Expected Result: No Temporal references; BullMQ and OpenCode present
    Evidence: .sisyphus/evidence/task-8-orchestration.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 9. NEW Section — Feedback Loops

  **What to do**:
  Write a new section covering how human corrections improve AI behavior over time. Include:
  - **Correction Capture**: When a human overrides an AI decision (rejects a triage, requests changes on a PR, overrides a risk score), capture the before/after state and store in the task history table in Supabase.
  - **Prompt Refinement Queue**: Weekly aggregation of corrections. Group by type (triage errors, code quality issues, risk model misses). Use these to refine agent prompts and add to the knowledge base.
  - **Risk Model Tuning**: After each human escalation or missed escalation, adjust risk weights. Log the adjustment reason.
  - **Feedback Data Model**: Define the `feedback` table schema (task_id, feedback_type, original_decision, corrected_decision, correction_reason, timestamp).
  - **Mermaid diagram**: Simple flow showing Human Override → Feedback Capture → Weekly Aggregation → Prompt Refinement → Improved Agent Behavior.
  - Note that this is a V1 feature — design and build it from the start, not as an afterthought.

  **Must NOT do**:
  - Make feedback loops sound optional
  - Describe them as a Phase 2+ feature (they're V1)
  - Over-engineer the mechanism (simple logging + weekly review is sufficient for V1)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — Feedback loop decision (Design now, build V1)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Feedback loop section exists with all three mechanisms
    Tool: Bash (grep)
    Steps:
      1. grep -i "correction capture\|prompt refinement\|risk model tuning" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: All three feedback mechanisms described
    Evidence: .sisyphus/evidence/task-9-feedback.txt

  Scenario: Feedback data model defined
    Tool: Bash (grep)
    Steps:
      1. grep -i "feedback.*table\|feedback_type\|corrected_decision" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: Table schema or data model for feedback storage
    Evidence: .sisyphus/evidence/task-9-feedback-model.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 10. NEW Section — LLM Gateway Design

  **What to do**:
  Write a new section covering the LLM access abstraction layer. Include:
  - **Architecture**: All agent code calls the LLM Gateway, never a specific provider directly. The gateway abstracts model selection, routing, fallbacks, and cost tracking.
  - **Primary Interface**: OpenRouter API — provides access to all models (Claude, GPT, Gemini, open-source) at provider cost. Acts as the LLM router, replacing the need for a custom router.
  - **Cost Optimization**: Claude Max 20x subscription can be used as an optimization layer when available and under rate limits. The gateway falls back to OpenRouter when Max limits are hit.
  - **Fallback Chain**: Claude (via Max or OpenRouter) → GPT-4o (via OpenRouter) → cheaper model (GPT-4o-mini or open-source). Automatic failover.
  - **Cost Tracking**: Log token usage per task, per department, per model. Store in Supabase. Dashboard for monthly cost analysis.
  - **Model Selection by Task Type**: Triage (Sonnet — fast, cheap), Execution/Engineering (Opus — best code quality), Execution/Marketing (Sonnet — sufficient for API calls), Review (Sonnet — fast, cost-effective).
  - **Mermaid diagram**: Show Agent → LLM Gateway → OpenRouter → Provider, with Claude Max as optional bypass.
  - Note: OpenRouter eliminates the need for the "gpt-oss-20b or custom" LLM router from the original doc.

  **Must NOT do**:
  - Describe building a custom LLM router (OpenRouter handles this)
  - Make Claude Max the primary dependency (it's an optimization, not a requirement)
  - Include pricing that will be outdated (reference OpenRouter's live pricing page instead)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — LLM strategy decision (OpenRouter + Claude Max)
  - `/Users/victordozal/.config/opencode/opencode.json` — Existing OpenRouter and model configuration

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: LLM Gateway section describes OpenRouter as primary interface
    Tool: Bash (grep)
    Steps:
      1. grep -i "openrouter\|llm gateway\|fallback chain" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: OpenRouter described as primary LLM interface with fallback chain
    Evidence: .sisyphus/evidence/task-10-llm-gateway.txt

  Scenario: No custom LLM router described
    Tool: Bash (grep)
    Steps:
      1. grep -i "gpt-oss-20b\|custom.*router" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: 0 references to building a custom router
    Evidence: .sisyphus/evidence/task-10-no-custom-router.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 11. Section 12 — Knowledge Base Architecture (revised for 2 layers + pgvector)

  **What to do**:
  - Rewrite the knowledge base section for the 2-layer approach: Layer 1 (pgvector embeddings in Supabase) and Layer 2 (task history in Supabase). Explicitly note that Layers 3-4 (AST graph, living docs) are deferred.
  - Update the Mermaid diagram: Show Content Sources → Chunker → Embedding Generator → pgvector (Supabase). Remove Qdrant. Add Task History directly from Supabase tables.
  - Update the per-department knowledge base content table: Keep Engineering and Marketing detailed. Reduce Finance/Sales/Content to single-row entries.
  - Describe the indexing pipeline: For engineering, embed code chunks + docstrings + README files. For marketing, embed campaign playbooks + brand guidelines + performance data.
  - Note that pgvector replaces Qdrant for MVP. Migration path to Qdrant exists if vector performance becomes a bottleneck at scale (millions of vectors).

  **Must NOT do**:
  - Reference Qdrant as a current component
  - Describe 4-layer knowledge base as V1 scope
  - Over-engineer the indexing pipeline for V1

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 12-16)
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Section 12
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — Knowledge base decision (2 layers, pgvector, no Qdrant)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Knowledge base describes 2-layer approach with pgvector
    Tool: Bash (grep)
    Steps:
      1. grep -i "pgvector\|2.layer\|two.layer" docs/2026-03-22-ai-employee-architecture.md
      2. grep -ci "qdrant" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: pgvector mentioned, Qdrant not mentioned as active (only as future migration)
    Evidence: .sisyphus/evidence/task-11-kb-layers.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 12. Sections 13-14 — Data Model + Shared Infrastructure (revised)

  **What to do**:
  - **Section 13 (Data Model)**: Update the ER diagram. Add new entities: `FEEDBACK` (task_id, feedback_type, original_decision, corrected_decision), `AGENT_VERSION` (version_id, prompt_hash, model_id, timestamp), `LLM_USAGE` (task_id, model, tokens_in, tokens_out, cost, latency). Add `tenant_id` to all entities (for future SaaS). Add `runtime` field to ARCHETYPE entity. Replace generic storage references with Supabase.
  - **Section 14 (Shared Infrastructure)**: Update the Mermaid diagram. Compute Layer: Fly.io Machines, In-Process Python Workers (remove generic "Lightweight Containers"). Data Layer: Supabase (replaces PostgreSQL + Qdrant), Upstash Redis (replaces generic Redis), Object Storage (keep). Observability: LangSmith (add), Grafana (keep), Structured Logging (keep). Security: Supabase Auth (for future SaaS), Fly.io Secrets (for credentials), Audit Log (keep).
  - Update the Runtime Selection table: Fly.io Machine for Engineering, In-Process Python Worker for Marketing, In-Process Worker for Sales/Finance. Update cost profiles.

  **Must NOT do**:
  - Remove the ER diagram (it's valuable)
  - Reference Qdrant, generic PostgreSQL, or Temporal in infrastructure
  - Design full multi-tenancy (just add tenant_id columns)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Sections 13-14

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Data model includes new entities
    Tool: Bash (grep)
    Steps:
      1. grep -i "FEEDBACK\|AGENT_VERSION\|LLM_USAGE\|tenant_id" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: All new entities present in ER diagram
    Evidence: .sisyphus/evidence/task-12-data-model.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 13. NEW Section — Agent Versioning

  **What to do**:
  Write a new section covering how to track which prompt/model version produced which results:
  - **Version Schema**: Each agent version is a tuple of (prompt_template_hash, model_id, tool_config_hash, timestamp). Stored in `agent_versions` table in Supabase.
  - **Linking**: Every task execution records the `agent_version_id` used. This enables "which version of the triage agent misclassified this ticket?"
  - **Rollback**: If a new prompt version performs worse, roll back to the previous version by updating the archetype's `agent_version_id`.
  - **A/B Testing** (future): Route a percentage of tasks to a new version while keeping the proven version as default. Compare metrics after N tasks.
  - **Changelog**: Maintain a simple changelog of agent version updates (date, change description, reason, performance delta).

  **Must NOT do**:
  - Over-engineer versioning (simple hash-based tracking is sufficient)
  - Build a full MLOps pipeline (this is V1)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Agent versioning section describes version schema and linking
    Tool: Bash (grep)
    Steps:
      1. grep -i "agent.version\|prompt.*hash\|rollback" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: Version schema and rollback mechanism described
    Evidence: .sisyphus/evidence/task-13-versioning.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 14. NEW Section — API Rate Limiting

  **What to do**:
  Write a new section covering how to manage aggregate API rate limits across concurrent tasks:
  - **Problem**: Multiple concurrent tasks hitting Jira, GitHub, Meta Ads, etc. can exceed per-account rate limits. Need platform-level rate management.
  - **Solution**: Centralized rate limiter in the Event Gateway (TypeScript). Uses Upstash Redis for distributed rate counting. Each external API gets a configured limit (e.g., Jira: 100 req/min, GitHub: 5000 req/hour, Meta: varies by endpoint).
  - **Per-Department Budgets**: Each department's archetype config includes API rate budgets. The orchestrator enforces these before dispatching tasks.
  - **Backpressure**: When rate limits are approached, the orchestrator delays task dispatch rather than failing. Tasks queue until capacity is available.
  - **Monitoring**: Track rate limit utilization per API per department in Supabase. Alert at 80% utilization.
  - **Per-API Configuration Table**: Show Jira, GitHub, Meta Ads, GoHighLevel, QuickBooks with their respective rate limits and recommended budgets.

  **Must NOT do**:
  - Ignore rate limiting (this will bite you with concurrent tasks)
  - Build a complex distributed rate limiter (Redis-based token bucket is sufficient)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rate limiting section describes centralized approach
    Tool: Bash (grep)
    Steps:
      1. grep -i "rate.limit\|backpressure\|token.bucket" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: Centralized rate limiter with backpressure described
    Evidence: .sisyphus/evidence/task-14-rate-limiting.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 15. NEW Section — Security Model

  **What to do**:
  Write a new section covering credential management and access scoping:
  - **Secret Storage**: Fly.io Secrets for deployment-time secrets (API keys, OAuth tokens). Supabase Vault (or environment variables) for runtime secrets. Never hardcode credentials.
  - **Per-Department Scoping**: Each department's agent only has access to its relevant API credentials. Engineering agent gets GitHub + Jira tokens. Marketing agent gets Meta Ads + GoHighLevel tokens. No cross-department credential access.
  - **OAuth Token Lifecycle**: Reference nexus-stack's `sync-token.sh` pattern for rotating OAuth tokens. Claude Max subscription tokens expire and need periodic refresh.
  - **Least Privilege**: Agents get minimum permissions needed. Engineering agent can create PRs but not merge to main without review gate. Marketing agent can create campaign drafts but not publish without approval.
  - **Audit Trail**: Log all external API calls with timestamp, agent_version_id, task_id, and response status. Store in Supabase for compliance.
  - **Future SaaS Considerations**: When going multi-tenant, each tenant's credentials are isolated. Never share credentials across tenants. Use Supabase Row-Level Security for data isolation.

  **Must NOT do**:
  - Build full multi-tenant security now (just design for it)
  - Store secrets in code or config files
  - Give agents more permissions than they need

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/scripts/sync-token.sh` — Existing OAuth token sync pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Security section covers credential management and scoping
    Tool: Bash (grep)
    Steps:
      1. grep -i "fly.io secrets\|least privilege\|audit trail\|per-department" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: All security aspects covered
    Evidence: .sisyphus/evidence/task-15-security.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 16. NEW Section — Disaster Recovery

  **What to do**:
  Write a new section covering infrastructure failure handling:
  - **Supabase Failure**: Supabase provides automatic backups and point-in-time recovery. Tasks in-flight will fail and be retried by BullMQ. No custom DR needed for the database itself.
  - **Redis/Upstash Failure**: BullMQ jobs are persisted in Redis. Upstash provides replication. If Redis is temporarily unavailable, the Event Gateway buffers incoming webhooks and retries. In-flight tasks continue (they don't need Redis during execution).
  - **Fly.io Machine Failure**: Ephemeral machines can crash mid-task. The orchestrator detects stale machines (no heartbeat for 10 minutes) and re-dispatches the task. LangGraph workflows checkpoint to Supabase, so non-engineering tasks resume from the last checkpoint.
  - **LLM Provider Outage**: The LLM Gateway's fallback chain handles this automatically. If Claude is down, route to GPT-4o. If OpenRouter is down entirely, queue tasks until it recovers.
  - **Webhook Delivery Failure**: Jira and GitHub have built-in webhook retry (exponential backoff). The Event Gateway is idempotent (processes the same webhook safely on retry). Add a reconciliation job that polls Jira hourly to catch any missed webhooks.
  - **Recovery Priority Table**: Show which failures are handled automatically vs need manual intervention.

  **Must NOT do**:
  - Over-engineer DR for a solo developer (keep it simple)
  - Assume managed services never fail (they do, rarely)
  - Ignore data loss scenarios

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: DR section covers all failure modes
    Tool: Bash (grep)
    Steps:
      1. grep -i "supabase failure\|redis failure\|fly.io.*failure\|llm.*outage\|webhook.*failure" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: All 5 failure modes addressed
    Evidence: .sisyphus/evidence/task-16-dr.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 17. Section 15 — Technology Stack (completely revised)

  **What to do**:
  Completely rewrite the technology stack table to reflect ALL decisions:

  | Component | Recommended | Why | Alternative |
  |---|---|---|---|
  | Platform Layer | Fastify (TypeScript) | Fast, lightweight, schema validation | Express |
  | Eng Agent Runtime | OpenCode (`opencode serve` + SDK) | Proven in nexus-stack, coding-specific | — |
  | Non-Eng Agent Runtime | LangGraph (Python) | Durable execution, graph-based workflows | CrewAI |
  | Orchestration (Eng) | Custom TS (generalized orchestrate.mjs) | Proven, lightweight | — |
  | Orchestration (Non-Eng) | LangGraph workflows | Built-in checkpointing | Inngest, Trigger.dev |
  | Job Queue | BullMQ + Upstash Redis | Battle-tested, TS+Python support | — |
  | Database + Vectors | Supabase (PostgreSQL + pgvector) | MCP server, auth, edge functions | Neon |
  | LLM Access | OpenRouter | Multi-provider, pay-per-token, routing | Direct API |
  | LLM Optimization | Claude Max 20x subscription | Cost reduction for high-volume | — |
  | Execution Compute (Eng) | Fly.io Machines API | Proven, pay-per-second, isolation | Modal |
  | Execution Compute (Non-Eng) | In-process Python workers | No isolation needed for API calls | — |
  | Code Gen LLM | Claude Opus/Sonnet via OpenRouter | Best code quality | GPT-4o |
  | General Task LLM | Claude Sonnet via OpenRouter | Speed + quality balance | GPT-4o-mini |
  | Notifications | Slack API | Team already uses it | — |
  | E2E Testing | Playwright | Multi-browser, proven in nexus-stack | — |
  | CI Integration | GitHub Actions | Native to GitHub | — |
  | CRM | GoHighLevel API | Already in stack | — |
  | Ad Platform | Meta Marketing API | Primary paid channel | Google Ads |
  | Observability | LangSmith + Grafana | Agent tracing + infra dashboards | — |

  Also explain why each original recommendation was changed (OpenClaw → OpenCode, Temporal → custom, Qdrant → pgvector, etc.).

  **Must NOT do**:
  - Reference OpenClaw, Temporal, or Qdrant as recommended
  - Include "gpt-oss-20b or custom" LLM router

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 18-22)
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Section 15
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — "FINAL Architecture Stack" table

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tech stack table reflects all 16 decisions
    Tool: Bash (grep)
    Steps:
      1. grep -i "opencode\|langgraph\|supabase\|bullmq\|openrouter\|fly.io" docs/2026-03-22-ai-employee-architecture.md | wc -l
      2. grep -i "openclaw\|temporal.io\|qdrant" docs/2026-03-22-ai-employee-architecture.md | wc -l
    Expected Result: Many references to chosen stack, zero to replaced stack
    Evidence: .sisyphus/evidence/task-17-tech-stack.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 18. Section 16 — Implementation Roadmap (revised for solo developer)

  **What to do**:
  Completely rewrite the roadmap for a solo developer. Key changes:
  - Reduce from 34 weeks to a realistic timeline for one person
  - Focus on Engineering MVP (Milestones 1-5) and Marketing (Milestone 6)
  - Defer Finance, Sales, Cross-Department, and Optimization to "Future" milestones
  - Add explicit "gate" checkpoints between milestones (don't proceed until milestone is validated)
  - Reference nexus-stack's existing fly-worker as a head start for Milestones 3-4

  Suggested revised milestones:
  - **M1 (Weeks 1-3)**: Platform Foundation — Event Gateway, BullMQ, Supabase schema, archetype registry
  - **M2 (Weeks 4-6)**: Engineering Triage Agent — Knowledge base (2 layers), triage agent via OpenCode, Jira integration
  - **M3 (Weeks 7-10)**: Engineering Execution Agent — Generalize nexus-stack fly-worker, multi-project support, fix loop improvements
  - **M4 (Weeks 11-13)**: Engineering Review Agent — PR review, risk scoring, merge queue, Slack notifications
  - **M5 (Weeks 14-15)**: Engineering Multi-Project — Onboard 2-3 projects, concurrency scheduler, conflict detection
  - **M6 (Weeks 16-20)**: Marketing Department — LangGraph workflows, Meta Ads integration, campaign optimization
  - **Future**: Finance, Sales, Cross-Department, LLM optimization, self-service onboarding

  **Must NOT do**:
  - Assume team-based parallelism (solo developer = sequential milestones)
  - Include detailed timelines for Finance, Sales, or Content
  - Present the roadmap as a fixed commitment (it's a guide)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Section 16

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Roadmap reflects solo developer constraints
    Tool: Bash (grep)
    Steps:
      1. grep -i "solo\|one person\|single developer" docs/2026-03-22-ai-employee-architecture.md
      2. Verify milestone count is reduced (6 detailed + future, not 10)
    Expected Result: Roadmap acknowledges solo developer and has realistic timeline
    Evidence: .sisyphus/evidence/task-18-roadmap.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 19. Sections 17-18 — Cost Estimation + Risk Mitigation (revised)

  **What to do**:
  - **Section 17 (Cost Estimation)**: Update all cost figures based on real pricing:
    - LLM costs via OpenRouter (check openrouter.ai for current Claude/GPT pricing)
    - Supabase Pro plan (~$25/month)
    - Upstash Redis (~$10/month for pay-as-you-go)
    - Fly.io Machines (performance-2x at ~$0.05/GB-hour)
    - LangSmith (~$39/month for Plus plan)
    - Fly.io persistent services (~$5-15/month per always-on service)
    - Note Claude Max 20x subscription as a cost optimization (effectively reduces LLM costs to ~$0 for Claude)
    - Reframe the "vs human employees" comparison: The platform augments humans, doesn't replace them. You still need humans for maintenance, escalations, and prompt refinement. Better framing: "accelerates a solo developer's output by 3-5x"
  - **Section 18 (Risk Mitigation)**: Update platform-level risks:
    - Replace Temporal references with custom orchestrator risks
    - Add: Claude Max subscription ToS risk (automated usage may violate terms)
    - Add: Cross-language (TS+Python) deployment complexity
    - Add: Single point of failure risks for solo developer (what if you're unavailable?)
    - Keep engineering-specific risks (they're still valid)
    - Update merge conflict mitigation to reference nexus-stack's existing dispatch registry

  **Must NOT do**:
  - Use made-up cost figures
  - Compare to "4 human employees" without caveats
  - Ignore solo developer risks

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Sections 17-18

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cost estimates use real pricing sources
    Tool: Bash (grep)
    Steps:
      1. grep -i "openrouter\|supabase.*25\|upstash\|fly.io" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: Real service names with approximate pricing
    Evidence: .sisyphus/evidence/task-19-costs.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 20. Sections 19-20 — Onboarding Checklist + Success Metrics (revised)

  **What to do**:
  - **Section 19 (Onboarding Checklist)**: Preserve the shadow→supervised→autonomous progression (it's excellent). Update step 5 to mention choosing between OpenCode and LangGraph runtime. Update step 4 to reference building with the appropriate agent framework. Add a step for configuring the LLM Gateway (OpenRouter API key, model selection).
  - **Section 20 (Success Metrics)**: Update targets to reflect solo developer reality. Reduce task throughput targets. Keep quality metrics but note they're aspirational for V1. Add a new metric: "Agent prompt refinement rate" (how often prompts are updated based on feedback). Update the per-department quality table to only detail Engineering and Marketing.

  **Must NOT do**:
  - Remove the shadow→supervised→autonomous progression
  - Set unrealistic V1 targets
  - Detail metrics for departments that aren't being built yet

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — Original Sections 19-20

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Onboarding checklist preserved with runtime selection step
    Tool: Bash (grep)
    Steps:
      1. grep -i "shadow.*mode\|supervised.*mode\|autonomous.*mode\|runtime.*selection" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: All three modes present plus runtime selection step
    Evidence: .sisyphus/evidence/task-20-onboarding.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 21. NEW Section — Operational Runbooks

  **What to do**:
  Write a new section with practical operational guidance for a solo developer:
  - **Deployment Runbook**: How to deploy the platform on Fly.io (step-by-step). Deploy Event Gateway, deploy Python agent workers, configure Supabase, set up Upstash Redis, configure Jira webhooks.
  - **Monitoring Runbook**: What to monitor daily: queue depth (BullMQ dashboard), task completion rate, LLM cost (OpenRouter dashboard), Fly.io machine health. Weekly: review feedback logs, check knowledge base freshness, review escalation patterns.
  - **Incident Runbook**: Common failure modes and how to fix them: stuck task (check Fly.io machine logs), failed webhook (check Event Gateway logs), LLM timeout (check OpenRouter status), Supabase connection error (check Supabase dashboard).
  - **Maintenance Runbook**: Weekly: review and merge feedback into prompts. Monthly: reindex knowledge base, review cost trends, update agent versions. Quarterly: review risk model weights, assess department expansion.
  - **Debugging Runbook**: How to trace a failed task end-to-end: task_id → Supabase state → BullMQ job → agent version → LLM logs (LangSmith) → execution logs (Fly.io).

  **Must NOT do**:
  - Write runbooks that assume a team (solo developer focus)
  - Over-detail deployment steps (link to service docs instead)
  - Ignore the debugging experience

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 22
  - **Blocked By**: Task 1

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 5 runbooks present
    Tool: Bash (grep)
    Steps:
      1. grep -i "deployment runbook\|monitoring runbook\|incident runbook\|maintenance runbook\|debugging runbook" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: All 5 runbooks described
    Evidence: .sisyphus/evidence/task-21-runbooks.txt
  ```

  **Commit**: NO (groups with final commit)

- [x] 22. Final Consistency Review + Mermaid Validation

  **What to do**:
  - Read the entire document from start to finish
  - **Cross-reference check**: Verify every tech stack mention in the body matches the tech stack table in Section 15. No contradictions.
  - **Terminology check**: Search for ALL instances of: OpenClaw, Temporal, Qdrant, "custom router", "gpt-oss". Replace any remaining references.
  - **Mermaid validation**: Extract every Mermaid diagram. Check syntax: no `end` as node label, no HTML tags, no subgraph-to-subgraph edges, max 20 nodes per diagram. Verify each diagram reflects the revised stack.
  - **Section numbering**: Ensure all sections are numbered sequentially and cross-references (e.g., "See Section 7.2") point to the correct sections.
  - **Coherence**: Does the document read as a unified whole? Or does it feel like a patchwork? Smooth any rough transitions between preserved and new content.
  - **Table of Contents**: If the document has one, update it. If not, add one at the top.

  **Must NOT do**:
  - Skip sections during review
  - Ignore Mermaid syntax issues
  - Leave contradictions between sections

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires reading the entire document and cross-referencing across all sections
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after all other tasks complete)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2-21

  **References**:
  - `docs/2026-03-22-ai-employee-architecture.md` — The completed document to review
  - `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md` — All decisions for cross-reference

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Zero forbidden technology references remain
    Tool: Bash (grep)
    Steps:
      1. grep -ci "openclaw" docs/2026-03-22-ai-employee-architecture.md
      2. grep -ci "gpt-oss-20b" docs/2026-03-22-ai-employee-architecture.md
    Expected Result: 0 matches for both
    Evidence: .sisyphus/evidence/task-22-forbidden-terms.txt

  Scenario: All Mermaid diagrams have valid syntax
    Tool: Bash (grep + manual review)
    Steps:
      1. Extract all mermaid blocks
      2. Check for: no 'end' as node label, no <br/> tags, no subgraph→subgraph edges
      3. Count nodes per diagram (max 20)
    Expected Result: All diagrams valid
    Evidence: .sisyphus/evidence/task-22-mermaid-validation.txt

  Scenario: Document reads coherently
    Tool: Manual read-through (agent assessment)
    Steps:
      1. Read entire document
      2. Flag any contradictions, rough transitions, or placeholder text
    Expected Result: Zero contradictions, smooth transitions, no placeholder text
    Evidence: .sisyphus/evidence/task-22-coherence.txt
  ```

  **Commit**: YES
  - Message: `docs: rewrite AI employee platform architecture`
  - Files: `docs/2026-03-22-ai-employee-architecture.md`
  - Pre-commit: `grep -ci "openclaw" docs/2026-03-22-ai-employee-architecture.md | xargs test 0 -eq`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify the section exists and matches the interview decisions. For each "Must NOT Have": search the document for forbidden terms (OpenClaw, Temporal, Qdrant as primary). Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Content Quality Review** — `unspecified-high`
  Read the full document. Check for: internal consistency (tech stack mentions match across sections), accurate cost figures, logical flow between sections, no contradictions. Check for AI-slop: vague language, excessive hedging, placeholder text.
  Output: `Consistency [PASS/FAIL] | Completeness [N sections present/N expected] | VERDICT`

- [x] F3. **Mermaid Diagram Validation** — `unspecified-high`
  Extract every Mermaid diagram from the document. Validate syntax (no `end` as node label, no HTML tags, no subgraph-to-subgraph edges, max 20 nodes). Verify each diagram reflects the revised tech stack (no OpenClaw, no Temporal, no Qdrant in diagrams).
  Output: `Diagrams [N valid/N total] | Tech References [CLEAN/N issues] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Compare every section against the interview decisions in `.sisyphus/drafts/2026-03-22-2155-ai-employee-architecture-review.md`. Verify: all 16 decisions are reflected, all 7 new sections exist, non-MVP departments are trimmed, nexus-stack is referenced. Flag any content that contradicts interview decisions.
  Output: `Decisions [N/16 reflected] | New Sections [N/7 present] | Contradictions [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **1 commit**: `docs: rewrite AI employee platform architecture` — `docs/2026-03-22-ai-employee-architecture.md`

---

## Success Criteria

### Verification Commands
```bash
# Check document exists and has substantial content
wc -l docs/2026-03-22-ai-employee-architecture.md  # Expected: > 500 lines

# Check no forbidden terms
grep -ci "openclaw" docs/2026-03-22-ai-employee-architecture.md  # Expected: 0
grep -ci "temporal.io" docs/2026-03-22-ai-employee-architecture.md  # Expected: 0 (or only in "considered and rejected" context)

# Check Mermaid diagrams are present
grep -c "mermaid" docs/2026-03-22-ai-employee-architecture.md  # Expected: > 10

# Check all new sections exist
grep -c "Feedback Loop\|LLM Gateway\|Agent Versioning\|Rate Limiting\|Disaster Recovery\|Operational Runbook\|Security Model" docs/2026-03-22-ai-employee-architecture.md  # Expected: >= 7
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Document reads as coherent whole
- [ ] All Mermaid diagrams render correctly
- [ ] Cost estimates use real pricing
