# Doc Accuracy — Remove Line Numbers & Fix Factual Errors

## TL;DR

> **Quick Summary**: Surgically remove all source-code line number references from two documentation
> files and fix eight confirmed factual inaccuracies discovered by cross-checking against the live
> codebase. No code changes. Two parallel doc-only tasks.
>
> **Deliverables**:
>
> - `docs/2026-04-07-1732-hybrid-mode-current-state.md` — 27 targeted edits (line number removal + 8 factual fixes)
> - `docs/2026-04-08-1357-project-registration-and-development-loop.md` — 1 targeted edit
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Final Verification

---

## Context

### Original Request

Remove all `:N`, `:N-M`, `lines N–M`, and `line N` source-code line-number references from both
docs. Replace with stable function/symbol anchors where the surrounding prose would otherwise be
incomplete. Also fix eight confirmed factual inaccuracies discovered by a 5-agent cross-check of
every claim against the actual source files.

### Interview Summary

**Key Discussions**:

- Line numbers decay on every PR and create false confidence when wrong
- Function names, symbol names, and file paths are stable anchors; line numbers are not
- Where an embedded code snippet already follows the reference, the line number is redundant and should simply be dropped
- Code block comments like `// lifecycle.ts:99-120` should be replaced with descriptive comments, not deleted entirely
- Historical changelog table entries should have line-number parentheticals stripped but keep their descriptive text
- Doc 2 has exactly one issue: `gh pr create` in a troubleshooting symptom (line 327)

**Research Findings**:

- 5 parallel agents confirmed all claims against current source with exact line numbers
- Metis review caught: doc 2 `gh pr create` was initially missed, changelog entries at lines 733/787 need stripping, per-instance replacement text must be explicit

### Metis Review

**Identified Gaps** (addressed):

- Doc 2 line 327 `gh pr create` inaccuracy was not initially scoped — now included
- Changelog table entries (doc 1 lines 733, 787) needed explicit decision — resolved: strip line parentheticals, preserve descriptions
- Per-instance replacement text needed enumeration — done below (all 29 changes specified)
- Code block comment handling needed clarification — resolved: descriptive replacement, not deletion
- Acceptance criteria needed to be grep-executable — added below

---

## Work Objectives

### Core Objective

Eliminate all source-code line number references from both docs and fix eight confirmed factual
inaccuracies, leaving every other word, sentence, table row, and heading unchanged.

### Concrete Deliverables

- `docs/2026-04-07-1732-hybrid-mode-current-state.md` — surgically edited in-place
- `docs/2026-04-08-1357-project-registration-and-development-loop.md` — surgically edited in-place

### Definition of Done

- [ ] `grep -nE '(lifecycle|poll-completion|ngrok-client|pr-manager|completion)\.ts:\d+|lines?\s+\d+[-–]\d+' docs/2026-04-07-1732-hybrid-mode-current-state.md` → 0 matches
- [ ] `grep -n "gh pr create" docs/2026-04-07-1732-hybrid-mode-current-state.md` → 0 matches
- [ ] `grep -n "gh pr create" docs/2026-04-08-1357-project-registration-and-development-loop.md` → 0 matches
- [ ] `git diff --name-only` → exactly 2 files listed

### Must Have

- Every line-number reference removed or replaced with a stable anchor
- All 8 factual inaccuracies corrected with the exact replacement text specified in TODOs below
- Surrounding Markdown structure (headings, table shapes, fenced code blocks) preserved exactly

### Must NOT Have (Guardrails)

- No prose rewriting beyond the enumerated changes — touch only the specific span containing each issue
- No fixing inaccuracies discovered during editing that are NOT on the list — flag them instead
- No touching any file outside the two named docs
- No touching README, AGENTS.md, source code files, or any other doc
- No reformatting, heading changes, or table restructuring

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: N/A (doc-only task)
- **Automated tests**: None — acceptance criteria are grep commands
- **Framework**: bash grep

### QA Policy

All verification is command-executable. No "review the document" criteria.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Both tasks start immediately — independent files):
├── Task 1: Update hybrid-mode doc (27 changes) [unspecified-high]
└── Task 2: Update project-registration doc (1 change) [quick]

