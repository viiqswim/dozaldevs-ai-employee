# AGENTS.md & README.md Freshness Audit + Documentation Rule

## TL;DR

> **Quick Summary**: Add a Documentation Freshness Rule to AGENTS.md, then fix all stale content in both AGENTS.md and README.md — outdated Inngest function lists, deleted feedback-handler references, missing worker-tool directories, wrong file counts, and stale snapshot references.
>
> **Deliverables**:
>
> - New "Documentation Freshness" rule in AGENTS.md Key Conventions
> - AGENTS.md updated: 13 stale items fixed
> - README.md updated: 7 stale items fixed
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (AGENTS.md fixes) → Task 3 (verification)

---

## Context

### Original Request

Add a new rule to AGENTS.md requiring AI agents to keep AGENTS.md and README.md up to date during code changes. As part of this, audit and fix everything currently stale in both files.

### Interview Summary

**Key Discussions**:

- Exact file counts (e.g., "12 files") should be REMOVED — they go stale every PR. Replace with descriptions only.
- Worker tools: document at directory + purpose level, not per-script CLI syntax.
- Rule scope: AGENTS.md and README.md only. docs/ snapshots are point-in-time records — excluded.

**Research Findings**:

- Feedback Pipeline section describes 3 deleted functions (feedback-handler, feedback-responder, mention-handler). The PLAT-10 unification is COMPLETE — `interaction-handler.ts` and `rule-extractor.ts` are the current reality.
- `employee/interaction.received` is the unified event (source: `thread_reply` | `mention`).
- `employee/rule.extract-requested` is the rule extraction event.
- `src/lib/` has 16 files (AGENTS.md says 12), gateway/routes/ has 13 (says 10), gateway/services/ has 11 (says 10).
- 3 worker-tool directories completely undocumented: `hostfully/`, `knowledge_base/`, `platform/`.
- Newer system state snapshot exists: `2026-04-29-2255` (current reference is `2026-04-24-1452`).
- `inngest-serve.test.ts` description is inaccurate — test hardcodes `function_count === 2` but 9 functions are registered.
- New Archetype fields in schema: `agents_md`, `delivery_instructions`, `notification_channel`.

### Metis Review

**Identified Gaps** (addressed):

- `rule-extractor` is completely absent from AGENTS.md — must be included in Inngest function list and Feedback/Interaction Pipeline rewrite
- README "Local Development (Docker)" section verified as correct (commands exist in package.json) — NOT stale, just a separate setup path
- `inngest-serve.test.ts` pre-existing failure description should be made accurate
- Newer snapshot (2026-04-29) confirmed more complete — safe to update reference

---

## Work Objectives

### Core Objective

Bring AGENTS.md and README.md fully up to date with the current codebase state, and add a rule ensuring agents maintain freshness going forward.

### Concrete Deliverables

- AGENTS.md with freshness rule added and all stale content fixed
- README.md with all stale content fixed

### Definition of Done

- [ ] `grep -c 'feedback-handler\|feedback-responder\|mention-handler' AGENTS.md` returns 0 (except in Deprecated Components table if present)
- [ ] `grep -c 'interaction-handler' AGENTS.md` returns ≥1
- [ ] `grep -c 'rule-extractor' AGENTS.md` returns ≥1
- [ ] `grep -c 'Documentation Freshness' AGENTS.md` returns ≥1
- [ ] `grep -c 'hostfully/' AGENTS.md` returns ≥1 (worker tools section)

### Must Have

- Documentation Freshness Rule with explicit triggers, scope, and examples
- All 13 AGENTS.md stale items fixed
- All 7 README.md stale items fixed

### Must NOT Have (Guardrails)

- Do NOT modify any file in `docs/snapshots/` — only update reference pointers
- Do NOT fix the `inngest-serve.test.ts` test file — only fix its description in AGENTS.md
- Do NOT modify deprecated component entries in the Deprecated Components table
- Do NOT add exact file/test counts — use descriptions instead
- Do NOT rewrite or remove the README "Registering Projects" section (it has its own deprecation note)
- Do NOT add per-script CLI usage for hostfully/knowledge_base/platform worker tools
- Do NOT add new H2 sections to AGENTS.md — fold new content into existing sections
- Do NOT add line numbers to documentation (they go stale immediately)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: N/A — documentation only
- **Automated tests**: None (markdown files)
- **Framework**: None

