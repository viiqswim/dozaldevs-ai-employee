# Slack Per-Developer App Architecture (Slack CLI v3 `slack run`) + Prod Inngest-Key Hotfix

## TL;DR

> **Quick Summary**: The user's Slack @mentions drop ~50% of the time because **production (Render) and local `pnpm dev` both connect Socket Mode using the SAME `SLACK_APP_TOKEN`** — and Slack round-robins every event across all sockets of an app (per-app, not per-token; max 10). Empirically proven: each dropped @mention appears in PROD's runtime logs ~3s later as `slack-handlers` error `"We couldn't find an event key to use to send events to Inngest. Set the INNGEST_EVENT_KEY"` (prod's Inngest dispatch is broken), so prod silently eats them; the ~50% that land on local work. The "date vs no-date" pattern was coincidence (an identical no-date message also dropped; dropped messages never even got the pre-content "On it…" ack).
>
> **The fix (two tracks):**
>
> - **Track B (architecture, primary)**: Give each engineer their OWN Slack app so their local process is the sole socket on their app → zero round-robin. Automate via **Slack CLI v3 `slack run`**, orchestrated as a managed child of `pnpm dev`. Dev apps live in **Slack Developer Sandbox**. Gated on an early **go/no-go SPIKE** (does Sandbox support `xapp-`+Socket Mode? how does `slack run` inject the token into `process.env.SLACK_APP_TOKEN`? does it keep `dev.ts` clean-shutdown intact?). Includes the Metis-confirmed **sandbox-`teamId`→dev-tenant registration** deliverable (without it, the bot is silent in every sandbox).
> - **Track A (prod hotfix)**: Set the missing `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` on Render — **via the dashboard, never `PUT /env-vars`** (which would wipe all dashboard-set secrets). Gated on re-confirming the keys are genuinely absent at runtime.
>
> **Deliverables**:
>
> - Go/no-go SPIKE proving Sandbox Socket Mode + `slack run` token injection + clean `dev.ts` shutdown
> - `manifest.json` (dev app source-of-truth) committed; `.slack/` gitignored
> - `pnpm dev` orchestrates `slack run` as a managed child; token flows to the gateway
> - Sandbox-`teamId` → dev-tenant registration path (OAuth or seed script)
> - Onboarding runbook for new engineers (Developer Sandbox → app → DB registration → `pnpm dev`)
> - Prod Inngest keys set (dashboard) + prod @mention reaches `Done`
> - 20-trial probabilistic @mention proof (round-robin eliminated) + `num_connections==1` probe + cross-machine isolation proof
> - AGENTS.md / README / env docs updated
>
> **Estimated Effort**: Large (architecture + live prod + team onboarding)
> **Parallel Execution**: PARTIAL — Track A (prod) runs parallel to Track B Wave 1; Track B is SPIKE-gated then fans out.
> **Critical Path**: SPIKE (go/no-go) → token injection in dev.ts → sandbox tenant registration → 20-trial proof → onboarding runbook

---

## Context

### Original Request

User sent four `@Papi chulo generame el itinerario de limpieza` messages in #ops-cleaning-schedule; two "with a date (June 10)" got no response, two "without a date" did. User asked to investigate why some are dropped, and (follow-up) how to manage Slack dev across a growing engineering team (multiple engineers joining next week) without all fighting for one socket connection. User also asked to confirm what production actually does with the events.

### Investigation Findings (empirically proven, live forensics 2026-06-06)

- **Slack ground truth** (`conversations.replies`): the dropped messages got ZERO bot replies — not even the "On it — one moment…" ack posted at `handlers.ts:385` BEFORE any content logic. No ack ⇒ event never reached the handler ⇒ socket-layer routing, not content.
- **Disproves the date theory**: `...para Junio 12` (no "June 10", identical to an earlier message that succeeded) was ALSO dropped.
- **Prod ate them**: prod runtime logs show `slack-handlers` errors at 16:25:42, 16:26:19, 16:28:17, 16:31:15 — each ~3s after a dropped user message. Error (Inngest SDK stderr at `dist/gateway/slack/handlers.js:227`): `"Failed to send event ... We couldn't find an event key ... Set the INNGEST_EVENT_KEY environment variable"`.
- **Socket probe**: `num_connections: 3`, stable across 12s (prod + local + probe); prod `/health`=200; prod Socket Mode connected since 15:09 UTC. Prod was an active competing socket.
- **Mechanism**: Slack round-robins each event across ALL sockets of the app (official docs: per-APP, max 10; multiple tokens from same app do NOT create independent routing). ~50% → prod (drops, missing Inngest key), ~50% → local (works).

### Research Findings (Slack official docs + SDK maintainers + engineering teams)

- One Slack app per developer (+ shared `manifest.json`) is the industry-standard, Slack-official answer; scales to N engineers; eliminates round-robin by isolation.
- Slack CLI v3 `slack run` automates per-dev app instances (`.slack/apps.dev.json`, gitignored; app named "(local)"); manifest synced via `apps.manifest.update`.
- Slack Developer Sandbox (free, Developer Program) gives each engineer an isolated workspace.
- HTTP Events API + per-dev tunnel is Slack's recommended PROD mode; only solves multi-dev when combined with per-dev apps.
- Multiple Socket Mode connections from one app = HA only, NOT dev isolation.

### Metis Review (gaps addressed)

- **Contradiction resolved**: Metis flagged the debugging-guide note that dashboard-set Inngest keys don't appear in `GET /env-vars`. Verification of the RUNTIME error (SDK threw because `eventKey` empty) confirms the key is genuinely missing at runtime — diagnosis and skepticism reconciled. Track A is gated on re-confirming this before any Render write.
- **Blocker surfaced & confirmed**: `installation-store.ts:24-27` resolves tenant by `teamId`; a fresh Sandbox workspace's team ID maps to no tenant → bot silent. Added the sandbox-`teamId`→dev-tenant registration as a required deliverable.
- **Risk locked**: Render `PUT /env-vars` replaces ALL vars → would wipe dashboard-set secrets. Plan forbids `PUT` for these keys; use dashboard; snapshot/verify superset.
- **Proof hardened**: single-shot E2E is insufficient for a probabilistic bug → 20-trial uuid-tagged proof + `num_connections==1` + cross-machine isolation.

---

## Work Objectives

### Core Objective

Eliminate Slack Socket Mode round-robin contention between dev and prod (and across a growing team) by giving each engineer an isolated Slack app via Slack CLI v3 `slack run` (orchestrated by `pnpm dev`), and fix production's missing Inngest event key so prod stops silently dropping events — proven by a 20-trial probabilistic @mention test and a `num_connections==1` probe.

### Concrete Deliverables

- Go/no-go SPIKE report (Sandbox Socket Mode + `slack run` token injection + clean shutdown)
- `manifest.json` for the dev app, committed; `.slack/` gitignored
- `pnpm dev` orchestrating `slack run` as a managed child with token flowing to the gateway
- Sandbox-`teamId` → dev-tenant registration path (OAuth or seed)
- New-engineer onboarding runbook
- Prod `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` set via dashboard; prod @mention → `Done`
- AGENTS.md / README / `.env.example` updated

### Definition of Done

- [ ] SPIKE confirms (or refutes) Sandbox `xapp-`+Socket Mode, `slack run` token injection, and clean `dev.ts` shutdown; decision recorded
- [ ] Each engineer runs their own dev app; `num_connections` for their app == 1 (only their local gateway)
- [ ] 20/20 uuid-tagged @mentions in a dev sandbox produce "On it…" acks AND task rows (zero drops)
- [ ] With prod live, prod logs show ZERO receipt of the 20 dev test strings (cross-machine isolation)
- [ ] Ctrl+C on `pnpm dev` → `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` == 0 (no phantom)
- [ ] Prod Inngest keys confirmed-absent → set via dashboard → prod-workspace @mention → `tasks.status=Done`, no Inngest error in prod logs; full prod env-var key set is a superset of pre-change (no var lost)
- [ ] Onboarding runbook validated on a clean machine / second engineer → 20/20 with zero shared-secret edits
- [ ] `pnpm test -- --run` and `pnpm build` pass with no real Slack app present (CI Slack-less)
- [ ] AGENTS.md Known Issue #5 + README + `.env.example` updated

### Must Have

- Early go/no-go SPIKE gating Track B
- Sandbox-`teamId`→dev-tenant registration deliverable
- 20-trial probabilistic proof (single-shot is explicitly insufficient)
- Prod fix via dashboard only, gated on re-verification

### Must NOT Have (Guardrails)

- Do NOT use Render `PUT /env-vars` for the Inngest keys (wipes dashboard-set secrets) — use the dashboard; snapshot + verify superset if any API write is unavoidable
- Do NOT migrate the PROD Slack app to the CLI manifest — dev apps only; prod app stays Slack-UI-managed
- Do NOT modify `socket-mode-lock.ts`, the `dev.ts` single-instance guard (lines 243-254), or the Step-0 reaper (line 280) — EXCEPT extend the reaper pattern ONLY if the SPIKE proves `slack run` changes process parentage
- Do NOT alter the `tenant_secrets` schema or redesign `TenantInstallationStore` — register dev tenants using the existing store/repos
- Do NOT make CI use a real Slack app/token — CI must run Slack-less
- Do NOT commit `.slack/apps*.json` or any `xapp-`/`xoxb-`/`xoxp-` token; do NOT print tokens in logs/evidence
- Do NOT let a stale shared `SLACK_APP_TOKEN` in `.env` shadow the per-dev token (verify precedence)
- Do NOT touch the classifier, lifecycle, channel→employee resolution, or deprecated engineering components
- Do NOT accept "a single @mention worked" as proof of anything

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed (probe scripts, psql, prod log greps, Playwright MCP for live @mentions). The round-robin bug is probabilistic → proofs are multi-trial.

### Test Decision

- **Infrastructure exists**: YES (Vitest).
- **Automated tests**: Tests-after for any extracted pure logic (e.g. token-precedence resolution, dev-tenant registration helper). The authoritative checks are the live probe + 20-trial @mention E2E + prod verification.
- **Framework**: Vitest for helpers; Bash probe + psql + Playwright MCP for the live path.

### QA Policy

- **Round-robin proof**: 20 uuid-tagged @mentions → 20/20 acks + task rows (0.5^20 false-pass ≈ 1e-6).
- **Connection proof**: Socket Mode probe → `num_connections == 1`.
- **Isolation proof**: grep prod logs for the 20 unique strings → zero matches.
- **Shutdown proof**: post-Ctrl+C `pgrep` gateway leaf == 0.
- **Prod proof**: env-var superset before/after + prod @mention → Done.
- Evidence → `.sisyphus/evidence/slack-per-dev-app/`.

### Tooling Notes

- Socket Mode probe: Node 22 global `WebSocket` (do NOT `import 'ws'`); pass `SLACK_APP_TOKEN` via env; `apps.connections.open` → read `hello.num_connections` → ack `envelope_id`.
- Prod logs: `GET https://api.render.com/v1/logs?ownerId=tea-d1uscc3uibrs738pu040&resource=srv-d8f1b2gg4nts738dj7jg&limit=N[&text=...][&startTime=...&endTime=...]` (NOT the `/services/:id/logs` path — returns 404).
- Live @mention via Playwright MCP: focus composer → `@` → type bot name slowly → Enter (autocomplete) → type rest slowly → Enter. Never `fill()` (wipes mention token).

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (GATE — must pass before Track B fans out):
└── Task 1: Go/no-go SPIKE — Sandbox xapp-+Socket Mode, slack run token injection, clean dev.ts shutdown [deep]

Wave 1 (after SPIKE go; Track A runs fully parallel — independent of SPIKE):
├── Task 2: [Track A] Verify prod Inngest key genuinely absent, then set via Render dashboard [deep]
├── Task 3: manifest.json + .slack/ gitignore + .env precedence guard [unspecified-high]
├── Task 4: pnpm dev orchestrates `slack run` as managed child + token injection to gateway [deep]
└── Task 5: Sandbox-teamId → dev-tenant registration path (OAuth or seed) [deep]

Wave 2 (after Wave 1):
├── Task 6: New-engineer onboarding runbook (Sandbox → app → DB registration → pnpm dev) [writing]
├── Task 7: Unit tests — token precedence + dev-tenant registration helper [quick]
└── Task 8: AGENTS.md Known Issue #5 + README + .env.example updates [writing]

Wave FINAL (after all tasks — parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + build + tests (unspecified-high)
├── F3: Live proofs — 20-trial @mention + num_connections==1 + cross-machine isolation + clean shutdown + prod @mention→Done (unspecified-high + e2e-testing)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay -> F5 cleanup + Telegram

Critical Path: Task 1 (SPIKE) → Task 4 (token injection) → Task 5 (tenant registration) → F3 (20-trial proof)
Track A (Task 2) is independent — can complete anytime.
```

### Agent Dispatch Summary

- **Wave 0**: T1 → `deep`
- **Wave 1**: T2 → `deep`, T3 → `unspecified-high`, T4 → `deep`, T5 → `deep`
- **Wave 2**: T6 → `writing`, T7 → `quick`, T8 → `writing`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+ `e2e-testing`), F4 → `deep`

---

## TODOs

- [x] 1. Go/no-go SPIKE — Sandbox `xapp-`+Socket Mode, `slack run` token injection, clean `dev.ts` shutdown (GATE)

  **What to do**:
  - Install Slack CLI v3 (`slack` / `slack-cli`). Confirm version supports Bolt/TS apps and `slack run`.
  - **Gate (a) — Developer Sandbox supports Socket Mode**: create (or use) a Slack Developer Sandbox workspace; create a dev app from a minimal manifest; confirm you can generate an app-level (`xapp-`) token with `connections:write` and a bot token, and that Socket Mode connects. If Sandbox CANNOT produce `xapp-`/Socket Mode → STOP, record blocker, recommend fallback (HTTP Events API + per-dev tunnel, or per-dev app in existing workspace).
  - **Gate (b) — token injection**: determine exactly how `slack run` exposes the per-dev tokens to the launched process. Does it set `process.env.SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN` (the names `server.ts:108` and `dev.ts:337` read), or does it only write `.slack/apps.dev.json` expecting the SDK to read it? Record the precise mechanism and whether a shim is needed to map CLI tokens → the env names the gateway reads.
  - **Gate (c) — process ownership / clean shutdown**: prototype `pnpm dev` launching `slack run` (or `slack run` launching the gateway) for the gateway service ONLY (leave Docker/Inngest/tunnel/dashboard as-is). Determine whether `slack run` becomes the gateway's parent. Verify: Ctrl+C still tears everything down — `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` == 0 afterward, and a follow-up probe shows the socket released. If `slack run` changes process parentage such that the Step-0 reaper pattern (`dev.ts:280`) or group-kill (`dev.ts:154`) no longer matches, document the exact pattern change required.
  - Record all three findings + a clear GO / NO-GO recommendation in the notepad and `.sisyphus/evidence/slack-per-dev-app/task-1-spike.md`.

  **Must NOT do**: Do NOT refactor `dev.ts`'s Docker/Inngest/tunnel/dashboard orchestration in the spike. Do NOT modify `socket-mode-lock.ts` or the single-instance guard. Do NOT commit any token. Do NOT proceed to build Track B if any gate fails — escalate.

  **Recommended Agent Profile**: `deep` — open-ended integration investigation with go/no-go authority; correctness gates the whole architecture.
  - Skills: [`e2e-testing`] — Socket Mode probe + @mention verification patterns.

  **Parallelization**: Can Run In Parallel: NO (it is the gate) | Blocks: 3,4,5,6,7 | Blocked By: None.

  **References**:
  - `scripts/dev.ts:280` — Step-0 reaper pattern (`${repoRoot}.*src/gateway/server.ts`) the spike must not break.
  - `scripts/dev.ts:152-162` — `cleanup()` group-kill (SIGTERM to `-child.pid`).
  - `scripts/dev.ts:337` — `SLACK_APP_TOKEN` in REQUIRED_VARS.
  - `src/gateway/server.ts:108` — gateway reads `process.env.SLACK_APP_TOKEN`.
  - AGENTS.md Known Issue #5 — inline Socket Mode probe (`num_connections`).
  - Slack CLI docs: `slack run`, `collaborating-with-teammates` (`.slack/apps.dev.json` is per-dev, gitignored).
  - **WHY**: Three unproven assumptions (Sandbox Socket Mode, token-injection form, process ownership) determine whether the entire `slack run` approach is viable. Proving them first prevents building on sand.

  **Acceptance Criteria**:

  ```
  Scenario: Sandbox produces xapp- token and connects Socket Mode
    Tool: Bash (Socket Mode probe with the sandbox app token)
    Steps:
      1. Create sandbox app, get xapp- token
      2. Run probe → assert a `hello` frame is received (Socket Mode works)
    Expected: hello frame received; num_connections reported
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-1-sandbox-socket.txt

  Scenario: slack run token-injection mechanism identified
    Tool: Bash (inspect env of the launched process / .slack/apps.dev.json)
    Steps:
      1. Run `slack run` against a trivial app; capture how SLACK_APP_TOKEN reaches the process
    Expected: documented mechanism (env name or shim needed)
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-1-token-injection.txt

  Scenario: clean shutdown preserved
    Tool: Bash (interactive_bash / tmux)
    Steps:
      1. Launch the prototyped pnpm dev + slack run; Ctrl+C
      2. Assert pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l == 0
    Expected: 0 (no phantom)
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-1-shutdown.txt
  ```

  **Commit**: YES — `docs(slack): record per-dev-app SPIKE findings` (commit 1) — Pre-commit: none (notepad/docs only).

- [x] 2. [Track A] Verify prod Inngest key genuinely absent, then set via Render dashboard (PROD HOTFIX)

  **What to do**:
  - **Re-verify (gate)**: capture the live prod runtime error for a fresh event — confirm it is the Inngest `eventKey` error (`dist/gateway/slack/handlers.js:227`: "We couldn't find an event key ... Set the INNGEST_EVENT_KEY"), NOT an `authorize`/tenant error. This is RUNTIME proof the key is missing (do NOT rely on `GET /env-vars`, which omits dashboard-set keys per the debugging guide).
  - **Snapshot**: record the COMPLETE current prod env-var key set from the Render DASHBOARD (not `GET /env-vars`), so we can prove no var is lost.
  - **Set the keys via the Render DASHBOARD** (NOT `PUT /env-vars`): add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (obtain from Inngest Cloud → the prod environment's Event Key + Signing Key). If a programmatic write is unavoidable, reconstruct the FULL var list from the dashboard first and verify post ⊇ pre.
  - **Verify**: after redeploy, trigger a real prod-workspace @mention → assert `tasks.status` reaches `Done` (prod DB) and prod logs show NO Inngest `eventKey` error for that event. Confirm prod env-var key set is a superset of the pre-change snapshot.

  **Must NOT do**: Do NOT use Render `PUT /env-vars` to add these keys (it replaces ALL vars → wipes dashboard-set SUPABASE*\*/INNGEST*\*). Do NOT print the key values in logs/evidence (mask them). Do NOT change any other prod env var. Do NOT migrate the prod Slack app.

  **Recommended Agent Profile**: `deep` — live production change with a destructive-API footgun; requires careful verification gating.
  - Skills: [] (Render API + Inngest knowledge from AGENTS.md is sufficient).

  **Parallelization**: Can Run In Parallel: YES (independent of SPIKE/Track B) | Blocks: None | Blocked By: None.

  **References**:
  - `docs/guides/2026-06-01-2246-production-debugging-guide.md:88,226-230` — dashboard-set keys absent from `GET /env-vars`; the exact mistake to avoid.
  - AGENTS.md § Render API — `PUT /env-vars` replaces ALL (footgun); dashboard for these keys.
  - Prod service: `srv-d8f1b2gg4nts738dj7jg`; logs API `https://api.render.com/v1/logs?ownerId=tea-d1uscc3uibrs738pu040&resource=srv-d8f1b2gg4nts738dj7jg`.
  - `dist/gateway/slack/handlers.js:227` (`src/gateway/slack/handlers.ts`) — where prod throws the Inngest error.
  - **WHY**: Prod silently drops every Slack event it receives (and ~50% of dev's @mentions round-robin to it). Fixing prod's Inngest key both restores prod's own triggering and stops prod from being a black hole for round-robined dev events. The dashboard-vs-PUT distinction prevents wiping prod secrets.

  **Acceptance Criteria**:

  ```
  Scenario: Key genuinely absent confirmed before any write
    Tool: Bash (Render logs API)
    Steps:
      1. Capture a fresh prod Inngest eventKey error for a real event
    Expected: error present (gate to proceed); if absent → STOP, real cause is elsewhere
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-2-prefix-error.txt

  Scenario: Keys set without losing any var; prod @mention reaches Done
    Tool: Bash (Render dashboard snapshot + prod DB + logs) + Playwright MCP (prod-workspace @mention)
    Steps:
      1. Snapshot full prod env-var key set (dashboard)
      2. Add INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY via dashboard; redeploy
      3. Re-snapshot → assert superset (no var lost)
      4. Trigger a prod-workspace @mention → assert prod tasks.status=Done, no Inngest error in prod logs
    Expected: superset true; task Done; no eventKey error
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-2-prod-fixed.txt
  ```

  **Commit**: NO source change if dashboard-only — record the change + verification in the runbook/notepad (folded into commit 7). If any config file changes, commit `fix(prod): set INNGEST_EVENT_KEY/SIGNING_KEY on Render (stop silent event drops)` (commit 2).

- [x] 3. `manifest.json` (dev app source-of-truth) + `.slack/` gitignore + `.env` precedence guard

  **What to do**:
  - Export the current (prod) Slack app's manifest from api.slack.com → App Manifest → and commit a `manifest.json` at the repo root (or `.slack/`-adjacent per SPIKE's recommended layout) as the SOURCE-OF-TRUTH for DEV apps. Scrub any env-specific URLs/IDs; parameterize where needed. (Do NOT alter the prod app via this file.)
  - Add `.slack/` and `.slack/apps*.json` to `.gitignore` (per-dev tokens live there). Verify with `git check-ignore .slack/apps.dev.json`.
  - **`.env` precedence guard**: ensure a stale shared `SLACK_APP_TOKEN` in `.env` cannot shadow the per-dev token. `dev.ts:105` does not overwrite an already-set env var — decide and implement the correct precedence (e.g. when `slack run` is active, the per-dev token must win; or remove the shared token from `.env` and document it). Add a startup check/warning in `dev.ts` if a shared/prod-looking `SLACK_APP_TOKEN` is detected alongside per-dev mode.
  - Update `.env.example`: mark `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN` as per-dev (managed by `slack run`), with a note that the shared/prod token must NOT be used locally.

  **Must NOT do**: Do NOT commit any real token. Do NOT modify the prod app config. Do NOT remove `SLACK_APP_TOKEN` from `dev.ts` REQUIRED_VARS without confirming `slack run` supplies it (depends on SPIKE finding).

  **Recommended Agent Profile**: `unspecified-high` — config + gitignore + precedence logic; touches the security-sensitive token path.
  - Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1) | Blocks: 6 | Blocked By: 1 (SPIKE layout decision).

  **References**:
  - `scripts/dev.ts:102-109` — `.env` loading (won't overwrite already-set vars).
  - `scripts/dev.ts:337` — `SLACK_APP_TOKEN` REQUIRED_VARS.
  - README § Environment File Conventions — `.env`/`.env.example` sync rules + Slack section order.
  - GitHub two-App precedent: `docs/guides/2026-06-02-1727-github-integration.md` § Multi-Environment.
  - **WHY**: The manifest makes per-dev apps reproducible; gitignoring `.slack/` prevents committing live tokens; the precedence guard prevents the shared token silently resurfacing and recreating the round-robin.

  **Acceptance Criteria**:

  ```
  Scenario: .slack tokens are gitignored
    Tool: Bash
    Steps:
      1. git check-ignore .slack/apps.dev.json
    Expected: path is ignored (exit 0, prints the path)
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-3-gitignore.txt

  Scenario: shared SLACK_APP_TOKEN cannot shadow per-dev token
    Tool: Bash (vitest or a dev.ts dry-run)
    Steps:
      1. With a stale .env SLACK_APP_TOKEN present + per-dev mode, assert per-dev token wins (or dev.ts warns/aborts)
    Expected: per-dev token used, or explicit warning
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-3-precedence.txt
  ```

  **Commit**: YES — `chore(slack): add dev app manifest + gitignore .slack tokens` (commit 3) — Pre-commit: `git check-ignore` passes; no token in diff.

- [x] 4. `pnpm dev` orchestrates `slack run` as a managed child + token injection to the gateway

  **What to do** (`scripts/dev.ts`):
  - Implement the SPIKE-chosen integration: add `slack run` (or its token-providing invocation) as a managed child process in `dev.ts`, following the existing pattern for spawned services (Docker/Inngest/tunnel/gateway/dashboard). Ensure the per-dev `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN` reach the gateway process via `process.env` (apply the shim from SPIKE if `slack run` only writes `.slack/apps.dev.json`).
  - Wire the new child into the existing lifecycle: it must be torn down in `cleanup()` (SIGINT/SIGTERM) exactly like other children, and reaped by Step 0 on next start. If the SPIKE proved `slack run` changes the gateway's process parentage, extend the Step-0 reaper pattern (`dev.ts:280`) MINIMALLY to match — and ONLY then.
  - Preserve the prior phantom-prevention work: the single-instance guard (243-254), grace-wait kill, and clean-shutdown behavior must all still hold. After Ctrl+C, the gateway leaf must be gone (`pgrep ... | wc -l` == 0).
  - Keep Docker/Inngest/tunnel/dashboard orchestration unchanged.

  **Must NOT do**: Do NOT modify `socket-mode-lock.ts`. Do NOT weaken/replace the single-instance guard or grace-wait. Do NOT refactor the other service spawns. Do NOT hardcode any token. Do NOT change kill patterns except the minimal Step-0 reaper extension justified by the SPIKE.

  **Recommended Agent Profile**: `deep` — process orchestration + lifecycle correctness; a mistake reintroduces the phantom-socket bug.
  - Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1, after SPIKE) | Blocks: 6, F3 | Blocked By: 1.

  **References**:
  - `scripts/dev.ts` — service-spawn pattern, `cleanup()` (152-162), Step-0 reaper (280), single-instance guard (243-254), grace-wait `killAndWait` (from prior plan).
  - `src/gateway/server.ts:108` — gateway reads `process.env.SLACK_APP_TOKEN`.
  - Task 1 SPIKE findings (token-injection mechanism + process-ownership decision).
  - **WHY**: This is the operational heart of the fix — `pnpm dev` driving `slack run` so each engineer's local gateway connects to THEIR OWN app, ending round-robin, without regressing the phantom-prevention hardening.

  **Acceptance Criteria**:

  ```
  Scenario: pnpm dev launches slack run; gateway connects with per-dev token
    Tool: interactive_bash (tmux) + Socket Mode probe
    Steps:
      1. pnpm dev; confirm gateway logs Socket Mode connected
      2. Probe with the per-dev app token → num_connections == 1
    Expected: connected; num_connections == 1
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-4-connect.txt

  Scenario: clean shutdown preserved (no phantom)
    Tool: interactive_bash (tmux)
    Steps:
      1. Ctrl+C the dev stack
      2. pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l
    Expected: 0
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-4-shutdown.txt
  ```

  **Commit**: YES — `feat(dev): orchestrate slack run as managed child; inject per-dev Slack token` (commit 4) — Pre-commit: `pnpm build`.

- [x] 5. Sandbox-`teamId` → dev-tenant registration path (the Metis-confirmed blocker)

  **What to do**:
  - Provide a way for each engineer to register their Developer Sandbox workspace's `teamId` as a dev tenant so `fetchInstallation` resolves. `installation-store.ts:24-27` looks up `slack_integrations.external_id == teamId` then `tenant_secrets.slack_bot_token`. Without a matching row, every @mention throws `"No installation for team: <teamId>"` and the bot is silent.
  - Choose the lower-friction path (confirm in SPIKE/with existing OAuth route):
    - **Option A (OAuth)**: reuse the existing Slack OAuth install flow (`src/gateway/routes/slack-oauth.ts`) — engineer installs their sandbox app via OAuth, which writes `slack_integrations(provider='slack', external_id=teamId, tenant_id=<dev tenant>)` + `tenant_secrets(slack_bot_token)`. Confirm the OAuth callback maps to a DEV tenant.
    - **Option B (seed script)**: add `scripts/register-dev-slack-tenant.ts` that, given a sandbox `teamId` + bot token + a (new or existing) dev tenant, writes the `slack_integrations` row + `tenant_secrets.slack_bot_token` using the EXISTING repos (`TenantIntegrationRepository`, `TenantSecretRepository`) — soft-delete aware, multi-tenant scoped.
  - Wire the dev tenant to a test archetype/channel so @mentions in the sandbox resolve to an employee (so the 20-trial proof can create tasks). Reuse `real-estate-motivation-bot-2` or the cleaning archetype mapping as appropriate; document the channel→employee mapping for the sandbox.
  - Verify the FULL path: Socket Mode connects (app token) AND `authorize`/`fetchInstallation` succeeds (bot token resolved by teamId) AND an @mention creates a task.

  **Must NOT do**: Do NOT alter the `tenant_secrets` schema or redesign `TenantInstallationStore`. Do NOT hard-delete anything (soft-delete only). Do NOT cross-wire a dev sandbox to a PROD tenant. Do NOT commit any bot token.

  **Recommended Agent Profile**: `deep` — multi-tenant data path + auth resolution; getting it half-configured (socket connects but authorize fails) is the classic trap.
  - Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 1, after SPIKE) | Blocks: 6, F3 | Blocked By: 1.

  **References**:
  - `src/gateway/slack/installation-store.ts:17-48` — `fetchInstallation` teamId→tenant→bot-token resolution (the exact failure point).
  - `src/gateway/routes/slack-oauth.ts` — existing OAuth install flow writing `slack_integrations` + `tenant_secrets`.
  - `src/gateway/services/tenant-integration-repository.ts`, `tenant-secret-repository.ts` — repos to reuse.
  - `prisma/seed.ts` — tenant + archetype + channel mapping patterns; `real-estate-motivation-bot-2` (VLRE) as a simple test employee.
  - AGENTS.md § Tenants + Multi-tenancy mandatory.
  - **WHY**: Per-dev Socket Mode is useless if the gateway can't resolve the sandbox's teamId to a tenant + bot token. This is the deliverable that makes the bot actually respond in a dev sandbox.

  **Acceptance Criteria**:

  ```
  Scenario: sandbox teamId resolves; @mention creates a task
    Tool: Bash (psql) + Playwright MCP (@mention in sandbox)
    Steps:
      1. Register sandbox teamId → dev tenant + slack_bot_token (OAuth or seed)
      2. psql: assert slack_integrations(external_id=teamId) + tenant_secrets(slack_bot_token) exist for the dev tenant
      3. @mention the bot in the sandbox → assert a tasks row is created (no "No installation for team" error in gateway log)
    Expected: rows exist; task created; no authorize error
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-5-tenant-registration.txt
  ```

  **Commit**: YES — `feat(slack): register dev-sandbox team as dev tenant for Socket Mode auth` (commit 5) — Pre-commit: `pnpm build` + any new helper tests.

