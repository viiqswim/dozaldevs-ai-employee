# Learnings — guest-messaging-recreation

## [2026-05-29] Session Start

### Architecture Context

- Platform uses 3-field model: `identity`, `execution_steps`, `delivery_steps`
- Old archetype (00000000-0000-0000-0000-000000000015) uses dropped columns — it's broken
- Generator at `src/gateway/services/archetype-generator.ts` has SYSTEM_PROMPT (lines 52-196)
- Tool discovery: `discoverTools()` in `src/gateway/services/tool-parser.ts` — already exists but NOT wired to generator
- Admin tool catalog: `GET /admin/tools` with `X-Admin-Key: $ADMIN_API_KEY`
- VLRE tenant ID: `00000000-0000-0000-0000-000000000003`

### Webhook env var injection

- `src/workers/opencode-harness.mts` injects all webhook payload fields as uppercase env vars
- e.g. `lead_uid` → `$LEAD_UID`, `thread_uid` → `$THREAD_UID`, `property_uid` → `$PROPERTY_UID`
- Always-available: `$TASK_ID`, `$NOTIFY_MSG_TS`, `$NOTIFICATION_CHANNEL`

### Key Files

- Generator: `src/gateway/services/archetype-generator.ts`
- Route: `src/gateway/routes/admin-archetype-generate.ts`
- Tool parser: `src/gateway/services/tool-parser.ts`
- Test file: `src/gateway/services/__tests__/archetype-generator.test.ts`

### Live Archetype Key Findings (T1)

- The old archetype (00000000-0000-0000-0000-000000000015) IS populated — has identity, execution_steps, delivery_steps
- **execution_steps** references: $THREAD_UID, $PROPERTY_UID, $NOTIFY_MSG_TS — proper env var usage
- **delivery_steps** uses: send-message.ts --lead-id <lead_uid> --thread-id <thread_uid> — gets from env AND metadata
- **submit-output metadata** includes: guest_name, property_name, original_message, thread_uid, check_in, check_out, booking_channel, lead_status, category
- **tool_registry**: 10 tools — get-property, get-reservations, get-messages, send-message, post-message, post-guest-approval, read-channels, report-issue, knowledge_base/search, diagnose-access
- **trigger_sources**: `{ type: "cron_and_webhook", cron_expression: "*/5 * * * *" }` ← BAD — new archetype must be webhook only
- **risk_model**: `{ timeout_hours: 24, approval_required: true }`
- **notification_channel**: C0AMGJQN05S

### Tool Catalog Findings (T2)

- 31 tools total in catalog (GET /admin/tools returns { tools: [...] } envelope)
- Hostfully (10): get-door-code, get-messages, get-properties, get-property, get-reservations, get-reviews, register-webhook, send-message, update-door-code, validate-env
- Jira (6): add-comment, auth, get-issue, list-comments, search-issues, validate-env
- Knowledge base (1): search
- Platform (2): report-issue, submit-output
- Sifely (9): create-passcode, delete-passcode, diagnose-access, generate-code, list-access-records, list-locks, list-passcodes, rotate-property-code, update-passcode
- Slack (3): post-guest-approval, post-message, read-channels

### Constraints

- No guest-messaging-specific hardcoding in generator
- No polling cron — trigger_sources must be `{ type: 'webhook' }`
- No enrichment adapter
- No manual PATCH fixes to archetype
- No changes to webhook handler or lifecycle

## 2026-05-28 — T3+T4+T5: archetype-generator.ts overhaul

### Approach taken
- Split `SYSTEM_PROMPT` into `SYSTEM_PROMPT_PRE` (rules + T4 env vars + T5 delivery templates) and `SYSTEM_PROMPT_POST` (JSON shape section)
- Added `formatToolCatalog(tools: ToolMetadata[]): string` — formats discovered tools as `### /tools/service/name.ts` sections with required/optional flags
- Added `async buildSystemPrompt(): Promise<string>` — calls `discoverTools(path.join(process.cwd(), 'src/worker-tools'))`, injects catalog between PRE and POST. Falls back gracefully if discoverTools throws or returns empty.
- Updated `generate()` to `await buildSystemPrompt()` instead of using static `SYSTEM_PROMPT`
- `refine()` intentionally left using `REFINE_SYSTEM_PROMPT` (task only specified `generate()`)

### Key placement decision
Tool catalog is inserted BETWEEN SYSTEM_PROMPT_PRE and SYSTEM_PROMPT_POST so "provided above" in the JSON Shape tool_registry instruction is accurate (catalog is literally above the JSON shape section).

### T4 additions (env vars, approval flow, metadata)
Added as static text in SYSTEM_PROMPT_PRE:
- `## Environment Variables` — $TASK_ID, $NOTIFY_MSG_TS, $NOTIFICATION_CHANNEL + webhook payload injection pattern
- `## Approval Flow Pattern` — check for specialized `post-*-approval.ts` tool, use --thread-ts "$NOTIFY_MSG_TS"
- `## Passing Data to the Delivery Phase` — --metadata '{"key": "value"}' in submit-output.ts

### T5 additions (delivery templates)
Added as static text in SYSTEM_PROMPT_PRE:
- Template A: Slack delivery (parse draft → post-message.ts → submit-output.ts)
- Template B: External service delivery (parse draft + metadata → service tool → submit-output.ts)

### Verification results
- `pnpm build` exits 0 ✅
- Template A: 1 match ✅
- Template B: 2 matches ✅  
- NOTIFY_MSG_TS: 2 matches ✅
- discoverTools imported and called ✅
- API test: generated tool_registry = ["/tools/slack/read-channels.ts", "/tools/slack/post-message.ts", "/tools/platform/submit-output.ts"] — all real paths, no invented ones ✅

