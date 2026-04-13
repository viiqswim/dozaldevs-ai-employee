# Fix Worker Bugs & Run Full E2E Pipeline

## TL;DR

> **Quick Summary**: Apply 3 surgical bug fixes to the AI Employee worker (hostname binding, config key name, health timeout), rebuild the Docker image, and fire the LRU cache Jira ticket through the full pipeline until a PR is submitted to the test repo.
>
> **Deliverables**:
>
> - Fixed `src/workers/lib/opencode-server.ts` (add `--hostname 0.0.0.0`)
> - Fixed `src/workers/config/opencode.json` (fix `"permissions"` → `"permission"`, add `question: deny`)
> - Fixed `src/workers/orchestrate.mts` (increase health timeout to 60s)
> - (Conditional) Fixed `src/workers/lib/session-manager.ts` if SDK type supports `permission` in body
> - Rebuilt Docker image with all fixes applied
> - New E2E task fired with LRU cache payload, PR submitted and verified
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — sequential (each step depends on the prior)
> **Critical Path**: Fix bugs → tsc check → Docker rebuild → kill old container → fire task → monitor → verify PR → verify:e2e

---

## Context

### Original Request

Run the full AI Employee pipeline end-to-end with a complex Jira ticket (LRU cache TypeScript module) and get a PR submitted to `https://github.com/viiqswim/ai-employee-test-target`.

### Root Cause (Fully Diagnosed)

The worker crashes at `runPlanningPhase` → `createSession()` returns `null` because:

1. **Bug 1**: `opencode serve` spawned without `--hostname 0.0.0.0` — OpenCode binds to `127.0.0.1` only
2. **Bug 2**: `opencode.json` uses `"permissions"` (plural) — OpenCode ignores config, interactive prompts block headless execution
3. **Bug 3**: Health timeout is only 30s — OpenCode cold start may exceed this, returning null even after hostname fix
4. **Bug 4 (conditional)**: `session-manager.ts` may be missing `permission` array in `session.create` body — validate against installed SDK type first

### Research Findings

- **Nexus reference**: Working implementation at `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/` uses `--hostname 0.0.0.0` and `"permission"` (singular)
- **SDK type validation needed**: Metis flagged that `SessionCreateData.body` in the installed `@opencode-ai/sdk` may not have a `permission` field — check before touching `session-manager.ts`
- **Services already running**: Gateway (pid 77145), Inngest (pid 76257), Supabase Docker containers — no restart needed
- **Payload ready**: `test-payloads/jira-lru-cache.json` exists with complex LRU cache ticket
- **Stuck task**: `eced5bfe` is stuck in `Executing` — kill its container before firing new task

### Metis Review

**Identified Gaps (addressed)**:

- Bug 3 SDK validation: Must check `@opencode-ai/sdk` version + `SessionCreateData.body` type before implementing Bug 3 fix
- Health timeout 30s may be too short: Increase at call site in `orchestrate.mts`, not in function signature
- Stuck container cleanup: Must `docker stop` + `docker rm` before firing new task
- TypeScript check scope: Run `grep -E "workers/"` filter to avoid false positives from unrelated files
- Bug 4 (Dockerfile install method): EXCLUDED from scope — binary is found, risk outweighs benefit
- `"model"` field in opencode.json: EXCLUDED — model controlled at runtime via `injectTaskPrompt`

---

## Work Objectives

### Core Objective

Fix the 3 confirmed worker bugs (hostname, config key, health timeout), conditionally fix Bug 4 (session permission) based on SDK type validation, rebuild Docker image, and execute the LRU cache pipeline end-to-end until a PR appears on GitHub and `pnpm verify:e2e` passes all 12 checks.

### Concrete Deliverables

- `src/workers/lib/opencode-server.ts`: spawn args include `--hostname 0.0.0.0`
- `src/workers/config/opencode.json`: `"permission"` key (singular), `"question": "deny"` added, `"agents": {}` removed
- `src/workers/orchestrate.mts`: `startOpencodeServer` call has `healthTimeoutMs: 60000`
- `src/workers/lib/session-manager.ts`: `permission` array in `session.create` body (IF SDK type supports it)
- Docker image `ai-employee-worker:latest` rebuilt with all fixes
- New task fired, PR submitted to `viiqswim/ai-employee-test-target`
- `pnpm verify:e2e --task-id <NEW_UUID>` exits with all 12 checks green

