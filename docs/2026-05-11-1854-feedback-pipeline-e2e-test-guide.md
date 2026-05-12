# Feedback Pipeline E2E Test Guide — guest-messaging feedback-rule-injection

This guide covers six scenarios that together exercise the full feedback loop for the guest-messaging
employee: feedback capture → rule extraction → PM review → confirmation → injection into the next
worker run. Run them in order the first time — each scenario builds on the state left by the prior.

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

| Resource                     | Value                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Airbnb guest thread          | `https://www.airbnb.com/guest/messages/2525238359`                            |
| Thread UID                   | `aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`                                        |
| Lead UID                     | `29a64abd-d02c-44bc-8d5c-47df58a7ab14`                                        |
| Property UID                 | `562695df-6a4f-40d6-990d-56fe043aa9e8`                                        |
| Slack approval channel       | `#cs-guest-communication` (`C0AMGJQN05S`) — approval cards and edit threads   |
| Slack notification channel   | `C0960S2Q8RL` — rule review cards, batch consolidation cards, synthesis cards |
| VLRE tenant ID               | `00000000-0000-0000-0000-000000000003`                                        |
| Guest-messaging archetype ID | `00000000-0000-0000-0000-000000000015`                                        |
| DB                           | `postgresql://postgres:postgres@localhost:54322/ai_employee`                  |
| Inngest dashboard            | `http://localhost:8288`                                                       |

**Channel distinction** — two Slack channels are involved:

- `C0AMGJQN05S` (`#cs-guest-communication`) — where guest approval cards and their threads live;
  `awaiting_input` messages (from failed extraction) are posted as thread replies here.
- `C0960S2Q8RL` — where rule review cards (proposed rules), batch consolidation cards, and
  rule synthesis cards are posted as standalone top-level messages.

**Unique message suffix pattern:** include `[e2e-test-{unix_epoch}]` in every Airbnb message
to prevent dedup collisions. Generate with: `date +%s`

---

## Scenario A — Edit & Send: extractable rule → proposed card → Confirm

**Exercises:** lifecycle `edit_diff` path → `employee/rule.extract-requested` event → rule-extractor
`extract-rule` step (Claude Haiku extracts a clear rule) → `store-proposed-rule` + `post-rule-review`
steps → proposed rule card in `C0960S2Q8RL` → PM clicks `✅ Confirm` → `learned_rules.status =
'confirmed'`.

---

### Step 1 — Send a guest message that invites a clear, editable draft

| Action                                                         | Where              |
| -------------------------------------------------------------- | ------------------ |
| Navigate to `https://www.airbnb.com/guest/messages/2525238359` | Playwright browser |
| Click `textbox "Write a message..."`                           | Compose bar        |
| Type: `What time is checkout? [e2e-test-{epoch}]`              | Compose bar        |
| Click `button "Send"`                                          | Airbnb thread      |

Wait for the approval card to appear in `#cs-guest-communication`. Follow the standard flow:
gateway receives webhook → task created → worker executes → approval card appears in the
`#cs-guest-communication` thread.

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

**Internal check — `employee/rule.extract-requested` event fired:**

```bash
tail -50 /tmp/ai-dev.log | grep "rule.extract-requested\|rule-extractor\|extract-rule"
```

Expected: log lines showing the event was emitted by the lifecycle and picked up by the rule-extractor
function.

**Inngest check:** Open `http://localhost:8288` → find the `employee/rule-extractor` function run →
confirm the `extract-rule` step executed and returned `{"extractable": true, "rule": "..."}`.

---

### Step 3 — Confirm proposed rule card appears in notification channel

Navigate to the `C0960S2Q8RL` channel in Slack. A new **top-level** message from "Papi chulo" must
appear with this structure:

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
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND entity_id = '00000000-0000-0000-0000-000000000015'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 1;"
```

Expected: a row with `source = 'edit_diff'`, `status = 'proposed'`, and `slack_ts` populated
(the ts of the card above).

---

### Step 4 — Click "✅ Confirm"

| Action                                                           | Where                     |
| ---------------------------------------------------------------- | ------------------------- |
| Click `button "white_check_mark emoji Confirm"` (`rule_confirm`) | Notification channel card |

The card updates immediately via Socket Mode ack. The confirmed rule is now active.

**DB check — rule moved to `confirmed`:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, confirmed_at
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'confirmed'
   ORDER BY confirmed_at DESC LIMIT 3;"
```

