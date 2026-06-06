## [2026-06-06] Session Start — Phantom Socket Prevention

### Key Code Locations

- `scripts/dev.ts:213-256` — Step 0 preflight kill loop. Patterns at lines 227/236/241. pkill at 248. Flat 500ms wait at 255.
- `src/gateway/server.ts:329-347` — SIGTERM/SIGINT handlers. Both correctly `await bolt.stop()` then `releaseSocketModeLock()` then `server.close()`.
- `src/gateway/server.ts:144-166` — startup `hello`/num_connections INFO/WARN (prior plan — keep intact).
- `src/gateway/lib/socket-mode-lock.ts` — single-instance lock (local only).

### Root Cause

Old gateway killed by `pkill` (returns immediately) → flat 500ms wait → new gateway starts → old gateway's `await bolt.stop()` WS close frame may not have completed → phantom WS stranded at Slack.

### Oracle Rulings

- Fix #1 (await bolt.stop in SIGTERM): ✅ Already correct
- Fix #2 (grace-wait in dev.ts): REQUIRED — kill → poll until gone (≤3s) → SIGKILL fallback
- Fix #3 (single-instance guard): HIGHEST leverage — abort if another scripts/dev.ts for this repo is running
- NO active phantom eviction (Slack has no API; risks reconnect storms)
- Grace deadline: 1s–5s (3s target)
- Kill PATTERNS must NOT change — only kill→wait sequencing

### Commit Strategy

1. `fix(dev): grace-wait gateway kill + abort on duplicate pnpm dev (prevent phantoms)` — scripts/dev.ts
2. `fix(gateway): log clean WS shutdown signal for phantom post-mortems` — src/gateway/server.ts
3. `test(dev): cover single-instance guard and kill-and-wait poll loop` — test files
4. `docs(agents): document dev.ts phantom trigger + grace-wait/single-instance fix` — AGENTS.md

## 2026-06-06 — Clean shutdown log added

- Added `logger.info({ pid: process.pid }, 'Socket Mode WS closed cleanly on shutdown — no phantom expected')` immediately after `await bolt.stop()` in BOTH SIGTERM and SIGINT handlers in `src/gateway/server.ts` (lines ~332, ~343).
- Log is inside the `if (bolt)` guard — only fires when Bolt was initialized.
- Presence of this log in post-mortem = clean death (no phantom stranded at Slack).
- Absence of this log = dirty death (kill -9, tmux session killed) = phantom likely.
- Build verified clean (pnpm build exit 0). Committed: d2087099.

## 2026-06-06 — grace-wait + single-instance guard implemented

### Changes (scripts/dev.ts only, commit 2d93be4b)

**`killAndWait` helper** added after `decryptSecret`:

- Signature: `killAndWait(name, pattern, graceMs=3000, listPids?, sendSignal?)` — injectable deps for unit tests
- Flow: SIGTERM → poll `pgrep` every 200ms until empty OR 3s deadline → SIGKILL + 200ms reap wait
- Logs graceful stop via `ok()` or forced kill via `warn()`

**Single-instance guard** added BEFORE Step 0 banner:

- Excludes own PID and ppid from `pgrep -f "scripts/dev.ts"` match
- Prints human error with PID list and exits 1 WITHOUT killing anything
- Highest-leverage fix — prevents the problem at the source

**Step 0 kill loop** updated:

- `execSync('pkill -f ...')` → `await killAndWait(name, pattern)`
- Flat `setTimeout(500)` after the loop removed (killAndWait already waits per process)

### Code locations after patch

- `scripts/dev.ts:207-229` — `killAndWait` helper
- `scripts/dev.ts:240-254` — single-instance guard
- `scripts/dev.ts:286-296` — updated kill loop (uses `killAndWait`)

## tsx SIGTERM/SIGKILL Finding (Task 3)

**tsx version**: 4.21.0
**Source**: `node_modules/tsx/dist/cli.cjs` (identical in `cli.mjs`)

### Definitive answer: tsx watch sends **SIGTERM** first on file-save restart

The `killProcess` helper has signature `killProcess(process, signal="SIGTERM", timeout=5000)`.
The debounce callback on file change calls `await killProcess(childProcess)` with no second argument,
so the default SIGTERM applies. A 5-second SIGKILL fallback fires only if the process doesn't exit in time.

```js
// killProcess helper (minified, reconstructed):
const killProcess = async(child, signal="SIGTERM", graceMs=5000) => {
  child.kill(signal);  // sends SIGTERM by default
  setTimeout(() => {
    if (!exited) child.kill("SIGKILL");  // 5s fallback
  }, graceMs);
  await exitPromise;
};

// Called on file-save restart:
await killProcess(child);  // <-- default SIGTERM
```

There is a fast-path SIGKILL (`child.kill("SIGKILL")`) but it only fires when a second file-change
event arrives before the previous restart has completed (a rare race).

### Implication

**bolt.stop() WILL run on tsx watch restarts** — SIGTERM is delivered, the SIGTERM handler fires,
`await bolt.stop()` closes the WS cleanly, and the process exits before the 5s SIGKILL deadline.

