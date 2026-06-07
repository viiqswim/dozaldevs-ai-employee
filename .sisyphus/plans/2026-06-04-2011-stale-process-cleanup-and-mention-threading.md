# Fix Stale Process Accumulation & Mention Threading

## TL;DR

> **Quick Summary**: Fix two bugs — (1) `dev.ts` spawns Inngest/Gateway/Dashboard with `detached: true` but never kills stale processes on restart, causing old code to intercept Inngest function executions; (2) Slack confirmation card for @mention-triggered tasks posts to main channel instead of threading under the original mention.
>
> **Deliverables**:
>
> - `dev.ts` preflight kill of stale Inngest, Gateway, and Dashboard processes before spawning new ones
> - AGENTS.md documentation of the stale process failure mode
> - `messageTs` threaded through `interaction-handler.ts → task.requested → slack-trigger-handler.ts` so confirmation cards thread correctly
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 + Task 2 (parallel) → Task 3 (AGENTS.md) → Final Wave

---

## Context

### Original Request

User sent "@Papi chulo cleaning schedule for June 5" in #ops-cleaning-schedule and got no response. Investigation revealed:

1. Three Inngest executor processes running simultaneously (from Tuesday, Wednesday, and today) — stale executors ran old code without send-acknowledgment fixes
2. After killing stale processes, the @mention flow worked but the confirmation card posted to the main channel instead of threading under the original mention

### Interview Summary

**Key Discussions**:

- User confirmed this stale process issue has occurred multiple times — wants a permanent fix
- User confirmed the threading bug (Image 1: confirmation card in main channel, Image 2: input collection worked correctly in thread after responding)
- User asked whether Inngest is the only affected service — answer: No, Gateway and Dashboard Vite also use `detached: true`

**Research Findings**:

- `dev.ts` line 535: Inngest spawned with `detached: true`
- `dev.ts` line 574: Gateway spawned with `detached: true`
- `dev.ts` line 782: Dashboard Vite spawned with `detached: true`
- `dev.ts` lines 481, 741: PostgREST and Cloudflare tunnels use `detached: false` — NOT affected
- `cleanup()` at line 130 correctly kills children on SIGINT/SIGTERM, but orphans survive when parent dies without signal (crash, force quit, tmux kill)
- `interaction-handler.ts` line 559-571: `emit-task-requested` sends `threadTs` but NOT `messageTs`
- `slack-trigger-handler.ts` line 158: `replyTs = threadTs ?? (event.data.ts as string | undefined)` — `event.data.ts` accesses a non-existent field, always undefined
- Stale Vite from Wednesday (PID 11596) was also found running alongside today's processes

### Metis Review

**Identified Gaps** (addressed):

- Kill strategy: Use process-name patterns (`pkill -f`), not port-based (`lsof`), to avoid killing unrelated services
- Must use `|| true` on all kill commands — "no process found" is not an error
- Must log warnings when stale processes are found (developer visibility)
- `messageTs` must also be added to the type cast in `slack-trigger-handler.ts` line 110-118
- Verify downstream `contextValue` JSON (line 197-204) stores `threadTs: replyTs` correctly
- `slack-input-collector.ts` has the same threading gap but is OUT OF SCOPE for this fix

---

## Work Objectives

### Core Objective

Prevent stale detached processes from accumulating across `pnpm dev` restarts, and ensure all Slack messages from @mention-triggered flows are threaded under the original mention.

### Concrete Deliverables

- Modified `scripts/dev.ts` with preflight kill step
- Modified `src/inngest/interaction-handler.ts` with `messageTs` in task.requested event
- Modified `src/inngest/slack-trigger-handler.ts` with `messageTs` type + fixed `replyTs`
- Updated `AGENTS.md` Known Issues section
- Updated tests if any exist for affected code paths

### Definition of Done

- [ ] `pnpm dev` kills stale Inngest/Gateway/Dashboard processes before spawning new ones
- [ ] @mention in main channel → confirmation card threads under the mention
- [ ] @mention in existing thread → confirmation card threads correctly (no regression)
- [ ] AGENTS.md documents the stale process failure mode

### Must Have

