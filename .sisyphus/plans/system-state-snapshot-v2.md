# System State Snapshot v2 — Concise Edition

## TL;DR

> **Quick Summary**: Generate a concise (~500 line) current-system-state snapshot document with mermaid diagrams and numbered flow walkthroughs, covering 5 essential platform areas.
>
> **Deliverables**:
>
> - `docs/snapshots/2026-05-14-HHMM-current-system-state.md` (exact timestamp determined at write time)
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — single writing task
> **Critical Path**: Task 1 (write) → F1–F4 (verify)

---

## Context

### Original Request

User wants a new system state snapshot similar to `docs/snapshots/2026-04-29-2255-current-system-state.md` but significantly more concise. The existing snapshot is 1,338 lines and "too long and difficult to read." User wants mermaid diagrams with numbered steps and flow walkthrough tables.

### Interview Summary

**Key Discussions**:

- User selected 5 sections: Universal Lifecycle, Feedback Pipeline, Infrastructure Overview, Tenant/Secrets Architecture, Worker/Harness Internals
- Explicitly excluded employee-specific flows (guest-messaging, summarizer, code-rotation detailed flows)
- Target: ~500 lines balanced (diagrams + step tables + brief context)

**Research Findings**:

- 5 active Inngest functions (universal-lifecycle, interaction-handler, rule-extractor, rule-synthesizer, reviewing-watchdog)
- 13 gateway route files, 19 worker tools across 5 directories
- 4 active archetypes (daily-summarizer×2, guest-messaging, code-rotation)
- 24 Prisma models (3 new since Apr 29: PropertyLock, FeedbackEvent, EmployeeRule; LearnedRule dropped)
- Complete lifecycle state machine and feedback pipeline mapped

### Metis Review

**Identified Gaps** (addressed):

- Old snapshot must remain untouched (immutable point-in-time record)
- Infrastructure section needs scope lock (Docker + Fly.io only, no env var listing)
- Must show approval gate short-circuit in Universal Lifecycle
- Must not list `guest-message-poll` as active (deregistered, source preserved)
- Mermaid skill must be loaded for correct diagram conventions
- Line count hard ceiling of 600 lines
- No per-tenant channel IDs or employee-specific configuration

---

## Work Objectives

### Core Objective

Create a concise, diagram-driven system state snapshot that serves as a quick-reference for developers navigating the ai-employee platform.

### Concrete Deliverables

- One markdown file: `docs/snapshots/{timestamp}-current-system-state.md`

### Definition of Done

- [ ] File exists with correct timestamp prefix
- [ ] Line count: 400–600 lines
- [ ] Old snapshot (`2026-04-29-2255-current-system-state.md`) untouched
- [ ] All 5 sections present with mermaid diagrams
- [ ] Each diagram has a Flow Walkthrough table below it
- [ ] All 10 acceptance grep checks pass (see Task 1)

### Must Have

- 5 sections: Universal Lifecycle, Feedback Pipeline, Infrastructure Overview, Tenant/Secrets Architecture, Worker/Harness Internals
- Mermaid diagrams with numbered edges and standard color palette
- Flow Walkthrough table (numbered steps) below each diagram
- Table of contents at top
- Reflects current state (May 2026), not April 29 state
- Shows all 5 active Inngest functions by name
- Shows approval gate short-circuit (`approval_required: false` → Submitting → Done)
- Shows 24 Prisma models grouped by purpose (names only, no field detail)
- Shows reviewing-watchdog as separate cron path, not part of lifecycle diagram

### Must NOT Have (Guardrails)

- Do NOT modify or delete `docs/snapshots/2026-04-29-2255-current-system-state.md`
- Do NOT reproduce CLI syntax for shell tools — reference AGENTS.md instead
- Do NOT include per-tenant channel IDs (C092BJ04HUG, C0AUBMXKVNU, etc.)
- Do NOT list individual gateway routes — list route categories only
- Do NOT include field-level Prisma model detail
- Do NOT list `guest-message-poll` as an active Inngest function (it's deregistered)
- Do NOT document PLAT-05 planned delivery change as if implemented
- Do NOT exceed 600 lines total
- Do NOT list env vars individually — reference `.env.example` instead
- Do NOT name specific tenants (DozalDevs, VLRE) — describe the pattern tenant-agnostically
- Do NOT duplicate employee-specific flow details already in AGENTS.md
- Do NOT add excessive comments or verbose prose — keep tight and scannable

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: N/A (documentation task)
- **Automated tests**: None
- **Framework**: N/A

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task — all research already done):
└── Task 1: Write the snapshot document [writing]

