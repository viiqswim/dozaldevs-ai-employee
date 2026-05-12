# Learnings — feedback-system-redesign

## [2026-05-12] Session ses_1e68e8d45ffeM0gg2AZWtG9kiJ

### Key Architecture Decisions

- `feedback_events`: immutable audit, archetype_id, correction_content, original_content, event_type
- `employee_rules`: proposed→confirmed→archived, source, status, source_task_id unique constraint per non-synthesis source
- `knowledge_bases`: untouched — reference knowledge only
- Injection: EMPLOYEE_RULES (8KB cap) + EMPLOYEE_KNOWLEDGE (32KB cap)
- Synthesis: every 5th confirmation per archetype, fired as async Inngest event with idempotency key `synthesis-${archetypeId}-${count}`

### Guardrails (NEVER TOUCH)

- knowledge_bases schema or knowledge_base_entries read path
- guest_approve/guest_edit/guest_reject/guest_edit_modal/guest_reject_modal handlers
- pending_approvals table
- AwaitingInput auto-pass state (employee-lifecycle.ts lines 436-442)
- classify-message.ts
- interaction-classifier.ts intent categories (unless required)
- Rule card block deduplication across files (out of scope)

### PostgREST API Pattern

- Base: supabaseUrl from env
- Headers: apikey (anon key), Authorization (Bearer token), Content-Type: application/json
- New tables: /rest/v1/feedback_events and /rest/v1/employee_rules

### Unique Constraint (critical)

- employee_rules: (source_task_id, source) WHERE source != 'synthesis'
- This prevents duplicate rule extraction for same task

### awaiting_input → proposed path

- Bypasses LLM (current behavior preserved)
- interaction-handler.ts detect-awaiting-input-rule step handles this
- Direct PATCH to employee_rules status='proposed'

### Synthesis race condition prevention

- Inngest event idempotency key: `synthesis-${archetypeId}-${confirmedCount}`
- Count is per-archetype confirmed rules
- Count % SYNTHESIS_THRESHOLD === 0 triggers synthesis

## Task 3 — Migration Script (migrate-feedback-data.ts)

- Prisma client must be regenerated (`pnpm prisma generate`) after adding new models — the LSP errors for `employeeRule`/`feedbackEvent` were false positives from the language server using the wrong path; the pnpm-resolved path at `node_modules/.pnpm/@prisma+client@.../node_modules/.prisma/client/` has the correct types
- `tsconfig.build.json` only includes `src/**/*` — scripts are excluded from the build, so `pnpm build` won't compile migration scripts (this is correct behavior)
- `tsx` runs the script directly without compilation issues
- Idempotency for `employee_rules`: check `source_task_id + source` unique constraint (matches the `@@unique` in schema)
- Idempotency for `feedback_events`: check `task_id + event_type` (no unique constraint in schema, but sufficient for migration safety)
- `LearnedRule.entity_id` is the archetype UUID — confirmed by `entity_type = 'archetype'` convention
- `weekly_synthesis` source maps to `synthesis` in new schema
- `Feedback` model has no direct `archetype_id` — must JOIN through `task.archetype_id`
- `knowledge_bases` cleanup uses raw SQL since `source_config` is a JSON column (no Prisma filter for JSON path)

## [2026-05-12] Task 7 — rule-synthesizer Inngest function

### Pattern confirmed

- Factory function pattern: `export function createRuleSynthesizerFunction(inngest: Inngest): InngestFunction.Any` — matches all other inngest functions in this codebase
- Event trigger via `triggers: [{ event: 'employee/rule.synthesize-requested' }]` (not cron)
- `employee_rules` table (not `learned_rules` — that's the old table used in feedback-summarizer synthesize step)
- `parent_rule_ids` (uuid[]) stored as JSON array in PostgREST POST body
- `source: 'synthesis'` on synthesized rules

### Code fence stripping

Pattern used in detect-overlaps step:

````typescript
const rawContent = llmResult.content.trim();
const jsonContent = rawContent
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```\s*$/, '')
  .trim();
````

### Slack card format (4 blocks, mandatory)

1. section (mrkdwn text with rule content)
2. divider
3. actions (Confirm/Reject/Rephrase buttons with rule_confirm/rule_reject/rule_rephrase action_ids)
4. context (Rule `{ruleId}`)

### Serve.ts registration pattern

Import factory → call with inngest instance → add to functions array. Function count now 6 active.

## [2026-05-12] Task 8 — handlers.ts migration to employee_rules

### Changes made

- Added `SYNTHESIS_THRESHOLD` import from `../../inngest/employee-lifecycle.js`
- `rule_confirm`: PATCH `employee_rules` (return=representation), fires `employee/rule.confirmed`, counts confirmed rules per archetype, fires `employee/rule.synthesize-requested` with idempotency key `synthesis-${archetypeId}-${confirmedCount}` every 5th confirmation, archives parent rules when source='synthesis'
- `rule_reject`: PATCH `employee_rules` (return=minimal)
- `rule_rephrase` action: GET `employee_rules` for rule_text
- `rule_rephrase_modal` view: PATCH `employee_rules`, GET `employee_rules` for slack_ts/slack_channel
- `batch_rules_confirm` handler: REMOVED entirely (zero references remain)
- `findTaskIdByThreadTs`: no learned_rules references (queries deliverables + tasks — unchanged)

### PostgREST parent archiving pattern

- `PATCH /rest/v1/employee_rules?id=in.(uuid1,uuid2)` — bulk status update to 'archived'
- Only fires when `source === 'synthesis'` and `parent_rule_ids.length > 0`

## [2026-05-12] Task 10 — Injection refactor in employee-lifecycle.ts dispatch-machine step

### Changes made

- Removed exported constants `MAX_LEARNED_RULES_CHARS` and `MAX_FEEDBACK_CONTEXT_CHARS` (unused after refactor)
- Removed entire old feedback block: queries to `feedback` + `knowledge_bases` → `FEEDBACK_CONTEXT`
- Removed entire old learned_rules block: query to `learned_rules` → `LEARNED_RULES_CONTEXT`
- Added `employeeRules` block: `GET /rest/v1/employee_rules?status=eq.confirmed&archetype_id=eq.{id}&select=rule_text,confirmed_at&order=confirmed_at.desc` → `EMPLOYEE_RULES` (8KB cap via `MAX_EMPLOYEE_RULES_CHARS`)
- Added `employeeKnowledge` block: `GET /rest/v1/knowledge_bases?archetype_id=eq.{id}&select=source_config&order=created_at.desc` → `EMPLOYEE_KNOWLEDGE` (32KB cap via `MAX_EMPLOYEE_KNOWLEDGE_CHARS`)
- Both local Docker env block and Fly.io machine env block updated identically
- `CONSOLIDATION_THRESHOLD` and `SYNTHESIS_THRESHOLD` kept — still used by feedback-summarizer.ts and rule-synthesizer
- `pnpm build` exits 0 with no errors
