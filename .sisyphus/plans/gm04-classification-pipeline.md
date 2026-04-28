# GM-04: Message Classification Pipeline

## TL;DR

> **Quick Summary**: Implement and verify the guest message classification pipeline — the system prompt (GM-02) already handles the LLM classification logic; this story wires the NO_ACTION_NEEDED flow, adds output validation, creates a synthetic accuracy benchmark, and proves 90%+ classification accuracy end-to-end.
>
> **Deliverables**:
>
> - `src/lib/classify-message.ts` — classification output parser/validator (ported from MVP)
> - Updated archetype instructions (STEP 4) — worker posts info card for NO_ACTION_NEEDED
> - New lifecycle step `check-classification` — auto-completes NO_ACTION_NEEDED tasks
> - Synthetic test fixture set (20-30 messages) in `tests/fixtures/`
> - Unit tests for parser + lifecycle NO_ACTION_NEEDED flow
> - LLM accuracy benchmark script `scripts/benchmark-classifier.ts`
> - API endpoint verification of the full flow
> - Story map updated with GM-04 checkboxes marked
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 7 → Task 9 → F1-F4

---

## Context

### Original Request

Implement GM-04 (Message Classification Pipeline) from the Phase 1 story map. Test thoroughly via automated tests and API endpoint verification. Update the story map document after implementation.

### Interview Summary

**Key Discussions**:

- All 6 dependencies confirmed DONE: HF-02 (get-property), HF-03 (get-reservations), HF-04 (get-messages), GM-01 (archetype), GM-02 (system prompt), GM-03 (KB)
- Classification logic already lives in the system prompt — no separate ML model needed
- Worker instructions (STEP 4) already route on classification but lack NO_ACTION_NEEDED Slack posting

**Decisions Made**:

- **NO_ACTION_NEEDED handling**: Worker posts informational Slack message (no approve/reject buttons) + lifecycle auto-completes to Done
- **Accuracy testing**: Synthetic test set of 20-30 messages + two-tier testing (unit + manual LLM benchmark)

**Research Findings**:

- Standalone MVP `skills/pipeline/processor.ts` has battle-tested `parseClassifyResponse()` that handles markdown code fences, missing fields, and normalization
- Lifecycle has an existing `!approvalRequired` short-circuit (line 277) — the NO_ACTION_NEEDED check is additive, not a modification
- New lifecycle step must go **between** `submitting` detection and `set-reviewing` to intercept NO_ACTION_NEEDED
- `deliverables.content` is fetched via PostgREST — the lifecycle cannot read `/tmp/summary.txt` directly
- Worker STEP 1 early-exit writes non-JSON string `"NO_ACTION_NEEDED: No unresponded..."` — parser must handle this

### Metis Review

**Identified Gaps** (all addressed in plan):

- EC4: Non-JSON early-exit path (`"NO_ACTION_NEEDED: No unresponded..."`) must be handled before JSON parse
- EC1: LLM may wrap JSON in markdown code fences — parser must strip them
- EC2: Race condition on deliverable read after task reaches Submitting — add retry
- EC3: LLM may return non-null `draftResponse` for NO_ACTION_NEEDED — normalize to null
- Missing acceptance criteria for: NO_ACTION_NEEDED never enters Reviewing, existing tests still pass
- Slack post ownership clarified: worker posts info card (not lifecycle)
- parseClassifyResponse failure behavior: default to NEEDS_APPROVAL (matching MVP)
- A4: NOTIFICATION_CHANNEL already available via `$NOTIFICATION_CHANNEL` env var in worker

---

## Work Objectives

### Core Objective

Wire the message classification pipeline end-to-end: the system prompt handles classification; we need output validation, NO_ACTION_NEEDED flow handling, and accuracy verification.

### Concrete Deliverables

- `src/lib/classify-message.ts` — parseClassifyResponse + ClassifyResult type
- Updated STEP 4 in `prisma/seed.ts` VLRE_GUEST_MESSAGING_INSTRUCTIONS
- New `step.run('check-classification')` in `src/inngest/employee-lifecycle.ts`
- `tests/fixtures/classification-test-set.ts` — 20-30 synthetic messages
- `tests/lib/classify-message.test.ts` — unit tests
- `tests/inngest/employee-lifecycle-classification.test.ts` — lifecycle NO_ACTION_NEEDED tests
- `scripts/benchmark-classifier.ts` — LLM accuracy benchmark

### Definition of Done

- [ ] `pnpm test -- --run` exits 0 (all existing + new tests pass)
- [ ] `pnpm build` exits 0
- [ ] `tsx scripts/benchmark-classifier.ts` reports ≥90% accuracy and exits 0
- [ ] Trigger guest-messaging employee → task reaches Done with valid classification JSON in deliverable
- [ ] GM-04 acceptance criteria all checked in story map

### Must Have

- Every guest message produces a valid classification (NEEDS_APPROVAL or NO_ACTION_NEEDED)
- Classification includes: confidence (0-1), category, urgency flag, conversation summary
- NO_ACTION_NEEDED tasks auto-complete to Done (never enter Reviewing)
- NO_ACTION_NEEDED posts informational Slack message (PM visibility, no action)
- NEEDS_APPROVAL produces a drafted response
- Parse failures default to NEEDS_APPROVAL (no false negatives)
- 90%+ accuracy on synthetic test set
- No false negatives on complaints — complaints always classify as NEEDS_APPROVAL

### Must NOT Have (Guardrails)

