# Decisions — suppress-no-action-noise

## [2026-05-07] Session Start

### Pre-check location: Inngest lifecycle step (not gateway handler)

- User explicitly chose lifecycle approach
- Reason: task row still gets created for audit trail; gateway handler would skip task creation entirely

### Pre-check fallback: Safe (proceed normally on error)

- Any API failure, missing lead_uid, or network error → `lastSenderIsHost: false` → pipeline continues normally
- Never break the pipeline due to a pre-check failure

### Monitor removal: Full (not just disabled)

- Delete all code, tests, prompts
- Delete all historical tasks/deliverables from DB (FK-safe order)
- FK deletion order: feedback → deliverables → task_status_log → pending_approvals → tasks → learned_rules → knowledge_bases → archetypes

### Card enrichment: Data already in memory

- Do NOT make external API calls in the card builder
- Use: `archetype.role_name` for employee name, `taskData.raw_event` for trace IDs, `classificationCheck.displayContext` for guest/property info
- Add only what's available; skip fields that are undefined/empty

### No employee-specific language in shared files

- Pre-check step uses `archetype.role_name === 'guest-messaging'` — this is reading config, not hardcoding
- The pre-check utility function itself is generic (takes leadUid, apiKey)
