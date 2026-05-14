# Guest-Messaging Employee (VLRE) — Operational Details

> This document is loaded on-demand. For platform-wide rules, see AGENTS.md.

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
Hostfully NEW_INBOX_MESSAGE webhook  ─┐
  → POST /webhooks/hostfully          │  Both paths converge on the same
Polling cron (every 15 min)         ─┘  universal lifecycle below
  → trigger/guest-message-poll
    → polls all leads (any status: NEW, BOOKED, CLOSED) via Hostfully API
    → creates tasks for unresponded threads without an active task
      → external_id: hostfully-poll-{lead_uid}-{YYYY-MM-DD} (one per lead per day)

Webhook path:
  → POST /webhooks/hostfully
    → match tenant by agency_uid (tenant.config.guest_messaging.hostfully_agency_uid)
    → find archetype by { tenant_id, role_name: 'guest-messaging' }
    → prisma.task.create → inngest.send('employee/task.dispatched')

Both paths → universal lifecycle:
  → pre-check: if last message in thread is from host (senderType=AGENCY) → task goes Received → Done (no worker, no Slack)
  → otherwise → local Docker / Fly.io worker → OpenCode
    → model calls get-messages.ts --lead-id "$LEAD_UID" (Hostfully API)
    → NEEDS_APPROVAL → post-guest-approval.ts → Slack card → PM approves → send-message.ts → Hostfully
    → NO_ACTION_NEEDED → task goes to Submitting → auto-completes
```

**CRITICAL gotcha — webhook is a trigger only**: The model fetches the specific lead's conversation using `get-messages.ts --lead-id "$LEAD_UID"`. The `LEAD_UID` env var is injected by the lifecycle from the webhook `raw_event`. If `LEAD_UID` is not set, `get-messages.ts` falls back to scanning all leads — but this should not happen on the webhook path. If no unresponded messages exist in Hostfully at execution time, the model returns `NO_ACTION_NEEDED` regardless of the webhook payload.

**CRITICAL gotcha — CLOSED leads do not fire webhooks**: Hostfully does NOT fire `NEW_INBOX_MESSAGE` webhooks for leads with status `CLOSED`. This is handled automatically by the `trigger/guest-message-poll` cron (every 15 min), which polls all leads regardless of status. Manual recovery is only needed for immediate response on a missed message: fire the webhook manually: `curl -X POST http://localhost:7700/webhooks/hostfully -H "Content-Type: application/json" -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"manual-<timestamp>","thread_uid":"<thread_uid>","lead_uid":"<lead_uid>","property_uid":"<property_uid>"}'`. If the thread has a zombie task stuck in `Submitting` (no pending approval, Inngest run long gone), manually mark it `Done` in the DB first: `UPDATE tasks SET status = 'Done', updated_at = NOW() WHERE id = '<task_id>' AND status = 'Submitting';`

**CRITICAL gotcha — lead type filter**: `get-messages.ts` includes all lead types except `BLOCK` (calendar blocks). This is intentional — Airbnb and other OTAs sometimes surface real stays as `INQUIRY` type in Hostfully, not `BOOKING`. Do not change the filter back to `type === 'BOOKING'`.

**CRITICAL gotcha — lead UID ≠ thread UID**: The model frequently confuses `lead_uid` and `thread_uid` when calling `post-guest-approval.ts --lead-uid ... --thread-uid ...`. These are DIFFERENT UUIDs from DIFFERENT fields — `lead_uid` (e.g. `29a64abd-...`) identifies the reservation/guest lead; `thread_uid` (e.g. `aef3d0cf-...`) identifies the Hostfully message thread. They are NEVER the same value. The archetype instructions include a CRITICAL warning about this distinction, and `post-guest-approval.ts` logs a stderr warning when both flags receive identical values. If the Slack approval card URL shows the wrong `threadUid`, this confusion is the cause.

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

## Hostfully Testing

Use these VLRE resources for all Hostfully-related testing:

| Resource     | ID / URL                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Thread       | `https://platform.hostfully.com/app/#/inbox?threadUid=2f18249a-9523-4acd-a512-20ff06d5c3fa&leadUid=37f5f58f-d308-42bf-8ed3-f0c2d70f16fb` |
| Thread UID   | `2f18249a-9523-4acd-a512-20ff06d5c3fa`                                                                                                   |
| Lead UID     | `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb`                                                                                                   |
| Property     | `https://platform.hostfully.com/app/#/property/c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                     |
| Property UID | `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`                                                                                                   |

**Owner's Airbnb guest test account**: Messages from the following thread are sent by the repo owner using a personal Airbnb guest test account — not a real guest. Do not treat these as production inquiries. Useful for end-to-end testing of the guest-messaging employee with a live Airbnb-sourced lead.

| Resource          | ID / URL                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Thread            | `https://platform.hostfully.com/app/#/inbox?threadUid=aef3d0cf-bc61-4f05-a3ce-1a4199ca336d&leadUid=29a64abd-d02c-44bc-8d5c-47df58a7ab14` |
| Thread UID        | `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`                                                                                                   |
| Lead UID          | `29a64abd-d02c-44bc-8d5c-47df58a7ab14`                                                                                                   |
| Property UID      | `562695df-6a4f-40d6-990d-56fe043aa9e8`                                                                                                   |
| Guest name        | Olivia (test account)                                                                                                                    |
| Lead status       | NEW · Type: INQUIRY · Channel: AIRBNB                                                                                                    |
| Airbnb thread URL | `https://www.airbnb.com/guest/messages/2525238359`                                                                                       |

### E2E Testing with Playwright Browser

During E2E testing sessions you can use the Playwright MCP browser to interact with both sides of the pipeline directly — no manual steps required. Open both URLs, log in once, and you have full visibility and control.

**Airbnb (guest side)** — send messages as Olivia from the test account:

- URL: `https://www.airbnb.com/guest/messages/2525238359`
- This is the Airbnb inbox thread that feeds into Hostfully thread `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`
- Type into the `textbox "Write a message..."` element and click Send

**Slack (PM approval side)** — monitor approval cards and approve/reject:

- Workspace: VLRE (`T06KFDGLHS6`)
- Channel: `#cs-guest-communication` — `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`
- Channel ID: `C0AMGJQN05S`
- Approval cards appear here; click **Approve** or **Reject** buttons directly in the browser

**Verified E2E flow — Scenario A (approve / happy path only)** — full scenario library in `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`. Confirmed working 2026-05-07:

| Step | What happens                                                                                                                                                                                                      | Where to observe                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1    | Send a new message as Olivia in the Airbnb thread                                                                                                                                                                 | Airbnb tab — `textbox "Write a message..."`                                                     |
| 2    | Airbnb notifies Hostfully; Hostfully fires `NEW_INBOX_MESSAGE` webhook to `POST /webhooks/hostfully`                                                                                                              | Gateway logs                                                                                    |
| 3    | Gateway matches tenant by `agency_uid`, finds `guest-messaging` archetype, creates task, emits `employee/task.dispatched`                                                                                         | Task appears in DB with status `Received`                                                       |
| 4    | Universal lifecycle starts — **pre-check** calls Hostfully messages API: if last message is from host (`senderType=AGENCY`) → task goes straight to `Done`, no worker spawned. If last is from guest → continues. | If `Done` in <5s, pre-check fired and found no action needed — expected if host already replied |
| 5    | Lifecycle transitions `Received → Ready → Executing` — local Docker / Fly.io worker spawns, OpenCode starts                                                                                                       | DB status = `Executing`                                                                         |
| 6    | Worker calls `get-messages.ts --lead-id "$LEAD_UID"` to fetch the full conversation for the specific guest lead from Hostfully API                                                                                | Worker logs inside Docker container                                                             |
| 7    | Worker drafts a reply, calls `post-guest-approval.ts` to post a Slack approval card to `#cs-guest-communication` with guest name, property, original message, and proposed response                               | Slack tab — approval card appears in channel                                                    |
| 8    | Task moves to `Reviewing` state; approval card shows **Approve & Send**, **Edit & Send**, **Reject** buttons                                                                                                      | DB status = `Reviewing`                                                                         |
| 9    | Click **Approve & Send** in the Slack thread                                                                                                                                                                      | Slack tab — card updates to "Approved by @Victor Dozal — delivering now."                       |
| 10   | Lifecycle receives `employee/approval.received` → delivers reply via Hostfully `send-message.ts`                                                                                                                  | Hostfully API call                                                                              |
| 11   | Reply appears in Airbnb thread from host ("Leo")                                                                                                                                                                  | Airbnb tab — reload/navigate to thread                                                          |
| 12   | Task marked `Done`                                                                                                                                                                                                | DB status = `Done`                                                                              |

