# Learnings — gm19-learned-rules-injection

## [2026-04-30] Initial codebase analysis

### employee-lifecycle.ts injection point (lines 153-230)

- `feedbackContext` assembled lines 153-211, try/catch wrapping
- `archetypeId` from `event.data` at line 70; `void archetypeId` at line 81 (lint suppression, do NOT remove)
- `archetypeId` IS used at line 157 in knowledge_bases query — so it's accessible
- Machine env spread at lines 221-229: `...(feedbackContext ? { FEEDBACK_CONTEXT: feedbackContext } : {})`
- `tenantId` extracted from `taskData.tenant_id` (line 98)
- Archetype object is `taskData.archetypes` (from joined select at line 86)

### opencode-harness.mts injection point (lines 328-336)

- `feedbackContext` = `process.env.FEEDBACK_CONTEXT ?? ''`
- `systemPrompt = feedbackContext ? \`${baseSystemPrompt}\n\n${feedbackContext}\` : baseSystemPrompt`
- Insert LEARNED_RULES_CONTEXT AFTER line 332 (after feedbackContext block)
- isDeliveryPhase check at line 322 — do NOT touch delivery path
- REPLY_ANYWAY_CONTEXT at line 333 — do NOT touch

### feedback-summarizer.ts current structure (124 lines)

- Weekly cron: `0 0 * * 0` (Sunday midnight UTC)
- Archetype select: `select=id,role_name` — MUST add `tenant_id,notification_channel`
- `ArchetypeRow` interface only has `id` and `role_name` — must extend
- Per-archetype loop at line 56 with step name `summarize-feedback-{id}`
- No tenant_id filter on feedback query (pre-existing bug — add TODO comment only)
- Synthesis step slots in AFTER line 121 (after the summarize-feedback step ends)

### rule-extractor.ts Slack pattern (lines 106-258)

- Slack token resolution: `tenant_secrets?tenant_id=eq.X&key=eq.slack_bot_token` → decrypt()
- Block Kit structure with `rule_confirm`, `rule_reject`, `rule_rephrase` action_ids
- PATCH learned_rules with slack_ts and slack_channel after posting
- Step naming: 'resolve-slack-token', 'store-proposed-rule', 'post-rule-review', 'store-slack-ref'

### learned_rules schema (prisma/schema.prisma lines 471-489)

- id, tenant_id (FK), entity_type (nullable), entity_id (nullable)
- scope ('common'|'entity'), rule_text, source, status
- source_task_id, slack_ts, slack_channel, created_at, confirmed_at (nullable)
- For archetype-scoped: entity_type='archetype', entity_id=archetypeId, scope='entity'
- For tenant-wide: scope='common' (entity_type may be 'tenant' or null)

## Task 6 — Verification Findings

### PostgREST Port
- ai-employee PostgREST (via Kong) is at **port 54331**, not 54321
- Port 54321 belongs to a different project's Kong and returns 404 for ai-employee routes
- `docker ps | grep ai-employee` shows: `ai-employee-kong Up ... 0.0.0.0:54331->8000/tcp`

### learned_rules table ID generation
- Migration creates `id UUID NOT NULL` with NO DB-level DEFAULT
- Must provide explicit UUID when inserting via PostgREST (e.g. `"id": "uuid-here"`)
- Prisma generates UUIDs client-side; PostgREST cannot auto-generate without `DEFAULT gen_random_uuid()`

### Pre-existing test failures (beyond container-boot + inngest-serve)
Many more tests fail than documented in AGENTS.md:
- `tests/inngest/lifecycle.test.ts` — deprecated lifecycle.ts
- `tests/gateway/services/employee-dispatcher.test.ts`
- `tests/gateway/slack/installation-store.test.ts`
- `tests/workers/lib/*` — deprecated worker libs
All pre-exist GM-19 and don't affect GM-19 acceptance criteria.

### Pre-existing lint errors
7 `no-constant-condition` errors in `src/worker-tools/hostfully/*.ts` and `scripts/resolve-hostfully-uids.ts` (commit bc0e330, before GM-19). Lint was already failing before GM-19.
