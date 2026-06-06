# Learnings — slack-socket-singleton-fix

## [2026-06-05] Session Init

### Root Cause (confirmed against live processes)

- `tsx watch` spawns a SUPERVISOR + a CHILD `node` process (the real gateway)
- The real gateway leaf cmdline: `node …/tsx/dist/loader.mjs src/gateway/server.ts` — NO "watch" token
- `dev.ts` reaper pattern `tsx.*watch.*server\.ts` kills supervisors but LEAVES the leaf alive
- Slack Socket Mode delivers each event to exactly ONE connected socket (load-balanced)
- Zombie leaf steals ~50% of `app_mention` events → silent loss

### Key Code Locations

- Reaper block: `scripts/dev.ts:213-236` (patterns at 217-221, pkill at 227)
- Gateway spawn: `scripts/dev.ts:595-603` (`detached: true` at 600)
- Inngest spawn: `scripts/dev.ts:551-561`; Dashboard: `scripts/dev.ts:805-808`
- dev.ts cleanup (group-kill, ALREADY CORRECT): `scripts/dev.ts:130-162`
- Gateway Socket Mode start: `src/gateway/server.ts:107-156` (`boltApp.start()` at 126-127)
- Gateway shutdown handlers (need `boltApp.stop()`): `src/gateway/server.ts:304-310`
- Non-socket path (CI, `SLACK_APP_TOKEN` unset → ExpressReceiver): `src/gateway/server.ts:157-173`

### Critical Constraints

- DO NOT claim/fix the SIGINT cleanup path — `dev.ts:154` group-kill is already correct on clean exit
- DO NOT gate lock on HTTP :7700 bind — must gate Socket Mode startup specifically
- Lock must be TAKEOVER-CAPABLE (tsx watch hot-reload kills+reforks child on every file save)
- Lock file must be in OS temp dir (NOT repo, NOT persistent volume)
- Reaper must anchor on absolute repo path (process.cwd()) — never bare relative substring
- Guard must be conditional on SLACK_APP_TOKEN (no-op when unset)
- DO NOT touch handlers.ts dedup logic
- DO NOT add locks to Inngest or Dashboard

## [2026-06-05] Task 6: QA Helper Snippets for Final Wave F3

### Single-gateway count assertion

```bash
# Should return 1 after pnpm dev starts
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l
```

### Simulate orphaned gateway (unclean death)

```bash
# 1. Start pnpm dev in tmux
# 2. Get the dev.ts parent PID
DEV_PID=$(pgrep -f "scripts/dev.ts" | head -1)
# 3. Kill dev.ts parent with -9 (simulate crash)
kill -9 $DEV_PID
# 4. Confirm gateway leaf is still alive (orphaned)
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l  # Should be 1 (orphan)
# 5. Start pnpm dev again — Step 0 should reap the orphan
# 6. After startup, count should still be 1 (orphan reaped, new one started)
```

### Decoy process (over-match guard)

```bash
# Spawn a decoy whose argv contains "gateway/server.ts" but NOT the repo path
DECOY_PID=$(node -e "setTimeout(()=>{},300000)" /tmp/decoy/src/gateway/server.ts & echo $!)
# Run dev.ts Step 0 logic (or just pnpm dev)
# Assert decoy survived
kill -0 $DECOY_PID && echo "DECOY SURVIVED (correct)" || echo "DECOY KILLED (bug!)"
kill $DECOY_PID  # cleanup
```

### Second-gateway refusal

```bash
# With one gateway running (holding the lock), start a second:
SLACK_APP_TOKEN=xapp-test npx tsx src/gateway/server.ts
# Expected: exits non-zero AND logs "Another gateway already holds the Slack Socket Mode lock"
```

### Hot-reload survival

```bash
# With pnpm dev running:
touch src/gateway/server.ts
# Wait ~3s for tsx watch to reload
sleep 3
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l  # Should be 1
# Check logs for "Socket Mode connected" from the new child
```

### Telegram notification message (send ONLY after Final Wave passes and user approves)

```
✅ slack-socket-singleton-fix complete — dev.ts reaper now kills the real gateway leaf, gateway enforces a Socket Mode single-instance lock + stops Bolt on shutdown, AGENTS.md #4 documents the true root cause, and live @mention E2E is mandated. Come back to review.
```

## F2 Code Quality + Build Verification (review pass)

