# Guest-Messaging Recreation: Wizard Generator Overhaul + E2E Verification

## TL;DR

> **Quick Summary**: Overhaul the employee creation wizard's archetype generator so it produces correct, production-ready employees on the first try — then validate by recreating the guest-messaging employee entirely through the wizard and verifying the full Airbnb → Hostfully → Webhook → Lifecycle → Slack Approval → Delivery pipeline end-to-end.
>
> **Deliverables**:
>
> - Archetype generator upgraded: tool catalog injection, env var docs, delivery templates, approval patterns
> - Guest-messaging employee recreated via the wizard (no manual PATCH fixes)
> - Old broken archetype soft-deleted
> - Full E2E verified: Airbnb message → Hostfully webhook → task → approval card → delivery → Done
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: T1 → T3/T4/T5 → T6 → T7 → T8 → T10 → T11 → T12 → F1-F4

---

## Context

### Original Request

The guest-messaging AI employee was built before the platform shifted to the 3-field architecture. The old archetype uses dropped DB columns and produces an incomplete AGENTS.md. The user wants to recreate it by entering a simple description in the wizard — and have the wizard produce a correct, working employee without manual fixes afterward.

### Interview Summary

**Key Discussions**:

- **Approach**: Wizard First + Compare — but fix the wizard itself when it gets things wrong, not just patch the individual archetype
- **Trigger**: Webhook ONLY — no polling cron. `trigger_sources: { type: 'webhook' }`
- **Enrichment**: Skip — no enrichment adapter on the new archetype
- **Generator scope**: Full overhaul — tool catalog injection, env var docs, Hostfully delivery template, approval card pattern, metadata contract
- **E2E test**: Full Airbnb → Hostfully → Webhook flow using Playwright and the owner's test account (Olivia)
- **Genericity**: All generator improvements must be generic enough to help future employees, not just guest-messaging

**Research Findings**:

- The generator's LLM has NO knowledge of available tools — it guesses tool paths from the description
- A tool discovery system (`GET /admin/tools`) already exists but is not wired to the generator
- The generator only knows 3 tool examples (Slack read-channel, post-message, submit-output)
- Hostfully tools, Sifely tools, knowledge base search, and the approval card tool are completely unknown to it
- The delivery template in the prompt is Slack-only — no Hostfully delivery pattern
- Lifecycle-injected env vars (LEAD_UID, THREAD_UID, etc.) are not documented in the generator prompt
- Test resources: Airbnb test account (Olivia), real Hostfully thread/lead/property UIDs

### Metis Review (from v1)

**Gaps addressed in v2**:

- Dual active archetype race condition: soft-delete old BEFORE activating new
- Tool registry verification: now solved at the generator level, not via manual PATCH
- Live DB as source of truth: Task 1 reads live DB for reference

---

## Work Objectives

### Core Objective

Upgrade the archetype generator to produce correct employees from simple descriptions, then prove it by recreating guest-messaging entirely through the wizard and running a full E2E test.

### Concrete Deliverables

- Generator upgraded with tool catalog, env vars, delivery templates, approval patterns
- New guest-messaging archetype created via wizard, status `active`, no manual PATCH fixes
- Old archetype (`00000000-0000-0000-0000-000000000015`) soft-deleted
- Full E2E: Airbnb message (Olivia) → Hostfully webhook → task → approval → Hostfully delivery → Done

### Definition of Done

- [ ] Wizard generates a guest-messaging employee with all 10 correct tools, proper execution_steps, and proper delivery_steps — from a simple description only
- [ ] Exactly 1 active `guest-messaging` archetype for VLRE tenant
- [ ] Triggered task (via real Airbnb message) reaches `Done` after approval
- [ ] `pnpm build` and `pnpm test -- --run` pass

### Must Have

- Tool catalog injected into generator prompt (all available tools with descriptions and flags)
- Lifecycle env vars documented in generator prompt (LEAD_UID, THREAD_UID, PROPERTY_UID, NOTIFY_MSG_TS, TASK_ID)
- Hostfully delivery template alongside Slack delivery template
- Approval card pattern (post-guest-approval.ts with key flags)
- submit-output --metadata contract for complex employees
- New archetype with `trigger_sources: { type: 'webhook' }`
- Working end-to-end lifecycle from Airbnb message to Hostfully delivery

### Must NOT Have (Guardrails)