- Preflight kill of all 3 detached service types (Inngest, Gateway, Dashboard)
- Warning log when stale processes are detected and killed
- `messageTs` passed through task.requested event to slack-trigger-handler
- Confirmation card threaded under the original @mention for top-level mentions
- AGENTS.md Known Issues entry

### Must NOT Have (Guardrails)

- Do NOT touch `cleanup()` function — it handles SIGINT/SIGTERM correctly
- Do NOT touch `detached: false` processes (PostgREST tunnel, Cloudflare tunnel)
- Do NOT fix `slack-input-collector.ts` threading — out of scope
- Do NOT add `messageTs` to `employee/rule.extract-requested` event — out of scope
- Do NOT modify `handlers.ts` app_mention handler — it already correctly sets `messageTs: mention.ts`
- Do NOT kill processes by port number (`lsof -ti`) — use process name patterns
- Do NOT change the `detached: true` setting itself — it's needed so services survive parent restart

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (update existing test files if they test affected code)
- **Framework**: vitest

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Process management**: Use Bash — check `ps aux`, `pgrep`, process counts
- **Slack threading**: Use Bash (curl) — call `conversations.replies` API, assert `thread_ts` fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both fixes are independent):
├── Task 1: Preflight kill in dev.ts [quick]
└── Task 2: messageTs threading fix [quick]

