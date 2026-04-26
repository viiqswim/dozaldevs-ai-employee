# Telegram Bot Notification Utility

## TL;DR

> **Quick Summary**: Add a Telegram Bot client to `src/lib/` that sends push notifications to a single developer's phone. Follows the existing `slack-client.ts` factory pattern exactly.
>
> **Deliverables**:
>
> - `src/lib/telegram-client.ts` — factory function client
> - `tests/lib/telegram-client.test.ts` — unit tests mirroring slack-client tests
> - `.env.example` + `.env` updated with Telegram credentials
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — 2 sequential tasks (foundation → tests)
> **Critical Path**: Task 1 (client + env) → Task 2 (tests) → Final Verification

---

## Context

### Original Request

User wants to receive a push notification on their phone when events happen in this repository (trigger TBD). Researched ntfy.sh, Pushover, Telegram Bot, IFTTT, and Pushbullet. Chose Telegram Bot because user already has Telegram on Android — zero new app installs.

### Setup Completed

- Bot created via @BotFather: `@ai_employee_notifier_bot`
- Bot token: `8431215961:AAHGk2OkQOccpMcxhrknLiJRhr9DdefnInE`
- Chat ID: `7918467208`
- Verified end-to-end: test notification received on phone

### Metis Review

**Identified Gaps** (addressed):

- Telegram returns HTTP 200 even for errors (`{"ok":false,...}`) — must check `data.ok`, not `response.ok` (same pattern as Slack client)
- `parse_mode` decision: plain text only (MarkdownV2 requires escaping special chars — hidden footgun)
- Missing env vars should be a silent no-op with warning log (not a hard failure) — allows CI/other devs to work without Telegram configured
- Error behavior: log and swallow for notification calls (notifications are low-value — should never crash the caller)
- Factory pattern vs standalone function: follow factory pattern from `slack-client.ts` for consistency

---

## Work Objectives

### Core Objective

Create a reusable Telegram Bot client utility that can send plain-text messages to a single developer's phone, following existing codebase patterns.

### Concrete Deliverables

- `src/lib/telegram-client.ts` — `createTelegramClient(config)` returning `TelegramClient` interface
- `tests/lib/telegram-client.test.ts` — unit tests with mocked `global.fetch`
- `.env.example` — new `# Telegram Notifications` section with placeholder values
- `.env` — real bot token and chat ID added

### Definition of Done

- [ ] `pnpm build` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test -- --run tests/lib/telegram-client.test.ts` — all tests pass
- [ ] `pnpm test -- --run` — total passing count ≥ baseline (no regression)

### Must Have

- Factory function pattern matching `src/lib/slack-client.ts`
- `ExternalApiError` for API errors (check `data.ok` on JSON body)
- `withRetry` with `maxAttempts: 2` for rate limit handling
- `RateLimitExceededError` for HTTP 429 responses
- Silent no-op when `TELEGRAM_BOT_TOKEN` is not set (log a warning, don't throw)
- Plain text messages only

### Must NOT Have (Guardrails)

- **NO** `parse_mode` / Markdown support — plain text only (MarkdownV2 escaping is a footgun)
- **NO** shell tool version (`src/worker-tools/telegram/`) — out of scope
- **NO** wiring into employee-lifecycle, triggers, or archetypes — trigger is TBD
- **NO** changes to `loadTenantEnv()` — not needed until trigger is defined
- **NO** npm packages — raw `fetch` only
- **NO** multi-chat support — single `TELEGRAM_CHAT_ID` only
- **NO** `sendPhoto`, `sendDocument`, or other Telegram API methods — `sendMessage` only
- **NO** JSDoc blocks beyond a single-line comment at the top

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — implementation first, then test file)
- **Framework**: Vitest (existing)

### QA Policy

Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (curl) to test real Telegram API + Bash (pnpm test) for unit tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential — foundation):
├── Task 1: Telegram client + env vars [quick]
└── Task 2: Unit tests (depends: Task 1) [quick]

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → F1-F4 → user okay
```

### Dependency Matrix

| Task | Depends On | Blocks   |
| ---- | ---------- | -------- |
| 1    | —          | 2, F1-F4 |
| 2    | 1          | F1-F4    |

### Agent Dispatch Summary

