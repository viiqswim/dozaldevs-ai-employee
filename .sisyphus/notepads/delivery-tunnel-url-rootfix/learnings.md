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

## [2026-06-16] T8 — Prod E2E Verification (PASS)

### Outcome
- Fix CONFIRMED in production. Fresh task `1befb545-36f9-4f71-bd8b-a4008f5c5de7`
  (slack-channel-summarizer, tenant c7e5b720) flowed Submitting → Validating →
  Submitting → Delivering → Done. `Delivering → Done` by actor=`machine`.
- Delivery Fly machine `286d2e2f537e18` (purple-haze-9572): full lifecycle
  launch@19:07:52 → start@19:08:44 → clean exit@19:09:38 → destroyed@19:09:40.
- Render gateway log: `lifecycle-delivery-retry` "Delivery machine spawned"
  attempt=0 deliveryMachineId=286d2e2f537e18 — this line was UNREACHABLE before
  the fix (getTunnelUrl threw first). attempt=0 = succeeded first try, no retry storm.
- Delivery-phase `executions` row completed with real tokens (13653/1104),
  separate from execution-phase row — proves the delivery container ran an LLM session.
- Slack post to C05UL7X6B54 confirmed via chat.getPermalink ok=true
  (ts 1781636724.616979, workspace Dozal Inc. T0601SMSVEU).

### Gotchas discovered (doc-drift — candidates for skill updates)
- Render logs endpoint in production-ops + execution-trace-debugging skills
  (`GET /v1/services/{id}/logs?tail=100`) returns 404 now. Working endpoint:
  `GET /v1/logs?ownerId={ownerId}&resource={serviceId}&limit=N&startTime&endTime`.
  ownerId = tea-d1uscc3uibrs738pu040.
- Local `.env` has NO PROD_DATABASE_URL_DIRECT (task brief assumed it did).
  Derive prod session pooler from Render's DATABASE_URL env var: swap :6543→:5432,
  strip ?pgbouncer. Render's DATABASE_URL_DIRECT is IPv6-only db.<ref>.supabase.co
  (unreachable from IPv4 local).
- `.env` line 95 `EMAIL_FROM=DozalDevs <noreply@dozaldevs.com>` is unquoted and
  breaks `source .env` in zsh. Use grep to extract individual keys instead.
- First trigger 500 was pure cold-start (22s after deploy live). Retry after
  ~3.5 min succeeded HTTP 202 on first attempt.
- Platform bot is not a member of #random (C05UL7X6B54): conversations.replies/
  history → not_in_channel, conversations.join → missing_scope. chat:write still
  works (that is how delivery posts). Use chat.getPermalink to verify a post by ts.

### Evidence
- `.sisyphus/evidence/task-8-prod-e2e.txt`

## T9 — Manual Remediation (2026-06-16)

- `task_status_log.actor` has a CHECK constraint: only `gateway`, `lifecycle_fn`, `watchdog`, `machine`, `manual` are valid. `manual-remediation` is rejected.
- `task_status_log.updated_at` is NOT NULL with no default — must be supplied explicitly in INSERT.
- `tasks.failure_code` column exists and accepts free-form strings (no check constraint observed).
- Pattern for manual remediation: UPDATE tasks → INSERT task_status_log with actor='manual'.
- Always derive PROD_SESSION_URL by swapping :6543→:5432 and stripping `?pgbouncer=true` from Render's DATABASE_URL env var.
