# Learnings — local-guest-messaging-e2e

## [2026-05-01] Task: Session Start

### Critical Architecture Facts

- `employee-lifecycle.ts` always dispatches to Fly.io (3 createMachine call sites: lines 259, 473, 821)
- `dev-start.ts` already sets `USE_LOCAL_DOCKER=1` in gateway env (line 329) — lifecycle just doesn't read it yet
- Deprecated `lifecycle.ts` has docker pattern at lines 295-326 (but uses wrong `--network host`)
- `--network host` is BROKEN on macOS — containers get VM network, not host network
- Use `host.docker.internal` + `--add-host=host.docker.internal:host-gateway` instead
- `createMachine()` → `getFlyApiToken()` → THROWS if FLY_API_TOKEN unset. Branch BEFORE createMachine.
- `tenantEnv` spread includes SUPABASE_URL from .env (localhost) — must OVERRIDE with host.docker.internal

### Key File Locations

- `src/inngest/employee-lifecycle.ts` — 3 createMachine sites at lines 259, 473, 821
- `src/inngest/lifecycle.ts` — deprecated docker pattern (lines 295-326) — read but don't modify
- `scripts/dev-start.ts` — shared startup script, DO NOT MODIFY
- `package.json:9-35` — scripts section, add `"dev:e2e": "tsx scripts/dev-e2e.ts"` after dev:start

### Env Contract

- Worker needs: SUPABASE_URL → host.docker.internal:54321, INNGEST_BASE_URL → host.docker.internal:8288
- Per-tenant secrets (NOT in .env): hostfully_api_key, hostfully_agency_uid, slack_bot_token
- VLRE tenant ID: 00000000-0000-0000-0000-000000000003
- Guest messaging archetype ID: 00000000-0000-0000-0000-000000000015

### Docker Command Shape

```
docker run -d --rm \
  --add-host=host.docker.internal:host-gateway \
  --name "employee-<taskId[:8]>" \
  -e KEY=VALUE ... \
  ai-employee-worker:latest \
  node /app/dist/workers/opencode-harness.mjs
```

## USE_LOCAL_DOCKER Implementation (employee-lifecycle.ts)

### Pattern used
- `execSync` for blocking `docker run -d` (returns container ID, non-blocking because of `-d`)
- `spawn` with `detached: true, stdio: 'ignore'` + `.unref()` for detached log tail
- `--add-host=host.docker.internal:host-gateway` on docker run for macOS host networking
- Return `{ id: 'docker_' + containerId.slice(0, 12) }` to match FlyMachine return type

### Delivery site difference
- Delivery site uses `let deliveryMachine: { id: string }` then if/else (no `const` + await at top)
- This is because the Fly path uses `await createMachine(...)` and local path uses sync helper
- `destroyMachine(deliveryFlyApp, deliveryMachine.id)` still runs but fails silently for Docker IDs — acceptable since `--rm` handles cleanup

### Variable scope confirmed
- Line ~286: `tenantEnv`, `supabaseKey`, `feedbackContext`, `learnedRulesContext` all in scope
- Line ~522: `tenantEnvForReply`, `replyContext` in scope inside `reply-anyway-execute` step
- Line ~896: `tenantEnvForApproval` declared at top of `handle-approval-result` step, in scope in for loop

### Lint status
- Zero errors in `employee-lifecycle.ts` after changes
- Pre-existing errors in other files (hostfully tools, test files) are unrelated
