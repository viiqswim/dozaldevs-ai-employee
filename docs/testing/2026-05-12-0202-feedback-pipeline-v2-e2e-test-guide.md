# Feedback Pipeline v2 E2E Test Guide

This guide covers six scenarios that together exercise the full feedback pipeline for the
guest-messaging employee after the v2 redesign: correction capture via `feedback_events` →
rule extraction → PM review via `employee_rules` → confirmation → injection into the next
worker run via `EMPLOYEE_RULES` and `EMPLOYEE_KNOWLEDGE`. Run them in order the first time
— each scenario builds on the state left by the prior.

**What changed in v2 (context only — not required reading):**

- Old tables `feedback` and `learned_rules` are no longer written by active code paths.
- New tables: `feedback_events` (immutable audit log) and `employee_rules` (behavioral rules).
- Old env vars `FEEDBACK_CONTEXT` and `LEARNED_RULES_CONTEXT` are gone.
- New env vars: `EMPLOYEE_RULES` (8KB cap, confirmed rules) and `EMPLOYEE_KNOWLEDGE` (32KB cap, knowledge_bases themes).
- `trigger/feedback-summarizer` cron is deregistered and deleted — synthesis is now event-driven.

---

## Prerequisites

Before running any scenario, confirm services are live:

```bash
# Gateway
curl -s http://localhost:7700/health
# → {"status":"ok"}

# Inngest
curl -s http://localhost:8288/health
# → {"status":200,"message":"OK"}

# Gateway logs show Socket Mode connected (check tmux ai-dev)
tail -20 /tmp/ai-dev.log | grep -i "socket mode"
# → ... "Slack Bolt — Socket Mode connected"
```

**Fixed test resources (VLRE tenant)**

| Resource                     | Value                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| Airbnb guest thread          | `https://www.airbnb.com/guest/messages/2525238359`                          |
| Thread UID                   | `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`                                      |
| Lead UID                     | `29a64abd-d02c-44bc-8d5c-47df58a7ab14`                                      |
| Property UID                 | `562695df-6a4f-40d6-990d-56fe043aa9e8`                                      |
| Slack approval channel       | `#cs-guest-communication` (`C0AMGJQN05S`) — approval cards and edit threads |
| Slack notification channel   | `C0960S2Q8RL` — rule review cards and synthesis cards                       |
| VLRE tenant ID               | `00000000-0000-0000-0000-000000000003`                                      |
| Guest-messaging archetype ID | `00000000-0000-0000-0000-000000000015`                                      |
| DB                           | `postgresql://postgres:postgres@localhost:54322/ai_employee`                |
| Inngest dashboard            | `http://localhost:8288`                                                     |

**Channel distinction** — two Slack channels are involved:

- `C0AMGJQN05S` (`#cs-guest-communication`) — where guest approval cards and their threads live;
  `awaiting_input` messages (from non-extractable rejections) are posted as thread replies here.
- `C0960S2Q8RL` — where rule review cards (proposed rules) and synthesis cards are posted as
  standalone top-level messages.

**Unique message suffix pattern:** include `[e2e-test-{unix_epoch}]` in every Airbnb message
to prevent dedup collisions. Generate with: `date +%s`

---

## Scenario A — Edit & Send: `feedback_events` row + rule extraction

**Exercises:** PM clicks "✏️ Edit & Send" on an approval card → lifecycle writes a
`feedback_events` row with `event_type = 'edit_diff'` → fires `employee/rule.extract-requested`
→ `rule-extractor` calls Claude Haiku → stores proposed rule in `employee_rules` with
`status = 'proposed'` → posts rule review card in `C0960S2Q8RL`.

---

### Step 1 — Send a guest message that invites a clear, editable draft

| Action                                                         | Where              |
| -------------------------------------------------------------- | ------------------ |
| Navigate to `https://www.airbnb.com/guest/messages/2525238359` | Playwright browser |
| Click `textbox "Write a message..."`                           | Compose bar        |
| Type: `What time is checkout? [e2e-test-{epoch}]`              | Compose bar        |
| Click `button "Send"`                                          | Airbnb thread      |

Wait for the approval card to appear in `#cs-guest-communication`. The standard flow:
gateway receives webhook → task created → worker executes → approval card appears in the
`#cs-guest-communication` thread.

- [ ] Checkpoint: approval card visible in `#cs-guest-communication` thread

---

### Step 2 — Click "✏️ Edit & Send" and make a meaningful change

| Action                                                                   | Where        |
| ------------------------------------------------------------------------ | ------------ |
| In the thread, click `button "pencil2 emoji Edit & Send"` (`guest_edit`) | Slack thread |