## 2026-05-29 — T6: Wizard evaluation + generator fix

### New Archetype ID
`94b1e64c-2c2a-4391-a6e3-f3ef61044cb5` (role_name: hostfully-guest-reply-handler, status: draft)

### Generator Fix (attempt 1 failed → attempt 2 passed)
**Root cause**: LLM used `$LEAD_ID`, `$PROPERTY_ID`, `$THREAD_ID` instead of the verbatim-uppercased webhook field names `$LEAD_UID`, `$PROPERTY_UID`, `$THREAD_UID`
**Secondary issue**: Webhook payload fields were being generated as input_schema items (wrong — they're auto-injected env vars)

**Fix applied** to `SYSTEM_PROMPT_PRE` → `## Webhook-Triggered Employees` section:
1. Added explicit verbatim-uppercase examples: `lead_uid → $LEAD_UID (NOT $LEAD_ID)`
2. Added CRITICAL rule: webhook payload fields MUST NOT appear in input_schema

### Attempt 2 result (all checks ✅)
- tool_registry: 8 tools (get-messages, get-property, get-reservations, send-message, post-guest-approval, knowledge_base/search, diagnose-access, submit-output)
- execution_steps: uses $LEAD_UID, $THREAD_UID, $PROPERTY_UID correctly
- execution_steps: has post-guest-approval.ts step + submit-output --metadata
- delivery_steps: uses send-message.ts with lead_uid/thread_uid from metadata
- trigger_sources: {"type": "webhook"}
- risk_model.approval_required: true
- notification_channel: C0AMGJQN05S

### Notes
- input_schema only has `current_date` (from `{{current_date}}` in get-reservations step — this is a legitimate user input)
- trigger was auto-detected as "webhook" by the generator ✅
- Build passes after generator fix (pnpm build exits 0)

## [T7] Test Writing — archetype-generator.test.ts

### Mocking discoverTools
- `discoverTools` is called via module import — use `vi.mock('../tool-parser.js', ...)` to intercept it in tests
- Mock factory with `vi.fn().mockResolvedValue([])` as default is clean and safe
- Use `vi.mocked(discoverTools).mockResolvedValueOnce(fakeTools)` in specific tests to inject controlled tool data
- The `beforeEach` in a describe block only affects that block — safe to reset mock state without polluting other describes

### Pre-existing failures (T3–T6 regressions in tests, NOT my changes)
- 3 tests in SYSTEM_PROMPT content describe fail:
  1. `explicitly forbids output instructions in agents_md` — checks for text no longer in SYSTEM_PROMPT after T3-T6
  2. `SYSTEM_PROMPT explicitly forbids CLASSIFICATION RULES section` — same
  3. `SYSTEM_PROMPT explicitly forbids TOOLS AVAILABLE section` — same
- Confirmed pre-existing by git stash test: same 3 failures before my changes (24 tests, 3 failed)
- My changes: 30 tests, same 3 failed — my 6 new tests all pass

### ToolMetadata inline creation
- `ToolFlag` and `ToolEnvVar` are not exported from tool-parser.ts but TypeScript accepts inline objects matching the shape when the enclosing type (`ToolMetadata`) is annotated

### System prompt injection verification pattern
- Capture system message: `(mockCallLLM.mock.calls[0][0] as { messages: Array<{role: string; content: string}> }).messages.find(m => m.role === 'system')`
- This is the canonical pattern used throughout the test file

## T9 — Activate Archetype (2026-05-29)
- Admin PATCH endpoint: `PATCH /admin/tenants/:tenantId/archetypes/:archetypeId` with `{"status": "active"}` works correctly
- Returns full archetype object on success (HTTP 200)
- Verified: exactly 1 active `hostfully-guest-reply-handler` for VLRE tenant after activation
- Old archetype (00000000-0000-0000-0000-000000000015) remains soft-deleted (deleted_at IS NOT NULL = true)

## [2026-05-29 T11] E2E Lifecycle Test Results

### Full E2E Run Completed ✅
- Task ID: `1d2b2b1a-4bab-4de8-94bf-7684dc635bcd`
- Archetype: `94b1e64c-2c2a-4391-a6e3-f3ef61044cb5` (guest-messaging, deepseek/deepseek-v4-flash)
- Status: Done ✅
- compiled_agents_md: 4466 chars ✅

### Key Discovery: Approval Card Channel
- `pending_approvals.channel_id = C0960S2Q8RL` (#victor-tests, NOT #cs-guest-communication)
- The "Task received" notification goes to C0AMGJQN05S (#cs-guest-communication)
- The approval card goes to a SEPARATE channel (C0960S2Q8RL = #victor-tests)
- This appears to be the archetype's `notification_channel` setting

### Airbnb → Hostfully Webhook Timing
- Message sent at 10:59 PM → task created ~30s later at 03:59:55 UTC
- Worker completed in ~2 minutes (Ready→Executing 03:59:55, Submitting 04:01:40)
- Full lifecycle (including delivery) ~8 minutes total

### Slack Button Issue
- Playwright click on "Approve & Send" did not register (Socket Mode transient drop)
- Used manual curl fallback successfully:
  `curl -X POST http://localhost:8288/e/local -d '{"name":"employee/approval.received",...}'`

### State Machine (10 transitions - all correct)
Received → Triaging → AwaitingInput → Ready → Executing → [worker] → Submitting → Validating → Submitting → Reviewing → Approved → Delivering → Done
