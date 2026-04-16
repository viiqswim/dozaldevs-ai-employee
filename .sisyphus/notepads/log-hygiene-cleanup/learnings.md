# Learnings — log-hygiene-cleanup

## 2026-04-16 Session Start

### Codebase Patterns Confirmed

- **Test file locations**: `tests/lib/fly-client.test.ts` (lib tests), `tests/gateway/` (gateway tests — directory EXISTS)
- **Test mocking pattern**: `vi.stubGlobal('fetch', mockFetch)` with `vi.fn()` + `mockFetch.mockResolvedValueOnce({status: N, json: async () => (...)})` — follow exactly
- **Test imports**: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'`
- **Status 204 mock**: `mockFetch.mockResolvedValueOnce({ status: 204 })` (no json property needed)
- **fly-client.test.ts line 136**: titled `"should throw ExternalApiError on non-2xx, non-404 response"` — RENAME to `"should throw ExternalApiError on 5xx responses"`

### Key File Facts

- `src/lib/fly-client.ts:146` — line to change: `if (status === 204 || status === 404)` → `if ((status >= 200 && status < 300) || status === 404)`
- `src/gateway/server.ts:13` — `const logger = pino(...)` — pass THIS instance to createFilteredBoltLogger, do NOT create a new pino
- `tests/gateway/` directory EXISTS — `slack-logger.test.ts` goes there

### @slack/logger Interface (CRITICAL — all 6 required)

- `debug`, `info`, `warn`, `error`, `setLevel` (no-op), `getLevel` (return LogLevel.INFO), `setName` (no-op)

### Filter Prefixes (exact, not substring)

- `"A pong wasn't received from the server"` → debug
- `"A ping wasn't received from the server"` → debug
- Everything else → original level; `.error()` NEVER filtered

### Frozen Files (DO NOT TOUCH)

- `src/workers/entrypoint.sh`, `src/workers/orchestrate.mts`, `src/inngest/lifecycle.ts`

## Task 1 Complete (2026-04-16)

- destroyMachine now accepts status >= 200 && < 300 OR 404 as success
- Test file: renamed line 136 title + added 200-success test + 204-compat test
- All fly-client tests pass: 16 tests
- Commit: fix(fly-client): accept all 2xx status codes on machine destroy

## Task 2 Complete (2026-04-16)

- Created src/gateway/slack-logger.ts with createFilteredBoltLogger factory
- Logger interface: 6 methods implemented (debug, info, warn, error, setLevel, getLevel, setName)
- LogLevel type is: enum LogLevel { ERROR = "error", WARN = "warn", INFO = "info", DEBUG = "debug" } — it's an enum, not a string union
- @slack/logger is NOT directly symlinked in node_modules/@slack/ — it's a transitive dep of @slack/bolt. Import Logger and LogLevel from '@slack/bolt' instead (bolt re-exports both from @slack/logger)
- Wired into server.ts Socket Mode App constructor via logger option (line ~55)
- 4 unit tests pass in tests/gateway/slack-logger.test.ts
- pnpm build: exit 0 (TypeScript interface compliance confirmed)
- Commit: feat(gateway): filter noisy Bolt socket-mode heartbeat warnings

## Task 3 Complete (2026-04-15)

- pnpm build: exit 0
- pnpm test: 849 passing, 51 failing (pre-existing — all known failures)
- pnpm lint: exit 0 (96 warnings, 0 errors)
- Gateway log: 0 matches for "wasn't received from the server"
- Socket Mode: started successfully — connected to Slack (SLACK_APP_TOKEN present in local .env)

## F4 Fix (2026-04-15)
- server.ts ExpressReceiver guard restored: outer else changed to else-if(SLACK_SIGNING_SECRET)
- signingSecret ?? '' fallback removed — now uses env var directly
- Also added `boltApp &&` guard to registerSlackHandlers call (was undefined-unsafe after new else branch)
- Socket Mode branch unchanged
- Commit: fix(gateway): restore SLACK_SIGNING_SECRET guard on ExpressReceiver path
