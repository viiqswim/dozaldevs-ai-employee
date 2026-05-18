# Fix Edit & Send Delivery Bug + Slack UX Improvements

## TL;DR

> **Quick Summary**: Fix a critical production bug where "Edit & Send" delivers the original AI draft instead of the user's edited text, and improve Slack notification UX by suppressing link unfurls, showing the sent response in the parent message, and adding an explicit thread hint.
>
> **Deliverables**:
>
> - Edit & Send bug fixed — edited text delivered to guest, not original
> - Slack notify messages suppress Hostfully URL unfurls
> - Parent Done message shows sent response snippet
> - Explicit "See thread for details" hint in parent message
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 5 → F1-F4

---

## Context

### Original Request

User discovered two issues while reviewing production Slack output from the guest-messaging AI employee:

1. **Critical bug**: When using "Edit & Send", the original AI draft was sent to the guest instead of the user's edited version. The user edited "I apologize profusely" down to "Please accept our sincere apologies" — but the guest received the profuse original.

2. **UX friction**: The "🔗 View" link (now "View in Hostfully") is the most prominent clickable element in channel notifications. The Hostfully URL unfurl card pushes the native "2 replies / View thread" indicator far down, making users click the wrong link when they want to see the Slack thread.

### Root Cause Analysis

**Edit & Send Bug** — Field name mismatch in `employee-lifecycle.ts:1560`:

```typescript
parsed.draftResponse = editedContent; // Adds NEW field "draftResponse"
// But delivery_instructions say: extract the "draft" field
// The "draft" field still contains the ORIGINAL text
```

Additionally, `task.metadata.draft_response` is never updated after edit, so the terminal blocks' `sentSnippet` also shows the original.

**Slack UX** — Three compounding issues:

1. No `unfurl_links: false` on notify messages → Hostfully URL preview card takes ~4 lines of visual space
2. Parent Done message has no response snippet — key info is only in the thread
3. No explicit indicator that the thread contains important details

### Interview Summary

**Key Discussions**:

- User chose Option C (combine all three UX fixes)
- Edit & Send bug confirmed via production Slack thread for guest Thomas Stephenson (task `42ce9c40`)
- All changes touch 2-3 files that were recently modified in the bugfix batch

---

## Work Objectives

### Core Objective

Fix the Edit & Send delivery bug so edited text reaches the guest, and improve Slack notification UX so users naturally find the thread instead of clicking the Hostfully link.

### Concrete Deliverables

