# AGENTS.md Lean Restructure

## TL;DR

> **Quick Summary**: Restructure the 965-line AGENTS.md monolith into a lean ~350-400 line hub with employee-specific and reference content extracted to dedicated docs. Every token in AGENTS.md costs tokens on every LLM call for every employee — at 7+ employees this is untenable.
>
> **Deliverables**:
>
> - Lean AGENTS.md (~350-400 lines, down from 965)
> - `docs/employees/guest-messaging.md` — Guest-Messaging employee operational details
> - `docs/employees/code-rotation.md` — Code-Rotation employee operational details
> - `docs/employees/daily-summarizer.md` — Summarizer employee operational details
> - `docs/guides/slack-tenant-integration.md` — Slack OAuth + per-tenant token architecture
> - Updated README.md with onboarding content migrated from AGENTS.md
> - Updated `prisma/seed.ts` to stay in sync
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Wave 2 extractions → Task 8 (core rewrite) → Task 9 (seed.ts) → Verification

---

## Context

### Original Request

User wants the leanest, most effective AGENTS.md possible — one that contains only the most important and useful details while saving agents working on the project as much time, effort, and tokens as possible.

### Interview Summary

**Key Discussions**:

- **Pain points**: All — token bloat, maintenance burden, organic growth without audit, scaling to 7+ employees
- **Employee growth**: 7+ employees in 3-6 months — per-employee inline sections become 700+ lines of noise
- **Per-employee details**: Move to `docs/employees/{slug}.md` — agents read on-demand
- **Diagnostics/troubleshooting**: Stay inline — agents need fast access when debugging
- **Onboarding material**: Move to README.md (already partially duplicated there)
- **OpenCode Worker**: Trim from ~100 to ~40 lines of operational essentials
- **Planning sections** (Telegram, E2E Validation): Stay in AGENTS.md
- **"Adding a New Employee" recipe**: Make prominent — step-by-step checklist
- **Staleness**: Probably exists but unaudited — extract verbatim, audit separately

**Research Findings**:

- `PLATFORM_AGENTS_MD` in `seed.ts` reads full AGENTS.md and injects into ALL 4 tenants and ALL 8 archetypes
- `agents-md-resolver.mts` concatenates platform + tenant + archetype layers at runtime
- README.md (213 lines) already duplicates: Project Structure, Env Vars, Admin API, Scripts, Infrastructure, Active Employees
- Reference Documents table exists — established pattern for on-demand doc loading

### Metis Review

**Identified Gaps** (addressed):

- **seed.ts sync**: Must update `seed.ts` in same commit — DB re-inflates on reset otherwise
- **Loading mechanism**: Employee docs added to Reference Documents table + clear AGENTS.md pointers. Per-archetype `agents_md` differentiation is a future improvement (out of scope)
- **Token measurement**: Must measure actual tokens (not just lines) before and after
- **Docker image rebuild**: Workers bake AGENTS.md at build time — rebuild step required
- **Cross-reference integrity**: Grep for section name references before removing sections
- **Documentation Freshness rule**: Must update to reference `docs/employees/` for employee-specific changes
- **Summarizer content is scattered**: Not a clean section — must be gathered from multiple sections
- **Line target adjusted**: ~350-400 (not 300-350) after Metis analysis showed 300 requires cutting guardrails

---

## Work Objectives

### Core Objective

Reduce AGENTS.md token cost by ~50-60% while preserving all guardrails that prevent agent mistakes, by extracting employee-specific and reference content to on-demand docs.

### Concrete Deliverables

- `AGENTS.md` — lean hub (~350-400 lines)
- `docs/employees/guest-messaging.md` — full Guest-Messaging operational details
- `docs/employees/code-rotation.md` — full Code-Rotation operational details
- `docs/employees/daily-summarizer.md` — full Summarizer operational details
- `docs/guides/2026-05-14-slack-tenant-integration.md` — Slack OAuth + token architecture
- `README.md` — updated with onboarding content (Env File Conventions, Docs Directory Structure)
- `prisma/seed.ts` — synced with new AGENTS.md

### Definition of Done

- [ ] Token count reduced by ≥40% from baseline
- [ ] All guardrail grep assertions pass (see Verification Strategy)
- [ ] `pnpm test -- --run` passes with same count as baseline
- [ ] `pnpm prisma db seed` completes without error
- [ ] Every extracted employee doc is listed in Reference Documents table
- [ ] No broken cross-references in AGENTS.md

### Must Have

- "Approved LLM Models" section preserved verbatim
- "Deprecated Components" table preserved verbatim
- "Key Conventions" rules preserved (multi-tenancy, shared-file-agnostic, etc.)
- "Long-Running Commands" tmux patterns preserved (agents need this at runtime)
- All diagnostic/troubleshooting tables preserved inline
- "Adding a New Employee" recipe prominent in AGENTS.md
- Every `CRITICAL` gotcha from employee sections preserved in the extracted docs
- `docs/employees/` added to Docs Directory Structure
- Documentation Freshness rule updated for new file locations

