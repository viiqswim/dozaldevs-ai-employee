# Dead Code & Unused File Cleanup

## TL;DR

> **Quick Summary**: Install knip, configure it with proper entry points and exclusions for our complex codebase (shell-invoked worker tools, dynamic imports, deprecated-but-preserved files), then systematically remove all unused files, exports, and npm dependencies. Add a `pnpm lint:unused` script for ongoing detection.
>
> **Deliverables**:
>
> - Committed `knip.json` config tuned for this project's patterns
> - `pnpm lint:unused` script in package.json
> - All genuinely unused files removed
> - All unused exports within retained files removed
> - All unused npm dependencies removed from package.json
> - Stale dist/ artifacts cleaned via rebuild
> - Dead scripts in scripts/ removed
> - Updated AGENTS.md if any documented files were removed
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Tasks 5-8 (parallel) → Tasks 9-10 (parallel) → Task 11 → F1-F4

---

## Context

### Original Request

Find any unused files and create a plan to remove them. Have a package.json script that detects unused code and flags them. Also review beyond what the script flags to ensure the codebase is as clean as possible.

### Interview Summary

**Key Discussions**:

- Deprecated files (lifecycle.ts, redispatch.ts, watchdog.ts, orchestrate.mts, entrypoint.sh, most of workers/lib/): User chose to **leave them alone** — suppress in knip config, do not remove
- Cleanup scope: User chose **full sweep** — unused files + unused exports + unused npm dependencies
- Test strategy: No new tests needed — verify with `pnpm build && pnpm test` after each wave

**Research Findings**:

- **knip** is the only maintained tool covering files + exports + deps (ts-prune archived, depcheck redirects to knip, unimported archived)
- 153 source files, 181 test files — ESM with NodeNext resolution (.js/.mjs extension imports)
- **20 workers/lib files** only imported by deprecated orchestrate.mts — deprecated, preserved per user decision
- **6 fully orphaned workers/lib files** — not imported by either harness (but 3 are shell-invoked by deprecated entrypoint.sh)
- **24+ worker tool files** (src/worker-tools/) have zero TypeScript import edges — all invoked via `tsx /tools/...` in Docker containers. Must be whitelisted or knip flags ALL as dead.
- **Dynamic imports**: enrichment-adapters/hostfully.ts only reachable via `await import()` — must be whitelisted
- **20+ stale dist/ artifacts** compiled from now-deleted source files
- **13+ scripts** not referenced in package.json — need investigation before removal

### Metis Review

**Identified Gaps** (addressed):

- Rollback strategy: Each removal wave gets its own commit — easy revert via `git revert`
- Scripts audit: Must grep `.github/`, Dockerfile, docker-compose.yml, README before declaring scripts dead
- Docker build gate: `pnpm build && pnpm test` is insufficient — `docker build` is also required since worker tools are COPY'd into the image
- knip version pinning: Must pin to specific version in devDependencies to prevent config breakage
- dist/ handling: Must verify `dist/` is gitignored before deciding cleanup approach
- tsconfig paths: Must check for `paths` aliases and mirror in knip config
- Type-only exports: May be flagged by knip even though they're consumed at type-check time — need careful triage
- Pre-existing build state: Must establish green baseline before any removals

---

## Work Objectives

### Core Objective

Eliminate all dead code from the codebase and install ongoing detection tooling so unused code is caught immediately going forward.

### Concrete Deliverables

- `knip.json` — committed configuration file with all entry points and exclusions
- `pnpm lint:unused` — new package.json script running knip
- Removal of all genuinely unused source files, exports, and npm dependencies
- Clean dist/ via full rebuild (no stale artifacts)
- Updated AGENTS.md/README if any documented items were removed

### Definition of Done

- [ ] `pnpm lint:unused` exits 0 (knip reports zero issues)
- [ ] `pnpm build` exits 0 with no new TypeScript errors
- [ ] `pnpm test -- --run` exits 0 (515+ passing, same pre-existing failures)
- [ ] `docker build -t ai-employee-worker:latest .` exits 0
- [ ] `knip.json` exists and is committed to the repo
- [ ] `grep "lint:unused" package.json` returns a match

### Must Have

- knip configured with correct entry points for this project's architecture
- Worker tools (src/worker-tools/\*\*) whitelisted as entry points — they are shell-invoked, not imported
- Deprecated files suppressed in knip config per user decision
- Dynamic import targets (enrichment-adapters/hostfully.ts) whitelisted
- Each removal wave committed separately for easy rollback
- Build + test + Docker build verification after all removals

### Must NOT Have (Guardrails)

