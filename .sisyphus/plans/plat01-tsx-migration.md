# PLAT-01: Migrate Worker-Tool Execution to tsx

## TL;DR

> **Quick Summary**: Switch all 7 worker shell tools from compiled JavaScript (`node dist/.../*.js`) to direct TypeScript execution via `tsx`. Affects: Dockerfile, 5 test files, archetype seed instructions, AGENTS.md, story map documentation.
>
> **Deliverables**:
>
> - Dockerfile updated: tsx installed globally, `.ts` source copied to `/tools/`, compiled JS COPY lines removed
> - 5 test files updated: `execFile('node', ...)` → `execFile('npx', ['tsx', ...])`, SCRIPT_PATH → `src/.../*.ts`
> - `prisma/seed.ts` instructions updated: `node /tools/.../*.js` → `tsx /tools/.../*.ts`
> - `AGENTS.md` shell tool syntax updated
> - Story map Shell Tool Convention section updated + PLAT-01 ACs marked `[x]`
> - All existing story map ACs (HF-02/03/04) updated to reflect new invocation pattern
>
> **Estimated Effort**: Medium (M)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → F1-F4

---

## Context

### Original Request

Migrate all worker-tool execution from compiled JavaScript to tsx. The user wants everything running as TypeScript — no dual-path, no compiled JS for worker-tools. Tests, Docker runtime, archetype seed instructions — all switch. Accepted ~200-500ms startup overhead per invocation. Mark story map ACs when complete.

### Interview Summary

**Key Discussions**:

- User rejected the dual-path approach (compiled JS for execution + TS for reading) as unnecessary complexity
- Accepted tsx startup overhead as an acceptable tradeoff
- Wants a `report-issue.ts` tool for AI employee self-reporting (PLAT-03, separate session)
- Wants static AGENTS.md in Docker (PLAT-02, separate session)

**Research Findings**:

- 7 worker tools: 5 hostfully (no npm imports), 2 slack (import `@slack/web-api`)
- 5 test files (all hostfully) — no Slack tests exist
- `tsx` already in devDependencies (`^4.0.0`)
- Slack tools' `@slack/web-api` is installed at `/tools/slack/node_modules/` — placing `.ts` files alongside it enables standard Node resolution
- 2 archetype seeds reference only Slack tools: `node /tools/slack/read-channels.js` and `node /tools/slack/post-message.js`
- AGENTS.md has 2 lines referencing `node /tools/slack/*.js` that need updating
- `tsconfig.build.json` includes `src/**/*` — still compiles worker-tools to `dist/` (dead artifacts, harmless)

### Metis Review

**Identified Gaps** (addressed):

- **AGENTS.md not in original scope**: Added as explicit task — AGENTS.md is loaded into every LLM call, stale tool syntax would cause runtime failures
- **Already-checked `[x]` story map ACs reference `node /tools/*.js`**: Added to scope — leaving contradictory docs is a trap for future agents
- **Future unchecked `[ ]` ACs also reference old pattern**: Added to scope — prevents each future story from needing to discover the change
- **Slack `node_modules` resolution**: Validated — `.ts` files in `/tools/slack/` alongside `node_modules/` works via standard Node module resolution (walks up from file location)
- **`NODE_NO_WARNINGS=1` with tsx**: Works identically — it's a Node.js env var, tsx respects it
- **`npx tsx` vs `tsx` in Docker**: Use `tsx` directly when globally installed (no npx overhead, no network fallback risk)
- **Docker smoke test uses `--entrypoint npx`**: Changed to `--entrypoint tsx` since tsx is globally installed
- **`tsconfig.build.json` still compiles worker-tools**: Accepted — dead `dist/worker-tools/` artifacts are harmless, cleaning them up is scope creep

---

## Work Objectives

### Core Objective

Make worker tools execute directly from TypeScript source so that mid-task patches by AI employees take effect immediately without compilation.

### Concrete Deliverables

- `Dockerfile` updated (tsx global install, `.ts` COPY, remove compiled JS COPY for worker-tools)
- 5 test files in `tests/worker-tools/hostfully/` updated
- `prisma/seed.ts` archetype instructions updated
- `AGENTS.md` shell tool syntax lines updated
- `docs/2026-04-21-2202-phase1-story-map.md` Shell Tool Convention + all tool invocation references updated + PLAT-01 ACs marked `[x]`

