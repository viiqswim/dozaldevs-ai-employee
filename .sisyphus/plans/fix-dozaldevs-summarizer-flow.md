# Fix DozalDevs Summarizer End-to-End Flow

## TL;DR

> **Quick Summary**: Fix 5 interconnected bugs preventing the DozalDevs AI employee summarizer from completing its workflow (read Slack → summarize → approval → publish). Each fix is verified before moving to the next.
>
> **Deliverables**:
>
> - Working approval flow: buttons in `#victor-tests`, final post in `#project-lighthouse`
> - Correct status handling so Approve/Reject buttons work
> - Deliverable content available to lifecycle after approval
> - Harness correctly receives summary content from OpenCode
> - Tenant config properly routes channels
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 initial waves, then sequential seed changes + E2E
> **Critical Path**: Fix handlers.ts → Fix harness → Rebuild Docker → Fix seed → Re-seed → Full E2E

---

## Context

### Original Request

Fix the DozalDevs AI Employee summarizer so it can: read messages from `#project-lighthouse` (C092BJ04HUG), summarize them, post approval request to `#victor-tests` (C0AUBMXKVNU), and upon approval publish the final summary to `#project-lighthouse`.

### Interview Summary

**Key Discussions**:

- User confirmed the desired channel routing: approval in `#victor-tests`, final post in `#project-lighthouse`
- Almost everything is built — 5 bugs (plus 1 sub-issue from Metis) prevent the flow from completing
- User wants verification after EACH fix before proceeding

**Research Findings**:

- `loadTenantEnv()` correctly maps `publish_channel` → `SUMMARY_PUBLISH_CHANNEL` (verified in `tenant-env-loader.ts` lines 58-61)
- `DELIVERY_MACHINE_ENABLED` is NOT set by default — lifecycle uses direct Slack post path (line 400-418)
- The DozalDevs archetype uses the DozalDevs-specific instruction string (not the generic one)
- Manual trigger correctly scopes to DozalDevs tenant via URL parameter

### Metis Review

**Identified Gaps** (addressed):

- Bug 6 (stdout not redirected to file): Incorporated into Issue 3 fix — instructions must use `>` shell redirection
- Zero-messages edge case: Instructions will explicitly handle "no activity" scenario
- `target_channel` in tenant config should be `C0AUBMXKVNU` (approval channel), not `C092BJ04HUG`
- Docker rebuild mandatory after harness change — gated in verification task

---

## Work Objectives

### Core Objective

Fix all blocking bugs in the DozalDevs summarizer so the complete workflow runs end-to-end: read → summarize → approval → publish.

### Concrete Deliverables

- `src/gateway/slack/handlers.ts` — status check fixed
- `src/workers/opencode-harness.mts` — `external_ref` populated on deliverable
- `prisma/seed.ts` — DozalDevs tenant config + archetype instructions corrected
- Docker image rebuilt with harness fix
- Database re-seeded with corrected config

### Definition of Done

- [ ] Manual trigger of DozalDevs summarizer reaches `Reviewing` state
- [ ] Approval message appears in `#victor-tests` (C0AUBMXKVNU) with Approve/Reject buttons
- [ ] Clicking Approve transitions task to `Done`
- [ ] Final summary appears in `#project-lighthouse` (C092BJ04HUG) without buttons
- [ ] Approval message in `#victor-tests` updates to "Approved by [user]"

### Must Have

- Status mismatch fix (`Reviewing` instead of `AwaitingApproval`)
- `external_ref` on deliverables so lifecycle can find content after approval
- Instructions that write `/tmp/summary.txt` and `/tmp/approval-message.json` with shell redirection
- Correct channel routing: approval → `C0AUBMXKVNU`, publish → `C092BJ04HUG`
- `publish_channel` in tenant config

### Must NOT Have (Guardrails)

- Do NOT touch VLRE archetype (`00000000-0000-0000-0000-000000000013`) or VLRE tenant config
- Do NOT touch Platform archetype (`00000000-0000-0000-0000-000000000011`)
- Do NOT change Inngest event names (`employee/approval.received`, `employee/task.dispatched`)
- Do NOT modify `post-message.ts` or `read-channels.ts` source files — only archetype instructions
- Do NOT change the `isTaskAwaitingApproval` function name or signature — only the status string
- Do NOT change deliverable schema — only populate `external_ref` field in the harness
- Do NOT add retry logic to the harness file-read section

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: YES (tests-after) — run existing test suite to confirm no regressions
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Code fixes**: Use Bash (grep) — verify correct strings in files
- **Seed changes**: Use Bash (curl to PostgREST) — verify DB state after re-seed
- **E2E flow**: Use Bash (curl to admin API + PostgREST polling) — trigger and monitor
- **Slack verification**: Use Bash (curl to Slack API) — check message exists in correct channel

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent code fixes):
├── Task 1: Fix status mismatch in handlers.ts [quick]
├── Task 2: Fix deliverable external_ref in opencode-harness.mts [quick]

