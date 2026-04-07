# Learnings — seed-unify-slim-compose

## Key Discoveries

- All 4 repos use identical docker-compose.yml templates (only ports differ)
- Analytics (Logflare) is the sole cause of 2–4 minute startup delays and OOM kills
- `storage` depends on `imgproxy` with `condition: service_started` — must unwire both together
- `studio` depends on `analytics` with `condition: service_healthy` — must unwire
- `kong` depends on `studio` which depends on `analytics` — full chain must be unwired
- fetched-pets `scripts/supabase-users.sh` is a PRODUCTION admin tool with hardcoded cloud credentials — NOT a seed script, do not modify
- fetched-pets uses **npm** (not pnpm) — all commands must use `npm run` or `npx`
- nexus-stack and vlre-hub already have `db:setup:supabase` that does everything, but `supabase:start` only does infra+migrations — need to add seeding steps to setup-db.ts
- ai-employee's `pnpm setup` already seeds app data — only needs the compose trim + retry loop simplification
- fetched-pets has NO auth seed at all — needs new `seed-auth.sh` + `supabase/seed.sql` created
- vlre-hub's `package.json` name is still "nexus-stack" (a fork) — treat it as independent

## Services to Keep Per Repo

- ai-employee: db, kong, rest, studio, meta, auth (6)
- nexus-stack: db, kong, auth, rest, storage, studio, meta (7)
- vlre-hub: db, kong, auth, rest, storage, studio, meta (7)
- fetched-pets: db, kong, auth, rest, studio, meta (6)

## Services to REMOVE from All Repos

analytics, vector, supavisor, imgproxy, functions, realtime

## Port Map

- ai-employee: Kong=54321, DB=54322, Studio=54323
- nexus-stack: Kong=55321, DB=55322, Studio=55323
- vlre-hub: Kong=56321, DB=56322, Studio=56323
- fetched-pets: Kong=57321, DB=57322, Studio=57323

## Unwiring Required

- storage→imgproxy: 3 changes (remove depends_on, set ENABLE_IMAGE_TRANSFORMATION=false, remove IMGPROXY_URL)
- studio→analytics: 2 changes (remove depends_on, set NEXT_PUBLIC_ENABLE_LOGS=false)
- kong→studio: remove depends_on.studio if it exists (kong should depend on auth, rest directly)