- Do NOT modify `src/workers/opencode-harness.mts` — no Docker rebuild for this feature
- Do NOT modify the existing `approvalRequired` flag logic (lines 277-293 in lifecycle) — the new check is additive
- Do NOT add LLM calls inside `parseClassifyResponse` — it is a pure parsing function
- Do NOT add the benchmark script to any Inngest function registry — it lives in `scripts/`
- Do NOT use any model other than `minimax/minimax-m2.7` for the benchmark (per AGENTS.md approved models)
- Do NOT design rich Block Kit messages for the NO_ACTION_NEEDED info card — use `post-message.ts --text` only (plain text + task ID context block)
- Do NOT modify any story map sections other than GM-04 acceptance criteria checkboxes
- Do NOT extract real VLRE guest messages — synthetic test data only

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest v2)
- **Automated tests**: YES (Tests-after — implementation first, then tests)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (node/tsx REPL) — Import, call functions, compare output
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Inngest Functions**: Use Vitest InngestTestEngine — mock steps, assert state transitions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, MAX PARALLEL):
├── Task 1: Port parseClassifyResponse + ClassifyResult type [quick]
├── Task 2: Create synthetic test fixture set [quick]
├── Task 3: Update archetype instructions STEP 4 for NO_ACTION_NEEDED info card [quick]

Wave 2 (After Wave 1 — core lifecycle + tests):
├── Task 4: Add lifecycle check-classification step (depends: 1) [deep]
├── Task 5: Unit tests for parseClassifyResponse (depends: 1, 2) [unspecified-high]
├── Task 6: Unit tests for lifecycle NO_ACTION_NEEDED flow (depends: 4) [unspecified-high]

Wave 3 (After Wave 2 — verification + finalization):
├── Task 7: LLM accuracy benchmark script (depends: 1, 2) [unspecified-high]
├── Task 8: API endpoint verification test (depends: 3, 4) [unspecified-high]
├── Task 9: Update story map + run full test suite (depends: 5, 6, 7, 8) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 6 → Task 8 → Task 9 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks  | Wave |
| ---- | ---------- | ------- | ---- |
| 1    | —          | 4, 5, 7 | 1    |
| 2    | —          | 5, 7    | 1    |
| 3    | —          | 8       | 1    |
| 4    | 1          | 6, 8    | 2    |
| 5    | 1, 2       | 9       | 2    |
| 6    | 4          | 9       | 2    |
| 7    | 1, 2       | 9       | 3    |
| 8    | 3, 4       | 9       | 3    |
| 9    | 5, 6, 7, 8 | F1-F4   | 3    |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **3 tasks** — T4 → `deep`, T5 → `unspecified-high`, T6 → `unspecified-high`
- **Wave 3**: **3 tasks** — T7 → `unspecified-high`, T8 → `unspecified-high`, T9 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Port parseClassifyResponse + ClassifyResult type

  **What to do**:
  - Create `src/lib/classify-message.ts` with:
    - `ClassifyResult` interface: `{ classification: 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED'; confidence: number; reasoning: string; draftResponse: string | null; summary: string; category: string; conversationSummary: string | null; urgency: boolean; }`
    - `parseClassifyResponse(responseText: string): ClassifyResult` function ported from MVP's `skills/pipeline/processor.ts` (lines 330-370)
  - **Handle non-JSON early-exit** (CRITICAL): If `responseText.trim().startsWith('NO_ACTION_NEEDED:')`, return a ClassifyResult with `classification: 'NO_ACTION_NEEDED'`, `confidence: 1.0`, `category: 'acknowledgment'`, `draftResponse: null`, `summary: responseText.trim()`, `urgency: false`, `conversationSummary: null`, `reasoning: 'Early exit — no messages to process'`
  - **Handle markdown code fences**: Strip ` ```json ... ``` ` and ` ``` ... ``` ` wrappers before JSON.parse (the MVP already does this at line 332)
  - **Parse failure → default to NEEDS_APPROVAL**: On JSON parse failure, return fallback ClassifyResult with `classification: 'NEEDS_APPROVAL'`, `confidence: 0.3`, `reasoning: 'Failed to parse LLM response — manual review required'`, `draftResponse: 'Thank you for your message! A member of our team will get back to you shortly.'`, `summary: 'Classification failed — manual review needed'`, `category: 'other'`, `urgency: false`
  - **Normalize NO_ACTION_NEEDED**: If classification is NO_ACTION_NEEDED, force `draftResponse: null` and `category: 'acknowledgment'` (matching MVP behavior)
  - **Clamp confidence**: `Math.min(1.0, Math.max(0.0, confidence ?? 0.5))`
  - **Any unrecognized classification value** defaults to NEEDS_APPROVAL
  - Export both `ClassifyResult` and `parseClassifyResponse`

  **Must NOT do**:
  - Do NOT import or call `callLLM` — this is a pure parsing function
  - Do NOT add any network calls or side effects
  - Do NOT add `buildLearnedRulesPrompt` or `buildUserMessage` — only the parser
  - Do NOT add `buildFallbackSummary` — that's MVP-specific Slack logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation, well-defined interface, direct port from existing code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `skills/pipeline/processor.ts:330-370` (standalone MVP at `/Users/victordozal/repos/real-estate/vlre-employee/`) — The exact `parseClassifyResponse` function to port. Note the regex for code fence stripping (line 332), the classification normalization (lines 354-356), and the fallback on parse failure (lines 342-351)
  - `skills/pipeline/processor.ts:50-59` — The `ClassifyResult` interface definition to port

  **API/Type References**:
  - `skills/pipeline/processor.ts:39-48` — `ClassifyParams` interface (DO NOT port — only port the output type)

  **External References**:
  - None needed — pure TypeScript

  **WHY Each Reference Matters**:
  - The MVP's `parseClassifyResponse` is battle-tested on hundreds of real guest messages. The regex, fallback, and normalization logic handle actual LLM output quirks. Port it faithfully, don't reinvent.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ````
  Scenario: Happy path — valid NEEDS_APPROVAL JSON
    Tool: Bash (node)
    Preconditions: src/lib/classify-message.ts exists and compiles
    Steps:
      1. Run: node -e "const {parseClassifyResponse} = require('./dist/lib/classify-message.js'); const r = parseClassifyResponse(JSON.stringify({classification:'NEEDS_APPROVAL',confidence:0.85,reasoning:'Guest asking about WiFi',draftResponse:'WiFi is GuestNetwork, password abc123.',summary:'WiFi request',category:'wifi',conversationSummary:null,urgency:false})); console.log(JSON.stringify(r));"
      2. Assert output contains: "classification":"NEEDS_APPROVAL"
      3. Assert output contains: "confidence":0.85
      4. Assert output contains: "draftResponse":"WiFi is GuestNetwork
    Expected Result: Valid ClassifyResult with all fields populated
    Evidence: .sisyphus/evidence/task-1-happy-path-needs-approval.txt

  Scenario: Happy path — valid NO_ACTION_NEEDED JSON
    Tool: Bash (node)
    Steps:
      1. Run same as above with classification: "NO_ACTION_NEEDED", draftResponse: "You're welcome!"
      2. Assert draftResponse is null (normalized)
      3. Assert category is "acknowledgment" (normalized)
    Expected Result: draftResponse forced to null, category forced to acknowledgment
    Evidence: .sisyphus/evidence/task-1-happy-path-no-action.txt

  Scenario: Non-JSON early-exit string
    Tool: Bash (node)
    Steps:
      1. Pass "NO_ACTION_NEEDED: No unresponded guest messages found." to parseClassifyResponse
      2. Assert classification is "NO_ACTION_NEEDED"
      3. Assert confidence is 1.0
    Expected Result: Returns valid ClassifyResult without JSON parsing
    Evidence: .sisyphus/evidence/task-1-non-json-early-exit.txt

  Scenario: Markdown code fence wrapping
    Tool: Bash (node)
    Steps:
      1. Pass "```json\n{\"classification\":\"NEEDS_APPROVAL\",\"confidence\":0.9,\"reasoning\":\"test\",\"draftResponse\":\"Hello\",\"summary\":\"test\",\"category\":\"wifi\",\"conversationSummary\":null,\"urgency\":false}\n```" to parseClassifyResponse
      2. Assert classification is "NEEDS_APPROVAL"
    Expected Result: Code fences stripped, JSON parsed successfully
    Evidence: .sisyphus/evidence/task-1-code-fence.txt

  Scenario: Malformed JSON — parse failure defaults to NEEDS_APPROVAL
    Tool: Bash (node)
    Steps:
      1. Pass "This is not JSON at all" to parseClassifyResponse
      2. Assert classification is "NEEDS_APPROVAL"
      3. Assert confidence is 0.3
    Expected Result: Fallback ClassifyResult returned (no throw)
    Evidence: .sisyphus/evidence/task-1-parse-failure.txt

  Scenario: Missing classification field — defaults to NEEDS_APPROVAL
    Tool: Bash (node)
    Steps:
      1. Pass valid JSON missing the "classification" field
      2. Assert classification is "NEEDS_APPROVAL"
    Expected Result: Unrecognized classification defaults to NEEDS_APPROVAL
    Evidence: .sisyphus/evidence/task-1-missing-field.txt
  ````

  **Commit**: YES (commit 1)
  - Message: `feat(classify): add parseClassifyResponse and ClassifyResult type`
  - Files: `src/lib/classify-message.ts`
  - Pre-commit: `pnpm build`

