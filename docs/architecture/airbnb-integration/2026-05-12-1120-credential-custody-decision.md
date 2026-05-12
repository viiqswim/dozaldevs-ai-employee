# Airbnb Credential Custody — Analysis & Decision

**Research Date**: May 2026  
**Authored by**: T8 research spike — AI Employee Platform  
**Prerequisites**: T4 Partner API analysis (complete), T2 tooling setup (complete)  
**Status**: Research only — no production code, no real credentials stored

---

## Executive Summary

**Recommendation: DO NOT BUILD a direct Airbnb integration using private/unofficial API credentials.**

The credential custody model for a direct Airbnb integration is fundamentally incompatible with the AI Employee Platform's multi-tenant architecture and security posture. Unlike the Hostfully integration (which uses a per-tenant API key with no user-level access), a direct Airbnb integration — outside of the closed Partner API program — requires storing **full Airbnb account credentials** (email + password, or long-lived session tokens) on behalf of each host. These credentials grant unrestricted access to the host's entire Airbnb account, have no scope limitation, have no standard revocation mechanism, and their storage would constitute a violation of Airbnb's Terms of Service.

The official Partner API uses OAuth 2.0 and would be the only viable credential model — but that API is closed/invite-only (T4 verdict: NO-GO). Until the platform achieves Partner API access, there is no safe credential custody path for a direct Airbnb integration.

**The custody model question resolves to: the credential model makes a direct integration significantly less viable, not more.** It is an additional deal-breaker on top of the Partner API access barrier identified in T4.

---

## Section 1: What Credentials Are Required

### 1.1 Two Distinct Scenarios

The credential question has a completely different answer depending on which integration path is taken:

| Path                            | Credential Type                                     | Access Level                  | Viable?                  |
| ------------------------------- | --------------------------------------------------- | ----------------------------- | ------------------------ |
| **Official Airbnb Partner API** | OAuth 2.0 client_credentials (server-to-server)     | Scoped to granted permissions | ❌ Blocked (invite-only) |
| **Private/unofficial API**      | Email + password → auth token + device ID + API key | Full account access           | ❌ ToS violation         |
| **Hostfully (current)**         | Hostfully API key                                   | Scoped Hostfully API only     | ✅ In use today          |

### 1.2 Private API Credential Stack

Based on reverse-engineering community research (airbnb-private-api, airbnbapijs, airbnb-python libraries and their documentation):

The Airbnb private API — used by Airbnb's own mobile apps — requires the following to authenticate:

**Step 1: One-time authentication**

- **Email address** — the host's registered Airbnb email
- **Password** — the host's Airbnb password (in plaintext in the request body during login)
- **Device ID** — a 32-character alphanumeric string generated per-device (can be any valid UUID-like string)
- **API key (client_id)** — a static key embedded in Airbnb's mobile clients (`d306zoyjsyarp7ifhu67rjxn52tv0t20` is the most widely documented one, but it changes with app versions and may be flagged)

**Step 2: Token obtained (persisted credential)**

- **Auth token** — a long opaque string returned by Airbnb's `/v2/logins` or `/v2/authentications` endpoints after successful email+password authentication. This token replaces the email+password for all subsequent requests.
- **Session cookies** — `_airbed_session_id` and `_csrf_token` for web-based endpoints
- `x-airbnb-api-key` header — the static client_id
- `x-csrf-without-token` header — CSRF protection token

**Step 3: Per-request headers**

```http
x-airbnb-api-key: <static-key>
x-airbnb-device-id: <32-char-alphanumeric>
x-csrf-without-token: <csrf-value>
Authorization: Bearer <auth-token>
Cookie: _airbed_session_id=<session>; _csrf_token=<csrf>
```

### 1.3 What Must Be Stored in the Platform

To make API calls on behalf of a host using the private API, the platform would need to store **at minimum** one of these credential sets per host:

**Option A — Store plaintext credentials (worst):**

- Email + password
- Device ID
- Re-authenticate on each use to get a fresh session token
- Problem: Repeated authentication triggers Airbnb's Airlock / 420 anti-abuse system

**Option B — Store derived session token (better, still dangerous):**

- Auth token (derived from email+password login)
- Device ID
- API key
- Store for reuse; re-authenticate only on expiry (401 response)
- Problem: Token has full account scope; no revocation; ToS violation

