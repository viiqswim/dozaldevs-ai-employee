# Gateway Routes & Slack Bolt — Verification Notepad

## Source Files Verified

- `src/gateway/server.ts` (194 lines) — startup, env validation, Bolt init, route mounting
- `src/gateway/routes/health.ts` — GET /health
- `src/gateway/routes/jira.ts` — POST /webhooks/jira
- `src/gateway/routes/github.ts` — POST /webhooks/github (stub)
- `src/gateway/routes/admin-projects.ts` — CRUD /admin/tenants/:tenantId/projects
- `src/gateway/routes/admin-employee-trigger.ts` — POST trigger
- `src/gateway/routes/admin-tasks.ts` — GET task status
- `src/gateway/routes/admin-tenants.ts` — CRUD + restore
- `src/gateway/routes/admin-tenant-secrets.ts` — secrets CRUD
- `src/gateway/routes/admin-tenant-config.ts` — config get/patch
- `src/gateway/routes/admin-kb.ts` — knowledge base CRUD
- `src/gateway/routes/slack-oauth.ts` — OAuth install + callback
- `src/gateway/slack/handlers.ts` (1082 lines) — all Bolt handlers
- `src/gateway/slack/installation-store.ts` — TenantInstallationStore
- `src/gateway/middleware/admin-auth.ts` — requireAdminKey middleware

---

## Current State

### Gateway Startup

**Required env vars at startup** (hard failures):

- `ENCRYPTION_KEY` — validated by `validateEncryptionKey()` before anything else
- `ADMIN_API_KEY` — throws if missing

**Logged warnings (soft, gateway still starts)**:

- `JIRA_WEBHOOK_SECRET` missing — webhook signature verification skipped
- Slack vars missing (`SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`) — Bolt not initialized

**Port**: `process.env.PORT ?? 7700`, binds `0.0.0.0`

**Bolt initialization decision tree**:

1. If `SLACK_SIGNING_SECRET + SLACK_CLIENT_ID + SLACK_CLIENT_SECRET` present:
   - If `SLACK_APP_TOKEN` present → **Socket Mode** (`SocketModeReceiver`). Logs `"Slack Bolt — Socket Mode connected"`. Registers disconnect/reconnect lifecycle events.
   - If no `SLACK_APP_TOKEN` → **HTTP Mode** (`ExpressReceiver`, endpoint `/webhooks/slack/interactions`). Logs `"/webhooks/slack/interactions available"`.
2. `registerSlackHandlers(boltApp, inngestClient)` called only if `inngestClient` AND `boltApp` both exist (skipped in test builds without inngest client).

**Authorization**: `TenantInstallationStore.fetchInstallation(teamId)` → looks up `tenant_integrations` by team ID → fetches `tenant_secrets.slack_bot_token`. Throws `"No installation for team: <teamId>"` on missing integration (logged as `slack_bolt_authorization_error`).

---

### Webhook Routes (no auth)

| Method | Path               | File        | Description                                                                                                                                                                                                                                                           |
| ------ | ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`          | `health.ts` | Returns `{"status":"ok"}`                                                                                                                                                                                                                                             |
| `POST` | `/webhooks/jira`   | `jira.ts`   | Jira webhook — handles `jira:issue_created`, `jira:issue_deleted`; ignores `jira:issue_updated`. Resolves tenant from `jira_project_key`, verifies HMAC-SHA256 signature (tenant secret → env fallback). Creates task + fires `engineering/task.received` to Inngest. |
| `POST` | `/webhooks/github` | `github.ts` | GitHub webhook stub — always returns `{received:true, stub:true}`. Not active in MVP.                                                                                                                                                                                 |

---

### Slack OAuth Routes (no auth)

| Method | Path                               | File             | Description                                                                                                                                                                             |
| ------ | ---------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/slack/install?tenant=<tenantId>` | `slack-oauth.ts` | Generates HMAC-signed state token, redirects to `slack.com/oauth/v2/authorize` with scopes: `channels:history,groups:history,groups:read,chat:write,chat:write.public`                  |
| `GET`  | `/slack/oauth_callback`            | `slack-oauth.ts` | Verifies state, exchanges code for token, stores encrypted `slack_bot_token` in `tenant_secrets`, upserts `tenant_integrations`. 409 if workspace already attached to different tenant. |

---

### Admin Routes (X-Admin-Key required)

