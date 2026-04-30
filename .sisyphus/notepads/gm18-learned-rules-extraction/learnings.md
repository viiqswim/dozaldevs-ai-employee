# Learnings — gm18-learned-rules-extraction

## Session ses_2248eada6ffegqIDQNNbElCmGu (2026-04-29)

### Architecture

- `employee/rule.extract-requested` event already emitted by PLAT-10 in 2 places — no consumer yet
- `archetypeId` available in lifecycle from `event.data` (L70) — safe to emit anywhere in approval block
- PostgREST grants auto-apply via `ALTER DEFAULT PRIVILEGES` — NO manual grants needed
- `callLLM` requires `model: 'anthropic/claude-haiku-4-5'` for classification/judge work (AGENTS.md)

### Key File Locations

- Lifecycle approval block: `employee-lifecycle.ts:674-717` (editedContent handling)
- Rejection path emission: `interaction-handler.ts:138-148`
- Feedback/teaching emission: `interaction-handler.ts:295-303`
- Slack action pattern: `handlers.ts:249-325` (approve/reject)
- Modal pattern: `handlers.ts:486-620` (guest_edit)
- Cron pattern: `triggers/feedback-summarizer.ts:27-124`
- Serve.ts: 9 functions currently, will become 11

### Schema Decisions

- `learned_rules` is a NEW table (not `knowledge_base_entries`)
- Columns: id, tenant_id, entity_type, entity_id, scope, rule_text, source, status, source_task_id, slack_ts, slack_channel, created_at, confirmed_at
- `slack_ts`/`slack_channel` added (not in story map spec but required for thread reply capture)
- `source_task_id` is TEXT (not FK) — intentional

### Gotchas

- NO `approved_with_edits` action string — distinction via `editedContent` field presence
- Rephrase: update in-place, keep status `proposed`, re-post message with fresh buttons
- Expiry filter MUST include `confirmed_at IS NULL` — never expire confirmed rules
- Expiry sets `status: 'expired'` (not DELETE) — preserves audit trail
- `step.sendEvent` for edit-diff must be OUTSIDE the try/catch block

## Task 6 — learned-rules-expiry trigger (2026-04-29)

### Implementation
- File: `src/inngest/triggers/learned-rules-expiry.ts`
- Function ID: `trigger/learned-rules-expiry`
- Cron: `0 2 * * *` (daily 2am UTC, off-peak from feedback-summarizer Sunday midnight)
- Follows exact `feedback-summarizer.ts` pattern: same imports, env check, headers, step.run

### Key Details
- Step `find-expired-rules`: GET with `status=eq.proposed&confirmed_at=is.null&created_at=lt.${cutoff}`
- Per-rule step `expire-rules-${rule.id}`: PATCH `{ status: 'expired' }` with `Prefer: return=minimal`
- Cutoff: `Date.now() - 30 * 24 * 60 * 60 * 1000` (30 days)
- NO delete — sets status to 'expired' to preserve audit trail
- `confirmed_at=is.null` guard is CRITICAL — never touches confirmed rules
- `pnpm build` exits 0 — evidence at `.sisyphus/evidence/task-6-type-check.txt`
- NOT yet registered in `serve.ts` — T8 handles registration after both T4 and T6 complete

## Session task-4 (2026-04-29) — rule-extractor.ts created

### Schema Gotchas (critical)
- `id UUID NOT NULL` — no DB-level default, must generate with `randomUUID()` from 'crypto' before every INSERT
- `rule_text TEXT NOT NULL` — not nullable; fallback (awaiting_input) path must insert `''` (empty string), not null
- `created_at` has `DEFAULT CURRENT_TIMESTAMP` — omit from INSERT payload (let DB fill it)
- Evidence file: `.sisyphus/evidence/task-4-happy-path-insert.txt`