Wave 2 (After Wave 1 — verify code fixes):
├── Task 3: Verify status mismatch fix (tests + grep) [quick]
├── Task 4: Verify deliverable fix + Docker rebuild [quick]

Wave 3 (After Wave 2 — seed config fix):
├── Task 5: Fix tenant config in seed.ts (target_channel + publish_channel) [quick]
├── Task 6: Verify tenant config fix (re-seed + DB query) [quick]

Wave 4 (After Wave 3 — seed instructions fix):
├── Task 7: Fix archetype instructions in seed.ts (file writes + channel routing) [quick]
├── Task 8: Verify archetype instructions fix (re-seed + DB query) [quick]

Wave 5 (After Wave 4 — full E2E):
├── Task 9: Full E2E verification (trigger → monitor → approve → verify) [deep]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 5 → Task 7 → Task 9 → F1-F4 → user okay
(Tasks 1+2 and 3+4 run in parallel within their waves)
Parallel Speedup: ~30% faster than fully sequential
Max Concurrent: 2 (Waves 1 and 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | -          | 3      |
| 2    | -          | 4      |
| 3    | 1          | 5      |
| 4    | 2          | 5      |
| 5    | 3, 4       | 6      |
| 6    | 5          | 7      |
| 7    | 6          | 8      |
| 8    | 7          | 9      |
| 9    | 8          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **Wave 2**: 2 tasks — T3 → `quick`, T4 → `quick`
- **Wave 3**: 2 tasks — T5 → `quick`, T6 → `quick`
- **Wave 4**: 2 tasks — T7 → `quick`, T8 → `quick`
- **Wave 5**: 1 task — T9 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix Status Mismatch in Slack Handlers

  **What to do**:
  - Open `src/gateway/slack/handlers.ts`
  - At line 62, change `return rows[0].status === 'AwaitingApproval';` to `return rows[0].status === 'Reviewing';`
  - This is the ONLY change needed — do not rename the function or change anything else

  **Must NOT do**:
  - Do NOT rename `isTaskAwaitingApproval` function (even though the name is now slightly misleading)
  - Do NOT change any other status strings in this file
  - Do NOT touch the `BUTTON_BLOCKS` constant or action handlers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line change in one file with clear location
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/gateway/slack/handlers.ts:62` — The exact line with the wrong status string
  - `src/inngest/employee-lifecycle.ts:284-286` — Where lifecycle sets `'Reviewing'` status (this is the source of truth)

  **Acceptance Criteria**:
  - [ ] Line 62 of `handlers.ts` contains `'Reviewing'` instead of `'AwaitingApproval'`
  - [ ] No other lines in the file reference `'AwaitingApproval'`

  **QA Scenarios**:

  ```
  Scenario: Status string correctly changed
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "AwaitingApproval" src/gateway/slack/handlers.ts
      2. Assert: no output (zero matches)
      3. Run: grep -n "Reviewing" src/gateway/slack/handlers.ts
      4. Assert: line 62 shows `rows[0].status === 'Reviewing'`
    Expected Result: Zero occurrences of 'AwaitingApproval', line 62 contains 'Reviewing'
    Failure Indicators: grep finds 'AwaitingApproval' anywhere in file
    Evidence: .sisyphus/evidence/task-1-status-string-check.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): correct approval status check from AwaitingApproval to Reviewing`
  - Files: `src/gateway/slack/handlers.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 2. Fix Deliverable external_ref in OpenCode Harness

  **What to do**:
  - Open `src/workers/opencode-harness.mts`
  - At lines 331-339, find the `db.post('deliverables', {...})` call
  - Add `external_ref: TASK_ID,` to the object being posted (after `execution_id` field)
  - This ensures the lifecycle can find the deliverable after approval via `deliverables?external_ref=eq.${taskId}`

  **Must NOT do**:
  - Do NOT change the deliverables table schema
  - Do NOT modify any other fields in the POST
  - Do NOT add error handling around this specific field

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single field addition to an existing object literal
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/workers/opencode-harness.mts:330-339` — The deliverable creation POST (add `external_ref` here)
  - `src/inngest/employee-lifecycle.ts:310-311` — Where lifecycle queries `deliverables?external_ref=eq.${taskId}` (this is why the field is needed)
  - `prisma/schema.prisma:88` — Confirms `external_ref String?` exists on `Deliverable` model
  - `src/workers/lib/completion.ts:72` — Example: engineering worker already sets `external_ref: prUrl`

  **Acceptance Criteria**:
  - [ ] `opencode-harness.mts` deliverables POST includes `external_ref: TASK_ID`
  - [ ] The field uses the module-level `TASK_ID` constant (defined at line 6-15)

  **QA Scenarios**:

  ```
  Scenario: external_ref field present in deliverable creation
    Tool: Bash (grep)
    Preconditions: File has been edited
    Steps:
      1. Run: grep -n "external_ref" src/workers/opencode-harness.mts
      2. Assert: output shows a line near 331-340 with `external_ref: TASK_ID`
      3. Run: grep -A 10 "db.post('deliverables'" src/workers/opencode-harness.mts
      4. Assert: the object includes external_ref field
    Expected Result: external_ref: TASK_ID is present in the deliverables POST body
    Failure Indicators: grep for external_ref returns no matches in the file
    Evidence: .sisyphus/evidence/task-2-external-ref-check.txt
  ```

  **Commit**: YES
  - Message: `fix(worker): populate external_ref on deliverable for lifecycle lookup`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm test -- --run`

