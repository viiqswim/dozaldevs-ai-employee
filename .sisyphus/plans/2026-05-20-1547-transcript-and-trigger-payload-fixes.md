# Transcript & Trigger Payload — Dashboard UX Fixes

## TL;DR

> **Quick Summary**: Fix two dashboard UX bugs — session transcripts render blank despite having data (format mismatch), and the "Raw Event" section is confusing for non-webhook tasks. Replace broken `TranscriptMessage` component with format-agnostic pretty-printed JSON, rename "Raw Event" → "Trigger Payload" with contextual empty state.
>
> **Deliverables**:
>
> - Session transcript renders as collapsible pretty-printed JSON blocks (one per message)
> - "Raw Event" renamed to "Trigger Payload" with explanatory empty state for non-webhook tasks
> - Dead code removed: `TranscriptMessage`, `ToolCallBlock`, `ContentBlock` interface
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single file, sequential tasks
> **Critical Path**: T1 (transcript fix) → T2 (trigger payload rename) → T3 (integration QA) → T4 (notify)

---

## Context

### Original Request

User triggered the `real-estate-motivation-bot` employee and navigated to the task detail page. Clicking "View Transcript" showed a completely blank area despite the execution having 6 transcript messages (55KB of data). The "Raw Event" section showed "No raw event data" with zero explanation of what raw events are or why they're missing for non-webhook tasks.

### Interview Summary

**Key Discussions**:

- **Transcript rendering**: User explicitly said "Can't we just show the JSON in a pretty format so that we don't have to deal with who output the JSON?" — format-agnostic pretty-printed JSON, no parsing of message structure.
- **Raw Event UX**: User chose "Rename + explain" — rename section to "Trigger Payload", show contextual explanation when empty.
- **Scope**: User chose to plan both fixes together.

**Research Findings**:

- **Root cause (transcript)**: `TranscriptMessage` component (lines 215-280) expects Anthropic message format `{ role, content }` but ALL real data uses OpenCode format `{ info: { role, ... }, parts: [{ type, text, ... }] }`. On line 217-218 it reads `msg.role` (→ undefined) and `msg.content` (→ undefined). Line 251: `if (!textContent && toolUses.length === 0) return null` — silently returns null for every message.
- **All 10 transcripts in DB** use OpenCode format. Zero backward compatibility concern.
- **`useExecutionTranscript` hook** works correctly — data IS fetched (55KB response confirmed via network tab).
- **Raw Event pattern**: `tasks.raw_event` is always populated for guest-messaging (webhook-triggered) and always NULL for motivation-bot/summarizer (admin API / cron triggered).
- **Dead code**: `TranscriptMessage`, `ToolCallBlock`, `ContentBlock` are only used within the transcript rendering section — safe to delete entirely.

### Metis Review

**Identified Gaps** (addressed):

- **G1**: Confirmed single-file scope (`TaskDetail.tsx` only) — no cross-file changes needed
- **G2**: No format detection logic — pure `JSON.stringify` only, per user's explicit request
- **G3**: No changes to `useExecutionTranscript` hook — it works correctly
- **G5**: Delete `TranscriptMessage`, `ToolCallBlock`, `ContentBlock` entirely — no dead code
- **G6**: "Trigger Payload" rename is string literals only, not variable/type names (props stay `rawEvent`)
- **SC2**: Do NOT add syntax highlighting libraries (no new dependencies)
- **SC3**: Use existing `CollapsibleJsonViewer` pattern — no new components needed
- **E1**: Handle both `null` and `[]` transcript cases
- **E2**: Wrap `JSON.stringify` in try/catch for safety (malformed data)
- **E3**: 55KB messages → collapsed by default to avoid overwhelming the page
- **Empty state wording**: "This task was not triggered by a webhook, so no payload was captured." — generic enough for all null cases

---

## Work Objectives

### Core Objective

Make session transcripts actually visible and the trigger payload section self-explanatory.

### Concrete Deliverables

- `dashboard/src/panels/tasks/TaskDetail.tsx` — modified (transcript rendering + trigger payload rename + dead code removal)

