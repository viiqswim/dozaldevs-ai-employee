# System State Snapshot — April 29, 2026

## TL;DR

> **Quick Summary**: Create a new verified "Current System State" document capturing all platform changes since the last snapshot (April 24). Every fact verified against actual source code, DB schema, and infrastructure artifacts — zero assumptions.
>
> **Deliverables**:
>
> - `docs/2026-04-29-HHMM-current-system-state.md` (timestamp set at write time)
> - All 4 Mermaid diagrams verified and updated
> - New sections for subsystems added since April 24
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Tasks 2-11 → Task 12 → Tasks 13-14 → F1-F4

---

## Context

### Original Request

Create a new document similar to `docs/2026-04-24-1452-current-system-state.md`, showing the current state of the system. Every section must be verified against the actual codebase, DB, or other artifacts for 100% accuracy. No assumptions.

### Interview Summary

**Key Discussions**:

- **New document vs update**: New file with today's date — old doc preserved as historical snapshot
- **Section structure**: Same structure as existing doc PLUS discover and add new sections for new subsystems
- **Mermaid diagrams**: All 4 diagrams must be verified and updated against current code

### Metis Review

**Identified Gaps** (addressed):

- **136 commits since April 24** — substantial delta requiring thorough verification
- **Shell tools grew from 11→13**: 2 new Slack tools (`post-guest-approval.ts`, `post-no-action-notification.ts`)
- **New Inngest functions**: `rule-extractor`, `learned-rules-expiry`, `unresponded-message-alert`, `guest-message-poller`
- **5 new DB migrations**: `delivery_instructions`, `notification_channel`, `pending_approvals`, reminder fields, `learned_rules`
- **New subsystems**: Learned Rules pipeline, Rejection Feedback loop, Message Superseding, Reply Anyway, Conversation History context, Unresponded Message Alerts, Prompt Injection Protection
- **Notepad template format needed**: All Wave 1 agents must use identical output structure
- **Non-overlapping section assignments**: Each verification task has explicit, non-overlapping scope
- **Ground truth counts first**: Wave 0 establishes verified counts before section verification begins

---

## Work Objectives

### Core Objective

Produce a verified, comprehensive system state document that accurately reflects the AI Employee Platform as of April 29, 2026.

### Concrete Deliverables

- `docs/2026-04-29-HHMM-current-system-state.md` — complete system state snapshot
- 11 verification notepad files in `.sisyphus/notepads/system-state-snapshot/` — audit trail

### Definition of Done

- [ ] Document exists at `docs/2026-04-29-HHMM-current-system-state.md`
- [ ] Zero `[UNVERIFIED]` markers in the final document
- [ ] Shell tool count in doc matches `ls src/worker-tools/**/*.ts | wc -l`
- [ ] DB model count in doc matches `grep "^model " prisma/schema.prisma | wc -l`
- [ ] Inngest function count in doc matches actual registrations in serve file
- [ ] All 4 Mermaid diagrams present and syntactically valid
- [ ] No forbidden model references (`claude-sonnet-*`, `claude-opus-*`, `gpt-4o`, `gpt-4o-mini`)

### Must Have

- Every section verified against actual source files with `[file:line]` citations in notepads
- Accurate counts for: shell tools, Inngest functions, DB models, migrations, libraries, scripts, test files
- New sections for subsystems added since April 24 (Learned Rules, Message Superseding, etc.)
- Updated Mermaid diagrams reflecting current architecture
- Phase 1 progress section reflecting current story map state

### Must NOT Have (Guardrails)

- **No fabrication**: If source cannot be found, mark `[UNVERIFIED]` — do NOT guess
- **No code changes**: This is documentation-only — do not fix any bugs discovered during verification
- **No README updates**: Out of scope — do not modify `README.md`
- **No stale counts from old doc**: Every count must be re-verified by reading actual files/running commands
- **No forbidden model references** in the document text
- **No section structure invention**: The assembly task follows the structure established by verification findings

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — this is a documentation task, not code
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Documentation**: Use Bash (grep, wc, diff) — verify counts, check for markers, validate structure
- **Diagrams**: Use Bash (grep for Mermaid blocks) — verify syntax patterns

---

## Execution Strategy

### Notepad Template (ALL Wave 1 agents MUST use this format)

````markdown
# {Section Name} — Verification Notepad

## Source Files Verified

- `path/to/file:line-range` — what was found

## Current State

{Factual description of the current state, ready to be assembled into the final document.
Include ALL content needed for this section — tables, lists, descriptions.
This should be copy-paste ready for the assembly task.}

## Changes from April 24 Doc

- {Specific change 1}
- {No change detected} (if section is unchanged)

## New Content (not in old doc)

- {New subsection/feature that warrants documentation}

## Mermaid Diagram (if applicable)

```mermaid
{Updated diagram code}
```
````

## Unresolved

- {Anything marked [UNVERIFIED] — assembly task must resolve or omit}

```

### Parallel Execution Waves

```

Wave 0 (Foundation — establishes ground truth):
└── Task 1: Ground Truth Counts [quick]

Wave 1 (After Wave 0 — MAX PARALLEL verification):
├── Task 2: Employees & Archetypes (depends: 1) [deep]
├── Task 3: Lifecycle States & Transitions (depends: 1) [deep]
├── Task 4: OpenCode Harness (depends: 1) [deep]
├── Task 5: Shell Tools (depends: 1) [deep]
├── Task 6: Inngest Functions & Feedback Pipeline (depends: 1) [deep]
├── Task 7: Gateway Routes & Slack Bolt (depends: 1) [deep]
├── Task 8: Database Schema & Migrations (depends: 1) [deep]
├── Task 9: Docker & Infrastructure (depends: 1) [deep]
├── Task 10: Libraries, Scripts & Project Structure (depends: 1) [deep]
└── Task 11: Tenant Config, KB, LLM Models & Phase 1 Progress (depends: 1) [deep]

Wave 2 (After Wave 1 — assembly):
└── Task 12: Assemble Full Document (depends: 2-11) [deep]

Wave 3 (After Wave 2 — parallel review):
├── Task 13: Accuracy Audit (depends: 12) [deep]
└── Task 14: Completeness Check (depends: 12) [deep]

Post-Wave 3:
└── Task 15: Notify completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2-11 (any) → Task 12 → Task 13/14 → F1-F4 → user okay
Parallel Speedup: ~75% faster than sequential
Max Concurrent: 10 (Wave 1)

````

### Dependency Matrix

| Task | Blocked By | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2-11 | 0 |
| 2 | 1 | 12 | 1 |
| 3 | 1 | 12 | 1 |
| 4 | 1 | 12 | 1 |
| 5 | 1 | 12 | 1 |
| 6 | 1 | 12 | 1 |
| 7 | 1 | 12 | 1 |
| 8 | 1 | 12 | 1 |
| 9 | 1 | 12 | 1 |
| 10 | 1 | 12 | 1 |
| 11 | 1 | 12 | 1 |
| 12 | 2-11 | 13, 14 | 2 |
| 13 | 12 | F1-F4 | 3 |
| 14 | 12 | F1-F4 | 3 |
| 15 | 13, 14 | — | Post-3 |
| F1-F4 | 13, 14 | — | FINAL |