Auth: `requireAdminKey` middleware — timing-safe comparison of `X-Admin-Key` header against `ADMIN_API_KEY` env var. Returns 401 on missing/wrong key.

**Tenant CRUD** (`admin-tenants.ts`):

| Method   | Path                               | Description                                                           |
| -------- | ---------------------------------- | --------------------------------------------------------------------- |
| `POST`   | `/admin/tenants`                   | Create tenant. Returns 201 with `install_link`. 409 on slug conflict. |
| `GET`    | `/admin/tenants`                   | List tenants. `?include_deleted=true` to include soft-deleted.        |
| `GET`    | `/admin/tenants/:tenantId`         | Get single tenant. `?include_deleted=true` supported.                 |
| `PATCH`  | `/admin/tenants/:tenantId`         | Update tenant name/status/config (full replace of config).            |
| `DELETE` | `/admin/tenants/:tenantId`         | Soft-delete tenant. Returns `{id, deleted_at}`.                       |
| `POST`   | `/admin/tenants/:tenantId/restore` | Restore soft-deleted tenant. 404 if not found. 409 if slug collision. |

**Tenant Secrets** (`admin-tenant-secrets.ts`):

| Method   | Path                                    | Description                                                    |
| -------- | --------------------------------------- | -------------------------------------------------------------- |
| `GET`    | `/admin/tenants/:tenantId/secrets`      | List secret keys (not values — AES-256-GCM encrypted at rest). |
| `PUT`    | `/admin/tenants/:tenantId/secrets/:key` | Set/upsert a secret value. Body: `{value: string}`.            |
| `DELETE` | `/admin/tenants/:tenantId/secrets/:key` | Delete a secret. 404 if key not found.                         |

**Tenant Config** (`admin-tenant-config.ts`):

| Method  | Path                              | Description                          |
| ------- | --------------------------------- | ------------------------------------ |
| `GET`   | `/admin/tenants/:tenantId/config` | Get tenant config JSON.              |
| `PATCH` | `/admin/tenants/:tenantId/config` | Deep-merge patch into tenant config. |

**Projects** (`admin-projects.ts`):

| Method   | Path                                    | Description                                                           |
| -------- | --------------------------------------- | --------------------------------------------------------------------- |
| `POST`   | `/admin/tenants/:tenantId/projects`     | Create project. 409 on conflict.                                      |
| `GET`    | `/admin/tenants/:tenantId/projects`     | List all projects for tenant.                                         |
| `GET`    | `/admin/tenants/:tenantId/projects/:id` | Get single project.                                                   |
| `PATCH`  | `/admin/tenants/:tenantId/projects/:id` | Update project.                                                       |
| `DELETE` | `/admin/tenants/:tenantId/projects/:id` | Delete project. 409 if active tasks exist (`activeTaskIds` returned). |

**Employee + Tasks** (`admin-employee-trigger.ts`, `admin-tasks.ts`):

| Method | Path                                               | Description                                                                                                                                                                                                 |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/admin/tenants/:tenantId/employees/:slug/trigger` | Trigger employee. `?dry_run=true` to validate without creating task. Returns 202 + `{task_id, status_url}` or 200 `{valid:true, would_fire:{...}}`. 404 if archetype not found. 501 if unsupported runtime. |
| `GET`  | `/admin/tenants/:tenantId/tasks/:id`               | Get task status. Tenant-scoped (404 on cross-tenant). Returns `{id, status, source_system, external_id, archetype_id, created_at, updated_at}`.                                                             |

**Knowledge Base** (`admin-kb.ts`):

| Method   | Path                                           | Description                                                       |
| -------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `POST`   | `/admin/tenants/:tenantId/kb/entries`          | Create KB entry. 409 on conflict.                                 |
| `GET`    | `/admin/tenants/:tenantId/kb/entries`          | List KB entries. Filterable by `?entity_type=` and `?entity_id=`. |
| `GET`    | `/admin/tenants/:tenantId/kb/entries/:entryId` | Get single KB entry.                                              |
| `PATCH`  | `/admin/tenants/:tenantId/kb/entries/:entryId` | Update KB entry content.                                          |
| `DELETE` | `/admin/tenants/:tenantId/kb/entries/:entryId` | Delete KB entry.                                                  |

**Total admin routes: 23** (6 tenant, 3 secrets, 2 config, 5 projects, 2 employee+tasks, 5 KB)

---

### Inngest

| Method         | Path           | Description                                                                               |
| -------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `GET/POST/PUT` | `/api/inngest` | Inngest serve endpoint — registered via `inngestServeRoutes()` mounted at `/api/inngest`. |

---

### Slack Bolt Handlers (Socket Mode)

All handlers registered in `registerSlackHandlers()` in `src/gateway/slack/handlers.ts`.

#### Event Handlers

| Event         | Condition                                            | Action                                                                                                                                                                 |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`     | Thread reply (not top-level, not bot, has text+user) | Looks up `taskId` from `deliverables` table by `approval_message_ts`. Sends `employee/interaction.received` with `source: 'thread_reply'` to Inngest.                  |
| `app_mention` | Any @mention                                         | Strips `<@BOTID>` from text, resolves `tenantId` from Slack team via `tenant_integrations`. Sends `employee/interaction.received` with `source: 'mention'` to Inngest. |

