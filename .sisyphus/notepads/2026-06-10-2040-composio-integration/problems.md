# Problems — composio-integration

## [2026-06-10] Resolved Inputs

All inputs confirmed by user:

1. **`notion auth_config_id`**: `ac_Gsqb4UMAQUkD`

2. **Notion test page ID**: `376d55e97d98808588ffe476de1704d6`
   - URL: `https://app.notion.com/p/22ad55e97d9880258e14df5dde4aa9e4?v=22ad55e97d988178a714000c449deb36&p=376d55e97d98808588ffe476de1704d6&pm=s`
   - Known text for E2E verification: `"Two diagrams below. The first shows where everything lives. The second shows what happens when a quote is requested."`

## [2026-06-10] Architecture Pivot (User Decision)

User confirmed: **MCP server approach REJECTED** due to token overhead. Switching to REST API shell tool approach.

- MCP is token-heavy (full tool schema listing on every task invocation)
- Shell tool approach is token-efficient, follows existing platform patterns, simpler
- See updated plan for revised architecture
