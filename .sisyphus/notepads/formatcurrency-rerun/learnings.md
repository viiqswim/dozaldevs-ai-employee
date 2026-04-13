# Learnings — formatcurrency-rerun

## Inherited from check6-fly-hybrid session

### UUID Default Fix (CRITICAL)

- `validation_runs`, `deliverables`, `task_status_log` previously had `id uuid NOT NULL` with no DB-level default
- Fix applied: Migration `20260410140640_add_uuid_defaults` adds `gen_random_uuid()` DEFAULT
- PostgREST can now INSERT without providing `id`
- This fix should already be applied — verify in DB if Check 6 fails

### lifecycle.ts Hybrid-Spawn

- EXECUTION_ID is passed as env var to Fly machines (in `env:` block, lines 149-158)
- execution.create() happens BEFORE the Fly machine creation call
- Tag used: `latest` (not a stale commit hash)

### Infrastructure Layout

- Gateway: http://localhost:3000
- Inngest Dev: http://localhost:8288
- PostgREST: http://localhost:54321
- PostgreSQL: postgresql://postgres:postgres@localhost:54322/ai_employee
- Tunnel: TUNNEL_URL from .env (Cloudflare tunnel to PostgREST)
- Worker app: ai-employee-workers on Fly.io

### Monitoring Pattern

- `pnpm trigger-task` must run in tmux (long-running, can take 45-90 min)
- Session: `ai-fc-e2e`, log: `/tmp/ai-fc-e2e.log`
- Poll: `tail -15 /tmp/ai-fc-e2e.log && grep "EXIT_CODE:" /tmp/ai-fc-e2e.log && echo "DONE" || echo "RUNNING"`
- Terminal success state: `Task completed successfully!` + `EXIT_CODE:0`

## 2026-04-10 Rerun Fix

### Fixes Applied
1. `between-wave-push.ts`: Added `git fetch origin <branch>` before `--force-with-lease` push, wrapped in try-catch (first push = branch not on remote yet is normal).
2. `fallback-pr.ts`: Changed `createPullRequest` → `createPR`, removed unsupported `draft` and `labels` params.

### Build sequence
- `pnpm build` → exit 0 (TS clean)
- `docker build -t ai-employee-worker:latest .` → exit 0 (~2 min cached)
- `pnpm fly:image` → exit 0 (~2 min, cached layers)

### New run
- Key: TEST-1775866864
- Task UUID: a214e4f6-e3ca-47e7-8c2d-48c7ef1fefb9
- Session: ai-fc-e2e2
- Status at capture: Executing (30s mark)

## Run 4 — 2026-04-10

### Fix Applied
- `src/workers/lib/branch-manager.ts` line 96: changed `git fetch origin branchName` → `git fetch origin` (no branch arg)
- This matches the same fix already applied to `between-wave-push.ts`
- Root cause: `git fetch origin <branchName>` is unreliable for updating `refs/remotes/origin/<branchName>` when the branch already exists

### Build & Deploy
- Docker build: EXIT_CODE:0 (cached most layers, fast rebuild ~3-5 min)
- `pnpm fly:image`: EXIT_CODE:0 (pushed ~407MB layer to Fly registry)
- Both commands chained in single tmux session `ai-fc-build`

### Run 4 Launch
- Session: `ai-fc-e2e4`, log: `/tmp/ai-fc-e2e4.log`
- Task UUID: `d26ea2f8-1b1f-48d4-90e7-310aa38cbcc3`
- Key: `TEST-100`
- Tunnel URL: `https://captured-capture-daughters-dirt.trycloudflare.com`
- Status at launch: Ready → Executing (confirmed in log)

## Run 5 — 2026-04-10 (--force fix deployed)

### Changes deployed
- `between-wave-push.ts` uses `git push --force` (no `--force-with-lease`, no fetch)
- Docker image rebuilt: sha256:658cf713c1465d1dc7640e5754df5bbbd8c4676a9e369c048bb5c6ab59e73f81
- Image pushed to Fly.io registry successfully

### Task details
- Task UUID: ea7b8606-7b6a-4613-a5ee-08cb4ec298e4
- Key: TEST-1775876158
- Tunnel: https://captured-capture-daughters-dirt.trycloudflare.com
- Session: ai-fc-e2e5 / log: /tmp/ai-fc-e2e5.log
- Status at launch: Executing › starting

### Gotcha — duplicate key
- First attempt used default key TEST-100 (same as Run 4) → webhook returned 200 duplicate
- Trigger script does NOT auto-generate unique key when duplicate detected; it finds existing task and monitors it
- Must ALWAYS pass `--key TEST-$(date +%s)` for each new run


## Clean Run 3 — 2026-04-12

### Run Details
- Task UUID: 717995d5-cfb3-4877-8301-bdb4b0df9695
- Task Key: TEST-1776026999
- PR: https://github.com/viiqswim/ai-employee-test-target/pull/30 (OPEN)
- Duration: ~49 min (20:50:16 → 21:39:20 UTC)
- verify:e2e: 12/12 PASS

### Result
Pipeline infrastructure: ✅ FULLY WORKING
PR content: ⚠️ AI implemented formatDate enhancements instead of formatCurrency
  - Root cause: AI agent focused on existing formatDate function rather than ticket description
  - This is an AI content quality issue, NOT a pipeline infrastructure failure
  - Per plan: documented in pr-quality-note.txt, no re-fire needed

### Status Flow (no manual actors)
gateway → lifecycle_fn → machine → lifecycle_fn
NULL → Ready → Executing → Submitting → Done
