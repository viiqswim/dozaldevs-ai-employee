# Decisions — feedback-system-redesign

## [2026-05-12] Session ses_1e68e8d45ffeM0gg2AZWtG9kiJ

### Confirmed decisions (from planning session)

- Approach A: feedback_events (audit) + employee_rules (behavioral) — two tables
- knowledge_bases: unchanged, reference knowledge only
- Two injection env vars: EMPLOYEE_RULES, EMPLOYEE_KNOWLEDGE
- SYNTHESIS_THRESHOLD = 5 (every 5th confirmation per archetype)
- MAX_EMPLOYEE_RULES_CHARS = 8000
- MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000
- Tests after implementation
- Migrate ALL learned_rules statuses (not just confirmed)
- awaiting_input → PM reply path bypasses LLM (unchanged behavior)
- batch_rules_confirm handler removed entirely
- feedback-summarizer cron deregistered and deleted
