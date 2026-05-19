# Fix Threading, Newline Rendering, and Add Inngest Run ID Observability

## TL;DR

> **Quick Summary**: Fix 2 Slack message bugs (missing threading, literal `\n` rendering) and add Inngest run ID tracking to every task for cross-referencing between our DB and the Inngest dashboard.
>
> **Deliverables**:
>
> - `post-message.ts` normalizes `\n` escape sequences into real newlines
> - `tool-usage-reference/SKILL.md` documents `--thread-ts` as universal for `post-message.ts`
> - Inngest run ID stored in `tasks.metadata` and displayed in every Slack lifecycle message
> - Factory pattern (`createTaskNotifyBuilders`) eliminates `taskId`/`runId` duplication across 15 call sites
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1/T2/T3 (parallel) → T4/T5 (parallel) → T6 (tests) → T7 (E2E) → Final

---

## Context

### Original Request

User triggered the `daily-motivation-quote` employee and observed:

1. The motivational quote posted as a new top-level Slack message instead of threading under the task notification
2. The message rendered `\n` as literal text instead of actual line breaks
3. Difficulty cross-referencing between task IDs in the DB and run IDs in the Inngest dashboard

### Interview Summary

**Key Discussions**:

- **Threading**: Root cause is `tool-usage-reference/SKILL.md` omitting `--thread-ts` from `post-message.ts` docs. The archetype's `agents_md` has the instruction, but the LLM follows the authoritative SKILL.md example.
- **Newlines**: `post-message.ts` doesn't normalize `\\n` → `\n`. The sibling tool `post-guest-approval.ts` already does this at lines 235-236.
- **Run ID**: Inngest SDK 4.1.0 provides `runId` as a top-level property on the handler context. Format: ULID (26 chars). User wants it in every Slack lifecycle message and stored in DB.
- **Run ID storage**: Use `tasks.metadata` JSON (no migration needed, consistent with existing `notify_slack_ts` pattern).
- **Slack visibility**: Run ID in every lifecycle message (received, approval, terminal states).
- **Tests**: Yes, tests after implementation (Vitest).

**Research Findings**:

- `runId` accessed via `async ({ event, step, runId }) => {}` — line 133 of lifecycle
- `buildNotifyBlocks` has 11 call sites in lifecycle; `buildNotifyStateBlocks` has 4 call sites (15 total)
- Both block builders end with a `context` block containing `Task \`{taskId}\`` — run ID becomes a second element
- `post-message.ts` line 31: `text = args[++i]` with zero normalization
- SKILL.md line 225: `--thread-ts` documented only for `post-guest-approval.ts`, framed as guest-messaging-specific

### Metis Review

**Identified Gaps** (addressed):

- `daily-motivation-quote` archetype not in seed.ts — OK, created via dashboard. SKILL.md fix affects all employees.
- Docker rebuild required — SKILL.md is baked into the Docker image. Included as task.
- `buildNotifyBlocks` has 15 total call sites (11 + 4 state blocks) — must update all.
- Run ID storage: metadata JSON chosen over dedicated column (no migration, consistent pattern).

---

## Work Objectives

### Core Objective

Fix Slack message threading and newline rendering for all employees, and add Inngest run ID tracking for debugging observability.

### Concrete Deliverables

- Modified `src/worker-tools/slack/post-message.ts` — normalizes `\\n` → `\n` in `--text` argument
- Modified `src/workers/skills/tool-usage-reference/SKILL.md` — documents `--thread-ts` as universal for `post-message.ts`
- Modified `src/inngest/employee-lifecycle.ts` — captures Inngest `runId`, stores in task metadata, passes to all Slack notification builders
- Modified `src/lib/slack-blocks.ts` — `buildNotifyBlocks` and `buildNotifyStateBlocks` accept optional `runId`; new `createTaskNotifyBuilders` factory returns pre-configured builders with `taskId` + `runId` baked in
- New/modified tests in `tests/`

### Definition of Done

- [ ] Triggering `daily-motivation-quote` produces a message threaded under the task notification with real newlines
- [ ] Inngest run ID appears in every Slack lifecycle message as `Run \`01KS...\``
- [ ] Inngest run ID stored in `tasks.metadata.inngest_run_id`
- [ ] `pnpm test -- --run` passes with zero new failures
- [ ] `tsc --noEmit` passes

