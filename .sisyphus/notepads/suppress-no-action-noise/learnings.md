# Learnings — suppress-no-action-noise

## [2026-05-07] Session Start

### Key Architecture Points

- `employee-lifecycle.ts` is a single large function (~1621 lines). All steps run as `step.run(...)` in sequence within it.
- Steps: load-task → triaging → notify-received → awaiting-input → ready → executing → poll-completion → check-classification → (if NO_ACTION_NEEDED) cleanup-no-action → post-override-card → wait-for-override
- Pre-check step must go AFTER `load-task` (line 128) and BEFORE `triaging` (line 141) — critical insertion point
- `roleName` is derived at line 163 inside `notify-received` step. For `post-override-card` (line 578), it needs to re-derive from `archetype.role_name` since it's inside a nested step.run() closure.

### Hostfully API Contract

- Endpoint: `GET /messages?leadUid={uid}&_limit=5` with header `X-HOSTFULLY-APIKEY: {key}`
- Response envelope: `{ messages: [...], _metadata: {...}, _paging: { _nextCursor: "..." } }`
- `senderType`: "GUEST" = inbound from guest, "AGENCY" = outbound from host
- Messages returned newest-first from API; sort by `createdUtcDateTime` to get chronological order
- Last message after sorting: if `senderType === 'AGENCY'` → host sent last → skip

### Tenant Secret Loading

- `loadTenantEnv()` in `src/gateway/services/tenant-env-loader.ts` auto-injects all `tenant_secrets` rows including `hostfully_api_key` → `HOSTFULLY_API_KEY`
- Pre-check needs Prisma client to call `loadTenantEnv()` — matches existing patterns (see lines 218-227)

### DB Connection

- PostgreSQL: `postgresql://postgres:postgres@localhost:54322/ai_employee`
- PostgREST/Kong: `http://localhost:54331`

### Monitor Archetype

- ID: `00000000-0000-0000-0000-000000000016`
- Role name: `unresponded-message-monitor`
- Fires every 30 min (48x/day), almost always no-op
- Registered in `src/gateway/inngest/serve.ts` lines 12, 36, 50

### classify-message.ts

- Early-exit path (lines 28-38): fires when deliverable starts with `NO_ACTION_NEEDED:`
- Bug: line 37 hardcodes `reasoning: 'Early exit — no messages to process'` instead of using actual text
- Fix: `responseText.trim().replace(/^NO_ACTION_NEEDED:\s*/, '').trim()` or `.slice('NO_ACTION_NEEDED:'.length).trim()`
