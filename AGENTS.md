# AI Employee Platform — Agent Guide

> Keep this file concise and current. Only include information that helps agents make correct decisions. For architectural details, read the vision doc on demand — don't duplicate it here. This file is loaded into every LLM call — every token here costs tokens on every turn.

## Approved LLM Models

**CRITICAL CONSTRAINT — NEVER VIOLATE:**

Only TWO LLM models are approved for use in this codebase. Using any other model is a bug.

| Model            | ID                           | Purpose                                                                                     |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| MiniMax M2.7     | `minimax/minimax-m2.7`       | Primary execution model — all employee work, code generation, summaries                     |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` | Verification/judge only — plan verification, intent classification, feedback acknowledgment |

**Forbidden models (any reference = bug):** `anthropic/claude-sonnet-*`, `anthropic/claude-opus-*`, `openai/gpt-4o`, `openai/gpt-4o-mini`, or any other model not listed above.

This applies to: production code, seed data, default fallbacks, environment variable examples, and test fixtures. No exceptions.

## Deprecated Components

The following components are deprecated. Do NOT modify, do NOT add features, do NOT fix bugs in these files unless the user explicitly instructs you to work on them:

| Component                       | File                                              | Reason                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering task lifecycle      | `src/inngest/lifecycle.ts`                        | Engineering employee is on hold. All active development targets the unified employee lifecycle in `src/inngest/employee-lifecycle.ts`.                                                                        |
| Engineering task redispatch     | `src/inngest/redispatch.ts`                       | Paired with the deprecated engineering lifecycle.                                                                                                                                                             |
| Generic worker harness          | `src/workers/generic-harness.mts`                 | Replaced by the OpenCode-based harness (`src/workers/opencode-harness.mts`). Source file has been deleted; stale compiled artifacts may remain in `dist/`.                                                    |
| Tool registry                   | `src/workers/tools/registry.ts`                   | Part of the generic harness. Replaced by shell scripts at `src/worker-tools/`.                                                                                                                                |
| Engineering watchdog cron       | `src/inngest/watchdog.ts`                         | Cron (`*/10 * * * *`) that detects stuck engineering tasks. On hold with the engineering employee; still registered, do not modify.                                                                           |
| Engineering worker orchestrator | `src/workers/orchestrate.mts`                     | Engineering-only worker — ~1100-line orchestrator for planning, wave execution, fix loops, and PR creation. On hold; do not modify.                                                                           |
| Engineering worker launcher     | `src/workers/entrypoint.sh`                       | Default Dockerfile CMD; shells out to `orchestrate.mts`. Engineering only — on hold, do not modify.                                                                                                           |
| Engineering worker libraries    | `src/workers/lib/` (except `postgrest-client.ts`) | 30 utilities exclusively supporting `orchestrate.mts` (wave executor, PR manager, session manager, etc.). On hold — do not modify. `postgrest-client.ts` is shared with `opencode-harness.mts` and is active. |

## Platform Vision

A single-responsibility AI Employee Platform — deploys autonomous AI agents ("digital employees"), each with one job. Every employee follows the same lifecycle, uses the same infrastructure (Inngest orchestration, Supabase state, Fly.io runtime), and is defined by a declarative archetype config.

What changes per employee: **triggers** (what starts it), **tools** (what it can do), **knowledge base** (domain expertise), **model** (which LLM to use), and **approval gates** (risk thresholds).

Full architecture, employee roadmap, archetype schema, lifecycle states, event routing, operating modes, integration map, and multi-tenancy design: `docs/2026-04-14-0104-full-system-vision.md`

## Current Implementation

One employee is active; one is deprecated and on hold:

1. **Engineering** ⚠️ **DEPRECATED — ON HOLD** — receives Jira tickets via webhook, spawns a Docker/Fly.io worker running OpenCode, delivers a GitHub pull request. Do not add features or fix bugs in engineering-specific files. See Deprecated Components table.
2. **Summarizer (Papi Chulo)** — runs daily via cron, reads configured Slack channels, generates a digest with an LLM, posts to a target channel for human approval, then publishes on approval.
3. **Guest-Messaging (VLRE)** — receives Hostfully `NEW_INBOX_MESSAGE` webhooks, fetches unresponded guest messages via Hostfully API, drafts replies using AI, posts a Slack approval card for PM review, delivers approved reply to guest via Hostfully. Rejects are stored as learned rules.

**Stack**: TypeScript · Express · Inngest · Prisma · Docker · Supabase (PostgREST)

**What's built**: Event Gateway (Express), Inngest lifecycle functions, OpenCode-based worker (Docker/Fly.io), Supabase state management, Admin API (tenant-scoped `/admin/tenants` projects, trigger + status endpoints), Slack integration (Socket Mode + interactive buttons).

**What's deferred**: Triage agent, review agent, semantic search (pgvector).

## OpenCode Worker (All Employees)

All non-deprecated employees use the OpenCode-based harness on Fly.io:

- **Harness**: `src/workers/opencode-harness.mts` — reads archetype from DB, starts OpenCode session, injects natural language `instructions` + available tools, monitors until completion
- **Shell tools**: `src/worker-tools/slack/` — pre-installed in Docker image at `/tools/slack/`. Usage:
  - `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "C123" --text "msg" --task-id "uuid" > /tmp/approval-message.json`
    Output: JSON `{"ts":"...","channel":"..."}`. When `--task-id` is provided, auto-generates blocks: header, summary text, divider, task ID context block, Approve/Reject buttons.
  - `tsx /tools/slack/read-channels.ts --channels "C123,C456" --lookback-hours 24`
    Output: JSON `{"channels":[...]}`. Reads channel history with thread replies; filters out bot summary posts.
- **Lock tools**: `src/worker-tools/locks/` — pre-installed in Docker image at `/tools/locks/`. Usage:
  - `tsx /tools/locks/sifely-client.ts --action list-locks` — list all locks on the account
  - `tsx /tools/locks/sifely-client.ts --action list-passcodes --lock-id <id>` — list passcodes for a lock
  - `tsx /tools/locks/sifely-client.ts --action list-access-records --lock-id <id>` — list access records for a lock
  - `tsx /tools/locks/sifely-client.ts --action create-passcode --lock-id <id> --name "Name" --passcode "1234" --start-date <epoch-ms> --end-date <epoch-ms>` — create a timed passcode
  - `tsx /tools/locks/sifely-client.ts --action update-passcode --lock-id <id> --keyboard-pwd-id <id> --name "Name" --passcode "1234" --start-date <epoch-ms> --end-date <epoch-ms>` — update an existing passcode
  - `tsx /tools/locks/sifely-client.ts --action delete-passcode --lock-id <id> --keyboard-pwd-id <id>` — delete a passcode
- **Hostfully tools**: `src/worker-tools/hostfully/` — pre-installed in Docker image at `/tools/hostfully/`. Hostfully API integration: message retrieval (`get-messages.ts --unresponded-only`), message sending (`send-message.ts`), property/reservation/review lookups, webhook registration, environment validation.
- **Knowledge base tools**: `src/worker-tools/knowledge_base/` — pre-installed in Docker image at `/tools/knowledge_base/`. Knowledge base search tool (`search.ts`) for querying tenant-scoped learned knowledge.
- **Platform tools**: `src/worker-tools/platform/` — pre-installed in Docker image at `/tools/platform/`. Platform infrastructure tool (`report-issue.ts`) for logging system events.
- **OpenCode version — CRITICAL**: Pinned to `1.14.31` (`opencode-linux-${ARCH}@1.14.31` native binary in Docker image). Version `1.14.33` has a confirmed 6-second exit regression (session bootstrap failure). **Never upgrade without explicit testing.**
- **`USE_LOCAL_DOCKER` flag**: Set programmatically by `dev.ts` — the `.env` value is always overridden. Do not rely on `.env` to control local vs Fly.io dispatch.
- **Task-fetch-first**: The harness fetches the task from DB **before** starting OpenCode. A non-existent `TASK_ID` exits at "Task not found" — OpenCode never launches. Direct container tests with fake task IDs do not verify OpenCode startup.
- **`autoupdate: false`**: Must be set in both `src/workers/config/opencode.json` (baked into Docker image) and `~/.config/opencode/opencode.json` (global) to prevent self-update on container startup.
- **Lifecycle**: `src/inngest/employee-lifecycle.ts` — universal lifecycle with all states (Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done). States auto-pass where unambiguous (Triaging, AwaitingInput, Validating). Terminal states: `Failed` (machine poll timeout or unhandled error), `Cancelled` (reject action or 24h approval timeout).
- **Inngest functions** (active):
  - `employee/universal-lifecycle` — universal employee lifecycle (all employees)
  - `employee/interaction-handler` — unified handler for thread replies and @mentions; classifies intent, stores feedback, responds in-thread
  - `employee/rule-extractor` — extracts behavioral rules from corrections/rejections; posts Slack confirmation cards for PM review; stores confirmed rules as `learned_rules`
  - `trigger/daily-summarizer` — daily cron trigger for Papi Chulo (8am UTC, weekdays)
  - `trigger/feedback-summarizer` — weekly cron that generates a digest of recent feedback using Claude Haiku
  - `trigger/learned-rules-expiry` — cron maintenance (`0 2 * * *`, `src/inngest/triggers/learned-rules-expiry.ts`) — handles expiry of learned rules, no task dispatch

  Three deprecated engineering functions (`engineering/task-lifecycle`, `engineering/task-redispatch`, `engineering/watchdog-cron`) remain registered but are on hold — see Deprecated Components table.

- **Output contract**: OpenCode writes `/tmp/summary.txt` (deliverable content) and `/tmp/approval-message.json` (Slack message metadata). Absence of BOTH is a hard failure; either file alone is sufficient to proceed. See `docs/snapshots/2026-04-29-2255-current-system-state.md` for the full 15-step harness flow.
- **SIGTERM handling**: Harness registers a `SIGTERM` handler that PATCHes the task to `Failed` on termination — explains why tasks show as Failed after machine preemption.
- **Feedback context**: Harness optionally prepends `FEEDBACK_CONTEXT` (env var injected by the lifecycle from stored feedback) to the system prompt, allowing historical feedback to influence future runs.

**Cron timezone — CRITICAL**: The daily-summarizer cron `0 8 * * 1-5` fires at **8am UTC**, not 8am local time. Inngest has no timezone config on this function. The archetype's `trigger_sources.timezone: "America/Chicago"` is stored as documentation metadata only — the Inngest runtime never reads it. Do not use it to infer the actual trigger time.

**Adding a new employee**:

1. Seed a new `archetypes` record with `role_name`, `system_prompt`, `instructions` (natural language), `model` (`minimax/minimax-m2.7`), `deliverable_type`, `runtime: 'opencode'`. Optional fields: `agents_md` (per-archetype AGENTS.md content injected into worker context), `delivery_instructions` (instructions used during the delivery phase), `notification_channel` (per-archetype Slack notification channel, overrides tenant default).
2. If shell tools needed, add TypeScript scripts to `src/worker-tools/{service}/` (copied into Docker image at `/tools/{service}/`, executed via `tsx`). Follow the [Shell Tool Checklist](docs/2026-05-04-1645-adding-a-shell-tool.md).
3. Add a trigger (cron or webhook) in `src/inngest/triggers/`

**Approval gate**: Controlled per-archetype via `risk_model.approval_required`. When `false`, the lifecycle short-circuits from `Submitting` directly to `Done`, skipping `Reviewing → Approved → Delivering` entirely. For the approval-required path, the lifecycle posts the approved summary directly to the publish channel — no separate delivery machine is spawned.

> **⚠️ Planned change (PLAT-05)**: Delivery will always use a Fly.io machine with a delivery-phase instruction set per archetype. The inline `slackClient.postMessage()` path is being removed. Do not add new inline delivery logic to the lifecycle. See `docs/planning/2026-04-21-2202-phase1-story-map.md` § PLAT-05.

**Summarizer archetype slug**: `daily-summarizer` (seeded in `prisma/seed.ts`). Duplicate prevention: `external_id: summary-{YYYY-MM-DD}`.

**OpenCode harness CMD** (Fly.io dispatch): `["node", "/app/dist/workers/opencode-harness.mjs"]`

## Feedback Pipeline

Thread replies and @mentions on employee Slack messages are captured and handled through a unified pipeline:

- **Thread reply or @mention** → Slack Bolt fires `employee/interaction.received` (with `source: 'thread_reply'` or `source: 'mention'`) → `interaction-handler` classifies intent
  - **Correction/teaching** → fires `employee/rule.extract-requested` → `rule-extractor` extracts a concrete behavioral rule → posts Slack confirmation card for PM review → confirmed rules stored in `learned_rules`
  - **Question/feedback** → responds in thread; stores if relevant
- **Weekly cron** (`trigger/feedback-summarizer`, Sunday midnight UTC) → reads recent feedback, generates a digest with Claude Haiku, writes to `knowledge_bases`

## Tenants

Two tenants are seeded in `prisma/seed.ts`. Each requires its own Slack OAuth connection to operate:

| ID                                     | Name      | Slug      | Slack Workspace                                    |
| -------------------------------------- | --------- | --------- | -------------------------------------------------- |
| `00000000-0000-0000-0000-000000000002` | DozalDevs | dozaldevs | `T0601SMSVEU` (Dozal Inc.) — must OAuth separately |
| `00000000-0000-0000-0000-000000000003` | VLRE      | vlre      | `vlreworkspace.slack.com` (team: `T06KFDGLHS6`)    |

**`SLACK_BOT_TOKEN` in `.env` is the VLRE workspace bot token only.** It cannot access DozalDevs channels. Never store it as the DozalDevs tenant secret.

## Slack Interactive Buttons — Socket Mode (CRITICAL — READ BEFORE DEBUGGING)

**The Papi chulo Slack app uses Socket Mode. This has been confirmed multiple times.**

- **NEVER ask the user to configure an Interactivity Request URL** in the Slack API dashboard. Socket Mode is enabled on the app, which means "You won't need to specify a Request URL" — Slack says this explicitly in the UI.
- `SLACK_APP_TOKEN=xapp-...` is already set in `.env`. The gateway (`src/gateway/server.ts` lines 68–93) detects this and automatically starts Bolt in Socket Mode with a WebSocket connection to Slack.
- Confirmed working: gateway logs show `"Slack Bolt — Socket Mode connected"` on every startup.
- If a button click does not reach the gateway, it is a **transient WebSocket drop**, NOT a URL configuration problem. Do NOT ask the user to change any Slack app settings.
- **Processing state**: approve/reject handlers call `(ack as any)({ replace_original: true, blocks: [...] })` — embeds `⏳ Processing approval...` / `⏳ Processing rejection...` directly in the Socket Mode ack envelope, eliminating any ⚠️ flash. Do not remove this ack pattern.
- **Idempotency**: Before firing `employee/approval.received`, handlers check task status === `'Reviewing'` via PostgREST. If already processed, updates the Slack message to "already processed" instead. Events are deduped by Inngest ID `employee-approval-{taskId}`.

**Manual approval fallback** (use when button click doesn't work):

```bash
curl -X POST "http://localhost:8288/e/local" \
  -H "Content-Type: application/json" \
  -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"<SLACK_USER_ID>","userName":"Victor"}}'
