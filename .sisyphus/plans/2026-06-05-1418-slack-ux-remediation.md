# Slack UX Remediation — Latency, Frozen Messages & Human Tone (Master Plan)

## TL;DR

> **Quick Summary**: One master plan fixing every Slack UX defect uncovered in the audit. (A) The confirm-button click path runs two sequential LLM calls causing a 4.4–7.5s freeze + native ⚠️ + double-click risk — move all LLM work off the click path, instant button removal, conversational copy. (B) Nine OTHER Bolt handlers share the same anti-pattern (buttons stay clickable during modal-open or heavy work — up to 20s on `guest_edit_modal`) plus `app_mention` gives 5–10s of silence — reorder each `ack → chat.update (buttons removed) → work`. (C) A FROZEN-message bug: `reviewing-watchdog` marks zombie tasks `Failed` in the DB but never updates Slack, leaving the user on "⏳" forever — add a human ❌ update via the proven `loadTenantEnv → WebClient → updateMessage` pattern. (D) The robotic Slack strings NOT already fixed by commit `a9e611a5` — centralize all conversational copy in ONE new `src/lib/slack-copy.ts` module and swap the remaining robotic strings. Result: every Slack interaction is instant, never frozen, and sounds human.
>
> **Deliverables**:
>
> - `src/lib/slack-copy.ts` (NEW) — single source of truth for ALL conversational Slack copy used by A/B/C/D (trigger flow, watchdog failure, superseded/expired/needs-review/no-action/rule-card strings). First-person, short, no LLM.
> - `src/inngest/slack-trigger-handler.ts` — isolated `pre-extract-inputs` Inngest step + size-guarded (`≤1800` bytes/button) `value` embedding; conversational confirmation card copy.
> - `src/gateway/slack/handlers.ts` — (A) `TRIGGER_CONFIRM` reorder + cosmetic-LLM removal + read pre-extracted inputs (fallback retained); (B) reorder 9 handlers grouped into 3 region-disjoint tasks (app_mention / guest+override / rules) so buttons vanish before heavy work.
> - `src/inngest/triggers/reviewing-watchdog.ts` — (C) widen task SELECT to include `metadata`; after marking Failed, update the frozen notify-received message to a human ❌ via `loadTenantEnv → WebClient → updateMessage`, per-task try/catch, edge-guarded (null ts / token error → skip+log, never throw, loop continues).
> - `src/inngest/employee-lifecycle.ts` + `src/inngest/rule-extractor.ts` + `src/inngest/rule-synthesizer.ts` + `src/inngest/interaction-handler.ts` — (D) swap the enumerated remaining robotic strings (NOT a9e611a5's) to `slack-copy.ts` constants.
> - New/extended unit tests + live Slack E2E (Scenario A + P0 modal handler + forced watchdog timeout).
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — Wave 0 (copy module) → Wave 1 (A + C + D, file-disjoint) → Wave 2 (B, 3 region-disjoint handler tasks) → Final Wave
> **Critical Path**: Task 1 (slack-copy.ts) → Task 3 (confirm handler) → Task 4 (handler tests) → Final Verification Wave

---

## Context

### Original Request

User (verbatim): "Before I got the confirmation message, when I pressed the confirm button, it stayed there for around 3 to 5 seconds, which is a terrible user experience. It showed a warning icon, and then after a while it showed the confirmation message. If I were a user, I would have clicked the button multiple times, and that could have caused a lot of issues."

User's UX vision (verbatim): "Disable or hide the Confirm and Reject buttons immediately after they are clicked. If there are any issues or if additional information is required, let them know with an additional message in that same Slack thread. It should feel like an AI employee talking to them, not a computer executing tasks."

Follow-up request (verbatim): "Help me check if there are any other places in the app where we are breaking this 'human' and 'quick feedback' rule, and see how we can improve the experience or fix it completely."

User decisions (this session): Fold ALL audit findings into ONE plan; merge the original confirm-button plan into it. Keep the two unsanctioned agent changes (committed Slack-string fix `a9e611a5` + uncommitted dashboard fixes) — user reviews those separately; they are OUT OF SCOPE for this plan.

### Audit Summary (4 parallel explore agents)

1. **Tone audit** — 32 ROBOTIC + 28 BORDERLINE strings. The high-frequency ones were already fixed in commit `a9e611a5` (inline edits — NO copy module). The remaining robotic set (enumerated in Task 9) is what's left.
2. **Bolt-handler latency audit** — 9 handlers + `app_mention` share the confirm-button anti-pattern (buttons clickable during heavy work / no immediate feedback). Worst: `guest_edit_modal` = up to 20s of stale buttons (10-retry poll before `chat.update`).
3. **Lifecycle / frozen-message audit** — ONE true frozen bug: `reviewing-watchdog.ts:110–143` marks tasks Failed in DB but never updates Slack. All other terminal states already update both notify + card.
4. **Dashboard audit** — mostly good; 4 minor gaps already fixed by an agent (uncommitted, OUT OF SCOPE here).

### Root Cause — Confirm Button (Oracle `ses_166c94c27ffeKKZHlu1mW6v6g4`)

`TRIGGER_CONFIRM` (`handlers.ts:1501`) makes TWO sequential LLM calls AFTER click: (1) `extractInputsFromText` (3 attempts × 20s, deepseek), (2) a PURELY COSMETIC `callLLM` for a confirmation sentence (fallback template already exists). The heavy work saturates the Node event loop / Socket Mode WebSocket buffer; Slack's 3s server-side ack deadline is missed; Slack stamps its native ⚠️ on the still-live card. Measured: 4.4–7.5s.

### Pre-Planning Unknowns RESOLVED (verified from code this session)

- **a9e611a5 copy architecture**: INLINE string edits, NO copy-constants file → this plan introduces ONE shared `src/lib/slack-copy.ts` (Metis-recommended domain name, NOT the narrower `trigger-copy.ts`). A/B/C/D all import from it.
- **Watchdog token path**: `reviewing-watchdog.ts` already selects `tenant_id` (line 67) and queries `pending_approvals` (line 93) but does NOT select `metadata`. The zombie case has NO `pending_approvals` row → the ONLY frozen message to fix is the notify-received message (`tasks.metadata.notify_slack_ts` / `notify_slack_channel`). The proven update pattern is `employee-lifecycle.ts` `mark-failed` (lines 721–768): `loadTenantEnv(tenantId, {tenantRepo, secretRepo}, channel)` → `SLACK_BOT_TOKEN` → `createSlackClient` → `updateMessage`. The watchdog must copy this (it has no `archetype` loaded → pass `null` channel, use a generic role label).
- **Handler grouping**: 9 handlers all live in one 1900-line `handlers.ts` → 9 parallel edits = conflict thrash. Group into 3 region-disjoint tasks: B1 `app_mention` (~305), B2 guest+override (~650–950), B3 rules (~1138–1389). B1/B2/B3 touch disjoint line ranges → parallel-safe.

### Oracle + Metis

- Oracle (`ses_166c94c27ffeKKZHlu1mW6v6g4`): canonical Bolt pattern `ack() → respond(replace_original, buttons removed) → work → final update`. Remove cosmetic LLM. Pre-extract in pre-click async step. Keep on-click extraction as fallback.
- Metis (`ses_166937396ffeP5GnVYi1YcHBAU`): single copy module as Wave 0; group handlers 3 ways; freeze D's string list; watchdog edge-guards (null ts / missing card / token error → skip+log, never throw, DB-Failed commits before Slack update); guardrails against employee-specific copy in shared files and against touching `watchdog.ts` (deprecated, different file) or the dashboard files.

---

## Work Objectives

### Core Objective

Make EVERY Slack interaction (a) acknowledge the user within ~1s with buttons removed (no ⚠️, no double-click), (b) never leave a message frozen at "⏳", and (c) sound like a human colleague — by centralizing copy, moving LLM/heavy work off all click paths, reordering all interactive handlers, and fixing the watchdog frozen-message bug.

### Concrete Deliverables

- `src/lib/slack-copy.ts` (NEW, shared copy module).
- `src/inngest/slack-trigger-handler.ts` (pre-extract step + value embedding + card copy).
- `src/gateway/slack/handlers.ts` (confirm reorder + 9-handler reorder).
- `src/inngest/triggers/reviewing-watchdog.ts` (frozen-message fix).
- `src/inngest/employee-lifecycle.ts`, `rule-extractor.ts`, `rule-synthesizer.ts`, `interaction-handler.ts` (remaining string swaps).
- Extended/new unit tests + live Slack E2E.

### Definition of Done

- [ ] Confirm click makes ZERO LLM calls when pre-extracted inputs present; cosmetic `callLLM` removed; on-click extraction retained as fallback.
- [ ] All interactive handlers remove buttons / show loading BEFORE heavy work (A + 9 B-handlers); `app_mention` posts an immediate "got it" before Prisma/PostgREST.
- [ ] Watchdog updates the frozen notify-received message to a human ❌ on zombie-Fail; edge cases (null ts / token error) skip+log without throwing; loop continues.
- [ ] All conversational copy sourced from `src/lib/slack-copy.ts`; no inline prose; no LLM in copy.
- [ ] Every enumerated remaining-robotic string replaced; ZERO of the old forms remain (grep-count = 0); no a9e611a5-owned string touched.
- [ ] Live Slack E2E: confirm + a P0 modal handler → buttons vanish ~1s, no ⚠️; forced watchdog timeout → notify message flips to ❌ human copy.
- [ ] `pnpm build` clean; slack-blocks + new tests pass; no NEW failures vs baseline.
- [ ] Only the in-scope files changed (dashboard files NOT staged).

### Must Have

- ONE shared `src/lib/slack-copy.ts`; first-person, short (≤2 sentences), one variant per branch, no emoji spam, no LLM, employee-agnostic.
- Confirm path: `ack → (setImmediate yield) → loading respond (buttons removed) → DB + inngest.send → ✅ respond`; `dispatched = true` strictly AFTER `await inngest.send()`.
- 9 handlers: ONLY ack/`views.open`/`chat.update` reordering + button removal — NO behavior/logic/payload changes.
- Watchdog: DB-Failed committed BEFORE Slack update; per-task try/catch; null-`notify_slack_ts` → skip notify-update, never throw.
- D: replace ONLY the enumerated complement set; assert removal by grep-count.

### Must NOT Have (Guardrails)

- Do NOT add ANY LLM call to any click critical path.
- Do NOT delete on-click `extractInputsFromText` — skip only when pre-extracted present.
- Do NOT modify `resolveArchetypeFromChannel`'s SELECT shape (other callers depend on it).
- Do NOT fold pre-extraction into `send-confirmation` — it must be its own isolated step.
- Do NOT change handler behavior beyond ack/chat.update reordering + button removal (no helper extraction, no renames, no logic rewrites in handlers.ts).
- Do NOT touch `src/inngest/watchdog.ts` (deprecated engineering watchdog — DIFFERENT file from `triggers/reviewing-watchdog.ts`).
- Do NOT introduce employee-specific language ("guest", "summary", "Hostfully") in any shared file (`employee-lifecycle.ts`, `handlers.ts`, `slack-blocks.ts`, `slack-copy.ts`, anything under `src/lib/` or `src/gateway/`).
- Do NOT re-fix strings already fixed by a9e611a5 (Task received/failed/complete, "Processing…", "AI skipped this task", "Error occurred", passive "has been triggered by", reminder footer).
- Do NOT `git add`/commit the dashboard files (`ModelCatalogPage.tsx`, `EmployeeList.tsx`, `IntegrationsPage.tsx`) — out of scope; user reviews separately.
- Do NOT build Slack retry/queue infrastructure in the watchdog (best-effort update only).
- Do NOT add new lifecycle states, approval-gate logic, or new Inngest functions.
- Do NOT add randomized template pools "for variety."
- Do NOT use `--no-verify`, add `Co-authored-by`, or reference AI tools in commit messages.
- New test files under `tests/` root, NOT `src/`.
- Do NOT rely on the Inngest Dev Server UI for verification (AGENTS.md Known Issue #3) — use DB + gateway logs + live Slack.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION for agent-executable parts.** Live-Slack visual checks (button vanish timing, absence of ⚠️) are inherently human-observed and framed as a documented E2E checklist with task IDs + screenshots per the AGENTS.md live-Slack mandate. All logic, call-count, size-guard, grep-count, and watchdog edge-case checks ARE agent-executable.

### Test Decision

- **Infrastructure exists**: YES (Vitest; `handlers-trigger-confirm.test.ts` mock harness; `tests/inngest/` function tests; `tests/lib/slack-blocks.test.ts`).
- **Automated tests**: YES (Tests-after — extend existing + new files).
- **Framework**: Vitest (`pnpm test -- --run`).

### QA Policy

Every task includes agent-executed QA. Evidence saved to `.sisyphus/evidence/`.

- **Handler / step logic**: Bash (Vitest) — mock call counts (zero-LLM-on-click), size-guard, failure-isolation, backward-compat fallback, watchdog edge-guards.
- **String removal**: Bash (grep-count = 0 for old forms; build + slack-blocks tests).
- **Single dispatch**: DB (`SELECT count(*) FROM tasks WHERE external_id=...` = 1).
- **Watchdog**: DB (`status=Failed`) + `curl conversations.replies` (`$VLRE_SLACK_BOT_TOKEN`) shows ❌ human copy, not "⏳".
- **Live Slack E2E**: real @mention + documented checklist; ground truth = DB + `/tmp/ai-dev.log`, NOT Inngest UI.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (foundation — shared copy module unblocks everything):
└── Task 1: src/lib/slack-copy.ts — ALL conversational constants (trigger, watchdog, superseded/expired/needs-review/no-action/rule-card) [quick]

Wave 1 (file-disjoint — MAX PARALLEL):
├── Task 2: pre-extract-inputs Inngest step + size-guarded value embedding (slack-trigger-handler.ts) [deep]
├── Task 3: confirm handler reorder + cosmetic-LLM removal + read pre-extracted + fallback (handlers.ts TRIGGER_CONFIRM) [deep]
├── Task 8: watchdog frozen-message fix (reviewing-watchdog.ts) [deep]
└── Task 9: remaining robotic string swaps (lifecycle/rule-extractor/rule-synthesizer/interaction-handler) [unspecified-high]
    (NOTE: Task 3 and the B-tasks both edit handlers.ts → B is a separate wave; Task 9 does NOT touch handlers.ts trigger region)

Wave 2 (handlers.ts reorder — 3 region-disjoint tasks, parallel-safe by line range):
├── Task 5: B1 — app_mention immediate "got it" (handlers.ts ~305) [deep]
├── Task 6: B2 — guest + override handlers reorder (handlers.ts ~650–950) [deep]
└── Task 7: B3 — rule handlers reorder (handlers.ts ~1138–1389) [deep]
    (Runs AFTER Task 3 lands to avoid handlers.ts churn; B1/B2/B3 disjoint regions → parallel among themselves)

Wave 3 (tests — after their code surface lands):
├── Task 4: extend handlers-trigger-confirm.test.ts (depends 3) [quick]
├── Task 10: new slack-trigger-pre-extract.test.ts (depends 2) [quick]
└── Task 11: new reviewing-watchdog edge-case test (depends 8) [quick]

Wave FINAL (after all impl + tests):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — unit suite + DB single-dispatch + watchdog DB/Slack + live Slack E2E (unspecified-high)
└── Task F4: Scope fidelity check — only in-scope files changed; dashboard NOT staged (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 4 → F1-F4 → user okay
Max Concurrent: 4 (Wave 1)
```

### Dependency Matrix

| Task        | Depends On | Blocks          | Wave |
| ----------- | ---------- | --------------- | ---- |
| 1           | —          | 2,3,5,6,7,8,9   | 0    |
| 2           | 1          | 10, F1-F4       | 1    |
| 3           | 1          | 4, 5,6,7, F1-F4 | 1    |
| 8           | 1          | 11, F1-F4       | 1    |
| 9           | 1          | F1-F4           | 1    |
| 5 (B1)      | 1, 3       | F1-F4           | 2    |
| 6 (B2)      | 1, 3       | F1-F4           | 2    |
| 7 (B3)      | 1, 3       | F1-F4           | 2    |
| 4           | 3          | F1-F4           | 3    |
| 10          | 2          | F1-F4           | 3    |
| 11          | 8          | F1-F4           | 3    |
| 12 (notify) | F1-F4      | —               | post |

### Agent Dispatch Summary

- **Wave 0**: T1 → `quick`
- **Wave 1**: T2 → `deep`, T3 → `deep`, T8 → `deep`, T9 → `unspecified-high`
- **Wave 2**: T5 → `deep`, T6 → `deep`, T7 → `deep`
- **Wave 3**: T4 → `quick`, T10 → `quick`, T11 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = the unit of work. EVERY task has Recommended Agent Profile + QA Scenarios.

- [x] 1. Create `src/lib/slack-copy.ts` — shared conversational copy module (Wave 0 foundation)

  **What to do** (NEW file `src/lib/slack-copy.ts`):
  - Single source of truth for ALL conversational Slack copy used by A/B/C/D. Pure functions returning strings — first-person, short (≤2 sentences), warm but not cringe, ONE leading emoji max, NO LLM, NO randomized pools. EMPLOYEE-AGNOSTIC (no "guest"/"summary"/"Hostfully").
  - **Trigger-flow copy (A)** — USER-APPROVED verbatim, use EXACTLY:
    - `loadingMessage(roleName, summary?)` → `"On it — I'm getting *${roleName}* started${summary ? \` for ${summary}\` : ''}. One moment…"`
    - `successMessage(roleName, userId)` → `"✅ Done — *${roleName}* is now working on it, <@${userId}>. I'll post the results here when it's ready."`
    - `missingInfoMessage(roleName, inputList)` → `"Almost there — before I start *${roleName}*, I just need a couple of details:\n\n${inputList}\n\nJust reply here and I'll take it from there."`
    - `failureMessage()` → `"Hmm, I ran into a problem starting that up. Mind trying again in a moment?"`
  - **Watchdog copy (C)** — `watchdogFailureMessage(roleName?)` → `"❌ This one timed out before it could finish — I didn't get what I needed in time. Mind kicking it off again?"` (generic; roleName optional since the cron has no archetype).
  - **Remaining-string copy (D)** — named constants/functions for the enumerated strings: `supersededMessage()`, `expiredMessage()`, `needsReviewMessage(name?)`, `reviewingDraftedMessage(name?)`, `completedNoApprovalMessage()`, `noActionSkippedMessage(roleName, reasoning?)`, `triggerCardPrompt(employeeName)`, `ruleProposedMessage(ruleText)`, `ruleMergedMessage(mergedText, originals)`, `ruleContradictionMessage(description, conflicts)`, `questionNoAnswerFallback()`. Copy guidance per situation:
    - superseded → `"⏭️ A newer message came in — I've moved on to that one."`
    - expired → `"⏰ This one timed out — I didn't hear back in time, so I've let it go."`
    - needsReview → `"👀 Hey${name ? \` — ${name}\` : ''}, this one's waiting on you. Mind taking a look?"`
    - reviewingDrafted → `"👀 I've drafted${name ? \` a reply for ${name}\` : ' something'} and sent it your way for a quick look."`
    - completedNoApproval → `"✅ All done — nothing needed your sign-off on this one."`
    - noActionSkipped → `"ℹ️ I looked at this and decided nothing needed doing${reasoning ? \`: ${reasoning}\` : '.'} You can override me if you disagree."`
    - triggerCardPrompt → `"Want me to get *${employeeName}* started?"`
    - ruleProposed → `"🧠 I picked up a new pattern from your edit — does this sound right?\n\n> ${ruleText}"`
    - ruleMerged → `"🔀 I noticed a few of your rules overlap — here's a combined version. Does this capture it?\n\n> ${mergedText}\n\n*Replaces:*\n${originals}"`
    - ruleContradiction → `"⚠️ Heads up — two of your rules seem to conflict: ${description}\n${conflicts}"`
    - questionNoAnswerFallback → `"I couldn't find an answer to that one — could you give me a bit more to go on?"`

  **Must NOT do**: No LLM imports. No randomized pools. No emoji spam. No employee-specific words. Do NOT touch any other file in this task.

  **Recommended Agent Profile**:
  - **Category**: `quick` — single new file of pure string functions. **Skills**: [].

  **Parallelization**: Can Run In Parallel: NO (foundation) | Wave: 0 | Blocks: 2,3,5,6,7,8,9 | Blocked By: None

  **References**:
  - `git show a9e611a5 -- src/gateway/slack/handlers.ts` — the tone a9e611a5 established ("On it — sending this for approval…", "Hmm, something went wrong on my end — mind trying that again?"). Match this register exactly.
  - `src/inngest/employee-lifecycle.ts:2909,2953` — already-human strings ("📝 Noted…", "Got it, <@X>. What should I have done differently?") — the existing voice baseline.
  - **WHY**: All A/B/C/D string work imports from this file. Consistency with a9e611a5's voice is mandatory so the platform doesn't have two tones.

  **Acceptance Criteria**:

  ```
  Scenario: Module exports all copy functions and builds
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -5
      2. Run: grep -nE "loadingMessage|successMessage|missingInfoMessage|failureMessage|watchdogFailureMessage|supersededMessage|expiredMessage|triggerCardPrompt|ruleProposedMessage|questionNoAnswerFallback" src/lib/slack-copy.ts
      3. Assert: build exit 0; all exports present
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: No LLM / no employee-specific words
    Tool: Bash (grep)
    Steps:
      1. Run: grep -niE "callLLM|import.*call-llm|guest|hostfully|summary" src/lib/slack-copy.ts || echo "CLEAN"
      2. Assert: "CLEAN"
    Evidence: .sisyphus/evidence/task-1-clean.txt
  ```

  **Commit**: YES — `feat(slack): add shared conversational slack-copy module` — Pre-commit: `pnpm build`

- [x] 2. Add isolated `pre-extract-inputs` Inngest step + size-guarded `value` embedding

  **What to do** (in `src/inngest/slack-trigger-handler.ts`, the `createSlackTriggerHandlerFunction` — the @mention handler, NOT the input-collector):
  1. Add a NEW step `pre-extract-inputs` AFTER `route-employee` (~line 170–182) and BEFORE `send-confirmation` (~line 203). It must:
     - Fetch the routed archetype's `input_schema` via a SEPARATE PostgREST query (`select=input_schema` filtered by `id=eq.<archetypeId>&tenant_id=eq.<tenantId>&status=eq.active&deleted_at=is.null`). Do NOT widen `resolveArchetypeFromChannel`'s SELECT.
     - Derive `requiredInputs` using the SAME filter as the handler (`required === true && (frequency === 'every_run' || frequency === undefined)`).
     - If `requiredInputs.length > 0`, call `extractInputsFromText(text, requiredInputs, callLLM)` inside a try/catch. On ANY error (incl. `CostCircuitBreakerError`/`RateLimitExceededError`), `log.warn` and return `{}` (embed nothing — never fail the step or block the card).
     - Return the extracted `Record<string,string>` (possibly `{}`).
  2. In `send-confirmation`, build the `value` JSON as today PLUS `extractedInputs` ONLY when non-empty. CRITICAL size-guard: serialize the FINAL per-button value string; if `Buffer.byteLength(valueStr, 'utf8') > 1800`, rebuild WITHOUT `extractedInputs` (fall back to on-click extraction). Apply the SAME final value to BOTH Confirm and Cancel buttons (they share `contextValue`).
  3. Use `triggerCardPrompt(employeeName)` from `slack-copy.ts` for the card header (replaces `Trigger *${employeeName}*?`).
  4. Keep the card-post as the ONLY side-effecting step (idempotent on retry — extraction has no side effects).

  **Must NOT do**: Do NOT widen `resolveArchetypeFromChannel`'s SELECT. Do NOT fold extraction into `send-confirmation`. Do NOT modify `extract-inputs.ts`. Do NOT change card blocks/buttons beyond `value` + the header text. Do NOT touch the input-collector function.

  **Recommended Agent Profile**:
  - **Category**: `deep` — new Inngest step with retry-safety, failure-isolation, per-button size-guard. **Skills**: [`debugging-lifecycle`] (Inngest step/retry semantics). Omitted: `e2e-testing` (that's F3).

  **Parallelization**: Can Run In Parallel: YES (Wave 1, file-disjoint from 3/8/9) | Wave: 1 | Blocks: 10 | Blocked By: 1

  **References**:
  - `src/inngest/slack-trigger-handler.ts:11-12` — `extractInputsFromText` + `callLLM` ALREADY imported.
  - `src/inngest/slack-trigger-handler.ts:170-214` — `route-employee` + `send-confirmation`; insert between; `value` built at ~207-214; card header `Trigger *${employeeName}*?` at line 219.
  - `src/inngest/slack-trigger-handler.ts:232,239` — Confirm + Cancel share `contextValue` — apply guarded value to both.
  - `src/gateway/slack/handlers.ts:1576-1600` — canonical `requiredInputs` filter to replicate.
  - `src/lib/extract-inputs.ts:72-74,124-128` — throws only Cost/RateLimit, else `{}` → the try/catch contract.
  - `src/gateway/services/interaction-classifier.ts:67,79` — resolver SELECT shape to NOT change.
  - **WHY**: Moves the 4–7s extraction latency to BEFORE the card appears (latency-insensitive), making the click path LLM-free. Size-guard prevents Slack rejecting an oversized button `value`.

  **Acceptance Criteria** (full QA in Task 10; structural here):

  ```
  Scenario: pre-extract step exists, isolated, try/catch-wrapped, size-guard present
    Tool: Bash (grep)
    Steps:
      1. Run: grep -nE "pre-extract-inputs|extractInputsFromText|Buffer.byteLength|1800|triggerCardPrompt" src/inngest/slack-trigger-handler.ts
      2. Assert: step id 'pre-extract-inputs' exists; extractInputsFromText called within it; 1800-byte guard present; triggerCardPrompt imported
    Evidence: .sisyphus/evidence/task-2-structure.txt

  Scenario: resolver SELECT unchanged + build passes
    Tool: Bash
    Steps:
      1. Run: git diff src/gateway/services/interaction-classifier.ts | head -5  (assert empty)
      2. Run: pnpm build 2>&1 | tail -5  (assert exit 0)
    Evidence: .sisyphus/evidence/task-2-build.txt
  ```

  **Commit**: YES — `perf(slack): pre-extract trigger inputs off the click path in send-confirmation flow` — Pre-commit: `pnpm test -- --run tests/inngest/slack-trigger-pre-extract.test.ts`

- [x] 3. Reorder confirm handler: remove cosmetic LLM, instant button removal, read pre-extracted inputs (fallback retained)

  **What to do** (in `src/gateway/slack/handlers.ts`, TRIGGER_CONFIRM handler ONLY, lines ~1501-1885):
  1. **Parse pre-extracted inputs from `value`**: extend the parsed `ctx` type with optional `extractedInputs?: Record<string,string>`; read it from the button value.
  2. **Reorder for instant feedback** (core UX fix):
     - Keep `await ack()` (~line 1528).
     - RECOMMENDED (Oracle): add `await new Promise((r) => setImmediate(r));` immediately after `ack()` to flush the socket buffer.
     - Replace the current "⏳ Triggering employee..." respond with a `respond({ replace_original: true, blocks: [loadingMessage(...) section, context] })` that has NO `actions` block (buttons removed). Keep it in try/catch (log.warn + continue). Use `loadingMessage` from `slack-copy.ts`.
  3. **Skip-don't-delete extraction**: where `extractedInputs` is computed (~1600-1604), use `ctx.extractedInputs` when present and non-empty; ONLY call `extractInputsFromText(ctx.text, requiredInputs, callLLM)` as a FALLBACK when `ctx.extractedInputs` is absent/empty.
  4. **Remove the cosmetic LLM call** (~1614-1640 try/catch): delete it; set the in-thread message text directly from `slack-copy.ts` (`loadingMessage` / appropriate constant) — NO LLM.
  5. **someFound branch** (~1719): populate `pendingData.extractedInputs` from `ctx.extractedInputs` (do NOT re-run extraction). Use `missingInfoMessage(...)` for the thread prompt. Keep `pendingInputCollections.set(...)` + `return`.
  6. **Success/failure copy**: final ✅ respond uses `successMessage(role_name, user.id)`; catch-block failure respond (gated on `!dispatched`) uses `failureMessage()`. Keep `dispatched = true` strictly AFTER each `await inngest.send()` (preserve the 4 false-failure-suppression tests).
  7. Preserve the `return;` after allFound and ALL idempotency (externalId derivation, `id: employee-dispatch-${externalId}`, PostgREST duplicate reuse).

  **Must NOT do**: Do NOT add any LLM call to the click path. Do NOT delete on-click `extractInputsFromText`. Do NOT touch TRIGGER_CANCEL/APPROVE/REJECT (those are Task 6/already a9e611a5). Do NOT change `externalId` derivation or idempotency key. Do NOT refactor unrelated branches. Do NOT inline prose — all strings via `slack-copy.ts`.

  **Recommended Agent Profile**:
  - **Category**: `deep` — careful reorder of a 380-line handler with 3 branches, preserving idempotency + `dispatched` flag + 4 regression tests. **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1, with 2/8/9 — different files; but blocks Wave-2 B-tasks which also edit handlers.ts) | Wave: 1 | Blocks: 4, 5, 6, 7 | Blocked By: 1

  **References**:
  - `src/gateway/slack/handlers.ts:1528-1552` — ack + the ⏳ respond to replace with buttons-removed loading respond.
  - `src/gateway/slack/handlers.ts:1600-1606` — where extractedInputs/allFound/someFound derived; add skip-when-present here.
  - `src/gateway/slack/handlers.ts:1611-1717` — allFound branch (cosmetic LLM ~1614-1640 to DELETE; in-thread postMessage ~1640-1647; ✅ respond ~1694-1717; `dispatched=true` ~1687; `return` ~1718).
  - `src/gateway/slack/handlers.ts:1719-1793` — someFound branch; populate `pendingData.extractedInputs`.
  - `src/gateway/slack/handlers.ts:1851-1884` — catch block; failure respond gated on `!dispatched` — use `failureMessage`.
  - `src/inngest/slack-trigger-handler.ts:207-214` — the `value` shape to read `extractedInputs` from (Task 2 produces it).
  - **WHY**: This is the click critical path. Removing both LLM calls + reading pre-extracted inputs makes it ~100ms. The buttons-removed loading respond kills the ⚠️ + double-click window.

  **Acceptance Criteria** (full QA in Task 4; structural here):

  ```
  Scenario: No LLM on click path; cosmetic removed; extraction is fallback-only
    Tool: Bash (grep)
    Steps:
      1. Run: grep -nE "callLLM|extractInputsFromText|ctx.extractedInputs|setImmediate|loadingMessage|successMessage|failureMessage|missingInfoMessage" src/gateway/slack/handlers.ts | sed -n '1,40p'
      2. Assert: cosmetic callLLM gone; extractInputsFromText only inside a `!ctx.extractedInputs` fallback; copy fns imported from slack-copy
    Evidence: .sisyphus/evidence/task-3-grep.txt

  Scenario: Buttons removed on loading respond + dispatched after send + existing 11 tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tail -5  (assert exit 0)
      2. Run: pnpm exec vitest run tests/gateway/slack/handlers-trigger-confirm.test.ts 2>&1 | tail -6  (assert 11 existing pass)
    Evidence: .sisyphus/evidence/task-3-build-tests.txt
  ```

  **Commit**: YES — `perf(slack): remove LLM from confirm click path, instant button removal + conversational copy` — Pre-commit: `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts`

- [x] 4. Extend handler tests: zero-LLM-on-click, cosmetic removal, backward-compat fallback

  **What to do** (extend `tests/gateway/slack/handlers-trigger-confirm.test.ts`):
  1. BASELINE FIRST: run the file, record current pass count (11) to `.sisyphus/evidence/task-4-baseline.txt`.
  2. Extend `makeActionBody` (or add a variant) so the button `value` can optionally include `extractedInputs` (e.g. `{ date: '2026-06-10' }`).
  3. Add tests:
     a. **Pre-extracted present → zero LLM on click**: `value` includes `extractedInputs:{date:'2026-06-10'}`. Assert `mockExtractInputsFromText` NOT called AND `mockCallLLM` NOT called; `inngest.send` called once; in-thread text from `loadingMessage`.
     b. **Cosmetic removal**: allFound path → `mockCallLLM` never invoked (zero callLLM total on this path).
     c. **Backward-compat fallback**: `value` has NO `extractedInputs` → `mockExtractInputsFromText` IS called; dispatches once.
     d. **Buttons removed on loading respond**: first post-ack `respond` payload has no `actions` block.
     e. **someFound with pre-extracted partial**: partial `value.extractedInputs` → missing-info path WITHOUT calling `mockExtractInputsFromText`; pending data carries pre-extracted inputs.
  4. Preserve all 11 existing tests verbatim (esp. the legitimate-failure + 4 false-failure-suppression tests).

  **Must NOT do**: Do NOT weaken existing tests. Do NOT require live LLM/Slack. Place tests only in this file.

  **Recommended Agent Profile**: `quick` — extend established mock harness. **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 3) | Wave: 3 | Blocks: F1-F4 | Blocked By: 3

  **References**:
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:95-119` — `makeActionBody` to extend.
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:163-194` — allFound dispatch test (basis for a/b).
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:316-338` — single-dispatch regression test (call-count pattern).
  - `tests/gateway/slack/handlers-trigger-confirm.test.ts:145-155` — `mockCallLLM`/`mockExtractInputsFromText` default setup.
  - **WHY**: Test (a) is the core proof (zero LLM on click). Test (c) guards backward compat.

  **Acceptance Criteria**:

  ```
  Scenario: All handler tests pass incl. new
    Tool: Bash
    Steps:
      1. Run: pnpm exec vitest run tests/gateway/slack/handlers-trigger-confirm.test.ts 2>&1 | tail -8
      2. Assert: 0 failures; count >= 16 (11 + 5 new)
    Evidence: .sisyphus/evidence/task-4-tests.txt
  ```

  **Commit**: YES — `test(slack): cover zero-LLM-on-click, cosmetic removal, backward-compat fallback` — Pre-commit: `pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts`

- [x] 5. B1 — `app_mention`: post immediate "got it" before Prisma/PostgREST work

  **What to do** (in `src/gateway/slack/handlers.ts`, `app.event('app_mention')` handler, ~line 305):
  - Today the handler does in-memory checks, then a full `new PrismaClient()` + `integrationRepo.findByExternalId` + `findTaskIdByThreadTs` (2 PostgREST fetches) BEFORE firing the Inngest event — 5–10s of silence with no user feedback.
  - Post an immediate acknowledgment to the thread (`client.chat.postMessage` with `thread_ts`) using a `slack-copy.ts` constant (`loadingMessage`-style "On it — one moment…") BEFORE the Prisma/PostgREST work, wrapped in try/catch (non-fatal).
  - EDGE CASE: if the mention is in an unassigned channel (decline path) OR is a pending-input thread reply, the "got it" must NOT fire prematurely. Only post the ack when this is a genuine new-task @mention. If decline detection happens AFTER the DB lookup, EITHER (a) move the ack to AFTER the cheap in-memory checks but keep it before the expensive Prisma/PostgREST, accepting that an unassigned channel still gets a brief ack then a decline — OR (b) capture the posted `ts` and update it to the decline copy. Prefer (b): post ack, keep `ts`, then on decline `chat.update` the SAME message to the decline copy (no message accumulation, per AGENTS.md hygiene).

  **Must NOT do**: Do NOT change the Inngest event payload or the routing logic. Do NOT move the Prisma/PostgREST into the Inngest function in THIS task (that's a larger refactor — out of scope). Do NOT touch other handlers. Do NOT introduce employee-specific copy.

  **Recommended Agent Profile**: `deep` — event-handler reorder with a decline-path edge case + message-hygiene (capture+update ts). **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 2 — line ~305, disjoint from B2/B3) | Wave: 2 | Blocks: F1-F4 | Blocked By: 1, 3

  **References**:
  - `src/gateway/slack/handlers.ts:305-390` — the app_mention handler; in-memory checks → Prisma (377-384) → findTaskIdByThreadTs (387) → inngest.send (390).
  - `src/inngest/slack-trigger-handler.ts:196` — the decline copy ("I don't have any employees assigned…") — reuse/centralize via slack-copy.ts if it makes sense.
  - AGENTS.md "Slack Message Hygiene" — capture `ts`, update in place; never accumulate.
  - **WHY**: 5–10s of silence after @mention is the worst non-frozen feedback gap. An immediate ack closes it.

  **Acceptance Criteria**:

  ```
  Scenario: Immediate ack posted before Prisma/PostgREST
    Tool: Bash (grep) + Read
    Steps:
      1. Run: grep -nE "chat.postMessage|PrismaClient|findTaskIdByThreadTs|inngest.send" src/gateway/slack/handlers.ts | sed -n '/30[0-9]/,/39[0-9]/p'
      2. Read 305-395; assert a chat.postMessage ack appears BEFORE the PrismaClient instantiation; decline path updates the same ts (no second top-level message)
      3. Run: pnpm build 2>&1 | tail -5  (exit 0)
    Evidence: .sisyphus/evidence/task-5-app-mention.txt
  ```

  **Commit**: groups with B2/B3 into commit 6 — `perf(slack): remove buttons before heavy work in approval/rule/modal handlers` — Pre-commit: `pnpm build`

- [x] 6. B2 — guest + override handlers: remove buttons before modal open / heavy work (lines ~650–950)

  **What to do** (in `src/gateway/slack/handlers.ts`, handlers in the ~650–950 region ONLY):
  - **GUEST_EDIT** (~650), **GUEST_REJECT** (~808), **OVERRIDE_TAKE_ACTION** (~865): each calls `ack()` then `client.views.open(...)` while the original card buttons stay live. Fix: after `ack()`, call `client.chat.update(...)` on the ORIGINAL card to remove the action buttons (replace with a brief loading/section block) BEFORE `views.open`. Wrap in try/catch (non-fatal). Use a `slack-copy.ts` loading constant for any replacement text.
  - **guest_edit_modal view** (~705) and **override_take_action_modal view** (~947): each does heavy work (`isTaskAwaitingApproval` 10-retry poll up to 20s / `isTaskAwaitingOverride`) BEFORE the `chat.update` that removes buttons. Fix: move the `chat.update` (buttons removed, loading state) to IMMEDIATELY after `ack()`, BEFORE the heavy DB work.

  **Must NOT do**: Do NOT change modal payloads, view IDs, dispatched events, DB writes, or final outcomes — ONLY move the `chat.update`/button-removal earlier. NO logic rewrites, NO helper extraction, NO renames. Do NOT touch RULE\_\* handlers (Task 7) or the ~305 / ~1501 handlers.

  **Recommended Agent Profile**: `deep` — behavior-preserving reorder of 5 handlers in one region; subtle ack/chat.update ordering. **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 2 — region ~650–950, disjoint from B1/B3) | Wave: 2 | Blocks: F1-F4 | Blocked By: 1, 3

  **References**:
  - `src/gateway/slack/handlers.ts:650-684` GUEST_EDIT, `:808-824` GUEST_REJECT, `:865-881` OVERRIDE_TAKE_ACTION — `views.open` after ack, buttons stay live.
  - `src/gateway/slack/handlers.ts:705-787` guest_edit_modal view (10-retry poll at ~744 BEFORE chat.update at ~787 — the 20s case).
  - `src/gateway/slack/handlers.ts:947-1001` override_take_action_modal view.
  - `src/gateway/slack/handlers.ts:1022-1053` guest_reject_modal — ALREADY FAST (chat.update at 1053 before poll) — use as the reference pattern to replicate.
  - **WHY**: guest_edit_modal leaves buttons live for up to 20s (worst non-confirm case). guest_reject_modal already does it right — copy that ordering.

  **Acceptance Criteria**:

  ```
  Scenario: chat.update precedes views.open / heavy work in all 5 handlers
    Tool: Read + Bash
    Steps:
      1. Read handlers.ts 650-1001; for each handler assert chat.update/button-removal occurs BEFORE views.open or isTaskAwaiting*
      2. Run: pnpm build 2>&1 | tail -5  (exit 0)
      3. Run: pnpm exec vitest run tests/gateway/slack 2>&1 | tail -6  (no NEW failures vs baseline)
    Evidence: .sisyphus/evidence/task-6-guest-override.txt
  ```

  **Commit**: groups into commit 6 — Pre-commit: `pnpm build`

- [x] 7. B3 — rule handlers: remove buttons before heavy work (lines ~1138–1389)

  **What to do** (in `src/gateway/slack/handlers.ts`, handlers in the ~1138–1389 region ONLY):
  - **RULE_CONFIRM** (~1138): `ack()` then PATCH employee_rules + 2 GET + DB read BEFORE `chat.update` at ~1176. Fix: move `chat.update` (buttons removed, "got it" loading) to immediately after `ack()`, before the PATCH.
  - **RULE_REJECT** (~1264): PATCH before `chat.update` at ~1293. Fix: same — chat.update first.
  - **RULE_REPHRASE** (~1329): `ack()` then GET rule_text + `views.open` while buttons stay live. Fix: chat.update to remove buttons BEFORE the GET/views.open.
  - **rule_rephrase_modal view** (~1389): 2 PostgREST fetches before `chat.update` at ~1450. Fix: move button-removal/loading chat.update to immediately after ack().
  - Use `slack-copy.ts` constants for any replacement loading text. The rule confirmed/rejected FINAL strings (already human per a9e611a5 — "✅ Rule confirmed by <@X>") stay as-is; only the INTERMEDIATE loading + button-removal ordering changes.

  **Must NOT do**: Do NOT change DB writes, dispatched events, modal payloads, or final outcomes. ONLY reorder button-removal earlier. NO logic rewrites. Do NOT touch the rule-card PROPOSED copy here (that's Task 9, in rule-extractor.ts — different file). Do NOT touch other regions of handlers.ts.

  **Recommended Agent Profile**: `deep` — behavior-preserving reorder of 4 rule handlers. **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 2 — region ~1138–1389, disjoint from B1/B2) | Wave: 2 | Blocks: F1-F4 | Blocked By: 1, 3

  **References**:
  - `src/gateway/slack/handlers.ts:1138-1232` RULE_CONFIRM (chat.update ~1176 after PATCH ~1156).
  - `src/gateway/slack/handlers.ts:1264-1314` RULE_REJECT (chat.update ~1293 after PATCH ~1275).
  - `src/gateway/slack/handlers.ts:1329-1359` RULE_REPHRASE (GET + views.open, buttons live).
  - `src/gateway/slack/handlers.ts:1389-1450` rule_rephrase_modal view (2 fetches before chat.update ~1450).
  - **WHY**: 1–2s of stale rule-card buttons (RULE_CONFIRM) → double-click risk on rule confirmation.

  **Acceptance Criteria**:

  ```
  Scenario: button-removal precedes heavy work in all 4 rule handlers
    Tool: Read + Bash
    Steps:
      1. Read handlers.ts 1138-1450; assert chat.update/button-removal before PATCH/GET/views.open in each
      2. Run: pnpm build 2>&1 | tail -5  (exit 0)
      3. Run: pnpm exec vitest run tests/gateway/slack 2>&1 | tail -6  (no NEW failures)
    Evidence: .sisyphus/evidence/task-7-rules.txt
  ```

  **Commit**: groups into commit 6 — `perf(slack): remove buttons before heavy work in approval/rule/modal handlers` — Pre-commit: `pnpm build`

- [x] 8. Watchdog frozen-message fix — update notify-received when a zombie task is failed

  **What to do** (in `src/inngest/triggers/reviewing-watchdog.ts`):
  1. Widen the task SELECT (line 67) to include `metadata`: `&select=id,tenant_id,status,updated_at,metadata`. Add `metadata` to the `TaskRow` interface.
  2. AFTER the DB PATCH to `Failed` succeeds (after ~line 132) and the `task_status_log` POST, attempt to update the frozen notify-received Slack message — wrapped in its OWN try/catch so a Slack failure NEVER throws and NEVER aborts the loop:
     - Read `notify_slack_ts` and `notify_slack_channel` from `task.metadata`. If EITHER is null/absent → skip the Slack update, `log.info` "no notify message to update", continue. (Zombie tasks have NO `pending_approvals` row, so there is NO approval card to update — only the notify message.)
     - Load the tenant's bot token using the SAME pattern as `employee-lifecycle.ts` `mark-failed` (lines 721–768): `new PrismaClient()` → `loadTenantEnv(task.tenant_id, { tenantRepo: new TenantRepository(prisma), secretRepo: new TenantSecretRepository(prisma) }, null)` → `$disconnect()` → `tenantEnv['SLACK_BOT_TOKEN']`. (Pass `null` for channel — the cron has no archetype.)
     - If no bot token → skip + log, continue.
     - `createSlackClient({ botToken, defaultChannel: '' })` → `updateMessage(notify_slack_channel, notify_slack_ts, watchdogFailureMessage(), <minimal ❌ blocks>)` using `watchdogFailureMessage()` from `slack-copy.ts`. Generic copy (no archetype/role available — or fetch `tasks.archetype_id → role_name` only if cheap; otherwise omit).
  3. CRITICAL ordering: the DB `Failed` PATCH must remain committed BEFORE the Slack update is attempted (already true) — a Slack failure must never leave the task un-failed.
  4. Per-task isolation: all of the above lives inside the existing `step.run(\`check-task-${task.id}\`)` try/catch context so one tenant's dead token can't break the sweep; ensure any throw is caught and the loop proceeds.

  **Must NOT do**: Do NOT touch `src/inngest/watchdog.ts` (deprecated engineering watchdog — DIFFERENT file). Do NOT build retry/queue infra. Do NOT add a `pending_approvals` card update (zombies have none). Do NOT change the zombie-detection logic, threshold, or the Failed PATCH itself. Do NOT introduce employee-specific copy.

  **Recommended Agent Profile**: `deep` — cron Slack side-effect with strict edge-guards + token-loading in a non-worker context. **Skills**: [`debugging-lifecycle`] (lifecycle/Slack-token semantics). Omitted: none.

  **Parallelization**: Can Run In Parallel: YES (Wave 1 — own file) | Wave: 1 | Blocks: 11 | Blocked By: 1

  **References**:
  - `src/inngest/triggers/reviewing-watchdog.ts:67` — task SELECT to widen with `metadata`; `:90-147` — per-task loop where the Slack update is added (after the Failed PATCH ~132).
  - `src/inngest/employee-lifecycle.ts:721-768` — the EXACT `mark-failed` pattern to copy: `loadTenantEnv` → `SLACK_BOT_TOKEN` → `createSlackClient` → `updateMessage`.
  - `src/inngest/employee-lifecycle.ts:12` — `loadTenantEnv` import; `TenantRepository`/`TenantSecretRepository`/`PrismaClient` imports near top.
  - `src/lib/slack-copy.ts` — `watchdogFailureMessage()` (Task 1).
  - **WHY**: This is the ONLY true frozen-message bug. Users whose task is killed by the watchdog stare at "⏳ Awaiting approval" forever. Copying the proven `mark-failed` pattern is low-risk.

  **Acceptance Criteria** (full edge QA in Task 11; structural here):

  ```
  Scenario: SELECT widened + Slack update added with edge guards, never throws
    Tool: Bash (grep) + Read
    Steps:
      1. Run: grep -nE "metadata|loadTenantEnv|notify_slack_ts|notify_slack_channel|watchdogFailureMessage|updateMessage|createSlackClient" src/inngest/triggers/reviewing-watchdog.ts
      2. Read the per-task block; assert: metadata selected; Failed PATCH BEFORE Slack update; null-ts → skip (no throw); Slack update in its own try/catch
      3. Run: pnpm build 2>&1 | tail -5  (exit 0)
      4. Run: git diff src/inngest/watchdog.ts | head -3  (assert empty — wrong file untouched)
    Evidence: .sisyphus/evidence/task-8-watchdog.txt
  ```

  **Commit**: YES — `fix(slack): update frozen notify message when watchdog fails a zombie task` — Pre-commit: `pnpm test -- --run tests/inngest/reviewing-watchdog.test.ts`

- [x] 9. Replace remaining robotic strings (the complement set NOT fixed by a9e611a5)

  **What to do** — swap ONLY the enumerated strings below to `slack-copy.ts` constants. Confirm each old form has grep-count 0 afterward.
  - `src/inngest/employee-lifecycle.ts`:
    - `⏭️ Superseded` (lines 682, 1808, 2670, 2682) → `supersededMessage()`
    - `Awaiting approval — reply drafted [for X]` (1897-1898) → `reviewingDraftedMessage(name?)`
    - `⏳ ... — Needs your review` / `⏳ Needs your review` (1991-1992) → `needsReviewMessage(name?)`
    - `⏰ Expired — no action taken.` (2123, 2153) → `expiredMessage()`
    - `✅ Completed — no approval required` (1330, 1334) → `completedNoApprovalMessage()`
    - `🤖 No action needed — AI skipped this task` (1455) → `noActionSkippedMessage(roleName, reasoning?)`
  - `src/inngest/slack-trigger-handler.ts`: `Trigger ${employeeName}?` fallback text (259) → `triggerCardPrompt(employeeName)` (the header at 219 is handled in Task 2; ensure both use the same constant).
  - `src/inngest/rule-extractor.ts`: `🧠 *New behavioral rule proposed:*` (181) + fallback (224) → `ruleProposedMessage(ruleText)`.
  - `src/inngest/rule-synthesizer.ts`: `🔀 *Merged behavioral rule proposed:*` (191) + fallback (234) → `ruleMergedMessage(...)`; `⚠️ Contradictory rules detected:` (287) → `ruleContradictionMessage(...)`.
  - `src/inngest/interaction-handler.ts`: `New behavioral rule proposed:` card (223) + fallback (259) → `ruleProposedMessage(...)`; `I was unable to find an answer.` (433) → `questionNoAnswerFallback()`.
  - Also handle the `⏭️ Superseded` / `Expired` / `No action needed` / `Awaiting approval` COMPACT statuses in `src/lib/slack-blocks.ts` (lines 329, 394, 412, 415) ONLY IF they are user-facing top-level text — coordinate so as not to re-touch a9e611a5 lines. If a slack-blocks compact status is purely a one-word badge, leave it (a9e611a5 already handled the main blocks).
  - Update any unit test asserting an old string (e.g. `tests/lib/slack-blocks.test.ts`) to the new copy.

  **Must NOT do**: Do NOT re-touch a9e611a5-owned strings (Task received/failed/complete, "Processing…", "AI skipped this task" in slack-blocks.ts:172 — already fixed there; only the lifecycle.ts:1455 occurrence remains, fix THAT one, "Error occurred", passive triggered-by, reminder footer). Do NOT touch handlers.ts (Tasks 3/5/6/7 own it). Do NOT introduce employee-specific copy. Do NOT change block STRUCTURE — only text.

  **Recommended Agent Profile**: `unspecified-high` — many small precise edits across 5 files; care needed to not collide with a9e611a5 lines. **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1 — does NOT touch handlers.ts trigger region; lifecycle.ts edits are disjoint string lines from any other task) | Wave: 1 | Blocks: F1-F4 | Blocked By: 1

  **References**:
  - The enumerated line numbers above (verified this session via grep).
  - `git show a9e611a5` — the strings ALREADY fixed (do NOT re-touch).
  - `src/lib/slack-copy.ts` — the constants to import (Task 1).
  - **WHY**: Completes the human-tone coverage so NO robotic string remains anywhere in the Slack surface.

  **Acceptance Criteria**:

  ```
  Scenario: All enumerated old strings gone (count 0), build + tests pass
    Tool: Bash
    Steps:
      1. Run: grep -rcE "⏭️ Superseded|Awaiting approval — reply drafted|Expired — no action taken|Completed — no approval required|🤖 No action needed — AI skipped|New behavioral rule proposed|Merged behavioral rule proposed|Contradictory rules detected|unable to find an answer|Trigger \\\$\{employeeName\}\\?" src/ | grep -v ':0' || echo "ALL ZERO"
      2. Assert: "ALL ZERO" (no old forms remain)
      3. Run: pnpm build 2>&1 | tail -5  (exit 0)
      4. Run: pnpm exec vitest run tests/lib/slack-blocks.test.ts 2>&1 | tail -6  (pass)
    Evidence: .sisyphus/evidence/task-9-strings.txt

  Scenario: No employee-specific copy + no a9e611a5 lines re-touched
    Tool: Bash (git diff)
    Steps:
      1. Run: git diff src/inngest/employee-lifecycle.ts | grep "^+" | grep -niE "guest|hostfully|summary" || echo "CLEAN"
      2. Assert: "CLEAN"
    Evidence: .sisyphus/evidence/task-9-clean.txt
  ```

  **Commit**: YES — `fix(slack): replace remaining robotic strings with human-tone copy` — Pre-commit: `pnpm build && pnpm test -- --run tests/lib/slack-blocks.test.ts`

- [x] 10. New test file: pre-extract embedding, size-guard, failure-isolation

  **What to do** (new `tests/inngest/slack-trigger-pre-extract.test.ts`):
  1. Mirror the harness style of `tests/inngest/slack-input-collector.test.ts` (mock `step.run`, `fetch`, `callLLM`/`extractInputsFromText`, env).
  2. Tests for the `pre-extract-inputs` step + `value` embedding in `createSlackTriggerHandlerFunction`:
     a. **Happy path embedding**: required `date`, `extractInputsFromText` → `{date:'2026-06-10'}` → posted card button `value` JSON includes `extractedInputs:{date:'2026-06-10'}`.
     b. **No required inputs**: `input_schema:[]` → extraction skipped; `value` has no `extractedInputs`.
     c. **Size-guard**: large `text`/many inputs → per-button value would exceed 1800 bytes → posted `value` OMITS `extractedInputs`; `Buffer.byteLength` of final value ≤ 1800.
     d. **Failure-isolation**: `extractInputsFromText` rejects (`CostCircuitBreakerError` or generic) → step does NOT throw; card STILL posts with no embedded inputs.
     e. **Resolver shape**: the `input_schema` fetch is a SEPARATE call (resolver mock returns only id/role_name/notification_channel).

  **Must NOT do**: Do NOT require live LLM/Slack/Inngest. Tests-only (if a pure helper is needed it belongs to Task 2's file).

  **Recommended Agent Profile**: `quick` — new test file following an existing pattern. **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 3) | Wave: 3 | Blocks: F1-F4 | Blocked By: 2

  **References**:
  - `tests/inngest/slack-input-collector.test.ts` — harness to mirror.
  - `src/inngest/slack-trigger-handler.ts:203-276` — `send-confirmation` step building/posting the card.
  - `src/lib/errors.ts` — `CostCircuitBreakerError` for failure-isolation test.
  - **WHY**: Only unit guard for the size-guard + failure-isolation logic (no existing test for this function).

  **Acceptance Criteria**:

  ```
  Scenario: Pre-extract test file passes (>=5 tests)
    Tool: Bash
    Steps:
      1. Run: pnpm exec vitest run tests/inngest/slack-trigger-pre-extract.test.ts 2>&1 | tail -8
      2. Assert: 0 failures; >= 5 tests (embedding, no-inputs, size-guard, failure-isolation, separate-fetch)
    Evidence: .sisyphus/evidence/task-10-tests.txt
  ```

  **Commit**: YES — `test(slack): cover pre-extract embedding, size-guard, failure-isolation` (groups with Task 4/11 into commit 7) — Pre-commit: `pnpm test -- --run tests/inngest/slack-trigger-pre-extract.test.ts`

- [x] 11. New test file: watchdog frozen-message edge cases

  **What to do** (new `tests/inngest/reviewing-watchdog.test.ts`):
  1. Mirror `tests/inngest/slack-input-collector.test.ts` harness (mock `step.run`, `fetch`, `loadTenantEnv`, Slack client, env).
  2. Tests for the watchdog Slack-update behavior:
     a. **Happy path**: zombie task with `metadata.notify_slack_ts` + `notify_slack_channel` + a valid tenant token → `updateMessage` called once with `watchdogFailureMessage()` text on the right channel/ts; DB Failed PATCH happened BEFORE the Slack update.
     b. **Null notify_slack_ts**: metadata missing ts → NO `updateMessage` call; step does NOT throw; returns resolved=true (task still failed).
     c. **Missing token**: `loadTenantEnv` returns no `SLACK_BOT_TOKEN` → NO `updateMessage`; no throw; loop continues.
     d. **chat.update error**: `updateMessage` rejects → caught; no throw; task remains Failed (DB PATCH already done); loop proceeds to next task.
     e. **Multi-tenant sweep**: two zombie tasks with different `tenant_id` → `loadTenantEnv` called per-task with the correct tenant id.
     f. **Has pending_approvals**: task with a `pending_approvals` row → skipped entirely (not failed, no Slack update) — existing behavior preserved.

  **Must NOT do**: Do NOT require live Slack/DB. Tests-only.

  **Recommended Agent Profile**: `quick` — new test file. **Skills**: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 3) | Wave: 3 | Blocks: F1-F4 | Blocked By: 8

  **References**:
  - `tests/inngest/slack-input-collector.test.ts` — harness to mirror.
  - `src/inngest/triggers/reviewing-watchdog.ts` — the function under test (post-Task-8).
  - `src/inngest/employee-lifecycle.ts:765-767` — the non-fatal catch pattern to assert against.
  - **WHY**: The watchdog is a cron with high edge-case density (null ts, dead token, multi-tenant); these are the only guards proving it never throws and never leaves a task un-failed.

  **Acceptance Criteria**:

  ```
  Scenario: Watchdog edge-case tests pass (>=6 tests)
    Tool: Bash
    Steps:
      1. Run: pnpm exec vitest run tests/inngest/reviewing-watchdog.test.ts 2>&1 | tail -8
      2. Assert: 0 failures; >= 6 tests (happy, null-ts, no-token, update-error, multi-tenant, has-pending-approvals)
    Evidence: .sisyphus/evidence/task-11-watchdog-tests.txt
  ```

  **Commit**: YES — `test(slack): cover watchdog frozen-message edge cases` (groups into commit 7) — Pre-commit: `pnpm test -- --run tests/inngest/reviewing-watchdog.test.ts`