- [x] 6. New-engineer onboarding runbook

  **What to do**:
  - Write a step-by-step runbook (`docs/guides/{timestamp}-slack-per-dev-app-onboarding.md`) covering the EXACT sequence a new engineer follows: install Slack CLI v3 → `slack login` → create/join a Developer Sandbox workspace → create their dev app from `manifest.json` → obtain `xapp-`/`xoxb-` tokens → register their sandbox `teamId` as a dev tenant (Task 5 path) → `pnpm dev` (which drives `slack run`) → verify with the Socket Mode probe (`num_connections == 1`) and one @mention.
  - Include troubleshooting: "No installation for team" → tenant not registered; bot silent + no ack → check `num_connections` (phantom/shared token); stale `.env` token shadowing.
  - Add the runbook to README Documentation table + AGENTS.md Reference Documents (handled in Task 8).
  - Filename: run `date "+%Y-%m-%d-%H%M"` first.

  **Must NOT do**: Do NOT include any real token in the runbook. Do NOT document the prod app token for local use.

  **Recommended Agent Profile**: `writing` — clear, sequential developer documentation.
  - Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 2) | Blocks: None | Blocked By: 1,3,4,5.

  **References**:
  - Task 1 SPIKE findings; Task 4 `dev.ts` integration; Task 5 tenant registration.
  - `docs/guides/2026-06-02-1727-github-integration.md` § Multi-Environment — analogous per-env onboarding tone.
  - README § Docs Directory Structure + naming convention.
  - **WHY**: The actual artifact the growing team needs next week — a repeatable, no-tribal-knowledge path to a working local Slack dev environment.

  **Acceptance Criteria**:

  ```
  Scenario: runbook is complete and self-contained
    Tool: Bash (grep the runbook for each required step)
    Steps:
      1. grep for: slack login, Developer Sandbox, manifest, register dev tenant, pnpm dev, num_connections probe, troubleshooting
    Expected: all steps present
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-6-runbook.txt
  ```

  **Commit**: YES — folded into commit 7 (`docs(agents): ...`) or its own `docs(slack): per-dev app onboarding runbook` — Pre-commit: none.

