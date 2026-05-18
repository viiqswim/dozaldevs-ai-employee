# Show Rule Text in Confirm/Reject Slack Messages

## TL;DR

> **Quick Summary**: When a PM confirms or rejects a proposed rule in Slack, the confirmation message currently only shows the rule UUID. Fix both handlers to fetch `rule_text` from `employee_rules` and display it — so the PM sees what they just acted on.
>
> **Deliverables**:
>
> - `rule_confirm` handler shows rule text in the confirmation message
> - `rule_reject` handler shows rule text in the rejection message
> - Updated tests for both handlers
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single commit, 1 task
> **Critical Path**: T1 → T2 → F1-F4

---

## Context

### Original Request

When a PM confirms a rule in Slack, the confirmation message shows:

```
✅ Rule confirmed by @Gerardo Escareño
Rule `df0b24fb-19ce-4090-9916-9e5a11c9a20f`
```

The UUID is meaningless to the PM — they can't tell what rule they just confirmed. The original rule card (which DID show the rule text) gets replaced by this UUID-only message.

### Root Cause

The `rule_confirm` handler at `handlers.ts:1014-1031` replaces the original Slack message immediately with a UUID-only confirmation, before even fetching the rule from the DB. The button `value` only carries the `ruleId` (not the text). Nobody fetches `rule_text` from `employee_rules` before building the confirmation message.

The pattern to fetch `rule_text` already exists in the `rule_rephrase` handler at `handlers.ts:1157-1171` — it just was never applied to confirm/reject.

### Gap Analysis

- The fix is straightforward — copy the fetch pattern from `rule_rephrase`
- The `rule_reject` handler has the same problem (shows UUID-only after rejection)
- DB fetch could fail — need graceful fallback to current UUID-only behavior
- The PATCH in `rule_confirm` already uses `Prefer: return=representation` and gets back the patched row — we could request `rule_text` in the PATCH response instead of making a separate fetch. This is cleaner.

---

## Work Objectives

### Core Objective

Show the rule text in confirm/reject Slack messages so PMs know what they just acted on.

### Concrete Deliverables

- `src/gateway/slack/handlers.ts` — updated `rule_confirm` and `rule_reject` handlers
- `tests/gateway/slack/rule-handlers.test.ts` — updated test assertions

### Definition of Done

- [ ] `pnpm build` succeeds with no errors
- [ ] `pnpm test -- --run` passes (1333+, known pre-existing failures only)
- [ ] Confirm message shows rule text in blockquote format
- [ ] Reject message shows rule text in blockquote format
- [ ] Fallback to UUID-only if rule_text fetch fails

### Must Have

- Rule text shown in confirm message after `✅ Rule confirmed by @User`
- Rule text shown in reject message after `❌ Rule rejected by @User`
- Graceful fallback if rule_text is unavailable (empty string, fetch failure)

### Must NOT Have (Guardrails)

- Do NOT change the button `value` format across card builders (rule-extractor, interaction-handler, rule-synthesizer) — too many places to touch for minimal gain
- Do NOT change the `rule_rephrase` handler — it already works correctly
- Do NOT change any card builder (rule-extractor.ts, interaction-handler.ts, rule-synthesizer.ts)
- Do NOT add new DB columns or migrations

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (update existing test assertions)
- **Framework**: vitest via `pnpm test -- --run`

### QA Policy

Every task includes agent-executed QA scenarios.

- **Backend**: Use Bash — run build, run tests, grep for patterns

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task — implementation + tests):
└── Task 1: Update rule_confirm and rule_reject handlers + tests [quick]

