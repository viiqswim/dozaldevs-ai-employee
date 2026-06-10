# Cleaning Schedule Verification Guide

Use this guide when the cleaning-schedule employee produces wrong output. Follow each step to identify where the discrepancy occurred.

---

## Prerequisites

### Hostfully API credentials

Fetch from the database (never hardcode):

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT key, value FROM tenant_secrets WHERE tenant_id = '00000000-0000-0000-0000-000000000003';"
```

Look for `HOSTFULLY_API_KEY` and `HOSTFULLY_AGENCY_UID`. The agency UID for VLRE is `942d08d9-82bb-4fd3-9091-ca0c6b50b578`.

### Notion page IDs

| Page                 | ID                                 |
| -------------------- | ---------------------------------- |
| Directorio Operativo | `370d540b4380809a8ea0c11074f92abb` |
| Manual de Personal   | `370d540b438080969a72c16c20defc70` |
| Reporte Financiero   | `370d540b438080ca8676e61856488960` |

### Slack channel

`C0B71QSMZKQ` (ops-cleaning-schedule)

### Admin API key

```bash
source .env
echo $SERVICE_TOKEN
```

---

## Step-by-Step Verification Process

### Step 1 — Get all VLRE properties from Hostfully

```bash
curl -s "https://api.hostfully.com/api/v3.2/properties?agencyUid=<AGENCY_UID>&limit=100" \
  -H "X-HOSTFULLY-APIKEY: <API_KEY>" \
  -H "Accept: application/json" | jq '.properties[] | {uid: .uid, name: .name}'
```

If the agency has more than 100 properties, paginate using the `offset` parameter:

```bash
curl -s "https://api.hostfully.com/api/v3.2/properties?agencyUid=<AGENCY_UID>&limit=100&offset=100" \
  -H "X-HOSTFULLY-APIKEY: <API_KEY>" \
  -H "Accept: application/json"
```

### Step 2 — Get reservations for each property

**Critical gotcha: `checkInFrom`/`checkInTo` filter by CHECK-IN date, not checkout.** To find all checkouts on a target date, you need a wide range that captures any reservation that could have checked in before that date.

```bash
# Replace TARGET_DATE with the date you're verifying (e.g., 2026-06-01)
# DATE_MINUS_14 = 14 days before target (covers most stays)
# DATE_PLUS_1 = 1 day after target (catches same-day check-in/check-out)

curl -s "https://api.hostfully.com/api/v3.2/leads?propertyUid=<PROPERTY_UID>&checkInFrom=<DATE_MINUS_14>&checkInTo=<DATE_PLUS_1>&limit=100" \
  -H "X-HOSTFULLY-APIKEY: <API_KEY>" \
  -H "Accept: application/json" | jq '.leads[] | {uid: .uid, type: .type, status: .status, checkIn: .checkIn, checkOut: .checkOut}'
```

### Step 3 — Filter for valid checkouts on the target date

From the leads returned, keep only those that meet ALL of these criteria:

**Include:**

- `checkOut` starts with the target date string (e.g., `"2026-06-01"`)
- `type` is `"BOOKING"` — exclude `INQUIRY`, `BOOKING_REQUEST`, `BLOCK`
- `status` is one of: `BOOKED`, `STAY`, `BOOKED_BY_AGENT`, `BOOKED_BY_CUSTOMER`, `BOOKED_EXTERNALLY`

**Exclude:**

- `status` is `CANCELLED`, `CANCELLED_BY_TRAVELER`, `CANCELLED_BY_OWNER`, or `CLOSED`
- `type` is `BLOCK` (owner/maintenance holds)

Quick jq filter to apply this logic:

```bash
# Pipe the leads array through this filter
jq '[.leads[] | select(
  (.checkOut | startswith("<TARGET_DATE>")) and
  .type == "BOOKING" and
  (.status | IN("BOOKED","STAY","BOOKED_BY_AGENT","BOOKED_BY_CUSTOMER","BOOKED_EXTERNALLY"))
)]'
```

### Step 4 — Cross-reference with Directorio Operativo

Fetch the Directorio Operativo page to verify each property is in the correct ZIP zone:

```bash
tsx /tools/notion/get-page.ts --page-id 370d540b4380809a8ea0c11074f92abb
```

Or via the Notion API directly:

```bash
curl -s "https://api.notion.com/v1/blocks/370d540b4380809a8ea0c11074f92abb/children?page_size=100" \
  -H "Authorization: Bearer <NOTION_TOKEN>" \
  -H "Notion-Version: 2022-06-28" | jq '.results[] | .paragraph.rich_text[].plain_text'
```

For each property with a checkout on the target date:

- Confirm it appears under the correct zone (Kyle vs. Austin)
- Note the trash schedule listed for that property

**Known data issue:** Banton Rd was previously listed under Kyle instead of Austin. If you see a similar mismatch, the Notion data needs correction.

### Step 5 — Look up cleaning times from Reporte Financiero

```bash
tsx /tools/notion/get-page.ts --page-id 370d540b438080ca8676e61856488960
```

For each property, find its entry and determine the unit type:

- **Home** — full property
- **Room** — individual room within a property
- **Unidad** — apartment unit
- **Bundle** — multiple units cleaned together

The cleaning time varies by unit type. Do not assume 60 minutes for all properties. The Reporte Financiero has the authoritative per-property times.

### Step 6 — Determine cleaner assignment

```bash
tsx /tools/notion/get-page.ts --page-id 370d540b438080969a72c16c20defc70
```

Apply zone and day-of-week rules from Manual de Personal:

- **Diana** — all Kyle properties
- **Yessica** — Austin properties on weekdays
- Check weekend rules separately (they differ from weekday assignments)
- Verify total assigned time per cleaner does not exceed 7 hours

### Step 7 — Compare against actual employee output

Read the Slack channel to see what the employee posted:

```bash
source .env
curl -s "https://slack.com/api/conversations.history?channel=C0B71QSMZKQ&limit=10" \
  -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" | jq '.messages[] | {ts: .ts, text: (.text | .[0:300])}'
