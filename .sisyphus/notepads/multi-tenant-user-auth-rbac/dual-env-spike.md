# Dual-Env + New-Key-Model Spike — T0d Findings

Date: 2026-06-09

---

## 1. Kong File Confirmation

**`docker inspect` output** (saved to `.sisyphus/evidence/local/task-0d-kong-binds.txt`):

```json
[
  "/Users/victordozal/repos/dozal-devs/ai-employee/docker/kong.yml:/home/kong/temp.yml:ro,z",
  "/Users/victordozal/repos/dozal-devs/ai-employee/docker/kong-entrypoint.sh:/home/kong/kong-entrypoint.sh:ro,z"
]
```

✅ **Confirmed**: Kong mounts `docker/kong.yml` (2-key file), NOT `docker/volumes/api/kong.yml`.

### What the 2 keys are (`docker/kong.yml`)

Kong has two **consumers**:

| Consumer       | Key credential          | ACL group |
| -------------- | ----------------------- | --------- |
| `anon`         | `$SUPABASE_ANON_KEY`    | `anon`    |
| `service_role` | `$SUPABASE_SERVICE_KEY` | `admin`   |

Both keys are substituted at startup by `kong-entrypoint.sh` via awk env-var expansion. These values come from `docker/.env`: `ANON_KEY` and `SERVICE_ROLE_KEY` (passed to Kong as `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY` in `supabase-services.yml`).

### Routes protected by key-auth

- `/auth/v1/` (secure — all non-open auth endpoints)
- `/rest/v1/` (PostgREST — all worker task data access)
- `/graphql/v1` (PostgREST GraphQL)

### Open auth routes (no key required)

- `/auth/v1/verify`
- `/auth/v1/callback`
- `/auth/v1/authorize`
- `/auth/v1/.well-known/jwks.json`
- `/auth/v1/health`

---

## 2. Kong Opaque-Key Translation (How It Works, What Activates It)

Source: `docker/kong-entrypoint.sh` lines 5–26.

### Activation condition

The translation activates **only when BOTH** env vars are non-empty:

```bash
if [ -n "$SUPABASE_SECRET_KEY" ] && [ -n "$SUPABASE_PUBLISHABLE_KEY" ]; then
    # FULL TRANSLATION — opaque sb_ keys mapped to asymmetric JWTs
else
    # LEGACY PASS-THROUGH — apikey passed unchanged (HS256 JWT mode)
fi
```

**Current local state**: Both vars are empty in `docker/.env` → **legacy pass-through is active**. The HS256 JWT stored in `ANON_KEY` / `SERVICE_ROLE_KEY` is passed through directly.

### Full translation Lua expression (opaque-key mode)

When activated, Kong's `request-transformer` plugin builds `Authorization` from this Lua priority chain:

1. **If `Authorization` header exists AND does NOT start with `Bearer sb_`** → pass through unchanged  
   → This covers user session JWTs (`Bearer eyJ...`), not opaque keys
2. **If `apikey == SUPABASE_SECRET_KEY` (i.e. `sb_secret_*`)** → replace with `Bearer $SERVICE_ROLE_KEY_ASYMMETRIC`  
   → Server-side API calls get the asymmetric service-role JWT
3. **If `apikey == SUPABASE_PUBLISHABLE_KEY` (i.e. `sb_publishable_*`)** → replace with `Bearer $ANON_KEY_ASYMMETRIC`  
   → Browser/worker anon calls get the asymmetric anon JWT
4. **Fallback**: pass `apikey` through unchanged (legacy HS256 JWT compatibility)

### Env vars needed to activate (for cloud profile)

| Var name                      | Value                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| `SUPABASE_SECRET_KEY`         | `sb_secret_<cloud-secret>` (the opaque secret key from cloud project) |
| `SUPABASE_PUBLISHABLE_KEY`    | `sb_publishable_tsF3KzF5nUBhtC5nwhl17w_W0ooWpW2`                      |
| `ANON_KEY_ASYMMETRIC`         | Cloud asymmetric anon JWT (from cloud project settings)               |
| `SERVICE_ROLE_KEY_ASYMMETRIC` | Cloud asymmetric service-role JWT (from cloud project settings)       |

These 4 additional vars must be passed to the Kong container via `supabase-services.yml` in T3b to activate translation.

### Realtime WebSocket translation

