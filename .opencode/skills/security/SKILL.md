---
name: security
description: "Use when handling secrets, encryption, authentication, input validation, or tenant data isolation. Covers this repo's AES-256-GCM tenant-secret pattern, the multi-tenant isolation boundary, and the seed-only token rule."
---

# Security Boundaries — ai-employee

This skill covers only the repo-specific, non-obvious security rules. Skip generic OWASP advice (XSS, SQLi, CSRF basics) — that's assumed knowledge. This is what is _different_ here.

---

## 1. Tenant Secrets — Encrypted, Never in `.env`

Per-tenant credentials (Hostfully, Sifely, per-tenant Slack tokens, GitHub installation IDs, Google OAuth tokens) live **encrypted at rest** in the `tenant_secrets` table — never in `.env`, never in code.

**Encryption is AES-256-GCM** via `src/lib/encryption.ts`. Three exports:

| Export                    | Purpose                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| `encrypt(plaintext)`      | Returns `{ ciphertext, iv, auth_tag }` (all base64) — random 12-byte IV per call |
| `decrypt(payload)`        | Reverses it; the GCM auth tag detects tampering and throws on mismatch           |
| `validateEncryptionKey()` | Asserts `ENCRYPTION_KEY` is a 64-char hex string; called at gateway startup      |

**The ONLY correct path to read/write a tenant secret** is `src/repositories/tenant-secret-repository.ts`, which calls `encrypt()` on write and `decrypt()` on read, and always scopes the row by `tenant_id`.

```typescript
// ✅ CORRECT — repository encrypts + scopes by tenant_id
await tenantSecretRepository.set(tenantId, 'hostfully_api_key', plaintextValue);
const key = await tenantSecretRepository.get(tenantId, 'hostfully_api_key');

// ❌ FORBIDDEN — never store a tenant credential in plaintext or in .env
process.env.HOSTFULLY_API_KEY; // wrong consumption point for tenant data
```

**DO NOT** write a tenant secret to any table, file, or log in plaintext. **DO NOT** bypass `encrypt()`/`decrypt()` — every `ciphertext`/`iv`/`auth_tag` triple must come from `src/lib/encryption.ts`.

---

## 2. `ENCRYPTION_KEY` — 32-byte hex, validated at boot

`ENCRYPTION_KEY` must be a **64-character hex string** (= 32 raw bytes, the key length AES-256 requires). The regex enforced in `validateEncryptionKey()` is `/^[0-9a-f]{64}$/i`.

- `src/gateway/server.ts` calls `validateEncryptionKey()` at startup — a missing or malformed key crashes the gateway immediately (fail-fast, by design).
- **NEVER** hardcode a fallback key or default it to an empty string to "make startup pass." A silent fallback would encrypt production secrets with a guessable key.
- **NEVER** rotate `ENCRYPTION_KEY` without re-encrypting every existing `tenant_secrets` row — the old ciphertext becomes permanently undecryptable (the GCM auth tag will fail).

---

## 3. Tenant Isolation — the First-Class Invariant

Multi-tenancy is mandatory here. See AGENTS.md → **Key Conventions** for the full mandate ("every table, registry, catalog, and query must be scoped by `tenant_id`") — do not duplicate that wording; treat it as the source of truth.

Repo-specific enforcement points:

- Every `tenant_secrets` query keys on the `tenant_id_key` composite (`{ tenant_id, key }`) — there is no global secret lookup.
- Admin task routes are tenant-scoped: `GET /admin/tenants/:tenantId/tasks/:id` returns **404 on cross-tenant access**, not 403 — never leak the existence of another tenant's task.
- Repository classes in `src/repositories/` take `tenantId` as the first argument on every method. A repository method with no tenant scope is a bug.

```typescript
// ✅ tenant_id scopes the row — no cross-tenant read possible
where: {
  tenant_id: (tenantId, key);
}

// ❌ unscoped — would return another tenant's data
where: {
  key;
}
```

**MUST NOT** add any query, cache, or in-memory map that holds data for multiple tenants without a `tenant_id` partition. **MUST NOT** accept a `tenant_id` from a request body when it should come from the authenticated route param.

---

## 4. Admin Routes — `Authorization: Bearer` (SERVICE_TOKEN or Supabase JWT)

All `/admin/*` and `/me` routes are guarded by `authMiddleware` + `requireAuth` + `requireTenantRole`/`requirePermission` from `src/gateway/middleware/auth.ts` and `src/gateway/middleware/authz.ts`.

