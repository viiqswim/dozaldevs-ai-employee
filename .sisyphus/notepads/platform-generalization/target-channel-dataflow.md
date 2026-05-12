# target_channel / publish_channel Data Flow

_Research task for Task 8 (platform-generalization plan, Wave 1, Task 3)_
_Traced: 2026-05-12_

---

## Section 1: `notification_channel` Flow

### Where it's set

**DB columns:**

- `archetypes.notification_channel` — DB column (schema.prisma:196), per-archetype override
  - DozalDevs summarizer: `C0AUBMXKVNU` (`#victor-tests`)
  - VLRE summarizer: `C0960S2Q8RL`
  - VLRE guest-messaging: `C0960S2Q8RL`
- `tenant.config.notification_channel` — JSON blob on Tenant model, tenant-wide fallback
  - DozalDevs: `C0AUBMXKVNU` (seed.ts:60/74)
  - VLRE: `C0960S2Q8RL` (seed.ts:95/119)

**Resolution logic:**

- `resolveNotificationChannel()` in `src/gateway/services/notification-channel.ts` (12 lines total)
  - Prefers `archetype.notification_channel` (explicit null = suppress, undefined = fallback)
  - Falls back to `tenantConfig.notification_channel`
- `loadTenantEnv()` calls this and writes `env['NOTIFICATION_CHANNEL']`
  - Called with `archetypeNotificationChannel` param = `archetype.notification_channel` from DB
  - `tenant-env-loader.ts:51-59`

### Where it's consumed

1. **`notify-received` step** (employee-lifecycle.ts:208):

   ```typescript
   const channel = tenantEnvForNotify['NOTIFICATION_CHANNEL'] ?? '';
   ```

   Posts "Task received — processing" top-level message to this channel.

2. **Worker instructions** — the worker reads `$NOTIFICATION_CHANNEL` env var directly:
   - Summarizer: `--channel "$NOTIFICATION_CHANNEL"` in `post-message.ts` call (seed.ts:254, 266)
   - Guest-messaging: `--channel "$NOTIFICATION_CHANNEL"` in `post-guest-approval.ts` call (seed.ts:284, 324)
   - This is where the **approval card** is posted

### What it controls

- The Slack channel where: (a) "Task received" notification is posted; (b) the approval card is posted by the worker.
- `NOTIFICATION_CHANNEL` in worker env = the channel where approval cards land.
- The harness reads the approval card's actual channel from `/tmp/approval-message.json` and stores it as `deliverables.metadata.target_channel` — which happens to equal `NOTIFICATION_CHANNEL`.

---

## Section 2: `target_channel` / `SUMMARY_TARGET_CHANNEL` Flow

### Where it's set

**Primary source — `deliverables.metadata.target_channel`:**

- Set by `opencode-harness.mts` when reading `/tmp/approval-message.json`:
  ```typescript
  extraMetadata = {
    ...approvalData,
    approval_message_ts: approvalData.ts,
    target_channel: approvalData.channel, // opencode-harness.mts:257, 359
  };
  ```
- `approvalData.channel` = the actual Slack channel the worker posted the approval card to.
- For all current employees, this equals `$NOTIFICATION_CHANNEL` value at runtime.

**Secondary source — `tenant.config.summary.target_channel`:**

- Seeded as: DozalDevs → `C0AUBMXKVNU`, VLRE → `C0960S2Q8RL` (seed.ts:64/78, 99/123)
- Read by `loadTenantEnv()` → writes `env['SUMMARY_TARGET_CHANNEL']` (tenant-env-loader.ts:76-79)
- Comment: `// Keep SUMMARY_TARGET_CHANNEL as alias for backward compat (lifecycle uses it as fallback)`

**`pending_approvals` table:**

- Does NOT have a `delivery_metadata` column. Schema has: `id, tenant_id, thread_uid, task_id, slack_ts, channel_id, reminder_sent_at, urgency, guest_name, property_name` (schema.prisma:433-451).
- `channel_id` is populated from `delivMeta.target_channel` in `track-pending-approval` step (lifecycle:1349, 1361-1370).

### Where it's consumed

**`track-pending-approval` step** (lifecycle:1335-1438):

```typescript
const targetChannel = delivMeta.target_channel as string | undefined;  // lifecycle:1349
await trackPendingApproval(supabaseUrl, supabaseKey, {
  channelId: targetChannel,  // lifecycle:1366
  ...
});
```

Writes `channel_id` to `pending_approvals` row.

**`handle-approval-result` step** (lifecycle:1447-2098) — full fallback chain:

```typescript
const targetChannel =
  (metadata.target_channel as string) ?? // lifecycle:1472
  tenantEnvForApproval['NOTIFICATION_CHANNEL'] ?? // lifecycle:1473
  tenantEnvForApproval['SUMMARY_TARGET_CHANNEL'] ?? // lifecycle:1474
  '';
```

`targetChannel` used in: expiry update (1509), config-fail update (1711), approval card update (1747), delivery-fail update (1924), done update (1987), supersede update (2052).

