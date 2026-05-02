# dev:local — Single-Command Full Local Infrastructure

## TL;DR

> **Quick Summary**: Create `pnpm dev:local` — one command that boots the entire AI Employee platform locally (Docker Compose, Inngest, Gateway, Cloudflare tunnel, Docker worker image) so the user can debug the full production-like system from their machine.
>
> **Deliverables**:
>
> - `scripts/dev-local.ts` — new startup script with cloudflared tunnel integration
> - `package.json` — `"dev:local"` script entry
>
> **Estimated Effort**: Short (half day)
> **Parallel Execution**: NO — 1 implementation task → final verification
> **Critical Path**: T1 → F1-F4

---

## Context

### Original Request

User wants a single `pnpm` command to start all local infrastructure — Docker Compose, Inngest, Gateway (with Slack Socket Mode), Cloudflare named tunnel, and Docker worker image — so external webhooks (Hostfully) flow in, AI employees process them, and results post to Slack. A full production-like debugging environment.

### Interview Summary

**Key Discussions**:

- Named Cloudflare tunnel already exists: `local-ai-employee.dozaldevs.com` → `localhost:7700`
- Config at `~/.cloudflared/ai-employee-local.yml`, tunnel ID `e160ac6d-2d7d-47c4-a552-b13700947d29`
- User owns `dozaldevs.com` in Cloudflare, static DNS route already configured
- Docker image builds by default; `--skip-build` flag for fast restarts

**Research Findings**:

- `dev-start.ts` (379 lines) is the canonical base: colored `[service]` prefixes, direct `spawn()`, SIGINT/SIGTERM cleanup
- `dev-e2e.ts` (561 lines) has Docker build + `--skip-build` pattern, file-based logging, DB secret checks
- `USE_FLY_HYBRID=1` is currently set in `.env` — must be overridden to `0` in gateway env so workers dispatch to local Docker, not Fly.io
- `TUNNEL_URL` in `.env` is a separate concern (PostgREST quick-tunnel for Fly.io hybrid) — must not be touched
- cloudflared installed at `/opt/homebrew/bin/cloudflared` (v2026.3.0)

### Metis Review

**Identified Gaps** (addressed):

- **`USE_FLY_HYBRID` override**: Force `USE_FLY_HYBRID=0` in gateway spawn env so workers run locally
- **cloudflared early exit detection**: If cloudflared dies within 5s of spawn (auth error, already running), treat as fatal
- **Tunnel already running**: Check `https://local-ai-employee.dozaldevs.com/health` before spawning; skip if already up
- **cloudflared noise**: Pipe output to `/tmp/cloudflared.log`, not terminal
- **Credentials prereq**: Verify `~/.cloudflared/ai-employee-local.yml` and credentials JSON exist before starting
- **`--skip-build` with no image**: Warn if flag is passed but `ai-employee-worker:latest` image doesn't exist

---

## Work Objectives

### Core Objective

One command (`pnpm dev:local`) that boots the entire AI Employee platform locally, including a Cloudflare tunnel for external webhook ingress, enabling full production-like debugging.

### Concrete Deliverables

- `scripts/dev-local.ts` — TypeScript startup script
- `package.json` — `"dev:local": "tsx scripts/dev-local.ts"` entry

### Definition of Done

- [ ] `pnpm dev:local --skip-build` starts all services and tunnel without error
- [ ] `curl https://local-ai-employee.dozaldevs.com/health` returns `{"status":"ok"}`
- [ ] `curl http://localhost:7700/health` returns `{"status":"ok"}`
- [ ] `curl http://localhost:8288/` returns 200
- [ ] `curl http://localhost:54321/rest/v1/` returns 200
- [ ] Ctrl+C kills all child processes (no zombie cloudflared/inngest/gateway)
- [ ] `pnpm build` exits 0

### Must Have

