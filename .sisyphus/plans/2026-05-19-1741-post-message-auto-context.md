# Auto-Context for post-message.ts — Threading & Run ID from Environment

## TL;DR

> **Quick Summary**: Make `post-message.ts` automatically read `NOTIFY_MSG_TS` and `INNGEST_RUN_ID` from environment variables so every employee-posted Slack message is threaded and tagged with the Run ID — without relying on the LLM to pass flags.
>
> **Deliverables**:
>
> - `post-message.ts` auto-threads under task notification and auto-includes Run ID in context block
> - `employee-lifecycle.ts` injects `INNGEST_RUN_ID` into worker container env vars
> - `SKILL.md` documents auto-threading behavior and `--no-thread` opt-out flag
> - Unit tests covering all precedence rules and edge cases
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: T1/T2/T3 (parallel) → T4 (tests) → T5 (E2E) → T6 (notify)

---

## Context

### Original Request

User triggered the `real-estate-motivation-bot` employee and observed:

1. The motivational quote posted as a new top-level Slack message instead of threading under the task notification
2. The context block at the bottom only shows `Task \`{id}\`` — no Inngest Run ID

This is a follow-up to the `threading-newlines-observability` plan. The lifecycle notifications are correct (both Task ID and Run ID show). The issue is with the employee's own delivered message posted via the `post-message.ts` shell tool.

### Interview Summary

**Key Discussions**:

- **Threading root cause**: `NOTIFY_MSG_TS` IS available in the worker env. `post-message.ts` DOES support `--thread-ts`. SKILL.md DOES document it. But the LLM simply didn't pass the flag.
- **Run ID root cause**: Three missing links — (1) `INNGEST_RUN_ID` never injected into worker env, (2) `post-message.ts` has no `--run-id` flag, (3) context block hardcodes only Task ID.
- **User chose automatic env-var approach**: Eliminates the "LLM forgot" failure mode entirely.

**Research Findings**:

- `post-message.ts` has TWO context blocks: line 82 (`buildApprovalBlocks` approval path) and line 149 (no-approval path) — both must be updated
- `PLATFORM_ENV_MANIFEST` `extra` array (lines 526, 558) must include `INNGEST_RUN_ID` so the harness advertises it to the LLM
- `buildApprovalBlocks` is exported and imported in 3 test files — signature change must use optional param
- `NOTIFY_MSG_TS` can be empty string `''` when notify-received fails — must treat as unset

### Metis Review

**Identified Gaps** (addressed):

- Two context blocks in `post-message.ts`, not one — both updated
- `PLATFORM_ENV_MANIFEST` `extra` array — `INNGEST_RUN_ID` added
- Empty string handling for `NOTIFY_MSG_TS` — treated as unset with `|| undefined`
- `buildApprovalBlocks` callers checked — 3 test files import it, optional param is safe
- Precedence rules documented: `--no-thread` > explicit `--thread-ts` > env var > no threading

---

## Work Objectives

### Core Objective

Make `post-message.ts` automatically thread messages and include Run ID by reading from environment variables, eliminating dependency on LLM flag passing.

### Concrete Deliverables

- Modified `src/inngest/employee-lifecycle.ts` — injects `INNGEST_RUN_ID` into worker env
- Modified `src/worker-tools/slack/post-message.ts` — auto-reads env vars, adds `--no-thread` flag
- Modified `src/workers/skills/tool-usage-reference/SKILL.md` — documents new behavior
- New test file `tests/worker-tools/slack/post-message-auto-env.test.ts`

### Definition of Done

- [ ] Triggering any employee produces a message threaded under the task notification automatically
- [ ] Every employee-posted message shows `Run \`{id}\`` in the context block automatically
- [ ] `pnpm test -- --run` passes with zero new failures
- [ ] `tsc --noEmit` passes

### Must Have