**Supersede fallback path** (lifecycle:1188):

```typescript
oldApprovalChannel = (oldDelivMeta.target_channel as string | undefined) ?? null;
```

Read from `deliverables.metadata` of the old task being superseded.

**Rule extractor event** (lifecycle:1689):

```typescript
await inngest.send({ ..., data: { ..., targetChannel } });
```

Forwarded to rule-extractor for posting confirmation cards.

### What it controls

The channel where the lifecycle **updates** the approval card (approve/reject/expire/supersede). In 100% of current cases, this equals the channel the worker posted to = `NOTIFICATION_CHANNEL` value.

### `SUMMARY_TARGET_CHANNEL` status

- **Effectively dead code** on the current happy path. The fallback chain hits `metadata.target_channel` first (set by harness from actual Slack post), then `NOTIFICATION_CHANNEL` (set from archetype/tenant config). `SUMMARY_TARGET_CHANNEL` is only reached if both are missing — which requires the harness to have failed to write `/tmp/approval-message.json` AND `NOTIFICATION_CHANNEL` to also be empty.
- The `NOTIFICATION_CHANNEL` covers any scenario where `metadata.target_channel` is absent.

---

## Section 3: `publish_channel` / `PUBLISH_CHANNEL` Flow

### Where it's set

**`tenant.config.summary.publish_channel`:**

- DozalDevs: `C092BJ04HUG` (`#project-lighthouse`) (seed.ts:65/79)
- VLRE: `C0960S2Q8RL` (seed.ts:100/124)
- Read by `loadTenantEnv()` → writes `env['PUBLISH_CHANNEL']` (tenant-env-loader.ts:82-85)

### Where it's consumed

**Only in the delivery-phase worker instructions.** The lifecycle does NOT directly use `PUBLISH_CHANNEL`. It passes the full `tenantEnvForApproval` env to the delivery machine (lifecycle:1843-1858 for local Docker, 1866-1874 for Fly.io). The delivery worker reads `$PUBLISH_CHANNEL` itself:

From `delivery_instructions` in the seeded archetypes (seed.ts:3202, 3220, 3247, 3265):

```
NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$PUBLISH_CHANNEL" --text "<approved summary content>"
```

**`PUBLISH_CHANNEL` is ONLY for the Summarizer employee.** Guest-messaging delivery phase sends to Hostfully (not Slack), so `PUBLISH_CHANNEL` is ignored for guest-messaging.

### What it controls

The Slack channel where the final approved summary is **published** after the PM approves it. This is distinct from the approval card channel (`NOTIFICATION_CHANNEL`/`target_channel`). For DozalDevs, approval card goes to `#victor-tests`, published summary goes to `#project-lighthouse`.

---

## Section 4: Answers to the 3 Questions

### Q1: Does the lifecycle use `SUMMARY_TARGET_CHANNEL` from env, or read from `pending_approvals.delivery_metadata`?

**Answer: Neither.** The `pending_approvals` table has no `delivery_metadata` column (confirmed: schema.prisma:433-451). The lifecycle reads from `deliverables.metadata` (a different table).

The authoritative source for `target_channel` in `handle-approval-result` is `deliverables.metadata.target_channel` (lifecycle:1472). `SUMMARY_TARGET_CHANNEL` is the **third fallback** — behind `metadata.target_channel` AND `NOTIFICATION_CHANNEL` (lifecycle:1471-1475).

**In practice, `SUMMARY_TARGET_CHANNEL` is never reached** because:

1. The harness writes `target_channel` to `deliverables.metadata` from the actual Slack post (opencode-harness.mts:257/359).
2. Even without that, `NOTIFICATION_CHANNEL` is always set by `loadTenantEnv` (it comes from archetype DB column, not from env).

**Evidence:** lifecycle:1471-1475, opencode-harness.mts:254-261/356-363, tenant-env-loader.ts:51-59.

---

### Q2: Are the summarizer archetype's hardcoded channel IDs in `instructions` redundant with the env vars?

**Answer: No — the instructions do NOT hardcode channel IDs. They use env vars exclusively.**

From seed.ts:245-267 (both DOZALDEVS and VLRE summarizer instructions):

```
tsx /tools/slack/read-channels.ts --channels "$SOURCE_CHANNELS"
NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" ...
```

The instructions use `$SOURCE_CHANNELS` and `$NOTIFICATION_CHANNEL` — no hardcoded IDs. The AGENTS.md note claiming "archetype instructions hardcode channel IDs directly" is **inaccurate** as of the current seed. Channel IDs are hardcoded in `tenant.config.*`, not in archetype instructions.

The env vars are the actual mechanism. Channel config flows: `seed.ts tenant.config` → `loadTenantEnv()` → env vars → worker instructions.

**Evidence:** seed.ts:245-267 (instructions use env vars), seed.ts:60-65/93-100 (IDs are in tenant.config, not instructions).

---