- **Wave 1**: 2 tasks — T1 → `quick`, T2 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create Telegram client and add env vars

  **What to do**:
  - Create `src/lib/telegram-client.ts` following the factory pattern from `slack-client.ts`
  - Export `TelegramClientConfig` interface: `{ botToken: string; chatId: string }`
  - Export `TelegramClient` interface with one method: `sendMessage(text: string): Promise<void>`
  - Export `createTelegramClient(config: TelegramClientConfig): TelegramClient` factory function
  - Inside `sendMessage`:
    - POST to `https://api.telegram.org/bot${config.botToken}/sendMessage` with JSON body `{ chat_id: config.chatId, text }`
    - Handle HTTP 429: throw `RateLimitExceededError` with `service: 'telegram'` (same pattern as slack-client lines 50-59)
    - Parse JSON response and check `data.ok` (NOT `response.ok`) — Telegram returns HTTP 200 even for errors
    - If `data.ok === false`: throw `ExternalApiError` with `service: 'telegram'`, `statusCode: 200`, `endpoint: '/bot/sendMessage'`, message including `data.description`
    - Wrap in `withRetry` with `maxAttempts: 2`, `baseDelayMs: 1000`, `retryOn: (err) => err instanceof RateLimitExceededError`
  - Add a convenience export: `sendTelegramNotification(text: string): Promise<void>` that reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `process.env`, logs a warning and returns early if either is missing, creates a client, and calls `sendMessage`. This is the fire-and-forget entrypoint for callers who don't need the factory
  - Add `# Telegram Notifications` section to `.env.example` at the bottom with:
    ```
    TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
    TELEGRAM_CHAT_ID="your-telegram-chat-id"
    ```
  - Add real values to `.env`:
    ```
    TELEGRAM_BOT_TOKEN="8431215961:AAHGk2OkQOccpMcxhrknLiJRhr9DdefnInE"
    TELEGRAM_CHAT_ID="7918467208"
    ```

  **Must NOT do**:
  - Do NOT add `parse_mode` parameter — plain text only
  - Do NOT add any methods besides `sendMessage`
  - Do NOT install any npm packages
  - Do NOT modify any file outside `src/lib/telegram-client.ts`, `.env.example`, `.env`
  - Do NOT add JSDoc blocks — one `/** Telegram Bot API client */` comment at top of file is sufficient

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation following an existing pattern — straightforward copy-and-adapt
  - **Skills**: `[]`
    - No specialized skills needed — this is a standard TypeScript utility file

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential — Task 2 depends on this)
  - **Blocks**: Task 2, F1-F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `src/lib/slack-client.ts:1-140` — **Primary pattern**. Follow this file's structure exactly: imports, config interface, client interface, factory function, error handling, retry wrapping. The Telegram client should look like a simplified version of this file.
  - `src/lib/slack-client.ts:8-11` — `SlackClientConfig` interface — model `TelegramClientConfig` after this (but with `botToken` + `chatId` instead of `botToken` + `defaultChannel`)
  - `src/lib/slack-client.ts:24-27` — `SlackClient` interface — model `TelegramClient` after this (but with only `sendMessage(text: string): Promise<void>`)
  - `src/lib/slack-client.ts:32-88` — `createSlackClient` factory + `postMessage` — adapt this structure for Telegram's API endpoint and response shape
  - `src/lib/slack-client.ts:50-59` — HTTP 429 rate limit handling — copy this pattern exactly
  - `src/lib/slack-client.ts:62-75` — `data.ok` check — **critical**: Telegram has the same API quirk as Slack (HTTP 200 with `ok: false`)

  **API/Type References** (contracts to implement against):
  - `src/lib/errors.ts:44-59` — `RateLimitExceededError` class — use for 429 responses with `service: 'telegram'`
  - `src/lib/errors.ts:64-76` — `ExternalApiError` class — use for `data.ok === false` responses with `service: 'telegram'`
  - `src/lib/retry.ts:34-57` — `withRetry` function — wrap the fetch call with `maxAttempts: 2` (lower than Slack's 3 — notifications are low-value)

  **External References**:
  - Telegram Bot API `sendMessage`: `https://core.telegram.org/bots/api#sendmessage` — POST to `https://api.telegram.org/bot<token>/sendMessage` with JSON body `{ chat_id, text }`. Response: `{ ok: boolean, result?: {...}, description?: string, error_code?: number }`

  **WHY Each Reference Matters**:
  - `slack-client.ts` is the 1:1 structural template — same factory pattern, same error types, same retry logic. The executor should open this file side-by-side and adapt it.
  - `errors.ts` defines the exact error classes to use — don't invent new ones.
  - `retry.ts` provides the retry wrapper — don't re-implement retry logic.
  - The Telegram API docs confirm the response shape and the `ok: false` quirk.

  **Acceptance Criteria**:
  - [ ] `src/lib/telegram-client.ts` exists and exports `createTelegramClient`, `TelegramClient`, `TelegramClientConfig`, `sendTelegramNotification`
  - [ ] `.env.example` contains `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in a `# Telegram Notifications` section
  - [ ] `.env` contains real bot token and chat ID values
  - [ ] `pnpm build` exits 0

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — send a real notification
    Tool: Bash (curl)
    Preconditions: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in .env
    Steps:
      1. Run: curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -H "Content-Type: application/json" -d '{"chat_id":"${TELEGRAM_CHAT_ID}","text":"QA Task 1: Telegram client created successfully"}'
      2. Parse the JSON response
      3. Assert: response contains "ok":true
    Expected Result: HTTP response with {"ok":true,...} and notification appears on phone
    Failure Indicators: Response contains "ok":false or curl returns non-zero exit
    Evidence: .sisyphus/evidence/task-1-real-send.json

  Scenario: Build succeeds with new file
    Tool: Bash
    Preconditions: src/lib/telegram-client.ts exists
    Steps:
      1. Run: pnpm build
      2. Assert: exit code 0
      3. Run: pnpm lint
      4. Assert: exit code 0
    Expected Result: Both commands exit 0 with no errors
    Failure Indicators: Non-zero exit code or TypeScript errors in output
    Evidence: .sisyphus/evidence/task-1-build-lint.txt

  Scenario: Missing env vars — silent no-op
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: TELEGRAM_BOT_TOKEN="" TELEGRAM_CHAT_ID="" node -e "const { sendTelegramNotification } = require('./dist/lib/telegram-client.js'); sendTelegramNotification('should be silent').then(() => console.log('OK: no throw')).catch(e => console.log('FAIL: threw', e.message))"
      2. Assert: output contains "OK: no throw"
    Expected Result: Function returns without throwing when env vars are missing
    Failure Indicators: Output contains "FAIL: threw"
    Evidence: .sisyphus/evidence/task-1-missing-env-noop.txt
  ```

  **Commit**: YES
  - Message: `feat(lib): add Telegram Bot notification client`
  - Files: `src/lib/telegram-client.ts`, `.env.example`
  - Pre-commit: `pnpm build && pnpm lint`

- [x] 2. Create unit tests for Telegram client

  **What to do**:
  - Create `tests/lib/telegram-client.test.ts` mirroring the structure of `tests/lib/slack-client.test.ts`
  - Mock `global.fetch` using `vi.fn()` (same pattern as slack-client tests)
  - Test cases to implement:
    1. `sendMessage succeeds with valid response` — mock fetch returning `{ ok: true, result: { message_id: 1 } }`, assert no throw
    2. `sends correct request to Telegram API` — verify fetch called with correct URL (`https://api.telegram.org/bot.../sendMessage`), correct headers (`Content-Type: application/json`), and correct body (`{ chat_id, text }`)
    3. `throws ExternalApiError when ok is false` — mock fetch returning HTTP 200 with `{ ok: false, error_code: 400, description: "Bad Request: chat not found" }`, assert `ExternalApiError` thrown with `service: 'telegram'`
    4. `retries on 429 rate limit and succeeds on second attempt` — mock first call returning 429, second returning success, use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` (same pattern as slack-client test lines 71-100)
    5. `RateLimitExceededError thrown after all retries exhausted` — mock all calls returning 429, assert `RateLimitExceededError` thrown
    6. `sendTelegramNotification is a silent no-op when env vars missing` — temporarily clear `process.env.TELEGRAM_BOT_TOKEN`, call `sendTelegramNotification`, assert fetch was NOT called, restore env var

  **Must NOT do**:
  - Do NOT test with real Telegram API (mock `global.fetch` only)
  - Do NOT add more test cases than listed above — 6 is sufficient
  - Do NOT modify any file besides `tests/lib/telegram-client.test.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test file creation following an existing test pattern — straightforward copy-and-adapt
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (after Task 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `tests/lib/slack-client.test.ts:1-190` — **Primary test pattern**. Follow this file's structure exactly: imports, config object, helper for success responses, describe block, beforeEach/afterEach, individual test cases. The Telegram test file should look like a simplified version.
  - `tests/lib/slack-client.test.ts:10-14` — `makeSlackSuccessResponse` helper — create an equivalent `makeTelegramSuccessResponse` returning `{ ok: true, result: { message_id: 1 } }`
  - `tests/lib/slack-client.test.ts:26-38` — Success test case pattern — adapt for Telegram (assert no throw instead of checking return value, since `sendMessage` returns `void`)
  - `tests/lib/slack-client.test.ts:40-56` — Header/URL verification pattern — adapt for Telegram URL and `Content-Type: application/json` header
  - `tests/lib/slack-client.test.ts:71-100` — Rate limit retry test with fake timers — copy this pattern, adjusting for `maxAttempts: 2` instead of 3
  - `tests/lib/slack-client.test.ts:102-124` — `RateLimitExceededError` assertion pattern
  - `tests/lib/slack-client.test.ts:126-152` — `ExternalApiError` assertion pattern — adapt for Telegram's error format (`description` field instead of `error`)

  **API/Type References**:
  - `src/lib/telegram-client.ts` — the implementation from Task 1 (imports, interface, factory)
  - `src/lib/errors.ts:44-59` — `RateLimitExceededError` — assert `instanceof` in rate limit tests
  - `src/lib/errors.ts:64-76` — `ExternalApiError` — assert `instanceof` and `service === 'telegram'` in error tests

  **WHY Each Reference Matters**:
  - `slack-client.test.ts` is the 1:1 structural template for tests. The executor should open it side-by-side.
  - Error class imports are needed for `instanceof` assertions.
  - The implementation file is needed to know the exact function signatures.

  **Acceptance Criteria**:
  - [ ] `tests/lib/telegram-client.test.ts` exists with 6 test cases
  - [ ] `pnpm test -- --run tests/lib/telegram-client.test.ts` → all 6 tests pass
  - [ ] `pnpm test -- --run` → total passing count ≥ baseline (no regression)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Happy path — all Telegram client tests pass
    Tool: Bash
    Preconditions: src/lib/telegram-client.ts and tests/lib/telegram-client.test.ts both exist
    Steps:
      1. Run: pnpm test -- --run tests/lib/telegram-client.test.ts
      2. Assert: output contains "6 passed" (or all test names shown as passing)
      3. Assert: exit code 0
    Expected Result: All 6 tests pass with exit code 0
    Failure Indicators: Any test shows as "failed" or exit code non-zero
    Evidence: .sisyphus/evidence/task-2-unit-tests.txt

  Scenario: No regression in full test suite
    Tool: Bash
    Preconditions: All implementation and test files in place
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tail -5
      2. Assert: passing count ≥ baseline (capture baseline before Task 1)
      3. Assert: no new failures introduced
    Expected Result: Full suite passes with same or higher count than baseline
    Failure Indicators: Passing count decreased or new failures appear
    Evidence: .sisyphus/evidence/task-2-full-suite.txt
  ```

  **Commit**: YES (amend previous or group)
  - Message: `feat(lib): add Telegram Bot notification client`
  - Files: `tests/lib/telegram-client.test.ts`
  - Pre-commit: `pnpm test -- --run && pnpm lint`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check exports, verify error types). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review `src/lib/telegram-client.ts` for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify it follows `slack-client.ts` patterns exactly. Check for AI slop: excessive comments, over-abstraction, generic names.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
      Import `createTelegramClient` from the built module. Create a client with the real env vars. Call `sendMessage("Final QA verification — plan complete")`. Verify the Telegram API returns `{"ok":true,...}`. Capture the response to `.sisyphus/evidence/final-qa/telegram-send.json`.
      Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag any file modifications outside `src/lib/telegram-client.ts`, `tests/lib/telegram-client.test.ts`, `.env.example`, `.env`.
      Output: `Tasks [N/N compliant] | Unaccounted [CLEAN/N files] | VERDICT`

- [ ] 3. Send Telegram notification — execution complete
     **What to do**: Run directly via Bash (no agent delegation):
  ```bash
  curl -s "https://api.telegram.org/bot8431215961:AAHGk2OkQOccpMcxhrknLiJRhr9DdefnInE/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"7918467208\",\"text\":\"✅ telegram-notifications complete: Telegram Bot notification utility added to src/lib/\n\nCome back to trigger the next step.\"}"
  ```
  **Commit**: NO.
  **Not part of Final Verification Wave** — runs after all F1-F4 reviewers APPROVE.

---

## Commit Strategy

| #   | Message                                           | Files                                                                             | Pre-commit                        |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| 1   | `feat(lib): add Telegram Bot notification client` | `src/lib/telegram-client.ts`, `tests/lib/telegram-client.test.ts`, `.env.example` | `pnpm test -- --run && pnpm lint` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                           # Expected: exit 0
pnpm lint                                            # Expected: exit 0
pnpm test -- --run tests/lib/telegram-client.test.ts  # Expected: all tests pass
pnpm test -- --run                                   # Expected: ≥ baseline passing count
grep -c "TELEGRAM_" .env.example                     # Expected: 2
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Real Telegram notification received on phone during QA