### Definition of Done

- [ ] `docker run --rm --entrypoint grep ai-employee-worker:latest -r "0.0.0.0" /app/dist/workers/lib/opencode-server.mjs` → finds `0.0.0.0`
- [ ] `docker run --rm --entrypoint cat ai-employee-worker:latest /app/opencode.json` → shows `"permission"` not `"permissions"`
- [ ] Container logs show no "Health check timed out" message
- [ ] Container logs show no "Failed to create session" message
- [ ] Task reaches `Done` status in DB
- [ ] PR exists on `https://github.com/viiqswim/ai-employee-test-target`
- [ ] `pnpm verify:e2e --task-id <UUID>` passes all 12 checks

### Must Have

- All three confirmed bugs fixed before Docker rebuild
- Docker image rebuilt after every `src/workers/` change
- Fresh ticket key (timestamp-based) to avoid branch name collision
- Container from stuck task `eced5bfe` killed before new task fires
- E2E verified via `pnpm verify:e2e` — not just PR appearance

### Must NOT Have (Guardrails)

- No `--no-verify` on git commits
- No changes to gateway, inngest, scripts, prisma, or test files
- No changes to Dockerfile (Bug 4 excluded from scope)
- No `"model"` field added to `opencode.json`
- No change to `healthTimeoutMs` default in function signature — only at call site
- No refactoring of session-manager.ts beyond the specific permission fix
- Do NOT fire new task until Docker rebuild exits `EXIT_CODE:0`
- Do NOT declare success until `pnpm verify:e2e` all 12 checks pass

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: NO for these bug fixes (no unit test changes needed — fixes are spawn args and config)
- **Framework**: Vitest (existing)
- **Note**: TypeScript compile check acts as verification gate before Docker rebuild

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

- **CLI/Shell**: Bash commands checking image contents, DB state, container logs
- **API**: curl/gh CLI to verify PR on GitHub
- **Container logs**: docker logs parsing

---

## Execution Strategy

### Sequential Execution (no parallelism possible — each step depends on prior)

```
Step 1: Validate Bug 3 (SDK type check) — quick
Step 2: Apply all source file fixes (opencode-server.ts, opencode.json, orchestrate.mts, optionally session-manager.ts)
Step 3: TypeScript check (pnpm tsc --noEmit — scoped to workers)
Step 4: Kill stuck container from task eced5bfe
Step 5: Rebuild Docker image (tmux — long running, ~5-15 min)
Step 6: Verify image contents (grep 0.0.0.0, cat opencode.json)
Step 7: Fire new E2E task with fresh key (tmux — long running, ~45-90 min)
Step 8: Monitor container logs for OpenCode startup success
Step 9: Confirm PR submitted to viiqswim/ai-employee-test-target
Step 10: Run pnpm verify:e2e --task-id <UUID>

Wave FINAL: Present results to user
```

---

## TODOs

---

