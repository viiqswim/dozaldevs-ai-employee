# PLAT-02: Static AGENTS.md for Worker Containers

## TL;DR

> **Quick Summary**: Create a static `AGENTS.md` file with self-repair policies for AI employees, copy it into the Docker worker image at `/app/AGENTS.md`, and verify its content via automated tests and Docker smoke tests.
>
> **Deliverables**:
>
> - `src/workers/config/agents.md` — self-repair policy file covering 6 mandatory points
> - Dockerfile update — `COPY` line placing the file at `/app/AGENTS.md`
> - `.dockerignore` exception — ensures `.md` file isn't excluded from build context
> - Vitest content verification test — asserts all 6 policy points present
> - Story map checkboxes marked complete
>
> **Estimated Effort**: Quick (hours)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Tasks 2+3 (parallel) → Task 4 → Task 5

---

## Context

### Original Request

Implement PLAT-02 from the Phase 1 story map (`docs/2026-04-21-2202-phase1-story-map.md`). Create a static `AGENTS.md` file for worker containers that gives OpenCode self-repair permissions and behavioral boundaries, with thorough automated test verification and story map checkbox updates.

### Interview Summary

**Key Discussions**:

- Complexity S — small, well-defined story with clear acceptance criteria
- PLAT-01 (tsx migration) is complete — all checkboxes marked, dependency satisfied
- No API endpoints to call for PLAT-02 — verification is file content assertions + Docker smoke test
- Story map checkboxes to be marked after all acceptance criteria pass

**Research Findings**:

- OpenCode starts with `cwd: '/app'` (confirmed at `src/workers/opencode-harness.mts:158`) — auto-reads `AGENTS.md` from `/app/`
- `agents-md-reader.ts` is for the deprecated engineering worker's orchestrator, NOT relevant to this story
- `.dockerignore` has `*.md` at root level — only matches root `.md` files; `src/workers/config/agents.md` is nested so likely unaffected, but adding exception is defensive best practice
- Existing `src/workers/config/` directory already contains `opencode.json` and `long-running.ts`
- Worker tools live at `/tools/slack/` and `/tools/hostfully/` inside the container (tsx execution)
- The `report-issue` tool (PLAT-03) doesn't exist yet — AGENTS.md should reference `tsx /tools/platform/report-issue.ts` as the forward-compatible invocation path

### Metis Review

**Identified Gaps** (addressed):

- `.dockerignore` `*.md` exclusion risk: Adding `!src/workers/config/agents.md` exception (defensive)
- OpenCode working directory confirmation: Validated `cwd: '/app'` at harness line 158
- `report-issue` tool forward-compatibility: Using `tsx /tools/platform/report-issue.ts` as the stable reference
- Platform code boundary clarity: Explicitly naming `/app/dist/` and harness files as off-limits (not vague "platform code")
- DB access boundary: Explicitly naming tool paths (`/tools/slack/`, `/tools/hostfully/`, `/tools/platform/`) as the allowed interface

---

## Work Objectives

### Core Objective

Create a static AGENTS.md file that gives OpenCode self-repair permissions and behavioral boundaries when running inside worker containers, ensuring AI employees can autonomously diagnose and patch broken tools while staying within safe operational limits.

### Concrete Deliverables

- `src/workers/config/agents.md` — 6-point self-repair policy file
- Dockerfile COPY line placing it at `/app/AGENTS.md`
- `.dockerignore` exception line
- `tests/workers/config/agents-md-content.test.ts` — content verification test
- Updated PLAT-02 checkboxes in `docs/2026-04-21-2202-phase1-story-map.md`

### Definition of Done

- [ ] `pnpm test -- --run` passes (including the new content verification test)
- [ ] `docker build -t ai-employee-worker:latest .` succeeds
- [ ] `docker run --rm --entrypoint cat ai-employee-worker:latest /app/AGENTS.md` exits 0 and shows all 6 policy points
- [ ] All 4 PLAT-02 acceptance criteria checkboxes marked `[x]` in story map

