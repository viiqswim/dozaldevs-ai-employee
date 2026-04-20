# Learnings — fix-dozaldevs-summarizer-flow

## [2026-04-20] Session Init

### Key Conventions

- DozalDevs tenant ID: `00000000-0000-0000-0000-000000000002`
- DozalDevs archetype ID: `00000000-0000-0000-0000-000000000012`
- Platform archetype ID (DO NOT TOUCH): `00000000-0000-0000-0000-000000000011`
- VLRE archetype ID (DO NOT TOUCH): `00000000-0000-0000-0000-000000000013`
- Channels: C092BJ04HUG = project-lighthouse (READ + FINAL POST), C0AUBMXKVNU = victor-tests (APPROVAL)
- Pre-existing test failures to ignore: container-boot.test.ts, inngest-serve.test.ts, tests/inngest/integration.test.ts
- DELIVERY_MACHINE_ENABLED is NOT set → lifecycle delivers via direct Slack post (line 400-418 of employee-lifecycle.ts)

### File Locations

- handlers.ts: src/gateway/slack/handlers.ts
- opencode-harness.mts: src/workers/opencode-harness.mts
- seed.ts: prisma/seed.ts
- tenant-env-loader.ts: src/gateway/services/tenant-env-loader.ts (confirmed maps publish_channel)

### PostgREST Base URL

- Local: http://localhost:54321 (use $SUPABASE_SECRET_KEY for auth headers)

## [2026-04-20] Final State — T9/F3 Blocked

### Blocker
- Gateway not running (port 3000 returns 000)
- DozalDevs tenant_secrets table empty (no slack_bot_token for tenant 00000000-0000-0000-0000-000000000002)

### Required user actions to unblock T9 + F3
1. `pnpm dev:start` — starts gateway on :3000
2. Visit http://localhost:3000/slack/install?tenant=00000000-0000-0000-0000-000000000002 — complete OAuth for DozalDevs workspace (T0601SMSVEU)

### Plan state: 11/13 complete
- T1-T8: all done and committed (3 commits: 60df867, c306704, e3acd97)
- F1 APPROVE, F2 APPROVE, F4 APPROVE
- T9 BLOCKED (needs gateway + OAuth)
- F3 BLOCKED (needs T9 to complete first)