- **No manual PATCH fixes to the archetype** — the wizard must produce a correct employee
- **No polling cron** — trigger_sources must be `{ type: 'webhook' }`, not `cron_and_webhook`
- **No enrichment adapter** — skip enrichment
- **No seed file changes** — leave old seed as-is
- **No changes to webhook handler** (`src/gateway/routes/hostfully.ts`)
- **No changes to lifecycle** (`src/inngest/employee-lifecycle.ts`)
- **No guest-messaging-specific hardcoding in the generator** — all improvements must be generic
- **No breaking existing simple employee generation** — the generator must still work for basic Slack employees

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests after implementation)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

- **Generator changes**: Vitest unit tests for new prompt sections
- **Wizard flow**: Playwright browser automation
- **E2E lifecycle**: Playwright (Airbnb) + curl (webhook) + psql (state) + Playwright (Slack approval)
- Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — research):
├── Task 1: Read live DB archetype as source of truth [quick]
├── Task 2: Discover all tools via admin tools API [quick]

Wave 2 (After Wave 1 — generator overhaul, MAX PARALLEL):
├── Task 3: Inject tool catalog into generator prompt [deep]
├── Task 4: Add env var docs + approval pattern + metadata contract to prompt [deep]
├── Task 5: Add Hostfully delivery template to prompt [unspecified-high]

Wave 3 (After Wave 2 — validation):
├── Task 6: Run wizard with simple description + verify output quality [deep]
├── Task 7: Add tests for generator improvements [unspecified-high]

Wave 4 (After Wave 3 — cutover):
├── Task 8: Soft-delete old archetype [quick]
├── Task 9: Activate new archetype [quick]

Wave 5 (After Wave 4 — E2E verification):
├── Task 10: Build Docker image [quick]
├── Task 11: Full E2E: Airbnb → Hostfully → Webhook → Approval → Delivery [deep]
├── Task 12: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks     | Wave |
| ---- | ---------- | ---------- | ---- |
| 1    | —          | 3, 4, 5, 6 | 1    |
| 2    | —          | 3, 4, 5    | 1    |
| 3    | 1, 2       | 6          | 2    |
| 4    | 1, 2       | 6          | 2    |
| 5    | 1, 2       | 6          | 2    |
| 6    | 3, 4, 5    | 7, 8       | 3    |
| 7    | 3, 4, 5    | —          | 3    |
| 8    | 6          | 9          | 4    |
| 9    | 8          | 10, 11     | 4    |
| 10   | 9          | 11         | 5    |
| 11   | 10         | 12         | 5    |
| 12   | 11         | F1-F4      | 5    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 `quick`, T2 `quick`
- **Wave 2**: 3 tasks — T3 `deep`, T4 `deep`, T5 `unspecified-high`
- **Wave 3**: 2 tasks — T6 `deep`, T7 `unspecified-high`
- **Wave 4**: 2 tasks — T8 `quick`, T9 `quick`
- **Wave 5**: 3 tasks — T10 `quick`, T11 `deep`, T12 `quick`
- **FINAL**: 4 tasks — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Read Live DB Archetype as Source of Truth

  **What to do**:
  - Query live DB: `SELECT row_to_json(a) FROM archetypes a WHERE id = '00000000-0000-0000-0000-000000000015';`
  - Save to `.sisyphus/evidence/task-1-live-archetype.json`
  - Extract: `execution_instructions`, `delivery_instructions`, `tool_registry`, `risk_model`, `trigger_sources`, `notification_channel`, `concurrency_limit`
  - This becomes the reference for evaluating whether the wizard-generated archetype is correct

  **Must NOT do**: Do not modify any DB records or source files

  **Recommended Agent Profile**:
  - **Category**: `quick` — Single DB query + file save
  - **Skills**: []

  **Parallelization**: Wave 1, parallel with Task 2. **Blocks**: 3, 4, 5, 6. **Blocked By**: None

  **References**:
  - `prisma/seed.ts:3252-3344` — Seed constants to compare against live DB for drift detection

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Read and save live archetype
    Tool: Bash (psql)
    Steps:
      1. psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT row_to_json(a) FROM archetypes a WHERE id = '00000000-0000-0000-0000-000000000015';" -t > .sisyphus/evidence/task-1-live-archetype.json
      2. Assert: JSON contains "execution_instructions", "delivery_instructions", "tool_registry"
    Expected Result: JSON file saved with all archetype fields
    Evidence: .sisyphus/evidence/task-1-live-archetype.json
  ```

  **Commit**: NO

- [x] 2. Discover All Tools via Admin Tools API

  **What to do**:
  - Call `GET /admin/tools` to get the full tool catalog with parsed metadata
  - Save to `.sisyphus/evidence/task-2-tool-catalog.json`
  - Also read `src/gateway/services/tool-parser.ts` to understand how `discoverTools()` works — this function will be called from the generator in Task 3
  - Document the output format: each tool has `containerPath`, `description`, `flags` (with `name`, `type`, `required`, `description`), `envVars`, `outputShape`

  **Must NOT do**: Do not modify any source files

  **Recommended Agent Profile**:
  - **Category**: `quick` — API call + file read
  - **Skills**: []

  **Parallelization**: Wave 1, parallel with Task 1. **Blocks**: 3, 4, 5. **Blocked By**: None

  **References**:
  - `src/gateway/services/tool-parser.ts` — `discoverTools()` function. This is what we'll call from the generator.
  - `src/gateway/routes/admin-tools.ts` — Route handler for `GET /admin/tools`. Shows how tool metadata is formatted.

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Fetch tool catalog
    Tool: Bash (curl)
    Steps:
      1. source .env
      2. curl -s "http://localhost:7700/admin/tools" -H "X-Admin-Key: $ADMIN_API_KEY" | jq '.' > .sisyphus/evidence/task-2-tool-catalog.json
      3. Assert: JSON array with at least 10 tools
      4. Assert: each tool has "containerPath", "description", "flags"
    Expected Result: Full tool catalog saved
    Evidence: .sisyphus/evidence/task-2-tool-catalog.json
  ```

  **Commit**: NO