### Must Have

- All 6 policy points from the PLAT-02 Notes: (1) source access, (2) patch permission, (3) smoke test requirement, (4) mandatory reporting, (5) platform code off-limits, (6) DB access via tools only
- File at `/app/AGENTS.md` inside the Docker image (uppercase, matching OpenCode's expectation)
- Vitest test asserting all 6 policy points via substring matches

### Must NOT Have (Guardrails)

- Do NOT create `/tools/platform/` directory — that's PLAT-03 scope
- Do NOT modify `opencode.json` — permissions are already set; AGENTS.md is behavioral guidance, not permission grants
- Do NOT modify `agents-md-reader.ts` — the reader is for the deprecated engineering worker, not this story
- Do NOT add any npm/pnpm dependencies
- Do NOT include runtime values (channel IDs, task IDs, tenant IDs, URLs) in the static file
- Do NOT duplicate content from `opencode.json` permissions

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — write content file first, then test)
- **Framework**: Vitest (existing infrastructure)

### QA Policy

Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Static file content**: Use Bash (node/vitest) — Read file, assert substrings
- **Docker image**: Use Bash — Build image, run entrypoint commands, assert output
- **Story map update**: Use Bash (grep) — Assert checkbox state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — content creation):
├── Task 1: Create AGENTS.md with 6-point self-repair policy [quick]

Wave 2 (After Wave 1 — Dockerfile + test, PARALLEL):
├── Task 2: Update Dockerfile + .dockerignore (depends: 1) [quick]
├── Task 3: Write Vitest content verification test (depends: 1) [quick]

Wave 3 (After Wave 2 — verification):
├── Task 4: Run test suite + Docker build smoke test (depends: 2, 3) [quick]

