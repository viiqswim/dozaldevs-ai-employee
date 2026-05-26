# Dockerfile Tool COPY Simplification + AGENTS.md/README Cleanup

## TL;DR

> **Quick Summary**: Fix the Dockerfile to blanket-COPY all worker tools (fixing missing `submit-output.ts` bug), add a unified `src/worker-tools/package.json` for tool deps, and clean up AGENTS.md/README.md to replace stale enumerated lists with durable structural descriptions.
>
> **Deliverables**:
>
> - Simplified Dockerfile (~50 COPY lines → 3 lines)
> - New `src/worker-tools/package.json` for unified tool dependencies
> - Cleaned AGENTS.md — no stale counts, structural descriptions instead of inventories
> - Cleaned README.md — same stale count removal
> - Updated `adding-shell-tools` skill and guide
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 7 → Task 8 → F1–F4

---

## Context

### Original Request

User asked for an audit of AGENTS.md accuracy against the codebase. The audit revealed stale counts (model/migration/test), incomplete module and service lists that go stale, verbose per-tool CLI syntax that won't scale, and a critical Dockerfile bug where `submit-output.ts` is never copied into the Docker image for production builds.

### Interview Summary

**Key Discussions**:

- Stale counts (25 models, 28 migrations, 1490 tests): User decided to remove ALL counts — they go stale constantly and provide no durable value
- Per-tool documentation: User decided to keep service-level categories only — individual tools will grow to thousands and can't be enumerated
- src/lib enumeration: Keep only 3 constraint-bearing modules (call-llm, encryption, model-selection), replace rest with structural note
- Gateway services: Replace enumeration with structural note
- Dockerfile: Blanket COPY + unified package.json for deps — no per-file COPY, no per-service npm install
- Admin utilities (register-webhook.ts): User chose "Copy everything" — accept all tools available in container
- Deregistered Inngest function list: Remove — inline code comments in serve.ts are sufficient

**Research Findings**:

- `submit-output.ts` (platform tool) is referenced by `platform-procedures.mts` and `opencode-harness.mts` but NOT copied in Dockerfile — production bug
- The `adding-shell-tools` skill already claims blanket COPY behavior that doesn't match reality — our change makes it accurate
- `@slack/web-api` is the ONLY external npm dep across all 25+ tool files
- `.dockerignore` already excludes `node_modules` (covers EC5 from Metis)
- No tools import from outside `src/worker-tools/` (safe for blanket COPY)
- No tools reference `/tool-deps/` paths directly (safe to remove old approach)
- Builder stage `WORKDIR` is `/build`, confirming COPY source path

### Metis Review

**Identified Gaps** (addressed):

- Docker runtime dep resolution: Added smoke test acceptance criteria (not just file presence)
- `.dockerignore` node_modules safety: Already handled by existing `.dockerignore`
- Skill/Dockerfile atomicity: Both changes in same commit
- Canonical location for tool docs after removing from AGENTS.md: `tool-usage-reference` skill (employees) + `--help` output + adding-shell-tools guide (devs)

---

## Work Objectives

### Core Objective

Fix a production Dockerfile bug and clean up documentation to use durable patterns instead of stale inventories.

### Concrete Deliverables

- `Dockerfile` — simplified tool section (blanket COPY + unified install)
- `src/worker-tools/package.json` — NEW file with tool dependencies
- `AGENTS.md` — cleaned of stale counts and exhaustive enumerations
- `README.md` — cleaned of stale test/model counts
- `.opencode/skills/adding-shell-tools/SKILL.md` — updated dep and AGENTS.md guidance
- `docs/guides/2026-05-04-1645-adding-a-shell-tool.md` — updated dep guidance

### Definition of Done

- [ ] `docker build -t ai-employee-worker:latest .` succeeds
- [ ] `docker run --rm ai-employee-worker:latest ls /tools/platform/submit-output.ts` returns the file (bug fix verified)
- [ ] `docker run --rm ai-employee-worker:latest tsx /tools/platform/submit-output.ts --help` exits 0 (runtime resolution works)
- [ ] `docker run --rm ai-employee-worker:latest tsx /tools/slack/post-message.ts --help` exits 0 (Slack dep resolves)
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] AGENTS.md contains zero instances of "25 models", "28 migrations", or "1490 passing"