### Definition of Done

- [ ] `pnpm build` → exit 0
- [ ] `pnpm test -- --run` → all worker-tool tests pass (44+ tests across 5 files)
- [ ] `docker build -t ai-employee-worker:latest .` → exit 0
- [ ] `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/hostfully/get-messages.ts --help` → exit 0
- [ ] `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/slack/post-message.ts --help` → exit 0
- [ ] All PLAT-01 ACs in story map marked `[x]`

### Must Have

- All 7 worker tools executable via `tsx` in Docker (both hostfully and slack)
- All 5 test files updated to invoke `npx tsx src/.../*.ts` instead of `node dist/.../*.js`
- Archetype seed instructions use `tsx /tools/.../*.ts` invocation pattern
- AGENTS.md uses `tsx /tools/.../*.ts` invocation pattern
- Story map documents the new execution model
- Slack `@slack/web-api` npm dep still resolves in Docker

### Must NOT Have (Guardrails)

- MUST NOT touch `src/gateway/`, `src/inngest/`, `src/workers/opencode-harness.mts`
- MUST NOT modify deprecated files (lifecycle.ts, redispatch.ts, orchestrate.mts, etc.)
- MUST NOT add new test files (no Slack tests, no new test files)
- MUST NOT add tsx as a production dependency — it stays in devDependencies for tests
- MUST NOT modify `tsconfig.build.json` — dead `dist/worker-tools/` artifacts are harmless
- MUST NOT add `package.json` files to `/tools/` directories
- MUST NOT touch `dist/` contents manually — `pnpm build` handles that

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest, `pnpm test`)
- **Automated tests**: YES (update existing tests — no new tests)
- **Framework**: Vitest (`npx vitest run`)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Docker**: Bash — build image, run container, verify tool execution via tsx
- **Tests**: Bash — run vitest, verify pass count unchanged
- **Seed**: Bash — run prisma db seed, verify exit 0
- **CLI tools**: Bash — run with tsx, check stdout/stderr/exit code

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — Docker + tests, can run in parallel):
├── Task 1: Update Dockerfile (tsx install, .ts COPY, remove compiled JS COPY) [quick]
├── Task 2: Update all 5 test files (SCRIPT_PATH + execFile changes) [quick]

Wave 2 (After Wave 1 — seed + docs):
├── Task 3: Update archetype seed instructions in prisma/seed.ts [quick]
├── Task 4: Update AGENTS.md + story map doc (Shell Tool Convention + all tool refs) [quick]

