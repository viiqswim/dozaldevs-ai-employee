# Decisions — seed-unify-slim-compose

## Architecture Decisions

- Keep studio + meta in all repos (lightweight, useful for debugging)
- Remove analytics, vector, supavisor, imgproxy, functions, realtime from ALL repos
- Remove storage from ai-employee and fetched-pets (not used); keep in nexus-stack and vlre-hub
- DO NOT touch `volumes/db/logs.sql` — analytics DB init scripts are harmless to leave
- DO NOT remove `LOGFLARE_*` vars from `docker/.env.example` — just leave them
- DO NOT combine compose changes with script changes in same commit
- fetched-pets stays on npm — DO NOT migrate to pnpm
- The existing `db:setup:supabase` scripts stay for backward compat — supabase:start now does the same thing

## Commit Strategy

Per repo, two separate commits:

- Commit A: `chore(infra): remove unused services from docker compose`
- Commit B: `chore(setup): unify supabase:start to include seed and key sync`
- Commit C (fetched-pets only): `feat(infra): create auth seed for local development`