- **DO NOT remove deprecated files** listed in AGENTS.md (lifecycle.ts, redispatch.ts, watchdog.ts, orchestrate.mts, entrypoint.sh, workers/lib/\* except active files)
- **DO NOT remove any file under src/worker-tools/** — all are shell-invoked at runtime
- **DO NOT refactor retained code** — only remove confirmed-unused symbols/files/deps
- **DO NOT upgrade dependency versions** — only remove unused packages
- **DO NOT remove prisma/migrations/** under any circumstances
- **DO NOT remove .d.ts ambient type declaration files** without verifying they're not consumed by TypeScript
- **DO NOT treat passing tests as sufficient proof** — Docker build is also a hard requirement
- **DO NOT leave knip config as local-only** — it must be committed to the repo

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None (removal-only work — verified by existing build + test suite)
- **Framework**: Vitest (existing, 515+ tests)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build verification**: `pnpm build` — TypeScript compilation
- **Test verification**: `pnpm test -- --run` — Vitest suite
- **Docker verification**: `docker build -t ai-employee-worker:latest .` — image builds
- **Knip verification**: `pnpm lint:unused` — zero findings

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential baseline):
├── Task 1: Establish green baseline [quick]
├── Task 2: Install & configure knip [quick]
└── Task 3: Generate & triage initial knip report [deep]

Wave 2 (Removals — MAX PARALLEL after triage):
├── Task 4: Clean stale dist/ artifacts [quick]
├── Task 5: Remove unused source files [unspecified-high]
├── Task 6: Remove unused exports from retained files [unspecified-high]
├── Task 7: Remove unused npm dependencies [quick]
└── Task 8: Audit & remove dead scripts [unspecified-high]

Wave 3 (Verification & polish):
├── Task 9: Full build + test + Docker verification [quick]
└── Task 10: Final knip validation & documentation updates [unspecified-high]

Wave 4 (Notification):
└── Task 11: Notify completion [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On    | Blocks        |
| ---- | ------------- | ------------- |
| 1    | —             | 2             |
| 2    | 1             | 3             |
| 3    | 2             | 4, 5, 6, 7, 8 |
| 4    | 3             | 9             |
| 5    | 3             | 9             |
| 6    | 3             | 9             |
| 7    | 3             | 9             |
| 8    | 3             | 9             |
| 9    | 4, 5, 6, 7, 8 | 10            |
| 10   | 9             | 11            |
| 11   | 10            | F1-F4         |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `deep`
- **Wave 2**: 5 tasks — T4 `quick`, T5 `unspecified-high`, T6 `unspecified-high`, T7 `quick`, T8 `unspecified-high`
- **Wave 3**: 2 tasks — T9 `quick`, T10 `unspecified-high`
- **Wave 4**: 1 task — T11 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Establish green baseline

  **What to do**:
  - Run `pnpm build` and record output — note any pre-existing TypeScript errors
  - Run `pnpm test -- --run` and record pass/fail counts
  - Run `git check-ignore dist/` to confirm dist/ is gitignored
  - Check `tsconfig.json` for `paths` aliases (if any exist, they must be mirrored in knip config in Task 2)
  - Run `grep -r "await import(" src/ --include="*.ts" --include="*.mts"` to get complete dynamic import inventory
  - Run `grep -r "tsx " scripts/ src/workers/entrypoint.sh Dockerfile docker-compose.yml .github/ 2>/dev/null` to find all tsx-invoked files
  - Record all findings in `.sisyphus/evidence/task-1-baseline.md`

  **Must NOT do**:
  - Do not fix any pre-existing errors — only record them
  - Do not modify any files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `tsconfig.json` — Check for `paths` and `compilerOptions.paths` fields
  - `tsconfig.build.json` — Build-specific config, `include: ["src/**/*"]`

  **Config References**:
  - `.gitignore` — Verify dist/ is listed
  - `Dockerfile` — Lines with COPY and tsx invocations
  - `docker-compose.yml` or `docker/docker-compose.yml` — Volume mounts

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build baseline established
    Tool: Bash
    Preconditions: Repository is clean (no uncommitted changes)
    Steps:
      1. Run `pnpm build 2>&1 | tail -20` — capture exit code
      2. Run `pnpm test -- --run 2>&1 | tail -20` — capture pass/fail count
      3. Run `git check-ignore dist/` — expected: "dist/"
      4. Run `grep -c '"paths"' tsconfig.json tsconfig.build.json 2>/dev/null` — record count
    Expected Result: Build and test results recorded. dist/ confirmed gitignored.
    Failure Indicators: `git check-ignore dist/` returns nothing (dist is committed — changes approach for Task 4)
    Evidence: .sisyphus/evidence/task-1-baseline.md

  Scenario: Dynamic import inventory complete
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -rn "await import(" src/ --include="*.ts" --include="*.mts"` — capture all matches
      2. Verify enrichment-adapters/hostfully.ts appears in results
      3. Record any dynamic imports NOT already known from research
    Expected Result: Complete list of dynamic import targets for knip whitelisting
    Failure Indicators: New dynamic imports found that weren't in research — must be added to knip config
    Evidence: .sisyphus/evidence/task-1-dynamic-imports.txt
  ```

  **Commit**: NO

---

