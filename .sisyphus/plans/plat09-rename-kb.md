# PLAT-09: Rename kb to knowledge_base

## TL;DR

> **Quick Summary**: Rename `src/worker-tools/kb/` to `src/worker-tools/knowledge_base/` and update all references across the codebase — source, tests, seed data, Dockerfile, and documentation — so the tool path is consistent with the `knowledge_bases` and `knowledge_base_entries` database tables.
>
> **Deliverables**:
>
> - Renamed source directory: `src/worker-tools/knowledge_base/search.ts`
> - Renamed test directory: `tests/worker-tools/knowledge_base/search.test.ts`
> - Updated seed data with new tool paths
> - Dockerfile COPY block for the kb tool (currently missing — added with new name)
> - Updated documentation (story map + current system state)
> - PLAT-09 marked complete in story map
>
> **Estimated Effort**: Quick (S-complexity, hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request

Implement PLAT-09 from the Phase 1 story map: rename `src/worker-tools/kb/` to `src/worker-tools/knowledge_base/` and update all references. Verify thoroughly via automated tests and Docker smoke test. Mark PLAT-09 as complete in the story map.

### Interview Summary

**Key Discussions**:

- PLAT-09 depends on GM-03 (Single-Property Knowledge Base), which is already complete — all acceptance criteria checked
- The kb tool has one file: `search.ts` (194 lines, uses native `fetch` against PostgREST, zero npm dependencies)
- The Dockerfile currently has NO COPY line for the kb tool — this is a gap from GM-03. The rename adds it with the new name.
- Seed uses `upsert` by archetype UUID — re-seeding safely updates `tool_registry`
- `AGENTS.md` and `src/workers/config/agents.md` have zero `kb` references — that acceptance criterion is already satisfied
- `search.ts` handles `--help` flag and exits 0 — Docker smoke test command from ticket works

**Research Findings**:

- Complete blast radius mapped by 2 explore agents (identical findings confirmed)
- 6 files need string replacements, 2 directories need `git mv`, 1 Dockerfile block to add
- Historical `.sisyphus/plans/` files have ~30 references but are archived — excluded from scope
- `vitest.config.ts` uses `tests/**/*.test.ts` glob — no risk of silently dropped tests

### Metis Review

**Identified Gaps** (all addressed):

- Dockerfile COPY absence: Resolved by adding new COPY block with `knowledge_base` name
- `--help` exit code uncertainty: Validated — exits 0 (line 56-57, 67-94)
- Seed idempotency concern: Validated — uses `upsert` by archetype UUID (line 1198-1199)
- vitest.config.ts glob concern: Validated — uses `tests/**/*.test.ts`, safe to move
- search.ts npm dependencies: Validated — zero external deps, no `npm install` needed

---

## Work Objectives

### Core Objective

Rename the knowledge base shell tool path from `kb` to `knowledge_base` everywhere, so the tool path is consistent with the database table names (`knowledge_bases`, `knowledge_base_entries`) and immediately obvious to new developers and AI employees.

### Concrete Deliverables

- `src/worker-tools/knowledge_base/search.ts` (renamed from `src/worker-tools/kb/search.ts`)
- `tests/worker-tools/knowledge_base/search.test.ts` (renamed from `tests/worker-tools/kb/search.test.ts`)
- Updated `prisma/seed.ts` with `/tools/knowledge_base/search.ts` references
- Updated `tests/gateway/seed-property-kb.test.ts` assertions
- New Dockerfile COPY block for `/tools/knowledge_base/`
- Updated `docs/2026-04-24-1452-current-system-state.md`
- Updated `docs/2026-04-21-2202-phase1-story-map.md` with PLAT-09 marked `[x]`

### Definition of Done

- [ ] `grep -r "worker-tools/kb\|/tools/kb" src/ tests/ prisma/ Dockerfile` returns zero matches
- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes (all existing tests, including renamed ones)
- [ ] `docker build -t ai-employee-worker:latest .` exits 0
- [ ] `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/knowledge_base/search.ts --help` exits 0
- [ ] All PLAT-09 checkboxes in story map marked `[x]`

### Must Have

- `git mv` for directory renames (preserves git history)
- All 3 seed.ts references updated
- Dockerfile COPY block added (not just renamed — it doesn't exist yet)
- Docker smoke test passes with `--help`

### Must NOT Have (Guardrails)

- **DO NOT** modify `prisma/migrations/` — `knowledge_base` there refers to DB tables, not tool paths
- **DO NOT** modify `.sisyphus/plans/` historical files — archived plans are excluded from scope
- **DO NOT** modify `src/inngest/`, `src/gateway/`, or `src/lib/` — `knowledge_base` references there are DB model names
- **DO NOT** modify doc files that only contain `knowledge_base` as a DB table reference (only update docs with `/tools/kb/` or `worker-tools/kb/`)
- **DO NOT** use shell `mv`/`rm`/`cp` instead of `git mv` — preserves rename tracking in git history
- **DO NOT** add `npm install` in the Dockerfile for this tool — `search.ts` has zero npm dependencies
- **DO NOT** modify any AGENTS.md files — they have no `kb` references (criterion already satisfied)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — existing tests verify the rename)
- **Framework**: Vitest (`vitest.config.ts`, glob: `tests/**/*.test.ts`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tool**: Use Bash — run commands, assert exit codes + output
- **Docker**: Use Bash — build image, run smoke test
- **Database**: Use Bash — re-seed, query PostgREST to verify data

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all code changes):
├── Task 1: Rename directories + update all source/test/seed/Dockerfile references [quick]

Wave 2 (After Wave 1 — documentation):
├── Task 2: Update documentation files (story map + current system state) [quick]

Wave 3 (After Wave 2 — verification + completion):
├── Task 3: Full verification + mark PLAT-09 complete + notify [unspecified-high]

Critical Path: Task 1 → Task 2 → Task 3
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2, 3   | 1    |
| 2    | 1          | 3      | 2    |
| 3    | 1, 2       | —      | 3    |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **1 task** — T2 → `quick`
- **Wave 3**: **1 task** — T3 → `unspecified-high`

---

## TODOs

- [x] 1. Rename directories and update all code/config references

  **What to do**:
  1. Rename source directory: `git mv src/worker-tools/kb src/worker-tools/knowledge_base`
  2. Rename test directory: `git mv tests/worker-tools/kb tests/worker-tools/knowledge_base`
  3. Update `src/worker-tools/knowledge_base/search.ts` — 3 internal string references:
     - Line 2: `kb/search.ts` → `knowledge_base/search.ts` (JSDoc header)
     - Line 9: `tsx /tools/kb/search.ts` → `tsx /tools/knowledge_base/search.ts` (usage doc)
     - Line 69: `tsx /tools/kb/search.ts` → `tsx /tools/knowledge_base/search.ts` (help text)
  4. Update `tests/worker-tools/knowledge_base/search.test.ts` — 2 references:
     - Line 6: `'../../../src/worker-tools/kb/search.ts'` → `'../../../src/worker-tools/knowledge_base/search.ts'` (SCRIPT_PATH)
     - Line 63: `describe('kb/search shell tool'` → `describe('knowledge_base/search shell tool'` (test label)
  5. Update `tests/gateway/seed-property-kb.test.ts` — 2 references:
     - Line 56: test description `includes /tools/kb/search.ts` → `includes /tools/knowledge_base/search.ts`
     - Line 65: `expect(registry.tools).toContain('/tools/kb/search.ts')` → `toContain('/tools/knowledge_base/search.ts')`
  6. Update `prisma/seed.ts` — 3 references:
     - Line 423: `tsx /tools/kb/search.ts` → `tsx /tools/knowledge_base/search.ts` (archetype instructions)
     - Line 1217: `'/tools/kb/search.ts'` → `'/tools/knowledge_base/search.ts'` (tool_registry create)
     - Line 1246: `'/tools/kb/search.ts'` → `'/tools/knowledge_base/search.ts'` (tool_registry update)
  7. Add Dockerfile COPY block — insert after line 74 (after the `platform` tool block), before the LABEL lines:
     ```dockerfile
     RUN mkdir -p /tools/knowledge_base
     COPY --from=builder /build/src/worker-tools/knowledge_base/search.ts /tools/knowledge_base/search.ts
     ```
     Note: No `npm install` needed — `search.ts` has zero external dependencies (uses only native Node.js `fetch`).

  **Must NOT do**:
  - DO NOT use shell `mv`/`rm`/`cp` — use `git mv` for directory renames
  - DO NOT modify `prisma/migrations/` — `knowledge_base` there refers to DB tables
  - DO NOT modify `.sisyphus/plans/` historical files
  - DO NOT modify `src/inngest/`, `src/gateway/`, `src/lib/`
  - DO NOT add `npm install` in Dockerfile for this tool
  - DO NOT modify any AGENTS.md files (they have no `kb` references)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical rename with well-defined string replacements across known files. No design decisions, no complex logic.
  - **Skills**: []
    - No specialized skills needed — standard file editing and git operations.

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundation task)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `Dockerfile:60-74` — Existing tool COPY pattern: `RUN mkdir -p /tools/{name}` + `COPY --from=builder /build/src/worker-tools/{name}/{file}.ts /tools/{name}/{file}.ts`. Follow this exact pattern for the new `knowledge_base` block.
  - `src/worker-tools/slack/` — Reference for how other worker-tools directories are structured (1 directory = 1 service category)

  **API/Type References** (contracts to implement against):
  - `prisma/seed.ts:1198-1259` — The archetype upsert block for guest-messaging. Contains the 3 references to update (instructions string at 423, tool_registry at 1217 and 1246)

  **Test References** (testing patterns to follow):
  - `tests/worker-tools/kb/search.test.ts:6` — The `SCRIPT_PATH` resolution pattern. After rename, the `__dirname` changes automatically (because the test file moves), but the relative path `'../../../src/worker-tools/kb/search.ts'` must be updated to `'../../../src/worker-tools/knowledge_base/search.ts'`
  - `tests/gateway/seed-property-kb.test.ts:56-65` — Assertion checking tool_registry contents. Must update the expected string.

  **WHY Each Reference Matters**:
  - Dockerfile pattern: The new COPY block must match the exact structure of existing blocks or the Docker build will fail
  - seed.ts archetype: These strings end up in the database and are injected into the OpenCode worker environment — wrong paths = broken employee
  - Test assertions: Tests hardcode the expected tool path — without updating these, tests will fail asserting the old path

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All old kb references eliminated from code/config
    Tool: Bash
    Preconditions: All edits applied, git mv completed
    Steps:
      1. Run: grep -r "worker-tools/kb\|/tools/kb" src/ tests/ prisma/ Dockerfile
      2. Assert: exit code 1 (no matches found)
      3. Run: grep -r "/tools/knowledge_base/search.ts" src/ tests/ prisma/ Dockerfile
      4. Assert: exit code 0, at least 6 matches (source JSDoc, source help, seed x3, test assertion, Dockerfile)
    Expected Result: Zero old references, 6+ new references
    Failure Indicators: Any match of `/tools/kb/` in source/tests/prisma/Dockerfile
    Evidence: .sisyphus/evidence/task-1-stale-ref-check.txt

  Scenario: Directories renamed correctly via git mv
    Tool: Bash
    Preconditions: git mv commands executed
    Steps:
      1. Run: ls src/worker-tools/knowledge_base/search.ts
      2. Assert: file exists (exit 0)
      3. Run: ls tests/worker-tools/knowledge_base/search.test.ts
      4. Assert: file exists (exit 0)
      5. Run: ls src/worker-tools/kb/ 2>&1
      6. Assert: "No such file or directory" (exit non-zero)
      7. Run: git status --porcelain | grep "R.*kb.*knowledge_base"
      8. Assert: shows rename entries
    Expected Result: New directories exist, old directories gone, git tracks as renames
    Failure Indicators: Old `kb/` directory still exists, or git shows delete+add instead of rename
    Evidence: .sisyphus/evidence/task-1-directory-rename.txt

  Scenario: Dockerfile has correct COPY block
    Tool: Bash
    Preconditions: Dockerfile edited
    Steps:
      1. Run: grep "knowledge_base" Dockerfile
      2. Assert: matches `mkdir -p /tools/knowledge_base` and `COPY --from=builder /build/src/worker-tools/knowledge_base/search.ts /tools/knowledge_base/search.ts`
      3. Run: grep "/tools/kb" Dockerfile
      4. Assert: no matches (exit 1)
    Expected Result: New COPY block present, no old references
    Failure Indicators: Missing COPY block or stale `/tools/kb` reference
    Evidence: .sisyphus/evidence/task-1-dockerfile-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-stale-ref-check.txt — grep output confirming zero old references
  - [ ] task-1-directory-rename.txt — ls + git status output
  - [ ] task-1-dockerfile-check.txt — Dockerfile grep output

  **Commit**: YES
  - Message: `refactor(worker-tools): rename kb to knowledge_base (PLAT-09)`
  - Files: All renamed/edited files
  - Pre-commit: `pnpm build`