---

- [x] 2. Create synthetic test fixture set

  **What to do**:
  - Create `tests/fixtures/classification-test-set.ts` with 25-30 test messages
  - Each fixture: `{ input: string; expectedClassification: 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED'; expectedCategory: string; expectedUrgency: boolean; description: string }`
  - Cover ALL categories from the system prompt taxonomy:
    - `wifi` (2 messages): "What's the WiFi password?", "Internet isn't working"
    - `access` (2 messages): "I can't get in, the door code doesn't work", "What's the door code?"
    - `early-checkin` (1): "Can we check in at noon instead of 3pm?"
    - `late-checkout` (1): "Is it possible to check out at 1pm?"
    - `parking` (1): "Where do I park?"
    - `amenities` (1): "Does the property have a washer/dryer?"
    - `maintenance` (2): "The AC isn't working", "There's a water leak in the bathroom"
    - `noise` (1): "The neighbors are very loud"
    - `pets` (1): "Can I bring my dog?"
    - `refund` (1): "I'd like a refund for the last night"
    - `acknowledgment` (3 NO_ACTION_NEEDED): "Ok", "Got it", "Noted"
    - `booking_question` (1): "How many guests are allowed?"
    - Polite replies (3 NEEDS_APPROVAL): "Thanks!", "Gracias por la informacion!", "Perfect, see you Friday!"
    - Spanish messages (2 NEEDS_APPROVAL): "¿Cuál es la contraseña del WiFi?", "No hay problema si llegamos a las 6, cierto?"
    - Complaints (3 NEEDS_APPROVAL, urgency varies): "The place is filthy", "I smell gas!", "There are cockroaches"
    - Mixed messages (2 NEEDS_APPROVAL): "Got it, but what's the WiFi?", "Thanks! Also, can we check in early?"
    - Edge case: "no hay problema" inside a question (NEEDS_APPROVAL)
  - Export as `CLASSIFICATION_TEST_SET` array
  - Include a property context object for the benchmark: `TEST_PROPERTY_CONTEXT` with guest name, property name, check-in/out dates, channel, KB content

  **Must NOT do**:
  - Do NOT use real guest messages or PII
  - Do NOT exceed 30 fixtures (benchmark cost control)
  - Do NOT include a `draftResponse` in fixtures — that's the LLM's job

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, no code logic, just data fixtures
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `skills/pipeline/processor.ts:192-244` (standalone MVP) — The POLITE REPLY GUIDANCE and ACKNOWLEDGMENT DETECTION sections define exactly which messages are NO_ACTION_NEEDED vs NEEDS_APPROVAL. Use these examples directly as fixtures.
  - `prisma/seed.ts:600-637` — The classification rules section of the KB defines AUTO_RESPOND candidates, NEEDS_APPROVAL categories, and escalation triggers.

  **WHY Each Reference Matters**:
  - The MVP's prompt examples are the ground truth for expected classifications. The fixtures must match these rules exactly.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fixture set has correct count and shape
    Tool: Bash (node)
    Steps:
      1. Run: node -e "const {CLASSIFICATION_TEST_SET} = require('./dist/tests/fixtures/classification-test-set.js'); console.log('Count:', CLASSIFICATION_TEST_SET.length); console.log('Has NEEDS_APPROVAL:', CLASSIFICATION_TEST_SET.some(f => f.expectedClassification === 'NEEDS_APPROVAL')); console.log('Has NO_ACTION_NEEDED:', CLASSIFICATION_TEST_SET.some(f => f.expectedClassification === 'NO_ACTION_NEEDED'));"
      2. Assert Count is between 25 and 30
      3. Assert both classification types present
    Expected Result: 25-30 fixtures with both types
    Evidence: .sisyphus/evidence/task-2-fixture-shape.txt

  Scenario: All complaint fixtures have expectedClassification = NEEDS_APPROVAL
    Tool: Bash (node)
    Steps:
      1. Filter fixtures where description contains "complaint" or expectedCategory is "maintenance" with urgency
      2. Assert all have expectedClassification === 'NEEDS_APPROVAL'
    Expected Result: Zero complaint fixtures classified as NO_ACTION_NEEDED
    Evidence: .sisyphus/evidence/task-2-complaint-check.txt
  ```

  **Commit**: YES (commit 2)
  - Message: `test(classify): add synthetic test fixture set`
  - Files: `tests/fixtures/classification-test-set.ts`
  - Pre-commit: —

---

- [x] 3. Update archetype instructions STEP 4 for NO_ACTION_NEEDED info card

  **What to do**:
  - In `prisma/seed.ts`, find `VLRE_GUEST_MESSAGING_INSTRUCTIONS` (line 413)
  - Update STEP 4 (line 427) from:
    ```
    If classification is NO_ACTION_NEEDED: write the classification JSON to /tmp/summary.txt and stop. Do NOT post to Slack.
    ```
    To:
    ```
    If classification is NO_ACTION_NEEDED: write the classification JSON to /tmp/summary.txt. Post an informational message (no approve/reject buttons needed): NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "ℹ️ No action needed — <guest name> at <property name>: <summary from classification JSON>" --task-id <TASK_ID from end of prompt> > /tmp/approval-message.json
    ```
  - This means for NO_ACTION_NEEDED, the worker ALSO writes `/tmp/approval-message.json` (the Slack response). But the `--task-id` flag means it gets a task ID context block only, NO approve/reject buttons (because `--task-id` without `--text` containing "approve" just adds the context block).
  - Run `pnpm prisma db seed` after the change
  - Verify the updated instructions are in the DB: query `archetypes` table for `guest-messaging` and confirm STEP 4 contains the new text

  **Must NOT do**:
  - Do NOT change any other STEP (1, 2, 3, 5, 6)
  - Do NOT modify the system_prompt — only instructions
  - Do NOT use Block Kit for the info message — plain text only via `--text`
  - Do NOT add approve/reject buttons to the NO_ACTION_NEEDED message

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single string update in seed file, plus seed command
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:413-438` — The current `VLRE_GUEST_MESSAGING_INSTRUCTIONS` string. Only modify the STEP 4 section (line 427).
  - `prisma/seed.ts:430-433` — The existing STEP 5 pattern for posting to Slack. Use the same `NODE_NO_WARNINGS=1 tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text "..." --task-id ...` pattern.
  - `src/worker-tools/slack/post-message.ts` — The shell tool that handles the posting. When `--task-id` is provided, it auto-generates a task ID context block. The `--text` flag is the message content.

  **WHY Each Reference Matters**:
  - The STEP 5 pattern shows exactly how to format the post-message.ts invocation. The NO_ACTION_NEEDED info card must follow the same shell tool pattern but with different text content.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Seed runs successfully with updated instructions
    Tool: Bash
    Preconditions: Local DB running
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert exit code 0
    Expected Result: Seed completes without errors
    Evidence: .sisyphus/evidence/task-3-seed-run.txt

  Scenario: STEP 4 in DB contains updated NO_ACTION_NEEDED instructions
    Tool: Bash (psql)
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT instructions FROM archetypes WHERE role_name='guest-messaging' LIMIT 1;"
      2. Assert output contains "No action needed"
      3. Assert output contains "post-message.ts"
      4. Assert output does NOT contain "Do NOT post to Slack" (old text removed)
    Expected Result: STEP 4 updated in DB, old instruction removed
    Evidence: .sisyphus/evidence/task-3-db-verify.txt

  Scenario: Build still passes after seed change
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: No compilation errors
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES (commit 4)
  - Message: `feat(seed): update STEP 4 for NO_ACTION_NEEDED info card`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Add lifecycle check-classification step for NO_ACTION_NEEDED auto-complete

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, add a new `step.run('check-classification', ...)` **between** the existing `submitting` detection step and the `set-reviewing` step (around line 277-297)
  - The new step:
    1. Fetch the deliverable for this task via PostgREST: `GET /rest/v1/deliverables?task_id=eq.{taskId}&select=content&order=created_at.desc&limit=1` (follow the same fetch pattern used in `handle-approval-result` step around line 325)
    2. Parse `deliverables[0].content` using `parseClassifyResponse()` (imported from `src/lib/classify-message.ts`)
    3. If `classification === 'NO_ACTION_NEEDED'`: return `{ skipApproval: true }` from the step
    4. If `classification === 'NEEDS_APPROVAL'` or parse failed: return `{ skipApproval: false }`
  - **After** the step, add a conditional: if `skipApproval === true`, patch task status to `Done` (same pattern as the existing `!approvalRequired` branch at lines 277-293), destroy the machine, and return early
  - **Add retry logic** for the deliverable fetch: 3 attempts, 1 second apart (race condition where deliverable may not be committed yet when lifecycle checks)
  - Import `parseClassifyResponse` from `../../lib/classify-message.js` at the top of the file

  **Must NOT do**:
  - Do NOT modify the existing `approvalRequired` flag logic at lines 277-293 — the new check is a SEPARATE conditional block below it
  - Do NOT modify `src/workers/opencode-harness.mts`
  - Do NOT add inline fetch calls outside of `step.run()` — Inngest requires all side-effects in steps for replay safety
  - Do NOT add any Slack posting logic in the lifecycle for NO_ACTION_NEEDED — the worker handles that (Task 3)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Modifying the lifecycle function is high-risk — must understand Inngest step semantics, replay safety, and the existing state machine flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 8
  - **Blocked By**: Task 1 (needs parseClassifyResponse)

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:277-293` — The existing `!approvalRequired` short-circuit. The new NO_ACTION_NEEDED check follows the EXACT same pattern: patch to Done, destroy machine, return. But triggered by content analysis, not archetype config.
  - `src/inngest/employee-lifecycle.ts:325-330` — The `handle-approval-result` step's deliverable fetch via PostgREST. Copy this fetch pattern for the new `check-classification` step.
  - `src/inngest/employee-lifecycle.ts:271-276` — The `submitting` step where task status reaches Submitting. The new step goes AFTER this.
  - `src/inngest/employee-lifecycle.ts:297-310` — The `set-reviewing` step. The new step goes BEFORE this.

  **API/Type References**:
  - `src/lib/classify-message.ts` (from Task 1) — Import `parseClassifyResponse` and `ClassifyResult`

  **WHY Each Reference Matters**:
  - Lines 277-293 show the exact "skip approval" pattern to replicate. Lines 325-330 show the PostgREST fetch pattern for deliverables. The new step is a surgical insertion between two existing steps.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Build passes with lifecycle change
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert exit code 0
    Expected Result: No compilation errors from the new step
    Evidence: .sisyphus/evidence/task-4-build.txt

  Scenario: Lifecycle file still exports the function correctly
    Tool: Bash (node)
    Steps:
      1. Run: node -e "const m = require('./dist/inngest/employee-lifecycle.js'); console.log(typeof m.createEmployeeLifecycleFunction);"
      2. Assert output is "function"
    Expected Result: Export not broken
    Evidence: .sisyphus/evidence/task-4-export-check.txt
  ```

  **Commit**: YES (commit 3)
  - Message: `feat(lifecycle): auto-complete NO_ACTION_NEEDED tasks`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