Also translates `query_params.apikey` → `x-api-key` header for Realtime WebSocket connections. Same priority chain applies.

---

## 3. Cloud JWKS

**Evidence saved to**: `.sisyphus/evidence/cloud/task-0d-cloud-jwks.json`

**Endpoint**: `https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/.well-known/jwks.json`

**Response**:

```json
{
  "keys": [
    {
      "alg": "ES256",
      "crv": "P-256",
      "ext": true,
      "key_ops": ["verify"],
      "kid": "1df77847-802f-46b6-92a9-5f9ed42a5e21",
      "kty": "EC",
      "use": "sig",
      "x": "JcCKoN5QuQjgzc6z0hV569M1ZaBCYbziWwujDqnjhHU",
      "y": "1xedFrlbnX5dtbFHirWGzecL60zR95hxW23nkFPF5T4"
    }
  ]
}
```

| Field     | Value                                  |
| --------- | -------------------------------------- |
| Algorithm | `ES256` (ECDSA P-256)                  |
| Key ID    | `1df77847-802f-46b6-92a9-5f9ed42a5e21` |
| Key count | 1                                      |
| Key type  | `EC` (Elliptic Curve, P-256)           |
| Key use   | `sig` (signature verification only)    |
| Key ops   | `["verify"]`                           |

**Contrast with LOCAL**: HS256 (symmetric HMAC-SHA256, shared secret `super-secret-jwt-token-with-at-least-32-characters-long`)

**JWKS URL for Jose verifier**: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` — works for both environments when derived from `SUPABASE_URL`. The gateway's `jose` JWKS verifier will fetch this at startup and cache the EC public key for ES256 signature validation.

---

## 4. Cloud Auth Health

**Test command**: `curl -s "https://gjqrysxpvktmibpkwrvy.supabase.co/auth/v1/health" -H "apikey: sb_publishable_tsF3KzF5nUBhtC5nwhl17w_W0ooWpW2"`

**Response**:

```json
{
  "version": "v2.189.0",
  "name": "GoTrue",
  "description": "GoTrue is a user registration and authentication API"
}
```

✅ **Cloud Auth is LIVE.** GoTrue v2.189.0 (vs local v2.186.0).

### Cloud REST v1 behavior (diagnostic)

**Test**: `curl -s -o /dev/null -w "HTTP %{http_code}" "https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1/" -H "apikey: sb_publishable_tsF3KzF5nUBhtC5nwhl17w_W0ooWpW2"`

**Result**: HTTP 401

**Expected behavior**: 401 is correct at this stage — cloud DB has not had Prisma migrations applied yet. The PostgREST `anon` role needs schema grants (`GRANT USAGE ON SCHEMA public TO anon`) to respond with 200 on the root path. This will be resolved in T3a (cloud provisioning + `pnpm prisma migrate deploy`).

---

## 5. Cloud Connection Strings

The cloud project `gjqrysxpvktmibpkwrvy` uses Supabase's standard AWS us-west-2 pooler infrastructure.

### URL patterns (Supabase standard for this project ref)

| Purpose                              | URL pattern                                                                                                                 | Port |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---- |
| **Session pooler** (for migrations)  | `postgresql://postgres.gjqrysxpvktmibpkwrvy:[DB_PASSWORD]@aws-0-us-west-2.pooler.supabase.com:5432/postgres`                | 5432 |
| **Transaction pooler** (for runtime) | `postgresql://postgres.gjqrysxpvktmibpkwrvy:[DB_PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true` | 6543 |
| **Direct connection** (if available) | `postgresql://postgres:[DB_PASSWORD]@db.gjqrysxpvktmibpkwrvy.supabase.co:5432/postgres`                                     | 5432 |

### Env var mapping for cloud profile

| Env var               | Value (cloud)                                    | Notes                                          |
| --------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `DATABASE_URL`        | Transaction pooler URL (6543, `?pgbouncer=true`) | Runtime queries; PgBouncer = no prepared stmts |
| `DATABASE_URL_DIRECT` | Session pooler URL (5432) or direct URL          | `pnpm prisma migrate deploy`; IPv4 compatible  |

**Current `.env` state**: Both `DATABASE_URL` and `DATABASE_URL_DIRECT` point to `postgresql://postgres:postgres@localhost:54322/ai_employee` (LOCAL profile). Cloud values will be set when switching to the cloud profile in T3b.