Wave 2 (Verification):
└── Task 2: Build, test, Docker rebuild [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
| ---- | ---------- | ------ |
| 1    | —          | 2      |
| 2    | 1          | F1-F4  |

### Agent Dispatch Summary

- **Wave 1**: 1 task → T1 `quick`
- **Wave 2**: 1 task → T2 `quick`
- **FINAL**: 4 tasks → F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Show rule text in `rule_confirm` and `rule_reject` confirmation messages

  **What to do**:

  In `src/gateway/slack/handlers.ts`, update both handlers to include the `rule_text` in the Slack confirmation message.

  **For `rule_confirm` (line 1014-1107)**:

  The PATCH at line 1043-1054 already uses `Prefer: return=representation` and returns the patched row. Currently it only destructures `id`, `tenant_id`, `archetype_id`, `source`, `parent_rule_ids`. Add `rule_text` to the response type and destructure.

  Then move the `chat.update` call (currently at lines 1022-1031, BEFORE the PATCH) to AFTER the PATCH, so we have the rule text available. Update the message to include it.

  Current flow:

  ```
  1. chat.update → UUID-only confirmation (line 1022)
  2. PATCH employee_rules → gets back row with rule_text (line 1043)
  3. rest of logic...
  ```

  New flow:

  ```
  1. PATCH employee_rules → gets back row with rule_text (line 1043)
  2. chat.update → confirmation WITH rule text (moved after PATCH)
  3. rest of logic...
  ```

  New confirmation message format:

  ```typescript
  const ruleText = patchedRule?.rule_text ?? '';
  const displayText = ruleText
    ? `✅ Rule confirmed by <@${user.id}>\n\n> ${ruleText}`
    : `✅ Rule confirmed by <@${user.id}>`;
  await client.chat.update({
    channel,
    ts: messageTs,
    text: displayText,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: displayText } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
    ],
  });
  ```

  **IMPORTANT**: The `chat.update` is currently at lines 1022-1031, BEFORE the try/catch that does the PATCH. Move it INSIDE the try block, after the PATCH succeeds. Keep a fallback: if the PATCH fails or returns no rows, still show the UUID-only message in the catch block.

  Restructured handler:

  ```typescript
  boltApp.action('rule_confirm', async ({ ack, body, client }) => {
    await ack();
    const actionBody = body as ActionBody;
    const ruleId = actionBody.actions[0]?.value;
    const user = actionBody.user;
    const channel = actionBody.channel?.id;
    const messageTs = actionBody.message?.ts;
    if (!ruleId) return;

    try {
      // 1. PATCH the rule status
      const supabaseUrl = SUPABASE_URL();
      const supabaseKey = SUPABASE_KEY();
      // ... existing PATCH code ...
      // Add rule_text to the response type

      const patchedRule = patchedRows[0];
      const ruleText = (patchedRule as any)?.rule_text as string | undefined;

      // 2. Update Slack message WITH rule text
      if (channel && messageTs) {
        const displayText = ruleText
          ? `✅ Rule confirmed by <@${user.id}>\n\n> ${ruleText}`
          : `✅ Rule confirmed by <@${user.id}>`;
        await client.chat.update({
          channel,
          ts: messageTs,
          text: displayText,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: displayText } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
          ],
        });
      }

      if (!patchedRule) {
        log.warn({ ruleId }, 'rule_confirm: no rule returned after PATCH');
        return;
      }

      // 3. Rest of existing logic (event, synthesis check, parent archival)
      // ... unchanged ...
    } catch (err) {
      log.error({ ruleId, err }, 'Failed to process rule_confirm');
      // Fallback: show UUID-only confirmation so user knows the click was received
      if (channel && messageTs) {
        try {
          await client.chat.update({
            channel,
            ts: messageTs,
            text: `✅ Rule confirmed by <@${user.id}>`,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: `✅ Rule confirmed by <@${user.id}>` },
              },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule \`${ruleId}\`` }] },
            ],
          });
        } catch {
          /* non-fatal */
        }
      }
    }
  });
  ```

  **For `rule_reject` (line 1109-1145)**:

  The reject handler currently uses `Prefer: return=minimal` (no response body). Change to `Prefer: return=representation` and add `rule_text` to the response type. Then include rule text in the rejection message.

  Same message format pattern:

  ```typescript
  const ruleText = patchedRows[0]?.rule_text ?? '';
  const displayText = ruleText
    ? `❌ Rule rejected by <@${user.id}>\n\n> ${ruleText}`
    : `❌ Rule rejected by <@${user.id}>`;
  ```

  Move the `chat.update` AFTER the PATCH (same restructuring as confirm).

  **Tests to update** in `tests/gateway/slack/rule-handlers.test.ts`:
  - `rule_confirm` test (line 67-117): The fetch mock at line 69 returns `[]`. Update it to return `[{ id: 'rule-abc-123', tenant_id: 't1', archetype_id: 'a1', source: 'extraction', parent_rule_ids: [], rule_text: 'Never respond about pricing' }]` so the PATCH response includes `rule_text`. Then assert the `chat.update` call includes the rule text.
  - `rule_reject` test (line 152+): Same — update the fetch mock to return representation with `rule_text`, assert the message includes it.
  - Note: The `chat.update` call will now happen AFTER the PATCH, not before. Test ordering of mock calls may need adjustment.

  **Must NOT do**:
  - Do NOT use `as any` — properly type the response
  - Do NOT change the button value format
  - Do NOT modify rule-extractor.ts, interaction-handler.ts, or rule-synthesizer.ts
  - Do NOT change the rule_rephrase handler
  - Do NOT add employee-specific language

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/slack/handlers.ts:1157-1171` — `rule_rephrase` handler already fetches `rule_text` from DB (reference pattern for DB fetch)
  - `src/gateway/slack/handlers.ts:1014-1107` — Current `rule_confirm` handler (to modify)
  - `src/gateway/slack/handlers.ts:1109-1145` — Current `rule_reject` handler (to modify)

  **API/Type References**:
  - `prisma/schema.prisma:503-525` — `EmployeeRule` model: `rule_text` is a `String` (non-nullable)
  - PostgREST `Prefer: return=representation` header returns the patched row

  **Test References**:
  - `tests/gateway/slack/rule-handlers.test.ts:67-150` — Existing confirm/reject tests to update

  **Acceptance Criteria**:
  - [ ] `rule_confirm` handler fetches `rule_text` from PATCH response
  - [ ] `rule_confirm` confirmation message includes rule text in blockquote format
  - [ ] `rule_reject` handler fetches `rule_text` from PATCH response
  - [ ] `rule_reject` rejection message includes rule text in blockquote format
  - [ ] Graceful fallback to UUID-only if `rule_text` is empty/missing
  - [ ] No `as any` casts introduced
  - [ ] Tests updated and passing

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify rule_confirm includes rule text in message
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A3 "Rule confirmed by" src/gateway/slack/handlers.ts | grep "ruleText\|rule_text"
      2. Assert: matches found showing rule text is used in the message
    Expected Result: Confirmation message construction uses ruleText variable
    Evidence: .sisyphus/evidence/task-1-confirm-text-verify.txt

  Scenario: Verify rule_reject includes rule text in message
    Tool: Bash (grep)
    Steps:
      1. Run: grep -A3 "Rule rejected by" src/gateway/slack/handlers.ts | grep "ruleText\|rule_text"
      2. Assert: matches found showing rule text is used in the message
    Expected Result: Rejection message construction uses ruleText variable
    Evidence: .sisyphus/evidence/task-1-reject-text-verify.txt

  Scenario: Verify fallback exists for missing rule text
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "Rule confirmed by.*ruleText\|ruleText.*Rule confirmed" src/gateway/slack/handlers.ts
      2. Assert: conditional logic exists (ternary or if/else)
    Expected Result: Fallback to UUID-only when rule_text is empty
    Evidence: .sisyphus/evidence/task-1-fallback-verify.txt

  Scenario: Build and tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm build
      2. Assert: clean exit
      3. Run: pnpm test -- --run
      4. Assert: 1333+ passing
    Expected Result: No regressions
    Evidence: .sisyphus/evidence/task-1-build-test.txt
  ```

  **Commit**: YES
  - Message: `fix(slack): show rule text in confirm/reject messages instead of UUID-only`
  - Files: `src/gateway/slack/handlers.ts`, `tests/gateway/slack/rule-handlers.test.ts`
  - Pre-commit: `pnpm build`

- [ ] 2. Build, test, Docker rebuild

  **What to do**:
  - Run `pnpm build` — must succeed with 0 errors
  - Run `pnpm test -- --run` — must pass 1333+ tests
  - Run `docker build -t ai-employee-worker:latest .` in tmux — rebuild Docker image

  **Must NOT do**:
  - Do NOT skip the Docker rebuild — handler changes run inside the Docker container
  - Do NOT attempt to fix pre-existing test failures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] `pnpm build` — 0 errors
  - [ ] `pnpm test -- --run` — 1333+ passing
  - [ ] `docker build` — completes

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full build and test
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -3
      2. Assert: clean exit
      3. Run: pnpm test -- --run 2>&1 | tail -10
      4. Assert: 1333+ tests pass
    Expected Result: Build clean, tests green
    Evidence: .sisyphus/evidence/task-2-build-test.txt

  Scenario: Docker rebuild
    Tool: Bash (tmux)
    Steps:
      1. Launch: docker build -t ai-employee-worker:latest . in tmux ai-build
      2. Poll until EXIT_CODE detected
      3. Assert: exit code 0
      4. Kill tmux session
    Expected Result: Docker image built
    Evidence: .sisyphus/evidence/task-2-docker-build.txt
  ```

  **Commit**: NO (no code changes in this task)

