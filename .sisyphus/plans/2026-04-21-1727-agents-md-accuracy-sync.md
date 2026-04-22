# AGENTS.md Accuracy Sync — Fix Errors & Add Missing Info

## TL;DR

> **Quick Summary**: Fix 2 factual errors and add 4 missing items to `AGENTS.md` discovered by line-by-line comparison against the verified ground-truth document `docs/2026-04-20-1314-current-system-state.md`.
>
> **Deliverables**: Updated `AGENTS.md` with all 6 corrections applied
>
> - 2 factual error fixes (admin route count, Docker rebuild scope)
> - 4 information additions (ENCRYPTION_KEY, shell tool output details, tests/ directory, project structure subdirectories)
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single file, single task
> **Critical Path**: Task 1 (all edits) → done

---

## Context

### Original Request

User asked to verify AGENTS.md accuracy by comparing it against the verified ground-truth document `docs/2026-04-20-1314-current-system-state.md`.

### Interview Summary

**Key Discussions**:

- Line-by-line comparison identified 2 factual errors, 4 should-add items, and 5 nice-to-have items
- User chose "Fix errors + add should-haves" scope (not nice-to-haves)

**Research Findings**:

- Admin route count verified from ground truth table: 18 routes (5 project + 6 tenant + 3 secrets + 2 config + 1 trigger + 1 task status). AGENTS.md says 16.
- Test file count verified via filesystem: exactly 102 test files
- `src/lib/` verified: exactly 12 files (matches both docs)
- `src/gateway/routes/` verified: exactly 10 files (matches ground truth)

### Metis Review

**Identified Gaps** (addressed):

- ENCRYPTION_KEY placement: resolved → goes in "Minimum for local E2E" block after ADMIN_API_KEY since gateway won't start without it
- Shell tool edits: must augment existing lines, not replace them
- Project structure expansion: must not add `workers/` subdirs (not in scope)
- Two-occurrence rule: "16" appears at line 217 AND line 382 — both must be fixed
- `gateway/inngest/` subdir is distinct from top-level `inngest/` — plan must be explicit

---

## Work Objectives

### Core Objective

Make AGENTS.md factually accurate against the verified ground-truth document.

### Concrete Deliverables

- Updated `AGENTS.md` with 6 surgical edits

### Definition of Done

- [ ] `grep "16 total routes\|16 admin" AGENTS.md` → zero matches
- [ ] `grep -c "18 total routes\|18 admin" AGENTS.md` → exactly 2
- [ ] `grep "ENCRYPTION_KEY" AGENTS.md` → exactly 1 match in env vars section
- [ ] `grep "auto-generates blocks" AGENTS.md` → 1 match
- [ ] `grep "filters out bot summary" AGENTS.md` → 1 match
- [ ] `grep "tests/" AGENTS.md` in project structure block → at least 1 match
- [ ] `grep "src/worker-tools/" AGENTS.md | grep -i "rebuild"` → 1 match
- [ ] `wc -l AGENTS.md` → result > 382 (net additions only, no content removed)

### Must Have

- Both occurrences of "16" route count fixed to "18"
- `src/worker-tools/` added to rebuild warning
- `ENCRYPTION_KEY` documented in env vars
- Shell tool output format details added
- `tests/` directory in project structure tree
- Gateway and inngest subdirectories added to project structure tree

### Must NOT Have (Guardrails)

- Do NOT modify `docs/2026-04-20-1314-current-system-state.md`
- Do NOT modify `README.md`
- Do NOT modify `.env.example`
- Do NOT remove or reorder any existing content in AGENTS.md
- Do NOT rewrite the admin route prose description beyond changing the number
- Do NOT add `workers/` subdirectory entries (lib/, config/, entrypoint.sh) — not in scope
- Do NOT touch the "Pre-existing Test Failures" section
- Do NOT restructure the env vars section layout or rename blocks

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None needed — this is a documentation-only change
- **Framework**: N/A

### QA Policy

All verification via grep/wc assertions after edits. Evidence captured to `.sisyphus/evidence/`.

---

## Execution Strategy

### Single Task — No Parallelism Needed

This is 6 surgical text edits to one file. One agent, one pass, top-to-bottom.

```
Wave 1 (only wave):
└── Task 1: Apply all 6 edits to AGENTS.md [quick]

Wave FINAL:
└── Not needed — QA scenarios in Task 1 are sufficient for a doc-only change
```

### Agent Dispatch Summary

- **1**: **1** — T1 → `quick`

---

## TODOs