```

**Debugging button click failures:**

1. Check gateway logs for `"Slack Bolt — Socket Mode connected"` — if missing, `SLACK_APP_TOKEN` is unset or invalid
2. Check for `slack_bolt_authorization_error` — if present with a team ID, that team's `tenant_integrations` row is missing (run OAuth)
3. If Socket Mode is connected and no error appears, it was a transient drop — retry by clicking again or use the manual fallback above

## Slack Message Standards

**REQUIRED on every message sent to Slack — no exceptions:**

1. **Task ID context block** — every message must include a trailing `context` block with the task ID as small gray metadata:
   ```json
   { "type": "context", "elements": [{ "type": "mrkdwn", "text": "Task `<taskId>`" }] }
   ```
2. **User mention for actions** — whenever a human takes an action (approve, reject, or any future action state), display the actor using the Slack `<@userId>` mrkdwn syntax so it renders as `@Victor Dozal`. Never use the raw Slack username string (e.g. `victor192`). The `userId` (e.g. `U05V0CTJLF6`) is available from `actionBody.user.id` in handlers and from `approvalEvent.data.userId` in the lifecycle.

**Reference implementation**: `src/inngest/employee-lifecycle.ts` (`handle-approval-result` step) and `src/worker-tools/slack/post-message.ts` (`buildApprovalBlocks`).

## Slack Message Hygiene (MANDATORY — No Message Accumulation)

Every task gets ONE primary top-level Slack message per channel. All status progressions MUST use one of:

1. **Replace in place** via `chat.update` — capture `ts` from `postMessage` return value and store it for later updates
2. **Thread replies** via `thread_ts` — post follow-up context as replies to the original message

**Rules:**

- NEVER discard a `ts` return value from `postMessage`. Always capture it: `const result = await slackClient.postMessage(...)` then use `result.ts`.
- In Inngest steps, return `{ ts: result.ts, channel: result.channel }` from `step.run(...)` to make the reference accessible to all subsequent steps in the same run.
- Every terminal state (Done, Failed, Cancelled) MUST update the original "Task received" notification message to reflect the final outcome — never leave it frozen at "⏳ processing".
- The approval card (`pending_approvals.slack_ts`) and the notify-received message are separate messages — both must be updated at terminal states.

**Reference implementation**: `src/inngest/employee-lifecycle.ts` — `notify-received` step (captures ts), `handle-approval-result` step (updates both messages), `mark-failed` step (updates notify-received to ❌ Failed).

## Slack OAuth — Per-Tenant Installation

Tokens are stored per-tenant: `tenant_secrets` (key: `slack_bot_token`) + `tenant_integrations` (provider: `slack`, external_id: Slack team ID). The `TenantInstallationStore` (`src/gateway/slack/installation-store.ts`) looks them up by team ID for Bolt authorization.

**⚠️ DB wipe/reset destroys OAuth connections.** `pnpm prisma db seed` restores tenants and archetypes but NOT OAuth tokens — those only come from completing the OAuth flow. After any DB reset, both DozalDevs and VLRE must re-authorize.

### Re-connecting a tenant's Slack workspace

1. Confirm gateway is running and Cloudflare tunnel is alive (`curl $SLACK_REDIRECT_BASE_URL/health` → 200)
2. Open in browser: `http://localhost:7700/slack/install?tenant=<tenantId>`
3. Complete OAuth — select the correct workspace
4. Callback stores encrypted token in `tenant_secrets` + upserts `tenant_integrations`
5. Verify: `SELECT tenant_id, key FROM tenant_secrets; SELECT tenant_id, provider, external_id FROM tenant_integrations;`