- `post-message.ts` auto-reads `NOTIFY_MSG_TS` from env → uses as default `threadTs`
- `post-message.ts` auto-reads `INNGEST_RUN_ID` from env → includes in context block alongside Task ID
- Both context blocks updated (line 82 approval path AND line 149 no-approval path)
- `buildApprovalBlocks` accepts optional `runId?: string` param
- `--no-thread` flag added to opt out of auto-threading
- Precedence: `--no-thread` > explicit `--thread-ts` > `NOTIFY_MSG_TS` env var > no threading
- Empty string `''` for `NOTIFY_MSG_TS` treated as unset (no Slack API error)
- Empty/unset `INNGEST_RUN_ID` → context block shows only Task ID (graceful degradation)
- `INNGEST_RUN_ID: runId` injected into both `localWorkerEnv` and `flyWorkerEnv` in lifecycle
- `INNGEST_RUN_ID` added to `PLATFORM_ENV_MANIFEST` `extra` array in both env blocks
- Unit tests for all precedence rules and edge cases
- Docker rebuild + E2E validation

### Must NOT Have (Guardrails)

- Do NOT add `--run-id` as an explicit CLI flag — env-var-only per design decision
- Do NOT apply auto-env pattern to any other shell tool besides `post-message.ts`
- Do NOT modify `opencode-harness.mts`
- Do NOT touch `employee-lifecycle.ts` beyond the two env objects and two `extra` arrays
- Do NOT change `--channel` to optional
- Do NOT refactor `parseArgs` to use a proper arg parser — keep existing pattern
- Do NOT fix `block_id: 'papi-chulo-daily-summary'` — separate issue, not in scope
- Do NOT modify `approval-card-poster.mts` — separate `buildApprovalBlocks` function, different concern

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES — tests after implementation
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shell tools**: Bash — grep for code patterns, run unit tests
- **Lifecycle**: Bash — grep for env var injection patterns
- **E2E**: Bash — trigger task via admin API, check DB + Slack threading

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Inject INNGEST_RUN_ID into worker env vars [quick]
├── Task 2: Auto-read env vars in post-message.ts [unspecified-high]
├── Task 3: Update SKILL.md with auto-threading docs [quick]