Wave 2 (After Wave 1 — documentation):
└── Task 3: AGENTS.md Known Issues update [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks   | Wave |
| ---- | ---------- | -------- | ---- |
| 1    | —          | 3, F1-F4 | 1    |
| 2    | —          | 3, F1-F4 | 1    |
| 3    | 1, 2       | F1-F4    | 2    |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **1** — T3 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Add preflight kill of stale detached processes in dev.ts

  **What to do**:
  - Add a new "Step 0: Kill stale processes" section at the top of the main function body in `scripts/dev.ts`, BEFORE Step 1 (Docker Compose)
  - Use `execSync` (already imported) to kill stale processes by name pattern:
    ```typescript
    // Kill stale Inngest executors from previous dev sessions
    try {
      const staleInngest = execSync('pgrep -f "inngest-cli.*8288" || true', {
        encoding: 'utf8',
      }).trim();
      if (staleInngest) {
        const count = staleInngest.split('\n').filter(Boolean).length;
        warn(`Killing ${count} stale Inngest process(es) from previous session`);
        execSync('pkill -f "inngest-cli.*8288" || true');
      }
    } catch {
      /* ignore */
    }
    ```
  - Repeat for Gateway: pattern `"tsx.*watch.*server\\.ts"` (escaping the dot)
  - Repeat for Dashboard Vite: pattern `"vite.*${DASHBOARD_PORT}"` (using the port variable)
  - Add a 500ms sleep after all kills: `await new Promise(r => setTimeout(r, 500));`
  - Use `warn()` (already defined) for the log message — matches existing style
  - Do NOT touch `cleanup()` function or `detached: true` settings
  - Do NOT kill PostgREST tunnel or Cloudflare tunnel processes
  - All `pkill` commands must use `|| true` to handle "no process found" gracefully
  - The preflight section must also exclude its OWN PID from the kill list to avoid self-kill. Use: `pgrep -f "pattern" | grep -v "^${process.pid}$"` or let pkill handle it (pkill doesn't kill the calling process's parent by default, but be careful)
  - IMPORTANT: The `dev.ts` script itself runs via `tsx scripts/dev.ts` — the Gateway kill pattern `tsx.*watch.*server.ts` is distinct from `tsx scripts/dev.ts`, so no self-kill risk there. But verify with a dry run.

  **Must NOT do**:
  - Do NOT kill by port number (`lsof -ti :8288`)
  - Do NOT modify the `cleanup()` function
  - Do NOT change `detached: true` to `detached: false`
  - Do NOT touch Cloudflare tunnel or PostgREST tunnel spawning

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, ~20 lines of new code, clear pattern to follow (existing Docker cleanup at line 138)
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, Final Wave
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/dev.ts:130-162` — Existing `cleanup()` function shows the pattern for killing child processes with `process.kill(-child.pid, 'SIGTERM')`. The preflight kill uses a similar approach but with `execSync` + `pkill`.
  - `scripts/dev.ts:136-150` — Docker container cleanup at startup shows the exact pattern to follow: `execSync` in try/catch with `|| true` for graceful "nothing to kill" handling.

  **API/Type References**:
  - `scripts/dev.ts:41-47` — Color helpers and log functions (`warn()`, `ok()`, `info()`) — use `warn()` for stale process messages

  **WHY Each Reference Matters**:
  - The Docker cleanup pattern (line 136-150) is the EXACT pattern to follow — `execSync` inside try/catch, conditional logging, `|| true` for safe no-op.
  - The `warn()` function matches existing dev.ts UX for non-fatal warnings.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Preflight kill detects and removes stale Inngest processes
    Tool: Bash
    Preconditions: dev.ts running in ai-dev tmux session
    Steps:
      1. Read scripts/dev.ts and verify the preflight kill section exists before Step 1
      2. Verify the section uses `pkill -f` with process-name patterns, NOT port-based kill
      3. Verify patterns target: inngest-cli, tsx.*watch.*server.ts, vite.*DASHBOARD_PORT
      4. Verify all pkill commands use `|| true`
      5. Verify a `warn()` log is emitted when stale processes are found
      6. Run: pgrep -f "inngest-cli" | wc -l — verify exactly 1 process
    Expected Result: Code review passes, only 1 Inngest process running
    Evidence: .sisyphus/evidence/task-1-preflight-kill-code-review.txt

  Scenario: Preflight kill handles "no stale processes" gracefully
    Tool: Bash
    Preconditions: No stale processes running (only current dev session)
    Steps:
      1. Run: pkill -f "inngest-cli.*NONEXISTENT_PATTERN" || true
      2. Verify exit code is 0 (the || true ensures this)
      3. Read the preflight section and verify it won't crash when no stale processes exist
    Expected Result: No errors, script continues normally
    Evidence: .sisyphus/evidence/task-1-no-stale-graceful.txt
  ```

  **Commit**: YES
  - Message: `fix(dev): add preflight kill of stale detached processes on startup`
  - Files: `scripts/dev.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Thread confirmation card under original @mention message

  **What to do**:
  - In `src/inngest/interaction-handler.ts`, add `messageTs` to the `emit-task-requested` event payload (around line 568):

    ```typescript
    // BEFORE (line 559-572):
    if (intent === 'task') {
      await step.sendEvent('emit-task-requested', {
        name: 'employee/task.requested',
        data: {
          tenantId: context.tenantId,
          text,
          userId,
          channelId,
          archetypeId: context.archetypeId,
          threadTs,
          taskId: taskId ?? undefined,
        },
      });
    }

    // AFTER:
    if (intent === 'task') {
      await step.sendEvent('emit-task-requested', {
        name: 'employee/task.requested',
        data: {
          tenantId: context.tenantId,
          text,
          userId,
          channelId,
          archetypeId: context.archetypeId,
          threadTs,
          messageTs, // <-- ADD THIS LINE
          taskId: taskId ?? undefined,
        },
      });
    }
    ```

  - In `src/inngest/slack-trigger-handler.ts`:
    - Add `messageTs` to the type cast at line 110:
      ```typescript
      const { tenantId, text, userId, channelId, archetypeId, threadTs, messageTs, taskId } =
        event.data as {
          // ... existing fields ...
          messageTs?: string; // <-- ADD THIS
        };
      ```
    - Fix `replyTs` computation at line 158:
      ```typescript
      // BEFORE:
      const replyTs = threadTs ?? (event.data.ts as string | undefined);
      // AFTER:
      const replyTs = threadTs ?? messageTs;
      ```
    - Also pass `messageTs` through `validate-context` return (line 132): add `messageTs` to the return object
  - Update existing tests in `tests/inngest/interaction-handler.test.ts` if there's a test for the `emit-task-requested` event payload — add `messageTs` to expected payload
  - Update existing tests in `tests/inngest/slack-trigger-handler.test.ts` if they exist — add `messageTs` to mock event data and verify `thread_ts` is set on the confirmation card API call
  - Verify the `contextValue` JSON at line 197-204 stores `threadTs: replyTs` — this is already correct and doesn't need changes, just confirm

  **Must NOT do**:
  - Do NOT modify `handlers.ts` app_mention handler — it already correctly sets `messageTs: mention.ts`
  - Do NOT add `messageTs` to `employee/rule.extract-requested` event
  - Do NOT fix `slack-input-collector.ts` threading
  - Do NOT add employee-specific language to interaction-handler.ts (shared file)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 surgical edits across 2 files (+ test updates), all clear from investigation
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3, Final Wave
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/interaction-handler.ts:559-572` — The `emit-task-requested` event emission — this is WHERE to add `messageTs`
  - `src/inngest/interaction-handler.ts:23` — Where `messageTs` is destructured from `event.data` — confirms it's available
  - `src/inngest/slack-trigger-handler.ts:110-118` — The type cast for event.data — add `messageTs?: string` here
  - `src/inngest/slack-trigger-handler.ts:158` — The `replyTs` computation to fix: change `threadTs ?? (event.data.ts as string | undefined)` to `threadTs ?? messageTs`
  - `src/inngest/slack-trigger-handler.ts:197-204` — The `contextValue` JSON — verify `threadTs: replyTs` is correct (it is)
  - `src/inngest/slack-trigger-handler.ts:246-248` — Where `thread_ts: replyTs` is used in `chat.postMessage` — this will automatically thread correctly once `replyTs` is fixed

  **API/Type References**:
  - `src/gateway/slack/handlers.ts:346-360` — The `employee/interaction.received` event payload — confirms `messageTs: mention.ts` is already sent correctly from the gateway

  **Test References**:
  - `tests/inngest/interaction-handler.test.ts` — Existing tests for interaction handler — check if emit-task-requested payload is tested
  - `tests/inngest/slack-trigger-handler.test.ts` — Check if this file exists and has tests for confirmation card threading

  **WHY Each Reference Matters**:
  - Line 559-572 is the exact insertion point — add `messageTs` after `threadTs` on line 568
  - Line 158 is the exact line to fix — the old `event.data.ts` fallback never works
  - Line 197-204 confirms the downstream `contextValue` already stores `threadTs: replyTs` correctly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Confirmation card threads under top-level @mention
    Tool: Bash (curl)
    Preconditions: Gateway running, Slack Socket Mode connected, VLRE tenant configured
    Steps:
      1. Read src/inngest/interaction-handler.ts and verify `messageTs` is in the emit-task-requested payload
      2. Read src/inngest/slack-trigger-handler.ts and verify `replyTs = threadTs ?? messageTs` (not the old event.data.ts)
      3. Read src/inngest/slack-trigger-handler.ts and verify `messageTs?: string` is in the type cast
      4. Verify the Slack `chat.postMessage` call at line 246-248 includes `thread_ts: replyTs`
      5. Run: pnpm test -- --run -- tests/inngest/interaction-handler.test.ts — expect all pass
      6. Run: pnpm test -- --run -- tests/inngest/slack-trigger-handler.test.ts — expect all pass (or file doesn't exist)
    Expected Result: All code changes verified, tests pass
    Evidence: .sisyphus/evidence/task-2-threading-fix-verification.txt

  Scenario: @mention in existing thread still threads correctly (no regression)
    Tool: Bash
    Preconditions: Code changes applied
    Steps:
      1. Read src/inngest/slack-trigger-handler.ts line 158
      2. Verify that when threadTs IS defined (thread reply case), it takes precedence over messageTs
      3. Confirm: `replyTs = threadTs ?? messageTs` — threadTs wins when present
    Expected Result: Thread-reply case unchanged, threadTs takes priority
    Evidence: .sisyphus/evidence/task-2-no-thread-regression.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): thread confirmation card under original mention message`
  - Files: `src/inngest/interaction-handler.ts`, `src/inngest/slack-trigger-handler.ts`, `tests/inngest/interaction-handler.test.ts`, `tests/inngest/slack-trigger-handler.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Document stale process failure mode in AGENTS.md

  **What to do**:
  - Add a new entry to the "Known Issues" section of `AGENTS.md` (after entry #3):

    ````markdown
    ### 4. Stale detached processes from previous `pnpm dev` sessions

    **Symptom**: @mention or webhook triggers produce no Slack response, or produce responses from old/stale code (missing recent fixes). Gateway logs show the event was received and Inngest function initialized, but step output logs are missing or show old behavior.

    **Root cause**: `dev.ts` spawns Inngest, Gateway, and Dashboard with `detached: true`. If the parent `dev.ts` process dies without a clean SIGINT/SIGTERM (tmux session killed, terminal closed, `kill -9`, crash), the detached children survive as orphans. On the next `pnpm dev`, new processes spawn alongside the stale ones. Inngest executors from previous sessions intercept function executions and run old code.

    **Diagnosis**:

    ```bash
    # Count Inngest executors (should be exactly 1)
    pgrep -f "inngest-cli.*8288" | wc -l

    # List all dev-related processes with start times
    ps aux | grep -E "inngest-cli|tsx.*server|vite" | grep -v grep
    ```
    ````

    **Fix**: `dev.ts` now includes a preflight kill step that detects and kills stale processes on startup. If you still see stale processes, kill them manually:

    ```bash
    pkill -f "inngest-cli.*8288" || true
    pkill -f "tsx.*watch.*server.ts" || true
    pkill -f "vite.*7701" || true
    ```

    **Prevention**: Always stop `pnpm dev` with Ctrl+C (SIGINT) — never kill the tmux session directly. If you must kill the session, first run the manual kill commands above.

    ```

    ```

  - Ensure the new entry number (4) doesn't conflict with existing entries

  **Must NOT do**:
  - Do NOT restructure or rewrite other Known Issues entries
  - Do NOT add employee-specific language

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single markdown file edit, documentation only
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Final Wave
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `AGENTS.md` — "Known Issues" section (search for `## Known Issues`) — this is WHERE to add the new entry
  - Existing entries #1 (ngrok), #2 (Slack OAuth), #3 (Inngest step output contamination) — follow the same format

  **WHY Each Reference Matters**:
  - Must match the existing Known Issues format: symptom → root cause → diagnosis → fix → prevention

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md contains stale process documentation
    Tool: Bash (grep)
    Preconditions: Task 3 commit applied
    Steps:
      1. grep -c "Stale detached processes" AGENTS.md — expect 1
      2. grep -c "pkill.*inngest-cli" AGENTS.md — expect >= 1
      3. grep -c "pgrep.*inngest-cli.*wc" AGENTS.md — expect >= 1
      4. Verify the entry appears in the Known Issues section
    Expected Result: Documentation present and searchable
    Evidence: .sisyphus/evidence/task-3-agents-md-verification.txt
  ```

  **Commit**: YES
  - Message: `docs: document stale process failure mode in Known Issues`
  - Files: `AGENTS.md`
  - Pre-commit: none

- [x] 4. **Notify completion** — Send Telegram: `tsx scripts/telegram-notify.ts "✅ stale-process-cleanup-and-mention-threading complete — All tasks done. Come back to review results."`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check for AI slop.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1**: `fix(dev): add preflight kill of stale detached processes on startup` — `scripts/dev.ts`
- **Commit 2**: `fix(slack): thread confirmation card under original mention message` — `src/inngest/interaction-handler.ts`, `src/inngest/slack-trigger-handler.ts`, tests
- **Commit 3**: `docs: document stale process failure mode in Known Issues` — `AGENTS.md`

---

## Success Criteria

### Verification Commands

```bash
# Stale process fix: run dev.ts twice, verify no orphans
pgrep -f "inngest-cli" | wc -l  # Expected: 1 (only the current one)

# Threading fix: @mention in channel, verify thread_ts in confirmation card
source .env
curl -s "https://slack.com/api/conversations.replies" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
  -d "channel=C0B71QSMZKQ&ts=<MENTION_TS>&limit=5" | jq '.messages | length'
# Expected: >= 2 (mention + confirmation card reply)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] AGENTS.md updated
- [ ] Telegram notification sent
