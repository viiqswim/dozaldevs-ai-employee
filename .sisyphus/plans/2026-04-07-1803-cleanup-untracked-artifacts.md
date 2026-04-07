# Cleanup Untracked Artifacts & Establish Hygiene

## TL;DR

> **Quick Summary**: Process 24 untracked entries + 1 modified file + 164 unpushed commits in the ai-employee working tree. Move 8 infra templates out of `.sisyphus/drafts/` (which was serving a dual purpose), track accumulated plans/notepads per existing convention, gitignore drafts going forward, and push the backlog to `origin/main`.
>
> **Deliverables**:
>
> - `infra/templates/` directory with 8 relocated template files + README
> - `.gitignore` updated to exclude `.sisyphus/drafts/`
> - `.sisyphus/plans/shared-supabase-infra.md` updated to reference new paths
> - 2 empty 0-byte notepad files deleted
> - 13 plans + 5 notepad directories + 1 modified learnings.md + 1 new doc + 1 test payload all committed in atomic topic-based commits
> - All commits pushed to `origin/main` (fast-forward)
>
> **Estimated Effort**: Medium (6 atomic commits + verification gates)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (move templates) → T4 (update plan refs) → T9 (infra commit) → T11 (push)

---

## Context

### Original Request

User asked: "I see a lot of files that haven't been processed (moved, deleted, committed, etc). What should we do with all of those?"

### Interview Summary

**Key Decisions**:

- **Templates relocation**: Move 8 infra template files from `.sisyphus/drafts/` to `infra/templates/` (a proper home for shared infrastructure templates). Update the 1 plan that references them. Gitignore `.sisyphus/drafts/` so future Prometheus working memory doesn't accumulate.
- **Test payload**: Commit `test-payloads/jira-realistic-task-103.json` alongside existing committed payloads.
- **Empty notepad files**: Delete the 2 zero-byte files (`.sisyphus/notepads/phase8-e2e/decisions.md` and `issues.md`) — dead artifacts.
- **Plan naming**: Leave the 5 non-date-prefixed plans alone (minimize churn; renaming is not worth the disruption to historical records).
- **Commit strategy**: Atomic commits per topic (6 total) for easy revert/bisect.
- **Push strategy**: Push all commits (existing 164 + new cleanup commits) to `origin/main` after cleanup lands.

**Research Findings**:

- Only `.sisyphus/plans/shared-supabase-infra.md` references the 8 templates being moved (~15 path references).
- 4 OTHER plans (Mar 22-25 architecture plans + `hybrid-local-flyio-workers.md`) have references to OLD Prometheus draft files that no longer exist on disk (deleted per Prometheus cleanup protocol). These are dead links in historical/closed plans — **intentionally left as historical record**.
- `.sisyphus/drafts/` is not in `.gitignore` currently — this is a convention gap.
- `origin/main` has not moved — 164 commits ahead, 0 behind. Clean fast-forward push.
- All 8 template files contain placeholder values only — **no real secrets**.
- `infra/` directory does NOT exist yet — must be created.

### Metis Review

**Identified Gaps** (all addressed in this plan):

1. **Absolute paths in shared-supabase-infra.md** — plan contains mix of absolute (`/Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/drafts/...`) and relative (`.sisyphus/drafts/...`) paths. T4 uses two-pass replacement to handle both.
2. **`infra/` directory missing** — T1 must `mkdir -p infra/templates/` as first step.
3. **Checksum verification** — T1 captures MD5 before move, verifies after.
4. **Commit ordering** — T5 (delete empty files) must run BEFORE T6 (notepad commit) to prevent accidental staging.
5. **Strict per-file `git add`** — never `git add .` or `-A`, always explicit paths.
6. **Gitignore placement** — adjacent to existing `.sisyphus/` entries for consistency.
7. **Push safety gate** — verify `HEAD..origin/main` is empty before pushing; abort if rejected.
8. **infra/templates/ README** — new directory needs purpose explanation (Metis recommendation).
9. **Grants.sql cross-project concern** — fetched_pets / nexus_stack / vlre_hub grants are for OTHER projects. User explicitly decided to commit them here as the canonical template location, so this is documented but not blocked.

---

## Work Objectives

### Core Objective

Bring the ai-employee working tree to a clean state (clean `git status`, nothing untracked or uncommitted) while establishing hygiene conventions (`.sisyphus/drafts/` gitignored) to prevent this accumulation from recurring.

### Concrete Deliverables

- `infra/templates/docker-compose-template.yml` (moved from drafts)
- `infra/templates/env-ai-employee.example` (moved from drafts)
- `infra/templates/env-fetched-pets.example` (moved from drafts)
- `infra/templates/env-nexus-stack.example` (moved from drafts)
- `infra/templates/env-vlre-hub.example` (moved from drafts)
- `infra/templates/fetched_pets_grants.sql` (moved from drafts)
- `infra/templates/nexus_stack_grants.sql` (moved from drafts)
- `infra/templates/vlre_hub_grants.sql` (moved from drafts)
- `infra/templates/README.md` (new, 3-5 lines explaining purpose)
- Updated `.gitignore` with `.sisyphus/drafts/` entry
- Updated `.sisyphus/plans/shared-supabase-infra.md` with new paths (no `.sisyphus/drafts/` references remaining)
- Deleted: `.sisyphus/notepads/phase8-e2e/decisions.md` (empty)
- Deleted: `.sisyphus/notepads/phase8-e2e/issues.md` (empty)
- 6 atomic commits landed on local `main`
- All commits pushed to `origin/main` (fast-forward)

### Definition of Done

- [ ] `git status --short` returns 0 lines (clean working tree)
- [ ] `git log HEAD..origin/main | wc -l` returns 0 (in sync with remote)
- [ ] `ls .sisyphus/drafts/ 2>/dev/null | wc -l` returns 0 (empty or gone)
- [ ] `ls infra/templates/ | wc -l` returns 9 (8 templates + README)
- [ ] `grep -c "sisyphus/drafts" .sisyphus/plans/shared-supabase-infra.md` returns 0
- [ ] `ls .sisyphus/notepads/phase8-e2e/` returns only `learnings.md`

### Must Have

- Atomic commits grouped by topic (6 commits minimum)
- Checksum verification after template move
- Explicit per-file `git add` in every commit
- Fast-forward push only (no force push)
- `infra/templates/README.md` explaining the directory's purpose
- `.sisyphus/drafts/` added to `.gitignore` adjacent to existing `.sisyphus/` entries

### Must NOT Have (Guardrails)

- **NO force push** under any circumstances
- **NO rebasing or squashing** the 164 existing commits
- **NO modification** of any plan file except `shared-supabase-infra.md`
- **NO `git add .` or `git add -A`** — always stage files explicitly by path
- **NO renaming** any plan, notepad, or existing file
- **NO reorganizing** notepads into subdirectories
- **NO fixing** lint errors, unrelated bugs, or anything outside scope
- **NO modifications** to `AGENTS.md`, `docker/.env`, or any `.env` files
- **NO touching** the 4 historical plans with dead links to deleted drafts (Mar 22-25 architecture plans + hybrid-local-flyio-workers.md)
- **NO additions** to `infra/templates/` beyond the 8 specified files + README
- **NO `Co-authored-by`** lines in commit messages
- **NO AI tool references** (claude, opencode, etc.) in commit messages
- **NO `--no-verify`** flag on commits

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed via shell commands.

### Test Decision

- **Infrastructure exists**: YES (this repo has Vitest)
- **Automated tests**: NO (this is an infrastructure/hygiene cleanup, not application code — tests are not relevant)
- **Framework**: N/A
- **Agent-Executed QA**: ALWAYS (every task has concrete verification commands)

### QA Policy

Every task's QA scenarios use shell commands (`git`, `ls`, `grep`, `md5`, `diff`). Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.txt`.

- **File operations**: `ls`, `stat`, `md5` — capture stdout as evidence
- **Git operations**: `git status`, `git show --stat`, `git log` — capture stdout as evidence
- **Content verification**: `grep`, `diff` — capture stdout as evidence
- **No Playwright/tmux needed** — pure shell + git verification

---

## Execution Strategy

### Parallel Execution Waves

> 3 waves with strict commit ordering in Wave 3.

