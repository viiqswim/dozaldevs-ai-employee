# Learnings — plat-07-08-notification-channel

## [2026-04-27] Session Init

### Key Design Decision

- `notification_channel` = approval/notification channel ONLY (not publish)
- DozalDevs: notification_channel = C0AUBMXKVNU (#victor-tests), publish stays in delivery_instructions
- VLRE: notification_channel = C0960S2Q8RL

### Architecture

- loadTenantEnv() currently maps: channel_ids→DAILY_SUMMARY_CHANNELS, target_channel→SUMMARY_TARGET_CHANNEL, publish_channel→SUMMARY_PUBLISH_CHANNEL
- SUMMARY_PUBLISH_CHANNEL injected but never read by any TypeScript code
- Lifecycle fallback: `metadata.target_channel ?? tenantEnvForApproval['SUMMARY_TARGET_CHANNEL'] ?? ''`
- Harness reads /tmp/approval-message.json → metadata.target_channel (runtime output, do NOT change)

### File Locations

- loadTenantEnv: src/gateway/services/tenant-env-loader.ts (65 lines total)
- lifecycle channel resolution: src/inngest/employee-lifecycle.ts lines 334-337
- Zod schema: src/gateway/validation/schemas.ts ~line 254
- Seed: prisma/seed.ts — hardcoded channels in lines 381-403 (instructions), 1100-1180 (delivery_instructions)
- Tests: makeDeps() pattern in tenant-env-loader.test.ts, makeApp() in admin-tenant-config.test.ts

### Guardrails

- MUST NOT modify opencode-harness.mts
- MUST NOT remove metadata.target_channel from deliverables
- MUST NOT touch archetype 0015 (guest-messaging) delivery_instructions
- Keep SUMMARY_TARGET_CHANNEL as backward compat alias in lifecycle fallback
- TenantConfigBodySchema: notification_channel optional (deep-merge PATCH)

## [2026-04-27] T8 — Test Writing

### Test File Changes
- schemas.test.ts: Added `describe('TenantConfigBodySchema')` with 5 tests (notification_channel string/non-string, optional, source_channels array/non-array)
- admin-tenant-config.test.ts: Added 4 tests — PATCH notification_channel, PATCH source_channels, deep merge preserves summary fields, GET returns notification_channel
- employee-lifecycle-delivery.test.ts: Added `buildFetchMockNoTargetChannel()` helper + 2 tests for NOTIFICATION_CHANNEL fallback

### Patterns Confirmed
- TenantConfigBodySchema uses `safeParse` (not `.parse()`) in tests
- admin-tenant-config route tests use `makeTenant(config)` with mocked `findFirst` and `update`
- Lifecycle delivery tests override `mockLoadTenantEnv` inside test body to change per-test env; `beforeEach` sets default, tests override as needed
- `buildFetchMockNoTargetChannel` omits `target_channel` from deliverable metadata, causing fallback to NOTIFICATION_CHANNEL
- Reject action is the cleanest path to verify channel resolution (no machine spawning complexity)

### Results
- 3 test files, 55 tests total, all passing

## PUBLISH_CHANNEL delivery fix (2026-04-27)

- `ast-grep replace` with `$PUBLISH_CHANNEL` in the pattern/rewrite string silently strips the `$` since `$VAR` is treated as a meta-variable. Use `Edit` tool for literal replacements containing `$`.
- `loadTenantEnv` injects `PUBLISH_CHANNEL` from `tenant.config.summary.publish_channel` — separate from `NOTIFICATION_CHANNEL` which comes from `tenant.config.notification_channel` (or archetype param).
- All 4 `delivery_instructions` (DozalDevs create/update, VLRE create/update) now reference `$PUBLISH_CHANNEL` instead of `$NOTIFICATION_CHANNEL`. This routes final summaries to the correct publish channel (DozalDevs: `C092BJ04HUG` ≠ approval channel `C0AUBMXKVNU`).
- `SUMMARY_PUBLISH_CHANNEL` key remains absent from env — only `PUBLISH_CHANNEL` is used. Existing test `SUMMARY_PUBLISH_CHANNEL is NOT present` still passes.
- Run tenant-env-loader tests with `pnpm exec vitest run tests/gateway/services/tenant-env-loader.test.ts` to avoid 2-min wait from slow orchestrate/lifecycle tests in global suite.