A modal opens with the AI draft pre-filled. Modify the response meaningfully — for example,
add a specific sentence or change the sign-off substantially so the diff is clear:

```
Original: "Checkout is at 11 AM. Let us know if you have any other questions."
Edited:   "Checkout is at 11 AM. Thank you for staying with us, Olivia — we hope to host you again!"
```

Submit the modal.

**Internal check — `feedback_events` row written and event fired:**

```bash
tail -50 /tmp/ai-dev.log | grep "edit_diff feedback_event\|rule.extract-requested\|rule-extractor"
```

Expected log lines:

```
{"msg":"edit_diff feedback_event written","taskId":"..."}
{"msg":"Rule extraction complete — status: proposed","ruleId":"...","tenantId":"...","archetypeId":"..."}
```

**Inngest check:** Open `http://localhost:8288` → find the `employee/rule-extractor` function run →
confirm the `extract-rule` step executed and returned `{"extractable": true, "rule": "..."}`.

- [ ] Checkpoint: `edit_diff feedback_event written` in gateway logs

---

### Step 3 — Verify `feedback_events` row in DB

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, event_type, LEFT(correction_content, 100) AS correction,
          LEFT(original_content, 100) AS original, actor_id, created_at
   FROM feedback_events
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND event_type = 'edit_diff'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: a row with `event_type = 'edit_diff'`, `correction_content` set to the edited text,
`original_content` set to the original AI draft, and `actor_id` set to your Slack user ID.

- [ ] Checkpoint: `feedback_events` row with `event_type = 'edit_diff'` exists

---

### Step 4 — Confirm proposed rule card appears in notification channel

Navigate to `C0960S2Q8RL` in Slack. A new **top-level** message from the bot must appear:

```
🧠 *New behavioral rule proposed:*

> [extracted rule text — e.g. "Always end guest messages with a warm, personalized sign-off"]

──────────────────────
  ✅ Confirm   ❌ Reject   ✏️ Rephrase
Rule `{ruleId}`
```

**DB check — rule in `proposed` status:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, source, status, slack_ts, slack_channel
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND archetype_id = '00000000-0000-0000-0000-000000000015'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: a row with `source = 'edit_diff'`, `status = 'proposed'`, and `slack_ts` populated.

- [ ] Checkpoint: `employee_rules` row with `source = 'edit_diff'` and `status = 'proposed'`

---

### Step 5 — Click "✅ Confirm"

| Action                                                           | Where                     |
| ---------------------------------------------------------------- | ------------------------- |
| Click `button "white_check_mark emoji Confirm"` (`rule_confirm`) | Notification channel card |

The card updates immediately via Socket Mode ack to:

```
✅ Rule confirmed by <@YourSlackHandle>
Rule `{ruleId}`
```

**DB check — rule moved to `confirmed`:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, confirmed_at
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'confirmed'
   ORDER BY confirmed_at DESC LIMIT 3;"
```

Expected: the new rule appears with `status = 'confirmed'` and `confirmed_at` set to now.

- [ ] Checkpoint: `employee_rules` row with `status = 'confirmed'` and `confirmed_at` set

---

## Scenario B — Reject with reason: `feedback_events` row + rule extraction

**Exercises:** PM clicks "❌ Reject" on an approval card → rejection modal opens → PM types a
reason → lifecycle writes a `feedback_events` row with `event_type = 'rejection_reason'` →
fires `employee/rule.extract-requested` → rule-extractor extracts a rule → proposed rule card
in `C0960S2Q8RL`.

---

### Step 1 — Send a guest message and wait for approval card

Follow Scenario A / Step 1. Send a new message (use a fresh epoch suffix) and wait for the
approval card to appear in `#cs-guest-communication`.

- [ ] Checkpoint: approval card visible in `#cs-guest-communication` thread

---

### Step 2 — Click "❌ Reject" and provide a reason

| Action                                                             | Where        |
| ------------------------------------------------------------------ | ------------ |
| In the thread, click `button "x emoji Reject"` (`guest_reject`)    | Slack thread |
| In the modal, type a clear reason in "Rejection Reason (optional)" | Modal        |

Example reason:

```
The response was too formal. Always use a friendly, conversational tone with guests.
```

Click "Reject" to submit the modal.

**Internal check — `feedback_events` row written and event fired:**

```bash
tail -50 /tmp/ai-dev.log | grep "rejection_reason feedback_event\|rule.extract-requested fired for rejection_reason"
```

Expected:

```
{"msg":"rejection_reason feedback_event written","taskId":"..."}
{"msg":"rule.extract-requested fired for rejection_reason","taskId":"..."}
```

