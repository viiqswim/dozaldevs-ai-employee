# Phase 7 — Decisions

## [2026-04-01] Session ses_2bab9c227ffe03nCP4j9oOJUYX — Initial

### Logger Library: pino

- Selected pino over custom utility or winston
- Fast, JSON-native, handles circular references, built-in redact support
- Install: `pnpm add pino && pnpm add -D @types/pino`

### Agent Version Hash: SHA-256 of key-sorted JSON

- Use `crypto.createHash('sha256')` on `JSON.stringify(sortedKeys(config))`
- Deterministic across restarts — same config = same hash

### Fly.io API Base URL: https://api.machines.dev/v1

- POST /apps/{app}/machines — create machine
- DELETE /apps/{app}/machines/{id}?force=true — destroy machine
- GET /apps/{app}/machines/{id} — get status
- Auth: Bearer FLY_API_TOKEN

### Watchdog: exported as pure function

- `export async function runWatchdog(prisma, flyClient, inngest, slackClient)`
- Wrapped in Inngest cron trigger separately for testability

### Cost circuit breaker: Single alert per threshold crossing

- Use timestamp flag to prevent alert spam
- Alert fires on first crossing only, not on every subsequent LLM call
