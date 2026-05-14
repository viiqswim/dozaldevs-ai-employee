# AI Agent Skills System

## TL;DR

> **Quick Summary**: Build a comprehensive AI Agent Skills system for the ai-employee platform — native OpenCode skill support inside Docker/Fly.io worker containers, plus project-level dev-agent skills for developers working on the repo.
>
> **Deliverables**:
>
> - Harness infrastructure to support native OpenCode skill discovery in worker containers
> - 5 dev-agent skills (`.opencode/skills/`) for common workflows: shell tools, lifecycle debugging, archetypes, Hostfully API, E2E testing
> - 2 employee skills (`src/workers/skills/`) for error prevention: tool usage reference, UUID disambiguation
> - Dockerfile update to bake employee skills into the Docker image
> - Vitest tests for harness skill injection
> - AGENTS.md documentation updates
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves + final verification
> **Critical Path**: Task 1 → Task 4 → Tasks 10-11 → Task 12 → Task 14 → F1-F4

---

## Context

### Original Request

Research and implement AI Agent Skills to improve both the AI agents working on this repository (dev agents) and the AI employees executing within Docker/Fly.io containers.

### Interview Summary

**Key Discussions**:

- **Motivation**: Holistic improvement — better employee output quality, fewer errors/hallucinations, new capabilities, AND improved dev agent experience
- **Architecture**: Tiered approach — core skills baked into Docker image at build time, dynamic behavioral rules via existing `EMPLOYEE_RULES` pipeline
- **Employee scoping**: All shared — every employee sees every skill (simplicity over context optimization for v1)
- **Dev skill location**: Project-level (`.opencode/skills/` in repo, committed to git)
- **Scope**: Full infrastructure + skills content in a single plan

**Research Findings**:

- **OpenCode v1.14.31 skill system**: Two-phase loading — skill names+descriptions always in system prompt (~50 tokens each), full content loaded on-demand via `skill` tool call. Discovery from 8 location priorities including `.opencode/skills/` (project) and `~/.config/opencode/skills/` (global)
- **Current state**: Only 1 skill exists (`v-mermaid` globally). Worker containers have ZERO skill support — vanilla OpenCode with minimal config. The `archetype.agents_md` per-employee customization slot is wasted (all use identical `PLATFORM_AGENTS_MD`)
- **Injection pipeline**: `archetype.system_prompt` + `EMPLOYEE_RULES` + `EMPLOYEE_KNOWLEDGE` → system prompt. `archetype.instructions` → task prompt. Three-level AGENTS.md via `agents-md-resolver.mts`
- **Key extension points**: Harness `writeOpencodeAuth()` already writes config files before session start. Dockerfile already copies `src/workers/config/` into image. OpenCode natively discovers skills at `/app/.opencode/skills/` if present

### Metis Review

**Identified Gaps** (addressed):

- **Skill permission in containers**: Verified that `"*": "allow"` in worker `opencode.json` covers the `skill` permission type — no explicit `"skill"` permission needed, but test should verify
- **`.opencode/` directory handling**: Dockerfile COPY creates parent dirs; harness `writeFile` writes alongside without conflict
- **`agents_md` deduplication**: All archetypes currently set `agents_md: PLATFORM_AGENTS_MD` — skills will NOT go through `agents_md` (that's the rules/policy layer), they go through native OpenCode skill discovery
- **Companion files**: OpenCode auto-lists up to 10 non-SKILL.md files per skill directory — employee skills can include reference data files

---

## Work Objectives

### Core Objective

Enable native OpenCode skill discovery in worker containers and create domain-specific skills for both dev agents and production employees, reducing errors and improving output quality.

### Concrete Deliverables

- `.opencode/skills/` directory with 5 dev-agent SKILL.md files (committed to git)
- `src/workers/skills/` directory with 2 employee SKILL.md files (baked into Docker image)
- Updated Dockerfile copying skills to `/app/.opencode/skills/`
- Updated harness with skill-aware logging
- Vitest test suite for skill injection
- Updated AGENTS.md documenting the skill system

### Definition of Done

- [ ] `pnpm test -- --run` passes (515+ existing + new skill tests)
- [ ] `pnpm build` succeeds
- [ ] Docker image builds with skills at `/app/.opencode/skills/`
- [ ] OpenCode in container discovers and lists skills (verified via log output)
- [ ] Dev agents can load skills via `skill(name="...")` in local sessions

### Must Have

- Native OpenCode skill discovery in containers (no plugins needed)
- All employee skills shared across all archetypes (no per-archetype filtering)
- Dev skills committed to repo (`.opencode/skills/`)
- Employee skills baked into Docker image (`src/workers/skills/` → `/app/.opencode/skills/`)
- Test coverage for harness skill infrastructure
- Skills use YAML frontmatter with `name` and `description` fields

### Must NOT Have (Guardrails)

- Do NOT add `oh-my-openagent` plugin to worker containers — rely on native OpenCode skill discovery only
- Do NOT implement remote skill URLs (`skills.urls` mechanism)
- Do NOT build per-archetype skill filtering or whitelisting
- Do NOT implement skill versioning, semver, or governance schema
- Do NOT modify the feedback pipeline to update skills from corrections
- Do NOT change `archetype.agents_md` field values — skills are a separate mechanism
- Do NOT add new DB tables or schema migrations for skills
- Do NOT reference AI tools (claude, opencode, etc.) in commit messages

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after)
- **Framework**: Vitest (existing)
- **Focus**: Harness skill file writing, OpenCode config with skill permissions, directory structure validation

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Infrastructure/Config**: Use Bash — verify file existence, content, permissions
- **Skills Content**: Use Bash — verify YAML frontmatter parsing, required fields present
- **Docker**: Use Bash — build image, inspect filesystem with `docker run ... ls`
- **Dev Skills**: Use Bash — verify OpenCode discovers skills via config inspection

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 4 parallel tasks):
├── Task 1: Create src/workers/skills/ directory + README [quick]
├── Task 2: Create .opencode/skills/ directory in repo [quick]
├── Task 3: Update harness writeOpencodeAuth() for skill logging [quick]
└── Task 4: Update Dockerfile to COPY skills (depends: 1) [quick]

Wave 2 (Skills Content — 7 parallel tasks):
├── Task 5: Dev Skill: adding-shell-tools (depends: 2) [unspecified-high]
├── Task 6: Dev Skill: debugging-lifecycle (depends: 2) [unspecified-high]
├── Task 7: Dev Skill: creating-archetypes (depends: 2) [unspecified-high]
├── Task 8: Dev Skill: hostfully-api (depends: 2) [unspecified-high]
├── Task 9: Dev Skill: e2e-testing (depends: 2) [unspecified-high]
├── Task 10: Employee Skill: tool-usage-reference (depends: 1) [unspecified-high]
└── Task 11: Employee Skill: uuid-disambiguation (depends: 1) [unspecified-high]

Wave 3 (Verification & Docs — 3 parallel tasks):
├── Task 12: Vitest tests for harness skill injection (depends: 3, 4, 10, 11) [unspecified-high]
├── Task 13: AGENTS.md documentation update (depends: all) [writing]
└── Task 14: Docker build + skill discovery verification (depends: 4, 10, 11, 12) [quick]

