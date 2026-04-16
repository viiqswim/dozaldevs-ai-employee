# AI Employee Platform — Current State (Post Hybrid Fly.io Mode)

## What This Document Is

This is a grounded, end-to-end reference for how the AI Employee Platform works **right now** — after the `hybrid-local-flyio-workers` plan added a third worker dispatch mode that runs the worker container on a real Fly.io machine while keeping Supabase, Inngest, and the Gateway local. Every claim in this document is sourced from a specific file and line range. Nothing is assumed, embellished, or aspirational. If a behavior isn't here, it isn't in the code.

This document covers:

- The complete request flow from a Jira webhook to a merged PR
- All three worker dispatch modes (local Docker, hybrid Fly.io, default Fly.io) with exact env blocks
- What happens inside the worker container (entrypoint.sh boot sequence + orchestrate.mts two-phase flow)
- How the PR gets created, named, bodied, and persisted back to the database
- The Cloudflare Tunnel mechanism that makes hybrid mode work (and why ngrok free-tier doesn't)
- All environment variables grouped by purpose
- Known limitations of the current state
- What's next (link to the Phase A→D cloud migration roadmap)

For the original system overview written before hybrid mode, see [`docs/2026-04-01-1726-system-overview.md`](./2026-04-01-1726-system-overview.md). For the Phase 8 E2E build that this work is layered on top of, see [`docs/2026-04-01-1655-phase8-e2e.md`](./2026-04-01-1655-phase8-e2e.md). For the cloud migration path forward, see [`docs/2026-04-06-2205-cloud-migration-roadmap.md`](./2026-04-06-2205-cloud-migration-roadmap.md).

---

## TL;DR — Current State Summary

| Aspect                                              | Status                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| Jira webhook → task row → Inngest event             | Working (Gateway on `localhost:3000`)                                   |
| Local Docker worker dispatch (`USE_LOCAL_DOCKER=1`) | Working (Phase 8 baseline)                                              |
| Hybrid Fly.io worker dispatch (`USE_FLY_HYBRID=1`)  | **NEW — Working as of plan completion**                                 |
| Default Fly.io worker dispatch (no flags)           | Code path exists, has known `auto_destroy` bug                          |
| Supabase, Inngest, Gateway                          | All local (Docker Compose + Inngest Dev Server + tsx)                   |
| PR creation on test repo                            | Working (verified in T13: PR #19 on `viiqswim/ai-employee-test-target`) |
| Cloud migration                                     | Not started — see Phase A→D roadmap                                     |

**The single most important new capability**: You can now dispatch a real Fly.io machine that runs the worker container, while Supabase and Inngest continue to run on your laptop. The worker reaches back to your local Supabase via a Cloudflare Tunnel. This was the missing piece for testing real Fly.io machine behavior without paying for Supabase Cloud or Inngest Cloud.

---

## System Architecture Overview

```mermaid
flowchart LR
    Jira[Jira Webhook]
    GW[Gateway<br/>Fastify<br/>:3000]
    INN[Inngest Dev Server<br/>:8288]
    SB[(Supabase<br/>PostgREST :54321<br/>Postgres :54322)]
    LIFE[Lifecycle Function]
    DOCKER[Local Docker<br/>Worker Container]
    FLY[Fly.io Machine<br/>ai-employee-workers]
    CF[Cloudflare Tunnel<br/>cloudflared]
    GH[GitHub<br/>PR]

    Jira -->|1 POST /webhooks/jira<br/>HMAC-SHA256| GW
    GW -->|2 INSERT task<br/>status=Ready| SB
    GW -->|3 send engineering/task.received| INN
    INN -->|4 invoke| LIFE
    LIFE -->|5a USE_LOCAL_DOCKER=1| DOCKER
    LIFE -->|5b USE_FLY_HYBRID=1| FLY
    FLY -.->|6 reads tasks via tunnel| CF
    CF -.->|7 forwards to localhost:54321| SB
    DOCKER -->|writes PR url + status=Submitting| SB
    FLY -->|writes PR url + status=Submitting| SB
    DOCKER -->|create PR| GH
    FLY -->|create PR| GH
    LIFE -->|8 polls Supabase status<br/>then marks Done| SB

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
    class GW,LIFE,DOCKER,FLY service
    class SB storage
    class Jira,GH,CF external
    class INN event
```

### Flow Walkthrough

| Step | Actor      | Action                                                                                             | File / Detail                                 |
| ---- | ---------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1    | Jira       | Sends webhook to `POST /webhooks/jira` with `X-Hub-Signature: sha256=<hex>`                        | `src/gateway/routes/jira.ts`                  |
| 2    | Gateway    | Validates HMAC, parses payload (Zod), looks up project, INSERTs task row with `status=Ready`       | `createTaskFromJiraWebhook()`                 |
| 3    | Gateway    | Sends `engineering/task.received` event to Inngest with `{taskId, projectId, repoUrl, repoBranch}` | `sendTaskReceivedEvent()`                     |
| 4    | Inngest    | Invokes the registered Lifecycle function                                                          | `src/inngest/lifecycle.ts`                    |
| 5a   | Lifecycle  | If `USE_LOCAL_DOCKER=1` → spawns `docker run -d --rm --network host ai-employee-worker`            | `local Docker dispatch block in lifecycle.ts` |
| 5b   | Lifecycle  | If `USE_FLY_HYBRID=1` → POSTs to `https://api.machines.dev/v1/apps/.../machines`                   | `hybrid dispatch block in lifecycle.ts`       |
| 6    | Worker     | Reads task context from Supabase via PostgREST                                                     | `entrypoint.sh` Step 6                        |
| 7    | Cloudflare | Tunnel forwards Fly machine HTTPS request to `localhost:54321`                                     | `cloudflared tunnel --url ...`                |
| 8    | Lifecycle  | After worker writes `status=Submitting`, polls Supabase for terminal state, marks `Done`           | `lifecycle.ts` + `poll-completion.ts`         |

---

## The Three Worker Dispatch Modes

The Lifecycle function (`src/inngest/lifecycle.ts`) selects one of three dispatch paths based on environment variables. All three paths exist in the same file. Mode selection happens in the `update-status-executing` step.

### Mode Selection Logic

```typescript
// update-status-executing step
const dispatchMode = await step.run('update-status-executing', async () => {
  const flyHybrid = process.env.USE_FLY_HYBRID;
  const localDocker = process.env.USE_LOCAL_DOCKER;
  // ...
  return { useFlyHybrid: flyHybrid, useLocalDocker: localDocker };
});
```

| Condition                                         | Mode                    | Path                                            |
| ------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| `USE_FLY_HYBRID=1` AND `USE_LOCAL_DOCKER !== '1'` | **Hybrid Fly.io** (NEW) | `hybrid dispatch block in lifecycle.ts`         |
| `USE_LOCAL_DOCKER=1` AND `USE_FLY_HYBRID !== '1'` | **Local Docker**        | `local Docker dispatch block in lifecycle.ts`   |
| Neither set                                       | **Default Fly.io**      | `default Fly.io dispatch block in lifecycle.ts` |

If both flags are set (`USE_FLY_HYBRID=1` AND `USE_LOCAL_DOCKER=1`), neither path runs — the `dispatch-fly-machine` step returns early with no dispatch and no status update. This is a silent no-op. Use only one flag at a time.

### Mode Comparison Table

| Aspect                         | Local Docker                                                                                                          | Hybrid Fly.io (NEW)                                          | Default Fly.io                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Trigger**                    | `USE_LOCAL_DOCKER=1`                                                                                                  | `USE_FLY_HYBRID=1`                                           | Neither                                                                 |
| **Container runs on**          | Your laptop (Docker)                                                                                                  | Real Fly.io machine                                          | Real Fly.io machine                                                     |
| **Spawn mechanism**            | `docker run -d --rm --network host`                                                                                   | Direct `fetch()` to Fly Machines API                         | `createMachine()` from `fly-client.ts`                                  |
| **Image source**               | Local: `ai-employee-worker:latest`                                                                                    | Registry: `registry.fly.io/ai-employee-workers:<sha>`        | Registry: same                                                          |
| **Pre-flight check**           | None                                                                                                                  | **Tunnel URL resolution** (fails fast → AwaitingInput)       | None                                                                    |
| **Restart policy**             | N/A (host network)                                                                                                    | `restart: { policy: 'no' }`                                  | `auto_destroy: true` (buggy)                                            |
| **VM size**                    | N/A                                                                                                                   | `performance-2x` (2 CPU, 4096 MB)                            | `performance-2x`                                                        |
| **`SUPABASE_URL` passed**      | `http://localhost:54321`                                                                                              | Cloudflare Tunnel URL (e.g. `https://xxx.trycloudflare.com`) | Production cloud URL                                                    |
| **`INNGEST_BASE_URL` passed**  | `http://localhost:8288`                                                                                               | **Not passed**                                               | Not passed                                                              |
| **Completion detection**       | `step.sleep` + `step.run` polling loop (30s × 360 = 180 min ceiling) — `waitForEvent` is broken on Inngest Dev Server | `pollForCompletion()` (30s × 120 = 60 min)                   | `step.waitForEvent('engineering/task.completed', { timeout: '8h30m' })` |
| **Cleanup**                    | `docker stop` in finalize block                                                                                       | `destroyMachine()` in `finally` block (guaranteed)           | `destroyMachine()` in finalize (relies on `auto_destroy` flag, buggy)   |
| **Has the `auto_destroy` bug** | No (different mechanism)                                                                                              | **No** (explicit cleanup)                                    | **Yes** (machines may persist)                                          |

### Why Three Modes Exist

- **Local Docker** was built in Phase 8 to make the entire system testable on a single machine without any cloud dependencies. Its drawback: it doesn't exercise the Fly.io code path, so cloud-specific bugs go undetected.
- **Default Fly.io** is the production-grade path, but it has a known bug (Fly's `auto_destroy: true` flag does not always destroy machines) and depends on having Supabase and Inngest reachable from Fly machines. To use it during development, you'd need to migrate Supabase and Inngest to the cloud first.
- **Hybrid Fly.io** is the bridge: real Fly.io machine dispatch, but Supabase and Inngest stay local. This lets you test Fly.io behavior end-to-end without paying for cloud Supabase or cloud Inngest, and without inheriting the `auto_destroy` bug (because hybrid mode explicitly destroys the machine in a `finally` block).

---

## Mode 1: Hybrid Fly.io (NEW) — How to Run It

### Prerequisites

1. **Fly.io account with `FLY_API_TOKEN`** in `.env`
2. **Worker app created** on Fly.io: `pnpm fly:setup` (one time)
3. **Worker image pushed** to Fly registry: `pnpm fly:image` (rebuild after every worker code change)
4. **Tunnel tool installed**: `brew install cloudflared`

### Step-by-Step Workflow

```bash
# Terminal 1 — local services
pnpm dev:start
# Starts Docker Compose (Supabase :54321/:54322), Inngest Dev Server (:8288), Gateway (:3000)

# Terminal 2 — Cloudflare Tunnel
cloudflared tunnel --url http://localhost:54321
# Note the printed URL: https://collecting-yorkshire-reaching-term.trycloudflare.com

# Terminal 3 — dispatch
export TUNNEL_URL=https://collecting-yorkshire-reaching-term.trycloudflare.com
USE_FLY_HYBRID=1 pnpm trigger-task
# Or override the issue key:
# USE_FLY_HYBRID=1 pnpm trigger-task -- --key TEST-300
```

### Why Cloudflare Tunnel Instead of ngrok?

ngrok's free tier blocks Fly.io egress IPs at the infrastructure level. When the worker container running on a Fly machine tries to reach an `https://*.ngrok-free.app` URL, the request never arrives at the ngrok agent on your laptop — ngrok's edge drops it. This was discovered during T9 of the plan and documented in `.sisyphus/notepads/hybrid-local-flyio-workers/issues.md`.

Cloudflare Tunnel does not have this restriction. It's free, requires no account for quick tunnels, and its edge accepts traffic from Fly.io.

### How `TUNNEL_URL` Works

The Lifecycle function calls `getTunnelUrl()` from `src/lib/tunnel-client.ts`. The function reads the `TUNNEL_URL` environment variable and returns it directly. If `TUNNEL_URL` is not set, the function throws an error with Cloudflare Tunnel setup instructions.

Set `TUNNEL_URL` to the URL printed by `cloudflared`:

```bash
cloudflared tunnel --url http://localhost:54321
# Prints: https://xyz.trycloudflare.com
```

### Pre-Flight Tunnel Check (Hybrid Mode Only)

Before creating the Fly machine, the Lifecycle function attempts to resolve the tunnel URL. If this fails (`TUNNEL_URL` not set), the task transitions to `AwaitingInput` with a `failure_reason` describing the missing env var. This is a fail-fast safeguard so you don't end up with a Fly machine that can't reach Supabase.

---

## Hybrid Mode Internal Flow (Sequence)

```mermaid
sequenceDiagram
    autonumber
    participant U as User<br/>(trigger-task)
    participant GW as Gateway<br/>:3000
    participant INN as Inngest Dev<br/>:8288
    participant LIFE as Lifecycle<br/>Function
    participant SB as Supabase<br/>:54321
    participant CF as Cloudflare<br/>Tunnel
    participant FLY as Fly.io<br/>Machines API
    participant M as Worker Machine<br/>(Fly.io)
    participant GH as GitHub

    U->>GW: POST /webhooks/jira (HMAC-signed)
    GW->>SB: INSERT tasks (status=Ready)
    GW->>INN: send engineering/task.received
    INN->>LIFE: invoke
    LIFE->>SB: PATCH tasks (status=Executing)
    LIFE->>LIFE: getNgrokTunnelUrl() reads TUNNEL_URL
    LIFE->>FLY: POST /v1/apps/ai-employee-workers/machines<br/>(image, env, restart=no)
    FLY-->>LIFE: 200 {machine.id}
    LIFE->>LIFE: pollForCompletion (30s × 120)
    M->>M: entrypoint.sh boot (7 steps + sub-steps)
    M->>CF: GET /rest/v1/tasks?id=eq.<id>
    CF->>SB: forward to localhost:54321
    SB-->>M: task JSON
    M->>M: orchestrate.mts (two-phase: planning + wave execution)
    M->>M: opencode serve + session + fix loop
    M->>GH: create PR (GitHub API)
    GH-->>M: PR URL
    M->>CF: POST deliverables<br/>PATCH tasks status=Submitting
    CF->>SB: forward
    LIFE->>SB: poll detects status=Submitting
    LIFE->>SB: PATCH tasks (status=Done)
    LIFE->>FLY: DELETE /v1/.../machines/<id> (finally block)
```

### Flow Walkthrough

| Step | Component    | Detail                                                                                                                      |
| ---- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1    | trigger-task | Computes HMAC-SHA256 of payload, POSTs to gateway                                                                           |
| 2    | Gateway      | Validates signature, parses Zod, INSERTs task row                                                                           |
| 3    | Gateway      | Sends `engineering/task.received` event with deterministic event ID `jira-{key}-{ts}`                                       |
| 4    | Inngest      | Routes to lifecycle function                                                                                                |
| 5    | Lifecycle    | Updates task status to `Executing`, captures `useFlyHybrid` flag                                                            |
| 6    | Lifecycle    | Calls `getNgrokTunnelUrl(process.env.NGROK_AGENT_URL)` — returns `TUNNEL_URL` immediately if set                            |
| 7    | Lifecycle    | POSTs to `https://api.machines.dev/v1/apps/ai-employee-workers/machines` with full env block (see below)                    |
| 8    | Fly API      | Creates the machine, returns machine ID                                                                                     |
| 9    | Lifecycle    | Calls `pollForCompletion()` which loops every 30s (max 120 iterations = 60 min)                                             |
| 10   | Worker       | entrypoint.sh boots: auth, clone, branch checkout, read task, write heartbeat, write OpenCode auth, exec orchestrate.mts    |
| 11   | Worker       | All HTTP requests to `${SUPABASE_URL}/rest/v1/...` go through the Cloudflare Tunnel back to local Supabase                  |
| 12   | Worker       | orchestrate.mts runs Phase 1 (planning + judge gate), Phase 2 (wave-by-wave execution), then fix loop, branch + commit + PR |
| 13   | Worker       | Writes `tasks.status = Submitting`, POSTs to `deliverables` table with PR URL                                               |
| 14   | Lifecycle    | `pollForCompletion()` detects `Submitting`, returns `{ completed: true }`                                                   |
| 15   | Lifecycle    | PATCHes `tasks.status = Done`                                                                                               |
| 16   | Lifecycle    | `finally` block calls `destroyMachine(flyWorkerApp, machine.id)` — guaranteed cleanup                                       |

---

## The Hybrid Machine Env Block (Verbatim)

This is the exact JSON sent to Fly's Machines API in hybrid mode:

```typescript
body: JSON.stringify({
  config: {
    image: flyWorkerImage,
    guest: { cpu_kind: 'performance', cpus: 2, memory_mb: 4096 },
    restart: { policy: 'no' },
    env: {
      TASK_ID: taskId,
      EXECUTION_ID: executionId,
      REPO_URL: hybridRepoUrl ?? '',
      REPO_BRANCH: hybridRepoBranch ?? 'main',
      SUPABASE_URL: tunnelUrl, // ← from getNgrokTunnelUrl()
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? '',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
      OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? 'minimax/minimax-m2.7',
      PLAN_VERIFIER_MODEL: process.env.PLAN_VERIFIER_MODEL ?? '',
    },
  },
});
```

**What's notably absent**: There is no `INNGEST_BASE_URL` and no `INNGEST_EVENT_KEY` in the hybrid env block. This is intentional. The worker in hybrid mode does **not** send a completion event back to Inngest — that would require Inngest to be reachable from the Fly machine, which would defeat the purpose of hybrid mode. Instead, the worker writes `status = Submitting` to Supabase, and the Lifecycle function detects this via polling.

### Why Direct `fetch()` Instead of `createMachine()`?

The existing `src/lib/fly-client.ts` `createMachine()` helper does not support passing `restart: { policy: 'no' }` or a `guest` block. It hardcodes `auto_destroy: true` and a fixed VM size. Hybrid mode needed to override both, so it bypasses the helper and uses `fetch()` directly. This was committed as `2d07b04` (`fix(inngest): use direct fetch API for hybrid machine dispatch`). The constraint in the plan was explicit: **do not modify `fly-client.ts`** because the existing default Fly.io path still depends on it.

---

## What Happens Inside the Worker Machine

The worker container runs the same code regardless of whether it's launched via `docker run` (local Docker mode) or as a Fly.io machine (hybrid or default Fly.io mode). The image is built from `Dockerfile` and contains:

- Base: `node:20-slim`
- System packages: `git`, `curl`, `bash`, `jq`, `ca-certificates`, `fuse-overlayfs`, `uidmap`
- GitHub CLI v2.45.0 at `/usr/local/bin/gh`
- `opencode-ai@1.3.3` (note: package name is `opencode-ai`, NOT `opencode`)
- Compiled application at `/app/dist/`
- Run command: `CMD ["bash", "entrypoint.sh"]` (from WORKDIR `/app`)

### entrypoint.sh — Boot Sequence

The entrypoint script uses flag files in `/tmp/.boot-flags/` for idempotency on its primary steps. Sub-steps 3.5, 3.6, 3.7, and 6.5 are not flag-guarded and re-run on every boot (all are safe to re-run). The script declares 7 numbered steps, with several sub-steps in between.

**Note**: There is no `pnpm install` step in entrypoint.sh. Dependency installation is handled inside `orchestrate.mjs` (the compiled worker), not in the shell entrypoint.

| Step | Action                                                                                                         | Retry                  | Failure Behavior        |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------- |
| 1    | Set up git credentials (`~/.git-credentials`, `~/.netrc`), authenticate `gh`, set git user.name and user.email | None                   | Exits 1                 |
| 2    | `git clone --depth=2 ${REPO_URL} /workspace`                                                                   | 3 attempts, 5s backoff | Exits 1 after attempt 3 |
| 3    | If `TASK_BRANCH` set, checkout existing or create new branch                                                   | None                   | Exits 1                 |
| 3.5  | Copy `/app/opencode.json` to `${WORKSPACE}/.opencode/opencode.json`                                            | None                   | Logs warning, continues |
| 3.6  | Write `boulder.json` context file for agent self-awareness                                                     | None                   | Logs warning, continues |
| 3.7  | Sync plan file from Supabase on restart via `plan-sync.js`                                                     | None                   | Logs warning, continues |
| 4    | If `ENABLE_DOCKER_DAEMON` set, start `dockerd-rootless.sh` in background                                       | None                   | Logs warning, continues |
| 5    | `curl ${SUPABASE_URL}/rest/v1/tasks?id=eq.${TASK_ID}` → `/workspace/.task-context.json`                        | 3 attempts, 5s backoff | Exits 1 after attempt 3 |
| 6    | POST initial heartbeat to `executions` table → save execution ID to `/tmp/.execution-id`                       | 3 attempts, 5s backoff | Logs warning, continues |
| 6.5  | Write `~/.local/share/opencode/auth.json` with `{openrouter: {type: api, key: ...}}`                           | None                   | Logs warning, continues |
| 7    | `exec node /app/dist/workers/orchestrate.mjs`                                                                  | N/A                    | Replaces shell process  |

**Critical fix from the `hybrid-local-flyio-workers` plan (commit `bd34f83`)**: Steps 5 and 6 use `|| true` after the `curl` command. Without this, the `set -e` directive at the top of the script would cause the script to exit on a single curl failure before the retry loop could try again. The bug was discovered during T11 — the worker was exiting silently after one Supabase fetch attempt instead of retrying.

```bash
# entrypoint.sh — fixed pattern
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "apikey: ${SUPABASE_SECRET_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  "${SUPABASE_URL}/rest/v1/tasks?id=eq.${TASK_ID}&select=*") || true
```

### orchestrate.mts — Two-Phase Orchestration Flow

After `exec node /app/dist/workers/orchestrate.mjs`, the Node process takes over. It runs in six sequential functions: `parseContextFromEnv` → `readConfigFromEnv` → `runPreFlight` → `phase1Planning` → `phase2Execution` → `finalize`.

#### Pre-flight (runs before planning)

| Step | Action                                                                                                                                              | Module                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | Read execution ID from `EXECUTION_ID` env var or `/tmp/.execution-id`; create PostgREST client                                                      | inline                                         |
| 2    | Parse `/workspace/.task-context.json`; fetch project config from Supabase                                                                           | `lib/task-context.ts`, `lib/project-config.ts` |
| 3    | Resolve tooling config; run install command (default: `pnpm install --frozen-lockfile`) in `/workspace`                                             | `lib/install-runner.ts`                        |
| 4    | Start 60-second heartbeat to `executions` table                                                                                                     | `lib/heartbeat.ts`                             |
| 5    | Spawn `opencode serve --port 4096 --hostname 0.0.0.0`, poll `http://localhost:4096/global/health` until healthy (60s timeout)                       | `lib/opencode-server.ts`                       |
| 6    | PUT `/auth/openrouter` to OpenCode server (belt-and-suspenders alongside `auth.json`)                                                               | inline fetch                                   |
| 7    | Build branch name `ai/{TICKET_ID}-{kebab-slug}` (60-char limit on the combined `TICKET_ID-slug` portion), create or checkout branch in `/workspace` | `lib/branch-manager.ts`                        |

#### Phase 1 — Planning

| Step | Action                                                                                                                                                                                                                                                                                                                                                        | Module                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 8    | Check Supabase for an existing plan (restart idempotency). If found, skip to Phase 2.                                                                                                                                                                                                                                                                         | `lib/plan-sync.ts`                                  |
| 9    | Create a dedicated OpenCode planning session; wait for it to produce `.sisyphus/plans/{TICKET_ID}.md`; structurally validate the plan (≥1 wave, ≥1 task per wave)                                                                                                                                                                                             | `lib/planning-orchestrator.ts`                      |
| 9.5  | **Plan judge gate** (if `PLAN_VERIFIER_MODEL` is set): call `callPlanJudge()` which scores the plan against the ticket using the configured model (e.g. `anthropic/claude-haiku-4-5`). On REJECT: delete plan, send correction prompt, retry (max 2 attempts). On exhaustion: throw `PlanJudgeExhaustedError`. Gate skipped if `PLAN_VERIFIER_MODEL` is `''`. | `lib/plan-judge.ts`, `lib/planning-orchestrator.ts` |
| 9.6  | Lock plan read-only (`chmod 0o444`); save plan content to Supabase                                                                                                                                                                                                                                                                                            | `lib/planning-orchestrator.ts`, `lib/plan-sync.ts`  |

#### Phase 2 — Wave-by-Wave Execution

| Step | Action                                                                                                                                                            | Module                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 10   | Parse plan into waves; check DB for `wave_number` to resume from (restart idempotency)                                                                            | `lib/plan-parser.ts`, `lib/plan-sync.ts`       |
| 11   | For each wave: build wave prompt, create OpenCode execution session (model: `OPENROUTER_MODEL ?? 'minimax/minimax-m2.7'`), inject wave prompt, monitor until idle | `lib/session-manager.ts`                       |
| 12   | After each wave: update wave state in DB; if `package.json` changed, re-run install command; push to branch (`pushBetweenWaves`)                                  | `lib/plan-sync.ts`, `lib/between-wave-push.ts` |
| 12.5 | Cost breaker check before wave N>1: if token cap exceeded, stops wave execution                                                                                   | `lib/cost-breaker.ts`                          |

#### Finalize

| Step | Action                                                                                                                                    | Module                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 13   | Create final OpenCode session with fix-loop prompt; monitor session                                                                       | `lib/session-manager.ts` |
| 14   | Run fix loop: validation pipeline → on failure send fix prompt → retry up to 3 per stage, 10 globally                                     | `lib/fix-loop.ts`        |
| 15   | `git add -A` → commit with `feat: {TICKET_ID} - {summary}` → `git push --force-with-lease`                                                | `lib/branch-manager.ts`  |
| 16   | Check for existing PR on branch; if none, create via GitHub REST API (`githubClient.createPR()`) with title `[AI] {TICKET_ID}: {summary}` | `lib/pr-manager.ts`      |
| 17   | PATCH `tasks.status = Submitting`, POST to `deliverables` table with PR URL, POST to `task_status_log`                                    | `lib/completion.ts`      |
| 18   | Send `engineering/task.completed` event to Inngest (retried 3×; non-fatal — fails silently in hybrid mode)                                | `lib/completion.ts`      |

### The Fix Loop (`lib/fix-loop.ts`)

The fix loop runs the validation pipeline (TypeScript → Lint → Unit → Integration → E2E), and on any failure, it:

1. Captures the error output (truncated to 4000 chars)
2. Sends a fix prompt to the OpenCode session via `sendFixPrompt(sessionId, failedStage, errorOutput)`
3. Monitors the session for up to 30 minutes while OpenCode rewrites the code
4. Re-runs the validation pipeline

It enforces two limits:

- **Per-stage limit**: 3 retries on the same stage before giving up on it
- **Global limit**: 10 total fix iterations across all stages

When either limit is exceeded, `escalate()` is called: the task transitions to `AwaitingInput`, a `task_status_log` row is written, and (if configured) a Slack message is posted via `SLACK_WEBHOOK_URL`.

### Validation Pipeline (`lib/validation-pipeline.ts`)

The pipeline runs five configurable shell commands sequentially. Each has a 5-minute timeout. All commands are sourced from the project's `tooling_config` (via `resolveToolingConfig()`):

| Stage       | Command                                                 | Configurable Per Project            |
| ----------- | ------------------------------------------------------- | ----------------------------------- |
| typescript  | From `projects.tooling_config.typescript` (no default)  | Yes (via `projects.tooling_config`) |
| lint        | From `projects.tooling_config.lint` (no default)        | Yes                                 |
| unit        | From `projects.tooling_config.unit` (no default)        | Yes                                 |
| integration | From `projects.tooling_config.integration` (no default) | Yes                                 |
| e2e         | From `projects.tooling_config.e2e` (no default)         | Yes                                 |

**Important**: There are no hardcoded default commands in `validation-pipeline.ts`. If a stage key is absent or empty in `toolingConfig`, that stage is silently skipped (`passed: true, skipped: true`). The commands shown for the built-in E2E test repo (`pnpm tsc --noEmit`, `pnpm lint`, `pnpm test -- --run`) come from the project registration record, not from the pipeline code.

Each run is recorded in the `validation_runs` table with stage, status, iteration, error output (truncated), and duration.

---

## How the PR Gets Created

The PR creation happens in `src/workers/lib/pr-manager.ts` and is invoked from `orchestrate.mts` step 16.

### PR Title Template

```
[AI] {TICKET_ID}: {summary}
```

Example: `[AI] TEST-300: Add validation script for API contracts`

### PR Body Template (`buildPRBody()` in `pr-manager.ts`)

```markdown
## Ticket: {TICKET_ID}

**Summary:** {summary}

## Description

{description (truncated to 500 chars)}

**Execution ID:** {executionId}

---

_This PR was created automatically by the AI Employee platform._
```

### Idempotency Guard

Before creating, `checkExistingPR()` queries the GitHub API for any open PR on the same head branch. If one already exists, it's reused (returned with `wasExisting: true`). This prevents duplicate PRs when the same task is retried.

### URL Capture and Persistence

After PR creation succeeds, the PR URL is extracted from the response (`pr.html_url`) and persisted in two places via `runCompletionFlow()` in `lib/completion.ts`:

1. **`tasks` table**: `status = Submitting`, `updated_at = now()`
2. **`deliverables` table**: new row with `delivery_type = 'pull_request'` (or `'no_changes'` if no PR URL), `external_ref = <PR URL>`, `status = 'submitted'`
3. **`task_status_log` table**: new row recording the status transition

The order matters: Supabase write happens **first**, Inngest event happens **second**. If the Supabase write fails, the worker exits 1 — the task state has been lost, and the watchdog can recover. If the Supabase write succeeds but the Inngest event fails, the lifecycle function will still detect the `Submitting` status via polling and mark the task `Done`. This is what the plan calls "hard Supabase-first ordering."

### What `viiqswim/ai-employee-test-target` Expects

The test repo used for E2E (`https://github.com/viiqswim/ai-employee-test-target`) is a minimal TypeScript project. The conventions the AI agent expects:

- Package manager: **pnpm** (not npm/yarn)
- Scripts: `build` (tsc), `test` (vitest), `lint` (tsc --noEmit)

These are the commands the validation pipeline runs.

---

## `pollForCompletion` — How the Lifecycle Function Detects Done in Hybrid Mode

Because the worker in hybrid mode does not send an Inngest completion event (no `INNGEST_BASE_URL`), the Lifecycle function cannot use `step.waitForEvent()`. Instead it polls Supabase via `src/inngest/lib/poll-completion.ts`.

### Behavior

```typescript
// pollForCompletion() — opts destructuring
const { taskId, supabaseUrl, supabaseKey, maxPolls = 40, intervalMs = 30_000 } = opts;
```

In hybrid mode:

- `maxPolls = parseInt(process.env.FLY_HYBRID_POLL_MAX ?? '120')` → default **120 polls**
- `intervalMs = 30_000` → **30 seconds between polls**
- Total ceiling: **120 × 30s = 60 minutes**

### Detection Logic

```typescript
// terminal status detection
if (status === 'Submitting' || status === 'Done') {
  return { completed: true, finalStatus: status };
}
if (status === 'AwaitingInput' || status === 'Cancelled') {
  return { completed: false, finalStatus: status };
}
```

- **Terminal success**: `Submitting` or `Done` → returns `{ completed: true }`
- **Terminal failure**: `AwaitingInput` or `Cancelled` → returns `{ completed: false }`
- **Otherwise**: continues polling
- **After exhausting `maxPolls`**: returns `{ completed: false, finalStatus: lastStatus }` and the lifecycle function transitions the task to `AwaitingInput` with a timeout reason

### Critical Fix from This Plan (Commit `1969cae`)

The polling URL must include the `/rest/v1` PostgREST path prefix. Without it, the fetch hits the bare Cloudflare tunnel root and gets a 404 from the Kong gateway. This was discovered during T13 when the lifecycle was correctly polling but always reading "no rows." Fix:

```typescript
// task status query URL
const url = `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`;
```

### Machine Cleanup Guarantee

The hybrid path wraps `pollForCompletion` in a try/finally:

```typescript
// machine cleanup — finally block
finally {
  await destroyMachine(flyWorkerApp, hybridMachine.id).catch((err) => {
    log.warn({ err, machineId: hybridMachine.id }, 'hybrid: failed to destroy machine');
  });
}
```

Whether polling succeeds, times out, or throws, the machine is destroyed. This is why hybrid mode does NOT have the `auto_destroy` bug that the default Fly.io path has.

---

## Environment Variables Reference

Below is the full set of env vars relevant to running the system, grouped by purpose. All are documented in `.env.example`.

### Database

| Var                   | Required | Default                                                      | Purpose                                                       |
| --------------------- | -------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL`        | Yes      | `postgresql://postgres:postgres@localhost:54322/ai_employee` | Prisma connection (must use `ai_employee` DB, NOT `postgres`) |
| `DATABASE_URL_DIRECT` | Yes      | (same as above)                                              | Direct connection for migrations                              |

### Supabase (PostgREST + Auth)

| Var                   | Required | Default                  | Purpose                                           |
| --------------------- | -------- | ------------------------ | ------------------------------------------------- |
| `SUPABASE_URL`        | Yes      | `http://localhost:54321` | PostgREST base URL (used by Lifecycle and worker) |
| `SUPABASE_SECRET_KEY` | Yes      | —                        | Service role key from `supabase status`           |

### Webhooks

| Var                     | Required | Default | Purpose                                                                      |
| ----------------------- | -------- | ------- | ---------------------------------------------------------------------------- |
| `JIRA_WEBHOOK_SECRET`   | Yes      | —       | HMAC-SHA256 secret for Jira webhook verification (use `test-secret` locally) |
| `GITHUB_WEBHOOK_SECRET` | No       | —       | HMAC secret for GitHub webhook                                               |

### Inngest

| Var                   | Required    | Default                 | Purpose                                  |
| --------------------- | ----------- | ----------------------- | ---------------------------------------- |
| `INNGEST_DEV`         | Yes (local) | `1`                     | Set to `1` for local Inngest Dev Server  |
| `INNGEST_EVENT_KEY`   | Yes         | `local`                 | Event key (use `local` for dev)          |
| `INNGEST_SIGNING_KEY` | No          | —                       | Signing key (not required for local dev) |
| `INNGEST_BASE_URL`    | No          | `http://localhost:8288` | Override Inngest server URL              |

### Worker Mode Selection

| Var                   | Required | Default | Purpose                                                                            |
| --------------------- | -------- | ------- | ---------------------------------------------------------------------------------- |
| `USE_LOCAL_DOCKER`    | No       | unset   | Set to `1` for local Docker dispatch                                               |
| `USE_FLY_HYBRID`      | No       | unset   | Set to `1` for hybrid Fly.io dispatch (mutually exclusive with `USE_LOCAL_DOCKER`) |
| `FLY_HYBRID_POLL_MAX` | No       | `120`   | Max 30s polls before timeout (default = 60 min ceiling)                            |
| `TUNNEL_URL`          | No       | unset   | Cloudflare Tunnel URL (required for hybrid mode)                                   |

### Worker Secrets (Passed to Container)

| Var                        | Required | Default                | Purpose                                                                                       |
| -------------------------- | -------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`       | Yes      | —                      | OpenCode AI provider credentials                                                              |
| `OPENROUTER_MODEL`         | No       | `minimax/minimax-m2.7` | Model used for code generation                                                                |
| `PLAN_VERIFIER_MODEL`      | No       | `''` (disabled)        | Model for plan judge gate (e.g. `anthropic/claude-haiku-4-5`); empty string disables the gate |
| `GITHUB_TOKEN`             | Yes      | —                      | Used for `git push` and PR creation                                                           |
| `ORCHESTRATE_TIMEOUT_MINS` | No       | `60`                   | Code generation timeout in minutes                                                            |

### Fly.io

| Var                | Required                   | Default                                      | Purpose                           |
| ------------------ | -------------------------- | -------------------------------------------- | --------------------------------- |
| `FLY_API_TOKEN`    | Yes (hybrid + default Fly) | —                                            | Bearer token for Fly Machines API |
| `FLY_WORKER_APP`   | Yes                        | `ai-employee-workers`                        | Fly app name                      |
| `FLY_WORKER_IMAGE` | No                         | `registry.fly.io/ai-employee-workers:latest` | Image URI                         |

### Optional Integrations

| Var                                                        | Purpose                                         |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `JIRA_API_TOKEN`, `JIRA_BASE_URL`, `JIRA_USER_EMAIL`       | Jira API access (not required for webhook flow) |
| `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_WEBHOOK_URL` | Slack notifications on escalation               |
| `COST_LIMIT_USD_PER_DEPT_PER_DAY`                          | Cost gate (default `50`)                        |
| `AGENT_VERSION_ID`                                         | Tracking ID for agent version                   |

---

## Gateway Routes

The Fastify app (`src/gateway/server.ts`) registers four route groups:

| Route                       | File               | Purpose                                     |
| --------------------------- | ------------------ | ------------------------------------------- |
| `GET /health`               | `routes/health.ts` | Liveness check (returns 200)                |
| `POST /webhooks/jira`       | `routes/jira.ts`   | Jira webhook (HMAC-validated, creates task) |
| `POST /webhooks/github`     | `routes/github.ts` | GitHub webhook (PR events)                  |
| `GET/POST/PUT /api/inngest` | `inngest/serve.ts` | Inngest function registration handler       |

### Inngest Function Registration

`src/gateway/inngest/serve.ts` registers three Inngest functions on the same gateway process (no separate worker):

1. **Lifecycle** (`src/inngest/lifecycle.ts`) — Handles `engineering/task.received`, runs the dispatch logic
2. **Watchdog** (`src/inngest/watchdog.ts`) — Periodically checks for hung tasks and recovers them
3. **Redispatch** (`src/inngest/redispatch.ts`) — Retries failed tasks

All three are registered via `serve({ client: inngest, functions: [lifecycleFn, redispatchFn, watchdogFn] })`.

---

## Scripts (`package.json`)

| Script              | Command                                                                                                | Purpose                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm setup`        | `tsx scripts/setup.ts`                                                                                 | One-time setup: Docker Compose, migrations, seed, build Docker image |
| `pnpm dev:start`    | `tsx scripts/dev-start.ts`                                                                             | Start Supabase + Inngest Dev Server + Gateway with health checks     |
| `pnpm trigger-task` | `tsx scripts/trigger-task.ts`                                                                          | Send mock Jira webhook, poll until terminal state                    |
| `pnpm verify:e2e`   | `tsx scripts/verify-e2e.ts`                                                                            | 12-point integration verification                                    |
| `pnpm fly:setup`    | `tsx scripts/fly-setup.ts`                                                                             | Create Fly.io worker app (one-time)                                  |
| `pnpm fly:image`    | `docker buildx build --platform linux/amd64 --tag registry.fly.io/ai-employee-workers:latest --push .` | Build and push linux/amd64 worker image to Fly registry              |
| `pnpm test`         | `vitest`                                                                                               | Run test suite (818+ tests)                                          |
| `pnpm lint`         | `eslint .`                                                                                             | Lint check                                                           |
| `pnpm build`        | `tsc -p tsconfig.build.json`                                                                           | TypeScript compile                                                   |

### `pnpm dev:start` Sequence

1. Verify Docker daemon and Docker Compose
2. Verify required env vars are set
3. (If `--reset`) `docker compose down -v` and re-seed
4. `docker compose -f docker/docker-compose.yml up -d`
5. Run `prisma migrate deploy`
6. Wait for Supabase health (up to 120s, polls `http://localhost:54321/rest/v1/`)
7. Start Inngest Dev Server (`npx inngest-cli@latest dev -u http://localhost:3000/api/inngest --port 8288`)
8. Wait for Inngest health (up to 30s)
9. Start Gateway (`node --import tsx/esm src/gateway/server.ts`) with `USE_LOCAL_DOCKER=1` env
10. Wait for Gateway health (up to 30s, polls `http://localhost:3000/health`)

### `pnpm trigger-task` Workflow

1. Validate `JIRA_WEBHOOK_SECRET` and payload file exist
2. Read `test-payloads/jira-realistic-task.json` as raw bytes
3. (If `--key TEST-300`) parse JSON, mutate `issue.key`, re-stringify
4. Compute HMAC-SHA256 of body, set `X-Hub-Signature: sha256=<hex>`
5. POST to `http://localhost:3000/webhooks/jira` with the exact bytes
6. Poll Postgres for the task row to appear (up to 10s)
7. Loop: every 30 seconds, query `tasks.status` until it reaches `Done`, `Error`, or `Cancelled`
8. Print final status and (if Done) PR URL

---

## Known Limitations of the Current State

These are real, in-the-code constraints — not pessimism. They're documented so you know what you're working with.

### Hybrid Mode Specific

- **Tunnel must be running locally**. If `cloudflared` isn't reachable when a task fires, the pre-flight check sets the task to `AwaitingInput`. There's no graceful retry; you must restart the tunnel and re-trigger the task.
- **Polling ceiling is 60 minutes**. Configurable via `FLY_HYBRID_POLL_MAX`, but the default rejects tasks that take longer than 60 min.
- **Worker's Inngest completion event will fail silently**. The hybrid env block does not pass `INNGEST_BASE_URL`. The worker tries to send `engineering/task.completed` and silently fails. This is intentional — completion is detected via Supabase polling.
- **Tunnel URL changes on every `cloudflared` restart**. You must update `TUNNEL_URL` between sessions.
- **Worker code changes require BOTH Docker rebuild AND `pnpm fly:image`**. Local mode uses local Docker image, hybrid uses the registry image. They are not synced automatically.

### Default Fly.io (Non-Hybrid) Mode

- **`auto_destroy` bug**. Fly's `auto_destroy: true` flag does not always destroy machines. Hybrid mode does NOT have this bug because it uses an explicit `destroyMachine()` call in a `finally` block. The default Fly.io path still relies on `auto_destroy` and sometimes leaves machines running.
- **Requires Supabase and Inngest reachable from Fly machines**. To use this mode in development, you'd need to migrate Supabase and Inngest to the cloud (Phases A and B of the cloud migration roadmap).

### Gateway / Inngest Local Dev

- **Inngest Dev Server v1.17.7 resolves `step.waitForEvent` immediately**. This is a known upstream bug. The local Docker mode works around it with a manual polling loop. Hybrid mode also avoids `waitForEvent` entirely. Only the default Fly.io path uses real `waitForEvent`, and it depends on Inngest Cloud (not Dev Server) to work correctly.
- **Gateway and Inngest both run as Node processes on your laptop**. There is no production deployment of the gateway. Jira can't actually reach `localhost:3000`, so production Jira webhook delivery is not possible without Phase C (gateway on Fly.io).

### Database / Infrastructure

- **Supabase runs on a custom database name**. The CLI hardcodes `database: postgres`, so this project uses self-hosted Docker Compose with `POSTGRES_DB=ai_employee` to make PostgREST natively use the right database. Do not run `supabase start` — it will create a split-brain.
- **`ai_employee` database is not the default `postgres` database**. Always use `postgresql://postgres:postgres@localhost:54322/ai_employee`.

### Test Suite

- Two pre-existing test failures are expected and ignored: `container-boot.test.ts` (requires Docker socket) and `inngest-serve.test.ts` (function count check). Do not "fix" them.
- A third file (`tests/workers/lib/session-manager.test.ts:499:27`) has a known eslint failure. Never run `pnpm lint` globally — it always fails on this line.

---

## What Was Built in This Plan (`hybrid-local-flyio-workers`)

The plan added or modified these files (other files in the codebase remain untouched):

### New Files

| File                                              | Purpose                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `src/inngest/lib/poll-completion.ts`              | Extracted polling helper, used by hybrid and local Docker modes      |
| `src/lib/tunnel-client.ts`                        | Tunnel URL resolver — reads `TUNNEL_URL` env var (Cloudflare Tunnel) |
| `tests/inngest/lib/poll-completion.test.ts`       | Unit tests for polling logic                                         |
| `tests/lib/tunnel-client.test.ts`                 | Unit tests for tunnel URL resolution                                 |
| `docs/2026-04-06-2205-cloud-migration-roadmap.md` | Phase A→D migration roadmap                                          |

### Modified Files

| File                        | Change                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/inngest/lifecycle.ts`  | Added hybrid Fly.io dispatch branch, pre-flight tunnel check, direct fetch to Fly Machines API, polling, finally-block cleanup |
| `src/workers/entrypoint.sh` | Added `\|\| true` after curl commands in steps 5 and 6 to prevent `set -e` from aborting retry loops                           |
| `Dockerfile`                | (No changes — image still rebuilt via `docker buildx` for `linux/amd64`)                                                       |
| `package.json`              | Added `fly:image` and `fly:setup` scripts                                                                                      |
| `AGENTS.md`                 | Added "Hybrid Fly.io Mode" section, "Long-Running Command Protocol" section                                                    |
| `.env.example`              | Added `USE_FLY_HYBRID`, `FLY_HYBRID_POLL_MAX`, `NGROK_AGENT_URL`, `TUNNEL_URL`                                                 |

### Files Deliberately NOT Modified

| File                        | Why                                                                |
| --------------------------- | ------------------------------------------------------------------ |
| `src/lib/fly-client.ts`     | Still used by default Fly.io path; modifying would risk regression |
| `src/inngest/watchdog.ts`   | Out of scope                                                       |
| `src/inngest/redispatch.ts` | Out of scope                                                       |

### Verification Results (Final Wave)

| Audit                               | Verdict | Detail                                                                                     |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| F1 — Plan Compliance Audit (oracle) | APPROVE | 10/10 Must Have, 10/10 Must NOT Have, 16/16 tasks                                          |
| F2 — Code Quality Review            | APPROVE | Build PASS, 562 tests pass, 8 pre-existing failures (expected)                             |
| F3 — Real Manual QA                 | APPROVE | Happy path, negative path, cleanup all verified                                            |
| F4 — Scope Fidelity Check (deep)    | APPROVE | 13/13 task scopes, 3/3 untouched files, TUNNEL_URL noted as necessary operational addition |

### T13 — End-to-End Evidence

A real Jira-to-PR run completed successfully:

- **PR**: <https://github.com/viiqswim/ai-employee-test-target/pull/19>
- **Fly machine**: `d8d5246b231258` (destroyed after completion)
- **Total duration**: 14 minutes 6 seconds
- **Tunnel used**: Cloudflare Tunnel
- **Evidence files**: `.sisyphus/evidence/task-13-*`

---

## What Was Built in This Plan (`plan-judge-gate`)

The plan added or modified these files (other files in the codebase remain untouched):

### New Files

| File                                   | Purpose                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/workers/lib/plan-judge.ts`        | `callPlanJudge()` — calls OpenRouter with SVR rubric (`scope_match`, `function_names`, `no_hallucination`); defaults to PASS on LLM error |
| `tests/workers/lib/plan-judge.test.ts` | 7 unit test scenarios for the judge function                                                                                              |

### Modified Files

| File                                       | Change                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/workers/lib/planning-orchestrator.ts` | Judge gate + retry loop injected after `validatePlan()`, before `chmod 0o444`; throws `PlanJudgeExhaustedError` on exhaustion |
| `src/workers/lib/prompt-builder.ts`        | Added `buildCorrectionPrompt()` (sync) used by the retry loop                                                                 |
| `src/workers/config/long-running.ts`       | Added `planVerifierModel: string` field (reads `PLAN_VERIFIER_MODEL`, default `''`)                                           |
| `src/inngest/lifecycle.ts`                 | `PLAN_VERIFIER_MODEL` added to all 3 dispatch paths                                                                           |
| `src/workers/orchestrate.mts`              | `callPlanJudge` wired into `runPlanningPhase`; `extractTicketFromTask` fixed to read from `triage_result`                     |
| `.env.example`                             | Added `PLAN_VERIFIER_MODEL=anthropic/claude-haiku-4-5` with disable comment                                                   |

### Verification Results (Final Wave)

| Audit                               | Verdict | Detail                                                                    |
| ----------------------------------- | ------- | ------------------------------------------------------------------------- |
| F1 — Plan Compliance Audit (oracle) | APPROVE | All Must Have / Must NOT Have checks passed                               |
| F2 — Code Quality Review            | APPROVE | Build PASS, 818 tests pass (50 pre-existing failures, 10 skipped)         |
| F3 — Real Manual QA                 | APPROVE | All QA scenarios passed; `plan-judge: verdict=PASS` confirmed in Fly logs |
| F4 — Scope Fidelity Check (deep)    | APPROVE | All tasks compliant, no scope creep                                       |

### E2E Evidence

- **PR**: <https://github.com/viiqswim/ai-employee-test-target/pull/34>
- **Task UUID**: `80ad6037-9d81-499e-aa83-2d9b81aa3f61`
- **Plan judge log**: `plan-judge: verdict=PASS` at `2026-04-13T19:01:07Z`
- **`verify:e2e` result**: 12/12 checks PASSED

---

## Where We Are Now / What Is Next

The system is **fully functional locally** with the option to dispatch real Fly.io machines for the worker container. This is the highest-fidelity local development setup possible without paying for any cloud services beyond the Fly.io worker app itself (which is free at idle).

### What's Next: The Cloud Migration Roadmap

The next step is to gradually migrate components to the cloud. The roadmap (`docs/2026-04-06-2205-cloud-migration-roadmap.md`) defines four independent phases. You can stop after any one of them and still have a working system.

| Phase | Component                  | Trigger                                                                      | Effort |
| ----- | -------------------------- | ---------------------------------------------------------------------------- | ------ |
| **A** | Supabase → Supabase Cloud  | When Cloudflare URL instability becomes annoying                             | Low    |
| **B** | Inngest → Inngest Cloud    | When you want real `waitForEvent` instead of the polling hack                | Low    |
| **C** | Gateway → Fly.io app       | When you need real Jira webhook delivery (Jira can't reach `localhost:3000`) | Medium |
| **D** | Worker → Fly.io as default | After A, B, C are done — removes hybrid mode and `USE_LOCAL_DOCKER`          | Low    |

### Recommended Next Concrete Actions

1. **Use the system as-is for a few weeks**. Trigger several real tasks via hybrid mode. Discover any rough edges (tunnel restarts, polling timeouts, image rebuilds).
2. **When ready, do Phase A first**. Supabase Cloud is the most impactful single step — it eliminates the tunnel dependency entirely. After Phase A, hybrid mode no longer needs Cloudflare Tunnel because Fly machines reach Supabase Cloud directly.
3. **Then Phase B (Inngest Cloud)**. This unlocks real `waitForEvent` and removes the polling hack from `lifecycle.ts`.
4. **Then Phase C (Gateway on Fly.io)**. This makes real Jira webhook delivery possible.
5. **Finally Phase D (cleanup)**. Remove `USE_LOCAL_DOCKER` and `USE_FLY_HYBRID` code paths once they're no longer needed.

### What This Plan Did Not Do (Out of Scope)

- Did not migrate Supabase, Inngest, or the Gateway to the cloud
- Did not fix the `auto_destroy` bug in `fly-client.ts` (default Fly.io path still has it)
- Did not add observability/alerting
- Did not add multi-tenant isolation
- Did not add production secrets management
- Did not change the default model (`minimax/minimax-m2.7`)

These are tracked in the cloud migration roadmap's "What This Roadmap Does NOT Cover" section.

---

## Related Documentation

| Document                                                                             | Description                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [System Overview (pre-hybrid)](./2026-04-01-1726-system-overview.md)                 | The original architecture doc — still accurate for Phase 8 baseline                     |
| [Phase 8: E2E](./2026-04-01-1655-phase8-e2e.md)                                      | The MVP build that established `USE_LOCAL_DOCKER` mode                                  |
| [Cloud Migration Roadmap (Phases A→D)](./2026-04-06-2205-cloud-migration-roadmap.md) | What comes next                                                                         |
| [Phase 7: Resilience](./2026-04-01-0114-phase7-resilience.md)                        | Watchdog, redispatch, error handling                                                    |
| [Troubleshooting](./2026-04-01-2110-troubleshooting.md)                              | Common E2E failures and fixes                                                           |
| `AGENTS.md` (project root)                                                           | Living instructions for agents working in this repo, including the hybrid mode workflow |

---

_This document was generated after the `hybrid-local-flyio-workers` plan reached Final Verification Wave APPROVE on all four audits (F1-F4). It supersedes the relevant sections of `docs/2026-04-01-1726-system-overview.md` for anything related to worker dispatch and the new hybrid mode. The pre-hybrid sections of that older doc (database schema, project structure, Phase 1-7 history) remain accurate and are not duplicated here._