### Implementation Notes
- Function exported as `createRuleExtractorFunction(inngest)` from `src/inngest/rule-extractor.ts`
- Trigger: `employee/rule.extract-requested`, function ID: `employee/rule-extractor`
- Registered in `src/gateway/inngest/serve.ts` (NOT done — task said don't modify other files)
- Guard order: load-context → empty guard → identical guard → null archetypeId → resolve-channel → null channel → resolve-slack-token → extract-rule → happy/fallback
- `decrypt()` from `../lib/encryption.js` takes `{ ciphertext, iv, auth_tag }` — matches `tenant_secrets` columns
- Slack token fetched from `tenant_secrets?tenant_id=eq.${tenantId}&key=eq.slack_bot_token&select=ciphertext,iv,auth_tag`
- Rule review blocks: section + divider + actions (confirm/reject/rephrase) + context block with `Rule \`${ruleId}\``
- Fallback: posts "What should I learn..." to notificationChannel (thread_ts from task.metadata.approval_message_ts if available)

## Task 5 — lifecycle emission (2026-04-29)

### Implementation
- File modified: `src/inngest/employee-lifecycle.ts`
- `originalDraft` captured at line 675 (BEFORE the try block) as `deliverable?.content as string | undefined`
- `step.sendEvent('emit-edit-diff-rule-extract', ...)` added at line 718, AFTER the catch block, INSIDE the `if (editedContent)` block
- Payload: `{ tenantId, feedbackId: null, feedbackType: 'edit_diff', taskId, archetypeId, content: null, originalContent: originalDraft ?? '', editedContent }`

### Test Fix Required
- `lifecycle-guest-approval.test.ts` and `lifecycle-guest-delivery.test.ts` both needed `step.sendEvent` mocked
- Added `(mocked as any).step.sendEvent = vi.fn().mockResolvedValue(undefined);` to `transformCtx` in both files
- Without this mock, the real Inngest client tried to call the Inngest API and got `Inngest API Error: 200 []`
- Pattern: whenever adding a new `step.sendEvent` call to the lifecycle, ALL test files that mock the lifecycle's `transformCtx` need `step.sendEvent` mocked too

### Evidence
- `.sisyphus/evidence/task-5-lifecycle-emission.txt` — grep showing emission code
- `.sisyphus/evidence/task-5-lifecycle-tests.txt` — test results (4+4 tests pass)

## Task 8 — serve.ts registration (2026-04-29)

### Implementation
- File modified: `src/gateway/inngest/serve.ts`
- Added 2 imports after line 13 (after `createUnrespondedMessageAlertTrigger`):
  - `createRuleExtractorFunction` from `../../inngest/rule-extractor.js`
  - `createLearnedRulesExpiryTrigger` from `../../inngest/triggers/learned-rules-expiry.js`
- Added 2 instantiations after `unrespondedAlertFn` (line 36):
  - `const ruleExtractorFn = createRuleExtractorFunction(inngest);`
  - `const learnedRulesExpiryFn = createLearnedRulesExpiryTrigger(inngest);`
- Added both to `functions` array after `unrespondedAlertFn`
- Function count: 9 → 11

### Verification
- `pnpm build` exits 0
- Evidence: `.sisyphus/evidence/task-8-serve-registration.txt`

## Task 7 — rule_confirm/reject/rephrase Slack handlers (2026-04-29)

### Implementation
- File modified: `src/gateway/slack/handlers.ts` — 4 handlers added before closing `}` of `registerSlackHandlers`
- `rule_confirm`: ack trick (replace_original ✅ + context), PATCH `{ status: 'confirmed', confirmed_at: ISO }`
- `rule_reject`: ack trick (replace_original ❌ + context), PATCH `{ status: 'rejected' }`
- `rule_rephrase`: plain ack, GET rule_text, `client.views.open()` modal (callback_id: 'rule_rephrase_modal')
- `rule_rephrase_modal`: validate non-empty, ack, PATCH rule_text, GET slack_ts/slack_channel, `client.chat.update()` with fresh buttons

### Key Patterns
- Use file-level `SUPABASE_URL()` / `SUPABASE_KEY()` helpers (not inline env var reads)
- `Prefer: 'return=minimal'` for all PATCH operations
- `(ack as any)({ replace_original: true, blocks: [...] })` — Socket Mode ack trick for confirm/reject
- `rule_rephrase_modal` only acks BEFORE using `await ack()` (not ack trick) — modal close
- Validation error uses `(ack as any)({ response_action: 'errors', errors: { rule_input: '...' } })`
- `boltApp.view()` handler signature: `{ ack, view, client }` — no `body` needed for view-only handlers
- Block kit update structure for rephrase mirrors rule-extractor.ts exactly: section → divider → actions (3 buttons) → context

## Task 9 — awaiting_input thread reply capture (2026-04-29)

### Implementation
- File modified: `src/inngest/interaction-handler.ts`
- New step `detect-awaiting-input-rule` added at line 65 (BEFORE `detect-rejection-feedback` at line 204)
- New step `capture-awaiting-input-reply` runs inside the `if (awaitingInputRule)` block (lines 92-201)
- Early `return` at line 201 prevents intent classification from running

### Flow
1. `detect-awaiting-input-rule`: queries `learned_rules?status=eq.awaiting_input&slack_channel=eq.${channelId}&slack_ts=eq.${threadTs}` — returns first row or null
2. If match: `capture-awaiting-input-reply` step:
   - PATCHes `learned_rules` → `{ rule_text: text, status: 'proposed' }`
   - Fetches tenant `slack_bot_token` from `tenant_secrets`
   - Uses `const { decrypt } = await import('../lib/encryption.js')` (dynamic import inside step)
   - Posts Slack message with Confirm/Reject/Rephrase buttons + mandatory context block `Rule \`${ruleId}\``
   - PATCHes `learned_rules` → `{ slack_ts, slack_channel }` from Slack response
3. Returns early — normal interaction handler flow skipped

### Key Patterns
- `threadTs` is the ts of the "What should I learn?" message — the one stored in `learned_rules.slack_ts`
- Dynamic import of `decrypt`: `const { decrypt } = await import('../lib/encryption.js')` — safe inside Inngest step
- Slack message headers object: `{ apikey, Authorization, 'Content-Type', Prefer: 'return=minimal' }` for PATCHes
- Same block kit structure as rule-extractor.ts: section + divider + actions (confirm/reject/rephrase) + context
- `pnpm build` exits 0
- Evidence: `.sisyphus/evidence/task-9-thread-reply-capture.txt`