| Tenant    | Install URL                                                                       |
| --------- | --------------------------------------------------------------------------------- |
| DozalDevs | `http://localhost:7700/slack/install?tenant=00000000-0000-0000-0000-000000000002` |
| VLRE      | `http://localhost:7700/slack/install?tenant=00000000-0000-0000-0000-000000000003` |

VLRE alternative: run the Slack OAuth flow for VLRE (see install URL above).

## Per-Tenant Slack Token Architecture

`loadTenantEnv()` (`src/gateway/services/tenant-env-loader.ts`) builds the Fly.io machine environment:

- `tenant_secrets.slack_bot_token` → `SLACK_BOT_TOKEN` in machine env
- `tenant.config.summary.channel_ids` → `DAILY_SUMMARY_CHANNELS`
- `tenant.config.summary.target_channel` → `SUMMARY_TARGET_CHANNEL`
- `tenant.config.summary.publish_channel` → `SUMMARY_PUBLISH_CHANNEL`

**Fly.io app-level secrets are NOT inherited by spawned machines.** Only what `loadTenantEnv` returns (+ explicit `TASK_ID`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) reaches the worker.

### Summarizer failure diagnostic

| Symptom                                                 | Cause                                                       | Fix                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Task → Reviewing in <30s, deliverable content empty     | `SLACK_BOT_TOKEN` missing from machine env                  | Re-run OAuth for that tenant                            |
| `No installation for team: T...` in gateway logs        | `tenant_integrations` row missing for that Slack workspace  | Re-run OAuth for that tenant                            |
| `Out of memory: Killed process (.opencode)` in Fly logs | OpenCode OOM on small VM                                    | Increase `SUMMARIZER_VM_SIZE`                           |
| `channel_not_found` from Slack API                      | Bot token belongs to a different workspace than the channel | Wrong token stored — re-run OAuth for correct workspace |