- [ ] Checkpoint: `rejection_reason feedback_event written` in gateway logs

---

### Step 3 — Verify `feedback_events` row in DB

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, event_type, LEFT(correction_content, 150) AS reason, actor_id, created_at
   FROM feedback_events
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND event_type = 'rejection_reason'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: a row with `event_type = 'rejection_reason'` and `correction_content` set to the
typed reason.

- [ ] Checkpoint: `feedback_events` row with `event_type = 'rejection_reason'` exists

---

### Step 4 — Confirm proposed rule card appears in notification channel

Navigate to `C0960S2Q8RL`. A new rule review card must appear with the extracted rule.

**DB check:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, source, status
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND source = 'rejection'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: row with `source = 'rejection'` and `status = 'proposed'`.

> Note: `feedbackType = 'rejection_reason'` maps to `source = 'rejection'` in the rule-extractor
> (only `edit_diff` uses `source = 'edit_diff'`; all other types use `'rejection'`).

- [ ] Checkpoint: `employee_rules` row with `source = 'rejection'` and `status = 'proposed'`

---

### Step 5 — Click "✅ Confirm"

Same as Scenario A / Step 5. Confirm the rule transitions to `confirmed` in the DB.

- [ ] Checkpoint: `employee_rules` row with `status = 'confirmed'` and `confirmed_at` set

---

## Scenario C — Reject without reason: `feedback_events` + `awaiting_input` rule

**Exercises:** PM clicks "❌ Reject" and submits the modal with no reason → lifecycle writes a
`feedback_events` row with `event_type = 'rejection'` → creates an `employee_rules` row with
`status = 'awaiting_input'` → posts a thread reply in `#cs-guest-communication` asking the PM
what to learn → PM replies in thread → `interaction-handler` patches the rule to `proposed` →
posts a rule review card in the thread → PM confirms.

---

### Step 1 — Send a guest message and wait for approval card

Follow Scenario A / Step 1. Send a new message and wait for the approval card.

- [ ] Checkpoint: approval card visible in `#cs-guest-communication` thread

---

### Step 2 — Click "❌ Reject" with no reason

| Action                                                          | Where        |
| --------------------------------------------------------------- | ------------ |
| In the thread, click `button "x emoji Reject"` (`guest_reject`) | Slack thread |
| Leave "Rejection Reason (optional)" blank                       | Modal        |
| Click "Reject"                                                  | Modal        |

**Internal check — both `feedback_events` and `employee_rules` written:**

```bash
tail -50 /tmp/ai-dev.log | grep "rejection feedback_event written\|awaiting_input employee_rule created"
```

Expected:

```
{"msg":"rejection feedback_event written","taskId":"..."}
{"msg":"awaiting_input employee_rule created for rejection without reason","taskId":"..."}
```

- [ ] Checkpoint: both log lines appear

---

### Step 3 — Verify `feedback_events` and `employee_rules` rows in DB

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, event_type, actor_id, created_at
   FROM feedback_events
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND event_type = 'rejection'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: row with `event_type = 'rejection'` and no `correction_content` (NULL).

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, source, source_task_id, slack_ts
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'awaiting_input'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: row with `status = 'awaiting_input'`, `rule_text = ''`, and `source_task_id` set to
the current task ID.

- [ ] Checkpoint: `feedback_events` row with `event_type = 'rejection'` (no correction_content)
- [ ] Checkpoint: `employee_rules` row with `status = 'awaiting_input'` and empty `rule_text`

---

### Step 4 — Confirm "What should I learn?" appears in the approval card thread

In the `#cs-guest-communication` thread for this task, a **new reply** must appear:

```
@{YourSlackHandle} What should I learn from this change? (Reply here — I'll record it.)
```

The message is posted as a thread reply to the approval card. If `actorUserId` is set, it
includes a `<@userId>` mention.

- [ ] Checkpoint: "What should I learn?" thread reply visible in `#cs-guest-communication`

---

### Step 5 — Reply to the thread with a clear rule

In the `#cs-guest-communication` thread (in reply to the "What should I learn?" message), type:

```
Always greet the guest by name at the start of the message.
```

Send the reply.

**Internal check — interaction handler picks up the reply:**

```bash
tail -30 /tmp/ai-dev.log | grep "Awaiting-input rule captured\|awaiting-input\|status: proposed"
```

Expected: `interaction-handler` detects the `awaiting_input` rule for this task, patches
`rule_text` and `status = 'proposed'`, then posts a rule review card.

- [ ] Checkpoint: `Awaiting-input rule captured from thread reply — status: proposed` in logs

