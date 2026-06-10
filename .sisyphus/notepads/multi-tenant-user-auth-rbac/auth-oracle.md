# Oracle Consult — T0c: SERVICE_TOKEN Design & Auth-Resolution Order

**Date**: 2026-06-09  
**Scope**: Security design validation for multi-tenant auth RBAC system. Read-only consultation.

---

## 1. SERVICE_TOKEN Design Verdict

### Q1: Single shared token vs per-caller tokens?

**Verdict: Single shared token is correct for this system.**

Rationale:
- The callers (scripts, crons, Inngest functions) all run in the same trust boundary — they are all first-party platform infrastructure, not third-party integrations.
- Per-caller tokens only add value when you need to audit *which* caller made a request, or when you need to revoke one caller without affecting others. Neither need exists here: all callers are platform-internal, and a compromise of any one of them (e.g., a leaked Inngest signing key) already implies full platform compromise.
- Per-caller tokens multiply the rotation surface area and the "where is this token stored?" problem by N, with no security gain.
- **Exception trigger**: If a third-party system (e.g., an external cron service, a partner webhook) ever needs machine access, issue it a separate token. First-party infra → single token.

### Q2: Where should it be stored?

**Verdict: `.env` only. Never in DB. Never served to browser.**

- `.env` → `src/lib/config.ts` as a lazy getter (matching the existing `ADMIN_API_KEY` pattern).
- The `/api/config.js` endpoint at `server.ts:295-305` currently exposes `SUPABASE_ANON_KEY` and `VITE_GATEWAY_URL` to the browser. `SERVICE_TOKEN` must **never** appear in that object. Audit this endpoint after any config.ts change.
- Worker containers receive it via `machine-provisioner.ts` env injection — this is the correct path. Confirm it is NOT included in the env manifest sent to workers unless a worker actually needs to call the gateway (currently none do — workers use PostgREST directly).

### Q3: Rotation strategy?

**Verdict: Manual rotation, ~90-day cadence, blast radius is contained.**

- Generate a new random 32-byte hex string (`openssl rand -hex 32`).
- Update `.env` (local) and the production secret store (Render env var).
- Restart the gateway process — the lazy getter picks up the new value on next call.
- **Blast radius**: Only the gateway process and the callers that hold the token. Since all callers are first-party scripts/crons that read from `.env` or the same secret store, rotation is a single-step update. No user sessions are affected.
- **No automated rotation needed** at this scale. Add it to a quarterly ops checklist.

### Q4: Correct HTTP header?

**Verdict: `Authorization: Bearer <token>`**

Reasoning:
- `Authorization: Bearer` is the standard HTTP auth header. Middleware can check `req.headers.authorization` with a `Bearer ` prefix strip — this is idiomatic Express.
- `X-Admin-Key` (current) is a custom header that works but is non-standard. The migration to `Authorization: Bearer` is a clean improvement.
- **Important**: The new middleware must check `Authorization: Bearer <token>` for `SERVICE_TOKEN` AND `Authorization: Bearer <jwt>` for Supabase JWTs. Distinguish them by attempting JWT verification first (JWTs have 3 dot-separated segments); if verification fails or the token is not a JWT, treat it as a static bearer token and compare against `SERVICE_TOKEN`. See auth-resolution order in §2.

### Q5: Should it have an expiry?

**Verdict: Static secret (no expiry). Do NOT use a time-limited JWT.**

- A time-limited JWT for a machine token adds complexity (who issues it? who rotates it before expiry?) with no meaningful security gain for a single-tenant internal service.
- The blast radius of a leaked static token is already bounded: it only works against your own gateway, and rotation is fast (see Q3).
- JWTs for machine tokens make sense when you have a token-issuing authority (e.g., a separate auth service) and short-lived tokens are operationally feasible. Neither applies here.
- **If you ever move to a multi-region or multi-gateway deployment**, revisit this — short-lived tokens become more valuable when you can't instantly rotate across all instances.

---

## 2. Auth-Resolution Order Verdict

**Verdict: Check in this order:**

```
1. SERVICE_TOKEN  (Authorization: Bearer <static-token>)
2. Supabase JWT   (Authorization: Bearer <jwt>)
3. Legacy ADMIN_API_KEY  (X-Admin-Key: <key>)  ← migration window only
```

### Why this order?