Fly.io worker logs: `fly logs -a ai-employee-workers` (NOT `ai-employee-summarizer` — that app does not exist).

## Summarizer — Per-Tenant Channel Configuration

> **⚠️ Planned change (PLAT-07/08)**: Hardcoded channel IDs in archetype instructions will be replaced by a `notification_channel` config (required per-tenant default + optional per-archetype override). All channel resolution will go through config, not natural language instructions. Do not add more hardcoded channel IDs to archetype instructions. See `docs/planning/2026-04-21-2202-phase1-story-map.md` § PLAT-07 and PLAT-08.

Channel config lives in two places — both must be consistent:

1. **`tenants.config.summary`** (DB) — read by `loadTenantEnv` to inject env vars into machine; also read by the lifecycle after approval to know which Slack message to update.
2. **Archetype `instructions`** (DB) — natural language telling OpenCode which shell tools to call and with which channel IDs. Tenant-specific archetypes can hardcode channels directly, bypassing env vars.

### DozalDevs (`00000000-0000-0000-0000-000000000002`)

- **Archetype ID**: `00000000-0000-0000-0000-000000000012`
- **Pattern**: Hardcoded channel IDs in archetype instructions (not env vars)
- Read from: `C092BJ04HUG` (`#project-lighthouse`)
- Post approval summary + buttons to: `C0AUBMXKVNU` (`#victor-tests`)
- Post confirmation (publish) to: `C092BJ04HUG` (`#project-lighthouse`)
- `tenant.config.summary.target_channel`: `C0AUBMXKVNU` (needed for lifecycle approval update)

### VLRE (`00000000-0000-0000-0000-000000000003`)

- **Archetype ID**: `00000000-0000-0000-0000-000000000013`
- **Pattern**: Hardcoded channel IDs in archetype instructions (not env vars)
- Read from: `C0AMGJQN05S`, `C0ANH9J91NC`, `C0960S2Q8RL`
- Post approval summary + buttons to: `C0960S2Q8RL`
- Post confirmation (publish) to: `C0960S2Q8RL`
- `tenant.config.summary.target_channel`: `C0960S2Q8RL` (needed for lifecycle approval update)

Both archetypes share the same Papi Chulo system prompt (dramatic Spanish TV news correspondent persona), model (`minimax/minimax-m2.7`), runtime (`opencode`), and risk model (`approval_required: true`, `timeout_hours: 24`).

## Hostfully Testing

Use these VLRE resources for all Hostfully-related testing:

| Resource     | ID / URL                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Thread       | `https://platform.hostfully.com/app/#/inbox?threadUid=2f18249a-9523-4acd-a512-20ff06d5c3fa&leadUid=37f5f58f-d308-42bf-8ed3-f0c2d70f16fb` |
| Thread UID   | `2f18249a-9523-4acd-a512-20ff06d5c3fa`                                                                                                   |
| Lead UID     | `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`                                                                                                   |
| Property     | `https://platform.hostfully.com/app/#/property/c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                     |
| Property UID | `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                                                                   |

## Hostfully Tenant Configuration (CRITICAL — Read Before Any Hostfully Work)

Hostfully credentials are **tenant-level secrets stored in the database**, not `.env` variables. The `tenant-env-loader.ts` auto-uppercases and injects all `tenant_secrets` rows into the worker machine env — no code changes needed when adding new secrets.

| Value                  | Correct Location                                                                                                                        | Never Do                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `HOSTFULLY_API_KEY`    | `tenant_secrets` row with `key = 'hostfully_api_key'`                                                                                   | Put in `.env` as a system requirement    |
| `HOSTFULLY_AGENCY_UID` | `tenant_secrets` row with `key = 'hostfully_agency_uid'` AND `tenant.config.guest_messaging.hostfully_agency_uid` (for webhook routing) | Hardcode in scripts or require in `.env` |
| `WEBHOOK_PUBLIC_URL`   | `.env` only — legitimate exception (global developer config for one-time webhook registration, not per-tenant)                          | Store in tenant_secrets                  |

**How injection works**: `tenant-env-loader.ts` calls `secretRepo.getMany(tenantId)` and runs `env[key.toUpperCase()] = value` for every secret. Result: `hostfully_api_key` → `HOSTFULLY_API_KEY` in machine env, `hostfully_agency_uid` → `HOSTFULLY_AGENCY_UID`. No whitelist. Any key stored in `tenant_secrets` is automatically injected.

**Provisioning commands**:

```bash
# Store Hostfully API key for VLRE
curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_api_key" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"<your-key>"}'

# Store agency UID for VLRE (value already seeded in tenant config)
curl -X PUT "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/secrets/hostfully_agency_uid" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"942d08d9-82bb-4fd3-9091-ca0c6b50b578"}'
```

**When writing diagnostic/preflight scripts**: Check `GET /admin/tenants/:id/secrets` for `is_set: true` — do NOT check `.env` for these values. The system never reads them from `.env`.

## Guest-Messaging Employee (VLRE)

- **Archetype ID**: `00000000-0000-0000-0000-000000000015`
- **Tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)
- **role_name**: `guest-messaging` · **model**: `minimax/minimax-m2.7` · **approval_required**: true, timeout_hours: 24
- **Notification channel**: `C0960S2Q8RL` · **concurrency_limit**: 5
- **Trigger**: Hostfully webhook only — `POST /webhooks/hostfully` (`src/gateway/routes/hostfully.ts`)
- **Dedup key**: `external_id: hostfully-msg-{message_uid}` — duplicate webhook → 200 + `{ duplicate: true }` (no new task)
- **No HMAC verification** on the Hostfully webhook — Zod schema validation only

**Inbound flow**:

```
Hostfully NEW_INBOX_MESSAGE webhook
  → POST /webhooks/hostfully
    → match tenant by agency_uid (tenant.config.guest_messaging.hostfully_agency_uid)
    → find archetype by { tenant_id, role_name: 'guest-messaging' }
    → prisma.task.create → inngest.send('employee/task.dispatched')
      → universal lifecycle
        → pre-check: if last message in thread is from host (senderType=AGENCY) → task goes Received → Done (no worker, no Slack)
        → otherwise → local Docker / Fly.io worker → OpenCode
          → model calls get-messages.ts --unresponded-only (Hostfully API)
          → NEEDS_APPROVAL → post-guest-approval.ts → Slack card → PM approves → send-message.ts → Hostfully
          → NO_ACTION_NEEDED → task goes to Submitting → auto-completes
```

**CRITICAL gotcha — webhook is a trigger only**: The model independently polls Hostfully for ALL unresponded messages via `get-messages.ts --unresponded-only`. The `message_uid`/`thread_uid` from the webhook payload is stored in `raw_event` but NOT passed to the model. If no unresponded messages exist in Hostfully at execution time, the model returns `NO_ACTION_NEEDED` regardless of the webhook payload.

**Simulate a webhook locally** (no auth required — no HMAC on this endpoint):

```bash
curl -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-msg-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"
  }'
```

`message_uid` must be unique per request (dedup key). For a real E2E test, there must be an actual unresponded message in Hostfully first — otherwise the model returns `NO_ACTION_NEEDED`.

## Admin API

Two commonly used endpoints for triggering employees and checking status:

- `POST /admin/tenants/:tenantId/employees/:slug/trigger` — creates task, returns 202 + `{ task_id, status_url }`. Add `?dry_run=true` to validate without creating a task.
- `GET /admin/tenants/:tenantId/tasks/:id` — check task status (tenant-scoped, 404 on cross-tenant access)

Auth: `X-Admin-Key: $ADMIN_API_KEY` header on both endpoints. `source_system` for manual tasks: `'manual'` (existing values: `'jira'`, `'cron'`).

The admin API has 18 total routes covering tenant CRUD (create, list, get, update, soft-delete, restore), per-tenant secrets management (list keys, set, delete), tenant config (get, deep-merge update), project CRUD, employee trigger, and task status. Full route table: `docs/snapshots/2026-04-20-1314-current-system-state.md` § Gateway and Routes.

```bash
TENANT=00000000-0000-0000-0000-000000000002
# Trigger
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger" -H "Content-Type: application/json" -d '{}'
# Dry-run
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://localhost:7700/admin/tenants/$TENANT/employees/daily-summarizer/trigger?dry_run=true" -H "Content-Type: application/json" -d '{}'
```

## Commands