```
Wave 1 (Start Immediately — independent file operations):
├── Task 1: Move 8 templates from .sisyphus/drafts/ to infra/templates/ [quick]
├── Task 2: Update .gitignore with .sisyphus/drafts/ entry [quick]
└── Task 3: Delete 2 empty files in phase8-e2e/ [quick]

Wave 2 (After Wave 1 — requires T1):
├── Task 4: Update shared-supabase-infra.md path references [quick]
└── Task 4b: Create infra/templates/README.md [quick]

Wave 3 (After Wave 2 — SEQUENTIAL commits in strict order):
├── Task 5: Commit deletion of empty files [quick]
├── Task 6: Commit notepad catchup (modified learnings.md + 5 new dirs) [quick]
├── Task 7: Commit plan catchup (13 untracked plans) [quick]
├── Task 8: Commit hybrid mode doc [quick]
├── Task 9: Commit infra template move + gitignore + plan update + README [quick]
└── Task 10: Commit test payload [quick]

Wave 4 (After Wave 3 — final push):
└── Task 11: Push all commits to origin/main [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T4 → T9 → T11 → F1-F4
Parallel Speedup: ~40% (Wave 1 parallelism + Wave 2 parallelism)
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

- **T1**: No deps → blocks T4, T4b, T9
- **T2**: No deps → blocks T9
- **T3**: No deps → blocks T5
- **T4**: T1 → blocks T9
- **T4b**: T1 → blocks T9
- **T5**: T3 → blocks T6
- **T6**: T5 → blocks T7
- **T7**: T6 → blocks T8
- **T8**: T7 → blocks T9
- **T9**: T1, T2, T4, T4b, T8 → blocks T10
- **T10**: T9 → blocks T11
- **T11**: T10 → blocks F1-F4

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2** — T4 → `quick`, T4b → `quick`
- **Wave 3**: **6** — T5-T10 all → `quick`
- **Wave 4**: **1** — T11 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Move 8 template files from `.sisyphus/drafts/` to `infra/templates/`

  **What to do**:
  - Create `infra/templates/` directory: `mkdir -p infra/templates`
  - Capture pre-move MD5 checksums: `for f in docker-compose-template.yml env-ai-employee.example env-fetched-pets.example env-nexus-stack.example env-vlre-hub.example fetched_pets_grants.sql nexus_stack_grants.sql vlre_hub_grants.sql; do md5 .sisyphus/drafts/$f; done > .sisyphus/evidence/task-1-pre-move-checksums.txt`
  - Move each file individually with `git mv`-style plain `mv` (files are not tracked yet): `mv .sisyphus/drafts/docker-compose-template.yml infra/templates/`, repeat for all 8
  - Capture post-move MD5 checksums: `for f in docker-compose-template.yml env-ai-employee.example env-fetched-pets.example env-nexus-stack.example env-vlre-hub.example fetched_pets_grants.sql nexus_stack_grants.sql vlre_hub_grants.sql; do md5 infra/templates/$f; done > .sisyphus/evidence/task-1-post-move-checksums.txt`
  - Verify hashes match (filenames differ, hashes must be identical): `diff <(awk '{print $NF}' .sisyphus/evidence/task-1-pre-move-checksums.txt) <(awk '{print $NF}' .sisyphus/evidence/task-1-post-move-checksums.txt)`
  - Verify `.sisyphus/drafts/` is empty: `ls .sisyphus/drafts/ | wc -l` must return 0

  **Must NOT do**:
  - Do NOT add files to `infra/templates/` beyond the 8 specified (no README yet — that's T4b)
  - Do NOT delete the `.sisyphus/drafts/` directory itself (just empty it)
  - Do NOT use `cp` — must use `mv` to preserve single-source-of-truth semantics
  - Do NOT run `git add` in this task — staging happens in T9

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file operations with clear verification — no architecture, no code generation
  - **Skills**: []
    - No specialized skills needed; `mkdir`, `mv`, `md5`, `diff` are standard shell
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — no git operations in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3)
  - **Blocks**: T4 (needs templates at new location), T4b (needs `infra/templates/` directory), T9 (needs everything ready for commit)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.sisyphus/drafts/` directory — Source of the 8 files being moved. Contains the current (pre-move) state.
  - `AGENTS.md` lines 1-60 — Project conventions for directory structure; `infra/` is a new top-level directory

  **External References**:
  - macOS `md5` command (note: `md5sum` does not exist on macOS by default; use `md5`): `man md5`

  **WHY Each Reference Matters**:
  - The 8 files in `.sisyphus/drafts/` must be moved atomically — if any move fails mid-operation, the checksum diff will catch the inconsistency
  - `md5` is macOS-native; using `md5sum` would fail (per env: darwin)

  **Acceptance Criteria**:
  - [ ] `ls infra/templates/ | wc -l` returns `8`
  - [ ] `ls .sisyphus/drafts/ | wc -l` returns `0`
  - [ ] `diff <(awk '{print $NF}' .sisyphus/evidence/task-1-pre-move-checksums.txt) <(awk '{print $NF}' .sisyphus/evidence/task-1-post-move-checksums.txt)` returns empty (no diff)
  - [ ] All 8 expected filenames present in `infra/templates/`: `docker-compose-template.yml`, `env-ai-employee.example`, `env-fetched-pets.example`, `env-nexus-stack.example`, `env-vlre-hub.example`, `fetched_pets_grants.sql`, `nexus_stack_grants.sql`, `vlre_hub_grants.sql`

  **QA Scenarios**:

  ```
  Scenario: Happy path — all 8 files move with integrity preserved
    Tool: Bash
    Preconditions: .sisyphus/drafts/ contains exactly 8 files, infra/ does not exist
    Steps:
      1. Run: mkdir -p infra/templates
      2. Capture pre-checksums (see "What to do")
      3. Move all 8 files individually
      4. Capture post-checksums
      5. Run: diff <(awk '{print $NF}' .sisyphus/evidence/task-1-pre-move-checksums.txt) <(awk '{print $NF}' .sisyphus/evidence/task-1-post-move-checksums.txt)
      6. Run: ls infra/templates/ | sort
      7. Run: ls .sisyphus/drafts/ | wc -l
    Expected Result: diff returns empty (exit 0), ls returns 8 files in alphabetical order, drafts count returns 0
    Failure Indicators: diff shows any output, ls shows <8 or >8 files, drafts still has files
    Evidence: .sisyphus/evidence/task-1-happy-path.txt (all command outputs)

  Scenario: Failure — infra/templates/ already has a file with same name
    Tool: Bash
    Preconditions: infra/templates/docker-compose-template.yml already exists (unlikely but possible)
    Steps:
      1. Run: mv .sisyphus/drafts/docker-compose-template.yml infra/templates/
      2. Assert: if file exists, mv will overwrite without warning by default
      3. Mitigation: Check target before move: `[ -e infra/templates/docker-compose-template.yml ] && echo "CONFLICT: ABORT" || mv ...`
    Expected Result: Pre-check detects conflict and aborts; OR (if no conflict) move succeeds
    Evidence: .sisyphus/evidence/task-1-conflict-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-pre-move-checksums.txt`
  - [ ] `.sisyphus/evidence/task-1-post-move-checksums.txt`
  - [ ] `.sisyphus/evidence/task-1-happy-path.txt`

  **Commit**: NO (grouped into T9)

