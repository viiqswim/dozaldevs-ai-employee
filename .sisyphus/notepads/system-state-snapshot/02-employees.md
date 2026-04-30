# Employees & Archetypes — Verification Notepad

## Source Files Verified

- `prisma/schema.prisma:199-231` — Archetype model definition
- `prisma/schema.prisma:183-197` — Department model definition
- `prisma/seed.ts:173-199` — Department records
- `prisma/seed.ts:3115-3270` — Archetype records (all 3 upserts)
- `docs/2026-04-24-1452-current-system-state.md:94-120` — Old "Employees" section for comparison
- `prisma/migrations/20260423060515_add_agents_md_to_archetypes/migration.sql` — agents_md migration date

## Current State

### Employees Table

| Employee                          | Department  | Trigger                      | Delivery            | Tenant    | Status               |
| --------------------------------- | ----------- | ---------------------------- | ------------------- | --------- | -------------------- |
| **Papi Chulo** (Daily Summarizer) | Operations  | Cron `0 8 * * 1-5` (8am UTC) | Slack message       | Both      | Active               |
| **Guest Messaging**               | Operations  | Cron `*/5 * * * *` + Webhook | Hostfully message   | VLRE only | Active               |
| **Engineering Coder**             | Engineering | Jira webhook                 | GitHub pull request | —         | Deprecated — on hold |

**Change from old doc**: Guest Messaging trigger changed from "Manual / Webhook" to `cron_and_webhook` with a `*/5 * * * *` cron.

---

### Daily Summarizer (Papi Chulo)

Runs Mon–Fri at 8am UTC. Reads configured Slack channels, generates a dramatic Spanish news-style digest via OpenCode, posts an approval card to a Slack notification channel, and on approval publishes the final summary via delivery phase.

Both DozalDevs and VLRE tenants have their own archetype records. Delivery is now handled by a dedicated delivery phase using `delivery_instructions` (PLAT-05 complete) rather than inline lifecycle code.

#### DozalDevs Archetype (`00000000-0000-0000-0000-000000000012`)

