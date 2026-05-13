# E2E Scenario A Fixes — Thread UID, WORKER_RUNTIME, Status Log, Named Tunnel

## TL;DR

> **Quick Summary**: Fix four issues discovered during E2E Scenario A testing: model confusing lead/thread UIDs, confusing dual env var system for worker dispatch, missing Delivering→Done status log entry, and rotating PostgREST tunnel URL.
>
> **Deliverables**:
>
> - Strengthened archetype instructions + validation guard preventing lead/thread UID confusion
> - Single `WORKER_RUNTIME=docker|fly` env var replacing `USE_LOCAL_DOCKER` + `USE_FLY_HYBRID`
> - Complete `task_status_log` trace including Delivering→Done and Failed transitions from harness
> - Stable `postgrest-ai-employee.dozaldevs.com` named tunnel replacing rotating quick tunnel
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves + final verification
> **Critical Path**: T1/T2/T3/T4 (parallel) → T5/T6 (integration) → T7/T8 (build+test) → T9 (E2E) → F1-F4

---

## Context

### Original Request

Fix four non-blocking issues discovered during the E2E Scenario A happy-path test of the guest-messaging pipeline (task `b24655be-e753-4d84-8b04-646af144cc1c`):

1. **Thread UID bug** — Worker passed lead UID as `--thread-uid` to `post-guest-approval.ts`
2. **Env var confusion** — `USE_LOCAL_DOCKER` / `USE_FLY_HYBRID` system is confusing; simplify to one variable
3. **Missing status log** — `Delivering → Done` not in `task_status_log`
4. **Tunnel rotation** — PostgREST quick tunnel URL rotates on restart

### Interview Summary

**Key Discussions**:

- Issue 2 originally not a bug, but user requested simplification of the env var system
- User chose `WORKER_RUNTIME=docker|fly` as the single replacement variable
- User chose tests-after-implementation strategy (vitest)

**Research Findings**:

- Thread UID bug is model confusion, not code bug — `get-messages.ts` outputs both fields correctly, lifecycle injects `THREAD_UID` env var correctly
- `USE_LOCAL_DOCKER` appears in 6 locations in `employee-lifecycle.ts`, 4 in `dev.ts`, 1 in `dev-e2e.ts`, 4 in tests
- PostgREST client has a `post()` method at `postgrest-client.ts:61` — confirmed compatible for status log insert
- Named tunnel `e160ac6d` already exists with credentials at `~/.cloudflared/`, currently serves gateway only

### Metis Review

**Identified Gaps** (addressed):

- `markFailed` in harness also missing status log — included in Issue 3 scope
- Live archetype in DB must be updated (not just seed file) — re-seed step included
- `WORKER_RUNTIME` default when unset must be defined — defaults to `docker` for safe local dev
- Quick tunnel code in `dev.ts` should be kept as fallback for contributors without named tunnel
- Deprecated `lifecycle.ts` references `USE_LOCAL_DOCKER`/`USE_FLY_HYBRID` — intentionally left alone

---

## Work Objectives

### Core Objective

Fix four E2E observability and DX issues to make the guest-messaging pipeline more reliable and the local dev environment simpler.

### Concrete Deliverables

- Updated archetype instructions in `prisma/seed.ts` + `post-guest-approval.ts` validation guard
- `WORKER_RUNTIME=docker|fly` env var in `employee-lifecycle.ts`, `dev.ts`, `dev-e2e.ts`, `.env`, `.env.example`
- `task_status_log` inserts for Done and Failed transitions in `opencode-harness.mts`
- Named Cloudflare tunnel config at `postgrest-ai-employee.dozaldevs.com`
- Updated `AGENTS.md` documenting all changes
- Unit tests for env var logic and status log

### Definition of Done

- [ ] `grep -rn "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/inngest/employee-lifecycle.ts` → 0 matches
- [ ] `grep -rn "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" scripts/dev.ts` → 0 matches
- [ ] `curl -s https://postgrest-ai-employee.dozaldevs.com/rest/v1/` → HTTP 200
- [ ] E2E Scenario A re-run: `pending_approvals.thread_uid != pending_approvals.lead_uid`
- [ ] E2E Scenario A re-run: `task_status_log` includes `Delivering → Done` row with `actor = 'opencode_harness'`
- [ ] `pnpm test -- --run` → all existing tests pass + new tests pass

### Must Have

- Single `WORKER_RUNTIME` variable completely replacing both `USE_LOCAL_DOCKER` and `USE_FLY_HYBRID`
- Status log entries for BOTH `Done` and `Failed` transitions from the delivery harness
- Stable PostgREST tunnel URL that survives restarts
- Thread UID/lead UID distinction made unambiguous in archetype instructions

### Must NOT Have (Guardrails)

- DO NOT touch `src/inngest/lifecycle.ts` (deprecated — reads old vars, will never run)
- DO NOT modify `get-messages.ts` output shape — the `threadUid` field is already correct
- DO NOT remove the quick-tunnel fallback block in `dev.ts` — keep it for contributors without the named tunnel
- DO NOT add validation that silently swaps `leadUid`/`threadUid` — fail loudly so the model learns
- DO NOT make the `task_status_log` insert block `process.exit(0)` — wrap in try/catch, non-fatal
- DO NOT update the Summarizer archetype instructions — thread/lead UID is guest-messaging-specific
- DO NOT update any docs in `docs/snapshots/` or `docs/phases/` — these are immutable historical records

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Config/infra**: Use Bash (curl, grep) — verify URLs respond, env vars are set correctly
- **Code changes**: Use Bash (pnpm test) — verify existing tests pass, new tests pass
- **E2E**: Use Bash (curl to PostgREST) — verify DB state after pipeline run

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — core code changes, all independent):
├── Task 1: Thread UID instructions + validation guard [quick]
├── Task 2: Status log insert for Done + Failed [quick]
├── Task 3: WORKER_RUNTIME in employee-lifecycle.ts [quick]
└── Task 4: PostgREST named tunnel infra [quick]

Wave 2 (After Wave 1 — integration + shared files):
├── Task 5: dev.ts + dev-e2e.ts overhaul (depends: T3, T4) [unspecified-high]
├── Task 6: Config + docs — .env, .env.example, AGENTS.md (depends: T3, T4, T5) [quick]
├── Task 7: Re-seed database + Docker rebuild (depends: T1, T2) [quick]
└── Task 8: Test file updates — setup.ts + lifecycle tests (depends: T3) [quick]

