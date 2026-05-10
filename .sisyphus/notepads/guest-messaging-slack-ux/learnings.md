# Learnings — guest-messaging-slack-ux

## [2026-05-09] Session Start

### Key File Locations

- `src/lib/hostfully-enrichment.ts` — 72 lines; `fetchLeadEnrichment()` hardcodes `propertyName: null` at line 64
- `src/lib/slack-blocks.ts` — 149 lines; existing block builders; `buildSupersededBlocks()` at line 3 has no taskId param and no context block
- `src/worker-tools/slack/post-guest-approval.ts` — 397 lines; approval card builder + CLI tool
- `src/inngest/employee-lifecycle.ts` — 2000 lines; universal lifecycle

### Hostfully API Pattern (from get-property.ts)

- Base URL: `https://api.hostfully.com/api/v3.2` (same as enrichment.ts)
- Property endpoint: `GET ${baseUrl}/properties/${propertyId}`
- Headers: `{ 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' }`
- Response: `propertyJson.property ?? propertyJson` → `property.name` is the display name
- Lead endpoint already used: `GET ${baseUrl}/leads/${leadUid}` — returns `propertyUid` field

### Slack Block Patterns (from existing slack-blocks.ts)

- All block builders return `unknown[]` (not `KnownBlock[]`) — match this pattern
- Context block format: `{ type: 'context', elements: [{ type: 'mrkdwn', text: 'Task \`${taskId}\`' }] }`
- Slack date format: `<!date^{epoch}^{date_short_pretty} at {time}|${isoFallback}>`
- Epoch = `Math.floor(Date.now() / 1000)` (Unix seconds)

### VLRE Reference Patterns (from vlre-employee/skills/slack-blocks/blocks.ts)

- Terminal state compact line: `🏠 *${propertyName}*  |  *Guest:* ${guestName}  |  *Dates:* ${checkIn} – ${checkOut}`
- Approved state: `✅ *Approved and sent* by <@${userId}> — <!date^${epoch}^{time}|just now>`
- Rejected state: `❌ *Rejected* by <@${userId}> — <!date^${epoch}^{time}|just now>`
- Hostfully link in context: `<https://platform.hostfully.com/app/#/inbox?threadUid=${threadUid}&leadUid=${leadUid}|🔗 View in Hostfully>`
- Hostfully URL button: `{ type: 'button', text: { type: 'plain_text', text: '🔗 View in Hostfully', emoji: true }, action_id: 'view_in_hostfully', url: '...' }`

### post-guest-approval.ts Output JSON (MUST NOT CHANGE EXISTING FIELDS)

Current fields in `/tmp/approval-message.json`:

- ts, channel, conversationRef, approval_message_ts, target_channel, conversation_ref
- task_id, guest_name, property_name, category, confidence
- lead_uid, thread_uid, message_uid, original_message, draft_response
- check_in, check_out, booking_channel, urgency
- NEW to add: lead_status (additive only)

### Critical Constraints

- `employee-lifecycle.ts` MUST stay employee-agnostic — gate on metadata field existence, NOT role_name
- No Inngest step renames — step names are immutable idempotency keys
- Property name fetch MUST have ≤2s timeout (AbortController with 2000ms)
- `buildSupersededBlocks()` called from 2 locations in lifecycle — fix function signature, update both call sites
