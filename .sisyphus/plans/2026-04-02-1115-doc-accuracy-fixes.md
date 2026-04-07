# Documentation Accuracy Fixes

## TL;DR

> **Quick Summary**: Fix 9 verified inaccuracies across 4 documentation files, delete 1 stale doc, and create a new repo-level AGENTS.md — all validated by running 7 parallel codebase audits.
>
> **Deliverables**:
>
> - Fixed `docs/2026-04-01-1726-system-overview.md` (remove ghost file, add 7 missing files, fix Phase 4 table)
> - Fixed `docs/2026-04-01-1655-phase8-e2e.md` (correct auth.json format, fix 204 description)
> - Fixed `docs/2026-04-01-2110-troubleshooting.md` (correct database name in SQL)
> - Updated test count in system-overview.md, phase8-e2e.md, README.md (verified by running test suite)
> - Deleted stale `docs/2026-03-22-2317-readme.md`
> - Created `AGENTS.md` at repo root
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1 (run tests) → T7 (update counts) → F1–F4 (verification)

---

## Context

### Original Request

Verify 4 documentation files are 100% accurate against the codebase, check if agents.md exists (it doesn't), create it, and fix any other documentation issues found.

### Interview Summary

**Key Discussions**:

- User provided 4 target files: phase8-e2e.md, system-overview.md, troubleshooting.md, README.md
- Confirmed no AGENTS.md exists in the repo
- User chose "Repo-focused AGENTS.md" — standalone file with build/test commands, project structure, database setup, Docker conventions, known test failures, architectural patterns
- User granted broad latitude: "If you see anything else that needs to be fixed, go ahead and fix it"

**Research Findings (7 parallel explore agents)**:

- ~95% of all documentation claims are accurate
- 9 specific inaccuracies found with exact line numbers and code references
- All 34 documented source files verified to exist except `cost-gate.ts` (1 false positive)
- 7 real source files found that are undocumented
- All 16 Prisma models, all env vars, all scripts, all Docker config — verified correct
- Stale `docs/2026-03-22-2317-readme.md` — not linked from any current doc, safe to delete

### Metis Review

**Identified Gaps (addressed)**:

- `docs/2026-03-22-2317-ai-employee-architecture.md` also stale but referenced from `mvp-implementation-phases.md` → leave as-is (out of scope)
- AGENTS.md vs CLAUDE.md filename → AGENTS.md is correct (OpenCode convention, user explicitly requested this name)
- Phase 7 also references cost-gate → leave as-is (historical phase doc, not a target file)
- Test count must be verified by running `pnpm test` before any edit → included as prerequisite Task 1
- Commit atomicity defined → one commit per logical concern

---

## Work Objectives

### Core Objective

Make all 4 target documentation files 100% accurate against the current codebase, delete 1 stale doc, and create a repo-level AGENTS.md.

### Concrete Deliverables

- `docs/2026-04-01-1726-system-overview.md` — 3 fixes: ghost file removal, 7 missing files added to tree, Phase 4 table corrected
- `docs/2026-04-01-1655-phase8-e2e.md` — 2 fixes: auth.json format corrected, 204 description corrected
- `docs/2026-04-01-2110-troubleshooting.md` — 1 fix: SQL database name corrected
- `README.md` — 1 fix: test count updated to verified number
- `docs/2026-03-22-2317-readme.md` — deleted (stale, not linked)
- `AGENTS.md` — new file, repo-focused AI agent context

### Definition of Done

- [ ] `grep -c "cost-gate.ts" docs/2026-04-01-1726-system-overview.md` → 0
- [ ] `grep -c '"access_token"' docs/2026-04-01-1655-phase8-e2e.md` → 0
- [ ] `grep -c "\-d postgres" docs/2026-04-01-2110-troubleshooting.md` → 0
- [ ] `grep -r "2026-03-22-2317-readme" docs/ README.md` → 0 results
- [ ] `AGENTS.md` exists at repo root
- [ ] Test count in all 3 docs matches actual `pnpm test` output

### Must Have

- Every factual claim in the 4 target docs verified against code
- auth.json format matches actual `entrypoint.sh` output
- SQL commands use correct database name (`ai_employee`)
- Project structure tree matches actual `src/` layout
- AGENTS.md contains: build/test commands, database name, Docker conventions, known test failures

### Must NOT Have (Guardrails)

- **No code changes** — zero modifications to `src/`, `tests/`, `scripts/`, `prisma/`, `docker/`
- **No phase doc rewrites** — phase1–7 docs are historical records, do not update them
- **No new docs beyond AGENTS.md** — "broad latitude" does not mean "create docs for everything"
- **No test count guesses** — must run `pnpm test` and use actual output
- **No narrative restructuring** — surgical fixes only, minimum diff, preserve surrounding context
- **No AI-slop** — no emoji, no excessive comments, no over-documentation

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None (documentation-only changes don't need unit tests)
- **Framework**: vitest (used to verify test count)

### QA Policy

Every task includes agent-executed QA scenarios using grep assertions and file existence checks.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Documentation edits**: Use Bash (grep) — Search for removed/added patterns, assert counts
- **File operations**: Use Bash (ls) — Verify file exists or was deleted
- **Test count**: Use Bash (pnpm test) — Run full suite, capture exact count

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — MAX PARALLEL):
├── Task 1: Run pnpm test, capture exact passing count [quick]
├── Task 2: Fix system-overview.md — remove cost-gate.ts, add 7 missing files, fix Phase 4 table [quick]
├── Task 3: Fix phase8-e2e.md — correct auth.json format + 204 description [quick]
├── Task 4: Fix troubleshooting.md — correct SQL database name [quick]
├── Task 5: Delete stale docs/2026-03-22-2317-readme.md [quick]
├── Task 6: Create AGENTS.md at repo root [unspecified-low]

Wave 2 (After Task 1 completes — test count dependency):
└── Task 7: Update test count in system-overview.md, phase8-e2e.md, README.md (depends: T1) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 7 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| T1   | —          | T7     | 1    |
| T2   | —          | F1–F4  | 1    |
| T3   | —          | F1–F4  | 1    |
| T4   | —          | F1–F4  | 1    |
| T5   | —          | F1–F4  | 1    |
| T6   | —          | F1–F4  | 1    |
| T7   | T1         | F1–F4  | 2    |

### Agent Dispatch Summary

- **Wave 1**: **6** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`, T5 → `quick`, T6 → `unspecified-low`
- **Wave 2**: **1** — T7 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Run test suite and capture exact passing count

  **What to do**:
  - Run `pnpm test` with a 300-second timeout (suite takes 2-5 minutes)
  - Capture the final summary line showing total passing tests
  - Record the exact number (e.g., "515", "517", "520") to a temporary file `.sisyphus/evidence/task-1-test-count.txt`
  - Also record the 2 known failures: `container-boot.test.ts` and `inngest-serve.test.ts` — confirm they still fail
  - Note: Do NOT run `pnpm test` with `--run` flag unless the default hangs (vitest watch mode)

  **Must NOT do**:
  - Do not fix any failing tests
  - Do not modify test files
  - Do not modify vitest.config.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution with output capture
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Task 7 (test count update)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `package.json` scripts section — `"test": "vitest"` is the test command
  - `vitest.config.ts` — test configuration and paths

  **WHY Each Reference Matters**:
  - package.json confirms the exact test command
  - vitest.config.ts may indicate if `--run` flag is needed (vitest defaults to watch mode without it)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test suite runs and produces count
    Tool: Bash
    Preconditions: Project dependencies installed (node_modules exists)
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/test-output.txt
         (--run flag exits after running, avoids watch mode)
         Use timeout of 300 seconds
      2. Extract passing count: grep -oP '\d+ passed' /tmp/test-output.txt
      3. Write count number only to .sisyphus/evidence/task-1-test-count.txt
      4. Verify the file contains a number > 500
    Expected Result: File .sisyphus/evidence/task-1-test-count.txt contains a number like "515" or "517"
    Failure Indicators: Test suite hangs (watch mode), count < 500, no output file
    Evidence: .sisyphus/evidence/task-1-test-count.txt

  Scenario: Known failures still present
    Tool: Bash
    Preconditions: Test output captured in /tmp/test-output.txt
    Steps:
      1. grep "container-boot" /tmp/test-output.txt — should show failure or skip
      2. grep "inngest-serve" /tmp/test-output.txt — should show failure
    Expected Result: Both tests appear in failure/skip output
    Evidence: .sisyphus/evidence/task-1-known-failures.txt
  ```

  **Commit**: NO (no file changes to commit — evidence only)

- [x] 2. Fix system-overview.md — remove ghost file, add 7 missing files, fix Phase 4 table

  **What to do**:
  - **Fix 1: Remove `cost-gate.ts` from project tree** (line ~321). Replace `cost-gate.ts` line with the 4 actually-missing lib files. The current tree shows:
    ```
    │   ├── slack-client.ts         # Slack Web API wrapper
    │   ├── cost-gate.ts            # Per-dept daily cost threshold check
    │   └── agent-version.ts        # computeVersionHash() for model tracking
    ```
    Replace with (note: cost-gate logic is inline in `lifecycle.ts`):
    ```
    │   ├── slack-client.ts         # Slack Web API wrapper
    │   ├── jira-client.ts          # Jira REST API client
    │   ├── call-llm.ts             # Direct LLM API calls
    │   ├── errors.ts               # Shared error definitions
    │   ├── retry.ts                # Retry with backoff utility
    │   └── agent-version.ts        # computeVersionHash() for model tracking
    ```
  - **Fix 2: Add missing gateway files to tree**. The `inngest/` subsection (line ~303-304) currently shows only `send.ts`. Update to:
    ```
    │   ├── inngest/
    │   │   ├── client.ts           # Inngest client initialization
    │   │   ├── send.ts             # inngest.send() wrapper
    │   │   └── serve.ts            # Inngest serve handler
    ```
  - **Fix 3: Add `signature.ts` to validation subsection** (line ~308-309). Currently shows only `schemas.ts`. Update to:
    ```
    │   └── validation/
    │       ├── schemas.ts          # Zod schemas for webhook payloads
    │       └── signature.ts        # HMAC-SHA256 webhook signature verification
    ```
  - **Fix 4: Fix Phase 4 table row** (line ~68). Replace `src/lib/cost-gate.ts` with `src/inngest/lifecycle.ts` (cost-gate logic inline). The "What It Added" column description ("cost gate") is accurate — just the file reference is wrong.

  **Must NOT do**:
  - Do not change any narrative text, diagrams, or other sections
  - Do not update the "Known Limitations" section
  - Do not reorder existing files in the tree
  - Do not touch Phase descriptions beyond the file reference fix

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Surgical text replacements in a single markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: F1–F4 (verification)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/2026-04-01-1726-system-overview.md:295-339` — Current project structure tree to edit
  - `docs/2026-04-01-1726-system-overview.md:63-73` — Phase table with Phase 4 row to fix

  **API/Type References**:
  - `src/lib/` directory listing — Actual files: `logger.ts`, `fly-client.ts`, `github-client.ts`, `slack-client.ts`, `jira-client.ts`, `call-llm.ts`, `errors.ts`, `retry.ts`, `agent-version.ts` (9 files total, NO cost-gate.ts)
  - `src/gateway/inngest/` directory — Actual files: `client.ts`, `send.ts`, `serve.ts`
  - `src/gateway/validation/` directory — Actual files: `schemas.ts`, `signature.ts`

  **WHY Each Reference Matters**:
  - The project structure section is the authoritative source for developers navigating the codebase — it must match reality exactly
  - Phase 4 table is used to understand what each phase built — wrong file references send developers to nonexistent files

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: cost-gate.ts completely removed from system-overview
    Tool: Bash
    Preconditions: system-overview.md has been edited
    Steps:
      1. Run: grep -c "cost-gate.ts" docs/2026-04-01-1726-system-overview.md
      2. Assert count is exactly 0
    Expected Result: 0 (no references remain)
    Failure Indicators: Count > 0
    Evidence: .sisyphus/evidence/task-2-cost-gate-removed.txt

  Scenario: All 7 missing files now present in tree
    Tool: Bash
    Preconditions: system-overview.md has been edited
    Steps:
      1. grep -c "client.ts" docs/2026-04-01-1726-system-overview.md → expect >= 1
      2. grep -c "serve.ts" docs/2026-04-01-1726-system-overview.md → expect >= 1
      3. grep -c "signature.ts" docs/2026-04-01-1726-system-overview.md → expect >= 1
      4. grep -c "call-llm.ts" docs/2026-04-01-1726-system-overview.md → expect >= 1
      5. grep -c "errors.ts" docs/2026-04-01-1726-system-overview.md → expect >= 1
      6. grep -c "jira-client.ts" docs/2026-04-01-1726-system-overview.md → expect >= 1
      7. grep -c "retry.ts" docs/2026-04-01-1726-system-overview.md → expect >= 1
    Expected Result: All 7 counts >= 1
    Evidence: .sisyphus/evidence/task-2-missing-files-added.txt

  Scenario: Phase 4 table no longer references cost-gate.ts
    Tool: Bash
    Preconditions: system-overview.md has been edited
    Steps:
      1. grep "Phase.*4.*cost" docs/2026-04-01-1726-system-overview.md
      2. Verify the Phase 4 row still mentions "cost gate" in description but file reference is lifecycle.ts, not cost-gate.ts
    Expected Result: Phase 4 row references lifecycle.ts
    Evidence: .sisyphus/evidence/task-2-phase4-fixed.txt
  ```

  **Commit**: YES
  - Message: `fix(docs): correct system-overview project tree and phase table`
  - Files: `docs/2026-04-01-1726-system-overview.md`
  - Pre-commit: `grep -c "cost-gate.ts" docs/2026-04-01-1726-system-overview.md` → 0

- [x] 3. Fix phase8-e2e.md — correct auth.json format and 204 description

  **What to do**:
  - **Fix 1: Correct auth.json format** (lines 157–162). The OpenCode Provider Configuration section shows:
    ```json
    {
      "openrouter": {
        "access_token": "<OPENROUTER_API_KEY>"
      }
    }
    ```
    Replace with the actual format written by `entrypoint.sh` (line 209):
    ```json
    {
      "openrouter": {
        "type": "api",
        "key": "<OPENROUTER_API_KEY>"
      }
    }
    ```
  - **Fix 2: Correct the 204 description** (line ~135). The current text says:
    > "PostgREST returns an empty body (204) on successful PATCH. The completion module was treating this as an error. Fix: detect 204 and treat it as success."
    > Replace with:
    > "PostgREST returns an empty body on successful PATCH. The completion module was treating null or empty-array responses as errors. Fix: detect null/empty responses and treat them as success."
    > This accurately describes what the code actually does (checks `result === null || (Array.isArray(result) && result.length === 0)` at `completion.ts` line 53).

  **Must NOT do**:
  - Do not restructure the document narrative
  - Do not change diagrams, tables, or other sections
  - Do not update verification results or task IDs
  - Do not change the Phase 9 section

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two surgical text replacements in a single markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: F1–F4 (verification)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/2026-04-01-1655-phase8-e2e.md:148-168` — OpenCode Provider Configuration section with wrong auth.json
  - `docs/2026-04-01-1655-phase8-e2e.md:133-136` — Infrastructure fix #5 with wrong 204 claim

  **API/Type References**:
  - `src/workers/entrypoint.sh:209` — Actual auth.json format: `{"openrouter":{"type":"api","key":"..."}}`
  - `src/workers/lib/completion.ts:53` — Actual check: `result === null || (Array.isArray(result) && result.length === 0)`

  **WHY Each Reference Matters**:
  - entrypoint.sh is the authoritative source for what auth.json looks like — the doc must match exactly
  - completion.ts shows the actual fix, not the doc's description of it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: access_token format removed from phase8-e2e
    Tool: Bash
    Preconditions: phase8-e2e.md has been edited
    Steps:
      1. Run: grep -c '"access_token"' docs/2026-04-01-1655-phase8-e2e.md
      2. Assert count is exactly 0
    Expected Result: 0
    Failure Indicators: Count > 0
    Evidence: .sisyphus/evidence/task-3-access-token-removed.txt

  Scenario: Correct auth.json format now present
    Tool: Bash
    Preconditions: phase8-e2e.md has been edited
    Steps:
      1. Run: grep -c '"type": "api"' docs/2026-04-01-1655-phase8-e2e.md
      2. Assert count >= 1
    Expected Result: >= 1
    Evidence: .sisyphus/evidence/task-3-correct-format.txt

  Scenario: 204 description corrected
    Tool: Bash
    Preconditions: phase8-e2e.md has been edited
    Steps:
      1. Run: grep -c "detect 204" docs/2026-04-01-1655-phase8-e2e.md
      2. Assert count is 0 (old wording removed)
      3. Run: grep -c "null.*empty" docs/2026-04-01-1655-phase8-e2e.md
      4. Assert count >= 1 (new wording present)
    Expected Result: Old wording gone, new wording present
    Evidence: .sisyphus/evidence/task-3-204-description-fixed.txt
  ```

  **Commit**: YES
  - Message: `fix(docs): correct auth.json format and 204 description in phase8-e2e`
  - Files: `docs/2026-04-01-1655-phase8-e2e.md`
  - Pre-commit: `grep -c '"access_token"' docs/2026-04-01-1655-phase8-e2e.md` → 0

- [x] 4. Fix troubleshooting.md — correct SQL database name

  **What to do**:
  - **Fix 1: Change `-d postgres` to `-d ai_employee`** in item #6 (lines 76–79). The SQL cleanup command currently reads:
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
      -c "DELETE FROM agent_versions WHERE id != '00000000-0000-0000-0000-000000000002';"
    ```
    Change to:
    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "DELETE FROM agent_versions WHERE id != '00000000-0000-0000-0000-000000000002';"
    ```
    The project uses `ai_employee` as the database name (set via `POSTGRES_DB=ai_employee` in `docker/.env`). The `postgres` database is not used by this project.

  **Must NOT do**:
  - Do not change any other troubleshooting items
  - Do not restructure the document
  - Do not add new troubleshooting items

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line change in a markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: F1–F4 (verification)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/2026-04-01-2110-troubleshooting.md:76-79` — The SQL command with wrong database name

  **API/Type References**:
  - `docker/.env:58` — `POSTGRES_DB=ai_employee` (authoritative database name)
  - `docker/.env.example:66` — Same value with documentation comment

  **WHY Each Reference Matters**:
  - docker/.env is the authoritative source for the database name — docs must match
  - Running the wrong database name would silently do nothing (no tables in `postgres` db)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: -d postgres removed from troubleshooting
    Tool: Bash
    Preconditions: troubleshooting.md has been edited
    Steps:
      1. Run: grep -c "\-d postgres" docs/2026-04-01-2110-troubleshooting.md
      2. Assert count is exactly 0
    Expected Result: 0
    Failure Indicators: Count > 0
    Evidence: .sisyphus/evidence/task-4-db-name-fixed.txt

  Scenario: -d ai_employee now present
    Tool: Bash
    Preconditions: troubleshooting.md has been edited
    Steps:
      1. Run: grep -c "\-d ai_employee" docs/2026-04-01-2110-troubleshooting.md
      2. Assert count >= 1
    Expected Result: >= 1
    Evidence: .sisyphus/evidence/task-4-correct-db.txt
  ```

  **Commit**: YES
  - Message: `fix(docs): use ai_employee database in troubleshooting SQL`
  - Files: `docs/2026-04-01-2110-troubleshooting.md`
  - Pre-commit: `grep -c "\-d postgres" docs/2026-04-01-2110-troubleshooting.md` → 0

- [x] 5. Delete stale docs/2026-03-22-2317-readme.md

  **What to do**:
  - **Step 1: Verify no links exist** — Run `grep -r "2026-03-22-2317-readme" docs/ README.md` and confirm 0 results (already verified in planning — no links exist)
  - **Step 2: Delete the file** — `rm docs/2026-03-22-2317-readme.md`
  - **Step 3: Stage the deletion for git** — `git add docs/2026-03-22-2317-readme.md`

  This file (dated March 22) is an old documentation index that has been fully superseded by:
  - Root `README.md` (comprehensive project README)
  - `docs/2026-04-01-1726-system-overview.md` (authoritative system reference)

  **Must NOT do**:
  - Do not delete `docs/2026-03-22-2317-ai-employee-architecture.md` — it is referenced from `docs/2026-03-25-1901-mvp-implementation-phases.md` and is out of scope
  - Do not delete any other docs
  - Do not modify any remaining docs to account for this deletion (no links to update — verified)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file deletion with pre-check
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: F1–F4 (verification)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/2026-03-22-2317-readme.md` — The file to delete (41-line old index document)
  - `README.md` — Current comprehensive readme that supersedes it
  - `docs/2026-04-01-1726-system-overview.md` — Current system reference that supersedes it

  **WHY Each Reference Matters**:
  - The stale readme could confuse new developers who find it and think it's current
  - Verifying no links exist prevents broken references in remaining docs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stale readme deleted
    Tool: Bash
    Preconditions: File deletion command has been run
    Steps:
      1. Run: ls docs/2026-03-22-2317-readme.md 2>/dev/null && echo "EXISTS" || echo "DELETED"
      2. Assert output is "DELETED"
    Expected Result: DELETED
    Failure Indicators: Output is "EXISTS"
    Evidence: .sisyphus/evidence/task-5-stale-deleted.txt

  Scenario: No broken links from deletion
    Tool: Bash
    Preconditions: File has been deleted
    Steps:
      1. Run: grep -r "2026-03-22-2317-readme" docs/ README.md
      2. Assert 0 results
    Expected Result: 0 matches
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-5-no-broken-links.txt
  ```

  **Commit**: YES
  - Message: `chore(docs): delete stale 2026-03-22-2317-readme.md`
  - Files: deleted `docs/2026-03-22-2317-readme.md`
  - Pre-commit: `grep -r "2026-03-22-2317-readme" docs/ README.md` → 0 results

- [x] 6. Create AGENTS.md at repo root

  **What to do**:
  Create a new `AGENTS.md` file at the repository root. This file provides context to AI coding agents (OpenCode, Claude Code, etc.) working on this codebase. It should be self-contained, repo-focused, and under ~150 lines.

  **Content structure** (all sections mandatory):

  ```markdown
  # AI Employee Platform — Agent Guide

  ## Project Overview

  - One-line description: Automated Jira-to-PR pipeline via AI coding agent
  - Stack: TypeScript, Fastify, Inngest, Prisma, Docker, Supabase (PostgREST)

  ## Quick Reference

  - Setup: pnpm setup (idempotent, safe to re-run)
  - Start services: pnpm dev:start
  - Run tests: pnpm test (vitest, [ACTUAL_COUNT from Task 1] passing)
  - Lint: pnpm lint (eslint)
  - Build: pnpm build (tsc)
  - Trigger E2E: pnpm trigger-task
  - Verify E2E: pnpm verify:e2e --task-id <uuid>

  ## Database

  - Database name: ai_employee (NOT postgres)
  - Connection: postgresql://postgres:postgres@localhost:54322/ai_employee
  - ORM: Prisma (prisma/schema.prisma — 16 tables)
  - PostgREST: Supabase REST API on localhost:54321

  ## Infrastructure

  - Docker Compose (docker/docker-compose.yml) instead of supabase start
  - Reason: supabase CLI hardcodes database name to "postgres" — incompatible with ai_employee
  - Worker image: docker build -t ai-employee-worker .
  - POSTGRES_DB=ai_employee in docker/.env

  ## Project Structure

  [Condensed version of the project structure from system-overview.md]

  - src/gateway/ — Fastify HTTP server, Jira/GitHub webhooks
  - src/inngest/ — Lifecycle, watchdog, redispatch functions
  - src/workers/ — Docker container code: entrypoint.sh, orchestrate.mts, validation pipeline
  - src/lib/ — Shared utilities: logger, fly-client, github-client, etc.
  - prisma/ — Schema, migrations, seed
  - scripts/ — TypeScript scripts for setup, dev, trigger, verify
  - docker/ — Supabase Docker Compose

  ## Key Conventions

  - All scripts are TypeScript (tsx) in scripts/
  - Inngest functions register in gateway process
  - Worker containers communicate via PostgREST (Supabase REST API)
  - Task status flow: NULL → Ready → Executing → Submitting → Done
  - Branch naming: ai/{ticketId}-{slug}

  ## Known Test Failures (not regressions)

  - container-boot.test.ts — requires Docker socket, fails without it
  - inngest-serve.test.ts — function count mismatch with test expectation

  ## Environment Variables

  Minimum for local E2E:

  - OPENROUTER_API_KEY — AI code generation
  - GITHUB_TOKEN — PR creation
  - JIRA_WEBHOOK_SECRET — webhook validation (use "test-secret" locally)
    Copy .env.example → .env for full list.

  ## Git Commit Rules

  - Never use --no-verify
  - Never add Co-authored-by lines
  - Never reference AI/claude in commit messages
  ```

  Populate the test count from Task 1's evidence file (`.sisyphus/evidence/task-1-test-count.txt`). If that file doesn't exist yet (Task 1 still running), use "515+" as placeholder and Task 7 will update it.

  **Must NOT do**:
  - Do not exceed 200 lines
  - Do not duplicate entire system-overview.md content
  - Do not include sensitive information (API keys, secrets)
  - Do not include phase history — this is a working reference, not a historical record

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Creating a new markdown file with synthesized content from multiple sources
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: F1–F4 (verification)
  - **Blocked By**: None (can use "515+" placeholder if Task 1 not done)

  **References**:

  **Pattern References**:
  - `README.md` — Current project README (source for Quick Start, Scripts, Project Structure)
  - `docs/2026-04-01-1726-system-overview.md` — Authoritative system reference (source for architecture, env vars, database)
  - `docs/2026-04-01-2110-troubleshooting.md` — Known issues and fixes
  - `.env.example` — Full list of environment variables

  **External References**:
  - The user's global `~/.config/opencode/AGENTS.md` has ai-employee-specific sections that overlap — the repo AGENTS.md should be self-contained and authoritative for this repo

  **WHY Each Reference Matters**:
  - README.md provides the user-facing commands and structure
  - system-overview.md provides deep technical details to distill
  - The goal is a condensed, agent-optimized reference that prevents common mistakes (wrong DB name, missing Docker build, etc.)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md exists with required sections
    Tool: Bash
    Preconditions: AGENTS.md has been created
    Steps:
      1. test -f AGENTS.md && echo "EXISTS" || echo "MISSING"
      2. grep -c "pnpm test" AGENTS.md → expect >= 1
      3. grep -c "ai_employee" AGENTS.md → expect >= 1
      4. grep -c "docker" AGENTS.md → expect >= 1 (case insensitive: grep -ic)
      5. grep -c "inngest" AGENTS.md → expect >= 1 (case insensitive: grep -ic)
      6. grep -c "pnpm setup" AGENTS.md → expect >= 1
      7. wc -l AGENTS.md → expect <= 200
    Expected Result: All checks pass
    Evidence: .sisyphus/evidence/task-6-agents-md-created.txt

  Scenario: AGENTS.md does not contain secrets
    Tool: Bash
    Preconditions: AGENTS.md has been created
    Steps:
      1. grep -ic "api.key\|secret.key\|password" AGENTS.md — check for literal secrets
      2. Should find only variable NAME references like OPENROUTER_API_KEY, not actual values
    Expected Result: No actual secret values present
    Evidence: .sisyphus/evidence/task-6-no-secrets.txt
  ```

  **Commit**: YES
  - Message: `docs: add AGENTS.md with repo conventions for AI coding agents`
  - Files: `AGENTS.md`
  - Pre-commit: `test -f AGENTS.md && grep -c "ai_employee" AGENTS.md` → >= 1

- [x] 7. Update test count in system-overview.md, phase8-e2e.md, and README.md

  **What to do**:
  - Read the actual test count from `.sisyphus/evidence/task-1-test-count.txt` (produced by Task 1)
  - If the count differs from "515", update ALL three locations:
    1. `docs/2026-04-01-1726-system-overview.md` line ~346: "515 tests pass" → "{ACTUAL} tests pass"
    2. `docs/2026-04-01-1655-phase8-e2e.md` line ~229: "515 tests pass" → "{ACTUAL} tests pass"
    3. `README.md` line ~84: "515+ tests" → "{ACTUAL}+ tests"
  - If the count IS 515, no changes needed — mark task as complete with "count verified, no update needed"
  - Also update AGENTS.md test count if Task 6 used a placeholder

  **Must NOT do**:
  - Do not change test counts without reading the evidence file from Task 1
  - Do not guess the count
  - Do not update phase1–7 docs even if they mention test counts
  - Do not modify any section other than the specific test count lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read a number from a file, grep-and-replace in 3 markdown files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after Task 1)
  - **Blocks**: F1–F4 (verification)
  - **Blocked By**: Task 1 (must have actual test count)

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/task-1-test-count.txt` — Actual test count from Task 1
  - `docs/2026-04-01-1726-system-overview.md:346` — "515 tests pass" (exact count)
  - `docs/2026-04-01-1655-phase8-e2e.md:229` — "515 tests pass" (exact count)
  - `README.md:84` — "515+ tests" (approximate)
  - `AGENTS.md` — May contain placeholder "515+" from Task 6

  **WHY Each Reference Matters**:
  - Test count in docs is a verifiable claim — it must match reality
  - Three files reference the count, all must be consistent

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test count matches across all docs
    Tool: Bash
    Preconditions: Task 1 evidence file exists, all docs have been updated
    Steps:
      1. Read actual count: cat .sisyphus/evidence/task-1-test-count.txt
      2. grep for that count in docs/2026-04-01-1726-system-overview.md
      3. grep for that count in docs/2026-04-01-1655-phase8-e2e.md
      4. grep for that count in README.md
    Expected Result: Count found in all 3 files
    Evidence: .sisyphus/evidence/task-7-count-updated.txt

  Scenario: No stale "515" remains if count changed
    Tool: Bash
    Preconditions: Count has been updated (only if different from 515)
    Steps:
      1. If actual count != 515: grep -c "515 tests" in all 3 docs → expect 0 each
      2. If actual count == 515: skip this check (no change needed)
    Expected Result: No stale counts remain
    Evidence: .sisyphus/evidence/task-7-no-stale-count.txt
  ```

  **Commit**: YES (only if count changed)
  - Message: `fix(docs): update test count to verified number`
  - Files: `docs/2026-04-01-1726-system-overview.md`, `docs/2026-04-01-1655-phase8-e2e.md`, `README.md`, possibly `AGENTS.md`
  - Pre-commit: count matches in all files

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (grep for patterns, read files). For each "Must NOT Have": search codebase for forbidden changes — reject if any `src/`, `tests/`, `scripts/`, `prisma/`, or `docker/` files were modified. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test` and `pnpm build` to verify no regressions from doc changes. Review all changed markdown files for: broken links, inconsistent formatting, factual claims not verified by evidence. Check AGENTS.md for completeness (build commands, database, Docker, test failures, architecture).
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Markdown [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY grep-based acceptance criterion from EVERY task. Verify: `cost-gate.ts` gone from system-overview, `access_token` gone from phase8, `-d postgres` gone from troubleshooting, stale readme deleted, AGENTS.md exists with required content, test count matches in all 3 locations. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Criteria [N/N pass] | Evidence [N captured] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", check actual git diff. Verify 1:1 — everything in spec was done, nothing beyond spec was done. Specifically check: no files outside docs/ and AGENTS.md were modified. No phase1-7 docs touched. No code files touched. Flag any unaccounted changes.
      Output: `Tasks [N/N compliant] | Scope [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                 | Files                                                                                        | Pre-commit check                                                     |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1      | `fix(docs): correct system-overview project tree and phase table`       | `docs/2026-04-01-1726-system-overview.md`                                                    | `grep -c "cost-gate.ts" docs/2026-04-01-1726-system-overview.md` → 0 |
| 2      | `fix(docs): correct auth.json format and 204 description in phase8-e2e` | `docs/2026-04-01-1655-phase8-e2e.md`                                                         | `grep -c '"access_token"' docs/2026-04-01-1655-phase8-e2e.md` → 0    |
| 3      | `fix(docs): use ai_employee database in troubleshooting SQL`            | `docs/2026-04-01-2110-troubleshooting.md`                                                    | `grep -c "\-d postgres" docs/2026-04-01-2110-troubleshooting.md` → 0 |
| 4      | `chore(docs): delete stale 2026-03-22-2317-readme.md`                   | deleted: `docs/2026-03-22-2317-readme.md`                                                    | `ls docs/2026-03-22-2317-readme.md` → not found                      |
| 5      | `fix(docs): update test count to verified number`                       | `docs/2026-04-01-1726-system-overview.md`, `docs/2026-04-01-1655-phase8-e2e.md`, `README.md` | count matches `pnpm test` output                                     |
| 6      | `docs: add AGENTS.md with repo conventions for AI coding agents`        | `AGENTS.md`                                                                                  | `test -f AGENTS.md` → exists                                         |

---

## Success Criteria

### Verification Commands

```bash
# All ghost references removed
grep -c "cost-gate.ts" docs/2026-04-01-1726-system-overview.md          # Expected: 0
grep -c '"access_token"' docs/2026-04-01-1655-phase8-e2e.md             # Expected: 0
grep -c "\-d postgres" docs/2026-04-01-2110-troubleshooting.md          # Expected: 0

# Missing files now documented
grep -c "client.ts" docs/2026-04-01-1726-system-overview.md             # Expected: 1
grep -c "call-llm.ts" docs/2026-04-01-1726-system-overview.md           # Expected: 1
grep -c "jira-client.ts" docs/2026-04-01-1726-system-overview.md        # Expected: 1

# Stale doc deleted, no broken links
ls docs/2026-03-22-2317-readme.md 2>/dev/null && echo FAIL || echo PASS # Expected: PASS
grep -r "2026-03-22-2317-readme" docs/ README.md                        # Expected: 0 results

# AGENTS.md exists with key content
test -f AGENTS.md && echo PASS || echo FAIL                             # Expected: PASS
grep -c "pnpm test" AGENTS.md                                           # Expected: 1+
grep -c "ai_employee" AGENTS.md                                         # Expected: 1+

# No regressions
pnpm build 2>&1 | tail -1                                               # Expected: no errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (no code changes, no phase1-7 edits)
- [ ] All grep verification commands pass
- [ ] Test count matches actual pnpm test output
- [ ] AGENTS.md is self-contained and useful for AI coding agents
