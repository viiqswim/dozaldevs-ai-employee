# Run A — Chat Quality Notes

**Date:** 2026-06-17  
**Input:** "Help me tell my cleaning crew which houses to clean each day."  
**Wizard behavior:** Single turn → immediate `kind:'proposal'` (no clarifying chat)

---

## Key Finding: Zero Disambiguations Surfaced

The wizard produced a proposal in a single turn. **No clarifying questions were asked at all.** A non-technical PM received a "Review & Edit" screen immediately with a fully-formed — but silently invented — archetype.

---

## Disambiguations Surfaced vs. Needed

### ❌ TRIGGER TYPE — NOT ASKED

The PM's sentence says nothing about WHEN the employee should run. The proposal silently chose:

- `trigger_sources: { type: 'manual' }` (manual invocation)
- `overview.trigger: "Manual invocation by the user."`

But the real intent (a daily cleaning schedule) clearly implies a **scheduled** trigger. A non-technical PM would see "Manual invocation" in the overview and not understand why they'd have to trigger it themselves.

### ❌ DATA SOURCE — NOT ASKED

The PM said "which houses to clean" with no mention of a system. The proposal chose:

- Hostfully (`get-checkouts`, `get-property`)

This is an educated assumption based on VLRE's connected integrations. But the PM might use:

- Hostfully checkouts (correct for VLRE)
- Notion (the staff manual and property directory are in Notion)
- Both (cross-referencing)
- A different calendar or spreadsheet

**No question was asked. Hostfully was silently assumed.**

### ❌ DELIVERY CHANNEL — NOT ASKED

The PM said nothing about HOW the crew should be told. The proposal chose:

- Slack (generic — `post-message.ts` to "the configured notification channel")

But the PM might want:

- A specific Slack channel (e.g., `#cleaning-crew`)
- A different channel per zip code / team
- Hostfully messaging to individual cleaners
- Email

**No channel was specified or asked about.**

### ❌ CLEANER ASSIGNMENT RULES — NOT ADDRESSED AT ALL

The PM said "tell my cleaning crew" — implying there are specific cleaners with specific assignments. The proposal generated NO logic for:

- Which cleaner covers which property/ZIP
- Time estimates per property
- Priority ordering
- Conflict resolution (two checkouts for one cleaner at same time)

The proposal only produces a list of properties to clean. It does not include cleaner-to-property assignment, which is the CORE of the stated intent.

### ❌ NOTION KNOWLEDGE BASE — NOT ASKED AND NOT INCLUDED

The staff manual (`Manual de Personal`) and property directory (`Directorio Operativo`) are in Notion. These are the source documents for cleaner assignments, time estimates, and trash rules. The proposal:

- Uses only Hostfully (for checkout data)
- Ignores Notion entirely
- Does not mention knowledge base lookup

If a user had explicitly mentioned "my team uses Notion for cleaner assignments" (as in the expanded description captured in the network), the LLM still did not include Notion tools in the proposal.

### ❌ TRASH SCHEDULE RULES — NOT ADDRESSED

The oracle identified trash reminder and trash-day confirmation tasks as part of the cleaning crew's workflow. These require knowing the trash collection schedule by ZIP. The proposal has no trash logic whatsoever.

---

## Jargon Assessment

The wizard did NOT ask any questions, so jargon cannot be assessed. However, the proposal includes some potentially confusing items for a non-technical PM:

- `role_name: "cleaning-schedule-bot"` — The "Review & Edit" step shows this as "Employee Name" with the note "(lowercase, hyphens only)". A non-technical PM might not understand why they can't use spaces.
- "Submit output for review" in execution steps — Vague. What output? What review? A PM might not understand this means Slack approval card.
- `trigger_sources.type: "manual"` — Shown in the Overview as "Manual invocation by the user." This is technically accurate but the PM wanted something that runs daily automatically.

---

## 5-Turn Backstop Behavior

**Not triggered.** The backstop (server-side rule: force a proposal after 5 assistant turns) was irrelevant because the system never entered question mode. The `kind:'question'` path was skipped entirely on turn 1.

---

## Cross-Reference with Oracle's Flagged Ambiguities

From the oracle's correctness criteria (Task 4):

| Oracle Ambiguity                                                    | Surfaced in wizard chat? | How handled in proposal?                                |
| ------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| ZIPs 78722/78724/78741 have no cleaner assigned                     | ❌ Not surfaced          | Not addressed — proposal has no assignment logic at all |
| Check-in billing rule (checkout+checkin same day = charge as rooms) | ❌ Not surfaced          | Not addressed                                           |
| Trash reminder rules (varies by ZIP and day)                        | ❌ Not surfaced          | Not addressed                                           |
| Trigger type (manual vs. daily schedule)                            | ❌ Not surfaced          | Silently set to "manual"                                |
| Data source (Hostfully vs. Notion vs. both)                         | ❌ Not surfaced          | Silently set to Hostfully only                          |
| Delivery channel (which Slack channel?)                             | ❌ Not surfaced          | Set to "configured notification channel" (generic)      |
| Cleaner-to-property assignments                                     | ❌ Not surfaced          | Entirely omitted from proposal                          |

**Score: 0/7 key ambiguities surfaced.**

---

## Qualitative Assessment

A non-technical PM typing this sentence would:

1. See "Thinking…" for ~43 seconds
2. Be taken to a dense "Review & Edit" form with fields like "Identity", "Execution Steps", "Delivery Steps"
3. See a proposal that _sounds_ plausible but silently makes wrong assumptions about trigger type (manual instead of scheduled) and omits the core feature they wanted (who to assign to each house)
4. Have no indication that the AI guessed at their intent

The PM would likely click "Save as Draft" without realizing the employee is (a) manually triggered rather than daily automated, (b) missing cleaner assignments, (c) not reading their Notion docs, and (d) posting to a generic channel rather than a crew-specific one.

The clarify-then-act gate, which exists precisely for this type of vague input, **did not fire**.

---

## Comparison: How the Wizard SHOULD Have Behaved

A well-tuned wizard would have responded with something like:

> "Got it — I can help you set that up! A few quick questions so I get it right:
>
> 1. When should this run — every morning automatically, or only when you ask?
> 2. Where is your list of which cleaners cover which homes — do you use Hostfully, Notion, a spreadsheet, or something else?
> 3. Where should the schedule be posted — a specific Slack channel, or somewhere else?
> 4. Should the schedule show just the properties, or also which cleaner is assigned to each one?"

This would give the PM a natural conversational exchange and produce a much more accurate proposal.

---

## Defect Summary

| Defect                                                             | Severity |
| ------------------------------------------------------------------ | -------- |
| Single vague turn triggers immediate proposal (no clarification)   | HIGH     |
| Trigger type silently defaulted to "manual" instead of asking      | HIGH     |
| Core functionality (cleaner assignment) omitted entirely           | CRITICAL |
| Data source (Notion) never considered despite source docs existing | HIGH     |
| No Slack channel disambiguation                                    | MEDIUM   |
| No trash/trash-reminder logic                                      | MEDIUM   |

**Root cause (from Task 6 analysis):** The converse system prompt allows the model to propose if it "feels confident" based on available integrations (VLRE has Hostfully + Slack connected). The fix is to require a clarifying question on single-sentence first turns when trigger + delivery + assignment logic are all unspecified.