Expected: the new rule appears with `status = 'confirmed'` and `confirmed_at` set to now.

---

## Scenario B — Teaching via @mention: rule extracted → Confirm

**Exercises:** Slack `app_mention` → `employee/interaction.received` (`source: 'mention'`) →
`interaction-handler` classifies intent as `teaching` → stores row in `feedback` table with
`feedback_type = 'teaching'` → `employee/rule.extract-requested` event → rule-extractor extracts
from free-text teaching → proposed rule card in `C0960S2Q8RL` → PM confirms.

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
tail -30 /tmp/ai-dev.log | grep "interaction.received\|classify-intent\|teaching"
```

Expected: `interaction-handler` function triggered, intent classified as `teaching`.

---

### Step 2 — Confirm acknowledgment reply appears

The bot replies in-thread (or in channel) with a warm acknowledgment, generated by Claude Haiku:

```
Got it! I'll keep that in mind — parking details are helpful context for guests.
Task `{archetypeId}`
```

**DB check — feedback row stored:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, feedback_type, LEFT(correction_reason, 150) AS reason, created_by, created_at
   FROM feedback
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND feedback_type = 'teaching'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: new row with `feedback_type = 'teaching'` containing the parking instruction.

---

### Step 3 — Confirm proposed rule card in notification channel

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
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND source = 'rejection'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 1;"
```

> Note: `feedback_type = 'teaching'` maps to `source = 'rejection'` in the rule-extractor
> (only `edit_diff` uses `source = 'edit_diff'`; all other types use `'rejection'`).

---

### Step 4 — Click "✅ Confirm"

Same as Scenario A / Step 4. Confirm the rule transitions to `confirmed` in the DB.

---

## Scenario C — Edit & Send: LLM fails extraction → awaiting_input → PM replies → proposed card

**Exercises:** rule-extractor `extract-rule` step returns `{"extractable": false}` →
`post-awaiting-input` step posts a thread reply in `#cs-guest-communication` asking the PM what
to learn → `learned_rules` row created with `status = 'awaiting_input'` → PM replies in thread →
`interaction-handler` detects `awaiting_input` rule for the task → patches rule to `proposed` with
the PM's text → posts a rule review card in the thread → PM confirms.

> To reliably trigger a non-extractable case, make a trivial edit to the draft (e.g. a single
> punctuation change). The LLM cannot infer a meaningful behavioral rule from punctuation diffs.

---

### Step 1 — Send a guest message and wait for approval card

Follow Scenario A / Step 1. Send a new message and wait for the approval card to appear in the
`#cs-guest-communication` thread.

---

### Step 2 — Click "✏️ Edit & Send" with a minimal, ambiguous change

Open the edit modal (Scenario A / Step 2). Make only a trivial change — for example, swap a period
for an exclamation mark or reorder two words. Submit the modal.

The rule-extractor will run and call Claude Haiku. With an ambiguous diff, the LLM returns
`{"extractable": false}`.

**Inngest check:** Open `http://localhost:8288` → find the `employee/rule-extractor` run for this
task → confirm the `extract-rule` step returned `{"extractable": false}` → confirm the
`post-awaiting-input` step ran.

**Internal check — awaiting_input log line:**

```bash
tail -30 /tmp/ai-dev.log | grep "awaiting.input\|awaiting_input\|rule extraction fallback"
```

---

### Step 3 — Confirm "What should I learn?" appears in the approval card thread

In the `#cs-guest-communication` thread for this task, a **new reply** must appear:

```
@{YourSlackHandle} What should I learn from this change? (Reply here — I'll record it.)
```

