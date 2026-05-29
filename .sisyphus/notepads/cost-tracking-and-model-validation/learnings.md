# Learnings — cost-tracking-and-model-validation

## [2026-05-29] Session start

### Key Facts

- `executions` row created at harness line ~808, execution phase only
- Delivery branch exits before execution row creation code — no delivery cost captured today
- `runOpencodeSession` return value discarded at line ~700 (no `const result =`)
- `model` is `String?` (nullable) in Prisma schema — root cause of silent fallback
- Dashboard reads `executions?.[0]?.estimated_cost_usd` — only first row
- `tasks.cost_usd_cents` is dead field — never written, out of scope

### Architecture Decisions

- Delivery cost: separate `executions` row with `phase` column (NOT accumulate into one row)
- Dashboard: combined total only (NOT per-phase breakdown)
- Model validation: full fix — DB NOT NULL + dispatcher guard + harness hard error
- `TaskDetail.tsx` / `use-execution.ts` OUT OF SCOPE for this plan

### Must NOT Touch

- `src/inngest/lifecycle.ts` (deprecated)
- `src/workers/orchestrate.mts` (deprecated)
- `src/workers/lib/session-manager.ts` (deprecated)
- `src/gateway/routes/admin-brain-preview.ts` line 337 (display-only)
- `use-execution.ts`, `TaskDetail.tsx`

## [2026-05-28] Task 1 — Migration: add-execution-phase-and-require-model

### What was done
- Added `phase TEXT NOT NULL DEFAULT 'execution'` to `executions` table
- Made `archetypes.model` NOT NULL (backfilled NULLs with `'minimax/minimax-m2.7'` — 0 rows needed backfill)
- Updated `prisma/schema.prisma`: `Execution.phase String @default("execution")`, `Archetype.model String` (was `String?`)
- Migration applied via direct psql + `prisma migrate resolve --applied`

### Why direct psql + resolve (not migrate dev)
- `prisma migrate dev` detected drift in `task_metrics.id` default (cosmetic, not blocking)
- Used `--create-only` approach: write SQL manually → apply via psql → mark applied via `migrate resolve`
- This avoids the shadow DB reset that `migrate dev` would have triggered

### Evidence
- `executions.phase`: `text NOT NULL DEFAULT 'execution'::text` ✓
- `archetypes.model`: `text NOT NULL` ✓
- PostgREST: `[{"phase":"execution"}]` ✓
- Build: EXIT_CODE:0 ✓

## [2026-05-28] Task 2 — MODEL_NOT_CONFIGURED dispatcher guard

### What was done
- Added `MODEL_NOT_CONFIGURED` to `DispatchEmployeeResult` error code union in `employee-dispatcher.ts`
- Guard placed AFTER runtime check, checks `!archetype.model` (catches null AND empty string)
- Route handler maps `MODEL_NOT_CONFIGURED` → HTTP 422 in `admin-employee-trigger.ts`

### Evidence
- Blanked model on `daily-real-estate-inspiration-2-copy`, triggered → HTTP 422 with correct body
- Build: EXIT_CODE:0
- Commit: 88375cb

### Gotcha: real-estate-motivation-bot-2 is soft-deleted
- `deleted_at IS NOT NULL` and `status = 'inactive'` — dispatcher's findFirst returns null → ARCHETYPE_NOT_FOUND
- Used `daily-real-estate-inspiration-2-copy` (active, not deleted) for evidence instead

## [2026-05-28] Task 3 — Delivery cost capture

### What was done
- Inserted delivery `executions` row creation after `deliverableContent` assignment (after deliverable confirmed)
- `deliveryExecId` declared outside try/catch — accessible in catch AND success patch
- `deliveryResult` declared outside try/catch — accessible after try/catch for metrics
- `runOpencodeSession` return value captured: `deliveryResult = await runOpencodeSession(...)`
- Catch block: patches delivery row to `status: 'failed'` (best-effort, `.catch(() => {})`)
- After catch: patches delivery row with `prompt_tokens`, `completion_tokens`, `estimated_cost_usd`, `status: 'completed'`
- All DB ops wrapped in try/catch — non-fatal

### Pattern followed
- Row creation: same as execution-phase at lines 807–827 (but no heartbeat, no `primary_model_id`)
- Metrics patch: same as execution-phase at lines 915–933 (but no `session_transcript`)

### Build: EXIT_CODE:0
### Commit: 128da12

## [2026-05-28] Task 4 — Model hard error

### What was done
- Delivery phase: inserted guard before `let deliveryResult` — patches delivery exec row to `failed`, calls `markFailed('Archetype has no model configured', null, 'Delivering', 'missing_model')`, returns
- Execution phase: replaced `const model = archetype.model ?? 'minimax/minimax-m2.7'` with guard + `const model = archetype.model` — calls `markFailed(...)`, `process.exit(1)`
- Zero occurrences of `minimax/minimax-m2.7` remain in harness

### Key decision: execution guard placement
- `const model` is at line 858, BEFORE `executionId` is defined (line 873+)
- `model` is used at line 875 in a log call before `executionId` exists
- Guard placed at line 858 with `executionId: null` — acceptable since `markFailed` accepts null
- Could not move `const model` after `executionId` without restructuring the log call

### ArchetypeRow type
- `model?: string | null` in harness interface (line 39) — still nullable in local type
- After `if (!archetype.model)` guard, TypeScript narrows to `string` — `const model = archetype.model` compiles clean

### Build: EXIT_CODE:0
### Commit: 3ae21c2

## [2026-05-28] Task 6 — Dashboard cost aggregation fix

### What was done
- Line 191: replaced `t.executions?.[0]?.estimated_cost_usd ?? 0` with `t.executions?.reduce((s, e) => s + (e.estimated_cost_usd ?? 0), 0) ?? 0` in aggregate total cost
- Line 355: replaced `task.executions?.[0]?.estimated_cost_usd` with `task.executions?.reduce((s, e) => s + (e.estimated_cost_usd ?? 0), 0) ?? 0` in per-task cost column
- No query change needed — PostgREST select already fetches all execution rows as array

### Build: EXIT_CODE:0
### Commit: b178353

## [2026-05-28] Task 7 — E2E verification

### Task c7f1de5b-80a0-4678-bace-4b5ba523439c
- Employee: daily-real-estate-inspiration-2-copy (VLRE tenant)
- Final status: Done ✓
- Duration: ~1m 34s

### Execution rows (psql + PostgREST)
| phase     | status    | estimated_cost_usd | prompt_tokens | completion_tokens |
|-----------|-----------|-------------------|---------------|-------------------|
| execution | completed | 0.0020            | 12814         | 485               |
| delivery  | completed | 0.0057            | 33313         | 770               |

- Sum: $0.0077 — matches dashboard per-task cost column ✓
- PostgREST confirmed both rows readable ✓

### Dashboard
- "Total Employee Cost": $6.36 (non-zero) ✓
- Top task row: $0.0077 (execution + delivery summed correctly) ✓
- Screenshot saved to .sisyphus/evidence/task-7-dashboard-cost.png

### Model validation
- Blanked model → HTTP 422 MODEL_NOT_CONFIGURED ✓
- Model restored to 'deepseek/deepseek-v4-flash' ✓

### Full pipeline PASS ✓
