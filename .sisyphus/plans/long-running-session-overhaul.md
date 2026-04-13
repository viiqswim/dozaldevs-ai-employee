# Long-Running Session Overhaul — Port Battle-Tested Nexus Patterns

## TL;DR

> **Quick Summary**: Overhaul the AI Employee worker pipeline to support long-running autonomous sessions (4–6 hours+) for large Jira tickets by porting battle-tested patterns from the Nexus stack, with primary focus on wave-based execution, continuation prompts, plan-file-as-truth, resource caps, fallback draft PRs, and comprehensive observability.
>
> **Deliverables**:
>
> - Two-phase orchestration (Plan → Execute) with wave-based execution inside Phase 2
> - Plan file as source of truth persisted in BOTH Supabase and disk
> - Continuation prompts + between-wave push + SSE/polling fallback
> - AGENTS.md context injection + enriched prompt builder
> - Fallback draft PR on failure + per-task cost circuit breaker (between waves)
> - Resource caps (TURBO_CONCURRENCY, vitest workers, bash timeout)
> - Cache validation, disk space pre-check, step timing, emoji progress logs
> - Raised time budgets: 4h orchestrate / 6h completion / 8h total, with watchdog bumped to 9h
> - Enhanced PR description + CI classification + escalation payload enrichment
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Wave 1 (foundations) → Wave 2 (core modules) → Wave 3 (orchestrate.mts integration) → Wave 4 (entrypoint.sh + infra) → Wave 5 (Inngest/lifecycle/PR) → Final Verification Wave

---

## Context

### Original Request

"Now that we have a full system in this AI employee repository that will allow us to run coding workflows in the cloud, specifically on Fly.io, can you please help me compare the way we built this system against what we have in the battle-tested Nexus stack as it relates to having an AI agent work on code? Please tell me what we're missing in this repository. I went through a lot of pain to make everything work correctly with AI agents in the Nexus stack. I don't want to go through the same issues. Preventive hardening, safety, observability gaps, quality of agent output, and critically — long-running sessions for large tickets (4–6 hours+). I also want the system to do everything via the OpenCode AI agent, including linting, testing, and verifying the code."

### Interview Summary

**Key Discussions**:

- **Scope**: Comprehensive — close every meaningful gap (33 patterns across 6 tiers)
- **Primary pain point**: Long-running sessions (4–6 hours+) — Tier 1
- **Off-limits areas**: None — port whatever makes sense
- **Plan-source architecture**: Two-phase (Plan → Execute) with wave-based execution (Option A)
- **Time budgets**: 30 min planning / 4h orchestrate / 6h completion / 8h total
- **Subagents**: DEFERRED to a future plan (keep this plan focused on long-running + safety + quality)
- **Conventions source**: Read AGENTS.md from target repo at runtime (no baking repo-specific conventions into worker image)
- **Safety nets**: Fallback draft PR on failure + per-task cost circuit breaker (between waves only)
- **Test strategy**: Tests-after + mandatory agent QA scenarios
- **Watchdog blocker**: Raise machine cleanup threshold to 9 hours BEFORE wave execution ships
- **Plan persistence**: BOTH Supabase (source of truth) + disk cache (belt-and-suspenders)
- **Rollout**: HARD CUTOVER, no feature flag — user explicitly chose despite Metis recommending one. Compensated by strict final verification including 4+ hour long-running simulation.
- **Commit strategy**: One commit per wave, pushed immediately (`feat(wave-N): {desc}`)
- **Fix-loop**: KEEP as safety net. Agent runs completion gate in-prompt, fix-loop remains behind it.

**Research Findings**:

- AI Employee worker: `entrypoint.sh` (7 steps) + `orchestrate.mts` (16 steps) + SINGLE OpenCode session
- Validation: `validation-pipeline.ts` (5 stages) + `fix-loop.ts` (3/stage, 10 global) — KEEP
- Heartbeat / watchdog / redispatch stack already exists — modify thresholds
- Nexus wave executor pattern in `tools/fly-worker/orchestrate.mjs:500-550` — port mechanism, not code
- Nexus emoji progress in `orchestrate.mjs:206-248` — port the format
- Nexus AGENTS.md injection in `orchestrate.mjs:24-72` — scope-limited version (no @file parsing)
- Nexus between-wave push pattern uses `--no-verify`; AI Employee will use `--force-with-lease` per Metis

### Metis Review

**Identified Gaps** (all addressed):