- `src/inngest/employee-lifecycle.ts` — patch `draft` field (not `draftResponse`), update task metadata, pass `sentSnippet` correctly for edit path
- `src/lib/slack-client.ts` — add `unfurl_links` support to `SlackMessageParams`
- `src/lib/slack-blocks.ts` — add sent snippet + thread hint to `buildNotifyBlocks` for Done state
- `src/inngest/employee-lifecycle.ts` — pass `unfurl_links: false` on notify postMessage calls, pass snippet to Done notify blocks
- `prisma/seed.ts` — no changes needed (delivery_instructions already say "extract the draft field" — that's correct)

### Definition of Done

- [ ] `pnpm build` succeeds with no errors
- [ ] `pnpm test -- --run` passes (515+, known pre-existing failures only)
- [ ] Edit & Send flow delivers edited text (verifiable via deliverable content inspection)
- [ ] Slack notify messages show no Hostfully URL unfurl preview
- [ ] Done-state notify message includes sent response snippet and thread hint

### Must Have

- Edit & Send patches the `draft` field in deliverable content (not `draftResponse`)
- Task metadata `draft_response` updated after edit so sentSnippet is correct
- `unfurl_links: false` on ALL notify-received postMessage calls
- Sent response snippet visible in parent Done message
- Thread hint text in parent Done message

### Must NOT Have (Guardrails)

- Do NOT change `delivery_instructions` in seed.ts — the instructions are correct ("extract the draft field")
- Do NOT modify `src/inngest/lib/poll-completion.ts`
- Do NOT add employee-specific language to `slack-client.ts` (it's shared infrastructure)
- Do NOT change the approval card builder (`post-guest-approval.ts`) — it already works correctly
- Do NOT suppress unfurls on thread replies (only on top-level channel messages)
- Do NOT change `unfurl_links` on `chat.update` calls — only on `postMessage` (Slack ignores unfurl params on updates anyway)
- Do NOT add `unfurl_links` as a required field — it must be optional with no default (backward compatible)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (verify existing tests still pass)
- **Framework**: vitest via `pnpm test -- --run`

### QA Policy

Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Lifecycle**: Use Bash — inspect deliverable content in DB, check build, run tests
- **Slack Messages**: Use Playwright — trigger real task, verify visual output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent fixes):
├── Task 1: Fix Edit & Send delivery bug (critical) [quick]
├── Task 2: Add unfurl_links support to SlackClient [quick]
└── Task 3: Enrich Done-state notify blocks with snippet + thread hint [quick]

Wave 2 (After Wave 1 — integration):
├── Task 4: Wire unfurl_links: false into lifecycle postMessage calls [quick]
└── Task 5: Wire edited sentSnippet into Done-state terminal + notify blocks [quick]

Wave 3 (After Wave 2 — verification):
├── Task 6: Build, test, seed, Docker rebuild [quick]
└── Task 7: Notify completion via Telegram [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On    | Blocks   |
| ---- | ------------- | -------- |
| 1    | —             | 5, 6     |
| 2    | —             | 4        |
| 3    | —             | 4, 5     |
| 4    | 2, 3          | 6        |
| 5    | 1, 3          | 6        |
| 6    | 1, 2, 3, 4, 5 | 7, F1-F4 |
| 7    | 6             | —        |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks → T1 `quick`, T2 `quick`, T3 `quick`
- **Wave 2**: 2 tasks → T4 `quick`, T5 `quick`
- **Wave 3**: 2 tasks → T6 `quick`, T7 `quick`
- **FINAL**: 4 tasks → F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Fix Edit & Send — patch `draft` field and update task metadata

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts` at line 1560, change `parsed.draftResponse = editedContent` to `parsed.draft = editedContent`. This ensures the delivery worker reads the edited text from the `draft` field, which is what `delivery_instructions` tell it to extract.
  - In the same `if (editedContent)` block (around line 1539-1593), after the deliverable content patch succeeds, also patch the task's metadata to update `draft_response`:
    ```typescript
    // After successful deliverable patch (after line 1587), update task metadata:
    try {
      const currentMeta = (await fetch(
        `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`,
        { headers },
      ).then((r) => r.json())) as Array<{ metadata: Record<string, unknown> | null }>;
      const existingMeta = currentMeta[0]?.metadata ?? {};
      await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          metadata: { ...existingMeta, draft_response: editedContent },
          updated_at: new Date().toISOString(),
        }),
      });
      log.info({ taskId }, 'Task metadata draft_response updated with editedContent');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to update task metadata draft_response (non-fatal)');
    }
    ```

  **Must NOT do**:
  - Do NOT change `delivery_instructions` in seed.ts
  - Do NOT modify any other field names in the deliverable content — only change `draftResponse` → `draft`
  - Do NOT make the metadata patch a hard failure — wrap in try/catch, log warn

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1539-1593` — The `if (editedContent)` block that patches deliverable content. Line 1560 is the bug: `parsed.draftResponse = editedContent` should be `parsed.draft = editedContent`
  - `src/inngest/employee-lifecycle.ts:268-287` — Example of patching task metadata via PostgREST (the superseded notify_slack_ts pattern). Follow this exact pattern for updating `draft_response`.
  - `src/workers/lib/output-schema.mts:3-11` — `StandardOutput` interface showing the canonical field name is `draft` (not `draftResponse`)
  - `prisma/seed.ts:3279` — Delivery instructions say "extract the 'draft' field" — confirms the field must be named `draft`

  **Acceptance Criteria**:
  - [ ] `pnpm build` succeeds
  - [ ] Line 1560 reads `parsed.draft = editedContent` (not `parsed.draftResponse`)
  - [ ] Task metadata patch code exists after deliverable patch, wrapped in try/catch

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify deliverable content field name after edit
    Tool: Bash (node)
    Preconditions: Build succeeds
    Steps:
      1. Run: grep -n "parsed\.draft = editedContent" src/inngest/employee-lifecycle.ts
      2. Assert: exactly 1 match found
      3. Run: grep -n "parsed\.draftResponse = editedContent" src/inngest/employee-lifecycle.ts
      4. Assert: 0 matches found
    Expected Result: `draft` field is patched, `draftResponse` field is not
    Evidence: .sisyphus/evidence/task-1-field-name-verify.txt

  Scenario: Verify metadata update code exists
    Tool: Bash (grep)
    Preconditions: Build succeeds
    Steps:
      1. Run: grep -n "draft_response: editedContent" src/inngest/employee-lifecycle.ts
      2. Assert: at least 1 match found (the metadata patch)
      3. Run: grep -n "Task metadata draft_response updated" src/inngest/employee-lifecycle.ts
      4. Assert: 1 match found (the log line)
    Expected Result: Metadata update code present with logging
    Evidence: .sisyphus/evidence/task-1-metadata-update-verify.txt
  ```

  **Commit**: YES (group with Task 5)
  - Message: `fix(guest-messaging): deliver edited text instead of original draft on Edit & Send`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Add `unfurl_links` support to SlackClient interface

  **What to do**:
  - In `src/lib/slack-client.ts`, add `unfurl_links?: boolean` to the `SlackMessageParams` interface (line 17, after `thread_ts`)
  - In the `postMessage` implementation (line 44-49), add the unfurl_links param to the JSON body:
    ```typescript
    body: JSON.stringify({
      channel: params.channel ?? config.defaultChannel,
      text: params.text,
      ...(params.blocks ? { blocks: params.blocks } : {}),
      ...(params.thread_ts ? { thread_ts: params.thread_ts } : {}),
      ...(params.unfurl_links !== undefined ? { unfurl_links: params.unfurl_links } : {}),
    }),
    ```

  **Must NOT do**:
  - Do NOT add a default value — `unfurl_links` must be optional and only sent when explicitly set
  - Do NOT add employee-specific comments or naming
  - Do NOT change the `updateMessage` method — Slack ignores unfurl params on updates

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/slack-client.ts:13-18` — `SlackMessageParams` interface — add `unfurl_links?: boolean` here
  - `src/lib/slack-client.ts:44-49` — The `body: JSON.stringify(...)` block — add conditional spread here
  - Slack API docs: `unfurl_links` is a boolean param on `chat.postMessage` that controls whether URLs are auto-previewed

  **Acceptance Criteria**:
  - [ ] `SlackMessageParams` has `unfurl_links?: boolean` field
  - [ ] `postMessage` body includes `unfurl_links` when set
  - [ ] `pnpm build` succeeds
  - [ ] No default value — field is optional

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify interface addition
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "unfurl_links" src/lib/slack-client.ts
      2. Assert: at least 2 matches (interface + implementation)
    Expected Result: unfurl_links present in both interface and body builder
    Evidence: .sisyphus/evidence/task-2-unfurl-links-verify.txt

  Scenario: Verify no default value
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "unfurl_links.*=" src/lib/slack-client.ts
      2. Assert: no match assigns a default (only conditional spread and interface declaration)
    Expected Result: No default value assigned
    Evidence: .sisyphus/evidence/task-2-no-default-verify.txt
  ```

  **Commit**: YES (group with Tasks 3, 4)
  - Message: `feat(slack): suppress unfurls on notify messages and show response snippet in Done state`
  - Files: `src/lib/slack-client.ts`
  - Pre-commit: `pnpm build`

- [x] 3. Enrich Done-state notify blocks with response snippet + thread hint

  **What to do**:
  - In `src/lib/slack-blocks.ts`, modify `buildNotifyBlocks` (line 391-449) to accept two new optional params: `sentSnippet?: string` and `threadHint?: boolean`
  - Before the final `Task` context block (line 443-446), add:
    1. If `sentSnippet` is provided, add a blockquote section showing a truncated snippet (max 150 chars):
       ```typescript
       if (sentSnippet) {
         const snippet = sentSnippet.length > 150 ? `${sentSnippet.slice(0, 150)}…` : sentSnippet;
         blocks.push({
           type: 'section',
           text: { type: 'mrkdwn', text: `> ${snippet}` },
         } as KnownBlock);
       }
       ```
    2. If `threadHint` is true, add a context block:
       ```typescript
       if (threadHint) {
         blocks.push({
           type: 'context',
           elements: [{ type: 'mrkdwn', text: '_See thread for full details_' }],
         } as KnownBlock);
       }
       ```

  **Must NOT do**:
  - Do NOT change any existing block structure — only ADD new optional blocks before the Task footer
  - Do NOT make the new params required — they must be optional for backward compatibility
  - Do NOT normalize `\n` here — the caller is responsible for passing clean text

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/slack-blocks.ts:391-449` — `buildNotifyBlocks` function. New params go in the signature (line 397), new blocks go before line 443 (the Task context block)
  - `src/lib/slack-blocks.ts:207-214` — `buildEnrichedTerminalBlocks` shows the existing snippet blockquote pattern (same `> ${snippet}` format)
  - `src/lib/slack-blocks.ts:436-441` — `extraText` section pattern — the new blocks follow this same approach (conditional push)

  **Acceptance Criteria**:
  - [ ] `buildNotifyBlocks` accepts `sentSnippet?: string` and `threadHint?: boolean`
  - [ ] Snippet block renders as blockquote when provided
  - [ ] Thread hint renders as italic context text when provided
  - [ ] Both are optional — existing callers unaffected
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify new params in function signature
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A5 "export function buildNotifyBlocks" src/lib/slack-blocks.ts
      2. Assert: signature includes sentSnippet and threadHint
    Expected Result: Both params present in signature
    Evidence: .sisyphus/evidence/task-3-signature-verify.txt

  Scenario: Verify backward compatibility
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: no type errors (existing callers don't pass new params = OK because optional)
    Expected Result: Build succeeds with no errors
    Evidence: .sisyphus/evidence/task-3-build-verify.txt
  ```

  **Commit**: YES (group with Tasks 2, 4)
  - Message: `feat(slack): suppress unfurls on notify messages and show response snippet in Done state`
  - Files: `src/lib/slack-blocks.ts`
  - Pre-commit: `pnpm build`

- [x] 4. Wire `unfurl_links: false` into lifecycle notify postMessage calls

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the notify-received `postMessage` call (line 303-307):
    ```typescript
    const result = await slackClientForNotify.postMessage({
      channel,
      text: `⏳ Task received — processing (${roleName})`,
      blocks,
    });
    ```
    Add `unfurl_links: false`:
    ```typescript
    const result = await slackClientForNotify.postMessage({
      channel,
      text: `⏳ Task received — processing (${roleName})`,
      blocks,
      unfurl_links: false,
    });
    ```
  - Also find the nudge postMessage call (line 1364-1376) that uses `reply_broadcast: true`. This one uses the raw `WebClient` from `@slack/web-api`, not our wrapper. Add `unfurl_links: false` there too:
    ```typescript
    const nudgeResult = await web.chat.postMessage({
      channel: notifyMsgRef.channel,
      text: nudgeText,
      blocks: ...,
      thread_ts: notifyMsgRef.ts,
      reply_broadcast: true,
      unfurl_links: false,
    });
    ```

  **Must NOT do**:
  - Do NOT add `unfurl_links` to `chat.update` calls — Slack ignores it on updates
  - Do NOT add it to thread reply postMessage calls (context thread, etc.) — only top-level and broadcast
  - Do NOT change any other parameters on these calls

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:302-307` — The notify-received postMessage call (uses our `SlackClient` wrapper)
  - `src/inngest/employee-lifecycle.ts:1364-1376` — The nudge postMessage call (uses raw `WebClient` from `@slack/web-api`)
  - `src/lib/slack-client.ts:13-18` — The `SlackMessageParams` interface (after Task 2 adds `unfurl_links`)

  **Acceptance Criteria**:
  - [ ] Notify-received postMessage includes `unfurl_links: false`
  - [ ] Nudge postMessage includes `unfurl_links: false`
  - [ ] No other postMessage calls modified
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify unfurl_links on notify-received
    Tool: Bash (grep)
    Steps:
      1. Run: grep -B2 -A6 "Task received — processing" src/inngest/employee-lifecycle.ts
      2. Assert: output includes unfurl_links: false
    Expected Result: unfurl_links: false present in notify-received call
    Evidence: .sisyphus/evidence/task-4-notify-unfurl-verify.txt

  Scenario: Verify unfurl_links on nudge
    Tool: Bash (grep)
    Steps:
      1. Run: grep -B2 -A2 "reply_broadcast: true" src/inngest/employee-lifecycle.ts
      2. Assert: nearby lines include unfurl_links: false
    Expected Result: unfurl_links: false present alongside reply_broadcast
    Evidence: .sisyphus/evidence/task-4-nudge-unfurl-verify.txt
  ```

  **Commit**: YES (group with Tasks 2, 3)
  - Message: `feat(slack): suppress unfurls on notify messages and show response snippet in Done state`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 5. Wire edited sentSnippet into Done-state terminal + notify blocks

  **What to do**:
  - In `src/inngest/employee-lifecycle.ts`, find the Done-state approval card update (line 1922-1931). The `sentSnippet` currently reads from `metadata['draft_response']`. After Task 1's metadata patch, this will be correct for the edit path. BUT — there's a timing issue: the metadata was patched earlier in the same step, so the local `metadata` variable is stale. Fix by using `editedContent` directly when available:
    ```typescript
    sentSnippet: (editedContent ?? (metadata['draft_response'] as string | undefined))?.slice(0, 150),
    ```
  - Find the Done-state notify message update (line 1950-1957). Pass the new `sentSnippet` and `threadHint` params:
    ```typescript
    const notifyDoneBlocks = buildNotifyBlocks({
      state: 'Done',
      archetypeName: (archetype.role_name as string) ?? 'unknown',
      taskId,
      enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
      emoji: '✅',
      extraText: `Approved by <@${actorUserId}>`,
      sentSnippet: (editedContent ?? (metadata['draft_response'] as string | undefined))?.slice(
        0,
        150,
      ),
      threadHint: true,
    });
    ```

  **Must NOT do**:
  - Do NOT normalize `\n` in the snippet here — `buildEnrichedTerminalBlocks` already handles that at line 208
  - Do NOT pass `sentSnippet` or `threadHint` to non-Done notify blocks (Received, Reviewing, etc.)
  - Do NOT change the Rejected/Failed/Expired notify paths

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/inngest/employee-lifecycle.ts:1922-1931` — `buildEnrichedTerminalBlocks` call for Done. Line 1929 has the stale `sentSnippet`. Use `editedContent` fallback.
  - `src/inngest/employee-lifecycle.ts:1950-1957` — `buildNotifyBlocks` call for Done. Add `sentSnippet` and `threadHint: true` here.
  - `src/inngest/employee-lifecycle.ts:1521` — `editedContent` variable is in scope here (destructured from approval event data at line 1518-1528)
  - `src/lib/slack-blocks.ts:391` — `buildNotifyBlocks` signature (after Task 3 adds new params)

  **Acceptance Criteria**:
  - [ ] Terminal blocks sentSnippet uses `editedContent ?? metadata['draft_response']`
  - [ ] Notify Done blocks pass `sentSnippet` and `threadHint: true`
  - [ ] Only the Done path is modified — other states untouched
  - [ ] `pnpm build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify editedContent fallback in terminal blocks
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "editedContent.*draft_response.*slice" src/inngest/employee-lifecycle.ts
      2. Assert: at least 2 matches (terminal blocks + notify blocks)
    Expected Result: Both sentSnippet lines use editedContent fallback
    Evidence: .sisyphus/evidence/task-5-snippet-fallback-verify.txt

  Scenario: Verify threadHint in Done notify
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "threadHint: true" src/inngest/employee-lifecycle.ts
      2. Assert: exactly 1 match (the Done notify blocks call)
    Expected Result: threadHint passed only for Done state
    Evidence: .sisyphus/evidence/task-5-thread-hint-verify.txt
  ```

  **Commit**: YES (group with Task 1)
  - Message: `fix(guest-messaging): deliver edited text instead of original draft on Edit & Send`
  - Files: `src/inngest/employee-lifecycle.ts`
  - Pre-commit: `pnpm build`

- [x] 6. Build, test, reseed DB, rebuild Docker image

  **What to do**:
  - Run `pnpm build` — must succeed with 0 errors
  - Run `pnpm test -- --run` — must pass 515+ tests (known pre-existing failures: `container-boot.test.ts`, `inngest-serve.test.ts`, 2 in `migration-agents-md.test.ts`)
  - Run `pnpm prisma db seed` — reseed DB (no seed.ts changes but ensures consistency)
  - Run `docker build -t ai-employee-worker:latest .` in tmux — rebuild Docker image with updated lifecycle code

  **Must NOT do**:
  - Do NOT skip the Docker rebuild — lifecycle changes run inside the Docker container for delivery phase
  - Do NOT attempt to fix pre-existing test failures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential after all implementation)
  - **Blocks**: Task 7, F1-F4
  - **Blocked By**: Tasks 1-5

  **References**:
  - AGENTS.md — Commands section: `pnpm build`, `pnpm test -- --run`
  - AGENTS.md — Long-Running Commands: Docker build must use tmux

  **Acceptance Criteria**:
  - [ ] `pnpm build` — 0 errors
  - [ ] `pnpm test -- --run` — 515+ passing
  - [ ] `pnpm prisma db seed` — completes successfully
  - [ ] `docker build` — completes successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full build and test
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -3
      2. Assert: clean exit
      3. Run: pnpm test -- --run 2>&1 | tail -10
      4. Assert: 515+ tests pass, only known failures
    Expected Result: Build clean, tests green
    Evidence: .sisyphus/evidence/task-6-build-test.txt

  Scenario: Docker rebuild
    Tool: Bash (tmux)
    Steps:
      1. Launch: docker build -t ai-employee-worker:latest . in tmux ai-build
      2. Poll until EXIT_CODE detected
      3. Assert: exit code 0
    Expected Result: Docker image built successfully
    Evidence: .sisyphus/evidence/task-6-docker-build.txt
  ```

  **Commit**: NO (no code changes in this task)

- [x] 7. Notify completion via Telegram

  **What to do**:
  - Run: `tsx scripts/telegram-notify.ts "📋 edit-send-fix-and-slack-ux complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **Acceptance Criteria**:
  - [ ] Telegram notification sent successfully

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Send notification
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "📋 edit-send-fix-and-slack-ux complete — All tasks done. Come back to review results."
      2. Assert: exit code 0
    Expected Result: Message delivered
    Evidence: .sisyphus/evidence/task-7-telegram.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review all changed files for type errors, unused imports, `as any` casts, console.log in prod.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Inspect the DB deliverable content for a recent Edit & Send task to verify the `draft` field was patched (not `draftResponse`). Check Slack snapshot for: no unfurl on notify, snippet visible in Done parent, thread hint visible.
      Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: verify 1:1 match between spec and diff. Check no files outside scope were touched. Verify `slack-client.ts` changes are employee-agnostic.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                    | Files                                                                                     |
| ------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1      | `fix(guest-messaging): deliver edited text instead of original draft on Edit & Send`       | `src/inngest/employee-lifecycle.ts`                                                       |
| 2      | `feat(slack): suppress unfurls on notify messages and show response snippet in Done state` | `src/lib/slack-client.ts`, `src/lib/slack-blocks.ts`, `src/inngest/employee-lifecycle.ts` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: clean exit, no errors
pnpm test -- --run  # Expected: 515+ passing, known pre-existing failures only
```

### Final Checklist

- [ ] Edit & Send patches `draft` field in deliverable content
- [ ] Task metadata `draft_response` updated after edit
- [ ] `sentSnippet` in terminal blocks shows edited text (not original)
- [ ] Notify messages have `unfurl_links: false`
- [ ] Done parent message shows sent response snippet
- [ ] Done parent message shows thread hint
- [ ] All "Must NOT Have" guardrails respected
- [ ] All tests pass
- [ ] Docker image rebuilt
- [ ] DB reseeded
