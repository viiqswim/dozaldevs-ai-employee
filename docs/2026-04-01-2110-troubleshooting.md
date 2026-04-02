# Troubleshooting — Common E2E Failures

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
pnpm dev:start                # restart all services
```

## 3. Container Exits Immediately ("REPO_URL not set")

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

## 6. Tests Fail After E2E Run (extra `agent_versions` row)

**Symptom**: `schema.test.ts` fails — wrong `model_id` returned by `findFirst({ is_active: true })`.

**Root Cause**: E2E inserts a new `agent_versions` row; `findFirst` may return it instead of the seed row.

**Fix**:

```bash
pnpm prisma db seed
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres \
  -c "DELETE FROM agent_versions WHERE id != '00000000-0000-0000-0000-000000000002';"
```

## 7. Branch Already Exists on GitHub (push conflict)

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

```bash
supabase stop
docker compose -f docker/docker-compose.yml up -d
```