- **Lock tests**: 6/6 pass (acquire-free, reclaim-stale, blocked-live, re-entrant, release-guard, release-own). `blocked-live` correctly mocks `execFileSync` (ps identity) rather than spawning a process — runs in ~2s via the deadline window.
- **Build**: `pnpm build` (tsc -p tsconfig.build.json) exits 0.
- **Full suite**: 31 failed / 1736 passed / 26 skipped across 6 files. **ALL 31 are PRE-EXISTING** — proven by checking out baseline `e4748bd4~1` (before any socket-mode work) and running the same 6 files: identical 31 failures. Socket-mode commits touched only 5 files (socket-mode-lock.ts, server.ts, dev.ts, the test, AGENTS.md); none of the failing files import server.ts.
  - Failing files: guest-handlers, override-handler, rule-handlers (`boltApp.use is not a function` — Bolt mock drift), reminder-blocks (copy assertion), slack-input-collector, slack-trigger-handler (copy assertions). Unrelated to this plan.
- **Lint**: eslint on the 4 changed files = 0 errors, 1 warning (unused `eslint-disable no-constant-condition` directive at socket-mode-lock.ts:87 — trivial, removable).
- **dev.ts**: diff vs baseline starts at line 214 (Step 0 banner) — `cleanup()` at 130-162 is verifiably untouched. Reaper anchors on `process.cwd()` (line 219) embedded in pattern `${repoRoot}.*src/gateway/server\.ts` (line 236).
- **server.ts**: lock acquired (127) BEFORE boltApp.start() (136); `acquired===false` logs holderPid + `process.exit(1)` (128-134); SIGTERM (314) & SIGINT (324) both guard `if(bolt) bolt.stop()` + `releaseSocketModeLock()`; import uses `.js` (49).

## [2026-06-06] CRITICAL: F3(e) was a FALSE PASS — NEW BUG discovered via real browser E2E

### What happened

- User correctly challenged the F3(e) "PASS". I had pattern-matched an unrelated Hostfully-webhook task (5efaaa40) to the user's @mention. They were never the same.
- Drove Slack via Playwright MCP (already logged in as Victor Dozal, VLRE workspace) and ran REAL @mention tests.

### Admin-trigger path: BOTH employees PASS end-to-end

- `real-estate-motivation-bot-2` (task efea7d91): Received→...→Done, work_minutes=15, REAL motivational message posted to C0960S2Q8RL. Verified via Slack API.
- `cleaning-schedule` (task 6d70a586, date input 2026-06-10): Received→...→Done, REAL cleaning schedule (8 properties, 3 cleaners, Spanish) posted to C0B71QSMZKQ. Verified via Slack API.

### @mention path: BUG REPRODUCED (2 independent live tests)

- Test 1 (stale socket, PID 41941): posted `<@U096LNDCW1F> ...Junio 14... [e2e-test]` ts=1780711551 → ZERO gateway log lines, ZERO new tasks, no reply.
- Test 2 (FRESH restart, PID 72257, socket connected <2min prior): posted ts=1780711969 [e2e-fresh] → SAME: zero gateway activity, no task.
- Both messages posted correctly with valid bot mention (verified via conversations.history).

### Timeline (UTC) — when it broke

- @mention worked ALL DAY via app_mention until **23:21 UTC (6:21pm CDT)** — last successful slack-trigger task 26db7547 (external_id slack-trigger-1780701672...).
- My T4 server.ts commit (23e17d76) landed 00:01 UTC — 2.5h BEFORE the last working mention. **My code did NOT break it** (mentions worked after it was live).
- Channel history shows: 5:10pm & 5:20pm CDT mentions = NO reply (the ORIGINAL zombie incident), 5:51pm & 6:21pm = worked (after restart). Then stopped entirely.

### Root-cause evidence (ruled in / out)

- ❌ NOT zombie gateway: exactly 1 leaf (lock held), confirmed via pgrep + lock file.
- ❌ NOT stale socket alone: fresh restart, socket "connected" once, 0 disconnect/reconnect events, still broken.
- ❌ NOT bot-token auth: DB `slack_bot_token` is VALID (deliveries to Slack succeeded for both employees). authorize() uses DB token via loadTenantEnv, not the env var.
- ⚠️ `SLACK_BOT_TOKEN` ENV VAR = `invalid_auth` (dead). Used by employee-lifecycle delivery via tenantEnv['SLACK_BOT_TOKEN'] — but that comes from loadTenantEnv (DB), not raw env. Worth verifying the env var isn't used for Socket Mode receiver.
- ❌ NO `slack_bolt_authorization_error` logs — event never reaches authorize/handler at all.
- ❌ NO `app_mention event received` (info-level, line 325-328 handlers.ts) — handler never fires.
- ⚠️ Bolt middleware `'raw payload received'` is DEBUG level; createLogger() in logger.ts has NO level config (defaults to info) and does NOT read LOG_LEVEL → debug suppressed. Cannot see raw WS traffic without code change. **This is itself a diagnosability gap.**
- ⚠️ apps.connections.open succeeds (app token valid). Prod (Render) last deploy update_failed 2026-06-03 → not competing.

### Conclusion

