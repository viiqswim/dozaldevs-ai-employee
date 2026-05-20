# Employee agents_md Standardization

## TL;DR

> **Quick Summary**: Fix contradictory/stale `agents_md` content across all 7 production AI employee archetypes. Standardize architecture: `instructions` = full workflow + submit-output.ts call, `agents_md` = identity + domain context + tool pointers only. Eliminates manual `/tmp/summary.txt` writing directives, invalid `APPROVED` classification values, and workflow duplication that caused the recent motivation-bot failure.
>
> **Deliverables**:
>
> - Updated `prisma/seed.ts` with corrected `agents_md` and `instructions` constants for 4 seeded employees
> - SQL UPDATEs for 3 DB-only employees
> - Live DB synced via seed + SQL
> - E2E validation of motivation-bot reaching Done
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (seed.ts) → T5 (apply seed + verify) → T6 (test/lint) → T7 (E2E) → F1-F4

---

## Context

### Original Request

Analyze everything injected into the `real-estate-motivation-bot` AI employee and find inconsistencies, contradictions, or things to improve — especially patterns like the recent bug where the model was writing to `/tmp/summary.txt` manually instead of using the `submit-output.ts` tool.

### Interview Summary

**Key Discussions**:

- Traced the full 6-layer injection pipeline (Platform Policy → Runtime Context → Tenant Conventions → Employee Instructions → Behavioral Rules → Employee Knowledge)
- Found `agents_md` for ALL 7 production employees contains stale manual file-writing directives
- Discovered 3 competing architecture patterns across employees (one-liner instructions, detailed instructions with duplicate agents_md, platform policy copy-paste in agents_md)
- User chose: standardize ALL production employees, E2E for motivation-bot only, skip test archetypes

**Research Findings**:

- `agents_md` appears LATER in AGENTS.md than platform policy — LLMs weight later context more heavily, so contradictions in `agents_md` override correct platform rules
- The `APPROVED` classification value used in 3 employees is rejected by `submit-output.ts` (exit code 1)
- Guest-messaging `agents_md` contains critical metadata field requirements (thread_uid, guest_name, etc.) that the approval card + delivery workflow depend on
- Schedule-generator-thornton has the entire platform AGENTS.md duplicated in its `agents_md` field
- 4 employees are in `prisma/seed.ts` (code-rotation, daily-summarizer x2, guest-messaging); 3 are DB-only

### Metis Review

**Identified Gaps** (addressed):

- Metis warned that seed.ts must be updated alongside SQL — otherwise DB reset re-introduces bugs. **Addressed**: seed.ts update is Task 1
- Metis flagged that Pattern A (one-liner instructions) is architecturally valid. **Decision**: user agreed to standardize all to "workflow in instructions, identity in agents_md" pattern regardless — this eliminates the root cause of contradictions between agents_md output format and platform policy §7
- Metis noted `APPROVED` classification is rejected by `submit-output.ts` — this is a latent bug in 3 employees. **Addressed**: all classification values fixed
- Metis warned guest-messaging metadata must be preserved. **Addressed**: metadata requirements move to instructions with `--metadata` flag syntax

---

## Work Objectives

### Core Objective

Eliminate ALL contradictions between employee `agents_md` fields and platform policy, and standardize the architecture so `agents_md` never contains workflow steps, output format instructions, or classification rules — those belong in `instructions`.

### Concrete Deliverables

- Updated `prisma/seed.ts` with new `agents_md` and `instructions` constants
- Live DB updated for all 7 production archetypes
- E2E evidence: motivation-bot reaching `Done` status

### Definition of Done

- [ ] Zero archetypes have manual `/tmp/summary.txt` write directives in `agents_md`
- [ ] Zero archetypes use `APPROVED` as a classification value anywhere
- [ ] Zero archetypes mention `/tmp/approval-message.json` in `agents_md`
- [ ] All `instructions` fields end with a `submit-output.ts` call
- [ ] `pnpm test -- --run` passes (same count as before)
- [ ] `pnpm lint` passes
- [ ] Motivation-bot E2E reaches `Done`

### Must Have

- Every production employee's `instructions` field contains the full workflow + final `submit-output.ts` call
- Every production employee's `agents_md` field contains ONLY: identity, domain context, and tool pointers
- Guest-messaging metadata requirements preserved in `instructions` (using `--metadata` flag)
- Guest-messaging approval card tool call (`post-guest-approval.ts`) preserved in `instructions`
- `prisma/seed.ts` updated for all 4 seeded employees
- SQL UPDATEs for all 3 DB-only employees
- Both DozalDevs and VLRE daily-summarizer archetypes updated