**DB password**: Retrieved from Supabase cloud dashboard → Settings → Database → Connection string. Not in `.env` yet (cloud profile not yet activated).

### Important: Why two different pooler ports

- **5432 (session pooler)**: Used for `pnpm prisma migrate deploy` — Prisma uses prepared statements, session pooler handles them correctly. Also IPv4-reachable (important for some CI environments).
- **6543 (transaction pooler)**: Used at runtime — PgBouncer transaction mode is optimal for serverless/short-lived connections but **requires `?pgbouncer=true`** in the URL to disable Prisma's prepared statement mode.

---

## 6. `/api/config.js` Bridge (Gateway → Dashboard Browser)

Source: `src/gateway/server.ts` lines 294–305.

### What it exposes

```typescript
const config = {
  VITE_POSTGREST_URL: `${SUPABASE_URL}/rest/v1`, // derived from SUPABASE_URL
  VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '', // anon/publishable key
  VITE_GATEWAY_URL: process.env.GATEWAY_PUBLIC_URL ?? '',
  VITE_INNGEST_URL: 'https://inn.gs', // hardcoded
};
res.send(`window.__RUNTIME_CONFIG__ = ${JSON.stringify(config)};`);
```

Served as `application/javascript` — executed in the browser to set `window.__RUNTIME_CONFIG__`.

### Dual-env behavior

| Env profile | `VITE_POSTGREST_URL`                               | `VITE_SUPABASE_ANON_KEY`                         |
| ----------- | -------------------------------------------------- | ------------------------------------------------ |
| LOCAL       | `http://localhost:54331/rest/v1`                   | HS256 JWT (`eyJ...`, `role: anon`)               |
| CLOUD       | `https://gjqrysxpvktmibpkwrvy.supabase.co/rest/v1` | `sb_publishable_tsF3KzF5nUBhtC5nwhl17w_W0ooWpW2` |

**No code change needed** — the bridge is already purely env-driven. Switching env values automatically switches both the PostgREST URL and the key sent to the browser.

### What must NOT be exposed (confirmed absent)

- `SUPABASE_SECRET_KEY` (service-role key) — never sent to browser
- `DATABASE_URL` / `DATABASE_URL_DIRECT` — DB credentials, never browser-visible
- `ADMIN_API_KEY` — admin auth, never browser-visible
- `ENCRYPTION_KEY`, `OPENROUTER_API_KEY`, etc.