- [x] 7. Unit tests — token precedence + dev-tenant registration helper

  **What to do**:
  - Test the `.env` precedence logic from Task 3: given a stale shared `SLACK_APP_TOKEN` + a per-dev token, the per-dev token wins (or the guard warns/aborts). Inject env, no real process spawn.
  - Test the dev-tenant registration helper from Task 5 (if Option B seed script): given a `teamId` + bot token + dev tenant, it writes the `slack_integrations` + `tenant_secrets` rows via the repos (mock the repos / use the test DB), is idempotent on re-run, and is soft-delete aware.
  - Place tests under `tests/` root (project convention). Mock all shell/DB seams; no real Slack.

  **Must NOT do**: No real `slack run`/Slack API in tests. No real prod DB. No committed tokens.

  **Recommended Agent Profile**: `quick` — focused unit tests with injected seams.
  - Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 2) | Blocks: F1-F4 | Blocked By: 3,5.

  **References**:
  - Task 3 precedence logic; Task 5 registration helper.
  - Existing test conventions under `tests/`.
  - **WHY**: Pin the two security-/correctness-sensitive behaviors (token precedence; tenant registration) deterministically so they can't silently regress.

  **Acceptance Criteria**:

  ```
  Scenario: new helper tests pass
    Tool: Bash (vitest)
    Steps:
      1. pnpm exec vitest run <new test files> 2>&1 | tail -8
      2. Assert 0 failures; tests cover precedence + registration idempotency
    Expected: pass
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-7-tests.txt
  ```

  **Commit**: YES — `test(slack): cover token precedence and dev-tenant registration` (commit 6) — Pre-commit: the new tests.