### Agent Dispatch Summary

- **Wave 0**: **1** — T1 → `quick`
- **Wave 1**: **10** — T2-T11 → `deep`
- **Wave 2**: **1** — T12 → `deep`
- **Wave 3**: **2** — T13-T14 → `deep`
- **Post-3**: **1** — T15 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Ground Truth Counts

  **What to do**:
  - Run commands to establish verified baseline counts that all Wave 1 agents reference:
    - `grep "^model " prisma/schema.prisma | wc -l` → exact DB model count
    - `ls src/worker-tools/**/*.ts` → exact shell tool list and count
    - Read `src/gateway/inngest/serve.ts` → exact Inngest function list, IDs, and count
    - `ls prisma/migrations/ | wc -l` → exact migration count
    - `ls src/lib/*.ts | wc -l` → exact shared library count
    - `ls scripts/*.ts scripts/*.sh | wc -l` → exact script count
    - `ls tests/**/*.test.ts | wc -l` → exact test file count
    - `ls docs/*.md | wc -l` → exact docs count
  - Write all counts and file lists to `.sisyphus/notepads/system-state-snapshot/00-ground-truth.md`
  - Use the notepad template format specified in the Execution Strategy section

  **Must NOT do**:
  - Do not reference counts from the old document — verify everything fresh
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple command execution and file listing — no complex analysis needed
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — this is pure command execution

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before Wave 1)
  - **Parallel Group**: Wave 0 (solo)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` — grep for `^model ` to count all DB models
  - `src/gateway/inngest/serve.ts` — find all function registrations to get exact Inngest function count and IDs

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `prisma/schema.prisma` — the single source of truth for DB model count; old doc said 21, may have changed
  - `src/gateway/inngest/serve.ts` — the single source of truth for registered Inngest functions; old doc said 9, likely grew

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Ground truth file created with all counts
    Tool: Bash
    Preconditions: Repository is at current HEAD
    Steps:
      1. Run `cat .sisyphus/notepads/system-state-snapshot/00-ground-truth.md`
      2. Assert file contains sections: "DB Models", "Shell Tools", "Inngest Functions", "Migrations", "Libraries", "Scripts", "Test Files", "Docs"
      3. Assert each section has a numeric count and a file list
    Expected Result: File exists with all 8 sections, each containing a count ≥ 1
    Failure Indicators: File missing, any section missing, any count = 0
    Evidence: .sisyphus/evidence/task-1-ground-truth-created.txt

  Scenario: Counts are real numbers from actual commands
    Tool: Bash
    Preconditions: Ground truth file exists
    Steps:
      1. Run `grep "^model " prisma/schema.prisma | wc -l`
      2. Compare with DB model count in ground truth file
      3. Assert they match exactly
    Expected Result: Count in ground truth file matches live command output
    Failure Indicators: Mismatch between file and command
    Evidence: .sisyphus/evidence/task-1-count-verification.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-ground-truth-created.txt`
  - [ ] `.sisyphus/evidence/task-1-count-verification.txt`

  **Commit**: NO

---