### Must NOT Have (Guardrails)

- Do NOT touch `delivery_instructions` field — different phase, separate file-write pattern, out of scope
- Do NOT touch `risk_model`, `model`, `deliverable_type`, `runtime`, `notification_channel`, or any field other than `instructions` and `agents_md`
- Do NOT touch the 3 test employees (task-2-evidence, test-draft-badge, test-evidence)
- Do NOT modify `src/workers/config/agents.md` (platform AGENTS.md — already correct)
- Do NOT modify `src/workers/opencode-harness.mts` or `src/workers/lib/agents-md-resolver.mts` — no code changes
- Do NOT modify `submit-output.ts` or any shell tool
- Do NOT modify `tool-usage-reference` SKILL.md
- Do NOT "improve" writing style or tone — content changes ONLY where bugs exist
- Do NOT add new workflow steps or capabilities not already present in the employee's current content
- Do NOT invent new tool references — only list tools the employee already uses
- Do NOT trigger guest-messaging, code-rotation, or daily-summarizer employees for E2E testing — production data risk

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (run existing suite to catch regressions from seed.ts changes)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **DB content**: Use `psql` queries to verify field contents
- **Seed consistency**: Run `pnpm prisma db seed` then re-query
- **E2E**: Use admin API to trigger task, poll for status

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — all content rewrites):
├── Task 1: Update seed.ts for 4 seeded employees [deep]
├── Task 2: Update motivation-bot agents_md via SQL [quick]
├── Task 3: Update cleaning-scheduler via SQL [quick]
└── Task 4: Update schedule-generator-thornton via SQL [quick]

Wave 2 (After Wave 1 — apply and verify):
├── Task 5: Apply seed to live DB + run verification queries [unspecified-high]
└── Task 6: Run test suite and linter [quick]

