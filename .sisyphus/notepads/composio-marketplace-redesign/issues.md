# Issues — Composio Marketplace Redesign

## [2026-06-11] Pre-existing Issues (DO NOT FIX)

### Prisma Client Missing Types

- `composioConnection` and `taskComposioCall` missing from Prisma client
- Affects: `src/repositories/composio-connection-repository.ts`, `src/gateway/routes/composio-admin.ts`
- Root cause: `pnpm prisma generate` not run after schema changes
- Action: Do NOT fix — pre-existing, out of scope. Our catalog endpoint should NOT use Prisma for composio connections; use PostgREST or the existing repository methods directly.

### Composio SDK Type Errors in node_modules

- `node_modules/@composio/core/dist/composio-DRl6WCI9.d.mts` has missing peer deps
- These are in node_modules — do NOT fix, do NOT reference these errors as failures

### vitest.config.ts coverage type error

- Pre-existing, unrelated to this plan