- [x] 2. Update `.gitignore` to exclude `.sisyphus/drafts/`

  **What to do**:
  - Read current `.gitignore` to find the `.sisyphus/` section (should contain `.sisyphus/boulder.json` and `.sisyphus/evidence/`)
  - Add `.sisyphus/drafts/` entry adjacent to the existing `.sisyphus/` entries (same section, not at end of file)
  - Preserve the existing comment: `# Sisyphus internal state (plans are tracked, boulder state is not)`
  - Optionally update the comment to: `# Sisyphus internal state (plans and notepads are tracked, boulder state / evidence / drafts are not)`
  - Verify git no longer shows `.sisyphus/drafts/` as untracked after save

  **Must NOT do**:
  - Do NOT reorder or delete other `.gitignore` entries
  - Do NOT add `.sisyphus/drafts/` at the end of the file (breaks readability grouping)
  - Do NOT remove the existing comment
  - Do NOT run `git add` in this task — staging happens in T9

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file edit, trivial verification
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed for gitignore edit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3)
  - **Blocks**: T9 (needs gitignore ready for commit)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.gitignore` lines 1-34 — Current content, specifically the `.sisyphus/` section with `boulder.json` and `evidence/` entries

  **WHY Each Reference Matters**:
  - The existing section establishes the style: indented comment + entries grouped together. New entry must match.

  **Acceptance Criteria**:
  - [ ] `grep -n "sisyphus/drafts" .gitignore` returns exactly 1 line with the entry
  - [ ] `grep -B1 "sisyphus/drafts" .gitignore` shows the entry is adjacent to `.sisyphus/` section (either `boulder.json` or `evidence/` on neighboring line)
  - [ ] `git status --short | grep "sisyphus/drafts"` returns empty (no output) — git respects the new ignore
  - [ ] `.gitignore` line count unchanged except for +1 new line (or +2 if comment updated)

  **QA Scenarios**:

  ```
  Scenario: Happy path — gitignore entry added and respected
    Tool: Bash
    Preconditions: .gitignore exists and contains the .sisyphus/ section; .sisyphus/drafts/ is empty (from T1) or non-existent
    Steps:
      1. Read .gitignore to find the section with `.sisyphus/boulder.json` and `.sisyphus/evidence/`
      2. Insert `.sisyphus/drafts/` immediately after those entries
      3. Save file
      4. Run: grep -n "sisyphus/drafts" .gitignore
      5. Run: git status --short | grep -c "sisyphus/drafts" || echo "0"
    Expected Result: grep shows the new line, git status count is 0
    Evidence: .sisyphus/evidence/task-2-gitignore-update.txt

  Scenario: Negative — .sisyphus/drafts/ NOT hidden from git status
    Tool: Bash
    Preconditions: .gitignore entry added BUT drafts/ not actually empty
    Steps:
      1. (Test scenario — if T1 failed and drafts/ still has files, gitignore alone won't help since the files would already be staged if previously tracked; but they're untracked, so gitignore should still hide them)
      2. Run: git status --short | grep "sisyphus/drafts" || echo "CORRECTLY HIDDEN"
    Expected Result: "CORRECTLY HIDDEN" printed
    Evidence: .sisyphus/evidence/task-2-hidden-verification.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-gitignore-update.txt`
  - [ ] `.sisyphus/evidence/task-2-hidden-verification.txt`

  **Commit**: NO (grouped into T9)

- [x] 3. Delete 2 empty files in `.sisyphus/notepads/phase8-e2e/`

  **What to do**:
  - Verify both files are truly 0 bytes: `stat -f "%z %N" .sisyphus/notepads/phase8-e2e/decisions.md .sisyphus/notepads/phase8-e2e/issues.md`
  - Delete: `rm .sisyphus/notepads/phase8-e2e/decisions.md .sisyphus/notepads/phase8-e2e/issues.md`
  - Verify only `learnings.md` remains: `ls .sisyphus/notepads/phase8-e2e/`

  **Must NOT do**:
  - Do NOT delete `learnings.md` (it's the modified file being committed in T6)
  - Do NOT use `rm -rf` — use explicit file paths
  - Do NOT delete if files have non-zero size (stat check must show 0 bytes first)
  - Do NOT run `git add` or `git rm` — files are untracked, plain `rm` is correct

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial deletion
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: T5 (T5 is the commit that records the deletion, though since files were never tracked, there's nothing to commit — T5 becomes a no-op; see T5 for details)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.sisyphus/notepads/phase8-e2e/` — Contains 3 files: learnings.md (tracked, modified), decisions.md (untracked, 0B), issues.md (untracked, 0B)

  **WHY Each Reference Matters**:
  - Both empty files are untracked (never committed). Deleting them removes them from the working tree entirely — no git operation needed.

  **Acceptance Criteria**:
  - [ ] `stat -f "%z" .sisyphus/notepads/phase8-e2e/decisions.md 2>/dev/null` returns nothing (file gone)
  - [ ] `stat -f "%z" .sisyphus/notepads/phase8-e2e/issues.md 2>/dev/null` returns nothing (file gone)
  - [ ] `ls .sisyphus/notepads/phase8-e2e/` returns exactly `learnings.md`
  - [ ] `git status --short | grep -E "phase8-e2e/(decisions|issues)"` returns empty

  **QA Scenarios**:

  ```
  Scenario: Happy path — both empty files deleted
    Tool: Bash
    Preconditions: Both files exist and are 0 bytes; learnings.md exists (non-empty)
    Steps:
      1. Run: stat -f "%z %N" .sisyphus/notepads/phase8-e2e/decisions.md .sisyphus/notepads/phase8-e2e/issues.md
      2. Verify both return 0 as size
      3. Run: rm .sisyphus/notepads/phase8-e2e/decisions.md .sisyphus/notepads/phase8-e2e/issues.md
      4. Run: ls .sisyphus/notepads/phase8-e2e/
    Expected Result: stat shows both at 0 bytes, rm succeeds, ls shows only learnings.md
    Evidence: .sisyphus/evidence/task-3-delete-empty.txt

  Scenario: Safety — files are NOT empty (should abort)
    Tool: Bash
    Preconditions: Somehow decisions.md or issues.md has content
    Steps:
      1. Run: [ -s .sisyphus/notepads/phase8-e2e/decisions.md ] && echo "ABORT: decisions.md has content" || echo "SAFE: decisions.md empty"
      2. Run same for issues.md
      3. Only proceed with rm if both return SAFE
    Expected Result: Both return SAFE; if either returns ABORT, task STOPS and reports
    Evidence: .sisyphus/evidence/task-3-safety-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-delete-empty.txt`
  - [ ] `.sisyphus/evidence/task-3-safety-check.txt`

  **Commit**: NO — files were never tracked, nothing to commit (T5 is a no-op placeholder)

