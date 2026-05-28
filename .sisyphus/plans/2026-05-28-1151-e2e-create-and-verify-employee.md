# Fix AI Generation Pipeline Until Zero-Edit Clean Run

## TL;DR

> **Quick Summary**: The AI generation wizard produces incomplete employee configs — missing submit-output tool, vague channel references, no classification rules. Fix the SYSTEM_PROMPT to teach the correct patterns, then iterate until a fresh employee can be generated, saved without ANY edits, triggered, and successfully posts to Slack.
>
> **Deliverables**:
>
> - Fixed SYSTEM_PROMPT and REFINE_SYSTEM_PROMPT in `archetype-generator.ts`
> - At least one clean run: describe → generate → save untouched → trigger → correct Slack output
> - Generalization: a second fresh description also passes
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — sequential iterative loop
> **Critical Path**: Task 2 (fix prompt) → Task 3 (iterate until clean) → Task 4 (generalization)

---

## Context

### Original Request

The employee creation wizard was polished (9-task plan, all approved). The mechanical flow works. But the AI-generated content isn't good enough to run without manual editing. The user wants the generator to produce employees that work out-of-the-box — zero edits between "Generate" and "Save."

### Evidence from Draft Inspection

The user created `daily-slack-digest` via the wizard. Inspecting the AI-generated fields:

| Field                       | Generated                | Issue                                                                                                     |
| --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Identity (305 chars)        | ✅ Good                  | Has name, role, expertise, communication style                                                            |
| Execution Steps (444 chars) | ⚠️ Incomplete            | Says "monitored Slack channel(s)" — no env var ref. No submit-output final step. No classification rules. |
| Delivery Steps (214 chars)  | ✅ Good                  | References `<approved-content>`, uses post-message                                                        |
| Tool Registry               | ⚠️ Missing platform tool | Has slack tools, but missing `/tools/platform/submit-output.ts`                                           |
| Overview                    | ✅ Good                  | Well-structured                                                                                           |

### Root Cause (from Metis analysis + code inspection)

The SYSTEM_PROMPT in `archetype-generator.ts` lines 96-101 **explicitly forbids** the generator from producing the content that working employees need:

```
DO NOT include in execution_steps:
- File paths like /tmp/summary.txt
- JSON format details or output contract specifics
- Shell commands or technical tool invocations
- XML tags, IMPORTANT/STOP directives, or platform plumbing
- Output/reporting instructions — the platform injects these at runtime
```

But every working employee in `prisma/seed.ts` has:

- Explicit `tsx /tools/...` invocations
- `$NOTIFY_MSG_TS` env var usage
- CLASSIFICATION RULES block (NEEDS_APPROVAL / NO_ACTION_NEEDED)
- Mandatory FINAL STEP with submit-output tool

**The prohibition was added to keep generation "clean" but it makes the output incomplete for runtime.**

### Proven Working Employee — 100% Accuracy Reference

Archetype `ad5f02f0-f38d-4e00-abd0-4973cd93a7eb` (`daily-real-estate-inspiration-2-copy`) has 100% success rate. Dashboard: `http://localhost:7701/dashboard/employees/ad5f02f0-f38d-4e00-abd0-4973cd93a7eb?tenant=00000000-0000-0000-0000-000000000003`

