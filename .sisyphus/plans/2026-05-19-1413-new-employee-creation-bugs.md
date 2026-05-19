# Fix New Employee Creation Bugs — Identity, Threading, Approval Buttons, Schema

## TL;DR

> **Quick Summary**: Fix 4 interconnected bugs in the worker dispatch pipeline: LLM identity confusion from platform AGENTS.md leaking other employees' info, missing Slack message threading, stale approval buttons appearing when approval is disabled, and an overly strict output classification schema.
>
> **Deliverables**:
>
> - Platform AGENTS.md stripped of employee-specific content + `EMPLOYEE_ROLE_NAME` env var injected into workers
> - `post-message.ts` gains `--thread-ts` support + `NOTIFY_MSG_TS` injected into both execution and delivery containers
> - `APPROVAL_REQUIRED` env var injected into workers + `post-message.ts` and harness gated + lifecycle cleanup of stale cards
> - `StandardOutput` schema expanded to accept `APPROVED` classification
> - Unit tests for all changes
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (schema+env) → Task 4/5 (tool+harness) → Task 8 (lifecycle cleanup) → Task 10 (E2E) → Final Verification

---

## Context

### Original Request

User created a new AI employee ("daily-motivation-quote") via the dashboard, triggered it, and observed 3 confusing behaviors:

1. The bot introduced itself as "code-rotation" instead of its actual role
2. The motivational quote posted as a separate top-level Slack message instead of threading under the task notification
3. "Approve & Post" / "Reject" buttons appeared despite `approval_required: false`

### Interview Summary

**Key Discussions**:

- **Identity fix**: Both strip employee table from platform AGENTS.md AND inject `EMPLOYEE_ROLE_NAME` env var
- **Threading fix**: Full overhaul — add `--thread-ts` to `post-message.ts`, pass `NOTIFY_MSG_TS` to both execution and delivery containers
- **Approval fix**: Both prevent (env var gating) AND cleanup (lifecycle removes stale cards)
- **Schema fix**: Expand `StandardOutput` to accept `APPROVED` as a third valid classification
- **Tests**: YES, tests after implementation (Vitest)

**Research Findings**:

- `agents-md-resolver.mts` concatenates platform → tenant → archetype → rules → knowledge AGENTS.md layers
- `post-message.ts` line 135 always generates approval buttons when `--task-id` is passed
- `opencode-harness.mts` `tryAutoPostApprovalCard()` checks `classification === 'NEEDS_APPROVAL'` only, ignores archetype config
- Lifecycle correctly gates at line 728 but worker already posted buttons by then
- Delivery container env does NOT include `NOTIFY_MSG_TS`
- `post-guest-approval.ts` already supports `--thread-ts` — only `post-message.ts` is missing it
- Two `NOTIFY_MSG_TS` tests are skipped (`it.skip`) in `tests/inngest/lifecycle-notify-msg-ts.test.ts`

### Metis Review

**Identified Gaps** (addressed):

- `post-guest-approval.ts` already has `--thread-ts` — only `post-message.ts` needs the fix (scope narrowed)
- Two skipped tests in `lifecycle-notify-msg-ts.test.ts` must be fixed as part of this work
- `agents-md-resolver.mts` `platformRuntimeSections` parameter has zero test coverage — needs new tests
- `tryAutoPostApprovalCard` in harness needs unit tests covering the new `APPROVAL_REQUIRED` gate
- Risk: stripping AGENTS.md content could break existing employees if they rely on platform-level employee references (mitigation: check each employee's `agents_md` for self-contained instructions)

---

## Work Objectives

### Core Objective

Ensure newly created AI employees correctly identify themselves, thread their Slack messages under the task notification, respect the `approval_required` setting, and can use a valid `APPROVED` classification.

### Concrete Deliverables

- Modified `AGENTS.md` — stripped of employee-specific table (Current Implementation section)
- Modified `src/inngest/employee-lifecycle.ts` — injects `EMPLOYEE_ROLE_NAME`, `APPROVAL_REQUIRED`, `NOTIFY_MSG_TS` into worker containers; cleans up stale approval cards on Done
- Modified `src/workers/opencode-harness.mts` — gates `tryAutoPostApprovalCard()` on `APPROVAL_REQUIRED`
- Modified `src/worker-tools/slack/post-message.ts` — adds `--thread-ts` parameter; gates approval blocks on `APPROVAL_REQUIRED`
- Modified `src/workers/lib/output-schema.mts` — adds `APPROVED` to classification enum
- Modified `prisma/seed.ts` — updates archetype `agents_md` templates with valid classification guidance
- New/fixed tests in `tests/`

### Definition of Done

- [ ] Triggering `daily-motivation-quote` produces a correctly-identified, threaded, button-free Slack message
- [ ] `pnpm test -- --run` passes with zero new failures
- [ ] `tsc --noEmit` passes with zero new errors
- [ ] Docker image rebuilt and tested

### Must Have

- `EMPLOYEE_ROLE_NAME` env var injected into every worker container
- `APPROVAL_REQUIRED` env var injected into every worker container
- `NOTIFY_MSG_TS` env var injected into delivery container (already in execution container)
- `post-message.ts` supports `--thread-ts` and respects `APPROVAL_REQUIRED`
- `tryAutoPostApprovalCard()` respects `APPROVAL_REQUIRED`
- Lifecycle cleans up stale approval cards when `approvalRequired === false`
- Platform AGENTS.md does not contain employee-specific content
- `StandardOutput` accepts `APPROVED` classification
- Unit tests for all behavioral changes

### Must NOT Have (Guardrails)

- Do NOT remove `post-guest-approval.ts` `--thread-ts` support — it already works correctly
- Do NOT modify `post-guest-approval.ts` at all — it's not broken
- Do NOT change the lifecycle's `approvalRequired` gating logic at line 728 — it's correct
- Do NOT add employee-specific language to shared files (`employee-lifecycle.ts`, `opencode-harness.mts`, etc.)
- Do NOT break existing employees (guest-messaging, code-rotation, summarizer) — only additive changes
- Do NOT add `--approval-required` as a CLI flag to `post-message.ts` — use env var `APPROVAL_REQUIRED` instead (simpler, prevents agent misuse)
- Do NOT remove the entire "Current Implementation" section from AGENTS.md — only strip employee-specific rows from the table; keep the section header and any universal platform info

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

- **Shell tools**: Use Bash — call tool directly, assert output/exit code
- **Lifecycle**: Use Bash — trigger task via admin API, check DB state, check Slack messages
- **Schema**: Use Bash (bun/node REPL) — import module, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundational changes, all independent):
├── Task 1: Expand StandardOutput schema + fix classification in seed [quick]
├── Task 2: Strip platform AGENTS.md of employee-specific content [quick]
├── Task 3: Add --thread-ts to post-message.ts [quick]