Wave 3 (After Wave 2 — mark ACs):
├── Task 5: Mark PLAT-01 story map ACs as [x] [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| 1     | None       | 3, 5   | 1     |
| 2     | None       | 5      | 1     |
| 3     | 1          | 5      | 2     |
| 4     | None       | 5      | 2     |
| 5     | 1, 2, 3, 4 | F1-F4  | 3     |
| F1-F4 | 5          | None   | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 2 tasks — T3 → `quick`, T4 → `quick`
- **Wave 3**: 1 task — T5 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [x] 1. Update Dockerfile — Install tsx globally + copy .ts source instead of compiled JS

  **What to do**:
  - Add `RUN npm install -g tsx` after the `RUN npm install -g opencode-ai@1.3.3` line (line 48)
  - Replace Slack tool COPY lines (lines 59-60):
    - Remove: `COPY --from=builder /build/dist/worker-tools/slack/read-channels.js /tools/slack/read-channels.js`
    - Remove: `COPY --from=builder /build/dist/worker-tools/slack/post-message.js /tools/slack/post-message.js`
    - Add: `COPY --from=builder /build/src/worker-tools/slack/read-channels.ts /tools/slack/read-channels.ts`
    - Add: `COPY --from=builder /build/src/worker-tools/slack/post-message.ts /tools/slack/post-message.ts`
  - Keep: `RUN npm install --prefix /tools/slack @slack/web-api@^7.15.1` (unchanged — Slack tools still need this dep)
  - Replace Hostfully tool COPY lines (lines 64-68):
    - Remove all 5 `.js` COPY lines for hostfully tools
    - Add 5 `.ts` COPY lines: `COPY --from=builder /build/src/worker-tools/hostfully/<name>.ts /tools/hostfully/<name>.ts` for validate-env, get-property, get-properties, get-reservations, get-messages

  **Must NOT do**:
  - MUST NOT remove the `RUN npm install --prefix /tools/slack @slack/web-api@^7.15.1` line
  - MUST NOT touch lines before 48 or after 73 (only the tool-related section)
  - MUST NOT add a `package.json` to `/tools/`
  - MUST NOT modify entrypoint.sh or opencode.json COPY lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change with clear line-by-line edits
  - **Skills**: `[]`
    - No special skills needed — straightforward file editing
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — simple single-file commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `Dockerfile:48` — `RUN npm install -g opencode-ai@1.3.3` — model this for `tsx` global install (add line right after)
  - `Dockerfile:58-68` — Current worker-tool COPY block — the lines being replaced
  - `Dockerfile:61` — `RUN npm install --prefix /tools/slack @slack/web-api@^7.15.1` — KEEP THIS LINE, do not remove

  **API/Type References**:
  - None

  **Test References**:
  - None (Docker smoke tests are QA scenarios below)

  **External References**:
  - tsx npm: `https://www.npmjs.com/package/tsx` — global install syntax: `npm install -g tsx`

  **WHY Each Reference Matters**:
  - `Dockerfile:48` — shows the exact pattern for adding a global npm install in the runtime stage
  - `Dockerfile:58-68` — these are the exact lines to replace; the builder stage has both `src/` and `dist/` available since `COPY src/ ./src/` happens at line 11
  - `Dockerfile:61` — critical line that must survive the edit — Slack tools import `@slack/web-api` and need this at runtime

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully with tsx and .ts tools
    Tool: Bash
    Preconditions: Docker daemon running
    Steps:
      1. Run `docker build -t ai-employee-worker:latest .`
      2. Verify exit code is 0
    Expected Result: Image builds without errors
    Failure Indicators: Build fails at tsx install step or COPY step (file not found in builder)
    Evidence: .sisyphus/evidence/task-1-docker-build.txt

  Scenario: tsx is globally available inside the container
    Tool: Bash
    Preconditions: Image built from previous scenario
    Steps:
      1. Run `docker run --rm --entrypoint tsx ai-employee-worker:latest --version`
      2. Verify exit code is 0 and output contains a version number
    Expected Result: tsx prints version (e.g., `tsx/4.x.x node/v20.x.x`)
    Failure Indicators: `tsx: not found` or non-zero exit code
    Evidence: .sisyphus/evidence/task-1-tsx-version.txt

  Scenario: Hostfully tool executes via tsx in container
    Tool: Bash
    Preconditions: Image built
    Steps:
      1. Run `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/hostfully/get-messages.ts --help`
      2. Verify exit code is 0 and output contains usage information
    Expected Result: Tool prints help/usage text without TypeScript compilation errors
    Failure Indicators: TypeScript errors, module resolution failures, non-zero exit
    Evidence: .sisyphus/evidence/task-1-hostfully-smoke.txt

  Scenario: Slack tool executes via tsx in container (with @slack/web-api resolution)
    Tool: Bash
    Preconditions: Image built
    Steps:
      1. Run `docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/slack/post-message.ts --help`
      2. Verify exit code is 0 (or exits with a usage/missing-args error, NOT a module resolution error)
    Expected Result: Tool starts without `Cannot find module '@slack/web-api'` errors
    Failure Indicators: `ERR_MODULE_NOT_FOUND` for `@slack/web-api`, TypeScript errors
    Evidence: .sisyphus/evidence/task-1-slack-smoke.txt

  Scenario: No compiled JS files in /tools/ (negative test)
    Tool: Bash
    Preconditions: Image built
    Steps:
      1. Run `docker run --rm --entrypoint sh ai-employee-worker:latest -c "ls /tools/slack/ /tools/hostfully/"`
      2. Verify output contains only `.ts` files (no `.js` files except those in `node_modules/`)
    Expected Result: Only `.ts` tool files present in `/tools/slack/` and `/tools/hostfully/` root
    Failure Indicators: `.js` files present at tool root level (not inside node_modules)
    Evidence: .sisyphus/evidence/task-1-no-compiled-js.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-1-{scenario-slug}.txt
  - [ ] Terminal output for all 5 Docker scenarios

  **Commit**: YES
  - Message: `build(docker): migrate worker tools from compiled JS to tsx execution`
  - Files: `Dockerfile`
  - Pre-commit: `docker build -t ai-employee-worker:latest .`

---

- [x] 2. Update all 5 test files — SCRIPT_PATH to .ts source + execFile to npx tsx

  **What to do**:
  - For all 5 test files in `tests/worker-tools/hostfully/`, make these changes:

  **Variant A — args + env tests (4 files: get-messages, get-reservations, get-properties, get-property):**
  - Change SCRIPT_PATH from `path.resolve(__dirname, '../../../dist/worker-tools/hostfully/<name>.js')` to `path.resolve(__dirname, '../../../src/worker-tools/hostfully/<name>.ts')`
  - Change `execFile('node', [SCRIPT_PATH, ...args], ...)` to `execFile('npx', ['tsx', SCRIPT_PATH, ...args], ...)`

  **Variant B — env-only test (1 file: validate-env):**
  - Change SCRIPT_PATH from `path.resolve(__dirname, '../../../dist/worker-tools/hostfully/validate-env.js')` to `path.resolve(__dirname, '../../../src/worker-tools/hostfully/validate-env.ts')`
  - Change `execFile('node', [SCRIPT_PATH], ...)` to `execFile('npx', ['tsx', SCRIPT_PATH], ...)`

  **Must NOT do**:
  - MUST NOT add new test files
  - MUST NOT change any test assertions or test data
  - MUST NOT modify imports or describe/it blocks
  - MUST NOT touch anything outside the SCRIPT_PATH declaration and runScript function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Repetitive search-and-replace across 5 files, identical pattern
  - **Skills**: `[]`
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — simple multi-file commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `tests/worker-tools/hostfully/get-messages.test.ts:6` — `const SCRIPT_PATH = path.resolve(__dirname, '../../../dist/worker-tools/hostfully/get-messages.js');` — change `dist` to `src`, `.js` to `.ts`
  - `tests/worker-tools/hostfully/get-messages.test.ts:13-15` — `execFile('node', [SCRIPT_PATH, ...args], ...)` — change `'node'` to `'npx'`, prepend `'tsx'` to args array
  - `tests/worker-tools/hostfully/get-reservations.test.ts:6-9` — Multi-line SCRIPT_PATH variant (same change pattern)
  - `tests/worker-tools/hostfully/get-properties.test.ts:6-9` — Multi-line SCRIPT_PATH variant
  - `tests/worker-tools/hostfully/get-property.test.ts:6` — Single-line SCRIPT_PATH
  - `tests/worker-tools/hostfully/validate-env.test.ts:5` — SCRIPT_PATH for validate-env
  - `tests/worker-tools/hostfully/validate-env.test.ts:11` — `execFile('node', [SCRIPT_PATH], ...)` — Variant B: no `...args`, just `[SCRIPT_PATH]` → `['tsx', SCRIPT_PATH]`

  **API/Type References**:
  - None

  **Test References**:
  - The files being modified ARE the tests — verify by running them

  **External References**:
  - None

  **WHY Each Reference Matters**:
  - Each reference shows the exact line(s) to modify in each file — the executor must change both SCRIPT_PATH and the execFile call in each of the 5 files
  - validate-env.test.ts is the one variant with a different runScript signature (no args parameter) — executor must not accidentally add `...args` to it

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 44+ worker-tool tests pass with tsx execution
    Tool: Bash
    Preconditions: `pnpm build` has been run (tsx in devDependencies available via npx)
    Steps:
      1. Run `npx vitest run tests/worker-tools/ 2>&1`
      2. Count total tests passed
      3. Verify zero test failures
    Expected Result: All tests pass (44+ tests across 5 files, 0 failures)
    Failure Indicators: Any test failure, tsx resolution error, timeout
    Evidence: .sisyphus/evidence/task-2-vitest-results.txt

  Scenario: No references to dist/ or .js remain in test files (negative test)
    Tool: Bash
    Preconditions: Test files updated
    Steps:
      1. Run `grep -rn "dist/worker-tools" tests/worker-tools/` — should return no matches
      2. Run `grep -rn "\.js'" tests/worker-tools/hostfully/` — should return no matches (checking for '.js' in SCRIPT_PATH strings)
    Expected Result: Both grep commands return no matches (exit code 1)
    Failure Indicators: Any grep match found — means a file was missed
    Evidence: .sisyphus/evidence/task-2-no-dist-refs.txt

  Scenario: SCRIPT_PATH points to existing .ts source files
    Tool: Bash
    Preconditions: Test files updated
    Steps:
      1. Run `grep -rn "SCRIPT_PATH" tests/worker-tools/hostfully/` — collect all 5 paths
      2. For each path extracted, verify the referenced `.ts` source file exists in `src/worker-tools/hostfully/`
    Expected Result: All 5 SCRIPT_PATH values reference existing `.ts` files
    Failure Indicators: Any referenced file does not exist
    Evidence: .sisyphus/evidence/task-2-script-paths-valid.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-2-{scenario-slug}.txt
  - [ ] Vitest output showing all tests pass

  **Commit**: YES
  - Message: `test(worker-tools): migrate test execution from node to tsx`
  - Files: `tests/worker-tools/hostfully/get-messages.test.ts`, `tests/worker-tools/hostfully/get-reservations.test.ts`, `tests/worker-tools/hostfully/get-properties.test.ts`, `tests/worker-tools/hostfully/get-property.test.ts`, `tests/worker-tools/hostfully/validate-env.test.ts`
  - Pre-commit: `npx vitest run tests/worker-tools/`

---

- [x] 3. Update archetype seed instructions — node → tsx, .js → .ts

  **What to do**:
  - In `prisma/seed.ts`, update `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` (lines 159-172):
    - Line 161: `node /tools/slack/read-channels.js` → `tsx /tools/slack/read-channels.ts`
    - Line 168: `NODE_NO_WARNINGS=1 node /tools/slack/post-message.js` → `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts`
    - Line 172: `node /tools/slack/post-message.js` → `tsx /tools/slack/post-message.ts`
  - Update `VLRE_SUMMARIZER_INSTRUCTIONS` (lines 174-187):
    - Line 176: `node /tools/slack/read-channels.js` → `tsx /tools/slack/read-channels.ts`
    - Line 183: `NODE_NO_WARNINGS=1 node /tools/slack/post-message.js` → `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts`
    - Line 187: `node /tools/slack/post-message.js` → `tsx /tools/slack/post-message.ts`
  - Total: 6 replacements (3 per archetype × 2 archetypes)

  **Must NOT do**:
  - MUST NOT change channel IDs, text content, or any non-tool-invocation parts of the instructions
  - MUST NOT modify archetype upsert fields (id, role_name, model, etc.)
  - MUST NOT change `NODE_NO_WARNINGS=1` prefix — it stays (works with tsx identically)
  - MUST NOT touch any other seed data (tenants, departments, etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, 6 string replacements with identical pattern
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — simple single-file commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1 (seed should reflect Docker reality — Docker must have tsx + .ts files before we tell the AI to use them)

  **References**:

  **Pattern References** (existing code to follow):
  - `prisma/seed.ts:159-172` — `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` — full string with 3 `node /tools/slack/*.js` invocations
  - `prisma/seed.ts:174-187` — `VLRE_SUMMARIZER_INSTRUCTIONS` — full string with 3 `node /tools/slack/*.js` invocations

  **WHY Each Reference Matters**:
  - Lines 159-172 and 174-187 are the exact instruction strings — each contains exactly 3 `node /tools/slack/*.js` patterns to replace. The executor must find ALL 3 in each string (read-channels + post-message approval + post-message delivery)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully with updated instructions
    Tool: Bash
    Preconditions: Database running (`pnpm dev:start` or Docker Compose up)
    Steps:
      1. Run `pnpm prisma db seed 2>&1`
      2. Verify exit code is 0
      3. Verify output contains seed confirmation messages
    Expected Result: Seed completes without errors
    Failure Indicators: Prisma seed error, syntax error in seed.ts
    Evidence: .sisyphus/evidence/task-3-seed-result.txt

  Scenario: No node/js references remain in seed tool invocations (negative test)
    Tool: Bash
    Preconditions: seed.ts updated
    Steps:
      1. Run `grep -n "node /tools/" prisma/seed.ts` — should return no matches
      2. Run `grep -n "/tools/slack/.*\.js" prisma/seed.ts` — should return no matches
    Expected Result: Both greps return no matches (exit code 1)
    Failure Indicators: Any match found — a tool invocation was missed
    Evidence: .sisyphus/evidence/task-3-no-node-refs.txt

  Scenario: Updated instructions contain tsx invocations
    Tool: Bash
    Preconditions: seed.ts updated
    Steps:
      1. Run `grep -c "tsx /tools/" prisma/seed.ts`
      2. Verify count is exactly 6 (3 per archetype x 2 archetypes)
    Expected Result: Exactly 6 `tsx /tools/` references found
    Failure Indicators: Count is not 6
    Evidence: .sisyphus/evidence/task-3-tsx-count.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-3-{scenario-slug}.txt
  - [ ] Seed output and grep verification

  **Commit**: YES
  - Message: `chore(seed): update archetype instructions to use tsx for tool execution`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm prisma db seed`

---

- [x] 4. Update AGENTS.md + story map documentation — all tool invocation references

  **What to do**:

  **AGENTS.md (2 changes):**
  - Line 62: `NODE_NO_WARNINGS=1 node /tools/slack/post-message.js --channel "C123" --text "msg" --task-id "uuid" > /tmp/approval-message.json` → `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "C123" --text "msg" --task-id "uuid" > /tmp/approval-message.json`
  - Line 64: `node /tools/slack/read-channels.js --channels "C123,C456" --lookback-hours 24` → `tsx /tools/slack/read-channels.ts --channels "C123,C456" --lookback-hours 24`

  **Story map — Shell Tool Convention section (lines 33-41):**
  - Line 35: Change description to explain tsx execution model (not compiled JS)
  - Remove "Compiled" bullet point (line 38)
  - Line 39: Change Docker path from `.js` to `.ts`
  - Line 41: Update explanation — tools are now TypeScript source executed via tsx, not compiled JS

  **Story map — ALL tool invocation references throughout the document:**
  - Already-checked `[x]` ACs (HF-02/03/04):
    - Line 204: `node /tools/hostfully/get-property.js` → `tsx /tools/hostfully/get-property.ts`
    - Line 226: `node /tools/hostfully/get-reservations.js` → `tsx /tools/hostfully/get-reservations.ts`
    - Line 248: `node /tools/hostfully/get-messages.js` → `tsx /tools/hostfully/get-messages.ts`
  - Unchecked `[ ]` ACs (future stories):
    - Line 321: `node /tools/platform/report-issue.js` → `tsx /tools/platform/report-issue.ts`
    - Line 328: Update parenthetical note about compiled path
    - Line 370: `node /tools/hostfully/send-message.js` → `tsx /tools/hostfully/send-message.ts`
    - Line 393: `node /tools/hostfully/get-reviews.js` → `tsx /tools/hostfully/get-reviews.ts`
    - Line 462: `node /tools/kb/search.js` → `tsx /tools/kb/search.ts`
    - Line 1099: `node /tools/hostfully/get-calendar.js` → `tsx /tools/hostfully/get-calendar.ts`
  - PLAT-01 Notes (line 272): Update `node dist/worker-tools/.../*.js` references to reflect tsx execution
  - PLAT-01 AC line 280: Update Docker smoke test from `--entrypoint npx ... tsx` to `--entrypoint tsx`

  **Must NOT do**:
  - MUST NOT change channel IDs, property IDs, or any non-tool-invocation content
  - MUST NOT modify story complexity, dependencies, or role assignments
  - MUST NOT change checkbox states (`[x]` or `[ ]`) — that's Task 5
  - MUST NOT modify any content outside AGENTS.md and the story map

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Text replacements across 2 files, mechanical changes
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — straightforward multi-file commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: None (documentation can be updated independently)

  **References**:

  **Pattern References** (existing code to follow):
  - `AGENTS.md:62` — `NODE_NO_WARNINGS=1 node /tools/slack/post-message.js ...` — change `node` → `tsx`, `.js` → `.ts`
  - `AGENTS.md:64` — `node /tools/slack/read-channels.js ...` — same pattern
  - `docs/2026-04-21-2202-phase1-story-map.md:33-41` — Shell Tool Convention section — needs rewrite to reflect tsx model
  - `docs/2026-04-21-2202-phase1-story-map.md:204,226,248` — Already-checked HF-02/03/04 ACs with `node /tools/` refs
  - `docs/2026-04-21-2202-phase1-story-map.md:321,328,370,393,462,1099` — Future story ACs with `node /tools/` refs

  **WHY Each Reference Matters**:
  - AGENTS.md is loaded into every LLM call — stale syntax causes AI employees to use wrong invocation commands at runtime
  - Already-checked `[x]` ACs referencing old pattern create confusion for anyone reading the story map
  - Future `[ ]` ACs must match the new convention so implementers use the right pattern

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No node/js tool invocations remain in AGENTS.md
    Tool: Bash
    Preconditions: AGENTS.md updated
    Steps:
      1. Run `grep -n "node /tools/" AGENTS.md` — should return no matches
      2. Run `grep -n "/tools/.*\.js" AGENTS.md` — should return no matches
      3. Run `grep -c "tsx /tools/" AGENTS.md` — verify count is 2
    Expected Result: Zero old-pattern matches, exactly 2 new-pattern matches
    Failure Indicators: Any old-pattern match found, or new-pattern count not 2
    Evidence: .sisyphus/evidence/task-4-agents-md.txt

  Scenario: No node/js tool invocations remain in story map
    Tool: Bash
    Preconditions: Story map updated
    Steps:
      1. Run `grep -n "node /tools/" docs/2026-04-21-2202-phase1-story-map.md` — should return no matches
      2. Run `grep -c "tsx /tools/" docs/2026-04-21-2202-phase1-story-map.md` — verify count is 8+
    Expected Result: Zero old-pattern matches, 8+ new-pattern matches
    Failure Indicators: Any old-pattern match found
    Evidence: .sisyphus/evidence/task-4-story-map-refs.txt

  Scenario: Shell Tool Convention section reflects tsx model (negative test for "Compiled" row)
    Tool: Bash
    Preconditions: Story map updated
    Steps:
      1. Read lines 33-45 of the story map
      2. Verify "Compiled" row is removed (no `dist/worker-tools` reference in convention section)
      3. Verify Docker path shows `.ts` extension
      4. Verify `tsx` is mentioned as the execution runtime
    Expected Result: Convention section describes tsx execution model without compiled JS references
    Failure Indicators: "Compiled" row still present, or `.js` in Docker path
    Evidence: .sisyphus/evidence/task-4-convention-section.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-4-{scenario-slug}.txt
  - [ ] Grep results for both files

  **Commit**: YES
  - Message: `docs: update tool invocation references from node to tsx`
  - Files: `AGENTS.md`, `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: None (documentation only)

---

- [x] 5. Mark PLAT-01 acceptance criteria as complete in story map

  **What to do**:
  - In `docs/2026-04-21-2202-phase1-story-map.md`, change all 7 PLAT-01 ACs from `[ ]` to `[x]`:
    - Line 276: `- [ ] Dockerfile: .ts source files copied...` → `- [x] Dockerfile: .ts source files copied...`
    - Line 277: `- [ ] All worker-tool tests updated...` → `- [x] All worker-tool tests updated...`
    - Line 278: `- [ ] pnpm test -- --run passes...` → `- [x] pnpm test -- --run passes...`
    - Line 279: `- [ ] Archetype seed instructions updated...` → `- [x] Archetype seed instructions updated...`
    - Line 280: `- [ ] Docker smoke test...` → `- [x] Docker smoke test...`
    - Line 281: `- [ ] Shell Tool Convention section...` → `- [x] Shell Tool Convention section...`
    - Line 282: `- [ ] pnpm build still exits 0...` → `- [x] pnpm build still exits 0...`

  **Must NOT do**:
  - MUST NOT change any non-PLAT-01 checkboxes
  - MUST NOT modify AC text content (only change `[ ]` → `[x]`)
  - MUST NOT touch any other section of the story map

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial checkbox toggle on 7 lines in one file
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — one-line-each changes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after Tasks 1-4)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4 (all must be complete before marking ACs done)

  **References**:

  **Pattern References** (existing code to follow):
  - `docs/2026-04-21-2202-phase1-story-map.md:274-282` — PLAT-01 Acceptance Criteria section — exactly 7 `- [ ]` lines to mark `[x]`
  - `docs/2026-04-21-2202-phase1-story-map.md:196-204` — HF-02 ACs (already `[x]`) — reference for how completed ACs look

  **WHY Each Reference Matters**:
  - Lines 276-282 are the exact 7 lines to toggle — executor must not accidentally mark other story ACs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 7 PLAT-01 ACs are marked complete
    Tool: Bash
    Preconditions: Story map updated by Tasks 1-4
    Steps:
      1. Run `sed -n '274,282p' docs/2026-04-21-2202-phase1-story-map.md`
      2. Count lines containing `- [x]` — should be exactly 7
      3. Count lines containing `- [ ]` — should be exactly 0
    Expected Result: All 7 PLAT-01 ACs show `[x]`
    Failure Indicators: Any `[ ]` remaining in PLAT-01 AC section
    Evidence: .sisyphus/evidence/task-5-plat01-acs.txt

  Scenario: No non-PLAT-01 checkboxes were accidentally changed (negative test)
    Tool: Bash
    Preconditions: Story map updated
    Steps:
      1. Run `git diff docs/2026-04-21-2202-phase1-story-map.md` — check diff
      2. Verify all `[ ]` → `[x]` changes are within lines 274-282 (PLAT-01 section only)
      3. No other checkbox changes outside that range
    Expected Result: Only PLAT-01 ACs changed, all other checkboxes untouched
    Failure Indicators: Checkbox changes outside lines 274-282
    Evidence: .sisyphus/evidence/task-5-no-accidental-changes.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-5-{scenario-slug}.txt
  - [ ] Sed output and git diff

  **Commit**: YES
  - Message: `docs(story-map): mark PLAT-01 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: None (documentation only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read `.sisyphus/plans/plat01-tsx-migration.md` end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [5/5] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: syntax errors, broken string interpolation in seed.ts, stale references. Verify no `dist/worker-tools/*.js` paths remain in any changed file. Check Dockerfile layers are reasonable.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Build Docker image and run all smoke tests. Run vitest for worker-tools. Run prisma db seed. Test cross-task integration (Docker image uses tsx to run the exact tools whose paths are in the seed instructions). Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance for each task. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [5/5 compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit | Message                                                                    | Files                                                   |
| ---- | ------ | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1    | Task 1 | `build(docker): migrate worker tools from compiled JS to tsx execution`    | `Dockerfile`                                            |
| 1    | Task 2 | `test(worker-tools): migrate test execution from node to tsx`              | `tests/worker-tools/hostfully/*.test.ts` (5 files)      |
| 2    | Task 3 | `chore(seed): update archetype instructions to use tsx for tool execution` | `prisma/seed.ts`                                        |
| 2    | Task 4 | `docs: update tool invocation references from node to tsx`                 | `AGENTS.md`, `docs/2026-04-21-2202-phase1-story-map.md` |
| 3    | Task 5 | `docs(story-map): mark PLAT-01 acceptance criteria complete`               | `docs/2026-04-21-2202-phase1-story-map.md`              |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                          # Expected: exit 0
npx vitest run tests/worker-tools/  # Expected: 44+ tests pass, 0 failures
pnpm prisma db seed                 # Expected: exit 0
docker build -t ai-employee-worker:latest .  # Expected: exit 0
docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/hostfully/get-messages.ts --help  # Expected: exit 0
docker run --rm --entrypoint tsx ai-employee-worker:latest /tools/slack/post-message.ts --help      # Expected: exit 0
grep -c "node /tools/" AGENTS.md prisma/seed.ts docs/2026-04-21-2202-phase1-story-map.md           # Expected: 0 matches per file
grep -c "tsx /tools/" prisma/seed.ts                                                                 # Expected: 6
```

### Final Checklist

- [ ] All "Must Have" present (tsx global in Docker, .ts COPY, tests updated, seed updated, AGENTS.md updated, story map updated)
- [ ] All "Must NOT Have" absent (no gateway/inngest/harness changes, no new test files, no tsconfig.build.json changes)
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Docker image builds and smoke tests pass
- [ ] All PLAT-01 ACs in story map marked `[x]`
- [ ] Zero `node /tools/` references remain in changed files
