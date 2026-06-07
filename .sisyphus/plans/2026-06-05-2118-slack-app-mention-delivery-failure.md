# Slack @mention Failure — Fix Phantom Socket Mode Connections + Classifier Silent No-Op

## TL;DR

> **Quick Summary**: A Slack `@mention` of the Papi chulo bot intermittently produces NO response. **Root cause is now DEFINITIVELY DIAGNOSED** (not speculated) using an independent raw Socket Mode probe + decrypted-token auth test on 2026-06-06. There are **TWO distinct, independent bugs**:
>
> 1. **Phantom Socket Mode connections (intermittent total silence).** An independent probe's `hello` frame reported `num_connections = 3` while only ONE local gateway leaf holds a Slack TLS connection (lsof-confirmed) — meaning a **stranded/phantom WebSocket** from an earlier unclean gateway death (`kill -9`/tmux-kill that never closed the WS) is still registered with Slack. Slack Socket Mode **round-robins** each event across ALL connected sockets, so ~1/N of `app_mention` events are delivered to the dead phantom and silently vanish. The local singleton lock (from the prior plan) cannot fix this — it prevents duplicate local _processes_, but cannot reclaim a WebSocket that _Slack_ still holds. This is the original intermittent failure (5:10/5:20 PM dropped, 5:51 PM worked).
> 2. **Classifier `unclear` silent no-op (deterministic drop for terse/ambiguous text).** When an @mention DOES reach the gateway, the LLM intent classifier (`interaction-classifier.ts`) can return an empty/non-matching string, which the code maps to `unclear` → the interaction handler does NOTHING (no `task.requested`, no card, no task) and the user gets silence. Proven live: a received mention logged `intent: ""` → `unclear` → `Interaction handled` with zero tasks created, even though the gateway had already posted its "On it — one moment…" ack.
>    **Auth was RULED OUT**: the decrypted DB `slack_bot_token` is byte-identical to the working `VLRE_SLACK_BOT_TOKEN` and passes `auth.test` (`ok:true`); the dead `SLACK_BOT_TOKEN` env var is a red herring (not used by the Socket Mode authorize path).
>
> **This plan fixes both**: (A) clean WebSocket shutdown + a startup Socket Mode connection-hygiene reconcile so phantom connections can't strand event delivery; (B) classifier robustness so an empty/ambiguous result retries and never silently no-ops (always replies to the user). Plus a small logging-observability fix (`LOG_LEVEL`) that made this diagnosis possible and keeps it debuggable. Verified by live browser @mention E2E proving a task reaches `Done`.

> **Deliverables**:
>
> - `src/lib/logger.ts` — `createLogger()` honors `LOG_LEVEL` (default `info`) so Bolt debug traffic is observable.
> - `src/gateway/server.ts` — ensure `boltApp.stop()` truly closes the SocketModeClient WebSocket on SIGINT/SIGTERM; add a startup log of `num_connections` (via the probe technique or receiver introspection) so phantom connections are visible; instrument receiver lifecycle.
> - `src/gateway/services/interaction-classifier.ts` — on empty/non-matching LLM result, retry once; never silently treat a clearly-actionable mention as a dead-end. Paired handler change so `unclear` posts a short clarifying reply instead of going silent.
> - `src/inngest/interaction-handler.ts` — `unclear` intent path posts a human "I didn't quite catch that — did you want me to run X?" reply (never silent).
> - `AGENTS.md` — Known Issue documenting the phantom-connection mechanism + the `LOG_LEVEL=debug` and Socket Mode probe diagnostics.
> - A documented **live browser @mention E2E**: message posted → `app_mention` received → confirmation card → Confirm → `tasks.status = Done`.
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — Wave 1 (3 file-disjoint fixes) → Wave 2 (handler reply wiring, depends on classifier) → Final (live E2E).
> **Critical Path**: Task 3 (classifier robustness) → Task 4 (handler reply) → Final live E2E; Task 2 (connection hygiene) is the intermittent-failure fix and runs in parallel.

---

## Context

### Original Request

User reported `@mention` of the Papi chulo bot in `#ops-cleaning-schedule` produced no response. A prior plan (slack-socket-singleton-fix) fixed a _local_ zombie-gateway issue but its F3(e) "live @mention PASS" was FALSE (it pattern-matched an unrelated Hostfully poll task). The user demanded the real root cause be found BEFORE writing a fix plan. This plan reflects a completed, evidence-backed diagnosis.