- [x] 3. Inject Tool Catalog into Generator Prompt

  **What to do**:
  - In `src/gateway/services/archetype-generator.ts`, modify the `generate()` function to:
    1. Call `discoverTools()` from `tool-parser.ts` before calling the LLM
    2. Format the tool catalog as a section in the system prompt or user message
    3. Format: for each tool, include `containerPath`, description, and required flags with descriptions
  - In `src/gateway/routes/admin-archetype-generate.ts`, pass the tool catalog to the generator if needed
  - The tool catalog section should be appended to SYSTEM_PROMPT dynamically, not hardcoded
  - Format example:

    ```
    ## Available Tools
    The following tools are available in the worker container. Use ONLY these paths — do not invent tool paths.

    ### /tools/hostfully/get-messages.ts
    Description: Fetch conversation messages for a Hostfully lead
    Flags: --thread-uid (required), --lead-id (optional), --limit (optional, default 50)

    ### /tools/slack/post-guest-approval.ts
    Description: Post a guest message approval card to Slack
    Flags: --channel (required), --task-id (required), --guest-name (required), ...
    ```

  - **CRITICAL**: The tool catalog must be generic — it comes from `discoverTools()`, not hardcoded tool lists. Any new tool added to `src/worker-tools/` will automatically appear.
  - Update the SYSTEM_PROMPT instruction about tool_registry to say: "list tools from the Available Tools section. Do NOT invent tool paths. ALWAYS include /tools/platform/submit-output.ts"

  **Must NOT do**:
  - Do not hardcode tool lists — use `discoverTools()` dynamically
  - Do not add guest-messaging-specific content to the prompt
  - Do not change the LLM model or temperature

  **Recommended Agent Profile**:
  - **Category**: `deep` — Complex prompt engineering + function wiring
  - **Skills**: []

  **Parallelization**: Wave 2, parallel with Tasks 4, 5. **Blocks**: 6. **Blocked By**: 1, 2

  **References**:
  - `src/gateway/services/archetype-generator.ts` — SYSTEM_PROMPT constant (lines 52-196), `generate()` function. The SYSTEM_PROMPT currently says "list the actual shell tool paths that will be used" but provides no catalog.
  - `src/gateway/services/tool-parser.ts` — `discoverTools()` returns `ToolMetadata[]` with containerPath, description, flags, envVars, outputShape. This is the data source.
  - `src/gateway/routes/admin-archetype-generate.ts` — Route handler that calls `generator.generate()`. May need to pass tool catalog as parameter.
  - `.sisyphus/evidence/task-2-tool-catalog.json` — The actual tool catalog output for reference on format.

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tool catalog appears in generation prompt
    Tool: Bash (curl)
    Steps:
      1. source .env
      2. Call the generate endpoint with a test description and log the request
      3. Verify the generated archetype has tool_registry.tools populated with real tool paths (not invented ones)
      4. Specifically check: the generated tool_registry should NOT contain paths like "/tools/hostfully/get-door-code.ts" if that tool doesn't exist
    Expected Result: tool_registry only contains paths from the real catalog
    Evidence: .sisyphus/evidence/task-3-generation-test.json

  Scenario: Build passes
    Tool: Bash
    Steps: pnpm build
    Expected Result: 0 errors
    Evidence: .sisyphus/evidence/task-3-build.txt
  ```

  **Commit**: YES (grouped with Tasks 4, 5)
  - Message: `feat(archetype-generator): inject tool catalog, env vars, delivery templates, and approval patterns`
  - Files: `src/gateway/services/archetype-generator.ts`, `src/gateway/routes/admin-archetype-generate.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Add Env Var Mechanism + Approval Pattern + Metadata Contract to Prompt

  **What to do**:
  - Add a new section to SYSTEM_PROMPT documenting the **env var injection mechanism** (not specific variable names):

    ```
    ## Environment Variables

    ### Always Available (every employee, every trigger type)
    - $TASK_ID — unique task identifier
    - $NOTIFY_MSG_TS — Slack thread timestamp for the "Task received" notification. Use with --thread-ts flag to post replies in the same thread.
    - $NOTIFICATION_CHANNEL — Slack channel for notifications (from archetype config)

    ### Webhook-Triggered Employees
    When an employee is triggered by a webhook, ALL fields from the webhook payload
    are automatically uppercased and injected as environment variables.
    For example, if a webhook sends { "lead_uid": "abc", "thread_uid": "def" },
    the worker receives $LEAD_UID and $THREAD_UID.
    Infer which variables will be available from the employee description and
    reference them with $VAR_NAME syntax in execution_steps.
    ```

  - Add approval pattern to SYSTEM_PROMPT (generic mechanism, not specific tools):
    ```
    ## Approval Flow Pattern
    When the employee produces content requiring human approval (NEEDS_APPROVAL)
    and a specialized approval tool exists for this domain (check Available Tools),
    call that approval tool BEFORE submit-output.ts. The approval tool writes
    /tmp/approval-message.json. Then call submit-output.ts with --classification NEEDS_APPROVAL.
    If no specialized approval tool exists, just call submit-output.ts directly.
    ```
  - Add metadata contract to SYSTEM_PROMPT (generic pattern):
    ```
    ## Passing Data to the Delivery Phase
    If the delivery phase needs identifiers from the execution phase (e.g. external
    system IDs, recipient info), include --metadata with a JSON object in the
    submit-output call. The delivery container receives this in <approved-content>.metadata.
    Decide what to include based on what the delivery step needs to complete its work.
    ```

  **Must NOT do**:
  - Do not list webhook-specific variable names (like LEAD_UID, THREAD_UID) as always-available — they come from the webhook payload, and the LLM should infer them from the description
  - Do not reference specific approval tools by name — the LLM should pick the right one from the Available Tools catalog (Task 3)
  - Do not add guest-messaging-specific instructions
  - Do not change the existing Slack-focused examples — add alongside them

  **Recommended Agent Profile**:
  - **Category**: `deep` — Prompt engineering with careful wording for genericity
  - **Skills**: []

  **Parallelization**: Wave 2, parallel with Tasks 3, 5. **Blocks**: 6. **Blocked By**: 1, 2

  **References**:
  - `src/gateway/services/archetype-generator.ts` — SYSTEM_PROMPT lines 52-196. Look at existing instruction style and add new sections matching the same tone.
  - `src/workers/opencode-harness.mts` — How env vars are injected (confirms LEAD_UID, THREAD_UID, etc.)
  - `src/worker-tools/platform/submit-output.ts` — The --metadata flag definition and behavior
  - `src/worker-tools/slack/post-guest-approval.ts` — The approval card tool as an example of the pattern

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Env var docs present in prompt
    Tool: Bash (grep)
    Steps:
      1. grep -c "LEAD_UID" src/gateway/services/archetype-generator.ts
      2. grep -c "THREAD_UID" src/gateway/services/archetype-generator.ts
      3. grep -c "NOTIFY_MSG_TS" src/gateway/services/archetype-generator.ts
      4. Assert: all counts > 0
    Expected Result: All env vars documented in the prompt
    Evidence: .sisyphus/evidence/task-4-env-vars.txt
  ```

  **Commit**: YES (grouped with Tasks 3, 5)

- [x] 5. Add Hostfully Delivery Template to Prompt

  **What to do**:
  - The current SYSTEM_PROMPT delivery template is Slack-only (post-message.ts with --text-file)
  - Add an alternative delivery template for external API deliveries (Hostfully, etc.):

    ```
    ## Delivery Templates

    ### Template A: Slack delivery (deliverable_type contains "slack")
    1. Parse <approved-content> JSON → extract "draft" → write to /tmp/delivery-draft.txt
    2. tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text-file /tmp/delivery-draft.txt
    3. tsx /tools/platform/submit-output.ts --summary "Delivered to Slack" --classification "DELIVERED"

    ### Template B: External API delivery (deliverable_type: hostfully_message, etc.)
    1. Parse <approved-content> JSON → extract "draft" and identifiers from "metadata"
    2. Deliver using the appropriate tool with identifiers from metadata (e.g. tsx /tools/hostfully/send-message.ts --lead-id <lead_uid> --message "<draft>")
    3. tsx /tools/platform/submit-output.ts --summary "Delivered to <service>" --classification "DELIVERED"

    Choose the template that matches the deliverable_type. If the deliverable_type does not match a known template, use Template B as the generic pattern.
    ```

  - Update the instruction that currently says "delivery_instructions is the same value as delivery_steps" — clarify that delivery_steps is the canonical field

  **Must NOT do**:
  - Do not remove the existing Slack template — add alongside it
  - Do not hardcode Hostfully-specific details — keep the external API template generic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Focused prompt addition, less complex than Tasks 3/4
  - **Skills**: []

  **Parallelization**: Wave 2, parallel with Tasks 3, 4. **Blocks**: 6. **Blocked By**: 1, 2

  **References**:
  - `src/gateway/services/archetype-generator.ts` — SYSTEM_PROMPT delivery section (look for "delivery_steps" instructions)
  - `src/worker-tools/hostfully/send-message.ts` — The Hostfully delivery tool CLI as an example
  - `.sisyphus/evidence/task-1-live-archetype.json` — The actual guest-messaging delivery_instructions as a reference for correct delivery flow

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Both delivery templates present in prompt
    Tool: Bash (grep)
    Steps:
      1. grep -c "Template A" src/gateway/services/archetype-generator.ts
      2. grep -c "Template B" src/gateway/services/archetype-generator.ts
      3. Assert: both counts > 0
    Expected Result: Both Slack and external API delivery templates documented
    Evidence: .sisyphus/evidence/task-5-delivery-templates.txt
  ```

  **Commit**: YES (grouped with Tasks 3, 4)