- **HARD BLOCKER**: Watchdog kills 4h+ machines → addressed in Wave 5 (raise threshold to 9h together with Inngest waitForEvent to 8h30m)
- **HARD BLOCKER**: Plan file persistence across restarts → addressed with Supabase `plan_content` column + disk cache
- **HARD BLOCKER**: No rollback path → documented rollback instructions in Commit Strategy; mitigated by strict final verification
- **Dual timeouts must coordinate**: watchdog 9h / Inngest 8h30m / redispatch 8h budget — enforced
- **Heartbeat must continue between waves** (else false positives) — enforced in Wave 2
- **Fix-loop stays as safety net** — DO NOT remove
- **Cost circuit breaker fires only BETWEEN waves** (SDK can't expose real-time token counts mid-session) — enforced
- **AGENTS.md scope**: read + inject + truncate at 8000 chars + skip if missing — no `@file` parsing
- **Token counts only**, never dollar amounts (model prices change) — enforced
- **Plan file validation after Phase 1**: ≥1 wave, ≥1 task, >500 bytes — enforced
- **Plan file locked read-only after Phase 1** (`chmod 444`) — enforced
- **Re-run install between waves if package.json changed** — enforced
- **Every escalation includes wave_number, wave_error, completed_waves** — enforced

---

## Work Objectives

### Core Objective

Port battle-tested Nexus-stack patterns to the AI Employee worker pipeline so that the platform can reliably run 4–6 hour+ autonomous coding sessions on large Jira tickets without context exhaustion, silent hangs, lost progress, or hard failures that destroy partial work.

### Concrete Deliverables

- `src/workers/lib/wave-executor.ts` — wave executor module
- `src/workers/lib/continuation-dispatcher.ts` — continuation prompt dispatcher
- `src/workers/lib/completion-detector.ts` — SSE + polling fallback module
- `src/workers/lib/prompt-builder.ts` — enriched prompt builder
- `src/workers/lib/planning-orchestrator.ts` — Phase 1 planning orchestrator
- `src/workers/lib/fallback-pr.ts` — fallback draft PR creator
- `src/workers/lib/cost-breaker.ts` — per-task cost circuit breaker
- `src/workers/lib/cache-validator.ts` — 3-point cache validation helper
- `src/workers/lib/disk-check.ts` — disk space pre-check helper
- `src/workers/lib/plan-sync.ts` — plan file sync module (Supabase + disk)
- `src/workers/lib/between-wave-push.ts` — between-wave push module
- `src/workers/lib/agents-md-reader.ts` — AGENTS.md reader
- `src/workers/lib/plan-parser.ts` — strict plan file parser
- `src/workers/lib/cost-tracker-v2.ts` — token count tracker
- `src/workers/lib/resource-caps.ts` — resource caps config
- `src/workers/lib/step-timer.ts` — step timing instrumentation
- `src/workers/lib/ci-classifier.ts` — CI status classifier
- `src/workers/config/long-running.ts` — types + config
- `src/workers/orchestrate.mts` — refactored for two-phase + wave execution
- `src/workers/entrypoint.sh` — extended with resource caps, cache validation, disk check, step timing, opencode.json override, boulder.json, plan file sync
- `src/workers/lib/task-context.ts` — enriched prompt template
- `src/workers/lib/heartbeat.ts` — continues between waves (verified)
- `src/inngest/lifecycle.ts` — waitForEvent raised to 8h30m
- `src/inngest/watchdog.ts` — machine cleanup raised to 9h, stale heartbeat threshold adjusted
- `src/inngest/redispatch.ts` — wave-aware behavior + 8h budget
- `src/lib/github-client.ts` — enhanced PR description template
- `prisma/schema.prisma` — new columns: `plan_content`, `plan_generated_at`, `cost_usd_cents` on `tasks`; `wave_number`, `wave_state` on `executions`
- `prisma/migrations/{timestamp}_long_running_session_support` — migration file
- Unit tests for every new module

### Definition of Done

- [ ] `pnpm build` succeeds: `pnpm build`
- [ ] `pnpm lint` passes: `pnpm lint`
- [ ] `pnpm test -- --run` passes (515+ baseline preserved, new module tests added)
- [ ] Prisma migration applies cleanly: `pnpm prisma migrate deploy`
- [ ] Docker image rebuilds: `docker build -t ai-employee-worker:latest .`
- [ ] `pnpm trigger-task` E2E passes on test repo with small ticket
- [ ] F3 (Final Verification) executes a **4+ hour long-running simulation** via mock harness and passes
- [ ] Every Final Verification Wave reviewer (F1–F4) returns APPROVE
- [ ] Explicit user "okay" after F1–F4 summary

### Must Have

- Two-phase orchestration: Phase 1 (Plan) → Phase 2 (Execute)
- Wave-based execution inside Phase 2 with fresh OpenCode session per wave
- Plan file persisted to BOTH Supabase (`tasks.plan_content`) and disk cache
- Continuation prompts (max 5 per wave) for stalled sessions
- Between-wave auto-push with `git push --force-with-lease`
- SSE + polling fallback for completion detection
- AGENTS.md injection at prompt build time (truncated at 8000 chars, skip if missing)
- Resource caps: `TURBO_CONCURRENCY=2`, `NEXUS_VITEST_MAX_WORKERS=2`, `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS=1200000`
- Fallback draft PR on agent failure (labeled `agent-failure`) when `git diff --name-only` non-empty
- Cache validation (3-point checks: .git structure, remote URL, detached HEAD)
- Disk space pre-check (<2GB free → skip cache)
- Step timing instrumentation + emoji progress log format
- Per-step token tracking (counts only, never dollar amounts)
- Watchdog machine cleanup raised to **9 hours** BEFORE wave execution ships
- Inngest `waitForEvent` raised to **8h30m**
- Fix-loop remains as safety net
- Heartbeat continues during between-wave transitions
- Plan file validated after Phase 1 (≥1 wave, ≥1 task, >500 bytes)
- Plan file locked read-only after Phase 1 (`chmod 444`)
- Re-run install between waves if `package.json` SHA changed
- Escalation payload enriched with `wave_number`, `wave_error`, `completed_waves`
- Agent runs completion gate in-prompt (gates before commit)
- Enhanced PR description: Summary / Changes / Testing / Waves Completed / How to Verify sections
- CI status classifier (substantive vs infra failure)
- Unit tests for every new module
- Conventional commit format: `feat(wave-N): desc` per wave

### Must NOT Have (Guardrails)

- **MUST NOT** remove the existing fix-loop (safety net)
- **MUST NOT** change the Jira webhook contract
- **MUST NOT** change the `engineering/task.completed` Inngest event schema
- **MUST NOT** remove the Supabase-first ordering in the completion flow (Supabase write MUST happen before Inngest event emit)
- **MUST NOT** ship wave execution before watchdog threshold is raised to 9h (hard blocker ordering)
- **MUST NOT** add `@file` parsing to AGENTS.md reader (scope: read + inject only)
- **MUST NOT** log dollar amounts for token costs (model prices change)
- **MUST NOT** introduce new task statuses (use existing `stage` column on executions for wave state)
- **MUST NOT** check cost circuit breaker mid-wave (SDK limitation — between waves only)
- **MUST NOT** call cost breaker before Wave 1 completes (no baseline yet)
- **MUST NOT** force-push without `--force-with-lease`
- **MUST NOT** split this work into multiple plans — ONE plan file
- **MUST NOT** add specialized subagents (deferred to a future plan)
- **MUST NOT** add a feature flag or kill switch for this rollout (user chose hard cutover)
- **MUST NOT** add raw `--no-verify` to any commit (project rule)
- **MUST NOT** reference AI tools in commit messages (project rule)
- **MUST NOT** create fallback PR if `git diff --name-only` is empty (nothing to preserve)
- **MUST NOT** extend watchdog stale heartbeat threshold beyond 20 min (too lenient, hides real hangs)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision

- **Infrastructure exists**: YES (Vitest, 515+ tests)
- **Automated tests**: Tests-after — Every new module gets a unit test file written after implementation
- **Framework**: `vitest` (run with `pnpm test -- --run`)
- **If TDD**: N/A (tests-after per user choice)

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Modules/Libraries**: Bash with `pnpm test -- --run src/workers/lib/{module}.test.ts` — assert PASS, capture stdout
- **Orchestrator / entrypoint.sh**: Bash runs component in isolation with mock env — assert output + exit code
- **Prisma migrations**: Bash `pnpm prisma migrate deploy` → assert schema via `pnpm prisma studio --browser none` smoke query OR `pnpm prisma db pull` diff
- **Inngest functions**: Bash triggers mock event via inngest dev API, asserts completion + state transitions
- **E2E worker path**: `pnpm trigger-task` with MOCK_LONG_RUNNING=1 env → assert task reaches `Done` state, PR exists, wave_number transitions logged
- **Long-running simulation** (F3 only): Mock harness injects synthetic multi-wave plan, runs orchestrator for 4+ hours, verifies waves complete + heartbeat steady + no watchdog false-positive

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Each wave completes before the next begins.
> Target: 5-8 tasks per wave (Waves 2 and 3 are larger by necessity — deeply parallel module work).

```
Wave 1 (Start Immediately — foundations, MAX PARALLEL):
├── Task 1: Types + Config module [quick]
├── Task 2: Prisma schema migration [quick]
├── Task 3: Logger enhancements (emoji + step timing) [quick]
├── Task 4: AGENTS.md reader utility [quick]
├── Task 5: Plan file parser (strict format) [quick]
├── Task 6: Cost tracker v2 (token counts only) [quick]
└── Task 7: Resource caps config [quick]

Wave 2 (After Wave 1 — core modules, MAX PARALLEL):
├── Task 8: Wave executor module [deep]
├── Task 9: Continuation prompt dispatcher [deep]
├── Task 10: SSE + polling fallback module [deep]
├── Task 11: Enriched prompt builder [unspecified-high]
├── Task 12: Planning session orchestrator (Phase 1) [deep]
├── Task 13: Fallback draft PR creator [unspecified-high]
├── Task 14: Per-task cost circuit breaker [quick]
├── Task 15: Cache validation helper [quick]
├── Task 16: Disk space pre-check helper [quick]
├── Task 17: Plan file sync module (Supabase + disk) [unspecified-high]
└── Task 18: Between-wave push module [quick]

Wave 3 (After Wave 2 — orchestrate.mts refactor, MOSTLY SEQUENTIAL within file but split by concern):
├── Task 19: Refactor orchestrate.mts — two-phase skeleton [deep]
├── Task 20: Wire planning phase into orchestrate.mts [deep]
├── Task 21: Wire wave executor into orchestrate.mts [deep]
├── Task 22: Wire continuation dispatcher + completion detector [unspecified-high]
├── Task 23: Wire between-wave push + install re-run [unspecified-high]
├── Task 24: Wire cost breaker check between waves [quick]
├── Task 25: Wire fallback PR on failure [unspecified-high]
├── Task 26: Wire plan sync module [quick]
├── Task 27: Wire emoji progress + step timing into orchestrate [quick]
└── Task 28: Refactor task-context.ts to use enriched prompt builder [quick]

Wave 4 (After Wave 3 — entrypoint.sh + infra, MAX PARALLEL):
├── Task 29: entrypoint.sh — resource caps injection [quick]
├── Task 30: entrypoint.sh — cache validation integration [quick]
├── Task 31: entrypoint.sh — disk space pre-check integration [quick]
├── Task 32: entrypoint.sh — step timing instrumentation [quick]
├── Task 33: entrypoint.sh — opencode.json override file [quick]
├── Task 34: entrypoint.sh — boulder.json context file [quick]
└── Task 35: entrypoint.sh — plan file sync on restart [quick]

Wave 5 (After Wave 4 — Inngest / lifecycle / PR, MAX PARALLEL):
├── Task 36: Raise Inngest waitForEvent to 8h30m [quick]
├── Task 37: Raise watchdog machine cleanup to 9 hours [quick]
├── Task 38: Update watchdog stale heartbeat threshold [quick]
├── Task 39: Update redispatch for 8h + wave-aware behavior [unspecified-high]
├── Task 40: Enhanced PR description template [quick]
├── Task 41: CI status classification helper [quick]
└── Task 42: Escalation payload enrichment [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA with 4+ hour simulation [unspecified-high]
└── Task F4: Scope fidelity check [deep]
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 8 → Task 19 → Task 21 → Task 29 → Task 37 → F1–F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 11 (Wave 2)
```

### Dependency Matrix (abbreviated)

- **1–7**: No deps → unlock 8–18
- **8 (wave executor)**: deps 1, 5, 6 → unlocks 19, 21
- **9 (continuation dispatcher)**: deps 1, 5 → unlocks 22
- **10 (SSE/polling)**: deps 1, 3 → unlocks 22
- **11 (prompt builder)**: deps 1, 4 → unlocks 28
- **12 (planning orchestrator)**: deps 1, 5, 11 → unlocks 20
- **13 (fallback PR)**: deps 1 → unlocks 25
- **14 (cost breaker)**: deps 1, 6 → unlocks 24
- **15 (cache validator)**: deps 1 → unlocks 30
- **16 (disk check)**: deps 1 → unlocks 31
- **17 (plan sync)**: deps 1, 2, 5 → unlocks 26, 35
- **18 (between-wave push)**: deps 1 → unlocks 23
- **19 (two-phase skeleton)**: deps 8 → unlocks 20–28
- **20–28**: sequential within orchestrate.mts — each builds on previous state
- **29–35**: all depend on Wave 3 complete → run in parallel
- **36–42**: all depend on Wave 4 complete → run in parallel
- **F1–F4**: depend on ALL implementation tasks

### Agent Dispatch Summary

- **Wave 1**: **7** — T1–T7 → `quick` (foundation, small files, no architectural decisions)
- **Wave 2**: **11** — T8/T9/T10/T12 → `deep`, T11/T13/T17 → `unspecified-high`, T14/T15/T16/T18 → `quick`
- **Wave 3**: **10** — T19/T20/T21 → `deep`, T22/T23/T25 → `unspecified-high`, T24/T26/T27/T28 → `quick`
- **Wave 4**: **7** — T29–T35 → `quick` (shell script edits, bounded scope)
- **Wave 5**: **7** — T36/T37/T38/T40/T41/T42 → `quick`, T39 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Types + Config Module

  **What to do**:
  - Create `src/workers/config/long-running.ts`
  - Export `LongRunningConfig` type: `{ orchestrateTimeoutMs, completionTimeoutMs, totalTimeoutMs, planningTimeoutMs, maxContinuationsPerWave, maxWavesPerTask, minDiskSpaceBytes, agentsMdMaxChars, heartbeatIntervalMs, watchdogStaleThresholdMs, fallbackPrEnabled, costBreakerUsdCentsPerTask }`
  - Export default const: `DEFAULT_LONG_RUNNING_CONFIG` (orchestrate 4h, completion 6h, total 8h, planning 30min, continuations 5, waves 20, disk 2147483648, agents 8000, heartbeat 60000, stale 900000, breaker enabled, cost 5000 cents = $50)
  - Export `WaveState` type: `{ number: number, startedAt: string | null, completedAt: string | null, status: "pending" | "running" | "completed" | "failed", error: string | null }`
  - Export `WaveStateArray` type: `{ waves: WaveState[] }`
  - Export `PlanMeta` type: `{ totalWaves: number, totalTasks: number, completedWaves: number, completedTasks: number }`
  - Export helper `readConfigFromEnv(): LongRunningConfig` that overlays env vars on defaults (allow override for dev/test)

  **Must NOT do**:
  - Do NOT introduce any runtime logic beyond type definitions + env reader
  - Do NOT import from any other workers/lib file (this is the foundation layer)
  - Do NOT add dollar-amount fields — only cent integers

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions + env reader, single file, no architectural decisions
  - **Skills**: []
    - No skills needed — trivial TypeScript type work
  - **Skills Evaluated but Omitted**:
    - `v-mermaid`: No diagrams in config file

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6, 7)
  - **Blocks**: 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 (all Wave 2 modules import this)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/workers/config/` - Existing config directory structure (if exists) or create new. Follow naming convention of other config files in `src/gateway/config/` and `src/lib/`.
  - `src/lib/retry.ts` - Example of a simple self-contained utility module with type exports and sensible defaults pattern.

  **API/Type References**:
  - `src/workers/lib/session-manager.ts` - Uses timeout values; new config must be compatible with what session-manager expects
  - `src/workers/orchestrate.mts:370` - Current orchestrate.mts imports patterns

  **External References**:
  - Node docs on `process.env` — use `parseInt(process.env.X ?? "default", 10)` pattern for numeric overrides

  **WHY Each Reference Matters**:
  - `src/lib/retry.ts`: Shows the canonical "type + defaults + helper" pattern used in this project — match exactly.
  - `session-manager.ts`: Current timeout values live here and will be imported from the new config. Keep types compatible.

  **Acceptance Criteria**:
  - [ ] File `src/workers/config/long-running.ts` exists
  - [ ] Exports all 5 types/consts listed above
  - [ ] `pnpm tsc --noEmit` passes
  - [ ] `pnpm lint` passes on new file

  **QA Scenarios**:

  ```
  Scenario: Default config is readable
    Tool: Bash
    Preconditions: File created, pnpm build passed
    Steps:
      1. Run: node -e "import('./src/workers/config/long-running.js').then(m => console.log(JSON.stringify(m.DEFAULT_LONG_RUNNING_CONFIG, null, 2)))"
         (NOTE: after `pnpm build`, path is dist/workers/config/long-running.js)
      2. Assert stdout contains "orchestrateTimeoutMs": 14400000
      3. Assert stdout contains "totalTimeoutMs": 28800000
      4. Assert stdout contains "costBreakerUsdCentsPerTask": 5000
      5. Assert exit code 0
    Expected Result: JSON output with all default values
    Failure Indicators: Import error, missing field, wrong numeric value
    Evidence: .sisyphus/evidence/task-1-default-config.json

  Scenario: Env override works
    Tool: Bash
    Preconditions: File created, pnpm build passed
    Steps:
      1. Run: ORCHESTRATE_TIMEOUT_MS=60000 node -e "import('./dist/workers/config/long-running.js').then(m => console.log(m.readConfigFromEnv().orchestrateTimeoutMs))"
      2. Assert stdout is "60000"
      3. Assert exit code 0
    Expected Result: 60000
    Failure Indicators: Any other value, import error
    Evidence: .sisyphus/evidence/task-1-env-override.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-default-config.json`
  - [ ] `.sisyphus/evidence/task-1-env-override.txt`

  **Commit**: NO (groups with Wave 1 commit)

- [ ] 2. Prisma Schema Migration — Add Wave/Plan/Cost Columns

  **What to do**:
  - Edit `prisma/schema.prisma`:
    - Add to `Task` model: `planContent String? @map("plan_content") @db.Text`, `planGeneratedAt DateTime? @map("plan_generated_at")`, `costUsdCents Int @default(0) @map("cost_usd_cents")`
    - Add to `Execution` model: `waveNumber Int? @map("wave_number")`, `waveState Json? @map("wave_state")`
  - Generate migration: `pnpm prisma migrate dev --name long_running_session_support --create-only`
  - Edit generated migration SQL if needed to add `COMMENT ON COLUMN` for each new column describing purpose
  - Run `pnpm prisma generate` to update client
  - Update `prisma/seed.ts` only if existing seed must populate new fields with defaults (likely not — all have defaults/nullable)

  **Must NOT do**:
  - Do NOT change existing columns
  - Do NOT add new task statuses (use existing `stage` on executions per Metis)
  - Do NOT backfill `costUsdCents` — new column, starts at 0
  - Do NOT make `planContent` required (nullable until Phase 1 runs)
  - Do NOT auto-apply migration in dev beyond `migrate dev --create-only` — let Wave 1 commit include only the migration file for review

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema-only change, well-defined, small blast radius
  - **Skills**: []
    - Not needed — trivial Prisma addition
  - **Skills Evaluated but Omitted**:
    - `v-mermaid`: Schema diagrams not needed here; the PR diff is enough

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6, 7)
  - **Blocks**: 17 (plan-sync module reads these columns)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `prisma/schema.prisma` - Existing Task and Execution models; follow existing field naming (`snake_case @map` + `camelCase` TS)
  - `prisma/migrations/*/migration.sql` - Look at the most recent migration for SQL style (semicolons, capitalization, line breaks)

  **API/Type References**:
  - `prisma/schema.prisma:Task` - Existing Task model to extend
  - `prisma/schema.prisma:Execution` - Existing Execution model to extend
  - `src/workers/lib/postgrest-client.ts` - How worker reads/writes tasks; new columns must be accessible via PostgREST (automatic, since PostgREST reflects schema)

  **External References**:
  - Prisma docs: https://www.prisma.io/docs/concepts/components/prisma-schema/data-model#defining-fields

  **WHY Each Reference Matters**:
  - `schema.prisma`: Existing field naming conventions MUST match — snake_case DB names with `@map`.
  - `postgrest-client.ts`: Worker will read `plan_content` via PostgREST later (Task 17); confirm field naming aligns.

  **Acceptance Criteria**:
  - [ ] `prisma/schema.prisma` has all 5 new fields with correct types + @map
  - [ ] Migration file exists under `prisma/migrations/{timestamp}_long_running_session_support/migration.sql`
  - [ ] `pnpm prisma generate` succeeds
  - [ ] `pnpm prisma validate` succeeds
  - [ ] `pnpm prisma migrate deploy` applies cleanly to local DB
  - [ ] `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d tasks"` shows new columns
  - [ ] `psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "\d executions"` shows new columns

  **QA Scenarios**:

  ```
  Scenario: Schema migration applies cleanly
    Tool: Bash
    Preconditions: Local Supabase running, prior migrations applied
    Steps:
      1. Run: pnpm prisma migrate deploy 2>&1 | tee /tmp/migrate-out.txt
      2. Assert stdout contains "Applying migration" and "long_running_session_support"
      3. Assert no "Error" or "Failed" strings in output
      4. Assert exit code 0
      5. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks' AND column_name IN ('plan_content','plan_generated_at','cost_usd_cents');"
      6. Assert output shows all 3 column names
    Expected Result: Migration applied, all 3 columns present on tasks table
    Failure Indicators: Migration error, missing column, type mismatch
    Evidence: .sisyphus/evidence/task-2-migration-output.txt

  Scenario: Execution columns present
    Tool: Bash
    Preconditions: Migration applied
    Steps:
      1. Run: psql postgresql://postgres:postgres@localhost:54322/ai_employee -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'executions' AND column_name IN ('wave_number','wave_state');"
      2. Assert wave_number is integer (nullable)
      3. Assert wave_state is jsonb (nullable)
    Expected Result: Both columns listed with correct types
    Failure Indicators: Missing column, wrong type
    Evidence: .sisyphus/evidence/task-2-exec-columns.txt

  Scenario: PostgREST reflects new columns
    Tool: Bash
    Preconditions: Migration applied, PostgREST container running
    Steps:
      1. Run: curl -s http://localhost:54321/rest/v1/tasks?select=id,plan_content,plan_generated_at,cost_usd_cents&limit=1 -H "apikey: $SUPABASE_ANON_KEY"
      2. Assert HTTP 200 and valid JSON response
      3. Assert response is an array (empty or with data)
    Expected Result: PostgREST accepts query with new column names
    Failure Indicators: 400/404, "column does not exist" error
    Evidence: .sisyphus/evidence/task-2-postgrest-reflection.json
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-migration-output.txt`
  - [ ] `.sisyphus/evidence/task-2-exec-columns.txt`
  - [ ] `.sisyphus/evidence/task-2-postgrest-reflection.json`

  **Commit**: NO (groups with Wave 1 commit)

- [ ] 3. Logger Enhancements — Emoji Progress + Step Timing

  **What to do**:
  - Edit `src/lib/logger.ts` to add new log helpers:
    - `logger.step(emoji: string, message: string, extras?: object)` — prints `{emoji} {message}` + structured JSON
    - `logger.tool(name: string, durationMs: number, status: "ok" | "error", extras?: object)` — prints `🔧 {name} ({durationMs}ms)` or `❌ {name} ({durationMs}ms)`
    - `logger.cost(tokensIn: number, tokensOut: number, extras?: object)` — prints `💰 {tokensIn}in/{tokensOut}out tokens`
    - `logger.timing(label: string, elapsedMs: number, totalMs: number)` — prints `TIMING: {label} completed in {elapsedMs}ms (total: {totalMs}ms)`
  - Preserve existing logger API (all existing calls must keep working)
  - Add unit tests in `src/lib/logger.test.ts` asserting each new helper produces correct output format

  **Must NOT do**:
  - Do NOT break existing `logger.info/warn/error` calls
  - Do NOT log dollar amounts in `logger.cost`
  - Do NOT introduce color codes (Fly log viewer may mangle them)
  - Do NOT remove structured JSON output — emoji format is additional, not replacing

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, well-defined API additions, easy to test
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6, 7)
  - **Blocks**: 10 (completion-detector uses tool timing), 27 (orchestrate emoji wiring)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/logger.ts` - Existing logger implementation; follow same structured JSON output format
  - `src/workers/lib/heartbeat.ts` - Example logger usage from workers

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/orchestrate.mjs:206-248` — emoji progress pattern (for visual format, not code)

  **WHY Each Reference Matters**:
  - `logger.ts`: Must preserve existing API. New helpers are additions.
  - Nexus orchestrate.mjs: Shows the emoji format that was battle-tested. Match conventions: 🔧 tool start, ✅ success, ❌ fail, 💰 cost, 🤖 subagent, 📋 todo progress, 📝 text.

  **Acceptance Criteria**:
  - [ ] `src/lib/logger.ts` has all 4 new helpers
  - [ ] `src/lib/logger.test.ts` exists with tests for each new helper
  - [ ] `pnpm test -- --run src/lib/logger.test.ts` passes
  - [ ] No existing callers of `logger.info/warn/error` broken (regression check via `pnpm test -- --run`)

  **QA Scenarios**:

  ```
  Scenario: Emoji progress helpers produce expected output
    Tool: Bash
    Preconditions: logger.ts modified, logger.test.ts written
    Steps:
      1. Run: pnpm test -- --run src/lib/logger.test.ts 2>&1 | tee /tmp/logger-test.txt
      2. Assert all tests PASS
      3. Assert zero failures
      4. Assert exit code 0
    Expected Result: All logger tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-logger-tests.txt

  Scenario: Existing logger callers still work (regression)
    Tool: Bash
    Preconditions: Changes applied
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/full-test.txt
      2. Assert total passing tests >= 515 (baseline)
      3. Assert zero NEW failures relative to main
    Expected Result: No regressions
    Failure Indicators: Previously passing test now fails
    Evidence: .sisyphus/evidence/task-3-regression.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-logger-tests.txt`
  - [ ] `.sisyphus/evidence/task-3-regression.txt`

  **Commit**: NO (groups with Wave 1 commit)

- [ ] 4. AGENTS.md Reader Utility

  **What to do**:
  - Create `src/workers/lib/agents-md-reader.ts`
  - Export `async function readAgentsMd(repoRoot: string, maxChars: number = 8000): Promise<string | null>`
  - Logic:
    1. Check if `{repoRoot}/AGENTS.md` exists (use `fs.promises.access`)
    2. If missing → return `null`
    3. Read file contents as UTF-8
    4. If length ≤ maxChars → return as-is
    5. If length > maxChars → return `contents.slice(0, maxChars) + "\n\n[TRUNCATED at " + maxChars + " chars]"`
  - Handle errors gracefully: log warning, return `null` on any read error
  - Write `src/workers/lib/agents-md-reader.test.ts` with cases: file exists (short), file exists (long, truncated), file missing, read error

  **Must NOT do**:
  - Do NOT parse `@file` references (per Metis directive)
  - Do NOT recursively load other files
  - Do NOT throw on missing file — return `null`
  - Do NOT cache results across calls

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple I/O utility with tests
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6, 7)
  - **Blocks**: 11 (prompt-builder imports this)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/install-runner.ts` - Simple utility module pattern (22 lines) — match structure
  - `src/workers/lib/task-context.ts` - Existing I/O utility in worker context

  **External References**:
  - Node docs: `fs.promises.access`, `fs.promises.readFile`

  **WHY Each Reference Matters**:
  - `install-runner.ts`: Canonical "tiny utility module" pattern in this project.
  - Nexus `orchestrate.mjs:24-72`: Reference for WHY this matters (but NOT for HOW — we're using a scope-limited version per Metis).

  **Acceptance Criteria**:
  - [ ] File `src/workers/lib/agents-md-reader.ts` exists
  - [ ] File `src/workers/lib/agents-md-reader.test.ts` exists
  - [ ] All 4 test cases pass: short file, long file truncated, missing file, read error
  - [ ] `pnpm test -- --run src/workers/lib/agents-md-reader.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Short AGENTS.md returned as-is
    Tool: Bash
    Preconditions: Module created, test file written
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/agents-md-reader.test.ts 2>&1 | tee /tmp/agents-md.txt
      2. Assert all 4 test cases PASS
      3. Assert exit code 0
    Expected Result: All tests pass
    Failure Indicators: Any case fails
    Evidence: .sisyphus/evidence/task-4-agents-md-tests.txt

  Scenario: Missing file returns null (not throw)
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "import('./dist/workers/lib/agents-md-reader.js').then(m => m.readAgentsMd('/tmp/does-not-exist-xyz')).then(r => console.log(JSON.stringify(r)))"
      2. Assert stdout is "null"
      3. Assert exit code 0 (no throw)
    Expected Result: null output, no error
    Failure Indicators: Thrown error, non-null return
    Evidence: .sisyphus/evidence/task-4-missing-file.txt

  Scenario: Long file truncated at 8000 chars
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Create test file: printf 'x%.0s' {1..10000} > /tmp/test-agents.md && echo "" >> /tmp/test-agents.md
      2. Mkdir /tmp/test-repo && mv /tmp/test-agents.md /tmp/test-repo/AGENTS.md
      3. Run: node -e "import('./dist/workers/lib/agents-md-reader.js').then(m => m.readAgentsMd('/tmp/test-repo', 8000)).then(r => console.log(r.length, r.includes('TRUNCATED')))"
      4. Assert length > 8000 (8000 + truncation suffix)
      5. Assert contains "TRUNCATED"
    Expected Result: Truncation marker appended
    Failure Indicators: No marker, full file returned, error
    Evidence: .sisyphus/evidence/task-4-truncation.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-agents-md-tests.txt`
  - [ ] `.sisyphus/evidence/task-4-missing-file.txt`
  - [ ] `.sisyphus/evidence/task-4-truncation.txt`

  **Commit**: NO (groups with Wave 1 commit)

- [ ] 5. Plan File Parser (Strict Format)

  **What to do**:
  - Create `src/workers/lib/plan-parser.ts`
  - Export `parsePlanFile(content: string): ParsedPlan` where ParsedPlan = `{ waves: ParsedWave[], meta: PlanMeta }`
  - `ParsedWave = { number: number, title: string, tasks: ParsedTask[] }`
  - `ParsedTask = { id: number, title: string, checked: boolean, rawBlock: string }`
  - Strict grammar:
    - Wave header regex: `^## Wave (\d+)(?:\s*[-—:]\s*(.+))?$`
    - Task checkbox regex: `^- \[([ x])\] (\d+)\. (.+?)$`
  - Parser walks line-by-line, associates tasks with the most recent wave header
  - Returns `meta`: total waves, total tasks, completed waves (all tasks checked), completed tasks (any `[x]`)
  - Export `validatePlan(parsed: ParsedPlan): { ok: boolean, errors: string[] }` — enforces Metis requirements: ≥1 wave, ≥1 task, total char count of source > 500
  - Export `countUncheckedTasks(parsed: ParsedPlan): number`
  - Export `findNextUncheckedTasks(parsed: ParsedPlan, limit: number): ParsedTask[]` — used by continuation dispatcher
  - Write `src/workers/lib/plan-parser.test.ts` with: valid plan, empty plan, no waves, no tasks, mixed checked/unchecked, too-small plan, malformed checkboxes

  **Must NOT do**:
  - Do NOT accept alternative formats (no `### Wave`, no `Wave 1:` without `##` prefix)
  - Do NOT accept tasks outside of a wave section (orphan tasks = parse error)
  - Do NOT mutate input string
  - Do NOT depend on any markdown parser library — regex-only for determinism

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure string manipulation with clear grammar, deterministic, highly testable
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6, 7)
  - **Blocks**: 8 (wave-executor), 9 (continuation-dispatcher), 12 (planning-orchestrator), 17 (plan-sync)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/lib/validation-pipeline.ts` - Example of a module with multiple small exported helpers
  - `src/lib/errors.ts` - Error types to return from validatePlan (if adding a typed error)

  **External References**:
  - Nexus reference (for format only): `nexus-stack/.opencode/command/nexus-worktree-plan.md` — shows the exact `## Wave N` + `- [ ]` format

  **WHY Each Reference Matters**:
  - `validation-pipeline.ts`: Follow the same module structure — named exports, small functions, thin abstraction.
  - Nexus plan format: This is the EXACT grammar the parser must accept. No deviation.

  **Acceptance Criteria**:
  - [ ] File `src/workers/lib/plan-parser.ts` exists
  - [ ] File `src/workers/lib/plan-parser.test.ts` exists with ≥8 test cases
  - [ ] All tests pass
  - [ ] No library imports (only std lib)

  **QA Scenarios**:

  ```
  Scenario: Parser correctly extracts waves and tasks
    Tool: Bash
    Preconditions: Module + tests written
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/plan-parser.test.ts 2>&1 | tee /tmp/parser-test.txt
      2. Assert all tests PASS
      3. Assert total test count >= 8
    Expected Result: All parser tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-parser-tests.txt

  Scenario: Validator rejects small plan
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "import('./dist/workers/lib/plan-parser.js').then(m => { const p = m.parsePlanFile('## Wave 1\n- [ ] 1. tiny'); console.log(JSON.stringify(m.validatePlan(p))); })"
      2. Assert output contains '"ok":false'
      3. Assert errors array mentions 500 char minimum
    Expected Result: Rejection with clear error
    Failure Indicators: Accepted as valid
    Evidence: .sisyphus/evidence/task-5-small-plan-rejection.txt

  Scenario: Validator accepts realistic plan
    Tool: Bash
    Preconditions: Module built, this plan file exists
    Steps:
      1. Run: node -e "import('./dist/workers/lib/plan-parser.js').then(m => { const fs = require('fs'); const c = fs.readFileSync('.sisyphus/plans/long-running-session-overhaul.md','utf8'); const p = m.parsePlanFile(c); console.log(JSON.stringify(m.validatePlan(p))); console.log('tasks:', p.meta.totalTasks); })"
      2. Assert output contains '"ok":true'
      3. Assert tasks count >= 40
    Expected Result: Plan accepted as valid
    Failure Indicators: Rejected, low task count
    Evidence: .sisyphus/evidence/task-5-real-plan-validation.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-5-parser-tests.txt`
  - [ ] `.sisyphus/evidence/task-5-small-plan-rejection.txt`
  - [ ] `.sisyphus/evidence/task-5-real-plan-validation.txt`

  **Commit**: NO (groups with Wave 1 commit)

- [ ] 6. Cost Tracker v2 (Token Counts Only)

  **What to do**:
  - Create `src/workers/lib/cost-tracker-v2.ts` (new file, do NOT replace existing `token-tracker.ts` yet)
  - Export `class CostTrackerV2`:
    - `recordStep(waveNumber: number, tokensIn: number, tokensOut: number, toolName: string | null)`
    - `getWaveTotals(waveNumber: number): { tokensIn: number, tokensOut: number }`
    - `getTaskTotals(): { tokensIn: number, tokensOut: number }`
    - `reset()`
  - Internal state: `Map<number, { tokensIn: number, tokensOut: number, steps: Array<...> }>`
  - All logging via `logger.cost(...)` helper (from Task 3)
  - NO dollar conversion. Tokens only. Ever.
  - Write `src/workers/lib/cost-tracker-v2.test.ts` with: record single step, record multi-wave, getWaveTotals accuracy, getTaskTotals across waves, reset clears state

  **Must NOT do**:
  - Do NOT import from any pricing table or API
  - Do NOT expose a `getDollarCost()` method
  - Do NOT delete/modify existing `token-tracker.ts` (will be deprecated separately)
  - Do NOT persist to disk (memory only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple stateful class with clear methods
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5, 7)
  - **Blocks**: 8 (wave-executor uses this), 14 (cost-breaker reads totals)
  - **Blocked By**: None (logger changes from Task 3 land in same wave; use string stubs if needed and wire later)

  **References**:

  **Pattern References**:
  - `src/workers/lib/token-tracker.ts:47` - Existing implementation to learn from (but do NOT replace yet)
  - `src/workers/lib/heartbeat.ts` - Example of a stateful class

  **API/Type References**:
  - `src/workers/config/long-running.ts:WaveState` - Types from Task 1 (same-wave dependency; declare loosely if needed)

  **WHY Each Reference Matters**:
  - `token-tracker.ts`: Existing approach tracks totals only. New tracker adds per-wave segmentation, which is what cost-breaker needs.
  - `heartbeat.ts`: Canonical "stateful worker lib class" pattern.

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/cost-tracker-v2.ts` exists
  - [ ] `src/workers/lib/cost-tracker-v2.test.ts` exists
  - [ ] All tests pass
  - [ ] No imports from pricing libraries

  **QA Scenarios**:

  ```
  Scenario: Per-wave token totals accurate
    Tool: Bash
    Preconditions: Module + tests written
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/cost-tracker-v2.test.ts 2>&1 | tee /tmp/cost-v2.txt
      2. Assert all tests PASS
      3. Assert total test count >= 5
    Expected Result: All cost tracker tests pass
    Failure Indicators: Any failure
    Evidence: .sisyphus/evidence/task-6-cost-tracker-tests.txt

  Scenario: No dollar-cost API exposed
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: grep -E "dollar|Dollar|USD|\\\$" src/workers/lib/cost-tracker-v2.ts | grep -v "^\s*//" | grep -v "import"
      2. Assert no matches (exit code 1 from grep)
    Expected Result: No dollar references in source
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-6-no-dollars.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-6-cost-tracker-tests.txt`
  - [ ] `.sisyphus/evidence/task-6-no-dollars.txt`

  **Commit**: NO (groups with Wave 1 commit)

- [ ] 7. Resource Caps Config

  **What to do**:
  - Create `src/workers/lib/resource-caps.ts`
  - Export `const RESOURCE_CAPS` object:
    ```ts
    export const RESOURCE_CAPS = {
      TURBO_CONCURRENCY: '2',
      NEXUS_VITEST_MAX_WORKERS: '2',
      OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: '1200000',
      NODE_OPTIONS: '--max-old-space-size=4096',
    } as const;
    ```
  - Export `function applyResourceCaps(env: NodeJS.ProcessEnv = process.env): void` that sets all keys IF NOT ALREADY SET (respect override)
  - Export `function resourceCapsForShell(): string` — outputs `KEY=VALUE` pairs one per line, for entrypoint.sh to source via `eval` or `export`
  - Write `src/workers/lib/resource-caps.test.ts` with: applies defaults, respects existing env, shell export format correct

  **Must NOT do**:
  - Do NOT hardcode caps in entrypoint.sh directly — must flow from this module
  - Do NOT override env vars that are already set
  - Do NOT use values other than the 4 listed (scope discipline)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial config module with 3 small exports
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5, 6)
  - **Blocks**: 29 (entrypoint.sh imports caps via shell export)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/config/long-running.ts` (Task 1) - Same pattern of const + helper function
  - `src/workers/entrypoint.sh:1-100` - Shell context where these caps will be applied

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:463-473` — shows the exact cap values that worked

  **WHY Each Reference Matters**:
  - Nexus entrypoint.sh: These 4 values are battle-tested. Do NOT invent new ones.
  - Task 1 config pattern: Match exactly for consistency.

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/resource-caps.ts` exists
  - [ ] All 4 caps defined with exact Nexus values
  - [ ] `resourceCapsForShell()` emits correct `KEY=VALUE\n` format
  - [ ] `applyResourceCaps()` respects pre-existing env vars
  - [ ] Test file exists, all tests pass

  **QA Scenarios**:

  ```
  Scenario: Shell export format is sourceable
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: node -e "import('./dist/workers/lib/resource-caps.js').then(m => console.log(m.resourceCapsForShell()))" > /tmp/caps.env
      2. Source it: bash -c "set -a; source /tmp/caps.env; set +a; env | grep -E 'TURBO_CONCURRENCY|NEXUS_VITEST|OPENCODE_EXPERIMENTAL|NODE_OPTIONS'"
      3. Assert all 4 vars present in env output
    Expected Result: All 4 caps sourced correctly
    Failure Indicators: Missing var, parse error
    Evidence: .sisyphus/evidence/task-7-shell-caps.txt

  Scenario: Existing env not overridden
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: TURBO_CONCURRENCY=8 node -e "import('./dist/workers/lib/resource-caps.js').then(m => { m.applyResourceCaps(); console.log(process.env.TURBO_CONCURRENCY); })"
      2. Assert stdout is "8" (not "2")
    Expected Result: 8 preserved
    Failure Indicators: Overwritten to 2
    Evidence: .sisyphus/evidence/task-7-no-override.txt

  Scenario: Unit tests pass
    Tool: Bash
    Preconditions: Test file written
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/resource-caps.test.ts 2>&1 | tee /tmp/caps-test.txt
      2. Assert all tests PASS
    Expected Result: All tests pass
    Failure Indicators: Any failure
    Evidence: .sisyphus/evidence/task-7-caps-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-7-shell-caps.txt`
  - [ ] `.sisyphus/evidence/task-7-no-override.txt`
  - [ ] `.sisyphus/evidence/task-7-caps-tests.txt`

  **Commit**: YES (Wave 1 commit)
  - Message: `feat(wave-1): foundation modules for long-running session overhaul`
  - Files: `src/workers/config/long-running.ts`, `src/workers/lib/agents-md-reader.ts`, `src/workers/lib/plan-parser.ts`, `src/workers/lib/cost-tracker-v2.ts`, `src/workers/lib/resource-caps.ts`, `src/lib/logger.ts` + all `.test.ts`, `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

- [ ] 8. Wave Executor Module

  **What to do**:
  - Create `src/workers/lib/wave-executor.ts`
  - Export `class WaveExecutor`:
    - Constructor: `(opts: { sessionManager, config: LongRunningConfig, planParser, costTracker, logger, heartbeat, onWaveStart, onWaveComplete })`
    - `async executeWave(wave: ParsedWave, previousState: WaveStateArray): Promise<WaveState>`
    - Logic:
      1. Record wave start timestamp
      2. **Create a FRESH OpenCode session** (do NOT reuse previous wave's session) — this is the entire point of wave-based execution
      3. Build wave prompt via prompt builder (includes: wave number, task list, plan path, "work on unchecked tasks in THIS wave only")
      4. Send prompt to new session
      5. Wait for session idle via completion-detector (Task 10)
      6. On completion: parse plan file (fresh read from disk), verify all tasks in this wave have `- [x]`
      7. Return populated `WaveState`
    - On timeout (90 min per wave): mark wave failed, return state with error
    - On completion-detector idle-exhaustion: dispatch continuation (handled in orchestrate.mts, not here)
  - Export `async function runAllWaves(opts: { plan: ParsedPlan, executor: WaveExecutor, installRunner, costBreaker, betweenWavePush, planSync, logger }): Promise<WaveStateArray>`
    - For each wave in order:
      - Check cost breaker BEFORE next wave (skip for wave 1 — no baseline)
      - Call `executeWave`
      - On success: re-run install if `package.json` SHA changed (use `installRunner`), then between-wave push, then plan sync
      - On failure: stop loop, return state with failed wave
  - Write `src/workers/lib/wave-executor.test.ts` with: single wave happy path, multi-wave sequential, wave timeout, wave failure stops loop, install re-run triggered on package.json change, cost breaker blocks next wave

  **Must NOT do**:
  - Do NOT reuse sessions across waves (fresh session is the whole point)
  - Do NOT modify plan file directly — only read
  - Do NOT skip cost breaker check (except for wave 1 — no baseline)
  - Do NOT silently continue on wave failure
  - Do NOT exceed 90-minute per-wave budget

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This is the single most architecturally important module. State machine semantics, session lifecycle, error handling.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `v-mermaid`: State diagram might help but deferred to doc-phase; code clarity is primary goal

  **Parallelization**:
  - **Can Run In Parallel**: YES (module-level)
  - **Parallel Group**: Wave 2 (with Tasks 9–18)
  - **Blocks**: 19, 21 (orchestrate.mts wiring)
  - **Blocked By**: 1, 5, 6 (config + plan parser + cost tracker)

  **References**:

  **Pattern References**:
  - `src/workers/lib/session-manager.ts:381` - Session lifecycle operations — how to create/close a session
  - `src/workers/lib/validation-pipeline.ts:124` - Stage-by-stage execution pattern (similar to wave-by-wave)
  - `src/workers/lib/fix-loop.ts:135` - Iteration with bounded retries — similar shape

  **API/Type References**:
  - `src/workers/config/long-running.ts:WaveState` and `WaveStateArray` (Task 1)
  - `src/workers/lib/plan-parser.ts:ParsedWave, ParsedPlan` (Task 5)
  - `src/workers/lib/cost-tracker-v2.ts:CostTrackerV2` (Task 6)
  - `src/workers/lib/heartbeat.ts:137` - Heartbeat interface; wave executor must NOT pause heartbeat between waves

  **External References**:
  - Nexus reference (pattern only): `nexus-stack/tools/fly-worker/orchestrate.mjs:500-550` — wave iteration pattern; DO NOT copy code, port mechanism

  **WHY Each Reference Matters**:
  - `session-manager.ts`: Must understand the existing session lifecycle API to know how to create a fresh one per wave.
  - `validation-pipeline.ts`: Very similar shape (stage-by-stage with early exit on failure). Steal structure.
  - `fix-loop.ts`: Learn the bounded-retry pattern; wave executor must NOT introduce unbounded loops.
  - `heartbeat.ts`: Heartbeat MUST keep running between waves — Metis directive. Confirm integration.
  - Nexus orchestrate.mjs: The proven mechanism. Port the _logic_, not the JS code.

  **Acceptance Criteria**:
  - [ ] `src/workers/lib/wave-executor.ts` exists
  - [ ] `src/workers/lib/wave-executor.test.ts` exists with ≥6 tests
  - [ ] All tests pass via `pnpm test -- --run src/workers/lib/wave-executor.test.ts`
  - [ ] No direct modification of plan file in code (grep check)
  - [ ] Fresh session per wave verified by test (mock session manager tracks create calls)

  **QA Scenarios**:

  ```
  Scenario: Multi-wave sequential execution with fresh sessions
    Tool: Bash
    Preconditions: Module + test file written, all Wave-1 deps landed
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/wave-executor.test.ts 2>&1 | tee /tmp/wave-exec.txt
      2. Assert all tests PASS
      3. Assert ≥6 test cases ran
    Expected Result: All wave executor tests pass
    Failure Indicators: Any failure
    Evidence: .sisyphus/evidence/task-8-wave-executor-tests.txt

  Scenario: Wave executor creates fresh session per wave (not reusing)
    Tool: Bash
    Preconditions: Test mocks sessionManager.createSession call
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/wave-executor.test.ts -t "fresh session" 2>&1 | tee /tmp/fresh-session.txt
      2. Assert the specific "fresh session per wave" test passes
      3. Assert mock was called N times for N waves (no reuse)
    Expected Result: PASS
    Failure Indicators: Session reused across waves
    Evidence: .sisyphus/evidence/task-8-fresh-session.txt

  Scenario: Wave failure halts loop
    Tool: Bash
    Preconditions: Module built
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/wave-executor.test.ts -t "wave failure stops" 2>&1 | tee /tmp/halt.txt
      2. Assert PASS
      3. Assert subsequent waves NOT attempted (mock call count)
    Expected Result: Loop halts on failure, returns failed wave state
    Failure Indicators: Subsequent waves attempted
    Evidence: .sisyphus/evidence/task-8-halt-on-failure.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-8-wave-executor-tests.txt`
  - [ ] `.sisyphus/evidence/task-8-fresh-session.txt`
  - [ ] `.sisyphus/evidence/task-8-halt-on-failure.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 9. Continuation Prompt Dispatcher

  **What to do**:
  - Create `src/workers/lib/continuation-dispatcher.ts`
  - Export `class ContinuationDispatcher`:
    - Constructor: `(opts: { config: LongRunningConfig, planParser, sessionManager, logger })`
    - `async dispatchContinuation(opts: { waveNumber: number, sessionId: string, planContent: string, continuationCount: number }): Promise<{ dispatched: boolean, reason: string }>`
    - Logic:
      1. Parse plan content
      2. Find next 3 unchecked tasks in the current wave (via `findNextUncheckedTasks`)
      3. If no unchecked tasks remain → return `{ dispatched: false, reason: "all tasks checked" }`
      4. If `continuationCount >= config.maxContinuationsPerWave (5)` → return `{ dispatched: false, reason: "max continuations reached" }`
      5. Otherwise build continuation message: `"The plan file shows these tasks are still unchecked in Wave {N}: [list]. Please continue working through them. Mark each with [x] when complete. When all tasks in this wave are checked, stop."`
      6. Send via `sessionManager.sendMessage(sessionId, message)`
      7. Return `{ dispatched: true, reason: "sent 3 tasks" }`
  - Write `src/workers/lib/continuation-dispatcher.test.ts` with: dispatches when unchecked tasks exist, blocks when all checked, blocks at max continuations, sends exactly 3 tasks, different wave numbers isolated

  **Must NOT do**:
  - Do NOT dispatch more than `maxContinuationsPerWave` (5) per wave
  - Do NOT dispatch across waves (scope is current wave only)
  - Do NOT mutate plan file
  - Do NOT send empty continuations

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Subtle edge cases around counting, wave scope, max limits; correctness matters for long runs
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 10–18)
  - **Blocks**: 22 (orchestrate.mts wiring)
  - **Blocked By**: 1, 5

  **References**:

  **Pattern References**:
  - `src/workers/lib/session-manager.ts` - Must use `sendMessage` method (or equivalent) to push a prompt into an existing session
  - `src/workers/lib/plan-parser.ts:findNextUncheckedTasks` - The function to call
  - `src/workers/lib/fix-loop.ts` - Similar bounded-retry dispatch pattern

  **API/Type References**:
  - `src/workers/config/long-running.ts:maxContinuationsPerWave` - Config value (5)

  **External References**:
  - Nexus reference (pattern): `nexus-stack/tools/fly-worker/orchestrate.mjs:373-434` — continuation logic

  **WHY Each Reference Matters**:
  - `session-manager.ts`: Continuation must push new message into the _existing_ wave session, not a new one. Understand the API.
  - `plan-parser.ts`: The parser is the source of truth for what's unchecked.
  - Nexus orchestrate.mjs: Battle-tested continuation pattern. Max 5 was chosen because more than that means something is stuck.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass
  - [ ] Max continuations enforced (tested)
  - [ ] 3-task batching enforced (tested)
  - [ ] No mutation of plan file (grep check)

  **QA Scenarios**:

  ```
  Scenario: Dispatcher sends 3 unchecked tasks
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/continuation-dispatcher.test.ts 2>&1 | tee /tmp/cont-disp.txt
      2. Assert PASS
      3. Assert test for "sends exactly 3 tasks" present and passing
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-9-dispatcher-tests.txt

  Scenario: Blocks at max continuations
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/continuation-dispatcher.test.ts -t "max continuations" 2>&1 | tee /tmp/max-cont.txt
      2. Assert PASS
      3. Assert returns {dispatched: false}
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-9-max-cont.txt

  Scenario: All-checked wave returns no dispatch
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/continuation-dispatcher.test.ts -t "all tasks checked" 2>&1 | tee /tmp/all-checked.txt
      2. Assert PASS
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-9-all-checked.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-9-dispatcher-tests.txt`
  - [ ] `.sisyphus/evidence/task-9-max-cont.txt`
  - [ ] `.sisyphus/evidence/task-9-all-checked.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 10. SSE + Polling Fallback Module

  **What to do**:
  - Create `src/workers/lib/completion-detector.ts`
  - Export `class CompletionDetector`:
    - Constructor: `(opts: { sessionManager, logger, config: LongRunningConfig })`
    - `async waitForCompletion(opts: { sessionId: string, waveNumber: number, timeoutMs: number }): Promise<{ outcome: "completed" | "idle" | "timeout" | "error", reason: string, idleCount: number }>`
    - Logic:
      1. Try SSE stream subscription for up to 10 minutes
      2. On SSE timeout or disconnect → fall back to polling every 30 seconds
      3. Track idle state: 3 consecutive polls with no session activity change = idle
      4. Return `idle` outcome when idle threshold hit (orchestrate.mts decides whether to continue)
      5. Return `completed` when session emits finish signal
      6. Return `timeout` when total elapsed > `timeoutMs`
      7. Return `error` on unrecoverable stream/poll error
  - All state transitions logged via `logger.step` (from Task 3) with emojis: 📡 SSE start, 🔄 polling fallback, 💤 idle detected, ✅ completed, ⏱️ timeout
  - Write `src/workers/lib/completion-detector.test.ts` with: SSE completes cleanly, SSE times out → polling kicks in, polling detects idle, total timeout, error propagation

  **Must NOT do**:
  - Do NOT build a full connection manager (Metis directive: simple fallback only)
  - Do NOT retry SSE after first failure — go straight to polling
  - Do NOT poll faster than every 30 seconds (unnecessary load)
  - Do NOT mutate session state

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Event stream handling, state machine with multiple outcomes, timing edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 11–18)
  - **Blocks**: 22 (orchestrate.mts wiring)
  - **Blocked By**: 1, 3

  **References**:

  **Pattern References**:
  - `src/workers/lib/session-manager.ts` - SSE subscription API and session status polling API
  - `src/workers/lib/heartbeat.ts` - Interval/timing pattern
  - `src/lib/retry.ts` - Bounded retry pattern

  **API/Type References**:
  - OpenCode SDK session events (see existing usage in session-manager.ts)

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/orchestrate.mjs:165-496` — SSE + polling pattern

  **WHY Each Reference Matters**:
  - `session-manager.ts`: Must understand existing SSE and polling API — DO NOT rebuild these primitives, use what's there.
  - `heartbeat.ts`: 30-second polling interval — match the pattern for consistency.
  - Nexus orchestrate.mjs: The pattern that worked. Port the decision flow (SSE-first, polling-fallback, 3-idle threshold).

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥5 cases)
  - [ ] Idle threshold = 3 polls (tested)
  - [ ] SSE→polling fallback tested
  - [ ] Total timeout respected

  **QA Scenarios**:

  ```
  Scenario: SSE completes cleanly
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/completion-detector.test.ts -t "SSE completes" 2>&1 | tee /tmp/sse-ok.txt
      2. Assert PASS
    Expected Result: outcome=completed
    Evidence: .sisyphus/evidence/task-10-sse-ok.txt

  Scenario: SSE times out, polling fallback activates
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/completion-detector.test.ts -t "polling fallback" 2>&1 | tee /tmp/poll-fallback.txt
      2. Assert PASS
      3. Assert log contains "🔄 polling fallback"
    Expected Result: Fallback activated, outcome reported
    Evidence: .sisyphus/evidence/task-10-poll-fallback.txt

  Scenario: Idle detection after 3 unchanged polls
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/completion-detector.test.ts -t "idle detection" 2>&1 | tee /tmp/idle.txt
      2. Assert PASS
      3. Assert outcome=idle after exactly 3 unchanged polls
    Expected Result: Idle detected on third unchanged poll
    Evidence: .sisyphus/evidence/task-10-idle.txt

  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/completion-detector.test.ts 2>&1 | tee /tmp/cd-all.txt
      2. Assert PASS across all tests
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-10-all-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-10-sse-ok.txt`
  - [ ] `.sisyphus/evidence/task-10-poll-fallback.txt`
  - [ ] `.sisyphus/evidence/task-10-idle.txt`
  - [ ] `.sisyphus/evidence/task-10-all-tests.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 11. Enriched Prompt Builder

  **What to do**:
  - Create `src/workers/lib/prompt-builder.ts`
  - Export `async function buildPlanningPrompt(opts: { ticket, repoRoot, projectMeta }): Promise<string>` — prompt for Phase 1 (plan generation). Must instruct the agent to:
    1. Read the ticket summary + description
    2. Research the repo using its available tools
    3. Write a plan file to `.sisyphus/plans/{ticket-id}.md` following strict grammar (`## Wave N` + `- [ ] N. title`)
    4. Minimum 1 wave, minimum 1 task, minimum 500 bytes
    5. Exit session when plan is written
  - Export `async function buildExecutionPrompt(opts: { ticket, repoRoot, projectMeta, wave, planPath, agentsMdContent, boulderContext }): Promise<string>` — prompt for Phase 2, called per wave. Must include:
    1. Ticket summary + description
    2. `agentsMdContent` (injected from Task 4, truncated at 8000 chars)
    3. `boulderContext` JSON (from Task 34 — plan name, branch, repo root, wave number)
    4. Current wave number + list of tasks in THIS wave
    5. Completion gate instructions: "Before marking any task complete, run: `pnpm lint && pnpm build && pnpm test -- --run`"
    6. Commit message format: `feat(wave-N): description` with conventional commit rules
    7. Explicit instruction: "Only work on tasks in the current wave. Do not touch tasks from other waves."
  - Export `async function buildContinuationPrompt(uncheckedTasks: ParsedTask[], waveNumber: number): Promise<string>` — prompt for continuation dispatcher (Task 9). Simple: "These tasks in Wave {N} are still unchecked. Continue: [task list]."
  - Write `src/workers/lib/prompt-builder.test.ts` with: planning prompt contains required sections, execution prompt includes AGENTS.md when present, execution prompt works without AGENTS.md, continuation prompt format, prompt max length check (warn if > 20000 chars)

  **Must NOT do**:
  - Do NOT hardcode repo-specific conventions (AGENTS.md is the source)
  - Do NOT reference any AI tool names in prompt content (agent output becomes commits)
  - Do NOT inline huge sections of the plan — reference the plan file path instead
  - Do NOT include subagent delegation instructions (deferred)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering has subjective quality; deserve careful writing and review
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–10, 12–18)
  - **Blocks**: 12 (planning-orchestrator), 28 (task-context.ts refactor)
  - **Blocked By**: 1, 4

  **References**:

  **Pattern References**:
  - `src/workers/lib/task-context.ts:140-184` - Existing prompt template; match structure style but extend content
  - `src/workers/lib/agents-md-reader.ts` (Task 4) - Used to inject AGENTS.md

  **API/Type References**:
  - `src/workers/config/long-running.ts` - Types (Task 1)
  - `src/workers/lib/plan-parser.ts:ParsedWave, ParsedTask` (Task 5)

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/orchestrate.mjs:24-72` — AGENTS.md injection pattern (format reference only)

  **WHY Each Reference Matters**:
  - `task-context.ts`: Current prompt lives here and will be refactored in Task 28. This module centralizes the new version.
  - `agents-md-reader.ts`: The injection source. Must handle null (no AGENTS.md) gracefully.
  - Nexus orchestrate.mjs: Shows what information Nexus bakes in (layer responsibilities, completion gate). Port the _categories_ of info, not specific content.

  **Acceptance Criteria**:
  - [ ] Module with 3 exported functions
  - [ ] Test file with ≥5 cases
  - [ ] All tests pass
  - [ ] Planning prompt tests verify "write plan to .sisyphus/plans" instruction
  - [ ] Execution prompt tests verify AGENTS.md injection conditional on presence

  **QA Scenarios**:

  ```
  Scenario: Planning prompt includes required instructions
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/prompt-builder.test.ts 2>&1 | tee /tmp/pb.txt
      2. Assert PASS
      3. Assert test "planning prompt contains required sections" present
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-11-prompt-builder.txt

  Scenario: Execution prompt works without AGENTS.md
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/prompt-builder.test.ts -t "without AGENTS.md" 2>&1 | tee /tmp/pb-no-agents.txt
      2. Assert PASS
      3. Assert no "null" or "undefined" strings in generated prompt
    Expected Result: Gracefully omits AGENTS.md section
    Evidence: .sisyphus/evidence/task-11-no-agents.txt

  Scenario: Prompt length sanity check
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/prompt-builder.test.ts -t "length" 2>&1 | tee /tmp/pb-len.txt
      2. Assert PASS
      3. Assert prompt under 20000 chars for realistic ticket
    Expected Result: Under limit
    Evidence: .sisyphus/evidence/task-11-length.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-11-prompt-builder.txt`
  - [ ] `.sisyphus/evidence/task-11-no-agents.txt`
  - [ ] `.sisyphus/evidence/task-11-length.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 12. Planning Session Orchestrator (Phase 1)

  **What to do**:
  - Create `src/workers/lib/planning-orchestrator.ts`
  - Export `async function runPlanningPhase(opts: { ticket, repoRoot, projectMeta, sessionManager, promptBuilder, planParser, config: LongRunningConfig, logger }): Promise<{ planContent: string, planPath: string }>`
  - Logic:
    1. Build planning prompt via `promptBuilder.buildPlanningPrompt(...)`
    2. Create NEW OpenCode session (fresh session for planning phase)
    3. Send prompt
    4. Wait for session to finish (bounded by `config.planningTimeoutMs` = 30 min)
    5. Check that `.sisyphus/plans/{ticket-id}.md` exists on disk
    6. Read the file
    7. Parse via `planParser.parsePlanFile`
    8. Validate via `planParser.validatePlan` — if invalid throw `PlanValidationError` with details
    9. Lock file read-only: `fs.chmod(planPath, 0o444)` (Metis directive)
    10. Return `{ planContent, planPath }`
  - Export custom error class `PlanValidationError extends Error` (includes `errors: string[]`)
  - Write `src/workers/lib/planning-orchestrator.test.ts` with: valid plan written happy path, missing plan file throws, invalid plan throws PlanValidationError, planning timeout throws, chmod 444 applied

  **Must NOT do**:
  - Do NOT re-use session from outside planning phase
  - Do NOT exceed planning timeout
  - Do NOT accept invalid plans (≥1 wave, ≥1 task, >500 bytes required)
  - Do NOT skip chmod 444 (Metis directive — lock plan after Phase 1)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Critical correctness — if Phase 1 produces bad output, Phase 2 crashes. Must validate strictly.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–11, 13–18)
  - **Blocks**: 20 (orchestrate.mts wiring)
  - **Blocked By**: 1, 5, 11

  **References**:

  **Pattern References**:
  - `src/workers/lib/session-manager.ts` - Session creation + completion wait pattern
  - `src/workers/lib/completion.ts:170` - Existing completion detection (preserve Supabase-first ordering)

  **API/Type References**:
  - `src/workers/lib/prompt-builder.ts:buildPlanningPrompt` (Task 11)
  - `src/workers/lib/plan-parser.ts:parsePlanFile, validatePlan` (Task 5)
  - `src/workers/config/long-running.ts:planningTimeoutMs` (Task 1)

  **WHY Each Reference Matters**:
  - `session-manager.ts`: Planning phase is still OpenCode, just with a different prompt and shorter timeout.
  - `completion.ts`: Understand the existing completion flow — MUST NOT break the Supabase-first ordering during Phase 1.
  - Metis mandate: `chmod 444` is non-negotiable.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All ≥5 tests pass
  - [ ] `chmod 444` verified by test (check file permissions after call)
  - [ ] Custom error class exported
  - [ ] Validation rejects small plans

  **QA Scenarios**:

  ```
  Scenario: Valid plan happy path
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/planning-orchestrator.test.ts 2>&1 | tee /tmp/plan-orch.txt
      2. Assert PASS
      3. Assert ≥5 tests present
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-12-planning-orch.txt

  Scenario: chmod 444 applied
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/planning-orchestrator.test.ts -t "chmod" 2>&1 | tee /tmp/chmod.txt
      2. Assert PASS
      3. Assert test verifies file mode = 0o444
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-12-chmod.txt

  Scenario: Invalid plan throws PlanValidationError
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/planning-orchestrator.test.ts -t "invalid plan" 2>&1 | tee /tmp/invalid.txt
      2. Assert PASS
      3. Assert throws instance of PlanValidationError
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-12-invalid-plan.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-12-planning-orch.txt`
  - [ ] `.sisyphus/evidence/task-12-chmod.txt`
  - [ ] `.sisyphus/evidence/task-12-invalid-plan.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 13. Fallback Draft PR Creator

  **What to do**:
  - Create `src/workers/lib/fallback-pr.ts`
  - Export `async function createFallbackPr(opts: { githubClient, repoOwner, repoName, branchName, ticket, completedWaves, failedWave, error, logger }): Promise<{ created: boolean, prUrl: string | null, reason: string }>`
  - Logic:
    1. Check `git diff --name-only origin/main` → if empty, return `{ created: false, reason: "no changes to preserve" }` (Metis directive — skip fallback when nothing exists)
    2. Check branch exists on remote (if not, push it with `--force-with-lease`)
    3. Generate PR body with sections:
       - `## ⚠️ Agent Failure — Draft PR`
       - `### Ticket`: ticket key, summary, description
       - `### Waves Completed`: list of completed waves with checkmarks
       - `### Wave That Failed`: wave number and error message
       - `### Error Details`: stack trace or error object (truncated 2000 chars)
       - `### Diff Stats`: `git diff --stat origin/main`
       - `### Commit Log`: `git log --oneline origin/main..HEAD`
       - `### Next Steps`: "Manual review required. Check failing wave's tasks. Do NOT merge without human review."
    4. Call `githubClient.createPullRequest(...)` with `draft: true`, labels `["agent-failure"]`
    5. Return `{ created: true, prUrl, reason: "draft PR created" }`
  - Write `src/workers/lib/fallback-pr.test.ts` with: happy path, no changes returns false, missing branch pushed, label applied, body includes all sections

  **Must NOT do**:
  - Do NOT create fallback PR when there are zero changes
  - Do NOT create non-draft PR
  - Do NOT omit the `agent-failure` label
  - Do NOT reference AI tools in the PR body text (commit message rule extends to PR body)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: GitHub integration with real API surface — care needed for edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–12, 14–18)
  - **Blocks**: 25 (orchestrate.mts wiring)
  - **Blocked By**: 1

  **References**:

  **Pattern References**:
  - `src/workers/lib/pr-manager.ts:97` - Existing PR creation flow — understand `createPullRequest` interface
  - `src/lib/github-client.ts` - GitHub client implementation (API for PRs, labels, diffs)
  - `src/workers/lib/branch-manager.ts:105` - Branch/push helpers

  **API/Type References**:
  - `src/lib/github-client.ts` - `createPullRequest`, `addLabels` methods

  **External References**:
  - GitHub API docs: https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request — `draft: true` parameter
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:616-690` — fallback PR pattern

  **WHY Each Reference Matters**:
  - `pr-manager.ts`: Existing success-path PR creator. Fallback path shares the same underlying GitHub client.
  - `branch-manager.ts`: Must reuse `--force-with-lease` push (Metis directive).
  - Nexus entrypoint.sh: Battle-tested logic for the "partial work preservation" scenario.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥5)
  - [ ] No-changes case returns `created: false`
  - [ ] Label `agent-failure` applied
  - [ ] PR body contains all required sections (asserted by string match)

  **QA Scenarios**:

  ```
  Scenario: Creates draft PR with label
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/fallback-pr.test.ts 2>&1 | tee /tmp/fbpr.txt
      2. Assert PASS
      3. Assert test for "draft: true" passes
      4. Assert test for "agent-failure label" passes
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-13-fallback-pr.txt

  Scenario: No changes returns early
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/fallback-pr.test.ts -t "no changes" 2>&1 | tee /tmp/fbpr-empty.txt
      2. Assert PASS
      3. Assert returned { created: false }
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-13-no-changes.txt

  Scenario: PR body includes all required sections
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/fallback-pr.test.ts -t "body sections" 2>&1 | tee /tmp/fbpr-body.txt
      2. Assert PASS
      3. Assert body contains "Waves Completed", "Wave That Failed", "Next Steps"
    Expected Result: All sections present
    Evidence: .sisyphus/evidence/task-13-body.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-13-fallback-pr.txt`
  - [ ] `.sisyphus/evidence/task-13-no-changes.txt`
  - [ ] `.sisyphus/evidence/task-13-body.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 14. Per-Task Cost Circuit Breaker

  **What to do**:
  - Create `src/workers/lib/cost-breaker.ts`
  - Export `class CostBreaker`:
    - Constructor: `(opts: { config: LongRunningConfig, costTracker: CostTrackerV2, logger })`
    - `shouldStop(waveNumber: number): { stop: boolean, reason: string, totals: { tokensIn, tokensOut } }`
    - Logic:
      1. If waveNumber === 1 → always return `{ stop: false }` (no baseline yet; Metis directive)
      2. Get task totals from costTracker
      3. Compute a **token-only** threshold check. Because we do NOT log dollars, we cannot check against a USD cent threshold directly. Instead:
         - The breaker uses `config.costBreakerTokenCap` (a new field added to `LongRunningConfig` in Task 1 — see note). The token cap is the orchestrator's budget. Default: 4,000,000 tokens (conservative for a long task).
         - **NOTE**: The plan originally described `costBreakerUsdCentsPerTask`. To comply with Metis's "token-only" directive, **this field is RENAMED to `costBreakerTokenCap`** during Task 1 implementation. Document this in Task 1's types.
      4. If `(tokensIn + tokensOut) > costBreakerTokenCap` → return `{ stop: true, reason: "token cap exceeded" }`
      5. Else return `{ stop: false }`
  - Write `src/workers/lib/cost-breaker.test.ts` with: wave 1 never stops, wave 2+ checks totals, over-cap triggers stop, under-cap allows continue, token totals correctly summed
  - **COORDINATION NOTE**: Task 1 implementer must use the name `costBreakerTokenCap` (NOT `costBreakerUsdCentsPerTask`). The plan originally sketched the USD name but Metis's token-only rule forces this rename. Both tasks land in Wave 1/Wave 2 same commits, so the coordination is visible in code review.

  **Must NOT do**:
  - Do NOT use dollar amounts anywhere
  - Do NOT check mid-wave (between waves only)
  - Do NOT check before wave 1 completes (no baseline)
  - Do NOT hardcode a pricing table

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple class with clear predicate logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–13, 15–18)
  - **Blocks**: 24 (orchestrate.mts wiring)
  - **Blocked By**: 1, 6

  **References**:

  **Pattern References**:
  - `src/workers/lib/cost-tracker-v2.ts` (Task 6) - Source of totals
  - `src/workers/config/long-running.ts` (Task 1) - Config with `costBreakerTokenCap`

  **WHY Each Reference Matters**:
  - `cost-tracker-v2.ts`: Breaker is a predicate on top of tracker totals.
  - `long-running.ts`: The cap field MUST be named `costBreakerTokenCap` per this task's coordination note.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥5)
  - [ ] Wave 1 never stops (tested)
  - [ ] Over-cap triggers stop (tested)
  - [ ] Field name `costBreakerTokenCap` in long-running config confirmed

  **QA Scenarios**:

  ```
  Scenario: Wave 1 never stops
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/cost-breaker.test.ts -t "wave 1" 2>&1 | tee /tmp/cb-w1.txt
      2. Assert PASS
    Expected Result: shouldStop returns false for waveNumber=1
    Evidence: .sisyphus/evidence/task-14-wave-1.txt

  Scenario: Over-cap triggers stop
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/cost-breaker.test.ts -t "over cap" 2>&1 | tee /tmp/cb-over.txt
      2. Assert PASS
    Expected Result: shouldStop returns true, reason mentions cap
    Evidence: .sisyphus/evidence/task-14-over-cap.txt

  Scenario: Field name coordination check
    Tool: Bash
    Steps:
      1. Run: grep "costBreakerTokenCap" src/workers/config/long-running.ts
      2. Assert match found
    Expected Result: Field present with expected name
    Evidence: .sisyphus/evidence/task-14-field-name.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-14-wave-1.txt`
  - [ ] `.sisyphus/evidence/task-14-over-cap.txt`
  - [ ] `.sisyphus/evidence/task-14-field-name.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 15. Cache Validation Helper

  **What to do**:
  - Create `src/workers/lib/cache-validator.ts`
  - Export `async function validateCache(cachePath: string, expectedRemoteUrl: string): Promise<{ valid: boolean, reason: string }>`
  - Perform 3-point validation:
    1. **`.git` structure check**: Directory `{cachePath}/.git` exists AND contains `HEAD`, `config`, `refs/` subdir
    2. **Remote URL check**: Run `git -C {cachePath} remote get-url origin` → compare to `expectedRemoteUrl`
    3. **HEAD sanity check**: Run `git -C {cachePath} symbolic-ref --short HEAD` or `git -C {cachePath} rev-parse HEAD` → assert it works (detached HEAD is OK as long as commit resolves)
  - If all 3 pass → `{ valid: true, reason: "cache is valid" }`
  - If any fail → `{ valid: false, reason: "[specific failure]" }` (caller will fall back to fresh clone)
  - Write `src/workers/lib/cache-validator.test.ts` with: valid cache, missing .git, wrong remote, broken HEAD, missing HEAD file

  **Must NOT do**:
  - Do NOT attempt to repair broken cache — just report false
  - Do NOT throw — always return result object
  - Do NOT assume shell is available; use `execFile` with args (not `exec` with string)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file/git checks with clear test fixtures
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–14, 16–18)
  - **Blocks**: 30 (entrypoint.sh cache integration)
  - **Blocked By**: 1

  **References**:

  **Pattern References**:
  - `src/workers/lib/branch-manager.ts:105` - Existing git operations pattern
  - `src/workers/lib/install-runner.ts` - Small helper with execFile pattern

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:113-188` — 3-point cache validation

  **WHY Each Reference Matters**:
  - `branch-manager.ts`: Canonical git-call pattern in this codebase.
  - Nexus entrypoint.sh: Defines the 3 checks. Port exact criteria.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥5)
  - [ ] Uses execFile (not exec-string)
  - [ ] No-throw contract verified by test

  **QA Scenarios**:

  ```
  Scenario: Valid cache passes all 3 checks
    Tool: Bash
    Steps:
      1. Create test fixture: git clone https://github.com/viiqswim/ai-employee-test-target /tmp/cache-fixture
      2. Run: pnpm test -- --run src/workers/lib/cache-validator.test.ts 2>&1 | tee /tmp/cv.txt
      3. Assert PASS
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-15-cache-validator.txt

  Scenario: Missing .git returns invalid
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/cache-validator.test.ts -t "missing .git" 2>&1 | tee /tmp/cv-nogit.txt
      2. Assert PASS
    Expected Result: { valid: false, reason matches .git }
    Evidence: .sisyphus/evidence/task-15-missing-git.txt

  Scenario: Wrong remote URL returns invalid
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/cache-validator.test.ts -t "wrong remote" 2>&1 | tee /tmp/cv-remote.txt
      2. Assert PASS
    Expected Result: { valid: false, reason matches remote }
    Evidence: .sisyphus/evidence/task-15-wrong-remote.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-15-cache-validator.txt`
  - [ ] `.sisyphus/evidence/task-15-missing-git.txt`
  - [ ] `.sisyphus/evidence/task-15-wrong-remote.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 16. Disk Space Pre-Check Helper

  **What to do**:
  - Create `src/workers/lib/disk-check.ts`
  - Export `async function checkDiskSpace(path: string, minBytes: number = 2_147_483_648): Promise<{ ok: boolean, freeBytes: number, reason: string }>`
  - Logic:
    1. Use `fs.promises.statfs(path)` (Node ≥19) — if unavailable, fall back to `execFile('df', ['-k', path])` and parse output
    2. Compute free bytes
    3. If `freeBytes >= minBytes` → `{ ok: true, freeBytes, reason: "sufficient" }`
    4. Else → `{ ok: false, freeBytes, reason: "insufficient: {freeBytes}<{minBytes}" }`
  - Export `async function checkDiskSpaceOrWarn(path: string, minBytes: number, logger): Promise<boolean>` — convenience wrapper that logs a warning on failure but doesn't throw
  - Write `src/workers/lib/disk-check.test.ts` with: sufficient space, insufficient space (mock statfs), df fallback path, logger called on insufficient

  **Must NOT do**:
  - Do NOT throw on insufficient space — caller decides
  - Do NOT call `du -sh` or other slow commands
  - Do NOT assume statfs is available on all Node versions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility with mockable I/O
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–15, 17, 18)
  - **Blocks**: 31 (entrypoint.sh disk check integration)
  - **Blocked By**: 1

  **References**:

  **Pattern References**:
  - `src/workers/lib/install-runner.ts` - execFile pattern
  - `src/workers/lib/cache-validator.ts` (Task 15) - Sibling helper style

  **External References**:
  - Node docs: `fs.promises.statfs` — https://nodejs.org/api/fs.html#fspromisesstatfspath-options
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:117-123` — minimum 2GB threshold

  **WHY Each Reference Matters**:
  - `statfs` is preferred but Node version matters — check compatibility, fall back if needed.
  - Nexus 2GB threshold is battle-tested.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥4)
  - [ ] Default threshold = 2 GB
  - [ ] No-throw contract verified

  **QA Scenarios**:

  ```
  Scenario: Sufficient space path
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/disk-check.test.ts 2>&1 | tee /tmp/dc.txt
      2. Assert PASS
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-16-disk-check.txt

  Scenario: Runs in real environment
    Tool: Bash
    Steps:
      1. Run: node -e "import('./dist/workers/lib/disk-check.js').then(m => m.checkDiskSpace('/tmp', 1024)).then(r => console.log(JSON.stringify(r)))"
      2. Assert stdout contains ok, freeBytes
      3. Assert freeBytes > 1024
    Expected Result: ok: true
    Evidence: .sisyphus/evidence/task-16-real-run.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-16-disk-check.txt`
  - [ ] `.sisyphus/evidence/task-16-real-run.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 17. Plan File Sync Module (Supabase + Disk)

  **What to do**:
  - Create `src/workers/lib/plan-sync.ts`
  - Export `class PlanSync`:
    - Constructor: `(opts: { postgrestClient, logger, diskPath: string })`
    - `async savePlanAfterPhase1(opts: { taskId: string, planContent: string }): Promise<void>`:
      1. Write plan to `diskPath` (e.g., `.sisyphus/plans/{ticket-id}.md`)
      2. Update Supabase: `tasks.plan_content = planContent`, `tasks.plan_generated_at = NOW()` via PostgREST PATCH
      3. BOTH must succeed — if Supabase fails, throw (disk write is worthless without durable persistence)
    - `async loadPlanOnRestart(taskId: string): Promise<{ planContent: string, source: "disk" | "supabase" } | null>`:
      1. Try disk first: if file exists at `diskPath` → return `{ planContent, source: "disk" }`
      2. Fall back to Supabase: query `tasks.plan_content` for taskId → if non-null, write back to disk and return `{ planContent, source: "supabase" }`
      3. If both miss → return `null` (means Phase 1 didn't complete)
    - `async updateWaveState(opts: { executionId: string, waveNumber: number, waveState: WaveStateArray }): Promise<void>`:
      - PATCH `executions.wave_number = waveNumber`, `executions.wave_state = waveState`
  - Write `src/workers/lib/plan-sync.test.ts` with: savePlan writes to both, saveFails if Supabase down, loadPlan prefers disk, loadPlan falls back to Supabase, loadPlan returns null when both empty, updateWaveState PATCHes correct row

  **Must NOT do**:
  - Do NOT swallow Supabase errors silently — plan persistence is critical
  - Do NOT write to disk if Supabase PATCH fails (inconsistency risk)
  - Do NOT cache — always fresh read on loadPlanOnRestart
  - Do NOT break Supabase-first ordering for completion events (Metis mandate — separate flow but document)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Coordinated two-store write with correctness implications; care needed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–16, 18)
  - **Blocks**: 26 (orchestrate wire), 35 (entrypoint restart path)
  - **Blocked By**: 1, 2, 5

  **References**:

  **Pattern References**:
  - `src/workers/lib/postgrest-client.ts:114` - Existing PostgREST client; reuse for PATCH
  - `src/workers/lib/completion.ts:170` - Supabase-first ordering reference (do NOT break)

  **API/Type References**:
  - `src/workers/config/long-running.ts:WaveStateArray` (Task 1)
  - `prisma/schema.prisma` new columns (Task 2)

  **WHY Each Reference Matters**:
  - `postgrest-client.ts`: The ONE client to talk to Supabase from workers. Don't invent a new one.
  - `completion.ts`: Supabase-first ordering is a hard rule. Understand it so we don't violate in plan sync.
  - Task 2 schema: Must match column names exactly.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥6)
  - [ ] Supabase failure throws (does NOT silently write to disk)
  - [ ] Load prefers disk, falls back to Supabase
  - [ ] updateWaveState PATCHes correct row (asserted via mock)

  **QA Scenarios**:

  ```
  Scenario: Save writes to both stores
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/plan-sync.test.ts 2>&1 | tee /tmp/ps.txt
      2. Assert PASS
      3. Assert test "save writes to both" present
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-17-plan-sync.txt

  Scenario: Load fallback to Supabase
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/plan-sync.test.ts -t "fallback" 2>&1 | tee /tmp/ps-fb.txt
      2. Assert PASS
    Expected Result: Returns planContent from Supabase when disk empty
    Evidence: .sisyphus/evidence/task-17-fallback.txt

  Scenario: Real PostgREST smoke test
    Tool: Bash
    Steps:
      1. Ensure Supabase running locally
      2. Insert test task row via psql
      3. Run: node -e "script that calls savePlanAfterPhase1 with test id + content"
      4. Verify via psql: SELECT plan_content FROM tasks WHERE id = 'test-id'
      5. Assert content matches
    Expected Result: plan_content persisted
    Evidence: .sisyphus/evidence/task-17-real-postgrest.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-17-plan-sync.txt`
  - [ ] `.sisyphus/evidence/task-17-fallback.txt`
  - [ ] `.sisyphus/evidence/task-17-real-postgrest.txt`

  **Commit**: NO (groups with Wave 2 commit)

- [ ] 18. Between-Wave Push Module

  **What to do**:
  - Create `src/workers/lib/between-wave-push.ts`
  - Export `async function pushBetweenWaves(opts: { repoRoot: string, branchName: string, waveNumber: number, waveDescription: string, logger }): Promise<{ pushed: boolean, commitSha: string | null }>`
  - Logic:
    1. Check if there are uncommitted changes: `git -C {repoRoot} status --porcelain` — if empty, log and skip ("no changes to commit this wave")
    2. Stage all: `git -C {repoRoot} add -A`
    3. Commit: `git -C {repoRoot} commit -m "feat(wave-{waveNumber}): {waveDescription}"`
       - Must use the actual commit command (NOT `--no-verify` — project rule)
       - Respect pre-commit hooks
    4. Get commit SHA: `git -C {repoRoot} rev-parse HEAD`
    5. Push: `git -C {repoRoot} push --force-with-lease origin {branchName}` (Metis directive)
    6. Return `{ pushed: true, commitSha }`
  - On any git error: log full error, throw (caller decides fallback)
  - Write `src/workers/lib/between-wave-push.test.ts` with: clean commit path, no changes skipped, commit message format verified, --force-with-lease used (not --force), pre-commit hook respected

  **Must NOT do**:
  - Do NOT use `--no-verify` (project rule)
  - Do NOT use raw `--force` (use `--force-with-lease`)
  - Do NOT reference AI tools in the commit message (project rule)
  - Do NOT add `Co-authored-by` trailers (project rule)
  - Do NOT swallow git errors silently

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small git wrapper, well-defined behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8–17)
  - **Blocks**: 23 (orchestrate.mts wiring)
  - **Blocked By**: 1

  **References**:

  **Pattern References**:
  - `src/workers/lib/branch-manager.ts:105` - Existing git commit + push helpers; reuse `execFile` pattern
  - `src/workers/lib/pr-manager.ts:97` - Existing push call for reference

  **External References**:
  - Git docs: `--force-with-lease` semantics — https://git-scm.com/docs/git-push#Documentation/git-push.txt---force-with-leaseltrefnamegt

  **WHY Each Reference Matters**:
  - `branch-manager.ts`: Canonical git shell-out pattern. Match exactly.
  - `--force-with-lease`: Safer than `--force` — Metis directive.

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥5)
  - [ ] `--force-with-lease` verified in test (grep arg list in mock)
  - [ ] Commit message format `feat(wave-N): desc` verified
  - [ ] No `--no-verify` in source (grep check)

  **QA Scenarios**:

  ```
  Scenario: Clean commit + push path
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/between-wave-push.test.ts 2>&1 | tee /tmp/bwp.txt
      2. Assert PASS
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-18-between-wave-push.txt

  Scenario: No --no-verify or --force in source
    Tool: Bash
    Steps:
      1. Run: grep -n "no-verify" src/workers/lib/between-wave-push.ts
      2. Assert no matches
      3. Run: grep -n -- "--force" src/workers/lib/between-wave-push.ts
      4. Assert matches contain ONLY "--force-with-lease" (no raw --force)
    Expected Result: Clean source
    Evidence: .sisyphus/evidence/task-18-no-force.txt

  Scenario: Commit message format enforced
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/between-wave-push.test.ts -t "commit message" 2>&1 | tee /tmp/bwp-msg.txt
      2. Assert PASS
      3. Assert test verifies message matches regex `^feat\(wave-\d+\):`
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-18-msg-format.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-18-between-wave-push.txt`
  - [ ] `.sisyphus/evidence/task-18-no-force.txt`
  - [ ] `.sisyphus/evidence/task-18-msg-format.txt`

  **Commit**: YES (Wave 2 commit)
  - Message: `feat(wave-2): core wave execution and safety modules`
  - Files: `src/workers/lib/wave-executor.ts`, `continuation-dispatcher.ts`, `completion-detector.ts`, `prompt-builder.ts`, `planning-orchestrator.ts`, `fallback-pr.ts`, `cost-breaker.ts`, `cache-validator.ts`, `disk-check.ts`, `plan-sync.ts`, `between-wave-push.ts` + all `.test.ts`
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

- [ ] 19. Refactor orchestrate.mts — Two-Phase Skeleton

  **What to do**:
  - Edit `src/workers/orchestrate.mts`
  - Introduce top-level phase separation:
    ```ts
    async function main() {
      const context = await parseContextFromEnv(); // existing
      const config = readConfigFromEnv();
      const logger = createWorkerLogger(...);
      await runPreFlight(context, config, logger); // existing checks
      const { planContent, planPath } = await phase1Planning(context, config, logger); // NEW
      const waveState = await phase2Execution(context, config, planContent, planPath, logger); // NEW
      await finalize(context, waveState, logger); // existing completion
    }
    ```
  - Both `phase1Planning` and `phase2Execution` are empty stubs in this task — Task 20 and 21 fill them in
  - Preserve ALL existing behavior when both stubs are empty (they can fall through to current linear flow temporarily is NOT allowed — instead, throw `"Not implemented yet — Tasks 20/21 required"` to make partial state obvious)
  - Delete: any code paths that assume a single session (they move into phase2Execution)
  - Update imports to add new Wave 2 modules
  - Run `pnpm build` — must compile cleanly (stubs allowed to throw at runtime)

  **Must NOT do**:
  - Do NOT remove fix-loop import (safety net stays)
  - Do NOT remove validation-pipeline import (safety net stays)
  - Do NOT remove completion.ts call (preserve Supabase-first ordering)
  - Do NOT break the E2E test path — this task must still compile and the existing tests must still pass (they'll skip phase1/2 stubs until Task 20/21)
  - Do NOT introduce any runtime logic in phase1/phase2 stubs

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: High-risk refactor of the main entrypoint — changes must preserve existing correctness invariants while creating space for new logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential within orchestrate.mts)
  - **Parallel Group**: Wave 3 (sequential — runs before 20)
  - **Blocks**: 20, 21, 22, 23, 24, 25, 26, 27, 28 (all Wave 3 tasks operate on orchestrate.mts after skeleton in place)
  - **Blocked By**: 8 (wave-executor must exist before we can even import it)

  **References**:

  **Pattern References**:
  - `src/workers/orchestrate.mts:1-370` - Current implementation to refactor
  - `src/workers/lib/completion.ts:170` - Completion flow to preserve

  **API/Type References**:
  - All new Wave 2 modules (Tasks 8–18) will be imported here

  **WHY Each Reference Matters**:
  - `orchestrate.mts`: This is the file being refactored. Read top-to-bottom before changing.
  - `completion.ts`: Supabase-first ordering is non-negotiable. Understand exactly where it happens so you preserve it.

  **Acceptance Criteria**:
  - [ ] `phase1Planning` and `phase2Execution` function signatures exist
  - [ ] Both stubs throw "Not implemented yet"
  - [ ] `pnpm build` succeeds
  - [ ] Existing tests on orchestrate.mts still pass or are properly updated
  - [ ] Validation-pipeline + fix-loop imports preserved
  - [ ] Completion.ts call preserved

  **QA Scenarios**:

  ```
  Scenario: Build succeeds after refactor
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tee /tmp/build.txt
      2. Assert exit code 0
      3. Assert no "error TS" in output
    Expected Result: Clean build
    Evidence: .sisyphus/evidence/task-19-build.txt

  Scenario: Fix-loop imports preserved
    Tool: Bash
    Steps:
      1. Run: grep -n "fix-loop\|validation-pipeline\|completion" src/workers/orchestrate.mts
      2. Assert all 3 imports present
    Expected Result: All safety-net imports intact
    Evidence: .sisyphus/evidence/task-19-imports.txt

  Scenario: Stubs throw clearly
    Tool: Bash
    Steps:
      1. Run: grep -A2 "async function phase" src/workers/orchestrate.mts | grep -i "not implemented"
      2. Assert match
    Expected Result: Stubs present
    Evidence: .sisyphus/evidence/task-19-stubs.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-19-build.txt`
  - [ ] `.sisyphus/evidence/task-19-imports.txt`
  - [ ] `.sisyphus/evidence/task-19-stubs.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 20. Wire Planning Phase into orchestrate.mts

  **What to do**:
  - Edit `src/workers/orchestrate.mts` → implement `phase1Planning(context, config, logger)`:
    1. Instantiate `PlanningOrchestrator` (from Task 12) with session manager + prompt builder + plan parser + config + logger
    2. Instantiate `PlanSync` (from Task 17) with postgrest client + logger + disk path `.sisyphus/plans/{ticket-id}.md`
    3. On restart: try `planSync.loadPlanOnRestart(taskId)` first — if non-null, skip re-planning (Phase 1 already ran)
    4. Otherwise: call `planningOrchestrator.runPlanningPhase(...)` → get `{ planContent, planPath }`
    5. Call `planSync.savePlanAfterPhase1({ taskId, planContent })` — persists to BOTH stores
    6. Return `{ planContent, planPath }`
  - Heartbeat must continue during Phase 1 (already running from Task 19 pre-flight — verify it does NOT pause)
  - Log phase transitions via `logger.step("📋", "Phase 1 planning started")` and `logger.step("✅", "Phase 1 planning complete")`

  **Must NOT do**:
  - Do NOT skip `planSync.savePlanAfterPhase1` (dual persistence is mandatory)
  - Do NOT pause heartbeat during planning
  - Do NOT catch `PlanValidationError` and silently continue — throw it (orchestrate.mts catch-all will trigger escalation)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Two-store persistence coordination + restart idempotency; correctness matters
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — runs after 19, before 21)
  - **Blocks**: 21 (phase 2 needs plan to exist)
  - **Blocked By**: 19, 12, 17

  **References**:

  **Pattern References**:
  - `src/workers/lib/planning-orchestrator.ts` (Task 12)
  - `src/workers/lib/plan-sync.ts` (Task 17)
  - `src/workers/lib/heartbeat.ts:137` - Heartbeat semantics

  **WHY Each Reference Matters**:
  - Task 12 module is the work body. Task 20 is the thin adapter into orchestrate.mts.
  - Heartbeat: confirm it runs across planning.

  **Acceptance Criteria**:
  - [ ] `phase1Planning` implemented (no longer throws)
  - [ ] Restart idempotency verified (tests: call twice, second call returns existing plan)
  - [ ] Both stores receive plan (tested via mock)
  - [ ] `pnpm build` passes
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Build + test after wire
    Tool: Bash
    Steps:
      1. Run: pnpm build 2>&1 | tee /tmp/b.txt
      2. Run: pnpm test -- --run 2>&1 | tee /tmp/t.txt
      3. Assert both exit 0
    Expected Result: Clean build + tests
    Evidence: .sisyphus/evidence/task-20-build-test.txt

  Scenario: Restart idempotency integration test
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "restart idempotency" 2>&1 | tee /tmp/idempotent.txt
      2. Assert PASS
    Expected Result: Second call returns existing plan without re-running Phase 1
    Evidence: .sisyphus/evidence/task-20-idempotent.txt

  Scenario: Heartbeat continues during planning
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "heartbeat continues" 2>&1 | tee /tmp/hb.txt
      2. Assert PASS
    Expected Result: Heartbeat mock called ≥1 time during planning phase
    Evidence: .sisyphus/evidence/task-20-heartbeat.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-20-build-test.txt`
  - [ ] `.sisyphus/evidence/task-20-idempotent.txt`
  - [ ] `.sisyphus/evidence/task-20-heartbeat.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 21. Wire Wave Executor into orchestrate.mts

  **What to do**:
  - Edit `src/workers/orchestrate.mts` → implement `phase2Execution(context, config, planContent, planPath, logger)`:
    1. Parse plan: `const parsed = parsePlanFile(planContent)`
    2. Instantiate `WaveExecutor` (from Task 8)
    3. Determine starting wave: check `executions.wave_number` in DB (for restart) — default to 1
    4. Call `runAllWaves({ plan: parsed, executor, installRunner, costBreaker, betweenWavePush, planSync, logger })` from Task 8
    5. On success → return final `WaveStateArray`
    6. On failure (any wave throws) → catch error, store partial state, rethrow to outer handler for escalation
  - Add logging: `logger.step("🌊", "Phase 2 execution started — {N} waves")`, `logger.step("✅", "Phase 2 complete")`
  - Heartbeat must continue (it was started pre-phase and keeps running)

  **Must NOT do**:
  - Do NOT skip the wave executor — it IS phase 2
  - Do NOT retry the whole phase on failure (wave executor handles within-wave retries via fix-loop; phase-level failure = escalate)
  - Do NOT modify plan file during execution

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core orchestration glue; failure modes matter
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — runs after 20, before 22)
  - **Blocks**: 22, 23, 24, 25, 26, 27, 28
  - **Blocked By**: 19, 20, 8

  **References**:

  **Pattern References**:
  - `src/workers/lib/wave-executor.ts` (Task 8) - Module to wire
  - `src/workers/orchestrate.mts:phase1Planning` (Task 20) - Phase pattern

  **WHY Each Reference Matters**:
  - Phase 2 is the thin adapter, like Phase 1. Mirror its structure.

  **Acceptance Criteria**:
  - [ ] `phase2Execution` implemented
  - [ ] `pnpm build` passes
  - [ ] `pnpm test -- --run` passes
  - [ ] Integration test: full linear mock plan runs to completion

  **QA Scenarios**:

  ```
  Scenario: Full mock plan runs end-to-end (unit-mock)
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "phase 2 linear" 2>&1 | tee /tmp/p2.txt
      2. Assert PASS
    Expected Result: Mock plan with 3 waves completes all 3
    Evidence: .sisyphus/evidence/task-21-phase2.txt

  Scenario: Wave failure stops phase and rethrows
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "phase 2 failure" 2>&1 | tee /tmp/p2-fail.txt
      2. Assert PASS
      3. Assert error propagated to outer handler
    Expected Result: Phase 2 errors bubble up
    Evidence: .sisyphus/evidence/task-21-failure.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-21-phase2.txt`
  - [ ] `.sisyphus/evidence/task-21-failure.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 22. Wire Continuation Dispatcher + Completion Detector

  **What to do**:
  - Edit `src/workers/orchestrate.mts` → inside the wave executor loop (Task 8 module), ensure per-wave session uses the completion detector and continuation dispatcher correctly:
    - After sending initial wave prompt → call `completionDetector.waitForCompletion({ sessionId, waveNumber, timeoutMs: 90*60*1000 })`
    - If outcome is `idle`: call `continuationDispatcher.dispatchContinuation({ waveNumber, sessionId, planContent: freshRead, continuationCount })`
    - If dispatched → increment `continuationCount`, call `waitForCompletion` again (loop)
    - If NOT dispatched (all checked or max reached) → break loop, return wave state
  - This wiring may require small refactoring of `WaveExecutor` from Task 8 if interfaces need aligning — acceptable if correctness is preserved
  - Per-wave continuation count starts fresh at wave boundary (reset to 0)

  **Must NOT do**:
  - Do NOT let continuationCount persist across waves (reset per wave)
  - Do NOT dispatch continuations after completion-detector reports `completed`
  - Do NOT exceed max continuations per wave (5)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Glue code between modules; subtle state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: 23
  - **Blocked By**: 21, 9, 10

  **References**:

  **Pattern References**:
  - `src/workers/lib/wave-executor.ts` (Task 8)
  - `src/workers/lib/continuation-dispatcher.ts` (Task 9)
  - `src/workers/lib/completion-detector.ts` (Task 10)

  **WHY Each Reference Matters**:
  - All 3 modules must cooperate inside the wave loop. Understand their contracts before wiring.

  **Acceptance Criteria**:
  - [ ] Wave loop uses completion detector + continuation dispatcher
  - [ ] `continuationCount` resets per wave (asserted by test)
  - [ ] Max continuations enforced at wave level (asserted by test)
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Continuation loop works
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "continuation loop" 2>&1 | tee /tmp/cont-loop.txt
      2. Assert PASS
    Expected Result: Continuation dispatched on idle, completion detected after
    Evidence: .sisyphus/evidence/task-22-cont-loop.txt

  Scenario: Per-wave reset
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "continuation reset" 2>&1 | tee /tmp/cont-reset.txt
      2. Assert PASS
    Expected Result: Second wave starts with count 0
    Evidence: .sisyphus/evidence/task-22-reset.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-22-cont-loop.txt`
  - [ ] `.sisyphus/evidence/task-22-reset.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 23. Wire Between-Wave Push + Install Re-Run

  **What to do**:
  - Edit `src/workers/orchestrate.mts` wave loop → after each successful wave:
    1. Check if `package.json` SHA changed since start of this wave: `git hash-object package.json` before/after
    2. If changed → call `installRunner` (existing module) to re-install dependencies (Metis directive)
    3. Call `betweenWavePush({ repoRoot, branchName, waveNumber, waveDescription, logger })` from Task 18
    4. On push failure → log loudly, throw (outer catch triggers fallback PR flow in Task 25)
  - Ensure heartbeat is still running during these operations (should be — heartbeat runs the whole orchestrate lifetime)

  **Must NOT do**:
  - Do NOT skip install re-run when package.json changed
  - Do NOT swallow push failures
  - Do NOT push if wave failed (only push on successful wave completion)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two operations with real filesystem effects; order matters
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: 24
  - **Blocked By**: 22, 18

  **References**:

  **Pattern References**:
  - `src/workers/lib/between-wave-push.ts` (Task 18)
  - `src/workers/lib/install-runner.ts:22` - Existing install runner; reuse as-is
  - `src/workers/lib/heartbeat.ts:137` - Running heartbeat context

  **WHY Each Reference Matters**:
  - `install-runner.ts`: Existing module. Do NOT replace — just call it from the new wave loop.
  - Metis directive: re-install if package.json changed between waves.

  **Acceptance Criteria**:
  - [ ] Install re-run triggered when package.json SHA changes (tested with mock)
  - [ ] Push called after every successful wave (tested)
  - [ ] Push failure propagates (tested)
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Install re-run on package.json change
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "install re-run" 2>&1 | tee /tmp/ir.txt
      2. Assert PASS
    Expected Result: installRunner mock called when SHA changed
    Evidence: .sisyphus/evidence/task-23-install-rerun.txt

  Scenario: No install re-run when SHA unchanged
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "no install" 2>&1 | tee /tmp/nir.txt
      2. Assert PASS
    Expected Result: installRunner NOT called
    Evidence: .sisyphus/evidence/task-23-no-rerun.txt

  Scenario: Between-wave push called post-wave
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "between-wave push" 2>&1 | tee /tmp/bwp.txt
      2. Assert PASS
    Expected Result: pushBetweenWaves called with correct waveNumber
    Evidence: .sisyphus/evidence/task-23-bwp.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-23-install-rerun.txt`
  - [ ] `.sisyphus/evidence/task-23-no-rerun.txt`
  - [ ] `.sisyphus/evidence/task-23-bwp.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 24. Wire Cost Breaker Check Between Waves

  **What to do**:
  - Edit `src/workers/orchestrate.mts` wave loop → BEFORE starting wave N+1 (where N ≥ 1):
    1. Call `costBreaker.shouldStop(nextWaveNumber)` from Task 14
    2. If `{ stop: true }` → log loudly via `logger.step("⛔", "Cost breaker triggered: {reason}")`, record in wave state as `"blocked_by_cost"`, stop loop, escalate to outer handler with "cost_cap_exceeded" reason
    3. Otherwise → proceed with next wave
  - Never check cost breaker mid-wave (SDK limitation + Metis directive)

  **Must NOT do**:
  - Do NOT check before wave 1 (no baseline)
  - Do NOT check inside a wave (between waves only)
  - Do NOT silently skip the check

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One predicate call + branching — minimal code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: 25
  - **Blocked By**: 23, 14

  **References**:

  **Pattern References**:
  - `src/workers/lib/cost-breaker.ts` (Task 14)
  - `src/workers/config/long-running.ts:costBreakerTokenCap` (Task 1 with rename from Task 14)

  **WHY Each Reference Matters**:
  - Only insertion point is between waves. Understand wave loop structure before adding.

  **Acceptance Criteria**:
  - [ ] Cost breaker called before wave N+1 (tested)
  - [ ] NOT called before wave 1 (tested)
  - [ ] Triggered stop records state correctly (tested)
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: Breaker called before wave 2+
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "cost breaker check" 2>&1 | tee /tmp/cb.txt
      2. Assert PASS
      3. Assert breaker.shouldStop mock called with waveNumber=2
    Expected Result: Check happens at wave boundary
    Evidence: .sisyphus/evidence/task-24-breaker-check.txt

  Scenario: Triggered stop halts loop
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "breaker stops" 2>&1 | tee /tmp/cbs.txt
      2. Assert PASS
    Expected Result: Wave 3 not attempted when breaker trips after wave 2
    Evidence: .sisyphus/evidence/task-24-stop.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-24-breaker-check.txt`
  - [ ] `.sisyphus/evidence/task-24-stop.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 25. Wire Fallback PR on Failure

  **What to do**:
  - Edit `src/workers/orchestrate.mts` → outer catch block:
    ```ts
    try {
      await main();
    } catch (err) {
      logger.step("❌", "Orchestrate failed", { error: err });
      const waveStateSoFar = loadWaveStateFromDb(...); // or from in-memory
      const { created, prUrl } = await createFallbackPr({
        githubClient, repoOwner, repoName, branchName,
        ticket, completedWaves: waveStateSoFar.completedWaves,
        failedWave: waveStateSoFar.currentWave, error: err, logger
      });
      if (created) {
        logger.step("📝", "Fallback draft PR created", { prUrl });
      }
      // Existing escalation flow continues — fallback PR is additive
      throw err; // propagate so Inngest lifecycle sees the failure
    }
    ```
  - Preserve the existing escalation flow — fallback PR is a NEW step that runs BEFORE rethrow, not a replacement
  - Ensure fallback PR runs BEFORE process exits (await the call)

  **Must NOT do**:
  - Do NOT swallow the original error — must rethrow after fallback PR
  - Do NOT replace the existing escalation flow
  - Do NOT create fallback PR on success path (only in catch block)
  - Do NOT block rethrow waiting for PR creation beyond a reasonable timeout (60 sec max — if fallback PR hangs, log and rethrow)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Error handling edge cases; must not double-fail
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: 26
  - **Blocked By**: 24, 13

  **References**:

  **Pattern References**:
  - `src/workers/lib/fallback-pr.ts` (Task 13)
  - `src/workers/lib/completion.ts:170` - Existing escalation flow (preserve)

  **WHY Each Reference Matters**:
  - `completion.ts`: Understand the existing failure path so fallback PR doesn't interfere.

  **Acceptance Criteria**:
  - [ ] Fallback PR called in catch block (tested)
  - [ ] Original error rethrown after fallback PR (tested)
  - [ ] Fallback PR NOT called on success (tested)
  - [ ] Timeout prevents hang (tested with slow mock)

  **QA Scenarios**:

  ```
  Scenario: Fallback PR on failure
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "fallback PR" 2>&1 | tee /tmp/fbpr.txt
      2. Assert PASS
    Expected Result: createFallbackPr mock called with error + wave state
    Evidence: .sisyphus/evidence/task-25-fallback-pr.txt

  Scenario: Rethrow after fallback
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "rethrow after fallback" 2>&1 | tee /tmp/rethrow.txt
      2. Assert PASS
    Expected Result: Outer rejection receives original error
    Evidence: .sisyphus/evidence/task-25-rethrow.txt

  Scenario: No fallback on success
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "no fallback on success" 2>&1 | tee /tmp/nofb.txt
      2. Assert PASS
    Expected Result: createFallbackPr mock NOT called
    Evidence: .sisyphus/evidence/task-25-no-fallback.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-25-fallback-pr.txt`
  - [ ] `.sisyphus/evidence/task-25-rethrow.txt`
  - [ ] `.sisyphus/evidence/task-25-no-fallback.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 26. Wire Plan Sync Module into Wave Loop

  **What to do**:
  - Edit `src/workers/orchestrate.mts` wave loop → after each wave completes (success or fail):
    1. Call `planSync.updateWaveState({ executionId, waveNumber, waveState })` from Task 17
    2. This persists wave progress to Supabase for observability + restart recovery
  - Also ensure `phase1Planning` (Task 20) calls `planSync.savePlanAfterPhase1` — should already be done in Task 20, verify it

  **Must NOT do**:
  - Do NOT skip wave state updates on wave failure (failure is also a state)
  - Do NOT attempt to resume mid-wave on restart — wave boundaries are the recovery points

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small wiring task, one function call per wave
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: 27
  - **Blocked By**: 25, 17

  **References**:

  **Pattern References**:
  - `src/workers/lib/plan-sync.ts:updateWaveState` (Task 17)

  **Acceptance Criteria**:
  - [ ] `updateWaveState` called after every wave (tested)
  - [ ] Called on both success and failure paths (tested)
  - [ ] `pnpm test -- --run` passes

  **QA Scenarios**:

  ```
  Scenario: updateWaveState called post-wave
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/orchestrate.test.ts -t "wave state update" 2>&1 | tee /tmp/uws.txt
      2. Assert PASS
    Expected Result: updateWaveState mock called for each wave
    Evidence: .sisyphus/evidence/task-26-wave-state.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-26-wave-state.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 27. Wire Emoji Progress + Step Timing into orchestrate.mts

  **What to do**:
  - Edit `src/workers/orchestrate.mts` to use new logger helpers (Task 3) throughout:
    - Replace every `logger.info("Starting X")` with `logger.step("🔧", "Starting X")`
    - Replace every `logger.info("X complete")` with `logger.step("✅", "X complete")`
    - Replace every `logger.error(...)` with `logger.step("❌", ...)` + underlying error
    - Add `logger.timing(label, elapsedMs, totalMs)` at major phase boundaries (pre-flight, phase 1, phase 2, post-flight)
    - Add `logger.tool(name, duration, status)` around expensive external calls (git push, install, PostgREST mutate)
    - Add `logger.cost(tokensIn, tokensOut)` after each wave from cost-tracker-v2
  - Do NOT remove structured JSON output — new helpers add visual layer, JSON still emitted

  **Must NOT do**:
  - Do NOT remove any existing log calls (only replace format)
  - Do NOT add emojis to commit messages (emojis are for logs only)
  - Do NOT log dollar amounts

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical find/replace + insertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential within orchestrate.mts — runs after 26)
  - **Parallel Group**: Wave 3 (sequential)
  - **Blocks**: 28
  - **Blocked By**: 26, 3

  **References**:

  **Pattern References**:
  - `src/lib/logger.ts` (Task 3) - New helper signatures
  - `src/workers/orchestrate.mts` - Target file

  **Acceptance Criteria**:
  - [ ] All `logger.info/warn/error` calls in orchestrate.mts use new helpers where appropriate
  - [ ] Step timing present at 4 major boundaries
  - [ ] `pnpm build` + `pnpm test -- --run` pass

  **QA Scenarios**:

  ```
  Scenario: Grep confirms helper usage
    Tool: Bash
    Steps:
      1. Run: grep -c "logger.step" src/workers/orchestrate.mts
      2. Assert count >= 10 (rough sanity check)
      3. Run: grep -c "logger.timing" src/workers/orchestrate.mts
      4. Assert count >= 4
    Expected Result: Helpers used throughout
    Evidence: .sisyphus/evidence/task-27-helpers.txt

  Scenario: Build + test clean
    Tool: Bash
    Steps:
      1. Run: pnpm build && pnpm test -- --run 2>&1 | tee /tmp/bt.txt
      2. Assert exit 0
    Expected Result: Clean
    Evidence: .sisyphus/evidence/task-27-build.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-27-helpers.txt`
  - [ ] `.sisyphus/evidence/task-27-build.txt`

  **Commit**: NO (groups with Wave 3 commit)

- [ ] 28. Refactor task-context.ts to Use Enriched Prompt Builder

  **What to do**:
  - Edit `src/workers/lib/task-context.ts` — replace the inline prompt at lines 140–184 with a call to the new prompt-builder (Task 11)
  - Old behavior: single string template
  - New behavior: calls `buildExecutionPrompt` with ticket + repoRoot + projectMeta + wave + planPath + agentsMdContent + boulderContext
  - Preserve the existing function signature of `buildPromptForTask` (or whatever it's called) — only the internals change
  - Callers of `task-context.ts` continue to work without modification
  - Update existing tests on `task-context.ts` to expect the new call flow (mock prompt-builder, assert it was called with expected args)

  **Must NOT do**:
  - Do NOT break existing callers
  - Do NOT bypass the prompt builder — all prompt construction goes through it
  - Do NOT keep the old inline template as a fallback

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small refactor with clear delta
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — last task in Wave 3)
  - **Blocks**: Wave 4 (all tasks depend on Wave 3 complete)
  - **Blocked By**: 27, 11

  **References**:

  **Pattern References**:
  - `src/workers/lib/task-context.ts:140-184` - Current prompt template
  - `src/workers/lib/prompt-builder.ts:buildExecutionPrompt` (Task 11)

  **Acceptance Criteria**:
  - [ ] Old inline template removed
  - [ ] New builder called instead
  - [ ] Existing callers unchanged
  - [ ] Tests updated + passing
  - [ ] `pnpm build` + `pnpm test -- --run` pass

  **QA Scenarios**:

  ```
  Scenario: Tests pass after refactor
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/task-context.test.ts 2>&1 | tee /tmp/tc.txt
      2. Assert PASS
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-28-task-context.txt

  Scenario: Old template removed
    Tool: Bash
    Steps:
      1. Run: grep -c "You are an AI" src/workers/lib/task-context.ts
      2. Assert count = 0 (or low if header preserved — verify no full template)
    Expected Result: Inline template removed
    Evidence: .sisyphus/evidence/task-28-removed.txt

  Scenario: Full test suite green
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run 2>&1 | tee /tmp/full.txt
      2. Assert 515+ baseline preserved
    Expected Result: No regressions
    Evidence: .sisyphus/evidence/task-28-regression.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-28-task-context.txt`
  - [ ] `.sisyphus/evidence/task-28-removed.txt`
  - [ ] `.sisyphus/evidence/task-28-regression.txt`

  **Commit**: YES (Wave 3 commit)
  - Message: `feat(wave-3): integrate two-phase wave orchestration`
  - Files: `src/workers/orchestrate.mts`, `src/workers/lib/task-context.ts` + any updated test files
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

- [x] 29. entrypoint.sh — Resource Caps Injection

  **What to do**:
  - Edit `src/workers/entrypoint.sh` — near the top (after basic env setup, before starting any heavy processes):
    ```bash
    # Apply resource caps before launching OpenCode and heavy tools
    # Emitted by src/workers/lib/resource-caps.ts via dist/workers/lib/resource-caps.js
    eval "$(node /app/dist/workers/lib/resource-caps.js --shell-export)"
    export TURBO_CONCURRENCY NEXUS_VITEST_MAX_WORKERS OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS NODE_OPTIONS
    echo "TIMING: resource caps applied ($(date +%s%N))"
    ```
  - OR, simpler path if the node invocation is brittle: directly export the hardcoded values and add a comment `# Keep in sync with src/workers/lib/resource-caps.ts`
  - Either approach acceptable. The shell-export helper from Task 7 should be wired in a way that works at container boot (node is available inside container).
  - Add a tiny helper script `scripts/emit-shell-caps.mjs` if the dynamic approach fails — reads from the resource-caps module and prints KEY=VALUE lines

  **Must NOT do**:
  - Do NOT hardcode cap values in entrypoint.sh without a sync comment
  - Do NOT duplicate the values across multiple files without the comment
  - Do NOT break existing env var exports
  - Do NOT skip the `export` keyword (vars must be inherited by child processes)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Shell edit with clear insertion point
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other Wave 4 entrypoint.sh edits — use git merge for simultaneous edits OR coordinate via sequential edits)
  - **Parallel Group**: Wave 4 (with Tasks 30–35)
  - **Blocks**: Wave 5 (integration)
  - **Blocked By**: Wave 3 complete, 7

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh:1-100` - Existing env setup section
  - `src/workers/lib/resource-caps.ts` (Task 7) - Source of truth for cap values

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:463-473` — cap values reference

  **WHY Each Reference Matters**:
  - Nexus values are battle-tested. This task must keep them in sync with Task 7.
  - `entrypoint.sh`: Understand the boot sequence before inserting new code.

  **Acceptance Criteria**:
  - [ ] `entrypoint.sh` exports all 4 resource caps
  - [ ] Sync comment present if hardcoded
  - [ ] Docker image rebuilds successfully: `docker build -t ai-employee-worker:latest .`
  - [ ] In-container verification: `docker run --rm ai-employee-worker:latest env | grep -E 'TURBO|NEXUS_VITEST|OPENCODE_EXPERIMENTAL|NODE_OPTIONS'` shows all 4

  **QA Scenarios**:

  ```
  Scenario: Docker image rebuilds with resource caps
    Tool: Bash
    Steps:
      1. Run: docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/dbuild.txt
      2. Assert exit 0
      3. Assert no "error" in output
    Expected Result: Image built
    Evidence: .sisyphus/evidence/task-29-docker-build.txt

  Scenario: Caps present in running container env
    Tool: Bash
    Steps:
      1. Run: docker run --rm --entrypoint="" ai-employee-worker:latest bash -c 'source /app/src/workers/entrypoint.sh 2>/dev/null || true; env' 2>&1 | tee /tmp/env.txt
      2. Assert env output contains TURBO_CONCURRENCY=2
      3. Assert env output contains NEXUS_VITEST_MAX_WORKERS=2
      4. Assert env output contains OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS=1200000
      5. Assert env output contains NODE_OPTIONS containing max-old-space-size
    Expected Result: All caps visible
    Evidence: .sisyphus/evidence/task-29-env-caps.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-29-docker-build.txt`
  - [ ] `.sisyphus/evidence/task-29-env-caps.txt`

  **Commit**: NO (groups with Wave 4 commit)