### Must Have

- `post-message.ts` normalizes `\\n` → real newlines in `--text` argument
- SKILL.md `post-message.ts` section includes `--thread-ts` in optional flags AND usage example
- SKILL.md removes "guest-messaging only" framing for `--thread-ts`
- Lifecycle destructures `runId` from handler context
- `runId` stored in `tasks.metadata` as `inngest_run_id` (in the `notify-received` step)
- `buildNotifyBlocks` and `buildNotifyStateBlocks` accept optional `runId` parameter
- Lifecycle uses `createTaskNotifyBuilders` factory — `taskId` + `runId` baked in once, not repeated at 15 call sites
- All 15 call sites migrated from `buildNotifyBlocks`/`buildNotifyStateBlocks` to factory-created `notifyBlocks`/`notifyStateBlocks`
- Every Slack lifecycle message shows `Run \`{runId}\``in the context block alongside`Task \`{taskId}\``
- Unit tests for newline normalization and run ID block building

### Must NOT Have (Guardrails)

- Do NOT add a Prisma migration — use existing `metadata` JSON field
- Do NOT modify `post-guest-approval.ts` — it already works correctly
- Do NOT change the lifecycle's approval gating logic
- Do NOT add employee-specific language to shared files
- Do NOT change `buildNotifyBlocks` call signatures in a breaking way — `runId` must be optional
- Do NOT modify the `approval-card-poster.mts` — it's a separate concern

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

- **Shell tools**: Bash — call tool directly, assert output/exit code
- **Slack blocks**: Bash (node REPL) — import function, call with test data, compare output
- **Lifecycle**: Bash — trigger task via admin API, check DB + Slack

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all independent):
├── Task 1: Normalize newlines in post-message.ts [quick]
├── Task 2: Update SKILL.md with --thread-ts for post-message.ts [quick]
├── Task 3: Add runId to block builders + createTaskNotifyBuilders factory [quick]

Wave 2 (After Wave 1 — depends on T3):
├── Task 4: Capture runId in lifecycle + store in task metadata [deep]
├── Task 5: Migrate all 15 call sites to createTaskNotifyBuilders factory [unspecified-high]