### Must NOT Have (Guardrails)

- Do NOT rewrite or fix stale content during extraction — extract verbatim, audit staleness separately
- Do NOT restructure existing README.md content — only append extracted sections
- Do NOT touch `src/workers/lib/agents-md-resolver.mts`
- Do NOT remove any section containing "CRITICAL" or "MANDATORY" without explicit justification
- Do NOT weaken or abbreviate the "Approved LLM Models" constraint
- Do NOT move `Long-Running Commands` out of AGENTS.md (agents need this at runtime, not developers)
- Do NOT move `Key Conventions` out of AGENTS.md (cross-cutting guardrails)
- Do NOT differentiate per-archetype `agents_md` field (future scope — out of this plan)
- Do NOT fix the pre-existing `inngest-serve.test.ts` failure

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None for this plan (documentation restructure — no new test files)
- **Framework**: vitest (existing tests only, run for regression check)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Documentation changes**: Use Bash — wc, grep, diff, token count commands
- **seed.ts changes**: Use Bash — `pnpm prisma db seed`, `pnpm test -- --run`
- **Cross-references**: Use Bash/Grep — search for broken section references

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — baseline + preparation):
├── Task 1: Measure baseline metrics [quick]
├── Task 2: Cross-reference audit [quick]
└── Task 3: Create docs/employees/ directory [quick]

Wave 2 (After Wave 1 — verbatim extraction, MAX PARALLEL):
├── Task 4: Extract Guest-Messaging → docs/employees/guest-messaging.md [unspecified-low]
├── Task 5: Extract Code-Rotation → docs/employees/code-rotation.md [unspecified-low]
├── Task 6: Gather & extract Summarizer → docs/employees/daily-summarizer.md [unspecified-low]
├── Task 7: Extract Slack OAuth + Tokens → docs/guides/ [unspecified-low]
└── Task 8: Append onboarding content to README.md [unspecified-low]

Wave 3 (After Wave 2 — core rewrite, SEQUENTIAL):
├── Task 9: Rewrite AGENTS.md as lean hub (depends: 2, 4-8) [deep]
└── Task 10: Update seed.ts + run validation (depends: 9) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

**Critical Path**: Task 1 → Task 4-8 (parallel) → Task 9 → Task 10 → F1-F4 → user okay
**Parallel Speedup**: ~60% faster than sequential
**Max Concurrent**: 5 (Wave 2)

### Dependency Matrix

| Task                      | Depends On | Blocks     |
| ------------------------- | ---------- | ---------- |
| 1 (Baseline)              | —          | 9          |
| 2 (Cross-ref audit)       | —          | 9          |
| 3 (Create dirs)           | —          | 4, 5, 6, 7 |
| 4 (Guest-msg extract)     | 3          | 9          |
| 5 (Code-rotation extract) | 3          | 9          |
| 6 (Summarizer extract)    | 3          | 9          |
| 7 (Slack extract)         | 3          | 9          |
| 8 (README append)         | —          | 9          |
| 9 (AGENTS.md rewrite)     | 1, 2, 4-8  | 10         |
| 10 (seed.ts sync)         | 9          | F1-F4      |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **5 tasks** — T4-T8 → `unspecified-low`
- **Wave 3**: **2 tasks** — T9 → `deep`, T10 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Measure baseline metrics

  **What to do**:
  - Count lines in current AGENTS.md: `wc -l AGENTS.md`
  - Measure token count: `npx tiktoken count < AGENTS.md` (install if needed: `npx tiktoken`)
  - Record both numbers as the baseline for success measurement
  - Save baseline to `.sisyphus/evidence/task-1-baseline-metrics.txt`

  **Must NOT do**:
  - Modify any files — this is measurement only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` — the file to measure (965 lines currently)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Baseline metrics captured
    Tool: Bash
    Preconditions: AGENTS.md exists at repo root
    Steps:
      1. Run `wc -l AGENTS.md` — record line count
      2. Run `npx tiktoken count < AGENTS.md` — record token count (if tiktoken unavailable, use `node -e "const fs=require('fs'); const text=fs.readFileSync('AGENTS.md','utf8'); console.log('Approx tokens:', Math.ceil(text.length/4))"` as rough estimate)
      3. Write both numbers to `.sisyphus/evidence/task-1-baseline-metrics.txt`
    Expected Result: File exists with two measurements (lines and tokens)
    Evidence: .sisyphus/evidence/task-1-baseline-metrics.txt
  ```

  **Commit**: NO

---