Wave 3 (After Wave 2 — verification):
├── Task 9: Unit tests for new changes (depends: T2, T3, T5, T8) [unspecified-high]
└── Task 10: E2E Scenario A re-validation (depends: all) [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On     | Blocks         | Wave |
| ---- | -------------- | -------------- | ---- |
| T1   | —              | T7             | 1    |
| T2   | —              | T7, T9         | 1    |
| T3   | —              | T5, T6, T8, T9 | 1    |
| T4   | —              | T5, T6         | 1    |
| T5   | T3, T4         | T6, T9, T10    | 2    |
| T6   | T3, T4, T5     | T10            | 2    |
| T7   | T1, T2         | T10            | 2    |
| T8   | T3             | T9             | 2    |
| T9   | T2, T3, T5, T8 | T10            | 3    |
| T10  | all            | F1-F4          | 3    |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `quick`
- **Wave 2**: **4** — T5 → `unspecified-high`, T6 → `quick`, T7 → `quick`, T8 → `quick`
- **Wave 3**: **2** — T9 → `unspecified-high`, T10 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Strengthen thread UID archetype instructions + add validation guard

  **What to do**:
  - In `prisma/seed.ts`, find the `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant (around line 274). Locate the Step 5 command template (around lines 341-342) where `--lead-uid` and `--thread-uid` are specified.
  - Add a `CRITICAL` warning block directly above the `post-guest-approval.ts` command template that explicitly states:
    ```
    CRITICAL: --lead-uid and --thread-uid are DIFFERENT UUIDs from DIFFERENT fields.
    - --lead-uid = threadObj.leadUid (the reservation/lead identifier, e.g. 29a64abd-...)
    - --thread-uid = threadObj.threadUid (the message thread identifier, e.g. aef3d0cf-...)
    These are NEVER the same value. If you find yourself passing the same UUID to both flags, STOP — you have the wrong value.
    ```
  - Also update the `--thread-uid` placeholder in the command template from `"<threadUid>"` to `"<threadUid from threadObj.threadUid — the THREAD identifier, NOT the lead>"` for maximum clarity.
  - In `src/worker-tools/slack/post-guest-approval.ts`, add a validation guard after argument parsing (after the `params` object is constructed, before the Slack API call). If `params.leadUid === params.threadUid` and both are non-empty, log a stderr warning: `[post-guest-approval] WARNING: --lead-uid and --thread-uid are identical (${params.leadUid}). This is likely a model error — these should be different UUIDs.` Do NOT exit — continue execution so the approval card is still posted, but the warning makes the bug visible in worker logs.

  **Must NOT do**:
  - DO NOT modify `get-messages.ts` output shape
  - DO NOT add logic that silently swaps or auto-corrects the UIDs
  - DO NOT touch the Summarizer archetype instructions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small targeted changes to two files — seed data + one validation guard
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None applicable

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Task 7 (re-seed)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:274-367` — `VLRE_GUEST_MESSAGING_INSTRUCTIONS` constant — the full archetype instructions text. Lines 341-342 have the `--lead-uid` / `--thread-uid` command template. Line 324 has an existing CRITICAL warning about `leadUid` vs `$TASK_ID` that can be used as the pattern for the new warning.
  - `src/worker-tools/slack/post-guest-approval.ts:394-409` — Where `params.threadUid` is used to construct `conversation_ref` and written to `/tmp/approval-message.json`

  **API/Type References**:
  - `src/worker-tools/slack/post-guest-approval.ts:180-220` — Argument parsing with `parseArgs()` — the `params` object with `leadUid`, `threadUid`, `messageUid` etc.

  **External References**:
  - E2E evidence: Worker log showed `--thread-uid "29a64abd-..."` (lead UID) instead of `"aef3d0cf-..."` (thread UID) — all four flags identical

  **WHY Each Reference Matters**:
  - `seed.ts:324` — Shows the existing CRITICAL warning pattern to replicate
  - `seed.ts:341-342` — The exact command template lines to update with more explicit placeholders
  - `post-guest-approval.ts:180-220` — Where to insert the validation guard after args are parsed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify seed instructions contain the new CRITICAL warning
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. Run: grep -c "lead-uid and --thread-uid are DIFFERENT" prisma/seed.ts
      2. Assert count >= 1
      3. Run: grep -c "NEVER the same value" prisma/seed.ts
      4. Assert count >= 1
    Expected Result: Both grep commands return count >= 1
    Failure Indicators: Count is 0 for either grep
    Evidence: .sisyphus/evidence/task-1-instructions-warning.txt

  Scenario: Verify validation guard detects identical UIDs
    Tool: Bash (grep)
    Preconditions: post-guest-approval.ts has been edited
    Steps:
      1. Run: grep -c "lead-uid and --thread-uid are identical" src/worker-tools/slack/post-guest-approval.ts
      2. Assert count >= 1
      3. Verify the guard does NOT call process.exit — run: grep -A3 "lead-uid and --thread-uid are identical" src/worker-tools/slack/post-guest-approval.ts
      4. Assert output does NOT contain "process.exit"
    Expected Result: Warning exists, does not exit
    Failure Indicators: No warning found, or process.exit found nearby
    Evidence: .sisyphus/evidence/task-1-validation-guard.txt

  Scenario: Verify build still passes after changes
    Tool: Bash
    Preconditions: Both files edited
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Clean TypeScript compilation
    Failure Indicators: Type errors or syntax errors
    Evidence: .sisyphus/evidence/task-1-build-check.txt
  ```

  **Commit**: YES
  - Message: `fix(guest-messaging): strengthen thread UID instructions and add validation guard`
  - Files: `prisma/seed.ts`, `src/worker-tools/slack/post-guest-approval.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Add task_status_log entries for Done and Failed transitions in delivery harness

  **What to do**:
  - In `src/workers/opencode-harness.mts`, find the delivery phase completion block (around lines 496-503) where the harness patches the task to `Done` via `db.patch('tasks', ...)`.
  - Immediately after the `db.patch()` call (before `log.info` and `process.exit(0)`), add a try/catch-wrapped `task_status_log` insert:
    ```ts
    try {
      await db.post('task_status_log', {
        task_id: TASK_ID,
        from_status: 'Delivering',
        to_status: 'Done',
        actor: 'opencode_harness',
      });
    } catch (err) {
      log.warn({ err }, '[opencode-harness] Failed to log Delivering→Done transition (non-fatal)');
    }
    ```
  - Find the `markFailed` function (around line 74) in the same file. After the `db.patch('tasks', ...)` that sets status to `Failed`, add the same pattern:
    ```ts
    try {
      await db.post('task_status_log', {
        task_id: TASK_ID,
        from_status: currentStatus ?? 'unknown',
        to_status: 'Failed',
        actor: 'opencode_harness',
      });
    } catch (err) {
      log.warn({ err }, '[opencode-harness] Failed to log status transition to Failed (non-fatal)');
    }
    ```
    Note: `currentStatus` may not be available in `markFailed`'s scope — check what the function receives. If it doesn't have the previous status, use `'Delivering'` as a reasonable default since `markFailed` in the delivery context is always from `Delivering`.
  - The `actor` value `'opencode_harness'` is intentionally different from the lifecycle's `'lifecycle_fn'` to distinguish machine-initiated transitions.

  **Must NOT do**:
  - DO NOT let the `task_status_log` insert block `process.exit(0)` — the try/catch ensures this
  - DO NOT modify `src/workers/lib/completion.ts` — that's for the execution phase, not delivery

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small, well-defined changes to a single file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 7 (Docker rebuild), Task 9 (tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/workers/lib/completion.ts:81-93` — Existing pattern for `task_status_log` insert from the execution phase harness. Follow this exact pattern but use `actor: 'opencode_harness'` instead of `'machine'`.
  - `src/inngest/employee-lifecycle.ts:55-77` — `logStatusTransition()` function showing the lifecycle's approach (uses `actor: 'lifecycle_fn'`). The harness pattern differs because it uses PostgREST client, not raw fetch.

  **API/Type References**:
  - `src/workers/lib/postgrest-client.ts:61-78` — `post(table, body)` method signature — takes `Record<string, unknown>`, returns `unknown | null`, wraps errors with `log.warn`.

  **WHY Each Reference Matters**:
  - `completion.ts:81-93` — The canonical pattern for status log insert from worker context
  - `postgrest-client.ts:61` — Confirms `db.post()` method exists and accepts the shape we need
  - `employee-lifecycle.ts:55` — Shows actor naming convention (`lifecycle_fn`) so we pick a different value

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify Done transition log insert exists in harness
    Tool: Bash (grep)
    Preconditions: opencode-harness.mts has been edited
    Steps:
      1. Run: grep -c "to_status.*Done.*opencode_harness\|opencode_harness.*to_status.*Done" src/workers/opencode-harness.mts
      2. If that returns 0, try: grep -A5 "to_status.*Done" src/workers/opencode-harness.mts
      3. Assert the block includes actor: 'opencode_harness' and from_status: 'Delivering'
    Expected Result: Status log insert with correct actor and from_status
    Failure Indicators: No match found
    Evidence: .sisyphus/evidence/task-2-done-log-insert.txt

  Scenario: Verify Failed transition log insert exists in markFailed
    Tool: Bash (grep)
    Preconditions: opencode-harness.mts has been edited
    Steps:
      1. Run: grep -A10 "markFailed" src/workers/opencode-harness.mts | grep -c "task_status_log"
      2. Assert count >= 1
    Expected Result: markFailed also inserts into task_status_log
    Failure Indicators: No task_status_log reference in markFailed
    Evidence: .sisyphus/evidence/task-2-failed-log-insert.txt

  Scenario: Verify try/catch wrapping (non-fatal)
    Tool: Bash (grep)
    Preconditions: opencode-harness.mts has been edited
    Steps:
      1. Run: grep -B2 "task_status_log" src/workers/opencode-harness.mts | grep -c "try"
      2. Assert count >= 2 (one for Done path, one for Failed path)
    Expected Result: Both inserts wrapped in try/catch
    Failure Indicators: Missing try/catch — would block process.exit
    Evidence: .sisyphus/evidence/task-2-try-catch-wrap.txt

  Scenario: Build check
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-2-build-check.txt
  ```

  **Commit**: YES
  - Message: `fix(harness): add task_status_log entries for Done and Failed transitions`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

- [x] 3. Replace USE_LOCAL_DOCKER / USE_FLY_HYBRID with WORKER_RUNTIME in employee-lifecycle.ts

  **What to do**:
  - Replace ALL 6 references to the old env vars in `src/inngest/employee-lifecycle.ts` with the new `WORKER_RUNTIME` variable:

    | Line  | Old Code                                                                  | New Code                                                                    |
    | ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
    | ~371  | `process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl` | `process.env.WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl` |
    | ~480  | `if (process.env.USE_LOCAL_DOCKER === '1')`                               | `if (process.env.WORKER_RUNTIME !== 'fly')`                                 |
    | ~1677 | `process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl` | `process.env.WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl` |
    | ~1681 | `if (attempt > 0 && process.env.USE_LOCAL_DOCKER === '1')`                | `if (attempt > 0 && process.env.WORKER_RUNTIME !== 'fly')`                  |
    | ~1685 | `if (process.env.USE_LOCAL_DOCKER === '1')`                               | `if (process.env.WORKER_RUNTIME !== 'fly')`                                 |
    | ~1740 | `if (process.env.USE_LOCAL_DOCKER !== '1')`                               | `if (process.env.WORKER_RUNTIME === 'fly')`                                 |

  - **Default behavior**: When `WORKER_RUNTIME` is unset, the dispatch should default to Docker (local). This means the condition `WORKER_RUNTIME !== 'fly'` correctly defaults to Docker when the var is undefined/empty. This is the SAFE default for local dev.
  - **Do NOT inject `WORKER_RUNTIME` into the worker machine env** — the worker doesn't need to know its dispatch mode. Only inject `USE_FLY_HYBRID` → nothing and `USE_LOCAL_DOCKER` → nothing (remove from machine env if present).
  - After making all 6 replacements, verify no old references remain: `grep -n "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/inngest/employee-lifecycle.ts` should return 0 results.

  **Must NOT do**:
  - DO NOT touch `src/inngest/lifecycle.ts` (deprecated — line 30-31 reference old vars, leave them)
  - DO NOT change the dispatch logic behavior — only the variable name. Docker dispatch must work the same, Fly.io dispatch must work the same.
  - DO NOT add a new env var to the worker machine environment — `WORKER_RUNTIME` is a gateway-side concern only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical find-and-replace across known locations in one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5, 6, 8, 9
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:371` — First `USE_FLY_HYBRID` check (dispatch-machine step, SUPABASE_URL substitution)
  - `src/inngest/employee-lifecycle.ts:480` — `USE_LOCAL_DOCKER` check (Docker vs Fly.io dispatch branch)
  - `src/inngest/employee-lifecycle.ts:1677` — Second `USE_FLY_HYBRID` check (delivery phase, SUPABASE_URL substitution)
  - `src/inngest/employee-lifecycle.ts:1681` — `USE_LOCAL_DOCKER` check (delivery retry logic)
  - `src/inngest/employee-lifecycle.ts:1685` — `USE_LOCAL_DOCKER` check (delivery Docker dispatch)
  - `src/inngest/employee-lifecycle.ts:1740` — `USE_LOCAL_DOCKER` negation check (delivery Fly.io poll)

  **WHY Each Reference Matters**:
  - All 6 locations must be updated for the refactor to be complete. Missing even one creates a broken half-migrated state where some code reads old vars and some reads new.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No old env var references remain in employee-lifecycle.ts
    Tool: Bash (grep)
    Preconditions: employee-lifecycle.ts has been edited
    Steps:
      1. Run: grep -n "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/inngest/employee-lifecycle.ts
      2. Assert: output is empty (exit code 1 = no matches)
    Expected Result: 0 matches — all old vars replaced
    Failure Indicators: Any line number in output means a reference was missed
    Evidence: .sisyphus/evidence/task-3-no-old-vars.txt

  Scenario: New WORKER_RUNTIME references are correct
    Tool: Bash (grep)
    Preconditions: employee-lifecycle.ts has been edited
    Steps:
      1. Run: grep -c "WORKER_RUNTIME" src/inngest/employee-lifecycle.ts
      2. Assert count = 6
    Expected Result: Exactly 6 references to WORKER_RUNTIME
    Failure Indicators: Count != 6 means a replacement was missed or extra ones were added
    Evidence: .sisyphus/evidence/task-3-new-var-count.txt

  Scenario: Deprecated lifecycle.ts was NOT touched
    Tool: Bash (git)
    Preconditions: All edits done
    Steps:
      1. Run: git diff --name-only src/inngest/lifecycle.ts
      2. Assert: output is empty
    Expected Result: File unchanged
    Failure Indicators: File shows as modified
    Evidence: .sisyphus/evidence/task-3-deprecated-untouched.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-3-build-check.txt
  ```

  **Commit**: YES
  - Message: `refactor(lifecycle): replace USE_LOCAL_DOCKER/USE_FLY_HYBRID with WORKER_RUNTIME`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Configure PostgREST named tunnel on dozaldevs.com

  **What to do**:
  - This task sets up the Cloudflare DNS and tunnel config. It does NOT touch source code (that's Task 5).
  - **Step 1 — Add DNS CNAME**: Run `cloudflared tunnel route dns e160ac6d postgrest-ai-employee.dozaldevs.com`. This creates a CNAME record in Cloudflare DNS pointing to the tunnel.
  - **Step 2 — Update tunnel config**: Edit `~/.cloudflared/ai-employee-local.yml` to add the PostgREST ingress rule:

    ```yaml
    tunnel: e160ac6d-2d7d-47c4-a552-b13700947d29
    credentials-file: /Users/victordozal/.cloudflared/e160ac6d-2d7d-47c4-a552-b13700947d29.json

    ingress:
      - hostname: local-ai-employee.dozaldevs.com
        service: http://localhost:7700
      - hostname: postgrest-ai-employee.dozaldevs.com
        service: http://localhost:54331
      - service: http_status:404
    ```

  - **Step 3 — Restart the tunnel**: If a `cloudflared` process is running the named tunnel, it needs to be restarted to pick up the new config. Kill and restart: `cloudflared tunnel --config ~/.cloudflared/ai-employee-local.yml run`
  - **Step 4 — Verify**: Wait up to 60 seconds for DNS propagation, then: `curl -s -o /dev/null -w "%{http_code}" https://postgrest-ai-employee.dozaldevs.com/rest/v1/` should return HTTP 200 (or 401 if anon key is required). Any response other than connection timeout means the tunnel is working.
  - **Step 5 — Update `.env`**: Set `TUNNEL_URL=https://postgrest-ai-employee.dozaldevs.com` permanently. This value will no longer change.

  **Must NOT do**:
  - DO NOT modify `dev.ts` or any source code in this task (that's Task 5)
  - DO NOT delete the existing gateway ingress rule — only ADD the PostgREST rule
  - DO NOT create a new tunnel — reuse the existing `e160ac6d` tunnel

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Infrastructure config — CLI commands + YAML edit + env var set
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `~/.cloudflared/ai-employee-local.yml` — Current named tunnel config with single ingress rule (gateway only)
  - `~/.cloudflared/e160ac6d-2d7d-47c4-a552-b13700947d29.json` — Credentials file (must not be modified)

  **API/Type References**:
  - `src/lib/tunnel-client.ts` — `getTunnelUrl()` reads `TUNNEL_URL` env var. No code change needed — once `.env` has the stable URL, it works.

  **External References**:
  - Cloudflare Tunnel docs: `cloudflared tunnel route dns` creates CNAME records
  - Current PostgREST port: `54331` (Kong/API gateway in Docker Compose, NOT `54321`)

  **WHY Each Reference Matters**:
  - `ai-employee-local.yml` — Must know the existing config to add (not replace) the ingress rule
  - `tunnel-client.ts` — Confirms no code change needed, just env var

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Named tunnel serves PostgREST
    Tool: Bash (curl)
    Preconditions: DNS CNAME created, tunnel config updated, tunnel restarted
    Steps:
      1. Wait 30 seconds for DNS propagation
      2. Run: curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://postgrest-ai-employee.dozaldevs.com/rest/v1/
      3. Assert: HTTP status is 200 or 401 (not timeout/connection refused)
    Expected Result: PostgREST responds via the named tunnel
    Failure Indicators: Connection timeout or refused — DNS not propagated or tunnel not running
    Evidence: .sisyphus/evidence/task-4-tunnel-responds.txt

  Scenario: Gateway tunnel still works
    Tool: Bash (curl)
    Preconditions: Tunnel restarted with new config
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://local-ai-employee.dozaldevs.com/health
      2. Assert: HTTP 200
    Expected Result: Gateway still accessible — adding PostgREST didn't break the existing route
    Failure Indicators: Timeout or 404
    Evidence: .sisyphus/evidence/task-4-gateway-still-works.txt

  Scenario: TUNNEL_URL updated in .env
    Tool: Bash (grep)
    Steps:
      1. Run: grep "^TUNNEL_URL=" .env
      2. Assert: value is "https://postgrest-ai-employee.dozaldevs.com"
    Expected Result: Stable URL set
    Failure Indicators: Still a trycloudflare.com URL or empty
    Evidence: .sisyphus/evidence/task-4-env-tunnel-url.txt
  ```

  **Commit**: NO (infra config only — `~/.cloudflared/` is outside the repo, `.env` is gitignored)

- [x] 5. Update dev.ts and dev-e2e.ts for WORKER_RUNTIME + stable tunnel detection

  **What to do**:
  - **`scripts/dev.ts`** — 5 changes:
    1. **Line ~66-69** (log messages): Replace `USE_FLY_HYBRID=1` references in log output with `WORKER_RUNTIME=fly`.
    2. **Line ~447** (PostgREST tunnel startup): Replace `process.env.USE_FLY_HYBRID === '1'` with `process.env.WORKER_RUNTIME === 'fly'`. Inside this block, add a check: if `TUNNEL_URL` is already set AND does NOT contain `trycloudflare.com`, skip the quick-tunnel spawn entirely and log: `'PostgREST tunnel: using stable URL from TUNNEL_URL (skipping quick tunnel)'`. If `TUNNEL_URL` contains `trycloudflare.com` or is empty, proceed with the existing quick-tunnel spawn logic as fallback.
    3. **Line ~556** (gateway env injection): Replace `USE_LOCAL_DOCKER: process.env.USE_FLY_HYBRID === '1' ? '0' : '1'` with `WORKER_RUNTIME: process.env.WORKER_RUNTIME || 'docker'`. This passes the `WORKER_RUNTIME` value through to the gateway process (which hosts the Inngest lifecycle). Default to `'docker'` when unset.
    4. **Line ~766** (summary log): Replace `USE_FLY_HYBRID` references with `WORKER_RUNTIME`.
    5. Remove any remaining `USE_LOCAL_DOCKER` or `USE_FLY_HYBRID` strings from log messages or comments in the file.
  - **`scripts/dev-e2e.ts`** — 1 change:
    1. **Line ~375**: Replace `USE_LOCAL_DOCKER: '1'` with `WORKER_RUNTIME: 'docker'` in the gateway env.
  - After all changes, verify: `grep -n "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" scripts/dev.ts scripts/dev-e2e.ts` returns 0 results.
  - **IMPORTANT**: Keep the quick-tunnel spawn logic intact as a fallback — do NOT delete it. Other contributors who don't have the named tunnel need it. Just add the stable-URL detection before it.

  **Must NOT do**:
  - DO NOT remove the quick-tunnel spawn block — keep it as fallback
  - DO NOT change the tunnel URL detection logic in the existing liveness check (lines ~453-461) — that already works correctly

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple coordinated changes across two files with logic changes to the tunnel detection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
  - **Blocks**: Tasks 6, 9, 10
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `scripts/dev.ts:66-69` — Log messages referencing `USE_FLY_HYBRID`
  - `scripts/dev.ts:447-508` — PostgREST quick tunnel startup block — the entire block needs the condition change + stable URL detection
  - `scripts/dev.ts:453-461` — Existing liveness check for `TUNNEL_URL` — this already checks if the URL is alive and skips spawning. The stable URL detection should go BEFORE this check.
  - `scripts/dev.ts:556` — Gateway env injection — the `USE_LOCAL_DOCKER: ...` computation line
  - `scripts/dev.ts:766` — Summary log message
  - `scripts/dev-e2e.ts:375` — Gateway env for E2E

  **WHY Each Reference Matters**:
  - `dev.ts:447-508` — The most complex change; need to add stable URL detection without breaking the fallback
  - `dev.ts:556` — The line that overrides `USE_LOCAL_DOCKER` — must be replaced with `WORKER_RUNTIME` passthrough
  - `dev-e2e.ts:375` — Small but critical — E2E must also use the new variable

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No old env var references in dev scripts
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" scripts/dev.ts scripts/dev-e2e.ts
      2. Assert: output is empty (exit code 1)
    Expected Result: 0 old var references
    Failure Indicators: Any match means a reference was missed
    Evidence: .sisyphus/evidence/task-5-no-old-vars.txt

  Scenario: WORKER_RUNTIME is passed to gateway env
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A1 "WORKER_RUNTIME" scripts/dev.ts | head -5
      2. Assert: contains WORKER_RUNTIME in the gateway env object
    Expected Result: WORKER_RUNTIME appears in gateway env injection
    Evidence: .sisyphus/evidence/task-5-gateway-env.txt

  Scenario: Stable URL detection exists
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "trycloudflare.com" scripts/dev.ts
      2. Assert count >= 1 (the stable URL detection check)
    Expected Result: The script checks whether TUNNEL_URL is a stable URL before spawning quick tunnel
    Evidence: .sisyphus/evidence/task-5-stable-url-check.txt

  Scenario: Build passes
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-5-build-check.txt
  ```

  **Commit**: YES (grouped with Task 6)
  - Message: `refactor(dev): update dev scripts for WORKER_RUNTIME + stable tunnel detection`
  - Files: `scripts/dev.ts`, `scripts/dev-e2e.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Update config and documentation for WORKER_RUNTIME + named tunnel

  **What to do**:
  - **`.env.example`** — Replace the `USE_LOCAL_DOCKER` and `USE_FLY_HYBRID` sections (lines ~67-83) with:

    ```
    # Worker dispatch mode: 'docker' (local Docker) or 'fly' (Fly.io machines)
    # Default: 'docker' when unset. Use 'fly' with a stable TUNNEL_URL for hybrid mode.
    WORKER_RUNTIME=""

    # PostgREST tunnel URL for Fly.io workers to reach local Supabase (port 54331).
    # For named tunnel: https://postgrest-ai-employee.dozaldevs.com
    # For quick tunnel: cloudflared tunnel --url http://localhost:54331 (URL auto-detected by dev.ts)
    TUNNEL_URL=""
    ```

  - **`AGENTS.md`** — Update these sections:
    1. Line ~78: Replace the `USE_LOCAL_DOCKER` flag description with `WORKER_RUNTIME` description:
       `- **\`WORKER_RUNTIME\` flag\*\*: Controls worker dispatch mode. \`docker\` = local Docker containers, \`fly\` = Fly.io machines (requires \`TUNNEL_URL\`). Defaults to \`docker\` when unset. Set programmatically by \`dev.ts\` — reads from \`.env\` and passes to the gateway process.`
    2. Line ~514: Replace `USE_FLY_HYBRID=1 and TUNNEL_URL=<cloudflare-url>` with `Set \`WORKER_RUNTIME=fly\` and \`TUNNEL_URL=https://postgrest-ai-employee.dozaldevs.com\` in \`.env\`.`
    3. Add the stable PostgREST tunnel URL to the Known Issues section or Infrastructure section: `postgrest-ai-employee.dozaldevs.com` is the stable PostgREST tunnel URL for hybrid mode.
  - **`src/inngest/lib/poll-completion.ts`** — Line 2: Update the JSDoc comment from `USE_FLY_HYBRID dispatch branch` to `WORKER_RUNTIME=fly dispatch branch`.

  **Must NOT do**:
  - DO NOT update `docs/snapshots/` files — they're immutable
  - DO NOT update `docs/phases/` files — they're historical
  - DO NOT update `docs/infrastructure/` files about hybrid mode — they document the old system as-built

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation and config updates — no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, but after T5 completes)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 3, 4, 5

  **References**:

  **Pattern References**:
  - `.env.example:67-83` — Current `USE_LOCAL_DOCKER` / `USE_FLY_HYBRID` documentation block
  - `AGENTS.md:78` — `USE_LOCAL_DOCKER` flag description
  - `AGENTS.md:514` — Hybrid mode instructions referencing `USE_FLY_HYBRID`
  - `src/inngest/lib/poll-completion.ts:2` — JSDoc comment referencing `USE_FLY_HYBRID`

  **WHY Each Reference Matters**:
  - `.env.example` — Developer onboarding — new devs will read this to understand config
  - `AGENTS.md` — Every LLM call includes this — must be accurate or agents make wrong decisions
  - `poll-completion.ts` — Stale comment that will confuse future code readers

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No old env vars in .env.example
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" .env.example
      2. Assert count = 0
    Expected Result: Old vars completely removed from example
    Evidence: .sisyphus/evidence/task-6-env-example-clean.txt

  Scenario: WORKER_RUNTIME documented in .env.example
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "WORKER_RUNTIME" .env.example
      2. Assert count >= 2 (variable + comment)
    Expected Result: New var properly documented
    Evidence: .sisyphus/evidence/task-6-env-example-new.txt

  Scenario: AGENTS.md references WORKER_RUNTIME
    Tool: Bash (grep)
    Steps:
      1. Run: grep -c "WORKER_RUNTIME" AGENTS.md
      2. Assert count >= 1
      3. Run: grep -c "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" AGENTS.md
      4. Assert count = 0 (no old references in active docs)
    Expected Result: AGENTS.md fully migrated
    Failure Indicators: Old vars still referenced
    Evidence: .sisyphus/evidence/task-6-agents-md-updated.txt

  Scenario: poll-completion.ts comment updated
    Tool: Bash (grep)
    Steps:
      1. Run: grep "USE_FLY_HYBRID" src/inngest/lib/poll-completion.ts
      2. Assert: no output
      3. Run: grep "WORKER_RUNTIME" src/inngest/lib/poll-completion.ts
      4. Assert: output contains "WORKER_RUNTIME"
    Expected Result: Comment updated
    Evidence: .sisyphus/evidence/task-6-poll-comment.txt
  ```

  **Commit**: YES (grouped with Task 5)
  - Message: `chore: update config and docs for WORKER_RUNTIME + named tunnel`
  - Files: `.env.example`, `AGENTS.md`, `src/inngest/lib/poll-completion.ts`
  - Pre-commit: `pnpm build`

- [x] 7. Re-seed database + rebuild Docker image

  **What to do**:
  - **Re-seed database**: Run `pnpm prisma db seed` to update the VLRE guest-messaging archetype (`00000000-0000-0000-0000-000000000015`) instructions in the local database with the strengthened thread UID warning from Task 1.
  - **Verify seed applied**: Query the database to confirm the new CRITICAL warning text is present in the archetype instructions:
    ```bash
    curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions" \
      -H "apikey: $SUPABASE_ANON_KEY" | grep -c "lead-uid and --thread-uid are DIFFERENT"
    ```
    Assert count >= 1.
  - **Rebuild Docker image**: Run `docker build -t ai-employee-worker:latest .` to bake the `opencode-harness.mts` changes from Task 2 into the worker image.
  - **Verify build**: Confirm the image was built: `docker images ai-employee-worker:latest --format "{{.ID}} {{.CreatedAt}}"` — the timestamp should be recent.

  **Must NOT do**:
  - DO NOT modify any source files — this task only runs build/seed commands

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Run two commands and verify their output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, with Tasks 5, 6, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `prisma/seed.ts` — Seed script. Uses upsert pattern for archetypes — re-seeding updates existing records.
  - `Dockerfile` — Docker build context. Includes `src/workers/` directory.

  **WHY Each Reference Matters**:
  - `seed.ts` — Must confirm the seed script upserts (not just inserts) to update existing archetype
  - `Dockerfile` — Confirms `opencode-harness.mts` is included in the build

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed applied — archetype instructions updated
    Tool: Bash (curl)
    Preconditions: pnpm prisma db seed completed successfully
    Steps:
      1. Run: curl -s "http://localhost:54331/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000015&select=instructions" -H "apikey: $SUPABASE_ANON_KEY"
      2. Assert: response contains "lead-uid and --thread-uid are DIFFERENT"
    Expected Result: Updated instructions in DB
    Failure Indicators: Old instructions still present (no CRITICAL warning about thread UID)
    Evidence: .sisyphus/evidence/task-7-seed-applied.txt

  Scenario: Docker image rebuilt with harness changes
    Tool: Bash (docker)
    Preconditions: docker build completed
    Steps:
      1. Run: docker images ai-employee-worker:latest --format "{{.ID}} {{.CreatedAt}}"
      2. Assert: CreatedAt timestamp is within the last 10 minutes
    Expected Result: Fresh image with Task 2 changes baked in
    Failure Indicators: Stale timestamp
    Evidence: .sisyphus/evidence/task-7-docker-rebuilt.txt
  ```

  **Commit**: NO (build artifacts — no source files changed)

- [x] 8. Update test files for WORKER_RUNTIME

  **What to do**:
  - **`tests/setup.ts`** — Line ~138: Replace `delete process.env.USE_LOCAL_DOCKER;` with `delete process.env.WORKER_RUNTIME;`
  - **`tests/inngest/lifecycle-local-docker.test.ts`** — 4 changes:
    1. Line ~217: Replace `process.env.USE_LOCAL_DOCKER = '1'` with `process.env.WORKER_RUNTIME = 'docker'`
    2. Line ~224: Replace `delete process.env.USE_LOCAL_DOCKER` with `delete process.env.WORKER_RUNTIME`
    3. Line ~301: Replace `delete process.env.USE_LOCAL_DOCKER` with `delete process.env.WORKER_RUNTIME`
    4. Line ~411: This line asserts source code contains `USE_LOCAL_DOCKER` — update to assert `WORKER_RUNTIME` instead: `expect(sourceCode).toContain("process.env.WORKER_RUNTIME")`
  - Consider renaming the test file from `lifecycle-local-docker.test.ts` to `lifecycle-worker-runtime.test.ts` to match the new variable name. If renaming, use `git mv` to preserve history.
  - After changes, run `pnpm test -- --run` to verify all existing tests still pass.

  **Must NOT do**:
  - DO NOT change test logic or assertions — only update variable names
  - DO NOT delete any test cases

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical find-and-replace in test files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, with Tasks 5, 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `tests/setup.ts:138` — Global test setup that cleans env vars
  - `tests/inngest/lifecycle-local-docker.test.ts:217-411` — Four locations that set/check `USE_LOCAL_DOCKER`

  **WHY Each Reference Matters**:
  - `setup.ts:138` — If not updated, tests will still delete the old var, leaving `WORKER_RUNTIME` polluting across tests
  - `lifecycle-local-docker.test.ts:411` — This line literally asserts the source code string — it WILL fail if not updated after Task 3

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: No old env var references in test files
    Tool: Bash (grep)
    Steps:
      1. Run: grep -rn "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" tests/
      2. Assert: output is empty
    Expected Result: All test references migrated
    Evidence: .sisyphus/evidence/task-8-no-old-vars-tests.txt

  Scenario: Tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0
    Expected Result: All existing tests pass with updated env var names
    Failure Indicators: Test failures in lifecycle-local-docker.test.ts
    Evidence: .sisyphus/evidence/task-8-tests-pass.txt
  ```

  **Commit**: YES (grouped with Task 6)
  - Message: `test: update test files for WORKER_RUNTIME env var`
  - Files: `tests/setup.ts`, `tests/inngest/lifecycle-local-docker.test.ts` (or renamed)
  - Pre-commit: `pnpm test -- --run`

- [x] 9. Write unit tests for status log insert and WORKER_RUNTIME logic

  **What to do**:
  - **Status log tests** — Add test cases to verify the harness status log inserts. Create or extend a test file (e.g., `tests/workers/opencode-harness-status-log.test.ts` or add to existing harness tests if they exist):
    - Test: When delivery completes successfully, `db.post('task_status_log', ...)` is called with `{ from_status: 'Delivering', to_status: 'Done', actor: 'opencode_harness' }`
    - Test: When delivery fails, `db.post('task_status_log', ...)` is called with `{ to_status: 'Failed', actor: 'opencode_harness' }`
    - Test: If `db.post()` throws, the error is caught (non-fatal) and `process.exit` still runs
  - **WORKER_RUNTIME logic tests** — Update or extend `tests/inngest/lifecycle-local-docker.test.ts` (now renamed to `lifecycle-worker-runtime.test.ts`):
    - Test: When `WORKER_RUNTIME` is unset, dispatch uses Docker (local) path
    - Test: When `WORKER_RUNTIME=docker`, dispatch uses Docker path
    - Test: When `WORKER_RUNTIME=fly`, dispatch uses Fly.io path and calls `getTunnelUrl()`
    - Test: When `WORKER_RUNTIME=fly`, delivery phase uses tunnel URL for SUPABASE_URL
  - Run `pnpm test -- --run` after writing all tests to confirm they pass alongside existing tests.

  **Must NOT do**:
  - DO NOT modify source code — only write new test files or extend existing ones
  - DO NOT duplicate existing test coverage — check what's already tested first

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Writing new tests requires understanding the mock patterns and test infrastructure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3, with Task 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 2, 3, 5, 8

  **References**:

  **Pattern References**:
  - `tests/inngest/lifecycle-local-docker.test.ts` — Existing test patterns for lifecycle dispatch logic (mock setup, env var injection, assertions)
  - `src/workers/lib/completion.ts:81-93` — Existing status log insert pattern (to understand what's being tested)
  - `src/workers/lib/postgrest-client.ts:61-78` — `post()` method to mock

  **Test References**:
  - `tests/setup.ts` — Global test setup — understand what env vars are cleaned
  - Vitest mock patterns used in the project (check existing test files for `vi.mock`, `vi.spyOn` usage)

  **WHY Each Reference Matters**:
  - `lifecycle-local-docker.test.ts` — Follow the existing mock and assertion patterns for consistency
  - `postgrest-client.ts` — Need to mock `db.post()` calls

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: New tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0
      3. Assert new test file appears in output (grep for "status-log" or "worker-runtime")
    Expected Result: All tests pass including new ones
    Evidence: .sisyphus/evidence/task-9-tests-pass.txt

  Scenario: Test coverage for WORKER_RUNTIME default
    Tool: Bash (grep)
    Steps:
      1. Grep test file for "unset" or "undefined" or "default" in context of WORKER_RUNTIME
      2. Assert at least one test covers the default/unset case
    Expected Result: Default behavior tested
    Evidence: .sisyphus/evidence/task-9-default-tested.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for status log inserts and WORKER_RUNTIME dispatch logic`
  - Files: `tests/workers/opencode-harness-status-log.test.ts` (new), `tests/inngest/lifecycle-worker-runtime.test.ts` (extended)
  - Pre-commit: `pnpm test -- --run`

- [x] 10. E2E Scenario A re-validation

  **What to do**:
  - Restart `pnpm dev` (with `WORKER_RUNTIME=fly` in `.env`) to pick up all code changes.
  - Verify the named tunnel is active: `curl -s https://postgrest-ai-employee.dozaldevs.com/rest/v1/` returns 200.
  - Send a test message as Olivia in the Airbnb thread (`https://www.airbnb.com/guest/messages/2525238359`). Use a unique suffix: `What is the WiFi password? [e2e-revalidation-{epoch}]`
  - Wait for the Hostfully webhook to fire → task created → worker executes → approval card appears in `#cs-guest-communication`.
  - Approve the message.
  - After task reaches `Done`, verify ALL four fixes:

    **Fix 1 — Thread UID correct**:

    ```bash
    TASK_ID=<from Slack context block>
    curl -s "http://localhost:54331/rest/v1/pending_approvals?task_id=eq.$TASK_ID&select=thread_uid" -H "apikey: $SUPABASE_ANON_KEY"
    ```

    Assert `thread_uid` is NOT `29a64abd-...` (lead UID). It should be `aef3d0cf-...` (thread UID) or a different correct value.

    **Fix 2 — WORKER_RUNTIME used (no old vars)**:

    ```bash
    grep -rn "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/inngest/employee-lifecycle.ts scripts/dev.ts
    ```

    Assert: 0 matches (already verified, but double-check in running system).

    **Fix 3 — Status log complete**:

    ```bash
    curl -s "http://localhost:54331/rest/v1/task_status_log?task_id=eq.$TASK_ID&order=created_at&select=from_status,to_status,actor" -H "apikey: $SUPABASE_ANON_KEY"
    ```

    Assert: last row is `{"from_status":"Delivering","to_status":"Done","actor":"opencode_harness"}`.

    **Fix 4 — Named tunnel stable**:

    ```bash
    curl -s -o /dev/null -w "%{http_code}" https://postgrest-ai-employee.dozaldevs.com/rest/v1/
    ```

    Assert: 200 (still responding after full E2E run).

  **Must NOT do**:
  - DO NOT modify any source files in this task — validation only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Full E2E validation requiring browser interaction, Slack monitoring, database queries, and multi-step verification
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Task 9)
  - **Blocks**: F1-F4
  - **Blocked By**: All previous tasks

  **References**:

  **Pattern References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Scenario A step-by-step guide
  - `docs/testing/2026-05-12-2017-scenario-a-e2e-outcome.md` — Previous E2E outcome for comparison

  **Test References**:
  - Airbnb thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack channel: `#cs-guest-communication` (`C0AMGJQN05S`)
  - Lead UID: `29a64abd-d02c-44bc-8d5c-47df58a7ab14`
  - Thread UID (correct): `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`

  **WHY Each Reference Matters**:
  - E2E test guide — Follow the same steps as the original test
  - Previous outcome doc — Compare results to confirm fixes worked

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E Scenario A with all fixes verified
    Tool: Playwright + Bash (curl)
    Preconditions: pnpm dev running with WORKER_RUNTIME=fly, named tunnel active, Docker image rebuilt
    Steps:
      1. Send Airbnb message with unique suffix [e2e-revalidation-{epoch}]
      2. Wait for task to appear in DB (poll every 10s, timeout 120s)
      3. Wait for approval card in Slack (timeout 300s)
      4. Click Approve & Send
      5. Wait for task status = Done (timeout 120s)
      6. Query pending_approvals — assert thread_uid != lead_uid
      7. Query task_status_log — assert Delivering→Done row with actor=opencode_harness
      8. Curl named tunnel — assert 200
    Expected Result: All 4 fixes verified in a single E2E run
    Failure Indicators: thread_uid = lead_uid, missing Delivering→Done row, tunnel timeout
    Evidence: .sisyphus/evidence/task-10-e2e-full-validation.txt

  Scenario: Error path — status log for Failed (if testable)
    Tool: Bash (curl to DB)
    Steps:
      1. If a failed task exists from a previous run, query its task_status_log
      2. Check for a to_status=Failed row with actor=opencode_harness
    Expected Result: Failed transitions now logged (if applicable)
    Evidence: .sisyphus/evidence/task-10-failed-status-log.txt
  ```

  **Commit**: NO (validation only — no source files changed)

- [x] 11. Notify completion

  Send Telegram notification: plan `2026-05-12-2245-e2e-scenario-a-fixes` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "Plan 2026-05-12-2245-e2e-scenario-a-fixes complete. All tasks done. Come back to review results."
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (grep for WORKER_RUNTIME in lifecycle, curl the named tunnel, query task_status_log). For each "Must NOT Have": search codebase for forbidden patterns (USE_LOCAL_DOCKER in lifecycle, silent UID swaps). Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + `pnpm lint` + `pnpm build`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Test: (1) `WORKER_RUNTIME=docker pnpm dev` starts without errors, (2) `WORKER_RUNTIME=fly pnpm dev` starts with named tunnel, (3) `curl https://postgrest-ai-employee.dozaldevs.com/rest/v1/` returns 200, (4) trigger guest-messaging task and verify `task_status_log` has Delivering→Done row. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Check deprecated `lifecycle.ts` was NOT modified. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                                      | Files                                                                                         | Pre-commit Check     |
| ---- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| 1    | `fix(guest-messaging): strengthen thread UID instructions and add validation guard` | `prisma/seed.ts`, `src/worker-tools/slack/post-guest-approval.ts`                             | `pnpm test -- --run` |
| 1    | `fix(harness): add task_status_log entries for Done and Failed transitions`         | `src/workers/opencode-harness.mts`                                                            | `pnpm test -- --run` |
| 1    | `refactor(lifecycle): replace USE_LOCAL_DOCKER/USE_FLY_HYBRID with WORKER_RUNTIME`  | `src/inngest/employee-lifecycle.ts`                                                           | `pnpm test -- --run` |
| 2    | `refactor(dev): update dev scripts for WORKER_RUNTIME + stable tunnel`              | `scripts/dev.ts`, `scripts/dev-e2e.ts`                                                        | `pnpm test -- --run` |
| 2    | `chore: update env config, docs, and test files for WORKER_RUNTIME`                 | `.env.example`, `AGENTS.md`, `tests/setup.ts`, `tests/inngest/lifecycle-local-docker.test.ts` | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# No old env vars in active source code
grep -rn "USE_LOCAL_DOCKER\|USE_FLY_HYBRID" src/inngest/employee-lifecycle.ts scripts/dev.ts scripts/dev-e2e.ts  # Expected: no output

# Named tunnel responds
curl -s -o /dev/null -w "%{http_code}" https://postgrest-ai-employee.dozaldevs.com/rest/v1/  # Expected: 200

# All tests pass
pnpm test -- --run  # Expected: 515+ passing

# Status log completeness (after E2E run with task ID)
curl -s "http://localhost:54331/rest/v1/task_status_log?task_id=eq.<TASK_ID>&to_status=eq.Done&select=from_status,actor" -H "apikey: $SUPABASE_ANON_KEY"
# Expected: [{"from_status":"Delivering","actor":"opencode_harness"}]
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] E2E Scenario A passes with correct thread UID and complete status log
- [ ] Named tunnel stable across `pnpm dev` restarts