Wave 4 (After Wave 3 — documentation):
├── Task 5: Mark PLAT-02 checkboxes in story map (depends: 4) [quick]

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
| 1     | —          | 2, 3   | 1     |
| 2     | 1          | 4      | 2     |
| 3     | 1          | 4      | 2     |
| 4     | 2, 3       | 5      | 3     |
| 5     | 4          | F1-F4  | 4     |
| F1-F4 | 5          | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **2 tasks** — T2 → `quick`, T3 → `quick`
- **Wave 3**: **1 task** — T4 → `quick`
- **Wave 4**: **1 task** — T5 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Create `src/workers/config/agents.md` with 6-point self-repair policy

  **What to do**:
  - Create file `src/workers/config/agents.md` with clear, actionable prose covering all 6 mandatory policy points from the PLAT-02 story Notes
  - The file is natural language that OpenCode reads as behavioral context — write it as direct instructions to the AI employee, not as documentation
  - Content must cover these 6 points:

    **(1) Source Access Permission**: The AI employee has permission to read `.ts` source files at `/tools/` for context when debugging unexpected tool behavior. Use `cat` or any file-reading tool to inspect tool source code.

    **(2) Patch Permission**: The AI employee has permission to patch `.ts` source files at `/tools/` and re-run them via `tsx` if needed to complete the task. This includes modifying tool logic, fixing bugs, or adjusting API call parameters. Patches are temporary — they exist only for this task execution and are discarded when the container shuts down.

    **(3) Smoke Test After Patch**: After applying any patch to a tool, the AI employee MUST run the tool with `--help` to verify the patch didn't break the tool's CLI interface before relying on the patched version for task work. If `--help` fails, revert the patch.

    **(4) Mandatory Issue Reporting**: Before the task ends, the AI employee MUST report any tool issue encountered (whether patched or not) using `tsx /tools/platform/report-issue.ts`. Include: which tool broke, what the error was, what patch was applied (if any), and whether the patch resolved the issue. Also post a brief Slack message to the configured issues channel. Do NOT silently fix tools — every fix must be reported.

    **(5) Platform Code Off-Limits**: The AI employee MUST NEVER modify platform code. The following paths are off-limits: `/app/dist/` (compiled gateway/inngest/harness code), `/app/node_modules/`, the opencode-harness itself, and any file outside of `/tools/`. Only files inside `/tools/` are patchable.

    **(6) Database Access Only Via Tools**: All database interaction MUST go through the purpose-built tools in `/tools/` (e.g., `/tools/slack/`, `/tools/hostfully/`, `/tools/platform/`). NEVER use `psql`, `curl` against PostgREST directly, direct SQL, or any other method to access the database — even if connection strings or API URLs are available in the environment. The tools are the safety boundary: they encode what operations are valid, in what format, and with what validation. Bypassing them risks corrupting system state.

  **Must NOT do**:
  - Do NOT include runtime-specific values (channel IDs, task IDs, tenant IDs, URLs)
  - Do NOT duplicate `opencode.json` permission settings
  - Do NOT create any directories or files outside `src/workers/config/`
  - Do NOT use JSON/YAML format — this must be natural language prose

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single markdown file creation with clear content requirements — no complex logic
  - **Skills**: `[]`
    - No specialized skills needed — straightforward file creation
  - **Skills Evaluated but Omitted**:
    - `writing`: Content is technical policy, not prose documentation

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundational — all other tasks depend on this)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/workers/config/opencode.json` — Existing config file in same directory; shows the convention for worker container config files
  - `src/workers/opencode-harness.mts:158` — Confirms `cwd: '/app'` — OpenCode reads AGENTS.md from this directory

  **API/Type References** (contracts to implement against):
  - None — this is a static content file

  **External References** (libraries and frameworks):
  - OpenCode AGENTS.md convention: OpenCode auto-reads `AGENTS.md` from its working directory on startup and injects it as context for the AI model

  **WHY Each Reference Matters**:
  - `opencode.json` — Shows existing pattern for config files in `src/workers/config/`; the new file follows the same convention
  - `opencode-harness.mts:158` — Proves OpenCode will find `/app/AGENTS.md` because it starts with `cwd: '/app'`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: File exists with all 6 policy points
    Tool: Bash (node)
    Preconditions: File created at src/workers/config/agents.md
    Steps:
      1. cat src/workers/config/agents.md
      2. Assert output contains "/tools/" (source access + patch permission)
      3. Assert output contains "tsx" (patch execution method)
      4. Assert output contains "--help" (smoke test requirement)
      5. Assert output contains "report-issue" (mandatory reporting)
      6. Assert output contains "/app/dist/" (platform code boundary)
      7. Assert output contains "psql" or "PostgREST" (database access restriction context)
      8. Assert output contains "/tools/platform/report-issue.ts" (exact tool invocation path)
    Expected Result: All 6 assertions pass — file contains all required policy points
    Failure Indicators: Any assertion fails = missing policy point
    Evidence: .sisyphus/evidence/task-1-agents-md-content.txt

  Scenario: File does NOT contain runtime-specific values
    Tool: Bash (grep)
    Preconditions: File created at src/workers/config/agents.md
    Steps:
      1. grep -c "C0" src/workers/config/agents.md (Slack channel ID pattern)
      2. grep -c "00000000-0000-0000-0000" src/workers/config/agents.md (UUID pattern)
      3. grep -c "localhost" src/workers/config/agents.md (URL pattern)
    Expected Result: All grep counts return 0 — no runtime values present
    Failure Indicators: Any grep returns non-zero count
    Evidence: .sisyphus/evidence/task-1-no-runtime-values.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-agents-md-content.txt — full file content + assertion results
  - [ ] task-1-no-runtime-values.txt — grep results confirming no runtime values

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(worker): add static AGENTS.md with self-repair policy for worker containers`
  - Files: `src/workers/config/agents.md`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 2. Update Dockerfile + `.dockerignore` to include AGENTS.md

  **What to do**:
  - Add a `COPY` line to the Dockerfile placing `src/workers/config/agents.md` at `/app/AGENTS.md`
  - The COPY line goes in the **final stage** (the `FROM node:20-slim` stage), immediately after the existing `COPY src/workers/config/opencode.json /app/opencode.json` on line 57
  - Use the exact pattern: `COPY src/workers/config/agents.md /app/AGENTS.md`
  - Note: the source file is lowercase `agents.md` but the destination MUST be uppercase `AGENTS.md` — Linux is case-sensitive and OpenCode expects uppercase
  - Add `!src/workers/config/agents.md` to `.dockerignore` as a defensive exception (the existing `*.md` pattern at root level likely only matches root files, but this ensures the `.md` file is never accidentally excluded)

  **Must NOT do**:
  - Do NOT modify any other Dockerfile lines
  - Do NOT add the COPY in the builder stage — it must be in the final stage
  - Do NOT change the existing `opencode.json` COPY line
  - Do NOT add any build steps or npm install commands

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two single-line edits to existing files — trivial changes
  - **Skills**: `[]`
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `Dockerfile:57` — `COPY src/workers/config/opencode.json /app/opencode.json` — Mirror this exact pattern for placement and syntax
  - `Dockerfile:22` — `FROM node:20-slim` — This is the final stage; the COPY must be in this stage
  - `.dockerignore:11` — `*.md` — This is the pattern we're adding an exception for

  **WHY Each Reference Matters**:
  - `Dockerfile:57` — The new COPY line goes immediately after this line, following the same pattern
  - `Dockerfile:22` — Confirms we're in the final stage (not the builder)
  - `.dockerignore:11` — The `*.md` pattern could theoretically exclude our file; the exception guarantees inclusion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dockerfile contains the COPY line for AGENTS.md
    Tool: Bash (grep)
    Preconditions: Dockerfile updated
    Steps:
      1. grep -n "COPY src/workers/config/agents.md /app/AGENTS.md" Dockerfile
      2. Assert grep exits 0 (line found)
      3. Assert the line number is > 57 (after the opencode.json COPY)
      4. Assert the line number is < 74 (before the CMD line)
    Expected Result: COPY line exists in the correct position in the final stage
    Failure Indicators: grep exits non-zero (line missing) or line number out of range
    Evidence: .sisyphus/evidence/task-2-dockerfile-copy.txt

  Scenario: .dockerignore has the exception for agents.md
    Tool: Bash (grep)
    Preconditions: .dockerignore updated
    Steps:
      1. grep -n "!src/workers/config/agents.md" .dockerignore
      2. Assert grep exits 0 (exception found)
    Expected Result: Exception line present in .dockerignore
    Failure Indicators: grep exits non-zero
    Evidence: .sisyphus/evidence/task-2-dockerignore-exception.txt

  Scenario: Dockerfile still builds successfully after changes
    Tool: Bash (docker)
    Preconditions: Dockerfile and .dockerignore updated, Task 1 complete
    Steps:
      1. docker build -t ai-employee-worker:latest . (run in tmux, poll for completion)
      2. Assert exit code 0
    Expected Result: Docker image builds without errors
    Failure Indicators: Non-zero exit code, build error mentioning agents.md or COPY
    Evidence: .sisyphus/evidence/task-2-docker-build.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-dockerfile-copy.txt — grep output showing COPY line and position
  - [ ] task-2-dockerignore-exception.txt — grep output showing exception line
  - [ ] task-2-docker-build.txt — docker build output (success/failure)

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `feat(worker): add static AGENTS.md with self-repair policy for worker containers`
  - Files: `Dockerfile`, `.dockerignore`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 3. Write Vitest content verification test

  **What to do**:
  - Create `tests/workers/config/agents-md-content.test.ts`
  - Test reads `src/workers/config/agents.md` via `fs.readFileSync` and asserts all 6 policy points are present using specific substring matches
  - Use the existing test patterns from `tests/worker-tools/hostfully/validate-env.test.ts` and `tests/workers/lib/agents-md-reader.test.ts` as style references
  - Assertions must use exact key phrases, not vague regex:
    - Policy 1 (source access): Assert contains `/tools/` and "read"
    - Policy 2 (patch permission): Assert contains "patch" and "tsx"
    - Policy 3 (smoke test): Assert contains `--help`
    - Policy 4 (mandatory reporting): Assert contains `tsx /tools/platform/report-issue.ts`
    - Policy 5 (platform code off-limits): Assert contains `/app/dist/` and "never modify" (case-insensitive)
    - Policy 6 (DB access via tools): Assert contains "psql" and "PostgREST" in context of prohibition
  - Also assert the file does NOT contain runtime-specific patterns (UUIDs, channel IDs, localhost URLs)
  - Run `pnpm test -- --run` to confirm the new test passes alongside existing tests

  **Must NOT do**:
  - Do NOT require Docker to be running for this test
  - Do NOT import or modify `agents-md-reader.ts`
  - Do NOT add any new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single test file creation with clear assertion requirements
  - **Skills**: `[]`
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `tests/workers/lib/agents-md-reader.test.ts` — Test pattern for reading AGENTS.md files; uses `fs.writeFileSync`/`readFileSync`, Vitest `describe`/`it`/`expect`
  - `tests/worker-tools/hostfully/validate-env.test.ts` — Test pattern for worker tool verification; uses `execFile`, assertion style, `import { describe, it, expect } from 'vitest'`

  **API/Type References** (contracts to implement against):
  - None — pure file content assertion test

  **WHY Each Reference Matters**:
  - `agents-md-reader.test.ts` — Shows how to structure AGENTS.md-related tests; provides import/assertion patterns
  - `validate-env.test.ts` — Shows the project's preferred Vitest style for worker-related tests

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/workers/config/agents-md-content.test.ts`
  - [ ] `pnpm test -- --run tests/workers/config/agents-md-content.test.ts` → PASS (all assertions)
  - [ ] `pnpm test -- --run` → PASS (full suite, no regressions)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New test passes with all 6 policy point assertions
    Tool: Bash (pnpm)
    Preconditions: Task 1 complete (agents.md exists), test file created
    Steps:
      1. pnpm test -- --run tests/workers/config/agents-md-content.test.ts
      2. Assert exit code 0
      3. Assert output contains "pass" and does NOT contain "fail"
    Expected Result: All test cases pass — 6 policy assertions + no-runtime-values assertion
    Failure Indicators: Non-zero exit code, test failure message
    Evidence: .sisyphus/evidence/task-3-vitest-results.txt

  Scenario: Full test suite still passes (no regressions)
    Tool: Bash (pnpm)
    Preconditions: Test file created
    Steps:
      1. pnpm test -- --run
      2. Assert exit code 0 (allowing pre-existing failures: container-boot.test.ts, inngest-serve.test.ts)
    Expected Result: No new test failures introduced
    Failure Indicators: New test failures beyond the known pre-existing ones
    Evidence: .sisyphus/evidence/task-3-full-suite.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-vitest-results.txt — targeted test output
  - [ ] task-3-full-suite.txt — full test suite output

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `feat(worker): add static AGENTS.md with self-repair policy for worker containers`
  - Files: `tests/workers/config/agents-md-content.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 4. Docker build + smoke test verification

  **What to do**:
  - Build the Docker image: `docker build -t ai-employee-worker:latest .` (use tmux — this is a long-running command)
  - Run the 4 acceptance criteria smoke tests from the PLAT-02 story:
    1. `docker run --rm --entrypoint cat ai-employee-worker:latest /app/AGENTS.md` — exits 0, contains expected content
    2. `docker run --rm --entrypoint sh ai-employee-worker:latest -c "grep -c 'report-issue' /app/AGENTS.md"` — exits 0, count > 0
    3. `docker run --rm --entrypoint sh ai-employee-worker:latest -c "wc -l < /app/AGENTS.md"` — exits 0, line count > 20
    4. Verify file is uppercase `AGENTS.md` at `/app/`: `docker run --rm --entrypoint ls ai-employee-worker:latest /app/AGENTS.md`
  - Capture all output as evidence

  **Must NOT do**:
  - Do NOT push the Docker image
  - Do NOT modify any source files during this task
  - Do NOT start any containers that stay running

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running pre-defined commands and capturing output — no logic
  - **Skills**: `[]`
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 2 and 3)
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 2, 3

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References**:
  - `Dockerfile` — The Dockerfile being built; confirms COPY line placement
  - PLAT-02 acceptance criteria in `docs/2026-04-21-2202-phase1-story-map.md:298-301` — The exact smoke test commands to run

  **WHY Each Reference Matters**:
  - `Dockerfile` — Confirms the COPY line is in place before building
  - Story map acceptance criteria — Defines the exact smoke test commands that must pass

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md is present and readable in Docker container
    Tool: Bash (docker)
    Preconditions: Docker image built successfully in previous step
    Steps:
      1. docker run --rm --entrypoint cat ai-employee-worker:latest /app/AGENTS.md
      2. Assert exit code 0
      3. Assert output is non-empty
      4. Assert output contains "report-issue" (policy point 4)
      5. Assert output contains "/app/dist/" (policy point 5)
      6. Assert output contains "/tools/" (policy points 1, 2, 6)
    Expected Result: File exists, is readable, contains all key policy phrases
    Failure Indicators: Non-zero exit code (file missing), empty output, missing phrases
    Evidence: .sisyphus/evidence/task-4-docker-cat-agents-md.txt

  Scenario: AGENTS.md has substantial content (not a stub)
    Tool: Bash (docker)
    Preconditions: Docker image built
    Steps:
      1. docker run --rm --entrypoint sh ai-employee-worker:latest -c "wc -l < /app/AGENTS.md"
      2. Assert exit code 0
      3. Assert line count is > 20 (substantial policy document, not a stub)
    Expected Result: Line count exceeds 20
    Failure Indicators: Line count <= 20 (file is too short to contain all 6 points)
    Evidence: .sisyphus/evidence/task-4-docker-line-count.txt

  Scenario: File is uppercase AGENTS.md (case-sensitive check)
    Tool: Bash (docker)
    Preconditions: Docker image built
    Steps:
      1. docker run --rm --entrypoint ls ai-employee-worker:latest /app/AGENTS.md
      2. Assert exit code 0 (uppercase file found)
      3. docker run --rm --entrypoint ls ai-employee-worker:latest /app/agents.md
      4. Assert exit code non-zero (lowercase file should NOT exist)
    Expected Result: Only uppercase AGENTS.md exists
    Failure Indicators: Lowercase agents.md also exists (duplicate), or uppercase doesn't exist
    Evidence: .sisyphus/evidence/task-4-docker-case-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-docker-cat-agents-md.txt — full file content from container
  - [ ] task-4-docker-line-count.txt — line count output
  - [ ] task-4-docker-case-check.txt — case sensitivity verification

  **Commit**: NO (verification only — no source changes)

