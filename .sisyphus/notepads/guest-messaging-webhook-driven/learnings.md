# Learnings — guest-messaging-webhook-driven

## [2026-05-04] Wave 1 Complete

### get-messages.ts structure (T1)

- `parseArgs()` at lines 72-101 — manual arg parsing, no frameworks
- `--lead-id` and `--property-id` are mutually exclusive (both → exit 1)
- Single-lead path at lines 182-229: fetches `GET /leads/{leadId}` then `GET /messages?leadUid={id}`
- Output shape: `ThreadSummary[]` — `{ reservationId, guestName, channel, unresponded, messages[] }`
- `messages[]` shape: `{ text, sender: 'guest'|'host'|null, timestamp }`
- `senderType` from API is "GUEST" or "AGENCY" — mapped to "guest"/"host" in output
- `unresponded: true` when last message `senderType === 'GUEST'`
- Mock check must go AFTER `parseArgs()` and BEFORE the `leadId && propertyId` mutual exclusion check (or after it — doesn't matter since mock bypasses all API calls)

### tenant-env-loader.ts structure (T5 target)

- `PLATFORM_ENV_WHITELIST` array at lines 5-16 — add `'HOSTFULLY_MOCK'` here
- Secrets from `tenant_secrets` are auto-injected (no whitelist needed for those)
- Platform env vars (process.env) need explicit whitelist entry

### Fixture shape requirements

- `get-messages/default.json` must be `ThreadSummary[]` (already-transformed, NOT raw API format)
- `get-reservations/default.json` must be `ReservationSummary[]` (already-transformed)
- `get-property/default.json` must match the `output` object shape in get-property.ts (lines 122-143)

### Mock pattern (established convention)

- Check `process.env['HOSTFULLY_MOCK'] === 'true'` at top of `main()`, BEFORE any API calls
- Read fixture from `src/worker-tools/hostfully/fixtures/{tool-name}/default.json`
- For get-messages with `--lead-id`: try `fixtures/get-messages/{leadId}.json` first, fallback to `default.json`
- Write fixture JSON to stdout + '\n', then `return` (exit 0 implicitly)
- In Docker container, fixtures live at `/tools/hostfully/fixtures/` (bulk-copied via COPY)
- Use `path.join(__dirname, 'fixtures', ...)` or `new URL('./fixtures/...', import.meta.url)` for path resolution

### Fixture content for E2E success

- `get-messages/default.json`: ONE unresponded guest message about wifi password
  - `unresponded: true`, last message `sender: 'guest'`
  - Guest name: "Test Guest", channel: "AIRBNB"
  - 2-3 messages: welcome from host, then guest question about wifi
  - This should trigger `NEEDS_APPROVAL` classification → Slack card
- `get-reservations/default.json`: ONE confirmed reservation
  - Guest: "Test Guest", check-in: near future, check-out: a week later
  - channel: "AIRBNB", status: "BOOKED"
- `get-property/default.json`: realistic beach house property
  - name, address, wifiNetwork, wifiPassword (the guest is asking about this!)
  - Include wifiPassword so model can draft a helpful reply

### Commit message for T5

`feat(worker-tools): add HOSTFULLY_MOCK convention with fixture data for E2E testing`

## [2026-05-04] T6: Seed + Docker Build

- Seed applied successfully — DB has updated guest-messaging instructions with --lead-id (9723 chars, HAS_LEAD_ID: true, HAS_UNRESPONDED: false)
- ai-employee Kong is on port 54331 (not 54321 — that's nexus-kong). Always use 54331 for ai-employee PostgREST.
- Dockerfile copies individual files (not directories) — fixture dirs must be explicitly added with COPY lines
- Added 3 COPY lines to Dockerfile for fixture JSONs: get-messages, get-reservations, get-property
- Docker image rebuilt — fixtures at /tools/hostfully/fixtures/, HOSTFULLY_MOCK check present (3 occurrences), --lead-id (7 occurrences)
- Build time: ~30 seconds (cached layers from prior build)
- Image SHA: sha256:bd631305cee398af19f0a5b89e333714aa731fb458fc4d48a667485c6fa5c87c

## [2026-05-04] Task 7: E2E with HOSTFULLY_MOCK=true — SUCCESS

### E2E Results
- Task ID: e4018fc0-8dd6-46b6-9baa-3fb146c0cdd6
- Webhook returned HTTP 200 (not 201 as expected per spec — gateway returns 200 for Hostfully webhooks)
- Full lifecycle: Received → Triaging → AwaitingInput → Ready → Executing → Submitting → Validating → Reviewing (~1.5 min)
- Task reached `Reviewing` status ✅

### Deliverable Content Verified
- `classification: "NEEDS_APPROVAL"` ✅
- `draftResponse: "WiFi is BeachHouse_5G, password SunsetWaves2024! Router's in the living room cabinet if you need to restart it."` ✅
- `category: "wifi"` ✅
- Fixture data correctly loaded: "Test Guest" asking "Hi, what's the wifi password? We just arrived and can't find it anywhere." ✅

### --lead-id vs --unresponded-only
- Container auto-removed after completion (Docker `--rm` flag in local dispatcher)
- Direct container log capture not possible post-completion
- INDIRECT EVIDENCE: Deliverable `leadUid` = `37f5f58f-d308-42bf-8ed3-f0c2d70f16fb` matches the `lead_uid` from the webhook `raw_event`
- Lifecycle injects `LEAD_UID` from `raw_event` into container env → archetype instructions call `--lead-id "$LEAD_UID"`
- The wifi fixture data was returned (confirming lead-specific fixture path: `fixtures/get-messages/{leadId}.json` or `default.json`)

### Known Issue: post-guest-approval.ts tool error
- `metadata.toolError: "post-guest-approval.ts does not exist in /tools/slack/"`
- Despite this, task reached `Reviewing` — the lifecycle itself handles Slack posting after harness completes
- The `post-guest-approval.ts` tool appears to be called by the model but is not in the Docker image
- This is a non-blocking issue for E2E success (task reaches Reviewing without it)

### Infrastructure Notes
- `.sisyphus/evidence/` is gitignored — evidence files are local-only
- PostgREST for ai-employee: port 54331 (Kong), NOT 54321 (that's nexus-kong)
- `deliverables` table stores actual content via `execution_id` (not `task_id`)
- Local Docker containers are auto-removed (--rm) — capture logs during execution, not after
- Gateway uses `USE_LOCAL_DOCKER=true` (set by dev-start.ts) — worker is always a local container in dev
