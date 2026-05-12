# Feedback Pipeline E2E Execution & Bug Fix

## TL;DR

> **Quick Summary**: Execute all 6 scenarios from `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md` against the live local dev environment, diagnosing and fixing any bugs found in-flight so every scenario passes end-to-end.
>
> **Deliverables**:
>
> - All 6 E2E scenarios passing (A through F)
> - Any bugs discovered fixed in source code
> - Docker image rebuilt if worker code changes
> - Summary of findings (what passed, what broke, what was fixed)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO — sequential (shared Airbnb thread, Slack channels, and DB state)
> **Critical Path**: Prerequisites → Scenarios A+B+C → Scenario D → Scenarios E+F → Summary

---

## Context

### Original Request

Execute the feedback pipeline E2E test guide to verify the complete feedback loop works correctly: feedback capture → rule extraction → PM review → confirmation → injection back into the AI employee's next run.

### Interview Summary

**Key Discussions**:

- Investigated existing feedback data: 32 feedback items, 31 learned_rules (27 with empty rule_text), only 1 confirmed rule, 17 unconsolidated feedback items
- Created the E2E test guide together covering all 6 pipeline stages
- Identified that rule extraction has a very low success rate — most `edit_diff` extractions produce empty `rule_text`

**Research Findings**:

- Pipeline spans 4 source files: `interaction-handler.ts`, `rule-extractor.ts`, `feedback-summarizer.ts`, `employee-lifecycle.ts`
- Slack button actions handled in `handlers.ts` (`rule_confirm`, `rule_reject`, `rule_rephrase`, `batch_rules_confirm`)
- `FEEDBACK_CONTEXT` and `LEARNED_RULES_CONTEXT` env vars are built in the lifecycle `executing` step (lines 490–609) and injected into Docker/Fly.io container env
- Feedback-summarizer cron (`0 */6 * * *`) handles both consolidation (threshold ≥ 5) and synthesis (≥ 2 confirmed rules)
- Only `confirmed` rules are injected; `proposed`, `rejected`, `awaiting_input` are excluded

---

## Work Objectives

### Core Objective

Verify the entire feedback pipeline works end-to-end by executing all 6 scenarios from the test guide, fixing any issues found along the way.

### Concrete Deliverables

- 6 E2E scenarios executed and verified (A through F)
- All discovered bugs fixed in source code
- Docker image rebuilt if any `src/workers/` or `src/worker-tools/` changes
- A `.sisyphus/evidence/` folder with test evidence (DB queries, screenshots, log excerpts)

### Definition of Done

- [x] All 6 scenarios reach their expected final state
- [x] All DB checks from the guide produce expected results
- [x] Confirmed rules appear in `LEARNED_RULES_CONTEXT` env var on subsequent runs
- [x] Consolidated themes appear in `FEEDBACK_CONTEXT` env var on subsequent runs
- [x] `git status` is clean (all changes committed)

### Must Have

- Every verification checkpoint from the guide must be explicitly checked
- Any code fix must be tested by re-running the scenario that exposed the bug
- Evidence of each scenario's success captured to `.sisyphus/evidence/`

### Must NOT Have (Guardrails)

- Do NOT modify the test guide document itself — it is the source of truth
- Do NOT change archetype system prompts or instructions — this is a pipeline test, not a prompt engineering exercise
- Do NOT delete or modify existing production feedback/learned_rules data — only add new test data
- Do NOT skip verification checkpoints — every DB check, log check, and Slack visual check in the guide must be performed
- Do NOT run scenarios out of order — D depends on A/B/C state, E+F depend on accumulated feedback

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None for this plan — this IS the E2E test execution
- **Framework**: N/A

### QA Policy

Each task's QA scenarios are defined by the test guide itself — the guide provides exact DB queries, log patterns, and Slack visual checks for every step. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Browser interaction**: Use Playwright MCP browser — navigate Airbnb, interact with Slack buttons
- **DB verification**: Use Bash (psql) — run the exact queries from the guide
- **Log inspection**: Use Bash (tail/grep) — check gateway logs for expected patterns
- **Inngest inspection**: Use Playwright MCP browser — navigate to `http://localhost:8288` to inspect function runs