### Must Have

- `submit-output.ts` available at `/tools/platform/submit-output.ts` in Docker image
- All existing tools still present and functional after Dockerfile change
- AGENTS.md structural descriptions replace enumerated lists
- Adding-shell-tools skill matches new reality

### Must NOT Have (Guardrails)

- DO NOT modify any runtime code (opencode-harness, lifecycle, gateway routes, etc.)
- DO NOT change tool file contents — only the Dockerfile and docs
- DO NOT run unit tests (user's standing instruction — known timeout issues)
- DO NOT remove the `!src/workers/config/agents.md` exception from `.dockerignore`
- DO NOT add employee-specific content to AGENTS.md (it's shared across all employees)
- DO NOT remove the 3 critical modules (call-llm, encryption, model-selection) from the src/lib description — these enforce platform constraints

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (user's standing instruction — known timeout issues)
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Dockerfile**: Use Bash — `docker build`, `docker run` commands
- **Documentation**: Use Grep — verify removed content is gone, new content is present

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent, MAX PARALLEL):
├── Task 1: Create src/worker-tools/package.json + simplify Dockerfile [quick]
├── Task 2: Clean up AGENTS.md [quick]
├── Task 3: Clean up README.md [quick]
├── Task 4: Update adding-shell-tools skill [quick]
├── Task 5: Update shell tool guide [quick]
└── Task 6: Add docker:* commands to AGENTS.md Commands table [quick]

Wave 2 (After Wave 1 — verification):
├── Task 7: Build + lint verification [quick]
└── Task 8: Docker smoke tests + commit [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
├── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 7, 8   |
| 2    | —          | 7, 8   |
| 3    | —          | 7, 8   |
| 4    | —          | 7, 8   |
| 5    | —          | 7, 8   |
| 6    | —          | 7, 8   |
| 7    | 1–6        | 8      |
| 8    | 7          | F1–F4  |

### Agent Dispatch Summary

- **Wave 1**: **6** — T1–T6 → `quick`
- **Wave 2**: **2** — T7–T8 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `src/worker-tools/package.json` and simplify Dockerfile

  **What to do**:
  - Create `src/worker-tools/package.json` with content:
    ```json
    {
      "private": true,
      "description": "Dependencies for AI employee shell tools. Installed inside Docker at /tools/.",
      "dependencies": {
        "@slack/web-api": "^7.15.1"
      }
    }
    ```
  - In `Dockerfile`, replace the entire tool-copy section (lines 84–133) with:
    ```dockerfile
    # Copy ALL worker tools into the image — no per-file COPY needed.
    # Adding a new tool or service? Just commit to src/worker-tools/ and rebuild.
    COPY --from=builder /build/src/worker-tools/ /tools/
    RUN cd /tools && npm install --production
    ENV NODE_PATH=/tools/node_modules
    ```
  - Remove the old `RUN mkdir -p /tool-deps/slack` and `RUN npm install --prefix /tool-deps/slack` lines
  - Remove the old `ENV NODE_PATH=/tool-deps/slack/node_modules` line
  - Preserve everything BEFORE line 84 (builder stage, system deps, OpenCode install, config copies) and AFTER line 134 (LABEL, CMD)

  **Must NOT do**:
  - Do NOT modify the builder stage (lines 1–20)
  - Do NOT remove the `COPY src/workers/skills/` line (line 81) — skills are separate from tools
  - Do NOT remove the `COPY src/workers/config/agents.md` line (line 82)
  - Do NOT remove the `COPY src/workers/config/opencode.json` line (line 79)
  - Do NOT remove the `COPY src/workers/entrypoint.sh` line (line 77)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:
  - `Dockerfile:84-133` — the section to replace (individual COPY lines)
  - `Dockerfile:77-82` — the lines to PRESERVE above the tool section
  - `Dockerfile:135-138` — the lines to PRESERVE below the tool section
  - `src/worker-tools/slack/post-message.ts:1` — imports `@slack/web-api` (the only external dep)
  - `src/worker-tools/slack/read-channels.ts:1` — imports `@slack/web-api`
  - `src/worker-tools/slack/post-guest-approval.ts:3` — imports `@slack/web-api`
  - `.dockerignore:2` — `node_modules` is already excluded (safe for blanket COPY)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dockerfile has blanket COPY instead of individual lines
    Tool: Bash (grep)
    Preconditions: Task 1 changes applied
    Steps:
      1. grep "COPY --from=builder /build/src/worker-tools/ /tools/" Dockerfile
      2. grep -c "COPY.*worker-tools.*\.ts" Dockerfile — count individual .ts COPY lines
      3. grep "npm install --prefix /tool-deps" Dockerfile — should find nothing
    Expected Result: Step 1 finds 1 match, Step 2 returns 0, Step 3 returns 0
    Failure Indicators: Individual COPY lines still present, or old /tool-deps install remains
    Evidence: .sisyphus/evidence/task-1-dockerfile-structure.txt

  Scenario: package.json is valid and contains @slack/web-api
    Tool: Bash
    Steps:
      1. cat src/worker-tools/package.json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" — validates JSON
      2. node -e "const p=require('./src/worker-tools/package.json'); console.log(p.dependencies['@slack/web-api'])"
    Expected Result: JSON is valid, @slack/web-api version is "^7.15.1"
    Evidence: .sisyphus/evidence/task-1-package-json.txt
  ```

  **Commit**: YES (groups with all tasks)
  - Message: `refactor: simplify Dockerfile tool COPY and clean up stale AGENTS.md inventories`

- [x] 2. Clean up AGENTS.md — remove stale inventories, add structural descriptions

  **What to do**:
  - **Remove model/migration counts**: Find the line `Prisma — prisma/schema.prisma; REST API: Supabase PostgREST` that says "25 models" and "28 migrations" — remove the counts entirely. Change to just: `**ORM**: Prisma — `prisma/schema.prisma`; **REST API**: Supabase PostgREST on `http://localhost:54331``
  - **Remove test count**: Find `expects 1490 passing, 27 skipped, 0 failures` — replace with `All tests should pass with 0 failures. Some tests are skipped intentionally (see Pre-existing Test Failures).`
  - **Replace src/lib enumeration**: The current line lists 17 modules: `fly-client, github-client, slack-client, jira-client, call-llm...`. Replace with: `Shared: LLM client (`call-llm.ts` — $50/day cost circuit breaker, model enforcement), encryption (`encryption.ts` — AES-256-GCM for tenant secrets), model-selection engine (`model-selection/`), plus HTTP clients, logging, retry utilities, and type definitions. Browse `src/lib/` for the full list.`
  - **Replace gateway services enumeration**: The current text says "dispatcher, task creation, project registry, tenant/secret repos, time-estimator". Replace with: `Business logic services (dispatcher, task creation, tenant/secret management, archetype generation, interaction classification, and more). Browse `src/gateway/services/` for the full list.`
  - **Replace per-tool CLI syntax**: Remove the verbose Sifely tool listing (9 tools with full flags), the Hostfully tools section (2 tools), the Jira tools section (5 tools with flags), and the Platform tools section (2 tools). Replace ALL tool sections with a single service-level table:

    ```
    **Shell tools** at `/tools/` in Docker image — one directory per service:

    | Service | Directory | Purpose |
    |---------|-----------|---------|
    | Slack | `/tools/slack/` | Post messages, read channels, post approval cards |
    | Hostfully | `/tools/hostfully/` | Messages, properties, reservations, reviews, door codes |
    | Sifely | `/tools/sifely/` | Lock management, passcode CRUD, code rotation, access diagnostics |
    | Jira | `/tools/jira/` | Issue lookup, search, comments |
    | Knowledge Base | `/tools/knowledge_base/` | Semantic search over employee knowledge entries |
    | Platform | `/tools/platform/` | Report issues, submit task output |

    All tools support `--help`. For detailed CLI syntax, load the `tool-usage-reference` skill.
    Source: `src/worker-tools/{service}/`. See the [Adding a Shell Tool](docs/guides/2026-05-04-1645-adding-a-shell-tool.md) guide.
    ```

  - **Remove deregistered Inngest functions list**: Remove the bullet list that says `trigger/feedback-summarizer (DELETED)`, `trigger/daily-summarizer (DELETED)`, `trigger/guest-message-poll (preserved)`, `3 deprecated engineering functions`. These are already documented as comments in `src/gateway/inngest/serve.ts`.
  - **Remove the "Inngest functions (deregistered)" bullet entirely** — the active functions list is sufficient.

  **Must NOT do**:
  - Do NOT remove the 5 active Inngest functions list — that's accurate and useful
  - Do NOT remove the `SYNTHESIS_THRESHOLD`, `MAX_EMPLOYEE_RULES_CHARS`, `MAX_EMPLOYEE_KNOWLEDGE_CHARS` constants — those are durable
  - Do NOT modify the Approved LLM Models section — that's accurate
  - Do NOT modify the Deprecated Components table — that's a different concern
  - Do NOT add employee-specific content
  - Do NOT change the Reference Documents table

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` — the file to edit (entire file is loaded into agent context via system prompt)
  - `src/gateway/inngest/serve.ts:47-58` — confirms 5 active functions (don't remove this claim)
  - `src/lib/call-llm.ts` — cost circuit breaker module (keep in description)
  - `src/lib/encryption.ts` — AES-256-GCM module (keep in description)
  - `src/lib/model-selection/` — recommendation engine (keep in description)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stale counts removed
    Tool: Bash (grep)
    Steps:
      1. grep -c "25 models" AGENTS.md
      2. grep -c "28 migrations" AGENTS.md
      3. grep -c "1490 passing" AGENTS.md
      4. grep -c "27 skipped" AGENTS.md
    Expected Result: All return 0
    Evidence: .sisyphus/evidence/task-2-counts-removed.txt

  Scenario: Structural descriptions present
    Tool: Bash (grep)
    Steps:
      1. grep "Browse.*src/lib/" AGENTS.md — structural note present
      2. grep "Browse.*src/gateway/services/" AGENTS.md — structural note present
      3. grep "tool-usage-reference" AGENTS.md — points to skill for detailed syntax
      4. grep "call-llm" AGENTS.md — critical module still named
      5. grep "encryption" AGENTS.md — critical module still named
      6. grep "model-selection" AGENTS.md — critical module still named
    Expected Result: All 6 greps find matches
    Evidence: .sisyphus/evidence/task-2-structural-notes.txt

  Scenario: Per-tool CLI syntax removed
    Tool: Bash (grep)
    Steps:
      1. grep -c "tsx /tools/sifely/" AGENTS.md — should be 0 (individual Sifely CLI removed)
      2. grep -c "tsx /tools/jira/" AGENTS.md — should be 0 (individual Jira CLI removed)
      3. grep -c "\-\-lock-id" AGENTS.md — should be 0 (Sifely flag details removed)
    Expected Result: All return 0
    Evidence: .sisyphus/evidence/task-2-cli-syntax-removed.txt
  ```

  **Commit**: YES (groups with all tasks)

- [x] 3. Clean up README.md — remove stale counts

  **What to do**:
  - Find `**Expected results**: 1490 passing, 27 skipped, 0 failures.` in README.md — replace with: `**Expected results**: All tests should pass with 0 failures. Two pre-existing skips are expected and intentional (see below).`
  - The two pre-existing skip explanations that follow should remain as-is (they're durable).

  **Must NOT do**:
  - Do NOT restructure README.md beyond the specific count removal
  - Do NOT touch the Documentation table, Scripts table, or any other section

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:
  - `README.md` — search for "1490" to find the line

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Stale test count removed from README
    Tool: Bash (grep)
    Steps:
      1. grep -c "1490" README.md
    Expected Result: Returns 0
    Evidence: .sisyphus/evidence/task-3-readme-count.txt

  Scenario: Replacement text present
    Tool: Bash (grep)
    Steps:
      1. grep "All tests should pass with 0 failures" README.md
    Expected Result: 1 match found
    Evidence: .sisyphus/evidence/task-3-readme-replacement.txt
  ```

  **Commit**: YES (groups with all tasks)

- [x] 4. Update `adding-shell-tools` skill

  **What to do**:
  - In `.opencode/skills/adding-shell-tools/SKILL.md`:
  - **Step 5 (line 138)**: Change `New npm dependencies → add to root \`package.json\` → included on next build`to:`New npm dependencies → add to \`src/worker-tools/package.json\` → included on next Docker build`
  - **Step 6 (lines 140-149)**: Replace the instruction to "Add a usage example under the 'OpenCode Worker' section in AGENTS.md" with guidance that matches the new approach: `If you are adding a new **service directory** (not just a new tool in an existing service), add a row to the shell tools table in AGENTS.md. Individual tools within an existing service do NOT need AGENTS.md documentation — the \`tool-usage-reference\` skill and \`--help\` output are sufficient.`
  - **Line 204 (Common Mistakes table)**: Change `Every new tool must appear in the Shell tools block in AGENTS.md` to: `New **service directories** must be added to the AGENTS.md shell tools table. Individual tools do not need AGENTS.md entries.`

  **Must NOT do**:
  - Do NOT rewrite the entire skill — only update the 3 specific sections
  - Do NOT change the code pattern template, mock fixture guidance, or env var handling

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:
  - `.opencode/skills/adding-shell-tools/SKILL.md:132-149` — Step 5 and Step 6 to update
  - `.opencode/skills/adding-shell-tools/SKILL.md:204` — Common Mistakes table row to update

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill references correct package.json location
    Tool: Bash (grep)
    Steps:
      1. grep "src/worker-tools/package.json" .opencode/skills/adding-shell-tools/SKILL.md
      2. grep -c "root.*package.json.*included on next build" .opencode/skills/adding-shell-tools/SKILL.md — old text gone
    Expected Result: Step 1 finds match, Step 2 returns 0
    Evidence: .sisyphus/evidence/task-4-skill-deps.txt

  Scenario: Skill no longer instructs per-tool AGENTS.md docs
    Tool: Bash (grep)
    Steps:
      1. grep -c "Add a usage example" .opencode/skills/adding-shell-tools/SKILL.md — old instruction gone
      2. grep "service directory" .opencode/skills/adding-shell-tools/SKILL.md — new guidance present
    Expected Result: Step 1 returns 0, Step 2 finds match
    Evidence: .sisyphus/evidence/task-4-skill-guidance.txt
  ```

  **Commit**: YES (groups with all tasks)

- [x] 5. Update shell tool guide

  **What to do**:
  - In `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`:
  - **Line 147**: Change `New npm dependencies used by the tool must be added to the root \`package.json\``to:`New npm dependencies used by the tool must be added to \`src/worker-tools/package.json\``
  - **Section 6 "Document in AGENTS.md" (lines 150-159)**: Update to match the new approach — only new service directories need AGENTS.md documentation, not individual tools. Replace with guidance matching the skill update in Task 4.

  **Must NOT do**:
  - Do NOT rename or create a new guide file — edit in place (this is a living reference doc, not a snapshot)
  - Do NOT rewrite sections unrelated to deps or AGENTS.md guidance

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:
  - `docs/guides/2026-05-04-1645-adding-a-shell-tool.md:136-159` — the sections to update

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Guide references correct package.json location
    Tool: Bash (grep)
    Steps:
      1. grep "src/worker-tools/package.json" docs/guides/2026-05-04-1645-adding-a-shell-tool.md
      2. grep -c "root.*package.json.*will be included" docs/guides/2026-05-04-1645-adding-a-shell-tool.md — old text gone
    Expected Result: Step 1 finds match, Step 2 returns 0
    Evidence: .sisyphus/evidence/task-5-guide-deps.txt
  ```

  **Commit**: YES (groups with all tasks)

- [x] 6. Add docker commands to AGENTS.md Commands table

  **What to do**:
  - Find the Commands table in AGENTS.md (section `## Commands`)
  - Add these rows after the existing entries:
    ```
    | Docker start     | `pnpm docker:start`                    |
    | Docker stop      | `pnpm docker:stop`                     |
    | Docker reset     | `pnpm docker:reset`                    |
    | Docker status    | `pnpm docker:status`                   |
    | Dashboard build  | `pnpm dashboard:build`                 |
    | Full E2E run     | `pnpm dev:e2e`                         |
    ```

  **Must NOT do**:
  - Do NOT reorder existing rows
  - Do NOT remove any existing commands

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:
  - `AGENTS.md` — search for `## Commands` to find the table
  - `package.json` — scripts section confirms these commands exist

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker commands present in table
    Tool: Bash (grep)
    Steps:
      1. grep "docker:start" AGENTS.md
      2. grep "docker:stop" AGENTS.md
      3. grep "docker:reset" AGENTS.md
      4. grep "dev:e2e" AGENTS.md
    Expected Result: All find matches
    Evidence: .sisyphus/evidence/task-6-docker-commands.txt
  ```

  **Commit**: YES (groups with all tasks)

- [x] 7. Build + lint verification

  **What to do**:
  - Run `pnpm build` — must exit 0
  - Run `pnpm lint` — must exit 0
  - Build Docker image: `docker build -t ai-employee-worker:latest .` — must succeed
  - If any fails, fix the issue in the relevant task's files and retry

  **Must NOT do**:
  - Do NOT run `pnpm test` (user's standing instruction)
  - Do NOT modify any files that weren't already changed in Tasks 1-6

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 8
  - **Blocked By**: Tasks 1–6

  **References**:
  - `package.json` — build and lint scripts
  - `Dockerfile` — the file being built

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript build succeeds
    Tool: Bash
    Steps:
      1. pnpm build
    Expected Result: Exit 0, no errors
    Evidence: .sisyphus/evidence/task-7-build.txt

  Scenario: Lint passes
    Tool: Bash
    Steps:
      1. pnpm lint
    Expected Result: Exit 0, no errors
    Evidence: .sisyphus/evidence/task-7-lint.txt

  Scenario: Docker build succeeds
    Tool: Bash (tmux — long-running)
    Steps:
      1. docker build -t ai-employee-worker:latest .
    Expected Result: Successfully built message, exit 0
    Failure Indicators: COPY failures, npm install failures, syntax errors
    Evidence: .sisyphus/evidence/task-7-docker-build.txt
  ```

  **Commit**: NO (verification only)

- [x] 8. Docker smoke tests + commit

  **What to do**:
  - Run smoke tests against the built Docker image:
    1. `docker run --rm ai-employee-worker:latest ls /tools/platform/` — must show `submit-output.ts` and `report-issue.ts`
    2. `docker run --rm ai-employee-worker:latest tsx /tools/platform/submit-output.ts --help` — must exit 0
    3. `docker run --rm ai-employee-worker:latest tsx /tools/slack/post-message.ts --help` — must exit 0 (verifies @slack/web-api resolves)
    4. `docker run --rm ai-employee-worker:latest tsx /tools/hostfully/get-property.ts --help` — must exit 0
    5. `docker run --rm ai-employee-worker:latest tsx /tools/sifely/list-locks.ts --help` — must exit 0
    6. `docker run --rm ai-employee-worker:latest tsx /tools/jira/get-issue.ts --help` — must exit 0
    7. `docker run --rm ai-employee-worker:latest tsx /tools/knowledge_base/search.ts --help` — must exit 0
    8. `docker run --rm ai-employee-worker:latest find /tools -name "*.ts" -not -path "*/node_modules/*" | wc -l` — count all tools
  - If all pass, commit all changes from Tasks 1-6 with message: `refactor: simplify Dockerfile tool COPY and clean up stale AGENTS.md inventories`
  - Files to commit: `Dockerfile`, `src/worker-tools/package.json`, `AGENTS.md`, `README.md`, `.opencode/skills/adding-shell-tools/SKILL.md`, `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`

  **Must NOT do**:
  - Do NOT commit if any smoke test fails — fix first
  - Do NOT use `--no-verify` on the commit
  - Do NOT add `Co-authored-by` lines

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after Task 7)
  - **Blocks**: F1–F4
  - **Blocked By**: Task 7

  **References**:
  - `src/worker-tools/platform/submit-output.ts` — the bug fix target (must be present in image)
  - `src/worker-tools/slack/post-message.ts` — imports @slack/web-api (must resolve)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: submit-output.ts present and functional (BUG FIX VERIFICATION)
    Tool: Bash
    Steps:
      1. docker run --rm ai-employee-worker:latest ls /tools/platform/submit-output.ts
      2. docker run --rm ai-employee-worker:latest tsx /tools/platform/submit-output.ts --help
    Expected Result: File exists, --help exits 0 with usage text
    Failure Indicators: "No such file" or "MODULE_NOT_FOUND"
    Evidence: .sisyphus/evidence/task-8-submit-output-fix.txt

  Scenario: All service directories present with tools
    Tool: Bash
    Steps:
      1. docker run --rm ai-employee-worker:latest ls /tools/slack/
      2. docker run --rm ai-employee-worker:latest ls /tools/hostfully/
      3. docker run --rm ai-employee-worker:latest ls /tools/sifely/
      4. docker run --rm ai-employee-worker:latest ls /tools/jira/
      5. docker run --rm ai-employee-worker:latest ls /tools/platform/
      6. docker run --rm ai-employee-worker:latest ls /tools/knowledge_base/
    Expected Result: All 6 directories exist and contain .ts files
    Evidence: .sisyphus/evidence/task-8-all-services.txt

  Scenario: @slack/web-api dependency resolves at runtime
    Tool: Bash
    Steps:
      1. docker run --rm ai-employee-worker:latest tsx /tools/slack/post-message.ts --help
    Expected Result: Exit 0, prints usage — NOT "Cannot find module '@slack/web-api'"
    Failure Indicators: MODULE_NOT_FOUND error
    Evidence: .sisyphus/evidence/task-8-slack-dep.txt

  Scenario: Clean git commit
    Tool: Bash
    Steps:
      1. git status --short after commit
    Expected Result: Empty output (clean working tree)
    Evidence: .sisyphus/evidence/task-8-git-clean.txt
  ```

  **Commit**: YES
  - Message: `refactor: simplify Dockerfile tool COPY and clean up stale AGENTS.md inventories`
  - Files: `Dockerfile`, `src/worker-tools/package.json`, `AGENTS.md`, `README.md`, `.opencode/skills/adding-shell-tools/SKILL.md`, `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`
  - Pre-commit: `pnpm lint && pnpm build`

- [ ] 9. Notify completion

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "📋 Plan ready: dockerfile-agentsmd-cleanup — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: Task 8

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify `package.json` is valid JSON. Verify Dockerfile syntax.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Build Docker image. Run `docker run --rm ai-employee-worker:latest ls -R /tools/` to verify ALL tools present. Run `--help` on: `submit-output.ts`, `post-message.ts`, `report-issue.ts`, `get-property.ts`, `list-locks.ts`, `get-issue.ts`, `search.ts`. Compare tool count pre vs post.
      Output: `Tools [N/N present] | Deps [N/N resolve] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Single commit**: `refactor: simplify Dockerfile tool COPY and clean up stale AGENTS.md inventories`
  - Files: `Dockerfile`, `src/worker-tools/package.json`, `AGENTS.md`, `README.md`, `.opencode/skills/adding-shell-tools/SKILL.md`, `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`
  - Pre-commit: `pnpm lint && pnpm build`

---

## Success Criteria

### Verification Commands

```bash
docker build -t ai-employee-worker:latest .  # Expected: successful build
docker run --rm ai-employee-worker:latest ls /tools/platform/  # Expected: report-issue.ts submit-output.ts
docker run --rm ai-employee-worker:latest tsx /tools/platform/submit-output.ts --help  # Expected: exit 0, usage text
docker run --rm ai-employee-worker:latest tsx /tools/slack/post-message.ts --help  # Expected: exit 0, usage text
pnpm lint  # Expected: exit 0
pnpm build  # Expected: exit 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Docker image builds and all tools resolve
- [ ] AGENTS.md has no stale counts or exhaustive enumerations
