# Learnings — dev-tool-hot-reload

## [2026-05-14] Session Start

### Key Architecture Facts

- `runLocalDockerContainer()` is in `src/inngest/employee-lifecycle.ts:79-103` — single function, two call sites (execution line ~481, delivery line ~1686)
- Dockerfile line 86: `npm install --prefix /tools/slack @slack/web-api@^7.15.1` — only tool dep install in entire image
- All unit tests use `.toContain()` for docker command assertions — safe to add `-v` flags
- `dev.ts:600-611` uses shared `watchWorkerDirs()` for both `src/workers/` and `src/worker-tools/` — need to split behavior
- Tools are raw `.ts` files executed via global `tsx` — no compilation needed → bind-mount works perfectly
- NODE_PATH must be set for `@slack/web-api` resolution after deps moved to `/tool-deps/slack/`

### Critical Implementation Notes

- **Path resolution**: Use `fileURLToPath(import.meta.url)` NOT `process.cwd()` in lifecycle.ts
- **existsSync guard**: Required before adding `-v` flag — missing path → Docker creates empty dir → wipes tools
- **NODE_PATH strategy**: Set `ENV NODE_PATH=/tool-deps/slack/node_modules` in Dockerfile (applies to all containers)
- Changing `runLocalDockerContainer()` covers BOTH execution and delivery call sites automatically

## [2026-05-14] E2E Verification Results (Task 5)

### Hot-Reload Works ✅
- Docker bind mount confirmed: `["/path/to/src/worker-tools:/tools"]` in container HostConfig.Binds
- Marker `HOT_RELOAD_E2E_MARKER_42` visible in running container at `/tools/platform/report-issue.ts` WITHOUT docker rebuild
- `@slack/web-api` resolves from `/app/node_modules/` (pnpm installed it there too, not just via NODE_PATH)

### Task Failure Was Pre-Existing
- Task 56a30548 ran for ~75 seconds then Failed (NOT a fast MODULE_NOT_FOUND failure)
- Failure = DozalDevs tenant missing Slack OAuth token (pre-existing infra issue)
- `docker run` with bind mount + `node -e "require.resolve('@slack/web-api')"` → resolves cleanly = NO_MODULE_NOT_FOUND

### Test Suite
- 22 files failed, 145 passed (72 test failures, 1755 passed)
- All failures pre-existing: WORKER_RUNTIME tests check `mockCreateMachine` (Fly path) but tests don't set `WORKER_RUNTIME=fly` → Docker path runs → createMachine never called
- Our hot-reload commit (e975c87) only modified `runLocalDockerContainer()` (Docker path) — no Fly-path tests affected