Wave 2 (After Wave 1 — lifecycle + harness changes, depends on schema):
├── Task 4: Inject EMPLOYEE_ROLE_NAME + APPROVAL_REQUIRED + NOTIFY_MSG_TS into lifecycle [deep]
├── Task 5: Gate harness tryAutoPostApprovalCard() on APPROVAL_REQUIRED [unspecified-high]
├── Task 6: Gate post-message.ts approval blocks on APPROVAL_REQUIRED env var [quick]
├── Task 7: Update seed archetype agents_md with threading + classification guidance [quick]

Wave 3 (After Wave 2 — integration, cleanup, tests):
├── Task 8: Lifecycle cleanup — remove stale approval cards when marking Done [deep]
├── Task 9: Unit tests for all changes [unspecified-high]
├── Task 10: E2E validation — trigger daily-motivation-quote and verify all 4 fixes [unspecified-high]
├── Task 11: Rebuild Docker image [quick]
├── Task 12: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| 1    | —          | 4, 5, 7, 9 | 1    |
| 2    | —          | 7, 9       | 1    |
| 3    | —          | 4, 6, 7, 9 | 1    |
| 4    | 1, 3       | 8, 9, 10   | 2    |
| 5    | 1          | 9, 10      | 2    |
| 6    | 3          | 9, 10      | 2    |
| 7    | 1, 2, 3    | 9, 10      | 2    |
| 8    | 4          | 9, 10      | 3    |
| 9    | 1-8        | 10         | 3    |
| 10   | 4-9, 11    | F1-F4      | 3    |
| 11   | 2, 4       | 10         | 3    |
| 12   | F1-F4      | —          | 3    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 4 tasks — T4 `deep`, T5 `unspecified-high`, T6 `quick`, T7 `quick`
- **Wave 3**: 5 tasks — T8 `deep`, T9 `unspecified-high`, T10 `unspecified-high`, T11 `quick`, T12 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Expand StandardOutput schema + fix classification in seed

  **What to do**:
  - In `src/workers/lib/output-schema.mts`, add `'APPROVED'` to the `classification` enum in both the `StandardOutput` interface (line 6) and the `standardOutputSchema` Zod schema (line 15)
  - Update `isApprovalRequired()` (line 34) to explicitly return `true` only for `NEEDS_APPROVAL` — `APPROVED` and `NO_ACTION_NEEDED` should return `false`
  - In `prisma/seed.ts`, find the `daily-motivation-quote` archetype's `agents_md` (created by user via dashboard, ID `27f590a5-5bb0-4dcc-91f1-7ca867626660`) — its `CLASSIFICATION RULES` section currently instructs writing `"APPROVED"`. Verify this is now a valid value. If the archetype was created via dashboard (not seed), update the DB record directly via PostgREST or psql to use the valid `APPROVED` classification value in its guidance
  - In `prisma/seed.ts`, review all existing archetype `agents_md` strings (search for `classification`) — ensure they reference valid values (`NEEDS_APPROVAL`, `NO_ACTION_NEEDED`, `APPROVED`)

  **Must NOT do**:
  - Do NOT change `isApprovalRequired()` to return `true` for `APPROVED` — `APPROVED` means the employee completed the work without needing human review
  - Do NOT modify any other file in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 7, 9
  - **Blocked By**: None

  **References**:
  - `src/workers/lib/output-schema.mts:1-36` — Full file, 36 lines. `StandardOutput` interface at line 3, Zod schema at line 13, `isApprovalRequired` at line 34. Add `APPROVED` to both the interface union type and the Zod enum
  - `prisma/seed.ts:3344-3388` — Code-rotation archetype seed. Has `agents_md: CODE_ROTATION_AGENTS_MD` at line 3361. Check its classification guidance
  - `prisma/seed.ts` — Search for `GUEST_MESSAGING_AGENTS_MD`, `DAILY_SUMMARIZER_AGENTS_MD`, `CODE_ROTATION_AGENTS_MD` to find all archetype agents_md strings with classification rules

  **Acceptance Criteria**:
  - [ ] `StandardOutput.classification` accepts 3 values: `'APPROVED' | 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED'`
  - [ ] `isApprovalRequired({ classification: 'APPROVED' } as any)` returns `false`
  - [ ] `isApprovalRequired({ classification: 'NEEDS_APPROVAL' } as any)` returns `true`
  - [ ] `isApprovalRequired({ classification: 'NO_ACTION_NEEDED' } as any)` returns `false`
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: APPROVED classification is accepted by Zod schema
    Tool: Bash
    Steps:
      1. Run: node -e "const { standardOutputSchema } = require('./src/workers/lib/output-schema.mts'); console.log(JSON.stringify(standardOutputSchema.safeParse({ summary: 'test', classification: 'APPROVED' })))"
      2. Assert: result.success === true
    Expected Result: Zod parsing succeeds for APPROVED classification
    Evidence: .sisyphus/evidence/task-1-approved-schema.txt

  Scenario: Invalid classification is still rejected
    Tool: Bash
    Steps:
      1. Run: node -e "const { standardOutputSchema } = require('./src/workers/lib/output-schema.mts'); console.log(JSON.stringify(standardOutputSchema.safeParse({ summary: 'test', classification: 'INVALID' })))"
      2. Assert: result.success === false
    Expected Result: Zod parsing fails for invalid classification values
    Evidence: .sisyphus/evidence/task-1-invalid-schema.txt
  ```

  **Commit**: YES
  - Message: `fix(schema): expand StandardOutput to accept APPROVED classification`
  - Files: `src/workers/lib/output-schema.mts`
  - Pre-commit: `tsc --noEmit`

- [x] 2. Strip platform AGENTS.md of employee-specific content

  **What to do**:
  - In the root `AGENTS.md` file, find the `## Current Implementation` section (around line 39-47) which contains a table listing all active employees (Summarizer, Guest-Messaging, Code-Rotation, Engineering)
  - Remove the employee-specific table rows. Keep the section header and replace with a note: "Employee-specific details are in each archetype's `agents_md` field and in `docs/employees/`. Do not list employees here — this file is injected into every worker container."
  - Also check the `## Adding a New Employee` section — this should stay since it's procedural guidance, not employee-specific identity
  - Also check the `## OpenCode Worker` section — remove any references that could cause identity confusion (e.g., specific employee names in examples). Keep the technical details about the harness, tools, and lifecycle
  - Verify no other section contains employee names that could confuse a new employee's LLM

  **Must NOT do**:
  - Do NOT remove the `## Adding a New Employee` section — it's procedural guidance
  - Do NOT remove tool documentation (`## OpenCode Worker`, shell tool docs) — those are needed by all employees
  - Do NOT remove the `## Skills System` table — it references skills, not employees
  - Do NOT change anything in `src/workers/lib/agents-md-resolver.mts` — the resolver is correct, only the content is wrong

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 7, 9
  - **Blocked By**: None

  **References**:
  - `AGENTS.md:39-47` — The `## Current Implementation` section with the employee table. This is the primary content to modify
  - `AGENTS.md:52-60` — The `## Adding a New Employee` section — keep this intact
  - `AGENTS.md:63-120` — The `## OpenCode Worker` section — keep technical details, remove employee-specific examples if any
  - `src/workers/lib/agents-md-resolver.mts:1-38` — Shows how AGENTS.md is assembled. Line 19: `sections.push('# Platform Policy\n\n${platformContent}')` — the root AGENTS.md becomes "Platform Policy"

  **Acceptance Criteria**:
  - [ ] `grep -c "code-rotation\|guest-messaging\|daily-summarizer\|Papi Chulo" AGENTS.md` returns only references in procedural/documentation sections, not identity-defining content
  - [ ] The `## Current Implementation` section no longer has a table listing specific employees with their triggers
  - [ ] The `## Adding a New Employee` section is preserved
  - [ ] All tool documentation is preserved

  **QA Scenarios**:

  ```
  Scenario: AGENTS.md no longer contains employee identity table
    Tool: Bash
    Steps:
      1. Run: grep -n "| Summarizer" AGENTS.md
      2. Assert: no matches (exit code 1)
      3. Run: grep -n "| Guest-Messaging" AGENTS.md
      4. Assert: no matches (exit code 1)
      5. Run: grep -n "| Code-Rotation" AGENTS.md
      6. Assert: no matches (exit code 1)
    Expected Result: No employee identity rows in the table
    Evidence: .sisyphus/evidence/task-2-agents-md-stripped.txt

  Scenario: Adding a New Employee section still exists
    Tool: Bash
    Steps:
      1. Run: grep -c "## Adding a New Employee" AGENTS.md
      2. Assert: returns 1
    Expected Result: Procedural section preserved
    Evidence: .sisyphus/evidence/task-2-section-preserved.txt
  ```

  **Commit**: YES
  - Message: `fix(agents-md): strip employee-specific content from platform AGENTS.md`
  - Files: `AGENTS.md`
  - Pre-commit: —