Wave 3 (After Wave 2 — integration + verification):
├── Task 6: Unit tests for all changes [unspecified-high]
├── Task 7: Docker rebuild + E2E validation [unspecified-high]
├── Task 8: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 6, 7    | 1    |
| 2    | —          | 7       | 1    |
| 3    | —          | 4, 5, 6 | 1    |
| 4    | 3          | 5, 6, 7 | 2    |
| 5    | 3, 4       | 6, 7    | 2    |
| 6    | 1, 3, 4, 5 | 7       | 3    |
| 7    | 1-6        | F1-F4   | 3    |
| 8    | F1-F4      | —       | 3    |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 2 tasks — T4 `deep`, T5 `unspecified-high`
- **Wave 3**: 3 tasks — T6 `unspecified-high`, T7 `unspecified-high`, T8 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Normalize newlines in post-message.ts

  **What to do**:
  - In `src/worker-tools/slack/post-message.ts`, after line 31 (`text = args[++i];`), add: `text = text.replace(/\\n/g, '\n');`
  - This converts the two-character shell-escaped `\n` into a real newline character before the text reaches Slack's Block Kit
  - This mirrors the existing pattern in `post-guest-approval.ts` at lines 235-236

  **Must NOT do**:
  - Do NOT modify `post-guest-approval.ts`
  - Do NOT apply normalization to other args like `--channel` or `--task-id`
  - Do NOT use a global regex flag that could affect other escape sequences (only `\\n` → `\n`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: None

  **References**:
  - `src/worker-tools/slack/post-message.ts:30-31` — The `--text` parsing. Line 31: `text = args[++i]`. Add normalization immediately after this line
  - `src/worker-tools/slack/post-guest-approval.ts:235-236` — Reference pattern: `.replace(/\\n/g, '\n')` already in use for the same purpose

  **Acceptance Criteria**:
  - [ ] `text.replace(/\\n/g, '\n')` present in parseArgs after `--text` read
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: Newlines are normalized in --text argument
    Tool: Bash
    Steps:
      1. Run: node -e "process.argv = ['node', 'test', '--channel', 'C123', '--text', 'Line1\\\\nLine2']; const m = require('./src/worker-tools/slack/post-message.ts'); " 2>&1 || true
      2. Alternatively: grep -A1 "text = args\[++i\]" src/worker-tools/slack/post-message.ts | grep "replace"
      3. Assert: normalization line exists
    Expected Result: The replace call is present immediately after the text assignment
    Evidence: .sisyphus/evidence/task-1-newline-normalization.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): normalize \\n escape sequences in post-message.ts`
  - Files: `src/worker-tools/slack/post-message.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 2. Update SKILL.md with --thread-ts for post-message.ts

  **What to do**:
  - In `src/workers/skills/tool-usage-reference/SKILL.md`, find the `post-message.ts` section
  - Add `--thread-ts <ts>` to the optional flags list (currently around lines 68-71) with description: "Thread the message under an existing Slack message. Pass `"$NOTIFY_MSG_TS"` to reply under the task notification. Omitting this posts a new top-level message."
  - Update the usage example (around lines 96-101) to include `--thread-ts "$NOTIFY_MSG_TS"` in the command
  - Find line 225 where `--thread-ts` is described as "ALWAYS REQUIRED for guest-messaging" and change the framing to make it universal: "ALWAYS pass `--thread-ts "$NOTIFY_MSG_TS"` when posting messages to thread them under the task notification. Omitting this causes a new top-level message in the channel."
  - Remove any guest-messaging-specific framing from the `--thread-ts` description

  **Must NOT do**:
  - Do NOT modify `post-guest-approval.ts` section in SKILL.md (only `post-message.ts` section)
  - Do NOT remove any existing flags or documentation
  - Do NOT add employee-specific language

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Shell tool documentation conventions — relevant for SKILL.md updates

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `src/workers/skills/tool-usage-reference/SKILL.md:68-71` — Optional flags list for `post-message.ts`. Add `--thread-ts` here
  - `src/workers/skills/tool-usage-reference/SKILL.md:96-101` — Usage example for `post-message.ts`. Add `--thread-ts "$NOTIFY_MSG_TS"` to the example command
  - `src/workers/skills/tool-usage-reference/SKILL.md:225` — Current guest-messaging-specific framing: "ALWAYS REQUIRED for guest-messaging". Change to universal framing
  - `src/workers/skills/tool-usage-reference/SKILL.md:193` — `post-guest-approval.ts` example already includes `--thread-ts` — use as reference for the format

  **Acceptance Criteria**:
  - [ ] `--thread-ts` appears in `post-message.ts` optional flags section
  - [ ] `post-message.ts` usage example includes `--thread-ts "$NOTIFY_MSG_TS"`
  - [ ] No "guest-messaging only" framing for `--thread-ts`

  **QA Scenarios**:

  ```
  Scenario: SKILL.md documents --thread-ts for post-message.ts
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "thread-ts" src/workers/skills/tool-usage-reference/SKILL.md
      2. Assert: at least 3 matches — flags list, usage example, universal description
      3. Run: grep -c "guest-messaging" src/workers/skills/tool-usage-reference/SKILL.md | head -5
      4. Assert: "guest-messaging" does NOT appear in --thread-ts description context (still OK in other sections)
    Expected Result: --thread-ts is documented as universal, not guest-messaging-specific
    Evidence: .sisyphus/evidence/task-2-skill-md-update.txt
  ```

  **Commit**: YES
  - Message: `docs(skills): add --thread-ts to post-message.ts in tool-usage-reference`
  - Files: `src/workers/skills/tool-usage-reference/SKILL.md`
  - Pre-commit: —

