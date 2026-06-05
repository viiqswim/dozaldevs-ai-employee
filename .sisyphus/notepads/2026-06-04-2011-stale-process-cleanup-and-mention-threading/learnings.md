# Learnings — stale-process-cleanup-and-mention-threading

## [2026-06-04] Initial Research

### dev.ts structure

- Opening banner at line 206-210
- Step 1 (Pre-flight checks) starts at line 215
- Step 5 (Inngest) spawns at line 525 with `detached: true`
- Step 6 (Gateway) spawns at line 569 with `detached: true`
- Step 8 (Dashboard) spawns at line 779 with `detached: true`
- `DASHBOARD_PORT = 7701` (number constant at line 115)
- `GATEWAY_PORT = process.env.PORT ?? '7700'` (string at line 114)
- `cleanup()` function at lines 130-162 — DO NOT TOUCH
- Docker container cleanup pattern at lines 136-150 — FOLLOW THIS PATTERN
- `warn()` function available (defined in color helpers around line 41-47)
- `execSync` already imported

### Inngest spawn pattern

- `npx inngest-cli@1.21.0 dev -u http://localhost:${GATEWAY_PORT}/api/inngest --port 8288`
- Kill pattern: `"inngest-cli.*8288"` (matches the port arg)

### Gateway spawn pattern

- `npx tsx watch --clear-screen=false src/gateway/server.ts`
- Kill pattern: `"tsx.*watch.*server\\.ts"` (note: escape the dot)

### Dashboard spawn pattern

- `pnpm dev --port 7701` (in dashboard/ cwd)
- Kill pattern: `"vite.*7701"` (Vite is what pnpm dev runs under the hood)

### interaction-handler.ts

- `messageTs` IS destructured at line 23 from `event.data`
- `emit-task-requested` at lines 559-572 sends `threadTs` but NOT `messageTs`
- Fix: add `messageTs,` after `threadTs,` at line 568

### slack-trigger-handler.ts

- Type cast at lines 110-118 — missing `messageTs?: string`
- `replyTs` at line 158: `threadTs ?? (event.data.ts as string | undefined)` — BUG: `event.data.ts` is always undefined
- Fix: `threadTs ?? messageTs`
- `validate-context` return at line 132: `{ tenantId, text, userId, channelId, archetypeId, threadTs }` — also needs `messageTs`
- `contextValue` JSON at lines 197-204 stores `threadTs: replyTs` — already correct, no change needed
- `chat.postMessage` at line 246-248 uses `thread_ts: replyTs` — will work once replyTs is fixed