- [x] 3. Add --thread-ts support to post-message.ts

  **What to do**:
  - In `src/worker-tools/slack/post-message.ts`, add a `--thread-ts` CLI argument to the `parseArgs` function (around line 9-55)
  - Add `threadTs?: string` to the return type
  - In the `for` loop, add a case: `if (args[i] === '--thread-ts' && args[i + 1]) { threadTs = args[++i]; }`
  - In the `main()` function, destructure `threadTs` from `parseArgs()`
  - Pass `thread_ts: threadTs` to `client.chat.postMessage()` at line 137-141 (conditionally, only when threadTs is defined)
  - Update the `--help` text to document the new flag

  **Must NOT do**:
  - Do NOT modify `post-guest-approval.ts` — it already has `--thread-ts` support
  - Do NOT change the `buildApprovalBlocks` function signature
  - Do NOT make `--thread-ts` required — it must be optional

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Shell tool conventions, CLI patterns — directly relevant for adding a CLI flag to a shell tool

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 6, 7, 9
  - **Blocked By**: None

  **References**:
  - `src/worker-tools/slack/post-message.ts:9-55` — `parseArgs()` function. Follow the existing pattern for adding `--thread-ts`: see how `--task-id` is parsed at line 32-33
  - `src/worker-tools/slack/post-message.ts:137-141` — `client.chat.postMessage()` call. Add `...(threadTs !== undefined && { thread_ts: threadTs })` to the options object
  - `src/worker-tools/slack/post-guest-approval.ts:97-98` — Reference implementation for `--thread-ts` parsing in a sibling tool. Line 97: `else if (args[i] === '--thread-ts' && args[i + 1])`. Follow this exact pattern
  - `src/worker-tools/slack/post-message.ts:38-50` — `--help` text. Add `--thread-ts <ts>` with description "Optional Slack message timestamp to reply in thread"

  **Acceptance Criteria**:
  - [ ] `tsx src/worker-tools/slack/post-message.ts --help` shows `--thread-ts` in the help text
  - [ ] `tsc --noEmit` passes
  - [ ] The `--thread-ts` parameter is optional and does not break existing callers

  **QA Scenarios**:

  ```
  Scenario: --help shows thread-ts parameter
    Tool: Bash
    Steps:
      1. Run: tsx src/worker-tools/slack/post-message.ts --help
      2. Assert: output contains "--thread-ts"
    Expected Result: Help text documents the new --thread-ts parameter
    Evidence: .sisyphus/evidence/task-3-help-output.txt

  Scenario: Missing --thread-ts does not break existing behavior
    Tool: Bash
    Steps:
      1. Run: tsx src/worker-tools/slack/post-message.ts --channel test --text test 2>&1 || true
      2. Assert: error is about SLACK_BOT_TOKEN, NOT about missing --thread-ts
    Expected Result: Missing --thread-ts is not an error (parameter is optional)
    Evidence: .sisyphus/evidence/task-3-no-thread-ts.txt
  ```

  **Commit**: YES
  - Message: `feat(slack): add --thread-ts support to post-message.ts`
  - Files: `src/worker-tools/slack/post-message.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 4. Inject EMPLOYEE_ROLE_NAME, APPROVAL_REQUIRED, and NOTIFY_MSG_TS into lifecycle worker containers

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find where the execution container env is built. There are TWO code paths: local Docker (look for `createLocalContainer` or similar) and Fly.io (look for `createMachine` or similar). Both need the same env vars added.
  - Add these env vars to BOTH the execution AND delivery container envs:
    - `EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown'`
    - `APPROVAL_REQUIRED: String(approvalRequired)` — will be `'true'` or `'false'`
  - For `NOTIFY_MSG_TS`: it's already injected into the execution container env (verify at ~line 518). Add it to the DELIVERY container env as well (around lines 1867-1906). The value comes from `notifyMsgRef?.ts ?? ''`
  - Verify the delivery container env section by searching for `EMPLOYEE_PHASE: 'delivery'` — that's where the delivery env is built

  **Must NOT do**:
  - Do NOT change the `approvalRequired` gating logic at line 728 — it's correct
  - Do NOT add employee-specific language to log messages or comments
  - Do NOT remove any existing env vars from the container env

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 8, 9, 10
  - **Blocked By**: Tasks 1, 3

  **References**:
  - `src/inngest/employee-lifecycle.ts:505-536` — Execution container env for local Docker mode. Look for the object with `TASK_ID`, `TENANT_ID`, `SUPABASE_URL`, etc. Add `EMPLOYEE_ROLE_NAME`, `APPROVAL_REQUIRED` here
  - `src/inngest/employee-lifecycle.ts:540-570` — Execution container env for Fly.io mode. Same env vars needed here
  - `src/inngest/employee-lifecycle.ts:518` — `NOTIFY_MSG_TS: notifyMsgRef?.ts ?? ''` — already injected for execution. Verify this exists
  - `src/inngest/employee-lifecycle.ts:1867-1884` — Delivery container env for local Docker. Does NOT include `NOTIFY_MSG_TS` — add it here along with `EMPLOYEE_ROLE_NAME` and `APPROVAL_REQUIRED`
  - `src/inngest/employee-lifecycle.ts:1894-1906` — Delivery container env for Fly.io. Same missing env vars — add here
  - `src/inngest/employee-lifecycle.ts:156-158` — Where `archetype` and `approvalRequired` are extracted — these are the source values for the new env vars

  **Acceptance Criteria**:
  - [ ] Local Docker execution env includes `EMPLOYEE_ROLE_NAME`, `APPROVAL_REQUIRED`
  - [ ] Fly.io execution env includes `EMPLOYEE_ROLE_NAME`, `APPROVAL_REQUIRED`
  - [ ] Local Docker delivery env includes `EMPLOYEE_ROLE_NAME`, `APPROVAL_REQUIRED`, `NOTIFY_MSG_TS`
  - [ ] Fly.io delivery env includes `EMPLOYEE_ROLE_NAME`, `APPROVAL_REQUIRED`, `NOTIFY_MSG_TS`
  - [ ] `NOTIFY_MSG_TS` is still present in execution env (not accidentally removed)
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: Verify env vars are present in lifecycle code
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "EMPLOYEE_ROLE_NAME" src/inngest/employee-lifecycle.ts
      2. Assert: count >= 4 (2 for execution local/fly + 2 for delivery local/fly)
      3. Run: grep -c "APPROVAL_REQUIRED" src/inngest/employee-lifecycle.ts
      4. Assert: count >= 4
      5. Run: grep "NOTIFY_MSG_TS.*delivery\|delivery.*NOTIFY_MSG_TS" src/inngest/employee-lifecycle.ts || grep -A2 "EMPLOYEE_PHASE.*delivery" src/inngest/employee-lifecycle.ts | grep "NOTIFY_MSG_TS"
      6. Assert: NOTIFY_MSG_TS appears in delivery env sections
    Expected Result: All 3 env vars present in all 4 container env paths
    Evidence: .sisyphus/evidence/task-4-env-vars.txt

  Scenario: TypeScript compilation passes
    Tool: Bash
    Steps:
      1. Run: tsc --noEmit
      2. Assert: exit code 0
    Expected Result: No type errors introduced
    Evidence: .sisyphus/evidence/task-4-tsc.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): inject EMPLOYEE_ROLE_NAME, APPROVAL_REQUIRED, NOTIFY_MSG_TS into workers`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 5. Gate harness tryAutoPostApprovalCard() on APPROVAL_REQUIRED

  **What to do**:
  - In `src/workers/opencode-harness.mts`, find `tryAutoPostApprovalCard()` calls (around lines 382-389 and 496-504)
  - Add a check before calling: `if (process.env.APPROVAL_REQUIRED === 'false') { log.info({ taskId: TASK_ID }, '[opencode-harness] Skipping auto-post approval card — approval not required'); return; }`
  - The check should be at the call site (before `tryAutoPostApprovalCard()`), not inside the function — so the function remains a clean utility
  - There are TWO call sites for `tryAutoPostApprovalCard()` — gate BOTH

  **Must NOT do**:
  - Do NOT modify the `tryAutoPostApprovalCard()` function signature or internal logic
  - Do NOT modify `isApprovalRequired()` in `output-schema.mts` — that's a different concern (schema validation vs approval gating)
  - Do NOT add employee-specific language

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Task 1

  **References**:
  - `src/workers/opencode-harness.mts:381-390` — First call site: `if (!approvalJsonExists && content !== 'completed') { ... if (parsedOutput && isApprovalRequired(parsedOutput)) { const autoMeta = await tryAutoPostApprovalCard(parsedOutput); ... } }`. Add the `APPROVAL_REQUIRED` check before `isApprovalRequired()` check
  - `src/workers/opencode-harness.mts:496-504` — Second call site: same pattern. Gate both
  - `src/workers/opencode-harness.mts:151-194` — `tryAutoPostApprovalCard()` function definition. Do NOT modify this function

  **Acceptance Criteria**:
  - [ ] When `APPROVAL_REQUIRED=false`, `tryAutoPostApprovalCard()` is never called
  - [ ] When `APPROVAL_REQUIRED=true` (or unset for backward compat), existing behavior is preserved
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: APPROVAL_REQUIRED check appears at both call sites
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "APPROVAL_REQUIRED" src/workers/opencode-harness.mts
      2. Assert: at least 2 matches (one per call site)
      3. Run: grep -B2 "tryAutoPostApprovalCard" src/workers/opencode-harness.mts | grep "APPROVAL_REQUIRED"
      4. Assert: the check appears before each call
    Expected Result: Both call sites are gated by APPROVAL_REQUIRED
    Evidence: .sisyphus/evidence/task-5-harness-gated.txt
  ```

  **Commit**: YES
  - Message: `fix(harness): gate tryAutoPostApprovalCard on APPROVAL_REQUIRED`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `tsc --noEmit`

