# PLAT-11: Gateway Auto-Restart on Code Changes

## TL;DR

> **Quick Summary**: Add file-watching to the local dev environment so the Express gateway auto-restarts when source code changes, plus a warning when worker files change (reminding to rebuild Docker).
>
> **Deliverables**:
>
> - Graceful shutdown handling in `src/gateway/server.ts` (prevents EADDRINUSE on restart)
> - `scripts/dev.ts` modified to use `tsx watch` for the gateway process
> - Worker-change watcher that prints a Docker rebuild reminder
> - Updated summary banner showing auto-restart status
> - PLAT-11 story added to Phase 1 story map
>
> **Estimated Effort**: Short (S — half to one day)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (graceful shutdown) → Task 3 (dev.ts changes) → Task 4 (E2E verification)

---

## Context

### Original Request

Add auto-restart for the gateway server during local development so code changes take effect without manually stopping and restarting the entire dev stack. Also add this as PLAT-11 in the Phase 1 story map. Test thoroughly.

### Interview Summary

**Key Discussions**:

- **Current state**: Zero file-watching. Gateway is a child process of `scripts/dev.ts`, spawned via `spawn('node', ['--import', 'tsx/esm', 'src/gateway/server.ts'])`. Every code change requires Ctrl+C and re-run.
- **Approach**: Use `tsx watch` (already a devDependency, zero new packages). Replace the spawn call in `dev.ts`.
- **Watch scope**: `src/gateway/`, `src/inngest/`, `src/lib/` changes → auto-restart. `src/workers/`, `src/worker-tools/` changes → print warning to rebuild Docker.
- **Test strategy**: E2E restart verification (tmux + curl). No unit tests.
- **Epic placement**: PLAT-11 under Platform Infrastructure.

**Research Findings**:

- Gateway spawn: `scripts/dev.ts` lines 537–553. Uses `spawn('node', ['--import', 'tsx/esm', ...])` with `stdio: 'pipe'`, `serviceLog('gateway', C.cyan)` prefix, `gatewayEnv` with `USE_LOCAL_DOCKER`.
- `tsx watch` watches all files imported by the entry point. Files in `src/workers/` and `src/worker-tools/` are NOT imported by the gateway entry, so they won't be watched by tsx watch — a separate watcher is needed for the Docker rebuild warning.
- `src/gateway/server.ts` has NO graceful shutdown. `app.listen()` return value is not captured. No `server.close()` on SIGTERM. This creates EADDRINUSE risk when tsx watch restarts rapidly.
- The `gatewayProc.on('exit')` handler in dev.ts logs "exited with code X" — this fires only when the tsx watch process itself exits (not internal restarts), so no change needed.
- Node's `fs.watch` with `recursive: true` is supported on macOS (darwin) — suitable for the worker-change watcher without adding new dependencies.

### Metis Review

**Identified Gaps** (all addressed in this plan):

- **`--clear-screen=false` mandatory**: tsx watch clears the terminal by default, wiping all other service output. → Included in spawn command.
- **EADDRINUSE risk**: No graceful shutdown in `server.ts`. → Task 1 adds `server.close()` on SIGTERM.
- **Worker-change watcher needs separate mechanism**: tsx watch only watches imported files. → Task 3 adds `fs.watch` for worker dirs.
- **Exit handler behavior**: `gatewayProc.on('exit')` only fires when tsx watch process itself exits, not on internal restarts. → Verified, no change needed to exit handler.

---

## Work Objectives

### Core Objective

Eliminate the manual restart cycle during local development by making the gateway process auto-restart on code changes, while warning when Docker-dependent files change.

### Concrete Deliverables

- `src/gateway/server.ts` — graceful shutdown handler (capture `server` reference, close on SIGTERM)
- `scripts/dev.ts` — tsx watch spawn, worker-change watcher, updated banner
- `docs/planning/2026-04-21-2202-phase1-story-map.md` — PLAT-11 story added

### Definition of Done

- [ ] `pnpm dev` starts gateway with file watching enabled
- [ ] Editing a file in `src/gateway/` triggers automatic gateway restart (visible in terminal)
- [ ] Editing a file in `src/workers/` prints a yellow Docker rebuild warning (does NOT restart gateway)
- [ ] Inngest dev server and cloudflared tunnel are NOT affected by gateway restarts
- [ ] `pnpm build` exits 0
- [ ] `pnpm test -- --run` passes (pre-existing failures unchanged)

