# Issues — employee-overview-and-drafts

## [2026-05-18] Session Start

### Pre-existing Test Failures (DO NOT FIX)

- `container-boot.test.ts` — requires Docker socket, all 4 tests skip
- `inngest-serve.test.ts` — function count mismatch (hardcodes old count)

### Known Gotchas

- Dashboard MUST be rebuilt after ANY frontend change: `cd dashboard && pnpm build`
- Gateway serves static build — dev server is NOT used
- `pnpm prisma migrate dev` requires the DB to be running
- `pnpm prisma generate` must run after schema changes to update the Prisma client