- [x] 6. Run Wizard with Simple Description + Verify Output Quality

  **What to do**:
  - Navigate to `http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
  - Enter this simple description:

    > An employee that handles guest messages for vacation rental properties. When a guest sends a message through Hostfully, this employee reads the full conversation thread, looks up the property details and reservations, checks the knowledge base for property-specific information, and drafts a helpful reply in the guest's language. If the guest reports an access issue, it diagnoses lock access problems. The draft reply is sent to Slack for manager approval before being delivered back to Hostfully. It requires approval before sending any message to guests.

  - Click Generate and wait for archetype generation
  - **CRITICAL EVALUATION** — After generation, verify WITHOUT making manual edits:
    - `tool_registry`: Must contain all relevant tools from the catalog (get-messages, get-property, get-reservations, send-message, post-guest-approval, post-message, search, diagnose-access, report-issue, submit-output). If missing critical tools → the generator improvement (Tasks 3-5) failed.
    - `execution_steps`: Must reference `$LEAD_UID`, `$THREAD_UID`, `$PROPERTY_UID` env vars. Must include approval card step. Must end with submit-output including --metadata.
    - `delivery_steps`: Must use the external API template (send-message, not post-message). Must extract identifiers from metadata.
    - `risk_model.approval_required`: Must be true
  - In Settings:
    - Set **Trigger** to "Webhook"
    - Set **Slack Channel** to the channel matching `C0AMGJQN05S`
  - If the wizard output fails evaluation:
    - Document what's wrong in `.sisyphus/evidence/task-6-evaluation.md`
    - Go back to Tasks 3-5 and fix the generator
    - Regenerate (use the wizard's refine feature or create new)
    - Repeat until the wizard produces correct output
  - Once output is correct, click "Preview AGENTS.md →" and screenshot
  - Click "Save as Draft"
  - Record new archetype ID
  - Save final archetype to `.sisyphus/evidence/task-6-wizard-output.json`

  **Must NOT do**:
  - Do not manually edit execution_steps, delivery_steps, or tool_registry in the wizard — the generator must produce them correctly
  - Do not activate the archetype (leave as draft)
  - Minor edits to identity wording are acceptable (cosmetic only)

  **Recommended Agent Profile**:
  - **Category**: `deep` — Complex evaluation loop with potential iteration back to generator fixes
  - **Skills**: [`playwright`]
    - `playwright`: Browser automation for wizard interaction

  **Parallelization**: Wave 3. **Blocks**: 7, 8. **Blocked By**: 3, 4, 5

  **References**:
  - `dashboard/src/panels/employees/CreateEmployeePage.tsx` — Wizard component steps and UI elements
  - `.sisyphus/evidence/task-1-live-archetype.json` — Reference for what the correct archetype looks like
  - `.sisyphus/evidence/task-2-tool-catalog.json` — Reference for what tools should appear in tool_registry

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Wizard generates correct archetype without manual fixes
    Tool: Playwright + Bash
    Steps:
      1. Navigate to wizard URL
      2. Enter description, click Generate
      3. Wait for edit form (up to 60s)
      4. Screenshot the edit form
      5. Verify tool_registry via API: curl "http://localhost:54331/rest/v1/archetypes?id=eq.<NEW_ID>" | jq '.[0].tool_registry.tools | length'
      6. Assert: tool count >= 8 (all critical tools present)
      7. Verify execution_steps via API: check contains "THREAD_UID", "submit-output", "approval"
      8. Verify delivery_steps via API: check contains "send-message" (not "post-message")
    Expected Result: All critical fields correctly generated without manual edits
    Evidence: .sisyphus/evidence/task-6-wizard-edit.png, .sisyphus/evidence/task-6-wizard-output.json

  Scenario: Evaluation failure triggers generator fix loop
    Tool: Bash
    Steps: If evaluation fails, document gaps and iterate on Tasks 3-5
    Expected Result: Generator eventually produces correct output
    Evidence: .sisyphus/evidence/task-6-evaluation.md
  ```

  **Commit**: NO

