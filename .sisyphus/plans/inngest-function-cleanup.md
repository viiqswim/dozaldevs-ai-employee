# Inngest Function Cleanup — Deregister Non-Guest-Messaging Functions

## TL;DR

> **Quick Summary**: Comment out all Inngest function registrations except the 4 needed for guest-messaging and its learning pipeline. Clean up dead code (imports, unused variables) that results from the removal.
>
> **Deliverables**:
>
> - `serve.ts` with only 4 active functions: universal lifecycle, interaction handler, feedback summarizer, rule extractor
> - Dead code cleaned up: `prisma`, `slackClient`, `flyClient` instantiations + their imports
> - AGENTS.md updated to reflect deregistered functions
>
> **Estimated Effort**: Quick
> **Parallel Execution**: YES — 2 tasks in Wave 1
> **Critical Path**: T1 → T3 (build verify) → F1-F4

---

## Context

### Original Request

User sees deprecated engineering functions (`watchdog-cron`, `task-lifecycle`, `task-redispatch`) and the Papi Chulo summarizer trigger in Inngest and wants them removed. Only the guest-messaging employee and its learning/feedback pipeline should remain active.

### Interview Summary

**Key Discussions**:

- **Keep**: Universal lifecycle (guest-messaging runs through it), interaction handler, feedback summarizer, rule extractor
- **Remove**: All 3 engineering functions, summarizer trigger, learned-rules-expiry
- **Approach**: Comment out registrations (same pattern as `guestMessagePollFn` from previous plan)

### Metis Review

**Identified Gaps** (addressed):

- **Dead code**: Removing engineering functions makes `prisma`, `slackClient`, `flyClient` instantiations dead code — must comment out along with their imports
- **TypeScript build**: `noUnusedLocals` is NOT set in tsconfig, so unused vars won't break build — but cleanup is still required for code hygiene
- **AGENTS.md**: Documentation freshness rules require updating the Inngest functions list
- **Learned rules accumulation**: Without expiry cron, rules with `expires_at` won't auto-clean — documented as known trade-off
- **inngest-serve.test.ts**: Function count changes from 9→4 but test was already failing (expects 2) — pre-existing, do not fix

---

## Work Objectives

### Core Objective

Reduce the Inngest function surface to only the 4 functions needed for guest-messaging + learning, removing all deprecated and unused registrations.

### Concrete Deliverables

- Modified `src/gateway/inngest/serve.ts` — 4 active functions, dead code cleaned up
- Updated `AGENTS.md` — Inngest functions list reflects actual active functions

### Definition of Done

- [ ] `serve.ts` has exactly 4 active function registrations
- [ ] `serve.ts` has no dead code (unused imports, unused variables)
- [ ] `pnpm build` exits 0
- [ ] AGENTS.md Inngest functions list matches the 4 active functions
- [ ] All source files for deregistered functions still exist (not deleted)

### Must Have

- Only 4 functions registered: `employeeLifecycleFn`, `interactionHandlerFn`, `feedbackSummarizerFn`, `ruleExtractorFn`
- Dead code commented out: `prisma` instantiation, `slackClient` instantiation, `flyClient` construction, and all unused imports
- `guestMessagePollFn` remains commented out (already done from previous plan)
- AGENTS.md updated to list only the 4 active functions

### Must NOT Have (Guardrails)