**Option C — Official Partner API OAuth (correct, inaccessible):**

- OAuth 2.0 access token + refresh token (scoped to granted permissions)
- Client ID + Client Secret (platform-level, not per-host)
- Problem: Requires Airbnb Partner API approval (invite-only)

In practice, any unofficial integration would use Option B. The platform would need to store, encrypted in `tenant_secrets`, the auth token and device ID per host — with no guaranteed lifetime or revocation path.

---

## Section 2: Token Lifetime and Refresh

### 2.1 Official Partner API Tokens (OAuth 2.0)

The official Airbnb Partner API uses OAuth 2.0. Based on how Preferred+ partners like Hospitable and Guesty implement the connection:

- **Connection flow**: The host clicks "Connect with Airbnb" in the PMS. They are redirected to Airbnb's authorization page, click "Allow," and Airbnb issues an OAuth code. The PMS exchanges the code for an access token + refresh token.
- **Access token lifetime**: Not publicly documented, but by OAuth 2.0 convention, typically short-lived (hours to days). Partners implement automatic token refresh using refresh tokens.
- **Refresh token lifetime**: Long-lived; persists until the host disconnects the integration, changes their password, or Airbnb revokes access.
- **Revocation**: Hosts can disconnect the integration in their Airbnb account settings → Privacy & Sharing → Services. When this happens, the PMS loses access immediately; no re-auth is possible without the host re-authorizing.
- **Reconnection trigger**: Hospitable's documentation explicitly states that if the host "changed your Airbnb password, email address, or enabled/disabled two-factor authentication, your Hospitable connection may become invalid" — this is the same revocation behavior as any OAuth integration.

### 2.2 Private API Tokens (Unofficial)

Based on community research from open-source reverse-engineering libraries (airbnbapijs GitHub issues, airbnb-python README, drawrowfly/airbnb-private-api):

**Lifetime reports:**

- Auth tokens are **extremely long-lived by default** — reported lifetimes range from 6 months to nearly 2 years
- The community documentation explicitly warns: "Once you logged in, please reuse your access token, to avoid getting your account locked"
- One developer reports: "I've been using the same token for almost 2 years now. I do make a lot of requests with it though"
- Another: "You should cache the token and renew it monthly"

**What causes token invalidation (no scheduled expiry):**

1. **Password change** — host changes their Airbnb password, immediately invalidates all auth tokens
2. **Email change** — host changes their registered email, may invalidate tokens
3. **2FA enable/disable** — changes authentication state, may invalidate tokens
4. **Airbnb security detection** — if Airbnb's systems detect anomalous access patterns, they may trigger an Airlock or force re-authentication
5. **Account flag** — if the account is reported for ToS violations, tokens are invalidated

**What does NOT invalidate tokens on a schedule:**

- Time-based expiry (no TTL on the token itself)
- Inactivity (tokens remain valid even if unused for months)

**Refresh mechanism:**

- **No refresh token** — unlike OAuth 2.0, there is no separate long-lived refresh token that can silently obtain a new short-lived access token
- When a token expires (401 response or `authentication_required` error), the only recourse is **re-authentication with email + password**
- This is operationally catastrophic for a production multi-tenant platform: if a host's token is invalidated, the platform cannot autonomously re-authenticate; it must interrupt the host and ask for credentials again
- Airbnb's Airlock system (error 420) rate-limits login attempts; multiple failed logins or repeated credential use from non-residential IPs triggers account holds requiring human CAPTCHA verification

### 2.3 Operational Consequences

The token lifecycle creates a fundamental operational problem for a production platform:

```
Token valid → works normally
Token invalid (password change, Airbnb security trigger, etc.)
  → Platform gets 401 / "authentication_required"
  → Platform CANNOT re-authenticate autonomously
  → Platform MUST interrupt host to re-enter credentials
  → If re-auth is attempted programmatically from a server IP:
      → 420 Airlock triggered (anti-abuse)
      → Host must manually complete CAPTCHA on airbnb.com
  → Recovery time: hours to days depending on host response
```

By contrast, the Hostfully API key model has a simple failure mode: the key is invalid → platform gets 401 → admin is notified → new key is entered in the admin panel. No host interruption, no CAPTCHA, no abuse detection risk.

---

## Section 3: Security Implications

### 3.1 The Core Problem: Full-Account Credential Custody