### Must Have

- `--clear-screen=false` on tsx watch (prevents terminal wipe)
- Graceful shutdown in `server.ts` (prevents EADDRINUSE)
- Worker-change warning for `src/workers/` AND `src/worker-tools/` directories
- Debounce on worker-change watcher (prevent warning spam during rapid saves)

### Must NOT Have (Guardrails)

- DO NOT add new npm dependencies (tsx is already available, fs.watch is Node built-in)
- DO NOT restart Inngest, Docker Compose, or cloudflared on gateway file changes
- DO NOT auto-rebuild Docker images on worker file changes (only warn)
- DO NOT modify the production Docker build or deployment path
- DO NOT add `nodemon` — use tsx watch (already a devDependency)
- DO NOT watch `node_modules/`, `dist/`, `prisma/`, or `.sisyphus/` directories

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None for this feature — E2E restart verification via tmux/curl is the primary strategy
- **Framework**: N/A
- **Rationale**: File-watching restart behavior is inherently E2E. Unit-testing a file watcher is low-value vs testing the actual restart cycle.

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Gateway restart**: Use Bash (tmux) — start dev, modify a file, confirm restart via curl
- **Worker warning**: Use Bash (tmux) — modify a worker file, confirm warning in terminal output
- **Build/test**: Use Bash — `pnpm build`, `pnpm test -- --run`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent tasks):
├── Task 1: Add graceful shutdown to server.ts [quick]
└── Task 2: Add PLAT-11 story to Phase 1 story map [quick]

Wave 2 (After Wave 1 — depends on graceful shutdown):
└── Task 3: Modify dev.ts — tsx watch + worker-change watcher [unspecified-high]

Wave 3 (After Wave 2 — E2E verification):
└── Task 4: E2E restart verification [deep]