- [ ] 2. Cross-reference audit

  **What to do**:
  - Grep AGENTS.md for all section headers (lines starting with `##`)
  - For each section that will be REMOVED (see extraction list below), grep the rest of AGENTS.md for references to that section name
  - Record all cross-references that will break so Task 9 can fix them
  - Save audit results to `.sisyphus/evidence/task-2-cross-reference-audit.txt`

  **Sections being removed** (check for references to these):
  - "Guest-Messaging Employee"
  - "Code-Rotation Employee"
  - "Summarizer — Per-Tenant Channel Configuration"
  - "Slack OAuth — Per-Tenant Installation"
  - "Per-Tenant Slack Token Architecture"
  - "E2E Testing with Playwright Browser"
  - "Code-Rotation Testing"
  - "Hostfully Testing"
  - "Environment File Conventions"
  - "Docs Directory Structure"

  **Must NOT do**:
  - Modify any files — audit only

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` — the file to audit

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cross-references documented
    Tool: Bash (grep)
    Preconditions: AGENTS.md exists
    Steps:
      1. For each section name in the removal list, run: `grep -n "<section name>" AGENTS.md`
      2. Record all matches that are NOT the section header itself (i.e., references from other sections)
      3. Write results to `.sisyphus/evidence/task-2-cross-reference-audit.txt`
    Expected Result: File exists listing all cross-references (may be empty if none exist)
    Evidence: .sisyphus/evidence/task-2-cross-reference-audit.txt

  Scenario: No section names missed
    Tool: Bash (grep)
    Steps:
      1. Run `grep -c "^##" AGENTS.md` to count total sections
      2. Verify the removal list covers all sections being extracted
    Expected Result: All extractable sections accounted for
    Evidence: .sisyphus/evidence/task-2-cross-reference-audit.txt (appended)
  ```

  **Commit**: NO

---