Both events route to the **unified interaction handler** (`employee/interaction.received`) — PLAT-10 complete. The Bolt event registrations still use separate `boltApp.event('message')` and `boltApp.event('app_mention')` but they both emit the same Inngest event name.

#### Action Handlers (registered `boltApp.action()`)

| Action ID            | Button Label      | Description                                                                                                                                        | Inngest Event Fired                                                         |
| -------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `approve`            | ✅ Approve & Post | Summary approval (internal staff flow). Inline ack with "⏳ Processing approval...". Idempotency check: only fires if task status === `Reviewing`. | `employee/approval.received` `{action:'approve', taskId, userId, userName}` |
| `reject`             | ❌ Reject         | Summary rejection (internal staff flow). Inline ack with "⏳ Processing rejection...". Same idempotency check.                                     | `employee/approval.received` `{action:'reject', taskId, userId, userName}`  |
| `guest_approve`      | ✅ Approve & Send | Guest message approval (Hostfully guest flow). Same ack pattern + idempotency.                                                                     | `employee/approval.received` `{action:'approve', taskId, userId, userName}` |
| `guest_edit`         | ✏️ Edit & Send    | Opens `guest_edit_modal` Slack modal. Value can be JSON `{taskId, draftResponse}` or plain taskId.                                                 | _(modal submission fires event)_                                            |
| `guest_reject`       | ❌ Reject         | Opens `guest_reject_modal` Slack modal with optional rejection reason input.                                                                       | _(modal submission fires event)_                                            |
| `guest_reply_anyway` | 💬 Reply Anyway   | For superseded/no-action messages. Inline ack "⏳ Processing Reply Anyway...". Idempotency: fires if task NOT in `['Done','Failed','Cancelled']`.  | `employee/reply-anyway.requested` `{taskId, userId, userName}`              |
| `rule_confirm`       | ✅ Confirm        | Confirms a proposed learned rule. Updates `learned_rules` table via PostgREST: `status='confirmed', confirmed_at`.                                 | _(direct DB update, no Inngest)_                                            |
| `rule_reject`        | ❌ Reject         | Rejects a proposed learned rule. Updates `learned_rules` table: `status='rejected'`.                                                               | _(direct DB update, no Inngest)_                                            |
| `rule_rephrase`      | ✏️ Rephrase       | Opens `rule_rephrase_modal` with current rule text pre-populated. Fetches from `learned_rules` via PostgREST.                                      | _(modal submission patches DB)_                                             |

#### View (Modal) Handlers (registered `boltApp.view()`)

| View Callback ID      | Description                                                                                                                                                                                                           | Inngest Event Fired                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `guest_edit_modal`    | Edit & send modal submission. Validates non-empty text. Idempotency check. Updates original Slack message to "⏳ Processing edited response...".                                                                      | `employee/approval.received` `{action:'approve', taskId, userId, userName, editedContent}`   |
| `guest_reject_modal`  | Reject modal submission. Captures optional rejection reason. Idempotency check. Updates original message to "⏳ Processing rejection...".                                                                             | `employee/approval.received` `{action:'reject', taskId, userId, userName, rejectionReason?}` |
| `rule_rephrase_modal` | Rephrase rule modal submission. Updates `learned_rules.rule_text` via PostgREST. Then fetches `slack_ts + slack_channel` and updates the original Slack message with new rule text + confirm/reject/rephrase buttons. | _(direct DB update, no Inngest)_                                                             |

