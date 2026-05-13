# External Cron Service Evaluation

**Task**: Research and select an external cron service for triggering AI employees via the admin API  
**Date**: 2026-05-12  
**Scope**: Task 10 of platform-generalization plan (Wave 3)

---

## Admin Trigger Endpoint Reference

```
POST /admin/tenants/:tenantId/employees/:slug/trigger
Auth: X-Admin-Key: <ADMIN_API_KEY>
Content-Type: application/json
Body: {}
Response 202: { "task_id": "...", "status_url": "/admin/tenants/:id/tasks/:taskId" }
```

Defined in `src/gateway/routes/admin-employee-trigger.ts`. Uses `requireAdminKey` middleware which reads `X-Admin-Key` header and validates against `ADMIN_API_KEY` env var.

---

## Current Inngest Cron Schedules (to migrate or preserve)

| Trigger                      | Cron                | Description                                                                                 |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `trigger/daily-summarizer`   | `0 8 * * 1-5` (UTC) | 8am UTC weekdays — discovers all `daily-summarizer` archetypes, creates one task per tenant |
| `trigger/guest-message-poll` | `*/15 * * * *`      | Every 15 min — complex polling function (see section below)                                 |

---

## Service Comparison

| Service            | Pricing                                       | Timezone                 | Custom Headers  | JSON Body     | Min Interval | Reliability                           | Complexity                                |
| ------------------ | --------------------------------------------- | ------------------------ | --------------- | ------------- | ------------ | ------------------------------------- | ----------------------------------------- |
| **cron-job.org**   | Free, unlimited jobs                          | ✅ per-job IANA timezone | ✅ arbitrary    | ✅ POST body  | 1 min        | Good (no SLA, donation-funded)        | Low — UI or REST API                      |
| **EasyCron**       | Free = 1 job only; paid from $3.95/mo for 10+ | ✅ per-job               | ✅ (paid plans) | ✅            | 1 min        | 99.95% claimed SLA (paid)             | Low — UI                                  |
| **GitHub Actions** | Free (2000 min/mo private, unlimited public)  | ❌ UTC only              | ✅ via `curl`   | ✅ via `curl` | 5 min        | ⚠️ Known delays up to 1h on high-load | Medium — YAML in repo, version-controlled |
| **Pipedream**      | Free tier: ~500 executions/mo (10k credits)   | ✅ per-workflow          | ✅              | ✅            | 1 min        | Good, cloud-hosted                    | Medium — visual workflow builder          |

### Notes

**cron-job.org**: Completely free, donation-supported. Custom HTTP jobs configured via UI or REST API. `extendedData.headers` for custom headers, `extendedData.body` for POST body. Timezone is set per job with IANA name (e.g. `America/Chicago`). No guaranteed SLA but well-established (running since ~2012), used by developers globally.

**EasyCron**: Free tier is 1 job — immediately ruled out for multi-employee use. Paid plans fine but why pay when cron-job.org is free.

**GitHub Actions**: Good for UTC-scheduled, non-time-sensitive jobs. However:

- **UTC only** — no native timezone support; offsets must be calculated manually and hardcoded
- **Known schedule delays**: Documented 15–60 min delays during peak GitHub Actions load (issues open since 2021, still present). Unacceptable for a 15-min polling interval; borderline for daily jobs.
- **5-min minimum** interval enforced
- **Pro**: config lives in `.github/workflows/` (version-controlled), uses GitHub Secrets for API keys, free

**Pipedream**: Free tier credits (~500 runs/month) are fine for daily jobs but get consumed quickly for high-frequency jobs. More than needed for this use case.

---

## Recommendation: **cron-job.org**

### Rationale

1. **Completely free, no job limits** — handles any number of employees without cost
2. **Timezone-aware per job** — critical for future use cases (e.g. "2am Mountain Time" for Snobahn employee). Each job has its own timezone setting using IANA names.
3. **Full HTTP control** — custom headers (`X-Admin-Key`) and JSON body are first-class features
4. **1-minute minimum** — can handle any interval including the 15-min poll if needed
5. **Simple configuration** — one job per employee schedule, minimal setup
6. **Programmatic API** — `api.cron-job.org` REST API allows managing jobs from scripts if needed (future automation)

### Why not GitHub Actions

- **UTC only** — cannot express "2am Mountain Time" without hardcoding the UTC offset, which breaks on DST transitions
- **Schedule delays** — confirmed 15–60 min delays during GitHub high-load periods (well-documented, unfixed since 2021). Not acceptable when employees are time-sensitive.
- **5-min minimum** — limits future use cases
- GitHub Actions is appropriate for CI/CD, not for reliable time-aware HTTP cron

---

## guest-message-poll: Special Case Analysis

**The `trigger/guest-message-poll` function CANNOT be migrated to a simple external cron → admin API call.**

### Why

The poll function does complex infrastructure work that requires gateway-process access:

1. Discovers all `guest-messaging` archetypes via PostgREST
2. Decrypts `hostfully_api_key` and `hostfully_agency_uid` tenant secrets (AES-256-GCM) using `ENCRYPTION_KEY`
3. Calls Hostfully API: fetches all leads from last 30 days
4. For each lead, fetches last 5 messages to check if guest message is unresponded
5. Creates one `tasks` row per unresponded lead (with dedup checks)
6. Fires `employee/task.dispatched` Inngest event per task