---

- [x] 5. Unit tests for parseClassifyResponse

  **What to do**:
  - Create `tests/lib/classify-message.test.ts` with comprehensive unit tests
  - Port relevant tests from MVP's `skills/pipeline/processor.test.ts` (lines 255-345), adapting from `bun:test` to Vitest (`describe/it/expect` from `vitest`)
  - Test cases:
    1. **Valid NEEDS_APPROVAL JSON** — returns correct ClassifyResult with all fields
    2. **Valid NO_ACTION_NEEDED JSON** — forces draftResponse to null, category to 'acknowledgment'
    3. **NO_ACTION_NEEDED with non-null draftResponse** — normalized to null (EC3)
    4. **Missing classification field** — defaults to NEEDS_APPROVAL
    5. **Unrecognized classification value (e.g. "BANANA")** — defaults to NEEDS_APPROVAL
    6. **Non-JSON early-exit string** — `"NO_ACTION_NEEDED: No unresponded..."` returns valid result
    7. **Markdown code fence wrapping** — strips fences and parses JSON correctly
    8. **Complete parse failure (not JSON at all)** — returns fallback with confidence 0.3
    9. **Confidence clamping** — values >1.0 clamped to 1.0, <0.0 clamped to 0.0
    10. **Missing optional fields** — defaults applied (conversationSummary: null, urgency: false)
    11. **Urgency field** — `true` preserved, non-boolean defaults to `false`
  - Also test with the synthetic fixture set: import `CLASSIFICATION_TEST_SET` from `tests/fixtures/classification-test-set.ts` and verify that `parseClassifyResponse` can parse pre-formatted JSON for each fixture

  **Must NOT do**:
  - Do NOT call the real LLM — these are pure unit tests for the parser
  - Do NOT import from `bun:test` — use `vitest`
  - Do NOT test `callLLM` or `buildUserMessage` — only `parseClassifyResponse`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Thorough test coverage with many edge cases, needs careful attention to detail
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6 after dependency met)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `skills/pipeline/processor.test.ts:255-345` (standalone MVP) — The exact test cases to port. Adapt `bun:test` imports to `vitest`, `mock.module` to `vi.mock`, `beforeAll` async import pattern to direct import.
  - `tests/lib/call-llm.test.ts` — Shows the project's unit test pattern for `src/lib/` modules: `vi.spyOn`, assertion style, describe/it structure.

  **WHY Each Reference Matters**:
  - The MVP tests are proven — they cover the exact edge cases we need. Port them faithfully. The call-llm test shows the project's test conventions.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All parseClassifyResponse tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/lib/classify-message.test.ts
      2. Assert exit code 0
      3. Assert output shows 11+ test cases passing
    Expected Result: All tests green
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0
      3. Assert no regressions in existing tests
    Expected Result: No existing tests broken
    Failure Indicators: Any test that passed before now fails
    Evidence: .sisyphus/evidence/task-5-full-suite.txt
  ```

  **Commit**: YES (commit 5)
  - Message: `test(classify): unit tests for parseClassifyResponse`
  - Files: `tests/lib/classify-message.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 6. Unit tests for lifecycle NO_ACTION_NEEDED auto-complete flow

  **What to do**:
  - Create `tests/inngest/employee-lifecycle-classification.test.ts`
  - Follow the pattern in `tests/inngest/employee-lifecycle-delivery.test.ts` (InngestTestEngine + mockCtx + buildFetchMock)
  - Test cases:
    1. **NO_ACTION_NEEDED deliverable → task goes to Done (never enters Reviewing)**
       - Mock the deliverable fetch to return `{ content: '{"classification":"NO_ACTION_NEEDED","confidence":0.95,...}' }`
       - Assert task is patched to `Done` (not `Reviewing`)
       - Assert `step.waitForEvent` for approval is NEVER called
    2. **NEEDS_APPROVAL deliverable → normal flow (enters Reviewing)**
       - Mock deliverable with `classification: 'NEEDS_APPROVAL'`
       - Assert task reaches `Reviewing` and waits for approval event
    3. **Non-JSON early-exit → treated as NO_ACTION_NEEDED**
       - Mock deliverable with content: `'NO_ACTION_NEEDED: No unresponded guest messages found.'`
       - Assert task goes to Done
    4. **Malformed deliverable content → treated as NEEDS_APPROVAL (safe default)**
       - Mock deliverable with content: `'this is not JSON'`
       - Assert task proceeds to Reviewing (parseClassifyResponse defaults to NEEDS_APPROVAL)
    5. **Deliverable not found (race condition) → retry then proceed to Reviewing**
       - Mock first fetch as empty array, second fetch returns valid deliverable
       - Assert the step retries and succeeds
  - **CRITICAL**: Update the `buildFetchMock` helper (or create a new one) to handle the new deliverable fetch that now happens BEFORE `set-reviewing`. The existing lifecycle tests in `employee-lifecycle-delivery.test.ts` will need their mock sequences updated if the new step adds a fetch call earlier in the flow. Verify existing tests still pass.

  **Must NOT do**:
  - Do NOT use `@inngest/test` InngestTestEngine unless the function uses `waitForEvent` — for simpler tests, use the manual step stub pattern from `interaction-handler.test.ts`
  - Do NOT modify existing test files — create a new test file
  - Do NOT call real PostgREST — mock all fetch calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Lifecycle testing requires understanding Inngest step semantics, mock chaining, and the delivery test pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `tests/inngest/employee-lifecycle-delivery.test.ts` — The DIRECT template. Copy the InngestTestEngine + mockCtx + buildFetchMock pattern. This file tests the delivery phase; our file tests the classification check phase.
  - `tests/inngest/interaction-handler.test.ts` — Alternative simpler pattern (manual step stub). Use this if InngestTestEngine is overkill for the classification check.
  - `src/inngest/employee-lifecycle.ts:277-293` — The `!approvalRequired` short-circuit code path. The NO_ACTION_NEEDED path follows this same pattern — the test must assert the same behavior.

  **WHY Each Reference Matters**:
  - `employee-lifecycle-delivery.test.ts` shows exactly how to mock the lifecycle function's step calls and PostgREST fetches. Our tests mirror this structure but for the new `check-classification` step.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Classification lifecycle tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-classification.test.ts
      2. Assert exit code 0
      3. Assert 5 test cases pass
    Expected Result: All classification flow tests green
    Evidence: .sisyphus/evidence/task-6-tests-pass.txt

  Scenario: Existing lifecycle tests still pass (no regression)
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/employee-lifecycle-delivery.test.ts
      2. Assert exit code 0
    Expected Result: Existing delivery tests unaffected
    Failure Indicators: Any existing lifecycle test now fails
    Evidence: .sisyphus/evidence/task-6-no-regression.txt

  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0
    Expected Result: No regressions anywhere
    Evidence: .sisyphus/evidence/task-6-full-suite.txt
  ```

  **Commit**: YES (commit 6)
  - Message: `test(lifecycle): NO_ACTION_NEEDED auto-complete flow`
  - Files: `tests/inngest/employee-lifecycle-classification.test.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 7. LLM accuracy benchmark script

  **What to do**:
  - Create `scripts/benchmark-classifier.ts` — a standalone script that measures classification accuracy
  - Uses `tsx` to run (not compiled): `tsx scripts/benchmark-classifier.ts`
  - Workflow:
    1. Import `CLASSIFICATION_TEST_SET` and `TEST_PROPERTY_CONTEXT` from `tests/fixtures/classification-test-set.ts`
    2. Import `GUEST_MESSAGING_SYSTEM_PROMPT` from `prisma/seed.ts` (or hard-import the system prompt)
    3. Import `callLLM` from `src/lib/call-llm.ts`
    4. Import `parseClassifyResponse` from `src/lib/classify-message.ts`
    5. For each test fixture:
       a. Build a user message with the fixture's input text + TEST_PROPERTY_CONTEXT
       b. Call `callLLM({ model: 'minimax/minimax-m2.7', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], taskType: 'execution' })`
       c. Parse the response with `parseClassifyResponse(result.content)`
       d. Compare `result.classification` to `fixture.expectedClassification`
       e. Track: correct/incorrect, category match, urgency match
    6. At the end, print a summary:

       ```
       === Classification Accuracy Benchmark ===
       Total: 28 | Correct: 26 | Incorrect: 2
       Accuracy: 92.9% (threshold: 90%)

       False Negatives (complaints missed): 0
       False Positives (over-classified): 2

       PASS ✓
       ```

    7. Exit 0 if accuracy ≥ 90% AND false negatives on complaints = 0
    8. Exit 1 otherwise

  - Add a `--dry-run` flag that skips LLM calls and just validates the fixture set shape
  - Handle cost circuit breaker errors gracefully: catch `CostCircuitBreakerError` and print a warning about daily cost limit

  **Must NOT do**:
  - Do NOT use any model other than `minimax/minimax-m2.7` (per AGENTS.md)
  - Do NOT register this as an Inngest function
  - Do NOT import this from production code
  - Do NOT persist results to database
  - Do NOT build a UI or HTML output — stdout only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Scripting with LLM integration, error handling, accuracy calculation logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `scripts/trigger-task.ts` — Shows the project's script pattern: TypeScript with tsx, process.exit codes, console output formatting
  - `src/lib/call-llm.ts` — The `callLLM` interface and `CostCircuitBreakerError` type. Import and call with correct params.
  - `skills/pipeline/processor.ts:372-430` (standalone MVP) — The `callClaude` function shows how to build the system+user message pair and call the LLM. Adapt to use `callLLM` instead of direct fetch.

  **API/Type References**:
  - `src/lib/call-llm.ts:CallLLMOptions` — `{ model: string, messages: Message[], taskType: 'triage' | 'execution' | 'review' }`
  - `src/lib/classify-message.ts:ClassifyResult` (from Task 1) — The parsed output type

  **WHY Each Reference Matters**:
  - `trigger-task.ts` shows script conventions (process.exit, console formatting). `call-llm.ts` is the production LLM interface we must use. The MVP's `callClaude` shows the user message construction pattern.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dry-run validates fixture set without LLM calls
    Tool: Bash
    Preconditions: OPENROUTER_API_KEY set in .env
    Steps:
      1. Run: tsx scripts/benchmark-classifier.ts --dry-run
      2. Assert exit code 0
      3. Assert output contains "Dry run" and fixture count
    Expected Result: Fixtures validated, no LLM calls made
    Evidence: .sisyphus/evidence/task-7-dry-run.txt

  Scenario: Full benchmark achieves ≥90% accuracy
    Tool: Bash
    Preconditions: OPENROUTER_API_KEY set, services running for cost breaker check
    Steps:
      1. Run: tsx scripts/benchmark-classifier.ts
      2. Assert output contains "Accuracy:" with a percentage ≥90
      3. Assert output contains "False Negatives (complaints missed): 0"
      4. Assert exit code 0
    Expected Result: PASS with ≥90% accuracy and zero complaint false negatives
    Failure Indicators: Exit code 1, accuracy <90%, any complaint classified as NO_ACTION_NEEDED
    Evidence: .sisyphus/evidence/task-7-benchmark-result.txt
  ```

  **Commit**: YES (commit 7)
  - Message: `feat(scripts): add LLM classification accuracy benchmark`
  - Files: `scripts/benchmark-classifier.ts`
  - Pre-commit: —

---

- [x] 8. API endpoint verification test

  **What to do**:
  - Create `tests/gateway/gm04-classification-api.test.ts` — integration test that verifies the full classification flow via the admin API
  - This test uses the real test DB (Prisma) and mocked Inngest
  - Test cases:
    1. **Trigger guest-messaging employee returns 202 with task_id**
       - `POST /admin/tenants/:tenantId/employees/guest-messaging/trigger` with `X-Admin-Key` header
       - Assert response has `task_id` and `status_url`
    2. **Dry-run returns correct archetypeId**
       - `POST /admin/tenants/:tenantId/employees/guest-messaging/trigger?dry_run=true`
       - Assert `archetypeId` is `00000000-0000-0000-0000-000000000015`
    3. **Task status endpoint returns valid data**
       - After trigger: `GET /admin/tenants/:tenantId/tasks/:taskId`
       - Assert task has `status: 'Ready'` (initial state), `source_system: 'manual'`, `tenant_id` matches
    4. **Guest-messaging archetype has all classification fields in system_prompt**
       - Query the archetype from DB
       - Assert system_prompt contains: `"classification"`, `"NEEDS_APPROVAL"`, `"NO_ACTION_NEEDED"`, `"confidence"`, `"draftResponse"`, `"conversationSummary"`, `"urgency"`, `"category"`
  - Use the existing `TestApp` and `createTestApp()` from `tests/setup.ts` for HTTP assertions
  - Use `getPrisma()` for DB verification

  **Must NOT do**:
  - Do NOT actually run the OpenCode worker — this is an API + DB integration test, not an E2E test
  - Do NOT call the real LLM
  - Do NOT modify any existing route handlers
  - Do NOT create new API routes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test touching multiple layers (routes, DB, archetype config)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `tests/gateway/seed-guest-messaging.test.ts` — The DIRECT template. This file already tests the guest-messaging archetype seed. Our test extends it with API-level assertions.
  - `tests/setup.ts` — `createTestApp()`, `TestApp`, `getPrisma()`, `computeJiraSignature()` utilities
  - `tests/gateway/routes/trigger.test.ts` (if exists) — Shows how to test the trigger endpoint with supertest

  **API/Type References**:
  - `src/gateway/routes/admin.ts` — The trigger endpoint handler
  - `src/gateway/services/employee-dispatcher.ts` — The `dispatchEmployee` function tested in seed-guest-messaging.test.ts

  **WHY Each Reference Matters**:
  - `seed-guest-messaging.test.ts` already validates the archetype exists. Our test verifies the API layer on top of it — confirming the classification pipeline is wired correctly at every level.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: API verification tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/gateway/gm04-classification-api.test.ts
      2. Assert exit code 0
      3. Assert 4 test cases pass
    Expected Result: All API verification tests green
    Evidence: .sisyphus/evidence/task-8-tests-pass.txt

  Scenario: Full test suite still passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert exit code 0
    Expected Result: No regressions
    Evidence: .sisyphus/evidence/task-8-full-suite.txt
  ```

  **Commit**: YES (grouped with commit 5 or standalone)
  - Message: `test(api): verify guest-messaging classification pipeline endpoints`
  - Files: `tests/gateway/gm04-classification-api.test.ts`
  - Pre-commit: `pnpm test -- --run`