#### Ack Pattern

The ⏳ Processing ack pattern (used by `approve`, `reject`, `guest_approve`, `guest_reply_anyway`):

```typescript
await (ack as any)({
  replace_original: true,
  text: '⏳ Processing...',
  blocks: [
    { type: 'section', text: { type: 'mrkdwn', text: '⏳ Processing...' } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
  ],
});
```

This embeds the ⏳ state directly in the Socket Mode ack envelope — no separate `respond()` call needed for the processing state, eliminating flash.

#### Idempotency

- **approve/reject/guest_approve/guest_edit_modal/guest_reject_modal**: Check task status === `'Reviewing'` via PostgREST before firing. If not Reviewing, show "⚠️ This summary has already been processed."
- **guest_reply_anyway**: Check task status NOT IN `['Done','Failed','Cancelled']`. If already resolved, show "⚠️ This notification has already been resolved."
- **Inngest event dedup**: `approve`/`reject`/`guest_approve`/`guest_edit_modal`/`guest_reject_modal` use `id: \`employee-approval-${taskId}\`` for Inngest event deduplication. `guest_reply_anyway` uses `id: \`employee-reply-anyway-${taskId}\``.

---

### Message Format Standards

**Task ID context block** — required on every Slack message:

```json
{ "type": "context", "elements": [{ "type": "mrkdwn", "text": "Task `<taskId>`" }] }
```

Present on all ack payloads, error recovery payloads, and all three modal update messages.

**User attribution** — `<@userId>` mrkdwn syntax, NOT raw username. Used in `rule_confirm`/`rule_reject` confirmation blocks: `"✅ Rule confirmed by <@${user.id}>"`.

---

### Button Block Definitions (constants in handlers.ts)

Three button set constants:

- `BUTTON_BLOCKS(taskId)` — `approve` + `reject` (internal summary review)
- `GUEST_BUTTON_BLOCKS(taskId)` — `guest_approve` + `guest_edit` + `guest_reject` (Hostfully guest message review)
- `NO_ACTION_BUTTON_BLOCKS(taskId)` — `guest_reply_anyway` only (shown when no action available / message superseded)

---

## Route Count Summary

- **Health**: 1
- **Webhooks**: 2 (jira, github)
- **Slack OAuth**: 2 (install, callback)
- **Admin**: 23 (6 tenant, 3 secrets, 2 config, 5 projects, 2 employee+tasks, 5 KB)
- **Inngest**: 1 (`/api/inngest`)
- **Total HTTP routes**: 29

**Slack Bolt**:

- Events: 2 (`message`, `app_mention`)
- Actions: 9 (`approve`, `reject`, `guest_approve`, `guest_edit`, `guest_reject`, `guest_reply_anyway`, `rule_confirm`, `rule_reject`, `rule_rephrase`)
- Views: 3 (`guest_edit_modal`, `guest_reject_modal`, `rule_rephrase_modal`)

---

## Changes from April 24 Doc

The April 24 doc stated **18 admin routes**. Current count is **23 admin routes** — the 5 KB routes (`/admin/tenants/:tenantId/kb/entries` CRUD) appear to have been added since April 24.

**New Slack actions (not in old doc)**:

- `guest_approve` — Hostfully guest message approval
- `guest_edit` — opens edit modal
- `guest_reject` — opens reject modal
- `guest_reply_anyway` — reply anyway for superseded messages (GM-16)
- `rule_confirm` / `rule_reject` / `rule_rephrase` — learned rules review flow
- Views: `guest_edit_modal`, `guest_reject_modal`, `rule_rephrase_modal`

**Interaction handler unification (PLAT-10 complete)**:

- Both `message` and `app_mention` Bolt events now emit `employee/interaction.received` (unified event name)
- Old doc described separate `employee/feedback.received` and `employee/mention.received` events — these are replaced

**`guest_reply_anyway` fires `employee/reply-anyway.requested`** (not `employee/approval.received`) — spawns re-draft machine per lifecycle.

## Unresolved

- No Hostfully webhook route found in `src/gateway/routes/`. Guest message flows go through Slack buttons only, not a Hostfully-inbound HTTP endpoint.
- `inngestServeRoutes()` registration detail — mounted at `/api/inngest`; Inngest dev server proxies to this.