The message is posted as a thread reply to the approval card (using `approvalMsgTs`). If
`actorUserId` is set, it includes a `<@userId>` mention.

**DB check — `awaiting_input` rule created:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, source_task_id, slack_ts
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'awaiting_input'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: new row with `status = 'awaiting_input'`, empty `rule_text`, and `source_task_id` set
to the current task ID.

---

### Step 4 — Reply to the thread with a clear rule

In the `#cs-guest-communication` thread (in reply to the "What should I learn?" message), type:

```
Always confirm the guest's name at the start of the message when they mention they're checking in late.
```

Send the reply.

**Internal check — interaction handler picks up the reply:**

```bash
tail -30 /tmp/ai-dev.log | grep "awaiting-input\|capture-awaiting-input\|proposed"
```

Expected: `interaction-handler` detects the `awaiting_input` rule for this task, patches `rule_text`
and `status = 'proposed'`, then posts a rule review card.

---

### Step 5 — Confirm proposed rule card appears in thread

Still in the `#cs-guest-communication` thread, a **new reply** appears (posted back into the
same thread by `capture-awaiting-input-reply`):

```
🧠 *New behavioral rule proposed:*

> Always confirm the guest's name at the start of the message when they mention they're checking in late.

──────────────────────
  ✅ Confirm   ❌ Reject   ✏️ Rephrase
Rule `{ruleId}`
```

**DB check — rule moved to `proposed`:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, rule_text, status, slack_ts, slack_channel
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'proposed'
   ORDER BY created_at DESC LIMIT 1;"
```

Expected: `rule_text` is set (your typed rule), `status = 'proposed'`.

---

### Step 6 — Click "✅ Confirm"

Click `button "Confirm"` (`rule_confirm`) on the in-thread card. Verify `status = 'confirmed'` in
the DB (same check as Scenario A / Step 4).

---

## Scenario D — Injection verification: confirmed rule appears in the next worker run

**Exercises:** the lifecycle `executing` step queries `learned_rules` for confirmed rules →
builds `LEARNED_RULES_CONTEXT` env var → passes it to the worker container → the worker system
prompt contains the confirmed rule.

> Prerequisite: at least one confirmed rule must exist (from Scenarios A, B, or C).

---

### Step 1 — Confirm at least one rule is confirmed

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT rule_text, source, confirmed_at
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND status = 'confirmed'
   ORDER BY confirmed_at DESC;"
```

Note the most recently confirmed `rule_text` — this is the string you will verify appears in the
worker context.

---

### Step 2 — Trigger a new guest-messaging task

Send a new Airbnb guest message to create a fresh task:

```
Is there a coffee maker? [e2e-test-{epoch}]
```

Wait until the lifecycle reaches the `executing` step. Watch gateway logs:

```bash
tail -50 /tmp/ai-dev.log | grep -E "Feedback context assembled|learned rules context|feedbackItems|kbThemes"
```

Expected log line from `employee-lifecycle.ts`:

```
{"msg":"Feedback context assembled","taskId":"...","feedbackItems":N,"kbThemes":M,"feedbackContextLen":L}
```

`feedbackItems` = number of unconsolidated feedback rows with `correction_reason` set.
`kbThemes` = number of `knowledge_bases` rows for this archetype.
`feedbackContextLen` > 0 confirms `FEEDBACK_CONTEXT` will be non-empty.

---

### Step 3 — Inspect LEARNED_RULES_CONTEXT in the worker environment

While the task is in `Executing` state (before the container exits), inspect the container:

```bash
CONTAINER=$(docker ps -q --filter name=employee- --format "{{.Names}}" | head -1)
docker inspect $CONTAINER | python3 -c "
import json, sys
data = json.load(sys.stdin)
env = data[0].get('Config', {}).get('Env', [])
for e in env:
    if 'LEARNED_RULES' in e or 'FEEDBACK_CONTEXT' in e:
        print(e[:500])
"
```

Expected output (example):

```
LEARNED_RULES_CONTEXT=## Learned Behaviors — follow these rules

- always end in a friendly tone.
- [your newly confirmed rule text]
```

