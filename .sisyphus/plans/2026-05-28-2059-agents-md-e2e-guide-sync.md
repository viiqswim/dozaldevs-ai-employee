# AGENTS.md & Debugging Skill — E2E Guide Sync

## TL;DR

> **Quick Summary**: Update AGENTS.md and the `debugging-lifecycle` skill to reflect knowledge from the new AI Employee E2E Test Guide (`docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md`). Fixes 6 stale/wrong items, adds 8 new pieces of information (including a condensed Task Debugging Quick Reference), and enhances the debugging skill with deeper observability commands.
>
> **Deliverables**:
>
> - Updated `AGENTS.md` — 14 targeted edits (6 fixes + 8 additions), including a new Task Debugging Quick Reference section
> - Updated `.opencode/skills/debugging-lifecycle/SKILL.md` — deeper observability enhancements + 1 stale fix
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 + Task 2 (parallel) → Task 3 (verification)

---

## Context

### Original Request

User created a comprehensive E2E test guide for AI employee creation → execution → approval → delivery. Asked: "what changes would you make to AGENTS.md so that it's up to date, as accurate as possible, and as helpful as possible?"

### Interview Summary

**Key Discussions**:

- Identified 6 stale/wrong items in AGENTS.md that the guide contradicts or exposes
- Identified 7 net-new pieces of information the guide reveals that AGENTS.md is missing
- Discussed whether the Observability Cheat Sheet should go into AGENTS.md → decided NO (token weight; the `debugging-lifecycle` skill is the right delivery mechanism)
- Decided NOT to add Known Issue about approval cards for generated employees (leave in guide)
- Compared guide's observability content against both AGENTS.md and the debugging-lifecycle skill — found the skill covers ~70% but is missing health checks, execution metrics, harness log grep patterns, delivery container docker ps, Slack thread inspection

**Research Findings**:

- `Validating` state confirmed as auto-pass in `employee-lifecycle.ts` (line 759: `'State: Validating (auto-pass)'`)
- Both `SLACK_BOT_TOKEN` (line 102) and `VLRE_SLACK_BOT_TOKEN` (line 125) exist in `.env.example` as separate vars
- `debugging-lifecycle` skill is 375 lines, covers stuck-state diagnostics thoroughly but lacks operational observability commands
- Approval gate line 55 contradicts line 81 in the same file (line 81 is correct)

### Metis Review

**Identified Gaps** (addressed):

- Scope guard: Do NOT update README.md — only AGENTS.md and debugging-lifecycle skill
- Verification needed: Documentation changes need grep-based acceptance criteria
- No seeded employee for full approval path: Test recommendation must accurately note wizard-generated employees are used (not a permanent seed)

---

## Work Objectives

### Core Objective

Bring AGENTS.md and the debugging-lifecycle skill into full accuracy relative to the new E2E test guide, fixing stale content and adding missing knowledge.

### Concrete Deliverables

- `AGENTS.md` with 13 targeted edits applied
- `.opencode/skills/debugging-lifecycle/SKILL.md` with observability enhancements and stale fix

### Definition of Done

- [ ] All 6 stale items fixed in AGENTS.md
- [ ] All 8 additions present in AGENTS.md (including Task Debugging Quick Reference)
- [ ] Debugging-lifecycle skill enhanced with missing observability content
- [ ] No stale content remains in either file relative to the E2E guide

### Must Have

- Fix the approval gate contradiction (line 55 vs line 81)
- Add wizard-based employee creation path
- Add `deepseek/deepseek-v4-flash` as reliable test model
- Annotate `Validating` as auto-pass
- Expand output contract description with submit-output mechanism
- Add new E2E guide to Plan E2E Validation table
- Broaden Plan E2E minimum scenario note beyond guest-messaging only
- Add condensed Task Debugging Quick Reference section to AGENTS.md (task state, container logs, harness log, execution metrics, Slack thread)
- Enhance debugging-lifecycle skill with health checks, execution metrics, harness log grep, delivery container docker ps, Slack thread inspection