Wave 2 (After Wave 1 — verification):
├── Task 4: Unit tests for all auto-env behavior [unspecified-high]
├── Task 5: Docker rebuild + E2E validation [unspecified-high]
├── Task 6: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 4, 5   | 1    |
| 2    | —          | 4, 5   | 1    |
| 3    | —          | 5      | 1    |
| 4    | 1, 2       | 5      | 2    |
| 5    | 1-4        | F1-F4  | 2    |
| 6    | F1-F4      | —      | 2    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `unspecified-high`, T3 `quick`
- **Wave 2**: 3 tasks — T4 `unspecified-high`, T5 `unspecified-high`, T6 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Inject `INNGEST_RUN_ID` into worker env vars

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, add `INNGEST_RUN_ID: runId,` to the `localWorkerEnv` object (after line 518, alongside `NOTIFY_MSG_TS`)
  - Add the same `INNGEST_RUN_ID: runId,` to the `flyWorkerEnv` object (after line 550, alongside `NOTIFY_MSG_TS`)
  - Add `'INNGEST_RUN_ID'` to the `extra` filter array at line 526: `const extra = ['NOTIFY_MSG_TS', 'REPLY_BROADCAST', 'INNGEST_RUN_ID'].filter((k) => localWorkerEnv[k]);`
  - Add the same to the `extra` filter array at line 558: `const extra = ['NOTIFY_MSG_TS', 'REPLY_BROADCAST', 'INNGEST_RUN_ID'].filter((k) => flyWorkerEnv[k]);`
  - `runId` is already available in scope (destructured at line 132 from a previous plan's work)

  **Must NOT do**:
  - Do NOT touch any other part of `employee-lifecycle.ts`
  - Do NOT modify the handler signature or metadata storage (already done in previous plan)
  - Do NOT add any other env vars

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:
  - `src/inngest/employee-lifecycle.ts:506-531` — `localWorkerEnv` object. Add `INNGEST_RUN_ID: runId` after line 518 (`NOTIFY_MSG_TS`). Update `extra` array at line 526
  - `src/inngest/employee-lifecycle.ts:541-563` — `flyWorkerEnv` object. Add `INNGEST_RUN_ID: runId` after line 550 (`NOTIFY_MSG_TS`). Update `extra` array at line 558
  - `src/inngest/employee-lifecycle.ts:132` — Where `runId` is destructured from handler context (already done)

  **Acceptance Criteria**:
  - [ ] `INNGEST_RUN_ID: runId` present in both `localWorkerEnv` and `flyWorkerEnv`
  - [ ] `'INNGEST_RUN_ID'` present in both `extra` arrays
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: INNGEST_RUN_ID injected into both env objects
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "INNGEST_RUN_ID" src/inngest/employee-lifecycle.ts
      2. Assert: at least 4 matches — 2 in env objects + 2 in extra arrays
      3. Run: grep -c "INNGEST_RUN_ID" src/inngest/employee-lifecycle.ts
      4. Assert: count >= 4
    Expected Result: INNGEST_RUN_ID appears in both local and Fly env blocks plus both extra arrays
    Evidence: .sisyphus/evidence/task-1-env-injection.txt

  Scenario: No unrelated lifecycle changes
    Tool: Bash
    Steps:
      1. Run: git diff --stat src/inngest/employee-lifecycle.ts
      2. Assert: only 4-6 lines changed (2 env entries + 2 extra array updates)
    Expected Result: Minimal, targeted changes only
    Evidence: .sisyphus/evidence/task-1-diff-check.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): inject INNGEST_RUN_ID into worker env vars`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 2. Auto-read env vars in post-message.ts (threading + Run ID)

  **What to do**:

  **Part A — Auto-threading from env var:**
  - In `parseArgs()`, after all flag parsing (line 57, before the `return`), add auto-threading logic:
    ```typescript
    // Auto-thread from env var if no explicit --thread-ts and not opted out
    if (threadTs === undefined && !noThread) {
      const envTs = process.env.NOTIFY_MSG_TS;
      if (envTs) threadTs = envTs;
    }
    ```
  - Add `--no-thread` flag parsing in the for loop (around line 43): `else if (args[i] === '--no-thread') { noThread = true; }`
  - Add `let noThread = false;` to variable declarations (after line 25)
  - Update the `--help` text to include: `'  --no-thread                 Do not auto-thread under task notification (overrides NOTIFY_MSG_TS env)\n'`
  - **Precedence rule**: `--no-thread` > explicit `--thread-ts <value>` > `NOTIFY_MSG_TS` env var > no threading
  - **Empty string handling**: `process.env.NOTIFY_MSG_TS` returns `''` when lifecycle set `notifyMsgRef?.ts ?? ''` and ts was null. The truthy check `if (envTs)` handles this — empty string is falsy.

  **Part B — Auto-Run ID in context blocks:**
  - Read `const runId = process.env.INNGEST_RUN_ID || undefined;` at the top of `main()` (around line 107)
  - Modify `buildApprovalBlocks` signature to accept optional `runId?: string` (line 63-68):
    ```typescript
    export function buildApprovalBlocks(
      text: string,
      taskId: string,
      date: string,
      title?: string,
      runId?: string,
    ): unknown[] {
    ```
  - Update the context block in `buildApprovalBlocks` (line 80-83):
    ```typescript
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Task \`${taskId}\`` },
        ...(runId ? [{ type: 'mrkdwn', text: `Run \`${runId}\`` }] : []),
      ],
    },
    ```
  - Update the no-approval context block (line 149):
    ```typescript
    { type: 'context', elements: [
      { type: 'mrkdwn', text: `Task \`${taskId}\`` },
      ...(runId ? [{ type: 'mrkdwn', text: `Run \`${runId}\`` }] : []),
    ] },
    ```
  - Pass `runId` to `buildApprovalBlocks` at line 151: `buildApprovalBlocks(text, taskId, date, title, runId)`

  **Must NOT do**:
  - Do NOT add `--run-id` as an explicit CLI flag — env-var-only
  - Do NOT refactor `parseArgs` to use a proper arg parser
  - Do NOT change `--channel` to optional
  - Do NOT fix `block_id: 'papi-chulo-daily-summary'` — separate issue
  - Do NOT modify `approval-card-poster.mts`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Shell tool file structure and CLI conventions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:
  - `src/worker-tools/slack/post-message.ts:9-61` — `parseArgs()` function. Add `noThread` variable, `--no-thread` flag parsing, and auto-threading logic before the return
  - `src/worker-tools/slack/post-message.ts:63-104` — `buildApprovalBlocks()`. Add optional `runId` param, update context block at lines 80-83
  - `src/worker-tools/slack/post-message.ts:142-152` — Block selection logic. Line 149 is the no-approval context block — add Run ID. Line 151 calls `buildApprovalBlocks` — pass `runId`
  - `src/worker-tools/slack/post-message.ts:106-115` — `main()`. Read `runId` from env here
  - `tests/worker-tools/slack/post-message.test.ts:33-86` — Existing `buildApprovalBlocks` tests — will not break because `runId` is optional
  - `tests/worker-tools/slack/post-message-approval-gating.test.ts:32-61` — Another test importing `buildApprovalBlocks` — also safe with optional param

  **Acceptance Criteria**:
  - [ ] `--no-thread` flag parsed in `parseArgs`
  - [ ] Auto-threading logic reads `NOTIFY_MSG_TS` from env when no explicit `--thread-ts`
  - [ ] Empty string `''` for `NOTIFY_MSG_TS` treated as unset (falsy check)
  - [ ] `buildApprovalBlocks` accepts optional `runId?: string`
  - [ ] Context block in `buildApprovalBlocks` (line 82) includes Run ID when provided
  - [ ] Context block in no-approval path (line 149) includes Run ID when provided
  - [ ] `runId` read from `process.env.INNGEST_RUN_ID` in `main()`
  - [ ] `runId` passed to `buildApprovalBlocks` at line 151 and to no-approval block
  - [ ] `--help` text includes `--no-thread` description
  - [ ] `tsc --noEmit` passes
  - [ ] Existing tests in `post-message.test.ts` and `post-message-approval-gating.test.ts` still pass

  **QA Scenarios**:

  ```
  Scenario: Auto-threading logic exists
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "NOTIFY_MSG_TS" src/worker-tools/slack/post-message.ts
      2. Assert: at least 1 match showing env var read
      3. Run: grep -n "no-thread" src/worker-tools/slack/post-message.ts
      4. Assert: at least 2 matches (flag parsing + help text)
    Expected Result: Auto-threading and --no-thread flag are implemented
    Evidence: .sisyphus/evidence/task-2-auto-thread.txt

  Scenario: Run ID in both context blocks
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "INNGEST_RUN_ID" src/worker-tools/slack/post-message.ts
      2. Assert: at least 1 match (env var read in main)
      3. Run: grep -c "runId" src/worker-tools/slack/post-message.ts
      4. Assert: count >= 6 (param, env read, buildApprovalBlocks context, no-approval context, call site, type)
    Expected Result: Run ID flows through both code paths
    Evidence: .sisyphus/evidence/task-2-run-id.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/slack/post-message.test.ts tests/worker-tools/slack/post-message-approval-gating.test.ts 2>&1 | tail -10
      2. Assert: all pass, exit code 0
    Expected Result: No backward-compat breakage
    Evidence: .sisyphus/evidence/task-2-existing-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(slack): auto-thread and auto-run-id from env vars in post-message.ts`
  - Files: `src/worker-tools/slack/post-message.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 3. Update SKILL.md with auto-threading and auto-Run-ID docs

  **What to do**:
  - In `src/workers/skills/tool-usage-reference/SKILL.md`, find the `post-message.ts` section
  - Add `--no-thread` to the optional flags list with description: "Suppress auto-threading. By default, messages auto-thread under the task notification via `NOTIFY_MSG_TS` env var. Use `--no-thread` to post as a new top-level message instead."
  - Update the section that describes `--thread-ts` to note: "If omitted, `post-message.ts` automatically reads `NOTIFY_MSG_TS` from the environment and threads under the task notification. Pass `--thread-ts <ts>` to override with a specific timestamp, or `--no-thread` to post top-level."
  - Add a note about auto-Run-ID: "`post-message.ts` automatically reads `INNGEST_RUN_ID` from the environment and includes it in the context block. No flag needed."
  - Update the basic usage example to remove explicit `--thread-ts "$NOTIFY_MSG_TS"` since it's now automatic — but keep it in the "advanced" or "override" section

  **Must NOT do**:
  - Do NOT modify any other tool section in SKILL.md
  - Do NOT add employee-specific language

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Shell tool documentation conventions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - `src/workers/skills/tool-usage-reference/SKILL.md:48-103` — `post-message.ts` section. Update optional flags list and usage example
  - `src/workers/skills/tool-usage-reference/SKILL.md:68-72` — Optional flags list. Add `--no-thread`, update `--thread-ts` description
  - `src/workers/skills/tool-usage-reference/SKILL.md:96-101` — Usage example. Threading is now automatic — simplify example

  **Acceptance Criteria**:
  - [ ] `--no-thread` documented in optional flags
  - [ ] Auto-threading behavior described
  - [ ] Auto-Run-ID behavior described
  - [ ] No employee-specific language

  **QA Scenarios**:

  ```
  Scenario: SKILL.md documents auto-behavior
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "no-thread" src/workers/skills/tool-usage-reference/SKILL.md
      2. Assert: at least 1 match in post-message.ts section
      3. Run: grep -n "INNGEST_RUN_ID" src/workers/skills/tool-usage-reference/SKILL.md
      4. Assert: at least 1 match documenting auto-Run-ID behavior
      5. Run: grep -n "auto" src/workers/skills/tool-usage-reference/SKILL.md | head -5
      6. Assert: auto-threading behavior described
    Expected Result: Both auto-behaviors and --no-thread documented
    Evidence: .sisyphus/evidence/task-3-skill-md.txt
  ```

  **Commit**: YES
  - Message: `docs(skills): document auto-threading and auto-run-id behavior in tool-usage-reference`
  - Files: `src/workers/skills/tool-usage-reference/SKILL.md`
  - Pre-commit: —

