# Decisions — employee-overview-and-drafts

## [2026-05-18] Session Start

### Structural Decisions

- Draft storage: `status String @default("active")` on archetypes (values: "active", "draft", "superseded")
- Partial unique index strategy: remove `@@unique([tenant_id, role_name])`, add SQL partial index `WHERE status = 'active'`
- Overview field name: `overview` (NOT `description` — avoids collision with user's free-text generation input)
- `parent_draft_id String?` — plain UUID field, no FK constraint
- maxTokens: 6000 (up from 4000) to accommodate overview JSON

### UX Decisions

- Auto-save: generation finishes → POST draft immediately → redirect to `/dashboard/employees/:id/edit`
- Refine: creates NEW draft record, old gets status="superseded" (filtered from list)
- Finalize: PATCH status → "active", same ID persists
- Multiple drafts per tenant allowed, no expiration
- Drafts in main employees list with badge (NOT separate tab)
- Overview is read-only display (NOT editable in this iteration)
- Advanced section labels: "Trigger Prompt", "Employee Brain", "Delivery Instructions"

### Scope Boundaries (MUST NOT)

- Do NOT change `instructions` semantics — it IS the harness execution prompt
- Do NOT build version history UI — `parent_draft_id` is stored but invisible to users
- Do NOT add draft expiration/cleanup
- Do NOT make overview editable
- Do NOT touch `isGuestMessaging` hardcode
- Do NOT add GET /list admin API route
- Do NOT touch deprecated components or lifecycle/harness files