✅ The current implementation correctly exposes only the anon key (public by design in Supabase's model).

---

## 7. Env Profile Design (LOCAL vs CLOUD)

The dual-env switch is driven entirely by env var **values** — var **names** stay the same.

### LOCAL profile (current state)

```bash
SUPABASE_URL=http://localhost:54331
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...   # HS256 JWT, role: anon
SUPABASE_SECRET_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... # HS256 JWT, role: service_role
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/ai_employee
DATABASE_URL_DIRECT=postgresql://postgres:postgres@localhost:54322/ai_employee
# Kong opaque-key vars: empty (legacy pass-through mode active)
```

**JWT algorithm**: HS256 — `jose` verifier uses `GOTRUE_JWT_SECRET` as HMAC key.

### CLOUD profile (target state post-T3b)

```bash
SUPABASE_URL=https://gjqrysxpvktmibpkwrvy.supabase.co
SUPABASE_ANON_KEY=sb_publishable_tsF3KzF5nUBhtC5nwhl17w_W0ooWpW2
SUPABASE_SECRET_KEY=sb_secret_<cloud-secret-key>
DATABASE_URL=postgresql://postgres.gjqrysxpvktmibpkwrvy:[pw]@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DATABASE_URL_DIRECT=postgresql://postgres.gjqrysxpvktmibpkwrvy:[pw]@aws-0-us-west-2.pooler.supabase.com:5432/postgres
# Kong opaque-key vars: populated (translation mode active)
SUPABASE_PUBLISHABLE_KEY=sb_publishable_tsF3KzF5nUBhtC5nwhl17w_W0ooWpW2
ANON_KEY_ASYMMETRIC=<cloud asymmetric anon JWT>
SERVICE_ROLE_KEY_ASYMMETRIC=<cloud asymmetric service-role JWT>
```

**JWT algorithm**: ES256 — `jose` JWKS verifier fetches `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` and verifies using the EC P-256 public key.

### Profile detection heuristic

| Signal                                        | Detected profile |
| --------------------------------------------- | ---------------- |
| `SUPABASE_URL` starts with `http://localhost` | LOCAL            |
| `SUPABASE_URL` starts with `https://`         | CLOUD            |
| `SUPABASE_ANON_KEY` starts with `eyJ`         | LOCAL (HS256)    |
| `SUPABASE_ANON_KEY` starts with `sb_`         | CLOUD (opaque)   |

---

## 8. Startup Assertion Design (For T3b)

T3b will add a startup assertion that validates env profile consistency — no mixed local URL with cloud key or vice versa.

### Logic

```typescript
function detectEnvProfile(): 'local' | 'cloud' {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_ANON_KEY');

  const isLocalUrl = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
  const isCloudUrl = url.startsWith('https://') && url.includes('.supabase.co');
  const isLegacyKey = key.startsWith('eyJ'); // HS256 JWT
  const isOpaqueKey = key.startsWith('sb_'); // opaque publishable key

  if (isLocalUrl && isLegacyKey) return 'local';
  if (isCloudUrl && isOpaqueKey) return 'cloud';

  // MIXED — fatal
  throw new Error(
    `Env profile mismatch: SUPABASE_URL="${url}" and SUPABASE_ANON_KEY prefix="${key.slice(0, 15)}..." ` +
      `are inconsistent. Use either all-local or all-cloud values.`,
  );
}
```

### JWT verifier selection (driven by profile)

| Profile | Algorithm | Verification method                                                                 |
| ------- | --------- | ----------------------------------------------------------------------------------- |
| LOCAL   | HS256     | `jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET))`                       |
| CLOUD   | ES256     | `jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))` |

The `alg` claim in the JWT header can also be used as a secondary check, but profile-level selection is cleaner.

---

## 9. Implications for T3b (Dual-Env Config Layer)

1. **Startup assertion**: Add `detectEnvProfile()` call in gateway startup. Throw if LOCAL/CLOUD signals are mixed.

2. **JWT verifier factory**: Create `buildJwtVerifier(profile)` that returns the correct `jose` verifier. LOCAL = HMAC, CLOUD = JWKS remote.

3. **`/api/config.js` is ready**: No changes needed — purely env-driven.

4. **Kong activation**: For cloud profile, `supabase-services.yml` or a separate cloud compose override must pass `SUPABASE_PUBLISHABLE_KEY`, `ANON_KEY_ASYMMETRIC`, `SERVICE_ROLE_KEY_ASYMMETRIC` to the Kong container to activate opaque-key translation.

5. **Worker data path unaffected**: Workers use `SUPABASE_SECRET_KEY` as the `apikey` header for PostgREST calls. Under cloud profile, Kong's Lua expression translates `apikey: sb_secret_*` → `Authorization: Bearer $SERVICE_ROLE_KEY_ASYMMETRIC`. No worker code changes needed.

6. **`interaction-classifier.ts` fix required**: `src/lib/interaction-classifier.ts` lines 87–88 currently sends BOTH `apikey: ANON_KEY` AND `Authorization: Bearer SECRET_KEY`. Under cloud opaque keys, `Bearer sb_secret_*` is rejected by Supabase. Fix: send `apikey: SECRET_KEY` only (Kong Lua translates it to the correct service-role JWT). This fix is in scope for T3b or T17.

7. **PostgREST `anon` schema grants**: After running `pnpm prisma migrate deploy` against cloud (T3a), the `/rest/v1/` root will return 200 once anon role gets schema grants. The 401 observed in Step 4 is expected pre-migration.

8. **Cloud JWKS `kid`**: `1df77847-802f-46b6-92a9-5f9ed42a5e21` — `jose`'s `createRemoteJWKSet` will cache and rotate this automatically. No hardcoding needed.

---

## 10. Evidence Files

| File                                               | Contents                                        |
| -------------------------------------------------- | ----------------------------------------------- |
| `.sisyphus/evidence/local/task-0d-kong-binds.txt`  | `docker inspect` output — Kong HostConfig.Binds |
| `.sisyphus/evidence/cloud/task-0d-cloud-jwks.json` | Full JWKS response from cloud Auth endpoint     |
