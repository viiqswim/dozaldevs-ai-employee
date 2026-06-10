# Auth Spike — T0a Findings

Date: 2026-06-09

## 1. Active Compose File

The active compose file is `docker/supabase-services.yml` (confirmed by context). The Kong container mounts:

- `docker/kong.yml` → `/home/kong/temp.yml:ro` (**2-key file**, NOT `docker/volumes/api/kong.yml` which has 4 keys)
- `docker/kong-entrypoint.sh` → `/home/kong/kong-entrypoint.sh:ro`

**Implication**: The active Kong config is `docker/kong.yml` (2 keys). The `docker/volumes/api/kong.yml` (4 keys) is NOT mounted.

## 2. Auth Container

- **Container name**: `ai-employee-auth`
- **GoTrue version**: v2.186.0 (confirmed running)
- **API host**: `0.0.0.0:9999` (internal)
- **External URL**: `http://localhost:54331` (via Kong)
- **Site URL**: `http://localhost:3000`
- **DB**: `postgres://supabase_auth_admin:postgres@shared-postgres:5432/ai_employee`
- **Mailer autoconfirm**: `true` (email verification skipped — users auto-confirmed)
- **Signup disabled**: `false` (open signup)
- **Anonymous users**: `false` (disabled)

## 3. JWT Configuration

| Setting                         | Value                                                     |
| ------------------------------- | --------------------------------------------------------- |
| `GOTRUE_JWT_SECRET`             | `super-secret-jwt-token-with-at-least-32-characters-long` |
| `PGRST_JWT_SECRET`              | `super-secret-jwt-token-with-at-least-32-characters-long` |
| **Match?**                      | ✅ YES — PostgREST trusts GoTrue JWTs                     |
| `GOTRUE_JWT_AUD`                | `authenticated`                                           |
| `GOTRUE_JWT_EXP`                | `3600` (1 hour)                                           |
| `GOTRUE_JWT_ADMIN_ROLES`        | `service_role`                                            |
| `GOTRUE_JWT_DEFAULT_GROUP_NAME` | `authenticated`                                           |

## 4. JWT Algorithm

- **Algorithm**: `HS256` (HMAC-SHA256, symmetric shared secret)
- **Type**: `JWT`

## 5. Baseline JWT Claims (spike-0a@test.com)

```json
{
  "sub": "543343e2-7809-4422-8acb-556205246939",
  "aud": "authenticated",
  "exp": 1780987987,
  "iat": 1780984387,
  "email": "spike-0a@test.com",
  "phone": "",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"]
  },
  "user_metadata": {
    "email": "spike-0a@test.com",
    "email_verified": true,
    "phone_verified": false,
    "sub": "543343e2-7809-4422-8acb-556205246939"
  },
  "role": "authenticated",
  "aal": "aal1",
  "amr": [{ "method": "password", "timestamp": 1780984387 }],
  "session_id": "1dad801f-2e19-486a-aa25-1b1a4d28132a",
  "is_anonymous": false
}
```

### Key Assertions

- ✅ `sub` is a UUID: `543343e2-7809-4422-8acb-556205246939`
- ✅ `role == "authenticated"`
- ✅ `aud` is present: `"authenticated"`
- ✅ NO custom membership claims (no `tenant_id`, no `org_id`, no `role` beyond `authenticated`)
- ✅ `is_anonymous: false`

## 6. SUPABASE_ANON_KEY Format

The anon key in `.env` is a JWT with:

```json
{
  "role": "anon",
  "iss": "supabase",
  "iat": 1776793428,
  "exp": 2092153428
}
```

- **Format**: Standard Supabase anon JWT (not legacy format)
- **Length**: 169 characters
- **No `sub` claim** — this is a service-level key, not a user key

## 7. PostgREST Config

- **Anon role**: `anon`
- **DB schemas**: `public,storage`
- **JWT secret**: matches GoTrue (see §3)

## 8. Implications for RBAC Implementation

1. **No custom claims in baseline JWT** — to add `tenant_id` or `role` claims, we need either:
   - GoTrue access token hook (custom JWT claims via DB function)
   - OR store membership in DB and look up via `auth.uid()` in RLS policies
2. **HS256 shared secret** — symmetric, so PostgREST can verify GoTrue JWTs without asymmetric key distribution

3. **`auth.uid()` = `sub` claim** — PostgREST exposes `auth.uid()` as the `sub` UUID from the JWT. This is the stable user identifier for RLS policies.

4. **`auth.role()` = `role` claim** — returns `"authenticated"` for logged-in users, `"anon"` for anon key requests

5. **Kong file**: `docker/kong.yml` (2 keys) is active. If RBAC needs Kong-level changes, this is the file to modify.

6. **Mailer autoconfirm = true** — test users are auto-confirmed, no email verification needed in dev

## 9. Evidence Files

- `.sisyphus/evidence/local/task-0a-auth-env.json` — full GoTrue container env
- `.sisyphus/evidence/local/task-0a-jwt-decode.txt` — JWT header, payload, and anon key decode