- **SERVICE_TOKEN path**: timing-safe compare of the Bearer token against `SERVICE_TOKEN()`. Sets `req.isServiceToken = true`. Bypasses all membership checks.
- **Supabase JWT path**: `verifySupabaseJwt(token)` + `ensureUserExists(claims)` upsert. Checks `user.status` per-request — `status = 'disabled'` → 403 `ACCOUNT_DISABLED`.
- Missing or invalid token → 401 `AUTHENTICATION_REQUIRED`. The log line never echoes the provided token.

`X-Admin-Key` / `ADMIN_API_KEY` / `requireAdminKey` are **removed** — not deprecated, gone since T24.

**MUST NOT** add an admin route that skips `authMiddleware + requireAuth`. **DO NOT** replace the SERVICE_TOKEN timing-safe comparison with `===` or `==`. **DO NOT** log the provided or expected token value.

---

## 5. `VLRE_SLACK_BOT_TOKEN` — Seed-Only, Never at Runtime

Two env vars hold the **same** VLRE workspace bot-token value but serve different consumption points:

| Var                    | Consumed by                                                    | Runtime use    |
| ---------------------- | -------------------------------------------------------------- | -------------- |
| `SLACK_BOT_TOKEN`      | Gateway Bolt app (Socket Mode legacy artifact)                 | see note below |
| `VLRE_SLACK_BOT_TOKEN` | `prisma/seed.ts` only — populates `tenant_secrets` on DB reset | **seed-only**  |

- `VLRE_SLACK_BOT_TOKEN` exists **solely** so `prisma/seed.ts` can write the VLRE tenant's bot token into `tenant_secrets` on a fresh DB. It is **never** read at runtime by the gateway or any employee.
- At runtime, the gateway resolves the per-tenant Slack token from the DB (`tenant_secrets` via `TenantInstallationStore`), **not** from either env var. The `SLACK_BOT_TOKEN` env var is a legacy artifact and is NOT used for Socket Mode authorization.
- **NEVER** store either token as the DozalDevs tenant secret — they are VLRE-workspace values.
- **DO NOT** add a runtime code path that reads `VLRE_SLACK_BOT_TOKEN` — if you need a tenant's Slack token at runtime, read it from `tenant_secrets`.

---

## 6. No PII in Logs

The platform processes guest data (names, emails, message bodies). **NEVER** log it.

- **DO NOT** log guest names, email addresses, guest/message content, phone numbers, door codes, or any other personal data — not in `logger.info`, not in error strings, not in step output.
- Log **identifiers** instead: `taskId`, `tenant_id`, `thread_uid`, `message_uid`. These are safe to correlate on.
- This applies doubly to shared files (`src/inngest/`, `src/workers/`, `src/lib/`, `src/gateway/`) which serve all employees — see AGENTS.md → Key Conventions on keeping shared files employee-agnostic.

```typescript
// ✅ safe — opaque identifiers only
logger.info({ taskId, tenant_id }, 'Task dispatched');

// ❌ leaks PII into log storage
logger.info({ guestName, guestEmail, messageBody }, 'Drafting reply');
```

---

## 7. Never Commit Real Secrets

- `.env` is **gitignored** — it is the only place real local secret _values_ live. **NEVER** commit it, and **NEVER** `git add -f` it.
- `.env.example` is the source-of-truth template and is committed. It carries **descriptions and placeholders only** — **NEVER** paste a real key, token, or password into `.env.example`.
- The `TENANT SECRETS` block in `.env.example` is reference-only (a list of secret keys) — never real values.
- `database-backups/` is gitignored (it contains `tenant_secrets` ciphertext + the rest of prod data) — keep it local.

---

## 8. Input Validation — Zod at the Boundary

Every route param and request body is validated by a Zod schema in `src/gateway/validation/schemas.ts` **before** it reaches a handler. Untrusted input never flows into business logic unparsed.

- Parse helpers (`parseJiraWebhook`, `parseHostfullyWebhook`, `parseCreateProject`, …) throw on malformed input — let the error bubble to the route's error handler; do not swallow it.
- **UUID params**: use `uuidField()` / `UUID_REGEX` from this file — **NOT** `z.string().uuid()`. Zod v4's `.uuid()` enforces RFC 4122 version/variant bits and rejects some of our valid tenant/task UUIDs. (See AGENTS.md → Key Conventions, Zod v4 note.)
- Bounded strings: secret values cap at 10000 chars (`SetSecretBodySchema`), KB content at 100000 — keep new free-text fields bounded to resist resource-exhaustion payloads.

```typescript
// ✅ loose UUID regex tolerant of our UUIDs
tenantId: uuidField();

// ❌ may reject valid tenant/task UUIDs at runtime
tenantId: z.string().uuid();
```