| Action           | Command                            |
| ---------------- | ---------------------------------- |
| First-time setup | `pnpm setup`                       |
| Start services   | `pnpm dev`                         |
| Run tests        | `pnpm test -- --run`               |
| Setup test DB    | `pnpm test:db:setup`               |
| Lint             | `pnpm lint`                        |
| Build            | `pnpm build`                       |
| Trigger E2E task | `pnpm trigger-task`                |
| Verify E2E       | `pnpm verify:e2e --task-id <uuid>` |

Prerequisites: Node ≥20, pnpm, Docker (with Compose plugin).

## Pre-existing Test Failures

Do NOT attempt to fix these — they are unrelated to any recent changes:

- `container-boot.test.ts` — requires Docker socket; all 4 tests skip via `describe.skipIf` when Docker is unavailable
- `inngest-serve.test.ts` — function count check hardcodes `function_count === 2` but 9 functions are registered; stale assertion, do not fix

## Database

- **Name**: `ai_employee` (NOT `postgres` — the CLI default)
- **Connection**: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- **ORM**: Prisma — `prisma/schema.prisma`
- **REST API**: Supabase PostgREST on `http://localhost:54321`

### Test Database

- **Name**: `ai_employee_test` (separate from dev `ai_employee`)
- **Setup**: `pnpm test:db:setup` (one-time, idempotent — creates DB, runs migrations + seed)
- **How it works**: `vitest.config.ts` overrides `DATABASE_URL` → `globalSetup` runs `prisma migrate deploy` + seed → all tests use test DB automatically
- **Safety guard**: `globalSetup` throws if `DATABASE_URL` doesn't contain `ai_employee_test`
- **After DB reset**: Run `pnpm test:db:setup` to recreate the test database

## Infrastructure

Uses **Docker Compose** (`docker/docker-compose.yml`) instead of `supabase start`. The Supabase CLI hardcodes `database: postgres` in its Go source — PostgREST would connect to the wrong database. Docker Compose uses `${POSTGRES_DB}` throughout, so `POSTGRES_DB=ai_employee` in `docker/.env` makes all services use the right database.

**CRITICAL — Rebuild after every worker change**: Any modification to files under `src/workers/` or `src/worker-tools/` requires rebuilding the Docker image before the fix takes effect. Gateway and Inngest code (`src/gateway/`, `src/inngest/`) do NOT require a rebuild.

```bash
docker build -t ai-employee-worker:latest . && pnpm trigger-task
```

For hybrid Fly.io mode (local Supabase + remote Fly.io worker), also run `pnpm fly:image`. Hybrid mode requires a Cloudflare Tunnel exposing local PostgREST. Set `USE_FLY_HYBRID=1` and `TUNNEL_URL=<cloudflare-url>` when dispatching.

## Project Structure

```
src/
├── gateway/      # Express HTTP server — webhook receiver + Inngest function host
│   ├── routes/       # All HTTP route handlers
│   ├── slack/        # Bolt event/action handlers + OAuth installation store
│   ├── middleware/   # Admin auth middleware
│   ├── validation/   # Zod schemas + HMAC signature verification
│   ├── services/     # Business logic: dispatcher, task creation, project registry, tenant/secret repos
│   └── inngest/      # Inngest client factory, event sender, serve registration
├── inngest/      # Durable workflow functions: lifecycle, watchdog, redispatch
│   ├── triggers/     # Cron trigger functions (daily-summarizer, feedback-summarizer)
│   └── lib/          # Shared: create-task-and-dispatch, poll-completion, pending-approvals, quiet-hours, reminder-blocks
├── workers/      # Docker container code — runs inside the worker machine
├── worker-tools/ # Shell tools (TypeScript, executed via tsx in Docker at /tools/)
└── lib/          # Shared: fly-client, github-client, slack-client, jira-client, call-llm (model enforcement + $50/day cost circuit breaker), encryption (AES-256-GCM for tenant secrets), logger, retry, errors, tunnel-client, repo-url, agent-version, classify-message, hostfully-precheck, slack-blocks, telegram-client
prisma/           # Schema (24 models), 28 migrations, seed
scripts/          # TypeScript scripts run via tsx (setup, trigger, verify)
docker/           # Supabase self-hosted Docker Compose
docs/             # Architecture vision, phase docs, troubleshooting
tests/            # Vitest test suite
```

## Key Conventions

- Worker branch naming: `ai/{ticketId}-{slug}`
- Inngest functions register in the gateway process (not a separate service)
- Worker containers communicate with Supabase via PostgREST REST API (not direct Prisma)
- All `scripts/` are TypeScript, run via `tsx`
- Employee behavior is config-driven (archetype pattern), not hardcoded orchestration logic
- **Multi-tenancy is mandatory** — every table, registry, catalog, and query must be scoped by `tenant_id`. When adding any new data structure, ask: "Is this tenant-isolated?" If not, it's a bug.
- **Shared files must stay employee-agnostic** — `src/inngest/employee-lifecycle.ts`, `src/workers/opencode-harness.mts`, and any file under `src/gateway/` or `src/lib/` serve ALL employees. Never use employee-specific language (e.g. "guest", "summary", "Hostfully") in log messages, comments, error strings, or variable names in these files. If you catch yourself writing something employee-specific in a shared file, that is a bug.
- **Zod v4 UUID validation**: `z.string().uuid()` enforces RFC 4122 version/variant bits and may reject certain UUIDs. Use the loose `UUID_REGEX` in `src/gateway/validation/schemas.ts` for any route param that accepts tenant or task UUIDs.

### Documentation Freshness (MANDATORY)

When making code changes that add, remove, or rename any of the following, you MUST update AGENTS.md and/or README.md in the same commit or PR:

**Triggers requiring AGENTS.md update:**

- New or removed Inngest function (update Inngest functions list and pipeline description)
- New or removed worker-tool directory under `src/worker-tools/` (update Shell tools section)
- New or removed gateway route file (update route description)
- New or removed gateway service (update services description)
- New Prisma model or significant field additions (update relevant sections)
- New or removed `src/lib/` module (update lib description)
- Changes to approved LLM models
- Changes to employee archetypes or tenant configuration
- Completion of a "planned change" noted with ⚠️ (remove the warning, document current state)