- DO NOT delete any `.ts` source files — only comment out registrations in `serve.ts`
- DO NOT modify any source file other than `serve.ts` and `AGENTS.md`
- DO NOT fix or modify `inngest-serve.test.ts` (pre-existing failure)
- DO NOT update README.md — Summarizer remains a valid employee (manually triggerable)
- DO NOT touch `prisma/seed.ts` or any archetype DB records
- DO NOT modify `employeeLifecycleFn`, `interactionHandlerFn`, `feedbackSummarizerFn`, or `ruleExtractorFn`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: NO — this is a registration-only change; the existing `inngest-serve.test.ts` is pre-existing broken
- **Framework**: N/A

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Build**: Use Bash — `pnpm build`, exit code 0
- **Code**: Use Grep/Read — verify commented-out lines and active registrations

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent changes):
├── Task 1: Comment out 5 functions + dead code in serve.ts [quick]
└── Task 2: Update AGENTS.md Inngest functions list [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| T1    | —          | F1-F4  | 1     |
| T2    | —          | F1-F4  | 1     |
| F1-F4 | T1, T2     | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `quick`, T2 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Comment out 5 function registrations + dead code in `serve.ts`

  **What to do**:

  **Part A — Comment out 5 function imports** (lines 5-7, 9, 13):
  - Line 5: `import { createLifecycleFunction } from '../../inngest/lifecycle.js';`
  - Line 6: `import { createRedispatchFunction } from '../../inngest/redispatch.js';`
  - Line 7: `import { createWatchdogFunction } from '../../inngest/watchdog.js';`
  - Line 9: `import { createSummarizerTrigger } from '../../inngest/triggers/summarizer-trigger.js';`
  - Line 13: `import { createLearnedRulesExpiryTrigger } from '../../inngest/triggers/learned-rules-expiry.js';`

  **Part B — Comment out dead code imports** (line 16):
  - Line 16: `import { getMachine, destroyMachine, createMachine } from '../../lib/fly-client.js';`

  **Part C — Comment out dead code instantiations** (lines 21-27):
  - Line 21: `const prisma = new PrismaClient();`
  - Lines 22-25: `const slackClient = createSlackClient({...});`
  - Line 27: `const flyClient = { getMachine, destroyMachine, createMachine };`

  **Part D — Comment out 5 function instantiations** (lines 29-31, 33, 37):
  - Line 29: `const lifecycleFn = createLifecycleFunction(inngest, prisma, slackClient);`
  - Line 30: `const redispatchFn = createRedispatchFunction(inngest, prisma, slackClient);`
  - Line 31: `const watchdogFn = createWatchdogFunction(inngest, prisma, flyClient, slackClient);`
  - Line 33: `const summarizerTriggerFn = createSummarizerTrigger(inngest);`
  - Line 37: `const learnedRulesExpiryFn = createLearnedRulesExpiryTrigger(inngest);`

  **Part E — Comment out 5 function registrations in the functions array** (lines 43-45, 47, 51):
  - Line 43: `lifecycleFn,`
  - Line 44: `redispatchFn,`
  - Line 45: `watchdogFn,`
  - Line 47: `summarizerTriggerFn,`
  - Line 51: `learnedRulesExpiryFn,`

  **Part F — Comment out unused module imports** (lines 3, 15):
  - Line 3: `import { PrismaClient } from '@prisma/client';` — only used by `prisma` instantiation
  - Line 15: `import { createSlackClient } from '../../lib/slack-client.js';` — only used by `slackClient` instantiation

  **Add an explanatory comment block** before the commented-out section:

  ```
  // === DEREGISTERED FUNCTIONS ===
  // Only guest-messaging (universal lifecycle) and its learning pipeline remain active.
  // Engineering employee functions and summarizer trigger deregistered — source files preserved.
  ```

  **Must NOT do**:
  - DO NOT delete any source files
  - DO NOT remove the existing `guestMessagePollFn` comments (already commented out from previous plan)
  - DO NOT modify any of the 4 kept function lines
  - DO NOT touch any file other than `serve.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, mechanical comment-out operation following established pattern
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/gateway/inngest/serve.ts:14,38,52` — the `guestMessagePollFn` comment-out pattern is the EXACT template to follow for each function

  **Dead Code Analysis References**:
  - `src/gateway/inngest/serve.ts:3` — `PrismaClient` import only used at line 21 (being removed)
  - `src/gateway/inngest/serve.ts:15` — `createSlackClient` import only used at lines 22-25 (being removed)
  - `src/gateway/inngest/serve.ts:16` — `getMachine, destroyMachine, createMachine` imports only used at line 27 (being removed)
  - `src/gateway/inngest/serve.ts:21` — `prisma` only passed to lines 29, 30, 31 (all being removed)
  - `src/gateway/inngest/serve.ts:22-25` — `slackClient` only passed to lines 29, 30, 31 (all being removed)
  - `src/gateway/inngest/serve.ts:27` — `flyClient` only passed to line 31 (being removed)

  **Acceptance Criteria**:
  - [ ] Only 4 functions in the `functions: [...]` array: `employeeLifecycleFn`, `interactionHandlerFn`, `feedbackSummarizerFn`, `ruleExtractorFn`
  - [ ] All 5 deregistered function imports are commented out
  - [ ] All dead code (prisma, slackClient, flyClient, PrismaClient import, createSlackClient import, fly-client imports) is commented out
  - [ ] `pnpm build` exits 0
  - [ ] Explanatory comment block is present

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Only 4 functions registered
    Tool: Bash (grep)
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: grep -c '^\s\+[a-zA-Z].*Fn,' src/gateway/inngest/serve.ts
      2. Assert: count is 4 (employeeLifecycleFn, interactionHandlerFn, feedbackSummarizerFn, ruleExtractorFn)
    Expected Result: Exactly 4 active function registrations
    Failure Indicators: Count is not 4
    Evidence: .sisyphus/evidence/task-1-function-count.txt

  Scenario: No uncommented references to removed functions
    Tool: Bash (grep)
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: grep -v '^\s*//' src/gateway/inngest/serve.ts | grep -c -E '(lifecycleFn|redispatchFn|watchdogFn|summarizerTriggerFn|learnedRulesExpiryFn|guestMessagePollFn)'
      2. Assert: count is 0
    Expected Result: All removed functions are inside comments only
    Failure Indicators: Any active (uncommented) reference to a removed function
    Evidence: .sisyphus/evidence/task-1-no-active-refs.txt

  Scenario: No dead code - prisma, slackClient, flyClient
    Tool: Bash (grep)
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: grep -v '^\s*//' src/gateway/inngest/serve.ts | grep -c -E '(const prisma|const slackClient|const flyClient|PrismaClient|createSlackClient|getMachine)'
      2. Assert: count is 0
    Expected Result: All dead code is commented out
    Failure Indicators: Any active reference to dead code variables
    Evidence: .sisyphus/evidence/task-1-no-dead-code.txt

  Scenario: Build passes
    Tool: Bash
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: pnpm build 2>&1
      2. Assert: exit code 0
    Expected Result: TypeScript builds successfully with no errors
    Failure Indicators: Non-zero exit code, unused import/variable errors
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: Source files for deregistered functions still exist
    Tool: Bash (ls)
    Preconditions: serve.ts has been modified
    Steps:
      1. Run: ls src/inngest/lifecycle.ts src/inngest/redispatch.ts src/inngest/watchdog.ts src/inngest/triggers/summarizer-trigger.ts src/inngest/triggers/learned-rules-expiry.ts src/inngest/triggers/guest-message-poll.ts 2>&1
      2. Assert: all 6 files listed (no "No such file" errors)
    Expected Result: All source files preserved
    Failure Indicators: Any file missing
    Evidence: .sisyphus/evidence/task-1-files-exist.txt
  ```

  **Commit**: YES
  - Message: `chore(inngest): deregister engineering, summarizer, and expiry functions`
  - Files: `src/gateway/inngest/serve.ts`
  - Pre-commit: `pnpm build`

- [x] 2. Update AGENTS.md — Inngest functions list

  **What to do**:

  Update the **Inngest functions (active)** list in `AGENTS.md` to reflect the 4 remaining active functions. The current list shows 7 active + 3 deprecated. After this change:

  **Active (4)**:
  - `employee/universal-lifecycle` — universal employee lifecycle (all employees)
  - `employee/interaction-handler` — unified handler for thread replies and @mentions; classifies intent, stores feedback, responds in-thread
  - `employee/rule-extractor` — extracts behavioral rules from corrections/rejections; posts Slack confirmation cards for PM review; stores confirmed rules as `learned_rules`
  - `trigger/feedback-summarizer` — weekly cron that generates a digest of recent feedback using Claude Haiku

  **Deregistered (move to a "deregistered" sub-section or add note)**:
  - `trigger/daily-summarizer` — daily cron trigger for Papi Chulo (deregistered, source preserved)
  - `trigger/learned-rules-expiry` — cron maintenance for learned rules expiry (deregistered, source preserved)
  - `trigger/guest-message-poll` — polls Hostfully for unresponded messages (deregistered, source preserved)

  **Still deprecated (already in deprecated table)**:
  - `engineering/task-lifecycle`, `engineering/task-redispatch`, `engineering/watchdog-cron` — already listed in Deprecated Components table, now also deregistered from Inngest

  Also update the sentence "Three deprecated engineering functions (`engineering/task-lifecycle`, `engineering/task-redispatch`, `engineering/watchdog-cron`) remain registered but are on hold" to say they are now **deregistered** (not just on hold).

  **Known trade-off to document**: Add a note near `trigger/learned-rules-expiry` that rules with `expires_at` will not auto-clean. Manual cleanup: `DELETE FROM learned_rules WHERE expires_at < NOW();`

  **Must NOT do**:
  - DO NOT update README.md (Summarizer remains a valid employee)
  - DO NOT modify any section of AGENTS.md other than the Inngest functions list and the deprecated engineering functions sentence
  - DO NOT change any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Documentation update following existing patterns
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `AGENTS.md` — search for "Inngest functions (active)" to find the exact section to update
  - `AGENTS.md` — search for "Three deprecated engineering functions" to find the sentence to update

  **Acceptance Criteria**:
  - [ ] AGENTS.md lists exactly 4 active Inngest functions
  - [ ] Deregistered functions are noted as deregistered (not silently removed)
  - [ ] Engineering functions sentence updated from "remain registered" to "deregistered"
  - [ ] Known trade-off about learned rules expiry documented
  - [ ] No other sections of AGENTS.md modified

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: AGENTS.md lists 4 active functions
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been updated
    Steps:
      1. Run: grep -A1 'Inngest functions' AGENTS.md | head -20
      2. Visually confirm: exactly 4 active functions listed
    Expected Result: universal-lifecycle, interaction-handler, rule-extractor, feedback-summarizer
    Failure Indicators: More or fewer than 4 active functions
    Evidence: .sisyphus/evidence/task-2-agents-md.txt

  Scenario: Engineering functions noted as deregistered
    Tool: Bash (grep)
    Preconditions: AGENTS.md has been updated
    Steps:
      1. Run: grep -i 'deregistered' AGENTS.md
      2. Assert: at least 1 match mentioning engineering functions
    Expected Result: Engineering functions described as deregistered
    Failure Indicators: Still says "remain registered"
    Evidence: .sisyphus/evidence/task-2-deregistered.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): update Inngest functions list after deregistration`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep). For each "Must NOT Have": search for forbidden patterns — reject with file:line if found. Check evidence files exist.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint`. Review `serve.ts` for dead code, proper comment formatting. Verify no `as any`, unused imports, or AI slop.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Execute ALL QA scenarios from T1 and T2. Verify: exactly 4 functions in serve.ts array, no dead code, all source files exist, AGENTS.md updated. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read spec, read actual diff. Verify 1:1 match. Check "Must NOT do": no source files deleted, no README changes, no seed changes, no test fixes. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message                                                                    | Files                          | Pre-commit   |
| ------ | -------------------------------------------------------------------------- | ------------------------------ | ------------ |
| 1      | `chore(inngest): deregister engineering, summarizer, and expiry functions` | `src/gateway/inngest/serve.ts` | `pnpm build` |
| 2      | `docs(agents): update Inngest functions list after deregistration`         | `AGENTS.md`                    | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
# Only 4 functions registered
grep -c '^\s\+[a-zA-Z].*Fn,' src/gateway/inngest/serve.ts
# Expected: 4

# No active references to removed functions
grep -v '^\s*//' src/gateway/inngest/serve.ts | grep -E '(lifecycleFn|redispatchFn|watchdogFn|summarizerTriggerFn|learnedRulesExpiryFn)'
# Expected: no output

# Build passes
pnpm build
# Expected: exit 0

# Source files still exist
ls src/inngest/lifecycle.ts src/inngest/redispatch.ts src/inngest/watchdog.ts src/inngest/triggers/summarizer-trigger.ts src/inngest/triggers/learned-rules-expiry.ts
# Expected: all listed
```

### Known Trade-offs

- **Learned rules accumulation**: Without `learnedRulesExpiryFn`, rules with `expires_at` will not auto-clean. Manual cleanup: `DELETE FROM learned_rules WHERE expires_at < NOW();`
- **Summarizer trigger**: Papi Chulo can still be triggered manually via admin API (`POST /admin/tenants/:id/employees/daily-summarizer/trigger`), just not on the daily cron schedule.
- **inngest-serve.test.ts**: Pre-existing failure — function count changes from 9→4 but test expects 2. Still failing, different number. Do not fix.

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes
- [ ] AGENTS.md updated

---

## Notify Completion

- [x] **3. Notify completion** — Send Telegram notification: plan `inngest-function-cleanup` complete, all tasks done, come back to review results.
  ```bash
  npx tsx scripts/telegram-notify.ts "✅ inngest-function-cleanup complete — All tasks done. Come back to review results."
  ```
