# Learnings — ME-02 Time Saved Calculation

## Architecture Decisions

- Two fields on archetypes: `estimated_manual_minutes` (Haiku-generated) + `estimated_manual_minutes_override` (PM-set)
- Effective estimate = override ?? haiku_default
- `task_metrics` table snapshots effective estimate on task completion — historically accurate
- Haiku called synchronously in route handler (~500ms) only on content field changes
- `taskType: 'review'` used for Haiku estimation call (no new union value)

## Key Patterns

- Follow `src/gateway/services/archetype-generator.ts` for Haiku call pattern (constructor injection, error handling)
- Follow `patchTask` / `logStatusTransition` in lifecycle for PostgREST call pattern
- `CompactSettingsGrid.tsx` is where PM-editable archetype settings live
- Dashboard reads via PostgREST, writes via Gateway API

## Content Fields (trigger re-estimation)

- instructions, role_name, system_prompt, deliverable_type

## Non-Content Fields (skip re-estimation)

- notification_channel, concurrency_limit, risk_model, vm_size, agents_md, delivery_instructions, tool_registry, trigger_sources, status, overview, worker_env

## Validation

- PM override: min 1, max 1440 minutes
- Null estimate: show "Not estimated" in UI, skip metric recording in lifecycle

## Haiku Failure Handling

- Silent failure: set null, log warning, NEVER fail archetype save or lifecycle step

## Task 1 — Schema Migration (completed 2026-05-22)

- Migration name: `20260522073456_add_time_estimation_and_task_metrics`
- Two nullable Int columns added to `archetypes`: `estimated_manual_minutes`, `estimated_manual_minutes_override`
- New `task_metrics` table: `id`, `task_id` (unique), `archetype_id`, `tenant_id`, `minutes_saved`, `created_at`
- Back-relations added: `Task.taskMetric TaskMetric?` (one-to-one via unique task_id), `Archetype.taskMetrics TaskMetric[]`, `Tenant.taskMetrics TaskMetric[]`
- `pnpm prisma migrate dev` auto-runs `prisma generate` — no need to run separately
- Build (tsc) passes clean with EXIT_CODE:0
- Evidence saved to `.sisyphus/evidence/task-1-archetypes-columns.txt` and `.sisyphus/evidence/task-1-task-metrics-schema.txt`

## Task 2 — TimeEstimator Service (completed 2026-05-22)

- Created `src/gateway/services/time-estimator.ts` following exact `ArchetypeGenerator` pattern
- Constructor: `constructor(private readonly callLLMFn: typeof callLLM)` — same injection as archetype-generator
- Uses `taskType: 'review'`, `model: 'anthropic/claude-haiku-4-5'`, `temperature: 0`, `maxTokens: 50`
- Parse strategy: `parseInt(raw.trim())` first, then regex `/\d+/` fallback — handles "About 15-20 minutes" → 15
- ALL errors caught silently with `log.warn` → returns null (never propagates)
- `shouldReEstimate`: checks if any of `['instructions', 'role_name', 'system_prompt', 'deliverable_type']` in changedFields
- `getEffectiveEstimate`: override ?? haiku_estimate ?? null
- 11 tests, all passing
- Build (tsc) passes clean
- Evidence: `.sisyphus/evidence/task-2-unit-tests.txt`