**SERVICE_TOKEN first:**
- Machine callers are the most frequent callers of admin routes (Inngest functions, crons, scripts). Checking them first avoids the DB round-trip for the majority of traffic.
- Static token comparison is O(1) with `timingSafeEqual` — cheaper than JWT verification.
- If the token is a valid JWT (3 dot-separated segments), skip to step 2. If it's a flat string, compare against `SERVICE_TOKEN`.

**Supabase JWT second:**
- Human dashboard users. JWT verification requires JWKS fetch (cached) or shared-secret HMAC — still fast, but involves crypto.
- After JWT verification, do the DB lookup (users + tenant_memberships) to derive role. This is the only path that hits the DB.

**Legacy ADMIN_API_KEY last:**
- Kept for backward compatibility during migration window.
- Checking it last means it only fires for callers that haven't migrated yet — minimizes its exposure surface.
- **Remove in Wave 4** as planned. Do not extend the migration window.

### Security implications of each ordering:

| Ordering choice | Risk |
|---|---|
| JWT before SERVICE_TOKEN | Adds DB round-trip for every machine call. No security difference. |
| Legacy key first | Slightly increases the window where a timing attack on the legacy key could succeed. Negligible at this scale, but wrong direction. |
| Legacy key removed early | Breaks callers that haven't migrated. Don't do this. |

**One concrete risk to flag**: If `Authorization: Bearer` is used for both SERVICE_TOKEN and JWT, the middleware must not short-circuit on "not a valid JWT" and return 401 — it must fall through to the static token check. Implement as: try JWT parse → if valid JWT structure, verify as JWT; if not JWT structure, compare as static token.

---

## 3. Deactivation Enforcement Verdict

**Verdict: The two-mechanism approach is correct. Add `deleted_at` check. One pitfall to address.**

### Mechanism 1: `users.status = 'disabled'` per-request check ✅