---

### Step 6 — Confirm proposed rule card appears in thread

Still in the `#cs-guest-communication` thread, a **new reply** appears:

```
🧠 *New behavioral rule proposed:*

> Always greet the guest by name at the start of the message.

──────────────────────
  ✅ Confirm   ❌ Reject   ✏️ Rephrase
Rule `{ruleId}`
```

**DB check — rule moved to `proposed`:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, slack_ts, slack_channel
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 1;"
```

Expected: `rule_text` is set (your typed rule), `status = 'proposed'`.

- [ ] Checkpoint: `employee_rules` row with `status = 'proposed'` and `rule_text` set

---

### Step 7 — Click "✅ Confirm"

Click `button "Confirm"` (`rule_confirm`) on the in-thread card. Verify `status = 'confirmed'`
in the DB (same check as Scenario A / Step 5).

- [ ] Checkpoint: `employee_rules` row with `status = 'confirmed'` and `confirmed_at` set

---

## Scenario D — Thread reply / @mention captured as `feedback_events`

**Exercises:** PM sends a thread reply or @mention in `#cs-guest-communication` →
`interaction-handler` classifies intent as `feedback` or `teaching` → writes a `feedback_events`
row with `event_type = 'thread_reply'` or `'teaching'` → fires `employee/rule.extract-requested`
→ proposed rule card in `C0960S2Q8RL`.

> This scenario does NOT require a live Airbnb message. The @mention can be sent in any channel
> the bot is present in. `#cs-guest-communication` works.

---

### Step 1 — @mention the bot with a clear teaching

In `#cs-guest-communication`, type a message that @mentions the guest-messaging bot and gives
a specific, actionable instruction:

```
@Papi chulo When guests ask about parking, always mention that street parking is free and
available directly in front of the property.
```

Send the message.

**Internal check — interaction event emitted:**

```bash
tail -30 /tmp/ai-dev.log | grep "interaction.received\|classify-intent\|teaching\|Interaction handled"
```

Expected: `interaction-handler` function triggered, intent classified as `teaching` or `feedback`.

- [ ] Checkpoint: `Interaction handled` log line with `intent: "teaching"` or `intent: "feedback"`

---

### Step 2 — Confirm acknowledgment reply appears

The bot replies in-thread (or in channel) with a warm acknowledgment generated by Claude Haiku:

```
Got it! I'll keep that in mind — parking details are helpful context for guests.
Task `{archetypeId}`
```

- [ ] Checkpoint: bot acknowledgment reply visible in channel

---

### Step 3 — Verify `feedback_events` row in DB

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, event_type, LEFT(correction_content, 150) AS content, actor_id, created_at
   FROM feedback_events
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND event_type IN ('teaching', 'thread_reply', 'mention_feedback')
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: new row with `event_type` matching the interaction source (`'teaching'` for @mention
with teaching intent, `'thread_reply'` for thread reply with feedback intent) and
`correction_content` set to the message text.

- [ ] Checkpoint: `feedback_events` row with appropriate `event_type` and `correction_content`

---

### Step 4 — Confirm proposed rule card in notification channel

Navigate to `C0960S2Q8RL`. A new rule review card must appear:

```
🧠 *New behavioral rule proposed:*

> [e.g. "When guests ask about parking, mention that free street parking is available in front of the property"]

──────────────────────
  ✅ Confirm   ❌ Reject   ✏️ Rephrase
Rule `{ruleId}`
```

**DB check:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, source, status
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND source = 'rejection'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 1;"
```

Expected: row with `source = 'rejection'` and `status = 'proposed'`.

- [ ] Checkpoint: rule review card visible in `C0960S2Q8RL`
- [ ] Checkpoint: `employee_rules` row with `source = 'rejection'` and `status = 'proposed'`

---

### Step 5 — Click "✅ Confirm"

Same as Scenario A / Step 5. Confirm the rule transitions to `confirmed` in the DB.

- [ ] Checkpoint: `employee_rules` row with `status = 'confirmed'` and `confirmed_at` set

---

## Scenario E — Rule confirm/reject/rephrase via Slack card

**Exercises:** all three rule action buttons on a proposed rule card:

- `rule_confirm` → `status = 'confirmed'`, `confirmed_at` set, `employee/rule.confirmed` event fired
- `rule_reject` → `status = 'rejected'`
- `rule_rephrase` → modal opens, PM edits text, `rule_text` updated, Slack card updated in place

> Prerequisite: at least one proposed rule must exist (from Scenarios A, B, C, or D).
> If none exist, run Scenario A through Step 4 to create one.

---

### Step 1 — Confirm a proposed rule (rule_confirm)

Navigate to `C0960S2Q8RL`. Find a proposed rule card.

| Action                                                           | Where                     |
| ---------------------------------------------------------------- | ------------------------- |
| Click `button "white_check_mark emoji Confirm"` (`rule_confirm`) | Notification channel card |

The card updates to:

```
✅ Rule confirmed by <@YourSlackHandle>
Rule `{ruleId}`
```

**DB check — rule confirmed:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, confirmed_at
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'confirmed'
   ORDER BY confirmed_at DESC LIMIT 3;"
```

