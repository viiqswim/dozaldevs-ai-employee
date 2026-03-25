# Architecture Document Updates: Review Findings Integration

## TL;DR

> **Quick Summary**: Update the AI Employee architecture document (`docs/2026-03-22-2317-ai-employee-architecture.md`) to incorporate 7 MVP-critical fixes, a major timeout/re-dispatch redesign, and 6 high-value improvements identified during a thorough architecture review.
> 
> **Deliverables**:
> - All 7 Tier 1 MVP-critical gaps closed in the architecture doc
> - Timeout/re-dispatch mechanism redesigned (Pattern C Hybrid + auto re-dispatch)
> - 6 Tier 2 improvements added (state transition log, structured logging, Zod validation, Prisma, PR dedup, local dev)
> - Stale references corrected (Inngest #1433, free tier limits, nexus-stack gaps)
> - Cross-reference consistency verified
> 
> **Estimated Effort**: Medium (documentation-only, ~12 discrete section edits)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: §8 batch → §10 rewrite → §18+§27 updates → integrity check

---

## Context

### Original Request
Review the architecture document for gaps, issues, and improvement opportunities. Apply all approved changes to make the architecture "airtight" for MVP.

### Interview Summary
**Key Discussions**:
- 7 MVP-critical gaps identified by Oracle consultation (reverse-path SPOF, timeout race, optimistic locking, unique constraint, error handling contract, Inngest hosting clarification, local dev story)
- Timeout/re-dispatch pattern redesigned: Pattern C Hybrid chosen (single waitForEvent + Supabase heartbeats + watchdog cron + auto re-dispatch)
- 6-hour total timeout with up to 3 automatic re-dispatch attempts
- Prisma for database migrations, Zod for webhook validation
- Task state transition log table and structured logging schema added
- User approved ALL Tier 1 and Tier 2 recommendations

**Research Findings**:
- Oracle: H7 (machine→Inngest completion) is the critical SPOF; optimistic locking needed; timeout race between waitForEvent and machine clock
- Explore agents: Nexus-stack re-dispatch is manual (not automatic). State preserved via deterministic branch names + between-wave auto-push. Fallback draft PRs on timeout.
- Librarian: `step.waitForEvent()` supports 7-day timeout on free tier. Heartbeat loop pattern verified. Inngest free tier = 50K executions/month, 5 concurrent steps. OpenCode SDK confirmed.
- Librarian: Inngest issue #1433 (waitForEvent race condition) FIXED as of March 2, 2026

### Metis Review
**Identified Gaps** (addressed):
- Q1 (Local Dev placement): Resolved → append as §27.5 subsection in Operational Runbooks, no renumbering needed
- Q2 (Pattern C pseudo-code): Resolved → agent synthesizes from planning session notes + librarian research. Must not invent details.
- Q3 (Zod schema level of detail): Resolved → describe validation contract (required fields + behavior), not full TypeScript code
- Q6 (ER diagram): Resolved → include in §13 task, add task_status_log entity
- E2 (Attempt counter): Resolved → add `dispatch_attempts INT DEFAULT 0` to TASK entity
- E5 (Unique constraint conflict): Resolved → Gateway returns 200 OK (idempotent success) on conflict
- Batching recommendation: §8 (4 changes), §10 (rewrite), §13 (5 changes), §9.2, §14/§15/§27 — adopted

---

## Work Objectives

### Core Objective
Update the architecture document to close all identified MVP-critical gaps, redesign the timeout/re-dispatch mechanism, and add high-value improvements — producing an airtight specification for building M1+M3.

### Concrete Deliverables
- Updated `docs/2026-03-22-2317-ai-employee-architecture.md` with all approved changes

### Definition of Done
- [ ] All 7 Tier 1 items verifiable via grep (see acceptance criteria below)
- [ ] Pattern C Hybrid is the sole timeout pattern (no stale 90-min references)
- [ ] All 6 Tier 2 items present in doc
- [ ] All corrections applied (#1433, Inngest limits, nexus-stack gaps)
- [ ] Document structural integrity preserved (all sections present, Mermaid diagrams valid)
- [ ] Line count ≥ 2514 (net additions expected)

### Must Have
- Reverse-path SPOF mitigation (Supabase-first completion write + watchdog reconciliation)
- Pattern C Hybrid timeout/re-dispatch redesign with 6-hour total timeout
- Auto re-dispatch up to 3 attempts with Slack escalation
- Optimistic locking on all status transitions
- Event Gateway error handling contract (all failure modes)
- Local development setup documentation

### Must NOT Have (Guardrails)
- **G1: No behavior invention** — Do NOT invent technical decisions not present in this plan or the draft file (`.sisyphus/drafts/2026-03-24-2258-architecture-review.md`). If a spec is incomplete, use `[TODO: specify during implementation]` placeholder.
- **G2: No section renumbering** — Insert new Local Dev content as §27.5 subsection, NOT as a new top-level section. No downstream section number changes.
- **G3: No adjacent section cleanup** — Do NOT fix typos, style issues, or outdated references in sections NOT listed in this plan. Scope creep #1.
- **G4: No implementation code** — This is a specification document. Add SQL DDL, interface contracts, and pseudo-code where appropriate. Do NOT add full TypeScript implementations.
- **G5: Cross-reference consistency** — When changing a concept (e.g., timeout value), update ALL sections that reference it, not just the primary section.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: N/A (documentation task)
- **Automated tests**: None (markdown edits)
- **Framework**: N/A

### QA Policy
Every task MUST include grep-based verification of the specific changes made. Evidence saved to `.sisyphus/evidence/task-{N}-{description}.txt`.

- **Documentation edits**: Use Grep to verify inserted content exists at expected locations
- **Structural integrity**: Use Bash to count sections, validate Mermaid, check line count

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent section batches):
├── Task 1: §8 Event Gateway batch (4 changes: SPOF, error contract, dual-purpose, Zod) [deep]
├── Task 2: §13 Data Model batch (5 changes: unique constraint, task_status_log, optimistic locking, ER diagram, dispatch_attempts) [deep]
├── Task 3: §14+§15 Shared Infra batch (Inngest limits, structured logging schema, Prisma in tech stack) [unspecified-high]

Wave 2 (After Wave 1 — depends on §8 and §13 context):
├── Task 4: §10 Orchestration rewrite (Pattern C Hybrid, auto re-dispatch, 6h timeout) [deep]
├── Task 5: §9.2 Execution Agent update (PR deduplication on re-dispatch) [quick]

Wave 3 (After Wave 2 — depends on Pattern C and data model):
├── Task 6: §4+§18 Lifecycle + Risk updates (new states, new risks) [unspecified-high]
├── Task 7: §27 Runbook updates (deployment for Prisma, monitoring for watchdog, local dev §27.5) [unspecified-high]
├── Task 8: §28 Deferred Capabilities updates (resolve #1433, nexus-stack gap) [quick]

Wave 4 (After ALL — corrections + integrity):
├── Task 9: Corrections + stale reference sweep [quick]
├── Task 10: Cross-reference consistency + structural integrity check [unspecified-high]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 (§8) | — | 4, 6 | 1 |
| 2 (§13) | — | 4, 6 | 1 |
| 3 (§14+§15) | — | 7 | 1 |
| 4 (§10) | 1, 2 | 6, 7, 9 | 2 |
| 5 (§9.2) | — | 9 | 2 |
| 6 (§4+§18) | 1, 2, 4 | 9 | 3 |
| 7 (§27) | 3, 4 | 9 | 3 |
| 8 (§28) | — | 9 | 3 |
| 9 (corrections) | 4, 5, 6, 7, 8 | 10 | 4 |
| 10 (integrity) | 9 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `deep`, T2 → `deep`, T3 → `unspecified-high`
- **Wave 2**: **2** — T4 → `deep`, T5 → `quick`
- **Wave 3**: **3** — T6 → `unspecified-high`, T7 → `unspecified-high`, T8 → `quick`
- **Wave 4**: **2** — T9 → `quick`, T10 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. §8 Event Gateway Batch — SPOF mitigation, error handling contract, Inngest hosting clarification, Zod validation

  **What to do**:
  - **SPOF mitigation**: Add a new subsection or paragraphs to §8 explaining the Supabase-first completion write pattern. The Fly.io machine MUST write its final status (including PR URL if applicable) to the Supabase `tasks` table BEFORE sending the `engineering/task.completed` event to Inngest. Add retry logic (3 attempts with backoff) for the Inngest event send. Document that the watchdog cron (§10 Layer 3) reconciles tasks stuck in `Submitting` state with no corresponding lifecycle function completion.
  - **Error handling contract**: Add a subsection to §8 specifying the Event Gateway's behavior on each failure mode:
    - Webhook signature verification fails → return 401, log, don't create task
    - Webhook payload validation fails (missing required fields) → return 400, log, don't create task
    - Supabase write fails → return 500 (Jira/GitHub retry the webhook)
    - Inngest send fails after 3 retries → return 202 (task is in Supabase with `raw_event`, manual recovery via `dispatch-task.ts`)
    - Unique constraint violation on `tasks(external_id, source_system, tenant_id)` → return 200 OK (idempotent, task already exists)
  - **Inngest dual-purpose hosting**: Add explicit statement that the Event Gateway (Fastify app on Fly.io) serves dual duty: (1) webhook receiver for Jira/GitHub and (2) Inngest function host. Inngest lifecycle functions execute within this app's process. Inngest Cloud orchestrates execution via HTTP or Connect (persistent WebSocket).
  - **Zod webhook validation**: Add description of payload validation using Zod schemas at the gateway. Required fields for Jira: `ticket_id`, `title`, `project_key`. Required fields for GitHub: `action`, `pull_request.number`, `repository.full_name`. Validation happens AFTER signature verification and BEFORE Supabase write. Describe the contract, not the implementation code.

  **Must NOT do**:
  - Do NOT write full TypeScript implementation code for the gateway
  - Do NOT modify sections other than §8
  - Do NOT change the Event Gateway architecture diagram (if it still renders correctly)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-part edit to a critical section requiring careful reading of existing content and precise insertions
  - **Skills**: []
    - No specialized skills needed — markdown editing with domain context

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:643-740` — §8 Event Gateway current content, including webhook flow, signature verification, Inngest send retry logic
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1097-1145` — §10 MVP Lifecycle Function pseudo-code showing how the lifecycle function receives events
  - `.sisyphus/drafts/2026-03-24-2258-architecture-review.md` — Review findings with Tier 1 items #1, #5, #6 detail

  **Acceptance Criteria**:
  - [ ] SPOF pattern documented: `grep -c "Supabase.*before\|write.*completion.*Supabase\|Supabase-first" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Error handling contract exists: `grep -c "return 401\|return 400\|return 500\|return 202\|return 200.*idempotent" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 3
  - [ ] Dual-purpose hosting stated: `grep -c "dual.purpose\|webhook receiver.*Inngest\|function host" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Zod validation documented: `grep -c "Zod\|zod\|payload.*valid\|schema.*valid" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify §8 SPOF mitigation content exists
    Tool: Bash (grep)
    Steps:
      1. grep -n "Supabase-first\|write.*completion.*Supabase\|before.*sending.*Inngest" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify output shows at least 1 match within lines 643-800
    Expected Result: At least 1 match, content describes machine writing to Supabase before Inngest event
    Evidence: .sisyphus/evidence/task-1-spof-grep.txt

  Scenario: Verify error handling contract covers all failure modes
    Tool: Bash (grep)
    Steps:
      1. grep -n "401\|400\|500\|202.*idempotent\|200.*idempotent" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least 4 distinct HTTP status codes documented
    Expected Result: 401 (bad signature), 400 (bad payload), 500 (Supabase down), 202 (Inngest down), 200 (duplicate) all present
    Evidence: .sisyphus/evidence/task-1-error-contract-grep.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs(architecture): add SPOF mitigation, data model hardening, infra limits`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 2. §13 Data Model Batch — unique constraint, task_status_log, optimistic locking, ER diagram, dispatch_attempts

  **What to do**:
  - **Unique constraint**: Add `UNIQUE(external_id, source_system, tenant_id)` constraint to the TASK entity in both the ER diagram (Mermaid) and the text description. Note in §13 text that this ensures webhook idempotency.
  - **Task status transition log**: Add a new entity `TASK_STATUS_LOG` to the ER diagram and text:
    ```sql
    TASK_STATUS_LOG {
        uuid id PK
        uuid task_id FK
        text from_status
        text to_status
        text actor "enum: gateway, lifecycle_fn, watchdog, manual"
        timestamptz created_at
    }
    ```
    Add relationship: `TASK ||--o{ TASK_STATUS_LOG : tracks`. Explain purpose: "Records every status transition for debugging and audit. Every UPDATE to `tasks.status` MUST also INSERT into `task_status_log`."
  - **Optimistic locking**: Add a subsection or note explaining the pattern: all status transitions use `UPDATE tasks SET status = $new WHERE id = $id AND status = $expected RETURNING id`. If no row returned, another writer changed the state — the caller must handle the conflict. Show the SQL pattern.
  - **ER diagram update**: Add `TASK_STATUS_LOG` entity and its relationship to TASK in the Mermaid ER diagram. Keep existing entities untouched. Verify Mermaid syntax is valid.
  - **dispatch_attempts column**: Add `dispatch_attempts INT DEFAULT 0` to the TASK entity in both ER diagram and text. Explain: "Incremented on each re-dispatch. Maximum 3 attempts before Slack escalation."

  **Must NOT do**:
  - Do NOT modify existing entity definitions except to add `dispatch_attempts` to TASK
  - Do NOT restructure the ER diagram layout — only add the new entity
  - Do NOT add implementation code beyond SQL DDL and the optimistic locking pattern

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Mermaid ER diagram editing is high-risk (syntax errors break rendering). Requires careful reading of existing diagram structure.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1366-1570` — §13 Data Model with full ER diagram and entity descriptions
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1405-1415` — TASK entity definition (where to add dispatch_attempts + unique constraint)
  - `.sisyphus/drafts/2026-03-24-2258-architecture-review.md` — Review findings with Tier 1 items #3, #4 and Tier 2 state transition log

  **Acceptance Criteria**:
  - [ ] Unique constraint: `grep -c "UNIQUE.*external_id" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Status log table: `grep -c "TASK_STATUS_LOG\|task_status_log" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 2
  - [ ] Optimistic locking: `grep -c "WHERE.*status.*=\|AND status" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Dispatch attempts: `grep -c "dispatch_attempts" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Mermaid diagram valid: `grep -c "TASK_STATUS_LOG" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1 (in ER block)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify ER diagram still has valid Mermaid syntax
    Tool: Bash (grep)
    Steps:
      1. Extract the erDiagram block: grep -A200 "erDiagram" docs/2026-03-22-2317-ai-employee-architecture.md | head -200
      2. Verify TASK_STATUS_LOG entity appears with correct fields
      3. Verify TASK ||--o{ TASK_STATUS_LOG relationship exists
    Expected Result: New entity present, relationship defined, no Mermaid syntax errors visible
    Evidence: .sisyphus/evidence/task-2-er-diagram.txt

  Scenario: Verify optimistic locking SQL pattern is documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "WHERE.*id.*AND.*status\|RETURNING id" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify at least 1 match showing the optimistic locking pattern
    Expected Result: SQL pattern with WHERE status = $expected AND RETURNING id documented
    Evidence: .sisyphus/evidence/task-2-optimistic-locking.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs(architecture): add SPOF mitigation, data model hardening, infra limits`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 3. §14+§15 Shared Infrastructure Batch — Inngest limits, structured logging schema, Prisma in tech stack

  **What to do**:
  - **Inngest free tier limits**: Update the existing "Inngest Execution Limits" subsection in §14 (around line 1631) to add the free tier limits that are currently missing: 50,000 executions/month, 5 concurrent steps, 24-hour trace retention. Note that at 20 tasks/day × ~15 steps per lifecycle = ~9,000 steps/month (well within limit). Flag that the 5 concurrent steps limit could bottleneck with 3+ concurrent tasks if their lifecycle steps overlap. Add a note: "Upgrade to Pro ($75/mo) when concurrent task volume regularly exceeds 3 simultaneous lifecycle functions."
  - **Structured logging schema**: Add a new subsection to §14 under Observability (around line 1588) defining the platform-wide structured logging format:
    ```json
    {
      "timestamp": "ISO 8601",
      "level": "info | warn | error | debug",
      "taskId": "uuid (nullable — not all logs are task-scoped)",
      "step": "string (e.g., 'triage', 'execute', 'review', 'gateway')",
      "component": "string (e.g., 'event-gateway', 'lifecycle-fn', 'fly-machine', 'watchdog')",
      "message": "string",
      "error": "string (nullable — stack trace or error message)",
      "metadata": "object (nullable — additional structured context)"
    }
    ```
    Explain: "All platform components MUST use this schema. This enables `grep -r taskId` across all log sources for end-to-end trace reconstruction."
  - **Prisma in tech stack**: Add Prisma to the §15 Technology Stack table:
    - Component: **Database Migrations**
    - Recommended: **Prisma (`prisma migrate`)**
    - Why: Already proven in nexus-stack. Type-safe schema management. Version-controlled migrations.
    - Alternative: `supabase migration` CLI (lighter, but no type generation)
    - Add note: "Prisma handles all standard relational tables. For pgvector-specific schema (knowledge_embeddings), use raw SQL migrations via `prisma db execute`."

  **Must NOT do**:
  - Do NOT restructure the existing §14 Inngest Execution Limits table — add to it
  - Do NOT add example log lines beyond the schema definition
  - Do NOT add Prisma configuration details — just the technology choice and rationale

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Three independent additions to different subsections — moderate complexity, mainly additive
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1631-1642` — §14 Inngest Execution Limits table (existing, to be extended)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1573-1610` — §14 Observability subgraph (where logging schema goes)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1670-1714` — §15 Technology Stack table (where Prisma row goes)
  - `.sisyphus/drafts/2026-03-24-2258-architecture-review.md` — Tier 2 decisions on logging and Prisma

  **Acceptance Criteria**:
  - [ ] Inngest limits: `grep -c "50,000\|50K\|5 concurrent" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Logging schema: `grep -c "taskId.*component\|structured.*log" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Prisma in stack: `grep -c "Prisma\|prisma.*migrate" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify Inngest free tier limits are documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "50,000\|50K\|concurrent step" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify the limits appear near the existing Inngest Execution Limits table
    Expected Result: 50K executions/month and 5 concurrent steps documented
    Evidence: .sisyphus/evidence/task-3-inngest-limits.txt

  Scenario: Verify structured logging JSON schema exists
    Tool: Bash (grep)
    Steps:
      1. grep -n "taskId\|component.*message\|structured.*log" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify a JSON schema block exists in §14
    Expected Result: JSON schema with timestamp, level, taskId, step, component, message, error, metadata
    Evidence: .sisyphus/evidence/task-3-logging-schema.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `docs(architecture): add SPOF mitigation, data model hardening, infra limits`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 4. §10 Orchestration Rewrite — Pattern C Hybrid, auto re-dispatch, 6-hour timeout

  **What to do**:
  This is the largest single task. §10 (Orchestration & Scaling, lines ~994-1145) needs significant revision to replace the 90-minute single-wait pattern with Pattern C Hybrid.

  - **Replace the MVP Lifecycle Function pseudo-code** (around lines 1097-1140) with Pattern C Hybrid:
    - Single `step.waitForEvent("engineering/task.completed")` with **4-hour timeout** per attempt (not 90 min)
    - Machine sends heartbeats to Supabase every 60s (Layer 2 monitoring — reference existing Layer 2 description)
    - Machine sends completion event to Inngest when done (single event, not heartbeat loop)
    - Watchdog cron (Layer 3) detects heartbeat staleness within 10 min → emits `engineering/task.failed` event on machine's behalf → lifecycle function picks up
    - On timeout or failure: check Supabase for partial progress (branch exists? commits ahead of main? PR already created?)
    - If partial progress AND `dispatch_attempts < 3`: increment `dispatch_attempts`, send `engineering/task.redispatch` event → new Inngest function spawns fresh machine with same branch
    - If `dispatch_attempts >= 3`: escalate to Slack with task summary, set status to `AwaitingInput`
    - **Total timeout budget: 6 hours** across all attempts. Each attempt gets up to 4 hours. With 3 attempts, the theoretical max is 12h, but the 6h total is enforced by a step-level check.
  - **Update the 3-layer monitoring system** description to incorporate the watchdog's new reconciliation responsibility: "When watchdog detects a task in `Executing` state with stale heartbeats (no update in 10 minutes), it checks if the Fly.io machine is still alive via the Fly.io Machines API. If dead, it emits `engineering/task.failed` with `reason: 'machine_dead'`."
  - **Update the known `step.waitForEvent()` race condition** section (lines ~1143-1145): Note that Inngest issue #1433 was **fixed in Inngest v1.17.2 (March 2, 2026)**. Keep the Supabase-first-check mitigation as defense-in-depth but frame it as "belt and suspenders," not a workaround for a bug.
  - **Update timeout values**: Replace all "90 minutes" references in §10 with the new values. The machine hard timeout should be configurable but default to 4 hours. The `waitForEvent` timeout should be 4 hours + 10 minutes buffer (matching Tier 1 item #2 — timeout race fix).
  - **Add re-dispatch flow description**: Describe the re-dispatch lifecycle: `task.failed` event → check `dispatch_attempts` → increment → `task.redispatch` event → new machine boots → fetches existing branch → continues from last commit → watchdog monitors new machine.

  **Must NOT do**:
  - Do NOT change §10's section structure (keep subsections: Concurrency, Machine Lifecycle, etc.)
  - Do NOT invent Slack message formats for escalation — use `[TODO: define Slack message format during implementation]`
  - Do NOT write full TypeScript implementation — update the pseudo-code to specification level
  - Do NOT modify the §10 mermaid lifecycle diagram unless it directly contradicts the new flow

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Largest task — requires careful replacement of existing pseudo-code, multiple cross-references within §10, and synthesis of Pattern C from planning session notes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Tasks 6, 7, 9
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:994-1145` — §10 Orchestration & Scaling, full section including lifecycle pseudo-code, 3-layer monitoring, waitForEvent race condition
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1097-1140` — The specific MVP Lifecycle Function pseudo-code block to be replaced
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1143-1145` — Known waitForEvent race condition (now fixed)
  - `.sisyphus/drafts/2026-03-24-2258-architecture-review.md` — Pattern C Hybrid specification, auto re-dispatch details, 6-hour timeout decision, Inngest librarian findings (heartbeat loop vs hybrid)

  **Acceptance Criteria**:
  - [ ] Pattern C described: `grep -c "Pattern C\|Hybrid\|heartbeat.*Supabase\|watchdog.*reconcil" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 2
  - [ ] 4-hour timeout per attempt: `grep -c "4.*hour\|240.*min\|4h" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] 6-hour total: `grep -c "6.*hour\|6h\|total.*timeout" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Auto re-dispatch: `grep -c "re.dispatch\|redispatch\|dispatch_attempts" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 2
  - [ ] #1433 marked fixed: `grep -c "fixed\|resolved\|v1.17" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] No stale 90-min as primary timeout: `grep -n "90.min\|90m" docs/2026-03-22-2317-ai-employee-architecture.md` → only in historical context or text-prompt mode (not as the lifecycle function timeout)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify Pattern C Hybrid replaces old 90-min pattern
    Tool: Bash (grep)
    Steps:
      1. grep -n "step.waitForEvent" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify the waitForEvent in §10 lifecycle pseudo-code uses 4h+ timeout, not 90m
      3. grep -n "90.*min\|90m" docs/2026-03-22-2317-ai-employee-architecture.md
      4. Verify any remaining 90-min references are in historical/text-prompt context only
    Expected Result: Lifecycle function uses 4h+ timeout. No 90-min references as the primary orchestration timeout.
    Evidence: .sisyphus/evidence/task-4-pattern-c-verification.txt

  Scenario: Verify auto re-dispatch flow is documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "re.dispatch\|redispatch\|dispatch_attempts.*3\|3 attempt" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify re-dispatch flow describes: check Supabase → increment counter → spawn new machine → Slack escalation on exhaustion
    Expected Result: Complete re-dispatch lifecycle documented with 3-attempt limit and Slack escalation
    Evidence: .sisyphus/evidence/task-4-redispatch-flow.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `docs(architecture): redesign timeout/re-dispatch with Pattern C Hybrid`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 5. §9.2 Execution Agent Update — PR deduplication on re-dispatch

  **What to do**:
  - Add a note to §9.2 (Execution Agent Fix Loop, around lines 806-899) specifying that the execution agent (or entrypoint.sh) MUST check for an existing PR before creating a new one:
    - Before `gh pr create`, run `gh pr list --head <task-branch> --json number --jq '.[0].number'`
    - If PR exists: reuse it (push new commits, update PR body if needed)
    - If no PR exists: create new PR
  - Frame this as essential for re-dispatch safety: "When a machine is re-dispatched after timeout (see §10), the previous machine may have already created a PR. The execution agent must detect and reuse existing PRs to prevent duplicates."
  - Reference the nexus-stack pattern: `entrypoint.sh` already implements this check (verified by explore agent)

  **Must NOT do**:
  - Do NOT modify the fix loop logic
  - Do NOT add full entrypoint.sh code — just the specification

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, well-scoped addition — one note/subsection in one section
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:806-899` — §9.2 Execution Agent and Fix Loop
  - `docs/2026-03-22-2317-ai-employee-architecture.md:628-690` — nexus-stack entrypoint.sh fallback PR creation (referenced in architecture doc)

  **Acceptance Criteria**:
  - [ ] PR dedup documented: `grep -c "dedup\|duplicate.*PR\|existing.*PR\|gh pr list.*head" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify PR deduplication requirement is documented
    Tool: Bash (grep)
    Steps:
      1. grep -n "duplicate.*PR\|existing.*PR\|gh pr list" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify the match is within §9.2 (lines 806-950 approximate range)
    Expected Result: PR deduplication described as a requirement for re-dispatch safety
    Evidence: .sisyphus/evidence/task-5-pr-dedup.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `docs(architecture): redesign timeout/re-dispatch with Pattern C Hybrid`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 6. §4+§18 Task Lifecycle + Risk Mitigation Updates

  **What to do**:
  - **§4 Task Lifecycle State Machine** (lines ~318-401): Update the state diagram description to account for re-dispatch:
    - Add transition: `Executing` → `Failed` → `Executing` (via re-dispatch, up to 3 times)
    - Add `AwaitingInput` state note: "Entered when dispatch_attempts >= 3 and Slack escalation is triggered"
    - If a state transition diagram (Mermaid) exists in §4, add the re-dispatch loop edge
  - **§18 Risk Mitigation** (lines ~1871-1905): Add new engineering-specific risks:
    - **Completion event lost (machine→Inngest)**: "Mitigation: Supabase-first completion write. Machine writes final status + PR URL to Supabase before sending Inngest event. Watchdog cron reconciles orphaned completions within 10 minutes. See §8 and §10."
    - **Timeout race (waitForEvent vs machine clock)**: "Mitigation: waitForEvent timeout set to machine_timeout + 10 minutes buffer. Prevents premature lifecycle function timeout."
    - **Infinite re-dispatch loop**: "Mitigation: dispatch_attempts counter on tasks table. Hard cap at 3 re-dispatches. Slack escalation after exhaustion."
    - **Concurrent status writers causing inconsistent state**: "Mitigation: Optimistic locking via SQL WHERE clause. See §13."

  **Must NOT do**:
  - Do NOT modify existing risks in §18 — only add new ones
  - Do NOT restructure §4 — only add the re-dispatch transition description

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two sections to update, both require understanding of the new timeout/re-dispatch pattern from Task 4
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8)
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2, 4

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:318-401` — §4 Task Lifecycle (state transitions)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1871-1905` — §18 Engineering-Specific Risks table
  - `.sisyphus/drafts/2026-03-24-2258-architecture-review.md` — Tier 1 items #1, #2, #3 and timeout/re-dispatch investigation findings

  **Acceptance Criteria**:
  - [ ] Re-dispatch transition: `grep -c "re.dispatch\|Failed.*Executing\|dispatch_attempts" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 2
  - [ ] New risks added: `grep -c "completion event lost\|timeout race\|infinite re.dispatch\|concurrent.*status" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 2

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify new risks added to §18
    Tool: Bash (grep)
    Steps:
      1. grep -n "Supabase-first\|optimistic locking\|dispatch_attempts.*3\|Slack escalation" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify matches appear in the §18 risk table region (lines 1871+)
    Expected Result: At least 2 new risk rows in §18 with corresponding mitigations
    Evidence: .sisyphus/evidence/task-6-new-risks.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `docs(architecture): add risk mitigations, runbook updates, local dev setup`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 7. §27 Runbook Updates + §27.5 Local Development Setup

  **What to do**:
  - **Deployment Runbook update**: Add Prisma migration step to the initial setup and ongoing deployment lists:
    - Initial: "Run `npx prisma migrate deploy` to apply all migrations to Supabase"
    - Ongoing: "Run `npx prisma migrate deploy` before each gateway deployment if schema changed"
    - Rollback: "Use `npx prisma migrate resolve` to mark failed migrations. Manual SQL rollback if needed — Prisma does not auto-rollback."
  - **Monitoring Runbook update**: Add watchdog cron monitoring:
    - Daily: "Check watchdog cron last execution time — should run every 10 minutes. If stale > 30 minutes, investigate."
    - Add: "Check `task_status_log` table for any unexpected state transitions (e.g., `Executing → Executing` duplicates)"
  - **Maintenance Runbook update**: Add to weekly:
    - "Check `task_status_log` for re-dispatch patterns: `SELECT task_id, COUNT(*) FROM task_status_log WHERE to_status = 'Executing' GROUP BY task_id HAVING COUNT(*) > 1`"
  - **§27.5 Local Development Setup** (NEW subsection): Add as a subsection at the end of §27, before §28. Content:
    - **Inngest Dev Server**: `npx inngest-cli@latest dev` — runs local Inngest server with dashboard at localhost:8288. Functions auto-discovered from your Fastify app.
    - **Local Supabase**: `supabase start` — runs PostgreSQL, Auth, Storage locally. Schema via `npx prisma migrate dev`.
    - **Webhook Tunneling**: `npx smee-client --url https://smee.io/your-channel --target http://localhost:3000/webhooks/jira` — forwards Jira/GitHub webhooks to local gateway. Alternative: ngrok.
    - **Mock Fly.io Machine**: For local testing, run `entrypoint.sh` directly in Docker: `docker build -t ai-employee-worker . && docker run --env-file .env.local ai-employee-worker`. Or test orchestrate.mjs directly against a local OpenCode server.
    - **Environment Variables**: List the minimal `.env.local` file needed (DATABASE_URL, SUPABASE_URL, INNGEST_SIGNING_KEY, INNGEST_EVENT_KEY, GITHUB_TOKEN)
    - **End-to-end local test flow**: "Start Supabase → Start Inngest Dev → Start Event Gateway → Send test webhook via Smee → Verify event appears in Inngest Dev dashboard → Verify task created in local Supabase"

  **Must NOT do**:
  - Do NOT restructure existing runbook sections — only add to them
  - Do NOT add §28 or renumber sections — this is §27.5 (subsection of §27)
  - Do NOT add platform-specific install instructions (brew, apt, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Includes net-new content creation (Local Dev Setup) which is higher risk than pure edits
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 8)
  - **Parallel Group**: Wave 3 (with Tasks 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2374-2493` — §27 Operational Runbooks (full section)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2380-2397` — §27 Deployment Runbook (where Prisma goes)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2404-2419` — §27 Monitoring Runbook (where watchdog goes)
  - `.sisyphus/drafts/2026-03-24-2258-architecture-review.md` — Local dev story and Prisma migration decisions

  **Acceptance Criteria**:
  - [ ] Prisma in deployment: `grep -c "prisma migrate" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Watchdog monitoring: `grep -c "watchdog.*cron\|watchdog.*stale" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Local dev section: `grep -c "Local Development\|inngest.*dev\|supabase start\|smee\|ngrok" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 3

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify Local Development subsection exists with required content
    Tool: Bash (grep)
    Steps:
      1. grep -n "Local Development" docs/2026-03-22-2317-ai-employee-architecture.md
      2. grep -n "inngest.*dev\|supabase start\|smee\|ngrok\|env.local" docs/2026-03-22-2317-ai-employee-architecture.md
      3. Verify at least 4 matches covering Inngest dev, Supabase local, webhook tunneling, env setup
    Expected Result: §27.5 Local Development Setup exists with all 4 subsections
    Evidence: .sisyphus/evidence/task-7-local-dev.txt

  Scenario: Verify Prisma deployment steps added to runbook
    Tool: Bash (grep)
    Steps:
      1. grep -n "prisma migrate" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify it appears in the Deployment Runbook region (lines 2380+)
    Expected Result: Prisma migrate commands in both initial setup and ongoing deployment
    Evidence: .sisyphus/evidence/task-7-prisma-runbook.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `docs(architecture): add risk mitigations, runbook updates, local dev setup`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 8. §28 Deferred Capabilities Updates

  **What to do**:
  - **Update the waitForEvent entry**: The current §28 table mentions deferring certain capabilities. If the waitForEvent race condition (#1433) is referenced anywhere in §28's deferred items, update it to note that the issue is resolved in Inngest v1.17.2.
  - **Update the nexus-stack completion mechanism gap**: Add a note (or update existing text) that the AI Employee Platform's completion mechanism is fundamentally different from the nexus-stack pattern: nexus-stack uses local SSE/polling (orchestrate.mjs monitors OpenCode directly on the same machine), while the platform uses remote Inngest events (machine sends events to Inngest Cloud). This is by design — Inngest provides durability and crash recovery that local monitoring cannot.
  - **Add dispatch-task.ts clarification**: The recovery script `dispatch-task.ts` (mentioned in §8) is STILL a valid recovery path as backup for watchdog failures. Clarify: "The watchdog cron is the primary recovery mechanism. `dispatch-task.ts` CLI is the manual fallback if the watchdog itself fails."

  **Must NOT do**:
  - Do NOT restructure §28's table format
  - Do NOT add new deferred capabilities not discussed in the review

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, well-scoped corrections to an existing section
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 3 (with Tasks 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2496-2514` — §28 Deferred Capabilities & Future Scale Path
  - `.sisyphus/drafts/2026-03-24-2258-architecture-review.md` — #1433 fix confirmation, nexus-stack pattern gap

  **Acceptance Criteria**:
  - [ ] #1433 fix noted: `grep -c "fixed\|resolved\|v1.17.2" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1
  - [ ] Completion mechanism gap: `grep -c "SSE.*polling\|local.*monitor\|remote.*Inngest\|nexus-stack.*differ" docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 1

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify #1433 is marked as fixed
    Tool: Bash (grep)
    Steps:
      1. grep -n "1433\|waitForEvent.*race\|waitForEvent.*fix" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify the text says "fixed" or "resolved" (not "known limitation")
    Expected Result: #1433 described as fixed, with Inngest version reference
    Evidence: .sisyphus/evidence/task-8-1433-fix.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `docs(architecture): add risk mitigations, runbook updates, local dev setup`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 9. Wave 4: Corrections + Stale Reference Sweep

  **What to do**:
  - **Sweep for stale 90-minute references**: Search the entire document for "90 min", "90m", "90-minute" references. For each match:
    - If it's the Fly.io machine text-prompt mode timeout → KEEP (text-prompt mode is still 90 min)
    - If it's the lifecycle function waitForEvent timeout → UPDATE to reflect new values (4h per attempt)
    - If it's the machine hard timeout → UPDATE to reflect configurable default (4h)
    - If it's in cost estimation or timeline context → UPDATE if the new values change the math
  - **Verify all cross-references between updated sections**: Specifically check:
    - §8 references to §10 (orchestration) — still accurate?
    - §10 references to §13 (data model) — dispatch_attempts, optimistic locking mentioned?
    - §18 references to §8 and §10 — risk mitigations point to correct sections?
    - §27 references to §10 and §14 — runbook steps match new patterns?
  - **Fix any minor inconsistencies** found during the sweep — but ONLY for content related to the changes made in Tasks 1-8. Do NOT fix unrelated issues.

  **Must NOT do**:
  - Do NOT modify content unrelated to the Tasks 1-8 changes
  - Do NOT add new content — only fix references and stale values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Sweep task — systematic search and targeted fixes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, after all other tasks)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 4, 5, 6, 7, 8

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md` — entire document (sweep)
  - All previous tasks' acceptance criteria — verify no regressions

  **Acceptance Criteria**:
  - [ ] No stale 90-min lifecycle timeout: `grep -n "90.*min" docs/2026-03-22-2317-ai-employee-architecture.md` → only in text-prompt mode or historical context
  - [ ] Cross-references consistent: Manual check of §8↔§10, §10↔§13, §18↔§8/§10 references

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify no stale 90-minute lifecycle timeout references
    Tool: Bash (grep)
    Steps:
      1. grep -n "90.*min\|90m\|90-minute" docs/2026-03-22-2317-ai-employee-architecture.md
      2. For each match, verify it's in text-prompt mode context (NOT lifecycle function timeout)
    Expected Result: Zero matches in lifecycle/orchestration context. Matches only in text-prompt mode or historical sections.
    Evidence: .sisyphus/evidence/task-9-stale-refs.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `docs(architecture): apply corrections and verify cross-reference integrity`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`

- [x] 10. Wave 4: Structural Integrity Check

  **What to do**:
  - **Section count**: Verify all 28 original sections are still present (no accidental deletion)
  - **Mermaid diagram validation**: Extract each Mermaid block and verify it hasn't been corrupted (check for balanced brackets, valid entity names, no orphaned edges)
  - **Line count**: Document should be > 2,600 lines (net additions from all tasks)
  - **ER diagram check**: Verify the new TASK_STATUS_LOG entity appears correctly in the §13 ER diagram
  - **Run all acceptance criteria from Tasks 1-9**: Execute every grep command from all tasks' acceptance criteria as a final regression check

  **Must NOT do**:
  - Do NOT modify any content — this is a read-only verification task
  - If issues are found, report them — do NOT fix them (that requires a new task)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive verification across the entire document
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 9)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 9

  **References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md` — entire document
  - This plan file — all acceptance criteria from Tasks 1-9

  **Acceptance Criteria**:
  - [ ] Section count: `grep -c "^## " docs/2026-03-22-2317-ai-employee-architecture.md` → ≥ 28
  - [ ] Line count: `wc -l docs/2026-03-22-2317-ai-employee-architecture.md` → > 2600
  - [ ] All Tasks 1-9 acceptance criteria still pass (regression check)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Full document structural integrity check
    Tool: Bash (grep + wc)
    Steps:
      1. grep -c "^## " docs/2026-03-22-2317-ai-employee-architecture.md → ≥ 28
      2. wc -l docs/2026-03-22-2317-ai-employee-architecture.md → > 2600
      3. grep -c "erDiagram" docs/2026-03-22-2317-ai-employee-architecture.md → ≥ 1
      4. grep -c "TASK_STATUS_LOG" docs/2026-03-22-2317-ai-employee-architecture.md → ≥ 2
      5. Re-run ALL grep checks from Tasks 1-9 acceptance criteria
    Expected Result: All checks pass. No regressions from any task.
    Evidence: .sisyphus/evidence/task-10-integrity-check.txt

  Scenario: Verify no Mermaid syntax corruption
    Tool: Bash (grep)
    Steps:
      1. Extract all mermaid blocks: grep -c "```mermaid" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Verify count matches original document (should be same or +1 if diagram added)
      3. Check each block has matching closing ```
    Expected Result: Same number of mermaid blocks, all properly closed
    Evidence: .sisyphus/evidence/task-10-mermaid-check.txt
  ```

  **Commit**: NO (verification only — no changes to commit)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify the change exists in the architecture doc (grep for key terms). For each "Must NOT Have": search for violations (invented details, renumbered sections, out-of-scope edits). Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Verify all Mermaid diagrams render (no syntax errors). Check all SQL blocks for syntax validity. Check all pseudo-code blocks for logical consistency. Verify no orphaned cross-references.
  Output: `Mermaid [PASS/FAIL] | SQL [PASS/FAIL] | Pseudo-code [PASS/FAIL] | Cross-refs [PASS/FAIL] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Read the updated architecture doc end-to-end as if seeing it for the first time. Check narrative flow — do the new sections fit naturally? Are transitions smooth? Does the timeout redesign make sense when read sequentially? Flag any confusing language or contradictions.
  Output: `Flow [PASS/ISSUES] | Clarity [PASS/ISSUES] | Contradictions [CLEAN/N found] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task in this plan: verify the exact changes described were made and NOTHING else. Check that no adjacent sections were modified. Check line-by-line that only planned changes appear in git diff. Flag any unaccounted additions or deletions.
  Output: `Tasks [N/N compliant] | Unaccounted changes [CLEAN/N found] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `docs(architecture): add SPOF mitigation, data model hardening, infra limits` — docs/2026-03-22-2317-ai-employee-architecture.md
- **Wave 2**: `docs(architecture): redesign timeout/re-dispatch with Pattern C Hybrid` — docs/2026-03-22-2317-ai-employee-architecture.md
- **Wave 3**: `docs(architecture): add risk mitigations, runbook updates, local dev setup` — docs/2026-03-22-2317-ai-employee-architecture.md
- **Wave 4**: `docs(architecture): apply corrections and verify cross-reference integrity` — docs/2026-03-22-2317-ai-employee-architecture.md

---

## Success Criteria

### Verification Commands
```bash
# All sections still present (28+ sections)
grep -c "^## " docs/2026-03-22-2317-ai-employee-architecture.md  # Expected: ≥ 28

# Tier 1 items present
grep -c "Supabase.*before.*Inngest\|watchdog.*reconcil" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1 (SPOF)
grep -c "WHERE status" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1 (optimistic locking)
grep -c "UNIQUE.*external_id" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1
grep -c "dual.purpose\|function host\|webhook receiver.*Inngest" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1
grep -c "local dev\|Local Development\|supabase start\|ngrok" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1

# Pattern C Hybrid present, old 90-min single-wait gone
grep -c "heartbeat\|Hybrid\|Pattern C" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 2
grep -c "6.hour\|6h.*timeout\|360.*min" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1

# Tier 2 items present
grep -c "task_status_log" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1
grep -c "Zod\|zod\|payload.*valid" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1
grep -c "Prisma\|prisma" docs/2026-03-22-2317-ai-employee-architecture.md  # ≥ 1

# Line count (net additions expected)
wc -l docs/2026-03-22-2317-ai-employee-architecture.md  # Expected: > 2600
```

### Final Checklist
- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] Document renders correctly (Mermaid diagrams valid)
- [ ] All cross-references internally consistent