- [x] 2. Update documentation files

  **What to do**:
  1. Update `docs/2026-04-24-1452-current-system-state.md` — 3 references:
     - Line 255: `tsx /tools/kb/search.ts` → `tsx /tools/knowledge_base/search.ts` (table row CLI example)
     - Line 455: `tsx /tools/kb/search.ts` → `tsx /tools/knowledge_base/search.ts` (prose)
     - Line 570: `| /tools/kb/ |` → `| /tools/knowledge_base/ |` (table row)
  2. Update `docs/2026-04-21-2202-phase1-story-map.md` — only 1 reference needs updating:
     - Line 611 (GM-03 acceptance criterion): `tsx /tools/kb/search.ts` → `tsx /tools/knowledge_base/search.ts` (this line describes the current tool path, which changes after rename)
     - **DO NOT change lines 455, 462** — these are the PLAT-09 story description that describes the rename (before→after). Changing them would make the story nonsensical ("rename knowledge_base to knowledge_base").
     - **DO NOT change lines 466-473** — these are acceptance criteria checkboxes. They already contain the correct target paths. They will be marked `[x]` in Task 3 after verification, not here.

  **Must NOT do**:
  - DO NOT mark PLAT-09 checkboxes as `[x]` in this task (that's Task 3, after verification)
  - DO NOT update docs that only reference `knowledge_base` as a DB table name
  - DO NOT update `docs/2026-04-20-1314-current-system-state.md` (superseded older doc)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure string replacements in markdown documentation files. No code logic involved.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo, after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `docs/2026-04-24-1452-current-system-state.md:250-260` — Shell tool table with CLI examples. Update the `kb` row to use `knowledge_base` path.
  - `docs/2026-04-24-1452-current-system-state.md:450-460` — Prose section describing KB querying. Update the `tsx /tools/kb/search.ts` usage example.
  - `docs/2026-04-24-1452-current-system-state.md:565-575` — Tools directory table listing `/tools/kb/`. Update to `/tools/knowledge_base/`.
  - `docs/2026-04-21-2202-phase1-story-map.md:611` — GM-03 acceptance criterion referencing `tsx /tools/kb/search.ts`. This line describes the current tool path, which changes after the rename. Update path string only (the `[x]` is already checked). Do NOT touch the PLAT-09 story description (lines 455, 462) — those intentionally describe the before→after rename.

  **WHY Each Reference Matters**:
  - current-system-state.md is the ground-truth snapshot used by all agents — stale tool paths here mislead every future agent session
  - story-map.md contains acceptance criteria that reference the old paths — updating ensures the criteria text matches reality after the rename

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No stale kb references in documentation
    Tool: Bash
    Preconditions: All doc edits applied
    Steps:
      1. Run: grep "/tools/kb\|worker-tools/kb" docs/2026-04-24-1452-current-system-state.md
      2. Assert: exit code 1 (no matches)
      3. Run: grep "/tools/knowledge_base" docs/2026-04-24-1452-current-system-state.md
      4. Assert: exit code 0, at least 3 matches
      5. Run: grep "/tools/kb" docs/2026-04-21-2202-phase1-story-map.md | grep -v "PLAT-09\|Rename kb\|Porting notes\|→"
      6. Assert: exit code 1 (no matches outside the PLAT-09 story description — the story description intentionally keeps the old path as it describes the before→after rename)
    Expected Result: Zero stale `/tools/kb/` references in either doc file
    Failure Indicators: Any match of `/tools/kb/` in the updated docs
    Evidence: .sisyphus/evidence/task-2-doc-stale-refs.txt

  Scenario: PLAT-09 checkboxes NOT yet marked (Task 3 responsibility)
    Tool: Bash
    Preconditions: Story map doc updated
    Steps:
      1. Run: grep -A1 "PLAT-09" docs/2026-04-21-2202-phase1-story-map.md | head -20
      2. Visually confirm the acceptance criteria lines (466-468) still have `- [ ]` prefix
    Expected Result: Acceptance criteria checkboxes remain unchecked
    Failure Indicators: Any `- [x]` on PLAT-09 criteria before verification is complete
    Evidence: .sisyphus/evidence/task-2-checkbox-state.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-doc-stale-refs.txt — grep output confirming docs are clean
  - [ ] task-2-checkbox-state.txt — PLAT-09 checkbox state confirmation

  **Commit**: YES (groups with Task 1)
  - Message: `docs: update kb references to knowledge_base (PLAT-09)`
  - Files: `docs/2026-04-24-1452-current-system-state.md`, `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: N/A (docs only)

- [x] 3. Full verification suite + mark PLAT-09 complete

  **What to do**:
  1. **Build verification**: Run `pnpm build` — assert exit code 0
  2. **Re-seed database**: Run `pnpm prisma db seed` to update archetype `tool_registry` and `instructions` in the database with new paths. Assert no errors.
  3. **Run full test suite**: Run `pnpm test -- --run` — assert all tests pass. Specifically watch for:
     - `tests/worker-tools/knowledge_base/search.test.ts` — all 9+ test cases pass (same count as before rename)
     - `tests/gateway/seed-property-kb.test.ts` — passes with updated `/tools/knowledge_base/search.ts` assertion
  4. **Docker build**: Run `docker build -t ai-employee-worker:latest .` — assert exit code 0
  5. **Docker smoke test**: Run `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/knowledge_base/search.ts --help` — assert exit code 0, stdout contains `--entity-type` and `--entity-id`
  6. **Stale reference sweep**: Run `grep -r "worker-tools/kb\|/tools/kb" src/ tests/ prisma/ Dockerfile` — assert zero matches
  7. **Mark PLAT-09 complete in story map**: Edit `docs/2026-04-21-2202-phase1-story-map.md` to change all PLAT-09 acceptance criteria from `- [ ]` to `- [x]`:
     - Line 466: `- [ ] Source directory renamed` → `- [x] Source directory renamed`
     - Line 467: `- [ ] Docker path updated` → `- [x] Docker path updated`
     - Line 468: `- [ ] All archetype instructions` → `- [x] All archetype instructions`
     - Line 469: `- [ ] AGENTS.md content` → `- [x] AGENTS.md content`
     - Line 470: `- [ ] Test files updated` → `- [x] Test files updated`
     - Line 471: `- [ ] Dockerfile COPY lines updated` → `- [x] Dockerfile COPY lines updated`
     - Line 472: `- [ ] pnpm build exits 0` → `- [x] pnpm build exits 0`
     - Line 473: `- [ ] Docker smoke test` → `- [x] Docker smoke test`
  8. **Send Telegram notification**: `tsx scripts/telegram-notify.ts "📋 PLAT-09 complete — kb renamed to knowledge_base. All tests pass, Docker smoke test verified."`

  **Must NOT do**:
  - DO NOT skip any verification step — all are mandatory
  - DO NOT mark checkboxes without first running and verifying the corresponding criteria
  - DO NOT modify source code — this task is verification only (plus story map checkboxes)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step verification requiring build, test, Docker operations, database re-seeding, and careful assertion of results. Needs thoroughness and attention to detail.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final verification)
  - **Parallel Group**: Wave 3 (solo, after Tasks 1 & 2)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 1, 2

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:464-473` — PLAT-09 acceptance criteria checkboxes. Each line must be changed from `- [ ]` to `- [x]` after the corresponding verification passes.
  - `scripts/telegram-notify.ts` — Telegram notification script. Use `tsx scripts/telegram-notify.ts "message"` to send.

  **Test References**:
  - `tests/worker-tools/knowledge_base/search.test.ts` — After rename, this file should still have 9+ test cases (was `describe('knowledge_base/search shell tool', ...)` after Task 1's rename). Verify test count is preserved.
  - `tests/gateway/seed-property-kb.test.ts` — After re-seed, this test should pass asserting `/tools/knowledge_base/search.ts` in tool_registry.

  **WHY Each Reference Matters**:
  - Story map checkboxes: The user explicitly requested marking PLAT-09 complete — these are the specific lines to check
  - Telegram script: Required by project conventions (AGENTS.md rule: notify on plan completion)
  - Test files: Must verify same test count before/after to ensure no tests were silently dropped

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript build succeeds
    Tool: Bash
    Preconditions: Task 1 code changes committed
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
    Expected Result: Clean build with no errors
    Failure Indicators: Non-zero exit code, TypeScript compilation errors
    Evidence: .sisyphus/evidence/task-3-build.txt

  Scenario: Database re-seed updates tool_registry
    Tool: Bash
    Preconditions: seed.ts updated with new paths
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit code 0, output contains "✅ Archetype upserted"
      3. Run: pnpm prisma db seed (on test DB — run tests that verify seed data)
    Expected Result: Seed completes without errors, archetype data updated
    Failure Indicators: Prisma errors, seed script failures
    Evidence: .sisyphus/evidence/task-3-reseed.txt

  Scenario: All tests pass including renamed tests
    Tool: Bash
    Preconditions: Database re-seeded, all code changes applied
    Steps:
      1. Run: pnpm test -- --run 2>&1
      2. Assert: exit code 0
      3. Grep output for "knowledge_base/search" to confirm the renamed test ran
      4. Assert: test output contains references to the knowledge_base test file
    Expected Result: All tests pass, renamed test file runs with same test count
    Failure Indicators: Test failures, missing test file in output, reduced test count
    Evidence: .sisyphus/evidence/task-3-test-results.txt

  Scenario: Docker build succeeds with new COPY block
    Tool: Bash (run in tmux — long-running)
    Preconditions: Dockerfile updated with knowledge_base COPY block
    Steps:
      1. Run in tmux: docker build -t ai-employee-worker:latest .
      2. Poll until complete
      3. Assert: exit code 0
    Expected Result: Docker image builds successfully
    Failure Indicators: COPY failure, build errors
    Evidence: .sisyphus/evidence/task-3-docker-build.txt

  Scenario: Docker smoke test — search.ts accessible at new path
    Tool: Bash
    Preconditions: Docker image built
    Steps:
      1. Run: docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/knowledge_base/search.ts --help
      2. Assert: exit code 0
      3. Assert: stdout contains "--entity-type" and "--entity-id" and "SUPABASE_URL"
      4. Assert: stdout contains "knowledge_base" (not "kb")
    Expected Result: Help text displayed, confirming tool is correctly deployed at new path
    Failure Indicators: "Cannot find module" error, exit code non-zero, help text references old path
    Evidence: .sisyphus/evidence/task-3-docker-smoke.txt

  Scenario: No stale references anywhere in codebase
    Tool: Bash
    Preconditions: All changes applied
    Steps:
      1. Run: grep -r "worker-tools/kb\|/tools/kb" src/ tests/ prisma/ Dockerfile
      2. Assert: exit code 1 (no matches)
    Expected Result: Zero stale references to old kb paths
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-3-final-sweep.txt

  Scenario: PLAT-09 checkboxes all marked complete
    Tool: Bash
    Preconditions: Story map updated
    Steps:
      1. Run: grep -A20 "#### PLAT-09" docs/2026-04-21-2202-phase1-story-map.md | grep "\- \["
      2. Assert: all lines show "- [x]", zero lines show "- [ ]"
    Expected Result: All 8 PLAT-09 acceptance criteria marked as complete
    Failure Indicators: Any unchecked checkbox
    Evidence: .sisyphus/evidence/task-3-checkboxes.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-build.txt — pnpm build output
  - [ ] task-3-reseed.txt — prisma db seed output
  - [ ] task-3-test-results.txt — pnpm test output
  - [ ] task-3-docker-build.txt — docker build log
  - [ ] task-3-docker-smoke.txt — docker run smoke test output
  - [ ] task-3-final-sweep.txt — grep stale reference check
  - [ ] task-3-checkboxes.txt — PLAT-09 checkbox state

  **Commit**: YES
  - Message: `docs: mark PLAT-09 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: `pnpm build`

- [x] 4. **Notify completion** — Send Telegram notification: plan `plat09-rename-kb` complete, all tasks done, come back to review results.

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for stale references to `/tools/kb/` or `worker-tools/kb/`. Check no files outside the allowed scope were modified.
      Output: `Build [PASS/FAIL] | Tests [PASS/FAIL] | Stale Refs [CLEAN/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test Docker build + smoke test. Re-seed database and verify tool_registry is updated. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Docker [PASS/FAIL] | Seed [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                         | Files                    | Pre-commit                         |
| ------ | --------------------------------------------------------------- | ------------------------ | ---------------------------------- |
| 1      | `refactor(worker-tools): rename kb to knowledge_base (PLAT-09)` | All renamed/edited files | `pnpm build && pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
grep -r "worker-tools/kb\|/tools/kb" src/ tests/ prisma/ Dockerfile  # Expected: no matches (exit 1)
pnpm build                                                            # Expected: exit 0
pnpm test -- --run                                                    # Expected: all pass
docker build -t ai-employee-worker:latest .                           # Expected: exit 0
docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/knowledge_base/search.ts --help  # Expected: exit 0, help text
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] PLAT-09 checkboxes marked `[x]` in story map
- [ ] Telegram notification sent
