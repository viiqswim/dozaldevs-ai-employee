# Task 6 Probe — Does a naive one-sentence description trigger a clarify question?

**Date:** 2026-06-16
**Endpoint:** `POST /admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/converse-create` (VLRE tenant)
**Method:** single-message transcript (`[{role:'user', content:<sentence>}]`)

---

## DETERMINATION

**MIXED — and the primary task sentence reveals a DEFECT.**

The exact sentence specified in the task ("Help me tell my cleaning crew which houses to clean each day.") **jumped straight to `kind:'proposal'`** instead of asking a clarifying question. Two other naive sentences correctly returned `kind:'question'`. So the clarify-then-act gate is **not reliably triggered** by naive input — it depends heavily on how much the LLM can pattern-match the sentence onto known integrations.

| #   | Naive sentence                                                  | Response `kind` | Correct?                           |
| --- | --------------------------------------------------------------- | --------------- | ---------------------------------- |
| 1   | "Help me tell my cleaning crew which houses to clean each day." | **`proposal`**  | ❌ DEFECT — skipped disambiguation |
| 2   | "I need help keeping track of my customers."                    | `question`      | ✅ asked to clarify                |
| 3   | "Can you help me with my emails?"                               | `question`      | ✅ asked to clarify                |

---

## DEFECT FINDING (Sentence 1 — the task-target sentence)

The cleaning-crew sentence is exactly the kind of vague, non-technical request a real PM would type. It does **not** specify:

- Which property-management system holds the house/checkout data
- How the crew should be told (Slack? SMS? email? a printed list?)
- When/how often this runs (on-demand? daily? at what time?)
- What "which houses to clean" even means (checkouts? a fixed rotation? dirty-flag?)

Yet `converse-create` returned a **fully-formed `proposal`** that silently invented all of the above:

**Hallucinated tool_registry (PM never mentioned any of these):**

```
/tools/hostfully/get-checkouts.ts
/tools/hostfully/get-properties.ts
/tools/slack/post-message.ts
/tools/platform/submit-output.ts
```

**Hallucinated trigger / schedule:** `overview.trigger = "Scheduled daily at 6 AM."`
(The proposal's `trigger_sources` is actually `{type:'manual'}`, so the overview prose even **contradicts** the structured trigger field — a second, internal inconsistency.)

**Hallucinated identity / workflow:** assumed Hostfully checkouts == houses to clean, assumed Slack is the delivery channel, assumed `approval_required:false` (auto-deliver with no human review).

**Why this is a platform defect:**
A non-technical PM would be handed a "Daily Cleaning Bot" wired to Hostfully + Slack on a fictional 6 AM schedule that they never asked for and may not even use. The clarify-then-act flow exists precisely to disambiguate this. For the canonical vague request, it skipped straight to a confident-but-fabricated proposal. The disambiguation gate is non-deterministic: it fired for "customers" and "emails" but not for the cleaning-crew sentence — likely because VLRE has Hostfully/Slack integrations connected, so the LLM over-eagerly pattern-matched "houses/cleaning" onto the existing guest-messaging/summarizer tooling and felt confident enough to propose.

---

## Responses Verbatim

### Sentence 2 — `question`

> "Could you clarify what you mean by 'keep track of my customers'? For example, do you want the AI employee to log customer details, send follow-up messages, or integrate with a specific tool (e.g., Notion, Google Sheets) to manage customer data? Also, what information would you like to track (name, contact, notes, etc.)?"

### Sentence 3 — `question`

> "Could you clarify what kind of email assistance you need? For example, would you like me to read and summarize your unread emails, help draft replies, organize your inbox, or something else?"

### Sentence 1 — `proposal` (DEFECT, abbreviated; full JSON in evidence)

> role_name: `daily-cleaning-bot` · model: `minimax/minimax-m2.7` · tools: Hostfully get-checkouts/get-properties + Slack post-message + platform submit-output · overview.trigger: "Scheduled daily at 6 AM." · approval_required: false

---

## Raw evidence

- `.sisyphus/evidence/task-6-probe.json` — sentence 1 (the task-target, full proposal JSON)
- `.sisyphus/evidence/task-6-probe-s2.json` — sentence 2 (question)
- `.sisyphus/evidence/task-6-probe-s3.json` — sentence 3 (question)

## Root-cause pointer (for a later fix task)

The decision lives in `ArchetypeGenerator.converse()` (called from `src/gateway/routes/admin-archetype-converse-create.ts:177`). The route faithfully passes through whatever `converse()` returns — `kind:'question'` vs `kind:'proposal'` is the LLM's call, governed by the converse system prompt + the connected/connectable toolkit hints (`connectedToolkits`, `connectableToolkits`) passed in at lines 162-180. Because VLRE's connected toolkits include Hostfully/Slack, the prompt gives the model enough scaffolding to feel confident and skip the question. A fix would tighten the converse prompt to REQUIRE a clarifying question on a first single-sentence turn that omits trigger + delivery + data-source, regardless of available integrations.
