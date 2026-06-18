# Baseline-B — Generator Output Snapshot (converse-create)

**Captured**: 2026-06-17 ~17:17 UTC
**Purpose**: Regression "before" snapshot. Run the CURRENT generator (`converse-create`) for the
at-risk employee set and snapshot the full generated output. Used to detect whether the platform
changes in this plan break generation for other employees.

**Endpoint**: `POST /admin/tenants/:tenantId/archetypes/converse-create`
**Request shape**: `{ transcript: [{ role: 'user'|'assistant', content: string }] }` (tenantId in URL path)
**Response**: discriminated union — `kind: 'question' | 'proposal' | 'no_change' | 'too_long'`
**Generator (gateway/judge) model used**: `minimax/minimax-m2.7` (model_actual in trace rows)

> NOTE: converse-create does NOT persist an archetype. These are pure generation snapshots — no
> existing archetype was edited, activated, or triggered. Each call recorded one
> `archetype_generation_calls` row with `call_type='propose_edit'`, `archetype_id=NULL`, `status='success'`.

---

## At-Risk Employees Found in DB

| Employee (existing role_name) | Existing archetype ID                  | Tenant    | Tenant ID                              |
| ----------------------------- | -------------------------------------- | --------- | -------------------------------------- |
| `guest-messaging`             | `94b1e64c-2c2a-4391-a6e3-f3ef61044cb5` | VLRE      | `00000000-0000-0000-0000-000000000003` |
| `code-rotation`               | `00000000-0000-0000-0000-000000000016` | VLRE      | `00000000-0000-0000-0000-000000000003` |
| `daily-motivation`            | `a360b2e6-7dcc-410d-a17b-8d51e21c74ed` | DozalDevs | `00000000-0000-0000-0000-000000000002` |
| `jira-motivation-bot`         | **DOES NOT EXIST**                     | —         | —                                      |

**Genericity probe**: `daily-motivation` (`a360b2e6-7dcc-410d-a17b-8d51e21c74ed`, DozalDevs) confirmed
present and `active` in DB. This is the non-cleaning, non-VLRE employee that the fix loop must keep
generating cleanly.

**`jira-motivation-bot`**: Not present in the DB (0 rows matching `role_name ILIKE '%jira%'`, and no
exact match). Per task instructions this employee is optional ("if it exists") — skipped, no JSON file.
Do NOT rely on a non-seed employee as a probe.

---

## Generation Results (per employee)

All three were generated via a 2-turn conversation: turn 1 returned a clarifying `question`, turn 2
(with the full transcript + an answer) returned a `proposal` containing populated `execution_steps`
and `tool_registry`. **All three pass the baseline requirement: non-empty `execution_steps` +
non-empty `tool_registry`.**

| slug               | turns | result   | generated role_name           | model                  | exec_steps len | delivery_steps len | identity len | #tools | input_schema | trigger                     |
| ------------------ | ----- | -------- | ----------------------------- | ---------------------- | -------------- | ------------------ | ------------ | ------ | ------------ | --------------------------- |
| `guest-messaging`  | 2     | proposal | `guest-message-reply-drafter` | `minimax/minimax-m2.7` | 662            | 379                | 259          | 4      | null         | webhook (NEW_INBOX_MESSAGE) |
| `code-rotation`    | 2     | proposal | `door-lock-rotator`           | `minimax/minimax-m2.7` | 1206           | 180                | 245          | 6      | null         | manual                      |
| `daily-motivation` | 2     | proposal | `daily-motivation-poster`     | `minimax/minimax-m2.7` | 366            | 288                | 146          | 1      | null         | manual                      |

### Tool registries generated

- **guest-messaging** (4 tools): `/tools/hostfully/get-messages.ts`, `/tools/hostfully/send-message.ts`,
  `/tools/slack/post-guest-approval.ts`, `/tools/platform/submit-output.ts`
- **code-rotation** (6 tools): `/tools/sifely/list-locks.ts`, `/tools/sifely/list-passcodes.ts`,
  `/tools/sifely/generate-code.ts`, `/tools/sifely/update-passcode.ts`, `/tools/slack/post-message.ts`,
  `/tools/platform/submit-output.ts`
- **daily-motivation** (1 tool): `/tools/platform/submit-output.ts`

### Per-employee notes / generator quirks (informational — not blockers)

- **guest-messaging** — Clean, domain-correct. Identity describes Hostfully thread reading + Slack
  approval. execution_steps reference `INPUT_PAYLOAD`, the Hostfully get-messages tool by `lead_uid`,
  and the Slack guest-approval card. `deliverable_type: reply_text`. Trigger correctly inferred as the
  Hostfully `NEW_INBOX_MESSAGE` webhook. Strongest of the three.
- **code-rotation** — Clean, domain-correct. Longest execution_steps (1206 chars) with an explicit
  per-lock loop (list locks → list passcodes → generate code → update passcode) and a final Slack
  summary. `deliverable_type: null` (delivers inside execution; consistent with the real code-rotation
  employee which also has no separate delivery deliverable).
- **daily-motivation** — Generic motivational employee, content is correct (cheerful team-morale
  persona, fresh AI-generated message). TWO generator quirks observed:
  1. `tool_registry` contains ONLY `submit-output.ts` — no explicit Slack post tool, even though the
     description asks to post to Slack. The execution prose says "Write..." the message but no Slack
     tool was added. (This is a pre-existing generator behavior for the simplest employees — captured
     here as the "before" so we can tell if the fix changes it.)
  2. `trigger_sources` came back `{type:'manual'}` despite "runs on a daily schedule every morning at
     8am" in the answer — the generator did not infer a scheduled trigger.
     These are recorded as Baseline-B reality, NOT defects to fix in this task.

### Employees that could NOT be generated

- **`jira-motivation-bot`** — not generated. Reason: not present in the seed/DB (optional employee per
  task spec). No JSON file created.

---

## Files in this directory

| File                       | Status                                               |
| -------------------------- | ---------------------------------------------------- |
| `guest-messaging.json`     | ✅ saved (exec_steps 662, 4 tools)                   |
| `code-rotation.json`       | ✅ saved (exec_steps 1206, 6 tools)                  |
| `daily-motivation.json`    | ✅ saved (exec_steps 366, 1 tool) — genericity probe |
| `jira-motivation-bot.json` | ⛔ not created (employee does not exist)             |
| `index.md`                 | this file                                            |

Raw API responses + DB query output: `.sisyphus/evidence2/task-5-baseline-b.txt`