Wave FINAL (After ALL tasks — parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Wave POST-FINAL:
└── Task 5: Notify completion [quick]

Critical Path: Task 1 → Task 3 → Task 4 → F1-F4 → user okay → Task 5
Parallel Speedup: Task 1 ∥ Task 2 saves one wave
Max Concurrent: 2 (Wave 1), 4 (Final)
```

### Dependency Matrix

| Task  | Depends On        | Blocks | Wave       |
| ----- | ----------------- | ------ | ---------- |
| 1     | —                 | 3      | 1          |
| 2     | —                 | —      | 1          |
| 3     | 1                 | 4      | 2          |
| 4     | 3                 | F1-F4  | 3          |
| F1-F4 | 4                 | 5      | FINAL      |
| 5     | F1-F4 + user okay | —      | POST-FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **1** — T3 → `unspecified-high`
- **Wave 3**: **1** — T4 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`
- **POST-FINAL**: **1** — T5 → `quick`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [x] 1. Add graceful shutdown to `src/gateway/server.ts`

  **What to do**:
  - Capture the `http.Server` return value from `app.listen()` in `server.ts` (currently discarded at line 190)
  - Add SIGTERM and SIGINT handlers that call `server.close()` then `process.exit(0)`
  - This ensures the port is released cleanly before tsx watch respawns the process
  - Keep it minimal — no draining logic needed for local dev

  **Must NOT do**:
  - Do NOT change the Express app setup, route registration, or Slack Bolt initialization
  - Do NOT add production-grade draining (connection tracking, timeout logic) — this is local dev only
  - Do NOT modify any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file, ~10 lines of code, well-understood pattern
  - **Skills**: `[]`
    - No special skills needed — standard Express shutdown pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3 (dev.ts changes depend on graceful shutdown being in place)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/gateway/server.ts:180-198` — Current startup code. `app.listen(port, '0.0.0.0', callback)` at line 190. The return value (`http.Server`) is NOT captured. This is where to add the server reference capture.
  - `src/workers/opencode-harness.mts` — Has a SIGTERM handler pattern (registers `process.on('SIGTERM', ...)` to patch task status). Follow similar style but for `server.close()`.

  **WHY Each Reference Matters**:
  - `server.ts:180-198` — This is the exact code to modify. You need to capture the `app.listen()` return value and add signal handlers after it.
  - The harness SIGTERM pattern shows the project's convention for signal handling (simple, direct, no frameworks).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Gateway starts and serves health endpoint
    Tool: Bash
    Preconditions: No other process on port 7700
    Steps:
      1. Run: node --import tsx/esm src/gateway/server.ts &
      2. Wait 3 seconds for startup
      3. Run: curl -s http://localhost:7700/health
      4. Assert: HTTP 200 response
      5. Run: kill $! (send SIGTERM to gateway process)
      6. Wait 1 second
      7. Run: lsof -i :7700 (check port is released)
    Expected Result: Port 7700 is NOT in use after SIGTERM — no output from lsof
    Failure Indicators: lsof shows a LISTEN socket on port 7700 after kill
    Evidence: .sisyphus/evidence/task-1-graceful-shutdown.txt

  Scenario: Rapid restart does not hit EADDRINUSE
    Tool: Bash
    Preconditions: No other process on port 7700
    Steps:
      1. Run: node --import tsx/esm src/gateway/server.ts &
      2. Wait 3 seconds for startup
      3. Run: kill $! (SIGTERM)
      4. Wait 500ms
      5. Run: node --import tsx/esm src/gateway/server.ts &
      6. Wait 3 seconds
      7. Run: curl -s http://localhost:7700/health
      8. Assert: HTTP 200
      9. Cleanup: kill $!
    Expected Result: Second startup succeeds without EADDRINUSE error
    Failure Indicators: stderr contains "EADDRINUSE" or process exits with code 1
    Evidence: .sisyphus/evidence/task-1-rapid-restart.txt
  ```

  **Evidence to Capture:**
  - [ ] task-1-graceful-shutdown.txt — port release verification
  - [ ] task-1-rapid-restart.txt — rapid restart verification

  **Commit**: YES
  - Message: `fix(gateway): add graceful shutdown for clean port release on restart`
  - Files: `src/gateway/server.ts`
  - Pre-commit: `pnpm build`

---

- [x] 2. Add PLAT-11 story to Phase 1 story map

  **What to do**:
  - Add PLAT-11 story to `docs/planning/2026-04-21-2202-phase1-story-map.md`
  - Insert the story block after PLAT-10 (line ~500) in the Platform Infrastructure epic section
  - Add PLAT-11 row to "Appendix A: Full Story Index" table (after PLAT-10 row at line ~1423)
  - Update the Epic Summary table: change PLAT story count from "10 stories" to "11 stories" (line 106)
  - Update total story count from "53 stories" to "54 stories" (line 112)
  - Update Appendix B complexity totals (add 1 S-complexity story)

  **Story content to insert** (use exact job story format matching existing PLAT stories):

  ```markdown
  #### PLAT-11: Gateway Auto-Restart on Code Changes

  > **When** I edit gateway, Inngest, or shared library code during local development, **I want** the gateway process to automatically restart with my changes, **so that** I don't have to manually Ctrl+C and re-run `pnpm dev` after every edit.

  | Attribute        | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
  | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **Complexity**   | S                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
  | **Validates**    | `[platform-eng]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
  | **Dependencies** | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
  | **Notes**        | Modifies `scripts/dev.ts` to spawn the gateway via `tsx watch` instead of `node --import tsx/esm`. `tsx` is already a devDependency. Also adds `fs.watch`-based monitoring of `src/workers/` and `src/worker-tools/` that prints a Docker rebuild warning (since those files are baked into the Docker image and need `docker build` to take effect). Requires graceful shutdown in `src/gateway/server.ts` to prevent EADDRINUSE on rapid restarts. Inngest dev server, Docker Compose, and cloudflared tunnel are NOT restarted — only the gateway process. |

  **Acceptance Criteria:**

  - [ ] `scripts/dev.ts` spawns gateway via `tsx watch --clear-screen=false` instead of `node --import tsx/esm`
  - [ ] Editing any `.ts` file in `src/gateway/`, `src/inngest/`, or `src/lib/` triggers automatic gateway restart
  - [ ] Editing files in `src/workers/` or `src/worker-tools/` prints a yellow warning: "Worker files changed — run `docker build` to apply"
  - [ ] Inngest dev server PID is unchanged after gateway restart
  - [ ] cloudflared tunnel connection is unchanged after gateway restart
  - [ ] `src/gateway/server.ts` has graceful shutdown (calls `server.close()` on SIGTERM)
  - [ ] No new npm dependencies added
  - [ ] `pnpm build` exits 0
  - [ ] `pnpm test -- --run` passes (pre-existing failures unchanged)
  ```

  **Appendix A row to insert** (after PLAT-10 row):

  ```
  | PLAT-11  | Gateway Auto-Restart on Code Changes                      | Platform Infrastructure | Any     | S          | None                                     |
  ```

  **Must NOT do**:
  - Do NOT modify any source code files
  - Do NOT change story content for other PLAT stories
  - Do NOT reformat existing story map content beyond the insertions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation-only task — markdown insertions in an existing file
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:263-282` — PLAT-01 story format (job story, attribute table, acceptance criteria). Copy this exact structure.
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:476-500` — PLAT-10 story (last PLAT story). Insert PLAT-11 immediately after PLAT-10's acceptance criteria and `---` separator.
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:106` — Epic Summary table, PLAT row shows "10 stories"
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:112` — Total story count "53 stories across 6 epics"
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:1414-1423` — Appendix A, PLAT rows in the full story index table
  - `docs/planning/2026-04-21-2202-phase1-story-map.md:1462-1477` — Appendix B, complexity totals

  **WHY Each Reference Matters**:
  - PLAT-01 format: Follow EXACTLY — job story quote, attribute table, acceptance criteria bullets
  - PLAT-10 location: Insert point for the new story
  - Epic Summary + Total: Must update counts to stay consistent
  - Appendix A: Must add row to keep index complete
  - Appendix B: Must update S-complexity count and total

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Story map is internally consistent after PLAT-11 addition
    Tool: Bash (grep)
    Preconditions: Story map file exists
    Steps:
      1. grep "PLAT-11" docs/planning/2026-04-21-2202-phase1-story-map.md — should find 3+ matches (story header, appendix A row, acceptance criteria)
      2. grep "11 stories" docs/planning/2026-04-21-2202-phase1-story-map.md — Epic Summary PLAT row updated
      3. grep "54 stories" docs/planning/2026-04-21-2202-phase1-story-map.md — Total count updated
      4. Verify PLAT-11 appears after PLAT-10 and before the next epic section
    Expected Result: All 4 checks pass — PLAT-11 present in story, index, and counts are correct
    Failure Indicators: grep returns 0 matches for PLAT-11, or counts still show old values
    Evidence: .sisyphus/evidence/task-2-story-map-consistency.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-story-map-consistency.txt — grep output confirming all insertions

  **Commit**: YES
  - Message: `docs(roadmap): add PLAT-11 gateway auto-restart story`
  - Files: `docs/planning/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

- [x] 3. Modify `scripts/dev.ts` — tsx watch for gateway + worker-change watcher

  **What to do**:

  **Part A — Replace gateway spawn with tsx watch:**
  - Change the spawn call at line 542 from:
    ```typescript
    spawn('node', ['--import', 'tsx/esm', 'src/gateway/server.ts'], { ... })
    ```
    to:
    ```typescript
    spawn('npx', ['tsx', 'watch', '--clear-screen=false', 'src/gateway/server.ts'], { ... })
    ```
  - Keep `stdio: 'pipe'`, `detached: false`, and `env: gatewayEnv` exactly as-is
  - Keep the `serviceLog('gateway', C.cyan)` pipe handlers on stdout/stderr
  - Keep the `gatewayProc.on('exit')` handler as-is (it only fires when tsx watch process itself exits, not on internal restarts)
  - The `children.push(gatewayProc)` and cleanup logic stays unchanged

  **Part B — Add worker-change watcher:**
  - After the gateway spawn section (after line ~566), add a new section:
    ```
    // ─────────────────────────────────────────────────────
    // Step 6c-watch: Worker file change warnings
    // ─────────────────────────────────────────────────────
    ```
  - Use Node's built-in `fs.watch` with `{ recursive: true }` on `src/workers/` and `src/worker-tools/`
  - On change, print: `warn('Worker files changed — run \`docker build -t ai-employee-worker:latest .\` to apply')`
  - Add a debounce (500ms) to prevent warning spam during rapid saves or editor auto-saves
  - Use the existing `warn()` helper (line 45) for consistent formatting

  **Part C — Update summary banner:**
  - In the summary banner section (lines 719-737), add a line after the Gateway URL:
    ```
    log(`  Gateway:    http://localhost:${GATEWAY_PORT} (auto-restart enabled)`);
    ```
    (replace the existing Gateway log line)

  **Must NOT do**:
  - Do NOT change how Inngest, Docker Compose, or cloudflared are spawned
  - Do NOT add new npm dependencies (fs.watch is Node built-in, npx/tsx are already available)
  - Do NOT watch `node_modules/`, `dist/`, `prisma/`, or `.sisyphus/` directories
  - Do NOT modify the cleanup function or SIGINT/SIGTERM handlers
  - Do NOT change the health check wait logic (Step 6b) — tsx watch starts the gateway process immediately, so the health check still works

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-part modification to a 741-line orchestration script. Requires understanding spawn lifecycle, file-watching semantics, and debounce logic. Not trivially simple.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: Task 4 (E2E verification)
  - **Blocked By**: Task 1 (graceful shutdown must be in place before tsx watch can restart safely)

  **References** (CRITICAL):

  **Pattern References**:
  - `scripts/dev.ts:537-553` — Current gateway spawn section. This is the EXACT code to modify. The `gatewayEnv`, `serviceLog`, `children.push`, and exit handler must all be preserved.
  - `scripts/dev.ts:504-517` — Inngest spawn section. Shows the `spawn('npx', [...])` pattern already used in this file. Follow the same pattern for tsx watch.
  - `scripts/dev.ts:41-47` — `log`, `ok`, `fail`, `info`, `warn`, `serviceLog` helpers. Use `warn()` for the Docker rebuild warning.
  - `scripts/dev.ts:124-151` — Cleanup function and children array. The tsx watch process is still a child — it gets SIGTERM on cleanup just like the current gateway process.
  - `scripts/dev.ts:719-737` — Summary banner. Update the Gateway line.

  **API/Type References**:
  - Node.js `fs.watch(path, { recursive: true }, callback)` — Built-in file watcher. Callback receives `(eventType, filename)`. `recursive: true` is supported on macOS (darwin). Import is already present at line 21: `import fs, { existsSync, readFileSync, writeFileSync } from 'node:fs'`.

  **WHY Each Reference Matters**:
  - Lines 537-553: The exact spawn call to modify — everything around it (env, pipe, exit handler) must stay intact
  - Lines 504-517: Proves `spawn('npx', [...])` pattern works in this file — use same approach for tsx
  - Lines 41-47: Use existing helpers for consistent output formatting
  - Lines 124-151: Verify cleanup still works with tsx watch (it does — same child process model)
  - Lines 719-737: Banner update location

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build succeeds with dev.ts changes
    Tool: Bash
    Preconditions: All task 1 and task 2 changes committed
    Steps:
      1. Run: pnpm build
      2. Assert: exits 0
    Expected Result: TypeScript compilation succeeds
    Failure Indicators: Non-zero exit code or type errors in dev.ts
    Evidence: .sisyphus/evidence/task-3-build.txt

  Scenario: dev.ts uses tsx watch for gateway spawn
    Tool: Bash (grep)
    Preconditions: dev.ts modified
    Steps:
      1. grep "tsx.*watch" scripts/dev.ts — should find the new spawn call
      2. grep "clear-screen=false" scripts/dev.ts — should find the flag
      3. grep -c "node.*--import.*tsx/esm.*server" scripts/dev.ts — should return 0 (old spawn removed)
    Expected Result: tsx watch spawn present, old node spawn removed
    Failure Indicators: Old spawn pattern still present or tsx watch not found
    Evidence: .sisyphus/evidence/task-3-spawn-verification.txt

  Scenario: Worker-change watcher code exists with debounce
    Tool: Bash (grep)
    Preconditions: dev.ts modified
    Steps:
      1. grep "fs.watch" scripts/dev.ts — should find worker watcher
      2. grep "docker build" scripts/dev.ts — should find the warning message
      3. grep -i "debounce\|setTimeout\|lastWarning\|lastNotify" scripts/dev.ts — should find debounce mechanism
    Expected Result: Worker watcher with debounce and Docker rebuild warning present
    Failure Indicators: Missing watcher, missing warning, or no debounce
    Evidence: .sisyphus/evidence/task-3-worker-watcher.txt
  ```

  **Evidence to Capture:**
  - [ ] task-3-build.txt — build output
  - [ ] task-3-spawn-verification.txt — grep confirmations
  - [ ] task-3-worker-watcher.txt — watcher code verification

  **Commit**: YES
  - Message: `feat(dev): auto-restart gateway on code changes with tsx watch`
  - Files: `scripts/dev.ts`
  - Pre-commit: `pnpm build`

---

- [x] 4. E2E restart verification

  **What to do**:
  - Start the full dev stack in a tmux session
  - Wait for the "Local Full-Stack Environment Ready" banner
  - Record the Inngest dev server PID before the test
  - Make a code change to a gateway file and verify the gateway restarts
  - Make a code change to a worker file and verify the warning appears
  - Verify the Inngest dev server PID is unchanged (not restarted)
  - Save all evidence
  - Kill the tmux session when done

  **Test procedure** (exact steps):
  1. Start dev: `tmux new-session -d -s ai-e2e -x 220 -y 50` then send `pnpm dev --skip-build 2>&1 | tee /tmp/ai-e2e.log`
  2. Wait for "Local Full-Stack Environment Ready" in log (poll every 5s, timeout 120s)
  3. Record Inngest PID: `pgrep -f "inngest-cli" | head -1` → save as `INNGEST_PID_BEFORE`
  4. Verify gateway is healthy: `curl -s http://localhost:7700/health` → expect 200
  5. **Gateway restart test**: Append a comment to `src/gateway/server.ts` (e.g., `// auto-restart test`), wait 5s, then `curl -s http://localhost:7700/health` → expect 200 (gateway restarted and is healthy again)
  6. Verify tsx watch restart message appears in `/tmp/ai-e2e.log` (look for "restarting" or similar tsx watch output)
  7. **Worker warning test**: Append a comment to `src/workers/opencode-harness.mts`, wait 3s, check `/tmp/ai-e2e.log` for "Worker files changed" warning
  8. **Inngest stability test**: `pgrep -f "inngest-cli" | head -1` → compare with `INNGEST_PID_BEFORE` — must be same PID
  9. **Revert test changes**: Remove the appended comments from both files
  10. Kill tmux: `tmux kill-session -t ai-e2e`

  **Must NOT do**:
  - Do NOT leave the tmux session running after the test
  - Do NOT leave test comments in source files
  - Do NOT modify the actual implementation — only test it

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-step E2E verification requiring tmux orchestration, timing-sensitive checks, and evidence capture. Needs patience and careful sequencing.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Wave 2)
  - **Blocks**: F1-F4 (Final Verification Wave)
  - **Blocked By**: Task 3 (needs the dev.ts changes in place)

  **References** (CRITICAL):

  **Pattern References**:
  - `AGENTS.md` — "Long-Running Commands" section. tmux session naming convention (`ai-e2e`), log file pattern (`/tmp/ai-e2e.log`), poll-then-kill pattern.
  - `AGENTS.md` — "Tmux Session Cleanup (MANDATORY)" section. Must kill session after test.

  **WHY Each Reference Matters**:
  - AGENTS.md long-running commands: Follow the exact tmux pattern for launching and polling
  - Cleanup rules: MUST kill the tmux session — leaving it running causes vnode exhaustion

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E auto-restart cycle
    Tool: Bash (tmux)
    Preconditions: All implementation tasks (1-3) committed. Docker image built. No processes on port 7700 or 8288.
    Steps:
      1. tmux new-session -d -s ai-e2e -x 220 -y 50
      2. Send: pnpm dev --skip-build 2>&1 | tee /tmp/ai-e2e.log
      3. Poll /tmp/ai-e2e.log for "Local Full-Stack Environment Ready" (timeout 120s)
      4. curl -s http://localhost:7700/health → assert 200
      5. Record INNGEST_PID=$(pgrep -f "inngest-cli" | head -1)
      6. echo "// e2e-test-marker" >> src/gateway/server.ts
      7. Sleep 8s (allow tsx watch to detect + restart + Express to bind)
      8. curl -s http://localhost:7700/health → assert 200 (gateway restarted successfully)
      9. grep -c "restarting\|Reloading" /tmp/ai-e2e.log → assert >= 1
      10. echo "// e2e-worker-test" >> src/workers/opencode-harness.mts
      11. Sleep 3s
      12. grep -c "Worker files changed" /tmp/ai-e2e.log → assert >= 1
      13. INNGEST_PID_AFTER=$(pgrep -f "inngest-cli" | head -1)
      14. Assert INNGEST_PID == INNGEST_PID_AFTER
      15. Revert: git checkout src/gateway/server.ts src/workers/opencode-harness.mts
      16. tmux kill-session -t ai-e2e
    Expected Result: Gateway restarts on gateway file change (steps 6-9), warning on worker file change (steps 10-12), Inngest PID unchanged (steps 13-14)
    Failure Indicators: curl returns non-200 after restart, no "restarting" in log, no "Worker files changed" warning, Inngest PID changed
    Evidence: .sisyphus/evidence/task-4-e2e-restart.txt (copy of /tmp/ai-e2e.log tail -100)

  Scenario: Gateway survives rapid saves without EADDRINUSE
    Tool: Bash (tmux)
    Preconditions: Dev stack running from previous scenario (or restart it)
    Steps:
      1. Start dev stack if not running (same tmux pattern)
      2. Wait for healthy gateway
      3. Rapidly append 3 comments to server.ts with 1s gaps: echo "// rapid-1" >> src/gateway/server.ts; sleep 1; echo "// rapid-2" >> src/gateway/server.ts; sleep 1; echo "// rapid-3" >> src/gateway/server.ts
      4. Wait 10s for final restart to settle
      5. curl -s http://localhost:7700/health → assert 200
      6. grep -c "EADDRINUSE" /tmp/ai-e2e.log → assert 0
      7. Revert: git checkout src/gateway/server.ts
      8. tmux kill-session -t ai-e2e
    Expected Result: Gateway healthy after rapid saves, no EADDRINUSE errors
    Failure Indicators: curl fails, EADDRINUSE appears in log
    Evidence: .sisyphus/evidence/task-4-rapid-save.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-e2e-restart.txt — full E2E cycle log
  - [ ] task-4-rapid-save.txt — rapid save stress test log

  **Commit**: NO (no code changes — verification only)