### Q3: Can `config.summary.*` be moved to archetype-level config without breaking the flow?

**Answer: Partial yes — with caveats per field.**

Current field locations and migration complexity:

| Field                             | Current location                                                         | Archetype equivalent          | Notes                                                                               |
| --------------------------------- | ------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------- |
| `notification_channel`            | `tenant.config.notification_channel` + `archetypes.notification_channel` | Already on archetype model ✅ | Already migrated; `resolveNotificationChannel()` handles archetype-first resolution |
| `source_channels` / `channel_ids` | `tenant.config.source_channels` / `tenant.config.summary.channel_ids`    | Not on archetype model ❌     | `loadTenantEnv` reads tenant config only; no archetype param                        |
| `summary.target_channel`          | `tenant.config.summary.target_channel`                                   | Not on archetype model ❌     | Only used as 3rd-level fallback; effectively dead                                   |
| `summary.publish_channel`         | `tenant.config.summary.publish_channel`                                  | Not on archetype model ❌     | **Critical** — delivery worker reads `$PUBLISH_CHANNEL`                             |

**What's safe to change for Task 8:**

1. **`SUMMARY_TARGET_CHANNEL`** — safe to remove from `loadTenantEnv` output. The `NOTIFICATION_CHANNEL` fallback covers it. No code currently relies on `SUMMARY_TARGET_CHANNEL` that isn't already covered by `NOTIFICATION_CHANNEL`. Remove the backward-compat alias (tenant-env-loader.ts:75-79).

2. **`DAILY_SUMMARY_CHANNELS`** — safe to keep as alias but could be removed. The `SOURCE_CHANNELS` var is primary (tenant-env-loader.ts:70-73 writes both). Workers read `$SOURCE_CHANNELS`. Remove `DAILY_SUMMARY_CHANNELS` alias if no legacy code depends on it.

3. **`PUBLISH_CHANNEL`** — **must stay**. Delivery workers for the Summarizer read `$PUBLISH_CHANNEL` to know where to post the approved summary. There is no other mechanism. Do not remove.

4. **Moving `source_channels`/`publish_channel` to archetype:** Technically possible but requires schema changes (add fields to `archetypes` or use `archetypes.config` JSON blob) AND updating `loadTenantEnv` signature to accept archetype data for these fields. Not a simple cleanup.

---

## Section 5: Recommendation for Task 8

### What Task 8 should do

**Goal:** Clean up `tenant-env-loader.ts` summarizer-specific env vars.

**Safe to remove:** `SUMMARY_TARGET_CHANNEL` (tenant-env-loader.ts:75-79). The var is:

- A documented backward-compat alias
- Never reached in the current happy path (covered by `metadata.target_channel` + `NOTIFICATION_CHANNEL`)
- Named "summary" — violates the shared-file employee-agnostic convention in AGENTS.md

**Safe to rename:** `DAILY_SUMMARY_CHANNELS` → can be removed after confirming no worker tool reads it directly. Check that `SOURCE_CHANNELS` is the only name needed. Currently both are written in tandem (tenant-env-loader.ts:71-72).

**Must keep:** `PUBLISH_CHANNEL`. The Summarizer delivery instructions (seed.ts:3202, 3220, 3247, 3265) read `$PUBLISH_CHANNEL` from the machine env. Removing it breaks delivery.

**Must keep:** `SOURCE_CHANNELS`. Summarizer worker instructions (seed.ts:247, 259) read `$SOURCE_CHANNELS`.

### Architecture note for future Task 8+ work

The `config.summary` structure in tenant config is the real blocker for full generalization. To make `publish_channel` archetype-level:

1. Add `publish_channel` to `archetypes.config` JSON or as a DB column
2. Pass archetype data into `loadTenantEnv()` (currently only `archetypeNotificationChannel` string is passed, not a full archetype object)
3. Read archetype publish_channel first, fall back to `tenant.config.summary.publish_channel`

For Task 8, the minimal-risk action is:

1. Remove `SUMMARY_TARGET_CHANNEL` from `loadTenantEnv` output
2. Remove `DAILY_SUMMARY_CHANNELS` alias (keep `SOURCE_CHANNELS` only)
3. Leave `PUBLISH_CHANNEL` alone
4. Leave `config.summary.*` in place — it's the source of truth for `PUBLISH_CHANNEL` and `SOURCE_CHANNELS` until archetype-level fields exist

### Risk summary

| Action                                | Risk                       | Reason                                                      |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| Remove `SUMMARY_TARGET_CHANNEL`       | Low                        | 3rd fallback never reached in practice                      |
| Remove `DAILY_SUMMARY_CHANNELS` alias | Low                        | Workers use `$SOURCE_CHANNELS`; verify no legacy references |
| Remove `PUBLISH_CHANNEL`              | **HIGH — BREAKS DELIVERY** | Delivery workers depend on it                               |
| Remove `config.summary` reads         | **HIGH**                   | `PUBLISH_CHANNEL` and `SOURCE_CHANNELS` both come from here |