- [x] 3. Add runId to block builders + create `createTaskNotifyBuilders` factory

  **What to do**:
  - In `src/lib/slack-blocks.ts`, modify `buildNotifyBlocks` (line 391) to accept an optional `runId?: string` in its params object
  - In the final context block (around line 469-472), add a second element for the run ID when provided:
    ```typescript
    elements: [
      { type: 'mrkdwn', text: `Task \`${taskId}\`` },
      ...(runId ? [{ type: 'mrkdwn', text: `Run \`${runId}\`` }] : []),
    ];
    ```
  - Similarly, modify `buildNotifyStateBlocks` (line 60) to accept optional `runId?: string`
  - Update its context block (line 72-74) with the same pattern
  - **Create a new exported factory function** `createTaskNotifyBuilders({ taskId, runId })` that returns `{ notifyBlocks, notifyStateBlocks }` — pre-configured wrappers around `buildNotifyBlocks` and `buildNotifyStateBlocks` with `taskId` and `runId` baked in. Callers only need to pass the per-call params (emoji, title, body, channel, etc.) — no more repeating `taskId`/`runId` at every call site.
  - The factory's return type should omit `taskId` and `runId` from each wrapper's params (use `Omit<>` on the original param types)
  - Both `runId` and the factory are backward-compatible — `runId` is optional, and direct `buildNotifyBlocks`/`buildNotifyStateBlocks` calls still work

  **Must NOT do**:
  - Do NOT make `runId` required — it must be optional for backward compatibility
  - Do NOT modify `buildApprovalBlocks` in `approval-card-poster.mts` — separate concern
  - Do NOT change any other block builder functions
  - Do NOT remove the original `buildNotifyBlocks`/`buildNotifyStateBlocks` exports — the factory wraps them, doesn't replace them

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None

  **References**:
  - `src/lib/slack-blocks.ts:391-475` — `buildNotifyBlocks` function. Params object at line 391, final context block at lines 469-472
  - `src/lib/slack-blocks.ts:60-76` — `buildNotifyStateBlocks` function. Params object at line 60, context block at lines 72-74
  - `src/lib/slack-blocks.ts:55-57` — Example of existing context block with `Task \`{taskId}\`` pattern

  **Acceptance Criteria**:
  - [ ] `buildNotifyBlocks` accepts optional `runId?: string` param
  - [ ] `buildNotifyStateBlocks` accepts optional `runId?: string` param
  - [ ] When `runId` is provided, context block includes `Run \`{runId}\``
  - [ ] When `runId` is omitted, behavior is unchanged (no Run ID shown)
  - [ ] `createTaskNotifyBuilders` is exported and returns `{ notifyBlocks, notifyStateBlocks }`
  - [ ] Factory wrappers omit `taskId` and `runId` from their param types
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: Run ID appears in block output when provided
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A5 "runId" src/lib/slack-blocks.ts | head -20
      2. Assert: runId parameter exists in both function signatures
      3. Assert: spread pattern `...(runId ?` exists in both functions
    Expected Result: Both block builders conditionally include run ID
    Evidence: .sisyphus/evidence/task-3-block-builders.txt

  Scenario: Factory function exists and is exported
    Tool: Bash (grep)
    Steps:
      1. Run: grep "createTaskNotifyBuilders" src/lib/slack-blocks.ts
      2. Assert: function is exported
      3. Assert: returns object with notifyBlocks and notifyStateBlocks
    Expected Result: Factory is exported and returns pre-configured builders
    Evidence: .sisyphus/evidence/task-3-factory.txt
  ```

  **Commit**: YES
  - Message: `feat(slack-blocks): add runId to block builders and createTaskNotifyBuilders factory`
  - Files: `src/lib/slack-blocks.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 4. Capture Inngest runId in lifecycle and store in task metadata

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts` line 133, change `async ({ event, step }) => {` to `async ({ event, step, runId }) => {`
  - In the `notify-received` step (around line 317), add `inngest_run_id: runId` to the `updatedMetadata` object that gets patched to the task via PostgREST
  - Find where `metadata` is built/updated in the `notify-received` step and add the `inngest_run_id` field alongside `notify_slack_ts` and `notify_slack_channel`

  **Must NOT do**:
  - Do NOT add a Prisma migration — use existing `metadata` JSON field
  - Do NOT change the function ID or trigger configuration
  - Do NOT modify the approval gating logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5 in same wave, but T5 depends on T4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 3

  **References**:
  - `src/inngest/employee-lifecycle.ts:133` — Handler signature. Change to include `runId`
  - `src/inngest/employee-lifecycle.ts:209-350` — `notify-received` step. Find the metadata patch (around lines 315-325) where `notify_slack_ts` and `notify_slack_channel` are stored
  - `src/inngest/employee-lifecycle.ts:317-321` — The `updatedMetadata` object. Add `inngest_run_id: runId` here

  **Acceptance Criteria**:
  - [ ] `runId` destructured from handler context at line 133
  - [ ] `inngest_run_id` stored in task metadata in `notify-received` step
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: runId captured and stored in metadata
    Tool: Bash (grep)
    Steps:
      1. Run: grep "runId" src/inngest/employee-lifecycle.ts | head -5
      2. Assert: `runId` appears in handler destructuring AND in metadata object
      3. Run: grep "inngest_run_id" src/inngest/employee-lifecycle.ts
      4. Assert: at least 1 match (metadata storage)
    Expected Result: runId is captured and stored
    Evidence: .sisyphus/evidence/task-4-run-id-capture.txt
  ```

  **Commit**: YES
  - Message: `feat(lifecycle): capture Inngest runId and store in task metadata`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 5. Migrate all 15 call sites to use `createTaskNotifyBuilders` factory

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, import `createTaskNotifyBuilders` from `src/lib/slack-blocks.ts` (replacing or alongside the existing `buildNotifyBlocks`/`buildNotifyStateBlocks` imports)
  - Near the top of the handler (after `taskId` is available from the event and `runId` from the handler context), create the factory instance:
    ```typescript
    const { notifyBlocks, notifyStateBlocks } = createTaskNotifyBuilders({ taskId, runId });
    ```
  - Replace all 11 `buildNotifyBlocks({ taskId, ...` calls with `notifyBlocks({ ...` — removing `taskId` (and `runId` if Task 4 already added it) from each call's params
  - Replace all 4 `buildNotifyStateBlocks({ taskId, ...` calls with `notifyStateBlocks({ ...` — same cleanup
  - All 15 call sites (line numbers from grep): 248, 616, 680, 761, 1040, 1083, 1361, 1458, 1614, 1817, 1885, 2037, 2096, 2143, 2348
  - Remove the old direct imports of `buildNotifyBlocks`/`buildNotifyStateBlocks` if no longer referenced

  **Why this approach**: Currently every call site manually passes `taskId`. Adding `runId` would make 15 more repetitions. The factory bakes in both values once — future context fields (tenant name, attempt number, etc.) are added in one place, not fifteen.

  **Must NOT do**:
  - Do NOT skip any call site — all 15 must be migrated
  - Do NOT modify the factory or block builder functions themselves (that was Task 3)
  - Do NOT add employee-specific language
  - Do NOT change what each call site passes for non-context params (emoji, title, body, channel, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T4 for `runId` variable)
  - **Parallel Group**: Wave 2 (after T4)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `src/inngest/employee-lifecycle.ts:248` — `buildNotifyBlocks` in `notify-received`
  - `src/inngest/employee-lifecycle.ts:616` — `buildNotifyBlocks` in superseded flow
  - `src/inngest/employee-lifecycle.ts:680` — `buildNotifyBlocks` in mark-failed
  - `src/inngest/employee-lifecycle.ts:761` — `buildNotifyStateBlocks` in complete (no approval)
  - `src/inngest/employee-lifecycle.ts:1040` — `buildNotifyStateBlocks` in no-action-needed
  - `src/inngest/employee-lifecycle.ts:1083` — `buildNotifyStateBlocks` in failed
  - `src/inngest/employee-lifecycle.ts:1361` — `buildNotifyBlocks` in reviewing
  - `src/inngest/employee-lifecycle.ts:1458` — `buildNotifyBlocks` in awaiting-input reply
  - `src/inngest/employee-lifecycle.ts:1614` — `buildNotifyBlocks` in expiry
  - `src/inngest/employee-lifecycle.ts:1817` — `buildNotifyStateBlocks` in delivery done
  - `src/inngest/employee-lifecycle.ts:1885` — `buildNotifyBlocks` in approve notify
  - `src/inngest/employee-lifecycle.ts:2037` — `buildNotifyBlocks` in delivery failed
  - `src/inngest/employee-lifecycle.ts:2096` — `buildNotifyBlocks` in done
  - `src/inngest/employee-lifecycle.ts:2143` — `buildNotifyBlocks` in superseded done
  - `src/inngest/employee-lifecycle.ts:2348` — `buildNotifyBlocks` in reject

  **Acceptance Criteria**:
  - [ ] `createTaskNotifyBuilders` imported and instantiated once near handler top
  - [ ] Zero remaining `buildNotifyBlocks({` calls in the lifecycle (all replaced with `notifyBlocks({`)
  - [ ] Zero remaining `buildNotifyStateBlocks({` calls in the lifecycle (all replaced with `notifyStateBlocks({`)
  - [ ] No call site passes `taskId` or `runId` directly — those are baked into the factory
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:

  ```
  Scenario: All call sites migrated to factory builders
    Tool: Bash
    Steps:
      1. Run: grep -c "notifyBlocks(" src/inngest/employee-lifecycle.ts
      2. Assert: count >= 11 (the 11 former buildNotifyBlocks calls)
      3. Run: grep -c "notifyStateBlocks(" src/inngest/employee-lifecycle.ts
      4. Assert: count >= 4 (the 4 former buildNotifyStateBlocks calls)
      5. Run: grep "buildNotifyBlocks(" src/inngest/employee-lifecycle.ts
      6. Assert: zero matches (or only inside comments/imports) — no direct calls remain
      7. Run: grep "createTaskNotifyBuilders" src/inngest/employee-lifecycle.ts
      8. Assert: exactly 1 match (the factory instantiation)
    Expected Result: All 15 call sites use factory, no direct builder calls remain
    Evidence: .sisyphus/evidence/task-5-factory-migration.txt

  Scenario: No call site passes taskId or runId directly
    Tool: Bash
    Steps:
      1. Run: grep -A3 "notifyBlocks({" src/inngest/employee-lifecycle.ts | grep "taskId"
      2. Assert: zero matches — taskId is baked into the factory, not passed per-call
    Expected Result: taskId and runId are only in the factory creation, not in individual calls
    Evidence: .sisyphus/evidence/task-5-no-duplication.txt
  ```

  **Commit**: YES
  - Message: `refactor(lifecycle): migrate all notification calls to createTaskNotifyBuilders factory`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 6. Unit tests for all changes

  **What to do**:
  - **Test 1: Newline normalization** — In a new or existing test file for `post-message.ts`, test that `parseArgs` normalizes `\\n` to real newlines in the `--text` argument. Call parseArgs with `['--channel', 'C123', '--text', 'Line1\\nLine2']` and assert `text` contains a real newline char
  - **Test 2: buildNotifyBlocks with runId** — Import `buildNotifyBlocks` and `buildNotifyStateBlocks` from `src/lib/slack-blocks.ts`. Call with `runId: '01KS10KM3J6JNYSX1HRFRE7HMY'` and assert the context block contains `Run \`01KS10KM3J6JNYSX1HRFRE7HMY\``
  - **Test 3: buildNotifyBlocks without runId** — Call without `runId` and assert context block only has `Task \`{id}\`` (backward compat)
  - **Test 4: buildNotifyStateBlocks with runId** — Same pattern as Test 2 but for the state blocks variant
  - **Test 5: createTaskNotifyBuilders factory** — Import `createTaskNotifyBuilders`. Call with `{ taskId: 'test-123', runId: '01KS10KM3J6JNYSX1HRFRE7HMY' }`. Assert returned `notifyBlocks` and `notifyStateBlocks` are functions. Call `notifyBlocks({ emoji: '✅', title: 'Test', body: 'body', channel: 'C123' })` (without `taskId`/`runId`) and assert output includes both `Task \`test-123\``and`Run \`01KS...\`` in the context block

  **Must NOT do**:
  - Do NOT modify production code in this task
  - Do NOT skip any of the 4 test areas

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all implementation tasks)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 3, 4, 5

  **References**:
  - `src/worker-tools/slack/post-message.ts` — Module under test for newline normalization
  - `src/lib/slack-blocks.ts` — Module under test for block builders
  - `tests/worker-tools/slack/post-message-thread-ts.test.ts` — Existing test file for post-message.ts (from previous plan). May add newline tests here or create a new file
  - `tests/worker-tools/slack/post-message-approval-gating.test.ts` — Another existing test file to follow patterns

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` passes with zero new failures
  - [ ] At least 5 new test cases covering the areas above

  **QA Scenarios**:

  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert: all pass, exit code 0
    Expected Result: All tests pass including new ones
    Evidence: .sisyphus/evidence/task-6-test-results.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for newline normalization and runId block building`
  - Files: `tests/` (multiple files)
  - Pre-commit: `pnpm test -- --run`

- [x] 7. Docker rebuild + E2E validation

  **What to do**:
  - Rebuild Docker image: `docker build -t ai-employee-worker:latest .`
  - Reseed DB: `pnpm prisma db seed`
  - Trigger `daily-motivation-quote` via admin API
  - Verify:
    1. Quote is threaded under the task notification (same `thread_ts`)
    2. Newlines render correctly (no literal `\n`)
    3. Inngest run ID appears in Slack messages as `Run \`01KS...\``
    4. `tasks.metadata` contains `inngest_run_id`
  - Cross-reference: get the run ID from the Slack message, check it matches in the Inngest dashboard

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`e2e-testing`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after T6)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1-6

  **References**:
  - Admin API: `POST /admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-motivation-quote/trigger`
  - Slack channel: `C0960S2Q8RL` (#victor-tests)
  - DB: `postgresql://postgres:postgres@localhost:54322/ai_employee`

  **Acceptance Criteria**:
  - [ ] Docker build succeeds
  - [ ] Task reaches `Done` state
  - [ ] Quote is threaded (not top-level)
  - [ ] Newlines render correctly in Slack
  - [ ] Run ID visible in Slack context block
  - [ ] `tasks.metadata->>'inngest_run_id'` is non-null

  **QA Scenarios**:

  ```
  Scenario: Full E2E — all 3 fixes verified
    Tool: Bash (curl + psql)
    Steps:
      1. Build Docker image
      2. Reseed DB
      3. Trigger daily-motivation-quote
      4. Poll until Done
      5. Query task metadata for inngest_run_id
      6. Verify Slack message threading and newlines
    Expected Result: All 3 issues resolved
    Evidence: .sisyphus/evidence/task-7-e2e-results.txt
  ```

  **Commit**: NO (E2E only)

- [x] 8. Notify completion via Telegram

  **What to do**:
  - Send: `npx tsx scripts/telegram-notify.ts "✅ threading-newlines-observability complete — All tasks done. Come back to review results."`

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

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Trigger `daily-motivation-quote` via admin API. Verify: (1) quote is threaded under task notification, (2) newlines render correctly (no literal `\n`), (3) Inngest run ID appears in every Slack message, (4) `tasks.metadata` contains `inngest_run_id`. Also check Inngest dashboard at `http://localhost:8288/runs` to verify the run ID matches. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Regression [CLEAN/N issues] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                   | Files                   | Pre-commit           |
| ------ | ----------------------------------------------------------------------------------------- | ----------------------- | -------------------- |
| 1      | `fix(slack): normalize \\n escape sequences in post-message.ts`                           | `post-message.ts`       | `tsc --noEmit`       |
| 2      | `docs(skills): add --thread-ts to post-message.ts in tool-usage-reference`                | `SKILL.md`              | —                    |
| 3      | `feat(slack-blocks): add runId to block builders and createTaskNotifyBuilders factory`    | `slack-blocks.ts`       | `tsc --noEmit`       |
| 4      | `feat(lifecycle): capture Inngest runId and store in task metadata`                       | `employee-lifecycle.ts` | `tsc --noEmit`       |
| 5      | `refactor(lifecycle): migrate all notification calls to createTaskNotifyBuilders factory` | `employee-lifecycle.ts` | `tsc --noEmit`       |
| 6      | `test: add tests for newline normalization and runId block building`                      | `tests/`                | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run          # Expected: all pass, zero new failures
tsc --noEmit                # Expected: zero errors
```

### Final Checklist

- [ ] `post-message.ts` normalizes `\\n` → real newlines
- [ ] SKILL.md documents `--thread-ts` for `post-message.ts`
- [ ] `buildNotifyBlocks` and `buildNotifyStateBlocks` accept `runId?`
- [ ] `createTaskNotifyBuilders` factory exported and used in lifecycle
- [ ] All 15 call sites migrated to factory — no direct `buildNotifyBlocks`/`buildNotifyStateBlocks` calls remain
- [ ] Lifecycle captures `runId` from handler context
- [ ] `tasks.metadata.inngest_run_id` populated for new tasks
- [ ] Every Slack message shows `Run \`{runId}\``
- [ ] All tests pass
- [ ] Docker image rebuilt
