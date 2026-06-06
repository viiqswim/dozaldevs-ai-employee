# Issues — slack-socket-singleton-fix

## [2026-06-05] Known Gotchas

### tsx watch hot-reload race

- tsx watch kills the old child and forks a new one on every file save
- The new child must reclaim the lock from the dying predecessor
- Solution: retry window (~2s, 100ms polls) before hard-failing

### process.kill(pid, 0) on macOS

- Returns true if process exists (even if zombie)
- May need to also check /proc or use `ps` for identity validation on macOS
- macOS: use `ps -p <pid> -o args=` to get cmdline

### Reaper over-match risk

- Bare `gateway/server.ts` substring could match: other git clones, editors, LSP servers
- Must anchor on absolute `process.cwd()` path

### Lock file on Render

- Production runs one container — lock is a no-op for single instance
- Must NOT be on a persistent Render volume (would block restart after crash)
- os.tmpdir() is ephemeral per container — correct behavior

## [2026-06-05] F3(e) Blocker — Live Slack @mention E2E

- F3(e) requires the user to physically send a Slack @mention in ops-cleaning-schedule
- This is the ONE sanctioned manual touch in the plan (explicitly documented in plan)
- Plan states: "Present consolidated results to the user and get explicit 'okay' before completing. Do NOT auto-proceed."
- F1, F2, F4 all APPROVE; F3(a)(b)(c)(d) all PASS
- Gateway is live: PID 88108 holds Socket Mode lock, exactly 1 leaf running
- Waiting for user to: send @mention → click Confirm → confirm task reaches Done
- After user confirms: mark F1-F4 [x] in plan, run F5 cleanup, send Telegram
