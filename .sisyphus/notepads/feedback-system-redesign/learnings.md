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
