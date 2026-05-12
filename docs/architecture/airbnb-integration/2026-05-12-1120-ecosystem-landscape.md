# Airbnb Integration Ecosystem — Who's Doing It and How

**Date**: May 2026  
**Research method**: Web search, GitHub survey, official documentation, HAR traffic analysis  
**Purpose**: Reference landscape for evaluating direct Airbnb integration options for the AI Employee Platform

---

## Summary

Every company that reliably reads and sends Airbnb messages programmatically is an official Airbnb Partner API member — no exceptions. The open-source ecosystem is stale (2022–2023), targets a deprecated API tier, and carries ToS liability. One middleware company (Repull) stands out as an alternative path: they hold Partner API access and resell it as developer infrastructure via a standard REST API, eliminating the need to apply for Partner status directly.

---

## The Three-Tier Landscape

### Tier 1 — Official Airbnb Partners (OAuth, fully compliant)

These companies hold Airbnb Partner API access. Their customers connect via a standard OAuth flow — no stored passwords, scoped tokens, revocable at any time.

| Company                                   | Airbnb Relationship                                                          | What They Offer                                                                                | Notes                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Conduit** (formerly HostAI)             | Direct Airbnb Partner. Claims "first fully two-way integration with Airbnb." | Unified AI inbox: Airbnb + VRBO + WhatsApp + SMS + email. Standalone mode works without a PMS. | SaaS product — not an API we can consume. Competitor, not a vendor. |
| **Hospitable**                            | Airbnb Preferred+ Partner                                                    | Unified inbox, automated message scheduling, review management                                 | SaaS product. Not an API.                                           |
| **Enso Connect**                          | "Airbnb's only official partner for digital guest experience solutions"      | Guest portals, AI messaging, upsells, digital guidebooks                                       | SaaS product. Not an API.                                           |
| **Guesty**                                | Airbnb Partner API                                                           | Full PMS + messaging. High-volume operators.                                                   | SaaS PMS. Very expensive.                                           |
| **Hostaway**                              | Airbnb Partner API                                                           | PMS + channel manager + messaging                                                              | SaaS PMS.                                                           |
| **Hostfully** _(our current integration)_ | Airbnb Preferred+ Partner                                                    | PMS + Airbnb messaging via API                                                                 | We already use this. It is the compliant path today.                |

**Pattern**: All of these are closed SaaS products aimed at end-users (property managers), not developer infrastructure. There is no "buy an API key, call Airbnb messaging" product in this tier — except Repull (see Tier 2).

---

### Tier 2 — Middleware APIs (resell Partner API access as infrastructure)

The critical insight: if Airbnb won't give _you_ Partner API access, you can connect through a company that already has it and exposes it as a developer API.

#### Repull (`repull.dev`) — standout option

Repull is "Plaid for vacation rentals." They hold Partner API relationships with Airbnb, Booking.com, VRBO, and Plumguide, plus integrations with 46 PMS platforms, and expose all of it through a single unified REST API.

**How the Airbnb connection works:**

1. Your user visits a hosted OAuth picker (at `connect.repull.dev` or embedded in your app)
2. They click "Connect Airbnb" → standard Airbnb OAuth grant screen
3. After approval, Repull holds the OAuth token; you get a webhook notification that the connection is live
4. You call `GET /v1/conversations` and `POST /v1/conversations/{id}/messages` using your Repull API key — no Airbnb credentials involved

**Airbnb capabilities via Repull** (26 documented endpoints):

| Operation                 | Endpoint                               |
| ------------------------- | -------------------------------------- |
| List inbox threads        | `GET /v1/conversations`                |
| Read thread messages      | `GET /v1/conversations/{id}/messages`  |
| Send a message            | `POST /v1/conversations/{id}/messages` |
| List reservations         | `GET /v1/reservations`                 |
| Get reservation detail    | `GET /v1/reservations/{id}`            |
| List Airbnb listings      | `GET /v1/channels/airbnb/listings`     |
| Push pricing/availability | `PATCH /v1/channels/airbnb/...`        |