**Key behaviors to know**:

- **Pre-check auto-completes**: If the last Hostfully message is from the host at the time the lifecycle runs, the task skips the worker and goes to `Done` immediately (~1s). This is correct — no reply needed.
- **Real webhooks fire automatically**: When Olivia sends a message on Airbnb, Hostfully fires a real `NEW_INBOX_MESSAGE` webhook to the registered URL. You do NOT need to fire it manually. The manual `curl` is only needed if the webhook is missed (e.g. CLOSED lead) or for isolated testing.
- **Polling cron as backup**: The `guest-message-poll` cron fires every 15 min and catches any unresponded messages that webhooks missed (common for CLOSED leads, which Hostfully silently drops webhooks for).
- **Approval card is in a thread**: The top-level channel message says "Task received — processing". The actual approval card (with Approve/Reject buttons) is posted as a **reply in the thread** — click "View thread" or "1 reply" to find it.
- **Check-in/Check-out may show TBD**: For INQUIRY-type leads that haven't been booked yet, dates are not confirmed and will appear as TBD in the approval card. This is expected.

**Checking pipeline state** without polling DB:

- Read the last few Slack messages — they show task outcome ("No action needed", approval card, or failure)
- Approval cards include the task ID in a context block at the bottom
- A task that goes `Done` in under 5 seconds = pre-check fired (last message was from host)

> For all approval paths (reject, edit & send, supersede, expiry, failure) and the full feedback pipeline (rule extraction, injection, consolidation, synthesis), see the E2E test guides in Reference Documents.

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

## External API Integration — Mandatory Practices

When adding a new external API endpoint or debugging a data quality issue from an API call, follow these rules:

1. **Raw response first** — before reading application code, run a live `node -e` or `curl` call to inspect the actual JSON shape. Wrong data from an API is almost always a shape mismatch, and the raw response reveals it immediately.
2. **Never bare `as T` on API JSON** — `(await res.json()) as RawType` silently accepts any shape at runtime. Use a wrapper-aware cast (`const json = await res.json() as { lead?: RawLead }; const lead = json.lead ?? (json as unknown as RawLead)`) or Zod validation.
3. **Expect and document the response envelope** — many APIs (including Hostfully) wrap single-resource responses: `{ "lead": {...} }`, `{ "property": {...} }`. List endpoints often use a different shape: `{ "leads": [...] }`. Verify both before writing parsing code. Comment the shape at the parse site.
4. **Scan existing patterns before adding new API calls** — a `?? fallback` or field rename near an API call documents a known quirk. Ask "why does this exist?" before writing similar code nearby.
5. **Make critical null loud** — if a critical field comes back `undefined` after parsing, log a warning with `Object.keys(response)`. Silent null propagation turns a one-line bug into a multi-session investigation.
6. **Add a shape smoke test** — when onboarding a new endpoint, add a manual integration test that asserts the live API returns the expected top-level shape.

Full guide with code examples and rationale: `docs/guides/2026-05-12-1731-api-integration-practices.md`