```
FEEDBACK_CONTEXT=Your feedback themes (consolidated knowledge):
- Always end messages with a friendly tone: "..." (6 occurrences)
...
All unconsolidated feedback (newest first):
- [mention_feedback] "..." (5/11/2026)
...
```

If the container has already exited, check Inngest's step output instead:

```bash
# Open http://localhost:8288 → employee/universal-lifecycle → most recent run →
# expand the "dispatch-machine" or "handle-worker-execution" step →
# look for LEARNED_RULES_CONTEXT and FEEDBACK_CONTEXT in the environment section.
```

---

### Step 4 — Verify the rule influenced the response

Wait for the approval card to appear in `#cs-guest-communication`. Inspect the AI draft response.
Given the confirmed rule is "always end in a friendly tone," the draft should end with a warm
sign-off rather than an abrupt period. This is a qualitative check — confirm the rule's intent
is reflected in the response.

**DB check — metadata has draft_response:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT metadata->>'draft_response' AS draft
   FROM tasks
   WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d'
   ORDER BY created_at DESC LIMIT 1;"
```

---

## Scenario E — Feedback consolidation: trigger summarizer → batch card → Confirm All → FEEDBACK_CONTEXT

**Exercises:** `trigger/feedback-summarizer` cron → threshold check (≥5 unconsolidated items) →
LLM theme summarization → `knowledge_bases` row written → batch review card in `C0960S2Q8RL` with
theme list → PM clicks `✅ Confirm All & Consolidate` → `feedback.consolidated_at = NOW()` for
all covered rows → next worker run includes themes in `FEEDBACK_CONTEXT`.

> The VLRE tenant currently has 17 unconsolidated feedback items (as of May 11 — well above the
> threshold of 5). You can verify with the count check below before proceeding.

---

### Step 1 — Confirm unconsolidated feedback count

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT COUNT(*) AS unconsolidated
   FROM feedback
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND consolidated_at IS NULL
     AND correction_reason IS NOT NULL;"
```

Expected: count ≥ 5 (the `CONSOLIDATION_THRESHOLD`). If below 5, add feedback via @mention teaching
(Scenario B) until the count reaches 5.

---

### Step 2 — Manually invoke the feedback-summarizer

The `trigger/feedback-summarizer` cron runs every 6 hours (`0 */6 * * *`). Invoke it manually
via the Inngest dev dashboard:

```
1. Open http://localhost:8288
2. Click "Functions" in the left sidebar
3. Find "trigger/feedback-summarizer"
4. Click "Invoke function"
5. Leave the data payload as {} and confirm
```

Alternatively, use the Inngest event API:

```bash
curl -X POST http://localhost:8288/e/local \
  -H "Content-Type: application/json" \
  -d '{"name":"inngest/function.invoked","data":{"function_id":"trigger/feedback-summarizer"}}'
```

**Internal check — summarizer running:**

```bash
tail -50 /tmp/ai-dev.log | grep -E "feedback-summarizer|Consolidation threshold|Feedback summary stored|batch review card"
```

Expected log sequence:

```
Consolidation threshold met — proceeding { archetypeId: "00000000-0000-0000-0000-000000000015", unconsolidatedCount: N }
Feedback summary stored { archetypeId: "...", themeCount: 3 }
Batch review card posted to Slack { archetypeId: "...", feedbackCount: N }
```

---

### Step 3 — Confirm batch review card appears in notification channel

Navigate to `C0960S2Q8RL` in Slack. A new top-level message must appear:

```
📋 *Feedback consolidation ready* — N items for *guest-messaging*

*Recurring themes:*
• *Always end messages with a friendly tone* (6x): _"Always end in a friendly tone."_
• *Message delays and integration issues between Hostfully and Airbnb* (6x): _"Se contesto via Hostfully..."_
• *[additional themes...]*

──────────────────────
  ✅ Confirm All & Consolidate
Archetype `00000000-0000-0000-0000-000000000015` · N feedback items
```