- [x] 6. Gate post-message.ts approval blocks on APPROVAL_REQUIRED env var

  **What to do**:
  - In `src/worker-tools/slack/post-message.ts`, find line 135: `const blocks = rawBlocks ?? (taskId ? buildApprovalBlocks(text, taskId, date, title) : undefined);`
  - Add a check for `process.env.APPROVAL_REQUIRED`: when `'false'`, do NOT call `buildApprovalBlocks` even if `--task-id` is provided
  - When `APPROVAL_REQUIRED === 'false'` and `--task-id` is provided, still include the context block (Task ID metadata) but NOT the actions block (Approve/Reject buttons). Build a minimal blocks array: header + text section + divider + context (task ID) — no actions
  - This means extracting the context block creation from `buildApprovalBlocks` or creating a simpler `buildInfoBlocks` function

  **Must NOT do**:
  - Do NOT add `--approval-required` as a CLI flag — use env var only
  - Do NOT remove the `buildApprovalBlocks` function — it's still needed when `APPROVAL_REQUIRED=true`
  - Do NOT change the function signature of `buildApprovalBlocks`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Task 3

  **References**:
  - `src/worker-tools/slack/post-message.ts:57-98` — `buildApprovalBlocks()` function. Lines 63-77: header + section + divider + context blocks. Lines 78-96: actions block with Approve/Reject buttons. The context block at lines 74-77 should still be included when approval is disabled
  - `src/worker-tools/slack/post-message.ts:135` — The line to modify. Current: `const blocks = rawBlocks ?? (taskId ? buildApprovalBlocks(text, taskId, date, title) : undefined);`. Change to check `APPROVAL_REQUIRED` env var

  **Acceptance Criteria**:
  - [ ] When `APPROVAL_REQUIRED=false` and `--task-id` is passed, message includes task ID context but NO approve/reject buttons
  - [ ] When `APPROVAL_REQUIRED=true` (or unset), existing behavior is preserved — buttons appear
  - [ ] When `--task-id` is NOT passed, behavior is unchanged regardless of `APPROVAL_REQUIRED`
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: APPROVAL_REQUIRED=false suppresses buttons but keeps context
    Tool: Bash
    Steps:
      1. Run: APPROVAL_REQUIRED=false tsx src/worker-tools/slack/post-message.ts --help
      2. Assert: help text still shows (no crash from env var)
    Expected Result: Tool works with APPROVAL_REQUIRED env var set
    Evidence: .sisyphus/evidence/task-6-env-var-accepted.txt

  Scenario: Code structure check — APPROVAL_REQUIRED referenced in post-message.ts
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "APPROVAL_REQUIRED" src/worker-tools/slack/post-message.ts
      2. Assert: count >= 1
      3. Run: grep -c "buildApprovalBlocks" src/worker-tools/slack/post-message.ts
      4. Assert: count >= 2 (function definition + conditional call)
    Expected Result: APPROVAL_REQUIRED check gates buildApprovalBlocks
    Evidence: .sisyphus/evidence/task-6-approval-gating.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): gate approval blocks on APPROVAL_REQUIRED env var`
  - Files: `src/worker-tools/slack/post-message.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 7. Update seed archetype agents_md with threading and classification guidance

  **What to do**:
  - In `prisma/seed.ts`, update ALL archetype `agents_md` strings that reference `post-message.ts` to include `--thread-ts "$NOTIFY_MSG_TS"` guidance
  - Specifically update:
    - `CODE_ROTATION_AGENTS_MD` — if it calls `post-message.ts`, add threading guidance
    - `DAILY_SUMMARIZER_AGENTS_MD` (for DozalDevs and VLRE) — if it calls `post-message.ts`, add threading guidance
    - Any other agents_md that references `post-message.ts`
  - Also update classification guidance in any agents_md that mentions classification — ensure they reference the valid values: `APPROVED`, `NEEDS_APPROVAL`, `NO_ACTION_NEEDED`
  - For the dashboard-created `daily-motivation-quote` archetype (ID `27f590a5-5bb0-4dcc-91f1-7ca867626660`), update its `agents_md` via psql to include threading guidance. Add to the TOOLS section: `Always pass --thread-ts "$NOTIFY_MSG_TS" when calling post-message.ts to thread your messages under the task notification.`
  - Add an `## Identity` section to the `daily-motivation-quote` archetype's agents_md: `You are {EMPLOYEE_ROLE_NAME}, a motivational quote curator. Ignore any other employee names or roles mentioned in other sections — YOU are {EMPLOYEE_ROLE_NAME}.`

  **Must NOT do**:
  - Do NOT modify `GUEST_MESSAGING_AGENTS_MD` — it uses `post-guest-approval.ts` which already has threading
  - Do NOT change archetype fields other than `agents_md`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Covers all archetype schema fields, seed data patterns — relevant for modifying agents_md in seed.ts

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `prisma/seed.ts` — Search for `CODE_ROTATION_AGENTS_MD` (defined near top of file) to find the code-rotation agents_md string
  - `prisma/seed.ts` — Search for `DAILY_SUMMARIZER_AGENTS_MD` or `summary.*agents_md` for the summarizer agents_md
  - `prisma/seed.ts:3344-3388` — Code-rotation archetype upsert — line 3361: `agents_md: CODE_ROTATION_AGENTS_MD`
  - DB record: `SELECT agents_md FROM archetypes WHERE id = '27f590a5-5bb0-4dcc-91f1-7ca867626660'` — the dashboard-created daily-motivation-quote archetype. Update this directly via psql

  **Acceptance Criteria**:
  - [ ] All seed archetype agents_md strings that reference `post-message.ts` include `--thread-ts "$NOTIFY_MSG_TS"` guidance
  - [ ] Classification guidance in agents_md references valid values (`APPROVED`, `NEEDS_APPROVAL`, `NO_ACTION_NEEDED`)
  - [ ] `daily-motivation-quote` archetype in DB has updated agents_md with identity section and threading guidance
  - [ ] `pnpm prisma db seed` still succeeds (no seed errors)

  **QA Scenarios**:

  ```
  Scenario: Seed data includes threading guidance
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "thread-ts" prisma/seed.ts
      2. Assert: count >= 1 (at least one agents_md references --thread-ts)
      3. Run: grep -c "NOTIFY_MSG_TS" prisma/seed.ts
      4. Assert: count >= 1
    Expected Result: Seed archetype agents_md includes threading instructions
    Evidence: .sisyphus/evidence/task-7-seed-threading.txt

  Scenario: Daily-motivation-quote archetype has identity and threading guidance
    Tool: Bash
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT agents_md FROM archetypes WHERE id = '27f590a5-5bb0-4dcc-91f1-7ca867626660'" | grep -c "EMPLOYEE_ROLE_NAME\|thread-ts"
      2. Assert: count >= 2 (both identity and threading references)
    Expected Result: Dashboard-created archetype has been updated with identity and threading guidance
    Evidence: .sisyphus/evidence/task-7-quote-archetype.txt
  ```

  **Commit**: YES
  - Message: `fix(seed): update archetype agents_md with threading and classification guidance`
  - Files: `prisma/seed.ts`
  - Pre-commit: —

