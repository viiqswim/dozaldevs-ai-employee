# Decisions — Conversational Employee Editing

## [2026-06-13] Locked Decisions (from user interviews)

- Apply mechanism: Direct apply on Approve → PATCH
- Editable scope: identity, execution_steps, delivery_steps, overview, risk_model.approval_required, tool_registry.tools, trigger_sources, input_schema
- Excluded: model, temperature, role_name, vm_size, concurrency_limit
- Versioning: NEW archetype_edit_history table (NOT agent_versions)
- UX: Full chat panel as NEW tab (?tab=assistant)
- Streaming: NO — simple request/response with loading spinner
- Chat persistence: ephemeral (in-memory only)
- Unsaved-changes guard: beforeunload + React Router useBlocker
- Tests: tests-after for core logic + mandatory Playwright agent QA
- Approval-off: requires prominent warning + explicit confirm checkbox
- Tool validation: must be in tenant's available set (shell descriptors + connected Composio)
- Trigger/input validation: must pass TriggerSourceSchema / InputSchemaSchema
- Revert: append-only new history row (never mutate original)
- Diff baseline: persisted archetype (not previous proposal)
- before_json: re-fetch immediately before PATCH (last-write-wins v1)