- [ ] 2. Install and configure knip

  **What to do**:
  - Install knip as a devDependency: `pnpm add -D knip` — note the installed version
  - Create `knip.json` at project root with this configuration (adjust based on Task 1 findings):
    ```json
    {
      "$schema": "https://unpkg.com/knip@6/schema.json",
      "entry": [
        "src/gateway/server.ts",
        "src/workers/opencode-harness.mts",
        "src/worker-tools/**/*.ts",
        "scripts/*.ts",
        "scripts/**/*.ts",
        "prisma/seed.ts",
        "src/lib/enrichment-adapters/hostfully.ts",
        "src/lib/enrichment-adapters/index.ts"
      ],
      "project": ["src/**/*.{ts,mts}", "scripts/**/*.ts"],
      "ignore": [
        "src/inngest/lifecycle.ts",
        "src/inngest/redispatch.ts",
        "src/inngest/watchdog.ts",
        "src/workers/orchestrate.mts",
        "src/workers/entrypoint.sh",
        "src/workers/lib/agents-md-reader.ts",
        "src/workers/lib/between-wave-push.ts",
        "src/workers/lib/branch-manager.ts",
        "src/workers/lib/cache-validator.ts",
        "src/workers/lib/ci-classifier.ts",
        "src/workers/lib/completion-detector.ts",
        "src/workers/lib/completion.ts",
        "src/workers/lib/continuation-dispatcher.ts",
        "src/workers/lib/cost-breaker.ts",
        "src/workers/lib/cost-tracker-v2.ts",
        "src/workers/lib/disk-check.ts",
        "src/workers/lib/fallback-pr.ts",
        "src/workers/lib/fix-loop.ts",
        "src/workers/lib/install-runner.ts",
        "src/workers/lib/plan-judge.ts",
        "src/workers/lib/plan-parser.ts",
        "src/workers/lib/plan-sync.ts",
        "src/workers/lib/planning-orchestrator.ts",
        "src/workers/lib/pr-manager.ts",
        "src/workers/lib/project-config.ts",
        "src/workers/lib/prompt-builder.ts",
        "src/workers/lib/resource-caps.ts",
        "src/workers/lib/task-context.ts",
        "src/workers/lib/token-tracker.ts",
        "src/workers/lib/validation-pipeline.ts",
        "src/workers/lib/wave-executor.ts",
        "src/inngest/triggers/guest-message-poll.ts"
      ],
      "ignoreDependencies": ["tsx"]
    }
    ```
  - If Task 1 found `paths` aliases in tsconfig.json, add corresponding `paths` config to knip.json
  - If Task 1 found additional dynamic import targets, add them to the `entry` array
  - Add `"lint:unused": "knip"` to package.json scripts section
  - Run `pnpm lint:unused` once to verify config loads without errors (report WILL have findings — that's expected at this stage)

  **Must NOT do**:
  - Do not remove any files or exports yet
  - Do not upgrade any dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `package.json` — Add devDependency and script. Follow existing script naming pattern (existing: `lint`, `build`, `test`)
  - `.sisyphus/evidence/task-1-baseline.md` — Task 1 findings (tsconfig paths, dynamic imports)

  **External References**:
  - knip docs: https://knip.dev/overview/configuration — configuration reference
  - knip Prisma plugin: https://knip.dev/reference/plugins/prisma — auto-detects prisma schema

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: knip installed and configured
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run `cat knip.json | python3 -m json.tool` — verify valid JSON
      2. Run `grep '"knip"' package.json` — verify knip in devDependencies
      3. Run `grep '"lint:unused"' package.json` — verify script exists
      4. Run `pnpm lint:unused 2>&1 | head -5` — verify knip runs without config errors (findings are expected)
    Expected Result: knip.json is valid, knip is installed, script works, knip produces a report (not a config error)
    Failure Indicators: "Configuration error", "Cannot find module", or JSON parse errors
    Evidence: .sisyphus/evidence/task-2-knip-config.txt

  Scenario: Deprecated files are suppressed
    Tool: Bash
    Preconditions: knip.json created
    Steps:
      1. Run `pnpm lint:unused 2>&1` — capture full output
      2. Verify NONE of the ignored files (lifecycle.ts, redispatch.ts, watchdog.ts, orchestrate.mts) appear in the report
      3. Verify worker-tools files do NOT appear as unused files (they're entry points)
    Expected Result: Zero findings for deprecated or worker-tool files
    Failure Indicators: Any deprecated file or worker-tool file appears in knip output
    Evidence: .sisyphus/evidence/task-2-suppression-check.txt
  ```

  **Commit**: YES
  - Message: `chore(tooling): add knip for dead code detection`
  - Files: `knip.json`, `package.json`, `pnpm-lock.yaml`
  - Pre-commit: `pnpm build`

---

- [ ] 3. Generate and triage initial knip report

  **What to do**:
  - Run `pnpm lint:unused --reporter json > .sisyphus/evidence/task-3-knip-raw.json 2>&1` to capture full JSON report
  - Also run `pnpm lint:unused` (plain text) and capture to `.sisyphus/evidence/task-3-knip-readable.txt`
  - Triage every finding into one of these categories:
    1. **REMOVE — Unused File**: Source file with zero import references, not in ignore list, not a dynamic import target
    2. **REMOVE — Unused Export**: Export within a retained file that has zero import references anywhere
    3. **REMOVE — Unused Dependency**: npm package in package.json with zero imports anywhere
    4. **FALSE POSITIVE — Keep**: File/export that appears unused but is actually referenced dynamically, via config, or via shell invocation
    5. **INVESTIGATE**: Unclear — needs manual verification via `lsp_find_references` or grep
  - For each INVESTIGATE item, use `lsp_find_references` to check if the symbol is actually used
  - Create a triage report at `.sisyphus/evidence/task-3-triage.md` with sections for each category and exact file paths
  - The triage report is the SINGLE SOURCE OF TRUTH for all subsequent removal tasks

  **Must NOT do**:
  - Do not remove any files or exports — only categorize
  - Do not modify knip config (if false positives exist, note them for potential config adjustment but do not change config)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential — must complete before any removals)
  - **Blocks**: Tasks 4, 5, 6, 7, 8
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/task-1-baseline.md` — Known pre-existing errors to not confuse with knip findings
  - `.sisyphus/evidence/task-1-dynamic-imports.txt` — Dynamic import inventory for false-positive identification
  - `knip.json` — Current configuration (entry points, ignores)

  **Tool References**:
  - `lsp_find_references` — For verifying zero usages on INVESTIGATE items
  - `grep` — For checking shell/config references to files

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Triage report is complete and actionable
    Tool: Bash
    Preconditions: Task 2 complete, knip configured
    Steps:
      1. Verify `.sisyphus/evidence/task-3-knip-raw.json` exists and is valid JSON
      2. Verify `.sisyphus/evidence/task-3-triage.md` exists
      3. Verify triage report has sections: "REMOVE — Unused File", "REMOVE — Unused Export", "REMOVE — Unused Dependency", "FALSE POSITIVE", "INVESTIGATE"
      4. Verify every INVESTIGATE item has a resolution (either moved to REMOVE or FALSE POSITIVE)
      5. Count total findings vs categorized findings — they must match (no findings left uncategorized)
    Expected Result: Every knip finding categorized. Zero INVESTIGATE items remaining. Triage report is exhaustive.
    Failure Indicators: INVESTIGATE items remain unresolved. Finding counts don't match. Missing sections.
    Evidence: .sisyphus/evidence/task-3-triage.md

  Scenario: No deprecated files in removal list
    Tool: Bash
    Preconditions: Triage report exists
    Steps:
      1. Search triage report for any file path containing "lifecycle.ts", "redispatch.ts", "watchdog.ts", "orchestrate.mts", "entrypoint.sh", or "workers/lib/" (except active files)
      2. Verify NONE appear under any "REMOVE" heading
    Expected Result: Zero deprecated files in removal categories
    Failure Indicators: Any deprecated file listed for removal
    Evidence: .sisyphus/evidence/task-3-deprecated-check.txt
  ```

  **Commit**: NO (triage is evidence, not code)

- [ ] 4. Clean stale dist/ artifacts

  **What to do**:
  - Verify dist/ is gitignored (confirmed in Task 1)
  - If dist/ IS gitignored: run `rm -rf dist/` then `pnpm build` to regenerate cleanly. The 20+ stale artifacts (generic-harness.mjs, tools/, mention-handler.js, feedback-handler.js, feedback-responder.js, feedback-summarizer.js, summarizer-trigger.js, guest-message-poller.js, learned-rules-expiry.js, monitor-trigger.js, unresponded-message-alert.js, admin-test.js, feedback-service.js, mention-handler.js, ngrok-client.js, pre-check-adapters/, locks/, kb/, postgres/, snobahn/) will not be regenerated since their source files are deleted
  - If dist/ is NOT gitignored (unexpected): do NOT delete — just record the finding and skip this task
  - Verify the rebuilt dist/ has fewer files than before

  **Must NOT do**:
  - Do not delete dist/ if it's committed to git
  - Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `.sisyphus/evidence/task-1-baseline.md` — dist/ gitignore status confirmed here

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: dist/ rebuilt cleanly without stale artifacts
    Tool: Bash
    Preconditions: Task 1 confirmed dist/ is gitignored
    Steps:
      1. Run `find dist/ -name "*.js" | wc -l` BEFORE cleanup — record count
      2. Run `rm -rf dist/ && pnpm build`
      3. Run `find dist/ -name "*.js" | wc -l` AFTER rebuild — record count
      4. Verify `ls dist/workers/tools/ 2>/dev/null` returns "No such file or directory"
      5. Verify `ls dist/workers/generic-harness.mjs 2>/dev/null` returns "No such file or directory"
    Expected Result: dist/ has fewer files. Stale artifact directories (tools/, locks/, kb/, etc.) are gone.
    Failure Indicators: dist/ file count unchanged or increased. Stale directories still present.
    Evidence: .sisyphus/evidence/task-4-dist-cleanup.txt

  Scenario: Build still works after dist/ rebuild
    Tool: Bash
    Preconditions: dist/ was deleted and rebuilt
    Steps:
      1. Run `pnpm build` — verify exit code 0
      2. Run `pnpm test -- --run 2>&1 | tail -5` — verify same pass count as baseline
    Expected Result: Build passes. Test count matches baseline.
    Failure Indicators: Build fails. Test count drops.
    Evidence: .sisyphus/evidence/task-4-post-rebuild-verify.txt
  ```

  **Commit**: NO (dist/ is gitignored — nothing to commit)

---

- [ ] 5. Remove unused source files

  **What to do**:
  - Read the triage report at `.sisyphus/evidence/task-3-triage.md`
  - For each file listed under "REMOVE — Unused File":
    1. Double-check with `lsp_find_references` on the file's primary export — verify zero references
    2. Check if the file has a corresponding test file — if so, remove the test file too
    3. Delete the file
  - After all removals, run `pnpm build` to verify no compilation errors
  - If any test files were removed, verify they were for deprecated/unused code only — never remove tests for active code

  **Must NOT do**:
  - Do not remove any file NOT listed in the triage report under "REMOVE — Unused File"
  - Do not remove deprecated files (lifecycle.ts, redispatch.ts, etc.)
  - Do not remove worker-tool files (src/worker-tools/\*\*)
  - Do not remove prisma files (prisma/migrations/\*, prisma/schema.prisma)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Source of Truth**:
  - `.sisyphus/evidence/task-3-triage.md` — The ONLY authority on what to remove. Do not improvise.

  **Safety References**:
  - `AGENTS.md` — Deprecated Components section lists files that MUST be preserved
  - `vitest.config.ts` — Check exclude patterns to understand which tests are already disabled

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All unused files removed, build still passes
    Tool: Bash
    Preconditions: Triage report exists with "REMOVE — Unused File" section
    Steps:
      1. Count files listed for removal in triage report
      2. After removals, verify each file no longer exists: `ls <path>` returns "No such file"
      3. Run `pnpm build` — verify exit code 0
      4. Run `pnpm test -- --run 2>&1 | tail -10` — verify tests pass
    Expected Result: All listed files removed. Build passes. Tests pass (count may decrease if test files for removed code were also removed).
    Failure Indicators: Build fails (import error pointing to removed file). Test count drops unexpectedly.
    Evidence: .sisyphus/evidence/task-5-removed-files.txt

  Scenario: No deprecated files accidentally removed
    Tool: Bash
    Preconditions: Removals complete
    Steps:
      1. Verify `ls src/inngest/lifecycle.ts` — exists
      2. Verify `ls src/inngest/redispatch.ts` — exists
      3. Verify `ls src/inngest/watchdog.ts` — exists
      4. Verify `ls src/workers/orchestrate.mts` — exists
      5. Verify `ls src/workers/entrypoint.sh` — exists
      6. Verify `ls src/inngest/triggers/guest-message-poll.ts` — exists
    Expected Result: All 6 deprecated files still present
    Failure Indicators: Any file missing
    Evidence: .sisyphus/evidence/task-5-deprecated-preserved.txt
  ```

  **Commit**: YES
  - Message: `chore(cleanup): remove unused source files`
  - Files: All removed .ts/.mts files + any removed test files
  - Pre-commit: `pnpm build`

---

- [ ] 6. Remove unused exports from retained files

  **What to do**:
  - Read the triage report at `.sisyphus/evidence/task-3-triage.md`
  - For each item listed under "REMOVE — Unused Export":
    1. Use `lsp_find_references` on the export symbol — verify zero references
    2. Remove ONLY the unused export (function, const, type, interface) — do not restructure the rest of the file
    3. If removing an export leaves an unused import in the same file, remove that import too
  - After all removals, run `pnpm build` to verify no compilation errors
  - Be especially careful with type exports — they may be consumed via `import type` which is erased at compile time but still needed for type-checking

  **Must NOT do**:
  - Do not refactor the file while removing exports — no restructuring, renaming, or reorganization
  - Do not remove exports that are used, even if they seem redundant
  - Do not touch deprecated files
  - Do not remove re-exports from barrel files (index.ts) without checking that the barrel itself isn't an entry point

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Source of Truth**:
  - `.sisyphus/evidence/task-3-triage.md` — "REMOVE — Unused Export" section

  **Pattern References**:
  - `src/lib/enrichment-adapters/index.ts` — Barrel file, check before removing any re-exports
  - `src/workers/lib/delivery-adapters/index.mts` — Another barrel file

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Unused exports removed, build passes
    Tool: Bash
    Preconditions: Triage report has "REMOVE — Unused Export" items
    Steps:
      1. Count exports listed for removal
      2. After removals, for each removed export: `grep -r "exportName" src/ --include="*.ts" --include="*.mts"` — verify zero matches (except in test files if the test itself was for the removed code)
      3. Run `pnpm build` — verify exit code 0
      4. Run `pnpm test -- --run` — verify tests pass
    Expected Result: All listed exports removed. Build passes. Tests pass.
    Failure Indicators: Build fails with "is not exported from" errors. Grep finds remaining references.
    Evidence: .sisyphus/evidence/task-6-removed-exports.txt

  Scenario: No accidental refactoring
    Tool: Bash
    Preconditions: All export removals complete
    Steps:
      1. Run `git diff --stat` — check that only removals occurred (lines removed > lines added)
      2. Verify no files were renamed
      3. Verify no new imports were added
    Expected Result: Changes are purely subtractive (removals only)
    Failure Indicators: Significant lines added. New imports. File renames.
    Evidence: .sisyphus/evidence/task-6-diff-check.txt
  ```

  **Commit**: YES
  - Message: `chore(cleanup): remove unused exports from retained files`
  - Files: Modified .ts/.mts files
  - Pre-commit: `pnpm build`

---

- [ ] 7. Remove unused npm dependencies

  **What to do**:
  - Read the triage report at `.sisyphus/evidence/task-3-triage.md`
  - For each item listed under "REMOVE — Unused Dependency":
    1. Verify the package is not used via a dynamic import or config reference: `grep -r "packageName" src/ scripts/ prisma/ --include="*.ts" --include="*.mts" --include="*.json"`
    2. Check if the package is a peer dependency or bin executable (e.g., `tsx` is used as a binary, not imported)
    3. If confirmed unused: `pnpm remove <package-name>`
  - After all removals, run `pnpm build && pnpm test -- --run` to verify nothing breaks
  - IMPORTANT: Some packages flagged by knip may be used as CLI tools (binaries) not as imports — these are NOT unused. Common examples: `tsx`, `vitest`, `eslint`, `prisma`, `inngest-cli`

  **Must NOT do**:
  - Do not upgrade any dependency versions
  - Do not remove packages used as CLI tools/binaries
  - Do not remove `@types/*` packages whose corresponding package is still in use

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Source of Truth**:
  - `.sisyphus/evidence/task-3-triage.md` — "REMOVE — Unused Dependency" section

  **Config References**:
  - `package.json` — Check `scripts` section for binary usage (e.g., `"lint": "eslint"` means eslint is used even if not imported)
  - `Dockerfile` — Check for `RUN npx` or binary invocations

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Unused deps removed, build and tests pass
    Tool: Bash
    Preconditions: Triage report has "REMOVE — Unused Dependency" items
    Steps:
      1. Run `pnpm remove <dep1> <dep2> ...` for all confirmed unused deps
      2. Run `pnpm build` — verify exit code 0
      3. Run `pnpm test -- --run` — verify tests pass
      4. Run `pnpm lint:unused` — verify no new "unlisted dependency" findings
    Expected Result: Dependencies removed. Build passes. Tests pass. No new knip findings.
    Failure Indicators: Build fails with "Cannot find module". Tests fail. New knip findings appear.
    Evidence: .sisyphus/evidence/task-7-removed-deps.txt

  Scenario: No CLI tools accidentally removed
    Tool: Bash
    Preconditions: Deps removed
    Steps:
      1. Run `pnpm tsx --version` — verify tsx still works
      2. Run `pnpm vitest --version` — verify vitest still works
      3. Run `pnpm eslint --version` — verify eslint still works
    Expected Result: All CLI tools still functional
    Failure Indicators: "command not found" for any tool
    Evidence: .sisyphus/evidence/task-7-cli-tools-check.txt
  ```

  **Commit**: YES
  - Message: `chore(deps): remove unused npm dependencies`
  - Files: `package.json`, `pnpm-lock.yaml`
  - Pre-commit: `pnpm build`

---

- [ ] 8. Audit and remove dead scripts

  **What to do**:
  - Check each of the following scripts not referenced in package.json:
    - `scripts/benchmark-classifier.ts`
    - `scripts/migrate-vlre-kb.ts`
    - `scripts/preflight-guest-messaging.ts`
    - `scripts/resolve-hostfully-uids.ts`
    - `scripts/verify-supabase.ts`
    - `scripts/generate-final-lock-map.mjs`
    - `scripts/merge-lock-map.mjs`
    - `scripts/dev-start.sh`
    - `scripts/generate-jwt-keys.sh`
    - `scripts/verify-container-boot.sh`
    - `scripts/verify-docker.sh`
    - `scripts/verify-e2e.sh`
    - `scripts/verify-phase1.sh`
    - `scripts/vlre-uid-mapping.json`
    - `scripts/cleanup-monitor-archetype.sql`
    - `scripts/long-running-sim/` directory
  - For EACH script, check all possible invocation sources:
    1. `grep -r "scriptname" .github/ 2>/dev/null` — CI/CD pipelines
    2. `grep -r "scriptname" Dockerfile docker/docker-compose.yml 2>/dev/null` — Docker
    3. `grep -r "scriptname" README.md AGENTS.md docs/ 2>/dev/null` — Documentation references
    4. `grep -r "scriptname" scripts/ src/ 2>/dev/null` — Other scripts/code importing it
    5. `git log --oneline -5 -- scripts/<scriptname>` — How recently was it modified?
  - Categorize each script:
    - **REMOVE**: Zero references anywhere, not recently modified, clearly one-off
    - **KEEP**: Referenced in docs, CI, or other scripts
    - **KEEP (utility)**: Useful for ad-hoc invocation even if not in package.json (e.g., telegram-notify.ts)
  - Remove all scripts categorized as REMOVE
  - If any kept script is referenced in docs, verify the doc reference is still accurate

  **Must NOT do**:
  - Do not remove `scripts/telegram-notify.ts` — it's used by the plan notification system
  - Do not remove scripts that are referenced in package.json (those are by definition "used")
  - Do not modify kept scripts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `package.json` scripts section — canonical list of "used" scripts
  - `README.md` Scripts section — documents some scripts
  - `AGENTS.md` — References `scripts/telegram-notify.ts`

  **Config References**:
  - `.github/` — CI pipeline definitions (if any)
  - `Dockerfile` — Script invocations during build

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dead scripts removed, referenced scripts preserved
    Tool: Bash
    Preconditions: Each script investigated for references
    Steps:
      1. For each removed script: `ls scripts/<name>` — verify "No such file"
      2. Verify `ls scripts/telegram-notify.ts` — still exists
      3. Verify all package.json-referenced scripts still exist: `ls scripts/dev.ts scripts/setup.ts scripts/trigger-task.ts scripts/verify-e2e.ts scripts/register-project.ts scripts/dev-e2e.ts scripts/fly-setup.ts scripts/migrate-feedback-data.ts scripts/setup-two-tenants.ts scripts/verify-multi-tenancy.ts`
      4. Run `pnpm build` — verify exit code 0
    Expected Result: Dead scripts gone. All referenced scripts present. Build passes.
    Failure Indicators: Referenced script missing. Build fails.
    Evidence: .sisyphus/evidence/task-8-script-audit.md

  Scenario: No documentation references to removed scripts left dangling
    Tool: Bash
    Preconditions: Scripts removed
    Steps:
      1. For each removed script: `grep -r "<removed-script-name>" README.md AGENTS.md docs/ 2>/dev/null`
      2. Verify zero matches (or note any that need doc updates for Task 10)
    Expected Result: No dangling references to removed scripts in documentation
    Failure Indicators: Documentation still references a removed script
    Evidence: .sisyphus/evidence/task-8-doc-references.txt
  ```

  **Commit**: YES
  - Message: `chore(cleanup): remove dead scripts`
  - Files: Removed script files
  - Pre-commit: `pnpm build`

- [ ] 9. Full build + test + Docker verification

  **What to do**:
  - Run the complete verification suite after all removals:
    1. `pnpm build` — TypeScript compilation, zero new errors
    2. `pnpm test -- --run` — full Vitest suite, compare pass count with Task 1 baseline
    3. `pnpm lint` — ESLint passes
    4. `docker build -t ai-employee-worker:latest .` — Docker image builds successfully (this catches missing worker tools or COPY failures)
    5. `pnpm lint:unused` — knip reports zero findings (all removals should satisfy knip)
  - If knip still reports findings after all removals, investigate:
    - If they're genuine unused code missed in triage → remove them now
    - If they're false positives → add them to knip.json `ignore` or `ignoreDependencies` and update the config
  - Record all results in evidence

  **Must NOT do**:
  - Do not ignore failing builds or tests — fix the root cause
  - Do not suppress legitimate knip findings with config changes — only false positives

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — must run after all Wave 2 tasks)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 4, 5, 6, 7, 8

  **References**:

  **Baseline References**:
  - `.sisyphus/evidence/task-1-baseline.md` — Pre-removal build/test results for comparison

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full verification suite passes
    Tool: Bash
    Preconditions: All Wave 2 tasks complete
    Steps:
      1. Run `pnpm build` — capture exit code and output
      2. Run `pnpm test -- --run` — capture pass/fail counts
      3. Run `pnpm lint` — capture exit code
      4. Run `docker build -t ai-employee-worker:latest . 2>&1 | tail -5` — capture exit code
      5. Run `pnpm lint:unused` — capture exit code and output
      6. Compare test pass count with baseline from Task 1
    Expected Result: All 5 commands exit 0. Test count matches or exceeds baseline (may decrease if tests for removed code were also removed — that's acceptable).
    Failure Indicators: Any command exits non-zero. Test count drops unexpectedly. knip reports findings.
    Evidence: .sisyphus/evidence/task-9-full-verification.txt

  Scenario: knip is clean (zero findings)
    Tool: Bash
    Preconditions: All removals complete
    Steps:
      1. Run `pnpm lint:unused 2>&1`
      2. Verify output contains no file paths (empty report)
      3. Verify exit code is 0
    Expected Result: knip reports nothing — codebase is clean
    Failure Indicators: Any findings reported. Non-zero exit code.
    Evidence: .sisyphus/evidence/task-9-knip-clean.txt
  ```

  **Commit**: YES (only if knip.json was updated to fix false positives)
  - Message: `chore(tooling): tune knip config for false positives`
  - Files: `knip.json`
  - Pre-commit: `pnpm lint:unused`

---

- [ ] 10. Final knip validation and documentation updates

  **What to do**:
  - If any files documented in AGENTS.md or README.md were removed, update those docs:
    - Check AGENTS.md "Reference Documents" table — remove rows pointing to deleted files
    - Check AGENTS.md "Project Structure" section — verify it still reflects reality
    - Check README.md "Scripts" table — remove rows for deleted scripts
    - Check README.md "Documentation" table — verify no broken references
  - If any dead scripts had doc references (found in Task 8), clean up those references
  - Run a final `pnpm lint:unused` to confirm zero findings
  - Create a summary of all changes at `.sisyphus/evidence/task-10-summary.md`:
    - Total files removed (count)
    - Total exports removed (count)
    - Total dependencies removed (list)
    - Total scripts removed (list)
    - Any knip config adjustments made

  **Must NOT do**:
  - Do not rewrite documentation sections beyond what's necessary for accuracy
  - Do not add new documentation about the cleanup process itself

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after Task 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 9

  **References**:

  **Doc References**:
  - `AGENTS.md` — Check all file paths mentioned, especially in "Deprecated Components", "Project Structure", and "Reference Documents"
  - `README.md` — Check "Scripts" table, "Documentation" table, "Project Structure" section

  **Evidence References**:
  - `.sisyphus/evidence/task-5-removed-files.txt` — List of removed source files
  - `.sisyphus/evidence/task-7-removed-deps.txt` — List of removed dependencies
  - `.sisyphus/evidence/task-8-script-audit.md` — List of removed scripts + doc reference check

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Documentation is accurate post-cleanup
    Tool: Bash
    Preconditions: All removals complete, Task 9 passed
    Steps:
      1. Run `grep -c "removed-file-name" AGENTS.md README.md` for each removed file — verify zero matches
      2. Run `pnpm lint:unused` — verify exit code 0
      3. Verify `.sisyphus/evidence/task-10-summary.md` exists and has all sections
    Expected Result: No documentation references to removed files. knip clean. Summary complete.
    Failure Indicators: Documentation still references removed files. knip reports findings.
    Evidence: .sisyphus/evidence/task-10-summary.md

  Scenario: Cleanup summary is comprehensive
    Tool: Bash
    Preconditions: Summary file created
    Steps:
      1. Verify summary has: files removed count, exports removed count, dependencies removed list, scripts removed list
      2. Cross-reference with individual task evidence files to ensure counts match
    Expected Result: Summary counts match individual task evidence
    Failure Indicators: Counts don't match. Missing sections.
    Evidence: .sisyphus/evidence/task-10-summary.md
  ```

  **Commit**: YES
  - Message: `docs: update AGENTS.md and README after dead code cleanup`
  - Files: `AGENTS.md`, `README.md` (only if changed)
  - Pre-commit: `pnpm build`

---

- [ ] 11. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "🧹 Dead code cleanup complete — all unused files, exports, and dependencies removed. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after all work)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 10

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: All tasks complete
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "🧹 Dead code cleanup complete — all unused files, exports, and dependencies removed. Come back to review results."`
      2. Verify exit code 0
    Expected Result: Notification sent successfully
    Failure Indicators: Non-zero exit code. Network error.
    Evidence: .sisyphus/evidence/task-11-notification.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Verify no new TypeScript errors introduced. Check that knip.json is valid JSON with all required fields. Verify package.json has `lint:unused` script. Check that no AI slop was introduced (unnecessary comments, over-abstraction).
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Config [VALID/INVALID] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Run `pnpm lint:unused` and verify exit code 0. Run `docker build -t ai-employee-worker:latest .` and verify it succeeds. Verify no deprecated files were accidentally removed by checking each file in the AGENTS.md deprecated list still exists. Spot-check 5 removed files via `git log --diff-filter=D --name-only` to confirm they were truly unused.
      Output: `Knip [PASS/FAIL] | Docker [PASS/FAIL] | Deprecated preserved [N/N] | Spot checks [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log --oneline` + `git diff`). Verify 1:1 — everything in spec was done, nothing beyond spec was done. Check no refactoring occurred (only removals). Check no deprecated files touched. Check no dependency upgrades (only removals). Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | No refactoring [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                              | Files                            |
| ---- | ----------------------------------------------------------- | -------------------------------- |
| 1    | `chore(tooling): add knip for dead code detection`          | knip.json, package.json          |
| 2a   | `chore(cleanup): remove unused source files`                | Removed .ts/.mts files           |
| 2b   | `chore(cleanup): remove unused exports from retained files` | Modified .ts files               |
| 2c   | `chore(deps): remove unused npm dependencies`               | package.json, pnpm-lock.yaml     |
| 2d   | `chore(cleanup): remove dead scripts`                       | Removed scripts/\*.ts files      |
| 3    | `chore(cleanup): rebuild dist and update documentation`     | AGENTS.md, README.md (if needed) |

---

## Success Criteria

### Verification Commands

```bash
pnpm lint:unused          # Expected: exit 0, zero findings
pnpm build                # Expected: exit 0, no new errors
pnpm test -- --run        # Expected: 515+ passing
docker build -t ai-employee-worker:latest .  # Expected: exit 0
cat knip.json             # Expected: valid JSON with entry/ignore config
grep "lint:unused" package.json  # Expected: match found
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image builds
- [ ] knip reports zero issues
- [ ] Deprecated files untouched