- [x] 4. Update `.sisyphus/plans/shared-supabase-infra.md` to reference `infra/templates/` instead of `.sisyphus/drafts/`

  **What to do**:
  - Read the plan to identify all `.sisyphus/drafts/` references (approx 15 occurrences on lines 243, 280, 283, 293, 301, 392-399 per Metis grep)
  - Perform TWO-PASS replacement:
    - **Pass 1 (absolute paths)**: Replace `/Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/drafts/` with `infra/templates/` (normalizes to repo-relative)
    - **Pass 2 (relative paths)**: Replace `.sisyphus/drafts/` with `infra/templates/` (remaining relative refs)
  - Verify no `.sisyphus/drafts/` references remain: `grep -c "sisyphus/drafts" .sisyphus/plans/shared-supabase-infra.md` must return 0
  - Verify new references exist: `grep -c "infra/templates" .sisyphus/plans/shared-supabase-infra.md` must return ≥8

  **Must NOT do**:
  - Do NOT modify any OTHER plan file (the 4 historical plans with dead links are intentionally left alone)
  - Do NOT change any content beyond the path replacements (no "improvements" to surrounding text)
  - Do NOT use `sed -i` without a backup extension on macOS (incompatible syntax); use `sed -i '' 's/...//'` or manual Edit
  - Do NOT run `git add` — staging happens in T9

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure string replacement in a single file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4b)
  - **Parallel Group**: Wave 2 (with T4b)
  - **Blocks**: T9 (infra commit needs plan ready)
  - **Blocked By**: T1 (templates must be at new location first — though technically the plan edit doesn't depend on the physical move, the commit in T9 bundles them together)

  **References**:

  **Pattern References**:
  - `.sisyphus/plans/shared-supabase-infra.md` lines 243, 280, 283, 293, 301, 392-399 — All `.sisyphus/drafts/` references (verified via grep during investigation)
  - Specifically at line 243: `/Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/drafts/docker-compose-template.yml` (ABSOLUTE — needs two-pass handling)

  **WHY Each Reference Matters**:
  - The mix of absolute and relative paths means a single sed pass will leave the absolute path prefix intact (`/Users/victordozal/repos/dozal-devs/ai-employee/`). Two-pass replacement handles both.
  - This is a historical/closed plan, but references should still resolve for anyone reviewing it later.

  **Acceptance Criteria**:
  - [ ] `grep -c "sisyphus/drafts" .sisyphus/plans/shared-supabase-infra.md` returns `0`
  - [ ] `grep -c "/Users/victordozal/repos/dozal-devs/ai-employee/infra/templates" .sisyphus/plans/shared-supabase-infra.md` returns `0` (no absolute paths leaked)
  - [ ] `grep -c "infra/templates/" .sisyphus/plans/shared-supabase-infra.md` returns `≥8`
  - [ ] `git diff .sisyphus/plans/shared-supabase-infra.md | grep "^-" | grep "sisyphus/drafts" | wc -l` shows removed lines with drafts refs
  - [ ] `git diff .sisyphus/plans/shared-supabase-infra.md | grep "^+" | grep "infra/templates" | wc -l` shows added lines with new refs

  **QA Scenarios**:

  ```
  Scenario: Happy path — all 15 references updated
    Tool: Bash
    Preconditions: .sisyphus/plans/shared-supabase-infra.md has ~15 .sisyphus/drafts/ references (mix of abs + rel)
    Steps:
      1. Capture baseline count: grep -c "sisyphus/drafts" .sisyphus/plans/shared-supabase-infra.md > .sisyphus/evidence/task-4-before.txt
      2. Pass 1 replace absolute: sed -i '' 's|/Users/victordozal/repos/dozal-devs/ai-employee/.sisyphus/drafts/|infra/templates/|g' .sisyphus/plans/shared-supabase-infra.md
      3. Pass 2 replace relative: sed -i '' 's|.sisyphus/drafts/|infra/templates/|g' .sisyphus/plans/shared-supabase-infra.md
      4. Verify: grep -c "sisyphus/drafts" .sisyphus/plans/shared-supabase-infra.md > .sisyphus/evidence/task-4-after.txt
      5. Verify new refs: grep -c "infra/templates" .sisyphus/plans/shared-supabase-infra.md >> .sisyphus/evidence/task-4-after.txt
    Expected Result: before.txt shows ~15, after.txt shows 0 drafts refs and ≥8 infra/templates refs
    Failure Indicators: after.txt shows >0 drafts refs, or infra/templates count < 8
    Evidence: .sisyphus/evidence/task-4-before.txt, .sisyphus/evidence/task-4-after.txt, .sisyphus/evidence/task-4-diff.txt (git diff)

  Scenario: Validation — diff shows only path replacements, no other content changes
    Tool: Bash
    Preconditions: sed has been run
    Steps:
      1. Run: git diff .sisyphus/plans/shared-supabase-infra.md > .sisyphus/evidence/task-4-diff.txt
      2. Inspect: every `-` line should have `.sisyphus/drafts/` and every `+` line should have `infra/templates/`
      3. Run: grep -c "^-.*sisyphus/drafts" .sisyphus/evidence/task-4-diff.txt
      4. Run: grep -c "^+.*infra/templates" .sisyphus/evidence/task-4-diff.txt
      5. Both counts should be approximately equal
    Expected Result: Counts match (removed drafts refs equal added infra/templates refs)
    Evidence: .sisyphus/evidence/task-4-diff.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-before.txt`
  - [ ] `.sisyphus/evidence/task-4-after.txt`
  - [ ] `.sisyphus/evidence/task-4-diff.txt`

  **Commit**: NO (grouped into T9)

- [x] 4b. Create `infra/templates/README.md` explaining the directory's purpose

  **What to do**:
  - Create a 10-20 line README.md at `infra/templates/README.md`
  - Content should explain:
    - Purpose: "Shared Supabase Docker Compose infrastructure templates for spinning up new projects"
    - Contents: list of the 8 files and what each is for (compose template, per-project env examples, per-project grants SQL)
    - Origin: "Generated as part of the shared-supabase-infra plan (see `.sisyphus/plans/shared-supabase-infra.md`)"
    - Usage: "Copy the relevant files to the target project, customize env.example with project-specific values, run grants.sql against the new database"
  - Do NOT include secrets or credentials in the README
  - Do NOT include AI tool references

  **Must NOT do**:
  - Do NOT add emojis (per AGENTS.md)
  - Do NOT write more than 25 lines (keep it concise)
  - Do NOT reference the 4 historical plans (dead links)
  - Do NOT run `git add` — staging happens in T9

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation file — writing category matches domain
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `v-mermaid`: No diagrams needed in a README this short

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4)
  - **Parallel Group**: Wave 2 (with T4)
  - **Blocks**: T9
  - **Blocked By**: T1 (needs `infra/templates/` to exist)

  **References**:

  **Pattern References**:
  - `.sisyphus/plans/shared-supabase-infra.md` — For context on why these templates exist and what each file does
  - `infra/templates/docker-compose-template.yml` (from T1) — The main artifact; README should describe it
  - `AGENTS.md` — Project conventions (no emojis, no AI references, markdown naming)

  **WHY Each Reference Matters**:
  - Future developers opening `infra/templates/` will need to know what these files are for. Without a README, the directory's existence is a mystery.

  **Acceptance Criteria**:
  - [ ] `infra/templates/README.md` exists
  - [ ] `wc -l infra/templates/README.md` returns between 10 and 25
  - [ ] `grep -i "emoji" infra/templates/README.md || echo "clean"` returns "clean"
  - [ ] `grep -E "(claude|opencode|AI|chatgpt|gpt|anthropic)" infra/templates/README.md -i || echo "clean"` returns "clean"
  - [ ] README mentions all 8 files by name (verify with `grep -c "docker-compose-template.yml\|env-.*\.example\|_grants\.sql" infra/templates/README.md` — should be ≥3 mentions at minimum)
  - [ ] README has a "Purpose" section and a "Usage" section (grep for these headings)

  **QA Scenarios**:

  ```
  Scenario: Happy path — README exists and is well-formed
    Tool: Bash
    Preconditions: infra/templates/ directory exists from T1
    Steps:
      1. Verify: ls infra/templates/README.md
      2. Verify line count: wc -l infra/templates/README.md
      3. Verify no emojis: grep -P "[\x{1F300}-\x{1F9FF}]" infra/templates/README.md || echo "clean"
      4. Verify no AI refs: grep -iE "(claude|opencode|chatgpt|AI-generated|anthropic)" infra/templates/README.md || echo "clean"
      5. Verify structure: grep -E "^#{1,3} " infra/templates/README.md | head -5
    Expected Result: File exists, 10-25 lines, no emojis, no AI refs, has markdown headings
    Evidence: .sisyphus/evidence/task-4b-readme-verify.txt

  Scenario: Content coverage — all 8 files mentioned
    Tool: Bash
    Preconditions: README written
    Steps:
      1. For each file name, grep README: for f in docker-compose-template env-ai-employee env-fetched-pets env-nexus-stack env-vlre-hub fetched_pets_grants nexus_stack_grants vlre_hub_grants; do grep -c "$f" infra/templates/README.md; done
    Expected Result: Each file mentioned at least once (count ≥1 per file), OR documented collectively (e.g., "8 environment templates")
    Evidence: .sisyphus/evidence/task-4b-coverage.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4b-readme-verify.txt`
  - [ ] `.sisyphus/evidence/task-4b-coverage.txt`

  **Commit**: NO (grouped into T9)

- [x] 5. (No-op) Confirm empty file deletion — no commit needed

  **What to do**:
  - Verify that T3 deleted the files (they were untracked; no git operation required)
  - Run: `git status --short | grep -E "phase8-e2e/(decisions|issues)"` — expected empty
  - Run: `ls .sisyphus/notepads/phase8-e2e/` — expected: only `learnings.md`
  - Record that this task is intentionally a no-op (files were never tracked, so deletion doesn't need a commit)
  - Write a 1-line note to `.sisyphus/evidence/task-5-noop.txt` documenting that T5 is intentionally skipped

  **Must NOT do**:
  - Do NOT create a commit for this task (nothing to commit)
  - Do NOT run `git rm` (files were never tracked)
  - Do NOT re-run the deletion (T3 already did it)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only — no substantive work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must be first in Wave 3 to establish the clean state before subsequent commits)
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: T6
  - **Blocked By**: T3

  **References**:

  **Pattern References**:
  - `.sisyphus/notepads/phase8-e2e/` directory after T3 execution

  **WHY Each Reference Matters**:
  - The plan originally anticipated a deletion commit here, but since the files were never tracked, `git rm` is unnecessary and would fail. This task documents that.

  **Acceptance Criteria**:
  - [ ] `ls .sisyphus/notepads/phase8-e2e/` returns exactly `learnings.md`
  - [ ] `git status --short | grep -E "phase8-e2e/(decisions|issues)"` returns empty
  - [ ] `.sisyphus/evidence/task-5-noop.txt` exists with explanatory note

  **QA Scenarios**:

  ```
  Scenario: Happy path — T3's deletion is confirmed, no commit needed
    Tool: Bash
    Preconditions: T3 has already deleted the 2 empty files
    Steps:
      1. Run: ls .sisyphus/notepads/phase8-e2e/ > .sisyphus/evidence/task-5-noop.txt
      2. Run: echo "T5 is intentionally a no-op: the deleted files (.sisyphus/notepads/phase8-e2e/decisions.md and issues.md) were never tracked, so no git commit is needed." >> .sisyphus/evidence/task-5-noop.txt
      3. Run: git status --short | grep -E "phase8-e2e/(decisions|issues)" && echo "FAIL: still visible" || echo "OK: files gone"
    Expected Result: ls shows only learnings.md, evidence file documents the no-op, git status confirms files are gone
    Evidence: .sisyphus/evidence/task-5-noop.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-noop.txt`

  **Commit**: NO — intentional no-op (files were never tracked)