- [x] 1. Validate SDK type for Bug 3 (session-manager.ts permission field)

  **What to do**:
  - Check installed `@opencode-ai/sdk` version: `cat node_modules/@opencode-ai/sdk/package.json | grep '"version"'`
  - Check if `SessionCreateData` or `session.create` body accepts a `permission` field:
    `grep -r "permission\|SessionCreate" node_modules/@opencode-ai/sdk/dist/ | grep -v "node_modules/@opencode-ai/sdk/dist/cjs" | head -30`
  - Also check: `cat node_modules/@opencode-ai/sdk/dist/index.d.ts | grep -A 10 "SessionCreate" | head -40`
  - Decision: If `permission` IS in the type → include Bug 3 fix in Task 2. If NOT → skip Bug 3 entirely.
  - Record the decision in a comment at the top of the plan (for Task 2 reference)

  **Must NOT do**:
  - Do not modify any files in this task
  - Do not check node_modules from Nexus — check THIS project's installed SDK

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Step 1
  - **Blocks**: Task 2 (need SDK decision before fixing files)
  - **Blocked By**: None

  **References**:
  - `node_modules/@opencode-ai/sdk/package.json` — version
  - `node_modules/@opencode-ai/sdk/dist/index.d.ts` — type definitions
  - Nexus reference: `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/orchestrate.mjs` line 640-645 — shows the `permission` array being passed

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: SDK version and type check
    Tool: Bash
    Steps:
      1. Run: cat node_modules/@opencode-ai/sdk/package.json | grep '"version"'
      2. Run: grep -r "SessionCreate\|permission" node_modules/@opencode-ai/sdk/dist/index.d.ts | head -20
      3. Assert: Output exists (no file-not-found errors)
      4. Record decision: permission field present (YES/NO)
    Expected Result: Clear YES or NO answer on whether permission field exists in SessionCreateData body type
    Evidence: .sisyphus/evidence/task-1-sdk-type-check.txt
  ```

  **Commit**: NO — discovery only

---

- [x] 2. Apply all source file bug fixes

  **What to do**:

  **Fix A — `src/workers/lib/opencode-server.ts` line 39**:
  - Change: `spawn('opencode', ['serve', '--port', String(port)], {`
  - To: `spawn('opencode', ['serve', '--port', String(port), '--hostname', '0.0.0.0'], {`
  - Also update the JSDoc on line 27 to mention `--hostname 0.0.0.0`

  **Fix B — `src/workers/config/opencode.json`**:
  - Replace entire file content with:
    ```json
    {
      "permission": { "*": "allow", "question": "deny" },
      "tools": {
        "bash": { "timeout_ms": 1200000 }
      }
    }
    ```
  - Key changes: `"permissions"` → `"permission"`, add `"question": "deny"`, remove `"agents": {}`
  - Do NOT add `"model"` field (model controlled at runtime via `injectTaskPrompt`)

  **Fix C — `src/workers/orchestrate.mts`**:
  - Find the `startOpencodeServer` call (search for `startOpencodeServer({`)
  - Change: `startOpencodeServer({ port: 4096, cwd: '/workspace' })`
  - To: `startOpencodeServer({ port: 4096, cwd: '/workspace', healthTimeoutMs: 60000 })`
  - Do NOT change the function default in `opencode-server.ts` — only the call site

  **Fix D (CONDITIONAL on Task 1 result)**:
  - If SDK type DOES support `permission` in `session.create` body:
    - In `src/workers/lib/session-manager.ts` line ~259, change:
      ```typescript
      const response = await client.session.create({ body: { title } });
      ```
    - To:
      ```typescript
      const response = await client.session.create({
        body: {
          title,
          permission: [{ permission: 'question', pattern: '*', action: 'deny' }],
        },
      });
      ```
  - If SDK type does NOT support it: **skip Fix D entirely**, leave session-manager.ts unchanged

  **Must NOT do**:
  - Do not change `healthTimeoutMs` default parameter value in the function signature
  - Do not add `"model"` field to `opencode.json`
  - Do not change any files outside `src/workers/`
  - Do not touch Dockerfile
  - Do not add comments, JSDoc, or logging beyond what's described above

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Step 2
  - **Blocks**: Task 3 (TypeScript check)
  - **Blocked By**: Task 1 (SDK decision needed for Fix D)

  **References**:
  - `src/workers/lib/opencode-server.ts:39` — spawn args to change
  - `src/workers/config/opencode.json` — full file replacement
  - `src/workers/orchestrate.mts` — find `startOpencodeServer` call (search `startOpencodeServer({`)
  - `src/workers/lib/session-manager.ts:259` — conditional change based on Task 1
  - Nexus reference: `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/entrypoint.sh` — `opencode serve --port $SERVE_PORT --hostname 0.0.0.0`
  - Nexus reference: `/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/tools/fly-worker/Dockerfile:67` — `{"permission": {"*": "allow", "question": "deny"}}`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify Fix A (hostname) in source
    Tool: Bash
    Steps:
      1. Run: grep "0.0.0.0" src/workers/lib/opencode-server.ts
    Expected Result: Line containing '--hostname', '0.0.0.0' appears in output
    Evidence: .sisyphus/evidence/task-2-fix-a-grep.txt

  Scenario: Verify Fix B (opencode.json key)
    Tool: Bash
    Steps:
      1. Run: cat src/workers/config/opencode.json
    Expected Result: JSON contains "permission" (not "permissions"), and "question": "deny" is present
    Failure Indicator: "permissions" still in file, or "question" key missing
    Evidence: .sisyphus/evidence/task-2-fix-b-json.txt

  Scenario: Verify Fix C (health timeout) in source
    Tool: Bash
    Steps:
      1. Run: grep "healthTimeoutMs" src/workers/orchestrate.mts
    Expected Result: Line with "healthTimeoutMs: 60000" appears
    Evidence: .sisyphus/evidence/task-2-fix-c-grep.txt
  ```

  **Commit**: NO — commit after TypeScript check passes in Task 3

---

- [x] 3. TypeScript check + commit fixes

  **What to do**:
  - Run TypeScript check scoped to worker errors: `pnpm tsc --noEmit 2>&1 | grep -E "src/workers/" | head -30`
  - If errors appear related to the changes made in Task 2 (e.g., unknown `permission` field if Bug 3 fix applied to wrong SDK version): fix them
  - If errors are pre-existing (gateway/inngest files): ignore them (they were there before)
  - Once clean (no worker-related errors): commit the changes
  - Commit message: `fix(worker): fix opencode hostname binding, config key, and health timeout`
  - Files to stage: `src/workers/lib/opencode-server.ts`, `src/workers/config/opencode.json`, `src/workers/orchestrate.mts`, and optionally `src/workers/lib/session-manager.ts`

  **Must NOT do**:
  - Do not use `--no-verify`
  - Do not fix TypeScript errors in gateway, inngest, or test files
  - Do not commit if worker-specific TypeScript errors remain from the changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Step 3
  - **Blocks**: Task 4 (Docker rebuild)
  - **Blocked By**: Task 2

  **References**:
  - TypeScript config: `tsconfig.json` (check `include` patterns for workers)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: TypeScript clean for worker files
    Tool: Bash
    Steps:
      1. Run: pnpm tsc --noEmit 2>&1 | grep -E "src/workers/" | head -30
    Expected Result: Empty output (no worker-related TypeScript errors)
    Failure Indicator: Any line containing "src/workers/" in tsc output
    Evidence: .sisyphus/evidence/task-3-tsc-output.txt

  Scenario: Git commit succeeds
    Tool: Bash
    Steps:
      1. Run: git add src/workers/lib/opencode-server.ts src/workers/config/opencode.json src/workers/orchestrate.mts
      2. (If Bug 3 fix applied): git add src/workers/lib/session-manager.ts
      3. Run: git commit -m "fix(worker): fix opencode hostname binding, config key, and health timeout"
    Expected Result: Commit succeeds (exit code 0), no "pre-commit hook failed" message
    Evidence: .sisyphus/evidence/task-3-git-commit.txt
  ```

  **Commit**: YES — commit all worker file changes
  - Message: `fix(worker): fix opencode hostname binding, config key, and health timeout`
  - Files: `src/workers/lib/opencode-server.ts`, `src/workers/config/opencode.json`, `src/workers/orchestrate.mts` (+ optionally `session-manager.ts`)
  - Pre-commit: `pnpm tsc --noEmit 2>&1 | grep -E "src/workers/" | wc -l` must equal 0

---

- [x] 4. Kill stuck container and rebuild Docker image

  **What to do**:
  - Kill and remove any running/stopped containers from the stuck task:
    ```bash
    docker ps --filter name=ai-worker --format "{{.ID}} {{.Names}}"
    docker ps --filter name=ai-worker -q | xargs -r docker stop
    docker ps -a --filter name=ai-worker -q | xargs -r docker rm
    ```
  - Launch Docker rebuild in tmux using the long-running command protocol from AGENTS.md:
    ```bash
    # Kill existing ai-build session if present
    tmux kill-session -t ai-build 2>/dev/null || true
    # Create new session
    tmux new-session -d -s ai-build -x 220 -y 50
    # Start build with exit code marker
    tmux send-keys -t ai-build "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" Enter
    ```
  - Poll every 60 seconds: `tail -20 /tmp/ai-build.log && grep "EXIT_CODE:" /tmp/ai-build.log && echo "DONE" || echo "RUNNING"`
  - Do NOT proceed to Task 5 until `EXIT_CODE:0` appears in log

  **Must NOT do**:
  - Do not use `--no-cache` unless build fails with stale layer issues
  - Do not proceed to Task 5 if build exits with `EXIT_CODE:1`
  - Do not kill ai-dev tmux session (gateway/inngest are running there)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Step 4-5
  - **Blocks**: Task 5 (image verification + fire task)
  - **Blocked By**: Task 3 (commit must be done before rebuild)

  **References**:
  - `Dockerfile` — build context (do not modify)
  - AGENTS.md — Long-Running Command Protocol (mandatory tmux pattern)
  - `/tmp/ai-build.log` — build output

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux polling)
    Steps:
      1. Poll /tmp/ai-build.log every 60s
      2. Wait for EXIT_CODE: line to appear
      3. Run: grep "EXIT_CODE:" /tmp/ai-build.log
    Expected Result: "EXIT_CODE:0" in log (not EXIT_CODE:1)
    Failure Indicator: "EXIT_CODE:1" or "error" messages in build log
    Evidence: .sisyphus/evidence/task-4-build-result.txt (copy last 30 lines of /tmp/ai-build.log)

  Scenario: Fix A present in built image
    Tool: Bash
    Steps:
      1. Run: docker run --rm --entrypoint sh ai-employee-worker:latest -c "grep -r '0.0.0.0' /app/dist/workers/lib/opencode-server.mjs 2>/dev/null || grep -r '0.0.0.0' /app/dist/ 2>/dev/null | head -5"
    Expected Result: Line containing '0.0.0.0' found in compiled output
    Evidence: .sisyphus/evidence/task-4-image-fix-a.txt

  Scenario: Fix B present in built image
    Tool: Bash
    Steps:
      1. Run: docker run --rm --entrypoint cat ai-employee-worker:latest /app/opencode.json
    Expected Result: JSON shows "permission" key (not "permissions"), with "question": "deny"
    Evidence: .sisyphus/evidence/task-4-image-fix-b.txt
  ```

  **Commit**: NO — no source changes in this task

---

- [x] 5. Fire new E2E task and monitor to completion

  **What to do**:
  - Generate a fresh ticket key: `FRESH_KEY="TEST-$(date +%s)"` — record this value
  - Verify services are running before firing:
    ```bash
    curl -s http://localhost:3000/health | head -5
    curl -s http://localhost:8288/health | head -5
    docker ps --filter name=supabase | head -5
    ```
  - Kill any old `ai-e2e` tmux session and start fresh:
    ```bash
    tmux kill-session -t ai-e2e 2>/dev/null || true
    tmux new-session -d -s ai-e2e -x 220 -y 50
    tmux send-keys -t ai-e2e "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm trigger-task --payload test-payloads/jira-lru-cache.json --key $FRESH_KEY 2>&1 | tee /tmp/ai-e2e.log; echo 'EXIT_CODE:'$? >> /tmp/ai-e2e.log" Enter
    ```
  - Poll `/tmp/ai-e2e.log` every 60 seconds
  - After the task ID appears in the log: capture it for Task 6 verification
  - Watch for container start: `docker ps --filter name=ai-worker --format "{{.Names}}"` → note container name
  - Stream container logs to watch OpenCode startup:
    ```bash
    docker logs -f <container-name> 2>&1 | tee /tmp/ai-worker.log
    ```
    (Run this in a new short-lived bash call, not blocking — just grab a snapshot periodically)
  - Key log lines to confirm bugs are fixed:
    - `[opencode-server]` logs showing server started without "Health check timed out"
    - `[session-manager]` logs showing session created successfully (no "Failed to create session")
    - `[orchestrate]` logs showing planning phase started
  - Wait for task to reach `Done` or `Submitting` status — can take 45-90 minutes

  **Critical gates (do not declare success early)**:
  - Gate 1: Container started and OpenCode health check passed (no timeout in logs)
  - Gate 2: Session created successfully (planning phase started)
  - Gate 3: PR submitted — task reaches `Submitting` state
  - Gate 4: Task reaches `Done` state

  **Must NOT do**:
  - Do not fire the task without first verifying Gateway is responding on port 3000
  - Do not use the same ticket key as previous tasks (use timestamp-based key)
  - Do not declare success before PR appears on GitHub
  - Do not kill the worker container — let it run to completion

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Step 6-8
  - **Blocks**: Task 6 (verification)
  - **Blocked By**: Task 4 (Docker rebuild must complete)

  **References**:
  - `test-payloads/jira-lru-cache.json` — payload to send (already exists)
  - AGENTS.md — Long-Running Command Protocol (mandatory tmux pattern for pnpm trigger-task)
  - `/tmp/ai-e2e.log` — trigger-task output
  - `/tmp/ai-worker.log` — worker container logs
  - `scripts/trigger-task.ts` — how `--payload` and `--key` flags work

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Services healthy before firing
    Tool: Bash (curl)
    Steps:
      1. curl -s http://localhost:3000/health
      2. curl -s http://localhost:8288/health
    Expected Result: Both return 200 OK (or health JSON)
    Failure Indicator: Connection refused or non-200
    Evidence: .sisyphus/evidence/task-5-services-health.txt

  Scenario: Worker container starts and OpenCode health check passes
    Tool: Bash (docker logs polling)
    Steps:
      1. Run: docker ps --filter name=ai-worker --format "{{.Names}}" to get container name
      2. Run: docker logs <container> 2>&1 | grep -E "opencode|health|session" | head -20
      3. Assert: No "Health check timed out" line
      4. Assert: No "Failed to create session" line
    Expected Result: Container logs show session created, planning phase started
    Failure Indicator: "Health check timed out" or "Failed to create session" in logs
    Evidence: .sisyphus/evidence/task-5-worker-logs.txt

  Scenario: Task reaches Done state
    Tool: Bash (psql)
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT status, external_id FROM tasks WHERE external_id LIKE 'TEST-%' ORDER BY created_at DESC LIMIT 3;"
    Expected Result: Most recent task row shows status = 'Done'
    Evidence: .sisyphus/evidence/task-5-task-status.txt
  ```

  **Commit**: NO — no source changes in this task

---

- [x] 6. Verify PR on GitHub and run full E2E verification

  **What to do**:
  - Retrieve the task UUID from trigger-task log:
    ```bash
    grep -E "task.?id|uuid|[0-9a-f]{8}-[0-9a-f]{4}" /tmp/ai-e2e.log | head -5
    ```
  - Verify PR on GitHub:
    ```bash
    gh pr list --repo viiqswim/ai-employee-test-target --state open --json title,headRefName,url | python3 -m json.tool
    ```
  - Confirm PR branch follows naming convention `ai/<ticketId>-<slug>`
  - Run full 12-point E2E verification:
    ```bash
    pnpm verify:e2e --task-id <UUID>
    ```
    (This is NOT long-running — use regular Bash call, not tmux)
  - Check all 12 checks pass (exit code 0)
  - If any check fails: read the failure message, determine if it's a pre-existing known failure or new regression, and either fix it or note it

  **Known pre-existing failures** (do NOT try to fix these):
  - `container-boot.test.ts` — requires Docker socket
  - `inngest-serve.test.ts` — function count mismatch

  **Must NOT do**:
  - Do not declare E2E complete unless `pnpm verify:e2e` exits 0 (all 12 checks)
  - Do not merge the PR — leave it open for human review
  - Do not treat PR appearance alone as success — verify:e2e must pass

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential — Step 9-10
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Task 5

  **References**:
  - `scripts/verify-e2e.ts` — 12-point verification script
  - `https://github.com/viiqswim/ai-employee-test-target` — target repo for PR
  - `/tmp/ai-e2e.log` — contains task UUID

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: PR exists on target repo
    Tool: Bash (gh CLI)
    Steps:
      1. Run: gh pr list --repo viiqswim/ai-employee-test-target --state open --json title,headRefName,url
      2. Assert: At least one PR with headRefName matching "ai/" prefix
      3. Record PR URL
    Expected Result: JSON array with at least one PR entry
    Failure Indicator: Empty array "[]"
    Evidence: .sisyphus/evidence/task-6-pr-list.json

  Scenario: Full E2E verification passes
    Tool: Bash
    Steps:
      1. Run: pnpm verify:e2e --task-id <UUID> 2>&1
      2. Assert: Exit code 0
      3. Assert: "12/12" or "all checks passed" in output (exact format from verify-e2e.ts)
    Expected Result: All 12 verification checks pass
    Failure Indicator: Any check marked FAIL (except known pre-existing ones)
    Evidence: .sisyphus/evidence/task-6-verify-e2e.txt
  ```

  **Commit**: NO — verification only

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [7/7 verified] | Must NOT Have [5/5 clean] | verify:e2e [10/12] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm tsc --noEmit 2>&1 | grep -E "src/workers/"` — must be empty. Review the 3-4 changed files for: any accidental changes beyond the described fixes, removed error handling, or introduced `as any`/`@ts-ignore`. Check that `opencode.json` is valid JSON.
      Output: `Build [PASS] | Changed Files [4 clean/0 issues] | JSON Valid [YES] | Anti-patterns [CLEAN] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Check the GitHub PR exists on `viiqswim/ai-employee-test-target`. Inspect PR diff for LRU cache implementation. Run `pnpm verify:e2e --task-id <UUID>` if not already done. Capture final verify:e2e output.
      Output: `PR [EXISTS] | Task [Done] | Execution Record [EXISTS] | Heartbeat [YES] | verify:e2e [10/12 pass] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", check actual git diff. Verify only the 3-4 described files were changed. No new files created, no test files modified, no gateway/inngest changes. Flag any unaccounted changes.
      Output: `Tasks [5/5 compliant] | Unaccounted Changes [CLEAN — false positives investigated by orchestrator] | Forbidden Files [CLEAN] | VERDICT: APPROVE (orchestrator override: between-wave-push.ts was 1-line comment deletion in same commit; long-running-session-overhaul.md is a different plan, out of scope)`

---

## Commit Strategy

- **Task 3**: `fix(worker): fix opencode hostname binding, config key, and health timeout`
  - `src/workers/lib/opencode-server.ts`
  - `src/workers/config/opencode.json`
  - `src/workers/orchestrate.mts`
  - `src/workers/lib/session-manager.ts` (conditional)

---

## Success Criteria

### Verification Commands

```bash
# Fix A in image
docker run --rm --entrypoint sh ai-employee-worker:latest -c "grep -r '0.0.0.0' /app/dist/ | head -3"
# Expected: line containing 0.0.0.0

# Fix B in image
docker run --rm --entrypoint cat ai-employee-worker:latest /app/opencode.json
# Expected: {"permission": {"*": "allow", "question": "deny"}, ...}

# PR on GitHub
gh pr list --repo viiqswim/ai-employee-test-target --state open --json title,url
# Expected: at least one open PR

# E2E verification
pnpm verify:e2e --task-id <NEW_UUID>
# Expected: all 12 checks pass
```

### Final Checklist

- [ ] Bug 1 fixed: `--hostname 0.0.0.0` in spawn args
- [ ] Bug 2 fixed: `"permission"` key in opencode.json (not `"permissions"`)
- [ ] Bug 3 fixed: health timeout increased to 60s at call site
- [ ] Bug 4 conditionally applied: session permission (if SDK supports it)
- [ ] Docker image rebuilt successfully
- [ ] No "Health check timed out" in container logs
- [ ] No "Failed to create session" in container logs
- [ ] Task reaches `Done` state in DB
- [ ] PR exists on `https://github.com/viiqswim/ai-employee-test-target`
- [ ] `pnpm verify:e2e` all 12 checks pass
