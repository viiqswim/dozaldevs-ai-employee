# Phantom Socket Mode Prevention — dev.ts Grace-Wait + Single-Instance Guard

## TL;DR

> **Quick Summary**: The user's 2:26 AM @mention was silently dropped because a **phantom Slack Socket Mode connection** was live (probe confirmed `num_connections: 3` = 1 live gateway + 1 phantom + 1 probe). Slack round-robins events across ALL registered sockets, so ~1/N of @mentions vanished into the dead phantom. This is the SAME failure class the prior plan fixed at the gateway-shutdown level — but it recurred because the **operational trigger** was never closed: `scripts/dev.ts` Step 0 preflight `pkill`s the old gateway and **does not wait** for its WebSocket to close before the new stack starts, AND **nothing prevents multiple concurrent `pnpm dev` instances**. Evidence shows 3 concurrent `pnpm dev` roots + 4 `scripts/dev.ts` processes were running; the old gateway (PID 40951) exited at the exact second (07:26:21 UTC = 2:26 AM) the user messaged, stranding its WS.
>
> **This is NOT a regression of the gateway fix** — `server.ts` SIGTERM/SIGINT handlers correctly `await bolt.stop()` (Oracle-verified Fix #1 already in place). The hole is upstream in `dev.ts`: kill-without-wait + no duplicate-instance guard.
>
> **This plan fixes the trigger** (Oracle-ranked): (#2) make `dev.ts` preflight kill GRACEFULLY and POLL until the old gateway exits before proceeding; (#3) abort `pnpm dev` if another `dev.ts` is already running. Plus the gateway already detects phantoms at startup (`num_connections` WARN from the prior plan) — we extend that detection to be louder. Verified by a live browser @mention E2E reaching `Done` AND a probe confirming `num_connections` returns to the healthy baseline (no phantom) after a clean single-instance restart.

> **Deliverables**:
>
> - `scripts/dev.ts` — Step 0 preflight: replace fire-and-forget `pkill` with **kill → poll-until-gone (grace ≤3s) → SIGKILL fallback** per pattern (esp. the Gateway pattern, so the old WS finishes closing before the new gateway connects).
> - `scripts/dev.ts` — **single-instance guard**: before Step 0, detect any OTHER live `scripts/dev.ts` process for this repo and abort with a clear, human error ("Another pnpm dev is already running — stop it first").
> - `src/gateway/server.ts` — strengthen existing phantom detection: keep the `num_connections` INFO/WARN, and on clean shutdown log a positive "WS closed cleanly — no phantom expected" signal (post-mortem clarity). (No active reconnect remediation — Oracle: dangerous.)
> - `AGENTS.md` — update Known Issue #5 with the dev.ts trigger + the grace-wait/single-instance prevention and the "always run exactly ONE `pnpm dev`" rule.
> - A documented **live browser @mention E2E** (message → `app_mention` → card → Confirm → `tasks.status = Done`) AND a **probe check** proving no phantom after a clean single-instance restart.
>
> **Estimated Effort**: Quick–Short
> **Parallel Execution**: YES — Wave 1 (dev.ts guard + grace-wait; server.ts shutdown-signal log; AGENTS.md) are file-disjoint → Final (live E2E + probe).
> **Critical Path**: Task 1 (dev.ts grace-wait + single-instance guard) → Final E2E.

---

## Context

### Original Request

User sent `@Papi chulo generame el itinerario de limpieza para Junio 12` at 2:26 AM in `#ops-cleaning-schedule` and got NO response. They asked whether the prior fix was actually tested and to investigate + plan a fix if there's a real issue.

### Investigation Findings (live, 2026-06-06 ~02:30 local — psql + process audit + raw Socket Mode probe)

**The @mention was genuinely dropped — and it IS a real, reproducible issue:**

1. **No task, no log.** The user's message created NO `tasks` row (only my 00:48 test task `05f8dfa9` exists in the last 2h) and left NO `app_mention event received` log line anywhere — it was dropped at the **socket layer** before reaching the gateway handler.

2. **Phantom connection confirmed live.** An independent raw Socket Mode probe (`apps.connections.open` → WS → read `hello.num_connections`) returned **`num_connections: 3`**. Expected = 1 live gateway (leaf PID 17091, holds the lock, `/health` = 200) + 1 probe = 2. The extra **1 = a phantom** WS stranded server-side at Slack. Slack round-robins each event across all 3 → ~1/3 of @mentions silently vanish.

3. **Exact trigger pinned to the second.** The OLD gateway leaf (PID 40951 — the instance I successfully E2E-tested at 00:48) **exited at 07:26:21 UTC = 2:26 AM local** (`[gateway] exited with code 0`), the precise moment the user messaged. Its WebSocket was stranded.

4. **Operational trigger: multiple overlapping dev stacks.** Process audit showed **3 concurrent `pnpm dev` roots** (PIDs 16807, 17148, 40363) and **4 `scripts/dev.ts` processes**. One dev.ts (40363, started ~00:40) was orphaned with a dead gateway child (40951); the newest dev.ts (16807, started ~02:21) owns the live gateway (17091). Starting the new `pnpm dev` ran Step 0 preflight `pkill` which killed 40951 — without waiting for its WS to close.

5. **NOT a gateway-code regression.** `src/gateway/server.ts:329-347` SIGTERM/SIGINT handlers correctly `await bolt.stop()` then `releaseSocketModeLock()` then `server.close()`. The prior plan's `num_connections` detection (`server.ts:150-164`) is present in the running gateway. The gateway code is correct.

### Root Cause (Oracle-pressure-tested, verdict: diagnosis sound)

A gateway process's Socket Mode WebSocket is stranded when the process is killed **without time to complete the async WS close**. `scripts/dev.ts` Step 0 (lines 215-256) fires `pkill -f "<repo>.*src/gateway/server.ts"` and proceeds after a flat `setTimeout(500ms)` — it does NOT poll until the old gateway actually exits, and `pkill` default SIGTERM returns immediately. The old gateway's `await bolt.stop()` (which sends the WS close frame) may not finish before the new stack starts and the new gateway connects → phantom. The single-instance LOCK prevents duplicate LOCAL gateway _connections_ but cannot reclaim a socket **Slack** holds, and nothing stops a user from launching multiple `pnpm dev` roots.

### Oracle Guidance (key rulings)

- **Fix #1 (await bolt.stop in SIGTERM)** — already correct in `server.ts`. ✅
- **Fix #2 (grace-period kill+poll in dev.ts)** — REQUIRED. Pattern: `pkill -TERM` → poll `pgrep` until gone (deadline ≤3s, ≥1s) → `pkill -KILL` fallback → brief reap wait.
- **Fix #3 (abort on duplicate `pnpm dev`)** — HIGHEST leverage; eliminates the scenario. 5-line `pgrep scripts/dev.ts` check excluding own PID.
- **Fix #3 active remediation on detection** — DO NOT reconnect/disconnect to "evict" a phantom (Slack has no API to drop other sockets; risks reconnect storms). WARN only; continue starting (degraded > dark).
- **Q4**: There is NO Slack API to list/close Socket Mode connections. "Wait for Slack to expire it" (2–15 min) is the ONLY recovery once a phantom exists. So PREVENTION is the whole game.
- **Fix #4 (tsx SIGTERM propagation) — the one UNKNOWN to verify**: confirm `tsx watch` forwards SIGTERM to the node leaf on file-save restarts (not SIGKILL). If tsx uses SIGKILL, watch-triggered restarts bypass `bolt.stop()`. (Verification task included; if confirmed SIGKILL, document as a follow-up — out of scope to refactor the supervisor here.)

### Key Code Locations (verified)

- `scripts/dev.ts:213-256` — Step 0 preflight kill loop (`pgrep`/`pkill` per pattern; flat 500ms wait). The Gateway pattern is `${repoRoot}.*src/gateway/server\\.ts` (line 236).
- `scripts/dev.ts:152-162` — `cleanup()` (SIGINT/SIGTERM → `process.kill(-child.pid, 'SIGTERM')` + 1s wait). Clean Ctrl+C path is fine; the preflight is the gap.
- `src/gateway/server.ts:144-166` — `boltApp.start()` + `smClient.on('hello', …)` num_connections INFO/WARN (prior plan).
- `src/gateway/server.ts:329-347` — SIGTERM/SIGINT handlers (await `bolt.stop()` — correct).
- `src/gateway/lib/socket-mode-lock.ts` — single-instance lock (local only; cannot reclaim Slack-side sockets).
- `AGENTS.md` Known Issue #5 — phantom Socket Mode connections (extend).

---

## Work Objectives

### Core Objective

Prevent phantom Socket Mode connections from forming under the real-world condition "developer runs `pnpm dev` more than once / restarts the stack," by making `dev.ts` (A) refuse to start a second concurrent instance and (B) kill the old gateway GRACEFULLY and WAIT for it to exit before starting the new one — proven by a live @mention reaching `Done` and a probe showing no phantom.

### Concrete Deliverables

- `dev.ts` single-instance guard (abort on duplicate).
- `dev.ts` grace-wait preflight (kill → poll → SIGKILL fallback).
- `server.ts` clean-shutdown positive log + retained num_connections WARN.
- AGENTS.md Known Issue #5 update.
- Live @mention → `Done` E2E + probe no-phantom proof.

### Definition of Done

- [ ] Running `pnpm dev` while another `scripts/dev.ts` for this repo is alive **aborts immediately** with a clear human message naming the existing PID(s); does NOT kill anything or start a partial stack.
- [ ] `dev.ts` Step 0 gateway kill **polls until the old gateway leaf is actually gone** (deadline ≤3s) before proceeding; force-SIGKILLs only if grace expires.
- [ ] After a clean single-instance restart, an independent Socket Mode probe reports `num_connections` consistent with exactly (1 live gateway + 1 probe) — **no phantom**.
- [ ] On clean shutdown the gateway logs a positive "WS closed cleanly" signal; the `num_connections` startup WARN still fires if >expected.
- [ ] Live browser @mention in `#ops-cleaning-schedule` → `app_mention event received` → confirmation card → Confirm → `tasks.status = Done`; task ID + `task_status_log` recorded.
- [ ] tsx SIGTERM-propagation question answered (documented finding: SIGTERM vs SIGKILL on watch restart).
- [ ] `pnpm build` clean; no NEW test failures vs baseline.
- [ ] AGENTS.md Known Issue #5 updated (dev.ts trigger + grace-wait/single-instance prevention + "run exactly ONE pnpm dev" rule).

### Must Have

- BOTH `dev.ts` fixes (single-instance guard AND grace-wait). The guard prevents the scenario; the grace-wait protects the legitimate restart path.
- Live browser @mention E2E (real workspace) — "verified from code"/"unit tests pass" is explicitly insufficient (AGENTS.md Slack-trigger-workflow rule).
- Probe-confirmed no-phantom after clean restart.

### Must NOT Have (Guardrails)

- Do NOT add active phantom "eviction" (disconnect/reconnect to drop other sockets) — Oracle: Slack has no such API; risks reconnect storms. Detection = WARN/alert only; keep serving.
- Do NOT remove or weaken the single-instance LOCK (`socket-mode-lock.ts`), the existing `server.ts` `await bolt.stop()` shutdown, or the prior `num_connections` detection — extend, don't replace.
- Do NOT lower the grace deadline below 1s or raise it above ~5s (Oracle: WS close is <500ms typical; 3s is the safe target).
- Do NOT change the kill PATTERNS themselves (the repo-anchored Gateway/Inngest/Dashboard regexes are correct) — only change kill→wait sequencing.
- Do NOT refactor Socket Mode into a separate supervisor process (Oracle: only warranted IF tsx is confirmed to SIGKILL — out of scope; document as follow-up if confirmed).
- Do NOT rotate, print, or commit any Slack tokens. Do NOT commit `.playwright-mcp/` artifacts. Do NOT leave `LOG_LEVEL=debug` committed. Do NOT touch the admin-trigger lifecycle, channel→employee resolution, the classifier, or deprecated engineering components.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION for unit/integration ACs** — agent-executed. The live @mention is performed by the executing agent via the Playwright MCP browser (already authenticated to VLRE as Victor Dozal), NOT by asking the user.

### Test Decision

- **Infrastructure exists**: YES (Vitest).
- **Automated tests**: Tests-after for the `dev.ts` helper logic that is pure/extractable (single-instance detection predicate, kill-and-wait poll loop with a mocked process-list). The end-to-end behavior (real kill timing, real Slack connection count) is verified by the probe + live browser E2E, which is the authoritative check.
- **Framework**: Vitest for extracted helpers; Bash probe + Playwright MCP for the live path.

### QA Policy

- **dev.ts helpers**: Bash (vitest) — single-instance predicate excludes own PID; kill-and-wait returns once `pgrep` is empty / force-kills after deadline (mock the pgrep/pkill shell calls).
- **Connection hygiene**: Bash — independent Socket Mode probe reads `num_connections` after a clean single-instance restart; assert no phantom.
- **Live @mention E2E**: Playwright MCP + psql — post @mention, Confirm, assert `tasks.status=Done`.
- Evidence → `.sisyphus/evidence/phantom-socket-prevention/`.

### Browser E2E Notes (from e2e-testing skill)

- Slack target: `https://app.slack.com/client/T06KFDGLHS6/C0B71QSMZKQ` (#ops-cleaning-schedule). MCP browser already logged in as Victor Dozal.
- **Mention-token gotcha (CRITICAL)**: Do NOT `fill()` the whole message — it wipes the mention token. Sequence: focus composer → press `@` → type `Papi chulo` slowly → Enter (selects autocomplete) → type the rest slowly → Enter to send. Use a full natural-language request (e.g. "generame el itinerario de limpieza para Junio 14, 2026") so it classifies as `task`.
- **Socket Mode probe**: write to a temp `.mjs` and run with `node` (Node 22 global `WebSocket`; do NOT `import 'ws'` or `import 'dotenv'` inline — pass `SLACK_APP_TOKEN` via env). `apps.connections.open` (POST, `SLACK_APP_TOKEN`) → `new WebSocket(url)` → on `hello` read `num_connections` → echo `envelope_id` to ack.
- **Pre-flight (CRITICAL for THIS bug)**: `pgrep -f "scripts/dev.ts" | wc -l` must be 1 (exactly one dev stack); `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` = 2 (supervisor+leaf); Inngest `curl localhost:8288/` = 200. Probe `num_connections` should be 2 (gateway+probe) with NO phantom before testing.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — file-disjoint):
├── Task 1: dev.ts single-instance guard + grace-wait preflight [deep]
├── Task 2: server.ts clean-shutdown positive log (keep num_connections WARN) [quick]
├── Task 3: Verify tsx SIGTERM-vs-SIGKILL on watch restart (investigation, doc finding) [deep]
└── Task 4: AGENTS.md Known Issue #5 update [writing]

Wave 2 (After Wave 1 — tests for extracted dev.ts helpers):
└── Task 5: Unit tests for single-instance predicate + kill-and-wait loop [quick]

Wave FINAL (after fixes — verification + live E2E, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + build + tests (unspecified-high)
├── F3: Clean single-instance restart → probe no-phantom → LIVE @mention → Confirm → Done (unspecified-high + e2e-testing)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay -> F5 cleanup
```

### Agent Dispatch Summary

- **Wave 1**: T1 → `deep`, T2 → `quick`, T3 → `deep`, T4 → `writing`
- **Wave 2**: T5 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+ `e2e-testing`), F4 → `deep`

---

## TODOs

- [x] 1. `dev.ts` — single-instance guard + grace-wait preflight kill (ROOT-CAUSE TRIGGER FIX)

  **What to do** (`scripts/dev.ts`):
  - **Single-instance guard (Oracle Fix #3 — highest leverage), add BEFORE Step 0 (line ~213):**
    - `pgrep -f "scripts/dev.ts"` for this repo, split lines, filter out `String(process.pid)` AND the immediate parent chain if pgrep matches the supervisor (be careful to exclude OWN process tree — the running dev.ts is itself a `scripts/dev.ts` match). Robust approach: collect candidate PIDs, exclude `process.pid` and `process.ppid`, and verify each remaining PID's argv still contains `scripts/dev.ts` via `ps -p <pid> -o args=`.
    - If any genuine OTHER instance remains → `console.error` a human message: "Another `pnpm dev` is already running (PID(s): X). Stop it first (Ctrl+C in its terminal) or kill it, then retry." → `process.exit(1)`. Do NOT kill anything, do NOT start a partial stack.
  - **Grace-wait preflight (Oracle Fix #2), replace the fire-and-forget kill in Step 0 (lines 242-256):**
    - Extract a helper `killAndWait(name, pattern, graceMs = 3000)`: `pkill -TERM -f "${pattern}"` → poll `pgrep -f "${pattern}"` every ~200ms until empty OR deadline (graceMs) → if still alive, `pkill -KILL -f "${pattern}"` → brief ~200ms reap wait. Log how it resolved (graceful vs forced).
    - Apply `killAndWait` to all three patterns (Inngest/Gateway/Dashboard), but the Gateway pattern is the one that matters for phantoms — the poll ensures the old gateway's `await bolt.stop()` (WS close frame) completes before we proceed.
    - Keep the existing repo-anchored patterns EXACTLY (line 227/236/241). Only change the kill→wait sequencing. Remove the now-redundant flat `setTimeout(500)` at line 255 (the per-pattern poll replaces it) — or keep a tiny final settle wait; do not double-wait excessively.
  - Structure the two helpers so the pure logic (PID filtering predicate; the poll-loop given injectable `listPids`/`sendSignal` fns) is unit-testable in Task 5.

  **Must NOT do**: Do NOT change the kill patterns. Do NOT self-abort (must exclude own PID + parent). Do NOT make the poll unbounded (hard deadline required). Do NOT skip the SIGKILL fallback. Do NOT touch `cleanup()` (the Ctrl+C path is fine).

  **Recommended Agent Profile**: `deep` — process-management correctness; a self-abort or unbounded loop would break local dev for everyone. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: 5 | Blocked By: None.

  **References**:
  - `scripts/dev.ts:213-256` — Step 0 preflight kill loop to modify (patterns at 227/236/241; pkill at 248; flat wait at 255).
  - `scripts/dev.ts:152-162` — `cleanup()` shows the existing `process.kill(-pid, 'SIGTERM')` + 1s wait idiom (do NOT change; reference for grace style).
  - `src/gateway/server.ts:329-347` — confirms the gateway DOES `await bolt.stop()` on SIGTERM, so a graceful kill + wait lets the WS close cleanly (this is WHY the wait matters).
  - Oracle consultation (this session) — Fix #2 kill→poll→SIGKILL pattern + Fix #3 single-instance check (5-line snippet).
  - **WHY**: The phantom forms because the old gateway is killed without waiting for its WS close. Polling until it's gone closes that window; the single-instance guard removes the multi-dev trigger entirely.

  **Acceptance Criteria**:

  ```
  Scenario: Duplicate pnpm dev aborts without killing anything
    Tool: Bash (vitest, mocked process list)
    Steps:
      1. Mock listPids to report another scripts/dev.ts PID (not self/parent)
      2. Assert the guard returns/abort-signals exit(1) and issues NO kill
    Evidence: .sisyphus/evidence/phantom-socket-prevention/task-1-guard.txt

  Scenario: killAndWait polls until gone, then proceeds
    Tool: Bash (vitest, injected listPids/sendSignal)
    Steps:
      1. listPids returns [123] twice then [] → killAndWait resolves after the empty poll; SIGKILL NOT sent
      2. listPids always returns [123] → after deadline, SIGKILL sent exactly once, then resolves
    Evidence: .sisyphus/evidence/phantom-socket-prevention/task-1-killwait.txt
  ```

  **Commit**: YES — `fix(dev): grace-wait gateway kill + abort on duplicate pnpm dev (prevent phantoms)` (commit 1) — Pre-commit: `pnpm build` + the new dev.ts helper tests.

- [x] 2. `server.ts` — positive clean-shutdown log (keep num_connections WARN)

  **What to do** (`src/gateway/server.ts:329-347` shutdown handlers; `:144-166` startup):
  - After `await bolt.stop()` resolves in BOTH the SIGTERM and SIGINT handlers, log an INFO line: `"Socket Mode WS closed cleanly on shutdown — no phantom expected"` (Oracle: gives a positive post-mortem signal to distinguish clean vs dirty deaths).
  - Leave the existing `smClient.on('hello', …)` `num_connections` INFO + `>1` WARN exactly as-is (from the prior plan). Do NOT add active reconnect/eviction.
  - Optional, only if trivially safe: include the lock-holder PID / `process.pid` in the clean-shutdown log for correlation.

  **Must NOT do**: Do NOT add reconnect/disconnect remediation. Do NOT change the await-stop ordering or `releaseSocketModeLock()`/`server.close()` sequence. Do NOT change the WARN threshold logic.

  **Recommended Agent Profile**: `quick`. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: None | Blocked By: None.

  **References**:
  - `src/gateway/server.ts:329-347` — SIGTERM/SIGINT handlers (add the post-stop INFO log here).
  - `src/gateway/server.ts:144-166` — startup `hello`/num_connections detection (leave intact).
  - Oracle Q3 — "log 'WS closed cleanly' on clean shutdown; WARN only on detection, no active remediation."
  - **WHY**: When the next phantom incident is investigated, the presence/absence of this line per process instantly tells whether that process died clean (no phantom) or dirty (phantom likely).

  **Acceptance Criteria**:

  ```
  Scenario: Clean shutdown emits the positive signal
    Tool: Bash (grep the running gateway log after a clean SIGINT)
    Steps:
      1. Start gateway, send SIGINT, grep log for "closed cleanly on shutdown"
      2. Assert the line is present
    Evidence: .sisyphus/evidence/phantom-socket-prevention/task-2-cleanlog.txt
  ```

  **Commit**: YES — `fix(gateway): log clean WS shutdown signal for phantom post-mortems` (commit 2) — Pre-commit: `pnpm build`.

- [x] 3. Verify tsx `watch` SIGTERM-vs-SIGKILL on file-save restart (the Oracle UNKNOWN)

  **What to do** (investigation — record finding; no behavior change unless trivially safe):
  - Determine whether `tsx watch` forwards SIGTERM to the node leaf (allowing `bolt.stop()` to run) or SIGKILLs it on a file-save restart. Methods (any sufficient): (a) add a temporary SIGTERM/SIGINT/`beforeExit` trace log in the leaf, save a file to trigger a watch restart, and check whether the trace prints + whether the "closed cleanly" log (Task 2) appears; (b) inspect `tsx`/`@esbuild-kit` restart signal in node_modules source; (c) `pgrep` the leaf, save a watched file, observe whether it exits with 143 (SIGTERM) vs 137 (SIGKILL).
  - **Record the finding** in the notepad AND in the AGENTS.md Known Issue #5 update (Task 4). If tsx uses SIGTERM → watch restarts are safe (bolt.stop runs). If tsx uses SIGKILL → watch-triggered restarts can ALSO strand a WS; note this as a documented residual risk + recommend the Oracle's follow-up (move Socket Mode into a separate long-lived supervisor) as a FUTURE plan — do NOT implement that refactor here.

  **Must NOT do**: Do NOT refactor Socket Mode into a separate supervisor in this plan (out of scope). Do NOT leave any temporary trace logging committed. Do NOT change tsx config.

  **Recommended Agent Profile**: `deep` — requires careful process-signal observation and an accurate written conclusion. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: None | Blocked By: None.

  **References**:
  - `scripts/dev.ts:618` — `['tsx', 'watch', '--clear-screen=false', 'src/gateway/server.ts']` spawn.
  - `src/gateway/server.ts:329-347` — the handlers that only help IF SIGTERM is delivered.
  - Oracle Q5 Fix #4 + "Optional future consideration" — the SIGKILL caveat and the separate-supervisor follow-up.
  - **WHY**: This is the one unknown that determines whether the dev.ts fixes FULLY close phantom formation or leave a watch-restart residual. The user must know which.

  **Acceptance Criteria**:

  ```
  Scenario: tsx restart signal determined and documented
    Tool: Bash (observe leaf exit signal on watched-file save)
    Steps:
      1. Trigger a watch restart; capture whether the leaf received SIGTERM (bolt.stop ran) or was SIGKILLed
      2. Record SIGTERM-or-SIGKILL conclusion in the notepad + AGENTS.md
    Evidence: .sisyphus/evidence/phantom-socket-prevention/task-3-tsx-signal.txt
  ```

  **Commit**: NO (finding feeds Task 4's AGENTS.md commit + notepad). If a trivially-safe non-committed trace was added, ensure it is removed.

- [x] 4. AGENTS.md — update Known Issue #5 (dev.ts trigger + prevention + single-dev rule)

  **What to do** (`AGENTS.md` Known Issue #5 "Phantom Socket Mode connections"):
  - Add the now-confirmed **operational trigger**: running multiple concurrent `pnpm dev` instances → the new one's Step 0 preflight `pkill`s the old gateway, which (without a grace-wait) strands its WebSocket → phantom. Cite the 2026-06-06 incident (`num_connections: 3`, old gateway exited at the exact second of the dropped @mention).
  - Document the **prevention now in place**: (1) `dev.ts` aborts if another `pnpm dev` is already running; (2) `dev.ts` preflight now kills the old gateway gracefully and POLLS until it exits before starting the new stack; (3) gateway logs a positive "WS closed cleanly" signal on clean shutdown.
  - Add the operational rule: **run exactly ONE `pnpm dev` at a time**; always stop it with Ctrl+C; if you see `num_connections > (gateways + your probe)`, a phantom exists — wait for Slack to expire it (2–15 min; no API to force-close).
  - Fold in the **tsx SIGTERM/SIGKILL finding** from Task 3 (whichever way it resolved) and, if SIGKILL, note the documented residual risk + the separate-supervisor follow-up as FUTURE work.
  - Edit in place; no new doc files.

  **Must NOT do**: No new doc files. Do NOT claim the lock or prior gateway fix was wrong (they're correct and complementary). Do NOT document an active-eviction capability (none added).

  **Recommended Agent Profile**: `writing`. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: None | Blocked By: None (incorporate Task 3 finding before final commit).

  **References**:
  - `AGENTS.md` Known Issue #5 (current phantom-connection section) + Known Issue #4 (stale processes) — keep them consistent.
  - This session's investigation findings + Oracle Q4 (no Slack API to close sockets; wait-to-expire only).
  - **WHY**: AGENTS.md Documentation Freshness rule — the next person must know the dev.ts trigger, the single-dev rule, and the diagnostics so this doesn't recur unexplained.

  **Acceptance Criteria**:

  ```
  Scenario: AGENTS.md #5 documents trigger + prevention + single-dev rule
    Tool: Bash
    Steps:
      1. grep AGENTS.md for "exactly ONE" / "grace" / "pnpm dev" within the phantom section and the tsx finding
    Evidence: .sisyphus/evidence/phantom-socket-prevention/task-4-agents.txt
  ```

  **Commit**: YES — `docs(agents): document dev.ts phantom trigger + grace-wait/single-instance fix` (commit 4) — Pre-commit: none.

- [x] 5. Unit tests — single-instance predicate + kill-and-wait loop

  **What to do**:
  - Test the extracted single-instance predicate: given a list of `scripts/dev.ts` PIDs, it excludes own PID (and parent) and only flags genuine other instances; returns "no duplicate" when the only match is self.
  - Test the extracted `killAndWait` loop with injected `listPids`/`sendSignal`: (a) PIDs clear before deadline → resolves, NO SIGKILL; (b) PIDs never clear → SIGKILL sent exactly once after deadline, then resolves (bounded, no infinite loop).
  - Place tests under `tests/` root (project convention).

  **Must NOT do**: No real `pkill`/`pgrep` against the live machine in unit tests (inject the shell-call seams). No reliance on real Socket Mode.

  **Recommended Agent Profile**: `quick`. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 2) | Blocks: F1-F4 | Blocked By: 1.

  **References**:
  - `scripts/dev.ts` (Task 1 extracted helpers).
  - Existing test conventions under `tests/`.
  - **WHY**: A self-abort bug or an unbounded poll would break local dev for everyone — pin both behaviors deterministically.

  **Acceptance Criteria**:

  ```
  Scenario: New dev.ts helper tests pass
    Tool: Bash (vitest)
    Steps:
      1. pnpm exec vitest run <dev helper test> 2>&1 | tail -8
      2. Assert 0 failures; >= 4 tests total
    Evidence: .sisyphus/evidence/phantom-socket-prevention/task-5-tests.txt
  ```

  **Commit**: YES — `test(dev): cover single-instance guard and kill-and-wait poll loop` (commit 3) — Pre-commit: the new tests.

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never check F1-F4 before the user's okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Verify each "Must Have": BOTH dev.ts fixes present (single-instance guard aborts on duplicate; grace-wait polls until old gateway gone before proceeding); live browser @mention E2E performed (not code-only); probe-confirmed no-phantom after clean restart. Verify each "Must NOT Have": no active phantom eviction/reconnect; lock + server.ts await-stop + num_connections detection intact; grace deadline within 1–5s; kill patterns unchanged; no Socket-Mode-supervisor refactor; no tokens printed/committed; no `.playwright-mcp/`; no `LOG_LEVEL=debug` committed; classifier/lifecycle/channel-resolution untouched.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality + Build** — `unspecified-high`
      `pnpm build` + `pnpm exec eslint` on changed files + `pnpm exec vitest run` on the new dev.ts-helper tests. Confirm no NEW failures vs the documented pre-existing baseline (checkout-baseline method). Review for: kill-and-wait has a hard deadline (no infinite loop), SIGKILL fallback present, single-instance check correctly excludes own PID (no self-abort), `as any`/`@ts-ignore`, swallowed errors.
      Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Build [PASS/FAIL] | VERDICT`

- [ ] F3. **Clean restart → no-phantom probe → LIVE @mention E2E** — `unspecified-high` (+ `e2e-testing` skill)
      (a) Kill ALL existing `pnpm dev`/`scripts/dev.ts`/gateway processes for this repo; confirm zero remain. (b) Start exactly ONE `pnpm dev`; assert the single-instance guard would block a second (dry attempt logs the abort). (c) Run the Socket Mode probe; assert `num_connections` == (1 gateway + 1 probe) with NO phantom — wait for Slack to expire any pre-existing phantom first if needed, and document the wait. (d) Pre-flight: single dev stack, single gateway leaf, Inngest 200, Socket Mode connected. (e) Via Playwright MCP, post a full natural-language `@Papi chulo` itinerary request. Assert: `app_mention event received` logs; confirmation card appears; click Confirm; `tasks.status` reaches `Done`. Record task ID, `task_status_log`, delivered Slack content. Evidence → `.sisyphus/evidence/phantom-socket-prevention/`.
      Output: `Single instance enforced [Y/N] | No phantom [Y/N] | app_mention logged [Y/N] | Card shown [Y/N] | Task Done [Y/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      `git diff --name-only` — confirm only in-scope files: `scripts/dev.ts`, `src/gateway/server.ts`, `AGENTS.md`, + test files. Confirm lock (`socket-mode-lock.ts`), server.ts shutdown await-stop, num_connections detection, kill PATTERNS, classifier, admin-trigger lifecycle, channel→employee resolution all untouched. No tokens in diffs, no `.playwright-mcp/`, no `LOG_LEVEL=debug` committed.
      Output: `Files [N/N in scope] | Lock+shutdown intact [Y/N] | No tokens leaked [Y/N] | VERDICT`

- [ ] F5. **Cleanup + docs freshness** — kill all `ai-*` tmux sessions and any stray Socket Mode probe processes created during execution; remove temp/scratch (`/tmp/sm-probe.mjs`) + `.playwright-mcp/` artifacts; `git status` clean (only intended files + plan/notepads). Confirm AGENTS.md Known Issue #5 update landed. Commit plan + notepads per git cleanup rules. Send Telegram completion notice.

---

## Commit Strategy

| Commit | Message                                                                              | Files                   |
| ------ | ------------------------------------------------------------------------------------ | ----------------------- |
| 1      | `fix(dev): grace-wait gateway kill + abort on duplicate pnpm dev (prevent phantoms)` | `scripts/dev.ts`        |
| 2      | `fix(gateway): log clean WS shutdown signal for phantom post-mortems`                | `src/gateway/server.ts` |
| 3      | `test(dev): cover single-instance guard and kill-and-wait poll loop`                 | test files              |
| 4      | `docs(agents): document dev.ts phantom trigger + grace-wait/single-instance fix`     | `AGENTS.md`             |

---

## Success Criteria

### Verification Commands

```bash
# Exactly ONE dev stack (the core operational invariant this plan enforces)
pgrep -f "scripts/dev.ts" | wc -l                       # Expected: 1
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l        # Expected: 2 (supervisor+leaf)

# No phantom after a clean single-instance restart (inline node probe)
# Expected: num_connections == 2 (gateway + probe), NOT 3+

# Duplicate dev aborts (run a second pnpm dev — should refuse)
# Expected: "Another pnpm dev is already running" + exit 1, no processes killed

# Live @mention path
grep "app_mention event received" /tmp/ai-dev.log       # Expected: > 0 for the test mention

# Build clean
pnpm build                                              # Expected: exit 0
```

### Final Checklist

- [ ] dev.ts aborts on duplicate `pnpm dev`; grace-waits for old gateway to exit before starting
- [ ] No phantom after clean single-instance restart (probe-proven)
- [ ] Live @mention → card → Confirm → `Done` proven in browser
- [ ] tsx SIGTERM/SIGKILL question answered & documented; AGENTS.md #5 updated; lock + shutdown intact; no tokens leaked; build clean
