# Guest Messaging — 05: Duplicate Detection

> **Purpose**: Verify that sending the same Hostfully webhook payload twice (same `message_uid`) creates only one task. The second request must return `{ ok: true, duplicate: true }` and no second task should appear in the DB.

> **Prerequisites**: Complete `00-prerequisites-and-setup.md` before running this test.

---

## Quick Reference

| Item              | Value                                      |
| ----------------- | ------------------------------------------ |
| Gateway           | `http://localhost:7700`                    |
| Inngest dashboard | `http://localhost:8288`                    |
| VLRE Tenant ID    | `00000000-0000-0000-0000-000000000003`     |
| Dedup key format  | `external_id: hostfully-msg-{message_uid}` |

---

## Background: How Deduplication Works

The webhook receiver sets `external_id = "hostfully-msg-{message_uid}"` when creating a task. The `tasks` table has a unique constraint on `(tenant_id, external_id)`. If a second POST arrives with the same `message_uid`, the Prisma upsert detects the conflict and returns `{ ok: true, duplicate: true }` without creating a new task or firing any Inngest events.

---

## Step 1 — Send the First Webhook

```bash
source .env

curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-dup-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2",
    "message": "Is parking available at the property?"
  }' | jq .
```

**Expected**:

```json
{ "ok": true, "task_id": "<uuid>" }
```

Note the `task_id`:

```bash
TASK_ID_1="<paste task_id here>"
```

---

## Step 2 — Verify the First Task Was Created

```bash
source .env

curl -s "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID_1" \
  -H "X-Admin-Key: $ADMIN_API_KEY" | jq '{id, status, external_id}'
```

**Expected**:

```json
{
  "id": "<task_id>",
  "status": "Received",
  "external_id": "hostfully-msg-test-dup-001"
}
```

---

## Step 3 — Send the Exact Same Webhook Again

Use the **identical payload** — same `message_uid: "test-dup-001"`.

```bash
curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-dup-001",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2",
    "message": "Is parking available at the property?"
  }' | jq .
```

**Expected**:

```json
{ "ok": true, "duplicate": true }
```

> **Critical**: The response must NOT contain a `task_id`. If it does, a second task was created — that is a bug.

---

## Step 4 — Verify Only One Task Exists in the DB

Query the DB directly via PostgREST to confirm only one task has `external_id = "hostfully-msg-test-dup-001"`:

```bash
curl -s "http://localhost:54331/tasks?external_id=eq.hostfully-msg-test-dup-001&tenant_id=eq.00000000-0000-0000-0000-000000000003" \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq 'length'
```

**Expected**: `1`

If the result is `2`, the deduplication constraint is not working.

---

## Step 5 — Verify Only One Inngest Run Exists

Open the Inngest dashboard at `http://localhost:8288` → Functions → `employee/universal-lifecycle`.

Filter by the task ID (`$TASK_ID_1`). You should see exactly **one run** for this task. No second run should have been triggered by the duplicate webhook.

---

## Step 6 — Send a Third Request with a Different message_uid

Confirm that a genuinely new message (different `message_uid`) still creates a new task:

```bash
curl -s -X POST http://localhost:7700/webhooks/hostfully \
  -H "Content-Type: application/json" \
  -d '{
    "agency_uid": "942d08d9-82bb-4fd3-9091-ca0c6b50b578",
    "event_type": "NEW_INBOX_MESSAGE",
    "message_uid": "test-dup-002",
    "thread_uid": "2f18249a-9523-4acd-a512-20ff06d5c3fa",
    "lead_uid": "37f5f58f-d308-42bf-8ed3-f0c2d70f16fb",
    "property_uid": "c960c8d2-9a51-49d8-bb48-355a7bfbe7e2",
    "message": "Also, is there a pool?"
  }' | jq .
```

**Expected**:

```json
{ "ok": true, "task_id": "<different uuid>" }
```

This confirms the dedup logic is keyed on `message_uid`, not on the thread or lead.

---

## ✅ Test Passed

- First request: `{ ok: true, task_id: "..." }` — task created
- Second request (same `message_uid`): `{ ok: true, duplicate: true }` — no new task
- DB query: exactly 1 task with that `external_id`
- Third request (different `message_uid`): `{ ok: true, task_id: "..." }` — new task created normally

**If the second request returns a new `task_id`**, the unique constraint on `(tenant_id, external_id)` is missing or the webhook handler is not setting `external_id` correctly. Check `src/gateway/routes/hostfully.ts`.