- [x] 7. Add Tests for Generator Improvements

  **What to do**:
  - Write Vitest tests for the new generator behavior:
    1. Tool catalog is fetched and included in the prompt (mock `discoverTools()`)
    2. Generated archetype has tool_registry populated from catalog (not invented paths)
    3. Env var section is present in the assembled prompt
    4. Delivery templates section is present in the assembled prompt
    5. `postProcess()` still strips Slack channel input_schema items
    6. Existing simple employee generation still works (regression test)
  - Follow existing test patterns

  **Must NOT do**:
  - Do not modify production code
  - Do not fix pre-existing test failures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Test writing
  - **Skills**: []

  **Parallelization**: Wave 3, parallel with Task 6. **Blocks**: None. **Blocked By**: 3, 4, 5

  **References**:
  - `src/gateway/services/__tests__/archetype-generator.test.ts` — Existing generator tests. Follow same patterns.
  - `src/gateway/services/archetype-generator.ts` — The code being tested

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Run all tests
    Tool: Bash
    Steps: pnpm test -- --run --reporter=verbose
    Expected Result: All tests pass (new + existing)
    Evidence: .sisyphus/evidence/task-7-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(archetype-generator): add tests for tool catalog injection and new prompt sections`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Soft-Delete Old Guest-Messaging Archetype

  **What to do**:
  - Soft-delete `00000000-0000-0000-0000-000000000015` via admin API
  - Verify `deleted_at IS NOT NULL`
  - **CRITICAL**: Do this BEFORE activating new archetype (Task 9)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: Wave 4. **Blocks**: 9. **Blocked By**: 6

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Soft-delete old archetype
    Tool: Bash (curl + psql)
    Steps:
      1. source .env
      2. curl -s -X DELETE "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/00000000-0000-0000-0000-000000000015" -H "X-Admin-Key: $ADMIN_API_KEY"
      3. psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT deleted_at IS NOT NULL as is_deleted FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015';"
      4. Assert: is_deleted = true
    Expected Result: Old archetype soft-deleted
    Evidence: .sisyphus/evidence/task-8-soft-delete.txt
  ```

  **Commit**: NO

