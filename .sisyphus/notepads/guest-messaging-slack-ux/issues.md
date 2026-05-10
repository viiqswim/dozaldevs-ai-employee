# Issues — guest-messaging-slack-ux

## [2026-05-09] Known Bugs to Fix

### Bug 1: propertyName hardcoded null (hostfully-enrichment.ts:64)

- `fetchLeadEnrichment()` never calls properties API despite having `propertyUid`
- Fix: add second HTTP call to `GET ${baseUrl}/properties/${propertyUid}` with 2s timeout

### Bug 2: Expiry text copy-paste from summarizer (employee-lifecycle.ts ~line 1373)

- Text says `'⏰ Daily summary expired — no action taken.'`
- Fix: change to generic `'⏰ Expired — no action taken.'`

### Bug 3: buildSupersededBlocks missing task ID context block (slack-blocks.ts:3)

- Only returns a section block, no context block with task ID
- Fix: add `taskId: string` param, append context block

### Bug 4: Actor info erased at terminal state (employee-lifecycle.ts ~line 1705)

- "Approved by @X" state gets overwritten by "Delivered at {ISO}"
- Fix: merge actor + human timestamp in final delivered state

### Bug 5: Raw ISO timestamp (employee-lifecycle.ts ~line 1705)

- `✅ Delivered at ${new Date().toISOString()}` — not human-readable
- Fix: use Slack `<!date^>` format

### Bug 6: REPLY_BROADCAST only set for superseded tasks (employee-lifecycle.ts ~lines 622, 646)

- Should be set for ALL guest-messaging tasks
- Fix: gate on `rawEvent['thread_uid']` existence

### Bug 7: Approval card missing lead status field

- post-guest-approval.ts has no `--lead-status` arg
- Fix: add optional `--lead-status` arg + display in fields section

### Bug 8: No Hostfully deep-link on approval card

- Fix: add URL button `🔗 View in Hostfully` to actions row

### Bug 9: No context thread reply after approve/reject/edit

- Fix: post thread reply with full audit trail using buildContextThreadBlocks

### Bug 10: No Hostfully link on terminal states (notify-received message)

- Fix: use buildEnrichedTerminalBlocks with Hostfully link
