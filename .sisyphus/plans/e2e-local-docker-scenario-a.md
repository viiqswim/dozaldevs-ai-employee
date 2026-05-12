# E2E Local Docker — Scenario A (Approve Happy Path)

## TL;DR

> **Quick Summary**: Rebuild the Docker worker image, restart the gateway with `USE_LOCAL_DOCKER=1`, and run Slack UX Scenario A end-to-end: Airbnb message → Hostfully webhook → worker → approval card → approve → reply delivered to Airbnb.
>
> **Deliverables**:
>
> - Working local Docker dispatch confirmed
> - Full Scenario A state machine trace documented
> - Airbnb reply delivery verified via Playwright screenshot
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — strictly sequential
> **Critical Path**: T1 → T2 → T3 → T4 → T5 → T6

---

## Context

### Original Request

User's previous task (`731ca7f5`) got stuck in `Executing` because the gateway was dispatching to Fly.io with an expired token instead of using local Docker. User wants to switch to local Docker and run a full Scenario A happy path to confirm the system works end-to-end after the feedback-system-redesign.

### Key Facts

- `USE_LOCAL_DOCKER` is set programmatically by `dev.ts` (line 556) — `.env` value is always overridden
- Worker files were modified during `feedback-system-redesign` — Docker image must be rebuilt
- Current gateway is running but NOT with `USE_LOCAL_DOCKER=1`
- Test Airbnb thread: `https://www.airbnb.com/guest/messages/2525238359` (Olivia test account)
- VLRE tenant: `00000000-0000-0000-0000-000000000003`
- Guest-messaging archetype: `00000000-0000-0000-0000-000000000015`
- Scenario A guide: `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`

---

## Work Objectives

### Core Objective

Verify the guest-messaging employee works end-to-end with local Docker dispatch after the feedback-system-redesign changes.

### Definition of Done

- [ ] Docker image rebuilt with latest worker code
- [ ] Gateway running with `USE_LOCAL_DOCKER=1`
- [ ] Full Scenario A completed: Airbnb message → approval card → approve → reply delivered
- [ ] `task_status_log` shows complete state machine trace ending in `Done`

### Must Have

- Real Airbnb message as trigger (not manual webhook curl)
- Local Docker container dispatched (not Fly.io)
- Approval card with guest name, task ID, and all 3 action buttons
- Reply appears in Airbnb thread after approval

### Must NOT Have (Guardrails)

- No code changes — this is verification only. If something fails, STOP and report
- No Scenario B/C/D/E/F — Scenario A only
- No `pnpm trigger-task` or manual webhook curl as substitute for real Airbnb message
- No investigation of the previous failed task (`731ca7f5`) — already understood

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### QA Policy

Every step includes explicit acceptance criteria verified via Playwright browser, DB queries, and log checks.
Evidence saved to `.sisyphus/evidence/e2e-scenario-a/`.

---

## Execution Strategy

### Sequential Execution

```
T1: Preflight checks + zombie cleanup
T2: Docker image rebuild
T3: Gateway restart with USE_LOCAL_DOCKER=1
T4: Trigger via Airbnb message (Playwright)
T5: Monitor worker + approve (Playwright)
T6: Verify delivery + document outcomes

Critical Path: T1 → T2 → T3 → T4 → T5 → T6
```

### Agent Dispatch Summary

- **T1**: `quick` — preflight checks
- **T2**: `quick` — docker build
- **T3**: `quick` — gateway restart + verification
- **T4**: `unspecified-high` + `dev-browser` — Airbnb message via Playwright
- **T5**: `unspecified-high` + `dev-browser` — monitor + approve via Playwright
- **T6**: `unspecified-high` + `dev-browser` — verify delivery + document

---

## TODOs