- [x] 30. entrypoint.sh — Cache Validation Integration

  **What to do**:
  - Edit `src/workers/entrypoint.sh` — in the repo clone step:
    1. If `/workspace/repo/.git` exists → call cache validator (from Task 15) via node invocation:
       ```bash
       CACHE_RESULT=$(node /app/dist/workers/lib/cache-validator.js "$REPO_DIR" "$REMOTE_URL" 2>&1)
       VALID=$(echo "$CACHE_RESULT" | grep -o '"valid":true' || echo "")
       if [[ -z "$VALID" ]]; then
         echo "Cache invalid: $CACHE_RESULT — falling back to fresh clone"
         rm -rf "$REPO_DIR"
         git clone "$REMOTE_URL" "$REPO_DIR"
       fi
       ```
    2. If `/workspace/repo/.git` doesn't exist → fresh clone (existing behavior)
  - The cache validator module needs a CLI entry point — add one inside `src/workers/lib/cache-validator.ts` under `if (import.meta.url === ...)` block that accepts 2 args and prints JSON
  - Measure elapsed time: wrap with `TIMING_START=$(date +%s%N); ...; TIMING_END=$(date +%s%N); echo "TIMING: cache validation completed in $(( (TIMING_END - TIMING_START) / 1000000 ))ms"`

  **Must NOT do**:
  - Do NOT skip the fresh clone fallback (correctness over speed)
  - Do NOT use cache without validation
  - Do NOT fail the whole boot on validation error — fall back gracefully

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Shell integration with existing Task 15 module
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other Wave 4 tasks — coordinated edits)
  - **Parallel Group**: Wave 4
  - **Blocks**: Wave 5
  - **Blocked By**: Wave 3 complete, 15

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh` - Existing clone step
  - `src/workers/lib/cache-validator.ts` (Task 15) - Validator to invoke
  - `src/workers/lib/install-runner.ts` - Example of a module invoked from shell

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:113-188` — cache validation pattern

  **Acceptance Criteria**:
  - [ ] entrypoint.sh calls cache validator before trusting cache
  - [ ] Fallback to fresh clone on invalid
  - [ ] Step timing logged
  - [ ] CLI entry in cache-validator.ts works from shell

  **QA Scenarios**:

  ```
  Scenario: Cache validator CLI entry works
    Tool: Bash
    Steps:
      1. Run: node /app/dist/workers/lib/cache-validator.js /tmp/nonexistent https://github.com/test/test.git 2>&1 | tee /tmp/cv-cli.txt
         (run inside container: docker run --rm ai-employee-worker:latest bash -c "...")
      2. Assert JSON output contains "valid":false
    Expected Result: Valid JSON reply
    Evidence: .sisyphus/evidence/task-30-cli.txt

  Scenario: Fresh clone fallback triggers on corrupt cache
    Tool: Bash
    Steps:
      1. Run the worker entrypoint in a docker container with a pre-seeded broken /workspace/repo
      2. Assert logs contain "Cache invalid" and "falling back"
    Expected Result: Fallback executed
    Evidence: .sisyphus/evidence/task-30-fallback.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-30-cli.txt`
  - [ ] `.sisyphus/evidence/task-30-fallback.txt`

  **Commit**: NO (groups with Wave 4 commit)