**Key details:**

- **Auth**: Bearer token (your Repull API key). No Airbnb cookies or sessions.
- **SDKs**: TypeScript (flagship), Python, Go, Ruby, PHP, .NET — all generated from the same OpenAPI spec
- **Webhooks**: Real-time events for new messages, reservation changes
- **Free tier**: Up to 3 active listings, 10,000 API calls/month. No time limit, no credit card.
- **AI operations**: Built-in autorespond, intent classification, smart pricing — callable via `POST /v1/ai/...`
- **MCP server**: `@repull/mcp` — exposes 18 tools for Claude Desktop/Cursor. Read-only today; write tools (messaging) coming with opt-in flag.
- **Open-source channel manager template**: Forkable Next.js app using Repull as backend
- **Maturity**: Alpha (v0.2 as of May 2026). API surface may break before 1.0.

**Important caveat on MCP write access**: The Repull MCP server currently exposes read-only tools. Messaging writes (`messaging:send`) are intentionally withheld from v0.2 — they'll ship with an explicit opt-in env flag (`REPULL_MCP_ENABLE_WRITES=messaging:send`). The REST API and SDKs support messaging writes today.

**Repull pricing** (from their site as of May 2026): Free tier (3 listings, 10k calls/month). Paid tiers not published publicly — sign up to see.

---

### Tier 3 — Unofficial / Private API Projects (all stale or risky)

Every project in this category targets Airbnb's **v2 REST API** (`api.airbnb.com/v2/`) — the legacy Android app API that Airbnb has been deprecating in favor of v3 GraphQL. None support the current web API. All require storing host credentials (email + password or derived auth tokens), which is a ToS violation.

| Project                                 | Language      | Last Push | Stars    | Approach                                                                            | Status                                                         |
| --------------------------------------- | ------------- | --------- | -------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `drawrowfly/airbnb-private-api`         | TypeScript    | Mar 2023  | 53       | v2 REST, Android masquerade, email+password auth                                    | ❌ Wrong API tier, likely broken                               |
| `zxol/airbnbapi`                        | JavaScript    | Dec 2022  | 227      | v2 REST, mobile OAuth token, `sendMessage()`                                        | ❌ 3+ years stale, open Airlock issues                         |
| `nderkach/airbnb-python`                | Python        | Dec 2022  | 201      | v2 REST, email+password, 420 rate limit errors noted in README                      | ❌ Stale, ToS violation                                        |
| `airbnb-host-api` (PyPI)                | Python        | Feb 2025  | 27 dl/mo | Uses **Selenium** to extract auth token on first run                                | ❌ Selenium = fragile browser automation                       |
| `ojengwa/airbnb-sdk`                    | TypeScript    | Feb 2023  | 5        | v2 REST wrapper                                                                     | ❌ Minimal activity, stale                                     |
| `ByteEthan/Airbnb-Message-Response-Bot` | Kotlin/Python | Nov 2025  | —        | **Android device/emulator automation** via UI Automator + ADB                       | ❌ Requires running Android devices or emulators in production |
| `shirosaidev/airbnbbot`                 | Python        | 2019      | —        | v2 REST, email+password, polling loop                                               | ❌ 7 years old                                                 |
| `juliosuas/airbnb-manager`              | TypeScript    | Mar 2026  | —        | **iCal sync only** (not messaging API). AI message _suggestions_ but no actual send | ⚠️ iCal = read-only calendar, no messaging capability          |

**Why they all fail for production use:**

- v2 REST API: Likely deprecated or rate-limited. The current active API is v3 GraphQL.
- Credential storage: All require email+password or derived session tokens — no scope, no revocation, ToS §2.2.G violation.
- The Python `airbnb-host-api` uses Selenium to get an auth token on first run, meaning it requires a browser environment. One step above manual.
- The Android bot approach (`ByteEthan`) is creative but requires a fleet of Android devices or emulators — an operational nightmare at scale.