### QA Policy

Every task includes grep-based verification scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Documentation changes**: Use Bash (grep) — search for stale terms removed, new terms present

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent file edits):
├── Task 1: Fix AGENTS.md (all stale items + add freshness rule) [quick]
├── Task 2: Fix README.md (all stale items) [quick]

Wave FINAL (After Wave 1 — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | None       | F1-F4  |
| 2    | None       | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix AGENTS.md — all stale items + add Documentation Freshness Rule

  **What to do**:

  **A. Add Documentation Freshness Rule** — Add a new subsection under `## Key Conventions` titled `### Documentation Freshness (MANDATORY)`. Content:

  ```
  When making code changes that add, remove, or rename any of the following, you MUST update AGENTS.md and/or README.md in the same commit or PR:

  **Triggers requiring AGENTS.md update:**
  - New or removed Inngest function (update Inngest functions list)
  - New or removed worker-tool directory under src/worker-tools/ (update Shell tools section)
  - New or removed gateway route file (update route description)
  - New or removed gateway service (update services description)
  - New Prisma model or significant field additions (update relevant sections)
  - New or removed src/lib/ module (update lib description)
  - Changes to approved LLM models
  - Changes to employee archetypes or tenant configuration
  - Completion of a "planned change" noted with ⚠️ (remove the warning, document current state)

  **Triggers requiring README.md update:**
  - New or removed npm script in package.json (update Scripts table)
  - New or removed admin API endpoint (update route table)
  - New active employee type (update Active employees table)
  - Changes to Quick Start or setup flow
  - New documentation files (update Documentation table)

  **What to update (high-level only):**
  - Describe what things ARE and what they DO — not line numbers, not exact file counts, not implementation details
  - Use directory names and module purposes, not "N files" counts
  - Reference file paths only when they rarely change (e.g., entry points, config files)

  **What NOT to update:**
  - docs/ snapshot files — these are point-in-time records, not living documents
  - Deprecated component entries — leave as-is unless removing the component entirely
  - Line numbers or exact counts of anything — these go stale within days

  **Example — YES update:**
  "Added a new worker-tool directory `src/worker-tools/calendar/` with scripts for Google Calendar integration. Updated AGENTS.md Shell tools section to list it."

  **Example — NO update needed:**
  "Refactored internal helper function in `src/lib/retry.ts` from callback to async/await. No public API change."
  ```

  **B. Fix Inngest Functions list** — In the `## OpenCode Worker` section, find the bullet listing Inngest functions. Replace the current list with the accurate registered functions:
  - `employee/universal-lifecycle` — universal employee lifecycle (all employees)
  - `employee/interaction-handler` — unified thread reply + @mention handler (replaced feedback-handler, feedback-responder, mention-handler)
  - `employee/rule-extractor` — extracts behavioral rules from corrections/rejections, posts Slack confirmation cards
  - `trigger/daily-summarizer` — daily cron trigger for Papi Chulo
  - `trigger/feedback-summarizer` — weekly cron that digests recent feedback
  - `trigger/learned-rules-expiry` — cron maintenance for learned rules

  Remove any references to `employee/feedback-handler`, `employee/feedback-responder`, `employee/mention-handler` from the active function list. These no longer exist.

  **C. Rewrite Feedback Pipeline section** — Replace the entire `## Feedback Pipeline` section. The old content describes deleted functions (feedback-handler, feedback-responder, mention-handler) and a PLAT-10 "planned change" warning. Replace with current reality:
  - Thread replies and @mentions now go through a unified pipeline
  - Thread reply → Slack Bolt fires `employee/interaction.received` (source: `thread_reply`) → `interaction-handler` classifies intent → if correction/teaching → fires `employee/rule.extract-requested` → `rule-extractor` extracts rule, posts Slack confirmation card → user confirms/rejects → stored as `learned_rules`
  - @mention → Slack Bolt fires `employee/interaction.received` (source: `mention`) → `interaction-handler` classifies intent → responds in thread
  - Weekly cron (`trigger/feedback-summarizer`) still generates digests
  - Remove the PLAT-10 warning note entirely — the work is done
  - Also remove the PLAT-10 warning from any other location in AGENTS.md where it appears

  **D. Fix Worker Tools section** — In the `## OpenCode Worker` section, add the missing worker-tool directories. Currently only `slack/` and `locks/` are documented. Add:
  - `hostfully/` — Hostfully API integration scripts: message retrieval, message sending, property/reservation/review lookups, webhook registration, environment validation. Pre-installed at `/tools/hostfully/` in Docker.
  - `knowledge_base/` — Knowledge base search tool for querying tenant-scoped learned knowledge. Pre-installed at `/tools/knowledge_base/` in Docker.
  - `platform/` — Platform infrastructure tools: issue reporting for system events. Pre-installed at `/tools/platform/` in Docker.

  **E. Remove exact file counts** — Find and remove all exact file counts from descriptions. Specifically:
  - `src/lib/` — remove "(12 files)" or similar. Keep the module listing but don't count them. Also add the missing modules to the description: `classify-message`, `hostfully-precheck`, `slack-blocks`, `telegram-client`.
  - `gateway/routes/` — remove "(10 files)" reference. Note that routes now include KB and property-lock admin endpoints.
  - `gateway/services/` — remove "(10 files)" reference. Note that services now include `interaction-classifier`, `notification-channel`, `kb-repository`.
  - `tests/` — change "102 test files" to just describe the test directory structure without an exact count.
  - Any other exact file count references.

  **F. Update snapshot reference** — Replace `docs/snapshots/2026-04-24-1452-current-system-state.md` with `docs/snapshots/2026-04-29-2255-current-system-state.md` in the Reference Documents table. The 2026-04-29 snapshot includes PLAT-10 completion, guest messaging with full approval flow, learned rules pipeline, message superseding, reply-anyway flow, rejection feedback loop, and delivery phase (PLAT-05).

  **G. Fix inngest-serve.test.ts description** — In the "Pre-existing Test Failures" section, update the `inngest-serve.test.ts` description from "function count check expects an old count; stale test" to something more accurate like: "function count check hardcodes `2` but 9 functions are registered; stale assertion."

  **H. Update inngest/lib description** — The current AGENTS.md mentions only `create-task-and-dispatch, poll-completion` for `inngest/lib/`. Add the missing modules: `pending-approvals`, `quiet-hours`, `reminder-blocks`.

  **I. Note new Archetype fields** — In the section that describes the Archetype model or archetype configuration, mention the newer fields: `agents_md` (per-archetype AGENTS.md content injected into worker), `delivery_instructions` (instructions for the delivery phase), `notification_channel` (configurable notification channel per archetype).

  **Must NOT do**:
  - Do NOT modify any test files
  - Do NOT modify docs/ snapshot files
  - Do NOT modify deprecated component entries
  - Do NOT add exact file counts — use descriptions
  - Do NOT add line-number references

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file markdown edits, no code logic, just text replacement
  - **Skills**: []
    - No specialized skills needed for markdown editing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `AGENTS.md` — the file being edited. Read it fully before starting edits.
  - `src/gateway/inngest/serve.ts` — authoritative list of registered Inngest functions (9 functions total, 6 active + 3 deprecated)
  - `src/inngest/interaction-handler.ts` — event name is `employee/interaction.received`, source field is `thread_reply` | `mention`
  - `src/inngest/rule-extractor.ts` — event name is `employee/rule.extract-requested`, extracts behavioral rules from corrections

  **API/Type References**:
  - `prisma/schema.prisma` — Archetype model shows current fields including `agents_md`, `delivery_instructions`, `notification_channel`

  **External References**: None needed.

  **WHY Each Reference Matters**:
  - `serve.ts` is the single source of truth for which Inngest functions are actually registered and active
  - `interaction-handler.ts` and `rule-extractor.ts` define the event names and payload shapes needed to rewrite the Feedback Pipeline section accurately
  - `schema.prisma` shows the actual Archetype fields so the plan mentions real field names

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Deleted functions removed from AGENTS.md
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been edited
    Steps:
      1. Run: grep -n 'feedback-handler\|feedback-responder\|mention-handler' AGENTS.md
      2. Filter results: exclude any lines inside the "Deprecated Components" table (those are expected)
      3. Assert: zero matches outside the deprecated table
    Expected Result: No active references to deleted Inngest functions
    Failure Indicators: Any grep match outside the deprecated components section
    Evidence: .sisyphus/evidence/task-1-deleted-functions-gone.txt

  Scenario: New functions documented in AGENTS.md
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been edited
    Steps:
      1. Run: grep -c 'interaction-handler' AGENTS.md
      2. Assert: count ≥ 1
      3. Run: grep -c 'rule-extractor' AGENTS.md
      4. Assert: count ≥ 1
      5. Run: grep -c 'interaction.received' AGENTS.md
      6. Assert: count ≥ 1
    Expected Result: Both new functions and their event names are documented
    Failure Indicators: Any count returns 0
    Evidence: .sisyphus/evidence/task-1-new-functions-present.txt

  Scenario: Documentation Freshness Rule exists
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been edited
    Steps:
      1. Run: grep -c 'Documentation Freshness' AGENTS.md
      2. Assert: count ≥ 1
      3. Run: grep 'Triggers requiring AGENTS.md update' AGENTS.md
      4. Assert: match found
    Expected Result: Freshness rule section exists with trigger list
    Failure Indicators: Rule section missing or has no trigger list
    Evidence: .sisyphus/evidence/task-1-freshness-rule-exists.txt

  Scenario: Worker tools directories documented
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been edited
    Steps:
      1. Run: grep -c 'hostfully/' AGENTS.md
      2. Assert: count ≥ 1
      3. Run: grep -c 'knowledge_base/' AGENTS.md
      4. Assert: count ≥ 1
      5. Run: grep -c 'platform/' AGENTS.md
      6. Assert: count ≥ 1
    Expected Result: All 5 worker-tool directories documented
    Failure Indicators: Any directory missing
    Evidence: .sisyphus/evidence/task-1-worker-tools-documented.txt

  Scenario: PLAT-10 warning removed
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been edited
    Steps:
      1. Run: grep -c 'PLAT-10' AGENTS.md
      2. Assert: count = 0
    Expected Result: No PLAT-10 references remain
    Failure Indicators: Any PLAT-10 reference found
    Evidence: .sisyphus/evidence/task-1-plat10-removed.txt

  Scenario: No exact file counts in AGENTS.md
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been edited
    Steps:
      1. Run: grep -nE '\b(12|102) files\b' AGENTS.md
      2. Assert: zero matches
      3. Run: grep -nE '\b10 files\b' AGENTS.md
      4. Assert: zero matches
    Expected Result: No hardcoded file counts remain
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-1-no-exact-counts.txt

  Scenario: Snapshot reference updated
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been edited
    Steps:
      1. Run: grep -c '2026-04-29-2255' AGENTS.md
      2. Assert: count ≥ 1
    Expected Result: Newer snapshot referenced
    Failure Indicators: Old snapshot still referenced exclusively
    Evidence: .sisyphus/evidence/task-1-snapshot-updated.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-1-{scenario-slug}.txt
  - [ ] Terminal output for each grep command

  **Commit**: YES
  - Message: `docs: update AGENTS.md — fix stale content and add documentation freshness rule`
  - Files: `AGENTS.md`
  - Pre-commit: None (markdown file)

- [x] 2. Fix README.md — all stale items

  **What to do**:

  **A. Update Project Structure tree** — Add `worker-tools/` to the tree and expand descriptions:

  ```
  src/
  ├── gateway/      # Express server — webhook receiver (Hostfully, Jira) + Slack Bolt + Inngest host
  ├── inngest/      # Universal employee lifecycle, interaction handler, rule extractor, cron triggers
  ├── workers/      # Docker container code — AI agent execution (OpenCode harness)
  ├── worker-tools/ # Shell tools for employees (Slack, Hostfully, locks, KB search, platform)
  └── lib/          # Shared utilities: LLM client, Slack/Fly.io/GitHub clients, encryption, logging, retry
  prisma/           # Schema, migrations, seed
  scripts/          # TypeScript scripts (setup, trigger, verify, dev tools)
  docker/           # Docker Compose infrastructure (shared PostgreSQL, project-specific services)
  docs/             # Architecture, planning, snapshots, guides
  ```

  **B. Update inngest/ description** — Change `inngest/ # Universal employee lifecycle, feedback pipeline, cron triggers` to `inngest/ # Universal employee lifecycle, interaction handler, rule extractor, cron triggers`. The "feedback pipeline" term is stale — it's now the interaction handler.

  **C. Update lib/ description** — Change `lib/ # Shared: logger, fly-client, github-client, retry` to something more representative: `lib/ # Shared utilities: LLM client, Slack/Fly.io/GitHub clients, encryption, logging, retry`

  **D. Update Scripts table** — The current table is missing several scripts. Add these active scripts:
  - `setup-two-tenants.ts` / `pnpm setup:two-tenants` — Multi-tenant setup with DozalDevs + VLRE
  - `telegram-notify.ts` / `tsx scripts/telegram-notify.ts "msg"` — Send Telegram push notification

  Do NOT add every single script — only user-facing ones with npm script aliases. Internal scripts like `preflight-guest-messaging.ts` or `benchmark-classifier.ts` don't need README entries.

  **E. Update Documentation table** — Add missing docs:
  - [Adding a Shell Tool](docs/2026-05-04-1645-adding-a-shell-tool.md) — File structure, CLI pattern, Docker integration for new shell tools
  - [Local E2E Testing](docs/2026-05-04-2023-local-e2e-testing.md) — Testing without real external APIs, mock conventions
  - [System State (2026-04-29)](docs/snapshots/2026-04-29-2255-current-system-state.md) — Latest verified snapshot including interaction handler and guest messaging

  Update the existing System State reference from `2026-04-24-1452` to `2026-04-29-2255`.

  **F. Update test count** — Change `pnpm test # Run Vitest suite (515+ tests)` to remove the exact count: `pnpm test # Run Vitest suite`. The "515+" number goes stale with every test addition.

  **G. Update inngest-serve.test.ts failure description** — Change the README description to match the updated AGENTS.md description: function count hardcodes `2` but 9 functions are registered.

  **Must NOT do**:
  - Do NOT rewrite or remove the "Registering Projects" section
  - Do NOT rewrite the "Local Development (Docker)" section (it reflects a valid shared-infra setup)
  - Do NOT add exact file counts
  - Do NOT add per-script CLI syntax for worker tools

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file markdown edits, straightforward text replacement
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `README.md` — the file being edited. Read it fully before starting edits.
  - `package.json` — scripts section shows all npm script aliases (authoritative for Scripts table)
  - `docs/` directory listing — shows all available documentation files for the Documentation table

  **WHY Each Reference Matters**:
  - `README.md` must be read to find exact strings to replace
  - `package.json` scripts section is the single source of truth for which npm commands exist
  - `docs/` directory listing confirms which documentation files exist and their names

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: worker-tools/ in project structure
    Tool: Bash (grep)
    Preconditions: README.md has been edited
    Steps:
      1. Run: grep -c 'worker-tools' README.md
      2. Assert: count ≥ 1
    Expected Result: worker-tools/ appears in project structure tree
    Failure Indicators: Not found
    Evidence: .sisyphus/evidence/task-2-worker-tools-in-readme.txt

  Scenario: Stale descriptions updated
    Tool: Bash (grep)
    Preconditions: README.md has been edited
    Steps:
      1. Run: grep 'feedback pipeline' README.md
      2. Assert: zero matches (replaced with "interaction handler")
      3. Run: grep 'Shared: logger, fly-client' README.md
      4. Assert: zero matches (replaced with better description)
    Expected Result: Old descriptions replaced
    Failure Indicators: Any stale description still present
    Evidence: .sisyphus/evidence/task-2-descriptions-updated.txt

  Scenario: Documentation table updated
    Tool: Bash (grep)
    Preconditions: README.md has been edited
    Steps:
      1. Run: grep -c '2026-04-29-2255' README.md
      2. Assert: count ≥ 1
      3. Run: grep -c 'adding-a-shell-tool' README.md
      4. Assert: count ≥ 1
    Expected Result: Newer snapshot and new docs referenced
    Failure Indicators: Missing references
    Evidence: .sisyphus/evidence/task-2-docs-table-updated.txt

  Scenario: No exact test count in README.md
    Tool: Bash (grep)
    Preconditions: README.md has been edited
    Steps:
      1. Run: grep '515' README.md
      2. Assert: zero matches
    Expected Result: Exact test count removed
    Failure Indicators: "515" still present
    Evidence: .sisyphus/evidence/task-2-no-test-count.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-2-{scenario-slug}.txt
  - [ ] Terminal output for each grep command

  **Commit**: YES
  - Message: `docs: update README.md — fix stale project structure, scripts, and references`
  - Files: `README.md`
  - Pre-commit: None (markdown file)

- [x] 3. **Notify completion** — Send Telegram notification: plan `agents-readme-freshness` complete, all tasks done, come back to review results.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists in the updated files. For each "Must NOT Have": search both files for forbidden patterns — reject with evidence if found. Verify no exact file counts remain in AGENTS.md. Verify snapshot references are updated. Verify freshness rule exists.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` and `pnpm lint` to ensure no markdown or import issues were introduced. Read both files end-to-end looking for: broken markdown links, inconsistent formatting, orphaned references to deleted content, grammar issues.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Formatting [CLEAN/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Read AGENTS.md section by section. For every claim about the codebase (function names, file locations, event names), verify it matches reality by checking the actual file. Flag any remaining stale content.
      Output: `Claims verified [N/N] | Stale items remaining [N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify only AGENTS.md and README.md were modified. Verify no docs/ snapshot files were edited. Verify no deprecated sections were changed. Verify no test files were modified.
      Output: `Files modified [N — all in scope] | Out-of-scope changes [CLEAN/N] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                    | Files       |
| ---- | --------------------------------------------------------------------------------- | ----------- |
| 1    | `docs: update AGENTS.md — fix stale content and add documentation freshness rule` | `AGENTS.md` |
| 2    | `docs: update README.md — fix stale project structure, scripts, and references`   | `README.md` |

---

## Success Criteria

### Verification Commands

```bash
# AGENTS.md: deleted functions gone
grep -c 'feedback-handler\|feedback-responder\|mention-handler' AGENTS.md  # Expected: 0 (outside deprecated table)
# AGENTS.md: new functions present
grep -c 'interaction-handler' AGENTS.md  # Expected: ≥1
grep -c 'rule-extractor' AGENTS.md  # Expected: ≥1
# AGENTS.md: freshness rule present
grep -c 'Documentation Freshness' AGENTS.md  # Expected: ≥1
# AGENTS.md: worker tools present
grep -c 'hostfully/' AGENTS.md  # Expected: ≥1
grep -c 'knowledge_base/' AGENTS.md  # Expected: ≥1
# AGENTS.md: snapshot reference updated
grep -c '2026-04-29-2255' AGENTS.md  # Expected: ≥1
# AGENTS.md: PLAT-10 warning removed
grep -c 'PLAT-10' AGENTS.md  # Expected: 0
# README.md: worker-tools in structure
grep -c 'worker-tools' README.md  # Expected: ≥1
```

### Final Checklist

- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] Freshness rule is actionable with clear triggers and examples
- [x] No exact file counts remain in AGENTS.md
- [x] Both files build/lint clean
