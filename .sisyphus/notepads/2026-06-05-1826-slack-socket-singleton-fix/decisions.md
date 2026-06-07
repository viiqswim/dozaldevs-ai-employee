# Decisions — slack-socket-singleton-fix

## [2026-06-05] Architecture Decisions

### Lock file location

- Use `os.tmpdir()/ai-employee-gateway-socketmode.lock`
- NOT in repo, NOT on persistent volume
- Reason: crashed-container restart must not be blocked

### Lock takeover strategy

- On acquire: if file exists, check liveness via `process.kill(pid, 0)`
- Also check identity: stored PID's cmdline includes this repo's `gateway/server.ts`
- If holder is dead OR stale → reclaim (overwrite with our PID)
- If live valid holder → return `{ acquired: false, holderPid }` → caller exits non-zero
- Retry window: up to ~2s of 100ms polls (handles tsx watch kill+refork race)

### Reaper fix strategy

- Derive `repoRoot = process.cwd()` in dev.ts
- Use `pgrep -f "${repoRoot}/src/gateway/server.ts"` — matches ALL three processes (supervisors + leaf) via absolute path
- This is safe: absolute path won't match other clones/editors/debuggers

### boltApp.stop() placement

- Add to BOTH SIGINT and SIGTERM handlers in server.ts:304-310
- Call BEFORE process.exit(0)
- Release lock in same path

### Test file location

- `tests/gateway/socket-mode-lock.test.ts` (NOT under src/)