- [x] 6. Commit: notepad catchup (modified learnings.md + 5 new notepad directories)

  **What to do**:
  - Stage the modified file EXPLICITLY: `git add .sisyphus/notepads/phase8-e2e/learnings.md`
  - Stage each new notepad directory EXPLICITLY (not `git add .`):
    - `git add .sisyphus/notepads/hybrid-local-flyio-workers/`
    - `git add .sisyphus/notepads/phase7-resilience/`
    - `git add .sisyphus/notepads/seed-unify-slim-compose/`
    - `git add .sisyphus/notepads/shared-supabase-infra/`
    - `git add .sisyphus/notepads/supabase-setup-reliability/`
  - Verify staging: `git status --short | grep -v "^??"` (should show the modified file + all new notepad files; confirm NO `infra/templates/`, plans, docs, or test payloads are staged)
  - Commit: `git commit -m "chore(notepads): track work notes from phase7, phase8, and recent plans"`
  - Verify: `git show --stat HEAD` — must show exactly the modified learnings.md + 12 new notepad files (3 hybrid + 3 phase7 + 4 seed-unify + 1 shared-supabase + 1 supabase-setup = 12 new + 1 modified = 13 files)

  **Must NOT do**:
  - Do NOT use `git add .` or `git add -A` or `git add .sisyphus/notepads/` without the trailing slash
  - Do NOT stage any plan files in this commit (T7 handles them)
  - Do NOT stage `infra/templates/`, `docs/`, or `test-payloads/`
  - Do NOT include `Co-authored-by` lines
  - Do NOT reference AI tools in the commit message
  - Do NOT use `--no-verify`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Targeted git staging + commit
  - **Skills**: [`git-master`]
    - `git-master`: Ensures atomic commit discipline, explicit staging, correct message format

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential in Wave 3)
  - **Parallel Group**: Wave 3 (after T5)
  - **Blocks**: T7
  - **Blocked By**: T5

  **References**:

  **Pattern References**:
  - `.sisyphus/notepads/` directory structure — mix of tracked (phase1-foundation, phase3-inngest-core, phase8-e2e/learnings.md, architecture-doc-update) and untracked
  - Existing commit message style in recent git log (e.g., `428df63`, `a44c9b5`) — uses `chore(scope):` convention

  **WHY Each Reference Matters**:
  - The existing notepads establish that notepads ARE tracked. The new commit continues this convention.
  - Commit message must match repo style to pass F2 review.

  **Acceptance Criteria**:
  - [ ] `git log -1 --format="%s"` returns `chore(notepads): track work notes from phase7, phase8, and recent plans`
  - [ ] `git show --stat HEAD | grep -c "^ .*notepads/"` returns ≥12 (notepad files)
  - [ ] `git show --stat HEAD | grep -v "notepads/" | grep -E "\\.(md|ts|js|yml|sql|json)"` returns empty (no non-notepad files leaked)
  - [ ] `git log -1 --format="%b"` does NOT contain "Co-authored-by"
  - [ ] `git log -1 --format="%b"` does NOT contain "claude|opencode|AI|anthropic" (case-insensitive)

  **QA Scenarios**:

  ```
  Scenario: Happy path — only notepad files in commit
    Tool: Bash
    Preconditions: Wave 1 and Wave 2 complete; no staged files; T5 complete
    Steps:
      1. Run: git status --short > .sisyphus/evidence/task-6-pre-status.txt
      2. Run: git add .sisyphus/notepads/phase8-e2e/learnings.md
      3. Run: git add .sisyphus/notepads/hybrid-local-flyio-workers/ .sisyphus/notepads/phase7-resilience/ .sisyphus/notepads/seed-unify-slim-compose/ .sisyphus/notepads/shared-supabase-infra/ .sisyphus/notepads/supabase-setup-reliability/
      4. Run: git diff --cached --stat > .sisyphus/evidence/task-6-staged.txt
      5. Verify only notepads staged: grep -v "notepads/" .sisyphus/evidence/task-6-staged.txt | grep -E "\\.(md|ts|js)" && echo "FAIL: non-notepad leaked" || echo "OK"
      6. Run: git commit -m "chore(notepads): track work notes from phase7, phase8, and recent plans"
      7. Run: git show --stat HEAD > .sisyphus/evidence/task-6-commit.txt
    Expected Result: Only notepad files in staged/commit output; commit message matches; no leaks
    Evidence: .sisyphus/evidence/task-6-pre-status.txt, task-6-staged.txt, task-6-commit.txt

  Scenario: Failure — accidentally staged non-notepad file
    Tool: Bash
    Preconditions: User ran `git add .` by mistake
    Steps:
      1. Run: git diff --cached --name-only | grep -v "notepads/"
      2. If any output: git reset HEAD and restart with explicit staging
    Expected Result: Task fails safely with rollback instructions
    Evidence: .sisyphus/evidence/task-6-safety.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-6-pre-status.txt`
  - [ ] `.sisyphus/evidence/task-6-staged.txt`
  - [ ] `.sisyphus/evidence/task-6-commit.txt`

  **Commit**: YES
  - Message: `chore(notepads): track work notes from phase7, phase8, and recent plans`
  - Files: `.sisyphus/notepads/phase8-e2e/learnings.md` (modified) + 5 new notepad directories
  - Pre-commit: `git diff --cached --stat | grep -v "notepads/"` must show no leaked files