**MUST NOT** read `req.body` or `req.params` fields directly in a handler without first running them through the matching schema.

---

## 9. Soft Delete Only

No security-relevant record (tenant, secret, task) is ever hard-deleted — deletion is a `deleted_at` timestamp, and reads filter `deleted_at IS NULL`. This preserves the audit trail. Full rules and the per-table `deleted_at` coverage gap live in the **`prisma`** skill — load it before writing any delete path.

---

## Quick Checklist

| Don't                                                   | Do Instead                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Put a tenant credential in `.env` or code               | Store encrypted in `tenant_secrets` via `tenant-secret-repository.ts`           |
| Bypass `encrypt()`/`decrypt()`                          | All crypto goes through `src/lib/encryption.ts`                                 |
| Default or hardcode a fallback `ENCRYPTION_KEY`         | Let `validateEncryptionKey()` fail-fast at startup                              |
| Write an unscoped multi-tenant query/cache              | Scope every query by `tenant_id`                                                |
| Add an `/admin/*` route without auth guards             | Guard with `authMiddleware + requireAuth + requireTenantRole/requirePermission` |
| Read `VLRE_SLACK_BOT_TOKEN` at runtime                  | Read the tenant's Slack token from `tenant_secrets`                             |
| Log guest names / emails / message bodies               | Log `taskId` / `tenant_id` identifiers only                                     |
| Commit `.env` or paste real secrets into `.env.example` | Keep `.env` local (gitignored); placeholders only in `.env.example`             |
| Read `req.body`/`req.params` raw in a handler           | Parse via a Zod schema in `src/gateway/validation/schemas.ts` first             |
| Use `z.string().uuid()` for tenant/task params          | Use `uuidField()` / `UUID_REGEX`                                                |

---

## 10. RBAC — Roles and Permissions

### Global roles (`Role` enum, `src/lib/auth/permissions.ts`)

| Role             | Scope                   | Key permissions                                                                  |
| ---------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `PLATFORM_OWNER` | Cross-tenant superadmin | All permissions                                                                  |
| `ADMIN`          | Platform-level          | Manage archetypes, rules, KB, locks, projects, trigger employees, invite members |
| `EDITOR`         | Platform-level          | Manage archetypes, rules, KB (no trigger)                                        |
| `USER`           | Platform-level          | Trigger employees, read tasks                                                    |
| `VIEWER`         | Platform-level          | Read tenant and tasks only                                                       |

### Tenant roles (`TenantRole` enum)

| Role     | Key permissions                                                                          |
| -------- | ---------------------------------------------------------------------------------------- |
| `OWNER`  | All tenant permissions including delete tenant, manage secrets/integrations/members      |
| `ADMIN`  | Manage archetypes, rules, KB, locks, projects, trigger, invite (no secrets/integrations) |
| `MEMBER` | Trigger employees, read tasks                                                            |
| `VIEWER` | Read tenant and tasks only                                                               |

Role rank order (highest to lowest): `OWNER(4) > ADMIN(3) > MEMBER(2) > VIEWER(1)`.

Authorization middleware (`src/gateway/middleware/authz.ts`) exports three guards:

- `requireAuth` — passes if `req.isServiceToken` or `req.auth` is set; returns 401 otherwise
- `requireTenantRole(...roles)` — checks the user's `TenantMembership` for the `:tenantId` route param; SERVICE_TOKEN and PLATFORM_OWNER bypass the membership check; returns 403 if the user's role rank is below the minimum required
- `requirePermission(permission)` — checks `ROLE_PERMISSIONS` or `TENANT_ROLE_PERMISSIONS` for the named permission; SERVICE_TOKEN and PLATFORM_OWNER always pass

---

## Cross-References

- `src/lib/encryption.ts` — AES-256-GCM encrypt/decrypt + `validateEncryptionKey()`
- `src/repositories/tenant-secret-repository.ts` — the only sanctioned secret read/write path
- `src/gateway/middleware/auth.ts` — `authMiddleware` (SERVICE_TOKEN + Supabase JWT)
- `src/gateway/middleware/authz.ts` — `requireAuth`, `requireTenantRole`, `requirePermission`
- `src/lib/auth/permissions.ts` — `ROLE_PERMISSIONS`, `TENANT_ROLE_PERMISSIONS`
- `src/gateway/validation/schemas.ts` — Zod schemas, `uuidField()`, `UUID_REGEX`
- `src/gateway/server.ts` — startup `validateEncryptionKey()` call
- `prisma` skill — soft-delete enforcement and `deleted_at` coverage
- AGENTS.md → **Key Conventions** (multi-tenancy mandate) and **Tenants** (token architecture)