Expected: `status = 'confirmed'` and `confirmed_at` set to now.

**Inngest check — `employee/rule.confirmed` event fired:**

Open `http://localhost:8288` → Events → find `employee/rule.confirmed` event with the rule ID.

- [ ] Checkpoint: card updates to "✅ Rule confirmed by @..."
- [ ] Checkpoint: `employee_rules` row with `status = 'confirmed'` and `confirmed_at` set
- [ ] Checkpoint: `employee/rule.confirmed` event visible in Inngest dashboard

---

### Step 2 — Reject a proposed rule (rule_reject)

Create another proposed rule (run Scenario A through Step 4 again with a new Airbnb message).
On the new proposed rule card:

| Action                                          | Where                     |
| ----------------------------------------------- | ------------------------- |
| Click `button "x emoji Reject"` (`rule_reject`) | Notification channel card |

The card updates to:

```
❌ Rule rejected by <@YourSlackHandle>
Rule `{ruleId}`
```

**DB check — rule rejected:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'rejected'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: `status = 'rejected'`.

- [ ] Checkpoint: card updates to "❌ Rule rejected by @..."
- [ ] Checkpoint: `employee_rules` row with `status = 'rejected'`

---

### Step 3 — Rephrase a proposed rule (rule_rephrase)

Create another proposed rule. On the new proposed rule card:

| Action                                                    | Where                     |
| --------------------------------------------------------- | ------------------------- |
| Click `button "pencil2 emoji Rephrase"` (`rule_rephrase`) | Notification channel card |

A modal opens with the current rule text pre-filled. Edit it to something clearer:

```
Original: "Always end messages with a friendly tone."
Rephrased: "End every guest message with a warm, friendly closing such as 'Looking forward to your stay!'"
```

Click "Save".

The Slack card updates in place with the new rule text (same buttons, same `ruleId`).

**DB check — rule_text updated:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, slack_ts
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: `rule_text` updated to the rephrased text; `status` still `'proposed'`.

- [ ] Checkpoint: Slack card updates in place with new rule text
- [ ] Checkpoint: `employee_rules` row with updated `rule_text` and `status = 'proposed'`

---

## Scenario F — Synthesis triggered on 5th confirmation

**Exercises:** confirming the 5th rule for an archetype → `rule_confirm` handler counts confirmed
rules → count % `SYNTHESIS_THRESHOLD` (5) === 0 → fires `employee/rule.synthesize-requested`
with idempotency key `synthesis-{archetypeId}-{confirmedCount}` → `rule-synthesizer` loads all
confirmed rules → Claude Haiku detects overlaps → stores merged rule in `employee_rules` with
`source = 'synthesis'` → posts `🔀 Merged behavioral rule proposed` card in `C0960S2Q8RL`.

> Prerequisite: at least 4 confirmed rules must exist (from Scenarios A through E). The 5th
> confirmation in this scenario triggers synthesis.

---

### Step 1 — Confirm current confirmed rule count

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT COUNT(*) AS confirmed_count
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND archetype_id = '00000000-0000-0000-0000-000000000015'
     AND status = 'confirmed';"
```

Note the count. You need to confirm enough rules to reach the next multiple of 5. If the count
is already at a multiple of 5, confirm one more rule first (to get to N+1), then confirm 4 more
to reach N+5.

For synthesis to produce a merge, at least two confirmed rules must share a topic. Rules like
"always end with a friendly tone" and "end every message with a warm closing" are good candidates.

- [ ] Checkpoint: confirmed rule count noted; plan to reach next multiple of 5

---

### Step 2 — Confirm rules until the 5th confirmation fires synthesis

Run Scenario A (or B/D) to create proposed rules, then confirm them one by one. On the
confirmation that brings the total to a multiple of 5, watch the gateway logs:

```bash
tail -30 /tmp/ai-dev.log | grep "Synthesis triggered\|synthesize-requested\|rule-synthesizer"
```

Expected:

```
{"msg":"Synthesis triggered after rule confirmation","archetypeId":"00000000-0000-0000-0000-000000000015","confirmedCount":5}
```

**Inngest check:** Open `http://localhost:8288` → Events → find `employee/rule.synthesize-requested`
event with `id = "synthesis-00000000-0000-0000-0000-000000000015-5"`.