- [x] 12. Notify completion — Send Telegram: plan complete, all tasks done, come back to review.

  **What to do**: After F1-F4 pass and the user approves, run: `npx tsx scripts/telegram-notify.ts "✅ slack-ux-remediation complete — confirm is instant (no LLM on click), 9 handlers reordered, watchdog no longer freezes messages, all remaining robotic strings humanized. Come back to review."`

  **Recommended Agent Profile**: `quick`, Skills: [] | **Blocked By**: F1-F4 | **Commit**: NO

  **Acceptance Criteria**:

  ```
  Scenario: Telegram sent
    Tool: Bash
    Steps:
      1. Run: npx tsx scripts/telegram-notify.ts "✅ slack-ux-remediation complete ..."
      2. Assert: exit 0, stdout "[telegram] Notification sent."
    Evidence: .sisyphus/evidence/task-12-telegram.txt
  ```

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing. Do NOT auto-proceed. Never check F1-F4 before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify it exists. Confirm: zero LLM on confirm click path when pre-extracted present; cosmetic callLLM removed; on-click extraction retained as fallback; all 9 B-handlers + app_mention reordered (buttons removed before heavy work); watchdog updates frozen notify message with edge-guards; all copy from `slack-copy.ts`; D's enumerated strings replaced. For each "Must NOT Have": grep for violations (no LLM on click path, resolver SELECT unchanged, `watchdog.ts` untouched, no employee-specific copy in shared files, dashboard files NOT staged, no a9e611a5 strings re-touched). Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm test -- --run` on all target test files + `pnpm exec eslint` on changed files + `pnpm build`. Review changed lines for: `as any`/`@ts-ignore`, empty catches that swallow errors, `dispatched` after `inngest.send()`, loading respond removing buttons, copy strings as constants (not inline), size-guard correctness, watchdog DB-Failed-before-Slack ordering. Confirm existing handler + slack-blocks tests still pass.
      Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Build [PASS/FAIL] | VERDICT`

- [x] F3. **Real QA — unit suite + DB + watchdog + live Slack E2E** — `unspecified-high` (+ `e2e-testing` skill)
      (a) Baseline: `pnpm test -- --run` before/after → no NEW failures; all target test files pass.
      (b) Services live: `curl localhost:7700/health`, Inngest health, Socket Mode in `/tmp/ai-dev.log`.
      (c) Confirm-button live (ref `docs/testing/2026-05-10-1609-slack-ux-e2e-test-guide.md`): @mention cleaning-schedule (tenant `00000000-0000-0000-0000-000000000003`, archetype `00000000-0000-0000-0000-000000000019`) with a Spanish date → click Confirm → buttons vanish ~1s, conversational loading → ✅, NO ⚠️ (screenshot). Rapid double-click → `SELECT count(*) FROM tasks WHERE external_id LIKE 'slack-trigger-%-...000019'` increments by exactly 1.
      (d) P0 modal handler live: trigger a guest-messaging approval card; click Edit (or Reject) → original card buttons disappear BEFORE the modal opens.
      (e) Watchdog: force a task stuck in Reviewing with no pending_approvals + a real `notify_slack_ts` → invoke the cron (or wait) → `SELECT status` = Failed AND `conversations.replies` shows the notify message flipped to ❌ human copy (not "⏳").
      Output: `Unit [N/N] | Confirm vanish ~1s [Y/N] | ⚠️ absent [Y/N] | Double-click rows [N] | P0 buttons-before-modal [Y/N] | Watchdog ❌ update [Y/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      `git diff --name-only` — confirm ONLY in-scope files changed: `src/lib/slack-copy.ts`, `src/inngest/slack-trigger-handler.ts`, `src/gateway/slack/handlers.ts`, `src/inngest/triggers/reviewing-watchdog.ts`, `src/inngest/employee-lifecycle.ts`, `src/inngest/rule-extractor.ts`, `src/inngest/rule-synthesizer.ts`, `src/inngest/interaction-handler.ts`, + test files. Confirm dashboard files (`ModelCatalogPage.tsx`, `EmployeeList.tsx`, `IntegrationsPage.tsx`) are NOT staged/committed. Confirm `watchdog.ts`, `resolveArchetypeFromChannel` SELECT, `extract-inputs.ts` untouched. Detect cross-task contamination + employee-specific copy in shared files.
      Output: `Files [N/N in scope] | Dashboard excluded [Y/N] | Contamination [CLEAN/N] | VERDICT`

- [x] F5. **Tmux/scratch cleanup + docs** — kill any tmux sessions created during E2E; delete temp scripts. `git status` clean (only intended files + plan/notepads). Update AGENTS.md "Slack Voice & Tone" reference if the confirm-flow / watchdog behavior change warrants a note (per Documentation Freshness rule). Commit plan + notepads per git cleanup rules.

---

## Commit Strategy

| Commit | Message                                                                                         | Files                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1      | `feat(slack): add shared conversational slack-copy module`                                      | `src/lib/slack-copy.ts`                                                                       |
| 2      | `perf(slack): pre-extract trigger inputs off the click path in send-confirmation flow`          | `src/inngest/slack-trigger-handler.ts`                                                        |
| 3      | `perf(slack): remove LLM from confirm click path, instant button removal + conversational copy` | `src/gateway/slack/handlers.ts`                                                               |
| 4      | `fix(slack): update frozen notify message when watchdog fails a zombie task`                    | `src/inngest/triggers/reviewing-watchdog.ts`                                                  |
| 5      | `fix(slack): replace remaining robotic strings with human-tone copy`                            | `employee-lifecycle.ts`, `rule-extractor.ts`, `rule-synthesizer.ts`, `interaction-handler.ts` |
| 6      | `perf(slack): remove buttons before heavy work in approval/rule/modal handlers`                 | `src/gateway/slack/handlers.ts`                                                               |
| 7      | `test(slack): cover confirm zero-LLM, pre-extract size-guard, watchdog edge cases`              | test files                                                                                    |

---

## Success Criteria

### Verification Commands

```bash
# All target test suites pass
pnpm test -- --run tests/gateway/slack/handlers-trigger-confirm.test.ts tests/inngest/slack-trigger-pre-extract.test.ts tests/inngest/reviewing-watchdog.test.ts tests/lib/slack-blocks.test.ts
# Expected: 0 failures

# Zero new failures vs baseline
pnpm test -- --run 2>&1 | tail -15

# Remaining-robotic strings gone (count = 0 of old forms)
grep -rcE "⏭️ Superseded|Awaiting approval — reply drafted|Expired — no action taken|Completed — no approval required|🤖 No action needed — AI skipped|unable to find an answer" src/ | grep -v ':0'
# Expected: no output (all zero)

# Dashboard files NOT staged
git diff --name-only --cached | grep -E "ModelCatalogPage|EmployeeList|IntegrationsPage" && echo "VIOLATION" || echo "OK"

# Single dispatch per trigger (live E2E)
psql postgresql://postgres:postgres@localhost:54322/ai_employee -c \
  "SELECT count(*) FROM tasks WHERE external_id LIKE 'slack-trigger-%-00000000-0000-0000-0000-000000000019';"
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Zero LLM on confirm click path when pre-extracted present
- [ ] All 9 handlers + app_mention give instant feedback / remove buttons before heavy work
- [ ] Watchdog no longer leaves frozen ⏳ messages
- [ ] Every enumerated remaining-robotic string replaced (grep-count 0)
- [ ] All conversational copy in `src/lib/slack-copy.ts`
- [ ] Dashboard files NOT staged
- [ ] All tests pass; only in-scope files changed
