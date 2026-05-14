---
name: uuid-disambiguation
description: Use when passing UUIDs to shell tools or when confused about which UUID to use. Covers all UUID types in the system (lead_uid, thread_uid, property_uid, message_uid, task_id, tenant_id), their sources, env var names, and the critical rule that lead_uid and thread_uid are NEVER the same value.
---

# UUID Disambiguation Guide

UUID confusion is the #1 source of incorrect Hostfully links and mis-routed data in this
system. This skill defines every UUID type, where it originates, how it flows through the
system, and exactly which flag to pass to which shell tool.

---

## UUID Type Map

| UUID           | Identifies                              | Webhook Field              | Env Var        | Example (fake)                         |
| -------------- | --------------------------------------- | -------------------------- | -------------- | -------------------------------------- |
| `lead_uid`     | A guest reservation / lead in Hostfully | `lead_uid`                 | `LEAD_UID`     | `aaaaaaaa-0000-0000-0000-000000000001` |
| `thread_uid`   | A Hostfully message thread              | `thread_uid`               | `THREAD_UID`   | `bbbbbbbb-0000-0000-0000-000000000002` |
| `property_uid` | A Hostfully property                    | `property_uid`             | `PROPERTY_UID` | `cccccccc-0000-0000-0000-000000000003` |
| `message_uid`  | A single Hostfully message              | `message_uid`              | `MESSAGE_UID`  | `dddddddd-0000-0000-0000-000000000004` |
| `task_id`      | An AI employee task in the platform     | Set at task creation       | `TASK_ID`      | `eeeeeeee-0000-0000-0000-000000000005` |
| `tenant_id`    | A tenant in the platform                | Resolved from `agency_uid` | (not injected) | `00000000-0000-0000-0000-000000000003` |

---

## Complete Flow: Webhook → raw_event → Env Vars → Tool Flags

```
Hostfully webhook body
  { agency_uid, event_type, message_uid, thread_uid, lead_uid, property_uid }
         |
         ▼
  Gateway (src/gateway/routes/hostfully.ts)
  Stores in task.raw_event:
    { thread_uid, message_uid, lead_uid, property_uid }
         |
         ▼
  Lifecycle (src/inngest/employee-lifecycle.ts, dispatch-machine step)
  Extracts raw_event → injects env vars into worker machine:
    PROPERTY_UID = raw_event.property_uid
    LEAD_UID     = raw_event.lead_uid
    THREAD_UID   = raw_event.thread_uid
    MESSAGE_UID  = raw_event.message_uid
    TASK_ID      = task.id  (always injected by lifecycle)
         |
         ▼
  OpenCode worker reads env vars → passes to shell tools
```

Each env var maps to exactly one webhook field. They are injected only when the
field is non-empty in `raw_event`. If an env var is missing, the originating
webhook field was empty or not set.

---

## Tool-Flag Reference

### get-messages.ts — fetch conversation history

```bash
# CORRECT: use --lead-id (note: NOT --lead-uid)
tsx /tools/hostfully/get-messages.ts --lead-id "$LEAD_UID"
```

**⚠️ NAMING QUIRK**: This tool uses `--lead-id`, NOT `--lead-uid`. This is a known
naming inconsistency. All other tools in the system use `--lead-uid`. Do not be misled
by the inconsistency — the value to pass is still the lead UUID from `$LEAD_UID`.

If `--lead-id` is omitted, the tool falls back to the `LEAD_UID` env var and logs a
warning to stderr. Do not rely on this fallback in production — pass the flag explicitly.

The output JSON includes a `threadUid` field. This is populated from the `THREAD_UID`
env var at runtime, **not** from the Hostfully API. Never use the `leadUid` from the
output as the `threadUid`. They are different things.

---

### post-guest-approval.ts — post Slack approval card

```bash
# CORRECT: --lead-uid and --thread-uid are SEPARATE flags with DIFFERENT values
tsx /tools/slack/post-guest-approval.ts \
  --lead-uid   "$LEAD_UID"   \
  --thread-uid "$THREAD_UID" \
  --task-id    "$TASK_ID"    \
  --message-uid "$MESSAGE_UID" \
  ...
```

This tool accepts BOTH `--lead-uid` AND `--thread-uid` as separate required arguments.
They must be populated from their respective env vars and must **never** be equal.

**Built-in diagnostic**: If both flags receive identical values, the tool logs:

```
[post-guest-approval] WARNING: --lead-uid and --thread-uid are identical (aaaaaaaa-...).
This is likely a model error — these should be different UUIDs.
```

If this warning appears in stderr, you mixed up `LEAD_UID` and `THREAD_UID`. Fix the call.

---

### get-property.ts and get-reservations.ts