- [x] 31. entrypoint.sh — Disk Space Pre-Check Integration

  **What to do**:
  - Edit `src/workers/entrypoint.sh` — as the FIRST actionable step after env setup:
    ```bash
    DISK_CHECK=$(node /app/dist/workers/lib/disk-check.js /workspace 2147483648 2>&1)
    DISK_OK=$(echo "$DISK_CHECK" | grep -o '"ok":true' || echo "")
    if [[ -z "$DISK_OK" ]]; then
      echo "Insufficient disk: $DISK_CHECK — proceeding with reduced cache strategy"
      export SKIP_CACHE=1  # downstream steps will skip cache
    fi
    ```
  - Add CLI entry in `src/workers/lib/disk-check.ts` (similar to Task 30 — inside `if (import.meta.url === ...)` block)
  - Downstream cache step (Task 30) must honor `SKIP_CACHE=1` env var → force fresh clone

  **Must NOT do**:
  - Do NOT abort on low disk (just skip cache)
  - Do NOT block on slow disk check
  - Do NOT call `du` (slow)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Shell integration, clear boundary
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Wave 5
  - **Blocked By**: Wave 3 complete, 16

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh` - Boot sequence
  - `src/workers/lib/disk-check.ts` (Task 16)

  **External References**:
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:117-123` — disk check pattern

  **Acceptance Criteria**:
  - [ ] Disk check runs as first boot step
  - [ ] CLI entry in disk-check.ts added
  - [ ] `SKIP_CACHE` env var respected by cache step
  - [ ] Timing logged

  **QA Scenarios**:

  ```
  Scenario: Disk check runs successfully
    Tool: Bash
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest bash -c 'node /app/dist/workers/lib/disk-check.js /tmp 1024'
      2. Assert JSON output with "ok":true
    Expected Result: Valid JSON
    Evidence: .sisyphus/evidence/task-31-disk-cli.txt

  Scenario: SKIP_CACHE honored on low disk
    Tool: Bash
    Steps:
      1. Check: grep -n "SKIP_CACHE" src/workers/entrypoint.sh
      2. Assert both the set and the check are present
    Expected Result: Both references present
    Evidence: .sisyphus/evidence/task-31-skip-cache.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-31-disk-cli.txt`
  - [ ] `.sisyphus/evidence/task-31-skip-cache.txt`

  **Commit**: NO (groups with Wave 4 commit)