- [x] 1. Apply 6 accuracy fixes to AGENTS.md

  **What to do**:

  Work top-to-bottom through `AGENTS.md`. Apply these 6 edits in order:

  **Edit A — Shell tool output details (lines 61-63)**:
  Augment (do NOT replace) the existing shell tool bullet points. After each CLI usage line, add the output description.

  Change the shell tools section from:

  ```
  - **Shell tools**: `src/worker-tools/slack/` — pre-installed in Docker image at `/tools/slack/`. Usage:
    - `NODE_NO_WARNINGS=1 node /tools/slack/post-message.js --channel "C123" --text "msg" --task-id "uuid" > /tmp/approval-message.json`
    - `node /tools/slack/read-channels.js --channels "C123,C456" --lookback-hours 24`
  ```

  To:

  ```
  - **Shell tools**: `src/worker-tools/slack/` — pre-installed in Docker image at `/tools/slack/`. Usage:
    - `NODE_NO_WARNINGS=1 node /tools/slack/post-message.js --channel "C123" --text "msg" --task-id "uuid" > /tmp/approval-message.json`
      Output: JSON `{"ts":"...","channel":"..."}`. When `--task-id` is provided, auto-generates blocks: header, summary text, divider, task ID context block, Approve/Reject buttons.
    - `node /tools/slack/read-channels.js --channels "C123,C456" --lookback-hours 24`
      Output: JSON `{"channels":[...]}`. Reads channel history with thread replies; filters out bot summary posts.
  ```

  **Edit B — Admin route count, first occurrence (line 217)**:
  Change:

  ```
  The admin API has 16 total routes covering
  ```

  To:

  ```
  The admin API has 18 total routes covering
  ```

  **Edit C — Docker rebuild scope (line 261)**:
  Change:

  ```
  Any modification to files under `src/workers/` requires rebuilding the Docker image
  ```

  To:

  ```
  Any modification to files under `src/workers/` or `src/worker-tools/` requires rebuilding the Docker image
  ```

  **Edit D — Add ENCRYPTION_KEY to env vars (after line 302)**:
  In the "Minimum for local E2E" code block, add `ENCRYPTION_KEY` immediately after the `ADMIN_API_KEY` line:

  ```
  OPENROUTER_API_KEY   # AI code generation (OpenCode via OpenRouter)
  GITHUB_TOKEN         # git push + gh pr create (must have push access to all registered repos)
  JIRA_WEBHOOK_SECRET  # HMAC-SHA256 validation (use "test-secret" locally)
  ADMIN_API_KEY        # Admin API key for all /admin/* endpoints (auto-generated by pnpm setup)
  ENCRYPTION_KEY       # AES-256-GCM key for tenant secrets (validated at gateway startup)
  ```

  **Edit E — Add tests/ and expand project structure (lines 271-282)**:
  Replace the project structure tree with this expanded version (sourced from ground truth lines 512-538):

  ```
  src/
  ├── gateway/      # Express HTTP server — webhook receiver + Inngest function host
  │   ├── routes/       # All HTTP route handlers (10 files)
  │   ├── slack/        # Bolt event/action handlers + OAuth installation store
  │   ├── middleware/   # Admin auth middleware
  │   ├── validation/   # Zod schemas + HMAC signature verification
  │   ├── services/     # Business logic (10 files): dispatcher, task creation, project registry, tenant/secret repos
  │   └── inngest/      # Inngest client factory, event sender, serve registration
  ├── inngest/      # Durable workflow functions: lifecycle, watchdog, redispatch
  │   ├── triggers/     # Cron trigger functions (daily-summarizer, feedback-summarizer)
  │   └── lib/          # Shared: create-task-and-dispatch, poll-completion
  ├── workers/      # Docker container code — runs inside the worker machine
  ├── worker-tools/ # Shell scripts compiled into Docker image (Slack tools, etc.)
  └── lib/          # Shared (12 files): fly-client, github-client, slack-client, jira-client, call-llm (model enforcement + $50/day cost circuit breaker), encryption (AES-256-GCM for tenant secrets), logger, retry, errors, tunnel-client, repo-url, agent-version
  prisma/           # Schema (19 models), 18 migrations, seed
  scripts/          # TypeScript scripts run via tsx (setup, trigger, verify)
  docker/           # Supabase self-hosted Docker Compose
  docs/             # Architecture vision, phase docs, troubleshooting
  tests/            # 102 test files (Vitest)
  ```

  **Edit F — Admin route count, second occurrence (line 382)**:
  In the Reference Documents table, change:

  ```
  all gateway routes (16 admin + webhooks + OAuth)
  ```

  To:

  ```
  all gateway routes (18 admin + webhooks + OAuth)
  ```

  **Must NOT do**:
  - Do NOT modify any file other than `AGENTS.md`
  - Do NOT remove or reorder existing content
  - Do NOT add workers/ subdirectories (lib/, config/) — not in scope
  - Do NOT touch the "Pre-existing Test Failures" section
  - Do NOT restructure the env vars section layout

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file documentation edit with exact text replacements specified
  - **Skills**: `[]`
    - No specialized skills needed — straightforward text edits

  **Parallelization**:
  - **Can Run In Parallel**: NO (single task)
  - **Parallel Group**: N/A
  - **Blocks**: Nothing
  - **Blocked By**: None

  **References**:

  **Source of Truth**:
  - `docs/2026-04-20-1314-current-system-state.md` — the verified ground-truth document. All edits are sourced from this file.

  **Target File**:
  - `AGENTS.md` — the file to edit. Currently 382 lines.

  **Specific Ground Truth References**:
  - Lines 192-196: Shell tool output format details (for Edit A)
  - Lines 296-315: Admin routes table showing 18 routes (for Edits B and F)
  - Line 277: Gateway startup validates ENCRYPTION_KEY (for Edit D)
  - Line 469: Rebuild scope includes `src/worker-tools/` (for Edit C)
  - Lines 512-538: Full project structure tree with subdirectories (for Edit E)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Route count fix — both occurrences updated
    Tool: Bash
    Preconditions: All 6 edits applied to AGENTS.md
    Steps:
      1. Run: grep "16 total routes\|16 admin" AGENTS.md
      2. Assert: zero output (no remaining "16" references)
      3. Run: grep -c "18 total routes\|18 admin" AGENTS.md
      4. Assert: output is "2" (both occurrences updated)
    Expected Result: Zero matches for "16", exactly 2 matches for "18"
    Failure Indicators: Any match for "16" or fewer than 2 matches for "18"
    Evidence: .sisyphus/evidence/task-1-route-count.txt

  Scenario: Docker rebuild scope includes worker-tools
    Tool: Bash
    Preconditions: Edit C applied
    Steps:
      1. Run: grep "src/worker-tools/" AGENTS.md | grep -i "rebuild"
      2. Assert: exactly 1 match
    Expected Result: Rebuild warning mentions both src/workers/ and src/worker-tools/
    Failure Indicators: Zero matches
    Evidence: .sisyphus/evidence/task-1-rebuild-scope.txt

  Scenario: ENCRYPTION_KEY documented
    Tool: Bash
    Preconditions: Edit D applied
    Steps:
      1. Run: grep "ENCRYPTION_KEY" AGENTS.md
      2. Assert: exactly 1 match, located in the "Minimum for local E2E" code block
    Expected Result: ENCRYPTION_KEY appears once in the env vars section
    Failure Indicators: Zero matches or match outside env vars section
    Evidence: .sisyphus/evidence/task-1-encryption-key.txt

  Scenario: Shell tool output details present
    Tool: Bash
    Preconditions: Edit A applied
    Steps:
      1. Run: grep "auto-generates blocks" AGENTS.md
      2. Assert: 1 match (post-message.js output)
      3. Run: grep "filters out bot summary" AGENTS.md
      4. Assert: 1 match (read-channels.js output)
    Expected Result: Both tool output descriptions present
    Failure Indicators: Either grep returns zero matches
    Evidence: .sisyphus/evidence/task-1-shell-tool-details.txt

  Scenario: Project structure includes tests/ and subdirectories
    Tool: Bash
    Preconditions: Edit E applied
    Steps:
      1. Run: grep "tests/" AGENTS.md
      2. Assert: at least 1 match in project structure block
      3. Run: grep "routes/\|services/\|middleware/\|validation/" AGENTS.md
      4. Assert: matches present in the project structure block
    Expected Result: tests/ directory and gateway subdirectories appear in tree
    Failure Indicators: Missing entries
    Evidence: .sisyphus/evidence/task-1-project-structure.txt

  Scenario: No content removed — net additions only
    Tool: Bash
    Preconditions: All edits applied
    Steps:
      1. Run: wc -l AGENTS.md
      2. Assert: line count > 382 (original was 382 lines)
    Expected Result: File grew (all changes were additions or in-place fixes)
    Failure Indicators: Line count ≤ 382
    Evidence: .sisyphus/evidence/task-1-line-count.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): fix route count, rebuild scope, and add missing details`
  - Files: `AGENTS.md`
  - Pre-commit: N/A

---

## Commit Strategy

- **1**: `docs(agents): fix route count, rebuild scope, and add missing details` — `AGENTS.md`

---

## Success Criteria

### Verification Commands

```bash
grep "16 total routes\|16 admin" AGENTS.md        # Expected: no output
grep -c "18 total routes\|18 admin" AGENTS.md      # Expected: 2
grep "ENCRYPTION_KEY" AGENTS.md                     # Expected: 1 match
grep "auto-generates blocks" AGENTS.md              # Expected: 1 match
grep "filters out bot summary" AGENTS.md            # Expected: 1 match
grep "tests/" AGENTS.md                             # Expected: match in structure tree
grep "src/worker-tools/" AGENTS.md | grep rebuild   # Expected: 1 match
wc -l AGENTS.md                                     # Expected: > 382
```

### Final Checklist

- [ ] Both "16" → "18" occurrences fixed
- [ ] Rebuild scope includes `src/worker-tools/`
- [ ] `ENCRYPTION_KEY` documented in env vars
- [ ] Shell tool output details added (augmented, not replaced)
- [ ] `tests/` directory added to project structure
- [ ] Gateway and inngest subdirectories added to project structure
- [ ] No content removed from AGENTS.md
- [ ] No other files modified
