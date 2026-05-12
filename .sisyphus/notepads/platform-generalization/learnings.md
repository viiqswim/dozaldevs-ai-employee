# Learnings — platform-generalization

## 2026-05-12 Initial State

- 11 `role_name === 'guest-messaging'` branches in `src/inngest/employee-lifecycle.ts`
- No enrichment-adapters directory exists yet
- No types directory in src/lib yet
- All Wave 1 tasks are unstarted

## Task 3 — target_channel / publish_channel Data Flow Research (2026-05-12)

### Key findings

**notification_channel:**

- `archetypes.notification_channel` is the archetype-level column (schema.prisma:196); `tenant.config.notification_channel` is the tenant-wide fallback
- `resolveNotificationChannel()` (notification-channel.ts) prefers archetype-level; `loadTenantEnv` emits `NOTIFICATION_CHANNEL`
- Both "Task received" message (lifecycle:208) AND worker approval card posting (`$NOTIFICATION_CHANNEL` in instructions) use this same channel

**target_channel / SUMMARY_TARGET_CHANNEL:**

- Primary source is `deliverables.metadata.target_channel` — written by the harness from `/tmp/approval-message.json` (opencode-harness.mts:257/359)
- `handle-approval-result` fallback chain: `metadata.target_channel` → `NOTIFICATION_CHANNEL` → `SUMMARY_TARGET_CHANNEL` (lifecycle:1471-1475)
- `SUMMARY_TARGET_CHANNEL` is effectively dead — never reached in the happy path
- `pending_approvals` has NO `delivery_metadata` column — the task description had inaccurate inherited context; `pending_approvals.channel_id` is set from `delivMeta.target_channel`

**publish_channel / PUBLISH_CHANNEL:**

- Only consumed in delivery-phase worker instructions via `$PUBLISH_CHANNEL` env var
- Lifecycle does NOT use it directly — just passes `tenantEnvForApproval` to delivery machine
- Source is `tenant.config.summary.publish_channel` read by `loadTenantEnv` (tenant-env-loader.ts:82-85)
- Summarizer-only concept — guest-messaging delivery goes to Hostfully

**Archetype instructions do NOT hardcode channel IDs:**

- AGENTS.md note claiming "instructions hardcode channel IDs" is inaccurate
- Instructions use `$SOURCE_CHANNELS`, `$NOTIFICATION_CHANNEL` env vars (seed.ts:247-267)
- IDs are hardcoded in `tenant.config.*`, not in archetype instructions

### Task 8 guidance

- Safe to remove: `SUMMARY_TARGET_CHANNEL` from `loadTenantEnv` output (backward-compat alias, never reached)
- Safe to remove: `DAILY_SUMMARY_CHANNELS` alias (verify no consumers; `SOURCE_CHANNELS` is primary)
- Must keep: `PUBLISH_CHANNEL` — delivery workers depend on it (breaks summarizer delivery if removed)
- Must keep: `SOURCE_CHANNELS` — summarizer read phase depends on it
- Full details in `.sisyphus/notepads/platform-generalization/target-channel-dataflow.md`

## Task 1 — NotificationEnrichment type + adapter registry (2026-05-12)

- Created `src/lib/types/` directory (new) with `notification-enrichment.ts`
- Created `src/lib/enrichment-adapters/` directory (new) with `index.ts` and `hostfully.ts`
- `fetchLeadEnrichment(leadUid, apiKey)` returns `LeadEnrichment` with: `guestName`, `propertyName`, `checkIn`, `checkOut`, `bookingChannel`
- Hostfully adapter builds `contextUrl` from `thread_uid` + `lead_uid` in rawEvent
- Registry uses side-effect import pattern — `hostfully.ts` self-registers on import
- ESM `.js` extensions required in all imports (even for `.ts` source files)
- `pnpm build` → exit 0 with no new errors
- `.sisyphus/evidence/` is gitignored — evidence saved locally but not committed

## Task 5 — buildNotifyBlocks (2026-05-12)
- `buildHostfullyLink()` moved from `slack-blocks.ts` to `enrichment-adapters/hostfully.ts` (exported)
- `slack-blocks.ts` now imports `buildHostfullyLink` from `./enrichment-adapters/hostfully.js`
- `buildNotifyBlocks()` added to `slack-blocks.ts` — returns `KnownBlock[]`
- Uses `as KnownBlock` type assertions (not `as any`) to satisfy strict typing
- Existing `buildNotifyStateBlocks()` and `buildCompactNotifyBlocks()` preserved intact
- Test file updated: imports `buildHostfullyLink` from `enrichment-adapters/hostfully.js` (not slack-blocks.ts)
- Build passes clean (exit 0) with `pnpm build`

## Task 6 — Notification Fork Refactor (2026-05-12)

### What was done
- Removed `buildCompactNotifyBlocks` from all 10 fork sites in `employee-lifecycle.ts`
- Replaced with `buildNotifyBlocks({ state, archetypeName, taskId, enrichment, emoji, extraText })`
- Removed module-level `import { fetchLeadEnrichment }` (hostfully-enrichment.js)
- Added imports: `getAdapter` (enrichment-adapters/index.js), `NotificationEnrichment` type, `buildNotifyBlocks`
- Collapsed `notify-received` step from 2 branches (guest-messaging + generic) into 1 unified path
- `archetype.enrichment_adapter` truthy check replaces `role_name === 'guest-messaging'` for enrichment/nudge logic
- Pre-check guard at line ~152 (`if (archetype.role_name === 'guest-messaging')`) left untouched per spec

### Test fix
- `lifecycle-enriched-notify.test.ts` Test 2 assertion updated: `toContain('Task received')` → `toContain('daily-summarizer')`
  - Reason: `buildNotifyBlocks` renders `⏳ *daily-summarizer — Received*`, not `Task received`
- Added `enrichment_adapter: 'hostfully'` to `makeGuestMessagingTaskData()` in the test file

### Grep audit results
- `buildCompactNotifyBlocks` in lifecycle: 0 ✅
- `role_name.*guest-messaging` in lifecycle: 1 (pre-check guard only) ✅
- `enrichment_adapter` in lifecycle: 3 ✅
- `^import.*hostfully` in lifecycle: 1 (precheck import — intentional) ✅

### Build & test
- `pnpm build` → exit 0 ✅
- `lifecycle-enriched-notify.test.ts` → 6/6 pass ✅
- No new test failures introduced
