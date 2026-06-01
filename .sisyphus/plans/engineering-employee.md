# Engineering Employee — General-Purpose Code-Writing Archetype

## TL;DR

> **Quick Summary**: Create a general-purpose AI employee archetype that can clone any repo, write code changes (bug fixes, small enhancements), run tests, create a GitHub PR, and submit for human approval via the existing Slack card flow. No lifecycle changes — everything through archetype config, `worker_env`, and `execution_steps`.
>
> **Deliverables**:
>
> - Engineering archetype seed (identity, execution_steps, delivery_steps, tool_registry, worker_env)
> - Employee documentation (`docs/employees/engineer.md`)
> - AGENTS.md + README.md updates reflecting the new employee
> - End-to-end verified: manual trigger → code changes → PR → Slack approval → delivery
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (spike validation) → Task 2 (archetype seed) → Task 7 (E2E trigger) → F1-F4

---

## Context

### Original Request

"If you were to help me leverage this AI employee platform so that it can spin up AI employees to write features, bug fixes, or enhancements for this code itself, how would you do it? What changes are needed in order to be able to support this?"

### Interview Summary

**Key Discussions**:

- **Trigger**: Manual API trigger (`POST /admin/tenants/:id/employees/engineer/trigger` with `{ "prompt": "..." }`). No webhook handler needed for MVP.
- **Scope**: Start with simple changes (1-3 files). Prove reliability before expanding.
- **Target**: General-purpose archetype configurable per-repo via `worker_env` (REPO_URL). First target: ai-employee repo (dogfooding).
- **Approval**: Always require human review (`approval_required: true`). Slack approval card shows PR link.
- **Pre-submit testing**: Full validation — `pnpm lint`, `pnpm build`, `pnpm test -- --run` must pass before PR creation.
- **Delivery**: After PM approval, delivery container posts Slack summary with PR link. PM manually merges.
- **Architecture**: No lifecycle changes. No new webhook handlers. Everything via archetype config + inline bash.

**Research Findings**:

- Docker container already has Node.js 22, pnpm, git, `gh` CLI v2.45.0, tsx, OpenCode — all tools needed.
- Deprecated engineering employee (1100-line orchestrator + 30 lib files) was shelved for reimplementing what OpenCode already does. Not repeating that mistake.
- `worker_env` field on archetypes injects arbitrary env vars without lifecycle changes — perfect for `REPO_URL`, `BASE_BRANCH`.
- Platform AGENTS.md rule "NEVER modify files outside /tools/" is the #1 blocker — must be overridden in archetype `identity` field.
- `gh` CLI and `git` are already available — no new shell tools needed for MVP. OpenCode can run them via bash.
- The `entrypoint.sh` git clone / auth logic is proven but deprecated — use the minimal HTTPS token pattern instead.

### Metis Review

**Identified Gaps** (addressed):

- **Fix loop cap**: Must be 2 attempts max to avoid the deprecated orchestrator's complexity explosion — enforced in `execution_steps`
- **Branch collision on retry**: Handle `git checkout -b` failure when branch exists from previous attempt
- **Concurrent task safety**: Set `concurrency_limit: 1` on the archetype for MVP
- **pnpm install lockfile mutation**: Use `--frozen-lockfile` to prevent lockfile changes in PRs
- **PR draft status**: Create PR as draft, convert to ready only after all tests pass
- **File change count**: Validate via `git diff --stat` before committing — abort if >3 files
- **No shell tools for MVP**: Use inline bash via OpenCode's bash tool — shell tools can be added when patterns stabilize
- **Working directory**: Use `/tmp/workspace` (consistent with `/tmp/` convention for contract files)
- **GITHUB_TOKEN placement**: Store as tenant secret (not `worker_env`) — `worker_env` is for non-secret config
- **Git auth pattern**: Use HTTPS token auth (`https://x-access-token:$GITHUB_TOKEN@github.com/...`) — 1 line, not 7 steps
- **Spike validation first**: Verify git auth + clone + tests work inside a bare container before building the archetype
- **Approval card PR URL**: Verify `buildApprovalBlocks` can surface PR URL before designing delivery flow

---

## Work Objectives

### Core Objective

Create a production-ready engineering employee archetype that uses the existing universal lifecycle to clone repos, write code, run tests, create draft PRs, and submit for human approval — all without modifying lifecycle code, adding shell tools, or introducing orchestration complexity.

### Concrete Deliverables

- Engineering archetype record in `prisma/seed.ts` (both DozalDevs and VLRE tenants)
- Employee documentation at `docs/employees/engineer.md`
- Updated AGENTS.md Reference Documents table
- Updated README.md active employees table
- Successful E2E: trigger → clone → code → test → PR → approve → Slack delivery

### Definition of Done

- [ ] `pnpm trigger-task` (or manual curl) creates a task that reaches `Done` state
- [ ] A GitHub PR exists on the target repo with the correct branch naming and draft→ready conversion
- [ ] The Slack approval card shows the PR link
- [ ] After approval, a Slack summary message with the PR link is posted
- [ ] The employee handles test failures by retrying (max 2) and then stopping gracefully

### Must Have

- Archetype with `identity` that overrides platform file-write restriction for `/tmp/workspace`
- `execution_steps` that clone repo, create branch, write code, run tests, create PR
- `delivery_steps` that post Slack summary with PR link after approval
- `worker_env` with `REPO_URL` and `BASE_BRANCH` (non-secret config)
- `GITHUB_TOKEN` as tenant secret for push/PR access
- `approval_required: true` — always human review
- Fix loop capped at 2 attempts in `execution_steps`
- `--frozen-lockfile` for `pnpm install`
- Draft PR until tests pass
- File change count validation (max 3 files unless instructed otherwise)
- Branch naming: `ai/engineer-{taskId-first-8-chars}`
- `concurrency_limit: 1` for MVP