- [x] 1. Preflight checks + zombie cleanup

  **What to do**:
  - Verify Docker daemon is running: `docker info >/dev/null 2>&1 && echo "OK" || echo "DOCKER NOT RUNNING"`
  - Verify Inngest is healthy: `curl -s http://localhost:8288/health`
  - Verify PostgREST is healthy: `curl -s http://localhost:54331/rest/v1/ -H "apikey: <key>"` returns 200
  - Check for zombie tasks stuck in `Executing` or `Reviewing` for the guest-messaging archetype:
    ```bash
    SUPABASE_KEY=$(grep '^SUPABASE_SECRET_KEY=' .env | cut -d= -f2)
    curl -s "http://localhost:54331/rest/v1/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000015&status=in.(Executing,Reviewing)&select=id,status,created_at" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
    ```
  - If any zombie tasks found, PATCH them to `Failed`:
    ```bash
    curl -X PATCH "http://localhost:54331/rest/v1/tasks?id=eq.<zombie_id>" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
      -H "Content-Type: application/json" \
      -d '{"status":"Failed","updated_at":"<now>"}'
    ```
  - Verify VLRE tenant Slack OAuth is valid:
    ```bash
    curl -s "http://localhost:54331/rest/v1/tenant_integrations?tenant_id=eq.00000000-0000-0000-0000-000000000003&provider=eq.slack&select=external_id" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
    ```
    Must return a row with `external_id` = Slack team ID (`T06KFDGLHS6`)
  - Verify `tenant_secrets` has `slack_bot_token` for VLRE:
    ```bash
    curl -s "http://localhost:54331/rest/v1/tenant_secrets?tenant_id=eq.00000000-0000-0000-0000-000000000003&key=eq.slack_bot_token&select=key" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
    ```
    Must return a row (we can't see the value, just confirm it exists)

  **Must NOT do**:
  - Do not fix any issues found — report them and STOP

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T2, T3, T4, T5, T6
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Docker daemon running
  - [ ] Inngest healthy at :8288
  - [ ] PostgREST healthy at :54331
  - [ ] No zombie tasks in Executing/Reviewing (or cleaned up)
  - [ ] VLRE tenant_integrations row exists for Slack
  - [ ] VLRE tenant_secrets has slack_bot_token

  **QA Scenarios**:

  ```
  Scenario: All preflight checks pass
    Tool: Bash
    Steps:
      1. docker info >/dev/null 2>&1 — exit code 0
      2. curl -s http://localhost:8288/health — returns {"status":200}
      3. Query tasks for zombies — empty array [] or all PATCHed to Failed
      4. Query tenant_integrations — row with external_id "T06KFDGLHS6"
      5. Query tenant_secrets — row with key "slack_bot_token"
    Expected Result: All 5 checks pass
    Failure Indicators: Any check fails or returns unexpected result
    Evidence: .sisyphus/evidence/e2e-scenario-a/t1-preflight.txt
  ```

  **Commit**: NO

- [ ] 2. Docker image rebuild

  **What to do**:
  - Build the Docker image with latest worker code:
    ```bash
    docker build -t ai-employee-worker:latest .
    ```
    This is a long-running command — use tmux:
    ```bash
    tmux kill-session -t ai-build 2>/dev/null
    tmux new-session -d -s ai-build -x 220 -y 50
    tmux send-keys -t ai-build "cd /Users/victordozal/repos/dozal-devs/ai-employee && docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/ai-build.log; echo 'EXIT_CODE:'\$? >> /tmp/ai-build.log" Enter
    ```
  - Poll until complete:
    ```bash
    grep "EXIT_CODE:" /tmp/ai-build.log && echo "DONE" || echo "RUNNING"
    ```
  - Verify image timestamp is fresh:
    ```bash
    docker images ai-employee-worker:latest --format "{{.CreatedAt}}"
    ```
  - Kill the tmux session when done:
    ```bash
    tmux kill-session -t ai-build
    ```

  **Must NOT do**:
  - Do not proceed if build fails — STOP and report the error
  - Do not modify any source files to fix build errors

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T3
  - **Blocked By**: T1

  **Acceptance Criteria**:
  - [ ] `docker build` exits with code 0
  - [ ] `docker images ai-employee-worker:latest` shows timestamp within last 10 minutes

  **QA Scenarios**:

  ```
  Scenario: Docker build succeeds
    Tool: Bash (tmux for long-running build)
    Steps:
      1. Run docker build -t ai-employee-worker:latest .
      2. Wait for EXIT_CODE:0 in /tmp/ai-build.log
      3. Verify docker images ai-employee-worker:latest shows fresh timestamp
    Expected Result: Build exits 0, image timestamp < 10 min old
    Failure Indicators: EXIT_CODE != 0, or "error" in build output
    Evidence: .sisyphus/evidence/e2e-scenario-a/t2-docker-build.txt
  ```

  **Commit**: NO

- [x] 3. Gateway restart with USE_LOCAL_DOCKER=1

  **What to do**:
  - Kill the current gateway process (it's running without USE_LOCAL_DOCKER=1):
    ```bash
    pkill -f "gateway/server" 2>/dev/null; sleep 2
    ```
  - Also kill any existing `pnpm dev` processes and tmux sessions:
    ```bash
    pkill -f "scripts/dev.ts" 2>/dev/null
    tmux kill-session -t ai-dev 2>/dev/null
    sleep 2
    ```
  - Start fresh via `pnpm dev` in tmux (this sets USE_LOCAL_DOCKER=1 automatically):
    ```bash
    tmux new-session -d -s ai-dev -x 220 -y 50
    tmux send-keys -t ai-dev "cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm dev 2>&1 | tee /tmp/ai-dev.log" Enter
    ```
  - Wait for gateway to be healthy (poll up to 60 seconds):
    ```bash
    for i in $(seq 1 12); do
      curl -s http://localhost:7700/health >/dev/null 2>&1 && echo "Gateway healthy" && break
      sleep 5
    done
    ```
  - Verify Socket Mode connected:
    ```bash
    grep -i "socket mode" /tmp/ai-dev.log | tail -3
    ```
    Must show `"Slack Bolt — Socket Mode connected"`
  - Verify Inngest shows 5 registered functions:
    ```bash
    curl -s http://localhost:8288/v0/fns | node -e "
      const d=require('fs').readFileSync('/dev/stdin','utf8');
      try { const j=JSON.parse(d); console.log('Functions:', (j.data||j).length); }
      catch(e) { console.log('Error:', d.substring(0,100)); }
    "
    ```
    Must show `Functions: 5`
  - Verify Cloudflare tunnel is up (check for tunnel-related log):
    ```bash
    grep -i "tunnel\|cloudflare" /tmp/ai-dev.log | tail -5
    ```

  **Must NOT do**:
  - Do not start gateway manually with `tsx` — must use `pnpm dev`
  - Do not proceed if Socket Mode is not connected

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T4
  - **Blocked By**: T2

  **Acceptance Criteria**:
  - [ ] `curl -s http://localhost:7700/health` returns 200
  - [ ] Gateway logs show `"Slack Bolt — Socket Mode connected"`
  - [ ] Inngest at :8288 shows 5 registered functions
  - [ ] Cloudflare tunnel log entries present (or named tunnel alive)

  **QA Scenarios**:

  ```
  Scenario: Gateway running with local Docker enabled
    Tool: Bash
    Steps:
      1. curl -s http://localhost:7700/health — returns {"status":"ok"}
      2. grep "socket mode" /tmp/ai-dev.log — contains "Socket Mode connected"
      3. curl Inngest /v0/fns — returns 5 functions
      4. grep "tunnel" /tmp/ai-dev.log — tunnel entries present
    Expected Result: All 4 checks pass
    Failure Indicators: Gateway not responding, Socket Mode not connected, wrong function count
    Evidence: .sisyphus/evidence/e2e-scenario-a/t3-gateway-restart.txt
  ```

  **Commit**: NO

- [x] 4. Trigger via Airbnb message (Playwright)

  **What to do**:
  - Generate a unique epoch suffix: `date +%s`
  - Navigate to `https://www.airbnb.com/guest/messages/2525238359` via Playwright browser
  - Verify the page loads and shows the message thread (not a login page — if login required, log in first)
  - Type into the compose bar: `What time is checkout? [e2e-test-{epoch}]`
  - Click Send
  - Take a screenshot as evidence of the sent message
  - Wait up to 90 seconds for the webhook to reach the gateway. Check gateway logs:
    ```bash
    grep "webhooks/hostfully" /tmp/ai-dev.log | tail -5
    ```
  - Verify a new task was created:
    ```bash
    SUPABASE_KEY=$(grep '^SUPABASE_SECRET_KEY=' .env | cut -d= -f2)
    curl -s "http://localhost:54331/rest/v1/tasks?archetype_id=eq.00000000-0000-0000-0000-000000000015&order=created_at.desc&limit=1&select=id,status,external_id,created_at" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
    ```
  - Record the task ID for subsequent steps
  - **PRE-CHECK GUARD**: If the task goes to `Done` in less than 5 seconds, the pre-check fired (last message in Hostfully was from the host). This means the thread state is wrong for Scenario A. If this happens:
    1. Send ANOTHER Airbnb message (the first one makes Olivia the last sender)
    2. Wait for the new webhook and new task
    3. The new task should proceed to `Executing` since Olivia is now the last sender

  **Must NOT do**:
  - Do not use `pnpm trigger-task` or manual webhook curl
  - Do not proceed if the task doesn't appear within 90 seconds — the webhook path may be broken

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`dev-browser`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T5
  - **Blocked By**: T3

  **References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Scenario A, Steps 1–2
  - AGENTS.md § "Verified E2E flow" — Step 1 (send message on Airbnb)
  - AGENTS.md § "Key behaviors to know" — Pre-check auto-completes behavior

  **Acceptance Criteria**:
  - [ ] Airbnb message sent with unique epoch suffix (Playwright screenshot)
  - [ ] Gateway log shows `POST /webhooks/hostfully 200` within 90s
  - [ ] New task row exists in DB with status progressing past `Received`
  - [ ] Task does NOT go to `Done` in <5s (pre-check guard passes)

  **QA Scenarios**:

  ```
  Scenario: Airbnb message triggers guest-messaging task
    Tool: Playwright (dev-browser) + Bash
    Steps:
      1. Navigate to https://www.airbnb.com/guest/messages/2525238359
      2. Verify thread loads (not login redirect)
      3. Type "What time is checkout? [e2e-test-{epoch}]" in compose bar
      4. Click Send button
      5. Screenshot the sent message
      6. Wait up to 90s, check gateway logs for webhooks/hostfully
      7. Query DB for new task with archetype_id = guest-messaging
      8. Wait 5s, verify task status != Done (pre-check guard)
    Expected Result: Task created, status moves to Executing (not instant Done)
    Failure Indicators: No webhook in logs, no task in DB, task goes Done in <5s
    Evidence: .sisyphus/evidence/e2e-scenario-a/t4-airbnb-message.png

  Scenario: Pre-check fires (fallback)
    Tool: Playwright + Bash
    Preconditions: Task went to Done in <5 seconds
    Steps:
      1. Send another Airbnb message with new epoch suffix
      2. Wait for new webhook and task
      3. Verify new task progresses to Executing
    Expected Result: Second task proceeds to Executing
    Evidence: .sisyphus/evidence/e2e-scenario-a/t4-precheck-retry.png
  ```

  **Commit**: NO

- [x] 5. Monitor worker + approve (Playwright)

  **What to do**:
  - Watch task progress through state machine. Poll DB every 15 seconds:
    ```bash
    SUPABASE_KEY=$(grep '^SUPABASE_SECRET_KEY=' .env | cut -d= -f2)
    TASK_ID="<from T4>"
    curl -s "http://localhost:54331/rest/v1/tasks?id=eq.$TASK_ID&select=status" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
    ```
  - Verify local Docker container is running during `Executing`:
    ```bash
    docker ps --filter "ancestor=ai-employee-worker:latest" --format "{{.ID}} {{.Names}} {{.Status}}"
    ```
  - Wait for task to reach `Reviewing` status (this means approval card was posted)
  - Navigate to Slack `#cs-guest-communication` via Playwright: `https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S`
  - Find the approval card thread. Verify:
    - Guest name "Olivia" or "c.e. Wilson" appears in the card header
    - Task ID context block at bottom
    - Three buttons: "Approve & Send", "Edit & Send", "Reject"
  - Click the thread to open it (the approval card with buttons is posted as a **thread reply**)
  - Click **"Approve & Send"** button
  - Verify the card updates to "Approved by @Victor Dozal — delivering now." (no ⚠️ flash)
  - **FALLBACK**: If button click produces no response within 30 seconds, use manual curl:
    ```bash
    curl -X POST "http://localhost:8288/e/local" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"employee/approval.received\",\"data\":{\"taskId\":\"$TASK_ID\",\"action\":\"approve\",\"userId\":\"U05V0CTJLF6\",\"userName\":\"Victor\"}}"
    ```

  **Must NOT do**:
  - Do not approve via manual curl unless the Slack button fails after 30s
  - Do not modify any code to fix issues — report and STOP

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`dev-browser`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: T6
  - **Blocked By**: T4

  **References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Scenario A, Steps 3–5
  - AGENTS.md § "Slack Interactive Buttons — Socket Mode" — for fallback
  - AGENTS.md § "Verified E2E flow" — Steps 7–9

  **Acceptance Criteria**:
  - [ ] Docker container ran during `Executing` phase (docker ps evidence)
  - [ ] Task reached `Reviewing` status in DB
  - [ ] Approval card visible in Slack with guest name and task ID
  - [ ] Approval card has all 3 action buttons
  - [ ] After clicking Approve: card updates to approved message
  - [ ] Gateway logs show `employee/approval.received` event processed

  **QA Scenarios**:

  ```
  Scenario: Approve happy path via Slack button
    Tool: Playwright (dev-browser) + Bash
    Steps:
      1. Poll DB until task status = Reviewing (timeout 5 min)
      2. Verify docker ps shows worker container during Executing
      3. Navigate to https://app.slack.com/client/T06KFDGLHS6/C0AMGJQN05S
      4. Find latest thread, click to open
      5. Locate approval card with Approve & Send button
      6. Verify guest name + task ID context block
      7. Click "Approve & Send"
      8. Verify card updates to "Approved by @..." within 10s
    Expected Result: Card updates inline to approved state
    Failure Indicators: Button click no response, card doesn't update, wrong guest name
    Evidence: .sisyphus/evidence/e2e-scenario-a/t5-approval-card.png, t5-approved.png

  Scenario: Fallback — manual approval via curl
    Tool: Bash (curl)
    Preconditions: Slack button click produced no response for 30s
    Steps:
      1. Fire employee/approval.received event via Inngest local endpoint
      2. Verify task status moves past Reviewing
    Expected Result: Task proceeds to Delivering → Done
    Evidence: .sisyphus/evidence/e2e-scenario-a/t5-manual-approval.txt
  ```

  **Commit**: NO

- [x] 6. Verify delivery + document outcomes

  **What to do**:
  - Verify task status = `Done` in DB:
    ```bash
    SUPABASE_KEY=$(grep '^SUPABASE_SECRET_KEY=' .env | cut -d= -f2)
    TASK_ID="<from T4>"
    curl -s "http://localhost:54331/rest/v1/tasks?id=eq.$TASK_ID&select=id,status" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
    ```
  - Verify full state machine trace in `task_status_log`:
    ```bash
    curl -s "http://localhost:54331/rest/v1/task_status_log?task_id=eq.$TASK_ID&order=created_at.asc&select=from_status,to_status" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
    ```
    Expected sequence: `Received → Triaging → AwaitingInput → Ready → Executing → Validating → Submitting → Reviewing → Approved → Delivering → Done`
  - Navigate to Airbnb thread in Playwright: `https://www.airbnb.com/guest/messages/2525238359`
  - Reload the page and verify the host reply appears (from "Leo" or the property host)
  - Take a screenshot of the Airbnb thread showing the reply
  - Check that the original "Task received" Slack notification message was updated (not frozen at ⏳):
    Navigate to `#cs-guest-communication` and verify the top-level notification reflects the Done state
  - Kill the ai-dev tmux session (cleanup):
    ```bash
    tmux kill-session -t ai-dev 2>/dev/null
    ```
  - Write a summary to evidence:
    ```
    Task ID: <id>
    Status: Done
    State trace: Received → ... → Done
    Airbnb reply: verified (screenshot)
    Slack notification: updated to Done
    Docker dispatch: local (verified via docker ps)
    ```

  **Must NOT do**:
  - Do not accept "Done" without checking the full state machine trace
  - Do not skip the Airbnb reply verification — delivery is the final acceptance criterion

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`dev-browser`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: T5

  **References**:
  - `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md` — Scenario A, Steps 6–7
  - AGENTS.md § "Verified E2E flow" — Steps 10–12

  **Acceptance Criteria**:
  - [ ] Task status = `Done` in DB
  - [ ] `task_status_log` shows complete state machine sequence ending in `Done`
  - [ ] Host reply visible in Airbnb thread (Playwright screenshot)
  - [ ] Original "Task received" Slack message updated to Done (not frozen at ⏳)
  - [ ] Evidence file written with summary

  **QA Scenarios**:

  ```
  Scenario: Full delivery verified
    Tool: Playwright (dev-browser) + Bash
    Steps:
      1. Query DB: task status = Done
      2. Query task_status_log: verify full sequence Received → Done
      3. Navigate to Airbnb thread, reload
      4. Verify host reply appears in thread
      5. Screenshot the reply
      6. Navigate to Slack #cs-guest-communication
      7. Verify top-level "Task received" message reflects Done state
    Expected Result: Reply delivered to Airbnb, all states logged, Slack updated
    Failure Indicators: Missing state transitions, no Airbnb reply, Slack frozen at ⏳
    Evidence: .sisyphus/evidence/e2e-scenario-a/t6-airbnb-reply.png, t6-state-trace.txt, t6-slack-done.png
  ```

  **Commit**: NO

---

## Final Verification Wave

> Not applicable for this operational plan — the E2E itself IS the verification.
> T6 is the final verification step.

---

## Commit Strategy

No commits in this plan — this is a verification-only run.

---

## Success Criteria

### Final Checklist

- [ ] Docker image rebuilt with latest code
- [ ] Gateway running with USE_LOCAL_DOCKER=1
- [ ] Task dispatched to LOCAL Docker container (not Fly.io)
- [ ] Approval card appeared in Slack with correct content
- [ ] Approve button worked (or fallback curl used)
- [ ] Reply delivered to Airbnb guest thread
- [ ] Full state machine trace: Received → Done
- [ ] All evidence screenshots saved to .sisyphus/evidence/e2e-scenario-a/