The admin API trigger endpoint (`dispatchEmployee`) creates ONE task for the archetype — it does NOT scan leads or create multiple tasks. Calling it externally would trigger a single `guest-messaging` task with no `LEAD_UID`, causing the harness to fall back to full lead scan — which is not the same behavior.

### Options evaluated

**Option A — `guest-message-poller` archetype**: Create a new archetype where the OpenCode/MiniMax model does the Hostfully polling logic. External cron triggers it via admin API.

- ❌ Wrong layer — models should respond to specific guests, not run infrastructure polling loops
- ❌ MiniMax would need to decrypt secrets, call Hostfully API, create tasks — fragile and slow

**Option B — External cron fires Inngest event directly**: External cron calls Inngest's event API to fire `employee/poll.requested` which the existing function listens on.

- ❌ Inngest's event API requires the Inngest signing key and is not trivially exposed for external use in production
- ❌ Local dev exposes `http://localhost:8288/e/local` which is not public

**Option C — Keep as Inngest internal cron** ✅ **Recommended**

- The poll function is **infrastructure polling**, not a "scheduled employee trigger"
- External cron is for the pattern: "trigger this employee on a schedule" → admin API
- Polling is a different pattern: "scan all tenants, create N tasks as needed" → Inngest internal
- No migration needed — source preserved at `src/inngest/triggers/guest-message-poll.ts`

### Decision

**Keep `trigger/guest-message-poll` as Inngest internal cron. Do not migrate it to external cron.**

---

## Exact HTTP Configurations for cron-job.org

### Job 1 — daily-summarizer (DozalDevs)

| Field        | Value                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Title**    | `daily-summarizer — DozalDevs`                                                                                       |
| **URL**      | `https://<GATEWAY_PUBLIC_URL>/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger` |
| **Method**   | `POST`                                                                                                               |
| **Schedule** | Hours: `[8]`, Minutes: `[0]`, Days of week: `[1,2,3,4,5]` (Mon–Fri), Months: `[-1]` (all)                            |
| **Timezone** | `UTC`                                                                                                                |
| **Headers**  | `X-Admin-Key: <ADMIN_API_KEY>`, `Content-Type: application/json`                                                     |
| **Body**     | `{}`                                                                                                                 |

Equivalent cron expression: `0 8 * * 1-5 UTC`

**cron-job.org REST API payload to create this job:**

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

`requestMethod: 1` = POST in the cron-job.org API enum. `wdays` values: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.

### Job 2 — daily-summarizer (VLRE) — if a VLRE summarizer archetype is ever added

| Field        | Value                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Title**    | `daily-summarizer — VLRE`                                                                                            |
| **URL**      | `https://<GATEWAY_PUBLIC_URL>/admin/tenants/00000000-0000-0000-0000-000000000003/employees/daily-summarizer/trigger` |
| **Method**   | `POST`                                                                                                               |
| **Schedule** | Same as DozalDevs: `0 8 * * 1-5 UTC`                                                                                 |
| **Headers**  | `X-Admin-Key: <ADMIN_API_KEY>`, `Content-Type: application/json`                                                     |
| **Body**     | `{}`                                                                                                                 |

### Template for future employees (timezone-aware example)

Example: Future Snobahn employee running at 2am Mountain Time (UTC-7 or UTC-6 depending on DST):

```json
{
  "job": {
    "title": "snobahn-report — Snobahn",
    "url": "https://<GATEWAY_PUBLIC_URL>/admin/tenants/<TENANT_ID>/employees/snobahn-report/trigger",
    "enabled": true,
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

`timezone: "America/Denver"` handles MDT/MST transitions automatically. No manual UTC offset calculation needed.

---

## What stays in Inngest vs what moves to external cron

| Function                     | Action                            | Reason                                                                        |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `trigger/daily-summarizer`   | **Migrate to external cron**      | Simple trigger pattern — 1 HTTP call per tenant                               |
| `trigger/guest-message-poll` | **Keep as Inngest internal cron** | Complex infrastructure polling — cannot be expressed as simple admin API call |

---

## Notes for Task 11 (remove summarizer Inngest trigger) and Task 12 (cron-job.org setup)

- When removing `trigger/daily-summarizer` from Inngest, deregister it from the functions list (same pattern as how `trigger/daily-summarizer` is noted as deregistered in AGENTS.md)
- The function currently auto-discovers all `daily-summarizer` archetypes from the DB — the external cron jobs are per-tenant, so one cron job per tenant that has a `daily-summarizer` archetype
- Currently only DozalDevs (`00000000-0000-0000-0000-000000000002`) has a daily-summarizer archetype (ID `00000000-0000-0000-0000-000000000012`)
- `GATEWAY_PUBLIC_URL` = the Cloudflare tunnel URL (`https://local-ai-employee.dozaldevs.com` for local dev, Fly.io URL for production)
- `ADMIN_API_KEY` should be stored as a secret in cron-job.org's header config (not visible in UI after saving)