### Must NOT Have (Guardrails)

- **No new shell tools** — use inline `git`/`gh` via bash tool. Shell tools can be added later when patterns stabilize.
- **No lifecycle code changes** — `src/inngest/employee-lifecycle.ts` stays untouched
- **No webhook handler implementation** — `src/gateway/routes/github.ts` stays a stub
- **No modifications to deprecated files** — `lifecycle.ts`, `orchestrate.mts`, `redispatch.ts`, `entrypoint.sh` stay untouched
- **No dependency additions** — employee must not run `pnpm add` or modify `package.json`
- **No schema/migration changes** — employee must not modify `prisma/schema.prisma`
- **No platform config changes** — employee must not modify `AGENTS.md`, `src/workers/config/agents.md`, or `opencode.json`
- **No push to `main`/`master`** — always a new branch
- **No auto-merge** — PM manually merges after reviewing the PR
- **No complex orchestration** — no wave execution, no plan parsing, no dual-model judge. OpenCode handles everything.
- **No `input_schema` validation** — freeform prompt for MVP

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES — vitest, `pnpm test -- --run`
- **Automated tests**: YES (tests-after) — unit tests for the archetype seed validation
- **Framework**: vitest (existing)

### QA Policy

Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell/CLI**: Use Bash — run commands, assert exit codes + output
- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields
- **DB**: Use Bash (psql) — query and verify row existence/values

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — spike validation + seed scaffolding):
├── Task 1: Container capability spike — git auth, clone, install, test [deep]
├── Task 2: Approval card PR URL spike — verify buildApprovalBlocks can show PR URL [quick]
└── Task 3: Engineering archetype seed — identity, execution_steps, delivery_steps [unspecified-high]

Wave 2 (After Wave 1 — complete archetype + documentation):
├── Task 4: GITHUB_TOKEN tenant secret setup [quick]
├── Task 5: Employee documentation (docs/employees/engineer.md) [writing]
└── Task 6: AGENTS.md + README.md updates [quick]

Wave 3 (After Wave 2 — E2E validation):
├── Task 7: E2E test — full lifecycle trigger to Done [deep]
└── Task 8: E2E test — failure path (intentional test failure, fix loop cap) [deep]

Wave 4 (After Wave 3 — notification):
└── Task 9: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks        | Wave  |
| ---- | ---------- | ------------- | ----- |
| 1    | —          | 3, 7, 8       | 1     |
| 2    | —          | 3             | 1     |
| 3    | 1, 2       | 4, 5, 6, 7, 8 | 1     |
| 4    | 3          | 7, 8          | 2     |
| 5    | 3          | —             | 2     |
| 6    | 3          | —             | 2     |
| 7    | 3, 4       | 9             | 3     |
| 8    | 3, 4       | 9             | 3     |
| 9    | 7, 8       | —             | 4     |
| F1   | 9          | —             | FINAL |
| F2   | 9          | —             | FINAL |
| F3   | 9          | —             | FINAL |
| F4   | 9          | —             | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `deep`, T2 → `quick`, T3 → `unspecified-high`
- **Wave 2**: **3 tasks** — T4 → `quick`, T5 → `writing`, T6 → `quick`
- **Wave 3**: **2 tasks** — T7 → `deep`, T8 → `deep`
- **Wave 4**: **1 task** — T9 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Container Capability Spike — Validate git auth, clone, install, and test run inside worker container

  **What to do**:
  - Run a bare `ai-employee-worker:latest` container with `GITHUB_TOKEN` injected
  - Verify `gh auth login --with-token` succeeds and `gh auth status` shows authenticated
  - Verify `git clone https://x-access-token:$GITHUB_TOKEN@github.com/dozal-devs/ai-employee /tmp/workspace` succeeds
  - Verify `cd /tmp/workspace && pnpm install --frozen-lockfile` completes without errors
  - Verify `pnpm build` (typecheck) passes inside the container
  - Verify `pnpm test -- --run` passes inside the container (expect ~1490 passing, 0 failures)
  - Verify `pnpm lint` passes inside the container
  - Verify `gh pr create --help` works (gh CLI available and functional)
  - Verify OpenCode can write files to `/tmp/workspace/` (create a test file, confirm it exists)
  - Time each step and record durations (clone, install, build, test) — needed for timeout planning
  - If any step fails, document the failure and propose a fix BEFORE proceeding to Task 3

  **Must NOT do**:
  - Do not modify any source code
  - Do not create any PRs on the real repo
  - Do not push any branches

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires systematic environment validation with careful failure analysis
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not creating tools, just validating environment
    - `e2e-testing`: Not testing the platform, testing the container

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `Dockerfile` — Full container build spec: Node.js 22, pnpm, git, gh CLI v2.45.0, OpenCode 1.14.31
  - `src/workers/entrypoint.sh:30-85` — Deprecated but proven git auth sequence (Steps 1-2: gh auth, git clone). Use as reference for the HTTPS token pattern.

  **API/Type References**:
  - `src/workers/config/opencode.json` — OpenCode permission model (`"*": "allow"`)

  **WHY Each Reference Matters**:
  - Dockerfile tells you exactly what's installed so you know what commands are available
  - `entrypoint.sh` shows the git clone pattern that worked before — adapt the HTTPS token approach from it
  - `opencode.json` confirms wildcard permissions so the agent can write files anywhere

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Git authentication works in container
    Tool: Bash
    Preconditions: GITHUB_TOKEN env var set, ai-employee-worker:latest image built
    Steps:
      1. docker run --rm -e GITHUB_TOKEN=$GITHUB_TOKEN ai-employee-worker:latest bash -c 'echo $GITHUB_TOKEN | gh auth login --with-token && gh auth status'
      2. Assert exit code is 0
      3. Assert output contains "Logged in to github.com"
    Expected Result: gh auth status shows authenticated user
    Failure Indicators: "authentication failed", non-zero exit code
    Evidence: .sisyphus/evidence/task-1-git-auth.txt

  Scenario: Repo clone succeeds
    Tool: Bash
    Preconditions: Git auth validated (previous scenario)
    Steps:
      1. docker run --rm -e GITHUB_TOKEN=$GITHUB_TOKEN ai-employee-worker:latest bash -c 'git clone --depth=1 https://x-access-token:$GITHUB_TOKEN@github.com/dozal-devs/ai-employee /tmp/workspace && ls /tmp/workspace/package.json && wc -l /tmp/workspace/package.json'
      2. Assert exit code is 0
      3. Assert package.json exists
    Expected Result: /tmp/workspace/package.json exists and is non-empty
    Failure Indicators: "fatal: repository not found", "Authentication failed"
    Evidence: .sisyphus/evidence/task-1-repo-clone.txt

  Scenario: Install + build + test succeed
    Tool: Bash (with 600s timeout — install and test can be slow)
    Preconditions: Repo cloned to /tmp/workspace
    Steps:
      1. docker run --rm -e GITHUB_TOKEN=$GITHUB_TOKEN ai-employee-worker:latest bash -c 'git clone --depth=1 https://x-access-token:$GITHUB_TOKEN@github.com/dozal-devs/ai-employee /tmp/workspace && cd /tmp/workspace && time pnpm install --frozen-lockfile 2>&1 && time pnpm build 2>&1 && time pnpm test -- --run 2>&1 | tail -20'
      2. Assert all three commands exit with 0
      3. Record timing for each step
    Expected Result: All pass. Test output shows ~1490 passing, 0 failures.
    Failure Indicators: Non-zero exit code, "FAIL" in test output, TypeScript errors in build
    Evidence: .sisyphus/evidence/task-1-install-build-test.txt

  Scenario: File writes to /tmp/workspace work
    Tool: Bash
    Preconditions: Container running
    Steps:
      1. docker run --rm ai-employee-worker:latest bash -c 'mkdir -p /tmp/workspace && echo "test content" > /tmp/workspace/test.txt && cat /tmp/workspace/test.txt'
      2. Assert output is "test content"
    Expected Result: File created and readable at /tmp/workspace/test.txt
    Failure Indicators: Permission denied, read-only filesystem
    Evidence: .sisyphus/evidence/task-1-file-write.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-git-auth.txt — gh auth status output
  - [ ] task-1-repo-clone.txt — clone output with timing
  - [ ] task-1-install-build-test.txt — full output with timing for each step
  - [ ] task-1-file-write.txt — file write verification

  **Commit**: NO (spike only — no code changes)