Wave FINAL (After Task 1):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave  |
| ---- | ---------- | ------ | ----- |
| 1    | —          | F1–F4  | 1     |
| F1   | 1          | —      | FINAL |
| F2   | 1          | —      | FINAL |
| F3   | 1          | —      | FINAL |
| F4   | 1          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `writing` (+ `v-mermaid` skill)
- **Wave FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Write the concise system state snapshot document

  **What to do**:

  **Pre-steps** (before writing):
  - Run `date "+%Y-%m-%d-%H%M"` to get the exact filename timestamp
  - Run `git branch --show-current` to confirm on `main`
  - Run `git status --short` to confirm clean working tree
  - Read the existing snapshot at `docs/snapshots/2026-04-29-2255-current-system-state.md` (first 50 lines only — for header format reference, NOT for content copying)

  **Document structure** (write to `docs/snapshots/{timestamp}-current-system-state.md`):

  The document must have exactly this section structure, with a Table of Contents at the top:

  ```
  # AI Employee Platform — Current System State
  > As of May 14, 2026. ...

  ## Table of Contents (linked to sections)

  ## 1. Universal Employee Lifecycle
  - Brief context paragraph (3-4 sentences max)
  - Mermaid flowchart TD diagram showing:
    - Received → Triaging* → AwaitingInput* → Ready → Executing → Submitting
    - Submitting → Done (short-circuit when approval_required: false)
    - Submitting → Reviewing → Approved → Delivering → Done
    - Submitting → NO_ACTION_NEEDED override path
    - Terminal states: Done, Failed, Cancelled
    - Reviewing → Cancelled (reject/supersede/timeout)
    - Delivering → Failed (3 retries exhausted)
    - Keep under 20 nodes. Use standard classDef palette.
    - Number edges 1-8 for key transitions
  - Flow Walkthrough table (| # | Transition | What happens |)
  - Brief paragraph on terminal states (Done, Failed, Cancelled — one line each)
  - Brief paragraph on delivery mechanism (spawn second container with EMPLOYEE_PHASE=delivery, 3 retries)
  - Brief paragraph on message superseding (pending_approvals by thread_uid, old task → Cancelled)

  ## 2. Feedback Pipeline
  - Brief context paragraph (3-4 sentences)
  - Mermaid flowchart LR diagram showing:
    - 3 entry paths: thread reply, @mention, edit/reject inline
    - All converge on interaction-handler → classify intent
    - feedback/teaching → rule-extractor → proposed rule → Slack card → confirm/reject
    - Every 5 confirmed rules → rule-synthesizer → merge overlapping → new proposed rules
    - Keep under 20 nodes
  - Flow Walkthrough table
  - Brief paragraph on rule injection (EMPLOYEE_RULES env var, 8000 char cap, injected into future workers)

  ## 3. Infrastructure Overview
  - Brief context paragraph (2-3 sentences)
  - **Inngest Functions table** (| Function ID | Trigger | Purpose |) — exactly 5 rows
  - **Gateway Route Categories table** (| Category | Routes | Purpose |) — grouped, not individual
  - **Worker Tools table** (| Directory | Tools | Purpose |) — 5 rows (one per directory), tool count per dir
  - **Database Models table** (| Group | Models | Count |) — 4 groups: MVP-Active, Forward-Compatibility, Multi-Tenancy, Feedback/Rules
  - NO mermaid diagram for this section — tables are sufficient
  - Note: for CLI syntax and individual tool docs, reference AGENTS.md

  ## 4. Tenant & Secrets Architecture
  - Brief context paragraph (2-3 sentences)
  - Mermaid flowchart LR diagram showing:
    - Admin API → tenant_secrets (encrypted AES-256-GCM)
    - Lifecycle dispatches → loadTenantEnv()
    - loadTenantEnv: fetch tenant → fetch secrets → decrypt → auto-uppercase → inject into machine env
    - Additional env: EMPLOYEE_RULES, EMPLOYEE_KNOWLEDGE, raw_event fields
    - Keep under 15 nodes
  - Flow Walkthrough table
  - Brief paragraph on Slack OAuth (per-tenant, TenantInstallationStore by team ID)

  ## 5. Worker & Harness Internals
  - Brief context paragraph (2-3 sentences)
  - Mermaid flowchart TD diagram showing:
    - Lifecycle provisions machine → Harness starts
    - Harness: fetch task from DB → load archetype → inject instructions + tools
    - OpenCode session runs → writes /tmp/summary.txt + /tmp/approval-message.json
    - PATCH task → Submitting → harness exits
    - Delivery phase: same harness, EMPLOYEE_PHASE=delivery
    - SIGTERM handler → PATCH task → Failed
    - Keep under 15 nodes
  - Flow Walkthrough table
  - Brief paragraph on output contract (/tmp/summary.txt, /tmp/approval-message.json)
  - Brief paragraph on SIGTERM handling and status log writes
  ```

  **Content sources** (use these research findings — do NOT re-explore the codebase):

  **Inngest Functions (5 active)**:
  | `employee/universal-lifecycle` | event: `employee/task.dispatched` | All employee states Received→Done/Failed |
  | `employee/interaction-handler` | event: `employee/interaction.received` | Classifies thread replies, routes to rule extraction |
  | `employee/rule-extractor` | event: `employee/rule.extract-requested` | Extracts behavioral rules from corrections |
  | `employee/rule-synthesizer` | event: `employee/rule.synthesize-requested` | Merges overlapping confirmed rules |
  | `trigger/reviewing-watchdog` | cron: `*/15 * * * *` | Marks zombie Reviewing tasks Failed |

  **Gateway Route Categories**:
  - Health: `GET /health`
  - Webhooks: Jira, GitHub, Hostfully (`POST /webhooks/*`)
  - Slack OAuth: install + callback (`/slack/*`)
  - Admin Tenants: CRUD with soft-delete (`/admin/tenants/*`)
  - Admin Secrets: per-tenant secret management
  - Admin Config: tenant config deep-merge
  - Admin Projects: project CRUD
  - Admin Employees: manual trigger (`POST /admin/tenants/:id/employees/:slug/trigger`)
  - Admin Tasks: task status
  - Admin KB: knowledge base entry CRUD (NEW)
  - Admin Property Locks: property-lock mapping CRUD (NEW)

  **Worker Tools (19 across 5 dirs)**:
  - `slack/` (3): post-message, read-channels, post-guest-approval
  - `hostfully/` (8): get-messages, get-property, get-properties, get-reservations, get-reviews, send-message, register-webhook, validate-env
  - `locks/` (6): sifely-client, diagnose-access, generate-code, update-door-code, rotate-property-code, hostfully-door-code
  - `knowledge_base/` (1): search
  - `platform/` (1): report-issue

  **Prisma Models (24)**:
  - MVP-Active (7): Task, Execution, Deliverable, ValidationRun, Project, TaskStatusLog, Department
  - Forward-Compatibility (9): Archetype, KnowledgeBase, KnowledgeBaseEntry, RiskModel, CrossDeptTrigger, AgentVersion, Clarification, Review, AuditLog
  - Multi-Tenancy (5): Tenant, TenantIntegration, SystemEvent, TenantSecret, PendingApproval
  - Feedback/Rules (3): PropertyLock, FeedbackEvent, EmployeeRule

  **Lifecycle state machine**: See complete mapping in context above (Flow 1 from research)
  **Feedback pipeline**: See complete mapping in context above (Flow 2 from research)
  **Tenant env injection**: See complete mapping in context above (Flow 6 from research)
  **Worker harness**: Reference `src/workers/opencode-harness.mts` — 15-step flow documented in old snapshot `docs/snapshots/2026-04-29-2255-current-system-state.md` lines 297-430

  **Must NOT do**:
  - Do NOT copy sections from the old snapshot — write fresh from research findings
  - Do NOT include per-tenant channel IDs or employee names
  - Do NOT reproduce shell tool CLI syntax
  - Do NOT list individual gateway routes (group into categories)
  - Do NOT include Prisma model field details
  - Do NOT list `guest-message-poll` as active
  - Do NOT exceed 600 lines

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: This is a structured documentation/technical writing task producing a single markdown file
  - **Skills**: [`v-mermaid`]
    - `v-mermaid`: Required for correct mermaid diagram syntax, color palette, node limits, and numbered steps convention
  - **Skills Evaluated but Omitted**:
    - None relevant — this is a pure documentation task

  **Parallelization**:
  - **Can Run In Parallel**: NO (single task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `docs/snapshots/2026-04-29-2255-current-system-state.md:1-10` — Header format and "As of..." date line convention (format reference ONLY — do not copy content)

  **Source References** (for accuracy verification):
  - `src/gateway/inngest/serve.ts` — Authoritative list of registered Inngest functions
  - `src/inngest/employee-lifecycle.ts` — Universal lifecycle state machine implementation
  - `src/inngest/interaction-handler.ts` — Feedback pipeline entry point
  - `src/inngest/rule-extractor.ts` — Rule extraction logic
  - `src/inngest/rule-synthesizer.ts` — Rule synthesis logic
  - `src/gateway/services/tenant-env-loader.ts` — Tenant env injection implementation
  - `src/workers/opencode-harness.mts` — Worker harness implementation
  - `prisma/schema.prisma` — All 24 Prisma models

  **External References**:
  - AGENTS.md — For cross-referencing (link to it from snapshot, don't duplicate)

  **WHY Each Reference Matters**:
  - `serve.ts`: Verify exactly which 5 functions are registered — don't guess
  - `employee-lifecycle.ts`: Verify state transitions and event names are current
  - `tenant-env-loader.ts`: Verify the env injection flow hasn't changed
  - `opencode-harness.mts`: Verify harness boot sequence and output contract
  - Old snapshot header: Match the established format convention for consistency

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: File exists with correct format
    Tool: Bash
    Preconditions: Task completed, file written
    Steps:
      1. Run: ls docs/snapshots/2026-05-14-*-current-system-state.md
      2. Assert: exactly 1 file matches
      3. Run: wc -l on the matched file
      4. Assert: line count is between 400 and 600
    Expected Result: File exists, line count 400-600
    Failure Indicators: No file matches glob, or line count outside range
    Evidence: .sisyphus/evidence/task-1-file-exists.txt

  Scenario: Old snapshot untouched
    Tool: Bash
    Preconditions: File written
    Steps:
      1. Run: git diff docs/snapshots/2026-04-29-2255-current-system-state.md
      2. Assert: empty output (no diff)
    Expected Result: Zero changes to old snapshot
    Failure Indicators: Any diff output
    Evidence: .sisyphus/evidence/task-1-old-snapshot-untouched.txt

  Scenario: All 5 sections present with diagrams
    Tool: Bash
    Preconditions: File written
    Steps:
      1. Run: grep -c "^## " on the snapshot file
      2. Assert: count >= 5 (5 sections + possible ToC)
      3. Run: grep -c "^\`\`\`mermaid" on the snapshot file
      4. Assert: count >= 4 (sections 1,2,4,5 have diagrams; section 3 uses tables only)
      5. Run: grep -c "Flow Walkthrough" on the snapshot file (or equivalent "| # |" table header)
      6. Assert: count >= 4
    Expected Result: All sections have required diagrams and walkthrough tables
    Failure Indicators: Missing sections or diagrams
    Evidence: .sisyphus/evidence/task-1-sections-complete.txt

  Scenario: No forbidden content (scope creep check)
    Tool: Bash
    Preconditions: File written
    Steps:
      1. Run: grep -E "C092BJ04HUG|C0AUBMXKVNU|C0AMGJQN05S|C0960S2Q8RL" on file
      2. Assert: no output (no per-tenant channel IDs)
      3. Run: grep -E "claude-sonnet|claude-opus|gpt-4o" on file
      4. Assert: no output (no forbidden models)
      5. Run: grep -E "guest-message-poll" on file — if found, assert it says "deregistered" not "active"
    Expected Result: No forbidden content present
    Failure Indicators: Any match on channel IDs or forbidden models
    Evidence: .sisyphus/evidence/task-1-no-forbidden-content.txt

  Scenario: Correct models referenced
    Tool: Bash
    Preconditions: File written
    Steps:
      1. Run: grep "minimax/minimax-m2.7" on file
      2. Assert: at least 1 match
      3. Run: grep "anthropic/claude-haiku-4-5" on file
      4. Assert: at least 1 match
    Expected Result: Both approved models referenced
    Failure Indicators: Either model missing
    Evidence: .sisyphus/evidence/task-1-correct-models.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-file-exists.txt
  - [ ] task-1-old-snapshot-untouched.txt
  - [ ] task-1-sections-complete.txt
  - [ ] task-1-no-forbidden-content.txt
  - [ ] task-1-correct-models.txt

  **Commit**: YES
  - Message: `docs(snapshots): add concise May 2026 system state snapshot`
  - Files: `docs/snapshots/2026-05-14-*-current-system-state.md`
  - Pre-commit: `wc -l docs/snapshots/2026-05-14-*-current-system-state.md` (verify 400-600)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify the snapshot contains it. For each "Must NOT Have": search the snapshot for forbidden patterns — reject with line number if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [1/1] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Verify mermaid diagram syntax is valid (no `\n` in labels, no `end` as node label, under 20 nodes per diagram, standard color palette used). Verify markdown renders correctly (no broken links, no malformed tables). Run `wc -l` to confirm line count 400-600.
      Output: `Diagrams [N valid] | Tables [N valid] | Line Count [N] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Read the entire snapshot as a new developer would. Verify each Flow Walkthrough table matches its diagram (numbered steps align). Verify each Inngest function listed is actually registered (cross-check `src/gateway/inngest/serve.ts`). Verify Prisma model count matches `prisma/schema.prisma`. Save findings to `.sisyphus/evidence/final-qa/`.
      Output: `Accuracy [N/N verified] | Readability [GOOD/POOR] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      Verify the snapshot covers exactly 5 sections (not more, not less). Verify no employee-specific flow detail crept in (no guest-messaging step-by-step, no summarizer channel config). Verify no content was copied from the old snapshot (compare representative paragraphs). Flag any section that exceeds its intended scope.
      Output: `Sections [5/5] | Scope [CLEAN/N issues] | Originality [CLEAN/N copies] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                | Files                                                 | Pre-commit        |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------- | ----------------- |
| 1    | `docs(snapshots): add concise May 2026 system state snapshot` | `docs/snapshots/2026-05-14-*-current-system-state.md` | `wc -l` (400-600) |

---

## Success Criteria

### Verification Commands

````bash
# File exists
ls docs/snapshots/2026-05-14-*-current-system-state.md

# Line count in range
wc -l docs/snapshots/2026-05-14-*-current-system-state.md  # Expected: 400-600

# Old snapshot untouched
git diff docs/snapshots/2026-04-29-2255-current-system-state.md  # Expected: empty

# 5+ sections
grep -c "^## " docs/snapshots/2026-05-14-*-current-system-state.md  # Expected: >=5

# 4+ mermaid diagrams
grep -c '```mermaid' docs/snapshots/2026-05-14-*-current-system-state.md  # Expected: >=4

# No forbidden models
grep -E "claude-sonnet|claude-opus|gpt-4o" docs/snapshots/2026-05-14-*-current-system-state.md  # Expected: no output

# No per-tenant channel IDs
grep -E "C092BJ04HUG|C0AUBMXKVNU|C0AMGJQN05S|C0960S2Q8RL" docs/snapshots/2026-05-14-*-current-system-state.md  # Expected: no output

# Both approved models present
grep "minimax/minimax-m2.7" docs/snapshots/2026-05-14-*-current-system-state.md  # Expected: match
grep "anthropic/claude-haiku-4-5" docs/snapshots/2026-05-14-*-current-system-state.md  # Expected: match
````

### Final Checklist

- [ ] All "Must Have" items present in snapshot
- [ ] All "Must NOT Have" items absent from snapshot
- [ ] Line count: 400–600
- [ ] Old snapshot untouched
- [ ] All evidence files captured