---

## Execution Strategy

### Sequential Execution (shared state constraint)

> These scenarios CANNOT be parallelized. They share a single Airbnb thread
> (`aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`), the same Slack channels (`C0AMGJQN05S` and
> `C0960S2Q8RL`), and the same DB tables. Running them in parallel would cause task superseding,
> approval card confusion, and race conditions on `learned_rules` state.

```
Wave 1 (Prerequisites):
└── Task 1: Verify services and clean state [quick]

Wave 2 (Rule creation — scenarios A, B, C):
└── Task 2: Execute Scenarios A + B + C sequentially (depends: 1) [deep]
    ├── Scenario A: Edit & Send → extractable rule → Confirm
    ├── Scenario B: Teaching via @mention → rule extracted → Confirm
    └── Scenario C: Edit & Send → awaiting_input → PM reply → Confirm

Wave 3 (Injection verification — scenario D):
└── Task 3: Execute Scenario D (depends: 2) [deep]
    └── Scenario D: Trigger new task → verify LEARNED_RULES_CONTEXT and FEEDBACK_CONTEXT

Wave 4 (Consolidation & synthesis — scenarios E, F):
└── Task 4: Execute Scenarios E + F sequentially (depends: 2) [deep]
    ├── Scenario E: Invoke feedback-summarizer → batch card → Confirm All → verify injection
    └── Scenario F: 2+ confirmed rules → synthesized merged rule → Confirm

Wave FINAL (Review + cleanup):
├── Task F1: Summary of findings [deep]
└── Task F2: Notify completion [quick]
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave  |
| ---- | ---------- | ------ | ----- |
| 1    | —          | 2      | 1     |
| 2    | 1          | 3, 4   | 2     |
| 3    | 2          | F1     | 3     |
| 4    | 2          | F1     | 4     |
| F1   | 3, 4       | F2     | FINAL |
| F2   | F1         | —      | FINAL |

> Wave 3 and Wave 4 are sequential (not parallel) because both require triggering
> guest-messaging tasks on the same Airbnb thread. Running simultaneously would cause
> the supersede path to interfere.

### Agent Dispatch Summary

- **Wave 1**: **1 task** — T1 → `quick`
- **Wave 2**: **1 task** — T2 → `deep` + `dev-browser`
- **Wave 3**: **1 task** — T3 → `deep` + `dev-browser`
- **Wave 4**: **1 task** — T4 → `deep` + `dev-browser`
- **FINAL**: **2 tasks** — F1 → `deep`, F2 → `quick`

---

## TODOs

- [x] 1. Verify prerequisites and establish clean baseline

  **What to do**:
  - Verify all services are running: gateway (`curl localhost:7700/health`), Inngest (`curl localhost:8288/health`), Socket Mode connected (check `ai-dev` tmux session or `/tmp/ai-dev.log`)
  - If services are NOT running, start them: `pnpm dev` in a tmux session named `ai-dev`
  - Check Docker is available: `docker ps` should work
  - Verify the Airbnb test thread is accessible: navigate to `https://www.airbnb.com/guest/messages/2525238359` via Playwright browser — confirm the page loads and the compose bar is visible
  - Verify Slack is accessible: navigate to `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S` (`#cs-guest-communication`) and `https://app.slack.com/client/T06KFDGLHS6/C0960S2Q8RL` (notification channel) — confirm both load
  - Snapshot the current baseline state:
    ```bash
    psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
      "SELECT COUNT(*) AS total_feedback FROM feedback WHERE tenant_id = '00000000-0000-0000-0000-000000000003';"
    psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
      "SELECT status, COUNT(*) FROM learned_rules WHERE tenant_id = '00000000-0000-0000-0000-000000000003' GROUP BY status ORDER BY status;"
    psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
      "SELECT COUNT(*) AS kb_count FROM knowledge_bases WHERE archetype_id = '00000000-0000-0000-0000-000000000015';"
    ```
  - Save baseline counts to `.sisyphus/evidence/task-1-baseline.txt`

  **Must NOT do**:
  - Do NOT delete or modify any existing feedback, learned_rules, or knowledge_bases data
  - Do NOT change any service configuration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward service health checks and DB snapshots — no complex logic
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Needed to verify Airbnb and Slack pages load in Playwright browser

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md:9-42` — Prerequisites section with all service checks and fixed test resources

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All services are healthy
    Tool: Bash (curl)
    Preconditions: Local dev environment configured
    Steps:
      1. curl -s http://localhost:7700/health → parse JSON
      2. curl -s http://localhost:8288/health → parse JSON
      3. grep "Socket Mode connected" in /tmp/ai-dev.log or tmux ai-dev output
    Expected Result: Gateway returns {"status":"ok"}, Inngest returns {"status":200}, Socket Mode line present
    Failure Indicators: Any curl returns non-200 or connection refused; no Socket Mode line in logs
    Evidence: .sisyphus/evidence/task-1-services-health.txt

  Scenario: Baseline state captured
    Tool: Bash (psql)
    Preconditions: Database is running
    Steps:
      1. Run all 3 baseline queries above
      2. Save output to evidence file
    Expected Result: Queries return integer counts without error
    Failure Indicators: psql connection refused or query error
    Evidence: .sisyphus/evidence/task-1-baseline.txt
  ```

  **Commit**: NO