---

- [x] 9. Update story map + run full test suite + send notification

  **What to do**:
  - In `docs/2026-04-21-2202-phase1-story-map.md`, find the GM-04 section (lines 617-636)
  - Update all 6 acceptance criteria from `- [ ]` to `- [x]`:
    ```
    - [x] Every guest message is classified as `NEEDS_APPROVAL` or `NO_ACTION_NEEDED`
    - [x] Classification includes: confidence score (0.0-1.0), category (...), urgency flag (boolean), 1-sentence conversation summary
    - [x] Messages classified as `NO_ACTION_NEEDED` (...) are logged but not surfaced to PM
    - [x] Messages classified as `NEEDS_APPROVAL` get a drafted response
    - [x] Classification accuracy on VLRE test set: 90%+ agreement with what VLRE ops would classify manually
    - [x] **No false negatives on complaints**: Any message containing a complaint or issue must always be classified as `NEEDS_APPROVAL`
    ```
  - Run `pnpm build` and verify exit code 0
  - Run `pnpm test -- --run` and verify exit code 0
  - Run `pnpm prisma db seed` and verify exit code 0
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ GM-04 Message Classification Pipeline complete — all tasks done, come back to review results."`

  **Must NOT do**:
  - Do NOT modify any other story map sections (only GM-04 checkboxes)
  - Do NOT change the story text, attributes, or porting notes
  - Do NOT modify any code files in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation update + verification commands
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential, runs last)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 6, 7, 8

  **References**:

  **Pattern References**:
  - `docs/2026-04-21-2202-phase1-story-map.md:617-636` — The exact lines to update. Change `- [ ]` to `- [x]` for all 6 criteria.

  **WHY Each Reference Matters**:
  - This is the single source of truth for story completion status. Checking the boxes confirms GM-04 is done.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Story map GM-04 checkboxes all checked
    Tool: Bash (grep)
    Steps:
      1. Search docs/2026-04-21-2202-phase1-story-map.md for lines between "GM-04" header and next "---" separator
      2. Assert all 6 acceptance criteria lines start with "- [x]"
      3. Assert zero lines start with "- [ ]" in the GM-04 section
    Expected Result: All 6 checkboxes marked complete
    Evidence: .sisyphus/evidence/task-9-story-map-check.txt

  Scenario: Full build + test + seed verification
    Tool: Bash
    Steps:
      1. Run: pnpm build && echo "BUILD OK"
      2. Run: pnpm test -- --run && echo "TESTS OK"
      3. Run: pnpm prisma db seed && echo "SEED OK"
    Expected Result: All three pass
    Evidence: .sisyphus/evidence/task-9-full-verify.txt

  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ GM-04 Message Classification Pipeline complete — all tasks done, come back to review results."
      2. Assert exit code 0
    Expected Result: Notification delivered
    Evidence: .sisyphus/evidence/task-9-telegram.txt
  ```

  **Commit**: YES (commit 8)
  - Message: `docs(story-map): mark GM-04 acceptance criteria complete`
  - Files: `docs/2026-04-21-2202-phase1-story-map.md`
  - Pre-commit: —

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [9/9] | Must NOT Have [6/6] | Tasks [9/9] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS] | Files [5 clean / 2 minor issues] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [10/10 pass] | Integration [4/4] | Edge Cases [4 tested] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [9/9 compliant] | Contamination [CLEAN] | Unaccounted [1 file — justified compat fix] | VERDICT: APPROVE`