### Definition of Done

- [ ] Clicking "View Transcript" on task `a78292b7` shows 6 collapsible JSON blocks
- [ ] Each JSON block is collapsed by default, expandable on click
- [ ] "Raw Event" section renamed to "Trigger Payload" everywhere in the UI
- [ ] Non-webhook tasks show: "This task was not triggered by a webhook, so no payload was captured."
- [ ] Webhook tasks (e.g. `81607010`) still show the JSON payload correctly
- [ ] `TranscriptMessage`, `ToolCallBlock`, `ContentBlock` are fully deleted
- [ ] `pnpm build` passes with zero errors

### Must Have

- Format-agnostic JSON rendering (no Anthropic/OpenCode format detection)
- Collapsed by default (expandable per message)
- Contextual empty state for trigger payload
- All dead code removed

### Must NOT Have (Guardrails)

- ❌ No new npm dependencies (no syntax highlighting libraries)
- ❌ No changes to `useExecutionTranscript` hook
- ❌ No renaming of TypeScript variables/props (only UI label strings)
- ❌ No format detection logic (no `if (msg.info)` vs `if (msg.role)` branching)
- ❌ No changes to `RawEventViewer` prop name (`rawEvent` stays as-is)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — these are UI rendering fixes; visual verification via Playwright is the appropriate strategy
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios using Playwright against `http://localhost:7701`.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — single file, dependent changes):
├── Task 1: Fix transcript rendering (replace TranscriptMessage with JSON blocks) [quick]
├── Task 2: Rename Raw Event → Trigger Payload + contextual empty state [quick]
└── Task 3: Integration QA via Playwright [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

Note: Tasks 1-2 are sequential because they modify the same file. Task 2 also deletes dead code left over from Task 1's changes. Task 3 verifies both changes together.

### Dependency Matrix

| Task | Depends On | Blocks | Wave  |
| ---- | ---------- | ------ | ----- |
| T1   | —          | T2, T3 | 1     |
| T2   | T1         | T3     | 1     |
| T3   | T1, T2     | F1-F4  | 1     |
| F1   | T3         | —      | FINAL |
| F2   | T3         | —      | FINAL |
| F3   | T3         | —      | FINAL |
| F4   | T3         | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick` (+ `playwright` skill for T3)
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+ `playwright`), F4 → `deep`

---

## TODOs

- [x] 1. Fix transcript rendering — replace TranscriptMessage with collapsible JSON blocks

  **What to do**:
  1. Delete the `ContentBlock` interface (lines 182-190), `ToolCallBlock` component (lines 192-213), and `TranscriptMessage` component (lines 215-280). These are dead code — they expect Anthropic message format but all real data uses OpenCode format.
  2. Replace the transcript rendering section (lines 657-662) — instead of mapping through `TranscriptMessage`, render each transcript message as a collapsible JSON block using the existing `CollapsibleJsonViewer` component (lines 126-171) already in the file.
  3. Each message should be rendered as: `<CollapsibleJsonViewer label={`Message ${i + 1}`} data={msg as Record<string, unknown>} />` — collapsed by default (the component's `defaultOpen` is already `false`).
  4. Wrap the `JSON.stringify` call path in a try/catch for safety — if a message is somehow not serializable, show a fallback error message instead of crashing the page. Note: `CollapsibleJsonViewer` already calls `JSON.stringify(data, null, 2)` on line 138 — add a try/catch around the `<pre>` rendering inside `CollapsibleJsonViewer` if not already present, or wrap individual message casting.
  5. The `CollapsibleJsonViewer` component already handles truncation (uses `RAW_EVENT_TRUNCATE_CHARS` on line 139) and expand/collapse — no new logic needed.

  **Must NOT do**:
  - Do NOT modify `useExecutionTranscript` hook
  - Do NOT add format detection logic (no `if (msg.info)` branching)
  - Do NOT add new npm dependencies
  - Do NOT create new components — reuse `CollapsibleJsonViewer`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, clear instructions, straightforward delete + replace
  - **Skills**: `[]`
    - No specialized skills needed — pure React/TSX editing
  - **Skills Evaluated but Omitted**:
    - `visual-engineering`: Not needed — no design work, just swapping rendering logic

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, Sequential (Task 1 of 3)
  - **Blocks**: T2 (trigger payload rename depends on clean file state after dead code removal)
  - **Blocked By**: None — can start immediately

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `dashboard/src/panels/tasks/TaskDetail.tsx:126-171` — `CollapsibleJsonViewer` component — REUSE this exact component for transcript messages. It already handles collapse/expand, truncation, and "Show full" button.
  - `dashboard/src/panels/tasks/TaskDetail.tsx:138` — `JSON.stringify(data, null, 2)` — the serialization pattern already in use
  - `dashboard/src/panels/tasks/TaskDetail.tsx:139-141` — truncation logic with `RAW_EVENT_TRUNCATE_CHARS` (2000 chars)

  **Code to DELETE** (dead code):
  - `dashboard/src/panels/tasks/TaskDetail.tsx:182-190` — `ContentBlock` interface (only used by `TranscriptMessage`)
  - `dashboard/src/panels/tasks/TaskDetail.tsx:192-213` — `ToolCallBlock` component (only used by `TranscriptMessage`)
  - `dashboard/src/panels/tasks/TaskDetail.tsx:215-280` — `TranscriptMessage` component (the broken one)

  **Code to MODIFY** (transcript rendering):
  - `dashboard/src/panels/tasks/TaskDetail.tsx:657-662` — Replace:
    ```tsx
    <div className="space-y-2">
      {transcript.map((msg, i) => (
        <TranscriptMessage key={i} message={msg} />
      ))}
    </div>
    ```
    With:
    ```tsx
    <div className="space-y-2">
      {transcript.map((msg, i) => (
        <CollapsibleJsonViewer
          key={i}
          label={`Message ${i + 1}`}
          data={msg as Record<string, unknown>}
        />
      ))}
    </div>
    ```

  **API/Type References**:
  - `dashboard/src/hooks/use-execution-transcript.ts:6` — transcript type is `unknown[] | null` — the `as Record<string, unknown>` cast is safe for `JSON.stringify`

  **Data shape reference** (what the JSON will look like when rendered):
  - OpenCode format: `{ info: { id, role, time, agent, model, ... }, parts: [{ id, text, type, ... }] }`
  - Verified via DB: `SELECT session_transcript->0 FROM executions WHERE task_id = 'a78292b7-...'`

  **Acceptance Criteria**:
  - [ ] `ContentBlock` interface deleted from file
  - [ ] `ToolCallBlock` component deleted from file
  - [ ] `TranscriptMessage` component deleted from file
  - [ ] Transcript messages render using `CollapsibleJsonViewer`
  - [ ] `pnpm build` passes with zero errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — transcript renders with 6 JSON blocks
    Tool: Playwright
    Preconditions: Dashboard dev server running at http://localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/a78292b7-7f67-41d5-b096-1efa64d0d9a6?tenant=00000000-0000-0000-0000-000000000003
      2. Click the "View Transcript" button (selector: button with text "View Transcript")
      3. Wait for loading spinner to disappear (text "Loading transcript…" should be gone)
      4. Count elements matching collapsible JSON viewer pattern — expect 6 message blocks
      5. Verify first block label contains "Message 1"
      6. Verify all blocks are collapsed (no <pre> tags with JSON visible inside the transcript section initially — the expand buttons should show ChevronRight, not ChevronDown)
      7. Click the first message's expand button
      8. Verify a <pre> element appears containing valid JSON with "info" and "parts" keys
    Expected Result: 6 collapsible blocks rendered, first one expandable to show JSON with OpenCode format fields
    Failure Indicators: Blank transcript area, 0 blocks rendered, "Transcript not available" message, or JavaScript error in console
    Evidence: .sisyphus/evidence/task-1-transcript-renders.png

  Scenario: Edge case — empty transcript array
    Tool: Playwright
    Preconditions: A task with empty transcript (or mock by temporarily checking the empty state)
    Steps:
      1. If task a78292b7 renders correctly, verify the empty state path: the code at line 654-655 should show "Transcript is empty" for an empty array — verify this text exists in the component source via grep
      2. Run `pnpm build` to confirm no TypeScript errors
    Expected Result: Empty array case handled with "Transcript is empty" message
    Failure Indicators: Build failure, missing empty state handling
    Evidence: .sisyphus/evidence/task-1-build-pass.txt
  ```

  **Evidence to Capture:**
  - [ ] `task-1-transcript-renders.png` — Screenshot showing 6 JSON blocks
  - [ ] `task-1-build-pass.txt` — Build output

  **Commit**: YES (single commit with T2)
  - Message: `fix(dashboard): render session transcript as collapsible JSON and rename Raw Event to Trigger Payload`
  - Files: `dashboard/src/panels/tasks/TaskDetail.tsx`
  - Pre-commit: `pnpm build`

- [x] 2. Rename "Raw Event" → "Trigger Payload" with contextual empty state

  **What to do**:
  1. In the `RawEventViewer` component (lines 71-124), rename ALL user-visible label strings from "Raw Event" to "Trigger Payload":
     - Line 84: `Raw Event` → `Trigger Payload`
     - Line 104: `Raw Event` → `Trigger Payload`
  2. Replace the empty state message (line 86): change `No raw event data` to `This task was not triggered by a webhook, so no payload was captured.`
  3. Do NOT rename the component function name (`RawEventViewer`), prop name (`rawEvent`), or any TypeScript types — only UI-visible strings.

  **Must NOT do**:
  - Do NOT rename `RawEventViewer` function or `rawEvent` prop
  - Do NOT change the behavior when `rawEvent` is non-null (JSON display works correctly)
  - Do NOT add new components or dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 string literal replacements in a single component — trivial
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `visual-engineering`: Overkill for string replacements

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, Sequential (Task 2 of 3)
  - **Blocks**: T3 (integration QA)
  - **Blocked By**: T1 (same file — avoid merge conflicts)

  **References** (CRITICAL):

  **Code to MODIFY**:
  - `dashboard/src/panels/tasks/TaskDetail.tsx:84` — Label in null branch: `Raw Event` → `Trigger Payload`
  - `dashboard/src/panels/tasks/TaskDetail.tsx:86` — Empty state: `No raw event data` → `This task was not triggered by a webhook, so no payload was captured.`
  - `dashboard/src/panels/tasks/TaskDetail.tsx:104` — Label in non-null branch: `Raw Event` → `Trigger Payload`

  **Important context** — WHY these changes:
  - "Raw Event" means nothing to users who don't know about webhook payloads
  - Non-webhook tasks (cron-triggered, admin API) always have `null` raw_event — the old message gave zero context
  - The new wording explains both what the section is and why it's empty

  **Acceptance Criteria**:
  - [ ] No instance of "Raw Event" string remains in UI labels (grep for `Raw Event` in the file)
  - [ ] "Trigger Payload" appears as the section header in both null and non-null branches
  - [ ] Empty state shows: "This task was not triggered by a webhook, so no payload was captured."
  - [ ] `pnpm build` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — non-webhook task shows contextual empty state
    Tool: Playwright
    Preconditions: Dashboard dev server running at http://localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/a78292b7-7f67-41d5-b096-1efa64d0d9a6?tenant=00000000-0000-0000-0000-000000000003
      2. Scroll to the bottom section (last card on the page)
      3. Verify the section header text is "Trigger Payload" (not "Raw Event")
      4. Click the "Trigger Payload" toggle to expand
      5. Verify the empty state text reads: "This task was not triggered by a webhook, so no payload was captured."
    Expected Result: "Trigger Payload" label with explanatory empty state
    Failure Indicators: "Raw Event" text visible, old "No raw event data" message, or missing section
    Evidence: .sisyphus/evidence/task-2-trigger-payload-empty.png

  Scenario: Happy path — webhook task still renders payload JSON
    Tool: Playwright
    Preconditions: Dashboard dev server running at http://localhost:7701
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/81607010-78ce-4737-b246-2a84bbb22ce5?tenant=00000000-0000-0000-0000-000000000003
      2. Scroll to the bottom section
      3. Verify the section header text is "Trigger Payload"
      4. Click the toggle to expand
      5. Verify JSON payload is visible in a <pre> element
      6. Verify the JSON contains expected fields (e.g., "event_type", "property_uid", "lead_uid")
    Expected Result: "Trigger Payload" header with full JSON payload rendered
    Failure Indicators: Missing JSON, broken rendering, or "Raw Event" text
    Evidence: .sisyphus/evidence/task-2-trigger-payload-with-data.png
  ```

  **Evidence to Capture:**
  - [ ] `task-2-trigger-payload-empty.png` — Non-webhook task with contextual message
  - [ ] `task-2-trigger-payload-with-data.png` — Webhook task with JSON payload

  **Commit**: YES (same commit as T1)
  - Message: `fix(dashboard): render session transcript as collapsible JSON and rename Raw Event to Trigger Payload`
  - Files: `dashboard/src/panels/tasks/TaskDetail.tsx`
  - Pre-commit: `pnpm build`

- [x] 3. Integration QA — verify both fixes together via Playwright

  **What to do**:
  1. Run comprehensive Playwright-based QA covering BOTH the transcript fix and trigger payload rename together on real task pages.
  2. Verify no regressions in other parts of the task detail page (status badge, timeline, deliverable section, feedback events).
  3. Run `pnpm build` one final time to confirm clean build.
  4. Verify dead code is fully gone by grepping for `TranscriptMessage`, `ToolCallBlock`, `ContentBlock` in the file.

  **Must NOT do**:
  - Do NOT modify any files — this is a read-only QA task
  - Do NOT create new test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Read-only verification, no code changes
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not strictly needed — basic Playwright snapshot/navigation is sufficient

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1, Sequential (Task 3 of 3)
  - **Blocks**: F1-F4 (final verification wave)
  - **Blocked By**: T1, T2

  **References**:
  - Test task URLs:
    - Motivation-bot (has transcript, no raw_event): `http://localhost:7701/dashboard/tasks/a78292b7-7f67-41d5-b096-1efa64d0d9a6?tenant=00000000-0000-0000-0000-000000000003`
    - Guest-messaging (has raw_event): `http://localhost:7701/dashboard/tasks/81607010-78ce-4737-b246-2a84bbb22ce5?tenant=00000000-0000-0000-0000-000000000003`

  **Acceptance Criteria**:
  - [ ] Transcript shows 6 collapsible JSON blocks on motivation-bot task
  - [ ] "Trigger Payload" label shown on both tasks
  - [ ] Empty state message correct on non-webhook task
  - [ ] JSON payload renders on webhook task
  - [ ] No regressions on other page sections (status badge, timeline render without errors)
  - [ ] `pnpm build` passes
  - [ ] No instances of `TranscriptMessage`, `ToolCallBlock`, or `ContentBlock` in `TaskDetail.tsx`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full integration — motivation-bot task page
    Tool: Playwright
    Preconditions: T1 and T2 are committed and build passes
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/a78292b7-7f67-41d5-b096-1efa64d0d9a6?tenant=00000000-0000-0000-0000-000000000003
      2. Verify page loads without console errors
      3. Verify status badge renders (should show a status like "Done" or "Failed")
      4. Click "View Transcript" — verify 6 JSON blocks appear, all collapsed
      5. Expand Message 1 — verify JSON with "info" and "parts" keys
      6. Scroll to bottom — verify "Trigger Payload" section with empty state message
      7. Take full-page screenshot
    Expected Result: All sections render correctly, transcript shows data, trigger payload shows explanation
    Failure Indicators: Any blank section, JavaScript errors, or old text ("Raw Event")
    Evidence: .sisyphus/evidence/task-3-integration-motivation-bot.png

  Scenario: Full integration — guest-messaging task page
    Tool: Playwright
    Preconditions: Same as above
    Steps:
      1. Navigate to http://localhost:7701/dashboard/tasks/81607010-78ce-4737-b246-2a84bbb22ce5?tenant=00000000-0000-0000-0000-000000000003
      2. Verify page loads without console errors
      3. Scroll to bottom — verify "Trigger Payload" header with expandable JSON
      4. Expand — verify JSON contains "event_type" field
      5. Take full-page screenshot
    Expected Result: Trigger payload section renders webhook JSON correctly under new label
    Failure Indicators: "Raw Event" text, missing JSON, broken layout
    Evidence: .sisyphus/evidence/task-3-integration-guest-messaging.png

  Scenario: Dead code verification
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "TranscriptMessage\|ToolCallBlock\|ContentBlock" dashboard/src/panels/tasks/TaskDetail.tsx
      2. Verify zero matches
      3. Run: pnpm build 2>&1 | tail -5
      4. Verify exit code 0
    Expected Result: Zero grep matches, build passes
    Failure Indicators: Any grep match = dead code not fully removed
    Evidence: .sisyphus/evidence/task-3-dead-code-check.txt
  ```

  **Evidence to Capture:**
  - [ ] `task-3-integration-motivation-bot.png` — Full page screenshot
  - [ ] `task-3-integration-guest-messaging.png` — Full page screenshot
  - [ ] `task-3-dead-code-check.txt` — Grep output + build output

  **Commit**: NO (QA-only task, no code changes)

- [x] 4. Notify completion via Telegram

  **What to do**:
  1. Send Telegram notification: `tsx scripts/telegram-notify.ts "✅ transcript-and-trigger-payload-fixes complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: After F1-F4 approval
  - **Blocks**: None
  - **Blocked By**: F1-F4

  **Acceptance Criteria**:
  - [ ] Telegram message sent successfully (exit code 0)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Steps:
      1. Run: tsx scripts/telegram-notify.ts "✅ transcript-and-trigger-payload-fixes complete — All tasks done. Come back to review results."
      2. Verify exit code 0
    Expected Result: Message delivered, exit code 0
    Failure Indicators: Non-zero exit code, network error
    Evidence: .sisyphus/evidence/task-4-telegram-sent.txt
  ```

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check DOM via Playwright). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build`. Review all changes in `TaskDetail.tsx` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify dead code (`TranscriptMessage`, `ToolCallBlock`, `ContentBlock`) is fully removed. Check no AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Dead Code [CLEAN/FOUND] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
      Start from clean state. Open `http://localhost:7701/dashboard/tasks/a78292b7-7f67-41d5-b096-1efa64d0d9a6?tenant=00000000-0000-0000-0000-000000000003`. Click "View Transcript" — verify 6 JSON blocks appear, all collapsed. Expand one — verify valid JSON. Navigate to `http://localhost:7701/dashboard/tasks/81607010-78ce-4737-b246-2a84bbb22ce5?tenant=00000000-0000-0000-0000-000000000003` — verify "Trigger Payload" label and JSON data renders. Find a task with null raw_event — verify contextual empty state message. Save screenshots to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff HEAD~1`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                                                 | Files                                       | Pre-commit   |
| ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------ |
| 1      | `fix(dashboard): render session transcript as collapsible JSON and rename Raw Event to Trigger Payload` | `dashboard/src/panels/tasks/TaskDetail.tsx` | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build  # Expected: 0 errors, 0 warnings
```

### Final Checklist

- [ ] Session transcript renders 6 JSON blocks for task `a78292b7`
- [ ] Each block collapsed by default, expandable
- [ ] "Trigger Payload" label shown instead of "Raw Event"
- [ ] Non-webhook tasks show contextual explanation
- [ ] Webhook tasks still render payload JSON
- [ ] Dead code removed: `TranscriptMessage`, `ToolCallBlock`, `ContentBlock`
- [ ] `pnpm build` passes
- [ ] No new dependencies added