- [ ] 7. Commit: plan catchup (13 untracked plans)

  **What to do**:
  - Stage ALL 13 plan files EXPLICITLY (no glob, no `git add .sisyphus/plans/`):
    - `git add .sisyphus/plans/2026-03-30-1624-phase6-completion-delivery.md`
    - `git add .sisyphus/plans/2026-03-31-1414-phase7-resilience.md`
    - `git add .sisyphus/plans/2026-04-01-0812-phase8-e2e.md`
    - `git add .sisyphus/plans/2026-04-01-1951-docs-and-dx.md`
    - `git add .sisyphus/plans/2026-04-01-2354-supabase-docker-compose.md`
    - `git add .sisyphus/plans/2026-04-02-1115-doc-accuracy-fixes.md`
    - `git add .sisyphus/plans/2026-04-02-1456-session-monitor-robustness.md`
    - `git add .sisyphus/plans/2026-04-02-2125-trigger-task-rich-progress.md`
    - `git add .sisyphus/plans/hybrid-local-flyio-workers.md`
    - `git add .sisyphus/plans/seed-unify-slim-compose.md`
    - `git add .sisyphus/plans/shared-supabase-infra.md` — **WARNING**: this file was modified in T4; ensure the modified version is staged, not a pristine version
    - `git add .sisyphus/plans/supabase-docs-cleanup.md`
    - `git add .sisyphus/plans/supabase-setup-reliability.md`
  - Verify staging: `git diff --cached --stat` must show exactly 13 files, all in `.sisyphus/plans/`
  - **CRITICAL**: `shared-supabase-infra.md` was modified in T4. T4's changes should be included in THIS commit (T7), not T9. This means the T4 plan reference update is bundled with plan catchup, not with the infra move. **REVISION NEEDED — see note below.**
  - Commit: `git commit -m "chore(plans): track accumulated plans from phase6 through hybrid-flyio-workers"`
  - Verify: `git show --stat HEAD | grep -c "^ .sisyphus/plans/"` returns 13

  > **Note on T4 / T7 / T9 coordination**: Since `shared-supabase-infra.md` is currently UNTRACKED (not yet committed) AND will be modified in T4, the "modification" is really the initial-tracked version of the file. Staging the file in T7 captures its post-T4 state as the first commit. This means **T4's updates land in T7's commit**, not T9's. T9 will then only handle `infra/templates/` + `.gitignore`. This is cleaner than splitting the plan's initial state across two commits.

  **Must NOT do**:
  - Do NOT use `git add .sisyphus/plans/` (glob) — always explicit paths
  - Do NOT stage the 4 historical plans that already exist in git (they are not in the untracked list)
  - Do NOT stage any notepad files, infra files, docs, or test payloads
  - Do NOT include `Co-authored-by` or AI references in commit message
  - Do NOT use `--no-verify`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Explicit staging discipline, commit message convention

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential in Wave 3)
  - **Parallel Group**: Wave 3 (after T6)
  - **Blocks**: T8
  - **Blocked By**: T6, T4 (shared-supabase-infra.md must be updated first)

  **References**:

  **Pattern References**:
  - `.sisyphus/plans/` — Contains mix of tracked (11 files) and untracked (13 files) plans
  - Recent commits `chore(plans):` style — convention for plan tracking commits

  **WHY Each Reference Matters**:
  - 13 plans is the exact count; F4 will verify this exact count in the commit

  **Acceptance Criteria**:
  - [ ] `git log -1 --format="%s"` returns `chore(plans): track accumulated plans from phase6 through hybrid-flyio-workers`
  - [ ] `git show --stat HEAD | grep -c "^ .sisyphus/plans/"` returns exactly `13`
  - [ ] `git show --stat HEAD | grep -v ".sisyphus/plans/" | grep -E "\\.(md|ts|js|yml)"` returns empty (no leaks)
  - [ ] `git show HEAD -- .sisyphus/plans/shared-supabase-infra.md | grep -c "infra/templates"` returns ≥8 (T4's updates are captured)
  - [ ] `git show HEAD -- .sisyphus/plans/shared-supabase-infra.md | grep -c "sisyphus/drafts"` returns 0
  - [ ] `git log -1 --format="%b"` does NOT contain "Co-authored-by" or AI references

  **QA Scenarios**:

  ```
  Scenario: Happy path — all 13 plans committed with T4 updates included
    Tool: Bash
    Preconditions: T6 committed; T4 has updated shared-supabase-infra.md; all 13 plan files are untracked
    Steps:
      1. Run each explicit git add for the 13 plans
      2. Run: git diff --cached --stat > .sisyphus/evidence/task-7-staged.txt
      3. Verify count: git diff --cached --name-only | grep -c "^.sisyphus/plans/"
      4. Verify exclusivity: git diff --cached --name-only | grep -v "^.sisyphus/plans/" && echo "FAIL: non-plan file staged" || echo "OK"
      5. Run: git commit -m "chore(plans): track accumulated plans from phase6 through hybrid-flyio-workers"
      6. Run: git show --stat HEAD > .sisyphus/evidence/task-7-commit.txt
      7. Verify T4 content in commit: git show HEAD -- .sisyphus/plans/shared-supabase-infra.md | grep "infra/templates" | head -5
    Expected Result: Exactly 13 plan files committed, shared-supabase-infra.md contains infra/templates references (T4's updates present)
    Evidence: .sisyphus/evidence/task-7-staged.txt, task-7-commit.txt

  Scenario: Content fidelity — T4 updates preserved in commit
    Tool: Bash
    Preconditions: T7 commit made
    Steps:
      1. Run: git show HEAD -- .sisyphus/plans/shared-supabase-infra.md > .sisyphus/evidence/task-7-content-check.txt
      2. Run: grep -c "infra/templates" .sisyphus/evidence/task-7-content-check.txt
      3. Run: grep -c "sisyphus/drafts" .sisyphus/evidence/task-7-content-check.txt
    Expected Result: infra/templates count ≥8, sisyphus/drafts count = 0
    Evidence: .sisyphus/evidence/task-7-content-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-7-staged.txt`
  - [ ] `.sisyphus/evidence/task-7-commit.txt`
  - [ ] `.sisyphus/evidence/task-7-content-check.txt`

  **Commit**: YES
  - Message: `chore(plans): track accumulated plans from phase6 through hybrid-flyio-workers`
  - Files: 13 plan files (including T4-updated `shared-supabase-infra.md`)
  - Pre-commit: Verify exactly 13 files staged, all in `.sisyphus/plans/`

- [ ] 8. Commit: hybrid mode current-state documentation

  **What to do**:
  - Stage the single new doc EXPLICITLY: `git add docs/2026-04-07-1732-hybrid-mode-current-state.md`
  - Verify staging: `git diff --cached --stat` must show exactly 1 file
  - Commit: `git commit -m "docs: add hybrid mode current-state system overview"`
  - Verify: `git show --stat HEAD` — must show exactly 1 file in docs/

  **Must NOT do**:
  - Do NOT stage any other docs (there shouldn't be any untracked docs, but verify)
  - Do NOT stage any plans, notepads, templates, or test payloads
  - Do NOT include `Co-authored-by` or AI references in commit message
  - Do NOT use `--no-verify`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential in Wave 3)
  - **Parallel Group**: Wave 3 (after T7)
  - **Blocks**: T9
  - **Blocked By**: T7

  **References**:

  **Pattern References**:
  - `docs/` directory — Contains existing tracked docs following `YYYY-MM-DD-HHMM-*.md` convention
  - `docs/2026-04-06-2205-cloud-migration-roadmap.md` — Sibling doc in same format

  **WHY Each Reference Matters**:
  - The new doc follows existing docs convention exactly; commit should just track it without fanfare

  **Acceptance Criteria**:
  - [ ] `git log -1 --format="%s"` returns `docs: add hybrid mode current-state system overview`
  - [ ] `git show --stat HEAD | grep -c "^ docs/2026-04-07-1732-hybrid-mode-current-state.md"` returns `1`
  - [ ] `git show --stat HEAD | grep -v "docs/2026-04-07-1732-hybrid-mode-current-state.md" | grep -E "\\.(md|ts|js|yml|sql|json)"` returns empty (no leaks)
  - [ ] `git log -1 --format="%b"` does NOT contain "Co-authored-by" or AI references
  - [ ] Doc is ~788 lines (matches what was created this session): `git show HEAD:docs/2026-04-07-1732-hybrid-mode-current-state.md | wc -l`

  **QA Scenarios**:

  ```
  Scenario: Happy path — doc committed cleanly
    Tool: Bash
    Preconditions: T7 committed; doc is untracked
    Steps:
      1. Run: git add docs/2026-04-07-1732-hybrid-mode-current-state.md
      2. Run: git diff --cached --stat > .sisyphus/evidence/task-8-staged.txt
      3. Verify exactly 1 file staged
      4. Run: git commit -m "docs: add hybrid mode current-state system overview"
      5. Run: git show --stat HEAD > .sisyphus/evidence/task-8-commit.txt
    Expected Result: 1 file in commit, matches doc path, no leaks
    Evidence: .sisyphus/evidence/task-8-staged.txt, task-8-commit.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-8-staged.txt`
  - [ ] `.sisyphus/evidence/task-8-commit.txt`

  **Commit**: YES
  - Message: `docs: add hybrid mode current-state system overview`
  - Files: `docs/2026-04-07-1732-hybrid-mode-current-state.md`
  - Pre-commit: Verify exactly 1 file staged

- [ ] 9. Commit: infra templates relocation + gitignore drafts

  **What to do**:
  - Stage the new `infra/templates/` directory EXPLICITLY:
    - `git add infra/templates/docker-compose-template.yml`
    - `git add infra/templates/env-ai-employee.example`
    - `git add infra/templates/env-fetched-pets.example`
    - `git add infra/templates/env-nexus-stack.example`
    - `git add infra/templates/env-vlre-hub.example`
    - `git add infra/templates/fetched_pets_grants.sql`
    - `git add infra/templates/nexus_stack_grants.sql`
    - `git add infra/templates/vlre_hub_grants.sql`
    - `git add infra/templates/README.md`
  - Stage the modified `.gitignore` EXPLICITLY: `git add .gitignore`
  - Verify staging: `git diff --cached --stat` must show exactly 10 files (9 in infra/templates/ + .gitignore)
  - Verify NO plan files are staged (shared-supabase-infra.md was handled in T7): `git diff --cached --name-only | grep "plans/" && echo "LEAK" || echo "OK"`
  - Commit: `git commit -m "chore(infra): relocate compose templates to infra/templates and gitignore drafts"`
  - Verify: `git show --stat HEAD` shows exactly 10 files

  **Must NOT do**:
  - Do NOT stage `.sisyphus/plans/shared-supabase-infra.md` (already committed in T7)
  - Do NOT stage any other files
  - Do NOT use `git add infra/` (glob) — always explicit paths
  - Do NOT include `Co-authored-by` or AI references in commit message
  - Do NOT use `--no-verify`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential in Wave 3)
  - **Parallel Group**: Wave 3 (after T8)
  - **Blocks**: T10
  - **Blocked By**: T8, T1, T2, T4b (needs template files, gitignore edit, README)

  **References**:

  **Pattern References**:
  - `infra/templates/` directory (from T1 + T4b) — All 9 files ready for staging
  - `.gitignore` (from T2) — Updated with drafts entry

  **WHY Each Reference Matters**:
  - This commit is the "infra move" topic: relocation + README + gitignore as a cohesive change
  - Plan update (T4) is intentionally NOT here because it was committed in T7 as part of the plan's initial-tracked state

  **Acceptance Criteria**:
  - [ ] `git log -1 --format="%s"` returns `chore(infra): relocate compose templates to infra/templates and gitignore drafts`
  - [ ] `git show --stat HEAD | grep -c "^ infra/templates/"` returns `9`
  - [ ] `git show --stat HEAD | grep -c "^ .gitignore"` returns `1`
  - [ ] `git show --stat HEAD | wc -l` shows 10 file lines + summary line
  - [ ] `git show HEAD -- .gitignore | grep "^+" | grep "sisyphus/drafts"` returns at least 1 line (the added entry)
  - [ ] `git log -1 --format="%b"` does NOT contain "Co-authored-by" or AI references

  **QA Scenarios**:

  ```
  Scenario: Happy path — infra + gitignore committed, no plan leak
    Tool: Bash
    Preconditions: T8 committed; infra/templates/ has 9 files; .gitignore is edited
    Steps:
      1. Run each explicit git add (9 files in infra/templates/ + .gitignore)
      2. Run: git diff --cached --stat > .sisyphus/evidence/task-9-staged.txt
      3. Verify file count: git diff --cached --name-only | wc -l  (expected: 10)
      4. Verify no plan leaks: git diff --cached --name-only | grep "plans/" && echo "LEAK" || echo "OK"
      5. Run: git commit -m "chore(infra): relocate compose templates to infra/templates and gitignore drafts"
      6. Run: git show --stat HEAD > .sisyphus/evidence/task-9-commit.txt
    Expected Result: 10 files in commit (9 infra + gitignore); no leaks
    Evidence: .sisyphus/evidence/task-9-staged.txt, task-9-commit.txt

  Scenario: Verification — drafts/ entry actually added to gitignore
    Tool: Bash
    Preconditions: T9 commit made
    Steps:
      1. Run: git show HEAD -- .gitignore > .sisyphus/evidence/task-9-gitignore-diff.txt
      2. Verify + line: grep "^+" .sisyphus/evidence/task-9-gitignore-diff.txt | grep "sisyphus/drafts"
    Expected Result: At least 1 "+" line containing ".sisyphus/drafts/"
    Evidence: .sisyphus/evidence/task-9-gitignore-diff.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-9-staged.txt`
  - [ ] `.sisyphus/evidence/task-9-commit.txt`
  - [ ] `.sisyphus/evidence/task-9-gitignore-diff.txt`

  **Commit**: YES
  - Message: `chore(infra): relocate compose templates to infra/templates and gitignore drafts`
  - Files: 9 files in `infra/templates/` + `.gitignore`
  - Pre-commit: Verify exactly 10 files staged; no plan files leaked

