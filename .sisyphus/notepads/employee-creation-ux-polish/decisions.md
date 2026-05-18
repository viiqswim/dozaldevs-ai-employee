# Decisions — employee-creation-ux-polish

## [2026-05-18] Session Start

- Expand overlay: 90vw × 85vh, z-index 50, Escape to close, createPortal to document.body
- Tools display: show individual tool filenames (last segment, strip .ts), grouped by service name. Note: "recommended tools, employee has access to all"
- Task 3 depends on Task 2 being done first (Trigger Instructions needs MarkdownEditorField expand feature)
- No tool description API calls — filename only, no /admin/tools fetch
- system_prompt omitted from creation UI only — backend still sets it to ''
