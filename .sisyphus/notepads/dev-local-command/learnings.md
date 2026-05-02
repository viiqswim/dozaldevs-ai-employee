# Learnings — dev-local-command

## [2026-05-02] Task: setup
No prior implementation learnings yet. See plan for full context.

### Key Codebase Facts
- `dev-start.ts` (379 lines) is the canonical pattern base for new startup scripts
- `dev-e2e.ts` (561 lines) has --skip-build and --help patterns
- Gateway port: `process.env.PORT ?? '7700'`
- Named tunnel config: `~/.cloudflared/ai-employee-local.yml`
- Tunnel credentials: `~/.cloudflared/e160ac6d-2d7d-47c4-a552-b13700947d29.json`
- Tunnel URL: `https://local-ai-employee.dozaldevs.com`
- `.env` has `USE_FLY_HYBRID=1` — MUST be overridden to `0` in gateway spawn env
- `TUNNEL_URL` env var is a SEPARATE concern (PostgREST quick-tunnel) — must NOT be touched
- cloudflared binary: `/opt/homebrew/bin/cloudflared` (v2026.3.0)

## [2026-05-02] Task: T1 — dev-local.ts created
- Script created at scripts/dev-local.ts (533 lines)
- package.json: "dev:local" entry added between "dev:start" and "dev:e2e"
- All 6 QA scenarios PASS
- pnpm build exits 0 (TypeScript clean)
- Commit: 980e4a3
- Key pattern: copied dev-start.ts structure verbatim, cherry-picked --help/--skip-build from dev-e2e.ts
- Critical env override: USE_FLY_HYBRID='0' + USE_LOCAL_DOCKER='1' in gatewayEnv to suppress Fly.io dispatch
- cloudflared spawn: piped stdout/stderr to /tmp/cloudflared.log (extremely noisy — must not go to terminal)
- Early-exit detection: cfProc.on('exit') checks Date.now() - cfStart < 5000 to catch immediate crashes
- Tunnel already-active check: curl --max-time 5 to TUNNEL_URL/health before spawning cloudflared
- Step numbering: 1 pre-flight, 2 docker build, 3 reset (optional), 4+4b docker compose, 5+5b inngest, 6+6b gateway, 7+7b tunnel