**DB check — new `knowledge_bases` row written:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, source_config->>'type' AS type,
          jsonb_array_length(source_config->'themes') AS theme_count,
          source_config->>'feedback_count' AS feedback_count,
          created_at
   FROM knowledge_bases
   WHERE archetype_id = '00000000-0000-0000-0000-000000000015'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: new row with `type = 'feedback_summary'` and `theme_count ≥ 1`.

---

### Step 4 — Click "✅ Confirm All & Consolidate"

| Action                                                                               | Where                |
| ------------------------------------------------------------------------------------ | -------------------- |
| Click `button "Confirm All & Consolidate"` (`batch_rules_confirm`) on the batch card | Notification channel |

The button handler (`handlers.ts` `batch_rules_confirm` action) PATCHes all covered `feedback` rows
setting `consolidated_at = NOW()`.

**DB check — feedback rows now consolidated:**

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT
     COUNT(*) FILTER (WHERE consolidated_at IS NOT NULL) AS consolidated,
     COUNT(*) FILTER (WHERE consolidated_at IS NULL)     AS still_unconsolidated
   FROM feedback
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003';"
```

The `consolidated` count must increase by the number of items shown in the batch card. Previously
unconsolidated items now have `consolidated_at` set.

---

### Step 5 — Verify FEEDBACK_CONTEXT includes consolidated themes on next run

Trigger another guest-messaging task (send a new Airbnb message). While it executes, watch
for the "Feedback context assembled" log:

```bash
tail -30 /tmp/ai-dev.log | grep "Feedback context assembled"
```

The `kbThemes` value must be ≥ 1 (at least the row written in Step 3).

Inspect the worker environment (same as Scenario D / Step 3). The `FEEDBACK_CONTEXT` must now
contain the consolidated themes section:

```
Your feedback themes (consolidated knowledge):
- Always end messages with a friendly tone: "Always end in a friendly tone." (6 occurrences)
- Message delays and integration issues...: "..." (6 occurrences)
...
All unconsolidated feedback (newest first):
[only items added AFTER the consolidation — consolidated_at = NULL]
```

---

## Scenario F — Rule synthesis: 2+ confirmed rules → merged rule proposed

**Exercises:** `synthesize-rules-{archetypeId}` step in feedback-summarizer → queries confirmed
rules → LLM finds overlaps → stores merged rule in `learned_rules` with `source = 'weekly_synthesis'`
→ posts `🔀 Merged behavioral rule proposed` card in `C0960S2Q8RL` → PM confirms.

> Prerequisite: at least 2 confirmed rules must exist. After running Scenarios A, B, and C,
> there should be at least 3. Verify with the DB check below.

---

### Step 1 — Confirm ≥ 2 confirmed rules exist

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT rule_text, source, confirmed_at
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND entity_id = '00000000-0000-0000-0000-000000000015'
     AND status = 'confirmed'
   ORDER BY confirmed_at;"
```

If fewer than 2 exist, confirm additional rules (Scenario A or B) before proceeding.

For synthesis to trigger, at least two confirmed rules must share a topic. Rules like
"always end with a friendly tone" and "always end the message with Thanks! or something like that"
are good candidates — they overlap.

---

### Step 2 — Invoke the feedback-summarizer

Same as Scenario E / Step 2. The `synthesize-rules-{archetypeId}` step runs inside the same
function, after the feedback consolidation step.

**Internal check — synthesis ran:**

```bash
tail -50 /tmp/ai-dev.log | grep -E "synthesize-rules|Rule synthesis complete|mergesProposed|contradictions"
```

Expected:

```
Rule synthesis complete { archetypeId: "...", mergesProposed: 1, contradictions: 0 }
```

If `mergesProposed: 0`, the LLM found no overlapping rules — add another overlapping confirmed rule
(e.g. "Sign off every message with a friendly phrase") and re-invoke.

---

### Step 3 — Confirm merged rule card appears in notification channel

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
  "SELECT id, rule_text, source, status
   FROM learned_rules
   WHERE tenant_id = '00000000-0000-0000-0000-000000000003'
     AND source = 'weekly_synthesis'
   ORDER BY created_at DESC LIMIT 3;"
