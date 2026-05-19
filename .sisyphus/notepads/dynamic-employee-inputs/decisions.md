# Decisions — dynamic-employee-inputs

<!-- APPEND ONLY — never overwrite, never use Edit tool. Format: ## [TIMESTAMP] Task: {task-id} -->

## [2026-05-19T02:00:00Z] Plan Design

- input_schema: new JSON column (separate from worker_env)
- worker_env: stores actual static env var values (key=VAR_NAME, value=the-value)
- raw_event.inputs: runtime inputs nested here (not flattened) to avoid collision
- Template syntax: {{var_name}} in instructions + agents_md, NOT system_prompt
- INPUT\_ prefix for env vars from runtime inputs (e.g., INPUT_REPORT_DATE)
- 422 returned when required every_run inputs missing at trigger time
- Trigger button → navigates to /trigger page if every_run inputs exist; fires directly if none
