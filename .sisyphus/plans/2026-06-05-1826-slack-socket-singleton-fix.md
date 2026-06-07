# Slack Socket Mode Singleton — Fix Zombie-Gateway Event Theft + Mandate Live E2E

## TL;DR

> **Quick Summary**: Root cause confirmed against live processes: `scripts/dev.ts`'s Step-0 stale-process reaper uses the regex `tsx.*watch.*server\.ts`, which matches the two `tsx watch` supervisor processes but **NOT** the real gateway leaf (`node …/tsx/dist/loader.mjs src/gateway/server.ts` — no "watch" token). Because the gateway is spawned `detached: true`, an unclean death of `dev.ts` (kill -9 / tmux-kill / crash) orphans that leaf, which keeps its Slack Socket Mode WebSocket open. Slack load-balances each event to exactly ONE connected socket, so with a zombie + a fresh gateway alive, ~50% of `app_mention` events are delivered to the dead zombie → no log, no ack, no task. This exactly explains the 5:10pm/5:20pm failures (zombie present, restart left it alive and added another) and the 5:51pm success (manual kill with a broader pattern that matched the leaf). Fix: (A) anchor the reaper on the absolute repo path so it kills the real leaf without over-matching; (B) add a Socket-Mode-gated, takeover-capable single-instance lock in the gateway + call `boltApp.stop()` on shutdown; (C) rewrite AGENTS.md Known Issue #4 with the accurate mechanism; (D) mandate a real live @mention → Confirm → Done Slack E2E (with a pre-flight single-gateway assertion) for every plan touching this workflow.
>
> **Deliverables**:
>
> - `scripts/dev.ts` — Step-0 reaper anchored on `process.cwd()` absolute path (kills the real gateway leaf, not just supervisors); Inngest + Dashboard patterns audited/fixed the same way; over-match guarded.
> - `src/gateway/server.ts` — Socket-Mode-gated, takeover-capable single-instance lock acquired immediately before `boltApp.start()`; `await boltApp.stop()` added to SIGINT/SIGTERM handlers; lock released on shutdown.
> - `src/gateway/lib/socket-mode-lock.ts` (NEW) — small dependency-light file lock helper (acquire/release/reclaim-stale), used ONLY by the gateway. No reusable process-manager abstraction.
> - `AGENTS.md` — Known Issue #4 rewritten with the real root cause (Slack socket load-balancing, the broken regex, detached-orphan-on-unclean-death); Plan E2E Validation section extended to mandate a live @mention E2E + single-gateway pre-flight for any Slack-trigger-workflow change.
> - New/updated unit tests for the lock helper + a documented live Slack E2E run (task ID + status trace).
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — Wave 1 (lock helper + reaper fix + docs, file-disjoint) → Wave 2 (gateway integration, depends on lock helper) → Wave 3 (tests) → Final Verification Wave (incl. live Slack E2E)
> **Critical Path**: Task 1 (lock helper) → Task 4 (gateway integration) → Task 6 (lock tests) → Final Wave (live E2E)

---

## Context

### Original Request

User reported (verbatim): an @mention in `ops-cleaning-schedule` — `@Papi chulo puedes generarme el itinerario de limpieza para Junio 10, 2026?` — produced no response. The server had been running for a while before the first attempt. User restarted, sent again at 5:20pm — still nothing. At 5:51pm (after the agent killed processes and restarted) it worked. User demands the TRUE root cause so this never recurs, and wants live Slack E2E testing mandated for any future change to this workflow.

User decisions (this session):

- Plan ALL of: (A) dev.ts kill fix, (B) single-instance gateway guard, (C) accurate AGENTS.md #4 rewrite, (D) mandatory live @mention E2E — in ONE plan.
- Do NOT investigate the 38 Reviewing-state zombies (explicitly out of scope).
- Root cause must be understood BEFORE documenting (now confirmed — see below).

### Root Cause (verified against live processes this session)

The local dev launcher `scripts/dev.ts` spawns the gateway (line 595) as:
`npx tsx watch --clear-screen=false src/gateway/server.ts` with `detached: true` (line 600).

`tsx watch` is a SUPERVISOR. It forks a CHILD `node` process which is the ACTUAL gateway that opens the Slack Socket Mode WebSocket. Three processes form the tree:

| Process                                                  | Holds Slack WSS? | Matches `dev.ts` reaper `tsx.*watch.*server\.ts`? |
| -------------------------------------------------------- | ---------------- | ------------------------------------------------- |
| `npm exec tsx watch …` (supervisor)                      | no               | YES                                               |
| `tsx watch` (supervisor)                                 | no               | YES                                               |
| `node …/loader.mjs src/gateway/server.ts` (REAL gateway) | **YES**          | **NO** (argv has no "watch" token)                |

So `pkill -f "tsx.*watch.*server\.ts"` (dev.ts:227) kills the supervisors and LEAVES the real gateway alive. Because it was spawned detached, killing the supervisor does not reap the child on unclean death — it's orphaned and KEEPS the Slack socket. Slack Socket Mode delivers each event to exactly ONE connected socket and load-balances across them; with ≥2 gateways alive, ~50% of `app_mention` events go to the zombie → silent loss.

### Metis Findings (corrections to initial assumptions — `ses_165e6c52cffe7vYEoFvHmr1ey2`)

1. **The clean-shutdown path is NOT broken.** `dev.ts:154` already uses `process.kill(-child.pid, 'SIGTERM')` (process-GROUP kill). On a clean Ctrl+C this DOES reap the tsx-watch child. Orphaning occurs ONLY on unclean death (kill -9 / tmux kill-session / crash). **The defect is the Step-0 startup reaper regex, NOT the SIGINT cleanup.** The plan must not claim otherwise.
2. **The gateway never calls `boltApp.stop()`** (`server.ts:304-310` only does `server.close()`) — even a clean shutdown can leave the Socket Mode WS open during the close window. Adding `boltApp.stop()` is a first-class part of the fix.
3. **A port-lock on :7700 is insufficient.** HTTP `app.listen` (server.ts:300) and `boltApp.start()` Socket Mode (server.ts:126) are independent; a zombie can lose :7700 yet keep its Slack WS. The guard MUST gate **Socket Mode startup**, conditional on `SLACK_APP_TOKEN`.
4. **Takeover requirement**: `tsx watch` kills+reforks the gateway child on every file save. A naive "PID file exists → exit" lock would permanently break hot-reload. The lock MUST be takeover-capable (newcomer reclaims a dead/dying predecessor's lock).
5. **Over-match risk**: a bare relative `pgrep -f "gateway/server.ts"` could kill processes in another clone, a debugger, or an editor/LSP. MUST anchor on the absolute repo path.
6. **Production unaffected**: Render runs one container/one process; the bug is local-dev-only. The lock must be a harmless no-op for a single instance and must not sit on a persistent volume.

### Key Code Locations (verified)

- Reaper block: `scripts/dev.ts:213-236` (patterns at 217-221, pgrep 223, pkill 227).
- Gateway spawn: `scripts/dev.ts:595-603` (`detached: true` at 600).
- Inngest spawn: `scripts/dev.ts:551-561`; Dashboard spawn: `scripts/dev.ts:805-808` (`pnpm dev --port 7701` → vite leaf).
- dev.ts cleanup (group-kill, already correct): `scripts/dev.ts:130-162`.
- Gateway Socket Mode start: `src/gateway/server.ts:107-156` (`boltApp.start()` at 126-127).
- Gateway shutdown handlers (need `boltApp.stop()`): `src/gateway/server.ts:304-310`.
- Non-socket path (CI, `SLACK_APP_TOKEN` unset → ExpressReceiver): `src/gateway/server.ts:157-173`.
- AGENTS.md Known Issue #4: `AGENTS.md` "### 4. Stale detached processes…".
- E2E mandate convention: `AGENTS.md` "## Plan E2E Validation (MANDATORY)".

---

## Work Objectives

### Core Objective

Guarantee that exactly ONE gateway ever holds the Slack Socket Mode connection on a dev machine, so no `app_mention` is ever silently stolen by a zombie — by (A) fixing the dev.ts startup reaper to kill the real gateway leaf, (B) adding a Socket-Mode-gated single-instance lock + clean Bolt shutdown in the gateway, (C) documenting the true root cause, and (D) mandating a live Slack @mention E2E for this workflow.

### Concrete Deliverables

- `scripts/dev.ts` (reaper anchored on absolute repo path; Inngest/Dashboard audited).
- `src/gateway/server.ts` (single-instance lock before `boltApp.start()`; `boltApp.stop()` on shutdown).
- `src/gateway/lib/socket-mode-lock.ts` (NEW lock helper).
- `AGENTS.md` (Known Issue #4 rewrite + E2E mandate).
- Unit tests for the lock helper + a documented live Slack E2E run.

### Definition of Done

- [ ] After `pnpm dev`, exactly ONE gateway leaf holds the Slack socket (`pgrep` count = 1).
- [ ] An orphaned gateway from a simulated unclean death is reaped by the next `pnpm dev` Step 0.
- [ ] A decoy process whose argv contains `gateway/server.ts` from a DIFFERENT path survives Step 0 (no over-match).
- [ ] A second gateway started while one holds the lock refuses Socket Mode and exits non-zero with a clear log line.
- [ ] `tsx watch` hot-reload still works: after `touch src/gateway/server.ts`, exactly one gateway reconnects Socket Mode.
- [ ] Gateway SIGINT/SIGTERM calls `boltApp.stop()`; lock is released.
- [ ] Guard is a no-op when `SLACK_APP_TOKEN` is unset (CI / ExpressReceiver path).
- [ ] AGENTS.md Issue #4 names the Slack-socket load-balancing mechanism, the broken regex, and the detached-orphan-on-unclean-death cause.
- [ ] AGENTS.md E2E convention mandates a live @mention → Confirm → Done check + single-gateway pre-flight for Slack-trigger-workflow changes.
- [ ] Live Slack E2E executed and documented (task ID + `task_status_log` trace reaching `Done`).
- [ ] `pnpm build` clean; lock-helper tests pass; no NEW test failures vs baseline.

### Must Have

- Reaper anchored on `process.cwd()` absolute path (or kill-by-PID-file); never a bare relative substring.
- Single-instance lock gated on `boltApp.start()` (Socket Mode), conditional on `SLACK_APP_TOKEN`, takeover-capable (reclaims dead/dying predecessor), with liveness (`process.kill(pid,0)`) + identity validation.
- `await boltApp.stop()` in both gateway signal handlers; lock released in the same path.
- AGENTS.md Issue #4 + E2E mandate edited in place (no new doc files).

### Must NOT Have (Guardrails)

- Do NOT claim or "fix" the `dev.ts` SIGINT/`cleanup()` group-kill path as broken — `dev.ts:154` is already correct on clean exit. The defect is the Step-0 reaper regex + unclean-death orphaning.
- Do NOT gate the single-instance guard on the HTTP `:7700` bind — it must gate Socket Mode startup specifically.
- Do NOT build a reusable process-manager / generic lock library — one small helper, used only by the gateway.
- Do NOT add locks to Inngest or Dashboard (they don't hold the Slack socket). Auditing their kill patterns is in scope; locking them is not.
- Do NOT modify Slack handler dedup logic (`handlers.ts`) — the fix is process-singleton, not dedup.
- Do NOT change production shutdown semantics beyond adding `boltApp.stop()`.
- Do NOT place the lock file on a persistent/Render volume (must be local/tmp so a crashed-container restart isn't blocked).
- Do NOT investigate or touch the 38 Reviewing-state zombies (explicitly out of scope per user).
- Do NOT refactor unrelated parts of `dev.ts` (tunnel logic, health loops, Docker steps).

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION for unit-level ACs** — all agent-executed. The live Slack @mention step inherently requires a human to send the message; this is the ONE sanctioned manual touch and is the entire point of Part D. Everything else is scripted.

### Test Decision

- **Infrastructure exists**: YES (Vitest).
- **Automated tests**: Tests-after for the lock helper (pure, unit-testable). Process-reaper + hot-reload behaviors are verified by scripted shell assertions in the Final Wave (not Vitest — they need real processes).
- **Framework**: Vitest for `socket-mode-lock.ts`; shell assertions for process/E2E behavior.

### QA Policy

Every task includes agent-executed QA. Process-level scenarios use `interactive_bash` (tmux) + `pgrep`/`kill -0`/`lsof`. The live Slack scenario uses real DB + Slack API verification (task reaches `Done`). Evidence saved to `.sisyphus/evidence/`.

- **Lock helper**: Bash (vitest) — acquire/release/reclaim-stale unit tests.
- **Reaper / hot-reload / second-gateway**: interactive_bash (tmux) — start real processes, assert `pgrep` counts, exit codes, log lines.
- **Live Slack E2E**: Bash (psql + Slack API) — single-gateway pre-flight, @mention, Confirm, assert `tasks.status = Done`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — file-disjoint foundations):
├── Task 1: socket-mode-lock.ts helper (NEW file) [deep]
├── Task 2: dev.ts Step-0 reaper fix + Inngest/Dashboard audit [deep]
└── Task 3: AGENTS.md Issue #4 rewrite + E2E mandate [writing]

Wave 2 (After Wave 1 — gateway integration depends on lock helper):
└── Task 4: Integrate lock into server.ts + boltApp.stop() on shutdown (depends: 1) [deep]

Wave 3 (After Wave 2 — tests):
├── Task 5: Unit tests for socket-mode-lock.ts (depends: 1) [quick]
└── Task 6: dev.ts reaper assertion notes / helper script if needed (depends: 2, 4) [quick]

Wave FINAL (after ALL — 4 parallel reviews + live E2E, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + build + lock tests (unspecified-high)
├── F3: Real QA — reaper/hot-reload/second-gateway + LIVE Slack @mention E2E (unspecified-high + e2e-testing)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 6 → Final Wave (live E2E)
```

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep`, T2 → `deep`, T3 → `writing`
- **Wave 2**: T4 → `deep`
- **Wave 3**: T5 → `quick`, T6 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+ `e2e-testing`), F4 → `deep`

---

## TODOs

- [x] 1. Create `src/gateway/lib/socket-mode-lock.ts` — single-instance lock helper

  **What to do**:
  - New file exporting `acquireSocketModeLock()` and `releaseSocketModeLock()`.
  - Lock file at an OS-temp path (e.g. `os.tmpdir()/ai-employee-gateway-socketmode.lock`) — NOT in the repo, NOT on any persistent volume.
  - `acquireSocketModeLock()` writes the current `process.pid`. If the file already exists: read the stored PID, check liveness via `process.kill(pid, 0)` AND identity (best-effort: the stored PID's cmdline includes this repo's `gateway/server.ts`). If the holder is dead OR is a dying/stale predecessor → reclaim (overwrite with our PID, return acquired). If a live, valid holder exists → return `{ acquired: false, holderPid }` (caller will refuse + exit).
  - Takeover-capable: a `tsx watch` reload spawns a new child while the old is exiting; the newcomer must reclaim within a short retry window (e.g. up to ~2s of 100ms polls) rather than hard-fail immediately.
  - `releaseSocketModeLock()` deletes the file only if it still holds our PID (avoid deleting a successor's lock).

  **Must NOT do**: No reusable/generic lock library; no external dependency if avoidable (use `node:fs`/`node:os`). Do NOT couple to HTTP port. Do NOT place the lock in the repo or on a Render volume.

  **Recommended Agent Profile**: `deep` — concurrency-sensitive correctness (stale reclaim + reload race). Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: 4, 5 | Blocked By: None.

  **References**:
  - `src/gateway/server.ts:107-156` — where `boltApp.start()` is called (the lock's consumer).
  - Metis directives (`ses_165e6c52cffe7vYEoFvHmr1ey2`): takeover-capable, liveness (`process.kill(pid,0)`) + identity validation, temp path not persistent volume.
  - **WHY**: This is the durable fix — even if the reaper misses a zombie, the lock prevents a second Socket Mode connection from forming.

  **Acceptance Criteria**:

  ```
  Scenario: Lock acquired when free
    Tool: Bash (vitest)
    Steps:
      1. Call acquireSocketModeLock() in a clean temp dir → returns { acquired: true }
      2. Lock file contains current PID
    Evidence: .sisyphus/evidence/task-1-acquire.txt

  Scenario: Second acquire blocked by live holder
    Tool: Bash (vitest)
    Steps:
      1. Acquire once (PID A, kept alive)
      2. Second acquire with a live A → returns { acquired: false, holderPid: A }
    Evidence: .sisyphus/evidence/task-1-blocked.txt

  Scenario: Stale lock reclaimed (dead holder)
    Tool: Bash (vitest)
    Steps:
      1. Write lock file with a guaranteed-dead PID (e.g. a PID that exited)
      2. acquireSocketModeLock() → reclaims, returns { acquired: true }
    Evidence: .sisyphus/evidence/task-1-reclaim.txt
  ```

  **Commit**: YES — `feat(gateway): add socket-mode single-instance lock helper` (commit 1) — Pre-commit: `pnpm build`.

- [x] 2. Fix `scripts/dev.ts` Step-0 reaper to kill the real gateway leaf (anchored on repo path)

  **What to do** (`scripts/dev.ts:213-236`):
  - Change the Gateway kill pattern from `tsx.*watch.*server\\.ts` to an absolute-path-anchored pattern that matches the real leaf, e.g. derive `repoRoot = process.cwd()` and use `pgrep -f "${repoRoot}/src/gateway/server.ts"` / `pkill -f "${repoRoot}/src/gateway/server.ts"`. This matches BOTH supervisors AND the leaf (all three share the absolute path), while NOT matching other clones/editors/debuggers.
  - Audit the Inngest (`inngest-cli.*8288`) and Dashboard (`vite.*${DASHBOARD_PORT}`) patterns the same way: verify against `pgrep -fl` post-startup whether each matches the real leaf; if a supervisor-vs-leaf gap exists, anchor it on the repo path too. Document the finding inline (comment) for each.
  - Keep the existing loop structure, warn-count logging, and 500ms settle. Do NOT touch the `cleanup()` function (dev.ts:130-162) — its group-kill is already correct for clean exits.

  **Must NOT do**: Do NOT use a bare relative `gateway/server.ts` substring (over-match risk). Do NOT relabel/modify the SIGINT `cleanup()` path. Do NOT refactor any other dev.ts step.

  **Recommended Agent Profile**: `deep` — over-match risk is the highest-severity guardrail. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: 6 | Blocked By: None.

  **References**:
  - `scripts/dev.ts:217-227` — the reaper loop (patterns, pgrep, pkill).
  - `scripts/dev.ts:595-603` (gateway spawn, `detached:true`), `551-561` (Inngest), `805-808` (Dashboard).
  - Live evidence this session: leaf cmdline = `node …/tsx/dist/loader.mjs src/gateway/server.ts` (no "watch"); absolute path matched the leaf, `tsx.*watch.*server\.ts` did not.
  - **WHY**: This is the startup safety net for the unclean-death orphan case.

  **Acceptance Criteria**:

  ```
  Scenario: Reaper kills an orphaned gateway leaf
    Tool: interactive_bash (tmux)
    Steps:
      1. Start pnpm dev; confirm gateway leaf alive
      2. kill -9 the dev.ts PARENT (simulate unclean death); confirm leaf orphaned + still holds socket
      3. Run pnpm dev again
      4. Assert: pgrep -f "$(pwd)/src/gateway/server.ts" | wc -l == 1 (orphan reaped, only new one)
    Evidence: .sisyphus/evidence/task-2-reaper.txt

  Scenario: Decoy with same filename from different path survives (no over-match)
    Tool: interactive_bash
    Steps:
      1. mkdir -p /tmp/decoy/src/gateway && create a script; launch `node -e "setTimeout(()=>{},3e5)" .../gateway/server.ts`-style decoy whose argv contains "gateway/server.ts" but NOT the repo path
      2. Run dev.ts Step 0 logic
      3. Assert: kill -0 <decoy_pid> succeeds (NOT killed)
    Evidence: .sisyphus/evidence/task-2-decoy.txt
  ```

  **Commit**: YES — `fix(dev): reap the real gateway leaf process, anchored on repo path` (commit 2) — Pre-commit: `pnpm build`.

- [x] 3. Rewrite AGENTS.md Known Issue #4 + extend Plan E2E Validation mandate

  **What to do**:
  - Rewrite "### 4. Stale detached processes from previous `pnpm dev` sessions" to add: (a) Slack Socket Mode delivers each event to exactly ONE connected socket and load-balances across them, so a zombie gateway steals ~50% of `app_mention` events; (b) the specific broken reaper regex `tsx.*watch.*server\.ts` did not match the real leaf (`node …/loader.mjs src/gateway/server.ts`); (c) orphaning occurs on UNCLEAN death (kill -9 / tmux kill-session / crash) — clean Ctrl+C already group-kills correctly; (d) updated diagnosis command: `pgrep -f "$(pwd)/src/gateway/server.ts" | wc -l` should be 1; (e) note the single-instance lock now prevents a second Socket Mode connection.
  - In "## Plan E2E Validation (MANDATORY)": add a rule that ANY plan modifying the Slack trigger workflow (app_mention handler, slack-trigger-handler, interaction-handler/classifier, confirmation cards, slack-copy) MUST include a live @mention → Confirm → task-`Done` E2E, preceded by a single-gateway pre-flight assertion (`pgrep` count = 1). "Verified from code" is explicitly insufficient.

  **Must NOT do**: Do NOT create new doc files. Do NOT claim the SIGINT cleanup path is broken. Keep edits scoped to those two sections.

  **Recommended Agent Profile**: `writing` — precise technical prose. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: None | Blocked By: None.

  **References**:
  - `AGENTS.md` "### 4. Stale detached processes…" and "## Plan E2E Validation (MANDATORY)".
  - Root cause section of THIS plan (verbatim mechanism).
  - **WHY**: User explicitly required the root cause documented accurately and live E2E mandated so this never recurs.

  **Acceptance Criteria**:

  ```
  Scenario: Issue #4 names the real mechanism
    Tool: Bash
    Steps:
      1. grep -A30 "### 4. Stale detached" AGENTS.md
      2. Assert mentions: "Socket Mode" + "one" socket + the broken regex + "unclean"/"kill -9"
    Evidence: .sisyphus/evidence/task-3-agents.txt

  Scenario: E2E mandate added
    Tool: Bash
    Steps:
      1. grep -A20 "Plan E2E Validation" AGENTS.md
      2. Assert mentions a live @mention → Confirm → Done requirement + single-gateway pre-flight
    Evidence: .sisyphus/evidence/task-3-e2e-mandate.txt
  ```

  **Commit**: YES — `docs(agents): rewrite Known Issue #4 with Slack-socket root cause + mandate live E2E` (commit 3) — Pre-commit: none.

- [x] 4. Integrate the lock into `src/gateway/server.ts` + stop Bolt on shutdown

  **What to do**:
  - Inside the `if (appToken)` Socket Mode branch (`server.ts:107-156`), immediately BEFORE `boltApp.start()` (line 126): call `acquireSocketModeLock()`. If `acquired === false`, log a clear refusal (e.g. `"Another gateway already holds the Slack Socket Mode lock (pid <holderPid>) — refusing to start Socket Mode to avoid stealing events"`) and `process.exit(1)` — do NOT call `boltApp.start()`. This makes a second gateway fail LOUDLY instead of silently stealing events.
  - The guard runs ONLY in the `if (appToken)` branch — when `SLACK_APP_TOKEN` is unset (ExpressReceiver/CI path, server.ts:157-173), the lock is never touched (no-op).
  - Add `await boltApp?.stop()` and `releaseSocketModeLock()` to BOTH the SIGINT and SIGTERM handlers (`server.ts:304-310`) before `process.exit(0)`. Keep `server.close()`.
  - Use `lsp_find_references` on `boltApp` to confirm all start/stop sites before editing.

  **Must NOT do**: Do NOT gate on the HTTP `:7700` bind. Do NOT acquire the lock outside the Socket Mode branch. Do NOT change other server startup logic. Do NOT swallow the refusal silently — it must exit non-zero.

  **Recommended Agent Profile**: `deep` — lifecycle ordering + shutdown correctness. Skills: [].

  **Parallelization**: Can Run In Parallel: NO | Blocks: 6 | Blocked By: 1.

  **References**:
  - `src/gateway/server.ts:107-156` (Socket Mode branch, `boltApp.start()` at 126), `157-173` (no-token path), `304-310` (signal handlers).
  - `src/gateway/lib/socket-mode-lock.ts` (Task 1 exports).
  - Metis: gate Socket Mode not HTTP; conditional on `SLACK_APP_TOKEN`; add `boltApp.stop()`.
  - **WHY**: The lock is only effective once the gateway actually consults it before connecting and releases it on the way out.

  **Acceptance Criteria**:

  ```
  Scenario: Second gateway refuses Socket Mode
    Tool: interactive_bash (tmux)
    Steps:
      1. Start gateway #1 (holds lock, "Socket Mode connected")
      2. In another shell: npx tsx src/gateway/server.ts
      3. Assert: exits non-zero AND logs the refusal line AND does NOT connect Socket Mode
    Evidence: .sisyphus/evidence/task-4-refuse.txt

  Scenario: Hot-reload survives (takeover)
    Tool: interactive_bash
    Steps:
      1. pnpm dev running; touch src/gateway/server.ts
      2. Wait for tsx-watch reload
      3. Assert: "Socket Mode connected" from the NEW child AND pgrep count == 1
    Evidence: .sisyphus/evidence/task-4-hotreload.txt

  Scenario: No-op without SLACK_APP_TOKEN
    Tool: interactive_bash
    Steps:
      1. Start gateway with SLACK_APP_TOKEN unset
      2. Assert: ExpressReceiver path taken, no lock file created, no refusal
    Evidence: .sisyphus/evidence/task-4-notoken.txt
  ```

  **Commit**: YES — `fix(gateway): gate Socket Mode on single-instance lock + stop Bolt on shutdown` (commit 4) — Pre-commit: `pnpm build`.

- [x] 5. Unit tests for `socket-mode-lock.ts`

  **What to do** (new `tests/gateway/socket-mode-lock.test.ts`):
  - Acquire-when-free → `{ acquired: true }`, lock file has our PID.
  - Blocked-by-live-holder → `{ acquired: false, holderPid }` (mock/keep a live PID).
  - Reclaim-stale (dead PID) → `{ acquired: true }`.
  - Release only deletes when we still hold it (write a successor PID, call release, assert file NOT deleted).
  - Use a temp dir per test; clean up after.

  **Must NOT do**: No live Slack/socket. Tests-only. No reliance on real `tsx watch`.

  **Recommended Agent Profile**: `quick` — straightforward unit tests. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 3) | Blocks: F1-F4 | Blocked By: 1.

  **References**:
  - `src/gateway/lib/socket-mode-lock.ts` (Task 1).
  - Existing test harness conventions under `tests/gateway/`.
  - **WHY**: The lock's stale-reclaim + don't-delete-successor logic is the subtle correctness core; only unit tests pin it down deterministically.

  **Acceptance Criteria**:

  ```
  Scenario: Lock tests pass (>=4 tests)
    Tool: Bash (vitest)
    Steps:
      1. pnpm exec vitest run tests/gateway/socket-mode-lock.test.ts 2>&1 | tail -8
      2. Assert: 0 failures; >= 4 tests (acquire, blocked, reclaim-stale, release-guard)
    Evidence: .sisyphus/evidence/task-5-tests.txt
  ```

  **Commit**: YES — `test(gateway): cover socket-mode-lock acquire/release/reclaim-stale` (commit 5) — Pre-commit: `pnpm exec vitest run tests/gateway/socket-mode-lock.test.ts`.

- [x] 6. Reaper/hot-reload verification helper (optional scratch) + Telegram completion

  **What to do**:
  - If the Final Wave F3 process-assertions benefit from a small reusable shell snippet (single-gateway count, decoy spawn/cleanup), capture it as an inline documented block in the notepad (NOT a committed script) so QA is repeatable. This task is primarily the bridge to verification; no production code.
  - After F1-F4 pass and the user approves: send Telegram — `npx tsx scripts/telegram-notify.ts "✅ slack-socket-singleton-fix complete — dev.ts reaper now kills the real gateway leaf, gateway enforces a Socket Mode single-instance lock + stops Bolt on shutdown, AGENTS.md #4 documents the true root cause, and live @mention E2E is mandated. Come back to review."`

  **Must NOT do**: Do NOT commit scratch scripts (delete in F5). Do NOT add production code here.

  **Recommended Agent Profile**: `quick`. Skills: []. | **Blocked By**: 2, 4 | **Commit**: NO.

  **Acceptance Criteria**:

  ```
  Scenario: Telegram sent
    Tool: Bash
    Steps:
      1. npx tsx scripts/telegram-notify.ts "✅ slack-socket-singleton-fix complete ..."
      2. Assert: exit 0, stdout "[telegram] Notification sent."
    Evidence: .sisyphus/evidence/task-6-telegram.txt
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never check F1-F4 before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists. Confirm: reaper anchored on absolute repo path (no bare relative substring); single-instance lock gated on `boltApp.start()` + conditional on `SLACK_APP_TOKEN` + takeover-capable + liveness/identity validated; `boltApp.stop()` added to both signal handlers; AGENTS.md Issue #4 names all three root-cause elements; E2E mandate added. For each "Must NOT Have": grep for violations (SIGINT cleanup NOT relabeled broken; no :7700-bind-based gating; no reusable lock library; no Inngest/Dashboard locks; handlers.ts dedup untouched; lock file not on persistent volume; 38 zombies untouched).
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality + Build** — `unspecified-high`
      Run `pnpm exec vitest run` on the lock-helper test file + `pnpm build` + `pnpm exec eslint` on changed files. Review changed lines for: `as any`/`@ts-ignore`, empty catches, lock acquired BEFORE `boltApp.start()` and released in shutdown, guard short-circuits when `SLACK_APP_TOKEN` unset, reaper anchor uses absolute path. Confirm no NEW test failures vs baseline.
      Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Build [PASS/FAIL] | VERDICT`

- [x] F3. **Real QA — process behavior + LIVE Slack @mention E2E** — `unspecified-high` (+ `e2e-testing` skill)
      (a) Reaper: start `pnpm dev` in tmux; simulate unclean death (`kill -9` the dev.ts parent, leave the gateway child orphaned); confirm an orphan survives; run `pnpm dev` again; assert Step 0 reaped it → `pgrep -f "$(pwd)/src/gateway/server.ts" | wc -l` = 1.
      (b) Over-match guard: spawn a decoy `sleep 300` whose argv contains `gateway/server.ts` from a DIFFERENT path; run Step 0; assert `kill -0 <decoy>` still succeeds (NOT killed).
      (c) Second-gateway: with one gateway holding the lock, start `npx tsx src/gateway/server.ts` in another shell; assert it refuses Socket Mode, exits non-zero, logs the refusal.
      (d) Hot-reload: with `pnpm dev` running, `touch src/gateway/server.ts`; after reload assert exactly one gateway reconnects Socket Mode (count = 1, "Socket Mode connected" from the new child).
      (e) **LIVE Slack E2E**: pre-flight assert exactly ONE gateway alive; ask the user to @mention the cleaning-schedule bot in `ops-cleaning-schedule` (or trigger a channel-assigned employee); watch DB + Inngest + Slack thread; click Confirm; assert `tasks.status` reaches `Done` and record task ID + `task_status_log` trace. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Reaper count=1 [Y/N] | Decoy survived [Y/N] | 2nd-gateway refused [Y/N] | Hot-reload count=1 [Y/N] | Live E2E Done [Y/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      `git diff --name-only` — confirm ONLY in-scope files changed: `scripts/dev.ts`, `src/gateway/server.ts`, `src/gateway/lib/socket-mode-lock.ts`, `AGENTS.md`, + the lock test file. Confirm `handlers.ts`, Inngest/Dashboard lock-free, dedup logic, and production shutdown (beyond `boltApp.stop()`) untouched. Confirm the SIGINT cleanup path was NOT relabeled as broken. Confirm the 38 zombies were not touched. Detect cross-task contamination.
      Output: `Files [N/N in scope] | SIGINT-path-untouched [Y/N] | Contamination [CLEAN/N] | VERDICT`

- [x] F5. **Tmux/scratch cleanup + docs freshness** — kill all tmux sessions created during E2E (`tmux list-sessions -F '#{session_name}' | grep '^ai-' | xargs ...`); delete temp/decoy scripts; `git status` clean (only intended files + plan/notepads). Confirm AGENTS.md updates landed. Commit plan + notepads per git cleanup rules.

---

## Commit Strategy

| Commit | Message                                                                                | Files                                 |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------- |
| 1      | `feat(gateway): add socket-mode single-instance lock helper`                           | `src/gateway/lib/socket-mode-lock.ts` |
| 2      | `fix(dev): reap the real gateway leaf process, anchored on repo path`                  | `scripts/dev.ts`                      |
| 3      | `docs(agents): rewrite Known Issue #4 with Slack-socket root cause + mandate live E2E` | `AGENTS.md`                           |
| 4      | `fix(gateway): gate Socket Mode on single-instance lock + stop Bolt on shutdown`       | `src/gateway/server.ts`               |
| 5      | `test(gateway): cover socket-mode-lock acquire/release/reclaim-stale`                  | lock test file                        |

---

## Success Criteria

### Verification Commands

```bash
# Exactly one gateway leaf holds the Slack socket after dev start
pgrep -f "$(pwd)/src/gateway/server.ts" | wc -l   # Expected: 1

# Lock helper tests pass
pnpm exec vitest run tests/gateway/socket-mode-lock.test.ts   # Expected: 0 failures

# Build clean
pnpm build   # Expected: exit 0

# AGENTS.md Issue #4 names the real mechanism
grep -c "Socket Mode" AGENTS.md   # Expected: > 0 in Issue #4 context
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Reaper kills the real leaf without over-matching
- [ ] Single-instance lock gates Socket Mode, survives hot-reload, no-op without SLACK_APP_TOKEN
- [ ] `boltApp.stop()` on shutdown
- [ ] AGENTS.md Issue #4 + E2E mandate accurate
- [ ] Live Slack @mention E2E reached `Done`
- [ ] Telegram completion notification sent
