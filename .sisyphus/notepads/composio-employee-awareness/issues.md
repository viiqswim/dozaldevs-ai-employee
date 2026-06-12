# Issues — composio-employee-awareness

## [2026-06-12] Plan Start

### Pre-existing LSP error (NOT our bug)

- `vitest.config.ts:33` — "coverage does not exist in type 'UserConfigExport'" — pre-existing, unrelated to this plan. Do NOT fix.

### task_composio_calls missing `phase` column

- Current schema: `id, task_id, tenant_id, toolkit, tool_name, called_at`
- Need to add: `phase String?` via migration (T1)

### AGENTS.md false claims to fix (T12)

- "shell tools have no PostgREST access" — false (knowledge_base/search.ts already reads)
- References non-existent `composio_connection_id` column on composio_connections
