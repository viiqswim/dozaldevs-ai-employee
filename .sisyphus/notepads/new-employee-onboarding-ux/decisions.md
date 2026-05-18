# Decisions — new-employee-onboarding-ux

## 2026-05-18 Session Start

### Architecture Decisions

- Two separate endpoints: POST /archetypes/generate (preview, no DB) and POST /archetypes (create, DB write)
- Refinement sends full config + instruction to LLM, returns new full config (not incremental patches)
- Slack channel degradation: 200 { channels: [], error: 'SLACK_NOT_CONFIGURED' } when no token
- trigger_sources discriminated union: { type: 'manual' } | { type: 'scheduled'; cron, timezone? } | { type: 'webhook'; event_type? }
- MarkdownEditorField MUST be used for agents_md editor (not raw textarea)
- Advanced section collapsed by default
- Max 3 refinement iterations per session tracked in component state
