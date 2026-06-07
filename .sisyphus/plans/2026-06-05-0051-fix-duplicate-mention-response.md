# Fix Duplicate @mention Response Bug

## TL;DR

> **Quick Summary**: Fix a bug where a single @mention produces two bot responses — a correct confirmation card AND an unwanted AI-generated "question" response — caused by duplicate `app_mention` events and an unsafe classifier fallback.
>
> **Deliverables**:
>
> - Event dedup in the `app_mention` handler (TTL-based Map)
> - Safer classifier fallback (`unclear` instead of `question`)
> - Updated + new unit tests
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: T1/T2 (parallel) → F1-F4 (parallel) → T3

---

## Context

### Original Request

User @mentioned `@Papi chulo generate cleaning schedule` in Slack. The bot correctly posted a confirmation card ("Trigger Cleaning Schedule?"), but then immediately posted a second, unwanted AI-generated response: "I don't have enough information about specific cleaning schedules..."

### Investigation Summary

**Root Cause — Two bugs conspiring:**

1. **No event dedup in `handlers.ts`**: Slack Socket Mode delivered the same `app_mention` event twice (same `ts: 1780637834.361229`). The handler fires `employee/interaction.received` for every event with zero dedup.

2. **Unsafe classifier fallback**: The LLM classified the second duplicate as `_task` (with underscore). Since `_task` is not in the valid intents list, `interaction-classifier.ts` line 44 defaults to `'question'`. The `question` intent triggers KB lookup + LLM answer + posts to Slack — producing the unwanted response.

**Log evidence (UTC 05:38, Jun 5 2026):**

```
05:38:17 — interaction.received (messageTs: 1780637834.361229) → classified: task → task.requested ✅
05:38:25 — SECOND interaction.received (SAME messageTs) → classified: _task → fallback: question ❌
05:38:31 — send-acknowledgment: intent="question" → posted AI-generated answer to thread ❌
```

### Metis Review

**Identified Gaps (addressed):**

- Existing test at `tests/gateway/services/interaction-classifier.test.ts:71-76` explicitly asserts fallback is `'question'` — must be updated (not a regression, the test encodes the buggy behavior)
- Dedup key should be `${ts}:${channel}` not just `ts` to avoid false positives across channels
- `unclear` fallback still posts to Slack (brief clarifying question) — safer than `question` but not silent. Acceptable trade-off.
- In-memory dedup Map is single-process scoped — acceptable for current single-instance deployment. Document the limitation.
- Do NOT add intent normalization/fuzzy-matching — `_task` was a one-time LLM fluke. The safer fallback default is the real fix.

---

## Work Objectives

### Core Objective

Eliminate unwanted duplicate bot responses from Slack @mentions by adding event deduplication and a safer classifier fallback.

### Concrete Deliverables

- `src/gateway/slack/handlers.ts` — TTL-based dedup Map for `app_mention` events
- `src/gateway/services/interaction-classifier.ts` — fallback changed from `'question'` to `'unclear'`
- `tests/gateway/services/interaction-classifier.test.ts` — existing fallback test updated
- `tests/gateway/slack/handlers-mention-dedup.test.ts` — new dedup tests

### Definition of Done

- [ ] `pnpm test -- --run` passes with 0 failures
- [ ] `pnpm build` succeeds with 0 errors
- [ ] Duplicate `app_mention` events with same `ts:channel` within 30s produce only ONE `employee/interaction.received` event
- [ ] Unrecognized LLM classifier responses fall back to `unclear` (not `question`)

### Must Have

- Event dedup keyed by `${ts}:${channel}` with 30-second TTL
- Classifier fallback changed from `question` to `unclear`
- Dedup log line when suppressing duplicate: `log.info({ ts, channel }, 'Duplicate app_mention suppressed — skipping')`
- Existing classifier fallback test updated to assert `'unclear'`
- New dedup unit tests (same ts suppressed, different ts passes, TTL expiry allows re-process)

### Must NOT Have (Guardrails)