- [x] 32. entrypoint.sh — Step Timing Instrumentation

  **What to do**:
  - Edit `src/workers/entrypoint.sh` — wrap each major step with timing:

    ```bash
    step_start() {
      STEP_NAME="$1"
      STEP_START_NS=$(date +%s%N)
      echo "▶ STEP: $STEP_NAME"
    }

    step_end() {
      STEP_END_NS=$(date +%s%N)
      ELAPSED_MS=$(( (STEP_END_NS - STEP_START_NS) / 1000000 ))
      TOTAL_MS=$(( (STEP_END_NS - BOOT_START_NS) / 1000000 ))
      echo "TIMING: $STEP_NAME completed in ${ELAPSED_MS}ms (total: ${TOTAL_MS}ms)"
    }

    BOOT_START_NS=$(date +%s%N)
    ```

  - Wrap existing steps: auth, clone, branch, docker, context, heartbeat, opencode auth, handoff
  - Print final: `echo "TIMING: entrypoint.sh completed in $(( ... ))ms"` at exit

  **Must NOT do**:
  - Do NOT overwrite existing step logic — only add instrumentation around it
  - Do NOT use `time` builtin (output format varies)
  - Do NOT skip any step — all must be timed

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical shell insertion
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other Wave 4 tasks)
  - **Parallel Group**: Wave 4
  - **Blocks**: Wave 5
  - **Blocked By**: Wave 3 complete

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh:1-202` - Full boot sequence
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:61-79` — step timing pattern

  **Acceptance Criteria**:
  - [ ] `step_start` / `step_end` functions defined
  - [ ] All 7+ major steps wrapped
  - [ ] Final total timing printed at exit
  - [ ] Format matches: `TIMING: {step} completed in {ms}ms (total: {ms}ms)`

  **QA Scenarios**:

  ```
  Scenario: Docker run shows timing for all steps
    Tool: Bash
    Steps:
      1. Run: docker run --rm ai-employee-worker:latest 2>&1 | tee /tmp/boot.log
      2. Assert at least 7 lines match "^TIMING:"
      3. Assert final "entrypoint.sh completed in" line present
    Expected Result: Timing for all steps + total
    Evidence: .sisyphus/evidence/task-32-timing.txt

  Scenario: Format validation
    Tool: Bash
    Steps:
      1. Run: grep -E "^TIMING: [a-z]+ completed in [0-9]+ms \(total: [0-9]+ms\)" /tmp/boot.log | wc -l
      2. Assert count >= 7
    Expected Result: All lines match format
    Evidence: .sisyphus/evidence/task-32-format.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-32-timing.txt`
  - [ ] `.sisyphus/evidence/task-32-format.txt`

  **Commit**: NO (groups with Wave 4 commit)