- [ ] Checkpoint: `Synthesis triggered after rule confirmation` in gateway logs
- [ ] Checkpoint: `employee/rule.synthesize-requested` event visible in Inngest dashboard

---

### Step 3 — Confirm synthesis function ran

In the Inngest dashboard, find the `employee/rule-synthesizer` function run triggered by the
event above. Expand the `detect-overlaps` step and confirm it returned a non-empty `merges`
array.

**Internal check — synthesis log:**

```bash
tail -50 /tmp/ai-dev.log | grep "Rule synthesis complete\|mergesProposed\|No overlaps"
```

Expected (if overlapping rules exist):

```
{"msg":"Rule synthesis complete","tenantId":"...","archetypeId":"...","mergesProposed":1,"contradictionsReported":0}
```

If `mergesProposed: 0`, the LLM found no overlapping rules. Add another overlapping confirmed
rule (e.g. "Sign off every message with a friendly phrase") and re-trigger by confirming a 10th
rule (or whatever the next multiple of 5 is).

- [ ] Checkpoint: `Rule synthesis complete` with `mergesProposed >= 1` in logs

---

### Step 4 — Confirm merged rule card appears in notification channel

Navigate to `C0960S2Q8RL`. A new top-level message must appear:

```
🔀 *Merged behavioral rule proposed:*

> [merged rule — e.g. "Always end guest messages with a warm, friendly sign-off such as 'Thanks!' or a personalized closing"]

*Replaces:*
• always end in a friendly tone.
• [other original rules]

──────────────────────
  ✅ Confirm   ❌ Reject   ✏️ Rephrase
Rule `{ruleId}`
```

**DB check — synthesized rule in `proposed` status:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, source, status, parent_rule_ids
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND source = 'synthesis'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: row with `source = 'synthesis'`, `status = 'proposed'`, and `parent_rule_ids` containing
the UUIDs of the original rules that were merged.

- [ ] Checkpoint: merged rule card visible in `C0960S2Q8RL`
- [ ] Checkpoint: `employee_rules` row with `source = 'synthesis'` and `status = 'proposed'`

---

### Step 5 — Confirm the synthesized rule

Click `button "Confirm"` on the merged rule card. The merged rule transitions to `confirmed`.

When a `source = 'synthesis'` rule is confirmed, the `rule_confirm` handler automatically
archives the parent rules (sets their `status = 'archived'`):

**DB check — parent rules archived:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'archived'
   ORDER BY created_at DESC LIMIT 5;"
```

Expected: the original rules that were merged now have `status = 'archived'`.

**DB check — synthesized rule confirmed:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, confirmed_at
   FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND source = 'synthesis'
     AND status = 'confirmed'
   ORDER BY confirmed_at DESC LIMIT 3;"
```

Expected: `status = 'confirmed'` and `confirmed_at` set.

- [ ] Checkpoint: synthesized rule has `status = 'confirmed'`
- [ ] Checkpoint: parent rules have `status = 'archived'`

---

## Injection Verification

After completing Scenarios A through F, verify that confirmed rules reach the next worker run.

### Confirm `EMPLOYEE_RULES` in worker environment

Trigger a new guest-messaging task (send a new Airbnb message). While the task is in `Executing`
state, inspect the container:

```bash
CONTAINER=$(docker ps -q --filter name=employee- --format "{{.Names}}" | head -1)
docker inspect $CONTAINER | python3 -c "
import json, sys
data = json.load(sys.stdin)
env = data[0].get('Config', {}).get('Env', [])
for e in env:
    if 'EMPLOYEE_RULES' in e or 'EMPLOYEE_KNOWLEDGE' in e:
        print(e[:500])
"
```

Expected output (example):

```
EMPLOYEE_RULES=## Behavioral Rules — follow these

- Always end guest messages with a warm, friendly sign-off.
- [your other confirmed rules]
```

**Gateway log check:**

```bash
tail -30 /tmp/ai-dev.log | grep "Employee rules assembled\|Employee knowledge assembled"
```

Expected:

```
{"msg":"Employee rules assembled","taskId":"...","ruleCount":N,"rulesLen":L}
{"msg":"Employee knowledge assembled","taskId":"...","kbCount":M,"knowledgeLen":K}
```

`ruleCount > 0` confirms `EMPLOYEE_RULES` will be non-empty.