---

## What the v3 GraphQL API Actually Looks Like (from HAR analysis)

For reference — this is the API the web app uses. Not usable without valid session cookies, but documented here for completeness.

| Endpoint                                         | Operation            | Auth required                               |
| ------------------------------------------------ | -------------------- | ------------------------------------------- |
| `GET /api/v3/ViaductInboxData/{sha}`             | List inbox threads   | Session cookies + `x-csrf-without-token: 1` |
| `GET /api/v3/ViaductGetThreadAndDataQuery/{sha}` | Read thread messages | Session cookies                             |
| `GET /api/v3/StayHostingDetailsQuery/{sha}`      | Reservation details  | Session cookies                             |
| `POST /api/v3/ThreadCreateMessageItem/{sha}`     | Send message         | Session cookies + real CSRF token           |
| `POST /api/v3/SyncProtocolSubscription/{sha}`    | Real-time updates    | Session cookies + WebSocket connection ID   |

All queries use Apollo Automatic Persisted Queries (APQ) — SHA256 hashes are fixed per operation and cannot be substituted. Anti-bot: DataDome + browser fingerprinting headers.

---

## Implications for the AI Employee Platform

### Current state (correct path)

The platform uses Hostfully, which is an Airbnb Preferred+ Partner. This gives us compliant, scoped Airbnb messaging for all customers who use Hostfully as their PMS.

### Customers without a PMS

Some hosts list directly on Airbnb with no PMS. Today, they can't use the guest-messaging employee unless they adopt Hostfully. This is the gap a direct Airbnb integration would fill.

### The Repull option

Repull is the most practical path to filling this gap without going through the Partner API application process directly. Integration pattern would be:

1. Add Repull as a new connection type (alongside Hostfully)
2. Tenant connects their Airbnb account via Repull OAuth flow (hosted UI, same UX as Hostfully)
3. Guest messaging employee calls `GET /v1/conversations` to poll for unresponded messages and `POST /v1/conversations/{id}/messages` to send replies — same shell tool pattern as `src/worker-tools/hostfully/`
4. Tenant secrets store: `repull_api_key` (per-tenant, injected via `tenant-env-loader.ts`)

Estimated engineering effort if Repull API is reliable: **1–2 weeks** (new shell tools + archetype + webhook route). The platform infrastructure (lifecycle, approval gate, tenant secrets) is already in place.

### Risks with Repull

- **Alpha maturity**: v0.2 API may break. Repull is a small company — durability unknown.
- **Dependency**: If Repull loses their Airbnb Partner status, our integration breaks. Same risk applies to Hostfully today, but Hostfully has a longer track record.
- **Pricing**: Unknown at scale. Free tier (3 listings) is useful for development only.
- **Not a substitute for Partner API**: Using Repull means Repull holds the OAuth tokens, not us. We're dependent on their infrastructure uptime and their continued compliance with Airbnb's terms.

---

## Related Documents

| Document                                         | What It Covers                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `2026-05-12-1120-go-no-go-decision.md`           | Final verdict: NO-GO on direct Airbnb integration now. Evidence-based decision matrix.                        |
| `2026-05-12-1120-partner-api-analysis.md`        | Deep analysis of the official Airbnb Partner API — requirements, access process, capabilities                 |
| `2026-05-12-1120-credential-custody-decision.md` | Why private API credential storage is a structural deal-breaker (ToS, security, auth fragility)               |
| `2026-05-12-1120-api-reverse-engineering.md`     | Technical analysis of Airbnb's v3 GraphQL API from real HAR traffic. Endpoint map, auth pattern, ID encoding. |
| `2026-05-12-1120-partner-api-next-steps.md`      | Playbook for when the platform is ready to pursue official Partner API access (50+ customers, 500+ listings)  |
| `2026-05-12-1120-tooling-setup.md`               | mitmproxy + mitmproxy2swagger setup used during the HAR capture research                                      |
