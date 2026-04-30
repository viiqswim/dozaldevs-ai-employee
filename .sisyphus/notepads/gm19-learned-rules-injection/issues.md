# Issues — gm19-learned-rules-injection

## [2026-04-30] Known gotchas

### archetypeId at lifecycle line 81

- `void archetypeId` is a lint suppression — DO NOT REMOVE
- The variable IS used at line 157 (knowledge_bases query)
- For learned rules query, use same `archetypeId` variable from event.data
- The archetype object from DB is `archetype` (taskData.archetypes) — its `.id` field is equivalent

### feedback-summarizer has no tenant context

- Original ArchetypeRow interface only has id + role_name
- Must extend interface: add `tenant_id: string` and `notification_channel: string | null`
- Must update archetype select query string to include these fields

### Slack token in gateway process

- feedback-summarizer runs in gateway (not worker machine)
- No per-tenant Slack token in env
- Must query tenant_secrets table exactly like rule-extractor.ts lines 106-120
- decrypt() function is available via import from ../../lib/encryption.js

### inngest-serve.test.ts

- Pre-existing broken test that checks function count
- DO NOT FIX — per AGENTS.md
- Adding synthesis step to existing function (not a new function) means no count change

### Docker rebuild REQUIRED

- Task 3 modifies opencode-harness.mts which is in src/workers/
- AGENTS.md: "Any modification to files under src/workers/ requires rebuilding the Docker image"
- Task 6 must run docker build before any E2E verification
