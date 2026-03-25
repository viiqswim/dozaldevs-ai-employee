# Architecture Document Updates — AI Employee Platform

## TL;DR

> **Quick Summary**: Update the architecture document (`docs/2026-03-22-2317-ai-employee-architecture.md`) with 16 decisions from an architecture review. All changes are documentation edits to one markdown file — no code, no new files.
> 
> **Deliverables**:
> - Updated architecture document with all critical, significant, and minor corrections applied
> - All Mermaid diagrams updated with consistent terminology
> - Verification that all changes are present and no content was lost
> 
> **Estimated Effort**: Medium (single file, but 2806 lines with cross-cutting changes)
> **Parallel Execution**: NO — all tasks edit the same file, must be sequential
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → F1-F4

---

## Context

### Original Request
Review the AI Employee Platform architecture document for gaps, inaccuracies, and improvement opportunities. Then update the document with the agreed-upon decisions.

### Interview Summary
**Key Discussions**:
- 20 findings identified across 4 severity levels (4 critical, 7 significant, 4 opportunities, 6 minor)
- User interviewed on each finding with structured choices
- All 20 decisions locked in — 14 result in document changes, 6 result in no changes

**Research Findings**:
- **Inngest**: Per-key concurrency supported, max 2h step timeout, 5 concurrent steps on free tier, max 2 concurrency constraints per function
- **OpenCode SDK**: v1.3.2, production-ready, no crash recovery mechanism, HTTP+SSE protocol
- **Fly.io**: No `--auto-destroy` flag exists, volumes are 1:1 with machines (no sharing), volume forking supported with lazy hydration, DinD works on performance-2x (user confirmed from nexus-stack), 1 req/sec machine creation rate limit

### Metis Review
**Identified Gaps** (addressed):
- C1+C4+S5 collision: All three edits touch the lifecycle pseudo-code block (lines ~1098-1222). Merged into one atomic task.
- C2+O2 overlap: Both target the same four "persistent volume" locations. Merged into one task.
- O5 rename scope: Must rename "Orchestrator" role labels only — NOT "orchestration", "orchestrate.mjs", `lifecycle_fn` enum value, or compound terms.
- 5 placement ambiguities resolved (S6 → §9.2, M6 → §14.1, O1 → callout above ER diagram, M1 UUID → `00000000-0000-0000-0000-000000000001`, M3 → canonical location in §8 only).

---

## Work Objectives

### Core Objective
Apply 14 agreed-upon changes to the architecture document, ensuring factual accuracy, internal consistency, and no content loss.

### Concrete Deliverables
- Updated `docs/2026-03-22-2317-ai-employee-architecture.md` with all changes applied

### Definition of Done
- [ ] All 10 acceptance criteria grep checks pass (see Verification Strategy)
- [ ] Final line count is between 2806 and 2950
- [ ] All Mermaid fence pairs are balanced
- [ ] Zero occurrences of "Orchestrator" as a role label in the document

### Must Have
- All 14 document changes applied as decided in the interview
- Volume forking workflow replaces "persistent volume" language
- Machine self-destruct + backup destroy + watchdog cleanup documented
- "Orchestrator" renamed to "Inngest Lifecycle Functions" in all diagrams and prose