Wave FINAL (4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On    | Blocks        | Wave |
| ---- | ------------- | ------------- | ---- |
| 1    | —             | 4, 10, 11, 12 | 1    |
| 2    | —             | 5, 6, 7, 8, 9 | 1    |
| 3    | —             | 12            | 1    |
| 4    | 1             | 12, 14        | 1    |
| 5    | 2             | 13            | 2    |
| 6    | 2             | 13            | 2    |
| 7    | 2             | 13            | 2    |
| 8    | 2             | 13            | 2    |
| 9    | 2             | 13            | 2    |
| 10   | 1             | 12, 14        | 2    |
| 11   | 1             | 12, 14        | 2    |
| 12   | 3, 4, 10, 11  | 14            | 3    |
| 13   | all tasks     | —             | 3    |
| 14   | 4, 10, 11, 12 | —             | 3    |

### Agent Dispatch Summary

- **Wave 1**: **4 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **7 tasks** — T5-T9 → `unspecified-high`, T10-T11 → `unspecified-high`
- **Wave 3**: **3 tasks** — T12 → `unspecified-high`, T13 → `writing`, T14 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create employee skill directory structure (`src/workers/skills/`)

  **What to do**:
  - Create directory `src/workers/skills/` with two subdirectories: `tool-usage-reference/` and `uuid-disambiguation/`
  - Create a placeholder `SKILL.md` in each with valid YAML frontmatter (`name`, `description`) and a TODO comment for content (content will be written in Wave 2)
  - Verify the directory structure follows OpenCode's convention: `skills/{name}/SKILL.md` where `name` matches the frontmatter `name` field

  **Must NOT do**:
  - Do NOT write full skill content yet — placeholders only (Wave 2 tasks handle content)
  - Do NOT add any DB migrations or schema changes
  - Do NOT modify existing files outside `src/workers/skills/`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple directory creation + placeholder files. Minimal logic required.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None applicable — trivial file creation task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 10, 11, 12, 14
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `~/.config/opencode/skills/v-mermaid/SKILL.md` — The only existing skill on this machine. Shows the canonical SKILL.md format with YAML frontmatter (`name`, `description`) followed by content.

  **API/Type References**:
  - OpenCode v1.14.31 skill discovery: scans `{skill,skills}/**/SKILL.md` pattern. `name` field must be `^[a-z0-9]+(-[a-z0-9]+)*$` (1-64 chars). `description` field 1-1024 chars. Both required in frontmatter.

  **WHY Each Reference Matters**:
  - The v-mermaid skill is the template to copy. The frontmatter format MUST match OpenCode's Zod schema or skills will be silently ignored.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Employee skill directories exist with valid structure
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `ls -la src/workers/skills/tool-usage-reference/SKILL.md`
      2. Run `ls -la src/workers/skills/uuid-disambiguation/SKILL.md`
      3. Run `head -10 src/workers/skills/tool-usage-reference/SKILL.md` — verify YAML frontmatter with `name: tool-usage-reference` and `description:` field
      4. Run `head -10 src/workers/skills/uuid-disambiguation/SKILL.md` — verify YAML frontmatter with `name: uuid-disambiguation` and `description:` field
    Expected Result: Both files exist, both have valid YAML frontmatter with required fields
    Failure Indicators: File not found, missing frontmatter, name doesn't match directory name
    Evidence: .sisyphus/evidence/task-1-skill-dirs.txt

  Scenario: Name field matches directory name (OpenCode requirement)
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run `node -e "const fm = require('gray-matter'); const f = require('fs'); const r = fm(f.readFileSync('src/workers/skills/tool-usage-reference/SKILL.md','utf8')); console.log(r.data.name === 'tool-usage-reference' ? 'PASS' : 'FAIL: ' + r.data.name)"`
      2. Same for `uuid-disambiguation`
    Expected Result: Both print "PASS"
    Failure Indicators: "FAIL" or error from gray-matter parsing
    Evidence: .sisyphus/evidence/task-1-name-validation.txt
  ```

  **Commit**: YES (groups with Tasks 2-4)
  - Message: `feat(worker): add skill infrastructure for native OpenCode skill discovery`
  - Files: `src/workers/skills/`
  - Pre-commit: `pnpm build`

- [x] 2. Create dev-agent skill directory structure (`.opencode/skills/`)

  **What to do**:
  - Create directory `.opencode/skills/` at the repo root with five subdirectories:
    - `adding-shell-tools/`
    - `debugging-lifecycle/`
    - `creating-archetypes/`
    - `hostfully-api/`
    - `e2e-testing/`
  - Create a placeholder `SKILL.md` in each with valid YAML frontmatter (`name`, `description`) and a TODO comment for content
  - Add `.opencode/skills/` to version control (NOT in `.gitignore`)

  **Must NOT do**:
  - Do NOT write full skill content yet — placeholders only (Wave 2 tasks handle content)
  - Do NOT modify `.gitignore` to exclude skills
  - Do NOT create skills in `~/.config/opencode/skills/` (those are global, not project-level)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple directory creation + placeholder files
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 6, 7, 8, 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `~/.config/opencode/skills/v-mermaid/SKILL.md` — Shows canonical SKILL.md format
  - OpenCode discovery: `.opencode/skills/*/SKILL.md` is priority 5 in the 8-location discovery order

  **WHY Each Reference Matters**:
  - Dev skills must follow the same SKILL.md format. OpenCode discovers `.opencode/skills/` natively from the project root — no config needed.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dev skill directories exist with valid structure
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `ls .opencode/skills/` — expect 5 directories
      2. For each: `head -5 .opencode/skills/{name}/SKILL.md` — verify frontmatter
      3. Run `git check-ignore .opencode/skills/adding-shell-tools/SKILL.md` — expect no output (NOT ignored)
    Expected Result: 5 directories, each with SKILL.md containing valid frontmatter, all tracked by git
    Failure Indicators: Missing directory, missing file, gitignored, invalid frontmatter
    Evidence: .sisyphus/evidence/task-2-dev-skill-dirs.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3, 4)
  - Message: `feat(worker): add skill infrastructure for native OpenCode skill discovery`
  - Files: `.opencode/skills/`
  - Pre-commit: `pnpm build`

- [x] 3. Update harness `writeOpencodeAuth()` for skill awareness

  **What to do**:
  - In `src/workers/opencode-harness.mts`, update the `writeOpencodeAuth()` function to:
    1. After writing `opencode.json`, check if `/app/.opencode/skills/` exists (baked by Dockerfile)
    2. If it exists, log the discovered skill directories: `log.info("Skills available in container", { skills: [...dirNames] })`
    3. If it doesn't exist, log: `log.info("No skills directory found — container has no baked-in skills")`
  - This is logging/awareness only — OpenCode discovers skills natively, no code needed to "load" them
  - Verify that the existing `"*": "allow"` permission in `opencode.json` covers the `skill` permission type (it does per OpenCode source — document this in a code comment)

  **Must NOT do**:
  - Do NOT add `oh-my-openagent` plugin to the container config
  - Do NOT modify the `opencode.json` permission structure — `"*": "allow"` already covers skills
  - Do NOT add skill content injection via the harness — rely on native discovery
  - Keep the shared/employee-agnostic convention — no employee-specific language in log messages

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small code change — add ~10 lines of logging to existing function
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 12
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts` lines 141-171 — `writeOpencodeAuth()` function. This is where `opencode.json` and auth config are written before OpenCode starts. The skill logging should be added AFTER the existing config writes.
  - `src/workers/opencode-harness.mts` lines 526-537 — Shows the logging pattern used elsewhere in the harness (`log.info("...", { key: value })`)

  **API/Type References**:
  - OpenCode permission model: `Permission.evaluate("skill", skill.name, agent.permission)` — the `"*": "allow"` wildcard covers all permission types including `skill`
  - Node.js `readdirSync` for listing skill directories

  **External References**:
  - OpenCode v1.14.31 source `skill/index.ts` lines 146-204 — discovery order. `.opencode/skills/` is scanned from project root (cwd), which is `/app` in the container

  **WHY Each Reference Matters**:
  - `writeOpencodeAuth()` is the natural injection point — it runs before OpenCode starts and already handles all pre-session config
  - The permission model confirmation ensures we don't need to modify the config JSON
  - The discovery path confirms that `/app/.opencode/skills/` will be found by OpenCode natively

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Harness logs skill discovery when skills exist
    Tool: Bash
    Preconditions: Build succeeds (`pnpm build`)
    Steps:
      1. Run `pnpm build` — verify no TypeScript errors
      2. Run `grep -n "Skills available" src/workers/opencode-harness.mts` — verify log message exists
      3. Run `grep -n "No skills directory" src/workers/opencode-harness.mts` — verify fallback log exists
    Expected Result: Both log messages present in source, build passes
    Failure Indicators: Build fails, log messages missing
    Evidence: .sisyphus/evidence/task-3-harness-update.txt

  Scenario: opencode.json permission covers skills (no change needed)
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -A3 "permission" src/workers/opencode-harness.mts` — verify `"*": "allow"` is present
      2. Run `grep "skill" src/workers/opencode-harness.mts` — verify a code comment documents that `"*": "allow"` covers skills
    Expected Result: Permission wildcard present, comment documents skill coverage
    Failure Indicators: Permission changed, comment missing
    Evidence: .sisyphus/evidence/task-3-permission-check.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 4)
  - Message: `feat(worker): add skill infrastructure for native OpenCode skill discovery`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 4. Update Dockerfile to copy skills into container

  **What to do**:
  - Add a `COPY` instruction to the Dockerfile that copies `src/workers/skills/` to `/app/.opencode/skills/` in the image
  - Place the COPY instruction AFTER the existing `COPY src/workers/config/ /app/` line (skills are part of the worker config, same lifecycle)
  - The `/app/.opencode/` directory may not exist yet — the COPY will create it (or the harness creates it when writing `opencode.json`)
  - Add a comment explaining why: `# Skills: baked into image for native OpenCode skill discovery (see .opencode/skills/ convention)`

  **Must NOT do**:
  - Do NOT copy `.opencode/skills/` (dev skills) — those are for local dev only, not the container
  - Do NOT modify the OpenCode config files — just copy skill files
  - Do NOT change the `CMD` or `ENTRYPOINT`
  - Do NOT add oh-my-openagent as a dependency

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single COPY line addition to Dockerfile
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 for `src/workers/skills/` to exist)
  - **Parallel Group**: Wave 1, but after Task 1
  - **Blocks**: Tasks 12, 14
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `Dockerfile` — Look for the existing `COPY src/workers/config/ /app/` line. The skill COPY should be placed near it, following the same pattern.
  - `Dockerfile` — Look for where `/app/.opencode/` might be created (the harness writes `opencode.json` there at runtime, but the directory may need to exist first)

  **API/Type References**:
  - OpenCode v1.14.31: Scans `.opencode/{skill,skills}/**/SKILL.md` from cwd. In container, cwd is `/app`, so `/app/.opencode/skills/*/SKILL.md` will be discovered.

  **WHY Each Reference Matters**:
  - Dockerfile placement matters — skills should be copied in the same layer as other worker config for cache efficiency
  - The `.opencode/skills/` path is what OpenCode natively discovers — using this exact path avoids needing `skills.paths` config

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dockerfile has COPY instruction for skills
    Tool: Bash
    Preconditions: Task 1 complete (src/workers/skills/ exists)
    Steps:
      1. Run `grep -n "opencode/skills" Dockerfile` — verify COPY instruction exists
      2. Run `grep -n "src/workers/skills" Dockerfile` — verify source path is correct
      3. Verify the COPY target is `/app/.opencode/skills/`
    Expected Result: COPY instruction present with correct source and target paths
    Failure Indicators: Missing COPY, wrong paths, syntax error
    Evidence: .sisyphus/evidence/task-4-dockerfile.txt

  Scenario: Docker build succeeds with skills
    Tool: Bash (tmux for long-running build)
    Preconditions: Tasks 1 and 4 complete
    Steps:
      1. Run `docker build -t ai-employee-worker:test .` in tmux
      2. Run `docker run --rm ai-employee-worker:test ls /app/.opencode/skills/` — verify skill directories present
      3. Run `docker run --rm ai-employee-worker:test cat /app/.opencode/skills/tool-usage-reference/SKILL.md | head -5` — verify frontmatter
    Expected Result: Build succeeds, skills visible in container filesystem, frontmatter valid
    Failure Indicators: Build fails, skills directory missing, empty files
    Evidence: .sisyphus/evidence/task-4-docker-build.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2, 3)
  - Message: `feat(worker): add skill infrastructure for native OpenCode skill discovery`
  - Files: `Dockerfile`
  - Pre-commit: `pnpm build`

- [x] 5. Dev Skill: adding-shell-tools

  **What to do**:
  - Write the full SKILL.md content at `.opencode/skills/adding-shell-tools/SKILL.md`
  - The skill must be a comprehensive procedural guide covering the entire shell tool creation workflow
  - Content to cover (based on existing guide at `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`):
    - File structure: where to create scripts (`src/worker-tools/{service}/`), naming conventions
    - CLI pattern: argument parsing, JSON output, stderr for logs, exit codes
    - TypeScript conventions: use `tsx` for execution, shebang lines, import patterns
    - Mock fixtures: how to create test fixtures for local E2E testing
    - Docker integration: how scripts are bind-mounted at `/tools/{service}/` in local dev, copied in production
    - Dockerfile updates needed: when/where to add COPY instructions
    - AGENTS.md updates: what sections to add/modify for new tool documentation
    - Common mistakes to avoid: missing `NODE_NO_WARNINGS=1`, wrong path references, forgetting to document in AGENTS.md
  - Include a step-by-step checklist the agent can follow
  - Reference the canonical guide doc for full details

  **Must NOT do**:
  - Do NOT duplicate the entire guide doc — reference it and provide the actionable checklist
  - Do NOT include employee-specific content (keep it generic for any service)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading existing codebase patterns and documentation to create a comprehensive procedural skill
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `~/.config/opencode/skills/v-mermaid/SKILL.md` — Canonical skill format. Shows how to structure a procedural skill with frontmatter, sections, and concrete rules.
  - `src/worker-tools/slack/post-message.ts` — Example of a well-structured shell tool (CLI args, JSON output, error handling). Use as the "model" tool to reference in the skill.
  - `src/worker-tools/hostfully/get-messages.ts` — Another example shell tool showing a different service pattern.

  **External References**:
  - `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — The authoritative guide for adding shell tools. The skill should distill this into an actionable step-by-step procedure.

  **WHY Each Reference Matters**:
  - The v-mermaid skill shows what "good" looks like for a procedural skill
  - The shell tool examples show what the developer is creating (pattern to document)
  - The guide doc is the source of truth for the checklist items

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill has valid frontmatter and substantive content
    Tool: Bash
    Preconditions: Task 5 complete
    Steps:
      1. Run `node -e "const fm = require('gray-matter'); const f = require('fs'); const r = fm(f.readFileSync('.opencode/skills/adding-shell-tools/SKILL.md','utf8')); console.log(JSON.stringify(r.data))"` — verify `name: adding-shell-tools` and `description` present
      2. Run `wc -l .opencode/skills/adding-shell-tools/SKILL.md` — verify at least 50 lines of content
      3. Run `grep -c "src/worker-tools" .opencode/skills/adding-shell-tools/SKILL.md` — verify references to tool directory
    Expected Result: Valid frontmatter, 50+ lines, references worker-tools directory
    Failure Indicators: Invalid frontmatter, too short (<30 lines), no concrete references
    Evidence: .sisyphus/evidence/task-5-adding-shell-tools.txt

  Scenario: Skill includes checklist and common mistakes
    Tool: Bash
    Preconditions: Task 5 complete
    Steps:
      1. Run `grep -ci "checklist\|step" .opencode/skills/adding-shell-tools/SKILL.md` — verify checklist or step-by-step exists
      2. Run `grep -ci "mistake\|avoid\|never\|do not" .opencode/skills/adding-shell-tools/SKILL.md` — verify guardrails present
    Expected Result: Contains actionable steps AND warnings about common mistakes
    Failure Indicators: Missing checklist, no guardrails section
    Evidence: .sisyphus/evidence/task-5-checklist-check.txt
  ```

  **Commit**: YES (groups with Tasks 6-9)
  - Message: `feat(skills): add dev-agent skills for common workflows`
  - Files: `.opencode/skills/adding-shell-tools/SKILL.md`
  - Pre-commit: `pnpm lint`

- [x] 6. Dev Skill: debugging-lifecycle

  **What to do**:
  - Write the full SKILL.md content at `.opencode/skills/debugging-lifecycle/SKILL.md`
  - The skill must be a diagnostic guide for the universal employee lifecycle (`src/inngest/employee-lifecycle.ts`)
  - Content to cover:
    - State machine overview: Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done (+ Failed, Cancelled terminals)
    - Which states auto-pass (Triaging, AwaitingInput, Validating) and which block
    - How to check task status: `GET /admin/tenants/:id/tasks/:taskId` (admin API)
    - How to check `task_status_log` table for state transition history
    - Common stuck states and their causes:
      - Stuck in `Reviewing`: no `pending_approvals` row → reviewing-watchdog will mark Failed after 30min
      - Stuck in `Executing`: worker crashed/OOM → check `fly logs -a ai-employee-workers`
      - Stuck in `Submitting`: harness wrote `/tmp/summary.txt` but no approval card → check NOTIFY_MSG_TS, Slack connection
    - How approval works: `pending_approvals` table, Socket Mode button handlers, manual fallback curl
    - Pre-check adapter: when tasks auto-complete at Received → Done (e.g., guest-messaging pre-check)
    - Key environment variables injected into workers and their sources
    - Inngest function debugging: how to find runs in Inngest dashboard, how events flow
  - Include diagnostic decision tree: "Task is stuck in X → check Y → if Z then do W"

  **Must NOT do**:
  - Do NOT include employee-specific debugging (keep generic to the lifecycle mechanism)
  - Do NOT include implementation fixes — this is a diagnostic/understanding skill

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires deep reading of the lifecycle source code and understanding state transitions
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7-11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts` — The entire lifecycle. Key sections: state machine steps, `dispatch-machine` step (lines 387-539), `handle-approval-result` step, `mark-failed` step
  - `src/inngest/triggers/guest-message-poll.ts` — Example of a trigger function
  - `src/gateway/slack/installation-store.ts` — Slack authorization (relevant for approval debugging)

  **API/Type References**:
  - `src/gateway/routes/` — Admin API routes for task status checking
  - `prisma/schema.prisma` — `tasks`, `pending_approvals`, `task_status_log` models

  **External References**:
  - `docs/snapshots/2026-04-29-2255-current-system-state.md` — Point-in-time snapshot with full lifecycle flow, all 15 harness steps
  - `AGENTS.md` — "OpenCode Worker" section documents lifecycle states and common gotchas

  **WHY Each Reference Matters**:
  - The lifecycle source is the ground truth for state transitions — the skill must accurately describe what each step does
  - The snapshot doc has the most complete prose description of the lifecycle
  - The admin API routes are the diagnostic tools agents use when debugging

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill covers all lifecycle states
    Tool: Bash
    Preconditions: Task 6 complete
    Steps:
      1. For each state in [Received, Triaging, AwaitingInput, Ready, Executing, Validating, Submitting, Reviewing, Approved, Delivering, Done, Failed, Cancelled]:
         Run `grep -i "{state}" .opencode/skills/debugging-lifecycle/SKILL.md` — verify state is mentioned
    Expected Result: All 13 states documented
    Failure Indicators: Any state missing from the skill
    Evidence: .sisyphus/evidence/task-6-lifecycle-states.txt

  Scenario: Skill includes diagnostic decision tree
    Tool: Bash
    Preconditions: Task 6 complete
    Steps:
      1. Run `grep -ci "stuck\|diagnos\|check\|if.*then" .opencode/skills/debugging-lifecycle/SKILL.md` — verify diagnostic language
      2. Run `wc -l .opencode/skills/debugging-lifecycle/SKILL.md` — verify 80+ lines of substantive content
    Expected Result: Contains diagnostic guidance, 80+ lines
    Failure Indicators: Too short, no diagnostic content
    Evidence: .sisyphus/evidence/task-6-diagnostic-tree.txt
  ```

  **Commit**: YES (groups with Tasks 5, 7-9)
  - Message: `feat(skills): add dev-agent skills for common workflows`
  - Files: `.opencode/skills/debugging-lifecycle/SKILL.md`
  - Pre-commit: `pnpm lint`

- [x] 7. Dev Skill: creating-archetypes

  **What to do**:
  - Write the full SKILL.md content at `.opencode/skills/creating-archetypes/SKILL.md`
  - The skill must be a complete guide for creating or modifying employee archetypes
  - Content to cover:
    - Archetype model schema: all fields in `prisma/schema.prisma` with purpose of each
    - Seed data pattern: how archetypes are defined in `prisma/seed.ts` (import prompts, set `agents_md: PLATFORM_AGENTS_MD`, etc.)
    - System prompt vs instructions vs agents_md — what goes where:
      - `system_prompt`: Employee identity, persona, role framing
      - `instructions`: Step-by-step task procedure (the "what to do" when triggered)
      - `agents_md`: AGENTS.md section for this archetype (currently uses PLATFORM_AGENTS_MD for all)
      - `delivery_instructions`: Instructions for the delivery phase only
    - Required fields: `tenant_id`, `role_name`, `model` (must be `minimax/minimax-m2.7` or `anthropic/claude-haiku-4-5`), `runtime: 'opencode'`
    - Optional fields: `notification_channel`, `enrichment_adapter`, `pre_check_adapter`, `vm_size`, `concurrency_limit`, `risk_model`
    - How to set up triggers: external cron (cron-job.org → admin API), webhook route (gateway route handler), Inngest cron (internal polling)
    - The `loadTenantEnv()` flow: how tenant secrets become environment variables
    - Common mistakes: wrong model ID, missing `approval_required` in risk_model, forgetting to seed `tenant_secrets` for new API integrations
  - Include a checklist: "To create a new employee, do these N steps in order"

  **Must NOT do**:
  - Do NOT include deprecated engineering employee patterns
  - Do NOT reference specific employee prompts (keep generic)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding the full archetype schema, seed patterns, and lifecycle integration
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8-11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` lines 179-217 — Archetype model with all fields
  - `prisma/seed.ts` — All archetype seed entries. Look for `PLATFORM_AGENTS_MD` usage, `system_prompt` imports, `instructions` field patterns
  - `prisma/prompts/guest-messaging.ts` — Example of a system prompt in a separate file (imported by seed.ts)

  **API/Type References**:
  - `src/gateway/services/tenant-env-loader.ts` — `loadTenantEnv()` function that builds the machine env from tenant config + secrets
  - `src/workers/lib/agents-md-resolver.mts` — 3-level AGENTS.md concatenation (23-line file)

  **External References**:
  - `AGENTS.md` — "Adding a new employee" section (4-step process)
  - `docs/guides/2026-04-16-1655-multi-tenancy-guide.md` — How tenants work

  **WHY Each Reference Matters**:
  - The schema is the definitive list of fields — the skill must cover each one
  - The seed file shows the actual pattern developers follow when creating archetypes
  - The env loader shows how secrets and config reach the worker — critical for new integrations

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill covers all archetype fields
    Tool: Bash
    Preconditions: Task 7 complete
    Steps:
      1. For each key field in [system_prompt, instructions, agents_md, delivery_instructions, model, runtime, risk_model, notification_channel, enrichment_adapter, tenant_id, role_name]:
         Run `grep -i "{field}" .opencode/skills/creating-archetypes/SKILL.md` — verify field is documented
    Expected Result: All key fields mentioned and explained
    Failure Indicators: Any key field missing
    Evidence: .sisyphus/evidence/task-7-archetype-fields.txt

  Scenario: Skill includes creation checklist
    Tool: Bash
    Preconditions: Task 7 complete
    Steps:
      1. Run `grep -ci "step\|checklist\|create.*new" .opencode/skills/creating-archetypes/SKILL.md` — verify actionable steps
      2. Run `wc -l .opencode/skills/creating-archetypes/SKILL.md` — verify 80+ lines
    Expected Result: Contains step-by-step checklist, 80+ lines
    Failure Indicators: No checklist, too short
    Evidence: .sisyphus/evidence/task-7-checklist.txt
  ```

  **Commit**: YES (groups with Tasks 5, 6, 8, 9)
  - Message: `feat(skills): add dev-agent skills for common workflows`
  - Files: `.opencode/skills/creating-archetypes/SKILL.md`
  - Pre-commit: `pnpm lint`

- [x] 8. Dev Skill: hostfully-api

  **What to do**:
  - Write the full SKILL.md content at `.opencode/skills/hostfully-api/SKILL.md`
  - The skill must document Hostfully API integration patterns, known quirks, and debugging strategies
  - Content to cover:
    - Response envelope patterns: single resource `{ "lead": {...} }` vs list `{ "leads": [...] }` — must check both shapes
    - API endpoint reference: messages, leads, properties, reservations, reviews — with correct URL patterns
    - Known API quirks:
      - `senderType` field values: `AGENCY` (host), `GUEST` (guest) — critical for pre-check logic
      - Lead types: `BOOKING`, `INQUIRY`, `BLOCK` — all included except BLOCK
      - Lead status: `NEW`, `BOOKED`, `CLOSED` — CLOSED leads don't fire webhooks (critical!)
      - `lead_uid` ≠ `thread_uid` ≠ `property_uid` — three different UUIDs, never interchangeable
    - Shell tool reference: `get-messages.ts`, `send-message.ts`, `get-property.ts`, `get-reservations.ts` — CLI syntax and output shapes
    - Safe API response parsing: never bare `as T`, use wrapper-aware cast, log `Object.keys()` on unexpected null
    - Debugging: how to make a raw API call with `node -e` or `curl` to verify response shape before writing code
    - Webhook patterns: `NEW_INBOX_MESSAGE` payload shape, dedup by `message_uid`, tenant matching by `agency_uid`
  - Reference the API integration practices guide for foundational rules

  **Must NOT do**:
  - Do NOT include Hostfully API keys or credentials
  - Do NOT include test-specific UUIDs (those belong in AGENTS.md, not a skill)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading multiple shell tool files, API response shapes, and understanding the integration patterns
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-7, 9-11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-messages.ts` — Primary Hostfully tool. Shows lead filtering, message threading, `senderType` checking, `unresponded` computation. CLI syntax and JSON output shape.
  - `src/worker-tools/hostfully/send-message.ts` — Message sending tool
  - `src/worker-tools/hostfully/get-property.ts` — Property lookup tool
  - `src/worker-tools/hostfully/get-reservations.ts` — Reservation lookup tool
  - `src/gateway/routes/hostfully.ts` — Webhook handler showing payload parsing, tenant matching by `agency_uid`, dedup by `message_uid`

  **External References**:
  - `docs/guides/2026-05-12-1731-api-integration-practices.md` — Foundational API integration rules (response envelopes, safe casting, shape smoke tests)
  - `AGENTS.md` — "External API Integration — Mandatory Practices" section and "Guest-Messaging Employee" section

  **WHY Each Reference Matters**:
  - The shell tools are the actual implementation agents will work with — understanding their CLI and output is essential
  - The webhook handler shows how Hostfully events enter the system
  - The API practices guide prevents the exact bugs that motivated this skill

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill covers all critical Hostfully patterns
    Tool: Bash
    Preconditions: Task 8 complete
    Steps:
      1. For each concept in [senderType, lead_uid, thread_uid, property_uid, AGENCY, GUEST, CLOSED, webhook, envelope]:
         Run `grep -i "{concept}" .opencode/skills/hostfully-api/SKILL.md` — verify documented
      2. Run `grep -c "get-messages\|send-message\|get-property\|get-reservations" .opencode/skills/hostfully-api/SKILL.md` — verify tool references
    Expected Result: All critical concepts and tools documented
    Failure Indicators: Missing key concept, no tool CLI references
    Evidence: .sisyphus/evidence/task-8-hostfully-api.txt
  ```

  **Commit**: YES (groups with Tasks 5-7, 9)
  - Message: `feat(skills): add dev-agent skills for common workflows`
  - Files: `.opencode/skills/hostfully-api/SKILL.md`
  - Pre-commit: `pnpm lint`

- [x] 9. Dev Skill: e2e-testing

  **What to do**:
  - Write the full SKILL.md content at `.opencode/skills/e2e-testing/SKILL.md`
  - The skill must be a comprehensive guide for running E2E tests on the platform
  - Content to cover:
    - Prerequisites checklist: gateway running, Inngest health, Socket Mode connected, Docker image built
    - Per-employee trigger methods:
      - Guest-messaging: Airbnb message → Hostfully webhook → task created
      - Summarizer: `POST /admin/tenants/:id/employees/daily-summarizer/trigger`
      - Code-rotation: `POST /admin/tenants/:id/employees/code-rotation/trigger`
    - How to verify pipeline state without polling DB: read Slack messages, check context blocks for task IDs
    - Playwright browser automation: connecting to real Chrome via CDP, navigating Airbnb/Slack, interacting with approval cards
    - WebGL gotcha: `WaterRipple` component prevents headless testing on dozaldevs-public (not relevant here but good context)
    - State verification: `task_status_log` queries, `pending_approvals` checks, `feedback_events` audit trail
    - Scenario coverage: reference the Slack UX E2E guide (6 scenarios A-F) and Feedback Pipeline E2E guide (6 scenarios A-F)
    - Evidence capture: screenshot naming, terminal output logging, JSON response saving
    - tmux session management: launch long-running commands, poll logs, kill sessions when done

  **Must NOT do**:
  - Do NOT duplicate the full E2E guides — reference them and provide the setup/trigger procedures
  - Do NOT include test credentials or API keys

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires reading multiple test guide docs and understanding the full E2E flow
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-8, 10-11)
  - **Blocks**: Task 13
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `scripts/trigger-task.ts` — The E2E trigger script. Shows how to programmatically trigger a task.
  - `scripts/verify-e2e.ts` — The E2E verification script. Shows how to check task completion.

  **External References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — 6 Slack UX scenarios (A-F) with step-by-step
  - `docs/testing/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` — 6 feedback pipeline scenarios (A-F)
  - `docs/testing/2026-05-04-2023-local-e2e-testing.md` — Local E2E testing without real APIs
  - `AGENTS.md` — "E2E Testing with Playwright Browser" section, "Plan E2E Validation" section

  **WHY Each Reference Matters**:
  - The E2E guides define the exact scenarios agents should run — the skill should help them set up and execute efficiently
  - The trigger/verify scripts are the programmatic entry points

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill covers all employee trigger methods
    Tool: Bash
    Preconditions: Task 9 complete
    Steps:
      1. Run `grep -c "trigger" .opencode/skills/e2e-testing/SKILL.md` — verify trigger references
      2. Run `grep -c "guest-messaging\|daily-summarizer\|code-rotation" .opencode/skills/e2e-testing/SKILL.md` — verify all employees covered
      3. Run `grep -ci "prerequisite\|before.*test\|setup" .opencode/skills/e2e-testing/SKILL.md` — verify prerequisites section
    Expected Result: All employee triggers documented, prerequisites section exists
    Failure Indicators: Missing employee, no prerequisites
    Evidence: .sisyphus/evidence/task-9-e2e-testing.txt
  ```

  **Commit**: YES (groups with Tasks 5-8)
  - Message: `feat(skills): add dev-agent skills for common workflows`
  - Files: `.opencode/skills/e2e-testing/SKILL.md`
  - Pre-commit: `pnpm lint`

- [x] 10. Employee Skill: tool-usage-reference

  **What to do**:
  - Write the full SKILL.md content at `src/workers/skills/tool-usage-reference/SKILL.md`
  - This is the most critical employee skill — it documents the EXACT CLI syntax for every shell tool available to employees
  - Content to cover for EACH tool (read the actual source files to get accurate syntax):
    - **Slack tools** (`/tools/slack/`):
      - `post-message.ts` — `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "C123" --text "msg" --task-id "uuid"` → JSON `{"ts":"...","channel":"..."}`
      - `read-channels.ts` — `tsx /tools/slack/read-channels.ts --channels "C123,C456" --lookback-hours 24` → JSON `{"channels":[...]}`
    - **Hostfully tools** (`/tools/hostfully/`):
      - `get-messages.ts` — `tsx /tools/hostfully/get-messages.ts --lead-id "uuid"` → JSON with `reservationId`, `propertyUid`, `guestName`, `channel`, `checkIn`, `checkOut`, `leadStatus`, `unresponded`, `messages[]`
      - `send-message.ts` — document correct flags
      - `get-property.ts` — document correct flags
      - `get-reservations.ts` — document correct flags
      - `post-guest-approval.ts` — CRITICAL: document `--lead-uid X --thread-uid Y` where these are DIFFERENT UUIDs
    - **Lock tools** (`/tools/locks/`):
      - `sifely-client.ts` — all 6 actions with exact flag syntax
      - `generate-code.ts` — `--length 4|5|6 --exclude-codes "1221,2332"` → JSON
      - `update-door-code.ts` — `--property-id X --code Y` → JSON
      - `rotate-property-code.ts` — `--property-id X` → JSON
    - **Knowledge base tools** (`/tools/knowledge_base/`):
      - `search.ts` — document correct flags
    - **Platform tools** (`/tools/platform/`):
      - `report-issue.ts` — document correct flags
  - For each tool: exact command syntax, all flags (required + optional), output JSON shape, common errors
  - Include a "CRITICAL WARNINGS" section for known dangerous mistakes (e.g., lead-uid = thread-uid, missing NODE_NO_WARNINGS=1)
  - The description field should clearly trigger when any tool usage is needed

  **Must NOT do**:
  - Do NOT include API keys or credentials in examples
  - Do NOT use employee-specific language — this skill serves ALL employees
  - Do NOT invent CLI flags — read the actual source files for accuracy

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Must read every shell tool source file to document accurate CLI syntax — high thoroughness required
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-9, 11)
  - **Blocks**: Tasks 12, 14
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-message.ts` — Slack posting tool. Read for exact CLI flags and output shape.
  - `src/worker-tools/slack/read-channels.ts` — Slack reading tool.
  - `src/worker-tools/hostfully/get-messages.ts` — Hostfully messages tool. Read for EXACT output JSON shape including `reservationId`, `propertyUid`, `guestName`.
  - `src/worker-tools/hostfully/send-message.ts` — Hostfully send tool.
  - `src/worker-tools/hostfully/get-property.ts` — Property lookup.
  - `src/worker-tools/hostfully/get-reservations.ts` — Reservation lookup.
  - `src/worker-tools/hostfully/post-guest-approval.ts` — CRITICAL tool: document `--lead-uid` vs `--thread-uid` distinction.
  - `src/worker-tools/locks/sifely-client.ts` — All 6 lock actions.
  - `src/worker-tools/locks/generate-code.ts` — Code generation.
  - `src/worker-tools/locks/update-door-code.ts` — Door code update.
  - `src/worker-tools/locks/rotate-property-code.ts` — Code rotation.
  - `src/worker-tools/knowledge_base/search.ts` — Knowledge base search.
  - `src/worker-tools/platform/report-issue.ts` — Issue reporting.

  **WHY Each Reference Matters**:
  - EVERY tool file must be read to extract the exact CLI syntax. The whole point of this skill is accuracy — if the syntax is wrong, the employee will fail. Do NOT guess flags.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill documents all shell tools
    Tool: Bash
    Preconditions: Task 10 complete
    Steps:
      1. For each tool in [post-message, read-channels, get-messages, send-message, get-property, get-reservations, post-guest-approval, sifely-client, generate-code, update-door-code, rotate-property-code, search, report-issue]:
         Run `grep -i "{tool}" src/workers/skills/tool-usage-reference/SKILL.md` — verify documented
    Expected Result: All 13 tools referenced and documented
    Failure Indicators: Any tool missing from the skill
    Evidence: .sisyphus/evidence/task-10-tool-coverage.txt

  Scenario: CLI syntax matches actual source
    Tool: Bash
    Preconditions: Task 10 complete
    Steps:
      1. Run `grep "lead-uid" src/worker-tools/hostfully/post-guest-approval.ts` — find the actual flag name
      2. Run `grep "lead-uid" src/workers/skills/tool-usage-reference/SKILL.md` — verify the skill uses the SAME flag name
      3. Run `grep "thread-uid" src/worker-tools/hostfully/post-guest-approval.ts` — find the actual flag name
      4. Run `grep "thread-uid" src/workers/skills/tool-usage-reference/SKILL.md` — verify match
    Expected Result: CLI flags in skill match source code exactly
    Failure Indicators: Flag names don't match source, invented flags
    Evidence: .sisyphus/evidence/task-10-cli-accuracy.txt

  Scenario: Critical warnings section exists
    Tool: Bash
    Preconditions: Task 10 complete
    Steps:
      1. Run `grep -ci "CRITICAL\|WARNING\|DANGER\|NEVER" src/workers/skills/tool-usage-reference/SKILL.md` — verify warnings exist
      2. Run `grep -i "lead.uid.*thread.uid\|thread.uid.*lead.uid" src/workers/skills/tool-usage-reference/SKILL.md` — verify UUID confusion warning
    Expected Result: Contains critical warnings, specifically addresses lead_uid vs thread_uid
    Failure Indicators: No warnings section, UUID confusion not addressed
    Evidence: .sisyphus/evidence/task-10-warnings.txt
  ```

  **Commit**: YES (groups with Task 11)
  - Message: `feat(skills): add employee skills for error prevention`
  - Files: `src/workers/skills/tool-usage-reference/SKILL.md`
  - Pre-commit: `pnpm lint`

- [x] 11. Employee Skill: uuid-disambiguation

  **What to do**:
  - Write the full SKILL.md content at `src/workers/skills/uuid-disambiguation/SKILL.md`
  - This skill specifically addresses the recurring UUID confusion that causes employee errors
  - Content to cover:
    - The UUID landscape: which UUIDs exist in the system and what they identify:
      - `lead_uid` — identifies a guest lead/reservation in Hostfully (e.g., `37f5f58f-...`)
      - `thread_uid` — identifies a message thread in Hostfully (e.g., `2f18249a-...`)
      - `property_uid` — identifies a property in Hostfully (e.g., `c960c8d2-...`)
      - `message_uid` — identifies a single message (used for webhook dedup)
      - `task_id` — identifies an AI employee task in our system
      - `tenant_id` — identifies a tenant in our system
      - `archetype_id` — identifies an employee type
    - How UUIDs flow through the system: webhook payload → `task.raw_event` → env vars → shell tool arguments
    - The CRITICAL rule: `lead_uid ≠ thread_uid` — they come from DIFFERENT fields in the Hostfully webhook payload, they identify DIFFERENT things, they must NEVER be used interchangeably
    - How to identify which UUID is which:
      - `lead_uid` comes from webhook `lead_uid` field → `LEAD_UID` env var → `get-messages.ts --lead-id`
      - `thread_uid` comes from webhook `thread_uid` field → `THREAD_UID` env var → `post-guest-approval.ts --thread-uid`
      - `property_uid` comes from webhook `property_uid` field → `PROPERTY_UID` env var → used in Hostfully URLs
    - Diagnostic: if `post-guest-approval.ts` logs "lead-uid and thread-uid are identical" → you mixed them up
    - Visual mapping: "webhook field X → env var Y → tool flag Z"
  - The description should trigger whenever the agent needs to pass UUIDs to tools

  **Must NOT do**:
  - Do NOT include real production UUIDs — use clearly fake examples like `aaaaaaaa-0000-...`
  - Do NOT use employee-specific language — this serves all employees

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires tracing UUID flow across multiple files (webhook handler, lifecycle, harness, tools) to document accurately
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-10)
  - **Blocks**: Tasks 12, 14
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/gateway/routes/hostfully.ts` — Webhook handler. Shows the exact field names from the Hostfully webhook payload: `lead_uid`, `thread_uid`, `message_uid`, `property_uid`, `agency_uid`.
  - `src/inngest/employee-lifecycle.ts` lines 490-520 — Where `raw_event` fields are extracted and injected as env vars: `LEAD_UID`, `THREAD_UID`, `MESSAGE_UID`, `PROPERTY_UID`.
  - `src/worker-tools/hostfully/post-guest-approval.ts` — The tool that takes BOTH `--lead-uid` and `--thread-uid` as separate args. Contains the stderr warning when both receive identical values.
  - `src/worker-tools/hostfully/get-messages.ts` — Uses `--lead-id` (note: `lead-id`, not `lead-uid` — document this naming difference!)

  **WHY Each Reference Matters**:
  - The webhook handler is where UUIDs ENTER the system — tracing from here shows the complete flow
  - The lifecycle shows how UUIDs get from the event to the container env vars
  - `post-guest-approval.ts` is the tool where confusion causes the most damage — both flags must be different UUIDs

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill documents all UUID types
    Tool: Bash
    Preconditions: Task 11 complete
    Steps:
      1. For each UUID type in [lead_uid, thread_uid, property_uid, message_uid, task_id, tenant_id]:
         Run `grep -i "{type}" src/workers/skills/uuid-disambiguation/SKILL.md` — verify documented
    Expected Result: All UUID types documented with what they identify
    Failure Indicators: Any UUID type missing
    Evidence: .sisyphus/evidence/task-11-uuid-coverage.txt

  Scenario: lead_uid vs thread_uid confusion is explicitly addressed
    Tool: Bash
    Preconditions: Task 11 complete
    Steps:
      1. Run `grep -ci "NEVER\|must not\|different\|not.*same\|not.*interchangeable" src/workers/skills/uuid-disambiguation/SKILL.md` — verify disambiguation language
      2. Run `grep -i "post-guest-approval" src/workers/skills/uuid-disambiguation/SKILL.md` — verify the problematic tool is called out
      3. Run `grep -i "LEAD_UID\|THREAD_UID" src/workers/skills/uuid-disambiguation/SKILL.md` — verify env var mapping documented
    Expected Result: Strong disambiguation warnings, tool called out, env var mapping present
    Failure Indicators: Weak/missing disambiguation, tool not mentioned, no env var mapping
    Evidence: .sisyphus/evidence/task-11-disambiguation.txt
  ```

  **Commit**: YES (groups with Task 10)
  - Message: `feat(skills): add employee skills for error prevention`
  - Files: `src/workers/skills/uuid-disambiguation/SKILL.md`
  - Pre-commit: `pnpm lint`

- [x] 12. Vitest tests for harness skill injection

  **What to do**:
  - Create test file at `tests/workers/skill-injection.test.ts`
  - Tests to write:
    1. **Skill directory structure validation**: Verify `src/workers/skills/` contains expected subdirectories, each with a `SKILL.md` file
    2. **SKILL.md frontmatter validation**: For each skill file, parse YAML frontmatter and assert `name` field matches directory name, `description` field is present and non-empty, name matches `^[a-z0-9]+(-[a-z0-9]+)*$` pattern
    3. **Harness skill logging code exists**: Verify the harness source contains skill discovery logging (grep for the log messages added in Task 3)
    4. **Worker opencode.json has wildcard permission**: Read `src/workers/config/opencode.json`, verify `permission["*"]` is `"allow"` (which covers `skill` permission type)
    5. **Dockerfile has skill COPY instruction**: Read `Dockerfile`, verify it contains a COPY instruction for `src/workers/skills`
  - Use existing test patterns from the `tests/` directory
  - Import `gray-matter` for frontmatter parsing (or use simple YAML parsing)

  **Must NOT do**:
  - Do NOT test skill content quality (that's subjective — QA scenarios handle it)
  - Do NOT start Docker containers in tests (keep tests fast)
  - Do NOT modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding existing test patterns + writing comprehensive validation tests
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 13, but after Wave 2)
  - **Parallel Group**: Wave 3 (with Tasks 13, 14)
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 3, 4, 10, 11

  **References**:

  **Pattern References**:
  - `tests/` — Existing test directory. Look at 2-3 test files to match the project's Vitest patterns (describe/it structure, import conventions, assertion style).
  - `vitest.config.ts` — Test configuration (test file discovery pattern, setup)

  **API/Type References**:
  - `gray-matter` npm package — YAML frontmatter parser. Check if it's already in `package.json` — if not, use a simple regex-based parser to avoid adding dependencies.

  **WHY Each Reference Matters**:
  - Existing tests define the style — new tests must be consistent
  - The config shows how test files are discovered and run

  **Acceptance Criteria**:
  - [ ] Test file created: `tests/workers/skill-injection.test.ts`
  - [ ] `pnpm test -- --run tests/workers/skill-injection.test.ts` → PASS (5+ tests, 0 failures)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All skill injection tests pass
    Tool: Bash
    Preconditions: Tasks 1-4, 10-11 complete
    Steps:
      1. Run `pnpm test -- --run tests/workers/skill-injection.test.ts`
      2. Verify output shows 5+ passing tests
      3. Verify 0 failures
    Expected Result: All tests pass
    Failure Indicators: Any test failure, file not found
    Evidence: .sisyphus/evidence/task-12-test-results.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Preconditions: Task 12 complete
    Steps:
      1. Run `pnpm test -- --run` (full suite)
      2. Verify 515+ passing (existing + new)
      3. Verify 0 new failures
    Expected Result: Full suite passes with new tests included
    Failure Indicators: Test count decreased, new failures introduced
    Evidence: .sisyphus/evidence/task-12-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(worker): add skill injection tests`
  - Files: `tests/workers/skill-injection.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 13. Update AGENTS.md with skill system documentation

  **What to do**:
  - Add a new section to `AGENTS.md` documenting the skill system. Place it after the "OpenCode Worker" section (logical location — skills extend the worker capability).
  - Content to add:
    - **Skills System** heading
    - Explanation: employees have baked-in skills at `/app/.opencode/skills/`; dev agents have project-level skills at `.opencode/skills/`
    - How skills work: two-phase loading (names always in system prompt, content loaded on-demand via `skill` tool)
    - Employee skills listing: `tool-usage-reference`, `uuid-disambiguation` with brief descriptions
    - Dev skills listing: all 5 skills with brief descriptions
    - How to add a new employee skill: create `src/workers/skills/{name}/SKILL.md` with frontmatter, rebuild Docker image
    - How to add a new dev skill: create `.opencode/skills/{name}/SKILL.md` with frontmatter, commit to git
    - SKILL.md format: frontmatter requirements (`name` matches dir, `description` present)
  - Update the "Adding a new employee" section to mention that new archetypes benefit from existing skills automatically (all shared)
  - Update the "Documentation Freshness" section if needed (new directory pattern to track)

  **Must NOT do**:
  - Do NOT restructure existing AGENTS.md sections
  - Do NOT add line numbers or counts that go stale
  - Do NOT reference AI tools in the documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing task — clear prose, accurate technical content
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 12, 14)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: All previous tasks (needs final skill list to document)

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Read the existing document structure. Match heading style, table format, and tone. Look at how "OpenCode Worker" section is structured — the Skills section should follow the same pattern.

  **WHY Each Reference Matters**:
  - AGENTS.md is loaded into every LLM call — consistency matters for token efficiency and readability

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skills section exists and is complete
    Tool: Bash
    Preconditions: Task 13 complete
    Steps:
      1. Run `grep -n "## Skills System\|## AI Agent Skills\|## Skills" AGENTS.md` — verify section exists
      2. Run `grep -c "tool-usage-reference\|uuid-disambiguation" AGENTS.md` — verify employee skills listed
      3. Run `grep -c "adding-shell-tools\|debugging-lifecycle\|creating-archetypes\|hostfully-api\|e2e-testing" AGENTS.md` — verify dev skills listed
      4. Run `grep -c "SKILL.md" AGENTS.md` — verify format documented
    Expected Result: Section exists, all skills listed, format documented
    Failure Indicators: Section missing, incomplete skill listing
    Evidence: .sisyphus/evidence/task-13-agents-md.txt
  ```

  **Commit**: YES (groups with Task 14)
  - Message: `docs: update AGENTS.md with skill system documentation`
  - Files: `AGENTS.md`
  - Pre-commit: —

- [x] 14. Docker build + skill discovery verification

  **What to do**:
  - Build the Docker image with skills baked in
  - Verify the skill files are present at the correct paths inside the container
  - Verify OpenCode would discover the skills (check that the paths match OpenCode's discovery pattern)
  - Verify the full test suite passes after all changes
  - Verify `pnpm build` succeeds
  - Run `pnpm lint` to catch any formatting issues

  **Must NOT do**:
  - Do NOT push the Docker image to any registry
  - Do NOT start actual OpenCode sessions inside the container (that requires OPENROUTER_API_KEY)
  - Do NOT modify any files — this is a verification-only task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification task — run commands, check output, report results
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 2 completion and Task 12)
  - **Parallel Group**: Wave 3 (after Task 12)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Tasks 4, 10, 11, 12

  **References**:

  **Pattern References**:
  - `Dockerfile` — Verify the COPY instruction is correct
  - `src/workers/skills/` — Verify all skill files exist

  **WHY Each Reference Matters**:
  - This task validates the entire Wave 1 + Wave 2 output end-to-end

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image contains skills at correct paths
    Tool: Bash (tmux for docker build)
    Preconditions: All previous tasks complete
    Steps:
      1. Run `docker build -t ai-employee-worker:latest .` in tmux session
      2. Wait for build completion
      3. Run `docker run --rm ai-employee-worker:latest ls -la /app/.opencode/skills/` — verify directories
      4. Run `docker run --rm ai-employee-worker:latest ls /app/.opencode/skills/tool-usage-reference/` — verify SKILL.md present
      5. Run `docker run --rm ai-employee-worker:latest ls /app/.opencode/skills/uuid-disambiguation/` — verify SKILL.md present
      6. Run `docker run --rm ai-employee-worker:latest head -5 /app/.opencode/skills/tool-usage-reference/SKILL.md` — verify frontmatter
    Expected Result: Both skill directories present, SKILL.md files with valid frontmatter
    Failure Indicators: Build fails, skills missing, wrong paths
    Evidence: .sisyphus/evidence/task-14-docker-verification.txt

  Scenario: Build and test suite pass
    Tool: Bash
    Preconditions: Docker build passes
    Steps:
      1. Run `pnpm build` — verify success
      2. Run `pnpm test -- --run` — verify 515+ pass, 0 new failures
      3. Run `pnpm lint` — verify no errors
    Expected Result: All three commands succeed
    Failure Indicators: Build failure, test failure, lint errors
    Evidence: .sisyphus/evidence/task-14-build-test.txt
  ```

  **Commit**: NO (verification only — no file changes)

- [ ] 15. Notify completion

  Send Telegram notification: plan `ai-agent-skills` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ ai-agent-skills complete — All tasks done. Come back to review results."
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check structure, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify all SKILL.md files have valid YAML frontmatter with `name` and `description` fields.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Build Docker image. Run container with `docker run --rm ai-employee-worker:latest ls -la /app/.opencode/skills/` — verify all employee skills present. Verify each SKILL.md has valid frontmatter via `node -e` parsing. Check `.opencode/skills/` in repo has all 5 dev skills. Run `pnpm test -- --run` and verify new tests pass. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Docker Skills [N/N present] | Frontmatter [N/N valid] | Dev Skills [N/N present] | Tests [N pass/N fail] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no oh-my-openagent in containers, no remote URLs, no per-archetype filtering, no DB migrations, no feedback pipeline changes. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Group       | Message                                                                      | Files                                                                                        | Pre-commit           |
| ----------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------- |
| Tasks 1-4   | `feat(worker): add skill infrastructure for native OpenCode skill discovery` | `src/workers/skills/`, `.opencode/skills/`, `Dockerfile`, `src/workers/opencode-harness.mts` | `pnpm build`         |
| Tasks 5-9   | `feat(skills): add dev-agent skills for common workflows`                    | `.opencode/skills/*/SKILL.md`                                                                | `pnpm lint`          |
| Tasks 10-11 | `feat(skills): add employee skills for error prevention`                     | `src/workers/skills/*/SKILL.md`                                                              | `pnpm lint`          |
| Task 12     | `test(worker): add skill injection tests`                                    | `tests/workers/skill-injection.test.ts`                                                      | `pnpm test -- --run` |
| Tasks 13-14 | `docs: update AGENTS.md with skill system documentation`                     | `AGENTS.md`                                                                                  | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # Expected: 515+ pass, 0 fail (existing + new skill tests)
pnpm build                  # Expected: success
docker build -t ai-employee-worker:latest .  # Expected: success
docker run --rm ai-employee-worker:latest ls /app/.opencode/skills/  # Expected: tool-usage-reference/ uuid-disambiguation/
docker run --rm ai-employee-worker:latest cat /app/.opencode/skills/tool-usage-reference/SKILL.md | head -5  # Expected: YAML frontmatter with name and description
ls .opencode/skills/        # Expected: 5 skill directories
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker image builds with skills
- [ ] Dev skills discoverable in repo
- [ ] AGENTS.md updated