---

- [ ] 2. Approval Card PR URL Spike — Verify buildApprovalBlocks can surface a PR URL

  **What to do**:
  - Read `src/worker-tools/slack/post-message.ts` and find the `buildApprovalBlocks` function
  - Read `src/inngest/employee-lifecycle.ts` to understand how the approval card is built and posted
  - Determine how the employee's output (`/tmp/summary.txt` via `submit-output.ts`) flows into the approval card
  - Specifically check: can the `summary` or `draft` field from `submit-output.ts` appear in the Slack approval card?
  - Check the `pending_approvals` table schema — is there a field for arbitrary metadata like a PR URL?
  - Document: (a) how to include a PR URL in the approval card, (b) what the `submit-output.ts` call should look like, (c) any limitations
  - If the approval card CANNOT show a PR URL with the current code, document what changes would be needed

  **Must NOT do**:
  - Do not modify any source code
  - Do not change the approval card format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure code reading task — no implementation, just tracing data flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/worker-tools/slack/post-message.ts` — Contains `buildApprovalBlocks` function that constructs the Slack Block Kit approval card
  - `src/worker-tools/platform/submit-output.ts` — The output contract tool. Writes JSON to `/tmp/summary.txt` with `summary`, `classification`, `draft`, `draft-file`, `metadata` fields.
  - `src/inngest/employee-lifecycle.ts:763-900` — The Submitting → Reviewing transition where the approval card is posted

  **API/Type References**:
  - `prisma/schema.prisma` — `pending_approvals` table schema (check for metadata/context fields)

  **WHY Each Reference Matters**:
  - `buildApprovalBlocks` is the exact function that builds the Slack card — need to know its input contract
  - `submit-output.ts` is where the employee writes its output — need to know which fields end up in the approval card
  - The lifecycle code connects these two — shows how output flows from container to Slack

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Document approval card PR URL capability
    Tool: Bash (code reading only)
    Preconditions: Source code accessible
    Steps:
      1. Read buildApprovalBlocks function signature and body
      2. Trace data flow: submit-output.ts → /tmp/summary.txt → harness → deliverables table → lifecycle → buildApprovalBlocks
      3. Document which field(s) can carry the PR URL
      4. Write findings to evidence file
    Expected Result: Clear documentation of how PR URL flows into approval card, or what changes are needed
    Failure Indicators: Unable to trace the data flow, ambiguous conclusions
    Evidence: .sisyphus/evidence/task-2-approval-card-analysis.md

  Scenario: PR URL rendering in Slack card — negative check
    Tool: Bash (code reading)
    Preconditions: buildApprovalBlocks analysis complete
    Steps:
      1. Check if approval card truncates long content
      2. Check if URLs in the summary field are rendered as clickable links in Slack Block Kit
      3. Document any character limits or formatting constraints
    Expected Result: Clear documentation of URL rendering behavior in Slack cards
    Failure Indicators: Undocumented truncation or formatting issues
    Evidence: .sisyphus/evidence/task-2-approval-card-analysis.md (appended)
  ```

  **Evidence to Capture:**
  - [ ] task-2-approval-card-analysis.md — Full analysis of PR URL capability in approval cards

  **Commit**: NO (spike only — no code changes)