| Field                | Value                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Model                | `deepseek/deepseek-v4-flash`                                                                              |
| Temperature          | 1.5                                                                                                       |
| approval_required    | false                                                                                                     |
| notification_channel | `C0960S2Q8RL` (#victor-tests)                                                                             |
| Identity             | 92 chars — "You are a daily inspiration curator for a real estate investment and short-term rental team." |
| Execution Steps      | 1808 chars — 5 steps with explicit tool invocations                                                       |
| Delivery Steps       | 747 chars — 3 steps with explicit tool invocations                                                        |
| Tool Registry        | Empty (tools referenced directly in steps)                                                                |

**Critical patterns from this working employee (the generator MUST learn to produce these):**

**1. Boundary enforcement at top of execution_steps:**

```
**IMPORTANT: Follow ONLY these steps. Do NOT read or follow `<delivery-instructions>` — that section is for a separate container. STOP after step 5.**
```

**2. Explicit tool invocations with exact syntax:**

```
tsx /tools/platform/submit-output.ts --summary "Daily inspiration message composed" --classification "NO_ACTION_NEEDED"
```

**3. File-based workflow (write draft to /tmp/):**

```bash
cat > /tmp/draft.txt << 'MSGEOF'
[your full message here]
MSGEOF
```

**4. STOP directive at the end:**

```
**STOP. Do nothing else. Your job is done.**
```

**5. Delivery steps mirror the same patterns:**

- Boundary: "Do NOT read or follow `<execution-instructions>`"
- Extracts `draft` field from `<approved-content>` JSON → writes to `/tmp/delivery-draft.txt`
- Posts via `tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text-file /tmp/delivery-draft.txt`
- Confirms via `tsx /tools/platform/submit-output.ts`
- STOP directive at the end

**6. $NOTIFICATION_CHANNEL env var** (not hardcoded channel ID)

**What the SYSTEM_PROMPT currently FORBIDS that this working employee USES:**

| Working Employee Pattern        | SYSTEM_PROMPT Prohibition (lines 96-101)          |
| ------------------------------- | ------------------------------------------------- |
| `/tmp/draft.txt` file paths     | "No file paths like /tmp/summary.txt"             |
| `tsx /tools/...` shell commands | "No shell commands or technical tool invocations" |
| `STOP` / `IMPORTANT` directives | "No XML tags, IMPORTANT/STOP directives"          |
| `submit-output` call            | "No output/reporting instructions"                |

**Every single prohibition in the SYSTEM_PROMPT contradicts the proven working model.** The fix is to remove all these prohibitions and teach the generator to produce these exact patterns.

### Prerequisite: VLRE Tenant Config (VERIFIED ✅)

```json
{
  "source_channels": ["C0AMGJQN05S", "C0ANH9J91NC", "C0960S2Q8RL"],
  "notification_channel": "C0960S2Q8RL",
  "publish_channel": "C0960S2Q8RL"
}
```

All env vars will be populated at runtime. No data prerequisite issues.

### Metis Review

**Key findings**:

1. The "vague channel" problem is by design — generator correctly avoids hardcoding. Fix: teach env var pattern ($SOURCE_CHANNELS, $NOTIFICATION_CHANNEL)
2. `submit-output.ts` exists but SYSTEM_PROMPT forbids mentioning it
3. `sanitizeAgentsMd()` function strips "classification rules" sections — executing agent must verify this doesn't interfere with inline classification rules in execution_steps
4. Slug collision possible on repeated iterations — must soft-delete previous test archetype
5. Use `VLRE_SUMMARIZER_INSTRUCTIONS` in `seed.ts` as the gold standard for complete execution_steps

---

## Work Objectives

### Core Objective

Fix the AI generation process so employees can be created via the wizard, saved without edits, triggered, and produce correct output — reliably and repeatedly.

### Definition of Done

- [ ] One full clean run: describe → generate → save (ZERO edits) → trigger → Done → correct Slack message in #victor-tests
- [ ] A second fresh description also passes the same test (generalization)

### Must Have

- SYSTEM_PROMPT teaches env var pattern for channels ($SOURCE_CHANNELS, $NOTIFICATION_CHANNEL)
- SYSTEM_PROMPT teaches submit-output final step with correct flags
- SYSTEM_PROMPT teaches classification rules (NEEDS_APPROVAL / NO_ACTION_NEEDED)
- Generated tool_registry includes `/tools/platform/submit-output.ts`
- At least one clean run with zero manual edits
- Generalization: second description also produces working employee

### Must NOT Have (Guardrails)

- DO NOT touch `postProcess()` function — it's structural normalization, not content generation
- DO NOT change `execution_instructions` — it's platform plumbing
- DO NOT hardcode channel IDs in SYSTEM_PROMPT examples — use env var references
- DO NOT change wizard UI, wizard flow, or any dashboard files
- DO NOT modify seed.ts or legacy archetypes
- DO NOT add unit tests (user waiver)
- DO NOT add `submit-output` injection in postProcess() — the SYSTEM_PROMPT must teach it
- DO NOT exceed 4 iterations — if still failing after 4, surface the specific failing criterion as a blocker

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### QA Policy

Evidence saved to `.sisyphus/evidence/e2e-create-verify/`.

### Acceptance Criteria (AC1-AC9)

**Field quality checks (run via psql BEFORE triggering):**

- **AC1**: `execution_steps` contains env var references (`$SOURCE_CHANNELS` or `$NOTIFICATION_CHANNEL`)
- **AC2**: `execution_steps` ends with a submit-output final step
- **AC3**: `execution_steps` includes classification values (NEEDS_APPROVAL / NO_ACTION_NEEDED)
- **AC4**: `tool_registry.tools` includes `/tools/platform/submit-output.ts`

**Runtime checks (after triggering):**

- **AC5**: Task reaches `Done` status (not Failed)
- **AC6**: `task_status_log` shows Submitting → Delivering → Done sequence
- **AC7**: Slack message appears in #victor-tests with relevant content (not an error)

**Process checks:**

- **AC8**: Zero manual edits — generate and save immediately, no field modifications
- **AC9**: Second fresh description also passes AC1-AC7 without additional SYSTEM_PROMPT changes

---

## Execution Strategy

### Sequential — 4 tasks + notify

```
Task 1: [DONE by user] Created daily-slack-digest draft
  ↓
Task 2: Fix SYSTEM_PROMPT and REFINE_SYSTEM_PROMPT [unspecified-high]
  ↓
Task 3: Iterative clean-run loop — generate → verify → trigger → verify Slack [deep + playwright]
         ↻ If fail: diagnose → fix prompt → soft-delete archetype → retry (max 4 iterations)
  ↓
Task 4: Generalization — second description, full pass [deep + playwright]
  ↓
Task 5: Notify
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
| ---- | ---------- | ------ | ---- |
| 1    | —          | 2      | Done |
| 2    | 1          | 3      | 1    |
| 3    | 2          | 4      | 2    |
| 4    | 3          | 5      | 3    |
| 5    | 4          | —      | 4    |

---

## TODOs

- [x] 1. Create employee through the dashboard wizard (DONE BY USER)

  Employee `daily-slack-digest` created as draft. Archetype ID: `c9c9d01b-a148-4aef-97b7-7134338635fb`. VLRE tenant. #victor-tests channel.

- [x] 2. Fix SYSTEM_PROMPT to teach runtime-critical patterns

  **What to do**:

  The SYSTEM_PROMPT in `archetype-generator.ts` lines 96-101 explicitly forbids the generator from producing content that working employees need at runtime. This task removes the prohibitions and replaces them with correct patterns.

  **Specific changes to SYSTEM_PROMPT**:

  **Change A — Remove the prohibition block** (lines 96-101):
  Delete the "DO NOT include in execution_steps" block that forbids file paths, shell commands, tool invocations, and output contract details. This prohibition is why generated employees are incomplete.

  **Change B — Add mandatory FINAL STEP rule**:
  Add a new rule after the existing execution_steps rules:

  ```
  FINAL STEP (MANDATORY): Every execution_steps MUST end with a submission step that calls the submit-output tool. Example:
  "N. FINAL STEP: Submit your work using the submit-output tool:
     - tsx /tools/platform/submit-output.ts --summary /tmp/summary.txt --classification NEEDS_APPROVAL
     Classification values: NEEDS_APPROVAL (when the employee produced output that needs human review) or NO_ACTION_NEEDED (when there is nothing to report or act on)."
  ```

  **Change C — Add env var pattern for channels**:
  Add a new rule:

  ```
  CHANNEL REFERENCES: Never hardcode Slack channel names or IDs in execution_steps. Instead, reference the platform-injected environment variables:
  - $SOURCE_CHANNELS — comma-separated list of channels to read from (available at runtime)
  - $NOTIFICATION_CHANNEL — the employee's designated notification channel
  - $PUBLISH_CHANNEL — the channel to post deliverables to
  Example: "1. Read messages from the channels in $SOURCE_CHANNELS from the last 24 hours using the Slack read-channel tool."
  ```

  **Change D — Add tool invocation syntax rule**:
  Add a new rule:

  ```
  TOOL INVOCATIONS: When referencing tools in execution_steps, use the full path from tool_registry. Format: "tsx /tools/{service}/{tool-name}.ts [flags]". Example: "Read messages using tsx /tools/slack/read-channel.ts --channel $SOURCE_CHANNELS --hours 24".
  ```

  **Change E — Add platform/submit-output to tool_registry guidance**:
  Update the tool_registry documentation to include: "ALWAYS include /tools/platform/submit-output.ts in tool_registry.tools — every employee needs it for the output contract."

  **Change F — Apply same changes to REFINE_SYSTEM_PROMPT** (line 167):
  Replace the single prohibition line `"Do NOT add XML tags, IMPORTANT/STOP directives, platform plumbing, submit-output instructions, or /tmp/ file paths to execution_steps or delivery_steps"` with the same patterns from Changes B-D (adapted for refinement context: "Ensure execution_steps ends with a submit-output FINAL STEP" etc.)

  **Must NOT do**:
  - DO NOT touch `postProcess()` function (lines 244-291 area)
  - DO NOT change the JSON shape specification
  - DO NOT change `sanitizeAgentsMd()` function
  - DO NOT hardcode any channel IDs in examples — only use $ENV_VAR references
  - DO NOT modify the `INJECTION_BOUNDARY` constant
  - DO NOT change the model used for generation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering with careful wording to maintain JSON output quality
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Implementation References (files to modify)**:
  - `src/gateway/services/archetype-generator.ts:52-157` — The `SYSTEM_PROMPT` constant. Lines 96-101 are the prohibition block to remove and replace.
  - `src/gateway/services/archetype-generator.ts:159-184` — The `REFINE_SYSTEM_PROMPT` constant. Line 167 has the single prohibition to replace.

  **Gold Standard Reference — PRIMARY (100% success rate employee)**:
  - DB query: `SELECT identity, execution_steps, delivery_steps FROM archetypes WHERE id = 'ad5f02f0-f38d-4e00-abd0-4973cd93a7eb';` — This is the **proven working employee** with 100% accuracy. The generator MUST learn to produce execution_steps and delivery_steps that follow this exact pattern: boundary enforcement at top, explicit `tsx /tools/...` invocations, file-based workflow (`/tmp/draft.txt`), submit-output with `--summary` and `--classification` flags, STOP directive at end. See the "Proven Working Employee" section in Context above for the full content.

  **Gold Standard Reference — SECONDARY (seed.ts employees)**:
  - `prisma/seed.ts` — Search for `VLRE_SUMMARIZER_INSTRUCTIONS`. Another working execution_steps pattern. Includes: explicit tool invocations, env var references (`$SOURCE_CHANNELS`, `$NOTIFY_MSG_TS`), classification rules, submit-output FINAL STEP.
  - `prisma/seed.ts` — Guest-messaging archetype's `instructions` field. Working execution_steps with tool invocations and classification rules.

  **Hazard References (things that could interfere)**:
  - `src/gateway/services/archetype-generator.ts:201-249` — `sanitizeAgentsMd()` function. It strips sections with headers matching "classification rules" and "tools available". **If the generator produces execution_steps with a "## Classification Rules" header, this function would strip it during AGENTS.md compilation.** The fix: teach the generator to embed classification rules INLINE in the numbered steps (not as a separate section header). Example: "N. Classify your output: if you produced content → NEEDS_APPROVAL, if nothing to report → NO_ACTION_NEEDED" — not as a separate "## Classification Rules" section.
  - `src/workers/lib/agents-md-compiler.mts` — Compiles the AGENTS.md that the worker sees. Read this to understand how `execution_steps` is wrapped in `<execution-instructions>` tags and how `delivery_steps` becomes `<delivery-instructions>`.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Generator produces complete execution_steps with new patterns
    Tool: Bash (curl)
    Preconditions: Gateway running on localhost:7700 (tsx watch should hot-reload changes)
    Steps:
      1. source .env
      2. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/generate" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"description":"An employee that reads recent messages in the #victor-tests Slack channel and posts a brief summary of what was discussed"}'
      3. Parse JSON response
      4. Assert: execution_steps contains "$SOURCE_CHANNELS" or "$NOTIFICATION_CHANNEL" (AC1)
      5. Assert: execution_steps contains "submit-output" (AC2)
      6. Assert: execution_steps contains "NEEDS_APPROVAL" and "NO_ACTION_NEEDED" (AC3)
      7. Assert: tool_registry.tools includes a path containing "submit-output" (AC4)
      8. Assert: execution_steps has numbered steps, minimum 3 steps
      9. Assert: identity contains a name/title and communication style
      10. Assert: delivery_steps references <approved-content>
    Expected Result: All AC1-AC4 pass, plus existing quality checks still hold
    Failure Indicators: Missing env var refs, no submit-output, no classification values, tool_registry incomplete
    Evidence: .sisyphus/evidence/e2e-create-verify/task-2-generator-output.json

  Scenario: REFINE_SYSTEM_PROMPT preserves new patterns
    Tool: Bash (curl)
    Preconditions: Gateway running
    Steps:
      1. First generate an archetype (reuse output from scenario above)
      2. curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/generate" \
           -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
           -d '{"description":"An employee that reads recent messages in the #victor-tests Slack channel and posts a brief summary of what was discussed","refinement":"Change the trigger to run every weekday at 9am UTC instead of manual","existingConfig":<paste generated JSON>}'
      3. Assert: Refined output still has submit-output in execution_steps
      4. Assert: Refined output still has env var references
      5. Assert: trigger_sources.type changed to "scheduled" with cron
    Expected Result: Refinement preserves runtime-critical patterns while applying changes
    Evidence: .sisyphus/evidence/e2e-create-verify/task-2-refine-output.json
  ```

  **Commit**: YES
  - Message: `feat(generator): teach SYSTEM_PROMPT env vars, submit-output, and classification rules`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Iterative clean-run loop — generate, save untouched, trigger, verify Slack

  **What to do**:

  This is the core verification task. It's an iterative loop that repeats until success or 4 attempts. Each iteration:

  **Step 1 — Soft-delete previous test archetype** (skip on first iteration):

  ```bash
  # If a previous test archetype exists from a failed iteration, soft-delete it to avoid slug collision
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "UPDATE archetypes SET deleted_at = NOW() WHERE role_name = '<previous-slug>' AND tenant_id = '00000000-0000-0000-0000-000000000003' AND deleted_at IS NULL AND id != 'c9c9d01b-a148-4aef-97b7-7134338635fb';"
  ```

  **Step 2 — Generate fresh employee via wizard (ZERO edits)**:
  - Open browser and navigate to `http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
  - In the Describe step, enter: `"An employee that reads recent messages in the #victor-tests Slack channel and posts a brief summary of what was discussed"`
  - Click **Generate** and wait for the edit step to load
  - **DO NOT edit ANY fields** — the entire point is zero manual edits
  - Expand Settings, select **#victor-tests** from the Slack channel dropdown (this is a setting, not an edit to AI-generated content)
  - In the Delivery section, verify "Requires Approval" is set as appropriate (if the generated employee has approval_required: false, leave it; if true, leave it — the employee should work either way, but for faster testing, toggle it OFF if possible)
  - Click **Preview AGENTS.md →** — take a screenshot of the preview
  - Click **Save as Draft** — wait for redirect
  - Capture the new archetype ID from the redirect URL

  **Step 3 — Verify field quality (AC1-AC4)**:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT execution_steps FROM archetypes WHERE id = '<NEW_ID>';" | grep -c 'SOURCE_CHANNELS\|NOTIFICATION_CHANNEL'
  # AC1: expect >= 1

  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT execution_steps FROM archetypes WHERE id = '<NEW_ID>';" | grep -c 'submit-output'
  # AC2: expect >= 1

  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT execution_steps FROM archetypes WHERE id = '<NEW_ID>';" | grep -c 'NEEDS_APPROVAL\|NO_ACTION_NEEDED'
  # AC3: expect >= 1

  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT tool_registry::text FROM archetypes WHERE id = '<NEW_ID>';" | grep -c 'submit-output'
  # AC4: expect >= 1
  ```

  If ANY of AC1-AC4 fail:
  - Record which criteria failed
  - Read the actual execution_steps content
  - Diagnose what the SYSTEM_PROMPT is still getting wrong
  - Fix `archetype-generator.ts` SYSTEM_PROMPT (only the specific issue)
  - Commit the fix: `fix(generator): refine SYSTEM_PROMPT — [specific issue]`
  - Go back to Step 1

  **Step 4 — Activate and trigger**:

  ```bash
  # Activate the archetype
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "UPDATE archetypes SET status = 'active' WHERE id = '<NEW_ID>';"

  # Trigger
  source .env
  curl -s -X POST "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/employees/<SLUG>/trigger" \
    -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
    -d '{}' | jq '{task_id: .task_id}'
  ```

  **Step 5 — Monitor to completion** (poll every 30s, timeout 5 min):

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT status, updated_at FROM tasks WHERE id = '<TASK_ID>';"
  ```

  - AC5: Task reaches `Done` status
  - AC6: `task_status_log` shows Submitting → Delivering → Done sequence

  If task reaches `Failed`:
  - Query `task_status_log` for the failure point
  - Check task execution logs at `http://localhost:7701/dashboard/tasks/<TASK_ID>/logs?tenant=00000000-0000-0000-0000-000000000003`
  - Diagnose whether the failure is a generation quality issue or a runtime issue
  - If generation quality: fix SYSTEM_PROMPT, go back to Step 1
  - If runtime issue (model failure, tool error): document and report as a blocker

  **Step 6 — Verify Slack output** (AC7):
  - Use Slack API to check #victor-tests for recent messages:

  ```bash
  source .env
  CHANNEL_ID="C0960S2Q8RL"
  curl -s "https://slack.com/api/conversations.history" \
    -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
    -d "channel=$CHANNEL_ID&limit=5" | jq '.messages[0]'
  ```

  - Or navigate to task detail page in the dashboard for output verification
  - AC7: Message exists, is relevant content (not an error/stack trace), contains task context block

  If Slack message is wrong or missing:
  - Diagnose: did the employee produce output? Check `/tmp/summary.txt` existence in task logs
  - Did the lifecycle deliver? Check task_status_log for Delivering state
  - If generation quality issue: fix SYSTEM_PROMPT, go back to Step 1
  - If runtime/delivery issue: document and report as a blocker

  **ITERATION CAP**: Maximum 4 iterations. If still failing after 4, document which specific AC is failing and report as a blocker. Do not continue indefinitely.

  **SUCCESS**: All AC1-AC7 pass in a single clean run. Record the archetype ID and task ID as evidence.

  **Must NOT do**:
  - DO NOT edit ANY AI-generated fields between Generate and Save (only Slack channel selection and approval toggle are allowed — these are settings, not content edits)
  - DO NOT manually advance the lifecycle
  - DO NOT modify any files other than `archetype-generator.ts` (for SYSTEM_PROMPT fixes)
  - DO NOT exceed 4 iterations

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex iterative task requiring autonomous diagnosis, code fixes, browser automation, and API verification
  - **Skills**: [`playwright`]
    - `playwright`: Required for wizard UI interaction

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Implementation References**:
  - `src/gateway/services/archetype-generator.ts` — SYSTEM_PROMPT (the file to fix if iterations are needed)
  - `src/workers/lib/agents-md-compiler.mts` — How execution_steps gets compiled into the worker's AGENTS.md. Read to understand how the fields become runtime instructions.
  - `src/workers/opencode-harness.mts` — The worker harness. Understand the output contract: expects `/tmp/summary.txt` and `/tmp/approval-message.json`.

  **Gold Standard Reference**:
  - DB archetype `ad5f02f0-f38d-4e00-abd0-4973cd93a7eb` — The 100% accuracy employee. Query its `execution_steps` and `delivery_steps` for the exact patterns generated output should match. See "Proven Working Employee" in Context section.
  - `prisma/seed.ts` — `VLRE_SUMMARIZER_INSTRUCTIONS` constant. Secondary reference for what complete execution_steps look like.

  **Dashboard References**:
  - Wizard URL: `http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
  - Task logs: `http://localhost:7701/dashboard/tasks/<TASK_ID>/logs?tenant=00000000-0000-0000-0000-000000000003`

  **Acceptance Criteria**:
  All of AC1-AC7 must pass in a single iteration. See "Acceptance Criteria (AC1-AC9)" section above for full definitions.

  **Evidence to Capture (per iteration)**:
  - [ ] Screenshot of wizard edit step (all sections, showing AI-generated content untouched)
  - [ ] Screenshot of AGENTS.md preview
  - [ ] psql output showing AC1-AC4 field checks
  - [ ] Task trigger response (task_id)
  - [ ] Task final status
  - [ ] task_status_log sequence
  - [ ] Slack message content (from API or screenshot)
  - [ ] If iteration failed: diagnosis notes explaining what went wrong

  Evidence path: `.sisyphus/evidence/e2e-create-verify/iteration-{N}-{artifact}.{ext}`

  **Commit**: YES (only if SYSTEM_PROMPT fixes were needed during iterations)
  - Message: `fix(generator): refine SYSTEM_PROMPT — [specific issue fixed]`
  - Files: `src/gateway/services/archetype-generator.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Generalization — second fresh description passes AC1-AC7

  **What to do**:

  After Task 3 succeeds, verify the fix generalizes. Use a DIFFERENT employee description and repeat the full clean-run verification.
  - Soft-delete the Task 3 test archetype (slug collision prevention)
  - Navigate to `http://localhost:7701/dashboard/employees/new?tenant=00000000-0000-0000-0000-000000000003`
  - Enter a DIFFERENT description: `"An employee that checks our Jira board every morning for overdue tickets and posts a reminder to the assignees in #victor-tests"`
  - Click **Generate** — DO NOT edit any AI-generated fields
  - Select **#victor-tests** channel in Settings
  - Save as Draft
  - Verify AC1-AC4 (field quality)
  - Activate and trigger
  - Verify AC5-AC7 (runtime + Slack)

  This MUST pass without any additional SYSTEM_PROMPT changes. If it fails:
  - If the failure is the same issue as Task 3 iterations → the fix didn't generalize, go back to Task 3
  - If the failure is a new issue → document it, fix SYSTEM_PROMPT, re-run this task
  - Maximum 2 additional iterations for this task

  **Must NOT do**:
  - DO NOT reuse the same description as Task 3
  - DO NOT edit AI-generated content
  - DO NOT make SYSTEM_PROMPT changes unless this task specifically fails

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Same autonomous loop as Task 3, different description
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  Same as Task 3.

  **Acceptance Criteria**:
  AC1-AC7 all pass with zero SYSTEM_PROMPT changes beyond what Task 3 already applied. AC9 (generalization) confirmed.

  **Evidence to Capture**:
  - [ ] Screenshot of wizard with second description
  - [ ] psql AC1-AC4 checks
  - [ ] Task trigger + final status
  - [ ] Slack message content
        Evidence path: `.sisyphus/evidence/e2e-create-verify/generalization-{artifact}.{ext}`

  **Commit**: NO (unless SYSTEM_PROMPT fix needed, then same pattern as Task 3)

- [x] 5. Notify completion — Send Telegram notification

  ```bash
  npx tsx scripts/telegram-notify.ts "✅ AI generation pipeline verified — clean run from generate to Slack with zero edits. Generalization passed. Come back to review."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Commit**: NO

---

## Commit Strategy

| After Task(s)              | Commit Message                                                                           | Files                    |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| 2                          | `feat(generator): teach SYSTEM_PROMPT env vars, submit-output, and classification rules` | `archetype-generator.ts` |
| 3 (if prompt fixes needed) | `fix(generator): refine SYSTEM_PROMPT based on clean-run feedback`                       | `archetype-generator.ts` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build    # Expected: zero errors
```

### Final Checklist

- [ ] SYSTEM_PROMPT teaches env var channel pattern
- [ ] SYSTEM_PROMPT teaches submit-output final step
- [ ] SYSTEM_PROMPT teaches classification rules
- [ ] One full clean run: generate → save (zero edits) → trigger → Done → correct Slack message
- [ ] Second description also passes (generalization)
- [ ] No regression in existing employees (build passes)