### What Was Verified (live, 2026-06-06 — Playwright + raw Socket Mode probe + DB)

**Admin-trigger path — BOTH employees PASS end-to-end (the lifecycle itself is healthy):**

- `real-estate-motivation-bot-2` (task `efea7d91`): `Received→…→Done`, `task_metrics.work_minutes=15`, real motivational message posted to `C0960S2Q8RL`.
- `cleaning-schedule` (task `6d70a586`, input `{date:2026-06-10}`): `Received→…→Done`, real Spanish cleaning schedule (8 properties, 3 cleaners) posted to `C0B71QSMZKQ`.

**@mention path — DUAL ROOT CAUSE proven:**

**Root Cause A — Phantom Socket Mode connection (intermittent silence):**

- Independent probe (`apps.connections.open` → raw `WebSocket`) `hello` frame: `num_connections = 3`.
- lsof: only ONE local gateway leaf (PID 72257) holds an ESTABLISHED TLS conn to Slack (`…->18.217.109.40:443`). Probe = 1, gateway = 1 → expected 2. Slack reports 3 → a **phantom** 3rd connection persists (re-confirmed after the probe closed: still 3).
- Slack Socket Mode round-robins events across all sockets → ~1/N of `app_mention` events go to the dead phantom and are lost. The local singleton lock cannot reclaim a WS that Slack holds. This is the intermittent original failure.

**Root Cause B — Classifier `unclear` silent no-op (deterministic drop):**

- In a probe-window test, Slack DID deliver the mention; the gateway DID receive it: logged `app_mention event received`, posted the `"On it — one moment…"` ack (probe captured the ack as a `message` event too).
- The chain then died at classification: `interaction-classifier` logged `intent: ""` → defaulted to `unclear` → `Interaction handled intent:unclear` → NO `task.requested`, NO card, NO task (0 new tasks confirmed in DB).
- Full natural-language requests (`puedes generarme el itinerario de limpieza para Junio 10, 2026?`) classified as `task` and worked earlier the same day; terse text (`Papi chulo itinerario limpieza Junio 14`) + an empty LLM response fell through to `unclear`.

### Auth Ruled Out (definitive)

- Decrypted the DB `slack_bot_token` inline (project AES-256-GCM; value never printed). md5 = `71b740fd…` = **identical** to `VLRE_SLACK_BOT_TOKEN`; `auth.test` = `ok:true` (VLRE/papichulo/`U096LNDCW1F`).
- `SLACK_BOT_TOKEN` env var is dead (`invalid_auth`) but is a **red herring** — Bolt's `authorize` uses `TenantInstallationStore.fetchInstallation` → `tenant_secrets.slack_bot_token` (DB), confirmed via `tenant_integrations` (`T06KFDGLHS6 → VLRE …003`).

### Diagnosability Gap (made diagnosis hard; fix keeps it debuggable)

- `src/lib/logger.ts:10-28` `createLogger()` passes no `level` → pino defaults to `info`; it ignores `LOG_LEVEL`. The Bolt global middleware that logs every raw payload (`handlers.ts:248`) is `log.debug` → suppressed.
- `src/gateway/slack-logger.ts:42-47` `createFilteredBoltLogger`: `setLevel()` is a **no-op**, `getLevel()` hardcodes `INFO` — Bolt cannot raise its own verbosity.

### Key Code Locations (verified)

- `src/gateway/server.ts:108-166` — Socket Mode branch: `App` ctor (110-125), `acquireSocketModeLock()` (127-134), `boltApp.start()` + receiver lifecycle listeners (136-153), `boltApp.error()` (155-164). Shutdown handlers `boltApp.stop()` at SIGTERM/SIGINT (≈314/324).
- `src/gateway/slack-logger.ts:24-51` — `createFilteredBoltLogger` (setLevel no-op).
- `src/gateway/slack/handlers.ts:314-328` — `app_mention` handler + unconditional info entry log; `:384-393` — the "On it — one moment…" ack.
- `src/gateway/services/interaction-classifier.ts:30-48` — LLM call + `validIntents.includes(intent) ? intent : 'unclear'` fallback (the silent-drop seam).
- `src/inngest/interaction-handler.ts` — `employee/interaction.received` handler; the `unclear` branch (currently a silent no-op for mentions).
- `src/lib/logger.ts:10-28` — `createLogger()` (no level config).
- Probe technique: `apps.connections.open` (POST, `SLACK_APP_TOKEN`) → `new WebSocket(url)` → read `hello.num_connections`; ack envelopes by echoing `envelope_id`.