Wave FINAL (After Wave 1):
├── F1: Grep verification — confirm 0 line-number matches in both files
├── F2: Grep verification — confirm 0 `gh pr create` matches in both files
└── F3: Confirm git diff shows exactly 2 files changed
```

### Dependency Matrix

- **Task 1**: no dependencies — start immediately
- **Task 2**: no dependencies — start immediately
- **F1–F3**: depend on Task 1 AND Task 2 completing

---

## TODOs

---

- [x] 1. Update `docs/2026-04-07-1732-hybrid-mode-current-state.md` — remove all line number references and fix 8 factual inaccuracies

  **What to do**:

  Apply every edit below in order. Each entry gives the EXACT old string and the EXACT new string.
  Do not change any other text. After all edits, verify with the grep commands in acceptance criteria.

  > **CRITICAL RULE**: If you notice any issue not on this list while editing, do NOT fix it.
  > Flag it in a comment at the end of your response and move on.

  ***

  ### Change 1 — Section: "The Three Worker Dispatch Modes"

  **Old** (in the prose paragraph, one sentence):

  ```
  Mode selection happens at lines 26–54.
  ```

  **New**:

  ```
  Mode selection happens in the `update-status-executing` step.
  ```

  ***

  ### Change 2 — Code block comment in Mode Selection Logic

  **Old** (inside a fenced TypeScript block):

  ```
  // lifecycle.ts:26-49
  ```

  **New**:

  ```
  // update-status-executing step
  ```

  ***

  ### Change 3 — Mode Selection table, Hybrid row, Path column

  **Old**:
  `lifecycle.ts:97-230`
  **New**:
  `hybrid dispatch block in lifecycle.ts`

  ***

  ### Change 4 — Mode Selection table, Local Docker row, Path column

  **Old**:
  `lifecycle.ts:237-271`
  **New**:
  `local Docker dispatch block in lifecycle.ts`

  ***

  ### Change 5 — Mode Selection table, Default Fly row, Path column

  **Old**:
  `lifecycle.ts:305-329`
  **New**:
  `default Fly.io dispatch block in lifecycle.ts`

  ***

  ### Change 6 — Prose about silent no-op guard

  **Old**:

  ```
  the `dispatch-fly-machine` step returns early at lines 247–249 with no dispatch and no status update
  ```

  **New**:

  ```
  the `dispatch-fly-machine` step returns early with no dispatch and no status update
  ```

  ***

  ### Change 7 — Flow Walkthrough table, row 5a, File/Detail column

  **Old**:
  `lifecycle.ts:237-271`
  **New**:
  `local Docker dispatch block in lifecycle.ts`

  _(This is the same text as Change 4 but appears in the Flow Walkthrough table — a different location in the file.)_

  ***

  ### Change 8 — Flow Walkthrough table, row 5b, File/Detail column

  **Old**:
  `lifecycle.ts:97-230`
  **New**:
  `hybrid dispatch block in lifecycle.ts`

  _(Same text as Change 3 but in the Flow Walkthrough table.)_

  ***

  ### Change 9 — Code block comment in TUNNEL_URL bypass section

  **Old** (inside a fenced TypeScript block):

  ```
  // src/lib/ngrok-client.ts:30-34
  ```

  **New**:

  ```
  // getNgrokTunnelUrl() — TUNNEL_URL override
  ```

  ***

  ### Change 10 — Code block comment in Pre-Flight Tunnel Check section

  **Old** (inside a fenced TypeScript block):

  ```
  // lifecycle.ts:99-120
  ```

  **New**:

  ```
  // hybridFlyDispatch — pre-flight tunnel check
  ```

  ***

  ### Change 11 — Prose introducing the Hybrid Machine Env Block code snippet

  **Old** (the full parenthetical):

  ```
  in hybrid mode (`lifecycle.ts:157-168` — the `env` object; surrounding `guest`/`restart` config at lines 155–156):
  ```

  **New**:

  ```
  in hybrid mode:
  ```

  ***

  ### Change 12 — Prose about pollForCompletion call site

  **Old**:

  ```
  In hybrid mode (called from `lifecycle.ts:173-186`):
  ```

  **New**:

  ```
  In hybrid mode:
  ```

  ***

  ### Change 13 — Code block comment in pollForCompletion Behavior section

  **Old** (inside a fenced TypeScript block):

  ```
  // poll-completion.ts:36
  ```

  **New**:

  ```
  // pollForCompletion() — opts destructuring
  ```

  ***

  ### Change 14 — Code block comment in Detection Logic section

  **Old** (inside a fenced TypeScript block):

  ```
  // poll-completion.ts:59-65
  ```

  **New**:

  ```
  // terminal status detection
  ```

  ***

  ### Change 15 — Code block comment in Critical Fix section (poll URL)

  **Old** (inside a fenced TypeScript block):

  ```
  // poll-completion.ts:38
  ```

  **New**:

  ```
  // task status query URL
  ```

  ***

  ### Change 16 — Code block comment in Machine Cleanup Guarantee section

  **Old** (inside a fenced TypeScript block):

  ```
  // lifecycle.ts:189-193
  ```

  **New**:

  ```
  // machine cleanup — finally block
  ```

  ***

  ### Change 17 — FACTUAL FIX: PR creation step number in "How the PR Gets Created" section

  **Old**:

  ```
  and is invoked from `orchestrate.mts` step 14.
  ```

  **New**:

  ```
  and is invoked from `orchestrate.mts` step 16.
  ```

  ***

  ### Change 18 — FACTUAL FIX: `gh pr create` in Finalize step 16 table row

  **Old**:

  ```
  Check for existing PR on branch; if none, `gh pr create` with title `[AI] {TICKET_ID}: {summary}`
  ```

  **New**:

  ```
  Check for existing PR on branch; if none, create via GitHub REST API (`githubClient.createPR()`) with title `[AI] {TICKET_ID}: {summary}`
  ```

  ***

  ### Change 19 — FACTUAL FIX: `gh pr create` in URL Capture prose

  **Old**:

  ```
  After `gh pr create` succeeds, the PR URL is extracted
  ```

  **New**:

  ```
  After PR creation succeeds, the PR URL is extracted
  ```

  ***

  ### Change 20 — FACTUAL FIX + line number removal: `buildPRBody()` section heading

  **Old**:

  ```
  ### PR Body Template (`buildPRBody()` in `pr-manager.ts:42-70`)
  ```

  **New**:

  ```
  ### PR Body Template (`buildPRBody()` in `pr-manager.ts`)
  ```

  ***

  ### Change 21 — FACTUAL FIX + line number removal: `runCompletionFlow()` reference

  **Old**:

  ```
  via `runCompletionFlow()` (`lib/completion.ts:30-100`):
  ```

  **New**:

  ```
  via `runCompletionFlow()` in `lib/completion.ts`:
  ```

  ***

  ### Change 22 — FACTUAL FIX: `delivery_type` always `'pull_request'`

  **Old**:

  ```
  **`deliverables` table**: new row with `delivery_type = 'pull_request'`, `external_ref = <PR URL>`, `status = 'submitted'`
  ```

  **New**:

  ```
  **`deliverables` table**: new row with `delivery_type = 'pull_request'` (or `'no_changes'` if no PR URL), `external_ref = <PR URL>`, `status = 'submitted'`
  ```

  ***

  ### Change 23 — FACTUAL FIX: Dockerfile CMD vs ENTRYPOINT

  **Old**:

  ```
  - Entrypoint: `bash /app/entrypoint.sh`
  ```

  **New**:

  ```
  - Run command: `CMD ["bash", "entrypoint.sh"]` (from WORKDIR `/app`)
  ```

  ***

  ### Change 24 — FACTUAL FIX: entrypoint idempotency caveat

  **Old**:

  ```
  The entrypoint script is idempotent: it uses flag files in `/tmp/.boot-flags/` so a restart skips already-completed steps.
  ```

  **New**:

  ```
  The entrypoint script uses flag files in `/tmp/.boot-flags/` for idempotency on its primary steps. Sub-steps 3.5, 3.6, 3.7, and 6.5 are not flag-guarded and re-run on every boot (all are safe to re-run).
  ```

  ***

  ### Change 25 — FACTUAL FIX: branch slug 60-char scope

  **Old**:

  ```
  Build branch name `ai/{TICKET_ID}-{kebab-slug}` (slug max 60 chars), create or checkout branch in `/workspace`
  ```

  **New**:

  ```
  Build branch name `ai/{TICKET_ID}-{kebab-slug}` (60-char limit on the combined `TICKET_ID-slug` portion), create or checkout branch in `/workspace`
  ```

  ***

  ### Change 26 — Changelog table entry, hybrid plan, Modified Files row

  **Old** (in the "What Was Built in This Plan (`hybrid-local-flyio-workers`)" Modified Files table):

  ```
  Added hybrid Fly.io dispatch branch (lines 97-230), pre-flight tunnel check, direct fetch to Fly Machines API, polling, finally-block cleanup
  ```

  **New**:

  ```
  Added hybrid Fly.io dispatch branch, pre-flight tunnel check, direct fetch to Fly Machines API, polling, finally-block cleanup
  ```

  ***

  ### Change 27 — Changelog table entry, plan-judge-gate, Modified Files row

  **Old** (in the "What Was Built in This Plan (`plan-judge-gate`)" Modified Files table):

  ```
  `PLAN_VERIFIER_MODEL` added to all 3 dispatch paths (lines 167, 278, 346)
  ```

  **New**:

  ```
  `PLAN_VERIFIER_MODEL` added to all 3 dispatch paths
  ```

  ***

  **Must NOT do**:
  - Do not rewrite any sentence not listed above
  - Do not fix anything you notice that is not on this list (flag it instead)
  - Do not touch any other file
  - Do not change heading levels, table column counts, or fenced code block language tags

  **Recommended Agent Profile**:

  > Surgical multi-edit on a large markdown file. Needs precision, not creativity.
  - **Category**: `unspecified-high`
    - Reason: 27 targeted edits in a ~858-line file; requires careful exact-string matching without introducing drift
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Final Verification
  - **Blocked By**: None

  **References**:
  - `docs/2026-04-07-1732-hybrid-mode-current-state.md` — the file to edit (read it in full before starting)
  - `src/inngest/lifecycle.ts` — read-only reference if needed to verify a replacement is sensible

  **Acceptance Criteria**:

  ```
  Scenario: No source-code line number references remain in doc 1
    Tool: Bash
    Steps:
      1. Run: grep -nE '(lifecycle|poll-completion|ngrok-client|pr-manager|completion)\.ts:\d+|lines?\s+\d+[-–]\d+' docs/2026-04-07-1732-hybrid-mode-current-state.md
      2. Assert output is empty (0 matches)
    Expected Result: Empty output
    Evidence: .sisyphus/evidence/task-1-line-number-grep.txt

  Scenario: No `gh pr create` references remain in doc 1
    Tool: Bash
    Steps:
      1. Run: grep -n "gh pr create" docs/2026-04-07-1732-hybrid-mode-current-state.md
      2. Assert output is empty
    Expected Result: Empty output
    Evidence: .sisyphus/evidence/task-1-gh-pr-grep.txt

  Scenario: All 27 old strings are absent
    Tool: Bash
    Steps:
      1. Run each of the following; all must return 0 matches:
         grep -n "lifecycle.ts:97-230" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lifecycle.ts:237-271" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lifecycle.ts:305-329" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lifecycle.ts:157-168" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lifecycle.ts:173-186" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lifecycle.ts:189-193" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lifecycle.ts:99-120" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lifecycle.ts:26-49" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "poll-completion.ts:36" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "poll-completion.ts:38" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "poll-completion.ts:59-65" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "ngrok-client.ts:30-34" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "pr-manager.ts:42-70" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "completion.ts:30-100" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lines 97-230" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -n "lines 167, 278, 346" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -Fn "bash /app/entrypoint.sh" docs/2026-04-07-1732-hybrid-mode-current-state.md
         grep -Fn "slug max 60 chars" docs/2026-04-07-1732-hybrid-mode-current-state.md
    Expected Result: All 0 matches
    Evidence: .sisyphus/evidence/task-1-string-absence-check.txt
  ```

  **Commit**: YES
  - Message: `docs: remove line number refs and fix factual errors in hybrid-mode doc`
  - Files: `docs/2026-04-07-1732-hybrid-mode-current-state.md`

---

- [x] 2. Update `docs/2026-04-08-1357-project-registration-and-development-loop.md` — fix `gh pr create` in troubleshooting section

  **What to do**:

  One surgical edit in the troubleshooting section "PR not created / task stuck in Executing".

  **Old** (line 327):

  ```
  Container logs show a git push error or `gh pr create` failure.
  ```

  **New**:

  ```
  Container logs show a git push error or a GitHub API PR creation failure.
  ```

  That is the only change. Do not touch anything else in this file.

  **Must NOT do**:
  - Do not rewrite any other sentence
  - Do not touch any other file
  - Do not add any note about the change inside the document

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single one-line edit in a 362-line file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Final Verification
  - **Blocked By**: None

  **References**:
  - `docs/2026-04-08-1357-project-registration-and-development-loop.md` — the file to edit

  **Acceptance Criteria**:

  ```
  Scenario: `gh pr create` is gone from doc 2
    Tool: Bash
    Steps:
      1. Run: grep -n "gh pr create" docs/2026-04-08-1357-project-registration-and-development-loop.md
      2. Assert output is empty
    Expected Result: Empty output
    Evidence: .sisyphus/evidence/task-2-gh-pr-grep.txt

  Scenario: The replacement text is present
    Tool: Bash
    Steps:
      1. Run: grep -n "GitHub API PR creation failure" docs/2026-04-08-1357-project-registration-and-development-loop.md
      2. Assert exactly 1 match
    Expected Result: 1 match on the troubleshooting symptom line
    Evidence: .sisyphus/evidence/task-2-replacement-present.txt
  ```

  **Commit**: YES
  - Message: `docs: fix gh pr create inaccuracy in project-registration doc`
  - Files: `docs/2026-04-08-1357-project-registration-and-development-loop.md`

---

## Final Verification Wave

- [x] F1. **Grep Verification** — `quick`
      Run all acceptance-criteria greps from both tasks. Confirm every grep returns 0 matches (or exactly 1 match where specified). Save combined output to `.sisyphus/evidence/final-grep-verification.txt`.
      Output: `All checks PASS` or list of failures with file:line

- [x] F2. **Scope Confirmation** — `quick`
      Run `git diff --name-only`. Assert exactly 2 files appear: `docs/2026-04-07-1732-hybrid-mode-current-state.md` and `docs/2026-04-08-1357-project-registration-and-development-loop.md`. No other files.
      Output: `PASS — exactly 2 files` or `FAIL — unexpected files: [list]`

---

## Commit Strategy

- **Task 1**: `docs: remove line number refs and fix factual errors in hybrid-mode doc`
- **Task 2**: `docs: fix gh pr create inaccuracy in project-registration doc`

---

## Success Criteria

### Verification Commands

```bash
# No line number refs remain in doc 1
grep -nE '(lifecycle|poll-completion|ngrok-client|pr-manager|completion)\.ts:\d+|lines?\s+\d+[-–]\d+' \
  docs/2026-04-07-1732-hybrid-mode-current-state.md
# Expected: 0 matches

# No gh pr create in either doc
grep -rn "gh pr create" docs/2026-04-07-1732-hybrid-mode-current-state.md \
  docs/2026-04-08-1357-project-registration-and-development-loop.md
# Expected: 0 matches

# Exactly 2 files changed
git diff --name-only
# Expected: the two doc files only
```

### Final Checklist

- [ ] All 27 old strings absent from doc 1 (verified by grep)
- [ ] `gh pr create` absent from both docs (verified by grep)
- [ ] Exactly 2 files in `git diff --name-only`
- [ ] Markdown structure intact (no broken tables, no unclosed fenced blocks)