If the container has already exited, check the Inngest step output instead:

```
Open http://localhost:8288 → employee/universal-lifecycle → most recent run →
expand the "dispatch-machine" step → look for EMPLOYEE_RULES in the environment section.
```

- [ ] Checkpoint: `EMPLOYEE_RULES` env var present in worker container with confirmed rules
- [ ] Checkpoint: `Employee rules assembled` log with `ruleCount > 0`

---

## No-Cron Verification

The `trigger/feedback-summarizer` cron is deregistered and deleted in v2. Confirm it is NOT
in the Inngest function list:

```bash
curl -s http://localhost:8288/v0/fns | python3 -c "
import json, sys
fns = json.load(sys.stdin)
names = [f.get('id', '') for f in fns.get('data', [])]
print('Functions:', names)
print('feedback-summarizer present:', any('feedback-summarizer' in n for n in names))
"
```

Expected: `feedback-summarizer present: False`.

- [ ] Checkpoint: `trigger/feedback-summarizer` NOT in Inngest function list

---

## Dedup Verification

The `employee_rules` table has a unique constraint on `(source_task_id, source)` for non-synthesis
rules. Firing `rule.extract-requested` twice for the same task and source must produce only one
`employee_rules` row.

```bash
# Fire the event twice for the same task ID
TASK_ID="<a real task ID from your DB>"
curl -X POST http://localhost:8288/e/local \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"employee/rule.extract-requested\",\"data\":{\"tenantId\":\"00000000-0000-0000-0000-000000000003\",\"feedbackId\":null,\"feedbackType\":\"edit_diff\",\"taskId\":\"$TASK_ID\",\"archetypeId\":\"00000000-0000-0000-0000-000000000015\",\"content\":null,\"originalContent\":\"Hello\",\"editedContent\":\"Hello, Olivia!\"}}"

# Wait 5 seconds, then fire again
sleep 5
curl -X POST http://localhost:8288/e/local \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"employee/rule.extract-requested\",\"data\":{\"tenantId\":\"00000000-0000-0000-0000-000000000003\",\"feedbackId\":null,\"feedbackType\":\"edit_diff\",\"taskId\":\"$TASK_ID\",\"archetypeId\":\"00000000-0000-0000-0000-000000000015\",\"content\":null,\"originalContent\":\"Hello\",\"editedContent\":\"Hello, Olivia!\"}}"
```

**DB check — only one row per (source_task_id, source):**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT source_task_id, source, COUNT(*) AS rule_count
   FROM employee_rules
   WHERE source_task_id = '$TASK_ID'
     AND source = 'edit_diff'
   GROUP BY source_task_id, source;"
```

Expected: `rule_count = 1` (the second insert fails silently due to the unique constraint).

- [ ] Checkpoint: only one `employee_rules` row per `(source_task_id, source)` combination

---

## Cleanup

After running all scenarios, remove test rows to keep the DB clean:

```bash
# Remove test feedback_events (adjust date to today)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "DELETE FROM feedback_events
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND created_at > NOW() - INTERVAL '2 hours';"

# Remove test employee_rules (adjust date to today)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "DELETE FROM employee_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND created_at > NOW() - INTERVAL '2 hours';"
```

> Only delete rows created during this test session. Do not delete rows from prior sessions
> that may be in active use.

---

## Troubleshooting

| Symptom                                                          | Cause                                                                  | Fix                                                                                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edit_diff feedback_event written` not in logs after Edit & Send | Lifecycle did not reach the edit path                                  | Check that the task was in `Reviewing` state when you clicked Edit & Send; check Inngest run for the `handle-approval-result` step                                          |
| `employee_rules` row not created after rule extraction           | LLM returned `{"extractable": false}` or parse failed                  | Check Inngest `employee/rule-extractor` run → `extract-rule` step output; if non-extractable, make a more meaningful edit                                                   |
| Rule review card not appearing in `C0960S2Q8RL`                  | `notification_channel` not set on archetype, or Slack token missing    | `SELECT notification_channel FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015';` — must be `C0960S2Q8RL`; also check `tenant_secrets` for `slack_bot_token` |
| `rule_confirm` button click does nothing                         | Socket Mode WebSocket dropped                                          | Check gateway logs for `Socket Mode connected`; retry the button click or use the manual curl fallback                                                                      |
| Synthesis not triggered after 5th confirmation                   | Count not at a multiple of 5, or idempotency key already used          | Check `SELECT COUNT(*) FROM employee_rules WHERE status = 'confirmed' AND archetype_id = '00000000-0000-0000-0000-000000000015';` — must be a multiple of 5                 |
| `mergesProposed: 0` in synthesis log                             | LLM found no overlapping rules                                         | Add more confirmed rules that share a topic (e.g. two rules about tone), then trigger synthesis again by confirming a rule at the next multiple of 5                        |
| `EMPLOYEE_RULES` empty in worker container                       | No confirmed rules exist, or `ruleCount = 0` in lifecycle log          | Confirm at least one rule (Scenario A / Step 5), then trigger a new task                                                                                                    |
| `feedback-summarizer` still appears in Inngest function list     | Old code still registered; gateway not restarted after code change     | Restart the gateway (`pnpm dev` or kill and restart the gateway process); confirm the function is removed from `src/inngest/serve.ts`                                       |
| Unique constraint violation on `employee_rules` insert           | Duplicate `rule.extract-requested` for same `(source_task_id, source)` | Expected behavior — the second insert is rejected by the DB constraint; only one rule per task per source is created                                                        |

