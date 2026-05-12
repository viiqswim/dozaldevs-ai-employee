# Learnings — airbnb-api-research-spike

## T2: mitmproxy setup

- Homebrew mitmproxy 10.0.0 broken; use `uv tool install mitmproxy` → 11.0.2
- mitmproxy2swagger also via `uv tool install`
- Research dir: `/tmp/airbnb-research/`

## T4: Partner API

- Airbnb Partner API is CLOSED / invite-only as of 2026
- NO-GO on Partner API now — re-assess at 50+ paying customers
- Full analysis: `/tmp/airbnb-research/partner-api-analysis.md`

## T8: Credential custody

- Private API needs full account credentials (email+password → auth token)
- Tokens have no scope control, no revocation, no autonomous re-auth
- Structural ToS violation — additional deal-breaker on top of T4
- Platform infrastructure (tenant_secrets, AES-256-GCM) is ready for OAuth if Partner API opens
- Full analysis: `/tmp/airbnb-research/credential-custody-decision.md`

## T5: HAR capture analysis

- Airbnb has TWO api tiers: v2 REST (legacy Android) and v3 GraphQL (modern web)
- drawrowfly library uses v2 (likely broken/outdated) — web uses v3
- Auth: static public API key + session cookies + CSRF — NOT OAuth
- All v3 uses Apollo Persisted Queries (APQ) with SHA256 hashes
- Key messaging endpoints: ViaductInboxData (inbox list), ViaductGetThreadAndDataQuery (thread), StayHostingDetailsQuery (reservation), ThreadCreateMessageItem (send)
- Send message requires CSRF token from _airlock_v2_ cookie
- IDs use base64 Relay Global ID format
- Anti-bot: DataDome (not just Akamai), browser fingerprinting headers
- Full analysis: `/tmp/airbnb-research/har-capture-summary.md` (205 lines)
- OpenAPI spec: `/tmp/airbnb-research/captures/airbnb-openapi.yaml`

## T3/T6/T7: Skipped tasks

- T3 (npm library validation): Library uses v2 REST, wrong API tier per T5 — desk research sufficient
- T6 (E2E PoC): Requires manual cookie extraction; API structure documented via HAR — PoC would only confirm what we know
- T7 (Rate limit probe): Risky on real account; go/no-go decision already clear without rate limit data

## T9: Go/no-go decision

- Verdict: **NO-GO on direct Airbnb integration now**
- Three independent paths all blocked: Partner API (closed), v2 REST (obsolete), v3 GraphQL (cookie auth + ToS violation)
- Continue with Hostfully — it already covers the use case as a Preferred+ Airbnb partner
- Re-evaluate when: Partner API opens, platform reaches 50+ customers / 500+ listings, 6+ months Hostfully uptime
- Full document: `/tmp/airbnb-research/go-no-go-decision.md` (165 lines)

## T10: Partner API next steps

- Playbook for when platform IS ready to pursue Partner API access
- Key milestones: 50+ customers, 500+ listings, 6+ months production track record
- Contact: airbnb-platform@airbnb.com — don't reach out early (one shot at first impression)
- Technical prep: OAuth 2.0 flow (~3 days), webhook receiver, shell tools — all patterns exist in codebase
- Full document: `/tmp/airbnb-research/partner-api-next-steps.md` (293 lines)

## Final inventory

All research artifacts in `/tmp/airbnb-research/`:

1. `tooling-setup.md` — T2 output (tool versions, setup guide)
2. `partner-api-analysis.md` — T4 output (31KB, Partner API NO-GO)
3. `credential-custody-decision.md` — T8 output (35KB, credential model NO-GO)
4. `har-capture-summary.md` — T5 output (8.6KB, API endpoint map)
5. `go-no-go-decision.md` — T9 output (15KB, final verdict)
6. `partner-api-next-steps.md` — T10 output (12KB, future playbook)
7. `captures/airbnb-web.har` — Raw HAR file (2.5MB) — NEVER COMMIT
8. `captures/airbnb-openapi.yaml` — Generated OpenAPI spec