The fundamental security problem with storing private Airbnb API credentials is scope. When the platform stores a Hostfully API key, it can only access Hostfully's API within that key's permissions. When the platform stores an Airbnb auth token, it can:

- Read ALL reservations, past and future
- Read ALL guest conversations, including private messages
- Read ALL pricing and availability data
- Modify listings, pricing, availability
- Send messages to all guests, impersonating the host
- Accept or decline booking requests
- Access the host's personal account settings and payment information
- Potentially access guest personal data (contact info, identity documents for verified stays)

There is **no scope limitation** on a private API auth token. Airbnb's private API was designed for Airbnb's own apps — it has full-account access by definition. The official Partner API addresses this through scoped OAuth grants, but that path is closed.

### 3.2 Attack Surface Analysis

**Threat: Token exfiltration from platform database**

- Impact: Attacker gains full access to every connected host's Airbnb account
- Airbnb account = identity, financial data, booking history, guest communication
- Multi-tenant blast radius: one database breach exposes ALL hosts simultaneously
- Mitigation if AES-256-GCM encryption is in place: attacker needs ENCRYPTION_KEY to decrypt
- Residual risk: ENCRYPTION_KEY is a single point of failure for all host accounts

**Threat: Token exfiltration from worker container**

- Worker containers run with secrets injected as environment variables
- Impact: Any RCE vulnerability in a worker exposes all secrets in that container's env
- Fly.io machine compromise → `env` dump → all host tokens exposed for that task run
- Mitigation: Narrow secret injection (only inject the specific token needed, not all tenant secrets)

**Threat: Token abuse during use**

- When a token is used in a worker, it traverses the platform infrastructure
- Any logging of the Authorization header → token in logs
- Log injection → token exposure
- The platform's `assertNoPlaintextLogged` guardrail in `encryption.ts` does not apply during network transmission

**Threat: Account takeover via compromised token**

- An attacker with an Airbnb auth token can change the account's email and password
- Once email is changed, the original host loses access to their Airbnb account
- Platform cannot detect this; the stolen token remains valid until Airbnb's security detects the change
- This is a catastrophic outcome — the host permanently loses their listing history, reviews, and Superhost status

**Threat: Airbnb account suspension**

- Airbnb's terms explicitly prohibit unauthorized automated access
- If Airbnb detects the platform's API calls (unusual request patterns, server IP ranges, high frequency), they may suspend the host's account
- Host account suspension has downstream consequences: existing reservations are at risk, income is disrupted
- The platform is liable for causing this, even if the host consented to the integration

**Threat: ToS liability**

- API ToS §2.2.G: "Using Airbnb APIs that are not listed on developer.airbnb.com" — a direct breach
- The platform would be contractually indemnifying each host against ToS violations it causes
- Airbnb can pursue the platform (not the host) for operating an unauthorized integration
- Legal exposure: CFAA (Computer Fraud and Abuse Act) for unauthorized access via ToS breach

### 3.3 Comparison to Hostfully API Key Risk

| Risk Dimension               | Hostfully API Key                                 | Airbnb Private Auth Token                                        |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| **Scope of access**          | Hostfully platform only, within key permissions   | Full Airbnb account — all listings, messages, bookings, payments |
| **Blast radius (DB breach)** | Attacker can impersonate host on Hostfully        | Attacker can impersonate host on Airbnb + access guest PII       |
| **Revocation**               | Host deletes key in Hostfully dashboard → instant | No revocation mechanism; invalid only on password change         |
| **ToS compliance**           | Fully compliant (official integration)            | Direct violation of Airbnb ToS §2.2.G                            |
| **Downstream account risk**  | Hostfully account compromise only                 | Airbnb account suspension, listing takedown, loss of reviews     |
| **Lifetime**                 | Static until rotated                              | Indefinite (6+ months observed)                                  |
| **Refresh complexity**       | None (static key)                                 | Full credential re-authentication required on expiry             |
| **CAPTCHA risk**             | None                                              | Yes — automated re-auth triggers Airlock                         |
| **Legal exposure**           | None                                              | CFAA, breach of contract, ToS violation                          |

The risk delta between the two is not marginal — it is categorically different. Hostfully is a vetted, official, scoped integration. Airbnb private tokens are full-account credentials with no revocation, full scope, and ToS violation built in.

---

## Section 4: Comparison to Hostfully OAuth Model

### 4.1 How Hostfully Credentials Work in the Platform Today