- [x] 3. Verify Status Mismatch Fix (Tests + Grep)

  **What to do**:
  - Run `pnpm test -- --run` to confirm no test regressions from the handlers.ts change
  - Run `grep -n "AwaitingApproval" src/gateway/slack/handlers.ts` to confirm zero matches
  - Run `grep -n "Reviewing" src/gateway/slack/handlers.ts` to confirm the fix is in place

  **Must NOT do**:
  - Do NOT modify any files in this task — verification only
  - Do NOT skip running the full test suite

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running commands and checking output, no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `src/gateway/slack/handlers.ts:62` — The fixed line to verify
  - `tests/` — Test suite location

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` passes (ignore pre-existing failures in `container-boot.test.ts`, `inngest-serve.test.ts`, `tests/inngest/integration.test.ts`)
  - [ ] Zero occurrences of `'AwaitingApproval'` in `handlers.ts`
  - [ ] `'Reviewing'` string present at line 62

  **QA Scenarios**:

  ```
  Scenario: Test suite passes with the fix
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -20
      2. Assert: test output shows passing tests (some pre-existing failures expected)
      3. Assert: no NEW failures introduced
    Expected Result: Test suite passes with same pass/fail count as before the fix
    Failure Indicators: New test failures that weren't there before
    Evidence: .sisyphus/evidence/task-3-test-results.txt

  Scenario: No AwaitingApproval string remaining
    Tool: Bash (grep)
    Preconditions: Task 1 complete
    Steps:
      1. Run: grep -c "AwaitingApproval" src/gateway/slack/handlers.ts
      2. Assert: output is "0"
    Expected Result: grep returns 0 matches
    Failure Indicators: grep returns 1+ matches
    Evidence: .sisyphus/evidence/task-3-grep-check.txt
  ```

  **Commit**: NO

- [x] 4. Verify Deliverable Fix + Docker Rebuild

  **What to do**:
  - Run `pnpm test -- --run` to confirm no test regressions from the harness change
  - Run `grep -n "external_ref" src/workers/opencode-harness.mts` to confirm the field is set
  - **Rebuild the Docker image** (MANDATORY — harness change requires rebuild):
    `docker build -t ai-employee-worker:latest .`
  - Verify the image was rebuilt by checking the timestamp:
    `docker images ai-employee-worker --format "{{.CreatedAt}}"`

  **Must NOT do**:
  - Do NOT skip the Docker rebuild — the harness runs inside the container
  - Do NOT modify any source files in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running verification commands and Docker build
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:
  - `src/workers/opencode-harness.mts:330-340` — The fixed deliverable POST
  - `Dockerfile` — Used by `docker build` to create the worker image
  - AGENTS.md — States: "Any modification to files under `src/workers/` requires rebuilding the Docker image"

  **Acceptance Criteria**:
  - [ ] `pnpm test -- --run` passes (same pre-existing failures only)
  - [ ] `grep -n "external_ref" src/workers/opencode-harness.mts` shows the TASK_ID assignment
  - [ ] Docker image `ai-employee-worker:latest` rebuilt with timestamp within last 5 minutes
  - [ ] `docker build` exits with code 0

  **QA Scenarios**:

  ```
  Scenario: Docker image rebuilt successfully
    Tool: Bash
    Preconditions: Task 2 complete
    Steps:
      1. Run: docker build -t ai-employee-worker:latest . 2>&1 | tail -5
      2. Assert: build completes successfully (exit code 0)
      3. Run: docker images ai-employee-worker:latest --format "{{.Repository}}:{{.Tag}} {{.CreatedAt}}"
      4. Assert: CreatedAt is within the last 5 minutes
    Expected Result: Docker image built and tagged, recent timestamp
    Failure Indicators: Build fails, or image timestamp is old
    Evidence: .sisyphus/evidence/task-4-docker-rebuild.txt

  Scenario: external_ref verified in source
    Tool: Bash (grep)
    Preconditions: Task 2 complete
    Steps:
      1. Run: grep -B2 -A8 "db.post('deliverables'" src/workers/opencode-harness.mts
      2. Assert: output includes `external_ref: TASK_ID`
    Expected Result: The deliverables POST includes external_ref field
    Failure Indicators: external_ref not found in the object
    Evidence: .sisyphus/evidence/task-4-harness-grep.txt
  ```

  **Commit**: NO (Docker rebuild is infrastructure, not a code change)

- [x] 5. Fix Tenant Config — Channel Routing (Issue 5)

  **What to do**:
  - Open `prisma/seed.ts`
  - Find the DozalDevs tenant upsert (line 41-61, `id: '00000000-0000-0000-0000-000000000002'`)
  - In the `update` block (line 52-58), change the `config.summary` object to:
    ```json
    {
      "channel_ids": ["C092BJ04HUG"],
      "target_channel": "C0AUBMXKVNU",
      "publish_channel": "C092BJ04HUG"
    }
    ```
  - Also update the `create` block (line 48) to match:
    ```json
    {
      "summary": {
        "channel_ids": ["C092BJ04HUG"],
        "target_channel": "C0AUBMXKVNU",
        "publish_channel": "C092BJ04HUG"
      }
    }
    ```
  - Explanation:
    - `target_channel: C0AUBMXKVNU` (victor-tests) = where approval message with buttons is posted
    - `publish_channel: C092BJ04HUG` (project-lighthouse) = where final approved summary is published
    - `channel_ids: [C092BJ04HUG]` = channels to READ messages from

  **Must NOT do**:
  - Do NOT change VLRE tenant config
  - Do NOT change Platform tenant config
  - Do NOT modify the archetype instructions in this task (that's Task 7)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple JSON object update in seed file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `prisma/seed.ts:41-61` — DozalDevs tenant upsert with config object
  - `src/gateway/services/tenant-env-loader.ts:49-62` — How config maps to env vars:
    - `config.summary.channel_ids` → `DAILY_SUMMARY_CHANNELS`
    - `config.summary.target_channel` → `SUMMARY_TARGET_CHANNEL`
    - `config.summary.publish_channel` → `SUMMARY_PUBLISH_CHANNEL`
  - `src/inngest/employee-lifecycle.ts:401` — `publishChannel = tenantEnvForApproval['SUMMARY_PUBLISH_CHANNEL'] ?? targetChannel` (the delivery destination)
  - `src/inngest/employee-lifecycle.ts:319-322` — `targetChannel = metadata.target_channel ?? tenantEnvForApproval['SUMMARY_TARGET_CHANNEL']` (fallback for approval message update)

  **Acceptance Criteria**:
  - [ ] DozalDevs `create` block has config with all three fields
  - [ ] DozalDevs `update` block has `target_channel: 'C0AUBMXKVNU'` and `publish_channel: 'C092BJ04HUG'`
  - [ ] VLRE and Platform tenant configs unchanged

  **QA Scenarios**:

  ```
  Scenario: Seed file has correct DozalDevs config
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -A 5 "target_channel" prisma/seed.ts | head -20
      2. Assert: DozalDevs section shows target_channel: 'C0AUBMXKVNU'
      3. Assert: DozalDevs section shows publish_channel: 'C092BJ04HUG'
      4. Run: grep "C0AUBMXKVNU" prisma/seed.ts
      5. Assert: appears in the DozalDevs tenant config section
    Expected Result: target_channel points to victor-tests, publish_channel points to project-lighthouse
    Failure Indicators: target_channel still shows C092BJ04HUG, or publish_channel is missing
    Evidence: .sisyphus/evidence/task-5-config-grep.txt

  Scenario: VLRE tenant config unchanged
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -B2 -A10 "vlreTenant" prisma/seed.ts | grep -c "C0AUBMXKVNU"
      2. Assert: output is "0" (VLRE does not reference victor-tests channel)
    Expected Result: VLRE config not contaminated with DozalDevs channels
    Failure Indicators: C0AUBMXKVNU appears in VLRE section
    Evidence: .sisyphus/evidence/task-5-vlre-unchanged.txt
  ```

  **Commit**: NO (will be committed together with Task 7 as one seed change)

- [x] 6. Verify Tenant Config Fix (Re-seed + DB Query)

  **What to do**:
  - Run `pnpm prisma db seed` to apply the config changes to the database
  - Query PostgREST to verify the DozalDevs tenant config is correct:
    ```bash
    curl -s "http://localhost:54321/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000002&select=config" \
      -H "apikey: $SUPABASE_SECRET_KEY" \
      -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0].config.summary'
    ```
  - Verify DozalDevs Slack OAuth token still exists after re-seed:
    ```bash
    curl -s "http://localhost:54321/rest/v1/tenant_secrets?tenant_id=eq.00000000-0000-0000-0000-000000000002&select=key" \
      -H "apikey: $SUPABASE_SECRET_KEY" \
      -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq .
    ```

  **Must NOT do**:
  - Do NOT modify any files
  - Do NOT skip the OAuth token verification — if it's missing, the E2E will fail

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running seed command and curl queries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after Task 5)
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:
  - `prisma/seed.ts` — The seed script that was just modified
  - AGENTS.md — States: "DB wipe/reset destroys OAuth connections" but `pnpm prisma db seed` uses upsert (safe)
  - `src/gateway/services/tenant-env-loader.ts:26-28` — How secrets are loaded (reads from `tenant_secrets` table)

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` exits successfully
  - [ ] DB query returns `target_channel: "C0AUBMXKVNU"` and `publish_channel: "C092BJ04HUG"` for DozalDevs
  - [ ] `tenant_secrets` still has a `slack_bot_token` row for DozalDevs tenant

  **QA Scenarios**:

  ```
  Scenario: DB has correct tenant config after re-seed
    Tool: Bash (curl)
    Preconditions: Task 5 complete, seed ran successfully
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exits with code 0, no errors
      3. Run: curl -s "http://localhost:54321/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000002&select=config" -H "apikey: <key>" -H "Authorization: Bearer <key>"
      4. Parse JSON: .[0].config.summary
      5. Assert: target_channel == "C0AUBMXKVNU"
      6. Assert: publish_channel == "C092BJ04HUG"
      7. Assert: channel_ids contains "C092BJ04HUG"
    Expected Result: All three fields present with correct values
    Failure Indicators: Missing fields, wrong channel IDs, seed failure
    Evidence: .sisyphus/evidence/task-6-db-config.txt

  Scenario: OAuth token survived re-seed
    Tool: Bash (curl)
    Preconditions: Seed complete
    Steps:
      1. Run: curl -s "http://localhost:54321/rest/v1/tenant_secrets?tenant_id=eq.00000000-0000-0000-0000-000000000002&select=key" -H "apikey: <key>" -H "Authorization: Bearer <key>"
      2. Assert: response contains {"key": "slack_bot_token"}
    Expected Result: slack_bot_token row exists for DozalDevs tenant
    Failure Indicators: Empty array or missing slack_bot_token entry. If missing, user must re-run OAuth flow before E2E.
    Evidence: .sisyphus/evidence/task-6-oauth-check.txt
  ```

  **Commit**: NO (verification only)