---

- [x] 2. Execute Scenarios A + B + C — Rule creation and confirmation

  **What to do**:
  Execute the three rule-creation scenarios sequentially, following every step in the test guide. Fix any bugs found in-flight, then re-verify.

  **Scenario A — Edit & Send: extractable rule → proposed card → Confirm:**
  1. Send Airbnb message: `What time is checkout? [e2e-test-{epoch}]` via Playwright browser
  2. Wait for webhook → task created → worker executes → approval card appears in `#cs-guest-communication` thread
  3. Click "✏️ Edit & Send" — modify the draft meaningfully (add a personalized sign-off or specific detail)
  4. Submit the edit modal
  5. Verify `employee/rule.extract-requested` event fired (check gateway logs)
  6. Verify rule-extractor ran in Inngest dashboard (`http://localhost:8288`) — confirm `extract-rule` step returned `{"extractable": true, "rule": "..."}`
  7. Navigate to `C0960S2Q8RL` notification channel — confirm `🧠 New behavioral rule proposed` card appeared
  8. DB check: `learned_rules` has new row with `source = 'edit_diff'`, `status = 'proposed'`, non-empty `rule_text`
  9. Click "✅ Confirm" on the rule card
  10. DB check: rule now has `status = 'confirmed'` and `confirmed_at` set

  **Scenario B — Teaching via @mention → rule extracted → Confirm:**
  1. In `#cs-guest-communication`, @mention the bot with: `@Papi chulo When guests ask about parking, always mention that street parking is free and available directly in front of the property.`
  2. Verify bot replies with warm acknowledgment in channel/thread
  3. DB check: `feedback` table has new row with `feedback_type = 'teaching'`
  4. Verify rule review card appears in `C0960S2Q8RL` with the extracted parking rule
  5. DB check: `learned_rules` has new row with `source = 'rejection'`, `status = 'proposed'`
  6. Click "✅ Confirm"
  7. DB check: `status = 'confirmed'`

  **Scenario C — Edit & Send: non-extractable → awaiting_input → PM reply → Confirm:**
  1. Send new Airbnb message: `Do you have WiFi? [e2e-test-{epoch}]`
  2. Wait for approval card in `#cs-guest-communication`
  3. Click "✏️ Edit & Send" — make only a trivial change (e.g., swap period for exclamation mark)
  4. Submit the modal
  5. Verify rule-extractor returns `{"extractable": false}` in Inngest dashboard
  6. Verify "What should I learn from this change?" appears as a thread reply in `#cs-guest-communication`
  7. DB check: `learned_rules` has new row with `status = 'awaiting_input'`, empty `rule_text`
  8. Reply in the thread: `Always confirm the guest's name at the start of the message when they mention they're checking in late.`
  9. Verify a new rule review card appears in the thread with the typed rule
  10. DB check: `learned_rules` row updated to `status = 'proposed'`, `rule_text` set
  11. Click "✅ Confirm"
  12. DB check: `status = 'confirmed'`

  **If any step fails:**
  - Diagnose the root cause by reading relevant source code and logs
  - Fix the code in the appropriate source file
  - If the fix is in `src/workers/` or `src/worker-tools/`: rebuild Docker image with `docker build -t ai-employee-worker:latest .`
  - If the fix is in `src/gateway/` or `src/inngest/`: gateway auto-restarts via tsx watch — just wait for restart
  - Re-run the failed step to verify the fix
  - Commit the fix: `fix(feedback): <description>`

  **Must NOT do**:
  - Do NOT skip any verification checkpoint from the guide
  - Do NOT modify the test guide document
  - Do NOT change archetype instructions or system prompts
  - Do NOT manually insert rows into learned_rules — all rules must flow through the pipeline

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-step E2E flow across browser, DB, logs, and Inngest dashboard. Requires autonomous diagnosis and code fixes if issues found. Long-running task with many checkpoints.
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Required for Playwright MCP browser interaction (Airbnb messages, Slack buttons, Inngest dashboard)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md:45-258` — Scenarios A, B, and C with all exact steps, DB queries, and verification checkpoints

  **API/Type References**:
  - `src/inngest/rule-extractor.ts` — Full rule extraction logic; `extract-rule` step (line 130), `store-proposed-rule` (line 160), `post-awaiting-input` (line 265)
  - `src/inngest/interaction-handler.ts` — Teaching capture in `route-and-store` step (line 304), `detect-awaiting-input-rule` (line 65), `capture-awaiting-input-reply` (line 186)
  - `src/gateway/slack/handlers.ts` — `rule_confirm`, `rule_reject`, `rule_rephrase` button handlers; `guest_edit` handler that fires `employee/rule.extract-requested`

  **External References**:
  - Airbnb test thread: `https://www.airbnb.com/guest/messages/2525238359`
  - Slack approval channel: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`
  - Slack notification channel: `https://app.slack.com/client/T06KFDGLHS6/C0960S2Q8RL`
  - Inngest dashboard: `http://localhost:8288`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Scenario A — Edit & Send produces confirmed rule
    Tool: Playwright / Bash (psql)
    Preconditions: Services running, Airbnb and Slack accessible
    Steps:
      1. Send Airbnb message via Playwright compose bar
      2. Wait for approval card in Slack (poll every 30s, timeout 5min)
      3. Click "Edit & Send", modify draft, submit modal
      4. psql: SELECT status FROM learned_rules WHERE tenant_id='00000000-0000-0000-0000-000000000003' AND source='edit_diff' ORDER BY created_at DESC LIMIT 1 → 'proposed'
      5. Click "Confirm" on rule card in C0960S2Q8RL
      6. psql: same query → 'confirmed'
    Expected Result: Rule transitions proposed → confirmed; rule_text is non-empty
    Failure Indicators: No rule card appears; status stuck at 'proposed'; empty rule_text
    Evidence: .sisyphus/evidence/task-2-scenario-a.txt

  Scenario: Scenario B — @mention teaching produces confirmed rule
    Tool: Playwright / Bash (psql)
    Preconditions: Scenario A complete
    Steps:
      1. Type @mention teaching message in #cs-guest-communication
      2. Verify bot ack reply appears
      3. psql: SELECT feedback_type FROM feedback WHERE tenant_id='...' ORDER BY created_at DESC LIMIT 1 → 'teaching'
      4. Check rule card in C0960S2Q8RL
      5. Click "Confirm"
      6. psql: learned_rules status → 'confirmed'
    Expected Result: Teaching stored as feedback row; rule extracted, proposed, and confirmed
    Failure Indicators: No ack reply; no rule card; intent classified incorrectly
    Evidence: .sisyphus/evidence/task-2-scenario-b.txt

  Scenario: Scenario C — awaiting_input → PM reply → confirmed
    Tool: Playwright / Bash (psql)
    Preconditions: Scenario B complete
    Steps:
      1. Send Airbnb message, get approval card
      2. Click "Edit & Send" with trivial change
      3. Verify "What should I learn?" appears in thread
      4. psql: learned_rules status → 'awaiting_input', rule_text = ''
      5. Reply with explicit rule text
      6. Verify rule card appears in thread
      7. Click "Confirm"
      8. psql: status → 'confirmed'
    Expected Result: Full awaiting_input flow completes; PM-typed rule is stored and confirmed
    Failure Indicators: No "What should I learn?" reply; thread reply not captured; rule card not posted
    Evidence: .sisyphus/evidence/task-2-scenario-c.txt
  ```

  **Evidence to Capture:**
  - [ ] task-2-scenario-a.txt — DB query outputs for Scenario A
  - [ ] task-2-scenario-b.txt — DB query outputs for Scenario B
  - [ ] task-2-scenario-c.txt — DB query outputs for Scenario C
  - [ ] Screenshots of each rule card in Slack before and after confirmation

  **Commit**: YES (only if bugs are fixed)
  - Message: `fix(feedback): <description of issue and fix>`
  - Pre-commit: re-run the failed scenario step

---

- [x] 3. Execute Scenario D — Injection verification

  **What to do**:
  Verify that confirmed rules from Scenarios A/B/C are injected into the next worker run via the `LEARNED_RULES_CONTEXT` and `FEEDBACK_CONTEXT` environment variables.

  Follow the test guide Scenario D exactly:
  1. Confirm at least 3 confirmed rules exist (from Scenarios A, B, C):
     ```bash
     psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
       "SELECT rule_text, source, confirmed_at FROM learned_rules WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND status = 'confirmed' ORDER BY confirmed_at DESC;"
     ```
  2. Send a new Airbnb message: `Is there a coffee maker? [e2e-test-{epoch}]`
  3. Watch gateway logs for `Feedback context assembled` line — capture `feedbackItems`, `kbThemes`, `feedbackContextLen` values
  4. While the task is `Executing`, inspect the Docker container environment:
     ```bash
     CONTAINER=$(docker ps --filter name=employee- --format "{{.Names}}" | head -1)
     docker inspect $CONTAINER | python3 -c "
     import json, sys
     data = json.load(sys.stdin)
     env = data[0].get('Config', {}).get('Env', [])
     for e in env:
         if 'LEARNED_RULES' in e or 'FEEDBACK_CONTEXT' in e:
             print(e[:500])
     "
     ```
  5. Verify `LEARNED_RULES_CONTEXT` contains ALL confirmed rule texts (at least 3 rules from A/B/C)
  6. Verify `FEEDBACK_CONTEXT` contains unconsolidated feedback items and any existing knowledge_bases themes
  7. If container has already exited, check Inngest dashboard step output for the env vars
  8. Wait for approval card — qualitatively inspect the AI draft to see if it reflects the confirmed rules (e.g., ends with a friendly tone, mentions parking if relevant)

  **If injection fails (empty LEARNED_RULES_CONTEXT or FEEDBACK_CONTEXT):**
  - Check the lifecycle query at `employee-lifecycle.ts` lines 569-609 for `learned_rules`
  - Check lines 490-567 for `feedback` + `knowledge_bases`
  - Verify the PostgREST queries return data: manually run them with curl against `http://localhost:54331`
  - Fix any query issues, wait for gateway auto-restart, and re-trigger

  **Must NOT do**:
  - Do NOT manually set env vars on the container — they must flow through the lifecycle code
  - Do NOT approve or reject the approval card from this scenario until inspection is complete (container exits on approval)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires inspecting a running Docker container's env vars in real-time, correlating with source code, and potentially debugging lifecycle queries
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Needed to send Airbnb message and check Inngest dashboard

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (solo)
  - **Blocks**: Task F1
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md:259-369` — Scenario D with exact container inspection commands
  - `src/inngest/employee-lifecycle.ts:490-609` — FEEDBACK_CONTEXT assembly (lines 490-567) and LEARNED_RULES_CONTEXT assembly (lines 569-609)
  - `src/inngest/employee-lifecycle.ts:630-655` — Where env vars are passed to Docker container (line 630: `FEEDBACK_CONTEXT`, line 631: `LEARNED_RULES_CONTEXT`)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: LEARNED_RULES_CONTEXT contains confirmed rules
    Tool: Bash (docker inspect + psql)
    Preconditions: ≥3 confirmed rules exist; new task in Executing state
    Steps:
      1. docker ps --filter name=employee- → capture container name
      2. docker inspect {container} → extract LEARNED_RULES_CONTEXT env var
      3. Verify string contains "## Learned Behaviors — follow these rules"
      4. Verify string contains at least 3 "- " rule lines
      5. Cross-reference with psql query of confirmed rules — every confirmed rule_text must appear
    Expected Result: LEARNED_RULES_CONTEXT is non-empty, contains header + all confirmed rules
    Failure Indicators: Env var missing; empty string; missing rules; wrong query filter
    Evidence: .sisyphus/evidence/task-3-learned-rules-context.txt

  Scenario: FEEDBACK_CONTEXT contains unconsolidated feedback
    Tool: Bash (docker inspect + psql)
    Preconditions: Same container as above
    Steps:
      1. Extract FEEDBACK_CONTEXT env var from container
      2. Verify string contains "All unconsolidated feedback (newest first):" section
      3. Verify at least 1 feedback item is listed (with [feedback_type] prefix)
      4. If knowledge_bases rows exist, verify "Your feedback themes (consolidated knowledge):" section also present
    Expected Result: FEEDBACK_CONTEXT is non-empty, contains both sections (if applicable)
    Failure Indicators: Env var missing; empty string; no feedback items despite DB having rows
    Evidence: .sisyphus/evidence/task-3-feedback-context.txt
  ```

  **Commit**: YES (only if bugs are fixed)
  - Message: `fix(lifecycle): <description of injection issue>`

