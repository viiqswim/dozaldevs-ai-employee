# Airbnb Direct Integration — Go/No-Go Decision

**Date**: May 2026  
**Spike**: T4 (Partner API), T5 (HAR/API Reverse Engineering), T8 (Credential Custody)  
**Verdict**: **NO-GO**

---

## 1. Executive Summary

The AI Employee Platform cannot build a direct Airbnb integration today. Three independent research tracks converge on the same wall: the official Partner API is closed to new applicants, the only unofficial alternative requires storing full Airbnb account credentials in violation of Airbnb's Terms of Service, and the web API's cookie-based auth with rotating CSRF tokens makes server-side automation structurally fragile. The platform already has indirect Airbnb coverage through Hostfully, a Preferred+ Airbnb partner, which handles all current guest messaging needs. The correct path is to deepen the Hostfully integration now and revisit direct Airbnb access when the platform reaches the scale and security posture Airbnb requires for partner approval.

---

## 2. Decision Matrix

| Integration Path                      | Feasibility                                  | Security                              | Legal                   | Maintenance                            | Scalability                 | **Verdict**  |
| ------------------------------------- | -------------------------------------------- | ------------------------------------- | ----------------------- | -------------------------------------- | --------------------------- | ------------ |
| **Official Partner API (OAuth)**      | ❌ Closed/invite-only                        | ✅ Scoped OAuth, revocable            | ✅ Fully compliant      | ✅ Standard refresh flow               | ✅ Designed for scale       | **BLOCKED**  |
| **Private v2 REST API (npm library)** | ❌ Library ~6 years old, likely broken       | ❌ Full-account credentials, no scope | ❌ ToS §2.2.G violation | ❌ No refresh, Airlock risk            | ❌ Rate-limited, fragile    | **NO-GO**    |
| **Private v3 GraphQL (web API)**      | ⚠️ Technically possible with session cookies | ❌ Full-account credentials, no scope | ❌ ToS §2.2.G violation | ❌ CSRF rotation, DataDome, APQ hashes | ❌ Anti-bot blocks at scale | **NO-GO**    |
| **Hostfully (current)**               | ✅ Live in production                        | ✅ Scoped API key, revocable          | ✅ Fully compliant      | ✅ Static key, simple rotation         | ✅ Multi-tenant, proven     | **CONTINUE** |

**Scoring key**: ✅ Acceptable · ⚠️ Conditional · ❌ Disqualifying

---

## 3. Evidence Summary

### T4: Partner API Analysis

The Airbnb Partner API has been invite-only since approximately 2019. The application portal no longer accepts submissions. Airbnb's partner team reaches out proactively based on three criteria: supply opportunity (listings under management), technology strength, and ability to support shared customers. The AI Employee Platform fails on the first criterion — it doesn't directly manage Airbnb listings and doesn't represent meaningful supply for Airbnb's evaluation. Even if invited, onboarding takes 3 to 6 months and requires a formal security review, quarterly vulnerability scans, a 1-hour incident reporting SLA, and a 6-month mandatory feature adoption window. Hospitable, a Preferred+ Airbnb partner, already occupies the AI-powered guest messaging niche.

Full analysis: `/tmp/airbnb-research/partner-api-analysis.md`

### T8: Credential Custody Analysis

Without Partner API access, the only integration path requires storing full Airbnb account credentials (email + password, or derived auth tokens) per host. These tokens have no scope limitation, no revocation mechanism, and no autonomous refresh path. When a token expires, the platform cannot re-authenticate from a server IP without triggering Airbnb's Airlock anti-abuse system, which requires the host to complete a CAPTCHA manually. Storing these credentials is a structural ToS violation under §2.2.G. The platform's existing infrastructure (AES-256-GCM encryption, `tenant_secrets`, `tenant-env-loader.ts`) is already ready for OAuth-based Airbnb credentials if Partner API access is ever granted, requiring roughly 3 days of engineering work to wire up.

Full analysis: `/tmp/airbnb-research/credential-custody-decision.md`

### T5: HAR Capture and API Reverse Engineering

Airbnb runs two API tiers. The v2 REST API (`api.airbnb.com/v2/`) is used by Airbnb's legacy Android app and is the basis for the `drawrowfly/airbnb-private-api` npm library, which is approximately 6 years old and likely broken. The v3 GraphQL API (`www.airbnb.com/api/v3/`) is the active web API. It uses Apollo Automatic Persisted Queries with pre-registered SHA256 hashes, meaning arbitrary GraphQL queries cannot be crafted. Auth is cookie-based with a static public API key. Read operations use `x-csrf-without-token: 1`. Write operations (sending messages) require an actual CSRF token extracted from the `_airlock_v2_` cookie, which rotates per session. Anti-bot protections include DataDome, browser fingerprinting headers, and multiple tracking cookies. The key messaging endpoints are documented (`ViaductInboxData`, `ViaductGetThreadAndDataQuery`, `ThreadCreateMessageItem`), but using them from a server requires maintaining live browser sessions, which is operationally unsustainable at scale.

Full analysis: `/tmp/airbnb-research/har-capture-summary.md`

### Tasks Skipped

- **T3 (npm library validation)**: The `drawrowfly/airbnb-private-api` library targets the v2 REST API, which T5 confirmed is the wrong tier. Desk research is sufficient — the library is obsolete.
- **T6 (E2E PoC)**: Would require manual cookie extraction from a live browser session. The API structure is fully documented from HAR analysis. A PoC would only confirm what we already know, at the cost of real account risk.
- **T7 (Rate limit probe)**: Risky on a real Airbnb account. The go/no-go decision is clear without rate limit data.

---

## 4. Risk Assessment

### Path A: Official Partner API (currently blocked)

| Risk                                           | Severity | Likelihood                          |
| ---------------------------------------------- | -------- | ----------------------------------- |
| Application never accepted                     | High     | High (invite-only, no open portal)  |
| Onboarding takes 6+ months                     | Medium   | High (documented timeline)          |
| Mandatory feature adoption diverts engineering | Medium   | Medium (6-month window per release) |
| Airbnb revokes access unilaterally             | High     | Low (rare for compliant partners)   |

This path has acceptable risks once access is granted. The problem is getting there.

### Path B: Private v2 REST API (npm library)

| Risk                                 | Severity | Likelihood                                      |
| ------------------------------------ | -------- | ----------------------------------------------- |
| Library is broken/rate-limited       | High     | High (6 years old, v2 API deprecated)           |
| Host account suspended by Airbnb     | Critical | Medium (automated server traffic is detectable) |
| ToS violation triggers legal action  | High     | Low-Medium (Airbnb has pursued CFAA cases)      |
| Token expires, no autonomous re-auth | High     | High (password changes, security triggers)      |

This path is not viable for production use.

### Path C: Private v3 GraphQL (web API)

| Risk                                 | Severity | Likelihood                                    |
| ------------------------------------ | -------- | --------------------------------------------- |
| DataDome blocks server-side requests | High     | High (designed to detect non-browser traffic) |
| CSRF token rotation breaks writes    | High     | High (rotates per session)                    |
| APQ hash changes break all queries   | High     | Medium (Airbnb deploys frequently)            |
| Host account suspended               | Critical | Medium                                        |
| ToS violation                        | High     | Certain                                       |

This path is technically more current than v2 but operationally more fragile.

### Path D: Continue with Hostfully (recommended)

| Risk                                            | Severity | Likelihood                             |
| ----------------------------------------------- | -------- | -------------------------------------- |
| Hostfully API changes break integration         | Medium   | Low (Preferred+ partner, stable API)   |
| Hostfully loses Airbnb partnership              | High     | Very Low                               |
| Guest messaging gaps for non-Hostfully channels | Medium   | Medium (VRBO, Booking.com not covered) |

This is the only path with an acceptable risk profile today.

---

## 5. Current State vs. Desired State

