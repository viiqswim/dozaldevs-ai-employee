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

## Task 9 — Harness Delivery Pre-Parse Extraction (2026-05-12)

### What was done
- Created `src/workers/lib/delivery-adapters/index.mts` — DeliveryContext interface, DeliveryAdapter type, registry (registerDeliveryAdapter, getDeliveryAdapter)
- Created `src/workers/lib/delivery-adapters/guest-messaging.mts` — Hostfully adapter registered as `'hostfully'` via side-effect import
- Removed the 60-line `role_name === 'guest-messaging'` block from `opencode-harness.mts`
- Added `enrichment_adapter?: string | null` to `ArchetypeRow` interface
- Harness now dispatches via `archetype.enrichment_adapter` using the registry

### Key design decision: richer context vs string->string
- Task spec suggested `(deliverable: string) => string` adapter type
- Actual logic needs: deliverableMetadata (for threadUid fallback), taskId (for safety check), deliveryInstructions (to build full prompt)
- Used `DeliveryContext` interface to pass all needed context
- Adapter returns `string | null`: full deliveryPrompt on success, null for raw fallback

### Grep audit
- `role_name.*guest-messaging` in harness: 0 ✅
- `enrichment_adapter` in harness: 2 ✅

### Build & verification
- `pnpm build` → EXIT_CODE:0 ✅
- Evidence: `.sisyphus/evidence/task-9-harness-cleanup.txt`

## Task 10 — External Cron Service Evaluation (2026-05-12)

### Decision: cron-job.org

- Completely free, unlimited jobs
- Per-job IANA timezone support (critical for future "2am Mountain Time" use cases)
- Full HTTP POST support: custom headers (X-Admin-Key) + JSON body
- 1-minute minimum interval
- Simple UI + REST API (`api.cron-job.org`)

### Why NOT GitHub Actions

- UTC only — no native timezone support (breaks DST-aware scheduling)
- Known 15–60 min schedule delays during GitHub high load (documented, unfixed since 2021)
- 5-minute minimum interval

### guest-message-poll stays in Inngest

The poll function decrypts secrets, calls Hostfully API, scans N leads, creates N tasks — cannot be expressed as a single admin API trigger call. It is infrastructure polling, not a "scheduled employee". Keep as `trigger/guest-message-poll` Inngest internal cron forever.

### What moves to external cron

Only `trigger/daily-summarizer` → one cron-job.org job per tenant that has a `daily-summarizer` archetype.
Currently: only DozalDevs (tenant `00000000-0000-0000-0000-000000000002`).
Full configs in `.sisyphus/notepads/external-cron-evaluation.md`.

## Task 11 — External Cron Configs Documentation (2026-05-12)

- Created `.sisyphus/notepads/external-cron-configs.md` with complete cron-job.org configuration
- One job per tenant per employee schedule (not one job that discovers all tenants — that was the old Inngest pattern)
- `requestMethod: 1` = POST in cron-job.org REST API enum
- `wdays: [-1]` = every day; `mdays: [-1]` = every day of month; `months: [-1]` = every month
- `saveResponses: true` recommended — lets you inspect execution history and response bodies in cron-job.org UI
- Dry-run endpoint (`?dry_run=true`) is the right way to verify config before enabling the live job
- `guest-message-poll` stays in Inngest forever — it's infrastructure polling (decrypt secrets, scan N leads, create N tasks), not a "trigger this employee" pattern

## Task 13 — summarizer-trigger cleanup (2026-05-12)

- `summarizer-trigger.ts` was already commented out in `serve.ts` before deletion — safe to delete without breaking anything
- `git status` shows `D` (uppercase) for staged deletions — `git rm --cached` is not needed when file is already deleted from disk and `git add` was run on the directory
- `guest-message-poll.ts` uses `createDecipheriv` (Node crypto) to decrypt per-tenant secrets — this is the definitive marker that it cannot be an external cron; it requires internal DB access
- Evidence directory `.sisyphus/evidence/` is gitignored — save evidence there but don't try to commit it

## Task 14 — Tests for enrichment adapter registry + buildNotifyBlocks (2026-05-12)

- Created `tests/lib/enrichment-adapters.test.ts` (13 tests): registry CRUD + Hostfully adapter logic
- `vi.mock` hoisting pattern: mock `hostfully-enrichment.js` before any adapter imports; `hostfully.ts` self-registers via side-effect import — all 3 null-guard cases (missing lead_uid, empty lead_uid, missing apiKey) confirmed
- Updated `tests/lib/slack-blocks.test.ts`: added `buildNotifyBlocks` to imports + 12 new tests; total now 66 passing
- `buildNotifyBlocks` always appends a `context` block with task ID as last block — confirmed by `blocks[blocks.length - 1]` assertion pattern
- Section separator comments (`// ─── `) are unnecessary — `describe` blocks provide grouping; removed per hook
- Both files committed: `test(platform): add tests for enrichment adapter registry and generic block builder`

## Task 16 — AGENTS.md + .env.example Documentation Update (2026-05-12)

### Changes made to AGENTS.md

1. **Inngest functions section**: `trigger/daily-summarizer` moved from active to deregistered list. Updated description: "DELETED; replaced by external cron on cron-job.org." Added note that `trigger/guest-message-poll` stays as Inngest internal cron (decrypts secrets, scans all leads — cannot be external).

2. **Adding a new employee section**: Updated step 1 to include new optional archetype fields (`enrichment_adapter`, `vm_size`). Replaced step 3 ("Add a trigger in `src/inngest/triggers/`") with two separate steps: one for scheduled triggers (external cron on cron-job.org, no new Inngest function file) and one for webhook triggers (route handler in `src/gateway/routes/`).

3. **Env var section**: Updated `SUMMARIZER_VM_SIZE` → `WORKER_VM_SIZE` as primary var with note that `SUMMARIZER_VM_SIZE` is a deprecated alias.

4. **Per-Tenant Slack Token Architecture**: Removed `DAILY_SUMMARY_CHANNELS` and `SUMMARY_TARGET_CHANNEL` (removed from `tenant-env-loader.ts`). Updated to show `SOURCE_CHANNELS`, `PUBLISH_CHANNEL`, and `NOTIFICATION_CHANNEL` as the actual injected vars.

5. **Summarizer failure diagnostic**: Updated OOM fix from `Increase SUMMARIZER_VM_SIZE` to `Increase WORKER_VM_SIZE (or set vm_size on the archetype)`.

6. **Cron timezone note**: Replaced stale Inngest cron note ("fires at 8am UTC, Inngest has no timezone config") with accurate external cron note (cron-job.org supports per-job IANA timezone).

### .env.example verification

Already correct from previous tasks:
- `WORKER_VM_SIZE` present as primary (line 93)
- `FLY_SUMMARIZER_APP` and `SUMMARIZER_VM_SIZE` marked DEPRECATED (lines 140-144)
- `VLRE_SLACK_BOT_TOKEN` present (line 109)
- `HOSTFULLY_MOCK` documented as tenant secret, not global env var (lines 152-153)
- No changes needed to `.env.example`
