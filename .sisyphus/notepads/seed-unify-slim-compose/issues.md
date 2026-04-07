# Issues & Gotchas — seed-unify-slim-compose

## Critical Gotchas

1. **fetched-pets supabase-users.sh**: DO NOT TOUCH. It's a production admin tool with hardcoded cloud credentials, NOT a local seed script.
2. **fetched-pets uses npm**: All commands must use `npm run` or `npx`, never `pnpm`
3. **nexus-stack worktrees**: Only modify the MAIN worktree, not any others
4. **storage→imgproxy**: Must unwire ALL 3 things (depends_on, ENABLE_IMAGE_TRANSFORMATION, IMGPROXY_URL) or storage service will fail to start
5. **studio→analytics**: Must unwire BOTH things (depends_on, NEXT_PUBLIC_ENABLE_LOGS) or studio expects analytics to be healthy
6. **No seed data content changes**: Only wiring and orchestration changes allowed
7. **Volumes db/logs.sql**: Leave this file completely alone — it has analytics-related SQL but removing it breaks volume mounting

## [2026-04-06] T9 E2E Verification Results

- ai-employee: [PASS] — exit code 0, ~30s (services portion), 6 services (db/kong/auth/rest/meta/studio), Kong 401, Studio 200 (redirect from 307), idempotent OK. Note: `pnpm setup` printed only pnpm lockfile message when run via shell; `npx tsx scripts/setup.ts` works correctly — likely a pnpm version issue with how scripts are resolved.
- nexus-stack: [PASS] — exit code 0, 26s, 7 services (db/kong/auth/rest/meta/storage/studio), Kong 401, Studio 200, auth users 7 ≥ 5, idempotent OK (7.5s 2nd run).
- vlre-hub: [PASS with warnings] — exit code 0, 24.6s, 7 services (db/kong/auth/rest/meta/storage/studio), Kong 401, Studio 200, auth users 7 ≥ 5, idempotent OK. Warnings: (1) `sync-supabase-keys.sh` fails silently (non-fatal; likely missing `supabase status` support in docker-compose mode); (2) `seed-properties` fails with P2022 `properties.passcodeName` column not found — migration `20260405181934_add_property_passcode_name` applied but Prisma runtime disagrees (likely column naming mismatch `passcode_name` vs `passcodeName`). Both non-fatal — overall exit 0.
- fetched-pets: [PASS with warning] — exit code 0, 22.6s, 6 services (db/kong/auth/rest/meta/studio), Kong 401, Studio 200, auth users 3 ≥ 1, idempotent OK (exit 0, 4.75s 2nd run). Warning: app seed (`db:seed`) fails on 2nd run with unique constraint on `sku` field (seed.ts uses `create()` not `upsert()`) — non-fatal, handled as warning.

### Known Issues to Fix (not in scope of this wave)

- vlre-hub: `seed-properties.ts` uses `passcodeName` field that doesn't match the column created by migration `20260405181934_add_property_passcode_name` (which creates `passcode_name` in snake_case). Prisma client regenerates with camelCase but the DB column may need inspection.
- fetched-pets: `prisma/seed.ts` inventory seeding uses `create()` instead of `upsert()` — fails on second run. Should use `upsert()` with `sku` as unique key.
- vlre-hub: `scripts/sync-supabase-keys.sh` fails with exit 1 — likely using `supabase status` which doesn't work without CLI-managed containers.