**Triggers requiring README.md update:**

- New or removed npm script in `package.json` (update Scripts table)
- New or removed admin API endpoint (update route table)
- New active employee type (update Active employees table)
- Changes to Quick Start or setup flow
- New documentation files in `docs/` (update Documentation table)

**What to update (high-level only):**

- Describe what things ARE and what they DO — not line numbers, not exact file counts, not implementation details
- Use directory names and module purposes, not "N files" counts
- Reference file paths only when they rarely change (e.g., entry points, config files)

**What NOT to update:**

- `docs/` snapshot files — these are point-in-time records, not living documents
- Deprecated component entries — leave as-is unless removing the component entirely
- Line numbers or exact counts of anything — these go stale within days

**Example — YES update:**

> "Added `src/worker-tools/calendar/` with Google Calendar scripts. Updated AGENTS.md Shell tools section."

**Example — NO update needed:**

> "Refactored internal helper in `src/lib/retry.ts` from callback to async/await. No public API change."

## Environment Variables

Copy `.env.example` → `.env`. Minimum for local E2E:

```
OPENROUTER_API_KEY   # AI code generation (OpenCode via OpenRouter)
GITHUB_TOKEN         # git push + gh pr create (must have push access to all registered repos)
JIRA_WEBHOOK_SECRET  # HMAC-SHA256 validation (use "test-secret" locally)
ADMIN_API_KEY        # Admin API key for all /admin/* endpoints (auto-generated by pnpm setup)
ENCRYPTION_KEY       # AES-256-GCM key for tenant secrets (validated at gateway startup)
```

Summarizer-specific vars (required for Papi Chulo):

```
SLACK_SIGNING_SECRET       # Verifies Slack interaction webhooks (HMAC-SHA256)
FLY_WORKER_APP             # Fly.io app for all worker machines (currently: ai-employee-workers)
SUMMARIZER_VM_SIZE         # VM size for summarizer machines (default: shared-cpu-1x)
```

See `.env.example` for the full list.

## Long-Running Commands

**NEVER** run commands expected to take >30 seconds with a blocking shell call. Launch in a detached tmux session with output piped to a log file. Poll every 30–60 seconds.

Commands that ALWAYS require tmux: `pnpm trigger-task`, `pnpm dev`, `docker build`, `fly logs`, `cloudflared tunnel`.

```bash
# Launch
tmux new-session -d -s <name> -x 220 -y 50
tmux send-keys -t <name> \
  "cd /path/to/repo && COMMAND 2>&1 | tee /tmp/<name>.log; echo 'EXIT_CODE:'$? >> /tmp/<name>.log" \
  Enter

# Poll
tail -30 /tmp/<name>.log
grep "EXIT_CODE:" /tmp/<name>.log && echo "DONE" || echo "RUNNING"
```

Session naming: `ai-e2e`, `ai-dev`, `ai-build`. Log files: `/tmp/ai-e2e.log`, etc.

### Tmux Session Cleanup (MANDATORY)

Stale tmux sessions accumulate zsh processes, gitstatus watchers, and kernel vnodes. On macOS, this exhausts the vnode table (`kern.maxvnodes`) and triggers `ENFILE: file table overflow` errors — even when file descriptor limits are not reached. **This has caused production-impacting failures.**

**Rules:**

1. **Kill sessions when done.** After a long-running command completes (EXIT_CODE detected in log), immediately kill its tmux session:

   ```bash
   tmux kill-session -t <name>
   ```

2. **Never leave sessions overnight.** At the end of any task execution, kill ALL tmux sessions you created:

   ```bash
   tmux list-sessions -F '#{session_name}' | grep '^ai-' | xargs -I{} tmux kill-session -t {}
   ```

3. **Pre-flight check.** Before creating a new tmux session, check how many exist. If more than 10 are alive, kill finished ones first:

   ```bash
   echo "Active tmux sessions: $(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')"
   ```

4. **Reuse session names.** Prefer reusing names like `ai-build` over creating `ai-build2`, `ai-build3`, etc. Kill the old one first:

   ```bash
   tmux kill-session -t ai-build 2>/dev/null; tmux new-session -d -s ai-build -x 220 -y 50
   ```

5. **Final wave cleanup.** Every plan's Final Verification Wave must include a step that kills all tmux sessions created during execution.

## Known Issues

### 1. ngrok free tier doesn't work with Fly.io

Cloudflare Tunnel is the permanent solution for hybrid mode.

**PostgREST tunnel** (for Fly.io workers → local Supabase): `cloudflared tunnel --url http://localhost:54321` → copy the `trycloudflare.com` URL → set `TUNNEL_URL=<url>` in `.env`. This tunnel can be a quick (random-URL) tunnel since `TUNNEL_URL` is set at dispatch time.

### 2. Slack OAuth redirect URI requires a stable public URL

The Slack app's redirect URI must be pre-registered and cannot be a `localhost` URL. Use the named Cloudflare Tunnel (`local-ai-employee.dozaldevs.com`) — it never changes on restart.

**Named tunnel is already configured** at `~/.cloudflared/ai-employee-local.yml` → `tunnel: e160ac6d-2d7d-47c4-a552-b13700947d29`.

**Preferred**: `pnpm dev` — starts the full stack including the named tunnel automatically.

**Manual**: `cloudflared tunnel --config ~/.cloudflared/ai-employee-local.yml run`

**For new contributors**: create your own subdomain (e.g. `local-ai-employee-yourname.dozaldevs.com`):

```bash
cloudflared tunnel login
cloudflared tunnel create ai-employee-yourname
cloudflared tunnel route dns ai-employee-yourname local-ai-employee-yourname.dozaldevs.com
```

