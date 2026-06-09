# Troubleshooting — Common E2E Failures

> **Note**: Entries marked `[DEPRECATED — engineering employee only]` apply to the old orchestrator-based engineering employee (`src/workers/orchestrate.mts`), which is on hold. They do not apply to the active archetype-based employees (guest-messaging, summarizer, code-rotation, engineer, google-workspace-assistant).

## 1. Gateway Returns 401 on Webhook

**Symptom**: `curl -d @file` to `POST /webhooks/jira` returns HTTP 401 "Invalid signature".

**Root Cause**: `curl -d` strips trailing newlines, changing the HMAC the server computes over raw bytes.

**Fix**:

```bash
# Use --data-binary to preserve bytes, or use the helper script:
pnpm trigger-task --key TEST-100
```

## 2. Task Stays in `Ready` Forever

**Symptom**: Task row created in DB but never transitions to `Executing`. Inngest shows 0 events.

**Root Cause**: Inngest Dev Server not running on port 8288, or gateway didn't register at `/api/inngest`.

**Fix**:

```bash
curl http://localhost:8288/   # verify Inngest is up
pnpm dev                      # restart all services
```

## 3. Container Exits Immediately ("REPO_URL not set") `[DEPRECATED — engineering employee only]`

**Symptom**: Container dispatched but exits in under 1 second. No heartbeat in DB.

**Root Cause**: `repoUrl`/`repoBranch` were missing from the Inngest event payload. Fixed in `b919931`.

**Fix**:

```bash
git pull && docker build -t ai-employee-worker:latest .
```

## 4. OpenCode Session Returns Empty `{}`

**Symptom**: Container runs all steps but `session.status` stays `{}`. Task never reaches `Submitting`.

**Root Cause**: `opencode serve` reads credentials only from `~/.local/share/opencode/auth.json` at
startup. Setting `OPENROUTER_API_KEY` as an env var alone is not enough. Fixed in `ff6ef19`.

**Fix**:

```bash
docker build -t ai-employee-worker:latest .
```

## 5. PostgREST Returns 403

**Symptom**: Worker container PATCH/POST to Supabase returns HTTP 403.

**Root Cause**: Prisma-created tables are owned by `postgres`. The `service_role` used by PostgREST
has no grants until the `postgrest_grants` migration runs.

**Fix**:

```bash
pnpm prisma migrate deploy
```

## 6. Tests Fail After E2E Run (extra `agent_versions` row) `[DEPRECATED — engineering employee only]`

**Symptom**: `schema.test.ts` fails — wrong `model_id` returned by `findFirst({ is_active: true })`.

**Root Cause**: E2E inserts a new `agent_versions` row; `findFirst` may return it instead of the seed row.

**Fix**:

```bash
pnpm prisma db seed
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "DELETE FROM agent_versions WHERE id != '00000000-0000-0000-0000-000000000002';"
```

## 7. Branch Already Exists on GitHub (push conflict) `[DEPRECATED — engineering employee only]`

**Symptom**: Container exits during PR creation. No PR on GitHub.

**Root Cause**: Re-running with the same Jira key (e.g., `TEST-100`) reuses branch `ai/TEST-100-test-100`.
Push fails if prior commits already exist on that branch.

**Fix**:

```bash
pnpm trigger-task --key TEST-$(date +%s)
```

## 8. Many Tests Fail (missing seed data)

**Symptom**: 60+ gateway/schema test failures; "project not found" errors.

**Root Cause**: Seed data wiped when Supabase restarts, or `cleanupTestData()` in parallel tests
deletes rows other tests depend on.

**Fix**:

```bash
pnpm prisma db seed && pnpm test
```

## 9. Docker Compose containers won't start (port conflict)

**Symptom**: `docker compose -f docker/docker-compose.yml up -d` fails with "bind: address already in use" on port 54321 or 54322

**Root Cause**: Supabase CLI containers (`supabase_kong_ai-employee`, `supabase_db_ai-employee`) are still running and occupying those ports.

**Fix**:

> **Note**: `pnpm setup` handles this automatically — it calls `supabase stop` before starting Docker Compose. You only need these manual steps if you encounter port conflicts outside of the normal setup flow.

```bash
supabase stop
docker compose -f docker/docker-compose.yml up -d
```

---

## Active-Employee Failures (current employees)

### 10. Task Stuck in `Executing` — Worker Container OOM-Killed

**Symptom**: Task stays in `Executing` indefinitely. `docker logs employee-<taskId[:8]>` shows the container exited with code 137 (OOM kill) or the harness log shows 0 tokens and exits within 45 seconds.

**Root Cause**: Archetype has `runtime: 'opencode'` but `vm_size` is not set (defaults to `shared-cpu-1x`, 256MB RAM). The OpenCode binary reserves ~74GB virtual memory at startup and OOM-kills on small machines.

**Fix**:

```bash
# Set vm_size to performance-1x for the archetype
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "UPDATE archetypes SET vm_size = 'performance-1x' WHERE id = '<archetype_id>';"
```

### 11. Task Stuck in `Executing` — Model Won't Call Bash Tools

**Symptom**: Task reaches `Executing` but never progresses. Worker logs show the LLM responding with text but never calling any shell tools. Task eventually times out.

**Root Cause**: Some catalog models (e.g., `xiaomi/mimo-v2.5`, `minimax/minimax-m2.7` via OpenCodeGo) don't reliably call bash tools.

**Fix**: Override the archetype model to `deepseek/deepseek-v4-flash` for testing:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '<archetype_id>';"
```

### 12. Task Reaches `Submitting` but Never Moves to `Reviewing` or `Delivering`

**Symptom**: Task status is `Submitting` and doesn't advance. No Slack approval card appears.

**Root Cause**: Worker wrote `/tmp/summary.txt` but not `/tmp/approval-message.json`, or wrote them via shell redirect instead of the `submit-output.ts` tool. The harness treats absence of both contract files as a hard failure.

**Fix**: Check the harness log for the contract file check:

```bash
grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | grep -i "contract\|summary\|approval"
```

Ensure the archetype's `execution_steps` calls `tsx /tools/platform/submit-output.ts --draft-file /tmp/draft.txt --classification NEEDS_APPROVAL` (or `NO_ACTION_NEEDED`). Never write contract files via `echo` or shell redirects.

### 13. @mention in Slack Produces No Response (~50% of the time)

**Symptom**: Mentioning the bot in Slack sometimes works, sometimes produces no response. No gateway log entry for the missed event.

**Root Cause A**: Multiple `pnpm dev` instances running simultaneously — Slack round-robins events across all open sockets. Check: `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` (should be 1).

**Root Cause B**: Dev and prod share the same `SLACK_APP_TOKEN` — Slack delivers ~50% of events to the production gateway. Fix: create a personal dev Slack app per `docs/guides/2026-06-06-2032-slack-per-dev-app-onboarding.md`.

**Root Cause C**: Phantom socket — a previous unclean gateway death left a WebSocket registered with Slack. Wait 2-15 minutes for Slack to expire it, or check `num_connections` in gateway startup logs.

**Fix**: See [Known Issues #4 and #5](../../AGENTS.md) in AGENTS.md for full diagnostics and prevention steps.