- [x] 9. Activate New Guest-Messaging Archetype

  **What to do**:
  - PATCH new archetype to `status: 'active'`
  - Verify exactly 1 active guest-messaging archetype for VLRE tenant

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: Wave 4. **Blocks**: 10, 11. **Blocked By**: 8

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Activate and verify uniqueness
    Tool: Bash (curl + psql)
    Steps:
      1. source .env
      2. curl -s -X PATCH "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/<NEW_ID>" -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"status": "active"}'
      3. Assert: HTTP 200, status = "active"
      4. curl -s "http://localhost:54331/rest/v1/archetypes?role_name=eq.guest-messaging&status=eq.active&deleted_at=is.null&tenant_id=eq.00000000-0000-0000-0000-000000000003" -H "apikey: $SUPABASE_ANON_KEY" | jq 'length'
      5. Assert: 1
    Expected Result: Exactly 1 active guest-messaging archetype
    Evidence: .sisyphus/evidence/task-9-activate.txt
  ```

  **Commit**: NO

- [x] 10. Build Docker Worker Image

  **What to do**:
  - Build the Docker worker image: `docker build -t ai-employee-worker:latest .`
  - This is required before the E2E test (Task 11) because the worker runs inside Docker

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: Wave 5. **Blocks**: 11. **Blocked By**: 9

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux — long-running)
    Steps:
      1. tmux kill-session -t ai-build 2>/dev/null; tmux new-session -d -s ai-build -x 220 -y 50
      2. tmux send-keys -t ai-build "docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'$? >> /tmp/ai-build.log" Enter
      3. Poll every 30s until EXIT_CODE appears
      4. Assert: EXIT_CODE:0
      5. tmux kill-session -t ai-build
    Expected Result: Docker image built successfully
    Evidence: .sisyphus/evidence/task-10-docker-build.txt
  ```

  **Commit**: NO

