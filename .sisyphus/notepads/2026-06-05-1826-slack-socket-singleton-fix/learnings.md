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