Watch-triggered restarts do NOT create phantom sockets (assuming bolt.stop() < 5s, which it is).

The only phantom-creating paths are: `kill -9`, OOM, tmux session killed without Ctrl+C — all bypass SIGTERM.
These are documented as residual risk, not fixed in this plan.

**Evidence file**: `.sisyphus/evidence/phantom-socket-prevention/task-3-tsx-signal.txt`

## 2026-06-06 — AGENTS.md Known Issue #5 updated

- Added "Confirmed operational trigger (2026-06-06)" block: multiple concurrent `pnpm dev` → Step 0 pkill returns immediately → old gateway's `await bolt.stop()` WS close frame may not complete → phantom WS stranded at Slack. Cited `num_connections: 3` incident.
- Added "Prevention now in place" section listing all 3 mitigations: (1) single-instance guard aborts on duplicate, (2) grace-wait polls until old gateway exits, (3) server.ts logs "WS closed cleanly" on clean shutdown.
- Added tsx finding placeholder: `[FINDING PENDING — will be filled in by orchestrator before commit]`
- Added operational rule: run exactly ONE `pnpm dev` at a time; always stop with Ctrl+C; if num_connections > (gateways + probe), wait 2-15 min for Slack to expire phantom (no API to force-close).
- Known Issue #4 left untouched.

## 2026-06-06 — Unit tests for killAndWait and single-instance guard

### File: `tests/scripts/dev-preflight.test.ts`

**Approach**: Cannot import `scripts/dev.ts` directly — it has top-level side-effects (execSync, process.exit). Instead, replicated the two testable units inline:

1. `killAndWait` — verbatim copy of the function (injectable deps make it safe)
2. `detectOtherDevInstances` — extracted the predicate logic from the inline guard (lines 243-254)

**Test count**: 9 tests (5 guard + 4 killAndWait), all passing in 614ms.

**Key patterns**:
- `vi.fn(() => '12345')` for "process still running" listPids mock
- `vi.fn(() => '')` for "process gone" listPids mock
- `graceMs: 50` for the SIGKILL fallback test (keeps it fast without fake timers)
- `sendSignal.mock.calls.filter(([sig]) => sig === 'KILL')` to assert exactly one KILL call

**Build**: `pnpm build` exits 0 after adding the test file (test files are excluded from tsconfig.build.json).

## F3 E2E — Probe baseline finding (2026-06-06 ~04:00)

CRITICAL environmental fact for interpreting `num_connections`:
- The PRODUCTION Render gateway (https://ai-employees-laaa.onrender.com, /health=200) is always-on
  and holds a legitimate Socket Mode connection using the BYTE-IDENTICAL SLACK_APP_TOKEN
  (xapp-1-A09678HT90S-107079243...). Confirmed via Render env-vars API == local .env.
- Therefore the true healthy baselines in local dev are:
    * NO local gateway + probe  => num_connections = 2  (prod + probe)   <- NOT a phantom
    * 1 local gateway  + probe  => num_connections = 3  (prod + local + probe)
- A phantom is only present if the count EXCEEDS those expected values.
- Evidence the +1 is prod (not a pkill-stranded phantom): count stayed rock-stable at exactly 2
  for 12+ min including a 5-min fully-silent window; `pgrep`/`lsof` showed ZERO local processes
  holding any Slack socket; a decaying phantom would have dropped within Slack's 2-15 min reap window.
- Implication for the plan's Step 5 ("expect num_connections==2 after clean start"): in THIS env,
  with prod always connected, a clean single-local-gateway start yields 3, and that is the no-phantom
  healthy state. The meaningful assertion is: starting exactly ONE local gateway adds exactly ONE
  connection (2 -> 3), and stopping it returns to 2 — no EXTRA phantom beyond prod+local+probe.

## F3 E2E — RESULT (2026-06-06 09:11 UTC): APPROVE
- Single-instance guard: PASS. 2nd `pnpm dev` aborted exit(1), named PIDs (64876,64882),
  killed nothing, no self-abort (correctly excluded own PID/parent).
- No-phantom probe: PASS. Post-start = 3, final = 3 (prod+local+probe). No leak across full run.
- Live @mention (the 2:26 AM drop path): PASS. app_mention received -> interaction.received
  -> task.requested -> slack-trigger-handler -> card posted -> Confirm -> task dispatched -> Done.
- Task 62714fc0-93fd-43df-8404-53caf024d470 reached Done; 7-row lifecycle trace recorded.
- "Junio 14, 2026" correctly parsed to extractedInputs {date: 2026-06-14}.
- Gotcha confirmed: in THIS env, num_connections baseline is +1 above local count because the
  always-on prod Render gateway shares the identical SLACK_APP_TOKEN. Interpret probe accordingly:
  no-local-gateway healthy=2, one-local-gateway healthy=3. A phantom is any count ABOVE that.
- tmux ai-f3 LEFT RUNNING for F5 (per task instruction).
- Evidence: .sisyphus/evidence/phantom-socket-prevention/f3-e2e.txt