This is the right primary mechanism. It provides immediate lockout without waiting for JWT expiry. The per-request DB lookup (which you're already doing for role derivation) should include this check in the same query — no extra round-trip needed.

### Mechanism 2: Supabase ban ✅ (with caveat)

Supabase ban blocks token refresh, so the user can't get a new JWT after the current one expires (~1h). This is the correct secondary mechanism. The ~1h window is acceptable for most deactivation scenarios (e.g., offboarding an employee).

**If you need sub-1h lockout** (e.g., security incident), the `users.status` per-request check handles it — the Supabase ban is belt-and-suspenders.

### Should we also check `users.deleted_at`?

**Yes — check both `status = 'disabled'` AND `deleted_at IS NOT NULL` in the same query.**

A soft-deleted user should be treated identically to a disabled user: 401 on every request. The query should be:

```sql
SELECT u.id, u.role, u.status, u.deleted_at, tm.role as tenant_role
FROM users u
LEFT JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = $tenantId AND tm.deleted_at IS NULL
WHERE u.id = $sub
  AND u.deleted_at IS NULL   -- ← add this
  AND u.status != 'disabled' -- ← existing check
```

If the user row is missing or soft-deleted, return 401 (not 403 — don't confirm the user exists).

### Pitfall: Race condition between disable and in-flight requests

If a user is disabled mid-request (after the auth check passes but before the operation completes), the operation will succeed. This is acceptable — the window is milliseconds, and the next request will be blocked. Do not add distributed locking for this.

---

## 4. Identity-Only JWT Pitfalls

### Q1: Race conditions between JWT issuance and DB state?

**Low risk, one edge case to handle.**

The JWT is issued at login time. The DB lookup happens at request time. The gap between them is the JWT lifetime (1h). Scenarios:

- **User created, JWT issued, then user disabled before JWT expires**: Handled by the per-request `status` check (§3). ✅
- **User created, JWT issued, then tenant membership removed**: The per-request `tenant_memberships` lookup will return no row → 403. ✅
- **User role elevated (e.g., VIEWER → ADMIN) after JWT issued**: The per-request DB lookup picks up the new role immediately. ✅ (This is the benefit of DB-authoritative design.)
- **JWT issued for a user that doesn't exist in `users` table yet**: This can happen if the Supabase Auth user is created but the `users` row hasn't been inserted yet (e.g., a trigger or webhook is delayed). **Mitigation**: The auth middleware should treat "user not found in `users` table" as 401, not 403. The `users` row should be created synchronously at signup (not via async webhook).

### Q2: TOCTOU issues with per-request DB lookup?

**Negligible for this use case.**

TOCTOU (time-of-check-time-of-use) is a concern when the check and the use are separated by a meaningful window. Here, the check (DB lookup) and the use (route handler execution) are in the same request, milliseconds apart. The only realistic TOCTOU scenario is a concurrent admin operation that changes the user's role between the auth check and the route handler — this is acceptable eventual consistency for an admin panel.

**Do not use a transaction for the auth check + route handler.** It would hold a DB connection for the entire request duration and provide no meaningful security benefit.

### Q3: Is checking `users.status` + `tenant_memberships` in a single query sufficient, or should we use a transaction?

**Single query is sufficient. No transaction needed.**

The auth check is a read-only operation. A transaction would only be needed if you were reading and then writing based on the read result in a way that required atomicity. The auth middleware only reads — the route handler writes. These are separate concerns. Use a single efficient query (see §3 for the recommended SQL shape).

**One optimization**: Cache the auth result for the duration of the request (attach to `req.user`) so that if multiple middleware layers or route handlers need the user's role, they don't re-query the DB.

---

## 5. Additional Security Concerns

### A. `/api/config.js` exposure surface (HIGH — verify before shipping)

`server.ts:295-305` serves `SUPABASE_ANON_KEY` to the browser. This is intentional and correct — the anon key is publishable. However, after the RBAC migration:
- Verify `SERVICE_TOKEN` is never added to this object.
- Verify `SUPABASE_SECRET_KEY` is never added to this object.
- The `VITE_GATEWAY_URL` is also served here — this is fine (it's a URL, not a secret).

**Action**: Add a lint rule or test that asserts the config.js endpoint never contains the strings `SERVICE_TOKEN`, `SECRET_KEY`, or `ADMIN_API_KEY`.

### B. Worker env injection — SERVICE_TOKEN must NOT be injected into workers

`machine-provisioner.ts` assembles the env manifest for worker containers. Workers communicate with Supabase via PostgREST (not the gateway), so they have no need for `SERVICE_TOKEN`. Confirm it is not included in the env manifest. If a future worker needs to call the gateway, create a scoped token for that purpose rather than reusing `SERVICE_TOKEN`.

### C. Timing-safe comparison for SERVICE_TOKEN (already done for ADMIN_API_KEY)

The existing `admin-auth.ts` uses `crypto.timingSafeEqual` with a length pre-check. The new `SERVICE_TOKEN` middleware must replicate this pattern exactly — including the length check before `timingSafeEqual` (which throws on unequal buffer lengths). Do not use `===` for token comparison.

### D. 401 vs 403 response semantics

- **401 Unauthorized**: The request lacks valid credentials (no token, invalid token, expired JWT, user not found/disabled). Do not reveal *why* the token is invalid.
- **403 Forbidden**: Valid credentials, but insufficient permissions (wrong role, not a member of the tenant).
- **404 vs 403 for tenant existence**: When a user is authenticated but not a member of `:tenantId`, returning 404 (instead of 403) prevents tenant-existence enumeration. This is a minor hardening — implement if the threat model includes authenticated-but-unauthorized users probing tenant IDs.

### E. Legacy ADMIN_API_KEY migration window — enforce a hard deadline

The dual-accept window is a security debt. Every day it stays open is a day the legacy key can be used. Recommended: set a hard removal date in the plan (Wave 4), add a startup warning log if `ADMIN_API_KEY` is still set after that date, and track which callers have migrated via access logs.

### F. Bootstrap PLATFORM_OWNER — chicken-and-egg risk

The plan notes that a PLATFORM_OWNER must be created before the admin key is removed. This is correct. The risk: if the bootstrap step fails silently (e.g., the `users` row is created but the `role` is not set to `PLATFORM_OWNER`), you lock yourself out. **Mitigation**: The bootstrap script should verify the PLATFORM_OWNER row exists and has the correct role before returning success. Add a startup check that warns if no PLATFORM_OWNER exists.

---

## Summary Table

| Question | Verdict |
|---|---|
| Single vs per-caller SERVICE_TOKEN | Single shared token |
| Storage | `.env` only, never DB, never `/api/config.js` |
| Rotation | Manual, ~90 days, single-step |
| HTTP header | `Authorization: Bearer <token>` |
| Expiry | Static secret, no expiry |
| Auth resolution order | SERVICE_TOKEN → JWT → legacy key |
| Deactivation | `status` check + `deleted_at` check in same query; Supabase ban as secondary |
| JWT TOCTOU | Negligible; single query sufficient; no transaction needed |
| Top additional risk | `/api/config.js` must never expose SERVICE_TOKEN or SECRET_KEY |