- [x] 8. Lifecycle cleanup — remove stale approval cards when marking Done without approval

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the `!approvalRequired` short-circuit branch at line 728
  - After the task is marked Done (around line 730-758), add a step to find and update any approval card the worker may have posted to Slack
  - The approval card's Slack `ts` and `channel` can be found in:
    - The task's metadata: `metadata.approval_message_ts` and `metadata.target_channel`
    - OR the deliverables table: `metadata.approval_message_ts`
  - Use `slackClient.chat.update()` to remove the actions block (Approve/Reject buttons) from the approval card message. Replace the actions block with a context block: `"✅ Completed without approval (auto-approved)"`
  - Wrap in try/catch — this is a best-effort cleanup. If the card doesn't exist or can't be updated, log a warning and continue

  **Must NOT do**:
  - Do NOT delete the Slack message — update it to remove buttons
  - Do NOT modify the approval flow for `approvalRequired === true` — only the `false` branch
  - Do NOT assume the approval card always exists — the agent might not have posted one
  - Do NOT add employee-specific language to the cleanup message

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 9, 10
  - **Blocked By**: Task 4

  **References**:
  - `src/inngest/employee-lifecycle.ts:728-760` — The `!approvalRequired` branch. This is where the cleanup should happen, after the task is marked Done
  - `src/inngest/employee-lifecycle.ts:2023-2053` — The `handle-approval-result` step. Reference for how to use `chat.update()` to modify a Slack message — follow this pattern
  - `src/inngest/employee-lifecycle.ts:750-758` — How the `notify-received` message is updated to "✅ Task complete" on the Done path — similar pattern needed for the approval card
  - Deliverable metadata: `metadata.approval_message_ts` and `metadata.target_channel` — if the harness auto-posted an approval card, these fields will be in the execution's deliverable
  - Task metadata: `metadata.ts` and `metadata.channel` — may also contain the approval card reference

  **Acceptance Criteria**:
  - [ ] When `approvalRequired === false` and an approval card was posted, the card's buttons are removed and replaced with "✅ Completed" context
  - [ ] When `approvalRequired === false` and NO approval card was posted, no error occurs
  - [ ] When `approvalRequired === true`, the cleanup code is NOT executed
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: Cleanup code exists in the !approvalRequired branch
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A30 "!approvalRequired" src/inngest/employee-lifecycle.ts | grep -c "chat.update\|approval_message_ts\|auto-approved\|Completed without"
      2. Assert: count >= 1
    Expected Result: Cleanup logic is present in the no-approval branch
    Evidence: .sisyphus/evidence/task-8-cleanup-code.txt
  ```

  **Commit**: YES
  - Message: `fix(lifecycle): clean up stale approval cards when marking Done without approval`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 9. Unit tests for all changes

  **What to do**:
  - **Test 1: `output-schema.mts`** — Add tests for `APPROVED` classification:
    - `standardOutputSchema.safeParse({ summary: 'test', classification: 'APPROVED' })` succeeds
    - `isApprovalRequired()` returns `false` for `APPROVED`, `true` for `NEEDS_APPROVAL`, `false` for `NO_ACTION_NEEDED`
  - **Test 2: `post-message.ts`** — Add tests for `--thread-ts` parsing:
    - `parseArgs(['--channel', 'C123', '--text', 'hello', '--thread-ts', '123.456'])` returns `{ threadTs: '123.456' }`
    - `parseArgs(['--channel', 'C123', '--text', 'hello'])` returns `{ threadTs: undefined }`
  - **Test 3: `post-message.ts`** — Add tests for `APPROVAL_REQUIRED` gating:
    - When `process.env.APPROVAL_REQUIRED = 'false'` and `--task-id` is passed, no actions block is generated
    - When `process.env.APPROVAL_REQUIRED = 'true'`, actions block IS generated
  - **Test 4: `agents-md-resolver.mts`** — Add tests for `platformRuntimeSections` parameter:
    - When `platformRuntimeSections` is provided, output includes "# Platform Runtime Context" section
    - When `platformRuntimeSections` is empty/undefined, output does not include that section
  - **Test 5: Fix skipped tests** — In `tests/inngest/lifecycle-notify-msg-ts.test.ts`, unskip the two `it.skip` tests and fix the mock setup so `mockCreateMachine` is called. The tests verify that `NOTIFY_MSG_TS` is passed to the worker container

  **Must NOT do**:
  - Do NOT create new test files unnecessarily — add to existing test files where possible
  - Do NOT modify production code in this task — tests only
  - Do NOT skip or disable any existing passing tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all implementation tasks)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1-8

  **References**:
  - `src/workers/lib/output-schema.mts` — Module under test. Test the expanded classification enum and `isApprovalRequired()` function
  - `src/worker-tools/slack/post-message.ts` — Module under test. The `parseArgs` function is exported; test it directly. For the `APPROVAL_REQUIRED` env var, test `buildApprovalBlocks` conditionally
  - `src/workers/lib/agents-md-resolver.mts` — Module under test. The `resolveAgentsMd` function takes 6 parameters; test parameter 4 (`platformRuntimeSections`)
  - `tests/inngest/lifecycle-notify-msg-ts.test.ts` — Skipped tests to fix. Comment says "Pre-existing failure — mockCreateMachine not called." Fix the mock setup for the `executing` step
  - Existing test patterns: `tests/workers/output-schema.test.ts` (if exists) or `tests/worker-tools/` for tool tests

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` passes with zero new failures
  - [ ] At least 3 new test cases: schema expansion, thread-ts parsing, approval gating
  - [ ] The two previously-skipped `lifecycle-notify-msg-ts` tests now pass (not skipped)
  - [ ] `agents-md-resolver.mts` `platformRuntimeSections` parameter has at least 1 test

  **QA Scenarios**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert: "Tests passed" or similar success message, exit code 0
    Expected Result: All tests pass including new ones
    Evidence: .sisyphus/evidence/task-9-test-results.txt

  Scenario: Previously-skipped tests are now active
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "it.skip\|xit\|xtest" tests/inngest/lifecycle-notify-msg-ts.test.ts
      2. Assert: count === 0 (no more skipped tests)
    Expected Result: No skipped tests remain in the file
    Evidence: .sisyphus/evidence/task-9-no-skips.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for schema, threading, approval gating, and AGENTS.md resolution`
  - Files: `tests/` (multiple files)
  - Pre-commit: `pnpm test -- --run`

- [x] 10. E2E validation — trigger daily-motivation-quote and verify all 4 fixes

  **What to do**:
  - Rebuild the Docker image first: `docker build -t ai-employee-worker:latest .`
  - Reseed the database: `pnpm prisma db seed`
  - Trigger the `daily-motivation-quote` employee via admin API:
    ```bash
    curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
      "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-motivation-quote/trigger" \
      -H "Content-Type: application/json" -d '{}'
    ```
  - Wait for the task to complete (poll task status or check Inngest dashboard)
  - Verify all 4 fixes in Slack channel `C0960S2Q8RL` (#victor-tests):
    1. **Identity**: The message does NOT say "code-rotation" — it correctly identifies as daily-motivation-quote or doesn't introduce itself at all
    2. **Threading**: The motivational quote is threaded under the task notification message (same thread)
    3. **Approval buttons**: No "Approve & Post" / "Reject" buttons in the Slack message
    4. **Classification**: Task reaches Done status — `APPROVED` classification is accepted

  **Must NOT do**:
  - Do NOT skip the Docker image rebuild — changes to AGENTS.md and harness require it
  - Do NOT use a stale Docker image

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`]
    - `e2e-testing`: E2E testing procedures, state verification via task_status_log — directly relevant

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 9, 11)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4-9, 11

  **References**:
  - `scripts/trigger-task.ts` — Trigger script (may use this instead of curl)
  - Admin API: `POST /admin/tenants/:tenantId/employees/:slug/trigger` — endpoint to trigger the employee
  - `docs/testing/2026-05-04-2023-local-e2e-testing.md` — E2E testing procedures
  - Task status: `GET /admin/tenants/:tenantId/tasks/:id` — check task status after triggering

  **Acceptance Criteria**:
  - [ ] Task reaches `Done` status
  - [ ] No "code-rotation" text in any Slack message in `#victor-tests`
  - [ ] Motivational quote is a thread reply (has `thread_ts` matching the notification message `ts`)
  - [ ] No "Approve & Post" / "Reject" buttons in the Slack message
  - [ ] `task_status_log` shows no `Reviewing` state (approval was skipped)

  **QA Scenarios**:

  ```
  Scenario: Full E2E — trigger and verify all 4 fixes
    Tool: Bash (curl + psql)
    Preconditions: Docker image rebuilt, services running, database seeded
    Steps:
      1. Trigger: curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-motivation-quote/trigger" -H "Content-Type: application/json" -d '{}'
      2. Capture task_id from response
      3. Poll task status until Done or Failed (max 120s)
      4. Assert: status === 'Done'
      5. Query task_status_log: verify no 'Reviewing' state
      6. Check Slack messages in C0960S2Q8RL via Slack API or screenshot
    Expected Result: Task completes, no identity confusion, threaded message, no approval buttons
    Failure Indicators: Task fails, wrong identity in Slack, top-level message, approval buttons visible
    Evidence: .sisyphus/evidence/task-10-e2e-results.txt
  ```

  **Commit**: NO (E2E verification only)