### Must NOT Have (Guardrails)

- Do NOT update README.md — scope is AGENTS.md + debugging-lifecycle skill only
- Do NOT duplicate the full verbose Observability Cheat Sheet into AGENTS.md — add only the condensed quick-reference version (~30 lines)
- Do NOT add Known Issue #8 (approval cards for generated employees) — stays in guide only
- Do NOT add tenant-specific data (channel IDs, archetype IDs) to AGENTS.md — it's injected into every worker container
- Do NOT change the meaning or intent of any existing section — only fix inaccuracies and add missing information
- Do NOT rewrite or restructure sections beyond what's needed for the specific fixes

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None — documentation-only changes don't need unit tests
- **Framework**: N/A

### QA Policy

Every task includes grep-based verification that specific strings are present/absent in the updated files. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Documentation edits**: Use Bash (grep) — Search for specific strings, assert presence/absence

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both files edited in parallel):
├── Task 1: AGENTS.md — all 13 edits (6 fixes + 7 additions) [quick]
└── Task 2: debugging-lifecycle SKILL.md — observability enhancements + stale fix [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave  |
| ---- | ---------- | ------ | ----- |
| 1    | —          | F1-F4  | 1     |
| 2    | —          | F1-F4  | 1     |
| F1   | 1, 2       | —      | FINAL |
| F2   | 1, 2       | —      | FINAL |
| F3   | 1, 2       | —      | FINAL |
| F4   | 1, 2       | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Update AGENTS.md — Fix stale content and add missing information

  **What to do**:

  Apply all 13 edits to `AGENTS.md`. Each edit is precisely located by line number and section. Read the file first, then apply edits in order from top to bottom to avoid line-number drift.

  **FIX A — Line 55: Approval gate description is wrong**
  - Current: `When \`false\`, lifecycle short-circuits from \`Submitting\` directly to \`Done\`.`
  - Replace with: `When \`false\`, lifecycle short-circuits from \`Submitting\` to \`Delivering\` → \`Done\` (skips \`Reviewing\` and \`Approved\`).`
  - Rationale: Line 81 of the same file and the E2E guide both confirm `Delivering` is NOT skipped.

  **FIX B + ADDITION 1 — Lines 45–53: Restructure "Adding a New Employee" section**
  - Add the wizard as the primary creation path BEFORE the existing manual steps.
  - Add this paragraph before step 1:

    ```
    **Wizard (primary path)**: Use the dashboard wizard at `http://localhost:7701/dashboard/employees/new?tenant=<tenantId>`. Describe what the employee does in plain English → the archetype generator (`src/gateway/services/archetype-generator.ts`) auto-generates `identity`, `execution_steps`, `delivery_steps`, and `tool_registry` → save as draft → set `status` to `active` → trigger. For field quality validation, see the [AI Employee E2E Test Guide](docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md).
    ```

  - Rename existing step 1 header to: `**Manual seed (alternative)**:` and keep steps 1–7 as-is.
  - In step 1, add `tool_registry` and `status` (`'draft'` | `'active'`) to the field list, after `temperature`.

  **FIX C — Line 139: Clarify SLACK_BOT_TOKEN vs VLRE_SLACK_BOT_TOKEN**
  - Current: `**\`SLACK_BOT_TOKEN\` in \`.env\` is the VLRE workspace bot token only.\*\*`
  - Replace with: `**Two VLRE Slack tokens exist in \`.env\`\*\*: \`SLACK_BOT_TOKEN\` (used by the gateway Bolt app for Socket Mode) and \`VLRE_SLACK_BOT_TOKEN\` (seed-only — used by \`prisma/seed.ts\` to populate \`tenant_secrets\` on DB reset). For API calls from scripts or testing, use \`VLRE_SLACK_BOT_TOKEN\`. Both hold the same VLRE workspace bot token value but serve different consumption points.`
  - Rationale: The E2E guide exclusively uses `VLRE_SLACK_BOT_TOKEN` for all Slack API calls. Agents need to know which to use.

  **FIX D — Line 81: Annotate Validating as auto-pass**
  - In the lifecycle states string, change `Executing → Validating → Submitting` to `Executing → Validating (auto-pass) → Submitting`
  - Rationale: `employee-lifecycle.ts` line 759 logs `'State: Validating (auto-pass)'`. Without annotation, agents may think it's a blocking state and wait for it.

  **FIX E — Lines 594–609: Broaden Plan E2E Validation section**
  - Add a new row to the guide table:

    | `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` | AC1–AC8 | Wizard generation, field quality, full lifecycle with approval, Slack delivery |

  - Update the minimum-scenario note to cover more than just guest-messaging:

    ```
    **Minimum for any guest-messaging change**: Slack UX Scenario A (approve happy path).
    **Minimum for any archetype generator, wizard, or delivery pipeline change**: AI Employee E2E guide (AC1–AC8).
    Use the **Quick-Reference table** in each guide to identify which additional scenarios apply.
    ```

  **FIX F — Line 83: Expand output contract description**
  - Current: `OpenCode writes \`/tmp/summary.txt\` and \`/tmp/approval-message.json\`. Absence of BOTH is a hard failure.`
  - Replace with: `OpenCode writes \`/tmp/summary.txt\` and \`/tmp/approval-message.json\` via the \`submit-output.ts\` tool (\`--draft-file\` for full content, \`--classification\` for routing: \`NEEDS_APPROVAL\` or \`NO_ACTION_NEEDED\`). Absence of BOTH is a hard failure. If only a short summary appears in delivery (no actual content), \`--draft-file\` was missing from the generated \`submit-output\` call in \`execution_steps\` — the archetype generator has regressed.`

  **ADDITION 2 — Already covered by FIX E above** (new guide row in Plan E2E Validation table)

  **ADDITION 3 — Lines 16–20: Add deepseek/deepseek-v4-flash as reliable test model**
  - After the "Seeded catalog models" line, add:

    ```
    **Recommended for E2E testing**: `deepseek/deepseek-v4-flash` — confirmed reliable for tool calling. Some catalog models (e.g., `xiaomi/mimo-v2.5`) may not call bash tools, causing immediate task failure. When testing wizard-generated employees, override the model to `deepseek/deepseek-v4-flash` via DB before triggering.
    ```

  **ADDITION 4 — Lines 78–84: Add delivery container naming pattern**
  - After the "Output contract" bullet, add a new bullet:

    ```
    - **Container naming**: Execution: `employee-{taskId.slice(0,8)}`. Delivery: `employee-delivery-{taskId.slice(0,8)}`. Find both: `docker ps --filter name=employee-`.
    ```

  **ADDITION 5 — Lines 229–237: Add wizard URL to Dashboard URLs**
  - After the "Task execution logs" note, add:

    ```
    **Employee creation wizard**: `http://localhost:7701/dashboard/employees/new?tenant=<tenantId>` — generates archetype from a plain-English description.
    ```

  **ADDITION 6 — Lines 549–586: Clarify two test employee recommendations**
  - After the existing `real-estate-motivation-bot-2` section, add a note:

    ```
    **For full approval path testing** (wizard → execution → Reviewing → Approved → Delivering → Done): Use the wizard to generate a motivational message employee per the [AI Employee E2E Test Guide](docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md). Override model to `deepseek/deepseek-v4-flash`. This exercises the full approval flow that `real-estate-motivation-bot-2` (which has `approval_required: false`) skips.
    ```

  **ADDITION 7 — Lines 312–330: Surface archetype-generator.ts in Project Structure**
  - In the `services/` description, change:
    `Business logic services (dispatcher, task creation, tenant/secret management, archetype generation, interaction classification, and more). Browse \`src/gateway/services/\` for the full list.`
  - To:
    `Business logic services: archetype generator (\`archetype-generator.ts\` — wizard LLM prompt for employee creation), dispatcher, task creation, tenant/secret management, interaction classification, and more. Browse \`src/gateway/services/\` for the full list.`

  **ADDITION 8 — After "Known Issues" section (~line 449): Add condensed Task Debugging Quick Reference**
  - Add a new `## Task Debugging Quick Reference` section after "Known Issues" and before "Prometheus Planning". This is the condensed version of the guide's Observability Cheat Sheet — essential commands only, no explanations. The `debugging-lifecycle` skill has the deep-dive content (decision tree, root cause tables, watchdog details); this section is the always-available quick lookup.

    ````markdown
    ## Task Debugging Quick Reference

    Assumes `TASK_ID` is set. Container name prefix: `${TASK_ID:0:8}`. For deeper diagnostics, load the `debugging-lifecycle` skill.

    **Task state:**

    ```bash
    # Current status
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT status, updated_at FROM tasks WHERE id = '$TASK_ID';"

    # Full lifecycle trace
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT from_status, to_status, created_at FROM task_status_log WHERE task_id = '$TASK_ID' ORDER BY created_at;"
    ```
    ````

    **Worker container** (active during `Executing`):

    ```bash
    docker ps --filter name=employee-${TASK_ID:0:8}
    docker logs -f employee-${TASK_ID:0:8}
    ```

    **Delivery container** (active during `Delivering`):

    ```bash
    docker ps --filter name=employee-delivery-${TASK_ID:0:8}
    docker logs -f employee-delivery-${TASK_ID:0:8}
    ```

    **Harness log** (persists after container exits):

    ```bash
    # Harness events only (skip OpenCode noise)
    grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30

    # Errors and warnings only
    grep '"level":[45][0-9]' /tmp/employee-${TASK_ID:0:8}.log

    # Dashboard viewer (noise-filtered, recommended)
    # http://localhost:7701/dashboard/tasks/<TASK_ID>/logs?tenant=<TENANT_ID>
    ```

    **Execution metrics** (spot runaway LLM loops):

    ```bash
    PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -c "SELECT prompt_tokens, completion_tokens, estimated_cost_usd FROM executions WHERE task_id = '$TASK_ID';"
    ```

    **Slack thread** (verify what was posted):

    ```bash
    source .env
    NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
      -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')

    curl -s "https://slack.com/api/conversations.replies" \
      -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
      -d "channel=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
        -t -c "SELECT metadata->>'notify_slack_channel' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')&ts=$NOTIFY_TS&limit=20" \
      | jq '[.messages[] | {ts: .ts, text: (.text | .[0:200])}]'
    ```

    ```

    ```

  **SKILL TABLE UPDATE — Lines 90–98: Update debugging-lifecycle trigger description**
  - Change: `Debug a stuck or failed task in the lifecycle`
  - To: `Debug a stuck or failed task, inspect container logs, or query task observability`

  **Must NOT do**:
  - Do NOT modify README.md
  - Do NOT rewrite or restructure entire sections — apply only the specific edits listed
  - Do NOT add tenant-specific data (channel IDs, archetype UUIDs) to any shared section
  - Do NOT add the Observability Cheat Sheet content to AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: All edits are precisely specified with exact old/new text. No ambiguity, no design decisions needed.
  - **Skills**: []
    - No domain skills needed — the task is pure text editing with exact instructions.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `AGENTS.md` — the file being edited. Read it in full before making changes.
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md` — the source of truth for all factual claims being added.

  **API/Type References**:
  - `.env.example:102,125` — confirms both `SLACK_BOT_TOKEN` and `VLRE_SLACK_BOT_TOKEN` exist as separate env vars.
  - `src/inngest/employee-lifecycle.ts:754-766` — confirms `Validating` is auto-pass and `Submitting → Delivering → Done` is the correct no-approval path.
  - `src/gateway/services/archetype-generator.ts` — the file referenced in the wizard addition; confirm it exists before adding the reference.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 6 fixes applied correctly
    Tool: Bash (grep)
    Preconditions: Task 1 edits complete
    Steps:
      1. grep -c "directly to Done" AGENTS.md → expected: 0 (FIX A removed stale text)
      2. grep -c "Delivering.*Done.*skips.*Reviewing" AGENTS.md → expected: 1 (FIX A new text)
      3. grep -c "wizard\|Wizard" AGENTS.md → expected: >= 3 (FIX B added wizard references)
      4. grep -c "tool_registry" AGENTS.md → expected: >= 1 (FIX B added field)
      5. grep -c "VLRE_SLACK_BOT_TOKEN" AGENTS.md → expected: >= 1 (FIX C clarified)
      6. grep -c "Validating (auto-pass)" AGENTS.md → expected: >= 1 (FIX D annotated)
      7. grep -c "2026-05-28-1420-ai-employee-e2e-test-guide" AGENTS.md → expected: >= 2 (FIX E + existing ref)
      8. grep -c "draft-file" AGENTS.md → expected: >= 1 (FIX F expanded)
    Expected Result: All grep counts match expected values
    Failure Indicators: Any count mismatch
    Evidence: .sisyphus/evidence/task-1-fixes-grep.txt

  Scenario: All 8 additions present
    Tool: Bash (grep)
    Preconditions: Task 1 edits complete
    Steps:
      1. grep -c "deepseek/deepseek-v4-flash" AGENTS.md → expected: >= 1 (ADDITION 3)
      2. grep -c "employee-delivery" AGENTS.md → expected: >= 1 (ADDITION 4)
      3. grep -c "employees/new" AGENTS.md → expected: >= 1 (ADDITION 5)
      4. grep -c "full approval path testing" AGENTS.md → expected: >= 1 (ADDITION 6)
      5. grep -c "archetype.generator\|archetype-generator" AGENTS.md → expected: >= 1 (ADDITION 7)
      6. grep -c "Task Debugging Quick Reference" AGENTS.md → expected: 1 (ADDITION 8)
      7. grep -c "opencode-harness" AGENTS.md → expected: >= 1 (ADDITION 8 — harness log grep)
      8. grep -c "estimated_cost_usd" AGENTS.md → expected: >= 1 (ADDITION 8 — execution metrics)
      9. grep -c "query task observability" AGENTS.md → expected: 1 (SKILL TABLE UPDATE)
    Expected Result: All grep counts match expected values
    Failure Indicators: Any count mismatch
    Evidence: .sisyphus/evidence/task-1-additions-grep.txt

  Scenario: Guardrails respected — no forbidden changes
    Tool: Bash (git diff)
    Preconditions: Task 1 edits complete
    Steps:
      1. git diff --name-only → must contain ONLY AGENTS.md (no README.md, no source files)
      2. grep -c "C0960S2Q8RL\|C0AMGJQN05S" AGENTS.md → expected: 0 (no tenant-specific channel IDs added)
    Expected Result: Only AGENTS.md modified, no tenant-specific data added
    Failure Indicators: README.md in diff, or channel IDs found
    Evidence: .sisyphus/evidence/task-1-scope-check.txt
  ```

  **Commit**: YES (groups with Task 2 if convenient)
  - Message: `docs(agents): sync AGENTS.md with E2E test guide findings`
  - Files: `AGENTS.md`
  - Pre-commit: `grep -c "directly to Done" AGENTS.md` (must return 0)

---

- [x] 2. Enhance debugging-lifecycle skill with observability commands

  **What to do**:

  Update `.opencode/skills/debugging-lifecycle/SKILL.md` with missing observability content from the E2E guide's cheat sheet, plus fix one stale line.

  **FIX — Line 52: Stale approval path**
  - Current: `... → Submitting → Done   (no Reviewing step)`
  - Replace with: `... → Submitting → Delivering → Done   (no Reviewing step)`
  - Same bug as AGENTS.md line 55 — `Delivering` is not skipped.

  **ADD — New section: "Service Health Checks" (add after the State Reference Table, before "How the Lifecycle Polls")**

  ```markdown
  ## Service Health Checks (Run First)

  Before diagnosing any task issue, confirm all services are up:

  | Service        | Command                                                                   | Expected           |
  | -------------- | ------------------------------------------------------------------------- | ------------------ |
  | Gateway        | `curl -s http://localhost:7700/health \| jq .`                            | `{"status":"ok"}`  |
  | Inngest        | `curl -s http://localhost:8288/health \| jq .`                            | `{"status":"ok"}`  |
  | Dashboard      | `curl -s http://localhost:7701/dashboard/ -o /dev/null -w "%{http_code}"` | `200`              |
  | Inngest Dev UI | Open `http://localhost:8288`                                              | Visual run history |

  If gateway is down: `pnpm dev`. If Docker image is stale: `docker build -t ai-employee-worker:latest .`
  ```

  **ADD — New section: "Execution Metrics" (add after "Reading task_status_log", before "Admin API Commands")**

  ````markdown
  ## Execution Metrics (Token Usage & Cost)

  Spot runaway LLM loops or unexpectedly expensive runs:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -c "SELECT prompt_tokens, completion_tokens, estimated_cost_usd FROM executions WHERE task_id = '$TASK_ID';"
  ```
  ````

  **Red flags**: `completion_tokens > 50000` (model looping), `estimated_cost_usd > 0.50` (expensive run for simple employee).

  ````

  **ADD — New section: "Harness Log Filtering" (add inside "Stuck State Diagnostics" § "State: Executing", after the container log commands)**

  ```markdown
  **Harness log file** (persists after container exits — more complete than `docker logs`):

  ```bash
  # Full log (often 1–5 MB)
  cat /tmp/employee-${TASK_ID:0:8}.log

  # Harness events only (skip OpenCode server noise)
  grep '"component":"opencode-harness"' /tmp/employee-${TASK_ID:0:8}.log | tail -30

  # Errors and warnings only (level 40 = warn, level 50 = error)
  grep '"level":[45][0-9]' /tmp/employee-${TASK_ID:0:8}.log

  # Dashboard viewer (noise-filtered, recommended for human reading)
  # http://localhost:7701/dashboard/tasks/<TASK_ID>/logs?tenant=<TENANT_ID>
  ````

  ````

  **ADD — Update "State: Delivering" section (line ~157–173): Add local Docker container commands**
  - After the existing `fly logs` command block, add:

  ```markdown
  **Local Docker mode:**

  ```bash
  # Find delivery container
  docker ps --filter name=employee-delivery-${TASK_ID:0:8}

  # Tail delivery logs
  docker logs -f employee-delivery-${TASK_ID:0:8}
  ````

  ````

  **ADD — New section: "Slack Thread Inspection" (add after "Slack Message Updates by State" at end of file)**

  ```markdown
  ## Slack Thread Inspection

  Check what was actually posted to the notification thread:

  ```bash
  source .env
  NOTIFY_TS=$(PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -t -c "SELECT metadata->>'notify_slack_ts' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n')

  curl -s "https://slack.com/api/conversations.replies" \
    -H "Authorization: Bearer $VLRE_SLACK_BOT_TOKEN" \
    -d "channel=<CHANNEL_ID>&ts=$NOTIFY_TS&limit=20" \
    | jq '[.messages[] | {ts: .ts, text: (.text | .[0:200])}]'
  ````

  **Expected thread structure (approval path):**

  | Position | Content                                                             |
  | -------- | ------------------------------------------------------------------- |
  | MSG 0    | Original notify-received message (updated to ✅ Done at completion) |
  | MSG 1    | Approval card (ts also stored in `pending_approvals.slack_ts`)      |
  | MSG 2    | Delivery message with actual content                                |

  Get the channel ID from `tasks.metadata->>'notify_slack_channel'`:

  ```bash
  PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d ai_employee \
    -t -c "SELECT metadata->>'notify_slack_channel' FROM tasks WHERE id = '$TASK_ID';" | tr -d ' \n'
  ```

  ```

  **Must NOT do**:
  - Do NOT rewrite the existing diagnostic decision tree, stuck-state tables, or cancellation/failure sections — they are already excellent
  - Do NOT add tenant-specific data (hardcoded channel IDs)
  - Do NOT duplicate content already in the skill — only ADD missing pieces

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: All additions are precisely specified with exact markdown content. No design decisions needed.
  - **Skills**: []
    - No domain skills needed — pure text editing.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.opencode/skills/debugging-lifecycle/SKILL.md` — the file being edited. Read it in full before making changes.
  - `docs/testing/2026-05-28-1420-ai-employee-e2e-test-guide.md:404-518` — the Observability Cheat Sheet section that is the source for all new content.

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:754-766` — confirms the `Submitting → Delivering → Done` path (for the stale fix).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```

  Scenario: Stale approval path fixed
  Tool: Bash (grep)
  Preconditions: Task 2 edits complete
  Steps: 1. grep -n "Submitting → Done" .opencode/skills/debugging-lifecycle/SKILL.md 2. Verify the shortcircuit path line now includes "Delivering" between Submitting and Done
  Expected Result: Line reads "... → Submitting → Delivering → Done (no Reviewing step)"
  Failure Indicators: "Submitting → Done" without "Delivering" still present
  Evidence: .sisyphus/evidence/task-2-stale-fix.txt

  Scenario: Health checks section added
  Tool: Bash (grep)
  Preconditions: Task 2 edits complete
  Steps: 1. grep -c "Service Health Checks" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1 2. grep -c "localhost:7700/health" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1 3. grep -c "localhost:8288/health" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1
  Expected Result: Health check section present with gateway and Inngest URLs
  Evidence: .sisyphus/evidence/task-2-health-checks.txt

  Scenario: Execution metrics section added
  Tool: Bash (grep)
  Preconditions: Task 2 edits complete
  Steps: 1. grep -c "Execution Metrics" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1 2. grep -c "prompt_tokens" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1 3. grep -c "estimated_cost_usd" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1
  Expected Result: Metrics section present with token and cost queries
  Evidence: .sisyphus/evidence/task-2-metrics.txt

  Scenario: Harness log filtering added
  Tool: Bash (grep)
  Preconditions: Task 2 edits complete
  Steps: 1. grep -c "opencode-harness" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1 2. grep -c 'level.\*\[45\]' .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1
  Expected Result: Log filtering grep patterns present
  Evidence: .sisyphus/evidence/task-2-log-filtering.txt

  Scenario: Delivery container docker commands added
  Tool: Bash (grep)
  Preconditions: Task 2 edits complete
  Steps: 1. grep -c "employee-delivery" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 2 (docker ps + docker logs)
  Expected Result: Local Docker delivery container commands present
  Evidence: .sisyphus/evidence/task-2-delivery-container.txt

  Scenario: Slack thread inspection added
  Tool: Bash (grep)
  Preconditions: Task 2 edits complete
  Steps: 1. grep -c "Slack Thread Inspection" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1 2. grep -c "conversations.replies" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1 3. grep -c "notify_slack_ts" .opencode/skills/debugging-lifecycle/SKILL.md → expected: >= 1
  Expected Result: Slack thread inspection section with API call and expected structure
  Evidence: .sisyphus/evidence/task-2-slack-thread.txt

  ```

  **Commit**: YES (can group with Task 1)
  - Message: `docs(skills): enhance debugging-lifecycle with observability commands`
  - Files: `.opencode/skills/debugging-lifecycle/SKILL.md`
  - Pre-commit: `grep -c "Submitting → Done" .opencode/skills/debugging-lifecycle/SKILL.md` (should return 0 — stale text removed)
  ```

---

- [x] 3. Notify completion

  Send Telegram notification that the plan is complete.

  ```bash
  tsx scripts/telegram-notify.ts "✅ agents-md-e2e-guide-sync complete — All tasks done. Come back to review results."
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Final Verification Wave)
  - **Blocks**: None
  - **Blocked By**: F1, F2, F3, F4

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify the edit exists in AGENTS.md or SKILL.md (grep for specific strings). For each "Must NOT Have": search both files for forbidden patterns — reject with file:line if found. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` and `pnpm lint` to confirm no build/lint regressions from the documentation changes (AGENTS.md and SKILL.md are not compiled, but verify no accidental source changes). Check both files for: broken markdown links, inconsistent formatting, orphaned references. Verify no trailing whitespace issues or markdown lint violations.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Markdown Quality [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Read both updated files end-to-end. Cross-reference every factual claim against the source files:
  - Lifecycle states against `src/inngest/employee-lifecycle.ts`
  - Env var names against `.env.example`
  - File paths against actual filesystem (glob)
  - Container naming patterns against `src/inngest/employee-lifecycle.ts` and `src/workers/opencode-harness.mts`
  - Dashboard URLs against actual route config
    Save findings to `.sisyphus/evidence/final-qa/`.
    Output: `Facts Verified [N/N] | Cross-Refs [N valid/N broken] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was edited (no missing), nothing beyond spec was edited (no creep). Specifically verify: README.md was NOT modified, no source code files were modified, no new files were created. Flag any changes outside AGENTS.md and SKILL.md.
      Output: `Tasks [N/N compliant] | Scope [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

- **1**: `docs(agents): sync AGENTS.md with E2E test guide findings` — `AGENTS.md`
- **2**: `docs(skills): enhance debugging-lifecycle with observability commands` — `.opencode/skills/debugging-lifecycle/SKILL.md`

Commits can be combined into one if preferred:

- `docs: sync AGENTS.md and debugging-lifecycle skill with E2E test guide` — `AGENTS.md`, `.opencode/skills/debugging-lifecycle/SKILL.md`

---

## Success Criteria

### Verification Commands

```bash
# Approval gate fix (A) — should NOT find "directly to Done"
grep -n "directly to Done" AGENTS.md
# Expected: no output

# Wizard path added (B/1) — should find "wizard" in Adding a New Employee section
grep -n "wizard" AGENTS.md
# Expected: at least 1 match near "Adding a New Employee"

# Validating annotated (D) — should find "auto-pass" near Validating
grep -n "Validating.*auto-pass\|auto-pass.*Validating" AGENTS.md
# Expected: at least 1 match

# deepseek model added (3) — should find deepseek/deepseek-v4-flash
grep -n "deepseek/deepseek-v4-flash" AGENTS.md
# Expected: at least 1 match

# New E2E guide in Plan E2E Validation table (2)
grep -n "2026-05-28-1420-ai-employee-e2e-test-guide" AGENTS.md
# Expected: at least 2 matches (Reference Documents + Plan E2E Validation)

# Output contract expanded (F) — should find submit-output or --draft-file
grep -n "draft-file\|submit-output" AGENTS.md
# Expected: at least 1 match near "Output contract"

# Delivery container pattern added (4)
grep -n "employee-delivery" AGENTS.md
# Expected: at least 1 match

# Task Debugging Quick Reference added (8)
grep -n "Task Debugging Quick Reference" AGENTS.md
# Expected: 1 match
grep -n "estimated_cost_usd" AGENTS.md
# Expected: at least 1 match

# Debugging skill enhanced — health checks
grep -n "health" .opencode/skills/debugging-lifecycle/SKILL.md
# Expected: at least 1 match

# Debugging skill — stale approval path fixed
grep -n "Delivering" .opencode/skills/debugging-lifecycle/SKILL.md
# Expected: at least 1 match in shortcircuit paths section

# README.md NOT modified
git diff --name-only README.md
# Expected: no output
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes
