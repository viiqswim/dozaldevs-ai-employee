# Airbnb Web API — HAR Capture Analysis

**Date**: May 12, 2026
**Source**: Chrome DevTools HAR export from airbnb.com host inbox
**HAR size**: 2.5MB, 85 requests, 13 API endpoints
**Captured from**: `/guest/messages/2527821921` (host inbox thread view)

---

## 1. API Architecture Overview

Airbnb runs **two parallel API tiers**:

| Tier | Base URL | Protocol | API Key | Auth |
|------|----------|----------|---------|------|
| Legacy (v2) | `https://api.airbnb.com/v2/` | REST/JSON | `3092nxybyb0otqw18e8nh5nty` | `x-airbnb-oauth-token` (Bearer) |
| Modern (v3) | `https://www.airbnb.com/api/v3/` | GraphQL (APQ) | `d306zoyjsyarp7ifhu67rjxn52tv0t20` | Session cookies + CSRF |

The HAR captures exclusively **v3 GraphQL**, except one v2 marketing event tracking POST.

---

## 2. Endpoint Catalog (13 Endpoints)

### PRIMARY MESSAGING ENDPOINTS

#### ViaductInboxData — Inbox thread list
- **URL**: `GET /api/v3/ViaductInboxData/{sha256}`
- **SHA256**: `a034cd8023cfd4506fdb7e940b8f16d3616742bb42f02e4f7e0c7ca7171882ae`
- **Purpose**: Fetch list of message threads for the host inbox
- **Key variables**: `userId` (base64 Relay ID), `numRequestedThreads: 15`, `numPriorityThreads: 2`, `threadVisibility: "UNARCHIVED"`
- **Response**: ~98KB (gzip)

#### ViaductGetThreadAndDataQuery — Thread messages
- **URL**: `GET /api/v3/ViaductGetThreadAndDataQuery/{sha256}`
- **SHA256**: `d48a24ae1ac7bf53dd81ac2fa9dae8132d7fe81b55800c5f0bc45f78374e2fb1`
- **Purpose**: Fetch full thread with up to 50 messages, participants, read state
- **Key variables**: `globalThreadId` (base64 `MessageThread:<numericId>`), `numRequestedMessages: 50`
- **Response**: ~48KB (gzip)

#### StayHostingDetailsQuery — Reservation details
- **URL**: `GET /api/v3/StayHostingDetailsQuery/{sha256}`
- **SHA256**: `27265352de8a06dd5733edf0716c952df4a154f9d61da1ede89906504192e216`
- **Purpose**: Full reservation details when viewing a thread
- **Key variables**: `confirmationCode: "<code>"`, `requestSource: "MESSAGING"`, `viewerTimeZoneOffset: -300`
- **Response**: ~30KB — guest info, dates, listing, cancellation policy, co-hosts, earnings

#### SyncProtocolSubscription — Real-time updates
- **URL**: `POST /api/v3/SyncProtocolSubscription/{sha256}`
- **SHA256**: `74cfcffe07d702f8296da6f20e1a4d762cb2f517a869385d7fef960039a79aa3`
- **Purpose**: Long-poll for real-time inbox updates
- **Extra header**: `x-airbnb-websocket-connection-id: <uuid>`
- **Response**: 162 bytes

#### ThreadCreateMessageItem — Send message (NOT IN HAR)
- **URL**: `POST /api/v3/ThreadCreateMessageItem/{sha256}`
- **SHA256**: `657f2cf7cea65a789f6d6e1270003f93fa8c177598cbb706d11a06576891d860` (from community research)
- **Purpose**: Send a message in a thread
- **Key variables**: `threadId` (NUMERIC, not base64), `content.body`, `uniqueIdentifier` (UUID)
- **Requires**: Actual CSRF token (not just `x-csrf-without-token: 1`)

### SUPPORTING ENDPOINTS

| Endpoint | Method | Purpose |
|---|---|---|
| `FetchInboxFiltersConfig` | GET | Inbox filter/tab config |
| `IsHostQuery` | GET | Check if user is a host |
| `Header` | GET | Navbar/session info |
| `GetThumbnailPicQuery` | GET | Profile picture |
| `GetConsentFlagsQuery` | GET | Cookie consent flags |
| `NaviServerAnnouncementsQuery` | GET | Banner announcements |
| `AnnouncementImpressionInfo` | GET | Track announcement view |
| `RequestToBookGraduationStatusQuery` | GET | RTB status for listing |
| `marketing_event_tracking` (v2) | POST | Analytics page view |

---

## 3. Authentication Pattern

### Required Headers (All v3 Requests)

```
x-airbnb-api-key: d306zoyjsyarp7ifhu67rjxn52tv0t20    ← STATIC public web key
x-airbnb-graphql-platform: web
x-airbnb-graphql-platform-client: minimalist-niobe
x-airbnb-supports-airlock-v2: true
x-csrf-without-token: 1                                 ← For READ operations
x-csrf-token:                                            ← Empty for reads
x-airbnb-client-trace-id: <random>                      ← Unique per request
x-client-version: <git-sha>                              ← Client build hash
x-niobe-short-circuited: true
```

