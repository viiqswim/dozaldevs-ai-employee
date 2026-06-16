# Learnings — delivery-tunnel-url-rootfix

## [2026-06-16] Plan Start

### Root Cause

- `getTunnelUrl()` in `src/lib/tunnel-client.ts` THROWS when `TUNNEL_URL` env var is unset.
- Execution path (`machine-provisioner.ts:64-65`) has guard: `WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL`
- Delivery path (`delivery-retry.ts:115-116`) is MISSING the guard — calls `getTunnelUrl()` unconditionally when `WORKER_RUNTIME === 'fly'`
- Production: `WORKER_RUNTIME=fly`, `TUNNEL_URL` NOT set → delivery throws → Inngest retries exhaust → task stuck at `Delivering`

### Fix Strategy

- Extract `resolveWorkerSupabaseUrl(supabaseUrl: string): Promise<string>` shared helper
- Both `machine-provisioner.ts` and `delivery-retry.ts` call the helper
- Unit test: 4 combos (fly×tunnel, fly×no-tunnel, docker×tunnel, docker×no-tunnel) + equivalence assertion

### Key Files

- `src/inngest/lifecycle/lib/machine-provisioner.ts` — execution path (guarded, reference)
- `src/inngest/lifecycle/steps/delivery-retry.ts` — delivery path (UNGUARDED, the bug)
- `src/lib/tunnel-client.ts` — `getTunnelUrl()` that throws
- `src/lib/config.ts` — `WORKER_RUNTIME` export

### Intentional Asymmetries (MUST NOT copy to delivery)

- `EMPLOYEE_RULES`, `EMPLOYEE_KNOWLEDGE`, `REPLY_BROADCAST` — execution-only fields

### P1 Env Divergences to Fix in delivery-retry.ts

- `TENANT_ID` / `TASK_TENANT_ID` — closes `requireEnv('TENANT_ID')` hard-exit
- `NOTIFY_MSG_CHANNEL` — failure Slack update
- `archetype.worker_env` spread — custom archetype env
- `ISSUES_SLACK_CHANNEL` — via `getPlatformSetting`
- `PLATFORM_ENV_MANIFEST` augmentation

### Commit Strategy

- Code commit: `fix(lifecycle): route delivery through shared worker URL resolver and close env divergences`
- Docs commit: `docs: record delivery-path tunnel-URL recurrence and shared-resolver single source`