- [ ] 3. Notify completion via Telegram

  **What to do**:
  - Run: `npx tsx scripts/telegram-notify.ts "📋 rule-confirm-show-text complete — All tasks done. Come back to review results."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Acceptance Criteria**:
  - [ ] Telegram notification sent

  **Commit**: NO

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm test -- --run`. Review changed files for type errors, unused imports, `as any` casts.
      Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Grep for rule text patterns in confirm/reject handlers. Verify fallback exists. Run test suite.
      Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      Verify only `handlers.ts` and `rule-handlers.test.ts` were modified. No card builders touched. No unrelated changes.
      Output: `Tasks [N/N compliant] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                      | Files                                                                        |
| ------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1      | `fix(slack): show rule text in confirm/reject messages instead of UUID-only` | `src/gateway/slack/handlers.ts`, `tests/gateway/slack/rule-handlers.test.ts` |
| 2      | `chore(sisyphus): add plan for rule-confirm-show-text`                       | `.sisyphus/plans/2026-05-18-1022-rule-confirm-show-text.md`                  |

---

## Success Criteria

### Verification Commands

```bash
pnpm build          # Expected: clean exit, no errors
pnpm test -- --run  # Expected: 1333+ passing, known pre-existing failures only
```

### Final Checklist

- [ ] Confirm message shows rule text after `✅ Rule confirmed by @User`
- [ ] Reject message shows rule text after `❌ Rule rejected by @User`
- [ ] Graceful fallback to UUID-only if rule_text unavailable
- [ ] Tests updated and passing
- [ ] Docker image rebuilt