---

## Commit Strategy

| Order | Message                                                             | Files                                                     | Pre-commit           |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------- | -------------------- |
| 1     | `feat(classify): add parseClassifyResponse and ClassifyResult type` | `src/lib/classify-message.ts`                             | `pnpm build`         |
| 2     | `test(classify): add synthetic test fixture set`                    | `tests/fixtures/classification-test-set.ts`               | —                    |
| 3     | `feat(lifecycle): auto-complete NO_ACTION_NEEDED tasks`             | `src/inngest/employee-lifecycle.ts`                       | `pnpm build`         |
| 4     | `feat(seed): update STEP 4 for NO_ACTION_NEEDED info card`          | `prisma/seed.ts`                                          | `pnpm build`         |
| 5     | `test(classify): unit tests for parseClassifyResponse`              | `tests/lib/classify-message.test.ts`                      | `pnpm test -- --run` |
| 6     | `test(lifecycle): NO_ACTION_NEEDED auto-complete flow`              | `tests/inngest/employee-lifecycle-classification.test.ts` | `pnpm test -- --run` |
| 7     | `feat(scripts): add LLM classification accuracy benchmark`          | `scripts/benchmark-classifier.ts`                         | —                    |
| 8     | `docs(story-map): mark GM-04 acceptance criteria complete`          | `docs/2026-04-21-2202-phase1-story-map.md`                | —                    |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                              # Expected: exits 0
pnpm test -- --run                      # Expected: all pass (incl. new tests)
tsx scripts/benchmark-classifier.ts     # Expected: ≥90% accuracy, exit 0
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Benchmark ≥90% accuracy
- [ ] GM-04 story map checkboxes all checked
- [ ] `pnpm prisma db seed` runs without error