- [ ] 10. Commit: test payload fixture

  **What to do**:
  - Stage the single new test payload EXPLICITLY: `git add test-payloads/jira-realistic-task-103.json`
  - Verify staging: `git diff --cached --stat` must show exactly 1 file
  - Commit: `git commit -m "test: add jira-realistic-task-103 payload for E2E fixtures"`
  - Verify: `git show --stat HEAD` shows exactly 1 file

  **Must NOT do**:
  - Do NOT stage any other files (working tree should be completely clean after this)
  - Do NOT use `git add test-payloads/` (glob)
  - Do NOT include `Co-authored-by` or AI references
  - Do NOT use `--no-verify`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential in Wave 3)
  - **Parallel Group**: Wave 3 (after T9)
  - **Blocks**: T11
  - **Blocked By**: T9

  **References**:

  **Pattern References**:
  - `test-payloads/` directory — Contains `jira-realistic-task.json`, `jira-realistic-task-102.json` (both tracked) and `jira-realistic-task-103.json` (untracked, this task's target)

  **WHY Each Reference Matters**:
  - The new payload follows the existing naming convention (`jira-realistic-task-NNN.json`); just needs tracking

  **Acceptance Criteria**:
  - [ ] `git log -1 --format="%s"` returns `test: add jira-realistic-task-103 payload for E2E fixtures`
  - [ ] `git show --stat HEAD | grep -c "^ test-payloads/jira-realistic-task-103.json"` returns `1`
  - [ ] `git show --stat HEAD | grep -v "test-payloads/jira-realistic-task-103.json" | grep -E "\\.(md|ts|js|yml|sql|json)"` returns empty
  - [ ] **After commit**: `git status --short` returns empty (clean working tree)
  - [ ] `git log -1 --format="%b"` does NOT contain "Co-authored-by" or AI references

  **QA Scenarios**:

  ```
  Scenario: Happy path — last commit leaves working tree clean
    Tool: Bash
    Preconditions: T9 committed; only test-payload-103 remains untracked
    Steps:
      1. Run: git add test-payloads/jira-realistic-task-103.json
      2. Run: git diff --cached --stat > .sisyphus/evidence/task-10-staged.txt
      3. Run: git commit -m "test: add jira-realistic-task-103 payload for E2E fixtures"
      4. Run: git status --short > .sisyphus/evidence/task-10-clean-tree.txt
      5. Verify clean: wc -l .sisyphus/evidence/task-10-clean-tree.txt  (expected: 0)
    Expected Result: 1 file committed, working tree completely clean (git status empty)
    Evidence: .sisyphus/evidence/task-10-staged.txt, task-10-clean-tree.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-10-staged.txt`
  - [ ] `.sisyphus/evidence/task-10-clean-tree.txt`

  **Commit**: YES
  - Message: `test: add jira-realistic-task-103 payload for E2E fixtures`
  - Files: `test-payloads/jira-realistic-task-103.json`
  - Pre-commit: Verify exactly 1 file staged; post-commit verify working tree is clean

- [ ] 11. Push all commits to `origin/main` (fast-forward only)

  **What to do**:
  - **PRE-PUSH SAFETY GATE**: Run `git fetch origin main` then `git log HEAD..origin/main | wc -l` — MUST return 0. If non-zero, STOP and report.
  - Capture commit count to be pushed: `git log origin/main..HEAD --oneline | wc -l > .sisyphus/evidence/task-11-pre-push-count.txt` (expected: 169 = 164 existing + 5 new commits from T6, T7, T8, T9, T10)
  - Push: `git push origin main` (NO `--force`, NO `--force-with-lease`)
  - Verify push succeeded: `git log --oneline origin/main | head -1` must match `git log --oneline HEAD | head -1`
  - Verify sync: `git log HEAD..origin/main | wc -l` and `git log origin/main..HEAD | wc -l` — BOTH must return 0
  - Capture evidence: `git status > .sisyphus/evidence/task-11-final-status.txt`

  **Must NOT do**:
  - **NO force push** under any circumstances
  - **NO `--force`, NO `--force-with-lease`, NO `-f`**
  - Do NOT push to any branch other than `main`
  - Do NOT push if the safety gate fails (HEAD..origin/main is non-empty)
  - Do NOT rebase, squash, or amend any commits before pushing
  - Do NOT proceed if `git push` is rejected — STOP and report error

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Critical for safe push discipline (fast-forward only, no force)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, after T10)
  - **Blocks**: F1-F4 (verification wave)
  - **Blocked By**: T10

  **References**:

  **Pattern References**:
  - Current branch: `main`, 164 commits ahead, 0 behind (verified during investigation)
  - `AGENTS.md` "Git Rules" — No `--no-verify`, no Co-authored-by, no AI references

  **WHY Each Reference Matters**:
  - Pre-push state was verified in investigation; safety gate re-verifies before actual push in case remote changed
  - Fast-forward only policy protects against accidental history rewrites

  **Acceptance Criteria**:
  - [ ] **SAFETY GATE**: `git log HEAD..origin/main | wc -l` returns `0` before push
  - [ ] `git push origin main` exits with code 0
  - [ ] After push: `git log HEAD..origin/main | wc -l` returns `0`
  - [ ] After push: `git log origin/main..HEAD | wc -l` returns `0`
  - [ ] `git log --oneline origin/main -1 | awk '{print $1}'` matches `git log --oneline HEAD -1 | awk '{print $1}'`
  - [ ] `git status --short` returns empty (clean working tree)
  - [ ] No `git reflog` entries with "force" appear: `git reflog | grep -i "force" | wc -l` returns 0
  - [ ] `.sisyphus/evidence/task-11-final-status.txt` shows "Your branch is up to date with 'origin/main'."

  **QA Scenarios**:

  ```
  Scenario: Happy path — fast-forward push succeeds
    Tool: Bash
    Preconditions: All commits T6-T10 landed; origin/main has not moved
    Steps:
      1. Run: git fetch origin main
      2. SAFETY GATE: git log HEAD..origin/main | wc -l  (must be 0)
      3. If non-zero: echo "ABORT: remote has moved, cannot fast-forward" && exit 1
      4. Capture: git log origin/main..HEAD --oneline > .sisyphus/evidence/task-11-to-push.txt
      5. Run: git push origin main 2>&1 | tee .sisyphus/evidence/task-11-push-output.txt
      6. Verify exit code: $? must be 0
      7. Verify sync: git log HEAD..origin/main | wc -l AND git log origin/main..HEAD | wc -l  (both 0)
      8. Verify final status: git status > .sisyphus/evidence/task-11-final-status.txt
      9. Verify: grep "up to date" .sisyphus/evidence/task-11-final-status.txt
    Expected Result: Push succeeds, branch in sync, status shows "up to date"
    Evidence: .sisyphus/evidence/task-11-to-push.txt, task-11-push-output.txt, task-11-final-status.txt

  Scenario: Failure — push rejected (remote moved)
    Tool: Bash
    Preconditions: Someone pushed to origin/main while we were working
    Steps:
      1. Run: git fetch origin main
      2. Check: git log HEAD..origin/main | wc -l  (returns >0)
      3. Action: STOP, report "remote has N new commits; manual intervention required"
      4. Do NOT attempt push
      5. Do NOT force push
      6. Do NOT rebase
    Expected Result: Task fails safely; user notified; no action taken
    Evidence: .sisyphus/evidence/task-11-abort.txt with the remote commit log

  Scenario: Failure — network or auth error
    Tool: Bash
    Preconditions: git push fails with non-zero exit code
    Steps:
      1. Capture: git push origin main 2>&1 > .sisyphus/evidence/task-11-push-error.txt
      2. Capture exit code
      3. Report error verbatim to user
      4. Do NOT retry automatically
      5. Do NOT force push
    Expected Result: Error captured; user takes action manually
    Evidence: .sisyphus/evidence/task-11-push-error.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-11-pre-push-count.txt`
  - [ ] `.sisyphus/evidence/task-11-to-push.txt`
  - [ ] `.sisyphus/evidence/task-11-push-output.txt`
  - [ ] `.sisyphus/evidence/task-11-final-status.txt`

  **Commit**: NO — this is a push, not a commit

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read this plan end-to-end. For each "Must Have": verify implementation exists (ls file, grep content, git log commit). For each "Must NOT Have": search for forbidden patterns — reject with file:line if found (e.g., `git reflog | grep "force"`, `git log --grep="Co-authored"`). Check evidence files exist in `.sisyphus/evidence/task-*`. Verify all 6 commits landed in the expected order with expected files.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Verify the `infra/templates/` directory is structured cleanly: README exists and is informative, no stray files, no `.DS_Store`, no editor swap files. Verify `.gitignore` entry is properly placed (adjacent to existing `.sisyphus/` section). Verify `shared-supabase-infra.md` has no dangling or broken references. Review all 6 commit messages for convention compliance (`chore(scope):` / `docs:` / `test:` prefixes, no AI attribution, no Co-authored-by, no --no-verify flags used).
      Output: `Structure [PASS/FAIL] | Gitignore [PASS/FAIL] | Plan Refs [N clean/N issues] | Commits [N/6 compliant] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Execute end-to-end verification: (1) `git status --short` must be empty, (2) `git log HEAD..origin/main | wc -l` must be 0, (3) `ls .sisyphus/drafts/ 2>/dev/null | wc -l` must be 0, (4) `ls infra/templates/ | wc -l` must be 9, (5) `grep -c "sisyphus/drafts" .sisyphus/plans/shared-supabase-infra.md` must be 0, (6) `ls .sisyphus/notepads/phase8-e2e/` must show only learnings.md, (7) `git log --oneline origin/main | head -1` must match `git log --oneline HEAD | head -1`. Save all outputs to `.sisyphus/evidence/final-qa/`.
      Output: `Checks [N/7 pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each of the 6 commits: read the commit diff (`git show <hash>`), compare against the task spec in this plan. Verify 1:1 — everything in spec was committed, nothing beyond spec was committed. Specifically hunt for: (a) cross-contamination between commit topics, (b) any `git add .` side effects (files unrelated to the topic), (c) any file modifications not specified in any task. Detect if the `infra/` directory was created correctly with exactly 9 files (no extras). Verify the 4 historical plans with dead links were NOT modified (`git log --oneline HEAD~10..HEAD -- .sisyphus/plans/2026-03-22-2317-architecture-doc-rewrite.md .sisyphus/plans/2026-03-25-0055-architecture-doc-updates.md .sisyphus/plans/2026-03-25-0913-architecture-doc-review-fixes.md .sisyphus/plans/hybrid-local-flyio-workers.md` should show zero new commits touching these files — only the untracked ones being committed fresh). Flag any unaccounted changes.
      Output: `Commits [N/6 compliant] | Contamination [CLEAN/N issues] | Historical Plans [UNTOUCHED/N touched] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

All 6 commits use `chore(scope):` / `docs:` / `test:` prefixes per repo convention. No AI tool references. No Co-authored-by lines. No `--no-verify` flag.

| #   | Commit Message                                                                     | Files                                                                                   |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| T5  | `chore(notepads): remove empty phase8-e2e stub files`                              | `.sisyphus/notepads/phase8-e2e/decisions.md`, `issues.md` (deletions)                   |
| T6  | `chore(notepads): track work notes from phase7, phase8, and recent plans`          | `.sisyphus/notepads/phase8-e2e/learnings.md` (modified) + 5 new dirs                    |
| T7  | `chore(plans): track accumulated plans from phase6 through hybrid-flyio-workers`   | 13 plan files                                                                           |
| T8  | `docs: add hybrid mode current-state system overview`                              | `docs/2026-04-07-1732-hybrid-mode-current-state.md`                                     |
| T9  | `chore(infra): relocate compose templates to infra/templates and gitignore drafts` | `infra/templates/*` (9 files), `.gitignore`, `.sisyphus/plans/shared-supabase-infra.md` |
| T10 | `test: add jira-realistic-task-103 payload for E2E fixtures`                       | `test-payloads/jira-realistic-task-103.json`                                            |

---

## Success Criteria

### Verification Commands

```bash
# Clean working tree
git status --short  # Expected: empty output
# In sync with origin
git log HEAD..origin/main | wc -l  # Expected: 0
git log origin/main..HEAD | wc -l  # Expected: 0 (after push)
# Drafts gone
ls .sisyphus/drafts/ 2>/dev/null | wc -l  # Expected: 0
# Templates relocated
ls infra/templates/ | wc -l  # Expected: 9 (8 templates + README)
# Plan updated
grep -c "sisyphus/drafts" .sisyphus/plans/shared-supabase-infra.md  # Expected: 0
grep -c "infra/templates" .sisyphus/plans/shared-supabase-infra.md  # Expected: ≥8
# Empty files deleted
ls .sisyphus/notepads/phase8-e2e/  # Expected: only learnings.md
# Gitignore updated
grep "sisyphus/drafts" .gitignore  # Expected: .sisyphus/drafts/
# 6 new commits landed
git log --oneline -6 --format="%s"  # Expected: 6 matching commit subjects
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] 6 atomic commits landed in order
- [ ] Push to origin/main succeeded (fast-forward)
- [ ] Working tree clean