- [x] 11. Full E2E: Airbnb → Hostfully → Webhook → Approval → Delivery → Done

  **What to do**:
  - **Prerequisites check**: Verify gateway (localhost:7700), Inngest (localhost:8288), and Docker worker image are ready
  - **Step 1: Send Airbnb message as Olivia**
    - Use Playwright to navigate to `https://www.airbnb.com/guest/messages/2525238359`
    - Log in as Olivia (the test account) if not already logged in
    - Type and send a test message (e.g. "Hi! What time is check-in? Also, how do I access the property?")
    - This triggers Hostfully to fire a `NEW_INBOX_MESSAGE` webhook to the gateway
  - **Step 2: Monitor webhook receipt**
    - Watch gateway logs for the incoming webhook
    - Verify a task was created in the DB: `SELECT id, status, archetype_id FROM tasks WHERE archetype_id = '<NEW_ID>' ORDER BY created_at DESC LIMIT 1;`
    - Capture the task ID
  - **Step 3: Monitor lifecycle progression**
    - Poll task status every 30s (up to 5 min)
    - Verify task reaches `Reviewing` or `Submitting`
    - Check `compiled_agents_md` is non-empty and contains execution instructions
  - **Step 4: Verify approval card in Slack**
    - Use Playwright to navigate to `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`
    - Look for the approval card with the task ID
    - Take screenshot of the approval card
  - **Step 5: Approve**
    - Click "Approve & Send" in Slack, OR use manual approval fallback:
      ```
      curl -X POST "http://localhost:8288/e/local" -H "Content-Type: application/json" \
        -d '{"name":"employee/approval.received","data":{"taskId":"<TASK_ID>","action":"approve","userId":"U123","userName":"Test"}}'
      ```
  - **Step 6: Verify delivery + Done**
    - Poll task status until Done (up to 2 min after approval)
    - Verify final status = Done
    - Check Hostfully thread for the delivered reply (optional — verify via Playwright or API)

  **Must NOT do**:
  - Do not skip the Airbnb message step — this is a full E2E test
  - Do not modify any source code

  **Recommended Agent Profile**:
  - **Category**: `deep` — Complex multi-system E2E flow
  - **Skills**: [`e2e-testing`, `debugging-lifecycle`, `playwright`]
    - `e2e-testing`: Full E2E methodology, trigger methods, state verification
    - `debugging-lifecycle`: Diagnose stuck states if task doesn't progress
    - `playwright`: Browser automation for Airbnb and Slack interactions

  **Parallelization**: Wave 5. **Blocks**: 12. **Blocked By**: 10

  **References**:
  - `docs/employees/guest-messaging.md` — Full E2E flow documentation, test resources, all UIDs, gotchas
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Slack UX E2E scenarios
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — Full E2E test guide
  - Airbnb test thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack channel: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S` (#cs-guest-communication)
  - Hostfully thread: `https://platform.hostfully.com/app/#/inbox?threadUid=aef3d0cf-bc61-4f05-a3ce-1a4199ca336d&leadUid=29a64abd-d02c-44bc-8d5c-47df58a7ab14`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full E2E lifecycle — Airbnb message to Done
    Tool: Playwright + Bash
    Preconditions: Services running, Docker image built, new archetype active
    Steps:
      1. Playwright: navigate to Airbnb thread, send test message
      2. Wait 30s for webhook to fire
      3. psql: check for new task with new archetype_id
      4. Poll status every 30s up to 5 min
      5. Assert: status reaches Reviewing or Submitting
      6. psql: SELECT length(compiled_agents_md) > 0 FROM tasks WHERE id = '$TASK_ID'
      7. Assert: compiled_agents_md is non-empty
      8. Approve via curl or Slack button
      9. Poll status up to 2 min
      10. Assert: status = 'Done'
    Expected Result: Task completes full lifecycle
    Failure Indicators: No task created (webhook routing failed), stuck in Executing, compiled_agents_md empty, status = Failed
    Evidence: .sisyphus/evidence/task-11-e2e-lifecycle.txt, .sisyphus/evidence/task-11-slack-approval.png

  Scenario: Verify compiled AGENTS.md quality
    Tool: Bash (psql)
    Steps:
      1. psql ... -c "SELECT compiled_agents_md FROM tasks WHERE id = '$TASK_ID';" -t > .sisyphus/evidence/task-11-compiled-agents-md.txt
      2. Assert: contains tool references from the new archetype
      3. Assert: contains "execution-instructions" section (not empty)
    Expected Result: Full AGENTS.md with correct execution instructions
    Evidence: .sisyphus/evidence/task-11-compiled-agents-md.txt
  ```

  **Commit**: NO

- [x] 12. Notify Completion via Telegram

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "📋 Guest-messaging recreation complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**: Wave 5. **Blocks**: F1-F4. **Blocked By**: 11

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Send Telegram notification
    Tool: Bash
    Steps: tsx scripts/telegram-notify.ts "📋 Guest-messaging recreation complete — All tasks done. Come back to review results."
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-12-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod. Check AI slop.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Verify: (1) Dashboard shows new archetype for VLRE, (2) Old archetype not visible, (3) Run the wizard with a different description (e.g. "code rotation employee") to verify generator improvements don't break simple employees. Save evidence.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 compliance. Check "Must NOT do" — especially: no guest-messaging-specific hardcoding in the generator.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| After Task | Message                                                                                               | Files                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 3+4+5      | `feat(archetype-generator): inject tool catalog, env vars, delivery templates, and approval patterns` | `src/gateway/services/archetype-generator.ts`, `src/gateway/routes/admin-archetype-generate.ts` |
| 7          | `test(archetype-generator): add tests for tool catalog injection and new prompt sections`             | Test files                                                                                      |

---

## Success Criteria

### Verification Commands

```bash
# Exactly 1 active guest-messaging archetype
source .env && curl -s "http://localhost:54331/rest/v1/archetypes?role_name=eq.guest-messaging&status=eq.active&deleted_at=is.null&tenant_id=eq.00000000-0000-0000-0000-000000000003" -H "apikey: $SUPABASE_ANON_KEY" | jq 'length'
# Expected: 1

# Old archetype soft-deleted
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT deleted_at IS NOT NULL as is_deleted FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000015';"
# Expected: t

# Build passes
pnpm build
# Expected: 0 errors

# Tests pass
pnpm test -- --run
# Expected: All passing (minus known pre-existing failures)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] E2E task verified (Airbnb → Done)
- [ ] Generator produces correct guest-messaging employee from simple description