- [x] 4. Unit tests for all auto-env behavior

  **What to do**:
  - Create `tests/worker-tools/slack/post-message-auto-env.test.ts`
  - Follow the pattern in `tests/worker-tools/slack/post-message-thread-ts.test.ts` for test structure (module mocking, `process.argv` mutation, env var setup)
  - Write these test cases:

  **Auto-threading tests:**
  1. `NOTIFY_MSG_TS='111.000'` in env, no `--thread-ts` flag → `postMessage` called with `thread_ts: '111.000'`
  2. `NOTIFY_MSG_TS='111.000'` in env, `--thread-ts '222.000'` flag → `postMessage` called with `thread_ts: '222.000'` (explicit flag wins)
  3. `NOTIFY_MSG_TS=''` (empty string) in env → `postMessage` called WITHOUT `thread_ts` (no error)
  4. `NOTIFY_MSG_TS` unset → `postMessage` called WITHOUT `thread_ts` (no error)
  5. `--no-thread` flag with `NOTIFY_MSG_TS='111.000'` → `postMessage` called WITHOUT `thread_ts`

  **Auto-Run-ID tests:** 6. `INNGEST_RUN_ID='01KS10KM3J6JNYSX1HRFRE7HMY'` in env, `--task-id 'task-uuid'` → context block contains both `` Task `task-uuid` `` and `` Run `01KS10KM3J6JNYSX1HRFRE7HMY` `` 7. `INNGEST_RUN_ID` unset, `--task-id 'task-uuid'` → context block contains only `` Task `task-uuid` `` (no crash, no empty Run ID)

  **Cleanup:** Use `beforeEach`/`afterEach` to set and clean `process.env.NOTIFY_MSG_TS` and `process.env.INNGEST_RUN_ID` to avoid cross-test contamination

  **Must NOT do**:
  - Do NOT modify production code
  - Do NOT skip any of the 7 test cases

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `tests/worker-tools/slack/post-message-thread-ts.test.ts` — Follow this test pattern for module mocking and `process.argv` mutation
  - `tests/worker-tools/slack/post-message-approval-gating.test.ts` — Additional pattern reference
  - `src/worker-tools/slack/post-message.ts` — Module under test

  **Acceptance Criteria**:
  - [ ] 7 test cases covering all auto-env scenarios
  - [ ] `pnpm test -- --run tests/worker-tools/slack/post-message-auto-env.test.ts` passes
  - [ ] `pnpm test -- --run` (full suite) passes with zero new failures

  **QA Scenarios**:

  ```
  Scenario: All auto-env tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/worker-tools/slack/post-message-auto-env.test.ts 2>&1 | tail -15
      2. Assert: 7 tests pass, exit code 0
    Expected Result: All 7 test cases pass
    Evidence: .sisyphus/evidence/task-4-test-results.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for post-message.ts auto-env behavior`
  - Files: `tests/worker-tools/slack/post-message-auto-env.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 5. Docker rebuild + E2E validation

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Reseed DB if needed: `pnpm prisma db seed`
  - Trigger any employee via admin API (e.g. `daily-motivation-quote` or `real-estate-motivation-bot`)
  - Verify:
    1. The delivered message is threaded under the task notification (not a new top-level message)
    2. The context block at the bottom shows both `Task \`{id}\``and`Run \`{id}\``
    3. `tasks.metadata` contains `inngest_run_id`
  - Cross-reference: the Run ID in the delivered message's context should match the lifecycle notification's Run ID

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after T4)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1-4

  **References**:
  - Admin API: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/<slug>/trigger`
  - Slack channel: `C0960S2Q8RL` (#victor-tests)
  - DB: `postgresql://postgres:postgres@localhost:54322/ai_employee`
  - Previous E2E task: `634d4683-4865-40fe-b2cf-23fb5b142449` — reference for expected behavior

  **Acceptance Criteria**:
  - [ ] Docker build succeeds
  - [ ] Task reaches `Done` state
  - [ ] Delivered message is threaded under task notification
  - [ ] Delivered message context block shows both Task ID and Run ID
  - [ ] `tasks.metadata->>'inngest_run_id'` is non-null

  **QA Scenarios**:

  ```
  Scenario: Full E2E — both fixes verified
    Tool: Bash (curl + psql)
    Steps:
      1. Build Docker image: docker build -t ai-employee-worker:latest .
      2. Trigger employee via admin API
      3. Poll until Done: query task status every 15s
      4. Query: SELECT metadata->>'inngest_run_id' FROM tasks WHERE id = '<task_id>';
      5. Assert: inngest_run_id is non-null
      6. Verify Slack: delivered message should appear as a thread reply (check via Slack API conversations.replies)
    Expected Result: Both threading and Run ID issues resolved
    Evidence: .sisyphus/evidence/task-5-e2e-results.txt
  ```

  **Commit**: NO (E2E only)