- Do NOT add Redis or DB-backed dedup — in-memory Map is acceptable; add code comment documenting single-instance assumption
- Do NOT add intent normalization/fuzzy-matching to the classifier (e.g., stripping non-alpha chars) — the LLM returning `_task` was a one-time fluke
- Do NOT touch `interaction-handler.ts` — no changes needed there
- Do NOT touch `slack-trigger-handler.ts` — not part of this bug
- Do NOT change the `unclear` intent behavior in `interaction-handler.ts` — it already works correctly
- Do NOT add dedup to `message_replied` or other Slack event handlers — only `app_mention`
- Do NOT refactor the interaction-handler's intent routing

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after, since fix is trivial)
- **Framework**: Vitest (`pnpm test -- --run`)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: Use Bash (`pnpm test -- --run {path}`) — run tests, assert 0 failures
- **Build verification**: Use Bash (`pnpm build`) — assert 0 errors

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — both fixes are independent):
├── Task 1: Fix classifier fallback + update existing test [quick]
└── Task 2: Add app_mention event dedup + new dedup tests [quick]

Wave FINAL (After Wave 1 — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Post-FINAL:
└── Task 3: Notify completion via Telegram [quick]

Critical Path: T1/T2 → F1-F4 → T3
Parallel Speedup: Wave 1 runs 2 tasks simultaneously
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task  | Depends On | Blocks |
| ----- | ---------- | ------ |
| T1    | —          | F1-F4  |
| T2    | —          | F1-F4  |
| F1-F4 | T1, T2     | T3     |
| T3    | F1-F4      | —      |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`
- **Post**: **1** — T3 → `quick`

---

## TODOs

- [ ] 1. Fix classifier fallback to `unclear` + update existing test

  **What to do**:
  - In `src/gateway/services/interaction-classifier.ts` line 44, change `'question'` to `'unclear'`:
    ```typescript
    // BEFORE:
    return validIntents.includes(intent as MentionIntent) ? (intent as MentionIntent) : 'question';
    // AFTER:
    return validIntents.includes(intent as MentionIntent) ? (intent as MentionIntent) : 'unclear';
    ```
  - In `tests/gateway/services/interaction-classifier.test.ts` lines 71-76, update the fallback test:
    - Change test name from `'falls back to question for unrecognized LLM response'` to `'falls back to unclear for unrecognized LLM response'`
    - Change assertion from `expect(intent).toBe('question')` to `expect(intent).toBe('unclear')`

  **Must NOT do**:
  - Do NOT add normalization/fuzzy-matching logic (no regex stripping of `_task` → `task`)
  - Do NOT change any other classifier behavior
  - Do NOT modify `interaction-handler.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line code change + single-line test update — trivial modification
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/services/interaction-classifier.ts:44` — The exact line to change: `return validIntents.includes(intent as MentionIntent) ? (intent as MentionIntent) : 'question';` → change trailing `'question'` to `'unclear'`
  - `src/gateway/services/interaction-classifier.ts:6` — `MentionIntent` type definition confirms `'unclear'` is a valid intent

  **Test References**:
  - `tests/gateway/services/interaction-classifier.test.ts:71-76` — Existing test that asserts the fallback is `'question'`. Update test name and assertion to `'unclear'`.

  **WHY Each Reference Matters**:
  - Line 44 is the single line that caused `_task` to become `question` and trigger the unwanted AI response. Changing the fallback to `unclear` is the fix.
  - Line 6 confirms `'unclear'` is already a valid type in `MentionIntent`, so no type changes needed.
  - The test at lines 71-76 explicitly encodes the buggy behavior. It will fail after the code change and must be updated to match.

  **Acceptance Criteria**:
  - [ ] `src/gateway/services/interaction-classifier.ts` line 44 returns `'unclear'` for unrecognized intents
  - [ ] `tests/gateway/services/interaction-classifier.test.ts` updated test passes
  - [ ] `pnpm test -- --run tests/gateway/services/interaction-classifier.test.ts` → PASS (all tests, 0 failures)
  - [ ] `pnpm build` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Classifier returns 'unclear' for unrecognized LLM output
    Tool: Bash
    Preconditions: Source change applied to interaction-classifier.ts line 44
    Steps:
      1. Run: pnpm test -- --run tests/gateway/services/interaction-classifier.test.ts
      2. Assert: All tests pass including "falls back to unclear for unrecognized LLM response"
      3. Assert: Exit code 0
    Expected Result: All 12 tests pass, 0 failures
    Failure Indicators: Test "falls back to unclear" fails or test "falls back to question" still exists
    Evidence: .sisyphus/evidence/task-1-classifier-fallback-tests.txt

  Scenario: Build succeeds after classifier change
    Tool: Bash
    Preconditions: Source change applied
    Steps:
      1. Run: pnpm build
      2. Assert: Exit code 0, no TypeScript errors
    Expected Result: Clean build with 0 errors
    Failure Indicators: Type error on line 44 if 'unclear' is somehow not assignable
    Evidence: .sisyphus/evidence/task-1-build-check.txt
  ```

  **Commit**: YES
  - Message: `fix(classifier): change fallback from 'question' to 'unclear' for unrecognized intents`
  - Files: `src/gateway/services/interaction-classifier.ts`, `tests/gateway/services/interaction-classifier.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/services/interaction-classifier.test.ts`

- [ ] 2. Add app_mention event dedup + new dedup tests

  **What to do**:
  - In `src/gateway/slack/handlers.ts`, add a TTL-based dedup Map near the existing `pendingInputCollections` Map (line 76):
    ```typescript
    /** Dedup duplicate app_mention events from Slack Socket Mode.
     *  Key: `${ts}:${channel}`, Value: timestamp (ms).
     *  Single-process scoped — acceptable for current single-instance deployment. */
    const recentMentions = new Map<string, number>();
    const MENTION_DEDUP_TTL_MS = 30_000;
    ```
  - In the `app_mention` handler (line 295), add dedup check after the `bot_id` and DM guards:
    ```typescript
    // Dedup: skip duplicate app_mention events (Slack Socket Mode at-least-once delivery)
    const dedupKey = `${mention.ts}:${mention.channel}`;
    const now = Date.now();
    if (
      recentMentions.has(dedupKey) &&
      now - recentMentions.get(dedupKey)! < MENTION_DEDUP_TTL_MS
    ) {
      log.info(
        { ts: mention.ts, channel: mention.channel },
        'Duplicate app_mention suppressed — skipping',
      );
      return;
    }
    recentMentions.set(dedupKey, now);
    // Lazy cleanup: remove expired entries
    for (const [key, timestamp] of recentMentions) {
      if (now - timestamp > MENTION_DEDUP_TTL_MS) recentMentions.delete(key);
    }
    ```
  - Create `tests/gateway/slack/handlers-mention-dedup.test.ts` with these test cases:
    1. **Duplicate suppressed**: Call handler twice with same `ts` and `channel` within 30s → assert `inngest.send` called once
    2. **Different ts passes**: Call handler with different `ts` values → assert `inngest.send` called twice
    3. **TTL expiry allows re-process**: Call handler, advance time past 30s, call again → assert `inngest.send` called twice
    4. **Different channel passes**: Call handler with same `ts` but different `channel` → assert `inngest.send` called twice

  **Must NOT do**:
  - Do NOT add Redis or DB-backed dedup — in-memory Map only, with a code comment documenting single-instance assumption
  - Do NOT add dedup to `message_replied` handler or any other event handler
  - Do NOT modify any other logic in the `app_mention` handler
  - Do NOT export `recentMentions` or `MENTION_DEDUP_TTL_MS` — keep them module-private

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small code addition (dedup guard) + standard unit tests — well-scoped change
  - **Skills**: []
    - No specialized skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:76` — `pendingInputCollections` Map declaration — follow this exact pattern for scope and placement of the dedup Map
  - `src/gateway/slack/handlers.ts:295-378` — Full `app_mention` handler — the dedup check goes after line 313 (`if (mention.channel.startsWith('D')) return;`)
  - `src/gateway/slack/handlers.ts:311` — `if (mention.bot_id) return;` guard — the dedup check follows this pattern of early-return guards

  **Test References**:
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts` — Existing test file for handler actions — follow this file's structure (imports, mock setup, describe blocks) as the pattern for the new dedup test file
  - `tests/gateway/services/interaction-classifier.test.ts:11-20` — `makeCallLLM` helper pattern — useful for creating mock factories

  **External References**:
  - Slack docs: Socket Mode delivers events with at-least-once guarantee — dedup is the application's responsibility

  **WHY Each Reference Matters**:
  - `pendingInputCollections` at line 76 is the established pattern for module-scoped Maps in this file — matching its declaration style keeps the code consistent
  - Lines 295-378 show the full handler flow so the executor knows exactly WHERE to insert the dedup guard (after bot_id check, before tenant resolution)
  - `handlers-trigger-confirm.test.ts` shows how to mock `inngest.send` and the Bolt event handler — the dedup tests need the same mock setup

  **Acceptance Criteria**:
  - [ ] `recentMentions` Map declared near `pendingInputCollections` with JSDoc comment
  - [ ] Dedup guard placed after bot_id/DM guards in `app_mention` handler
  - [ ] Duplicate `app_mention` events with same `ts:channel` within 30s are skipped with log
  - [ ] Test file created: `tests/gateway/slack/handlers-mention-dedup.test.ts`
  - [ ] `pnpm test -- --run tests/gateway/slack/handlers-mention-dedup.test.ts` → PASS (4 tests, 0 failures)
  - [ ] `pnpm build` → 0 errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Duplicate app_mention with same ts:channel is suppressed
    Tool: Bash
    Preconditions: Dedup Map added to handlers.ts, test file created
    Steps:
      1. Run: pnpm test -- --run tests/gateway/slack/handlers-mention-dedup.test.ts
      2. Assert: Test "suppresses duplicate app_mention with same ts and channel" passes
      3. Assert: Test "allows different ts values" passes
      4. Assert: Test "allows same ts after TTL expiry" passes
      5. Assert: Test "allows same ts from different channel" passes
    Expected Result: 4 tests pass, 0 failures
    Failure Indicators: Any test fails, or inngest.send called wrong number of times
    Evidence: .sisyphus/evidence/task-2-dedup-tests.txt

  Scenario: Full test suite still passes after dedup addition
    Tool: Bash
    Preconditions: Both dedup code and tests in place
    Steps:
      1. Run: pnpm test -- --run
      2. Assert: Exit code 0, 0 test failures
    Expected Result: All existing tests pass + new dedup tests pass
    Failure Indicators: Any pre-existing test breaks due to handler changes
    Evidence: .sisyphus/evidence/task-2-full-suite.txt

  Scenario: Build succeeds after handler changes
    Tool: Bash
    Preconditions: handlers.ts modified with dedup Map
    Steps:
      1. Run: pnpm build
      2. Assert: Exit code 0, no TypeScript errors
    Expected Result: Clean build
    Failure Indicators: Type errors in handler code
    Evidence: .sisyphus/evidence/task-2-build-check.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): add app_mention event dedup to prevent duplicate bot responses`
  - Files: `src/gateway/slack/handlers.ts`, `tests/gateway/slack/handlers-mention-dedup.test.ts`
  - Pre-commit: `pnpm test -- --run tests/gateway/slack/handlers-mention-dedup.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Run `pnpm test -- --run` full suite. Verify no regressions. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Tests [N pass/N fail] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message                                                                           | Files                                                                                                     | Pre-commit Check                                                           |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| T1   | `fix(classifier): change fallback from 'question' to 'unclear' for unrecognized intents` | `src/gateway/services/interaction-classifier.ts`, `tests/gateway/services/interaction-classifier.test.ts` | `pnpm test -- --run tests/gateway/services/interaction-classifier.test.ts` |
| T2   | `fix(slack): add app_mention event dedup to prevent duplicate bot responses`             | `src/gateway/slack/handlers.ts`, `tests/gateway/slack/handlers-mention-dedup.test.ts`                     | `pnpm test -- --run tests/gateway/slack/handlers-mention-dedup.test.ts`    |

---

## Post-Final Tasks

- [ ] 3. **Notify completion** — Send Telegram: `tsx scripts/telegram-notify.ts "✅ fix-duplicate-mention-response complete — All tasks done. Come back to review results."`

---

## Success Criteria

### Verification Commands

```bash
pnpm test -- --run                    # Expected: 0 failures
pnpm build                            # Expected: 0 errors
pnpm test -- --run tests/gateway/services/interaction-classifier.test.ts  # Expected: all pass
pnpm test -- --run tests/gateway/slack/handlers-mention-dedup.test.ts     # Expected: 4 pass
```

### Final Checklist

- [ ] All "Must Have" present (dedup Map, classifier fallback change, log line, tests)
- [ ] All "Must NOT Have" absent (no Redis, no fuzzy matching, no handler.ts intent routing changes)
- [ ] All tests pass (`pnpm test -- --run`)
- [ ] Build succeeds (`pnpm build`)