Wave 3 (After Wave 2 — E2E):
└── Task 7: Trigger motivation-bot E2E + verify Done [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T5 → T6 → T7 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task | Depends On     | Blocks |
| ---- | -------------- | ------ |
| T1   | —              | T5, T6 |
| T2   | —              | T5     |
| T3   | —              | T5     |
| T4   | —              | T5     |
| T5   | T1, T2, T3, T4 | T7     |
| T6   | T1             | T7     |
| T7   | T5, T6         | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `deep`, T2-T4 → `quick`
- **Wave 2**: 2 tasks — T5 → `unspecified-high`, T6 → `quick`
- **Wave 3**: 1 task — T7 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Update seed.ts — rewrite agents_md and instructions for 4 seeded employees

  **What to do**:

  Rewrite the 4 `agents_md` constants and their corresponding `instructions` constants in `prisma/seed.ts`. The new architecture: `agents_md` = identity + domain context + tool pointers ONLY; `instructions` = full workflow + classification rules + final `submit-output.ts` call.

  For each employee below, update the relevant constant AND ensure both the `create` and `update` blocks in the `upsert` call use the new constant.

  **A. `DOZALDEVS_SUMMARIZER_AGENTS_MD`** (line ~284):
  - REMOVE: Workflow steps, classification rules, output format instructions
  - KEEP: Identity sentence ("You are a daily Slack channel summarizer for DozalDevs")
  - ADD: Tool pointers with paths (`tsx /tools/slack/read-channels.ts`, `tsx /tools/slack/post-message.ts`, `tsx /tools/platform/submit-output.ts`), note to load `tool-usage-reference` skill
  - REMOVE the `APPROVED` classification value — it is INVALID

  **B. `DOZALDEVS_SUMMARIZER_INSTRUCTIONS`** (line ~227):
  - REPLACE the one-liner with full workflow:
    1. Read messages from configured source Slack channels for the past 24 hours
    2. Identify key discussions, decisions, and action items
    3. Draft a concise technical digest showing what the team shipped, discussed, and decided
    4. Post the summary to Slack using `tsx /tools/slack/post-message.ts` with `--thread-ts "$NOTIFY_MSG_TS"`
  - ADD classification rules: NEEDS_APPROVAL for summaries needing review, NO_ACTION_NEEDED if no messages. Confidence 0.9.
  - ADD final step: `tsx /tools/platform/submit-output.ts --summary "..." --classification "NEEDS_APPROVAL" --draft "<summary text>" --confidence 0.9`
  - Do NOT use `APPROVED` — only `NEEDS_APPROVAL` and `NO_ACTION_NEEDED` are valid

  **C. `VLRE_SUMMARIZER_AGENTS_MD`** (line ~301):
  - Same pattern as DozalDevs but with Papi Chulo identity ("You are Papi Chulo — a daily Slack channel summarizer for VLRE")
  - REMOVE: Workflow, classification rules, output format
  - KEEP: Identity + "dramatic Spanish news-anchor style" description
  - ADD: Tool pointers with paths, note to load `tool-usage-reference` skill

  **D. `VLRE_SUMMARIZER_INSTRUCTIONS`** (line ~230):
  - Same pattern as DozalDevs summarizer instructions but with "dramatic Spanish news-anchor style" in the drafting step

  **E. `GUEST_MESSAGING_AGENTS_MD`** (line ~233):
  - REMOVE: Workflow steps (1-5), classification rules, OUTPUT FORMAT section with JSON template
  - KEEP: Identity sentence ("You are a guest communication specialist for VLRE vacation rentals. Be casual and warm...")
  - KEEP: "Always match the guest's language (English or Spanish)"
  - ADD: Tool pointers with EXACT paths: `tsx /tools/hostfully/get-messages.ts`, `tsx /tools/hostfully/get-property.ts`, `tsx /tools/hostfully/get-reservations.ts`, `tsx /tools/sifely/*`, `tsx /tools/knowledge_base/search.ts`, `tsx /tools/slack/post-guest-approval.ts`, `tsx /tools/platform/submit-output.ts`
  - ADD: Note to load `tool-usage-reference` skill for exact CLI syntax

  **F. `VLRE_GUEST_MESSAGING_INSTRUCTIONS`** (line ~281):
  - REPLACE the one-liner with full workflow:
    1. Read full conversation thread (Hostfully get-messages.ts)
    2. Check property details and reservation info
    3. Search knowledge base for property-specific information
    4. If guest mentions access issues or lock problems, check lock status using Sifely tools
    5. Draft a warm, helpful response
  - ADD classification rules: NEEDS_APPROVAL if drafted response, NO_ACTION_NEEDED if resolved/no response needed. Confidence 0.9+ when clear, 0.5-0.8 when uncertain.
  - ADD CRITICAL approval card section: When classification is NEEDS_APPROVAL, MUST call `tsx /tools/slack/post-guest-approval.ts` with `--thread-ts "$NOTIFY_MSG_TS"`. Never omit --thread-ts. Never skip this tool call.
  - ADD final step with FULL metadata requirements:
    ```
    tsx /tools/platform/submit-output.ts \
      --summary "<one-sentence description>" \
      --classification "NEEDS_APPROVAL" \
      --draft "<full drafted response>" \
      --confidence 0.92 \
      --reasoning "<why this response>" \
      --metadata '{"guest_name":"...","property_name":"...","original_message":"...","thread_uid":"...","check_in":"YYYY-MM-DD","check_out":"YYYY-MM-DD","booking_channel":"AIRBNB or HOSTFULLY","lead_status":"INQUIRY or BOOKED","category":"amenities|access|checkin|checkout|general"}'
    ```
  - ADD: "IMPORTANT: The metadata fields are required for the approval workflow and delivery. thread_uid is critical — without it, the reply cannot be sent. Get from THREAD_UID env var or get-messages.ts output. If unknown, omit rather than guessing."

  **G. `CODE_ROTATION_AGENTS_MD`** (line ~318):
  - REMOVE: Workflow steps (1-8), classification rules
  - KEEP: Identity sentence ("You are the VLRE code rotation specialist")
  - ADD: Tool pointers with paths: `tsx /tools/sifely/*`, `tsx /tools/hostfully/*`, `tsx /tools/slack/post-message.ts`, `tsx /tools/platform/submit-output.ts`
  - ADD: Note to load `tool-usage-reference` skill

  **H. Code-rotation instructions** (line ~3358):
  - REPLACE the one-liner with full workflow:
    1. Get today's date
    2. Fetch all VLRE property IDs from the database
    3. For each property, check Hostfully for a guest checkout today — skip if none
    4. For each qualifying property, generate new memorable passcode and update Sifely lock
    5. Update Hostfully door code to match new passcode
    6. Process one at a time — never parallel (Sifely rate limits)
    7. If a single property fails, document error and continue
    8. Post rotation summary to Slack using `tsx /tools/slack/post-message.ts --thread-ts "$NOTIFY_MSG_TS"`
  - ADD classification rules: NO_ACTION_NEEDED if no checkouts today. NEEDS_APPROVAL if failures need human review. Confidence 0.9.
  - ADD final step: `tsx /tools/platform/submit-output.ts --summary "Rotated codes for X properties" --classification "NO_ACTION_NEEDED"` (or NEEDS_APPROVAL for failures)
  - Do NOT use `APPROVED` — only `NEEDS_APPROVAL` and `NO_ACTION_NEEDED` are valid

  **Must NOT do**:
  - Do NOT change any field other than the `agents_md` constant and `instructions` constant/inline value
  - Do NOT change `delivery_instructions`, `model`, `risk_model`, `notification_channel`, `tool_registry`, etc.
  - Do NOT add or remove upsert blocks
  - Do NOT change archetype IDs, tenant_ids, or department_ids
  - Do NOT touch the KB seed data (`VLRE_COMMON_KB_CONTENT` or any `knowledgeBaseEntry` blocks)
  - Do NOT use `APPROVED` as a classification value anywhere — only `NEEDS_APPROVAL` and `NO_ACTION_NEEDED`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Editing a large file (4000+ lines) with 8 content blocks to rewrite. Requires understanding domain context for each employee and preserving existing structure.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/seed.ts:233-279` — Current `GUEST_MESSAGING_AGENTS_MD` constant (the longest/most complex, contains metadata schema that must move to instructions)
  - `prisma/seed.ts:284-299` — Current `DOZALDEVS_SUMMARIZER_AGENTS_MD` (has invalid `APPROVED` classification on line 292)
  - `prisma/seed.ts:301-316` — Current `VLRE_SUMMARIZER_AGENTS_MD` (has invalid `APPROVED` on line 310)
  - `prisma/seed.ts:318-339` — Current `CODE_ROTATION_AGENTS_MD` (has invalid `APPROVED` on line 330)
  - `prisma/seed.ts:227-231` — Current summarizer instructions (one-liners to replace)
  - `prisma/seed.ts:281-282` — Current guest-messaging instructions (one-liner to replace)
  - `prisma/seed.ts:3355-3395` — Code-rotation upsert block (has inline instructions on line 3358-3359 and 3379-3380)

  **API/Type References**:
  - `src/worker-tools/platform/submit-output.ts` — The `submit-output.ts` tool: required flags are `--summary` and `--classification`, optional flags are `--draft`, `--confidence`, `--reasoning`, `--urgency`, `--metadata`

  **External References**:
  - `src/workers/config/agents.md:78-88` — Platform AGENTS.md §7 showing the submit-output.ts tool call pattern (the new standard all employees must follow)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify no APPROVED classification in seed.ts
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. Run: grep -n '"APPROVED"' prisma/seed.ts
      2. Assert: zero matches (exit code 1 from grep = no matches found)
    Expected Result: No occurrences of "APPROVED" as a classification value in seed.ts
    Failure Indicators: Any line containing "APPROVED" as a standalone classification value
    Evidence: .sisyphus/evidence/task-1-no-approved.txt

  Scenario: Verify no manual /tmp/summary.txt write in agents_md constants
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. Run: grep -n 'Write.*to.*/tmp/summary' prisma/seed.ts
      2. Run: grep -n 'write.*to.*/tmp/summary' prisma/seed.ts
      3. Assert: zero matches in agents_md constants (may appear in instructions as part of submit-output docs — that's OK)
    Expected Result: agents_md constants contain no manual file-write directives
    Evidence: .sisyphus/evidence/task-1-no-manual-write.txt

  Scenario: Verify all instructions have submit-output.ts
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. Search for each INSTRUCTIONS constant and verify it contains "submit-output"
      2. Check code-rotation inline instructions at lines ~3358 and ~3379
    Expected Result: All instruction fields reference submit-output.ts
    Evidence: .sisyphus/evidence/task-1-all-submit-output.txt

  Scenario: Verify guest-messaging metadata preserved
    Tool: Bash (grep)
    Preconditions: seed.ts has been edited
    Steps:
      1. Grep for "thread_uid" in the guest-messaging instructions
      2. Grep for "guest_name" in the guest-messaging instructions
      3. Grep for "post-guest-approval" in the guest-messaging instructions
    Expected Result: All three strings present in the new instructions
    Evidence: .sisyphus/evidence/task-1-gm-metadata.txt
  ```

  **Commit**: YES
  - Message: `fix(seed): standardize archetype agents_md and instructions — eliminate contradictions with platform policy`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm lint`

- [x] 2. Update real-estate-motivation-bot agents_md via SQL

  **What to do**:

  The `instructions` field for this employee is already correct (fixed in previous plan). Only `agents_md` needs rewriting — it contains stale workflow with invalid `APPROVED` classification and manual file-writing directives.

  Execute a SQL UPDATE to replace `agents_md` with identity + tool pointers only:

  ```sql
  UPDATE archetypes
  SET agents_md = 'You are a motivational content creator for a real estate investment and short-term rental business team. Your messages should resonate with property owners, investors, and renovation professionals — covering themes like market resilience, property value creation, tenant satisfaction, and scaling operations.

  TOOLS RELEVANT TO YOUR JOB:
  - Slack messaging: tsx /tools/slack/post-message.ts — post motivational messages to team channels
  - Output submission: tsx /tools/platform/submit-output.ts — submit task output (required as final step)
  Load the tool-usage-reference skill for exact CLI syntax and flags.',
      updated_at = NOW()
  WHERE role_name = 'real-estate-motivation-bot' AND deleted_at IS NULL;
  ```

  Then verify by querying back the updated content.

  **Must NOT do**:
  - Do NOT change `instructions` (already correct from previous fix)
  - Do NOT change any other field
  - Do NOT add this employee to seed.ts (it's DB-only by design)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single SQL UPDATE with pre-written content
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - DB query: `psql postgresql://postgres:postgres@localhost:54322/ai_employee` — connection string for local DB
  - Previous fix context: motivation-bot instructions already contain the correct submit-output.ts call from the `2026-05-19-1951-submit-output-tool` plan

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify agents_md no longer has APPROVED or manual file writing
    Tool: Bash (psql)
    Preconditions: SQL UPDATE executed
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT agents_md FROM archetypes WHERE role_name = 'real-estate-motivation-bot' AND deleted_at IS NULL;"
      2. Assert: output does NOT contain "APPROVED", "/tmp/summary.txt", "/tmp/approval-message.json", "WORKFLOW:", or "CLASSIFICATION RULES:"
      3. Assert: output DOES contain "submit-output.ts" and "tool-usage-reference"
    Expected Result: Clean agents_md with identity + tools only
    Evidence: .sisyphus/evidence/task-2-motivation-bot-agents-md.txt

  Scenario: Verify instructions unchanged
    Tool: Bash (psql)
    Preconditions: SQL UPDATE executed
    Steps:
      1. Run: psql ... -c "SELECT instructions FROM archetypes WHERE role_name = 'real-estate-motivation-bot' AND deleted_at IS NULL;"
      2. Assert: output contains "submit-output.ts" and "NO_ACTION_NEEDED"
    Expected Result: instructions field unchanged from previous fix
    Evidence: .sisyphus/evidence/task-2-motivation-bot-instructions.txt
  ```

  **Commit**: NO (DB-only change)

- [x] 3. Update hostfully-cleaning-scheduler via SQL

  **What to do**:

  This employee has workflow in BOTH `agents_md` and `instructions`, creating duplication. Its `agents_md` also tells the model to write `/tmp/approval-message.json`. Fix both fields.

  **Step 1: Rewrite `agents_md`** to identity + tool pointers only:

  ```
  You are a cleaning schedule coordinator that integrates Hostfully booking data with staff availability to create optimized daily cleaning schedules.

  TOOLS RELEVANT TO YOUR JOB:
  - Hostfully reservations: tsx /tools/hostfully/get-reservations.ts — fetch confirmed bookings
  - Hostfully property: tsx /tools/hostfully/get-property.ts — get property details and locations
  - Slack messaging: tsx /tools/slack/post-message.ts — post schedule notifications
  - Output submission: tsx /tools/platform/submit-output.ts — submit task output (required as final step)
  Load the tool-usage-reference skill for exact CLI syntax and flags.
  ```

  **Step 2: Append `submit-output.ts` call to existing `instructions`** — the current instructions already have a good workflow but are missing the final submit-output step. Append:

  ```

  CLASSIFICATION RULES:
  - Use NO_ACTION_NEEDED if there are no confirmed bookings requiring cleaning on {{check_date}}.
  - Use NEEDS_APPROVAL if the schedule is complete or if there are unassigned properties/conflicts.

  FINAL STEP (MANDATORY):
  tsx /tools/platform/submit-output.ts \
    --summary "Cleaning schedule for {{check_date}}: X properties, Y staff assigned" \
    --classification "NEEDS_APPROVAL" \
    --confidence 0.85 \
    --draft "<formatted schedule summary>" \
    --metadata '{"check_date":"{{check_date}}","properties_count":N,"staff_assigned":N,"unassigned":[],"conflicts":[]}'
  ```

  Execute both as a single SQL UPDATE.

  **Must NOT do**:
  - Do NOT change `delivery_instructions` or any other field
  - Do NOT add this employee to seed.ts (DB-only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: SQL UPDATE with pre-written content
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - DB query: `psql postgresql://postgres:postgres@localhost:54322/ai_employee` — current `agents_md` is 2563 chars with full workflow + `/tmp/approval-message.json` reference
  - Current `instructions`: 438 chars with template vars `{{check_date}}` and `{{notion_workspace_url}}`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify agents_md cleaned and instructions updated
    Tool: Bash (psql)
    Steps:
      1. Query agents_md — assert: no "WORKFLOW:", no "/tmp/summary", no "/tmp/approval-message"
      2. Query instructions — assert: contains "submit-output.ts", contains "{{check_date}}" (template var preserved)
    Expected Result: Clean separation — agents_md has identity, instructions has workflow
    Evidence: .sisyphus/evidence/task-3-cleaning-scheduler.txt
  ```

  **Commit**: NO (DB-only change)

- [x] 4. Update schedule-generator-thornton agents_md via SQL

  **What to do**:

  This employee's `agents_md` (5213 chars) contains the ENTIRE platform AGENTS.md (sections 1-6) duplicated, causing the model to see the platform policy TWICE. The `instructions` field is very long (7986 chars) but does NOT include a `submit-output.ts` call.

  **Step 1: Read the current `agents_md`** to identify what content is employee-specific vs duplicated platform policy. Remove all sections that duplicate `src/workers/config/agents.md` (Source Access, Patch Permission, Smoke Test, Issue Reporting, Platform Code Off-Limits, Database Access, Summary).

  **Step 2: Rewrite `agents_md`** keeping ONLY:
  - Identity: whatever employee-specific identity exists
  - Domain context: any domain-specific content not duplicated from platform policy
  - Tool pointers with paths
  - Note to load `tool-usage-reference` skill

  **Step 3: Append `submit-output.ts` call to `instructions`** — add a final step section:

  ```

  FINAL STEP (MANDATORY):
  tsx /tools/platform/submit-output.ts \
    --summary "<what was accomplished>" \
    --classification "NEEDS_APPROVAL" \
    --draft "<schedule output>" \
    --confidence 0.85
  ```

  **Must NOT do**:
  - Do NOT rewrite the full 7986-char instructions — only APPEND the submit-output section
  - Do NOT change any other field

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: SQL UPDATE with reading + content extraction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:
  - DB: `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT agents_md FROM archetypes WHERE role_name = 'schedule-generator-thornton' AND deleted_at IS NULL;"`
  - Platform AGENTS.md: `src/workers/config/agents.md` — the content that is duplicated in this employee's agents_md

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Verify platform policy no longer duplicated
    Tool: Bash (psql)
    Steps:
      1. Query agents_md — assert: does NOT contain "Source Access Permission", "Patch Permission", "Smoke Test", "Platform Code Is Off-Limits"
      2. Query instructions — assert: contains "submit-output.ts"
    Expected Result: agents_md is concise identity+tools, instructions has submit-output
    Evidence: .sisyphus/evidence/task-4-schedule-generator.txt
  ```

  **Commit**: NO (DB-only change)

- [x] 5. Apply seed to live DB + run verification queries

  **What to do**:

  After Tasks 1-4 complete, apply the seed.ts changes to the live database and verify ALL 7 production archetypes are correct.

  **Step 1**: Run `pnpm prisma db seed` to apply seed.ts changes to the 4 seeded employees in the live DB.

  **Step 2**: Run verification queries against ALL 7 production employees:

  ```sql
  -- Q1: No APPROVED classification in agents_md
  SELECT role_name FROM archetypes
  WHERE agents_md LIKE '%"APPROVED"%' AND deleted_at IS NULL;
  -- Expected: 0 rows

  -- Q2: No manual /tmp/summary.txt write in agents_md
  SELECT role_name FROM archetypes
  WHERE (agents_md LIKE '%Write%/tmp/summary%' OR agents_md LIKE '%write%/tmp/summary%')
  AND deleted_at IS NULL;
  -- Expected: 0 rows

  -- Q3: No /tmp/approval-message.json in agents_md
  SELECT role_name FROM archetypes
  WHERE agents_md LIKE '%/tmp/approval-message%' AND deleted_at IS NULL;
  -- Expected: 0 rows

  -- Q4: All production employees have submit-output in instructions
  SELECT role_name FROM archetypes
  WHERE role_name IN ('code-rotation','daily-summarizer','guest-messaging','hostfully-cleaning-scheduler','real-estate-motivation-bot','schedule-generator-thornton')
  AND instructions NOT LIKE '%submit-output%' AND deleted_at IS NULL;
  -- Expected: 0 rows

  -- Q5: No WORKFLOW: section in agents_md (workflow should be in instructions)
  SELECT role_name FROM archetypes
  WHERE role_name IN ('code-rotation','daily-summarizer','guest-messaging','hostfully-cleaning-scheduler','real-estate-motivation-bot','schedule-generator-thornton')
  AND agents_md LIKE '%WORKFLOW:%' AND deleted_at IS NULL;
  -- Expected: 0 rows

  -- Q6: Guest-messaging instructions has metadata requirements
  SELECT CASE WHEN instructions LIKE '%thread_uid%' AND instructions LIKE '%guest_name%' AND instructions LIKE '%post-guest-approval%' THEN 'PASS' ELSE 'FAIL' END
  FROM archetypes WHERE role_name = 'guest-messaging' AND deleted_at IS NULL;
  -- Expected: PASS
  ```

  **Step 3**: For each verification query, save the output to evidence files.

  **Must NOT do**:
  - Do NOT run seed if Tasks 1-4 are not complete
  - Do NOT modify any files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step verification with DB queries and seed application
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1, parallel with Task 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:
  - Seed command: `pnpm prisma db seed`
  - DB connection: `postgresql://postgres:postgres@localhost:54322/ai_employee`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 6 verification queries pass
    Tool: Bash (psql)
    Steps:
      1. Run Q1-Q6 as defined above
      2. Assert all return expected results
    Expected Result: 0 rows for Q1-Q5, PASS for Q6
    Evidence: .sisyphus/evidence/task-5-verification-queries.txt

  Scenario: Seed applies without errors
    Tool: Bash
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exit code 0, no error output
    Expected Result: Seed completes successfully
    Evidence: .sisyphus/evidence/task-5-seed-output.txt
  ```

  **Commit**: NO

- [x] 6. Run test suite and linter

  **What to do**:

  Verify seed.ts changes don't break anything.
  1. Run `pnpm test -- --run` — expected: same pass count as before, no new failures
  2. Run `pnpm lint` — expected: 0 errors

  Note: There are ~18 pre-existing test failures (container-boot.test.ts, inngest-serve.test.ts). These are NOT regressions.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two commands, pass/fail check
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (parallel with Task 5)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:
  - Pre-existing failures: `container-boot.test.ts` (Docker socket), `inngest-serve.test.ts` (function count mismatch)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Test suite passes
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: exit code 0 or only pre-existing failures
    Expected Result: No new failures introduced
    Evidence: .sisyphus/evidence/task-6-test-results.txt

  Scenario: Linter passes
    Tool: Bash
    Steps:
      1. Run: pnpm lint
      2. Assert: exit code 0
    Expected Result: Zero lint errors
    Evidence: .sisyphus/evidence/task-6-lint-results.txt
  ```

  **Commit**: NO

- [x] 7. Trigger motivation-bot E2E and verify Done status

  **What to do**:

  Trigger the `real-estate-motivation-bot` employee and verify it reaches `Done` status — confirming the new `agents_md` doesn't break anything (since `instructions` was already proven working).

  **Step 1**: Ensure Docker image is current. The worker code hasn't changed, but verify:

  ```bash
  docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
  ```

  If the image is from before the previous plan's Task 7, rebuild: `docker build -t ai-employee-worker:latest .`

  **Step 2**: Verify services are running:

  ```bash
  curl -s http://localhost:7700/health
  curl -s http://localhost:8288/health
  ```

  **Step 3**: Trigger the employee:

  ```bash
  curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
    "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/real-estate-motivation-bot/trigger" \
    -H "Content-Type: application/json" -d '{}'
  ```

  **Step 4**: Poll task status until terminal state:

  ```bash
  # Get task_id from trigger response
  curl -H "X-Admin-Key: $ADMIN_API_KEY" \
    "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/tasks/$TASK_ID"
  ```

  **Step 5**: Verify final status is `Done` (not `Failed`).

  **Must NOT do**:
  - Do NOT trigger any other employee (guest-messaging, code-rotation, daily-summarizer) — production data risk
  - Do NOT run this before Tasks 5 and 6 pass

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E flow with Docker check, API calls, and polling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Wave 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 5, 6

  **References**:
  - Tenant ID: `00000000-0000-0000-0000-000000000003` (VLRE)
  - Previous E2E evidence: Task runs `9e918881` and `3f03fb1a` both reached `Done` in previous plan

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Motivation-bot reaches Done
    Tool: Bash (curl)
    Preconditions: Services running (gateway :7700, Inngest :8288), Docker image built
    Steps:
      1. Trigger: POST /admin/tenants/.../employees/real-estate-motivation-bot/trigger
      2. Extract task_id from response
      3. Poll task status every 30s for up to 10 minutes
      4. Assert: final status is "Done"
    Expected Result: Task reaches Done status
    Failure Indicators: Status is "Failed", or timeout after 10 minutes
    Evidence: .sisyphus/evidence/task-7-e2e-done.txt

  Scenario: Task used submit-output tool (not manual file write)
    Tool: Bash (psql)
    Preconditions: Task reached Done
    Steps:
      1. Query task_status_log for the task_id: SELECT * FROM task_status_log WHERE task_id = '<TASK_ID>' ORDER BY created_at;
      2. Verify the task progressed through: Received → Ready → Executing → Submitting → Done
    Expected Result: Clean lifecycle progression without Failed states
    Evidence: .sisyphus/evidence/task-7-lifecycle-trace.txt
  ```

  **Commit**: NO

- [ ] 8. Notify completion via Telegram

  **What to do**:
  Send Telegram notification that the plan is complete.

  ```bash
  tsx scripts/telegram-notify.ts "📋 employee-agents-md-standardization complete — All archetype agents_md fields standardized. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: F1-F4 (after user okay)

  **Acceptance Criteria**:

  ```
  Scenario: Notification sent
    Tool: Bash
    Steps:
      1. Run the tsx command above
      2. Assert: exit code 0
    Expected Result: Telegram message delivered
    Evidence: .sisyphus/evidence/task-8-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (query DB, read seed.ts). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + `pnpm lint`. Review all changed files in seed.ts for: TypeScript errors, template literal issues, escaping problems, unterminated strings. Verify all agents_md constants are valid string literals.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Query EVERY production archetype from the live DB. For each: verify agents_md has NO workflow steps, NO manual file-writing, NO `APPROVED` classification. Verify instructions has workflow + submit-output.ts call. Verify guest-messaging instructions preserves metadata requirements. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Archetypes [N/N clean] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify ONLY `instructions` and `agents_md` fields were changed. Verify no other archetype fields modified. Verify test employees untouched. Verify no code files modified except seed.ts. Verify DB-only employees not added to seed.ts.
      Output: `Fields [CLEAN/N issues] | Scope [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

| Task(s) | Commit Message                                                                                                | Files            | Pre-commit  |
| ------- | ------------------------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| T1      | `fix(seed): standardize archetype agents_md and instructions — eliminate contradictions with platform policy` | `prisma/seed.ts` | `pnpm lint` |
| T2-T4   | No commit — DB-only changes                                                                                   | —                | —           |
| T5-T7   | No commit — verification tasks                                                                                | —                | —           |

---

## Success Criteria

### Verification Commands

```bash
# No APPROVED classification in any agents_md
psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT role_name FROM archetypes WHERE agents_md LIKE '%\"APPROVED\"%' AND deleted_at IS NULL;"
# Expected: 0 rows

# No manual /tmp/summary.txt write directives in agents_md
psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT role_name FROM archetypes WHERE agents_md LIKE '%Write%/tmp/summary%' AND agents_md NOT LIKE '%submit-output%' AND deleted_at IS NULL;"
# Expected: 0 rows

# No /tmp/approval-message.json in agents_md
psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT role_name FROM archetypes WHERE agents_md LIKE '%/tmp/approval-message%' AND deleted_at IS NULL;"
# Expected: 0 rows

# All instructions have submit-output
psql postgresql://postgres:postgres@localhost:54322/ai_employee -t -c "SELECT role_name FROM archetypes WHERE role_name IN ('code-rotation','daily-summarizer','guest-messaging','hostfully-cleaning-scheduler','real-estate-motivation-bot','schedule-generator-thornton') AND instructions NOT LIKE '%submit-output%' AND deleted_at IS NULL;"
# Expected: 0 rows

# Test suite passes
pnpm test -- --run
# Expected: same pass count as before (no regressions)

# Lint passes
pnpm lint
# Expected: 0 errors
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Motivation-bot E2E reaches Done