- Spawns: Docker Compose, Inngest Dev Server, Event Gateway, cloudflared named tunnel
- Docker image build by default, skippable with `--skip-build`
- `--reset` flag to wipe DB + re-seed
- `--help` flag with usage examples
- Forces `USE_FLY_HYBRID=0` and `USE_LOCAL_DOCKER=1` in gateway env
- cloudflared spawned AFTER gateway is healthy (tunnel routes to `localhost:7700`)
- cloudflared output piped to `/tmp/cloudflared.log` (too noisy for terminal)
- Tunnel health-check: polls `https://local-ai-employee.dozaldevs.com/health` with 60s timeout
- Pre-flight: checks for `cloudflared` binary, tunnel config file, credentials JSON
- Pre-flight: checks Docker daemon, required env vars
- Detects cloudflared early exit (within 5s) and reports clear error
- Detects tunnel already running (skip spawn, log "tunnel already active")
- Warns if `--skip-build` used but `ai-employee-worker:latest` image doesn't exist
- SIGINT + SIGTERM handlers kill all children (cloudflared, inngest, gateway)
- Summary banner with all URLs including tunnel URL
- Follows `dev-start.ts` patterns: colored `[service]` prefixes, `spawn()`, `waitForHttp()`

### Must NOT Have (Guardrails)

- ❌ Changes to `dev-start.ts`, `dev-e2e.ts`, or `dev-start.sh`
- ❌ Auto-triggering any task (user triggers manually when ready)
- ❌ DB secret pre-flight checks (no PostgREST queries for tenant secrets)
- ❌ Modification to `TUNNEL_URL` env var (separate concern — PostgREST quick-tunnel for Fly.io)
- ❌ Flags beyond `--reset`, `--skip-build`, `--help` (no `--trigger-only`, `--watch`, `--tenant`)
- ❌ PostgREST quick-tunnel spawning (Fly.io hybrid is a separate mode)
- ❌ Slack OAuth verification
- ❌ `console.log` for structured service output — use the colored `log()` helpers

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO — this is a dev startup script; testing requires real Docker/network. QA scenarios verify behavior.
- **Agent-Executed QA**: ALWAYS

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Script startup**: Use interactive_bash (tmux) — launch script, verify services come up
- **Tunnel verification**: Use Bash (curl) — hit tunnel URL, verify routing
- **Cleanup verification**: Use Bash — Ctrl+C + pgrep to verify no zombies

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Single task — script creation):
└── Task 1: Create dev-local.ts + package.json entry [deep]

