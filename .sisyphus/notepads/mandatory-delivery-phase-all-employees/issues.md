# Issues — mandatory-delivery-phase-all-employees

## [2026-06-16] Known Issues / Gotchas

### Escape Hatch Employees (targets of this plan)

- cleaning-schedule: deliverable_type=slack_message, delivery_steps=NULL — posts to Slack in execution
- daily-motivation: deliverable_type=slack_message, delivery_steps=NULL — has "Do NOT read or follow <delivery-instructions>" guard that MUST be removed

### PATCH Gate Conditionality (CRITICAL)

- PATCH gate must ONLY fire when patch touches a delivery field (deliverable_type or delivery_steps)
- Unconditional gate breaks unrelated edits to existing valid rows (learned from prior plan T9)
- Condition: `if (rest.deliverable_type !== undefined || rest.delivery_steps !== undefined) { ...gate... }`

### Generator Prompt Budget

- ONE annotated contrast only — not multiple domain variants
- Prompt budget is tight; do not bloat with multiple examples

### Cross-Tenant Isolation

- cleaning-schedule = VLRE (00000000-0000-0000-0000-000000000003)
- daily-motivation = DozalDevs (00000000-0000-0000-0000-000000000002)
- NEVER cross-wire these

### deliverable_type Consumers (DO NOT TOUCH)

- src/lib/model-selection/profiler.ts
- src/gateway/services/time-estimator.ts
- src/inngest/lifecycle/steps/approval-handler.ts (deliversToChannel card UX)
- src/gateway/services/prompts/archetype-generator-prompts.ts (template selection)

### NO_ACTION_NEEDED Runtime Path (PRESERVE)

- The resolver's no-delivery-escape-hatch branch must remain intact
- The new gate is SAVE-TIME only, not runtime
