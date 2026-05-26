# Learnings — fix-inspiration-delivery

## 2026-05-26 — Session Init

### Harness: Exact Code Locations

**`markFailed` function (lines 90-126 of opencode-harness.mts):**

- Current signature: `markFailed(reason: string, executionId: string | null, failureCode?: string)`
- NEW signature needed: `markFailed(reason: string, executionId: string | null, fromStatus: string, failureCode?: string)`
- Line 106-111: `task_status_log` POST — change actor `'opencode_harness'` → `'machine'`, add `updated_at`, change `from_status: 'Delivering'` → `from_status: fromStatus`

**markFailed call sites:**

- L656: `markFailed('No deliverable found for delivery phase', null, classifyFailure(...))` — delivery → add `'Delivering'` as 3rd arg
- L672: `markFailed('Archetype missing delivery_instructions', null, classifyFailure(...))` — delivery → add `'Delivering'` as 3rd arg
- L723: `markFailed(deliveryErr, null, classifyFailure(deliveryErr))` — delivery → add `'Delivering'` as 3rd arg
- L734: `markFailed('Delivery not confirmed — no summary.txt produced', null, classifyFailure(...))` — delivery → add `'Delivering'` as 3rd arg
- L745: `markFailed('Delivery not confirmed — summary.txt is not valid JSON', null, classifyFailure(...))` — delivery → add `'Delivering'` as 3rd arg
- L753: `markFailed('Delivery not confirmed — send-message.ts may not have succeeded', null, classifyFailure(...))` — delivery → add `'Delivering'` as 3rd arg
- L927: `markFailed(failureReason, executionId, classifyFailure(failureReason))` — EXECUTION PHASE → add `'Executing'` as 3rd arg

**Delivering→Done success path (lines 769-777):**

- Line 773: `actor: 'opencode_harness'` → `actor: 'machine'`, add `updated_at: new Date().toISOString()`

### Archetype: Current State (SQL script matches DB)

**Archetype ID:** `3b07ec63-207f-4f2b-a8c3-c17f08bc508f`

**Current `instructions` (problematic part — last 2 lines):**

```
Then submit your output:
tsx /tools/platform/submit-output.ts --summary "Posted daily real estate inspiration message" --classification "NO_ACTION_NEEDED"
```

Problem: No `--draft` flag → actual message never stored

**Current `delivery_instructions` (problematic):**

```
Post the inspirational message to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.
```

Problems: (1) No instruction to parse JSON, (2) The `--- APPROVED CONTENT ---` block has NO actual message (only summary JSON), (3) Ambiguous about HOW to write summary.txt

### Actor CHECK Constraint

Allowed values: `'gateway', 'lifecycle_fn', 'watchdog', 'machine', 'manual'`
`'machine'` is correct for worker containers — NO migration needed

### Pattern Reference (employee-lifecycle.ts:67-72)

Correct `task_status_log` POST shape:

```typescript
{
  task_id: taskId,
  from_status: fromStatus ?? null,
  to_status: toStatus,
  actor: 'lifecycle_fn',  // harness uses 'machine'
  updated_at: new Date().toISOString(),
}
```

### submit-output.ts `--draft` flag

- Lines 49-50: Parses `--draft <text>` arg
- Line 134: Includes in output if not null: `output['draft'] = args.draft`
- Output format: `{"summary":"...","classification":"...","draft":"actual content"}`

### Delivery Harness Check (line 752)

```typescript
if (deliverySummary.delivered !== true) { ... fail ... }
```

`submit-output.ts` does NOT write a `delivered` key. Delivery container must write `/tmp/summary.txt` DIRECTLY:

```bash
echo '{"delivered":true}' > /tmp/summary.txt
```

### SQL Script Location

`scripts/2026-05-25-update-archetype-delivery.sql` — update section 2 (lines 46-62) only
DO NOT change sections 1, 3, or 4.

---

## 2026-05-26 — Shell Quoting Fix

### Root Cause of Run #8 and #2 Failures

LLM generates messages with double-quotes (e.g. "Every room..."). When it tries `--draft "message with \"quotes\""` in bash, the shell command breaks. LLM retries twice (both fail), then falls back to no --draft. Result: deliverable has no `draft` field → delivery fails.

### Fix Applied (commits 316bc90 and 9e5b24c)

**Problem observed in logs:** LLM DID write file to `/tmp/inspiration-draft.txt` via Write tool at 18:16:04, but then ran `submit-output.ts --summary "..." --classification "NO_ACTION_NEEDED"` WITHOUT `--draft-file` at 18:16:09. LLM constructed the command from scratch, forgetting the flag.

**Two-pronged fix:**

1. **`--draft-file <path>` option** added to `src/worker-tools/platform/submit-output.ts` — reads draft from a file path instead of inline text. No shell quoting issues.

2. **Auto-discovery of `/tmp/draft.txt`** — if no `--draft` or `--draft-file` is provided, submit-output.ts automatically checks if `/tmp/draft.txt` exists and reads it as the draft. This is the primary fix: the LLM only needs to run `submit-output.ts --summary "..." --classification "..."` with no draft flags at all.

**Archetype instructions updated** (DB + SQL script): Tell LLM to write to `/tmp/draft.txt` via Write tool, then run the simple command. The tool handles the rest.

**Verified:** Task `3724ec93-387c-43fe-870c-b80ec656eab4` reached `Done` with a fully populated `draft` field in the deliverable.

### Key Lesson

When an LLM repeatedly forgets a CLI flag, the fix is to remove the flag from the required command entirely. Let the tool handle auto-discovery of the file — the LLM's only job is to write the file (via Write tool) and run a simple command.