- [ ] 3. Create docs/employees/ directory

  **What to do**:
  - Create `docs/employees/` directory
  - Verify `docs/guides/` already exists (it should)

  **Must NOT do**:
  - Create any content files yet — just the directory

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `docs/` — existing directory structure

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Directory exists
    Tool: Bash
    Steps:
      1. Run `ls -la docs/employees/`
    Expected Result: Directory exists and is empty
    Evidence: .sisyphus/evidence/task-3-directory-created.txt

  Scenario: Parent directory structure intact
    Tool: Bash
    Steps:
      1. Run `ls docs/` — verify existing subdirectories unchanged
    Expected Result: All existing dirs (architecture/, guides/, testing/, etc.) still present, plus new employees/
    Evidence: .sisyphus/evidence/task-3-directory-created.txt (appended)
  ```

  **Commit**: NO (directories committed with content in Wave 2)

---

- [ ] 4. Extract Guest-Messaging content → `docs/employees/guest-messaging.md`

  **What to do**:
  - Create `docs/employees/guest-messaging.md` by extracting content VERBATIM from AGENTS.md
  - Extract these sections:
    - "Guest-Messaging Employee (VLRE)" — full section (~80 lines)
    - "Hostfully Testing" — test resources table
    - "E2E Testing with Playwright Browser" — the Airbnb/Slack browser testing flow, ONLY the guest-messaging-specific parts (Airbnb guest side, Slack PM approval side, Verified E2E flow table, Key behaviors, Pipeline state checking)
    - "Hostfully Tenant Configuration" — the CRITICAL tenant secrets section
    - "External API Integration — Mandatory Practices" — these 6 rules (cross-cutting but most relevant to guest-messaging)
  - Add a document header: `# Guest-Messaging Employee (VLRE) — Operational Details`
  - Add a note at top: `> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.`
  - Do NOT rewrite, edit, or fix any content — copy VERBATIM

  **Must NOT do**:
  - Rewrite or modernize any content
  - Fix any stale/outdated information
  - Modify AGENTS.md itself (that's Task 9)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:
  - `AGENTS.md:Guest-Messaging Employee (VLRE)` section — primary content source
  - `AGENTS.md:Hostfully Testing` — test resources
  - `AGENTS.md:E2E Testing with Playwright Browser` — browser testing flow
  - `AGENTS.md:Hostfully Tenant Configuration` — tenant secrets
  - `AGENTS.md:External API Integration` — API practices

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All Guest-Messaging content extracted
    Tool: Bash (grep)
    Steps:
      1. Verify `docs/employees/guest-messaging.md` exists
      2. Grep for key phrases that MUST be present:
         - `grep -c "lead_uid" docs/employees/guest-messaging.md` → ≥ 1
         - `grep -c "LEAD_UID" docs/employees/guest-messaging.md` → ≥ 1
         - `grep -c "thread_uid" docs/employees/guest-messaging.md` → ≥ 1
         - `grep -c "lead UID ≠ thread UID" docs/employees/guest-messaging.md` → ≥ 1 (CRITICAL gotcha)
         - `grep -c "CLOSED leads" docs/employees/guest-messaging.md` → ≥ 1 (CRITICAL gotcha)
         - `grep -c "hostfully_api_key" docs/employees/guest-messaging.md` → ≥ 1
         - `grep -c "2f18249a" docs/employees/guest-messaging.md` → ≥ 1 (test thread UID)
      3. Verify document header exists
    Expected Result: All key phrases present, header present
    Evidence: .sisyphus/evidence/task-4-guest-messaging-extract.txt

  Scenario: No rewriting occurred — verbatim check
    Tool: Bash (diff)
    Steps:
      1. Pick 3 distinctive multi-line paragraphs from the original AGENTS.md guest-messaging section
      2. Grep for each exact phrase in `docs/employees/guest-messaging.md`
    Expected Result: All 3 phrases found verbatim
    Evidence: .sisyphus/evidence/task-4-guest-messaging-verbatim.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `docs(employees): extract per-employee operational details from AGENTS.md`
  - Files: `docs/employees/guest-messaging.md`

---

- [ ] 5. Extract Code-Rotation content → `docs/employees/code-rotation.md`

  **What to do**:
  - Create `docs/employees/code-rotation.md` by extracting content VERBATIM from AGENTS.md
  - Extract these sections:
    - "Code-Rotation Employee (VLRE)" — full section (~25 lines)
    - "Code-Rotation Testing" — test resources, trigger command, property/lock IDs
  - Add a document header: `# Code-Rotation Employee (VLRE) — Operational Details`
  - Add a note at top: `> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.`
  - Do NOT rewrite — copy VERBATIM

  **Must NOT do**:
  - Rewrite or modernize any content
  - Modify AGENTS.md itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:
  - `AGENTS.md:Code-Rotation Employee (VLRE)` section
  - `AGENTS.md:Code-Rotation Testing` section

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All Code-Rotation content extracted
    Tool: Bash (grep)
    Steps:
      1. Verify `docs/employees/code-rotation.md` exists
      2. Grep for key phrases:
         - `grep -c "24572672" docs/employees/code-rotation.md` → ≥ 1 (Sifely lock ID)
         - `grep -c "rotate-property-code" docs/employees/code-rotation.md` → ≥ 1
         - `grep -c "approval_required.*false" docs/employees/code-rotation.md` → ≥ 1
         - `grep -c "c960c8d2" docs/employees/code-rotation.md` → ≥ 1 (property UID)
    Expected Result: All key phrases present
    Evidence: .sisyphus/evidence/task-5-code-rotation-extract.txt
  ```

  **Commit**: YES (groups with Wave 2 commit)
  - Files: `docs/employees/code-rotation.md`

---

- [ ] 6. Gather & extract Summarizer content → `docs/employees/daily-summarizer.md`

  **What to do**:
  - Create `docs/employees/daily-summarizer.md` by GATHERING scattered Summarizer content from AGENTS.md
  - NOTE: Unlike Guest-Messaging and Code-Rotation, the Summarizer has NO dedicated section. Content is scattered across:
    - "Current Implementation" — Summarizer description, archetype slug, cron info
    - "Summarizer — Per-Tenant Channel Configuration" — full section with DozalDevs and VLRE channel configs
    - "Per-Tenant Slack Token Architecture" — the Summarizer failure diagnostic table
    - Brief mentions in "Tenants", "Cron timezone" notes
  - Gather all Summarizer-specific content into one cohesive doc
  - Add a document header: `# Daily Summarizer (Papi Chulo) — Operational Details`
  - Add a note at top: `> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.`
  - COPY all content verbatim — but reorganize into logical sections within the doc

  **Must NOT do**:
  - Rewrite content — only reorganize the order
  - Remove Summarizer mentions from cross-cutting sections (those stay in AGENTS.md for context)
  - Modify AGENTS.md itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:
  - `AGENTS.md:Current Implementation` — Summarizer description (look for "Papi Chulo")
  - `AGENTS.md:Summarizer — Per-Tenant Channel Configuration` — full section, both tenants
  - `AGENTS.md:Per-Tenant Slack Token Architecture` — failure diagnostic table
  - `AGENTS.md:Tenants` — tenant IDs table
  - `AGENTS.md` — search for "cron timezone", "daily-summarizer", "summarizer" to find all mentions

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All Summarizer content gathered
    Tool: Bash (grep)
    Steps:
      1. Verify `docs/employees/daily-summarizer.md` exists
      2. Grep for key phrases:
         - `grep -c "Papi Chulo" docs/employees/daily-summarizer.md` → ≥ 1
         - `grep -c "C092BJ04HUG" docs/employees/daily-summarizer.md` → ≥ 1 (DozalDevs channel)
         - `grep -c "C0AUBMXKVNU" docs/employees/daily-summarizer.md` → ≥ 1
         - `grep -c "C0960S2Q8RL" docs/employees/daily-summarizer.md` → ≥ 1 (VLRE channel)
         - `grep -c "cron-job.org" docs/employees/daily-summarizer.md` → ≥ 1
         - `grep -c "00000000-0000-0000-0000-000000000012" docs/employees/daily-summarizer.md` → ≥ 1 (DozalDevs archetype ID)
    Expected Result: All key phrases from all scattered sources present in one doc
    Evidence: .sisyphus/evidence/task-6-summarizer-extract.txt
  ```

  **Commit**: YES (groups with Wave 2 commit)
  - Files: `docs/employees/daily-summarizer.md`

---

- [ ] 7. Extract Slack OAuth + Token Architecture → `docs/guides/`

  **What to do**:
  - Get the current timestamp: `date "+%Y-%m-%d-%H%M"`
  - Create `docs/guides/{timestamp}-slack-tenant-integration.md` by extracting from AGENTS.md:
    - "Slack OAuth — Per-Tenant Installation" — full section
    - "Per-Tenant Slack Token Architecture" — full section (EXCEPT the Summarizer failure diagnostic table, which goes to Task 6)
    - The `loadTenantEnv()` explanation
    - Re-connecting a tenant's workspace steps
  - Add a document header: `# Slack Per-Tenant Integration Guide`
  - Add a note at top: `> This document is loaded on-demand when working on Slack OAuth or tenant token issues. For Slack message standards and Socket Mode, see AGENTS.md.`
  - COPY verbatim

  **Must NOT do**:
  - Rewrite content
  - Move Slack Socket Mode, Message Standards, or Message Hygiene sections (those stay in AGENTS.md — cross-cutting)
  - Modify AGENTS.md itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:
  - `AGENTS.md:Slack OAuth — Per-Tenant Installation` section
  - `AGENTS.md:Per-Tenant Slack Token Architecture` section
  - `AGENTS.md:loadTenantEnv()` — tenant env loader description

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Slack tenant integration content extracted
    Tool: Bash (grep)
    Steps:
      1. Verify `docs/guides/*-slack-tenant-integration.md` exists (glob match)
      2. Grep for key phrases:
         - `grep -c "TenantInstallationStore" docs/guides/*-slack-tenant-integration.md` → ≥ 1
         - `grep -c "tenant_integrations" docs/guides/*-slack-tenant-integration.md` → ≥ 1
         - `grep -c "loadTenantEnv" docs/guides/*-slack-tenant-integration.md` → ≥ 1
         - `grep -c "slack/install" docs/guides/*-slack-tenant-integration.md` → ≥ 1
    Expected Result: All key OAuth/token content present
    Evidence: .sisyphus/evidence/task-7-slack-extract.txt
  ```

  **Commit**: YES (groups with Wave 2 commit)
  - Files: `docs/guides/{timestamp}-slack-tenant-integration.md`

---

- [ ] 8. Append onboarding content to README.md

  **What to do**:
  - Read current README.md (213 lines) to understand existing structure
  - APPEND (not restructure) the following sections from AGENTS.md that are developer-focused:
    - "Environment File Conventions" — section order, rules (README already has Env Vars but not conventions)
    - "Docs Directory Structure" — the table of `docs/` subdirectories with descriptions
    - "Git Rules" — commit rules, branch naming (if not already in README)
    - "Git Cleanup on Plan Completion" — git status cleanup protocol
  - Place each section logically after related existing README content
  - Do NOT reorganize or rewrite existing README content

  **Must NOT do**:
  - Restructure existing README sections
  - Remove or modify any existing README content
  - Add employee-specific content (that goes to docs/employees/)
  - Modify AGENTS.md itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `README.md` — current content (213 lines), understand existing structure before appending
  - `AGENTS.md:Environment File Conventions` — section to extract
  - `AGENTS.md:Docs Directory Structure` — section to extract
  - `AGENTS.md:Git Rules` — section to extract
  - `AGENTS.md:Git Cleanup on Plan Completion` — section to extract

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: README content appended correctly
    Tool: Bash (grep)
    Steps:
      1. Verify README.md line count increased: `wc -l README.md` → should be > 213
      2. Grep for extracted content:
         - `grep -c "Environment File Conventions" README.md` → ≥ 1
         - `grep -c "Docs Directory Structure" README.md` → ≥ 1
         - `grep -c "no-verify" README.md` → ≥ 1 (git rule)
      3. Verify existing content preserved:
         - `grep -c "Quick Start" README.md` → ≥ 1
         - `grep -c "pnpm setup" README.md` → ≥ 1
    Expected Result: New sections present, existing content untouched
    Evidence: .sisyphus/evidence/task-8-readme-append.txt

  Scenario: No duplicate sections
    Tool: Bash (grep)
    Steps:
      1. Check for sections that might already exist in README:
         - `grep -c "## Project Structure" README.md` → exactly 1 (not duplicated)
         - `grep -c "## Environment Variables" README.md` → exactly 1 (not duplicated)
    Expected Result: No accidental duplication of existing sections
    Evidence: .sisyphus/evidence/task-8-readme-no-duplicates.txt
  ```

  **Commit**: YES
  - Message: `docs(readme): migrate onboarding content from AGENTS.md`
  - Files: `README.md`

---

- [ ] 9. Rewrite AGENTS.md as lean hub

  **What to do**:
  This is the central task. Rewrite AGENTS.md to be a lean ~350-400 line hub that:

  **A. REMOVE these sections entirely** (content now in extracted docs):
  - "Guest-Messaging Employee (VLRE)" → now in `docs/employees/guest-messaging.md`
  - "Code-Rotation Employee (VLRE)" → now in `docs/employees/code-rotation.md`
  - "Summarizer — Per-Tenant Channel Configuration" → now in `docs/employees/daily-summarizer.md`
  - "Slack OAuth — Per-Tenant Installation" → now in `docs/guides/*-slack-tenant-integration.md`
  - "Per-Tenant Slack Token Architecture" → now in `docs/guides/*-slack-tenant-integration.md`
  - "Hostfully Testing" → now in `docs/employees/guest-messaging.md`
  - "Code-Rotation Testing" → now in `docs/employees/code-rotation.md`
  - "E2E Testing with Playwright Browser" → now in `docs/employees/guest-messaging.md`
  - "Hostfully Tenant Configuration" → now in `docs/employees/guest-messaging.md`
  - "External API Integration — Mandatory Practices" → now in `docs/employees/guest-messaging.md`
  - "Environment File Conventions" → now in `README.md`
  - "Docs Directory Structure" → now in `README.md` (but ADD `docs/employees/` to whatever brief pointer remains)
  - "Git Rules" → now in `README.md`
  - "Git Cleanup on Plan Completion" → now in `README.md`

  **B. TRIM these sections** (keep essentials, cut verbose details):
  - "OpenCode Worker" — trim from ~100 to ~40 lines. KEEP: harness path, output contract, version pin, Docker rebuild rule, WORKER_RUNTIME flag, Inngest functions list, SIGTERM behavior, autoupdate flag, task-fetch-first gotcha. CUT: detailed env var injection explanation, feedback context injection details, long code examples.
  - "Current Implementation" — trim to employee list table + stack line. Cut detailed descriptions (those are now in per-employee docs).
  - "Feedback Pipeline" — trim to a concise flow diagram. Cut the detailed step-by-step (available in snapshot doc).
  - "Slack Interactive Buttons" — trim to: Socket Mode confirmed, never ask about Request URL, manual approval fallback. Cut debugging steps (move to diagnostics section or leave brief).

  **C. KEEP these sections as-is** (critical guardrails):
  - "Approved LLM Models" — verbatim
  - "Deprecated Components" — verbatim
  - "Platform Vision" — brief, keep
  - "Key Conventions" — all rules, verbatim
  - "Documentation Freshness" — UPDATE to reference `docs/employees/{slug}.md` for employee-specific changes
  - "Long-Running Commands" — verbatim (agents need this at runtime)
  - "Commands" table — keep
  - "Pre-existing Test Failures" — keep
  - "Database" — keep brief
  - "Infrastructure" — keep Docker Compose note
  - "Known Issues" — keep
  - "Prometheus Planning — Telegram Notifications" — keep
  - "Plan E2E Validation" — keep
  - "Tenants" — keep table

  **D. ADD new content**:
  - **"Adding a New Employee" recipe** — prominent step-by-step checklist. Currently buried in "OpenCode Worker" section. Make it a top-level section. Steps: 1) Seed archetype record, 2) Add shell tools if needed, 3) Create `docs/employees/{slug}.md`, 4) Add trigger route or cron config, 5) Update Reference Documents table in AGENTS.md. Keep it to ~15-20 lines.
  - **Brief employee pointers** in Current Implementation — for each active employee, add one line: "Operational details: `docs/employees/{slug}.md`"
  - **Updated Reference Documents table** — add all new docs:
    - `docs/employees/guest-messaging.md` — "Working on guest-messaging employee"
    - `docs/employees/code-rotation.md` — "Working on code-rotation employee"
    - `docs/employees/daily-summarizer.md` — "Working on summarizer employee"
    - `docs/guides/*-slack-tenant-integration.md` — "Slack OAuth or tenant token issues"
  - **`docs/employees/` entry** in any remaining Docs Directory reference

  **E. FIX cross-references** using the audit from Task 2:
  - Replace any references to removed sections with pointers to the new doc locations
  - Example: "See Guest-Messaging Employee section" → "See `docs/employees/guest-messaging.md`"

  **F. Verify final line count ≤ 400 lines**

  **Must NOT do**:
  - Remove any `CRITICAL` or `MANDATORY` tagged content without justification
  - Weaken the "Approved LLM Models" section
  - Move "Long-Running Commands" or "Key Conventions" out
  - Fix stale content — restructure only
  - Touch `src/workers/lib/agents-md-resolver.mts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Central restructure task requiring careful reading of entire AGENTS.md, understanding cross-references, and producing a coherent lean document while preserving all guardrails. Requires judgment about what to keep vs trim.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 2, 4, 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - `AGENTS.md` — the file being rewritten (read the entire file first)
  - `.sisyphus/evidence/task-2-cross-reference-audit.txt` — cross-references to fix
  - `.sisyphus/evidence/task-1-baseline-metrics.txt` — baseline to compare against

  **Files to reference for pointer accuracy**:
  - `docs/employees/guest-messaging.md` — verify it exists, use exact filename in pointers
  - `docs/employees/code-rotation.md` — verify it exists
  - `docs/employees/daily-summarizer.md` — verify it exists
  - `docs/guides/*-slack-tenant-integration.md` — use exact filename (with timestamp)
  - `README.md` — verify appended sections exist

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Line count target met
    Tool: Bash
    Steps:
      1. Run `wc -l AGENTS.md`
    Expected Result: ≤ 400 lines
    Evidence: .sisyphus/evidence/task-9-line-count.txt

  Scenario: All guardrails preserved
    Tool: Bash (grep)
    Steps:
      1. `grep -c "minimax/minimax-m2.7" AGENTS.md` → ≥ 1
      2. `grep -c "anthropic/claude-haiku-4-5" AGENTS.md` → ≥ 1
      3. `grep -c "Multi-tenancy is mandatory" AGENTS.md` → ≥ 1
      4. `grep -c "employee-agnostic" AGENTS.md` → ≥ 1
      5. `grep -c "no-verify" AGENTS.md` → ≥ 1
      6. `grep -c "tmux" AGENTS.md` → ≥ 1
      7. `grep -c "docs/employees" AGENTS.md` → ≥ 1
      8. `grep -c "Adding a New Employee" AGENTS.md` → ≥ 1
      9. `grep -c "Deprecated Components" AGENTS.md` → ≥ 1
    Expected Result: All counts ≥ 1
    Evidence: .sisyphus/evidence/task-9-guardrails.txt

  Scenario: No broken cross-references
    Tool: Bash (grep)
    Steps:
      1. Read `.sisyphus/evidence/task-2-cross-reference-audit.txt` for list of references
      2. For each originally-broken reference, verify AGENTS.md now points to the correct doc path
      3. Grep for orphaned section references: `grep -n "See.*section" AGENTS.md` — each should resolve
    Expected Result: Zero orphaned references
    Evidence: .sisyphus/evidence/task-9-cross-refs-fixed.txt

  Scenario: Removed sections are actually gone
    Tool: Bash (grep)
    Steps:
      1. `grep -c "## Guest-Messaging Employee" AGENTS.md` → 0
      2. `grep -c "## Code-Rotation Employee" AGENTS.md` → 0
      3. `grep -c "## Summarizer — Per-Tenant Channel" AGENTS.md` → 0
      4. `grep -c "## Slack OAuth" AGENTS.md` → 0
      5. `grep -c "## Per-Tenant Slack Token" AGENTS.md` → 0
      6. `grep -c "## Environment File Conventions" AGENTS.md` → 0
    Expected Result: All counts = 0
    Evidence: .sisyphus/evidence/task-9-sections-removed.txt

  Scenario: Employee docs referenced in Reference Documents table
    Tool: Bash (grep)
    Steps:
      1. `grep -c "docs/employees/guest-messaging.md" AGENTS.md` → ≥ 1
      2. `grep -c "docs/employees/code-rotation.md" AGENTS.md` → ≥ 1
      3. `grep -c "docs/employees/daily-summarizer.md" AGENTS.md` → ≥ 1
      4. `grep -c "slack-tenant-integration.md" AGENTS.md` → ≥ 1
    Expected Result: All new docs referenced
    Evidence: .sisyphus/evidence/task-9-references-table.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): restructure AGENTS.md as lean hub with on-demand references`
  - Files: `AGENTS.md`
  - Pre-commit: `wc -l AGENTS.md` (verify ≤ 400)

---

- [ ] 10. Update seed.ts + run validation

  **What to do**:
  - `prisma/seed.ts` reads `AGENTS.md` via `PLATFORM_AGENTS_MD` (line 23) and stores it in every tenant's `default_agents_md` and every archetype's `agents_md`
  - Since we changed AGENTS.md (Task 9), seed.ts will automatically pick up the new lean content on next seed
  - Verify this works: run `pnpm prisma db seed` and confirm no errors
  - Run `pnpm test -- --run` to confirm no test regressions
  - Record test results baseline comparison

  **Must NOT do**:
  - Modify seed.ts code (the file reference is already correct — it reads AGENTS.md)
  - Change the agents-md-resolver logic
  - Change archetype DB records manually

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 9)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 9

  **References**:
  - `prisma/seed.ts:23` — `const PLATFORM_AGENTS_MD = fs.readFileSync(...)` line that reads AGENTS.md
  - `AGENTS.md` — the file seed.ts reads (now lean)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed completes with new AGENTS.md
    Tool: Bash
    Steps:
      1. Run `pnpm prisma db seed`
    Expected Result: Completes without error, all records created
    Evidence: .sisyphus/evidence/task-10-seed-result.txt

  Scenario: Tests pass (no regression)
    Tool: Bash
    Steps:
      1. Run `pnpm test -- --run`
      2. Compare pass count to baseline (should be same or higher)
    Expected Result: Same number of passing tests as before restructure
    Failure Indicators: New test failures not in "Pre-existing Test Failures" list
    Evidence: .sisyphus/evidence/task-10-test-results.txt

  Scenario: Token count reduced
    Tool: Bash
    Steps:
      1. Run token count: same method as Task 1 baseline
      2. Compare to baseline from `.sisyphus/evidence/task-1-baseline-metrics.txt`
    Expected Result: ≥40% token reduction from baseline
    Evidence: .sisyphus/evidence/task-10-token-comparison.txt
  ```

  **Commit**: YES (groups with Task 9 commit if no seed.ts code changes needed)
  - Message: (same commit as Task 9 if no file changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (grep AGENTS.md for guardrail phrases, verify docs/employees/ files exist, check Reference Documents table). For each "Must NOT Have": search codebase for forbidden patterns. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + `pnpm prisma db seed`. Check all new markdown files for: broken links, orphaned references, inconsistent formatting, duplicate content between AGENTS.md and extracted docs. Verify no content was lost during extraction (compare line counts).
      Output: `Tests [PASS/FAIL] | Seed [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Verify token count reduction: run tokenizer on old vs new AGENTS.md. Verify every employee doc is reachable from AGENTS.md (grep for file path references). Read each extracted doc end-to-end — confirm all CRITICAL gotchas are preserved. Verify README additions don't break existing README structure.
      Output: `Token reduction [N%] | Employee docs [N/N reachable] | Gotchas [N/N preserved] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual changes. Verify 1:1 — everything in spec was done, nothing beyond spec was done. Check "Must NOT do" compliance (no rewrites during extraction, no README restructuring, no agents-md-resolver changes). Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Must NOT violations [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [ ] N. **Notify completion** — Send Telegram notification: plan `agents-md-lean-restructure` complete, all tasks done, come back to review results.

---

## Commit Strategy

| Wave | Commit | Message                                                                     | Files                                                                         |
| ---- | ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | —      | No commit (measurement only)                                                | —                                                                             |
| 2    | 1      | `docs(employees): extract per-employee operational details from AGENTS.md`  | `docs/employees/*.md`, `docs/guides/2026-05-14-*-slack-tenant-integration.md` |
| 2    | 2      | `docs(readme): migrate onboarding content from AGENTS.md`                   | `README.md`                                                                   |
| 3    | 3      | `docs(agents): restructure AGENTS.md as lean hub with on-demand references` | `AGENTS.md`, `prisma/seed.ts`                                                 |

---

## Success Criteria

### Verification Commands

```bash
# Token count (target: ≥40% reduction from baseline)
npx tiktoken count < AGENTS.md

# Line count (target: ≤400 lines)
wc -l AGENTS.md

# Guardrail preservation
grep -c "minimax/minimax-m2.7" AGENTS.md         # Expected: ≥ 1
grep -c "anthropic/claude-haiku-4-5" AGENTS.md    # Expected: ≥ 1
grep -c "Multi-tenancy is mandatory" AGENTS.md    # Expected: ≥ 1
grep -c "employee-agnostic" AGENTS.md             # Expected: ≥ 1
grep -c "no-verify" AGENTS.md                     # Expected: ≥ 1
grep -c "tmux" AGENTS.md                          # Expected: ≥ 1
grep -c "docs/employees" AGENTS.md                # Expected: ≥ 1

# Employee docs exist
ls docs/employees/guest-messaging.md docs/employees/code-rotation.md docs/employees/daily-summarizer.md

# Seed sync
pnpm prisma db seed                               # Expected: completes without error

# Tests pass
pnpm test -- --run                                 # Expected: same pass count as baseline
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Token reduction ≥40%
- [ ] Line count ≤400
- [ ] All tests pass
- [ ] All employee docs in Reference Documents table
