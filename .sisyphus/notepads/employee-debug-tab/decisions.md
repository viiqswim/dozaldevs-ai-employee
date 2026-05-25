# Decisions — employee-debug-tab

## [2026-05-25] Session Start

- Debug tab location: new tab on existing employee detail page (after "Advanced")
- API approach: fix existing brain-preview endpoint (not new endpoint)
- Shared code mandate: API and harness MUST import same functions — no inline duplicates
- Template variable substitution: use placeholder values for runtime-only vars in API preview
- DebugTab card styling: component handles its own cards internally (two separate card sections)
- Default view: rendered markdown (toggle to raw source)
- approvalRequired detection: derive from archetype.risk_model.approval_required ?? true (same as harness)
