# Learnings — slack-minimal-feed

## 2026-05-11 Session Start

### Codebase Conventions

- TypeScript strict mode, pnpm, Vitest for tests
- `src/inngest/employee-lifecycle.ts` is the main lifecycle file (~2500 lines)
- `src/lib/slack-blocks.ts` is a shared file — Summarizer and guest-messaging both use it. NEVER modify existing functions.
- Slack API accessed via `SlackClient` wrapper (`src/lib/slack-client.ts`) and sometimes direct `WebClient` from `@slack/web-api`
- PostgREST used for DB reads/writes in lifecycle (not Prisma)

### Key Data Flows

- `notifyMsgRef.ts` = top-level channel message ts (updated throughout lifecycle)
- `approvalMsgTs` = approval card in thread (KEEP VERBOSE — must NOT use compact blocks here)
- `deliverables.metadata` = JSON blob — can store new keys like `nudge_ts`, `nudge_channel` without migration
- `metadata['property_name']` = model-provided property name at terminal states
- `enrichment.propertyName` = API-fetched property name at initial states
- `rawEvent['thread_uid']` = Hostfully thread UID (always present in webhooks)
- `rawEvent['lead_uid']` = Hostfully lead UID (needed for Hostfully link)
- `rawEvent['superseded_notify_ts']` = ONLY present when task supersedes another

### Bug Root Cause

- `REPLY_BROADCAST: 'true'` injected whenever `rawEvent['thread_uid']` is truthy (always)
- Should only inject when `rawEvent['superseded_notify_ts']` is truthy (superseded tasks only)
- Fix location: `employee-lifecycle.ts` lines 645 (local Docker) and 669 (Fly.io)

### Guardrails

- MUST gate all guest-messaging changes behind role_name === 'guest-messaging' check
- MUST NOT modify existing slack-blocks.ts functions
- MUST NOT let nudge deletion failure crash the lifecycle
- MUST NOT delete approvalMsgTs or notifyMsgRef — only delete nudge_ts
- MUST NOT add Prisma migrations — use deliverables.metadata JSON blob

## 2026-05-11 Task 3 Complete

### Call-site Pattern Used
- Role gate: `(archetype.role_name as string) === 'guest-messaging'`
- notifyMsgRef updates: buildCompactNotifyBlocks (guest-messaging only)
- approvalMsgTs updates: unchanged (buildEnrichedTerminalBlocks)
- rawEvent cast: `taskData.raw_event as Record<string, unknown>`
- guestName at initial states: `enrichment?.guestName ?? undefined`
- guestName at terminal states: `metadata['guest_name'] as string | undefined`
- propertyName at terminal states: `metadata['property_name'] as string | undefined`

### Test Updates Required
- lifecycle-enriched-notify.test.ts Test 1: removed May 15/May 18 assertions (compact blocks don't include dates)
- lifecycle-enriched-notify.test.ts Test 3: removed 'Guest' fallback assertion (compact blocks use undefined not 'Guest')

### 9 Call-sites Updated
1. notify-received: already inside guest-messaging if block, replaced buildEnrichedNotifyBlocks
2. update-notify-reviewing: added role-gate, added reviewingPropertyName fetch
3. expiry notify: added role-gate with rawEventForExpiry
4. approve notify: added role-gate with status 'done'
5. delivery failure notify: added role-gate with status 'delivery_failed'
6. done notify: added role-gate with status 'done'
7. superseded notify: added role-gate with status 'superseded'
8. reject notify: added role-gate with status 'rejected'
9. mark-failed: added role-gate with rawEventForFail

## 2026-05-11 Task 4 Complete

### Nudge Posting Pattern
- Location: track-pending-approval step, after trackPendingApproval() call
- Uses raw WebClient (not SlackClient wrapper) for reply_broadcast support
- Stores nudge_ts + nudge_channel in deliverables.metadata via PostgREST PATCH
- Gated behind role_name === 'guest-messaging'
- Wrapped in try-catch (non-fatal)
- botToken variable name: botTokenForNudge (fetched via loadTenantEnv + PrismaClient pattern)
- supabaseUrl/supabaseKey variable names: supabaseUrl / supabaseKey (closure from outer lifecycle function, lines 123-124)
- delivMeta already available in the step (fetched at start of track-pending-approval)
- notifyMsgRef available from closure (return value of notify-received step)

## 2026-05-11 Task 5 Complete

### Nudge Deletion Pattern
- Location 1: handle-approval-result step, after `metadata` fetch + targetChannel construction, before approve/reject/expiry branching (line ~1520)
- Location 2: check-supersede step, after the approval card update block, before `inngest.send` (line ~1272)
- Uses raw WebClient (`@slack/web-api`) for `chat.delete` — SlackClient wrapper doesn't have it
- Wrapped in try-catch (non-fatal) in BOTH locations
- bot token variable name in handle-approval-result: `botToken` (line 1469, from `tenantEnvForApproval.SLACK_BOT_TOKEN`)
- superseded delivMeta variable name in check-supersede: `oldNudgeMeta` (fresh fetch of old task's deliverable after `if (!oldTaskId) return;`)
- nudge_ts extraction: `metadata.nudge_ts as string | undefined`
- nudge_channel extraction: `metadata.nudge_channel as string | undefined`
- check-supersede uses a UNIFIED fresh fetch of the old task's deliverable (works for both happy path and fallback path)
- check-supersede bot token: own PrismaClient/loadTenantEnv (`nudgeDelBotToken`) — separate from the approval card block