---

- [ ] 3. Engineering Archetype Seed — Create the archetype record with identity, execution_steps, delivery_steps

  **What to do**:
  - Add the engineering archetype seed to `prisma/seed.ts` for both tenants (DozalDevs and VLRE)
  - Use findings from Task 1 (container capabilities, timing) and Task 2 (approval card PR URL flow) to write accurate `execution_steps`
  - The archetype fields:

  **`role_name`**: `'engineer'`
  **`status`**: `'active'`
  **`runtime`**: `'opencode'`
  **`approval_required`**: `true`
  **`deliverable_type`**: `'pull_request'`
  **`model`**: Use the recommendation engine (`POST /admin/tenants/:id/archetypes/recommend-model`) OR default to `deepseek/deepseek-v4-flash` (confirmed reliable for tool calling per AGENTS.md)
  **`temperature`**: `0.7` (lower than default 1.0 — code writing benefits from lower temperature)
  **`tool_registry`**: `['slack/post-message', 'platform/submit-output', 'knowledge_base/search']` (no github tools — using inline bash)
  **`worker_env`**: `{ "REPO_URL": "https://github.com/dozal-devs/ai-employee", "BASE_BRANCH": "main" }`
  **`concurrency_limit`**: 1

  **`identity`** must include:
  - Clear role definition: "You are a software engineer. Your job is to write code changes for a repository."
  - **CRITICAL override**: "You are authorized to read and write files anywhere in `/tmp/workspace/`. The platform rule 'NEVER modify files outside /tools/' does NOT apply to you — your workspace IS `/tmp/workspace/`."
  - Scope constraint: "Start with small, focused changes (1-3 files). If the fix requires modifying more than 3 files, stop and report via submit-output with classification NO_ACTION_NEEDED."
  - Safety rules: "NEVER push to main/master. NEVER modify package.json, prisma/schema.prisma, AGENTS.md, or platform config files. NEVER add new dependencies."

  **`execution_steps`** must include (in order):
  1. Clone the repo: `git clone --depth=50 https://x-access-token:$GITHUB_TOKEN@github.com/{REPO_URL path} /tmp/workspace`
  2. Create branch: `cd /tmp/workspace && git checkout -b ai/engineer-${TASK_ID:0:8}` (handle branch-exists case)
  3. Install deps: `cd /tmp/workspace && pnpm install --frozen-lockfile`
  4. Read and understand the task from the prompt (`$INPUT_PROMPT`)
  5. Read relevant code files, understand the codebase
  6. Write the fix/enhancement
  7. Validate: `pnpm lint && pnpm build && pnpm test -- --run`
  8. If tests fail: fix the issue (max 2 attempts). If still failing after 2 attempts, call `submit-output --classification NO_ACTION_NEEDED --summary "Tests failed after 2 fix attempts: [error details]"`
  9. Validate file count: `git diff --stat | wc -l` — if more than 3 files changed, abort with NO_ACTION_NEEDED
  10. Commit: `git add -A && git commit -m "feat: [description from prompt]"`
  11. Push: `git push -u origin ai/engineer-${TASK_ID:0:8}`
  12. Create draft PR: `gh pr create --draft --title "[AI Engineer] [description]" --body "[summary of changes]" --base main`
  13. Convert to ready: `gh pr ready`
  14. Call `submit-output --classification NEEDS_APPROVAL --summary "PR created: [PR URL]" --draft-file /tmp/pr-details.txt`

  **`delivery_steps`** must include:
  - Read the approved deliverable content (which contains the PR URL and summary)
  - Post a Slack message to `$NOTIFICATION_CHANNEL` with the PR URL and summary using `/tools/slack/post-message`
  - Include the task ID context block per Slack message standards

  **`delivery_instructions`**: Platform-constant prompt for the delivery container. Should say: "Post the approved PR summary to Slack. Use the post-message tool with the notification channel. Include the PR URL prominently."
  - Run `pnpm build` to verify the seed compiles
  - Run `pnpm prisma db seed` after backing up the database (per AGENTS.md mandatory backup protocol)

  **Must NOT do**:
  - Do not create shell tools in `src/worker-tools/github/`
  - Do not modify `src/inngest/employee-lifecycle.ts`
  - Do not modify `src/workers/config/agents.md` (the platform base)
  - Do not modify deprecated files
  - Do not modify `src/workers/opencode-harness.mts`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful archetype design with multiple interdependent fields, plus seed.ts modification
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers all archetype schema fields, seed data patterns, the loadTenantEnv() injection pipeline, and the 4-step deployment checklist

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 and Task 2 results)
  - **Parallel Group**: Wave 1 (starts after Tasks 1 and 2 complete)
  - **Blocks**: Tasks 4, 5, 6, 7, 8
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Existing archetype seeds (guest-messaging, daily-summarizer, code-rotation, jira-motivation-bot). Follow the exact seed pattern for field names, tenant association, and upsert strategy.
  - `src/workers/entrypoint.sh:30-85` — Deprecated git clone + branch logic. Adapt the HTTPS token pattern for `execution_steps`. Note: this is reference only — do NOT copy the flag-file complexity.
  - `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — Example employee doc showing the format to follow

  **API/Type References**:
  - `src/gateway/routes/admin-archetypes.ts:60-120` — Archetype Zod schema showing all valid fields including `worker_env`, `tool_registry`, `input_schema`
  - `src/workers/opencode-harness.mts:100-200` — How the harness reads archetype fields and compiles AGENTS.md
  - `src/workers/lib/agents-md-compiler.mts` — How `identity`, `execution_steps`, `delivery_steps` are assembled into the AGENTS.md. The `identity` field is injected FIRST (highest LLM priority).

  **External References**:
  - `gh pr create` CLI docs: https://cli.github.com/manual/gh_pr_create

  **WHY Each Reference Matters**:
  - `seed.ts` existing archetypes show the exact data shape and upsert pattern — follow these precisely
  - `entrypoint.sh` git clone pattern is proven but needs simplification — extract only the HTTPS token approach
  - `agents-md-compiler.mts` shows that `identity` is prepended first, meaning its file-write override takes priority over the platform base rule
  - The archetype Zod schema in `admin-archetypes.ts` defines what fields are valid and their types

  **Acceptance Criteria**:
  - [ ] `pnpm build` passes with the new seed code
  - [ ] `pnpm prisma db seed` succeeds (after DB backup)
  - [ ] DB query: `SELECT role_name, status, approval_required, worker_env FROM archetypes WHERE role_name = 'engineer';` returns the expected record

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Archetype exists in DB with correct fields
    Tool: Bash (psql)
    Preconditions: pnpm prisma db seed completed successfully
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT role_name, status, approval_required, runtime, deliverable_type, model, temperature, worker_env::text FROM archetypes WHERE role_name = 'engineer';"
      2. Assert role_name = 'engineer'
      3. Assert status = 'active'
      4. Assert approval_required = true
      5. Assert runtime = 'opencode'
      6. Assert worker_env contains REPO_URL and BASE_BRANCH
    Expected Result: One row with all fields matching specification
    Failure Indicators: Zero rows, null fields, wrong values
    Evidence: .sisyphus/evidence/task-3-archetype-db.txt

  Scenario: Archetype has non-empty execution_steps and delivery_steps
    Tool: Bash (psql)
    Preconditions: Archetype seeded
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT length(identity), length(execution_steps), length(delivery_steps), length(delivery_instructions) FROM archetypes WHERE role_name = 'engineer';"
      2. Assert all lengths > 100 (non-trivial content)
    Expected Result: All fields have substantive content (not empty or placeholder)
    Failure Indicators: Any length is 0 or very short
    Evidence: .sisyphus/evidence/task-3-archetype-content.txt

  Scenario: Build still passes after seed changes
    Tool: Bash
    Preconditions: seed.ts modified
    Steps:
      1. pnpm build 2>&1 | tail -5
      2. Assert exit code is 0
    Expected Result: TypeScript compilation succeeds
    Failure Indicators: Type errors, import failures
    Evidence: .sisyphus/evidence/task-3-build.txt

  Scenario: Trigger dry-run validates archetype
    Tool: Bash (curl)
    Preconditions: Archetype seeded, gateway running
    Steps:
      1. source .env && curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/engineer/trigger?dry_run=true" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"prompt":"Test prompt"}'
      2. Assert HTTP 200 (dry run success, not 404 or 400)
    Expected Result: Dry run succeeds, confirming archetype is found and valid
    Failure Indicators: 404 (archetype not found), 400 (validation error)
    Evidence: .sisyphus/evidence/task-3-dry-run.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-archetype-db.txt — DB query showing archetype fields
  - [ ] task-3-archetype-content.txt — Field length verification
  - [ ] task-3-build.txt — Build output
  - [ ] task-3-dry-run.txt — Trigger dry-run response

  **Commit**: YES
  - Message: `feat(archetype): add general-purpose engineering employee`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

---

- [ ] 4. GITHUB_TOKEN Tenant Secret Setup — Store the GitHub token as a tenant secret

  **What to do**:
  - Verify `GITHUB_TOKEN` is available in `.env`
  - Store `GITHUB_TOKEN` as a tenant secret for the DozalDevs tenant (tenant ID: `00000000-0000-0000-0000-000000000002`) using the admin API or direct DB insert
  - The secret key should be `github_token` (lowercase) — `loadTenantEnv()` uppercases it to `GITHUB_TOKEN`
  - Verify via DB query that the encrypted secret exists in `tenant_secrets`
  - Verify via a test container run that `GITHUB_TOKEN` is available in the container environment
  - If GITHUB_TOKEN is already stored for this tenant, skip and document that it's already present

  **Must NOT do**:
  - Do not hardcode the token value in any source file
  - Do not add the token to `worker_env` (it's a secret, not config)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple DB operation — store a secret value
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/gateway/services/tenant-secret-manager.ts` — How tenant secrets are stored and retrieved (encryption via AES-256-GCM)
  - `src/inngest/lib/tenant-env-loader.ts` — `loadTenantEnv()` — how secrets are loaded and injected as uppercased env vars

  **API/Type References**:
  - `src/gateway/routes/admin-tenants.ts` — Admin API for managing tenant secrets: `POST /admin/tenants/:tenantId/secrets`

  **WHY Each Reference Matters**:
  - `tenant-secret-manager.ts` shows the encryption pattern — secrets are encrypted at rest
  - `tenant-env-loader.ts` confirms the uppercasing behavior — `github_token` becomes `GITHUB_TOKEN`
  - The admin API route is the preferred way to store secrets (vs direct DB manipulation)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: GITHUB_TOKEN exists as tenant secret
    Tool: Bash (curl + psql)
    Preconditions: Gateway running, admin API key set
    Steps:
      1. PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT key FROM tenant_secrets WHERE tenant_id = '00000000-0000-0000-0000-000000000002' AND key = 'github_token';"
      2. Assert one row returned (secret exists, even if value is encrypted)
    Expected Result: One row with key='github_token'
    Failure Indicators: Zero rows (secret not stored)
    Evidence: .sisyphus/evidence/task-4-tenant-secret.txt

  Scenario: Token secret not stored — add it
    Tool: Bash (curl)
    Preconditions: Secret does not exist yet
    Steps:
      1. source .env
      2. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/secrets" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d "{\"key\":\"github_token\",\"value\":\"$GITHUB_TOKEN\"}"
      3. Assert HTTP 200/201
    Expected Result: Secret stored successfully
    Failure Indicators: 400 (validation), 409 (already exists), 500 (encryption error)
    Evidence: .sisyphus/evidence/task-4-store-secret.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-tenant-secret.txt — DB query confirming secret exists
  - [ ] task-4-store-secret.txt — API response if secret was stored

  **Commit**: NO (no code changes — only DB state)

---

- [ ] 5. Employee Documentation — Create docs/employees/engineer.md

  **What to do**:
  - Create `docs/employees/engineer.md` following the format of existing employee docs (e.g., `docs/employees/2026-05-21-1721-jira-motivation-bot.md`)
  - Use the timestamp prefix convention: run `date "+%Y-%m-%d-%H%M"` first
  - Document:
    - What the engineer employee does
    - Archetype ID (from seed)
    - Tenant associations
    - Trigger command (manual API curl)
    - Worker env configuration (REPO_URL, BASE_BRANCH)
    - Required tenant secrets (GITHUB_TOKEN)
    - How it works (clone → code → test → PR → approve → deliver)
    - Guardrails (max 3 files, no dependency changes, no schema changes, max 2 fix attempts)
    - Concurrency limit (1)
    - Known gotchas (pnpm install time, branch collision on retry, test timeout)
    - How to test it (trigger command with example prompt)

  **Must NOT do**:
  - Do not use employee-specific language in shared files (this doc is employee-specific, which is correct)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — Example employee doc format to follow exactly
  - `docs/employees/guest-messaging.md` — Another example with archetype IDs, trigger commands, gotchas
  - `docs/employees/code-rotation.md` — Simpler example showing minimal required sections

  **WHY Each Reference Matters**:
  - These existing docs define the format and sections expected in an employee doc

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Employee doc exists with required sections
    Tool: Bash (grep)
    Preconditions: File created
    Steps:
      1. Check file exists at docs/employees/ with engineer in the name
      2. grep -c "Archetype ID" docs/employees/*engineer*.md — assert >= 1
      3. grep -c "Trigger" docs/employees/*engineer*.md — assert >= 1
      4. grep -c "GITHUB_TOKEN" docs/employees/*engineer*.md — assert >= 1
      5. grep -c "worker_env" docs/employees/*engineer*.md — assert >= 1
    Expected Result: All required sections present
    Failure Indicators: Missing sections, wrong format
    Evidence: .sisyphus/evidence/task-5-doc-check.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-doc-check.txt — Section verification

  **Commit**: YES
  - Message: `docs(employees): add engineer employee documentation`
  - Files: `docs/employees/YYYY-MM-DD-HHMM-engineer.md`
  - Pre-commit: none

---

- [ ] 6. AGENTS.md + README.md Updates — Add engineering employee to reference tables

  **What to do**:
  - Update `AGENTS.md` Reference Documents table: add a row for `docs/employees/engineer.md` with "When to Read" = "Working on engineering employee — archetype IDs, trigger command, worker_env config, guardrails"
  - Update `README.md` active employees table: add a row for "Engineer" with trigger "Manual (admin API)" and deliverable "GitHub PR with code changes, submitted for PM approval"
  - Update `README.md` "Engineering (deprecated/on hold)" note to clarify the distinction: the OLD engineering employee (orchestrate.mts) is deprecated, the NEW engineering employee (archetype-based) is active
  - Verify no employee-specific language is introduced in shared code files

  **Must NOT do**:
  - Do not modify `src/workers/config/agents.md` (the platform base AGENTS.md)
  - Do not add engineering-specific content to the root AGENTS.md beyond the Reference Documents table entry

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple documentation updates — adding table rows
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `AGENTS.md` — Reference Documents table at the bottom (follow exact format)
  - `README.md` — Active employees table and engineering deprecation note

  **WHY Each Reference Matters**:
  - Both files have established table formats that must be followed exactly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md has engineer reference
    Tool: Bash (grep)
    Steps:
      1. grep "engineer" AGENTS.md | grep -i "reference\|document\|employee"
      2. Assert at least one matching line exists
    Expected Result: Engineer employee appears in Reference Documents table
    Failure Indicators: No match
    Evidence: .sisyphus/evidence/task-6-agents-md.txt

  Scenario: README.md has engineer in active employees
    Tool: Bash (grep)
    Steps:
      1. grep -A2 "Engineer" README.md | grep -i "manual\|admin\|API\|PR\|pull.request"
      2. Assert match exists
    Expected Result: Engineer listed as active employee with manual trigger
    Failure Indicators: No match, or still listed only as deprecated
    Evidence: .sisyphus/evidence/task-6-readme.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-agents-md.txt — AGENTS.md verification
  - [ ] task-6-readme.txt — README.md verification

  **Commit**: YES
  - Message: `docs: update AGENTS.md and README.md for engineering employee`
  - Files: `AGENTS.md`, `README.md`
  - Pre-commit: none

---

- [ ] 7. E2E Test — Full Lifecycle: Trigger → Clone → Code → Test → PR → Approve → Deliver → Done

  **What to do**:
  - Ensure services are running: gateway, Inngest, Docker
  - Build Docker image: `docker build -t ai-employee-worker:latest .`
  - Trigger the engineer employee with a simple prompt that creates a verifiable code change:
    ```bash
    source .env
    TENANT=00000000-0000-0000-0000-000000000002
    curl -s -X POST "http://localhost:7700/admin/tenants/$TENANT/employees/engineer/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
      -d '{"prompt":"In the file README.md, add a one-line comment at the very end of the file: <!-- Engineer employee E2E test marker -->"}'
    ```
  - Record the task_id from the response
  - Monitor task status via DB polling until it reaches `Submitting` or `Reviewing`
  - Verify a draft PR was created on GitHub: `gh pr list --repo dozal-devs/ai-employee --state open --json number,title,headRefName,url,isDraft`
  - Verify the Slack approval card was posted (check `pending_approvals` table)
  - Approve the task via Inngest event (manual approval fallback):
    ```bash
    curl -X POST "http://localhost:8288/e/local" \
      -H "Content-Type: application/json" \
      -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U123","userName":"Victor"}}'
    ```
  - Wait for task to reach `Done`
  - Verify delivery Slack message was posted with PR link
  - Clean up: close the test PR (`gh pr close <number> --repo dozal-devs/ai-employee --delete-branch`)

  **Must NOT do**:
  - Do not merge the test PR
  - Do not leave test branches on the remote

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex E2E validation requiring patient monitoring, multiple verification steps, and cleanup
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`]
    - `e2e-testing`: Covers prerequisites checklist, trigger methods, state verification
    - `debugging-lifecycle`: Covers lifecycle states, stuck-state diagnostics, task_status_log queries

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 8)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — Full E2E test guide for employee lifecycle
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Slack UX scenarios, especially Scenario A (approve happy path)

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts` — Lifecycle states and transitions to monitor
  - `src/gateway/routes/admin-employee-trigger.ts` — Trigger endpoint contract

  **WHY Each Reference Matters**:
  - E2E test guides contain exact verification steps and expected state transitions
  - Lifecycle code shows what states to monitor and what events to send

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` state
  - [ ] PR exists on GitHub with correct branch naming (`ai/engineer-<8chars>`)
  - [ ] Slack approval card was posted
  - [ ] Delivery Slack message contains PR URL
  - [ ] Test PR cleaned up (closed, branch deleted)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full happy path — trigger to Done
    Tool: Bash (curl, psql, gh)
    Preconditions: Gateway running, Inngest running, Docker image built, GITHUB_TOKEN as tenant secret
    Steps:
      1. Trigger engineer employee with test prompt
      2. Record task_id from response
      3. Poll task status every 30s: PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee -c "SELECT status FROM tasks WHERE id = '$TASK_ID';"
      4. Wait for status = 'Reviewing' (timeout: 10 minutes)
      5. Verify PR: gh pr list --repo dozal-devs/ai-employee --state open --json number,title,headRefName,url --jq '.[] | select(.headRefName | startswith("ai/engineer-"))'
      6. Assert PR exists with correct title containing "[AI Engineer]"
      7. Approve: curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U123","userName":"Victor"}}'
      8. Wait for status = 'Done' (timeout: 3 minutes)
      9. Verify lifecycle trace: PGPASSWORD=postgres psql ... -c "SELECT from_status, to_status FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
      10. Assert trace includes: Ready → Executing → Submitting → Reviewing → Approved → Delivering → Done
    Expected Result: Task completes full lifecycle. PR exists. Approval works. Done state reached.
    Failure Indicators: Task stuck in Executing (>10min), no PR created, approval event not received, task stuck in Delivering
    Evidence: .sisyphus/evidence/task-7-e2e-happy-path.txt

  Scenario: Clean up test artifacts
    Tool: Bash (gh)
    Preconditions: Happy path completed
    Steps:
      1. gh pr close <number> --repo dozal-devs/ai-employee --delete-branch
      2. Verify branch deleted: git ls-remote --heads origin ai/engineer-<8chars> — should return empty
    Expected Result: PR closed, branch deleted
    Failure Indicators: Branch still exists on remote
    Evidence: .sisyphus/evidence/task-7-cleanup.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-e2e-happy-path.txt — Full lifecycle trace, PR URL, approval confirmation
  - [ ] task-7-cleanup.txt — PR close and branch deletion confirmation

  **Commit**: NO (E2E test only — no code changes)

---

- [ ] 8. E2E Test — Failure Path: Test failure handling and fix loop cap

  **What to do**:
  - Trigger the engineer employee with a prompt designed to cause test failures:
    ```bash
    source .env
    TENANT=00000000-0000-0000-0000-000000000002
    curl -s -X POST "http://localhost:7700/admin/tenants/$TENANT/employees/engineer/trigger" \
      -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
      -d '{"prompt":"In src/lib/logger.ts, add a function called brokenFunction that returns a string but has a TypeScript type error (returns a number instead). This should cause pnpm build to fail."}'
    ```
  - Monitor the task — the employee should:
    1. Write the broken code
    2. Run tests → fail (typecheck)
    3. Attempt to fix (max 2 attempts as defined in execution_steps)
    4. Either fix it and create a PR, or give up and call `submit-output --classification NO_ACTION_NEEDED`
  - Verify the fix loop cap: if the employee keeps trying beyond 2 attempts, the guardrail has failed
  - Verify the task reaches a terminal state (`Done` with NO_ACTION_NEEDED or `Done` with a PR)
  - Clean up any test branches/PRs

  **Must NOT do**:
  - Do not leave broken code in the repo

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires patience to monitor failure handling, timing analysis, and cleanup
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`]
    - `e2e-testing`: Lifecycle verification
    - `debugging-lifecycle`: Stuck-state diagnostics if the employee gets stuck

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - Task 3's `execution_steps` — The fix loop cap is defined here. Verify it's enforced.
  - `src/workers/lib/fix-loop.ts` — Deprecated but shows the per-stage limit (3) + global limit (10) pattern

  **WHY Each Reference Matters**:
  - The fix loop cap in `execution_steps` is a soft constraint (LLM instruction) — need to verify the LLM actually follows it

  **Acceptance Criteria**:
  - [ ] Employee attempts fix ≤ 2 times
  - [ ] Task reaches a terminal state (not stuck)
  - [ ] If NO_ACTION_NEEDED: no PR is created, summary explains the failure
  - [ ] If employee fixes it: PR is created, tests pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fix loop cap enforced
    Tool: Bash (curl, psql, docker logs)
    Preconditions: Engineer archetype seeded, gateway running, Docker image built
    Steps:
      1. Trigger with intentionally broken prompt
      2. Record task_id
      3. Monitor container logs: docker logs -f employee-${TASK_ID:0:8} 2>&1 | tee /tmp/failure-test.log
      4. Count occurrences of test/build runs in logs (grep for "pnpm test" or "pnpm build")
      5. Wait for task to reach terminal state (timeout: 15 minutes)
      6. Check task status and output
    Expected Result: Employee stops after ≤ 2 fix attempts. Terminal state reached. Summary explains outcome.
    Failure Indicators: More than 3 test runs (fix loop exceeded), task stuck in Executing, no terminal state
    Evidence: .sisyphus/evidence/task-8-fix-loop.txt

  Scenario: Clean up failure test artifacts
    Tool: Bash (gh)
    Preconditions: Failure path test completed
    Steps:
      1. Check for any PRs from this test: gh pr list --repo dozal-devs/ai-employee --state open --json number,headRefName --jq '.[] | select(.headRefName | startswith("ai/engineer-"))'
      2. Close and delete any test PRs/branches
    Expected Result: No orphaned PRs or branches
    Failure Indicators: Orphaned branches on remote
    Evidence: .sisyphus/evidence/task-8-cleanup.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-fix-loop.txt — Container logs showing fix attempts and termination
  - [ ] task-8-cleanup.txt — Cleanup confirmation

  **Commit**: NO (E2E test only — no code changes)

---

- [ ] 9. Notify Completion — Send Telegram notification

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "Engineering employee plan complete — all tasks done. General-purpose code-writing archetype is live. Come back to review results."`

  **Must NOT do**:
  - Nothing else

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, after all other tasks)
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 8

  **References**:
  - `scripts/telegram-notify.ts` — Telegram notification script

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. tsx scripts/telegram-notify.ts "Engineering employee plan complete — all tasks done."
      2. Assert exit code is 0
    Expected Result: Notification sent successfully
    Failure Indicators: Non-zero exit code, network error
    Evidence: .sisyphus/evidence/task-9-telegram.txt
  ```

  **Evidence to Capture:**
  - [ ] task-9-telegram.txt — Notification send confirmation

  **Commit**: NO (no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read archetype seed, check DB row, verify PR was created). For each "Must NOT Have": search codebase for forbidden patterns (no shell tools in `src/worker-tools/github/`, no lifecycle changes, no deprecated file modifications). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check seed data for: correct field types, valid JSON in `worker_env`, non-empty `identity`/`execution_steps`/`delivery_steps`. Verify no employee-specific language in shared files.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test the full lifecycle: manual trigger → task creation → execution → PR creation → Slack approval card → approve → delivery → Done. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: no shell tools created, no lifecycle changes, no deprecated file modifications. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                  | Files                        | Pre-commit Check |
| ---- | --------------------------------------------------------------- | ---------------------------- | ---------------- |
| 3    | `feat(archetype): add general-purpose engineering employee`     | `prisma/seed.ts`             | `pnpm build`     |
| 5    | `docs(employees): add engineer employee documentation`          | `docs/employees/engineer.md` | —                |
| 6    | `docs: update AGENTS.md and README.md for engineering employee` | `AGENTS.md`, `README.md`     | —                |

---

## Success Criteria

### Verification Commands

```bash
# Archetype exists in DB
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT role_name, status, approval_required FROM archetypes WHERE role_name = 'engineer';"
# Expected: role_name=engineer, status=active, approval_required=true

# Trigger works
source .env
TENANT=00000000-0000-0000-0000-000000000002
curl -s -X POST "http://localhost:7700/admin/tenants/$TENANT/employees/engineer/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"Add a comment to the README explaining what the engineer employee does"}' | jq .
# Expected: 202 with task_id

# Task reaches Done after approval
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status FROM tasks WHERE id = '<task_id>';"
# Expected: Done

# PR exists
gh pr list --repo dozal-devs/ai-employee --state open --json number,title,url
# Expected: PR with branch ai/engineer-<8chars>
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Employee documentation exists at `docs/employees/engineer.md`
- [ ] AGENTS.md Reference Documents table updated
- [ ] README.md active employees table updated