- [x] 2. Verify Employees & Archetypes

  **What to do**:
  - Read `.sisyphus/notepads/system-state-snapshot/00-ground-truth.md` for baseline counts
  - Read `prisma/seed.ts` to find ALL archetype records — document each one:
    - Archetype ID, role_name, tenant_id, model, runtime, risk_model
    - New fields added since April 24: `delivery_instructions`, `notification_channel`, `agents_md`, `concurrency`
  - Read `prisma/schema.prisma` for the `archetypes` model — document all columns
  - Read `prisma/schema.prisma` for the `departments` model
  - Determine which employees are active vs deprecated — check for any new employees beyond the 3 in the old doc
  - For Guest Messaging: document classification output format, concurrency, delivery mechanism, tools used
  - For Daily Summarizer: document channel config per tenant
  - Write complete section content (ready for copy-paste into final doc) to `.sisyphus/notepads/system-state-snapshot/02-employees.md`
  - Include an "Employees" table with columns: Employee, Department, Trigger, Delivery, Tenant, Status

  **Must NOT do**:
  - Do not cover lifecycle states (Task 3's scope)
  - Do not cover shell tool details (Task 5's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires reading multiple files (seed.ts is 3400+ lines), cross-referencing archetype records, and synthesizing into documentation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — pure code reading and documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — all archetype `upsert` calls define employee configurations (search for `archetypes` upsert)
  - `docs/2026-04-24-1452-current-system-state.md:94-120` — old "Employees" section to compare against

  **API/Type References**:
  - `prisma/schema.prisma` — `model archetypes` definition for complete column list
  - `prisma/schema.prisma` — `model departments` definition

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `prisma/seed.ts` — the actual source of truth for what employees exist, their archetypes, and configuration
  - Old doc — needed to identify what changed (new employees, new fields, removed employees)
  - `prisma/schema.prisma` — verifies which columns exist on the archetypes model (delivery_instructions, notification_channel, agents_md are new)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All archetypes documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Run `grep -c "upsert" prisma/seed.ts | head -1` to count archetype upserts
      2. Count archetype entries in the notepad file
      3. Assert counts match
    Expected Result: Every archetype in seed.ts is documented in the notepad
    Failure Indicators: Archetype in seed.ts missing from notepad
    Evidence: .sisyphus/evidence/task-2-archetype-count.txt

  Scenario: New archetype fields documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Run `grep "delivery_instructions\|notification_channel\|agents_md\|concurrency" prisma/schema.prisma` to find new fields
      2. Check notepad mentions each field
    Expected Result: All new fields are mentioned and explained in the notepad
    Failure Indicators: A field exists in schema but is not mentioned in notepad
    Evidence: .sisyphus/evidence/task-2-new-fields.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-archetype-count.txt`
  - [ ] `.sisyphus/evidence/task-2-new-fields.txt`

  **Commit**: NO

---

- [x] 3. Verify Lifecycle States & Transitions

  **What to do**:
  - Read `src/inngest/employee-lifecycle.ts` end-to-end — document:
    - All states in the lifecycle (Received → ... → Done/Failed/Cancelled)
    - All auto-pass states and which are blocking
    - The approval gate logic (`risk_model.approval_required`)
    - Terminal states and what triggers them
    - New branches added since April 24:
      - Rejection feedback loop (GM-17): what happens on reject? Does it store rejection reason?
      - Reply Anyway (GM-16): is there a `guest_reply_anyway` action? How does it affect lifecycle?
      - Message superseding (GM-11): `pending_approvals` table interaction, superseded action
      - Delivery phase: does lifecycle spawn a delivery machine or post inline? Check for `EMPLOYEE_PHASE=delivery`
  - Verify the state machine diagram — update the Mermaid `stateDiagram-v2` to include any new transitions
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/03-lifecycle.md`
  - Include the updated Mermaid state diagram in the notepad

  **Must NOT do**:
  - Do not cover harness internals (Task 4's scope)
  - Do not cover Inngest function registration (Task 6's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: The lifecycle file is complex (~1000+ lines) with many state transitions, conditional branches, and new features. Requires careful reading to catch all transitions.
  - **Skills**: [`v-mermaid`]
    - `v-mermaid`: Needed to produce a syntactically correct and well-formatted state diagram
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts` — the complete lifecycle implementation; read the entire file
  - `docs/2026-04-24-1452-current-system-state.md:123-158` — old "Universal Lifecycle States" section to compare against

  **API/Type References**:
  - `prisma/schema.prisma` — `model pending_approvals` for message superseding
  - `prisma/schema.prisma` — `model tasks` for status enum/field

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `employee-lifecycle.ts` — THE source of truth for all lifecycle states and transitions
  - Old doc — needed to identify what's new (rejection feedback, reply anyway, superseding, delivery phase)
  - `pending_approvals` schema — verifies the message superseding feature exists and its structure

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All lifecycle states documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep `employee-lifecycle.ts` for all state transitions (search for status PATCH calls or state constants)
      2. Compare against states listed in the notepad
      3. Assert every state in the code appears in the notepad
    Expected Result: Complete state coverage — no state in code missing from docs
    Failure Indicators: A state transition in code not mentioned in notepad
    Evidence: .sisyphus/evidence/task-3-states-coverage.txt

  Scenario: Mermaid state diagram is syntactically valid
    Tool: Bash
    Preconditions: Notepad contains a mermaid code block
    Steps:
      1. Extract the mermaid block from the notepad
      2. Verify it starts with `stateDiagram-v2`
      3. Verify all state names are valid identifiers (no spaces, no special chars)
      4. Verify transitions use `-->` syntax
    Expected Result: Diagram follows valid Mermaid stateDiagram-v2 syntax
    Failure Indicators: Missing `stateDiagram-v2` header, invalid state names, broken transition syntax
    Evidence: .sisyphus/evidence/task-3-diagram-syntax.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-states-coverage.txt`
  - [ ] `.sisyphus/evidence/task-3-diagram-syntax.txt`

  **Commit**: NO

- [x] 4. Verify OpenCode Harness

  **What to do**:
  - Read `src/workers/opencode-harness.mts` end-to-end — document every step from start to exit:
    - Environment validation (TASK_ID)
    - SIGTERM handler registration
    - Task + archetype fetch from Supabase
    - Execution record creation
    - Auth + config file writing
    - AGENTS.md resolution (3-level fallback)
    - New context injections added since April 24:
      - `FEEDBACK_CONTEXT` (already in old doc)
      - `LEARNED_RULES_CONTEXT` (new — GM-19)
      - `REPLY_ANYWAY_CONTEXT` (new — GM-16)
      - Conversation history context (new — GM-14)
    - OpenCode subprocess spawning
    - Output file reading (`/tmp/summary.txt`, `/tmp/approval-message.json`)
    - Deliverable POST to Supabase
    - Task status PATCH to Submitting
    - Inngest event firing
  - Read `src/workers/lib/agents-md-resolver.mts` — document the 3-level fallback logic
  - Read `src/workers/config/agents.md` — document what the static AGENTS.md contains
  - Verify the harness sequence diagram — update the Mermaid `sequenceDiagram` with any new steps
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/04-harness.md`
  - Include the updated Mermaid sequence diagram and step-by-step table

  **Must NOT do**:
  - Do not cover shell tools (Task 5's scope)
  - Do not cover lifecycle states (Task 3's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: The harness file is complex with multiple async steps, context injections, and subprocess management. Requires careful sequential reading.
  - **Skills**: [`v-mermaid`]
    - `v-mermaid`: Needed for the sequence diagram update
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-3, 5-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts` — the complete harness implementation; read the entire file
  - `src/workers/lib/agents-md-resolver.mts` — AGENTS.md 3-level fallback resolver
  - `src/workers/config/agents.md` — static platform AGENTS.md content
  - `docs/2026-04-24-1452-current-system-state.md:161-223` — old "Workers: OpenCode Harness" section

  **API/Type References**:
  - `src/workers/lib/postgrest-client.ts` — PostgREST HTTP client used by harness

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `opencode-harness.mts` — THE source of truth for every step the harness performs
  - `agents-md-resolver.mts` — defines the exact fallback logic for AGENTS.md resolution
  - `config/agents.md` — the static content that ships in the Docker image
  - Old doc — needed to identify new steps (context injections, delivery phase, etc.)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All harness steps documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Count major functional blocks in opencode-harness.mts (look for PATCH/POST/GET calls, file writes, subprocess spawn)
      2. Count steps in the notepad's step table
      3. Assert notepad step count ≥ code block count
    Expected Result: Every major code block has a corresponding documented step
    Failure Indicators: Code block exists without a documented step
    Evidence: .sisyphus/evidence/task-4-step-coverage.txt

  Scenario: New context injections documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep opencode-harness.mts for "CONTEXT" (case-insensitive) to find all context injection points
      2. Check each is mentioned in the notepad
    Expected Result: All context injections (FEEDBACK, LEARNED_RULES, REPLY_ANYWAY, conversation history) documented
    Failure Indicators: A CONTEXT reference in code not mentioned in notepad
    Evidence: .sisyphus/evidence/task-4-context-injections.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-4-step-coverage.txt`
  - [ ] `.sisyphus/evidence/task-4-context-injections.txt`

  **Commit**: NO

---

- [x] 5. Verify Shell Tools

  **What to do**:
  - `ls src/worker-tools/` to get exact directory listing of all tool directories
  - For EACH `.ts` file in `src/worker-tools/`:
    - Read the file to extract: CLI flags (parse `process.argv` or arg parsing), output JSON shape, required env vars, exit codes
    - Document the exact `tsx /tools/{dir}/{file}.ts` invocation syntax
    - Document the JSON output format with field names
  - Cross-reference with ground truth count from Task 1
  - Known new tools since April 24 (verify these exist):
    - `src/worker-tools/slack/post-guest-approval.ts`
    - `src/worker-tools/slack/post-no-action-notification.ts`
  - Verify the Dockerfile `COPY src/worker-tools/ /tools/` line still exists
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/05-tools.md`
  - Include per-directory tables matching the old doc's format

  **Must NOT do**:
  - Do not cover the harness (Task 4's scope)
  - Do not cover Hostfully API details beyond what the tool exposes
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read 13+ TypeScript files and extract CLI interfaces from argument parsing code. Each tool has different patterns.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — pure code reading and tabulation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-4, 6-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/` — all Slack tools (read every .ts file)
  - `src/worker-tools/hostfully/` — all Hostfully tools (read every .ts file)
  - `src/worker-tools/kb/` — knowledge base search tool
  - `src/worker-tools/platform/` — platform issue reporting tool
  - `docs/2026-04-24-1452-current-system-state.md:226-262` — old "Shell Tools" section
  - `Dockerfile` — verify the COPY line for tools

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - Each `src/worker-tools/*/*.ts` file — THE source of truth for that tool's CLI interface, required env vars, and output format
  - Old doc — needed to identify new tools (post-guest-approval.ts, post-no-action-notification.ts)
  - Dockerfile — confirms tools are actually copied into the container

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tools documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Run `find src/worker-tools -name "*.ts" -type f | sort` to get actual tool list
      2. For each tool file, verify it appears in the notepad
      3. Assert no tools missing
    Expected Result: 1:1 mapping between actual .ts files and documented tools
    Failure Indicators: A .ts file exists but isn't documented, or notepad lists a tool that doesn't exist
    Evidence: .sisyphus/evidence/task-5-tool-list.txt

  Scenario: Tool count matches ground truth
    Tool: Bash
    Preconditions: Ground truth notepad and tools notepad both exist
    Steps:
      1. Read tool count from ground truth file
      2. Count tools in the tools notepad
      3. Assert they match
    Expected Result: Exact match
    Failure Indicators: Count mismatch
    Evidence: .sisyphus/evidence/task-5-count-match.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-5-tool-list.txt`
  - [ ] `.sisyphus/evidence/task-5-count-match.txt`

  **Commit**: NO

---

- [x] 6. Verify Inngest Functions & Feedback Pipeline

  **What to do**:
  - Read `src/gateway/inngest/serve.ts` — list ALL registered functions with their IDs
  - For each function, read its source file and document:
    - Function ID
    - Trigger (event name or cron expression)
    - Source file path
    - Purpose (1-sentence description)
    - Whether it's active or deprecated
  - Known new functions since April 24 (verify these exist):
    - `rule-extractor.ts` — learned rules extraction
    - `triggers/learned-rules-expiry.ts` — cron for expiring old rules
    - `triggers/unresponded-message-alert.ts` — cron for alerting on unresponded messages
    - `triggers/guest-message-poller.ts` — trigger for polling guest messages
  - Determine: is `interaction-handler.ts` the unified handler (PLAT-10 replacing both feedback-handler and mention-handler), or a third handler alongside them?
  - Read `src/inngest/feedback-handler.ts`, `src/inngest/feedback-responder.ts`, `src/inngest/mention-handler.ts` — are these still active or replaced?
  - Verify the feedback pipeline flow:
    - Thread reply → feedback handler → store → feedback responder (Haiku ack)
    - @mention → mention/interaction handler → classify → respond
    - Weekly cron → feedback summarizer → knowledge_bases
  - Update the Mermaid `sequenceDiagram` for the feedback pipeline
  - Cross-reference function count with ground truth from Task 1
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/06-inngest-feedback.md`
  - Include both the Inngest functions table AND the feedback pipeline diagram

  **Must NOT do**:
  - Do not cover lifecycle state transitions (Task 3's scope)
  - Do not cover gateway routes or Slack Bolt handlers (Task 7's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read many files (serve.ts + all function files), determine which are active vs deprecated, and understand the feedback pipeline flow. The interaction-handler.ts question requires careful investigation.
  - **Skills**: [`v-mermaid`]
    - `v-mermaid`: Needed for the feedback pipeline sequence diagram update
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-5, 7-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts` — THE source of truth for all registered Inngest functions
  - `src/inngest/employee-lifecycle.ts` — referenced for function ID only (detailed analysis in Task 3)
  - `src/inngest/feedback-handler.ts` — thread reply handler
  - `src/inngest/feedback-responder.ts` — Haiku acknowledgment generator
  - `src/inngest/mention-handler.ts` — @mention handler
  - `src/inngest/interaction-handler.ts` — possible unified handler (PLAT-10)
  - `src/inngest/rule-extractor.ts` — new: learned rules extraction
  - `src/inngest/triggers/` — all trigger files (summarizer, feedback-summarizer, learned-rules-expiry, unresponded-message-alert, guest-message-poller)
  - `docs/2026-04-24-1452-current-system-state.md:310-335` — old "Inngest Functions" section
  - `docs/2026-04-24-1452-current-system-state.md:265-306` — old "Feedback Pipeline" section

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `serve.ts` — definitive list of what's registered; old doc said 9, likely grew
  - Each function file — needed to extract function ID, trigger, and purpose
  - `interaction-handler.ts` — resolves the PLAT-10 question (unified vs separate handlers)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Function count matches ground truth
    Tool: Bash
    Preconditions: Both notepad and ground truth files exist
    Steps:
      1. Read Inngest function count from ground truth file
      2. Count functions in the notepad's table
      3. Assert they match
    Expected Result: Exact match between ground truth and documented functions
    Failure Indicators: Count mismatch
    Evidence: .sisyphus/evidence/task-6-function-count.txt

  Scenario: PLAT-10 status resolved
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Check if notepad explicitly states whether interaction-handler.ts replaced feedback-handler + mention-handler
      2. Verify the answer is grounded in code (e.g., "feedback-handler.ts still exists and is registered in serve.ts" or "feedback-handler.ts no longer registered")
    Expected Result: Clear, code-backed answer to whether PLAT-10 is complete
    Failure Indicators: Ambiguous answer, or answer not supported by serve.ts evidence
    Evidence: .sisyphus/evidence/task-6-plat10-status.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-6-function-count.txt`
  - [ ] `.sisyphus/evidence/task-6-plat10-status.txt`

  **Commit**: NO

- [x] 7. Verify Gateway Routes & Slack Bolt Handlers

  **What to do**:
  - Read `src/gateway/server.ts` — document startup sequence (what gets initialized, port, env validation)
  - Read ALL files in `src/gateway/routes/` — document every registered route:
    - HTTP method, path, auth requirement, description
    - Group into: Webhook Routes, Slack OAuth Routes, Admin Routes, Inngest
  - Read `src/gateway/slack/` — document all Slack Bolt handlers:
    - Event handlers (message, app_mention)
    - Action handlers (approve, reject, guest_reply_anyway, and any other new actions)
    - The "⏳ Processing..." ack pattern
    - Idempotency checks (task status verification before firing events)
  - Check for any NEW routes or handlers added since April 24
  - Read `src/gateway/middleware/` — document auth middleware
  - Read `src/gateway/validation/` — document Zod schemas, HMAC verification
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/07-gateway.md`
  - Include route tables matching the old doc's format

  **Must NOT do**:
  - Do not cover Inngest function internals (Task 6's scope)
  - Do not cover lifecycle logic (Task 3's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read many route files + Slack handler files + middleware to produce a comprehensive route table. May have new routes for guest messaging features.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-6, 8-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/server.ts` — main server file, registers all routes
  - `src/gateway/routes/` — all route handler files (read every file in this directory)
  - `src/gateway/slack/` — Slack Bolt event + action handlers
  - `src/gateway/middleware/` — auth middleware
  - `src/gateway/validation/` — Zod schemas
  - `docs/2026-04-24-1452-current-system-state.md:336-408` — old "Gateway and Routes" section

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `server.ts` — where all routes are registered; shows the full route tree
  - `src/gateway/routes/` — actual handler implementations; needed for accurate descriptions
  - `src/gateway/slack/` — needed to document new Slack actions (guest_reply_anyway, superseded)
  - Old doc — needed to identify new routes and handlers

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All routes documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep server.ts and route files for HTTP method registrations (app.get, app.post, router.get, etc.)
      2. Count unique route paths
      3. Count routes in the notepad
      4. Assert they match
    Expected Result: Every registered route appears in the notepad
    Failure Indicators: A route in code not documented, or a documented route that doesn't exist in code
    Evidence: .sisyphus/evidence/task-7-route-count.txt

  Scenario: New Slack actions documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep src/gateway/slack/ for `app.action(` to find all registered action handlers
      2. Verify each action appears in the notepad's Slack Bolt section
    Expected Result: All action handlers (approve, reject, guest_reply_anyway, any others) documented
    Failure Indicators: An action handler in code not mentioned in notepad
    Evidence: .sisyphus/evidence/task-7-slack-actions.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-7-route-count.txt`
  - [ ] `.sisyphus/evidence/task-7-slack-actions.txt`

  **Commit**: NO

---

- [x] 8. Verify Database Schema & Migrations

  **What to do**:
  - Read `prisma/schema.prisma` — document ALL models:
    - Group into the same categories as the old doc (MVP-Active, Config/Versioning, Multi-Tenancy, Forward-Compatibility) — but verify groupings are still accurate
    - For each model: list key columns and purpose
    - Flag any models that are NEW since April 24 (check against old doc's 21 models)
    - Flag any models with NEW columns added since April 24
  - Known new tables/columns (verify these exist):
    - `pending_approvals` table (GM-11 message superseding)
    - `learned_rules` table (GM-18/19)
    - `delivery_instructions` column on `archetypes`
    - `notification_channel` column on `archetypes`
    - Reminder fields on `pending_approvals`
  - List ALL migrations in `prisma/migrations/` — count and list the 5+ new ones since April 24
  - Document key constraints (unique indexes, foreign keys)
  - Cross-reference model count with ground truth from Task 1
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/08-schema.md`
  - Include a "Changes Since Last Doc" table

  **Must NOT do**:
  - Do not cover seed data (Task 11's scope for tenants/KB, Task 2's scope for archetypes)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: The Prisma schema file is large and must be read carefully to count models, identify new ones, and document column changes. Migration directory listing is straightforward but cross-referencing requires attention.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-7, 9-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` — THE source of truth for all DB models and columns
  - `prisma/migrations/` — list all migration directories
  - `docs/2026-04-24-1452-current-system-state.md:459-514` — old "Database Schema" section

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `prisma/schema.prisma` — the definitive schema; old doc said 21 models, 21 migrations — both have grown
  - `prisma/migrations/` — lists all applied migrations with timestamps
  - Old doc — needed to identify what changed (new models, new columns, new migrations)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Model count matches ground truth
    Tool: Bash
    Preconditions: Both notepad and ground truth files exist
    Steps:
      1. Read model count from ground truth file
      2. Count models listed in the notepad
      3. Assert they match
    Expected Result: Exact match
    Failure Indicators: Count mismatch
    Evidence: .sisyphus/evidence/task-8-model-count.txt

  Scenario: New migrations listed
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. List all migrations after `20260424020323` (last one in old doc)
      2. Verify each appears in the notepad's "Changes Since Last Doc" table
    Expected Result: All new migrations documented
    Failure Indicators: A migration exists but isn't listed
    Evidence: .sisyphus/evidence/task-8-new-migrations.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-8-model-count.txt`
  - [ ] `.sisyphus/evidence/task-8-new-migrations.txt`

  **Commit**: NO

---

- [x] 9. Verify Docker & Infrastructure

  **What to do**:
  - Read `Dockerfile` — document:
    - Build stages, base image, system packages installed
    - Global npm packages (opencode-ai version, tsx version)
    - GitHub CLI version
    - COPY commands for worker-tools
    - Default CMD
  - Read `docker/shared-infra.yml` — document all containers, images, host ports
  - Read `docker/supabase-services.yml` — document all containers, images, host ports
  - Read `scripts/ensure-infra.sh` — document the 3-state startup logic
  - Verify all port assignments match what the compose files actually define
  - Check for any NEW Docker services or changed ports since April 24
  - Document the deployment commands (docker build, fly:image, Fly.io CMD)
  - Read `src/workers/config/agents.md` — document the static AGENTS.md content
  - Document the configurable AGENTS.md 3-level fallback (cross-reference with Task 4 but from infrastructure perspective)
  - Document issue reporting infrastructure (`system_events` table, `report-issue.ts`, Slack alerting)
  - Document Telegram notifications (`src/lib/telegram-client.ts`, `scripts/telegram-notify.ts`)
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/09-infrastructure.md`
  - Include container tables matching old doc's format

  **Must NOT do**:
  - Do not cover harness execution flow (Task 4's scope)
  - Do not cover shell tool CLI details (Task 5's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read Dockerfile, two compose files, and infrastructure scripts. Requires careful port number verification and package version extraction.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-8, 10-11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `Dockerfile` — container build definition
  - `docker/shared-infra.yml` — shared PostgreSQL, Mailpit, Redis
  - `docker/supabase-services.yml` — per-project Kong, GoTrue, PostgREST
  - `scripts/ensure-infra.sh` — 3-state idempotent startup
  - `src/workers/config/agents.md` — static AGENTS.md content
  - `src/lib/telegram-client.ts` — Telegram notification implementation
  - `scripts/telegram-notify.ts` — CLI wrapper
  - `docs/2026-04-24-1452-current-system-state.md:527-612` — old "Docker and Deployment" + "Platform Infrastructure" sections

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `Dockerfile` — verifies exact package versions (opencode-ai version may have changed)
  - Compose files — verifies exact ports and container images
  - Old doc — identifies what changed (new containers, changed ports, new packages)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Port numbers match compose files
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep docker/shared-infra.yml for port mappings
      2. Grep docker/supabase-services.yml for port mappings
      3. Compare with ports listed in the notepad
    Expected Result: Every port in compose files matches the notepad exactly
    Failure Indicators: Port mismatch between compose file and notepad
    Evidence: .sisyphus/evidence/task-9-port-verification.txt

  Scenario: Dockerfile packages documented
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep Dockerfile for `npm install -g` to find global packages
      2. Grep Dockerfile for `apt-get install` to find system packages
      3. Verify all appear in the notepad
    Expected Result: All installed packages documented with versions
    Failure Indicators: A package in Dockerfile not mentioned in notepad
    Evidence: .sisyphus/evidence/task-9-packages.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-9-port-verification.txt`
  - [ ] `.sisyphus/evidence/task-9-packages.txt`

  **Commit**: NO

- [x] 10. Verify Libraries, Scripts & Project Structure

  **What to do**:
  - `ls src/lib/*.ts` — list ALL shared library files. For each:
    - Read the file to extract a 1-sentence purpose description
    - Note any new libraries not in the old doc (old doc listed 13)
  - `ls scripts/*.ts scripts/*.sh` — list ALL scripts. For each:
    - Cross-reference with `package.json` scripts to find the `pnpm` command (if any)
    - Document: script name, pnpm command, purpose
    - Note any new scripts not in the old doc (old doc listed 12)
  - Run `find tests -name "*.test.ts" -type f | wc -l` — get exact test file count (old doc said 118)
  - Run actual directory tree of `src/` — produce the project structure section matching old doc format:
    - `src/gateway/` with subdirectories and file counts
    - `src/inngest/` with subdirectories
    - `src/workers/` with key files
    - `src/worker-tools/` with subdirectories
    - `src/lib/` with file count
    - `prisma/` with model count and migration count
    - `scripts/` with file count
    - `docker/` with description
    - `docs/` with description
    - `tests/` with test file count
  - Read `package.json` to verify all `scripts` entries
  - Produce the "Quick Start" section with curl command examples (verify command syntax against actual routes from Task 7 notepad — but if Task 7 isn't done yet, use the route files directly)
  - Produce the "Reference Documents" section by listing `docs/*.md` files with 1-sentence descriptions
  - Cross-reference all counts with ground truth from Task 1
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/10-libs-scripts-structure.md`

  **Must NOT do**:
  - Do not re-document tool internals (Task 5's scope)
  - Do not re-document Inngest function details (Task 6's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read many files across src/lib/, scripts/, and package.json. Requires directory traversal and accurate counting. The project structure section needs careful tree formatting.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-9, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/lib/` — all shared library files (read each for purpose)
  - `scripts/` — all script files
  - `package.json` — scripts section for pnpm commands
  - `docs/2026-04-24-1452-current-system-state.md:615-742` — old "Shared Libraries", "Scripts", "Project Structure" sections

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `src/lib/*.ts` — source of truth for shared libraries; old doc listed 13, may have changed
  - `scripts/*.ts` — source of truth for scripts; old doc listed 12
  - `package.json` — maps scripts to pnpm commands
  - Old doc — identifies what's new vs unchanged

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Library count matches ground truth
    Tool: Bash
    Preconditions: Both files exist
    Steps:
      1. Read library count from ground truth
      2. Count libraries in notepad
      3. Assert match
    Expected Result: Exact match
    Failure Indicators: Count mismatch
    Evidence: .sisyphus/evidence/task-10-lib-count.txt

  Scenario: Project structure matches reality
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Run `ls -d src/*/` to get top-level src directories
      2. Verify each appears in the notepad's project structure
    Expected Result: Every src subdirectory is represented
    Failure Indicators: A directory exists but isn't in the structure
    Evidence: .sisyphus/evidence/task-10-structure.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-10-lib-count.txt`
  - [ ] `.sisyphus/evidence/task-10-structure.txt`

  **Commit**: NO

---

- [x] 11. Verify Tenant Config, KB, LLM Models & Phase 1 Progress

  **What to do**:
  - **Tenant Configuration**: Read `prisma/seed.ts` for tenant records:
    - Tenant IDs, names, slugs, Slack workspace IDs
    - Per-tenant archetype assignments
    - Per-tenant channel configurations (read from archetype instructions)
    - Department assignments
  - **Knowledge Base**: Read `prisma/seed.ts` for KB entries:
    - Count all `knowledgeBaseEntry` upserts (old doc said 2 entries — likely more now with GM-07/08 multi-property KB)
    - Document each entry: ID, scope (common/entity), entity, content summary
  - **Approved LLM Models**: Read `src/lib/call-llm.ts`:
    - Extract the allowed model list
    - Extract the forbidden model patterns
    - Verify the cost circuit breaker ($50/day)
    - Verify the verification/judge model
  - **Phase 1 Progress**: Read `docs/2026-04-21-2202-phase1-story-map.md`:
    - For each release (1.0, 1.1, 1.2, etc.), count stories with `- [x]` (done) vs `- [ ]` (not done)
    - Produce a progress table showing current status
    - Note: Review Writer stories were removed from story map (prior session work)
  - Write complete section content to `.sisyphus/notepads/system-state-snapshot/11-config-kb-progress.md`

  **Must NOT do**:
  - Do not re-document archetype details (Task 2's scope)
  - Do not re-document DB schema (Task 8's scope)
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read the large seed.ts file (3400+ lines) for tenant and KB data, read call-llm.ts for model enforcement, and read the story map for progress tracking. Multiple concerns but all are "configuration verification."
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — tenant upserts, KB entry upserts, department upserts
  - `src/lib/call-llm.ts` — model allowlist, forbidden patterns, cost circuit breaker
  - `docs/2026-04-21-2202-phase1-story-map.md` — story progress checkboxes
  - `docs/2026-04-24-1452-current-system-state.md:410-525` — old "Tenant Configuration", "Knowledge Base", "Approved LLM Models" sections

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - `seed.ts` — source of truth for seeded tenant config and KB entries; KB entries likely grew from 2 to many more
  - `call-llm.ts` — source of truth for approved models and enforcement logic
  - Story map — source of truth for Phase 1 progress; recently updated to remove Review Writer

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: KB entry count is accurate
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep seed.ts for knowledgeBaseEntry upsert calls
      2. Count them
      3. Compare with count in notepad
    Expected Result: Exact match between seed.ts upserts and documented entries
    Failure Indicators: Count mismatch
    Evidence: .sisyphus/evidence/task-11-kb-count.txt

  Scenario: LLM model list is accurate
    Tool: Bash
    Preconditions: Notepad file exists
    Steps:
      1. Grep call-llm.ts for model identifiers (minimax, claude-haiku, etc.)
      2. Compare with models listed in notepad
      3. Assert no models in code are missing from notepad and no extra models in notepad
    Expected Result: 1:1 match between code and documentation
    Failure Indicators: A model in code not documented, or a documented model not in code
    Evidence: .sisyphus/evidence/task-11-model-list.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-11-kb-count.txt`
  - [ ] `.sisyphus/evidence/task-11-model-list.txt`

  **Commit**: NO

---

- [x] 12. Assemble Full Document

  **What to do**:
  - Run `date "+%Y-%m-%d-%H%M"` to get the exact timestamp for the filename
  - Read ALL 11 notepad files from `.sisyphus/notepads/system-state-snapshot/`:
    - `00-ground-truth.md`, `02-employees.md`, `03-lifecycle.md`, `04-harness.md`, `05-tools.md`, `06-inngest-feedback.md`, `07-gateway.md`, `08-schema.md`, `09-infrastructure.md`, `10-libs-scripts-structure.md`, `11-config-kb-progress.md`
  - Read the old document for reference: `docs/2026-04-24-1452-current-system-state.md`
  - Assemble the complete document at `docs/2026-04-29-HHMM-current-system-state.md` with these sections IN ORDER:
    1. **Header** — Title, date stamp, summary of what changed since last snapshot
    2. **How It Works** — Architecture flowchart (Mermaid) + walkthrough table. Synthesize from employees (Task 2), lifecycle (Task 3), and harness (Task 4) notepads. Update the diagram if triggers, flows, or components changed.
    3. **Employees** — From Task 2 notepad
    4. **Universal Lifecycle States** — From Task 3 notepad (includes updated state diagram)
    5. **Workers: OpenCode Harness** — From Task 4 notepad (includes updated sequence diagram)
    6. **Shell Tools** — From Task 5 notepad
    7. **Feedback Pipeline** — From Task 6 notepad (includes updated sequence diagram)
    8. **Inngest Functions** — From Task 6 notepad
    9. **Gateway and Routes** — From Task 7 notepad
    10. **Tenant Configuration** — From Task 11 notepad
    11. **Knowledge Base** — From Task 11 notepad
    12. **Database Schema** — From Task 8 notepad
    13. **Approved LLM Models** — From Task 11 notepad
    14. **Docker and Deployment** — From Task 9 notepad
    15. **Platform Infrastructure Additions** — From Task 9 notepad
    16. **Shared Libraries** — From Task 10 notepad
    17. **Scripts** — From Task 10 notepad
    18. **Phase 1 Progress** — From Task 11 notepad
    19. **Quick Start** — From Task 10 notepad
    20. **Project Structure** — From Task 10 notepad
    21. **Reference Documents** — From Task 10 notepad
    22. **NEW SECTIONS** — Any subsections from notepads' "New Content" that warrant top-level sections (e.g., Learned Rules Pipeline, Message Superseding, Rejection Feedback, Reply Anyway). Place them logically near related sections.
  - Ensure all 4+ Mermaid diagrams are included and syntactically valid
  - Ensure no `[UNVERIFIED]` markers remain — if any exist, resolve by reading the source file directly or omit the claim with a note
  - Ensure document follows the exact formatting conventions of the old doc (heading levels, table formats, code block styles)
  - Do NOT use the Mermaid skill — the diagrams are already produced by Wave 1 agents. Just verify they're syntactically correct and include them.

  **Must NOT do**:
  - Do not invent facts not in the notepads — every claim must trace to a notepad
  - Do not update `AGENTS.md` (separate task, not in scope)
  - Do not update `README.md`
  - Do not modify any source files
  - Do not reference forbidden models in the document text

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must read 11 notepad files (potentially 3000+ lines total) and synthesize into a single coherent document. Requires careful cross-referencing and structural consistency. The "How It Works" diagram requires synthesizing information from 3 different notepads.
  - **Skills**: [`v-mermaid`]
    - `v-mermaid`: Needed to verify and potentially fix Mermaid diagram syntax during assembly
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — depends on all Wave 1 tasks)
  - **Blocks**: Tasks 13, 14
  - **Blocked By**: Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10, 11

  **References**:

  **Pattern References**:
  - `.sisyphus/notepads/system-state-snapshot/*.md` — all 11 notepad files (read ALL of them)
  - `docs/2026-04-24-1452-current-system-state.md` — old document for formatting reference and section structure

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - Notepad files — the verified source material for every section; each fact was checked against code by a Wave 1 agent
  - Old document — formatting template; the new doc should look structurally similar but with updated content

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Document exists with correct filename
    Tool: Bash
    Preconditions: Assembly task completed
    Steps:
      1. Run `ls docs/2026-04-29-*-current-system-state.md`
      2. Assert exactly one file matches
      3. Assert filename matches pattern `2026-04-29-[0-9]{4}-current-system-state.md`
    Expected Result: Exactly one file with correct date-stamped filename
    Failure Indicators: No file, multiple files, or wrong naming pattern
    Evidence: .sisyphus/evidence/task-12-file-exists.txt

  Scenario: No UNVERIFIED markers
    Tool: Bash
    Preconditions: Document exists
    Steps:
      1. Run `grep -c "\[UNVERIFIED\]" docs/2026-04-29-*-current-system-state.md`
      2. Assert count is 0
    Expected Result: Zero [UNVERIFIED] markers in the final document
    Failure Indicators: Any [UNVERIFIED] marker found
    Evidence: .sisyphus/evidence/task-12-no-unverified.txt

  Scenario: All Mermaid diagrams present
    Tool: Bash
    Preconditions: Document exists
    Steps:
      1. Run `grep -c '^\`\`\`mermaid' docs/2026-04-29-*-current-system-state.md`
      2. Assert count ≥ 4
    Expected Result: At least 4 Mermaid diagram blocks
    Failure Indicators: Fewer than 4 diagram blocks
    Evidence: .sisyphus/evidence/task-12-diagram-count.txt

  Scenario: No forbidden model references
    Tool: Bash
    Preconditions: Document exists
    Steps:
      1. Run `grep -ci "claude-sonnet\|claude-opus\|gpt-4o\|gpt-4o-mini" docs/2026-04-29-*-current-system-state.md`
      2. Assert count is 0 (the "Forbidden" line in the LLM Models section is acceptable — check that any matches are ONLY in the "Forbidden" context)
    Expected Result: No forbidden model references outside the explicit "Forbidden" list
    Failure Indicators: Forbidden model referenced as an active/used model
    Evidence: .sisyphus/evidence/task-12-no-forbidden-models.txt

  Scenario: Document is longer than old doc
    Tool: Bash
    Preconditions: Document exists
    Steps:
      1. Run `wc -l docs/2026-04-29-*-current-system-state.md`
      2. Assert line count ≥ 756 (old doc length)
    Expected Result: New doc is at least as long as old doc (should be longer given new content)
    Failure Indicators: Document shorter than 756 lines
    Evidence: .sisyphus/evidence/task-12-line-count.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-12-file-exists.txt`
  - [ ] `.sisyphus/evidence/task-12-no-unverified.txt`
  - [ ] `.sisyphus/evidence/task-12-diagram-count.txt`
  - [ ] `.sisyphus/evidence/task-12-no-forbidden-models.txt`
  - [ ] `.sisyphus/evidence/task-12-line-count.txt`

  **Commit**: NO (committed in final wave)

- [x] 13. Accuracy Audit

  **What to do**:
  - Read the assembled document at `docs/2026-04-29-*-current-system-state.md`
  - Perform a systematic accuracy check — for EACH section:
    - Pick 3-5 specific factual claims (file paths, counts, port numbers, function names, model IDs)
    - Verify each claim by reading the actual source file or running the relevant command
    - Record: claim, source file, verified (YES/NO), correction if NO
  - Specifically verify:
    - All file paths referenced in the document actually exist (`ls` each path)
    - All port numbers match Docker Compose files
    - All Inngest function IDs match serve.ts registrations
    - All shell tool CLI flags match actual source code argument parsing
    - All DB model names match prisma/schema.prisma
    - All archetype IDs match seed.ts
    - All channel IDs in tenant config match seed.ts
  - If any inaccuracy is found:
    - Fix it directly in the document
    - Log the correction in the evidence file
  - Write audit results to `.sisyphus/evidence/task-13-accuracy-audit.md`

  **Must NOT do**:
  - Do not rewrite sections for style — only fix factual errors
  - Do not add new content — only verify and correct existing claims
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must systematically cross-reference dozens of claims against source files. Requires reading both the document and the referenced source files.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 14)
  - **Blocks**: Task 15, F1-F4
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `docs/2026-04-29-*-current-system-state.md` — the document to audit
  - All source files referenced within the document (verify each exists)

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - The document itself is the subject of the audit
  - Source files are checked to verify claims

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Audit evidence file created
    Tool: Bash
    Preconditions: Audit completed
    Steps:
      1. Run `cat .sisyphus/evidence/task-13-accuracy-audit.md`
      2. Assert file contains per-section verification results
      3. Assert each result shows: claim, source, verified status
    Expected Result: Structured audit trail with YES/NO for each verified claim
    Failure Indicators: File missing or lacking structured verification results
    Evidence: .sisyphus/evidence/task-13-accuracy-audit.md

  Scenario: All corrections applied
    Tool: Bash
    Preconditions: Audit evidence exists
    Steps:
      1. Count "NO" entries in the audit file
      2. For each "NO", verify the document was corrected
    Expected Result: Zero uncorrected inaccuracies
    Failure Indicators: A "NO" in audit without a corresponding document correction
    Evidence: .sisyphus/evidence/task-13-corrections-applied.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-13-accuracy-audit.md`
  - [ ] `.sisyphus/evidence/task-13-corrections-applied.txt`

  **Commit**: NO

---

- [x] 14. Completeness Check

  **What to do**:
  - Read both the old document (`docs/2026-04-24-1452-current-system-state.md`) and the new document side by side
  - Verify EVERY section from the old doc has a corresponding section in the new doc
  - Verify the new doc includes content for all new features discovered in Wave 1 notepads
  - Check for orphaned references (mentions of things not explained elsewhere in the doc)
  - Verify all Mermaid diagrams are present (at least 4: architecture flow, lifecycle states, harness sequence, feedback pipeline)
  - Verify the "Changes Since Last Doc" table in the DB Schema section lists ALL new migrations
  - Verify no section is suspiciously short (< 3 lines when old doc had > 10 lines)
  - If any content is missing:
    - Add it by reading the relevant notepad or source file
    - Log the addition in the evidence file
  - Write completeness results to `.sisyphus/evidence/task-14-completeness.md`

  **Must NOT do**:
  - Do not change section ordering unless something is clearly misplaced
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must compare two large documents section by section and cross-reference with notepad files to identify missing content. Requires reading the old doc (756 lines) and new doc (800+ lines).
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 13)
  - **Blocks**: Task 15, F1-F4
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `docs/2026-04-24-1452-current-system-state.md` — the old document (baseline for section comparison)
  - `docs/2026-04-29-*-current-system-state.md` — the new document to check
  - `.sisyphus/notepads/system-state-snapshot/*.md` — all notepads (to verify new content was included)

  **API/Type References**:
  - None

  **Test References**:
  - None

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - Old doc — the baseline; every section from it must appear in the new doc
  - New doc — the subject of the completeness check
  - Notepads — contain new discoveries that should appear in the new doc

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All old doc sections present in new doc
    Tool: Bash
    Preconditions: Both documents exist
    Steps:
      1. Extract all `##` headings from old doc
      2. For each heading, verify it exists (or a close equivalent) in new doc
      3. Assert 100% coverage
    Expected Result: Every section from old doc has a counterpart in new doc
    Failure Indicators: A section heading from old doc missing in new doc
    Evidence: .sisyphus/evidence/task-14-section-coverage.txt

  Scenario: New content is included
    Tool: Bash
    Preconditions: Notepads and new doc exist
    Steps:
      1. Read "New Content" sections from each notepad
      2. Verify each new content item appears in the new doc
    Expected Result: All notepad-discovered new content is represented in the document
    Failure Indicators: New content in a notepad but not in the document
    Evidence: .sisyphus/evidence/task-14-new-content.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-14-completeness.md`
  - [ ] `.sisyphus/evidence/task-14-section-coverage.txt`
  - [ ] `.sisyphus/evidence/task-14-new-content.txt`

  **Commit**: NO

---

- [x] 15. Notify completion

  **What to do**:
  - Send Telegram notification that the system state snapshot is complete:
    ```bash
    tsx scripts/telegram-notify.ts "📋 System state snapshot complete — docs/2026-04-29-*-current-system-state.md written and verified. Come back to review results."
    ```

  **Must NOT do**:
  - Do not modify any files
  - Do not commit

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Post-Wave 3 (after Tasks 13, 14)
  - **Blocks**: None
  - **Blocked By**: Tasks 13, 14

  **References**:
  - `scripts/telegram-notify.ts` — CLI wrapper for Telegram notifications

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Notification sent
    Tool: Bash
    Preconditions: Script exists
    Steps:
      1. Run the tsx command
      2. Assert exit code 0
    Expected Result: Command succeeds with exit 0
    Failure Indicators: Non-zero exit code
    Evidence: .sisyphus/evidence/task-15-notification.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-15-notification.txt`

  **Commit**: YES
  - Message: `docs: add verified system state snapshot for April 29, 2026`
  - Files: `docs/2026-04-29-*-current-system-state.md`
  - Pre-commit: N/A (documentation only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify: document file exists at correct path, all 20+ sections present, all counts match actual codebase, all Mermaid diagrams present. For each "Must Have": verify it exists. For each "Must NOT Have": search for violations. Check evidence files in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Verify Markdown syntax is valid. Check for broken links, inconsistent formatting, orphaned references. Verify no `[UNVERIFIED]` markers remain. Check no forbidden model names appear. Verify all file paths referenced in the document actually exist in the codebase.
  Output: `Markdown [PASS/FAIL] | Links [N valid/N broken] | Markers [CLEAN/N remaining] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Read the document as a new developer would. Verify: "Quick Start" curl commands are syntactically correct, port numbers match Docker Compose files, project structure matches actual `ls` output, shell tool CLI examples match actual source code `--flags`. Test 5 random factual claims by checking source files.
  Output: `Quick Start [PASS/FAIL] | Ports [N/N correct] | Structure [PASS/FAIL] | Random Facts [N/N verified] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Compare the plan's "Must Have" list against the delivered document. Verify every section from the old doc is present. Verify new sections were added for new subsystems. Verify no content was invented (every fact traces to a notepad file which traces to a source file). Check the document doesn't include out-of-scope content (no code changes, no README updates).
  Output: `Sections [N/N present] | New Sections [N added] | Traceability [PASS/FAIL] | Scope [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

- **1**: `docs: add verified system state snapshot for April 29, 2026` — `docs/2026-04-29-HHMM-current-system-state.md`

---

## Success Criteria

### Verification Commands
```bash
# Document exists
ls docs/2026-04-29-*-current-system-state.md

# No UNVERIFIED markers
grep "\[UNVERIFIED\]" docs/2026-04-29-*-current-system-state.md | wc -l  # Expected: 0

# No forbidden models
grep -i "claude-sonnet\|claude-opus\|gpt-4o\|gpt-4o-mini" docs/2026-04-29-*-current-system-state.md | wc -l  # Expected: 0

# Shell tool count matches
ls src/worker-tools/**/*.ts | wc -l  # Must match count in doc

# DB model count matches
grep "^model " prisma/schema.prisma | wc -l  # Must match count in doc

# Mermaid diagram count
grep -c '```mermaid' docs/2026-04-29-*-current-system-state.md  # Expected: ≥4
````

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Document line count ≥ 756 (old doc size — new doc should be longer given new content)
- [ ] All verification notepads created in `.sisyphus/notepads/system-state-snapshot/`
