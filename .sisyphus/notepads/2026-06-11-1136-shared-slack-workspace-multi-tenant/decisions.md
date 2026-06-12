# Decisions

## [2026-06-12] Architecture Decisions

- Option A chosen: workspace → all employees routing (NOT per-tenant Slack apps)
- TDD approach: RED → GREEN → REFACTOR
- Disambiguation: low LLM confidence → card with buttons, never silent drop
- Prod repair: additive only, backup first, deploy code before data repair
- deleteInstallation semantics: TBD pending T1 spike
- fetchInstallation: iterate deterministically by created_at asc to find live token