### API Key
- `d306zoyjsyarp7ifhu67rjxn52tv0t20` is a PUBLIC web API key baked into the Airbnb web client
- NOT a user secret — does NOT identify the authenticated user
- Same value seen across all community tools/research

### CSRF Mechanism

| Operation | x-csrf-token | x-csrf-without-token |
|---|---|---|
| READ (GET) | `""` (empty) | `"1"` |
| WRITE (POST mutations) | `V4$.airbnb.com$<token>` | `"1"` |

CSRF token for writes sourced from `_airlock_v2_` cookie. Rotates per session.

### Session Auth
- Auth is **cookie-based only** — no `Authorization: Bearer` on web API
- Required cookies: `_airbed_session_id`, `_airlock_v2_` (CSRF source), `bev` (browser fingerprint)
- `bev` format: `<unix_timestamp>_<base64_random>` — long-lived browser fingerprint

---

## 4. GraphQL Persisted Query Pattern

All v3 requests use **Apollo Automatic Persisted Queries (APQ)**:
- URL: `/api/v3/{OperationName}/{sha256Hash}`
- Query params: `operationName`, `locale`, `currency`, `variables` (JSON), `extensions` (JSON with persistedQuery)
- **Cannot craft arbitrary queries** — must use pre-registered SHA256 hashes
- Each SHA256 hash corresponds to a specific, server-registered GraphQL query

---

## 5. ID Encoding Scheme

Airbnb uses base64 Relay Global IDs:

| Type | Decoded | Encoded |
|---|---|---|
| `MessageThread:<id>` | `MessageThread:2527821921` | `TWVzc2FnZVRocmVhZDoyNTI3ODIxOTIx` |
| `Viewer:<userId>` | `Viewer:5834228` | `Vmlld2VyOjU4MzQyMjg=` |
| `User:<userId>` | `User:5834228` | `VXNlcjo1ODM0MjI4` |

Pattern: `base64(TypeName:numericId)` — standard Relay Global ID spec.
Note: `threadId` for send-message is NUMERIC (not base64 globalThreadId).

---

## 6. Endpoint-to-Operation Map

| Use Case | Endpoint | Input | Notes |
|---|---|---|---|
| Fetch inbox thread list | `ViaductInboxData` | `userId` (base64), `numRequestedThreads` | Paginated |
| Fetch thread messages | `ViaductGetThreadAndDataQuery` | `globalThreadId` (base64) | Up to 50 msgs |
| Get reservation details | `StayHostingDetailsQuery` | `confirmationCode` | Uses conf code |
| Send message | `ThreadCreateMessageItem` | `threadId` (NUMERIC), `content.body` | Needs CSRF |
| Real-time updates | `SyncProtocolSubscription` | `originType` | POST, websocket |

---

## 7. drawrowfly/airbnb-private-api Comparison

| Dimension | `drawrowfly` library | HAR capture (web v3) |
|---|---|---|
| Base URL | `api.airbnb.com/v2/` | `www.airbnb.com/api/v3/` |
| Protocol | REST (JSON) | GraphQL (APQ) |
| API Key | `3092nxybyb0otqw18e8nh5nty` | `d306zoyjsyarp7ifhu67rjxn52tv0t20` |
| Auth | OAuth token from email/password | Session cookies + CSRF |
| User-Agent | Android app | Chrome browser |
| Library age | 2020 (~6 years old) | Active (2026) |
| Viability | Likely broken/rate-limited | Used by active web clients |

**Key finding**: The npm library masquerades as an Android app and uses a completely different API version/auth. The v3 GraphQL web API is the current active API.

---

## 8. Anti-Bot Protections Observed

- **DataDome**: `datadome` cookie present (90Kq7Gxp...) — DataDome is an anti-bot service
- **Browser fingerprinting**: `sec-ch-device-memory`, `sec-ch-dpr`, `sec-ch-viewport-width` headers
- **Client hint headers**: Full `sec-ch-ua`, `sec-ch-ua-platform`, `sec-ch-ua-platform-version`
- **Multiple tracking cookies**: `_ccv`, `_iidt`, `_vid_t`, `_pt`, `_aaj`, `_aat`

---

## 9. Automation Feasibility Assessment

### Can Read (with valid session cookies):
- ✅ Inbox thread list
- ✅ Thread messages (up to 50 per thread)
- ✅ Reservation details (guest, dates, listing, earnings)

### Can Write (with valid session + CSRF token):
- ⚠️ Send message — requires CSRF token extraction from session
- ⚠️ Not captured in HAR — needs manual testing

### Cannot Do (without session):
- ❌ Any operation — API key alone is public and insufficient
- ❌ Must have browser session cookies (`_airbed_session_id`)
- ❌ Must maintain CSRF token for write operations

### Structural Blockers:
- Cookie-based auth = no OAuth flow = must store/refresh browser sessions
- CSRF rotation = must parse cookies to get write tokens
- APQ = can only call pre-registered queries with known hashes
- DataDome = anti-bot may block automated requests

---

## 10. Files Generated

- HAR file: `/tmp/airbnb-research/captures/airbnb-web.har` (2.5MB)
- OpenAPI skeleton: `/tmp/airbnb-research/captures/airbnb-openapi.yaml`
- This summary: `/tmp/airbnb-research/har-capture-summary.md`
