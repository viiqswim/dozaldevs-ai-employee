# Doc Update: Full accuracy audit of hybrid-mode and dev-loop docs

## TL;DR

> **Quick Summary**: Full accuracy audit of both documentation files against current live codebase. The audit found 16 discrepancies across both docs — some from the `plan-judge-gate` feature, many pre-existing from prior architectural changes (wave-based execution, entrypoint.sh restructure, etc.). Every edit is sourced from a specific file and line range.
>
> **Deliverables**:
>
> - `docs/2026-04-07-1732-hybrid-mode-current-state.md` — 12 targeted edits
> - `docs/2026-04-08-1357-project-registration-and-development-loop.md` — 4 targeted edits
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — sequential edits to two files
> **Critical Path**: Edit Doc 1 → Edit Doc 2 → Commit

---

## Context

### Original Request

"Based on everything we've accomplished so far, can you please help me check if the following two documents are still up to date? If not, then please update them with the correct information."

### Audit Methodology

5 parallel explore agents audited the full codebase against both documents:

- **Agent 1**: Dockerfile, entrypoint.sh
- **Agent 2**: lifecycle.ts — all 3 dispatch paths, all env blocks, line numbers
- **Agent 3**: fix-loop.ts, validation-pipeline.ts, pr-manager.ts, poll-completion.ts
- **Agent 4**: gateway routes, package.json scripts, dev-start.ts sequence
- **Agent 5**: orchestrate.mts full flow, branch-manager.ts, completion.ts, long-running.ts

### Complete Discrepancy Register

All discrepancies found, sourced from live code:

| #   | Document | Section                                         | Current (Wrong)                                                                                                               | Correct                                                                                                                                                                                                                                                                                                                                | Source                                                       |
| --- | -------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| D1  | Doc 1    | entrypoint.sh step table                        | "8-step" + step 4 = "pnpm install" + step 8 = "exec orchestrate"                                                              | 7 declared steps; step 4 = Docker daemon; no pnpm install step; sub-steps 3.5, 3.6, 3.7, 6.5 exist; step 7 = handoff                                                                                                                                                                                                                   | `entrypoint.sh`                                              |
| D2  | Doc 1    | entrypoint.sh critical fix note                 | "step 6 (and Step 7) use `\|\| true`..."                                                                                      | Step 5 (task_context) and step 6 (heartbeat) are the curl steps using `\|\| true`                                                                                                                                                                                                                                                      | `entrypoint.sh`                                              |
| D3  | Doc 1    | Hybrid env block header                         | `lifecycle.ts:144-160`                                                                                                        | `lifecycle.ts:155-170`                                                                                                                                                                                                                                                                                                                 | `lifecycle.ts:155-170`                                       |
| D4  | Doc 1    | Hybrid env block code                           | Missing `EXECUTION_ID` field                                                                                                  | `EXECUTION_ID: executionId` must be listed (it's the 2nd field at line 159)                                                                                                                                                                                                                                                            | `lifecycle.ts:159`                                           |
| D5  | Doc 1    | Hybrid env block code                           | Missing `PLAN_VERIFIER_MODEL` field                                                                                           | `PLAN_VERIFIER_MODEL: process.env.PLAN_VERIFIER_MODEL ?? ''` at end of env block                                                                                                                                                                                                                                                       | `lifecycle.ts:167`                                           |
| D6  | Doc 1    | Mode comparison table — "Both flags"            | "local Docker wins (precedence in the if-chain)"                                                                              | When both flags are set, lines 247–249 do a **silent early return** — no dispatch, no status update                                                                                                                                                                                                                                    | `lifecycle.ts:247-249`                                       |
| D7  | Doc 1    | Mode comparison table — Local Docker completion | Vague "manual polling loop (30s × 40)"                                                                                        | `step.sleep` + `step.run` polling loop, MAX_POLLS=360, 30s interval → up to **180 min** ceiling                                                                                                                                                                                                                                        | `lifecycle.ts:402-430`                                       |
| D8  | Doc 1    | Mode comparison table — Default Fly completion  | `step.waitForEvent('engineering/task.completed')`                                                                             | Same function but timeout is `'8h30m'` (not implied 8h)                                                                                                                                                                                                                                                                                | `lifecycle.ts:435-439`                                       |
| D9  | Doc 1    | dev:start sequence step 7                       | "Start Gateway (`tsx src/gateway/server.ts`)"                                                                                 | Actual command: `node --import tsx/esm src/gateway/server.ts`                                                                                                                                                                                                                                                                          | `scripts/dev-start.ts`                                       |
| D10 | Doc 1    | Validation pipeline — default commands table    | Shows default commands like `pnpm tsc --noEmit` for each stage                                                                | **No defaults exist in code.** All commands come from `toolingConfig`. Stages without a key are silently skipped.                                                                                                                                                                                                                      | `validation-pipeline.ts`                                     |
| D11 | Doc 1    | orchestrate.mts flow                            | Old 16-step flat table; step 8 = "30s health timeout"; step 9 = single OpenCode session; no planning phase; no wave execution | Completely replaced: entrypoint.sh installs nothing; orchestrate runs pre-flight (install + branch + server); Phase 1 (planning + judge gate); Phase 2 (wave-by-wave execution + cost breaker + between-wave push); finalize (fix-loop + commit + PR); `opencode serve --port 4096 --hostname 0.0.0.0`; health timeout = 60s (not 30s) | `orchestrate.mts`, `opencode-server.ts`, `branch-manager.ts` |
| D12 | Doc 1    | pnpm test row                                   | "515+ tests"                                                                                                                  | "818+ tests"                                                                                                                                                                                                                                                                                                                           | live test run                                                |
| D13 | Doc 1    | (missing section)                               | No "What Was Built in plan-judge-gate" section                                                                                | New section needed                                                                                                                                                                                                                                                                                                                     | plan-judge-gate plan                                         |
| D14 | Doc 2    | Step 3 "What the AI does"                       | Steps 1-9 missing planning phase, wave execution; branch creation described wrong order; install in entrypoint                | Full rewrite: clone → install (orchestrate pre-flight) → branch → start OpenCode server → planning phase → judge gate → wave-by-wave execution → fix-loop → commit + PR                                                                                                                                                                | `orchestrate.mts`                                            |
| D15 | Doc 2    | Step 4 PR title                                 | "Title: the ticket summary verbatim"                                                                                          | `[AI] {TICKET_ID}: {summary}`                                                                                                                                                                                                                                                                                                          | `pr-manager.ts:137`                                          |
| D16 | Doc 2    | Prerequisites                                   | Missing `PLAN_VERIFIER_MODEL`                                                                                                 | Add as optional prereq                                                                                                                                                                                                                                                                                                                 | `.env.example:49`                                            |

---

## Work Objectives

### Core Objective

Apply all 16 discrepancy fixes across both documents. Every claim must be sourced from the specific file listed in the discrepancy register above. The existing quality standard of the doc ("every claim is sourced from a specific file and line range; nothing assumed, embellished, or aspirational") must be maintained.

### Concrete Deliverables

- `docs/2026-04-07-1732-hybrid-mode-current-state.md` updated (12 edits)
- `docs/2026-04-08-1357-project-registration-and-development-loop.md` updated (4 edits)

### Definition of Done

- [ ] D1: entrypoint.sh table accurate (7 steps, step 4 = Docker daemon, sub-steps present, no pnpm install)
- [ ] D2: critical fix note references correct step numbers (5 and 6, not 6 and 7)
- [ ] D3: hybrid env block header updated to `lifecycle.ts:155-170`
- [ ] D4: `EXECUTION_ID` present in hybrid env block code snippet
- [ ] D5: `PLAN_VERIFIER_MODEL` present in hybrid env block code snippet
- [ ] D6: both-flags-set behavior corrected to "silent early return — no dispatch"
- [ ] D7: local Docker poll ceiling updated to 180 min (360×30s)
- [ ] D8: default Fly.io waitForEvent timeout updated to `'8h30m'`
- [ ] D9: dev:start step 7 gateway command corrected to `node --import tsx/esm src/gateway/server.ts`
- [ ] D10: validation pipeline table note updated — no defaults in code, stages skipped if key absent
- [ ] D11: orchestrate.mts flow table fully rewritten to reflect two-phase wave architecture
- [ ] D12: pnpm test row updated to "818+ tests"
- [ ] D13: "What Was Built in plan-judge-gate" section added
- [ ] D14: Step 3 "What the AI does" rewritten in Doc 2
- [ ] D15: PR title corrected in Doc 2 Step 4
- [ ] D16: `PLAN_VERIFIER_MODEL` added to Doc 2 Prerequisites

### Must NOT Have (Guardrails)

- Do NOT modify `.sisyphus/plans/2026-04-12-2110-plan-judge-gate.md`
- Do NOT invent or embellish — every claim must be sourced from the file listed in the discrepancy register
- Do NOT touch any source code files
- Do NOT restructure the documents beyond the targeted edits — preserve all section headers, ordering, and prose that is already accurate
- Do NOT introduce claims about features not yet verified (e.g. cost breaker details not previously documented — mention wave-by-wave execution but do not invent config values)

---

## Verification Strategy

- **Automated tests**: NONE (doc-only changes)
- **Agent-Executed QA**: grep-based verification that key strings are present/absent in both files after edits

---

## Execution Strategy

```
Wave 1: Task 1 — Edit Doc 1 (12 edits, sequential within task)
Wave 2: Task 2 — Edit Doc 2 (4 edits, sequential within task)
Wave FINAL: Task F1 — grep-based completeness check
```

---

## TODOs

---

- [x] 1. Update `docs/2026-04-07-1732-hybrid-mode-current-state.md` — 12 edits

  Read the full document before making any edits. Apply all 12 edits in sequence. If any `oldString` is not found exactly, read that section of the file again before retrying.

  ***

  ### Edit 1 (D1+D2) — Rewrite entrypoint.sh boot sequence table

  The current table has 8 rows and describes step 4 as `pnpm install --frozen-lockfile` which no longer exists in entrypoint.sh. The current script has 7 declared steps and 4 sub-steps. There is no install step in entrypoint.sh — install runs inside orchestrate.mts pre-flight.

  **Find** (exact match including surrounding lines for uniqueness):

  ````
  ### entrypoint.sh — 8-Step Boot Sequence

  The entrypoint script is idempotent: it uses flag files in `/tmp/.boot-flags/` so a restart skips already-completed steps.

  | Step | Action                                                                                                         | Retry                  | Failure Behavior        |
  | ---- | -------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------- |
  | 1    | Set up git credentials (`~/.git-credentials`, `~/.netrc`), authenticate `gh`, set git user.name and user.email | None                   | Exits 1                 |
  | 2    | `git clone --depth=2 ${REPO_URL} /workspace`                                                                   | 3 attempts, 5s backoff | Exits 1 after attempt 3 |
  | 3    | If `TASK_BRANCH` set, checkout existing or create new branch                                                   | None                   | Exits 1                 |
  | 4    | `pnpm install --frozen-lockfile`                                                                               | 3 attempts, 5s backoff | Exits 1 after attempt 3 |
  | 5    | If `ENABLE_DOCKER_DAEMON` set, start `dockerd-rootless.sh` in background                                       | None                   | Logs warning, continues |
  | 6    | `curl ${SUPABASE_URL}/rest/v1/tasks?id=eq.${TASK_ID}` → `/workspace/.task-context.json`                        | 3 attempts, 5s backoff | Exits 1 after attempt 3 |
  | 7    | POST initial heartbeat to `executions` table → save execution ID to `/tmp/.execution-id`                       | 3 attempts, 5s backoff | Logs warning, continues |
  | 7.5  | Write `~/.local/share/opencode/auth.json` with `{openrouter: {type: api, key: ...}}`                           | None                   | Logs warning, continues |
  | 8    | `exec node /app/dist/workers/orchestrate.mjs`                                                                  | N/A                    | Replaces shell process  |

  **Critical fix from this plan (commit `bd34f83`)**: Step 6 (and Step 7) use `|| true` after the `curl` command. Without this, the `set -e` directive at the top of the script would cause the script to exit on a single curl failure before the retry loop could try again. The bug was discovered during T11 — the worker was exiting silently after one Supabase fetch attempt instead of retrying.

  ```bash
  # entrypoint.sh — fixed pattern
  HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "apikey: ${SUPABASE_SECRET_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SECRET_KEY}" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}/rest/v1/tasks?id=eq.${TASK_ID}&select=*") || true
  ````

  ```

  **Replace with**:
  ```

  ### entrypoint.sh — Boot Sequence

  The entrypoint script is idempotent: it uses flag files in `/tmp/.boot-flags/` so a restart skips already-completed steps. The script declares 7 numbered steps, with several sub-steps in between.

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

  ```

  ---

  ### Edit 2 (D3+D4+D5) — Fix hybrid env block header and add missing fields

  **Find**:
  ```

  This is the exact JSON sent to Fly's Machines API in hybrid mode (`lifecycle.ts:144-160`):

  ```typescript
  body: JSON.stringify({
    config: {
      image: flyWorkerImage,
      guest: { cpu_kind: 'performance', cpus: 2, memory_mb: 4096 },
      restart: { policy: 'no' },
      env: {
        TASK_ID: taskId,
        REPO_URL: hybridRepoUrl ?? '',
        REPO_BRANCH: hybridRepoBranch ?? 'main',
        SUPABASE_URL: tunnelUrl, // ← from getNgrokTunnelUrl()
        SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? '',
        GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? '',
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
        OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? 'minimax/minimax-m2.7',
      },
    },
  });
  ```

  ```

  **Replace with**:
  ```

  This is the exact JSON sent to Fly's Machines API in hybrid mode (`lifecycle.ts:155-170`):

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

  ```

  ---

  ### Edit 3 (D6) — Correct "both flags set" behavior in mode comparison table

  **Find**:
  ```

  If both flags are set, local Docker wins (precedence in the if-chain).

  ```

  **Replace with**:
  ```

  If both flags are set (`USE_FLY_HYBRID=1` AND `USE_LOCAL_DOCKER=1`), neither path runs — the `dispatch-fly-machine` step returns early at lines 247–249 with no dispatch and no status update. This is a silent no-op. Use only one flag at a time.

  ```

  ---

  ### Edit 4 (D7) — Fix local Docker completion detection description in mode comparison table

  **Find**:
  ```

  | **Completion detection** | Manual polling loop (30s × 40) — `waitForEvent` is broken on Inngest Dev Server | `pollForCompletion()` (30s × 120 = 60 min) | `step.waitForEvent('engineering/task.completed')` |

  ```

  **Replace with**:
  ```

  | **Completion detection** | `step.sleep` + `step.run` polling loop (30s × 360 = 180 min ceiling) — `waitForEvent` is broken on Inngest Dev Server | `pollForCompletion()` (30s × 120 = 60 min) | `step.waitForEvent('engineering/task.completed', { timeout: '8h30m' })` |

  ```

  ---

  ### Edit 5 (D9) — Fix dev:start step 7 gateway start command

  **Find**:
  ```

  9. Start Gateway (`tsx src/gateway/server.ts`) with `USE_LOCAL_DOCKER=1` env

  ```

  **Replace with**:
  ```

  9. Start Gateway (`node --import tsx/esm src/gateway/server.ts`) with `USE_LOCAL_DOCKER=1` env

  ```

  ---

  ### Edit 6 (D10) — Fix validation pipeline defaults claim

  The current table implies each stage has a hardcoded default command. There are no defaults in `validation-pipeline.ts` — all commands come from `toolingConfig` and stages with no key are silently skipped.

  **Find**:
  ```

  | Stage       | Command              | Configurable Per Project            |
  | ----------- | -------------------- | ----------------------------------- |
  | typescript  | `pnpm tsc --noEmit`  | Yes (via `projects.tooling_config`) |
  | lint        | `pnpm lint`          | Yes                                 |
  | unit        | `pnpm test -- --run` | Yes                                 |
  | integration | (none by default)    | Yes                                 |
  | e2e         | (none by default)    | Yes                                 |

  ```

  **Replace with**:
  ```

  | Stage       | Command                                                 | Configurable Per Project            |
  | ----------- | ------------------------------------------------------- | ----------------------------------- |
  | typescript  | From `projects.tooling_config.typescript` (no default)  | Yes (via `projects.tooling_config`) |
  | lint        | From `projects.tooling_config.lint` (no default)        | Yes                                 |
  | unit        | From `projects.tooling_config.unit` (no default)        | Yes                                 |
  | integration | From `projects.tooling_config.integration` (no default) | Yes                                 |
  | e2e         | From `projects.tooling_config.e2e` (no default)         | Yes                                 |

  **Important**: There are no hardcoded default commands in `validation-pipeline.ts`. If a stage key is absent or empty in `toolingConfig`, that stage is silently skipped (`passed: true, skipped: true`). The commands shown for the built-in E2E test repo (`pnpm tsc --noEmit`, `pnpm lint`, `pnpm test -- --run`) come from the project registration record, not from the pipeline code.

  ```

  ---

  ### Edit 7 (D11) — Rewrite orchestrate.mts flow section

  This is the largest edit. The old 16-step flat table is replaced with the current two-phase wave architecture.

  **Find**:
  ```

  ### orchestrate.mts — 16-Step Orchestration Flow

  After `exec node /app/dist/workers/orchestrate.mjs`, the Node process takes over. Here's what it does:

  | Step | Action                                                                                                 | Module                    |
  | ---- | ------------------------------------------------------------------------------------------------------ | ------------------------- |
  | 1    | Read execution ID from `/tmp/.execution-id`                                                            | inline                    |
  | 2    | Create PostgREST HTTP client (uses `SUPABASE_URL`, `SUPABASE_SECRET_KEY`)                              | `lib/postgrest-client.ts` |
  | 3    | Parse `/workspace/.task-context.json`                                                                  | `lib/task-context.ts`     |
  | 4    | Fetch project config (repo URL, default branch, tooling config)                                        | `lib/project-config.ts`   |
  | 5    | Build markdown prompt from Jira metadata (handles ADF and plain text)                                  | `lib/task-context.ts`     |
  | 6    | Compute agent version hash (prompt template + model + tool config), upsert `agent_versions`            | inline                    |
  | 7    | Start 60-second heartbeat to `executions` table                                                        | `lib/heartbeat.ts`        |
  | 8    | Spawn `opencode serve --port 4096`, poll `/global/health` until healthy (30s timeout)                  | `lib/opencode-server.ts`  |
  | 8.5  | PUT `/auth/openrouter` to OpenCode server (belt-and-suspenders alongside `auth.json`)                  | inline fetch              |
  | 9    | Create OpenCode session, inject task prompt (provider: `openrouter`, model: `minimax/minimax-m2.7`)    | `lib/session-manager.ts`  |
  | 10   | Monitor session via SSE for `session.idle` event (60-min timeout, 30s minimum elapsed)                 | `lib/session-manager.ts`  |
  | 11   | Run fix loop: validation pipeline → on failure send fix prompt → retry up to 3 per stage, 10 globally  | `lib/fix-loop.ts`         |
  | 12   | If success: build branch name `ai/{TICKET_ID}-{kebab-slug}` (max 60 chars), checkout or create         | `lib/branch-manager.ts`   |
  | 13   | `git add -A` → commit with `feat: {TICKET_ID} - {summary}` → `git push --force-with-lease`             | `lib/branch-manager.ts`   |
  | 14   | Check for existing PR on branch; if none, `gh pr create` with title `[AI] {TICKET_ID}: {summary}`      | `lib/pr-manager.ts`       |
  | 15   | PATCH `tasks.status = Submitting`, POST to `deliverables` table with PR URL, POST to `task_status_log` | `lib/completion.ts`       |
  | 16   | Send `engineering/task.completed` event to Inngest (non-fatal — fails silently in hybrid mode)         | `lib/completion.ts`       |

  ```

  **Replace with**:
  ```

  ### orchestrate.mts — Two-Phase Orchestration Flow

  After `exec node /app/dist/workers/orchestrate.mjs`, the Node process takes over. It runs in six sequential functions: `parseContextFromEnv` → `readConfigFromEnv` → `runPreFlight` → `phase1Planning` → `phase2Execution` → `finalize`.

  #### Pre-flight (runs before planning)

  | Step | Action                                                                                                                        | Module                                         |
  | ---- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
  | 1    | Read execution ID from `EXECUTION_ID` env var or `/tmp/.execution-id`; create PostgREST client                                | inline                                         |
  | 2    | Parse `/workspace/.task-context.json`; fetch project config from Supabase                                                     | `lib/task-context.ts`, `lib/project-config.ts` |
  | 3    | Resolve tooling config; run install command (default: `pnpm install --frozen-lockfile`) in `/workspace`                       | `lib/install-runner.ts`                        |
  | 4    | Start 60-second heartbeat to `executions` table                                                                               | `lib/heartbeat.ts`                             |
  | 5    | Spawn `opencode serve --port 4096 --hostname 0.0.0.0`, poll `http://localhost:4096/global/health` until healthy (60s timeout) | `lib/opencode-server.ts`                       |
  | 6    | PUT `/auth/openrouter` to OpenCode server (belt-and-suspenders alongside `auth.json`)                                         | inline fetch                                   |
  | 7    | Build branch name `ai/{TICKET_ID}-{kebab-slug}` (slug max 60 chars), create or checkout branch in `/workspace`                | `lib/branch-manager.ts`                        |

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

  | Step | Action                                                                                                     | Module                   |
  | ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------ |
  | 13   | Create final OpenCode session with fix-loop prompt; monitor session                                        | `lib/session-manager.ts` |
  | 14   | Run fix loop: validation pipeline → on failure send fix prompt → retry up to 3 per stage, 10 globally      | `lib/fix-loop.ts`        |
  | 15   | `git add -A` → commit with `feat: {TICKET_ID} - {summary}` → `git push --force-with-lease`                 | `lib/branch-manager.ts`  |
  | 16   | Check for existing PR on branch; if none, `gh pr create` with title `[AI] {TICKET_ID}: {summary}`          | `lib/pr-manager.ts`      |
  | 17   | PATCH `tasks.status = Submitting`, POST to `deliverables` table with PR URL, POST to `task_status_log`     | `lib/completion.ts`      |
  | 18   | Send `engineering/task.completed` event to Inngest (retried 3×; non-fatal — fails silently in hybrid mode) | `lib/completion.ts`      |

  ```

  ---

  ### Edit 8 (D12) — Update pnpm test row test count

  **Find**:
  ```

  | `pnpm test` | `vitest` | Run test suite (515+ tests) |

  ```

  **Replace with**:
  ```

  | `pnpm test` | `vitest` | Run test suite (818+ tests) |

  ```

  ---

  ### Edit 9 (D13) — Add "What Was Built in plan-judge-gate" section

  Insert a new section immediately **before** the line `---\n\n## Where We Are Now / What Is Next`.

  **Find**:
  ```

  ***

  ## Where We Are Now / What Is Next

  ```

  **Replace with**:
  ```

  ***

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
  | `src/inngest/lifecycle.ts`                 | `PLAN_VERIFIER_MODEL` added to all 3 dispatch paths (lines 167, 278, 346)                                                     |
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

  ***

  ## Where We Are Now / What Is Next

  ```

  ---

  ### Edit 10 (D5 table) — Add `PLAN_VERIFIER_MODEL` row to Worker Secrets env vars table

  **Find**:
  ```

  | `OPENROUTER_MODEL` | No | `minimax/minimax-m2.7` | Model used for code generation |
  | `GITHUB_TOKEN` | Yes | — | Used for `git push` and `gh pr create` |

  ```

  **Replace with**:
  ```

  | `OPENROUTER_MODEL` | No | `minimax/minimax-m2.7` | Model used for code generation |
  | `PLAN_VERIFIER_MODEL` | No | `''` (disabled) | Model for plan judge gate (e.g. `anthropic/claude-haiku-4-5`); empty string disables the gate |
  | `GITHUB_TOKEN` | Yes | — | Used for `git push` and `gh pr create` |

  ```

  ---

  ### Edit 11 — Fix hybrid mode sequence diagram step 12 description

  The sequence diagram at line ~240 labels the orchestrate.mts step as "16 steps" which is now outdated.

  **Find**:
  ```

      M->>M: orchestrate.mts (16 steps)

  ```

  **Replace with**:
  ```

      M->>M: orchestrate.mts (two-phase: planning + wave execution)

  ```

  ---

  ### Edit 12 — Fix hybrid mode sequence walkthrough step 12 description

  The flow walkthrough table step 12 also references "16 steps":

  **Find**:
  ```

  | 12 | Worker | orchestrate.mts runs OpenCode session, validation pipeline, fix loop, branch + commit + PR |

  ```

  **Replace with**:
  ```

  | 12 | Worker | orchestrate.mts runs Phase 1 (planning + judge gate), Phase 2 (wave-by-wave execution), then fix loop, branch + commit + PR |

  ```

  ---

  **Must NOT do**:
  - Do not modify `.sisyphus/plans/2026-04-12-2110-plan-judge-gate.md`
  - Do not invent details about cost breaker config values, continuation limits, or wave timeout durations that aren't already documented
  - Do not restructure any section of the document beyond the 12 targeted edits above

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 12 edits, some large (entrypoint table rewrite, orchestrate flow rewrite), requiring careful string matching and context preservation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `docs/2026-04-07-1732-hybrid-mode-current-state.md` — **read it fully** before any edits
  - `src/workers/entrypoint.sh` — ground truth for step table (D1, D2)
  - `src/inngest/lifecycle.ts:155-170` — hybrid env block (D3, D4, D5)
  - `src/inngest/lifecycle.ts:247-249` — both-flags-set silent return (D6)
  - `src/inngest/lifecycle.ts:402-430` — local Docker polling loop (D7)
  - `src/inngest/lifecycle.ts:435-439` — default Fly waitForEvent timeout (D8)
  - `scripts/dev-start.ts` — gateway spawn command (D9)
  - `src/workers/lib/validation-pipeline.ts` — no defaults, stages skipped if key absent (D10)
  - `src/workers/orchestrate.mts` — full two-phase flow (D11)
  - `src/workers/lib/opencode-server.ts` — port 4096, `--hostname 0.0.0.0`, 60s health timeout (D11)
  - `src/workers/lib/branch-manager.ts` — branch format, 60-char slug limit (D11)

  **Acceptance Criteria**:
  - [ ] `grep -c "8-Step Boot" docs/2026-04-07-1732-hybrid-mode-current-state.md` → `0`
  - [ ] `grep -c "pnpm install --frozen-lockfile" docs/2026-04-07-1732-hybrid-mode-current-state.md` → `0` (removed from entrypoint table)
  - [ ] `grep -c "EXECUTION_ID" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1
  - [ ] `grep -c "PLAN_VERIFIER_MODEL" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥2 (env block + table)
  - [ ] `grep -c "silent" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1 (both-flags-set fix)
  - [ ] `grep -c "180 min" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1 (local Docker poll fix)
  - [ ] `grep -c "8h30m" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1 (default Fly timeout fix)
  - [ ] `grep -c "node --import tsx/esm" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1 (gateway command fix)
  - [ ] `grep -c "no hardcoded default\|no default\|silently skipped\|absent" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1 (validation pipeline fix)
  - [ ] `grep -c "Two-Phase\|two-phase\|Wave-by-Wave\|wave-by-wave" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1 (orchestrate flow rewrite)
  - [ ] `grep -c "818+" docs/2026-04-07-1732-hybrid-mode-current-state.md` → `1`
  - [ ] `grep -c "515+" docs/2026-04-07-1732-hybrid-mode-current-state.md` → `0`
  - [ ] `grep -c "plan-judge-gate" docs/2026-04-07-1732-hybrid-mode-current-state.md` → ≥1

  **QA Scenarios**:

  ```

  Scenario: All key strings present / absent after edits
  Tool: Bash (grep -c)
  Steps: 1. Run each acceptance criteria grep command listed above 2. Assert each expected count
  Expected Result: All assertions pass
  Evidence: .sisyphus/evidence/task-1-doc1-audit.txt

  Scenario: Document still renders as valid markdown (no broken tables)
  Tool: Bash
  Steps: 1. Run: node -e "const fs = require('fs'); const c = fs.readFileSync('docs/2026-04-07-1732-hybrid-mode-current-state.md', 'utf8'); const tables = c.match(/\|[^\n]+\|/g); console.log('table rows:', tables?.length ?? 0);" 2. Assert: table row count is > 50 (document has many tables; this checks none were accidentally deleted)
  Expected Result: ≥50 table rows
  Evidence: .sisyphus/evidence/task-1-doc1-table-check.txt

  ```

  **Commit**: YES (with Task 2)
  - Message: `docs: full accuracy audit update for hybrid-mode and dev-loop docs`
  - Files: `docs/2026-04-07-1732-hybrid-mode-current-state.md`, `docs/2026-04-08-1357-project-registration-and-development-loop.md`
  - Pre-commit: `pnpm tsc --noEmit` (do NOT run `pnpm lint` globally — known lint failure in `session-manager.test.ts:499:27`)
  ```

---

- [x] 2. Update `docs/2026-04-08-1357-project-registration-and-development-loop.md` — 4 edits

  Read the full document before making any edits.

  ***

  ### Edit 1 (D16) — Add `PLAN_VERIFIER_MODEL` to Prerequisites

  **Find**:

  ```
  - **Target GitHub repo exists**: the repo at `repo_url` must be accessible by `GITHUB_TOKEN`
  ```

  **Replace with**:

  ```
  - **Target GitHub repo exists**: the repo at `repo_url` must be accessible by `GITHUB_TOKEN`
  - **`PLAN_VERIFIER_MODEL` in `.env`** (optional): Set to `anthropic/claude-haiku-4-5` to enable the plan judge gate, which verifies the AI's plan matches the ticket before coding begins. Leave empty (default) to disable.
  ```

  ***

  ### Edit 2 (D14) — Rewrite Step 3 "What the AI does"

  **Find**:

  ```
  Once the task is dispatched, the worker container handles everything:

  1. Clones the registered repo (`git clone --depth=2`)
  2. Creates branch `ai/ACME-1609459200-add-formatcurrency-utility` from the default branch
  3. Runs the install command (`npm ci` in this example)
  4. Starts OpenCode (AI coding agent) on port 4096 inside the container
  5. Feeds the ticket summary and description to OpenCode as a prompt
  6. OpenCode writes the implementation, editing files in the cloned repo
  7. Runs the validation pipeline in order: TypeScript check, lint, unit tests, integration tests, e2e tests
  8. On any failure, re-prompts OpenCode with the error output and retries (up to 3 iterations per stage)
  9. Commits the changes and opens a PR on GitHub
  ```

  **Replace with**:

  ```
  Once the task is dispatched, the worker container handles everything:

  1. Clones the registered repo (`git clone --depth=2`)
  2. Runs the install command (`npm ci` in this example) inside the cloned workspace
  3. Creates branch `ai/ACME-1609459200-add-formatcurrency-utility` from the default branch
  4. Starts OpenCode (AI coding agent) on port 4096 inside the container
  5. **Planning phase**: runs a dedicated OpenCode session that produces a structured plan file (`.sisyphus/plans/{TICKET_ID}.md`). The plan is structurally validated (must have at least one wave with at least one task).
  6. **Plan judge gate** (if `PLAN_VERIFIER_MODEL` is set): sends the plan to the configured model for a rubric check (`scope_match`, `function_names`, `no_hallucination`). If rejected, rewrites the plan with corrective feedback and retries (up to 2 attempts total). If all attempts fail, the task transitions to `AwaitingInput`.
  7. Executes the plan wave by wave — each wave is a separate OpenCode session implementing the tasks in that wave, followed by a git push
  8. Runs the validation pipeline: TypeScript check, lint, unit tests, integration tests, e2e tests (only stages configured in the project registration run; unconfigured stages are skipped)
  9. On any failure, re-prompts OpenCode with the error output and retries (up to 3 iterations per stage, 10 globally)
  10. Commits the changes and opens a PR on GitHub
  ```

  ***

  ### Edit 3 (D15) — Fix PR title in Step 4

  **Find**:

  ```
  - **Title**: the ticket summary verbatim
  ```

  **Replace with**:

  ```
  - **Title**: `[AI] {TICKET_ID}: {summary}` (e.g. `[AI] ACME-1609459200: Add formatCurrency utility`)
  ```

  ***

  ### Edit 4 — Fix Step 3 output duration note to reflect planning phase

  **Find**:

  ```
  Typical duration is 5 to 20 minutes depending on ticket complexity and model response time.
  ```

  **Replace with**:

  ```
  Typical duration is 10 to 30 minutes depending on ticket complexity, number of plan waves, and model response time. The planning phase adds roughly 2–5 minutes before coding begins.
  ```

  ***

  **Must NOT do**:
  - Do not change any other sections of the document
  - Do not touch `.sisyphus/plans/2026-04-12-2110-plan-judge-gate.md`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 4 targeted string replacements in one markdown file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2, after Task 1
  - **Blocks**: Nothing
  - **Blocked By**: Task 1

  **References**:
  - `docs/2026-04-08-1357-project-registration-and-development-loop.md` — read fully before edits
  - `src/workers/orchestrate.mts` — source for rewritten Step 3 (install in pre-flight, branch in pre-flight, wave-by-wave execution)
  - `src/workers/lib/planning-orchestrator.ts:129-195` — judge gate logic (max 2 attempts)
  - `src/workers/lib/pr-manager.ts:137` — PR title format `[AI] ${ticketId}: ${summary}`
  - `src/workers/lib/validation-pipeline.ts` — stages skipped if key absent from toolingConfig

  **Acceptance Criteria**:
  - [ ] `grep -c "PLAN_VERIFIER_MODEL" docs/2026-04-08-1357-project-registration-and-development-loop.md` → ≥1
  - [ ] `grep -c "Planning phase" docs/2026-04-08-1357-project-registration-and-development-loop.md` → ≥1
  - [ ] `grep -c "Plan judge gate" docs/2026-04-08-1357-project-registration-and-development-loop.md` → ≥1
  - [ ] `grep -c "wave by wave\|wave-by-wave" docs/2026-04-08-1357-project-registration-and-development-loop.md` → ≥1
  - [ ] `grep -c "verbatim" docs/2026-04-08-1357-project-registration-and-development-loop.md` → `0`
  - [ ] `grep -c "\[AI\]" docs/2026-04-08-1357-project-registration-and-development-loop.md` → ≥1

  **QA Scenarios**:

  ```
  Scenario: All key strings present / absent after edits
    Tool: Bash (grep -c)
    Steps:
      1. Run each acceptance criteria grep command listed above
      2. Assert each expected count
    Expected Result: All assertions pass
    Evidence: .sisyphus/evidence/task-2-doc2-audit.txt
  ```

  **Commit**: YES (with Task 1)
  - Message: `docs: full accuracy audit update for hybrid-mode and dev-loop docs`
  - Files: `docs/2026-04-07-1732-hybrid-mode-current-state.md`, `docs/2026-04-08-1357-project-registration-and-development-loop.md`

---

## Final Verification Wave

- [x] F1. **Grep-based completeness check** — `quick`

  Run ALL acceptance criteria grep commands from Tasks 1 and 2. Report pass/fail per check. Then open both files and confirm no section breaks or table structures were accidentally corrupted.

  Output: `Doc1 [N/N checks pass] | Doc2 [N/N checks pass] | Tables intact [YES/NO] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Tasks 1+2**: `docs: full accuracy audit update for hybrid-mode and dev-loop docs`
  - `docs/2026-04-07-1732-hybrid-mode-current-state.md`
  - `docs/2026-04-08-1357-project-registration-and-development-loop.md`
  - Pre-commit: `pnpm tsc --noEmit` (do NOT use `--no-verify`; do NOT run `pnpm lint` globally — known lint failure in `session-manager.test.ts:499:27`)

---

## Success Criteria

### Verification Commands (run all after execution)

```bash
# Doc 1 checks
grep -c "8-Step Boot" docs/2026-04-07-1732-hybrid-mode-current-state.md          # → 0
grep -c "EXECUTION_ID" docs/2026-04-07-1732-hybrid-mode-current-state.md          # → ≥1
grep -c "PLAN_VERIFIER_MODEL" docs/2026-04-07-1732-hybrid-mode-current-state.md   # → ≥2
grep -c "silent" docs/2026-04-07-1732-hybrid-mode-current-state.md                # → ≥1
grep -c "180 min" docs/2026-04-07-1732-hybrid-mode-current-state.md               # → ≥1
grep -c "8h30m" docs/2026-04-07-1732-hybrid-mode-current-state.md                 # → ≥1
grep -c "node --import tsx/esm" docs/2026-04-07-1732-hybrid-mode-current-state.md # → ≥1
grep -c "818+" docs/2026-04-07-1732-hybrid-mode-current-state.md                  # → 1
grep -c "515+" docs/2026-04-07-1732-hybrid-mode-current-state.md                  # → 0
grep -c "plan-judge-gate" docs/2026-04-07-1732-hybrid-mode-current-state.md       # → ≥1
grep -c "two-phase\|Two-Phase" docs/2026-04-07-1732-hybrid-mode-current-state.md  # → ≥1

# Doc 2 checks
grep -c "PLAN_VERIFIER_MODEL" docs/2026-04-08-1357-project-registration-and-development-loop.md   # → ≥1
grep -c "Planning phase" docs/2026-04-08-1357-project-registration-and-development-loop.md        # → ≥1
grep -c "verbatim" docs/2026-04-08-1357-project-registration-and-development-loop.md              # → 0
grep -c "\[AI\]" docs/2026-04-08-1357-project-registration-and-development-loop.md                # → ≥1
```

### Final Checklist

- [ ] All 16 discrepancies (D1–D16) addressed
- [ ] No invented claims — every edit sourced from live code
- [ ] No source code files touched
- [ ] `pnpm tsc --noEmit` passes after edits