---

- [x] 4. Execute Scenarios E + F — Feedback consolidation and rule synthesis

  **What to do**:
  Execute the consolidation and synthesis scenarios from the test guide. These run inside the same Inngest function (`trigger/feedback-summarizer`).

  **Scenario E — Feedback consolidation:**
  1. Confirm unconsolidated feedback count ≥ 5:
     ```bash
     psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
       "SELECT COUNT(*) FROM feedback WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND consolidated_at IS NULL AND correction_reason IS NOT NULL;"
     ```
  2. Manually invoke the feedback-summarizer via Inngest dashboard (`http://localhost:8288` → Functions → `trigger/feedback-summarizer` → Invoke)
  3. Watch gateway logs for: `Consolidation threshold met`, `Feedback summary stored`, `Batch review card posted`
  4. Navigate to `C0960S2Q8RL` — confirm `📋 Feedback consolidation ready` batch card appeared with theme list and `✅ Confirm All & Consolidate` button
  5. DB check: new `knowledge_bases` row with `source_config.type = 'feedback_summary'`
  6. Click "✅ Confirm All & Consolidate"
  7. DB check: covered `feedback` rows now have `consolidated_at` set
  8. Trigger another guest-messaging task (new Airbnb message) to verify `FEEDBACK_CONTEXT` includes the new consolidated themes
  9. Check gateway log `Feedback context assembled` — `kbThemes` must be ≥ 2 (existing + new)
  10. Inspect container env for `FEEDBACK_CONTEXT` — must contain "Your feedback themes (consolidated knowledge):" with the new themes

  **Scenario F — Rule synthesis:**
  This runs as part of the same feedback-summarizer invocation as Scenario E.
  1. Confirm ≥ 2 confirmed rules exist (should be ≥ 3 from Scenarios A/B/C)
  2. If synthesis was triggered during E's invocation, check logs for `Rule synthesis complete { mergesProposed: N }`
  3. If `mergesProposed ≥ 1`, navigate to `C0960S2Q8RL` — confirm `🔀 Merged behavioral rule proposed` card appeared with "Replaces:" section listing originals
  4. DB check: `learned_rules` has new row with `source = 'weekly_synthesis'`, `status = 'proposed'`
  5. Click "✅ Confirm" on the merged rule card
  6. DB check: `status = 'confirmed'`
  7. If `mergesProposed: 0` (LLM found no overlaps), this is acceptable if the confirmed rules genuinely don't overlap — log the observation but don't treat as failure

  **If consolidation fails:**
  - Check `feedback-summarizer.ts` for threshold logic and LLM call
  - Verify PostgREST queries work: `curl -s "http://localhost:54331/rest/v1/feedback?tenant_id=eq.00000000-0000-0000-0000-000000000003&consolidated_at=is.null&select=id" -H "apikey: $SUPABASE_SECRET_KEY" -H "Prefer: count=exact"`
  - Check if `notification_channel` is set on the archetype

  **If batch_rules_confirm button fails:**
  - Check `handlers.ts` for the `batch_rules_confirm` action handler
  - Verify it correctly PATCHes `feedback` rows with `consolidated_at`

  **Must NOT do**:
  - Do NOT manually set `consolidated_at` on feedback rows — must flow through the batch confirm button
  - Do NOT manually insert `knowledge_bases` rows

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Involves manually invoking Inngest functions, multi-step verification across logs/DB/Slack, and potential code debugging. The feedback-summarizer has complex logic (theme extraction, batch cards, rule synthesis).
  - **Skills**: [`dev-browser`]
    - `dev-browser`: Needed for Inngest dashboard invocation, Slack batch card interaction, and Airbnb message for injection re-verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo, sequential after Wave 3)
  - **Blocks**: Task F1
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `docs/2026-05-11-1854-feedback-pipeline-e2e-test-guide.md:370-574` — Scenarios E and F with exact steps, DB queries, and log patterns
  - `src/inngest/triggers/feedback-summarizer.ts` — Full consolidation logic (lines 63-282), synthesis logic (lines 284-519)
  - `src/gateway/slack/handlers.ts` — `batch_rules_confirm` action handler

  **API/Type References**:
  - `src/inngest/employee-lifecycle.ts:6` — `CONSOLIDATION_THRESHOLD` export (value: 5)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Scenario E — Consolidation batch card → Confirm All
    Tool: Playwright / Bash (psql)
    Preconditions: ≥5 unconsolidated feedback rows; services running
    Steps:
      1. Invoke feedback-summarizer via Inngest dashboard
      2. Wait for batch card in C0960S2Q8RL (poll every 15s, timeout 3min)
      3. Verify card contains "📋 Feedback consolidation ready" + theme list
      4. psql: SELECT id FROM knowledge_bases WHERE archetype_id='00000000-0000-0000-0000-000000000015' ORDER BY created_at DESC LIMIT 1 → new row exists
      5. Click "Confirm All & Consolidate"
      6. psql: SELECT COUNT(*) FILTER (WHERE consolidated_at IS NOT NULL) FROM feedback WHERE tenant_id='...' → increased
    Expected Result: Themes extracted, knowledge_bases row created, batch confirmed, feedback rows consolidated
    Failure Indicators: No batch card; empty themes; batch_rules_confirm button doesn't PATCH rows
    Evidence: .sisyphus/evidence/task-4-scenario-e.txt

  Scenario: Scenario E — Consolidated themes injected in next run
    Tool: Bash (docker inspect + psql)
    Preconditions: Consolidation complete; new task triggered
    Steps:
      1. Send new Airbnb message
      2. Wait for task to reach Executing
      3. docker inspect container → extract FEEDBACK_CONTEXT
      4. Verify "Your feedback themes (consolidated knowledge):" section present with new themes
    Expected Result: FEEDBACK_CONTEXT includes consolidated themes from knowledge_bases
    Failure Indicators: FEEDBACK_CONTEXT missing themes section; kbThemes = 0 in log
    Evidence: .sisyphus/evidence/task-4-scenario-e-injection.txt

  Scenario: Scenario F — Rule synthesis (if triggered)
    Tool: Playwright / Bash (psql)
    Preconditions: ≥2 confirmed rules; feedback-summarizer invoked
    Steps:
      1. Check logs for "Rule synthesis complete" with mergesProposed value
      2. If mergesProposed ≥ 1: find "🔀 Merged behavioral rule" card in C0960S2Q8RL
      3. Verify card shows merged rule + "Replaces:" with original rules
      4. psql: learned_rules with source='weekly_synthesis', status='proposed'
      5. Click "Confirm"
      6. psql: status → 'confirmed'
    Expected Result: Overlapping rules merged into one; synthesis rule confirmed
    Failure Indicators: No synthesis card when overlapping rules exist; wrong rule text; button doesn't update status
    Evidence: .sisyphus/evidence/task-4-scenario-f.txt
  ```

  **Commit**: YES (only if bugs are fixed)
  - Message: `fix(feedback): <description of consolidation/synthesis issue>`

---

## Final Verification Wave

- [x] F1. **Summary of findings** — `deep`

  Compile a summary of the E2E execution:
  - Which scenarios passed on first attempt
  - Which scenarios revealed bugs (with file:line of each fix)
  - What the bugs were and how they were fixed
  - Final state of `learned_rules` and `feedback` tables
  - Final state of `LEARNED_RULES_CONTEXT` and `FEEDBACK_CONTEXT` injection
  - Any remaining issues or observations

  Output the summary to `.sisyphus/evidence/feedback-pipeline-e2e-summary.md`.

- [x] F2. **Notify completion** — `quick`

  Send Telegram notification: plan `feedback-pipeline-e2e` complete, all tasks done, come back to review results.

  ```bash
  tsx scripts/telegram-notify.ts "✅ feedback-pipeline-e2e complete — All tasks done. Come back to review results."
  ```

---

## Commit Strategy

- After fixing any bug: `fix(feedback): <description of what was broken and how it was fixed>` — affected files, run relevant test scenario to verify
- After all scenarios pass: `chore(sisyphus): add feedback pipeline E2E evidence` — `.sisyphus/evidence/` files

---

## Success Criteria

### Verification Commands

```bash
# At least 3 confirmed rules exist (from Scenarios A, B, C)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT COUNT(*) FROM learned_rules WHERE tenant_id = '00000000-0000-0000-0000-000000000003' AND status = 'confirmed';"
# Expected: >= 3

# LEARNED_RULES_CONTEXT was injected (check most recent task)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT id, status FROM tasks WHERE raw_event->>'thread_uid' = 'aef3d0cf-bc61-4f05-a3ce-1a4199ca336d' ORDER BY created_at DESC LIMIT 1;"
# Expected: status = 'Done'

# knowledge_bases has consolidation entry
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT COUNT(*) FROM knowledge_bases WHERE archetype_id = '00000000-0000-0000-0000-000000000015';"
# Expected: >= 2
```

### Final Checklist

- [x] All 6 scenarios (A–F) passed
- [x] All confirmed rules injected via LEARNED_RULES_CONTEXT
- [x] Consolidated themes injected via FEEDBACK_CONTEXT
- [x] All bugs fixed and committed
- [x] Evidence captured in `.sisyphus/evidence/`
- [x] `git status` clean