### Must NOT Have (Guardrails)
- **No new sections or headers** — only add content within existing sections (exception: O3 adds a row to §28's table)
- **No renaming of "orchestration", "orchestrate.mjs", or compound terms** — O5 only renames the noun "Orchestrator" as a role/entity label
- **No renaming of `lifecycle_fn` enum value** in TASK_STATUS_LOG — it's a code-level enum, not a display label
- **No restructuring of §7.3 or §9.2** — C2/O2 replaces specific language, doesn't rewrite sections
- **No modifying ER diagram syntax** — O1 adds annotation in prose above/below the `erDiagram` block
- **No adding a "Layer 4"** to §10.1 — watchdog cleanup clarification belongs inside existing Layer 3
- **No adding M3 note to all four reference locations** — only to the canonical definition in §8
- **Prose style must match existing document** — no bullet-point explosions, no emoji, no new formatting patterns

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: N/A (documentation changes only)
- **Automated tests**: None (no code)
- **Framework**: N/A

### QA Policy
Every task includes grep-based verification commands. Evidence saved to `.sisyphus/evidence/`.

Verification is grep and line-count based since this is a markdown file edit.

### Acceptance Criteria (Global)

```bash
# AC1: --auto-destroy references removed
grep -c "\-\-auto-destroy" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: 0

# AC2: Volume forking language present
grep -c "volume fork\|seed volume\|fork at dispatch" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥ 3

# AC3: Orchestrator rename complete
grep -c "Orchestrator" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: 0 (or only in explicitly preserved historical context)

# AC4: Heartbeat mechanism specified
grep -c "60.second\|between validation stages" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥ 1 in §10.1

# AC5: Machine creation rate limit documented
grep -c "1 req.sec\|exponential backoff" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥ 1

# AC6: Project-level webhook filtering present
grep -c "project.*filter\|projects table\|project.key" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥ 1 in §8

# AC7: OpenCode crash recovery note present
grep -c "branch.*checkpoint\|platform.level re.dispatch" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥ 1

# AC8: dispatch-task event ID preservation documented
grep -c "webhook delivery ID\|event.*ID.*dedup\|preserve.*delivery" docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: ≥ 1

# AC9: Mermaid fence pairs balanced
# count of ```mermaid must be ≤ half of total ``` count
grep -c '```mermaid' docs/2026-03-22-2317-ai-employee-architecture.md
grep -c '```' docs/2026-03-22-2317-ai-employee-architecture.md

# AC10: No accidental truncation
wc -l docs/2026-03-22-2317-ai-employee-architecture.md
# Expected: 2806–2950
```

---

## Execution Strategy

### Why Sequential (Not Parallel)

All 14 changes edit the **same file** (`docs/2026-03-22-2317-ai-employee-architecture.md`). Parallel edits to one file risk:
- Stale `oldString` matches (one task's edit shifts content, breaking another task's match)
- Write conflicts (two tasks saving at the same time)
- Content loss (last writer wins)

Each task runs sequentially. Each task reads the current file state before editing.

### Task Grouping Strategy

Tasks are grouped by **section proximity + collision risk**, following Metis's analysis:
- Changes that touch the same lines are merged into one task (C1+C4+S5, C2+O2)
- Changes in nearby sections are grouped to minimize file reads
- The widest-scope change (O5 rename) runs last before verification

### Execution Order

```
Task 1 — §7, §8, §9.2: Volume forking + webhook filtering + crash recovery + dispatch-task note
    ↓
Task 2 — §10: Lifecycle pseudo-code (machine cleanup + rate limit + heartbeat)
    ↓
Task 3 — §13, §14, §15, §28: Data model annotations + version pinning + deferred table
    ↓
Task 4 — Cross-cutting: Rename "Orchestrator" → "Inngest Lifecycle Functions" everywhere
    ↓
Task 5 — Verification: Run all 10 AC checks + fix any failures

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → F1-F4 → user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 3, 4, 5 |
| 2 | 1 | 3, 4, 5 |
| 3 | 2 | 4, 5 |
| 4 | 3 | 5 |
| 5 | 4 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `quick`
- **Wave 2**: 1 task — T2 → `quick`
- **Wave 3**: 1 task — T3 → `quick`
- **Wave 4**: 1 task — T4 → `unspecified-low`
- **Wave 5**: 1 task — T5 → `quick`
- **FINAL**: 4 tasks — F1-F4 (parallel verification)

---

## TODOs

- [x] 1. Gateway, Runtime & Volume Updates (§7, §8, §9.2) — C2/O2, S1, S6, M3

  **What to do**:

  All edits target `docs/2026-03-22-2317-ai-employee-architecture.md`. Read the file first.

  **Change 1 — C2/O2: Replace "persistent volume" with volume forking workflow**

  Find ALL references to "persistent volume" or volume caching for Fly.io machines. There are approximately 4 locations (around lines 235, 584, 828, 1828). For each:
  - Replace language describing "persistent volume" or "shared volume" with the volume forking workflow
  - The new language should describe: maintain a seed volume per project with pre-installed dependencies → fork the seed volume at dispatch time → attach forked volume to the new machine → destroy the forked volume when the machine is destroyed
  - IMPORTANT: Line ~1828 (§14.1 Multi-Project Docker Image Strategy) may refer to Docker layer caching, not Fly.io volumes. Only replace if it's describing Fly.io volume persistence. Read the surrounding context before replacing.
  - In §7.3 (or wherever the Fly.io machine boot is described), add a brief paragraph explaining the volume forking workflow. Include the phrase "seed volume" and "fork at dispatch" for grep verification.

  **Change 2 — S1: Add project-level webhook filtering to §8**

  In §8 (Event Gateway), near the webhook handling description (around line 645-767), add a paragraph explaining:
  - The Event Gateway filters incoming webhooks by project: `issue.fields.project.key` is matched against registered projects in the `projects` table
  - Unknown projects are logged and returned with 200 OK (no task record created)
  - This prevents junk task records for Jira projects not managed by the platform
  - Keep it to one paragraph. No new diagrams.

  **Change 3 — S6: Add OpenCode crash recovery note to §9.2**

  In §9.2 (Execution Agent, around line 833-935), add a brief note:
  > "OpenCode crash recovery is handled by platform-level re-dispatch, not by OpenCode itself. If a Fly.io machine crashes mid-execution, the 3-layer monitoring system (Section 10) detects it and re-dispatches to a new machine. The new machine picks up the existing task branch as its starting point — the branch is the checkpoint. OpenCode sessions persist to disk but do not resume in-memory state after a crash."

  Place this near where the execution agent's Fly.io machine lifecycle is discussed.

  **Change 4 — M3: Document dispatch-task.ts event ID preservation**

  In §8 (Event Gateway), near the `dispatch-task.ts` recovery script reference (around line 652 or the SPOF mitigation section), add a note:
  > "When `dispatch-task.ts` re-sends events for recovery, it MUST use the original webhook delivery ID (stored in `tasks.raw_event`) as the Inngest event ID. This ensures Inngest deduplicates correctly and prevents duplicate task execution."

  Add this note ONLY at the canonical definition location in §8. Do NOT add it to the other 3 reference locations (§26, §28).

  **Must NOT do**:
  - Do not restructure §7.3, §8, or §9.2 — add content within existing structure
  - Do not add new section headers
  - Do not replace Docker layer cache references with volume forking language — only Fly.io volume references
  - Do not add M3 note to multiple locations — canonical §8 only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted text edits to specific sections of a markdown file. No code logic, no external research needed.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable — this is markdown editing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 1
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:235` — First "persistent volume" reference area
  - `docs/2026-03-22-2317-ai-employee-architecture.md:584` — §7.3 Fly.io machine section
  - `docs/2026-03-22-2317-ai-employee-architecture.md:645-767` — §8 Event Gateway section
  - `docs/2026-03-22-2317-ai-employee-architecture.md:828` — Volume reference in runtime section
  - `docs/2026-03-22-2317-ai-employee-architecture.md:833-935` — §9.2 Execution Agent section
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1828` — §14.1 Docker Image Strategy (check context before editing)

  **WHY Each Reference Matters**:
  - Lines 235, 584, 828 are the primary Fly.io volume references that need updating to volume forking language
  - Lines 645-767 are where S1 (webhook filtering) and M3 (event ID preservation) additions go
  - Lines 833-935 are where S6 (crash recovery note) goes
  - Line 1828 needs context validation — may be Docker cache, not Fly.io volume

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Volume forking language present
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -c "volume fork\|seed volume\|fork at dispatch" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert count ≥ 3
    Expected Result: At least 3 matches for volume forking terminology
    Failure Indicators: Count < 3 means some locations were missed
    Evidence: .sisyphus/evidence/task-1-volume-forking.txt

  Scenario: Project-level webhook filtering present
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "project.*filter\|projects table\|project.key\|project\.key" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match in the §8 area (lines 600-800)
    Expected Result: Webhook filtering language found in §8
    Failure Indicators: Zero matches or match outside §8
    Evidence: .sisyphus/evidence/task-1-webhook-filter.txt

  Scenario: OpenCode crash recovery note present
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "branch.*checkpoint\|platform.level re.dispatch\|branch is the checkpoint" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match in the §9 area (lines 800-950)
    Expected Result: Crash recovery note found in §9.2
    Failure Indicators: Zero matches or match in wrong section
    Evidence: .sisyphus/evidence/task-1-crash-recovery.txt

  Scenario: dispatch-task event ID note present
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "webhook delivery ID\|original.*event.*ID\|deduplicat" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match in §8 area
    Expected Result: Event ID preservation note found in §8
    Failure Indicators: Zero matches
    Evidence: .sisyphus/evidence/task-1-event-id.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-volume-forking.txt — grep output for volume forking terms
  - [ ] task-1-webhook-filter.txt — grep output for webhook filtering
  - [ ] task-1-crash-recovery.txt — grep output for crash recovery note
  - [ ] task-1-event-id.txt — grep output for event ID preservation

  **Commit**: YES (groups with Task 2)
  - Message: `docs(architecture): fix Fly.io volume strategy, add gateway filtering and runtime notes`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep checks above

---

- [x] 2. Lifecycle & Monitoring Updates (§10) — C1/C4/S5 + S7

  **What to do**:

  All edits target `docs/2026-03-22-2317-ai-employee-architecture.md`. Read §10 (around lines 1031-1250) before editing.

  **CRITICAL: C1 + C4 + S5 are ONE atomic edit to the lifecycle pseudo-code block.**
  These three changes all touch the lifecycle function pseudo-code (around lines 1098-1222). They MUST be applied as a single coherent edit to avoid inconsistency.

  **Change 1 — C1 + S5: Machine cleanup in lifecycle pseudo-code**

  In the lifecycle function pseudo-code (§10.2, around lines 1098-1222):
  - Remove any references to `--auto-destroy`. Replace with explicit machine destruction.
  - In the `finalize` step (or add one if not present), add: the lifecycle function calls the Fly.io API to destroy the machine. This is a backup — the machine self-destructs as its last step (see entrypoint.sh change below).
  - Both success AND failure paths must include machine destruction.

  In the entrypoint.sh description (§7.3 or §9.2, wherever the boot sequence is described):
  - Add: as the final step of `entrypoint.sh`, the machine calls the Fly.io Machines API (`DELETE /v1/apps/{app}/machines/{id}`) to destroy itself after task completion (success or failure).
  - This is the primary cleanup mechanism. The lifecycle function's destroy call is the backup.

  In §10.1 (3-Layer Monitoring), Layer 3 (watchdog cron):
  - Add: the watchdog also destroys any Fly.io machines that have been running for more than 4 hours. This is the safety net for machines that failed both self-destruct and lifecycle-function-driven cleanup.
  - This belongs INSIDE existing Layer 3, not as a new "Layer 4."

  **Change 2 — C4: Machine creation rate limit + backoff**

  In the lifecycle function pseudo-code, at the machine creation/dispatch step:
  - Add a note: Fly.io rate-limits machine creation to 1 request/second (3/second burst). The dispatch step uses exponential backoff with 3 retries on 429 responses.
  - Can be a brief inline comment or a note below the pseudo-code block.

  **Change 3 — S7: Specify heartbeat mechanism**

  In §10.1 Layer 2 (heartbeats, around lines 1231-1232):
  - Replace the vague "writes periodic status updates" with specific mechanism: `orchestrate.mjs` writes a heartbeat to the `executions` table between each validation stage (TypeScript, lint, unit, integration, E2E) AND on a 60-second timer, whichever comes first. The heartbeat includes: current stage, fix iteration count, and timestamp.

  **Must NOT do**:
  - Do NOT apply C1, C4, S5 as three separate edits to the pseudo-code — merge into one coherent rewrite of that block
  - Do NOT add a "Layer 4" to §10.1
  - Do NOT rename `lifecycle_fn` in the actor enum or anywhere else
  - Do NOT restructure the 3-Layer monitoring section

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted text edits to one section of a markdown file. The pseudo-code block needs careful editing but is still a text operation.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 2
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1031-1050` — §10 section header and overview
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1098-1222` — Lifecycle function pseudo-code block (C1+C4+S5 target)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1224-1236` — §10.1 3-Layer Monitoring (S7 target + C1 watchdog addition)

  **WHY Each Reference Matters**:
  - Lines 1098-1222 are the SINGLE block where C1, C4, and S5 must be merged into one coherent edit
  - Lines 1224-1236 are where S7 (heartbeat) and the watchdog machine cleanup note go

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: --auto-destroy references removed
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -c "\-\-auto-destroy" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert count = 0
    Expected Result: Zero occurrences of --auto-destroy
    Failure Indicators: Any count > 0
    Evidence: .sisyphus/evidence/task-2-auto-destroy.txt

  Scenario: Machine creation rate limit documented
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "1 req.sec\|rate.limit.*machine\|exponential backoff" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match near the lifecycle pseudo-code (lines 1050-1250)
    Expected Result: Rate limit + backoff language found near lifecycle pseudo-code
    Failure Indicators: Zero matches in the target area
    Evidence: .sisyphus/evidence/task-2-rate-limit.txt

  Scenario: Heartbeat mechanism specified
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "60.second\|between.*validation stages\|heartbeat.*timer" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match in §10.1 area (lines 1220-1260)
    Expected Result: Specific heartbeat mechanism described
    Failure Indicators: Only vague "periodic updates" language remains
    Evidence: .sisyphus/evidence/task-2-heartbeat.txt

  Scenario: Machine self-destruct documented
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "self.destruct\|destroy itself\|DELETE.*machines\|machine.*cleanup" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 2 matches (one in entrypoint, one in lifecycle/watchdog)
    Expected Result: Self-destruct mechanism documented in at least 2 locations
    Failure Indicators: Fewer than 2 matches
    Evidence: .sisyphus/evidence/task-2-machine-cleanup.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-auto-destroy.txt
  - [ ] task-2-rate-limit.txt
  - [ ] task-2-heartbeat.txt
  - [ ] task-2-machine-cleanup.txt

  **Commit**: YES (groups with Task 1)
  - Message: `docs(architecture): fix Fly.io machine lifecycle, volume strategy, and gateway filtering`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep checks above

---

- [x] 3. Data Model, Tech Stack & Deferred Capabilities Updates (§13, §14, §15, §28) — O1 + M1 + M4 + M6 + O3

  **What to do**:

  All edits target `docs/2026-03-22-2317-ai-employee-architecture.md`. Read §13, §14.1, §15, and §28 before editing.

  **Change 1 — O1: Add MVP-active table annotation to §13**

  Above the ER diagram block (before `\`\`\`mermaid` around line 1476), add a callout note:

  > **MVP Active Tables**: The following 7 tables are actively used in MVP (M1 + M3). All other tables are created at schema setup for forward compatibility but are not populated until their corresponding milestone.
  >
  > **Actively used in MVP**: `tasks`, `executions`, `deliverables`, `validation_runs`, `projects`, `feedback`, `task_status_log`
  >
  > **Created but unused until post-MVP**: `departments`, `archetypes`, `knowledge_bases`, `risk_models`, `cross_dept_triggers`, `agent_versions`, `clarifications`, `reviews`

  Do NOT modify the ER diagram syntax itself. Place the annotation in prose above or below the `erDiagram` block.

  **Change 2 — M1: Add default constant UUID for tenant_id**

  In §13 (Data Model), near the `tenant_id` discussion (around line 1704 where multi-tenant isolation is discussed), add:

  > "For MVP, `tenant_id` uses a default constant UUID (`00000000-0000-0000-0000-000000000001`) across all tables. The column is NOT NULL with this default, so insert statements don't need to specify it. When multi-tenancy is added, the default is removed and application logic populates `tenant_id` per request."

  **Change 3 — M4: Add CHECK constraint to TASK_STATUS_LOG.actor**

  In the `TASK_STATUS_LOG` entity definition (around lines 1631-1638), update the `actor` field comment to include:
  - Change `"enum: gateway, lifecycle_fn, watchdog, manual"` to include: `CHECK (actor IN ('gateway', 'lifecycle_fn', 'watchdog', 'manual'))`
  - Or add a note below the entity definition specifying the CHECK constraint.

  **Change 4 — M6: Add OpenCode version pinning note to §14.1**

  In §14.1 (Multi-Project Docker Image Strategy, around line 1809), in the "Base image contents" list, add:
  - A note that the Dockerfile MUST pin OpenCode CLI to a specific version (e.g., `opencode@1.3.2`). Upgrades should be deliberate and tested, not automatic.

  **Change 5 — O3: Add pre-warmed machine pool to §28 Deferred Capabilities**

  In §28 (Deferred Capabilities, around lines 2784-2804), add a new row to the deferred capabilities table. Read the table header first and match the column structure exactly. The row should contain:
  - **Deferred Capability**: Pre-warmed Machine Pool (standby machines)
  - **What We Use Instead (V1)**: Create machines on-demand via Fly.io Machines API with exponential backoff on rate limits
  - **What We Gave Up**: Faster task start time (machine `start` is ~5-10s vs `create` at ~15-30s); avoidance of 1 req/sec creation rate limit
  - **When to Reconsider**: When machine creation rate limit causes visible queuing delays, or when concurrent task volume regularly exceeds 5 simultaneous dispatches
  - **Migration Path**: Maintain a pool of 3-5 stopped `performance-2x` machines with forked seed volumes attached. On task arrival, `start` a pooled machine instead of `create` a new one. Add pool size monitoring and auto-replenishment. ~1 day of work.

  **Must NOT do**:
  - Do NOT modify the ER diagram `erDiagram` syntax block
  - Do NOT add new section headers
  - Do NOT restructure §28's table — add one row matching existing format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small targeted additions to several sections. Each change is 1-3 sentences or a table row.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 3
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1474-1639` — §13 Data Model (ER diagram + entity definitions)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1631-1638` — TASK_STATUS_LOG entity (M4 target)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1700-1705` — tenant_id discussion (M1 target)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:1809-1832` — §14.1 Docker Image Strategy (M6 target)
  - `docs/2026-03-22-2317-ai-employee-architecture.md:2784-2804` — §28 Deferred Capabilities table (O3 target)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: MVP table annotation present
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "MVP Active\|actively used in MVP\|Created but unused" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match near §13 (lines 1470-1650)
    Expected Result: MVP annotation found above ER diagram
    Failure Indicators: Zero matches
    Evidence: .sisyphus/evidence/task-3-mvp-annotation.txt

  Scenario: tenant_id default UUID documented
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "00000000-0000-0000-0000-000000000001\|default constant UUID" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match
    Expected Result: Default UUID value documented
    Failure Indicators: Zero matches
    Evidence: .sisyphus/evidence/task-3-tenant-uuid.txt

  Scenario: Pre-warmed machine pool in deferred capabilities
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "Pre-warmed\|standby machines\|pool.*stopped" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert at least 1 match in §28 area (lines 2780+)
    Expected Result: Pre-warmed pool row added to deferred table
    Failure Indicators: Zero matches or match outside §28
    Evidence: .sisyphus/evidence/task-3-prewarmed-pool.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-mvp-annotation.txt
  - [ ] task-3-tenant-uuid.txt
  - [ ] task-3-prewarmed-pool.txt

  **Commit**: YES
  - Message: `docs(architecture): add data model annotations, version pinning, and deferred capabilities`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep checks above

---

- [x] 4. Rename "Orchestrator" to "Inngest Lifecycle Functions" (Cross-cutting) — O5

  **What to do**:

  This is the widest-scope change. It touches prose, diagram node labels, and Mermaid participant names across the entire document.

  **Step 1: Inventory all occurrences**

  Before making ANY edits, run:
  ```bash
  grep -n "Orchestrator" docs/2026-03-22-2317-ai-employee-architecture.md
  ```

  Categorize each match:
  - **RENAME**: "Orchestrator" used as a role/entity label (e.g., "the Orchestrator dispatches...", diagram node `Orchestrator["Orchestrator"]`)
  - **PRESERVE**: Part of compound terms like "orchestration", "workflow orchestration", "orchestrate.mjs", or inside quoted historical context
  - **CHECK**: Mermaid `participant Orchestrator as ...` — may already be correct

  **Step 2: Rename role labels**

  For each RENAME match:
  - Replace "Orchestrator" with "Inngest Lifecycle Functions" in prose
  - In Mermaid `sequenceDiagram` blocks: update `participant` declarations. Note: the §11 sequence diagram may already use "Inngest Lifecycle Functions" as a participant — verify before changing.
  - In Mermaid `graph`/`flowchart` blocks: update node labels (e.g., `ORCH["Orchestrator"]` → `ORCH["Inngest Lifecycle Functions"]`)

  **Step 3: Verify completeness**

  After all renames:
  ```bash
  grep -n "Orchestrator" docs/2026-03-22-2317-ai-employee-architecture.md
  ```
  Expected: ZERO results. If any remain, evaluate whether they're legitimate preserved uses or missed renames.

  **Rename scope rules (CRITICAL):**
  - YES rename: "Orchestrator" as a standalone role label, node label, or participant name
  - YES rename: "The Orchestrator" at start of sentences
  - NO rename: "orchestration" (lowercase compound term)
  - NO rename: "orchestrate.mjs" (filename)
  - NO rename: "workflow orchestration" (descriptive phrase)
  - NO rename: `lifecycle_fn` in TASK_STATUS_LOG actor enum (code-level value)
  - NO rename: "orchestrator" in contexts where it clearly refers to the general concept, not the specific component

  **Must NOT do**:
  - Do NOT rename any term that isn't "Orchestrator" as a specific role/entity label
  - Do NOT break Mermaid diagram syntax — test that all `participant` and node declarations are valid after renaming
  - Do NOT rename more than needed — if a diagram already uses "Inngest Lifecycle Functions", leave it alone

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Cross-cutting rename requires careful grep-then-replace across a large file. Not complex logic, but needs precision and attention to context.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 4
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-ai-employee-architecture.md` — entire file (cross-cutting change)
  - Key sections: §3.2 (~line 270), §10 (~lines 1031, 1249), §10.1 (~line 1228), §10.2 (~line 1239)
  - Sequence diagram: §11 (~lines 1263-1307) — may already use correct naming
  - All Mermaid `graph LR` and `flowchart` blocks throughout the document

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — all Orchestrator role labels renamed
    Tool: Bash (grep)
    Preconditions: File has been edited with all renames
    Steps:
      1. Run: grep -c "Orchestrator" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert count = 0
    Expected Result: Zero occurrences of "Orchestrator" (capital O, role label)
    Failure Indicators: Any count > 0 means missed renames
    Evidence: .sisyphus/evidence/task-4-orchestrator-gone.txt

  Scenario: Preserved terms not renamed
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -c "orchestrat" docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert count > 0 (compound terms like "orchestration", "orchestrate.mjs" should still exist)
    Expected Result: Compound terms preserved (lowercase "orchestration", "orchestrate.mjs" still present)
    Failure Indicators: Count = 0 means over-renaming occurred
    Evidence: .sisyphus/evidence/task-4-compound-preserved.txt

  Scenario: Mermaid diagrams still valid
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -c '```mermaid' docs/2026-03-22-2317-ai-employee-architecture.md
      2. Run: grep -c '```' docs/2026-03-22-2317-ai-employee-architecture.md
      3. Assert mermaid_count * 2 <= total_fence_count (each mermaid block has open + close)
    Expected Result: Mermaid fence pairs balanced
    Failure Indicators: Unbalanced fences indicate broken diagram syntax
    Evidence: .sisyphus/evidence/task-4-mermaid-valid.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-orchestrator-gone.txt
  - [ ] task-4-compound-preserved.txt
  - [ ] task-4-mermaid-valid.txt

  **Commit**: YES
  - Message: `docs(architecture): rename Orchestrator to Inngest Lifecycle Functions throughout`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: grep checks above

---

- [x] 5. Final Verification & Fixes — All AC checks

  **What to do**:

  Run ALL 10 acceptance criteria checks from the Verification Strategy section. Fix any failures.

  **Step 1: Run all checks**

  Execute each of the 10 grep/wc commands listed in the Verification Strategy section. Record results.

  **Step 2: Fix failures**

  If any check fails:
  - Read the relevant section of the document
  - Apply the missing edit
  - Re-run the failing check to confirm it passes

  **Step 3: Final line count**

  Run `wc -l docs/2026-03-22-2317-ai-employee-architecture.md`. Verify the count is between 2806 and 2950. If below 2806, content was lost — investigate. If above 2950, excessive content was added — review for bloat.

  **Step 4: Section header integrity**

  Verify all original section headers (§1 through §28) are still present. Run:
  ```bash
  grep -n "^## " docs/2026-03-22-2317-ai-employee-architecture.md | wc -l
  ```
  Compare with the original count. Headers should not have been added or removed.

  **Must NOT do**:
  - Do NOT add new content beyond fixing verification failures
  - Do NOT restructure any section while "fixing"

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running grep commands and making small fixes. Mechanical verification task.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Wave 5
  - **Blocks**: F1-F4
  - **Blocked By**: Task 4

  **References**:
  - This plan's Verification Strategy section (AC1-AC10)
  - `docs/2026-03-22-2317-ai-employee-architecture.md` — the file being verified

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 10 AC checks pass
    Tool: Bash
    Preconditions: Tasks 1-4 completed
    Steps:
      1. Run each of the 10 AC commands from Verification Strategy
      2. Record pass/fail for each
      3. Fix any failures
      4. Re-run until all 10 pass
    Expected Result: 10/10 checks passing
    Failure Indicators: Any check failing after fixes
    Evidence: .sisyphus/evidence/task-5-all-checks.txt

  Scenario: Line count within range
    Tool: Bash
    Preconditions: All edits complete
    Steps:
      1. Run: wc -l docs/2026-03-22-2317-ai-employee-architecture.md
      2. Assert count between 2806 and 2950
    Expected Result: Line count in expected range
    Failure Indicators: Below 2806 (content lost) or above 2950 (bloat)
    Evidence: .sisyphus/evidence/task-5-line-count.txt

  Scenario: Section headers intact
    Tool: Bash (grep)
    Preconditions: All edits complete
    Steps:
      1. Run: grep -c "^## " docs/2026-03-22-2317-ai-employee-architecture.md
      2. Compare with original count (should be same or +1 at most)
    Expected Result: Same number of section headers as original document
    Failure Indicators: Missing or extra headers
    Evidence: .sisyphus/evidence/task-5-headers.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-all-checks.txt — consolidated results of all 10 AC checks
  - [ ] task-5-line-count.txt — final line count
  - [ ] task-5-headers.txt — section header count comparison

  **Commit**: YES (if fixes were needed)
  - Message: `docs(architecture): verification fixes`
  - Files: `docs/2026-03-22-2317-ai-employee-architecture.md`
  - Pre-commit: all 10 AC checks passing

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify the change exists in the document (grep for key phrases). For each "Must NOT Have": search for forbidden patterns — reject with location if found. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Verify all Mermaid diagrams render correctly (balanced fences, valid syntax). Check for broken cross-references (section numbers, line references). Verify no content was accidentally deleted by comparing section headers before/after. Check prose style consistency.
  Output: `Diagrams [N valid/N total] | Cross-refs [PASS/FAIL] | Sections [N/N present] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Read the updated document end-to-end. Verify each of the 14 changes reads naturally and integrates with surrounding content. Check that the O5 rename is complete (no stale "Orchestrator" references). Verify volume forking workflow is clear and consistent across all mentions. Check that the lifecycle pseudo-code tells a coherent story with all additions.
  Output: `Changes [N/N integrated] | Rename [COMPLETE/INCOMPLETE] | Coherence [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Verify 1:1 correspondence between the 14 planned changes and what was actually changed. Flag any unplanned changes (scope creep). Verify no content was added that wasn't in the decision list. Check that the 6 "no change" decisions truly have no changes.
  Output: `Planned [N/N applied] | Unplanned [0/N] | No-change items [N/N verified] | VERDICT`

---

## Commit Strategy

- **commit-1**: `docs(architecture): fix Fly.io machine lifecycle, volume strategy, and gateway filtering` — T1+T2 changes
- **commit-2**: `docs(architecture): add data model annotations, version pinning, and deferred capabilities` — T3 changes
- **commit-3**: `docs(architecture): rename Orchestrator to Inngest Lifecycle Functions throughout` — T4 changes
- **commit-4**: `docs(architecture): verification fixes` — T5 fixes (if any)

---

## Success Criteria

### Verification Commands
```bash
# All 10 AC checks pass (see Verification Strategy section)
# Zero grep matches for "--auto-destroy"
# Zero grep matches for "Orchestrator" (as role label)
# ≥3 grep matches for volume forking language
# Line count between 2806 and 2950
# Mermaid fences balanced
```

### Final Checklist
- [ ] All 14 changes present and readable
- [ ] All "Must NOT Have" guardrails respected
- [ ] No content lost (section headers all present)
- [ ] Mermaid diagrams valid
- [ ] Prose style consistent with rest of document