---

- [x] 5. Mark PLAT-02 checkboxes in story map

  **What to do**:
  - Open `docs/2026-04-21-2202-phase1-story-map.md`
  - Find the PLAT-02 acceptance criteria section (around lines 298-301)
  - Change all 4 checkboxes from `- [ ]` to `- [x]`:
    1. `src/workers/config/agents.md` created with self-repair policy content
    2. Dockerfile has `COPY` line placing the file at `/app/AGENTS.md`
    3. Content covers all six points in Notes
    4. Docker smoke test passes
  - Verify the edit by re-reading the section

  **Must NOT do**:
  - Do NOT modify any other checkboxes in the story map
  - Do NOT change any text — only the checkbox markers `[ ]` → `[x]`
  - Do NOT modify other stories' acceptance criteria

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 4 simple find-and-replace edits in one file
  - **Skills**: `[]`
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: NO (final documentation task)
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: F1-F4 (Final Verification Wave)
  - **Blocked By**: Task 4

  **References** (CRITICAL - Be Exhaustive):

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:298-301` — The 4 PLAT-02 acceptance criteria checkboxes to mark

  **WHY Each Reference Matters**:
  - Story map lines 298-301 — These are the exact checkboxes to update from `[ ]` to `[x]`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 4 PLAT-02 checkboxes are marked complete
    Tool: Bash (grep)
    Preconditions: Story map file updated
    Steps:
      1. Read the PLAT-02 section of docs/2026-04-21-2202-phase1-story-map.md
      2. Count occurrences of "- [x]" in the PLAT-02 acceptance criteria block
      3. Assert count equals 4
      4. Count occurrences of "- [ ]" in the PLAT-02 acceptance criteria block
      5. Assert count equals 0
    Expected Result: All 4 checkboxes show [x], zero show [ ]
    Failure Indicators: Any checkbox still unchecked, or wrong section modified
    Evidence: .sisyphus/evidence/task-5-story-map-checkboxes.txt

  Scenario: No other story's checkboxes were modified
    Tool: Bash (git diff)
    Preconditions: Story map file updated
    Steps:
      1. git diff docs/2026-04-21-2202-phase1-story-map.md
      2. Assert diff only shows changes in the PLAT-02 section
      3. Assert diff shows exactly 4 lines changed (the 4 checkboxes)
    Expected Result: Only PLAT-02 checkboxes changed — no other sections modified
    Failure Indicators: Diff shows changes outside PLAT-02 section
    Evidence: .sisyphus/evidence/task-5-story-map-diff.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-story-map-checkboxes.txt — grep output showing all 4 checkboxes marked
  - [ ] task-5-story-map-diff.txt — git diff showing only PLAT-02 changes

  **Commit**: YES
  - Message: `docs(story-map): mark PLAT-02 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: unused imports, empty catches, AI slop (excessive comments, over-abstraction). Verify the AGENTS.md content is clear, actionable prose — not vague handwaving.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Build Docker image. Run ALL QA scenarios from ALL tasks — follow exact steps, capture evidence. Verify AGENTS.md is readable and complete inside the container. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Docker [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance: no `/tools/platform/` directory created, no `opencode.json` modified, no `agents-md-reader.ts` modified, no new dependencies.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Tasks   | Message                                                                            | Files                                                                                                           | Pre-commit           |
| ------ | ------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1      | 1, 2, 3 | `feat(worker): add static AGENTS.md with self-repair policy for worker containers` | `src/workers/config/agents.md`, `Dockerfile`, `.dockerignore`, `tests/workers/config/agents-md-content.test.ts` | `pnpm test -- --run` |
| 2      | 5       | `docs(story-map): mark PLAT-02 acceptance criteria complete`                       | `docs/2026-04-21-2202-phase1-story-map.md`                                                                      | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                                    # Expected: all tests pass (including new content test)
pnpm build                                            # Expected: exit 0
docker build -t ai-employee-worker:latest .           # Expected: exit 0
docker run --rm --entrypoint cat ai-employee-worker:latest /app/AGENTS.md  # Expected: exit 0, shows policy content
docker run --rm --entrypoint sh ai-employee-worker:latest -c "grep -c 'report-issue' /app/AGENTS.md"  # Expected: exit 0, count > 0
```

### Final Checklist

- [ ] All "Must Have" present — 6 policy points in AGENTS.md
- [ ] All "Must NOT Have" absent — no forbidden modifications
- [ ] All tests pass — existing + new content verification test
- [ ] Docker image builds and contains `/app/AGENTS.md`
- [ ] Story map PLAT-02 checkboxes marked `[x]`
