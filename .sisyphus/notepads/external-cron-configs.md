# External Cron Configurations

**Task**: Task 11 of platform-generalization plan — document cron-job.org configuration for scheduled employees  
**Date**: 2026-05-12  
**Service**: [cron-job.org](https://cron-job.org) — free, unlimited jobs, per-job IANA timezone, custom headers + JSON body  
**Evaluation source**: `.sisyphus/notepads/external-cron-evaluation.md`

---

## Overview

External cron replaces the `trigger/daily-summarizer` Inngest internal cron. Each tenant with a `daily-summarizer` archetype gets its own cron-job.org job that calls the admin trigger endpoint.

**Pattern**: `POST /admin/tenants/:tenantId/employees/:slug/trigger` with `X-Admin-Key` header.

**What stays in Inngest**: `trigger/guest-message-poll` — see [guest-message-poll decision](#guest-message-poll-stays-in-inngest) below.

---

## Job 1 — daily-summarizer (DozalDevs)

**Tenant**: DozalDevs (`00000000-0000-0000-0000-000000000002`)  
**Archetype ID**: `00000000-0000-0000-0000-000000000012`

### cron-job.org UI Configuration

| Field        | Value                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Title**    | `daily-summarizer — DozalDevs`                                                                                       |
| **URL**      | `https://<GATEWAY_PUBLIC_URL>/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger` |
| **Method**   | `POST`                                                                                                               |
| **Schedule** | `0 8 * * 1-5` (8am UTC, Mon–Fri)                                                                                     |
| **Timezone** | `UTC`                                                                                                                |
| **Headers**  | `X-Admin-Key: <ADMIN_API_KEY>`, `Content-Type: application/json`                                                     |
| **Body**     | `{}`                                                                                                                 |

> **`<GATEWAY_PUBLIC_URL>`**: `https://local-ai-employee.dozaldevs.com` for local dev (Cloudflare tunnel), Fly.io URL for production.  
> **`<ADMIN_API_KEY>`**: Store as a secret in cron-job.org's header config — it will not be visible in the UI after saving.

### cron-job.org REST API Payload (programmatic creation)

```json
{
  "job": {
    "title": "daily-summarizer — DozalDevs",
    "url": "https://<GATEWAY_PUBLIC_URL>/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger",
    "enabled": true,
    "saveResponses": true,
    "requestMethod": 1,
    "schedule": {
      "timezone": "UTC",
      "expiresAt": 0,
      "hours": [8],
      "minutes": [0],
      "mdays": [-1],
      "months": [-1],
      "wdays": [1, 2, 3, 4, 5]
    },
    "extendedData": {
      "headers": {
        "X-Admin-Key": "<ADMIN_API_KEY>",
        "Content-Type": "application/json"
      },
      "body": "{}"
    }
  }
}
```

**API notes**:

- `requestMethod: 1` = POST
- `wdays` values: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
- `mdays: [-1]` = every day of month (filtered by `wdays`)
- `months: [-1]` = every month
- REST API base: `https://api.cron-job.org` — requires cron-job.org API key in `Authorization` header

---

## Job 2 — daily-summarizer (VLRE)

**Tenant**: VLRE (`00000000-0000-0000-0000-000000000003`)  
**Status**: No `daily-summarizer` archetype seeded for VLRE yet — create this job when/if a VLRE summarizer archetype is added.

### cron-job.org UI Configuration

| Field        | Value                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Title**    | `daily-summarizer — VLRE`                                                                                            |
| **URL**      | `https://<GATEWAY_PUBLIC_URL>/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-summarizer/trigger` |
| **Method**   | `POST`                                                                                                               |
| **Schedule** | `0 8 * * 1-5` (8am UTC, Mon–Fri)                                                                                     |
| **Timezone** | `UTC`                                                                                                                |
| **Headers**  | `X-Admin-Key: <ADMIN_API_KEY>`, `Content-Type: application/json`                                                     |
| **Body**     | `{}`                                                                                                                 |

### cron-job.org REST API Payload

```json
{
  "job": {
    "title": "daily-summarizer — VLRE",
    "url": "https://<GATEWAY_PUBLIC_URL>/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-summarizer/trigger",
    "enabled": true,
    "saveResponses": true,
    "requestMethod": 1,
    "schedule": {
      "timezone": "UTC",
      "expiresAt": 0,
      "hours": [8],
      "minutes": [0],
      "mdays": [-1],
      "months": [-1],
      "wdays": [1, 2, 3, 4, 5]
    },
    "extendedData": {
      "headers": {
        "X-Admin-Key": "<ADMIN_API_KEY>",
        "Content-Type": "application/json"
      },
      "body": "{}"
    }
  }
}
```

---

## Template for Future Employees (Timezone-Aware)

Example: A future Snobahn employee running at 2am Mountain Time (handles DST automatically via IANA timezone):

```json
{
  "job": {
    "title": "snobahn-report — Snobahn",
    "url": "https://<GATEWAY_PUBLIC_URL>/admin/tenants/<TENANT_ID>/employees/snobahn-report/trigger",
    "enabled": true,
    "saveResponses": true,
    "requestMethod": 1,
    "schedule": {
      "timezone": "America/Denver",
      "expiresAt": 0,
      "hours": [2],
      "minutes": [0],
      "mdays": [-1],
      "months": [-1],
      "wdays": [-1]
    },
    "extendedData": {
      "headers": {
        "X-Admin-Key": "<ADMIN_API_KEY>",
        "Content-Type": "application/json"
      },
      "body": "{}"
    }
  }
}
```

`timezone: "America/Denver"` handles MDT/MST transitions automatically — no manual UTC offset calculation needed. `wdays: [-1]` = every day of week.

---

## Manual Test Trigger (Local Dev)

Use these `curl` commands to verify the endpoint works before configuring cron-job.org:

### DozalDevs — dry run (validates without creating a task)

```bash
curl -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger?dry_run=true" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (200):

```json
{
  "valid": true,
  "would_fire": {
    "event_name": "employee/task.dispatched",
    "data": { ... },
    "external_id": "summary-YYYY-MM-DD"
  },
  "archetype_id": "00000000-0000-0000-0000-000000000012"
}
```

### DozalDevs — live trigger (creates a real task)

```bash
curl -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (202):

```json
{
  "task_id": "<uuid>",
  "status_url": "/admin/tenants/00000000-0000-0000-0000-000000000002/tasks/<uuid>"
}
```

### VLRE — live trigger (only works once a VLRE daily-summarizer archetype is seeded)

```bash
curl -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-summarizer/trigger" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Production (Fly.io gateway)

Replace `http://localhost:7700` with the Fly.io gateway URL. The `ADMIN_API_KEY` is the same value stored in Fly.io secrets.

---

## guest-message-poll Stays in Inngest

**Decision**: `trigger/guest-message-poll` is NOT migrated to external cron. It remains as an Inngest internal cron (`*/15 * * * *`).

### Why it cannot be a simple external cron → admin API call

The poll function does complex infrastructure work that requires gateway-process access:

1. Discovers all `guest-messaging` archetypes via PostgREST
2. Decrypts `hostfully_api_key` and `hostfully_agency_uid` tenant secrets (AES-256-GCM) using `ENCRYPTION_KEY`
3. Calls Hostfully API: fetches all leads from last 30 days
4. For each lead, fetches last 5 messages to check if guest message is unresponded
5. Creates one `tasks` row per unresponded lead (with dedup checks)
6. Fires `employee/task.dispatched` Inngest event per task

The admin API trigger endpoint (`dispatchEmployee`) creates **ONE task** for the archetype — it does NOT scan leads or create multiple tasks. Calling it externally would trigger a single `guest-messaging` task with no `LEAD_UID`, causing the harness to fall back to full lead scan — which is not the same behavior.

### Options evaluated and rejected

| Option | Description                                               | Why rejected                                                                       |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A      | `guest-message-poller` archetype — model does the polling | Wrong layer — models respond to guests, not run infrastructure loops               |
| B      | External cron fires Inngest event directly                | Inngest event API not trivially exposed for external use; local dev URL not public |
| **C**  | **Keep as Inngest internal cron** ✅                      | Infrastructure polling is a different pattern from "trigger this employee"         |

**Source preserved at**: `src/inngest/triggers/guest-message-poll.ts`

---

## What Moves to External Cron vs Stays in Inngest

| Function                     | Action                            | Reason                                                                        |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `trigger/daily-summarizer`   | **Migrate to external cron**      | Simple trigger pattern — 1 HTTP call per tenant, no gateway-process logic     |
| `trigger/guest-message-poll` | **Keep as Inngest internal cron** | Complex infrastructure polling — cannot be expressed as simple admin API call |

---

## Setup Checklist (when ready to configure cron-job.org)

- [ ] Sign up at https://cron-job.org (free, no credit card)
- [ ] Create Job 1: `daily-summarizer — DozalDevs` with config from [Job 1 section](#job-1--daily-summarizer-dozaldevs)
- [ ] Set `X-Admin-Key` header value to `$ADMIN_API_KEY` (stored as secret in cron-job.org)
- [ ] Set `<GATEWAY_PUBLIC_URL>` to the production Fly.io gateway URL
- [ ] Verify with dry-run curl before enabling the job
- [ ] Enable the job and confirm first execution in cron-job.org execution history
- [ ] Create Job 2 for VLRE when a VLRE `daily-summarizer` archetype is seeded
- [ ] After external cron is live and verified: deregister `trigger/daily-summarizer` from Inngest (Task 12)
