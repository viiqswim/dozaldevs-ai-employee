# Issues — composio-integration

## [2026-06-10] Known Risks / Gotchas

### CRITICAL: OpenCode 1.14.31 Remote MCP Unverified

- OpenCode 1.14.31 remote-MCP-with-auth-headers support is UNVERIFIED for that pinned binary
- Task 1 is a mandatory smoke test before any build
- If Task 1 fails → STOP, surface to user, do NOT proceed to Wave 2

### `initiate()` Deprecation

- `initiate()` deprecation deadline for all orgs: 2026-07-03
- MUST use `link()` only

### `writeOpencodeAuth()` Clobber Risk

- `writeOpencodeAuth()` in `harness-helpers.mts` clobbers `opencode.json` wholesale
- MCP injection MUST be read-merge-write — if done wrong, auth entries will be lost

### AGENTS.md "use only /tools/" Rule

- Platform AGENTS.md says "use only `/tools/`" — MCP tools would be silently ignored
- Must update BOTH `agents-md-compiler.mts` AND `src/workers/config/agents.md`

### `tenant_integrations` Schema Constraint

- `tenant_integrations` has `@@unique([tenant_id, provider])` — ONE row per provider
- Composio needs N rows → New `composio_connections` table required (cannot reuse existing)

### May 2026 Composio Breach

- Attacker achieved arbitrary code execution in Composio tool sandbox
- ~5,001 GitHub connections compromised
- All API keys before 2026-05-22 force-deleted
- Customer-controlled KMS announced but not shipped
- → Permanent denylist for GitHub, financial/payment, platform infra

### Worker PostgREST (not Prisma)

- Worker containers use PostgREST REST API (not direct Prisma) to read DB
- Task 14 must fetch `composio_connections` via PostgREST, not Prisma client

## [2026-06-10] Inputs Needed Before Execution

- `[INPUT: COMPOSIO_API_KEY storage]` — platform secret key name (already in .env per user)
- `[INPUT: notion auth_config_id]` — the `ac_*` value from Composio dashboard (needed for Task 2)
- `[INPUT: notion test page id + known text]` — a Notion page to read as proof (needed for Task 3 + Task 15)