- [x] 33. entrypoint.sh — opencode.json Override File

  **What to do**:
  - Create template file `src/workers/config/opencode.json` with:
    ```json
    {
      "permissions": { "*": "allow" },
      "agents": {},
      "tools": {
        "bash": { "timeout_ms": 1200000 }
      }
    }
    ```
  - Edit `Dockerfile` to `COPY src/workers/config/opencode.json /app/opencode.json`
  - Edit `src/workers/entrypoint.sh` — after clone, before OpenCode starts:
    ```bash
    step_start "opencode_config"
    mkdir -p "$REPO_DIR/.opencode"
    cp /app/opencode.json "$REPO_DIR/.opencode/opencode.json"
    echo "Copied opencode.json permission override"
    step_end
    ```
  - Verify inside container that `.opencode/opencode.json` is created in repo root before OpenCode launches

  **Must NOT do**:
  - Do NOT modify repo's own `.opencode/` if it already has one — overwrite only the single file we control
  - Do NOT commit `opencode.json` into the target repo (it's only in the container)
  - Do NOT change the permission string (must be `"*": "allow"` for headless mode)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config file creation + shell copy step
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Wave 5
  - **Blocked By**: Wave 3 complete

  **References**:

  **Pattern References**:
  - `Dockerfile` - Existing COPY statements
  - `src/workers/entrypoint.sh` - Existing file copy steps

  **External References**:
  - OpenCode docs (if available): permission configuration
  - Nexus reference: pre-built `opencode.json` file copied at boot

  **Acceptance Criteria**:
  - [ ] `src/workers/config/opencode.json` exists with correct content
  - [ ] `Dockerfile` COPYs the file
  - [ ] `entrypoint.sh` copies it to repo's `.opencode/` directory
  - [ ] Docker build succeeds
  - [ ] Container verification: file present at expected path

  **QA Scenarios**:

  ```
  Scenario: opencode.json present in container
    Tool: Bash
    Steps:
      1. Run: docker build -t ai-employee-worker:latest . 2>&1 | tee /tmp/db.txt
      2. Assert exit 0
      3. Run: docker run --rm ai-employee-worker:latest bash -c 'cat /app/opencode.json'
      4. Assert output contains "permissions"
      5. Assert output contains '"*": "allow"'
    Expected Result: Config file present
    Evidence: .sisyphus/evidence/task-33-opencode-json.txt

  Scenario: Config valid JSON
    Tool: Bash
    Steps:
      1. Run: node -e "JSON.parse(require('fs').readFileSync('src/workers/config/opencode.json','utf8'))"
      2. Assert exit 0
    Expected Result: Valid JSON
    Evidence: .sisyphus/evidence/task-33-valid-json.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-33-opencode-json.txt`
  - [ ] `.sisyphus/evidence/task-33-valid-json.txt`

  **Commit**: NO (groups with Wave 4 commit)

- [x] 34. entrypoint.sh — boulder.json Context File

  **What to do**:
  - Edit `src/workers/entrypoint.sh` — after clone + branch setup, before OpenCode starts:
    ```bash
    step_start "boulder_context"
    cat > "$REPO_DIR/boulder.json" << EOF
    {
      "task_id": "$TASK_ID",
      "ticket_key": "$TICKET_KEY",
      "branch_name": "$BRANCH_NAME",
      "repo_root": "$REPO_DIR",
      "plan_path": ".sisyphus/plans/${TICKET_KEY}.md",
      "improvements_file": null,
      "mode": "wave_execution"
    }
    EOF
    echo "Wrote boulder.json for agent self-awareness"
    step_end
    ```
  - Ensure `boulder.json` gets added to repo's `.gitignore` on first boot (if not already) so agent doesn't accidentally commit it
  - The prompt builder (Task 11) will reference this file path in the execution prompt so the agent knows to read it

  **Must NOT do**:
  - Do NOT commit `boulder.json` to the repo
  - Do NOT write sensitive credentials into it
  - Do NOT skip the gitignore addition

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file creation + gitignore update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Wave 5
  - **Blocked By**: Wave 3 complete

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh` - Existing file-write steps
  - Nexus reference: `nexus-stack/tools/fly-worker/entrypoint.sh:476-512` — boulder.json pattern

  **Acceptance Criteria**:
  - [ ] boulder.json created at expected path
  - [ ] JSON is valid (parsed without error)
  - [ ] Contains all 7 required fields
  - [ ] `.gitignore` updated to exclude boulder.json

  **QA Scenarios**:

  ```
  Scenario: boulder.json created with correct fields
    Tool: Bash
    Steps:
      1. Simulate entrypoint.sh in container with env vars set
      2. Assert /workspace/repo/boulder.json exists
      3. Run: node -e "const j = JSON.parse(require('fs').readFileSync('.../boulder.json')); ['task_id','ticket_key','branch_name','repo_root','plan_path','mode'].forEach(k => { if (!(k in j)) throw new Error('missing '+k); })"
      4. Assert exit 0
    Expected Result: All fields present
    Evidence: .sisyphus/evidence/task-34-boulder.txt

  Scenario: gitignore contains boulder.json
    Tool: Bash
    Steps:
      1. Run: grep "boulder.json" .gitignore
      2. Assert match
    Expected Result: Match found
    Evidence: .sisyphus/evidence/task-34-gitignore.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-34-boulder.txt`
  - [ ] `.sisyphus/evidence/task-34-gitignore.txt`

  **Commit**: NO (groups with Wave 4 commit)

- [x] 35. entrypoint.sh — Plan File Sync on Restart

  **What to do**:
  - Edit `src/workers/entrypoint.sh` — after repo clone + branch setup, before starting OpenCode:
    ```bash
    step_start "plan_file_sync"
    if [[ -n "$TASK_ID" ]]; then
      SYNC_RESULT=$(node /app/dist/workers/lib/plan-sync.js load "$TASK_ID" "$REPO_DIR/.sisyphus/plans/${TICKET_KEY}.md" 2>&1 || echo '{"loaded":false}')
      LOADED=$(echo "$SYNC_RESULT" | grep -o '"loaded":true' || echo "")
      if [[ -n "$LOADED" ]]; then
        echo "Loaded plan from prior run (source: $(echo "$SYNC_RESULT" | grep -o '"source":"[^"]*"'))"
      else
        echo "No prior plan found (Phase 1 will run)"
      fi
    fi
    step_end
    ```
  - Add CLI entry to `src/workers/lib/plan-sync.ts` — accepts args `load <taskId> <diskPath>` and prints `{ loaded: bool, source: "disk"|"supabase" }`
  - This enables restart recovery: if machine was killed between Phase 1 and Phase 2, restart reads the plan from Supabase back to disk

  **Must NOT do**:
  - Do NOT proceed if TASK_ID is unset (print warning + skip)
  - Do NOT fail the boot on plan sync error (log + continue; Phase 1 will re-run)
  - Do NOT lock the disk file at this stage (chmod 444 happens at end of Phase 1, not at sync)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Shell integration + CLI entry
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Wave 5
  - **Blocked By**: Wave 3 complete, 17

  **References**:

  **Pattern References**:
  - `src/workers/entrypoint.sh` - Step insertion pattern
  - `src/workers/lib/plan-sync.ts:loadPlanOnRestart` (Task 17)

  **Acceptance Criteria**:
  - [ ] entrypoint.sh calls plan-sync CLI
  - [ ] CLI entry in plan-sync.ts added (load subcommand)
  - [ ] Missing TASK_ID handled gracefully
  - [ ] Error path doesn't abort boot

  **QA Scenarios**:

  ```
  Scenario: Plan sync CLI roundtrip
    Tool: Bash
    Steps:
      1. Pre-seed a test task in local Supabase with plan_content="test plan"
      2. Run: node dist/workers/lib/plan-sync.js load <task-id> /tmp/test-plan.md
      3. Assert stdout contains "loaded":true
      4. Assert /tmp/test-plan.md exists with expected content
    Expected Result: Roundtrip works
    Evidence: .sisyphus/evidence/task-35-sync-roundtrip.txt

  Scenario: Missing TASK_ID skip path
    Tool: Bash
    Steps:
      1. Run: docker run --rm -e TASK_ID= ai-employee-worker:latest 2>&1 | grep "plan_file_sync"
      2. Assert log line present
      3. Assert no abort
    Expected Result: Graceful skip
    Evidence: .sisyphus/evidence/task-35-missing-id.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-35-sync-roundtrip.txt`
  - [ ] `.sisyphus/evidence/task-35-missing-id.txt`

  **Commit**: YES (Wave 4 commit)
  - Message: `feat(wave-4): entrypoint.sh infra hardening and context files`
  - Files: `src/workers/entrypoint.sh`, `src/workers/config/opencode.json`, `Dockerfile` (if modified), `src/workers/lib/cache-validator.ts` (CLI entry), `src/workers/lib/disk-check.ts` (CLI entry), `src/workers/lib/plan-sync.ts` (CLI entry)
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run && docker build -t ai-employee-worker:latest .`

- [x] 36. Raise Inngest waitForEvent to 8h30m

  **What to do**:
  - Edit `src/inngest/lifecycle.ts` — find the `step.waitForEvent("engineering/task.completed", { timeout: "4h10m" })` call
  - Change timeout to `"8h30m"` (8 hours + 30 minutes buffer above the 8h orchestrate budget)
  - Add a comment above the call: `// Timeout must exceed orchestrate budget (8h) with safety margin. Coordinated with watchdog machine cleanup (9h) and redispatch (8h). See .sisyphus/plans/long-running-session-overhaul.md`
  - Update any related constants in the same file
  - Update any related tests in `tests/inngest/lifecycle.test.ts` that assert the timeout value

  **Must NOT do**:
  - Do NOT change the timeout to less than 8h30m (Metis requirement: coordination with watchdog)
  - Do NOT change the event schema (`engineering/task.completed`)
  - Do NOT remove the completion event logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single constant change with test update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with other Wave 5 tasks)
  - **Parallel Group**: Wave 5
  - **Blocks**: F1 verification
  - **Blocked By**: Wave 4 complete

  **References**:

  **Pattern References**:
  - `src/inngest/lifecycle.ts:540` - Current lifecycle function
  - `tests/inngest/lifecycle.test.ts` - Test assertions on timeout

  **Acceptance Criteria**:
  - [ ] `waitForEvent` timeout is "8h30m"
  - [ ] Comment explains coordination with watchdog/redispatch
  - [ ] Tests updated to match
  - [ ] `pnpm test -- --run tests/inngest/lifecycle.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Timeout value verified
    Tool: Bash
    Steps:
      1. Run: grep -n "8h30m" src/inngest/lifecycle.ts
      2. Assert match
    Expected Result: Match found
    Evidence: .sisyphus/evidence/task-36-timeout.txt

  Scenario: Tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts 2>&1 | tee /tmp/lc.txt
      2. Assert PASS
    Expected Result: Tests green
    Evidence: .sisyphus/evidence/task-36-lifecycle-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-36-timeout.txt`
  - [ ] `.sisyphus/evidence/task-36-lifecycle-tests.txt`

  **Commit**: NO (groups with Wave 5 commit)

- [x] 37. Raise Watchdog Machine Cleanup to 9 Hours

  **What to do**:
  - Edit `src/inngest/watchdog.ts` — find the machine cleanup threshold (currently 4 hours based on prior analysis)
  - Change to 9 hours (in milliseconds: `9 * 60 * 60 * 1000`)
  - Add a comment explaining: `// Machine cleanup threshold is 9h. MUST be greater than total orchestrate budget (8h). Changing this can silently kill long-running tasks. See Metis review in .sisyphus/plans/long-running-session-overhaul.md`
  - Update any tests in `tests/inngest/watchdog.test.ts` that assert the 4-hour value
  - This is a **Metis hard blocker** — the watchdog would otherwise kill our long-running tasks

  **Must NOT do**:
  - Do NOT set less than 9 hours (safety margin over 8h orchestrate)
  - Do NOT remove the cleanup logic entirely (still need watchdog for actually-dead machines)
  - Do NOT change unrelated watchdog behavior in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single constant change + test update. Critical but small.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: F1 verification
  - **Blocked By**: Wave 4 complete

  **References**:

  **Pattern References**:
  - `src/inngest/watchdog.ts:204` - Current watchdog function
  - `tests/inngest/watchdog.test.ts` - Tests

  **WHY This Matters**:
  - Metis flagged this as a HARD BLOCKER. Without this change, the watchdog will murder 4h+ tasks regardless of any other protection.

  **Acceptance Criteria**:
  - [ ] Machine cleanup threshold = 9 hours
  - [ ] Explanatory comment present
  - [ ] Tests updated + passing

  **QA Scenarios**:

  ```
  Scenario: Threshold confirmed
    Tool: Bash
    Steps:
      1. Run: grep -n "9 \* 60 \* 60" src/inngest/watchdog.ts
      2. Assert match
    Expected Result: Match
    Evidence: .sisyphus/evidence/task-37-threshold.txt

  Scenario: Watchdog tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/watchdog.test.ts 2>&1 | tee /tmp/wd.txt
      2. Assert PASS
    Expected Result: Tests green
    Evidence: .sisyphus/evidence/task-37-watchdog-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-37-threshold.txt`
  - [ ] `.sisyphus/evidence/task-37-watchdog-tests.txt`

  **Commit**: NO (groups with Wave 5 commit)

- [x] 38. Update Watchdog Stale Heartbeat Threshold

  **What to do**:
  - Edit `src/inngest/watchdog.ts` — find the stale heartbeat detection threshold (currently 10 minutes)
  - Change to 20 minutes (in ms: `20 * 60 * 1000`)
  - Rationale: Wave transitions can legitimately pause observable activity for up to 15 minutes (install re-run + session creation + prompt dispatch). 20-minute threshold prevents false positives while still catching real hangs.
  - **HARD CEILING per Must NOT section: Never exceed 20 minutes** (more lenient would hide real hangs)
  - Add comment: `// 20min threshold: accommodates wave transition pauses (install re-run, session creation). Do NOT exceed 20min — real hangs need detection.`
  - Update related tests

  **Must NOT do**:
  - Do NOT exceed 20 minutes
  - Do NOT remove the stale heartbeat check
  - Do NOT change other watchdog behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single constant change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: F1 verification
  - **Blocked By**: Wave 4 complete

  **References**:

  **Pattern References**:
  - `src/inngest/watchdog.ts` - Current stale detection logic
  - `src/workers/lib/heartbeat.ts:137` - Heartbeat emitter side

  **Acceptance Criteria**:
  - [ ] Threshold = 20 minutes exactly
  - [ ] Comment present
  - [ ] Tests updated

  **QA Scenarios**:

  ```
  Scenario: Threshold confirmed
    Tool: Bash
    Steps:
      1. Run: grep -n "20 \* 60 \* 1000\|20\*60\*1000" src/inngest/watchdog.ts
      2. Assert match
    Expected Result: Match
    Evidence: .sisyphus/evidence/task-38-threshold.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-38-threshold.txt`

  **Commit**: NO (groups with Wave 5 commit)

- [x] 39. Update Redispatch for 8h + Wave-Aware Behavior

  **What to do**:
  - Edit `src/inngest/redispatch.ts`:
    1. Raise total task budget from 6h to 8h (matches new orchestrate budget)
    2. When re-dispatching a failed task, pass `RESUME_FROM_WAVE` env var so worker knows to skip already-completed waves (read from `executions.wave_number`)
    3. Limit redispatches to tasks that have `wave_number >= 1` (Phase 1 completed) — if Phase 1 never ran, full restart
  - Redispatch should still honor the 3-attempt limit
  - Add test cases: resume from wave 2, resume from wave 3, no resume when wave_number is null

  **Must NOT do**:
  - Do NOT re-run Phase 1 if plan already exists (Supabase `plan_content` is populated)
  - Do NOT exceed 3 redispatch attempts
  - Do NOT change the redispatch trigger schema

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Wave-aware resume logic has subtle edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: F1 verification
  - **Blocked By**: Wave 4 complete, Task 2 (schema)

  **References**:

  **Pattern References**:
  - `src/inngest/redispatch.ts:89` - Current redispatch logic
  - `prisma/schema.prisma` new columns from Task 2
  - `src/workers/lib/plan-sync.ts` (Task 17) - Uses same schema

  **Acceptance Criteria**:
  - [ ] Budget raised to 8h
  - [ ] `RESUME_FROM_WAVE` env var added
  - [ ] Resume-from-wave tests present + passing
  - [ ] 3-attempt limit preserved

  **QA Scenarios**:

  ```
  Scenario: Redispatch respects resume
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/redispatch.test.ts 2>&1 | tee /tmp/rd.txt
      2. Assert PASS
      3. Assert tests for "resume from wave" present
    Expected Result: Tests green
    Evidence: .sisyphus/evidence/task-39-redispatch-tests.txt

  Scenario: 3-attempt limit preserved
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/redispatch.test.ts -t "3 attempts" 2>&1 | tee /tmp/3att.txt
      2. Assert PASS
    Expected Result: Limit enforced
    Evidence: .sisyphus/evidence/task-39-limit.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-39-redispatch-tests.txt`
  - [ ] `.sisyphus/evidence/task-39-limit.txt`

  **Commit**: NO (groups with Wave 5 commit)

- [x] 40. Enhanced PR Description Template

  **What to do**:
  - Edit `src/lib/github-client.ts` (or wherever `createPullRequest` body is assembled for the success path — may also be in `src/workers/lib/pr-manager.ts`)
  - Replace minimal PR body with a template function `buildSuccessPrBody(opts: { ticket, planContent, waveState, diffStats, commitLog }): string`
  - Template includes these mandatory sections:

    ```markdown
    ## Summary

    {one-paragraph summary from ticket + agent work}

    ## Ticket

    {ticket key} — {ticket summary}

    ## Changes

    {diffStats output from `git diff --stat`}

    ## Waves Completed

    - Wave 1: {description} ✅
    - Wave 2: {description} ✅
      ...

    ## Testing

    - TypeScript: `pnpm build` ✅
    - Lint: `pnpm lint` ✅
    - Unit tests: `pnpm test -- --run` ✅ ({N} tests passed)

    ## How to Verify

    1. Check out this branch: `git checkout {branch-name}`
    2. Install: `pnpm install`
    3. Run tests: `pnpm test -- --run`
    4. Manual smoke: {suggested manual checks based on ticket}

    ## Commit Log

    {git log --oneline origin/main..HEAD}
    ```

  - Use this function when creating successful PRs (not fallback — fallback uses Task 13)
  - Add unit test in `tests/lib/github-client.test.ts` (or create if missing) asserting all sections present

  **Must NOT do**:
  - Do NOT reference AI tools or agent names in the PR body
  - Do NOT include dollar cost amounts
  - Do NOT skip the "How to Verify" section
  - Do NOT use the fallback PR template for success path

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Template function with clear sections
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: F1 verification
  - **Blocked By**: Wave 4 complete

  **References**:

  **Pattern References**:
  - `src/lib/github-client.ts` - Existing GitHub client + PR creation
  - `src/workers/lib/pr-manager.ts:97` - Current PR body logic
  - `src/workers/lib/fallback-pr.ts` (Task 13) - Sibling template (distinct section set)

  **External References**:
  - GitHub PR markdown rendering — GFM reference
  - Nexus reference: `nexus-stack/.opencode/command/nexus-worktree-plan.md:200-250` — mandatory section structure

  **Acceptance Criteria**:
  - [ ] `buildSuccessPrBody` function exists
  - [ ] All 6 sections present (Summary, Ticket, Changes, Waves Completed, Testing, How to Verify, Commit Log)
  - [ ] Unit test passes
  - [ ] No references to AI tools in output (grep check)

  **QA Scenarios**:

  ```
  Scenario: Template includes all sections
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/lib/github-client.test.ts 2>&1 | tee /tmp/gh.txt
      2. Assert PASS
      3. Assert test asserts all 6 section headers
    Expected Result: Tests pass
    Evidence: .sisyphus/evidence/task-40-pr-body.txt

  Scenario: No AI tool references
    Tool: Bash
    Steps:
      1. Run: grep -iE "claude|gpt|agent|ai" src/lib/github-client.ts | grep -v "^\s*//"
      2. Assert no matches in generated body string literals (comments OK)
    Expected Result: Clean
    Evidence: .sisyphus/evidence/task-40-no-ai.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-40-pr-body.txt`
  - [ ] `.sisyphus/evidence/task-40-no-ai.txt`

  **Commit**: NO (groups with Wave 5 commit)

- [x] 41. CI Status Classification Helper

  **What to do**:
  - Create `src/workers/lib/ci-classifier.ts`
  - Export `function classifyCiFailure(checkRun: { name: string, conclusion: string, output?: { title?: string, summary?: string } }): "substantive" | "infra" | "unknown"`
  - Classification rules:
    - **infra**: check name/output matches any of: `/setup/i`, `/install/i`, `/cache/i`, `/docker/i`, `/deploy/i`, `/publish/i`, `/registry/i`, `/network/i`, `/timeout/i` when NOT in a test step
    - **substantive**: check name matches any of: `/lint/i`, `/test/i`, `/build/i`, `/typecheck/i`, `/type-check/i`, `/e2e/i`
    - **unknown**: anything else
  - Export `function summarizeCheckRuns(checkRuns: Array<...>): { substantive: number, infra: number, unknown: number, failed: boolean }` — counts categories and reports "failed" if any substantive check failed
  - Export CLI entry for use from shell if needed (optional)
  - Write `src/workers/lib/ci-classifier.test.ts` with cases for each category + edge cases

  **Must NOT do**:
  - Do NOT mis-classify test failures as infra
  - Do NOT silently ignore unknown checks — count them
  - Do NOT rely on conclusion alone (names matter)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure classifier with test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: F1 verification
  - **Blocked By**: Wave 4 complete

  **References**:

  **Pattern References**:
  - `src/workers/lib/plan-parser.ts` (Task 5) - Small pure module pattern

  **External References**:
  - Nexus reference: `nexus-stack/.opencode/command/nexus-worktree-merge.md:67-95` — classification rules

  **Acceptance Criteria**:
  - [ ] Module + test file exist
  - [ ] All tests pass (≥5 cases covering each category)
  - [ ] substantive vs infra distinguished correctly
  - [ ] Edge cases handled (empty output, missing conclusion)

  **QA Scenarios**:

  ```
  Scenario: Classification tests pass
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/ci-classifier.test.ts 2>&1 | tee /tmp/ci.txt
      2. Assert PASS
      3. Assert ≥5 tests
    Expected Result: Tests green
    Evidence: .sisyphus/evidence/task-41-ci-classifier.txt

  Scenario: Test failure classified substantive
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/ci-classifier.test.ts -t "test failure" 2>&1
      2. Assert PASS, returns "substantive"
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-41-substantive.txt

  Scenario: Setup failure classified infra
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run src/workers/lib/ci-classifier.test.ts -t "setup failure" 2>&1
      2. Assert PASS, returns "infra"
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-41-infra.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-41-ci-classifier.txt`
  - [ ] `.sisyphus/evidence/task-41-substantive.txt`
  - [ ] `.sisyphus/evidence/task-41-infra.txt`

  **Commit**: NO (groups with Wave 5 commit)

- [x] 42. Escalation Payload Enrichment

  **What to do**:
  - Edit `src/inngest/lifecycle.ts` (and `src/workers/lib/completion.ts` if escalation happens there) — when emitting the failure/escalation event:
    - Add `wave_number: executions.wave_number` (current wave when failed)
    - Add `wave_error: string` (the error that caused wave failure)
    - Add `completed_waves: number[]` (list of wave numbers that completed successfully before the failure)
    - Add `total_waves: number` (from plan meta)
  - Update the escalation Slack/notification handler (if exists) to display these new fields
  - **MUST NOT** change the existing `engineering/task.completed` event schema — this is a **separate** escalation/failure event
  - If no separate escalation event exists, create one: `engineering/task.escalated` with this payload
  - Update tests to assert the new fields are present

  **Must NOT do**:
  - Do NOT modify `engineering/task.completed` schema (Metis directive)
  - Do NOT omit any of the 4 new fields
  - Do NOT include dollar amounts
  - Do NOT leak sensitive data (credentials, tokens) in wave_error

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Payload enrichment with tests
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: F1 verification
  - **Blocked By**: Wave 4 complete, Task 2 (schema)

  **References**:

  **Pattern References**:
  - `src/inngest/lifecycle.ts:540` - Event emission points
  - `src/workers/lib/completion.ts:170` - Completion flow (preserve Supabase-first)
  - `src/lib/slack-client.ts` - Escalation notifications (if exists)

  **Acceptance Criteria**:
  - [ ] All 4 new fields present in escalation payload
  - [ ] `engineering/task.completed` schema UNCHANGED (verified by test)
  - [ ] Tests assert new fields
  - [ ] No credential leakage in error messages

  **QA Scenarios**:

  ```
  Scenario: Escalation payload includes wave fields
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts -t "escalation" 2>&1 | tee /tmp/esc.txt
      2. Assert PASS
      3. Assert test verifies wave_number, wave_error, completed_waves, total_waves present
    Expected Result: Tests green
    Evidence: .sisyphus/evidence/task-42-escalation.txt

  Scenario: task.completed schema unchanged
    Tool: Bash
    Steps:
      1. Run: pnpm test -- --run tests/inngest/lifecycle.test.ts -t "completed schema" 2>&1 | tee /tmp/sch.txt
      2. Assert PASS
      3. Assert schema fields match original
    Expected Result: No schema changes to task.completed
    Evidence: .sisyphus/evidence/task-42-schema.txt

  Scenario: No credentials in error payload
    Tool: Bash
    Steps:
      1. Run: grep -E "GITHUB_TOKEN|OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE_KEY" src/inngest/lifecycle.ts | grep -v "process.env"
      2. Assert no raw interpolation into payload strings
    Expected Result: Clean
    Evidence: .sisyphus/evidence/task-42-no-creds.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-42-escalation.txt`
  - [ ] `.sisyphus/evidence/task-42-schema.txt`
  - [ ] `.sisyphus/evidence/task-42-no-creds.txt`

  **Commit**: YES (Wave 5 commit)
  - Message: `feat(wave-5): inngest thresholds, redispatch, and PR enhancements`
  - Files: `src/inngest/lifecycle.ts`, `src/inngest/watchdog.ts`, `src/inngest/redispatch.ts`, `src/lib/github-client.ts`, `src/workers/lib/ci-classifier.ts`, `src/workers/lib/pr-manager.ts` (if modified), `src/workers/lib/completion.ts` (if modified) + all test files
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL after Waves 1–5 are all green. ALL must APPROVE.
> Present consolidated results to user and get explicit "okay" before declaring the overhaul complete.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1–F4 as checked before getting user's okay.** Rejection or user feedback → fix → re-run → present again → wait for okay.
>
> **F3 is the hard-cutover compensation.** Because the user chose "HARD CUTOVER, no feature flag" (overriding Metis's flag recommendation), F3 MUST execute a ≥4-hour simulated run end-to-end against a mock Supabase/Inngest harness before this plan is declared Done. No simulation = no approval.

- [ ] F1. **Plan Compliance Audit** — `oracle`

  **What to do**:
  - Read the entire plan end-to-end (`.sisyphus/plans/long-running-session-overhaul.md`).
  - For every "Must Have" in Work Objectives: verify implementation exists by reading files, running commands, or inspecting code. Cite file:line for each.
  - For every "Must NOT Have" (Guardrails): search the codebase for forbidden patterns and reject with file:line if found. Patterns include:
    - Any reference to `subagent_type`, `Task(` spawning other OpenCode agents inside `src/workers/`, or `specialist` directories
    - Any mutation of the Jira webhook contract (`src/gateway/webhooks/jira.ts` body shape)
    - Any change to the `engineering/task.completed` event schema (`src/inngest/lifecycle.ts` — look for send() call shape)
    - Any removal of Supabase-first completion ordering (completion.ts must write Supabase BEFORE emitting Inngest)
    - Any `cost_usd_cents` in logs (only token counts allowed)
    - Any `@file` syntax parsing in agents-md-reader.ts (must be read-as-is + truncate only)
    - Any mid-wave cost-breaker checks (must be between-waves only)
    - Any `git push --force` without `--with-lease`
  - For every task (1–42): verify the file(s) listed in `Commit.Files` exist in git and the task's described behavior is present.
  - Check that `.sisyphus/evidence/` contains files referenced in QA Scenarios.
  - Verify Metis hard directives (watchdog 9h, heartbeat during transitions, plan lock after Phase 1, install re-run on package.json SHA change, etc.) are all implemented.
  - Compare deliverables against plan — nothing missing, nothing unaccounted for.

  **Must NOT do**:
  - Do not re-plan or suggest enhancements — this is an audit, not a consultation
  - Do not approve with caveats — verdict is strictly APPROVE or REJECT
  - Do not skip any Must Have / Must NOT Have check, even ones that "seem obviously done"
  - Do not rely on task descriptions — verify actual files and runtime behavior

  **Recommended Agent Profile**:
  - **Category**: `oracle` (architectural/strategic review with deep reasoning)
    - Reason: Plan compliance is strategic verification — needs an agent that reads carefully, reasons about guardrails holistically, and never rubber-stamps
  - **Skills**: `[]`
    - No skills needed — oracle has native deep-reading capability
  - **Skills Evaluated but Omitted**:
    - `v-mermaid`: Not a diagram review
    - `git-master`: Audit reads files, not git history operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final Wave (with F2, F3, F4)
  - **Blocks**: User approval step
  - **Blocked By**: All of Waves 1–5 complete and green

  **References**:

  **Pattern References** (existing code to verify against plan):
  - `src/workers/orchestrate.mts` - Full two-phase orchestration as described in Task 19
  - `src/workers/entrypoint.sh` - Resource caps + cache validation as described in Tasks 29–35
  - `src/inngest/lifecycle.ts` - 8h30m waitForEvent + enriched escalation payloads (Tasks 36, 42)
  - `src/inngest/watchdog.ts` - 9h machine cleanup + 20min stale heartbeat (Tasks 37, 38)
  - `src/inngest/redispatch.ts` - 8h redispatch window + wave-aware resume (Task 39)
  - `prisma/schema.prisma` - `plan_content`, `plan_generated_at`, `cost_usd_cents`, `wave_number`, `wave_state` columns (Task 2)
  - `src/workers/lib/` - All 11 new modules from Wave 2

  **API/Type References** (contracts to verify unchanged):
  - `src/gateway/webhooks/jira.ts` - Jira webhook body shape MUST be unchanged
  - `src/inngest/lifecycle.ts:send("engineering/task.completed")` - Event schema MUST be unchanged
  - `src/workers/lib/completion.ts` - Supabase write MUST precede Inngest emit

  **External References**:
  - `.sisyphus/plans/long-running-session-overhaul.md` - This plan file (source of truth)
  - `.sisyphus/evidence/` - Evidence directory from Waves 1–5

  **WHY Each Reference Matters**:
  - Orchestrate.mts is the integration point — if Phase 1 and Phase 2 aren't correctly wired, the whole overhaul fails silently on first real run
  - Schema columns must exist AND be used (not just added) — verify callers read/write them
  - Webhook and event contracts are external interfaces — any drift breaks Jira/Inngest integration silently
  - Completion ordering is subtle but critical — Supabase must be the source of truth to prevent duplicate PRs
  - Metis hard directives are non-negotiable blockers — any deviation is auto-REJECT

  **Acceptance Criteria**:

  > **AGENT-EXECUTABLE VERIFICATION ONLY**
  - [ ] Oracle produces a structured report saved to `.sisyphus/evidence/final-f1-plan-compliance-audit.md`
  - [ ] Report contains: `Must Have [N/N]` where N/N = all Must Have items verified present
  - [ ] Report contains: `Must NOT Have [N/N]` where N/N = all guardrails verified absent
  - [ ] Report contains: `Tasks [42/42]` with per-task verdict (PASS/FAIL + reason if FAIL)
  - [ ] Report contains: `Metis Directives [N/N]` with each directive mapped to its implementation
  - [ ] Report ends with final line: `VERDICT: APPROVE` or `VERDICT: REJECT`
  - [ ] If REJECT: every failure includes file:line and specific remediation
  - [ ] Zero tasks marked PASS without citation

  **QA Scenarios** (agent-executed verification):

  ```
  Scenario: F1 Oracle produces APPROVE verdict
    Tool: Bash
    Preconditions: Waves 1–5 committed, oracle agent dispatched with plan path
    Steps:
      1. Run: `test -f .sisyphus/evidence/final-f1-plan-compliance-audit.md && echo EXISTS || echo MISSING`
      2. Assert output == "EXISTS"
      3. Run: `grep -E "^VERDICT: (APPROVE|REJECT)$" .sisyphus/evidence/final-f1-plan-compliance-audit.md | tail -1`
      4. Assert output contains "VERDICT: APPROVE"
      5. Run: `grep -cE "^- \[x\]" .sisyphus/evidence/final-f1-plan-compliance-audit.md`
      6. Assert count >= 42 (at least one check per task)
    Expected Result: Audit file exists, ends with APPROVE, and covers all 42 tasks
    Failure Indicators: File missing, verdict is REJECT, or fewer than 42 task-level checks
    Evidence: .sisyphus/evidence/final-f1-plan-compliance-audit.md

  Scenario: F1 Oracle catches a forbidden pattern (sanity check)
    Tool: Bash
    Preconditions: Oracle audit complete
    Steps:
      1. Run: `rg -n "cost_usd_cents" src/workers/ src/inngest/ --type ts --type mts`
      2. Assert output is empty (no dollar amounts in logs — only token counts allowed)
      3. Run: `rg -n "git push --force[^-]" src/workers/ --type sh --type ts`
      4. Assert output is empty (all pushes must use --force-with-lease)
    Expected Result: No forbidden patterns found in codebase
    Failure Indicators: Any match for dollar amounts in logs or bare --force pushes
    Evidence: .sisyphus/evidence/final-f1-forbidden-pattern-scan.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/final-f1-plan-compliance-audit.md`
  - [ ] `.sisyphus/evidence/final-f1-forbidden-pattern-scan.txt`

  **Commit**: NO (review task, produces evidence only)

- [ ] F2. **Code Quality Review** — `unspecified-high`

  **What to do**:
  - Run `pnpm lint` — must pass with zero warnings or errors
  - Run `pnpm build` (tsc) — must compile with zero errors
  - Run `pnpm test -- --run` — all tests must pass (accept only the two pre-existing failures: `container-boot.test.ts`, `inngest-serve.test.ts`)
  - Review EVERY file changed in Waves 1–5 for code quality anti-patterns:
    - `as any` / `@ts-ignore` / `@ts-expect-error` (reject unless justified with comment)
    - Empty catch blocks (`catch {}` or `catch (e) {}` with no handling)
    - `console.log` / `console.error` in production code (must use pino logger)
    - Commented-out code blocks (must be removed, not commented)
    - Unused imports (must be deleted)
    - Dead code (unreachable branches, unused functions)
    - Magic numbers without named constants (especially timeouts, thresholds)
    - Nested ternaries >2 levels deep
    - Functions >100 lines (must be split)
    - Files >500 lines (must be split if new; existing files get a warning)
  - Detect AI slop patterns (explicit):
    - Excessive comments (commentary on obvious operations)
    - Over-abstraction (premature extraction of 1-use utilities)
    - Generic names: `data`, `result`, `item`, `temp`, `value`, `thing`, `obj`
    - Bloated JSDoc on trivial functions
    - Redundant type annotations where inference suffices
    - "Helper" files with 1 function
    - Test files with >3 levels of nested `describe`
  - For every new module in `src/workers/lib/`: verify corresponding `.test.ts` exists with ≥1 happy path + ≥1 error path test
  - Verify logger usage is consistent: structured fields, no string concatenation, no dollar amounts

  **Must NOT do**:
  - Do not refactor or fix issues — this is a REVIEW, not a rewrite
  - Do not approve with "minor warnings" — anti-patterns are reject-worthy
  - Do not skip files with "obviously fine" heuristic — audit every changed file
  - Do not run full E2E here (that's F3's job) — only static checks + unit tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (thorough code review requiring attention to detail)
    - Reason: Code quality review requires reading large volumes of TypeScript with discipline — needs high-effort general agent, not a specialist
  - **Skills**: `[]`
    - No skills needed — standard TypeScript review
  - **Skills Evaluated but Omitted**:
    - `v-mermaid`: Not a diagram review
    - `playwright`: No UI in this overhaul

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final Wave (with F1, F3, F4)
  - **Blocks**: User approval step
  - **Blocked By**: All of Waves 1–5 complete and green

  **References**:

  **Pattern References** (existing code as quality baseline):
  - `src/workers/orchestrate.mts` (before Wave 3 changes) - Existing module structure and error handling pattern
  - `src/lib/logger.ts` - pino usage pattern (baseline for new callers in Waves 1–5)
  - `src/lib/retry.ts` - Existing retry pattern (new code should not reinvent this)
  - `src/workers/lib/token-tracker.ts` - Existing tracker pattern (Task 6 cost-tracker-v2 should follow similar shape)

  **API/Type References**:
  - `tsconfig.json` - Type strictness rules enforced during build
  - `.eslintrc.*` - Lint rules (look up ESLint config in repo)
  - `vitest.config.ts` - Test runner config

  **External References**:
  - Plan file: `.sisyphus/plans/long-running-session-overhaul.md` for reference list of all changed files

  **WHY Each Reference Matters**:
  - Logger pattern is repo convention — new modules that use console.\* instead of pino violate it
  - token-tracker.ts is a good shape match for cost-tracker-v2 — consistency matters
  - tsconfig strictness is the source of truth for what "type-safe" means here
  - Plan file lists every file touched — reviewer needs that complete list to audit nothing slipped through

  **Acceptance Criteria**:
  - [ ] Build passes: `pnpm build` exits 0 with no errors (warnings allowed only if pre-existing)
  - [ ] Lint passes: `pnpm lint` exits 0 with no warnings or errors
  - [ ] Tests pass: `pnpm test -- --run` passes 515+ tests (the two pre-existing failures excluded by name)
  - [ ] Every file in `src/workers/lib/` added in Waves 1–2 has matching `.test.ts` with happy + error scenarios
  - [ ] Review report saved to `.sisyphus/evidence/final-f2-code-quality-review.md`
  - [ ] Report contains: `Build [PASS] | Lint [PASS] | Tests [N pass / N fail] | Anti-patterns [N found] | VERDICT`
  - [ ] Report ends with: `VERDICT: APPROVE` or `VERDICT: REJECT`
  - [ ] If REJECT: every issue includes file:line + category + remediation
  - [ ] Zero `as any` / `@ts-ignore` / empty catch / `console.log` in new Wave 1–5 files

  **QA Scenarios**:

  ```
  Scenario: F2 build/lint/test all green
    Tool: Bash
    Preconditions: All Waves 1–5 merged
    Steps:
      1. Run: `cd /Users/victordozal/repos/dozal-devs/ai-employee && pnpm lint 2>&1 | tee .sisyphus/evidence/final-f2-lint.log`
      2. Assert exit code == 0
      3. Run: `pnpm build 2>&1 | tee .sisyphus/evidence/final-f2-build.log`
      4. Assert exit code == 0
      5. Run: `pnpm test -- --run 2>&1 | tee .sisyphus/evidence/final-f2-test.log`
      6. Parse for `Tests  N passed` — assert N >= 515
      7. Assert only `container-boot.test.ts` and `inngest-serve.test.ts` appear in failure list
    Expected Result: Lint clean, build clean, 515+ tests green, only pre-existing failures
    Failure Indicators: Any lint/build error, fewer than 515 passing tests, any new test failures
    Evidence: .sisyphus/evidence/final-f2-{lint,build,test}.log

  Scenario: F2 anti-pattern scan returns clean
    Tool: Bash
    Preconditions: Waves 1–5 code merged
    Steps:
      1. Run: `rg -n "as any" src/workers/lib/ src/workers/config/ src/workers/orchestrate.mts src/workers/entrypoint.sh --type ts --type mts -g '!*.test.ts' | tee .sisyphus/evidence/final-f2-as-any.txt`
      2. Assert empty (or every match has justification comment on same or prior line)
      3. Run: `rg -n "@ts-ignore|@ts-expect-error" src/workers/lib/ src/workers/config/ --type ts`
      4. Assert empty
      5. Run: `rg -n "console\\.(log|error|warn)" src/workers/lib/ src/workers/config/ --type ts -g '!*.test.ts'`
      6. Assert empty (must use pino logger)
      7. Run: `rg -n "catch\\s*\\(?[^)]*\\)?\\s*\\{\\s*\\}" src/workers/lib/ --type ts`
      8. Assert empty (no empty catch blocks)
    Expected Result: No anti-patterns detected in new Wave 1–5 code
    Failure Indicators: Any match without justification
    Evidence: .sisyphus/evidence/final-f2-{as-any,ts-ignore,console,empty-catch}.txt

  Scenario: F2 every new lib module has tests
    Tool: Bash
    Preconditions: Wave 1 + Wave 2 merged
    Steps:
      1. Run: `for f in src/workers/lib/*.ts; do base=$(basename "$f" .ts); [ -f "src/workers/lib/${base}.test.ts" ] || echo "MISSING: $f"; done | tee .sisyphus/evidence/final-f2-missing-tests.txt`
      2. Assert file is empty (no missing tests)
    Expected Result: Every non-test .ts file has a .test.ts sibling
    Failure Indicators: Any "MISSING: …" line
    Evidence: .sisyphus/evidence/final-f2-missing-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/final-f2-code-quality-review.md`
  - [ ] `.sisyphus/evidence/final-f2-{lint,build,test}.log`
  - [ ] `.sisyphus/evidence/final-f2-{as-any,ts-ignore,console,empty-catch,missing-tests}.{txt,log}`

  **Commit**: NO (review task, produces evidence only)

- [ ] F3. **Real Manual QA — MANDATORY 4+ Hour Long-Running Simulation** — `unspecified-high`

  > **This is the hard-cutover compensation.** User chose "HARD CUTOVER, no feature flag" (overriding Metis).
  > F3 REPLACES the safety net of a rollback flag with an empirical ≥4-hour simulated proof.
  > **No simulation = no approval. No exceptions.**

  **What to do**:
  1. **Build a mock harness** under `scripts/long-running-sim/` that wires:
     - A fake Supabase PostgREST server (Fastify mock) exposing `/rest/v1/tasks`, `/rest/v1/task_executions`, `/rest/v1/heartbeats` with in-memory state
     - A fake Inngest endpoint accepting `send()` calls and returning mock event IDs
     - A scripted "slow LLM" that returns pre-baked wave-plan + wave-execution responses with **artificial delays** (configurable per-wave: e.g., wave 1 = 45 min, wave 2 = 60 min, wave 3 = 55 min, wave 4 = 50 min, wave 5 = 40 min → total ≥ 4h)
     - Mock `opencode` CLI binary (bash script) that sleeps the configured delay, emits scripted tool calls, writes a scripted plan file or scripted file edits, then exits 0
     - Mock `git`/`gh` shims that accept all commands and exit 0 (no real remote I/O)
  2. **Run the orchestrator end-to-end** against this harness in a real container (`docker run -e MOCK_MODE=1 ai-employee-worker:latest`) — **NO mocking inside the orchestrator itself**. Only the surrounding world is mocked.
  3. **Duration requirement**: Total wall-clock ≥ **4 hours 15 minutes** (4h hard minimum + buffer). Use `time` command + save `start_ts` / `end_ts`.
  4. **During the run, verify in a separate monitoring terminal**:
     - Heartbeat row in mock Supabase updates at least every 60 seconds (no gaps > 90s)
     - Heartbeat continues updating during between-wave transitions (Metis directive)
     - Wave state transitions: `planning → wave-1 → wave-2 → wave-3 → wave-4 → wave-5 → complete`
     - `plan_content` column is populated in mock Supabase after Phase 1
     - `cost_breaker` checks occur ONLY between waves (grep log for breaker events — timestamps must align with wave boundaries, not mid-wave)
     - Plan file is chmod 444 after Phase 1 (run `stat -f "%Lp" /workspace/.sisyphus/plans/*.md` inside container)
     - Between-wave `git push --force-with-lease` commands appear in mock `git` log exactly 4 times (after waves 1,2,3,4 — wave 5 is final and goes to PR)
     - `wave_number` column updates monotonically 0 → 5
     - Install re-runs only when `package.json` SHA changes (test by mutating package.json between mock waves 2 and 3)
  5. **Inject failures at specific points and verify recovery**:
     - **Injection A** (wave 2, minute 30): Simulate OpenCode transient crash → verify fix-loop retries and continues
     - **Injection B** (wave 3, minute 15): Simulate disk low (write 1.5 GB dummy file) → verify disk-check aborts cleanly and writes Escalated state
     - **Injection C** (wave 4, minute 20): Simulate stale heartbeat (freeze heartbeat writer for 21 minutes) → verify watchdog does NOT kill the machine (9h threshold) and heartbeat recovers
     - **Injection D** (wave 5, minute 10): Simulate cost breaker trip (mock cost tracker returns over-budget) → verify Fallback Draft PR path activates
  6. **Verify the final outputs**:
     - A "PR" is opened in mock `gh` logs with enriched description
     - Final task status in mock Supabase is `Submitting` (before completion) → `Done`
     - Escalation payload on Injection B contains `wave_number`, `wave_error`, `completed_waves`, `total_waves`
     - No watchdog false-positive kills in machine log
  7. **Save a comprehensive report** with: total duration, per-wave durations, heartbeat gap histogram, injection outcomes, final status, and verdict.

  **Must NOT do**:
  - Do NOT mock inside the orchestrator — mock only the external world (Supabase/Inngest/git/gh/opencode)
  - Do NOT skip Injection C (stale heartbeat) even though it takes 21 minutes — this is the key watchdog validation
  - Do NOT run shorter than 4h 15min — user chose hard cutover, empirical proof is the compensation
  - Do NOT run inside the repo's own pnpm environment — MUST run in a real Docker container from the `ai-employee-worker:latest` image
  - Do NOT swallow failures — if any injection fails to recover cleanly, mark REJECT
  - Do NOT reuse state from a prior simulation run — start fresh every time

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (complex, long-running empirical verification)
    - Reason: Building the harness + monitoring a 4+ hour run with failure injections requires sustained attention and complex coordination — no specialist category fits, general high-effort agent is correct
  - **Skills**: `[]`
    - No specific skills map to this work
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser UI
    - `v-mermaid`: Not a diagram

  **Parallelization**:
  - **Can Run In Parallel**: YES (runs in parallel with F1, F2, F4 — but uses its own Docker container so no resource contention with other reviewers)
  - **Parallel Group**: Final Wave (with F1, F2, F4)
  - **Blocks**: User approval step
  - **Blocked By**: All of Waves 1–5 complete, Docker image built

  **References**:

  **Pattern References** (existing test/script patterns to follow):
  - `scripts/trigger-task.ts` - Existing pattern for driving the orchestrator end-to-end
  - `tests/workers/container-boot.test.ts` - Existing Docker-run harness pattern
  - `tests/inngest/lifecycle.test.ts` - Existing Inngest event mocking pattern
  - `src/workers/entrypoint.sh` - Entry point being exercised
  - `src/workers/orchestrate.mts` - Full orchestration being simulated

  **API/Type References** (contracts the mock harness must honor):
  - `prisma/schema.prisma` - `tasks`, `task_executions`, `heartbeats` tables (mock PostgREST must match columns)
  - `src/inngest/lifecycle.ts` - Event names the mock must accept
  - `src/workers/lib/postgrest-client.ts` - Client calls that mock server must handle
  - `src/workers/lib/heartbeat.ts` - Heartbeat write shape
  - `src/workers/lib/completion.ts` - Completion write ordering (Supabase first)

  **External References**:
  - Metis directives in plan draft: `.sisyphus/drafts/ai-employee-vs-nexus-comparison.md` (for context on why F3 is mandatory)
  - Plan file: `.sisyphus/plans/long-running-session-overhaul.md` (source of truth for expected behavior)

  **WHY Each Reference Matters**:
  - `trigger-task.ts` already knows how to send a fake webhook — the harness can extend this instead of reinventing
  - `container-boot.test.ts` already has a Docker-run helper — reuse for the main run
  - Mock PostgREST must match the Prisma schema exactly or the orchestrator's SQL will fail mid-run and invalidate the simulation
  - Completion ordering contract is subtle — getting the mock wrong would hide a real bug
  - Metis directives context explains WHY 9h watchdog matters — reviewer must understand the "why" to verify "what"

  **Acceptance Criteria**:
  - [ ] Harness lives at `scripts/long-running-sim/` with README documenting how to run
  - [ ] Mock `opencode`, `git`, `gh` shim binaries exist and are executable
  - [ ] Simulation run is launched via `bash scripts/long-running-sim/run.sh` and produces a run ID
  - [ ] Total wall-clock duration ≥ 4h 15min (verify via start/end timestamps in report)
  - [ ] Heartbeat monitoring log shows max gap ≤ 90 seconds across the entire run
  - [ ] All 5 waves reach `complete` state in mock Supabase
  - [ ] `plan_content` column populated with non-empty string after Phase 1
  - [ ] Cost breaker events logged exactly at wave boundaries (0 mid-wave events)
  - [ ] Plan file permissions verified `chmod 444` after Phase 1 via `stat` inside container
  - [ ] Between-wave `git push --force-with-lease` count == 4 (waves 1–4)
  - [ ] Install re-runs exactly once mid-simulation (after package.json SHA mutation)
  - [ ] Injection A (crash): fix-loop retries and wave 2 completes
  - [ ] Injection B (disk low): task transitions to `Escalated` with payload containing `wave_number`, `wave_error`, `completed_waves`, `total_waves`
  - [ ] Injection C (stale heartbeat): watchdog does NOT kill the machine during the 21-minute freeze
  - [ ] Injection D (cost breaker): Fallback Draft PR is opened via mock `gh`
  - [ ] Final report saved to `.sisyphus/evidence/final-f3-longrun-simulation-report.md`
  - [ ] Report ends with: `VERDICT: APPROVE` or `VERDICT: REJECT`
  - [ ] All injection logs saved to `.sisyphus/evidence/final-f3-injection-{a,b,c,d}.log`
  - [ ] Full orchestrator stdout saved to `.sisyphus/evidence/final-f3-orchestrator.log`
  - [ ] Heartbeat gap histogram saved to `.sisyphus/evidence/final-f3-heartbeat-gaps.txt`

  **QA Scenarios**:

  ```
  Scenario: Harness builds and mock shims are executable
    Tool: Bash
    Preconditions: Waves 1–5 merged, harness scripts written
    Steps:
      1. Run: `test -f scripts/long-running-sim/run.sh && test -x scripts/long-running-sim/run.sh && echo OK`
      2. Assert output == "OK"
      3. Run: `test -x scripts/long-running-sim/mocks/opencode && test -x scripts/long-running-sim/mocks/git && test -x scripts/long-running-sim/mocks/gh && echo OK`
      4. Assert output == "OK"
      5. Run: `bash scripts/long-running-sim/mocks/opencode --version`
      6. Assert exit 0
    Expected Result: All harness scripts and mock binaries exist and are executable
    Failure Indicators: Any missing file or non-executable shim
    Evidence: .sisyphus/evidence/final-f3-harness-check.log

  Scenario: Full 4h+ simulation passes all injections
    Tool: Bash (long-running via tmux per AGENTS.md long-running command protocol)
    Preconditions: Harness ready, Docker image built, mock Supabase/Inngest ports free
    Steps:
      1. Create tmux session: `tmux new-session -d -s ai-longsim -x 220 -y 50`
      2. Launch simulation: `tmux send-keys -t ai-longsim "cd /Users/victordozal/repos/dozal-devs/ai-employee && bash scripts/long-running-sim/run.sh 2>&1 | tee .sisyphus/evidence/final-f3-orchestrator.log; echo 'EXIT_CODE:'\\$? >> .sisyphus/evidence/final-f3-orchestrator.log" Enter`
      3. Poll every 5 minutes via `tail -50 .sisyphus/evidence/final-f3-orchestrator.log` until EXIT_CODE appears
      4. After completion, run: `grep "EXIT_CODE:" .sisyphus/evidence/final-f3-orchestrator.log`
      5. Assert output == "EXIT_CODE:0"
      6. Run: `grep -E "^DURATION_SECONDS=" .sisyphus/evidence/final-f3-orchestrator.log | awk -F= '{print \\$2}'`
      7. Assert value >= 15300 (4h 15min in seconds)
      8. Run: `grep -c "wave-complete" .sisyphus/evidence/final-f3-orchestrator.log`
      9. Assert count == 5
      10. Run: `awk '/heartbeat-gap/ {print \\$NF}' .sisyphus/evidence/final-f3-heartbeat-gaps.txt | sort -n | tail -1`
      11. Assert max gap <= 90
    Expected Result: Simulation runs ≥ 4h 15min, all 5 waves complete, heartbeat gaps stay under 90s
    Failure Indicators: Exit code non-zero, duration < 15300s, fewer than 5 wave completions, heartbeat gap > 90s
    Evidence: .sisyphus/evidence/final-f3-orchestrator.log, .sisyphus/evidence/final-f3-heartbeat-gaps.txt

  Scenario: Injection C — Stale heartbeat does NOT trigger watchdog kill
    Tool: Bash
    Preconditions: Simulation includes Injection C at wave 4 minute 20
    Steps:
      1. Run: `grep -E "injection-c-(start|end|machine-killed|heartbeat-frozen)" .sisyphus/evidence/final-f3-injection-c.log`
      2. Assert output contains "injection-c-start", "injection-c-heartbeat-frozen", "injection-c-end"
      3. Assert output does NOT contain "injection-c-machine-killed"
      4. Run: `grep "watchdog-kill" .sisyphus/evidence/final-f3-orchestrator.log`
      5. Assert output is empty (watchdog never killed the machine)
    Expected Result: Heartbeat freezes for 21 min, watchdog observes but 9h threshold prevents kill, heartbeat recovers
    Failure Indicators: Any watchdog-kill log line, or heartbeat never recovers
    Evidence: .sisyphus/evidence/final-f3-injection-c.log

  Scenario: Injection B — Disk low produces enriched escalation payload
    Tool: Bash
    Preconditions: Simulation includes Injection B at wave 3 minute 15
    Steps:
      1. Run: `cat .sisyphus/evidence/final-f3-injection-b.log`
      2. Grep for `escalation-payload` line
      3. Parse JSON payload
      4. Assert payload contains all 4 fields: `wave_number`, `wave_error`, `completed_waves`, `total_waves`
      5. Assert `wave_number == 3`, `completed_waves == 2`, `total_waves == 5`
      6. Assert `wave_error` contains substring "disk"
    Expected Result: Escalation payload is enriched with wave context per Metis directive
    Failure Indicators: Missing fields, wrong values, or no escalation event at all
    Evidence: .sisyphus/evidence/final-f3-injection-b.log

  Scenario: Injection D — Cost breaker trips and Fallback Draft PR opens
    Tool: Bash
    Preconditions: Simulation includes Injection D at wave 5 minute 10
    Steps:
      1. Run: `grep -E "cost-breaker-tripped" .sisyphus/evidence/final-f3-injection-d.log`
      2. Assert non-empty match
      3. Run: `grep -E "fallback-draft-pr-created" .sisyphus/evidence/final-f3-injection-d.log`
      4. Assert non-empty match
      5. Run: `grep -E "fallback-draft-pr-url" .sisyphus/evidence/final-f3-injection-d.log`
      6. Assert URL captured (from mock gh)
    Expected Result: Breaker trips, fallback path runs, draft PR URL logged
    Failure Indicators: No breaker event, no fallback PR, no URL captured
    Evidence: .sisyphus/evidence/final-f3-injection-d.log

  Scenario: Plan file locked read-only after Phase 1
    Tool: Bash
    Preconditions: Simulation has progressed past Phase 1
    Steps:
      1. Run: `grep "plan-file-locked" .sisyphus/evidence/final-f3-orchestrator.log`
      2. Parse log line for `mode=444`
      3. Assert mode == 444
    Expected Result: Plan file is chmod 444 after Phase 1 per Metis directive
    Failure Indicators: Mode is not 444, or no lock event found
    Evidence: .sisyphus/evidence/final-f3-orchestrator.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/final-f3-longrun-simulation-report.md` (final report with VERDICT)
  - [ ] `.sisyphus/evidence/final-f3-orchestrator.log` (full stdout)
  - [ ] `.sisyphus/evidence/final-f3-heartbeat-gaps.txt` (gap histogram)
  - [ ] `.sisyphus/evidence/final-f3-injection-a.log` (OpenCode crash recovery)
  - [ ] `.sisyphus/evidence/final-f3-injection-b.log` (disk low escalation)
  - [ ] `.sisyphus/evidence/final-f3-injection-c.log` (stale heartbeat, 9h watchdog)
  - [ ] `.sisyphus/evidence/final-f3-injection-d.log` (cost breaker + fallback PR)
  - [ ] `.sisyphus/evidence/final-f3-harness-check.log`

  **Commit**: NO (review task, produces evidence + harness only — harness may be committed as a follow-up if desired, but not as part of this plan)

- [ ] F4. **Scope Fidelity Check** — `deep`

  **What to do**:
  - For every task (1–42): read the task's "What to do" section, then read the actual git diff for files listed in the task's Commit group. Verify a 1:1 match:
    - **Nothing missing**: Every action in "What to do" produced a visible code change
    - **Nothing extra**: Every code change maps back to a specific "What to do" line
  - Detect cross-task contamination: a task that touches files belonging to another task's scope is REJECT (e.g., Task 8 modifying `entrypoint.sh` which belongs to Task 29 — unless justified in coordination notes)
  - Verify "Must NOT do" compliance per task: for every "Must NOT do" item, search the diff for patterns that would violate it
  - Detect unaccounted changes: every file in `git log Wave1^..Wave5` must map to at least one task's Commit group
  - Verify **subagent deferral**: scan `src/workers/` for any evidence of subagent spawning (`Task(`, `subagent`, `specialist`, nested OpenCode invocations). Must find NONE — subagents were explicitly deferred.
  - Verify **webhook/event contracts unchanged**: git diff `src/gateway/webhooks/jira.ts` and `src/inngest/lifecycle.ts` send() schemas — these files may be modified but the external contracts (body shape, event schema) must be byte-identical to pre-Wave-1 state
  - Verify **Supabase-first ordering unchanged**: diff `src/workers/lib/completion.ts` — the order of operations (Supabase write → Inngest emit) must be preserved
  - Verify **fix-loop still present**: grep `src/workers/` for references to fix-loop; must still exist as safety net (Metis directive)
  - Verify **no feature flag added**: per user's hard-cutover decision, there must be NO `LONG_RUNNING_SESSION_ENABLED` or similar env gate
  - Generate a mapping table: each task → list of files changed → list of "What to do" actions → match status
  - Flag any "drive-by" changes (unrelated fixes sneaking into the PR)

  **Must NOT do**:
  - Do not evaluate code quality — that's F2's job
  - Do not run end-to-end tests — that's F3's job
  - Do not verify plan fidelity at the "Must Have" level — that's F1's job
  - Do not suggest refactors
  - Do not approve drive-by changes

  **Recommended Agent Profile**:
  - **Category**: `deep` (requires thorough cross-referencing between plan, diffs, and guardrails)
    - Reason: Scope fidelity is a research-heavy audit that requires reading many files and comparing against structured rules — `deep` is the correct category for "thorough research before action"
  - **Skills**: `[]`
    - No specific skills needed
  - **Skills Evaluated but Omitted**:
    - `git-master`: Audit reads diffs via `git log`/`git diff`, not complex history rewrites
    - `v-mermaid`: Not a diagram review

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Final Wave (with F1, F2, F3)
  - **Blocks**: User approval step
  - **Blocked By**: All of Waves 1–5 committed to branch

  **References**:

  **Pattern References** (existing code to verify unchanged):
  - `src/gateway/webhooks/jira.ts` - Jira webhook shape (must be byte-identical)
  - `src/inngest/lifecycle.ts` - `engineering/task.completed` event send() shape (must be unchanged)
  - `src/workers/lib/completion.ts` - Supabase-first ordering (must be unchanged)
  - `src/workers/lib/fix-loop.ts` (or wherever fix-loop lives) - Must still exist

  **API/Type References**:
  - Plan file: `.sisyphus/plans/long-running-session-overhaul.md` - Source of truth for "What to do" per task
  - Draft file: `.sisyphus/drafts/ai-employee-vs-nexus-comparison.md` - Metis hard directives (reference until delete)

  **External References**:
  - Git log range: `main..HEAD` (all commits from Wave 1 onward) — the audit scope
  - `git diff main..HEAD` — the total change surface

  **WHY Each Reference Matters**:
  - `jira.ts` and `lifecycle.ts` contracts are externally observable — if they drift, Jira webhook calls or Inngest event consumers break silently
  - `completion.ts` ordering is the correctness invariant that prevents duplicate PRs — reviewer must verify it by reading the actual diff, not trust the task description
  - Plan file is the single source of truth for "what should have happened" — every diff line must map back to a plan line
  - Metis directives in draft are non-negotiable — if any are missing from the implementation, scope has drifted

  **Acceptance Criteria**:
  - [ ] Report saved to `.sisyphus/evidence/final-f4-scope-fidelity-report.md`
  - [ ] Report contains mapping table: 42 tasks × (files changed, plan actions, match status)
  - [ ] Report contains: `Tasks [N/N compliant]`, `Contamination [CLEAN/N issues]`, `Unaccounted files [CLEAN/N]`, `Subagent drift [CLEAN/N]`, `Contract drift [CLEAN/N]`
  - [ ] Report ends with: `VERDICT: APPROVE` or `VERDICT: REJECT`
  - [ ] Zero unaccounted files in `git log main..HEAD`
  - [ ] Zero subagent references found in `src/workers/`
  - [ ] Zero changes to Jira webhook body shape
  - [ ] Zero changes to `engineering/task.completed` event schema
  - [ ] Supabase-first ordering preserved in completion.ts
  - [ ] Fix-loop still present as safety net
  - [ ] No `LONG_RUNNING_SESSION_ENABLED` or equivalent flag found (hard cutover preserved)
  - [ ] Every drive-by change explicitly justified or REJECT

  **QA Scenarios**:

  ```
  Scenario: F4 subagent drift scan — zero matches
    Tool: Bash
    Preconditions: Waves 1–5 merged
    Steps:
      1. Run: `rg -n "subagent_type|Task\\(\\s*\\{|nested.*opencode|specialist" src/workers/ --type ts --type mts --type sh | tee .sisyphus/evidence/final-f4-subagent-scan.txt`
      2. Assert file is empty (no matches)
    Expected Result: No evidence of subagent spawning — deferral preserved
    Failure Indicators: Any match for subagent patterns
    Evidence: .sisyphus/evidence/final-f4-subagent-scan.txt

  Scenario: F4 contract drift scan — jira.ts and lifecycle.ts schemas unchanged
    Tool: Bash
    Preconditions: Git history intact
    Steps:
      1. Run: `git show main:src/gateway/webhooks/jira.ts > /tmp/jira-pre.ts && diff /tmp/jira-pre.ts src/gateway/webhooks/jira.ts | grep -E "^[+-]" | grep -vE "^[+-]{3}" | tee .sisyphus/evidence/final-f4-jira-diff.txt`
      2. Assert diff output contains no changes to the webhook body parser (only allowed change: maybe formatting)
      3. Run: `git grep -n "engineering/task.completed" src/inngest/lifecycle.ts`
      4. Capture the surrounding send() call
      5. Compare keys against `git show main:src/inngest/lifecycle.ts` for the same call
      6. Assert key set is identical (no added/removed fields)
    Expected Result: External contracts are byte-identical (formatting-only changes allowed)
    Failure Indicators: Any change to webhook body shape or event schema keys
    Evidence: .sisyphus/evidence/final-f4-jira-diff.txt, .sisyphus/evidence/final-f4-event-schema-diff.txt

  Scenario: F4 unaccounted files scan
    Tool: Bash
    Preconditions: Waves 1–5 committed
    Steps:
      1. Run: `git log main..HEAD --name-only --pretty=format: | sort -u | grep -v '^$' | tee .sisyphus/evidence/final-f4-changed-files.txt`
      2. For each file, grep the plan file for the filename: `while read f; do grep -qF "$f" .sisyphus/plans/long-running-session-overhaul.md || echo "UNACCOUNTED: $f"; done < .sisyphus/evidence/final-f4-changed-files.txt | tee .sisyphus/evidence/final-f4-unaccounted.txt`
      3. Assert .sisyphus/evidence/final-f4-unaccounted.txt is empty
    Expected Result: Every changed file is referenced somewhere in the plan
    Failure Indicators: Any UNACCOUNTED line
    Evidence: .sisyphus/evidence/final-f4-changed-files.txt, .sisyphus/evidence/final-f4-unaccounted.txt

  Scenario: F4 no feature flag added (hard cutover preserved)
    Tool: Bash
    Preconditions: Waves 1–5 merged
    Steps:
      1. Run: `rg -n "LONG_RUNNING_SESSION_ENABLED|WAVE_EXECUTION_ENABLED|TWO_PHASE_ENABLED|FEATURE_FLAG" src/ | tee .sisyphus/evidence/final-f4-flag-scan.txt`
      2. Assert file is empty
    Expected Result: No feature flag added — hard cutover decision honored
    Failure Indicators: Any env flag gating the new path
    Evidence: .sisyphus/evidence/final-f4-flag-scan.txt

  Scenario: F4 fix-loop still present
    Tool: Bash
    Preconditions: Waves 1–5 merged
    Steps:
      1. Run: `rg -l "fix.?loop|fixLoop|FixLoop" src/workers/ | tee .sisyphus/evidence/final-f4-fix-loop-refs.txt`
      2. Assert file is non-empty (at least one reference)
      3. Run: `test -f src/workers/lib/fix-loop.ts || test -f src/workers/fix-loop.ts && echo EXISTS`
      4. Assert output == "EXISTS"
    Expected Result: Fix-loop module still exists as safety net per Metis directive
    Failure Indicators: No references found, or module file deleted
    Evidence: .sisyphus/evidence/final-f4-fix-loop-refs.txt

  Scenario: F4 Supabase-first completion ordering preserved
    Tool: Bash
    Preconditions: Waves 1–5 merged
    Steps:
      1. Run: `cat src/workers/lib/completion.ts`
      2. Identify the function that writes to Supabase and the one that emits Inngest
      3. Verify lexical order: Supabase write call appears BEFORE Inngest send call in the same code path
      4. Run: `rg -n "await.*postgrest.*update|await.*fetch.*rest/v1/tasks" src/workers/lib/completion.ts | head -1`
      5. Capture line number N1
      6. Run: `rg -n "await.*inngest.*send|engineering/task.completed" src/workers/lib/completion.ts | head -1`
      7. Capture line number N2
      8. Assert N1 < N2 (Supabase call comes first)
    Expected Result: Supabase write precedes Inngest emit in completion.ts
    Failure Indicators: N2 < N1 or either call missing
    Evidence: .sisyphus/evidence/final-f4-completion-ordering.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/final-f4-scope-fidelity-report.md`
  - [ ] `.sisyphus/evidence/final-f4-subagent-scan.txt`
  - [ ] `.sisyphus/evidence/final-f4-jira-diff.txt`
  - [ ] `.sisyphus/evidence/final-f4-event-schema-diff.txt`
  - [ ] `.sisyphus/evidence/final-f4-changed-files.txt`
  - [ ] `.sisyphus/evidence/final-f4-unaccounted.txt`
  - [ ] `.sisyphus/evidence/final-f4-flag-scan.txt`
  - [ ] `.sisyphus/evidence/final-f4-fix-loop-refs.txt`
  - [ ] `.sisyphus/evidence/final-f4-completion-ordering.txt`

  **Commit**: NO (review task, produces evidence only)

---

### Final Wave Approval Protocol (MANDATORY)

Once F1, F2, F3, and F4 have all written their reports with `VERDICT: APPROVE`:

1. **Prometheus (orchestrator)** consolidates the 4 verdict lines into a summary table
2. Presents the summary to the user with this exact format:

   ```
   ## Final Verification Wave Results

   | Reviewer | Category | Verdict | Report |
   |---|---|---|---|
   | F1 Plan Compliance | oracle | APPROVE/REJECT | .sisyphus/evidence/final-f1-plan-compliance-audit.md |
   | F2 Code Quality | unspecified-high | APPROVE/REJECT | .sisyphus/evidence/final-f2-code-quality-review.md |
   | F3 Long-Running QA | unspecified-high | APPROVE/REJECT | .sisyphus/evidence/final-f3-longrun-simulation-report.md |
   | F4 Scope Fidelity | deep | APPROVE/REJECT | .sisyphus/evidence/final-f4-scope-fidelity-report.md |

   **Overall**: ALL APPROVE / N REJECTED

   Waiting for your explicit "okay" to mark the long-running-session-overhaul plan complete.
   ```

3. **WAIT for user's explicit "okay"** — do NOT auto-mark F1–F4 as checked
4. If any reviewer returned REJECT: fix root cause → re-run that reviewer → re-present
5. User typing "okay" (or equivalent approval) is the gate to mark the plan Done

> **Non-negotiable**: Never check the F1–F4 checkboxes before user approval. Never treat "all APPROVE" as self-approval.

---

## Commit Strategy

> One commit per wave, pushed immediately with `git push --force-with-lease`.
> Conventional commit format. NEVER `--no-verify`. NEVER reference AI tools.
> NEVER add `Co-authored-by` trailers.

- **Wave 1 commit**: `feat(wave-1): foundation modules for long-running session overhaul`
  - Files: `src/workers/config/long-running.ts`, `src/workers/lib/agents-md-reader.ts`, `src/workers/lib/plan-parser.ts`, `src/workers/lib/cost-tracker-v2.ts`, `src/workers/lib/resource-caps.ts`, `src/workers/lib/step-timer.ts`, `prisma/schema.prisma`, `prisma/migrations/*`, `src/lib/logger.ts`
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

- **Wave 2 commit**: `feat(wave-2): core wave execution and safety modules`
  - Files: `src/workers/lib/wave-executor.ts`, `continuation-dispatcher.ts`, `completion-detector.ts`, `prompt-builder.ts`, `planning-orchestrator.ts`, `fallback-pr.ts`, `cost-breaker.ts`, `cache-validator.ts`, `disk-check.ts`, `plan-sync.ts`, `between-wave-push.ts` + test files
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

- **Wave 3 commit**: `feat(wave-3): integrate two-phase wave orchestration`
  - Files: `src/workers/orchestrate.mts`, `src/workers/lib/task-context.ts`
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

- **Wave 4 commit**: `feat(wave-4): entrypoint.sh infra hardening and context files`
  - Files: `src/workers/entrypoint.sh`, `src/workers/config/opencode.json` (template), `Dockerfile` (if needed for COPY)
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run && docker build -t ai-employee-worker:latest .`

- **Wave 5 commit**: `feat(wave-5): inngest thresholds, redispatch, and PR enhancements`
  - Files: `src/inngest/lifecycle.ts`, `src/inngest/watchdog.ts`, `src/inngest/redispatch.ts`, `src/lib/github-client.ts`, `src/workers/lib/ci-classifier.ts`
  - Pre-commit: `pnpm lint && pnpm build && pnpm test -- --run`

### Rollback Instructions (hard-cutover safety net)

Since no feature flag was chosen, the rollback path is git revert:

```bash
# Identify the 5 wave commits (oldest → newest)
git log --oneline --grep="feat(wave-" --max-count=5

# Revert all 5 in reverse order (newest first)
git revert --no-edit <wave-5-sha>
git revert --no-edit <wave-4-sha>
git revert --no-edit <wave-3-sha>
git revert --no-edit <wave-2-sha>
git revert --no-edit <wave-1-sha>

# Then reset infrastructure thresholds by editing:
#   src/inngest/watchdog.ts → restore 4h machine cleanup
#   src/inngest/lifecycle.ts → restore 4h10m waitForEvent
#   src/inngest/redispatch.ts → restore 6h budget

# Rebuild + redeploy
docker build -t ai-employee-worker:latest .
pnpm fly:image  # if hybrid mode
```

---

## Success Criteria

### Verification Commands

```bash
pnpm build                                        # Expected: exit 0, no errors
pnpm lint                                         # Expected: exit 0
pnpm test -- --run                                # Expected: 515+ baseline tests pass + new module tests pass
pnpm prisma migrate deploy                        # Expected: migration applied cleanly
docker build -t ai-employee-worker:latest .       # Expected: image built
pnpm trigger-task                                 # Expected: small-ticket E2E reaches Done + PR created
# F3 only — 4+ hour simulation
MOCK_LONG_RUNNING=1 pnpm trigger-task --mock-plan # Expected: 4+ hours, all waves complete, PR created
```

### Final Checklist

- [ ] All "Must Have" items present
- [ ] All "Must NOT Have" items absent
- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test -- --run` passes (515+ preserved + new tests)
- [ ] Prisma migration applied
- [ ] Docker image rebuilt
- [ ] Small-ticket E2E passes
- [ ] 4+ hour long-running simulation passes (F3)
- [ ] F1 oracle audit returns APPROVE
- [ ] F2 code quality review returns APPROVE
- [ ] F3 manual QA + long-running simulation returns APPROVE
- [ ] F4 scope fidelity check returns APPROVE
- [ ] User explicitly says "okay" after F1–F4 summary