- [x] 8. AGENTS.md Known Issue #5 + README + `.env.example` updates

  **What to do**:
  - **AGENTS.md Known Issue #5**: add the now-confirmed dev/prod shared-token round-robin as the PRIMARY trigger (prod + local share `SLACK_APP_TOKEN`; Slack round-robins per-app; prod drops its share due to missing Inngest key). Document the resolution: per-dev Slack apps via `slack run`, Developer Sandbox, sandbox-teamId→tenant registration, prod Inngest key fixed. Keep the prior phantom/grace-wait content; this is the architectural superset.
  - **AGENTS.md Reference Documents** + **README Documentation table**: add the onboarding runbook row.
  - **README**: update the local dev / Slack setup section to point to the per-dev-app runbook; note prod uses its own app.
  - **`.env.example`**: reflect per-dev `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN` (managed by `slack run`), shared/prod token must not be used locally; keep section order + `.env`/`.env.example` sync rules.

  **Must NOT do**: No new top-level doc files outside `docs/` subdirs. Do NOT remove the prior phantom-prevention documentation (extend it). No tokens.

  **Recommended Agent Profile**: `writing`.
  - Skills: [].

  **Parallelization**: Can Run In Parallel: YES (Wave 2) | Blocks: None | Blocked By: 2,4,5,6.

  **References**:
  - AGENTS.md Known Issue #5 (phantom Socket Mode) + Known Issue #4 — extend, keep consistent.
  - README § Documentation + § Environment File Conventions.
  - Tasks 2,4,5,6 outcomes.
  - **WHY**: Documentation Freshness rule — the team must understand the dev/prod token architecture, onboarding, and the prod fix so this never recurs unexplained.

  **Acceptance Criteria**:

  ```
  Scenario: docs reflect the new architecture
    Tool: Bash (grep)
    Steps:
      1. grep AGENTS.md Known Issue #5 for "per-dev"/"slack run"/"Developer Sandbox"/"INNGEST_EVENT_KEY"
      2. grep README + .env.example for the per-dev Slack token note + runbook link
    Expected: all present
    Evidence: .sisyphus/evidence/slack-per-dev-app/task-8-docs.txt
  ```

  **Commit**: YES — `docs(agents): per-dev Slack app onboarding + Known Issue #5 update` (commit 7) — Pre-commit: none.

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to the user and get explicit "okay" before completing. Do NOT auto-proceed. Never check F1-F4 before the user's okay.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Verify each "Must Have": SPIKE gated Track B; sandbox-teamId→tenant registration delivered; 20-trial proof present (not single-shot); prod fix via dashboard (not PUT /env-vars) and gated on re-verification. Verify each "Must NOT Have": no PUT /env-vars for Inngest keys; prod app not CLI-migrated; socket-mode-lock/single-instance-guard/Step-0-reaper untouched (or reaper extended only per SPIKE); tenant_secrets schema + InstallationStore intact; CI Slack-less; no committed tokens; .env precedence verified; classifier/lifecycle/channel-resolution untouched.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality + Build + Tests** — `unspecified-high`
      `pnpm build` + `pnpm exec eslint` on changed files + `pnpm exec vitest run` (new helper tests + full suite). Confirm no NEW failures vs baseline (checkout-baseline method). Confirm CI runs WITHOUT a real Slack token. Review for `as any`/`@ts-ignore`, swallowed errors, token leakage in code/logs.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | CI-Slack-less [Y/N] | VERDICT`

- [x] F3. **Live Proofs — round-robin eliminated** — `unspecified-high` (+ `e2e-testing` skill)
      (a) Start exactly one `pnpm dev` (per-dev app). (b) Socket Mode probe → assert `num_connections == 1`; paste raw `hello`. (c) Send 20 uuid-tagged @mentions ~2s apart in the dev sandbox → assert 20/20 "On it…" acks + 20/20 task rows; record task IDs. (d) With prod live, grep prod logs for the 20 unique strings → assert ZERO matches (cross-machine isolation). (e) Ctrl+C → assert `pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l` == 0. (f) Prod fix: snapshot full prod env-var key set before/after (post ⊇ pre); trigger a prod-workspace @mention → assert `tasks.status=Done` + no Inngest error in prod logs. Evidence → `.sisyphus/evidence/slack-per-dev-app/`.
      Output: `num_connections==1 [Y/N] | 20/20 acks [Y/N] | 20/20 tasks [Y/N] | prod isolation [Y/N] | clean shutdown [Y/N] | prod @mention Done [Y/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      `git diff --name-only` — confirm only in-scope files. Confirm socket-mode-lock.ts, dev.ts single-instance guard + Step-0 reaper (unless SPIKE-justified extension), tenant_secrets schema, TenantInstallationStore, classifier, lifecycle, channel→employee resolution all untouched. No `xapp-`/`xoxb-`/`xoxp-` tokens in diffs; no `.slack/apps*.json` committed; `git check-ignore .slack/apps.dev.json` passes; no `LOG_LEVEL=debug` committed.
      Output: `Files [N/N in scope] | Protected components intact [Y/N] | No tokens leaked [Y/N] | .slack gitignored [Y/N] | VERDICT`

- [x] F5. **Cleanup + docs freshness + notify** — kill all `ai-*` tmux sessions and any stray Socket Mode probe processes; remove temp/scratch (`/tmp/sm-probe*.mjs`) + `.playwright-mcp/` artifacts; `git status` clean (only intended files + plan/notepads). Confirm AGENTS.md / README / `.env.example` updates landed. Commit plan + notepads per git cleanup rules. Send Telegram: plan complete, come back to review.

---

## Commit Strategy

| Commit | Message                                                                            | Files                                                              |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1      | `docs(slack): record per-dev-app SPIKE findings`                                   | SPIKE notes (notepad/docs)                                         |
| 2      | `fix(prod): set INNGEST_EVENT_KEY/SIGNING_KEY on Render (stop silent event drops)` | (Render dashboard — doc/runbook note; no source if dashboard-only) |
| 3      | `chore(slack): add dev app manifest + gitignore .slack tokens`                     | `manifest.json`, `.gitignore`                                      |
| 4      | `feat(dev): orchestrate slack run as managed child; inject per-dev Slack token`    | `scripts/dev.ts` (+ helpers)                                       |
| 5      | `feat(slack): register dev-sandbox team as dev tenant for Socket Mode auth`        | dev-tenant registration (route/seed)                               |
| 6      | `test(slack): cover token precedence and dev-tenant registration`                  | test files                                                         |
| 7      | `docs(agents): per-dev Slack app onboarding + Known Issue #5 update`               | `AGENTS.md`, `README.md`, `.env.example`, runbook                  |

---

## Success Criteria

### Verification Commands

```bash
# Per-dev app = sole socket on that app
# (probe with the engineer's SLACK_APP_TOKEN) → num_connections == 1

# Round-robin gone (20-trial; run in dev sandbox)
# 20/20 unique uuid-tagged @mentions → 20 "On it…" acks + 20 task rows

# Cross-machine isolation (prod live)
# grep prod logs for the 20 unique strings → zero matches

# Clean shutdown
pgrep -f "$(pwd).*src/gateway/server.ts" | wc -l      # Expected: 0 after Ctrl+C

# Prod fix verified
# prod env-var key set post ⊇ pre; prod @mention → tasks.status=Done; no Inngest error

# Build + tests Slack-less
pnpm build && pnpm test -- --run                      # Expected: pass, no Slack token needed
```

### Final Checklist

- [ ] SPIKE decision recorded; Track B gated on it
- [ ] Per-dev app: `num_connections == 1`; 20/20 @mention proof; prod isolation proven
- [ ] Clean shutdown (no phantom) preserved
- [ ] Prod Inngest keys set via dashboard; prod @mention → Done; no var wiped
- [ ] Sandbox-teamId→dev-tenant registration works; onboarding runbook validated
- [ ] CI Slack-less; build + tests pass; no tokens committed; docs updated
