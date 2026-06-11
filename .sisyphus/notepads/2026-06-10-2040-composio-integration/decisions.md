# Decisions — composio-integration

## [2026-06-10] User Decisions (captured via interactive questions)

1. **Strategy**: AUGMENT — add 1000+ apps alongside existing tools. All existing custom integrations (Slack, Google, GitHub, Jira, Notion, Hostfully, Sifely) stay as-is; Composio adds the long tail.
2. **Approach**: De-risking spike first (Wave 1), then phased rollout.
3. **Schema**: New `composio_connections` table (not JSON blob on existing row).
4. **Dashboard UI**: "Connect an app" UI IS in-scope (Wave 3).
5. **Prereqs**: `COMPOSIO_API_KEY` and Notion custom auth config already exist.
6. **Next toolkits**: Defer — Notion only for this plan.
7. **Security boundary (Oracle)**: DENY GitHub, financial/payment, platform infra permanently. `COMPOSIO_DENIED_TOOLKITS` enforced at MCP injection time.

## [2026-06-10] Architecture Decisions (REVISED — REST API Shell Tool)

- **MCP REJECTED** — too token-heavy (full tool schema listing per task)
- **Shell tool approach adopted**: `src/worker-tools/composio/execute.ts` wraps Composio Execute API
- AI employee calls: `node /tools/composio/execute.ts --toolkit notion --action NOTION_RETRIEVE_A_PAGE --params '{"page_id": "..."}'`
- `@composio/core` SDK gateway-only (for OAuth `link()` only — not in worker Docker image)
- Shell tool calls Composio REST API directly with `COMPOSIO_API_KEY` + `userId: tenant_${tenantId}`
- `link()` not `initiate()` (deprecated 2026-07-03) — for the OAuth connect flow
- Exact SDK version pin (no `^`)
- Per-TENANT connections only (no per-user)
- Compiled AGENTS.md injects available toolkits + usage instructions when connections exist
- `COMPOSIO_DENIED_TOOLKITS` enforced in shell tool (not in MCP config)
- Graceful degradation: shell tool returns error JSON, task can handle it
- `COMPOSIO_MAX_CALLS_PER_TASK = 50` soft cap (per-task env var, checked in shell tool)