```

Expected: row with `source = 'weekly_synthesis'` and `status = 'proposed'`.

---

### Step 4 — Confirm the synthesized rule

Click `button "Confirm"` on the merged rule card. The merged rule transitions to `confirmed`.

After confirmation, the original rules it replaced remain in the DB (still `confirmed` — they are
not automatically rejected). If you want to clean up duplicates, manually reject the originals via
the Slack cards or directly in the DB:

```bash
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "UPDATE learned_rules SET status = 'rejected'
   WHERE id IN ('<original_rule_id_1>', '<original_rule_id_2>');"
```

Verify that the next worker run's `LEARNED_RULES_CONTEXT` contains only the merged rule and not
the superseded originals (since they would now be `status = 'rejected'`, they are excluded from
the query).

---

## Quick-Reference: What to Check for Each Pipeline Stage

| Pipeline Stage                                    | Scenario | DB table / field to check                                                               | Slack location                                         |
| ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Edit diff captured and event fired                | A/2      | Inngest `employee/rule.extract-requested` event in dashboard                            | N/A                                                    |
| LLM extracts rule → proposed                      | A/3      | `learned_rules.status = 'proposed'`, `source = 'edit_diff'`, `rule_text` non-empty      | `C0960S2Q8RL` — `🧠 New behavioral rule`               |
| PM confirms proposed rule                         | A/4      | `learned_rules.status = 'confirmed'`, `confirmed_at` set                                | Card updates inline                                    |
| Teaching via @mention stored as feedback          | B/2      | `feedback.feedback_type = 'teaching'`, `correction_reason` set                          | Bot ack reply in channel/thread                        |
| Teaching extracted → proposed                     | B/3      | `learned_rules.status = 'proposed'`, `source = 'rejection'`                             | `C0960S2Q8RL` — `🧠 New behavioral rule`               |
| Non-extractable diff → awaiting_input             | C/3      | `learned_rules.status = 'awaiting_input'`, `rule_text = ''`                             | Thread reply in `C0AMGJQN05S`: "What should I learn?"  |
| PM reply captured → proposed                      | C/5      | `learned_rules.status = 'proposed'`, `rule_text` = PM's text                            | Thread reply in `C0AMGJQN05S` — rule card              |
| Confirmed rule injected into worker               | D/3      | `LEARNED_RULES_CONTEXT` env var in container; gateway log `Feedback context assembled`  | N/A — worker container env                             |
| Rule reflected in AI response                     | D/4      | `tasks.metadata->>'draft_response'` shows rule behavior applied                         | Approval card draft in `C0AMGJQN05S`                   |
| Consolidation threshold met                       | E/1      | `feedback WHERE consolidated_at IS NULL AND correction_reason IS NOT NULL` count ≥ 5    | N/A                                                    |
| Themes stored in knowledge_bases                  | E/3      | `knowledge_bases` row for archetype with `source_config.themes` array                   | `C0960S2Q8RL` — `📋 Feedback consolidation ready` card |
| PM confirms consolidation                         | E/4      | `feedback.consolidated_at` set on covered rows                                          | Card updates inline                                    |
| Consolidated themes injected via FEEDBACK_CONTEXT | E/5      | Gateway log `kbThemes >= 1`; `FEEDBACK_CONTEXT` env var contains "Your feedback themes" | N/A — worker container env                             |
| Rule synthesis finds overlaps                     | F/2      | Inngest log `mergesProposed >= 1`                                                       | N/A                                                    |
| Synthesized merged rule proposed                  | F/3      | `learned_rules.source = 'weekly_synthesis'`, `status = 'proposed'`                      | `C0960S2Q8RL` — `🔀 Merged behavioral rule`            |
| Merged rule confirmed and injected                | F/4      | `learned_rules.status = 'confirmed'`; verify next run's `LEARNED_RULES_CONTEXT`         | N/A — worker container env                             |
