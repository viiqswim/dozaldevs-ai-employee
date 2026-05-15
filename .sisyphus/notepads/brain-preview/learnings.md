# Brain Preview — Learnings

## 2026-05-15 Session: Planning

### Architecture Decisions
- Backend endpoint assembles all data server-side (not client-side) for accuracy
- Reuses actual `resolveAgentsMd()` from `src/workers/lib/agents-md-resolver.mts`
- Reuses actual `loadTenantEnv()` from `src/gateway/services/tenant-env-loader.ts`
- All env var VALUES redacted to [SET]/[NOT SET] at the endpoint level

### Key File Locations
- Platform AGENTS.md static file: `src/workers/config/agents.md`
- resolveAgentsMd: `src/workers/lib/agents-md-resolver.mts:7-22`
- loadTenantEnv: `src/gateway/services/tenant-env-loader.ts:18-65`
- Admin route pattern: `src/gateway/routes/admin-archetypes.ts`
- Test pattern: `tests/gateway/admin-archetypes.test.ts`
- Dashboard tab pattern: `dashboard/src/panels/employees/EmployeeDetail.tsx`
- Dashboard UI pattern: `dashboard/src/panels/tools/ToolDetail.tsx`
- Existing markdown renderer: `dashboard/src/components/MarkdownPreview.tsx`
- Route registration: `src/gateway/server.ts` ~line 172
- MarkdownEditorField: `dashboard/src/components/MarkdownEditorField.tsx`

### Test Architecture
- Uses TestApp.inject() from tests/setup.ts
- Mock Prisma client (no real DB)
- Pattern file: tests/gateway/admin-archetypes.test.ts

### Env Var Sources (6 categories)
1. platform — PLATFORM_ENV_WHITELIST from tenant-env-loader.ts
2. tenant_secret — decrypted from tenant_secrets table
3. tenant_config — derived from tenants.config JSON
4. lifecycle — TASK_ID, TENANT_ID, NOTIFY_MSG_TS, etc.
5. raw_event — PROPERTY_UID, LEAD_UID, THREAD_UID, etc. (conditional)
6. harness — OPENROUTER_MODEL, OPENCODE_PROVIDER_ID, OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS

### Archetype IDs for Testing
- Tenant: 00000000-0000-0000-0000-000000000003 (VLRE)
- Archetype: 00000000-0000-0000-0000-000000000015

### Approved Models (per AGENTS.md)
- Primary: minimax/minimax-m2.7
- Verification: anthropic/claude-haiku-4-5
- DO NOT use claude-sonnet or any other model in code/seed data