```

Check each entry in the employee's output against your manual calculation:

- Entry count matches (no missing or extra properties)
- Addresses are correct (watch for embedded unit designators like `"4405 - A Hayride lane"`)
- Cleaning times match Reporte Financiero
- Cleaner assignments match Manual de Personal rules
- No false positives (INQUIRY or CLOSED leads included by mistake)

---

## Common Failure Modes

### INQUIRY or BOOKING_REQUEST counted as valid

**Symptom:** Extra properties appear in the schedule that have no confirmed booking.

**Cause:** The type filter was missing or incomplete. Only `BOOKING` type leads represent confirmed reservations.

**Fix:** Verify the employee's execution steps include explicit type filtering. The `get-reservations.ts` tool accepts a `--status confirmed` flag that handles this.

### CLOSED leads counted as valid

**Symptom:** Properties appear in the schedule for guests who already checked out days ago.

**Cause:** Status filter didn't exclude `CLOSED`. Hostfully marks past reservations as `CLOSED` rather than deleting them.

**Fix:** Confirm the status filter explicitly excludes `CLOSED`, `CANCELLED`, `CANCELLED_BY_TRAVELER`, and `CANCELLED_BY_OWNER`.

### checkIn confused with checkOut (Hostfully API quirk)

**Symptom:** Properties with checkouts on the target date are missing, or properties with no checkout that day appear.

**Cause:** The Hostfully `checkInFrom`/`checkInTo` parameters filter by CHECK-IN date, not checkout. A reservation checking out on June 1 may have checked in on May 25 — it won't appear if you query `checkInFrom=2026-06-01`.

**Fix:** Always use a wide date range (at least 14 days back) for `checkInFrom`, then filter the results by `checkOut` date in code.

### Wrong ZIP zone in Directorio Operativo

**Symptom:** A property gets assigned to the wrong cleaner (e.g., a Kyle property assigned to Yessica).

**Cause:** The Notion page has the property listed under the wrong zone. This is a data error, not a code error.

**Fix:** Correct the Notion page directly. Note that `update-block.ts` only supports paragraph blocks — if the entry is a bulleted list item, you'll need to delete and recreate it.

### Hardcoded cleaning times

**Symptom:** All properties show the same cleaning time (e.g., 60 minutes) regardless of unit type.

**Cause:** The employee used a hardcoded default instead of looking up the time from Reporte Financiero.

**Fix:** The execution steps must include a Notion lookup for cleaning times. Verify the archetype's `execution_steps` field references the Reporte Financiero page ID.

### Raw Hostfully addresses with embedded unit designators

**Symptom:** Addresses appear as `"4405 - A Hayride lane"` instead of `"4405A Hayride Lane"` or similar.

**Cause:** Hostfully stores unit designators inline with the street address using `-` as a separator. The employee output should normalize these before posting.

**Fix:** The execution steps should include address normalization logic. Check whether the archetype handles this pattern.

### Model failing to call tools

**Symptom:** The employee completes but produces no output, or produces a generic message without any property data.

**Cause:** Some catalog models don't reliably call bash tools. The task completes without errors but the tools were never invoked.

**Fix:** Override the model to `deepseek/deepseek-v4-flash` via DB for testing:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "UPDATE archetypes SET model = 'deepseek/deepseek-v4-flash' WHERE id = '00000000-0000-0000-0000-000000000019';"
```

---

## Quick Reference

| Item                         | Value                                  |
| ---------------------------- | -------------------------------------- |
| Hostfully API base           | `https://api.hostfully.com/api/v3.2/`  |
| Agency UID (VLRE)            | `942d08d9-82bb-4fd3-9091-ca0c6b50b578` |
| Directorio Operativo page ID | `370d540b4380809a8ea0c11074f92abb`     |
| Manual de Personal page ID   | `370d540b438080969a72c16c20defc70`     |
| Reporte Financiero page ID   | `370d540b438080ca8676e61856488960`     |
| Slack channel                | `C0B71QSMZKQ` (ops-cleaning-schedule)  |
| Archetype ID                 | `00000000-0000-0000-0000-000000000019` |
| Tenant ID (VLRE)             | `00000000-0000-0000-0000-000000000003` |

### Trigger the employee manually

```bash
source .env
curl -s -X POST \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/cleaning-schedule/trigger" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"date":"YYYY-MM-DD"}}' | jq '{task_id: .task_id, status_url: .status_url}'
```

Replace `YYYY-MM-DD` with the date you want to generate the schedule for.

### Check task status

```bash
TASK_ID=<task_id>
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"

# Full lifecycle trace
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
  -c "SELECT from_status, to_status, created_at FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
```

### View worker logs

```bash
TASK_ID=<task_id>
docker logs -f employee-${TASK_ID:0:8}

# Or the harness log (persists after container exits)
grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30
```
