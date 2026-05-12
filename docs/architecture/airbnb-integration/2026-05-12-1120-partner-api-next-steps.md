# Airbnb Partner API: Next Steps Playbook

**Status**: NO-GO (as of 2026-05). Revisit when readiness milestones are met.  
**Decision context**: Direct Airbnb integration was evaluated and rejected. The Partner API is invite-only, and private API usage violates Airbnb's ToS with unacceptable security risk. This document is the playbook for when the platform is ready to pursue official access.

---

## 1. When to Pursue

Don't reach out to Airbnb until you can check all four boxes. Premature outreach wastes the one shot you get at a good first impression.

**Customer scale**

- 50+ property managers as paying customers
- Managing 500+ active listings through the platform
- At least 2-3 customers who explicitly need direct Airbnb access (not satisfied by Hostfully)

**Operational track record**

- 6+ months of production uptime on the Hostfully guest-messaging integration
- Documented reliability metrics (uptime, response time, error rates)
- A support structure that can handle Airbnb API issues directly (no PMS buffer)

**Why these thresholds?** Airbnb's partner team evaluates on supply opportunity, technology strength, and support ability. Without real customer volume and a proven track record, the pitch has no foundation. The platform's current profile (not a PMS, not managing hundreds of listings) doesn't fit their criteria yet.

---

## 2. How to Apply

### Initial outreach

Email **airbnb-platform@airbnb.com** with a business case. Keep it short. They get a lot of these.

**What to include in the pitch:**

- Total listings managed through the platform (the number they care about most)
- Customer list or representative case studies (anonymized is fine)
- Technology overview: what the platform does, how it handles messaging, what makes it different
- Support structure: how you handle API issues, SLA commitments, escalation path
- Specific use case: guest messaging automation with human approval gates

**What NOT to include:**

- Vague promises about future growth
- Technical architecture deep-dives (save for follow-up)
- Anything that sounds like you're building a workaround to their existing partner ecosystem

### Timeline expectations

Based on community reports, expect 3-6 months from initial contact to API access. The process typically goes:

1. Initial email (week 1)
2. Screening call with partner team (weeks 2-6)
3. Technical review (weeks 6-12)
4. Legal/compliance review (weeks 12-20)
5. Sandbox access granted (weeks 20-26)
6. Production access (after sandbox validation)

### Alternative paths

- Attend Airbnb's partner events and industry conferences (VRMA, VRWS). Relationships built in person move faster than cold emails.
- Connect through existing Airbnb partners (Hostfully, Guesty, etc.) who can provide introductions.
- If you have a customer who is a large Airbnb host, ask them to advocate internally. Host relationships carry weight.

---

## 3. Technical Preparation Checklist

Build these BEFORE getting API access. You want to move fast once the sandbox opens.

### OAuth 2.0 flow (~3 days)

The existing `tenant_secrets` infrastructure with AES-256-GCM encryption is already ready to store OAuth tokens. What's needed:

- [ ] OAuth authorization endpoint: `GET /oauth/airbnb/authorize?tenant=<id>`
- [ ] OAuth callback handler: `GET /oauth/airbnb/callback`
- [ ] Token refresh logic (Airbnb tokens expire; need background refresh)
- [ ] Store `access_token` and `refresh_token` in `tenant_secrets` (keys: `airbnb_access_token`, `airbnb_refresh_token`)
- [ ] Store `client_id` and `client_secret` in `tenant.config.airbnb`

Pattern reference: `src/gateway/slack/installation-store.ts` (per-tenant token storage) and `src/gateway/routes/` (OAuth callback pattern).

### Webhook receiver (~1 day)