| Dimension             | Current State (Hostfully)                                  | Desired State (Direct Airbnb)                                    |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| **Airbnb coverage**   | Full, via Hostfully Preferred+ partnership                 | Full, direct                                                     |
| **Credential model**  | Scoped Hostfully API key, revocable                        | OAuth 2.0 (if Partner API) or full-account token (if unofficial) |
| **Message delivery**  | Hostfully API → Airbnb                                     | Airbnb API directly                                              |
| **Webhook triggers**  | Hostfully `NEW_INBOX_MESSAGE`                              | Airbnb native webhooks                                           |
| **Guest data access** | Hostfully-mediated (reservation, property, messages)       | Direct Airbnb reservation + message data                         |
| **Channel coverage**  | Airbnb + VRBO + Booking.com (all Hostfully-connected OTAs) | Airbnb only                                                      |
| **ToS compliance**    | Fully compliant                                            | Compliant only with Partner API                                  |
| **Engineering cost**  | Already built                                              | ~3 days (OAuth wiring) + 3-6 months (Partner API approval)       |
| **Operational risk**  | Low                                                        | High (unofficial) or Low (official, if approved)                 |

The gap between current and desired state is smaller than it appears. Hostfully already provides Airbnb messaging coverage. The main thing a direct integration would add is eliminating Hostfully as a dependency and gaining access to Airbnb's native webhook stream. Neither is worth the cost and risk at this stage.

---

## 6. Recommendation

**NO-GO on direct Airbnb integration. Continue with Hostfully.**

The three research tracks leave no viable path to a direct Airbnb integration today:

1. The official API is closed. There's no application to submit.
2. The unofficial API requires storing full-account credentials, which is a ToS violation and an unacceptable security posture for a multi-tenant platform.
3. The web API's cookie-based auth and CSRF rotation make server-side automation structurally fragile at scale.

Meanwhile, the Hostfully integration already covers the use case. VLRE's Airbnb guests are reachable today. There's no functional gap that a direct integration would fill for current customers.

The right move is to deepen the Hostfully integration, expand to other Hostfully-connected channels (VRBO, Booking.com), and grow the platform's customer base. When the platform reaches the scale Airbnb requires for partner consideration, the infrastructure to wire up OAuth is already in place and would take roughly 3 days to implement.

---

## 7. Re-evaluation Triggers

Re-open this decision when **all** of the following are true:

1. **Partner API opens to applications** — Airbnb announces an open application window or the platform receives a direct outreach from Airbnb's partner team. Monitor `developer.withairbnb.com` and `airbnb-platform@airbnb.com` for signals.

2. **Platform reaches 50+ paying property managers** — This is the minimum supply opportunity that makes the platform worth Airbnb's attention. Below this threshold, the business case for a direct partnership is weak.

3. **Security program is formalized** — SOC 2 Type II or equivalent; documented OWASP testing cadence; quarterly vulnerability scans; incident response runbooks with a 1-hour SLA for critical breaches. These are Airbnb's minimum requirements and take time to establish.

4. **Clear differentiation from Hospitable is established** — Hospitable holds Preferred+ status in the AI-powered guest messaging niche. A direct Airbnb partnership application needs a compelling answer to "why approve you alongside Hospitable?" Measurable outcomes (response time improvements, review score lift, booking rate increases) are the strongest argument.

5. **Hostfully integration has a documented gap** — If Hostfully's API stops covering a use case that customers need (e.g., Airbnb-specific features not exposed through Hostfully), that creates a concrete justification for direct access.

Any single trigger alone is not sufficient. The combination of open access, platform scale, security posture, and differentiation is what makes the application viable.

---

## 8. Appendix: Research Artifacts

| File                                                  | Description                                                                                                                                                | Task |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `/tmp/airbnb-research/partner-api-analysis.md`        | Full Partner API analysis: capabilities, application process, qualification requirements, partner landscape, gap analysis                                  | T4   |
| `/tmp/airbnb-research/credential-custody-decision.md` | Credential custody analysis: private API credential stack, token lifetime, security implications, comparison to Hostfully model, future OAuth architecture | T8   |
| `/tmp/airbnb-research/har-capture-summary.md`         | HAR capture analysis: API architecture, 13 endpoints catalogued, auth pattern, GraphQL APQ structure, ID encoding, anti-bot protections                    | T5   |
| `/tmp/airbnb-research/captures/airbnb-web.har`        | Raw HAR export from Chrome DevTools (2.5MB, 85 requests)                                                                                                   | T5   |
| `/tmp/airbnb-research/captures/airbnb-openapi.yaml`   | OpenAPI skeleton derived from HAR analysis                                                                                                                 | T5   |
| `/tmp/airbnb-research/tooling-setup.md`               | Tooling setup notes for the research spike                                                                                                                 | T2   |