---

## Quick-Reference: What to Check for Each Pipeline Stage

| Pipeline Stage                                          | Scenario  | DB table / field to check                                                                                    | Slack location                                        |
| ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Edit diff captured                                      | A/3       | `feedback_events.event_type = 'edit_diff'`, `correction_content` and `original_content` set                  | N/A                                                   |
| LLM extracts rule from edit diff                        | A/4       | `employee_rules.status = 'proposed'`, `source = 'edit_diff'`, `rule_text` non-empty                          | `C0960S2Q8RL` — `🧠 New behavioral rule`              |
| PM confirms proposed rule                               | A/5       | `employee_rules.status = 'confirmed'`, `confirmed_at` set                                                    | Card updates inline                                   |
| Rejection with reason captured                          | B/3       | `feedback_events.event_type = 'rejection_reason'`, `correction_content` set                                  | N/A                                                   |
| LLM extracts rule from rejection reason                 | B/4       | `employee_rules.status = 'proposed'`, `source = 'rejection'`                                                 | `C0960S2Q8RL` — `🧠 New behavioral rule`              |
| Rejection without reason captured                       | C/3       | `feedback_events.event_type = 'rejection'` (no correction_content)                                           | N/A                                                   |
| awaiting_input rule created                             | C/3       | `employee_rules.status = 'awaiting_input'`, `rule_text = ''`, `source_task_id` set                           | Thread reply in `C0AMGJQN05S`: "What should I learn?" |
| PM reply captured → proposed                            | C/6       | `employee_rules.status = 'proposed'`, `rule_text` = PM's text                                                | Thread reply in `C0AMGJQN05S` — rule card             |
| Thread reply / @mention captured                        | D/3       | `feedback_events.event_type` in `('teaching', 'thread_reply', 'mention_feedback')`, `correction_content` set | Bot ack reply in channel/thread                       |
| Teaching extracted → proposed                           | D/4       | `employee_rules.status = 'proposed'`, `source = 'rejection'`                                                 | `C0960S2Q8RL` — `🧠 New behavioral rule`              |
| Rule confirmed via Slack card                           | E/1       | `employee_rules.status = 'confirmed'`, `confirmed_at` set; `employee/rule.confirmed` event fired             | Card updates inline                                   |
| Rule rejected via Slack card                            | E/2       | `employee_rules.status = 'rejected'`                                                                         | Card updates inline                                   |
| Rule rephrased via Slack card                           | E/3       | `employee_rules.rule_text` updated; `status` still `'proposed'`                                              | Card updates in place with new text                   |
| Synthesis triggered on 5th confirmation                 | F/2       | Gateway log `Synthesis triggered after rule confirmation`; `employee/rule.synthesize-requested` event fired  | N/A                                                   |
| Synthesized merged rule proposed                        | F/4       | `employee_rules.source = 'synthesis'`, `status = 'proposed'`, `parent_rule_ids` set                          | `C0960S2Q8RL` — `🔀 Merged behavioral rule`           |
| Synthesized rule confirmed, parents archived            | F/5       | Synthesized rule `status = 'confirmed'`; parent rules `status = 'archived'`                                  | Card updates inline                                   |
| Confirmed rules injected into worker via EMPLOYEE_RULES | Injection | `EMPLOYEE_RULES` env var in container; gateway log `Employee rules assembled` with `ruleCount > 0`           | N/A — worker container env                            |
| feedback-summarizer cron absent                         | No-cron   | `trigger/feedback-summarizer` NOT in Inngest function list                                                   | N/A                                                   |
| Dedup constraint enforced                               | Dedup     | Only one `employee_rules` row per `(source_task_id, source)` combination                                     | N/A                                                   |