- [ ] New route: `src/gateway/routes/airbnb.ts`
- [ ] Handle `NEW_MESSAGE` event type (equivalent to Hostfully's `NEW_INBOX_MESSAGE`)
- [ ] Tenant matching by Airbnb account ID (store in `tenant.config.airbnb.account_id`)
- [ ] Dedup by message ID (same pattern as `external_id: hostfully-msg-{message_uid}`)

Pattern reference: `src/gateway/routes/hostfully.ts`

### Shell tools (~3 days)

New directory: `src/worker-tools/airbnb/`

- [ ] `get-messages.ts` — fetch unresponded guest messages for a thread or all active reservations
- [ ] `send-message.ts` — send a reply to a guest thread
- [ ] `get-reservation.ts` — fetch reservation details (check-in, check-out, guest info)

Pattern reference: `src/worker-tools/hostfully/get-messages.ts`, `src/worker-tools/hostfully/send-message.ts`

### Archetype config (~1 day)

- [ ] Seed a new `archetypes` record: `role_name: 'airbnb-guest-messaging'`
- [ ] Same system prompt and lifecycle as `guest-messaging` (Hostfully)
- [ ] Model: `minimax/minimax-m2.7`
- [ ] `approval_required: true`, `timeout_hours: 24`
- [ ] Instructions reference `/tools/airbnb/` shell tools

### Test infrastructure (~2 days)

- [ ] Mock fixtures for Airbnb API responses (same pattern as `src/worker-tools/hostfully/__mocks__/`)
- [ ] Webhook payload fixtures for `NEW_MESSAGE` events
- [ ] Integration tests for OAuth flow

**Total pre-work estimate: ~10 days.** Do this before sandbox access so you can validate immediately when it opens.

---

## 4. Integration Architecture

The Airbnb integration slots into the existing platform without touching the universal lifecycle or shared infrastructure.

### New components

```
src/
├── gateway/
│   └── routes/
│       └── airbnb.ts              # Webhook receiver (NEW_MESSAGE events)
├── worker-tools/
│   └── airbnb/
│       ├── get-messages.ts        # Fetch unresponded guest messages
│       ├── send-message.ts        # Send reply via Airbnb API
│       └── get-reservation.ts     # Fetch reservation context
```

### Tenant config shape

```json
{
  "airbnb": {
    "client_id": "...",
    "client_secret": "...",
    "account_id": "...",
    "notification_channel": "C0AMGJQN05S"
  }
}
```

OAuth tokens go in `tenant_secrets`:

- `airbnb_access_token`
- `airbnb_refresh_token`

The `tenant-env-loader.ts` auto-uppercases and injects all `tenant_secrets` rows into the worker machine env. No code changes needed there.

### Lifecycle flow

```
Airbnb NEW_MESSAGE webhook
  → POST /webhooks/airbnb
    → match tenant by account_id (tenant.config.airbnb.account_id)
    → find archetype by { tenant_id, role_name: 'airbnb-guest-messaging' }
    → prisma.task.create → inngest.send('employee/task.dispatched')
    → universal lifecycle (identical to Hostfully path)
      → pre-check: if last message is from host → Done (no worker)
      → otherwise → worker → OpenCode
        → get-messages.ts --unresponded-only
        → post-guest-approval.ts → Slack card → PM approves
        → send-message.ts → Airbnb API
        → Done
```

The universal lifecycle in `src/inngest/employee-lifecycle.ts` doesn't change. The archetype config drives behavior.

### Estimated effort once API access is granted

- OAuth flow + webhook receiver: 3-4 days
- Shell tools: 3-4 days
- Archetype seeding + testing: 2-3 days
- E2E validation: 3-5 days
- **Total: 2-3 weeks**

---

## 5. Scope Requirements

Airbnb assigns scopes; you don't self-select. But you need to know what to request in your application.

### Request these scopes

| Scope               | Purpose                                      | Priority |
| ------------------- | -------------------------------------------- | -------- |
| `messages:read`     | Read guest messages in threads               | Critical |
| `messages:write`    | Send replies on behalf of hosts              | Critical |
| `reservations:read` | Fetch reservation details for context        | High     |
| `listings:read`     | Property details for guest messaging context | Medium   |
| Webhooks            | Real-time `NEW_MESSAGE` notifications        | Critical |

### Don't request these initially

- Calendar sync (scope creep, adds complexity)
- Pricing/availability (not needed for messaging)
- Reviews (separate use case, separate application)
- Financial data (never)

Requesting fewer scopes signals a focused use case. Airbnb is more likely to approve a narrow, well-defined integration than a broad one.

### Instant Booking constraint

All API-connected listings MUST have Instant Booking enabled. This is non-negotiable. Before onboarding any host to the direct Airbnb integration, verify their listings have Instant Booking on. If they don't, they stay on the Hostfully path.

---

## 6. Risk Mitigation

### Run alongside Hostfully, not instead of it

The Airbnb integration is additive. Hosts using Hostfully continue unchanged. Only hosts without a PMS who want direct Airbnb access use the new integration.

This means:

- No migration risk for existing customers
- Hostfully remains the primary path for most hosts
- Direct Airbnb is a premium option for hosts who need it

### Graceful degradation

If Airbnb revokes API access (it happens):

- Tasks in `Executing` state get marked `Failed` (existing SIGTERM handling covers this)
- Notify affected tenants via Slack
- Fall back to manual messaging or Hostfully if the host has a PMS
- Document the fallback path in the archetype's `agents_md`

### Monitoring

Add these to your observability stack before going live:

- Alert on Airbnb API error rate > 5% over 5 minutes
- Alert on OAuth token refresh failures
- Alert on webhook delivery failures (Airbnb retries, but you need to know)
- Track `NO_ACTION_NEEDED` rate (high rate = pre-check working; sudden drop = something's wrong)

---

## 7. Cost Considerations

### API costs

Airbnb's Partner API terms aren't public. When you get to the legal review stage, ask specifically about:

- Per-request pricing (if any)
- Revenue share requirements
- Rate limits and overage costs
- SLA commitments from Airbnb's side

Some partners report no direct API fees; others have revenue share arrangements. Don't assume it's free.

### Engineering costs

| Phase                            | Effort          | Notes                                         |
| -------------------------------- | --------------- | --------------------------------------------- |
| Pre-work (before sandbox)        | ~10 days        | OAuth, webhook, shell tools, tests            |
| Integration build (after access) | ~2-3 weeks      | Full implementation + E2E                     |
| Ongoing maintenance              | ~1-2 days/month | API changes, token refresh issues, edge cases |

### Support burden

Today, Hostfully handles Airbnb API issues. With direct integration, that's your problem. Budget for:

- Airbnb API deprecations (they happen with 3-6 months notice)
- OAuth token expiry edge cases
- Webhook delivery failures
- Rate limit handling

This is the real cost. Engineering time is predictable; support burden is not.

---

## Quick Reference

| Item                          | Value                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Contact email                 | airbnb-platform@airbnb.com                                                                                  |
| Expected timeline             | 3-6 months from outreach to access                                                                          |
| Pre-work estimate             | ~10 days                                                                                                    |
| Build estimate (post-access)  | 2-3 weeks                                                                                                   |
| Readiness threshold           | 50+ customers, 500+ listings, 6mo Hostfully track record                                                    |
| Hard constraint               | Instant Booking required on all connected listings                                                          |
| Existing infrastructure ready | `tenant_secrets` (OAuth tokens), AES-256-GCM encryption, universal lifecycle                                |
| Pattern files to reference    | `src/gateway/routes/hostfully.ts`, `src/worker-tools/hostfully/`, `src/gateway/slack/installation-store.ts` |