- **tenant_id**: `00000000-0000-0000-0000-000000000002`
- **department_id**: `00000000-0000-0000-0000-000000000020` (Operations/DozalDevs)
- **model**: `minimax/minimax-m2.7`
- **runtime**: `opencode`
- **deliverable_type**: `slack_message`
- **trigger_sources**: `{ type: 'cron', expression: '0 8 * * 1-5', timezone: 'America/Chicago' }`
- **risk_model**: `{ approval_required: true, timeout_hours: 24 }`
- **concurrency_limit**: `1`
- **notification_channel**: `null` (resolved via `NOTIFICATION_CHANNEL` env var at runtime)
- **agents_md**: PLATFORM_AGENTS_MD (loaded from `src/workers/config/agents.md`)
- **delivery_instructions**: _"Read the approved summary from the deliverable content. Post it to the publish channel as a clean published message without buttons: `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$PUBLISH_CHANNEL" --text "<approved summary content>"`. Do not include approve/reject buttons."_
- **tool_registry**: `/tools/slack/read-channels.js`, `/tools/slack/post-message.js`
- **Channels** (from tenant config + instructions):
  - Read from: `C092BJ04HUG` (#project-lighthouse)
  - Notify (approval card): `C0AUBMXKVNU` (#victor-tests)
  - Publish (final): `C092BJ04HUG` (#project-lighthouse)

#### VLRE Archetype (`00000000-0000-0000-0000-000000000013`)

- **tenant_id**: `00000000-0000-0000-0000-000000000003`
- **department_id**: `00000000-0000-0000-0000-000000000021` (Operations/VLRE)
- All other fields identical to DozalDevs archetype (same model, runtime, risk_model, concurrency_limit, delivery_instructions)
- **Channels** (from tenant config + instructions):
  - Read from: `C0AMGJQN05S`, `C0ANH9J91NC`, `C0960S2Q8RL`
  - Notify (approval card): `C0960S2Q8RL`
  - Publish (final): `C0960S2Q8RL`

---

### Guest Messaging

VLRE only. Receives guest messages from Hostfully's unified inbox, classifies them (`NEEDS_APPROVAL` vs `NO_ACTION_NEEDED`), drafts a response using property-specific knowledge base content, and posts an approval card to Slack. On approval, sends the response back to the guest via Hostfully using a dedicated delivery phase.

#### VLRE Guest Messaging Archetype (`00000000-0000-0000-0000-000000000015`)

- **tenant_id**: `00000000-0000-0000-0000-000000000003` (VLRE)
- **department_id**: `00000000-0000-0000-0000-000000000021` (Operations/VLRE)
- **model**: `minimax/minimax-m2.7`
- **runtime**: `opencode`
- **deliverable_type**: `slack_message`
- **trigger_sources**: `{ type: 'cron_and_webhook', cron_expression: '*/5 * * * *' }`
- **risk_model**: `{ approval_required: true, timeout_hours: 24 }`
- **concurrency_limit**: `5` (webhook-triggered: multiple concurrent guests)
- **notification_channel**: `null` (resolved via `NOTIFICATION_CHANNEL` env var at runtime)
- **agents_md**: PLATFORM_AGENTS_MD
- **delivery_instructions**: _"Read the approved response from the deliverable content. The deliverable content is a JSON object with a draftResponse field. Send the approved response to the guest via Hostfully: `tsx /tools/hostfully/send-message.ts --lead-id "<leadUid>" --thread-id "<threadUid, if present>" --message "<draftResponse>"`. Confirm delivery was successful."_
- **tool_registry** (8 tools):
  - `/tools/hostfully/get-property.ts`
  - `/tools/hostfully/get-reservations.ts`
  - `/tools/hostfully/get-messages.ts`
  - `/tools/hostfully/send-message.ts`
  - `/tools/slack/post-message.ts`
  - `/tools/slack/read-channels.ts`
  - `/tools/platform/report-issue.ts`
  - `/tools/knowledge_base/search.ts`

**Classification output format** (seed.ts STEP 5 — 17 fields):

- Original 8: `classification`, `confidence`, `reasoning`, `draftResponse`, `summary`, `category`, `conversationSummary`, `urgency`
- New guest context fields (9): `guestName`, `propertyName`, `checkIn`, `checkOut`, `bookingChannel`, `originalMessage`, `leadUid`, `threadUid`, `messageUid`

**Classification values**: `NEEDS_APPROVAL`, `NO_ACTION_NEEDED`

**Delivery mechanism**: Dedicated Fly.io machine with `EMPLOYEE_PHASE=delivery`. Harness reads `archetype.delivery_instructions` to call `send-message.ts` to send approved response to guest via Hostfully.

---

### Engineering Coder

Status: **Deprecated — on hold**. Receives Jira tickets via webhook, spawns a Docker/Fly.io worker running OpenCode, delivers a GitHub pull request. No archetype record seeded. See `AGENTS.md` Deprecated Components table.

---

### Archetype Schema Fields (as of April 29, 2026)

From `prisma/schema.prisma:199-231`:

| Column                  | Type         | Default | Notes                                               |
| ----------------------- | ------------ | ------- | --------------------------------------------------- |
| `id`                    | String UUID  | —       | Primary key                                         |
| `department_id`         | String? UUID | —       | FK to departments                                   |
| `role_name`             | String?      | —       | e.g. `daily-summarizer`, `guest-messaging`          |
| `runtime`               | String?      | —       | `opencode`                                          |
| `trigger_sources`       | Json?        | —       | Cron/webhook config                                 |
| `tool_registry`         | Json?        | —       | Tools available to worker                           |
| `risk_model`            | Json?        | —       | `approval_required`, `timeout_hours`                |
| `concurrency_limit`     | Int          | `3`     | Max parallel machines                               |
| `agent_version_id`      | String? UUID | —       | FK to agent_versions                                |
| `tenant_id`             | String UUID  | —       | FK to tenants (immutable)                           |
| `system_prompt`         | String? Text | —       | LLM system prompt                                   |
| `instructions`          | String? Text | —       | Natural language work instructions                  |
| `agents_md`             | String? Text | —       | **Added 20260423** — AGENTS.md injected into worker |
| `delivery_instructions` | String? Text | —       | **NEW (20260426)** — delivery phase instructions    |
| `notification_channel`  | String? Text | —       | **NEW (20260427)** — channel for approval cards     |
| `model`                 | String?      | —       | LLM model ID                                        |
| `deliverable_type`      | String?      | —       | e.g. `slack_message`                                |

**New fields since April 24 doc**:

- `delivery_instructions` — added in migration `20260426170200_add_delivery_instructions_to_archetypes`. Enables PLAT-05: delivery always runs in a separate Fly.io machine phase reading this field.
- `notification_channel` — added in migration `20260427064845_add_notification_channel`. Per-archetype notification channel override (currently all null; resolved via env var instead).

**Pre-existing field not in old doc**:

- `agents_md` — added in migration `20260423060515_add_agents_md_to_archetypes` (April 23, day before April 24 snapshot). Was present but not prominently documented. All 3 active archetypes set this to `PLATFORM_AGENTS_MD` from `src/workers/config/agents.md`.

---

### Departments

From `prisma/seed.ts:173-199`:

| ID                                     | Name       | Tenant                                             |
| -------------------------------------- | ---------- | -------------------------------------------------- |
| `00000000-0000-0000-0000-000000000020` | Operations | DozalDevs (`00000000-0000-0000-0000-000000000002`) |
| `00000000-0000-0000-0000-000000000021` | Operations | VLRE (`00000000-0000-0000-0000-000000000003`)      |

Note: Both departments are named "Operations" but are tenant-scoped. Engineering department is not seeded (Engineering Coder is deprecated).

---

## Changes from April 24 Doc

1. **Guest Messaging trigger**: Changed from `Manual / Webhook` → `cron_and_webhook` with `*/5 * * * *` cron poll (seed.ts:3227)
2. **New field `delivery_instructions`**: Added to all 3 active archetypes. PLAT-05 complete — delivery phase runs separately using this field instead of inline lifecycle code.
3. **New field `notification_channel`**: Added to schema; currently `null` for all archetypes (resolved via `NOTIFICATION_CHANNEL` env var)
4. **New field `agents_md`**: Was added April 23 (one day before old doc) — not in old doc. All 3 archetypes now explicitly set this.
5. **Guest Messaging classification output**: 17 fields now (was 6 in old doc). New guest context fields: `guestName`, `propertyName`, `checkIn`, `checkOut`, `bookingChannel`, `originalMessage`, `leadUid`, `threadUid`, `messageUid`
6. **Delivery mechanism clarified**: Old doc mentioned "Always runs inside a Fly.io machine with `EMPLOYEE_PHASE=delivery`" — still correct. Now explicitly encoded in `delivery_instructions` archetype field.

## New Content (not in old doc)

- `agents_md` field on archetypes — not mentioned in April 24 doc
- `notification_channel` field on archetypes — added April 27
- `delivery_instructions` field on archetypes — added April 26
- Guest Messaging now has a cron trigger (`*/5 * * * *`) in addition to webhook
- Tenant configs now include `default_agents_md` key pointing to PLATFORM_AGENTS_MD

## Mermaid Diagram

N/A

## Unresolved

None — all values verified against seed.ts source with line number citations.
