# Decisions — dev-tool-hot-reload

## [2026-05-14] Architecture Decisions

- Full directory mount (`src/worker-tools/` → `/tools/`) — not individual file mounts
- Auto-enable in Docker mode — no opt-in flag
- `@slack/web-api` moved to `/tool-deps/slack/` with `ENV NODE_PATH` in Dockerfile
- Fly.io unaffected — `runLocalDockerContainer()` is already gated to Docker-only path