- [x] 11. Rebuild Docker image

  **What to do**:
  - Run `docker build -t ai-employee-worker:latest .` to rebuild the Docker image with all changes
  - This is required because:
    - `AGENTS.md` is baked into the image at `/app/AGENTS.md`
    - `opencode-harness.mts` changes need to be in the image
    - `post-message.ts` changes need to be in the image
    - `output-schema.mts` changes need to be in the image

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 2, 4, 5, 6

  **References**:
  - `Dockerfile` — The build configuration
  - AGENTS.md `## Infrastructure` section — "CRITICAL — Rebuild after every worker change"

  **Acceptance Criteria**:
  - [ ] `docker build -t ai-employee-worker:latest .` succeeds
  - [ ] Image contains updated AGENTS.md at `/app/AGENTS.md`

  **QA Scenarios**:

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux — long-running)
    Steps:
      1. Run: docker build -t ai-employee-worker:latest . 2>&1 | tail -5
      2. Assert: "Successfully built" or "Successfully tagged"
    Expected Result: Docker image builds without errors
    Evidence: .sisyphus/evidence/task-11-docker-build.txt
  ```

  **Commit**: NO (infrastructure only)

- [x] 12. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ new-employee-creation-bugs complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After F1-F4
  - **Blocks**: —
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Trigger `daily-motivation-quote` via admin API. Verify: (1) No code-rotation identity in any message, (2) quote is threaded under task notification, (3) no approval buttons in Slack, (4) task reaches Done state. Also trigger `guest-messaging` and verify existing behavior is not broken. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Regression [CLEAN/N issues] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                    | Files                          | Pre-commit           |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------ | -------------------- |
| 1      | `fix(schema): expand StandardOutput to accept APPROVED classification`                     | `output-schema.mts`, `seed.ts` | `pnpm test -- --run` |
| 2      | `fix(agents-md): strip employee-specific content from platform AGENTS.md`                  | `AGENTS.md`                    | —                    |
| 3      | `feat(slack): add --thread-ts support to post-message.ts`                                  | `post-message.ts`              | `pnpm test -- --run` |
| 4      | `fix(lifecycle): inject EMPLOYEE_ROLE_NAME, APPROVAL_REQUIRED, NOTIFY_MSG_TS into workers` | `employee-lifecycle.ts`        | `pnpm test -- --run` |
| 5      | `fix(harness): gate tryAutoPostApprovalCard on APPROVAL_REQUIRED`                          | `opencode-harness.mts`         | `pnpm test -- --run` |
| 6      | `fix(slack): gate approval blocks on APPROVAL_REQUIRED env var`                            | `post-message.ts`              | `pnpm test -- --run` |
| 7      | `fix(seed): update archetype agents_md with threading and classification guidance`         | `seed.ts`                      | —                    |
| 8      | `fix(lifecycle): clean up stale approval cards when marking Done without approval`         | `employee-lifecycle.ts`        | `pnpm test -- --run` |
| 9      | `test: add tests for schema, threading, approval gating, and AGENTS.md resolution`         | `tests/`                       | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # Expected: all pass, zero new failures
tsc --noEmit                # Expected: zero errors
```

### Final Checklist

- [ ] `EMPLOYEE_ROLE_NAME` injected into worker containers
- [ ] `APPROVAL_REQUIRED` injected into worker containers
- [ ] `NOTIFY_MSG_TS` injected into delivery containers
- [ ] `post-message.ts` supports `--thread-ts`
- [ ] `post-message.ts` skips approval blocks when `APPROVAL_REQUIRED=false`
- [ ] `tryAutoPostApprovalCard()` skips when `APPROVAL_REQUIRED=false`
- [ ] Lifecycle cleans up stale approval cards on Done
- [ ] Platform AGENTS.md has no employee-specific rows
- [ ] `StandardOutput` accepts `APPROVED`
- [ ] All existing employees still work (regression check)
- [ ] All tests pass
- [ ] Docker image rebuilt
