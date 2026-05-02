# Issues — gm23-sifely-crud

## [2026-05-01] T3 BLOCKER: SIFELY credentials not configured

### Issue

Live VLRE API validation (T3) cannot proceed — Sifely credentials are not configured in this environment.

### What was checked

1. **`.env`** (35 lines) — No `SIFELY_*` variables
2. **`tenant_secrets` DB table, VLRE tenant** (`00000000-0000-0000-0000-000000000003`) — Only `hostfully_api_key` and `hostfully_agency_uid` exist; no `sifely_username`, `sifely_password`, `sifely_client_id`
3. **Shell environment** — No `SIFELY_*` env vars set
4. **Tenant config JSON** — No Sifely credentials

### Expected configuration (per `.env.example` lines 144-154)

Credentials should be stored in `tenant_secrets` via the admin API:

```bash
ADMIN_API_KEY=031ef6bd6f06d069a20957bd3fd2699bb9c0d24c161feae9a9b772c69835f374
TENANT=00000000-0000-0000-0000-000000000003

curl -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/secrets/sifely_client_id" \
  -d '{"value":"VLRE"}'

curl -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/secrets/sifely_username" \
  -d '{"value":"admin@vlrealestate.co"}'

curl -X PUT -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  "http://localhost:7700/admin/tenants/$TENANT/secrets/sifely_password" \
  -d '{"value":"<md5-hash-of-actual-password>"}'
```

### Known values

- `SIFELY_CLIENT_ID`: `VLRE` (from .env.example)
- `SIFELY_USERNAME`: `admin@vlrealestate.co` (from .env.example)
- `SIFELY_PASSWORD`: **UNKNOWN** — MD5 hash of actual password not documented anywhere

### To resolve

1. Get the MD5 hash of the VLRE Sifely admin password
2. Store the 3 credentials via the admin API (commands above)
3. Re-run T3 validation:
   ```bash
   SIFELY_USERNAME=admin@vlrealestate.co \
   SIFELY_PASSWORD=<md5-hash> \
   SIFELY_CLIENT_ID=VLRE \
     npx tsx src/worker-tools/locks/sifely-client.ts --action list-locks
   ```

### Impact

- All T3 evidence files are BLOCKED (task-3-\*.txt all show BLOCKED status)
- No test passcodes were created → no cleanup needed
- The code itself (sifely-client.ts) is correct; this is a configuration-only issue
- T4 (story map update) should be deferred until T3 can run with real credentials

### Note on gateway offline failures

If/when credentials are configured and mutations fail with error code `-2012` (gateway offline) or `-3002` (no gateway), this is a **known environment limitation** — not a code bug. Gateway mode (`addType=2`) requires a physical gateway device paired with the lock to be online. See task description §4 step 3 for handling.