Then ask the repo owner to add `https://local-ai-employee-yourname.dozaldevs.com/slack/oauth_callback` to the Slack app's Redirect URLs. Set `SLACK_REDIRECT_BASE_URL=https://local-ai-employee-yourname.dozaldevs.com` in your `.env`.

## Git Rules

- Never use `--no-verify`
- Never add `Co-authored-by` lines to commits
- Never reference AI tools (claude, opencode, etc.) in commit messages
- Markdown filenames: `YYYY-MM-DD-HHMM-{name}.md` (run `date "+%Y-%m-%d-%H%M"` first)

## Git Cleanup on Plan Completion (MANDATORY)

When a plan's implementation work is fully complete (all tasks done, final wave passed), Atlas **must** run `git status` and resolve every outstanding item before declaring done:

```bash
git status --short
```

Handle each category:

| Status                                                           | Action                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `M` modified — source/test files                                 | Stage and commit with an appropriate message                                |
| `??` untracked — `.sisyphus/plans/` or `.sisyphus/notepads/`     | Stage and commit: `chore(sisyphus): add plans and notepads for <plan-name>` |
| `??` untracked — generated/build artifacts (`dist/`, `*.js.map`) | Add to `.gitignore` if not already ignored                                  |
| `??` untracked — temp/scratch files                              | Delete them                                                                 |
| `D` deleted files that should stay deleted                       | Stage the deletion and commit                                               |

**Rule**: `git status` must show an empty output (or only entries that are intentionally gitignored) before the plan is considered truly complete. Do not skip this step even if you believe everything was committed during task execution — subagents frequently leave orphaned files.

## Prometheus Planning — Telegram Notifications (MANDATORY)

These rules apply to any agent acting as Prometheus (plan writer) or Atlas (plan executor) in this repo.

Send notifications via the CLI wrapper (uses `src/lib/telegram-client.ts` with retry):

```bash
tsx scripts/telegram-notify.ts "Your message here"
```

### Rule 1 — Prometheus: notify when plan is ready

Immediately after writing a plan file to `.sisyphus/plans/`, send:

```
📋 Plan ready: <plan-name>

Come back to start the work.
```

Do this before presenting the plan to the user.

### Rule 2 — Prometheus: final task in every plan

Every plan's TODOs section must include a final task after the Final Verification Wave:

```markdown
- [ ] **N. Notify completion** — Send Telegram notification: plan `<plan-name>` complete, all tasks done, come back to review results.
```

The executing agent fulfills this task by running the script above with an appropriate message.

### Rule 3 — Atlas fallback: always notify on plan completion

When Atlas finishes executing a plan (all tasks marked `[x]`), it MUST send a Telegram notification as its absolute last action — regardless of whether the plan already contained a notification task. Read `plan_name` from `.sisyphus/boulder.json`.

```bash
PLAN=$(node -e "console.log(require('.sisyphus/boulder.json').plan_name)" 2>/dev/null || echo "plan")
tsx scripts/telegram-notify.ts "✅ ${PLAN} complete — All tasks done. Come back to review results."
```

If the plan already had a notification task that fired, the user receives two notifications — this is intentional.

## Docs Directory Structure

The `docs/` directory is organized into subdirectories by document type. Always file new documents in the correct location.

| Directory         | Pattern                                  | Description                                                                                |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/planning/`  | `*-product-roadmap.md`, `*-story-map.md` | Product roadmaps and phase story maps. File all future phase roadmaps and story maps here. |
| `docs/snapshots/` | `*-current-system-state.md`              | Point-in-time system state snapshots. File all future system state documents here.         |
| `docs/` (root)    | Everything else                          | Architecture overviews, guides, phase implementation docs, troubleshooting.                |

**Rule**: When creating any new markdown file whose name matches one of the patterns above, place it in the corresponding subdirectory — not in `docs/` root.

## Reference Documents

Read these on demand when you need deeper context — do not load preemptively.

| Document                                                 | When to Read                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/2026-04-14-0104-full-system-vision.md`             | Architecture, archetypes, lifecycle, event routing, operating modes, multi-tenancy                                                                                                                                                                       |
| `docs/2026-03-22-2317-ai-employee-architecture.md`       | Original detailed architecture (data model, security, scaling, cost estimates)                                                                                                                                                                           |
| `docs/2026-04-14-0057-worker-post-redesign-overview.md`  | Worker redesign scope (before/after, files added/removed)                                                                                                                                                                                                |
| `.sisyphus/plans/worker-agent-delegation-redesign.md`    | Active redesign plan (14 tasks across 4 waves)                                                                                                                                                                                                           |
| `docs/2026-04-16-0310-manual-employee-trigger.md`        | Manual employee trigger API — endpoints, curl examples, how it works                                                                                                                                                                                     |
| `docs/2026-04-16-1655-multi-tenancy-guide.md`            | Multi-tenancy: provisioning tenants, Slack OAuth, per-tenant secrets, verification                                                                                                                                                                       |
| `docs/snapshots/2026-04-29-2255-current-system-state.md` | Point-in-time system state snapshot: full lifecycle, harness flow, all gateway routes, DB schema, shell tool CLI syntax, Docker services, shared libraries — includes interaction handler unification, guest messaging full flow, learned rules pipeline |
| `docs/planning/2026-04-21-2202-phase1-story-map.md`      | Phase 1 story map: 58 stories across 5 releases + cleanup, all epics and dependencies                                                                                                                                                                    |
| `docs/planning/2026-04-21-1813-product-roadmap.md`       | Product roadmap: 4 phases, design partner strategy, success criteria                                                                                                                                                                                     |
| `docs/2026-05-04-1645-adding-a-shell-tool.md`            | Adding a new shell tool — file structure, CLI pattern, mock fixtures, Docker, documentation                                                                                                                                                              |
| `docs/2026-05-04-2023-local-e2e-testing.md`              | Local E2E testing without real external APIs — mock convention, fixture structure, env propagation, running full lifecycle tests locally                                                                                                                 |
