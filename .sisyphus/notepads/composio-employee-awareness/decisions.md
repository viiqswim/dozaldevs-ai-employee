# Decisions — composio-employee-awareness

## [2026-06-12] Plan Start

### Skills in repo (not DB cache)

Committed via npm generator, filtered at boot. No file-delivery channel from gateway to Fly workers.

### Per-app skills with bundled action schemas

SKILL.md = lightweight action index; actions/<SLUG>.md = full param schema (read on demand).

### Boot filtering by folder deletion

Harness deletes composio-\* folders for unconnected apps before OpenCode starts.

### Generator scope = connectable apps only

Apps with Composio auth config set up (authConfigs.list()), not all 1000+.

### Cache miss falls back to runtime discovery tool

list-actions.ts — no skill injected for newly-connected apps.

### Audit via our own tool

execute.ts writes the audit row itself (task_id, tenant_id, toolkit, action, phase).

### No skill names in instructions

Plain English + OpenCode auto-matching. Drift designed out.
