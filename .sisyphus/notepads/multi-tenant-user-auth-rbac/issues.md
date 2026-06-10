# Issues — multi-tenant-user-auth-rbac

## [2026-06-09] CRITICAL: prisma migrate dev is broken in this repo

- Root cause: An existing RLS migration enables RLS on `_prisma_migrations` itself, which breaks Prisma's shadow DB validation
- Resolution: Use `prisma migrate deploy` (or direct psql) for ALL future migrations
- Workaround used in T2: Created `_prisma_migrations` table, inserted 58 baseline records, applied migration SQL via psql directly
- Future tasks: NEVER use `prisma migrate dev` — use `prisma migrate deploy` or write SQL and apply via psql

## [2026-06-09] Known issues from planning phase

- `GOTRUE_SITE_URL` is wrong (`localhost:3000`); must point at dashboard (`http://localhost:7700/dashboard/`)
- Google redirect must be `http://localhost:54331/auth/v1/callback` (Kong port)
- Two Kong files exist: `docker/volumes/api/kong.yml` (4 keys) vs `docker/kong.yml` (2 keys) — Wave-0 spike must confirm which is mounted
- `dashboard/src/lib/postgrest.ts` sends key in `Authorization: Bearer` — breaks under opaque keys
- `src/lib/interaction-classifier.ts:87-88` sends `Bearer: SECRET` — breaks under opaque keys on cloud
- `dashboard/src/hooks/use-execution-logs.ts:49` raw fetch bypasses gatewayFetch — must migrate