Wave FINAL (After T1 — verification):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — start script, verify all services + tunnel (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1 → F1-F4 → user okay
```

### Dependency Matrix

| Task  | Depends On | Blocks | Wave  |
| ----- | ---------- | ------ | ----- |
| T1    | —          | F1-F4  | 1     |
| F1-F4 | T1         | —      | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `scripts/dev-local.ts` + add `"dev:local"` to `package.json`

  **What to do**:

  Create a new TypeScript startup script at `scripts/dev-local.ts` that boots the entire AI Employee platform locally with Cloudflare tunnel integration. Follow the `dev-start.ts` patterns exactly (shebang, color helpers, `.env` loader, `spawn()`, `waitForHttp()`, `cleanup()`, banner).

  **Implementation steps (in order):**
  1. **Shebang + imports** — Copy from `dev-start.ts:1-17`. Import `spawn`, `existsSync`, `readFileSync`, `writeFileSync`, `execSync` (for Docker image check).

  2. **Color helpers** — Copy `C` object, `log()`, `ok()`, `fail()`, `info()` from `dev-start.ts:23-36`. Add a `warn()` helper (`${C.yellow}⚠${C.reset}`). Add a `prefix()` helper for `[service]` prefixed output: `const prefix = (name: string, color: string) => (d: Buffer) => process.stdout.write(\`${color}[${name}]${C.reset} ${d}\`);`

  3. **Parse flags** — Accept `--reset`, `--skip-build`, `--help`. Unknown flags → print usage and exit 1. `--help` prints usage block showing:

     ```
     Usage: tsx scripts/dev-local.ts [--reset] [--skip-build] [--help]

     Starts the full AI Employee platform locally:
       • Docker Compose (Supabase stack)
       • Inngest Dev Server (:8288)
       • Event Gateway (:7700) with Slack Socket Mode
       • Cloudflare tunnel (local-ai-employee.dozaldevs.com → :7700)
       • Docker worker image build (default, skip with --skip-build)

     Options:
       --reset       Wipe database and re-seed before starting
       --skip-build  Skip Docker worker image build (for fast restarts)
       --help        Show this help message

     Examples:
       pnpm dev:local                   # full start (build + tunnel)
       pnpm dev:local --skip-build      # skip Docker build for fast restart
       pnpm dev:local --reset           # wipe DB, re-seed, then start
     ```

  4. **Load `.env`** — Copy `.env` loader from `dev-start.ts:54-61`.

  5. **Constants** — `GATEWAY_PORT = process.env.PORT ?? '7700'`, `TUNNEL_CONFIG = path.join(os.homedir(), '.cloudflared/ai-employee-local.yml')`, `TUNNEL_CREDS = path.join(os.homedir(), '.cloudflared/e160ac6d-2d7d-47c4-a552-b13700947d29.json')`, `TUNNEL_URL = 'https://local-ai-employee.dozaldevs.com'`, `CLOUDFLARED_LOG = '/tmp/cloudflared.log'`.

  6. **Children tracking + cleanup** — Copy `children[]`, `cleaningUp`, `cleanup()`, SIGINT/SIGTERM from `dev-start.ts:68-93`. The `cleanup()` function must kill all children.

  7. **`waitForHttp()`** — Copy from `dev-start.ts:98-112`. No changes needed.

  8. **Banner** — `"Local Full-Stack Environment — Starting"` (not "E2E").

  9. **Pre-flight checks** (Step 1):
     - Docker daemon: `docker info` (same as `dev-start.ts:131-137`)
     - Docker Compose: `docker compose version`
     - Required env vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `ADMIN_API_KEY`, `ENCRYPTION_KEY`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`, `OPENROUTER_API_KEY`
     - cloudflared binary: `which cloudflared` — if not found, fail with "Install cloudflared: brew install cloudflare/cloudflare/cloudflared"
     - Tunnel config: `existsSync(TUNNEL_CONFIG)` — if missing, fail with path
     - Tunnel credentials: `existsSync(TUNNEL_CREDS)` — if missing, fail with path
     - Exit 1 if any prereq fails

  10. **Docker image build** (Step 2):
      - If `--skip-build`: log "Skipping Docker image build (--skip-build)"
        - Then check if image exists: `docker image inspect ai-employee-worker:latest` — if it fails, `warn('No ai-employee-worker:latest image found — workers will fail to dispatch')`
      - Else: `docker build -t ai-employee-worker:latest .` with `$.verbose = true` (same pattern as `dev-e2e.ts:224-237`)
      - On failure: `fail('Docker build failed')` + exit 1

  11. **DB Reset** (Step 3, only if `--reset`):
      - Copy reset logic from `dev-start.ts:177-211` exactly (stop compose, remove volumes, start fresh, wait for DB, migrate, seed)

  12. **Start Docker Compose** (Step 4):
      - Copy from `dev-start.ts:216-276` — includes `supabase stop`, `docker/.env` creation, check if already running, start if not, run migrations, wait for PostgREST health

  13. **Start Inngest** (Step 5):
      - Copy from `dev-start.ts:281-320` — spawn `npx inngest-cli@latest dev`, pipe stdout/stderr with `[inngest]` prefix (blue), wait for health at `:8288`

  14. **Start Gateway** (Step 6):
      - Based on `dev-start.ts:326-361` BUT with critical env overrides:
        ```typescript
        const gatewayEnv: NodeJS.ProcessEnv = {
          ...process.env,
          USE_LOCAL_DOCKER: '1',
          USE_FLY_HYBRID: '0', // Force local dispatch, override .env
        };
        ```
      - Spawn `node --import tsx/esm src/gateway/server.ts` with `[gateway]` prefix (cyan)
      - Wait for health at `http://localhost:${GATEWAY_PORT}/health`

  15. **Start Cloudflare Tunnel** (Step 7) — THIS IS THE NEW PART:
      - **Check if tunnel already running**: Try `curl -s --max-time 5 ${TUNNEL_URL}/health` — if 200, `ok('Tunnel already active — skipping cloudflared spawn')` and skip spawn
      - **Spawn cloudflared**: `spawn('cloudflared', ['tunnel', '--config', TUNNEL_CONFIG, 'run'], { stdio: ['ignore', 'pipe', 'pipe'] })`
      - Pipe stdout+stderr to `/tmp/cloudflared.log` via `fs.createWriteStream(CLOUDFLARED_LOG)`: `cfProc.stdout?.pipe(logStream)` and `cfProc.stderr?.pipe(logStream)`
      - Add to `children[]`
      - Print `ok('cloudflared started (PID: ${cfProc.pid}) — logs at /tmp/cloudflared.log')`
      - **Early exit detection**: Set up `cfProc.on('exit', (code) => { ... })`. Inside: if `!cleaningUp && Date.now() - cfStart < 5000`, treat as fatal: `fail('cloudflared exited immediately (code ${code}). Check /tmp/cloudflared.log')` + `await cleanup()` + `process.exit(1)`. Record `cfStart = Date.now()` right before spawn.
      - **Tunnel health check**: `waitForHttp('${TUNNEL_URL}/health', 60_000)` — if fails, `fail('Tunnel not routing after 60s')` + cleanup + exit 1
      - On success: `ok('Tunnel healthy at ${TUNNEL_URL}')`

  16. **Summary banner** (Step 8):

      ```
      ╔══════════════════════════════════════════════════╗
      ║       Local Full-Stack Environment Ready         ║
      ╚══════════════════════════════════════════════════╝
        PostgREST:  http://localhost:54321
        Studio:     http://localhost:54323
        Inngest:    http://localhost:8288
        Gateway:    http://localhost:{GATEWAY_PORT}
        Tunnel:     https://local-ai-employee.dozaldevs.com

        Slack webhooks route through the tunnel automatically.
        Trigger a task:  curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
          "http://localhost:{GATEWAY_PORT}/admin/tenants/<id>/employees/daily-summarizer/trigger"

        Press Ctrl+C to stop all services.
      ```

  17. **Block forever**: `await new Promise<void>(() => {});` (same as `dev-start.ts:379`)

  18. **Add to `package.json`**: Add `"dev:local": "tsx scripts/dev-local.ts"` to the `scripts` section.

  **Must NOT do**:
  - ❌ Modify `dev-start.ts`, `dev-e2e.ts`, or `dev-start.sh`
  - ❌ Use `console.log` — use the colored `log()` / `ok()` / `fail()` / `info()` / `warn()` helpers
  - ❌ Modify `TUNNEL_URL` env var (that's the PostgREST quick-tunnel for Fly.io hybrid)
  - ❌ Auto-trigger any task — user does that manually
  - ❌ Add DB secret checks via PostgREST queries
  - ❌ Add flags beyond `--reset`, `--skip-build`, `--help`
  - ❌ Add Slack OAuth verification
  - ❌ Spawn a PostgREST quick-tunnel (that's Fly.io hybrid mode, a different concern)
  - ❌ Add npm dependencies — use only `zx` (already a devDependency) and Node built-ins

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Single task creating a ~400-line TypeScript script with multiple subsystems (process spawning, health checks, tunnel integration, signal handling). Requires understanding codebase patterns and composing them correctly. Not trivially "quick" but well-scoped enough for deep.
  - **Skills**: `[]`
    - No special skills needed — standard TypeScript file creation following existing patterns.

  **Parallelization**:
  - **Can Run In Parallel**: NO — this is the only implementation task
  - **Parallel Group**: Wave 1 (sole task)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL — Be Exhaustive):

  **Pattern References** (existing code to follow):
  - `scripts/dev-start.ts:1-379` — **PRIMARY PATTERN** — Copy structure verbatim: shebang, color helpers (`C` object, `log/ok/fail/info`), `.env` loader, `children[]` array, `cleanup()` function, SIGINT/SIGTERM handlers, `waitForHttp()`, flag parsing, prereq checks, Docker Compose start, Inngest spawn, Gateway spawn (with `USE_LOCAL_DOCKER: '1'` env override), health checks between each service, summary banner, `await new Promise(() => {})` blocker
  - `scripts/dev-start.ts:23-36` — Color helpers and logging functions to copy exactly
  - `scripts/dev-start.ts:68-93` — Children tracking + cleanup + signal handlers to copy exactly
  - `scripts/dev-start.ts:98-112` — `waitForHttp()` implementation to copy exactly
  - `scripts/dev-start.ts:147-165` — Required env vars check pattern
  - `scripts/dev-start.ts:326-334` — Gateway spawn with env overrides (add `USE_FLY_HYBRID: '0'` to this pattern)
  - `scripts/dev-e2e.ts:60-93` — `--help` flag handling + `--skip-build` pattern + unknown flag detection
  - `scripts/dev-e2e.ts:214-237` — Docker image build step (verbose mode, error handling)

  **Config References** (tunnel setup):
  - `~/.cloudflared/ai-employee-local.yml` — Named tunnel config: `tunnel: e160ac6d-...`, ingress rules `hostname: local-ai-employee.dozaldevs.com → http://localhost:7700`
  - `~/.cloudflared/e160ac6d-2d7d-47c4-a552-b13700947d29.json` — Tunnel credentials file (existence check only, never read contents)
  - `.env` — Has `SLACK_REDIRECT_BASE_URL=https://local-ai-employee.dozaldevs.com` and `USE_FLY_HYBRID=1` (the latter must be overridden to `0` in gateway env)

  **API/Type References**:
  - `package.json` `scripts` section — Where to add `"dev:local": "tsx scripts/dev-local.ts"` entry

  **External References**:
  - cloudflared CLI docs: `cloudflared tunnel --config <path> run` — runs a named tunnel using config file

  **WHY Each Reference Matters**:
  - `dev-start.ts` is the canonical pattern — the new script is essentially `dev-start.ts` + Docker build + cloudflared tunnel. Copy structure, don't reinvent.
  - `dev-e2e.ts` has the `--skip-build` and `--help` patterns that `dev-start.ts` lacks.
  - The gateway env override pattern at line 329 shows how to override env vars for the gateway subprocess — extend with `USE_FLY_HYBRID: '0'`.
  - The tunnel config/credentials paths must be checked at pre-flight because cloudflared exits silently if they're missing.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Help flag prints usage and exits
    Tool: Bash
    Preconditions: Script exists at scripts/dev-local.ts
    Steps:
      1. Run: npx tsx scripts/dev-local.ts --help
      2. Assert stdout contains "--reset"
      3. Assert stdout contains "--skip-build"
      4. Assert stdout contains "local-ai-employee.dozaldevs.com"
      5. Assert exit code is 0
    Expected Result: Usage printed with all flags documented, exit 0
    Failure Indicators: Non-zero exit code, missing flag documentation
    Evidence: .sisyphus/evidence/task-1-help-output.txt

  Scenario: Unknown flag rejected
    Tool: Bash
    Preconditions: Script exists
    Steps:
      1. Run: npx tsx scripts/dev-local.ts --unknown-flag
      2. Assert exit code is 1
      3. Assert stderr/stdout contains "Unknown flag"
    Expected Result: Exit 1 with clear error about unknown flag
    Failure Indicators: Exit 0 (accepted unknown flag), no error message
    Evidence: .sisyphus/evidence/task-1-unknown-flag.txt

  Scenario: Build compiles without errors
    Tool: Bash
    Preconditions: All source files saved
    Steps:
      1. Run: pnpm build
      2. Assert exit code is 0
    Expected Result: TypeScript compiles cleanly
    Failure Indicators: Non-zero exit code, type errors
    Evidence: .sisyphus/evidence/task-1-build.txt

  Scenario: package.json has dev:local script entry
    Tool: Bash
    Preconditions: package.json updated
    Steps:
      1. Run: node -e "const p = require('./package.json'); console.log(p.scripts['dev:local'])"
      2. Assert output is "tsx scripts/dev-local.ts"
    Expected Result: Correct script entry
    Failure Indicators: undefined or wrong command
    Evidence: .sisyphus/evidence/task-1-package-json.txt

  Scenario: Gateway env forces local dispatch
    Tool: Bash (grep)
    Preconditions: Script exists
    Steps:
      1. Grep scripts/dev-local.ts for "USE_FLY_HYBRID"
      2. Assert it contains USE_FLY_HYBRID.*'0' (or similar)
      3. Grep for "USE_LOCAL_DOCKER"
      4. Assert it contains USE_LOCAL_DOCKER.*'1'
    Expected Result: Both env overrides present in gateway spawn section
    Failure Indicators: Missing overrides — workers would dispatch to Fly.io
    Evidence: .sisyphus/evidence/task-1-env-overrides.txt

  Scenario: cloudflared tunnel config path is correct
    Tool: Bash (grep)
    Preconditions: Script exists
    Steps:
      1. Grep scripts/dev-local.ts for "ai-employee-local.yml"
      2. Assert match found
      3. Grep for "e160ac6d" (tunnel ID in credentials path)
      4. Assert match found
    Expected Result: Correct tunnel config and credentials paths referenced
    Failure Indicators: Hardcoded wrong paths or missing references
    Evidence: .sisyphus/evidence/task-1-tunnel-paths.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: `task-1-{scenario-slug}.txt`
  - [ ] Terminal output for all QA scenarios

  **Commit**: YES
  - Message: `feat(scripts): add dev:local full-stack local startup with Cloudflare tunnel`
  - Files: `scripts/dev-local.ts`, `package.json`
  - Pre-commit: `pnpm build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read the plan. For each "Must Have": verify it exists in `scripts/dev-local.ts`. For each "Must NOT Have": grep for forbidden patterns. Check `package.json` has the entry.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build`. Read `scripts/dev-local.ts`. Check for: `console.log` (should use colored helpers), `as any`, empty catches without comment, hardcoded secrets, process leak risks. Verify cleanup handlers kill ALL children. Verify `USE_FLY_HYBRID=0` is set in gateway env.
      Output: `Build [PASS/FAIL] | Code issues [N] | VERDICT`

- [x] F3. **Real QA** — `unspecified-high`
      Start the script with `--skip-build` in tmux. Wait for ready banner. Verify all 4 health endpoints respond. Verify tunnel routes. Send Ctrl+C, verify no zombie processes. Check `/tmp/cloudflared.log` exists and has content.
      Output: `Services [N/N healthy] | Tunnel [routed/failed] | Cleanup [clean/zombies] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      Verify only `scripts/dev-local.ts` and `package.json` were changed. No modifications to `dev-start.ts`, `dev-e2e.ts`, or `dev-start.sh`. No changes to `.env` or `.env.example`. No new npm dependencies.
      Output: `Files changed [N — expected 2] | Scope creep [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| Commit | Type            | Scope                                  | Files                                  | Pre-commit   |
| ------ | --------------- | -------------------------------------- | -------------------------------------- | ------------ |
| 1      | `feat(scripts)` | add dev:local full-stack local startup | `scripts/dev-local.ts`, `package.json` | `pnpm build` |

---

## Success Criteria

### Verification Commands

```bash
pnpm build                              # Expected: exit 0
pnpm dev:local --help                   # Expected: shows usage with --reset, --skip-build
# After startup:
curl -s http://localhost:54321/rest/v1/ # Expected: 200
curl -s http://localhost:8288/          # Expected: 200
curl -s http://localhost:7700/health    # Expected: {"status":"ok"}
curl -s https://local-ai-employee.dozaldevs.com/health  # Expected: {"status":"ok"}
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] `pnpm build` passes
- [ ] All 4 service endpoints healthy
- [ ] Tunnel routes correctly
- [ ] Ctrl+C cleanup is clean
