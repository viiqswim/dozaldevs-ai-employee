# Learnings

## 2026-05-12 Wave 1 Complete

### Wave 1 Commits

- `5fc6e49` — fix(guest-messaging): strengthen thread UID instructions and add validation guard
- `1d0c83f` — fix(harness): add task_status_log entries for Done and Failed transitions
- `f8bea55` — refactor(lifecycle): replace USE_LOCAL_DOCKER/USE_FLY_HYBRID with WORKER_RUNTIME

### Key Findings

- `employee-lifecycle.ts` now has exactly 6 WORKER_RUNTIME references, 0 old vars
- `opencode-harness.mts` has 2 task_status_log inserts (Done + Failed), both try/catch wrapped
- `prisma/seed.ts` has CRITICAL warning about lead-uid vs thread-uid distinction
- `post-guest-approval.ts` has validation guard (warns but does NOT exit on identical UIDs)
- Named tunnel `e160ac6d` serves both gateway (local-ai-employee.dozaldevs.com) and PostgREST (postgrest-ai-employee.dozaldevs.com)
- `.env` has `TUNNEL_URL=https://postgrest-ai-employee.dozaldevs.com` (stable, not trycloudflare.com)

### Deprecated lifecycle.ts

- `src/inngest/lifecycle.ts` lines 30-31 still reference old vars — intentionally left alone (deprecated, never runs)

### WORKER_RUNTIME Logic

- `WORKER_RUNTIME !== 'fly'` → Docker (local) path — safe default when unset
- `WORKER_RUNTIME === 'fly'` → Fly.io path, uses getTunnelUrl()
- Default when unset: Docker (local dev)

### dev.ts Current State (pre-Wave 2)

- Line 66-69: log messages reference `USE_FLY_HYBRID=1`
- Line 447: `if (process.env.USE_FLY_HYBRID === '1')` — PostgREST tunnel block
- Line 453-461: existing liveness check for TUNNEL_URL (already works, do NOT change)
- Line 556: `USE_LOCAL_DOCKER: process.env.USE_FLY_HYBRID === '1' ? '0' : '1'` — gateway env injection
- Line 766: `if (process.env.USE_FLY_HYBRID === '1')` — summary log

### dev-e2e.ts Current State (pre-Wave 2)

- Line 375: `USE_LOCAL_DOCKER: '1'` in gatewayEnv

### Stable URL Detection Logic (for T5)

- If `TUNNEL_URL` is set AND does NOT contain `trycloudflare.com` → skip quick tunnel spawn, log stable URL message
- If `TUNNEL_URL` is empty or contains `trycloudflare.com` → proceed with existing quick tunnel spawn
- Add this check BEFORE the existing liveness check at ~453

### Test Files (pre-Wave 2)

- `tests/setup.ts:138`: `delete process.env.USE_LOCAL_DOCKER`
- `tests/inngest/lifecycle-local-docker.test.ts:217`: `process.env.USE_LOCAL_DOCKER = '1'`
- `tests/inngest/lifecycle-local-docker.test.ts:224`: `delete process.env.USE_LOCAL_DOCKER`
- `tests/inngest/lifecycle-local-docker.test.ts:301`: `delete process.env.USE_LOCAL_DOCKER`
- `tests/inngest/lifecycle-local-docker.test.ts:411`: asserts source contains `USE_LOCAL_DOCKER === '1'`

### poll-completion.ts

- Line 2: JSDoc says `USE_FLY_HYBRID dispatch branch` — needs update to `WORKER_RUNTIME=fly dispatch branch`

### .env.example (pre-Wave 2)

- Lines 67-83: USE_LOCAL_DOCKER and USE_FLY_HYBRID sections — need full replacement with WORKER_RUNTIME

### AGENTS.md (pre-Wave 2)

- Line 78: `USE_LOCAL_DOCKER flag` description — needs update to WORKER_RUNTIME
- Line 514: `USE_FLY_HYBRID=1 and TUNNEL_URL=<cloudflare-url>` — needs update

## Task 10 E2E Full Validation (2026-05-13)

### Pipeline Run

- Airbnb message: "What is the WiFi password? [e2e-revalidation-1778645458]"
- Task: 32014161-d0cd-4ed3-8916-0dbbef8b40f2
- Full flow: Received → Executing → Reviewing → Approved → Delivering → Done ✓

### Fix 1 (thread_uid) — PASS

- Slack approval card showed `threadUid=aef3d0cf-bc61-4f05-a3ce-1a4199ca336d`
- Lead UID in card: `29a64abd-d02c-44bc-8d5c-47df58a7ab14`
- These are different — thread UID is correctly stored/used
- pending_approvals table has NO `lead_uid` column — fix was to ensure thread_uid uses actual thread UID (not lead UID)
- pending_approvals row cleaned up post-approval (normal lifecycle behavior)

### Fix 3 (Delivering→Done status log) — NOT MET (architecture gap)

- `Delivering → Done` entry NOT in task_status_log
- Harness code EXISTS at opencode-harness.mts line 512-519
- Gated behind `EMPLOYEE_PHASE=delivery` env var (PLAT-05 future work)
- Current inline delivery in lifecycle does NOT call logStatusTransition for Done
- Missing entries in status log: Executing→Submitting, Delivering→Done
- This is expected behavior until PLAT-05 delivery machine is implemented
- NOT a regression — code is in place for future

### Fix 4 (named tunnel) — PASS

- https://postgrest-ai-employee.dozaldevs.com/rest/v1/ → HTTP 401 ✓
- Named tunnel stable throughout E2E test

### pending_approvals Schema

- Columns: id, tenant_id, thread_uid, task_id, slack_ts, channel_id, created_at, guest_name, property_name, reminder_sent_at, urgency
- NO lead_uid column

### Services startup

- pnpm dev started successfully (gateway was not running at test start)
- Gateway starts on port 7700, Inngest on 8288
- ai-dev tmux session created for test duration

## F2 Code Quality Review Complete (2026-05-12)

### Result: APPROVE

- Build: PASS
- Lint: PASS (0 errors after prefer-const fix in test file)
- 12 files reviewed: all CLEAN
- 1 fix applied: `tests/workers/opencode-harness-status-log.test.ts` — `let sourceCode` → `const sourceCode`
- Evidence: `.sisyphus/evidence/e2e-scenario-a/f2-code-quality-review.md`

### Final Wave Status

- F1 (Plan Compliance): APPROVE — `final-f1-plan-compliance-audit.md`
- F2 (Code Quality): APPROVE — `e2e-scenario-a/f2-code-quality-review.md`
- F3 (Manual QA): APPROVE — `f3-real-manual-qa.txt`
- F4 (Scope Fidelity): evidence at `f4-scope-fidelity.txt`