The @mention/app_mention Socket Mode event delivery is broken at the WebSocket→Bolt layer for reasons NOT explained by the singleton fix. Likely candidates: (1) Bolt SocketModeReceiver silent stall / Slack-side connection registration drift, (2) the gateway's createFilteredBoltLogger swallowing the events or errors, (3) event subscription routing. Needs a dedicated diagnostic+fix plan with debug-level Bolt logging as step 1.

### Process note

- Restart of pnpm dev: clean Ctrl+C → 0 gateway procs (SIGINT group-kill works), then relaunch. Step 0 reaper also proved itself when ai-dev tmux had died earlier (orphan reaped on restart).

## [2026-06-06] DEFINITIVE ROOT CAUSE — dual issue, proven with an independent Socket Mode probe

Deeper diagnosis (Opus, before handing to executor). Ran an INDEPENDENT raw Socket Mode probe (Node 22 global WebSocket + apps.connections.open) to observe Slack's actual delivery.

### PROOF 1 — Auth is NOT the problem (ruled out definitively)

- Decrypted the DB `slack_bot_token` (AES-256-GCM via the project's own algorithm, inline node -e, token value never printed).
- DB token md5 = `71b740fd...` = IDENTICAL to `VLRE_SLACK_BOT_TOKEN`. `auth.test` on it = `ok:true` (VLRE/papichulo/U096LNDCW1F).
- The dead `SLACK_BOT_TOKEN` env var (`invalid_auth`) is a RED HERRING — the Bolt authorize callback uses `TenantInstallationStore.fetchInstallation` → `tenant_secrets.slack_bot_token` (DB), NOT the env var. `tenant_integrations` has `T06KFDGLHS6 → VLRE (...003)`; decrypted DB token is valid.

### PROOF 2 — ROOT CAUSE A: PHANTOM Socket Mode connection (the intermittent-drop cause)

- Independent probe connected → Slack `hello` reported **num_connections = 3**.
- Local reality: only 1 gateway leaf holds an ESTABLISHED TLS conn to Slack (lsof), + my 1 probe = 2 expected. Slack says 3. Re-checked after probe closed: still 3.
- The 3rd is a PHANTOM — a stranded WebSocket from an earlier unclean gateway death (kill -9 / tmux-kill) Slack STILL has registered.
- Slack Socket Mode ROUND-ROBINS events across ALL connected sockets. A dead phantom in the pool → ~1/N of app_mention events delivered to it VANISH. **Zombie bug at the Slack-connection layer — the local singleton lock cannot reclaim a WS Slack still holds.** Explains the INTERMITTENT original drops (5:10/5:20pm no reply, 5:51pm worked).

### PROOF 3 — ROOT CAUSE B: classifier returns unclear/empty → silent no-op (the OTHER half)

- During the probe test Slack DID deliver my mention; the gateway DID receive it (logged `app_mention event received`, posted `"On it — one moment…"` ack — probe captured the ack too).
- BUT the chain died at classification: `interaction-classifier` logged `intent: ""` → defaulted to `unclear` → `Interaction handled intent:unclear` → NO `task.requested` → NO card → NO task (0 new tasks confirmed).
- Code: `src/gateway/services/interaction-classifier.ts:35-48` — `intent = result.content.trim().toLowerCase(); return validIntents.includes(intent) ? intent : 'unclear'`. Gateway LLM (deepseek-v4-flash) returned empty/non-matching for terse `"Papi chulo itinerario limpieza Junio 14 [probe-test]"`.
- Full natural sentences classified as `task` and worked earlier today. Terse text + empty-LLM-response → `unclear` silent drop. No retry, no user feedback on `unclear`.

### CONCLUSION — what the fix plan targets (NOT speculative branches)

1. **Phantom Socket Mode connections**: local lock/reaper can't help (Slack holds the registration). Fix: verify/ensure `boltApp.stop()` truly closes the SocketModeClient WS on shutdown; document Slack stale-socket expiry; consider a startup reconcile/health check. Round-robin across a stale socket = silent ~1/N loss = the intermittent @mention failure.
2. **Classifier `unclear` silent no-op**: empty/ambiguous LLM result drops the request silently. Fix: on empty/non-matching result, retry once; never silently no-op on `unclear` — post a short clarifying reply so the user knows. (Optionally bias clearly-actionable mentions toward `task`.)

### Diagnosability enabler (still needed first)

- `createLogger()` (logger.ts) ignores LOG_LEVEL; Bolt debug middleware suppressed. `createFilteredBoltLogger` (slack-logger.ts:42-47) setLevel = NO-OP, getLevel hardcoded INFO. LOG_LEVEL support = right first step.

### Reusable technique

- Independent Socket Mode probe: `apps.connections.open` (POST, app token) → `new WebSocket(url)` → on `hello` read `num_connections` → ack envelopes by echoing `envelope_id`. Counts phantom connections; observes raw delivery independent of the gateway.
