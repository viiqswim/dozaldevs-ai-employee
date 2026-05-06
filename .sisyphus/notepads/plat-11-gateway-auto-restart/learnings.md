
## Task 1 — Graceful Shutdown (2026-05-06)

- `app.listen()` return value captured as `const server` — signal handlers added inside `.then()` block
- SIGTERM + SIGINT both handled with `server.close(() => process.exit(0))`
- Slack Bolt Socket Mode WebSocket connection does NOT block `server.close()` — port releases within ~500ms
- QA confirmed: port released after SIGTERM, rapid restart (1s gap) succeeds with no EADDRINUSE
- Evidence files in `.sisyphus/evidence/` (gitignored, local only)

## Task 4 — E2E Restart Verification (2026-05-06)

### Full E2E test results — ALL PASS

- Dev stack started clean in `ai-e2e` tmux session via `pnpm dev --skip-build`
- Gateway ready in ~5s, Inngest already running (PID 29504 stable throughout)

**Gateway auto-restart (Scenario 1):**
- Modified `src/gateway/server.ts` → tsx watch detected change, logged `Restarting...`
- New gateway process (pid 73427) bound port 7700 within ~1s
- `curl http://localhost:7700/health` → `{"status":"ok"}` — PASS
- Inngest PID unchanged (29504 before, 29504 after) — PASS

**Worker warning (Scenario 1b):**
- Modified `src/workers/opencode-harness.mts` → debounce fired after 500ms
- Log showed: `⚠  Worker files changed — run docker build -t ai-employee-worker:latest . to apply`
- Warning appeared in both log and tmux pane — PASS

**Rapid saves EADDRINUSE stress test (Scenario 2):**
- 3 saves to `src/gateway/server.ts` at 1s intervals
- tsx watch triggered 3 individual restarts (at 1:55:01, 1:55:02, 1:55:03)
- Each restart cleanly rebound port 7700 — no EADDRINUSE in log or pane
- Gateway healthy at end: `{"status":"ok"}` — PASS

### Key observation
- `grep -c` exits with code 1 when count is 0, causing `|| echo "0"` to fire in bash scripts.
  Use `grep pattern file && echo FOUND || echo CLEAN` for boolean checks instead of `-c` with `||`.

### Cleanup
- `git checkout src/gateway/server.ts src/workers/opencode-harness.mts` — clean
- `tmux kill-session -t ai-e2e` — killed, only pre-existing sessions remain
- Evidence saved to `.sisyphus/evidence/task-4-e2e-restart.txt` and `task-4-rapid-save.txt`