- [x] 6. Notify completion via Telegram

  **What to do**:
  - Send: `npx tsx scripts/telegram-notify.ts "✅ post-message-auto-context complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Acceptance Criteria**:
  - [ ] Telegram notification sent

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Trigger an employee via admin API. Verify: (1) delivered message is threaded under task notification (not top-level), (2) context block shows both Task ID and Run ID, (3) `tasks.metadata` contains `inngest_run_id`. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Regression [CLEAN/N issues] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                     | Files                   | Pre-commit           |
| ------ | --------------------------------------------------------------------------- | ----------------------- | -------------------- |
| 1      | `feat(lifecycle): inject INNGEST_RUN_ID into worker env vars`               | `employee-lifecycle.ts` | `tsc --noEmit`       |
| 2      | `feat(slack): auto-thread and auto-run-id from env vars in post-message.ts` | `post-message.ts`       | `tsc --noEmit`       |
| 3      | `docs(skills): document auto-threading behavior in tool-usage-reference`    | `SKILL.md`              | —                    |
| 4      | `test: add tests for post-message.ts auto-env behavior`                     | `tests/`                | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # Expected: all pass, zero new failures
tsc --noEmit                # Expected: zero errors
```

### Final Checklist

- [ ] `post-message.ts` auto-reads `NOTIFY_MSG_TS` from env for threading
- [ ] `post-message.ts` auto-reads `INNGEST_RUN_ID` from env for context block
- [ ] `--no-thread` flag opts out of auto-threading
- [ ] Both context blocks (approval and no-approval paths) include Run ID
- [ ] `INNGEST_RUN_ID` injected into worker env in lifecycle
- [ ] `INNGEST_RUN_ID` in `PLATFORM_ENV_MANIFEST` extra array
- [ ] All tests pass
- [ ] Docker image rebuilt