- [x] 7. Fix Archetype Instructions — File Writes + Channel Routing (Issues 3+4)

  **What to do**:
  - Open `prisma/seed.ts`
  - Find `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` (line 205-215)
  - Replace the entire instruction string with a corrected version that:
    1. Tells OpenCode to read from `C092BJ04HUG` using the read-channels tool
    2. Tells OpenCode to write the summary to `/tmp/summary.txt` using shell write (`echo "..." > /tmp/summary.txt` or equivalent)
    3. Tells OpenCode to post the approval message (with buttons) to `C0AUBMXKVNU` (victor-tests) — NOT project-lighthouse
    4. Tells OpenCode to redirect the post-message.js stdout to `/tmp/approval-message.json` using shell redirection: `node /tools/slack/post-message.js --channel "C0AUBMXKVNU" --text "..." --task-id <task-id> > /tmp/approval-message.json`
    5. Handles the zero-messages case: if no messages found, write "No activity in #project-lighthouse today" to `/tmp/summary.txt` and still post the approval message
    6. Handles DELIVERY_MODE=true: post the approved summary to `C092BJ04HUG` (project-lighthouse) as a clean message without buttons
  - The new instruction string should be:
    ```
    'Read the last 24 hours of messages from the project-lighthouse Slack channel (channel ID: C092BJ04HUG). ' +
    'Run: node /tools/slack/read-channels.js --channels "C092BJ04HUG" ' +
    'Generate a dramatic Spanish news-style summary following your system prompt guidelines. ' +
    'If no messages are found, write "Sin actividad en #project-lighthouse en las últimas 24 horas. Su corresponsal descansa... por ahora. 🎭" as the summary. ' +
    'CRITICAL — You MUST write the summary content to a file: write the full summary text to /tmp/summary.txt ' +
    'Post the summary with approve/reject buttons to the victor-tests channel (C0AUBMXKVNU) for review. ' +
    'CRITICAL — Capture the output: run the post-message tool and redirect stdout to /tmp/approval-message.json: ' +
    'node /tools/slack/post-message.js --channel "C0AUBMXKVNU" --text "<your summary>" --task-id <TASK_ID from end of prompt> > /tmp/approval-message.json ' +
    'Both /tmp/summary.txt and /tmp/approval-message.json MUST exist when you finish — the system reads them. ' +
    'When the DELIVERY_MODE environment variable equals "true", the summary was already approved — ' +
    'post the approved summary to project-lighthouse (C092BJ04HUG) as a final clean published message without buttons: ' +
    'node /tools/slack/post-message.js --channel "C092BJ04HUG" --text "<approved summary>"'
    ```

  **Must NOT do**:
  - Do NOT change `SUMMARIZER_INSTRUCTIONS` (the generic/Platform version at line 160-167)
  - Do NOT change VLRE archetype instructions
  - Do NOT modify `post-message.ts` or `read-channels.ts` source
  - Do NOT change the system prompt (`PAPI_CHULO_SYSTEM_PROMPT`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: String replacement in seed file, well-defined content
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:
  - `prisma/seed.ts:205-215` — Current `DOZALDEVS_SUMMARIZER_INSTRUCTIONS` to replace
  - `src/workers/opencode-harness.mts:193-229` — Harness reads `/tmp/summary.txt` and `/tmp/approval-message.json` after OpenCode completes
  - `src/worker-tools/slack/post-message.ts:116` — Tool writes JSON `{"ts":"...","channel":"..."}` to stdout
  - `src/worker-tools/slack/read-channels.ts:154` — Tool writes JSON to stdout
  - `src/workers/opencode-harness.mts:140-141` — How instructions are passed: `${systemPrompt}\n\n${instructions}\n\nTask ID: ${TASK_ID}`

  **Acceptance Criteria**:
  - [ ] Instructions mention `/tmp/summary.txt` (file write requirement)
  - [ ] Instructions mention `/tmp/approval-message.json` (stdout redirection)
  - [ ] Instructions post approval to `C0AUBMXKVNU` (victor-tests), NOT `C092BJ04HUG`
  - [ ] Instructions post final delivery to `C092BJ04HUG` (project-lighthouse) in DELIVERY_MODE
  - [ ] Instructions use `> /tmp/approval-message.json` shell redirection syntax
  - [ ] Instructions handle zero-messages scenario
  - [ ] Generic `SUMMARIZER_INSTRUCTIONS` (Platform) is unchanged
  - [ ] VLRE archetype instructions unchanged

  **QA Scenarios**:

  ```
  Scenario: Instructions contain required file paths
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep "summary.txt" prisma/seed.ts
      2. Assert: found in DOZALDEVS_SUMMARIZER_INSTRUCTIONS section
      3. Run: grep "approval-message.json" prisma/seed.ts
      4. Assert: found in DOZALDEVS_SUMMARIZER_INSTRUCTIONS section
      5. Run: grep "> /tmp/approval-message.json" prisma/seed.ts
      6. Assert: shell redirection syntax present
    Expected Result: Both file paths and redirection present in DozalDevs instructions
    Failure Indicators: Missing file paths or missing redirection operator
    Evidence: .sisyphus/evidence/task-7-instructions-files.txt

  Scenario: Channel routing correct in instructions
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Find the DOZALDEVS instructions and check which channel gets the --task-id flag (approval)
      2. Assert: C0AUBMXKVNU appears with --task-id (approval buttons go to victor-tests)
      3. Assert: C092BJ04HUG appears in DELIVERY_MODE section (final post to project-lighthouse)
    Expected Result: Approval to victor-tests, delivery to project-lighthouse
    Failure Indicators: C092BJ04HUG used with --task-id, or C0AUBMXKVNU used in DELIVERY_MODE
    Evidence: .sisyphus/evidence/task-7-channel-routing.txt

  Scenario: Platform/VLRE instructions unchanged
    Tool: Bash (grep)
    Preconditions: File edited
    Steps:
      1. Run: grep -c "C0AUBMXKVNU" prisma/seed.ts
      2. Assert: count matches only DozalDevs section occurrences (not in generic SUMMARIZER_INSTRUCTIONS)
      3. Verify SUMMARIZER_INSTRUCTIONS (line 160-167) still uses env vars, not hardcoded channels
    Expected Result: Only DozalDevs instructions reference victor-tests channel
    Failure Indicators: Generic instructions contaminated with DozalDevs-specific channels
    Evidence: .sisyphus/evidence/task-7-no-contamination.txt
  ```

  **Commit**: YES (combined with Task 5 changes)
  - Message: `fix(seed): correct DozalDevs channel routing and archetype instructions`
  - Files: `prisma/seed.ts`
  - Pre-commit: `pnpm test -- --run`

- [x] 8. Verify Archetype Instructions Fix (Re-seed + DB Query)

  **What to do**:
  - Run `pnpm prisma db seed` to apply the instruction changes
  - Query PostgREST to verify the DozalDevs archetype instructions are correct:
    ```bash
    curl -s "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000012&select=instructions" \
      -H "apikey: $SUPABASE_SECRET_KEY" \
      -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0].instructions'
    ```
  - Verify the instructions contain:
    - `/tmp/summary.txt`
    - `/tmp/approval-message.json`
    - `C0AUBMXKVNU` (approval channel)
    - Shell redirection (`>`)
  - Verify Platform archetype NOT changed:
    ```bash
    curl -s "http://localhost:54321/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000011&select=instructions" \
      -H "apikey: $SUPABASE_SECRET_KEY" \
      -H "Authorization: Bearer $SUPABASE_SECRET_KEY" | jq '.[0].instructions'
    ```

  **Must NOT do**:
  - Do NOT modify any files
  - Do NOT skip verifying the Platform archetype is unchanged

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Running seed and curl queries
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential after Task 7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 7

  **References**:
  - `prisma/seed.ts` — The updated seed file
  - DozalDevs archetype ID: `00000000-0000-0000-0000-000000000012`
  - Platform archetype ID: `00000000-0000-0000-0000-000000000011`

  **Acceptance Criteria**:
  - [ ] `pnpm prisma db seed` exits successfully
  - [ ] DozalDevs archetype instructions in DB contain `/tmp/summary.txt` and `/tmp/approval-message.json`
  - [ ] DozalDevs archetype instructions reference `C0AUBMXKVNU` for approval posting
  - [ ] Platform archetype instructions are unchanged (still use env vars, no hardcoded DozalDevs channels)

  **QA Scenarios**:

  ```
  Scenario: DozalDevs archetype has correct instructions in DB
    Tool: Bash (curl)
    Preconditions: Task 7 complete, seed ran
    Steps:
      1. Run: pnpm prisma db seed
      2. Assert: exits 0
      3. Run: curl query for archetype 00000000-0000-0000-0000-000000000012
      4. Assert: instructions field contains "summary.txt"
      5. Assert: instructions field contains "approval-message.json"
      6. Assert: instructions field contains "C0AUBMXKVNU"
      7. Assert: instructions field contains "> /tmp/"
    Expected Result: All required strings present in DB instructions
    Failure Indicators: Any required string missing from instructions
    Evidence: .sisyphus/evidence/task-8-db-instructions.txt

  Scenario: Platform archetype unchanged
    Tool: Bash (curl)
    Preconditions: Seed complete
    Steps:
      1. Run: curl query for archetype 00000000-0000-0000-0000-000000000011
      2. Assert: instructions do NOT contain "C0AUBMXKVNU"
      3. Assert: instructions do NOT contain "C092BJ04HUG"
      4. Assert: instructions still reference env vars (DAILY_SUMMARY_CHANNELS, SUMMARY_TARGET_CHANNEL)
    Expected Result: Platform archetype uses generic env var pattern, no DozalDevs channels
    Failure Indicators: Platform instructions contain hardcoded DozalDevs channel IDs
    Evidence: .sisyphus/evidence/task-8-platform-unchanged.txt
  ```

  **Commit**: NO (verification only)

- [x] 9. Full E2E Verification — Trigger, Monitor, Approve, Verify

  **What to do**:
  - **Pre-flight checks**:
    1. Verify Docker services running: `docker compose ps` (in `docker/` directory)
    2. Verify gateway running on port 3000: `curl -s http://localhost:3000/health`
    3. Verify Inngest dev server running on port 8288: `curl -s http://localhost:8288`
    4. Verify DozalDevs OAuth token present (from Task 6 evidence)
  - **Trigger the summarizer**:
    ```bash
    curl -s -X POST \
      -H "X-Admin-Key: $ADMIN_API_KEY" \
      -H "Content-Type: application/json" \
      "http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" \
      -d '{}'
    ```
    Save the returned `task_id`.
  - **Monitor task status** — poll every 15 seconds until status reaches `Reviewing` or `Failed`:
    ```bash
    curl -s "http://localhost:54321/rest/v1/tasks?id=eq.<task_id>&select=status" \
      -H "apikey: $SUPABASE_SECRET_KEY" \
      -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
    ```
  - **If task reaches `Reviewing`**:
    1. Verify a deliverable exists with `external_ref = task_id`
    2. Verify deliverable has non-empty `content` field
    3. Verify deliverable `metadata` contains `approval_message_ts` and `target_channel`
    4. Check `#victor-tests` (C0AUBMXKVNU) for the approval message with buttons
  - **Click Approve in Slack** (manual step — inform user to click the button)
  - **After approval, verify**:
    1. Task status transitions to `Done`
    2. Final summary appears in `#project-lighthouse` (C092BJ04HUG)
    3. Approval message in `#victor-tests` updated to "Approved by [user] — summary posted."
  - **If task reaches `Failed`**: Check Fly.io logs (`fly logs -a ai-employee-workers --region ord`) and report the failure reason

  **Must NOT do**:
  - Do NOT attempt to programmatically click the Slack Approve button (requires interactive Slack session)
  - Do NOT modify any code during this task
  - Do NOT trigger more than once unless the first attempt fails

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Long-running monitoring task requiring polling, log inspection, and multi-step verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (final, after all fixes verified)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 8

  **References**:
  - `src/gateway/routes/admin-employee-trigger.ts` — Manual trigger endpoint
  - `src/inngest/employee-lifecycle.ts` — Full lifecycle state machine
  - `src/workers/opencode-harness.mts` — Worker execution + file reads
  - AGENTS.md "Manual Trigger" section — curl examples for triggering
  - AGENTS.md "Summarizer failure diagnostic" table — troubleshooting symptoms

  **Acceptance Criteria**:
  - [ ] Task reaches `Reviewing` status (not `Failed`)
  - [ ] Deliverable record has `external_ref` matching task ID
  - [ ] Deliverable record has non-empty `content` (the summary text)
  - [ ] Deliverable `metadata` has `approval_message_ts` and `target_channel: "C0AUBMXKVNU"`
  - [ ] Approval message visible in `#victor-tests` (C0AUBMXKVNU) with Approve/Reject buttons
  - [ ] After Approve click: task status → `Done`
  - [ ] After Approve click: final summary posted to `#project-lighthouse` (C092BJ04HUG) without buttons
  - [ ] After Approve click: approval message in `#victor-tests` updated to "Approved" confirmation

  **QA Scenarios**:

  ```
  Scenario: Task reaches Reviewing state
    Tool: Bash (curl + polling)
    Preconditions: All fixes applied, Docker rebuilt, DB re-seeded, services running
    Steps:
      1. Run: curl -s -X POST -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" "http://localhost:3000/admin/tenants/00000000-0000-0000-0000-000000000002/employees/daily-summarizer/trigger" -d '{}'
      2. Parse: extract task_id from response
      3. Poll every 15s: curl task status until Reviewing or Failed (max 60 polls = 15 min)
      4. Assert: final status is "Reviewing"
    Expected Result: Task successfully reaches Reviewing within 15 minutes
    Failure Indicators: Status is "Failed", or timeout after 15 minutes still at "Executing"
    Evidence: .sisyphus/evidence/task-9-trigger-and-poll.txt

  Scenario: Deliverable has correct content and metadata
    Tool: Bash (curl)
    Preconditions: Task in Reviewing state
    Steps:
      1. Run: curl deliverables?external_ref=eq.<task_id>
      2. Assert: non-empty array returned
      3. Assert: content field is non-empty string (the summary)
      4. Assert: metadata.approval_message_ts is a string (Slack message timestamp)
      5. Assert: metadata.target_channel == "C0AUBMXKVNU"
    Expected Result: Deliverable with summary content and approval metadata
    Failure Indicators: Empty array (external_ref not set), empty content, missing metadata
    Evidence: .sisyphus/evidence/task-9-deliverable-check.txt

  Scenario: Approval completes the flow
    Tool: Bash (curl + Slack)
    Preconditions: Approval button clicked by user in #victor-tests
    Steps:
      1. Wait 30 seconds after user clicks Approve
      2. Run: curl task status
      3. Assert: status == "Done"
    Expected Result: Task reaches Done after approval
    Failure Indicators: Task stays at Reviewing, or transitions to Failed/Cancelled
    Evidence: .sisyphus/evidence/task-9-approval-complete.txt
  ```

  **Commit**: NO (E2E verification, no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (grep file, curl endpoint, query DB). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` + `pnpm lint`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Trigger the DozalDevs summarizer via admin API. Monitor task through all states. Verify approval message in `#victor-tests` (C0AUBMXKVNU). Click Approve. Verify final summary in `#project-lighthouse` (C092BJ04HUG). Verify approval message updated. Save evidence.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git diff). Verify VLRE archetype NOT touched, Platform archetype NOT touched, no Inngest event names changed, no tool source files modified. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                        | Files                              | Pre-commit           |
| ------ | ------------------------------------------------------------------------------ | ---------------------------------- | -------------------- |
| 1      | `fix(slack): correct approval status check from AwaitingApproval to Reviewing` | `src/gateway/slack/handlers.ts`    | `pnpm test -- --run` |
| 2      | `fix(worker): populate external_ref on deliverable for lifecycle lookup`       | `src/workers/opencode-harness.mts` | `pnpm test -- --run` |
| 3      | `fix(seed): correct DozalDevs channel routing and archetype instructions`      | `prisma/seed.ts`                   | `pnpm test -- --run` |

---

## Success Criteria

### Verification Commands

```bash
# Status mismatch fixed
grep -n "Reviewing" src/gateway/slack/handlers.ts  # Expected: line 62 shows 'Reviewing'

# Deliverable external_ref populated
grep -n "external_ref" src/workers/opencode-harness.mts  # Expected: includes TASK_ID

# Tenant config correct
curl -s "$SUPABASE_URL/rest/v1/tenants?id=eq.00000000-0000-0000-0000-000000000002&select=config" \
  -H "apikey: $SUPABASE_SECRET_KEY" | jq '.[0].config.summary'
# Expected: { channel_ids: ["C092BJ04HUG"], target_channel: "C0AUBMXKVNU", publish_channel: "C092BJ04HUG" }

# Instructions updated
curl -s "$SUPABASE_URL/rest/v1/archetypes?id=eq.00000000-0000-0000-0000-000000000012&select=instructions" \
  -H "apikey: $SUPABASE_SECRET_KEY" | jq '.[0].instructions' | grep -c "summary.txt"
# Expected: 1+ occurrences

# Full E2E: task reaches Done after approval
curl -s "$SUPABASE_URL/rest/v1/tasks?id=eq.<task-id>&select=status" \
  -H "apikey: $SUPABASE_SECRET_KEY" | jq '.[0].status'
# Expected: "Done"
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Docker image rebuilt with harness fix
- [ ] Database re-seeded with correct config
- [ ] DozalDevs OAuth token confirmed present
- [ ] Full E2E flow completed successfully