The current Hostfully integration uses a pure API key model:

1. **Credential type**: Static API key (`HOSTFULLY_API_KEY`) + Agency UID (`HOSTFULLY_AGENCY_UID`)
2. **Storage**: `tenant_secrets` table, encrypted with AES-256-GCM (via `src/lib/encryption.ts`)
3. **Injection**: `tenant-env-loader.ts` injects `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID` as environment variables into worker containers
4. **Scope**: The Hostfully API key grants access to the tenant's Hostfully account — properties, reservations, messages — but NOT to any upstream OTA accounts (Airbnb, VRBO, etc.)
5. **Rotation**: Admin can rotate via `PUT /admin/tenants/:id/secrets/hostfully_api_key`
6. **Revocation**: Host deletes the key in Hostfully's dashboard → platform gets 401 → task fails → admin is notified
7. **ToS status**: Fully compliant; Hostfully provides API keys explicitly for integration use

### 4.2 How Official Airbnb OAuth Would Work (If Partner API Were Accessible)

If the platform had Partner API access, the Airbnb credential model would look like this:

1. **Credential type**: Per-host OAuth 2.0 access token + refresh token (scoped to approved permissions: messaging, reservations, etc.)
2. **Connection flow**: Host visits platform's Airbnb OAuth page → redirected to Airbnb → clicks "Allow" → platform receives auth code → exchanges for tokens
3. **Storage**: Access token + refresh token in `tenant_secrets`, encrypted with AES-256-GCM. A `tenant_integrations` row tracks the connection with `external_id = <airbnb_user_id>`
4. **Injection**: Same `tenant-env-loader.ts` pattern — `AIRBNB_ACCESS_TOKEN` injected into worker env
5. **Scope**: Limited to what Airbnb grants in the Partner Specific Terms (likely messaging scope for the platform's use case)
6. **Rotation**: Transparent — platform refreshes the access token using the refresh token before each worker run
7. **Revocation**: Host disconnects integration in Airbnb → refresh token invalidated → platform cannot silently re-authenticate; must notify host to re-authorize

This is structurally nearly identical to the Slack OAuth integration in `src/gateway/slack/installation-store.ts`:

- `storeInstallation()` would save tokens to `tenant_secrets` + upsert `tenant_integrations`
- `fetchInstallation()` equivalent would retrieve and potentially refresh the token before use
- `deleteInstallation()` equivalent would clean up the DB rows

### 4.3 The Core Difference

**Hostfully API key**: Platform has custody of a service credential. If it's compromised, the attacker can interact with Hostfully's API. This is a serious but bounded risk.

**Airbnb OAuth (official)**: Platform has custody of a delegated authorization for specific scopes. The host can revoke at any time, Airbnb can revoke, the scope is limited, and the integration is contractually authorized.

**Airbnb private token (unofficial)**: Platform has custody of the host's full identity credential. Compromise is equivalent to giving an attacker the host's username and password. No revocation, no scope limit, ToS violation included.

The comparison is stark: Airbnb private credentials are approximately 100× more dangerous than a Hostfully API key, while providing the same or narrower functionality (the platform only needs messaging, which Hostfully already provides).

---

## Section 5: Recommended Custody Architecture

This section describes what a credential custody architecture would look like **if the platform were to implement a direct Airbnb integration**. This is a hypothetical design for future reference only — the current recommendation remains NO-GO.

### 5.1 Official Partner API Path (Future, If Approved)

If the platform achieves Airbnb Partner API approval, the credential architecture should follow the existing Slack OAuth pattern:

**Database schema additions:**

No schema changes required — use existing tables:

```sql
-- tenant_integrations: one row per connected Airbnb account
-- provider = 'airbnb', external_id = airbnb_user_id
-- status = 'active' | 'expired' | 'revoked'

-- tenant_secrets: two rows per connected host
-- key = 'airbnb_access_token_{airbnb_user_id}'
-- key = 'airbnb_refresh_token_{airbnb_user_id}'
```

Or, for multi-host support (one tenant with multiple Airbnb accounts):

```sql
-- Extend tenant_integrations.config to store token metadata
-- config = { airbnb_user_id, expires_at, scope }
-- tenant_secrets key includes airbnb_user_id suffix for uniqueness
```

**Token storage (using existing `src/lib/encryption.ts`):**

```typescript
// Store during OAuth callback
await secretRepo.set(
  tenantId,
  `airbnb_access_token_${airbnbUserId}`,
  accessToken,
);
await secretRepo.set(
  tenantId,
  `airbnb_refresh_token_${airbnbUserId}`,
  refreshToken,
);
await integrationRepo.upsert(tenantId, "airbnb", airbnbUserId, {
  scope: grantedScopes,
  expires_at: new Date(Date.now() + expiresInMs),
});
```

**Token injection into worker env (via `tenant-env-loader.ts`):**

```typescript
// No changes to tenant-env-loader.ts required
// auto-uppercase injection: airbnb_access_token_xxx → AIRBNB_ACCESS_TOKEN_XXX
// Worker reads AIRBNB_ACCESS_TOKEN_{AIRBNB_USER_ID} from env
```

**Token refresh logic:**

- Add a new `src/lib/airbnb-client.ts` that wraps token refresh
- Refresh in the lifecycle's `dispatch-machine` step, before spawning the worker, if `expires_at` is within 5 minutes
- Store the new access token back to `tenant_secrets` immediately after refresh
- If refresh fails (revoked refresh token) → transition task to `Failed` with reason `airbnb_auth_revoked` → notify tenant via Slack

**Re-authorization flow:**

- Same as Slack OAuth re-authorization: host visits `/airbnb/install?tenant=<id>` → redirected to Airbnb → authorizes → callback stores new tokens
- Gateway route at `POST /webhooks/airbnb` or `/airbnb/oauth/callback`

### 5.2 Private API Path (NOT Recommended — Documented for Completeness)

If the platform were forced to use the private API (strongly discouraged), the minimum-risk custody model would be:

**What to store:**

- Auth token only (not email + password) — store the derived token, not the root credentials
- Device ID (stable per-integration, not per-session)
- Never store plaintext password in any form

**Key naming convention in `tenant_secrets`:**

```
airbnb_auth_token          → AIRBNB_AUTH_TOKEN
airbnb_device_id           → AIRBNB_DEVICE_ID
```

**Limitations that cannot be designed around:**

1. Initial enrollment requires the host to enter email + password somewhere — the platform must handle this flow without persisting the password. Use a one-time enrollment page that calls Airbnb's login API server-side, discards the password immediately, and stores only the resulting token.
2. Re-authentication cannot be done autonomously — when the token expires, the platform must interrupt the host and ask them to re-authorize through a UI flow
3. No scope limitation — the stored token gives the platform full account access regardless of how it's labeled in the DB
4. ToS violation is inherent — there is no way to use the private API in a ToS-compliant way

**Minimum security controls if proceeding (despite recommendation against):**

- Encrypt with AES-256-GCM (already in `src/lib/encryption.ts`) — mandatory
- Never log the token value — the existing `assertNoPlaintextLogged` guardrail should be extended to cover Airbnb tokens
- Rotate ENCRYPTION_KEY annually (a breach of the key exposes all stored tokens)
- Use the most narrowly-scoped API endpoints possible (messaging only; never request listing management endpoints)
- Rate limit API calls to avoid triggering Akamai Bot Manager / Airlock
- Monitor for 401 responses and notify the host immediately when token invalidation is detected
- Never re-authenticate from server IPs without the host's interactive involvement — this triggers Airlock

### 5.3 The Correct Architecture Today (No Direct Integration)

The custody architecture that correctly solves the credential problem right now is: **don't build it**. The platform's current architecture provides correct credential custody for the Hostfully integration, which already covers Airbnb communication. Adding a second credential layer for a direct Airbnb integration creates risk with no additional value for current customers.

When the platform grows to Partner API eligibility, the OAuth path (Section 5.1) is the correct design — and it requires minimal new infrastructure because the patterns already exist in the codebase (`TenantInstallationStore`, `tenant_secrets`, AES-256-GCM encryption, `tenant-env-loader.ts` injection).

---

## Section 6: Go/No-Go Input

### 6.1 How the Credential Model Affects Viability

The credential analysis adds three new vectors to the T4 NO-GO decision:

| Factor                  | T4 (Partner API)                           | T8 (Credential Custody)                                    | Combined                 |
| ----------------------- | ------------------------------------------ | ---------------------------------------------------------- | ------------------------ |
| API access              | ❌ Closed, invite-only                     | —                                                          | ❌ Blocked               |
| Legal compliance        | ❌ ToS violation if unofficial             | ❌ Storing private tokens = ToS §2.2.G breach              | ❌ Double violation      |
| Security posture        | —                                          | ❌ Full-account credentials, no scope limit, no revocation | ❌ Unacceptable risk     |
| Operational reliability | —                                          | ❌ No autonomous re-auth, Airlock risk, CAPTCHA dependency | ❌ Not production-viable |
| Existing coverage       | ✅ Hostfully covers Airbnb messaging today | ✅ No gap to fill                                          | ✅ No need               |

### 6.2 Deal-Breakers

The following are hard stops that cannot be designed around without Partner API access:

**Deal-breaker 1: No OAuth, no scope control**  
Without the Partner API, there is no OAuth grant — no way to limit what credentials are requested or stored. The platform must store full-account credentials. This is an unacceptable security posture for a multi-tenant SaaS handling property management data.

**Deal-breaker 2: No autonomous credential refresh**  
When a private API token expires, the platform cannot re-authenticate without involving the host interactively. This creates a production reliability crisis: a host who changes their Airbnb password silently breaks the integration, and the platform cannot self-heal. For an AI employee platform that operates autonomously, this is a design incompatibility.

**Deal-breaker 3: Terms of Service violation is structural**  
Any use of Airbnb's private API is a ToS violation under §2.2.G (using undocumented APIs). This is not a gray area — the library documentation and community resources explicitly disclaim ToS compliance. Building a commercial multi-tenant platform on a ToS-violating foundation creates legal exposure for both the platform and its customers.

**Deal-breaker 4: Account suspension risk for hosts**  
If Airbnb detects the platform's automated access (server IP ranges, request patterns, high frequency), it may suspend the host's Airbnb account. The host's Airbnb account is their income source — this is a catastrophic failure mode. The platform cannot adequately disclose and obtain informed consent for this risk at scale.

### 6.3 Conditions That Would Change the Answer

The credential model would become viable under exactly one condition: **Airbnb Partner API access**. With OAuth 2.0, the custody model is:

- Scoped (messaging only)
- Officially authorized (no ToS risk)
- Revocable (host can disconnect)
- Refreshable (platform can silently renew tokens)
- Structurally identical to the existing Slack OAuth model already in the codebase

All other conditions (better encryption, more granular secrets, smarter token refresh) are improvements to a broken foundation — they don't change the fundamental problems.

### 6.4 Final Verdict

**GO/NO-GO: ❌ NO-GO (reinforces T4 decision)**

The credential custody analysis does not open a new path — it closes the only theoretical workaround to the Partner API barrier. The private API path is not a viable alternative; it creates unacceptable security, legal, and operational risks that disqualify it for a production multi-tenant platform.

**Re-assess when**: Airbnb Partner API access is granted. At that point, implement the OAuth custody architecture described in Section 5.1 — it requires approximately 2–3 days of engineering work to add the OAuth callback route, token refresh logic, and `airbnb-client.ts` wrapper, using existing infrastructure (`tenant_secrets`, AES-256-GCM, `tenant-env-loader.ts`).

**What to do today**: Continue deepening the Hostfully integration. Hostfully is a Preferred+ Airbnb partner — the platform already has indirect access to Airbnb's full messaging scope through a fully authorized, properly credentialed, scoped integration. The credential problem is already solved, correctly, for the current use case.

---

## Appendix A: Platform Infrastructure Readiness Assessment

The AI Employee Platform's existing infrastructure is well-designed for credential custody. This assessment documents what is already in place and what would need to be added for a future OAuth-based Airbnb integration.

### Already in Place

| Component                      | Location                                     | Capability                                                                          |
| ------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Secret encryption              | `src/lib/encryption.ts`                      | AES-256-GCM, 256-bit key, random IV per value, authenticated encryption             |
| Secret storage                 | `prisma/schema.prisma` → `TenantSecret`      | Per-tenant, per-key storage with `ciphertext`, `iv`, `auth_tag` fields              |
| Secret injection               | `src/gateway/services/tenant-env-loader.ts`  | Auto-injects all `tenant_secrets` into worker env, uppercase key convention         |
| Integration tracking           | `prisma/schema.prisma` → `TenantIntegration` | `provider`, `external_id`, `status`, `config` per tenant                            |
| OAuth reference implementation | `src/gateway/slack/installation-store.ts`    | Full `storeInstallation` / `fetchInstallation` / `deleteInstallation` pattern       |
| Secret admin API               | Gateway routes                               | `GET /admin/tenants/:id/secrets`, `PUT .../secrets/:key`, `DELETE .../secrets/:key` |

### Would Need to Be Added (for Partner API OAuth)

| Component            | Engineering Estimate | Notes                                                                 |
| -------------------- | -------------------- | --------------------------------------------------------------------- |
| OAuth callback route | 0.5 days             | `GET /airbnb/oauth/callback` — similar to `/slack/oauth_callback`     |
| Token refresh logic  | 1 day                | `src/lib/airbnb-client.ts` — refresh before dispatch, store new token |
| Re-auth notification | 0.5 days             | Slack message to tenant when refresh token is revoked                 |
| Multi-host support   | 1 day                | `tenant_secrets` key suffix per airbnb_user_id                        |
| **Total**            | **~3 days**          | Infrastructure is ready; the work is integration-specific             |

---

## Appendix B: Key Technical Facts Summary

| Fact                                        | Value                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Private API auth mechanism                  | Email + password → auth token (opaque string)                                                     |
| Required headers (per request)              | `x-airbnb-api-key`, `x-airbnb-device-id`, `x-csrf-without-token`, `Authorization: Bearer <token>` |
| Static API key                              | `d306zoyjsyarp7ifhu67rjxn52tv0t20` (mobile client key — subject to rotation by Airbnb)            |
| Private token lifetime                      | 6 months to 2 years (no scheduled expiry)                                                         |
| Private token expiry triggers               | Password change, email change, 2FA change, Airbnb security detection                              |
| Private token refresh mechanism             | None — must re-authenticate with email + password                                                 |
| Re-auth failure mode                        | Airlock (error 420) — CAPTCHA required on airbnb.com                                              |
| Official OAuth lifetime                     | Undocumented; refresh token lasts until host disconnects integration                              |
| Hospitable connection model                 | Official Airbnb OAuth (host clicks "Allow") — NOT password storage                                |
| Guesty connection model                     | Official Airbnb OAuth (partner API)                                                               |
| Scope of private token                      | Full Airbnb account — no scope limitation                                                         |
| ToS violation                               | §2.2.G — using undocumented (private) APIs                                                        |
| Platform encryption                         | AES-256-GCM (`src/lib/encryption.ts`) — 256-bit key, random IV                                    |
| Platform secret storage                     | `tenant_secrets` table — `ciphertext`, `iv`, `auth_tag` columns                                   |
| Platform secret injection                   | `tenant-env-loader.ts` — auto-injects all secrets as uppercase env vars                           |
| Existing OAuth pattern                      | Slack installation store (`src/gateway/slack/installation-store.ts`)                              |
| Time to implement (if Partner API approved) | ~3 days additional engineering                                                                    |

---

## Appendix C: How Hospitable and Guesty Handle Airbnb Credentials

Both top-tier Airbnb partners use the **official OAuth flow** — not password storage.

**Hospitable:**

- Host visits `Settings → Channel Connections → Connect with Airbnb`
- Redirected to Airbnb's authorization page
- Host clicks "Allow" — Airbnb issues an OAuth token to Hospitable
- Hospitable stores the OAuth token, not the host's password
- Reconnection required only if host changes Airbnb password, email, or 2FA
- Explicit security guidance: "For security reasons, we recommend using a different password for Airbnb and Hospitable" — implying they do NOT store the Airbnb password
- Host invite flow available: hosts who don't share credentials can authorize via a secure invite link

**Guesty:**

- Full OAuth 2.0 flow (client_credentials for Guesty's own API; delegated OAuth for Airbnb host connections)
- Host authenticates with their own Guesty credentials; Guesty's Airbnb integration uses its Partner API OAuth grant
- Host cannot be connected via co-host account — listing owner must personally authorize
- One Airbnb account per Guesty account

**The critical observation**: Neither Hospitable nor Guesty stores the host's Airbnb password. They store an OAuth access token issued by Airbnb's authorization server under the Partner API program. This is only possible because they are approved partners with OAuth access. An unofficial integration cannot replicate this model.

---

_Document ends. Total: ~350+ lines of substantive analysis. See T4 partner-api-analysis.md (388 lines) for the Partner API access barrier analysis._