---

- [ ] 5. Notify completion

  Send Telegram notification: plan `plat-11-gateway-auto-restart` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "📋 plat-11-gateway-auto-restart complete — All tasks done. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Blocked By**: F1-F4 + user okay
  - **Blocks**: None

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` + linter + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start `pnpm dev --skip-build` from clean state. Wait for "Local Full-Stack Environment Ready" banner. Verify gateway auto-restarts on file change. Verify worker-change warning appears. Verify Inngest and tunnel unaffected. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                 | Files                                               | Pre-commit   |
| ---------- | ----------------------------------------------------------------------- | --------------------------------------------------- | ------------ |
| 1          | `fix(gateway): add graceful shutdown for clean port release on restart` | `src/gateway/server.ts`                             | `pnpm build` |
| 2          | `docs(roadmap): add PLAT-11 gateway auto-restart story`                 | `docs/planning/2026-04-21-2202-phase1-story-map.md` | —            |
| 3          | `feat(dev): auto-restart gateway on code changes with tsx watch`        | `scripts/dev.ts`                                    | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: exits 0
pnpm test -- --run  # Expected: pre-existing failures only (container-boot, inngest-serve)
pnpm dev --skip-build  # Expected: gateway starts with file watching, restarts on changes
```

### Final Checklist

- [ ] All "Must Have" present (--clear-screen=false, graceful shutdown, worker warning, debounce)
- [ ] All "Must NOT Have" absent (no new deps, no Inngest restart, no auto Docker rebuild)
- [ ] Gateway auto-restarts on `src/gateway/`, `src/inngest/`, `src/lib/` changes
- [ ] Worker-change warning fires on `src/workers/`, `src/worker-tools/` changes
- [ ] Inngest dev server PID unchanged after gateway restart
- [ ] All tests pass (pre-existing failures unchanged)