---

## Work Objectives

### Core Objective

Make Slack `@mention` reliably create a task by (A) eliminating phantom Socket Mode connections that silently steal a fraction of events, and (B) making the intent classifier robust so an @mention never silently no-ops — proven by a live browser @mention reaching `Done`.

### Concrete Deliverables

- `LOG_LEVEL`-aware `createLogger()`.
- Clean WebSocket shutdown + startup connection-count visibility in `server.ts`.
- Classifier retry-on-empty + handler clarifying reply on `unclear`.
- AGENTS.md Known Issue + diagnostics.
- A documented live @mention → Confirm → `Done` E2E.

### Definition of Done

- [ ] After a clean gateway restart, an independent probe's `hello` reports `num_connections` consistent with exactly the live gateway(s) + the probe (no phantom). The gateway logs its observed connection count at startup.
- [ ] `boltApp.stop()` on SIGINT/SIGTERM closes the SocketModeClient WebSocket (verified: after a clean stop, the prior connection is gone from Slack's count).
- [ ] The classifier retries once on an empty/non-matching LLM result; a clearly-actionable mention (e.g. "generate the cleaning itinerary for June 14") classifies as `task`.
- [ ] An @mention that classifies as `unclear` posts a short human clarifying reply in-thread (never silent).
- [ ] `LOG_LEVEL=debug` surfaces the Bolt raw-payload middleware (`"raw payload received"`).
- [ ] Live browser @mention in `#ops-cleaning-schedule` → `app_mention event received` logs → confirmation card appears → Confirm → `tasks.status = Done`; task ID + `task_status_log` recorded.
- [ ] `pnpm build` clean; no NEW test failures vs the documented 31 pre-existing baseline.
- [ ] AGENTS.md updated (phantom-connection mechanism + `LOG_LEVEL=debug`/probe diagnostics).

### Must Have

- Fix BOTH root causes — phantom connections (A) AND classifier silent no-op (B). Fixing only one leaves the @mention path unreliable.
- Live browser @mention E2E (Playwright, real workspace) — "verified from code"/"unit tests pass" is explicitly insufficient (AGENTS.md Slack-trigger-workflow rule).
- `LOG_LEVEL` support without changing default (`info`).

### Must NOT Have (Guardrails)

- Do NOT revert or weaken the slack-socket-singleton-fix (lock, dev.ts reaper, `boltApp.stop()`). It is correct and complementary — extend, don't replace. Timeline proved it did NOT cause this bug.
- Do NOT rotate, print, or commit any Slack tokens. The dead `SLACK_BOT_TOKEN` env var is out of scope (red herring) — do NOT "fix" it as part of this plan (note it in AGENTS.md at most).
- Do NOT add an HTTP/polling fallback for `app_mention` — Socket Mode must work.
- Do NOT broaden the classifier to treat ALL mentions as `task` — only (i) retry empties and (ii) ensure `unclear` replies instead of going silent. Preserve `question`/`feedback`/`teaching` routing.
- Do NOT change channel→employee resolution (`resolveArchetypeFromChannel`; `C0B71QSMZKQ → cleaning-schedule` exact match is correct).
- Do NOT touch the working admin-trigger lifecycle or delivery path.
- Do NOT leave `LOG_LEVEL=debug` as a committed default.
- Do NOT commit `.playwright-mcp/` artifacts or browser session state. Do NOT touch deprecated engineering components or the 38 Reviewing-state zombies.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION for unit-level ACs** — agent-executed. The live @mention is performed by the executing agent via the Playwright MCP browser (already authenticated to the VLRE workspace as Victor Dozal), NOT by asking the user.

### Test Decision

- **Infrastructure exists**: YES (Vitest).
- **Automated tests**: Tests-after for `createLogger()` level + classifier retry/`unclear` behavior (pure, unit-testable with a mocked LLM). Connection hygiene + delivery verified by the Socket Mode probe + live browser E2E.
- **Framework**: Vitest for logger + classifier; Bash probe + Playwright MCP for live path.

### QA Policy

- **Logger**: Bash (vitest) — level honored.
- **Classifier**: Bash (vitest) — empty result retries; actionable text → `task`; non-matching → `unclear` (and handler replies).
- **Connection hygiene**: Bash — independent Socket Mode probe reads `num_connections` before/after a clean stop.
- **Live @mention E2E**: Playwright MCP + psql — post @mention, Confirm, assert `tasks.status=Done`.
- Evidence → `.sisyphus/evidence/app-mention-fix/`.

### Browser E2E Notes (from e2e-testing skill)

- Slack target: `https://app.slack.com/client/T06KFDGLHS6/C0B71QSMZKQ` (#ops-cleaning-schedule). The MCP browser is already logged in as Victor Dozal.
- **Mention-token gotcha (CRITICAL)**: Do NOT `fill()` the whole message — it wipes the mention token. Sequence that works: focus composer → press `@` → type `Papi chulo` slowly → press Enter (selects autocomplete) → type the rest slowly → press Enter to send. Use a **full natural-language request** (e.g. "generame el itinerario de limpieza para Junio 14, 2026") so it classifies as `task`.
- **Socket Mode probe (for connection-count checks)**: `apps.connections.open` (POST, `SLACK_APP_TOKEN`) → `new WebSocket(url)` → on `hello` read `num_connections` → echo `envelope_id` to ack. Run as inline `node -e` (Node 22 global `WebSocket`); no file needed.
- Pre-flight: `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` = 2 (supervisor+leaf); Inngest `curl localhost:8288/` = 200.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — file-disjoint fixes):
├── Task 1: createLogger() honors LOG_LEVEL [quick]
├── Task 2: Clean WS shutdown + startup connection-count visibility [deep]
└── Task 3: Classifier robustness — retry on empty, never silent [deep]

Wave 2 (After Wave 1 — handler reply wiring depends on classifier semantics):
└── Task 4: interaction-handler 'unclear' posts a clarifying reply (never silent) [deep]

Wave 3 (Docs + tests, parallel with Wave 2):
├── Task 5: Unit tests (logger level + classifier retry/unclear) [quick]
└── Task 6: AGENTS.md — phantom-connection + diagnostics [writing]

Wave FINAL (after fixes — verification + live E2E, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + build + tests (unspecified-high)
├── F3: LIVE browser @mention E2E → Confirm → Done + probe num_connections check (unspecified-high + e2e-testing)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay -> F5 cleanup
```

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `deep`, T3 → `deep`
- **Wave 2**: T4 → `deep`
- **Wave 3**: T5 → `quick`, T6 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+ `e2e-testing`), F4 → `deep`

---

## TODOs

- [x] 1. `createLogger()` honors `LOG_LEVEL` (observability enabler)

  **What to do** (`src/lib/logger.ts:10-28`):
  - Add `level: process.env.LOG_LEVEL ?? 'info'` to the pino options in `createLogger()`. Default stays `info`.
  - This surfaces the Bolt global middleware's raw-payload debug log (`handlers.ts:248`) under `LOG_LEVEL=debug`, keeping Socket Mode delivery debuggable.
  - Do NOT change redaction, serializers, or child binding.

  **Must NOT do**: Do NOT change the default. Do NOT add a logging dependency. Do NOT touch `taskLogger`/`logStep`/etc.

  **Recommended Agent Profile**: `quick`. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: None | Blocked By: None.

  **References**:
  - `src/lib/logger.ts:10-28` — factory to edit.
  - `src/gateway/server.ts:51` — existing `level: process.env.LOG_LEVEL ?? 'info'` pattern to mirror.
  - `src/gateway/slack-logger.ts:42-47` — Bolt logger setLevel no-op (context: why Bolt can't self-raise verbosity).
  - **WHY**: This is what enabled the root-cause diagnosis; keep it so the next person can run `LOG_LEVEL=debug`.

  **Acceptance Criteria**:

  ```
  Scenario: createLogger respects LOG_LEVEL
    Tool: Bash (vitest)
    Steps:
      1. LOG_LEVEL=debug → logger.level === 'debug'
      2. LOG_LEVEL unset → logger.level === 'info'
    Evidence: .sisyphus/evidence/app-mention-fix/task-1-logger-level.txt
  ```

  **Commit**: YES — `fix(logger): honor LOG_LEVEL env in createLogger for debug observability` (commit 1) — Pre-commit: `pnpm build`.

- [x] 2. Close Socket Mode WebSocket on shutdown + log connection count (ROOT CAUSE A)

  **What to do** (`src/gateway/server.ts:108-166` and the SIGINT/SIGTERM handlers ≈314/324):
  - **Verify and guarantee `boltApp.stop()` closes the SocketModeClient WebSocket.** Read how `boltApp.stop()` propagates to the `SocketModeReceiver`/`SocketModeClient`. If `stop()` does not reliably `disconnect()` the underlying WS, explicitly call the receiver's client `disconnect()` in the shutdown path BEFORE `process.exit`. The goal: a clean shutdown must leave ZERO lingering Slack-side connection. (Phantom connections arise from unclean deaths, but a guaranteed clean close minimizes the window and is the correct hygiene.)
  - **Add startup connection-count visibility.** After `boltApp.start()` resolves ("Socket Mode connected"), log the observed `num_connections`. Easiest reliable source: the SocketModeClient receives a `hello` frame containing `num_connections` — capture it via the receiver's client event/websocket message and log it at INFO (e.g. `"Socket Mode hello — num_connections=N"`). If N>1 at a fresh single-gateway startup, that is a phantom-connection warning. Do NOT crash on it — log a WARN with guidance.
  - Keep the existing lock acquisition, `start()` ordering, lifecycle listeners (141-149), and `boltApp.error()` intact.

  **Must NOT do**: Do NOT remove the singleton lock or the existing `boltApp.stop()` call — extend it. Do NOT add a polling fallback. Do NOT forcibly kill other connections via Slack admin APIs (none exists for Socket Mode; rely on clean close + Slack's stale-socket expiry). Do NOT change authorize.

  **Recommended Agent Profile**: `deep` — touches the live Socket Mode path; must not regress the singleton fix. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1, file-disjoint) | Blocks: None | Blocked By: None.

  **References**:
  - `src/gateway/server.ts:136-153` — `boltApp.start()` + receiver lifecycle listeners (`receiver.client` is accessed here already).
  - `src/gateway/server.ts` SIGINT/SIGTERM handlers (≈314/324) — where `boltApp.stop()` + `releaseSocketModeLock()` already run.
  - `@slack/socket-mode` `SocketModeClient` — `disconnect()` method + `hello` frame `num_connections` field.
  - Notepad `.sisyphus/notepads/2026-06-05-1826-slack-socket-singleton-fix/learnings.md` (2026-06-06 PROOF 2) — probe showed `num_connections=3` with one phantom.
  - **WHY**: Slack round-robins events across all connected sockets; a stranded phantom silently eats ~1/N of @mentions. Clean close + visibility is the correct mitigation the local lock can't provide.

  **Acceptance Criteria**:

  ```
  Scenario: Clean shutdown leaves no lingering Slack connection
    Tool: Bash (probe)
    Steps:
      1. Start gateway; run inline Socket Mode probe → record num_connections (N1)
      2. Cleanly stop the gateway (SIGINT); wait; run the probe again → record num_connections (N2)
      3. Assert N2 == (probe only) i.e. the gateway's connection is gone after clean stop
    Evidence: .sisyphus/evidence/app-mention-fix/task-2-clean-close.txt

  Scenario: Startup logs the connection count
    Tool: Bash
    Steps:
      1. Start gateway; grep log for "num_connections"
      2. Assert an INFO line reports the count at startup
    Evidence: .sisyphus/evidence/app-mention-fix/task-2-startup-count.txt
  ```

  **Commit**: YES — `fix(gateway): close Socket Mode WebSocket on shutdown + log connection count` (commit 2) — Pre-commit: `pnpm build`.

- [x] 3. Classifier robustness — retry on empty, never silently produce a dead-end (ROOT CAUSE B, part 1)

  **What to do** (`src/gateway/services/interaction-classifier.ts:30-48`):
  - When the LLM result is empty or does not match `validIntents`, **retry the classification once** (same prompt; the gateway model occasionally returns an empty string). Keep `temperature: 0`.
  - If both attempts fail to yield a valid intent, return `unclear` (unchanged) — but the HANDLER (Task 4) will now reply instead of going silent. Log the raw model output (truncated) at WARN when falling back so this is diagnosable.
  - Do NOT bias arbitrary text toward `task`. The fix is reliability (retry empties), not changing the taxonomy. The existing 5-category prompt stays.
  - Optional, only if trivially safe: strip surrounding punctuation/quotes from `result.content` before matching (some models wrap the word in quotes), which legitimately recovers a valid intent without changing semantics.

  **Must NOT do**: Do NOT loop more than one retry (no infinite loops, no cost blowups). Do NOT default `unclear`/`question` to `task`. Do NOT remove the injection boundary or change the category definitions.

  **Recommended Agent Profile**: `deep` — subtle correctness (retry + fallback semantics) with cost guardrails. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1, file-disjoint) | Blocks: 4 | Blocked By: None.

  **References**:
  - `src/gateway/services/interaction-classifier.ts:30-48` — the LLM call + `validIntents.includes(intent) ? intent : 'unclear'` seam.
  - Notepad PROOF 3 — live evidence of `intent: ""` → `unclear` → no task for terse text.
  - `src/lib/call-llm.ts` — `callLLM` signature/taskType (`review`).
  - **WHY**: An empty model response silently killed a real, actionable @mention. Retry recovers the common transient-empty case deterministically.

  **Acceptance Criteria**:

  ```
  Scenario: Empty first result retries and can succeed
    Tool: Bash (vitest, mocked callLLM)
    Steps:
      1. Mock callLLM: 1st call returns "", 2nd returns "task" → classifyIntent returns 'task'
      2. Assert callLLM invoked exactly twice
    Evidence: .sisyphus/evidence/app-mention-fix/task-3-retry.txt

  Scenario: Both empty → unclear (no infinite loop)
    Tool: Bash (vitest)
    Steps:
      1. Mock callLLM to always return "" → classifyIntent returns 'unclear'; callLLM invoked exactly twice
    Evidence: .sisyphus/evidence/app-mention-fix/task-3-fallback.txt

  Scenario: Actionable text classifies as task (real LLM smoke, optional)
    Tool: Bash
    Steps:
      1. Run classifier against "generame el itinerario de limpieza para Junio 14, 2026" → 'task'
    Evidence: .sisyphus/evidence/app-mention-fix/task-3-actionable.txt
  ```

  **Commit**: YES — `fix(slack): retry empty intent classification; never silently drop a mention` (commit 3) — Pre-commit: `pnpm build` + classifier test.

- [x] 4. `interaction-handler` `unclear` posts a clarifying reply (ROOT CAUSE B, part 2)

  **What to do** (`src/inngest/interaction-handler.ts` — the `employee/interaction.received` handler, `unclear` branch for `source: 'mention'`):
  - When intent is `unclear` for a mention, **post a short, human clarifying reply in-thread** instead of silently ending. Example tone (follow AGENTS.md Slack Voice & Tone): "I'm not totally sure what you'd like — did you want me to run _{role_name}_ (e.g. generate the cleaning schedule)? Just say the word." Include the standard trailing task/context block conventions where applicable.
  - Use the tenant bot token already loaded in the handler (the `send-acknowledgment` step shows `hasBotToken:true`). Reuse the existing Slack post utility/path — do NOT introduce a new Slack client.
  - Keep `question`/`feedback`/`teaching` routing unchanged. Only the `unclear` + mention path changes from silent-no-op to a reply.

  **Must NOT do**: Do NOT auto-create a task on `unclear` (that's why `unclear` exists). Do NOT spam — one reply per mention. Do NOT change the `task` path.

  **Recommended Agent Profile**: `deep` — must thread the existing token/Slack-post plumbing correctly without touching the task path. Skills: [].

  **Parallelization**: Can Run In Parallel: NO (Wave 2) | Blocks: None | Blocked By: 3.

  **References**:
  - `src/inngest/interaction-handler.ts` — `classify-intent` step + the post-classification routing (the `unclear` branch currently no-ops for mentions; `Interaction handled intent:unclear` log).
  - `src/gateway/services/interaction-classifier.ts` — produces the intent (Task 3).
  - AGENTS.md "Slack Voice & Tone" + "Slack Message Standards" — copy + trailing context block requirements.
  - `src/lib/slack-copy.ts` — centralize the clarifying-message copy as a named constant (per the "centralise copy" convention).
  - **WHY**: Silence is the worst UX — even when classification is genuinely ambiguous, the user must get a response so they can rephrase.

  **Acceptance Criteria**:

  ```
  Scenario: unclear mention triggers a clarifying reply (no task)
    Tool: Bash (vitest, mocked Slack post + inngest)
    Steps:
      1. Drive the handler with intent 'unclear', source 'mention'
      2. Assert a Slack post is attempted with the clarifying copy AND no employee/task.requested is emitted
    Evidence: .sisyphus/evidence/app-mention-fix/task-4-unclear-reply.txt

  Scenario: task mention still dispatches (no regression)
    Tool: Bash (vitest)
    Steps:
      1. Drive the handler with intent 'task' → employee/task.requested emitted; no clarifying reply
    Evidence: .sisyphus/evidence/app-mention-fix/task-4-task-path.txt
  ```

  **Commit**: YES — `fix(slack): reply with a clarification on unclear mentions instead of going silent` (commit 4) — Pre-commit: `pnpm build`.

- [x] 5. Unit tests — logger level + classifier retry/unclear

  **What to do**:
  - Logger test: assert `createLogger()` honors `LOG_LEVEL` (`debug` → `debug`; unset → `info`).
  - Classifier tests (mock `callLLM`): empty-then-valid → retries once, returns valid; always-empty → `unclear`, exactly two calls; valid first call → no retry.
  - Place tests under `tests/` root (project convention: new test files go under `tests/`, not `src/`).

  **Must NOT do**: No live Slack/LLM in unit tests. No reliance on real Socket Mode.

  **Recommended Agent Profile**: `quick`. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 3) | Blocks: F1-F4 | Blocked By: 1, 3.

  **References**:
  - `src/lib/logger.ts` (Task 1), `src/gateway/services/interaction-classifier.ts` (Task 3).
  - Existing test conventions under `tests/`.
  - **WHY**: The retry/fallback logic is the subtle correctness core; pin it deterministically.

  **Acceptance Criteria**:

  ```
  Scenario: New tests pass
    Tool: Bash (vitest)
    Steps:
      1. pnpm exec vitest run <logger test> <classifier test> 2>&1 | tail -8
      2. Assert 0 failures; >= 5 tests total
    Evidence: .sisyphus/evidence/app-mention-fix/task-5-tests.txt
  ```

  **Commit**: YES — `test(slack): cover LOG_LEVEL, classifier retry, and unclear-reply behavior` (commit 5) — Pre-commit: the new tests.

- [x] 6. AGENTS.md — phantom Socket Mode connections + diagnostics

  **What to do**:
  - Add/extend an AGENTS.md Known Issue: Slack `@mention` can intermittently produce no response due to **phantom Socket Mode connections** — Slack round-robins events across all registered sockets, and an unclean gateway death (`kill -9`/tmux-kill) strands a WebSocket Slack still routes ~1/N of events to. Note the local singleton lock cannot fix this; the mitigation is clean WS close on shutdown (Task 2) + always stopping `pnpm dev` with Ctrl+C.
  - Document the **diagnostics**: (1) `LOG_LEVEL=debug` to see Bolt raw payloads; (2) the inline Socket Mode probe to read `num_connections` (paste the short recipe). Note that `num_connections > (local gateways + your probe)` indicates a phantom.
  - Document the **classifier `unclear` behavior**: ambiguous/empty classification now retries once and replies with a clarification instead of going silent.
  - Optionally note the `SLACK_BOT_TOKEN` env var is unused for Socket Mode authorize (DB `slack_bot_token` is authoritative) so the dead env var doesn't mislead future debugging. Edit in place; no new files.

  **Must NOT do**: No new doc files. Do NOT claim the singleton fix caused this (timeline disproves it).

  **Recommended Agent Profile**: `writing`. Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 3) | Blocks: None | Blocked By: None.

  **References**:
  - `AGENTS.md` "### 4. Stale detached processes…" + "Slack Interactive Buttons — Socket Mode" + "Known Issues".
  - Notepad 2026-06-06 section (PROOFs 1-3 + probe recipe).
  - **WHY**: AGENTS.md Documentation Freshness rule — capture the failure mode + diagnostics so this is debuggable next time.

  **Acceptance Criteria**:

  ```
  Scenario: AGENTS.md documents the phantom-connection issue + diagnostics
    Tool: Bash
    Steps:
      1. grep AGENTS.md for "num_connections" / "phantom" and "LOG_LEVEL=debug"
    Evidence: .sisyphus/evidence/app-mention-fix/task-6-agents.txt
  ```

  **Commit**: YES — `docs(agents): document phantom Socket Mode connections + LOG_LEVEL/probe diagnostics` (commit 6) — Pre-commit: none.

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never check F1-F4 before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Verify each "Must Have": BOTH root causes fixed (phantom-connection hygiene in server.ts AND classifier no-silent-no-op); `createLogger` honors `LOG_LEVEL` (default `info`); live browser @mention E2E performed (not code-only). Verify each "Must NOT Have": singleton fix intact (lock/reaper/stop); no tokens printed/committed; `SLACK_BOT_TOKEN` env not "fixed" here; no app_mention HTTP/polling fallback; classifier still routes question/feedback/teaching; channel→employee resolution untouched; no `LOG_LEVEL=debug` committed; no `.playwright-mcp/` artifacts.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality + Build** — `unspecified-high`
      `pnpm build` + `pnpm exec eslint` on changed files + `pnpm exec vitest run` on the logger + classifier tests. Confirm no NEW failures vs the 31 pre-existing baseline (checkout-baseline method in the prior plan's notepad). Review for `as any`/`@ts-ignore`, swallowed errors, retry not introducing an infinite loop, logger default still `info`.
      Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Build [PASS/FAIL] | VERDICT`

- [x] F3. **LIVE Browser @mention E2E + connection-count check** — `unspecified-high` (+ `e2e-testing` skill)
      (a) Connection hygiene: clean-restart the gateway; run the Socket Mode probe and record `num_connections` — assert it equals (live gateway leaves + the probe) with NO phantom. (b) Pre-flight: single gateway (`pgrep` count = 2), Inngest 200, Socket Mode connected. (c) Via Playwright MCP, post a full natural-language `@Papi chulo` itinerary request (mention-token sequence). Assert: `"app_mention event received"` logs; intent classifies as `task` (not `unclear`); a confirmation card appears; click Confirm; `tasks.status` reaches `Done`. Record task ID, `task_status_log`, delivered Slack content. Evidence → `.sisyphus/evidence/app-mention-fix/`.
      Output: `No phantom [Y/N] | app_mention logged [Y/N] | intent=task [Y/N] | Card shown [Y/N] | Task Done [Y/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      `git diff --name-only` — confirm only in-scope files: `src/lib/logger.ts`, `src/gateway/server.ts`, `src/gateway/services/interaction-classifier.ts`, `src/inngest/interaction-handler.ts`, `AGENTS.md`, + test files. Confirm singleton-fix files not regressed (`socket-mode-lock.ts`, dev.ts reaper, server.ts lock/stop). Confirm channel→employee resolution, admin-trigger lifecycle, and delivery path untouched. No tokens in diffs, no `.playwright-mcp/`, no `LOG_LEVEL=debug` committed.
      Output: `Files [N/N in scope] | Singleton-fix intact [Y/N] | No tokens leaked [Y/N] | VERDICT`

- [x] F5. **Cleanup + docs freshness** — kill all `ai-*` tmux sessions created during execution; kill any stray Socket Mode probe processes; remove temp/scratch + `.playwright-mcp/` artifacts; `git status` clean (only intended files + plan/notepads). Confirm AGENTS.md updates landed. Commit plan + notepads per git cleanup rules. Send Telegram completion notice.

---

## Commit Strategy

| Commit | Message                                                                                | Files                                            |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1      | `fix(logger): honor LOG_LEVEL env in createLogger for debug observability`             | `src/lib/logger.ts`                              |
| 2      | `fix(gateway): close Socket Mode WebSocket on shutdown + log connection count`         | `src/gateway/server.ts`                          |
| 3      | `fix(slack): retry empty intent classification; never silently drop a mention`         | `src/gateway/services/interaction-classifier.ts` |
| 4      | `fix(slack): reply with a clarification on unclear mentions instead of going silent`   | `src/inngest/interaction-handler.ts`             |
| 5      | `test(slack): cover LOG_LEVEL, classifier retry, and unclear-reply behavior`           | test files                                       |
| 6      | `docs(agents): document phantom Socket Mode connections + LOG_LEVEL/probe diagnostics` | `AGENTS.md`                                      |

---

## Success Criteria

### Verification Commands

```bash
# Single local gateway
pgrep -f "$(pwd)/src/gateway/server.ts" | wc -l        # Expected: 2 (supervisor+leaf)

# No phantom: probe num_connections == live gateways + this probe (run inline node -e probe)
# Expected (after clean restart): 2 (gateway + probe), NOT 3+

# app_mention received + classified as task after the fix
grep "app_mention event received" /tmp/ai-dev.log       # Expected: > 0 for the test mention
grep '"intent":"task"' /tmp/ai-dev.log                   # Expected: > 0 (not "unclear")

# Debug visibility works
LOG_LEVEL=debug ... ; grep "raw payload received" /tmp/ai-dev.log   # Expected: > 0 under debug

# Build clean
pnpm build                                               # Expected: exit 0
```

### Final Checklist

- [x] Phantom Socket Mode connection eliminated (clean WS close on shutdown; startup count visible)
- [x] Classifier retries empties; `unclear` never silently no-ops (user gets a reply)
- [x] Live @mention → card → Confirm → `Done` proven in browser
- [x] `LOG_LEVEL` honored; AGENTS.md updated; singleton fix intact; no tokens leaked; build clean