```bash
tsx /tools/hostfully/get-property.ts     --property-uid "$PROPERTY_UID"
tsx /tools/hostfully/get-reservations.ts --property-uid "$PROPERTY_UID"
```

These use `PROPERTY_UID`, not `LEAD_UID`. Do not pass a lead UUID to `--property-uid`.

---

## CRITICAL: lead_uid ≠ thread_uid — They Are Never Equal

|                               | `lead_uid`                                         | `thread_uid`               |
| ----------------------------- | -------------------------------------------------- | -------------------------- |
| **Identifies**                | A guest lead / reservation                         | A Hostfully message thread |
| **Webhook field**             | `lead_uid`                                         | `thread_uid`               |
| **Env var**                   | `LEAD_UID`                                         | `THREAD_UID`               |
| **Tool flag**                 | `--lead-id` (get-messages) · `--lead-uid` (others) | `--thread-uid`             |
| **Hostfully inbox URL param** | `leadUid=...`                                      | `threadUid=...`            |
| **Ever the same value?**      | **NEVER**                                          | **NEVER**                  |

The Hostfully inbox URL uses BOTH simultaneously:

```
https://platform.hostfully.com/app/#/inbox?threadUid=<THREAD_UID>&leadUid=<LEAD_UID>
```

Swapping them produces a URL that points to the wrong thread or a 404.

**Correct usage (fake UUIDs):**

```bash
# CORRECT — each flag gets a different UUID from its matching env var
tsx /tools/slack/post-guest-approval.ts \
  --lead-uid   "aaaaaaaa-0000-0000-0000-000000000001" \
  --thread-uid "bbbbbbbb-0000-0000-0000-000000000002"

# WRONG — both flags receive the same value → tool logs the "identical" warning
tsx /tools/slack/post-guest-approval.ts \
  --lead-uid   "aaaaaaaa-0000-0000-0000-000000000001" \
  --thread-uid "aaaaaaaa-0000-0000-0000-000000000001"
```

---

## Platform UUIDs vs. Hostfully UUIDs

**Hostfully UUIDs** (`lead_uid`, `thread_uid`, `property_uid`, `message_uid`) are
issued by Hostfully. They appear in webhook payloads and API responses.

**Platform UUIDs** are issued by this platform's database:

- `task_id` (`TASK_ID`) — identifies this task run in the platform database. Pass it
  as `--task-id` to `post-guest-approval.ts` and `post-message.ts`. It is NOT a
  Hostfully identifier.
- `tenant_id` — identifies a tenant in the platform. Never passed to Hostfully tools.
  Used internally by the lifecycle and gateway only.

Never pass `TASK_ID` to a Hostfully tool expecting a `lead_uid` or `property_uid`.

---

## All Tool Flags at a Glance

| Tool                     | Flag             | Source Env Var | UUID Type                     |
| ------------------------ | ---------------- | -------------- | ----------------------------- |
| `get-messages.ts`        | `--lead-id`      | `LEAD_UID`     | Hostfully lead (naming quirk) |
| `get-property.ts`        | `--property-uid` | `PROPERTY_UID` | Hostfully property            |
| `get-reservations.ts`    | `--property-uid` | `PROPERTY_UID` | Hostfully property            |
| `post-guest-approval.ts` | `--lead-uid`     | `LEAD_UID`     | Hostfully lead                |
| `post-guest-approval.ts` | `--thread-uid`   | `THREAD_UID`   | Hostfully thread              |
| `post-guest-approval.ts` | `--message-uid`  | `MESSAGE_UID`  | Hostfully message             |
| `post-guest-approval.ts` | `--task-id`      | `TASK_ID`      | Platform task                 |
| `send-message.ts`        | `--lead-uid`     | `LEAD_UID`     | Hostfully lead                |
| `post-message.ts`        | `--task-id`      | `TASK_ID`      | Platform task                 |

---

## Diagnostic Checklist

**Approval card links to wrong Hostfully thread:**

1. Check stderr of `post-guest-approval.ts` — look for the "identical" warning
2. Confirm `--lead-uid` came from `$LEAD_UID` and `--thread-uid` from `$THREAD_UID`
3. Verify the two values differ — if they match, you swapped the env vars

**get-messages.ts returns empty array:**

1. Check `echo "$LEAD_UID"` — if empty, `raw_event.lead_uid` was missing from the webhook
2. Confirm you used `--lead-id` not `--lead-uid` (naming quirk)
3. Confirm you are not passing `$PROPERTY_UID` or `$THREAD_UID` to `--lead-id`

**Tool exits with "missing argument":**

1. Check that the env var is non-empty before calling the tool
2. Verify the webhook stored the field in `task.raw_event` (check DB if needed)
